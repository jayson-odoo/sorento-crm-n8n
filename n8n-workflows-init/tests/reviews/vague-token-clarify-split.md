# Review — `vague-token-clarify-split`

Reviewer: sorento-reviewer · 2026-06-29 · **Verdict: APPROVE (conditioned on one hard pre-promote gate, G1)**
Inputs reviewed: plan, UAC §13, node-diff (incl. promotion transcription + revert lever), tester rollup,
both parser fixtures. Independent MCP reads: live reformulator `XTODTw-dJcV0uRdC056hG` + test copy
`SB8wEXKdpITfhYXA` (systemMessage + output_exchange), node sets, publish state. No workflow edited.

Bottom line: the change logic is correct, strictly additive/default-true, non-regressive on clear/omitted
tokens, and zero-egress holds on every run. The Change-1 prompt transcribes onto live byte-clean. Two items
are gated: a clean-session parser-tier e2e is a **hard gate before the live edit** (G1), and the reuse-arm
`confident` drop is **accept-and-document** (non-regressive; not blocking).

---

## Explicit rulings (tester's 1–5)

### 1. Reuse-arm `confident` drop (latent gap) — NOT promote-blocking. Accept-and-document.
Confirmed present in BOTH copies AND in live: `live output_exchange` line 162-164 builds `prior` from
`previous_conversation_state.entities.map(e => ({...e, current_message:false}))` and the `case 'reuse'`
(line 171-172) sets `finalEntities = prior`. `previous_conversation_state` carries no `confident`, so a
REUSED entity loses it. Verified independently in `live_oe.js`.

Why this does not block:
- Change-2's consumer filters on `?.confident === false`. A reuse-stripped entity has **no** `confident`
  key → `=== false` is false → it falls through to the **existing** escalate-offer ladder. That is exactly
  pre-change behaviour. The gap is a **missed improvement on a follow-up turn, never a regression.**
- The fresh path is unaffected: `live output_exchange` line 160 (`current = all.filter(current_message===true)`)
  + line 213 (`finalEntities = [...current, ...keptPrior]`) preserves `confident` verbatim — the same
  value-agnostic spread that preserved `confident:true` in 13b. Live's `_priorEnts0` reuse-fix (line 59-67)
  additionally promotes a reuse-tagged set to `replace_combine` when prior is empty (clean session, first
  turn) → a clean-session first vague mash always preserves `confident` and clarifies. The gap only bites a
  genuine reuse of an already-seen vague referent — by which point clarify has already fired once.

On the tester's recommended hardening (default `confident:true` on the reuse arm, NOT preserve-false):
agreed in principle and I verified it is **safe** — defaulting true on reuse is behaviourally identical to
the current absent-key default (both → escalate-offer), so it cannot spuriously suppress a legitimate
clarify and cannot loop (it never clarifies on reuse). It is therefore an **optional explicit-flag hygiene
tweak, not a fix** — it does not make reused vague mashes clarify. Making reused-vague actually clarify would
require persisting `confident` into session state, which the planner LOCKED out of scope (Change-3: no new
state). That is a **separate future change with its own plan**, not a hardening of this one. Do NOT
preserve-false on the reuse arm (it would risk re-clarifying already-resolved prior context). No coder rework
required for this change.

### 2. Masked parser-tier e2e — raw+deterministic is SUFFICIENT to approve; clean-session 13a e2e is a HARD pre-promote gate (G1).
Component evidence is strong and the fresh-mash clarify chain is proven transitively:
- **LLM emits `confident:false` on a mash:** proven (13a-parser sub-exec 6971041 AI Agent RAW output).
- **`output_exchange` preserves `confident` on the current-message path:** proven (13b: two `confident:true`
  entities survived to `resolve-entity`), and I verified live uses the identical preservation mechanism
  (`current = filter(current_message===true)` → spread into `finalEntities`), which is value-agnostic, so a
  `confident:false` fresh entity is preserved by the same code.
- **Consumer flips correctly given `confident:false`:** proven deterministically (13a-det: vague-clarify
  fired, `is_clarification=true`, `is_escalate_offer=false`, domain-labeled ask, no "escalate to" substring).

