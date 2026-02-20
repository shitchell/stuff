# Unturned Pages Rework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the Catalog and Crafting pages to consume the new Schema C export format, with shared infrastructure for data loading, column management, filtering, and crafting graph construction.

**Architecture:** Shared `common.js` and `common.css` provide data loading (lazy hybrid), GUID resolution, column inheritance system, filter engine, and crafting graph builder. The Catalog page builds a filesystem-style category browser with overview/focused modes. The Crafting page swaps its data layer to build graphs from entry blueprints at runtime.

**Tech Stack:** Vanilla JS (ES6+), CSS custom properties, Cytoscape.js (crafting only), no build step.

**Design doc:** `docs/plans/2026-02-19-unturned-rework-design.md`
**Mockup:** `site/unturned/catalog/mockup.html` (reference for layout/behavior)

---

## Task 1: Copy Export Data and Set Up Directory Structure

**Files:**
- Create: `site/unturned/css/common.css` (empty placeholder)
- Create: `site/unturned/js/common.js` (empty placeholder)
- Copy: export data from `~/code/git/github.com/shitchell/unturned-data/unturned_data/export/` to `site/unturned/data/`
- Delete: `site/unturned/catalog/data.json` (old format, replaced by data/)
- Delete: `site/unturned/crafting/crafting.json` (old format, replaced by data/)

**Step 1: Create directories and copy data**

```bash
mkdir -p site/unturned/css site/unturned/js
cp -r ~/code/git/github.com/shitchell/unturned-data/unturned_data/export/* site/unturned/data/
```

Verify: `ls site/unturned/data/` shows `manifest.json`, `guid_index.json`, `base/`, `maps/`.

**Step 2: Create placeholder files**

Create `site/unturned/css/common.css` with just a comment:
```css
/* Unturned shared styles — common.css */
```

Create `site/unturned/js/common.js` with just a comment:
```js
// Unturned shared logic — common.js
```

**Step 3: Remove old data files**

```bash
rm site/unturned/catalog/data.json
rm site/unturned/crafting/crafting.json
```

**Step 4: Commit**

```bash
git add site/unturned/css/ site/unturned/js/ site/unturned/data/
git rm site/unturned/catalog/data.json site/unturned/crafting/crafting.json
git commit -m "chore(unturned): add Schema C export data and scaffolding

Replace old data.json and crafting.json with the new multi-file
Schema C export under data/. Create empty common.css and common.js
placeholders."
```

---

## Task 2: Implement `common.css`

**Files:**
- Modify: `site/unturned/css/common.css`

**Reference:** Design doc "Shared Infrastructure" section for CSS variable list. Mockup `site/unturned/catalog/mockup.html` for component styles.

**Step 1: Write CSS custom properties**

All theme colors, spacing, typography, and border radius as CSS variables under `:root`. See design doc for the full list. Include:
- `--bg-primary`, `--bg-secondary`, `--bg-surface`, `--bg-hover`, `--bg-header`
- `--border`, `--border-subtle`
- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-dim`
- `--accent`, `--accent-dim`, `--accent-bg`, `--link`
- `--rarity-common` through `--rarity-mythical`
- `--font-family`, `--font-sm`, `--font-base`, `--font-lg`
- `--radius`, `--radius-lg`

**Step 2: Write base reset and body styles**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-family);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
```

**Step 3: Write shared component styles**

Extract and adapt from mockup.html, replacing all hardcoded hex values with CSS vars:

- `.topbar` — sticky header bar with breadcrumb, search, gear button
- `.breadcrumb` — path links with separators
- `.search-box` — search input styling
- `.gear-btn` — settings toggle button
- `.sidebar` — config panel (`.section`, `.filter-group`, `h3` headers, checkbox labels)
- `.outer-layout` — flexbox: sidebar | right-panel
- `.right-panel` — flexbox column: tabs + content
- `.tabs`, `.tab` — tab bar with active state
- `.content` — main content area
- `.subcat-chip` — category navigation chips
- `.result-info` — entry count text
- `table`, `thead th`, `tbody tr`, `td` — table styling
- `.filter-row`, `.col-filter` — column filter inputs
- `.id-cell`, `.id-col` — minimum-width ID column
- `.name-cell`, `.type-cell`, `.num-cell` — cell type styling
- `.rarity-Common` through `.rarity-Mythical` — rarity text colors using vars
- `.table-section`, `.table-section-header`, `.table-section-body` — overview mode sections
- `.table-wrap` — scrollable table container
- `.col-list`, `.col-item`, `.drag-handle`, `.remove-btn` — column editor list
- `.add-col-btn`, `.add-col-input-wrap`, `.autocomplete-list`, `.autocomplete-item` — add column UI
- `.col-path-hint`, `.col-target-select` — column config hints

