// ── tests/flow/if3-customer-miss.test.js — lane "If3 customer-miss": the third OR-term ────────
//
// THE LEAK (PR #26, clone-verified as the If3 customer-miss gate). An `order` turn names a
// customer the resolver cannot resolve AND a product it can. The gate then PASSES (the product is
// compatible), `unresolved_tokens` is non-empty but `compatible_entities` is not — so BOTH of
// live's If3 OR-terms are false, the turn walks If3[1] into `Execute 'sub-get-rag'` /
// get-results, and the order query runs scoped by the product alone: the reply lists OTHER
// customers' orders for a question that named one customer. Cross-customer disclosure.
//
// THE PORT (clone expression, verbatim): a third OR-term opens the picker/miss lane when the
// gate's own scope said customer lookup was in play (`gate_debug.allowed_lookup` includes
// 'customer'), the parser emitted a customer entity, and NO customer survived to
// `compatible_entities` — i.e. the customer the turn was about silently fell out of scope.
//
// If3 is a hot-path If evaluated on every turn that reaches it, so this file gives the expression
// the same three-part treatment miss-plain.test.js gives `miss-roster-gate` (F-R3-4 discipline):
//   1. TOKEN LINT — no member name n8n's expression sandbox rejects at parse time.
//   2. IT EVALUATES — a strict boolean, on real captured envelopes AND the synthetic miss shape;
//      and on every real envelope the new expression agrees with the OLD two-term expression
//      unless the customer-miss predicate genuinely holds — "a normal turn stays byte-identical",
//      asserted against every captured envelope this suite has, not against one example.
//   3. IT ROUTES — the synthetic miss turn walks If3[0] into the picker lane and lands on the
//      gated not-found message without ever touching `Execute 'sub-get-rag'`; a real captured
//      happy turn still walks If3[1] straight into `Execute 'sub-get-rag'`.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runLane, evalConditionGroup } = require('../harness/run-lane');
const { buildSandbox } = require('../harness/n8n-shim');
const { loadFixture, loadWorkflow, FIXTURES_ROOT } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'If3';

function gateExpression() {
  const wf = loadWorkflow(SLUG);
  const node = wf.nodes.find((n) => n.name === GATE);
  assert.ok(node, `${GATE} is not in export/${SLUG}/workflow.json`);
  assert.equal(node.type, 'n8n-nodes-base.if');
  return { node, raw: node.parameters.conditions.conditions[0].leftValue };
}

function evaluateGate(ctx, input) {
  const { node } = gateExpression();
  const vmCtx = vm.createContext(buildSandbox({ ctx, input }));
  return evalConditionGroup(node.parameters.conditions, vmCtx, GATE);
}

// ── the synthetic customer-miss turn (the PR #26 shape) ───────────────────────────────────────
// An order turn naming a customer with NO resolver match at all plus a product with an exact one.
// The resolved product is what makes live leak: it keeps compatible_entities non-empty, so the
// second OR-term never fires, and gate_passed stays true, so neither does the first.
const PARSER = {
  message_type: 'business_query',
  intent_hint: 'check_order',
  domain_hint: 'order',
  user_goal: 'checking recent deliveries',
  // purchasing, NOT customer_service: cs-offer-gate's g2 must be false so the lane below proves
  // If3's routing without also opening a CS member roster.
  routing: { suggested_team: 'purchasing', suggested_agent: 'order_enquiries' },
  escalation: {},
  entities: [
    { raw: 'ZZZ UNKNOWN TRADING', hint: 'customer', current_message: true },
    { raw: 'SRTKS7646', hint: 'product', current_message: true },
  ],
};
const RESOLVER = {
  match_mode: 'or',
  tokens: ['ZZZ UNKNOWN TRADING', 'SRTKS7646'],
  unresolved_tokens: ['ZZZ UNKNOWN TRADING'],
  resolutions: [
    { token: 'ZZZ UNKNOWN TRADING', resolved: false, matches: [] },
    { token: 'SRTKS7646', resolved: true, matches: [
      { canonical_code: 'SRTKS7646', uuid: 'p-1', entity_type: 'product', match_tier: 'exact',
        display: { product_name: 'KITCHEN SINK' } },
    ] },
  ],
};

function missCtx() {
  return {
    "Call 'sub-query-reformulator'": [{ json: { output: PARSER } }],
    'resolve-entity': [{ json: RESOLVER }],
    'sorento-sub-respond-findcontact-respond': [{ json: { id: 900000003 } }],
  };
}

