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

// Charge l'iframe Builder Bracket à la première ouverture de l'onglet
const bracketFrame = document.getElementById('bracket-frame');
document.querySelector('.tab-btn[data-tab="bracket"]')?.addEventListener('click', () => {
  if (bracketFrame && !bracketFrame.src) bracketFrame.src = '/bracket-builder';
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
  t1name: document.getElementById('sb-t1-name'), t1color: document.getElementById('sb-t1-color'), t1hex: document.getElementById('sb-t1-hex'), t1score: document.getElementById('sb-t1-score'),
  t2name: document.getElementById('sb-t2-name'), t2color: document.getElementById('sb-t2-color'), t2hex: document.getElementById('sb-t2-hex'), t2score: document.getElementById('sb-t2-score'),
  fmt: document.getElementById('sb-fmt'), reset: document.getElementById('sb-reset'), visible: document.getElementById('sb-visible'),
};
let sbState = null, _sbDebounce = null;

// Réduit une image (fichier) à 512 px max et renvoie une data URL PNG.
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function updateThumb(slot) {
  if (slot.photo) { slot.img.src = slot.photo; slot.box.classList.add('has'); slot.clear.style.display = ''; }
  else { slot.img.removeAttribute('src'); slot.box.classList.remove('has'); slot.clear.style.display = 'none'; }
}

function onPhotoPick(slot) {
  const f = slot.file.files && slot.file.files[0];
  slot.file.value = '';
  if (!f) return;
  slot.box.classList.add('loading');
  resizeImage(f, 512)
    .then((dataUrl) => fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) }).then((r) => r.json()))
    .then((d) => { if (d && d.url) { slot.photo = d.url; updateThumb(slot); sbPush(); } })
    .catch(() => {})
    .finally(() => slot.box.classList.remove('loading'));
}

// Génère les 5 joueurs d'une équipe : vignette (upload) + nom + agent de secours.
function buildPlayers(containerId, n) {
  const c = document.getElementById(containerId);
  const slots = [];
  if (c) for (let i = 0; i < 5; i++) {
    const row = document.createElement('div'); row.className = 'pl-row';
    const box = document.createElement('button'); box.type = 'button'; box.className = 'pl-photo'; box.title = 'Ajouter une photo';
    const img = document.createElement('img'); img.alt = ''; box.appendChild(img);
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    const name = document.createElement('input'); name.maxLength = 30; name.placeholder = 'Joueur ' + (i + 1); name.className = 'pl-name';
    const agentSel = document.createElement('select'); agentSel.className = 'pl-agent'; agentSel.title = 'Champion de secours (si pas de photo)';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'pl-clear'; clear.textContent = '×'; clear.title = 'Retirer la photo';
    const slot = { name, photo: '', agentSel, img, box, file, clear };
    box.addEventListener('click', () => file.click());
    file.addEventListener('change', () => onPhotoPick(slot));
    clear.addEventListener('click', () => { slot.photo = ''; updateThumb(slot); sbPush(); });
    name.addEventListener('input', sbPush);
    agentSel.addEventListener('change', sbPush);
    row.append(box, name, agentSel, clear, file);
    c.appendChild(row); slots.push(slot);
    updateThumb(slot);
  }
  return slots;
}
sb.t1players = buildPlayers('sb-t1-players');
sb.t2players = buildPlayers('sb-t2-players');

// Remplit les menus « champion de secours » à partir des agents chargés.
function populateAgents() {
  const opts = '<option value="">Agent…</option>' + (window.VAL.agents || []).map((a) => '<option value="' + a.slug + '">' + a.name + '</option>').join('');
  [...sb.t1players, ...sb.t2players].forEach((s) => { const v = s.agentSel.value; s.agentSel.innerHTML = opts; s.agentSel.value = s._agent || v || ''; });
}
document.addEventListener('assets:loaded', populateAgents);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const teamPlayers = (arr) => sb[arr].map((s) => ({ name: s.name.value, photo: s.photo, agent: s.agentSel.value }));

