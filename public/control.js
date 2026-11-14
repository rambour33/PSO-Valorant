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

// ── Redémarrage du serveur ────────────────────────────────────────────────────
// Le serveur sort avec le code 0 ; c'est la boucle de start.bat qui le relance.
// On attend ensuite qu'il réponde à nouveau avant de recharger la page.
const btnRestart = document.getElementById('btn-restart');

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    try {
      const res = await fetch('/api/server-info', { cache: 'no-store' });
      if (res.ok) return true;
    } catch { /* serveur encore éteint */ }
  }
  return false;
}

btnRestart?.addEventListener('click', async () => {
  const msg = 'Redémarrer le serveur ?\n\n'
    + 'Toutes les pages et overlays ouverts se reconnecteront tout seuls.\n'
    + "Le serveur ne repart automatiquement que s'il a été lancé avec start.bat.";
  if (!confirm(msg)) return;
  btnRestart.disabled = true;
  const label = btnRestart.textContent;
  btnRestart.textContent = '♻️ Redémarrage…';
  try {
    await fetch('/api/restart', { method: 'POST' });
  } catch { /* la coupure de connexion est attendue */ }
  if (await waitForServer(Date.now() + 30000)) {
    location.reload();
  } else {
    btnRestart.disabled = false;
    btnRestart.textContent = label;
    alert("Le serveur n'est pas revenu. Relance-le avec start.bat.");
  }
});

// Un redémarrage lancé depuis un autre poste : on recharge aussi.
socket.on('serverRestart', () => {
  if (btnRestart && btnRestart.disabled) return; // déjà géré par ce poste
  waitForServer(Date.now() + 30000).then((ok) => { if (ok) location.reload(); });
});

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

// Charge l'iframe Créateur de visuels à la première ouverture de l'onglet
const visualsFrame = document.getElementById('visuals-frame');
document.querySelector('.tab-btn[data-tab="visuals"]')?.addEventListener('click', () => {
  if (visualsFrame && !visualsFrame.src) visualsFrame.src = '/visual-builder';
});

