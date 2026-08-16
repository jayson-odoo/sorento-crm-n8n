// Pre-deploy baseline snapshot for SB-P6 byte-parity (and the SA post-deploy diff).
// Read-only POSTs via the zz-crm-probe webhook. Three fixed bodies:
//   A. plain code query, NO new fields          — must be byte-identical post-deploy (SB-P6)
//   B. plain descriptive query, NO new fields   — must be byte-identical post-deploy (SB-P6)
//   C. code query WITH spec_fallback            — full coverage ⇒ gate must STILL suppress
//      post-deploy (the counterweight), so this too should be identical.
// The body that is EXPECTED to change post-deploy (descriptive + spec_fallback) is NOT a
// parity fixture — that diff is the feature.
//
//   PROBE_WEBHOOK=… node predeploy-snapshot.js [--label pre|post]
'use strict';
const fs = require('fs');
const path = require('path');
const WEBHOOK = process.env.PROBE_WEBHOOK;
if (!WEBHOOK) throw new Error('PROBE_WEBHOOK not set');
const label = process.argv.includes('--label') ? process.argv[process.argv.indexOf('--label') + 1] : 'pre';

const plain = (query, raw) => ({
  query, match_mode: 'and', tokens: [raw], allowed_entity_types: ['category'],
  access_levels: [], domain: 'master_products', fallback_to_all_types: true, limit: 15,
});
const BODIES = {
  'A-code-plain': plain('trying to check SRTWC286', 'SRTWC286'),
  'B-desc-plain': plain('trying to find a wall hung basin', 'wall hung basin'),
  'C-code-specfallback': { ...plain('trying to check SRTWC286', 'SRTWC286'), spec_fallback: true, free_terms: [], understand_phrase: false },
};

(async () => {
  const out = {};
  for (const [k, payload] of Object.entries(BODIES)) {
    const res = await fetch(WEBHOOK, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qs: 'contact_id=437264483&space_id=364817', payload }),
    });
    const wrapped = await res.json();
    // elapsed_ms is timing noise, never contract — drop it before it can fake a diff.
    const scrub = (o) => JSON.parse(JSON.stringify(o, (kk, v) => (kk === 'elapsed_ms' ? undefined : v)));
    out[k] = { statusCode: wrapped.statusCode, body: scrub(wrapped.body) };
    console.log(`${k}: HTTP ${wrapped.statusCode}, keys=[${Object.keys(wrapped.body || {}).sort().join(',')}]`);
  }
  const dest = path.join(__dirname, `snapshot-${label}-deploy.json`);
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log('wrote', dest);
})();
