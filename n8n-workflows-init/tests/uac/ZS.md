# UAC §ZS

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §ZS. Zero-stock completeness note

### §ZS-1 — multi-product stock, one resolved-empty (offline unit — PRIMARY GATE)  `scope: deterministic`
- **Trigger:** `check stock for SRTWT902, C2181XUW-P-ENG` (contact `437264483`). Pin the parser
  (`mock_reformulator_output`: `message_type:business_query`, `domain_hint:incoming`, both product entities)
  and pin `compile-current-state` inputs per plan §6: **`resolve-entity.resolutions`** = two single-exact
  product tokens `[{token:'SRTWT902', resolved:true, matches:[{product,'SRTWT902',match_tier:'exact'}]},`
  `{token:'C2181XUW-P-ENG', resolved:true, matches:[{product,'C2181XUW-P-ENG','exact'}]}]`; no dym pick;
  get-results `answers` = ≥1 row with `{label:'Product Code', value:'SRTWT902'}` and NO row for
  `C2181XUW-P-ENG`.
- **Expected branch/path:** happy answered inventory turn (`central-exchange`, `!manualResponse`,
  `!isEscalateBranch`); #3 block fires.
- **Structural assertions:** `user_response` ends `\n\nNo stock records found for: C2181XUW-P-ENG.`;
  `SRTWT902` NOT named; `variables.response` / `last_result_set` / `dym_offer` / `selection_context` /
  `quick_reply` byte-identical to the pre-change node on the same pinned input.
- **Safety:** §0 all. Offline unit → no egress node executes (S1 trivially); S4 get-results tool in READ
  allowlist, never a write tool; S5 `is_test:true`; S6 deterministic → 0 LLM tokens; S7a/S7b prod-sink delta
  zero (offline: no ingest at all).

### §ZS-1b — ★ NEW HARD CASE: bare typed code, resolver-expanded, some siblings stocked → NO #3 line (variant suppression)  `scope: deterministic`
- **The repro the revision fixes** (OLD #3 wrongly emitted `No stock records found for: SRTWT902-FRG, SRTWT902-GM-NL.`, tester OBS-1).
- **Trigger:** `check stock for SRTWT902` — a BARE code the customer typed once. Pin `resolve-entity.resolutions`
  = ONE ambiguous token whose `matches[]` carry the typed exact + four expansion siblings:
  `[{token:'SRTWT902', ambiguous:true, resolved:false, matches:[{product,'SRTWT902',match_tier:'exact'},`
  `{product,'SRTWT902-GM','prefix'},{product,'SRTWT902-GY','prefix'},{product,'SRTWT902-FRG','prefix'},`
  `{product,'SRTWT902-GM-NL','prefix'}]}]`. get-results `answers` = a `Product Code` row for `SRTWT902-GM`
  (and/or `SRTWT902`) but NONE for `-FRG`/`-GM-NL`. `domain_hint:'inventory'` (the domain the gate does NOT
  pre-exact-filter — where the OLD bug lived). `last_result_set.length >= 1`.
- **Expected:** **NO `No stock records found for:` line.** Typed set = `{SRTWT902}` only (the `prefix` siblings
  are excluded — never typed); family `{SRTWT902, -GM, -GY, -FRG, -GM-NL}` ∩ returned ≠ ∅ → `SRTWT902`
  satisfied → nothing named. `user_response` byte-identical to the no-#3 output.
- **Fail-on-purpose (MEMORY: green-that-cannot-fail):** repin every answer row to a NON-family code (e.g.
  `ABC123`) → family ∩ returned = ∅ → confirm `SRTWT902` IS then named. Proves the family gate can go red.
- **Structural assertions:** `-FRG` and `-GM-NL` NEVER appear in `user_response` (they were `prefix`-tier and
  must never enter the requested set, regardless of stock).
- **Safety:** §0 all (offline, as §ZS-1).

### §ZS-2 — dym multi-pick repro (two resolved-empty, PICKED → strict)  `scope: deterministic`
- **Trigger:** the repro — a prior did-you-mean offer, then pick `1,4,5,6,7` (contact `437264483`).
  On the answering turn pin `get-session-vars.…variables.dym_offer.picked` (and/or `qf.dym_offer_pick_code`)
  to include picks 1 `C2181XUW-P-ENG` and 5 `SRTWCY8605` (zero rows) plus 4/6/7 (have rows), and pin
  `resolve-entity.resolutions` carrying those picks as exact matches. get-results `answers` carry `Product
  Code` rows for 4/6/7 only.
- **Expected:** answer shows 4/6/7 stock rows + `\n\nNo stock records found for: C2181XUW-P-ENG, SRTWCY8605.`
- **Structural assertions:** exactly those two codes named, in query/pick order; the three with-stock codes
  NOT named; #3 writes only `user_response`. Picks are named **strictly** (family suppression does NOT apply
  to a pick — the customer chose that exact code).
- **Safety:** §0 all (as §ZS-1).

### §ZS-3 — all-resolved-with-stock → byte-identical no-op (HARD GATE)  `scope: deterministic`
- **Trigger:** §ZS-1 fixture reduced so BOTH products carry ≥1 returned `Product Code` row.
- **Expected:** `missing == []` → NO #3 line.
- **Structural assertions:** run the changed clone jsCode and the current LIVE `compile-current-state` jsCode
  against the same pinned input; `user_response` (and full output) **byte-identical**. This is the regression
  gate that blocks promote.
- **Safety:** §0 all.

