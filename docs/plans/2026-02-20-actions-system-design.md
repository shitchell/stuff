# Actions System Integration — Design

## Problem

Unturned items can define context-menu Actions that reference blueprints on other items. For example, a Potato has a "Craft_Seed" action that points to Seed_Potato's blueprint. These cross-item recipe relationships are invisible to both the catalog and crafting pages — they're not exported at all.

175+ items use Actions (46 vanilla, 129 A6 Polaris). Without them, the crafting graph is missing seed crafting, stacking/unstacking, multi-step upgrade paths, and mod-specific salvage/repair recipes.

## Solution

Two-layer approach:
1. **Python exporter:** Parse `Action_N_*` fields from .dat files into a structured `Action` model on `BundleEntry`. Export them as raw data — no resolution, no following chains.
2. **JS (common.js):** Add `resolveActions()` that follows the Action → Source Item → Blueprint chain at graph-build time. Crafting graph builder creates edges from resolved actions with distinct styling.

### Design philosophy

The export stays a faithful representation of the game data. Interpretation and cross-referencing happen in the JS layer.

## Data Model (Python)

New `Action` model in `models.py`:

```python
class Action(BaseModel):
    type: str = ""              # Always "Blueprint" in current data
    source: str = ""            # Numeric item ID of referenced item
    blueprint_indices: list[int] = []  # Which blueprint(s) on the source item
    key: str = ""               # Context label: Salvage, Craft_Seed, Repair, etc.
    text: str = ""              # Custom display text (optional)
    tooltip: str = ""           # Custom tooltip (optional)
```

`BundleEntry` gets `actions: list[Action] = []`.

Exported JSON example (Potato):
```json
"actions": [
  {"type": "Blueprint", "source": "343", "blueprint_indices": [0],
   "key": "Craft_Seed", "text": "", "tooltip": ""}
]
```

### .dat field schema

```
Actions N
Action_N_Type Blueprint
Action_N_Source <numeric_item_id>
Action_N_Blueprints M
Action_N_Blueprint_J_Index <blueprint_index>
Action_N_Key <action_key>           (optional)
Action_N_Text <display_text>        (optional)
Action_N_Tooltip <tooltip_text>     (optional)
```

Action key values observed: `Salvage` (most common in mods), `Craft_Seed`, `Repair`, `Unstack`, `Stack`, `Craft_Rag`, `Craft_Dressing`, `Craft_Bandage`.

## JS Resolution (common.js)

New function `resolveActions(entry, entryByGuid, guidIndex)`:

1. For each action on the entry, resolve `action.source` (numeric ID) to a GUID via `guidIndex.by_id`
2. Look up the source entry in `entryByGuid`
3. Pull the blueprint(s) at the specified indices
4. Return resolved action-recipes:

```js
[{
  actionKey: "Craft_Seed",
  text: "",
  tooltip: "",
  sourceGuid: "abc123...",
  blueprint: { inputs: [...], outputs: [...], name: "Craft", ... }
}]
```

Self-references (source ID == own ID) handled naturally.

## Crafting Graph Integration (crafting.js)

In `buildCraftingGraph`, after processing direct blueprints, call `resolveActions` and create edges:

- **Edge type:** `action.key.toLowerCase()` (e.g., `"salvage"`, `"craft_seed"`), falling back to blueprint's own type if no key
- **Edge styling:** Distinct from direct blueprint edges — [TBD: finalize after Plan B tooltip rework lands]
- **Blueprint ID prefix:** `action-{bpPrefix}-{counter}` to distinguish from direct edges

## Catalog/Hover Card Display

- Hover cards show action-sourced recipes with the action key as the type label
- [TBD: exact rendering depends on Plan B's tooltip changes]

## Dependencies (Plans A & B must land first)

1. **Plan A Task 1** — Legacy blueprint `Output_` fix: action-referenced blueprints use legacy format, outputs will be wrong without this
2. **Plan A Task 2** — Tool→Salvage reclassification: affects how action-referenced Tool blueprints are typed
3. **Plan A Tasks 3-4** — `kind` field + tag indexing: could annotate action sources in the UI
4. **Plan B Tasks 1-2** — Tooltip filtering + dedup: the hover card rendering that Plan C extends

## Gaps to resolve after Plans A & B

- Edge styling specifics (colors, dashed lines) — depends on Plan B's visual changes
- Hover card rendering format — depends on Plan B's tooltip rework
- Whether `Action_N_Text`/`Action_N_Tooltip` should override default display text in the hover card

## Scope

- **Python:** ~30 lines — `Action` model + parser in `models.py`, add `actions` field to `BundleEntry`
- **JS common.js:** ~40 lines — `resolveActions()` function
- **JS crafting.js:** ~20 lines — call `resolveActions` in `buildCraftingGraph`, create edges
- **JS crafting.js:** ~10 lines — tooltip/hover card updates for action-sourced recipes
