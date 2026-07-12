# Review — `cert-brand-routing-fix` (deriveRouting `isCert` widened)

Reviewer: sorento-reviewer · Date: 2026-06-30 · Scope: **parser**
Verdict: **APPROVE** (business-logic change). Promotion is **user-gated** and **conditional on the draft-vs-active
reconciliation below** — that reconciliation is a BLOCKING precondition of `publish_workflow XTODTw`, not of approval.

Inputs reviewed: plan `plans/cert-brand-routing-fix.md`, UAC `tests/UAC.md §14`, node-diff
`tests/diffs/cert-brand-routing-fix.md`, run `tests/runs/cert-brand-routing-fix-14-20260630.json`.
Independently re-verified live `XTODTw` (draft) + test copy `CpxE8LroLzCkrAQN` via MCP `get_workflow_details`,
and sub-execution `7028500` (14a) via MCP `get_execution`.

---

## 1. Correctness + additivity — PASS

- `deriveRouting(out)` with `out === output.output` (call site line 393: `deriveRouting(output.output)`).
  `out.intent_hint`, `out.user_goal`, `out.entities`, `out.domain_hint` are all properties of the passed object
  → **in scope** where used. Confirmed by reading the copy's `output_exchange` head + call site.
- `attachTypes` (lines 7–9) is pre-filtered to `hint==='attachment_type'` raws, lowercased
  (`canonical_code || raw`). The widened brand regex therefore sees ONLY document-kind tokens — never product
  codes, brand entities, or prose. **No false-positive surface from product/brand codes.**
- `isCert` is consumed at **exactly one** site (line 33, `case 'product_attachment'`). Inert for `incoming`,
  `order`, `promotion`, `master_products`, `inventory`, `forms`. Confirmed by `grep` (only 2 mentions: the
  definition and the single `product_attachment` consumer).
- Token-safety on the new alternations: `ms\s?\d` requires a digit (won't match prose "ms" or "model"/"3d model");
  `span|sirim|bomba|halal` do not appear as substrings of the standard doc-kinds (`photo`/`image`/
  `technical drawing`/`3D model`/`certificate`). Holds against attachment-type raws only.
- Regexes use `/i`, no `/g` → stateless `.test()` inside `.some()`. `node --check` (wrapped as a function body):
  **PASS**.
- **Minor, non-blocking:** the semantic fallback's `/cert|certificate/i` on `user_goal` would substring-match the
  literal `cert` inside an unrelated word (e.g. "concert"). It only fires when `intent_hint===
  'check_product_attachment'`, and can only flip `marketing_product → purchasing_certification` within the
  attachment branch — negligible blast radius in this sanitary-ware domain. Acceptable as-is.

End-to-end behaviour independently re-confirmed from sub-exec `7028500` (the 14a turn), `workflowId`
`CpxE8LroLzCkrAQN`, `parentExecution.workflowId` `txiPzSxy3Pclsz6v`:
`routing.suggested_team === "purchasing_certification"`, `suggested_agent === "general_enquiries"` — i.e. the
clone DID drive the rebased copy, and **the bug (live exec 7019613 → `marketing_product`) is fixed**. Over-fire
guard (14e photo/drawing → `marketing_product`), inertness (14f), strict-superset (14d), and zero-drift V-R5 all
PASS per the run artifact; 14c `inconclusive-by-parser` is correct and non-blocking.

## 2. Byte-clean transcription — PASS

Direct byte-diff (`jq -j`, no trailing newline) of `CpxE8LroLzCkrAQN` vs live `XTODTw` (draft) on the two
load-bearing nodes:

- `AI Agent.options.systemMessage` — **byte-identical**, sha256[:16] `eb382bcd4985c4d7` for BOTH.
- `output_exchange.jsCode` — differs by **exactly the `isCert` hunk and nothing else**: 1 line removed
  (`const isCert = attachTypes.some(t => /cert|ikram/.test(t));`), 7 lines added (the widened discriminator).
  `diff` shows a single hunk; live 450 lines → copy 456 lines (+6 net). Live(draft) oe sha `da533ee6988a8423`
  (the documented pre-fix); copy oe sha `2b49e12e3c37abec` (the post-fix value the live op must reproduce).

→ The copy == current live-DRAFT `output_exchange` + ONLY this hunk; systemMessage and all else byte-identical.

## 3. Draft-vs-active gate — VERIFIED, and the ONE thing that gates promotion

Re-confirmed live `XTODTw` meta: `versionId 3896c4dd-9774-4e86-92da-788818aaf350` (DRAFT) ≠
`activeVersionId eb01c67a-bfba-43f6-9bfb-87a5094e17d6` (ACTIVE). **An unpublished draft already exists on live.**
`get_workflow_details` returns the DRAFT; **MCP cannot return the ACTIVE version's node bodies** — so I can verify
the draft (sysMsg `eb382bcd`, oe `da533ee6` = pre-fix `/cert|ikram/`) but **cannot certify the active bodies from
MCP alone.**

The draft's systemMessage `eb382bcd` carries the per-entity `confident` flag (visible in sub-exec 7028500's
`response_ai_agent`: `"confident":true`) — i.e. the draft almost certainly already holds the unpublished
`vague-token-clarify-split` Change-1 systemMessage delta. `publish_workflow XTODTw` ships the **whole draft**, so
publishing after applying this hunk would ship **both** the routing fix **and** that pending systemMessage delta.