function fillPlayers(slots, players) {
  slots.forEach((s, i) => {
    const p = (players && players[i]) || {};
    s.name.value = p.name || ''; s.photo = p.photo || ''; s._agent = p.agent || ''; s.agentSel.value = s._agent;
    updateThumb(s);
  });
}

function sbFill(s) {
  sbState = s;
  sb.t1name.value = s.team1.name; sb.t1color.value = s.team1.color; sb.t1score.textContent = s.team1.score; setHex(sb.t1hex, s.team1.color);
  sb.t2name.value = s.team2.name; sb.t2color.value = s.team2.color; sb.t2score.textContent = s.team2.score; setHex(sb.t2hex, s.team2.color);
  fillPlayers(sb.t1players, s.team1.players);
  fillPlayers(sb.t2players, s.team2.players);
  sb.fmt.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === s.format));
  sb.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
}

function sbPush() {
  clearTimeout(_sbDebounce);
  _sbDebounce = setTimeout(() => {
    fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      team1: { name: sb.t1name.value, color: sb.t1color.value, players: teamPlayers('t1players') },
      team2: { name: sb.t2name.value, color: sb.t2color.value, players: teamPlayers('t2players') },
    }) }).catch(() => {});
  }, 150);
}

[sb.t1name, sb.t1color, sb.t2name, sb.t2color].forEach((el) => el && el.addEventListener('input', sbPush));

// Synchronise sélecteur de couleur ↔ champ hexadécimal (saisie manuelle possible).
function bindHex(colorEl, hexEl) {
  if (!colorEl || !hexEl) return;
  colorEl.addEventListener('input', () => { hexEl.value = colorEl.value.toUpperCase(); });
  hexEl.addEventListener('input', () => {
    let v = hexEl.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) { colorEl.value = (v[0] === '#' ? v : '#' + v).toLowerCase(); sbPush(); }
  });
}
bindHex(sb.t1color, sb.t1hex);
bindHex(sb.t2color, sb.t2hex);
const setHex = (hexEl, color) => { if (hexEl && document.activeElement !== hexEl) hexEl.value = (color || '').toUpperCase(); };

// ── Sauvegarde d'une équipe dans la bibliothèque ──
document.querySelectorAll('[data-save]').forEach((btn) => btn.addEventListener('click', () => {
  const n = btn.dataset.save;
  const team = {
    name: sb['t' + n + 'name'].value,
    color: sb['t' + n + 'color'].value,
    players: teamPlayers('t' + n + 'players'),
  };
  fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(team) })
    .then((r) => r.json())
    .then(() => { const o = btn.textContent; btn.textContent = '✓ Sauvegardé'; setTimeout(() => { btn.textContent = o; }, 1200); })
    .catch(() => {});
}));

// ── Bibliothèque d'équipes sauvegardées ──
const savedEl = document.getElementById('sb-saved');
let savedTeams = [];

function renderSaved(teams) {
  if (!savedEl) return;
  savedTeams = teams || [];
  if (!savedTeams.length) { savedEl.innerHTML = '<div class="empty">Aucune équipe sauvegardée.</div>'; return; }
  savedEl.innerHTML = savedTeams.map((t) => {
    const named = t.players.filter((p) => p && p.name);
    const roster = named.map((p) => esc(p.name)).join(' · ') || '—';
    const avatars = t.players.filter((p) => p && p.photo).map((p) => '<img class="av" src="' + esc(p.photo) + '" alt="" />').join('');
    return '<div class="sb-team" style="--tc:' + esc(t.color) + '">' +
      '<div class="top"><span class="tname">' + esc(t.name) + '</span>' +
      '<span style="width:16px;height:16px;border-radius:4px;flex:0 0 auto;background:' + esc(t.color) + '"></span></div>' +
      (avatars ? '<div class="avatars">' + avatars + '</div>' : '') +
      '<div class="roster">' + roster + '</div>' +
      '<div class="acts">' +
        '<button data-assign="left" data-id="' + t.id + '">← Gauche</button>' +
        '<button data-assign="right" data-id="' + t.id + '">Droite →</button>' +
        '<button class="del" data-del="' + t.id + '" title="Supprimer">🗑</button>' +
      '</div></div>';
  }).join('');
}

