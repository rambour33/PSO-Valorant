'use strict';
// Overlay sponsors (cadre du pack Stack 03) : liste ordonnée de logos qui tournent
// en boucle, durée par logo, côté de la barre rose. Persisté dans data/sponsors.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'sponsors.json');

const id = () => crypto.randomBytes(6).toString('hex');
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

function defaults() {
  return {
    visible: true,
    every: 10,
    bar: 'left',
    items: [
      { id: id(), name: 'LST', src: '/stack03/assets/logo-lst-2023-white.svg', wide: false, white: true, enabled: true },
      { id: id(), name: 'Crédit Mutuel', src: '/stack03/assets/credit-mutuel.svg', wide: false, white: true, enabled: true },
      { id: id(), name: 'Team LS4B', src: '/stack03/assets/logols4bv3.svg', wide: true, white: true, enabled: true },
    ],
  };
}

function normItem(it) {
  it = it || {};
  const src = str(it.src, 300);
  return {
    id: typeof it.id === 'string' && it.id ? str(it.id, 20) : id(),
    name: str(it.name || 'Sponsor', 40),
    // Seuls les logos du serveur (uploads, assets du pack) : pas d'URL externe.
    src: /^\/[\w\-./]+$/.test(src) ? src : '',
    wide: !!it.wide,
    white: it.white !== false,
    enabled: it.enabled !== false,
    // Taille du logo dans le cadre (1 = taille par défaut du pack).
    zoom: (() => { const z = parseFloat(it.zoom); return isFinite(z) ? Math.max(0.3, Math.min(3, Math.round(z * 100) / 100)) : 1; })(),
  };
}

function normalize(j) {
  const d = defaults();
  j = j && typeof j === 'object' ? j : {};
  const every = parseFloat(j.every);
  return {
    visible: j.visible !== false,
    every: isFinite(every) ? Math.max(2, Math.min(120, every)) : d.every,
    bar: j.bar === 'right' ? 'right' : 'left',
    items: Array.isArray(j.items) ? j.items.slice(0, 20).map(normItem) : d.items,
  };
}

let state = (function load() {
  try { return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { return defaults(); }
})();

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

function get() { return state; }
function set(j) { state = normalize(Object.assign({}, state, j || {})); save(); return state; }

module.exports = { get, set };
