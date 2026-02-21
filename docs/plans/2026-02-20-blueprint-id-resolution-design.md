# Blueprint ID Resolution — Design

## Problem

Blueprint `inputs`/`outputs` in the exported JSON contain raw numeric IDs (e.g., `"36033"`, `"36022 x 5"`) instead of GUIDs. The JS crafting graph builder tries to resolve these via `guidIndex.by_id`, but numeric IDs are **not unique** — different asset categories (Items, Objects, Spawns, Vehicles, etc.) reuse the same IDs. This causes incorrect recipe resolution (e.g., "Loaf of Bread" resolving to "Red Scout").

### Root Cause

- `_parse_legacy_blueprints` in `models.py` stores raw numeric IDs from `.dat` files as strings
- No resolution step converts these to GUIDs before JSON export
- `by_id` in `guid_index.json` uses last-write-wins across all types, losing data on collision

### Key Findings from Investigation

- **Numeric IDs are unique within each asset category** (Items, Vehicles, Animals, etc.) but not globally. The official docs confirm: "this id must be unique within each category of assets"
- **Blueprint Supply IDs always reference items.** Official docs: "Legacy ID of an item that is required as a supply." Confirmed empirically: zero cross-category blueprint references across 7,097 entries
- **All entries currently have GUIDs.** Zero GUID-less entries found, but future mods may not guarantee this
- **Empirical testing** (modifying `.dat` files on live server) confirmed: cross-type ID collisions cause subtle bugs (dimension bleed-through), GUID-bearing items take priority in same-type collisions

## Design

### 1. Exporter — Blueprint ID Resolution

Post-processing pass in `export_schema_c()`, after all entries from all sources (base + maps) are parsed, before serialization.

#### Step 1: Ensure all entries have GUIDs

Walk all entries. If any lacks a GUID, generate a deterministic synthetic one:

```python
synthetic = "00000" + sha256(f"{source}:{type}:{id}").hexdigest()[:27]
```

- `source` = `"base"` or map safe name (e.g., `"a6_polaris"`)
- Deterministic: same input always produces the same synthetic GUID across re-exports
- `00000` prefix makes synthetic GUIDs visually distinct for debugging

#### Step 2: Build item-only ID-to-GUID map

Walk all entries where `source_path.startswith("Items/")`. Build a lookup keyed by `(source, numeric_id) -> guid`.

#### Step 3: Resolve blueprint references

Walk all entries' blueprints. For each input/output string:

- Parse it: `"36033"` -> id=36033, qty=1; `"36022 x 5"` -> id=36022, qty=5
- Look up in the item ID-to-GUID map using resolution priority (see below)
- Replace with GUID format: `"27b44ccf4da14c2987a4b5903557ad78 x 5"`
- `"this"` and existing 32-char hex GUIDs pass through unchanged
- Log a warning for any ID that can't be resolved; keep the raw numeric ID in output

#### Resolution Priority

When resolving a numeric ID in a blueprint:

1. **Same namespace + same source** (e.g., A6 Polaris Items)
2. **Same namespace + any source** (e.g., base game Items)
3. **Any namespace + same source** (with warning)
4. **Any namespace + any source** (with warning)

Steps 3-4 should log warnings since they suggest unexpected cross-category references.

### 2. guid_index.json — Namespace-grouped `by_id`

#### Current format (broken)

```json
{
  "by_id": { "36033": "b79a67e7..." }
}
```

Last-write-wins across all types. Loses data on collision.

#### New format

Namespace-first, then source. Source keys: `"base"` for core game, workshop ID string (e.g., `"2898548949"`) for mods.

```json
{
  "by_id": {
    "36033": {
      "items": { "base": "27b44ccf...", "2898548949": "dfb0c25f..." },
      "spawns": { "base": "def456..." },
      "objects": { "base": "95d1c0f8..." }
    }
  }
}
```

Lookup pattern: `by_id["36033"]?.items?.["2898548949"]` — reads as "item with ID 36033 from workshop mod 2898548949".

Namespace keys derived from top-level source directory:

| Directory | Key |
|-----------|-----|
| `Items/` | `items` |
| `Vehicles/` | `vehicles` |
| `Objects/` | `objects` |
| `Spawns/` | `spawns` |
| `Animals/` | `animals` |
| `Effects/` | `effects` |
| `Trees/` | `resources` |
| `Skins/` | `skins` |
| `Mythics/` | `mythics` |
| `NPCs/` | `npcs` |

Within each namespace, IDs are unique (one GUID per namespace per ID). Only namespaces that actually have that ID get a key.

### 3. JS Cleanup

#### `parseBlueprintRef` in `common.js`

- Remove the numeric ID resolution path
- Replace with a `console.warn` if a numeric ID is encountered: signals the exporter missed something
- GUID strings and `"this"` pass through as before

#### `dataLoader.resolveId` in `common.js`

Update to use namespace+source grouped format:

```js
async resolveId(numericId, namespace = 'items', source = null) {
  const gi = await this.getGuidIndex();
  const nsMap = gi.by_id[String(numericId)]?.[namespace];
  if (!nsMap) return null;
  // If source specified, try that first; otherwise pick first available
  const guid = source ? (nsMap[source] || Object.values(nsMap)[0]) : Object.values(nsMap)[0];
  if (!guid) return null;
  return gi.entries[guid] || null;
}
```

#### Other `by_id` usage

Update any code reading `guidIndex.by_id[id]` (currently expects a string) to use the namespace+source grouped format, e.g. `guidIndex.by_id[id]?.items?.base`.

### 4. Error Handling & Edge Cases

**Unresolvable blueprint IDs**: Log a warning, keep the raw numeric ID in output. The JS `console.warn` catches these on the frontend.

**ID 0 entries**: 258+ cosmetic items share ID 0 but never appear in blueprints. Skip ID 0 when building the item ID-to-GUID map.

**Cross-source blueprint references**: A6 Polaris items reference base game items by ID (e.g., Metal Scrap). Handled by resolution priority: same-source first, then base game.

**Synthetic GUIDs**: Only generated if an entry lacks a GUID. Currently zero cases exist, but this future-proofs against mods that omit GUIDs. The `00000` prefix makes them identifiable.
