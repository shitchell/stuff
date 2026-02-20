// Unturned Catalog — catalog.js

// ── State ───────────────────────────────────────────────────────────────────

let allEntries = [];
let filteredEntries = [];
let currentPath = [];
let activeTab = null;
let sortState = {};         // pathKey -> { col, dir }
let colFilters = {};        // pathKey -> { colKey: filterString }
let addingColumn = false;
let colEditTarget = null;
let hiddenTables = {};
let collapsedSections = {};
let columnOverrides = loadColumnOverrides();
let selectedMaps = {};      // mapName -> true
let mapDataCache = {};      // mapName -> { map, entries?, assets? }
let mapFilterIds = null;    // Set of entry IDs, or null (show all)
let manifest = null;
let modalState = null; // { editIndex: number|null, anyConditions: [], allConditions: [] }

// Load persisted state
try { hiddenTables = JSON.parse(localStorage.getItem('ut:catalog:hidden') || '{}'); } catch {}
try { collapsedSections = JSON.parse(localStorage.getItem('ut:catalog:collapsed') || '{}'); } catch {}
try { selectedMaps = JSON.parse(localStorage.getItem('ut:catalog:maps') || '{}'); } catch {}

function saveState() {
  saveColumnOverrides(columnOverrides);
  localStorage.setItem('ut:catalog:hidden', JSON.stringify(hiddenTables));
  localStorage.setItem('ut:catalog:collapsed', JSON.stringify(collapsedSections));
  localStorage.setItem('ut:catalog:maps', JSON.stringify(selectedMaps));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pk(path) { return path.join('/'); }
function isOverviewMode() { return currentPath.length === 0; }

function getEntriesAtPath(path) {
  return filteredEntries.filter(e => pathStartsWith(e.category || [], path));
}

function getSubcategories(path, entries) {
  const depth = path.length;
  const subs = new Map();
  for (const e of entries) {
    if ((e.category || []).length > depth) {
      const sub = e.category[depth];
      subs.set(sub, (subs.get(sub) || 0) + 1);
    }
  }
  return [...subs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getTopLevelCategories() {
  const cats = new Map();
  for (const e of filteredEntries) {
    if ((e.category || []).length > 0) {
      const c = e.category[0];
      cats.set(c, (cats.get(c) || 0) + 1);
    }
  }
  return [...cats.entries()].sort((a, b) => b[1] - a[1]);
}

function getSort(pathKey) { return sortState[pathKey] || { col: null, dir: 1 }; }

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

function getColsForPath(path) {
  const entries = getEntriesAtPath(path);
  return getColumnsForPath(path, columnOverrides, entries);
}

// ── Table Builder ───────────────────────────────────────────────────────────

function buildTableHTML(entries, columns, sortKey, sortDir, pathKeyForSort) {
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
  sorted = applyColFilters(sorted, columns, colFilters[pathKeyForSort]);

  const esc = escapeHtml;
  const filters = colFilters[pathKeyForSort] || {};

  const headerRow = `<tr>${columns.map(c => {
    const arrow = sortKey === c.key ? (sortDir === 1 ? '&#9650;' : '&#9660;') : '';
    const thCls = c.key === 'id' ? ' class="id-col"' : '';
    return `<th${thCls} onclick="doSort('${esc(pathKeyForSort)}','${esc(c.key)}')">${esc(c.label)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('')}</tr>`;

  const filterRow = `<tr class="filter-row">${columns.map(c => {
    const val = esc(filters[c.key] || '');
    const isActive = val ? 'active' : '';
    const placeholder = isNumericColumn(c.key, entries) ? '&gt;, &lt;, =...' : 'filter...';
    return `<th><input class="col-filter ${isActive}" type="text" value="${val}"
      placeholder="${placeholder}"
      data-pathkey="${esc(pathKeyForSort)}" data-colkey="${esc(c.key)}"
      oninput="onColFilter(this)" /></th>`;
  }).join('')}</tr>`;

  const thead = headerRow + filterRow;

  const tbody = sorted.map(e => `<tr data-guid="${e.guid || ''}">${columns.map(c => {
    let val = resolveColumnValue(e, c);
    if (val == null) val = '\u2014';
    const isNum = typeof val === 'number';
    const cls = c.key === 'id' ? 'id-cell' : c.key === 'name' ? 'name-cell' : c.key === 'type' ? 'type-cell' : isNum ? 'num-cell' : '';
    const rar = c.key === 'rarity' ? `rarity-${val}` : '';
    return `<td class="${cls} ${rar}">${esc(val)}</td>`;
  }).join('')}</tr>`).join('');

  return { thead, tbody, visibleCount: sorted.length, totalCount: entries.length };
}

// ── Render Functions ────────────────────────────────────────────────────────

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  const cats = getTopLevelCategories();
  const allTab = `<div class="tab all-tab ${isOverviewMode() ? 'active' : ''}" onclick="navigate([])">
    All<span class="count">${filteredEntries.length}</span></div>`;
  const catTabs = cats.map(([name, count]) => `
    <div class="tab ${activeTab === name ? 'active' : ''}" onclick="navigate(['${escapeHtml(name)}'])">
      ${escapeHtml(name)}<span class="count">${count}</span>
    </div>`).join('');
  tabsEl.innerHTML = allTab + catTabs;
}

function renderBreadcrumb() {
  const root = document.getElementById('breadcrumb-root');
  root.onclick = (e) => { e.preventDefault(); navigate([]); };

  const trail = document.getElementById('breadcrumb-trail');
  if (currentPath.length === 0) { trail.innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < currentPath.length; i++) {
    const sub = currentPath.slice(0, i + 1);
    const isLast = i === currentPath.length - 1;
    html += '<span class="sep">/</span>';
    html += isLast
      ? `<span style="color:var(--text-primary)">${escapeHtml(currentPath[i])}</span>`
      : `<a href="#" onclick="navigate(${escapeHtml(JSON.stringify(sub))});return false;">${escapeHtml(currentPath[i])}</a>`;
  }
  trail.innerHTML = html;
}

function renderCategoryToggles() {
  const el = document.getElementById('tab-toggles');
  const cats = getTopLevelCategories();
  el.innerHTML = cats.map(([name, count]) => `
    <label>
      <input type="checkbox" ${hiddenTables[name] ? '' : 'checked'}
             onchange="toggleTableVisibility('${escapeHtml(name)}', this.checked)">
      ${escapeHtml(name)} <span style="color:var(--text-muted);font-size:0.75rem">(${count})</span>
    </label>
  `).join('');
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
    // No maps selected: show all entries
    mapFilterIds = null;
    filteredEntries = allEntries;
  } else {
    // Build set of IDs available on any selected map, and collect map-specific
    // entries that aren't part of the base data
    const ids = new Set();
    const mapEntries = [];          // map-specific entries to merge in
    const seenGuids = new Set(allEntries.map(e => e.guid));

    for (const mapName of selected) {
      // Load map data (cached by dataLoader)
      if (!mapDataCache[mapName]) {
        mapDataCache[mapName] = await dataLoader.getMapData(mapName);
      }
      const md = mapDataCache[mapName];
      if (!md) continue;

      // Add spawnable IDs (core items available on this map)
      const spawnable = getSpawnableIds(md);
      if (spawnable) {
        for (const id of spawnable) ids.add(id);
      }

      // Add map-specific entries (for maps with has_custom_entries)
      const mapInfo = manifest.maps[mapName];
      if (mapInfo && mapInfo.has_custom_entries && md.entries) {
        for (const entry of md.entries) {
          ids.add(entry.id);
          // Collect entries not already in the base pool (dedup by guid)
          if (!seenGuids.has(entry.guid)) {
            seenGuids.add(entry.guid);
            mapEntries.push(entry);
          }
        }
      }
    }

    mapFilterIds = ids;
    // Filter base entries by spawnable IDs, then append map-specific entries
    const baseMatches = allEntries.filter(e => ids.has(e.id));
    filteredEntries = baseMatches.concat(mapEntries);
  }

  renderMapFilters();
  render();
}

function renderOverviewMode() {
  const content = document.getElementById('content');
  const cats = getTopLevelCategories();
  let html = '';

  for (const [catName, count] of cats) {
    if (hiddenTables[catName]) continue;

    const catPath = [catName];
    const entries = getEntriesAtPath(catPath);
    const { columns } = getColsForPath(catPath);
    const s = getSort(catName);
    const { thead, tbody, visibleCount, totalCount } = buildTableHTML(entries, columns, s.col, s.dir, catName);
    const collapsed = collapsedSections[catName];

    html += `
      <div class="table-section" id="section-${escapeHtml(catName)}">
        <div class="table-section-header ${collapsed ? 'collapsed' : ''}"
             onclick="toggleCollapse('${escapeHtml(catName)}')">
          <span class="collapse-arrow">&#9660;</span>
          <span class="section-title">${escapeHtml(catName)}</span>
          <span class="section-count">${visibleCount} / ${totalCount}</span>
          <a class="section-drill" href="#" onclick="event.stopPropagation();navigate(['${escapeHtml(catName)}']);return false;">
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
  content.innerHTML = html;
}

function renderFocusedMode() {
  const content = document.getElementById('content');
  const entries = getEntriesAtPath(currentPath);
  const subs = getSubcategories(currentPath, entries);
  const { columns } = getColsForPath(currentPath);
  const key = pk(currentPath);
  const s = getSort(key);
  const { thead, tbody, visibleCount, totalCount } = buildTableHTML(entries, columns, s.col, s.dir, key);

  let html = '';

  if (subs.length > 0) {
    html += `<div class="subcategories">${subs.map(([name, count]) => {
      const path = [...currentPath, name];
      return `<a class="subcat-chip" href="#" onclick="navigate(${escapeHtml(JSON.stringify(path))});return false;">
        ${escapeHtml(name)}<span class="chip-count">${count}</span></a>`;
    }).join('')}</div>`;
  }

  html += `<div class="result-info">${visibleCount} of ${totalCount} entries in ${currentPath.map(escapeHtml).join(' > ')}</div>`;
  html += `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  content.innerHTML = html;
}

// ── Column Config ───────────────────────────────────────────────────────────

let dragSrcIdx = null;

function getColEditPath() {
  if (!isOverviewMode()) return currentPath;
  if (colEditTarget !== null) return colEditTarget.split('/').filter(Boolean);
  const cats = getTopLevelCategories();
  for (const [name] of cats) { if (!hiddenTables[name]) return [name]; }
  return [];
}

function renderColumnConfig() {
  const editPath = getColEditPath();
  const editKey = pk(editPath);
  const { columns, fromPath, isOverride } = getColsForPath(editPath);

  const targetArea = document.getElementById('col-target-area');
  if (isOverviewMode()) {
    const cats = getTopLevelCategories().filter(([n]) => !hiddenTables[n]);
    targetArea.innerHTML = `<select class="col-target-select" onchange="colEditTarget=this.value;renderColumnConfig();">
      ${cats.map(([name]) => `<option value="${escapeHtml(name)}" ${editKey === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
    </select>`;
  } else {
    targetArea.innerHTML = '';
  }

  const hint = document.getElementById('col-path-hint');
  if (fromPath === editKey) {
    hint.textContent = isOverride ? 'Custom (modified)' : '';
  } else {
    hint.textContent = `Inherited from ${fromPath || 'root'}`;
  }

  const list = document.getElementById('col-list');
  list.innerHTML = columns.map((col, i) => `
    <li class="col-item" draggable="true" data-idx="${i}"
        ondragstart="onColDragStart(event,${i})" ondragover="onColDragOver(event,${i})"
        ondrop="onColDrop(event,${i})" ondragend="onColDragEnd(event)">
      <span class="drag-handle">&#9776;</span>
      <span class="col-label">${escapeHtml(col.label)}</span>
      <span class="remove-btn" onclick="removeColumn(${i})" title="Remove">&minus;</span>
    </li>`).join('');

  const addArea = document.getElementById('add-col-area');
  if (!addingColumn) {
    addArea.innerHTML = '<button class="add-col-btn" onclick="startAddColumn()">+ Add column</button>';
  }
}

function startAddColumn() {
  addingColumn = true;
  const addArea = document.getElementById('add-col-area');
  addArea.innerHTML = `
    <div class="add-col-input-wrap">
      <input type="text" id="add-col-input" placeholder="Search columns..."
             oninput="filterAutocomplete()" onfocus="filterAutocomplete()"
             onkeydown="if(event.key==='Escape'){cancelAddColumn();}">
      <div class="autocomplete-list" id="autocomplete-list"></div>
    </div>`;
  document.getElementById('add-col-input').focus();
  filterAutocomplete();
  setTimeout(() => document.addEventListener('click', onAddColOutsideClick), 0);
}

function onAddColOutsideClick(e) {
  const wrap = document.querySelector('.add-col-input-wrap');
  if (wrap && !wrap.contains(e.target)) cancelAddColumn();
}

function cancelAddColumn() {
  addingColumn = false;
  document.removeEventListener('click', onAddColOutsideClick);
  renderColumnConfig();
}

function filterAutocomplete() {
  const input = document.getElementById('add-col-input');
  const q = input.value.toLowerCase();
  const editPath = getColEditPath();
  const { columns } = getColsForPath(editPath);
  const active = new Set(columns.map(c => c.key));
  const matches = ALL_AVAILABLE_COLUMNS.filter(c => !active.has(c.key) &&
    (c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)));
  document.getElementById('autocomplete-list').innerHTML = matches.slice(0, 10).map(c => `
    <div class="autocomplete-item" onclick="addColumn('${escapeHtml(c.key)}','${escapeHtml(c.label)}')">
      ${escapeHtml(c.label)}<span class="ac-key">${escapeHtml(c.key)}</span></div>`).join('');
}

function addColumn(key, label) {
  const editPath = getColEditPath();
  const k = pk(editPath);
  const { columns } = getColsForPath(editPath);
  columnOverrides[k] = [...columns, { key, label }];
  saveState();
  addingColumn = false;
  document.removeEventListener('click', onAddColOutsideClick);
  render();
}

function removeColumn(idx) {
  const editPath = getColEditPath();
  const k = pk(editPath);
  const { columns } = getColsForPath(editPath);
  columnOverrides[k] = columns.filter((_, i) => i !== idx);
  saveState();
  render();
}

function onColDragStart(e, idx) { dragSrcIdx = idx; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onColDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onColDrop(e, idx) {
  e.preventDefault();
  if (dragSrcIdx === null || dragSrcIdx === idx) return;
  const editPath = getColEditPath();
  const k = pk(editPath);
  const { columns } = getColsForPath(editPath);
  const cols = [...columns];
  const [moved] = cols.splice(dragSrcIdx, 1);
  cols.splice(idx, 0, moved);
  columnOverrides[k] = cols;
  saveState();
  dragSrcIdx = null;
  render();
}
function onColDragEnd(e) { e.target.classList.remove('dragging'); dragSrcIdx = null; }

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

// ── Actions ─────────────────────────────────────────────────────────────────

function navigate(path) {
  currentPath = path;
  activeTab = path.length > 0 ? path[0] : null;
  addingColumn = false;
  colEditTarget = null;
  location.hash = path.length > 0 ? path.join('/') : '';
  render();
}

function doSort(pathKey, colKey) {
  const s = sortState[pathKey] || { col: null, dir: 1 };
  if (s.col === colKey) s.dir *= -1;
  else { s.col = colKey; s.dir = 1; }
  sortState[pathKey] = s;
  render();
}

function onColFilter(input) {
  const pathKey = input.dataset.pathkey;
  const colKey = input.dataset.colkey;
  if (!colFilters[pathKey]) colFilters[pathKey] = {};
  colFilters[pathKey][colKey] = input.value;
  input.classList.toggle('active', input.value.trim().length > 0);
  render();
  requestAnimationFrame(() => {
    const el = document.querySelector(`input[data-pathkey="${pathKey}"][data-colkey="${colKey}"]`);
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  });
}

function toggleTableVisibility(name, visible) {
  if (visible) delete hiddenTables[name];
  else hiddenTables[name] = true;
  saveState();
  render();
}

function toggleCollapse(catName) {
  if (collapsedSections[catName]) delete collapsedSections[catName];
  else collapsedSections[catName] = true;
  saveState();
  render();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('gear-btn').classList.toggle('active');
}

function parseHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  currentPath = hash ? hash.split('/') : [];
  activeTab = currentPath.length > 0 ? currentPath[0] : null;
}

// ── Render ──────────────────────────────────────────────────────────────────

function render() {
  renderTabs();
  renderBreadcrumb();
  renderCategoryToggles();
  if (isOverviewMode()) renderOverviewMode();
  else renderFocusedMode();
  renderColumnConfig();
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
    // Apply persisted map filter if any maps were selected
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