if (savedEl) savedEl.addEventListener('click', (e) => {
  const a = e.target.closest('[data-assign]');
  if (a) {
    const t = savedTeams.find((x) => x.id === a.dataset.id);
    if (!t) return;
    fetch('/api/scoreboard/assign/' + a.dataset.assign, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: t.name, color: t.color, players: t.players }) })
      .then((r) => r.json()).then(sbFill).catch(() => {});
    return;
  }
  const d = e.target.closest('[data-del]');
  if (d) fetch('/api/teams/' + d.dataset.del, { method: 'DELETE' }).catch(() => {});
});

fetch('/api/teams').then((r) => r.json()).then(renderSaved).catch(() => {});
socket.on('teamsUpdate', renderSaved);

sb.fmt.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: b.dataset.f }) })
    .then((r) => r.json()).then(sbFill).catch(() => {});
}));

document.querySelectorAll('.sb-btn').forEach((b) => b.addEventListener('click', () => {
  fetch('/api/scoreboard/score/' + b.dataset.team + '/' + b.dataset.d, { method: 'POST' })
    .then((r) => r.json()).then(sbFill).catch(() => {});
}));

sb.reset.addEventListener('click', () => fetch('/api/scoreboard/reset', { method: 'POST' }).then((r) => r.json()).then(sbFill));
const sbSwap = document.getElementById('sb-swap');
if (sbSwap) sbSwap.addEventListener('click', () => fetch('/api/scoreboard/swap', { method: 'POST' }).then((r) => r.json()).then(sbFill));
sb.visible.addEventListener('click', () => {
  fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: sbState && sbState.visible === false }) })
    .then((r) => r.json()).then(sbFill);
});

// ── Liens overlay scoreboard (3 sources OBS) ──────────────────────────────────
const sbLinks = document.getElementById('sb-links');
const sbBaseSelect = document.getElementById('sb-base-select');
let sbBases = [];

function sbCurrentBase() {
  const i = parseInt(sbBaseSelect && sbBaseSelect.value, 10) || 0;
  return (sbBases[i] && sbBases[i].url) || location.origin;
}

function sbRenderLinks() {
  if (!sbLinks) return;
  const base = sbCurrentBase();
  const rows = [
    ['Team 1', base + '/scoreboard-overlay?part=team1'],
    ['Team 2', base + '/scoreboard-overlay?part=team2'],
    ['Score',  base + '/scoreboard-overlay?part=score'],
    ['Prochain match', base + '/scoreboard-overlay?part=match'],
    ['Lineup équipe 1', base + '/lineup-overlay?team=1'],
    ['Lineup équipe 2', base + '/lineup-overlay?team=2'],
  ];
  const rowHtml = ([label, url]) =>
    '<div class="sb-linkrow"><span class="lbl">' + label + '</span>' +
    '<input readonly value="' + url + '" onclick="this.select()" />' +
    '<button onclick="navigator.clipboard.writeText(\'' + url + '\');this.textContent=\'Copié\';setTimeout(()=>this.textContent=\'Copier\',1200)">Copier</button>' +
    '<a href="' + url + '" target="_blank"><button>Ouvrir</button></a></div>';
  sbLinks.innerHTML = rows.map(rowHtml).join('');
  const stingerLinks = document.getElementById('stinger-links');
  if (stingerLinks) stingerLinks.innerHTML = rowHtml(['Stinger', base + '/stinger']);
  const caLinks = document.getElementById('ca-links');
  if (caLinks) caLinks.innerHTML = rowHtml(['Casters', base + '/casters-overlay']);
  const tmLinks = document.getElementById('tm-links');
  if (tmLinks) tmLinks.innerHTML = rowHtml(['Timer', base + '/timer-overlay']);
  const chatLinks = document.getElementById('chat-links');
  if (chatLinks) chatLinks.innerHTML = rowHtml(['Chat', base + '/chat-overlay']);
}