**Step 4: Verify in browser**

Open `site/unturned/catalog/mockup.html`, change its `<style>` to `<link rel="stylesheet" href="../css/common.css">` temporarily, verify it looks the same.

**Step 5: Commit**

```bash
git add site/unturned/css/common.css
git commit -m "feat(unturned): implement shared common.css with CSS variables

All theme colors, typography, and shared component styles extracted
from mockup into reusable stylesheet with CSS custom properties."
```

---

## Task 3: Implement `common.js` — Utilities and Data Loader

**Files:**
- Modify: `site/unturned/js/common.js`

**Step 1: Write utility functions**

```js
function getNestedValue(obj, dotPath) { ... }
function pathStartsWith(entryPath, prefix) { ... }
function escapeHtml(str) { ... }
function debounce(fn, ms) { ... }
```

Copy `getNestedValue`, `pathStartsWith` from mockup. Add `escapeHtml` (escape `& < > "`). Add `debounce` (standard implementation).

**Step 2: Write data loader**

```js
const dataLoader = {
  _basePath: '../data',
  _cache: {},
  _manifest: null,
  _guidIndex: null,

  init(basePath) { this._basePath = basePath; },

  async _fetch(relPath) {
    if (this._cache[relPath]) return this._cache[relPath];
    const bust = this._manifest ? `?v=${this._manifest.generated_at}` : '';
    const resp = await fetch(`${this._basePath}/${relPath}${bust}`);
    if (!resp.ok) throw new Error(`Failed to load ${relPath}: ${resp.status}`);
    const data = await resp.json();
    this._cache[relPath] = data;
    return data;
  },

  async getManifest() {
    if (!this._manifest) {
      const resp = await fetch(`${this._basePath}/manifest.json`);
      if (!resp.ok) throw new Error(`Failed to load manifest: ${resp.status}`);
      this._manifest = await resp.json();
    }
    return this._manifest;
  },

  async getGuidIndex() {
    if (!this._guidIndex) {
      this._guidIndex = await this._fetch('guid_index.json');
    }
    return this._guidIndex;
  },

  async getBaseEntries() { return this._fetch('base/entries.json'); },
  async getBaseAssets() { return this._fetch('base/assets.json'); },

  async getMapData(safeName) {
    const manifest = await this.getManifest();
    const mapInfo = manifest.maps[safeName];
    if (!mapInfo) return null;
    const result = { map: await this._fetch(mapInfo.map_file) };
    if (mapInfo.entries_file) result.entries = await this._fetch(mapInfo.entries_file);
    if (mapInfo.assets_file) result.assets = await this._fetch(mapInfo.assets_file);
    return result;
  },

  async resolveGuid(guid) {
    const gi = await this.getGuidIndex();
    const entry = gi.entries[guid];
    return entry ? entry.name : `[${guid.substring(0, 8)}]`;
  },

  async resolveId(numericId) {
    const gi = await this.getGuidIndex();
    const guid = gi.by_id[String(numericId)];
    if (!guid) return null;
    return gi.entries[guid] || null;
  },
};
```

**Step 3: Verify data loader**

Open browser console on any page under `site/unturned/`, run:
```js
const s = document.createElement('script');
s.src = '../js/common.js';
document.head.appendChild(s);
// After load:
dataLoader.getManifest().then(m => console.log('Maps:', Object.keys(m.maps)));
dataLoader.getBaseEntries().then(e => console.log('Base entries:', e.length));
```

**Step 4: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "feat(unturned): implement common.js utilities and data loader

Includes getNestedValue, pathStartsWith, escapeHtml, debounce,
and lazy-hybrid dataLoader with caching and cache-busting."
```

---

## Task 4: Implement `common.js` — Type Field Definitions and Column System

**Files:**
- Modify: `site/unturned/js/common.js`

**Reference:** The actual export data at `site/unturned/data/base/entries.json` for accurate field paths. Run the following to see all parsed keys per type:

```bash
python3 -c "
import json
with open('site/unturned/data/base/entries.json') as f:
    entries = json.load(f)
from collections import defaultdict
keys_by_type = defaultdict(set)
for e in entries:
    for k in e.get('parsed', {}):
        keys_by_type[e['type']].add(k)
for t in sorted(keys_by_type):
    print(f'{t}: {sorted(keys_by_type[t])}')
