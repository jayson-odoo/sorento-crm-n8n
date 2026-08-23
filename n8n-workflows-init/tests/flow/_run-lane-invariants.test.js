// ── tests/flow/_run-lane-invariants.test.js — direct tests of run-lane.js's own contracts ──────
// Not lane-fixture-driven (unlike every other tests/flow/*.test.js): these exercise properties of
// run-lane.js's node-execution machinery itself that no CURRENT lane's real start/end pair happens
// to touch. Covers reviewer findings S11 (node-name -> file-name mapping) and S12 (two fail-loud
// gaps: an expression-valued If/Switch rightValue, and a fanned-out output edge).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runLane } = require('../harness/run-lane');

const SLUG = 'live-spine-sorento-consume-main';

// S11 (CANARY since 2026-08-23 — read this before "fixing" it). The original test ran the dead
// node `Code in JavaScript` as a one-node lane, because it was the ONLY node in either tracked
// export whose export-workflows.py `safe_name` file (`Code_in_JavaScript.js`, underscores)
// differed from `nodeName + '.js'` (spaces) — so it was the only node that could tell run-lane's
// MANIFEST lookup apart from a naive name-concat.
//
// That node was deleted with the dead Whisper lane (docs/SIMPLIFY-spine-audit.md §8; keeping dead
// production surface alive to feed a test is the wrong trade). Today EVERY tracked Code node's
// manifest file is exactly `name + '.js'`, so the two implementations are observationally
// identical and no test can separate them. Rather than pretend otherwise with a lane that proves
// nothing, this asserts the precondition directly: the moment a Code node with a space or other
// `safe_name`-mangled character appears, this fails and says to restore a real one-node lane over
// THAT node.
test('S11: run-lane resolves a Code node body via MANIFEST file mapping, not nodeName + ".js"', () => {
  const fs = require('fs');
  const path = require('path');
  const mangled = [];
  for (const slug of [SLUG, 'sub-semantic-parser']) {
    const man = JSON.parse(fs.readFileSync(path.resolve(
      __dirname, '../../export', slug, 'MANIFEST.json'), 'utf8'));
    for (const [name, rec] of Object.entries(man.nodes || {})) {
      if (rec.file !== `${name}.js`) mangled.push(`${slug}/${name} -> ${rec.file}`);
    }
  }
  assert.deepStrictEqual(mangled, [],
    'a tracked Code node\'s manifest file name now differs from nodeName + ".js" — the naive ' +
    'concat and the MANIFEST lookup are distinguishable again, so run it as a one-node lane here ' +
    'and assert its output (that is what this test used to do with "Code in JavaScript"): ' +
    mangled.join(', '));
});

// S12a: `is-human-intervened`[output 1] fans out to BOTH `update-human-intervened` AND
// `set-human-intervened` — real n8n runs both, this single-path lane walker cannot. Feed ctx that
// makes the contact genuinely human-intervened (custom_fields.is_human_intervened = "true"), which
// takes the condition's FALSE arm (output index 1, the fanned-out one), and prove run-lane refuses
// to silently pick the first target and drop the second.
test('S12a: run-lane throws on a fanned-out output edge, instead of silently taking targets[0]', () => {
  assert.throws(
    () => runLane({
      slug: SLUG,
      start: 'is-human-intervened',
      end: 'set-human-intervened',
      ctx: {
        'sorento-sub-respond-findcontact-respond': [
          { json: { custom_fields: [{ name: 'is_human_intervened', value: 'true' }] } },
        ],
      },
      input: [{ json: {} }],
    }),
    /fans out to 2 targets/
  );
});

// S12b: an If/Switch condition's `rightValue` can itself be an n8n expression (`={{ ... }}`), not
// only a literal — nothing in this workflow does that today, but this evaluator only ever compares
// `rightValue` as a raw literal (see `evalCondition`'s `equals`/`gt`/`contains` arms), so it would
// silently compare against the un-evaluated STRING instead of throwing or evaluating it. Prove the
// guard fires on a synthetic condition shaped exactly like that.
test('S12b: run-lane throws on an expression-valued rightValue, instead of comparing it as a literal', () => {
  const { evalConditionGroup } = require('../harness/run-lane');
  const vm = require('vm');
  const { buildSandbox } = require('../harness/n8n-shim');
  const sandbox = buildSandbox({ ctx: {}, input: [{ json: { threshold: 5 } }] });
  const vmCtx = vm.createContext(sandbox);
  const conditionsBlock = {
    combinator: 'and',
    options: { typeValidation: 'loose' },
    conditions: [
      {
        leftValue: '={{ 5 }}',
        operator: { operation: 'equals', type: 'number' },
        rightValue: '={{ $json.threshold }}',
      },
    ],
  };
  assert.throws(
    () => evalConditionGroup(conditionsBlock, vmCtx, 'synthetic-test-condition'),
    /looks like an n8n expression/
  );
});