// ── Aperçu overlay (iframe 1280x720, toujours sur cette origine) ──────────────
const sbPreviewFrame = document.getElementById('sb-preview-frame');
const sbPreviewTabs = document.getElementById('sb-preview-tabs');
const SB_PREVIEW_URLS = {
  team1: '/scoreboard-overlay?part=team1',
  team2: '/scoreboard-overlay?part=team2',
  score: '/scoreboard-overlay?part=score',
  match: '/scoreboard-overlay?part=match',
  lineup1: '/lineup-overlay?team=1',
  lineup2: '/lineup-overlay?team=2',
};
function sbSetPreview(key) {
  if (!sbPreviewFrame || !SB_PREVIEW_URLS[key]) return;
  sbPreviewFrame.src = location.origin + SB_PREVIEW_URLS[key];
  if (sbPreviewTabs) sbPreviewTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.preview === key));
  pfSetTeam(key === 'lineup1' ? 'team1' : key === 'lineup2' ? 'team2' : null);
}
if (sbPreviewTabs) sbPreviewTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preview]');
  if (btn) sbSetPreview(btn.dataset.preview);
});

// ── Ajustement des photos (cadrage x/y + zoom dans le cadre lineup) ───────────
const pfHint = document.getElementById('pf-hint');
const pfBody = document.getElementById('pf-body');
const pfPlayersEl = document.getElementById('pf-players');
const pfZoomVal = document.getElementById('pf-zoomval');
let pfTeam = null;
let pfPlayerIndex = 0;

function pfSetTeam(team) {
  pfTeam = team;
  if (pfHint) pfHint.style.display = team ? 'none' : 'block';
  if (pfBody) pfBody.style.display = team ? 'block' : 'none';
  pfRenderZoom();
}

function pfCurrentFit() {
  const p = pfTeam && sbState && sbState[pfTeam] && sbState[pfTeam].players[pfPlayerIndex];
  return (p && p.fit) || { x: 0, y: 0, zoom: 1.25 };
}

function pfRenderZoom() {
  if (pfZoomVal) pfZoomVal.textContent = Math.round(pfCurrentFit().zoom * 100) + '%';
}

if (pfPlayersEl) pfPlayersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pf-player]');
  if (!btn) return;
  pfPlayerIndex = parseInt(btn.dataset.pfPlayer, 10) || 0;
  pfPlayersEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  pfRenderZoom();
});

const clampPf = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function pfAdjust(action) {
  if (!pfTeam || !sbState) return;
  const fit = pfCurrentFit();
  let { x, y, zoom } = fit;
  if (action === 'left') x = clampPf(x - 5, -50, 50);
  else if (action === 'right') x = clampPf(x + 5, -50, 50);
  else if (action === 'up') y = clampPf(y - 5, -50, 50);
  else if (action === 'down') y = clampPf(y + 5, -50, 50);
  else if (action === 'zoomin') zoom = clampPf(Math.round((zoom + 0.1) * 100) / 100, 1, 3);
  else if (action === 'zoomout') zoom = clampPf(Math.round((zoom - 0.1) * 100) / 100, 1, 3);
  else if (action === 'reset') { x = 0; y = 0; zoom = 1.25; }
  const players = sbState[pfTeam].players.map((p, i) => (i === pfPlayerIndex ? { ...p, fit: { x, y, zoom } } : p));
  fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [pfTeam]: { players } }) })
    .then((r) => r.json()).then((s) => { sbFill(s); pfRenderZoom(); }).catch(() => {});
}
document.querySelectorAll('.pf-controls [data-pf-action]').forEach((b) => b.addEventListener('click', () => pfAdjust(b.dataset.pfAction)));

