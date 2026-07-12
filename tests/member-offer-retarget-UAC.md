# UAC — member_offer entry-gate fix (retarget / decline / new-query abandon)

**Plan:** `plans/member-offer-retarget-fix.md`
**Target (build/test):** reformulator FORK `CpxE8LroLzCkrAQN` (`sub-query-reformulator TEST rebase`), the one
the clone `txiPzSxy3Pclsz6v` actually calls. **NOT** live `XTODTw-dJcV0uRdC056hG` (promote target, user-gated).
**Node under test:** `output_exchange` (Code), Δ3 member-pick block (line 455) + routing derivation (442–449).
**§10 follow-on adds:** fork `AI Agent` systemMessage clause (id `cb4f080d-…`, line 147 — survive-decline);
`output_exchange` decline arm (`escalation_declined`); and SPINE `txiPzSxy3Pclsz6v` deterministic decline
branch (new `is-escalation-declined` IF between `If10`false→`If9`, new `tag-escalation-declined` Set →
existing `escalate-catalog` `escalation_declined` case → `compile-current-state` → guarded send; bypasses
`Basic LLM Chain`). Spine edits promote to LIVE spine `9qVyfUxmRQqrpGRMDLRuz` (user-gated). See plan §10.
**Scope / tier:** `parser`. Run the REAL rebased fork; **OMIT `mock_reformulator_output`** (a mock bypasses the
whole reformulator and cannot exercise a change inside `output_exchange` — LESSON 28). Cheapest layer = §V0
offline unit; e2e = §V1 on the fork.

## Safety binding (§0)
Every row below is bound by the **§0 MANDATORY safety checklist** in `tests/UAC.md` (S1–S6). §0 is the
acceptance gate: any real egress = hard FAIL + **halt the run**. All rows run on the guarded clone; the
escalation/pick/retarget payloads are consumed only by the human-intervention fork `vUfFUDjLAuMaeQE6`, which
short-circuits on `is_test=true` → no real assign/SLA/PIC-comment/queue-push. Assert from
`get_execution(includeData:true)` + Redis `test:egress:{test_run_id}` that only `would_send` / `would_write`
records exist.
- **S1** — every bot reply (pick confirm, retarget "routing you to warehouse", re-offer, the fixed
  "Escalation declined." decline reply, domain answer) recorded as a **blocked** sendmsg; no
  `api.respond.io/.../message` POST executed.
