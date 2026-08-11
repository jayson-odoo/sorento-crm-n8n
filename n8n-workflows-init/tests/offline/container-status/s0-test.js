// S0 harness — drives the REAL crossdomain-render body with stubbed n8n globals.
// Every case must FAIL against cdr-before.js and PASS against cdr-after.js, except the
// negative controls which must behave identically on both.
const fs = require('fs');
const path = process.argv[2];
const body = fs.readFileSync(path, 'utf8');

function run({ probeItems, missing, originDomain = 'inventory' }) {
  const zs = { missing, origin_domain: originDomain, other_tool: 'crm_incoming_stock_list' };
  const $ = (name) => {
    if (name === 'crossdomain-zeroset') return { first: () => ({ json: { _xd: zs } }) };
    if (name === 'validator') return { first: () => ({ json: { has_result: true } }) };
    throw new Error('unexpected $(' + name + ')');
  };
  const $input = { first: () => ({ json: { answers: probeItems, has_result: true } }) };
  const wrapped = new Function('$', '$input', body);
  return wrapped($, $input);
}

const F = (label, value, key) => (key === undefined ? { label, value } : { key, label, value });
const row = (code, extra) => ({ fields: [F('Product Code', code), ...extra], flags: {} });

// ── incoming rows, TODAY's live shape: label "ETA", quantity labelled "Incoming Quantity" ──
const todayShape = [
  row('AAA', [F('Incoming Quantity', 5), F('ETA', '2026-09-30')]),
  row('AAA', [F('Incoming Quantity', 7), F('ETA', '2026-08-13')]),
  row('AAA', [F('Incoming Quantity', 2), F('ETA', '2026-09-01')]),
];
// ── same rows once PR #109 lands: keys present, labels unchanged ──
const keyedShape = [
  row('AAA', [F('Incoming Quantity', 5, 'remaining_incoming_quantity'), F('ETA', '2026-09-30', 'estimated_arrival_date')]),
  row('AAA', [F('Incoming Quantity', 7, 'remaining_incoming_quantity'), F('ETA', '2026-08-13', 'estimated_arrival_date')]),
  row('AAA', [F('Incoming Quantity', 2, 'remaining_incoming_quantity'), F('ETA', '2026-09-01', 'estimated_arrival_date')]),
];
// ── the ORIGINAL vocabulary, pre-227c13d0f. Must still sort (regression guard). ──
const legacyShape = [
  row('AAA', [F('Estimated Arrival Date', '2026-09-30')]),
  row('AAA', [F('Estimated Arrival Date', '2026-08-13')]),
  row('AAA', [F('Estimated Arrival Date', '2026-09-01')]),
];
// ── stock rows with the "—" placeholder riding on a present key ──
const placeholderStock = [
  row('AAA', [F('Warehouse', 'DC1'), F('Quantity On Hand', '—', 'quantity_on_hand'), F('ETA', '2026-09-30', 'estimated_arrival_date')]),
  row('AAA', [F('Warehouse', 'DC2'), F('Quantity On Hand', '—', 'quantity_on_hand'), F('ETA', '2026-08-13', 'estimated_arrival_date')]),
];
// ── real stock quantities, keyed. qty branch must win and sort DESC. ──
const keyedStock = [
  row('AAA', [F('Quantity On Hand', 3, 'quantity_on_hand')]),
  row('AAA', [F('Quantity On Hand', 11, 'quantity_on_hand')]),
  row('AAA', [F('Quantity On Hand', 7, 'quantity_on_hand')]),
];

const missing = [{ _n: 'AAA' }];
const order = (out, re) => (out[0].json._xdBlock.block.match(re) || []).join('|');

const cases = [
  ['C1 today live shape: ETA sorts soonest-first',
    () => order(run({ probeItems: todayShape, missing }), /\d{4}-\d{2}-\d{2}/g),
    '2026-08-13|2026-09-01|2026-09-30'],
  ['C2 keyed (#109) shape: ETA sorts soonest-first',
    () => order(run({ probeItems: keyedShape, missing }), /\d{4}-\d{2}-\d{2}/g),
    '2026-08-13|2026-09-01|2026-09-30'],
  ['C3 legacy label still sorts (no regression)',
    () => order(run({ probeItems: legacyShape, missing }), /\d{4}-\d{2}-\d{2}/g),
    '2026-08-13|2026-09-01|2026-09-30'],
  ['C4 "—" placeholder does NOT hijack the qty branch; ETA still sorts',
    () => order(run({ probeItems: placeholderStock, missing }), /\d{4}-\d{2}-\d{2}/g),
    '2026-08-13|2026-09-30'],
  ['C5 keyed qty sorts DESC and wins over ETA',
    () => order(run({ probeItems: keyedStock, missing }), /Quantity On Hand:\* (\d+)/g),
    'Quantity On Hand:* 11|Quantity On Hand:* 7|Quantity On Hand:* 3'],
];

let fail = 0;
for (const [name, fn, want] of cases) {
  let got;
  try { got = fn(); } catch (e) { got = 'THREW: ' + e.message; }
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}`);
  if (!ok) console.log(`        want ${want}\n        got  ${got}`);
}
console.log(fail ? `\n${fail}/${cases.length} FAILED` : `\nall ${cases.length} passed`);
process.exit(fail ? 1 : 0);
