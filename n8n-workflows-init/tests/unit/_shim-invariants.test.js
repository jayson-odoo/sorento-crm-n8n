// ── tests/unit/_shim-invariants.test.js — direct tests of n8n-shim.js's own contracts ──────────
// Not fixture-driven (unlike every other tests/unit/*.test.js): these exercise properties of the
// SHIM itself — the sandbox realm and the NaN/Infinity guard — that a per-node fixture comparison
// can't isolate, since a fixture test only ever sees the END RESULT of a bug already round-tripped
// through JSON. Covers reviewer findings S7 (NaN erasure), S8 (the deleted `volatile` mechanism),
// and S9 (cross-realm sandbox globals).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { runNode, normalizeReturn, buildSandbox, assertOutputEquals } = require('../harness/n8n-shim');

// ── S7: a node body that computes NaN/Infinity must throw loudly, not silently become `null` ──
test('S7: normalizeReturn throws on a NaN leaf (before it can round-trip to null)', () => {
  assert.throws(
    () => normalizeReturn({ score: 0 / 0 }),
    /non-finite number/
  );
});

test('S7: normalizeReturn throws on an Infinity leaf, nested in an array', () => {
  assert.throws(
    () => normalizeReturn([{ json: { items: [1, 2, 1 / 0] } }]),
    /non-finite number/
  );
});

test('S7: normalizeReturn does NOT throw on ordinary finite numbers / null / undefined-free objects', () => {
  assert.doesNotThrow(() => normalizeReturn({ a: 1, b: -3.5, c: 0, d: null, e: [1, 2, 3] }));
});

test('S7: runNode -> normalizeReturn catches a Code body that actually divides by zero', () => {
  const body = 'return { json: { pct: 5 / 0 } };';
  const raw = runNode({ body, fixture: { ctx: {}, input: [{ json: {} }] }, mode: 'runOnceForAllItems' });
  assert.throws(() => normalizeReturn(raw), /non-finite number/);
});

// ── S9: the sandbox must NOT inject host constructors that shadow the vm context's own realm ──
test('S9: [] instanceof Array is TRUE inside the shim sandbox (matches real n8n, single realm)', () => {
  const sandbox = buildSandbox({ ctx: {}, input: [] });
  const vmCtx = vm.createContext(sandbox);
  const result = vm.runInContext('([] instanceof Array)', vmCtx);
  assert.strictEqual(result, true);
});

test('S9: ({}) instanceof Object is TRUE inside the shim sandbox', () => {
  const sandbox = buildSandbox({ ctx: {}, input: [] });
  const vmCtx = vm.createContext(sandbox);
  const result = vm.runInContext('(({}) instanceof Object)', vmCtx);
  assert.strictEqual(result, true);
});

test('S9: JSON/Math/RegExp/Date are still usable inside the shim sandbox (native to the vm realm)', () => {
  const body = 'return { json: { s: JSON.stringify([1,2]), m: Math.max(1,2), r: /x/.test("x"), d: (new Date(0)).getTime() } };';
  const raw = runNode({ body, fixture: { ctx: {}, input: [{ json: {} }] }, mode: 'runOnceForAllItems' });
  // JSON round-trip before comparing: `raw.json` is a plain object built INSIDE the vm context,
  // so it carries that realm's own Object.prototype — deepStrictEqual treats that as a real
  // difference from a host-realm object literal even when every own property matches. That
  // cross-realm prototype gap is expected and inert (JSON, REST, and n8n's own item storage all
  // round-trip through JSON in production too); round-tripping here isolates the thing this test
  // actually checks (are the VALUES right), the same way n8n-shim's own deepCopy does.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(raw.json)), { s: '[1,2]', m: 2, r: true, d: 0 });
});

