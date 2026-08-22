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
  const raw = runNode({ body, fixture: { ctx: {}, input: [{ json: {} }] } });
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
  const raw = runNode({ body, fixture: { ctx: {}, input: [{ json: {} }] } });
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
