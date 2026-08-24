// ── member-offer-digit-in-name.test.js — P20: a digit inside a NAME is not a pick ─────────────
//
// Execs 13045880 / 13206773: "4 smart delivery status" arrived while a 4-member escalation offer
// was open. _extract's loosest arm - any bare-digit word in a reply of four words or fewer - read
// the "4" of the CUSTOMER NAME "4 SMART" as position 4, and the parser confirmed an escalation to
// that member. A delivery question became a real staff assignment, with the email/WhatsApp ripple
// that follows one.
//
// The guard keeps that best-effort arm only when the LLM did NOT read the turn as a new business
// query. It NARROWS a wrong-assign, which is the safe direction of change, and it leaves both
// _forcePick (whole reply is a bare number or a member name) and every strict arm - "4", "#4",
// "option 4", "4th" - untouched, so LESSON 39's wrong-assign guarantee stands unchanged. The
// existing member-offer fixtures cover those arms and must stay green alongside this one.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';

test('P20: a digit inside a current-message entity name does not confirm an escalation', () => {
  const o = parserCase(SLUG, 'member-offer-digit-inside-a-customer-name-is-not-a-pick');

  assert.notStrictEqual(
    o.escalation && o.escalation.is_escalation_confirmation, true,
    `"4 smart delivery status" must not confirm an escalation - got ${JSON.stringify(o.escalation)}`,
  );
  assert.ok(
    !(o.escalation && o.escalation.preferred_assignee_id),
    `no member may be picked off a digit inside a name - got ${JSON.stringify(o.escalation)}`,
  );
  assert.notStrictEqual(o.member_pick_context, true,
    'the turn is a new query, not an engagement with the offer');
  assert.ok(
    (o.entities || []).some((e) => String((e && e.raw) || '').toLowerCase() === '4 smart'),
    'and the customer the question was actually about survives as the filter',
  );
});
