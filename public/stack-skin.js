// stack-skin.js — aide pour l'habillage Stack 03 (thème « stack »).
// PSOSkin.is() : vrai quand le thème actif est « stack ».
// PSOSkin.onChange(fn) : rappelle fn à chaque (re)chargement du thème, pour redessiner l'overlay.
(function () {
  function is() { return document.documentElement.getAttribute('data-pso-theme') === 'stack'; }
  function onChange(fn) { document.addEventListener('pso:theme', function () { try { fn(); } catch (e) { console.error(e); } }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  window.PSOSkin = { is: is, onChange: onChange, esc: esc, logo: '/stack03/assets/logo-stack.svg' };
})();
