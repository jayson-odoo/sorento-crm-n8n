# UAC §MT0

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §MT0. Offline `build-suggest-offer` unit  (0-token, no seed) — PRIMARY GATE (plan §6 V-MT0)

Pin `$()` sources via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`, reformulator `q`
(`Call 'sub-query-reformulator'.output`), `disallowed-entity-gate`. No LLM, no egress.

**Fixture (all 3 tokens unresolved, each with its OWN alternatives; domain = stock/inventory; every
token hint=product; all candidates non-exact `match_tier`, `entity_type:'product'`, non-uuid
`canonical_code`, `uuid` present):**

| token (`res.token` / parser `raw`) | candidate codes (resolver rank order) | cap3 kept |
|---|---|---|
| `C21263XUW-P-ENG` | C2181XUW-P-ENG(0.55), C21131XUW-P-ENG, C21132XUW-P-ENG, BRC21263XUW-P-MY, C21133XW-P-ENG | C2181XUW-P-ENG, C21131XUW-P-ENG, C21132XUW-P-ENG |
| `Bravat C01014UW-P-ENG` | BRCX01014UW-P-ENG | BRCX01014UW-P-ENG |
| `Sorento SRTWCY8605-RL` | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL |

Gate fixture: `require_specific:false`, `gate_debug.allowed_lookup` includes `product`,
`gate_debug.domain:'inventory'`, `compatible_entities:[]`. Input item `is_clarification:false`. Parser
`q.routing.suggested_team` omitted → `team` defaults to `customer_service`.

### §MT-1 ★ — multi-token numbered multi-block (the fix)  — PRIMARY
- **HARD ASSERT (all must hold):**
  1. `out.suggest_offer===true`, `out.suggest_selection_context==='suggest_offer'`.
  2. `out.suggest_response` has **3 per-token blocks**, each with its own token label
     (`"C21263XUW-P-ENG"`, `"Bravat C01014UW-P-ENG"`, `"Sorento SRTWCY8605-RL"`) and its own candidate
     lines. Begins `Couldn't find some items:`; ends
     `Reply a number to pick, or 'yes' to escalate to customer_service.`
  3. **Global numbering contiguous 1..7** (cap3 + 1 + cap3 = 3+1+3): block A = 1,2,3; block B = 4;
     block C = 5,6,7.
  4. `out.suggest_last_result_set` **length 7**, `idx` 1..7 contiguous, `value`/`product` = the
     candidate codes in order (row1=`C2181XUW-P-ENG` … row7=`SRTWC8605-SC-RL`), each `entity_type:'product'`.
  5. `out.dym_offer.candidates` **length 7**, each `for_raw` == its source token — rows 1-3
     `for_raw:'C21263XUW-P-ENG'`, row 4 `for_raw:'Bravat C01014UW-P-ENG'`, rows 5-7
     `for_raw:'Sorento SRTWCY8605-RL'`; each `code` = its candidate code; `for_hint:'product'`.
     `out.dym_offer` = `{id:<exec id>, domain:'inventory', ttl:3, candidates:[7], picked:[]}`.
  6. `out.suggest_quick_reply` = exactly two comma-stripped buttons — the string
     `Yes escalate,No it's okay`. **No number buttons** (numbers are typed).
- **Safety:** §0 all — offline unit, zero egress; egress log empty.

### §MT-R ★ — single-token miss BYTE-IDENTICAL to today  — HARD REGRESSION GATE
- Reduce the §MT0 fixture to **token A only** (`C21263XUW-P-ENG` + its 5 alts).
- **HARD ASSERT:** output is **byte-identical** between (i) the current live `build-suggest-offer`
  jsCode and (ii) the changed clone node — i.e. code-mode message
  `Couldn't find "C21263XUW-P-ENG". Did you mean C2181XUW-P-ENG, C21131XUW-P-ENG, or C21132XUW-P-ENG? Reply with a code to continue, or would you like me to escalate to customer_service team?`,
  `suggest_quick_reply` = the 3 codes + `Yes escalate` + `No it's okay`, `suggest_last_result_set`
  length 3 (label=value=code), `dym_candidates` length 3 all `for_raw:'C21263XUW-P-ENG'`. Method: run
  the same pinned fixture against both jsCodes and diff.
- **Safety:** §0 all — offline unit, zero egress.

### §MT-cap — >5 missed tokens capped at 5 blocks
- Fixture: **6** missed product tokens, each with ≥1 candidate.
- **HARD ASSERT:** exactly **5** per-token blocks rendered; `suggest_last_result_set` length ≤ 15;
  idx contiguous 1..N with no gap.
- **Safety:** §0 all — offline unit.

### §MT-drop — token whose candidates all drop is SKIPPED (contiguous idx preserved)
- Fixture: §MT0 but the MIDDLE token (`Bravat C01014UW-P-ENG`)'s only candidate is a **bare uuid with
  no display name** (→ `humanLabel` returns null, dropped).
- **HARD ASSERT:** the middle token's block is **omitted**; only 2 blocks render (A then C); idx stays
  contiguous with NO gap (block A = 1,2,3; block C = 4,5,6); `dym_offer.candidates` length 6, none with
  `for_raw:'Bravat C01014UW-P-ENG'`.
- **Safety:** §0 all — offline unit.

