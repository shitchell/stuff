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

  async resolveId(numericId, namespace = 'items', source = null) {
    const gi = await this.getGuidIndex();
    const nsMap = gi.by_id[String(numericId)]?.[namespace];
    if (!nsMap) return null;
    const guid = source ? (nsMap[source] || Object.values(nsMap)[0])
                        : Object.values(nsMap)[0];
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
  if (colDef.expr) return evaluateExpr(colDef.expr, entry);
  return getNestedValue(entry, colDef.key);
}

function loadColumnOverrides() {
  try { return JSON.parse(localStorage.getItem('ut:catalog:columns') || '{}'); }
  catch { return {}; }
}

function saveColumnOverrides(overrides) {
  localStorage.setItem('ut:catalog:columns', JSON.stringify(overrides));
}

// ── Expression Parser & Evaluator ───────────────────────────────────────────
// Recursive descent parser for arithmetic expressions over entry fields.
// Supports: +, -, *, /, %, parentheses, numeric literals, field references.
// Field references are dot-separated paths (e.g. parsed.consumable.food).
// Returns null for missing fields or errors (division by zero, etc).

function tokenizeExpr(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue; }
    if ('+-*/%()'.includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i] });
      i++;
    } else if (/[0-9.]/.test(expr[i])) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'num', value: parseFloat(num) });
    } else if (/[a-zA-Z_]/.test(expr[i])) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) id += expr[i++];
      tokens.push({ type: 'field', value: id });
    } else {
      i++; // skip unknown
    }
  }
  return tokens;
}

function parseExprTokens(tokens) {
  let pos = 0;
  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function consume() { return tokens[pos++]; }

  function parseAddSub() {
    let node = parseMulDiv();
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseMulDiv();
      node = { type: 'binop', op, left: node, right };
    }
    return node;
  }

  function parseMulDiv() {
    let node = parseUnary();
    while (peek() && ('*/%'.includes(peek().value))) {
      const op = consume().value;
      const right = parseUnary();
      node = { type: 'binop', op, left: node, right };
    }
    return node;
  }

  function parseUnary() {
    if (peek() && peek().value === '-') {
      consume();
      const operand = parsePrimary();
      return { type: 'binop', op: '*', left: { type: 'num', value: -1 }, right: operand };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) return { type: 'num', value: 0 };
    if (t.type === 'num') { consume(); return { type: 'num', value: t.value }; }
    if (t.type === 'field') { consume(); return { type: 'field', value: t.value }; }
    if (t.value === '(') {
      consume();
      const node = parseAddSub();
      if (peek() && peek().value === ')') consume();
      return node;
    }
    consume();
    return { type: 'num', value: 0 };
  }

  return parseAddSub();
}

