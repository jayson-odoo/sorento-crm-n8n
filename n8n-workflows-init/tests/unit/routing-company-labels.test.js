// ── routing-company-labels.test.js — a name for every routing subject (block G7) ───────────────
//
// "Note: 300-D059 is carried by more than one company (Mocha and Sorento)" (exec 13687248).
// 300-D059 is an internal DEBTOR CODE. The customer-visible note was built from
// routing_companies[].codes, which is canonical_code - exactly right for a product (MFG6653-DIY
// means something to the person reading it) and wrong for a customer.
//
// The fix builds the customer-facing label HERE, in disallowed-entity-gate, where the resolver row
// still has its entity_type and its display name, so no downstream message builder has to reach
// into another node to find out what to call things.
//
// ⚠️ INERT ON THIS SPINE TODAY, DELIBERATELY. Nothing in the live spine reads `.labels`:
// cs-roster-plan drops the field on its way through and build-cs-member-offer still renders
// `codes`. So the leak above is STILL OPEN on live and this file says so out loud, in
// `the leak is still open until cs-roster-plan carries the label` below. The field is ported ahead
// of its consumer so that promoting cs-roster-plan is a one-node change rather than a two-node one.
// When that promotion happens, the inertness test is the one that must be re-expected - and its
// failure is the reminder that the note itself has to be dealt with at the same time.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'disallowed-entity-gate';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const src = loadNodes(SLUG, [`${GATE}.js`, 'not-found-error-message.js', 'escalate-catalog.js',
  'cs-roster-plan.js', 'build-cs-member-offer.js']);

const loadCase = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const items = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && x.json ? x : { json: x }));
const run = (node, fixture) =>
  items(normalizeReturn(runNode({ body: src[`${node}.js`], fixture, slug: SLUG, nodeName: node })));

// get-cs-members is the ONLY stub: one HTTP call per plan item, response i <-> plan i by index.
const ROSTER = {
  '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2': [{ user_id: 'u-mocha-1', name: 'Nadia', respond_user_id: 'r-1' }],
  '00000000-0000-0000-0000-000000000001': [{ user_id: 'u-sor-1', name: 'Emily', respond_user_id: 'r-2' },
                                           { user_id: 'u-sor-2', name: 'Sandy', respond_user_id: 'r-3' }],
};

function lane(caseName) {
  const fx = loadCase(`${caseName}--disallowed-entity-gate.json`);
  let ctx = fx.ctx;
  const gate = run(GATE, fx);
  ctx = { ...ctx, [GATE]: gate };
  const nf = run('not-found-error-message', { ctx, input: [{ json: { branch_kind: 'not_found' } }] });
  ctx = { ...ctx, 'not-found-error-message': nf };
  const cat = run('escalate-catalog', { ctx, input: [{ json: { branch_kind: 'not_found' } }] });
  ctx = { ...ctx, 'escalate-catalog': cat };
  const plan = run('cs-roster-plan', { ctx, input: [{ json: {} }] });
  const resp = plan.map((p) => ({ json: { body: ROSTER[p.json.company_id] || [] } }));
  ctx = { ...ctx, 'cs-roster-plan': plan, 'get-cs-members': resp };
  const offer = run('build-cs-member-offer', { ctx, input: cat });
  return plain({ gate: gate[0].json, plan: plan.map((p) => p.json), offer: offer[0].json });
}

// exec 13687248's shape: ONE debtor code, 300-D059, standing for three differently-named accounts
// across two companies.
test('exec 13687248: a customer routing subject is labelled by NAME, never by its debtor code', () => {
  const { gate } = lane('f-leak');
  const cos = gate.routing_companies;
  assert.equal(cos.length, 2, 'the fixture is the two-company shape');
  for (const c of cos) {
    assert.ok(Array.isArray(c.labels), `${c.company_name} must carry labels[]`);
    assert.ok(c.labels.length > 0, `${c.company_name} labels[] must not be empty`);
    for (const l of c.labels) {
      assert.doesNotMatch(l, /^\d{3}-[A-Z]\d+$/,
        `THE LEAK: ${l} is a debtor code, not something to show a customer`);
    }
  }
  const byName = Object.fromEntries(cos.map((c) => [c.company_name, c.labels]));
  assert.deepStrictEqual(byName.Mocha,
    ['DELUXE HOME CENTRE SDN BHD (SETAPAK)', 'DELUXE HOME CENTRE SDN BHD - ACC 2 - [CERAMIC]']);
  assert.deepStrictEqual(byName.Sorento, ['DENHO HARDWARE SDN BHD [A/C II]']);
});

test('a product routing subject is still labelled by its code - that IS its name to a customer', () => {
  const { gate } = lane('routing-axis-product-only');
  const c = gate.routing_companies[0];
  assert.deepStrictEqual(c.labels, c.codes,
    'for products the label and the code are the same string; only customers needed a second field');
});

test('labels is ADDITIVE - codes is untouched', () => {
  // The leak is fixed by giving the message builder something better to say, never by rewriting
  // `codes`. get-cs-members and every id-shaped consumer still need the canonical codes.
  const { gate } = lane('f-leak');
  const byName = Object.fromEntries(gate.routing_companies.map((c) => [c.company_name, c.codes]));
  assert.deepStrictEqual(byName.Mocha, ['300-D059']);
  assert.deepStrictEqual(byName.Sorento, ['300-D059']);
});

// ── the honest part ───────────────────────────────────────────────────────────────────────────
test('INERT: the leak is still open until cs-roster-plan carries the label', () => {
  const { plan, offer } = lane('f-leak');
  assert.ok(plan.length > 0);
  for (const p of plan) {
    assert.equal(p.labels, undefined,
      'live cs-roster-plan does not forward labels yet - when it does, this line is the one to change');
  }
  assert.match(offer.response, /Note: 300-D059 is carried by more than one company/,
    'exec 13687248 is NOT fixed by this block alone: build-cs-member-offer still renders codes. ' +
    'Porting the label into the gate changes no reply on this spine today.');
});
