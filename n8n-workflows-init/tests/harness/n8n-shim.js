// ── n8n-shim.js — THE ONE shim used by every unit test (tests/unit/*.test.js) ─────────────────
//
// Step 1 (part A) of plans/test-pyramid-and-git-deploy.md. Provides exactly what the exported
// node bodies actually use (measured across export/*/nodes/*.js): `$('x')` / `$input` with
// `.first()` / `.all()` / `.last()` / `.item` / `isExecuted`, `$json`, `$runIndex`, `$execution`,
// plus the handful of JS globals a Code node body can reach.
//
// FAIL LOUD, ON PURPOSE. A `$('x')` read of a node the fixture didn't stub, or `.first()` on an
// empty item array, THROWS — it never silently hands back `undefined`. A body that reads an
// unstubbed upstream node is exactly the kind of drift this harness exists to catch (see
// node-source.js's F-STALE incident for the sibling failure mode: silently-wrong data that never
// throws). If a node body legitimately wraps a read in try/catch (several do, e.g. dym-transform's
// `central-exchange` lane probe), the throw is caught there and the body's own fallback applies —
// that is correct behaviour, not a shim bug.
//
// Bodies are loaded ONLY via node-source.js (sha-verified against export/). This module does not
// read node bodies itself — it only runs whatever body string it is given.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures/nodes');

// ── deep copy ───────────────────────────────────────────────────────────────────────────────
// Several node bodies splice/sort/mutate items IN PLACE (promo-picker's S4b sort is the clearest
// example — see tests/offline/promo-picker/probe.js's own comment on this). Fixtures are JSON, so
// a JSON round-trip is a sufficient (and simplest-thing) deep copy: it can't preserve Dates/RegExp,
// but nothing in a fixture file should ever be a Date/RegExp — fixtures are captured `runData`,
// which n8n itself only stores as JSON.
//
// CALLED ONCE PER `buildSandbox`, not per accessor read. `buildSandbox` deep-copies each fixture
// array a single time up front and every accessor it builds (`$(name)`, `$input`, `$json`) shares
// those same copies — see makeAccessor's "SAME-REFERENCE SEMANTICS" comment below. Copying inside
// `makeAccessor`'s own methods instead (the original shape of this file) silently drops any
// mutate-then-reread pattern, which is exactly how real n8n's item references behave.
function deepCopy(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

// ── item-array accessor: backs both $(name) and $input ────────────────────────────────────────
//
// THROW TIMING IS DELIBERATE. Real node bodies overwhelmingly guard a `$('x')` read with its own
// `isExecuted` check first (`if ($('gate').isExecuted) { ... $('gate').first() ... }` — measured
// across export/*/nodes/*.js), which is the correct, safe pattern: a node that legitimately did
// not run on a given branch is not a fixture-authoring mistake. So `$(name)` itself NEVER throws —
// it always returns an accessor, and `isExecuted` truthfully reports whether the fixture declared
// that name in `ctx` at all. What throws, loudly, is calling `.first()` / `.all()` / `.last()` /
// `.item` on an accessor with nothing behind it — an unstubbed name a body reads WITHOUT checking
// isExecuted first is exactly the "read an unstubbed node" mistake this harness must not paper
// over with `undefined`.
//
// SAME-REFERENCE SEMANTICS. Real n8n hands back the SAME mutable item object on every `.first()`/
// `.item`/`.all()[i]` call within one node execution — a body that does
// `$input.first().json.x = 1; return $input.first().json` sees its own mutation on the re-read.
// `items` here is already the ONE array `buildSandbox` copied for this call (see below); this
// accessor must NOT copy again per method call, or that mutation is silently lost against an
// independent copy (found hand-crafting the `set-human-intervened` fixture — see its
// `source.rationale`). `.all()` still returns a fresh ARRAY (`.slice()`) so a body can't corrupt
// the accessor's own backing array by splicing the returned list, but the ITEMS inside it are the
// same references as `.first()`/`.item` — mutating `.all()[0].json` is visible on a later
// `.first()` too, matching production.
function makeAccessor(items, label, known) {
  const arr = Array.isArray(items) ? items : [];
  const unstubbed = !known
    ? ` — this name has no "ctx" entry at all in the fixture (known: will be listed by the caller)`
    : '';
  return {
    first() {
      if (arr.length === 0) throw new Error(`${label}.first(): zero items${unstubbed || ' (fixture has zero items)'}`);
      return arr[0];
    },
    all() {
      if (arr.length === 0 && !known) throw new Error(`${label}.all(): zero items${unstubbed}`);
      return arr.slice();
    },
    last() {
      if (arr.length === 0) throw new Error(`${label}.last(): zero items${unstubbed || ' (fixture has zero items)'}`);
      return arr[arr.length - 1];
    },
    get item() {
      if (arr.length === 0) throw new Error(`${label}.item: zero items${unstubbed || ' (fixture has zero items)'}`);
      return arr[0];
    },
  };
}

function buildSandbox(fixture) {
  const ctxMapRaw = (fixture && fixture.ctx) || {};
  const inputItemsRaw = (fixture && fixture.input) || [];

  // Copy every fixture array EXACTLY ONCE per buildSandbox call (i.e. once per node execution —
  // `runNode` calls this once; run-lane.js's If/Switch/Set evaluators call it once per node/
  // assignment they evaluate). Everything downstream (`dollar`, `inputAcc`, `$json`) reads off
  // these copies, never off `fixture` directly, so: (a) the on-disk fixture / caller's fixture
  // object is never mutated — pristine across every other test that loads it; (b) all accessors
  // built from THIS sandbox share the same underlying objects, so a mutation made through one
  // `.first()`/`.item` call is visible to a later call in the same node body, matching real n8n.
  const ctxMap = {};
  for (const k of Object.keys(ctxMapRaw)) ctxMap[k] = deepCopy(ctxMapRaw[k]);
  const inputItems = deepCopy(inputItemsRaw);

  const dollar = (name) => {
    const known = Object.prototype.hasOwnProperty.call(ctxMapRaw, name);
    const label = `$('${name}')` + (known ? '' : ` [no fixture.ctx entry — known: ${Object.keys(ctxMapRaw).join(', ')}]`);
    const acc = makeAccessor(known ? ctxMap[name] : [], label, known);
    acc.isExecuted = known; // presence in ctx == the fixture declares this upstream node ran
    return acc;
  };

  const inputAcc = makeAccessor(inputItems, '$input', true);

  const sandbox = {
    $: dollar,
    $input: inputAcc,
    $json: inputItems.length ? inputItems[0].json : undefined,
    $runIndex: (fixture && fixture.runIndex) ?? 0,
    $execution: (fixture && fixture.execution) ?? { id: 'test' },
    console,
    JSON,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    Math,
    RegExp,
    Error,
    TextEncoder,
    structuredClone: typeof structuredClone === 'function' ? structuredClone : undefined,
  };
  return sandbox;
}

// Run a node body (bare `return ...`, as n8n Code "Run Once for All Items" bodies are written)
// against a fixture. Returns the RAW value the body returned — an array of {json} items, an array
// of plain objects, a single plain object, or (if the body is buggy) anything else. Callers that
// want to compare against a fixture's `expected` should normalize first (see normalizeReturn).
function runNode({ body, fixture }) {
  if (typeof body !== 'string') throw new Error('runNode: body must be the node source as a string (load it via node-source.js)');
  const sandbox = buildSandbox(fixture);
  const ctx = vm.createContext(sandbox);
  const script = `(function(){\n${body}\n})()`;
  return vm.runInContext(script, ctx, { filename: 'n8n-code-node.js' });
}

// n8n Code "Run Once for All Items" normalizes whatever the body returns into an array of
// {json: {...}} items:
//   - a single plain object            -> [{json: obj}]
//   - an array of plain objects        -> obj.map(o => ({json: o}))
//   - an array of {json: ...} items    -> left as-is
function normalizeReturn(returned) {
  if (Array.isArray(returned)) {
    const alreadyItemShaped = returned.length === 0 || returned.every(
      (it) => it && typeof it === 'object' && !Array.isArray(it) && Object.prototype.hasOwnProperty.call(it, 'json')
    );
    return alreadyItemShaped ? returned : returned.map((o) => ({ json: o }));
  }
  if (returned && typeof returned === 'object') {
    return [{ json: returned }];
  }
  throw new Error(`normalizeReturn: node returned a ${returned === null ? 'null' : typeof returned}, which n8n's Code node cannot turn into items`);
}

// ── volatile-path deletion (dot paths, "*" wildcards an array index or every object key) ──────
function walkDelete(node, parts) {
  if (node === null || node === undefined) return;
  const [head, ...rest] = parts;
  if (head === '*') {
    if (Array.isArray(node)) {
      for (const child of node) {
        if (rest.length === 0) continue; // "*" alone (delete every element) isn't a supported leaf
        walkDelete(child, rest);
      }
    } else if (typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (rest.length === 0) delete node[key];
        else walkDelete(node[key], rest);
      }
    }
    return;
  }
  if (rest.length === 0) {
    if (Array.isArray(node)) {
      const idx = Number(head);
      if (Number.isInteger(idx) && idx >= 0 && idx < node.length) node[idx] = null;
    } else if (typeof node === 'object') {
      delete node[head];
    }
    return;
  }
  let child;
  if (Array.isArray(node)) {
    const idx = Number(head);
    child = Number.isInteger(idx) ? node[idx] : undefined;
  } else if (typeof node === 'object') {
    child = node[head];
  }
  walkDelete(child, rest);
}