What was NEVER observed in a single live-parser run: a FRESH `confident:false` surviving `output_exchange`
into the clarify branch end-to-end (masked because dev contact 437264483's polluted prod session forced the
reuse path). The transitive argument is sound, but (a) it rests on reading code rather than observing the
composite, and (b) the live promotion target's `output_exchange` differs from the tested copy (reuse-fix,
member-pick guard, customer_order axis, DATE_FILTER_DOMAINS) — though I confirmed those deltas do not touch
the current-message preservation path. Given the fix is cheap, I require a **clean-session parser-tier 13a
run (fresh `confident:false` → clarify in ONE parser exec, no reuse) to be green before the live edit.** Use
a fresh dev contact or a uac-mode session sourced from `n8n_test.respond_contacts_test` instead of prod
(S3 forbids clearing the prod session). This is a tester re-run, not coder rework.

### 3. Zero-egress — RE-CONFIRMED independently from the rollup.
Every case (13a-parser, 13a-det, 13b, 13c, 13d, 13e, 13f T1/T2/T3-parser/T3-det) reports §0 S1–S6 PASS. From
the run logs: no `api.respond.io/.../message` POST; egress log shows `would_send`/`would_write` + `blocked`
only; no assignment/SLA/comment/assignee-queue/round-robin; no `save-session-vars` PUT; no
`update-human-intervened`. get-results tools resolved to READ allowlist only (`crm_order_management_orders_list`
13b, `crm_incoming_stock_list` 13d, product-list 13e), **never** `crm_it_support_ticket_create`. The
highest-risk escalation path was exercised deterministically (13f-T3-det, hi sub-exec 6972503): the
human-intervention sub ran ONLY `[When Executed by Another Workflow, test-guard, test-guard-record]` and
short-circuited before any Assign/SLA/comment/queue — S2 PASS. The change itself is egress-neutral: it edits
only message text + two booleans (`is_clarification`, `escalate_message`), adds/removes no node, and the
orphaned egress nodes remain orphaned. Confirmed zero egress.

### 4. Doc drift — flag for doc-fix; NO impact on promotion transcription.
- (a) plan §1/§8 say the deterministic bypass is `mock_parser_output` via the clone `parser-bypass-gate`;
  the **active** bypass is `item.mock_reformulator_output` consumed by the reformulator sub's
  `test-reformulator-bypass` (the `parser-bypass-gate`/`mock_parser_output` path feeds `Basic LLM Chain`).
  Tester corrected the harness; fixtures were injected via the correct field. **Promotion impact: none** —
  the bypass field is test-harness wiring, not a promoted artifact. The two promoted artifacts (systemMessage
  insertions; not-found jsCode block) reference neither. Fix the plan text for accuracy.
- (b) CLAUDE.md lists human-intervention `rrYXzE61gCNUck_zmXe-G`; the clone actually calls guarded TEST copy
  `vUfFUDjLAuMaeQE6` (dedicated top test-guard, confirmed short-circuiting in 13f-T3-det). **Safer, not a
  problem.** Fix CLAUDE.md / docs for accuracy. Not promoted.

### 5. Staleness / byte-identical anchors — VERIFIED. Core promotion-safety claim CONFIRMED.
Both reformulators are published (`versionId==activeVersionId`; live `292faed2…`, test `177a0c71…`) and have
identical node sets. Full `diff` of the two AI-Agent systemMessages shows ONLY:
- the two Change-1 insertions (TEST only): Insertion A appends `, "confident": true|false` to the entity
  contract line; Insertion B adds the `== ENTITY CONFIDENCE ==` section;
- pre-existing staleness, both **outside** the insertion region: separator-box width (lines 10/12) and a more
  verbose `== DATE FILTER ==` body (live 258-270 vs test 275-276).

The Insertion A/B anchors are **byte-identical in live**: the entity-contract line (`Each entity: { "raw"…
"current_message": … previous context }`) and the following `Also emit ONE entity_op…` line both match
byte-for-byte, and live has **zero** existing `confident` occurrences (no collision). So the identical
additive text transcribes cleanly onto live with no conflict. I additionally verified the un-promoted
dependency — live `output_exchange` preserves `confident` on the current-message path (lines 160/213) — so
the prompt change actually takes effect in live. Claim holds.

---

## Also assessed
- **Change-2 default-true on clear/omitted tokens — no regression.** The filter is `=== false`; a
  `confident:true` or absent-key token yields empty `vagueUnresolved` → the existing `require_specific`
  ladder (Fix-B preserved) runs byte-identical. Proven by 13c (clear code → escalate unchanged), 13d
  (resolved-but-0-rows Aggregate1 re-entry, `unresolved` empty → ladder unchanged), 13e (resolved multi-word
  → not-found never ran). The full-corpus regression will reconfirm.
