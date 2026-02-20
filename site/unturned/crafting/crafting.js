// Unturned Crafting Viewer
// Visualization of crafting, salvage, and repair recipes using Cytoscape.js

// ── Constants ───────────────────────────────────────────────────────────────

const TYPE_SHAPES = {
    Gun: 'diamond', Melee: 'diamond',
    Shirt: 'round-rectangle', Pants: 'round-rectangle',
    Hat: 'round-rectangle', Vest: 'round-rectangle',
    Backpack: 'round-rectangle', Mask: 'round-rectangle',
    Glasses: 'round-rectangle',
    Food: 'ellipse', Water: 'ellipse', Medical: 'ellipse',
    Barricade: 'hexagon', Structure: 'hexagon',
    Magazine: 'tag',
};

const RARITY_COLORS = {
    Common: '#b0b0b0',
    Uncommon: '#4caf50',
    Rare: '#2196f3',
    Epic: '#9c27b0',
    Legendary: '#ff9800',
    Mythical: '#f44336',
};

const EDGE_COLORS = {
    craft: '#4caf50',
    salvage: '#ff9800',
    repair: '#2196f3',
};

const LS_PREFIX = 'ut:crafting:';

// Use shared escapeHtml from common.js
function esc(str) { return escapeHtml(str); }

// ── State ───────────────────────────────────────────────────────────────────

let cy = null;
let rawData = null;           // { nodes, edges }
let nodeMap = {};             // id -> node data
let edgesByTarget = {};       // targetId -> [edge]
let edgesBySource = {};       // sourceId -> [edge]
let blueprintGroups = {};     // blueprintId -> [edge]
let craftingCategoryList = []; // resolved crafting category names

let viewMode = 'graph';       // 'graph' | 'diagram'
let diagramStack = [];        // stack of item IDs for breadcrumb nav
let currentDiagramId = null;
let selectedItems = null;     // Set of selected item IDs (null = all selected)
let favoriteItems = new Set(lsGet('favorite-items', []));
let carouselIndex = 0;        // Current recipe index in carousel mode
let carouselBpKeys = [];      // Blueprint group keys for current diagram root

// Map blacklist filtering state
let mapFilteredGraph = null;  // null = no map filter, otherwise { nodes, edges, blueprintGroups }
let mapFilteredNodeMap = null; // id -> node for filtered graph
let mapFilteredEdgesByTarget = null;
let mapFilteredEdgesBySource = null;

// Primitive ID sets (computed at data load time)
let primUncraftableIds = new Set();  // H2: no craft recipe + used as ingredient
let primSalvageableIds = new Set();  // H5: salvage outputs
let primNatureIds = new Set();       // H6: nature-sourced items
let primCommonIds = new Set();       // H4: high fan-out (10+ blueprints)

const NATURE_ITEM_NAMES = new Set([
    'Birch Log', 'Birch Stick', 'Maple Log', 'Maple Stick', 'Pine Log', 'Pine Stick',
    'Metal Scrap',
    'Leather', 'Raw Venison', 'Pork',
    'Raw Amber Berries', 'Raw Indigo Berries', 'Raw Jade Berries', 'Raw Mauve Berries',
    'Raw Russet Berries', 'Raw Teal Berries', 'Raw Vermillion Berries',
    'Raw Bass', 'Raw Goldfish', 'Raw Minnow', 'Raw Salmon', 'Raw Squid', 'Raw Trout',
    'Carrot', 'Corn', 'Lettuce', 'Potato', 'Pumpkin', 'Tomato', 'Wheat', 'Eggs',
]);

// ── Settings helpers ────────────────────────────────────────────────────────

function lsGet(key, fallback) {
    try {
        const v = localStorage.getItem(LS_PREFIX + key);
        if (v === null) return fallback;
        return JSON.parse(v);
    } catch { return fallback; }
}

function lsSet(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch {}
}

function getSettings() {
    return {
        mode: lsGet('mode', 'basic'),
        bpCraft: lsGet('bp-craft', true),
        bpSalvage: lsGet('bp-salvage', true),
        bpRepair: lsGet('bp-repair', true),
        nodeLabels: lsGet('node-labels', true),
        shapeByType: lsGet('shape-by-type', true),
        rarityGlow: lsGet('rarity-glow', true),
        nodeSize: lsGet('node-size', 'fixed'),
        edgeLabels: lsGet('edge-labels', true),
        edgeColors: lsGet('edge-colors', true),
        edgeThickness: lsGet('edge-thickness', false),
        toolEdges: lsGet('tool-edges', 'dashed'),
        arrowStyle: lsGet('arrow-style', 'triangle'),
        layoutAlgo: lsGet('layout-algo', 'cose'),
        spacing: lsGet('spacing', 50),
        animate: lsGet('animate', true),
        graphNodeFont: lsGet('graph-node-font', 10),
        graphNodeWeight: lsGet('graph-node-weight', 4),
        graphNodeColor: lsGet('graph-node-color', '#e0e0e0'),
        graphEdgeFont: lsGet('graph-edge-font', 9),
        graphEdgeWeight: lsGet('graph-edge-weight', 4),
        graphEdgeColor: lsGet('graph-edge-color', '#c0c0c0'),
        diagramNodeFont: lsGet('diagram-node-font', 8),
        diagramNodeWeight: lsGet('diagram-node-weight', 4),
        diagramNodeColor: lsGet('diagram-node-color', '#e0e0e0'),
        diagramTargetFont: lsGet('diagram-target-font', 9),
        diagramTargetWeight: lsGet('diagram-target-weight', 7),
        diagramTargetColor: lsGet('diagram-target-color', '#e0e0e0'),
        diagramEdgeFont: lsGet('diagram-edge-font', 22),
        diagramEdgeWeight: lsGet('diagram-edge-weight', 4),
        diagramEdgeColor: lsGet('diagram-edge-color', '#c0c0c0'),
        tooltipFont: lsGet('tooltip-font', 12),
        tooltipWeight: lsGet('tooltip-weight', 4),
        tooltipColor: lsGet('tooltip-color', '#e0e0e0'),
        tooltipNameFont: lsGet('tooltip-name-font', 14),
        tooltipNameWeight: lsGet('tooltip-name-weight', 7),
        tooltipNameColor: lsGet('tooltip-name-color', '#ffd700'),
        multiRecipe: lsGet('multi-recipe', 'ghost'),
        recipeDepth: lsGet('recipe-depth', 0),  // 0 = full/unlimited
        primUncraftable: lsGet('prim-uncraftable', true),
        primSalvageable: lsGet('prim-salvageable', true),
        primNature: lsGet('prim-nature', true),
        primCommon: lsGet('prim-common', false),
    };
}

// ── DOM refs ────────────────────────────────────────────────────────────────

const $cy = document.getElementById('cy');
const $loading = document.getElementById('loading');
const $search = document.getElementById('search');
const $searchCount = document.getElementById('search-count');
const $btnGraph = document.getElementById('btn-graph');
const $btnDiagram = document.getElementById('btn-diagram');
const $diagramNav = document.getElementById('diagram-nav');
const $btnBack = document.getElementById('btn-back');
const $breadcrumb = document.getElementById('breadcrumb');
const $tooltip = document.getElementById('tooltip');
const $itemList = document.getElementById('item-list');
const $itemListSearch = document.getElementById('item-list-search');
const $bpAll = document.getElementById('bp-all');
const $mapFilters = document.getElementById('map-filters');
const $mapFilterSection = document.getElementById('map-filter-section');
const $legend = document.getElementById('legend');
const $cyViewport = document.getElementById('cy-viewport');
const $carouselPrev = document.getElementById('carousel-prev');
const $carouselNext = document.getElementById('carousel-next');
const $carouselIndicator = document.getElementById('carousel-indicator');
const $primitivesFooter = document.getElementById('primitives-footer');

