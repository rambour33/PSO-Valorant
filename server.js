'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const assets = require('./lib/assets');
const veto = require('./lib/veto');
const theme = require('./lib/theme');
const scoreboard = require('./lib/scoreboard');
const teams = require('./lib/teams');
const teamPool = require('./lib/teampool');
const casters = require('./lib/casters');
const timer = require('./lib/timer');
const chat = require('./lib/chat');
const rulesets = require('./lib/rulesets');
const bracket = require('./lib/bracket');
const sponsors = require('./lib/sponsors');
const startScreen = require('./lib/start');
const timeoutCaster = require('./lib/timeoutcaster');
const cams = require('./lib/cams');
const stack03 = require('./stack03/server');

const PORT = process.env.PORT || 3003;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/control'));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));

// ── Infos serveur (IP réseau local) ───────────────────────────────────────────
app.get('/api/server-info', (req, res) => {
  res.json({ port: PORT, ips: getLocalIPs(), hostname: os.hostname() });
});

// ── Thème global ──────────────────────────────────────────────────────────────
app.get('/api/theme', (req, res) => res.json({ ...theme.get(), themes: theme.list() }));

// ── Redémarrage du serveur ────────────────────────────────────────────────────
// On sort avec le code 0 : la boucle de start.bat relance aussitôt le process.
// Lancé autrement (npm start, node server.js), le serveur ne redémarre pas seul.
app.post('/api/restart', (req, res) => {
  res.json({ ok: true });
  io.emit('serverRestart');
  console.log('  ♻️  Redémarrage demandé depuis la régie…');
  setTimeout(() => process.exit(0), 300);
});

// ── Créateur de visuels ───────────────────────────────────────────────────────
app.get('/visual-builder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'visual-builder.html')));

// Bibliothèque de fonds : un sous-dossier de public/backgrounds = un événement.
// Déposer une image dedans suffit à la faire apparaître dans le créateur.
const BG_DIR = path.join(__dirname, 'public', 'backgrounds');
const BG_EXT = /\.(svg|png|jpe?g|webp|gif)$/i;
app.get('/api/backgrounds', (req, res) => {
  try {
    const groups = fs.readdirSync(BG_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        id: d.name,
        files: fs.readdirSync(path.join(BG_DIR, d.name))
          .filter((f) => BG_EXT.test(f))
          .sort()
          .map((f) => ({ name: path.parse(f).name, url: '/backgrounds/' + d.name + '/' + f })),
      }))
      .filter((g) => g.files.length > 0);
    res.json(groups);
  } catch (e) {
    res.json([]); // dossier absent : la galerie reste simplement vide
  }
});

