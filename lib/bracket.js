'use strict';
// Bracket de tournoi : élimination simple, élimination double, poules (round-robin).
// Un seul tournoi actif à la fois. Persisté dans data/bracket.json.
// Génère un token par équipe (comme lib/veto.js) pour la saisie de score à distance.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'bracket.json');

const FORMATS = ['single', 'double', 'groups'];
const BO_GAMES = { BO1: 1, BO2: 2, BO3: 3, BO5: 5 };
const BO_WINS = { BO1: 1, BO2: null, BO3: 2, BO5: 3 }; // BO2 n'a pas de seuil de victoire naturel

function tok() { return crypto.randomBytes(9).toString('hex'); }
function mid() { return crypto.randomBytes(4).toString('hex'); }

function idle() {
  return { id: null, name: '', format: null, teams: [], groups: [], matches: [], tokens: {} };
}

let state = load();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Object.assign(idle(), j);
  } catch { return idle(); }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch {}
}

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

// Ordre de seeding standard (1 vs dernier, etc.) pour un bracket de taille `size` (puissance de 2).
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    const next = [];
    for (const s of order) next.push(s, len + 1 - s);
    order = next;
  }
  return order;
}

function newMatch({ bracket, round, slot, teamA, teamB, groupId, status }) {
  return {
    id: mid(),
    bracket, round, slot,
    groupId: groupId || null,
    teamA, teamB,           // undefined = pas encore alimenté ; null = alimenté sans équipe (bye)
    bo: 'BO3',
    scoreA: 0, scoreB: 0,
    maps: [],         // [{ scoreA, scoreB, winner }, …] — détail manche par manche
    status: status || 'pending',
    winner: null,
    reported: null,   // { maps, scoreA, scoreB, by } — score soumis par une équipe, en attente de validation
    next: null,       // { matchId, slot } — où avance le vainqueur
    loserNext: null,  // { matchId, slot } — où tombe le perdant (double élim)
    bonusNext: null,  // { matchId, slot } — petite finale / match bonus (n'affecte pas le classement réel)
  };
}

function mById(id) { return state.matches.find(m => m.id === id); }

function placeTeam(ptr, team) {
  if (!ptr) return;
  const dest = mById(ptr.matchId);
  if (!dest) return;
  dest[ptr.slot === 'A' ? 'teamA' : 'teamB'] = team;
  maybeResolve(dest);
}

// Une fois les deux emplacements d'un match connus, détermine s'il est jouable,
// s'il s'agit d'un bye (une seule équipe → victoire auto) ou d'un double bye (aucune équipe → skip).
function maybeResolve(m) {
  if (m.teamA === undefined || m.teamB === undefined) return;
  if (m.status === 'done' || m.status === 'skipped') return;
  if (m.teamA && m.teamB) { m.status = 'ready'; return; }
  if (!m.teamA && !m.teamB) { m.status = 'skipped'; placeTeam(m.next, null); placeTeam(m.loserNext, null); return; }
  finalize(m, m.teamA ? 'A' : 'B');
}

function finalize(m, winnerSide) {
  m.status = 'done';
  m.winner = winnerSide;
  const winningTeam = winnerSide === 'A' ? m.teamA : m.teamB;
  const losingTeam = winnerSide === 'A' ? m.teamB : m.teamA;
  if (m.bracket === 'grand') {
    if (winnerSide === 'B') { // le vainqueur venu du bracket perdants force un reset
      const reset = mById(m.next.matchId);
      reset.teamA = m.teamA; reset.teamB = m.teamB; reset.status = 'ready';
    }
    return;
  }
  placeTeam(m.next, winningTeam);
  placeTeam(m.loserNext, losingTeam);
  placeTeam(m.bonusNext, losingTeam);
}

