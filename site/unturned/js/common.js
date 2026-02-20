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
