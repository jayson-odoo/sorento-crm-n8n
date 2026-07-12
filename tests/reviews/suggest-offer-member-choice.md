# Review — `suggest-offer-member-choice` (CS/order suggest_offer "yes" → member choice + button-trim)

**Verdict: APPROVE** (zero-egress re-confirmed). Promotion to live spine `9qVyfUxmRQqrpGRMDLRuz` is user-gated — this doc authorizes it, subject to the PROMOTE CHECKLIST below.

Reviewer: sorento-reviewer · 2026-07-06 · scope `deterministic` (one `parser`-scope V-A1 dependency check).
Sources reviewed: node-diff `tests/diffs/suggest-offer-member-choice.md`, deployed jsCode
`tests/runs/suggest-offer-member-choice-build-suggest-offer-deployed-20260706.js`, offline units
`tests/runs/suggest-offer-member-choice-offline-units-20260706.js`, run rollup
`tests/runs/suggest-offer-member-choice-rollup-20260706.json`, plan + UAC. Under test: clone
`txiPzSxy3Pclsz6v` activeVersionId `0369e6bd-e49e-4b20-84f1-e9e56778d1af` (105 nodes, +1). Fork
`CpxE8LroLzCkrAQN`, live sub `XTODTw-…`, live spine `9qVyfUxmRQqrpGRMDLRuz`: untouched.

---

## 1. Correctness vs plan/UAC — PASS

**Change A (divert IF + If2 rewire).** The new `divert-suggest-yes` IF (`173d3b9f-…`) sits on the `If2`-TRUE
seam. Its stored condition (node-diff A.1) is byte-identical to the offline `divert()` (offline-units
lines 114-119) and matches plan §2 exactly — all five clauses present, `suggest_pick_context===true` the
load-bearing discriminator. The discriminator is correct against every case in plan §1.4:
- suggest→yes: TRUE → member picker, no assign (case A, real IF node exercised, exec 7698985).
- member pick (`member_pick_context` + `preferred_assignee_id`): FALSE → guarded assign (B2 Sandy, Bnur Nur).
- warehouse retarget (`request_for_help`, team≠CS, no `suggest_pick_context`): FALSE → direct round-robin (case C).
- non-CS suggest→yes (team≠CS): FALSE → round-robin (case F).
- member-bare-yes (no `suggest_pick_context`): FALSE (offline V0b).

The `If2`-FALSE fan-out restored **both** original targets: `divert` output#1 → `Call 'sub-human-intervention'`
AND `tag-out-of-scope` (node-diff A.2, re-fetch confirmed). `If2` TRUE → `divert` only. `tag-escalate-offer`
is now fed by both its pre-existing `If10` source and `divert` — the pre-existing edge was not modified; each
turn only one path runs, no `$()`-ref breakage (LESSON 5 clear — nothing references
divert/tag-out-of-scope/tag-escalate-offer/human-intervention output).

**Change C (button-trim).** Deployed jsCode lines 187-190 confirm the trim is gated
`axis === 'date' && isCsOrder`. This sits in the **shared tail** after the `if (axis==='date'){text=…}
else {text=…}` block closes (line 182), so it governs BOTH D2-date and D2-non-date. The coder's deviation
(adding `axis === 'date' &&`, vs the plan's `isCsOrder`-only snippet) is **correct and required**: without
it a D2-non-date CS/order offer would be wrongly trimmed, violating plan §3 / UAC V0-d. Proven by offline
V0-d2 (D2-non-date CS/order KEEPS buttons). All controls pass: V0-a trims (dates only), V0-b/V0-c/V0-d/
V0-a-ctrl retain buttons. 16/16 offline PASS, run against the exact deployed 11329-byte jsCode.
`suggest_response` text and `suggest_last_result_set` unchanged → typed escalate/decline/date-pick still work.

**Change B: none** — `build-cs-member-offer` untouched (confirmed).

**Scope/tier correct.** `deterministic` throughout (mocks consumed, 0 LLM on A/B2/Bnur/C/E/F/G2). The two
bounded LLM exceptions are NOT from this change: D4's casual-path `Basic LLM Chain` (documented clarification
LLM, LESSON 22) and V-A1's single real-reformulator call (the designed one-off parser dependency check).

## 2. Zero-egress — RE-CONFIRMED, §0 S1–S6 hold on every case (A, B2, Bnur, C, D4, E, F, G2, V-A1)

- **S1** — every send intercepted by the guarded sendmsg sub `aoydkG1dbItXR5jXFEQsP` (short-circuit at
  test-guard-record, verified case A exec 7698988); no `api.respond.io/.../message` POST; send-message-files/
  images/video absent in all runs.
