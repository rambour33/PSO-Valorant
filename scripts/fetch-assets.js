'use strict';
// Télécharge / met à jour les assets Valorant (agents + maps compétitives).
// Usage : node scripts/fetch-assets.js [--force]

const { refreshAssets } = require('../lib/assets');

const force = process.argv.includes('--force');

refreshAssets({ force })
  .then((r) => {
    console.log('✓ ' + r.agents.length + ' agents, ' + r.maps.length + ' maps compétitives');
    console.log('  téléchargés: ' + r.downloaded + ' · obsolètes supprimés: ' + r.removed);
  })
  .catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
