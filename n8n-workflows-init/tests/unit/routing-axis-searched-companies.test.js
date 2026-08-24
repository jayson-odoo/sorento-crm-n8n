// ── routing-axis-searched-companies.test.js - offer the teams of the companies we searched ────
//
// OBSERVED FAILURE (exec 13743718, "for mastile klang", order domain). One reply, two answers:
//     "But no order from 2026-08-01 to 2026-08-31 matched these - checked in Mocha and Sorento.
//      Would you like me to escalate to *Sorento* customer_service team?"
// Nine MASTILE KLANG accounts (a Mocha account) and two SRTKS7646 products (Sorento) were in
// scope, nothing matched, and the turn offered ONE company's team. A Mocha CS person never sees
// an escalation about a Mocha account.
//
// The two sentences came from two different sets: not-found-error-message's `_searchedCos` (every
// compatible entity that becomes a tool id) said Mocha and Sorento, while disallowed-entity-gate's
// routing axis preferred PRODUCTS outright and only consulted the customer's company when no
// product resolved. The invariant these tests hold down: WE OFFER THE TEAMS OF THE COMPANIES WE
// SAID WE SEARCHED - one set, asserted across both nodes so they cannot drift apart again.
//
// The lane runs REAL exported bodies end to end (gate -> not-found -> escalate-catalog ->
// cs-roster-plan -> build-cs-member-offer) with only the CRM roster call stubbed, because the
// contradiction only exists BETWEEN nodes: each one alone looks self-consistent.
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
const items = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && x.json ? x : { json: x }));
const run = (node, fixture) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  return items(runNode({ body, fixture, slug: SLUG, nodeName: node }));
};

// get-cs-members is the ONLY stub: one HTTP call per plan item, response i <-> plan i by index
// (the node has no executeOnce, so n8n runs it once per input item and keeps their order).
const ROSTER = {
  '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2': [{ user_id: 'u-mocha-1', name: 'Nadia', respond_user_id: 'r-1' }],
  '00000000-0000-0000-0000-000000000001': [{ user_id: 'u-sor-1', name: 'Emily', respond_user_id: 'r-2' },
                                           { user_id: 'u-sor-2', name: 'Sandy', respond_user_id: 'r-3' }],
};

function lane(caseName) {
  const fx = load(`${caseName}--disallowed-entity-gate.json`);
  let ctx = fx.ctx;
  const gate = run('disallowed-entity-gate', fx);
  ctx = { ...ctx, 'disallowed-entity-gate': gate };
  const nf = run('not-found-error-message', { ctx, input: [{ json: { branch_kind: 'not_found' } }] });
  ctx = { ...ctx, 'not-found-error-message': nf };
  const cat = run('escalate-catalog', { ctx, input: [{ json: { branch_kind: 'not_found' } }] });
  ctx = { ...ctx, 'escalate-catalog': cat };
  const plan = run('cs-roster-plan', { ctx, input: [{ json: {} }] });
  const resp = plan.map((p) => ({ json: { body: ROSTER[p.json.company_id] || [] } }));
  ctx = { ...ctx, 'cs-roster-plan': plan, 'get-cs-members': resp };
  const offer = run('build-cs-member-offer', { ctx, input: cat });
  return { gate: gate[0].json, nf: nf[0].json, plan: plan.map((p) => p.json), offer: offer[0].json };
}

// LESSONS §77: values built inside the vm realm are not instanceof the host's Array/Object, so
// deepStrictEqual rejects them even when the contents match. Round-trip before comparing.
const plain = (v) => JSON.parse(JSON.stringify(v));

// the companies the reply CLAIMS to have searched, read back out of the sentence the customer sees
const searchedCompanies = (text) => {
  const m = String(text || '').match(/ - checked in ([^.]+)\./);
  return m ? m[1].split(/,\s*|\s+and\s+/).filter(Boolean) : [];
};

test('exec 13743718: a Mocha customer and a Sorento product route to BOTH teams', () => {
  const r = lane('routing-axis-two-companies');
  const names = plain(r.gate.routing_companies.map((c) => c.company_name).sort());
  assert.deepStrictEqual(names, ['Mocha', 'Sorento'],
    'the routing axis must be every company we searched, not just the products');
  assert.deepStrictEqual(plain(r.plan.map((p) => p.company_name).sort()), ['Mocha', 'Sorento'],
    'cs-roster-plan must emit one item per searched company');
  assert.deepStrictEqual(plain(searchedCompanies(r.nf.escalate_message).sort()), names,
    'the companies offered must be exactly the companies the reply says were checked');
});

test('exec 13743718: the offer names both companies instead of one', () => {
  const { offer } = lane('routing-axis-two-companies');
  assert.match(offer.response, /\*Mocha:\*/, 'the Mocha group header must be rendered');
  assert.match(offer.response, /\*Sorento:\*/, 'the Sorento group header must be rendered');
  assert.match(offer.cs_multi_close || '', /reply with the company name \(\*Mocha\* \/ \*Sorento\*\)/);
  assert.equal(offer.cs_offer_company, null,
    'no single company may be named in the escalate phrase when two were searched');
  assert.doesNotMatch(offer.response, /escalate to \*Sorento\* customer_service team/,
    'THE BUG: offering one company after saying we checked two');
});