"
```

**Step 1: Write TYPE_FIELD_DEFS**

Single source of truth. Each entry is `{ key, label }`. Populate for all types that have `parsed` fields. Example:

```js
const TYPE_FIELD_DEFS = {
  Gun: [
    { key: 'parsed.slot', label: 'Slot' },
    { key: 'parsed.range', label: 'Range' },
    { key: 'parsed.firerate', label: 'Firerate' },
    { key: 'parsed.damage.player', label: 'Player Dmg' },
    { key: 'parsed.damage.zombie', label: 'Zombie Dmg' },
    { key: 'parsed.ammo_max', label: 'Ammo' },
    { key: 'parsed.durability', label: 'Durability' },
  ],
  Melee: [ ... ],
  Food: [
    { key: 'parsed.consumable.food', label: 'Food' },
    { key: 'parsed.consumable.water', label: 'Water' },
    { key: 'parsed.consumable.health', label: 'Health' },
    { key: 'parsed.consumable.virus', label: 'Virus' },
  ],
  // ... all types with parsed fields
};
```

Also define `BASE_FIELDS` — the minimal columns always present:
```js
const BASE_FIELDS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'rarity', label: 'Rarity' },
];
```

And `ALL_AVAILABLE_COLUMNS` — union of all fields across all types (for autocomplete).

**Step 2: Write DEFAULT_CATEGORY_COLUMNS**

Maps category path keys to their default column lists. Uses `TYPE_FIELD_DEFS` to build these.

```js
// Root: just base fields
// "Items": base fields (mixed types)
// "Items/Guns": ID + Name + Rarity + Gun fields
// "Vehicles": ID + Name + Rarity + Vehicle fields
// "Animals": ID + Name + Animal fields
// etc.
```

Write a helper `getDefaultColumnsForCategory(path, entries)` that:
1. Checks `DEFAULT_CATEGORY_COLUMNS` for an explicit mapping
2. Falls back to: look at the types present, if all same type, use `BASE_FIELDS + TYPE_FIELD_DEFS[type]`, otherwise use `BASE_FIELDS`

**Step 3: Write column inheritance system**

```js
function getColumnsForPath(path, overrides) {
  // 1. Check overrides (localStorage), walking up from path to root
  // 2. Check DEFAULT_CATEGORY_COLUMNS, walking up
  // 3. Fall back to getDefaultColumnsForCategory()
  // Returns { columns, fromPath, isOverride }
}

function resolveColumnValue(entry, colDef) {
  // Handles three variants:
  // { key: "..." } -> getNestedValue(entry, key)
  // { compute: fn } -> fn(entry)
  // { expr: "..." } -> (future, return null for now)
  if (colDef.compute) return colDef.compute(entry);
  if (colDef.expr) return null; // future
  return getNestedValue(entry, colDef.key);
}

function loadColumnOverrides() {
  try { return JSON.parse(localStorage.getItem('ut:catalog:columns') || '{}'); }
  catch { return {}; }
}

function saveColumnOverrides(overrides) {
  localStorage.setItem('ut:catalog:columns', JSON.stringify(overrides));
}
```

**Step 4: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "feat(unturned): add TYPE_FIELD_DEFS and column inheritance system

Single source of truth for type-specific fields, used by catalog
for default columns and crafting for tooltips. Column system
supports hierarchical inheritance with localStorage overrides."
```

---

## Task 5: Implement `common.js` — Filter Engine and Map Utilities

**Files:**
- Modify: `site/unturned/js/common.js`

**Step 1: Write filter engine**

```js
function parseFilter(raw) {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(>=|<=|!=|>|<|=)\s*(.+)/);
  if (m) {
    const num = parseFloat(m[2]);
    if (!isNaN(num)) return { op: m[1], value: num };
  }
  const num = parseFloat(s);
  if (!isNaN(num) && s === String(num)) return { op: '=', value: num };
  return { op: '~', value: s.toLowerCase() };
}

function matchesFilter(cellValue, filter) {
  if (!filter) return true;
  if (filter.op === '~') {
    return cellValue != null && String(cellValue).toLowerCase().includes(filter.value);
  }
  const n = typeof cellValue === 'number' ? cellValue : parseFloat(cellValue);
  if (isNaN(n)) return false;
  switch (filter.op) {
    case '>':  return n > filter.value;
    case '<':  return n < filter.value;
    case '>=': return n >= filter.value;
    case '<=': return n <= filter.value;
    case '!=': return n !== filter.value;
    case '=':  return n === filter.value;
  }
  return true;
}

function applyColFilters(entries, columns, filters) {
  if (!filters) return entries;
  const active = columns
    .map(c => ({ key: c.key, filter: parseFilter(filters[c.key] || '') }))
    .filter(f => f.filter);
  if (active.length === 0) return entries;
  return entries.filter(e =>
    active.every(({ key, filter }) => matchesFilter(resolveColumnValue(e, { key }), filter))
  );
}
```