// ── Data loading ────────────────────────────────────────────────────────────

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

    // Build lookup maps
    for (const n of rawData.nodes) {
        nodeMap[n.id] = n;
    }
    for (const e of rawData.edges) {
        if (!edgesByTarget[e.target]) edgesByTarget[e.target] = [];
        edgesByTarget[e.target].push(e);
        if (!edgesBySource[e.source]) edgesBySource[e.source] = [];
        edgesBySource[e.source].push(e);
        if (!blueprintGroups[e.blueprintId]) blueprintGroups[e.blueprintId] = [];
        blueprintGroups[e.blueprintId].push(e);
    }

    // Compute primitive ID sets
    const craftTargets = new Set();
    const craftSources = new Set();
    for (const e of rawData.edges) {
        if (e.type === 'craft') {
            craftTargets.add(e.target);
            if (!e.tool) craftSources.add(e.source);
        }
    }

    // H2: uncraftable + used as ingredient
    primUncraftableIds = new Set([...craftSources].filter(id => !craftTargets.has(id)));

    // H5: salvage outputs
    primSalvageableIds = new Set();
    for (const e of rawData.edges) {
        if (e.type === 'salvage') primSalvageableIds.add(e.target);
    }

    // H6: nature-sourced (by name lookup)
    primNatureIds = new Set();
    for (const n of rawData.nodes) {
        if (NATURE_ITEM_NAMES.has(n.name)) primNatureIds.add(n.id);
    }

    // H4: high fan-out (10+ distinct blueprints as non-tool ingredient)
    const bpCountBySource = {};  // sourceId -> Set of blueprintIds
    for (const e of rawData.edges) {
        if (e.type !== 'craft' || e.tool) continue;
        if (!bpCountBySource[e.source]) bpCountBySource[e.source] = new Set();
        bpCountBySource[e.source].add(e.blueprintId);
    }
    primCommonIds = new Set();
    for (const [id, bps] of Object.entries(bpCountBySource)) {
        if (bps.size >= 10) primCommonIds.add(id);
    }
}

// ── Category filter building (crafting categories from blueprint tags) ───────

function buildCraftingCategoryFilters() {
    const $section = document.getElementById('crafting-cat-section');
    const $filters = document.getElementById('crafting-cat-filters');
    if (!$section || !$filters) return;
    if (craftingCategoryList.length === 0) return;

    $section.style.display = '';
    const savedCraftCats = lsGet('crafting-categories', null);

    let html = '<label class="toggle-all-label"><input type="checkbox" id="craft-cat-all" checked> All</label>';
    for (const cat of craftingCategoryList) {
        const checked = savedCraftCats === null || savedCraftCats.includes(cat);
        html += `<label><input type="checkbox" data-craftcat="${esc(cat)}" ${checked ? 'checked' : ''}> ${esc(cat)}</label>`;
    }
    $filters.innerHTML = html;

    const $allCb = document.getElementById('craft-cat-all');
    $allCb.addEventListener('change', () => {
        const boxes = $filters.querySelectorAll('input[data-craftcat]');
        for (const b of boxes) b.checked = $allCb.checked;
        onFiltersChanged();
    });

    $filters.addEventListener('change', (e) => {
        if (e.target.dataset.craftcat) {
            const boxes = $filters.querySelectorAll('input[data-craftcat]');
            $allCb.checked = [...boxes].every(b => b.checked);
            onFiltersChanged();
        }
    });
}

function getActiveCraftingCategories() {
    const $filters = document.getElementById('crafting-cat-filters');
    if (!$filters) return null;
    const boxes = $filters.querySelectorAll('input[data-craftcat]');
    if (boxes.length === 0) return null;
    const active = [];
    for (const b of boxes) {
        if (b.checked) active.push(b.dataset.craftcat);
    }
    return active.length === craftingCategoryList.length ? null : active;
}

// ── Map filter building ──────────────────────────────────────────────────────

async function buildMapFilters() {
    const manifest = await dataLoader.getManifest();
    const maps = Object.keys(manifest.maps).sort();
    if (maps.length === 0) return;

    $mapFilterSection.style.display = '';
    const savedMaps = lsGet('maps', null);

    let html = '<label class="toggle-all-label"><input type="checkbox" id="map-all"> All</label>';
    for (const map of maps) {
        const checked = savedMaps === null ? false : savedMaps.includes(map);
        html += `<label><input type="checkbox" data-map="${esc(map)}" ${checked ? 'checked' : ''}> ${esc(map)}</label>`;
    }
    $mapFilters.innerHTML = html;

    // Wire up All toggle
    const $mapAll = document.getElementById('map-all');
    $mapAll.checked = savedMaps !== null && maps.every(m => savedMaps.includes(m));
    $mapAll.addEventListener('change', () => {
        const boxes = $mapFilters.querySelectorAll('input[data-map]');
        for (const b of boxes) b.checked = $mapAll.checked;
        onFiltersChanged();
    });

    // Wire individual map checkboxes
    $mapFilters.addEventListener('change', (e) => {
        if (e.target.dataset.map) {
            updateMapAllState();
            onFiltersChanged();
        }
    });
}

function updateMapAllState() {
    const boxes = $mapFilters.querySelectorAll('input[data-map]');
    const $mapAll = document.getElementById('map-all');
    if (!$mapAll) return;
    $mapAll.checked = [...boxes].every(b => b.checked);
}

function getActiveMaps() {
    const boxes = $mapFilters.querySelectorAll('input[data-map]');
    if (boxes.length === 0) return null; // No map data
    const active = [];
    for (const b of boxes) {
        if (b.checked) active.push(b.dataset.map);
    }
    const result = active.length > 0 ? active : null;
    console.log('[MAP-FILTER] getActiveMaps:', result);
    return result; // null = no filter (show all)
}

function getActiveBlueprintTypes() {
    const types = [];
    const boxes = document.querySelectorAll('#blueprint-filters input[data-bp]');
    for (const b of boxes) {
        if (b.checked) types.push(b.dataset.bp);
    }
    return types;
}

// ── Filtering logic ─────────────────────────────────────────────────────────

function getVisibleEdges() {
    const bpTypes = getActiveBlueprintTypes();
    const activeCraftCats = getActiveCraftingCategories();
    const settings = getSettings();

    // Use map-filtered edges if a map filter is active, otherwise use raw edges
    const sourceEdges = mapFilteredGraph ? mapFilteredGraph.edges : rawData.edges;
    const sourceNodeMap = mapFilteredGraph ? mapFilteredNodeMap : nodeMap;

    console.log('[MAP-FILTER] getVisibleEdges: using', mapFilteredGraph ? 'FILTERED' : 'RAW', 'graph,', sourceEdges.length, 'source edges');

    const result = sourceEdges.filter(e => {
        // Blueprint type filter
        if (!bpTypes.includes(e.type)) return false;
        // Tool edge visibility
        if (e.tool && settings.toolEdges === 'hidden') return false;
        // Crafting category filter
        if (activeCraftCats !== null && e.craftingCategory && !activeCraftCats.includes(e.craftingCategory)) return false;
        // Both source and target must exist
        if (!sourceNodeMap[e.source] || !sourceNodeMap[e.target]) return false;
        return true;
    });

    console.log('[MAP-FILTER] getVisibleEdges: returning', result.length, 'visible edges');
    return result;
}

function getVisibleNodeIds(visibleEdges) {
    const ids = new Set();
    for (const e of visibleEdges) {
        ids.add(e.source);
        ids.add(e.target);
    }
    return ids;
}

// ── Item list ───────────────────────────────────────────────────────────────