// ── S8: assertOutputEquals must do a REAL comparison — no `volatile` escape hatch left ─────────
// The deleted mechanism let a fixture declare `volatile: ["*.json"]` and have its ENTIRE output
// deleted from both sides before comparing, making the assertion pass no matter what the node
// returned — 0 of 144 committed fixtures ever used it, but the capability existed. Prove a real
// mismatch (actual `{a: 1}` vs expected `{a: 2}`) is caught — this THROWS today because the
// mechanism no longer exists to blank it away; before S8, a fixture carrying `volatile: ["*.json"]`
// (silently ignored by the now-2-arg `assertOutputEquals`, since the caller no longer even reads
// it) would have masked exactly this mismatch.
test('S8: assertOutputEquals catches a real mismatch (no way to blank it via a volatile field)', () => {
  const actual = { json: { a: 1 } };
  const expected = [{ json: { a: 2 } }];
  assert.throws(() => assertOutputEquals(actual, expected), /AssertionError/);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Cross-model (codex gpt-5.5) review findings C1–C5. Each of these asserts a property of REAL n8n
// that this shim used to get wrong silently — the whole class the harness exists to avoid.
// ══════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { codeNodeMode } = require('../harness/n8n-shim');

// ── C1: honour the Code node's execution `mode` ────────────────────────────────────────────────
// `runOnceForEachItem` runs the body ONCE PER INPUT ITEM. Exactly ONE Code node in the tracked
// slugs still declares it — `sub-semantic-parser/output_exchange`, the semantic parser's output
// shaper and the single most consequential body in the repo — and every committed fixture for it
// has exactly ONE input item, so per-item and for-all-items coincide today and the divergence was
// invisible. Feed TWO items and watch them separate (next test).
//
// The spine's only other per-item node was `transcribed-message`, deleted with the dead Whisper
// lane in the delete-dead slice (docs/SIMPLIFY-spine-audit.md §8). Rather than re-point this at
// another named node, the spine side is now asserted as an INVARIANT over the whole export: no
// spine Code node declares a non-default mode. That fires the day one does — which is exactly when
// a single-item fixture for it would stop being enough.
test('C1: codeNodeMode reads the deployed mode out of export/<slug>/workflow.json', () => {
  assert.strictEqual(codeNodeMode('sub-semantic-parser', 'output_exchange'), 'runOnceForEachItem');
  // n8n omits `parameters.mode` entirely when it is the default — that must resolve, not throw.
  assert.strictEqual(codeNodeMode('live-spine-sorento-consume-main', 'dym-transform'), 'runOnceForAllItems');
  const spine = JSON.parse(fs.readFileSync(path.join(
    __dirname, '../../export/live-spine-sorento-consume-main/workflow.json'
  ), 'utf8'));
  const perItem = spine.nodes
    .filter((n) => n.type.endsWith('.code') && (n.parameters || {}).mode === 'runOnceForEachItem')
    .map((n) => n.name);
  assert.deepStrictEqual(perItem, [],
    'a spine Code node now runs runOnceForEachItem — give it a two-item fixture before trusting ' +
    'any single-item fixture for it');
});

test('C1: output_exchange (runOnceForEachItem) runs once per item — 2 items in, 2 items out', () => {
  const src = loadNodes('sub-semantic-parser', ['output_exchange.js']);
  const body = src['output_exchange.js'];
  const base = JSON.parse(fs.readFileSync(path.join(
    __dirname, '../fixtures/nodes/sub-semantic-parser/output_exchange/exec-13488887.json'
  ), 'utf8'));
  // Two DIFFERENT items, so a per-item run cannot be faked by duplicating one result.
  const itemA = JSON.parse(JSON.stringify(base.input[0]));
  const itemB = JSON.parse(JSON.stringify(base.input[0]));
  const parsedB = JSON.parse(itemB.json.output);
  parsedB.user_goal = 'SECOND ITEM GOAL';
  itemB.json.output = JSON.stringify(parsedB);

  const out = normalizeReturn(runNode({
    body,
    fixture: { ctx: base.ctx, input: [itemA, itemB] },
    slug: 'sub-semantic-parser',
    nodeName: 'output_exchange',
  }));
  assert.strictEqual(out.length, 2, 'per-item mode must emit one output item per input item');
  // Each run must have shaped ITS OWN item — not item 0 twice. (`output_exchange` returns
  // `{output, _parser_raw}`, so the parsed goal lives at `.json.output.user_goal`.)
  assert.strictEqual(out[0].json.output.user_goal, base.expected[0].json.output.user_goal);
  assert.strictEqual(out[1].json.output.user_goal, 'SECOND ITEM GOAL');
  assert.notStrictEqual(out[0].json.output.user_goal, out[1].json.output.user_goal);
});

test('C1: a single-item per-item run still matches the committed fixture exactly', () => {
  const src = loadNodes('sub-semantic-parser', ['output_exchange.js']);
  const base = JSON.parse(fs.readFileSync(path.join(
    __dirname, '../fixtures/nodes/sub-semantic-parser/output_exchange/exec-13488887.json'
  ), 'utf8'));
  const out = runNode({
    body: src['output_exchange.js'],
    fixture: base,
    slug: 'sub-semantic-parser',
    nodeName: 'output_exchange',
  });
  assertOutputEquals(out, base.expected);
});

test('C1: $input.all()/.first()/.last() are UNAVAILABLE in per-item mode (real n8n throws)', () => {
  for (const call of ['all()', 'first()', 'last()']) {
    assert.throws(
      () => runNode({
        body: `return { n: $input.${call}.length };`,
        fixture: { ctx: {}, input: [{ json: { i: 0 } }, { json: { i: 1 } }] },
        mode: 'runOnceForEachItem',
      }),
      /runOnceForEachItem/,
      `$input.${call} must throw in per-item mode`
    );
  }
});

test('C1: a per-item body returning an ARRAY throws (n8n wants one item per run)', () => {
  assert.throws(
    () => runNode({
      body: 'return [{ json: { a: 1 } }, { json: { a: 2 } }];',
      fixture: { ctx: {}, input: [{ json: {} }] },
      mode: 'runOnceForEachItem',
    }),
    /single item/
  );
});

test('C1: runNode refuses to guess a mode — neither slug/nodeName nor an explicit mode', () => {
  assert.throws(
    () => runNode({ body: 'return {};', fixture: { ctx: {}, input: [{ json: {} }] } }),
    /mode/
  );
});

// ── C2: `$json` binding ────────────────────────────────────────────────────────────────────────
test('C2: $json is the CURRENT item in per-item mode (not always input[0])', () => {
  const out = normalizeReturn(runNode({
    body: 'return { seen: $json.i };',
    fixture: { ctx: {}, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }, { json: { i: 'c' } }] },
    mode: 'runOnceForEachItem',
  }));
  assert.deepStrictEqual(out.map((o) => o.json.seen), ['a', 'b', 'c']);
});

