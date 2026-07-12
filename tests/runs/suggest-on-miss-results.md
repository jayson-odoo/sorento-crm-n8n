# Suggest-on-Miss — verified test results (2026-07-05)

Target: clone `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`, `mode:uac` (real resolver +
real get-results vs prod, egress blocked). Reformulator fork `CpxE8LroLzCkrAQN`.
get-results fork `sub-get-results TEST` `rysSPgUssLDf6xJc` (published).
All runs terminate at `guard-h-record` with `is_test:true` → **zero real egress**.

## Deltas verified

| Delta | Result | Exec |
|---|---|---|
| **D1 resolution-miss did-you-mean** | ✅ **PASS e2e** | 7539648 |
| **D2 data-miss alternatives** | ✅ **PASS e2e** | 7541005 |
| Regression: has-data unchanged | ✅ PASS | 7501639 |
| Regression: no-candidate miss = old dead-end | ✅ PASS | 7501422, 7539495 |
| Zero egress (all runs) | ✅ PASS | all |
| **D4/D5 catch** | ⚠️ logic complete, crash fixed; **e2e blocked by harness** (no session round-trip in uac) | 7541209→7541450 |

## D1 — `list price for SRTKT71SX` (exec 7539648)
- **resolve-entity (intermediate):** `resolutions[0].alternatives` = `SRTKT71SS`(0.667), `SRTKT71SS-BL`, `SRTKT71SS-GM`, `SRTKT71SS-GY`, `SRTKT71SS-FRG` (product, trgm).
- **build-suggest-offer:** `suggest_offer:true`.
- **bot message:** `Couldn't find "SRTKT71SX". Did you mean SRTKT71SS, SRTKT71SS-BL, or SRTKT71SS-GM? Reply with a code to continue, or would you like me to escalate to purchasing_product team?`
- **quick_reply:** `SRTKT71SS,SRTKT71SS-BL,SRTKT71SS-GM,Yes, escalate,No, it's okay`
- **persisted:** `last_result_set` (3 codes w/ uuid), `selection_context:suggest_offer`.

## D2 — `SRTWC8601-RL got stock?` (exec 7541005)
- **resolve-entity:** exact single `SRTWC8601-RL`.
- **get-results (fork) intermediate:** `has_result:false`, `alternatives:[SRTWC8601-P-RL(0.867), SRTWC8601-300-RL(0.765), SRTWC8601-S-200-RL(0.722)]`, `relaxed_axis:entity`.
- **bot message:** `No stock for SRTWC8601-RL. Try: SRTWC8601-P-RL, SRTWC8601-300-RL, SRTWC8601-S-200-RL. Reply with a code to continue, or would you like me to escalate to warehouse team?`
- **quick_reply:** `SRTWC8601-P-RL,SRTWC8601-300-RL,SRTWC8601-S-200-RL,Yes, escalate,No, it's okay`

## M4 — `Living Portal got delivery today?` (exec 7542219) — DATE axis
- resolve: Living Portal → multiple customer accounts.
- get-results (order): empty for 2026-07-05 → `relaxed_axis:"date"`, `alternatives:[2026-07-02(DO 202607-0503), 2026-06-29(DO 202606-3601), 2026-06-26(DO 202606-3600)]`.
- **bot:** `No delivery on 2026-07-05. Living Portal has delivery on 2026-07-02 (DO 202607-0503); 2026-06-29 (DO 202606-3601); 2026-06-26 (DO 202606-3600). Reply with a date to continue, or would you like me to escalate to customer_service team?`
- **quick_reply:** `2026-07-02,2026-06-29,2026-06-26,Yes, escalate,No, it's okay` — dates+DOs persisted.

## M5 — `Please share SRTWT2207 photo` (exec 7542079) — ATTACHMENT, product-neighbour
- get-results (attachment): empty → `relaxed_axis:"entity"`, `alternatives:[SRTWT2207-NL(variant,0.769), SRTWT2200(0.667), SRTWT2205(0.667)]` — **neighbour PRODUCT codes** (incl the -NL variant that actually holds the photo), NOT other document types. ✅ user requirement.
- **bot (after phrasing fix):** `No document for SRTWT2207. Try: SRTWT2207-NL, SRTWT2200, SRTWT2205. Reply with a code to continue, or would you like me to escalate to marketing_product team?`
- quick_reply = 3 product codes + Yes/No. (Pre-fix render said "No that document…"; NOUN map fixed → `document`/`promotion`.)