sbSetPreview('team1');

const stingerPlayBtn = document.getElementById('stinger-play');
if (stingerPlayBtn) stingerPlayBtn.addEventListener('click', () => {
  fetch('/api/stinger/play', { method: 'POST' }).catch(() => {});
});

fetch('/api/server-info').then((r) => r.json()).then((info) => {
  const port = info.port || location.port || 3003;
  sbBases = (info.ips || []).map((ip) => ({ label: 'Réseau · ' + ip, url: 'http://' + ip + ':' + port }));
  if (sbBases.length === 0) sbBases = [{ label: location.host, url: location.origin }];
  if (sbBaseSelect) {
    sbBaseSelect.innerHTML = sbBases.map((b, i) => '<option value="' + i + '">' + b.label + '</option>').join('');
    sbBaseSelect.value = '0';
    sbBaseSelect.addEventListener('change', sbRenderLinks);
  }
  sbRenderLinks();
}).catch(() => { sbBases = [{ label: location.origin, url: location.origin }]; sbRenderLinks(); });

fetch('/api/scoreboard').then((r) => r.json()).then(sbFill).catch(() => {});
socket.on('scoreboardUpdate', (s) => {
  // ne pas écraser les champs texte en cours d'édition : maj ciblée
  if (!sbState) return sbFill(s);
  sbState = s;
  sb.t1score.textContent = s.team1.score; sb.t2score.textContent = s.team2.score;
  sb.fmt.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === s.format));
  sb.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  // ne pas écraser un champ texte en cours d'édition
  const nameInputs = [sb.t1name, sb.t2name, sb.t1hex, sb.t2hex, ...sb.t1players.map((p) => p.name), ...sb.t2players.map((p) => p.name)];
  if (!nameInputs.includes(document.activeElement)) {
    sb.t1name.value = s.team1.name; sb.t2name.value = s.team2.name;
    sb.t1color.value = s.team1.color; sb.t2color.value = s.team2.color;
    setHex(sb.t1hex, s.team1.color); setHex(sb.t2hex, s.team2.color);
    fillPlayers(sb.t1players, s.team1.players);
    fillPlayers(sb.t2players, s.team2.players);
  }
});

// ── Onglet Casters ────────────────────────────────────────────────────────────
const caList = document.getElementById('ca-list');
const caVisible = document.getElementById('ca-visible');
const caAddBtn = document.getElementById('ca-add');
const caName = document.getElementById('ca-name');
const caRole = document.getElementById('ca-role');
const caHandle = document.getElementById('ca-handle');
let caState = null, caPrevIds = '';
const _caDeb = {};

function casterRow(c) {
  return '<div class="ca-row" data-id="' + c.id + '">' +
    '<input class="ca-f" data-f="name" value="' + esc(c.name) + '" placeholder="Nom" maxlength="40" />' +
    '<input class="ca-f" data-f="role" value="' + esc(c.role) + '" placeholder="Rôle" maxlength="40" />' +
    '<input class="ca-f" data-f="handle" value="' + esc(c.handle) + '" placeholder="@pseudo" maxlength="40" />' +
    '<button class="ca-live' + (c.live ? ' on' : '') + '" data-live="' + c.id + '">' + (c.live ? '🔴 À l’antenne' : 'Hors antenne') + '</button>' +
    '<button class="ca-del" data-del="' + c.id + '" title="Supprimer">🗑</button>' +
    '</div>';
}

function renderCasters(s) {
  if (!caList) return;
  if (caVisible) caVisible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  const ids = s.casters.map((c) => c.id).join(',');
  const editing = caList.contains(document.activeElement);
  // En cours d'édition (même liste) : ne mettre à jour que les boutons « à l'antenne ».
  if (editing && ids === caPrevIds) {
    s.casters.forEach((c) => {
      const btn = caList.querySelector('[data-live="' + c.id + '"]');
      if (btn) { btn.classList.toggle('on', !!c.live); btn.textContent = c.live ? '🔴 À l’antenne' : 'Hors antenne'; }
    });
  } else {
    caList.innerHTML = s.casters.length ? s.casters.map(casterRow).join('') : '<div class="empty">Aucun caster. Ajoute-en un ci-dessus.</div>';
  }
  caPrevIds = ids; caState = s;
}

