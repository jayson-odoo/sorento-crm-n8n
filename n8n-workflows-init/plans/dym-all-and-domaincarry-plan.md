# Change: `dym-all-and-domaincarry` (#4 select-ALL + #5 pick-domain-carry) — parser `output_exchange` only

Status: PLAN (planner deliverable). **DOCS ONLY** — no workflow edited, no execution run. **Awaiting USER
APPROVAL before any coding** (both edits touch the LIVE parser sub `XTODTw`).

**Scope tag: `parser`.** Both fixes are deterministic Code edits INSIDE the reformulator sub's
`output_exchange` node — invisible to `mock_reformulator_output` (LESSON 28) → the flagship gates are 0-token
OFFLINE units on `output_exchange`, and the round-trips run the REAL reformulator (token-bearing). No prompt
(`systemMessage`) change: both are handled in code, per the task's "prefer `output_exchange` over prompt."

**Bundled with #1 (`dym-multitoken`, build-suggest-offer), #2 (`dym-partial-disambiguation` v3, parser prompt
+ `output_exchange` + compile-current-state) and #3 (`dym-zerostock-itemize`, compile-current-state).** #4/#5
are additive hunks on the SAME parser node (`output_exchange`) as #2 — they promote in the #2 parser publish.

Build/test target = **CLONE `txiPzSxy3Pclsz6v`** + the parser fork it calls **`wI5RkNGW3EOJfBdo`**
(`sub-semantic-parser FORK domain-continuity-carry`). Live spine = `9qVyfUxmRQqrpGRMDLRuz`, live parser =
`XTODTw-dJcV0uRdC056hG` — **never edited during build**; promote is user-gated (§7).

---

## 0. Ground truth read this cycle (against the fork `wI5RkNGW3EOJfBdo`, read-only via MCP)

The fork ALREADY carries the #2 v3 build, #1 dym helpers, `dym-single-use` `dym_offer`, and
domain-continuity rev4. `output_exchange` (node `847a1173`, 787 lines) contains, in execution order:

| L | thing | relevance |
|---|---|---|
| 2–49 | `deriveRouting(out)` | keys on `out.domain_hint` ONLY (a `switch(domain)`); `intent_hint` is NEVER read here |
| 163–205 | `applyDymPick(_hit,_offer,_priorEnts,_useSlot)` | **the SINGLE shared pick-retention impl** — called by both paths, runs ONLY on a confirmed pick |
| 206–229 | `tryDymPick()` IIFE | code-reply path: `_hit=_cands.find(_codeMatches); if(!_hit) return;` → `applyDymPick(_hit,_offer,_prev.entities,true)` |
| 247 | `_explicit = _DECISIVE_INTENTS.has(intent_hint) && !!domain_hint` | rev4 continuity gate |
| 371–396 | `"ALL / SEMUA"` expansion | fires only when `_pickCtx` (`_refSet` OR `selCtx∈{disambiguation,suggest_offer}`) over `_lrsAll` |
| 397–402 | domain-inherit-for-position | `if (!domain_hint && prevState.domain_hint && reference_positions.length>0)` inherit |
| 420–444 | `dymNumberedMultiSelect()` IIFE | numbered path: guards `reference_target==='dym'` + `dym_last_result_set.length>0`; per resolved row `applyDymPick(_hit,_offer,_base,false)` (ADD-BOTH) |
| 446–493 | byIdx block | stock positional resolution over `last_result_set` |
| 649–659 | routing finalize | `derived = domain_hint ? deriveRouting(...) : {null,null}`; a NON-`request_for_help` turn takes `derived` (LLM routing ignored) |

**`dym_offer.domain` is populated at BOTH offer-build sites** (confirmed):
- `build-suggest-offer` `_mkOffer` (L31–32): `{ id, domain: (q && q.domain_hint) || null, ttl:3, candidates, picked:[] }` — full-miss #1.
- `compile-current-state` `_mkOffer` (L365–366): `{ id, domain: (qf && qf.domain_hint) || null, … }` — partial-miss #2.

Both derive `.domain` from the offer-build turn's `domain_hint` (`|| null`). For a stock offer (`domain_hint==='inventory'`) → `.domain==='inventory'`. If the offer turn had a null domain, `.domain` is null → #5 is a safe no-op (guarded on `_offer.domain` truthy).

