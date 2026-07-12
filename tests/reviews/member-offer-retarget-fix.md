# Review — member_offer retarget + deterministic reachable-decline (§1–§10.8, all follow-ups)

**Change-id:** `member-offer-retarget-fix`
**Reviewer:** sorento-reviewer · **Date:** 2026-07-06
**Verdict: APPROVE** (zero-egress re-confirmed; acceptance met; two non-blocking findings + one out-of-scope observation)

---

## Scope reviewed
The full interdependent change set on the build/test targets only:
- **Fork `CpxE8LroLzCkrAQN`** active `e10c539e-d346-4074-b3ba-56db98b5cf86` (REST-confirmed by me):
  - `AI Agent` systemMessage (sha `d8bfbf4b…`, published `1bee1ff5`): edits A–D (kill L137 skip-short-circuit; request_for_help on naming a team, orthogonal to is_affirmative; remove dead L147 clause; routing always evaluates suggested_team even while declining).
  - `output_exchange` (jsCode sha `f092f0e9…`): 4-tier member_offer gate (retarget/pick/new-query-abandon/junk), Edit-1 routing preference, `escalation_declined` decline arm, L444/L431 `!_reqHelp` decline guard, string-"null" coercion of domain_hint/intent_hint via `norm()`, hoisted single-source `_reqHelp`/`_llmTeam` capture above all message_type mutations.
- **Clone spine `txiPzSxy3Pclsz6v`** active `df13075e-0962-4b61-b4b5-510b614d50e8` (REST-confirmed): `is-escalation-declined` IF between If10[FALSE] and If9 → `tag-escalation-declined` → `escalate-catalog` `escalation_declined` case → "Escalation declined." → cs-offer-gate FALSE → compile-current-state → guarded send.

**Scope/tier `parser`** — matches what was tested (real rebased fork run e2e, `mock_reformulator_output` OMITTED per LESSON 28; part-3 spine exercised e2e alongside the real parser). Correct.

---

## 1. Correctness vs plan/UAC — COHERENT

The 3-part design (prompt orthogonality + code reconciliation + deterministic decline) is internally consistent and the iteration converged correctly:
- **Retarget honors the REAL LLM team, not a hardcoded warehouse.** Tier-1 sets `routing.suggested_team = _llmTeamN` (the captured raw LLM team). mor4 rows 5/6 → `hi_team = warehouse` end-to-end; the human-intervention Call input carries `team=warehouse` (not customer_service, not a literal). Confirmed.
- **Decline is deterministic.** Row 4 → `escalation_declined:true` → spine `is-escalation-declined[TRUE]` → `tag-escalation-declined` → `escalate-catalog(escalation_declined)` → final reply EXACTLY `"Escalation declined."`, `Basic LLM Chain` dark. mor4 2/2, mor3 1/1, mor2 1/1. gpt-4.1-mini clarification LLM never invoked on the decline path.
- **Skip-removal (edit A) has no collateral regression.** Rows 11 (access-level `"office version"`) and 12 (suggest_offer `"the 2nd one"`) are clean in mor2: row 11 → `message_type` NOT request_for_help, `access_levels` correct, no team-retarget, no misroute to If2; row 12 → positional pick + re-query in retained domain, not escalate/decline. Both match pre-refactor deterministic behavior, `Basic LLM Chain` dark. L181 access rule holds post-refactor.
- **String-"null" + hoisted-capture close the non-determinism.** This is the crux. mor3 caught the residual bug (LLM emits `domain_hint` as literal string `"null"` ~1/3 of samples → L444 truthy re-clobber → retarget dead → REQUEST-CHANGES was correctly issued). The final e10c539e fix adds (a) `norm()` coercion of the string `"null"`/`"undefined"`→null immediately after parse, and (b) a single hoisted `_reqHelp`/`_llmTeam` capture from the RAW pre-mutation message_type. mor4 proves closure two ways: 6/6 in-vivo PASS **and** an offline unit of the ACTIVE jsCode feeding `domain_hint ∈ {real null, "null", "undefined", "order", "promotion"}` → all 5 retarget=true. Either mechanism is independently sufficient; together airtight. The mor3 5a failure is provably neutralized.

