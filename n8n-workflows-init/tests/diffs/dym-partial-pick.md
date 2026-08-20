# Node diff — parser `output_exchange`: a fragment reply is a pick (and carries date + product)

**Date:** 2026-08-20 · **Target:** parser fork `wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`) — the fork the clone actually calls. ONE node (`output_exchange` jsCode), three small hunks. Live parser `XTODTw-dJcV0uRdC056hG` untouched.
**Reported by the captain in-console:** after the did-you-mean offered `MASTILE KLANG SDN BHD` / `… [A/C I]`, replying **"MASTILE KLANG"** produced *"Hi! Could you please specify what information you need about MASTILE KLANG?"* — the pick was lost, and with it the August window and the product.

## Versions

| step | fork version |
|---|---|
| base | `107543f3-1339-41a5-a8ef-69458f256967` (backed up: `fork-wI5RkNGW3EOJfBdo-full-get-pre-107543f3.json`) |
| hunk 1 (partial pick + merge) | `d542ee76` |
| hunk 2 (ADD-BOTH collision) | `0c576a2a` |
| hunk 3 (roster-label deference) | `df079f33` — **current** |

Rollback: PUT the backup body (auto-activates). Node count 8 and connections unchanged at every step; each PUT machine-diffed to `output_exchange` only, byte-exact after write.

## Root cause (from exec 13201053)

`tryDymPick` matched **exact code only** (`norm(c.code) === msg`), so "MASTILE KLANG" found nothing and fell through. Turn 1's reply carried the CS-escalation roster as well as the did-you-mean, so the session's `selection_context` was `member_offer`; the member-pick arm then took the turn, classified the reply as junk (Tier 4), set `message_type: casual`, emptied the entities, and handed off to the clarification LLM. Precedence was never the problem — the member arm is already gated on `dym_pick_applied !== true`; nothing had set it.

## The three hunks (all in `output_exchange`)

**1 — partial-reply pick, merging every match.** When exact matching finds nothing, a reply that is a *fragment of* an offered code counts as a pick. Per the captain's decision an ambiguous fragment **merges every candidate it matches** ("MASTILE KLANG" → both the plain account and `[A/C I]`) instead of guessing one; picks are threaded through the existing `applyDymPick` with slot-matching off, the same ADD-BOTH contract `dymNumberedMultiSelect` uses, which also makes #5's domain-carry fire. Guards: a fully-classified new query (own `domain_hint` AND `intent_hint`) is never hijacked; ≥4 and ≤60 chars; never a date or bare number; and the reply must be contained *in* the candidate, never the reverse (so an offered code inside a larger new-domain phrase still falls through). Diagnostic: `dym_partial_pick` = number merged.

**2 — ADD-BOTH collision fix in `applyDymPick`.** The "unambiguous single-hint" fallback matched the entity the *first* pick had just minted, so the second candidate overwrote it and only the last account survived (measured, exec 13203346: `dym_partial_pick: 2`, one customer out). Entities already recorded in `_ceDymPickedKeys` this turn are now excluded from that fallback — no new state, and it hardens the numbered multi-select path against the same shape.

**3 — roster labels defer to their own arm.** "reply a product then is product, reply a person's name then is person" (captain): a fragment reply that IS a label on the open roster (`last_result_set` — CS members, company picks) returns without picking, so the member/company arm keeps it. The exact-code path still wins for a real code.

## What the captain asked for, verified

**"The system must remember my choice of date, product etc. and search through my replied customer."** `applyDymPick` replaces the missed customer entity in place, keeps every other prior entity, and carries the prior date window. Exec 13203504 after the pick: entities = `MASTILE KLANG SDN BHD [A/C I]` + `MASTILE KLANG SDN BHD` + `SRTWC286-SH-200`, `date_filter 2026-08-01…31`, `domain_hint: order`, `dym_pick_applied: true`.

## Acceptance (clone `8fc15092` + fork `df079f33`)

| case | driver | result |
|---|---|---|
| fragment reply "MASTILE KLANG" | console `pk-A` | picks **both** MASTILE KLANG accounts, keeps SRTWC286-SH-200 + August. Was: clarification LLM |
| exact reply "MASTILE KLANG SDN BHD" | console `pk-B` | single account, unchanged behaviour |
| person-name reply "Cyndi" | console `pk-C` | escalates to Cyndi — person arm wins |
| "yes" escalate | console `pk-D` | escalates (auto-assign), unchanged |
| misspelled customer + exact product | uac `pkreg-d2` | If3 TRUE, customer DYM, zero order rows — leak still closed |
| correct spelling | uac `pkreg-d3` | exactly order 202608-2349, MASTILE only |
| misspelled customer + fuzzy product | uac `pkreg-d1b` | If3 TRUE, customer DYM |

Scope check on the merge: the resolver expands the two picked codes to 9 customer uuids — all MASTILE KLANG family (`[A/C I]`–`[A/C IV]`, `[IBORN]`, `[CERAMIC]`, `(CERAMIC & ELLECI)`), no foreign company, so the answer stays inside the customer group.

Zero egress: no forbidden/orphaned node ran in any run; the escalation cases rode the guarded `sub-human-intervention TEST (delta3)` fork (`vUfFUDjLAuMaeQE6`), which only performed a CRM read (`next-assignee`) — no assignment write, no staff notification; sends went through the chat rendezvous fork.

Known flake, pre-existing and unrelated: one uac rerun (`pkreg-d1`, exec 13203935) had the parser LLM classify the same sentence as domain `incoming` and drop the customer entity; the gate still blocked the turn. Re-run parsed as `order` normally.

## Promote (HELD, captain-gated)

Target is the live parser `XTODTw-dJcV0uRdC056hG` (shared sub — a PUT there is immediately live for the spine, LESSONS §37). Re-apply the hunks onto a fresh live GET after diffing its `output_exchange` against this fork's base; do not copy the body (the fork carries other clone-era work). Sequence stays: If3 gate first, then the copy hunks, then this.
