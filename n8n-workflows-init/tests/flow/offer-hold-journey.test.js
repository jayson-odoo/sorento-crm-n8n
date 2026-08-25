// ── tests/flow/offer-hold-journey.test.js — three turns, no assignment, offer closes cleanly ──
//
// Stage B sets 1+2 ship together on purpose, and the reason is a sequence, not a node:
//
//   turn 1  a multi-company CS member offer is made        -> the picker is armed and persisted
//   turn 2  the customer replies with something unresolvable -> HELD: the same ask is re-printed and
//                                                              the whole offer is re-persisted
//   turn 3  the customer says "no"                          -> the offer is dropped for good
//
// Before this change turn 2 destroyed the offer (captain console, exec 12910575: "srt" -> parser
// out_of_range -> `casual` -> clarification LLM -> "Hi there!" persisted, selection_context and
// last_result_set gone). And offer-hold ALONE would have made the OTHER half worse: today an
// unresolved reply nulls `routing_roster_plan`, so a later "yes" lands on escalation-context's
// `cos.length > 1` arm; holding the plan makes that same "yes" land on `rp.length > 1` instead.
// Both arms are the same ungated assign, so shipping set 1 without set 2 only changes which line
// produces the wrong assignment. Hence one test that walks the whole sequence.
//
// The invariant under test across all three turns: NOBODY IS ASSIGNED. Not on the offer, not on the
// hold, not on the decline. An assignment fires the staff email/WhatsApp ripple, so a stray one is
// the expensive failure here, not a clumsy sentence.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { runNode, normalizeReturn } = require('../harness/n8n-shim');
const { loadNodes } = require('../offline/node-source');
const { loadWorkflow, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const HI = "Call 'sub-human-intervention'";
const CCS = 'compile-current-state';

const SORENTO = '00000000-0000-0000-0000-000000000001';
const MOCHA = '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2';
const CLARIFY =
  "Both *Sorento* and *Mocha* teams are listed - reply a number or a name and I'll assign automatically.";

const CONTACT = [{ json: { id: 900000013 } }];
const ccsBody = () => loadNodes(SLUG, [`${CCS}.js`])[`${CCS}.js`];

function runCcs(ctx, input) {
  const raw = runNode({ body: ccsBody(), fixture: { ctx, input, runIndex: 0 }, slug: SLUG, nodeName: CCS });
  return jsonNormalize(normalizeReturn(raw))[0].json;
}

function session(variables) {
  return [{ json: { respond_io_id: '900000013', session_vars: { variables } } }];
}

// ── turn 1: the offer ────────────────────────────────────────────────────────────────────────
// A two-company CS member offer, built the way the escalate lane builds it: cs-offer-gate TRUE ->
// cs-roster-plan -> get-cs-members -> build-cs-member-offer -> compile-current-state.
const T1_PARSER = {
  message_type: 'business_query',
  intent_hint: 'check_delivery_order',
  domain_hint: 'order',
  user_goal: 'chasing a delivery order',
  entities: [],
  routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
  escalation: {},
};

const T1_CTX = {
  "Call 'sub-query-reformulator'": [{ json: { output: T1_PARSER } }],
  'sorento-sub-respond-findcontact-respond': CONTACT,
  'disallowed-entity-gate': [{ json: {
    routing_companies: [
      { company_id: SORENTO, company_name: 'Sorento', brand_code: 'sorento', codes: [] },
      { company_id: MOCHA, company_name: 'Mocha', brand_code: 'mocha', codes: [] },
    ],
    routing_brand: null, routing_brand_source: null, routing_company: null,
  } }],
  'cs-roster-plan': [
    { json: { plan_idx: 0, company_id: SORENTO, company_name: 'Sorento', brand_code: 'sorento' } },
    { json: { plan_idx: 1, company_id: MOCHA, company_name: 'Mocha', brand_code: 'mocha' } },
  ],
  // Shaped exactly as export/.../nodes/build-cs-member-offer.js's own final assignment builds it:
  // the catalog's escalate-offer line (carrying the FROZEN /would you like me to escalate/i prefix
  // the parser's confirmation arm keys on), then the numbered picker, then the 'yes' fallback.
  'build-cs-member-offer': [{ json: {
    response: 'I am sorry the provided answer does not meet your requirements. Would you like me to escalate to customer_service team?\n\n'
      + 'Please choose who to route to (reply with the number):\n1. Aisyah Rahman (Sorento)\n2. Wong Mei Ling (Mocha)\n\n'
      + "If you have no preference, just reply 'yes' and we'll assign automatically.",
    manualResponse: true,
    includeResponse: true,
    member_offer: true,
    selection_context: 'member_offer',
    cs_last_result_set: [
      { idx: 1, uuid: 'cs-0001', label: 'Aisyah Rahman', company_id: SORENTO, company_name: 'Sorento' },
      { idx: 2, uuid: 'cs-0002', label: 'Wong Mei Ling', company_id: MOCHA, company_name: 'Mocha' },
    ],
    routing_companies: [
      { company_id: SORENTO, company_name: 'Sorento', brand_code: 'sorento' },
      { company_id: MOCHA, company_name: 'Mocha', brand_code: 'mocha' },
    ],
  } }],
};

// ── turns 2 and 3 walk the real lane, from If-ideate all the way to compile-current-state ────
function walk(ctx) {
  return runLane({ slug: SLUG, start: 'If-ideate', end: CCS, ctx,
    input: [{ json: { turn: 'journey' } }], execution: { id: 'offer-hold-journey' } });
}

const T2_PARSER = {
  message_type: 'casual',
  intent_hint: null,
  domain_hint: null,
  user_goal: 'typed something the open offer could not resolve',
  entities: [],
  correction: true,
  member_pick_context: true,
  routing: { suggested_team: 'customer_service' },
  escalation: { is_escalation_confirmation: false, member_reprompt: 'out_of_range' },
};

const T3_PARSER = {
  message_type: 'casual',
  intent_hint: null,
  domain_hint: null,
  user_goal: 'declined the escalation',
  entities: [],
  is_affirmative: false,
  member_pick_context: true,
  routing: { suggested_team: 'customer_service' },
  escalation: { is_escalation_confirmation: false, escalation_declined: true },
};

const SIX = ['response', 'last_result_set', 'selection_context',
  'routing_roster_plan', 'routing_company', 'routing_companies'];

test('journey: offer -> unresolvable reply -> "no" assigns nobody and closes the offer', () => {
  // ── turn 1 ──────────────────────────────────────────────────────────────────────────────────
  const t1 = runCcs(T1_CTX, [{ json: { branch_kind: 'escalate' } }]);
  const s1 = t1.variables;
  assert.equal(s1.selection_context, 'member_offer', 'turn 1 must arm the picker');
  assert.equal(s1.last_result_set.length, 2, 'both members are on the roster the customer was shown');
  assert.equal(s1.routing_roster_plan.length, 2, 'and the pool identity is two companies');
  assert.equal(s1.routing_company, null, 'nobody has been narrowed to a company yet');

  // ── turn 2: the hold ────────────────────────────────────────────────────────────────────────
  const t2ctx = {
    "Call 'sub-query-reformulator'": [{ json: { output: T2_PARSER } }],
    'sorento-sub-respond-findcontact-respond': CONTACT,
    'get-session-vars': session(s1),
  };
  const t2lane = walk(t2ctx);
  assert.deepStrictEqual(t2lane.path, [
    'If-ideate', 'offer-hold-gate', 'offer-hold-reply', 'tag-offer-hold',
    'escalate-catalog', 'cs-offer-gate', CCS,
  ]);
  assert.ok(!t2lane.path.includes(HI), 'turn 2 must not assign');

  const t2 = jsonNormalize(t2lane.end)[0].json;
  const s2 = t2.variables;
  assert.equal(t2.user_response, CLARIFY, 'the customer is asked again, in the same words');
  for (const k of SIX) {
    assert.deepStrictEqual(s2[k], s1[k],
      `turn 2 must re-persist ${k} verbatim - this is the field the clarification LLM used to eat`);
  }
  assert.match(s2.response, /would you like me to escalate/i);

  // ── turn 3: the decline ─────────────────────────────────────────────────────────────────────
  const t3ctx = {
    "Call 'sub-query-reformulator'": [{ json: { output: T3_PARSER } }],
    'sorento-sub-respond-findcontact-respond': CONTACT,
    'get-session-vars': session(s2),
  };
  const t3lane = walk(t3ctx);
  assert.deepStrictEqual(t3lane.path, [
    'If-ideate', 'offer-hold-gate', 'If10', 'is-escalation-declined', 'tag-escalation-declined',
    'escalate-catalog', 'cs-offer-gate', CCS,
  ], 'a decline must go straight down the declined lane - offer-hold-gate must NOT re-print the ask');
  assert.ok(!t3lane.path.includes(HI), 'turn 3 must not assign');

  const t3 = jsonNormalize(t3lane.end)[0].json;
  assert.equal(t3.user_response, 'Escalation declined.');
  assert.equal(t3.variables.selection_context, null,
    'the offer is over: leaving the picker armed is Stage A finding 1, where a later "yes" ' +
    'resurrected a declined escalation into a real assignment');
  assert.doesNotMatch(String(t3.variables.response || ''), /would you like me to escalate/i,
    'and the frozen phrase must not survive either, or the confirmation arm still has something to key on');
});

// The turn-1 claim above is a lane the walker does not cover, so back it with the structural fact:
// after Stage B set 2 the assignment sub has exactly ONE caller, and it is behind the gate.
test('journey: the assignment sub has exactly one caller on the whole spine, and it is gated', () => {
  const wf = loadWorkflow(SLUG);
  const callers = Object.entries(wf.connections || {})
    .filter(([, v]) => (v.main || []).some((o) => (o || []).some((e) => e.node === HI)))
    .map(([k]) => k);
  assert.deepStrictEqual(callers, ['clarify-company-gate']);
  assert.deepStrictEqual(wf.connections['clarify-company-gate'].main[1], [{ index: 0, node: HI, type: 'main' }],
    'and it hangs off the gate\'s FALSE edge, so the divert is what suppresses it');
});