## 2. Regressions — CLEAN
number pick (row1 → Sandy idx2 uuid `4dbed5e6`), name pick (row2 → Nur idx4 `642699bd` or safe non-resolve; never a WRONG member per LESSON 39), yes round-robin (row3 → `is_escalation_confirmation:true`, no `preferred_assignee_id`), no-thanks decline (row4), new-query abandon (rows 7/8/9 → offer abandoned, answered by normal processing; Bug-2 digit-mining guard on row8 `SRTKT72SS` holds — `72` not mined, no out_of_range/correction), junk reprompt (row10 → out_of_range re-offer). All PASS across mor2/mor3/mor4. **Genuine clarify still reaches Basic LLM Chain (V8):** mor-v8-clarify `"haha ok thanks"` → `is-escalation-declined[FALSE]` → If9[TRUE] → parser-bypass-gate → Basic LLM Chain EXECUTED (353 tokens). The new IF did not swallow the legitimate clarify path.

## 3. Zero-egress — RE-CONFIRMED, NO HALT
§0 S1–S6 held on **every** execution: mor4 (16), mor3 (8), mor2 (18), mor-v8 (1) = 43 executions inspected, all sub-execs walked.
- **S1** every reply a `blocked`/`would_send` via sendmsg sub `aoydkG1dbItXR5jXFEQsP` (is_test short-circuit); media send nodes never executed; no `api.respond.io/.../message` POST.
- **S2** human-intervention fork `vUfFUDjLAuMaeQE6` (the guarded fork the clone calls, per CLAUDE.md doc-drift note) ran ONLY `[When Executed by Another Workflow → test-guard → test-guard-record]` on every call — NONE of `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`, PIC-comment subs, `get-round-robin-assignee`, or the assignee-queue push executed. Each Call input carries `is_test=true`.
- **S3** prod `save-session-vars` PUT + `update-human-intervened` orphaned/absent → `would_write` only; session persisted to `n8n_test respond_contacts_test` (not prod CRM).
- **S4** get-results reached only on read rows (8/11/12); resolved `tool ∈ {crm_inventory_stock_balance_list, promotion read}` — READ allowlist, never `crm_it_support_ticket_create`.
- **S5** `is_test===true` on the fork + every invoked sub; scope=parser, mode=regress-capture.
- **S6** token sink bounded to parser (one fork LLM/row); clone Basic LLM Chain dark except the legitimate clarify exercises (row2-A no-resolve, V8) — LESSON 22, not a new sink.

**Live untouched (independently re-verified by me via REST):** live sub `XTODTw-dJcV0uRdC056hG` updatedAt 2026-07-05 (before this session) — untouched. Live spine `9qVyfUxmRQqrpGRMDLRuz` carries **zero** decline-branch nodes and zero `escalation_declined`/test-scaffold tokens — this change was **not** promoted. **No promotion happened.**

