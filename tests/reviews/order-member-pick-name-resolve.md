# Review — `order-member-pick-name-resolve` (CS-member pick by NAME)

**Reviewer:** sorento-reviewer · **Date:** 2026-06-30
**Verdict:** ✅ **APPROVE** — zero-egress re-confirmed from run logs; deltas correct & guard-free; promotion-ready.
**Promotion:** user-gated (this sign-off authorizes it; reviewer does not promote).

Inputs reviewed: plan `plans/order-member-pick-name-resolve.md`, UAC `tests/UAC.md` §15 (15a–15k),
coder diff `tests/diffs/order-member-pick-name-resolve.md`, tester run
`tests/runs/uac15-member-name-resolve-20260630.json`. All re-verified against the LIVE n8n via MCP
(not the diff doc alone).

---

## 1. Correctness — Δ-prompt + Δ-code vs plan (verified on CpxE8, not just the diff)

Pulled both node bodies from CpxE8LroLzCkrAQN and live XTODTw via MCP and byte-diffed them.

**Version state (re-verified now):**
- LIVE `XTODTw-dJcV0uRdC056hG`: `versionId == activeVersionId == 827ad59f-…` — **has NOT moved** since build
  time. Rebase base still valid; no re-baseline needed.
- Live `AI Agent.systemMessage` sha256 = `eb382bcd4985c4d7…` — matches the plan's stated baseline exactly.
- Dev fork `CpxE8LroLzCkrAQN`: `versionId == activeVersionId == e3ac3817-…` — **published, no stale draft**
  (LESSON 24/37 satisfied; the clone sees the intended version).

**Δ-prompt (`AI Agent.systemMessage`) — pure addition, confirmed by `diff`:**
- +13-line `== PERSON-NAME MENTION ==` section inserted after `== POSITIONAL REFERENCES ==`, before
  `== IS_ACTIVE FILTER ==`. Byte-for-byte the plan §3.1 text.
- +1 line `"person_mention": "string_or_null …"` in the OUTPUT block after `"reference_positions": [],`
  (plan §3.2 — mandatory given the "exactly these keys" rule).
- **No other change** to the 23.7k-char prompt. POSITIONAL REFERENCES / numeric behaviour untouched.

**Δ-code (`output_exchange.jsCode`) — pure addition, confirmed by `diff` + structural read:**
- +4 decl lines (`_pm`, `_normName`) after `const _pos = _extract(...)` — in scope for the new arm.
- +20-line `else if (_pm.trim()) { … }` arm, correctly placed **inside `if (!_isNewQuery)`** (block opens at
  the `_isNewQuery` line, closes after `member_pick_context = true`), **after** the three numeric `_pos`
  branches and **before** `else if (is_affirmative === true)` — a named pick outranks a stray affirmative,
  exactly per plan §4.
- Tiered match (exact → token-overlap → substring), dedupe-by-idx; 1→`preferred_assignee_id`,
  >1→`member_reprompt:'multi'`+`correction`, 0→`member_reprompt:'out_of_range'`+`correction`. Single-pick
  shape is byte-identical to the numeric single-pick arm (`{is_escalation_confirmation:true,
  preferred_assignee_id}`, `entities:[]`).
- **`_isNewQuery` gate preserved** (the wrong-resolve protection, plan §4.1).
- The `_extract` numeric path, round-robin, and decline branches are **byte-identical to live**.
- `node --check` on the wrapped jsCode → **SYNTAX OK**.

**Behaviour confirmed live in run logs (not just asserted by tester):**
- 15a "Ms Tan" → `person_mention:"Ms Tan"`, `domain_hint:null` ⇒ `_isNewQuery` false ⇒ arm fired ⇒
  `escalation:{is_escalation_confirmation:true, preferred_assignee_id:"u-tan"}`, `entities:[]`,
  `member_pick_context:true`. Correct.
- 15k "any orders for Tan" → `person_mention:"Tan"` WAS emitted (always-extract works), but
  `domain_hint:"order"` + a `current_message` customer entity ⇒ `_isNewQuery=true` ⇒ Δ3 block skipped ⇒
  `escalation:{is_escalation_confirmation:false}`, **no `preferred_assignee_id`**. The hard wrong-assign
  protection works exactly as designed.