// Charge l'iframe Régie Stack 03 à la première ouverture de l'onglet
const stack03Frame = document.getElementById('stack03-frame');
document.querySelector('.tab-btn[data-tab="stack03"]')?.addEventListener('click', () => {
  if (stack03Frame && !stack03Frame.src) stack03Frame.src = '/stack03/control';
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

// Réduit une image (fichier) à `max` px et renvoie une data URL PNG.
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

// ── Fenêtre de recadrage (avant enregistrement) ────────────────────────────────
// La photo s'affiche d'abord ENTIÈRE (comme object-fit:contain, quitte à laisser des
// bandes vides dans le cadre) pour que l'utilisateur voie toute l'image de départ,
// puis zoome/glisse lui-même jusqu'à remplir le cadre exactement comme il veut.
// zoom stocké : 1 = pile la taille qui remplit le cadre (équivalent object-fit:cover),
// c'est ce que lineup-overlay.html attend (même formule x*(zoom-1)*0.9 pour le pan).
const pcm = {
  overlay: document.getElementById('pcm-overlay'), frame: document.getElementById('pcm-frame'), img: document.getElementById('pcm-img'),
  zoomSlider: document.getElementById('pcm-zoom-slider'), zoomOut: document.getElementById('pcm-zoom-out'), zoomIn: document.getElementById('pcm-zoom-in'),
  cancelBtn: document.getElementById('pcm-cancel'), confirmBtn: document.getElementById('pcm-confirm'), hint: document.getElementById('pcm-hint'),
};

function openPhotoCropper(dataUrl) {
  if (!pcm.overlay) return Promise.resolve(null);
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onerror = () => resolve(null);
    probe.onload = () => {
      pcm.img.src = dataUrl;
      pcm.overlay.classList.add('open');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const rect = pcm.frame.getBoundingClientRect();
        const frameW = rect.width, frameH = rect.height;
        const naturalW = probe.naturalWidth, naturalH = probe.naturalHeight;
        const containScale = Math.min(frameW / naturalW, frameH / naturalH); // image entière visible
        const coverScale = Math.max(frameW / naturalW, frameH / naturalH);   // remplit le cadre (= zoom stocké 1)
        const minZoom = containScale / coverScale;                          // ≤ 1 sauf ratio déjà identique

        pcm.img.style.width = naturalW + 'px';
        pcm.img.style.height = naturalH + 'px';
        pcm.img.style.marginLeft = (-naturalW / 2) + 'px';
        pcm.img.style.marginTop = (-naturalH / 2) + 'px';
        pcm.zoomSlider.min = minZoom;

        let zoom = minZoom, px = 0, py = 0; // départ : photo entière visible, centrée

        function clampPan(scale) {
          const renderedW = naturalW * scale, renderedH = naturalH * scale;
          const maxX = Math.max(0, (renderedW - frameW) / 2 * 0.9);
          const maxY = Math.max(0, (renderedH - frameH) / 2 * 0.9);
          px = Math.max(-maxX, Math.min(maxX, px));
          py = Math.max(-maxY, Math.min(maxY, py));
        }
        function covers(scale) { return scale >= coverScale * 0.999; }
        function render() {
          const scale = coverScale * zoom;
          clampPan(scale);
          pcm.img.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + scale + ')';
          pcm.zoomSlider.value = zoom;
          const ok = covers(scale);
          pcm.confirmBtn.disabled = !ok;
          pcm.hint.textContent = ok
            ? 'Glisse la photo pour la repositionner · molette ou curseur pour zoomer.'
            : 'Zoome jusqu’à remplir le cadre pour pouvoir valider.';
        }
        function setZoom(z) { zoom = Math.max(minZoom, Math.min(3, z)); render(); }
        render();

        let dragging = false, startX = 0, startY = 0, startPx = 0, startPy = 0;
        const pointOf = (e) => (e.touches ? e.touches[0] : e);
        function onDown(e) {
          dragging = true;
          const pt = pointOf(e);
          startX = pt.clientX; startY = pt.clientY; startPx = px; startPy = py;
          pcm.frame.classList.add('dragging');
          e.preventDefault();
        }
        function onMove(e) {
          if (!dragging) return;
          const pt = pointOf(e);
          px = startPx + (pt.clientX - startX);
          py = startPy + (pt.clientY - startY);
          render();
          e.preventDefault();
        }
        function onUp() { dragging = false; pcm.frame.classList.remove('dragging'); }
        function onWheel(e) { e.preventDefault(); setZoom(zoom - e.deltaY * 0.001); }
        function onSlider() { setZoom(parseFloat(pcm.zoomSlider.value) || minZoom); }
        function onZoomOut() { setZoom(Math.round((zoom - 0.1) * 100) / 100); }
        function onZoomIn() { setZoom(Math.round((zoom + 0.1) * 100) / 100); }

        pcm.frame.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        pcm.frame.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        pcm.frame.addEventListener('wheel', onWheel, { passive: false });
        pcm.zoomSlider.addEventListener('input', onSlider);
        pcm.zoomOut.addEventListener('click', onZoomOut);
        pcm.zoomIn.addEventListener('click', onZoomIn);

        function cleanup() {
          pcm.frame.removeEventListener('mousedown', onDown);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          pcm.frame.removeEventListener('touchstart', onDown);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onUp);
          pcm.frame.removeEventListener('wheel', onWheel);
          pcm.zoomSlider.removeEventListener('input', onSlider);
          pcm.zoomOut.removeEventListener('click', onZoomOut);
          pcm.zoomIn.removeEventListener('click', onZoomIn);
          pcm.cancelBtn.removeEventListener('click', onCancel);
          pcm.confirmBtn.removeEventListener('click', onConfirm);
          pcm.confirmBtn.disabled = false;
          pcm.overlay.classList.remove('open');
        }
        function onCancel() { cleanup(); resolve(null); }
        function onConfirm() {
          if (pcm.confirmBtn.disabled) return;
          // x/y = décalage en % du cadre, directement ce qui a été affiché — pas de reconversion
          // via (zoom-1) : cette formule supposait à tort une marge symétrique dans les deux sens,
          // ce qui n'est vrai que si la photo a exactement le ratio du cadre. Ici clampPan() a déjà
          // borné px/py aux vraies limites (asymétriques) de CETTE photo, donc on stocke tel quel.
          const x = px / frameW * 100, y = py / frameH * 100;
          cleanup();
          resolve({ x, y, zoom });
        }
        pcm.cancelBtn.addEventListener('click', onCancel);
        pcm.confirmBtn.addEventListener('click', onConfirm);
      }));
    };
    probe.src = dataUrl;
  });
}