**How the spine routes on the parser output (confirmed against the clone spine `txiPzSxy3Pclsz6v`):**
- `Execute 'sub-get-rag'` (tool selection) embeds `intent_hint / domain_hint / user_goal` in its `message`
  AND passes **`domain: {{ …output.domain_hint }}` as a pgvector FILTER** → `domain_hint` is the tool-set
  discriminator (inventory tools vs `master_products`/catalogue tools).
- `disallowed-entity-gate` `ALLOWED` / `REQUIRE_SPECIFIC_DOMAINS` keys on `domain_hint`.
- `deriveRouting` keys on `domain_hint` ONLY.
- `Call 'sub-get-results'` forwards `intent_hint`, `domain_hint`, `user_goal` into the agent's
  `semantic_input` (and `tool` = the RAG-selected `$json.name`).
- **⇒ `domain_hint` is the single load-bearing routing/tool-set signal. `intent_hint`/`user_goal` only
  influence RAG ranking WITHIN the domain-filtered candidate set and the get-results agent's reading.**

---

## 1. #5 — a did-you-mean PICK must stay in the offer's domain (not become a catalogue lookup)

### 1.1 Repro + root cause (with evidence)
`check stock for C21263XUW-P-ENG` → did-you-mean → user picks `C2181XUW-P-ENG` → reply is a `master_products`
CATALOGUE answer (list price / discontinued / "Here are the matching products"), NOT stock.

The parser, on a bare-code pick, does NOT reliably emit an entities-only clean pick. Two observed shapes:
- **Clean pick** (live exec `9433641`, `XTODTw`): raw LLM output = `entities:[<code>]`, `domain_hint`/`intent_hint`/dates all **null**. `_explicit=false` → the rev4 continuity gate (L556) carries `prevState.domain_hint` → **already correct today**.
- **Contaminated pick** (live exec `9559839`, backlog-bare-code-domain-carry; and exec `9433688`, dym-single-use): the LLM re-classifies the bare code as `intent_hint:'check_product'` (a DECISIVE intent) + `domain_hint:'master_products'` → `domain_signal_source:'intent_explicit'` (`_explicit=true`) → the rev4 carry gate is **SUPPRESSED** → `domain_hint` stays `master_products` → get-rag filters to catalogue tools + `deriveRouting`→`purchasing_product` → **the catalogue answer. This is the bug.**

So #5 is precisely the contaminated case the rev4 intent-only carry cannot cover (that gap is
[[backlog-bare-code-domain-carry]]). #5 fixes it NARROWLY using the **strong `dym_offer.domain` signal that
only exists on a confirmed pick** — it does NOT attempt the general bare-code-in-session carry (still backlog).

### 1.2 RESOLVED field list — exactly what to override on a pick (with evidence)

| field | action on a confirmed pick | why (evidence) |
|---|---|---|
| **`output.output.domain_hint`** | **SET = `_offer.domain`** (guarded on truthy) | REQUIRED, load-bearing. It is the get-rag `domain` FILTER, the `disallowed-entity-gate` key, AND the `deriveRouting` key. Overriding it alone fixes the tool-set, the gate, and the team. |
| **`output.output.intent_hint`** | **SET = `previous_conversation_state.intent_hint ?? null`** | RECOMMENDED. `intent_hint` is fed to the get-rag embedding text + the get-results agent `semantic_input`. Realigning it to the offer turn's intent (or nulling the contaminated `check_product`) makes the contaminated pick behave like the proven-correct CLEAN pick (exec 9433641: intent null → domain-filtered stock tool). Removes the residual RAG-ranking skew. |
| `output.output.routing` | **do NOT set directly** | `deriveRouting` recomputes `routing` from `domain_hint` at L649; a pick is never `request_for_help`, so `derived` wins over the LLM's routing. Forcing `domain_hint` before L649 is sufficient. Setting routing by hand would duplicate/fight deriveRouting. |
| `output.output.message_type` | already `'business_query'` | `applyDymPick` L194 already sets it. |
| `output.output.user_goal` | leave as-is (R-DC-2) | Only a RAG-ranking input; the `domain` filter dominates. Nulling is a belt-and-suspenders option — flag, not default. |

**Answer to "is `domain_hint = dym_offer.domain` alone enough?"** — YES for correct ROUTING + TOOL-SET
(the repro is fixed by `domain_hint` alone). `intent_hint` realignment is added to remove a residual RAG
ranking/interpretation skew and to make the contaminated pick identical to the proven clean-pick path;
`routing` must NOT be hand-set (deriveRouting owns it).

### 1.3 WHERE + the pick predicate (the gate the coordinator made blocking)

