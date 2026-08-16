# Run: `dym-candidate-map` §24 e2e suite — 2026-07-15 (tester)

Change: did-you-mean pick RETAINS prior customer + date via a labeled candidate→token map.
Plan `plans/dym-candidate-map-plan.md`; diff `tests/diffs/dym-candidate-map.md`; UAC §24 + §V-DYM0.

## Targets (verified live before asserting)
- Clone `txiPzSxy3Pclsz6v` — active, versionId `f690da38-1e35-497a-b207-6548ae3f7e14` ✓ (matches diff)
- Reformulator fork `wI5RkNGW3EOJfBdo` — active, versionId `b552ea26-8701-463d-bb87-1767ad0d5b12` ✓
- Wiring: clone `Call 'sub-query-reformulator'` → fork `wI5RkNGW3EOJfBdo` ✓
- Hunks present: `build-suggest-offer`+`compile-current-state` have `dym_candidates`; fork `output_exchange` has `tryDymPick` + `dym_pick_applied` + member guard `dym_pick_applied !== true` ✓
- Driver: `chat-stateful` console lane — zz-chat `oyYfVvZHRZpWubTy` (chatTrigger `58a0adb6…`, mode `chat-stateful`, contact 437264483) → dispatcher `2D0cw2Y1aPW2LOlU` → clone. REAL fork (not pinned replay). Session row `respond_contacts_test.437264483` reset ONCE before each chain (never mid-scenario).
- get-results sub the clone actually calls = `rysSPgUssLDf6xJc` (not the CLAUDE.md-listed `Fss5aAaXthJSWpZCgKiKR`; read-only, non-defect — as prior notes).

## VERDICT: PASS with one HARD REGRESSION FOUND (not in the §24 script; blocks promotion).
Flagship (§24a) and all defined precedence/fallback/clear/single-token cases pass. **A new customer-drop regression exists on the date-relaxed-offer → date-pick flow** (see FINDING 1). §0 zero-egress holds on every turn.

---

## Per-scenario

### §24a — flagship repro (pick RETAINS customer + date) ★ — PASS
Chain: reset → T1 "I bath studio Srtwc286 delivery 13/07/26 to 15/07/2026" → T2 "SRTWC286-SH".
- **T1** (clone exec 8710165): order query → not-found → merged did-you-mean + CS roster.
  Reply: *"Couldn't find "Srtwc286". Did you mean SRTWC286-SH, SRTWC286-SH-PP, or SRTWC286-SH-NEW-150? … 1. Maryam … 6. Nurain …"*.
  Persisted `variables` (via `compile-current-state`→`pg-upsert-session`): `selection_context=member_offer`, `last_result_set`=6 members, entities=[customer I bath studio→300-I057, product Srtwc286→SRTWC286-SH], date 07-13→07-15, domain order.
  **Built `dym_candidates` (verbatim):**
  ```json
  [{"code":"SRTWC286-SH","uuid":"0d0ed752-fd6f-4759-ad8f-0b40e0cbc601","for_raw":"Srtwc286","for_hint":"order","entity_type":"product","for_canonical":null},
   {"code":"SRTWC286-SH-PP","uuid":"7a8f2543-ef3b-4e5f-9dad-e29f6f688485","for_raw":"Srtwc286","for_hint":"order","entity_type":"product","for_canonical":null},
   {"code":"SRTWC286-SH-NEW-150","uuid":"13ffa633-91db-4db6-9050-5de7a0deb9b8","for_raw":"Srtwc286","for_hint":"order","entity_type":"product","for_canonical":null}]
  ```
  (Note: `for_hint` came through as `"order"`, not `"product"` as the plan/UAC example showed — the parser emitted `hint:order` for the Srtwc286 entity, so `build-suggest-offer._srcEnt.hint='order'`. Benign: `for_raw` is the linkage key; see FINDING 2.)