- **Regression: GREENLIGHT in parallel.** Nothing here blocks it. The reuse-arm documentation decision is
  independent of the replay. Two notes for whoever runs it: (i) the diff allowlist must treat `confident` as
  an additive entity key for BOTH values — `true` on current-message turns AND `false` on mash turns (golden
  predates the key); reuse-path turns keep entities byte-identical (no key), which is clean. (ii) Attribute
  every escalate-offer→clarify flip to a `confident:false` current-message unresolved token; any other diff
  on an all-`confident:true`/no-unresolved turn = HARD FAIL per plan §7.2.

---

## PROMOTE CHECKLIST (user-gated; do NOT promote — this only authorizes it)

**Pre-promote gates (must be green before any live edit):**
- [x] **G1 (HARD): GREEN — closed 2026-06-29 by sorento-tester** (run `tests/runs/vts-13a-clean-20260629.json`).
      clean-session parser-tier 13a e2e — fresh `confident:false` mash → clarify in ONE parser exec, no reuse.
      Mechanism: mode=`regress-capture` so session sourced from `n8n_test.respond_contacts_test` (reset to clean
      `{"variables":{}}`, prod session NEVER read/written — option (a) redis-injection proven structurally
      ineffective since the reformulator reads `previous_conversation_state` from the session read, not the item).
      Clone exec `6977978`, reformulator sub-exec `6977980`. AI Agent RAW emitted
      `entity_op:replace_combine` + entity `{current_message:true, confident:false}` (genuine fresh-turn emission;
      `output_exchange` preserved `confident:false`). resolve-entity (real, 888ms) → `unresolved_tokens=['one siew
      srtkt72ss']` → If3 TRUE → `is_clarification=true`, `is_escalate_offer=false`, NO `escalate to` substring,
      domain-labeled ask. §0 S1–S6 PASS (egress log = save-message-redis/save-session-vars/sendmsg-sub all
      `would_*`/blocked; no real send/assign/SLA/comment/queue; prod chat-memory node orphaned → 0 loads/0 saves).
- [ ] G2 (doc hygiene, non-blocking for regression): fix plan §1/§8 (`mock_reformulator_output` not
      `mock_parser_output`) and CLAUDE.md (clone calls `vUfFUDjLAuMaeQE6`, not `rrYXzE61…`).

