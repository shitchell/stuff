# Catalog Custom Tables Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the catalog's fixed category-based tables with user-configurable table definitions backed by filter expressions, with a query builder UI for creating/editing tables and inline column controls.

**Architecture:** Table definitions (label + anyConditions + allConditions + visible flag) are the core data model. Presets ship in code; user customizations overlay them via localStorage. The sidebar manages table definitions (drag/reorder, visibility, edit). Each table renders with inline column controls (drag headers, remove, add). A query builder modal handles creating/editing filter conditions.

**Tech Stack:** Vanilla JS (ES6+), CSS custom properties, no build step, no framework

**Design doc:** `docs/plans/2026-02-20-catalog-custom-tables-design.md`

---

### Task 1: Table Definition Data Model, Presets & Persistence

Establish the core data structures, preset table definitions, and localStorage save/load logic in `common.js`.

**Files:**
- Modify: `site/unturned/js/common.js` (append after the filter engine section, ~line 357)

**Step 1: Add the IMPORTANT_COLUMNS constant**

This is the global list of columns considered "important" for auto-detection. When a table has no custom column config, we show important columns where at least one filtered item has a non-null value.

```javascript
// ── Important Columns (auto-detect defaults) ────────────────────────────────

const IMPORTANT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'parsed.damage.player', label: 'Player Dmg' },
  { key: 'parsed.damage.zombie', label: 'Zombie Dmg' },
  { key: 'parsed.range', label: 'Range' },
  { key: 'parsed.firerate', label: 'Firerate' },
  { key: 'parsed.consumable.health', label: 'Health' },
  { key: 'parsed.consumable.food', label: 'Food' },
  { key: 'parsed.consumable.water', label: 'Water' },
  { key: 'parsed.consumable.virus', label: 'Virus' },
  { key: 'parsed.armor', label: 'Armor' },
  { key: 'parsed.storage.width', label: 'Width' },
  { key: 'parsed.storage.height', label: 'Height' },
  { key: 'parsed.speed_max', label: 'Speed' },
  { key: 'parsed.health', label: 'Health (Structure)' },
  { key: 'parsed.fuel_capacity', label: 'Fuel Cap' },
];
```

**Step 2: Add the PRESET_TABLES constant**

These are the default table definitions shipped with the app. Each has a `label`, `anyConditions` (OR'd), `allConditions` (AND'd), and `visible` flag. The 58 types break down into these groups:

```javascript
// ── Table Definition Presets ─────────────────────────────────────────────────

const TABLE_OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'contains'];

const PRESET_TABLES = [
  {
    label: 'Weapons',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Gun' },
      { field: 'type', operator: '=', value: 'Melee' },
      { field: 'type', operator: '=', value: 'Throwable' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Clothing',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Shirt' },
      { field: 'type', operator: '=', value: 'Pants' },
      { field: 'type', operator: '=', value: 'Hat' },
      { field: 'type', operator: '=', value: 'Vest' },
      { field: 'type', operator: '=', value: 'Backpack' },
      { field: 'type', operator: '=', value: 'Mask' },
      { field: 'type', operator: '=', value: 'Glasses' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Consumables',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Food' },
      { field: 'type', operator: '=', value: 'Water' },
      { field: 'type', operator: '=', value: 'Medical' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Building',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Barricade' },
      { field: 'type', operator: '=', value: 'Structure' },
      { field: 'type', operator: '=', value: 'Storage' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Vehicles',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Vehicle' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Equipment',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Optic' },
      { field: 'type', operator: '=', value: 'Grip' },
      { field: 'type', operator: '=', value: 'Barrel' },
      { field: 'type', operator: '=', value: 'Tactical' },
      { field: 'type', operator: '=', value: 'Sight' },
      { field: 'type', operator: '=', value: 'Magazine' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Resources',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Resource' },
      { field: 'type', operator: '=', value: 'Supply' },
      { field: 'type', operator: '=', value: 'Fisher' },
      { field: 'type', operator: '=', value: 'Fuel' },
      { field: 'type', operator: '=', value: 'Refill' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Containers',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Large' },
      { field: 'type', operator: '=', value: 'Medium' },
      { field: 'type', operator: '=', value: 'Small' },
    ],
    allConditions: [],
    visible: true,
  },
  {
    label: 'Spawn Tables',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Spawn' },
    ],
    allConditions: [],
    visible: false,
  },
  {
    label: 'Skins',
    anyConditions: [
      { field: 'type', operator: '=', value: 'Skin' },
    ],
    allConditions: [],
    visible: false,
  },
];
```

**Step 3: Add table filtering and persistence functions**

```javascript
// ── Table Filtering ──────────────────────────────────────────────────────────

function matchesTableCondition(entry, cond) {
  const val = getNestedValue(entry, cond.field);
  const filter = { op: cond.operator === 'contains' ? '~' : cond.operator, value: cond.value };
  // For '=' on strings, do exact match (not numeric)
  if (cond.operator === '=' && typeof cond.value === 'string') {
    return val != null && String(val) === cond.value;
  }
  if (cond.operator === '!=' && typeof cond.value === 'string') {
    return val == null || String(val) !== cond.value;
  }
  return matchesFilter(val, filter);
}

function filterEntriesByTable(entries, tableDef) {
  if (!tableDef.anyConditions.length && !tableDef.allConditions.length) return entries;
  return entries.filter(e => {
    const anyPass = tableDef.anyConditions.length === 0
      || tableDef.anyConditions.some(c => matchesTableCondition(e, c));
    const allPass = tableDef.allConditions.length === 0
      || tableDef.allConditions.every(c => matchesTableCondition(e, c));
    return anyPass && allPass;
  });
}

function detectColumnsForEntries(entries) {
  if (!entries.length) return IMPORTANT_COLUMNS.slice(0, 4); // fallback: id, name, type, rarity
  const result = [];
  for (const col of IMPORTANT_COLUMNS) {
    const hasValue = entries.some(e => {
      const v = getNestedValue(e, col.key);
      return v != null && v !== '' && v !== 0;
    });
    if (hasValue) result.push(col);
  }
  return result.length > 0 ? result : IMPORTANT_COLUMNS.slice(0, 4);
}

// ── Table Persistence ────────────────────────────────────────────────────────

function loadTableDefs() {
  let userTables;
  try { userTables = JSON.parse(localStorage.getItem('ut:catalog:tables')); } catch {}
  if (!Array.isArray(userTables)) {
    // First visit: return deep copy of presets
    return PRESET_TABLES.map(t => JSON.parse(JSON.stringify(t)));
  }
  // Merge: user tables take priority by label, then append any presets not overridden
  const userLabels = new Set(userTables.map(t => t.label));
  const merged = [...userTables];
  for (const preset of PRESET_TABLES) {
    if (!userLabels.has(preset.label)) {
      merged.push(JSON.parse(JSON.stringify(preset)));
    }
  }
  return merged;
}

function saveTableDefs(tables) {
  localStorage.setItem('ut:catalog:tables', JSON.stringify(tables));
}

function loadTableColumns(label) {
  try {
    const data = JSON.parse(localStorage.getItem(`ut:catalog:columns:${label}`));
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function saveTableColumns(label, columns) {
  if (columns) {
    localStorage.setItem(`ut:catalog:columns:${label}`, JSON.stringify(columns));
  } else {
    localStorage.removeItem(`ut:catalog:columns:${label}`);
  }
}

function getKnownFieldValues(entries, fieldKey) {
  const vals = new Set();
  for (const e of entries) {
    const v = getNestedValue(e, fieldKey);
    if (v != null && v !== '') vals.add(String(v));
  }
  return [...vals].sort();
}
```

