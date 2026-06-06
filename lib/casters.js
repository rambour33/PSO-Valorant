'use strict';
// État des casters (commentateurs) : liste + indicateur « à l'antenne ».
// L'overlay n'affiche que les casters dont live === true. Persisté dans data/casters.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'casters.json');

function defaults() { return { visible: true, casters: [] }; }

let state = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      visible: j.visible !== false,
      casters: Array.isArray(j.casters) ? j.casters.map(normalize) : [],
    };
  } catch { return defaults(); }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

function normalize(c) {
  c = c || {};
  return {
    id: typeof c.id === 'string' && c.id ? c.id : crypto.randomBytes(6).toString('hex'),
    name: str(c.name || 'CASTER', 40),
    role: str(c.role, 40),
    handle: str(c.handle, 40),
    live: !!c.live,
  };
}

function get() { return state; }
function find(id) { return state.casters.find(c => c.id === id) || null; }

function setVisible(v) { state.visible = !!v; save(); return state; }

function add(patch) {
  const c = normalize({ ...patch, id: null, live: !!(patch && patch.live) });
  state.casters.push(c);
  save();
  return c;
}

function update(id, patch) {
  const c = find(id);
  if (!c) return null;
  if (patch.name   !== undefined) c.name   = str(patch.name, 40);
  if (patch.role   !== undefined) c.role   = str(patch.role, 40);
  if (patch.handle !== undefined) c.handle = str(patch.handle, 40);
  if (patch.live   !== undefined) c.live   = !!patch.live;
  save();
  return c;
}

function remove(id) {
  const before = state.casters.length;
  state.casters = state.casters.filter(c => c.id !== id);
  save();
  return state.casters.length !== before;
}

function setLive(id, live) { return update(id, { live: !!live }); }

module.exports = { get, setVisible, add, update, remove, setLive };
