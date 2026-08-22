// ── tests/flow/miss-dym.test.js — lane "miss-dym": not-found-error-message -> build-suggest-offer
// The plain no-match path: not-found-error-message -> sibling-gate -> dym-transform -> dym-gate ->
// build-suggest-offer, taking the FALSE edge at both sibling-gate (not an incoming/product miss)
// and dym-gate (no did-you-mean probe needed) so it never touches the promo-dym or sibling-family
// sub-branches (see run-lane.js's report caveat: those need $execution.id threading this suite
// does not exercise).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'not-found-error-message';
const END = 'build-suggest-offer';

test('flow: miss-dym (not-found-error-message -> build-suggest-offer)', () => {
  const wf = loadWorkflow(SLUG);
  const fx = loadFixture(SLUG, 'compile-current-state', 'exec-13462354');
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
