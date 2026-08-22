// ── tests/flow/tag-set.test.js — lane "tag-set": build-suggest-offer -> tag-not-found ──────────
// Reviewer S3: run-lane.js's Set-node evaluator spread `{...item.json}` unconditionally, which is
// wrong for every Set (Edit Fields) node in this workflow — n8n v3.4 defaults `includeOtherFields`
// to false, and none of the 9 `tag-*`/`Edit Fields*` nodes set it explicitly, so their REAL output
// is ONLY the assigned field(s), not the assigned field(s) merged onto the upstream item. This lane
// crosses exactly one such node (`tag-not-found`) and asserts its output against a real captured
// execution, where it is provably NOT a superset of its input: `build-suggest-offer`'s output carries
// `response_intro`/`escalate_message`/`is_clarification`/`found_summary`/`suggest_offer`, and
// `tag-not-found`'s real output is exactly `{branch_kind: 'not_found'}` — none of those upstream
// keys survive.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, jsonNormalize } = require('./_lib');

const SLUG = 'live-spine-sorento-consume-main';
const START = 'build-suggest-offer';
const END = 'tag-not-found';

test('flow: tag-set (build-suggest-offer -> tag-not-found)', () => {
  const wf = loadWorkflow(SLUG);
  const fx = loadFixture(SLUG, 'compile-current-state', 'exec-13462354');
  const expectedPath = derivePathFromCtx(wf, fx, START, END);

  // NOT deriveInputFor(wf, fx.ctx, START): `build-suggest-offer` has 4 possible upstream
  // feeders (annotate-incoming-picker / dym-annotate / dym-gate / sibling-probe), and this
  // execution's `dym-gate` ctx entry is [] — build_ctx() always reads runData main[OUTPUT 0],
  // but dym-gate is an If node that took its FALSE branch (output index 1) here, so its real
  // forwarded items live on an output this generic ctx capture never recorded. The dedicated
  // per-node fixture for `build-suggest-offer` itself was captured via resolve_input(), which
  // follows the run's own `source[0].previousNodeOutput` and gets this right — use its `input`.
  const nodeFx = loadFixture(SLUG, 'build-suggest-offer', 'exec-13462354');

  const res = runLane({
    slug: SLUG,
    start: START,
    end: END,
    ctx: fx.ctx,
    input: nodeFx.input,
  });

  assert.deepStrictEqual(res.path, expectedPath);
  assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END]);

  // Belt-and-braces: fail loud (not just "deepEqual happened to match") if a future edit to the
  // fixture or the evaluator ever makes this assertion accidentally vacuous again — the dropped
  // upstream keys must genuinely be gone from the real captured output, not just from our copy.
  const upstreamKeys = Object.keys(fx.ctx[START][0].json);
  const outKeys = Object.keys(res.end[0].json);
  const leaked = upstreamKeys.filter((k) => outKeys.includes(k) && k !== 'branch_kind');
  assert.deepStrictEqual(leaked, [], `tag-not-found must NOT carry upstream fields through: ${leaked}`);
});
