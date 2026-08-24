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
