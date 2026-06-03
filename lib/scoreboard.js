'use strict';
// État du scoreboard : 2 équipes (nom, couleur, score) + format BO1/BO3/BO5.
// Persisté dans data/scoreboard.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'scoreboard.json');

const FORMATS = ['BO1', 'BO3', 'BO5'];
const WINS = { BO1: 1, BO3: 2, BO5: 3 };   // victoires nécessaires pour gagner la série
const MAPS = { BO1: 1, BO3: 3, BO5: 5 };   // nombre de maps total (= nombre de rectangles)

function defaults() {
  return {
    visible: true,
    format: 'BO3',
    team1: { name: 'TEAM A', color: '#FF4655', score: 0 },
    team2: { name: 'TEAM B', color: '#00C8C8', score: 0 },
    sequence: [],   // ordre des points gagnés : [1, 2, 1, …] (n° d'équipe)
  };
}

let state = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Object.assign(defaults(), j, {
      team1: Object.assign(defaults().team1, j.team1 || {}),
      team2: Object.assign(defaults().team2, j.team2 || {}),
      sequence: Array.isArray(j.sequence) ? j.sequence.filter(n => n === 1 || n === 2) : [],
    });
  } catch { return defaults(); }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

function maxWins() { return WINS[state.format] || 2; }
function mapsCount() { return MAPS[state.format] || 3; }
function clampScore(n) { return Math.max(0, Math.min(maxWins(), parseInt(n, 10) || 0)); }

// Aligne la séquence des victoires sur les scores : retire les entrées en trop
// d'une équipe (depuis la fin) si son score a été réduit (ex. changement de format).
function trimSequence() {
  for (const [num, key] of [[1, 'team1'], [2, 'team2']]) {
    let cnt = state.sequence.filter(x => x === num).length;
    while (cnt > state[key].score) { state.sequence.splice(state.sequence.lastIndexOf(num), 1); cnt--; }
  }
}

function sanitizeTeam(t, base) {
  const out = { ...base };
  if (typeof t.name  === 'string') out.name = t.name.slice(0, 40);
  if (typeof t.color === 'string') out.color = t.color.slice(0, 16);
  if (t.score !== undefined) out.score = clampScore(t.score);
  return out;
}

function get() { return state; }

function set(patch) {
  patch = patch || {};
  if (patch.visible !== undefined) state.visible = !!patch.visible;
  if (typeof patch.format === 'string' && FORMATS.includes(patch.format)) {
    state.format = patch.format;
    // re-clamp les scores si le format réduit le max
    state.team1.score = clampScore(state.team1.score);
    state.team2.score = clampScore(state.team2.score);
  }
  if (patch.team1) state.team1 = sanitizeTeam(patch.team1, state.team1);
  if (patch.team2) state.team2 = sanitizeTeam(patch.team2, state.team2);
  trimSequence();
  save();
  return state;
}

function score(team, delta) {
  const key = team === '1' || team === 1 ? 'team1' : team === '2' || team === 2 ? 'team2' : null;
  if (!key) throw new Error('Équipe invalide');
  const num = key === 'team1' ? 1 : 2;
  const d = delta === 'inc' ? 1 : delta === 'dec' ? -1 : 0;
  const before = state[key].score;
  const after = clampScore(before + d);
  if (after > before) state.sequence.push(num);                          // point gagné → rectangle en plus
  else if (after < before) state.sequence.splice(state.sequence.lastIndexOf(num), 1); // retrait du dernier point de l'équipe
  state[key].score = after;
  save();
  return state;
}

function resetScore() {
  state.team1.score = 0;
  state.team2.score = 0;
  state.sequence = [];
  save();
  return state;
}

module.exports = { get, set, score, resetScore, FORMATS, maxWins, mapsCount };
