// ── tests/flow/customer-picker.test.js — lane "customer picker": gate -> ... -> cs-offer-gate ──
//
// WHY THIS FILE EXISTS. The customer-picker set adds three nodes and, more importantly, RE-ROUTES
// an existing edge: `If-incoming-picker[false]` used to go straight to `not-found-error-message`
// and now goes through `If-customer-picker`. `tests/fixtures/wiring.json` pins per-node params and
// an executeWorkflow node's target — it pins NOTHING about connections, and no unit fixture can
// see an edge at all. So the splice ships with zero coverage unless something walks it.
//
// AND THE SPLICE IS NOT COSMETIC — IT ARMS A CS ASSIGNMENT. `annotate-customer-picker` sets
// `is_clarification = false` (parity with the not-found require_specific branch), so
// `escalate-catalog` computes `is_escalate_offer = true`, so cs-offer-gate's g1 holds; on an
// `order` turn the parser routes `customer_service` / `order_enquiries`, so g2 and g3 hold too
// (measured 7/7). Live escapes this today only because the INCOMING picker routes `purchasing`.
// With g1..g3 all true the customer would be shown the company picker AND a CS member roster in
// one message, `compile-current-state`'s `_mem` arm would REPLACE `last_result_set` with the
// member roster and stamp `selection_context: 'member_offer'`, and a reply of "2" meaning *the
// second company* would resolve against CS MEMBERS -> `preferred_assignee_id` -> a real
// assignment with the staff email/WhatsApp ripple. `g4-no-double-picker` is what stops that, and
// this test is what stops g4 being dropped.
//
// The lane is driven from hand-built ctx rather than a captured execution because there is no
// captured execution to use: `customer_probe_entities` has no producer on live until this set
// lands, so no historical turn ever walked this path.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { runLane, evalConditionGroup } = require('../harness/run-lane');
const { buildSandbox } = require('../harness/n8n-shim');
const { loadWorkflow, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'disallowed-entity-gate';
const END = 'compile-current-state';

// An `order` turn naming a customer token that fuzzy-resolves to two unrelated companies.
// `order` is NOT in the gate's REQUIRE_SPECIFIC_DOMAINS, so the only thing that can raise a
// picker here is G-A — the block this set adds.
const cust = (uuid, code, name) => ({
  entity_type: 'customer', uuid, canonical_code: code, match_tier: 'fuzzy',
  display: { customer_name: name },
});
const PARSER = {
  message_type: 'business_query',
  intent_hint: 'check_order',
  domain_hint: 'order',
  user_goal: 'checking recent deliveries',
  // g2 + g3: these are what make the CS member offer eligible on an order turn. They are NOT
  // decoration — flip either one and the test stops proving anything, because g4 would no longer
  // be the condition doing the work.
  routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
  escalation: {},
  entities: [{ raw: '4 smart', hint: 'customer', current_message: true }],
};
const RESOLVER = {
  match_mode: 'or',
  tokens: ['4 smart'],
  unresolved_tokens: [],
  resolutions: [{ token: '4 smart', resolved: false, ambiguous: true, matches: [
    cust('cu1', '300-A001', '4 SMART PLUS SDN BHD'),
    cust('cu2', '300-B002', 'SB SMART CONCEPT SDN BHD'),
  ] }],
};
// probe-customer-orders is an executeWorkflow node — run-lane stubs it. One of the two companies
// has a matching delivery, so the reply carries BOTH suffixes and the em-dash assertion below has
// something to bite on.
const PROBE_STUB = [{ json: { answers: [{
  title: 'DO-2026-0001',
  fields: [{ label: 'Customer', value: '4 SMART PLUS SDN BHD [A/C I]' }],
}] } }];

function baseCtx() {
  return {
    "Call 'sub-query-reformulator'": [{ json: { output: PARSER } }],
    'resolve-entity': [{ json: RESOLVER }],
    'sorento-sub-respond-findcontact-respond': [{ json: { id: 900000003 } }],
    'probe-customer-orders': PROBE_STUB,
  };
}

const EXPECTED_PATH = [
  'disallowed-entity-gate', 'If3', 'If-incoming-picker', 'If-customer-picker',
  'probe-customer-orders', 'annotate-customer-picker', 'build-suggest-offer',
  'tag-not-found', 'escalate-catalog', 'cs-offer-gate', 'compile-current-state',
];

function drive(workflowJson) {
  return runLane({
    slug: SLUG,
    start: START,
    end: END,
    ctx: baseCtx(),
    input: [{ json: RESOLVER }],   // resolve-entity is the gate's real predecessor
    workflowJson,
  });
}

test('flow: customer-picker (disallowed-entity-gate -> cs-offer-gate FALSE -> compile-current-state)', async (t) => {
  const wf = loadWorkflow(SLUG);

  await t.test('the spliced lane is walked end to end', () => {
    const res = drive();
    assert.deepStrictEqual(res.path, EXPECTED_PATH,
      'the re-routed If-incoming-picker[false] edge must reach the customer picker and come back out at compile-current-state');
  });

  await t.test('cs-offer-gate evaluates FALSE — no CS member roster on a picker turn', () => {
    const res = drive();
    // The gate itself is an If node; run-lane records the branch by which node it walked to next.
    const i = res.path.indexOf('cs-offer-gate');
    assert.ok(i > 0, 'cs-offer-gate must be on the path at all');
    assert.equal(res.path[i + 1], 'compile-current-state',
      'cs-offer-gate must take its FALSE edge; cs-roster-plan here means the customer gets two numbered lists and a live assign path');
    assert.ok(!res.path.includes('cs-roster-plan'), 'the CS roster must never be built on a picker turn');
  });

  await t.test('g1, g2 and g3 ALL hold — g4 is the only thing refusing the roster', () => {
    // Without this, the test above could pass for the wrong reason (e.g. a typo in the routing
    // fixture making g2 false) and would keep passing with g4 deleted. Re-evaluate the SAME
    // condition block against the SAME lane state, once as shipped and once with g4 removed: as
    // shipped it must be false, without g4 it must be TRUE. That second half is the discrimination
    // proof — it says in one assertion that g1..g3 all hold and that g4 is what turns the gate off.
    const res = drive();
    const cat = jsonNormalize(res.outputs['escalate-catalog'])[0].json;
    assert.equal(cat.is_escalate_offer, true,
      'g1: annotate-customer-picker sets is_clarification=false, so escalate-catalog calls this an escalate offer');

    const shipped = wf.nodes.find((n) => n.name === 'cs-offer-gate').parameters.conditions;
    const ids = shipped.conditions.map((c) => c.id);
    assert.deepStrictEqual(ids, ['g1', 'g2', 'g3', 'g4-no-double-picker'],
      'the gate must carry exactly the three shipped conditions plus g4');
    const withoutG4 = { ...shipped, conditions: shipped.conditions.filter((c) => c.id !== 'g4-no-double-picker') };
    assert.equal(withoutG4.conditions.length, shipped.conditions.length - 1,
      'the mutation must actually remove a condition — a no-op mutation would certify this gate without testing it');

    const laneCtx = { ...baseCtx(), ...res.outputs };
    const evalWith = (block) => evalConditionGroup(
      block, vm.createContext(buildSandbox({ ctx: laneCtx, input: res.outputs['escalate-catalog'] })), 'cs-offer-gate');

    assert.equal(evalWith(withoutG4), true,
      'g1 AND g2 AND g3 all hold on this turn — so nothing but g4 is standing between the customer and a CS member roster');
    assert.equal(evalWith(shipped), false,
      'g4-no-double-picker must turn the same turn off');
  });

  await t.test('the customer-facing reply carries the annotation, with a plain hyphen', () => {
    const res = drive();
    const out = jsonNormalize(res.end)[0].json;
    const reply = out.user_response;
    assert.equal(typeof reply, 'string', 'compile-current-state must produce a reply');
    assert.ok(reply.includes('Which customer do you mean?'), 'the picker must reach the customer: ' + JSON.stringify(reply));
    assert.ok(reply.includes('1. 4 SMART PLUS SDN BHD - has delivery'), 'the probed company is annotated: ' + JSON.stringify(reply));
    assert.ok(reply.includes('2. SB SMART CONCEPT SDN BHD - no delivery'), 'the unprobed-negative company is annotated: ' + JSON.stringify(reply));
    // Captain hard rule 2026-08-22. Asserted on what the CUSTOMER receives, not on the producing
    // node — the annotation is computed in annotate-customer-picker, spread through
    // build-suggest-offer, and re-sourced BY NAME by escalate-catalog, so only the end of the lane
    // can prove the right string survived all three (LESSONS §63).
    assert.ok(!reply.includes('—'), 'no em-dash may reach the customer: ' + JSON.stringify(reply));
  });

  await t.test('the picker roster is persisted, and it is the COMPANY roster', () => {
    const res = drive();
    const v = jsonNormalize(res.end)[0].json.variables;
    assert.equal(v.selection_context, 'disambiguation',
      'the next bare number must resolve against the company picker');
    assert.equal(v.picker_selection_context, 'disambiguation');
    assert.deepStrictEqual(v.last_result_set.map((r) => r.label),
      ['4 SMART PLUS SDN BHD', 'SB SMART CONCEPT SDN BHD'],
      'the roster rows must be the companies, in the order they were numbered');
    assert.ok(v.picker_families && Object.keys(v.picker_families).length === 2,
      'the account families the probe counted must be persisted for the pick turn');
  });

  // Keeps the connection assertions honest about which graph they read: if someone rewires the
  // splice in workflow.json, EXPECTED_PATH above is what fails, and this says so in one line.
  await t.test('the three new nodes exist and are wired as the diff describes', () => {
    const c = wf.connections;
    assert.deepStrictEqual(c['If-incoming-picker'].main[1], [{ node: 'If-customer-picker', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['If-incoming-picker'].main[0], [{ node: 'probe-incoming', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['If-customer-picker'].main[0], [{ node: 'probe-customer-orders', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['If-customer-picker'].main[1], [{ node: 'not-found-error-message', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['probe-customer-orders'].main[0], [{ node: 'annotate-customer-picker', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['annotate-customer-picker'].main[0], [{ node: 'build-suggest-offer', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['If3'].main[0], [{ node: 'If-incoming-picker', type: 'main', index: 0 }]);
    assert.deepStrictEqual(c['Aggregate1'].main[0], [{ node: 'not-found-error-message', type: 'main', index: 0 }]);
  });
});
