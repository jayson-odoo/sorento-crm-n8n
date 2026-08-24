// ── a4-dym-accept.test.js — accepting a correction must retire the token it corrected ─────────
//
// Case A4 of the filter-dimensions plan. Exec 13688567 / fork 13688574: the bot offered
// "Couldn't find WESRP10B. Did you mean WESERP10B?", the customer replied with the exact code
// suggested, and got the identical question back. Forever. There is no phrasing that escapes it,
// because the parser re-emits the superseded spelling as a current-message entity, so it stays a
// live filter and keeps failing to resolve.
//
// The signal already exists and no words are matched to get it (captain's rule, 2026-08-24):
//   - the model emits dym_pick_applied: true  — "this turn accepts a correction"
//   - the session's dym_offer records, per candidate, the token it corrects:
//       { code: 'WESERP10B', for_raw: 'WESRP10B', for_hint: 'product' }
// so code compares a code the customer named against a code the resolver returned - mechanical,
// not an interpretation of their sentence.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode, loadFixtures } = require('../harness/n8n-shim');

const SLUG = 'sub-semantic-parser-FORK';
const NODE = 'output_exchange';

const runCase = (name) => {
  const body = loadNodes(SLUG, ['output_exchange.js'])['output_exchange.js'];
  const entry = loadFixtures(SLUG, NODE).find(f => f.name.includes(name));
  assert.ok(entry, `fixture ${name} must exist`);
  return runNode({ body, fixture: entry.fixture, slug: SLUG, nodeName: NODE })[0].json.output;
};

test('A4: accepting a did-you-mean retires the spelling it corrected', () => {
  const o = runCase('a4-dym-accept-retires-typo');
  const raws = (o.entities || []).map(e => String(e.raw || '').toLowerCase());

  assert.ok(raws.includes('weserp10b'), 'the corrected code must be the live filter');
  assert.ok(
    !raws.includes('wesrp10b'),
    `the superseded spelling must be gone, got ${JSON.stringify(o.entities)}`,
  );
  assert.ok(raws.some(r => r.includes('deluxe')), 'the pinned customer is untouched by a correction');
});