- **S2 (the focus of this change)** — divert-TRUE (case A) does NOT call human-intervention → **no assign
  this turn**. Every divert-FALSE assign (B2/Bnur/C/F/V-A1) hit the guarded human-intervention fork
  `vUfFUDjLAuMaeQE6`, which ran ONLY `When-Executed → test-guard → test-guard-record` and returned before
  `get-round-robin-assignee`. NONE of get-round-robin / `Assign or unassign a Conversation1` /
  `conversation-sla-tracking-create` / `Call 'sub-add-comment-respond'` / assignee-queue Redis push executed.
  The `test-guard-record` `would_write` payload is the blocked egress record.
- **S3** — prod `save-session-vars` PUT + `update-human-intervened` absent (orphaned) in all runs; session
  writes went to `pg-upsert-session → n8n_test.respond_contacts_test` (regress-capture), never prod.
- **S4** — get-results never ran a write tool; resolve-entity / get-cs-members / check-access are READs; no
  `crm_it_support_ticket_create`.
- **S5** — `is_test=true` + `test_run_id` threaded into every invoked sub (reformulator fork, sendmsg sub,
  human-intervention fork).
- **S6** — deterministic cases 0 LLM; the two bounded LLM sinks documented above, neither new nor from this change.

No structural egress node was altered: the divert only re-parents the two original TRUE targets behind an IF;
both branches terminate in the same guarded paths as before. No new unguarded egress node became reachable.

## 3. Regressions — all covered

