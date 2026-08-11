#!/usr/bin/env node
/* Unicode dash normalisation on entity tokens — parser sub `output_exchange`.
 *
 * DEFECT (observed live 2026-08-11, exec 12053189): a customer pasted
 *   SRT332−GM
 * where the dash is U+2212 MINUS SIGN, not U+002D HYPHEN-MINUS. Excel, Word,
 * Google Sheets and PDF copy-paste all emit U+2212 / U+2013 / U+2014 routinely.
 *
 * The parser split the tokens correctly and resolve-entity received
 * "SRT332−GM" verbatim, but the CRM has the code stored with an ASCII hyphen, so
 * the exact match missed. It degraded into a did-you-mean offering "SRT332-GM -
 * has stock details" — i.e. the right product, one tap away, for a code the
 * customer had already typed correctly apart from an invisible character.
 *
 * FIX: fold every Unicode dash variant to ASCII '-' on entity `raw` and
 * `canonical_code`, at the same late single-pass point where attachment_type is
 * mirrored into raw — after all entity mutation, before routing derivation.
 *
 * Keep normaliseDashes() below byte-identical to the deployed output_exchange copy.
 *
 * Run: node n8n-workflows-init/tests/unit/entity-dash-normalise.test.js
 */
const assert = require('assert');

// ── deployed in output_exchange (parser sub) ─────────────────────────────────
// U+2010 HYPHEN, U+2011 NON-BREAKING HYPHEN, U+2012 FIGURE DASH, U+2013 EN DASH,
// U+2014 EM DASH, U+2015 HORIZONTAL BAR, U+2212 MINUS SIGN, U+FE58 SMALL EM DASH,
// U+FE63 SMALL HYPHEN-MINUS, U+FF0D FULLWIDTH HYPHEN-MINUS.
const DASHES = /[‐-―−﹘﹣－]/g;
function normaliseDashes(entities) {
  if (!Array.isArray(entities)) return entities;
  for (const e of entities) {
    if (!e) continue;
    if (typeof e.raw === 'string') e.raw = e.raw.replace(DASHES, '-');
    if (typeof e.canonical_code === 'string') e.canonical_code = e.canonical_code.replace(DASHES, '-');
  }
  return entities;
}

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
};
const ent = (raw, extra = {}) => ({ raw, hint: 'product', canonical_code: null, ...extra });

console.log('\n== the reported defect ==');
t('U+2212 MINUS SIGN in SRT332−GM folds to an ASCII hyphen', () => {
  const es = normaliseDashes([ent('SRT332−GM')]);
  assert.strictEqual(es[0].raw, 'SRT332-GM');
  assert.strictEqual(es[0].raw.charCodeAt(6), 0x2d);
});
t('the exact four-token turn from exec 12053189 normalises to resolvable codes', () => {
  const es = normaliseDashes(
    ['SRT332−GM', 'SRT35102', 'SRTWB8013', 'SRTWB890'].map((r) => ent(r)));
  assert.deepStrictEqual(es.map((e) => e.raw),
    ['SRT332-GM', 'SRT35102', 'SRTWB8013', 'SRTWB890']);
});

console.log('\n== every dash variant a paste can produce ==');
t('all ten Unicode dash variants fold to ASCII hyphen', () => {
  const variants = ['‐', '‑', '‒', '–', '—', '―',
                    '−', '﹘', '﹣', '－'];
  for (const d of variants) {
    const es = normaliseDashes([ent(`SRT332${d}GM`)]);
    assert.strictEqual(es[0].raw, 'SRT332-GM', `U+${d.charCodeAt(0).toString(16)} not folded`);
  }
});
t('several dashes in one token all fold', () => {
  assert.strictEqual(normaliseDashes([ent('A—B–C−D')])[0].raw, 'A-B-C-D');
});
t('canonical_code is normalised too (resolver reads either)', () => {
  const es = normaliseDashes([ent('whatever', { canonical_code: 'SRT332−GM' })]);
  assert.strictEqual(es[0].canonical_code, 'SRT332-GM');
});

console.log('\n== must not damage anything else ==');
t('an already-ASCII code is returned byte-identical', () => {
  assert.strictEqual(normaliseDashes([ent('SRT332-GM')])[0].raw, 'SRT332-GM');
});
t('a code with no dash at all is untouched', () => {
  assert.strictEqual(normaliseDashes([ent('SRTWB8013')])[0].raw, 'SRTWB8013');
});
t('underscores and slashes are NOT touched', () => {
  assert.strictEqual(normaliseDashes([ent('SRT_332/GM')])[0].raw, 'SRT_332/GM');
});
t('non-dash punctuation and CJK survive', () => {
  const s = 'Ünïcødé 商品 (2026) 50% ‘quoted’';
  assert.strictEqual(normaliseDashes([ent(s)])[0].raw, s);
});
t('a customer name keeps its spacing, only the dash folds', () => {
  const es = normaliseDashes([ent('ABC — XYZ Sdn Bhd', { hint: 'customer' })]);
  assert.strictEqual(es[0].raw, 'ABC - XYZ Sdn Bhd');
});
t('normalisation applies regardless of hint', () => {
  for (const hint of ['product', 'customer', 'promotion', 'order', 'attachment_type']) {
    assert.strictEqual(normaliseDashes([ent('A−B', { hint })])[0].raw, 'A-B');
  }
});

console.log('\n== defensive shapes (a throw here kills the turn) ==');
t('null / non-array input is returned unchanged, never throws', () => {
  assert.strictEqual(normaliseDashes(null), null);
  assert.strictEqual(normaliseDashes(undefined), undefined);
  assert.deepStrictEqual(normaliseDashes([]), []);
});
t('null members and non-string raw are skipped, never throw', () => {
  const es = normaliseDashes([null, { raw: 123 }, { hint: 'product' }, ent('A−B')]);
  assert.strictEqual(es[1].raw, 123);
  assert.strictEqual(es[3].raw, 'A-B');
});
t('other entity fields are preserved exactly', () => {
  const es = normaliseDashes([ent('A−B', { current_message: true, confident: true, dym_slot: 2 })]);
  assert.strictEqual(es[0].hint, 'product');
  assert.strictEqual(es[0].current_message, true);
  assert.strictEqual(es[0].confident, true);
  assert.strictEqual(es[0].dym_slot, 2);
});
t('the regex is not stateful across calls (no lastIndex bug from /g)', () => {
  // A /g regex reused with .test() would alternate; .replace() resets, but pin it:
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(normaliseDashes([ent('A−B')])[0].raw, 'A-B', `call ${i + 1}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