test('C2: $json stays item 0 in for-all-items mode (matches n8n)', () => {
  const out = normalizeReturn(runNode({
    body: 'return { seen: $json.i, n: $input.all().length };',
    fixture: { ctx: {}, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }] },
    mode: 'runOnceForAllItems',
  }));
  // JSON round-trip: vm-realm object vs this file's own-realm literal (see the S9 note above).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out[0].json)), { seen: 'a', n: 2 });
});

// ── C3: `.all()` hands back the LIVE backing array, not a defensive copy ────────────────────────
// Real n8n returns the node's own item array. A body that splices/sorts it in place (promo-picker
// genuinely splices — see its own comments) mutates the real thing in production; against a
// `.slice()` it mutated a throwaway, so an in-place-mutation bug was invisible offline.
test('C3: $input.all() returns the backing array — an in-place splice is visible on re-read', () => {
  const out = normalizeReturn(runNode({
    body: 'const a = $input.all(); a.splice(0, 1); return { after: $input.all().length, first: $input.first().json.i };',
    fixture: { ctx: {}, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }] },
    mode: 'runOnceForAllItems',
  }));
  assert.strictEqual(out[0].json.after, 1, '.all() must not hand out a defensive copy');
  assert.strictEqual(out[0].json.first, 'b');
});

test('C3: the caller\'s fixture object is STILL untouched by that in-place splice', () => {
  const fixture = { ctx: { up: [{ json: { i: 'x' } }, { json: { i: 'y' } }] }, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }] };
  const body = 'const a = $input.all(); a.splice(0, 1); $("up").all().splice(0, 1); return { n: a.length };';
  runNode({ body, fixture, mode: 'runOnceForAllItems' });
  assert.strictEqual(fixture.input.length, 2, 'runNode must deep-copy per call — the fixture is shared across tests');
  assert.strictEqual(fixture.ctx.up.length, 2);
  // ... and a second run sees the pristine fixture again.
  const out = normalizeReturn(runNode({ body, fixture, mode: 'runOnceForAllItems' }));
  assert.strictEqual(out[0].json.n, 1);
});

