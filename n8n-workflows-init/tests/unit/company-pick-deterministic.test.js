// ── company-pick-deterministic.test.js — the producer half of the company-pick contract ───────
//
// plans/company-pick-parser.md, scope `deterministic` (§11.2): the live parser gains
// `_coCompanyPick` and its emission arms in `output_exchange`, ported byte-exact from the fork
// export @ 339a66d9 — and NOTHING else. No prompt change (the LLM is never taught company_pick;
// the semantic-fallback `pickLlm` reads only a key the LLM was never asked for, validated against
// the persisted pool). No `_coReprompt`, no `offer_hold` (§5.2: behaviour-neutral on live, where
// `offer-hold-gate` already fires on `member_reprompt`).
//
// tests/unit/_all-nodes.test.js deep-equals every cpick-* fixture already; this file re-asserts
// the LOAD-BEARING decision fields by name, so a fixture re-pin cannot silently flip the contract
// (the same fixture-vs-property split as offer-hold-clarify-divert.test.js). The consumer-side
// contract lives in company-pick-consumer-inert.test.js (incl. the _CO_ALIASES byte-equality).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parserCase } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';
const cse = (name) => parserCase(SLUG, name);

// ── the picks: deterministic, zero LLM help ───────────────────────────────────────────────────
test('a bare offered company name is a pick, scoped, confirmed (Tier 2.5)', () => {
  const o = cse('cpick-bare-name');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true, company_pick: 'Mocha' });
  assert.deepStrictEqual(o.entities, [], 'a pick is not a query - nothing may ride into resolve-entity');
  assert.equal(o.member_pick_context, true);
});

test('the CRM short code resolves through the _CO_ALIASES stopgap to the CANONICAL name', () => {
  const o = cse('cpick-code');
  assert.equal(o.escalation.company_pick, 'Sorento',
    'the consumer keys on the persisted company_name - the alias must never be emitted verbatim');
});

test('"yes mocha" rides the affirmative arm and carries the pick', () => {
  const o = cse('cpick-yes-plus-name');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true, company_pick: 'Mocha' },
    'without the pick this is a plain round-robin yes, which on a multi-company pool re-clarifies');
});

test('capitalisation is the customer typing what the offer printed - it still resolves', () => {
  const o = cse('cpick-capitalised');
  assert.equal(o.escalation.company_pick, 'Mocha');
});

test("plan §8.2's hard case: a person_mention matching no member but exactly one offered company", () => {
  // The ONE arm that converts a reprompt into an assign: the extractor read 'mocha' as a person,
  // zero roster labels matched, and pre-port that fell to the out_of_range reprompt (verified
  // against the 177c50a9 body). The arm must fire only on a zero-member, exactly-one-company
  // resolve - the member ambiguity gate above it and the negator/product guards still veto.
  const o = cse('cpick-person-mention-company');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true, company_pick: 'Mocha' });
  assert.deepStrictEqual(o.entities, []);
  assert.equal(o.member_pick_context, true);
});

test('the open-offer block picks with no member roster at all (the C4 no-roster gap)', () => {
  const o = cse('cpick-open-offer-no-rows');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true, company_pick: 'Mocha' });
  assert.equal(o.member_pick_context, true);
});

// ── the refusals: every one fail-closed, no assign ────────────────────────────────────────────
test('a company whose roster was never offered cannot be picked (rev-4(A): plan IS the pool)', () => {
  const o = cse('cpick-not-offered');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true },
    'the reply degrades to the plain yes it is without the unoffered company word');
});

test('a bare unoffered name has no signal at all - the ask goes out again, nothing is assigned', () => {
  const o = cse('cpick-not-offered-bare');
  assert.equal(o.escalation.is_escalation_confirmation, false);
  assert.equal(o.escalation.member_reprompt, 'out_of_range');
  assert.ok(!('company_pick' in o.escalation));
});

test('a negator refuses the pick - never assign against a stated negative (rev-4(D))', () => {
  const o = cse('cpick-negated');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false, escalation_declined: true });
});

test('two companies named is ambiguous - no pick, NEVER auto-pick', () => {
  const o = cse('cpick-two-named');
  assert.ok(!('company_pick' in o.escalation));
  assert.equal(o.correction, true,
    'live reprompt semantics kept: correction:true, because _coReprompt did not ship (plan §5.2)');
});

test('a product-code token keeps a new query a new query (rev-4(C), LESSON 39)', () => {
  const o = cse('cpick-product-token');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false });
  assert.notEqual(o.member_pick_context, true, 'Tier 3 abandons the offer without engaging it');
  assert.ok(o.entities.some((e) => e.raw === 'MUB6201' && e.current_message === true),
    'the query entity must survive untouched into normal downstream processing');
});

// ── C1, the safety hunk: a hallucinated pick can never ride through ───────────────────────────
test('C1: an unvalidated LLM company_pick is stripped before any arm can read it', () => {
  const o = cse('cpick-llm-raw-stripped');
  assert.ok(!('company_pick' in o.escalation),
    'the raw key survived to the live escalation object. A hallucinated pick naming a pool company ' +
    'would route a REAL assign the customer never asked for - C1 is a safety hunk, not tidiness.');
  assert.equal(o.escalation.is_escalation_confirmation, false);
});

// ── §5.2: what deliberately did NOT ship ──────────────────────────────────────────────────────
test('U5: an out-of-range number still reprompts with correction:true and no offer_hold', () => {
  const o = cse('cpick-u5-out-of-range-number');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false, member_reprompt: 'out_of_range' });
  assert.equal(o.correction, true);
  assert.ok(!('offer_hold' in o.escalation), '_coReprompt shipped after all - re-read plan §5.2');
});

test('the body carries no _coReprompt and no executable offer_hold', () => {
  const body = fs.readFileSync(
    path.resolve(__dirname, '../../export', SLUG, 'nodes', 'output_exchange.js'), 'utf8');
  assert.ok(!body.includes('_coReprompt'), '_coReprompt is fork-only (plan §5.2)');
  for (const line of body.split('\n')) {
    if (!line.includes('offer_hold')) continue;
    assert.match(line, /^\s*\/\//,
      `offer_hold appears outside a comment: ${line.trim()} - the §5.2 hold was breached`);
  }
});