function updateItemList() {
    const visibleEdges = getVisibleEdges();
    const visibleIds = getVisibleNodeIds(visibleEdges);

    const filterText = $itemListSearch.value.toLowerCase().trim();

    const items = rawData.nodes
        .filter(n => visibleIds.has(n.id))
        .filter(n => !filterText || n.name.toLowerCase().includes(filterText))
        .sort((a, b) => {
            const aFav = favoriteItems.has(a.id);
            const bFav = favoriteItems.has(b.id);
            if (aFav !== bFav) return aFav ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

    // Initialize selectedItems to all items on first call
    if (selectedItems === null) {
        const saved = lsGet('selected-items', null);
        if (saved) {
            selectedItems = new Set(saved);
        } else {
            selectedItems = new Set(rawData.nodes.map(n => n.id));
        }
    }

    let html = '';
    for (const item of items) {
        const checked = selectedItems.has(item.id) ? ' checked' : '';
        const isFav = favoriteItems.has(item.id);
        const starCls = isFav ? 'item-star favorited' : 'item-star';
        const starChar = isFav ? '\u2605' : '\u2606';
        html += `<div class="item-entry" data-id="${item.id}" title="${esc(item.name)}">`;
        html += `<span class="${starCls}" data-id="${item.id}">${starChar}</span>`;
        html += `<span class="item-name">${esc(item.name)}</span>`;
        html += `<input type="checkbox" class="item-select-cb" data-id="${item.id}"${checked}>`;
        html += `</div>`;
    }
    $itemList.innerHTML = html;
}

function saveSelectedItems() {
    lsSet('selected-items', [...selectedItems]);
}

function toggleSelectVisible() {
    // If all visible items are selected, deselect them; otherwise select them
    const visibleCbs = $itemList.querySelectorAll('.item-select-cb');
    const allChecked = [...visibleCbs].every(cb => cb.checked);

    visibleCbs.forEach(cb => {
        const id = cb.dataset.id;
        if (allChecked) {
            selectedItems.delete(id);
            cb.checked = false;
        } else {
            selectedItems.add(id);
            cb.checked = true;
        }
    });

    saveSelectedItems();
    renderCurrentView();
}

// ── Cytoscape initialization ────────────────────────────────────────────────

function getNodeShape(node) {
    const settings = getSettings();
    if (!settings.shapeByType) return 'ellipse';
    return TYPE_SHAPES[node.type] || 'ellipse';
}

function getNodeBorderColor(node) {
    return RARITY_COLORS[node.rarity] || '#555';
}

function buildCyStyle() {
    const settings = getSettings();

    const styles = [
        // Base node style
        {
            selector: 'node',
            style: {
                'label': settings.nodeLabels ? 'data(label)' : '',
                'font-size': settings.graphNodeFont + 'px',
                'font-weight': settings.graphNodeWeight * 100,
                'color': settings.graphNodeColor,
                'text-outline-color': '#1a1a2e',
                'text-outline-width': 1.5,
                'text-valign': 'bottom',
                'text-halign': 'center',
                'text-margin-y': 6,
                'background-color': 'data(bgColor)',
                'border-width': 2,
                'border-color': 'data(borderColor)',
                'width': settings.nodeSize === 'fixed' ? 28 : 'data(size)',
                'height': settings.nodeSize === 'fixed' ? 28 : 'data(size)',
                'shape': 'data(shape)',
                'text-max-width': '80px',
                'text-wrap': 'ellipsis',
            }
        },
        // Rarity glow
        ...(settings.rarityGlow ? [{
            selector: 'node[?hasRarity]',
            style: {
                'border-width': 3,
                'shadow-blur': 8,
                'shadow-color': 'data(borderColor)',
                'shadow-opacity': 0.5,
                'shadow-offset-x': 0,
                'shadow-offset-y': 0,
            }
        }] : []),
        // Base edge style
        {
            selector: 'edge',
            style: {
                'width': settings.edgeThickness ? 'data(thickness)' : 2,
                'line-color': settings.edgeColors ? 'data(edgeColor)' : '#666',
                'target-arrow-color': settings.edgeColors ? 'data(edgeColor)' : '#666',
                'target-arrow-shape': settings.arrowStyle === 'none' ? 'none' : settings.arrowStyle,
                'curve-style': 'bezier',
                'label': settings.edgeLabels ? 'data(label)' : '',
                'font-size': settings.graphEdgeFont + 'px',
                'font-weight': settings.graphEdgeWeight * 100,
                'color': settings.graphEdgeColor,
                'text-outline-color': '#1a1a2e',
                'text-outline-width': 1,
                'text-rotation': 'autorotate',
                'arrow-scale': 0.8,
                'opacity': 0.8,
            }
        },
        // Tool edges (dashed)
        ...(settings.toolEdges === 'dashed' ? [{
            selector: 'edge[?isTool]',
            style: {
                'line-style': 'dashed',
                'line-dash-pattern': [6, 3],
                'opacity': 0.6,
            }
        }] : []),
        // Dimmed nodes (search filtering)
        {
            selector: 'node.dimmed',
            style: {
                'opacity': 0.15,
            }
        },
        {
            selector: 'edge.dimmed',
            style: {
                'opacity': 0.05,
            }
        },
        // Deselected but needed (shown as dependency of selected item)
        {
            selector: 'node.deselected',
            style: {
                'opacity': 0.35,
            }
        },
        // Highlighted nodes (search match)
        {
            selector: 'node.highlighted',
            style: {
                'border-width': 4,
                'border-color': '#ffd700',
                'z-index': 10,
            }
        },
        // Diagram mode: all nodes get smaller text + wrapping
        {
            selector: 'node.diagram-node',
            style: {
                'font-size': settings.diagramNodeFont + 'px',
                'font-weight': settings.diagramNodeWeight * 100,
                'color': settings.diagramNodeColor,
                'text-max-width': '90px',
                'text-wrap': 'wrap',
            }
        },
        // Diagram mode: target node
        {
            selector: 'node.diagram-target',
            style: {
                'width': 45,
                'height': 45,
                'border-width': 4,
                'border-color': '#ffd700',
                'font-size': settings.diagramTargetFont + 'px',
                'font-weight': settings.diagramTargetWeight * 100,
                'color': settings.diagramTargetColor,
                'text-max-width': '100px',
                'text-wrap': 'wrap',
                'z-index': 10,
            }
        },
        // Diagram mode: leaf node (raw material)
        {
            selector: 'node.diagram-leaf',
            style: {
                'opacity': 0.7,
                'shape': 'rectangle',
                'width': 22,
                'height': 22,
            }
        },
        // Diagram mode: edge labels (larger for readability)
        {
            selector: 'edge.diagram-edge',
            style: {
                'font-size': settings.diagramEdgeFont + 'px',
                'font-weight': settings.diagramEdgeWeight * 100,
                'color': settings.diagramEdgeColor,
                'text-outline-width': 2,
                'text-wrap': 'wrap',
                'text-max-width': '120px',
            }
        },
        // Diagram mode: cycle marker
        {
            selector: 'node.diagram-cycle',
            style: {
                'border-color': '#f44336',
                'border-style': 'dashed',
                'border-width': 3,
            }
        },
        // Diagram mode: recipe ghost node
        {
            selector: 'node.diagram-recipe',
            style: {
                'width': 16,
                'height': 16,
                'background-color': '#1a1a2e',
                'border-width': 1,
                'border-color': '#666',
                'border-style': 'dashed',
                'shape': 'round-rectangle',
                'font-size': '7px',
                'color': '#999',
                'text-max-width': '100px',
                'text-wrap': 'wrap',
                'opacity': 0.75,
            }
        },
        // Diagram mode: recipe ghost edge (parent -> ghost)
        {
            selector: 'edge.diagram-recipe-edge',
            style: {
                'line-style': 'dashed',
                'line-dash-pattern': [4, 4],
                'line-color': '#555',
                'target-arrow-color': '#555',
                'opacity': 0.5,
                'width': 1,
            }
        },
    ];

    return styles;
}

function buildGraphElements() {
    const visibleEdges = getVisibleEdges();
    const visibleNodeIds = getVisibleNodeIds(visibleEdges);
    const settings = getSettings();

    // Determine which nodes are selected vs needed-but-deselected
    // An edge is shown if at least one endpoint is selected
    const sel = selectedItems || new Set();
    const filteredEdges = visibleEdges.filter(e =>
        sel.has(e.source) || sel.has(e.target)
    );
    const neededNodeIds = getVisibleNodeIds(filteredEdges);

    // Compute degree for connectivity-based sizing
    const degree = {};
    for (const e of filteredEdges) {
        degree[e.source] = (degree[e.source] || 0) + 1;
        degree[e.target] = (degree[e.target] || 0) + 1;
    }
    const maxDeg = Math.max(1, ...Object.values(degree));

    const nodes = [];
    for (const id of neededNodeIds) {
        const n = nodeMap[id];
        if (!n) continue;
        const deg = degree[id] || 1;
        const size = settings.nodeSize === 'connectivity'
            ? 18 + 30 * (deg / maxDeg)
            : 28;
        const isDeselected = !sel.has(id);
        nodes.push({
            data: {
                id: n.id,
                label: n.name,
                shape: getNodeShape(n),
                bgColor: '#2a2a4a',
                borderColor: getNodeBorderColor(n),
                hasRarity: !!n.rarity,
                size: size,
                nodeType: n.type || '',
                rarity: n.rarity || '',
            },
            classes: isDeselected ? 'deselected' : '',
        });
    }

    const edges = filteredEdges.map((e, i) => ({
        data: {
            id: 'e-' + i,
            source: e.source,
            target: e.target,
            label: e.quantity > 1 ? `x${e.quantity}` : '',
            edgeColor: EDGE_COLORS[e.type] || '#666',
            isTool: e.tool,
            thickness: Math.min(1 + e.quantity * 0.5, 6),
            edgeType: e.type,
            blueprintId: e.blueprintId,
        }
    }));

    return { nodes, edges };
}

// ── Graph mode ──────────────────────────────────────────────────────────────

function getLayoutOptions(algo, spacing, animate) {
    const base = { name: algo, animate: animate, animationDuration: 400 };

    switch (algo) {
        case 'cose':
            return {
                ...base,
                nodeRepulsion: function() { return spacing * 200; },
                idealEdgeLength: function() { return spacing; },
                edgeElasticity: function() { return 100; },
                gravity: 0.25,
                numIter: 800,
                coolingFactor: 0.95,
                nodeDimensionsIncludeLabels: true,
                randomize: true,
                padding: 30,
            };
        case 'dagre':
            return {
                ...base,
                rankDir: 'TB',
                nodeSep: spacing,
                rankSep: spacing * 1.5,
                padding: 30,
            };
        case 'circle':
            return { ...base, padding: 30, spacingFactor: spacing / 50 };
        case 'grid':
            return { ...base, padding: 30, spacingFactor: spacing / 50 };
        case 'concentric':
            return {
                ...base,
                padding: 30,
                minNodeSpacing: spacing,
                concentric: function(node) { return node.degree(); },
                levelWidth: function() { return 2; },
            };
        default:
            return base;
    }
}

function renderGraph() {
    const settings = getSettings();
    const elements = buildGraphElements();

    if (cy) cy.destroy();

    cy = window.cytoscape({
        container: $cy,
        elements: [...elements.nodes, ...elements.edges],
        style: buildCyStyle(),
        layout: getLayoutOptions(settings.layoutAlgo, settings.spacing, settings.animate),
        minZoom: 0.05,
        maxZoom: 5,
        wheelSensitivity: 0.3,
    });

    // Node hover tooltip
    cy.on('mouseover', 'node', onNodeMouseOver);
    cy.on('mouseout', 'node', onNodeMouseOut);
    cy.on('mousemove', 'node', onNodeMouseMove);

    // Click node -> switch to diagram
    cy.on('tap', 'node', (e) => {
        const nodeId = e.target.id();
        switchToDiagram(nodeId);
    });

    $loading.classList.add('hidden');
}

function refreshGraphStyle() {
    if (!cy || viewMode !== 'graph') return;
    cy.style().fromJson(buildCyStyle()).update();
}

function relayoutGraph() {
    if (!cy || viewMode !== 'graph') return;
    const settings = getSettings();
    cy.layout(getLayoutOptions(settings.layoutAlgo, settings.spacing, settings.animate)).run();
}

// ── Diagram mode ────────────────────────────────────────────────────────────

function getActiveEdgesByTarget() {
    return mapFilteredGraph ? mapFilteredEdgesByTarget : edgesByTarget;
}

function getActiveEdgesBySource() {
    return mapFilteredGraph ? mapFilteredEdgesBySource : edgesBySource;
}

function buildDiagramTree(rootId) {
    // Build a top-down tree: rootId at top, ingredients below
    // Nodes are duplicated to form a proper tree
    // Cycle detection: track ancestors in current path

    const settings = getSettings();
    const multiRecipe = settings.multiRecipe;
    const maxDepth = settings.recipeDepth;  // 0 = unlimited
    const cyNodes = [];
    const cyEdges = [];
    let counter = 0;
    const activeEdgesByTarget = getActiveEdgesByTarget();

    // Reset carousel state
    carouselBpKeys = [];

    function makeNodeId(origId) {
        counter++;
        return origId + '-' + counter;
    }

    function addIngredientNode(edge, parentCyId, ancestorSet, depth) {
        const srcNode = nodeMap[edge.source];
        if (!srcNode) return;

        const childCyId = makeNodeId(edge.source);
        const isCycle = ancestorSet.has(edge.source);
        const isLeaf = !activeEdgesByTarget[edge.source] ||
            !activeEdgesByTarget[edge.source].some(e2 => e2.type === 'craft');

        cyNodes.push({
            data: {
                id: childCyId,
                origId: edge.source,
                label: srcNode.name + (isCycle ? ' (cycle)' : ''),
                shape: getNodeShape(srcNode),
                bgColor: '#2a2a4a',
                borderColor: getNodeBorderColor(srcNode),
                hasRarity: !!srcNode.rarity,
                size: 28,
                nodeType: srcNode.type || '',
                rarity: srcNode.rarity || '',
            },
            classes: 'diagram-node' + (isCycle ? ' diagram-cycle' : (isLeaf ? ' diagram-leaf' : '')),
        });

        cyEdges.push({
            data: {
                id: 'de-' + counter,
                source: parentCyId,
                target: childCyId,
                label: edge.quantity > 1 ? `x${edge.quantity}` : '',
                edgeColor: EDGE_COLORS.craft,
                isTool: edge.tool,
                thickness: 2,
                edgeType: 'craft',
                blueprintId: edge.blueprintId,
            },
            classes: 'diagram-edge',
        });

        // Recursively expand non-cycle, non-leaf nodes (respecting depth limit)
        const atDepthLimit = maxDepth > 0 && depth + 1 >= maxDepth;
        if (!isCycle && !isLeaf && !atDepthLimit) {
            const newAncestors = new Set(ancestorSet);
            newAncestors.add(edge.source);
            expand(edge.source, childCyId, newAncestors, depth + 1);
        }
    }

    function expand(origId, cyNodeId, ancestorSet, depth) {
        // Get all craft blueprints targeting this item
        const incomingEdges = activeEdgesByTarget[origId] || [];

        // Group edges by blueprintId to find distinct recipes
        // Skip byproduct edges (these are secondary outputs of other recipes)
        const bpGroups = {};
        for (const e of incomingEdges) {
            if (e.type !== 'craft') continue;
            if (e.byproduct) continue;
            if (!bpGroups[e.blueprintId]) bpGroups[e.blueprintId] = [];
            bpGroups[e.blueprintId].push(e);
        }

        let bpKeys = Object.keys(bpGroups);
        if (bpKeys.length === 0) return;

        // Carousel mode: at root (depth 0), show only the selected recipe
        if (multiRecipe === 'carousel' && depth === 0 && bpKeys.length > 1) {
            carouselBpKeys = bpKeys;
            const idx = Math.min(carouselIndex, bpKeys.length - 1);
            bpKeys = [bpKeys[idx]];
        }

        const useGhostNodes = multiRecipe === 'ghost' && bpKeys.length > 1;

        if (useGhostNodes) {
            // Ghost mode: create intermediate recipe nodes
            let recipeNum = 0;
            for (const bpId of bpKeys) {
                recipeNum++;
                const ingredients = bpGroups[bpId];
                const ghostId = makeNodeId('recipe');

                // Build ghost label: "Recipe N" + optional workstation
                const ws = ingredients[0].workstations || [];
                let ghostLabel = `Recipe ${recipeNum}`;
                if (ws.length > 0) {
                    ghostLabel += '\n(' + ws.join(', ') + ')';
                }

                cyNodes.push({
                    data: {
                        id: ghostId,
                        origId: null,
                        label: ghostLabel,
                        shape: 'round-rectangle',
                        bgColor: '#1a1a2e',
                        borderColor: '#666',
                        hasRarity: false,
                        size: 16,
                        nodeType: 'recipe',
                        rarity: '',
                    },
                    classes: 'diagram-node diagram-recipe',
                });

                cyEdges.push({
                    data: {
                        id: 'de-' + counter,
                        source: cyNodeId,
                        target: ghostId,
                        label: '',
                        edgeColor: '#555',
                        isTool: false,
                        thickness: 1,
                        edgeType: 'recipe',
                    },
                    classes: 'diagram-edge diagram-recipe-edge',
                });

                for (const edge of ingredients) {
                    addIngredientNode(edge, ghostId, ancestorSet, depth);
                }
            }
        } else {
            // Standard mode: ingredients connect directly to parent
            // Annotate parent with workstations from visible recipes
            const wsSet = new Set();
            for (const bpId of bpKeys) {
                for (const ws of (bpGroups[bpId][0].workstations || [])) {
                    wsSet.add(ws);
                }
            }

            if (wsSet.size > 0) {
                const parentNode = cyNodes.find(n => n.data.id === cyNodeId);
                if (parentNode) {
                    parentNode.data.label += '\n(' + [...wsSet].join(', ') + ')';
                }
            }

            for (const bpId of bpKeys) {
                const ingredients = bpGroups[bpId];
                for (const edge of ingredients) {
                    addIngredientNode(edge, cyNodeId, ancestorSet, depth);
                }
            }
        }
    }

    // Root node
    const rootNode = nodeMap[rootId];
    if (!rootNode) return { nodes: [], edges: [] };

    const rootCyId = makeNodeId(rootId);
    cyNodes.push({
        data: {
            id: rootCyId,
            origId: rootId,
            label: rootNode.name,
            shape: getNodeShape(rootNode),
            bgColor: '#2a2a4a',
            borderColor: getNodeBorderColor(rootNode),
            hasRarity: !!rootNode.rarity,
            size: 45,
            nodeType: rootNode.type || '',
            rarity: rootNode.rarity || '',
        },
        classes: 'diagram-node diagram-target',
    });

    const ancestorSet = new Set([rootId]);
    expand(rootId, rootCyId, ancestorSet, 0);

    return { nodes: cyNodes, edges: cyEdges };
}

// ── Primitives summary ──────────────────────────────────────────────────────

function getPrimitiveIds() {
    const settings = getSettings();
    const ids = new Set();
    if (settings.primUncraftable) for (const id of primUncraftableIds) ids.add(id);
    if (settings.primSalvageable) for (const id of primSalvageableIds) ids.add(id);
    if (settings.primNature) for (const id of primNatureIds) ids.add(id);
    if (settings.primCommon) for (const id of primCommonIds) ids.add(id);
    return ids;
}

function computePrimitiveSummary(rootId) {
    const primitiveIds = getPrimitiveIds();
    const materials = {};   // guid -> total quantity
    const tools = new Set();
    const workstations = new Set();
    let hasMultiplePaths = false;
    const activeEdgesByTarget = getActiveEdgesByTarget();

    // Helper: get craft blueprint groups for an item
    function getCraftGroups(itemId) {
        const incoming = activeEdgesByTarget[itemId] || [];
        const groups = {};
        for (const e of incoming) {
            if (e.type !== 'craft' || e.byproduct) continue;
            if (!groups[e.blueprintId]) groups[e.blueprintId] = [];
            groups[e.blueprintId].push(e);
        }
        return groups;
    }

    // Phase 1: compute cheapest primitive cost for each item (memoized)
    const bestChoice = {};  // itemId -> { bpId, cost }

    function computeCost(itemId, ancestors) {
        if (primitiveIds.has(itemId)) return 1;
        if (bestChoice[itemId] !== undefined) return bestChoice[itemId].cost;

        const groups = getCraftGroups(itemId);
        const bpKeys = Object.keys(groups);

        if (bpKeys.length === 0) {
            // No recipes — treat as leaf primitive
            bestChoice[itemId] = { bpId: null, cost: 1 };
            return 1;
        }

        if (ancestors.has(itemId)) return Infinity; // Cycle
        if (bpKeys.length > 1) hasMultiplePaths = true;

        const newAnc = new Set(ancestors);
        newAnc.add(itemId);

        let bestCost = Infinity;
        let bestBpId = bpKeys[0];

        for (const bpId of bpKeys) {
            let recipeCost = 0;
            for (const e of groups[bpId]) {
                if (e.tool) continue;
                const subCost = computeCost(e.source, newAnc);
                if (subCost === Infinity) { recipeCost = Infinity; break; }
                recipeCost += e.quantity * subCost;
            }
            if (recipeCost < bestCost) {
                bestCost = recipeCost;
                bestBpId = bpId;
            }
        }

        bestChoice[itemId] = { bpId: bestBpId, cost: bestCost };
        return bestCost;
    }

    computeCost(rootId, new Set());

    // Phase 2: walk cheapest path, accumulating materials, tools, workstations
    function walk(itemId, qty, ancestors) {
        if (primitiveIds.has(itemId) || !bestChoice[itemId] || !bestChoice[itemId].bpId) {
            materials[itemId] = (materials[itemId] || 0) + qty;
            return;
        }
        if (ancestors.has(itemId)) {
            materials[itemId] = (materials[itemId] || 0) + qty;
            return;
        }

        const newAnc = new Set(ancestors);
        newAnc.add(itemId);

        const bpId = bestChoice[itemId].bpId;
        const groups = getCraftGroups(itemId);
        const edges = groups[bpId] || [];

        // Collect workstations from this recipe
        for (const ws of (edges[0]?.workstations || [])) {
            workstations.add(ws);
        }

        for (const e of edges) {
            if (e.tool) {
                tools.add(e.source);
            } else {
                walk(e.source, qty * e.quantity, newAnc);
            }
        }
    }

    walk(rootId, 1, new Set());

    // Sort materials by quantity descending
    const sortedMaterials = Object.entries(materials)
        .map(([id, qty]) => ({ id, qty, name: nodeMap[id]?.name || id }))
        .sort((a, b) => b.qty - a.qty);

    const sortedTools = [...tools]
        .map(id => nodeMap[id]?.name || id)
        .sort();

    const sortedWorkstations = [...workstations].sort();

    return { materials: sortedMaterials, tools: sortedTools, workstations: sortedWorkstations, hasMultiplePaths };
}

function updatePrimitivesFooter(itemId) {
    if (!itemId) {
        $primitivesFooter.classList.remove('visible');
        return;
    }

    const summary = computePrimitiveSummary(itemId);

    if (summary.materials.length === 0) {
        $primitivesFooter.classList.remove('visible');
        return;
    }

    let html = '';

    // Materials
    const prefix = summary.hasMultiplePaths ? 'Cheapest' : 'Materials';
    const matStr = summary.materials.map(m =>
        `${m.qty}x ${esc(m.name)}`
    ).join(', ');
    html += `<span class="prim-section"><span class="prim-label">${prefix}:</span>${matStr}</span>`;

    // Tools
    if (summary.tools.length > 0) {
        html += `<span class="prim-section"><span class="prim-tool">Tools: ${summary.tools.map(esc).join(', ')}</span></span>`;
    }

    // Workstations
    if (summary.workstations.length > 0) {
        html += `<span class="prim-section"><span class="prim-ws">Requires: ${summary.workstations.map(esc).join(', ')}</span></span>`;
    }

    $primitivesFooter.innerHTML = html;
    $primitivesFooter.classList.add('visible');
}

function renderDiagram(itemId) {
    const settings = getSettings();
    const tree = buildDiagramTree(itemId);

    if (cy) cy.destroy();

    cy = window.cytoscape({
        container: $cy,
        elements: [...tree.nodes, ...tree.edges],
        style: buildCyStyle(),
        layout: {
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 40,
            rankSep: 60,
            animate: settings.animate,
            animationDuration: 300,
            padding: 30,
        },
        minZoom: 0.05,
        maxZoom: 5,
        wheelSensitivity: 0.3,
    });

    // Tooltip
    cy.on('mouseover', 'node', onNodeMouseOver);
    cy.on('mouseout', 'node', onNodeMouseOut);
    cy.on('mousemove', 'node', onNodeMouseMove);

    // Click node -> re-root diagram
    cy.on('tap', 'node', (e) => {
        const origId = e.target.data('origId');
        if (origId && origId !== currentDiagramId) {
            diagramStack.push(currentDiagramId);
            switchToDiagram(origId);
        }
    });

    // Update carousel UI
    const showCarousel = settings.multiRecipe === 'carousel' && carouselBpKeys.length > 1;
    $cyViewport.classList.toggle('carousel-visible', showCarousel);
    if (showCarousel) {
        const idx = Math.min(carouselIndex, carouselBpKeys.length - 1);
        $carouselIndicator.textContent = `Recipe ${idx + 1} of ${carouselBpKeys.length}`;
    }

    // Update primitives footer
    updatePrimitivesFooter(itemId);

    $loading.classList.add('hidden');
}

function switchToDiagram(itemId) {
    if (viewMode === 'graph') {
        diagramStack = [];
    }
    carouselIndex = 0;
    currentDiagramId = itemId;
    viewMode = 'diagram';
    $btnGraph.classList.remove('active');
    $btnDiagram.classList.add('active');
    $diagramNav.classList.add('visible');
    updateBreadcrumb();
    renderDiagram(itemId);
}

function switchToGraph() {
    viewMode = 'graph';
    currentDiagramId = null;
    diagramStack = [];
    $btnGraph.classList.add('active');
    $btnDiagram.classList.remove('active');
    $diagramNav.classList.remove('visible');
    $cyViewport.classList.remove('carousel-visible');
    $primitivesFooter.classList.remove('visible');
    renderGraph();
    applySearch();
}

function renderCurrentView() {
    if (viewMode === 'diagram' && currentDiagramId) {
        renderDiagram(currentDiagramId);
    } else {
        renderGraph();
        applySearch();
    }
}

function updateBreadcrumb() {
    let html = '<span data-action="graph">Graph</span>';
    for (const id of diagramStack) {
        const n = nodeMap[id];
        html += '<span class="separator">/</span>';
        html += `<span data-id="${id}">${n ? esc(n.name) : esc(id)}</span>`;
    }
    if (currentDiagramId) {
        const n = nodeMap[currentDiagramId];
        html += '<span class="separator">/</span>';
        html += `<span class="current">${n ? esc(n.name) : esc(currentDiagramId)}</span>`;
    }
    $breadcrumb.innerHTML = html;
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

function onNodeMouseOver(e) {
    const node = e.target;
    const origId = node.data('origId') || node.id();
    const n = nodeMap[origId];
    if (!n) return;

    const $name = $tooltip.querySelector('.tt-name');
    const $meta = $tooltip.querySelector('.tt-meta');
    const $recipes = $tooltip.querySelector('.tt-recipes');

    $name.textContent = n.name;
    $meta.textContent = [n.type, n.rarity].filter(Boolean).join(' \u2022 ') || 'Unknown';

    // Build recipe descriptions (use filtered edges if map filter is active)
    const activeET = getActiveEdgesByTarget();
    const activeES = getActiveEdgesBySource();
    const incoming = activeET[origId] || [];
    const outgoing = activeES[origId] || [];

    // Group incoming by blueprintId
    const craftRecipes = {};
    for (const e of incoming) {
        if (!craftRecipes[e.blueprintId]) craftRecipes[e.blueprintId] = { type: e.type, ingredients: [], workstations: e.workstations || [], craftingCategory: e.craftingCategory || '' };
        const src = nodeMap[e.source];
        craftRecipes[e.blueprintId].ingredients.push(
            (e.quantity > 1 ? e.quantity + 'x ' : '') + (src ? src.name : '?') + (e.tool ? ' (tool)' : '')
        );
    }

    // Group outgoing (salvage products etc) by blueprintId
    const outRecipes = {};
    for (const e of outgoing) {
        if (!outRecipes[e.blueprintId]) outRecipes[e.blueprintId] = { type: e.type, products: [], workstations: e.workstations || [], craftingCategory: e.craftingCategory || '' };
        const tgt = nodeMap[e.target];
        outRecipes[e.blueprintId].products.push(
            (e.quantity > 1 ? e.quantity + 'x ' : '') + (tgt ? tgt.name : '?')
        );
    }

    let recipesHtml = '';

    for (const bp of Object.values(craftRecipes)) {
        recipesHtml += `<div class="tt-recipe">`;
        recipesHtml += `<span class="tt-recipe-type ${esc(bp.type)}">${esc(bp.type)}</span>`;
        if (bp.craftingCategory) recipesHtml += ` <span style="color:#888;font-size:0.72rem">[${esc(bp.craftingCategory)}]</span>`;
        recipesHtml += `: `;
        recipesHtml += bp.ingredients.map(esc).join(' + ');
        recipesHtml += ` &rarr; ${esc(n.name)}`;
        if (bp.workstations.length) {
            recipesHtml += `<div class="tt-workstation">Requires: ${bp.workstations.map(esc).join(', ')}</div>`;
        }
        recipesHtml += `</div>`;
    }

    for (const bp of Object.values(outRecipes)) {
        recipesHtml += `<div class="tt-recipe">`;
        recipesHtml += `<span class="tt-recipe-type ${esc(bp.type)}">${esc(bp.type)}</span>`;
        if (bp.craftingCategory) recipesHtml += ` <span style="color:#888;font-size:0.72rem">[${esc(bp.craftingCategory)}]</span>`;
        recipesHtml += `: `;
        recipesHtml += `${esc(n.name)} &rarr; `;
        recipesHtml += bp.products.map(esc).join(' + ');
        if (bp.workstations.length) {
            recipesHtml += `<div class="tt-workstation">Requires: ${bp.workstations.map(esc).join(', ')}</div>`;
        }
        recipesHtml += `</div>`;
    }

    $recipes.innerHTML = recipesHtml || '<em style="color:#666">No recipes</em>';
    $tooltip.style.display = 'block';
}

function onNodeMouseOut() {
    $tooltip.style.display = 'none';
}

function onNodeMouseMove(e) {
    const renderedPos = e.renderedPosition;
    const containerRect = $cy.getBoundingClientRect();
    let x = containerRect.left + renderedPos.x + 16;
    let y = containerRect.top + renderedPos.y + 16;

    // Keep tooltip within viewport
    const ttRect = $tooltip.getBoundingClientRect();
    if (x + ttRect.width > window.innerWidth - 10) {
        x = containerRect.left + renderedPos.x - ttRect.width - 16;
    }
    if (y + ttRect.height > window.innerHeight - 10) {
        y = containerRect.top + renderedPos.y - ttRect.height - 16;
    }

    // Final clamp so it never goes off-screen
    x = Math.max(10, Math.min(x, window.innerWidth - ttRect.width - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - ttRect.height - 10));

    $tooltip.style.left = x + 'px';
    $tooltip.style.top = y + 'px';
}

// ── Search ──────────────────────────────────────────────────────────────────

function applySearch() {
    if (!cy || viewMode !== 'graph') return;

    const query = $search.value.toLowerCase().trim();
    if (!query) {
        cy.elements().removeClass('dimmed highlighted');
        $searchCount.textContent = '';
        return;
    }

    let matchCount = 0;
    cy.nodes().forEach(node => {
        const label = (node.data('label') || '').toLowerCase();
        if (label.includes(query)) {
            node.removeClass('dimmed').addClass('highlighted');
            matchCount++;
        } else {
            node.addClass('dimmed').removeClass('highlighted');
        }
    });

    cy.edges().forEach(edge => {
        const src = edge.source();
        const tgt = edge.target();
        if (src.hasClass('highlighted') || tgt.hasClass('highlighted')) {
            edge.removeClass('dimmed');
        } else {
            edge.addClass('dimmed');
        }
    });

    $searchCount.textContent = matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? 'es' : ''}` : 'No matches';
}

// ── Map blacklist computation ────────────────────────────────────────────────

async function computeMapBlacklist(activeMaps) {
    console.log('[MAP-FILTER] computeMapBlacklist called, activeMaps:', activeMaps);

    if (!activeMaps || activeMaps.length === 0) {
        console.log('[MAP-FILTER] No active maps, clearing map filter state');
        mapFilteredGraph = null;
        mapFilteredNodeMap = null;
        mapFilteredEdgesByTarget = null;
        mapFilteredEdgesBySource = null;
        return;
    }

    // Start with the full base graph
    let currentGraph = {
        nodes: rawData.nodes,
        edges: rawData.edges,
        blueprintGroups,
        craftingCategories: craftingCategoryList,
    };
    console.log('[MAP-FILTER] Starting with base graph:', currentGraph.nodes.length, 'nodes,', currentGraph.edges.length, 'edges');

    // Apply each selected map's blacklists
    for (const mapName of activeMaps) {
        const mapData = await dataLoader.getMapData(mapName);
        console.log('[MAP-FILTER] Loaded map data for', mapName, ':', mapData ? 'OK' : 'FAILED');
        if (!mapData) continue;

        console.log('[MAP-FILTER] Map crafting_blacklists:', mapData.map?.crafting_blacklists);
        if (!mapData.map?.crafting_blacklists || mapData.map.crafting_blacklists.length === 0) {
            console.log('[MAP-FILTER] No crafting_blacklists for', mapName, ', skipping');
            continue;
        }

        // If the map has its own entries with blueprints, build a graph from them
        let mapGraph = null;
        if (mapData.entries && mapData.entries.length > 0) {
            const guidIndex = await dataLoader.getGuidIndex();
            mapGraph = buildCraftingGraph(mapData.entries, guidIndex, mapData.assets || {}, `map-${mapName}-bp`);
            console.log('[MAP-FILTER] Built map graph for', mapName, ':', mapGraph.nodes.length, 'nodes,', mapGraph.edges.length, 'edges');
        } else {
            console.log('[MAP-FILTER] No entries for', mapName, ', no map graph built');
        }

        const beforeEdges = currentGraph.edges.length;
        currentGraph = applyCraftingBlacklists(currentGraph, mapData, mapGraph);
        console.log('[MAP-FILTER] After applyCraftingBlacklists for', mapName, ':', currentGraph.nodes.length, 'nodes,', currentGraph.edges.length, 'edges (was', beforeEdges, 'edges)');
    }

    // Store the filtered result
    mapFilteredGraph = currentGraph;
    mapFilteredNodeMap = {};
    mapFilteredEdgesByTarget = {};
    mapFilteredEdgesBySource = {};
    for (const n of currentGraph.nodes) {
        mapFilteredNodeMap[n.id] = n;
    }
    for (const e of currentGraph.edges) {
        if (!mapFilteredEdgesByTarget[e.target]) mapFilteredEdgesByTarget[e.target] = [];
        mapFilteredEdgesByTarget[e.target].push(e);
        if (!mapFilteredEdgesBySource[e.source]) mapFilteredEdgesBySource[e.source] = [];
        mapFilteredEdgesBySource[e.source].push(e);
    }
    console.log('[MAP-FILTER] Final filtered graph stored:', currentGraph.nodes.length, 'nodes,', currentGraph.edges.length, 'edges');
}

// ── Filter change handler ───────────────────────────────────────────────────

async function onFiltersChanged() {
    console.log('[MAP-FILTER] onFiltersChanged called');

    // Save filter state
    lsSet('bp-craft', document.querySelector('input[data-bp="craft"]').checked);
    lsSet('bp-salvage', document.querySelector('input[data-bp="salvage"]').checked);
    lsSet('bp-repair', document.querySelector('input[data-bp="repair"]').checked);

    const activeMaps = getActiveMaps();
    lsSet('maps', activeMaps);
    console.log('[MAP-FILTER] onFiltersChanged: activeMaps =', activeMaps);

    const activeCraftCats = getActiveCraftingCategories();
    lsSet('crafting-categories', activeCraftCats);

    // Compute map blacklist (async - loads map data if needed)
    await computeMapBlacklist(activeMaps);
    console.log('[MAP-FILTER] onFiltersChanged: computeMapBlacklist done, mapFilteredGraph =', mapFilteredGraph ? 'SET (' + mapFilteredGraph.edges.length + ' edges)' : 'null');

    // Re-render current view
    if (viewMode === 'graph') {
        renderGraph();
        applySearch();
    } else if (viewMode === 'diagram' && currentDiagramId) {
        renderDiagram(currentDiagramId);
    }

    updateItemList();
}

// ── Settings wiring ─────────────────────────────────────────────────────────

function wireSettings() {
    const settings = getSettings();

    // Settings mode
    const modeRadios = document.querySelectorAll('input[name="settings-mode"]');
    for (const r of modeRadios) {
        r.checked = r.value === settings.mode;
        r.addEventListener('change', () => {
            lsSet('mode', r.value);
            document.body.classList.toggle('extensive-mode', r.value === 'extensive');
        });
    }
    document.body.classList.toggle('extensive-mode', settings.mode === 'extensive');

    // Blueprint filters
    document.querySelector('input[data-bp="craft"]').checked = settings.bpCraft;
    document.querySelector('input[data-bp="salvage"]').checked = settings.bpSalvage;
    document.querySelector('input[data-bp="repair"]').checked = settings.bpRepair;

    $bpAll.checked = settings.bpCraft && settings.bpSalvage && settings.bpRepair;
    $bpAll.addEventListener('change', () => {
        const val = $bpAll.checked;
        document.querySelector('input[data-bp="craft"]').checked = val;
        document.querySelector('input[data-bp="salvage"]').checked = val;
        document.querySelector('input[data-bp="repair"]').checked = val;
        onFiltersChanged();
    });

    document.querySelectorAll('#blueprint-filters input[data-bp]').forEach(cb => {
        cb.addEventListener('change', () => {
            const boxes = document.querySelectorAll('#blueprint-filters input[data-bp]');
            $bpAll.checked = [...boxes].every(b => b.checked);
            onFiltersChanged();
        });
    });

    // Multi-recipe display mode
    const $multiRecipe = document.getElementById('opt-multi-recipe');
    $multiRecipe.value = settings.multiRecipe;
    $multiRecipe.addEventListener('change', () => {
        lsSet('multi-recipe', $multiRecipe.value);
        if (viewMode === 'diagram' && currentDiagramId) {
            carouselIndex = 0;
            renderDiagram(currentDiagramId);
        }
    });

    // Recipe depth
    const $recipeDepth = document.getElementById('opt-recipe-depth');
    $recipeDepth.value = settings.recipeDepth;
    $recipeDepth.addEventListener('change', () => {
        lsSet('recipe-depth', parseInt($recipeDepth.value));
        if (viewMode === 'diagram' && currentDiagramId) {
            renderDiagram(currentDiagramId);
        }
    });

    // Primitives checkboxes
    const refreshPrimitives = () => {
        if (viewMode === 'diagram' && currentDiagramId) updatePrimitivesFooter(currentDiagramId);
    };
    wireCheckbox('opt-prim-uncraftable', 'prim-uncraftable', refreshPrimitives);
    wireCheckbox('opt-prim-salvageable', 'prim-salvageable', refreshPrimitives);
    wireCheckbox('opt-prim-nature', 'prim-nature', refreshPrimitives);
    wireCheckbox('opt-prim-common', 'prim-common', refreshPrimitives);

    // Legend toggle
    wireCheckbox('opt-legend', 'legend', () => {
        $legend.classList.toggle('visible', lsGet('legend', false));
    });
    $legend.classList.toggle('visible', lsGet('legend', false));

    // Legend collapse
    const $legendCollapse = document.getElementById('legend-collapse');
    const legendCollapsed = lsGet('legend-collapsed', false);
    $legend.classList.toggle('collapsed', legendCollapsed);
    $legendCollapse.textContent = legendCollapsed ? '\u25B8' : '\u25BE';
    $legendCollapse.addEventListener('click', () => {
        const isCollapsed = $legend.classList.toggle('collapsed');
        $legendCollapse.textContent = isCollapsed ? '\u25B8' : '\u25BE';
        lsSet('legend-collapsed', isCollapsed);
    });

    // Display options
    wireCheckbox('opt-node-labels', 'node-labels', () => refreshGraphStyle());
    wireCheckbox('opt-shape-by-type', 'shape-by-type', () => {
        if (viewMode === 'graph') { renderGraph(); applySearch(); }
    });
    wireCheckbox('opt-rarity-glow', 'rarity-glow', () => refreshGraphStyle());

    wireRadioGroup('node-size', 'node-size', () => {
        if (viewMode === 'graph') { renderGraph(); applySearch(); }
    });

    // Edge options
    wireCheckbox('opt-edge-labels', 'edge-labels', () => refreshGraphStyle());
    wireCheckbox('opt-edge-colors', 'edge-colors', () => refreshGraphStyle());
    wireCheckbox('opt-edge-thickness', 'edge-thickness', () => refreshGraphStyle());

    wireRadioGroup('tool-edges', 'tool-edges', () => {
        if (viewMode === 'graph') { renderGraph(); applySearch(); }
        else if (viewMode === 'diagram' && currentDiagramId) { renderDiagram(currentDiagramId); }
    });

    wireRadioGroup('arrow-style', 'arrow-style', () => refreshGraphStyle());

    // Layout options
    const $layoutAlgo = document.getElementById('opt-layout-algo');
    $layoutAlgo.value = settings.layoutAlgo;
    $layoutAlgo.addEventListener('change', () => {
        lsSet('layout-algo', $layoutAlgo.value);
        if (viewMode === 'graph') relayoutGraph();
    });

    const $spacing = document.getElementById('opt-spacing');
    const $spacingVal = document.getElementById('opt-spacing-val');
    $spacing.value = settings.spacing;
    $spacingVal.textContent = settings.spacing;
    $spacing.addEventListener('input', () => {
        $spacingVal.textContent = $spacing.value;
        lsSet('spacing', parseInt($spacing.value));
    });
    $spacing.addEventListener('change', () => {
        if (viewMode === 'graph') relayoutGraph();
    });

    wireCheckbox('opt-animate', 'animate', () => {});

    // Text settings — graph
    const refreshGraph = () => refreshGraphStyle();
    wireNumberInput('opt-graph-node-font', 'graph-node-font', refreshGraph);
    wireNumberInput('opt-graph-node-weight', 'graph-node-weight', refreshGraph);
    wireColorInput('opt-graph-node-color', 'graph-node-color', refreshGraph);
    wireNumberInput('opt-graph-edge-font', 'graph-edge-font', refreshGraph);
    wireNumberInput('opt-graph-edge-weight', 'graph-edge-weight', refreshGraph);
    wireColorInput('opt-graph-edge-color', 'graph-edge-color', refreshGraph);

    // Text settings — diagram
    const refreshDiagram = () => {
        if (viewMode === 'diagram' && currentDiagramId) renderDiagram(currentDiagramId);
    };
    wireNumberInput('opt-diagram-node-font', 'diagram-node-font', refreshDiagram);
    wireNumberInput('opt-diagram-node-weight', 'diagram-node-weight', refreshDiagram);
    wireColorInput('opt-diagram-node-color', 'diagram-node-color', refreshDiagram);
    wireNumberInput('opt-diagram-target-font', 'diagram-target-font', refreshDiagram);
    wireNumberInput('opt-diagram-target-weight', 'diagram-target-weight', refreshDiagram);
    wireColorInput('opt-diagram-target-color', 'diagram-target-color', refreshDiagram);
    wireNumberInput('opt-diagram-edge-font', 'diagram-edge-font', refreshDiagram);
    wireNumberInput('opt-diagram-edge-weight', 'diagram-edge-weight', refreshDiagram);
    wireColorInput('opt-diagram-edge-color', 'diagram-edge-color', refreshDiagram);

    // Text settings — tooltip (uses CSS custom properties)
    const applyTooltipVars = () => {
        const s = getSettings();
        document.documentElement.style.setProperty('--tooltip-font-size', s.tooltipFont + 'px');
        document.documentElement.style.setProperty('--tooltip-font-weight', s.tooltipWeight * 100);
        document.documentElement.style.setProperty('--tooltip-color', s.tooltipColor);
        document.documentElement.style.setProperty('--tooltip-name-font-size', s.tooltipNameFont + 'px');
        document.documentElement.style.setProperty('--tooltip-name-font-weight', s.tooltipNameWeight * 100);
        document.documentElement.style.setProperty('--tooltip-name-color', s.tooltipNameColor);
    };
    wireNumberInput('opt-tooltip-font', 'tooltip-font', applyTooltipVars);
    wireNumberInput('opt-tooltip-weight', 'tooltip-weight', applyTooltipVars);
    wireColorInput('opt-tooltip-color', 'tooltip-color', applyTooltipVars);
    wireNumberInput('opt-tooltip-name-font', 'tooltip-name-font', applyTooltipVars);
    wireNumberInput('opt-tooltip-name-weight', 'tooltip-name-weight', applyTooltipVars);
    wireColorInput('opt-tooltip-name-color', 'tooltip-name-color', applyTooltipVars);

    // Apply saved tooltip CSS custom properties on init
    applyTooltipVars();
}

function wireCheckbox(elementId, settingsKey, onChange) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.checked = lsGet(settingsKey, el.checked);
    el.addEventListener('change', () => {
        lsSet(settingsKey, el.checked);
        onChange();
    });
}

function wireRadioGroup(name, settingsKey, onChange) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    const saved = lsGet(settingsKey, null);
    for (const r of radios) {
        if (saved !== null) r.checked = r.value === saved;
        r.addEventListener('change', () => {
            if (r.checked) {
                lsSet(settingsKey, r.value);
                onChange();
            }
        });
    }
}

function wireNumberInput(elementId, settingsKey, onChange) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const saved = lsGet(settingsKey, parseFloat(el.value));
    el.value = saved;
    el.addEventListener('change', () => {
        lsSet(settingsKey, parseFloat(el.value));
        onChange();
    });
}

function wireColorInput(elementId, settingsKey, onChange) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const saved = lsGet(settingsKey, el.value);
    el.value = saved;
    el.addEventListener('input', () => {
        lsSet(settingsKey, el.value);
        onChange();
    });
}

// ── Event wiring ────────────────────────────────────────────────────────────

function wireEvents() {
    // View toggle
    $btnGraph.addEventListener('click', () => {
        if (viewMode !== 'graph') switchToGraph();
    });

    $btnDiagram.addEventListener('click', () => {
        if (viewMode !== 'diagram') {
            // Show diagram for first visible node, or do nothing if none
            const visibleEdges = getVisibleEdges();
            const ids = getVisibleNodeIds(visibleEdges);
            if (ids.size > 0) {
                const firstId = [...ids].sort((a, b) => {
                    const na = nodeMap[a], nb = nodeMap[b];
                    return (na?.name || '').localeCompare(nb?.name || '');
                })[0];
                switchToDiagram(firstId);
            }
        }
    });

    // Back button
    $btnBack.addEventListener('click', () => {
        if (diagramStack.length > 0) {
            const prevId = diagramStack.pop();
            currentDiagramId = prevId;
            updateBreadcrumb();
            renderDiagram(prevId);
        } else {
            switchToGraph();
        }
    });

    // Breadcrumb clicks
    $breadcrumb.addEventListener('click', (e) => {
        const span = e.target.closest('span');
        if (!span) return;

        if (span.dataset.action === 'graph') {
            switchToGraph();
            return;
        }

        if (span.dataset.id) {
            const targetId = span.dataset.id;
            // Pop stack until we find this item
            while (diagramStack.length > 0 && diagramStack[diagramStack.length - 1] !== targetId) {
                diagramStack.pop();
            }
            // The target itself should not be in the stack as current
            if (diagramStack.length > 0 && diagramStack[diagramStack.length - 1] === targetId) {
                diagramStack.pop();
            }
            currentDiagramId = targetId;
            updateBreadcrumb();
            renderDiagram(targetId);
        }
    });

    // Carousel arrows
    $carouselPrev.addEventListener('click', () => {
        if (carouselBpKeys.length < 2) return;
        carouselIndex = (carouselIndex - 1 + carouselBpKeys.length) % carouselBpKeys.length;
        renderDiagram(currentDiagramId);
    });
    $carouselNext.addEventListener('click', () => {
        if (carouselBpKeys.length < 2) return;
        carouselIndex = (carouselIndex + 1) % carouselBpKeys.length;
        renderDiagram(currentDiagramId);
    });

    // Header search
    $search.addEventListener('input', debounce(() => {
        applySearch();
    }, 200));

    // Item list search
    $itemListSearch.addEventListener('input', debounce(() => {
        updateItemList();
    }, 200));

    // Item list clicks - star, checkbox, or name
    $itemList.addEventListener('click', (e) => {
        // Star click: toggle favorite
        if (e.target.classList.contains('item-star')) {
            const id = e.target.dataset.id;
            if (favoriteItems.has(id)) {
                favoriteItems.delete(id);
            } else {
                favoriteItems.add(id);
            }
            lsSet('favorite-items', [...favoriteItems]);
            updateItemList();
            return;
        }

        // Checkbox click: toggle selection
        if (e.target.classList.contains('item-select-cb')) {
            const id = e.target.dataset.id;
            if (e.target.checked) {
                selectedItems.add(id);
            } else {
                selectedItems.delete(id);
            }
            saveSelectedItems();
            renderCurrentView();
            return;
        }

        // Name click: open diagram
        const entry = e.target.closest('.item-entry');
        if (entry && entry.dataset.id && !e.target.classList.contains('item-select-cb')) {
            if (viewMode === 'graph') {
                diagramStack = [];
            } else {
                diagramStack.push(currentDiagramId);
            }
            switchToDiagram(entry.dataset.id);
        }
    });

    // Select/deselect visible button
    const $toggleSelect = document.getElementById('btn-toggle-select');
    if ($toggleSelect) {
        $toggleSelect.addEventListener('click', toggleSelectVisible);
    }
}

// debounce is now provided by common.js

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
    try {
        await loadData();

        buildCraftingCategoryFilters();
        await buildMapFilters();
        wireSettings();
        wireEvents();

        // Apply saved map filter if any
        const savedMaps = getActiveMaps();
        if (savedMaps) {
            await computeMapBlacklist(savedMaps);
        }

        updateItemList();
        renderGraph();
    } catch (err) {
        $loading.textContent = 'Failed to load crafting data: ' + err.message;
        console.error(err);
    }
}

init();
