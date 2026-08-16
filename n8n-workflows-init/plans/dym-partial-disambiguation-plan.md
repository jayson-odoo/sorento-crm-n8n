# Change: `dym-partial-disambiguation` — two coexisting pick-sets on a partial-miss turn, PARSER routes bare-number → dym

Status: PLAN v3 (planner deliverable). **DOCS ONLY** — no workflow edited, no execution run. **Awaiting USER
APPROVAL before any coding** (this touches the LIVE parser prompt — higher stakes than a single Code node).

> ## ⛔ v2 (clarify / `ambiguous` / `[results numbered]`) is SUPERSEDED-by-user-feedback (2026-08-01)
> The user tested v2 on the clone: a partial-miss stock turn, reply `1, 4` (a multi-pick of dym suggestions),
> hit the AMBIGUOUS → CLARIFY prompt. Verdict:
> - *"when it is bare number like this, we should use dym selection, it is quite clear"* — bare numbers are the
>   natural reading of "Reply a number to check it"; do NOT ask the customer to disambiguate.
> - *"we need a test case for multi selection"* — `1, 4` must resolve BOTH picks, not one.
> - *"don't overfit in the prompt"* — the v2 `ambiguous`/`[results numbered]` machinery is over-engineered.
>
> **v3 removes ALL of it:** no `ambiguous` enum, no CLARIFY sub-flow, no `[results numbered]` second bracket,
> no `dym_clarify_needed`/`dym_clarify_pos`. Replaced by one general rule: **bare number(s) → `dym`; a
> result-qualified phrase → `result`; no marker → `null`.** The v2 sections below are struck through and kept
> for history only — **do not implement v2**.

**Locked user decisions (v3, 2026-08-01):**
- **R1 (was: LLM classifier + clarify fallback) → REPLACED.** No clarify. The classifier is a simple general
  rule (§2.2): bare number(s) = `dym`, result-qualified phrase = `result`, no marker = `null`.
- **R2 (was: `[M …]` + `[results numbered]` second bracket, wording sign-off pending) → CLOSED.** The marker
  is back to **exactly one bracket** `[M did-you-mean suggestions active]`. With `ambiguous` gone, the
  "was-the-result-body-numbered?" bit is no longer needed → the second bracket is deleted. **The only open
  pre-coding decision from v2 is thereby closed.**
- **R3 — dym numbered LOCAL idx `1..M` (no `N+1` offset), on ALL domains — UNCHANGED, still LOCKED.**

**Scope tag: `parser`.** The disambiguation lives in the reformulator/parser sub (`sub-semantic-parser`):
the AI-Agent PROMPT gains a `reference_target` classifier field, and the sub's `output_exchange` Code node
gains a numbered-dym handler that loops ALL picks. Per LESSON 28 a change INSIDE the reformulator is INVISIBLE
to `mock_reformulator_output`, so the classifier must be proven with the REAL reformulator (token-bearing).
One spine Code node (`compile-current-state`) also changes, but the gating tier is set by the parser edit.

Supersedes `dym-partial-success-plan.md` (v1, HALTED — its `last_result_set` overwrite destroyed the live
stock positional-pick affordance; tester run `../tests/runs/dym-partial-success-suite-20260731.json`) and the
v2 clarify design in this same file.

Build/test target = **CLONE `txiPzSxy3Pclsz6v`** + the parser fork it calls **`wI5RkNGW3EOJfBdo`**
(`sub-semantic-parser FORK domain-continuity-carry`). Live spine = `9qVyfUxmRQqrpGRMDLRuz`, live parser =
`XTODTw-dJcV0uRdC056hG` — **never edited during build**; promote is a separate user-gated step (§5).

---

## 0. What the HALT proved (the premise this redesign is built on) — UNCHANGED from v2

Verified read-only against the live parser `XTODTw` and confirmed byte-identical on the clone fork
`wI5RkNGW3EOJfBdo` (prompt AND `output_exchange` diff clean):

1. **`output_exchange` byIdx positional resolution is NOT gated by `selection_context`.** The
   "REFERENCE POSITIONS → ENTITIES" block (node `847a1173`, lines **399-446**) fires on
   `output.output && !output.output.is_menu_label && reference_positions.length > 0` — **no `_pickCtx`,
   no `selection_context` check.** It builds `byIdx = new Map(lastSet.map(r => [r.idx, r]))` where
   `lastSet = referenced_result_set (quote-reply) ?? prevState.last_result_set`, then for each position
   `row = byIdx.get(pos)` → entity `{raw, hint, ordinal:pos, uuid: row.uuid, canonical_code: row.product || raw}`.