Member pick assigns (B2/Bnur, guarded), warehouse retarget direct-assigns (C, not swallowed), non-CS suggest
unchanged (F, round-robin not member_offer), fresh escalate_offer member_offer intact (G2 — If2-FALSE path,
never traverses the divert seam, byte-consistent with case A's member builder), date-pick re-query intact
(E, If2-FALSE re-query), "no thanks" → safe casual ack (D4, per plan §5 premise-correction — not the
"Escalation declined." literal, which is member_offer-only; correct).

## 4. Adjudication of the tester's flags — NONE block

- **(a) mock-nesting harness gotcha** — TEST ARTIFACT, non-blocking. The first A attempt double-nested
  `mock_reformulator_output` as `{output:{…}}` (the bypass sets `.json.output = mock` directly, so the mock
  must be the inner object), which misrouted to a no-access send — itself still guarded by the sendmsg sub.
  A harness-injection contract, not a spine behavior; corrected shape used for all reported cases. No product impact.
- **(b) V-A1 `suggest_pick_context` liveness proven indirectly** — ACCEPTED as sufficient; a direct live
  suggest_offer(date)→yes real-reformulator run is **recommended as a post-promote smoke, NOT a promotion
  blocker.** Rationale: (i) the fork `CpxE8LroLzCkrAQN` is **untouched** by this change and its
  `suggest-follow-up` source statically emits, in the SAME `is_affirmative===true` block,
  `escalation={is_escalation_confirmation:true}` + `entities=[]` + `suggest_pick_context=true` — the trio's
  co-occurrence is a code fact, not an inference; (ii) prior s17 (suggest-offer-uuid-label) directly observed
  the LLM setting `suggest_pick_context=true`; (iii) V-A1 confirmed the reformulator is live and emits the
  pick-context family (member_pick_context in its member_offer context); (iv) case A + offline V0b prove the
  full downstream + discriminator on that shape. Decisively: **if the signal were ever absent, the divert
  degrades FAIL-SAFE to today's round-robin behavior** (FALSE branch = current prod), so this evidence gap
  cannot introduce a worse-than-today or unsafe outcome. The clean-context reproduction was blocked only by
  the documented session-fidelity gap (LESSON 19/31, no psql to seed), not by any defect.
- **(c) `.join` comma-stripping loose UAC literals** — non-blocking. The `.map(s => String(s).replace(/,/g,''))`
  is PRE-EXISTING code (all four button lists), not introduced here; it turns 'Yes, escalate'→'Yes escalate'.
  The load-bearing assertion (Yes/No buttons PRESENT vs ABSENT) is exact and verified; only element-boundary
  literals are loose. Consistent with the prior suggest-offer-uuid-label run.
- **(d) case-G did-you-mean-vs-escalate precedence** — non-blocking, PRE-EXISTING + orthogonal. The G attempt
  (SMC202606-9999) returned trgm candidates → D1 did-you-mean superseded the member list (buttons retained,
  consistent with V0-c — trim did not touch D1). G2 (0-candidate QWXZ990011) proved the true dead-end
  escalate_offer→member_offer path intact. The precedence is unrelated to this change.

## Minor note (non-blocking)
- **V-empty-roster** (plan §6) was not exercised end-to-end (case A roster returned 11). The empty-roster
  fallback lives in the UNCHANGED `build-cs-member-offer` and is the same chain a fresh escalate_offer already
  uses; the divert only routes INTO it. Safe either way (fallback = plain escalate + guarded round-robin).
  Include a quick empty-roster confirmation in post-promote smoke if convenient.

---

## PROMOTE CHECKLIST — user-gated, live spine `9qVyfUxmRQqrpGRMDLRuz`

This is **spine business-logic only — no test scaffold to strip** (all guards live inside the shared subs,
which are unchanged; the divert IF + button-trim are pure business logic). Do NOT touch the reformulator
(fork `CpxE8LroLzCkrAQN` / live `XTODTw-dJcV0uRdC056hG`) — no parser change ships. **Never edit live mid-cycle.**

0. **Backup first.** Capture live `9qVyfUxmRQqrpGRMDLRuz` current `versionId` + node bodies for
   `build-suggest-offer` and `If2` (+ its connections). Record the prior versionId for one-command revert
   (`publish_workflow` the prior versionId) per LESSON 25.
1. **⚠️ RE-CONFIRM the LIVE `If2`-TRUE fan-out BEFORE rewiring.** The clone's `If2` output#0 fanned to
   **`Call 'sub-human-intervention'` AND `tag-out-of-scope`**. Live may differ. Fetch live `If2`
   (id `ed6f8db9-…`) connections and confirm output#0 has exactly those two targets. If live differs, STOP
   and re-scope the rewire so the divert-FALSE branch restores **whatever live's TRUE targets actually are**,
   byte-for-byte. Do NOT assume the clone's fan-out.
2. **Add node `divert-suggest-yes`** (IF v2.3) on live with the exact condition from node-diff A.1 (source the
   expression string byte-exact — do not retype the `\'`-escaped node ref from memory).
3. **Rewire live `If2` (one atomic `update_workflow`, ≤100 ops):** removeConnection If2→human-intervention (idx0);
   removeConnection If2→tag-out-of-scope (idx0); addConnection If2→divert-suggest-yes (0→0);
   addConnection divert→tag-escalate-offer (0→0); addConnection divert→human-intervention (1→0);
   addConnection divert→tag-out-of-scope (1→0). (Adapt targets to whatever step 1 confirmed live actually has.)
   Confirm live has `tag-escalate-offer`, `escalate-catalog`, `cs-offer-gate`, `get-cs-members`,
   `build-cs-member-offer` present + unchanged before relying on the divert-TRUE chain.
4. **Trim `build-suggest-offer` (id `7972abd8-…`)** via `setNodeParameter /jsCode`, **byte-exact / sha-gated**
   (LESSON 25): source the exact deployed jsCode
   (`tests/runs/suggest-offer-member-choice-build-suggest-offer-deployed-20260706.js`, sha of intended edit
   `f1558d5a1397fd0af24698e66fd31b4751f16ca1cbb19ae64ecb80bc611aaac7`). The only intended delta vs live is the
   3-line region at lines 187-190 (`const isCsOrder = …; out.suggest_quick_reply = (axis === 'date' && isCsOrder
   ? [...values] : [...values, YES, NO])…`). **Diff live's current build-suggest-offer against the deployed
   body first** — if live's body differs elsewhere from the clone's pre-change body, re-derive the 3-line patch
   against LIVE rather than dropping the whole clone body in.
5. **sha-verify the draft BEFORE publish** (the changed nodes) and **AFTER publish** (active); auto-revert
   (`publish_workflow` prior versionId) on any mismatch. Confirm the draft == intended state before publishing
   (LESSON 24 revert-landmine — a stale live draft can undo a prior promotion). `publish_workflow` ships the
   WHOLE draft.
6. **Post-promote smoke (live, still zero-egress via the guarded subs):**
   - CS/order suggest(date)→"yes escalate": divert TRUE → member picker renders, **human-intervention NOT
     called** (no assign this turn). This is also the recommended direct real-reformulator confirmation of
     flag (b) — confirm the reformulator emits `suggest_pick_context=true` + `is_escalation_confirmation=true`
     + no `preferred_assignee_id` on a genuine suggest_offer(date) "yes".
   - member pick (number/name) → divert FALSE → assign fires (or its guarded equivalent in the smoke env).
   - warehouse retarget → divert FALSE → round-robin (not swallowed).
   - non-CS suggest→yes → divert FALSE → round-robin (not member_offer); its buttons retained.
   - CS/order date offer render → `suggest_quick_reply` = dates only; a D2-non-date CS/order + a D1 did-you-mean
     still show buttons.
   - (optional) empty CS roster on the divert path → graceful fallback, no crash.
