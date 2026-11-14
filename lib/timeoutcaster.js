'use strict';
// Écran « Timeout caster » repris de stack03/timeout-caster.html : fenêtres caméra + chat,
// titre, chrono de pause, casters, matchs en cours, logo et fond animé réglables depuis la régie.
// Persisté dans data/timeout-caster.json.

const fs = require('fs');
const path = require('path');
const { normHalo, normBg } = require('./start');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'timeout-caster.json');

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

function defaultMatch(i) {
  return { label: 'STATION 0' + (i + 1) + ' · BO3', a: i ? 'TEAM C' : 'TEAM A', b: i ? 'TEAM D' : 'TEAM B', sa: 0, sb: 0, color: i ? '#4ade80' : '#e33bae' };
}

function defaults() {
  return {
    visible: true,
    logo: '/stack03/assets/logo-stack.svg',
    logoSize: 92,
    title: 'TIMEOUT *CASTERS*',               // *mot* = en rose
    chipLabel: 'Timeout',
    who: 'Pause',
    duration: 60,                              // secondes
    endsAt: 0,                                 // fin du chrono (ms epoch), 0 = à l'arrêt
    endText: '0:00',
    casterLabel: 'CASTERS',
    casterSource: 'pso',                       // pso = casters « en direct » de l'onglet Casters
    c1: 'Caster 1',
    c2: 'Caster 2',
    matchTitle: 'Matchs en cours',
    matchSource: 'pso',                        // pso = scoreboard, manual = saisie, off = masqué
    matches: [defaultMatch(0), defaultMatch(1)],
    chatTitle: 'Chat',
    frame: true,                               // liserés roses sous les fenêtres
    halo: { on: false, color: '#e33bae', color2: '#7b3be3', intensity: 0.16, size: 60, x: 50, y: 38, fx: 'none', speed: 1, amount: 0.5 },
    grid: true,
    bg: { grid: 'static', particles: false, scan: false, grain: false, speed: 1, amount: 0.5 },
    sponsors: true,
  };
}

function normMatch(m, i) {
  const d = defaultMatch(i); m = Object.assign({}, d, m || {});
  return {
    label: str(m.label, 40), a: str(m.a, 24), b: str(m.b, 24),
    sa: Math.round(num(m.sa, 0, 99, 0)), sb: Math.round(num(m.sb, 0, 99, 0)),
    color: color(m.color, d.color),
  };
}

function normalize(j) {
  const d = defaults();
  j = j && typeof j === 'object' ? j : {};
  const g = (k, n) => str(j[k] != null ? j[k] : d[k], n);
  const logo = g('logo', 300);
  const ms = Array.isArray(j.matches) ? j.matches : d.matches;
  return {
    visible: j.visible !== false,
    logo: logo === '' || /^\/[\w\-./]+$/.test(logo) ? logo : d.logo,
    logoSize: num(j.logoSize, 30, 200, d.logoSize),
    title: g('title', 80),
    chipLabel: g('chipLabel', 30),
    who: g('who', 40),
    duration: Math.round(num(j.duration, 5, 3600, d.duration)),
    endsAt: Math.max(0, parseInt(j.endsAt, 10) || 0),
    endText: g('endText', 20),
    casterLabel: g('casterLabel', 20),
    casterSource: pick(j.casterSource, ['pso', 'manual'], d.casterSource),
    c1: g('c1', 40),
    c2: g('c2', 40),
    matchTitle: g('matchTitle', 40),
    matchSource: pick(j.matchSource, ['pso', 'manual', 'off'], d.matchSource),
    matches: [0, 1].map((i) => normMatch(ms[i], i)),
    chatTitle: g('chatTitle', 30),
    frame: j.frame !== false,
    halo: normHalo(j.halo, d.halo),
    grid: j.grid !== false,
    bg: normBg(j.bg),
    sponsors: j.sponsors !== false,
  };
}

let state = (function load() {
  try { return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { return defaults(); }
})();

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

function get() { return state; }
function set(j) {
  j = j || {};
  const merged = Object.assign({}, state, j, {
    halo: Object.assign({}, state.halo, j.halo || {}),
    bg: Object.assign({}, state.bg, j.bg || {}),
  });
  if (j.matches && typeof j.matches === 'object') merged.matches = [0, 1].map((i) => Object.assign({}, state.matches[i], j.matches[i] || {}));
  state = normalize(merged); save(); return state;
}
function reset() { state = defaults(); save(); return state; }

// Chrono : start(sec) lance (durée optionnelle), add(sec) prolonge, stop() remet à l'arrêt.
function start(sec) { return set({ duration: sec || state.duration, endsAt: Date.now() + (sec || state.duration) * 1000 }); }
function add(sec) {
  const base = state.endsAt > Date.now() ? state.endsAt : Date.now();
  return set({ endsAt: base + sec * 1000 });
}
function stop() { return set({ endsAt: 0 }); }

module.exports = { get, set, reset, start, add, stop };
