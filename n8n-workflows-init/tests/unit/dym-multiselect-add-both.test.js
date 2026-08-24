// ── dym-multiselect-add-both.test.js — P3: two picks off one offer means two answers ──────────
//
// The customer picks 1 AND 2 off a did-you-mean list. Both rows are alternatives for the SAME
// missed token, so pick 1 replaces that token and pick 2's for_raw lookup then finds nothing -
// and used to fall through to applyDymPick's for_hint tier, which found EXACTLY ONE product
// entity, namely pick 1's own freshly written one, and overwrote it. Measured on fork exec
// 13203346: merging both MASTILE KLANG accounts returned only the last one.
//
// The fix records rather than infers: _ceDymPickedKeys already holds every code applyDymPick
// minted THIS TURN, and an entity minted by a pick this turn is not a source token.
//
// The sibling case (dym-multiselect-adds-both-when-hint-is-ambiguous) is the measured SIDE
// EFFECT and is asserted here too, deliberately: excluding this-turn picks narrows the
// ambiguity set, which re-enables a for_hint guess the ambiguity used to block, and an
// unrelated pinned product is replaced. That is the fork's own behaviour, ported as reviewed;
// the assertion exists so the next person to touch the for_hint tier sees it immediately.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase, raws } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';

test('P3: a second pick off the same offer is ADDED, not substituted for the first', () => {
  const o = parserCase(SLUG, 'dym-multiselect-adds-both-when-the-source-token-was-consumed');
  const r = raws(o);

  assert.ok(r.includes('a-1'), `the first pick must survive the second, got ${JSON.stringify(o.entities)}`);
  assert.ok(r.includes('a-2'), `the second pick must be present, got ${JSON.stringify(o.entities)}`);
  assert.strictEqual(o.dym_replace_unmatched, true,
    'pick 2 finds no source token of its own, so it appends - that IS the ADD-BOTH path');
});

test('P3 side effect: with an unrelated same-hint product pinned, the for_hint guess re-fires', () => {
  const o = parserCase(SLUG, 'dym-multiselect-adds-both-when-hint-is-ambiguous');
  const r = raws(o);

  assert.ok(r.includes('a-1') && r.includes('a-2'), 'both picks still survive each other');
  assert.ok(
    !r.includes('zz-9'),
    'MEASURED, NOT DESIRED: the unrelated pinned product is replaced by pick 2, because excluding ' +
    'the this-turn pick leaves exactly one product for the for_hint tier to guess at. If a later ' +
    'change skips that tier outright when _useSlot === false, this assertion is the one to invert ' +
    `- ZZ-9 should survive. Got ${JSON.stringify(o.entities)}`,
  );
});