// live's PRE-port semantics, computed directly from a ctx — the reference the "byte-identical"
// sweep compares against. Kept as plain JS on the SAME data the expression reads, so it cannot
// drift from what the old two-term expression meant.
function oldTerms(ctx) {
  const gate = ctx['disallowed-entity-gate'][0].json;
  const r = ctx['resolve-entity'][0].json;
  return gate.gate_passed === false ||
    ((r.unresolved_tokens || []).length > 0 && (gate.compatible_entities || []).length === 0);
}
// the ported third term, same construction
function customerMiss(ctx) {
  const gate = ctx['disallowed-entity-gate'][0].json;
  const q = ctx["Call 'sub-query-reformulator'"][0].json.output;
  return (((gate.gate_debug || {}).allowed_lookup) || []).includes('customer')
    && (q.entities || []).some((e) => e && String(e.hint || '').toLowerCase() === 'customer')
    && !((gate.compatible_entities || []).some((c) => c && String(c.entity_type || '').toLowerCase() === 'customer'));
}

// ── 1. token lint ─────────────────────────────────────────────────────────────────────────────
test('If3: the expression names no member n8n\'s sandbox refuses (F-R3-4)', () => {
  const { raw } = gateExpression();
  for (const banned of ['prototype', 'constructor', '__proto__']) {
    assert.ok(!raw.includes(banned),
      `the If3 expression contains "${banned}". n8n's expression sandbox rejects that property ` +
      `name at PARSE time, OUTSIDE any try/catch, so the If node errors and the whole turn dies ` +
      `with no reply — this is F-R3-4 (commit 469cda8) exactly.`);
  }
  // the third OR-term is present and shaped as ported: scope says customer, parser said customer,
  // compatible carried none
  assert.match(raw, /allowed_lookup\) \|\| \[\]\)\.includes\('customer'\)/);
  assert.match(raw, /entities\) \|\| \[\]\)\.some\(/);
  assert.match(raw, /compatible_entities \|\| \[\]\)\.some\(/);
});

// ── 2a. it evaluates: the synthetic miss, and ONLY the third term fires ───────────────────────
test('If3: the customer-miss turn evaluates TRUE, through the third term alone', () => {
  const wf = loadWorkflow(SLUG);
  // run the REAL gate body first so If3 reads the gate output live produces for this shape
  const lane = runLane({
    slug: SLUG, start: 'disallowed-entity-gate', end: 'disallowed-entity-gate',
    ctx: missCtx(), input: [{ json: RESOLVER }], workflowJson: wf,
  });
  const ctx = { ...missCtx(), 'disallowed-entity-gate': lane.end };
  const gateOut = JSON.parse(JSON.stringify(lane.end))[0].json;

  // discrimination scaffolding: both OLD terms are false on this turn — the gate passed and the
  // resolved product kept compatible_entities non-empty. Without these two asserts the TRUE below
  // could come from live's own terms and the test would keep passing with the third term deleted.
  assert.equal(gateOut.gate_passed, true, 'term 1 must NOT be what fires');
  assert.ok((gateOut.compatible_entities || []).length > 0, 'term 2 must NOT be what fires');
  assert.equal(oldTerms(ctx), false, 'live\'s pre-port If3 called this turn FALSE — that is the leak');

  const out = evaluateGate(ctx, ctx['disallowed-entity-gate']);
  assert.equal(typeof out, 'boolean');
  assert.equal(out, true, 'the ported If3 must catch the customer-miss turn');

  // and each leg of the third term is load-bearing: flip one input, the gate closes
  const noCustomerEntity = { ...ctx, "Call 'sub-query-reformulator'": [{ json: { output: {
    ...PARSER, entities: PARSER.entities.filter((e) => e.hint !== 'customer') } } }] };
  assert.equal(evaluateGate(noCustomerEntity, ctx['disallowed-entity-gate']), false,
    'no customer entity from the parser ⇒ nothing was missed ⇒ FALSE');

  const customerSurvived = { ...ctx, 'disallowed-entity-gate': [{ json: {
    ...gateOut, compatible_entities: [...(gateOut.compatible_entities || []),
      { entity_type: 'customer', code: '300-D059', uuid: 'cu-1' }] } }] };
  assert.equal(evaluateGate(customerSurvived, customerSurvived['disallowed-entity-gate']), false,
    'a customer that SURVIVED to compatible_entities was not missed ⇒ FALSE');

  const customerNotInScope = { ...ctx, 'disallowed-entity-gate': [{ json: {
    ...gateOut, gate_debug: { ...(gateOut.gate_debug || {}),
      allowed_lookup: (gateOut.gate_debug.allowed_lookup || []).filter((t) => t !== 'customer') } } }] };
  assert.equal(evaluateGate(customerNotInScope, customerNotInScope['disallowed-entity-gate']), false,
    'a domain whose scope never included customer lookup cannot customer-miss ⇒ FALSE');
});

