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
// THE SIDE EFFECT THAT WAS, AND IS NOT ANY MORE (2026-08-24). Excluding this-turn picks NARROWED
// the ambiguity set, which re-enabled a for_hint guess the ambiguity used to block: with an
// unrelated product pinned beside the missed token, pick 2 took that tier and REPLACED it. Three
// bodies, one fixture, measured before the fix: live at 50dda0b~1 gave [A-2, A-1, ZZ-9] (correct -
// live never had it), the fork gave [A-1, A-2], and live at 50dda0b, which ported P3, gave
// [A-1, A-2]. The remedy the fixtures themselves named: skip the for_hint tier outright when
// _useSlot === false, since a hint is a TYPE and not an identity, so on a path whose contract is
// ADD-BOTH a pick that for_raw and for_canonical cannot place must append rather than guess.
//
// The ambiguous case runs against BOTH slugs. The fork is what the harness is driven against every
// day, so a defect that lives only there quietly shapes what we believe the bot does; and a fix
// that is green on the fork while inert on live is exactly what running one assertion over two
// bodies catches.
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

for (const slug of ['sub-semantic-parser', 'sub-semantic-parser-FORK']) {
  test(`a second pick adds and leaves an unrelated pinned entity alone (${slug})`, () => {
    const o = parserCase(slug, 'dym-multiselect-adds-both-when-hint-is-ambiguous');
    const r = raws(o);

    assert.ok(r.includes('a-1') && r.includes('a-2'),
      `both picks must survive each other, got ${JSON.stringify(o.entities)}`);
    assert.ok(
      r.includes('zz-9'),
      'the customer pinned ZZ-9 on an earlier turn and said nothing about it this turn, so it must ' +
      'still be a filter. Pick 2 cannot tie itself to a source token, and a for_hint match is a TYPE ' +
      'match, not an identity - taking it here drops one of the two things the customer asked for ' +
      `and silently loses their older one. Got ${JSON.stringify(o.entities)}`,
    );
    assert.strictEqual(o.dym_replace_unmatched, true,
      'pick 2 appends because it has no source token of its own - that is the ADD-BOTH path, and it ' +
      'is the only route by which all three entities can stand together');
  });
}
