# Review — `brand-company-routing` (n8n half) · 2026-08-17

Inputs: plan `plans/brand-company-routing-plan.md` (rev-2), UAC `tests/brand-company-routing-UAC.md`, node-diff
`tests/diffs/brand-company-routing.md` (+ byte-exact bodies in `tests/diffs/brand-company-routing/`), tester rollup
`tests/runs/brand-company-routing-rollup-20260817.md` (+ per-case JSON, rev-2 section).

> Process note: this review was performed by the planner seat inline (usage-limit checkpoint; no subagent) — a deviation
> from the named-executor discipline. It is a full read of the diff bodies + evidence, not a rubber stamp; the captain may
> request an independent `sorento-reviewer` pass before promotion.

## Verdict: **APPROVE** (clone build; promotion remains captain-gated)

### 1. Correctness vs plan §3 / captain additions
- (1) `get-cs-members` now carries `brand_code` + `company_id` from `cs-roster-plan` ← `disallowed-entity-gate.routing_companies` — the SAME computed state `compile-current-state` persists and `escalation-context` later sends to `sub-human-intervention` → `next-assignee`. B7 roster parity proves pool identity (Sorento+mocha 6/6, Mocha 3/3, exact ids and order).
- (2) Company is the primary axis: `routing_companies[].company_id` drives one roster call per company; the picked member's `company_id` (from `cs_last_result_set` row) is what the assignment call receives (B3rev2-a/-b). Single-company `routing_company` reaches the bare-"yes" path (B4).
- (3) Multi-company: two calls (B2: Mocha, Sorento+mocha), grouped + labelled reply with the explanation sentence naming both companies, continuous numbering; single-company reply byte-identical shape (B1, B9c). Deviation-1 (Mocha entry brand null rather than inheriting `mocha`) is correct — the Mocha copy has no brand row; borrowing another company's brand would narrow the wrong pool.
- Rev-2 fix (picked member brand = the row's own `brand_code`, null stays null) closes the only pool-mismatch found in rev-1 (B3rev2-a: Mocha member → `brand_code:null`; B3rev2-b: Sorento member → `mocha`).
- Report §5.2 items all present: parser fork base `marketing_promotion` + legacy normaliser (P1 real-parser PASS; A4 gate: base set exists in Sorento, 3 members), HI fork inputs/bodies/`test-guard-record` payload, ccs persistence + same-team carry, `escalation-context` guard (B6b: no stale leak on a non-resolving domain switch), replay `norm()` ignore-when-null rule (R1 static).

### 2. Zero-egress safety (§0 S1–S6) — re-confirmed from the tester's evidence
- All 17 + 6 (rev-2) clone executions: sendmsg TEST fork terminal at guard-record; HI fork nodes = trigger/chat?/test-guard/test-guard-record only, `get-round-robin-assignee` never executed; orphaned prod PUT/UPDATE_CONTACT absent; get-results read tools only; session persisted only to `n8n_test.respond_contacts_test`; deterministic turns 0-token; live `9qVyfUxmRQqrpGRMDLRuz` / `XTODTw…` / `rrYXzE61…` unexecuted and versionIds unchanged. `zz-roster-probe` = GET only; `next-assignee` never called.
- Guard topology of the HI fork unchanged (`test-guard` still upstream of every write); the spine clone's orphaned egress nodes still 0-inbound (coder node-set diff). New nodes are pure Code + one read HTTP param change.
- `onError: continueRegularOutput` on `get-cs-members`: turns a roster 404 into an empty-roster fallback (plain offer) instead of a dead turn — safe (read node), and strictly better for the multi-company case. Flagged for promote awareness only.

### 3. Findings (non-blocking)
- F1 B6 UAC wording was corrected in-branch: a same-product re-resolve legitimately refreshes the company (plan §3.5); the guard is proven by B6b.
- F2 B9 UAC trigger example corrected (`tag-not-supported` never sets `is_escalate_offer`).
- F3 Doc drift for CLAUDE.md/AGENTS.md: clone sub wiring (parser `wI5RkNGW3EOJfBdo`, HI `vUfFUDjLAuMaeQE6`, get-results `t4QvrtrPnTwRU6br`, sendmsg `aQUmwMVplmNcyUVc`, save-msg `tWm5DYLxfypmVC1T`); `Call 'sub-respond-save-message-redis'2` on today's clone is not orphaned (TEST sink only). Not part of this change; noted in AGENTS.md pass.
- F4 Live `disallowed-entity-gate` #9 still builds cosmetic `company_team = marketing_promotion_<brand>` for the offer text; harmless with the base key. Out of scope.
- F5 R1 sample replay not run (static rule verification only) — acceptable for a deterministic-scope change whose new keys are null on every non-CS turn (verified on B6b-t2/B9c/P1); a full replay is a promote-time nicety, not a gate.
- F6 Assumption A2 (bare "yes" after a multi-company offer → `company_id:null`, CRM resolves via contact/default) is a product choice the captain may want to revisit (alternative: re-prompt for a company). Implemented per plan.

### 4. Promote checklist (captain-gated — NOT executed; Lessons 24/25/37)
P0 Backups first: capture live versionIds + the bodies of every target node (`tests/backups/brand-company-routing/LIVE-*` already holds today's rebase sources; refresh before promote).
P1 Parser: live `XTODTw-dJcV0uRdC056hG` › `output_exchange.jsCode` ← `tests/diffs/brand-company-routing/parser-fork-output_exchange.js` (sha `3ee5b658…7eed`; the fork body was rebased on live `67a73561…e2017` — re-verify live sha unchanged first), `AI Agent` systemMessage ← `…/parser-fork-AI-Agent.systemMessage.txt` (`583bcfb0…45f37`; from `0555a9e8…19246`). Draft-sha gate → publish → active-sha gate → auto-revert on mismatch.
P2 HI: live `rrYXzE61gCNUck_zmXe-G`: trigger +`brand_code`,`company_id`; `get-round-robin-assignee` + `conversation-sla-tracking-create` jsonBody per diff doc §2 (**keep live's tracking URL** `…/conversation-sla-tracking`, not the fork's `/integration`); no `test-guard`/`chat?` nodes on live. Publish.
P3 Spine `9qVyfUxmRQqrpGRMDLRuz` (one atomic `update_workflow`): `disallowed-entity-gate` (`5928ae64-…`) jsCode ← `spine-disallowed-entity-gate.js` ONLY IF live sha still `8e1b5470…9b76b`, else re-apply the §3.1 hunk after `out.resolved_companies = _brands;`; add `cs-roster-plan` + rewire `cs-offer-gate[0]→cs-roster-plan→get-cs-members`; `get-cs-members` (`ff5f651e-…`) url/fullResponse/onError; `build-cs-member-offer` whole body; `compile-current-state` — live body differs from the clone (promo-picker S4) → apply the §3.5 hunk before `return output;` (anchor `if (_dymLastResultSet) …` present once), NOT the clone body; add `escalation-context` + rewire `divert-suggest-yes[1]→escalation-context→Call 'sub-human-intervention'` (keep `divert-suggest-yes[1]→tag-out-of-scope`); `Call 'sub-human-intervention'` +2 inputs (workflowId stays live HI). Publish; verify `versionId==activeVersionId`.
P4 Replay `aROEBlQyyoQaB7a1` norm rule (already applied to the shared orchestrator draft; no publish needed).
P5 Post-promote watch: first real CS escalation → `next-assignee` response `company_id`/`brand_code`/`team_set_code` echo matches the offer; revert trigger = any 404 "No team found … in company" on `next-assignee` (means a company lacks the `customer_service` set — admin config, not code).
