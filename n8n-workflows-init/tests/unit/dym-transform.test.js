// ── dym-transform.test.js — hand-written edge cases, same shim as _all-nodes.test.js ──────────
//
// Ports the essentials of tests/offline/promo-dym-probe/ (D18: promotion did-you-mean, "has/no
// promotion" probe planning) as real `node --test` cases against the CURRENT exported body
// (export/live-spine-sorento-consume-main/nodes/dym-transform.js, sha-verified via node-source.js)
// -- confirmed stale vs the local offline copy while building this (different sha256).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const NODE_FILE = 'dym-transform.js';
const NODE_NAME = 'dym-transform';   // C1: the shim resolves this node's deployed mode by name
const src = loadNodes(SLUG, [NODE_FILE]);
const BODY = src[NODE_FILE];

const NOT_FOUND = { escalate_message: 'Could not find promotion. Would you like me to escalate?', is_clarification: false, found_summary: '' };

function run({ notFound = NOT_FOUND, parserOutput, resolutions, gate } = {}) {
  const fixture = {
    ctx: {
      "Call 'sub-query-reformulator'": [{ json: { output: parserOutput } }],
      'resolve-entity': [{ json: { resolutions } }],
      'disallowed-entity-gate': [{ json: gate }],
    },
    input: [{ json: notFound }],
  };
  // JSON round-trip: vm-context objects/arrays aren't assert.deepStrictEqual-comparable against
  // this file's own-realm literals (see the identical note in promo-picker.test.js).
  return JSON.parse(JSON.stringify(normalizeReturn(runNode({ body: BODY, fixture, slug: SLUG, nodeName: NODE_NAME }))[0].json));
}

test('dym-transform: never throws on a completely empty context (every $() read is wrapped)', () => {
  // The body wraps every $('x') read in try/catch, so it must survive even a maximally sparse
  // fixture -- exercising the shim's "unknown ctx name throws" behaviour, caught by the body.
  const fixture = {
    ctx: {
      "Call 'sub-query-reformulator'": [],
      'resolve-entity': [],
      'disallowed-entity-gate': [],
    },
    input: [{ json: {} }],
  };
  const out = normalizeReturn(runNode({ body: BODY, fixture, slug: SLUG, nodeName: NODE_NAME }));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].json.probe_needed, false);
});

test('dym-transform: exact-tier matches are excluded from D1 candidates (they are already resolved)', () => {
  const o = run({
    parserOutput: { domain_hint: 'promotion', entities: [{ raw: 'SRTWC286-SH', hint: 'promotion' }], routing: { suggested_team: 'customer_service' } },
    resolutions: [{
      token: 'srtwc286-sh',
      resolved: false,
      matches: [{ canonical_code: 'SRTWC286-SH', uuid: '1439736c-20ca-4bba-b387-b242ff4a4501', entity_type: 'promotion', match_tier: 'exact', display: {} }],
    }],
    gate: { gate_debug: { domain: 'promotion', allowed_lookup: null }, compatible_entities: [], require_specific: false },
  });
  assert.strictEqual(o.probe_needed, false);
  assert.strictEqual(o.probe_skip_reason, 'no_d1_candidates');
});

test('dym-transform: F-DUPE — a code behind >1 uuid (cross-company twin) is excluded, not unioned', () => {
  const o = run({
    parserOutput: { domain_hint: 'promotion', entities: [{ raw: 'SRTWC286', hint: 'promotion' }], routing: { suggested_team: 'customer_service' } },
    resolutions: [{
      token: 'srtwc286',
      resolved: false,
      matches: [
        { canonical_code: 'SRTWC286-SH', uuid: '1439736c-20ca-4bba-b387-b242ff4a4501', entity_type: 'promotion', match_tier: 'fuzzy', display: {} },
        { canonical_code: 'SRTWC286-SH', uuid: '1439736c-20ca-4bba-b387-b242ff4a4599', entity_type: 'promotion', match_tier: 'fuzzy', display: {} },
      ],
    }],
    gate: { gate_debug: { domain: 'promotion', allowed_lookup: null }, compatible_entities: [], require_specific: false },
  });
  assert.strictEqual(o.probe_needed, false, 'the only candidate was excluded as a multi-uuid code');
  assert.strictEqual(o.probe_skip_reason, 'multi_uuid_code');
  assert.strictEqual(o.dym_excluded_codes.length, 1);
  assert.strictEqual(o.dym_excluded_codes[0].reason, 'multi_uuid_code');
});

test('dym-transform: is_clarification suppresses the D1 lane entirely', () => {
  const o = run({
    notFound: { ...NOT_FOUND, is_clarification: true },
    parserOutput: { domain_hint: 'promotion', entities: [{ raw: 'SRTWC286', hint: 'promotion' }], routing: { suggested_team: 'customer_service' } },
    resolutions: [{
      token: 'srtwc286',
      resolved: false,
      matches: [{ canonical_code: 'SRTWC286-SH', uuid: '1439736c-20ca-4bba-b387-b242ff4a4501', entity_type: 'promotion', match_tier: 'fuzzy', display: {} }],
    }],
    gate: { gate_debug: { domain: 'promotion', allowed_lookup: null }, compatible_entities: [], require_specific: false },
  });
  assert.strictEqual(o.probe_needed, false);
});

test('dym-transform: passthrough is load-bearing — every key from the not-found payload survives', () => {
  const o = run({
    parserOutput: { domain_hint: 'order', entities: [], routing: { suggested_team: 'customer_service' } },
    resolutions: [{ token: 'x', resolved: false, matches: [] }],
    gate: { gate_debug: { domain: 'order', allowed_lookup: null }, compatible_entities: [], require_specific: false },
  });
  assert.strictEqual(o.escalate_message, NOT_FOUND.escalate_message);
  assert.strictEqual(o.is_clarification, NOT_FOUND.is_clarification);
  assert.strictEqual(o._dym_probe_input, true, 'the sentinel dym-annotate keys on must be present');
});