function caSave(id) {
  clearTimeout(_caDeb[id]);
  _caDeb[id] = setTimeout(() => {
    const row = caList.querySelector('.ca-row[data-id="' + id + '"]');
    if (!row) return;
    const v = (f) => { const el = row.querySelector('.ca-f[data-f="' + f + '"]'); return el ? el.value : ''; };
    fetch('/api/casters/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v('name'), role: v('role'), handle: v('handle') }) }).catch(() => {});
  }, 220);
}

if (caList) {
  caList.addEventListener('input', (e) => {
    const row = e.target.closest('.ca-row');
    if (row && e.target.classList.contains('ca-f')) caSave(row.dataset.id);
  });
  caList.addEventListener('click', (e) => {
    const live = e.target.closest('[data-live]');
    if (live) {
      const c = caState && caState.casters.find((x) => x.id === live.dataset.live);
      fetch('/api/casters/' + live.dataset.live + '/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ live: !(c && c.live) }) }).catch(() => {});
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) fetch('/api/casters/' + del.dataset.del, { method: 'DELETE' }).catch(() => {});
  });
}

if (caAddBtn) caAddBtn.addEventListener('click', () => {
  fetch('/api/casters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: caName.value || 'CASTER', role: caRole.value, handle: caHandle.value }) })
    .then((r) => r.json()).then(() => { caName.value = ''; caRole.value = ''; caHandle.value = ''; caName.focus(); }).catch(() => {});
});

if (caVisible) caVisible.addEventListener('click', () => {
  const visibleNow = !(caState && caState.visible === false);
  fetch('/api/casters/visible', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: !visibleNow }) }).catch(() => {});
});

fetch('/api/casters').then((r) => r.json()).then(renderCasters).catch(() => {});
socket.on('castersUpdate', renderCasters);

// ── Onglet Timer ──────────────────────────────────────────────────────────────
const tm = {
  visible: document.getElementById('tm-visible'), mode: document.getElementById('tm-mode'),
  min: document.getElementById('tm-min'), sec: document.getElementById('tm-sec'), label: document.getElementById('tm-label'),
  preview: document.getElementById('tm-preview'), toggle: document.getElementById('tm-toggle'),
  reset: document.getElementById('tm-reset'), adjust: document.getElementById('tm-adjust'),
};
let tmState = null, tmRunning = false, tmMode = 'down', tmAnchorVal = 0, tmAnchorPerf = 0, _tmDeb = null;

const tmFmt = (ms) => {
  const t = Math.round(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};
const tmCurrent = () => {
  if (!tmRunning) return tmAnchorVal;
  const d = performance.now() - tmAnchorPerf;
  return tmMode === 'down' ? Math.max(0, tmAnchorVal - d) : tmAnchorVal + d;
};
function tmDrawPreview() { if (tm.preview) tm.preview.textContent = tmFmt(tmCurrent()); }

function tmPushConfig() {
  clearTimeout(_tmDeb);
  _tmDeb = setTimeout(() => {
    const durationMs = ((parseInt(tm.min.value, 10) || 0) * 60 + (parseInt(tm.sec.value, 10) || 0)) * 1000;
    fetch('/api/timer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationMs, label: tm.label.value }) }).catch(() => {});
  }, 200);
}

function tmRender(s) {
  tmState = s; tmRunning = s.running; tmMode = s.mode; tmAnchorVal = s.valueMs; tmAnchorPerf = performance.now();
  if (tm.visible) tm.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  if (tm.toggle) tm.toggle.textContent = s.running ? '⏸ Pause' : '▶ Démarrer';
  if (tm.mode) tm.mode.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.m === s.mode));
  // ne pas écraser les champs en cours d'édition
  const editing = [tm.min, tm.sec, tm.label].includes(document.activeElement);
  if (!editing) {
    tm.min.value = Math.floor(s.durationMs / 60000);
    tm.sec.value = Math.floor((s.durationMs % 60000) / 1000);
    tm.label.value = s.label || '';
  }
  tmDrawPreview();
}

