# UAC §PS0

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §PS0. Offline `compile-current-state` unit  (0-token, no seed) — PRIMARY GATE (plan §6 V-PS0)

Pin `$()` sources via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`,
`disallowed-entity-gate`, `central-exchange`, reformulator `q` (`Call 'sub-query-reformulator'.output`),
`get-session-vars`. No LLM, no egress.

**Fixture (partial-miss stock query — 1 resolved product + 2 unresolved tokens each with own
`alternatives`; domain=inventory; all hints product; all candidates non-exact `match_tier`,
`entity_type:'product'`, non-uuid `canonical_code`, `uuid` present):**

| token (`res.token` / parser `raw`) | resolver state | candidate codes (rank order) | cap3 kept |
|---|---|---|---|
| `SRTWT902` | `resolved:true`, 1 exact match → **excluded from misses** (this is the ANSWER) | — | — |
| `SRTW808` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8081-P(0.58), SRTW8082-P, SRTW8083-P | all 3 |
| `SRTW809` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8091-P | SRTW8091-P |

Gate: `compatible_entities` contains resolved `SRTWT902`, `require_specific:false`,
`gate_debug.allowed_lookup` includes `product`, `gate_debug.domain:'inventory'`.
`central-exchange.response` = the SRTWT902 stock text; `central-exchange.items` = ≥1 SRTWT902 stock item.
`q.message_type='business_query'`, `q.domain_hint='inventory'`, `q.entities` include raw
`SRTW808`/`SRTW809`/`SRTWT902`. `get-session-vars.variables` empty. `$execution.id` = `<exec>`.

### §PS-1 ★ — partial-miss numbered append + armed pick context (the fix)  — PRIMARY
- **HARD ASSERT (all must hold):**
  1. `user_response` = the SRTWT902 stock answer (prefix UNCHANGED), FOLLOWED BY a blank line and a
     `Couldn't find these:` block: `"SRTW808" — did you mean:` (lines `1. …`,`2. …`,`3. …`) then
     `"SRTW809" — did you mean:` (line `4. …`), footer `Reply a number to check it, or ask again.`
  2. **Global numbering contiguous 1..4** (cap3 + 1): SRTW808 = 1,2,3; SRTW809 = 4.
  3. `variables.last_result_set` **length 4**, `idx` 1..4 contiguous, `value`/`product` = candidate codes
     in order (row1=`SRTW8081-P` … row4=`SRTW8091-P`), each `entity_type:'product'`.
     `variables.selection_context === 'suggest_offer'`.
  4. `variables.dym_offer.candidates` **length 4**, each `for_raw` == its source token — rows 1-3
     `for_raw:'SRTW808'`, row 4 `for_raw:'SRTW809'`; each `code`=its candidate code; `for_hint:'product'`.
     `variables.dym_offer` = `{id:'<exec>', domain:'inventory', ttl:3, candidates:[4], picked:[]}` — the
     offer **SURVIVED** the `_answered` kill. `variables.dym_candidates` mirrors those 4.
  5. `quick_reply` **unset/null** (numbers typed → no buttons).
  6. `variables.response` (compressed parser view) = the SAME `Previous turn (inventory): returned N …`
     as today (unchanged); miss text lives ONLY in `user_response`.
- **Safety:** §0 all — offline unit, zero egress; egress log empty.

### §PS-R ★ — no-miss happy path BYTE-IDENTICAL to today  — HARD REGRESSION GATE
- Reduce the §PS0 fixture to **`SRTWT902` alone** (all tokens resolve; no misses).
- **HARD ASSERT:** output **byte-identical** between (i) current live `compile-current-state` jsCode and
  (ii) the changed clone node — NO appended text, `variables.last_result_set` = the stock rows exactly as
  today, `variables.selection_context` null, `variables.dym_offer` lifecycle unchanged (rule 5 kills a
  carried offer on the answered turn). Method: run the same pinned fixture against both jsCodes and diff.
- **Safety:** §0 all — offline unit, zero egress.

### §PS-zerocand — missed token with NO candidates → plain line, picker NOT armed
- Fixture: §PS0 but ONE missed token (`ZZZQ999`) with **empty `matches` AND empty `alternatives`**
  (SRTWT902 still resolves + answers).
