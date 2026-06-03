'use strict';
// Système de veto (pick/ban) de maps Valorant — BO1 / BO3 / BO5.
// État en mémoire (un veto à la fois). Génère la séquence standard et un
// token par équipe pour piloter le veto à distance sur le réseau local.

const crypto = require('crypto');

const SIDES = ['attack', 'defense'];

function tok() { return crypto.randomBytes(9).toString('hex'); }
function other(t) { return t === 1 ? 2 : 1; }

let state = idle();

function idle() {
  return {
    status: 'idle',
    format: 'BO3',
    firstTeam: 1,
    teams: { 1: { name: 'TEAM A', color: '#FF4655' }, 2: { name: 'TEAM B', color: '#00C8C8' } },
    maps: [],            // { slug, name, status, by, side, sideBy }
    sequence: [],        // { action:'ban'|'pick'|'side', team }
    stepIndex: 0,
    pendingSideMap: null,
    tokens: { 1: null, 2: null },
    log: [],
  };
}

// Construit la séquence standard selon le format et la taille du pool.
function buildSequence(format, poolSize, A) {
  const B = other(A);
  const steps = [];
  if (format === 'BO1') {
    let t = A;
    for (let i = 0; i < poolSize - 1; i++) { steps.push({ action: 'ban', team: t }); t = other(t); }
    steps.push({ action: 'side', team: t });            // décideur : côté choisi par l'équipe restante
  } else if (format === 'BO3') {
    steps.push({ action: 'ban', team: A });
    steps.push({ action: 'ban', team: B });
    steps.push({ action: 'pick', team: A });
    steps.push({ action: 'side', team: B });            // côté sur la map pick A
    steps.push({ action: 'pick', team: B });
    steps.push({ action: 'side', team: A });            // côté sur la map pick B
    let t = A, remaining = poolSize - 4;
    while (remaining > 1) { steps.push({ action: 'ban', team: t }); t = other(t); remaining--; }
    steps.push({ action: 'side', team: t });            // décideur
  } else { // BO5
    steps.push({ action: 'ban', team: A });
    steps.push({ action: 'ban', team: B });
    let t = A, remaining = poolSize - 2;
    while (remaining > 1) {
      steps.push({ action: 'pick', team: t });
      steps.push({ action: 'side', team: other(t) });
      t = other(t); remaining--;
    }
    steps.push({ action: 'side', team: t });            // décideur
  }
  return steps;
}

function minPool(format) { return format === 'BO5' ? 7 : format === 'BO3' ? 5 : 2; }

function setup({ format, teams, pool, firstTeam }, allMaps) {
  format = ['BO1', 'BO3', 'BO5'].includes(format) ? format : 'BO3';
  firstTeam = firstTeam === 2 ? 2 : 1;
  const bySlug = new Map(allMaps.map(m => [m.slug, m]));
  const chosen = (pool || []).filter(s => bySlug.has(s));
  if (chosen.length < minPool(format)) {
    throw new Error('Pool insuffisant : ' + minPool(format) + ' maps minimum pour ' + format);
  }
  const s = idle();
  s.status = 'running';
  s.format = format;
  s.firstTeam = firstTeam;
  if (teams && teams[1]) { s.teams[1].name = String(teams[1].name || 'TEAM A').slice(0, 30); if (teams[1].color) s.teams[1].color = String(teams[1].color).slice(0, 16); }
  if (teams && teams[2]) { s.teams[2].name = String(teams[2].name || 'TEAM B').slice(0, 30); if (teams[2].color) s.teams[2].color = String(teams[2].color).slice(0, 16); }
  s.maps = chosen.map(slug => {
    const m = bySlug.get(slug);
    return { slug, name: m.name, splash: m.splash, minimap: m.minimap, status: 'available', by: null, side: null, sideBy: null };
  });
  s.sequence = buildSequence(format, s.maps.length, firstTeam);
  s.tokens = { 1: tok(), 2: tok() };
  s.log = [];
  state = s;
  return state;
}

function currentStep() {
  if (state.status !== 'running') return null;
  return state.sequence[state.stepIndex] || null;
}

function mapBySlug(slug) { return state.maps.find(m => m.slug === slug); }
function availableMaps() { return state.maps.filter(m => m.status === 'available'); }

// Applique une action ; renvoie l'état mis à jour ou jette une erreur.
function applyAction(team, payload) {
  const step = currentStep();
  if (!step) throw new Error('Veto inactif ou terminé');
  if (step.team !== team) throw new Error("Ce n'est pas le tour de cette équipe");

  if (step.action === 'ban' || step.action === 'pick') {
    const m = mapBySlug(payload.map);
    if (!m || m.status !== 'available') throw new Error('Map indisponible');
    m.status = step.action === 'ban' ? 'banned' : 'picked';
    m.by = team;
    if (step.action === 'pick') state.pendingSideMap = m.slug;
    state.log.push({ team, action: step.action, map: m.slug, name: m.name });
  } else { // side
    const side = SIDES.includes(payload.side) ? payload.side : null;
    if (!side) throw new Error('Côté invalide (attack/defense)');
    // décideur : s'il n'y a pas de map en attente, la dernière dispo devient décideur
    let m = state.pendingSideMap ? mapBySlug(state.pendingSideMap) : null;
    if (!m) {
      const avail = availableMaps();
      if (avail.length !== 1) throw new Error('Impossible de déterminer le décideur');
      m = avail[0]; m.status = 'decider';
    }
    m.side = side; m.sideBy = team;
    state.pendingSideMap = null;
    state.log.push({ team, action: 'side', map: m.slug, name: m.name, side });
  }

  state.stepIndex++;
  if (state.stepIndex >= state.sequence.length) state.status = 'done';
  return state;
}

// Vue publique : sans les tokens (pour overlay / régie).
function publicState() {
  const { tokens, ...rest } = state;
  const step = currentStep();
  return { ...rest, current: step ? { action: step.action, team: step.team, map: state.pendingSideMap } : null };
}

function teamOfToken(t) {
  if (!t) return null;
  if (state.tokens[1] === t) return 1;
  if (state.tokens[2] === t) return 2;
  return null;
}

function reset() { state = idle(); return state; }

module.exports = {
  setup, applyAction, reset, publicState, teamOfToken, currentStep,
  getTokens: () => state.tokens, minPool, SIDES,
};
