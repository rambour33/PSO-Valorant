// particles.js — moteur de particules léger (canvas + requestAnimationFrame).
// Piloté par le thème via window.PSOParticles.setEffect(config).
// config = { type:'dust'|'drift'|'grain'|'none', count, opacity, colors:[...] }
(function () {
  let canvas, ctx, raf = null, parts = [], cfg = null, W = 0, H = 0, mounted = false;

  function mount() {
    if (mounted) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pso-particles';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    // Garde le contenu de la page au-dessus du canvas
    const st = document.createElement('style');
    st.textContent = 'body>*:not(.pso-particles){position:relative;z-index:1}';
    document.head.appendChild(st);
    window.addEventListener('resize', resize);
    resize();
    mounted = true;
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function makeParticle() {
    const c = pick(cfg.colors || ['#ffffff']);
    if (cfg.type === 'dust') {
      return { x: Math.random() * W, y: Math.random() * H, r: rnd(0.8, 2.4),
        vx: rnd(-0.12, 0.12), vy: rnd(-0.18, -0.04), tw: Math.random() * Math.PI * 2, tws: rnd(0.01, 0.03), c };
    }
    if (cfg.type === 'drift') { // taches camouflage
      return { x: Math.random() * W, y: Math.random() * H, rx: rnd(26, 70), ry: rnd(18, 46),
        rot: Math.random() * Math.PI, vx: rnd(-0.18, 0.18), vy: rnd(-0.12, 0.12),
        ph: Math.random() * Math.PI * 2, phs: rnd(0.004, 0.011), c };
    }
    // grain (vision nocturne) : grains qui montent + scintillement
    return { x: Math.random() * W, y: Math.random() * H, r: rnd(0.6, 1.8),
      vy: rnd(-0.9, -0.3), vx: rnd(-0.15, 0.15), fl: Math.random() * Math.PI * 2, fls: rnd(0.08, 0.2), c };
  }

  function spawn() {
    parts = [];
    const n = Math.max(0, cfg.count | 0);
    for (let i = 0; i < n; i++) parts.push(makeParticle());
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    const baseOp = cfg.opacity == null ? 0.4 : cfg.opacity;

    if (cfg.type === 'grain') {
      // léger scanline vision nocturne
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = cfg.colors[0];
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }

    for (const p of parts) {
      if (cfg.type === 'dust') {
        p.x += p.vx; p.y += p.vy; p.tw += p.tws;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
        ctx.globalAlpha = baseOp * (0.5 + 0.5 * Math.sin(p.tw));
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (cfg.type === 'drift') {
        p.x += p.vx; p.y += p.vy; p.ph += p.phs;
        if (p.x < -90) p.x = W + 90; else if (p.x > W + 90) p.x = -90;
        if (p.y < -70) p.y = H + 70; else if (p.y > H + 70) p.y = -70;
        ctx.globalAlpha = baseOp * (0.7 + 0.3 * Math.sin(p.ph));
        ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else { // grain
        p.x += p.vx; p.y += p.vy; p.fl += p.fls;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        ctx.globalAlpha = baseOp * (0.4 + 0.6 * Math.abs(Math.sin(p.fl)));
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  function setEffect(c) {
    cfg = c;
    if (!c || c.type === 'none' || !c.count) { stop(); return; }
    mount(); resize(); spawn();
    if (!raf) tick();
  }

  window.PSOParticles = { setEffect, stop };
})();