**Step 2: Write map filtering utilities**

```js
function getSpawnableIds(mapData) {
  if (!mapData?.map?.spawn_resolution) return null;
  return new Set(mapData.map.spawn_resolution.spawnable_item_ids);
}

function isAvailableOnMap(entry, mapData, mapEntryIds) {
  // Entry is available if:
  // 1. Its ID is in the map's spawnable_item_ids, OR
  // 2. It originates from the map's own entries
  const spawnable = getSpawnableIds(mapData);
  if (spawnable && spawnable.has(entry.id)) return true;
  if (mapEntryIds && mapEntryIds.has(entry.id)) return true;
  return false;
}

function applyCraftingBlacklists(graph, mapData) {
  if (!mapData?.map?.crafting_blacklists) return graph;
  const blacklists = mapData.map.crafting_blacklists;
  // If any blacklist has allow_core_blueprints: false, remove all base game edges
  // Then filter by blocked_input_guids / blocked_output_guids
  // Returns filtered { nodes, edges }
  // (detailed implementation in Task 7)
}
```

**Step 3: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "feat(unturned): add filter engine and map filtering utilities

Filter engine supports numeric operators (>, <, >=, <=, !=, =)
and text substring matching. Map utilities handle spawn resolution
and crafting blacklists."
```

---

## Task 6: Implement `common.js` — Crafting Graph Builder

**Files:**
- Modify: `site/unturned/js/common.js`

**Important context:** Blueprint inputs can be:
- `"GUID"` — single item by GUID
- `"GUID x N"` — N of item by GUID
- `"this"` or `"this x N"` — the owning entry
- `{ "ID": "GUID", "Amount": N }` — item (may include `"Delete": false` for tools)
- `{ "ID": "this", ... }` — the owning entry as object form
- `"12345 x 3"` — legacy numeric ID (workshop maps)

Blueprint `category_tag` GUIDs are game-internal assets not in the export. Hardcode the 11 known mappings:

```js
const CRAFTING_CATEGORIES = {
  '31a59b5fec3f4ec5b2887b1ce4acb029': 'Vehicles',
  '71d9e182c18b4aad8e87778e4f621995': 'Structures',
  '732ee6ffeb18418985cf4f9fde33dd11': 'Repair',
  '7ed29f9101ae4523a3b2e389414b7bd9': 'Salvage',
  'ad1804b6945145f3b308738b0b8ea447': 'Weapons & Tools',
  'b0c6cc0a8b4346be89aef697ecdb8e46': 'Furniture',
  'bfac6026305f4737a95fd275ebff65a6': 'Farming & Lighting',
  'cdb2df24b76d4c6e9d8411c940d8337f': 'Materials',
  'd089feb7e43f40c5a7dfcefc36998cfb': 'Food & Medical',
  'd739926736374e5ba34b4ac6ffbb5c8f': 'Ammunition',
  'ebe755533bdd42d1871c3ac66b89530f': 'Clothing',
};
```

**Step 1: Write blueprint input/output parser**

```js
function parseBlueprintRef(ref, ownerGuid, guidIndex) {
  // Returns { guid, quantity, isTool } or null if unresolvable
  if (typeof ref === 'string') {
    // "this x N" or "this"
    if (ref === 'this' || ref.startsWith('this ')) {
      const qty = ref.includes(' x ') ? parseInt(ref.split(' x ')[1]) : 1;
      return { guid: ownerGuid, quantity: qty, isTool: false };
    }
    // "GUID x N" or "GUID"
    const parts = ref.split(' x ');
    let guid = parts[0];
    const qty = parts.length > 1 ? parseInt(parts[1]) : 1;
    // Could be numeric legacy ID
    if (/^\d+$/.test(guid)) {
      const resolved = guidIndex.by_id[guid];
      if (resolved) guid = resolved;
      else return null; // unresolvable
    }
    return { guid, quantity: qty, isTool: false };
  }
  if (typeof ref === 'object' && ref.ID) {
    let guid = ref.ID;
    if (guid === 'this') guid = ownerGuid;
    else if (/^\d+$/.test(guid)) {
      const resolved = guidIndex.by_id[guid];
      if (resolved) guid = resolved;
      else return null;
    }
    const isTool = ref.Delete === false;
    return { guid, quantity: ref.Amount || 1, isTool };
  }
  return null;
}
```

**Step 2: Write graph builder**

```js
function buildCraftingGraph(entries, guidIndex, assets) {
  const nodes = [];       // { id, name, type, rarity, category, maps }
  const edges = [];       // { source, target, type, quantity, tool, workstations, skill, skillLevel, blueprintId, byproduct, craftingCategory }
  const nodeSet = new Set();
  const craftingCategories = new Set();
  let bpCounter = 0;

  // Helper to ensure a node exists
  function ensureNode(guid) {
    if (nodeSet.has(guid)) return true;
    const gi = guidIndex.entries[guid];
    if (!gi) return false;
    // Find the full entry if available (for rarity, category, maps)
    // For now, use what guid_index provides
    nodeSet.add(guid);
    nodes.push({
      id: guid,
      name: gi.name,
      type: gi.type || '',
      rarity: '',    // will be enriched below
      category: [],
      maps: [],
    });
    return true;
  }

  // First pass: build nodes from entries that have blueprints
  // or are referenced by blueprints
  const entryByGuid = {};
  for (const e of entries) {
    entryByGuid[e.guid] = e;
  }

  // Process blueprints
  for (const entry of entries) {
    if (!entry.blueprints || entry.blueprints.length === 0) continue;

    for (const bp of entry.blueprints) {
      // Skip special operations we can't graph
      if (bp.operation === 'FillTargetItem' || bp.operation === 'RepairTargetItem') continue;

      const blueprintId = `bp-${bpCounter++}`;
      const bpType = bp.name.toLowerCase() || 'craft';
      const craftingCategory = CRAFTING_CATEGORIES[bp.category_tag] || '';
      if (craftingCategory) craftingCategories.add(craftingCategory);

      // Determine edge type
      let edgeType = 'craft';
      if (bpType === 'salvage' || bpType === 'unstack') edgeType = 'salvage';
      else if (bpType === 'repair') edgeType = 'repair';
      else if (bpType === 'stack') edgeType = 'craft';

      // Resolve workstation tags
      const workstations = (bp.workstation_tags || []).map(tag => {
        const resolved = guidIndex.entries[tag];
        return resolved ? resolved.name : `[${tag.substring(0, 8)}]`;
      });

      // Parse inputs
      const inputs = (bp.inputs || [])
        .map(ref => parseBlueprintRef(ref, entry.guid, guidIndex))
        .filter(Boolean);

      // Parse outputs
      let outputs = (bp.outputs || [])
        .map(ref => parseBlueprintRef(ref, entry.guid, guidIndex))
        .filter(Boolean);

      // If no explicit outputs, the output is "this" (common for craft/repair)
      if (outputs.length === 0 && edgeType !== 'salvage') {
        outputs = [{ guid: entry.guid, quantity: 1, isTool: false }];
      }

      // Create edges based on type
      if (edgeType === 'salvage') {
        // Salvage: owning item -> outputs
        for (const out of outputs) {
          ensureNode(entry.guid);
          ensureNode(out.guid);
          edges.push({
            source: entry.guid,
            target: out.guid,
            type: 'salvage',
            quantity: out.quantity,
            tool: false,
            workstations,
            skill: bp.skill || '',
            skillLevel: bp.skill_level || 0,
            blueprintId,
            byproduct: false,
            craftingCategory,
          });
        }
      } else {
        // Craft/Repair: inputs -> outputs
        for (const inp of inputs) {
          for (const out of outputs) {
            ensureNode(inp.guid);
            ensureNode(out.guid);
            edges.push({
              source: inp.guid,
              target: out.guid,
              type: edgeType,
              quantity: inp.quantity,
              tool: inp.isTool,
              workstations,
              skill: bp.skill || '',
              skillLevel: bp.skill_level || 0,
              blueprintId,
              byproduct: false,
              craftingCategory,
            });
          }
        }
      }
    }
  }

  // Enrich nodes with full entry data where available
  for (const node of nodes) {
    const entry = entryByGuid[node.id];
    if (entry) {
      node.rarity = entry.rarity || '';
      node.category = entry.category || [];
      node.name = entry.name;
      node.type = entry.type;
    }
  }

  // Build blueprint groups
  const blueprintGroups = {};
  for (const e of edges) {
    if (!blueprintGroups[e.blueprintId]) blueprintGroups[e.blueprintId] = [];
    blueprintGroups[e.blueprintId].push(e);
  }

  return {
    nodes,
    edges,
    blueprintGroups,
    craftingCategories: [...craftingCategories].sort(),
  };
}
```

**Step 3: Verify graph builder**

Open browser console and test:
```js
const entries = await dataLoader.getBaseEntries();
const gi = await dataLoader.getGuidIndex();
const assets = await dataLoader.getBaseAssets();
const graph = buildCraftingGraph(entries, gi, assets);
console.log(`${graph.nodes.length} nodes, ${graph.edges.length} edges`);
console.log('Categories:', graph.craftingCategories);
```

Compare node/edge counts roughly with the old crafting.json to ensure completeness.

**Step 4: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "feat(unturned): implement crafting graph builder in common.js

Builds graph at runtime from entry blueprints + guid_index.
Handles all blueprint input formats (GUID, this, legacy IDs, tools).
Resolves crafting category GUIDs to names using hardcoded mapping
of 11 game-internal category assets."
```

