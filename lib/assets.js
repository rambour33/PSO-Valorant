'use strict';
// Récupère et synchronise les assets Valorant (agents + maps compétitives)
// depuis valorant-api.com. Auto-mise à jour : tout nouvel agent / nouvelle map
// compétitive est détecté automatiquement (aucune liste codée en dur).

const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const AGENTS_DIR = path.join(PUB, 'agents');
const MAPS_DIR = path.join(PUB, 'maps');

function slug(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
  return (await res.json()).data;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Une map est "compétitive" (5v5 standard) si elle a une description tactique
// ET une image Premier — vrai pour Ascent/Bind/… et faux pour TDM/Skirmish/Range.
function isCompetitiveMap(m) {
  return !!(m.tacticalDescription && m.premierBackgroundImage && m.splash && m.displayName);
}

// Supprime les fichiers .png d'un dossier qui ne sont plus référencés
function pruneDir(dir, keepFiles) {
  const keep = new Set(keepFiles);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.png') && !keep.has(f)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
    }
  }
}

/**
 * Synchronise agents + maps avec l'API.
 * @param {object} opts
 * @param {boolean} opts.force  re-télécharge même si le fichier existe déjà
 * @returns {Promise<{agents:Array, maps:Array, downloaded:number, removed:number}>}
 */
async function refreshAssets(opts = {}) {
  const force = !!opts.force;
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  fs.mkdirSync(MAPS_DIR, { recursive: true });

  let downloaded = 0;

  // ── Agents jouables ──
  const agentsRaw = await getJSON('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
  const agents = [];
  const agentFiles = [];
  for (const a of agentsRaw) {
    if (!a.displayName || !a.displayIcon) continue;
    const id = slug(a.displayName);
    const file = id + '.png';
    const dest = path.join(AGENTS_DIR, file);
    if (force || !fs.existsSync(dest)) { await download(a.displayIcon, dest); downloaded++; }
    agentFiles.push(file);
    const agent = { name: a.displayName, slug: id, icon: '/agents/' + file };

    // Portrait plein corps (fond transparent) — utilisé pour les cartes lineup.
    if (a.fullPortrait) {
      const portraitFile = id + '-portrait.png';
      const portraitDest = path.join(AGENTS_DIR, portraitFile);
      if (force || !fs.existsSync(portraitDest)) { await download(a.fullPortrait, portraitDest); downloaded++; }
      agentFiles.push(portraitFile);
      agent.portrait = '/agents/' + portraitFile;
    }
    agents.push(agent);
  }
  agents.sort((x, y) => x.name.localeCompare(y.name));

  // ── Maps compétitives ──
  const mapsRaw = await getJSON('https://valorant-api.com/v1/maps');
  const maps = [];
  const mapFiles = [];
  for (const m of mapsRaw.filter(isCompetitiveMap)) {
    const id = slug(m.displayName);
    const splashFile = id + '-splash.png';
    const splashDest = path.join(MAPS_DIR, splashFile);
    if (force || !fs.existsSync(splashDest)) { await download(m.splash, splashDest); downloaded++; }
    mapFiles.push(splashFile);

    let minimap = null;
    if (m.displayIcon) {
      const miniFile = id + '-minimap.png';
      const miniDest = path.join(MAPS_DIR, miniFile);
      if (force || !fs.existsSync(miniDest)) { await download(m.displayIcon, miniDest); downloaded++; }
      mapFiles.push(miniFile);
      minimap = '/maps/' + miniFile;
    }
    maps.push({ name: m.displayName, slug: id, splash: '/maps/' + splashFile, minimap });
  }
  maps.sort((x, y) => x.name.localeCompare(y.name));

  // ── Élague les fichiers obsolètes (agents/maps retirés ou renommés) ──
  const before = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.png')).length
               + fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.png')).length;
  pruneDir(AGENTS_DIR, agentFiles);
  pruneDir(MAPS_DIR, mapFiles);
  const after = agentFiles.length + mapFiles.length;
  const removed = Math.max(0, before - after);

  // ── Écrit les manifestes ──
  fs.writeFileSync(path.join(AGENTS_DIR, 'agents.json'), JSON.stringify(agents, null, 2));
  fs.writeFileSync(path.join(MAPS_DIR, 'maps.json'), JSON.stringify(maps, null, 2));

  return { agents, maps, downloaded, removed };
}

function readManifest(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
const getAgents = () => readManifest(path.join(AGENTS_DIR, 'agents.json'));
const getMaps   = () => readManifest(path.join(MAPS_DIR, 'maps.json'));

module.exports = { refreshAssets, getAgents, getMaps, slug };
