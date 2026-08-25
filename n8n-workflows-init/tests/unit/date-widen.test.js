// ── date-widen.test.js — deterministic "all dates" widen in the live parser's output_exchange ──
//
// Live cascade, measured 2026-08-25 (spine execs 13873180 → 13873233 → 13873581 → 13873625):
// turn 1 answered a delivery-status query across all dates; turn 2 "this week only" narrowed to a
// 2026-08-24..2026-08-30 window (carried scope re-ran the search — the lane proof this arm rides);
// turn 3 "all dates" came back from the LLM as scope_intent 'broaden' + entity_op 'clear' +
// entities [] + domain null, the executor wiped the carried scope, and the clarification LLM
// improvised; turn 4 "all of them" got the generic menu — context gone.
//
// The BROADEN AXIS prompt rules SHIPPED to live with the 2026-08-25 captain-ordered prompt
// promote (company-pick-parser.md §3 bucket d3), together with their consumers (the AXIS BROADEN
// restore, the reuse arm's `broaden_axis === 'date'` force-open, the final-pass drop — see
// llm-broaden-fallback.test.js). This deterministic arm predates that promote (it detects the
// bare phrase in code, which the LLM consumers cannot) and now sits FIRST in the documented
// precedence: deterministic phrase-match decides, the LLM broaden_axis field is the fallback for
// phrasings the detector cannot see. It re-emits the exact carried business_query shape exec
// 13873233 proved re-runs the search on the UNCHANGED spine, with the window forced open.
//
// tests/unit/_all-nodes.test.js deep-equals every widen-* fixture already; this file re-asserts
// the LOAD-BEARING decision fields by name so a fixture re-pin cannot silently flip the contract
// (the fixture-vs-property split of company-pick-deterministic.test.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';
const cse = (name) => parserCase(SLUG, name);

// ── the widen fires: carried scope re-attached, window forced open ────────────────────────────
test('exec 13873581: "all dates" re-attaches the carried scope with the window forced open', () => {
  const o = cse('widen-all-dates-exec-13873581');
  assert.equal(o.date_widen_applied, true);
  assert.equal(o.message_type, 'business_query', 'the spine must re-run the search, never the clarify LLM');
  assert.deepStrictEqual(
    o.entities.map((e) => [e.raw, e.hint, e.current_message]),
    [['full shun', 'customer', false], ['srtwc286', 'product', false]],
    'the carried entities ride current_message:false — the exact shape turn 2 (exec 13873233) proved re-runs the search');
  assert.equal(o.entity_op_applied, 'reuse');
  assert.equal(o.date_filter_start, null);
  assert.equal(o.date_filter_end, null);
  assert.equal(o.date_mode, null);
  assert.equal(o.domain_hint, 'order', 'a date widen must never move the domain (fork prompt F381-384)');
  assert.equal(o.intent_hint, 'check_order');
  assert.equal(o.scope_intent, null,
    'ONE axis widened is not an entity broaden — scope_intent broaden would have the blocklist strip order+customer');
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false });
});

test('"yes all dates please" is a widen, not an offer confirmation — no assign may ride the filler "yes"', () => {
  const o = cse('widen-filler-yes-all-dates');
  assert.equal(o.date_widen_applied, true);
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: false },
    'the LLM read is_affirmative:true on an open offer; unneutralised that reaches the confirm clobber and ASSIGNS');
  assert.equal(o.is_affirmative, null);
  assert.equal(o.date_filter_start, null);
  assert.equal(o.date_filter_end, null);
  assert.equal(o.entities.length, 2);
  assert.equal(o.message_type, 'business_query');
});

test('"all time" widens outside any offer context too (plain windowed conversation)', () => {
  const o = cse('widen-all-time-plain');
  assert.equal(o.date_widen_applied, true);
  assert.equal(o.date_filter_start, null);
  assert.equal(o.date_filter_end, null);
  assert.equal(o.entities.length, 2);
  assert.equal(o.domain_hint, 'order');
  assert.ok(!('_pending_pick' in o), 'no roster is pending — the D11 stamp must not appear');
});

// ── the gates: nothing to widen ⇒ the arm must NOT fire ───────────────────────────────────────
test('no prior window ⇒ not a deterministic widen — output byte-identical to the pre-fix body', () => {
  const o = cse('widen-no-prior-window');
  assert.ok(!('date_widen_applied' in o));
  // the fixture's expected IS the frozen pre-fix (HEAD 15e7dbd) output; _all-nodes deep-equals it.
});

test('no carried entities ⇒ nothing to widen onto — the arm must NOT fire', () => {
  const o = cse('widen-no-carried-entities');
  assert.ok(!('date_widen_applied' in o));
  assert.deepStrictEqual(o.entities, []);
});

// ── precedence: picks and confirmations stay untouched ────────────────────────────────────────
test('bare "yes" on the open offer still confirms — a window in state must not hijack it', () => {
  const o = cse('widen-bare-yes-precedence');
  assert.ok(!('date_widen_applied' in o));
  assert.equal(o.escalation.is_escalation_confirmation, true);
});

test('a number still picks the member — "2" resolves to the roster row, never a widen', () => {
  const o = cse('widen-numeric-pick-precedence');
  assert.ok(!('date_widen_applied' in o));
  assert.deepStrictEqual(o.escalation, { is_escalation_confirmation: true, preferred_assignee_id: 'm2' });
});

test('"all of them" is NOT in the widen family — it stays whatever it is today (prompt territory)', () => {
  // 'of' is a filler but 'them' is content: the reply strips to 'all them', matching no phrase.
  // Turn 4 of the cascade (exec 13873625) needs the fork's BROADEN AXIS prompt rule — out of scope.
  const o = cse('widen-all-of-them-negative');
  assert.ok(!('date_widen_applied' in o));
});
