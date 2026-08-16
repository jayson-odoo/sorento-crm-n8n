# Review: `incoming-axis-gate-and-partial-message` (plan §B / UAC §21)

- **Reviewer verdict: ✅ APPROVE** — zero-egress re-confirmed; correctness + plan/UAC adherence verified.
- **Date:** 2026-07-14
- **Substrate:** clone `txiPzSxy3Pclsz6v`, published `activeVersionId 4d1c1f4e-1c5a-4178-83b0-e8362bb8ef7b`
  (versionId == activeVersionId → draft==active), triggerCount 0, 112 nodes.
- **Promotion target:** live spine `9qVyfUxmRQqrpGRMDLRuz` (published `bcdb5633-f760-451b-b0a8-fc03a0d884c8`).

## What I verified (from MCP, not just the coder's claims)

1. **Deployed == persisted artifacts.** Re-fetched the two edited node bodies off the published clone and
   `diff`'d against the persisted `.gate.new.js` / `.compile.new.js`: **byte-identical** (compile has one
   trailing blank line only — cosmetic).

2. **Gate diff vs LIVE is purely additive — PRODUCT MODE provably preserved.** Fetched live
   `disallowed-entity-gate` (`5928ae64`) and diffed against the new gate. The entire OR/AND
   product-disambiguation body (live lines **87–222**) is **byte-for-byte identical** to the new gate
   (lines 139–274). The only touch to that block is its opening `if (` → `} else if (`. All other changes
   are inserts *around* it: the two `let` decls, the AXIS map + mode selector + IDENTIFIER MODE block, the
   product-not-found extension block (placed *after* the preserved chain), and 3 output-line additions
   (`not_found_axis_tokens`, `not_found_product_tokens`, `gate_debug.identifier_axis`). The main regression
   surface is clean.

3. **Compile diff vs LIVE is purely additive.** One new IIFE inserted between the friendly-disclaimer IIFE
   and the `output = {` assignment; nothing else in `compile-current-state` (`0804657c`) changed.

4. **If3 is drift-correction only — NOT a promotable business change.** The clone's If3 `leftValue` is
   **byte-identical** to live's `if3-unresolved-guard-narrowed` condition
   (`gate_passed===false || (unresolved>0 && compatible_entities===0)`, single boolean, combinator or).
   Live already has this; the clone was stale. Confirmed the sync is a no-op vs live → excluded from the
   promoted diff.

5. **Egress layer untouched and fail-closed intact.**
   - 6 sendmsg calls → fork `ublq9nSlrpz63xan`, all `is_test:true`; `Call 'sub-human-intervention'` →
     fork `vUfFUDjLAuMaeQE6`, `is_test:true`.
   - `Call 'sub-get-results'` + `probe-incoming` → TEST get-results fork `rysSPgUssLDf6xJc`.
   - All 5 real-egress nodes (`save-session-vars`, `update-human-intervened`,
     `send-message-files/images/video`) + `Call 'sub-respond-save-message-redis'2` have **0 inbound
     connections** (orphaned). `redis-pop-main-message-list` reads the per-contact dispatcher queue
     (`test:q:{contact}`), never prod `main-message-list`; triggerCount 0 (no Schedule Trigger).
   - Only 3 pure-logic nodes changed (gate + compile + If3). No egress node, sub-target, credential, or
     connection was altered.

## Correctness findings

- **Mode routing correct.** `isIdentifierAxis = axisSize>0 && !axisTypes.has('product')` → true only for
  `incoming` (AXIS incoming-only). IDENTIFIER MODE fires only on `incoming && !hasProductFamilyHint`;
  everything with a product/category/brand hint, and every non-incoming domain, stays PRODUCT MODE. Matches
  the tester's observed routing across §21.1–21.7.
- **False-positive guard sound (never flags a resolved product).** OR-mode: `hasResolution` (fuzzy raw↔token
  with ≥1 match) skips any resolved product. AND-mode (`resolver.resolutions` absent): flags only tokens in
  `unresolved_tokens`, so a resolved product — which is not in `unresolved_tokens` — is never flagged.
  Empirically confirmed: §21.2/21.4/21.5/21.7 emit `not_found_product_tokens:[]` for the resolved code; A is
  never listed as missing.
- **No token double-itemized as both axis + product not-found.** Gate-level mutual exclusion (IDENTIFIER MODE
  needs `!hasProductFamilyHint`; product block needs `hasProductFamilyHint`) means only one bucket populates
  per turn; compile additionally dedupes product tokens against the axis set (case-insensitive). §21.6 shows
  BMOU as axis-only (`not_found_product_tokens:[]`).
- **`includes()` fuzzy matching worst-case is benign.** A spurious "resolved" merely omits a not-found line
  (cosmetic under-report); it can never re-introduce egress, a wrong picklist, or a false not-found flag.
- **`order` omission correct — no order regression.** `order` is absent from AXIS and from
  `REQUIRE_SPECIFIC_DOMAINS`, so neither the IDENTIFIER block nor the product block runs for order → order
  keeps today's exact behaviour. (Consequence: order partial-not-found is *not* delivered by this change;
  the `NOUN.order` entry in compile is inert. Deliberate and documented; acceptable.)
- **Scope tag correct.** `deterministic` (two Code-node edits; parser not touched). The chat driver runs the
  live reformulator once/turn as a driver cost, and parser output is asserted structurally — consistent with
  what was tested.

## Zero-egress re-confirmation (from tester run-log, both runs)