2. **The parser emits `reference_positions` for a bare number on ANY "returned N records" answered turn**
   (POSITIONAL REFERENCES rule, prompt lines **339-349**). Real production turns resolved bare `1`/`3`/`7`
   with `selection_context = null` and no quote-reply.

**Therefore the stock positional pick is a LIVE affordance.** The redesign keeps `last_result_set` = the
stock rows and adds a *separate* dym pick-set. The parser tells `output_exchange` which set a numbered reply
targets. **In v3 the routing rule is: a BARE number → the dym set; a result-qualified phrase → the stock set.**
(This changes the DEFAULT for a bare number from stock → dym — see the accepted trade-off, §1.1.)

### 0.1 The parser's ONLY view of prior state (critical — grounds the whole design) — UNCHANGED
The AI-Agent `text` (input) template on `XTODTw`/fork is exactly:
```
=Previous response: {{ String($('When Executed by Another Workflow').first().json.previous_conversation_state?.response ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn') }}
Current user message: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
```
So the parser sees **only** `previous_conversation_state.response` (the COMPRESSED string) + the current
message. It does NOT see structured `entities`, `last_result_set`, `dym_offer`, or `selection_context`. The
regex rewrites only the leading `Previous turn (<domain>)` → `Previous turn`; **anything appended to the END
of `response` passes through untouched.** This is the ONLY channel by which the parser can learn a dym offer
is active — so `compile-current-state` must encode that signal (the single bracket) into `variables.response`.

---

## 1. Requirement (v3 — the simplified redesign)

On a partial-miss answered turn TWO addressable sets coexist (on ALL domains — R3). The parser classifies a
positional reply into one of THREE outcomes (`ambiguous` is GONE):

- **`dym`** — a **bare numeric** reply, **one OR MORE numbers** (`"2"`, `"1, 4"`, `"1 and 4"`), OR an explicit
  suggestion phrase (`"suggestion 2"`), while the dym marker is present → resolve against the **DID-YOU-MEAN**
  set (`dym_last_result_set`). This is the key v3 change: bare numbers = dym (the natural reading after
  "Reply a number to check it").
- **`result`** — an explicit **result-qualified** phrase (`"product 2"`, `"the 2nd one"`, `"the 2nd product"`,
  `"price of the first"`) → resolve against the **RESULT** set (`last_result_set`, unchanged live behavior).
- **`null`** — no dym marker present this turn → downstream treats as `result` = **byte-identical to today**.

Backwards-compat is non-negotiable: a turn with NO active dym offer is **byte-identical** to today — parser
output shape AND `output_exchange` routing.

### 1.1 The accepted trade-off (user has ACCEPTED it — state it, do NOT re-litigate)
With **bare number = dym**, a customer can no longer pick a STOCK row by a bare number; a stock-row drill-down
now requires a **qualified phrase** (`"product 2"` / `"the 2nd one"`). The two-set model is preserved so
`result`-qualified replies still resolve stock rows via the **unchanged byIdx path**. Because `last_result_set`
is never overwritten, the tester's v1 HALT (positional-pick destruction) stays resolved. Net: bare-number
picks the (usually more relevant) suggestion; the stock-row affordance survives behind a one-word qualifier.

---

## 2. The two-set model (unchanged shape; simpler routing)

