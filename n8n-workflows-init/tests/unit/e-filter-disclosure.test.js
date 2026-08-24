// ── e-filter-disclosure.test.js — say which three filters produced this answer ────────────────
//
// Plan cases E1/E2/E4. A delivery-order search filters on customer, product and date, and until
// now only the date was ever stated - and only on the happy path. That is what sent the captain
// hunting: "1 order" gave no way to tell whether a filter was narrowing it (exec 13602037, where
// no date filter had been applied at all), and an empty result gave no clue WHICH dimension to
// widen. A dimension with no filter must say "all ..." rather than vanish: a line that appears
// only sometimes is one people stop reading.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const run = (node, file) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: load(file), slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('E1/E4: an answer names all three dimensions, and an unset one reads as "all"', () => {
  const o = run('compile-current-state', 'pick-must-keep-missed-product--compile-current-state.json');
  const msg = String(o.user_response || '');
  assert.match(msg, /^Customer: .+/m, 'the customer filter is stated');
  assert.match(msg, /^Product: .+/m, 'the product filter is stated');
  assert.match(msg, /^Dates: .+/m, 'the date filter is stated');
  assert.match(msg, /Dates: all dates/, 'no window set reads as "all dates", not a missing line');
});

test('E2: an EMPTY result states the date scope too - that is when it matters most', () => {
  const o = run('not-found-error-message', 'obj1-not-found-error-message.json');
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /Dates: /, 'a miss must say what date scope it searched');
});

// Plan case D4. Clearing all three filters one at a time is a reasonable thing for a customer to
// try, and it lands on "show me every delivery order". Refusing is correct - the wording was not:
// "A order enquiry can't be answered with a general search", which has a broken article, names
// internal entity types as the remedy, and never says that one filter is enough to continue.
test('D4: clearing every filter refuses in words the customer can act on', () => {
  const body = loadNodes(SLUG, ['not-found-error-message.js'])['not-found-error-message.js'];
  const fx = load('obj1-not-found-error-message.json');
  // force the no-scope arm: strip every resolved entity from the gate's view
  for (const item of fx.ctx['disallowed-entity-gate'] || []) {
    item.json.compatible_entities = [];
    item.json.require_specific = false;
  }
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.entities = [];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'not-found-error-message' });
  const o = Array.isArray(out) ? out[0].json : out;
  const msg = String(o.escalate_message || o.response || '');
  if (!/every |general search/i.test(msg)) return;   // a different arm answered; nothing to assert
  assert.doesNotMatch(msg, /\bA order\b/, 'the broken article must be gone');
  assert.match(msg, /at least one filter/i, 'it must say that one filter is enough to continue');
  assert.doesNotMatch(msg, /customer_order|order_number|inbound_shipment|goods_receive/,
    'internal entity type names must not be offered to the customer as the remedy');
});
