// ── carried-vs-renamed.test.js — P2: naming an entity counts however you spell it ─────────────
//
// `_ceKey` collapses an entity to `canonical_code || raw`, so ONE entity keys two different ways
// depending on whether it has been resolved yet. Prior state holds the picked customer as
// `customer|dbr-59e57de1b7`; the LLM, when the customer re-types it, emits
// `customer|yoo living house [a/c iii] - pricetag`. The two sets never intersect, so the
// provenance test reads "prior state has it, this turn did not name it" - carried - about an
// entity the customer just typed out (fork exec 13246777 -> spine exec 13246769).
//
// `_ceKeysOf` compares on BOTH forms. `_ceKey` itself is untouched: the pick-provenance sets
// (_ceDymPickedKeys / _ceRefPickedKeys) still key on it.
//
// What a customer sees here: they re-name the product, so the certificate number pinned to the
// OLD lookup stops silently narrowing the answer. Before, that certificate stayed a live filter
// and an empty product ∧ certificate intersection reads back as a confident "no certificate".
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase, raws } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';

test('P2: an entity the LLM re-names by raw text is NOT carried', () => {
  const o = parserCase(SLUG, 'reconciliation-renamed-entity-is-not-carried');

  assert.deepStrictEqual(
    o.carried_attachment_evicted,
    ['certificate:CERT-9'],
    'the re-named product must count as a product-scope contribution, which retires the ' +
    `certificate bound to the old lookup - got ${JSON.stringify(o.carried_attachment_evicted)}`,
  );
  assert.ok(
    !raws(o).includes('cert-9'),
    `the stale certificate must be gone, got ${JSON.stringify(o.entities)}`,
  );
  assert.ok(
    raws(o).includes('yoo wide panel 2400'),
    'the product the customer named is still the scope',
  );
});
