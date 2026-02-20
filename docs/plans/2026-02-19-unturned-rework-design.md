# Unturned Pages Rework — Design Document

## Overview

Rework the Unturned web pages (Catalog + Crafting) to consume the new Schema C lossless export format from `unturned-data`. The new format provides structured JSON organized by origin (base game + per-map), with full `.dat`/`.asset` captures, GUID-indexed cross-references, and per-entry blueprint data.

## Directory Structure

```
site/unturned/
  index.html                    # Landing page (links to Catalog + Crafting)
  css/
    common.css                  # Shared CSS variables, reset, dark theme, component styles
  js/
    common.js                   # Data loading, GUID resolution, column system, filter engine
  data/                         # Export tree copied as-is from unturned-data
    manifest.json
    guid_index.json
    base/
      entries.json
      assets.json
    maps/
      pei/map.json
      a6_polaris/
        entries.json
        assets.json
        map.json
      ...
  catalog/                      # Data browser (all entry types)
    index.html
    catalog.js
    mockup.html                 # Layout prototype (can be deleted after implementation)
  crafting/
    index.html
    crafting.js
```

## Data Loading Strategy

**Lazy hybrid** — fetch essentials eagerly, load per-map data on demand.

1. **Eager**: `manifest.json`, `guid_index.json`, `base/entries.json`
2. **Lazy**: `maps/*/map.json` loaded on first map filter selection. `maps/*/entries.json` and `maps/*/assets.json` only for maps with `has_custom_entries: true`
3. Cache fetched files in memory. Cache-bust with `?v=<generated_at>` from manifest.

## Catalog Page

### Two Modes

**Overview mode** (`#` or no hash): All level-1 categories (Items, Vehicles, Animals, Spawns, etc.) displayed as separate collapsible table sections. Each section:
- Uses its own column config (from TYPE_FIELD_DEFS)
- Has independent sort and filter state
- Scrollable table body (max-height constrained)
- Collapsible (click header to toggle, state persisted to localStorage)
- "Open ->" link to drill into focused mode

Sidebar checkboxes toggle table visibility (persisted to localStorage).

**Focused mode** (`#Items/Guns`, `#Items/Outfits/PirateCaptain`, etc.): Single table showing all entries recursively under the current path. Subcategory chips above the table for drilling deeper. Breadcrumb navigation to go back up.

### Tab Bar

- "All" tab returns to overview mode
- One tab per level-1 category for quick focused navigation
- Active tab highlighted with gold accent

### Column System

**Hierarchical with inheritance:**
- Default column configs defined per category path in `TYPE_FIELD_DEFS` (shared in `common.js`)
- Inheritance: walk up the path hierarchy until a config is found. `Items/Outfits/PirateCaptain` -> `Items/Outfits` -> `Items` -> root
- User overrides stored in localStorage per path key, take priority over defaults

**Sidebar column editor:**
- Ordered list with drag-to-reorder handles
- `-` button to remove a column
- `+ Add column` button opens autocomplete search input
- In overview mode, a dropdown selects which table's columns are being edited
- ID column defaults to leftmost position, minimum width

**Column definition variants:**
```js
{ key: "parsed.consumable.food", label: "Food" }           // simple field lookup
{ compute: (entry) => ..., label: "Food/SU" }              // developer-defined computed
{ expr: "Food / Water", label: "Food/Water Ratio" }        // user-defined expression (future)
```

All three go through `resolveColumnValue(entry, colDef)` — same rendering/sorting/filtering pipeline.

### Table Features

- Sortable columns (click header to toggle asc/desc) — per-table sort state
- **Column filter row** below headers: numeric operators (`>30`, `<100`, `>=`, `<=`, `!=`, `=`), text substring match for text columns
- Global search bar filters across name/type/ID
- Left-aligned columns throughout

### Map Filtering

- Sidebar map filter with checkboxes (populated from `manifest.json`)
- When a map is selected, entries filtered to those in `spawn_resolution.spawnable_item_ids` OR originating from that map's `entries.json`
- "All Maps" shows everything

### Future Design Hooks

These are not implemented in the initial rework but the architecture supports them:

- **Item hover card**: Table rows carry entry GUID in a data attribute. Shared `showItemCard(guid, anchorEl)` in `common.js` renders a positioned popover with entry details + "Open in Crafting" link. Card component defined in `common.css`/`common.js` for reuse by crafting tooltips.

