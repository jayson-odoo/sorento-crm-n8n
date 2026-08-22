// ── tests/flow/happy.test.js — lane "happy": resolve-entity -> compile-current-state ──────────
// The full stock-found success path: resolve-entity (stubbed httpRequest) -> disallowed-entity-gate
// -> If3 -> get-rag -> tool-filter -> if-tier-ask -> get-results -> validator -> promo-picker ->
// crossdomain-zeroset -> crossdomain-gate -> If6 -> central-exchange -> dym-transform-partial ->
// dym-gate-partial -> compile-current-state. Only exec-13481094 (of the 6 captured) actually found
// real stock (If6 true), so it is the sole case here — the other 5 hit the not-found branch
// instead, which is exercised by miss-dym.test.js.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'resolve-entity';
const END = 'compile-current-state';

test('flow: happy (resolve-entity -> compile-current-state)', () => {
  const wf = loadWorkflow(SLUG);
  const fx = loadFixture(SLUG, 'compile-current-state', 'exec-13481094');
  const expectedPath = derivePathFromCtx(wf, new Set(Object.keys(fx.ctx)), START, END);

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