**Step 4: Verify**

Open the browser console on the catalog page and verify:
- `PRESET_TABLES` is defined and has 10 entries
- `loadTableDefs()` returns an array of 10 table definitions
- `filterEntriesByTable(allEntries, PRESET_TABLES[0])` returns ~95 entries (Gun + Melee + Throwable)
- `detectColumnsForEntries(result)` returns columns with damage/range fields

**Step 5: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "feat(unturned): add table definition data model, presets, and persistence"
```

---

### Task 2: Query Builder Modal — HTML & CSS

Add the modal overlay HTML structure to `catalog/index.html` and all CSS for the query builder modal to `common.css`.

**Files:**
- Modify: `site/unturned/catalog/index.html` (add modal HTML before closing `</body>`)
- Modify: `site/unturned/css/common.css` (append modal styles)

**Step 1: Add modal HTML to index.html**

Insert before the `<script>` tags at the bottom of `index.html`:

```html
  <!-- Query Builder Modal -->
  <div class="modal-overlay" id="modal-overlay" style="display:none">
    <div class="modal">
      <div class="modal-header">
        <h2 id="modal-title">New Table</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label for="modal-label">Table Name</label>
          <input type="text" id="modal-label" placeholder="e.g. My Weapons">
        </div>
        <div class="modal-section">
          <h3>Any of these <span class="modal-hint">(items matching at least one)</span></h3>
          <div id="modal-any-conditions"></div>
          <button class="add-condition-btn" onclick="addModalCondition('any')">+ Add condition</button>
        </div>
        <div class="modal-section">
          <h3>All of these <span class="modal-hint">(every condition must match)</span></h3>
          <div id="modal-all-conditions"></div>
          <button class="add-condition-btn" onclick="addModalCondition('all')">+ Add condition</button>
        </div>
        <div class="modal-preview">
          <span id="modal-match-count">0</span> entries match
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="modal-btn modal-btn-save" onclick="saveModal()">Save</button>
      </div>
    </div>
  </div>
