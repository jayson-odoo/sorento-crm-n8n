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
//
// TWO BODIES, TWO FIXTURES (2026-08-24 port to the live parser XTODTw-dJcV0uRdC056hG). The block
// is the same on both slugs; the route that leaves the dead spelling alive is not. On the FORK a
// pick that DOES find its source token still gets it re-attached afterwards by block (C) ("a
// customer pick narrows WHO, not WHAT"), which live does not have - and live's coarser order-domain
// axis map (product and customer both on order_scope) makes the entity-op executor evict it anyway.
// Replaying the fork's own execution against the live body is therefore green for the wrong reason.
// The live fixture uses the route live CAN reach: applyDymPick's PREPEND arm, where the pick cannot
// identify its source token (dym_replace_unmatched) and the superseded spelling survives beside it.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase, raws } = require('./_parser-case');

test('A4 (fork): accepting a did-you-mean retires the spelling it corrected', () => {
  const o = parserCase('sub-semantic-parser-FORK', 'a4-dym-accept-retires-typo');
  const r = raws(o);

  assert.ok(r.includes('weserp10b'), 'the corrected code must be the live filter');
  assert.ok(
    !r.includes('wesrp10b'),
    `the superseded spelling must be gone, got ${JSON.stringify(o.entities)}`,
  );
  assert.ok(r.some((x) => x.includes('deluxe')), 'the pinned customer is untouched by a correction');
});

test('A4 (live): the superseded spelling is retired on the prepend route too', () => {
  const o = parserCase('sub-semantic-parser', 'a4-dym-accept-retires-the-spelling-it-corrected');
  const r = raws(o);

  assert.ok(r.includes('weserp10b'), 'the corrected code must be the live filter');
  assert.ok(
    !r.includes('wesrp-10b'),
    'the superseded spelling must be gone even though the offer recorded it with a space and ' +
    `state holds it with a hyphen - the comparison is alphanumeric. Got ${JSON.stringify(o.entities)}`,
  );
  assert.strictEqual(o.dym_superseded_dropped, 1, 'exactly one entity retired');
  assert.ok(r.includes('abc-1'), 'a product no candidate corrects is untouched');
});
