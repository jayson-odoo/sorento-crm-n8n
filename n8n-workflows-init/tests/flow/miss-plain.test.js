// ── tests/flow/miss-plain.test.js — lane "miss-plain": the plain miss-company offer ───────────
//
// Stage B set 4, piece 1 splices three nodes between `central-exchange` and
// `dym-transform-partial`:
//
//     central-exchange ──▶ miss-roster-gate ──true──▶ miss-roster-plan ──▶ build-miss-member-offer ─┐
//                                       └───false───────────────────────────────────────────────────┴──▶ dym-transform-partial
//
// `miss-roster-gate` is an If evaluated on EVERY turn that reaches central-exchange, which makes it
// the highest-blast-radius line in this change. A PARSE-time rejection by n8n's expression sandbox
// is not catchable by the expression's own try/catch, and that exact fault has shipped once before
// (commit 469cda8, F-R3-4: `Object.<forbidden-member>.hasOwnProperty.call(LANE, tool)` threw
// `Cannot access "prototype" due to security concerns` and every has_result:true turn errored — no
// reply, no state). The offline unit tier could not see it, because a unit test evaluates the IIFE
// in plain Node.
//
// So this file proves three different things about that one expression, in increasing strength:
//   1. TOKEN LINT — the expression contains none of the member names n8n's sandbox refuses. This is
//      the check that would have caught F-R3-4 before it reached the instance.
//   2. IT EVALUATES — run through run-lane's vm evaluator it returns a strict boolean rather than
//      throwing, on a real captured envelope AND on a synthetic miss envelope. "Returns false" and
//      "threw and the If node errored" look the same from downstream; this test distinguishes them.
//   3. IT ROUTES — the false arm reproduces today's `central-exchange -> dym-transform-partial`
//      output byte-for-byte, and the true arm walks the whole plain lane to compile-current-state.
//
// What none of the three can prove is that n8n's own sandbox accepts it: only an execution can.
// The nearest available evidence is that the TEST clone `txiPzSxy3Pclsz6v` carries this lane wired
// exactly this way, and three of the executions captured for this suite (13482649, 13489292,
// 13498401 — see their compile-current-state fixtures' `source.workflow_id`) list `miss-roster-gate`
// in `ran`, immediately followed by `dym-transform-partial` and never by `miss-roster-plan`. That is
// the gate evaluating in the real sandbox and returning false on three real turns. The body here
// differs from the clone's only in the LANE table's `members` values, the single-miss cap on the
// final line, and comments — no new syntax.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { runLane, evalConditionGroup } = require('../harness/run-lane');
const { buildSandbox } = require('../harness/n8n-shim');
const { loadFixture, loadWorkflow, derivePathFromCtx, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'miss-roster-gate';

function gateExpression() {
  const wf = loadWorkflow(SLUG);
  const node = wf.nodes.find((n) => n.name === GATE);
  assert.ok(node, `${GATE} is not in export/${SLUG}/workflow.json`);
  assert.equal(node.type, 'n8n-nodes-base.if');
  return { node, raw: node.parameters.conditions.conditions[0].leftValue };
}

// ── 1. token lint ────────────────────────────────────────────────────────────────────────────
test('miss-roster-gate: the expression names no member n8n\'s sandbox refuses (F-R3-4)', () => {
  const { raw } = gateExpression();
  for (const banned of ['prototype', 'constructor', '__proto__']) {
    assert.ok(!raw.includes(banned),
      `the gate expression contains "${banned}". n8n's expression sandbox rejects that property ` +
      `name at PARSE time, OUTSIDE the expression's own try/catch, so the If node errors and the ` +
      `whole turn dies with no reply — this is F-R3-4 (commit 469cda8) exactly. Comments count: ` +
      `write the name around the token, as the existing comment does.`);
  }
  // the sanctioned membership test, and the reason the banned names are not needed
  assert.match(raw, /Object\.keys\(LANE\)\.includes\(tool\)/);
});

// ── 2. it evaluates ──────────────────────────────────────────────────────────────────────────
// A boolean out is the whole point: `typeof === 'boolean'` separates "the guard said no" from "the
// guard threw", which is the difference between a normal turn and an errored execution.
function evaluateGate(ctx, input) {
  const { node } = gateExpression();
  const vmCtx = vm.createContext(buildSandbox({ ctx, input }));
  return evalConditionGroup(node.parameters.conditions, vmCtx, GATE);
}

const SORENTO = { id: '00000000-0000-0000-0000-000000000001', name: 'Sorento' };

function missCtx(overrides = {}) {
  const planFx = loadFixture(SLUG, 'miss-roster-plan', 'single-miss');
  return { ...planFx.ctx, ...overrides };
}

test('miss-roster-gate: evaluates to a strict boolean, it does not throw', () => {
  // (a) a REAL captured envelope with no lookup_companies at all — the ordinary answered turn
  const real = loadFixture(SLUG, 'compile-current-state', 'exec-13481094');
  const realOut = evaluateGate(real.ctx, real.ctx['central-exchange']);
  assert.equal(typeof realOut, 'boolean');
  assert.equal(realOut, false, 'an envelope with no lookup_companies must not open the miss lane');

  // (b) the synthetic single-miss envelope this change exists for
  const missFx = loadFixture(SLUG, 'miss-roster-plan', 'single-miss');
  const missOut = evaluateGate(missFx.ctx, missFx.input);
  assert.equal(typeof missOut, 'boolean');
  assert.equal(missOut, true, 'one queried company with no answer must open the miss lane');
});

test('miss-roster-gate: two misses do NOT open the lane (no multi-entry routing_roster_plan)', () => {
  const fx = loadFixture(SLUG, 'miss-roster-plan', 'multi-miss-capped');
  const out = evaluateGate(fx.ctx, fx.input);
  assert.equal(out, false,
    'a two-company miss must stay out of the lane: escalation-context turns a multi-entry ' +
    'routing_roster_plan into routing_source "multi_company_unpicked" with a null company and ' +
    'hands it to sub-human-intervention with no gate — a real assign on a pool nobody picked');
});

test('miss-roster-gate: fails closed on a broken envelope rather than erroring the turn', () => {
  // every upstream read the gate makes is missing; the expression must still answer false
  const out = evaluateGate({}, [{ json: { has_result: true } }]);
  assert.equal(out, false);
});

// ── 3a. it routes: the FALSE arm is today's behaviour, byte-for-byte ──────────────────────────
test('flow: miss-plain gate-FALSE (central-exchange -> dym-transform-partial) is unchanged', () => {
  const wf = loadWorkflow(SLUG);
  const fx = loadFixture(SLUG, 'compile-current-state', 'exec-13481094');
  const ceFx = loadFixture(SLUG, 'central-exchange', 'exec-13481094');

  // The path oracle comes from a real execution captured BEFORE this change, so it cannot know
  // about the new node; splice it in where the wiring now puts it. Everything else about the
  // expected path — and the whole of the expected OUTPUT — is still the recorded run's.
  const recorded = derivePathFromCtx(wf, fx, 'central-exchange', 'dym-transform-partial');
  assert.deepStrictEqual(recorded, ['central-exchange', 'dym-transform-partial']);
  const expectedPath = ['central-exchange', GATE, 'dym-transform-partial'];

  const res = runLane({
    slug: SLUG,
    start: 'central-exchange',
    end: 'dym-transform-partial',
    ctx: fx.ctx,
    input: ceFx.input,
    execution: { id: '13481094' },
  });

  assert.deepStrictEqual(res.path, expectedPath);
  assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx['dym-transform-partial'],
    'the gate\'s false arm must hand dym-transform-partial exactly what central-exchange used to');
});