function onPhotoPick(slot) {
  const f = slot.file.files && slot.file.files[0];
  slot.file.value = '';
  if (!f) return;
  resizeImage(f, 1024).then((dataUrl) => {
    return openPhotoCropper(dataUrl).then((fit) => {
      if (!fit) return; // annulé : on ne sauvegarde rien
      slot.box.classList.add('loading');
      return fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) })
        .then((r) => r.json())
        .then((d) => { if (d && d.url) { slot.photo = d.url; slot.fit = fit; updateThumb(slot); sbPush(); } })
        .finally(() => slot.box.classList.remove('loading'));
    });
  }).catch(() => {});
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
    const slot = { name, photo: '', fit: { x: 0, y: 0, zoom: 1.25 }, agentSel, img, box, file, clear };
    box.addEventListener('click', () => file.click());
    file.addEventListener('change', () => onPhotoPick(slot));
    clear.addEventListener('click', () => { slot.photo = ''; slot.fit = { x: 0, y: 0, zoom: 1.25 }; updateThumb(slot); sbPush(); });
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
const teamPlayers = (arr) => sb[arr].map((s) => ({ name: s.name.value, photo: s.photo, agent: s.agentSel.value, fit: s.fit }));

function fillPlayers(slots, players) {
  slots.forEach((s, i) => {
    const p = (players && players[i]) || {};
    s.name.value = p.name || ''; s.photo = p.photo || ''; s.fit = p.fit || { x: 0, y: 0, zoom: 1.25 }; s._agent = p.agent || ''; s.agentSel.value = s._agent;
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
  // Tous les overlays OBS au même endroit
  const rows = [
    ['Scoreboard (in game)', base + '/scoreboard-stack-overlay'],
    ['Équipes versus', base + '/versus-overlay'],
    // Team 1 / Team 2 / Score (scoreboard-overlay?part=…) : masqués, plus utilisés
    ['Prochain match', base + '/scoreboard-overlay?part=match'],
    ['Lineup équipe 1', base + '/lineup-overlay?team=1'],
    ['Lineup équipe 2', base + '/lineup-overlay?team=2'],
    ['Sponsors', base + '/sponsors-overlay'],
    ['Start', base + '/start-overlay'],
    ['Timeout caster', base + '/timeout-caster-overlay'],
    ['Caméra station 01', base + '/cam-overlay?station=1'],
    ['Caméra station 02', base + '/cam-overlay?station=2'],
    ['Casters', base + '/casters-overlay'],
    ['Chat', base + '/chat-overlay'],
    ['Timer', base + '/timer-overlay'],
    ['Map veto', base + '/veto-overlay'],
    ['Bracket', base + '/bracket-overlay'],
    ['Stinger', base + '/stinger'],
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
  const spLinks = document.getElementById('sp-links');
  if (spLinks) spLinks.innerHTML = rowHtml(['Sponsors', base + '/sponsors-overlay']);
  const stLinks = document.getElementById('st-links');
  if (stLinks) stLinks.innerHTML = rowHtml(['Start', base + '/start-overlay']);
  const cmLinks = document.getElementById('cm-links');
  if (cmLinks) cmLinks.innerHTML = rowHtml(['Station 01', base + '/cam-overlay?station=1']) + rowHtml(['Station 02', base + '/cam-overlay?station=2']);
  const tcLinks = document.getElementById('tc-links');
  if (tcLinks) tcLinks.innerHTML = rowHtml(['Timeout caster', base + '/timeout-caster-overlay']);
  const chatLinks = document.getElementById('chat-links');
  if (chatLinks) chatLinks.innerHTML = rowHtml(['Chat', base + '/chat-overlay']);
}

// ── Aperçu overlay (iframe 1280x720, toujours sur cette origine) ──────────────
const sbPreviewFrame = document.getElementById('sb-preview-frame');
const sbPreviewTabs = document.getElementById('sb-preview-tabs');
const SB_PREVIEW_URLS = {
  ingame: '/scoreboard-stack-overlay',
  match: '/scoreboard-overlay?part=match',
  lineup1: '/lineup-overlay?team=1',
  lineup2: '/lineup-overlay?team=2',
  sponsors: '/sponsors-overlay',
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

// ── Ajustement des photos (rouvre la même fenêtre de recadrage que l'upload) ──
const pfHint = document.getElementById('pf-hint');
const pfBody = document.getElementById('pf-body');
const pfPlayersEl = document.getElementById('pf-players');
const pfRecropBtn = document.getElementById('pf-recrop');
const pfNoPhoto = document.getElementById('pf-nophoto');
let pfTeam = null;
let pfPlayerIndex = 0;

function pfCurrentPlayer() {
  return pfTeam && sbState && sbState[pfTeam] && sbState[pfTeam].players[pfPlayerIndex];
}

function pfRenderState() {
  const p = pfCurrentPlayer();
  const hasPhoto = !!(p && p.photo);
  if (pfRecropBtn) pfRecropBtn.style.display = hasPhoto ? '' : 'none';
  if (pfNoPhoto) pfNoPhoto.style.display = hasPhoto ? 'none' : 'block';
}

function pfSetTeam(team) {
  pfTeam = team;
  if (pfHint) pfHint.style.display = team ? 'none' : 'block';
  if (pfBody) pfBody.style.display = team ? 'block' : 'none';
  pfRenderState();
}

if (pfPlayersEl) pfPlayersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pf-player]');
  if (!btn) return;
  pfPlayerIndex = parseInt(btn.dataset.pfPlayer, 10) || 0;
  pfPlayersEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  pfRenderState();
});

if (pfRecropBtn) pfRecropBtn.addEventListener('click', () => {
  const p = pfCurrentPlayer();
  if (!p || !p.photo) return;
  openPhotoCropper(p.photo).then((fit) => {
    if (!fit) return;
    const players = sbState[pfTeam].players.map((pl, i) => (i === pfPlayerIndex ? { ...pl, fit } : pl));
    fetch('/api/scoreboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [pfTeam]: { players } }) })
      .then((r) => r.json()).then(sbFill).catch(() => {});
  });
});

sbSetPreview('ingame');

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
  pfRenderState();
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

// ── Onglet Sponsors ───────────────────────────────────────────────────────────
const sp = {
  list: document.getElementById('sp-list'), visible: document.getElementById('sp-visible'),
  every: document.getElementById('sp-every'), everyVal: document.getElementById('sp-every-val'),
  bar: document.getElementById('sp-bar'), name: document.getElementById('sp-name'),
  file: document.getElementById('sp-file'), add: document.getElementById('sp-add'),
  preview: document.getElementById('sp-preview'),
};
let spState = null, spPrevIds = '', spUpload = '', spDeb = null;

function spSave(patch) {
  spState = Object.assign({}, spState, patch);
  return fetch('/api/sponsors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spState) })
    .then((r) => r.json()).then(renderSponsors).catch(() => {});
}
function spItems() { return (spState && spState.items || []).map((x) => Object.assign({}, x)); }
function spToggle(label, on, act, id) {
  return '<button class="ca-live' + (on ? ' on' : '') + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
}
function sponsorRow(it, i, n) {
  const thumb = it.src ? '<img src="' + esc(it.src) + '" class="' + (it.white ? 'white' : '') + '" alt="" />' : '<span>' + esc(it.name) + '</span>';
  return '<div class="ca-row sp-row" data-id="' + it.id + '">' +
    '<div class="sp-thumb">' + thumb + '</div>' +
    '<input class="ca-f" data-f="name" value="' + esc(it.name) + '" placeholder="Nom" maxlength="40" />' +
    spToggle(it.enabled ? 'Affiché' : 'Masqué', it.enabled, 'enabled', it.id) +
    spToggle('Large', it.wide, 'wide', it.id) +
    spToggle('Blanc', it.white, 'white', it.id) +
    '<label class="sp-zoom" title="Taille du logo dans le cadre">Taille <input type="range" data-zoom="' + it.id + '" min="0.3" max="3" step="0.05" value="' + (it.zoom || 1) + '" /><b>' + Math.round((it.zoom || 1) * 100) + '%</b></label>' +
    '<button class="sp-mv" data-act="up" data-id="' + it.id + '"' + (i === 0 ? ' disabled' : '') + ' title="Monter">↑</button>' +
    '<button class="sp-mv" data-act="down" data-id="' + it.id + '"' + (i === n - 1 ? ' disabled' : '') + ' title="Descendre">↓</button>' +
    '<button class="ca-del" data-act="del" data-id="' + it.id + '" title="Supprimer">🗑</button></div>';
}
function renderSponsors(s) {
  if (!s || !sp.list) return;
  spState = s;
  sp.visible.textContent = s.visible === false ? 'Afficher' : 'Masquer';
  if (document.activeElement !== sp.every) { sp.every.value = s.every; sp.everyVal.textContent = s.every + ' s'; }
  sp.bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.b === s.bar));
  // Pendant une saisie (nom, curseur de taille) sur la même liste, on ne redessine pas :
  // ça couperait le glissé du curseur ou la frappe.
  const sig = s.items.map((x) => x.id).join(',');
  const typing = sp.list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (!(typing && sig === spPrevIds)) {
    sp.list.innerHTML = s.items.length ? s.items.map((it, i) => sponsorRow(it, i, s.items.length)).join('') : '<div class="empty">Aucun sponsor. Ajoute-en un ci-dessous.</div>';
  }
  spPrevIds = sig;
}
if (sp.list) {
  sp.list.addEventListener('input', (e) => {
    const row = e.target.closest('.sp-row');
    if (!row) return;
    if (e.target.dataset.zoom) {
      // Taille : envoi en direct (léger délai) pour voir l'effet dans l'aperçu pendant le glissé.
      const z = parseFloat(e.target.value);
      e.target.nextElementSibling.textContent = Math.round(z * 100) + '%';
      clearTimeout(spDeb);
      spDeb = setTimeout(() => spSave({ items: spItems().map((x) => x.id === row.dataset.id ? Object.assign(x, { zoom: z }) : x) }), 120);
      return;
    }
    clearTimeout(spDeb);
    spDeb = setTimeout(() => spSave({ items: spItems().map((x) => x.id === row.dataset.id ? Object.assign(x, { name: e.target.value }) : x) }), 300);
  });
  sp.list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const items = spItems(), i = items.findIndex((x) => x.id === b.dataset.id);
    if (i < 0) return;
    const a = b.dataset.act;
    if (a === 'del') { if (!confirm('Supprimer « ' + items[i].name + ' » ?')) return; items.splice(i, 1); }
    else if (a === 'up' && i > 0) items.splice(i - 1, 0, items.splice(i, 1)[0]);
    else if (a === 'down' && i < items.length - 1) items.splice(i + 1, 0, items.splice(i, 1)[0]);
    else if (a === 'enabled' || a === 'wide' || a === 'white') items[i][a] = !items[i][a];
    spSave({ items });
  });
  sp.visible.addEventListener('click', () => spSave({ visible: spState && spState.visible === false }));
  sp.every.addEventListener('input', () => { sp.everyVal.textContent = sp.every.value + ' s'; });
  sp.every.addEventListener('change', () => spSave({ every: parseInt(sp.every.value, 10) }));
  sp.bar.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) spSave({ bar: b.dataset.b }); });
  sp.file.addEventListener('change', () => {
    const f = sp.file.files[0];
    if (!f) return;
    const label = sp.file.closest('label');
    const rd = new FileReader();
    rd.onload = () => {
      fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: rd.result }) })
        .then((r) => r.json()).then((d) => {
          if (d.error) { alert(d.error); return; }
          spUpload = d.url; label.classList.add('ok'); label.firstChild.textContent = '✓ ' + f.name.slice(0, 24);
          if (!sp.name.value) sp.name.value = f.name.replace(/\.[^.]+$/, '');
        }).catch(() => alert('Envoi du logo impossible'));
    };
    rd.readAsDataURL(f);
  });
  sp.add.addEventListener('click', () => {
    const name = sp.name.value.trim() || 'Sponsor';
    spSave({ items: spItems().concat([{ name, src: spUpload, wide: false, white: true, enabled: true }]) }).then(() => {
      sp.name.value = ''; spUpload = ''; sp.file.value = '';
      const label = sp.file.closest('label'); label.classList.remove('ok'); label.firstChild.textContent = '🖼️ Choisir un logo';
    });
  });
  document.querySelector('.tab-btn[data-tab="sponsors"]')?.addEventListener('click', () => {
    if (sp.preview && !sp.preview.src) sp.preview.src = '/sponsors-overlay';
  });
  fetch('/api/sponsors').then((r) => r.json()).then(renderSponsors).catch(() => {});
  socket.on('sponsorsUpdate', renderSponsors);
}

