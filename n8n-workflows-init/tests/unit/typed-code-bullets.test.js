// ── typed-code-bullets.test.js - never hide a code the customer typed ─────────────────────────
//
// Its own file rather than another block in e-filter-disclosure.test.js: that suite is about the
// search-scope HEADER (Customer / Product / Dates, rendered from the gate scope), this one is
// about the found-BULLETS underneath it ("• product: ..."). Two different renderings, two
// different rules, and the last case here exists to prove they stay independent.
//
// captain, 2026-08-24: "Incoming SRT 2405-CR, srt2405-GY" - two product codes, both typed out in
// full - answered with "• product: SRT2405-GY (+1 more)", and the same reply then printed stock
// detail for SRT2405-CR, the very code the bullet had just hidden. "we tend to truncate the
// product or customer, but the user actually genuinely asked for it".
//
// The rule (the same one behind commits 8395dcd and 3949d8a): distinguish what the CUSTOMER TYPED
// from what the RESOLVER EXPANDED TO. We may summarize our own expansions; we may not hide
// something the customer asked for by name. So the cap stays for "srtwc286" -> ten sibling codes,
// and goes away for two codes the customer wrote out.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const NODE = 'not-found-error-message';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const runFx = (fx) => {
  const body = loadNodes(SLUG, [`${NODE}.js`])[`${NODE}.js`];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: NODE });
  return Array.isArray(out) ? out[0].json : out;
};
const bullet = (msg, type) => (String(msg).match(new RegExp(`^• ${type}: .*$`, 'm')) || [''])[0];

// A resolver product match, shaped exactly like the ones in obj1-not-found-error-message.json
// (display.product_name mirrors the code, which is why the bullet prints the code at all).
const P = (code, uuid) => ({
  entity_type: 'product', canonical_code: code, uuid,
  match_field: 'product_code', match_tier: 'exact', similarity: null,
  company_id: '00000000-0000-0000-0000-000000000001', company_name: 'Sorento',
  display: { product_name: code, is_active: true },
});

// Rebuild the miss lane around a given set of typed tokens -> matches. `compat` is passed
// separately and DELIBERATELY out of resolution order: gate.compatible_entities order is arbitrary
// (the body says so at the #12 reorder), and that is precisely how SRT2405-GY ended up
// representing a turn whose first typed code was SRT2405-CR.
const missWith = ({ resolutions, compat, entities, domain = 'incoming' }) => {
  const fx = load('obj1-not-found-error-message.json');
  for (const item of fx.ctx['disallowed-entity-gate'] || []) {
    item.json.compatible_entities = compat;
  }
  for (const item of fx.ctx['resolve-entity'] || []) {
    item.json.tokens = resolutions.map(r => r.token);
    item.json.unresolved_tokens = [];
    item.json.resolutions = resolutions;
  }
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) {
    item.json.output.domain_hint = domain;
    item.json.output.entities = entities;
  }
  return fx;
};

// ── the captain's turn ────────────────────────────────────────────────────────────────────────
const captainTurn = () => missWith({
  resolutions: [
    // resolve-entity strips dashes/spaces off a product token before matching, so "SRT 2405-CR"
    // arrives here as "srt2405cr" - the reason a naive token==label compare misses it.
    { token: 'srt2405cr', resolved: true, ambiguous: false, matches: [P('SRT2405-CR', 'prod-2405-cr')] },
    { token: 'srt2405gy', resolved: true, ambiguous: false, matches: [P('SRT2405-GY', 'prod-2405-gy')] },
  ],
  compat: [
    { uuid: 'prod-2405-gy', entity_type: 'product', code: 'SRT2405-GY' },
    { uuid: 'prod-2405-cr', entity_type: 'product', code: 'SRT2405-CR' },
  ],
  entities: [
    { raw: 'SRT 2405-CR', hint: 'product', canonical_code: null, current_message: true, confident: true },
    { raw: 'srt2405-GY', hint: 'product', canonical_code: null, current_message: true, confident: true },
  ],
});

test('captain 2026-08-24: two codes typed in one message are both named, neither hidden behind "(+1 more)"', () => {
  const msg = String(runFx(captainTurn()).escalate_message || '');
  assert.strictEqual(bullet(msg, 'product'), '• product: SRT2405-CR, SRT2405-GY',
    `both typed codes must be named, in the order the customer typed them: ${JSON.stringify(msg)}`);
  assert.doesNotMatch(msg, /\(\+1 more\)/,
    'nothing was expanded by us - there is no surplus to count, only two codes the customer wrote out');
});