// ── 3b. it routes: the TRUE arm walks the whole plain lane ────────────────────────────────────
// Synthetic, because no live execution has ever taken this lane — the nodes are new to live. The
// envelope shape (lookup_companies, per-company answers with a company_name key field) is copied
// from real captured runData; see the miss-roster-plan fixtures' rationale.
test('flow: miss-plain gate-TRUE walks central-exchange -> compile-current-state and appends the offer', () => {
  const planFx = loadFixture(SLUG, 'miss-roster-plan', 'single-miss');
  const env = planFx.ctx['central-exchange'][0].json;
  const ctx = {
    ...planFx.ctx,
    'sorento-sub-respond-findcontact-respond': [{ json: { id: 900000003 } }],
  };

  const res = runLane({
    slug: SLUG,
    start: 'central-exchange',
    end: 'compile-current-state',
    ctx,
    // central-exchange unwraps `input.output`, which is how If6 hands it the get-results envelope
    input: [{ json: { output: env } }],
    execution: { id: 'miss-plain-synthetic' },
  });

  assert.deepStrictEqual(res.path, [
    'central-exchange',
    GATE,
    'miss-roster-plan',
    'build-miss-member-offer',
    'dym-transform-partial',
    'dym-gate-partial',
    'compile-current-state',
  ]);

  const out = jsonNormalize(res.end)[0].json;
  const phrase = 'Would you like me to escalate to *Sorento* purchasing team?';
  assert.equal(out.user_response, `${env.response}\n\n${phrase}`);
  assert.match(out.variables.response, /would you like me to escalate/i);
  assert.equal(out.variables.selection_context, null);
  assert.deepStrictEqual(out.variables.routing_roster_plan, [{
    plan_idx: 0,
    company_id: SORENTO.id,
    company_name: 'Sorento',
    brand_code: 'sorento',
  }]);
  assert.equal(out.variables.routing_company, SORENTO.id);
  // Mocha answered, Sorento did not; the members half is not deployed, so nothing on this lane
  // may open a picker or ask for a company name.
  assert.equal(out.answers, undefined);
  assert.doesNotMatch(JSON.stringify(out), /Please choose who to route to/);
  assert.doesNotMatch(JSON.stringify(out), /reply with the company name/i);
});