- **S2 (focus for rows 1, 2, 3, 5, 6)** — NONE of `Assign or unassign a Conversation1`,
  `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the assignee-queue Redis push
  executed. This is the highest-risk axis: a real retarget/pick/round-robin would assign a live conversation.
- **S3** — `save-session-vars` (the state write carrying the cleared `selection_context`/`last_result_set` on
  retarget/abandon) blocked → `would_write`; `update-human-intervened` blocked.
- **S4** — get-results reached only on the new-query rows (7/8/9); resolved `tool` in the READ allowlist,
  never `crm_it_support_ticket_create`.
- **S5** — `test_mode/is_test === true` present in the fork + every invoked sub's inputs.
- **S6** — token sink bounded to `parser`: only the fork's own LLM ran.

## Prerequisite — seed the member_offer prior state (per plan §7)
Pre-seed `respond_contacts_test` (cred `Dnnofg8Xb27VQOhI`) for contact **`437264483`** with the §7 state
(selection_context=`member_offer`, `routing.suggested_team=customer_service`, 5-member `last_result_set`:
1 Ms Tan / 2 Sandy Lim / 3 Lin / 4 Nur / 5 Emily), run each row as ONE turn in `mode=regress-capture`, and
**reset the row between rows**. No `mock_reformulator_output`.

## Prerequisite — additional seeds for the §10.8 non-escalation rows (11–13)
Rows 11–13 do **NOT** use the member_offer seed — each needs its own prior `respond_contacts_test` state,
reset between rows. The following are **PREREQUISITES the tester must resolve against the fork/spine before
running** (planner could not confirm them without a live read while the coder edits the fork):
- **Row 11 (access-level):** confirm (a) the exact `selection_context` token the ask-access flow writes when
  the bot asks "which version — office or dealer?" and (b) which contact triggers the access gate
  (`457216562` NO-access, or the **partial/ask-for-access contact = TBD**, flagged as an open prerequisite in
  the change brief). Confirm the reply field the reformulator emits for an access-level name (e.g.
  `access_levels`) and the **L181 access-reply rule** text. Seed that state; reply `office version`.
- **Row 12 (suggest_offer):** confirm the `selection_context` token for the suggest-on-miss did-you-mean
  offer (expected `suggest_offer`) and the `last_result_set` shape it stores (`alternatives[]` with codes +
  retained `domain_hint`). Confirm `output_exchange` (or wherever the suggest-follow-up re-query lives)
  handles it independent of `message_type`. Seed with FULL contact `437264483`.
- **Row 13 (non-escalation confirm):** identify a real non-escalation yes/no confirm closed-question (a turn
  producing `message_type='confirmation'`). If none exists, record **N/A** and note member_offer is the only
  bare-affirmative closed-answer path (row 3 covers it) — do not fabricate one.
- **Baseline capture:** for rows 11–13 the acceptance is "no regression vs pre-refactor," so capture the
  pre-refactor branch / `Basic LLM Chain.isExecuted` / routing for each turn **before** applying edits A–D
  (or assert against the documented pre-refactor branch), then compare after.

## Case matrix (all share the same seeded member_offer prior state)

**Assertion column added: "Basic LLM Chain invoked?" — for EVERY decline row it MUST be NO** (the whole
point of the §10 follow-on is that declines render deterministically, never through the gpt-4.1-mini
clarification LLM). Assert `$('Basic LLM Chain').isExecuted === false` in `get_execution` runData.

| # | reply (message from `437264483`) | expected branch / final state | abandon / answer / reprompt | Basic LLM Chain invoked? |
|---|---|---|---|---|
| 1 | `2` | **pick idx2.** `escalation = {is_escalation_confirmation:true, preferred_assignee_id:"u-sandy"}`; `entities:[]`; `member_pick_context:true`; `routing.suggested_team:"customer_service"` (unchanged). | resolve (round-robin bypassed by preferred) | NO |
| 2 | `Nur` | **name pick idx4.** `escalation = {is_escalation_confirmation:true, preferred_assignee_id:"u-nur"}`; `member_pick_context:true`. (LESSON 39: resolve-to-Nur OR safe new-query abandon both PASS; resolve to a WRONG member = **hard fail**.) | resolve | NO |
| 3 | `yes` | **round-robin CS escalate.** `escalation = {is_escalation_confirmation:true}` with **NO** `preferred_assignee_id`; `routing.suggested_team:"customer_service"`; `member_pick_context:true`. Proves the `is_affirmative===true` arm is now reachable (§1.1 un-shadowed). | resolve (round-robin) | NO |
| 4 | `no thanks` | **DETERMINISTIC decline (§10).** `output_exchange`: `escalation = {is_escalation_confirmation:false, escalation_declined:true}`; **no** `correction`, **no** `member_reprompt`. Spine: `is-escalation-declined` TRUE → `tag-escalation-declined` (`branch_kind='escalation_declined'`) → `escalate-catalog` → `compile-current-state` → send. **Final bot reply EXACTLY `"Escalation declined."`** `Basic LLM Chain` NOT run. Proves Gap B closed (was: gpt-4.1-mini placating text). | cancel — canned "Escalation declined." (no reprompt, no LLM) | **NO (hard-assert)** |
| 5 | `no, I want warehouse` | **RETARGET → warehouse (Gap A closed via §10.8 refactor, NOT the removed §10.2 clause).** Edits A+B+D: A removes the L137 short-circuit so `message_type` is classified from content → B fires `request_for_help` on naming "warehouse team" → D emits `routing.suggested_team:"warehouse"` even while declining; `is_affirmative:false` stays (orthogonal). So the real fork now emits `message_type:"request_for_help"` + `is_affirmative:false` + `routing.suggested_team:"warehouse"` **simultaneously** (previously mis-classified `casual` → FAILED because the dead L147 clause never ran). `output_exchange` Tier-1 retarget then fires: `escalation = {is_escalation_confirmation:true, retarget_team:true}`; `selection_context` cleared; `last_result_set:[]`; `member_pick_context:false`. Same final state as row 6. Downstream `If2` → direct-assign warehouse round-robin. | abandon CS offer → direct-escalate new team | NO (escalate path, not clarify) |
| 6 | `can i escalate to warehouse team?` | **RETARGET → warehouse** (same final state as row 5). | abandon → direct-escalate new team | NO |
| 7 | `show me all promotions` | **abandon offer → promotion answer.** `message_type:"business_query"`; `domain_hint:"promotion"`; `member_pick_context` NOT set (stays false); `escalation` NOT forced to a member reprompt; normal processing answers promotions. | abandon → answer (promotion) | NO (happy path) |
| 8 | `check stock SRTKT72SS` | **abandon offer → stock answer.** `domain_hint` = stock/inventory; `member_pick_context:false`; **Bug-2 guard:** the `72` in `SRTKT72SS` is NOT mined as a position → NO `member_reprompt:"out_of_range"` from digit-mining; normal processing answers stock. | abandon → answer (stock) | NO (happy path) |
| 9 | `what can you do` | **abandon offer → clarification answer.** `message_type:"clarification"` (no `domain_hint`) → broadened `_isNewQuery` abandons; `member_pick_context:false`; normal processing gives the capability/clarification reply. **Note:** `clarification` routes via `If1`→`tag-clarify-menu`→`escalate-catalog` (deterministic menu), NOT `Basic LLM Chain`. | abandon → answer (clarification) | NO |
| 10 | `asdkjh` (junk) | **out_of_range reprompt.** No pick signal, no domain, no team, no affirmative → tier 4. `escalation = {is_escalation_confirmation:false, member_reprompt:"out_of_range"}`; `correction:true`; `member_pick_context:true`; offer re-offered once (via `If10`→`tag-escalate-offer`→member-offer rebuild, deterministic). | reprompt | NO |

## §10.8 NON-ESCALATION regression rows (11–13) — WIDE surface of edit A (short-circuit removal)

> **Why these exist:** edit A (§10.8) removes the L137 short-circuit that skipped message_type classification
> for **EVERY reply-to-a-closed-question**, not just the member_offer. So `message_type` now becomes
> content-derived for access-level replies, suggest_offer picks, and yes/no confirms — turns that
> previously never got a content message_type. These rows prove **no collateral spine misrouting** on those
> non-escalation closed-answer paths. **NOT** seeded with the member_offer state — each has its own prior
> state (see "Prerequisite — additional seeds"). Ties to plan V11. **Baseline comparison is load-bearing:**
> "correct" here means **identical branch / `Basic LLM Chain` invocation / routing as pre-refactor**, so the
> tester should capture the pre-refactor behavior for these turns first (or assert against the documented
> pre-refactor branch).

| # | reply | prior state (seeded) | expected message_type / is_affirmative / routing | expected branch / final action | Basic LLM Chain invoked? |
|---|---|---|---|---|---|
| 11 | `office version` (name an access level in reply to "which version — office or dealer?") | `selection_context` = the **access-level-ask token** (TBD — prerequisite); contact with the access gate live (TBD — prerequisite) | `message_type` **NOT** `request_for_help` (naming an access LEVEL is neither a human nor a team request — edit B must not over-fire); `is_affirmative` null/not-yes; **`access_levels` set correctly** (e.g. `["office"]`); `routing.suggested_team` **NOT** retargeted to a team (edit D must not treat "office" as a team). **L181 access-reply rule must still hold.** | resolve the access-level ask → correct **no-access / ask-access** downstream branch (grant/record the level, then gate/answer); **NOT** misrouted to escalation, **NOT** into the clarify LLM unless pre-refactor did. | **match pre-refactor** (expected NO — access handling is deterministic; assert `isExecuted` equals the pre-refactor value) |
| 12 | bare alternative code (e.g. `SRTC500`) **or** `the 2nd one` (pick a did-you-mean suggestion) | `selection_context` = **`suggest_offer`** (TBD-confirm token); `last_result_set` = MCP `alternatives[]` in a retained domain (e.g. `domain_hint:"product"`/`stock`, 3 alt codes) — prerequisite; contact `437264483` (FULL) | `message_type` content-derived (bare code → `business_query`+retained `domain_hint`; "the 2nd one" → positional); `is_affirmative` null; **NOT** `request_for_help`, **NOT** `escalation_declined` | **re-query in the retained domain** (LESSON suggest-follow-up) → get-results READ → answer. **NOT** escalate, **NOT** decline, **NOT** `out_of_range`. | NO (happy-path re-query; assert = pre-refactor) |
| 13 | `yes` (bare affirmative to a **non-escalation** yes/no confirm) | **CONDITIONAL — prerequisite:** a non-escalation closed yes/no confirm must exist (candidate: any turn producing `message_type='confirmation'`, which `If9` already lists). If none exists in the flows, mark **N/A** (member_offer is then the only bare-affirmative closed-answer path → row 3 covers it). | `message_type` content-derived (likely `confirmation`); `is_affirmative:true` | pending confirm resolved **as pre-refactor** — **NOT** misrouted to escalation/decline/clarify | match pre-refactor |

> **Genuine-clarify regression guard (NOT a member_offer row, run separately):** a real `casual`/`unknown`
> turn that is NOT a decline (e.g. "haha ok thanks", no `escalation_declined`) MUST still reach
> `Basic LLM Chain` (`isExecuted===true`) — proves the new `is-escalation-declined` IF did not swallow the
> legitimate clarify path. This is plan **V8**.

### Per-row structural assertions (from `get_execution` on the fork's `output_exchange` output)
- **Rows 1, 2:** `escalation.preferred_assignee_id` equals the seeded `uuid` at that idx (`u-sandy` / `u-nur`);
  `escalation.is_escalation_confirmation===true`; `entities===[]`.
- **Row 3:** `escalation.is_escalation_confirmation===true` AND `escalation.preferred_assignee_id` **absent**
  (undefined) — round-robin, not a specific member.
- **Row 4 (§10 deterministic decline):** on the fork's `output_exchange` output —
  `escalation.is_escalation_confirmation===false`, `escalation.escalation_declined===true`, no
  `member_reprompt` key, no `correction===true`. On the spine — `is-escalation-declined` TRUE branch taken;
  `tag-escalation-declined` executed (`branch_kind==='escalation_declined'`); `escalate-catalog` executed with
  the `escalation_declined` case (`response==='Escalation declined.'`, `manualResponse===true`,
  `is_escalate_offer===false`); `compile-current-state` final `response==='Escalation declined.'`;
  **`$('Basic LLM Chain').isExecuted===false`** (hard-assert). `cs-offer-gate` took its FALSE arm (no
  `get-cs-members`/`build-cs-member-offer`).
- **Rows 5, 6:** `routing.suggested_team==='warehouse'`; `escalation.retarget_team===true`;
  `escalation.is_escalation_confirmation===true`; `message_type==='request_for_help'`;
  `selection_context` null/absent; `last_result_set` empty/absent; `member_pick_context===false`.
- **Rows 7, 8, 9:** `member_pick_context !== true`; `escalation` NOT set to a member reprompt
  (`member_reprompt` absent); `domain_hint`/`message_type` reflect the real query; NO `retarget_team`.
- **Row 8 (Bug-2 guard):** additionally assert NO `member_reprompt:'out_of_range'` and NO `correction:true`.
- **Row 10:** `escalation.member_reprompt==='out_of_range'`; `correction===true`; `member_pick_context===true`.
- **Row 11 (access-level, §10.8 regression):** `message_type !== 'request_for_help'`; `access_levels` set to
  the named level; `routing.suggested_team` NOT a retargeted team (no `retarget_team`, no `warehouse`-style
  team swap); `escalation.escalation_declined` absent; correct no-access/ask-access downstream branch taken;
  `$('Basic LLM Chain').isExecuted` **equals the pre-refactor value** (expected `false`). No misroute to
  `If2` escalate.
- **Row 12 (suggest_offer, §10.8 regression):** `message_type !== 'request_for_help'`;
  `escalation.escalation_declined` absent; `escalation.member_reprompt` absent; the re-query fired in the
  retained `domain_hint` (get-results reached, READ-allowlist tool only — S4); NOT `If2` escalate, NOT the
  decline branch. `Basic LLM Chain.isExecuted` = pre-refactor (expected `false`).
- **Row 13 (non-escalation confirm, §10.8 regression — if applicable):** `message_type` content-derived
  (`confirmation`); the pending confirm resolves as pre-refactor; NOT `If2` escalate, NOT decline;
  `Basic LLM Chain.isExecuted` = pre-refactor. If N/A, record so.

### §0 safety binding for rows 11–13 (S1–S6 hold on every one)
All three run on the guarded clone. **S1** every reply a blocked `would_send`. **S2** (focus row 11) — an
access grant/record must NEVER assign a conversation or write a PIC/SLA row; NONE of `Assign or unassign a
Conversation1` / `conversation-sla-tracking-create` / PIC-comment subs execute. **S3** any session write
(access_levels, re-query state) blocked → `would_write`; no prod `save-session-vars` PUT, no contact
custom-field mutation. **S4** (focus row 12) get-results reached only on the re-query; resolved `tool` in the
READ allowlist, never a create/ticket tool. **S5** `is_test===true` in the fork + every invoked sub. **S6**
token sink bounded to `parser` (only the fork's own LLM runs). Any real egress = hard FAIL + halt.

## Regression rows that MUST NOT break (shipped behavior)
- **Number pick** (row 1) — from `output-exchange-axis-and-memberpick-fix` (SHIPPED) + `order-member-pick`.
- **Name pick** (row 2) — from `order-member-pick-name-resolve` (SHIPPED). Expected = resolve-to-Nur **or**
  safe new-query abandon; a resolve to the WRONG member is a hard fail (LESSON 39, run/seed-sensitive).
- **Bug-2 digit-mining guard** (row 8) — `SRTKT72SS` must NOT be treated as a member pick via mined digits.

## §10 follow-on assertions (Gap A survive-decline + Gap B deterministic decline)
Ties to plan §10 / verification V6–V9. Run rows 4 and 5 on the REAL fork (OMIT `mock_reformulator_output`)
after parts 1–3 are applied to fork `CpxE8LroLzCkrAQN` + clone `txiPzSxy3Pclsz6v`.
- **V6 / row 4 (Gap B):** final reply EXACTLY `"Escalation declined."`; `Basic LLM Chain` NOT executed;
  `tag-escalation-declined` + `escalate-catalog`(kind=`escalation_declined`) executed; no assign/SLA/PIC egress.
- **V7 / row 5 (Gap A):** real fork emits `message_type==='request_for_help'` + `is_affirmative===false` +
  `routing.suggested_team==='warehouse'`; Tier-1 retarget → same final state as row 6 (`retarget_team===true`,
  `suggested_team==='warehouse'`, `selection_context` cleared). This row previously FAILED (parser said
  `casual`); it now PASSES.
- **V8 (clarify intact):** the separate genuine-clarify guard turn reaches `Basic LLM Chain`
  (`isExecuted===true`).
- **V9 (zero-egress on decline):** row 4 produces only a `would_send` for "Escalation declined."; NONE of
  `Call 'sub-human-intervention'` / `Assign or unassign a Conversation1` / SLA POST / PIC comment executed.

## §V0 — offline unit (cheapest, 0-token; run FIRST)
For each row, feed a synthetic `output.output` (with `message_type`, `domain_hint`, `is_affirmative`,
`person_mention`, `routing.suggested_team`, `entities` set as the real LLM would emit for that reply) + the §7
member_offer `previous_conversation_state`, and assert the row's structural expectation above. Specifically
proves, with no LLM cost:
- **`_pm` fix:** a worded non-name reply ("no thanks", "yes") no longer enters the `_pm.trim()` arm → reaches
  the affirmative arms (rows 3, 4).
- **retarget:** `request_for_help` + team `warehouse` ≠ `customer_service` → retarget fires (rows 5, 6); a
  `request_for_help` + team `customer_service` (== prior) does NOT retarget (falls to affirmative — guards
  against over-firing).
- **`_isNewQuery` broaden:** `domain_hint` set with NO current-message entity ("show me all promotions") →
  abandons (row 7); `clarification` with no domain ("what can you do") → abandons (row 9).
- **ordering caveat:** `_llmTeamRaw` captured before line 442 (else retarget reads the derived/prior team and
  never fires) — assert retarget still fires when `deriveRouting` would have produced a different/null team.
- **Edit 1 ternary:** a non-help turn (row 7) does NOT poison `suggested_team` to `false` (the `&&`-vs-`??`
  bug) — `routing.suggested_team` is the derived promotion team, not `false`.

## Acceptance
All 10 rows pass functional + §0 S1–S6; §V0 green; the three shipped regressions unbroken; retarget honors the
real LLM team; affirmative arms reachable; new queries answered. **§10 follow-on:** row 4 renders the FIXED
`"Escalation declined."` with `Basic LLM Chain` NOT invoked (V6); row 5 now retargets to warehouse (V7, was a
FAIL); the genuine-clarify guard still reaches `Basic LLM Chain` (V8); decline stays zero-egress (V9). Any real
egress → hard FAIL + halt.

**§10.8 refactor acceptance (headline):** **no message_type/routing regression on non-escalation
closed-answer replies (access-level [row 11], suggest_offer [row 12], picks/confirms [rows 1/2/3/13]) vs
pre-refactor behavior** — same branch, same `Basic LLM Chain` invocation, same routing. Additionally: row 5
now emits `request_for_help` + `is_affirmative:false` + `suggested_team:warehouse` **simultaneously**
(orthogonal signals, V10) and retargets; row 4 still renders the deterministic `"Escalation declined."` with
`Basic LLM Chain` NOT invoked (V12). The removed §10.2 L147 clause is NOT promoted; edits A–D promote to live
sub `XTODTw-dJcV0uRdC056hG` › `AI Agent` systemMessage (user-gated).