```

**Step 2: Add modal CSS to common.css**

Append to `common.css` before the responsive section:

```css
/* === Modal === */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  width: 90%; max-width: 560px; max-height: 85vh; display: flex; flex-direction: column;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.8rem 1.2rem; border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: var(--font-lg); color: var(--accent); margin: 0; }
.modal-close {
  background: none; border: none; color: var(--text-muted); font-size: 1.4rem;
  cursor: pointer; line-height: 1; padding: 0 0.2rem;
}
.modal-close:hover { color: var(--text-primary); }
.modal-body { padding: 1rem 1.2rem; overflow-y: auto; flex: 1; }
.modal-field { margin-bottom: 1rem; }
.modal-field label {
  display: block; font-size: var(--font-sm); color: var(--text-secondary);
  text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.3rem;
}
.modal-field input {
  width: 100%; padding: 0.4rem 0.6rem;
  background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text-primary); font-size: var(--font-base);
}
.modal-field input:focus { outline: none; border-color: var(--accent); }
.modal-section { margin-bottom: 1rem; }
.modal-section h3 {
  font-size: var(--font-base); color: var(--text-primary); margin-bottom: 0.5rem; font-weight: 600;
}
.modal-hint { font-weight: 400; color: var(--text-muted); font-size: var(--font-sm); }
.condition-row {
  display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.4rem;
}
.condition-row select, .condition-row input {
  padding: 0.35rem 0.5rem; background: var(--bg-primary); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text-primary); font-size: var(--font-sm);
}
.condition-row select:focus, .condition-row input:focus { outline: none; border-color: var(--accent); }
.condition-field-select { flex: 2; min-width: 0; }
.condition-op-select { flex: 0 0 4.5rem; }
.condition-value-input { flex: 2; min-width: 0; }
.condition-remove {
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  font-size: 1rem; padding: 0 0.3rem; line-height: 1;
}
.condition-remove:hover { color: var(--rarity-mythical); }
.add-condition-btn {
  background: none; border: 1px dashed var(--border); border-radius: var(--radius);
  color: var(--text-muted); cursor: pointer; font-size: var(--font-sm);
  padding: 0.25rem 0.6rem; margin-top: 0.2rem;
}
.add-condition-btn:hover { color: var(--accent); border-color: var(--accent); }
.modal-preview {
  padding: 0.5rem 0.8rem; background: var(--bg-primary); border-radius: var(--radius);
  font-size: var(--font-sm); color: var(--text-secondary); text-align: center;
}
.modal-preview span { color: var(--accent); font-weight: 600; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 0.8rem 1.2rem; border-top: 1px solid var(--border);
}
.modal-btn {
  padding: 0.4rem 1rem; border-radius: var(--radius); font-size: var(--font-base);
  cursor: pointer; border: 1px solid var(--border);
}
.modal-btn-cancel { background: none; color: var(--text-secondary); }
.modal-btn-cancel:hover { color: var(--text-primary); border-color: var(--text-secondary); }
.modal-btn-save { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 600; }
.modal-btn-save:hover { background: #e6c200; }
```

**Step 3: Verify**

Temporarily add `style="display:flex"` to the modal-overlay in HTML, reload the page, and verify the modal renders centered with dark overlay, proper styling, sections for "Any of these" and "All of these", label input, and Save/Cancel buttons. Then revert to `display:none`.

**Step 4: Commit**

```bash
git add site/unturned/catalog/index.html site/unturned/css/common.css
git commit -m "feat(unturned): add query builder modal HTML and CSS"
```

---

### Task 3: Query Builder Modal — JavaScript Logic

Implement the modal open/close, condition row rendering, field/value dropdowns, live preview count, and save behavior.

**Files:**
- Modify: `site/unturned/catalog/catalog.js` (add modal logic)

**Step 1: Add modal state and helpers**

Add after the existing state variables at the top of `catalog.js`:

```javascript
let modalState = null; // { editIndex: number|null, anyConditions: [], allConditions: [] }
```

**Step 2: Add modal functions**

Add a new section `// ── Query Builder Modal ──` in `catalog.js`:

```javascript
// ── Query Builder Modal ──────────────────────────────────────────────────────

function openModal(editIndex) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const labelInput = document.getElementById('modal-label');

  if (editIndex != null && editIndex >= 0 && editIndex < tableDefs.length) {
    const def = tableDefs[editIndex];
    modalState = {
      editIndex,
      anyConditions: JSON.parse(JSON.stringify(def.anyConditions)),
      allConditions: JSON.parse(JSON.stringify(def.allConditions)),
    };
    titleEl.textContent = 'Edit Table';
    labelInput.value = def.label;
  } else {
    modalState = { editIndex: null, anyConditions: [], allConditions: [] };
    titleEl.textContent = 'New Table';
    labelInput.value = '';
  }

  renderModalConditions();
  updateModalPreview();
  overlay.style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  modalState = null;
}

function renderModalConditions() {
  renderConditionGroup('any');
  renderConditionGroup('all');
}

function renderConditionGroup(group) {
  const container = document.getElementById(`modal-${group}-conditions`);
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;

  container.innerHTML = conditions.map((cond, i) => {
    const fieldOptions = buildFieldOptions(cond.field);
    const opOptions = TABLE_OPERATORS.map(op =>
      `<option value="${escapeHtml(op)}" ${op === cond.operator ? 'selected' : ''}>${escapeHtml(op)}</option>`
    ).join('');
    const valueInput = buildValueInput(cond.field, cond.value, group, i);

    return `<div class="condition-row">
      <select class="condition-field-select" onchange="onConditionFieldChange('${group}', ${i}, this.value)">
        ${fieldOptions}
      </select>
      <select class="condition-op-select" onchange="onConditionOpChange('${group}', ${i}, this.value)">
        ${opOptions}
      </select>
      ${valueInput}
      <button class="condition-remove" onclick="removeCondition('${group}', ${i})">&times;</button>
    </div>`;
  }).join('');
}

function buildFieldOptions(selectedField) {
  // Combine top-level fields + parsed fields from ALL_AVAILABLE_COLUMNS
  const fields = [
    { key: 'type', label: 'Type' },
    { key: 'rarity', label: 'Rarity' },
    { key: 'name', label: 'Name' },
    { key: 'id', label: 'ID' },
    { key: 'description', label: 'Description' },
    { key: 'size_x', label: 'Size X' },
    { key: 'size_y', label: 'Size Y' },
  ];
  // Add all parsed fields from ALL_AVAILABLE_COLUMNS not already listed
  const seen = new Set(fields.map(f => f.key));
  for (const col of ALL_AVAILABLE_COLUMNS) {
    if (!seen.has(col.key)) {
      seen.add(col.key);
      fields.push(col);
    }
  }

  return `<option value="">-- field --</option>` +
    fields.map(f =>
      `<option value="${escapeHtml(f.key)}" ${f.key === selectedField ? 'selected' : ''}>${escapeHtml(f.label)} (${escapeHtml(f.key)})</option>`
    ).join('');
}

function buildValueInput(fieldKey, currentValue, group, index) {
  // For known discrete-value fields, show a dropdown
  const discreteFields = ['type', 'rarity'];
  if (discreteFields.includes(fieldKey)) {
    const values = getKnownFieldValues(allEntries, fieldKey);
    const options = values.map(v =>
      `<option value="${escapeHtml(v)}" ${v === currentValue ? 'selected' : ''}>${escapeHtml(v)}</option>`
    ).join('');
    return `<select class="condition-value-input" onchange="onConditionValueChange('${group}', ${index}, this.value)">
      <option value="">-- value --</option>${options}
    </select>`;
  }
  // For everything else, show a text input
  return `<input class="condition-value-input" type="text" value="${escapeHtml(currentValue || '')}"
    placeholder="value" oninput="onConditionValueChange('${group}', ${index}, this.value)">`;
}

function addModalCondition(group) {
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;
  conditions.push({ field: 'type', operator: '=', value: '' });
  renderModalConditions();
  updateModalPreview();
}

function removeCondition(group, index) {
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;
  conditions.splice(index, 1);
  renderModalConditions();
  updateModalPreview();
}

function onConditionFieldChange(group, index, value) {
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;
  conditions[index].field = value;
  conditions[index].value = ''; // reset value when field changes
  renderModalConditions();
  updateModalPreview();
}

function onConditionOpChange(group, index, value) {
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;
  conditions[index].operator = value;
  updateModalPreview();
}

function onConditionValueChange(group, index, value) {
  const conditions = group === 'any' ? modalState.anyConditions : modalState.allConditions;
  conditions[index].value = value;
  updateModalPreview();
}

function updateModalPreview() {
  if (!modalState) return;
  const tempDef = {
    anyConditions: modalState.anyConditions.filter(c => c.field && c.value !== ''),
    allConditions: modalState.allConditions.filter(c => c.field && c.value !== ''),
  };
  const matches = filterEntriesByTable(filteredEntries, tempDef);
  document.getElementById('modal-match-count').textContent = matches.length;
}

function saveModal() {
  const label = document.getElementById('modal-label').value.trim();
  if (!label) {
    document.getElementById('modal-label').focus();
    return;
  }

  const newDef = {
    label,
    anyConditions: modalState.anyConditions.filter(c => c.field && c.value !== ''),
    allConditions: modalState.allConditions.filter(c => c.field && c.value !== ''),
    visible: true,
  };

  if (modalState.editIndex != null) {
    // Editing existing table
    const oldLabel = tableDefs[modalState.editIndex].label;
    tableDefs[modalState.editIndex] = newDef;
    // If label changed, migrate column overrides
    if (oldLabel !== label) {
      const oldCols = loadTableColumns(oldLabel);
      if (oldCols) {
        saveTableColumns(label, oldCols);
        saveTableColumns(oldLabel, null);
      }
    }
  } else {
    // Adding new table
    tableDefs.push(newDef);
  }

  saveTableDefs(tableDefs);
  closeModal();
  render();
}
```

**Step 3: Verify**

In the browser console, run `openModal()` — the modal should appear with "New Table" title, empty label, and empty condition groups. Click "+ Add condition" in the "Any" section — a condition row should appear with a field dropdown, operator dropdown, and value dropdown (since default field is `type`). Select "Gun" as the value — the preview count should update to ~61. Click Save with a label entered — the modal should close.

**Step 4: Commit**

```bash
git add site/unturned/catalog/catalog.js
git commit -m "feat(unturned): implement query builder modal logic"
```

---

### Task 4: Sidebar Table List — Replace "Visible Tables" and "Columns"

Replace the sidebar's "Visible Tables" checkbox list and "Columns" editor with a sortable table definition list. Each row has: drag handle, visibility checkbox, label, gear icon.

**Files:**
- Modify: `site/unturned/catalog/index.html` (update sidebar HTML)
- Modify: `site/unturned/catalog/catalog.js` (replace `renderCategoryToggles` and `renderColumnConfig` with new sidebar render)
- Modify: `site/unturned/css/common.css` (add table-list sidebar styles)

**Step 1: Update sidebar HTML in index.html**

Replace the sidebar contents (everything inside `<div class="sidebar" id="sidebar">`) with:

```html
      <div class="section">
        <h3>Tables</h3>
        <ul class="table-list" id="table-list"></ul>
        <button class="add-col-btn" onclick="openModal()" style="margin-top:0.5rem">+ Add Table</button>
      </div>
      <div class="section">
        <h3>Map Filter</h3>
        <div id="map-filters" class="filter-group"></div>
      </div>
```

This removes the old "Columns" section entirely (columns are now managed inline on each table).

**Step 2: Add sidebar table list CSS to common.css**

```css
/* === Table List (sidebar) === */
.table-list { list-style: none; }
.table-list-item {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.4rem; border-radius: var(--radius);
  font-size: var(--font-base); cursor: grab; user-select: none;
}
.table-list-item:hover { background: var(--bg-hover); }
.table-list-item.dragging { opacity: 0.4; }
.table-list-item .drag-handle { color: var(--text-dim); cursor: grab; font-size: var(--font-sm); line-height: 1; }
.table-list-item .drag-handle:hover { color: var(--text-secondary); }
.table-list-item .table-label { flex: 1; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-list-item .table-edit-btn {
  color: var(--text-dim); cursor: pointer; font-size: 0.85rem;
  padding: 0 0.2rem; line-height: 1; background: none; border: none;
}
.table-list-item .table-edit-btn:hover { color: var(--accent); }
.table-list-item .table-remove-btn {
  color: #666; cursor: pointer; font-size: 0.9rem;
  width: 1.2rem; text-align: center; border-radius: 3px; line-height: 1.2rem;
  background: none; border: none;
}
.table-list-item .table-remove-btn:hover { color: var(--rarity-mythical); background: rgba(227, 79, 79, 0.15); }
```

**Step 3: Add table list rendering in catalog.js**

Replace the old `renderCategoryToggles()` function and column config rendering with:

```javascript
// ── Sidebar Table List ───────────────────────────────────────────────────────

let tableDragSrcIdx = null;

function renderTableList() {
  const el = document.getElementById('table-list');
  el.innerHTML = tableDefs.map((def, i) => `
    <li class="table-list-item" draggable="true" data-idx="${i}"
        ondragstart="onTableDragStart(event,${i})" ondragover="onTableDragOver(event,${i})"
        ondrop="onTableDrop(event,${i})" ondragend="onTableDragEnd(event)">
      <span class="drag-handle">&#9776;</span>
      <input type="checkbox" ${def.visible ? 'checked' : ''}
             onchange="toggleTableVisible(${i}, this.checked)" title="Show in All view">
      <span class="table-label">${escapeHtml(def.label)}</span>
      <button class="table-edit-btn" onclick="openModal(${i})" title="Edit">&#9881;</button>
      <button class="table-remove-btn" onclick="removeTableDef(${i})" title="Delete">&times;</button>
    </li>`).join('');
}

function toggleTableVisible(index, visible) {
  tableDefs[index].visible = visible;
  saveTableDefs(tableDefs);
  render();
}

function removeTableDef(index) {
  const label = tableDefs[index].label;
  tableDefs.splice(index, 1);
  saveTableDefs(tableDefs);
  saveTableColumns(label, null); // clean up column overrides
  render();
}

function onTableDragStart(e, idx) { tableDragSrcIdx = idx; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onTableDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onTableDrop(e, idx) {
  e.preventDefault();
  if (tableDragSrcIdx === null || tableDragSrcIdx === idx) return;
  const [moved] = tableDefs.splice(tableDragSrcIdx, 1);
  tableDefs.splice(idx, 0, moved);
  saveTableDefs(tableDefs);
  tableDragSrcIdx = null;
  render();
}
function onTableDragEnd(e) { e.target.classList.remove('dragging'); tableDragSrcIdx = null; }
```

**Step 4: Initialize tableDefs state**

At the top of `catalog.js`, in the state section, add:

```javascript
let tableDefs = loadTableDefs();
```

And remove/deprecate `hiddenTables` and `columnOverrides` loading (those are replaced by `tableDefs` and per-table column storage). Also remove the old `collapsedSections` state if it's no longer needed, or keep it if we still want collapsible table sections.

**Step 5: Update `render()` to call `renderTableList()`**

Replace the call to `renderCategoryToggles()` with `renderTableList()`. Remove the call to `renderColumnConfig()`.

**Step 6: Verify**

Reload the page, open the sidebar. You should see:
- A "Tables" section with 10 table definitions (Weapons, Clothing, Consumables, etc.)
- Each with a drag handle, checkbox, label, gear icon, and delete button
- Spawn Tables and Skins should be unchecked (visible: false)
- Clicking the gear opens the query builder modal pre-filled with that table's conditions
- Drag and drop reorders the list
- "+ Add Table" button at the bottom

**Step 7: Commit**

```bash
git add site/unturned/catalog/index.html site/unturned/catalog/catalog.js site/unturned/css/common.css
git commit -m "feat(unturned): replace sidebar with table definition list"
```

---

### Task 5: Tabs and Overview Mode — Render from Table Definitions

Replace the old path-based tabs and overview mode with table-definition-driven rendering. Each table definition becomes a tab. The "All" tab shows all visible tables stacked.

**Files:**
- Modify: `site/unturned/catalog/catalog.js` (rework `renderTabs`, `renderOverviewMode`, `renderFocusedMode`, `navigate`)

**Step 1: Rework navigation state**

Replace the `currentPath`/`activeTab` navigation model. The new model:
- `activeTableIndex`: `null` for "All" view, or an index into `tableDefs` for single-table view
- Keep `currentPath` only for hash routing backward compatibility (map it to the matching table index)

Update state variables:

```javascript
let activeTableIndex = null; // null = All view, number = index into tableDefs
```

**Step 2: Rework renderTabs()**

```javascript
function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  const allCount = filteredEntries.length;
  const allTab = `<div class="tab all-tab ${activeTableIndex === null ? 'active' : ''}" onclick="navigateTable(null)">
    All<span class="count">${allCount}</span></div>`;

  const tableTabs = tableDefs.map((def, i) => {
    const entries = filterEntriesByTable(filteredEntries, def);
    return `<div class="tab ${activeTableIndex === i ? 'active' : ''}" onclick="navigateTable(${i})">
      ${escapeHtml(def.label)}<span class="count">${entries.length}</span></div>`;
  }).join('');

  tabsEl.innerHTML = allTab + tableTabs;
}
```

**Step 3: Rework renderOverviewMode()**

Now iterates over `tableDefs` instead of top-level categories:

```javascript
function renderOverviewMode() {
  const content = document.getElementById('content');
  let html = '';

  for (let i = 0; i < tableDefs.length; i++) {
    const def = tableDefs[i];
    if (!def.visible) continue;

    const entries = filterEntriesByTable(filteredEntries, def);
    if (entries.length === 0) continue;

    const columns = loadTableColumns(def.label) || detectColumnsForEntries(entries);
    const tableKey = `table:${def.label}`;
    const s = getSort(tableKey);
    const { thead, tbody, visibleCount, totalCount } = buildTableHTML(entries, columns, s.col, s.dir, tableKey);
    const collapsed = collapsedSections[def.label];

    html += `
      <div class="table-section" id="section-${i}">
        <div class="table-section-header ${collapsed ? 'collapsed' : ''}"
             onclick="toggleCollapse('${escapeHtml(def.label)}')">
          <span class="collapse-arrow">&#9660;</span>
          <span class="section-title">${escapeHtml(def.label)}</span>
          <span class="section-count">${visibleCount} / ${totalCount}</span>
          <a class="section-drill" href="#" onclick="event.stopPropagation();navigateTable(${i});return false;">
            Open &rarr;
          </a>
        </div>
        <div class="table-section-body">
          <div class="table-wrap">
            <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
          </div>
        </div>
      </div>`;
  }

  if (!html) html = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No visible tables. Add or enable tables in the sidebar.</div>';
  content.innerHTML = html;
}
```

**Step 4: Rework renderFocusedMode() for single-table view**

```javascript
function renderFocusedMode() {
  const content = document.getElementById('content');
  const def = tableDefs[activeTableIndex];
  if (!def) { content.innerHTML = ''; return; }

  const entries = filterEntriesByTable(filteredEntries, def);
  const columns = loadTableColumns(def.label) || detectColumnsForEntries(entries);
  const tableKey = `table:${def.label}`;
  const s = getSort(tableKey);
  const { thead, tbody, visibleCount, totalCount } = buildTableHTML(entries, columns, s.col, s.dir, tableKey);

  let html = '';

  // Show filter description at top
  const filterDesc = describeTableFilter(def);
  if (filterDesc) {
    html += `<div class="result-info">${escapeHtml(filterDesc)} — ${visibleCount} of ${totalCount} entries</div>`;
  } else {
    html += `<div class="result-info">${visibleCount} of ${totalCount} entries</div>`;
  }

  html += `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  content.innerHTML = html;
}

