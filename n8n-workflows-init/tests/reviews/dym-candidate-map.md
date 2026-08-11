# Review — `dym-candidate-map` (REVISION 2)

**VERDICT: APPROVE** (zero-egress re-confirmed). Promotion remains user-gated — this authorizes it, does not perform it.

Reviewer: sorento-reviewer, 2026-07-15. Scope tag: `parser` (consume in `output_exchange`) + spine deterministic (build/store).
Inputs reviewed: `plans/dym-candidate-map-plan.md` (+ UAC §24 / §V-DYM0), `tests/diffs/dym-candidate-map.md` (incl. REVISION 2), `tests/runs/dym-candidate-map-suite-20260715.md` (R1 finding + R2 re-test), and the **live-deployed clone + fork bodies via n8n MCP** (source of truth).

---

## What I independently verified (not just relayed from the diff/tester)

Fetched both workflows via MCP and asserted identity + code + wiring + egress:

| target | id | versionId == activeVersionId | fix markers present |
|---|---|---|---|
| clone spine | `txiPzSxy3Pclsz6v` | `6af34046-…` (draft==active) ✓ matches diff REV2 | `isDateLike`/`isCodeShaped` helpers; `axis !== 'date'` guard on **both** D2 arms (non-uuid L314, uuid L348) + `.filter(isCodeShaped)`; `compile-current-state` one-key `dym_candidates` persist w/ `[]`-clear |
| reformulator fork | `wI5RkNGW3EOJfBdo` | `732fdeeb-…` (draft==active) ✓ matches diff REV2 | `tryDymPick` IIFE; `_isDateLike` short-circuit in `_codeMatches`; `scope_exclusive=false`; `for_hint`→entity_type; member guard `dym_pick_applied !== true` (L570); `mode=runOnceForEachItem` preserved |

- **Wiring**: clone `Call 'sub-query-reformulator'` → fork `wI5RkNGW3EOJfBdo`, `is_test=true`. `Call 'sub-human-intervention'` → guarded fork `vUfFUDjLAuMaeQE6`, `is_test=true`.
- **Live UNTOUCHED**: spine `9qVyfUxmRQqrpGRMDLRuz` and live sub `XTODTw-dJcV0uRdC056hG` not edited. No promotion performed.

---

## Review checklist findings

### 1. tryDymPick correctness — PASS
Reads `previous_conversation_state.dym_candidates`; matches picked code by `for_raw` (primary) → `for_canonical` → unambiguous single-`for_hint` fallback (never string/prefix). Replaces the RIGHT prior entity **in place** (`_prior[_idx] = _picked`), keeps all others (`_prior.map(...current_message:true)`), carries prior date only when this turn named none, forces `scope_exclusive=false`, builds the entity set **explicitly** (correct — in `order` domain product+customer both map to `order_scope`, so axis-merge alone would drop the customer). Sets `dym_pick_applied=true`. Confirmed against tester T2 (exec 8713300): entities = exactly `[customer 300-I057 RETAINED, SRTWC286-SH in-place]`, `dym_pick_applied=true`, `scope_exclusive=false`, date 07-13→07-15 carried, `resolve-entity.tokens=["I bath studio","SRTWC286-SH"]` (not code-only).

### 2. R2 regression fix (defense-in-depth) — PASS, both sides present
- **Build side**: `axis !== 'date'` guard wraps `dym_candidates` construction on BOTH D2 arms, plus `.filter(c => isCodeShaped(c.code))` drops any date-valued/non-code candidate. On a date-relaxation offer nothing is emitted → `compile-current-state` writes `dym_candidates:[]` (the clear).
- **Consume side**: `_codeMatches` short-circuits `!_isDateLike(c.code) && (…)` so a stray date-valued candidate can never match.
Confirmed against tester T3 (exec 8713374): `dym_pick_applied` ABSENT, customer RETAINED (not replaced by "2026-07-06"), `entity_op:reuse`, `date_filter` applied normally, tokens still `["I bath studio","SRTWC286-SH"]`. The exec-8711232 hijack is fixed.

### 3. Precedence (Edit D guard) — PASS
`if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true)` — a one-token addition to the live-existing member block; does not break member-pick or escalate. Tester §24c/R2.3: NUMBER "2" → member pick (`preferred_assignee_id` roster idx-2, `dym_pick_applied` absent); "yes" → round-robin escalate (`dym_pick_applied` absent); CODE → dym pick (member block skipped). All three distinct.

### 4. State hygiene — PASS
`dym_candidates` persisted via `compile-current-state` (`(_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : []`); written `[]` on every non-offer turn (rebuilt-whole-each-turn = clear after one consumption). Separate field from `last_result_set`/`selection_context` — they coexist on the merged `member_offer` turn. Tester §24e: after non-offer T3 `dym_candidates=[]`, no lingering.

### 5. Zero-egress (§0 S1–S6) — RE-CONFIRMED
Structurally (from live MCP): all egress nodes orphaned — `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`, `Call 'sub-respond-save-message-redis'2` all **0 inbound**. Sends route to the chat fork `ublq9nSlrpz63xan` (`chat:reply`), not the real sendmsg sub `aoydkG1dbItXR5jXFEQsP`. Escalation only via guarded fork `vUfFUDjLAuMaeQE6` with `is_test=true`. get-results = read-only `rysSPgUssLDf6xJc`.
From tester run logs (execs 8713300/8713374/8713471/8713494 + R1 set): every turn — no `api.respond.io/.../message` POST; no assign/SLA/PIC/session-PUT; session R/W to `n8n_test`; every invoked sub `is_test:true`; get-results `tool` in read allowlist (never `crm_it_support_ticket_create`). §0 S1–S6 held on every case.

