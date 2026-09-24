'use strict';
// qr.js — Encodeur QR autonome (mode octet), sans aucune dépendance réseau :
// la régie doit fonctionner hors-ligne. Rend une matrice de modules ; le tracé
// (couleurs, marge, taille) est à la charge de l'appelant.
//
//   QR.encode('https://exemple.fr', 'M')
//     → { version, size, ecl, mask, modules: Uint8Array(size*size) }  // 0 = clair, 1 = foncé
//
// ⚠ TRAVAIL EN COURS — NE PAS UTILISER EN L'ÉTAT, ce fichier n'est encore
// branché nulle part. `scripts/check-qr.js` le compare à segno (implémentation
// de référence) : l'encodage, la correction d'erreur et l'entrelacement sont
// vérifiés identiques, mais le tracé de la matrice diverge encore dans la zone
// de données. Reprendre le diagnostic avant de s'en servir.

(function (root) {

  // ── Corps de Galois GF(256), polynôme primitif 0x11D ────────────────────────
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  // Polynôme générateur de degré n : produit des (x − α^i), i de 0 à n−1.
  function rsGenerator(n) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < n; i++) {
      const ng = new Uint8Array(g.length + 1);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gmul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }

  // Reste de la division du message par le générateur = codets de correction.
  function rsRemainder(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (let i = 0; i < data.length; i++) {
      const c = buf[i];
      if (c === 0) continue;
      for (let j = 0; j < gen.length; j++) buf[i + j] ^= gmul(gen[j], c);
    }
    return buf.slice(data.length);
  }

  // ── Tables normatives (index 0 inutilisé, versions 1 à 40) ──────────────────
  const ECL = ['L', 'M', 'Q', 'H'];
  // Bits d'indicateur du niveau de correction dans l'information de format.
  const ECL_FORMAT = [1, 0, 3, 2];

  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 57, 60, 63, 66, 70, 74, 77, 81, 85],
  ];

  const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  // Nombre de modules disponibles pour les données, motifs fonctionnels déduits.
  function rawDataModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      n -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }
  const totalCodewords = (ver) => Math.floor(rawDataModules(ver) / 8);
  const dataCodewords = (ver, ecl) =>
    totalCodewords(ver) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const size = ver * 4 + 17;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < numAlign; p -= step) pos.splice(1, 0, p);
    return pos;
  }

  const getBit = (v, i) => ((v >>> i) & 1) !== 0;

  // ── Construction de la matrice ──────────────────────────────────────────────
  function buildMatrix(ver, ecl, codewords, forceMask) {
    const size = ver * 4 + 17;
    const mods = new Uint8Array(size * size);
    const fn = new Uint8Array(size * size); // 1 = module fonctionnel, non masquable
    const at = (x, y) => y * size + x;
    const setFn = (x, y, dark) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      mods[at(x, y)] = dark ? 1 : 0;
      fn[at(x, y)] = 1;
    };

    // Motifs de repérage et leurs séparateurs
    function finder(cx, cy) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(cx + dx, cy + dy, d !== 2 && d !== 4);
        }
      }
    }
    // Motifs de synchronisation
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    // Motifs d'alignement, sauf aux trois coins occupés par les repères
    const ap = alignmentPositions(ver);
    for (let i = 0; i < ap.length; i++) {
      for (let j = 0; j < ap.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    function drawFormat(mask) {
      const data = (ECL_FORMAT[ecl] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
      setFn(8, 7, getBit(bits, 6));
      setFn(8, 8, getBit(bits, 7));
      setFn(7, 8, getBit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
      setFn(8, size - 8, true); // module toujours foncé
    }

    function drawVersion() {
      if (ver < 7) return;
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = getBit(bits, i);
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(a, b, bit);
        setFn(b, a, bit);
      }
    }

    drawFormat(0); // provisoire, réécrit une fois le masque choisi
    drawVersion();

    // Données en zigzag, colonnes par deux, de bas à droite vers le haut à gauche
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // la colonne 6 est un motif de synchronisation
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[at(x, y)] && bi < codewords.length * 8) {
            mods[at(x, y)] = getBit(codewords[bi >>> 3], 7 - (bi & 7)) ? 1 : 0;
            bi++;
          }
        }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    function applyMask(m) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!fn[at(x, y)] && MASKS[m](x, y)) mods[at(x, y)] ^= 1;
        }
      }
    }

    // ── Pénalités : on retient le masque au score le plus bas ─────────────────
    const dark = (x, y) => mods[at(x, y)] === 1;

    function finderAddHistory(run, hist) {
      if (hist[0] === 0) run += size; // bordure claire virtuelle avant le premier segment
      hist.pop();
      hist.unshift(run);
    }
    function finderCount(hist) {
      const n = hist[1];
      const core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
      return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0)
        + (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
    }
    function finderTerminate(runColor, run, hist) {
      if (runColor) { finderAddHistory(run, hist); run = 0; }
      run += size; // bordure claire virtuelle après le dernier segment
      finderAddHistory(run, hist);
      return finderCount(hist);
    }

    function penalty() {
      let score = 0;
      for (let y = 0; y < size; y++) {
        let color = false, run = 0;
        const hist = [0, 0, 0, 0, 0, 0, 0];
        for (let x = 0; x < size; x++) {
          if (dark(x, y) === color) {
            run++;
            if (run === 5) score += PENALTY_N1; else if (run > 5) score++;
          } else {
            finderAddHistory(run, hist);
            if (!color) score += finderCount(hist) * PENALTY_N3;
            color = dark(x, y);
            run = 1;
          }
        }
        score += finderTerminate(color, run, hist) * PENALTY_N3;
      }
      for (let x = 0; x < size; x++) {
        let color = false, run = 0;
        const hist = [0, 0, 0, 0, 0, 0, 0];
        for (let y = 0; y < size; y++) {
          if (dark(x, y) === color) {
            run++;
            if (run === 5) score += PENALTY_N1; else if (run > 5) score++;
          } else {
            finderAddHistory(run, hist);
            if (!color) score += finderCount(hist) * PENALTY_N3;
            color = dark(x, y);
            run = 1;
          }
        }
        score += finderTerminate(color, run, hist) * PENALTY_N3;
      }
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const c = dark(x, y);
          if (c === dark(x + 1, y) && c === dark(x, y + 1) && c === dark(x + 1, y + 1)) score += PENALTY_N2;
        }
      }
      let n = 0;
      for (let i = 0; i < mods.length; i++) n += mods[i];
      const total = size * size;
      score += (Math.ceil(Math.abs(n * 20 - total * 10) / total) - 1) * PENALTY_N4;
      return score;
    }

    let best = forceMask !== undefined && forceMask !== null ? forceMask : -1;
    if (best < 0) {
      let min = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        const p = penalty();
        if (p < min) { min = p; best = m; }
        applyMask(m); // annule le masque (XOR involutif)
      }
    }
    applyMask(best);
    drawFormat(best);
    return { size, modules: mods, mask: best, fn };
  }

  // ── Encodage ────────────────────────────────────────────────────────────────
  function toBytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    return Uint8Array.from(Buffer.from(text, 'utf8'));
  }

  const charCountBits = (ver) => (ver <= 9 ? 8 : 16);

  function encode(text, eclName, forceMask) {
    const ecl = ECL.indexOf(String(eclName || 'M').toUpperCase());
    if (ecl < 0) throw new Error('Niveau de correction inconnu : ' + eclName);
    const bytes = toBytes(text);

    let ver = 0;
    for (let v = 1; v <= 40; v++) {
      const cap = dataCodewords(v, ecl) * 8;
      if (4 + charCountBits(v) + bytes.length * 8 <= cap) { ver = v; break; }
    }
    if (!ver) throw new Error('Texte trop long pour un QR code (' + bytes.length + ' octets)');

    // Flux de bits : indicateur de mode, longueur, données, terminateur, bourrage
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, charCountBits(ver));
    bytes.forEach((b) => push(b, 8));

    const capacity = dataCodewords(ver, ecl) * 8;
    push(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const data = new Uint8Array(capacity / 8);
    for (let i = 0; i < bits.length; i++) data[i >>> 3] |= bits[i] << (7 - (i & 7));
    for (let i = bits.length / 8, pad = 0xec; i < data.length; i++, pad ^= 0xec ^ 0x11) data[i] = pad;

    // Découpage en blocs, correction d'erreur, puis entrelacement
    const numBlocks = NUM_BLOCKS[ecl][ver];
    const ecLen = ECC_PER_BLOCK[ecl][ver];
    const raw = totalCodewords(ver);
    const shortLen = Math.floor(raw / numBlocks);
    const numShort = numBlocks - (raw % numBlocks);

    const dataBlocks = [], ecBlocks = [];
    for (let i = 0, off = 0; i < numBlocks; i++) {
      const len = shortLen - ecLen + (i < numShort ? 0 : 1);
      const blk = data.slice(off, off + len);
      off += len;
      dataBlocks.push(blk);
      ecBlocks.push(rsRemainder(blk, ecLen));
    }

    const out = new Uint8Array(raw);
    let k = 0;
    const maxData = shortLen - ecLen + 1;
    for (let i = 0; i < maxData; i++) {
      for (let b = 0; b < numBlocks; b++) if (i < dataBlocks[b].length) out[k++] = dataBlocks[b][i];
    }
    for (let i = 0; i < ecLen; i++) {
      for (let b = 0; b < numBlocks; b++) out[k++] = ecBlocks[b][i];
    }

    const m = buildMatrix(ver, ecl, out, forceMask);
    // `codewords` est exposé pour les tests : il permet de comparer l'encodage
    // et la correction d'erreur indépendamment du tracé de la matrice.
    return { version: ver, size: m.size, ecl: ECL[ecl], mask: m.mask, modules: m.modules, codewords: out, fn: m.fn };
  }

  // Nombre d'octets encodables pour une version et un niveau donnés.
  function capacityBytes(ver, eclName) {
    const ecl = ECL.indexOf(String(eclName).toUpperCase());
    return Math.floor((dataCodewords(ver, ecl) * 8 - 4 - charCountBits(ver)) / 8);
  }

  const QR = { encode, capacityBytes, LEVELS: ECL };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;
  else root.QR = QR;

})(typeof self !== 'undefined' ? self : this);
