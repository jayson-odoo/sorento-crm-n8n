// ── tests/flow/_lib.js — shared helpers for the flow (Tier 2) lane tests ──────────────────────
// Not a *.test.js itself (the "test:flow" glob is `tests/flow/*.test.js`), so this never runs as
// its own test file.
'use strict';
const fs = require('fs');
const path = require('path');

const EXPORT_ROOT = path.resolve(__dirname, '../../export');
const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures/nodes');

function loadFixture(slug, nodeName, execName) {
  const p = path.join(FIXTURES_ROOT, slug, nodeName, execName + '.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadWorkflow(slug) {
  return JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, slug, 'workflow.json'), 'utf8'));
}

// ── independent path oracle ─────────────────────────────────────────────────────────────────
// Deliberately does NOT reuse run-lane's own traversal (that would make the path assertion
// tautological — it would only prove run-lane agrees with itself).
//
// PRIMARY (S5, reviewer): capture-fixtures.py now records `ran` — every node the execution
// actually ran, in REAL execution order (Python dict preserves n8n's own runData insertion order,
// which is appended-to as each node finishes — see capture-fixtures.py's `ran_list` comment).
// When a fixture has `ran`, the path is just the sub-list between `start` and `end` — no graph
// walk, no ambiguity, independent of run-lane and of the connections graph alike.
//
// FALLBACK (pre-existing fixtures captured before `ran` existed): walk the connections graph
// forward from `start`, stepping into whichever neighbour (a) is reachable and (b) has a `ctx`
// entry. Sound exactly when at most one forward neighbour of the current node has a ctx entry —
// true for every lane in this suite (cross-checked by hand: every fixture actually in use here
// carries `ran`, and slicing `ran` agrees with this fallback byte-for-byte — see the reviewer
// verification in the task report). It would be UNSOUND for a lane containing a reconvergence
// (two upstream branches both landing back on a node still forward-reachable from an earlier
// branch point) — this fallback then sees two ctx-having candidates and cannot pick between them;
// it throws in that case rather than guessing.
function derivePathFromRan(ran, start, end) {
  const si = ran.indexOf(start);
  const ei = ran.indexOf(end, si === -1 ? 0 : si);
  if (si === -1) throw new Error(`derivePathFromRan: start "${start}" not found in fixture.ran`);
  if (ei === -1) throw new Error(`derivePathFromRan: end "${end}" not found in fixture.ran at/after "${start}"`);
  return ran.slice(si, ei + 1);
}

function derivePathFromConnectionsWalk(wf, ctxKeys, start, end) {
  const connections = wf.connections || {};
  const path_ = [start];
  const visited = new Set([start]);
  let current = start;
  while (current !== end) {
    const conn = connections[current];
    const candidates = [];
    if (conn && conn.main) {
      for (const targets of conn.main) {
        for (const t of targets || []) {
          if (ctxKeys.has(t.node) && !visited.has(t.node)) candidates.push(t.node);
        }
      }
    }
    if (candidates.length === 0) {
      throw new Error(`derivePathFromCtx: dead end at "${current}" (no forward neighbour of ${current} has a ctx entry) — start=${start} end=${end}`);
    }
    if (candidates.length > 1) {
      throw new Error(`derivePathFromCtx: ambiguous at "${current}": multiple forward neighbours have ctx entries (${candidates.join(', ')}) — oracle cannot pick`);
    }
    current = candidates[0];
    path_.push(current);
    visited.add(current);
  }
  return path_;
}

// `fx` is the WHOLE loaded fixture (not just its ctx) so this can prefer `fx.ran` and only fall
// back to the connections walk (using `fx.ctx`'s keys) when a fixture predates that field.
function derivePathFromCtx(wf, fx, start, end) {
  if (Array.isArray(fx.ran)) return derivePathFromRan(fx.ran, start, end);
  return derivePathFromConnectionsWalk(wf, new Set(Object.keys(fx.ctx)), start, end);
}

// ── true input to a lane's `start` node ────────────────────────────────────────────────────
// `ctx[start]` is `start`'s own captured OUTPUT, not what fed into it — several Code nodes on
// these lanes read `$input.first().json` directly (not-found-error-message, compile-current-state,
// build-suggest-offer, crossdomain-compose, output_exchange, suggest-follow-up all do), so feeding
// a node its own output as input is a real correctness bug, not a harmless shortcut — it happens
// to look green on an accumulator-style node ("out = {...$input.first().json, ...newFields}") only
// because its own output is a superset of its real input in the same shape, which is a coincidence
// of this codebase's style, not something to rely on. Reverse-scan `connections` for whichever
// predecessor of `start` the fixture's ctx says actually ran, and use THAT node's captured output.
function deriveInputFor(wf, ctx, start) {
  const connections = wf.connections || {};
  const candidates = [];
  for (const [srcName, conn] of Object.entries(connections)) {
    if (!conn.main) continue;
    for (const targets of conn.main) {
      for (const t of targets || []) {
        if (t.node === start && Object.prototype.hasOwnProperty.call(ctx, srcName)) {
          candidates.push(srcName);
        }
      }
    }
  }
  const unique = Array.from(new Set(candidates));
  if (unique.length !== 1) {
    throw new Error(`deriveInputFor("${start}"): expected exactly one ctx-having predecessor, found [${unique.join(', ')}] — pass \`input\` explicitly for this lane`);
  }
  return ctx[unique[0]];
}

// A real n8n item never carries an explicit-`undefined` property — every hop between nodes (queue,
// REST capture, `includeData` storage) round-trips through JSON, which drops those keys. A Code
// node body that does `out.field = maybeUndefinedExpr` keeps that key IN-PROCESS with value
// `undefined` (found the hard way: `assert.deepStrictEqual` treats `{a: undefined}` !== `{}`,
// while the captured `expected` fixture — already JSON — never has the key at all). Mirror the
// real system: JSON-round-trip the lane's own output before comparing, same as fixture capture
// already implicitly did to `expected`.
function jsonNormalize(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { loadFixture, loadWorkflow, derivePathFromCtx, deriveInputFor, jsonNormalize, EXPORT_ROOT, FIXTURES_ROOT };
