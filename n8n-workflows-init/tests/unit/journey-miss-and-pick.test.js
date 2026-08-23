// ── journey-miss-and-pick.test.js — the captain's agreed user journey, as executable spec ─────
//
// Agreed 2026-08-23 after two console turns (execs 13633742, 13633783) where `mfg6651-gm`
// resolved to ZERO CRM candidates and simply disappeared:
//
//   R1  a product that does not exist BLOCKS the turn and is named, with did-you-mean.
//       Never silently widen the question to "all products for this customer".
//   R2  a customer the user already picked stays PINNED. Re-ask only if they name a new one.
//   R3  when several problems exist, surface them in the SAME turn - a miss AND an ambiguity
//       are both reported, not one at a time with the other silently dropped.
//   R4  fuzzy neighbours in the customer picker are acceptable (captain's call), so the picker
//       contents are deliberately NOT asserted here.
//
// These tests run the real published clone bodies against the real captured turns.
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

// exec 13633742 — "mfg6651-gm" typed while a previously-picked customer was carried.
// Observed: the product vanished, and the reply asked ONLY "Which customer do you mean?".
test('R1: a product that resolves to nothing blocks the turn and is reported', () => {
  const o = run('disallowed-entity-gate', 'product-miss-plus-customer-ambiguity--disallowed-entity-gate.json');
  assert.deepEqual(
    o.dropped_filter_tokens, ['mfg6651gm'],
    'a zero-candidate product the user typed must be reported as a lost filter',
  );
});

// The separator bug: resolve-entity strips '-' for product hints, so the resolver token is
// 'mfg6651gm' while the parser raw is 'mfg6651-gm'. The gate compared them literally and decided
// the user had not typed it, so it never fired. Dashed codes are the common case.
test('R1b: a dashed product code is recognised as user-typed despite the strip', () => {
  const o = run('disallowed-entity-gate', 'pick-must-keep-missed-product--disallowed-entity-gate.json');
  assert.equal(o.gate_passed, false, 'the pick turn still had a zero-candidate product - it must not answer');
  assert.ok((o.dropped_filter_tokens || []).length > 0, 'the missed product must be named');
});

// exec 13633742 — the customer arrived carried (current_message:false) from an earlier pick.
test('R2: a carried, already-picked customer is not re-asked', () => {
  const o = run('disallowed-entity-gate', 'product-miss-plus-customer-ambiguity--disallowed-entity-gate.json');
  assert.equal(
    o.require_specific, false,
    'the customer was already chosen in an earlier turn - asking again loses the pick',
  );
});

// R2 and R3 interact: once the pin is honoured, exec 13633742 has only ONE problem left, so it is
// no longer a both-at-once case. To exercise R3 we take the same real turn and make the customer
// named THIS turn (current_message:true) — which is exactly the case R2 says SHOULD re-ask — so the
// picker opens while the product is still missing.
test('R2+R3: naming the customer this turn re-opens the picker, and the miss rides along', () => {
  const file = 'product-miss-plus-customer-ambiguity--disallowed-entity-gate.json';
  const fx = JSON.parse(fs.readFileSync(path.join(CASES, file), 'utf8'));
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) {
    for (const e of item.json.output.entities || []) {
      if (String(e.hint || '').toLowerCase() === 'customer') e.current_message = true;
    }
  }
  const body = loadNodes(SLUG, ['disallowed-entity-gate.js'])['disallowed-entity-gate.js'];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'disallowed-entity-gate' });
  const o = Array.isArray(out) ? out[0].json : out;

  assert.equal(o.require_specific, true, 'a customer named this turn is a fresh question - re-ask');
  const msg = String(o.gate_clarification || '');
  assert.match(msg, /which customer do you mean/i, 'the picker question must be asked');
  assert.match(msg, /mfg6651-gm/i, 'and the missed product must be named in the SAME message');
  assert.match(msg, /\(product\)/i, 'the miss carries its entity-type label, like every other miss line');
});

// exec 13633742 as it actually happened: the customer was already picked, so after R2 the only
// problem left is the product. It must be reported, and the picker must NOT re-open.
test('R1+R2: a pinned customer plus a missed product reports the product only', () => {
  const o = run('disallowed-entity-gate', 'product-miss-plus-customer-ambiguity--disallowed-entity-gate.json');
  assert.equal(o.require_specific, false, 'the pick stands - do not ask again');
  assert.deepEqual(o.dropped_filter_tokens, ['mfg6651gm'], 'the product miss is what the user needs told');
});
