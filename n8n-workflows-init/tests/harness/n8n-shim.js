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

  // REALM (S9): deliberately do NOT inject the host's Object/Array/JSON/Set/Map/String/Number/
  // Boolean/Date/Math/RegExp/Error into this sandbox. `vm.createContext(sandbox)` always hands the
  // script its OWN native realm (own Array, own String.prototype, etc.) regardless of what
  // properties the sandbox object carries — that is standard `vm` behaviour, not something this
  // shim opts into. Explicitly assigning the HOST's constructors onto the sandbox only shadows
  // that native resolution with a cross-realm reference, which is actively wrong: real n8n Code
  // node bodies run in ONE realm, so `[] instanceof Array` is true there, but was FALSE in this
  // shim (proven with a throwaway vm.createContext probe) because the sandbox's own `Array`
  // property pointed at the HOST's Array while `[]` literals were built against the vm context's
  // native Array.prototype. Leaving these off lets `Array`/`Object`/`JSON`/etc. resolve to the vm
  // context's own built-ins, which is both simpler (nothing to keep in sync) and correct (matches
  // production's single-realm semantics). No exported node body uses `instanceof` today, but nothing
  // should have to re-discover this landmine for the first one that does.
  const sandbox = {
    $: dollar,
    $input: inputAcc,
    $json: inputItems.length ? inputItems[0].json : undefined,
    $runIndex: (fixture && fixture.runIndex) ?? 0,
    $execution: (fixture && fixture.execution) ?? { id: 'test' },
    console,
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

// S7: `assertOutputEquals` (below) diffs `actual` against `expected` only AFTER both sides pass
// through `stripVolatile`'s `deepCopy` — a JSON round-trip. `JSON.stringify(NaN)` (and
// `Infinity`/`-Infinity`) silently produces `null`, so a refactor that makes a node body compute
// NaN where it used to compute a real number would round-trip to `null` and could then compare
// EQUAL to a fixture that legitimately has `null` in that slot — a real bug hidden by the very
// mechanism meant to catch it. Walk the RAW returned value here, before any round-trip has a
// chance to erase the evidence, and throw loudly on the first non-finite numeric leaf found.
function assertNoNonFiniteNumbers(value, path) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `normalizeReturn: node returned a non-finite number (${value}) at ${path || '<root>'} — ` +
      `this would silently become \`null\` after assertOutputEquals's JSON round-trip and could ` +
      `compare equal to a legitimate null; fix the node body's math, don't let this pass through`
    );
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNonFiniteNumbers(v, `${path || ''}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) assertNoNonFiniteNumbers(value[k], path ? `${path}.${k}` : k);
  }
}

// n8n Code "Run Once for All Items" normalizes whatever the body returns into an array of
// {json: {...}} items:
//   - a single plain object            -> [{json: obj}]
//   - an array of plain objects        -> obj.map(o => ({json: o}))
//   - an array of {json: ...} items    -> left as-is
function normalizeReturn(returned) {
  let out;
  if (Array.isArray(returned)) {
    const alreadyItemShaped = returned.length === 0 || returned.every(
      (it) => it && typeof it === 'object' && !Array.isArray(it) && Object.prototype.hasOwnProperty.call(it, 'json')
    );
    out = alreadyItemShaped ? returned : returned.map((o) => ({ json: o }));
  } else if (returned && typeof returned === 'object') {
    out = [{ json: returned }];
  } else {
    throw new Error(`normalizeReturn: node returned a ${returned === null ? 'null' : typeof returned}, which n8n's Code node cannot turn into items`);
  }
  assertNoNonFiniteNumbers(out, '');
  return out;
}

// S8 (reviewer): a `volatile:["*.json"]` fixture field could delete an ENTIRE output before
// comparing, making any assertion pass no matter what the node returned — and 0 of 144 committed
// fixtures ever used `volatile` for anything. Per this repo's simplest-thing-that-works principle,
// the mechanism is deleted outright rather than hardened: an unused escape hatch that can blank a
// whole assertion is a liability sitting idle, not a feature earning its keep. If a future fixture
// genuinely needs to ignore a volatile field (a timestamp, a generated id), reintroduce a NARROWLY
// SCOPED version then — deep-equal ONE key's value, never delete the shape of the comparison.
//
// Deep-equal `actual` (the RAW value a node body returned) against `expected` (the fixture's
// n8n-normalized `expected` array). Both sides are JSON-round-tripped first (via `deepCopy`) so an
// in-process `undefined`-valued key (which a real n8n item, always JSON-serialized in transit,
// could never carry — see tests/flow/_lib.js's `jsonNormalize` for the same reasoning) can't cause
// a false mismatch against an already-JSON `expected`.
function assertOutputEquals(actual, expected) {
  const normalized = normalizeReturn(actual);
  const a = deepCopy(normalized);
  const e = deepCopy(expected);
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