// ── Génération : élimination simple ──────────────────────────────────────────
function genSingleElim(teamsSeeded, thirdPlace) {
  const size = nextPow2(teamsSeeded.length);
  const order = seedOrder(size);
  const matches = [];
  const wbRounds = [];
  let prevRound = [];
  for (let i = 0; i < size / 2; i++) {
    const seedA = order[2 * i], seedB = order[2 * i + 1];
    const m = newMatch({
      bracket: 'winners', round: 0, slot: i,
      teamA: teamsSeeded[seedA - 1] || null,
      teamB: teamsSeeded[seedB - 1] || null,
    });
    prevRound.push(m);
  }
  matches.push(...prevRound);
  wbRounds.push(prevRound);
  const rounds = Math.log2(size);
  for (let r = 1; r < rounds; r++) {
    const round = [];
    for (let i = 0; i < prevRound.length / 2; i++) round.push(newMatch({ bracket: 'winners', round: r, slot: i }));
    prevRound.forEach((m, i) => { m.next = { matchId: round[Math.floor(i / 2)].id, slot: i % 2 === 0 ? 'A' : 'B' }; });
    matches.push(...round);
    wbRounds.push(round);
    prevRound = round;
  }

  // Petite finale (3e place) : les deux perdants de demi-finale s'affrontent.
  if (thirdPlace && wbRounds.length >= 2) {
    const semis = wbRounds[wbRounds.length - 2];
    if (semis.length === 2) {
      const tp = newMatch({ bracket: 'third-place', round: wbRounds.length - 1, slot: 0 });
      semis[0].bonusNext = { matchId: tp.id, slot: 'A' };
      semis[1].bonusNext = { matchId: tp.id, slot: 'B' };
      matches.push(tp);
    }
  }

  return { matches };
}

// ── Génération : élimination double ──────────────────────────────────────────
function genDoubleElim(teamsSeeded, thirdPlace) {
  const size = nextPow2(teamsSeeded.length);
  if (size < 4) throw new Error('Il faut au moins 3 équipes pour une double élimination');
  const k = Math.log2(size);
  const order = seedOrder(size);
  const matches = [];

  // Winners bracket
  const wbRounds = [];
  let round0 = [];
  for (let i = 0; i < size / 2; i++) {
    const seedA = order[2 * i], seedB = order[2 * i + 1];
    round0.push(newMatch({
      bracket: 'winners', round: 0, slot: i,
      teamA: teamsSeeded[seedA - 1] || null,
      teamB: teamsSeeded[seedB - 1] || null,
    }));
  }
  matches.push(...round0);
  wbRounds.push(round0);
  for (let t = 1; t < k; t++) {
    const prev = wbRounds[t - 1];
    const round = [];
    for (let i = 0; i < prev.length / 2; i++) round.push(newMatch({ bracket: 'winners', round: t, slot: i }));
    prev.forEach((m, i) => { m.next = { matchId: round[Math.floor(i / 2)].id, slot: i % 2 === 0 ? 'A' : 'B' }; });
    matches.push(...round);
    wbRounds.push(round);
  }
  const wbFinal = wbRounds[k - 1][0];

  // Losers bracket : alterne rounds de consolidation (perdants LB entre eux)
  // et rounds de "drop-in" (survivants LB contre perdants fraîchement tombés de WB).
  // `entrants` alimente le round de consolidation suivant : au 1er tour ce sont des matchs du
  // bracket gagnants (on veut leur PERDANT → loserNext), aux tours suivants ce sont des matchs du
  // bracket perdants déjà créés (on veut leur VAINQUEUR qui progresse → next).
  let entrants = wbRounds[0].slice();
  let entrantsAreWB = true;
  let lbRoundNum = 0;
  for (let t = 1; t < k; t++) {
    const consolidate = [];
    for (let i = 0; i < entrants.length / 2; i++) consolidate.push(newMatch({ bracket: 'losers', round: lbRoundNum, slot: i }));
    entrants.forEach((src, i) => {
      const ptr = { matchId: consolidate[Math.floor(i / 2)].id, slot: i % 2 === 0 ? 'A' : 'B' };
      if (entrantsAreWB) src.loserNext = ptr; else src.next = ptr;
    });
    matches.push(...consolidate);
    lbRoundNum++;

    const wbLosers = wbRounds[t];
    const dropin = [];
    for (let i = 0; i < consolidate.length; i++) dropin.push(newMatch({ bracket: 'losers', round: lbRoundNum, slot: i }));
    consolidate.forEach((m, i) => { m.next = { matchId: dropin[i].id, slot: 'A' }; });
    wbLosers.forEach((m, i) => { m.loserNext = { matchId: dropin[i].id, slot: 'B' }; });
    matches.push(...dropin);
    lbRoundNum++;
    entrants = dropin;
    entrantsAreWB = false;
  }
  const lbFinal = entrants[0];

  // Grande finale (+ match de reset si l'équipe venue du bracket perdants gagne la 1ère manche)
  const grand = newMatch({ bracket: 'grand', round: 0, slot: 0 });
  const reset = newMatch({ bracket: 'grand-reset', round: 0, slot: 0, status: 'skipped' });
  wbFinal.next = { matchId: grand.id, slot: 'A' };
  lbFinal.next = { matchId: grand.id, slot: 'B' };
  grand.next = { matchId: reset.id, slot: null };
  matches.push(grand, reset);

  // Petite finale bonus (facultative) : les deux perdants de demi-finale du bracket gagnants
  // s'affrontent pour le plaisir. Ne change rien au classement réel (déjà fixé par le bracket perdants).
  if (thirdPlace && wbRounds.length >= 2) {
    const semis = wbRounds[wbRounds.length - 2];
    if (semis.length === 2) {
      const bonus = newMatch({ bracket: 'bonus', round: 0, slot: 0 });
      semis[0].bonusNext = { matchId: bonus.id, slot: 'A' };
      semis[1].bonusNext = { matchId: bonus.id, slot: 'B' };
      matches.push(bonus);
    }
  }

  return { matches };
}