**Minor (non-blocking) observation:** the fork's `output_exchange.jsCode` ends with a trailing newline; live
ends without one (1-byte EOF difference, functionally inert in JS). The byte-exact promotion will therefore add
one trailing `\n`. Not a defect — just note it at the sha-gate so it isn't mistaken for drift.

**Theoretical edge (not a blocker, no test/prod impact):** in the substring tier `_q.includes(r.ln)` would be
`true` for any `r.ln === ''`. A `last_result_set` label can only normalize to `''` if it is a bare honorific
("Ms"); real CS-member labels are names, and even if it ever fired it would tend to produce a >1 match ⇒
`'multi'` reprompt (never a wrong auto-pick). `_q` itself can never be empty when `_pm.trim()` is truthy
(`.trim()` precedes the honorific regex, which requires a trailing space). Safe by construction.

## 2. Zero-egress re-confirmation (S1–S6, all 11 cases) — verified from runData, not the summary

I pulled the authoritative `get_execution(includeData)` runData for the safety-critical executions rather than
trusting the egress list:

- **Human-intervention sub guard topology (vUfFUDjLAuMaeQE6):** `When Executed…` → `test-guard`
  (`IF is_test === true`). TRUE branch (output 0) → `test-guard-record` (redis would_write log). FALSE branch
  (output 1) holds the **entire** real path: `get-round-robin-assignee` (POST) → `Assign or unassign a
  Conversation1` → `conversation-sla-tracking-create` (SLA POST) → `Call 'sub-add-comment-respond'`/`'1`
  (PIC comments) → assignee-queue `Redis` push → PIC sendmsg subs. The clone hardcodes `is_test=true`, so the
  real path is structurally not taken.
- **15a resolve sub-exec 7075630:** only 3 nodes ran (`When Executed…` → `test-guard` → `test-guard-record`),
  `lastNodeExecuted: test-guard-record`, FALSE branch `[]`, 21 ms total. Input carried the resolved
  `explicit_assignee_id:"u-tan"` but it **never reached the assign node**. Every real egress node absent.
- **15f ambiguity sub-exec 7076122:** same 3-node short-circuit; `explicit_assignee_id:""` (multi reprompt).
- **15k (highest wrong-assign risk):** escalation false ⇒ **no human-intervention sub invoked at all**;
  get-results was a READ only.
- **S1 (send):** sendmsg sub `aoydkG1dbItXR5jXFEQsP` short-circuited every case; `send-message-files/images/
  video` absent from clone runData; 15j file attachment recorded via `guard-g-record` (would_send), real send
  node absent. No `api.respond.io` POST.
- **S2 (assign/SLA/comment/queue):** none executed on any case (see above). PASS.
- **S3 (session):** all session I/O on `n8n_test.respond_contacts_test`; prod `save-session-vars`
  (conversation-variables PUT) orphaned → `guard-d-record` would_write only; `update-human-intervened`
  orphaned/absent. No prod CRM write.
- **S4 (get-results):** ran only on 15c/15e/15j/15k, all READ tools (order/incoming list), `has_result`;
  never `crm_it_support_ticket_create` or any write tool.
- **S5:** trigger + every invoked sub received `is_test/test_mode=true`; `test_run_id` present per case.
- **S6:** parser tier — only reformulator gpt-5.4-mini per turn (+ get-results read on read cases);
  `Basic LLM Chain` stayed dark; `person_mention` is the only new always-extracted field, additive within the
  same LLM call (no new token sink).

**Result: S1–S6 PASS on all 11 cases. Zero real egress. No HALT.**

## 3. Promotion-readiness

- **Promotion payload = business-logic delta only.** The two promoted bodies (`AI Agent.systemMessage`,
  `output_exchange.jsCode`) were grepped for `is_test|test_mode|mock|test_run|canary|test-guard|n8n_test` →
  **none**. Both deltas are guard-free. Promoting XTODTw introduces **no test-only artifacts** into live.
- **The human-intervention sub id discrepancy is irrelevant to THIS promotion.** Tester FINDING 4: the clone
  invokes `vUfFUDjLAuMaeQE6` (a clone-local guarded copy), not the live `rrYXzE61…` named in CLAUDE.md. That
  sub is **downstream** of the parser and **not part of this change** — the promotion touches XTODTw's
  systemMessage + jsCode only. `vUfFUDjLAuMaeQE6` exists purely to make the test fail-closed; it does not get
  promoted and the live spine already wires the real (live) human-intervention sub. The parser delta only
  *produces* `escalation.preferred_assignee_id`; the live downstream sub consumes it unchanged. No guard
  scaffolding crosses into live. (The clone's `test-guard` short-circuit is what kept the test safe and is, by
  design, absent from live — that's correct.)
- **Reformulator's own `test-reformulator-bypass`/`mock-reformulator-output` nodes** are separate nodes (not
  the two promoted bodies) and already exist in live XTODTw — they are not changed and not part of the payload.