function describeTableFilter(def) {
  const parts = [];
  if (def.anyConditions.length > 0) {
    parts.push(def.anyConditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(' OR '));
  }
  if (def.allConditions.length > 0) {
    parts.push(def.allConditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(' AND '));
  }
  return parts.join(' AND ');
}
```

**Step 5: Add navigateTable() and update navigation**

```javascript
function navigateTable(index) {
  activeTableIndex = index;
  location.hash = index != null ? `table:${tableDefs[index].label}` : '';
  render();
}
```

Update `parseHash()` to handle the new `table:` prefix:

```javascript
function parseHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('table:')) {
    const label = hash.substring(6);
    const idx = tableDefs.findIndex(d => d.label === label);
    activeTableIndex = idx >= 0 ? idx : null;
  } else {
    activeTableIndex = null;
  }
}
```

**Step 6: Update render() and isOverviewMode()**

```javascript
function isOverviewMode() { return activeTableIndex === null; }

function render() {
  renderTabs();
  renderTableList();
  if (isOverviewMode()) renderOverviewMode();
  else renderFocusedMode();
}
```

Remove `renderBreadcrumb()` call from `render()` (breadcrumb is no longer path-based — we can simplify or remove it). Keep the breadcrumb HTML showing "stuff / Unturned / Catalog" statically for now.

**Step 7: Clean up old functions**

Remove or comment out these now-unused functions:
- `getEntriesAtPath()`
- `getSubcategories()`
- `getTopLevelCategories()`
- `getColsForPath()`
- `renderCategoryToggles()`
- `renderColumnConfig()` and all its helpers (`getColEditPath`, `startAddColumn`, `cancelAddColumn`, `filterAutocomplete`, `addColumn`, `removeColumn`, old drag handlers)
- `renderBreadcrumb()` (simplify to static)
- Old `navigate()` function (replaced by `navigateTable`)

Keep: `buildTableHTML`, `doSort`, `onColFilter`, `toggleCollapse`, `toggleSidebar`, `searchFilter`, `isNumericColumn`, `saveState`, map filter functions.

Update `saveState()` to save `tableDefs`:
```javascript
function saveState() {
  saveTableDefs(tableDefs);
  localStorage.setItem('ut:catalog:collapsed', JSON.stringify(collapsedSections));
  localStorage.setItem('ut:catalog:maps', JSON.stringify(selectedMaps));
}
```

**Step 8: Verify**

Reload the page. You should see:
- Tabs bar shows: All, Weapons, Clothing, Consumables, Building, Vehicles, Equipment, Resources, Containers, Spawn Tables, Skins
- All view shows stacked tables for each visible table definition (Spawn Tables and Skins hidden)
- Clicking "Weapons" tab shows a single table with Gun + Melee + Throwable items
- Columns auto-detected: Weapons should show damage/range columns, Consumables should show food/water/health
- Sorting and column filters still work
- Sidebar table list and gear/edit/reorder still work

**Step 9: Commit**

```bash
git add site/unturned/catalog/catalog.js
git commit -m "feat(unturned): render tabs and overview from table definitions"
```

---

### Task 6: Inline Column Controls

Replace the old sidebar column editor with inline controls on each table's header row: drag handles on column headers, "x" on hover to remove, and "+" button at the end to add a column.

**Files:**
- Modify: `site/unturned/catalog/catalog.js` (update `buildTableHTML` and add inline column handlers)
- Modify: `site/unturned/css/common.css` (add inline column control styles)

**Step 1: Update buildTableHTML to include inline column controls**

Modify the header row generation in `buildTableHTML` to add drag handles and remove buttons on each `<th>`, plus a "+" button as the last `<th>`:

```javascript
function buildTableHTML(entries, columns, sortKey, sortDir, tableKey) {
  let sorted = [...entries];
  if (sortKey) {
    sorted.sort((a, b) => {
      let va = resolveColumnValue(a, { key: sortKey });
      let vb = resolveColumnValue(b, { key: sortKey });
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }
  sorted = searchFilter(sorted);
  sorted = applyColFilters(sorted, columns, colFilters[tableKey]);

  const esc = escapeHtml;
  const filters = colFilters[tableKey] || {};

  const headerRow = `<tr>${columns.map((c, i) => {
    const arrow = sortKey === c.key ? (sortDir === 1 ? '&#9650;' : '&#9660;') : '';
    const thCls = c.key === 'id' ? ' id-col' : '';
    return `<th class="col-header${thCls}" draggable="true"
      data-tablekey="${esc(tableKey)}" data-colidx="${i}"
      ondragstart="onInlineColDragStart(event,'${esc(tableKey)}',${i})"
      ondragover="onInlineColDragOver(event)"
      ondrop="onInlineColDrop(event,'${esc(tableKey)}',${i})"
      ondragend="onInlineColDragEnd(event)">
      <span class="col-sort" onclick="doSort('${esc(tableKey)}','${esc(c.key)}')">${esc(c.label)}<span class="sort-arrow">${arrow}</span></span>
      <button class="col-remove-btn" onclick="event.stopPropagation();removeInlineColumn('${esc(tableKey)}',${i})" title="Remove column">&times;</button>
    </th>`;
  }).join('')}<th class="col-add-th">
    <button class="col-add-btn" onclick="showInlineAddColumn(event,'${esc(tableKey)}')" title="Add column">+</button>
  </th></tr>`;

  const filterRow = `<tr class="filter-row">${columns.map(c => {
    const val = esc(filters[c.key] || '');
    const isActive = val ? 'active' : '';
    const placeholder = isNumericColumn(c.key, entries) ? '&gt;, &lt;, =...' : 'filter...';
    return `<th><input class="col-filter ${isActive}" type="text" value="${val}"
      placeholder="${placeholder}"
      data-pathkey="${esc(tableKey)}" data-colkey="${esc(c.key)}"
      oninput="onColFilter(this)" /></th>`;
  }).join('')}<th></th></tr>`;

  const thead = headerRow + filterRow;

  const tbody = sorted.map(e => `<tr data-guid="${e.guid || ''}">${columns.map(c => {
    let val = resolveColumnValue(e, c);
    if (val == null) val = '\u2014';
    const isNum = typeof val === 'number';
    const cls = c.key === 'id' ? 'id-cell' : c.key === 'name' ? 'name-cell' : c.key === 'type' ? 'type-cell' : isNum ? 'num-cell' : '';
    const rar = c.key === 'rarity' ? `rarity-${val}` : '';
    return `<td class="${cls} ${rar}">${esc(val)}</td>`;
  }).join('')}<td></td></tr>`).join('');

  return { thead, tbody, visibleCount: sorted.length, totalCount: entries.length };
}
```

**Step 2: Add inline column handler functions**

```javascript
// ── Inline Column Controls ───────────────────────────────────────────────────

let inlineColDragState = null; // { tableKey, fromIdx }

function getTableLabel(tableKey) {
  // tableKey is "table:Label"
  return tableKey.startsWith('table:') ? tableKey.substring(6) : tableKey;
}

function getTableColumns(tableKey) {
  const label = getTableLabel(tableKey);
  const def = tableDefs.find(d => d.label === label);
  if (!def) return [];
  const saved = loadTableColumns(label);
  if (saved) return saved;
  const entries = filterEntriesByTable(filteredEntries, def);
  return detectColumnsForEntries(entries);
}

function setTableColumns(tableKey, columns) {
  const label = getTableLabel(tableKey);
  saveTableColumns(label, columns);
}

function removeInlineColumn(tableKey, colIdx) {
  const columns = [...getTableColumns(tableKey)];
  columns.splice(colIdx, 1);
  setTableColumns(tableKey, columns);
  render();
}

function onInlineColDragStart(e, tableKey, idx) {
  inlineColDragState = { tableKey, fromIdx: idx };
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onInlineColDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onInlineColDrop(e, tableKey, idx) {
  e.preventDefault();
  if (!inlineColDragState || inlineColDragState.tableKey !== tableKey) return;
  const fromIdx = inlineColDragState.fromIdx;
  if (fromIdx === idx) return;
  const columns = [...getTableColumns(tableKey)];
  const [moved] = columns.splice(fromIdx, 1);
  columns.splice(idx, 0, moved);
  setTableColumns(tableKey, columns);
  inlineColDragState = null;
  render();
}
function onInlineColDragEnd(e) { e.target.classList.remove('dragging'); inlineColDragState = null; }

function showInlineAddColumn(event, tableKey) {
  event.stopPropagation();
  // Create a dropdown positioned near the "+" button
  const existing = document.querySelector('.inline-col-dropdown');
  if (existing) existing.remove();

  const btn = event.target;
  const rect = btn.getBoundingClientRect();
  const currentCols = new Set(getTableColumns(tableKey).map(c => c.key));
  const available = ALL_AVAILABLE_COLUMNS.filter(c => !currentCols.has(c.key));

  const dropdown = document.createElement('div');
  dropdown.className = 'inline-col-dropdown';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;

  dropdown.innerHTML = `
    <input type="text" class="inline-col-search" placeholder="Search columns..." oninput="filterInlineColDropdown(this, '${escapeHtml(tableKey)}')">
    <div class="inline-col-options">${available.slice(0, 15).map(c =>
      `<div class="inline-col-option" onclick="addInlineColumn('${escapeHtml(tableKey)}','${escapeHtml(c.key)}','${escapeHtml(c.label)}')">${escapeHtml(c.label)} <span class="ac-key">${escapeHtml(c.key)}</span></div>`
    ).join('')}</div>`;

  document.body.appendChild(dropdown);

  const search = dropdown.querySelector('.inline-col-search');
  search.focus();

  // Close on outside click
  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.remove();
      document.removeEventListener('click', handler);
    }
  }), 0);
}

