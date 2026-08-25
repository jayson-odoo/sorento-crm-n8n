// ── llm-broaden-fallback.test.js — the LLM-emitted broaden_axis consumers on the LIVE parser ──
//
// 2026-08-25, captain-ordered prompt promote: the fork's 602-line systemMessage shipped to the
// live parser byte-exact, so the live LLM now emits `broaden_axis` (bucket d3 of
// plans/company-pick-parser.md §3). The consumers ported WITH it, from the fork export
// (output_exchange @ 5fad97d130690de6):
//
//   1. the AXIS BROADEN restore (pre-executor): any broaden_axis + a prior domain re-pins
//      domain_hint/intent_hint — naming a KIND of thing is not a domain switch — and rescues the
//      exec-13728314 misread ('all' + entity_op clear + a non-broaden scope_intent).
//   2. the reuse arm's broaden_axis === 'date' force-open: an explicit ask to drop the window
//      must not have the date carry silently restore it.
//   3. the isBroaden narrowing: scope_intent 'broaden' with a SPECIFIC broaden_axis is a
//      single-axis widen, not an entity broaden — DOMAIN_BROADEN_BLOCKED_HINTS must not strip
//      the scope the user is still asking about.
//   4. the final-pass axis drop (immediately before the return, after every later writer):
//      REBASED FOR LIVE to hint-equality — live's axis maps still lump customer/product/order
//      into one order_scope, so the fork's axis-equality drop would take the customer out with
//      the product, the exact defect the restore exists to prevent. See the block's own comment.
//
// PRECEDENCE (documented in the DATE-WIDEN header in output_exchange.js): the deterministic
// phrase-match arm (_dateWiden, shipped 1f79077) decides first; the LLM broaden_axis field is
// the fallback for phrasings the detector cannot see. The last test here pins the both-fire turn.
//
// tests/unit/_all-nodes.test.js deep-equals every fixture already; this file re-asserts the
// LOAD-BEARING decision fields by name so a fixture re-pin cannot silently flip the contract
// (the fixture-vs-property split of company-pick-deterministic.test.js). The four llm-broaden-*
// fixtures and the both-fire fixture were proven RED against the pre-promote body (git HEAD
// 1f79077) on 2026-08-25; the three passthrough pins are invariants, labelled so in their own
// fixtures (LESSONS §66).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';
const cse = (name) => parserCase(SLUG, name);
const hints = (o) => (Array.isArray(o.entities) ? o.entities : []).map((e) => String((e && e.hint) || '').toLowerCase());

// ── consumer 1 + 4: restore the domain, drop exactly the widened kind ─────────────────────────
test('"all products" during an order enquiry keeps the domain and the customer, drops the product', () => {
  const o = cse('llm-broaden-product-keeps-customer');
  assert.equal(o.domain_hint, 'order', 'naming a KIND of thing is not a domain switch');
  assert.equal(o.intent_hint, 'check_order');
  assert.equal(o.broaden_axis_domain_restored, true);
  assert.equal(o.entity_op_applied, 'reuse');
  assert.equal(o.broaden_axis_dropped, 1, 'the final-pass drop must remove exactly the product');
  assert.ok(!hints(o).includes('product'), 'the widened product filter must be gone');
  assert.ok(hints(o).includes('customer'),
    'the customer must survive — the hint-equality rebase exists because live\'s order_scope ' +
    'lumps customer with product; an axis-equality drop here would wipe both (exec 13728314)');
  assert.equal(o.date_filter_start, '2026-08-24',
    'a product widen names no date axis — the carried window must stand');
});

test('the exec-13728314 misread ("all" + clear + string-"null" scope_intent) is rescued', () => {
  const o = cse('llm-broaden-all-clear-rescued');
  assert.equal(o.domain_hint, 'order');
  assert.equal(o.broaden_axis_clear_rescued, true, 'entity_op clear must be rescued to reuse');
  assert.equal(o.entity_op_applied, 'reuse');
  assert.equal(o.broaden_axis, 'product',
    'the wandered domain (master_products) names the axis actually meant — DOMAIN_SUBJECT_HINT resolves it');
  assert.equal(o.broaden_axis_resolved_from_domain, 'master_products');
  assert.equal(o.broaden_axis_dropped, 1);
  assert.ok(hints(o).includes('customer'), 'the rescue exists so the customer is NOT wiped');
});