## 4. Functional outcome & the accepted decision

- **9 PASS, 2 safe misses, 0 hard-safety fails.** The §0 gate held everywhere.
- **15c "tan" / 15e "Wong" — SAFE MISS (accepted, user-confirmed, NOT a defect):** the real LLM classifies a
  bare clean surname that doubles as a customer name as a NEW customer-order query (`domain_hint:order` +
  `current_message` customer entity), so `_isNewQuery=true` and the resolution arm never fires → the offer is
  abandoned and re-run as a customer-order lookup. **No wrong member resolve ever occurred.** This is plan §5's
  residual tension landing on the safe (false-abandon) side. The *same* `_isNewQuery` mechanism is exactly what
  makes 15k safe (no wrong assign) — tightening it to catch 15c/15e would risk the dangerous wrong-resolve edge.
  Honorific (15a/15b), substring-typo (15d), numeric (15h), affirmative/round-robin (15i), no-person new query
  (15j), and the ambiguity gate (15f → 'multi', never single-picks) all behave per UAC.
- **Golden handling (plan §7):** `person_mention` is additive on every parser output (null on 15h/15i/15j).
  Register **ignored-when-null / flagged-when-non-null** (NOT a blanket ignore — LESSON 21). §15a–k have no
  historical golden → capture these execs as the new golden for member_offer name-reply turns.

## 5. LESSON pitfalls — clear

- LESSON 24/37 (publish/draft): CpxE8 `versionId==activeVersionId` (published, no stale draft). ✓
- LESSON 25 (byte-exact, sha-gated): see checklist below; promote by sourcing the validated strings, not retyping. ✓
- Version drift: live 827ad59f unchanged; fork e3ac3817 as tester recorded. ✓
- LESSON 3 (lossy create-from-code): coder used in-place `setNodeParameter`, not regeneration. ✓

---

## PROMOTE CHECKLIST — LIVE `XTODTw-dJcV0uRdC056hG` (user-gated; do NOT edit live mid-cycle)

1. **Base + backup.** Confirm live `XTODTw` is still `versionId == activeVersionId == 827ad59f-3932-4adc-94f5-
   08f235a6b8c0` immediately before promoting (re-check; abort if it moved → re-review). Back up the prior
   versionId + the two node bodies (`AI Agent.systemMessage`, `output_exchange.jsCode`) to
   `tests/reviews/backups/PROMOTE-member-name-resolve-20260630/` first.
2. **Copy the BUSINESS-LOGIC delta only, byte-exact, from the validated fork CpxE8LroLzCkrAQN** (the published
   e3ac3817 bodies) — do NOT hand-retype (LESSON 25). Two edits, both `setNodeParameter`:
   - `AI Agent` `/options/systemMessage` ← fork body (target sha256 `1ad6a6842a55e5da…`).
   - `output_exchange` `/jsCode` ← fork body (target sha256 `cf75fc3186… `; note it carries one trailing
     newline live currently lacks — expected, not drift).
3. **No guards to strip.** Both bodies are already guard-free (verified — no is_test/mock/test_run tokens).
   Do NOT touch the live human-intervention sub `rrYXzE61…` or any other node — this promotion is the two
   reformulator bodies only.
4. **sha-gate.** Verify the live DRAFT's two node shas == the fork's intended shas **BEFORE** publish; verify
   the ACTIVE shas **AFTER** publish; auto-revert (`publish_workflow` the backed-up prior versionId) on any
   mismatch (LESSON 25).
5. **Publish.** `publish_workflow XTODTw-dJcV0uRdC056hG` — confirm the draft == intended state first (no
   unrelated stale-draft hunks; LESSON 24). Re-point the clone away from CpxE8 back to live XTODTw if/when the
   test fork is retired.
6. **Golden.** Register `person_mention` as ignored-when-null / flagged-when-non-null; capture §15a–k as the
   new golden for member_offer name-reply turns (plan §7).
