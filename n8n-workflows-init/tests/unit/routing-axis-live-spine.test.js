// ── routing-axis-live-spine.test.js - the LIVE spine's copy of the two-company escalation offer ──
//
// The live-slug twin of routing-axis-searched-companies.test.js (which pins the TEST clone). Two
// changes land here together because one is only safe on top of the other:
//
//   PART 1 - the multi-company NOTE is deleted. It read
//     "Note: 300-D059 is carried by more than one company (Mocha and Sorento), so I am listing the
//      customer-service team members from each of them - that is why there are more names than usual."
//   The captain's call (2026-08-24): "the note is quite annoying, i prefer to remove the note, we
//   should keep the list cause it really spans two." It also leaked an internal DEBTOR CODE to the
//   customer on live (exec 13687248) - see routing-company-labels.test.js for that history.
//
//   PART 2 - the routing axis widens to every compatible entity that becomes a tool id, minus the
//   `brand`/`category` deny list (exec 13743718). WE OFFER THE TEAMS OF THE COMPANIES WE SAID WE
//   SEARCHED. Before it, a Mocha customer beside a Sorento product offered the SORENTO team only,
//   while the same reply said "checked in Mocha and Sorento".
//
// PART 2 ALONE WOULD HAVE BEEN A REGRESSION, which is why the order matters and why both are here:
// widening the axis makes more turns multi-company, and every one of those turns would then have
// printed the note - a NEW debtor-code leak on turns that leak nothing today, asserting something
// false (300-M001 is a Mocha-only account, SRTKS7646 a Sorento-only product; it is the TURN that
// spans two companies, not any one subject). Delete the note first, then widen.
//
// The lane runs REAL exported bodies end to end (gate -> not-found-error-message -> escalate-catalog
// -> cs-roster-plan -> build-cs-member-offer) with only the CRM roster call stubbed, because the
// contradiction only ever existed BETWEEN nodes: each one alone looks self-consistent.
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
// LESSONS §77: values built inside the vm realm are not instanceof the host's Array/Object, so
// deepStrictEqual rejects them even when the contents match. Round-trip before comparing.
const plain = (v) => JSON.parse(JSON.stringify(v));
const items = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && x.json ? x : { json: x }));
const run = (node, fixture) =>
  items(normalizeReturn(runNode({ body: src[`${node}.js`], fixture, slug: SLUG, nodeName: node })));

// get-cs-members is the ONLY stub: one HTTP call per plan item, response i <-> plan i by index
// (the node has no executeOnce, so n8n runs it once per input item and keeps their order).
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
  return plain({ gate: gate[0].json, nf: nf[0].json, plan: plan.map((p) => p.json), offer: offer[0].json });
}

// An internal debtor code: three digits, a letter, a serial (300-D059, 300-M001). A canonical PRODUCT
// code is not this shape and is deliberately still allowed - MFG6653-DIY is what the customer calls it.
const DEBTOR_CODE = /\b\d{3}-[A-Z]\d+\b/;

// the companies the reply CLAIMS to have searched, read back out of the sentence the customer sees
const searchedCompanies = (text) => {
  const m = String(text || '').match(/ - checked in ([^.]+)\./);
  return m ? m[1].split(/,\s*|\s+and\s+/).filter(Boolean) : [];
};