function filterInlineColDropdown(input, tableKey) {
  const q = input.value.toLowerCase();
  const currentCols = new Set(getTableColumns(tableKey).map(c => c.key));
  const matches = ALL_AVAILABLE_COLUMNS.filter(c => !currentCols.has(c.key) &&
    (c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)));
  const container = input.parentElement.querySelector('.inline-col-options');
  container.innerHTML = matches.slice(0, 15).map(c =>
    `<div class="inline-col-option" onclick="addInlineColumn('${escapeHtml(tableKey)}','${escapeHtml(c.key)}','${escapeHtml(c.label)}')">${escapeHtml(c.label)} <span class="ac-key">${escapeHtml(c.key)}</span></div>`
  ).join('');
}

function addInlineColumn(tableKey, key, label) {
  const columns = [...getTableColumns(tableKey), { key, label }];
  setTableColumns(tableKey, columns);
  const dropdown = document.querySelector('.inline-col-dropdown');
  if (dropdown) dropdown.remove();
  render();
}
```

**Step 3: Add inline column CSS**

```css
/* === Inline Column Controls === */
.col-header { position: relative; }
.col-header .col-sort { cursor: pointer; }
.col-header .col-remove-btn {
  display: none; position: absolute; top: 2px; right: 2px;
  background: var(--bg-header); border: none; color: var(--text-dim);
  cursor: pointer; font-size: 0.8rem; line-height: 1; padding: 0 0.2rem;
  border-radius: 2px;
}
.col-header:hover .col-remove-btn { display: block; }
.col-header .col-remove-btn:hover { color: var(--rarity-mythical); }
.col-header.dragging { opacity: 0.4; }