// S13: n8n's own default for If v2.1+ / Switch condition options is 'strict', not 'loose'. Every
// condition block in this workflow sets `typeValidation` explicitly today (checked against
// export/*/workflow.json, 33/33), so this default is otherwise inert — but a synthetic block that
// OMITS the key must still get the production default, not the wrong one. `equals` on a PRESENT
// string ('5') against a `type: 'number'` operator is exactly what strict rejects (a present value
// of the wrong type) and loose silently coerces through.
test('S13: evalConditionGroup defaults an omitted typeValidation to "strict" (n8n\'s own default)', () => {
  const { evalConditionGroup } = require('../harness/run-lane');
  const vm = require('vm');
  const { buildSandbox } = require('../harness/n8n-shim');
  const sandbox = buildSandbox({ ctx: {}, input: [{ json: {} }] });
  const vmCtx = vm.createContext(sandbox);
  const conditionsBlock = {
    combinator: 'and',
    options: {}, // typeValidation deliberately OMITTED — exercises the fallback default itself
    conditions: [
      {
        leftValue: "={{ '5' }}", // present, but a STRING — wantType below is 'number'
        operator: { operation: 'equals', type: 'number' },
        rightValue: 5,
      },
    ],
  };
  assert.throws(
    () => evalConditionGroup(conditionsBlock, vmCtx, 'synthetic-test-condition'),
    /strict typeValidation failure/
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Cross-model (codex gpt-5.5) review findings C6 / C7 — the LANE tier's own divergences from n8n.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// C6: real n8n evaluates an If/Switch condition for EVERY input item and splits the items across
// its outputs — one If can emit items on BOTH the true and the false branch. This walker evaluates
// the condition ONCE for the whole batch and routes the batch whole, which is a silently wrong
// branch the moment >1 item reaches it. MEASURED: across every committed lane, 0 If/Switch
// invocations receive more than one item (instrumented run-lane, 82 invocations, all items=1) — so
// per-item bucketing has no caller to justify it and the honest fix is to refuse the case.
// `if-message-is-audio` is reached with whatever items its caller passes; feed it two.
test('C6: run-lane throws when an If receives >1 input item, instead of routing the batch whole', () => {
  assert.throws(
    () => runLane({
      slug: SLUG,
      start: 'if-message-is-audio',
      end: 'if-message-is-audio',
      ctx: {},
      input: [{ json: { message: { message: { type: 'audio' } } } }, { json: { message: { message: { type: 'text' } } } }],
    }),
    /more than one input item/
  );
});

// C7: a Code node's execution mode must be honoured on the LANE path too, not only in the unit
// tier — otherwise the two tiers disagree about what the same deployed node does.
// Re-pointed 2026-08-23: this used to run the spine's `transcribed-message`, deleted with the dead
// Whisper lane. `sub-semantic-parser/output_exchange` is now the only `runOnceForEachItem` Code
// node in either tracked export (asserted in tests/unit/_shim-invariants.test.js's C1), and it is
// also the body the owner cares most about, so the lane tier exercises the mode on THAT one. Two
// DIFFERENT items in — a per-item run cannot be faked by duplicating one result.
test('C7: run-lane honours a Code node\'s runOnceForEachItem mode (2 items in, 2 out)', () => {
  const fs = require('fs');
  const path = require('path');
  const base = JSON.parse(fs.readFileSync(path.resolve(
    __dirname, '../fixtures/nodes/sub-semantic-parser/output_exchange/exec-13488887.json'), 'utf8'));
  const itemA = JSON.parse(JSON.stringify(base.input[0]));
  const itemB = JSON.parse(JSON.stringify(base.input[0]));
  const parsedB = JSON.parse(itemB.json.output);
  parsedB.user_goal = 'SECOND ITEM GOAL';
  itemB.json.output = JSON.stringify(parsedB);

  const res = runLane({
    slug: 'sub-semantic-parser',
    start: 'output_exchange',
    end: 'output_exchange',
    ctx: base.ctx,
    input: [itemA, itemB],
    execution: base.execution,
  });
  const out = JSON.parse(JSON.stringify(res.end));
  assert.strictEqual(out.length, 2, 'runOnceForEachItem must emit one item per input item');
  assert.notDeepStrictEqual(out[0], out[1], 'the two items must not collapse into one result');
  assert.strictEqual(out[1].json.output.user_goal, 'SECOND ITEM GOAL');
});
