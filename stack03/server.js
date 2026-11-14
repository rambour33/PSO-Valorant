'use strict';
// STACK 03 — module de régie, monté dans le serveur PSO Valorant sous /stack03.
// Sert les overlays OBS et la régie en http, garde l'état du tournoi dans
// data/state.json et le pousse en direct (Socket.IO) à toutes les pages.
// Chaque équipe reçoit un lien personnel /equipe/<token> pour faire son pick & ban.

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const Stack = require('./js/core.js');

let PORT = process.env.PORT || 3003;
let io = null; // namespace Socket.IO /stack03, fourni par mount()
const ROOT = __dirname;
const DATA = process.env.STACK_DATA_DIR ? path.resolve(process.env.STACK_DATA_DIR) : path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'state.json');
const LINKS_FILE = path.join(DATA, 'links.json');

// ── Persistance ───────────────────────────────────────────────────────────────
function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function writeJSON(file, obj) {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2)); fs.renameSync(file + '.tmp', file); }
  catch (e) { console.log('  ⚠️  Écriture impossible (' + path.basename(file) + ') : ' + e.message); }
}

let state = Stack.merge(Stack.defaults(), readJSON(STATE_FILE) || {});
let saveTimer = null;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeJSON(STATE_FILE, state), 250); }

// Liens équipes (un token par équipe, stable toute la journée) + clé régie.
function tok(n) { return crypto.randomBytes(n || 9).toString('hex'); }
let links = readJSON(LINKS_FILE) || {};
if (!Array.isArray(links.teams)) links.teams = [];
for (let i = 0; i < 4; i++) if (!links.teams[i]) links.teams[i] = tok();
if (!links.regieKey) links.regieKey = tok(6);
writeJSON(LINKS_FILE, links);
function teamOfToken(t) { const i = t ? links.teams.indexOf(String(t)) : -1; return i >= 0 ? i : null; }

