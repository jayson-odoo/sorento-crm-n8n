// ── tests/flow/clarify-divert.test.js — lane "clarify-divert": the ungated assign, gated ──────
//
// Stage B set 2 splices two nodes onto the ONE edge leaving escalation-context:
//
//   escalation-context ──▶ clarify-company-gate ──true──▶ clarify-company-reply   (terminal)
//                                                └─false─▶ Call 'sub-human-intervention'   (today's edge)
//
// THE BUG IT CLOSES (open on live as of 2026-08-25). escalation-context resolves
// `routing_source = 'multi_company_unpicked'` with `company_id = null`, and its only downstream
// connection is the human-intervention call, with no gate. So a bare "yes" after a multi-company
// offer the customer never picked from becomes a real round-robin assignment, with the staff
// email/WhatsApp ripple, against a null company.
//
// C4 — AND WHY THE GATE IS NARROW. escalation-context sets that same routing_source on TWO arms and
// they are NOT interchangeable:
//   * rp.length > 1 (the roster-plan arm) — a member picker is open and `last_result_set` holds the
//     rows, so a number or a name resolves the follow-up. Diverting is strictly better: the customer
//     is asked once and then assigned to someone they chose.
//   * cos.length > 1 (the routing_companies arm) — NO member rows. Nothing numeric resolves; the
//     only affordance clarify copy could offer is a company name. When the gate landed the LIVE
//     parser had no handler for that (company_pick: 0 occurrences @ 177c50a9) and diverting THAT
//     arm livelocked the customer. 2026-08-25 (company-pick part 3) the parser CAN now resolve a
//     company on this state (the open-offer _coCompanyPick block, XTODTw @ 8717de6b) — but
//     widening the gate to divert the no-rows arm is a separate measured change with its own
//     livelock analysis, NOT something to ride in with the copy. The gate stays narrow; live's
//     imperfect assignment remains the no-rows behaviour.
// So the gate does not key on routing_source alone. It requires persisted state that can actually
// resolve the next reply: an open `member_offer` with a non-empty `last_result_set`. Case (e) below
// is the proof that landed — it FAILS against the naive `routing_source === 'multi_company_unpicked'`
// gate and passes against this one.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { runLane, evalConditionGroup } = require('../harness/run-lane');
const { buildSandbox } = require('../harness/n8n-shim');
const { loadWorkflow, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'clarify-company-gate';
const HI = "Call 'sub-human-intervention'";

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
const COS2 = [
  { company_id: SORENTO, company_name: 'Sorento', brand_code: 'sorento' },
  { company_id: MOCHA, company_name: 'Mocha', brand_code: 'mocha' },
];

// A bare "yes" on an open escalation offer.
function parser(over = {}) {
  return {
    message_type: 'request_for_help',
    domain_hint: null,
    entities: [],
    query_brands: [],
    is_affirmative: true,
    member_pick_context: true,
    routing: { suggested_team: 'customer_service' },
    escalation: { is_escalation_confirmation: true },
    ...over,
  };
}

function prevState(over = {}) {
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

function ctxFor(output, variables) {
  return {
    "Call 'sub-query-reformulator'": [{ json: { output } }],
    'get-session-vars': [{ json: { respond_io_id: '900000013', session_vars: { variables } } }],
  };
}

const INPUT = [{ json: { branch_kind: 'escalate' } }];
// The HI call is an executeWorkflow node — run-lane can only stub it, which is exactly right here:
// reaching it AT ALL is the thing under test, and a stub means no test can ever assign anyone.
const STUBS = { [HI]: [{ json: { assigned: true } }] };

function walk(ctx, end) {
  return runLane({ slug: SLUG, start: 'escalation-context', end, ctx, input: INPUT, stubs: STUBS,
    execution: { id: 'clarify-divert-flow' } });
}

function gateSays(ctx, input) {
  const wf = loadWorkflow(SLUG);
  const node = wf.nodes.find((n) => n.name === GATE);
  const vmCtx = vm.createContext(buildSandbox({ ctx, input }));
  return evalConditionGroup(node.parameters.conditions, vmCtx, GATE);
}

// ── token lint (same sandbox-parse class as F-R3-4) ──────────────────────────────────────────
test('clarify-company-gate: the expression names no member n8n\'s sandbox refuses', () => {
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

// ── (a) the divert ────────────────────────────────────────────────────────────────────────────
test('flow: (a) rp.length > 1 with an OPEN picker diverts to the clarify reply, and no HI in the path', () => {
  const ctx = ctxFor(parser(), prevState());
  const res = walk(ctx, 'clarify-company-reply');
  assert.deepStrictEqual(res.path, ['escalation-context', GATE, 'clarify-company-reply']);
  assert.ok(!res.path.includes(HI),
    'this is the whole change: no assignment happens on a pool the customer never picked');

  const ec = jsonNormalize(res.outputs['escalation-context'])[0].json;
  assert.equal(ec.routing_source, 'multi_company_unpicked');
  assert.equal(ec.company_id, null, 'the null company that made the live assignment meaningless');

  const reply = jsonNormalize(res.end)[0].json;
  assert.equal(reply.clarify_company, true);
  assert.equal(reply.clarify_text, CLARIFY);
  // C2/C5 flipped 2026-08-25 (company-pick part 3): the ask now offers the company too - the live
  // parser's deterministic _coCompanyPick arm (XTODTw @ 8717de6b) resolves the invited names
  // against this same persisted pool. tests/unit/offer-hold-clarify-divert.test.js cross-checks
  // every invited name against the parser source.
  assert.match(reply.clarify_text, /or the company \(\*Sorento\* \/ \*Mocha\*\)/,
    'the ask must invite exactly the offered pool, bold, in pool order');
});

// ── (b)-(e) every path that must still reach a human ─────────────────────────────────────────
const TO_HUMAN = [
  ['(b) a preferred_assignee_id matching a row is a real pick — assignment must still work',
    parser({ escalation: { is_escalation_confirmation: true, preferred_assignee_id: 'cs-0002' } }),
    prevState(),
    'picked_member'],
  ['(c) a single-company plan resolves the pool outright',
    parser(), prevState({ routing_roster_plan: [PLAN2[0]] }), 'prior_state'],
  ['(d) a team switch drops the axes entirely, there is no pool to clarify',
    parser({ routing: { suggested_team: 'purchasing' } }), prevState(), 'none'],
  ['(e) C4: cos.length > 1 with NO picker must still assign — live is better on this arm',
    parser(),
    prevState({ routing_roster_plan: null, routing_companies: COS2, last_result_set: [], selection_context: null }),
    'multi_company_unpicked'],
];

for (const [why, output, variables, expectedSource] of TO_HUMAN) {
  test(`flow: ${why}`, () => {
    const ctx = ctxFor(output, variables);
    const res = walk(ctx, HI);
    const ec = jsonNormalize(res.outputs['escalation-context'])[0].json;
    assert.equal(ec.routing_source, expectedSource);
    assert.equal(gateSays(ctx, res.outputs['escalation-context']), false);
    assert.deepStrictEqual(res.path, ['escalation-context', GATE, HI],
      'the turn must reach sub-human-intervention exactly as it does today');
  });
}

// Case (e) is the ONLY one of the four whose routing_source is the divert trigger, so it is the only
// one a naive gate would get wrong. Spell that out rather than leaving it implied by the loop.
test('C4 proof: the naive routing_source-only gate WOULD have diverted case (e), this one does not', () => {
  const ctx = ctxFor(parser(),
    prevState({ routing_roster_plan: null, routing_companies: COS2, last_result_set: [], selection_context: null }));
  const ec = jsonNormalize(walk(ctx, HI).outputs['escalation-context'])[0].json;
  assert.equal(ec.routing_source, 'multi_company_unpicked',
    'the naive gate `$json.routing_source === "multi_company_unpicked"` is TRUE here');
  assert.equal(gateSays(ctx, [{ json: ec }]), false,
    'C4: with no member rows nothing numeric resolves. The parser CAN now resolve a company here ' +
    '(part 3, open-offer _coCompanyPick), but widening this gate to divert the no-rows arm is a ' +
    'separate measured change - until it is made, the gate must keep requiring an open ' +
    'member_offer with rows before it takes the assignment away.');
});

// ── structure ────────────────────────────────────────────────────────────────────────────────
test('clarify-divert: the wiring is exactly the two spliced edges, and HI still points at the live sub', () => {
  const wf = loadWorkflow(SLUG);
  const conns = wf.connections || {};
  assert.deepStrictEqual(conns['escalation-context'].main, [[{ index: 0, node: GATE, type: 'main' }]]);
  assert.deepStrictEqual(conns[GATE].main, [
    [{ index: 0, node: 'clarify-company-reply', type: 'main' }],
    [{ index: 0, node: HI, type: 'main' }],
  ]);
  assert.equal(conns['clarify-company-reply'], undefined,
    'clarify-company-reply is TERMINAL: compile-current-state reads it by name, it sends nothing');
  const intoHI = Object.entries(conns)
    .filter(([, v]) => JSON.stringify(v).includes(JSON.stringify(HI).slice(1, -1)))
    .map(([k]) => k).sort();
  assert.deepStrictEqual(intoHI, [GATE], 'nothing else may still call the assignment sub directly');

  const hiNode = wf.nodes.find((n) => n.name === HI);
  assert.equal(hiNode.parameters.workflowId.value, 'rrYXzE61gCNUck_zmXe-G',
    'the LIVE published sub-human-intervention, never the clone fork vUfFUDjLAuMaeQE6');
});

// ── CANVAS GEOMETRY IS LOAD-BEARING ──────────────────────────────────────────────────────────
// `divert-suggest-yes[1]` fans out to BOTH escalation-context and tag-out-of-scope. The clarify
// reply only composes because escalation-context's branch runs FIRST, and under executionOrder v1
// that ordering is decided by canvas Y position, not by array order. If someone drags
// tag-out-of-scope above escalation-context, compile-current-state runs before the reply exists and
// the customer gets silence — with every other test in this file still green.
test('divert-suggest-yes: escalation-context still sorts ABOVE tag-out-of-scope on the canvas', () => {
  const wf = loadWorkflow(SLUG);
  const pos = (n) => wf.nodes.find((x) => x.name === n).position;
  assert.deepStrictEqual(wf.connections['divert-suggest-yes'].main[1].map((e) => e.node).sort(),
    ['escalation-context', 'tag-out-of-scope']);
  assert.equal(wf.settings.executionOrder, 'v1');
  assert.ok(pos('escalation-context')[1] < pos('tag-out-of-scope')[1],
    `escalation-context (y=${pos('escalation-context')[1]}) must stay above tag-out-of-scope ` +
    `(y=${pos('tag-out-of-scope')[1]})`);
  assert.deepStrictEqual(pos('escalation-context'), [12080, 1904], 'unmoved by Stage B');
  assert.deepStrictEqual(pos('tag-out-of-scope'), [10512, 2048], 'unmoved by Stage B');
});