## M1 — `Can check stock balance srtkt71-ss` (exec 7542517) — DASH→EXACT, regression-safe
- resolve: `srtkt71-ss` → `SRTKT71SS` **match_tier:"exact"** (dash-insensitive), `unresolved_tokens:[]`.
- get-results: `has_result:true` (10 rows), `alternatives:[]`.
- **build-suggest-offer NOT reached** (has-data → happy path). Normal stock list, **no quick_reply**. Dash variant does NOT trigger false did-you-mean. ✅
- (Harness note: first attempt denied at check-access `deny_unknown_agent` — mock `suggested_agent` must be a KNOWN agent, e.g. `general_enquiries`; `stock_enquiries` is unknown.)

## M2b — `I need the certificate of WC 8609` (exec 7542601) — CRM resolver gap, safe fallback
- resolve: `WC 8609` matched **attachment files** (`MWC8609-RL.jpg`, entity_type `attachment`), NOT product `MWCY8609`. `certificate`→attachment_type Certification.
- get-results (attachment): empty, `alternatives:[]`.
- **build-suggest-offer: `suggest_offer:false`** — domain-type filter correctly rejects attachment-file matches as product did-you-mean candidates (won't suggest filenames).
- **bot:** `Could not find a certificate for product WC 8609. Would you like me to escalate to purchasing_certification team?` — plain escalate, no false suggestion. ✅
- **EXPECTED (confirmed by user):** WC8609 genuinely has NO neighbour products → correct outcome is no result + no alternatives + escalate. NOT a gap. Domain-type filter + empty-alternatives both behaved right.

## Casual — `Hai` (real parser, exec 7542277) — NO suggestion
- parser → `casual`, no domain/entities → `Hello! Hope you're having a great day. How can I help you today?` — `result_set:[]`, **no quick_reply**, no escalation injected. ✅

## Regression — `SRTWC8066 got stock?` (exec 7501639)
- 23 stock rows → normal reply, **no `alternatives`, no `quick_reply`**, byte-identical to pre-change. Suggestion path not entered.

## Bugs found + fixed during testing
1. **D1 field mismatch** — `build-suggest-offer` read `matches[]` only; CRM moved candidates to `resolutions[].alternatives`. Fixed: collect both + domain-`allowed_lookup` type filter (also hardens the attachment-for-stock false-positive). Verified 7539648.
2. **D2 multi-run miss** — multi-tool queries run get-results ≥2×; `.first()` read the last (empty) run. Fixed: scan all runs, take first non-empty `alternatives`. Verified 7541005.
3. **Catch node crash** — fork `suggest-follow-up` was `runOnceForEachItem`, where `.first()` is illegal → crashed EVERY real-parser turn. Fixed: `runOnceForAllItems` + republished. Verified no-crash 7541450.

## CRM-side enhancements confirmed live (real MCP output captured)
- `references/resolve` now returns `resolutions[].alternatives` (trgm product neighbours). exec 7539495.
- get-results MCP `view=render` returns top-level `alternatives`+`relaxed_axis` on empty. exec 7539753 (`MCP Client1` raw).

## D4/D5 catch — ✅ VERIFIED (isolated, via probe `zz-som-catch-probe` ETA9mCF3O1jHP4qT)
Drove the reformulator fork directly with a crafted `previous_conversation_state`
(suggest_offer + 3-item `last_result_set`) and each reply. All 3 arms pass:
- **`1` (position pick)** → exec 7541795: `domain_hint:master_products` RETAINED, `reference_positions:[1]` → `entities:[{raw:SRTKT71SS, uuid:192f…, canonical_code:SRTKT71SS, current_message:true}]`, `message_type:business_query`, `suggest_pick_context:true`.
- **`yes`** → exec 7541843: `is_affirmative:true` → `escalation.is_escalation_confirmation:true`, entities cleared.
- **`No, it's okay`** → exec 7541882: `is_affirmative:false` → `message_type:casual`, no escalate, entities cleared.

Full clone 2-turn (exec 7541450) fails ONLY because `uac` mode can't round-trip session
(reads real prod session, session-WRITE orphaned for safety). Logic is proven; the
clone-level 2-turn needs regress-capture mode or session enabled. Crash from the fork
`suggest-follow-up` node (was `runOnceForEachItem`) fixed → `runOnceForAllItems`.

Minor cosmetic: resolved-pick entity `hint` = domain name (`master_products`) not
`product` — harmless because the row carries `uuid`+`canonical_code` (get-results uses
those, no re-resolve). Polish later if desired.

## Gate B — golden-master replay (selective, replay_run_id=10)
Baseline golden_run **9** (`baseline-full-v1`, captured 2026-06-27). Selective sample: 4
whole conversations (session order preserved) = **96 turns** (423779375, 428334748,
406994930, 404280950). 96/96 completed, mode=regress-replay (0 egress, all externals pinned).

**Summary:** match 2844 · volatile 791 · new 101 · regression 856 · **missing 0** · no crash.

⚠️ **Baseline is STALE** — golden_run 9 predates ~4 features shipped to the clone since
2026-06-27 (friendly catalogue suffix, friendly not-found phrasing, member-pick, cert
routing). So raw `regression` count is contaminated by intervening changes, NOT just
suggest-on-miss. Every regression attributed:

**Non-send (bulk):**
- `compile-current-state` / `session-save-gate` / `guard-d-record` / `Loop Over Items1` — **96 each** = the additive `selection_context:null` session key on EVERY turn (my change). Benign, purely additive.
- `get-session-vars` / `pg-get-session` (92) = next-turn reads of that key. Cascade of same.
- `Switch` (76), `get-presigned-url` (20) = **volatile signed URLs** (AWS sig date 20260627→20260705). False positives; diff-normalizer doesn't strip URL-embedded dates.
- `tag-not-found`/`guard-e/g-record`/`Switch` passthrough = item carries the extra key.

**Send node (customer-visible), 28 regressions, fully bucketed:**
- **HASDATA — 10 turns** (751,753,31675,31677,34017,34580,34687,34938,34944,37721): product/stock body **BYTE-IDENTICAL** (`split on P/S` equal); only the prior catalogue-suffix `P/S …😊` appended. **ZERO data corruption.**
- **MINE_SUGGEST — 4 turns** (31972,32006,34690,34860): quick_reply set → my suggestion fired on real historical misses. e.g. 34690 `SRTUB6503-BL`→"Did you mean RT-CB230180, SRTMFV207-NL, SRTMFV107-WEPLS?". **The wins.**
- **MISS_PHRASING — 14 turns**: friendly not-found rephrase ("Could not find a X for product Y") = prior shipped feature, not mine.

**Verdict:** No data corruption, no missing nodes, no crash across 96 real turns. My change's
entire footprint = (a) benign additive `selection_context` key + (b) intended suggestions on
4 real misses. Clean. For a pure 0-regression number, capture a FRESH pre-change golden
(current golden is 8 days + 4 features stale) — optional.

## Post-review fixes (2 bugs from user review of Gate B wins) — verified
User flagged 3 defects in real-miss renders. Root causes + fixes in `build-suggest-offer`:
1. **Cross-token candidate borrowing** (turn 34690): `collectCandidates` aggregated matches across ALL resolver tokens → a dead `SRTUB6503-BL` in a 24-item order suggested `RT-CB230180/SRTMFV207-NL/SRTMFV107-WEPLS` (neighbours of OTHER list items). FIX: **per-token, genuine-miss-only** — a did-you-mean uses only the missing token's OWN matches/alternatives; tokens that had an exact match (ambiguous-with-data) are not misses.
2. **Attachment noun** (turn 4/M5): said "No that document" / generic. FIX: attachment domain names the asked type (`photo`/`certificate`) via the `attachment_type` entity, else "document".
3. **Junk-token label** (turn 31972): `gambar` had empty matches but was labeled. FIX (via #1): a candidate-less token gets no did-you-mean; falls to the existing not-found ("a gambar for product SRTMCB6084-WH").
   - **CORRECTION on root cause:** the PARSER is fine — golden shows it tagged `gambar` `hint:attachment_type` (domain product_attachment). The gap is the **CRM resolver**: its attachment_type synonym list is English-only ("certificate" resolved in M2b; `gambar` did not) → `gambar` went to `unresolved_tokens`. CRM follow-up = add Malay/locale synonyms (`gambar`,`foto`,…) to the Photos attachment_type. Then `gambar`→Photos resolves → get-results empty → `alternatives:[SRTMCB6084-WH-DF]` → D2 auto-renders "No photo for SRTMCB6084-WH. Try: SRTMCB6084-WH-DF".

Verified (replay run 11 + uac):
- 34690 → `Could not find inventory for … SRTUB6503-BL …` escalate, **no irrelevant did-you-mean**. ✓
- 31972/32006 → `Could not find a gambar for product SRTMCB6084-WH…` no bogus suggestion. ✓
- M5 (7547987) → `No photo for SRTWT2207. Try: SRTWT2207-NL, SRTWT2200, SRTWT2205…`. ✓
- 34860 (control) → still fires, now self-consistent: `Couldn't find "Srtwcx7405-RL". Did you mean SRTWCX7405-RL-P-PJ, or SRTWCX7405-RL-S-PJ?`. ✓
- D1 SRTKT71SX (7548033) regression check → still fires unchanged. ✓  Zero egress all runs.

## attachment_type i18n normalization (parser fork) — SHIPPED to fork, verified
Instead of maintaining CRM synonym lists, normalize in the PARSER (language-agnostic).
Fork `CpxE8LroLzCkrAQN` (published, activeVersion 3abfede9), 3 edits via API PUT:
- AI Agent systemMessage: entity shape gains `canonical_code`; attachment_type rule → set `canonical_code` to the English kind (photo|image|technical drawing|3D model|certificate), translating any language (gambar/foto→photo, sijil→certificate, …). EXCEPTION: authority/brand certs (SPAN/SIRIM/BOMBA/MS####/Halal/Watermark) keep `canonical_code:null`, raw = body name.
- `output_exchange`: for attachment_type entities with `canonical_code` set, mirror it into `raw` (resolver + get-results read `entity.raw`, which is `entities.map(x=>x.raw)`).

Verified end-to-end (uac, real parser+resolver+get-results, zero egress):
- `Boleh bagi i SRTMCB6084-WH gambar tak ?` (exec 7549149): parser → `{raw:"photo",canonical_code:"photo"}`; resolver tokens `[SRTMCB6084-WH, photo]` → photo resolved to "Product Photos"; **get-results DELIVERED the actual photo** ("I have attached the file(s) below … SRTMCB6084-WH - copy.jpg"). No longer a miss — the Malay word was the only blocker.
- SPAN regression guard `Can I get the SPAN cert for SRTWC8601-RL` (exec 7549224): parser kept `{raw:"SPAN",canonical_code:null}`, routing `purchasing_certification` preserved, resolver matched the SPAN cert. Exception works — shipped cert routing intact.
- Products keep `canonical_code:null` → output_exchange leaves them alone (no non-attachment side effects).

Note: golden replay (Gate B) pins the parser from golden, so it won't reflect this change; validate parser edits via uac/probe.

## NOT yet run
- D4/D5 catch full clone 2-turn e2e (needs session-persistent harness; logic proven via probe).
- Promotion: parser normalization must also go to the LIVE reformulator sub `XTODTw-dJcV0uRdC056hG` (currently only on fork `CpxE8LroLzCkrAQN`).
- Optional: fresh pre-change golden capture for a contamination-free Gate B number.

## Artifacts / state
- Clone `txiPzSxy3Pclsz6v`: `build-suggest-offer` (D1+D2), `compile-current-state` threading, `Call 'sub-get-results'`→fork. DRAFT (manual runs use it).
- get-results fork `rysSPgUssLDf6xJc`: published, output-structurer +2 lines (`alternatives`,`relaxed_axis`).
- Reformulator fork `CpxE8LroLzCkrAQN`: `suggest-follow-up` node, published.
- LIVE spine + LIVE subs: untouched. Promotion still user-gated.
