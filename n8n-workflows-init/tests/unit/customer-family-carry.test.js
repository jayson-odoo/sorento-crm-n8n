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
// The full "DELUXE HOME CENTRE" family as persisted in family2--disallowed-entity-gate.json's
// picker_families (12 unique accounts; the fixture's array repeats each uuid twice, de-duped here).
const DELUXE_FAMILY_FULL = [
  '84011929-b148-4b17-9278-d1811c7e6ced', '0e066bdb-c97c-4762-9a71-b32ea6bbadc2',
  'ffdd4143-da6b-4484-87c1-d76932d04519', 'd69fc206-98ae-4fee-b550-bf1938ebe867',
  '0cbd9153-6661-42df-b220-4f403961aa75', '95defcc3-9704-4ae7-9fcf-bc90eec64013',
  'fff82580-e440-4bcb-91b1-aa68cdce4bad', 'ff7d5f06-8638-4316-ae42-3898658d892b',
  '1aff9ef4-7685-4b0f-9caf-194dd39e1cac', '229130f3-0a78-46f2-bc98-880a0b362cb5',
  '1fd2f9a9-977e-4c85-b9fb-2abcb2da4f16', 'b53d0ae1-fd59-43a8-8fa6-9ce58abc7d77',
];

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

// exec 13705266: the customer was PICKED two turns before ("1", exec 13705226, which correctly
// widened to the 12-account family) and then CARRIED into the next turn ("WESERP10B") as
// current_message:false. compatible_entities collapsed to the 2 accounts the resolver could
// text-match from the carried label (300-D059/300-D058, both Mocha), and the CRM was asked for
// WESERP10B under only those 2 - "No matching results found" - though the product exists under
// the customer's other accounts. family2--disallowed-entity-gate.json already captures exactly
// this shape (the customer entity in the reformulator output carries current_message:false with
// a uuid, and get-session-vars holds the same picker_families the pick turn set), so no mutation
// is needed to exercise it.
test('a CARRIED pin (current_message:false) still widens compatible_entities to its whole family', () => {
  const o = runWith('disallowed-entity-gate', 'family2--disallowed-entity-gate.json');
  const uuids = (o.compatible_entities || [])
    .filter(c => String(c.entity_type) === 'customer')
    .map(c => String(c.uuid));
  for (const u of DELUXE_FAMILY_FULL) {
    assert.ok(uuids.includes(u), `a carried pin must widen to family member ${u} (exec 13705266)`);
  }
  assert.ok(
    !uuids.includes(DENHO),
    'a carried pin must not pull in DENHO HARDWARE, which merely shares a debtor code',
  );
});