---

## Task 7: Implement Catalog Page — HTML Shell and Core Logic

**Files:**
- Rewrite: `site/unturned/catalog/index.html` (replace old items page)
- Create: `site/unturned/catalog/catalog.js`
- Delete: `site/unturned/catalog/main.js` (old items logic)

**Step 1: Write catalog index.html**

Minimal HTML shell that links to `common.css`, `common.js`, and `catalog.js`. Structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unturned Catalog</title>
  <link rel="stylesheet" href="../css/common.css">
</head>
<body>
  <div class="topbar">
    <div class="breadcrumb">
      <a href="/">stuff</a><span class="sep">/</span>
      <a href="../">Unturned</a><span class="sep">/</span>
      <a href="#" id="breadcrumb-root">Catalog</a>
      <span id="breadcrumb-trail"></span>
    </div>
    <div class="search-box">
      <input type="text" id="search" placeholder="Search...">
    </div>
    <button class="gear-btn" id="gear-btn" title="Settings">&#9881;</button>
  </div>

  <div class="outer-layout">
    <div class="sidebar" id="sidebar">
      <div class="section">
        <h3>Visible Tables</h3>
        <div id="tab-toggles" class="filter-group"></div>
      </div>
      <div class="section">
        <h3>Map Filter</h3>
        <div id="map-filters" class="filter-group"></div>
      </div>
      <div class="section">
        <h3>Columns</h3>
        <div id="col-target-area"></div>
        <div id="col-path-hint" class="col-path-hint"></div>
        <ul class="col-list" id="col-list"></ul>
        <div id="add-col-area"></div>
      </div>
    </div>

    <div class="right-panel">
      <div class="tabs" id="tabs"></div>
      <div class="content" id="content"></div>
    </div>
  </div>

  <script src="../js/common.js"></script>
  <script src="catalog.js"></script>
