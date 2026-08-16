// §I G1 — the blocking pre-promote gate: does a house-brand-answered spec phrase put `brand`
// into matched_specs for a customer who never named a brand?
//
// Mechanism under test (CRM product_spec_search.py:695-702): the house preference appends its
// key to matched_specs when the customer did NOT state it and the row holds the preferred value.
// SR-10/SR-11 returned CABANA/BRAVAT rows — structurally blind to it. This probe walks phrases
// until the spec answer contains SORENTO rows, then inspects their matched_specs.
//
//   PROBE_WEBHOOK=… node g1-house-brand-probe.js
// Read-only. FAIL ⇒ promote WITHOUT N-1a (excision body per review §I) or land the CRM's
// one-line `spec_asked` emission first.
'use strict';
const WEBHOOK = process.env.PROBE_WEBHOOK;
if (!WEBHOOK) { console.error('PROBE_WEBHOOK not set'); process.exit(3); }

const post = (payload) => fetch(WEBHOOK, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ qs: 'contact_id=437264483&space_id=364817', payload }),
}).then(r => r.json()).then(w => w.body);

const body = (raw) => ({
  query: raw, match_mode: 'and', tokens: [raw], allowed_entity_types: ['category'],
  access_levels: [], domain: 'master_products', fallback_to_all_types: true, limit: 15,
  spec_fallback: true, free_terms: [raw], understand_phrase: false,
});

const specRows = (r) => [
  ...((r?.intersection) || []),
  ...((r?.resolutions) || []).flatMap(t => t.matches || []),
].filter(m => m.match_tier === 'spec_search');

// No phrase names a brand. Spread across classes where Sorento stock is plausible.
const PHRASES = [
  'wall hung toilet bowl',
  'stainless steel kitchen sink',
  'rain shower set',
  'basin tap',
  'concealed cistern',
  'urinal',
  'water closet siphonic',
];

(async () => {
  let sawSorento = false, fail = false;
  for (const p of PHRASES) {
    const r = await post(body(p));
    const rows = specRows(r);
    const sorento = rows.filter(m => /^(SRT|SORENTO)/i.test(String(m.canonical_code || ''))
      || /sorento/i.test(String((m.display || {}).brand || '')));
    const keysets = [...new Set(rows.map(m => JSON.stringify((m.display || {}).matched_specs || [])))];
    console.log(`"${p}": ${rows.length} spec rows, ${sorento.length} sorento; matched_specs sets: ${keysets.join(' ')}`);
    if (!sorento.length) continue;
    sawSorento = true;
    const offenders = sorento.filter(m => ((m.display || {}).matched_specs || []).includes('brand'));
    if (offenders.length) {
      fail = true;
      console.log(`  ✗ G1 FAIL: 'brand' in matched_specs on ${offenders.length} sorento row(s) — customer named no brand`);
      for (const o of offenders.slice(0, 3)) console.log(`     ${o.canonical_code}: ${JSON.stringify(o.display.matched_specs)}`);
    } else {
      console.log(`  ✓ sorento rows carry no unstated 'brand' key`);
    }
  }
  if (!sawSorento) { console.log('\nG1 INCONCLUSIVE: no phrase produced sorento spec rows — extend PHRASES.'); process.exit(2); }
  console.log(fail ? '\nG1 FAIL' : '\nG1 PASS');
  process.exit(fail ? 1 : 0);
})();