- **HARD ASSERT:** `user_response` gains a plain `"ZZZQ999"` line under `Couldn't find these:` with the
  **no-number-invite footer** (`Ask again with the correct code.`); `variables.last_result_set`
  UNCHANGED (the SRTWT902 stock rows); `variables.selection_context` null; `variables.dym_offer` follows
  today's answered-turn rule (no armed offer). Proves the `M===0` branch never arms an empty picker.
- **Safety:** §0 all — offline unit.

### §PS-safety ★ — plain-stock `last_result_set` is NOT pickable today (the repurpose is safe)  — CRITICAL, on UNEDITED node
- Prove, on the **UNEDITED** `compile-current-state` + fork `output_exchange`, that a plain/partial stock
  turn does not arm a positional pick today, so overwriting `last_result_set` on the partial path
  displaces nothing pickable.
- Method: pinned `output_exchange` unit with `prevState.selection_context=null`,
  `prevState.last_result_set=[stock rows idx 1..N]`, no `referenced_result_set`, reply message `"2"`.
- **HARD ASSERT:** `output.output.entities` are NOT the stock row at idx 2 (`_pickCtx` false → no
  auto-`reference_positions`; the byIdx block does not resolve a bare number without a pick context).
  **If a bare number DOES resolve a stock row today → HALT**; the design must add a guard before promote.
- **Safety:** §0 all — offline unit, zero egress.

### §PS-roundtrip — pick round-trip E2E (regression, best-effort, real reformulator)
`output_exchange` is **not edited**, so this is a regression guard, not the gate. Driver: `chat-stateful`
(reset `respond_contacts_test` ONCE before T1). T1 = the §PS0 partial-miss stock query.
- **§PS-roundtrip-num — NUMBER reply.** T2a = `1`. **ASSERT** T2 resolves via the fork positional path
  (`reference_positions=[1]` → `last_result_set[idx=1]` → entity `canonical_code='SRTW8081-P'`),
  domain `inventory`, get-results scoped to that code.