// ── no dangling branch ───────────────────────────────────────────────────────────────────────
// The reviewer's specific warning: a lane node whose taken output has no outgoing edge dead-ends
// the turn with no reply and no error. Assert it structurally, for every output of every node this
// change touched, rather than trusting the two lanes above to have walked them all.
test('miss lane: every output of every node this change touched leads somewhere', () => {
  const wf = loadWorkflow(SLUG);
  const conns = wf.connections || {};
  const outputsOf = (name) => {
    const n = wf.nodes.find((x) => x.name === name);
    return n.type === 'n8n-nodes-base.if' ? 2 : 1;
  };
  for (const name of ['central-exchange', GATE, 'miss-roster-plan', 'build-miss-member-offer']) {
    const main = (conns[name] || {}).main || [];
    for (let i = 0; i < outputsOf(name); i++) {
      const targets = main[i] || [];
      assert.ok(targets.length >= 1, `${name} output ${i} has no outgoing edge — a turn taking it dead-ends`);
    }
  }
  // and both arms converge on the same node, so there is one join, not two tails
  assert.deepStrictEqual(conns[GATE].main[1], [{ index: 0, node: 'dym-transform-partial', type: 'main' }]);
  assert.deepStrictEqual(conns['build-miss-member-offer'].main[0], [{ index: 0, node: 'dym-transform-partial', type: 'main' }]);
  // nothing else was left pointing at the node the gate displaced
  const intoDtp = Object.entries(conns)
    .filter(([, v]) => JSON.stringify(v).includes('"dym-transform-partial"'))
    .map(([k]) => k)
    .sort();
  assert.deepStrictEqual(intoDtp, ['build-miss-member-offer', 'miss-roster-gate']);
  // the members half is NOT deployed
  for (const absent of ['miss-members-gate', 'get-cs-members-miss']) {
    assert.equal(wf.nodes.find((n) => n.name === absent), undefined,
      `${absent} is on the spine — this promote ships the plain half only`);
  }
});
