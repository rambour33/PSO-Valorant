'use strict';
// Thème global : variables CSS (--pso-*) + polices + particules, appliqué à TOUS
// les overlays/pages via /theme.js. Persisté dans data/theme.json.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'theme.json');

const THEMES = {
  valorant: {
    name: 'Valorant',
    fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    vars: {
      '--pso-bg': '#0F1923', '--pso-surface': '#1B262F', '--pso-surface-2': '#23323C',
      '--pso-border': '#37454F', '--pso-text': '#ECE8E1', '--pso-muted': '#7E8C8A',
      '--pso-accent': '#FF4655', '--pso-accent-contrast': '#FFFFFF', '--pso-accent-2': '#00C8C8',
      '--pso-gold': '#E8B330', '--pso-danger': '#FF4655', '--pso-radius': '3px',
      '--pso-font-head': "'Teko', 'Anton', 'Oswald', sans-serif", '--pso-font-body': "'Inter', system-ui, sans-serif",
    },
    particles: { type: 'dust', count: 24, opacity: 0.22, colors: ['#FF4655', '#00C8C8', '#ECE8E1'] },
  },

  qg: {
    name: 'Quartier Général',
    fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    vars: {
      '--pso-bg': '#ECE8E2', '--pso-surface': '#FFFFFF', '--pso-surface-2': '#F1ECE5',
      '--pso-border': '#D5CEC4', '--pso-text': '#1C1714', '--pso-muted': '#6F6862',
      '--pso-accent': '#A4282E', '--pso-accent-contrast': '#FFFFFF', '--pso-accent-2': '#E8B330',
      '--pso-gold': '#E8B330', '--pso-danger': '#A4282E', '--pso-radius': '2px',
      '--pso-font-head': "'Teko', 'Anton', 'Oswald', sans-serif", '--pso-font-body': "'Inter', system-ui, sans-serif",
    },
    particles: { type: 'dust', count: 30, opacity: 0.26, colors: ['#A4282E', '#3A3633', '#8A827A'] },
  },

  'qg-dark': {
    name: 'Quartier Général (sombre)',
    fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    vars: {
      '--pso-bg': '#141110', '--pso-surface': '#1C1815', '--pso-surface-2': '#251F1B',
      '--pso-border': '#3A322C', '--pso-text': '#ECE6DF', '--pso-muted': '#8C8079',
      '--pso-accent': '#A4282E', '--pso-accent-contrast': '#FFFFFF', '--pso-accent-2': '#E8B330',
      '--pso-gold': '#E8B330', '--pso-danger': '#A4282E', '--pso-radius': '2px',
      '--pso-font-head': "'Teko', 'Anton', 'Oswald', sans-serif", '--pso-font-body': "'Inter', system-ui, sans-serif",
    },
    particles: { type: 'dust', count: 30, opacity: 0.3, colors: ['#A4282E', '#E8B330', '#6E645C'] },
  },

  championship: {
    name: 'QG Championship',
    fonts: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap',
    vars: {
      '--pso-bg': '#080608', '--pso-surface': '#100E10', '--pso-surface-2': '#161416',
      '--pso-border': '#242024', '--pso-text': '#F0E6D3', '--pso-muted': '#5A505A',
      '--pso-accent': '#FFD600', '--pso-accent-contrast': '#0A0A06', '--pso-accent-2': '#CDB078',
      '--pso-gold': '#FFD600', '--pso-danger': '#F87171', '--pso-radius': '3px',
      '--pso-font-head': "'Bebas Neue', 'Oswald', sans-serif", '--pso-font-body': "'Rajdhani', system-ui, sans-serif",
    },
    particles: { type: 'dust', count: 22, opacity: 0.16, colors: ['#FFD600', '#F0E6D3', '#5A505A'] },
  },

  // Design du pack OBS Stack 03 (dossier stack03/) : mêmes couleurs, même police
  // Rajdhani locale. Les overlays ont un habillage dédié sous ce thème
  // ([data-pso-theme="stack"] + /stack-skin.css).
  stack: {
    name: 'STACK 03',
    fonts: '/stack03/css/fonts.css',
    vars: {
      '--pso-bg': '#0c0a0a', '--pso-surface': '#130f0f', '--pso-surface-2': '#1a1212',
      '--pso-border': '#2a1c24', '--pso-text': '#f0e6d3', '--pso-muted': '#9a8a94',
      '--pso-accent': '#e33bae', '--pso-accent-contrast': '#12060e', '--pso-accent-2': '#9c2b78',
      '--pso-gold': '#f0e6d3', '--pso-danger': '#f87171', '--pso-radius': '0px',
      '--pso-font-head': "'Rajdhani', 'Oswald', sans-serif", '--pso-font-body': "'Rajdhani', system-ui, sans-serif",
    },
    particles: null,
  },

  ls4b: {
    name: 'Team LS4B',
    fonts: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap',
    vars: {
      '--pso-bg': '#09090B', '--pso-surface': '#18181B', '--pso-surface-2': '#27272A',
      '--pso-border': '#3F3F46', '--pso-text': '#FAFAFA', '--pso-muted': '#9F9FA9',
      '--pso-accent': '#FB4259', '--pso-accent-contrast': '#FFFFFF', '--pso-accent-2': '#FF6568',
      '--pso-gold': '#FCBB00', '--pso-danger': '#E40014', '--pso-radius': '0px',
      '--pso-font-head': "'Geist', 'Oswald', system-ui, sans-serif", '--pso-font-body': "'Geist', system-ui, sans-serif",
    },
    particles: { type: 'dust', count: 22, opacity: 0.2, colors: ['#FB4259', '#FCBB00', '#FAFAFA'] },
  },

  camouflage: {
    name: 'Camouflage',
    fonts: 'https://fonts.googleapis.com/css2?family=Saira+Stencil+One&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    vars: {
      '--pso-bg': '#1A2014', '--pso-surface': '#26301B', '--pso-surface-2': '#323D24',
      '--pso-border': '#46532F', '--pso-text': '#E7E3CF', '--pso-muted': '#8E9670',
      '--pso-accent': '#8A9A4B', '--pso-accent-contrast': '#14180B', '--pso-accent-2': '#B7A463',
      '--pso-gold': '#C7B15A', '--pso-danger': '#A8532E', '--pso-radius': '2px',
      '--pso-font-head': "'Teko', 'Saira Stencil One', 'Oswald', sans-serif", '--pso-font-body': "'Inter', system-ui, sans-serif",
    },
    particles: { type: 'drift', count: 26, opacity: 0.5, colors: ['#3A4A28', '#566B33', '#6E7A3A', '#7C8A3F', '#48562F'] },
  },

  nightvision: {
    name: 'Vision nocturne',
    fonts: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oswald:wght@500;600;700&display=swap',
    vars: {
      '--pso-bg': '#03160B', '--pso-surface': '#06210F', '--pso-surface-2': '#0A3017',
      '--pso-border': '#155026', '--pso-text': '#6CFF97', '--pso-muted': '#3E9A5C',
      '--pso-accent': '#00FF66', '--pso-accent-contrast': '#00220D', '--pso-accent-2': '#33FF99',
      '--pso-gold': '#9DFF5B', '--pso-danger': '#FF5C5C', '--pso-radius': '2px',
      '--pso-font-head': "'Teko', 'Share Tech Mono', monospace", '--pso-font-body': "'Share Tech Mono', monospace",
    },
    particles: { type: 'grain', count: 64, opacity: 0.5, colors: ['#00FF66', '#33FF99', '#0AFF55'] },
  },
};

const DEFAULT = 'valorant';
let active = DEFAULT;

(function load() {
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && THEMES[j.active]) active = j.active; } catch {}
})();

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ active }, null, 2)); } catch {}
}

function list() {
  return Object.entries(THEMES).map(([id, t]) => ({
    id, name: t.name, accent: t.vars['--pso-accent'], bg: t.vars['--pso-bg'], text: t.vars['--pso-text'],
  }));
}

function get() {
  const t = THEMES[active] || THEMES[DEFAULT];
  return { active, name: t.name, vars: t.vars, fonts: t.fonts, particles: t.particles || null };
}

function set(id) {
  if (!THEMES[id]) throw new Error('Thème inconnu : ' + id);
  active = id; save();
  return get();
}

module.exports = { list, get, set, THEMES };