// ── Droits ────────────────────────────────────────────────────────────────────
// Depuis le PC du serveur (OBS, dock) : tout est permis. Depuis un autre PC, il
// faut la clé régie (affichée dans la console) pour modifier l'état. Les équipes
// n'agissent que sur leur propre veto, via leur token.
function isLocal(addr) { return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'; }
function isRegieReq(req) {
  const k = req.get('x-regie-key') || req.query.key;
  return isLocal(req.socket.remoteAddress) || k === links.regieKey;
}

// ── Pick & ban par match ──────────────────────────────────────────────────────
// Comme les vetos de match de PSO : chaque match (3 de poules par équipe, puis
// demis et finales) a son propre pick & ban dans state.vetos[clé], avec tirage
// au sort de l'équipe qui commence. Quand la régie charge un match sur une
// station, le veto de la station (lu par l'overlay pickban) est celui du match.
const FLIP = { ATK: 'DEF', DEF: 'ATK' };
const BRACKET = [['d1', 'Demi-finale 1'], ['d2', 'Demi-finale 2'], ['gf', 'Grande finale'], ['pf', 'Petite finale']];
const blankSteps = () => Array.from({ length: 7 }, () => ({ map: '', side: '' }));

// Tous les matchs du tournoi ; a/b = null tant que les adversaires ne sont pas connus.
function matchList() {
  const out = [];
  Stack.SCHEDULE.forEach((R, ri) => R.m.forEach((m, mi) => {
    const sc = state.poules[ri][mi];
    out.push({ key: 'p-' + ri + '-' + mi, label: 'Poules · Round ' + R.r, bo: 1, a: m[0], b: m[1], sa: Stack.num(sc.a), sb: Stack.num(sc.b) });
  }));
  const bv = Stack.bracketView(state);
  BRACKET.forEach(([k, label]) => {
    const x = bv[k];
    // Les demis ne sont figées qu'une fois les poules terminées (le classement bouge avant).
    const known = x.ta !== null && x.tb !== null && (k === 'gf' || k === 'pf' || bv.pouleDone);
    out.push({ key: k, label, bo: 3, a: known ? x.ta : null, b: known ? x.tb : null, sa: x.live ? x.wa : null, sb: x.live ? x.wb : null, winner: x.winner });
  });
  return out;
}
function matchByKey(k) { return matchList().find((m) => m.key === k) || null; }

// Crée les vetos des matchs dont les adversaires sont connus ; supprime ceux qui ne le sont plus.
function ensureVetos() {
  let changed = false;
  if (!state.vetos || typeof state.vetos !== 'object') { state.vetos = {}; changed = true; }
  matchList().forEach((m) => {
    const v = state.vetos[m.key];
    if (m.a === null) { if (v) { delete state.vetos[m.key]; changed = true; } return; }
    if (!v || v.a !== m.a || v.b !== m.b) {
      state.vetos[m.key] = { a: m.a, b: m.b, first: crypto.randomInt(2) ? 'b' : 'a', steps: blankSteps(), lock: false, show: true };
      changed = true;
    }
  });
  return changed;
}

// Station ↔ veto du match chargé dessus (lien posé par « Charger » dans la régie).
function copyVeto(from, to) { to.first = from.first; to.steps = JSON.parse(JSON.stringify(from.steps)); to.lock = !!from.lock; }
function linked(n) {
  const st = state.stations[n], v = st.link && state.vetos[st.link];
  return v && v.a === st.a && v.b === st.b ? v : null;
}
function syncFromStations() { [1, 2].forEach((n) => { const v = linked(n); if (v) copyVeto(state.stations[n].veto, v); }); }
function syncToStations(key) { [1, 2].forEach((n) => { if (state.stations[n].link === key && linked(n)) copyVeto(state.vetos[key], state.stations[n].veto); }); }
function stationOfMatch(key) { return [1, 2].find((n) => state.stations[n].link === key && linked(n)) || null; }

// Remplit le decider dès qu'il ne reste qu'une map.
function autoDecider(v) {
  const steps = v.steps;
  if (steps[6].map || !steps.slice(0, 6).every((x) => x.map)) return;
  const used = steps.map((x) => x.map).filter(Boolean);
  const rest = state.mapPool.filter((m) => used.indexOf(m) < 0);
  if (rest.length === 1) steps[6].map = rest[0];
}

// Un match vu par une équipe : me/opp, son score et son propre côté.
function matchView(i, m) {
  const me = m.a === i ? 'a' : 'b', op = me === 'a' ? 'b' : 'a';
  const opp = state.teams[m[op]];
  const out = {
    key: m.key, label: m.label, bo: m.bo,
    opp: { name: opp.name, tag: opp.tag, color: opp.color },
    score: m.sa === null || m.sb === null ? null : { me: me === 'a' ? m.sa : m.sb, opp: me === 'a' ? m.sb : m.sa },
    station: stationOfMatch(m.key),
  };
  out.done = m.bo === 1 ? out.score !== null : !!m.winner;
  const v = state.vetos[m.key];
  if (!v) return out;
  const seq = Stack.vetoSequence(m.bo, v.first);
  const who = (t) => (t === me ? 'me' : t === op ? 'opp' : '');
  const mySide = (sideA) => (!sideA ? '' : me === 'a' ? sideA : FLIP[sideA]);
  const steps = v.steps.map((x, k) => ({ act: seq[k].act, who: who(seq[k].team), map: x.map, side: mySide(x.side) }));
  const next = Stack.vetoNext({ bo: m.bo, veto: v });
  out.locked = !!v.lock;
  out.first = who(v.first === 'b' ? 'b' : 'a');
  out.steps = steps;
  out.pool = state.mapPool.map((name) => {
    const k = steps.findIndex((x) => x.map === name);
    return k < 0 ? { name } : { name, act: steps[k].act, who: steps[k].who, side: steps[k].side };
  });
  out.next = next ? { i: next.i, kind: next.kind, who: who(next.team), map: next.map || '' } : null;
  return out;
}

// Tout ce que voit une équipe : ses matchs, dans l'ordre du tournoi.
function teamView(i) {
  const team = state.teams[i];
  const list = matchList();
  return {
    team: { i, name: team.name, tag: team.tag, color: team.color },
    matches: list.filter((m) => m.a === i || m.b === i).map((m) => matchView(i, m)),
    // Phase finale pas encore connue pour cette équipe (poules en cours ou demis à jouer).
    finalsTbd: !list.some((m) => (m.key === 'gf' || m.key === 'pf') && (m.a === i || m.b === i)),
  };
}

function applyTeamAction(i, key, body) {
  const m = matchByKey(key);
  if (!m || (m.a !== i && m.b !== i)) throw new Error("Ce match n'est pas le tien");
  const v = state.vetos[key];
  if (!v) throw new Error('Pick & ban pas encore ouvert');
  if (v.lock) throw new Error('Le pick & ban est verrouillé par la régie');
  const me = m.a === i ? 'a' : 'b';
  const next = Stack.vetoNext({ bo: m.bo, veto: v });
  if (!next) throw new Error('Pick & ban terminé');
  if (next.kind === 'decider') throw new Error('La régie choisit la dernière map');
  if (next.team !== me) throw new Error("Ce n'est pas ton tour");
  const step = v.steps[next.i];
  if (next.kind === 'side') {
    const side = String(body.side || '').toUpperCase();
    if (!FLIP[side]) throw new Error('Côté invalide');
    step.side = me === 'a' ? side : FLIP[side];   // stocké pour l'équipe A
  } else {
    const map = state.mapPool.find((x) => x === body.map);
    if (!map) throw new Error('Map inconnue');
    if (v.steps.some((x) => x.map === map)) throw new Error('Map déjà prise');
    step.map = map;
    autoDecider(v);
  }
  syncToStations(key);
}

ensureVetos();

// ── Montage dans le serveur PSO Valorant ──────────────────────────────────────
// mount(app, ioServer, { base: '/stack03', port }) : toutes les pages, l'API et
// le temps réel Stack 03 vivent sous /stack03, sur le même port que PSO.
// Socket.IO : namespace dédié /stack03, pour ne pas croiser les événements PSO.
function mount(app, ioServer, opts) {
  opts = opts || {};
  const BASE = opts.base || '/stack03';
  if (opts.port) PORT = opts.port;
  io = ioServer.of(BASE);
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));

  // Seuls les dossiers utiles sont servis (jamais data/ ni les fichiers du serveur).
  ['css', 'js', 'stinger'].forEach((d) => r.use('/' + d, express.static(path.join(ROOT, d), { redirect: false })));

  // Images de maps : abyss.jpg demandé, abyss.png présent → on sert le .png.
  // Map absente du pack → on reprend le splash de PSO (public/maps/<map>-splash.png).
  const MAP_DIR = path.join(ROOT, 'assets', 'maps');
  const PSO_MAPS = path.join(ROOT, '..', 'public', 'maps');
  r.get('/assets/maps/:file', (req, res, next) => {
    const base = path.parse(req.params.file).name.toLowerCase();
    const hit = ['.jpg', '.jpeg', '.png', '.webp'].map((e) => path.join(MAP_DIR, base + e))
      .concat([path.join(PSO_MAPS, base + '-splash.png')]).find((f) => fs.existsSync(f));
    if (hit) return res.sendFile(hit);
    next();
  });
  r.use('/assets', express.static(path.join(ROOT, 'assets')));

  const PAGES = ['control', 'bracket', 'cam', 'end', 'overlay-station', 'pickban', 'start', 'stinger', 'timeout', 'timeout-caster', 'overlays', 'mire'];
  PAGES.forEach((p) => {
    r.get('/' + p, (req, res) => res.sendFile(path.join(ROOT, p + '.html')));
    r.get('/' + p + '.html', (req, res) => res.sendFile(path.join(ROOT, p + '.html')));
  });
  r.get('/', (req, res) => res.redirect(BASE + '/control'));
  r.get(['/equipe/:token', '/equipe/:token/:match'], (req, res) => res.sendFile(path.join(ROOT, 'equipe.html')));

  // Infos pour l'onglet « Liens » de la régie.
  r.get('/api/links', (req, res) => {
    if (!isRegieReq(req)) return res.status(403).json({ error: 'Clé régie requise' });
    res.json({ port: PORT, ips: getLocalIPs(), teams: links.teams, regieKey: links.regieKey });
  });
  r.post('/api/links/regen/:team', (req, res) => {
    if (!isRegieReq(req)) return res.status(403).json({ error: 'Clé régie requise' });
    const i = parseInt(req.params.team, 10);
    if (!(i >= 0 && i < 4)) return res.status(400).json({ error: 'Équipe invalide' });
    links.teams[i] = tok();
    writeJSON(LINKS_FILE, links);
    io.to('eq' + i).emit('equipe:revoked');
    res.json({ ok: true, teams: links.teams });
  });

  // Lien équipe.
  r.get('/api/equipe/:token', (req, res) => {
    const i = teamOfToken(req.params.token);
    if (i === null) return res.status(404).json({ error: 'Lien invalide ou régénéré par la régie' });
    res.json(teamView(i));
  });
  r.post('/api/equipe/:token/:match/action', (req, res) => {
    const i = teamOfToken(req.params.token);
    if (i === null) return res.status(404).json({ error: 'Lien invalide ou régénéré par la régie' });
    try {
      applyTeamAction(i, req.params.match, req.body || {});
      changed();
      res.json(teamView(i));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.use(BASE, r);

  io.on('connection', (socket) => {
    const hs = socket.handshake;
    const regie = isLocal(hs.address) || (hs.auth && hs.auth.key) === links.regieKey;
    socket.emit('state', JSON.stringify(state));

    socket.on('state:set', (raw) => {
      if (!regie) { socket.emit('readonly'); socket.emit('state', JSON.stringify(state)); return; }
      let obj;
      try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      if (!obj || typeof obj !== 'object') return;
      state = Stack.merge(Stack.defaults(), obj);
      syncFromStations();
      // Un score de poule peut révéler les demis : on crée leurs vetos et tout le monde
      // (expéditeur compris) reçoit l'état complet.
      if (ensureVetos()) return changed();
      persist();
      // L'expéditeur a déjà cet état : on ne le lui renvoie pas (sinon la saisie rapide « saute »).
      socket.broadcast.emit('state', JSON.stringify(state));
      pushTeams();
    });

    socket.on('equipe:join', (token) => {
      const i = teamOfToken(token);
      if (i === null) return socket.emit('equipe:revoked');
      socket.join('eq' + i);
      socket.emit('equipe', teamView(i));
    });
  });

  return { base: BASE, regieKey: links.regieKey, flush };
}

// ── Diffusion ─────────────────────────────────────────────────────────────────
function pushTeams() { for (let i = 0; i < 4; i++) io.to('eq' + i).emit('equipe', teamView(i)); }
// Changement venu du serveur (action d'équipe) : tout le monde reçoit l'état.
function changed() { persist(); io.emit('state', JSON.stringify(state)); pushTeams(); }

// ── Utilitaires ───────────────────────────────────────────────────────────────
function getLocalIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) if (net.family === 'IPv4' && !net.internal) out.push(net.address);
  }
  return out;
}

// Écrit l'état tout de suite (arrêt du serveur PSO).
function flush() { clearTimeout(saveTimer); writeJSON(STATE_FILE, state); }

module.exports = { mount, flush };