- **Filter UX iteration**: Filter row inputs are a starting point. Architecture supports swapping in richer widgets (dropdowns for enums like rarity, range sliders for numeric) per-column without changing the filter engine — just add new op types to `parseFilter()`/`matchesFilter()`.

- **Autocomplete improvements**: `+ Add column` autocomplete can be enhanced with keyboard nav, grouping by category (`parsed.damage.*`, `parsed.consumable.*`), and showing which columns have non-null data for the current view.

- **User-defined computed columns**: Users define expressions via the column editor ("Custom expression..." option). Expression parser resolves column labels to keys, evaluates basic math (`+`, `-`, `*`, `/`, parentheses). Stored in localStorage alongside column overrides, same inheritance rules.

## Crafting Page

### Data Layer Swap

Replace pre-built `crafting.json` with runtime graph construction:

1. Load `base/entries.json` (+ map entries) via `common.js` data loader
2. Load `guid_index.json` for resolving blueprint references
3. Build the graph at runtime from `entries[].blueprints`:
   - Each entry with blueprints becomes a node (`id=guid`, `name`, `type`, `rarity`, `category`)
   - Each blueprint generates edges:
     - **Craft**: inputs -> outputs
     - **Repair**: inputs -> owning item
     - **Salvage**: owning item -> outputs
   - `"this"` resolves to the owning entry's GUID
   - `"GUID x N"` parsed to node reference + quantity
   - Tool inputs (`{"ID": "...", "Amount": N, "Delete": false}`) get `tool: true` on edge
   - `workstation_tags` resolved to names via guid_index/assets.json
   - Legacy numeric IDs resolved via `guid_index.by_id`
4. Graph builder lives in `common.js` — `buildCraftingGraph(entries, guidIndex, assets)` returns `{ nodes, edges, blueprintGroups, craftingCategories }`

### Crafting Categories

Blueprint `category_tag` GUIDs resolved to crafting category asset names from `assets.json` (e.g. "Cooking", "Metalwork", "Ammunition"). Attached to edges at graph-build time. Sidebar category filter populated from actual resolved categories instead of current "All"/"Uncategorized" placeholder.

### Map-Aware Crafting

- Each map's `crafting_blacklists` filters valid blueprints
- `allow_core_blueprints: false` disables all base game recipes — only map's own apply
- `blocked_input_guids` / `blocked_output_guids` remove specific recipes
- Map filter dropdown recomputes visible graph

### Preserved Features

All existing functionality carries over:
- Graph mode (full network, Cytoscape.js)
- Diagram mode (per-item crafting tree)
- Recipe disambiguation (ghost nodes + carousel)
- Primitives analysis (raw materials computation, sticky footer)
- Cycle detection
- Depth limiting (1-5 or unlimited)
- Favorites/starred items
- Visual customization (node shapes, rarity colors/glow, edge colors)
- Settings persistence (localStorage)

### Changes Beyond Data Loading

- **Workstation resolution**: GUIDs resolved to actual asset names at graph-build time (more accurate than old baked-in names)
- **Richer tooltips**: Hover cards pull from full entry data (description, parsed stats via `TYPE_FIELD_DEFS`) instead of just name/type/rarity
- **Cross-page linking**: "Open in Crafting" from catalog hover card -> `../crafting/#diagram/<guid>`. Crafting item list links -> `../catalog/#<category/path>`

### URL Scheme

- `#graph` — full network view (default)
- `#diagram/<guid>` — diagram view for specific item
- `#diagram/<guid>/<recipe-index>` — diagram with specific recipe in carousel

## Shared Infrastructure (`common.js` + `common.css`)

### `common.css`

**CSS custom properties** — single source for entire theme:
```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #141428;
  --bg-surface: #16213e;
  --bg-hover: #1c2844;
  --bg-header: #0f0f23;
  --border: #2a2a4a;
  --border-subtle: #1e1e3a;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --text-muted: #555;
  --text-dim: #444;
  --accent: #ffd700;
  --accent-dim: #b8960a;
  --accent-bg: #4a4a00;
  --link: #6db3f2;
  --rarity-common: #b0b0b0;
  --rarity-uncommon: #6bc74f;
  --rarity-rare: #4fa7e3;
  --rarity-epic: #c35de3;
  --rarity-legendary: #ffd700;
  --rarity-mythical: #e34f4f;
  --font-family: 'Segoe UI', system-ui, sans-serif;
  --font-sm: 0.75rem;
  --font-base: 0.85rem;
  --font-lg: 1rem;
  --radius: 4px;
  --radius-lg: 6px;
}
```