// ── Génération : poules (round-robin), répartition en "snake" pour équilibrer les têtes de série ──
function snakeIndex(n, groupCount) {
  const idx = [];
  let g = 0, dir = 1;
  for (let i = 0; i < n; i++) {
    idx.push(g);
    g += dir;
    if (g === groupCount) { g = groupCount - 1; dir = -1; }
    else if (g === -1) { g = 0; dir = 1; }
  }
  return idx;
}

function genGroups(teamsSeeded, groupCount, groupOf) {
  groupCount = Math.max(1, Math.min(teamsSeeded.length, parseInt(groupCount, 10) || 1));
  const snake = snakeIndex(teamsSeeded.length, groupCount);
  // "Poule A/B/…" n'a de sens que s'il y en a plusieurs ; à poule unique, un nom générique.
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    id: 'G' + (i + 1),
    name: groupCount === 1 ? 'Phase de poule' : 'Poule ' + String.fromCharCode(65 + i),
    teamIds: [],
  }));
  teamsSeeded.forEach((t, i) => {
    let gi = snake[i];
    if (groupOf && groupOf[t.id] !== undefined) {
      const forced = parseInt(groupOf[t.id], 10);
      if (forced >= 0 && forced < groupCount) gi = forced;
    }
    groups[gi].teamIds.push(t.id);
  });
  const teamById = new Map(teamsSeeded.map(t => [t.id, t]));
  const matches = [];
  groups.forEach(g => {
    for (let i = 0; i < g.teamIds.length; i++) {
      for (let j = i + 1; j < g.teamIds.length; j++) {
        matches.push(newMatch({
          bracket: 'group', groupId: g.id, round: 0, slot: matches.length,
          teamA: teamById.get(g.teamIds[i]), teamB: teamById.get(g.teamIds[j]),
          status: 'ready',
        }));
      }
    }
  });
  return { matches, groups };
}

// ── API publique ──────────────────────────────────────────────────────────────