function evalAST(node, entry) {
  if (node.type === 'num') return node.value;
  if (node.type === 'field') {
    const v = getNestedValue(entry, node.value);
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  if (node.type === 'binop') {
    const l = evalAST(node.left, entry);
    const r = evalAST(node.right, entry);
    if (l == null || r == null) return null;
    switch (node.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return r === 0 ? null : l / r;
      case '%': return r === 0 ? null : l % r;
    }
  }
  return null;
}

function evaluateExpr(expr, entry) {
  try {
    const tokens = tokenizeExpr(expr);
    const ast = parseExprTokens(tokens);
    const result = evalAST(ast, entry);
    if (result == null || !isFinite(result)) return null;
    return Math.round(result * 100) / 100; // 2 decimal places
  } catch { return null; }
}

function extractExprFields(expr) {
  return tokenizeExpr(expr).filter(t => t.type === 'field').map(t => t.value);
}

// ── Custom Column Definitions ───────────────────────────────────────────────

const PRESET_CUSTOM_COLUMNS = [
  { id: 'cc_capacity', label: 'Capacity', expr: 'parsed.storage.width * parsed.storage.height' },
  { id: 'cc_food_water_ratio', label: 'Food:Water', expr: 'parsed.consumable.food / parsed.consumable.water' },
  { id: 'cc_total_restore', label: 'Total Restore', expr: 'parsed.consumable.food + parsed.consumable.water + parsed.consumable.health' },
];

function loadCustomColumns() {
  let userCols;
  try { userCols = JSON.parse(localStorage.getItem('ut:catalog:customColumns')); } catch {}
  if (!Array.isArray(userCols)) {
    return PRESET_CUSTOM_COLUMNS.map(c => ({ ...c }));
  }
  const userIds = new Set(userCols.map(c => c.id));
  const merged = [...userCols];
  for (const preset of PRESET_CUSTOM_COLUMNS) {
    if (!userIds.has(preset.id)) merged.push({ ...preset });
  }
  return merged;
}

function saveCustomColumns(cols) {
  localStorage.setItem('ut:catalog:customColumns', JSON.stringify(cols));
}

function customColumnAvailable(customCol, entries) {
  const fields = extractExprFields(customCol.expr);
  if (fields.length === 0) return false;
  return entries.some(e => fields.every(f => getNestedValue(e, f) != null));
}

function resolveExprFieldName(input) {
  // Try exact key match
  const exact = ALL_AVAILABLE_COLUMNS.find(c => c.key === input);
  if (exact) return exact.key;
  // Try case-insensitive label match
  const lower = input.toLowerCase();
  const byLabel = ALL_AVAILABLE_COLUMNS.find(c => c.label.toLowerCase() === lower);
  if (byLabel) return byLabel.key;
  // Return as-is (might be a valid nested path not in ALL_AVAILABLE_COLUMNS)
  return input;
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
  { key: '_custom:cc_capacity', label: 'Capacity', expr: 'parsed.storage.width * parsed.storage.height' },
  { key: 'parsed.speed_max', label: 'Speed' },
  { key: 'parsed.health', label: 'Health (Structure)' },
  { key: 'parsed.fuel_capacity', label: 'Fuel Cap' },
];

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
    allConditions: [
      { field: 'parsed.damage.zombie', operator: '>', value: '0' },
    ],
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
      { field: 'type', operator: '=', value: 'Storage' },
      { field: 'type', operator: '=', value: 'Backpack' },
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
      const v = col.expr ? evaluateExpr(col.expr, e) : getNestedValue(e, col.key);
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
  console.log('[MAP-FILTER] applyCraftingBlacklists: processing', blacklists.length, 'blacklist(s)');

  // Collect all blocked blueprint IDs and blocked source/target GUIDs
  let blockAllCore = false;
  const blockedInputGuids = new Set();
  const blockedOutputGuids = new Set();

  for (const bl of blacklists) {
    if (bl.allow_core_blueprints === false) {
      blockAllCore = true;
      console.log('[MAP-FILTER] applyCraftingBlacklists: blockAllCore = true (allow_core_blueprints: false)');
    }
    for (const guid of (bl.blocked_input_guids || [])) {
      blockedInputGuids.add(guid);
    }
    for (const guid of (bl.blocked_output_guids || [])) {
      blockedOutputGuids.add(guid);
    }
  }

  console.log('[MAP-FILTER] applyCraftingBlacklists: blockAllCore:', blockAllCore,
    ', blockedInputGuids:', blockedInputGuids.size,
    ', blockedOutputGuids:', blockedOutputGuids.size);

  // Build a set of blueprint IDs from the map's own graph (if provided)
  const mapBlueprintIds = new Set();
  if (mapGraph) {
    for (const e of mapGraph.edges) {
      mapBlueprintIds.add(e.blueprintId);
    }
    console.log('[MAP-FILTER] applyCraftingBlacklists: mapBlueprintIds count:', mapBlueprintIds.size,
      ', sample IDs:', [...mapBlueprintIds].slice(0, 5));
  } else {
    console.log('[MAP-FILTER] applyCraftingBlacklists: no map graph provided');
  }

  // Filter edges from the base graph
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

  console.log('[MAP-FILTER] applyCraftingBlacklists: after base graph filtering:', filteredEdges.length, 'edges remain (from', graph.edges.length, ')');

  // If core blueprints are blocked and the map has its own graph, merge map edges in
  // (these replace the blocked core edges with map-specific ones)
  if (blockAllCore && mapGraph) {
    let mapEdgesAdded = 0;
    for (const e of mapGraph.edges) {
      // Apply blocked input/output filters to map edges too
      if (blockedInputGuids.has(e.source)) continue;
      if (blockedOutputGuids.has(e.target)) continue;
      filteredEdges.push(e);
      mapEdgesAdded++;
    }
    console.log('[MAP-FILTER] applyCraftingBlacklists: merged', mapEdgesAdded, 'map-specific edges (from', mapGraph.edges.length, 'total map edges)');
  }

  console.log('[MAP-FILTER] applyCraftingBlacklists: final edge count:', filteredEdges.length);

  // Collect node IDs still referenced by remaining edges
  const referencedIds = new Set();
  for (const e of filteredEdges) {
    referencedIds.add(e.source);
    referencedIds.add(e.target);
  }

  // Build a combined node pool (base graph nodes + map graph nodes for deduplication)
  const nodeById = {};
  for (const n of graph.nodes) {
    nodeById[n.id] = n;
  }
  if (mapGraph) {
    for (const n of mapGraph.nodes) {
      if (!nodeById[n.id]) nodeById[n.id] = n;
    }
  }

  // Filter nodes to only those still referenced
  const filteredNodes = [];
  for (const id of referencedIds) {
    if (nodeById[id]) filteredNodes.push(nodeById[id]);
  }

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
    if (ref === 'this' || ref.startsWith('this ')) {
      const qty = ref.includes(' x ') ? parseInt(ref.split(' x ')[1]) : 1;
      return { guid: ownerGuid, quantity: qty, isTool: false };
    }
    const parts = ref.split(' x ');
    let guid = parts[0];
    const qty = parts.length > 1 ? parseInt(parts[1]) : 1;
    // Numeric IDs should have been resolved by the exporter.
    // If we see one here, warn — it means the exporter missed it.
    if (/^\d+$/.test(guid)) {
      console.warn(`[CRAFTING] Unresolved numeric ID in blueprint ref: ${guid}`);
      const resolved = guidIndex.by_id[guid]?.items;
      if (resolved) {
        guid = Object.values(resolved)[0];
      } else {
        return null;
      }
    }
    return { guid, quantity: qty, isTool: false };
  }
  if (typeof ref === 'object' && ref.ID) {
    let guid = ref.ID;
    if (guid === 'this') guid = ownerGuid;
    else if (/^\d+$/.test(guid)) {
      console.warn(`[CRAFTING] Unresolved numeric ID in tool ref: ${guid}`);
      const resolved = guidIndex.by_id[guid]?.items;
      if (resolved) {
        guid = Object.values(resolved)[0];
      } else {
        return null;
      }
    }
    const isTool = ref.Delete === false;
    return { guid, quantity: ref.Amount || 1, isTool };
  }
  return null;
}