**Shared component styles:**
- `.topbar`, `.breadcrumb` — sticky header
- `.sidebar`, `.section`, `.filter-group` — config panel
- `table`, `thead`, `tbody`, `.filter-row`, `.col-filter` — table + filters
- `.rarity-*` — rarity color classes
- `.subcat-chip` — category navigation
- `.item-card` — hover card popover (future)
- `.col-list`, `.col-item`, `.add-col-btn`, `.autocomplete-list` — column editor

### `common.js`

**Data loader:**
```
dataLoader.init(basePath)
dataLoader.getManifest()            // eager, cached
dataLoader.getGuidIndex()           // eager, cached
dataLoader.getBaseEntries()         // eager, cached
dataLoader.getBaseAssets()          // lazy, cached
dataLoader.getMapData(safeName)     // lazy, returns { map, entries?, assets? }
dataLoader.resolveGuid(guid)        // name from guid_index
dataLoader.resolveId(numericId)     // by_id -> guid -> name
```

**Type field definitions** (single source of truth):
```
TYPE_FIELD_DEFS = { Gun: [...], Food: [...], Vehicle: [...], ... }
```

Consumers:
- Catalog: default columns for each category
- Crafting: tooltip content for hover cards
- Item hover card: relevant stats display

**Column system:**
```
getColumnsForPath(path, overrides, defaults)
resolveColumnValue(entry, colDef)           // handles key / compute / expr
saveColumnOverrides(overrides)
loadColumnOverrides()
```

**Filter engine:**
```
parseFilter(raw)                            // { op, value } or null
matchesFilter(cellValue, filter)            // applies op
applyColFilters(entries, columns, filters)  // filters array
```

**Crafting graph builder:**
```
buildCraftingGraph(entries, guidIndex, assets)
// Returns { nodes, edges, blueprintGroups, craftingCategories }
```

**Map filtering:**
```
getSpawnableIds(mapData)
applyCraftingBlacklists(graph, mapData)
isAvailableOnMap(entry, mapData, guidIndex)
```

**Utilities:**
```
getNestedValue(obj, dotPath)
pathStartsWith(entryPath, prefix)
escapeHtml(str)
debounce(fn, ms)
```

**Item hover card (future):**
```
showItemCard(guid, anchorEl, options)
hideItemCard()
```

### localStorage Key Scheme

| Key | Page | Contents |
|-----|------|----------|
| `ut:catalog:columns` | Catalog | Column overrides by path |
| `ut:catalog:hidden` | Catalog | Hidden table sections |
| `ut:catalog:collapsed` | Catalog | Collapsed section states |
| `ut:crafting:settings` | Crafting | All crafting settings |
| `ut:crafting:favorites` | Crafting | Starred item GUIDs |

### DRY Matrix

| Concern | Location | Consumers |
|---------|----------|-----------|
| Theme colors/spacing | `common.css` vars | Both pages |
| Table/filter/column styles | `common.css` | Both pages |
| Data loading + caching | `common.js` dataLoader | Both pages |
| GUID resolution | `common.js` dataLoader | Both pages |
| Type field definitions | `common.js` TYPE_FIELD_DEFS | Catalog (default cols), Crafting (tooltips), Hover card |
| Column inheritance + resolution | `common.js` column system | Catalog (primary), Crafting (item list) |
| Filter parsing + matching | `common.js` filter engine | Catalog (primary), Crafting (item list) |
| Crafting graph construction | `common.js` graph builder | Crafting (primary), Catalog (hover card blueprint count) |
| Map filtering | `common.js` map utils | Both pages |
| HTML escaping, debounce, etc. | `common.js` utils | Both pages |

## Mockup

A working layout prototype is at `site/unturned/catalog/mockup.html` demonstrating:
- Overview mode with collapsible multi-table sections
- Focused mode with subcategory chip navigation
- Hash-based routing (`#Items/Guns`, `#Vehicles`, etc.)
- Hierarchical column config with inheritance, drag reorder, add/remove
- Column filter row with numeric operators and text search
- Sidebar with table visibility toggles, map filter, column editor
