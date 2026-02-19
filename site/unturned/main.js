// Unturned Data Browser
// Interactive viewer with search, filters, sortable columns, and collapsible sections.

const STORAGE_PREFIX = 'unturned:';

// === State ===
let sections = [];
let allRowRefs = [];      // {sectionIdx, rowIdx, tr, cells}
let activeCategories;     // Set of checked top-level category names
let activeSearchFields;   // Set of checked column names
let activeMaps = null;    // Set of checked map names, or null if no Maps column exists
let totalRows = 0;
// Maps section path key -> { sectionEl, navLink }
const sectionRegistry = new Map();

// === DOM ===
const searchInput = document.getElementById('search');
const resultCount = document.getElementById('result-count');
const categoryFilters = document.getElementById('category-filters');
const fieldFilters = document.getElementById('field-filters');
const mapFilters = document.getElementById('map-filters');
const mapFilterGroup = document.getElementById('map-filter-group');
const content = document.getElementById('content');
const sidebar = document.getElementById('sidebar');

// === localStorage helpers ===
function saveSet(key, set) {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify([...set]));
}

function loadSet(key) {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
        try { return new Set(JSON.parse(raw)); } catch { /* fall through */ }
    }
    return null;
}

function saveCollapsed() {
    const collapsed = [];
    content.querySelectorAll('.data-section.collapsed').forEach(el => {
        if (el.dataset.sectionPath) {
            collapsed.push(el.dataset.sectionPath);
        }
    });
    localStorage.setItem(STORAGE_PREFIX + 'collapsed', JSON.stringify(collapsed));
}

function loadCollapsed() {
    const raw = localStorage.getItem(STORAGE_PREFIX + 'collapsed');
    if (raw) {
        try { return new Set(JSON.parse(raw)); } catch { /* fall through */ }
    }
    return new Set();
}

// === Load & Init ===
async function init() {
    const resp = await fetch('./data.json', { cache: 'no-cache' });
    sections = await resp.json();
    totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);

    const categories = [...new Set(sections.map(s => s.path[0]).filter(Boolean))].sort();
    const fields = [...new Set(sections.flatMap(s => s.columns))].sort();

    // Restore saved state or default to all checked
    const savedCategories = loadSet('categories');
    const savedFields = loadSet('fields');
    activeCategories = savedCategories
        ? new Set([...savedCategories].filter(c => categories.includes(c)))
        : new Set(categories);
    activeSearchFields = savedFields
        ? new Set([...savedFields].filter(f => fields.includes(f)))
        : new Set(fields);

    // Scan for unique map names across all sections
    const mapNameSet = new Set();
    let hasMapsColumn = false;
    for (const s of sections) {
        const mapsColIdx = s.columns.indexOf('Maps');
        if (mapsColIdx === -1) continue;
        hasMapsColumn = true;
        for (const row of s.rows) {
            const val = row[mapsColIdx];
            if (val) {
                for (const m of val.split(', ')) {
                    if (m) mapNameSet.add(m);
                }
            }
        }
    }
    const mapNames = [...mapNameSet].sort();

    buildCheckboxList(categoryFilters, categories, activeCategories, () => {
        saveSet('categories', activeCategories);
        applyFilters();
    });

    // Build map filter if Maps column exists with actual map names
    if (hasMapsColumn && mapNames.length > 0) {
        const savedMaps = loadSet('maps');
        // Default to empty set (no filter applied = show all)
        activeMaps = savedMaps
            ? new Set([...savedMaps].filter(m => mapNames.includes(m)))
            : new Set();
        mapFilterGroup.style.display = '';
        buildCheckboxList(mapFilters, mapNames, activeMaps, () => {
            saveSet('maps', activeMaps);
            applyFilters();
        });
    }

    buildCheckboxList(fieldFilters, fields, activeSearchFields, () => {
        saveSet('fields', activeSearchFields);
        applyFilters();
    });

    renderContent();
    buildSidebar();
    applyFilters();

    searchInput.addEventListener('input', applyFilters);
}