- **T2 pick "SRTWC286-SH"** (clone exec 8710367; fork sub-exec 8710369). `output_exchange` output:
  - `entities` = **[{customer "I bath studio", 300-I057, current_message:true} RETAINED, {SRTWC286-SH, uuid 0d0ed752, canonical SRTWC286-SH, current_message:true} in-place replace of source product]** — exactly 2, no stray dup.
  - `dym_pick_applied === true`; `scope_exclusive === false` (LLM's true ignored); `entity_op='replace_combine'`.
  - `date_filter_start === '2026-07-13'` & `date_filter_end === '2026-07-15'` **CARRIED**; `domain_hint === 'order'` carried.
  - **get-results scoping**: `resolve-entity.tokens = ["I bath studio","SRTWC286-SH"]` (customer + code, **NOT code-only**). get-results (`rysSPgUssLDf6xJc`) → "No matching results" in-window, date-relaxed alternatives all out-of-window (07-06/06-15/05-12).
  - Reply: *"No delivery on 2026-07-13 to 2026-07-15. **I bath studio** has delivery on 2026-07-06 (DO 202607-0573); …"* — customer AND window both retained (the exact bug 8666864 dropped both).
- **§0**: send via chat fork `ublq9nSlrpz63xan` (`{success:true}`); `send-message-files/images/video`, `Call 'sub-human-intervention'`, `save-session-vars`, `update-human-intervened` all NOT executed. Session R/W via pg (n8n_test). PASS.

### §24b — fuzzy/typo pick (non-prefix) — SKIP (no live case; offline-covered)
Probe T1 "check stock cwc2816" (clone exec 8710565): `resolve-entity` → `cwc2816` resolved:false, matches:[], alternatives:[] → no did-you-mean built (reply "Could not find inventory for cwc2816"). The live resolver does **exact + prefix only** (all SRTWC286-SH matches were `match_tier:exact/prefix`); it emits no fuzzy/typo (non-prefix) suggestion, so a non-prefix did-you-mean CODE **cannot occur live**. Per instructions: noted and skipped (do not fabricate). The non-prefix map path is proven by offline units V-DYM0-b/f (33/33). **AC#2 live e2e not exercisable on current resolver behavior** — flag for reviewer.

### §24c — precedence on the merged member_offer turn — PASS (all three distinct)
Each sub-case: reset → T1 flagship → fresh T2.
- **§24c-1 NUMBER "2"** (clone exec 8710853): reformulator `member_pick_context:true`, `reference_positions:[2]`, `escalation.preferred_assignee_id="12246ae8-59e0-46a1-9cf0-fd80f45c1db9"` (roster idx-2 Cyndi), **`dym_pick_applied` ABSENT** → member block handled it. Human-intervention = guarded fork `vUfFUDjLAuMaeQE6`, input `is_test:true`, `explicit_assignee_id="12246ae8…"` (would-write, no real assign). Reply "⚠️ [escalated to customer_service team]".
- **§24c-2 "yes"** (clone exec 8710943): reformulator `is_affirmative:true`, `escalation.is_escalation_confirmation:true`, **no `preferred_assignee_id`** (round-robin), **`dym_pick_applied` ABSENT**. Human-intervention = guarded fork `vUfFUDjLAuMaeQE6`, `is_test:true`, `explicit_assignee_id=""`.
- **§24c-3 CODE "SRTWC286-SH"** = §24a T2 → dym pick (`dym_pick_applied:true`), member block skipped (Edit D guard), customer retained.
- Edit D guard works: code → dym; number/name → member pick; yes → round-robin. **§0**: escalation only via guarded fork `vUfFUDjLAuMaeQE6` (`is_test:true`); no real assign/SLA/PIC.

### §24d — code NOT in map → fresh query (fallback) — PASS
reset → T1 flagship → T2 "SRTUFV101" (clone exec 8711015).
- Reformulator: entities=[{SRTUFV101 product current_message:true}, {I bath studio customer current_message:false}], `entity_op='replace_combine'`, **`dym_pick_applied` ABSENT**, date NOT carried (`date_filter_start:null`).
- The customer carry here is the **parser's normal combine** (current_message:false), NOT the dym forced-retain (which is what carries the date — and correctly did NOT here). "Today's behavior", no crash. Reply "product: SRTUFV101 … customer: I BATH STUDIO … no order matched".

### §24e — map cleared after consumption — PASS
reset → T1 flagship → T2 pick "SRTWC286-SH" → T3 "check stock WESERP10B" (non-offer, resolves to results).
- After T2: `dym_candidates` = `["2026-07-06","2026-06-15","2026-05-12"]` — the SH codes are **gone** (old map overwritten). NB T2 was itself an offer turn (date-relaxed), so it wrote NEW (date) candidates — see FINDING 1.
- After T3 (non-offer): `dym_candidates = []`, `selection_context = null` — cleared; no lingering; T3 (normal stock result) showed no spurious reconcile. The always-write-`[]` clear mechanism works on any non-offer turn.

### §24f — single-token did-you-mean (no other prior) — PASS (seeded)
A bare/ambiguous single product token is not naturally reproducible as a did-you-mean live (bare→clarify; +domain→results: "check stock for Srtwc286"→37 rows, "delivery status for Srtwc286"→20 orders). Seeded prior state (single product entity + 2-code map, `selection_context=suggest_offer`, no customer/date) then fired "SRTWC286-SH" (clone exec 8711453):
- Reformulator: entities = **single** [{SRTWC286-SH, product, uuid 0d0ed752, current_message:true}], `dym_pick_applied:true`, `suggest_pick_context:true`, no spurious extra entity, no crash. `resolve-entity.tokens=["SRTWC286-SH"]` → resolved. Retain logic is a correct no-op when only the source entity exists. Also covers §24g non-merged suggest_offer code-pick.

### §24g — suggest-offer / member-pick round-trip unregressed — PASS (partial)
- Member-pick paths intact: §24c-1 (number) + §24c-2 (yes) route to member pick / round-robin with `dym_pick_applied` absent — unchanged by the addition.
- Non-merged suggest_offer code pick intact: §24f seed shows `suggest_pick_context:true` + dym reconciliation resolving the code (business_query, domain inherited).
- Not separately re-run: UAC §17 numeric promotion round-trip (recommend reviewer note; member/suggest paths above show the addition is inert on existing selection flows).

---

## §0 zero-egress (S1–S6) — HOLDS on every turn
Verified from `get_execution(includeData)` node data on execs 8710165, 8710367, 8710853, 8710943, 8711015, 8711453 (and structurally identical on the others — replies returned via `chat:reply`/HTTP `{output}` = the chat-fork branch, never the real-send branch):
- **S1** zero real WhatsApp: send always via chat fork `ublq9nSlrpz63xan` → `chat:reply`; `send-message-files/images/video` never executed; no `api.respond.io/.../message` call.
- **S2** zero assign/escalation writes: `Call 'sub-human-intervention'` fires only on §24c-1/-2 and only via the **guarded fork `vUfFUDjLAuMaeQE6` with `is_test:true`** (records the would-write; no real assign/SLA/PIC).
- **S3** zero CRM/contact writes: `save-session-vars` (prod PUT) + `update-human-intervened` orphaned, never executed; session R/W to `n8n_test.respond_contacts_test` (pg).
- **S4** get-results READ only: `rysSPgUssLDf6xJc`, returned data, no write tool.
- **S5** test mode present: mode `chat-stateful` (pg session read/write ran); every invoked shared sub carried `is_test:true`.
- **S6** token sinks bounded: real reformulator fork (gpt-5.4-mini) once per turn (expected for a `parser`-scope change); no reformulator/other unexpected sink.

---

## FINDINGS

### FINDING 1 — HARD REGRESSION (blocks promotion): date-relaxed offer → date pick DROPS the customer
Root cause: the **Edit A3/A4 D2-alternatives hunk** in `build-suggest-offer` builds `dym_candidates` for **date-relaxation** alternatives, not only product-code corrections. On the §24a T2 date-relaxed offer it wrote:
```json
[{"code":"2026-07-06","for_raw":"I BATH STUDIO","for_hint":"customer","for_canonical":"I BATH STUDIO","uuid":null,"entity_type":null}, … (06-15, 05-12)]
```
i.e. `code`=a DATE, `for_raw`=the CUSTOMER (askedCode=compat[0]=customer on the date-relaxed miss).
Then when the user replies a date — **the action the bot explicitly invites** ("Reply with a date to continue") — the `output_exchange` `tryDymPick` block matches `code==="2026-07-06"`, resolves `for_raw="I BATH STUDIO"` to the prior **customer** entity, and REPLACES it with `{raw:"2026-07-06", hint:"customer", canonical_code:"2026-07-06"}`.

Repro: reset → T1 "I bath studio Srtwc286 delivery 13/07/26 to 15/07/2026" → T2 "SRTWC286-SH" → T3 "2026-07-06" (clone exec 8711232). `output_exchange`: `dym_pick_applied:true`, entities=[{**2026-07-06 hint:customer** canonical 2026-07-06}, {SRTWC286-SH product}]. `resolve-entity.tokens=["2026-07-06","SRTWC286-SH"]` — customer "I bath studio" GONE → "2026-07-06" unresolved → **customer scope dropped**. Result: orders across ALL customers on 06/07 (OTM, HOME TILES, I BATH STUDIO, UNIMAX, GRAND WATERHOUSE…) instead of I BATH STUDIO's 06/07 order only.
- This is a NEW regression from this change (pre-change: no `dym_candidates`→`tryDymPick` early-returns→date reply keeps the customer via normal reuse). It is the SAME "customer dropped" class the change set out to FIX, reintroduced on the date-continuation turn.
- Recommended fix direction (for coder/planner, not applied here): scope the D2 hunk (and/or the consume match) to **code-like** alternatives only — do NOT build `dym_candidates` for date/other-axis relaxation (`relaxed_axis` present, or `for_hint` not a code-bearing type, or `code` matches a date pattern). Also consider not keying `for_raw` on a customer when the alternatives are dates.

### FINDING 2 — MINOR: `for_hint` populated from the parser's entity hint = `"order"`, not `"product"`
Plan/UAC examples show `for_hint:"product"`; live it is `"order"` (the parser tagged the Srtwc286 entity `hint:order` under order-domain). Benign for §24a (linkage is `for_raw`), but it flows into the picked entity's `hint` and is the fallback matcher — worth aligning the plan's expected value or normalizing `for_hint` to the resolved `entity_type`.

### FINDING 3 — get-results LLM liveness / token sinks
No orphaned get-results agent or new token sink (e.g. reformulator) observed beyond the expected single reformulator fork call per turn. get-results ran as a deterministic MCP read (`rysSPgUssLDf6xJc`), no LLM. No new sink from this change.

## Acceptance vs plan §9
1. Flagship repro fixed — **PASS** (§24a).
2. Fuzzy pick — **N/A live** (resolver exact+prefix only); offline-covered.
3. Precedence intact — **PASS** (§24c).
4. Fallbacks / single-token / round-trips — **PASS** (§24d/f/g).
5. Map cleared — **PASS** (§24e).
6. Zero egress — **PASS** (S1–S6 all turns).
7. Promotable diff = 3 nodes/6 hunks — unchanged; but **NOT promote-ready** due to FINDING 1 (the D2-alternatives hunk over-broadly maps date-relaxation).

**Recommendation: REQUEST-CHANGES.** Flagship + defined cases pass and egress is clean, but FINDING 1 is a real customer-drop regression on a common, bot-invited flow (date-relaxed offer → date pick). Fix the D2/consume scoping before live promotion.

Driver helper: `scratchpad/drv.sh` (chat webhook fire + pg reset/show). Session row reset to `{"variables":{}}` after the suite.

---

# REVISION 2 — 2026-07-15 (re-test after FINDING 1 + FINDING 2 fixes)

Coder fixed FINDING 1 (date-relaxation hijack) + FINDING 2 (`for_hint`). Build side now excludes
date-relaxation alternatives from `dym_candidates` (`axis!=='date'` + `isCodeShaped`); consume side rejects
date-valued matches; `for_hint=entity_type`.

## Targets (re-verified live)
- Clone `txiPzSxy3Pclsz6v` — active versionId **`6af34046-2f4a-4773-8a9d-7e929ea41efd`** ✓
- Fork `wI5RkNGW3EOJfBdo` — active versionId **`732fdeeb-bced-432c-becb-64db0463a888`** ✓
- Wiring intact: clone `Call 'sub-query-reformulator'` → fork `wI5RkNGW3EOJfBdo` ✓
- Fix markers present: `build-suggest-offer` has axis-guard + `isCodeShaped`; `output_exchange` has `tryDymPick`
  + date-reject + `for_hint=entity_type` ✓
- Driver: same `chat-stateful` lane, contact 437264483, real fork (not replay). Session reset ONCE before the
  T1→T2→T3 chain; precedence cases each reset before their own T1.

## R2 VERDICT: PASS — FINDING 1 fixed, FINDING 2 fixed, flagship + precedence intact, §0 clean.

### R2.1 — FINDING 1 repro chain (the regression) — PASS (now clean)
Chain: reset → T1 → T2 pick → T3 date continuation.
- **T1** "I bath studio Srtwc286 delivery 13/07/26 to 15/07/2026". Persisted `dym_candidates` (verbatim):
  ```json
  [{"code":"SRTWC286-SH","uuid":"0d0ed752-fd6f-4759-ad8f-0b40e0cbc601","for_raw":"Srtwc286","for_hint":"product","entity_type":"product","for_canonical":null},
   {"code":"SRTWC286-SH-PP","uuid":"7a8f2543-ef3b-4e5f-9dad-e29f6f688485","for_raw":"Srtwc286","for_hint":"product","entity_type":"product","for_canonical":null},
   {"code":"SRTWC286-SH-NEW-150","uuid":"13ffa633-91db-4db6-9050-5de7a0deb9b8","for_raw":"Srtwc286","for_hint":"product","entity_type":"product","for_canonical":null}]
  ```
  **ASSERT met:** ONLY code corrections, NO date-valued entries. `for_hint` now `"product"` (= entity_type; FINDING 2 fixed). `selection_context=member_offer`.
- **T2 pick "SRTWC286-SH"** (clone exec 8713300; fork 8713301): flagship still works — entities=[customer I bath studio/300-I057 RETAINED, SRTWC286-SH replace in-place], `dym_pick_applied===true`, `scope_exclusive===false`, date 2026-07-13→2026-07-15 carried, domain order; `resolve-entity.tokens=["I bath studio","SRTWC286-SH"]`. Reply *"No delivery on 2026-07-13 to 2026-07-15. I bath studio has delivery on 2026-07-06…"*. **After T2 `dym_candidates=[]`** — the date-relaxed offer no longer builds date-valued entries (axis!=='date' guard). get-results still `relaxed_axis:date` with the 3 date alternatives (display only, not mapped).
- **T3 date reply "2026-07-06"** (clone exec 8713374; fork 8713375) — the exec-8711232 failure, now CLEAN:
  - **Entities BEFORE (prev state):** `[{customer "I bath studio"/300-I057}, {product SRTWC286-SH}]`.
  - **Entities AFTER (T3 output_exchange):** `[{raw:"I bath studio", hint:"customer", canonical_code:"300-I057", current_message:false}, {raw:"SRTWC286-SH", hint:"product", canonical_code:"SRTWC286-SH", uuid:0d0ed752, current_message:false}]` — **customer RETAINED, NOT replaced by "2026-07-06"**.
  - `dym_pick_applied` **ABSENT** ✓ (dym block did not fire; `dym_candidates=[]` + date-reject).
  - `entity_op:reuse`, `domain_reused_entityless:true`; `date_filter_start/end` updated normally to `2026-07-06`.
  - `resolve-entity.tokens=["I bath studio","SRTWC286-SH"]` — customer still present (NOT dropped, NOT the date).
  - Reply: only **I BATH STUDIO** order DO 202607-0573 (06/07) — customer scope retained.
  - **Contrast old failure (exec 8711232):** `dym_pick_applied:true`, entities=[{2026-07-06 hint:customer}, product], tokens=["2026-07-06","SRTWC286-SH"], all-customer results. **Regression FIXED.**

### R2.2 — Flagship §24a re-confirm — PASS (= R2.1 T2 above, new versions).

### R2.3 — Precedence quick re-confirm — PASS (guard unbroken, distinct)
- **NUMBER "2"** (exec 8713471): `member_pick_context:true`, `escalation.preferred_assignee_id:"12246ae8-59e0-46a1-9cf0-fd80f45c1db9"` (roster idx-2 Cyndi), **`dym_pick_applied` ABSENT** → member pick. HI via guarded fork `vUfFUDjLAuMaeQE6`, `is_test:true`, `explicit_assignee_id="12246ae8…"`.
- **"yes"** (exec 8713494): `is_affirmative:true`, `is_escalation_confirmation:true`, **no `preferred_assignee_id`** (round-robin), **`dym_pick_applied` ABSENT**. HI via guarded fork `vUfFUDjLAuMaeQE6`, `is_test:true`, `explicit_assignee_id=""`.

### R2 §0 zero-egress (S1–S6) — HOLDS every turn
Execs 8713300 / 8713374 / 8713471 / 8713494: replies via chat fork (`chat:reply`), no real send; `send-message-*` never executed; escalation only via guarded fork `vUfFUDjLAuMaeQE6` with `is_test:true` (would-write, no assign/SLA/PIC); `save-session-vars`+`update-human-intervened` never executed; session R/W to `n8n_test`; get-results read-only `rysSPgUssLDf6xJc`; mode `chat-stateful`.

## R2 findings
- **FINDING 1 — RESOLVED.** Date-relaxation no longer produces `dym_candidates`; a date continuation reply retains the customer (no hijack).
- **FINDING 2 — RESOLVED.** `for_hint === entity_type === "product"`.
- No new findings; no egress leak.

## R2 recommendation: APPROVE (promote-ready pending reviewer sign-off).
Flagship fixed, the FINDING 1 date-hijack fixed, precedence guard intact, map cleared, zero egress on every turn.
NB unchanged carry-overs: §24b fuzzy not exercisable live (resolver exact+prefix only; offline-covered); §17 numeric promotion round-trip not separately re-run.
Session row reset to `{"variables":{}}` after R2.