**Apply the override INSIDE `applyDymPick`** (one edit covers BOTH paths), at the END of the body, just
before `return _final`:

```js
  // ── #5 domain-carry: a confirmed dym pick STAYS in the offer's domain (never a catalogue lookup).
  // Gated implicitly: applyDymPick runs ONLY on a real pick (tryDymPick found a candidate, or the
  // numbered handler resolved a dym row). Guarded on the offer having stored a domain.
  if (_offer && _offer.domain) {
    output.output.domain_hint = _offer.domain;                                   // load-bearing (RAG filter + gate + deriveRouting)
    output.output.intent_hint = _pv.intent_hint != null ? _pv.intent_hint : null; // realign to offer intent; drop contaminated check_product
    output.output.dym_pick_domain_forced = _offer.domain;                        // diagnostic (register drop-when-absent in replay norm())
  }
```
(`_pv` = `parent_input.previous_conversation_state` is already bound at the top of `applyDymPick`, L165.)

**The pick-detection predicate (robust, no false-positive):**
- **Code-reply path** — `applyDymPick` is reached ONLY after `tryDymPick`'s `_hit = _cands.find(_codeMatches)`
  is truthy and `if (!_hit) return;` passes. `_codeMatches(c)` requires `!_isDateLike(c.code)` AND
  (`norm(c.code) === _msg` OR a **current-message entity** whose `raw`/`canonical_code` equals `c.code`). So
  the pick fires only for a code that is actually in `_offer.candidates`.
- **Numbered path** — `applyDymPick` is reached ONLY inside `dymNumberedMultiSelect`, which first requires
  `reference_target === 'dym'` (L422) AND `dym_last_result_set.length > 0` (L426), then per position
  `_row = _byIdx.get(pos)` truthy (`if (!_row) continue;`) → a dym row actually resolved (`_applied=true`).
- **Neither fired ⇒ `applyDymPick` never runs ⇒ `domain_hint`/`intent_hint`/`routing` untouched — a pure no-op.**

**Cannot false-positive on the coordinator's non-pick replies:**
- a NEW/unrelated query → no candidate `_codeMatches`, `reference_target` not `'dym'` → no pick.
- an unrelated code NOT in the offer → `_codeMatches` false for all candidates → `tryDymPick` returns → no pick.
- a bare number that is NOT a valid dym idx → `_byIdx.get(pos)` undefined → `continue` → `_applied` false → no pick.
- casual / abort ("no", "never mind", "thanks") → no code/number match → no pick; existing decline/casual arm runs.

**Ordering / timing (verified against the fork):** `applyDymPick` runs at L228 (code path — BEFORE `_explicit`@247
and BEFORE `deriveRouting`@649) and at L437 (numbered — AFTER `_explicit` but BEFORE `deriveRouting`@649). Both
sites are before L649, so `deriveRouting` reads the forced `domain_hint` in both. The code path recomputes
`_explicit` at L247 on the forced domain (harmless — carry gate then no-ops idempotently); the numbered path's
`_explicit` was computed on the pre-force (usually null-intent) shape (also harmless — domain is forced directly).

### 1.4 The one residual edge (needs a USER decision)
**R-DC-1 — an OFFERED candidate code re-typed inside a new-domain phrase** (e.g. offer had `SRTW8081-P`, user
types *"promotions for SRTW8081-P"*). `tryDymPick` **already** classifies this as a pick TODAY (via the
`_curEnts` current-message-entity branch of `_codeMatches`), retaining prior entities + replacing the code.
#5 would additionally force `domain_hint = _offer.domain` (inventory) — overriding the customer's explicit
"promotions". This is bounded: #5 does NOT widen the pick set (the existing `tryDymPick` predicate is
unchanged); it only aligns the domain of a message ALREADY classified as a pick.
- **Recommendation:** ship as-is (force on all confirmed picks). The case is rare (customer re-typing an
  offered code with a *different* purpose word) and the pick classification is pre-existing.
- **Stricter option (if the user prefers):** force the domain only when the pick was a **bare-code match**
  (`norm(c.code) === _msg`) or a **numbered pick**, NOT the current-entity-wrapped branch — i.e. thread a
  `_bareMatch` flag from `tryDymPick` into `applyDymPick`. This narrows R-DC-1 out but adds a small heuristic
  (the coordinator asked to avoid broad heuristics; this one is narrow). **DECISION NEEDED.**

---

## 2. #4 — support "all" to select ALL did-you-mean suggestions

