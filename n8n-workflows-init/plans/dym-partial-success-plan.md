# Change: `dym-partial-success` — surface missed tokens on the ANSWERED happy path

> ⛔ **HALTED / SUPERSEDED 2026-07-31.** The `last_result_set`-repurpose design below FAILED the
> §PS-safety gate (tester run `../tests/runs/dym-partial-success-suite-20260731.json`). Proven on
> production golden data: a bare number ALREADY resolves a stock row today on a plain-answered turn
> (parser emits `reference_positions`, `output_exchange`'s byIdx block resolves it against
> `last_result_set` — gated ONLY by `!is_menu_label && reference_positions.length>0`, **NOT** by
> `selection_context`). So overwriting `last_result_set` with the dym candidates silently destroys
> the live stock positional-pick affordance and creates a mis-resolution surface (`variables.response`
> still advertises "returned N records" while `last_result_set` holds dym). §PS-1 functional logic was
> correct but is moot under the HALT.
>
> **REDESIGN (this is what to build): `../plans/dym-partial-disambiguation-plan.md`** — two coexisting
> addressable sets (stock `last_result_set` KEPT + a separate dym slot) with a PARSER classifier
> (`reference_target`) deciding which set a numbered reply targets. §2.4/§2.5 (last_result_set
> overwrite + `selection_context='suggest_offer'` arming) of THIS plan are **withdrawn**; the
> `userResponse` append (§2.3), the miss detection (§2.1/§2.2), and the offer-survival via `_newOffer`
> (§2.5 dym_offer half) are CARRIED FORWARD into the redesign.

Status: PLAN (planner deliverable) — **HALTED, do not implement.** No workflow edited; no execution run. **DOCS ONLY.**
**Scope tag: `deterministic`.** The only edited node is `compile-current-state`, a spine **Code** node.
All of its `$()` inputs (`resolve-entity`, `disallowed-entity-gate`, `central-exchange`,
`Call 'sub-query-reformulator'.output`, `get-session-vars`) are pinnable, so the primary gate is a
**0-token offline unit** (`prepare_test_pin_data` → `test_workflow`). No parser prompt edit, no
`output_exchange`/`build-suggest-offer` edit → **not** `parser` tier. (The E2E pick round-trip uses the
real reformulator; that is a *best-effort regression guard*, not the change scope — see V-PS-roundtrip.)

Build/test target = **CLONE `txiPzSxy3Pclsz6v`**. Live spine = `9qVyfUxmRQqrpGRMDLRuz` — **never edited**.