</body>
</html>
```

**Step 2: Write catalog.js — state and initialization**

```js
// State
let allEntries = [];
let currentPath = [];
let activeTab = null;
let sortState = {};     // pathKey -> { col, dir }
let colFilters = {};    // pathKey -> { colKey: filterString }
let addingColumn = false;
let colEditTarget = null;
let hiddenTables = {};
let collapsedSections = {};
let columnOverrides = loadColumnOverrides();

// Load persisted state
try { hiddenTables = JSON.parse(localStorage.getItem('ut:catalog:hidden') || '{}'); } catch {}
try { collapsedSections = JSON.parse(localStorage.getItem('ut:catalog:collapsed') || '{}'); } catch {}

// Init
async function init() {
  const manifest = await dataLoader.getManifest();
  allEntries = await dataLoader.getBaseEntries();
  // Build map filter checkboxes from manifest
  renderMapFilters(manifest);
  // Parse initial hash and render
  parseHash();
  render();
}

init();
```

**Step 3: Write core rendering functions**

Port from mockup.html, but using `common.js` functions (`getColumnsForPath`, `resolveColumnValue`, `applyColFilters`, `escapeHtml`, etc.):

- `render()` — top-level dispatcher
- `renderTabs()` — tab bar with "All" + level-1 categories
- `renderBreadcrumb()` — path breadcrumb
- `renderOverviewMode()` — multi-table sections
- `renderFocusedMode()` — single table with subcat chips
- `buildTableHTML(entries, columns, sortKey, sortDir, pathKey)` — shared table builder
- `renderColumnConfig()` — sidebar column editor
- `renderCategoryToggles()` — sidebar table visibility checkboxes
- `renderMapFilters(manifest)` — sidebar map filter checkboxes

**Step 4: Write navigation and interaction handlers**

- `navigate(path)` — update state + hash + render
- `doSort(pathKey, colKey)` — toggle sort
- `onColFilter(input)` — update filter state + re-render with focus restore
- `toggleCollapse(catName)` — collapse/expand section
- `toggleTableVisibility(name, visible)` — show/hide table
- `toggleSidebar()` — open/close config panel
- Hash change listener for back/forward nav

**Step 5: Write column editor interactions**

Port from mockup: `startAddColumn`, `cancelAddColumn`, `filterAutocomplete`, `addColumn`, `removeColumn`, drag-and-drop reorder handlers.

**Step 6: Remove old files**

```bash
rm site/unturned/catalog/main.js
```

**Step 7: Verify in browser**

Open `site/unturned/catalog/` in browser. Verify:
- Overview mode shows all categories as collapsible tables
- Clicking a tab switches to focused mode
- Breadcrumb navigation works
- Hash routing works (try `#Items/Guns`, `#Vehicles`)
- Column filters work (type `>30` in a numeric column)
- Sort works
- Sidebar column editor works (add, remove, reorder)
- Category visibility toggles work
- Collapse/expand persists across page reload

