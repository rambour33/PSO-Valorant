'use strict';
// visual-builder.js — Créateur de visuels : fond + logo + textes déplaçables,
// aperçu WYSIWYG à l'échelle du format choisi, export PNG.
// Les polices/couleurs par défaut proviennent du thème global (--pso-*).

(function () {
  const STORE = 'pso-visual-builder-v1';

  // Raccourcis de format. La taille réelle de la toile vit dans doc.w / doc.h :
  // ces entrées ne sont que des valeurs pré-remplies, toute taille est permise.
  const FORMATS = [
    { id: 'landscape', name: 'Paysage 16:9 — 1920 × 1080', w: 1920, h: 1080 },
    { id: 'thumb',     name: 'Miniature 16:9 — 1280 × 720', w: 1280, h: 720 },
    { id: 'square',    name: 'Carré 1:1 — 1080 × 1080',     w: 1080, h: 1080 },
    { id: 'story',     name: 'Story 9:16 — 1080 × 1920',    w: 1080, h: 1920 },
    { id: 'banner',    name: 'Bannière — 1500 × 500',       w: 1500, h: 500 },
    { id: 'a4',        name: 'Affiche A4 — 2480 × 3508',    w: 2480, h: 3508 },
    { id: 'a3',        name: 'Affiche A3 — 3508 × 4961',    w: 3508, h: 4961 },
  ];
  const SIZE_MIN = 80, SIZE_MAX = 8000;

  // Modes de fusion : mêmes identifiants côté CSS (mix-blend-mode) et côté
  // canvas (globalCompositeOperation), d'où un aperçu fidèle à l'export.
  const BLENDS = [
    ['normal', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition'], ['overlay', 'Incrustation'],
    ['darken', 'Obscurcir'], ['lighten', 'Éclaircir'], ['color-dodge', 'Densité couleur −'], ['color-burn', 'Densité couleur +'],
    ['soft-light', 'Lumière tamisée'], ['hard-light', 'Lumière crue'], ['difference', 'Différence'], ['exclusion', 'Exclusion'],
    ['hue', 'Teinte'], ['saturation', 'Saturation'], ['color', 'Couleur'], ['luminosity', 'Luminosité'],
  ];
  const blendOpts = (v) => BLENDS.map(([k, l]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + l + '</option>').join('');
  const compositeOf = (b) => (!b || b === 'normal' ? 'source-over' : b);

  const TEXTURES = [
    ['none', 'Aucune'], ['lines', 'Rayures'], ['grid', 'Grille'], ['dots', 'Pois'],
    ['checker', 'Damier'], ['hatch', 'Hachures'], ['chevron', 'Chevrons'], ['image', 'Image importée'],
  ];

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── Thème ───────────────────────────────────────────────────────────────────
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  const famVar = (font) => (font === 'body' ? 'var(--pso-font-body, Inter, sans-serif)' : 'var(--pso-font-head, Oswald, sans-serif)');
  const famResolved = (font) => cssVar(font === 'body' ? '--pso-font-body' : '--pso-font-head', font === 'body' ? 'Inter, sans-serif' : 'Oswald, sans-serif');

  function palette() {
    return [
      cssVar('--pso-text', '#FFFFFF'),
      cssVar('--pso-accent', '#FF4655'),
      cssVar('--pso-gold', '#E8B330'),
      cssVar('--pso-accent-2', '#00C8C8'),
      cssVar('--pso-bg', '#0F1923'),
      '#FFFFFF',
    ];
  }

  // ── État ────────────────────────────────────────────────────────────────────
  let doc = null;
  let sel = null;
  let zoom = 40;

  function fmt() { return { w: doc.w, h: doc.h }; }

  // Le menu déroulant n'affiche « Personnalisé » que si la taille ne tombe sur
  // aucun raccourci — c'est la taille qui commande, jamais l'inverse.
  function presetIdFor(w, h) {
    const p = FORMATS.find((f) => f.w === w && f.h === h);
    return p ? p.id : 'custom';
  }

  function blankDoc(w, h) {
    return {
      w, h,
      bg: {
        // Transparent par défaut : le remplissage (uni / dégradé) est une option.
        mode: 'none', c1: cssVar('--pso-bg', '#0F1923'), c2: cssVar('--pso-surface-2', '#23323C'),
        image: null, fit: 'cover', dim: 0, blur: 0, imgOpacity: 100, imgBlend: 'normal',
        tex: defaultTex(),
      },
      els: [],
    };
  }

  function defaultTex() {
    return { type: 'none', src: null, ratio: 1, size: 120, gap: 0, angle: 0, thick: 20, color: cssVar('--pso-accent', '#FF4655'), opacity: 25, blend: 'normal' };
  }

  // Complète un document enregistré par une version antérieure de l'outil.
  function migrate(d) {
    if (!d.w || !d.h) { // documents d'avant la taille libre : on reprend le raccourci
      const p = FORMATS.find((f) => f.id === d.format) || FORMATS[0];
      d.w = p.w; d.h = p.h;
    }
    delete d.format;
    d.bg.tex = Object.assign(defaultTex(), d.bg.tex || {});
    if (d.bg.imgOpacity === undefined) d.bg.imgOpacity = 100;
    if (!d.bg.imgBlend) d.bg.imgBlend = 'normal';
    d.els.forEach((el) => { if (!el.blend) el.blend = 'normal'; });
    return d;
  }

  let uid = Date.now();
  const nextId = () => 'e' + (++uid).toString(36);

  function newText(preset) {
    const f = fmt();
    const isTitle = preset === 'title';
    const isSub = preset === 'sub';
    const size = Math.round(f.h * (isTitle ? 0.11 : isSub ? 0.05 : 0.035));
    const w = Math.round(f.w * 0.8);
    return {
      id: nextId(), kind: 'text',
      text: isTitle ? 'TITRE' : isSub ? 'Sous-titre' : 'Texte',
      font: isTitle || isSub ? 'head' : 'body',
      size, weight: isTitle ? 800 : isSub ? 600 : 500,
      color: isTitle ? cssVar('--pso-text', '#FFF') : isSub ? cssVar('--pso-accent', '#FF4655') : cssVar('--pso-text', '#FFF'),
      ls: isTitle ? Math.round(size * 0.03) : 0,
      upper: isTitle, align: 'center', lh: isTitle ? 1.05 : 1.25,
      w, x: Math.round((f.w - w) / 2), y: Math.round(f.h * (isTitle ? 0.36 : isSub ? 0.52 : 0.62)),
      opacity: 100, shadow: true, blend: 'normal',
    };
  }

  function newBar() {
    const f = fmt();
    const w = Math.round(f.w * 0.22), h = Math.max(4, Math.round(f.h * 0.011));
    return { id: nextId(), kind: 'bar', x: Math.round((f.w - w) / 2), y: Math.round(f.h * 0.49), w, h, color: cssVar('--pso-accent', '#FF4655'), opacity: 100, blend: 'normal' };
  }

  // ── Recadrage ───────────────────────────────────────────────────────────────
  // el.crop = { x, y, w, h } en fractions (0→1) de l'image source ; absent =
  // image entière. Non destructif : la source n'est jamais retouchée.
  const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
  const cropOf = (el) => el.crop || FULL_CROP;
  // Rapport hauteur/largeur réellement affiché, une fois le recadrage appliqué.
  function dispRatio(el) {
    const c = cropOf(el);
    return el.ratio * (c.h / c.w);
  }
  const elHeight = (el) => el.w * dispRatio(el);

  // Largeur qui fait couvrir toute la toile à une image de ce rapport.
  const coverWidth = (ratio) => Math.ceil(Math.max(doc.w, doc.h / ratio));

  function newImage(src, ratio, opts) {
    const f = fmt();
    const o = opts || {};
    const w = o.cover ? coverWidth(ratio) : Math.round(f.w * 0.22);
    return {
      id: nextId(), kind: 'logo', src, ratio, name: o.name || null,
      x: Math.round((f.w - w) / 2),
      y: o.cover ? Math.round((f.h - w * ratio) / 2) : Math.round(f.h * 0.12),
      w, opacity: 100, shadow: false, blend: 'normal',
    };
  }

  // ── Persistance ─────────────────────────────────────────────────────────────
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(doc)); }
    catch {
      if (!saveWarned) {
        saveWarned = true;
        alert("Sauvegarde automatique impossible (stockage du navigateur plein). Pense à exporter ton PNG avant de fermer l'onglet.");
      }
    }
  }
  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (j && j.bg && Array.isArray(j.els)) return j;
    } catch { /* données illisibles */ }
    return null;
  }

  // ── Cache d'images ──────────────────────────────────────────────────────────
  const imgCache = new Map();
  const imgReady = new Map(); // src → HTMLImageElement déjà chargée (accès synchrone)
  function loadImg(src) {
    if (!imgCache.has(src)) {
      imgCache.set(src, new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => { imgReady.set(src, i); res(i); };
        i.onerror = rej;
        i.src = src;
      }));
    }
    return imgCache.get(src);
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // Envoie l'image au serveur et renvoie son URL (/uploads/...). En cas d'échec,
  // on retombe sur la data URL : le visuel reste utilisable, seulement plus lourd.
  async function storeImage(file) {
    return storeDataUrl(await readFile(file));
  }

  async function storeDataUrl(dataUrl) {
    try {
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'upload refusé');
      return j.url;
    } catch (e) {
      console.warn('Upload impossible, image gardée en mémoire :', e.message);
      return dataUrl;
    }
  }

  // ── Détourage du fond d'un logo ─────────────────────────────────────────────
  // Deux méthodes : « toute l'image » efface tous les pixels proches de la
  // couleur cible ; « depuis les bords » ne propage l'effacement qu'à partir du
  // contour, ce qui préserve les aplats de même couleur à l'intérieur du logo.
  function cutout(src, opts) {
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [tr, tg, tb] = opts.rgb;
    const tol = opts.tol, soft = Math.max(0.001, opts.soft);

    // Distance à la couleur cible, en unités RGB.
    const dist = (i) => Math.hypot(d[i] - tr, d[i + 1] - tg, d[i + 2] - tb);

    // Alpha final : opaque au-delà de tol+soft, transparent en deçà de tol,
    // dégradé entre les deux — c'est ce qui absorbe l'anticrénelage du contour.
    function fade(i) {
      const v = dist(i);
      if (v <= tol) d[i + 3] = 0;
      else if (v < tol + soft) d[i + 3] = Math.round(d[i + 3] * ((v - tol) / soft));
    }

    if (opts.mode === 'all') {
      for (let i = 0; i < d.length; i += 4) fade(i);
    } else {
      const n = w * h;
      const seen = new Uint8Array(n);
      const queue = new Int32Array(n);
      let head = 0, tail = 0;
      const push = (px) => {
        if (px < 0 || px >= n || seen[px]) return;
        if (dist(px * 4) >= tol + soft) return; // pixel du logo : on s'arrête là
        seen[px] = 1;
        queue[tail++] = px;
      };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (head < tail) {
        const px = queue[head++];
        const x = px % w, y = (px / w) | 0;
        if (x > 0) push(px - 1);
        if (x < w - 1) push(px + 1);
        if (y > 0) push(px - w);
        if (y < h - 1) push(px + w);
      }
      for (let px = 0; px < n; px++) if (seen[px]) fade(px * 4);
    }

    ctx.putImageData(img, 0, 0);
    return out;
  }

  // Couleur de fond présumée : moyenne des quatre coins.
  function guessBg(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const pts = [[0, 0], [src.width - 1, 0], [0, src.height - 1], [src.width - 1, src.height - 1]];
    let r = 0, g = 0, b = 0;
    pts.forEach(([x, y]) => { const p = ctx.getImageData(x, y, 1, 1).data; r += p[0]; g += p[1]; b += p[2]; });
    return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
  }

  const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const toRgb = (hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];

  const cut = { elId: null, img: null, small: null };

  async function openCutout(el) {
    const img = await loadImg(el.srcOrig || el.src);
    cut.elId = el.id;
    cut.img = img;

    // Aperçu calculé sur une copie réduite : le détourage réel se fait ensuite
    // à la résolution d'origine, au moment d'appliquer.
    const max = 420;
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const sm = document.createElement('canvas');
    sm.width = Math.max(1, Math.round(img.naturalWidth * s));
    sm.height = Math.max(1, Math.round(img.naturalHeight * s));
    sm.getContext('2d').drawImage(img, 0, 0, sm.width, sm.height);
    cut.small = sm;

    $('cut-color').value = toHex(guessBg(sm));
    $('cut-tol').value = 30; $('cut-tol-val').textContent = '30 %';
    $('cut-soft').value = 12; $('cut-soft-val').textContent = '12 %';
    $('cut-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'edges'));
    $('cut-overlay').hidden = false;
    drawCutPreview();
  }

  function cutOpts() {
    return {
      rgb: toRgb($('cut-color').value),
      tol: (+$('cut-tol').value / 100) * 200,
      soft: (+$('cut-soft').value / 100) * 200,
      mode: $('cut-mode').querySelector('button.on').dataset.v,
    };
  }

  function drawCutPreview() {
    if (!cut.small) return;
    const res = cutout(cut.small, cutOpts());
    const cv = $('cut-canvas');
    cv.width = res.width; cv.height = res.height;
    cv.getContext('2d').drawImage(res, 0, 0);
  }

  $('cut-canvas').addEventListener('click', (ev) => {
    const cv = $('cut-canvas');
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * cv.width);
    const y = Math.floor(((ev.clientY - r.top) / r.height) * cv.height);
    // On échantillonne l'image d'origine, pas l'aperçu déjà détouré.
    const c = document.createElement('canvas');
    c.width = cut.small.width; c.height = cut.small.height;
    c.getContext('2d').drawImage(cut.small, 0, 0);
    const p = c.getContext('2d').getImageData(clamp(x, 0, c.width - 1), clamp(y, 0, c.height - 1), 1, 1).data;
    $('cut-color').value = toHex([p[0], p[1], p[2]]);
    drawCutPreview();
  });

  ['cut-tol', 'cut-soft'].forEach((id) => $(id).addEventListener('input', () => {
    $(id + '-val').textContent = $(id).value + ' %';
    drawCutPreview();
  }));
  $('cut-color').addEventListener('input', drawCutPreview);
  $('cut-mode').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    $('cut-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    drawCutPreview();
  });
  $('cut-cancel').addEventListener('click', () => { $('cut-overlay').hidden = true; });

  $('cut-apply').addEventListener('click', async () => {
    const el = doc.els.find((e) => e.id === cut.elId);
    if (!el) { $('cut-overlay').hidden = true; return; }
    const btn = $('cut-apply');
    btn.disabled = true; btn.textContent = 'Traitement…';
    try {
      const full = document.createElement('canvas');
      full.width = cut.img.naturalWidth; full.height = cut.img.naturalHeight;
      full.getContext('2d').drawImage(cut.img, 0, 0);
      const res = cutout(full, cutOpts());
      const url = await storeDataUrl(res.toDataURL('image/png'));
      if (!el.srcOrig) el.srcOrig = el.src; // on garde de quoi revenir en arrière
      el.src = url;
      await loadImg(url);
      $('cut-overlay').hidden = true;
      render();
    } catch (e) {
      alert('Détourage impossible : ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Appliquer';
    }
  });

  // ── Fenêtre de recadrage ────────────────────────────────────────────────────
  // Le cadre est manipulé en fractions de l'image (0→1), jamais en pixels : il
  // reste donc valide quelle que soit la taille d'affichage ou de la source.
  const CROP_MIN = 0.02;
  const cropUI = { elId: null, img: null, box: null, lock: 'free', sw: 0, sh: 0 };

  // Rapport largeur/hauteur imposé, en proportions d'affichage (null = libre).
  function lockAspect() {
    if (cropUI.lock === 'free') return null;
    if (cropUI.lock === 'canvas') return doc.w / doc.h;
    return parseFloat(cropUI.lock);
  }

  // Passage entre proportions affichées et proportions normalisées : une image
  // de 2:1 fait qu'un cadre normalisé carré est en réalité deux fois plus large.
  const imgAspect = () => cropUI.img.naturalWidth / cropUI.img.naturalHeight;

  async function openCrop(el) {
    const img = await loadImg(el.src);
    cropUI.elId = el.id;
    cropUI.img = img;
    cropUI.box = Object.assign({}, cropOf(el));
    cropUI.lock = 'free';

    const maxW = 500, maxH = 300;
    const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    cropUI.sw = Math.max(40, Math.round(img.naturalWidth * s));
    cropUI.sh = Math.max(40, Math.round(img.naturalHeight * s));

    const stage = $('crop-stage');
    stage.style.width = cropUI.sw + 'px';
    stage.style.height = cropUI.sh + 'px';
    $('crop-img').src = el.src;
    $('crop-ratio').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'free'));
    $('crop-overlay').hidden = false;
    renderCropBox();
  }

  function renderCropBox() {
    const b = cropUI.box, box = $('crop-box');
    box.style.left = (b.x * cropUI.sw) + 'px';
    box.style.top = (b.y * cropUI.sh) + 'px';
    box.style.width = (b.w * cropUI.sw) + 'px';
    box.style.height = (b.h * cropUI.sh) + 'px';
    const px = Math.round(b.w * cropUI.img.naturalWidth);
    const py = Math.round(b.h * cropUI.img.naturalHeight);
    $('crop-info').textContent = 'Zone retenue : ' + px + ' × ' + py + ' px'
      + '  ·  source ' + cropUI.img.naturalWidth + ' × ' + cropUI.img.naturalHeight;
  }

  // Réajuste le cadre au rapport imposé, autour de son centre, sans déborder.
  function conformBox() {
    const A = lockAspect();
    if (!A) return;
    const b = cropUI.box;
    const k = imgAspect();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // h = w·k/A ; on part de la plus grande largeur qui tienne dans la source.
    let w = Math.min(1, (A / k) * 1);
    let h = (w * k) / A;
    if (h > 1) { h = 1; w = (h * A) / k; }
    cropUI.box = {
      w, h,
      x: clamp(cx - w / 2, 0, 1 - w),
      y: clamp(cy - h / 2, 0, 1 - h),
    };
  }

  $('crop-ratio').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    cropUI.lock = b.dataset.v;
    $('crop-ratio').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    conformBox();
    renderCropBox();
  });

  $('crop-reset').addEventListener('click', () => {
    cropUI.box = { x: 0, y: 0, w: 1, h: 1 };
    cropUI.lock = 'free';
    $('crop-ratio').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'free'));
    renderCropBox();
  });

  $('crop-stage').addEventListener('pointerdown', (ev) => {
    const handle = ev.target.closest('.crop-h');
    const inBox = ev.target.closest('.crop-box');
    if (!handle && !inBox) return;
    ev.preventDefault();

    const corner = handle ? handle.dataset.c : null;
    const start = Object.assign({}, cropUI.box);
    const px0 = ev.clientX, py0 = ev.clientY;
    const stage = $('crop-stage');
    // La capture peut échouer si le pointeur est déjà relâché : sans elle le
    // glissement fonctionne quand même tant que le curseur reste sur la scène.
    try { stage.setPointerCapture(ev.pointerId); } catch { /* sans capture */ }

    function onMove(e) {
      const dx = (e.clientX - px0) / cropUI.sw;
      const dy = (e.clientY - py0) / cropUI.sh;

      if (!corner) { // déplacement du cadre entier
        cropUI.box = {
          w: start.w, h: start.h,
          x: clamp(start.x + dx, 0, 1 - start.w),
          y: clamp(start.y + dy, 0, 1 - start.h),
        };
        return renderCropBox();
      }

      // Le coin opposé reste fixe et sert d'ancre.
      const west = corner === 'nw' || corner === 'sw';
      const north = corner === 'nw' || corner === 'ne';
      const ax = west ? start.x + start.w : start.x;
      const ay = north ? start.y + start.h : start.y;
      let mx = clamp((west ? start.x : start.x + start.w) + dx, 0, 1);
      let my = clamp((north ? start.y : start.y + start.h) + dy, 0, 1);

      let w = Math.abs(mx - ax), h = Math.abs(my - ay);
      const A = lockAspect();
      if (A) {
        // On garde la plus grande des deux dimensions, l'autre en découle.
        const k = imgAspect();
        if (w / (A / k) > h) h = (w * k) / A; else w = (h * A) / k;
        // Si la dimension déduite sort du cadre, on redescend l'autre.
        if (west ? w > ax : w > 1 - ax) { w = west ? ax : 1 - ax; h = (w * k) / A; }
        if (north ? h > ay : h > 1 - ay) { h = north ? ay : 1 - ay; w = (h * A) / k; }
      }
      w = Math.max(CROP_MIN, w);
      h = Math.max(CROP_MIN, h);

      cropUI.box = {
        w, h,
        x: clamp(west ? ax - w : ax, 0, 1 - w),
        y: clamp(north ? ay - h : ay, 0, 1 - h),
      };
      renderCropBox();
    }

    function onUp() {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
    }
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
  });

  $('crop-cancel').addEventListener('click', () => { $('crop-overlay').hidden = true; });

  $('crop-apply').addEventListener('click', () => {
    const el = doc.els.find((e) => e.id === cropUI.elId);
    if (el) {
      const b = cropUI.box;
      const full = b.x <= 0.001 && b.y <= 0.001 && b.w >= 0.999 && b.h >= 0.999;
      if (full) delete el.crop;
      else el.crop = { x: b.x, y: b.y, w: b.w, h: b.h };
    }
    $('crop-overlay').hidden = true;
    render();
  });

  // ── Rendu de la scène ───────────────────────────────────────────────────────
  const board = $('board');
  const holder = $('holder');
  const bgLayer = document.createElement('div');
  const elsLayer = document.createElement('div');
  bgLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  elsLayer.style.cssText = 'position:absolute;inset:0';
  board.insertBefore(bgLayer, board.firstChild);
  board.insertBefore(elsLayer, $('guide-v'));

  function scale() { return zoom / 100; }

  function applyZoom() {
    const f = fmt();
    const s = scale();
    board.style.width = f.w + 'px';
    board.style.height = f.h + 'px';
    board.style.transform = 'scale(' + s + ')';
    holder.style.width = Math.round(f.w * s) + 'px';
    holder.style.height = Math.round(f.h * s) + 'px';
    $('zoom').value = zoom;
    $('zoom-val').textContent = zoom + ' %';
    // Au-delà d'environ 40 Mpx, le canvas d'export échoue sur beaucoup de
    // navigateurs : on prévient avant que le visuel ne soit composé.
    const mpx = (f.w * f.h) / 1e6;
    $('dims').textContent = f.w + ' × ' + f.h + ' px'
      + (mpx > 40 ? '  ⚠ ' + mpx.toFixed(0) + ' Mpx — l\'export risque d\'échouer' : '');
    $('dims').style.color = mpx > 40 ? 'var(--gold)' : '';
  }

  function fitZoom() {
    const f = fmt();
    const wrap = $('stage-wrap');
    const availW = wrap.clientWidth - 56, availH = wrap.clientHeight - 56;
    if (availW <= 0 || availH <= 0) return 40;
    return clamp(Math.floor(Math.min(availW / f.w, availH / f.h) * 100), 10, 100);
  }

  function overscan(blur) {
    const f = fmt();
    return blur > 0 ? 1 + (blur * 3) / Math.min(f.w, f.h) : 1;
  }

  // Fabrique la tuile de la texture. Le meme canvas sert a l'apercu (converti en
  // data URL pour background-image) et a l'export (via createPattern) : motif identique.
  const tileCache = new Map();
  function texTile(t) {
    if (!t || t.type === 'none') return null;
    if (t.type === 'image' && (!t.src || !imgReady.has(t.src))) return null;

    const key = [t.type, t.size, t.gap, t.thick, t.color, t.src].join('|');
    if (tileCache.has(key)) return tileCache.get(key);

    // S = taille du motif, G = espacement ajoute autour, T = pas de repetition.
    // Les epaisseurs restent calees sur S : ecarter le motif ne l'epaissit pas.
    const S = Math.max(4, Math.round(t.size));
    const G = Math.max(0, Math.round(t.gap || 0));
    const T = S + G;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    if (t.type === 'image') {
      const img = imgReady.get(t.src);
      const iw = S, ih = Math.max(1, Math.round(S * (img.naturalHeight / img.naturalWidth)));
      c.width = T;
      c.height = ih + G;
      ctx.drawImage(img, 0, 0, iw, ih);
    } else {
      c.width = c.height = T;
      const th = t.thick / 100;
      ctx.fillStyle = t.color;
      ctx.strokeStyle = t.color;
      // Les motifs qui touchent un bord sont redessines decales de +/-T pour
      // rester continus d'une tuile a l'autre.
      if (t.type === 'lines') {
        ctx.fillRect(0, 0, T, Math.max(1, S * th));
      } else if (t.type === 'grid') {
        const w = Math.max(1, S * th * 0.4);
        ctx.fillRect(0, 0, T, w);
        ctx.fillRect(0, 0, w, T);
      } else if (t.type === 'dots') {
        ctx.beginPath();
        ctx.arc(T / 2, T / 2, Math.max(0.5, S * th * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (t.type === 'checker') {
        ctx.fillRect(0, 0, S / 2, S / 2);
        ctx.fillRect(T / 2, T / 2, S / 2, S / 2);
      } else if (t.type === 'hatch') {
        ctx.lineWidth = Math.max(1, S * th * 0.4);
        ctx.lineCap = 'square';
        for (const o of [-T, 0, T]) {
          ctx.beginPath(); ctx.moveTo(o, T); ctx.lineTo(o + T, 0); ctx.stroke();
        }
      } else if (t.type === 'chevron') {
        ctx.lineWidth = Math.max(1, S * th * 0.4);
        for (const o of [-T, 0, T]) {
          ctx.beginPath();
          ctx.moveTo(-1, o + T * 0.75); ctx.lineTo(T / 2, o + T * 0.25); ctx.lineTo(T + 1, o + T * 0.75);
          ctx.stroke();
        }
      }
    }

    const out = { canvas: c, w: c.width, h: c.height, url: c.toDataURL() };
    // Chaque cran de curseur produit une tuile : on vide le cache de temps en
    // temps pour ne pas accumuler des centaines de canvas et de data URL.
    if (tileCache.size > 80) tileCache.clear();
    tileCache.set(key, out);
    return out;
  }

  // Cote apercu comme cote export, la texture est peinte dans un carre de la
  // taille de la diagonale, centre puis pivote : aucun coin ne se decouvre.
  const texSpan = (f) => Math.ceil(Math.hypot(f.w, f.h));

  function renderBg() {
    const b = doc.bg;
    bgLayer.innerHTML = '';
    bgLayer.style.background = b.mode === 'gradient'
      ? 'linear-gradient(135deg, ' + b.c1 + ' 0%, ' + b.c2 + ' 100%)'
      : b.mode === 'solid' ? b.c1 : 'transparent';
    if (b.image) {
      const img = document.createElement('img');
      img.src = b.image;
      img.alt = '';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'
        + 'object-fit:' + (b.fit === 'stretch' ? 'fill' : b.fit) + ';'
        + 'filter:blur(' + b.blur + 'px);transform:scale(' + overscan(b.blur) + ');'
        + 'opacity:' + (b.imgOpacity / 100) + ';mix-blend-mode:' + b.imgBlend;
      bgLayer.appendChild(img);
    }

    const t = b.tex;
    if (t && t.type !== 'none') {
      if (t.type === 'image' && t.src && !imgReady.has(t.src)) {
        loadImg(t.src).then(renderBg).catch(() => {});
      }
      const tile = texTile(t);
      if (tile) {
        const f = fmt();
        const D = texSpan(f);
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:50%;top:50%;width:' + D + 'px;height:' + D + 'px;'
          + 'transform:translate(-50%,-50%) rotate(' + t.angle + 'deg);'
          + 'background-image:url(' + tile.url + ');background-repeat:repeat;'
          + 'background-size:' + tile.w + 'px ' + tile.h + 'px;'
          + 'opacity:' + (t.opacity / 100) + ';mix-blend-mode:' + t.blend;
        bgLayer.appendChild(d);
      }
    }

    if (b.image && b.dim > 0) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,' + (b.dim / 100) + ')';
      bgLayer.appendChild(d);
    }
  }

  function shadowCss(el) {
    if (!el.shadow) return 'none';
    const s = el.kind === 'text' ? el.size : el.w * 0.2;
    return '0 ' + Math.round(s * 0.06) + 'px ' + Math.round(s * 0.3) + 'px rgba(0,0,0,.6)';
  }

  function renderEls() {
    elsLayer.innerHTML = '';
    doc.els.forEach((el) => {
      const n = document.createElement('div');
      n.className = 'el' + (el.id === sel ? ' sel' : '') + (el.locked ? ' locked' : '');
      n.dataset.id = el.id;
      n.style.left = el.x + 'px';
      n.style.top = el.y + 'px';
      n.style.width = el.w + 'px';
      const skin = 'opacity:' + (el.opacity / 100) + ';mix-blend-mode:' + (el.blend || 'normal') + ';';

      if (el.kind === 'text') {
        const t = document.createElement('div');
        t.className = 'txt';
        t.textContent = el.text;
        t.style.cssText = skin + 'font-family:' + famVar(el.font) + ';font-size:' + el.size + 'px;font-weight:' + el.weight
          + ';color:' + el.color + ';letter-spacing:' + el.ls + 'px;line-height:' + el.lh
          + ';text-align:' + el.align + ';text-transform:' + (el.upper ? 'uppercase' : 'none')
          + ';text-shadow:' + shadowCss(el);
        n.appendChild(t);
      } else if (el.kind === 'logo') {
        const c = cropOf(el);
        // Fenêtre de la taille du recadrage ; l'image est agrandie au-delà et
        // décalée pour que la zone retenue coïncide avec la fenêtre.
        const win = document.createElement('div');
        win.style.cssText = skin + 'position:relative;overflow:hidden;width:100%;height:'
          + elHeight(el) + 'px;'
          + (el.shadow ? 'filter:drop-shadow(' + shadowCss(el) + ');' : '');
        const fullW = el.w / c.w;
        const i = document.createElement('img');
        i.src = el.src;
        i.alt = '';
        i.style.cssText = 'position:absolute;width:' + fullW + 'px;height:auto;max-width:none;'
          + 'left:' + (-c.x * fullW) + 'px;top:' + (-c.y * fullW * el.ratio) + 'px';
        win.appendChild(i);
        n.appendChild(win);
      } else {
        n.style.height = el.h + 'px';
        const b = document.createElement('div');
        b.style.cssText = skin + 'width:100%;height:100%;background:' + el.color;
        n.appendChild(b);
      }

      const hd = document.createElement('div');
      hd.className = 'handle';
      n.appendChild(hd);
      elsLayer.appendChild(n);
    });
  }

  function render() {
    applyZoom();
    renderBg();
    renderEls();
    renderLayers();
    renderProps();
    save();
  }

  // ── Déplacement / redimensionnement ─────────────────────────────────────────
  const gv = $('guide-v'), gh = $('guide-h');
  function hideGuides() { gv.style.display = 'none'; gh.style.display = 'none'; }

  elsLayer.addEventListener('pointerdown', (ev) => {
    const node = ev.target.closest('.el');
    if (!node) return;
    const el = doc.els.find((e) => e.id === node.dataset.id);
    if (!el || el.locked) return;

    if (sel !== el.id) { sel = el.id; renderEls(); renderLayers(); renderProps(); }
    const cur = elsLayer.querySelector('.el[data-id="' + el.id + '"]');

    const resizing = ev.target.classList.contains('handle');
    const s = scale();
    const px0 = ev.clientX, py0 = ev.clientY;
    const x0 = el.x, y0 = el.y, w0 = el.w, h0 = el.h || 0;
    const f = fmt();

    cur.setPointerCapture(ev.pointerId);
    cur.classList.add('drag');
    ev.preventDefault();

    function onMove(e) {
      const dx = (e.clientX - px0) / s, dy = (e.clientY - py0) / s;

      if (resizing) {
        el.w = Math.round(clamp(w0 + dx, 20, f.w * 2));
        cur.style.width = el.w + 'px';
        if (el.kind === 'bar') {
          el.h = Math.round(clamp(h0 + dy, 2, f.h));
          cur.style.height = el.h + 'px';
        }
        return;
      }

      let nx = Math.round(x0 + dx), ny = Math.round(y0 + dy);
      const bw = cur.offsetWidth, bh = cur.offsetHeight;
      const snap = Math.max(6, Math.round(f.w * 0.005));

      if (Math.abs(nx + bw / 2 - f.w / 2) < snap) {
        nx = Math.round((f.w - bw) / 2);
        gv.style.left = f.w / 2 + 'px'; gv.style.display = 'block';
      } else gv.style.display = 'none';

      if (Math.abs(ny + bh / 2 - f.h / 2) < snap) {
        ny = Math.round((f.h - bh) / 2);
        gh.style.top = f.h / 2 + 'px'; gh.style.display = 'block';
      } else gh.style.display = 'none';

      el.x = nx; el.y = ny;
      cur.style.left = nx + 'px';
      cur.style.top = ny + 'px';
    }

    function onUp() {
      cur.classList.remove('drag');
      cur.removeEventListener('pointermove', onMove);
      cur.removeEventListener('pointerup', onUp);
      cur.removeEventListener('pointercancel', onUp);
      hideGuides();
      renderProps();
      save();
    }

    cur.addEventListener('pointermove', onMove);
    cur.addEventListener('pointerup', onUp);
    cur.addEventListener('pointercancel', onUp);
  });

  // Clic dans le vide → désélection
  $('stage-wrap').addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.el')) return;
    if (sel) { sel = null; renderEls(); renderLayers(); renderProps(); }
  });

  document.addEventListener('keydown', (ev) => {
    const t = ev.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (!doc) return;
    const el = doc.els.find((e) => e.id === sel);
    if (!el || el.locked) return;
    const step = ev.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[ev.key]) {
      el.x += moves[ev.key][0]; el.y += moves[ev.key][1];
      ev.preventDefault();
      renderEls(); renderProps(); save();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      removeEl(el.id);
    }
  });

  // ── Calques ─────────────────────────────────────────────────────────────────
  const ICON = { text: 'T', logo: '🖼', bar: '▬' };

  function labelOf(el) {
    if (el.kind === 'text') return el.text.split('\n')[0].slice(0, 22) || 'Texte';
    if (el.kind === 'bar') return 'Barre';
    return el.name || 'Image';
  }

  function renderLayers() {
    const box = $('layers');
    if (!doc.els.length) { box.innerHTML = '<p class="empty">Aucun élément.<br />Ajoute un titre ou un logo.</p>'; return; }
    box.innerHTML = doc.els.slice().reverse().map((el) =>
      '<div class="layer' + (el.id === sel ? ' sel' : '') + (el.locked ? ' locked' : '') + '" data-id="' + el.id + '">'
      + '<span class="ic">' + ICON[el.kind] + '</span>'
      + '<span class="nm">' + esc(labelOf(el)) + '</span>'
      + '<button class="mini" data-act="lock" title="' + (el.locked ? 'Déverrouiller' : 'Verrouiller') + '">'
      + (el.locked ? '🔒' : '🔓') + '</button>'
      + '<button class="mini" data-act="up" title="Monter">▲</button>'
      + '<button class="mini" data-act="down" title="Descendre">▼</button>'
      + (el.locked ? '<button class="mini off" data-act="none" title="Calque verrouillé">✕</button>'
        : '<button class="mini" data-act="del" title="Supprimer">✕</button>')
      + '</div>'
    ).join('');
  }

  $('layers').addEventListener('click', (ev) => {
    const row = ev.target.closest('.layer');
    if (!row) return;
    const id = row.dataset.id;
    const act = ev.target.dataset.act;
    if (act === 'none') return; // bouton inactif sur un calque verrouillé
    if (act === 'lock') {
      const el = doc.els.find((e) => e.id === id);
      if (el.locked) delete el.locked; else el.locked = true;
      renderEls(); renderLayers(); renderProps(); save();
      return;
    }
    if (act === 'del') return removeEl(id);
    if (act === 'up' || act === 'down') {
      const i = doc.els.findIndex((e) => e.id === id);
      const j = act === 'up' ? i + 1 : i - 1;
      if (j < 0 || j >= doc.els.length) return;
      [doc.els[i], doc.els[j]] = [doc.els[j], doc.els[i]];
      renderEls(); renderLayers(); save();
      return;
    }
    sel = id;
    renderEls(); renderLayers(); renderProps();
  });

  function removeEl(id) {
    const el = doc.els.find((e) => e.id === id);
    if (el && el.locked) return;
    doc.els = doc.els.filter((e) => e.id !== id);
    if (sel === id) sel = null;
    render();
  }

  function addEl(el, atBottom) {
    if (atBottom) doc.els.unshift(el); else doc.els.push(el);
    sel = el.id;
    render();
  }

  // ── Panneau de propriétés ───────────────────────────────────────────────────
  function fld(label, val, html) {
    return '<label>' + label + (val !== null ? '<span class="val">' + val + '</span>' : '') + '</label>' + html;
  }
  const range = (k, min, max, step, v) => '<input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" />';
  const seg = (k, opts, v) => '<div class="seg" data-k="' + k + '">' + opts.map((o) =>
    '<button data-v="' + o[0] + '"' + (String(o[0]) === String(v) ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>';

  function renderProps() {
    const box = $('props');
    const el = doc.els.find((e) => e.id === sel);
    if (!el) { box.innerHTML = ''; return; }

    const kindName = el.kind === 'text' ? 'Texte' : el.kind === 'logo' ? 'Image' : 'Barre';

    // Un calque verrouillé reste sélectionnable depuis la liste, mais aucun de
    // ses réglages n'est proposé : il faut le déverrouiller pour y toucher.
    if (el.locked) {
      box.innerHTML = '<h2>' + kindName + '</h2><div class="card">'
        + '<p class="hint" style="margin:0 0 10px">🔒 Calque verrouillé — il ne peut être ni déplacé, '
        + 'ni redimensionné, ni supprimé.</p>'
        + '<button class="btn" data-act="unlock">🔓 Déverrouiller</button></div>';
      return;
    }

    let h = '<h2>' + kindName + '</h2><div class="card">';

    if (el.kind === 'text') {
      h += fld('Contenu', null, '<textarea data-k="text">' + esc(el.text) + '</textarea>');
      h += fld('Police', null, seg('font', [['head', 'Titre'], ['body', 'Corps']], el.font));
      h += fld('Taille', el.size + ' px', range('size', 8, Math.round(fmt().h * 0.4), 1, el.size));
      h += fld('Graisse', el.weight, range('weight', 300, 900, 100, el.weight));
      h += fld('Interlettrage', el.ls + ' px', range('ls', -20, 60, 1, el.ls));
      h += fld('Interligne', el.lh.toFixed(2), range('lh', 0.8, 2, 0.05, el.lh));
      h += fld('Alignement', null, seg('align', [['left', '⯇'], ['center', '☰'], ['right', '⯈']], el.align));
      h += fld('Couleur', null, '<input type="color" data-k="color" value="' + hex(el.color) + '" />'
        + '<div class="swatches" data-k="color">' + palette().map((c) => '<button data-v="' + c + '" style="background:' + c + '"></button>').join('') + '</div>');
      h += fld('Casse', null, seg('upper', [[true, 'MAJUSCULES'], [false, 'Normale']], el.upper));
      h += fld('Ombre', null, seg('shadow', [[true, 'Oui'], [false, 'Non']], el.shadow));
      h += fld('Largeur du bloc', el.w + ' px', range('w', 40, fmt().w, 1, el.w));
    } else if (el.kind === 'logo') {
      h += '<img class="thumb" src="' + el.src + '" alt="" />';
      h += fld('Largeur', el.w + ' px', range('w', 20, Math.round(fmt().w * 1.5), 1, el.w));
      h += fld('Ombre', null, seg('shadow', [[true, 'Oui'], [false, 'Non']], el.shadow));
      h += '<button class="btn" data-act="cover" style="margin-top:10px">⬛ Couvrir la toile</button>';
      h += '<button class="btn" data-act="crop">⛶ Recadrer…</button>';
      if (el.crop) h += '<button class="btn" data-act="uncrop">↩ Annuler le recadrage</button>';
      h += '<button class="btn" data-act="cutout">✂️ Détourer le fond</button>';
      if (el.srcOrig) h += '<button class="btn" data-act="uncut">↩ Rétablir l\'original</button>';
    } else {
      h += fld('Largeur', el.w + ' px', range('w', 4, fmt().w, 1, el.w));
      h += fld('Épaisseur', el.h + ' px', range('h', 1, Math.round(fmt().h * 0.5), 1, el.h));
      h += fld('Couleur', null, '<input type="color" data-k="color" value="' + hex(el.color) + '" />'
        + '<div class="swatches" data-k="color">' + palette().map((c) => '<button data-v="' + c + '" style="background:' + c + '"></button>').join('') + '</div>');
    }

    h += fld('Opacité', el.opacity + ' %', range('opacity', 0, 100, 1, el.opacity));
    h += fld('Fusion avec le fond', null, '<select data-k="blend">' + blendOpts(el.blend || 'normal') + '</select>');
    h += '<div class="row" style="margin-top:10px">'
      + '<div><label>X</label><input type="number" data-k="x" value="' + el.x + '" /></div>'
      + '<div><label>Y</label><input type="number" data-k="y" value="' + el.y + '" /></div></div>';
    h += '<div class="btn-row" style="margin-top:9px">'
      + '<button class="btn" data-act="center-x">Centrer ⟷</button>'
      + '<button class="btn" data-act="center-y">Centrer ↕</button></div>';
    h += '<button class="btn" data-act="lock" style="margin-top:7px">🔒 Verrouiller</button>';
    h += '<button class="btn danger" data-act="del">Supprimer</button>';
    h += '</div>';
    box.innerHTML = h;
  }

  function hex(c) { return /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff'; }

  function setProp(el, k, v) {
    const num = ['size', 'weight', 'ls', 'lh', 'w', 'h', 'x', 'y', 'opacity'];
    if (num.includes(k)) v = k === 'lh' ? parseFloat(v) : Math.round(parseFloat(v));
    if (k === 'upper' || k === 'shadow') v = v === 'true' || v === true;
    el[k] = v;
  }

  // Live pendant le glissement d'un slider : on ne re-rend que la scène.
  $('props').addEventListener('input', onPropInput);

  function onPropInput(ev) {
    const k = ev.target.dataset.k;
    const el = doc.els.find((e) => e.id === sel);
    if (!k || !el) return;
    setProp(el, k, ev.target.value);
    renderEls();
    const lab = ev.target.previousElementSibling;
    const v = lab && lab.querySelector ? lab.querySelector('.val') : null;
    if (v) v.textContent = k === 'lh' ? el.lh.toFixed(2) : el[k] + (k === 'weight' ? '' : k === 'opacity' ? ' %' : ' px');
    if (k === 'text') renderLayers();
    save();
  }

  $('props').addEventListener('click', (ev) => {
    const el = doc.els.find((e) => e.id === sel);
    if (!el) return;
    const btn = ev.target.closest('button');
    if (!btn) return;
    const grp = btn.parentElement.dataset.k;
    const act = btn.dataset.act;

    if (act === 'unlock') { delete el.locked; renderEls(); renderLayers(); renderProps(); save(); return; }
    if (act === 'lock') { el.locked = true; renderEls(); renderLayers(); renderProps(); save(); return; }
    if (act === 'del') return removeEl(el.id);
    if (act === 'cutout') return openCutout(el);
    if (act === 'crop') return openCrop(el);
    if (act === 'uncrop') { delete el.crop; renderEls(); renderProps(); save(); return; }
    if (act === 'cover') {
      el.w = coverWidth(dispRatio(el));
      el.x = Math.round((doc.w - el.w) / 2);
      el.y = Math.round((doc.h - elHeight(el)) / 2);
      renderEls(); renderProps(); save();
      return;
    }
    if (act === 'uncut') { el.src = el.srcOrig; delete el.srcOrig; render(); return; }
    if (act === 'center-x') { el.x = Math.round((fmt().w - nodeW(el.id)) / 2); renderEls(); renderProps(); save(); return; }
    if (act === 'center-y') { el.y = Math.round((fmt().h - nodeH(el.id)) / 2); renderEls(); renderProps(); save(); return; }
    if (grp && btn.dataset.v !== undefined) {
      setProp(el, grp, btn.dataset.v);
      renderEls(); renderProps(); renderLayers(); save();
    }
  });

  function nodeW(id) { const n = elsLayer.querySelector('.el[data-id="' + id + '"]'); return n ? n.offsetWidth : 0; }
  function nodeH(id) { const n = elsLayer.querySelector('.el[data-id="' + id + '"]'); return n ? n.offsetHeight : 0; }

  // ── Panneau gauche ──────────────────────────────────────────────────────────
  function renderDocPanel() {
    const b = doc.bg;
    $('fmt').value = presetIdFor(doc.w, doc.h);
    $('fmt-w').value = doc.w;
    $('fmt-h').value = doc.h;
    $('bg-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === b.mode));
    $('bg-mode-val').textContent = '';
    $('bg-c1').value = hex(b.c1);
    $('bg-c2').value = hex(b.c2);
    $('bg-c2-wrap').style.display = b.mode === 'gradient' ? '' : 'none';
    $('bg-colors').style.display = b.mode === 'none' ? 'none' : '';
    $('bg-swatches').style.display = b.mode === 'none' ? 'none' : '';
    $('bg-thumb').hidden = !b.image;
    if (b.image) $('bg-thumb').src = b.image;
    $('bg-img-opts').hidden = !b.image;
    $('bg-fit').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === b.fit));
    $('bg-dim').value = b.dim; $('bg-dim-val').textContent = b.dim + ' %';
    $('bg-blur').value = b.blur; $('bg-blur-val').textContent = b.blur + ' px';
    $('bg-op').value = b.imgOpacity; $('bg-op-val').textContent = b.imgOpacity + ' %';
    $('bg-blend').innerHTML = blendOpts(b.imgBlend);
    $('bg-swatches').innerHTML = palette().map((c) => '<button data-v="' + c + '" style="background:' + c + '"></button>').join('');

    const t = b.tex;
    $('tex-type').value = t.type;
    $('tex-pick').hidden = t.type !== 'image';
    $('tex-thumb').hidden = !(t.type === 'image' && t.src);
    if (t.type === 'image' && t.src) $('tex-thumb').src = t.src;
    $('tex-opts').hidden = t.type === 'none';
    $('tex-draw-opts').hidden = t.type === 'image';
    $('tex-size').value = t.size; $('tex-size-val').textContent = t.size + ' px';
    $('tex-gap').value = t.gap; $('tex-gap-val').textContent = t.gap + ' px';
    $('tex-angle').value = t.angle; $('tex-angle-val').textContent = t.angle + ' \u00b0';
    $('tex-thick').value = t.thick; $('tex-thick-val').textContent = t.thick + ' %';
    $('tex-color').value = hex(t.color);
    $('tex-op').value = t.opacity; $('tex-op-val').textContent = t.opacity + ' %';
    $('tex-blend').innerHTML = blendOpts(t.blend);
    $('tex-swatches').innerHTML = palette().map((c) => '<button data-v="' + c + '" style="background:' + c + '"></button>').join('');
  }

  $('tex-type').innerHTML = TEXTURES.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('');

  $('fmt').innerHTML = FORMATS.map((f) => '<option value="' + f.id + '">' + f.name + '</option>').join('')
    + '<option value="custom">Personnalisé</option>';

  // Change la taille de la toile. Si « adapter » est coché, les éléments sont
  // reportés proportionnellement ; sinon ils gardent leurs coordonnées absolues.
  function resizeCanvas(nw, nh) {
    if (!doc) return; // les contrôles existent avant la fin du démarrage
    const ow = doc.w, oh = doc.h;
    doc.w = clamp(Math.round(nw) || ow, SIZE_MIN, SIZE_MAX);
    doc.h = clamp(Math.round(nh) || oh, SIZE_MIN, SIZE_MAX);
    if (doc.w === ow && doc.h === oh) { renderDocPanel(); return; }

    if ($('fmt-adapt').checked) {
      const rx = doc.w / ow, ry = doc.h / oh, rs = Math.min(rx, ry);
      doc.els.forEach((el) => {
        el.x = Math.round(el.x * rx); el.y = Math.round(el.y * ry);
        el.w = Math.round(el.w * rx);
        if (el.kind === 'text') { el.size = Math.max(8, Math.round(el.size * rs)); el.ls = Math.round(el.ls * rs); }
        if (el.kind === 'bar') el.h = Math.max(1, Math.round(el.h * ry));
      });
    }
    zoom = fitZoom();
    render(); renderDocPanel();
  }

  $('fmt').addEventListener('change', () => {
    const p = FORMATS.find((f) => f.id === $('fmt').value);
    if (p) resizeCanvas(p.w, p.h);
    else renderDocPanel(); // « Personnalisé » : on garde la taille en cours
  });

  // On applique sur 'change' (validation / perte de focus) et non sur 'input' :
  // sinon chaque chiffre tapé redimensionnerait la toile.
  const onSizeInput = () => resizeCanvas(+$('fmt-w').value, +$('fmt-h').value);
  $('fmt-w').addEventListener('change', onSizeInput);
  $('fmt-h').addEventListener('change', onSizeInput);
  $('fmt-swap').addEventListener('click', () => resizeCanvas(doc.h, doc.w));

  $('bg-mode').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    doc.bg.mode = b.dataset.v; renderBg(); renderDocPanel(); save();
  });
  $('bg-c1').addEventListener('input', () => { doc.bg.c1 = $('bg-c1').value; renderBg(); save(); });
  $('bg-c2').addEventListener('input', () => { doc.bg.c2 = $('bg-c2').value; renderBg(); save(); });
  $('bg-swatches').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    doc.bg.c1 = b.dataset.v; renderBg(); renderDocPanel(); save();
  });
  $('bg-fit').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    doc.bg.fit = b.dataset.v; renderBg(); renderDocPanel(); save();
  });
  $('bg-dim').addEventListener('input', () => { doc.bg.dim = +$('bg-dim').value; $('bg-dim-val').textContent = doc.bg.dim + ' %'; renderBg(); save(); });
  $('bg-blur').addEventListener('input', () => { doc.bg.blur = +$('bg-blur').value; $('bg-blur-val').textContent = doc.bg.blur + ' px'; renderBg(); save(); });
  $('bg-clear').addEventListener('click', () => { doc.bg.image = null; renderBg(); renderDocPanel(); save(); });

  $('bg-op').addEventListener('input', () => {
    doc.bg.imgOpacity = +$('bg-op').value; $('bg-op-val').textContent = doc.bg.imgOpacity + ' %'; renderBg(); save();
  });
  $('bg-blend').addEventListener('change', () => { doc.bg.imgBlend = $('bg-blend').value; renderBg(); save(); });

  // Texture repetee
  function texSet(k, v, full) {
    doc.bg.tex[k] = v;
    renderBg();
    if (full) renderDocPanel();
    save();
  }
  $('tex-type').addEventListener('change', () => texSet('type', $('tex-type').value, true));
  $('tex-size').addEventListener('input', () => { $('tex-size-val').textContent = $('tex-size').value + ' px'; texSet('size', +$('tex-size').value); });
  $('tex-gap').addEventListener('input', () => { $('tex-gap-val').textContent = $('tex-gap').value + ' px'; texSet('gap', +$('tex-gap').value); });
  $('tex-angle').addEventListener('input', () => { $('tex-angle-val').textContent = $('tex-angle').value + ' \u00b0'; texSet('angle', +$('tex-angle').value); });
  $('tex-thick').addEventListener('input', () => { $('tex-thick-val').textContent = $('tex-thick').value + ' %'; texSet('thick', +$('tex-thick').value); });
  $('tex-color').addEventListener('input', () => texSet('color', $('tex-color').value));
  $('tex-op').addEventListener('input', () => { $('tex-op-val').textContent = $('tex-op').value + ' %'; texSet('opacity', +$('tex-op').value); });
  $('tex-blend').addEventListener('change', () => texSet('blend', $('tex-blend').value));
  $('tex-swatches').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    texSet('color', b.dataset.v, true);
  });
  $('tex-pick').addEventListener('click', () => $('tex-file').click());
  $('tex-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    const src = await storeImage(f);
    await loadImg(src);
    texSet('src', src, true);
  });

  // ── Galerie de fonds prêts à l'emploi ───────────────────────────────────────
  // Alimentée par /api/backgrounds : un sous-dossier de public/backgrounds par
  // événement. Les fonds livrés portent déjà leur vignette, d'où l'assombrissement
  // remis à zéro à la sélection.
  const GROUP_NAMES = { stack: 'STACK' };
  let bgLibrary = [];

  function renderGallery() {
    const box = $('bg-gallery');
    if (!bgLibrary.length) {
      box.innerHTML = '<p class="empty">Aucun fond dans public/backgrounds.</p>';
      return;
    }
    box.innerHTML = bgLibrary.map((g) =>
      '<div class="bg-group"><h3>' + esc(GROUP_NAMES[g.id] || g.id) + '</h3><div class="bg-grid">'
      + g.files.map((f) =>
        '<button class="bg-card" data-url="' + esc(f.url) + '" data-name="' + esc(f.name) + '">'
        + '<img src="' + esc(f.url) + '" alt="" loading="lazy" />'
        + '<span>' + esc(f.name) + '</span></button>').join('')
      + '</div></div>').join('');
  }

  // Une texture s'ajoute comme un calque ordinaire — déposé sous les éléments
  // déjà présents — donc réglable en opacité, fusion, taille et position.
  $('bg-gallery').addEventListener('click', async (ev) => {
    const card = ev.target.closest('.bg-card');
    if (!card || !doc) return;
    const url = card.dataset.url;
    try {
      const img = await loadImg(url);
      addEl(newImage(url, img.naturalHeight / img.naturalWidth, { cover: true, name: card.dataset.name }), true);
    } catch {
      alert('Texture illisible : ' + url);
    }
  });

  fetch('/api/backgrounds')
    .then((r) => r.json())
    .then((g) => { bgLibrary = g; renderGallery(); })
    .catch(() => { bgLibrary = []; renderGallery(); });

  $('bg-pick').addEventListener('click', () => $('bg-file').click());
  $('bg-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    doc.bg.image = await storeImage(f);
    renderBg(); renderDocPanel(); save();
  });

  $('add-title').addEventListener('click', () => addEl(newText('title')));
  $('add-sub').addEventListener('click', () => addEl(newText('sub')));
  $('add-text').addEventListener('click', () => addEl(newText('text')));
  $('add-bar').addEventListener('click', () => addEl(newBar()));
  $('add-logo').addEventListener('click', () => $('logo-file').click());
  $('logo-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    const src = await storeImage(f);
    const img = await loadImg(src);
    addEl(newImage(src, img.naturalHeight / img.naturalWidth));
  });

  $('reset').addEventListener('click', () => {
    if (!confirm('Effacer le visuel en cours ?')) return;
    doc = blankDoc(doc.w, doc.h);
    sel = null;
    render(); renderDocPanel();
  });

  $('zoom').addEventListener('input', () => { zoom = +$('zoom').value; applyZoom(); });

  // ── Export PNG ──────────────────────────────────────────────────────────────
  function wrapLines(ctx, text, maxW) {
    const out = [];
    text.split('\n').forEach((para) => {
      if (!para) { out.push(''); return; }
      const words = para.split(' ');
      let line = '';
      words.forEach((word) => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxW || !line) {
          // Mot seul plus large que le bloc → on le coupe caractère par caractère.
          if (!line && ctx.measureText(word).width > maxW) {
            let chunk = '';
            for (const ch of word) {
              if (ctx.measureText(chunk + ch).width > maxW && chunk) { out.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            line = chunk;
          } else line = test;
        } else { out.push(line); line = word; }
      });
      out.push(line);
    });
    return out;
  }

  function drawBg(ctx, f) {
    const b = doc.bg;
    if (b.mode === 'none') return b; // rien peint : le PNG garde sa couche alpha
    if (b.mode === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, f.w, f.h);
      g.addColorStop(0, b.c1); g.addColorStop(1, b.c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = b.c1;
    ctx.fillRect(0, 0, f.w, f.h);
    return b;
  }

  function drawBgImage(ctx, f, img) {
    const b = doc.bg;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let dw = f.w, dh = f.h;
    if (b.fit === 'cover') { const s = Math.max(f.w / iw, f.h / ih); dw = iw * s; dh = ih * s; }
    else if (b.fit === 'contain') { const s = Math.min(f.w / iw, f.h / ih); dw = iw * s; dh = ih * s; }
    const os = overscan(b.blur);
    dw *= os; dh *= os;
    ctx.save();
    if (b.blur > 0) ctx.filter = 'blur(' + b.blur + 'px)';
    ctx.globalAlpha = b.imgOpacity / 100;
    ctx.globalCompositeOperation = compositeOf(b.imgBlend);
    ctx.drawImage(img, (f.w - dw) / 2, (f.h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawTexture(ctx, f) {
    const t = doc.bg.tex;
    const tile = texTile(t);
    if (!tile) return;
    const pat = ctx.createPattern(tile.canvas, 'repeat');
    if (!pat) return;
    const D = texSpan(f);
    ctx.save();
    ctx.globalAlpha = t.opacity / 100;
    ctx.globalCompositeOperation = compositeOf(t.blend);
    ctx.translate(f.w / 2, f.h / 2);
    ctx.rotate((t.angle * Math.PI) / 180);
    ctx.translate(-D / 2, -D / 2); // meme point d'ancrage du motif que l'apercu
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, D, D);
    ctx.restore();
  }

  function drawEl(ctx, el, images) {
    ctx.save();
    ctx.globalAlpha = el.opacity / 100;
    ctx.globalCompositeOperation = compositeOf(el.blend);

    if (el.shadow) {
      const s = el.kind === 'text' ? el.size : el.w * 0.2;
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = s * 0.3;
      ctx.shadowOffsetY = s * 0.06;
    }

    if (el.kind === 'bar') {
      ctx.fillStyle = el.color;
      ctx.fillRect(el.x, el.y, el.w, el.h);
    } else if (el.kind === 'logo') {
      const img = images.get(el.src);
      if (img) {
        const c = cropOf(el);
        ctx.drawImage(
          img,
          c.x * img.naturalWidth, c.y * img.naturalHeight,
          c.w * img.naturalWidth, c.h * img.naturalHeight,
          el.x, el.y, el.w, elHeight(el),
        );
      }
    } else {
      const fam = famResolved(el.font);
      ctx.font = el.weight + ' ' + el.size + 'px ' + fam;
      if ('letterSpacing' in ctx) ctx.letterSpacing = el.ls + 'px';
      ctx.fillStyle = el.color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = el.align;
      const text = el.upper ? el.text.toUpperCase() : el.text;
      const lines = wrapLines(ctx, text, el.w);
      const lh = el.size * el.lh;
      const ax = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
      lines.forEach((line, i) => ctx.fillText(line, ax, el.y + i * lh + lh / 2));
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
  }

  async function exportPNG() {
    const btn = $('export');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Rendu…';
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const f = fmt();
      const c = document.createElement('canvas');
      c.width = f.w; c.height = f.h;
      const ctx = c.getContext('2d');

      drawBg(ctx, f);
      if (doc.bg.image) drawBgImage(ctx, f, await loadImg(doc.bg.image));
      if (doc.bg.tex.type === 'image' && doc.bg.tex.src) await loadImg(doc.bg.tex.src);
      drawTexture(ctx, f);
      if (doc.bg.image && doc.bg.dim > 0) { ctx.fillStyle = 'rgba(0,0,0,' + (doc.bg.dim / 100) + ')'; ctx.fillRect(0, 0, f.w, f.h); }

      const images = new Map();
      for (const el of doc.els) {
        if (el.kind === 'logo' && !images.has(el.src)) images.set(el.src, await loadImg(el.src));
      }
      doc.els.forEach((el) => drawEl(ctx, el, images));

      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'visuel-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      alert("Export impossible : " + e.message);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }
  $('export').addEventListener('click', exportPNG);

  // ── Démarrage ───────────────────────────────────────────────────────────────
  function boot() {
    doc = migrate(load() || blankDoc(FORMATS[0].w, FORMATS[0].h));
    doc.els.forEach((e) => { const n = parseInt(e.id.slice(1), 36); if (n > uid) uid = n; });
    zoom = fitZoom();
    render();
    renderDocPanel();
    renderGallery();
  }

  // Les couleurs par défaut viennent du thème : on attend que theme.js ait posé
  // les variables sur <html> (avec un garde-fou de 2 s si le serveur ne répond pas).
  function whenThemeReady(cb) {
    let n = 0;
    (function poll() {
      if (document.documentElement.style.getPropertyValue('--pso-bg') || ++n > 40) return cb();
      setTimeout(poll, 50);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => whenThemeReady(boot));
  else whenThemeReady(boot);

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (doc) { zoom = fitZoom(); applyZoom(); } }, 150);
  });

  // Changement de thème en direct → les nuanciers suivent.
  if (window.io) {
    try {
      const s = window.__psoSocket || window.io();
      window.__psoSocket = s;
      s.on('themeUpdate', () => { if (doc) { renderDocPanel(); renderProps(); } });
    } catch { /* socket indisponible */ }
  }
})();