// ── Onglet Start ──────────────────────────────────────────────────────────────
const stTab = document.getElementById('tab-start');
let stState = null, stSkew = 0, stDeb = null, stPending = {};
const stGet = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
function stPatch(k, v) {   // 'halo.color' → { halo: { color } }
  const parts = k.split('.'), out = {};
  let cur = out;
  parts.forEach((p, i) => { if (i === parts.length - 1) cur[p] = v; else cur = cur[p] = {}; });
  return out;
}
function stSave(patch) {
  return fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    .then((r) => r.json()).then(renderStart).catch(() => {});
}
function stLabel(el, v) {
  if (el.dataset.pct) el.textContent = Math.round(v * 100) + '%';
  else el.textContent = v + (el.dataset.unit || (el.dataset.v === 'logoSize' ? ' px' : ''));
}
function renderStart(s) {
  if (!s || !stTab) return;
  stState = s; if (s.now) stSkew = s.now - Date.now();
  document.getElementById('st-visible').textContent = s.visible === false ? 'Afficher' : 'Masquer';
  stTab.querySelectorAll('[data-st]').forEach((el) => {
    if (el === document.activeElement) return;
    const v = stGet(s, el.dataset.st);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
  });
  stTab.querySelectorAll('.st-v').forEach((el) => stLabel(el, stGet(s, el.dataset.v)));
  document.getElementById('st-logo').innerHTML = s.logo ? '<img src="' + esc(s.logo) + '" alt="" />' : 'Sans logo';
}
function stTick() {
  const el = document.getElementById('st-cd');
  if (!el || !stState) return;
  if (!stState.at) { el.textContent = 'Pas de compte à rebours'; return; }
  const rem = stState.at - (Date.now() + stSkew);
  if (rem <= 0) { el.textContent = 'Terminé'; return; }
  const t = Math.ceil(rem / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60, p = (n) => String(n).padStart(2, '0');
  el.textContent = (h ? h + ':' + p(m) : p(m)) + ':' + p(x) + '  (début à ' + new Date(stState.at - stSkew).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ')';
}
function stFitPreview() {
  const f = document.getElementById('st-preview');
  if (f && f.parentElement.clientWidth) f.style.transform = 'scale(' + (f.parentElement.clientWidth / 1920) + ')';
}
if (stTab) {
  stTab.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.st) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.t === 'n') v = parseFloat(v);
    const lab = stTab.querySelector('.st-v[data-v="' + el.dataset.st + '"]'); if (lab) stLabel(lab, v);
    // Les modifications s'accumulent jusqu'à l'envoi (aucune n'est perdue si on enchaîne les champs).
    const p = stPatch(el.dataset.st, v);
    ['halo', 'bg'].forEach((k) => { if (p[k]) p[k] = Object.assign({}, stPending[k], p[k]); });
    Object.assign(stPending, p);
    clearTimeout(stDeb);
    stDeb = setTimeout(() => { const send = stPending; stPending = {}; stSave(send); }, el.type === 'range' ? 80 : 300);
  });
  document.getElementById('st-visible').addEventListener('click', () => stSave({ visible: stState && stState.visible === false }));
  document.getElementById('st-reset').addEventListener('click', () => {
    if (confirm('Remettre l\'écran Start comme dans le pack d\'origine ?')) fetch('/api/start/reset', { method: 'POST' }).then((r) => r.json()).then(renderStart);
  });
  stTab.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => stSave({ at: Date.now() + stSkew + parseInt(b.dataset.in, 10) * 60000 })));
  document.getElementById('st-stop').addEventListener('click', () => stSave({ at: 0 }));
  document.getElementById('st-at').addEventListener('click', () => {
    const v = document.getElementById('st-time').value; if (!v) return;
    const [h, m] = v.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1);   // heure passée → demain
    stSave({ at: d.getTime() + stSkew });
  });
  document.getElementById('st-logo-def').addEventListener('click', () => stSave({ logo: '/stack03/assets/logo-stack.svg' }));
  document.getElementById('st-logo-none').addEventListener('click', () => stSave({ logo: '' }));
  document.getElementById('st-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: rd.result }) })
      .then((r) => r.json()).then((d) => { if (d.error) return alert(d.error); stSave({ logo: d.url }); e.target.value = ''; })
      .catch(() => alert('Envoi du logo impossible'));
    rd.readAsDataURL(f);
  });
  document.querySelector('.tab-btn[data-tab="start"]')?.addEventListener('click', () => {
    const f = document.getElementById('st-preview');
    if (f && !f.src) f.src = '/start-overlay';
    setTimeout(stFitPreview, 30);
  });
  window.addEventListener('resize', stFitPreview);
  setInterval(stTick, 500);
  fetch('/api/start').then((r) => r.json()).then(renderStart).catch(() => {});
  socket.on('startUpdate', renderStart);
}

