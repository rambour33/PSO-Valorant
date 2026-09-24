'use strict';
// Génère les fonds de l'événement STACK dans public/backgrounds/stack.
// Palette et typo relevées sur https://www.lstournament.com/stack.html
//
//   node scripts/make-stack-backgrounds.js
//
// Sortie en SVG : net à n'importe quelle résolution, quelques Ko par fichier,
// et relisible/modifiable à la main. Chaque fond porte une vignette : ils sont
// faits pour passer SOUS une annonce, le centre doit rester lisible.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'backgrounds', 'stack');
const W = 1920, H = 1080;

const C = {
  bg: '#0c0a0a',
  panel: '#130f0f',
  panel2: '#1a1212',
  border: '#241819',
  crimson: '#8b0000',
  crLight: '#cc1111',
  magenta: '#e33bae',
  magDim: '#9c2b78',
  cream: '#f0e6d3',
};

// Vignette : assombrit les bords pour détacher le texte posé au centre.
function vignette(id, strength) {
  return `<radialGradient id="${id}" cx="50%" cy="44%" r="78%">
      <stop offset="40%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="${strength}"/>
    </radialGradient>`;
}

function svg(defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
${body}
</svg>
`;
}

const fill = (id) => `  <rect width="${W}" height="${H}" fill="url(#${id})"/>`;

// ── Les fonds ────────────────────────────────────────────────────────────────
const BACKGROUNDS = {

  // Hachures cramoisies serrées : la trame la plus discrète, passe partout.
  'hachures': () => svg(
    `    <pattern id="h" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="3" height="26" fill="${C.crLight}" opacity="0.3"/>
    </pattern>
${vignette('v', 0.6)}`,
    [fill('h'), fill('v')].join('\n')),

  // Grille technique, maille fine + maille large plus marquée.
  'grille': () => svg(
    `    <pattern id="g1" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M60 0 H0 V60" stroke="${C.border}" stroke-width="1.5" fill="none"/>
    </pattern>
    <pattern id="g2" width="240" height="240" patternUnits="userSpaceOnUse">
      <path d="M240 0 H0 V240" stroke="${C.crimson}" stroke-width="2" fill="none" opacity="0.55"/>
    </pattern>
${vignette('v', 0.78)}`,
    [fill('g1'), fill('g2'), fill('v')].join('\n')),

  // Chevrons larges : rappelle le « stack », empilement de couches.
  'chevrons': () => svg(
    `    <pattern id="c" width="180" height="90" patternUnits="userSpaceOnUse">
      <path d="M-10 80 L90 20 L190 80" stroke="${C.crimson}" stroke-width="11" fill="none" opacity="0.13"/>
      <path d="M-10 170 L90 110 L190 170" stroke="${C.crimson}" stroke-width="11" fill="none" opacity="0.13"/>
    </pattern>
${vignette('v', 0.7)}`,
    [fill('c'), fill('v')].join('\n')),

  // Bandes obliques alternées, ponctuées d'un filet rose.
  'bandes': () => svg(
    `    <pattern id="b" width="130" height="130" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
      <rect width="66" height="130" fill="${C.panel}"/>
      <rect x="126" width="2" height="130" fill="${C.magenta}" opacity="0.22"/>
    </pattern>
${vignette('v', 0.7)}`,
    [fill('b'), fill('v')].join('\n')),

  // Trame de points, façon impression sérigraphiée.
  'pois': () => svg(
    `    <pattern id="p1" width="44" height="44" patternUnits="userSpaceOnUse">
      <circle cx="22" cy="22" r="2.6" fill="${C.cream}" opacity="0.15"/>
    </pattern>
    <pattern id="p2" width="176" height="176" patternUnits="userSpaceOnUse">
      <circle cx="88" cy="88" r="4" fill="${C.magenta}" opacity="0.7"/>
    </pattern>
${vignette('v', 0.62)}`,
    [fill('p1'), fill('p2'), fill('v')].join('\n')),

  // Faisceaux de projecteur descendant du haut.
  'rayons': () => {
    const cx = W / 2, top = -140;
    let rays = '';
    for (let i = -6; i <= 6; i++) {
      const a = i * 7.4;                       // écartement angulaire, en degrés
      const spread = 46;                        // largeur du faisceau au sol
      const x = cx + Math.tan((a * Math.PI) / 180) * (H - top);
      const col = i % 2 === 0 ? C.crimson : C.magDim;
      rays += `  <polygon points="${cx},${top} ${x - spread},${H + 40} ${x + spread},${H + 40}" `
        + `fill="${col}" opacity="0.055"/>\n`;
    }
    return svg(
      `    <radialGradient id="top" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="${C.crimson}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${C.crimson}" stop-opacity="0"/>
    </radialGradient>
${vignette('v', 0.66)}`,
      [fill('top'), rays.trimEnd(), fill('v')].join('\n'));
  },

  // Halo rose bas : le plus graphique, pour une annonce à texte court.
  'halo': () => svg(
    `    <radialGradient id="glow" cx="50%" cy="104%" r="72%">
      <stop offset="0%" stop-color="${C.magenta}" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="${C.magDim}" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="${C.magenta}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.6" fill="${C.cream}" opacity="0.05"/>
    </pattern>
${vignette('v', 0.6)}`,
    [fill('glow'), fill('grain'), fill('v')].join('\n')),

  // Braise : que des dégradés, aucune trame. Le plus neutre sous un texte dense.
  'braise': () => svg(
    `    <radialGradient id="floor" cx="50%" cy="108%" r="80%">
      <stop offset="0%" stop-color="${C.crLight}" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="${C.crimson}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${C.crimson}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="corner" cx="88%" cy="-8%" r="58%">
      <stop offset="0%" stop-color="${C.magenta}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${C.magenta}" stop-opacity="0"/>
    </radialGradient>
${vignette('v', 0.55)}`,
    [fill('floor'), fill('corner'), fill('v')].join('\n')),
};

// ── Écriture ─────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [name, make] of Object.entries(BACKGROUNDS)) {
  const file = path.join(OUT, name + '.svg');
  fs.writeFileSync(file, make(), 'utf8');
  console.log('  ✔ ' + path.relative(path.join(__dirname, '..'), file)
    + '  (' + fs.statSync(file).size + ' o)');
  n++;
}
console.log('\n  ' + n + ' fonds STACK générés dans public/backgrounds/stack.');