### 2.1 Root cause (confirmed against the fork, L371–396)
The existing ALL/SEMUA expansion fires only when `_pickCtx` is true (`_refSet.length>0` OR
`selCtx ∈ {disambiguation, suggest_offer}`) and expands over `_lrsAll` (= `last_result_set`). The #2 v3
partial-miss design keeps `selection_context = null` and puts suggestions in the SEPARATE
`dym_last_result_set` → `_pickCtx` is false AND `_lrsAll` is the STOCK rows → the dym offer is invisible to
the ALL block → "all" falls through to the LLM "broaden the search or focus?" reading.

### 2.2 Extension sketch (deterministic; keep non-dym "all" byte-identical)
Inside the existing `if (_isAll && _noPos)` guard, branch on a dym offer being active FIRST:

```js
  const _dymActive = Array.isArray(prevState.dym_last_result_set) && prevState.dym_last_result_set.length > 0
                     && /\[\d+ did-you-mean suggestions active\]/i.test(String(prevState.response || ''));
  if (_isAll && _noPos && _dymActive) {
    // #4: "all" over an active did-you-mean offer → select EVERY suggestion, routed through the
    // numbered multi-select handler (ADD-BOTH). Deterministic — overrides the LLM's broaden reading.
    output.output.reference_positions = prevState.dym_last_result_set
      .map(r => Number(r.idx)).filter(Number.isInteger);
    output.output.reference_target = 'dym';       // dymNumberedMultiSelect (L420) will catch it
    output.output.scope_intent     = null;        // cancel the broaden
    output.output.message_type     = 'business_query';
    output.output.select_all_expanded = true;     // diagnostic + escalation-decline immunity (L611)
    // do NOT set entity_op='reuse' — applyDymPick sets replace_combine for each pick
  } else if (_isAll && _pickCtx && _lrsAll.length > 0 && _noPos) {
    /* …the EXISTING non-dym expansion, byte-identical (stock/menu/suggest_offer path)… */
  }
```

