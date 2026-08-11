# Review: `incoming-axis-gate-and-partial-message` — iter-2 gate refactor + iter-3 wording fix

- **Reviewer verdict: ✅ APPROVE** — zero-egress re-confirmed; iter-2 per-token gate + iter-3
  build-suggest-offer wording verified correct and byte-identical to artifacts on the published clone.
- **Date:** 2026-07-14
- **Scope of THIS pass:** the changes that landed AFTER the prior sign-off (which APPROVED iters 1–1.5 at
  `activeVersionId 4d1c1f4e`): iter-2 = per-token parser-hint classification refactor of
  `disallowed-entity-gate`; iter-3 = `build-suggest-offer` D2 non-uuid container-miss wording. The promoted
  business diff is now **3 nodes** (was 2): gate + compile + build-suggest-offer. `If3` remains
  drift-correction only (already == live) and is NOT promoted.
- **Substrate:** clone `txiPzSxy3Pclsz6v`, published **`activeVersionId 957f8d5c-52ba-4982-a1aa-dd3ba1a4fc89`**
  (`versionId == activeVersionId` → draft==active), triggerCount 0, 112 nodes.
- **Promotion target:** live spine `9qVyfUxmRQqrpGRMDLRuz`, active `bcdb5633-f760-451b-b0a8-fc03a0d884c8`
  (confirmed via MCP: live `versionId == activeVersionId == bcdb5633`, 86 nodes).

## What I verified from MCP (not just the coder's claims)

1. **Deployed == artifacts.** Extracted the 3 node bodies from the published clone and `diff`'d vs the
   persisted artifacts: `build-suggest-offer` **byte-identical**; `disallowed-entity-gate` and
   `compile-current-state` identical modulo a single trailing blank line (cosmetic). Deployed gate carries
   the iter-2 markers (`hintForToken`, `classifyHint`, `axis_matches`, `product_exacts`,
   `require_specific`; the old `identifier_axis` flag is gone) — confirming the per-token refactor, not iter-1.

2. **Gate delta vs LIVE is a bounded refactor of the require-specific block + one additive block.** Fetched
   live gate (`5928ea64`, draft==active) and diffed:
   - Lines 1–77 (ALLOWED/ALLOWS_EMPTY/REQUIRED_TYPES compatibility + required-type) **byte-unchanged**.
   - `REQUIRE_SPECIFIC_DOMAINS` on live == deployed == `['incoming','product_attachment']` — **no narrowing**.
     So pure-product domains (inventory/master_products/promotion) skip the (A) block in BOTH live and
     deployed; their `compatible_entities`/`gate_passed`/`require_specific` routing is unchanged. The only
     new output for them is the advisory `not_found_product_tokens` field (block B). Regression surface clean.
   - The (A2) product OR/AND disambiguation body is the same logic operating over `productResolutions`
     (resolutions pre-filtered to PRODUCT-classified tokens). For pure-product-mode inputs
     (product_attachment; incoming with only product tokens) `productResolutions` == the full resolutions set
     → behavior-equivalent to live's `orResolutions`/`andMatches`. Verified §21.1/21.2 picklist-vs-proceed
     match live semantics.

3. **build-suggest-offer delta vs LIVE is EXACTLY the iter-3 special case — nothing else.** Diffed live
   (`7972abd8`, draft==active) vs deployed: the sole change wraps the original
   `No ${noun} for ${askedCode}. Try: …` in an `else`, guarded by a narrow `if` (see below). The original
   fallback string is byte-preserved as the else branch; `values`, `suggest_quick_reply`,
   `suggest_last_result_set`, the D1 did-you-mean branch, the `axis==='date'` branch, and the uuid-numbered
   branch are all byte-identical.

4. **Egress layer untouched and fail-closed intact** (re-verified on the published clone, not assumed):
   - 6 sendmsg → fork `ublq9nSlrpz63xan`, all `is_test:true`; `Call 'sub-human-intervention'` → fork
     `vUfFUDjLAuMaeQE6`, `is_test:true`.
   - `Call 'sub-get-results'` + `probe-incoming` → TEST get-results fork `rysSPgUssLDf6xJc` (read path;
     tester confirmed READ tools only).
   - 5 real-egress nodes (`save-session-vars`, `update-human-intervened`,
     `send-message-files/images/video`) have **0 inbound connections** (orphaned). `redis-pop-main-message-list`
     reads `test:q:{contact}` (per-contact dispatcher queue), never prod `main-message-list`; triggerCount 0.
   - Only the 3 pure-logic nodes changed by iter-2/iter-3; node count unchanged at 112. All 3 bodies contain
     **0** `is_test`/`test_mode`/`chat:reply` references — pure business logic, no scaffolding to strip.