| set | where it lives (persisted by `compile-current-state`) | idx | how `output_exchange` resolves it |
|---|---|---|---|
| **STOCK results** | `variables.last_result_set` — indexed stock rows (UNCHANGED from today) | 1..N | existing byIdx block (399-446), wholesale entity replacement |
| **DYM candidates** | `variables.dym_last_result_set` (idx'd) + `variables.dym_offer.candidates` (code-reply path) | 1..M | **NEW** numbered-dym handler → per-pick in-place replacement, LOOPS all positions |

`selection_context` stays **null** on a partial-miss answered turn (do NOT arm `suggest_offer`). Keeping it
null is what preserves the stock byIdx path unchanged.

**R3 (LOCKED): dym idx is LOCAL `1..M`, no offset, ALL domains.** On a numbered-result domain the customer
sees two lists both starting at 1; in v3 that is NOT resolved by a clarify — a bare number simply routes to
dym (the customer explicitly qualifies with "product N" when they mean the answer rows).

### 2.1 `compile-current-state` (spine Code node — live `0804657c` / clone `7a130a0c`)

**KEEP (unchanged from the two-set groundwork):** miss detection (reuse `build-suggest-offer` D1 logic:
`missResolutions`, per-token `tokenCandidates`, `humanLabel`, `cap3`, allowedTypes honoring, uuid-drop), the
`userResponse` customer-facing append of the `Couldn't find these:` block (numbered 1..M), run AFTER the
disclaimer IIFE. `M===0` (misses with no renderable candidate) stays a plain-line no-arm branch.

**v3 CHANGES (delta vs v2):**
1. **Do NOT overwrite `last_result_set`.** It stays the stock rows. **Do NOT** set `selection_context`
   (stays null).
2. **NEW `dym_last_result_set`** — M numbered rows, contiguous `idx 1..M`, each a SUPERSET row carrying both
   the display shape and the pick-linkage:
   `{ idx, label, value, product, uuid, entity_type, for_raw, for_hint, for_canonical }`
   (label = `humanLabel`; `value`/`product` = candidate code; `for_raw` = its SOURCE token; `for_hint` =
   `entity_type || _srcEnt.hint`; `for_canonical` = `_srcEnt.canonical_code`, `_srcEnt` looked up per token).
3. **`dym_offer` survives via `_newOffer`**: feed `_partialOffer` into the `_newOffer` slot so lifecycle rule 1
   beats the `_answered` rule-5 kill. `dym_offer.candidates` (shape
   `{code,uuid,entity_type,for_raw,for_hint,for_canonical}`) is what the CODE-reply `tryDymPick` consumes — unchanged.
4. **Encode the dym-active signal into `variables.response` — the SINGLE bracket only** (R2 CLOSED). Append
   exactly:
   ```
   variables.response = <today's "Previous turn (<domain>): returned N records"> + " [M did-you-mean suggestions active]"
   ```
   with `M` the integer candidate count. **This is the entirety of the marker. There is NO `[results numbered]`
   second bracket in v3** — it is deleted along with the `ambiguous` path that needed it.
5. **~~[results numbered] emission~~ — REMOVED in v3.** `compile-current-state` no longer inspects whether the
   result body was rendered numbered, and no longer emits any second bracket.
6. **~~The `dym_clarify_needed` clarify branch~~ — REMOVED in v3.** `compile-current-state` has NO clarify
   branch. On an answered partial-miss turn it takes its normal answered-turn branch (stock answer +
   `Couldn't find these:` block); on the follow-up pick turn it takes its normal answered branch again.
7. **When `M===0`:** no `dym_last_result_set`, no `dym_offer` arm, NO response marker → the parser sees today's
   plain `returned N records` → byte-identical follow-up behavior. Only the plain-line customer append happens.

### 2.2 Parser PROMPT (AI-Agent systemMessage — live `XTODTw` / fork `wI5RkNGW3EOJfBdo`) — v3 SIMPLE RULE

Add a classifier field **`reference_target`** and one SHORT, GENERAL rule appended to the POSITIONAL
REFERENCES section. **No overfit, no enumerated special cases, no `ambiguous`, no `[results numbered]`.**

- **New output key** (add near `reference_positions` in the JSON template): `"reference_target": "result|dym|null"`.
- **Proposed rule text (keep it this short):**

  > **reference_target.** When "Previous response" contains the marker `[<N> did-you-mean suggestions active]`
  > and the current message refers to item position(s), also set a top-level `reference_target`:
  > - `"dym"` — the reply is bare number(s), one or more ("2", "1, 4", "1 and 4"), or names a suggestion
  >   ("suggestion 2", "the 2nd suggestion").
  > - `"result"` — the reply explicitly qualifies a result item ("product 2", "the 2nd one", "the 2nd
  >   product", "price of the first").
  >
  > If the marker is absent, set `reference_target: null`. `reference_positions` is unchanged (the raw 1-based
  > positions). Do NOT resolve — downstream maps the positions to the set named by `reference_target`.

- **Semantics:** `reference_positions` is UNCHANGED (still the raw 1-based positions; for `"1, 4"` /
  `"1 and 4"` the parser emits `[1,4]` — multi-position extraction is existing behavior, the LLM already lists
  each position). `reference_target` is a pure which-set classification (LESSON 38 — LLM classifies/extracts,
  code resolves against the frozen set). No marker → `null` → downstream treats null as `result` = today.
- **Backward-compat shape:** `reference_target` is emitted every turn but defaults to `null`. Per LESSON 40
  register it in the replay `norm()` as **ignored-when-null-both-sides, flagged-when-non-null** so it does not
  diff on the ~2.2k golden turns. (v3 simplification: because there is no `ambiguous`, the field is only ever
  `result`/`dym`/`null`.)

### 2.3 `output_exchange` (Code node in the parser sub — `847a1173`, live `XTODTw` / fork `wI5RkNGW3EOJfBdo`)

Add ONE numbered-dym handler that **loops ALL picks**; remove the v2 ambiguous branch; leave everything else
byte-identical.

- **Placement:** BEFORE the existing byIdx block (399-446). Read `reference_target` (default `'result'` when
  null/absent), `prevState.dym_last_result_set`, `output.output.reference_positions`.
- **Fire only when:** `reference_target === 'dym'` **AND** `Array.isArray(prevState.dym_last_result_set) &&
  prevState.dym_last_result_set.length > 0` **AND** `reference_positions.length > 0`.
- **MULTI-SELECT LOOP (the v3 core change).** Factor the existing single-pick in-place replacement (`tryDymPick`
  body) into a callable `applyDymPick(pos, entities)` and **loop EVERY position** (was: a single `break` after
  the first match):
  ```
  let ents = output.output.entities;               // running set, threaded through picks
  for (const pos of reference_positions) {
    const row = dymByIdx.get(pos);                  // dym_last_result_set[idx]
    if (!row) continue;
    ents = applyDymPick(row, ents);                 // in-place replace of row.for_raw's slot; retains others
  }
  output.output.entities = ents;
  output.output.reference_positions = [];           // stock byIdx block no-ops for this turn
  ```
  - Each pick replaces **its own** `for_raw` token, so `1,4` (row1.for_raw=`SRTW808`, row4.for_raw=`SRTW809`)
    resolves BOTH source tokens. Each call carries `{code(=value/product), uuid, for_raw, for_hint,
    for_canonical, dym_slot(=dym_offer.id)}` → same replacement `tryDymPick` does today (retain all prior
    entities incl. the resolved stock entity, replace the source token's entity via `for_raw`/`dym_slot`, carry
    prior date, `entity_op='replace_combine'`, `scope_exclusive=false`, `dym_pick_applied=true`,
    `dym_offer_pick_code`). **Threading is load-bearing:** each `applyDymPick` must operate on the PREVIOUS
    call's output entity set so replacements ACCUMULATE (not clobber). Reuse the existing retention logic — do
    not fork it.
- **`ambiguous` branch — REMOVED in v3.** No `dym_clarify_needed`, no `dym_clarify_pos`. Delete it entirely.
- **When the handler does NOT fire** (`reference_target` is `result`/`null`, or no `dym_last_result_set`, or no
  positions): `reference_positions` flow **untouched** into the existing byIdx block → **byte-identical to
  today**. This covers: (a) every no-dym turn; (b) `reference_target === 'result'` (stock pick); (c) the
  full-miss dead-end (change #1) — it has no `dym_last_result_set` (its dym set lives in `last_result_set` with
  `selection_context='suggest_offer'`), so the handler is skipped and the existing byIdx-over-`last_result_set`
  path resolves the pick exactly as change #1 ships today.
- **Early-return backbone (safety):** the handler's first guard is `if (!Array.isArray(prevState.dym_last_result_set)
  || prevState.dym_last_result_set.length===0) return;` — so a stray non-null `reference_target` on a no-dym
  turn is inert (no dym set → handler returns → byIdx path unchanged).

### 2.4 ~~The AMBIGUOUS → CLARIFY sub-flow~~ — REMOVED IN v3 (was v2 §2.4)
Deleted. No clarify prompt, no `dym_clarify_*`, no second marker bracket, no re-persist-both-sets clarify
branch. A bare number routes straight to `dym`; a qualified phrase routes to `result`. There is no third
outcome and no extra turn.

---

## 3. End-to-end routing (worked — v3)

Partial-miss turn T1: `SRTW808 @3 SRTW809 @2 check stock` (both miss; a resolved product also present).
State after T1: `last_result_set` = stock rows (idx 1..N); `dym_last_result_set` = M dym candidates
(idx 1..M, e.g. SRTW808→1,2,3; SRTW809→4); `dym_offer` armed; `variables.response` =
"Previous turn (inventory): returned N records [M did-you-mean suggestions active]". **Single bracket, ALL
domains — there is no `[results numbered]` in v3.**

| T2 reply | parser emits | output_exchange | result |
|---|---|---|---|
| `"2"` | `reference_positions=[2]`, `reference_target="dym"` | numbered-dym handler → dym[2] → in-place replace via for_raw | checks dym candidate #2, resolved stock entity retained |
| **`"1, 4"`** (multi) | `reference_positions=[1,4]`, `reference_target="dym"` | **loop:** dym[1] (for_raw SRTW808) + dym[4] (for_raw SRTW809), both replaced | **checks BOTH** dym #1 and #4; get-results returns stock for both (or #3 no-stock note if empty) |
| `"1 and 4"` | `reference_positions=[1,4]`, `reference_target="dym"` | same as above | both resolved |
| `"the 2nd one"` | `reference_positions=[2]`, `reference_target="result"` | handler skipped → existing byIdx over `last_result_set` | checks stock row #2 |
| `"product 2"` | `reference_positions=[2]`, `reference_target="result"` | existing byIdx over stock | checks stock row #2 |
| `SRTW8081-P` (typed code) | code entity (no positions) | `tryDymPick` code path (unchanged) | checks that dym candidate |
| no dym active (normal turn) | `reference_target=null` | existing byIdx over `last_result_set` | today's behavior, byte-identical |

**Same-token multi-pick edge (flagged, §7 R-v3-1):** `"1, 2"` (both alternatives for the SAME missed token
SRTW808, so both rows share `for_raw='SRTW808'`) — under strict per-`for_raw` replacement the second pick
overwrites the first's slot (one source token → one entity). See §7 for the recommended handling.

---

## 4. Backwards-compat / regression invariants (hard gates)

- **No-dym turn = byte-identical.** No marker in `response` → parser never sets `reference_target` non-null →
  the numbered-dym handler does not fire → `reference_positions` reach the existing byIdx block unchanged, and
  `compile-current-state` takes its normal answered-turn branch. Parser output gains only the
  `reference_target:null` key (LESSON-40 replay rule). `compile-current-state` `M===0`/no-miss path is a pure
  no-op.
- **Stray non-null `reference_target` on a no-dym turn stays inert.** The handler early-returns when
  `dym_last_result_set` is absent → no dym set → byIdx path unchanged (§2.3 backbone guard).
- **Full-miss dead-end (change #1) numbered pick keeps working.** No `dym_last_result_set` on that path →
  handler skipped → byIdx over `last_result_set` (= the change-#1 dym suggest set,
  `selection_context='suggest_offer'`) resolves the pick exactly as today. **Confirm in a canary.**
- **The stock positional affordance is preserved via qualification** (§1.1): a `result`-tagged reply resolves
  the stock row via the untouched byIdx block. A bare number no longer picks stock (accepted trade-off).
- **Replay `norm()`:** always drop `reference_target` when null on both sides; retain when non-null. (v3: only
  `result`/`dym` ever appear non-null.)

---

## 5. Node / promotion surface (unchanged count: 3 business-diff nodes across 2 workflows)

| node | id (live) | type | tier | touches LIVE parser? |
|---|---|---|---|---|
| `compile-current-state` | `0804657c` (spine) | **Code** (deterministic) | offline unit gate | no (spine Code) |
| AI-Agent `systemMessage` (POSITIONAL rule + `reference_target` = `result\|dym\|null`) | `c637b079` (in `XTODTw`) | **PROMPT** | `parser` — real LLM, **CANARY REQUIRED** | **YES** |
| `output_exchange` (numbered-dym handler, MULTI-SELECT loop) | `847a1173` (in `XTODTw`) | **Code**, INSIDE the parser sub | `parser` (invisible to mock, LESSON 28) | **YES** |

**Promote bundle (all user-gated, separate publishes per LESSON 51):**
1. Parser sub `XTODTw` — prompt + `output_exchange` (one workflow, two nodes; publish once). Build as **live +
   own hunks** (LESSON 57 — the fork carries an extra orphaned `Postgres Chat Memory` node; never block-copy
   it), target by node **NAME** (LESSON 58c), byte-SHA gate both sides.
2. Spine `9qVyfUxmRQqrpGRMDLRuz` — `compile-current-state`.
3. **Ordering:** publish the **parser sub FIRST**, then the spine (LESSON 37). Parser-first keeps every
   intermediate state safe (spine writing `dym_last_result_set`/the marker before the parser knows how to
   classify is inert — the parser just yields `reference_target=null` → today's behavior; parser reading a
   field the spine doesn't yet write also yields `null` → today's behavior).
- Bundle interaction with **#3 (`dym-zerostock-itemize`, compile-current-state-only):** the two
  `compile-current-state` diffs are disjoint (#3 appends a `No stock records found for:` line; #2 appends the
  `Couldn't find these:` dym block + writes `dym_last_result_set`/marker). If both land in one window, build
  the target as **live + both hunks** and re-diff (LESSON 57). See §6 for the final append order.

---

## 6. Integration with #3 (`dym-zerostock-itemize`) — append order (confirmed, no collision)

#3 (zero-stock itemize, `../plans/dym-zerostock-itemize-plan.md`) appends `No stock records found for: …` after
the stock rows and before the #2 dym block. **v3 removes compile-current-state's clarify branch and the
`[results numbered]` emission — neither ever existed in #3's IIFE placement, so there is no collision.** The v3
removals only DELETE code (clarify branch, second-bracket emission); #3's self-contained IIFE (inserted after
the disclaimer IIFE, before the #2 dym append) is untouched.

**Final `compile-current-state` customer-facing append order:**
```
<stock rows>                                  (already in userResponse)
                                              (blank line)
No stock records found for: <codes>.          ← #3 (zero-stock itemize)
                                              (blank line)
Couldn't find these: … <numbered 1..M dym>    ← #2 (this change; feeds dym_last_result_set)
```
**Both sets are structurally disjoint** (#3 lists RESOLVED-but-empty products from `compatible_entities`; #2
lists UNRESOLVED tokens from `missResolutions` — mutually exclusive, #3 Q5). The `variables.response` marker
(`[M did-you-mean suggestions active]`) is written only by #2 and is unrelated to #3's customer-facing line.

---

## 7. Risks needing USER decision BEFORE coding (v3)

- **R-v3-1 — Same-token multi-pick collision (NEW, needs a decision).** `"1, 2"` where dym rows 1 and 2 are
  two alternatives for the SAME missed token (both `for_raw='SRTW808'`). Strict per-`for_raw` replacement makes
  the second pick overwrite the first (one source token → one entity slot), so only one of the two gets checked
  — a silent partial multi-select. The locked spec ("each pick replaces its own for_raw token") is framed on
  the one-per-token case (`1,4`) and does not say what to do here.
  **Recommendation:** make `applyDymPick` ADD each picked candidate as a distinct resolved entity (drop the
  missed token's placeholder once per `for_raw`, then append each picked candidate), so `1,2` checks BOTH
  products. This stays general (no overfit) and matches the customer's intent ("check these two"). **DECISION
  NEEDED:** accept accumulate-both, or keep last-wins per for_raw (simpler, but silently drops a pick).
- **R-v3-2 — Bare-number-loses-stock-pick trade-off (LOCKED/ACCEPTED — recorded, not a decision).** §1.1: a
  bare number now routes to dym; stock-row drill-down requires "product N"/"the 2nd one". User accepted.
- **R-v3-3 — Parser reliability on multi-number extraction into `reference_positions`.** The classifier must
  emit `[1,4]` for `"1, 4"` and `"1 and 4"` (existing multi-position behavior) AND tag `reference_target="dym"`.
  This is run/seed-sensitive (LESSON 39) → the §PD-dym-multi canary scores "resolves the CORRECT picks OR safe
  abandon = PASS; resolves the WRONG set / drops a pick = soft FAIL to record". Not a blocker; a systematic
  wrong-default holds promote.
- **R-v3-4 — `reference_target` as an always-emitted new parser field.** Registered ignored-when-null in the
  replay `norm()` (LESSON 40). Confirm the reviewer accepts this over a full re-baseline. Process ack.
- **R-v3-5 — Live-parser blast radius.** Editing `XTODTw` runs every turn. The prompt delta is additive (one
  new field + one short rule gated on the dym marker); `output_exchange`'s new branch is gated on
  `reference_target==='dym' && dym_last_result_set` → inert on every turn today. Higher-stakes half → the whole
  change is `parser`-tier and user-gated. Process ack.

**The ONE genuinely-open pre-coding decision in v3 is R-v3-1 (same-token multi-pick).** v2's R2 wording
sign-off is CLOSED by the redesign (single bracket, no augmentation). R1's clarify is removed. R3 is unchanged.

---

## 8. Verification tasks (planner-defined — v3)

- **V-PD-compile (offline unit, 0-token — spine Code gate).** Pin `compile-current-state` `$()` inputs per the
  §9 partial-miss fixture. Assert: `last_result_set` == the STOCK rows (NOT overwritten); `selection_context
  === null`; `dym_last_result_set` length M, idx 1..M contiguous, each row carries `for_raw`=its source token;
  `dym_offer` armed + survived the `_answered` kill; `variables.response` == today's compressed string **plus
  the SINGLE bracket** `[M did-you-mean suggestions active]` (assert NO `[results numbered]` and NO clarify
  text anywhere); `user_response` == stock answer + `Couldn't find these:` block. Run the changed clone jsCode
  AND the current LIVE jsCode on the same input; the marker/`dym_last_result_set`/survival asserts must go RED
  on live (fail-on-purpose negative control).
- **V-PD-compile-R (no-miss regression, HARD GATE).** §9 fixture reduced to the resolved product alone →
  changed `compile-current-state` output **byte-identical** to current LIVE (no marker, `last_result_set`=stock,
  `selection_context` null, no `dym_last_result_set`, `dym_offer` lifecycle unchanged). The byte-diff must be
  NON-empty against the partial-miss fixture (proves the comparison is a real instrument).
- **V-PD-dym (real reformulator — THE classifier gate, single pick).** Multi-turn via `chat-stateful` (reset
  `respond_contacts_test` ONCE before T1). T1 = §9 partial-miss inventory query (real reformulator + real
  resolver, egress structurally blocked). T2 = `"2"` → assert parser `reference_positions=[2]`,
  `reference_target="dym"`; `output_exchange` resolves dym candidate #2 (in-place replace via `for_raw`,
  `dym_pick_applied=true`), STOCK `last_result_set` untouched, resolved stock entity retained. LESSON-39
  scoring: correct dym pick OR safe new-query abandon = PASS; resolves a stock row = soft FAIL, RECORD. Run ≥3×.
- **V-PD-dym-multi (NEW — multi-select, real reformulator, THE v3 addition).** Same T1. T2 = **`"1, 4"`** (and
  a variant **`"1 and 4"`**, fresh T2 each) → assert parser `reference_positions=[1,4]`,
  `reference_target="dym"`; `output_exchange` LOOPS both → resolves dym #1 (for_raw of token A) AND dym #4
  (for_raw of token B), **both** source tokens replaced, resolved stock entity retained,
  `reference_positions` cleared. get-results returns stock for both (or #3's `No stock records found for:` note
  if a pick is empty). LESSON-39 scoring: resolves BOTH correct picks OR safe abandon = PASS; drops a pick or
  resolves the wrong set = soft FAIL, RECORD. Run ≥3× each phrasing. (Covers R-v3-3.)
- **V-PD-result (real reformulator — result-qualified phrase → STOCK).** Same T1. T2 = `"the 2nd one"` (and
  variants `"product 2"`, `"price of the first stock"`, fresh each) → assert `reference_target="result"`;
  numbered-dym handler SKIPPED; the STOCK row resolves via the unchanged byIdx; no dym pick. Scoring: correct
  stock row OR safe abandon = PASS; resolves a dym candidate = soft FAIL, RECORD. Run ≥3×.
- **V-PD-fullmiss (full-miss dead-end regression, real reformulator — change #1 intact).** T1 = a pure
  full-miss query (all tokens miss → change-#1 dead-end offer, `last_result_set`=dym suggest set,
  `selection_context='suggest_offer'`, no `dym_last_result_set`). T2 = `"1"` → assert the pick resolves against
  `last_result_set` (dym) via the UNCHANGED byIdx path (handler skipped), byte-identical to change-#1 today.
- **V-PD-noref-R (no-dym regression, real reformulator + replay).** A normal stock turn with NO miss → T2 bare
  number → parser `reference_target=null` → byIdx over stock `last_result_set` resolves the stock row (today's
  affordance intact on a NO-DYM turn). Assert `output_exchange` output for a no-dym turn is byte-identical to
  today apart from the new `reference_target:null` key. Register the LESSON-40 replay `norm()` rule and show a
  sample of golden turns does not diff on it.
- **V-PD-classifier-ratio (real reformulator, `parser` tier — both directions, report a ratio).** Sweep the
  canary phrasings and REPORT a pass ratio: bare-number→dym (incl. multi `"1, 4"`/`"1 and 4"`) and
  result-phrase→result, in BOTH directions. A systematic wrong-default is a promote blocker (R-v3-3/R-v3-5).
- **V-PD-promote (live promote gate, not a case).** Parser sub FIRST then spine; byte-SHA both sides;
  post-promote verify on REAL partial-miss turns (LESSON 56 — the SPECIFIC paths, both directions): `"2"` and
  `"1, 4"` route to dym (both picks resolve); `"the 2nd one"`/`"product 2"` route to stock.

---

## 9. Acceptance fixture (partial-miss stock query)

1 resolved product (`SRTWT902`, stock answer) + 2 unresolved tokens each with ≥1 alternative; domain
inventory; all hints product. `SRTW808` → alts `SRTW8081-P, SRTW8082-P, SRTW8083-P` (cap3); `SRTW809` →
`SRTW8091-P`. Gate `require_specific:false`, `compatible_entities:[SRTWT902]`,
`allowed_lookup:['product',…]`, `domain:'inventory'`. `central-exchange.response` = the SRTWT902 stock text.
`qf.message_type='business_query'`, `domain_hint='inventory'`. Empty prior session.

**Acceptance (must all hold):**
1. `user_response` = SRTWT902 stock answer + blank line + `Couldn't find these:` block numbered 1..M
   (SRTW808→1,2,3; SRTW809→4) + footer `Reply a number to check it, or ask again.` (M≥1).
2. `variables.last_result_set` == the STOCK rows (NOT the dym candidates). `variables.selection_context === null`.
3. `variables.dym_last_result_set` length **4**, idx 1..4 contiguous, `value/product` = candidate codes in
   order, each `entity_type:'product'`, `for_raw` = source token (rows 1-3 `SRTW808`, row 4 `SRTW809`).
4. `variables.dym_offer` = `{id:'<exec>', domain:'inventory', ttl:3, candidates:[4], picked:[]}` — SURVIVED the
   `_answered` kill; `dym_candidates` mirrors it (len 4, per-token `for_raw`).
5. `variables.response` = today's compressed `Previous turn (inventory): returned 1 records` **+** the SINGLE
   bracket `[4 did-you-mean suggestions active]`. **NO `[results numbered]` bracket** (deleted in v3). The
   leading `Previous turn (inventory)` regex-target is byte-unchanged.
6. `quick_reply` unset (numbers typed → no buttons).
7. **Round-trip (real reformulator):** T2 `"2"` → dym candidate #2 (for_raw replaced, result retained); T2
   `"1, 4"` → dym #1 AND #4 (both source tokens replaced); T2 `"the 2nd one"` → stock row #2.
8. **Regression:** no-miss fixture → byte-identical (V-PD-compile-R); full-miss `"1"` still resolves
   (V-PD-fullmiss); no-dym normal turn byte-identical (V-PD-noref-R).
9. **§0 S1–S8** all hold (parser tier: S6 → only the reformulator LLM runs; S8 → the fork carries a
   `memoryPostgresChat` node, so isolated `is_test:false` fork runs are BARRED — test via the FULL clone with
   real reformulator, egress structurally blocked).

---

## 10. Safety / harness binding (§0)

Zero-egress is **structural** on the clone (fail-closed): all three edited nodes emit fields consumed
downstream and add NO egress node. The v3 removals (clarify branch, second bracket) only DELETE code — they
add nothing that could egress. Every case is bound by UAC.md §0 (S1–S8). Prod-ingest gate = **S7a/S7b**
(sink-delta + payload attribution; LLEN-equality withdrawn, LESSON 45). The offline unit (V-PD-compile*)
exercises no egress at all. The real-reformulator cases run the FULL clone — subs receive `is_test:true`,
egress orphaned/sinked — and consume ONLY the reformulator LLM (S6 parser tier). The backward-compat backbone
is unchanged: `output_exchange`'s handler early-returns when `dym_last_result_set` is absent → no-dym turns +
change-#1 full-miss dead-end stay byte-identical, and a stray non-null `reference_target` on a no-dym turn is
inert. Replay-norm: always ignore `reference_target` when null both sides. `dym-single-use` ttl/picked
lifecycle is preserved (we add a new idx'd read path over the SAME offer; rules 2-7 untouched).