// ── C4: `.item` paired-item semantics ──────────────────────────────────────────────────────────
// n8n resolves `.item` through paired-item links and THROWS when the link is missing or ambiguous.
// This harness does not track paired items, so with >1 candidate item it must refuse to guess —
// silently returning item 0 is the "green that cannot fail" class.
test('C4: $("x").item throws when the stub has >1 item (no paired-item tracking)', () => {
  assert.throws(
    () => runNode({
      body: 'return $("up").item.json;',
      fixture: { ctx: { up: [{ json: { i: 'a' } }, { json: { i: 'b' } }] }, input: [{ json: {} }] },
      mode: 'runOnceForAllItems',
    }),
    /paired item/i
  );
});

test('C4: $("x").item still returns the one item when there is exactly one', () => {
  const out = normalizeReturn(runNode({
    body: 'return $("up").item.json;',
    fixture: { ctx: { up: [{ json: { i: 'only' } }] }, input: [{ json: {} }] },
    mode: 'runOnceForAllItems',
  }));
  assert.strictEqual(out[0].json.i, 'only');
});

test('C4: $input.item IS the current item in per-item mode (exactly resolvable, no throw)', () => {
  const out = normalizeReturn(runNode({
    body: 'return { seen: $input.item.json.i };',
    fixture: { ctx: {}, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }] },
    mode: 'runOnceForEachItem',
  }));
  assert.deepStrictEqual(out.map((o) => o.json.seen), ['a', 'b']);
});

test('C4: $input.item throws on >1 item in for-all-items mode', () => {
  assert.throws(
    () => runNode({
      body: 'return $input.item.json;',
      fixture: { ctx: {}, input: [{ json: { i: 'a' } }, { json: { i: 'b' } }] },
      mode: 'runOnceForAllItems',
    }),
    /paired item/i
  );
});

// ── C5: normalizeReturn must reject item shapes n8n itself rejects ─────────────────────────────
test('C5: normalizeReturn throws on {json: []} — n8n requires json to be a non-array object', () => {
  assert.throws(() => normalizeReturn([{ json: [] }]), /index 0/);
});

test('C5: normalizeReturn throws on {json: null}', () => {
  assert.throws(() => normalizeReturn([{ json: null }]), /index 0/);
});

test('C5: normalizeReturn throws on a primitive array element, naming the index', () => {
  assert.throws(() => normalizeReturn([{ a: 1 }, 'nope']), /index 1/);
});

test('C5: normalizeReturn throws on a nested array element inside an array return', () => {
  assert.throws(() => normalizeReturn([[1, 2]]), /index 0/);
});

test('C5: normalizeReturn still accepts the ordinary shapes', () => {
  assert.deepStrictEqual(normalizeReturn({ a: 1 }), [{ json: { a: 1 } }]);
  assert.deepStrictEqual(normalizeReturn([{ a: 1 }]), [{ json: { a: 1 } }]);
  assert.deepStrictEqual(normalizeReturn([{ json: { a: 1 } }]), [{ json: { a: 1 } }]);
  assert.deepStrictEqual(normalizeReturn([]), []);
});