**Ruling:** the routing fix itself is correct and clean, so I APPROVE the change. But publishing is safe to do
**only after** a full draft-vs-active diff confirms the pending draft delta (the `confident`-flag systemMessage,
and any other node delta) is intended to ship. If it is intended (i.e. `vague-token-clarify-split` was approved),
publish is fine. If not, reconcile the draft first. This is a hard precondition in the checklist below — do NOT
blind-publish.

## 4. Write-mechanism deviation — ACCEPTABLE (test copy); constrained for live

Coder applied the 24 KB jsCode to the TEST copy via REST `PUT` (built with `jq --rawfile`, replacing only
`output_exchange.jsCode`) instead of hand-transcribing, then MCP-verified byte-identical + clean
`publish_workflow`. For a TEST copy (no live/prod/egress) this is acceptable and safer than a 24 KB retype; my
independent diff confirms it introduced no drift (copy = live-draft + only the hunk). **For the LIVE promotion**
the same anti-retype constraint applies: use a verified byte-exact write whose source is the copy's exact current
`output_exchange.jsCode` (sha `2b49e12e3c37abec`), then sha-verify before publish — never a blind retype.

## 5. Zero-egress re-confirmation — PASS (S1–S6, all 17 execs)

From the run artifact, independently sanity-checked against the architecture:
- **S1** sendmsg sub `aoydkG1dbItXR5jXFEQsP` `is_test=true`, `would_send blocked:true` every run; media-send
  (`send-message-images`) blocked on the two attachment-resolving turns. No `api.respond.io` 2xx.
- **S2 (focus)** no escalation branch taken on any turn; human-intervention sub never invoked; **no**
  `Assign or unassign`, SLA, PIC-comment, or assignee-queue write. A wrong route could NOT trigger a real
  assignment — and the reformulator is pure-parse regardless.
- **S3** all session I/O on `n8n_test.respond_contacts_test` (`current_database()='n8n_test'` confirmed); prod
  `save-session-vars` PUT orphaned → `would_write` only. Zero prod conversation-variables read/write. (Run was
  `regress-capture` — session writes land on the isolated `n8n_test` copy, not prod; acceptable.)
- **S4** get-results resolved READ tools only (`crm_master_product_attachments_list`, `crm_inventory_*`); never
  `crm_it_support_ticket_create` or any write tool.