### 6. Scope/tier — PASS
Change tested with the REAL fork via the `chat-stateful` stateful driver (not pinned replay — correct, replay is blind to Edit C per LESSON 28). Build/store side is deterministic spine Code. Matches the `parser`+spine scope.

---

## Non-blocking notes (carry forward)

- **§24b fuzzy pick — not live-exercisable.** The live resolver emits exact+prefix matches only, so a non-prefix fuzzy did-you-mean CODE cannot occur live today. AC#2's live e2e is therefore not demonstrable; it is offline-covered (V-DYM0-b/f). The explicit `for_raw` map is the correct design if/when a fuzzy resolver lands. Not a blocker.
- **§17 numeric-promotion round-trip — not separately re-run.** Member/suggest paths shown inert (dym_pick_applied absent), so low risk. Optional: run once post-promote if desired.
- **FINDING-2 `for_hint`→entity_type (minor).** Picked entity now inherits the resolved `entity_type` ("product") rather than the parser hint ("order") — more accurate for resolve-entity. Tertiary caveat: the single-`for_hint` fallback matcher now keys on entity_type, so it won't match a prior entity whose stored `.hint` differs; the primary `for_raw` matcher (exact source token) is robust and covers D1 picks, so this is negligible. No action needed.

---

## PROMOTE CHECKLIST (user-gated) — BUNDLING IS THE CRITICAL RISK

Promotable diff = **3 nodes / 6 hunks**: `build-suggest-offer` (Edit A) + `compile-current-state` (Edit B) on live spine `9qVyfUxmRQqrpGRMDLRuz`; `output_exchange` (Edit C tryDymPick + Edit D guard) on live sub `XTODTw-dJcV0uRdC056hG`.

> **DO NOT wholesale-replace any of these three nodes.** Each carries OTHER stacked changes on the fork/clone that are NOT (or not necessarily) on live. Byte-**splice** only the dym-specific hunks, anchored on CONTENT (live line numbers differ from the fork/clone).

### Per-target co-residency (what must be isolated vs ported together)

| live target node | co-resident on fork/clone | promote ONLY these dym hunks | must NOT drag in |
|---|---|---|---|
| spine `build-suggest-offer` | sibling-picker **D3** (incoming-axis-gate — NOT promote-ready) + dym build | top helpers `isDateLike`/`isCodeShaped`; D1 A1/A2 `dym_candidates` additions; D2 A3/A4 `dym_candidates` blocks w/ `axis!=='date'`+`isCodeShaped` | the D3 sibling-picker block (unreviewed) |
| spine `compile-current-state` | dym persist (relatively isolated) | the single `"dym_candidates": …` key in the `output.variables` blob | anything else in that blob |
| live sub `XTODTw` `output_exchange` | **domain-continuity-carry** + **decline-flag** + dym (both others NOT on live) | the `tryDymPick` IIFE (anchor: after FLYER injection, before the entity-op executor) + the one-token `&& output.output.dym_pick_applied !== true` on the existing `member_offer` guard | the domain-continuity-carry hunks and the decline-flag hunks (separate pending changes) |

- **`output_exchange` is the highest-risk splice**: the fork body has three stacked changes; a wholesale copy would push two unpromoted changes into the live parser. `tryDymPick` is self-contained (reads `previous_conversation_state`/`output.output`/`latest_user_message` only; no dependency on the other two fork changes), and Edit D is a clean one-token add to a line that already exists in live — so the two dym hunks CAN be spliced in isolation. Locate the anchor by content on the LIVE body; do not trust fork line numbers.

### Ordering dependency
- No hard SAFETY ordering: Edit C early-returns when `dym_candidates` is absent, and live never populates it until the spine build/store (A/B) land — so a consume-only promote is inert (safe no-op), and a build/store-only promote just writes an unread field (safe no-op, bug persists). **But the feature only works end-to-end when all 4 hunks land together** — promote spine (A+B) and `XTODTw` (C+D) in the SAME user-gated session.

### Mechanics (LESSON 25/24 — byte-exact, sha-gated, backup-first)
1. Backup first: capture prior versionId + the exact current `jsCode` of live `build-suggest-offer`, `compile-current-state` (spine) and live `output_exchange` (`XTODTw`) to `tests/reviews/backups/`.
2. Source the exact hunk text from the validated fork/clone bodies (`scratchpad/build-suggest-offer.fix.js`, `scratchpad/output_exchange.fix.js`, `dym-candidate-map.compile-current-state.new.js`) — do not retype 20k-char bodies.
3. Splice hunks into a copy of the LIVE body (anchored on content), `node --check` each result.
4. Write via `setNodeParameter /jsCode`; **sha-verify the draft BEFORE publish** (== intended spliced state, and confirm the OTHER stacked changes are absent from the live splice) and **sha-verify the active AFTER publish**; auto-revert (`publish_workflow` prior versionId) on any mismatch.
5. Publish spine and `XTODTw`; confirm `versionId == activeVersionId` on both; verify live sub `XTODTw` still `is_test`-guarded and no live caller passes `is_test` truthy (LESSON 17).
6. Never edit live mid-cycle; do a post-promote smoke of the flagship (customer+date retained on a code pick) and confirm the date-continuation flow still keeps the customer (FINDING-1 case) live.

---

**Authorization**: APPROVED for user-gated promotion, contingent on the byte-splice/bundling discipline above. Zero egress re-confirmed structurally and from run logs.
