// theme.js — applique le thème global (--pso-*) à n'importe quelle page/overlay.
// À inclure sur tout overlay : <script src="/theme.js"></script>
// Met à jour en direct via Socket.IO (si présent) sur l'event 'themeUpdate'.
(function () {
  function applyVars(vars) {
    const r = document.documentElement;
    for (const k in (vars || {})) r.style.setProperty(k, vars[k]);
  }
  function ensureFonts(href) {
    if (!href) return;
    let l = document.querySelector('link[data-pso-fonts]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-pso-fonts', '');
      document.head.appendChild(l);
    }
    if (l.href !== href) l.href = href;
  }
  function apply(d) {
    if (!d) return;
    ensureFonts(d.fonts);
    applyVars(d.vars);
    if (d.active) document.documentElement.setAttribute('data-pso-theme', d.active);
    if (window.PSOParticles) window.PSOParticles.setEffect(d.particles || null);
  }

  fetch('/api/theme').then((r) => r.json()).then(apply).catch(() => {});

  // Mise à jour live — réutilise un socket existant ou en ouvre un.
  function connect() {
    if (!window.io) return false;
    try {
      const s = window.__psoSocket || window.io();
      window.__psoSocket = s;
      s.on('themeUpdate', apply);
      return true;
    } catch (e) { return false; }
  }
  if (!connect()) {
    let n = 0;
    const iv = setInterval(() => { if (connect() || ++n > 40) clearInterval(iv); }, 150);
  }
})();
