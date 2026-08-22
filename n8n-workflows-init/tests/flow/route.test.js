// ── tests/flow/route.test.js — lane "route": If5 (post check-access) -> resolve-entity ────────
// Covers the long access/casual/clarify/not-supported/stock-check gauntlet (If5, If2, If-ideate,
// If10, is-escalation-declined, If9, If1, not-supported-domain, If, If7) that every ordinary
// business query walks before entity resolution. All 6 captured executions took this exact route
// (none were access-denied, ideate, casual, clarification, not-supported, check_promotion, or
// stock_check with entities), so this lane is exercised across all of them.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'If5';
const END = 'resolve-entity';
const EXECS = [
  'exec-13462354', 'exec-13469053', 'exec-13479632',
  'exec-13481094', 'exec-13484326', 'exec-13488926',
];

test('flow: route (If5 -> resolve-entity)', async (t) => {
  const wf = loadWorkflow(SLUG);
  for (const exec of EXECS) {
    await t.test(exec, () => {
      const fx = loadFixture(SLUG, 'compile-current-state', exec);
      const expectedPath = derivePathFromCtx(wf, new Set(Object.keys(fx.ctx)), START, END);

      const res = runLane({
        slug: SLUG,
        start: START,
        end: END,
        ctx: fx.ctx,
        input: deriveInputFor(wf, fx.ctx, START), // If5's real predecessor (check-access), not its own output
      });

      assert.deepStrictEqual(res.path, expectedPath, 'path taken must match the real execution');
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END], 'resolve-entity output must match the captured run');
    });
  }
});