function generate({ name, format, teamIds, groupCount, groupOf, thirdPlace }, teamsLib) {
  if (!FORMATS.includes(format)) throw new Error('Format invalide');
  if (!Array.isArray(teamIds) || teamIds.length < 2) throw new Error('Il faut au moins 2 équipes');
  const byId = new Map((teamsLib || []).map(t => [t.id, t]));
  const teamsSeeded = teamIds.map(id => {
    const t = byId.get(id);
    if (!t) throw new Error('Équipe introuvable : ' + id);
    return { id: t.id, name: t.name, color: t.color };
  });

  let built;
  if (format === 'single') built = genSingleElim(teamsSeeded, !!thirdPlace);
  else if (format === 'double') built = genDoubleElim(teamsSeeded, !!thirdPlace);
  else built = genGroups(teamsSeeded, groupCount, groupOf);

  const tokens = {};
  teamsSeeded.forEach(t => { tokens[t.id] = tok(); });

  state = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(name || 'Tournoi').slice(0, 60),
    format,
    teams: teamsSeeded,
    groups: built.groups || [],
    matches: built.matches,
    tokens,
  };

  // Résout les byes en cascade à partir du premier tour du bracket gagnants.
  state.matches.filter(m => m.bracket === 'winners' && m.round === 0).forEach(maybeResolve);

  save();
  return state;
}

function reset() { state = idle(); save(); return state; }

function get() { return state; }

function publicState() {
  const { tokens, ...rest } = state;
  return { ...rest, groupsStandings: state.format === 'groups' ? state.groups.map(g => ({ ...g, standings: standings(g.id) })) : [] };
}

function getTokens() { return state.tokens; }

function teamOfToken(token) {
  if (!token) return null;
  const entry = Object.entries(state.tokens || {}).find(([, t]) => t === token);
  return entry ? entry[0] : null;
}

function teamInfo(teamId) { return state.teams.find(t => t.id === teamId); }

function teamMatches(teamId) {
  return state.matches.filter(m => (m.teamA && m.teamA.id === teamId) || (m.teamB && m.teamB.id === teamId));
}

