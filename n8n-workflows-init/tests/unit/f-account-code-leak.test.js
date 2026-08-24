// ── f-account-code-leak.test.js — never show an internal account code to a customer ───────────
//
// Plan case F. Exec 13687248 replied:
//   "Note: 300-D059 is carried by more than one company (*Mocha* and *Sorento*) ..."
// 300-D059 is an internal debtor code. The note prints the roster plan's `codes`, which is right
// for a PRODUCT (MFG6653-DIY is meaningful to the customer) and wrong for a customer.
//
// The label is carried from where the codes are built - disallowed-entity-gate, which has the
// resolver row and therefore its entity_type and display name - rather than looked up by name from
// inside the message builder. build-cs-member-offer reads no other node today, and
// SIMPLIFY-spine-audit §6/§7 is about removing that coupling, not adding more.
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
const run = (node, fixture) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture, slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('F1a: the gate labels each routing company with something a customer can read', () => {
  const o = run('disallowed-entity-gate', load('f-leak--disallowed-entity-gate.json'));
  const cos = o.routing_companies || [];
  assert.ok(cos.length > 0, 'this turn routes to more than one company');
  for (const c of cos) {
    assert.ok(Array.isArray(c.labels), `every routing company carries labels, got ${JSON.stringify(c)}`);
    for (const l of c.labels) {
      assert.doesNotMatch(String(l), /^\d{3}-[A-Z]/, `"${l}" is an internal account code, not a label`);
    }
  }
});

test('F1b: the multi-company note names the customer, never the account code', () => {
  const fx = load('f-leak--build-cs-member-offer.json');
  // the plan this node reads comes from the gate; run the gate first so the note sees real labels
  const gate = run('disallowed-entity-gate', load('f-leak--disallowed-entity-gate.json'));
  for (const item of fx.ctx['cs-roster-plan'] || []) {
    const match = (gate.routing_companies || []).find(c => c.company_id === item.json.company_id);
    if (match) item.json.labels = match.labels;
  }
  const o = run('build-cs-member-offer', fx);
  const msg = String(o.response || '');
  assert.match(msg, /carried by more than one company/i, 'the note is still produced');
  assert.doesNotMatch(msg, /300-D059/, 'the internal account code must never reach the customer');
  assert.match(msg, /DELUXE HOME CENTRE/i, 'the customer is named instead');
});

// The rule is "call it what the customer would call it", not "hide codes". A PRODUCT code IS what
// they typed and what they recognise, so labelling must leave it untouched - only a customer's
// internal debtor code gets replaced by its name.
test('F2: a product subject keeps its code as the label', () => {
  const o = run('disallowed-entity-gate', load('obj1-disallowed-entity-gate.json'));
  const cos = o.routing_companies || [];
  assert.ok(cos.length > 0, 'this turn routes on a product');
  for (const c of cos) {
    assert.deepEqual(c.labels, c.codes, 'a product is already named the way the customer named it');
  }
});
