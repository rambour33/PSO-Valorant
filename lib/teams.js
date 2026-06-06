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

function players(arr) {
  const one = (p) => {
    if (typeof p === 'string') return { name: p.slice(0, 30), photo: '', agent: '' };
    p = p || {};
    return { name: String(p.name || '').slice(0, 30), photo: String(p.photo || '').slice(0, 300), agent: String(p.agent || '').slice(0, 40) };
  };
  const out = Array.isArray(arr) ? arr.slice(0, 5).map(one) : [];
  while (out.length < 5) out.push({ name: '', photo: '', agent: '' });
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
