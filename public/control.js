// ── Connexion Socket.IO ───────────────────────────────────────────────────────
const socket = io();

const conn = document.getElementById('conn');
const connLabel = document.getElementById('conn-label');

function setConn(online) {
  conn.classList.toggle('online', online);
  conn.classList.toggle('offline', !online);
  connLabel.textContent = online ? 'Connecté' : 'Déconnecté';
}

socket.on('connect', () => setConn(true));
socket.on('disconnect', () => setConn(false));

// ── Navigation par onglets ────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-content').forEach((c) =>
    c.classList.toggle('active', c.id === 'tab-' + tabId)
  );
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Charge l'iframe Map Veto à la première ouverture de l'onglet
const vetoFrame = document.getElementById('veto-frame');
document.querySelector('.tab-btn[data-tab="veto"]')?.addEventListener('click', () => {
  if (vetoFrame && !vetoFrame.src) vetoFrame.src = '/veto-control';
});

// ── Onglet Theme ──────────────────────────────────────────────────────────────
const themeGrid = document.getElementById('theme-grid');

function renderThemes(data) {
  if (!themeGrid) return;
  themeGrid.innerHTML = '';
  (data.themes || []).forEach((t) => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (t.id === data.active ? ' active' : '');
    card.innerHTML =
      '<div class="swatch" style="background:' + t.bg + '">' +
        '<span class="accent" style="background:' + t.accent + '"></span>' +
      '</div>' +
      '<div class="name" style="color:' + t.text + '">' + t.name +
        (t.id === data.active ? '<span class="badge">ACTIF</span>' : '') +
      '</div>';
    card.addEventListener('click', () => {
      fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) })
        .then((r) => r.json())
        .then((d) => { if (!d.error) renderThemes(d); })
        .catch(() => {});
    });
    themeGrid.appendChild(card);
  });
}

fetch('/api/theme').then((r) => r.json()).then(renderThemes).catch(() => {});
socket.on('themeUpdate', () => fetch('/api/theme').then((r) => r.json()).then(renderThemes));

// ── Onglet Scoreboard ─────────────────────────────────────────────────────────
const sb = {
  t1name: document.getElementById('sb-t1-name'), t1color: document.getElementById('sb-t1-color'), t1score: document.getElementById('sb-t1-score'),
  t2name: document.getElementById('sb-t2-name'), t2color: document.getElementById('sb-t2-color'), t2score: document.getElementById('sb-t2-score'),
  fmt: document.getElementById('sb-fmt'), reset: document.getElementById('sb-reset'), visible: document.getElementById('sb-visible'),
};
let sbState = null, _sbDebounce = null;

function sbFill(s) {
  sbState = s;
  sb.t1name.value = s.team1.name; sb.t1color.value = s.team1.color; sb.t1score.textContent = s.team1.score;
  sb.t2name.value = s.team2.name; sb.t2color.value = s.team2.color; sb.t2score.textContent = s.team2.score;
  sb.fmt.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === s.format));
  sb.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
}

function sbPush() {
  clearTimeout(_sbDebounce);
  _sbDebounce = setTimeout(() => {
    fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      team1: { name: sb.t1name.value, color: sb.t1color.value },
      team2: { name: sb.t2name.value, color: sb.t2color.value },
    }) }).catch(() => {});
  }, 150);
}

[sb.t1name, sb.t1color, sb.t2name, sb.t2color].forEach((el) => el && el.addEventListener('input', sbPush));

sb.fmt.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: b.dataset.f }) })
    .then((r) => r.json()).then(sbFill).catch(() => {});
}));

document.querySelectorAll('.sb-btn').forEach((b) => b.addEventListener('click', () => {
  fetch('/api/scoreboard/score/' + b.dataset.team + '/' + b.dataset.d, { method: 'POST' })
    .then((r) => r.json()).then(sbFill).catch(() => {});
}));

sb.reset.addEventListener('click', () => fetch('/api/scoreboard/reset', { method: 'POST' }).then((r) => r.json()).then(sbFill));
sb.visible.addEventListener('click', () => {
  fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: sbState && sbState.visible === false }) })
    .then((r) => r.json()).then(sbFill);
});

fetch('/api/scoreboard').then((r) => r.json()).then(sbFill).catch(() => {});
socket.on('scoreboardUpdate', (s) => {
  // ne pas écraser les champs texte en cours d'édition : maj ciblée
  if (!sbState) return sbFill(s);
  sbState = s;
  sb.t1score.textContent = s.team1.score; sb.t2score.textContent = s.team2.score;
  sb.fmt.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === s.format));
  sb.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  if (document.activeElement !== sb.t1name && document.activeElement !== sb.t2name) {
    sb.t1name.value = s.team1.name; sb.t2name.value = s.team2.name;
    sb.t1color.value = s.team1.color; sb.t2color.value = s.team2.color;
  }
});

// ── Assets Valorant (agents + maps) ───────────────────────────────────────────
// Données partagées, disponibles pour les autres modules (scoreboard, etc.)
window.VAL = window.VAL || {};
window.VAL.agents = [];
window.VAL.maps = [];

const assetsInfo = document.getElementById('assets-info');
const btnAssets = document.getElementById('btn-assets');

function setAssetsInfo(msg, cls) {
  if (!assetsInfo) return;
  assetsInfo.textContent = msg;
  assetsInfo.className = 'assets-info' + (cls ? ' ' + cls : '');
}

function applyAssets(agents, maps) {
  window.VAL.agents = agents || [];
  window.VAL.maps = maps || [];
  setAssetsInfo(window.VAL.agents.length + ' agents · ' + window.VAL.maps.length + ' maps');
  // Notifie les autres modules (scoreboard à venir) qu'ils peuvent se redessiner
  document.dispatchEvent(new CustomEvent('assets:loaded', { detail: window.VAL }));
}

// Chargement initial des manifestes
Promise.all([
  fetch('/api/agents').then((r) => r.json()).catch(() => []),
  fetch('/api/maps').then((r) => r.json()).catch(() => []),
]).then(([agents, maps]) => applyAssets(agents, maps));

// Bouton : re-synchronisation manuelle
if (btnAssets) {
  btnAssets.addEventListener('click', () => {
    btnAssets.disabled = true;
    setAssetsInfo('Mise à jour…');
    fetch('/api/assets/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const extra = (d.downloaded ? ' (+' + d.downloaded + ')' : '') + (d.removed ? ' (-' + d.removed + ')' : '');
        setAssetsInfo('✓ ' + d.agents + ' agents · ' + d.maps + ' maps' + extra, 'ok');
        // les manifestes à jour arrivent aussi via le socket 'assetsUpdated'
      })
      .catch((e) => setAssetsInfo('✕ ' + (e.message || 'Erreur'), 'err'))
      .finally(() => { btnAssets.disabled = false; });
  });
}

// Mise à jour en direct (refresh manuel ou auto-refresh au démarrage serveur)
socket.on('assetsUpdated', (d) => applyAssets(d.agents, d.maps));