// ── Stinger (transition aux couleurs du thème actif) ──────────────────────────
app.get('/stinger', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stinger.html')));
app.post('/api/stinger/play', (req, res) => { io.emit('stingerPlay'); res.json({ ok: true }); });

// ── Upload d'images (photos de joueurs) ───────────────────────────────────────
// Reçoit une data URL base64, écrit un fichier dans public/uploads, renvoie l'URL.
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
app.post('/api/upload', (req, res) => {
  try {
    const m = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.+)$/i.exec((req.body || {}).dataUrl || '');
    if (!m) return res.status(400).json({ error: 'Image invalide' });
    const ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[m[1].toLowerCase()] || m[1].toLowerCase();
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Image trop lourde (8 Mo max)' });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const fname = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
    res.json({ url: '/uploads/' + fname });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/theme', (req, res) => {
  try {
    const t = theme.set((req.body || {}).id);
    io.emit('themeUpdate', t);
    res.json({ ...t, themes: theme.list() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Scoreboard ────────────────────────────────────────────────────────────────
function emitScore() { io.emit('scoreboardUpdate', scorePayload()); }

app.get('/scoreboard-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scoreboard-overlay.html')));
app.get('/sponsors-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sponsors-overlay.html')));
app.get('/api/sponsors', (req, res) => res.json(sponsors.get()));
app.get('/start-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'start-overlay.html')));
app.get('/api/start', (req, res) => res.json({ ...startScreen.get(), now: Date.now() }));
app.post('/api/start', (req, res) => { const s = startScreen.set(req.body || {}); io.emit('startUpdate', { ...s, now: Date.now() }); res.json({ ...s, now: Date.now() }); });
app.post('/api/start/reset', (req, res) => { const s = startScreen.reset(); io.emit('startUpdate', { ...s, now: Date.now() }); res.json({ ...s, now: Date.now() }); });
// Caméras des stations
app.get('/cam-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cam-overlay.html')));
app.get('/api/cams', (req, res) => res.json(cams.get()));
app.post('/api/cams', (req, res) => { const s = cams.set(req.body || {}); io.emit('camsUpdate', s); res.json(s); });
app.post('/api/cams/reset', (req, res) => { const s = cams.reset(); io.emit('camsUpdate', s); res.json(s); });

// Écran Timeout caster
const toPayload = (s) => ({ ...s, now: Date.now() });
const toSend = (res, s) => { io.emit('timeoutCasterUpdate', toPayload(s)); res.json(toPayload(s)); };
app.get('/timeout-caster-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'timeout-caster-overlay.html')));
app.get('/api/timeout-caster', (req, res) => res.json(toPayload(timeoutCaster.get())));
app.post('/api/timeout-caster', (req, res) => toSend(res, timeoutCaster.set(req.body || {})));
app.post('/api/timeout-caster/reset', (req, res) => toSend(res, timeoutCaster.reset()));
app.post('/api/timeout-caster/start', (req, res) => toSend(res, timeoutCaster.start(parseInt((req.body || {}).sec, 10) || 0)));
app.post('/api/timeout-caster/add', (req, res) => toSend(res, timeoutCaster.add(parseInt((req.body || {}).sec, 10) || 30)));
app.post('/api/timeout-caster/stop', (req, res) => toSend(res, timeoutCaster.stop()));
app.post('/api/sponsors', (req, res) => { const s = sponsors.set(req.body || {}); io.emit('sponsorsUpdate', s); res.json(s); });
app.get('/lineup-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'lineup-overlay.html')));

function scorePayload() { return { ...scoreboard.get(), formats: scoreboard.FORMATS, maxWins: scoreboard.maxWins(), mapsCount: scoreboard.mapsCount() }; }

app.get('/api/scoreboard', (req, res) => res.json(scorePayload()));

app.post('/api/scoreboard', (req, res) => {
  scoreboard.set(req.body || {});
  emitScore();
  res.json(scorePayload());
});

app.post('/api/scoreboard/score/:team/:delta', (req, res) => {
  try {
    scoreboard.score(req.params.team, req.params.delta);
    emitScore();
    res.json(scorePayload());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/scoreboard/reset', (req, res) => {
  scoreboard.resetScore();
  emitScore();
  res.json(scorePayload());
});

app.post('/api/scoreboard/swap', (req, res) => {
  scoreboard.swap();
  emitScore();
  res.json(scorePayload());
});

// ── Bibliothèque d'équipes sauvegardées ───────────────────────────────────────
function emitTeams() { io.emit('teamsUpdate', teams.list()); }

app.get('/api/teams', (req, res) => res.json(teams.list()));

app.post('/api/teams', (req, res) => {
  try {
    const before = new Set(teams.list().map((x) => x.id));
    const t = teams.saveTeam(req.body || {});
    const isNew = !before.has(t.id);
    emitTeams();
    // Nouvelle équipe sauvegardée (scoreboard) → elle entre dans le pool du bracket builder.
    if (isNew) { teamPool.add(t.id); io.emit('teamPoolUpdate', teamPool.get()); }
    res.json(t);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Premier démarrage du pool : il reprend les équipes du tournoi existant, et celles-ci sont remises
// dans la bibliothèque d'équipes si elles n'y sont plus (sinon le builder ne pourrait pas les afficher).
if (teamPool.initFrom((bracket.get().teams || []).map((t) => t.id))) {
  (bracket.get().teams || []).forEach((t) => { if (!teams.list().some((x) => x.id === t.id)) teams.saveTeam({ id: t.id, name: t.name, color: t.color }); });
}
// Et à chaque démarrage : un id du pool sans équipe dans la bibliothèque est repris du tournoi s'il y figure.
(bracket.get().teams || []).forEach((t) => { if (teamPool.get().includes(t.id) && !teams.list().some((x) => x.id === t.id)) teams.saveTeam({ id: t.id, name: t.name, color: t.color }); });
app.get('/api/team-pool', (req, res) => res.json(teamPool.get()));
app.post('/api/team-pool', (req, res) => { const ids = teamPool.set((req.body || {}).ids); io.emit('teamPoolUpdate', ids); res.json(ids); });

app.delete('/api/teams/:id', (req, res) => {
  teams.remove(req.params.id);
  teamPool.remove(req.params.id); io.emit('teamPoolUpdate', teamPool.get());
  emitTeams();
  res.json({ ok: true });
});

// ── Casters (commentateurs à l'antenne) ───────────────────────────────────────
function emitCasters() { io.emit('castersUpdate', casters.get()); }

app.get('/casters-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'casters-overlay.html')));

app.get('/api/casters', (req, res) => res.json(casters.get()));

app.post('/api/casters', (req, res) => { casters.add(req.body || {}); emitCasters(); res.json(casters.get()); });

app.patch('/api/casters/:id', (req, res) => {
  if (!casters.update(req.params.id, req.body || {})) return res.status(404).json({ error: 'Caster introuvable' });
  emitCasters();
  res.json(casters.get());
});

app.delete('/api/casters/:id', (req, res) => { casters.remove(req.params.id); emitCasters(); res.json(casters.get()); });

app.post('/api/casters/:id/live', (req, res) => {
  const b = req.body || {};
  const cur = casters.get().casters.find(c => c.id === req.params.id);
  const next = b.live !== undefined ? !!b.live : !(cur && cur.live);
  if (!casters.setLive(req.params.id, next)) return res.status(404).json({ error: 'Caster introuvable' });
  emitCasters();
  res.json(casters.get());
});

app.post('/api/casters/visible', (req, res) => { casters.setVisible(!!(req.body || {}).visible); emitCasters(); res.json(casters.get()); });

// ── Chat Twitch (config) ──────────────────────────────────────────────────────
app.get('/chat-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat-overlay.html')));
app.get('/api/chat', (req, res) => res.json(chat.get()));
app.post('/api/chat', (req, res) => { const s = chat.set(req.body || {}); io.emit('chatUpdate', s); res.json(s); });

// ── Timer (minuteur pilotable) ────────────────────────────────────────────────
function emitTimer() { io.emit('timerUpdate', timer.get()); }

app.get('/timer-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'timer-overlay.html')));

app.get('/api/timer', (req, res) => res.json(timer.get()));
app.post('/api/timer', (req, res) => { emitTimer_(timer.set(req.body || {}), res); });
app.post('/api/timer/start', (req, res) => { emitTimer_(timer.start(), res); });
app.post('/api/timer/pause', (req, res) => { emitTimer_(timer.pause(), res); });
app.post('/api/timer/toggle', (req, res) => { emitTimer_(timer.toggle(), res); });
app.post('/api/timer/reset', (req, res) => { emitTimer_(timer.reset(), res); });
app.post('/api/timer/adjust', (req, res) => { emitTimer_(timer.adjust((req.body || {}).deltaMs), res); });
app.post('/api/timer/visible', (req, res) => { emitTimer_(timer.setVisible(!!(req.body || {}).visible), res); });
function emitTimer_(snap, res) { emitTimer(); res.json(snap); }

// Place une équipe sauvegardée sur un côté du scoreboard (left → team1, right → team2).
app.post('/api/scoreboard/assign/:side', (req, res) => {
  const side = req.params.side === 'right' ? 'team2' : req.params.side === 'left' ? 'team1' : null;
  if (!side) return res.status(400).json({ error: 'Côté invalide (left/right)' });
  const b = req.body || {};
  scoreboard.set({ [side]: { name: b.name, color: b.color, players: b.players } });
  emitScore();
  res.json(scorePayload());
});

// ── Assets Valorant (agents + maps) ───────────────────────────────────────────
app.get('/api/agents', (req, res) => res.json(assets.getAgents()));
app.get('/api/maps',   (req, res) => res.json(assets.getMaps()));

let _refreshing = false;
app.post('/api/assets/refresh', async (req, res) => {
  if (_refreshing) return res.status(429).json({ error: 'Mise à jour déjà en cours' });
  _refreshing = true;
  try {
    const r = await assets.refreshAssets({ force: !!(req.body && req.body.force) });
    io.emit('assetsUpdated', { agents: r.agents, maps: r.maps });
    res.json({ ok: true, agents: r.agents.length, maps: r.maps.length, downloaded: r.downloaded, removed: r.removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    _refreshing = false;
  }
});

// ── Map Veto (pick/ban compétitif) ────────────────────────────────────────────
app.get('/veto-control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'veto-control.html')));
app.get('/veto-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'veto-overlay.html')));
app.get('/veto/team/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'veto-team.html')));

// ── Rulesets de veto (pools de maps sauvegardés) ──────────────────────────────
function emitRulesets() { io.emit('rulesetsUpdate', rulesets.list()); }
app.get('/api/rulesets', (req, res) => res.json(rulesets.list()));
app.post('/api/rulesets', (req, res) => {
  try { const r = rulesets.saveRuleset(req.body || {}); emitRulesets(); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/rulesets/:id', (req, res) => { rulesets.remove(req.params.id); emitRulesets(); res.json({ ok: true }); });

function emitVeto() { io.emit('vetoUpdate', veto.publicState()); io.emit('bracketVetoUpdate'); }

app.get('/api/veto', (req, res) => res.json(veto.publicState()));

app.get('/api/veto/whoami', (req, res) => {
  const team = veto.teamOfToken(req.query.token);
  if (!team) return res.status(404).json({ error: 'Token invalide' });
  res.json({ team, state: veto.publicState() });
});

app.post('/api/veto/setup', (req, res) => {
  try {
    const body = Object.assign({}, req.body || {});
    // Veto lié au match en cours du bracket : équipes reprises du bracket (A = équipe 1, B = équipe 2).
    if (body.bracketMatchId) {
      const lm = bracket.liveMatch();
      if (!lm || lm.id !== body.bracketMatchId) throw new Error("Ce match n'est plus le match en cours du bracket");
      body.teams = { 1: { name: lm.teamA.name, color: lm.teamA.color }, 2: { name: lm.teamB.name, color: lm.teamB.color } };
      body.link = { matchId: lm.id };
    }
    veto.setup(body, assets.getMaps());
    const t = veto.getTokens();
    emitVeto();
    res.json({ ok: true, tokens: t, state: veto.publicState() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/veto/action', (req, res) => {
  const team = veto.teamOfToken((req.body || {}).token);
  if (!team) return res.status(403).json({ error: 'Token invalide' });
  try {
    veto.applyAction(team, req.body || {});
    emitVeto();
    res.json({ ok: true, state: veto.publicState() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/veto/reset', (req, res) => { veto.reset(); emitVeto(); res.json({ ok: true }); });

// ── Bracket de tournoi (élim. simple/double, poules) ──────────────────────────
app.get('/bracket-builder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bracket-builder.html')));
app.get('/bracket-overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bracket-overlay.html')));
app.get('/bracket/team/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bracket-team.html')));

function emitBracket() { io.emit('bracketUpdate', bracket.publicState()); }

app.get('/api/bracket', (req, res) => res.json(bracket.publicState()));
app.get('/api/bracket/tokens', (req, res) => res.json(bracket.getTokens()));

app.post('/api/bracket/generate', (req, res) => {
  try {
    const s = bracket.generate(req.body || {}, teams.list());
    emitBracket();
    res.json({ ok: true, state: bracket.publicState(), tokens: bracket.getTokens() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/bracket/reset', (req, res) => { bracket.reset(); emitBracket(); res.json({ ok: true }); });

app.post('/api/bracket/format', (req, res) => {
  try { bracket.setFormat(req.body || {}); emitBracket(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/bracket/score/:matchId', (req, res) => {
  try {
    const b = req.body || {};
    bracket.adminSetScore(req.params.matchId, b.maps, b.winner);
    emitBracket();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/bracket/confirm/:matchId', (req, res) => {
  try { bracket.confirm(req.params.matchId, (req.body || {}).winner); emitBracket(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/bracket/reject/:matchId', (req, res) => {
  try { bracket.reject(req.params.matchId); emitBracket(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Match en cours du bracket (régie) et accès pick & ban pour les équipes de ce match uniquement.
app.post('/api/bracket/live', (req, res) => {
  try {
    const before = bracket.get().liveMatchId;
    bracket.setLive((req.body || {}).matchId || null);
    const m = bracket.liveMatch();
    // Nouveau match en cours → le scoreboard prend ses deux équipes (nom, couleur, joueurs), son format, scores à 0.
    if (m && m.id !== before) {
      const lib = teams.list();
      const full = (t) => { const x = lib.find((y) => y.id === t.id) || {}; return { name: t.name, color: t.color || x.color, players: x.players || [] }; };
      scoreboard.set({ team1: full(m.teamA), team2: full(m.teamB), format: scoreboard.FORMATS.includes(m.bo) ? m.bo : undefined });
      scoreboard.resetScore();
      emitScore();
    }
    emitBracket(); io.emit('bracketVetoUpdate'); res.json({ ok: true, liveMatchId: bracket.get().liveMatchId });
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/bracket/live', (req, res) => {
  const m = bracket.liveMatch();
  res.json({ match: m ? { id: m.id, bo: m.bo, teamA: m.teamA, teamB: m.teamB } : null });
});
app.get('/api/bracket/veto', (req, res) => {
  const teamId = bracket.teamOfToken(req.query.token);
  if (!teamId) return res.status(404).json({ error: 'Token invalide' });
  const m = bracket.liveMatch();
  const side = m ? (m.teamA && m.teamA.id === teamId ? 1 : m.teamB && m.teamB.id === teamId ? 2 : 0) : 0;
  if (!side) return res.json({ active: false, live: false, matchId: m ? m.id : null });
  const link = veto.getLink();
  if (!link || link.matchId !== m.id || veto.status() === 'idle') return res.json({ active: false, live: true, matchId: m.id, msg: "Le pick & ban n'a pas encore été lancé par la régie." });
  res.json({ active: true, live: true, matchId: m.id, done: veto.status() === 'done', url: '/veto/team/' + veto.getTokens()[side] });
});

app.get('/api/bracket/whoami', (req, res) => {
  const teamId = bracket.teamOfToken(req.query.token);
  if (!teamId) return res.status(404).json({ error: 'Token invalide' });
  res.json({ teamId, team: bracket.teamInfo(teamId), matches: bracket.teamMatches(teamId), state: bracket.publicState() });
});

app.post('/api/bracket/report', (req, res) => {
  try {
    const b = req.body || {};
    bracket.report(b.token, b.matchId, b.maps);
    emitBracket();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Stack 03 (overlays OBS du pack Stack) ────────────────────────────────────
// Pages, API et temps réel sous /stack03 (namespace Socket.IO /stack03).
const STACK = stack03.mount(app, io, { base: '/stack03', port: PORT });
process.on('SIGINT', () => { stack03.flush(); process.exit(130); });

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('  ⚡ Client connecté   (' + io.engine.clientsCount + ' en ligne)');
  socket.on('disconnect', () => {
    console.log('  ⚪ Client déconnecté (' + io.engine.clientsCount + ' en ligne)');
  });
});

// ── Utilitaires ───────────────────────────────────────────────────────────────
function getLocalIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('');
  console.log('  ====================================');
  console.log('   🔫 PSO Valorant');
  console.log('  ====================================');
  console.log('');
  console.log('  ── Ce PC (localhost) ──────────────────────────────────────');
  console.log('   Contrôle → http://localhost:' + PORT + '/control');
  if (ips.length > 0) {
    console.log('');
    console.log('  ── Autre PC (réseau local) ────────────────────────────────');
    ips.forEach((ip) => console.log('   Contrôle → http://' + ip + ':' + PORT + '/control'));
  }
  console.log('');
  console.log('  ── Stack 03 (overlays OBS) ────────────────────────────────');
  console.log('   Régie     → http://localhost:' + PORT + '/stack03/control');
  console.log('   Overlays  → http://localhost:' + PORT + '/stack03/overlays');
  ips.forEach((ip) => console.log('   Régie (autre PC) → http://' + ip + ':' + PORT + '/stack03/control?key=' + STACK.regieKey));
  console.log('');

  // Auto-mise à jour des assets (agents + maps) au démarrage — non bloquant
  assets.refreshAssets()
    .then((r) => {
      console.log('  🗂️  Assets à jour : ' + r.agents.length + ' agents, ' + r.maps.length + ' maps'
        + (r.downloaded ? ' (+' + r.downloaded + ' téléchargés)' : '')
        + (r.removed ? ' (-' + r.removed + ' obsolètes)' : ''));
      io.emit('assetsUpdated', { agents: r.agents, maps: r.maps });
    })
    .catch((e) => console.log('  ⚠️  Assets non mis à jour (hors-ligne ?) : ' + e.message));
});