function buildCraftingGraph(entries, guidIndex, assets, blueprintPrefix) {
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();
  const craftingCategories = new Set();
  let bpCounter = 0;
  const bpPrefix = blueprintPrefix || 'bp';

  // Build entry lookup by guid
  const entryByGuid = {};
  for (const e of entries) {
    entryByGuid[e.guid] = e;
  }

  function ensureNode(guid) {
    if (nodeSet.has(guid)) return true;
    const gi = guidIndex.entries[guid];
    if (!gi) return false;
    nodeSet.add(guid);
    const entry = entryByGuid[guid];
    nodes.push({
      id: guid,
      name: gi.name,
      type: gi.type || '',
      rarity: entry?.rarity || '',
      useable: entry?.useable || '',
      category: [],
      maps: [],
    });
    return true;
  }

  // Process blueprints
  for (const entry of entries) {
    if (!entry.blueprints || entry.blueprints.length === 0) continue;

    for (const bp of entry.blueprints) {
      if (bp.operation === 'FillTargetItem' || bp.operation === 'RepairTargetItem') continue;

      const blueprintId = `${bpPrefix}-${bpCounter++}`;
      const bpName = (bp.name || '').toLowerCase();
      const craftingCategory = CRAFTING_CATEGORIES[bp.category_tag] || '';
      if (craftingCategory) craftingCategories.add(craftingCategory);

      // Determine edge type from blueprint name, falling back to crafting category
      const effectiveName = bpName || craftingCategory.toLowerCase();
      let edgeType = 'craft';
      if (effectiveName === 'salvage' || effectiveName === 'unstack') edgeType = 'salvage';
      else if (effectiveName === 'repair') edgeType = 'repair';

      // State_Transfer blueprints are skin-swap recipes (base ↔ skinned variant)
      if (bp.state_transfer) {
        edgeType = 'skin_swap';
      }

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
      node.useable = entry?.useable || '';
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