- **S5** trigger `test_mode=true`; every invoked sub received `is_test=true`.
- **S6** parser tier — only the reformulator `gpt-5.4-mini` (+ get-results read agent on resolve cases); clarify
  `gpt-4.1-mini` did not fire; `deriveRouting` is deterministic post-processing.

No HALT condition. Live spine `9qVyfUxmRQqrpGRMDLRuz` untouched (`096476da` unchanged).

---

## PROMOTION CHECKLIST (user-gated; do NOT promote without sign-off)

Target: live reformulator `XTODTw-dJcV0uRdC056hG`, node `output_exchange`. Spine NOT involved.

1. **Backup-first.** Record current `XTODTw` `activeVersionId eb01c67a-bfba-43f6-9bfb-87a5094e17d6` and
   `versionId 3896c4dd-9774-4e86-92da-788818aaf350`. Capture the **live-ACTIVE** `output_exchange.jsCode` AND
   `AI Agent.systemMessage` bodies — these are NOT readable via MCP `get_workflow_details` (it returns the draft);
   pull them from the n8n UI version history (active version `eb01c67a`) or the REST version-history endpoint.
   Also save the current draft bodies (oe sha `da533ee6`, sysMsg sha `eb382bcd`).
2. **BLOCKING — draft reconciliation.** Full node-by-node diff of live DRAFT `3896c4dd` vs ACTIVE `eb01c67a`.
   Enumerate every delta `publish_workflow` would ship (expected: the `confident`-flag systemMessage from
   `vague-token-clarify-split`). Get explicit user confirmation that every pending draft delta is intended to go
   live **together with** this routing fix. If any delta is NOT intended, reconcile the draft (revert that node in
   the draft to the active body) BEFORE proceeding. Do not blind-publish.
3. **Apply the hunk (single op, byte-exact).** `setNodeParameter` on `XTODTw` node `output_exchange`, path
   `/parameters/jsCode`, value = `CpxE8LroLzCkrAQN`'s **current** `output_exchange.jsCode` verbatim (the full
   patched code; sha256[:16] `2b49e12e3c37abec`). This replaces the whole jsCode, so the live draft's
   `output_exchange` becomes byte-identical to the copy's. Do NOT hand-retype the 24 KB body.
4. **Pre-publish sha-verify.** Re-read live draft `output_exchange.jsCode` (`jq -j`, no trailing newline) →
   assert sha256[:16] `== 2b49e12e3c37abec`. Re-assert `AI Agent.systemMessage` sha256[:16] `== eb382bcd4985c4d7`
   (so nothing beyond the reconciled draft + this hunk is staged).
5. **Publish.** `publish_workflow XTODTw` (drafts don't auto-run). Confirm `{success:true}` and that the new
   `activeVersionId` advanced past `eb01c67a`.
6. **Post-promote check (egress-safe — do NOT fire the live spine).** Re-read live `XTODTw` `output_exchange`
   sha (== `2b49e12e3c37abec`) and confirm `versionId == activeVersionId`. Validate behaviour OFF the customer
   path: either re-run the offline V-R0 `deriveRouting` unit against the published jsCode, or invoke the
   reformulator sub directly with the exec-7019613 payload (pure-parse, zero egress) and assert
   `routing.suggested_team === "purchasing_certification"`. **Never** execute live spine `9qVyfUxmRQqrpGRMDLRuz`
   against a real respond.io contact to "verify."
7. **Revert lever.** Restore the BEFORE line (`const isCert = attachTypes.some(t => /cert|ikram/.test(t));`) on
   live `XTODTw` `output_exchange` and `publish_workflow`; or roll the active version back to the pre-promote
   `activeVersionId` via n8n version history using the bodies captured in step 1.

Acceptance basis: change correct + additive (§1), byte-clean transcription (§2), zero egress re-confirmed
(§5). Promotion authorized **conditional on** the step-2 draft reconciliation.