**Step 8: Commit**

```bash
git rm site/unturned/catalog/main.js
git add site/unturned/catalog/index.html site/unturned/catalog/catalog.js
git commit -m "feat(unturned): implement new catalog page with Schema C data

Filesystem-style category browser with overview mode (multi-table)
and focused mode (drill-down). Features hierarchical column config
with inheritance, column filters, sortable tables, and hash routing."
```

---

## Task 8: Rework Crafting Page — Data Layer Swap

**Files:**
- Modify: `site/unturned/crafting/index.html` (update script imports)
- Rewrite: `site/unturned/crafting/crafting.js` (swap data layer, keep all features)

This is the largest single task. The approach is to keep the existing crafting.js structure but replace:

1. `loadData()` — use `dataLoader` + `buildCraftingGraph()` instead of fetching `crafting.json`
2. `buildCategoryFilters()` — use `graph.craftingCategories` from the graph builder
3. Constants like `RARITY_COLORS`, `esc()` — use shared versions from `common.js`
4. `LS_PREFIX` — change from `unturned-crafting:` to `ut:crafting:`

**Step 1: Update crafting index.html**

Add `<link rel="stylesheet" href="../css/common.css">` in head (keep existing crafting-specific styles).
Add `<script src="../js/common.js"></script>` before `<script src="crafting.js"></script>`.

**Step 2: Rewrite loadData()**

Replace the old `loadData()` that fetches `crafting.json` with:

```js
async function loadData() {
  const [entries, guidIndex, assets] = await Promise.all([
    dataLoader.getBaseEntries(),
    dataLoader.getGuidIndex(),
    dataLoader.getBaseAssets(),
  ]);

  // Build graph using common.js graph builder
  const graph = buildCraftingGraph(entries, guidIndex, assets);

  // Set state in the format the rest of crafting.js expects
  rawData = { nodes: graph.nodes, edges: graph.edges };
  craftingCategoryList = graph.craftingCategories;

  // Build lookup maps (same as before)
  for (const n of rawData.nodes) nodeMap[n.id] = n;
  for (const e of rawData.edges) {
    if (!edgesByTarget[e.target]) edgesByTarget[e.target] = [];
    edgesByTarget[e.target].push(e);
    if (!edgesBySource[e.source]) edgesBySource[e.source] = [];
    edgesBySource[e.source].push(e);
    if (!blueprintGroups[e.blueprintId]) blueprintGroups[e.blueprintId] = [];
    blueprintGroups[e.blueprintId].push(e);
  }

  // Compute primitive sets (same logic as before)
  // ...
}
```

**Step 3: Update buildCategoryFilters()**

Replace hardcoded "All"/"Uncategorized" with actual crafting categories:

```js
function buildCategoryFilters() {
  // Use craftingCategoryList from graph builder
  // Also keep item-category filters (Animals, Items, Vehicles, etc.)
  // Add crafting categories as a separate filter section
}
```

Add a new sidebar section "Crafting Category" with checkboxes for each resolved category (Weapons & Tools, Furniture, Materials, etc.).

**Step 4: Update map filter to use dataLoader**

Replace hardcoded map list with manifest-driven map discovery:

```js
async function buildMapFilters() {
  const manifest = await dataLoader.getManifest();
  // Build checkboxes from manifest.maps
  // When map selected, load map data and apply crafting blacklists
}
```

**Step 5: Remove duplicated utilities**

Remove from crafting.js any functions now in common.js:
- `esc()` → use `escapeHtml()` from common.js
- Rename remaining uses

