// SA-P1 diagnosis: why did "wall hung basin" return 0 spec matches?
// Read-only POST via the zz-crm-probe webhook (same call crm-probe.js SA-P1 makes);
// dumps the AND-mode intersection rows so we can see what suppressed the fallback.
'use strict';
const WEBHOOK = process.env.PROBE_WEBHOOK;
const payload = {
  query: 'trying to find a wall hung basin',
  match_mode: 'and',
  tokens: ['wall hung basin'],
  allowed_entity_types: ['category'],
  access_levels: [],
  domain: 'master_products',
  fallback_to_all_types: true,
  limit: 15,
  spec_fallback: true,
  free_terms: ['wall hung basin'],
  understand_phrase: false,
};
(async () => {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ qs: 'contact_id=437264483&space_id=364817', payload }),
  });
  const b = (await res.json()).body;
  const inter = b.intersection || [];
  console.log('intersection n:', inter.length, '| empty flag:', b.empty, '| unresolved:', JSON.stringify(b.unresolved_tokens));
  for (const m of inter.slice(0, 8)) {
    console.log(' ', m.entity_type, m.canonical_code, m.match_field, m.match_tier, String((m.display || {}).product_name || '').slice(0, 60));
  }
  console.log('token_coverage:', JSON.stringify(b.token_coverage).slice(0, 300));
  console.log('by_entity_type keys:', Object.keys(b.by_entity_type || {}));
})();
