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
const EXPORT_ROOT = path.resolve(__dirname, '../../export');

// ── Code-node execution mode (C1, cross-model review) ─────────────────────────────────────────
// n8n's Code node has two modes and they are NOT interchangeable:
//   runOnceForAllItems (the default; `parameters.mode` is OMITTED from workflow.json when it
//                       applies) — body runs ONCE, `$input.all()` is the whole batch, `$json` is
//                       item 0, and the body returns the WHOLE output item list.
//   runOnceForEachItem — body runs ONCE PER INPUT ITEM, `$json`/`$input.item` are THAT item,
//                       `$input.all()/.first()/.last()` are unavailable (n8n throws), and each run
//                       returns exactly ONE item; the runs' results are concatenated.
//
// The mode is resolved from `export/<slug>/workflow.json` — the DEPLOYED artifact itself, the same
// file run-lane.js walks and the same file tests/harness/pin-wiring.js derives the committed
// wiring pin from. Deliberately NOT from wiring.json: that is a derived copy kept honest by a test,
// and reading behaviour out of a copy is one more thing that can drift from what actually ships.
// Reading workflow.json means the harness executes a node the way the bytes headed for n8n say to.
const _wfCache = new Map();
function _workflowOf(slug) {
  if (!_wfCache.has(slug)) {
    const p = path.join(EXPORT_ROOT, slug, 'workflow.json');
    if (!fs.existsSync(p)) throw new Error(`codeNodeMode: no export/${slug}/workflow.json — run export-workflows.py`);
    _wfCache.set(slug, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  return _wfCache.get(slug);
}

const MODE_ALL = 'runOnceForAllItems';
const MODE_EACH = 'runOnceForEachItem';

function assertKnownMode(mode) {
  if (mode !== MODE_ALL && mode !== MODE_EACH) {
    throw new Error(`n8n-shim: unknown Code node mode ${JSON.stringify(mode)} — expected "${MODE_ALL}" or "${MODE_EACH}"`);
  }
  return mode;
}

function codeNodeMode(slug, nodeName) {
  const wf = _workflowOf(slug);
  const node = (wf.nodes || []).find((n) => n.name === nodeName);
  if (!node) throw new Error(`codeNodeMode: no node named "${nodeName}" in export/${slug}/workflow.json`);
  if (node.type !== 'n8n-nodes-base.code') {
    throw new Error(`codeNodeMode: "${nodeName}" in ${slug} is a ${node.type}, not a Code node`);
  }
  return assertKnownMode((node.parameters || {}).mode ?? MODE_ALL);
}

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
// `source.rationale`). Since C3 (below) `.all()` returns that same backing array itself, so a body
// that splices/sorts the returned list mutates what a later `.first()`/`.all()`/`.item` sees —
// which is precisely what production does.
// C3 (cross-model review): `.all()` returns the LIVE BACKING ARRAY, not `arr.slice()`. Real n8n
// hands the body its own item array — `promo-picker` genuinely splices in place (see its own S4b
// comments), and against a defensive copy that splice mutated a throwaway, so an in-place-mutation
// bug behaved one way in production and another way offline. Tests stay isolated from each other
// because `buildSandbox` deep-copies the fixture ONCE PER CALL (see below): the array a body can
// now corrupt is this execution's private copy, never the caller's fixture or the file on disk.
//
// C1/C4: `perItemIndex` is set only for `$input` inside a `runOnceForEachItem` run. There:
//   - `.all()/.first()/.last()` THROW, exactly as n8n does (they are all-items-mode-only)
//   - `.item` is the CURRENT item, exactly resolvable
// Everywhere else (`$input` in all-items mode, and every `$('x')` accessor in either mode) `.item`
// is a PAIRED-ITEM read: n8n walks the paired-item links back to the one source item and throws
// when the link is missing or ambiguous. This harness does not track paired items, so it resolves
// `.item` only in the unambiguous case (exactly one candidate item) and THROWS on more than one.
// Silently returning item 0 there is the green-that-cannot-fail class: a real ambiguity would read
// as a confident answer.
function makeAccessor(items, label, known, perItemIndex) {
  const arr = Array.isArray(items) ? items : [];
  const perItem = typeof perItemIndex === 'number';
  const unstubbed = !known
    ? ` — this name has no "ctx" entry at all in the fixture (known: will be listed by the caller)`
    : '';
  const modeThrow = (m) => {
    throw new Error(
      `${label}.${m}(): unavailable in a "runOnceForEachItem" Code node — real n8n throws here. ` +
      `A per-item body sees only its own item, via $json / $input.item.`
    );
  };
  return {
    first() {
      if (perItem) modeThrow('first');
      if (arr.length === 0) throw new Error(`${label}.first(): zero items${unstubbed || ' (fixture has zero items)'}`);
      return arr[0];
    },
    all() {
      if (perItem) modeThrow('all');
      if (arr.length === 0 && !known) throw new Error(`${label}.all(): zero items${unstubbed}`);
      return arr;
    },
    last() {
      if (perItem) modeThrow('last');
      if (arr.length === 0) throw new Error(`${label}.last(): zero items${unstubbed || ' (fixture has zero items)'}`);
      return arr[arr.length - 1];
    },
    get item() {
      if (perItem) return arr[perItemIndex];
      if (arr.length === 0) throw new Error(`${label}.item: zero items${unstubbed || ' (fixture has zero items)'}`);
      if (arr.length > 1) {
        throw new Error(
          `${label}.item: ${arr.length} items — \`.item\` is a PAIRED ITEM read, which n8n resolves ` +
          `through paired-item links and errors on when the link is missing or ambiguous. This ` +
          `harness does not track paired items, so it refuses to guess (returning item 0 would be a ` +
          `confident wrong answer). Use .first()/.all() if the body genuinely means item 0.`
        );
      }
      return arr[0];
    },
  };
}

// `itemIndex` (C1/C2): pass a number to build the sandbox for ONE item of a `runOnceForEachItem`
// run — `$json` and `$input.item` become THAT item, and `$input.all()/.first()/.last()` throw.
// Omit it for the ordinary all-items sandbox (`$json` = item 0, matching n8n).
function buildSandbox(fixture, itemIndex) {
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

  const perItem = typeof itemIndex === 'number';
  if (perItem && (itemIndex < 0 || itemIndex >= inputItems.length)) {
    throw new Error(`buildSandbox: itemIndex ${itemIndex} out of range (fixture has ${inputItems.length} input item(s))`);
  }
  const inputAcc = makeAccessor(inputItems, '$input', true, perItem ? itemIndex : undefined);

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
    $json: perItem ? inputItems[itemIndex].json : (inputItems.length ? inputItems[0].json : undefined),
    $runIndex: (fixture && fixture.runIndex) ?? 0,
    $execution: (fixture && fixture.execution) ?? { id: 'test' },
    console,
    TextEncoder,
    structuredClone: typeof structuredClone === 'function' ? structuredClone : undefined,
  };
  return sandbox;
}

// C1: a `runOnceForEachItem` body returns ONE item per run. n8n rejects an array there ("Code
// doesn't return a single object"), so accepting one silently would let a body that is wrong in
// production look right offline.
function normalizeEachItemReturn(returned, i) {
  if (Array.isArray(returned)) {
    throw new Error(
      `runNode (runOnceForEachItem): the body returned an ARRAY for input item ${i} — a per-item ` +
      `Code node must return a single item ({json: {...}} or a plain object); n8n errors on an array here`
    );
  }
  if (!returned || typeof returned !== 'object') {
    throw new Error(
      `runNode (runOnceForEachItem): the body returned a ${returned === null ? 'null' : typeof returned} ` +
      `for input item ${i} — a per-item Code node must return a single item`
    );
  }
  return Object.prototype.hasOwnProperty.call(returned, 'json') ? returned : { json: returned };
}

// Run a node body (bare `return ...`, as n8n Code node bodies are written) against a fixture.
//
// MODE IS NOT OPTIONAL (C1). Real n8n runs the body once for the whole batch or once per item, and
// which one it does is a property of the DEPLOYED node, not of the test. Pass either
// `slug` + `nodeName` (resolved from export/<slug>/workflow.json — use this for any real exported
// body, so the harness can never drift from what ships) or an explicit `mode` (for a synthetic
// body that has no deployed node behind it). Guessing a default was how a per-item node got
// executed for-all-items with nobody noticing, so there is no default.
//
// Returns the RAW value the body returned:
//   runOnceForAllItems — whatever the body returned, untouched (array of {json} items, array of
//                        plain objects, a single plain object, or — if the body is buggy —
//                        anything else). Callers comparing against a fixture's `expected` should
//                        normalize first (see normalizeReturn).
//   runOnceForEachItem — the concatenated per-run results, already an array of {json} items (which
//                        normalizeReturn then passes through unchanged).
function runNode({ body, fixture, slug, nodeName, mode }) {
  if (typeof body !== 'string') throw new Error('runNode: body must be the node source as a string (load it via node-source.js)');
  let resolvedMode;
  if (mode !== undefined) {
    resolvedMode = assertKnownMode(mode);
  } else if (slug && nodeName) {
    resolvedMode = codeNodeMode(slug, nodeName);
  } else {
    throw new Error(
      'runNode: no execution mode — pass `slug` + `nodeName` (resolved from export/<slug>/workflow.json, ' +
      'correct for any real exported body) or an explicit `mode` for a synthetic body. There is no ' +
      'default: silently assuming runOnceForAllItems is how a per-item node gets mis-executed.'
    );
  }
  const script = `(function(){\n${body}\n})()`;

  if (resolvedMode === MODE_ALL) {
    const ctx = vm.createContext(buildSandbox(fixture));
    return vm.runInContext(script, ctx, { filename: 'n8n-code-node.js' });
  }

  // runOnceForEachItem: one execution per input item, results concatenated. With zero input items
  // the body never runs at all (n8n emits nothing), which is why this is not an error.
  const inputCount = ((fixture && fixture.input) || []).length;
  const out = [];
  for (let i = 0; i < inputCount; i++) {
    const ctx = vm.createContext(buildSandbox(fixture, i));
    out.push(normalizeEachItemReturn(vm.runInContext(script, ctx, { filename: 'n8n-code-node.js' }), i));
  }
  return out;
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
// C5 (cross-model review): n8n requires every output item's `json` to be a NON-ARRAY OBJECT. It
// errors on `{json: []}`, on `{json: null}`, and on an array element that isn't an object at all
// ("Always return an array of objects"). This normalizer used to wave all three through — `[]` and
// `null` are perfectly good JSON, so they survived the round-trip and could even compare equal to
// a fixture that legitimately held them, which is a production error passing as a green test.
// Validate the shape and name the offending index.
function assertItemShape(out) {
  out.forEach((it, i) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      throw new Error(
        `normalizeReturn: output index ${i} is ${Array.isArray(it) ? 'an array' : (it === null ? 'null' : typeof it)}, ` +
        `not an item object — n8n requires an array of objects`
      );
    }
    const j = it.json;
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      throw new Error(
        `normalizeReturn: output index ${i} has json = ${Array.isArray(j) ? 'an array' : (j === null ? 'null' : typeof j)} — ` +
        `n8n requires each item's \`json\` to be a non-array object, and errors on this in production`
      );
    }
  });
}

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
  assertItemShape(out);
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
  codeNodeMode,
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