- **§PS-roundtrip-code — CODE reply (per-token `for_raw`).** T2b (fresh T2) = `SRTW8091-P` (the LAST
  token's candidate). **ASSERT** `tryDymPick` fires (`dym_pick_applied===true`); the entity replaced is
  the one for `for_raw:'SRTW809'`, and the resolved `SRTWT902` entity is RETAINED — proving per-token
  `for_raw` maps a code to the CORRECT missed token (not SRTW808's) without dropping the answered entity.
- **If** the real resolver/gate cannot produce a partial resolve (some resolve, some miss) with `If3`
  proceeding and `require_specific:false`, **skip and record as UNVERIFIED** — §PS0 + §PS-R + §PS-safety
  remain the gates. Change scope stays `deterministic` (output_exchange unedited).
- **Safety:** §0 all — reply via `chat:reply`; no send/assign/SLA/PIC/session-PUT; every sub `is_test`.

### Coverage / notes (this change)
| aspect | case |
|---|---|
| partial miss surfaced + numbered + armed | §PS-1 (PRIMARY) |
| no-miss happy path unchanged | §PS-R (HARD regression) |
| zero-candidate miss → plain line, no arm | §PS-zerocand |
| repurpose displaces nothing pickable | §PS-safety (CRITICAL, unedited node) |
| number + code round-trip | §PS-roundtrip (best-effort, real reformulator) |

- Scope `deterministic`. **Single-node** business diff: `compile-current-state` only (live `0804657c`).
  `build-suggest-offer` (`7972abd8`), fork `output_exchange` (`847a1173`), `If3`, `get-results`,
  `central-exchange`, the parser are **untouched**.
- REUSE (not edit) build-suggest-offer's D1 detection: `missResolutions` (excludes the resolved token),
  `tokenCandidates` (per-token own `matches`+`alternatives`, no cross-borrow), `humanLabel`/`isUuid`
  (never leak a uuid), cap3 per token, cap surfaced tokens at 5.
- The `last_result_set` repurpose + `selection_context='suggest_offer'` + `dym_offer` arming happen ONLY
  when `M ≥ 1` numbered candidates; `M===0` appends plain lines only and touches neither. No-miss path is
  a pure no-op → byte-identical (§PS-R). Offer survives via the `_newOffer` slot (lifecycle rule 1 beats
  rule 5); ttl/picked lifecycle otherwise unchanged.
- Ordering (coder): insert AFTER the disclaimer IIFE (so it reads the original stock `last_result_set`)
  and into the `_newOffer` computation; change `const selection_context` → `let`.
- Promotion: 1-node, user-gated, backup-first, byte-SHA gated, target by NAME, built live + own hunks
  (LESSONS §57/§58).

---

# Change: `dym-partial-disambiguation` v3 (two coexisting pick-sets; bare number → dym) — scope `parser`, **touches LIVE parser**

Plan: `../plans/dym-partial-disambiguation-plan.md` (**v3 — supersedes v2 clarify/ambiguous**). **Supersedes
§PS (HALTED).** **Scope tag `parser`** — the disambiguation lives in the reformulator sub `sub-semantic-parser`:
the AI-Agent PROMPT gains a `reference_target` classifier and the sub's `output_exchange` (`847a1173`) gains a
numbered-dym handler that LOOPS all picks. Per LESSON 28 a change INSIDE the reformulator is invisible to
`mock_reformulator_output` → the classifier is proven with the REAL reformulator (token-bearing). One spine
Code node (`compile-current-state` `0804657c`) also changes. Build/test on CLONE `txiPzSxy3Pclsz6v` + the
parser fork it calls `wI5RkNGW3EOJfBdo`; NEVER the live spine `9qVyfUxmRQqrpGRMDLRuz` or live parser
`XTODTw-dJcV0uRdC056hG` during build. Every case §0.

> ⚠️ **v2 (clarify / `ambiguous` / `[results numbered]`) is SUPERSEDED-by-user-feedback (2026-08-01).** User
> tested v2: partial-miss stock + reply `1, 4` hit the AMBIGUOUS→CLARIFY prompt and rejected it — bare numbers
> should route to dym directly, multi-select must resolve BOTH, and the prompt must not overfit. **The former
> §PD-ambiguous and §PD-followup cases are REMOVED.** Do NOT run them as a promote gate.

**Model (v3):** on a partial-miss answered turn (ALL domains — R3) TWO addressable sets coexist — RESULT
(`last_result_set`, KEPT unchanged so a qualified stock pick survives) and DYM (new `dym_last_result_set` +
`dym_offer.candidates`), the dym set numbered LOCAL idx `1..M` (no `N+1` offset). The parser emits
`reference_target: result|dym|null` (NO `ambiguous`): a **BARE number — one OR MORE** ("2", "1, 4", "1 and 4")
→ `dym`; a suggestion phrase ("suggestion 2") → `dym`; a **result-qualified phrase** ("product 2", "the 2nd
one", "price of the first") → `result`; no dym marker active → `null` → byte-identical to today.
`output_exchange` LOOPS every `reference_positions` entry (multi-select), each pick replacing its own `for_raw`
token. `compile-current-state` appends the dym-active marker **exactly** `[M did-you-mean suggestions active]`
(SINGLE bracket — **no `[results numbered]` in v3**) to `variables.response`, the ONLY parser-visible
prior-state channel (§0.1 of the plan).

**Accepted trade-off (recorded, not re-litigated):** bare number now routes to dym, so a stock-row drill-down
requires a qualified phrase ("product 2"/"the 2nd one"). The two-set model + unchanged byIdx preserve the
qualified stock pick; `last_result_set` is never overwritten (v1 HALT stays resolved).

**Verified read-only this cycle:** live `XTODTw` prompt + `output_exchange` are byte-identical to the clone
fork `wI5RkNGW3EOJfBdo`. `output_exchange` byIdx block (lines 399-446) is gated ONLY by
`!is_menu_label && reference_positions.length>0` — NOT `selection_context` (this is why the HALTED overwrite
was unsafe). Parser POSITIONAL rule (prompt 339-349) keys on "returned N records". Parser input template
injects ONLY `previous_conversation_state.response` + current message.