if (tm.mode) tm.mode.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  fetch('/api/timer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: b.dataset.m }) }).then((r) => r.json()).then(tmRender).catch(() => {});
}));
[tm.min, tm.sec, tm.label].forEach((el) => el && el.addEventListener('input', tmPushConfig));
if (tm.toggle) tm.toggle.addEventListener('click', () => fetch('/api/timer/toggle', { method: 'POST' }).then((r) => r.json()).then(tmRender).catch(() => {}));
if (tm.reset) tm.reset.addEventListener('click', () => fetch('/api/timer/reset', { method: 'POST' }).then((r) => r.json()).then(tmRender).catch(() => {}));
if (tm.adjust) tm.adjust.addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]'); if (!b) return;
  fetch('/api/timer/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deltaMs: parseInt(b.dataset.d, 10) }) }).then((r) => r.json()).then(tmRender).catch(() => {});
});
if (tm.visible) tm.visible.addEventListener('click', () => {
  const visibleNow = !(tmState && tmState.visible === false);
  fetch('/api/timer/visible', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: !visibleNow }) }).then((r) => r.json()).then(tmRender).catch(() => {});
});

fetch('/api/timer').then((r) => r.json()).then(tmRender).catch(() => {});
socket.on('timerUpdate', tmRender);
setInterval(tmDrawPreview, 200);

// ── Onglet Chat Twitch ────────────────────────────────────────────────────────
const chatChannel = document.getElementById('chat-channel');
const chatSave = document.getElementById('chat-save');
const chatVisible = document.getElementById('chat-visible');
const chatSize = document.getElementById('chat-size');
const chatSizeVal = document.getElementById('chat-size-val');
const chatLine = document.getElementById('chat-line');
const chatLineVal = document.getElementById('chat-line-val');
let chatState = null;

function chatRender(s) {
  chatState = s;
  if (chatVisible) chatVisible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  if (chatChannel && document.activeElement !== chatChannel) chatChannel.value = s.channel || '';
  const scale = s.fontScale || 1;
  if (chatSize && document.activeElement !== chatSize) chatSize.value = scale;
  if (chatSizeVal) chatSizeVal.textContent = Math.round(scale * 100) + '%';
  const line = s.lineLength || 40;
  if (chatLine && document.activeElement !== chatLine) chatLine.value = line;
  if (chatLineVal) chatLineVal.textContent = line;
}
function chatPush(patch) {
  fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    .then((r) => r.json()).then(chatRender).catch(() => {});
}
if (chatSave) chatSave.addEventListener('click', () => chatPush({ channel: chatChannel.value }));
if (chatChannel) chatChannel.addEventListener('keydown', (e) => { if (e.key === 'Enter') chatPush({ channel: chatChannel.value }); });
if (chatVisible) chatVisible.addEventListener('click', () => chatPush({ visible: !(chatState && chatState.visible !== false) }));
if (chatSize) chatSize.addEventListener('input', () => {
  if (chatSizeVal) chatSizeVal.textContent = Math.round(parseFloat(chatSize.value) * 100) + '%';
  chatPush({ fontScale: parseFloat(chatSize.value) });
});
if (chatLine) chatLine.addEventListener('input', () => {
  if (chatLineVal) chatLineVal.textContent = chatLine.value;
  chatPush({ lineLength: parseInt(chatLine.value, 10) });
});

fetch('/api/chat').then((r) => r.json()).then(chatRender).catch(() => {});
socket.on('chatUpdate', chatRender);

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
