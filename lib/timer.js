'use strict';
// Minuteur pilotable : décompte (down) ou chrono (up). La valeur n'est pas
// « tickée » par le serveur : on stocke une ancre (baseMs + startedAt) et chaque
// client recalcule le temps en local. Persiste la config dans data/timer.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'timer.json');

const MAX = 24 * 3600 * 1000;

function defaults() {
  return { visible: true, mode: 'down', durationMs: 300000, label: '', running: false, baseMs: 300000, startedAt: null };
}

let state = load();

function load() {
  const d = defaults();
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    d.visible = j.visible !== false;
    if (j.mode === 'up' || j.mode === 'down') d.mode = j.mode;
    if (typeof j.durationMs === 'number') d.durationMs = clampDur(j.durationMs);
    if (typeof j.label === 'string') d.label = j.label.slice(0, 40);
    // On recharge toujours à l'arrêt (un timer ne « court » pas après un redémarrage serveur).
    d.baseMs = d.mode === 'down' ? d.durationMs : 0;
  } catch {}
  return d;
}

function save() {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ visible: state.visible, mode: state.mode, durationMs: state.durationMs, label: state.label }, null, 2));
  } catch {}
}

const clampDur = (n) => Math.max(0, Math.min(MAX, parseInt(n, 10) || 0));

// Valeur courante (ms), bornée à 0.
function value() {
  if (!state.running) return Math.max(0, state.baseMs);
  const delta = Date.now() - state.startedAt;
  const v = state.mode === 'down' ? state.baseMs - delta : state.baseMs + delta;
  return Math.max(0, v);
}

function snap() {
  return { visible: state.visible, mode: state.mode, durationMs: state.durationMs, label: state.label, running: state.running, valueMs: value() };
}

function set(p) {
  p = p || {};
  if (p.visible !== undefined) state.visible = !!p.visible;
  if (typeof p.label === 'string') state.label = p.label.slice(0, 40);
  let modeChanged = false;
  if ((p.mode === 'down' || p.mode === 'up') && p.mode !== state.mode) { state.mode = p.mode; modeChanged = true; }
  let durChanged = false;
  if (p.durationMs !== undefined) { state.durationMs = clampDur(p.durationMs); durChanged = true; }
  // Hors course, on réaligne la valeur affichée sur la config.
  if (!state.running && (modeChanged || durChanged)) {
    state.baseMs = state.mode === 'down' ? state.durationMs : 0;
    state.startedAt = null;
  }
  save();
  return snap();
}

function start() {
  if (!state.running) { state.startedAt = Date.now(); state.running = true; }
  return snap();
}

function pause() {
  if (state.running) { state.baseMs = value(); state.running = false; state.startedAt = null; }
  return snap();
}

function toggle() { return state.running ? pause() : start(); }

function reset() {
  state.baseMs = state.mode === 'down' ? state.durationMs : 0;
  state.running = false;
  state.startedAt = null;
  return snap();
}

// Ajoute (ou retire) du temps à la valeur courante, en course ou non.
function adjust(deltaMs) {
  const nv = Math.max(0, Math.min(MAX, value() + (parseInt(deltaMs, 10) || 0)));
  state.baseMs = nv;
  if (state.running) state.startedAt = Date.now();
  return snap();
}

function setVisible(v) { state.visible = !!v; save(); return snap(); }

module.exports = { get: snap, set, start, pause, toggle, reset, adjust, setVisible };