// ── Onglet Timeout caster ─────────────────────────────────────────────────────
const tcTab = document.getElementById('tab-tcaster');
let tcState = null, tcSkew = 0, tcDeb = null, tcPending = {}, tcTeams = [];
function tcMerge(a, b) {   // fusion profonde des modifications en attente
  const out = Object.assign({}, a);
  Object.keys(b).forEach((k) => { out[k] = b[k] && typeof b[k] === 'object' && a[k] && typeof a[k] === 'object' ? tcMerge(a[k], b[k]) : b[k]; });
  return out;
}
function tcPost(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then((r) => r.json()).then(renderTc).catch(() => {});
}
const tcSave = (patch) => tcPost('/api/timeout-caster', patch);
function renderTc(s) {
  if (!s || !tcTab) return;
  tcState = s; if (s.now) tcSkew = s.now - Date.now();
  document.getElementById('tc-visible').textContent = s.visible === false ? 'Afficher' : 'Masquer';
  tcTab.querySelectorAll('[data-tc]').forEach((el) => {
    if (el === document.activeElement) return;
    const v = stGet(s, el.dataset.tc);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
  });
  tcTab.querySelectorAll('.st-v').forEach((el) => stLabel(el, stGet(s, el.dataset.v)));
  document.getElementById('tc-logo').innerHTML = s.logo ? '<img src="' + esc(s.logo) + '" alt="" />' : 'Sans logo';
  tcTick();
}
function tcRenderWho() {
  const box = document.getElementById('tc-who'); if (!box) return;
  const opts = tcTeams.concat(['Pause', 'Pause technique']).filter((x, i, a) => x && a.indexOf(x) === i);
  box.innerHTML = opts.map((n) => '<button class="sb-action" data-who="' + esc(n) + '">' + esc(n) + '</button>').join('');
}
function tcTick() {
  const el = document.getElementById('tc-cd');
  if (!el || !tcState) return;
  const rem = tcState.endsAt - (Date.now() + tcSkew);
  if (tcState.endsAt && rem > 0) { const t = Math.ceil(rem / 1000); el.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  else el.textContent = tcState.endsAt ? 'Terminé' : 'À l\'arrêt';
}
function tcFitPreview() {
  const f = document.getElementById('tc-preview');
  if (f && f.parentElement.clientWidth) f.style.transform = 'scale(' + (f.parentElement.clientWidth / 1920) + ')';
}
if (tcTab) {
  tcTab.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.tc) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.t === 'n') { v = parseFloat(v); if (!isFinite(v)) return; }
    const lab = tcTab.querySelector('.st-v[data-v="' + el.dataset.tc + '"]'); if (lab) stLabel(lab, v);
    tcPending = tcMerge(tcPending, stPatch(el.dataset.tc, v));
    clearTimeout(tcDeb);
    tcDeb = setTimeout(() => { const send = tcPending; tcPending = {}; tcSave(send); }, el.type === 'range' ? 80 : 300);
  });
  tcTab.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]'); if (go) return tcPost('/api/timeout-caster/start', { sec: parseInt(go.dataset.go, 10) });
    const who = e.target.closest('[data-who]'); if (who) return tcSave({ who: who.dataset.who });
  });
  document.getElementById('tc-add').addEventListener('click', () => tcPost('/api/timeout-caster/add', { sec: 30 }));
  document.getElementById('tc-stop').addEventListener('click', () => tcPost('/api/timeout-caster/stop'));
  document.getElementById('tc-visible').addEventListener('click', () => tcSave({ visible: tcState && tcState.visible === false }));
  document.getElementById('tc-reset').addEventListener('click', () => {
    if (confirm('Remettre le Timeout caster comme dans le pack d\'origine ?')) tcPost('/api/timeout-caster/reset');
  });
  document.getElementById('tc-logo-def').addEventListener('click', () => tcSave({ logo: '/stack03/assets/logo-stack.svg' }));
  document.getElementById('tc-logo-none').addEventListener('click', () => tcSave({ logo: '' }));
  document.getElementById('tc-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: rd.result }) })
      .then((r) => r.json()).then((d) => { if (d.error) return alert(d.error); tcSave({ logo: d.url }); e.target.value = ''; })
      .catch(() => alert('Envoi du logo impossible'));
    rd.readAsDataURL(f);
  });
  document.querySelector('.tab-btn[data-tab="tcaster"]')?.addEventListener('click', () => {
    const f = document.getElementById('tc-preview');
    if (f && !f.src) f.src = '/timeout-caster-overlay?backend=1';   // aperçu régie : casters visibles
    setTimeout(tcFitPreview, 30);
  });
  window.addEventListener('resize', tcFitPreview);
  setInterval(tcTick, 300);
  const tcScore = (sb) => { if (sb && sb.team1) { tcTeams = [sb.team1.name, sb.team2.name]; tcRenderWho(); } };
  fetch('/api/scoreboard').then((r) => r.json()).then(tcScore).catch(() => {});
  socket.on('scoreboardUpdate', tcScore);
  tcRenderWho();
  fetch('/api/timeout-caster').then((r) => r.json()).then(renderTc).catch(() => {});
  socket.on('timeoutCasterUpdate', renderTc);
}

