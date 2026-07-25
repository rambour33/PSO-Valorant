'use strict';
// Rulesets de veto sauvegardés : nom + format + pool de maps sélectionnées.
// Persisté dans data/rulesets.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'rulesets.json');

const FORMATS = ['BO1', 'BO3', 'BO5'];

let rulesets = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j) ? j.map(normalize).filter(Boolean) : [];
  } catch { return []; }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rulesets, null, 2)); } catch {}
}

function normalize(r) {
  if (!r || typeof r !== 'object') return null;
  const pool = Array.isArray(r.pool)
    ? [...new Set(r.pool.map((s) => String(s || '').slice(0, 40)).filter(Boolean))].slice(0, 30)
    : [];
  return {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomBytes(6).toString('hex'),
    name: String(r.name || 'Ruleset').slice(0, 40),
    format: FORMATS.includes(r.format) ? r.format : 'BO3',
    pool,
  };
}

function list() { return rulesets; }

function saveRuleset(patch) {
  const r = normalize(patch);
  if (!r) throw new Error('Ruleset invalide');
  const i = rulesets.findIndex((x) => x.id === r.id);
  if (i >= 0) rulesets[i] = r; else rulesets.push(r);
  save();
  return r;
}

function remove(id) {
  const before = rulesets.length;
  rulesets = rulesets.filter((r) => r.id !== id);
  save();
  return rulesets.length !== before;
}

module.exports = { list, saveRuleset, remove };