// ── the shape the cap exists for ──────────────────────────────────────────────────────────────
// exec 13629634, "mastiles klang srtwc286". ONE typed token, which the resolver expanded into ten
// sibling product codes. None of them is the token, so none of them is "what the customer asked
// for by name" - the line stays a summary. This is the case review 2 added the cap for on
// 2026-08-17 and it must come out byte for byte the same.
test('one typed token the resolver expanded into ten codes still reads as a summary', () => {
  const msg = String(runFx(load('obj1-not-found-error-message.json')).escalate_message || '');
  assert.strictEqual(bullet(msg, 'product'), '• product: SRTWC286-SH-200 (+9 more)',
    `"srtwc286" is a fragment we grew into ten codes - representative + count, unchanged: ${JSON.stringify(msg)}`);
});

// ── mixed: one typed code, plus a typed code that ALSO fans out ───────────────────────────────
// "srt2405-cr srtwc286-sh": the second token matches SRTWC286-SH exactly and drags two siblings
// in behind it. Both typed codes are named; only the two the resolver added are counted.
test('a turn that mixes typed codes with a resolver expansion names the typed ones and counts only the surplus', () => {
  const fx = missWith({
    resolutions: [
      { token: 'srt2405cr', resolved: true, ambiguous: false, matches: [P('SRT2405-CR', 'prod-2405-cr')] },
      {
        token: 'srtwc286sh', resolved: false, ambiguous: true,
        matches: [
          P('SRTWC286-SH-200', 'prod-sh-200'),
          P('SRTWC286-SH', 'prod-sh'),
          P('SRTWC286-SH-P', 'prod-sh-p'),
        ],
      },
    ],
    compat: [
      { uuid: 'prod-sh-200', entity_type: 'product', code: 'SRTWC286-SH-200' },
      { uuid: 'prod-sh-p', entity_type: 'product', code: 'SRTWC286-SH-P' },
      { uuid: 'prod-2405-cr', entity_type: 'product', code: 'SRT2405-CR' },
      { uuid: 'prod-sh', entity_type: 'product', code: 'SRTWC286-SH' },
    ],
    entities: [
      { raw: 'SRT2405-CR', hint: 'product', canonical_code: null, current_message: true, confident: true },
      { raw: 'SRTWC286-SH', hint: 'product', canonical_code: null, current_message: true, confident: true },
    ],
  });
  const msg = String(runFx(fx).escalate_message || '');
  assert.strictEqual(bullet(msg, 'product'), '• product: SRT2405-CR, SRTWC286-SH (+2 more)',
    `both typed codes named, the two siblings the resolver added counted: ${JSON.stringify(msg)}`);
});

// ── one typed code that covers several accounts is STILL an expansion ─────────────────────────
// Measured on the display fixture: the customer typed customer code "300-D059" and the CRM holds
// three separate debtor accounts under it (SETAPAK / ACC 2 / DENHO HARDWARE). The token names
// three distinct things, so it is the resolver widening, not the customer listing - naming all
// three is the wall of labels the cap exists to prevent. Byte-identical to before this change.
test('one typed code that resolves to three separate accounts keeps the cap', () => {
  const msg = String(runFx(load('display--not-found-error-message.json')).escalate_message || '');
  assert.strictEqual(bullet(msg, 'customer'),
    '• customer: DELUXE HOME CENTRE SDN BHD (SETAPAK) (Mocha) (+2 more)',
    `one token landing on three accounts stays a summary: ${JSON.stringify(msg)}`);
});

// ── multi-company grouping is untouched ───────────────────────────────────────────────────────
// The same code in two companies is ONE distinct code (`_bareLabel` strips the qualifier), and its
// group renders in full because naming the company variants is the entire point of qualifying
// them. That is true whether or not the customer typed the code - assert it on the turn where they
// did, which is the one this change could have moved.
test('multi-company: one code in two companies still renders both variants and counts no surplus', () => {
  const M = (co, uuid) => ({
    entity_type: 'product', canonical_code: 'MWC-SC08B', uuid,
    match_field: 'product_code', match_tier: 'exact', company_name: co,
    display: { product_name: 'MWC-SC08B' },
  });
  const fx = missWith({
    resolutions: [{ token: 'mwcsc08b', resolved: true, ambiguous: false, matches: [M('Sorento', 'u-sor'), M('Mocha', 'u-moc')] }],
    compat: [
      { uuid: 'u-sor', entity_type: 'product', code: 'MWC-SC08B' },
      { uuid: 'u-moc', entity_type: 'product', code: 'MWC-SC08B' },
    ],
    entities: [{ raw: 'MWC-SC08B', hint: 'product', canonical_code: null, current_message: true, confident: true }],
  });
  const msg = String(runFx(fx).escalate_message || '');
  assert.strictEqual(bullet(msg, 'product'), '• product: MWC-SC08B (Sorento), MWC-SC08B (Mocha)',
    `the company variants of ONE code are one group, rendered whole: ${JSON.stringify(msg)}`);
  assert.doesNotMatch(msg, /more\)/, 'there is no second distinct code, so there is nothing to count');
});

