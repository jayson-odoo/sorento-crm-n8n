// ── open-offer-carry.test.js - an offer the customer never answered stays open ────────────────
//
// THE CAPTAIN'S RULE (2026-08-24): every open offer is sticky. If the bot has offered a numbered
// choice and the customer has not answered it, a later bare numeric reply resolves against THAT
// OFFER, not against whatever answer list happens to be the most recent thing on screen. It holds
// for every offer kind - the customer picker, the incoming picker, the product-attachment picker,
// the promotion tier ask and the CS member offer.
//
// compile-current-state already had the right mechanism for ONE of those kinds: it parks the
// roster in `picker_last_result_set` and, while the roster is alive, re-seats it as
// `last_result_set` so the existing positional machinery keeps resolving picks against the offer.
// It had two limits, and this suite governs both:
//
//   LIMIT 1 - the carry died on a domain change (`picker_domain === qf.domain_hint`). Asking
//     about something else abandoned an offer the customer never answered. The captain reversed
//     that decision on 2026-08-24: a NEW QUESTION abandons an offer, a change of SUBJECT does not.
//   LIMIT 2 - it only covered `require_specific` pickers. The CS member offer and the tier ask
//     build their rosters elsewhere (`cs_last_result_set` / `tier_last_result_set`), so an
//     intervening answer wiped them.
//
// THE OFFER KIND IS PART OF THE OFFER. `sub-semantic-parser-FORK/output_exchange` routes on
// `selection_context`: 'member_offer' opens the Δ3 member-pick arm, 'tier_offer' opens
// tierOfferPick, 'disambiguation' opens the positional/"all" arms. Re-seating a carried member
// offer as 'disambiguation' would resolve the customer's "2" in the wrong arm entirely, so the
// born-with kind rides along with the roster and is what gets re-seated.
//
// MUST NOT REGRESS: `_cpFreshTyped` stays the abandon signal, judged on the LLM's OWN raw entity
// list (execs 13238271 / 13238351). A freshly typed enquiry drops the roster; without that, one
// stale offer would hijack every number the customer ever types again.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const NODE = 'compile-current-state';

const CUSTOMER_ROWS = [
  { entity_type: 'customer', uuid: 'c1', code: 'DELUXE HOME CENTRE SDN BHD (SETAPAK)' },
  { entity_type: 'customer', uuid: 'c2', code: 'DELUXE HOME CENTRE SDN BHD - KEPONG' },
];
const FAMILIES = { 'DELUXE HOME CENTRE': ['c1', 'c2'] };
const MEMBER_ROWS = [
  { idx: 1, label: 'Person 3', uuid: 'm1', respond_user_id: '1144607' },
  { idx: 2, label: 'Person 4', uuid: 'm2', respond_user_id: '1144608' },
];
const TIER_ROWS = [
  { idx: 1, label: 'Sorento Dealer', tier: 'dealer' },
  { idx: 2, label: 'Sorento Office', tier: 'office' },
];
// Envelope items, the shape central-exchange emits: compile-current-state indexes them and takes
// `label` off `title`, which is why the expected labels are spelled out rather than mapped.
const ANSWER_ROWS = [
  { title: 'DO-202608-3719', uuid: 'o1', fields: [] },
  { title: 'DO-202608-3720', uuid: 'o2', fields: [] },
];
const ANSWER_LABELS = ['DO-202608-3719', 'DO-202608-3720'];

// A freshly TYPED product code - the abandon signal, as the LLM itself emitted it.
const TYPED = [{ raw: 'WESERP10B', hint: 'product', canonical_code: null, current_message: true }];

// One turn through compile-current-state. Only the upstream nodes a given lane actually ran are
// declared in `ctx`: the shim's `isExecuted` is exactly "this fixture declares the node ran", so
// omitting a node is how a lane that skipped it is expressed.
function turn({ prev = {}, domain = 'order', rawEntities = [], entities = [], answer = null, gate = null, member = null, tier = null }) {
  const ctx = {
    "Call 'sub-query-reformulator'": [{
      json: {
        output: {
          message_type: 'business_query', intent_hint: 'check_order', domain_hint: domain,
          user_goal: 'x', query_scope: null, query_brands: [], access_levels: [],
          entities, routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
          escalation: { is_escalation_confirmation: false },
          date_filter_start: null, date_filter_end: null, date_mode: null, match_mode: 'and',
          contains_flyer: false, reference_positions: [], reference_target: null,
        },
        _parser_raw: { entities: rawEntities },
      },
    }],
    'sorento-sub-respond-findcontact-respond': [{ json: { id: '900000001' } }],
    'get-session-vars': [{ json: { session_vars: { variables: prev } } }],
  };
  if (answer) ctx['central-exchange'] = [{ json: { response: 'Here are your delivery orders', items: answer } }];
  if (gate) ctx['disallowed-entity-gate'] = [{ json: gate }];
  if (member) ctx['build-cs-member-offer'] = [{ json: member }];
  if (tier) ctx['access-level-choice-message'] = [{ json: tier }];

  const body = loadNodes(SLUG, [`${NODE}.js`])[`${NODE}.js`];
  const out = runNode({ body, fixture: { ctx, input: [{ json: {} }] }, slug: SLUG, nodeName: NODE });
  return (Array.isArray(out) ? out[0].json : out).variables;
}

