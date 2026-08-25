// ── tests/flow/route.test.js — lane "route": If5 (post check-access) -> disallowed-entity-gate ──
// Covers the long access/casual/clarify/not-supported/stock-check gauntlet (If5, If2, If-ideate,
// If10, is-escalation-declined, If9, If1, not-supported-domain, If, If7) that every ordinary
// business query walks before entity resolution. All 6 captured executions took this exact route
// (none were access-denied, ideate, casual, clarification, not-supported, check_promotion, or
// stock_check with entities), so this lane is exercised across all of them.
//
// Reviewer S4: END used to be 'resolve-entity' itself — an httpRequest node this harness can only
// STUB, and the stub's value comes from `ctx['resolve-entity']` (via run-lane's `runStubNode`
// falling back to `baseCtx`, and `ctx` here IS `fx.ctx`). Asserting `res.end` against `fx.ctx[END]`
// was therefore comparing the stub's own reflected value to itself — provably vacuous, it cannot
// fail no matter what resolve-entity "returns". Moved one hop further to `disallowed-entity-gate`,
// the first real Code node downstream of resolve-entity: its output is genuinely COMPUTED from the
// stubbed resolver's json (and the parser's), so this now asserts something a regression could
// actually break.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'If5';
const END = 'disallowed-entity-gate';
const EXECS = [
  'exec-13462354', 'exec-13469053', 'exec-13479632',
  'exec-13481094', 'exec-13484326', 'exec-13488926',
];

// Stage B sets 1+2 splice `offer-hold-gate` onto the `If-ideate[false] -> If10` edge, so every one
// of these six recorded paths grows exactly one hop. The oracle above comes from executions captured
// BEFORE that node existed and cannot know about it, so it is spliced in where the wiring now puts
// it — the same treatment tests/flow/miss-plain.test.js gives `miss-roster-gate`.
//
// This IS the inert-on-the-happy-path proof, and it is a real one: run-lane EXECUTES the new gate on
// all six ctxs. Its expression evaluates against each recorded turn's own reformulator output and
// session vars, and it must return false on every one — none of these turns is a member-offer
// follow-up. If the gate threw, or leaked true, the path assertion below would show it as
// `offer-hold-reply` instead of `If10`, or the run would error outright.
const SPLICE = { after: 'If-ideate', insert: 'offer-hold-gate', before: 'If10' };

function spliceNewHops(recorded) {
  const i = recorded.indexOf(SPLICE.after);
  if (i === -1 || recorded[i + 1] !== SPLICE.before) return recorded;
  return [...recorded.slice(0, i + 1), SPLICE.insert, ...recorded.slice(i + 1)];
}

test('flow: route (If5 -> disallowed-entity-gate)', async (t) => {
  const wf = loadWorkflow(SLUG);
  for (const exec of EXECS) {
    await t.test(exec, () => {
      const fx = loadFixture(SLUG, 'compile-current-state', exec);
      const recorded = derivePathFromCtx(wf, fx, START, END);
      assert.ok(recorded.includes(SPLICE.after) && recorded.includes(SPLICE.before),
        `${exec} was expected to walk ${SPLICE.after} -> ${SPLICE.before}; got ${recorded.join(' -> ')}`);
      const expectedPath = spliceNewHops(recorded);
      assert.equal(expectedPath.length, recorded.length + 1,
        'offer-hold-gate must add exactly one hop to this recorded path');

      const res = runLane({
        slug: SLUG,
        start: START,
        end: END,
        ctx: fx.ctx,
        input: deriveInputFor(wf, fx.ctx, START), // If5's real predecessor (check-access), not its own output
      });

      assert.deepStrictEqual(res.path, expectedPath, 'path taken must match the real execution');
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END], 'disallowed-entity-gate output must match the captured run');
    });
  }
});