.col-add-th { width: 1%; padding: 0; vertical-align: middle; border-bottom: 1px solid var(--border); background: var(--bg-header); }
.col-add-btn {
  background: none; border: 1px dashed var(--border); border-radius: 3px;
  color: var(--text-dim); cursor: pointer; font-size: 0.9rem;
  width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;
  margin: 0 0.3rem;
}
.col-add-btn:hover { color: var(--accent); border-color: var(--accent); }

.inline-col-dropdown {
  position: fixed; z-index: 300; background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius); width: 220px; max-height: 250px; display: flex; flex-direction: column;
}
.inline-col-search {
  padding: 0.4rem 0.6rem; background: var(--bg-primary); border: none; border-bottom: 1px solid var(--border);
  color: var(--text-primary); font-size: var(--font-sm);
}
.inline-col-search:focus { outline: none; }
.inline-col-options { overflow-y: auto; flex: 1; }
.inline-col-option { padding: 0.35rem 0.6rem; cursor: pointer; font-size: var(--font-sm); }
.inline-col-option:hover { background: var(--bg-hover); color: var(--accent); }
.inline-col-option .ac-key { color: var(--text-muted); font-size: 0.7rem; margin-left: 0.4rem; }
```

**Step 4: Update renderOverviewMode and renderFocusedMode**

Update both to use `getTableColumns(tableKey)` instead of the old column resolution:

In `renderOverviewMode`:
```javascript
const columns = getTableColumns(tableKey);
```

In `renderFocusedMode`:
```javascript
const columns = getTableColumns(tableKey);
```

(This replaces the inline `loadTableColumns(def.label) || detectColumnsForEntries(entries)` calls with the helper that does the same thing.)

**Step 5: Verify**

Reload the page:
- Each table header should show column names that are sortable (click the label text)
- Hovering over a column header reveals an "x" button in the top-right corner
- Clicking "x" removes that column from the table
- Dragging column headers reorders them
- A "+" button appears at the right end of the header row
- Clicking "+" shows a dropdown with available columns to add
- Changes persist after page reload (saved to localStorage per table label)

**Step 6: Commit**

```bash
git add site/unturned/catalog/catalog.js site/unturned/css/common.css
git commit -m "feat(unturned): add inline column controls on table headers"
```

---

### Task 7: Integration, Polish & Edge Cases

Wire everything together, handle edge cases, and clean up dead code.

**Files:**
- Modify: `site/unturned/catalog/catalog.js` (final integration)
- Modify: `site/unturned/catalog/index.html` (cleanup)

**Step 1: Handle "Other" / uncategorized entries**

Items that don't match any table definition should still be findable. On the "All" view, optionally show an "Other" section at the bottom with all entries not matched by any visible table. Add this after the table loop in `renderOverviewMode()`:

```javascript
  // Show "Other" entries not matching any visible table
  const matchedGuids = new Set();
  for (const def of tableDefs) {
    if (!def.visible) continue;
    for (const e of filterEntriesByTable(filteredEntries, def)) {
      matchedGuids.add(e.guid);
    }
  }
  const otherEntries = filteredEntries.filter(e => !matchedGuids.has(e.guid));
  if (otherEntries.length > 0) {
    const columns = detectColumnsForEntries(otherEntries);
    const tableKey = 'table:__other__';
    const s = getSort(tableKey);
    const { thead, tbody, visibleCount, totalCount } = buildTableHTML(otherEntries, columns, s.col, s.dir, tableKey);
    const collapsed = collapsedSections['__other__'];

    html += `
      <div class="table-section">
        <div class="table-section-header ${collapsed ? 'collapsed' : ''}"
             onclick="toggleCollapse('__other__')">
          <span class="collapse-arrow">&#9660;</span>
          <span class="section-title" style="color:var(--text-muted);font-style:italic">Other</span>
          <span class="section-count">${visibleCount} / ${totalCount}</span>
        </div>
        <div class="table-section-body">
          <div class="table-wrap">
            <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
          </div>
        </div>
      </div>`;
  }