// ── consumer 2: the date arm the deterministic detector cannot reach ──────────────────────────
test('"not just august": the LLM broaden_axis "date" fallback forces the window open', () => {
  const o = cse('llm-broaden-date-fallback-not-just-august');
  assert.ok(!('date_widen_applied' in o),
    'the phrase is deliberately outside _DW_PHRASES — if the deterministic arm fired, this ' +
    'fixture no longer proves the LLM fallback and must be re-cut');
  assert.equal(o.date_filter_start, null, 'the carried window must NOT be restored');
  assert.equal(o.date_filter_end, null);
  assert.equal(o.date_mode, null);
  assert.equal(o.domain_hint, 'order', 'a date widen must never move the domain');
  assert.deepStrictEqual(
    o.entities.map((e) => [e.hint, e.current_message]),
    [['customer', false], ['product', false]],
    'the rest of the scope stands — only the date axis widens');
});

// ── consumer 3's boundary: a GENUINE broaden-everything still clears ──────────────────────────
test('scope_intent "broaden" + broaden_axis "all" still clears — only the misread gets rescued', () => {
  const o = cse('llm-broaden-genuine-everything-still-clears');
  assert.equal(o.entity_op_applied, 'clear');
  assert.deepStrictEqual(o.entities, []);
  assert.equal(o.broaden_axis, 'all', 'no hint resolution on a genuine broaden-everything');
  assert.ok(!('broaden_axis_clear_rescued' in o), 'the rescue must not fire on a real broaden');
});

// ── the precedence seam: deterministic phrase-match first, LLM fallback agrees ────────────────
test('"all dates" with the LLM also emitting broaden_axis "date" (+ a misread yes): the two arms agree', () => {
  const o = cse('widen-phrase-and-llm-broaden-agree');
  assert.equal(o.date_widen_applied, true, 'the deterministic arm decided');
  assert.equal(o.broaden_axis_domain_restored, true, 'the LLM-fallback restore also fired');
  assert.equal(o.domain_hint, 'order', 'both arms restore the SAME prior domain — no fight');
  assert.equal(o.date_filter_start, null);
  assert.equal(o.date_filter_end, null);
  assert.equal(o.is_affirmative, null,
    'the deterministic neutralisation wins over the LLM misread — "all dates" read as an ' +
    'offer-yes would otherwise reach the escalation confirm clobber and ASSIGN');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false });
});

// ── the other buckets' passthrough pins (invariants — see each fixture's rationale) ──────────
test('d1: bare "escalate" with no offer stays request_for_help — the If2 lane opens on the spine\'s terms', () => {
  const o = cse('escalate-word-bare-no-offer');
  assert.equal(o.message_type, 'request_for_help',
    'output_exchange must not reclassify the escalate word — live-spine If2 keys on it');
  assert.deepStrictEqual(o.entities, []);
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false },
    'no parser arm may invent a confirmation — the assign path is the spine\'s, and C1 strips the null company_pick');
  assert.equal(o.domain_hint, null, 'no topic, no invented domain (and If2 requires != portal_link, satisfied)');
});

test('b+d2: "X have take Y" order classification passes through whole, requested_attributes intact', () => {
  const o = cse('take-buy-quantity-order-passthrough');
  assert.equal(o.domain_hint, 'order', 'a customer taking goods is GOODS GOING OUT — order, never incoming');
  assert.equal(o.order_status, null);
  assert.deepStrictEqual(o.requested_attributes, ['quantity'],
    'the parser has no requested_attributes consumer BY DESIGN — it must thread untouched to ' +
    'semantic_input (Call \'sub-get-results\') and output-structurer\'s generic read');
  assert.deepStrictEqual(hints(o).sort(), ['customer', 'product']);
});

test('c: a bare entity continuation carries the domain the LLM was taught to emit', () => {
  const o = cse('bare-entity-continuation-carries-domain');
  assert.equal(o.domain_hint, 'inventory', 'the LLM emits the carried domain itself (BARE ENTITY CONTINUATION)');
  assert.equal(o.message_type, 'business_query');
  assert.equal(o.entity_op_applied, 'replace_combine');
  assert.deepStrictEqual(o.entities.map((e) => [e.raw, e.current_message]), [['srtwc286-sh', true]],
    'the new value replaces the prior product — the EXISTING executor is the whole consumer');
});