### §ZS-4 — total-zero (all empty) → not-found path unchanged, #3 does NOT fire  `scope: deterministic`
- **Trigger:** all requested products return zero rows (get-results `answers:[]`, `has_result:false`).
- **Expected:** existing not-found/dead-end path; `last_result_set===[]`; NO `No stock records found for:` line
  (#3 must not turn a dead-end into a happy answer).
- **Fail-on-purpose check (MEMORY: green-that-cannot-fail):** temporarily flip the fixture to a 1-row answer
  and confirm the #3 line DOES appear — proves the `last_result_set.length>0` gate can go both ways before
  trusting the PASS.
- **Safety:** §0 all.

### §ZS-4b — domain gate (non-inventory answered turn)  `scope: deterministic`
- **Trigger:** an answered `order` turn with a resolved entity absent from the results.
- **Expected:** NO #3 line (`domain_hint` ∉ {inventory, incoming}); output byte-identical to today.
- **Safety:** §0 all.

### §ZS-5 — combined #2 + #3, correct order, no double-listing  `scope: deterministic` (N/A pending #2)
- **Trigger:** one resolved-empty product (#3) AND one unresolved did-you-mean token (#2) on the same
  inventory turn. Requires #2's `Couldn't find these:` append present in the clone `compile-current-state`.
- **Expected order (in `user_response`):** stock rows → `\n\nNo stock records found for: <resolved-empty>.` →
  `\n\nCouldn't find these: …` (#2 numbered dym block).
- **Structural assertions (disjointness):** the resolved-empty code appears ONLY in the #3 line (never in the
  dym block); the unresolved token appears ONLY in the #2 block (never in the #3 line). Confirms the (tighter,
  revised) structural guarantee: #3's TYPED set = tokens that are `resolved===true` OR carry an exact match;
  #2's `missResolutions` = `resolutions.filter(res.resolved !== true && !res.matches.some(isExact))` — these
  are **mutually exclusive by construction** (a token with an exact match, e.g. an expanded `SRTWT902`, is in
  #3 and explicitly excluded from #2; a multi-prefix-no-exact token is in #2 and skipped by #3; picks resolve
  exact → #3 only). No code can appear in both blocks.
- **Status:** if #2 is not yet in the clone, record **N/A pending #2** (do not block #3 promote on it).
- **Safety:** §0 all.

### §ZS-6 — e2e regression (real reformulator, best-effort)  `scope: deterministic` (E2E is parser-tier run, change stays deterministic)
- **Trigger:** via `chat-stateful`, contact `437264483`: **(6a)** bare `check stock for SRTWT902` (the OBS-1
  repro); **(6b)** `check stock for SRTWT902, C2181XUW-P-ENG`; **(6c)** (fresh) the dym multi-pick `1,4,5,6,7`.
- **Expected — the OLD-BUG NON-RECURRENCE is the point of 6a:** 6a → NO `No stock records found for:` line
  mentioning `SRTWT902-FRG`/`SRTWT902-GM-NL` (or any `-*` sibling `SRTWT902` was expanded into) — this is the
  behavior the revision fixes; if any SRTWT902 family variant has stock, expect NO #3 line at all. 6b →
  `SRTWT902` (family) suppressed + `No stock records found for: C2181XUW-P-ENG.` (only the typed empty code).
  6c → `No stock records found for: C2181XUW-P-ENG, SRTWCY8605.` (picks, strict).
- **Data-drift caveat:** exact stock is live-data-dependent; if data drifted, record **unverified** for the
  presence/absence of a specific code — BUT the sibling-non-recurrence assertion (no un-typed `-*` variant
  ever named) is a HARD assertion that must hold regardless of stock. V-ZS0/§ZS-1/§ZS-1b remain the gate.
- **Safety:** §0 all; real-reformulator run uses the FULL clone (subs `is_test:true`, egress orphaned/sinked);
  S6 → only the reformulator LLM runs; S7a/S7b prod-sink delta zero/attributed.

**Promotion:** 1-node business diff (`compile-current-state`, target by NAME), user-gated, backup-first,
byte-SHA gated both sides (LESSON 57/58); independent of #1 (`build-suggest-offer`) and #2 (parser). If #2
promotes in the same window, build target as live + both hunks and re-diff (LESSON 57).

---

# Change: `dym-all-and-domaincarry` (#4 select-ALL + #5 pick-domain-carry) — scope `parser`, **touches LIVE parser**

Plan `../plans/dym-all-and-domaincarry-plan.md`. Two additive hunks on the parser sub's `output_exchange`
(`847a1173`, live `XTODTw` / fork `wI5RkNGW3EOJfBdo`): **#5** forces a confirmed dym pick to stay in
`dym_offer.domain` (inside the shared `applyDymPick`); **#4** makes "all" select every did-you-mean suggestion
(a `_dymActive` branch in the ALL/SEMUA block routing through `dymNumberedMultiSelect`). No systemMessage
change, no spine change. Both are INSIDE the reformulator → invisible to `mock_reformulator_output`
(LESSON 28): flagship gates are 0-token OFFLINE units on `output_exchange`; round-trips use the REAL
reformulator. Folds into #2's parser publish (LESSON 57 build target = live + own hunks, node NAME,
byte-SHA both sides). Section names are `§ALL` (#4) and `§DC5` (#5) — the `5` disambiguates from the
pre-existing `§DC-0/1/2` (a different change).

> ⚠️ The fork ALREADY carries #2 v3 (`reference_target`, `dymNumberedMultiSelect`, `applyDymPick`),
> `dym_offer` (dym-single-use), #1 dym helpers, and domain-continuity rev4. #4/#5 are additive on top.
