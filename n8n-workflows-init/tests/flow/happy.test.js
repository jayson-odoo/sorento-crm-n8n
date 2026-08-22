// ── tests/flow/happy.test.js — lane "happy": resolve-entity -> compile-current-state ──────────
// The full lane from entity resolution through to the final compiled state, which BOTH the
// stock-found and stock-not-found sub-branches converge back through — so this lane is exercised
// by every one of the 6 captured executions, not just the one that hit If6 TRUE.
//
// exec-13481094 is the only one of the 6 that actually found real stock (If6 TRUE, going on
// through central-exchange -> dym-transform-partial -> dym-gate-partial). exec-13462354 and
// exec-13479632 take the not-found branch instead (same as miss-dym.test.js exercises on a
// narrower sub-lane), but they still walk THIS full lane end-to-end and are asserted here too —
// fixed 2026-08-23 (reviewer S5): this previously only covered exec-13481094 with the (wrong)
// comment that the other 5 execs "are exercised by miss-dym.test.js" — they weren't, on this
// wider start/end pair. `execution: {id: ...}` is threaded through explicitly because
// `compile-current-state`'s did-you-mean payload stamps `dym_offer.id` from the REAL execution id
// (proven by re-running this lane without it: `dym_offer.id` comes back `"test"`, the shim's
// default, instead of the captured run's actual id).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'resolve-entity';
const END = 'compile-current-state';
const EXECS = ['exec-13462354', 'exec-13479632', 'exec-13481094'];

test('flow: happy (resolve-entity -> compile-current-state)', async (t) => {
  const wf = loadWorkflow(SLUG);
  for (const exec of EXECS) {
    await t.test(exec, () => {
      const fx = loadFixture(SLUG, 'compile-current-state', exec);
      const expectedPath = derivePathFromCtx(wf, fx, START, END);

      const res = runLane({
        slug: SLUG,
        start: START,
        end: END,
        ctx: fx.ctx,
        input: deriveInputFor(wf, fx.ctx, START),
        execution: { id: exec.replace(/^exec-/, '') },
      });

      assert.deepStrictEqual(res.path, expectedPath);
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END]);
    });
  }
});
