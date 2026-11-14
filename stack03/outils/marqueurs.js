// Liste les marqueurs (chapitres) d'un enregistrement OBS, posés avec la touche ★ MARQUEUR de Companion.
//   node outils/marqueurs.js "C:\Users\PC Régie\Videos\2026-10-18 14-00-00.mp4"
// Écrit à côté de la vidéo :
//   <vidéo>.marqueurs.csv        timecode, secondes, nom  (pour le montage)
//   <vidéo>.chapitres-youtube.txt  00:00 Début / 12:34 POV - Station 01…  (description YouTube)
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Usage : node outils/marqueurs.js <enregistrement.mp4>'); process.exit(1); }

let out;
try { out = execFileSync('ffprobe', ['-v', 'error', '-show_chapters', '-of', 'json', file], { encoding: 'utf8' }); }
catch (e) { console.error('ffprobe introuvable ou fichier illisible : ' + e.message); process.exit(1); }

const pad = (n, w) => String(n).padStart(w || 2, '0');
const tc = (s) => pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(Math.floor(s % 60)) + '.' + pad(Math.round(s % 1 * 1000), 3);
const yt = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + pad(Math.floor(s % 60));

// Le premier chapitre (« Démarrer ») est créé par OBS au début : ce n'est pas un marqueur.
const ch = (JSON.parse(out).chapters || []).map((c) => ({ t: parseFloat(c.start_time), name: (c.tags && c.tags.title) || '' }));
const marks = ch.filter((c, i) => !(i === 0 && c.t === 0));
if (!marks.length) { console.log('Aucun marqueur dans ce fichier.'); process.exit(0); }

const csv = 'timecode;secondes;nom\n' + marks.map((m) => tc(m.t) + ';' + m.t.toFixed(3) + ';' + m.name.replace(/;/g, ',')).join('\n') + '\n';
const ytTxt = '0:00 Début\n' + marks.map((m) => yt(m.t) + ' ' + m.name).join('\n') + '\n';
fs.writeFileSync(file + '.marqueurs.csv', '\ufeff' + csv);
fs.writeFileSync(file + '.chapitres-youtube.txt', ytTxt);

console.log(marks.length + ' marqueur(s) :');
marks.forEach((m) => console.log('  ' + tc(m.t) + '  ' + m.name));
console.log('\nÉcrit : ' + file + '.marqueurs.csv');
console.log('        ' + file + '.chapitres-youtube.txt');