## 4. Open findings adjudicated
- **FINDING 4 (help request naming a domain → business_query via L444, answered not escalated) — NOT A BLOCKER.** `"I want to talk to someone about my order"` → raw request_for_help + domain_hint=order; pre-existing L444 clobbers message_type→business_query → If2 escalation gate FALSE → answered as an order enquiry. Routing is correct (LLM==derived==prior all `customer_service`; retarget correctly suppressed, same team), zero egress. This is **pre-existing L444 behavior, not introduced by this change**. Out-of-scope product nuance; flag for the user/planner to confirm intent, but it does not block promotion.
- **FINDING 3 (row 2 "Nur" person_mention non-determinism) — NOT A BLOCKER.** LLM sometimes emits `person_mention=null` → safe clarify; sometimes `"Nur"` → resolves idx4. Never a wrong-member resolve (LESSON 39). Pre-existing LLM extraction variance, orthogonal to this fix (which touches domain_hint + _reqHelp/_llmTeam only). Safe.
- **Version-label drift — RECONCILED.** mor2/mor3 cited spine `45f67ec0`; REST shows active `df13075e`. I confirmed the decline-branch nodes ARE present and correctly wired in the active `df13075e` (If10[FALSE]→is-escalation-declined; TRUE→tag-escalation-declined→escalate-catalog; FALSE→If9; **If9's only inbound is is-escalation-declined[FALSE]**; escalate-catalog has the `escalation_declined`/"Escalation declined." case) — and it is runtime-proven (mor4 row4 decline branch executed; V8 both IF arms exercised). The `45f67ec0` label was a stale/mislabel in the earlier reports; the promote target topology is sound.

## 5. Observation for the user (does NOT block this review)
Live spine `9qVyfUxmRQqrpGRMDLRuz` shows `updatedAt=2026-07-06T09:12Z` — today, and this change's fingerprints are absent (0 decline nodes/tokens), so it is NOT this promotion. Something else touched the live spine today. Before the backup-first promotion, confirm what that 09:12 edit was (unrelated workstream / activation toggle) so the pre-promotion backup captures the intended baseline.

---

## PROMOTE CHECKLIST (user-gated — do NOT auto-promote)

Promotion is user-gated. When authorized, ship as **ONE interdependent unit** (shipping a subset regresses row 5):

**A. Live sub `XTODTw-dJcV0uRdC056hG` (`sub-semantic-parser`) — two nodes, business-logic only:**
1. `AI Agent` `parameters.options.systemMessage` ← the "1bee1ff5" prompt (edits A–D), sha `d8bfbf4b…`. Byte-exact from the fork; NO test guards to strip (pure prompt).
2. `output_exchange` `parameters.jsCode` ← the full stack, sha `f092f0e9…` (L46 `norm` incl. `'null'`+`'undefined'`, L82 domain_hint/intent_hint coercion, L72-76 hoisted `_reqHelp`/`_llmTeam`, L431 `&& !_reqHelp` decline guard, L521 Tier-1 retarget, 4-tier gate, Edit-1 ternary). Byte-exact. **No test guards in this node** — it is pure parse; the `is_test` short-circuit lives in the shared subs, not here.
3. Promote 1+2 together (interdependent) and `publish_workflow XTODTw-dJcV0uRdC056hG` (LESSON 24/37 — publish the sub before the spine so the spine sees it).

**B. Live spine `9qVyfUxmRQqrpGRMDLRuz` — decline branch, 3 edits, NO guards to strip (pure logic):**
4. Add IF `is-escalation-declined` (leftValue `={{ $('Call 'sub-query-reformulator').first().json.output.escalation?.escalation_declined === true }}`); rewire the existing `If10[out1 FALSE]→If9` edge to `If10[out1]→is-escalation-declined`; `is-escalation-declined[TRUE]→tag-escalation-declined`, `[FALSE]→If9`.
5. Add Set `tag-escalation-declined` (`branch_kind="escalation_declined"`) → `escalate-catalog`.
6. Add the `escalation_declined` switch case to `escalate-catalog` (`response='Escalation declined.'`, `manualResponse=true`, `includeResponse=true`, `is_escalate_offer=false`).
   - **Note:** the live spine node IDs will differ from the clone; anchor by node NAME and re-verify `escalate-catalog` node id on live. After the edit, assert the ONLY inbound edge to live `If9` is `is-escalation-declined[FALSE]` (do not orphan the clarify path).

**Guards-stripped confirmation:** the test forks are `is_test`-guarded at the shared-sub layer (human-intervention/sendmsg), NOT inside the promoted nodes. The promoted diff carries **business logic only** — no `test_mode`/`is_test`/canary/test-guard scaffolding is present in either the systemMessage, the output_exchange jsCode, or the three spine nodes. (I verified live spine currently has zero such tokens.)

**Backup-first (LESSON 25):** before any write, capture prior `versionId` + the exact node bodies for XTODTw (`AI Agent` systemMessage + `output_exchange` jsCode) and the spine (If9/If10 connections + escalate-catalog jsCode). sha-verify each draft node BEFORE publish and each active node AFTER publish; auto-revert (`publish_workflow` prior versionId) on any mismatch. **Never edit live mid-cycle.**

**Post-promote smoke (on live, zero-egress harness — do NOT drive a real contact):** re-run the deterministic decline (row4 → "Escalation declined.", Basic LLM Chain dark) and the warehouse retarget (row5/6 → suggested_team=warehouse, retarget_team=true) against the guarded clone rebased on the promoted live sub, and re-assert §0 S1–S6. Confirm live sub `output_exchange`/`systemMessage` shas match the intended f092f0e9/d8bfbf4b post-publish.
