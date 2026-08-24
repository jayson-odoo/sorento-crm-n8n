// ── customer-family-carry.test.js — a pin keeps ALL its accounts, and ONLY its accounts ───────
//
// A customer holds many accounts. The picker measures the whole family behind a label, and a pick
// is meant to cover the same accounts the picker measured. On the pick turn it did (12 accounts,
// exec 13695546); on the next turn it covered 1 (exec 13695091), so a product from the customer's
// other company matched nothing.
//
// picker_families is persisted only while the picker ROSTER is alive; the pin is not bound to that
// lifetime. This carries the family for as long as a customer entity holding a uuid does.
//
// The FIRST attempt at this was reverted, and the reason is the second test below. Carrying the
// family widened the scope from 1 account to 3 - and the third was DENHO HARDWARE, a different
// company that merely shares debtor code 300-D059. The original test asserted only that the family
// persisted, so it passed while the behaviour got worse. Assert composition, never just a count.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const DELUXE = ['84011929-b148-4b17-9278-d1811c7e6ced', '0e066bdb-c97c-4762-9a71-b32ea6bbadc2'];
const DENHO  = 'f7b239d4-b233-43ee-875f-4679e2292387';
const FAM = { 'DELUXE HOME CENTRE': DELUXE };

const runWith = (node, file, mutate) => {
  const fx = JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8'));
  if (mutate) mutate(fx);
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('the account family survives after the picker roster has expired', () => {
  const o = runWith('compile-current-state', 'family2--compile-current-state.json', (fx) => {
    for (const item of fx.ctx['get-session-vars'] || []) {
      const v = (item.json.session_vars && item.json.session_vars.variables) || item.json.variables;
      if (v) v.picker_families = FAM;
    }
  });
  assert.deepEqual(
    o.variables.picker_families, FAM,
    'a live pin keeps the family it was picked from, roster or no roster',
  );
});

test('a customer sharing a debtor code with another company never enters the scope', () => {
  const o = runWith('disallowed-entity-gate', 'family2--disallowed-entity-gate.json');
  const uuids = (o.compatible_entities || [])
    .filter(c => String(c.entity_type) === 'customer')
    .map(c => String(c.uuid));
  assert.ok(uuids.length > 0, 'the picked customer is in scope');
  assert.ok(
    !uuids.includes(DENHO),
    'DENHO HARDWARE shares code 300-D059 under another company and must never be queried',
  );
});
