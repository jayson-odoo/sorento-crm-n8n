// ── f-account-code-leak.test.js — never show an internal account code to a customer ───────────
//
// Plan case F. Exec 13687248 replied:
//   "Note: 300-D059 is carried by more than one company (*Mocha* and *Sorento*) ..."
// 300-D059 is an internal debtor code. The note used to print the roster plan's `codes`, which is
// right for a PRODUCT (MFG6653-DIY is meaningful to the customer) and wrong for a customer.
//
// captain 2026-08-24: the multi-company note itself is gone (see build-cs-member-offer.js), so the
// response text no longer prints codes or labels at all - the leak this file guards against cannot
// reach the customer through that sentence any more. F1b now checks the note stayed gone AND that
// the label data build-cs-member-offer still exports (routing_companies[].labels, evidence/debug
// only) carries the customer's name rather than the debtor code, so the fix that produced the label
// in the first place (disallowed-entity-gate) hasn't quietly regressed just because nothing prints it.
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

test('F1b: no multi-company note, and no account code leaks into the exported labels', () => {
  const fx = load('f-leak--build-cs-member-offer.json');
  // the plan this node reads comes from the gate; run the gate first so the labels are real
  const gate = run('disallowed-entity-gate', load('f-leak--disallowed-entity-gate.json'));
  for (const item of fx.ctx['cs-roster-plan'] || []) {
    const match = (gate.routing_companies || []).find(c => c.company_id === item.json.company_id);
    if (match) item.json.labels = match.labels;
  }
  const o = run('build-cs-member-offer', fx);
  const msg = String(o.response || '');
  // captain 2026-08-24: the note is gone, so neither its wording nor a leaked code can be in the reply.
  assert.doesNotMatch(msg, /carried by more than one company/i, 'the multi-company note was removed');
  assert.doesNotMatch(msg, /Note:/, 'no leftover note line');
  assert.doesNotMatch(msg, /300-D059/, 'the internal account code must never reach the customer');
  assert.equal(o.cs_multi_note, undefined, 'cs_multi_note is a deleted field, not merely an unprinted one');
  // the label survives the roster-plan hop even though nothing prints it any more (evidence/debug).
  const cos = o.routing_companies || [];
  assert.ok(cos.length > 0, 'this turn still plans routing to more than one company');
  const allLabels = cos.flatMap(c => Array.isArray(c.labels) ? c.labels : []);
  assert.ok(allLabels.some(l => /DELUXE HOME CENTRE/i.test(l)), 'the customer label is still carried');
  assert.ok(!allLabels.some(l => /300-D059/.test(l)), 'the internal account code must never be used as a label');
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
