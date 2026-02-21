# UI Integration — Design (Plan D)

## Problem

Plan C adds comprehensive structured data to the export (typed properties, enriched blueprints with conditions/rewards/state_transfer, Actions system). The JS frontend doesn't use any of it yet. Additionally, some data that IS available (skill requirements on edges) is captured but never displayed.

## Solution

Five focused changes across `common.js`, `crafting.js`, and the catalog code to consume the new export data.

### Design Philosophy

> Export stays raw/faithful to game data. Interpretation happens in JS.

Plan D is the interpretation layer. It resolves cross-item Action chains, displays blueprint metadata that was previously hidden, and distinguishes skin-swap recipes from real crafting.

## 1. Actions Resolution (`common.js`)

### What

In `buildCraftingGraph`, after processing an entry's direct blueprints, resolve its `actions` array. Each Action points to a blueprint on another item — these are cross-item recipe links (Craft_Seed, Stack, Unstack, Salvage, etc.).

### How

```js
// For each entry with actions:
for (const action of entry.actions || []) {
    // Resolve action.source (numeric ID) to GUID via guidIndex.by_id
    const sourceGuid = resolveId(action.source, guidIndex);
    if (!sourceGuid) continue;

    const sourceEntry = entryByGuid[sourceGuid];
    if (!sourceEntry) continue;

    // Pull blueprints at specified indices
    for (const idx of action.blueprint_indices) {
        const bp = sourceEntry.blueprints?.[idx];
        if (!bp) continue;

        // Create edges from blueprint inputs/outputs
        // Edge type derived from action.key (e.g., "craft_seed", "salvage")
        // BlueprintId prefixed with "action-" to distinguish from direct edges
    }
}
```

### Edge Behavior

- `edge.type` = `action.key.toLowerCase()` (e.g., `"craft_seed"`, `"stack"`, `"unstack"`)
- Falls back to blueprint's own type if no action key
- `edge.blueprintId` = `"action-{sourceGuid}-{idx}"` to prevent dedup collisions with direct edges
- Edge styling: follows existing pattern (shape/color based on type)

### Scope

- ~40 lines in `buildCraftingGraph`
- New `resolveActions()` helper function
- Self-references (action.source == own ID) handled naturally

## 2. Blueprint Skill & Conditions in Tooltips (`crafting.js`)

### What

`edge.skill` and `edge.skillLevel` are already captured in the graph builder but never displayed in hover card tooltips. Blueprint conditions (holiday gates, flag checks) are new from Plan C.

### How

In `onNodeMouseOver()`, after the workstations line in the recipe rendering:

```js
// Show skill requirement
if (bp.skill) {
    let skillText = bp.skill;
    if (bp.skillLevel > 0) skillText += ` (Level ${bp.skillLevel})`;
    line += `<div class="tt-skill">Skill: ${esc(skillText)}</div>`;
}

// Show conditions (from enriched blueprint data)
if (bp.conditions?.length) {
    const condText = bp.conditions
        .map(c => c.type === 'Holiday' ? c.value : `${c.type}: ${c.value}`)
        .join(', ');
    line += `<div class="tt-condition">Requires: ${esc(condText)}</div>`;
}
```

### Data Flow

- Skill/skillLevel: already on edges from `buildCraftingGraph` → just display them
- Conditions: new field from Plan C enriched blueprints → need to pass through edge creation → display in tooltip

### Scope

- ~15 lines in tooltip rendering
- ~5 lines in edge creation to pass conditions through
- Minor CSS for `.tt-skill` and `.tt-condition` styling

## 3. State_Transfer Display (`common.js` + `crafting.js`)

### What

Blueprints with `state_transfer: true` are skin-swap recipes (base ↔ skinned variant). Currently displayed as regular "Craft" recipes, causing confusing "REAPER Stock → REAPER Stock" tooltips.

### How

- In `buildCraftingGraph`: when a blueprint has `state_transfer === true`, set `edgeType` to `"skin_swap"` instead of the current implicit-output fallback
- In `crafting.js` edge type styling: add `skin_swap` with a distinct shape/color, consistent with the existing pattern for craft/salvage/repair
- In tooltip rendering: show "Skin Swap" as the recipe type label

### Rationale (2026-02-21)

> User preference: display skin-swap recipes differently rather than filtering them out. They're valid game mechanics and should be visible, just not confused with crafting.

### Scope

- ~5 lines in `buildCraftingGraph` (check state_transfer, set type)
- ~3 lines in edge type styling config
- Tooltip rendering already handles type labels generically

## 4. Catalog Properties Integration

### What

Plan C adds `properties: {}` to each entry with type-specific fields (firerate, damage, armor, etc.). The catalog's column auto-detection needs to discover these as available columns.

### How

The catalog already auto-detects columns by scanning visible entries for available fields. Update the column detection to also walk `entry.properties`:

```js
// Current: checks top-level fields
// New: also checks properties.* fields
for (const [key, val] of Object.entries(entry.properties || {})) {
    // Register "properties.firerate" as a column
    // Display label: just "firerate" (strip prefix)
    // Sort/filter: use the nested value
}
```

### Column Display

- Column header: the field name in title case (e.g., "Firerate", "Damage Player")
- Column value: `entry.properties[fieldName]`
- No type-specific logic needed — auto-detection handles it generically

### Scope

- ~10-15 lines in column detection
- ~5 lines in cell rendering to handle the nested access path

## 5. Useable Migration (trivial)

### What

Two references to `entry.raw.Useable` in `common.js` need to change to `entry.useable` once Plan C promotes Useable to a base BundleEntry field and removes `raw` from the default export.

### How

```js
// Before:
useable: entry?.raw?.Useable || '',

// After:
useable: entry?.useable || '',
```

### Scope

- 2 lines in `common.js` (lines 957 and 1051)

## Dependencies

- **Plan C must land first** — all 5 items depend on the enriched export data
- Items 1-3 modify crafting page code (sequential within crafting, but independent of item 4)
- Item 4 modifies catalog code (independent of items 1-3)
- Item 5 is a trivial migration that can happen anytime after Plan C

## Known Bugs (investigate during Plan D)

- **Arrow direction is inverted** — graph edges point the opposite direction from what's intuitive (e.g., ingredient → product should be the arrow direction, but it's reversed). Needs investigation into how Cytoscape edge direction is set in `buildCraftingGraph`.
- **Salvage recipes mislabeled as "Craft"** — many Salvage-type blueprints show up as "Craft" in the graph/tooltip. Likely a bug in the blueprint type mapping or edge type assignment in `buildCraftingGraph`. May be related to Plan A's Tool→Salvage reclassification — investigate whether the fix landed correctly in the JS side.

## Future Work (deferred)

- **Node badges** on crafting graph (skin variant badge, item type icons) — user wants this but needs more UX thought
- **Properties in crafting tooltips** — show damage, range, etc. in hover cards — deferred until user has more usage-driven UX intuition