// ── PART 1: the note is gone ──────────────────────────────────────────────────────────────────
// `f-leak` is the fixture to prove this on, because it is the shape that is ALREADY multi-company
// on live today (exec 13687248) - so this case is red on the unmodified spine, not merely red
// because part 2 has not landed yet.
test('a two-company offer carries no multi-company note', () => {
  const { offer } = lane('f-leak');
  assert.equal(offer.routing_companies.length, 2, 'the fixture must be the two-company shape');
  assert.doesNotMatch(offer.response, /carried by more than one company/i,
    'the multi-company note sentence must not appear');
  assert.doesNotMatch(offer.response, /Note:/,
    'no "Note:" line of any kind must appear');
  // `in`, not `== undefined`: assert.equal is loose, so a field left behind as an explicit `null`
  // would pass. The requirement is that nothing writes the key at all.
  assert.ok(!('cs_multi_note' in offer),
    'cs_multi_note must be a deleted field, not an unprinted one');
  // the grouped list still stands on its own: both headers, every member, the close.
  // RE-PINNED 2026-08-25 (miss-company-routing rev-3 grouping port): the group header is now
  // WhatsApp-bold presenter style (`*Mocha:*`) and the member lines are plain `n. Name` - the
  // company is said once, by the header, not repeated per member. Numbering is still global
  // (idx in cs_last_result_set), so a shared member keeps ONE number across groups.
  assert.match(offer.response, /^\*Mocha:\*$/m, 'the Mocha group header must survive');
  assert.match(offer.response, /^\*Sorento:\*$/m, 'the Sorento group header must survive');
  assert.match(offer.response, /^1\. Nadia$/m, 'the Mocha member must still be listed');
  assert.match(offer.response, /^2\. Emily$/m, 'the first Sorento member must still be listed');
  assert.match(offer.response, /^3\. Sandy$/m, 'the second Sorento member must still be listed');
  // every persisted row prints: a number the customer can pick must have been SHOWN to them
  for (const row of offer.cs_last_result_set) {
    assert.match(offer.response, new RegExp(`^${row.idx}\\. `, 'm'),
      `row ${row.idx} (${row.label}) is pickable but was never printed`);
  }
  // FLIPPED 2026-08-25 (company-pick part 3): cs_multi_close IS ported now. The "reply with the
  // company name" ask was held back until the parser's company_pick half was live end to end;
  // the deterministic _coCompanyPick arm shipped (XTODTw @ 8717de6b), so a MULTI-company offer
  // closes by asking for the company - the one reply that resolves where a bare "yes" cannot
  // assign (escalation-context clarifies on multi_company_unpicked). Bold names in plan order,
  // written once and exported so compile-current-state's Δ4 _close cannot drift.
  assert.equal(offer.cs_multi_close,
    "If you have no preference, reply with the company name (*Mocha* / *Sorento*) and we'll assign accordingly.",
    'the multi-company close must be exported for compile-current-state\'s Δ4 arm');
  assert.match(offer.response, /If you have no preference, reply with the company name \(\*Mocha\* \/ \*Sorento\*\) and we'll assign accordingly\.$/,
    'the multi-company offer must close by asking for the company, names in plan order');
  assert.doesNotMatch(offer.response, /just reply 'yes'/,
    'the round-robin yes-close must not appear on a multi-company offer - a bare "yes" cannot assign here');
});

// MIND THE JOIN. The note used to sit between the escalate phrase and the picker prompt, ending
// `...than usual. Please choose who to route to`. Deleting it must leave exactly one blank line
// between them - not two, not none.
test('deleting the note leaves the escalate phrase and the picker prompt correctly joined', () => {
  const { offer } = lane('f-leak');
  assert.match(offer.response,
    /Would you like me to escalate to customer_service team\?\n\nPlease choose who to route to \(reply with the number\):\n\*Mocha:\*/,
    'exactly one blank line between the escalate phrase and the picker prompt');
  assert.doesNotMatch(offer.response, /\n\n\n/, 'no doubled blank line anywhere in the reply');
});

// ── the leak this closes ──────────────────────────────────────────────────────────────────────
test('no internal debtor code reaches the customer in any rendered reply', () => {
  for (const c of ['f-leak', 'routing-axis-two-companies', 'routing-axis-one-company',
    'routing-axis-product-only']) {
    const { offer } = lane(c);
    assert.doesNotMatch(String(offer.response || ''), DEBTOR_CODE,
      `${c}: an internal debtor code must never reach the customer`);
  }
});

// ── PART 2: the routing axis is every company we said we searched ─────────────────────────────
//
// THE TWO DENY LISTS ARE ONE LIST. not-found-error-message decides which companies the reply CLAIMS
// to have searched (`_searchedCos`); disallowed-entity-gate decides whose teams we then offer
// (`routing_companies`). Both exclude the entity types that never become a tool id. If one list
// changes and the other does not, the sentence and the offer contradict each other again - which is
// exactly the bug (exec 13743718). The source comments say "change one, change the other"; this
// asserts it, so it is a gate rather than a hope.
test('the gate and not-found-error-message share ONE deny list, byte for byte', () => {
  const DENY = /const _NO_TOOL_ID = new Set\(\[[^\]]*\]\);/;
  const inGate = src[`${GATE}.js`].match(DENY);
  const inNf = src['not-found-error-message.js'].match(DENY);
  assert.ok(inGate, 'disallowed-entity-gate must declare the _NO_TOOL_ID deny list');
  assert.ok(inNf, 'not-found-error-message must declare the _NO_TOOL_ID deny list');
  assert.equal(inGate[0], inNf[0],
    'the routing axis and the "checked in ..." claim must exclude exactly the same entity types');
  assert.equal(inGate[0], "const _NO_TOOL_ID = new Set(['brand', 'category']);",
    'brand and category are the two types sub-get-results maps to no *_ids tool param');
});

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

