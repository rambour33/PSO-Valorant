'use strict';
// Overlays caméra des stations (repris de stack03/cam.html) : étiquette « STATION 0X », bandeau
// équipes / score / format et cadre sponsors. Chaque station suit le scoreboard (match en cours)
// ou une saisie manuelle. Persisté dans data/cams.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'cams.json');

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d; };
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
const BOS = ['BO1', 'BO3', 'BO5'];

function defStation(n) {
  return {
    visible: true,
    title: 'STATION 0' + n,
    label: 'Caméra',
    source: 'scoreboard',                 // scoreboard = match en cours, manual = saisie ci-dessous
    showTag: true, showLower: true, showSponsors: true,
    manual: { a: 'EQ1', b: 'EQ2', colorA: '#e33bae', colorB: '#4ade80', sa: 0, sb: 0, bo: 'BO3', map: 1 },
  };
}

function normStation(j, n) {
  const d = defStation(n); j = j && typeof j === 'object' ? j : {};
  const m = Object.assign({}, d.manual, j.manual || {});
  return {
    visible: j.visible !== false,
    title: str(j.title != null ? j.title : d.title, 30),
    label: str(j.label != null ? j.label : d.label, 40),
    source: j.source === 'manual' ? 'manual' : 'scoreboard',
    showTag: j.showTag !== false, showLower: j.showLower !== false, showSponsors: j.showSponsors !== false,
    manual: {
      a: str(m.a, 30), b: str(m.b, 30),
      colorA: color(m.colorA, d.manual.colorA), colorB: color(m.colorB, d.manual.colorB),
      sa: num(m.sa, 0, 99, 0), sb: num(m.sb, 0, 99, 0),
      bo: BOS.includes(m.bo) ? m.bo : 'BO3', map: num(m.map, 1, 5, 1),
    },
  };
}

function normalize(j) { j = j || {}; return { 1: normStation(j[1], 1), 2: normStation(j[2], 2) }; }

let state = (function load() {
  try { return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { return normalize({}); }
})();

function save() { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {} }

function get() { return state; }
function set(j) {
  j = j || {};
  const next = {};
  [1, 2].forEach((n) => {
    const p = j[n] || {};
    next[n] = Object.assign({}, state[n], p, { manual: Object.assign({}, state[n].manual, p.manual || {}) });
  });
  state = normalize(next); save(); return state;
}
function reset() { state = normalize({}); save(); return state; }

module.exports = { get, set, reset };
