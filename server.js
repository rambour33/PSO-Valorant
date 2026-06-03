'use strict';

const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const assets = require('./lib/assets');
const veto = require('./lib/veto');
const theme = require('./lib/theme');
const scoreboard = require('./lib/scoreboard');

const PORT = process.env.PORT || 3003;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
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

function emitVeto() { io.emit('vetoUpdate', veto.publicState()); }

app.get('/api/veto', (req, res) => res.json(veto.publicState()));

app.get('/api/veto/whoami', (req, res) => {
  const team = veto.teamOfToken(req.query.token);
  if (!team) return res.status(404).json({ error: 'Token invalide' });
  res.json({ team, state: veto.publicState() });
});

app.post('/api/veto/setup', (req, res) => {
  try {
    veto.setup(req.body || {}, assets.getMaps());
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
