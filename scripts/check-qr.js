'use strict';
// Valide public/qr.js contre segno (implémentation de référence), module par
// module. Écrit les cas de test en JSON, lance la référence Python, compare.
//
//   python -m pip install segno
//   node scripts/check-qr.js
//
// Couvre : les 4 niveaux de correction, les 8 masques forcés, des tailles de
// données qui balaient les 40 versions, et le masque choisi automatiquement.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const QR = require('../public/qr.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qrcheck-'));
const PY = path.join(TMP, 'ref.py');
const CASES = path.join(TMP, 'cases.json');
const OUT = path.join(TMP, 'ref.json');

// ── Cas de test ──────────────────────────────────────────────────────────────
const cases = [];
const texts = [
  'https://www.lstournament.com/stack.html',
  'https://teamls4b.fr',
  'A',
  'https://exemple.fr/inscription?tournoi=stack&edition=1&equipe=les-bg#formulaire',
];
for (const text of texts) {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    for (let mask = 0; mask < 8; mask++) cases.push({ text, ecl, mask });
    cases.push({ text, ecl, mask: null }); // masque choisi par les pénalités
  }
}
// Balayage des versions : on allonge le texte pour forcer chaque version.
for (let ver = 1; ver <= 40; ver++) {
  for (const ecl of ['L', 'H']) {
    const n = QR.capacityBytes(ver, ecl);
    if (n <= 0) continue;
    cases.push({ text: 'x'.repeat(n), ecl, mask: null });
  }
}

fs.writeFileSync(CASES, JSON.stringify(cases));

fs.writeFileSync(PY, `# -*- coding: utf-8 -*-
import json, sys, segno
cases = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for c in cases:
    kw = dict(error=c['ecl'], mode='byte', boost_error=False, micro=False)
    if c['mask'] is not None:
        kw['mask'] = c['mask']
    q = segno.make(c['text'], **kw)
    m = [''.join('1' if v else '0' for v in row) for row in q.matrix]
    out.append({'rows': m, 'version': q.version, 'mask': q.mask})
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
`);

execFileSync('python', [PY, CASES, OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
const ref = JSON.parse(fs.readFileSync(OUT, 'utf8'));

// ── Comparaison ──────────────────────────────────────────────────────────────
let ok = 0;
const fails = [];
cases.forEach((c, i) => {
  const r = ref[i];
  let mine;
  try {
    mine = QR.encode(c.text, c.ecl, c.mask);
  } catch (e) {
    fails.push({ c, why: 'exception : ' + e.message });
    return;
  }

  if (mine.version !== r.version) {
    fails.push({ c, why: 'version ' + mine.version + ' vs ' + r.version });
    return;
  }
  if (mine.mask !== r.mask) {
    fails.push({ c, why: 'masque ' + mine.mask + ' vs ' + r.mask });
    return;
  }
  if (mine.size !== r.rows.length) {
    fails.push({ c, why: 'taille ' + mine.size + ' vs ' + r.rows.length });
    return;
  }
  for (let y = 0; y < mine.size; y++) {
    for (let x = 0; x < mine.size; x++) {
      const a = mine.modules[y * mine.size + x];
      const b = r.rows[y][x] === '1' ? 1 : 0;
      if (a !== b) {
        fails.push({ c, why: 'module différent en (' + x + ',' + y + ') v' + r.version });
        return;
      }
    }
  }
  ok++;
});

fs.rmSync(TMP, { recursive: true, force: true });

console.log('  cas comparés : ' + cases.length);
console.log('  identiques   : ' + ok);
if (fails.length) {
  console.log('  ÉCHECS       : ' + fails.length);
  fails.slice(0, 12).forEach((f) => {
    const t = f.c.text.length > 28 ? f.c.text.slice(0, 28) + '…(' + f.c.text.length + ')' : f.c.text;
    console.log('    · ' + f.c.ecl + ' masque=' + f.c.mask + ' « ' + t + ' » → ' + f.why);
  });
  process.exit(1);
}
console.log('\n  OK — matrices identiques à segno sur tous les cas.');