// ── the fallback shape ────────────────────────────────────────────────────────────────────────
// Not every resolver mode returns `resolutions`; the AND-mode one returns `by_entity_type` /
// `intersection` and nothing that maps a token to what it matched. There is then no way to tell a
// typed code from an expanded one, and guessing would risk a wall of codes - so the line must come
// out exactly as it does today. Frozen against the string the pre-fix body produced.
test('a resolver payload without `resolutions` falls back to today\'s output, byte for byte', () => {
  const fx = load('obj1-not-found-error-message.json');
  const byType = {};
  for (const item of fx.ctx['resolve-entity'] || []) {
    byType.product = (item.json.resolutions.find(x => x.token === 'srtwc286') || {}).matches || [];
    delete item.json.resolutions;              // the AND-mode shape: no token -> match map at all
    item.json.by_entity_type = byType;
    item.json.unresolved_tokens = ['mastiles klang'];
  }
  const msg = String(runFx(fx).escalate_message || '');
  assert.strictEqual(bullet(msg, 'product'), '• product: SRTWC286-SH-200 (+9 more)',
    `no resolutions means no way to tell typed from expanded - keep the cap: ${JSON.stringify(msg)}`);
  // Frozen whole, header included: without `resolutions` the header's `_axisWords` also loses its
  // "the customer's own token" source and falls through to the gate's own labels, so this string
  // is the fallback shape's complete output - captured from the pre-fix body.
  assert.strictEqual(msg,
    'Customer: all customers\n' +
    'Product: SRTWC286-SH-200, SRTWC286-SH-P, SRTWC286-SH-PP, SRTWC286-SH, SRTWC286-SH-UF, ' +
      'SRTWC286-SH-NEW-150, SRTWC286-SH-150, SRTWC286-SH-NEW-P, SRTWC286-SH-NEW-200, SRTWC286-SH-NEW\n' +
    'Dates: all dates\n' +
    '\n' +
    'Here\'s what you want:\n' +
    '• product: SRTWC286-SH-200 (+9 more)\n' +
    '\n' +
    'Couldn\'t find: "mastiles klang" (customer).\n' +
    '\n' +
    'But no order matched these. Would you like me to escalate to customer_service team?',
    'the whole miss, not just the bullet, must be what the fallback shape produced before this change');
});

// ── the two renderings stay independent ───────────────────────────────────────────────────────
// The header added in 9140897 renders from the GATE SCOPE (compatible_entities) and names the
// customer's own token; the bullets render from the resolved codes. A change to one must not move
// the other, so assert both on the same turn.
test('the search-scope header still renders from the gate scope, not from the bullets', () => {
  const fx = missWith({
    resolutions: [
      { token: 'srt2405cr', resolved: true, ambiguous: false, matches: [P('SRT2405-CR', 'prod-2405-cr')] },
      { token: 'srt2405gy', resolved: true, ambiguous: false, matches: [P('SRT2405-GY', 'prod-2405-gy')] },
    ],
    compat: [
      { uuid: 'prod-2405-gy', entity_type: 'product', code: 'SRT2405-GY' },
      { uuid: 'prod-2405-cr', entity_type: 'product', code: 'SRT2405-CR' },
    ],
    entities: [
      { raw: 'SRT 2405-CR', hint: 'product', canonical_code: null, current_message: true, confident: true },
      { raw: 'srt2405-GY', hint: 'product', canonical_code: null, current_message: true, confident: true },
    ],
    domain: 'order',                            // the header is a delivery-order disclosure only
  });
  const msg = String(runFx(fx).escalate_message || '');
  assert.match(msg, /^Product: srt2405cr, srt2405gy$/m,
    `the header names the customer's typed tokens, unchanged by the bullet rule: ${JSON.stringify(msg)}`);
  assert.match(msg, /^Customer: all customers$/m, 'the open axis is still disclosed');
  assert.strictEqual(bullet(msg, 'product'), '• product: SRT2405-CR, SRT2405-GY',
    'and the bullets underneath it still name both typed codes');
});
