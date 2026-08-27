# Node diff — `output_exchange`: a digit inside a business query is not a member pick

**Date:** 2026-08-20 · **Target:** parser fork `wI5RkNGW3EOJfBdo`, node `output_exchange`, ONE hunk (`df079f33` → `8c35dad3`). Live parser untouched.
**Reported by the captain in-console** (exec 13206773): `4 smart delivery status` — a delivery question about the customer "4 smart" — was escalated to customer service instead of answered.

## Cause (already diagnosed 2026-08-19, never shipped)

Identical to live exec 13045880, root-caused in `firstmate/data/live-exec-attachment-and-escalation-diag/report.md` §4. With a `member_offer` roster open, `_extract`'s loose "any bare-digit word in a ≤4-word reply" arm read the `4` of the customer name **4 smart** as pick #4. The member-pick ladder puts that guess in tier 2, which outranks tier 3 (new query), so the LLM's correct parse (`business_query`, `domain order`, `intent check_order`, entity `4 smart`) was overridden: `escalation.is_escalation_confirmation: true`, entities emptied, `member_pick_context: true`. Latent since 2026-07-06; needs the conjunction (name containing a digit × open member offer × digit ≤ roster size).

## The hunk

The report's §4.8 candidate, applied verbatim: keep the loose guess only when the LLM did NOT read the turn as a new business query carrying a current-message entity that contains that digit. Strict forms — LLM `reference_positions`, bare `4`, `#4`, `option 4`, `4th`, and `_forcePick` (whole reply is a number or a member name) — are untouched, so LESSON 39's wrong-assign guarantee stands.

## Acceptance (clone `8fc15092` + fork `8c35dad3`, console, zero egress)

| case | result |
|---|---|
| roster open, `4 smart delivery status` (exec 13207261) | **answered as an order query** — `member_pick_context` unset, `escalation.is_escalation_confirmation: false`, 16 orders returned. Was: escalated to a CS member |
| roster open, `4` | still picks member 4 (Balqis) |
| roster open, `option 4` | still picks member 4 (Balqis) |

## Open finding surfaced by the fixed run (NOT part of this hunk)

The now-answered turn returns 16 orders across **three distinct companies** — SB SMART CONCEPT SDN BHD, EUROSMART BATHROOM SOLUTION (M) SDN BHD, SMART PLUS SDN BHD — because the customer token "4 smart" fuzzy-resolves to all of them. The If3 gate cannot catch this: the customer *did* resolve, just ambiguously. This is cross-customer breadth of a different class (ambiguous-resolve, not miss).

**Captain decision, 2026-08-20: LEAVE AS IS for now** — a vague customer token keeps returning every matching company's orders; recorded as a known gap, revisit later. The companion decision: an explicit fragment PICK keeps merging every account under the picked name (the MASTILE `[A/C I]`/`[IBORN]`/`[CERAMIC]` family), because a pick means the customer chose that name. Any future ask-rule therefore applies only to freshly-typed, un-picked tokens.

## Promote (HELD)

Live parser `XTODTw-dJcV0uRdC056hG`; re-apply the hunk onto a fresh live GET (the fork carries other clone-era work). The report's offline probe on the live body flipped the same case with strict controls unchanged.