function standings(groupId) {
  const g = state.groups.find(x => x.id === groupId);
  if (!g) return [];
  const rows = new Map();
  g.teamIds.forEach(id => { const t = teamInfo(id); if (t) rows.set(id, { team: t, wins: 0, losses: 0, diff: 0, played: 0 }); });
  state.matches.filter(m => m.bracket === 'group' && m.groupId === groupId && m.status === 'done').forEach(m => {
    const a = rows.get(m.teamA.id), b = rows.get(m.teamB.id);
    if (!a || !b) return;
    a.played++; b.played++;
    a.diff += m.scoreA - m.scoreB; b.diff += m.scoreB - m.scoreA;
    if (m.winner === 'A') { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  });
  return [...rows.values()].sort((x, y) => y.wins - x.wins || y.diff - x.diff || x.team.name.localeCompare(y.team.name));
}

// Valide le détail manche par manche d'un match et en déduit le score de série.
// `maps` : [{ scoreA, scoreB }, …] — un élément par map jouée, dans l'ordre.
function validateMaps(m, maps) {
  if (!Array.isArray(maps) || !maps.length) throw new Error('Au moins une map est requise');
  const games = BO_GAMES[m.bo];
  if (maps.length > games) throw new Error('Trop de maps pour ' + m.bo + ' (' + games + ' max)');
  const clean = maps.map((mp, i) => {
    const a = parseInt(mp && mp.scoreA, 10), b = parseInt(mp && mp.scoreB, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw new Error('Score invalide (map ' + (i + 1) + ')');
    if (a === b) throw new Error('Une map ne peut pas se terminer à égalité (map ' + (i + 1) + ')');
    return { scoreA: a, scoreB: b, winner: a > b ? 'A' : 'B' };
  });
  const wins = BO_WINS[m.bo];
  let a = 0, b = 0;
  clean.forEach((mp, i) => {
    if (wins && (a === wins || b === wins)) throw new Error('La série était déjà terminée avant la map ' + (i + 1));
    if (mp.winner === 'A') a++; else b++;
  });
  if (wins) { if (a !== wins && b !== wins) throw new Error('La série doit atteindre ' + wins + ' victoires (' + m.bo + ')'); }
  else if (clean.length !== games) throw new Error('Les ' + games + ' maps doivent être jouées (' + m.bo + ')');
  return { maps: clean, scoreA: a, scoreB: b };
}

function decideWinner(m, a, b, winnerOverride) {
  const wins = BO_WINS[m.bo];
  if (wins) return a === wins ? 'A' : 'B';
  if (a === b) {
    if (winnerOverride !== 'A' && winnerOverride !== 'B') throw new Error('Égalité en ' + m.bo + ' : choisis le vainqueur');
    return winnerOverride;
  }
  return a > b ? 'A' : 'B';
}

// Soumission par une équipe via son token : passe le match en attente de validation.
// `maps` : [{ scoreA, scoreB }, …] — le détail manche par manche saisi par l'équipe.
function report(token, matchId, maps) {
  const teamId = teamOfToken(token);
  if (!teamId) throw new Error('Token invalide');
  const m = mById(matchId);
  if (!m) throw new Error('Match introuvable');
  if (m.status !== 'ready') throw new Error("Ce match n'est pas en attente de score");
  const inMatch = (m.teamA && m.teamA.id === teamId) || (m.teamB && m.teamB.id === teamId);
  if (!inMatch) throw new Error("Cette équipe ne participe pas à ce match");
  const clean = validateMaps(m, maps);
  m.reported = { ...clean, by: m.teamA.id === teamId ? 'A' : 'B' };
  m.status = 'reported';
  save();
  return state;
}

// Validation par la régie : applique le score reporté (détail des maps inclus) et fait avancer le bracket.
function confirm(matchId, winnerOverride) {
  const m = mById(matchId);
  if (!m || m.status !== 'reported') throw new Error('Aucun score en attente pour ce match');
  const { maps, scoreA, scoreB } = m.reported;
  const winnerSide = decideWinner(m, scoreA, scoreB, winnerOverride);
  m.maps = maps; m.scoreA = scoreA; m.scoreB = scoreB;
  m.reported = null;
  finalize(m, winnerSide);
  save();
  return state;
}

function reject(matchId) {
  const m = mById(matchId);
  if (!m || m.status !== 'reported') throw new Error('Aucun score en attente pour ce match');
  m.reported = null;
  m.status = 'ready';
  save();
  return state;
}

// Saisie directe par la régie (immédiate, sans file d'attente). Même détail manche par manche que report().
function adminSetScore(matchId, maps, winnerOverride) {
  const m = mById(matchId);
  if (!m) throw new Error('Match introuvable');
  if (m.status !== 'ready' && m.status !== 'reported') throw new Error('Ce match ne peut pas recevoir de score');
  const clean = validateMaps(m, maps);
  const winnerSide = decideWinner(m, clean.scoreA, clean.scoreB, winnerOverride);
  m.maps = clean.maps; m.scoreA = clean.scoreA; m.scoreB = clean.scoreB;
  m.reported = null;
  finalize(m, winnerSide);
  save();
  return state;
}

function setFormat({ round, bracket, matchId, bo }) {
  if (!BO_GAMES[bo]) throw new Error('Format invalide');
  if (matchId) {
    const m = mById(matchId);
    if (!m) throw new Error('Match introuvable');
    if (m.status === 'done') throw new Error('Ce match est déjà joué');
    m.bo = bo;
  } else if (round !== undefined && round !== null) {
    state.matches
      .filter(m => m.round === round && (!bracket || m.bracket === bracket) && m.status !== 'done' && m.status !== 'skipped')
      .forEach(m => { m.bo = bo; });
  } else {
    throw new Error('round ou matchId requis');
  }
  save();
  return state;
}

module.exports = {
  generate, reset, get, publicState, getTokens, teamOfToken, teamInfo, teamMatches,
  report, confirm, reject, adminSetScore, setFormat, standings,
  FORMATS, BO_GAMES, BO_WINS,
};