test('exec 13743718: the offer lists both companies teams, and still no note', () => {
  const { offer } = lane('routing-axis-two-companies');
  assert.match(offer.response, /^\*Mocha:\*$/m, 'the Mocha group header must be rendered');
  assert.match(offer.response, /^\*Sorento:\*$/m, 'the Sorento group header must be rendered');
  assert.match(offer.response, /Nadia/, 'THE BUG: a Mocha CS person never saw a Mocha account escalation');
  assert.match(offer.response, /Emily/);
  assert.match(offer.response, /Sandy/);
  // widening the axis must not re-introduce the sentence part 1 just deleted
  assert.doesNotMatch(offer.response, /carried by more than one company/i);
  assert.doesNotMatch(offer.response, /Note:/);
});

// ── the frozen half ───────────────────────────────────────────────────────────────────────────
// Captured from the deployed bodies BEFORE either change. A single-company turn must render byte
// for byte the same afterwards - the escalate phrase in particular is frozen wording the parser
// has a prefix-regex contract on (/would you like me to escalate/i).
//
// RE-PINNED 2026-08-25, and ONLY by the three-line search-scope header being prepended. That
// header is the whole point of the change these two guards sit beside (a miss opens with the same
// Customer / Product / Dates disclosure an answer does), so freezing its absence was freezing the
// old behaviour, not protecting the new one. Everything BELOW the blank line after `Dates:` is
// unchanged, byte for byte, which is what these two still assert: the bullets, the escalate
// sentence the parser regex depends on, the picker prompt, the numbering and the close.
//
// `Product: SRTKS7646`, not `srtks7646`: the header prints the CUSTOMER's spelling. `res.token` is
// the CRM's echo, lower-cased and (for a product hint) separator-stripped, so before the casing fix
// this line read `Product: srtks7646` directly above a bullet reading `• product: SRTKS7646`.
//
// RE-PINNED again 2026-08-24, and ONLY on the team name inside the escalate sentence:
// `customer_service team?` -> `customer service team?`. The team name is an INTERNAL SLUG and was
// being read out to the customer verbatim; live has been saying `marketing_promotion_sorento team`
// to real people (4 turns in 8 days). Underscores now render as spaces at the interpolation, so
// this expectation moves by exactly one character in each block. Everything else - the header, the
// bullets, the frozen `Would you like me to escalate` prefix the parser matches, the picker, the
// numbering, the close - is byte-identical, which is still what "renders byte-identical" asserts.
//
// RE-PINNED again 2026-08-25 (miss-company-routing rev-3, single-company half), and ONLY on the
// company label inside the escalate sentence: `escalate to customer service team?` -> `escalate to
// *Sorento* customer service team?`. A single-company offer now names the company it will route to,
// via build-cs-member-offer's nameCompany rewrite - whose regex spans a MULTI-WORD team
// (`(?:[a-z0-9-]+ )*[a-z0-9-]+ team\?`, the same form compile-current-state ships), because the
// prettified `customer service` has a space the clone's `\S+` could never cross. The frozen
// `Would you like me to escalate` prefix the parser matches sits BEFORE the insertion, untouched.
const SINGLE_COMPANY_OFFER = [
  'Customer: mastile klang',
  'Product: SRTKS7646',
  'Dates: 01/08/2026 to 31/08/2026',
  '',
  "Here's what you want:",
  '• customer: MASTILE KLANG SDN BHD (+1 more)',
  '• product: SRTKS7646 (+1 more)',
  '',
  'But no order from 2026-08-01 to 2026-08-31 matched these. Would you like me to escalate to *Sorento* customer service team?',
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
  // cs_multi_note is a DELETED field: it was an explicit `null` here before (the single-company arm
  // wrote the field and set it null), and now the key is absent entirely. `in` is what distinguishes
  // those two - `assert.equal(x, undefined)` would pass on both, which is the assertion this change
  // needs to be strict about.
  assert.ok(!('cs_multi_note' in r.offer),
    'cs_multi_note must be a deleted field, not an unprinted one');
  assert.equal(r.offer.cs_offer_company, 'Sorento',
    'the single offered company is exported for compile-current-state\'s Δ4 arm (already live, reading exactly this key)');
  assert.equal(r.offer.cs_multi_close, null,
    'part 3: cs_multi_close is exported null on a single-company offer - the Δ4 _close guard keeps its yes-fallback');
  assert.equal(r.offer.response, SINGLE_COMPANY_OFFER);
});

// Same re-pin, and the reason the customer axis reads `all customers` here: no customer row is in
// the gate scope on a product-only turn, so the axis says so out loud instead of vanishing - which
// is exactly the E1/E2 requirement ("an EMPTY result states them too").
const PRODUCT_ONLY_OFFER = [
  'Customer: all customers',
  'Product: SRTKS7646',
  'Dates: 01/08/2026 to 31/08/2026',
  '',
  "Here's what you want:",
  '• product: SRTKS7646 (+1 more)',
  '',
  'But no order from 2026-08-01 to 2026-08-31 matched these. Would you like me to escalate to *Sorento* customer service team?',
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