// ── 2b. it evaluates: EVERY real captured envelope routes exactly as before ───────────────────
// "A normal turn stays byte-identical" as a sweep, not an example: on every captured execution
// envelope this suite has (all three upstream reads present), the shipped expression must agree
// with the old two-term expression — unless the customer-miss predicate genuinely holds on that
// envelope, which is the one behaviour this change exists to add.
test('If3: on every captured envelope, new == old unless the turn IS a customer miss', () => {
  const dir = path.join(FIXTURES_ROOT, SLUG, 'compile-current-state');
  const names = fs.readdirSync(dir).filter((f) => /^exec-.*\.json$/.test(f));
  assert.ok(names.length >= 5, 'the sweep needs the captured envelopes to mean anything');
  let swept = 0;
  for (const name of names) {
    const fx = loadFixture(SLUG, 'compile-current-state', name.replace(/\.json$/, ''));
    const need = ["Call 'sub-query-reformulator'", 'resolve-entity', 'disallowed-entity-gate'];
    if (!need.every((k) => Array.isArray(fx.ctx[k]) && fx.ctx[k].length)) continue;
    swept += 1;
    const out = evaluateGate(fx.ctx, fx.ctx['disallowed-entity-gate']);
    assert.equal(typeof out, 'boolean', `${name}: must evaluate, not throw`);
    const old = oldTerms(fx.ctx);
    if (customerMiss(fx.ctx)) {
      assert.equal(out, true, `${name}: a genuine customer-miss envelope must now open the lane`);
    } else {
      assert.equal(out, old, `${name}: a non-miss turn must route exactly as live routes it today`);
    }
  }
  assert.ok(swept >= 5, `only ${swept} envelopes carried all three upstream reads`);
});

// ── 3a. it routes: the miss turn enters the picker lane and never reaches get-rag ─────────────
test('flow: the customer-miss turn walks If3[0] into the picker lane, to the gated miss message', () => {
  const res = runLane({
    slug: SLUG,
    start: 'disallowed-entity-gate',
    end: 'not-found-error-message',
    ctx: missCtx(),
    input: [{ json: RESOLVER }],   // resolve-entity is the gate's real predecessor
    execution: { id: 'if3-customer-miss-synthetic' },
  });
  assert.deepStrictEqual(res.path, [
    'disallowed-entity-gate',
    GATE,
    'If-incoming-picker',   // FALSE: not a require-specific incoming turn
    'If-customer-picker',   // FALSE: a hard miss has no fuzzy candidates to probe
    'not-found-error-message',
  ], 'the miss turn must take If3[0] and land on the gated not-found lane');
  assert.ok(!res.path.includes("Execute 'sub-get-rag'"),
    'THE LEAK: this turn must never reach get-rag/get-results with the customer silently dropped');
  const msg = JSON.parse(JSON.stringify(res.end))[0].json;
  assert.match(String(msg.escalate_message || msg.response || ''), /ZZZ UNKNOWN TRADING/i,
    'the reply must be about the customer the turn named, not about other customers\' orders');
});

// ── 3b. it routes: a real captured happy turn still walks If3[1] into get-rag ─────────────────
test('flow: a captured answered turn still takes If3[1] -> Execute \'sub-get-rag\'', () => {
  const fx = loadFixture(SLUG, 'compile-current-state', 'exec-13481094');
  assert.equal(customerMiss(fx.ctx), false, 'the reference turn must not be a customer miss');
  const res = runLane({
    slug: SLUG,
    start: GATE,
    end: "Execute 'sub-get-rag'",
    ctx: fx.ctx,
    input: fx.ctx['disallowed-entity-gate'],
    execution: { id: '13481094' },
  });
  assert.deepStrictEqual(res.path, [GATE, "Execute 'sub-get-rag'"],
    'an ordinary answered turn must still take the FALSE edge straight into get-rag');
});

// ── no dangling branch ────────────────────────────────────────────────────────────────────────
test('If3: both outputs still lead somewhere, and the picker lane hangs off If3[0]', () => {
  const wf = loadWorkflow(SLUG);
  const c = wf.connections;
  assert.deepStrictEqual(c[GATE].main[0], [{ index: 0, node: 'If-incoming-picker', type: 'main' }]);
  assert.deepStrictEqual(c[GATE].main[1], [{ index: 0, node: "Execute 'sub-get-rag'", type: 'main' }]);
});