```

**Step 2: Ensure map filter works with table definitions**

The existing `applyMapFilter()` sets `filteredEntries` and calls `render()`. Since `renderOverviewMode` and `renderFocusedMode` now call `filterEntriesByTable(filteredEntries, def)`, map filtering should work automatically — table filters operate on the already-map-filtered `filteredEntries`. No changes needed here, just verify.

**Step 3: Remove dead code**

Clean up catalog.js by removing:
- Old `currentPath`, `activeTab` variables (replaced by `activeTableIndex`)
- Old `hiddenTables`, `columnOverrides` state and localStorage loading
- Old `renderCategoryToggles()`, `renderColumnConfig()`, and all column config helpers (`getColEditPath`, `startAddColumn`, `cancelAddColumn`, `filterAutocomplete`, `addColumn`, `removeColumn`, old drag handlers)
- Old `renderBreadcrumb()` can be simplified to a static render or removed
- Old `navigate()` function (replaced by `navigateTable`)
- Old `pk()` helper (replaced by `tableKey` convention)
- Old `getEntriesAtPath()`, `getSubcategories()`, `getTopLevelCategories()`, `getColsForPath()`
- `colEditTarget`, `addingColumn` state

Keep `renderBreadcrumb()` as a simplified version that just keeps "stuff / Unturned / Catalog" static (or shows the active table label after "Catalog").

**Step 4: Update breadcrumb for table navigation**

```javascript
function renderBreadcrumb() {
  const trail = document.getElementById('breadcrumb-trail');
  if (activeTableIndex != null && tableDefs[activeTableIndex]) {
    trail.innerHTML = `<span class="sep">/</span><span style="color:var(--text-primary)">${escapeHtml(tableDefs[activeTableIndex].label)}</span>`;
  } else {
    trail.innerHTML = '';
  }
}
```

Add `renderBreadcrumb()` back into `render()`.

**Step 5: Handle old localStorage gracefully**

Users with old `ut:catalog:hidden` / `ut:catalog:columns` keys won't break — they just won't be used. The new `loadTableDefs()` returns presets on first use when `ut:catalog:tables` doesn't exist. Old keys are ignored.

**Step 6: Verify full flow**

1. Clear localStorage and reload — should see preset tables
2. Click "Weapons" tab — shows gun/melee/throwable with damage columns
3. Click "All" — shows all visible tables stacked, plus "Other" at bottom
4. Open sidebar, uncheck "Containers" — disappears from All view, still in tabs
5. Click gear on "Weapons" — modal opens with 3 conditions (Type = Gun, Melee, Throwable)
6. Add a new condition "All of these: rarity = Legendary" — preview updates
7. Save — Weapons table now only shows legendary weapons
8. Add a new table via "+ Add Table" — "My Table" with custom filter
9. New table appears in tabs and sidebar
10. Drag column headers to reorder, click "x" to remove, "+" to add — columns persist per table
11. Select map filter — tables filter correctly
12. Reload page — all settings persist

**Step 7: Commit**

```bash
git add site/unturned/catalog/catalog.js site/unturned/catalog/index.html
git commit -m "feat(unturned): integrate custom tables, cleanup dead code, add Other section"
```

---

### Task 8: CSS Polish & Responsive

Final CSS tweaks for the new components, ensure responsive behavior on small screens.

**Files:**
- Modify: `site/unturned/css/common.css`

**Step 1: Ensure modal works on mobile**

Update the responsive section:

```css
@media (max-width: 800px) {
  .sidebar { position: fixed; left: 0; top: 44px; bottom: 0; z-index: 50; }
  .tab { padding: 0.5rem 0.8rem; font-size: 0.8rem; }
  .modal { width: 95%; max-width: none; max-height: 90vh; }
  .condition-row { flex-wrap: wrap; }
  .condition-field-select { flex: 1 1 100%; }
}
```

**Step 2: Add transition for collapsible sections**

The existing collapse styles should still work. Verify and adjust if needed.

**Step 3: Verify**

- Resize browser to < 800px — modal should fill most of the screen
- Condition rows should wrap gracefully on narrow screens
- Tabs should scroll horizontally without vertical overflow (already fixed)

**Step 4: Commit**

```bash
git add site/unturned/css/common.css
git commit -m "style(unturned): polish responsive layout for custom tables and modal"
```

---

## Summary of Changes

| File | Changes |
|---|---|
| `site/unturned/js/common.js` | Added: `IMPORTANT_COLUMNS`, `PRESET_TABLES`, `TABLE_OPERATORS`, `matchesTableCondition()`, `filterEntriesByTable()`, `detectColumnsForEntries()`, `loadTableDefs()`, `saveTableDefs()`, `loadTableColumns()`, `saveTableColumns()`, `getKnownFieldValues()` |
| `site/unturned/catalog/catalog.js` | Rewrote: Navigation from path-based to table-index-based. Replaced category toggles with table list. Added: query builder modal logic, inline column controls, "Other" section. Removed: path-based navigation, old column config editor, category helpers |
| `site/unturned/catalog/index.html` | Updated: sidebar (table list + map filter only), added query builder modal HTML |
| `site/unturned/css/common.css` | Added: modal styles, table list sidebar styles, inline column control styles, responsive adjustments |

## localStorage Keys (new)

| Key | Purpose |
|---|---|
| `ut:catalog:tables` | Array of table definitions (label, conditions, visible) |
| `ut:catalog:columns:<label>` | Per-table column config array |
| `ut:catalog:collapsed` | Kept — section collapse state |
| `ut:catalog:maps` | Kept — map filter state |

## localStorage Keys (deprecated)

| Key | Replaced by |
|---|---|
| `ut:catalog:hidden` | `visible` flag on each table definition |
| `ut:catalog:columns` | Per-table `ut:catalog:columns:<label>` |
