'use strict';
// Pool d'équipes du bracket builder (ordre = seeding). Une équipe sauvegardée depuis le scoreboard
// y entre automatiquement. Indépendant du tournoi généré (survit à « Réinitialiser le tournoi »).
// Persisté dans data/team-pool.json.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'team-pool.json');

let fresh = false;
let ids = (function load() {
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(j.ids) ? j.ids.map(String) : []; } catch { fresh = true; return []; }
})();

function save() { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ ids }, null, 2)); } catch {} }

function get() { return ids.slice(); }
function set(list) { ids = [...new Set((Array.isArray(list) ? list : []).map(String))].slice(0, 128); save(); return get(); }
function add(id) { if (id && !ids.includes(id)) { ids.push(String(id)); save(); } return get(); }
function remove(id) { const n = ids.length; ids = ids.filter((x) => x !== id); if (ids.length !== n) save(); return get(); }

// Premier démarrage (pas encore de fichier) : le pool reprend les équipes du tournoi existant.
function initFrom(list) { if (!fresh) return false; fresh = false; set(list); return true; }

module.exports = { get, set, add, remove, initFrom };
