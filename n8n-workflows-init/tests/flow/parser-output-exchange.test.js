// ── tests/flow/parser-output-exchange.test.js — lane: output_exchange -> suggest-follow-up ────
// The parser sub-workflow (`sub-semantic-parser`, XTODTw-dJcV0uRdC056hG live-published) has its own
// two-Code-node tail: output_exchange (1,387 lines — the reformulator's raw-LLM-string-to-structured
// -output parser, CLAUDE.md's stated "primary regression concern") feeds straight into
// suggest-follow-up. Single edge, both Code nodes, no If/Set on this lane.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');
const { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize } = require('./_lib');

const SLUG = 'sub-semantic-parser';
const START = 'output_exchange';
const END = 'suggest-follow-up';
const EXECS = ['exec-13484619', 'exec-13488887', 'exec-13488927'];

test('flow: parser output_exchange -> suggest-follow-up', async (t) => {
  const wf = loadWorkflow(SLUG);
  for (const exec of EXECS) {
    await t.test(exec, () => {
      const fx = loadFixture(SLUG, 'output_exchange', exec);
      const expectedPath = derivePathFromCtx(wf, new Set(Object.keys(fx.ctx)), START, END);

      const res = runLane({
        slug: SLUG,
        start: START,
        end: END,
        ctx: fx.ctx,
        input: deriveInputFor(wf, fx.ctx, START), // output_exchange's real predecessor: AI Agent
      });

      assert.deepStrictEqual(res.path, expectedPath);
      assert.deepStrictEqual(jsonNormalize(res.end), fx.ctx[END]);
    });
  }
});
