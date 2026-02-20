# Catalog Custom Tables Design

## Goal

Replace the catalog's fixed category-based tables with user-configurable table definitions backed by filter expressions. Ship sensible presets, let users customize everything.

## Architecture

Tables are named filter definitions. Each table has a label, filter conditions (AND + OR groups), visibility toggle, and per-table column configuration. The sidebar manages table definitions; inline controls on each table manage columns.

## Data Model

### Table Definition

```
{
  label: string,
  anyConditions: [{ field, operator, value }],   // OR'd together
  allConditions: [{ field, operator, value }],   // AND'd together
  visible: boolean                                // shown on All view
}
```

Filter logic: `(any1 || any2 || ...) && (all1 && all2 && ...)`

If `anyConditions` is empty, treat as "matches everything" (only allConditions apply). If `allConditions` is empty, only anyConditions apply. If both empty, matches all entries.

### Operators

- `=`, `!=` (exact match for discrete values, substring for text)
- `>`, `<`, `>=`, `<=` (numeric comparison)
- `contains` (substring match)

### Column Configuration

Per-table, stored by table label. If no custom config exists, auto-detect: show "important" columns where at least one item in the filtered results has a value for that column.

### localStorage Structure

```
ut:catalog:tables = [
  { label: "Weapons", anyConditions: [...], allConditions: [...], visible: true },
  { label: "My Custom", anyConditions: [...], allConditions: [...], visible: true }
]
ut:catalog:columns:Weapons = ["name", "damage.player_damage", "range", ...]
ut:catalog:columns:My Custom = [...]
```

Presets are defined in code. If a user's localStorage has a table with a label matching a preset, the user's version takes priority. Presets not overridden by the user are included automatically.

## Preset Tables

| Label | Conditions (Any) |
|---|---|
| Weapons | Type = Gun, Type = Melee, Type = Throwable |
| Clothing | Type = Shirt, Type = Pants, Type = Hat, Type = Vest, Type = Backpack, Type = Mask, Type = Glasses |
| Consumables | Type = Food, Type = Water, Type = Medical |
| Building | Type = Barricade, Type = Structure, Type = Storage |
| Vehicles | Type = Vehicle |
| Resources | Type = Resource, Type = Supply |
| Spawn Tables | Type = Spawn |
| Skins | Type = Skin |

(Exact list TBD after reviewing all 63 types — goal is ~8-10 presets covering most entries, plus an "Other" catch-all or unfiltered "All" tab.)

## UI Components

### Tabs Bar

- One tab per table definition (presets + custom)
- "All" tab shows all visible tables stacked
- Clicking a table's tab shows just that table
- Tab order matches sidebar order

### Sidebar — Table List

Replaces current "Visible Tables" checkboxes. Each row:
- Drag handle (reorder)
- Visibility checkbox (shown/hidden on All view)
- Label text
- Gear icon (opens edit modal)

"+ Add Table" button at bottom opens the query builder modal for a new definition.

Hiding (unchecking) a table removes it from the All view but keeps the tab. The definition persists in localStorage. Can re-check to restore without recreating.

### Query Builder Modal

Opens for creating or editing a table definition.

- **Label** text input
- **"Any of these" section** (OR group):
  - List of condition rows
  - Each row: `[field dropdown] [operator dropdown] [value input] [x remove]`
  - "+ Add condition" button
- **"All of these" section** (AND group):
  - Same structure as above
- **Save / Cancel** buttons

Field dropdown: populated from all known fields across entries (top-level + parsed nested fields).

Value input: for fields with known discrete values (like Type with 63 known values), render as a dropdown/autocomplete. For numeric or free-text fields, render as a text input.

### Inline Column Controls (per table)

Each table's header row is its own column editor:
- **Drag handles** on column headers to reorder
- **"x" on hover** over a column header to remove it
- **"+" button** at the end of the header row to add a column (dropdown of available fields)
- Changes are scoped to that specific table regardless of whether you're on the All view or the table's dedicated tab
- Changes saved to `ut:catalog:columns:<label>` in localStorage

### "Important" Columns (auto-detect default)

A global list of columns considered important. When a table has no custom column config, show important columns where at least one filtered item has a non-empty value.

Candidate important columns: name, type, rarity, description, size, player_damage, zombie_damage, range, firerate, health, food, water, armor, storage capacity, speed.

## Interactions

1. **First visit**: Presets loaded, All view shows all preset tables stacked with auto-detected columns
2. **Click a tab**: Shows just that table
3. **Edit a table (gear icon)**: Opens query builder modal, save updates localStorage
4. **Add a table**: Opens empty query builder modal, new definition appended to list
5. **Reorder tables**: Drag in sidebar, order persists to localStorage, tabs reorder to match
6. **Hide a table**: Uncheck in sidebar, removed from All view, tab remains
7. **Edit columns inline**: Drag/remove/add columns directly on the table header, saved per-table
8. **Reset**: Could offer a "reset to defaults" that clears localStorage table/column overrides

## Decisions

- **AND/OR model**: `(any1 || any2 || ...) && (all1 && all2 && ...)` — simple, covers most use cases without nested boolean logic
  - Rationale: Full boolean trees are overkill for item filtering and make the UI intimidating. The two-group model handles "show me guns OR melee that are ALSO rare" naturally.
- **Inline column editing instead of sidebar column editor**: Each table owns its columns at the header level
  - Rationale: Avoids ambiguity about which table's columns you're editing in All view. Direct manipulation is more intuitive.
- **Presets can be edited**: User modifications override presets by label match
  - Rationale: Presets are suggestions, not constraints. Power users should be able to tweak everything.
- **Hiding != deleting**: Unchecking visibility keeps the definition and tab
  - Rationale: Rebuilding a filter from scratch is annoying. Hide/show is cheap.