## Correctness findings — iter-2 gate (the big one)

- **Per-token classification sound.** Each resolver token is classified by its PARSER hint via `classifyHint`:
  AXIS (`inbound_shipment` for incoming), PRODUCT (compatible non-axis: product/category/brand, plus
  product_attachment's attachment types), NOISE (hint ∉ ALLOWED[domain] → dropped). Correct.
- **Axis not-found ALWAYS computed** (A1 runs on `hasAxis`, independent of co-present product tokens) →
  fixes 8528931 (BMOU reported alongside the product). Confirmed §21.6/21.8/21.9: `not_found_axis_tokens:["BMOU…"]`.
- **NOISE dropped.** "Sorento warehouse" (hint=warehouse ∉ compatNonAxis.incoming) → NOISE → excluded from
  both `productResolutions` and axis handling → never a picklist candidate nor a not-found item. Fixes 8529182.
- **Product picklist gated to PRODUCT-hinted tokens only** (`productResolutions`/`productIntersection`
  pre-filter) → AXIS + NOISE tokens can never enter the choose-list. Sorento is never a candidate.
- **No double-itemize.** A token has one parser hint → one class. (A1) iterates only axis-hinted ents; (B)
  iterates only PRODUCT_FAMILY-hinted ents (disjoint from `inbound_shipment`); compile additionally dedupes
  the product bucket against the axis set (case-insensitive). §21.6 shows BMOU as axis-only, product bucket empty.
- **`includes()` fuzzy worst-case is benign.** A spurious fuzzy pairing can at most (a) mark an axis token
  resolved when it wasn't, or (b) skip flagging a missing product — both are cosmetic under-reports; neither
  re-introduces egress, a wrong picklist, or a false not-found flag. Axis "resolved" additionally requires a
  real `inbound_shipment` match, so a loose pairing alone can't fabricate a resolution.
- **The (A3) `else`-branch change (empty set + `ALLOWS_EMPTY` guard) is the intended noise-drop, not a
  regression.** Where live left `compatible_entities` = the compatibility-filtered `entities` (which included
  greedily-resolved Sorento products), deployed rebuilds it from `compatible_axis ∪ product exacts` only, and
  for `incoming` (`ALLOWS_EMPTY:true`) keeps `gate_passed` true when the axis set is empty. This is precisely
  the 8529182 fix.
- **Pure-product + product_attachment behavior-preserved** (see verification #2). product_attachment: axis
  map has no entry → `hasAxis=false`, `compatNonAxis` = full ALLOWED set → `productResolutions` = all
  resolutions → OR/AND body equivalent to live; REQUIRED_TYPES(attachment_type) gate unchanged. Not exercised
  by a §21 case (theoretical surface, low risk).

## Correctness findings — iter-3 build-suggest-offer

- **Special case is narrowly gated:** fires only when `q.domain_hint === 'incoming'` AND ≥1
  `inbound_shipment`-hinted entity AND ≥1 `product`-hinted entity, inside the non-uuid, non-date D2 branch.
- **Does NOT leak into non-container suggest paths.** A pure-product miss takes the D1 did-you-mean branch
  (tester #3: `Couldn't find "CWC604-S-RL". Did you mean …?` — unchanged); even reaching D2 non-uuid it has
  `containerRaws.length===0` → falls to the byte-preserved fallback. Tester confirmed no
  "No incoming stock of … in …" leak into the pure-product query.
- **Text-only:** `values` / `suggest_quick_reply` / `suggest_last_result_set` unchanged everywhere; date +
  uuid-numbered branches byte-identical (verified via live diff).
- Rendered fix (§21.8, exec 8536764): `No incoming stock of CWCX604-S-RL in BMOU649395378, WHSU5485370.
  Try: … escalate to purchasing team?` — names the product + containers, no ETA leak, no "for BMOU" phrasing.

## Zero-egress re-confirmation (from the run-log — iter-2 9 cases + iter-3 5 cases)

Across all **14 cases** every clone execution:
- Real-egress nodes (`send-message-files/images/video`, `save-session-vars`, `update-human-intervened`,
  `Call 'sub-human-intervention'`) **ABSENT from runData** (did not execute).
- Reply returned via `chat:reply`; `lastNodeExecuted = guard-h-record`.
- `get-results` always on TEST fork `rysSPgUssLDf6xJc`, always a **READ** tool
  (`crm_incoming_stock_list` / `crm_inventory_warehouses_list`) — never `crm_it_support_ticket_create`.
- §21.8 escalation was **offered as text only**; `sub-human-intervention` did NOT execute → no assignment/
  SLA/PIC-comment/CRM write. §21.6 xlsx routed via `chat-attach-push` → `chat:reply` (presigned URL), never
  the real `send-message-files`.
- **§0 S1–S5 PASS on all 14 cases.** The egress layer was NOT touched by iter-2/iter-3 (only the 3 logic nodes).

## Accepted / out-of-scope (not blockers)

- **§21.8 routes to suggest-on-miss (WHSU contents not rendered)** — a resolved product not present in the
  container turns get-results into an empty AND-query → suggest-on-miss. This is the user's explicit choice;
  iter-3 only fixes the wording. Rendering WHSU alongside the not-found (as §21.9 does for a *fake* product)
  is a separate future change.
- **Residual gate edge:** a resolved container co-occurring with a *genuinely ambiguous* product →
  `require_specific=true` → `compatible_entities` = picklist candidates only → the container defers to the
  picklist turn (same "ask to disambiguate" UX as today). Accepted/out-of-scope per the coder's flag.

## Minor findings (non-blocking, for traceability)

- **UAC.md does not contain §21.8/§21.9.** These two mixed cases (grounded on repros 8529182/8528931) live
  only in the run-log; they were added by coordinator ask and not formalized in `tests/UAC.md`. Recommend
  back-filling them into UAC §21 for regression traceability. Does not affect correctness/safety of this change.
- **Evidence + driver substitution (carried from the prior pass, still accepted).** §0 asserted from clone
  `runData` (real-egress node *absence* — a stronger structural proof than the `would_send` log) rather than a
  direct `test:egress:{id}` redis read (no redis-read path this session). Driver was the
  `execute_workflow(inputs:{type:'chat'})` lane on the same `zz-chat` chatTrigger (Playwright locked) — the
  identical dispatcher→clone code path. Independently re-verified the orphaned-egress + `is_test:true` +
  TEST-fork wiring on the published clone.

---

## PROMOTE CHECKLIST (user-gated; do NOT promote without the user's explicit go)

**Business-logic diff to port to live `9qVyfUxmRQqrpGRMDLRuz` = exactly 3 nodes.** No guard scaffolding to
strip (all 3 bodies are pure business logic — 0 `is_test`/`test_mode` references; guards live in the clone's
sub-call params + orphaned nodes, outside this diff). `If3` is **NOT** ported (already == live's narrowed
condition — clone drift only).

1. **Backup first.** Capture live's current `activeVersionId` `bcdb5633-f760-451b-b0a8-fc03a0d884c8` and the
   current bodies of the 3 target nodes as the revert anchor (LESSONS #25).

2. **Apply node 1 — `disallowed-entity-gate`** (live id `5928ae64-39d2-4d5d-bd85-f9ea47901f8b`): set `jsCode`
   **byte-exact** from `n8n-workflows-init/tests/diffs/incoming-axis-gate-and-partial-message.gate.new.js`
   (== published clone body; source the string from the file, do not retype — LESSONS #25).

3. **Apply node 2 — `compile-current-state`** (live id `0804657c-f600-450b-8ae9-17972406f0e9`): set `jsCode`
   **byte-exact** from `…incoming-axis-gate-and-partial-message.compile.new.js`.

4. **Apply node 3 — `build-suggest-offer`** (live id `7972abd8-5d6b-40ff-9d38-152782cd8091`): set `jsCode`
   **byte-exact** from `…incoming-axis-gate-and-partial-message.build-suggest-offer.new.js`. (NEW to the
   promoted set vs the prior sign-off — the iter-3 wording fix.)

5. **Do NOT touch `If3`** (live id `ae4b5f18-c990-4691-a317-0d998cb13d71`) — already correct on live.

6. **Sha-gate around publish (LESSONS #24/#25):** sha-verify all 3 node bodies in the **draft** BEFORE publish
   (confirm the draft carries only these 3 hunks and nothing stale); `publish_workflow`; sha-verify all 3 on
   the **active** version AFTER publish; **auto-revert to `bcdb5633` on any mismatch.**

7. **Authorization placement (LESSONS #26):** the live write must be authorized in the promoting agent's
   INITIAL task (or the main loop under direct user consent) — a relayed mid-session `SendMessage` is denied.

**Residual risk:** answer-behaviour only, no new egress surface — all 3 nodes are pure logic; the downstream
send is the same send that already fires. Two always-emitted gate fields (`not_found_axis_tokens`,
`not_found_product_tokens`) should be registered lesson-40-style (drop-when-empty-both-sides) in any future
full-corpus replay. §21.8's WHSU-not-rendered behaviour ships as-is (intentional).

**Blockers:** none. Approved for user-gated promotion of the 3 business nodes above.
