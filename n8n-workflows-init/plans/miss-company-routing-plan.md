# miss-company-routing — result-aware escalation scoping (plan, rev-1)

Captain decisions (2026-08-18, verbatim intent):
1. **Partial miss on an order enquiry** (one company has records, the other none): the reply keeps the found
   results and the presenter's miss line, then goes **straight to the miss company's member picker**
   ("please choose who to route to (reply with the number)" + that company's CS members). A bare "yes" and a
   number pick both route to the **miss** company.
2. **Quantity 0 is NOT a miss.** A stock row with 0 on hand is an answer; this feature is scoped to the
   order-records lane only and must not fire on stock/incoming turns.
3. **Both companies miss + bare "yes"** (today: both axes null → default pool): do NOT silently assign —
   reply a clarify ("which company — Mocha or Sorento? or reply a number/name") and accept a **company-name
   reply** as the pick; `next-assignee` with `company_id` and no `preferred_assignee_id` already round-robins
   that company's pool (verified — no CRM change).

Builds ON TOP of the promoted brand-company-routing change (live spine `efa21057-…`, clone `b5c29d54-…`).
Build target: the clone `txiPzSxy3Pclsz6v` + parser fork `wI5RkNGW3EOJfBdo` (verify wiring first per AGENTS.md).
Live untouched until the captain's gate.

## 0. Grounding (verified 2026-08-18 on live execution 12901422/12901255 + clone dump `b5c29d54`)

- The per-company order reply — including "*Sorento:* no orders records for MUB6201." — is composed by the
  CRM MCP presenter inside the `sub-get-results` envelope (`response`). The envelope carries the structured
  signals we need: `lookup_companies: [{id,name}…]` (companies queried) and per-answer
  `fields[{key:"company_name", value}]`. **Miss companies = lookup_companies minus the companies that appear
  in `answers[].fields[key=company_name]`.** Only compute when `has_result === true`, the domain is orders,
  and EVERY answer carries a `company_name` key field (else no offer — conservative fail-open). Stock rows
  (qty 0 included) are answers, so decision 2 holds automatically.
- Case A (partial miss) rides the **happy path**: `escalate-catalog`/`cs-offer-gate`/`cs-roster-plan` never
  run (they live on the miss branches), and `crossdomain-compose`'s answered arm didn't fire (its `_xdBlock`
  is the cross-DOMAIN probe, not per-company orders). Consequence verified: today's state after case A has
  **no** "Would you like me to escalate" phrase, so even a bare "yes" would not confirm an escalation.
- Parser contracts (locked): `output_exchange` recognises an escalation confirmation by
  `/would you like me to escalate/i` against `previous_conversation_state.response`; a number/name pick
  resolves against the persisted `last_result_set` rows (Δ3 retarget arm). Both are reused, not modified —
  the new turn must therefore (a) append the frozen phrase to the persisted `variables.response`, and
  (b) persist the member rows into `last_result_set` with **continuous idx numbering** (the reply's order
  blocks are numbered `1.`, members continue `2..N` — "a stray 2 must still pick" the right row).

## 1. Spine clone changes (new mini-lane + two merge hunks)

| node | change |
|---|---|
| `miss-roster-gate` (NEW, If) | On the happy path after `Call 'sub-get-results'`/validator: fires when `has_result`, routing is `customer_service`/`order_enquiries`, and the computed miss set is non-empty. Exact insertion point: coder picks the seam between the validator and `compile-current-state` that runs on answered order turns; fail-closed (gate false) on any missing signal. |
| `miss-roster-plan` (NEW, code v2) | One item per **miss** company: `{plan_idx, company_id, company_name, brand_code, multi_company}` — brand looked up from `disallowed-entity-gate`'s `routing_companies` entry for that company (try/catch, null when absent). Mirrors `cs-roster-plan`'s item shape so downstream consumers (ccs persistence, escalation-context) treat it identically. |
| `get-cs-members-miss` (NEW, HTTP) | Same URL pattern/credential/options as `get-cs-members` (brand/company query segments, `fullResponse:true`, `onError: continueRegularOutput`). Dedicated node — do NOT re-enter the miss lane's `get-cs-members`; the two lanes continue differently. |
| `build-miss-member-offer` (NEW, code v2) | Renders the picker: `Please choose who to route to (reply with the number):` + `n. Name (Company)` lines (numbering continues after the reply's existing numbered blocks), + `If you have no preference, just reply 'yes' and we'll assign automatically.` Emits `miss_member_rows` (cs_last_result_set-shaped rows incl. `company_id/company_name/brand_code/company_ids`), `miss_offer_text`, `miss_roster_plan` (the plan items that contributed members — same intersection rule as rev-5). Zero members from every miss company ⇒ emits nothing (turn stays byte-identical). |
| `compile-current-state` (hunk) | New answered-turn merge arm (precedent: Δ4 `_merge`): when `build-miss-member-offer` ran and produced rows — append `miss_offer_text` + the frozen phrase `Would you like me to escalate to ${team} team?` to `user_response` (phrase BEFORE the picker, keeping the locked wording intact), append the phrase to persisted `variables.response`, extend `last_result_set` with the member rows (continuous idx), and persist `routing_roster_plan`/`routing_company`/`routing_brand` from the MISS plan (single miss company ⇒ that pair verbatim — the bare-"yes" rev-4 arm then routes there with no further change). All keys null-inert. |
| `escalation-context` (arm) | New `company_pick` arm: when the parser emits `escalation.company_pick`, resolve it against the persisted `routing_roster_plan`/`routing_companies` (case-insensitive name or id match) → that row's `(company_id, brand_code)` verbatim, `routing_source:'company_pick'`. Sits ABOVE the multi-company-unpicked arm. |
| `clarify-company-gate` (NEW, If) + `clarify-company-reply` (NEW, code) | Between `escalation-context` and `Call 'sub-human-intervention'`: when `routing_source === 'multi_company_unpicked'` → divert to a clarify reply ("Both X and Y teams are listed — reply a number, a name, or just the company (X / Y) and I'll assign automatically.") sent via the existing send path, escalation NOT executed, state preserved so the next reply still resolves (offer context, incl. the frozen phrase, re-persisted). Everything else → HI call unchanged. ⚠️ this diverts an arm that previously always reached the HI call — the HI-call input guards (rev-8 `isExecuted`) already tolerate it. |

## 2. Parser fork changes (`wI5RkNGW3EOJfBdo`, rebase-on-live discipline as before)

- `output_exchange`: in the escalation-confirmation context (the same arm that today resolves number/name
  picks), when the reply matches a company named in the prior state's `routing_companies`/`routing_roster_plan`
  (case-insensitive, word-boundary) and matches NO member row → emit `output.escalation.company_pick = <name>`
  with `is_escalation_confirmation: true` and no `preferred_assignee_id`. A reply matching a member still wins
  (member pick outranks company pick).
- systemMessage: one short addition documenting the company-name reply on escalation-confirmation turns.

## 3. Replay norm

`company_pick`/`routing_source` etc. ride existing containers; new state keys introduced here
(`last_result_set` member rows on answered turns) surface as diffs against golden by design (Lesson 40).
No new `norm()` rule expected; re-check at review.

## 4. Safety

All existing clone guards untouched; the new lane's only egress-adjacent node is `get-cs-members-miss`
(CRM **read**, allowed) and the clarify reply through the already-guarded send path. UAC must re-assert §0
zero-egress (S1–S6).

## 5. UAC (tests/miss-company-routing-UAC.md)

- **M1** partial miss (order found in Mocha only, product in both): reply = results + presenter miss line +
  phrase + Sorento-only picker (6 members, numbering continues after the order block); roster call carries
  `company_id=<sorento>` (+brand when the plan row has one); state: `routing_roster_plan` = 1 Sorento row,
  phrase present in `variables.response`.
- **M2** M1 then number pick → parser resolves member uuid; HI inputs carry the Sorento pair
  (`routing_source: picked_member`).
- **M3** M1 then bare "yes" → HI inputs carry the Sorento pair (rev-4 verbatim arm; no code change needed —
  assert it).
- **M4** both-miss (case B) then bare "yes" → NO HI call, clarify-company reply sent, zero egress; then reply
  "mocha" → HI inputs carry the Mocha pair (`routing_source: company_pick`).
- **M5** stock enquiry with a qty-0 row (screenshot shape) → no picker, no miss lane (gate false).
- **M6** regression: single-company product B3rev2-shape turn unchanged; non-order domains unchanged.
- **S** §0 zero-egress checklist on every case.