// === Checkbox List Builder ===
function buildCheckboxList(container, items, activeSet, onChange) {
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-all';
    const toggleCb = document.createElement('input');
    toggleCb.type = 'checkbox';
    toggleCb.checked = activeSet.size === items.length;
    toggleCb.addEventListener('change', () => {
        const checked = toggleCb.checked;
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
        });
        if (checked) {
            items.forEach(i => activeSet.add(i));
        } else {
            activeSet.clear();
        }
        onChange();
    });
    toggleLabel.append(toggleCb, ' All');
    container.appendChild(toggleLabel);

    for (const item of items) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = activeSet.has(item);
        cb.addEventListener('change', () => {
            if (cb.checked) {
                activeSet.add(item);
            } else {
                activeSet.delete(item);
            }
            toggleCb.checked = activeSet.size === items.length;
            onChange();
        });
        label.append(cb, ' ' + item.replace(/_/g, ' '));
        container.appendChild(label);
    }
}

// === Render ===
function renderContent() {
    content.innerHTML = '';
    allRowRefs = [];
    sectionRegistry.clear();

    const tree = buildTree(sections);
    const collapsedPaths = loadCollapsed();
    renderNode(tree, content, 0, [], collapsedPaths);
}

function buildTree(sections) {
    const root = { children: new Map(), tables: [] };
    for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        let node = root;
        for (const part of s.path) {
            if (!node.children.has(part)) {
                node.children.set(part, { children: new Map(), tables: [] });
            }
            node = node.children.get(part);
        }
        node.tables.push(i);
    }
    return root;
}

function renderNode(node, container, depth, pathSoFar, collapsedPaths) {
    const sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, child] of sortedChildren) {
        const currentPath = [...pathSoFar, name];
        const pathKey = currentPath.join('/');

        const section = document.createElement('div');
        section.className = 'data-section';
        section.dataset.category = name;
        section.dataset.sectionPath = pathKey;
        section.id = 'section-' + pathKey.replace(/[^a-zA-Z0-9]/g, '-');
        if (depth === 0) {
            section.dataset.topCategory = name;
        }

        if (collapsedPaths.has(pathKey)) {
            section.classList.add('collapsed');
        }

        const level = Math.min(depth + 2, 5);
        const header = document.createElement('h' + level);
        header.className = 'section-header';
        header.innerHTML = `<span class="collapse-icon">▼</span> ${name.replace(/_/g, ' ')}`;
        header.addEventListener('click', () => {
            section.classList.toggle('collapsed');
            saveCollapsed();
            syncNavCollapsed();
        });
        section.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'section-content';

        for (const sIdx of child.tables) {
            const s = sections[sIdx];
            if (s.label) {
                const label = document.createElement('div');
                label.className = 'type-label';
                label.textContent = s.label;
                contentDiv.appendChild(label);
            }
            contentDiv.appendChild(createTable(sIdx));
        }

        renderNode(child, contentDiv, depth + 1, currentPath, collapsedPaths);

        section.appendChild(contentDiv);
        container.appendChild(section);

        // Register for sidebar linking
        sectionRegistry.set(pathKey, { sectionEl: section, navLink: null });
    }
}