// The three offer-BORN turns, each built the way its own lane builds it.
const bornPicker = () => turn({
  domain: 'order',
  gate: { require_specific: true, compatible_entities: CUSTOMER_ROWS, picker_families: FAMILIES },
});
const bornMember = () => turn({
  domain: 'order',
  member: {
    response: "…Would you like me to escalate to customer_service team?\n1. Person 3\n2. Person 4",
    manualResponse: true, includeResponse: true,
    selection_context: 'member_offer', cs_last_result_set: MEMBER_ROWS,
  },
});
const bornTier = () => turn({
  domain: 'promotion',
  tier: { tier_offer: true, tier_last_result_set: TIER_ROWS, quick_reply: [] },
});

// An answer turn that names nothing new: a bare "all" / "2" continuation. The LLM's raw entity
// list is empty, so `_cpFreshTyped` is false and the open offer must survive.
const intervening = (prev, domain) => turn({ prev, domain, answer: ANSWER_ROWS });

const labels = (rows) => (rows || []).map(r => r.label);

// ── LIMIT 1 · a domain change is a change of SUBJECT, not a new question ──────────────────────
// Before: the carry required `_cpPrev.picker_domain === qf.domain_hint`, so asking about a
// promotion abandoned a customer picker the customer had never answered.
test('an open customer picker survives a DOMAIN CHANGE (captain, 2026-08-24)', () => {
  const after = bornPicker();
  assert.equal(after.selection_context, 'disambiguation', 'the picker turn arms the positional context');
  assert.deepEqual(labels(after.picker_last_result_set), labels(after.last_result_set), 'the picker turn parks its own roster');

  const next = intervening(after, 'promotion');
  assert.deepEqual(
    labels(next.picker_last_result_set), labels(after.picker_last_result_set),
    'a change of subject must not abandon an offer the customer never answered',
  );
  assert.deepEqual(
    labels(next.last_result_set), labels(after.picker_last_result_set),
    'the roster is re-seated, so the next bare number resolves against the picker, not the answer rows',
  );
  assert.equal(next.selection_context, 'disambiguation', 'a carried picker keeps the picker kind');
  assert.deepEqual(next.picker_families, FAMILIES, 'the roster and its account families travel together (commit 8395dcd)');
});

// ── LIMIT 2a · the CS member offer is an offer too ────────────────────────────────────────────
// Re-seating it as 'disambiguation' would send the customer's "2" to the positional arm instead
// of output_exchange's Δ3 member-pick arm, so the kind is asserted, not just the roster.
test('an open CS MEMBER offer survives an intervening answer and re-seats as member_offer', () => {
  const after = bornMember();
  assert.equal(after.selection_context, 'member_offer');
  assert.deepEqual(labels(after.picker_last_result_set), labels(MEMBER_ROWS), 'the member offer parks its roster like any other offer');

  const next = intervening(after, 'order');
  assert.deepEqual(labels(next.last_result_set), labels(MEMBER_ROWS), 'an intervening answer must not wipe an unanswered member offer');
  assert.equal(next.selection_context, 'member_offer', "a carried member offer must reach the parser's Δ3 arm, not the disambiguation arm");
});

// ── LIMIT 2b · the promotion tier ask likewise ────────────────────────────────────────────────
test('an open TIER offer survives an intervening answer and re-seats as tier_offer', () => {
  const after = bornTier();
  assert.equal(after.selection_context, 'tier_offer');
  assert.deepEqual(labels(after.picker_last_result_set), labels(TIER_ROWS), 'the tier ask parks its roster like any other offer');

  const next = intervening(after, 'order');
  assert.deepEqual(labels(next.last_result_set), labels(TIER_ROWS), 'an intervening answer must not wipe an unanswered tier ask');
  assert.equal(next.selection_context, 'tier_offer', 'tierOfferPick is keyed STRICTLY on tier_offer (TA-14) - the kind must survive the carry');
});

// ── MUST NOT REGRESS · a new question still abandons ──────────────────────────────────────────
// Same domain, so nothing but `_cpFreshTyped` stands between the stale roster and the customer.
// If this goes red, one old offer hijacks every number typed for the rest of the session.
test('a freshly typed new enquiry still ABANDONS the offer (execs 13238271 / 13238351)', () => {
  const after = bornPicker();
  const next = turn({ prev: after, domain: 'order', rawEntities: TYPED, entities: TYPED, answer: ANSWER_ROWS });
  assert.equal(next.picker_last_result_set, undefined, 'a genuinely new enquiry drops the roster');
  assert.equal(next.selection_context, null, 'and with it the pick context');
  assert.deepEqual(labels(next.last_result_set), ANSWER_LABELS, "the new question's own answer rows are what a number resolves against");
});
