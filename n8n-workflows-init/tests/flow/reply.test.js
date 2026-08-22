// ── tests/flow/reply.test.js — lane "reply": compile-current-state -> crossdomain-compose ─────
// The final shaping step: a single edge, but the two nodes at each end of it are the two biggest
// Code bodies in the spine (684 + 86 lines) — this is the lane most likely to catch a shaping
// regression that a per-node unit test would still pass (each node individually correct, the
// hand-off between them wrong). Run across all 6 captured executions since every one of them
// reaches this same two-node lane regardless of which branch it took upstream.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'compile-current-state';
const END = 'crossdomain-compose';
const EXECS = [
  'exec-13462354', 'exec-13469053', 'exec-13479632',
  'exec-13481094', 'exec-13484326', 'exec-13488926',
];

test('flow: reply (compile-current-state -> crossdomain-compose)', async (t) => {
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
      });

      assert.deepStrictEqual(res.path, expectedPath);
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END]);
    });
  }
});
