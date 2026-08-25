// ── tests/flow/miss-dym.test.js — lane "miss-dym": not-found-error-message -> build-suggest-offer
// The no-match path. `sibling-gate` and `dym-gate` each fork this lane into a different real
// sub-branch depending on the miss's shape; all of them converge back at `build-suggest-offer`:
//   - exec-13462354 / exec-13479632: plain miss — sibling-gate FALSE, dym-gate FALSE
//       (not-found-error-message -> sibling-gate -> dym-transform -> dym-gate -> build-suggest-offer)
//   - exec-13469053: the PROMO-DYM branch — dym-gate routes into the did-you-mean PROBE lane
//       (... -> dym-gate -> if-promo-dym -> dym-probe -> dym-annotate -> build-suggest-offer)
//   - exec-13484326 / exec-13488926: the SIBLING-FAMILY branch — sibling-gate TRUE
//       (not-found-error-message -> sibling-gate -> family-fetch -> sibling-transform ->
//        sibling-probe -> build-suggest-offer)
// Fixed 2026-08-23 (reviewer S5): this previously ran ONLY the plain-miss case and said, wrongly,
// that the promo-dym/sibling-family sub-branches "need $execution.id threading this suite does not
// exercise" as if that made them untestable — it only meant they needed `execution: {id: ...}`
// PASSED to runLane (build-suggest-offer's did-you-mean payload stamps `dym_offer.id` from the real
// execution id; without it, it comes back the shim's `"test"` default and the fixture comparison
// fails). All 5 captured miss executions pass once that's threaded through, so all 5 are asserted.
//
// `input` comes from the dedicated `not-found-error-message` fixture (captured directly from this
// node's own real run, via capture-fixtures.py's resolve_input()) rather than deriveInputFor's
// connections-graph guess — same reasoning as tests/flow/tag-set.test.js's `build-suggest-offer`
// case: `not-found-error-message` also has more than one possible upstream feeder.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'not-found-error-message';
const END = 'build-suggest-offer';
// exec-13873233 (added 2026-08-25): the WINDOW-BLAMED plain-miss lane — same node path as the
// plain miss (sibling-gate FALSE, dym-gate FALSE), but the CRM attributed the emptiness to the
// DATE axis (relaxed_axis 'date') and every "missed" token's candidates were already in the
// searched set, so build-suggest-offer must stand down (suggest_offer false, dym_window_excused)
// instead of raising the did-you-mean that live sent (turn 2 of the 13873180/13873233 pair).
// Its ctx['build-suggest-offer'] is the POST-FIX output, so this lane is the end-to-end red/green
// proof: the lane re-runs not-found-error-message and build-suggest-offer with the real bodies.
const EXECS = ['exec-13462354', 'exec-13469053', 'exec-13479632', 'exec-13484326', 'exec-13488926',
  'exec-13873233'];

test('flow: miss-dym (not-found-error-message -> build-suggest-offer)', async (t) => {
  const wf = loadWorkflow(SLUG);
  for (const exec of EXECS) {
    await t.test(exec, () => {
      const fx = loadFixture(SLUG, 'compile-current-state', exec);
      const nodeFx = loadFixture(SLUG, 'not-found-error-message', exec);
      const expectedPath = derivePathFromCtx(wf, fx, START, END);

      const res = runLane({
        slug: SLUG,
        start: START,
        end: END,
        ctx: fx.ctx,
        input: nodeFx.input,
        execution: { id: nodeFx.source.execution_id },
      });

      assert.deepStrictEqual(res.path, expectedPath);
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END]);
    });
  }
});
