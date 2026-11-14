// Génère une page Companion (v4.3, format d'export 12) avec une touche par scène OBS.
//   node outils/make-companion-page.js   →  outils/companion-scenes-obs.companionconfig
// À importer dans Companion : Import / Export > Import > choisir la page de destination,
// puis associer la connexion « obs » du fichier à ta connexion OBS existante.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONN = 'e97bBnCdY4MbGd2RevXtG';          // id de la connexion « obs » de Companion
const OBS_UPGRADE = 8;                           // lastUpgradeIndex du module obs-studio 3.15.3
const rgb = (h) => parseInt(h.replace('#', ''), 16);
const C = { off: rgb('#241019'), on: rgb('#e33bae'), cream: rgb('#f0e6d3'), dark: rgb('#12060e'), panel: rgb('#130f0f'), red: rgb('#d81f26'), muted: rgb('#9a8a94') };
const nid = () => crypto.randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 21);
const opt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, isExpression: false }]));

function style(text, bg, fg, size) {
  return { text, textExpression: false, size: size || 'auto', png64: null, alignment: 'center:center', pngalignment: 'center:center', color: fg, bgcolor: bg, show_topbar: false, png: null, latch: false };
}
function button(text, down, feedbacks, st) {
  return {
    type: 'button',
    style: st || style(text, C.off, C.cream),
    options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false },
    feedbacks: feedbacks || [],
    steps: { 0: { action_sets: { down: down || [], up: [] }, options: { runWhileHeld: [] } } },
    localVariables: [],
  };
}
function action(def, options) { return { type: 'action', id: nid(), definitionId: def, connectionId: CONN, options: opt(options || {}), upgradeIndex: OBS_UPGRADE }; }
function feedback(def, options, st) { return { type: 'feedback', id: nid(), definitionId: def, connectionId: CONN, options: opt(options || {}), isInverted: { value: false, isExpression: false }, style: st, upgradeIndex: OBS_UPGRADE }; }

// Touche de scène : passe la scène à l'antenne, s'allume en rose quand elle y est.
function scene(label, sceneName) {
  return button(label, [action('set_scene', { scene: sceneName, customSceneName: '' })],
    [feedback('sceneProgram', { scene: sceneName }, { bgcolor: C.on, color: C.dark })]);
}

// Grille 8 × 4 (Stream Deck XL) : [ligne][colonne]
const grid = [
  [scene('POV\\nSTATION 01', 'POV - Station 01'), scene('POV\\nSTATION 02', 'POV - Station 02'), scene('POV\\nCASTER', 'POV - Caster'), null,
    scene('CAM\\nSTATION 01', 'CAM - Station 01'), scene('CAM\\nSTATION 02', 'CAM - Station 02')],
  [scene('PICK & BAN\\nSTATION 01', 'Pick & Ban - Station 01'), scene('PICK & BAN\\nSTATION 02', 'Pick & Ban - Station 02'), scene('BRACKET', 'Bracket'), scene('TIMEOUT', 'Timeout')],
  [scene('START', 'Start'), scene('END', 'End')],
  [button('STACK 03\\nOBS', [], [], style('STACK 03\\nOBS', C.panel, C.on, '14')), null, null, null, null,
    // Marqueur de montage : chapitre dans le fichier d'enregistrement (Hybrid MP4), nommé scène + heure.
    // Grisé hors enregistrement (sans effet), doré pendant l'enregistrement.
    button('★\\nMARQUEUR', [action('CreateRecordChapter', { chapterName: '$(obs:scene_active) · $(internal:time_hms)' })],
      [feedback('recording', { bg: rgb('#d4a017'), fg: C.dark, bg_paused: C.panel, fg_paused: C.muted })], style('★\\nMARQUEUR', C.panel, C.muted, '18')),
    // Voyants seulement (aucune action) : un appui ne coupe ni l'enregistrement ni le live.
    button('REC\\n$(obs:recording_timecode)', [], [feedback('recording', { bg: C.red, fg: C.cream, bg_paused: rgb('#d4a017'), fg_paused: C.dark })], style('REC\\n$(obs:recording_timecode)', C.panel, C.muted, '14')),
    button('LIVE\\n$(obs:stream_timecode)', [], [feedback('streaming', {}, { bgcolor: C.red, color: C.cream })], style('LIVE\\n$(obs:stream_timecode)', C.panel, C.muted, '14'))],
];
// Les « \n » des libellés sont des retours à la ligne dans Companion.
const fixNl = (o) => JSON.parse(JSON.stringify(o).replace(/\\\\n/g, '\\n'));

const controls = {};
grid.forEach((row, r) => row.forEach((b, c) => { if (b) (controls[r] = controls[r] || {})[c] = fixNl(b); }));

const out = {
  version: 12,
  type: 'page',
  companionBuild: '4.3.1+9209-stable-bf5535c82b',
  page: { id: nid(), name: 'STACK 03 · OBS', controls, gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 } },
  instances: {
    [CONN]: { moduleInstanceType: 'connection', moduleId: 'obs-studio', moduleVersionId: '3.15.3', updatePolicy: 'stable', sortOrder: 3, label: 'obs', isFirstInit: false, config: { host: '127.0.0.1', port: 4455 }, secrets: {}, lastUpgradeIndex: OBS_UPGRADE, enabled: true },
  },
  oldPageNumber: 12,
};
const file = path.join(__dirname, 'companion-scenes-obs.companionconfig');
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log('Page écrite :', file, '·', Object.values(controls).reduce((n, r) => n + Object.keys(r).length, 0), 'touches');
