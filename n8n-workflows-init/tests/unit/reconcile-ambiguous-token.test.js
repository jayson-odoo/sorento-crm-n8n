// ── reconcile-ambiguous-token.test.js — a token that named a family must not become one code ──
//
// Execs 13733614 -> 13733666. Turn A, the customer typed "srtwc286". The resolver matched TEN
// products (SRTWC286-SH-200, -SH-P, -SH-PP, -SH, -SH-UF, -SH-NEW-150, -SH-150, -SH-NEW-P,
// -SH-NEW-200, -SH-NEW) and the gate scoped the search to all ten - the reply said so:
// "product: SRTWC286-SH-200 (+9 more)". reconcileEntities() still took resolutions[0].matches[0]
// and stamped ONE canonical_code onto the carried entity, so session state persisted
// {raw:"srtwc286", hint:"product", canonical_code:"SRTWC286-SH-200"} - a pin the customer never
// made. Turn B ("mastile klang customer") carried that pinned code, the resolver resolved the
// EXACT code to 1 product, and the search silently narrowed from the whole family to one variant.
// Same failure class as the customer account-family collapse fixed earlier this branch
// (commit 8395dcd): a pin the user never made.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const FIXTURE = 'pick-must-keep-missed-product--compile-current-state.json';
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));

const runMut = (mutate) => {
  const fx = load(FIXTURE);
  mutate(fx);
  const body = loadNodes(SLUG, ['compile-current-state.js'])['compile-current-state.js'];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'compile-current-state' });
  return Array.isArray(out) ? out[0].json : out;
};

const setReformulatorEntities = (fx, entities) => {
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.entities = entities;
};
const setResolutions = (fx, resolutions) => {
  for (const item of fx.ctx['resolve-entity'] || []) item.json.resolutions = resolutions;
};

test('BUG exec 13733614: a token resolved to 10 products must not be pinned to one canonical_code', () => {
  const o = runMut((fx) => {
    setReformulatorEntities(fx, [
      { raw: 'srtwc286', hint: 'product', current_message: true, canonical_code: null },
    ]);
    setResolutions(fx, [{
      token: 'srtwc286',
      resolved: false,
      ambiguous: true,
      matches: [
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-200' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-P' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-PP' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-UF' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-NEW-150' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-150' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-NEW-P' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-NEW-200' },
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-NEW' },
      ],
    }]);
  });
  const ents = o.variables.entities || [];
  const e = ents.find((x) => x.raw === 'srtwc286');
  assert.ok(e, 'the token survives reconciliation');
  assert.strictEqual(e.canonical_code, null,
    'a token that named ten products must not be silently narrowed to one (exec 13733614 -> 13733666)');
  assert.strictEqual(e.raw, 'srtwc286', 'the raw token must stay intact so it re-resolves to the family next turn');
});

test('must-not-regress: a token with exactly ONE match still gets that match\'s code and hint', () => {
  const o = runMut((fx) => {
    setReformulatorEntities(fx, [
      { raw: 'srtwc286-sh-200', hint: 'unknown', current_message: true, canonical_code: null },
    ]);
    setResolutions(fx, [{
      token: 'srtwc286-sh-200',
      resolved: true,
      ambiguous: false,
      matches: [
        { entity_type: 'product', canonical_code: 'SRTWC286-SH-200' },
      ],
    }]);
  });
  const ents = o.variables.entities || [];
  const e = ents.find((x) => x.raw === 'srtwc286-sh-200');
  assert.ok(e, 'the token survives reconciliation');
  assert.strictEqual(e.canonical_code, 'SRTWC286-SH-200', 'an unambiguous resolution still narrows to its code');
  assert.strictEqual(e.hint, 'product', 'the resolver\'s entity_type still wins over the parser\'s guess');
});

test('a token whose matches disagree on entity_type leaves the parser\'s hint untouched', () => {
  const o = runMut((fx) => {
    setReformulatorEntities(fx, [
      { raw: 'ambiguous-token', hint: 'product', current_message: true, canonical_code: null },
    ]);
    setResolutions(fx, [{
      token: 'ambiguous-token',
      resolved: false,
      ambiguous: true,
      matches: [
        { entity_type: 'product', canonical_code: 'AMBIG-PROD-1' },
        { entity_type: 'customer', canonical_code: 'AMBIG-CUST-1' },
      ],
    }]);
  });
  const ents = o.variables.entities || [];
  const e = ents.find((x) => x.raw === 'ambiguous-token');
  assert.ok(e, 'the token survives reconciliation');
  assert.strictEqual(e.canonical_code, null, 'disagreeing matches must not be narrowed to a code either');
  assert.strictEqual(e.hint, 'product', 'the parser\'s own hint survives when the matches disagree on type');
});
