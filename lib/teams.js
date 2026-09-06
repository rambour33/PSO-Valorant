'use strict';
// Bibliothèque d'équipes sauvegardées : nom, couleur, 5 joueurs.
// Persistée dans data/teams.json. Réutilisable pour remplir le scoreboard.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'teams.json');

let teams = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j) ? j.map(normalize).filter(Boolean) : [];
  } catch { return []; }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(teams, null, 2)); } catch {}
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

function players(arr) {
  const one = (p) => {
    if (typeof p === 'string') return { name: p.slice(0, 30), photo: '', agent: '', fit: normalizeFit() };
    p = p || {};
    return { name: String(p.name || '').slice(0, 30), photo: String(p.photo || '').slice(0, 300), agent: String(p.agent || '').slice(0, 40), fit: normalizeFit(p.fit) };
  };
  const out = Array.isArray(arr) ? arr.slice(0, 5).map(one) : [];
  while (out.length < 5) out.push({ name: '', photo: '', agent: '', fit: normalizeFit() });
  return out;
}

function normalize(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : crypto.randomBytes(6).toString('hex'),
    name: String(t.name || 'ÉQUIPE').slice(0, 40),
    color: String(t.color || '#FF4655').slice(0, 16),
    players: players(t.players),
  };
}

function list() { return teams; }

// Crée ou met à jour une équipe (par id). Renvoie l'équipe enregistrée.
function saveTeam(patch) {
  const t = normalize(patch);
  if (!t) throw new Error('Équipe invalide');
  const i = teams.findIndex(x => x.id === t.id);
  if (i >= 0) teams[i] = t; else teams.push(t);
  save();
  return t;
}

function remove(id) {
  const before = teams.length;
  teams = teams.filter(t => t.id !== id);
  save();
  return teams.length !== before;
}

module.exports = { list, saveTeam, remove };