function createTable(sectionIdx) {
    const s = sections[sectionIdx];
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    s.columns.forEach((col, colIdx) => {
        const th = document.createElement('th');
        th.innerHTML = col + ' <span class="sort-icon"></span>';
        th.dataset.col = colIdx;
        th.addEventListener('click', () => sortTable(table, colIdx, th));
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let rowIdx = 0; rowIdx < s.rows.length; rowIdx++) {
        const row = s.rows[rowIdx];
        const tr = document.createElement('tr');
        for (const val of row) {
            const td = document.createElement('td');
            td.textContent = val;
            tr.appendChild(td);
        }
        tbody.appendChild(tr);

        // Pre-parse maps for this row if a Maps column exists
        const mapsColIdx = s.columns.indexOf('Maps');
        const rowMaps = mapsColIdx !== -1 && row[mapsColIdx]
            ? new Set(row[mapsColIdx].split(', ').filter(Boolean))
            : new Set();

        allRowRefs.push({
            sectionIdx,
            rowIdx,
            tr,
            cells: row,
            columns: s.columns,
            category: s.path[0] || '',
            maps: rowMaps,
            hasMapsColumn: mapsColIdx !== -1,
        });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

// === Sidebar Nav ===
function buildSidebar() {
    sidebar.innerHTML = '';
    const ul = document.createElement('ul');
    const tree = buildTree(sections);
    buildNavNode(tree, ul, 0, []);
    sidebar.appendChild(ul);
    syncNavCollapsed();
}

function buildNavNode(node, parentUl, depth, pathSoFar) {
    const sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, child] of sortedChildren) {
        const currentPath = [...pathSoFar, name];
        const pathKey = currentPath.join('/');
        const sectionId = 'section-' + pathKey.replace(/[^a-zA-Z0-9]/g, '-');

        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + sectionId;
        a.textContent = name.replace(/_/g, ' ');
        a.className = 'nav-depth-' + Math.min(depth, 3);
        a.dataset.sectionPath = pathKey;

        a.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(sectionId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        li.appendChild(a);
        parentUl.appendChild(li);

        // Store nav link reference
        const reg = sectionRegistry.get(pathKey);
        if (reg) reg.navLink = a;

        // Recurse into a nested <ul> inside this <li>
        if (child.children.size > 0) {
            const childUl = document.createElement('ul');
            li.appendChild(childUl);
            if (reg) reg.navChildren = childUl;
            buildNavNode(child, childUl, depth + 1, currentPath);
        }
    }
}

function syncNavCollapsed() {
    for (const [pathKey, { sectionEl, navLink, navChildren }] of sectionRegistry) {
        if (!navLink) continue;
        const isCollapsed = sectionEl.classList.contains('collapsed');
        navLink.classList.toggle('collapsed-link', isCollapsed);
        if (navChildren) {
            navChildren.style.display = isCollapsed ? 'none' : '';
        }
    }
}

// === Sorting ===
function sortTable(table, colIdx, th) {
    const tbody = table.querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];

    const wasAsc = th.classList.contains('sorted-asc');
    table.querySelectorAll('th').forEach(h => {
        h.classList.remove('sorted-asc', 'sorted-desc');
    });

    const dir = wasAsc ? 'desc' : 'asc';
    th.classList.add('sorted-' + dir);

    rows.sort((a, b) => {
        const aVal = a.children[colIdx]?.textContent || '';
        const bVal = b.children[colIdx]?.textContent || '';
        const cmp = smartCompare(aVal, bVal);
        return dir === 'asc' ? cmp : -cmp;
    });

    for (const row of rows) {
        tbody.appendChild(row);
    }
}

function smartCompare(a, b) {
    const aNum = extractNumber(a);
    const bNum = extractNumber(b);
    if (aNum !== null && bNum !== null) {
        return aNum - bNum;
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function extractNumber(str) {
    if (!str) return null;
    const n = Number(str);
    if (!isNaN(n) && str.trim() !== '') return n;
    const m = str.match(/^(-?\d+\.?\d*)/);
    return m ? Number(m[1]) : null;
}

// === Search & Filter ===
function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visible = 0;

    for (const ref of allRowRefs) {
        if (!activeCategories.has(ref.category)) {
            ref.tr.classList.add('hidden');
            continue;
        }

        // Map filter: if activeMaps has entries, only show rows whose maps
        // intersect with the checked maps. Items with no maps data are always visible.
        if (activeMaps && activeMaps.size > 0) {
            if (ref.hasMapsColumn && ref.maps.size > 0) {
                let mapMatch = false;
                for (const m of ref.maps) {
                    if (activeMaps.has(m)) { mapMatch = true; break; }
                }
                if (!mapMatch) {
                    ref.tr.classList.add('hidden');
                    continue;
                }
            }
            // Items with no maps data (empty set) pass through - always visible
        }

        if (query) {
            let matches = false;
            for (let i = 0; i < ref.cells.length; i++) {
                const colName = ref.columns[i];
                if (!activeSearchFields.has(colName)) continue;
                if (ref.cells[i].toLowerCase().includes(query)) {
                    matches = true;
                    break;
                }
            }
            if (!matches) {
                ref.tr.classList.add('hidden');
                continue;
            }
        }

        ref.tr.classList.remove('hidden');
        visible++;
    }

    updateSectionVisibility();
    updateResultCount(visible, query);
}

function updateSectionVisibility() {
    content.querySelectorAll('.data-section').forEach(section => {
        const hasVisibleRows = section.querySelectorAll('tbody tr:not(.hidden)').length > 0;
        const hasVisibleChildren = [...section.querySelectorAll(':scope > .section-content > .data-section')]
            .some(child => child.style.display !== 'none');

        section.style.display = (hasVisibleRows || hasVisibleChildren) ? '' : 'none';
    });
}

function updateResultCount(visible, query) {
    if (visible === undefined) {
        resultCount.textContent = `${totalRows} entries`;
    } else {
        resultCount.textContent = `${visible} / ${totalRows}`;
    }
}

// === Go ===
init();
