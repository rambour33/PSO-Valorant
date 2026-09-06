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
    team1: { name: 'TEAM A', color: '#FF4655', score: 0, players: normalizePlayers([]) },
    team2: { name: 'TEAM B', color: '#00C8C8', score: 0, players: normalizePlayers([]) },
    sequence: [],   // ordre des points gagnés : [1, 2, 1, …] (n° d'équipe)
  };
}

let state = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Object.assign(defaults(), j, {
      team1: Object.assign(defaults().team1, j.team1 || {}, { players: normalizePlayers((j.team1 || {}).players) }),
      team2: Object.assign(defaults().team2, j.team2 || {}, { players: normalizePlayers((j.team2 || {}).players) }),
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

// Cadrage de la photo dans son cadre : décalage x/y (% du cadre, tel que choisi dans la
// fenêtre de recadrage) + zoom (multiplicateur au-dessus du zoom qui remplit tout juste le
// cadre). Bornes x/y volontairement larges : la marge sûre dépend du ratio de la photo par
// rapport au cadre (peut dépasser 100% pour une photo très large ou très haute) — le vrai
// garde-fou anti-vide est déjà fait par la fenêtre de recadrage (clampPan), ceci n'est qu'un
// filet de sécurité contre une valeur aberrante.
function normalizeFit(f) {
  f = f || {};
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  return { x: clamp(num(f.x, 0), -300, 300), y: clamp(num(f.y, 0), -300, 300), zoom: clamp(num(f.zoom, 1.25), 1, 3) };
}

// Normalise une liste de joueurs : exactement 5 entrées { name, photo, agent, fit }.
// Accepte aussi un ancien format de simples chaînes (rétrocompatible).
function normalizePlayers(arr) {
  const one = (p) => {
    if (typeof p === 'string') return { name: p.slice(0, 30), photo: '', agent: '', fit: normalizeFit() };
    p = p || {};
    return { name: String(p.name || '').slice(0, 30), photo: String(p.photo || '').slice(0, 300), agent: String(p.agent || '').slice(0, 40), fit: normalizeFit(p.fit) };
  };
  const out = Array.isArray(arr) ? arr.slice(0, 5).map(one) : [];
  while (out.length < 5) out.push({ name: '', photo: '', agent: '', fit: normalizeFit() });
  return out;
}

function sanitizeTeam(t, base) {
  const out = { ...base, players: normalizePlayers(base.players) };
  if (typeof t.name  === 'string') out.name = t.name.slice(0, 40);
  if (typeof t.color === 'string') out.color = t.color.slice(0, 16);
  if (t.score !== undefined) out.score = clampScore(t.score);
  if (t.players !== undefined) out.players = normalizePlayers(t.players);
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

// Inverse gauche/droite : échange les deux équipes (nom, couleur, joueurs, score)
// et retourne l'ordre des victoires (1↔2) pour conserver les bons rectangles.
function swap() {
  const t = state.team1; state.team1 = state.team2; state.team2 = t;
  state.sequence = state.sequence.map((n) => (n === 1 ? 2 : 1));
  save();
  return state;
}

module.exports = { get, set, score, resetScore, swap, FORMATS, maxWins, mapsCount };
