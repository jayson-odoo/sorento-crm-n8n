// ── _parser-case.js — run ONE output_exchange fixture through a sha-verified parser body ──────
//
// Shared by the four suites that guard the blocks ported from the parser fork into the LIVE
// parser (XTODTw-dJcV0uRdC056hG) on 2026-08-24. Bodies come from tests/offline/node-source.js
// only - the copy-paste style of the older tests/unit/*.test.js files is banned for new tests
// (LESSONS §76), because a hand-held copy of a node body drifts and then asserts about nothing.
//
// `slug` is a parameter rather than a constant because P22's suite runs the SAME assertion
// against both the fork body it was developed on and the live body it was ported into: a block
// that is green on the fork and silently inert on live is exactly the failure this catches.
'use strict';
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode, loadFixtures } = require('../harness/n8n-shim');

const NODE = 'output_exchange';

function parserCase(slug, fixtureName) {
  const body = loadNodes(slug, ['output_exchange.js'])['output_exchange.js'];
  const entry = loadFixtures(slug, NODE).find((f) => f.name === fixtureName);
  assert.ok(entry, `fixture ${slug}/${NODE}/${fixtureName} must exist`);
  const out = runNode({ body, fixture: entry.fixture, slug, nodeName: NODE })[0].json.output;
  // LESSONS §77(1): the body runs in its OWN vm realm, so an array it builds is not `instanceof`
  // this realm's Array and deepStrictEqual against a plain `[...]` here fails on contents that
  // match. Round-trip through JSON so callers can assert normally.
  return JSON.parse(JSON.stringify(out));
}

const raws = (o) => (Array.isArray(o.entities) ? o.entities : []).map((e) => String((e && e.raw) || '').toLowerCase());

module.exports = { parserCase, raws, NODE };