Update `LS_PREFIX` to `ut:crafting:`.

**Step 6: Add `craftingCategory` to edge data used by tooltip/legend**

The existing tooltip builder shows recipe type (craft/salvage/repair). Enhance it to also show the crafting category when available:

```js
// In tooltip builder, after showing recipe type:
if (edge.craftingCategory) {
  html += `<div class="tooltip-category">${escapeHtml(edge.craftingCategory)}</div>`;
}
```

**Step 7: Verify in browser**

Open `site/unturned/crafting/` in browser. Verify:
- Graph loads and displays nodes/edges
- Node count and edge count are reasonable (compare with old data)
- Clicking a node opens diagram mode
- Crafting category filter shows real categories
- Tooltip shows crafting category
- All existing features still work: carousel, primitives, favorites, search, depth limit
- Map filter shows maps from manifest
- Settings persist correctly with new localStorage key prefix

**Step 8: Commit**

```bash
git add site/unturned/crafting/index.html site/unturned/crafting/crafting.js
git commit -m "feat(unturned): rework crafting page to use Schema C data

Replace pre-built crafting.json with runtime graph construction via
common.js buildCraftingGraph(). Add real crafting category filters
(Weapons, Furniture, Materials, etc.) resolved from blueprint
category_tag GUIDs. Map filter now manifest-driven."
```

---

## Task 9: Update Landing Page and Cross-Page Links

**Files:**
- Modify: `site/unturned/index.html`
- Modify: `site/unturned/catalog/catalog.js` (add link to crafting in future hover card placeholder)

**Step 1: Update landing page**

Make sure the landing page links and descriptions are accurate for the new pages. The link already points to `catalog/` (from our earlier rename). Update description text if needed.

**Step 2: Verify cross-page navigation**

- Landing page -> Catalog works
- Landing page -> Crafting works
- Catalog breadcrumb -> Unturned landing works
- Crafting breadcrumb -> Unturned landing works

**Step 3: Commit**

```bash
git add site/unturned/index.html
git commit -m "chore(unturned): update landing page for reworked pages"
```

---

## Task 10: Cleanup and Final Verification

**Files:**
- Delete: `site/unturned/catalog/mockup.html` (served its purpose)
- Delete: `site/unturned/crafting/crafting.json` (if not already deleted)

**Step 1: Remove mockup and old files**

```bash
rm site/unturned/catalog/mockup.html
```

**Step 2: Full verification pass**

Open each page and verify:

**Catalog:**
- [ ] Overview mode: all categories visible as tables
- [ ] Each table has correct type-specific columns
- [ ] Collapse/expand works and persists
- [ ] Table visibility toggles work and persist
- [ ] Clicking tab switches to focused mode
- [ ] Focused mode: breadcrumb, subcat chips, recursive entries
- [ ] Hash routing: `#Items/Guns`, `#Vehicles`, back/forward
- [ ] Column sorting (click headers)
- [ ] Column filters: `>30`, `<100`, text search
- [ ] Global search bar
- [ ] Sidebar column editor: add, remove, reorder columns
- [ ] Column inheritance (subcategory inherits parent)
- [ ] Column overrides persist to localStorage

**Crafting:**
- [ ] Graph mode loads with nodes and edges
- [ ] Diagram mode works (click a node)
- [ ] Crafting category filter shows real categories (not just "All"/"Uncategorized")
- [ ] Recipe disambiguation (ghost nodes / carousel)
- [ ] Primitives analysis works
- [ ] Favorites persist
- [ ] Map filter shows all maps from manifest
- [ ] Tooltip shows crafting category
- [ ] All settings persist and work

**Step 3: Commit cleanup**

```bash
git rm site/unturned/catalog/mockup.html
git commit -m "chore(unturned): remove mockup and clean up old files"
```

---

## Summary

| Task | Description | Key files |
|------|-------------|-----------|
| 1 | Directory setup + data copy | `data/`, `css/`, `js/` |
| 2 | `common.css` | `css/common.css` |
| 3 | `common.js` utilities + data loader | `js/common.js` |
| 4 | `common.js` type fields + column system | `js/common.js` |
| 5 | `common.js` filter engine + map utils | `js/common.js` |
| 6 | `common.js` crafting graph builder | `js/common.js` |
| 7 | Catalog page (HTML + JS) | `catalog/index.html`, `catalog/catalog.js` |
| 8 | Crafting page data layer swap | `crafting/index.html`, `crafting/crafting.js` |
| 9 | Landing page + cross-links | `index.html` |
| 10 | Cleanup + verification | — |
