// ── dropped-filter-gate.test.js — a filter that resolved to NOTHING must not be silently dropped ──
//
// Both fixtures were captured from real turns that ran under PRE-fix bodies, so their recorded
// `expected` is the OLD behaviour. They live under tests/fixtures/cases/ (not the per-node tree)
// precisely so the generic byte-equality driver does not assert yesterday's output; here we run the
// CURRENT published body against their real ctx/input and assert the INTENT instead.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const NODE = 'disallowed-entity-gate';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const gate = (fixture) => {
  const body = loadNodes(SLUG, ['disallowed-entity-gate.js'])['disallowed-entity-gate.js'];
  const out = runNode({ body, fixture, slug: SLUG, nodeName: NODE });
  // the shim returns a bare json object for per-item nodes, [{json}] for run-once nodes
  return Array.isArray(out) ? out[0].json : out;
};

// exec 13626807: "wesrp10b" (0 CRM candidates, real code is WESERP10B) + customer 300-D059 (3).
// Pre-fix this answered with the customer's ENTIRE order book, none of it containing the product.
test('a hard-missed product with nothing else on its axis blocks the turn', () => {
  const o = gate(load('gate-dropped-filter-blocks.json'));
  assert.equal(o.gate_passed, false, 'a lost filter must not be answered around');
  assert.deepEqual(o.dropped_filter_tokens, ['wesrp10b']);
});

// exec 13628845: the captain CORRECTED wesrp10b -> WESERP10B. The parser echoed both as
// current-message product entities, so the stale spelling still resolved to zero. The first
// version of this gate refused the correction twice and the conversation could not move on.
test('a superseded spelling does NOT block when the axis resolved', () => {
  const o = gate(load('gate-corrected-typo-passes.json'));
  assert.equal(o.gate_passed, true, 'the product axis resolved (WESERP10B) - the filter was applied');
  assert.ok(!o.dropped_filter_tokens, 'nothing was lost, so nothing should be reported lost');
});