### §MT-roundtrip — pick round-trip E2E (regression, best-effort, real reformulator)
`output_exchange` is **not edited** by this change, so this is a regression guard, not the gate.
Driver: `chat-stateful` (reset `respond_contacts_test` ONCE before T1). T1 = the §MT0 stock query.
- **§MT-roundtrip-num — NUMBER reply.** T2a = `5`. **ASSERT** T2 resolves via the fork positional path
  (`reference_positions=[5]` → `last_result_set[idx=5]` → entity `canonical_code='SRTWCY8605'`),
  domain `inventory`, get-results scoped to that code.
- **§MT-roundtrip-code — CODE reply (per-token `for_raw`).** T2b (fresh T2) = `SRTWC8605-SC-RL` (a
  candidate of the LAST token). **ASSERT** `tryDymPick` fires (`dym_pick_applied===true`), and the
  entity replaced is the one for `for_raw:'Sorento SRTWCY8605-RL'` — proving each candidate's own
  `for_raw` maps a code to the CORRECT source token (not token A's).
- **If** the real resolver/gate cannot be made to emit `require_specific:false` for a 3-product
  all-miss, **skip and record as UNVERIFIED** — §MT0 + §MT-R remain the gates. Change scope stays
  `deterministic` (output_exchange unedited).
- **Safety:** §0 all — reply via `chat:reply`; no send/assign/SLA/PIC/session-PUT; every sub `is_test`.

### Coverage / notes (this change)
- Scope `deterministic`. **Single-node** business diff: `build-suggest-offer` (`7972abd8`) only.
  `compile-current-state` (`0804657c` live / `7a130a0c` clone) reads the D1 output length-agnostically
  (`suggest_last_result_set`, `dym_offer`, `dym_candidates` mirror) — no edit. Fork `output_exchange`
  (`847a1173`) pick round-trip is pre-existing machinery — no edit.
- Round-trip: NUMBER → positional (`last_result_set[idx]`); CODE → `tryDymPick` by `code` then `for_raw`.
  Both confirmed against the unedited fork. Per-token `for_raw` is what makes a code pick replace the
  right token; the number path replaces wholesale (fine when no prior customer/date, as in the stock miss).
- Only `d1s.length > 1` triggers the numbered multi-block; `===1` reuses the existing single-token
  block verbatim (§MT-R gate). `dym-single-use` lifecycle (ttl/picked in compile-current-state) unchanged.
- Promotion: 1-node, user-gated, backup-first, byte-SHA gated (LESSONS §57/§58).

---

# Change: `dym-partial-success` (surface missed tokens on the ANSWERED happy path)

> ⛔ **HALTED / SUPERSEDED 2026-07-31** by `# Change: dym-partial-disambiguation` (§PD below). §PS-safety
> FAILED: a bare number already resolves a stock row today (`output_exchange` byIdx block is NOT gated by
> `selection_context`), so overwriting `last_result_set` destroys the live stock positional-pick affordance.
> §PS-1/§PS-zerocand functional logic was correct but is MOOT under the HALT — the pick wiring changes.
> The §PS cases below are retained for history; **do not run §PS as a promote gate.** Run **§PD** instead.

Plan: `../plans/dym-partial-success-plan.md` (**HALTED**). **Scope tag `deterministic`** — the only edited node is the
spine Code node `compile-current-state` (live `0804657c` / clone `7a130a0c`). All its `$()` inputs
(`resolve-entity`, `disallowed-entity-gate`, `central-exchange`, reformulator `q`, `get-session-vars`)
are pinnable → primary gate is a 0-token offline unit. No parser prompt edit; `build-suggest-offer`
(`7972abd8`) and fork `output_exchange` (`847a1173`) are **NOT edited** (we REUSE build-suggest-offer's
D1 detection logic; the pick round-trip is pre-existing machinery). Build/test on CLONE `txiPzSxy3Pclsz6v`;
NEVER live spine `9qVyfUxmRQqrpGRMDLRuz`. Every case bound by §0.

**Problem:** a multi-entity query where SOME tokens resolve and SOME miss (e.g.
`SRTW808 @3 SRTW809 @2 SRTWT902 @5 check stock`): `SRTWT902` resolves → gate `compatible_entities≥1` →
`If3` PROCEEDS → happy stock answer; `SRTW808`/`SRTW809` misses **VANISH** (build-suggest-offer never runs
on the happy path, and the dym lifecycle KILLS any offer on an answered turn — clone `7a130a0c` line 248
rule 5). Fix: on the answered happy path, surface the misses numbered under the stock answer and arm a
pick context by repurposing `last_result_set`.

**Verified read-only this cycle:** (A) `resolve-entity` keeps per-token `resolutions[]` + `alternatives`
for the unresolved tokens in a partial resolve — CONFIRMED at CRM source `entity_resolver.py` 3523-3544
(per-token independent; trigram alternatives on empty-match tokens). (B) `output_exchange` (`847a1173`)
positional path keys `byIdx` on `last_result_set[i].idx` and treats `selection_context==='suggest_offer'`
as a pick-context (lines 371, 399-435); code path `tryDymPick` matches `code` then `for_raw` (158-218).
(C) `user_response` (customer) = `central-exchange.response`, distinct from `variables.response`
(compressed parser view) — append to `user_response`.