// captain 2026-08-24: the multi-company NOTE ("Note: X is carried by more than one company (...)")
// is removed - it was annoying, and the claim in it went false once the routing axis widened above
// (each subject sits in exactly one company; it is the TURN that spans two). The grouped list is
// left to explain itself. cs_multi_note is a deleted field, not merely an unprinted one.
test('a two-company offer carries no multi-company note', () => {
  const { offer } = lane('routing-axis-two-companies');
  assert.doesNotMatch(offer.response, /carried by more than one company/i,
    'the multi-company note sentence must not appear');
  assert.doesNotMatch(offer.response, /Note:/,
    'no "Note:" line of any kind must appear');
  assert.equal(offer.cs_multi_note, undefined,
    'cs_multi_note must be a deleted field, not an unprinted one');
  // the grouped list still stands on its own: both headers, every member, the company-name close.
  assert.match(offer.response, /\*Mocha:\*/);
  assert.match(offer.response, /\*Sorento:\*/);
  assert.match(offer.response, /Nadia/, 'the Mocha member must still be listed');
  assert.match(offer.response, /Emily/, 'the first Sorento member must still be listed');
  assert.match(offer.response, /Sandy/, 'the second Sorento member must still be listed');
  assert.match(offer.response, /reply with the company name \(\*Mocha\* \/ \*Sorento\*\) and we'll assign accordingly\./,
    'the closing sentence must still ask for the company');
});

// Frozen wording. Captured from the deployed bodies BEFORE the routing-axis change; a
// single-company turn must render byte for byte the same afterwards.
// AMENDED 2026-08-24 (captain, exec 13746945): a MISS now opens with the same Customer/Product/
// Dates header an answer does, so the standalone `Dates:` line moved up into it. Everything the
// routing-axis change froze - the bullets, the "checked in"/company-named escalate sentence, the
// picker - is unchanged below; only the header is new.
const SINGLE_COMPANY_OFFER = [
  'Customer: mastile klang',
  'Product: srtks7646',
  'Dates: 01/08/2026 to 31/08/2026',
  '',
  "Here's what you want:",
  '• customer: MASTILE KLANG SDN BHD (+1 more)',
  '• product: SRTKS7646 (+1 more)',
  '',
  'But no order from 2026-08-01 to 2026-08-31 matched these. Would you like me to escalate to *Sorento* customer_service team?',
  '',
  'Please choose who to route to (reply with the number):',
  '1. Emily',
  '2. Sandy',
  '',
  "If you have no preference, just reply 'yes' and we'll assign automatically.",
].join('\n');

test('a single-company turn renders byte-identical', () => {
  const r = lane('routing-axis-one-company');
  assert.deepStrictEqual(plain(r.gate.routing_companies.map((c) => c.company_name)), ['Sorento']);
  assert.equal(r.offer.cs_offer_company, 'Sorento');
  // captain 2026-08-24: cs_multi_note is a deleted field (was `null` on single-company before the
  // note existed at all, now `undefined` because nothing ever sets it) - same absence, exact shape
  // changed by the deletion.
  assert.equal(r.offer.cs_multi_note, undefined);
  assert.equal(r.offer.response, SINGLE_COMPANY_OFFER);
});

// AMENDED 2026-08-24 (captain, exec 13746945): same header as above. This turn is the exact shape
// that sent the captain hunting - a product in scope and NOTHING else, i.e. every customer was
// searched - and "Customer: all customers" is now the line that says so.
const PRODUCT_ONLY_OFFER = [
  'Customer: all customers',
  'Product: srtks7646',
  'Dates: 01/08/2026 to 31/08/2026',
  '',
  "Here's what you want:",
  '• product: SRTKS7646 (+1 more)',
  '',
  'But no order from 2026-08-01 to 2026-08-31 matched these. Would you like me to escalate to *Sorento* customer_service team?',
  '',
  'Please choose who to route to (reply with the number):',
  '1. Emily',
  '2. Sandy',
  '',
  "If you have no preference, just reply 'yes' and we'll assign automatically.",
].join('\n');

test('a product-only turn is unchanged', () => {
  const r = lane('routing-axis-product-only');
  assert.deepStrictEqual(plain(r.gate.routing_companies), [{
    company_id: '00000000-0000-0000-0000-000000000001',
    company_name: 'Sorento',
    brand_code: 'sorento',
    codes: ['SRTKS7646', 'SRTKS7646-NEW'],
    labels: ['SRTKS7646', 'SRTKS7646-NEW'],
  }]);
  assert.equal(r.offer.response, PRODUCT_ONLY_OFFER);
});
