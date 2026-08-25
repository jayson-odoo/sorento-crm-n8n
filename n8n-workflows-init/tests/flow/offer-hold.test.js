// ── tests/flow/offer-hold.test.js — lane "offer-hold": holding an open multi-company offer ────
//
// Stage B set 1 splices three nodes onto the `If-ideate[false] -> If10` edge:
//
//   If-ideate ──false──▶ offer-hold-gate ──true──▶ offer-hold-reply ──▶ tag-offer-hold ──▶ escalate-catalog
//                                       └─false──▶ If10   (today's edge, byte-identical)
//
// WHY. Captain console, exec 12910575: a multi-company member offer was open, the customer typed
// "srt", the parser could not resolve it (member_reprompt 'out_of_range') and classified the turn
// `casual`, so If10 was FALSE, the turn fell through to the clarification LLM, and "Hi there!" was
// persisted as the reply — taking `selection_context` and `last_result_set` with it. The offer the
// customer was in the middle of answering simply evaporated. The gate catches that turn one hop
// earlier and re-prints the same ask instead.
//
// `offer-hold-gate` is an If evaluated on EVERY non-ideate turn, so it has the same blast radius
// `miss-roster-gate` has and gets the same three-part treatment: token lint, it evaluates, it routes.
// The inert-on-the-happy-path half lives in tests/flow/route.test.js, which now walks the gate on
// six real captured executions and requires it to return false on all six.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { runLane, evalConditionGroup } = require('../harness/run-lane');
const { buildSandbox } = require('../harness/n8n-shim');
const { loadWorkflow, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'offer-hold-gate';

const SORENTO = '00000000-0000-0000-0000-000000000001';
const MOCHA = '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2';
const CLARIFY =
  "Both *Sorento* and *Mocha* teams are listed - reply a number, a name, or the company (*Sorento* / *Mocha*) and I'll assign automatically.";

const ROWS = [
  { idx: 1, uuid: 'cs-0001', label: 'Aisyah Rahman', company_id: SORENTO, company_name: 'Sorento' },
  { idx: 2, uuid: 'cs-0002', label: 'Wong Mei Ling', company_id: MOCHA, company_name: 'Mocha' },
];
const PLAN2 = [
  { plan_idx: 0, company_id: SORENTO, company_name: 'Sorento', brand_code: 'sorento' },
  { plan_idx: 1, company_id: MOCHA, company_name: 'Mocha', brand_code: 'mocha' },
];
const PLAN1 = [PLAN2[0]];

// The open offer, as compile-current-state persisted it on the previous turn.
function openOffer(over = {}) {
  return {
    routing: { suggested_team: 'customer_service' },
    response: 'Here are the delivery orders you asked about.\n\nWould you like me to escalate to customer_service team?',
    last_result_set: ROWS,
    selection_context: 'member_offer',
    routing_roster_plan: PLAN2,
    routing_company: null,
    routing_brand: null,
    routing_companies: null,
    ...over,
  };
}

// The parser's own Tier-4 / reprompt output: it stayed IN the offer and resolved nothing.
function parser(over = {}) {
  return {
    message_type: 'casual',
    domain_hint: null,
    correction: true,
    member_pick_context: true,
    routing: { suggested_team: 'customer_service' },
    escalation: { is_escalation_confirmation: false, member_reprompt: 'out_of_range' },
    ...over,
  };
}

function ctxFor({ output, variables }) {
  const ctx = { "Call 'sub-query-reformulator'": [{ json: { output } }] };
  if (variables !== undefined) {
    ctx['get-session-vars'] = [{ json: { respond_io_id: '900000013', session_vars: { variables } } }];
  }
  return ctx;
}

const INPUT = [{ json: { correction: true, message_type: 'casual' } }];

// ── 1. token lint ────────────────────────────────────────────────────────────────────────────
// Same class of fault as F-R3-4 (commit 469cda8): n8n's expression sandbox rejects these property
// names at PARSE time, outside the expression's own try/catch, so the If node errors and the turn
// dies with no reply. A gate on the main line must not name them, comments included.
test('offer-hold-gate: the expression names no member n8n\'s sandbox refuses', () => {
  const wf = loadWorkflow(SLUG);
  const node = wf.nodes.find((n) => n.name === GATE);
  assert.ok(node, `${GATE} is not in export/${SLUG}/workflow.json`);
  assert.equal(node.type, 'n8n-nodes-base.if');
  assert.equal(node.typeVersion, 2.3);
  const raw = node.parameters.conditions.conditions[0].leftValue;
  for (const banned of ['prototype', 'constructor', '__proto__']) {
    assert.ok(!raw.includes(banned), `the gate expression contains "${banned}"`);
  }
});

// ── 2. it evaluates ──────────────────────────────────────────────────────────────────────────
function evaluateGate(ctx, input) {
  const wf = loadWorkflow(SLUG);
  const node = wf.nodes.find((n) => n.name === GATE);
  const vmCtx = vm.createContext(buildSandbox({ ctx, input }));
  return evalConditionGroup(node.parameters.conditions, vmCtx, GATE);
}

test('offer-hold-gate: returns a strict boolean, it does not throw', () => {
  const fires = evaluateGate(ctxFor({ output: parser(), variables: openOffer() }), INPUT);
  assert.equal(typeof fires, 'boolean');
  assert.equal(fires, true);
  // every upstream read missing: still answers false rather than erroring the turn
  assert.equal(evaluateGate({}, INPUT), false);
});

// ── 3. it routes: the six cases ──────────────────────────────────────────────────────────────
// One lane, two ends. The gate's TRUE arm walks all the way to escalate-catalog (which is where C1
// — the `case 'offer_hold':` arm — turns the composed ask into the turn's actual response); every
// fail-closed case must land on If10 having changed nothing about it.
function walk(ctx, end) {
  return runLane({ slug: SLUG, start: 'If-ideate', end, ctx, input: INPUT,
    execution: { id: 'offer-hold-flow' } });
}

test('flow: offer-hold FIRES — out_of_range + member_offer + a 2-company plan takes the new lane', () => {
  const res = walk(ctxFor({ output: parser(), variables: openOffer() }), 'escalate-catalog');
  assert.deepStrictEqual(res.path, [
    'If-ideate', GATE, 'offer-hold-reply', 'tag-offer-hold', 'escalate-catalog',
  ]);
  assert.ok(!res.path.includes('If10'),
    'the whole point is that If10 never sees this turn: its escalate-offer arm and the ' +
    'clarification LLM behind its false edge are what destroyed the open offer');

  const reply = jsonNormalize(res.outputs['offer-hold-reply'])[0].json;
  assert.equal(reply.clarify_company, true);
  assert.equal(reply.clarify_text, CLARIFY);

  // C1: without the `case 'offer_hold':` arm this switch falls through to its initialised
  // defaults and the branch that just tagged itself `offer_hold` emits response '' with
  // manualResponse false — a lie about the turn, and it lets the LLM reshape a frozen ask.
  const cat = jsonNormalize(res.end)[0].json;
  assert.equal(cat.branch_kind, 'offer_hold');
  assert.equal(cat.response, CLARIFY, 'C1: escalate-catalog must carry the composed ask by reference');
  assert.equal(cat.manualResponse, true);
  assert.equal(cat.includeResponse, true);
  assert.equal(cat.is_escalate_offer, false, 'cs-offer-gate must take its FALSE edge, not refetch a roster');
});

// The five fail-closed cases. Each one is a signal the gate requires; drop it and the turn must
// come out on the ORIGINAL If-ideate[false] -> If10 edge, indistinguishable from before this change.
const FAIL_CLOSED = [
  ['a single-company plan is not a multi-company pool',
    { output: parser(), variables: openOffer({ routing_roster_plan: PLAN1 }) }],
  ['an explicit decline must reach is-escalation-declined, never a re-print',
    { output: parser({ escalation: { is_escalation_confirmation: false, escalation_declined: true } }),
      variables: openOffer() }],
  ['a confirmation is a real pick and must be allowed to assign',
    { output: parser({ escalation: { is_escalation_confirmation: true } }), variables: openOffer() }],
  ['a retarget names a different team and abandons this roster',
    { output: parser({ escalation: { is_escalation_confirmation: true, retarget_team: true } }),
      variables: openOffer() }],
  ['no session at all — fail closed rather than compose against nothing',
    { output: parser(), variables: undefined }],
];

for (const [why, spec] of FAIL_CLOSED) {
  test(`flow: offer-hold FAILS CLOSED — ${why}`, () => {
    const ctx = ctxFor(spec);
    assert.equal(evaluateGate(ctx, INPUT), false);
    const res = walk(ctx, 'If10');
    assert.deepStrictEqual(res.path, ['If-ideate', GATE, 'If10'],
      'a turn the gate declines must arrive at If10 exactly as it did before this change');
  });
}

// ── no dangling branch ───────────────────────────────────────────────────────────────────────
test('offer-hold lane: every output of every node this change touched leads somewhere', () => {
  const wf = loadWorkflow(SLUG);
  const conns = wf.connections || {};
  const outs = (name) => (wf.nodes.find((x) => x.name === name).type === 'n8n-nodes-base.if' ? 2 : 1);
  for (const name of ['If-ideate', GATE, 'offer-hold-reply', 'tag-offer-hold']) {
    const main = (conns[name] || {}).main || [];
    for (let i = 0; i < outs(name); i++) {
      assert.ok((main[i] || []).length >= 1, `${name} output ${i} has no outgoing edge`);
    }
  }
  // the displaced edge went to the gate and nowhere else; If10's own two edges are untouched
  assert.deepStrictEqual(conns['If-ideate'].main[0], [{ index: 0, node: 'ideate-turn-http', type: 'main' }]);
  assert.deepStrictEqual(conns['If-ideate'].main[1], [{ index: 0, node: GATE, type: 'main' }]);
  assert.deepStrictEqual(conns[GATE].main[1], [{ index: 0, node: 'If10', type: 'main' }]);
  assert.deepStrictEqual(conns['If10'].main, [
    [{ index: 0, node: 'tag-escalate-offer', type: 'main' }],
    [{ index: 0, node: 'is-escalation-declined', type: 'main' }],
  ]);
  const intoIf10 = Object.entries(conns)
    .filter(([, v]) => JSON.stringify(v).includes('"If10"')).map(([k]) => k).sort();
  assert.deepStrictEqual(intoIf10, [GATE], 'nothing else may still point at the node the gate displaced');
});
