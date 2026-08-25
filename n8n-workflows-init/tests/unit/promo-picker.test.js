// ── promo-picker.test.js — hand-written edge cases, same shim as _all-nodes.test.js ───────────
//
// Ports the interesting bits of tests/offline/promo-picker/probe.js as real `node --test` cases,
// running the CURRENT exported body (export/live-spine-sorento-consume-main/nodes/promo-picker.js,
// sha-verified via node-source.js) -- NOT the stale local copy in tests/offline/promo-picker/
// (confirmed stale while building this: its sha256 does not match the export's; the local copy
// predates the D10 brand-gate-closed guard and the reference_target==='dym' pick fix below).
//
// The frozen fixtures under tests/fixtures/nodes/live-spine-sorento-consume-main/promo-picker/
// cover the bulk of probe.js's ~50 assertions as input/output pairs. These are the handful that
// are more naturally asserted as PROPERTIES of the output (sort order, dedup) than as a frozen
// whole-object equality.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const NODE_FILE = 'promo-picker.js';
const NODE_NAME = 'promo-picker';   // C1: the shim resolves this node's deployed mode by name
const src = loadNodes(SLUG, [NODE_FILE]);
const BODY = src[NODE_FILE];

const FX = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../offline/promo-picker/fixtures.json'), 'utf8'
));

function run({ validator, qf, gate, wrap } = {}) {
  const j = JSON.parse(JSON.stringify(FX.validator));
  Object.assign(j, validator || {});
  const parserOutput = Object.assign(JSON.parse(JSON.stringify(FX.qf)), qf || {});
  const gateJson = Object.assign({ access_notice: '', company_team: null, brand_gate_empty: false }, gate || {});
  const inputJson = wrap ? { output: j } : j;
  const fixture = {
    ctx: {
      "Call 'sub-query-reformulator'": [{ json: { output: parserOutput } }],
      'disallowed-entity-gate': [{ json: gateJson }],
    },
    input: [{ json: inputJson }],
  };
  const out = normalizeReturn(runNode({ body: BODY, fixture, slug: SLUG, nodeName: NODE_NAME }));
  // JSON round-trip: `out` was constructed inside the vm's OWN realm, so its arrays/objects are
  // not `assert.deepStrictEqual`-comparable against this file's own (different-realm) `[]`/`{}`
  // literals -- node's assert treats same-shape-but-different-realm values as "not
  // reference-equal". The shim's assertOutputEquals (used by _all-nodes.test.js) already does this
  // round-trip internally; hand-written tests calling node:assert directly need to do it too.
  return JSON.parse(JSON.stringify(out[0].json));
}

test('promo-picker: end dates sort non-increasing (S4b)', () => {
  const o = run();
  const endOf = (a) => (a.fields.find((f) => f.label.toLowerCase() === 'end date') || {}).value;
  const ends = o.answers.map(endOf);
  for (let i = 1; i < ends.length; i++) {
    assert.ok(ends[i - 1] >= ends[i], `row ${i} end date ${ends[i]} sorts after ${ends[i - 1]}`);
  }
});

test('promo-picker: row with no end date sorts LAST, not first', () => {
  const answers = JSON.parse(JSON.stringify(FX.validator.answers));
  answers[3].fields = answers[3].fields.filter((f) => f.label.toLowerCase() !== 'end date');
  const o = run({ validator: { answers } });
  const last = o.answers[o.answers.length - 1];
  assert.strictEqual(last.fields[0].value, answers[3].fields[0].value);
});

test('promo-picker: F3 regression — partial out-of-range sends only the in-range files', () => {
  const o = run({
    validator: { answers: FX.validator.answers.slice(0, 3), attachments: FX.validator.attachments.slice(0, 3) },
    qf: { reference_positions: [1, 2, 7] },
  });
  assert.strictEqual(o.attachments.length, 2);
  assert.deepStrictEqual((o._promo_pick || {}).out_of_range, [7]);
});

test('promo-picker: D10 brand gate suppresses answers/attachments/roster even on a wrapped envelope (F6-style)', () => {
  const o = run({ gate: { brand_gate_empty: true, company_team: 'marketing_promotion_cabana' } });
  assert.deepStrictEqual(o.answers, []);
  assert.deepStrictEqual(o.attachments, []);
  assert.strictEqual(o._brand_gate_closed, true);
  // RE-PINNED (team-name display fix, captain 2026-08-24): the offer still names THIS team and no
  // other - what changed is that the internal slug's underscores render as spaces for the customer.
  // The claim under test (the brand gate closes and the offer names the gate's company_team) is
  // unchanged; only its surface spelling is.
  assert.match(o.response, /Would you like me to escalate to marketing promotion cabana team\?/);
  assert.doesNotMatch(o.response, /_/, 'an internal team slug is showing through to the customer');
});

test('promo-picker: dym-picked reference_target is NOT re-applied as a roster position', () => {
  // Regression this harness caught building fixtures: the local offline copy of promo-picker.js
  // (tests/offline/promo-picker/promo-picker.js) predates this guard entirely and would have
  // filtered the roster down to row 2 here -- the currently-published body must not.
  const o = run({ qf: { reference_positions: [2], reference_target: 'dym' } });
  assert.strictEqual(o.answers.length, 15, 'reference_target=dym must bypass the positional filter');
});

test('promo-picker: unknown envelope shape fails CLOSED (no attachments), never dumps every file', () => {
  const j = JSON.parse(JSON.stringify(FX.validator));
  const fixture = {
    ctx: {
      "Call 'sub-query-reformulator'": [{ json: { output: FX.qf } }],
      'disallowed-entity-gate': [{ json: { access_notice: '', company_team: null, brand_gate_empty: false } }],
    },
    // deliberately no `answers` key -- an envelope shape the node does not recognise
    input: [{ json: { attachments: j.attachments } }],
  };
  const o = JSON.parse(JSON.stringify(normalizeReturn(runNode({ body: BODY, fixture, slug: SLUG, nodeName: NODE_NAME }))[0].json));
  assert.deepStrictEqual(o.attachments, []);
  assert.strictEqual(o._promo_picker_shape, 'unrecognised');
});
