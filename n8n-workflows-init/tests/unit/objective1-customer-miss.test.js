// ── objective1-customer-miss.test.js — a missed CUSTOMER must gate the turn and be NAMED ──────
//
// OBJECTIVE (captain): when a customer is named but does not resolve, do not answer with somebody
// else's orders, and say which CUSTOMER was not found — not the product that happened to pass
// through. Pre-fix the reply read `Couldn't find "Srtwc286"` (the resolved product) while the real
// miss, the customer, never rendered.
//
// Fixtures are real ctx/input from exec 13629634 ("mastiles klang srtwc286 delivery"), captured
// against the published clone body. They live under fixtures/cases/ rather than the per-node tree
// because the clone is not at fixture parity with live and must not weaken the coverage gate.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const run = (node, file) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: load(file), slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('a missed customer blocks the turn instead of answering another account', () => {
  const o = run('disallowed-entity-gate', 'obj1-disallowed-entity-gate.json');
  assert.equal(o.gate_passed, false, 'a missed customer must never reach get-results');
});

test('the did-you-mean names the missed CUSTOMER, not the product that resolved', () => {
  const o = run('build-suggest-offer', 'obj1-build-suggest-offer.json');
  const text = JSON.stringify(o);
  assert.match(text, /mastiles klang/i, 'the missed customer must be named');
  assert.match(text, /MASTILE KLANG/i, 'the correction must be offered');
  assert.doesNotMatch(
    text, /Couldn't find[^]{0,40}srtwc286/i,
    'the product resolved and passed through - it is not the miss',
  );
});