function stripVolatile(value, volatilePaths) {
  const copy = deepCopy(value);
  for (const p of volatilePaths || []) walkDelete(copy, String(p).split('.'));
  return copy;
}

// Deep-equal `actual` (the RAW value a node body returned) against `expected` (the fixture's
// n8n-normalized `expected` array), after deleting each `volatile` path from both sides.
function assertOutputEquals(actual, expected, volatile) {
  const normalized = normalizeReturn(actual);
  const a = stripVolatile(normalized, volatile);
  const e = stripVolatile(expected, volatile);
  assert.deepStrictEqual(a, e);
}

// Load every fixture for one node: tests/fixtures/nodes/<slug>/<nodeName>/*.json
function loadFixtures(slug, nodeName) {
  const dir = path.join(FIXTURES_ROOT, slug, nodeName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      name: f.replace(/\.json$/, ''),
      fixture: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')),
    }));
}

module.exports = {
  runNode,
  loadFixtures,
  assertOutputEquals,
  normalizeReturn,
  FIXTURES_ROOT,
  // Exported for tests/harness/run-lane.js (Tier 2 / flow): it needs the SAME $/$input/$json
  // sandbox this shim builds for Code nodes, so it can evaluate If/Switch/Set expressions in it
  // rather than inventing a second one.
  buildSandbox,
  deepCopy,
};