- The `_dymActive` marker check (`prevState.response` contains `[N did-you-mean suggestions active]`) mirrors
  the exact signal the parser LLM uses (#2 §0.1) — belt-and-suspenders on top of the structural
  `dym_last_result_set.length>0`. If the reviewer prefers structural-only, drop the regex clause (flag R-ALL-1).
- **Ordering:** the ALL block is at L~387, BEFORE `dymNumberedMultiSelect` (L420) → the handler catches
  `reference_target==='dym'` + the expanded positions, loops every one via `applyDymPick` (ADD-BOTH,
  threading), and clears `reference_positions` so the stock byIdx block (L446) no-ops. Each pick then hits
  **#5's domain-force** → every "all" pick resolves in the offer's domain (no catalogue leak).
- **`semua` / `everything` / etc.** already covered by the existing `_isAll` regex.
- **Non-dym "all" (broaden) unchanged:** when `_dymActive` is false, control falls to the EXISTING branch
  verbatim (or, for a true broaden with no pick-context, neither branch fires → LLM broaden reading intact).

### 2.3 Precedence note
On a v3 two-set turn, `last_result_set` = stock rows (non-empty) AND `dym_last_result_set` = suggestions
(non-empty), with `selection_context = null` (so `_pickCtx` is false and the old branch wouldn't fire anyway).
Putting `_dymActive` FIRST makes "all" mean "all the suggestions" — the set the customer was just told to
"reply a number to check". This matches #2's accepted bare-number→dym trade-off (recorded, not re-litigated).

---

## 3. Final `output_exchange` execution order (after #4 + #5)

1. `tryDymPick` (L228) — code pick → `applyDymPick` (**+#5 domain/intent force**)
2. `_explicit` (L247)
3. **#4** extended ALL/SEMUA (L~387) — dym-active → `reference_target='dym'` + all dym positions
4. domain-inherit-for-position (L397)
5. `dymNumberedMultiSelect` (L420) — consumes `reference_target='dym'` → `applyDymPick` per row (**+#5 force**)
6. byIdx block (L446) — no-ops when positions were consumed
7. `deriveRouting` (L649) — reads the forced `domain_hint`

---

## 4. Backwards-compat / regression invariants (hard gates)
- **No pick, no dym offer ⇒ byte-identical** (apart from the two new diagnostic keys when they fire, which
  never fire on these turns): `applyDymPick` doesn't run (#5 inert); `_dymActive` false so #4 falls to the
  existing branch or no-ops (#4 inert).
- **A NEW/unrelated query, unrelated code, out-of-range number, or casual/abort after an offer ⇒ #5 no-op**
  (parser's own `domain_hint`/`intent_hint`/`routing` pass through). This is the coordinator's blocking
  requirement — proven by §DC5-REGR-* below.
- **Non-dym "all"** (disambiguation menu / suggest_offer / quote-reply) ⇒ #4 takes the existing branch,
  byte-identical.
- **#2 v3 classifier, the two-set model, #1 full-miss dead-end, #3 zero-stock** all preserved: #4 only routes
  an "all" reply INTO the existing `dymNumberedMultiSelect`; #5 only sets `domain_hint`/`intent_hint` on a
  confirmed pick. Neither touches `compile-current-state`, `build-suggest-offer`, the systemMessage, or the
  byIdx/get-results logic. The full-miss dead-end pick (`#1`, `last_result_set` + `selection_context=suggest_offer`,
  no `dym_last_result_set`) still resolves via byIdx; its CODE-reply pick now also gets #5's domain-force via
  `tryDymPick`→`applyDymPick` (correct — offer.domain = query domain).
- **Replay `norm()` (LESSON 40):** register `dym_pick_domain_forced` and `select_all_expanded` as
  **drop-when-absent / flag-when-present** so they don't diff the ~2.2k golden turns.

---

## 5. Node / promotion surface
Single node changed vs the #2 baseline: **`output_exchange`** (`847a1173`, in `XTODTw` / fork
`wI5RkNGW3EOJfBdo`). Two additive hunks: (#5) inside `applyDymPick`; (#4) the `_dymActive` branch in the
ALL/SEMUA block. **No systemMessage change, no spine change.**

**Promote:** folds into the #2 parser publish (LESSON 57 — build target as **live + own hunks**, target by
node NAME (LESSON 58c), byte-SHA gate both sides; parser sub FIRST then spine per #2 §5). Because #4/#5 are
inert until a dym offer exists AND a pick/all fires, an intermediate state (parser has #4/#5 but spine hasn't
shipped #2's `dym_last_result_set`/marker) is safe: `dym_last_result_set` absent → #4 `_dymActive` false and
the numbered handler's backbone guard returns → today's behavior; #5 still fires on a full-miss (#1) code-pick,
which is correct.

---

## 6. Verification tasks (planner-defined)
- **V-DAC-0 (offline `output_exchange` unit, 0-token — PRIMARY GATE, #5).** Pin `applyDymPick` inputs for a
  CONTAMINATED code-pick: `parent_input.previous_conversation_state.dym_offer = {id, domain:'inventory',
  candidates:[{code:'C2181XUW-P-ENG',uuid,entity_type:'product',for_raw:'C21263XUW-P-ENG'}], picked:[]}`,
  `…entities=[the prior resolved entity]`, `latest_user_message='C2181XUW-P-ENG'`; raw LLM `output.output`
  carries `domain_hint:'master_products'`, `intent_hint:'check_product'`. Assert AFTER the node:
  `domain_hint==='inventory'`, `routing.suggested_team==='warehouse'` (deriveRouting), `intent_hint` realigned
  (`===prevState.intent_hint` or null), `dym_pick_applied===true`, entities retain-and-replace correct.
  **Fail-on-purpose:** run the CURRENT LIVE `output_exchange` on the same input → `domain_hint` stays
  `master_products`, routing `purchasing_product` → RED (proves the gate is real).
- **V-DAC-0b (offline unit, numbered path, #5).** `reference_target='dym'`, `dym_last_result_set=[{idx:2,…}]`,
  `reference_positions=[2]`, `dym_offer.domain='inventory'` → picked row resolved, `domain_hint` forced
  `inventory`. Confirms both paths share the force.
- **V-DAC-all (offline unit, #4).** `dym_last_result_set` = M rows, `prevState.response` carrying the
  `[M did-you-mean suggestions active]` marker, `latest_user_message='all'`, `reference_positions=[]`. Assert:
  `reference_positions` == all dym idx, `reference_target==='dym'`, `dymNumberedMultiSelect` resolves ALL M,
  entities ACCUMULATE all candidates, each carries `domain_hint==='inventory'` post-#5, positions cleared.
  **Fail-on-purpose:** current LIVE node on same input → NOT expanded (broaden) → RED.
- **V-DAC-all-R (offline unit, #4 regression — HARD GATE).** Non-dym "all": `selection_context='suggest_offer'`,
  `last_result_set` non-empty, NO `dym_last_result_set` → the EXISTING branch fires (byte-identical to today);
  and a no-context "all" with no offer → neither branch fires (LLM broaden reading intact).
- **V-DAC-noref-R (offline unit, both — HARD REGRESSION GATE).** A no-dym, no-pick turn → node output
  byte-identical to current LIVE (only the two diagnostic keys may differ, and only when they fire — assert
  they do NOT appear here). The byte-diff must be NON-empty against V-DAC-0 (proves the comparison is real).
- **V-DAC-pick-e2e (real reformulator, #5 flagship).** Via `chat-stateful` (reset `respond_contacts_test`
  once): T1 `check stock for C21263XUW-P-ENG` → dym offer. T2 pick `C2181XUW-P-ENG` → answer is STOCK (or
  "No stock records found for" if empty), NOT catalogue; assert `domain_hint == dym_offer.domain`, no
  "list price / discontinued / Here are the matching products". LESSON-39 scoring (correct-domain OR safe
  abandon = PASS; catalogue answer = HARD FAIL). Numbered variant: T2 `"2"`.
- **V-DAC-all-e2e (real reformulator, #4).** Same T1. T2 `"all"` (and `"semua"`, `"everything"`, fresh each)
  → every suggestion queried; STOCK for each (or #3 note if empty). LESSON-39 scoring.
- **V-DAC-noclobber (real reformulator, #5 no-clobber — the coordinator's blocking set).** Same T1; then a
  fresh T2 for each: (a) a NEW promotion/order/other-product query → `domain_hint` stays the parser's
  (promotion/order), NOT inventory, answer is the new query; (b) `"no"`/`"never mind"`/`"thanks"` → casual
  abort unchanged, no domain force; (c) a bare code NOT in the offer → resolves on its own domain, not forced
  to stock. **Fail-on-purpose:** assert `domain_hint !== 'inventory'` for (a)/(c) — it would be inventory only
  if #5 mis-fired.
- **V-DAC-promote (live promote gate).** Folded into #2's parser publish; byte-SHA both sides; post-promote
  verify on REAL turns (LESSON 56): a contaminated code-pick routes to stock; "all" resolves every suggestion;
  a new-query-after-offer keeps its own domain.

---

## 7. Risks needing USER decision BEFORE coding
- **R-DC-1 (needs a decision) — offered code re-typed in a new-domain phrase** forces offer.domain (§1.4).
  Recommend ship-as-is; stricter bare-match-only gate available.
- **R-DC-2 (flag, recommend leave) — `user_goal` on a pick** stays contaminated; only a RAG-ranking input,
  dominated by the domain filter. Null it only if the user wants belt-and-suspenders.
- **R-DC-3 (process ack) — `intent_hint` realignment.** Set to `prevState.intent_hint ?? null` on a pick.
  If prevState has no intent, we drop the contaminated `check_product` to null (matches the clean-pick path).
- **R-ALL-1 (flag) — #4 `_dymActive` marker clause.** Uses BOTH the structural `dym_last_result_set.length>0`
  AND the `prevState.response` marker regex. Reviewer may prefer structural-only (simpler, one signal).
- **R-DAC-2 (process ack) — new diagnostic keys** `dym_pick_domain_forced` / `select_all_expanded` registered
  drop-when-absent in the replay `norm()` (LESSON 40), not a re-baseline.
- **R-DAC-3 (process ack) — live-parser blast radius.** Both hunks run inside `XTODTw` every turn but are
  gated on a confirmed pick (#5) / an active dym offer + "all" (#4) → inert on every turn today. `parser`-tier,
  user-gated, folded into #2's publish.

---

## 8. Safety / harness binding (§0)
Zero-egress is **structural** on the clone (fail-closed): both edits are additive Code inside `output_exchange`
and add NO egress node. Every §ALL / §DC5 case is bound by UAC.md §0 (S1–S8). Prod-ingest gate = **S7a/S7b**
(sink-delta + payload attribution; LLEN-equality withdrawn, LESSON 45). Offline units (V-DAC-0/-0b/-all/-*-R)
exercise no egress at all and 0 LLM tokens. Real-reformulator cases run the FULL clone (subs `is_test:true`,
egress orphaned/sinked) and consume ONLY the reformulator LLM (S6 parser tier). S8: the fork carries a
`memoryPostgresChat` node → isolated `is_test:false` fork runs are BARRED; test via the full clone.
