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

// S11: "Code in JavaScript" is the one node in this workflow whose export-workflows.py `safe_name`
// file (`Code_in_JavaScript.js`, underscores) differs from `nodeName + '.js'` (spaces) — every
// other node a real lane walks through happens to dodge this by luck (no spaces/punctuation in its
// name). It is also a dead/orphaned node (0 inbound edges — see export's `.dead` marker next to its
// fixture dir), so no start/end pair used by any OTHER flow test ever reaches it; run it directly
// as its own one-node lane to prove run-lane resolves its body via MANIFEST.json's `nodes.<name>
// .file`, not a naive name-concat that would 404 against export/<slug>/nodes/.
test('S11: run-lane resolves a Code node body via MANIFEST file mapping, not nodeName + ".js"', () => {
  const res = runLane({
    slug: SLUG,
    start: 'Code in JavaScript',
    end: 'Code in JavaScript',
    ctx: { 'tf-message': [{ json: { message: { message: { attachment: { url: 'https://example.test/a.png' } } } } }] },
    input: [{ json: {} }],
  });
  assert.deepStrictEqual(res.path, ['Code in JavaScript']);
  // JSON round-trip before comparing: `res.end`'s items are built INSIDE the shim's vm context
  // (see tests/unit/_shim-invariants.test.js's S9 test for why), so they carry that realm's own
  // Object.prototype — deepStrictEqual treats that as a real difference even when every own
  // property matches. Isolate the thing this test actually checks (the VALUE).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res.end)), [{ json: { data: 'https://example.test/a.png' } }]);
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
// `transcribed-message` is `runOnceForEachItem` (the only per-item node in the live spine); run it
// as its own one-node lane with two input items and require two output items.
test('C7: run-lane honours a Code node\'s runOnceForEachItem mode (2 items in, 2 out)', () => {
  const res = runLane({
    slug: SLUG,
    start: 'transcribed-message',
    end: 'transcribed-message',
    ctx: { 'is-human-intervened': [{ json: { contact_id: 42 } }] },
    input: [{ json: { text: 'first' } }, { json: { text: 'second' } }],
  });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(res.end)),
    [{ json: { contact_id: 42, message: 'first' } }, { json: { contact_id: 42, message: 'second' } }]
  );
});