// ── Onglet Caméras ────────────────────────────────────────────────────────────
const cmTab = document.getElementById('tab-cams');
let cmState = null, cmDeb = null, cmPending = {};
function renderCams(s) {
  if (!s || !cmTab) return;
  cmState = s;
  cmTab.querySelectorAll('[data-cm]').forEach((el) => {
    if (el === document.activeElement) return;
    const v = stGet(s, el.dataset.cm);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
  });
  [1, 2].forEach((n) => {
    cmTab.querySelector('[data-cam-man="' + n + '"]').classList.toggle('off', s[n].source !== 'manual');
    cmTab.querySelector('[data-cam-vis="' + n + '"]').textContent = s[n].visible === false ? 'Afficher' : 'Masquer';
  });
}
function cmSave(patch) {
  return fetch('/api/cams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    .then((r) => r.json()).then(renderCams).catch(() => {});
}
function cmFit() {
  cmTab && cmTab.querySelectorAll('[data-cam-prev]').forEach((f) => { if (f.parentElement.clientWidth) f.style.transform = 'scale(' + (f.parentElement.clientWidth / 1920) + ')'; });
}
if (cmTab) {
  cmTab.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.cm) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.t === 'n') { v = parseFloat(v); if (!isFinite(v)) return; }
    cmPending = tcMerge(cmPending, stPatch(el.dataset.cm, v));
    if (el.dataset.cm.endsWith('.source')) cmTab.querySelector('[data-cam-man="' + el.dataset.cm[0] + '"]').classList.toggle('off', v !== 'manual');
    clearTimeout(cmDeb);
    cmDeb = setTimeout(() => { const send = cmPending; cmPending = {}; cmSave(send); }, 300);
  });
  cmTab.addEventListener('click', (e) => {
    const vis = e.target.closest('[data-cam-vis]');
    if (vis && cmState) { const n = vis.dataset.camVis; cmSave({ [n]: { visible: cmState[n].visible === false } }); }
  });
  document.getElementById('cm-reset').addEventListener('click', () => {
    if (confirm('Remettre les caméras comme dans le pack d\'origine ?')) fetch('/api/cams/reset', { method: 'POST' }).then((r) => r.json()).then(renderCams);
  });
  document.querySelector('.tab-btn[data-tab="cams"]')?.addEventListener('click', () => {
    cmTab.querySelectorAll('[data-cam-prev]').forEach((f) => { if (!f.src) f.src = '/cam-overlay?station=' + f.dataset.camPrev; });
    setTimeout(cmFit, 30);
  });
  window.addEventListener('resize', cmFit);
  fetch('/api/cams').then((r) => r.json()).then(renderCams).catch(() => {});
  socket.on('camsUpdate', renderCams);
}

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