**Promotion — artifact 1: live reformulator `XTODTw-dJcV0uRdC056hG`, `AI Agent.options.systemMessage`:**
- [ ] Back up the current live systemMessage first.
- [ ] Apply Insertion A (append `, "confident": true|false` to the entity-contract line) + Insertion B (the
      `== ENTITY CONFIDENCE ==` block) **verbatim** at the byte-identical anchors. Do NOT touch any other
      section (live's separator box + DATE FILTER legitimately differ from the stale test copy — leave them).
- [ ] `publish_workflow` after (drafts don't auto-run — LESSON 17 / memory note). Verify
      `versionId==activeVersionId`.

**Promotion — artifact 2: live spine `9qVyfUxmRQqrpGRMDLRuz`, `not-found-error-message.jsCode`:**
- [ ] Back up the current live jsCode first.
- [ ] Apply the Change-2 vague-clarify block (the new lines + the one wrapper `}`) at the TOP of the final
      `else`, ABOVE the `require_specific` ladder. **Diff live pre/post and confirm the only delta is the
      documented block** — the require_specific/Fix-B ladder must stay byte-identical, and the
      `missingAttachmentType`/`needsScope` arms untouched.
- [ ] Confirm brace balance / standalone `new Function(...)` parse on the merged jsCode before saving.
- [ ] No guard scaffolding to strip (this node has no guard); `escalate-catalog`/`If3`/`tag-*` unchanged.
- [ ] Publish + verify active.

**Post-promote smoke (live, read-safe):** rerun 13a (clean session) + 13c on live confirming clarify-vs-escalate
split, then run/inspect the full-corpus regression diff.

**Revert lever (test wiring, not promoted):** the clone's `Call 'sub-query-reformulator'` points at
`SB8wEXKdpITfhYXA`; repoint `workflowId.value` back to `XTODTw-dJcV0uRdC056hG` to run the clone against live.

---

## Authorization
APPROVED. Zero egress re-confirmed across all §13 cases. Change logic correct and non-regressive; Change-1
transcribes onto live byte-clean. **Promotion authorized ONLY after G1 (clean-session parser 13a e2e) is
green.** Reuse-arm `confident` drop accepted and documented as a non-regressive known limitation; any
"reused-vague-clarify" behaviour is a separate future change (requires session-state persistence). Full
`n8n_test` regression is greenlit to proceed in parallel.

---

# ADDENDUM — FINAL SIGN-OFF on the RE-BASED reformulator + Refinements 1 & 2 (2026-06-30)

Reviewer: sorento-reviewer · 2026-06-30 · **Verdict: APPROVE (final — promotion authorized, user-gated).**
This supersedes the conditional posture above: the prior APPROVE predated the rebase (fresh copy
`CpxE8LroLzCkrAQN` replacing stale `SB8wEXKdpITfhYXA`), Refinement-1 (prompt anti-misuse clause), and
Refinement-2 (partial-aware clarify). All re-verified independently via MCP reads + jq/diff/sha + `new
Function` parse; final run `vts-rebase-prepromote-20260630.json` (11 cases, GO) + sampled regression
`vts-phase2-sampled-regression-20260630.json` re-read for zero-egress. **No workflow edited.**

### 1. Byte-clean promotion transcription (artifact 1) — VERIFIED
- Fresh copy `CpxE8LroLzCkrAQN` and live `XTODTw-dJcV0uRdC056hG` have **identical node sets** (7 nodes).
- `diff` of AI-Agent `systemMessage` (live 22 528 B → fresh 24 097 B) shows **EXACTLY the additive insertions
  and nothing else**: (A) line 211 entity-contract line gains `, "confident": true|false`; (B) new
  `== ENTITY CONFIDENCE ==` block at lines 213-233 — and that block **already contains Refinement-1** (the
  "A lone code or single token is ONE clean referent → confident:true EVEN IF you doubt it exists… existence
  is the resolver's job" clause). Zero changes outside the insertion region.
- `output_exchange.jsCode` is **byte-identical live vs fresh** (sha `9addb4787da362a4005a3ebbe1ab6f3220945141`
  on both) → the live `_priorEnts0` reuse-fix / `DATE_FILTER_DOMAINS` / member-pick guard / `customer_order`
  axis are present in the tested copy; **no drift introduced**, and the current-message preservation path that
  carries `confident:false` through is the live code itself.
- ⇒ Promotion of artifact 1 = apply Insertion A + Insertion B (with R1) verbatim at the byte-identical anchors.
  Live verified UNTOUCHED: `versionId == activeVersionId == 292faed2-2919-4ce9-be12-9359036ccea8`.

### 2. Change-2 onto the live spine (artifact 2) — VERIFIED CLEAN
- Live spine `9qVyfUxmRQqrpGRMDLRuz` `versionId == activeVersionId == 131cf660-…`, **untouched**.
- `diff` of `not-found-error-message.jsCode` (live 105 ln → clone 134 ln) shows the only deltas are: the
  vague-clarify block inserted after live **line 76** (between `active_inactive` and `const require_specific`);
  one wrapper `}` after live **line 98**; and the clone dropped one **trailing blank line** at EOF (cosmetic,
  behaviour-neutral).
- The **require_specific / Fix-B ladder is BYTE-IDENTICAL** between live spine (lines 77-98) and the clone's
  new `else`-body (lines 106-127) — confirmed by an isolated `diff` of just those ranges (no re-indentation;
  pure insertion). So the live apply is a mechanical two-point insertion, not a non-trivial merge.
- Every identifier the inserted block reads is **already defined upstream in the live node**: `gate` (ln 3),
  `allowedTypes` (ln 12 = `gate.gate_debug.allowed_lookup`), `humanList` (ln 16), `unresolved` (ln 25), `q`.
  Nothing undefined on live.
- Merged clone jsCode: **braces 55/55, parens 75/75, `new Function(jsCode)` PARSE OK.**
- **No "escalate" substring leak on the clarify path:** the only `Would you like me to escalate to … team?`
  strings (clone ln 122/126) live inside the `require_specific` ladder = the `confident:true`/non-vague `else`
  branch (correct). The vague-clarify `escalate_message` assignments (ln 98-99 partial-aware; ln 102-103
  no-resolved) contain no escalate/assignment substring. Matches the run logs ("NO 'escalate' substring" on
  every clarify case).

### 3. Refinements correctness + strict additivity — VERIFIED
- **R1 (case 4, real LLM, exec 7014554):** lone unknown `SMC202606-9999` → `confident:TRUE` → vague-check did
  NOT fire → `is_clarification=false`, escalate-OFFER ladder ("Could not find order … escalate to
  customer_service?"), offer-only (no assignment write). Anti-misuse clause held on the live base.
- **R2 (case 5b, real LLM, exec 7014906):** `confident:false` blob `dua srtks tiga empat macam` with resolved
  `SRTWC8517`+`photo` → **partial-aware** clarify "I understood product SRTWC8517, attachment_type photo, but
  couldn't make out … — is that a …?"; `is_clarification=true`, `is_escalate_offer=false`, no escalate. R2
  E2E confirmed.
- **Strict additivity:** rebase cleared the staleness — cases 3a-3d ('photo for 7547-BL', 'ETA SRTBF11413',
  'can i get photo SRTWC8517', 'stock for SRTKT72SS') now extract the code as `confident:true` with
  `entity_op=replace_combine` (prior stale `reuse:[]` GONE). `attachment_type` (3a/3c/5b),
  `reference_positions` (6-T2 `[2]`), `selection_context` (6-T2 carried), and `entity_op` extraction
  unperturbed by the additive `confident` key.

### 4. Zero-egress — RE-CONFIRMED independently from the final artifact
S1-S6 PASS on all 11 final-run cases and all 15 sampled-regression cases. Egress logs show `would_send` /
`would_write` + blocked only; **no `api.respond.io` message/file POST**; no assignment/SLA/PIC-comment/
assignee-queue write (case 4 / C6 CS member-offer is offer-only, no `would_assign`); the prod
`save-session-vars` conversation-variables PUT stays **orphaned → would_write only**; all session I/O on the
isolated `n8n_test` `respond_contacts_test` (every reset proved `current_database()='n8n_test'`). `get-results`
resolved **READ tools only** (product/order/incoming/inventory list), **never `crm_it_support_ticket_create`**.
The change adds/removes no node and edits only message text + two booleans → egress-neutral. Both live targets
verified untouched by versionId.

### 5. The two NON-BLOCKING live-base flags — confirmed PRE-EXISTING, correctly OUT OF SCOPE
- **(a) labeled-split → product-not-order routing (case 2):** the live base classifies "customer one siew,
  product srtkt72ss" as `domain_hint=master_products` and `output_exchange` broaden-drops the out-of-domain
  customer, returning the PRODUCT list rather than the customer's ORDER. Both LLM entities were correctly
  `confident:true`; the routing is a **live-base `domain_hint`+broaden characteristic, NOT introduced by the
  confident change** (which is additive). Out of scope → separate follow-up.
- **(b) R2 narrow reachability (case 5):** the canonical category/promotion + name-code mash cannot reach the
  partial-aware clarify on the live base because the `confident:false` mash gets `hint=customer` (broaden-
  dropped outside the 'order' domain) and promotion has an ask-access gate. Again **live-base routing**, not
  this change; R2 is correct and reachable via the ambiguity-shaped compound (5b). Out of scope → same
  follow-up. Recommend logging both under one "labeled-customer+product → order AND-resolution / broaden-drop
  policy" follow-up plan.

### Note carried forward
- G1 (clean-session parser 13a) closed previously **and** re-demonstrated on the live base by final-run case 1
  (exec 7013887: fresh `confident:false` → `replace_combine` → preserved through output_exchange → clarify, no
  reuse). Reuse-arm `confident` drop remains an accepted non-regressive limitation (needs session-state
  persistence = separate change).
- Doc hygiene (G2, non-blocking): clone calls human-intervention TEST copy `vUfFUDjLAuMaeQE6`, not
  `rrYXzE61gCNUck_zmXe-G` (CLAUDE.md); plan §1/§8 bypass field is `mock_reformulator_output` not
  `mock_parser_output`. Neither is a promoted artifact.

---

## FINAL PROMOTE CHECKLIST (user-gated — you execute; reviewer only authorizes)

**BACKUP-FIRST (capture before any edit):**
- [ ] Record live reformulator `XTODTw-dJcV0uRdC056hG` `versionId` (currently
      `292faed2-2919-4ce9-be12-9359036ccea8`) and dump `AI Agent.options.systemMessage` to a backup file.
- [ ] Record live spine `9qVyfUxmRQqrpGRMDLRuz` `versionId` (currently `131cf660-be93-474b-b33a-4e1a5363ea51`)
      and dump `not-found-error-message.jsCode` to a backup file.

**Artifact 1 — live reformulator `XTODTw-dJcV0uRdC056hG`, node `AI Agent`, param `options.systemMessage`:**
- [ ] **Insertion A** — on the entity-contract line (live line 211), change the tail from
      `…false if it is from previous context }` to
      `…false if it is from previous context, "confident": true|false }` (append `, "confident": true|false`
      before the closing `}`). Touch only that line.
- [ ] **Insertion B** — insert the `== ENTITY CONFIDENCE ==` block (the 21 lines incl. Refinement-1, exactly
      as it appears at fresh-copy systemMessage lines 213-233) immediately AFTER the entity-contract line and
      BEFORE the "Also emit ONE entity_op…" line. Source-of-truth text = fresh copy `CpxE8LroLzCkrAQN`
      systemMessage; the diff against live is EXACTLY these two insertions.
- [ ] Do NOT touch any other section (live's separator-box width + verbose `== DATE FILTER ==` legitimately
      differ from the old stale copy — leave them).
- [ ] `publish_workflow` `XTODTw-dJcV0uRdC056hG`; verify `versionId == activeVersionId` (drafts don't auto-run
      — LESSON 17).

**Artifact 2 — live spine `9qVyfUxmRQqrpGRMDLRuz`, node `not-found-error-message`, param `jsCode`:**
- [ ] Insert the vague-clarify block (the new lines + opening `} else {`) **after live line 76** (after
      `const active_inactive = …`, before `const require_specific = gate.require_specific`).
- [ ] Insert the single wrapper-close `}` **after live line 98** (the `}` that closes the
      `if(require_specific)/else-if/else` chain), before the final-else `}` at live line 99. Source = clone
      `txiPzSxy3Pclsz6v` `not-found-error-message.jsCode` (the exact, validated promotion source).
- [ ] **Do not modify the require_specific / Fix-B ladder** — it is byte-identical to the clone's else-body
      (confirmed). The `missingAttachmentType`/`needsScope`/product_attachment arms stay untouched.
- [ ] Before saving, re-confirm **brace balance + `new Function(jsCode)` parse** on the merged code (clone
      reference: braces 55/55, parens 75/75, PARSE OK).
- [ ] No guard scaffolding to strip (this node has no guard). `escalate-catalog`/`If3`/`tag-*`/`resolve-entity`
      unchanged.
- [ ] `publish_workflow` `9qVyfUxmRQqrpGRMDLRuz`; verify active.

**POST-PROMOTE SMOKE (live, read-safe — no egress edits, but use a clean/n8n_test-sourced session, never clear
a prod session per S3):**
- [ ] Rerun final-run case 1 (`one siew srtkt72ss already delivered?`) → expect vague-clarify
      (`is_clarification=true`, `is_escalate_offer=false`, no "escalate" substring).
- [ ] Rerun case 4 (`status of order SMC202606-9999`) → expect escalate-OFFER (confident:true lone code, NOT
      clarify) — proves R1 on live.
- [ ] Rerun case 5b shape (resolved part + `confident:false` blob via ambiguity) → expect partial-aware "I
      understood …, but couldn't make out …" — proves R2 on live.
- [ ] Confirm the egress log shows `would_*`/blocked only (it will, since the spine's egress nodes are guarded
      in live by `is_test`/respond-io kill-switch on the test path; on real traffic the promoted change adds
      no new send/assign).
- [ ] Run/inspect the full-corpus `n8n_test` regression diff: every escalate-offer→clarify flip must trace to
      a `confident:false` current-message unresolved token; any flip on an all-`confident:true`/no-unresolved
      turn = HARD FAIL.

**REVERT LEVER:** if anything regresses, restore each live workflow to its backed-up `versionId` (reformulator
`292faed2-…`, spine `131cf660-…`) — or surgically strip the two insertions / the vague-clarify block + wrapper
`}` and re-publish. The change is purely additive, so a clean strip returns to exact prior behaviour.

**Authorization:** APPROVED for user-gated promotion. Zero egress independently re-confirmed; both live targets
verified untouched; both artifacts transcribe onto live byte-clean (artifact 1 = additive-only diff vs live;
artifact 2 = two-point insertion over a byte-identical ladder). The two routing flags are pre-existing
live-base behaviour, out of scope, logged for a separate follow-up.
