// Unturned Catalog — catalog.js

// ── State ───────────────────────────────────────────────────────────────────

let allEntries = [];
let filteredEntries = [];
let activeTableIndex = null;  // null = All view, number = index into tableDefs
let sortState = {};           // tableKey -> { col, dir }
let colFilters = {};          // tableKey -> { colKey: filterString }
let collapsedSections = {};
let tableDefs = loadTableDefs();
let selectedMaps = {};        // mapName -> true
let mapDataCache = {};        // mapName -> { map, entries?, assets? }
let mapFilterIds = null;      // Set of entry IDs, or null (show all)
let manifest = null;
let modalState = null;        // { editIndex: number|null, anyConditions: [], allConditions: [] }
let customColumns = loadCustomColumns();
let colModalState = null;     // { tableKey: string, editId: string|null }

// Load persisted state
try { collapsedSections = JSON.parse(localStorage.getItem('ut:catalog:collapsed') || '{}'); } catch {}
try { selectedMaps = JSON.parse(localStorage.getItem('ut:catalog:maps') || '{}'); } catch {}

function saveState() {
  saveTableDefs(tableDefs);
  localStorage.setItem('ut:catalog:collapsed', JSON.stringify(collapsedSections));
  localStorage.setItem('ut:catalog:maps', JSON.stringify(selectedMaps));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isOverviewMode() { return activeTableIndex === null; }

function getSort(tableKey) { return sortState[tableKey] || { col: null, dir: 1 }; }

function searchFilter(entries) {
  const q = document.getElementById('search').value.toLowerCase();
  if (!q) return entries;
  return entries.filter(e =>
    e.name.toLowerCase().includes(q) || (e.type || '').toLowerCase().includes(q) || String(e.id).includes(q)
  );
}

function isNumericColumn(colKey, entries) {
  let numCount = 0;
  for (let i = 0; i < Math.min(entries.length, 10); i++) {
    const v = getNestedValue(entries[i], colKey);
    if (typeof v === 'number') numCount++;
  }
  return numCount > 0;
}

function getTableLabel(tableKey) {
  return tableKey.startsWith('table:') ? tableKey.substring(6) : tableKey;
}

function getTableColumns(tableKey) {
  const label = getTableLabel(tableKey);
  const saved = loadTableColumns(label);
  if (saved) return saved;
  const def = tableDefs.find(d => d.label === label);
  if (!def) return IMPORTANT_COLUMNS.slice(0, 4);
  const entries = filterEntriesByTable(filteredEntries, def);
  return detectColumnsForEntries(entries);
}

function setTableColumns(tableKey, columns) {
  saveTableColumns(getTableLabel(tableKey), columns);
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

// ── Table Builder ───────────────────────────────────────────────────────────

function buildTableHTML(entries, columns, sortKey, sortDir, tableKey) {
  let sorted = [...entries];
  if (sortKey) {
    const sortCol = columns.find(c => c.key === sortKey) || { key: sortKey };
    sorted.sort((a, b) => {
      let va = resolveColumnValue(a, sortCol);
      let vb = resolveColumnValue(b, sortCol);
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
    const idCls = c.key === 'id' ? ' id-col' : '';
    return `<th class="col-header${idCls}" draggable="true"
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

// ── Inline Column Controls ───────────────────────────────────────────────────

let inlineColDragState = null;

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

function getAvailableCustomColumns(tableKey) {
  const label = getTableLabel(tableKey);
  const def = tableDefs.find(d => d.label === label);
  if (!def) return [];
  const entries = filterEntriesByTable(filteredEntries, def);
  return customColumns.filter(cc => customColumnAvailable(cc, entries));
}

function buildDropdownOptions(tableKey, query) {
  const currentCols = new Set(getTableColumns(tableKey).map(c => c.key));
  const q = (query || '').toLowerCase();

  // "Custom..." always first
  let html = `<div class="inline-col-option inline-col-custom" onclick="openColModal('${escapeHtml(tableKey)}')">Custom... <span class="ac-key">define expression</span></div>`;

  // Available custom columns
  const customs = getAvailableCustomColumns(tableKey).filter(cc =>
    !currentCols.has(`_custom:${cc.id}`) &&
    (!q || cc.label.toLowerCase().includes(q) || cc.expr.toLowerCase().includes(q))
  );
  if (customs.length > 0) {
    html += customs.map(cc =>
      `<div class="inline-col-option" onclick="addInlineColumn('${escapeHtml(tableKey)}','_custom:${escapeHtml(cc.id)}','${escapeHtml(cc.label)}')">${escapeHtml(cc.label)} <span class="ac-key">${escapeHtml(cc.expr)}</span></div>`
    ).join('');
  }

  // Standard columns
  const matches = ALL_AVAILABLE_COLUMNS.filter(c => !currentCols.has(c.key) &&
    (!q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)));
  html += matches.slice(0, 15).map(c =>
    `<div class="inline-col-option" onclick="addInlineColumn('${escapeHtml(tableKey)}','${escapeHtml(c.key)}','${escapeHtml(c.label)}')">${escapeHtml(c.label)} <span class="ac-key">${escapeHtml(c.key)}</span></div>`
  ).join('');

  return html;
}

function showInlineAddColumn(event, tableKey) {
  event.stopPropagation();
  const existing = document.querySelector('.inline-col-dropdown');
  if (existing) existing.remove();

  const btn = event.target;
  const rect = btn.getBoundingClientRect();

  const dropdown = document.createElement('div');
  dropdown.className = 'inline-col-dropdown';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;

  dropdown.innerHTML = `
    <input type="text" class="inline-col-search" placeholder="Search columns..." oninput="filterInlineColDropdown(this, '${escapeHtml(tableKey)}')">
    <div class="inline-col-options">${buildDropdownOptions(tableKey, '')}</div>`;

  document.body.appendChild(dropdown);
  dropdown.querySelector('.inline-col-search').focus();

  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.remove();
      document.removeEventListener('click', handler);
    }
  }), 0);
}

function filterInlineColDropdown(input, tableKey) {
  input.parentElement.querySelector('.inline-col-options').innerHTML = buildDropdownOptions(tableKey, input.value);
}

function addInlineColumn(tableKey, key, label) {
  const columns = [...getTableColumns(tableKey)];
  // For custom columns, also store the expr
  if (key.startsWith('_custom:')) {
    const id = key.substring(8);
    const cc = customColumns.find(c => c.id === id);
    if (cc) {
      columns.push({ key, label: cc.label, expr: cc.expr });
    }
  } else {
    columns.push({ key, label });
  }
  setTableColumns(tableKey, columns);
  const dropdown = document.querySelector('.inline-col-dropdown');
  if (dropdown) dropdown.remove();
  render();
}

// ── Render Functions ────────────────────────────────────────────────────────

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

function renderBreadcrumb() {
  const trail = document.getElementById('breadcrumb-trail');
  const root = document.getElementById('breadcrumb-root');
  root.onclick = (e) => { e.preventDefault(); navigateTable(null); };

  if (activeTableIndex != null && tableDefs[activeTableIndex]) {
    const def = tableDefs[activeTableIndex];
    trail.innerHTML = `<span class="sep">/</span><span style="color:var(--text-primary)">${escapeHtml(def.label)}</span>`;
  } else {
    trail.innerHTML = '';
  }
}

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

function renderMapFilters() {
  const el = document.getElementById('map-filters');
  if (!manifest) return;
  const maps = Object.keys(manifest.maps).sort();
  const anySelected = maps.some(m => selectedMaps[m]);
  const allSelected = anySelected && maps.every(m => selectedMaps[m]);

  el.innerHTML = `<label><input type="checkbox"
    ${allSelected ? 'checked' : ''}
    onchange="toggleAllMaps(this.checked)"> All Maps</label>` +
    maps.map(m => `<label><input type="checkbox"
      ${selectedMaps[m] ? 'checked' : ''}
      onchange="toggleMapFilter('${escapeHtml(m)}', this.checked)"> ${escapeHtml(m)}</label>`).join('');
}

function renderOverviewMode() {
  const content = document.getElementById('content');
  let html = '';

  for (let i = 0; i < tableDefs.length; i++) {
    const def = tableDefs[i];
    if (!def.visible) continue;

    const entries = filterEntriesByTable(filteredEntries, def);
    if (entries.length === 0) continue;

    const tableKey = `table:${def.label}`;
    const columns = getTableColumns(tableKey);
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

  // "Other" section: entries not matching any visible table
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

  if (!html) html = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No visible tables. Add or enable tables in the sidebar.</div>';
  content.innerHTML = html;
}

function renderFocusedMode() {
  const content = document.getElementById('content');
  const def = tableDefs[activeTableIndex];
  if (!def) { content.innerHTML = ''; return; }

  const entries = filterEntriesByTable(filteredEntries, def);
  const tableKey = `table:${def.label}`;
  const columns = getTableColumns(tableKey);
  const s = getSort(tableKey);
  const { thead, tbody, visibleCount, totalCount } = buildTableHTML(entries, columns, s.col, s.dir, tableKey);

  content.innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

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
  const fields = [
    { key: 'type', label: 'Type' },
    { key: 'rarity', label: 'Rarity' },
    { key: 'name', label: 'Name' },
    { key: 'id', label: 'ID' },
    { key: 'description', label: 'Description' },
    { key: 'size_x', label: 'Size X' },
    { key: 'size_y', label: 'Size Y' },
  ];
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
  conditions[index].value = '';
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
    const oldLabel = tableDefs[modalState.editIndex].label;
    tableDefs[modalState.editIndex] = newDef;
    if (oldLabel !== label) {
      const oldCols = loadTableColumns(oldLabel);
      if (oldCols) {
        saveTableColumns(label, oldCols);
        saveTableColumns(oldLabel, null);
      }
    }
  } else {
    tableDefs.push(newDef);
  }

  saveTableDefs(tableDefs);
  closeModal();
  render();
}

// ── Custom Column Modal ──────────────────────────────────────────────────────

function openColModal(tableKey, editId) {
  colModalState = { tableKey, editId: editId || null };
  const overlay = document.getElementById('col-modal-overlay');
  const titleEl = document.getElementById('col-modal-title');
  const labelInput = document.getElementById('col-modal-label');
  const exprInput = document.getElementById('col-modal-expr');

  // Close the add-column dropdown if open
  const dropdown = document.querySelector('.inline-col-dropdown');
  if (dropdown) dropdown.remove();

  if (editId) {
    const cc = customColumns.find(c => c.id === editId);
    if (cc) {
      titleEl.textContent = 'Edit Custom Column';
      labelInput.value = cc.label;
      exprInput.value = cc.expr;
    }
  } else {
    titleEl.textContent = 'Custom Column';
    labelInput.value = '';
    exprInput.value = '';
  }

  updateColModalPreview();
  overlay.style.display = 'flex';
  labelInput.focus();
}

function closeColModal() {
  document.getElementById('col-modal-overlay').style.display = 'none';
  document.getElementById('expr-autocomplete').classList.remove('open');
  colModalState = null;
}

function onExprInput(input) {
  updateExprAutocomplete(input);
  updateColModalPreview();
}

function updateExprAutocomplete(input) {
  const ac = document.getElementById('expr-autocomplete');
  const val = input.value;
  const cursor = input.selectionStart;

  // Find the current token being typed (last word-like segment before cursor)
  const before = val.substring(0, cursor);
  const match = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*)?$/);
  const partial = match ? match[1] || '' : '';

  if (partial.length < 1) {
    ac.classList.remove('open');
    return;
  }

  const lower = partial.toLowerCase();
  const matches = ALL_AVAILABLE_COLUMNS.filter(c =>
    c.label.toLowerCase().includes(lower) || c.key.toLowerCase().includes(lower)
  ).slice(0, 8);

  if (matches.length === 0) {
    ac.classList.remove('open');
    return;
  }

  ac.innerHTML = matches.map(c =>
    `<div class="expr-ac-item" onmousedown="insertExprField(event, '${escapeHtml(c.key)}')">${escapeHtml(c.label)} <span class="ac-key">${escapeHtml(c.key)}</span></div>`
  ).join('');
  ac.classList.add('open');
}

function insertExprField(event, fieldKey) {
  event.preventDefault();
  const input = document.getElementById('col-modal-expr');
  const val = input.value;
  const cursor = input.selectionStart;

  // Find and replace the partial token before cursor
  const before = val.substring(0, cursor);
  const after = val.substring(cursor);
  const match = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*)?$/);
  const start = match ? cursor - (match[1] || '').length : cursor;

  input.value = val.substring(0, start) + fieldKey + after;
  const newCursor = start + fieldKey.length;
  input.selectionStart = input.selectionEnd = newCursor;
  input.focus();

  document.getElementById('expr-autocomplete').classList.remove('open');
  updateColModalPreview();
}

function updateColModalPreview() {
  const preview = document.getElementById('col-modal-preview');
  const expr = document.getElementById('col-modal-expr').value.trim();

  if (!expr) {
    preview.innerHTML = '<div class="preview-label">Preview — enter an expression</div>';
    return;
  }

  // Get sample entries from the active table
  let sampleEntries = filteredEntries;
  if (colModalState && colModalState.tableKey) {
    const label = getTableLabel(colModalState.tableKey);
    const def = tableDefs.find(d => d.label === label);
    if (def) sampleEntries = filterEntriesByTable(filteredEntries, def);
  }

  // Pick up to 5 entries that have at least some fields in the expression
  const fields = extractExprFields(expr);
  const relevant = sampleEntries.filter(e =>
    fields.some(f => getNestedValue(e, f) != null)
  ).slice(0, 5);

  if (relevant.length === 0) {
    preview.innerHTML = '<div class="preview-label">No matching entries found for these fields</div>';
    return;
  }

  const rows = relevant.map(e => {
    const val = evaluateExpr(expr, e);
    const valStr = val != null ? String(val) : '—';
    const cls = val != null ? 'preview-val' : 'preview-err';
    return `<div class="col-preview-row"><span class="preview-name">${escapeHtml(e.name)}</span><span class="${cls}">${escapeHtml(valStr)}</span></div>`;
  }).join('');

  preview.innerHTML = `<div class="preview-label">Preview</div>${rows}`;
}

function saveColModal() {
  const label = document.getElementById('col-modal-label').value.trim();
  const expr = document.getElementById('col-modal-expr').value.trim();

  if (!label) { document.getElementById('col-modal-label').focus(); return; }
  if (!expr) { document.getElementById('col-modal-expr').focus(); return; }

  if (colModalState.editId) {
    // Update existing
    const cc = customColumns.find(c => c.id === colModalState.editId);
    if (cc) { cc.label = label; cc.expr = expr; }
  } else {
    // Create new
    const id = `cc_${Date.now()}`;
    customColumns.push({ id, label, expr });

    // Auto-add to the table that triggered the modal
    if (colModalState.tableKey) {
      const columns = [...getTableColumns(colModalState.tableKey), { key: `_custom:${id}`, label, expr }];
      setTableColumns(colModalState.tableKey, columns);
    }
  }

  saveCustomColumns(customColumns);
  closeColModal();
  render();
}

// ── Sidebar Table List ───────────────────────────────────────────────────────

let tableDragSrcIdx = null;

function toggleTableVisible(index, visible) {
  tableDefs[index].visible = visible;
  saveTableDefs(tableDefs);
  render();
}

function removeTableDef(index) {
  const label = tableDefs[index].label;
  tableDefs.splice(index, 1);
  saveTableDefs(tableDefs);
  saveTableColumns(label, null);
  // If we were viewing the removed table, go back to All
  if (activeTableIndex === index) activeTableIndex = null;
  else if (activeTableIndex != null && activeTableIndex > index) activeTableIndex--;
  render();
}

function onTableDragStart(e, idx) { tableDragSrcIdx = idx; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onTableDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onTableDrop(e, idx) {
  e.preventDefault();
  if (tableDragSrcIdx === null || tableDragSrcIdx === idx) return;
  // Track the active table through the reorder
  const activeLabel = activeTableIndex != null ? tableDefs[activeTableIndex].label : null;
  const [moved] = tableDefs.splice(tableDragSrcIdx, 1);
  tableDefs.splice(idx, 0, moved);
  // Restore activeTableIndex to the same label
  if (activeLabel != null) {
    activeTableIndex = tableDefs.findIndex(d => d.label === activeLabel);
    if (activeTableIndex < 0) activeTableIndex = null;
  }
  saveTableDefs(tableDefs);
  tableDragSrcIdx = null;
  render();
}
function onTableDragEnd(e) { e.target.classList.remove('dragging'); tableDragSrcIdx = null; }

// ── Actions ─────────────────────────────────────────────────────────────────

function navigateTable(index) {
  activeTableIndex = index;
  location.hash = index != null ? `table:${tableDefs[index].label}` : '';
  render();
}

function doSort(tableKey, colKey) {
  const s = sortState[tableKey] || { col: null, dir: 1 };
  if (s.col === colKey) s.dir *= -1;
  else { s.col = colKey; s.dir = 1; }
  sortState[tableKey] = s;
  render();
}

function onColFilter(input) {
  const tableKey = input.dataset.pathkey;
  const colKey = input.dataset.colkey;
  if (!colFilters[tableKey]) colFilters[tableKey] = {};
  colFilters[tableKey][colKey] = input.value;
  input.classList.toggle('active', input.value.trim().length > 0);
  render();
  requestAnimationFrame(() => {
    const el = document.querySelector(`input[data-pathkey="${CSS.escape(tableKey)}"][data-colkey="${CSS.escape(colKey)}"]`);
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  });
}

function toggleCollapse(label) {
  if (collapsedSections[label]) delete collapsedSections[label];
  else collapsedSections[label] = true;
  saveState();
  render();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('gear-btn').classList.toggle('active');
}

// ── Map Filter ──────────────────────────────────────────────────────────────

async function toggleAllMaps(checked) {
  if (!manifest) return;
  const maps = Object.keys(manifest.maps);
  if (checked) {
    for (const m of maps) selectedMaps[m] = true;
  } else {
    selectedMaps = {};
  }
  saveState();
  await applyMapFilter();
}

async function toggleMapFilter(mapName, checked) {
  if (checked) selectedMaps[mapName] = true;
  else delete selectedMaps[mapName];
  saveState();
  await applyMapFilter();
}

async function applyMapFilter() {
  const selected = Object.keys(selectedMaps).filter(m => selectedMaps[m]);

  if (selected.length === 0) {
    mapFilterIds = null;
    filteredEntries = allEntries;
  } else {
    const ids = new Set();
    const mapEntries = [];
    const seenGuids = new Set(allEntries.map(e => e.guid));

    for (const mapName of selected) {
      if (!mapDataCache[mapName]) {
        mapDataCache[mapName] = await dataLoader.getMapData(mapName);
      }
      const md = mapDataCache[mapName];
      if (!md) continue;

      const spawnable = getSpawnableIds(md);
      if (spawnable) {
        for (const id of spawnable) ids.add(id);
      }

      const mapInfo = manifest.maps[mapName];
      if (mapInfo && mapInfo.has_custom_entries && md.entries) {
        for (const entry of md.entries) {
          ids.add(entry.id);
          if (!seenGuids.has(entry.guid)) {
            seenGuids.add(entry.guid);
            mapEntries.push(entry);
          }
        }
      }
    }

    mapFilterIds = ids;
    const baseMatches = allEntries.filter(e => ids.has(e.id));
    filteredEntries = baseMatches.concat(mapEntries);
  }

  renderMapFilters();
  render();
}

// ── Hash Routing ────────────────────────────────────────────────────────────

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

// ── Render ──────────────────────────────────────────────────────────────────

function renderTableInfo() {
  const el = document.getElementById('table-info');
  if (isOverviewMode() || activeTableIndex == null || !tableDefs[activeTableIndex]) {
    el.style.display = 'none';
    return;
  }
  const def = tableDefs[activeTableIndex];
  const entries = filterEntriesByTable(filteredEntries, def);
  const filterDesc = describeTableFilter(def);
  let text = `${entries.length} entries`;
  if (filterDesc) text += ` — ${filterDesc}`;
  el.textContent = text;
  el.style.display = '';
}

function render() {
  const content = document.getElementById('content');
  content.classList.toggle('focused', !isOverviewMode());
  renderTabs();
  renderBreadcrumb();
  renderTableInfo();
  renderTableList();
  if (isOverviewMode()) renderOverviewMode();
  else renderFocusedMode();
}

// ── Init ────────────────────────────────────────────────────────────────────

document.getElementById('gear-btn').addEventListener('click', toggleSidebar);
document.getElementById('search').addEventListener('input', debounce(() => render(), 200));

window.addEventListener('hashchange', () => {
  parseHash();
  render();
});

async function init() {
  try {
    manifest = await dataLoader.getManifest();
    allEntries = await dataLoader.getBaseEntries();
    filteredEntries = allEntries;
    renderMapFilters();
    parseHash();
    const hasPersistedMaps = Object.keys(selectedMaps).some(m => selectedMaps[m]);
    if (hasPersistedMaps) {
      await applyMapFilter();
    } else {
      render();
    }
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<div style="text-align:center;padding:2rem;color:#e34f4f;">Failed to load data: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

init();
