'use strict';
// Écran « Start » (avant le live) repris de stack03/start.html : textes, logo,
// halo et compte à rebours réglables depuis la régie. Persisté dans data/start.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'start.json');

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);

const HALO_FX = ['none', 'pulse', 'breathe', 'heartbeat', 'flicker', 'drift', 'orbit', 'colors', 'rainbow'];
const GRID_FX = ['static', 'scroll', 'pulse', 'wave', 'floor'];

function normHalo(h, d) {
  h = Object.assign({}, d, h || {});
  return {
    on: h.on !== false,
    color: color(h.color, d.color),
    intensity: num(h.intensity, 0, 1, d.intensity),
    size: num(h.size, 10, 150, d.size),
    x: num(h.x, 0, 100, d.x),
    y: num(h.y, 0, 100, d.y),
    color2: color(h.color2, d.color2 || '#7b3be3'),
    fx: HALO_FX.includes(h.fx) ? h.fx : 'none',
    speed: num(h.speed, 0.1, 4, 1),
    amount: num(h.amount, 0, 1, 0.5),
  };
}
function normBg(b) {
  b = b || {};
  return {
    grid: GRID_FX.includes(b.grid) ? b.grid : 'static',
    particles: b.particles === true,
    scan: b.scan === true,
    grain: b.grain === true,
    speed: num(b.speed, 0.1, 4, 1),
    amount: num(b.amount, 0, 1, 0.5),
  };
}

function defaults() {
  return {
    visible: true,
    topLeft: 'Team LS4B',
    topRight: 'Houilles',
    logo: '/stack03/assets/logo-stack.svg',
    logoSize: 370,
    title: 'ÉDITION *03* — 18 OCTOBRE 2026',   // *mot* = en rose
    subtitle: 'Valorant 5v5 · Houilles',
    label: 'Le live démarre bientôt',
    waitText: 'BIENTÔT',
    endText: "C'EST PARTI",
    at: 0,                                      // heure de début (ms epoch), 0 = pas de compte à rebours
    // fx : effet animé du halo ; speed = multiplicateur de vitesse ; amount = amplitude (0–1)
    halo: { on: true, color: '#e33bae', color2: '#7b3be3', intensity: 0.16, size: 60, x: 50, y: 38,
      fx: 'none', speed: 1, amount: 0.5 },
    grid: true,
    // Fond : animation de la grille + calques optionnels (particules, balayage, grain)
    bg: { grid: 'static', particles: false, scan: false, grain: false, speed: 1, amount: 0.5 },
    sponsors: true,
  };
}

function normalize(j) {
  const d = defaults();
  j = j && typeof j === 'object' ? j : {};
  const h = Object.assign({}, d.halo, j.halo || {});
  const b = Object.assign({}, d.bg, j.bg || {});
  const logo = str(j.logo != null ? j.logo : d.logo, 300);
  return {
    visible: j.visible !== false,
    topLeft: str(j.topLeft != null ? j.topLeft : d.topLeft, 60),
    topRight: str(j.topRight != null ? j.topRight : d.topRight, 60),
    logo: logo === '' || /^\/[\w\-./]+$/.test(logo) ? logo : d.logo,
    logoSize: num(j.logoSize, 60, 800, d.logoSize),
    title: str(j.title != null ? j.title : d.title, 120),
    subtitle: str(j.subtitle != null ? j.subtitle : d.subtitle, 120),
    label: str(j.label != null ? j.label : d.label, 80),
    waitText: str(j.waitText != null ? j.waitText : d.waitText, 40),
    endText: str(j.endText != null ? j.endText : d.endText, 40),
    at: Math.max(0, parseInt(j.at, 10) || 0),
    halo: normHalo(h, d.halo),
    bg: normBg(b),
    grid: j.grid !== false,
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
  state = normalize(merged); save(); return state;
}
function reset() { state = defaults(); save(); return state; }

module.exports = { get, set, reset, normHalo, normBg };