Source of truth this cycle: live/clone read read-only via MCP `get_workflow_details`, plus the CRM
resolver source (read-only ref). Node ids (LESSON §58c — clone↔live diverge):
- `compile-current-state` = live **`0804657c`** / clone **`7a130a0c-530f-4bfb-a8f2-059ec71c2ea2`** — **the only edited node.**
- `build-suggest-offer` = `7972abd8-5d6b-40ff-9d38-152782cd8091` (shared) — **NOT edited** (change #1 territory; we REUSE its detection logic, we do not touch the node).
- `central-exchange` clone `935931e7-…` ; `resolve-entity` clone `48068f7b-…`.
- reformulator fork the clone calls = `wI5RkNGW3EOJfBdo`, `output_exchange` node `847a1173-…` — **NOT edited**.

---

## 1. The problem (diagnosed — formalized here, not re-derived)

A multi-entity query where SOME tokens resolve and SOME do not, e.g.

> `SRTW808 @3 SRTW809 @2 SRTWT902 @5 check stock`

`SRTWT902` resolves → `disallowed-entity-gate` returns `compatible_entities ≥ 1` → **`If3` PROCEEDS** to
`get-results` → `central-exchange` → `compile-current-state` → a happy stock answer for `SRTWT902`.
`SRTW808` + `SRTW809` are genuine misses but their misses **VANISH**: the customer sees only `SRTWT902`
stock. Two reasons the misses disappear on the happy path:

1. `build-suggest-offer` (the did-you-mean builder) is downstream of `not-found-error-message` and
   **never runs** when `If3` proceeds — so `compile-current-state._sug` is null.
2. `compile-current-state`'s dym lifecycle **actively KILLS** any carried offer once the turn is
   answered (verified, clone `7a130a0c` line 248: rule 5 `if (_answered) return null;`).

The user wants the happy answer to ALSO surface the misses, numbered so the customer can pick a
correction:

```
[stock answer for SRTWT902 …]

Couldn't find these:
"SRTW808" — did you mean:
  1. <label>
  2. <label>
"SRTW809" — did you mean:
  3. <label>

Reply a number to check it, or ask again.
```

Supporting facts (verified this cycle in the clone `compile-current-state` — do not re-verify):
- **`userResponse` is the customer-facing text.** Line 87 `userResponse = response;` copies the full
  `central-exchange` reply (line 70) BEFORE line 142 reassigns `response` to the COMPRESSED parser view
  (`Previous turn (inventory): returned N records`). Output: `user_response: userResponse` (customer),
  `variables.response: response` (compressed parser view). **Append to `userResponse`** — confirmed
  Claim C. Leave `variables.response` (compressed) unchanged.
- **The answered-happy-path gate already exists** as the disclaimer IIFE's `answered` (lines 200-208):
  `!isEscalateBranch && includeResponse && typeof userResponse==='string' && userResponse.trim().length>0
  && Array.isArray(last_result_set) && last_result_set.length>0`. On a plain stock answer today
  `selection_context` is **null** (line 195: `_sug`/`_mem`/`_merge` null and `_isDisambig` false).
- **`last_result_set` on the happy path today = the stock rows** (`indexed`, line 143).
- **The dym lifecycle `_newOffer` (line 224) is fed ONLY from `_sug.dym_offer`.** On the happy path
  `_sug` is null → `_newOffer` null → rule 5 kills the prior offer. To make a partial-miss offer
  survive, we must feed it through the SAME `_newOffer` slot (lifecycle rule 1 wins over rule 5).

---

## 2. Locked design (user-approved)

Edit **only** `compile-current-state`. Insert ONE block that runs on the ANSWERED happy path
(`business_query`, `!manualResponse`, `!isEscalateBranch`, stock rows returned) and, when
`resolve-entity` reports genuine-miss tokens, surfaces them. Reuse `build-suggest-offer`'s D1 detection
verbatim; render in the partial-success block format; repurpose `last_result_set` as the pick context.

### 2.1 Miss detection — REUSE build-suggest-offer D1 (byte-for-byte logic, ported)
Define, sourcing from `$('resolve-entity').first().json` (`r`), `$('disallowed-entity-gate').first().json`
(`gate`), and `qf` (reformulator output):
- `cap3`, `isUuid` (`UUID_RE`), `humanLabel(m)` — prefer non-uuid `canonical_code`, else
  `display.description/product_name/name`, else `null` (candidate dropped — **never leak a uuid**).
- `isExact(m)` = `match_tier === 'exact'`; `allowedTypes = gate.gate_debug.allowed_lookup` (honored).
- `_mkOffer(cands)` = `{ id:String($execution.id), domain:(qf.domain_hint)||null, ttl:3, candidates:cands, picked:[] }` (null for empty).
- `missResolutions` (build-suggest-offer lines 155-161): `r.resolutions.filter(res => res.resolved !== true
  && !(Array.isArray(res.matches) && res.matches.some(isExact)))`. This **excludes the resolved token**
  (`SRTWT902`, `resolved:true`) and any ambiguous-but-exact token. Legacy single-resolution shape:
  `unresolved.length ? [r] : []`.
- `tokenCandidates(res)` (build-suggest-offer line 138): each token's OWN `matches` + `alternatives`,
  drop-exact, honor `allowedTypes`, dedupe by `canonical_code`, drop null-code. **Never cross-borrow
  across tokens.**

Guard exactly as build-suggest-offer: skip when `is_clarification===true` or `gate.require_specific===true`
(on a true happy answer both are false — defensive parity).

### 2.2 Surface list + per-token renderable picks (caps + drop-empty)
- `surfaced = missResolutions.slice(0, 5)` — **cap missed tokens shown at 5**.
- For each surfaced token: `picks = cap3(tokenCandidates(res)).map(m => ({m, label:humanLabel(m)})).filter(p => p.label)`
  (cap3 per token; a candidate whose only label would be a bare uuid is dropped).
- A token is either **numbered** (`picks.length ≥ 1`) or **plain** (`picks.length === 0` — no renderable
  candidate). Both are shown under "Couldn't find these:"; only numbered picks consume an idx.
- `M` = total numbered picks across surfaced tokens (**global contiguous idx `1..M`**).

### 2.3 Append to `userResponse` (mirror the disclaimer-append IIFE, gated on `answered`)
Run AFTER the existing disclaimer IIFE (lines 200-218) so the disclaimer sees the ORIGINAL stock
`last_result_set`. Build:
- header `Couldn't find these:`
- per numbered token: `"${token}" — did you mean:` then indented `  ${idx}. ${label}` lines (global idx).
- per plain token: `"${token}"` (single line, no suggestions).
- footer: **if `M ≥ 1`** → `Reply a number to check it, or ask again.` ; **if `M === 0`** (all surfaced
  tokens are plain) → `Ask again with the correct code.` (no number invite).
- `userResponse += "\n\n" + <the assembled block>;`

### 2.4 Namespacing — repurpose `last_result_set` (the critical part) — ONLY when `M ≥ 1`
- `last_result_set = <the M numbered candidates>`, each `{ idx, label, value, product, uuid, entity_type }`
  with contiguous `idx 1..M` (label = `humanLabel`; for a real product code `value`=`product`=`canonical_code`;
  for a uuid-coded/promotion candidate `value`=`label` and `product`=`canonical_code`). This mirrors
  build-suggest-offer's multi-block `suggest_last_result_set` row shape exactly.
- `selection_context = 'suggest_offer'`. **Requires making `selection_context` reassignable** — change
  line 195 `const selection_context` → `let selection_context`, and reassign inside this block.

**Rationale + VERIFIED claim:** on a plain stock answer today `selection_context` is null and the stock
`last_result_set` is **not an armed positional-pick context** (`output_exchange`'s `_pickCtx` requires
`selection_context ∈ {disambiguation, suggest_offer}` or a quote-reply `referenced_result_set`; a plain
stock turn has neither). So overwriting `last_result_set` with the M dym candidates + arming
`selection_context='suggest_offer'` gives a clean positional round-trip (display-idx == `last_result_set`
idx == `byIdx` key) and regresses nothing that was ever pickable. This must be proven by **V-PS-safety**
(a plain-stock turn's `last_result_set` is not consumed on a following numeric reply on the UNEDITED node).

**When `M === 0`:** do NOT touch `last_result_set` (stays stock rows) or `selection_context` (stays null)
or `dym_offer` — there is nothing to arm; only the plain-line append happens.

### 2.5 dym offer — feed through `_newOffer` so it SURVIVES the `_answered` kill — ONLY when `M ≥ 1`
- Build `dym_candidates`, one per numbered candidate, each keeping its OWN source token:
  `{ code:m.canonical_code, uuid:m.uuid||null, entity_type:m.entity_type||null, for_raw:<its source token>,
     for_hint:m.entity_type || (_srcEnt&&_srcEnt.hint) || null, for_canonical:(_srcEnt&&_srcEnt.canonical_code)||null }`
  where `_srcEnt` is the parser entity whose `raw === token` (looked up **per token**). Do NOT borrow.
- `_partialOffer = _mkOffer(dym_candidates)`.
- **Wire the lifecycle:** change line 224 so `_newOffer` prefers `_sug`'s offer, else `_partialOffer`:
  `const _newOffer = (_sug && _sug.dym_offer && …length) ? _sug.dym_offer : (_partialOffer || null);`
  Rule 1 (`if (_newOffer) return {..._newOffer, ttl:3, picked:[]}`) then makes it survive rule 5
  (`_answered`). The output object already emits `dym_offer:_dymOffer` and
  `dym_candidates:_dymOffer.candidates` — no further change.

### 2.6 quick_reply — leave unset (numbers typed, NO buttons)
Do NOT set `quickReply` on this path (task item 5). On the happy path `quickReply` is otherwise undefined
(only `access-level-choice-message` sets it, which does not run here). No button-cap concern (0 buttons).

### 2.7 The REGRESSION invariant (hard gate) — no-miss happy path BYTE-IDENTICAL
When `missResolutions` is empty (or every surfaced token is filtered out), the block is a **no-op**:
no append, `last_result_set` stays the stock rows, `selection_context` stays null (override only fires
when `M ≥ 1`), `_newOffer` stays null (no `_sug`, no `_partialOffer`) so the dym lifecycle behaves
EXACTLY as today (rule 5 kills a carried offer on an answered turn). Output byte-identical to current
`compile-current-state`. This is **V-PS-R**.

---

## 3. What is verified read-only this cycle (with citations)

- **Claim A — resolve-entity keeps per-token `resolutions[]` + `alternatives` for the UNRESOLVED tokens
  in a PARTIAL resolve. CONFIRMED at source** (`sorento_crm_backend/app/services/entity_resolver.py`):
  - lines 3523-3526 build `resolutions = [TokenResolution(token=t, matches=per_token[t], …) for t in tokens]`
    — **one resolution per input token, independently**; a sibling token resolving never strips another
    token's resolution.
  - lines 3533-3544: for EACH `tr` with empty `matches` (`if tr.matches: continue`), a trigram
    "did you mean" lookup populates `tr.alternatives` (`SUGGEST_FLOOR`/`_ALTERNATIVES_CAP` bounded,
    carrying `entity_type`/`canonical_code`/`uuid`/`display`/`similarity`).
  - Therefore in the partial case the resolved token (`SRTWT902`) has `matches` (no `alternatives`,
    excluded from `missResolutions` via `resolved:true`), and each unresolved token
    (`SRTW808`,`SRTW809`) carries `alternatives` — exactly what `tokenCandidates(res)` reads. The
    attachment path (`references.py` 181-190) shows the same per-token `resolutions.append(...)` shape.
  - **A token may legitimately have 0 alternatives** (nothing crosses `SUGGEST_FLOOR`) → handled as a
    plain "Couldn't find" line (§2.2). Also verify a real partial-miss stock exec if one can be found;
    otherwise the tester pins the fixture per §7 and the source citation stands.

- **Claim B — positional + code round-trip. CONFIRMED** against fork `output_exchange` (`847a1173`):
  - **NUMBER reply:** `_pickCtx` recognizes `selection_context === 'suggest_offer'` (line 371); the
    "REFERENCE POSITIONS → ENTITIES" block (lines 399-435) builds `byIdx = new Map(lastSet.map(r => [r.idx, r]))`
    keyed on `last_result_set[i].idx`, and `byIdx.get(pos)` yields entity `{raw, hint, uuid,
    canonical_code: row.product || raw}`. Global contiguous idx is what makes `byIdx` resolve; picked
    row's `product` is the code. ✅
  - **CODE reply:** `tryDymPick` (lines 158-218) sources `_prev.dym_offer.candidates`, matches the typed
    code by `norm(c.code)===_msg`, finds the source entity via `for_raw` (line 190) and replaces it
    in-place, RETAINING all other prior entities (incl. the resolved `SRTWT902`) + carrying the prior
    date. Per-token `for_raw` maps a code to the CORRECT missed token. ✅

- **Claim C — `userResponse` is the field to append to. CONFIRMED** (see §1 supporting facts).

---

## 4. Safety / harness binding (§0)

Zero-egress is **structural** on the clone (fail-closed): this is a Code-only edit that emits fields
consumed downstream; it adds **no egress node**. Every UAC case is bound by UAC.md §0 (S1-S8). The
prod-ingest gate is **§0 S7** (sink-delta + payload attribution — the LLEN-equality form is withdrawn,
LESSON 45). The offline unit (V-PS0/V-PS-R/V-PS-zerocand) exercises **no egress at all**. `dym-single-use`
lifecycle (ttl/picked) is preserved: we only add a new source into the `_newOffer` slot; rules 2-7 are
untouched.

---

## 5. Consumption / promotion surface

**One-node business diff: `compile-current-state` only** (live `0804657c`). `build-suggest-offer`,
`output_exchange`, `If3`, `get-results`, `central-exchange`, the parser are **untouched**. The pick
round-trip is pre-existing machinery (Claim B) — this change only feeds it a correctly-namespaced pick
context on a path that previously armed none. Promotion: 1-node, user-gated, backup-first, byte-SHA gated
both sides of the publish, target by node **NAME** (LESSONS §57/§58); built as **live + own hunks**, never
copied from the clone verbatim (LESSON 57 — the clone node carries harness scaffolding and may drift).

---

## 6. Verification tasks (planner-defined)

- **V-PS0 (offline unit — PRIMARY GATE, 0-token).** Pin `resolve-entity` (partial: `SRTWT902` resolved
  with 1 match + `SRTW808`/`SRTW809` each `resolved:false`, empty `matches`, own `alternatives`),
  `disallowed-entity-gate` (`compatible_entities:[SRTWT902]`, `require_specific:false`,
  `gate_debug.allowed_lookup:['product',…]`, `gate_debug.domain:'inventory'`), `central-exchange`
  (`response` = the SRTWT902 stock text; `items:[…]` for SRTWT902), reformulator `qf`
  (`message_type:'business_query'`, `domain_hint:'inventory'`, `entities` include `SRTW808`,`SRTW809`,
  `SRTWT902` raw), `get-session-vars` (empty `variables`). Assert `compile-current-state` output per §7
  acceptance. No LLM, no egress.
- **V-PS-R (no-miss regression — HARD GATE).** Same fixture reduced to `SRTWT902` ALONE (all tokens
  resolve). Assert output **byte-identical** between (i) current live `compile-current-state` jsCode and
  (ii) the changed clone node — no appended text, `last_result_set` = the stock rows exactly as today,
  `selection_context` null, `dym_offer` lifecycle unchanged. Method: run the same pinned fixture against
  both jsCodes and diff.
- **V-PS-zerocand (miss with no candidates).** Fixture: `SRTWT902` resolved + one missed token
  (`ZZZQ999`) with **empty `matches` AND empty `alternatives`**. Assert: `userResponse` gains a plain
  `"ZZZQ999"` line under `Couldn't find these:` with the NO-number-invite footer; `last_result_set`
  UNCHANGED (stock rows); `selection_context` null; `dym_offer` follows today's answered-turn rule
  (no armed offer). Proves the `M===0` branch does not falsely arm a picker.
- **V-PS-safety (the `last_result_set` repurpose is regression-free — CRITICAL).** On the **UNEDITED**
  `compile-current-state` + fork `output_exchange`, prove a plain/partial stock turn does NOT arm a
  positional pick today: after a stock answer (`selection_context` null, stock rows in `last_result_set`),
  an immediately-following bare numeric reply (`"2"`) is **not** consumed by `output_exchange`'s byIdx
  block as stock-row-2 (i.e. `_pickCtx` false → no auto-`reference_positions`; and the parser does not
  emit `reference_positions` for a bare number without a pick context). Method: multi-turn on
  `chat-stateful` against the unedited clone, OR a pinned `output_exchange` unit with
  `prevState.selection_context=null`, `last_result_set=[stock rows]`, reply `"2"` → assert `entities`
  are NOT the stock row. Records the baseline that the repurpose displaces nothing pickable. **If a bare
  number IS found to resolve a stock row today, HALT** — the repurpose then changes behavior and the
  design must add a guard.
- **V-PS-roundtrip (E2E regression, best-effort — real reformulator).** Because `output_exchange` is
  **not** edited, this is a regression guard, not the primary gate. Multi-turn via `chat-stateful`
  (reset `respond_contacts_test` ONCE before T1): T1 = the §7 partial-miss stock query →
  **T2a a NUMBER** (`1`), **T2b (fresh T2) the CODE** of a candidate from the LAST missed token. Assert
  T2a resolves via the positional path (`reference_positions=[1]` → `last_result_set[idx=1]` → that
  candidate's code); T2b resolves via `tryDymPick` (`dym_pick_applied===true`) and replaces the LAST
  token's entity via `for_raw` while RETAINING the resolved `SRTWT902` entity. This assertion is
  `parser`-tier (real fork), but the **change scope stays `deterministic`** (output_exchange unedited).
  If the real resolver/gate cannot be made to emit a partial resolve (some resolve, some miss) with
  `require_specific:false` and `If3` proceeding, **skip and record as UNVERIFIED** — V-PS0 + V-PS-R +
  V-PS-safety remain the gates.

---

## 7. Acceptance criteria (for coder/tester) — the §PS fixture

**Fixture (partial-miss stock query — 1 resolved product + 2 unresolved tokens each with ≥1 alternative;
domain = inventory; all hints product):**

| token (`res.token` / parser `raw`) | resolver state | candidate codes (rank order) | cap3 kept |
|---|---|---|---|
| `SRTWT902` | `resolved:true`, 1 exact match → **excluded from misses** | (n/a — this is the ANSWER) | — |
| `SRTW808` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8081-P(0.58), SRTW8082-P, SRTW8083-P | SRTW8081-P, SRTW8082-P, SRTW8083-P |
| `SRTW809` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8091-P | SRTW8091-P |

All candidates: `match_tier` non-exact, `entity_type:'product'`, real non-uuid `canonical_code`, `uuid`
present. `disallowed-entity-gate`: `compatible_entities` contains the resolved `SRTWT902`,
`require_specific:false`, `gate_debug.allowed_lookup` includes `product`, `gate_debug.domain:'inventory'`.
`central-exchange.response` = the SRTWT902 stock text (e.g. `SRTWT902 — 42 units in KL warehouse …`);
`central-exchange.items` = ≥1 stock item for SRTWT902. `qf.message_type='business_query'`,
`qf.domain_hint='inventory'`, `qf.entities` includes raw `SRTW808`,`SRTW809`,`SRTWT902`.
`get-session-vars.variables` empty (no prior offer). `$execution.id` = `<exec>`.

**§PS-1 acceptance (must all hold):**
1. **`user_response` = the SRTWT902 stock answer, FOLLOWED BY** (after a blank line) a
   `Couldn't find these:` block with **2 per-token sub-lists** — `"SRTW808" — did you mean:` (lines
   `1. …`, `2. …`, `3. …`) then `"SRTW809" — did you mean:` (line `4. …`) — and the footer
   `Reply a number to check it, or ask again.` The stock answer text is UNCHANGED (prefix-preserved).
2. **Global numbering contiguous `1..4`** (cap3 + 1): SRTW808 block = 1,2,3; SRTW809 block = 4.
3. `variables.last_result_set` **length 4**, `idx` 1..4 contiguous, `value`/`product` = the candidate
   codes in order (row1=`SRTW8081-P` … row4=`SRTW8091-P`), each `entity_type:'product'`.
   `variables.selection_context === 'suggest_offer'`.
4. `variables.dym_offer.candidates` **length 4**, each `for_raw` == its source token — rows 1-3
   `for_raw:'SRTW808'`, row 4 `for_raw:'SRTW809'`; each `code` = its candidate code; `for_hint:'product'`.
   `variables.dym_offer` = `{ id:'<exec>', domain:'inventory', ttl:3, candidates:[4], picked:[] }`.
   `variables.dym_candidates` mirrors those 4. **The offer SURVIVED the `_answered` kill.**
5. `quick_reply` is **unset/null** (numbers typed → no buttons).
6. `variables.response` (compressed parser view) is the SAME `Previous turn (inventory): returned N …`
   string as today (unchanged); the miss text lives ONLY in `user_response`.
7. **§0 S7:** prod-ingest sink-delta zero (both signals) / any non-zero delta attributed-or-FAIL; egress
   log shows `would_send` only; no prod write. (Offline unit: no egress at all.)
8. **Regression (V-PS-R):** the no-miss (`SRTWT902`-only) fixture → output byte-identical to current live
   `compile-current-state` (no append, `last_result_set` = stock rows, `selection_context` null,
   `dym_offer` lifecycle unchanged).

**Promotion:** 1-node business diff (`compile-current-state` `0804657c`), user-gated, backup-first,
byte-SHA gated per LESSONS §57/§58; target by node NAME; built as live + own hunks.

---

## 8. Risks surfaced

1. **`last_result_set` repurpose (highest).** We overwrite the answered turn's stock `last_result_set`
   with the dym candidates and arm `selection_context='suggest_offer'`. This is sound ONLY IF a plain
   stock answer does not currently arm a positional pick. Verified in DESIGN against `output_exchange`
   (`_pickCtx` needs `suggest_offer`/`disambiguation`/quote-reply — a plain stock turn has none), but it
   is **run/seed-sensitive parser behavior** (LESSON 39) whether the LLM emits `reference_positions` for
   a bare number absent a pick context — hence the **hard V-PS-safety gate**: if a bare number resolves a
   stock row today, HALT and add a guard. Note the loss is intentional: the stock rows leave
   `last_result_set`, but they were never pickable (no invitation, `selection_context` null); the
   customer is now explicitly invited to pick a correction instead.
2. **resolve-entity partial-alternatives assumption.** CONFIRMED at CRM source (Claim A: per-token,
   independent, alternatives on empty-match tokens). Residual risk is only that a real partial-miss stock
   query may not reproduce in a live exec to cite; the tester pins the fixture (V-PS0) and, for
   V-PS-roundtrip, must confirm a real reformulator can produce a partial resolve with `If3` proceeding —
   if not, that E2E case is recorded UNVERIFIED (the offline gate still holds).
3. **Ordering fragility inside the node.** The new block MUST run AFTER the disclaimer IIFE (so the
   disclaimer sees the ORIGINAL stock `last_result_set`) and BEFORE/into the `_newOffer` computation
   (so the offer survives). `selection_context` must be changed `const`→`let`. A coder inserting in the
   wrong place will either double-fire the disclaimer semantics or lose the offer to rule 5. Called out
   explicitly in §2.3/§2.5.
4. **Zero-candidate misses adding noise.** Surfacing a missed token with no suggestion is intended
   (misses currently vanish), but it must NOT arm an empty picker — the `M===0` branch leaves
   `last_result_set`/`selection_context`/`dym_offer` untouched (V-PS-zerocand).
5. **dym_slot on a partial offer.** The offer id is stamped onto the picked entity by `output_exchange`
   on pick (line 200), not by `compile-current-state`; a SECOND pick from the same offer resolves via the
   stamped `dym_slot` — identical to the shipped `dym-candidate-map`, not new to this change.
