// ── customer-family-carry.test.js — a pinned customer keeps ALL its accounts ──────────────────
//
// A customer can hold many accounts, across more than one company. When the picker offers
// "DELUXE HOME CENTRE SDN BHD (SETAPAK)" it has measured the whole family behind that label, and a
// pick is supposed to cover the same accounts the picker measured. On the pick turn it does -
// exec 13695546 queried 12 accounts. On the very next turn it queried ONE (exec 13695091), so a
// product belonging to the customer's other company found nothing and the reply looked like the
// search had been narrowed to Mocha.
//
// Cause: picker_families - the map from a candidate to the accounts it stands for - is persisted
// only while the picker ROSTER is alive. The PIN is not bound to that lifetime: an entity keeps its
// uuid for as long as the customer keeps talking about it. So the roster expires, the family map
// goes with it, and the pin degrades to a single account re-resolved by its debtor code - which is
// per-company, and therefore cannot reach the customer's accounts in another company.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const FAM = {
  'DELUXE HOME CENTRE': ['84011929-b148-4b17-9278-d1811c7e6ced', '0e066bdb-c97c-4762-9a71-b32ea6bbadc2', 'ffdd4143-da6b-4484-87c1-d76932d04519'],
};

test('the account family survives after the picker roster has expired', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(CASES, 'family--compile-current-state.json'), 'utf8'));
  // real turn, real pinned customer; the session is given the family the pick had already recorded
  for (const item of fx.ctx['get-session-vars'] || []) {
    const v = (item.json.session_vars && item.json.session_vars.variables) || item.json.variables;
    if (v) v.picker_families = FAM;
  }
  const body = loadNodes(SLUG, ['compile-current-state.js'])['compile-current-state.js'];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'compile-current-state' });
  const o = Array.isArray(out) ? out[0].json : out;

  assert.ok(o.variables, 'the turn persists session variables');
  assert.deepEqual(
    o.variables.picker_families, FAM,
    'a live pin must keep the family it was picked from, roster or no roster',
  );
});
