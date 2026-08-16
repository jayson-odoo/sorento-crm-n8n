// SR contract probe — the ask the SR plan §4 made and no SR case executed: does N-0's WIDER
// free_terms (the customer's own words) degrade or inflate the CRM's match set vs shape A's
// entity-raws-only form? Read-only POSTs through the zz-crm-probe webhook.
//
//   PROBE_WEBHOOK=… node crm-parity-n0.js
//
// Two directions matter and they are NOT symmetric:
//   SHRINK  — a phrase that answered under shape A must not answer WORSE under N-0. Blocking.
//   GROWTH  — nonsense that returned nothing must not start returning rows (filler words earn
//             free_term_boost, which counts as evidence, which is what sets floor_missed).
'use strict';
const WEBHOOK = process.env.PROBE_WEBHOOK;
if (!WEBHOOK) { console.error('PROBE_WEBHOOK not set'); process.exit(3); }

// N-0's shipped classifier, per word, then joined — same shape the jsonBody builds.
const CODE_RE = /^[A-Za-z][A-Za-z][A-Za-z0-9._/\-‐-―−﹘﹣－]*$/;
const n0FreeTerms = (raw) => {
  const kept = String(raw || '').split(/\s+/)
    .map(w => w.replace(/[.,!?;:]+$/, '').trim())
    .filter(w => w && !(/[0-9]/.test(w) && CODE_RE.test(w)));
  return kept.length ? [kept.join(' ')] : [];
};

const post = (payload) => fetch(WEBHOOK, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ qs: 'contact_id=437264483&space_id=364817', payload }),
}).then(r => r.json()).then(w => w.body);

const body = (query, tokens, freeTerms) => ({
  query, match_mode: 'and', tokens, allowed_entity_types: tokens.map(() => 'category'),
  access_levels: [], domain: 'master_products', fallback_to_all_types: true, limit: 15,
  spec_fallback: true, free_terms: freeTerms, understand_phrase: false,
});

const specCodes = (r) => [
  ...((r?.intersection) || []),
  ...((r?.resolutions) || []).flatMap(t => t.matches || []),
].filter(m => m.match_tier === 'spec_search').map(m => m.canonical_code);

const CASES = [
  { id: 'P-1 shrink', raw: 'do you have wall hung basin 600mm', entity: 'wall hung basin 600mm', dir: 'shrink' },
  { id: 'P-2 shrink', raw: 'please get me double bowl kitchen sink with thickness 1.2mm', entity: 'double bowl kitchen sink', dir: 'shrink' },
  { id: 'P-3 growth', raw: 'please get me a purple levitating sink', entity: 'purple levitating sink', dir: 'growth' },
  { id: 'P-4 growth', raw: 'hello can you please help me thanks', entity: 'hello', dir: 'growth' },
  { id: 'P-5 growth', raw: 'ok', entity: 'ok', dir: 'growth' },
];

(async () => {
  let fail = 0;
  for (const c of CASES) {
    const before = await post(body(c.raw, [c.entity], [c.entity]));        // shape A: entity raw only
    const after = await post(body(c.raw, [c.entity], n0FreeTerms(c.raw))); // N-0: customer's words
    const b = specCodes(before), a = specCodes(after);
    const lost = b.filter(x => !a.includes(x));
    const gained = a.filter(x => !b.includes(x));
    let ok, msg;
    if (c.dir === 'shrink') { ok = lost.length === 0; msg = `kept every shape-A match (lost ${lost.length}, gained ${gained.length})`; }
    else { ok = a.length === 0; msg = `still answers nothing (got ${a.length} rows; shape A had ${b.length})`; }
    if (!ok) fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${c.id}  ${msg}`);
    console.log(`      free_terms sent: ${JSON.stringify(n0FreeTerms(c.raw))}`);
    if (!ok) console.log(`      lost=${JSON.stringify(lost)} gained=${JSON.stringify(gained)}`);
  }
  console.log(fail ? `\n${fail} FAILED` : '\nall parity checks passed');
  process.exit(fail ? 1 : 0);
})();
