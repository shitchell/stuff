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

function applyCraftingBlacklists(graph, mapData) {
  if (!mapData?.map?.crafting_blacklists) return graph;
  // Detailed implementation deferred to crafting page integration
  return graph;
}
