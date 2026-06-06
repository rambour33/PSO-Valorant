'use strict';
// Config du chat Twitch : nom de la chaîne à suivre + visibilité de l'overlay.
// La lecture du chat se fait côté navigateur (IRC anonyme), aucune clé requise.
// Persisté dans data/chat.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'chat.json');

function defaults() { return { channel: '', visible: true, fontScale: 1, lineLength: 40 }; }

let state = load();

const clampScale = (n) => Math.max(0.7, Math.min(2.5, parseFloat(n) || 1));
const clampLine = (n) => Math.max(10, Math.min(120, parseInt(n, 10) || 40));

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { channel: cleanChannel(j.channel), visible: j.visible !== false, fontScale: clampScale(j.fontScale), lineLength: clampLine(j.lineLength) };
  } catch { return defaults(); }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

// Normalise un nom de chaîne Twitch (sans #, sans URL, minuscules).
function cleanChannel(v) {
  return String(v || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 25)
    .toLowerCase();
}

function get() { return state; }

function set(patch) {
  patch = patch || {};
  if (patch.channel !== undefined) state.channel = cleanChannel(patch.channel);
  if (patch.visible !== undefined) state.visible = !!patch.visible;
  if (patch.fontScale !== undefined) state.fontScale = clampScale(patch.fontScale);
  if (patch.lineLength !== undefined) state.lineLength = clampLine(patch.lineLength);
  save();
  return state;
}

module.exports = { get, set };