Across **7 initial + 7 re-run** cases, every clone execution:
- Real-egress nodes (`send-message-files/images/video`, `save-session-vars`, `update-human-intervened`,
  `Call 'sub-human-intervention'`) **ABSENT from runData** (did not execute).
- Reply returned via `chat:reply`; `lastNodeExecuted = guard-h-record`.
- `get-results` always on TEST fork `rysSPgUssLDf6xJc`, always a **READ** tool
  (`crm_incoming_stock_list` / `crm_inventory_warehouses_list`) — never `crm_it_support_ticket_create`.
- No assignment/SLA/PIC-comment write, no CRM/conversation-variable write. §21.6 xlsx routed via
  `chat-attach-push` → `chat:reply` (presigned URL), never the real `send-message-files`.
- **§0 S1–S5 PASS on all 14 cases.**

**Evidence-substitution note (non-blocking):** the tester asserted §0 from clone `runData` (egress-node
absence) rather than a direct `test:egress:{id}` redis read (no redis-read path this session — browser
locked; `zz-canary-read` is an un-drivable hardcoded-key manualTrigger). runData absence is a *stronger*
structural proof than the would-send log (it proves the node never executed), and I independently verified
the orphaned-egress + `is_test:true` + TEST-fork wiring on the published clone. Accepted.

**Driver-substitution note (non-blocking):** Playwright was locked, so the tester drove the identical chat
lane via `execute_workflow(inputs:{type:'chat'})` on the same `zz-chat` chatTrigger (`oyYfVvZHRZpWubTy`) →
dispatcher → clone. Same code path, §0 from the clone execution. Accepted.

## Plan / UAC adherence

- **§21.6 flagship repro FIXED:** IDENTIFIER MODE, `require_specific:false`, `gate_passed:true`,
  `compatible_entities` = single WHSU `inbound_shipment` `9e038abe-…`, `not_found_axis_tokens:["BMOU649395378"]`,
  all "Sorento" noise dropped, WHSU ETA + itemized BMOU not-found, no product picklist. Meets B4.1.
- **§21.1–21.4 PRODUCT MODE unregressed** (B4.2), incl. the **single consolidated picklist** (§21.3, B4.3 —
  one continuous 1..N list, not split per token).
- **§21.5 partial (product-axis)** itemizes the missing token, A not flagged.
- **§21.7 gap closed by the product-extension re-run:** stock success-branch now itemizes
  `not_found_product_tokens` ("I couldn't find any product matching: …"). 7/7 on the extended version.
- **B4.5 (only two Code nodes in the promoted diff):** confirmed — gate + compile; If3 is drift-correction.

## Residual risk (for the live promotion)

- **Answer-behaviour only, no new egress surface.** Both nodes are pure logic; the downstream send is the
  same send that already fires. On live the change (a) routes incoming-no-product-hint to IDENTIFIER MODE
  instead of a wrong product picklist, and (b) appends partial not-found text — answer-quality
  improvements, not egress-risk.
- **Two new always-emitted gate fields** (`not_found_axis_tokens`, `not_found_product_tokens`) — for a
  future full-corpus regression replay, register them lesson-40-style (drop when empty on both sides).
  Not a blocker for this deterministic-tier promotion.
- **Doc-drift already corrected:** the clone's `Call 'sub-query-reformulator'` → live `XTODTw-dJcV0uRdC056hG`
  (the stale `CpxE8LroLzCkrAQN` fork is not wired). CLAUDE.md's key-ID table already reflects this.

---

## PROMOTE CHECKLIST (user-gated; do NOT promote without the user's explicit go)

**Business-logic diff to port to live `9qVyfUxmRQqrpGRMDLRuz` = exactly 2 nodes. No guard scaffolding to
strip** — both bodies are pure business logic (neither references `is_test`/`test_mode`; the guards live in
the clone's sub-call params + orphaned nodes, which are not part of this diff). If3 is **NOT** ported (already
== live's narrowed condition; clone drift only).

1. **Backup first.** Capture live's current `activeVersionId` (`bcdb5633-f760-451b-b0a8-fc03a0d884c8`) and the
   current bodies of the two target nodes before any edit (revert anchor per LESSONS #25).

2. **Apply node 1 — `disallowed-entity-gate`** (live id `5928ae64-39d2-4d5d-bd85-f9ea47901f8b`): set `jsCode`
   **byte-exact** from the validated artifact
   `n8n-workflows-init/tests/diffs/incoming-axis-gate-and-partial-message.gate.new.js`
   (= the published clone body; source the string from the file, do not retype — LESSONS #25).

3. **Apply node 2 — `compile-current-state`** (live id `0804657c-f600-450b-8ae9-17972406f0e9`): set `jsCode`
   **byte-exact** from `n8n-workflows-init/tests/diffs/incoming-axis-gate-and-partial-message.compile.new.js`.

4. **Do NOT touch `If3`** (live id `ae4b5f18-c990-4691-a317-0d998cb13d71`) — already correct on live.

5. **Sha-gate around publish (LESSONS #24/#25):** sha-verify both node bodies in the **draft** BEFORE publish
   (confirm the draft carries only these two hunks and nothing stale); `publish_workflow`; sha-verify both
   node bodies on the **active** version AFTER publish; auto-revert to `bcdb5633` on any mismatch.

6. **Authorization placement (LESSONS #26):** the live write must be authorized in the promoting agent's
   INITIAL task (or the main loop under direct user consent) — a relayed mid-session `SendMessage` will be
   denied by the permission classifier.

**Blockers:** none. Approved for user-gated promotion of the two business nodes above.
