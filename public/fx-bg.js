// Fond animé partagé (grille, sol en perspective, halo animé, particules, balayage, grain).
// Usage : const fx = PSOFx(conteneur); fx.set({ halo, bg, grid }) — mêmes réglages que l'écran Start.
(function () {
  window.PSOFx = function (root) {
    const L = {};
    ['grid', 'floor', 'halo', 'fx', 'lines', 'scan'].forEach((k) => {
      const el = document.createElement(k === 'fx' ? 'canvas' : 'div');
      el.className = 'fxl-' + k; if (k === 'fx') { el.width = 1920; el.height = 1080; }
      root.appendChild(el); L[k] = el;
    });
    let S = null;
    function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
      // ── Effets animés ───────────────────────────────────────────
      const TAU = Math.PI * 2;
      function hex2rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
      function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return A.map((v, i) => Math.round(v + (B[i] - v) * t)); }
      function hsl2rgb(h, s, l) { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }
      function rgbHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
        if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
      // bruit doux (somme de sinus) pour les dérives et le scintillement
      const smooth = (t, k) => (Math.sin(t * 1.0 + k) + Math.sin(t * 1.618 + k * 2.3) * .6 + Math.sin(t * 2.71 + k * .7) * .3) / 1.9;

      function haloAt(h, t) {
        const A = h.amount, sp = h.speed, p = t * sp;     // p : temps « effet » en secondes
        let I = h.intensity, Z = h.size, X = h.x, Y = h.y, C = hex2rgb(h.color);
        switch (h.fx) {
          case 'pulse': I *= 1 - A * .8 * (0.5 - 0.5 * Math.cos(p * TAU / 2)); break;
          case 'breathe': { const w = 0.5 - 0.5 * Math.cos(p * TAU / 5); Z *= 1 + A * .6 * (w - .5); I *= 1 + A * .35 * (w - .5); break; }
          case 'heartbeat': { const c = (p / 1.2) % 1, beat = Math.exp(-Math.pow((c - .08) / .045, 2)) + .7 * Math.exp(-Math.pow((c - .26) / .05, 2));
            I *= 1 - A * .5 + A * 1.1 * beat; Z *= 1 + A * .12 * beat; break; }
          case 'flicker': { const n = smooth(p * 7, 1.3), cut = Math.sin(p * 23.7) > .985 - A * .03 ? .35 : 1; I *= Math.max(0, (1 + A * .45 * n) * (A > 0 ? cut : 1)); break; }
          case 'drift': X += A * 22 * smooth(p * .35, .2); Y += A * 14 * smooth(p * .3, 4.1); Z *= 1 + A * .12 * smooth(p * .25, 2); break;
          case 'orbit': X += A * 24 * Math.cos(p * TAU / 8); Y += A * 14 * Math.sin(p * TAU / 8); break;
          case 'colors': C = mix(h.color, h.color2, 0.5 - 0.5 * Math.cos(p * TAU / 6)); break;
          case 'rainbow': { const [hh, ss, ll] = rgbHsl(C); C = hsl2rgb((hh + p * 36) % 360, Math.max(ss, .6), Math.min(Math.max(ll, .45), .6)); I *= 1 + A * .2 * Math.sin(p * TAU / 4); break; }
        }
        return { I: Math.max(0, Math.min(1, I)), Z: Math.max(5, Z), X, Y, C };
      }

      const cv = L.fx, cx = cv.getContext('2d');
      let parts = [];
      function seed() { if (parts.length) return; for (let i = 0; i < 90; i++) parts.push({ x: Math.random() * 1920, y: Math.random() * 1080, r: .8 + Math.random() * 2.6, v: .3 + Math.random(), ph: Math.random() * TAU }); }
      let grainBuf = null;
      function grain() {
        if (!grainBuf) { grainBuf = document.createElement('canvas'); grainBuf.width = 256; grainBuf.height = 256; }
        const g = grainBuf.getContext('2d'), d = g.createImageData(256, 256);
        for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
        g.putImageData(d, 0, 0); return grainBuf;
      }

      let last = 0, lastGrain = 0;
      function frame(now, force) {
        if (!S) return;
        const t = now / 1000, dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
        const h = S.halo, b = S.bg || {};
        if (h.on) {
          const v = haloAt(h, t);
          L.halo.style.background = 'radial-gradient(ellipse at ' + v.X.toFixed(2) + '% ' + v.Y.toFixed(2) + '%, rgba(' + v.C.join(',') + ',' + v.I.toFixed(3) + '), transparent ' + v.Z.toFixed(2) + '%)';
        } else L.halo.style.background = 'none';
        const col = h.on ? h.color : '#e33bae', bs = b.speed || 1, ba = b.amount == null ? .5 : b.amount;
        const g = L.grid;
        if (S.grid) {
          let gl = .045;
          if (b.grid === 'scroll') { const o = (t * 24 * bs) % 48; g.style.backgroundPosition = o + 'px ' + o + 'px'; }
          else g.style.backgroundPosition = '';
          if (b.grid === 'pulse') gl = .045 * (1 + ba * 4 * (0.5 - 0.5 * Math.cos(t * bs * TAU / 3)));
          g.style.setProperty('--gl', 'rgba(227,59,174,' + gl.toFixed(4) + ')');
          if (b.grid === 'wave') {
            const y = ((t * bs * 260) % 1500) - 200;
            g.style.backgroundImage = 'linear-gradient(to bottom, transparent ' + (y - 160) + 'px, ' + rgba(col, .14 * ba) + ' ' + y + 'px, transparent ' + (y + 160) + 'px), linear-gradient(var(--gl) 1px, transparent 1px), linear-gradient(90deg, var(--gl) 1px, transparent 1px)';
            g.style.backgroundSize = '100% 100%, 48px 48px, 48px 48px';
          } else if (g.style.backgroundSize) { g.style.backgroundImage = ''; g.style.backgroundSize = ''; }
          if (b.grid === 'floor') { const f = L.floor; f.style.setProperty('--gc', rgba(col, .12 + .3 * ba)); f.style.backgroundPosition = '0 ' + ((t * 60 * bs) % 96) + 'px'; }
        }
        if (b.scan) {
          L.scan.style.setProperty('--sc', rgba(col, .05 + .12 * ba));
          L.scan.style.top = (((t * bs * 180) % 1600) - 260) + 'px';
          L.lines.style.opacity = (.3 + .7 * ba).toFixed(2);
        }
        cx.clearRect(0, 0, 1920, 1080);
        if (b.particles) {
          seed();
          const [r, gg, bb] = hex2rgb(col);
          for (const q of parts) {
            q.y -= q.v * 28 * bs * dt; q.x += Math.sin(t * .6 + q.ph) * 8 * dt * bs;
            if (q.y < -10) { q.y = 1090; q.x = Math.random() * 1920; }
            const a = (.25 + .55 * ba) * (0.55 + 0.45 * Math.sin(t * 1.7 * bs + q.ph));
            cx.beginPath(); cx.arc(q.x, q.y, q.r * (1 + ba * .6), 0, TAU);
            cx.fillStyle = 'rgba(' + r + ',' + gg + ',' + bb + ',' + a.toFixed(3) + ')';
            cx.shadowColor = cx.fillStyle; cx.shadowBlur = 10; cx.fill();
          }
          cx.shadowBlur = 0;
        }
        if (b.grain) {
          if (now - lastGrain > 60 || force) { lastGrain = now; grain(); }
          cx.globalAlpha = .04 + .1 * ba; cx.fillStyle = cx.createPattern(grainBuf, 'repeat'); cx.fillRect(0, 0, 1920, 1080); cx.globalAlpha = 1;
        }
      }
    

    function set(s) {
      S = s; const b = s.bg || {};
      L.grid.style.display = s.grid && b.grid !== 'floor' ? '' : 'none';
      L.floor.style.display = s.grid && b.grid === 'floor' ? 'block' : 'none';
      L.scan.style.display = b.scan ? 'block' : 'none';
      L.lines.style.display = b.scan ? 'block' : 'none';
      if (b.particles) seed();
      frame(performance.now(), true);
    }
    (function loop(now) { frame(now); requestAnimationFrame(loop); })(performance.now());
    return { set };
  };
})();
