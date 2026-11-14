// ?fit=1 (ou ?fit=0.8) : agrandit et centre le contenu visible de l'overlay pour remplir le canevas
// 1920×1080 (scènes OBS dédiées). Sans le paramètre, rien ne change (overlays posés sur le jeu,
// iframes de la régie, etc.). ?fit=1 = 86 % du canevas, sinon la fraction donnée (0.3 à 1).
(function () {
  const p = new URLSearchParams(location.search).get('fit');
  if (!p || p === '0') return;
  const f = parseFloat(p);
  const FRAC = f > 0 && f < 1 ? Math.max(0.3, f) : 0.86;
  const W = 1920, H = 1080;
  let cur = { s: 1, x: 0, y: 0 };

  function bbox() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    document.body.querySelectorAll('*').forEach((el) => {
      if (/^(SCRIPT|STYLE|LINK|BR)$/.test(el.tagName)) return;
      const leaf = !el.firstElementChild || /^(IMG|SVG|CANVAS|IFRAME|VIDEO)$/i.test(el.tagName);
      if (!leaf || (el.parentElement && el.parentElement.closest('svg'))) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return;
      // coordonnées sans la mise à l'échelle courante
      const a = (r.left - cur.x) / cur.s, b = (r.top - cur.y) / cur.s;
      const w = r.width / cur.s, h = r.height / cur.s;
      if (w > W * 0.95 && h > H * 0.95) return;        // calques de fond plein écran
      x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, a + w); y2 = Math.max(y2, b + h);
    });
    return isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
  }

  function fit() {
    const r = bbox();
    if (!r) return;
    const s = Math.min(W * FRAC / r.w, H * FRAC / r.h, 4);
    const x = (W - r.w * s) / 2 - r.x * s, y = (H - r.h * s) / 2 - r.y * s;
    if (Math.abs(s - cur.s) < 0.01 && Math.abs(x - cur.x) < 2 && Math.abs(y - cur.y) < 2) return;
    cur = { s, x, y };
    document.body.style.transformOrigin = '0 0';
    document.body.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
  }

  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(fit, 120); };
  function boot() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.transition = 'transform .35s ease';
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
    if (document.fonts) document.fonts.ready.then(later);
    setInterval(fit, 1500);
    later();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
