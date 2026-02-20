// Unturned shared logic — common.js

// ── Utilities ───────────────────────────────────────────────────────────────

function getNestedValue(obj, path) {
  let v = obj;
  for (const p of path.split('.')) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function pathStartsWith(entryPath, prefix) {
  if (prefix.length > entryPath.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (entryPath[i] !== prefix[i]) return false;
  }
  return true;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Data Loader ─────────────────────────────────────────────────────────────

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

// ── Type Field Definitions ──────────────────────────────────────────────────

const BASE_FIELDS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'rarity', label: 'Rarity' },
];

const TYPE_FIELD_DEFS = {
  Gun: [
    { key: 'parsed.slot', label: 'Slot' },
    { key: 'parsed.range', label: 'Range' },
    { key: 'parsed.firerate', label: 'Firerate' },
    { key: 'parsed.damage.player', label: 'Player Dmg' },
    { key: 'parsed.damage.zombie', label: 'Zombie Dmg' },
    { key: 'parsed.ammo_max', label: 'Ammo' },
    { key: 'parsed.durability', label: 'Durability' },
    { key: 'parsed.spread_aim', label: 'Spread Aim' },
  ],
  Melee: [
    { key: 'parsed.slot', label: 'Slot' },
    { key: 'parsed.range', label: 'Range' },
    { key: 'parsed.damage.player', label: 'Player Dmg' },
    { key: 'parsed.damage.zombie', label: 'Zombie Dmg' },
    { key: 'parsed.strength', label: 'Strength' },
    { key: 'parsed.stamina', label: 'Stamina' },
    { key: 'parsed.durability', label: 'Durability' },
  ],
  Food: [
    { key: 'parsed.consumable.food', label: 'Food' },
    { key: 'parsed.consumable.water', label: 'Water' },
    { key: 'parsed.consumable.health', label: 'Health' },
    { key: 'parsed.consumable.virus', label: 'Virus' },
  ],
  Water: [
    { key: 'parsed.consumable.food', label: 'Food' },
    { key: 'parsed.consumable.water', label: 'Water' },
    { key: 'parsed.consumable.health', label: 'Health' },
    { key: 'parsed.consumable.virus', label: 'Virus' },
  ],
  Medical: [
    { key: 'parsed.consumable.health', label: 'Health' },
    { key: 'parsed.consumable.virus', label: 'Virus' },
    { key: 'parsed.consumable.bleeding_modifier', label: 'Bleeding' },
  ],
  Backpack: [
    { key: 'parsed.storage.width', label: 'Width' },
    { key: 'parsed.storage.height', label: 'Height' },
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Shirt: [
    { key: 'parsed.storage.width', label: 'Width' },
    { key: 'parsed.storage.height', label: 'Height' },
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Pants: [
    { key: 'parsed.storage.width', label: 'Width' },
    { key: 'parsed.storage.height', label: 'Height' },
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Vest: [
    { key: 'parsed.storage.width', label: 'Width' },
    { key: 'parsed.storage.height', label: 'Height' },
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Hat: [
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Mask: [
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Glasses: [
    { key: 'parsed.armor', label: 'Armor' },
  ],
  Vehicle: [
    { key: 'parsed.speed_max', label: 'Speed' },
    { key: 'parsed.fuel_capacity', label: 'Fuel Cap' },
    { key: 'parsed.health_max', label: 'Health' },
    { key: 'parsed.trunk_x', label: 'Trunk W' },
    { key: 'parsed.trunk_y', label: 'Trunk H' },
  ],
  Animal: [
    { key: 'parsed.health', label: 'Health' },
    { key: 'parsed.damage', label: 'Damage' },
    { key: 'parsed.speed_run', label: 'Run Speed' },
    { key: 'parsed.behaviour', label: 'Behaviour' },
    { key: 'parsed.reward_xp', label: 'XP' },
  ],
  Barricade: [
    { key: 'parsed.health', label: 'Health' },
    { key: 'parsed.build', label: 'Build' },
    { key: 'parsed.range', label: 'Range' },
  ],
  Structure: [
    { key: 'parsed.health', label: 'Health' },
    { key: 'parsed.construct', label: 'Construct' },
    { key: 'parsed.range', label: 'Range' },
  ],
  Magazine: [
    { key: 'parsed.amount', label: 'Amount' },
    { key: 'parsed.count_max', label: 'Max Count' },
  ],
  Throwable: [
    { key: 'parsed.fuse', label: 'Fuse' },
    { key: 'parsed.explosion', label: 'Explosion' },
  ],
  Spawn: [
    { key: 'parsed.table_entries.length', label: 'Entries' },
  ],
};

// Union of all available columns across all types (for autocomplete)
const ALL_AVAILABLE_COLUMNS = (() => {
  const seen = new Set();
  const result = [];
  // Start with base fields
  for (const f of BASE_FIELDS) {
    seen.add(f.key);
    result.push(f);
  }
  // Add description and size
  result.push({ key: 'description', label: 'Description' });
  seen.add('description');
  result.push({ key: 'size_x', label: 'Size X' });
  seen.add('size_x');
  result.push({ key: 'size_y', label: 'Size Y' });
  seen.add('size_y');
  // Add all type-specific fields
  for (const fields of Object.values(TYPE_FIELD_DEFS)) {
    for (const f of fields) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        result.push(f);
      }
    }
  }
  return result;
})();

// ── Default Category Columns ────────────────────────────────────────────────

const DEFAULT_CATEGORY_COLUMNS = {
  '': BASE_FIELDS,
  'Items': BASE_FIELDS,
  'Vehicles': [
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'rarity', label: 'Rarity' },
    ...TYPE_FIELD_DEFS.Vehicle,
  ],
  'Animals': [
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' },
    ...TYPE_FIELD_DEFS.Animal,
  ],
  'Spawns': [
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' },
    ...TYPE_FIELD_DEFS.Spawn,
  ],
};

function getDefaultColumnsForCategory(path, entries) {
  const pathKey = path.join('/');
  // Check explicit mapping
  if (DEFAULT_CATEGORY_COLUMNS[pathKey]) return DEFAULT_CATEGORY_COLUMNS[pathKey];
  // Look at the types present; if all same type, use BASE_FIELDS + TYPE_FIELD_DEFS[type]
  if (entries && entries.length > 0) {
    const types = new Set(entries.map(e => e.type));
    if (types.size === 1) {
      const type = [...types][0];
      if (TYPE_FIELD_DEFS[type]) {
        return [
          { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'rarity', label: 'Rarity' },
          ...TYPE_FIELD_DEFS[type],
        ];
      }
    }
  }
  return BASE_FIELDS;
}

// ── Column Inheritance System ───────────────────────────────────────────────

function getColumnsForPath(path, overrides, entries) {
  const pk = path.join('/');
  // 1. Check overrides (localStorage), walking up from path to root
  if (overrides) {
    for (let i = path.length; i >= 0; i--) {
      const key = path.slice(0, i).join('/');
      if (overrides[key]) return { columns: overrides[key], fromPath: key, isOverride: true };
    }
  }
  // 2. Check DEFAULT_CATEGORY_COLUMNS, walking up
  for (let i = path.length; i >= 0; i--) {
    const key = path.slice(0, i).join('/');
    if (DEFAULT_CATEGORY_COLUMNS[key]) return { columns: DEFAULT_CATEGORY_COLUMNS[key], fromPath: key, isOverride: false };
  }
  // 3. Fall back to dynamic detection
  return { columns: getDefaultColumnsForCategory(path, entries), fromPath: '', isOverride: false };
}

function resolveColumnValue(entry, colDef) {
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

// ── Filter Engine ───────────────────────────────────────────────────────────

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
    .map(c => ({ col: c, filter: parseFilter(filters[c.key] || '') }))
    .filter(f => f.filter);
  if (active.length === 0) return entries;
  return entries.filter(e =>
    active.every(({ col, filter }) => matchesFilter(resolveColumnValue(e, col), filter))
  );
}

// ── Map Filtering Utilities ─────────────────────────────────────────────────

function getSpawnableIds(mapData) {
  if (!mapData?.map?.spawn_resolution) return null;
  return new Set(mapData.map.spawn_resolution.spawnable_item_ids);
}

function isAvailableOnMap(entry, mapData, mapEntryIds) {
  const spawnable = getSpawnableIds(mapData);
  if (spawnable && spawnable.has(entry.id)) return true;
  if (mapEntryIds && mapEntryIds.has(entry.id)) return true;
  return false;
}

function applyCraftingBlacklists(graph, mapData, mapGraph) {
  if (!mapData?.map?.crafting_blacklists) return graph;

  const blacklists = mapData.map.crafting_blacklists;

  // Collect all blocked blueprint IDs and blocked source/target GUIDs
  let blockAllCore = false;
  const blockedInputGuids = new Set();
  const blockedOutputGuids = new Set();

  for (const bl of blacklists) {
    if (bl.allow_core_blueprints === false) {
      blockAllCore = true;
    }
    for (const guid of (bl.blocked_input_guids || [])) {
      blockedInputGuids.add(guid);
    }
    for (const guid of (bl.blocked_output_guids || [])) {
      blockedOutputGuids.add(guid);
    }
  }

  // Build a set of blueprint IDs from the map's own graph (if provided)
  const mapBlueprintIds = new Set();
  if (mapGraph) {
    for (const e of mapGraph.edges) {
      mapBlueprintIds.add(e.blueprintId);
    }
  }

  // Filter edges
  const filteredEdges = graph.edges.filter(e => {
    // If core blueprints are blocked, only keep edges from the map's own blueprints
    if (blockAllCore && !mapBlueprintIds.has(e.blueprintId)) {
      return false;
    }
    // Check blocked inputs (source GUIDs)
    if (blockedInputGuids.has(e.source)) return false;
    // Check blocked outputs (target GUIDs)
    if (blockedOutputGuids.has(e.target)) return false;
    return true;
  });

  // Collect node IDs still referenced by remaining edges
  const referencedIds = new Set();
  for (const e of filteredEdges) {
    referencedIds.add(e.source);
    referencedIds.add(e.target);
  }

  // Filter nodes to only those still referenced
  const filteredNodes = graph.nodes.filter(n => referencedIds.has(n.id));

  // Rebuild blueprint groups
  const filteredBlueprintGroups = {};
  for (const e of filteredEdges) {
    if (!filteredBlueprintGroups[e.blueprintId]) filteredBlueprintGroups[e.blueprintId] = [];
    filteredBlueprintGroups[e.blueprintId].push(e);
  }

  // Rebuild crafting categories from remaining edges
  const filteredCategories = new Set();
  for (const e of filteredEdges) {
    if (e.craftingCategory) filteredCategories.add(e.craftingCategory);
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    blueprintGroups: filteredBlueprintGroups,
    craftingCategories: [...filteredCategories].sort(),
  };
}

// ── Crafting Graph Builder ──────────────────────────────────────────────────

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

function parseBlueprintRef(ref, ownerGuid, guidIndex) {
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
      else return null;
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

function buildCraftingGraph(entries, guidIndex, assets) {
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();
  const craftingCategories = new Set();
  let bpCounter = 0;

  function ensureNode(guid) {
    if (nodeSet.has(guid)) return true;
    const gi = guidIndex.entries[guid];
    if (!gi) return false;
    nodeSet.add(guid);
    nodes.push({
      id: guid,
      name: gi.name,
      type: gi.type || '',
      rarity: '',
      category: [],
      maps: [],
    });
    return true;
  }

  // Build entry lookup by guid
  const entryByGuid = {};
  for (const e of entries) {
    entryByGuid[e.guid] = e;
  }

  // Process blueprints
  for (const entry of entries) {
    if (!entry.blueprints || entry.blueprints.length === 0) continue;

    for (const bp of entry.blueprints) {
      if (bp.operation === 'FillTargetItem' || bp.operation === 'RepairTargetItem') continue;

      const blueprintId = `bp-${bpCounter++}`;
      const bpName = (bp.name || '').toLowerCase();
      const craftingCategory = CRAFTING_CATEGORIES[bp.category_tag] || '';
      if (craftingCategory) craftingCategories.add(craftingCategory);

      // Determine edge type
      let edgeType = 'craft';
      if (bpName === 'salvage' || bpName === 'unstack') edgeType = 'salvage';
      else if (bpName === 'repair') edgeType = 'repair';

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
