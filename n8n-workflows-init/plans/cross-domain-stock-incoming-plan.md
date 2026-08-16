# Change: `cross-domain-stock-incoming` — when one axis is empty, tell the customer about the other

Status: **PLAN (design locked via grill session 2026-08-03). DOCS ONLY** — no workflow edited, no execution run.

Scope tag: **`deterministic`** — spine-side Code / If / executeWorkflow(read) nodes only. **No parser prompt edit**
(the escalate-offer reconciliation reuses the existing deterministic regex in the parser's `output_exchange`;
see §5). Not `parser` tier, not `get-results` tier.

Build/test target = fail-closed clone **`txiPzSxy3Pclsz6v`**. Live spine **`9qVyfUxmRQqrpGRMDLRuz`** (active
`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, 101 nodes) — **never edited during build**. Get-results sub on the clone =
**`rysSPgUssLDf6xJc`** (`sub-get-results TEST`); live = **`Fss5aAaXthJSWpZCgKiKR`** (remap at promote).

Source of truth: live n8n read read-only via MCP this session; CRM MCP presenters/catalog read read-only from
`/Users/tehjayson/Documents/foundryx/sorento_crm`.

---

## 0. The gap (user-reported, grounded)

Customer asks **only** about incoming/ETA. There is no incoming — but there is plenty of **stock on hand**. The bot
says "no incoming" and stops. The customer walks away believing there are no goods. Real customer feedback,
real screenshot (`Pls check eta SRTWT5800` → `No incoming stock (ETA) found for SRTWT5800.` + sibling list, all
"— no incoming" + escalate offer). Symmetric gap in the other direction: no stock → never told incoming exists.

Second face of the same gap, **multi-product**: ask A, B, C; A has incoming, B and C don't. B and C are today
named only by the flat live line `No stock records found for: B, C.` — with no word that B has 80 pcs sitting
in BRW-BB.

### Grounded routing (live spine, verified this session)

```
Call 'sub-get-results' → validator → If6
  If6 TRUE  (has_result && is_valid) → central-exchange → compile-current-state     [PARTIAL / answered]
  If6 FALSE                          → Loop → Aggregate1 → not-found-error-message
                                     → build-suggest-offer → tag-not-found
                                     → escalate-catalog → cs-offer-gate → compile-current-state   [TOTAL MISS]
```

- `build-suggest-offer` (live id `7972abd8`, **416 lines**) already carries D1 (resolver did-you-mean),
  D2 (get-results alternatives) and **D3 (sibling-family picker — LIVE, verified: `sibling-gate` /
  `sibling-transform` / `sibling-probe` all present on live)**.
- `compile-current-state` (live id `0804657c`, **528 lines**) already carries the **`dym-zerostock-itemize` (#3)**
  block, promoted 2026-08-01, which computes exactly the "asked but returned nothing" set and prints
  `No stock records found for: …` (wording marked "exact locked" in its plan).
- Reads: stock = **`crm_inventory_stock_balance_list`**, incoming = **`crm_incoming_stock_list`**. Both go through
  the SAME sub (`sub-get-results`), tool name is a workflow input → **a cross-probe is one extra `executeWorkflow`
  node**, deterministic path (`entity-ids-transformer` → `MCP Client1` → `output-structurer`), **zero LLM tokens**.
  Precedent nodes doing exactly this already exist and are live: `probe-incoming`, `sibling-probe`.

---

## 1. Locked decisions (grill session 2026-08-03)

| # | question | DECISION | rationale |
|---|---|---|---|
| Q1 | tell vs offer | **TELL (full answer inline)** | option C ("check stock?") needs the probe anyway to avoid offering a dead end; B burns a turn and depends on fragile domain-switch carry. Telling needs **zero** parser change. |
| Q2 | both-empty escalate team | **origin domain decides — unchanged.** inventory→warehouse, incoming→purchasing | user call; no `escalate-catalog` edit |
| Q3 | keep escalate offer when the other axis HAS data | **YES, always** | stock ≠ an answer to "when does it arrive"; purchasing still has something to say |
| Q4 | interaction with live D3 sibling picker | **coexist** (see Q5/Q16 for depth + order) | |
| Q5 | which products get cross-probed, how deep | **D0 — asked products only** (`requested` set), **full per-location detail**. Siblings are NOT cross-probed | message length bounded by what the customer typed, not by family size; per-location is required because a person can only draw from their own location; sibling totals without location would be actively misleading |
| Q6 | total miss only, or partial too | **BOTH — the feature is per-product, not per-turn** | user: "it should be itemised" |
| Q7 | one shared probe or one per branch | **shared, upstream of `If6`** | NOT for call count (a turn takes one branch either way) — for **one definition of the zero-set** |
| Q8 | wording unified across branches | **YES, identical rendering both branches** | divergent phrasing for the same fact is how two paths start lying to each other |
| Q8b | escalate offer on PARTIAL turns | **YES** | user call |
| Q9 | how the partial-turn offer arms | **E1 — append the locked phrase to BOTH `userResponse` and state `response`** | parser's `output_exchange` regex is the contract; no parser edit |
| Q10 | re-check access for the other domain | **NO GATE** (user call, see §7 RISK-1) | row-level `access_levels` scoping still flows through the probe; only the per-agent check is skipped |
| Q11 | date windows | incoming→stock probe: **no date params**. inventory→incoming probe: **unfiltered**. Date-widened incoming re-probe: **OUT of phase 1** | a stock asker has no window in mind |
| Q11b | row cap | **max 3 rows per product**, soonest ETA first / by location, `…and N more` tail | |
| Q12 | numbering collision with D3's picker | **N1 — cross-domain block uses BULLETS, never numbers** | numbers in a normal stock answer are decoration; in a picker they are a **contract** (`last_result_set`) |
| Q13 | reuse live #3's `missing[]` or copy | **H1 — HOIST. Single source of truth** (user call, reversed from H4 2026-08-03). The requested/missing computation moves to `crossdomain-zeroset`; live #3 is rewritten to **consume** it. Gated by a **shadow-equality proof** before the inline copy is deleted — §8 step 2b | user: "i prefer to have single source of truth". Duplication would eventually drift and no one would notice which copy is right |
| Q13b | #3's domain gate + printed wording | **UNCHANGED** — gate still `{inventory, incoming}`, printed line still `No stock records found for: …`. Only its *computation* is replaced. Disambiguate on OUR side: our block always says **"on hand"**, never bare "stock" | the hoist is an internal refactor; #3's observable output must stay byte-identical |
| Q14 | probe failure | **F1 fail-silent** → byte-identical to today's message. No timeout cap | |
| Q15 | session state | **only state `response` changes** (the appended phrase). `last_result_set` and `selection_context` **untouched** — cross-domain rows are display-only | rows are not numbered, so nothing may quote them; a hidden roster would hijack a stray `"2"` from the sibling picker |
| Q16 | ordering on total miss | **O1 — on-hand block BEFORE the sibling list** | the direct fact about the asked product outranks a consolation list of products they didn't ask about |
| Q17 | no-op matrix | see §6 | |
| Q18 | substrate + packaging | reuse clone `txiPzSxy3Pclsz6v` (byte-diff gate first); **ONE promote bundle, both branches together** (user call) | |

---

## 2. Target messages (authoritative)

### 2.1 Total miss, incoming origin, asked product HAS stock (the screenshot case)

```
No incoming stock (ETA) found for SRTWT5800.
- SRTWT5800 — 80 pcs on hand: BUKIT RAJA / BRW-BB
- SRTWT5800 — 40 pcs on hand: KLANG / KLG-A
Related products:
1. SRTWT5800 — no incoming
2. SRTWT5800-FH — no incoming
3. SRTWT5800-HEAD — no incoming
Reply with a number to check its incoming, or reply 'yes' to escalate to purchasing team.
```
Quick replies unchanged (`Yes escalate`, `No it's okay`, + any sibling codes D3 already emits).

### 2.2 Total miss, both axes empty (the "who do I escalate to" case)

```
No incoming stock (ETA) found for SRTWT5800.
- SRTWT5800 — none on hand.
Related products:
1. SRTWT5800 — no incoming
…
Reply with a number to check its incoming, or reply 'yes' to escalate to purchasing team.
```
Team = **purchasing** (origin domain = incoming). Q2: no override.

### 2.3 Partial turn, inventory origin (A answered; B, C empty)

```
[normal stock answer for A — unchanged, numbered as today]

No stock records found for: B, C.                    ← live #3, UNTOUCHED
- B — incoming 90 pcs, ETA 12/09/2026
- C — no incoming.
Would you like me to escalate to warehouse team?
```

### 2.4 Partial turn, incoming origin (A answered; B, C empty)

```
[normal incoming answer for A — unchanged]

No stock records found for: B, C.                    ← live #3, UNTOUCHED (reads as "no incoming stock records")
- B — 80 pcs on hand: BUKIT RAJA / BRW-BB
- C — none on hand.
Would you like me to escalate to purchasing team?
```

**Wording contracts (do not "improve"):**
1. `Would you like me to escalate to {team} team?` — **regex contract**, see §5. Any rewrite silently breaks
   yes/no reconciliation.
2. Our block always says **"on hand"** / **"incoming"**, never the bare word "stock" — it sits directly under
   live #3's `No stock records found for:` line, where bare "stock" would read as a self-contradiction.
3. Bullets (`- `), never `1.` — Q12.

---

## 3. Architecture / wiring

```
Call 'sub-get-results' → validator
        → crossdomain-zeroset   (Code, NEW)      compute requested[] / missing[]  — no-op outside {inventory,incoming}
        → crossdomain-gate      (If,   NEW)      domain ∈ {inventory,incoming} && missing.length > 0
              TRUE → crossdomain-probe  (executeWorkflow, NEW)   other domain's tool, entities = missing[]
                   → crossdomain-render (Code,  NEW)             build block text (bullets, capped, "on hand")
              FALSE ──────────────────────────────────────────┐
        → If6 (UNCHANGED)                                     │
              TRUE  → central-exchange → compile-current-state │  [PARTIAL: consume block + append phrase]
              FALSE → … → build-suggest-offer                 │  [TOTAL MISS: D4 arm consumes block]
```

Both consumers read `crossdomain-render` defensively: **`isExecuted === false` and "executed but empty" collapse to
the same no-op path** ([[unwired-error-output-masks-failure]] — an unwired error output makes an execution report
success while silently dropping the turn).

### Node specs

**1. `crossdomain-zeroset` (Code, NEW) — THE SINGLE SOURCE OF TRUTH for "asked but empty"**
- Guards: `qf.domain_hint ∈ {inventory, incoming}`, `qf.message_type === 'business_query'`, else emit
  `{cross_active:false}` and stop. (Both consumers gate on the same two conditions, so a stop here can never
  starve a consumer that would otherwise have done work.)
- `requested[]` — the rule **moved** out of `compile-current-state` L248–297 (Q13/H1), unchanged in behaviour:
  TYPED-exact from `resolve-entity.resolutions[]` (prefix-family satisfaction, AND-mode fallback) **∪** DYM-PICKED
  from `get-session-vars` `dym_offer.picked` + `qf.dym_offer_pick_code` (strict-exact satisfaction).
  **NOT** sourced from `compatible_entities` — that set drops `match_tier` and includes resolver-expanded prefix
  siblings the customer never typed (the exact error #3's 2026-08-01 revision was written to undo).
- `returnedCodes` — distinct `Product Code` field values from the get-results envelope.
  ⚠️ **Envelope-source parity (the hoist's one real hazard).** Live #3 reads via `getResultObj()`, which prefers
  **`central-exchange`** and falls back to `validator`. This node runs *before* `central-exchange` exists, so it
  reads `validator` and **must replicate `central-exchange`'s unwrap first** (`if (input.output && typeof
  input.output === 'object') input = input.output`) before the `items`/`answers` lookup. Proven equivalent by the
  shadow gate in §8 step 2b — not assumed.
- Emits `{cross_active, origin_domain, other_tool, team, requested[], returnedCodes[], missing:[{code,uuid}]}`.
- **`missing` is emitted even when `returnedCodes` is empty** (total miss → `missing = requested`). Live #3 bails
  in that case; that bail stays in **#3's own guard**, not here — the two consumers keep their own guards, the
  node keeps only the computation.
- Products only. Container / customer / category tokens never enter `missing[]` (Q17 row 4).

**2. `crossdomain-gate` (If, NEW)** — `cross_active === true && missing.length > 0`.

**3. `crossdomain-probe` (executeWorkflow, NEW)** — mirror of live `probe-incoming`:
- `workflowId` = `rysSPgUssLDf6xJc` on clone → **`Fss5aAaXthJSWpZCgKiKR` at promote**.
- `tool` = `crm_inventory_stock_balance_list` when origin is `incoming`; `crm_incoming_stock_list` when origin is
  `inventory`.
- `entities` = `missing[]` (one batched read, never one call per product).
- `semantic_input` copied from `probe-incoming` **minus** `date_filter_start` / `date_filter_end` (Q11).
  `access_levels` **retained** — row-level scoping is preserved even though the per-agent check is skipped (RISK-1).
- `onError: continueRegularOutput`.

**4. `crossdomain-render` (Code, NEW)** — group probe items by `Product Code`; per product, cap 3 rows:
- stock rows → `- {code} — {qty} pcs on hand: {Warehouse} / {System Location}`
- incoming rows → `- {code} — incoming {qty} pcs, ETA {dd/mm/yyyy}` (soonest first)
- product with zero rows → `- {code} — none on hand.` / `- {code} — no incoming.` (**explicit, never silent** — Q17 row 7)
- `>3` rows → `- …and {n} more.`
- Emits `{cross_block:string, cross_any:boolean}`.

**5. `build-suggest-offer` (EDIT — D4 arm, total-miss branch)**
- Additive arm; every existing path stays byte-identical when `cross_block` is absent/empty.
- Inserts `cross_block` **immediately after the miss line and BEFORE D3's `Related products:` list** (Q16/O1).
- Does **not** touch `suggest_last_result_set` (Q15).

**6a. `compile-current-state` (EDIT — hoist consumption, live #3 block)**
- Delete the inline `requested[]` / `returnedCodes` / `missing[]` computation (L234–317) and read
  `crossdomain-zeroset`'s `missing[]` instead.
- **All of #3's guards stay exactly where they are**, including `returnedCodes.size === 0 → return` (now read from
  the shared node) and `missing.length === 0 → return`, the 10-item cap, and the printed line
  `No stock records found for: …` **byte-identical**.
- Defensive: `crossdomain-zeroset` not executed / empty → **behave as today's `return`** (print nothing). Argued
  unreachable (§7 RISK-2) but must not throw.
- This is a **pure refactor — zero observable change**. Proven by the shadow gate (§8 step 2b).

**6b. `compile-current-state` (EDIT — partial branch, the new behaviour)**
- New IIFE placed **after** live #3's block (so #3's summary line leads, our detail follows). Guards mirror #3's:
  domain gate, `business_query`, `!manualResponse && !isEscalateBranch`, non-empty `last_result_set`.
- `userResponse += "\n" + cross_block` then `+ "\n\nWould you like me to escalate to {team} team?"`.
- `response += " Would you like me to escalate to {team} team?"` ← **required**; without it the customer's "yes"
  reconciles to nothing (§5).
- `quickReply` = `Yes escalate,No it's okay` (comma-joined — commas inside a label split into extra buttons,
  see [[quick-reply-comma-strip-shipped]]).
- `last_result_set` / `selection_context` untouched.
- **Live #3's own block is not modified.**

---

## 4. What is NOT in scope

- Date-widened incoming re-probe ("nothing next week, but 90 arriving 12/09") — Q11, follow-up change.
- Cross-probing D3's **sibling** family (siblings keep incoming-only annotation) — Q5.
- Any change to escalation team routing — Q2.
- Any parser / reformulator edit.
- Any change to live #3 (`dym-zerostock-itemize`).

---

## 5. The reconciliation contract (why the wording is frozen)

Parser sub `XTODTw-dJcV0uRdC056hG`, node `output_exchange` (deterministic Code, **not** the LLM), L685–701:

```js
const prevResponse = String(parent_input?.previous_conversation_state?.response || '');
const offeredEscalation = /would you like me to escalate/i.test(prevResponse);
if (offeredEscalation && isAffirmative) → escalation = { is_escalation_confirmation: true }
else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp)
                                        → escalation = { is_escalation_confirmation: false, escalation_declined: true }
```

Consequences:
1. The regex reads state **`response`**, not the customer-facing text. On an answered turn `response` is the
   breadcrumb `Previous turn (incoming): returned 2 records` — which does **not** contain the phrase. Appending the
   offer only to the visible message would produce an offer the customer can accept and the parser silently ignores.
2. The phrase is the API. `Would you like me to escalate to {team} team?` — frozen.
3. Total-miss branch already satisfies this (its `response` is the escalate-catalog text). **Only the partial branch
   needs the append.**

---

## 6. No-op matrix (everything here must be byte-identical to live)

| # | condition | behaviour |
|---|---|---|
| 1 | `domain_hint ∉ {inventory, incoming}` | no-op |
| 2 | `message_type ≠ business_query` | no-op |
| 3 | zero-set empty (all asked products returned rows) | no-op |
| 4 | requested set has **no products** (container-only ETA, customer-scoped query) | no-op |
| 5 | disambiguation turn (`require_specific === true`) | no-op |
| 6 | no-access / clarify / not-supported / escalation / declined branches | no-op |
| 7 | probe ran, product empty on the other axis too | renders `— none on hand.` / `— no incoming.` **explicitly** |
| 8 | total miss with **zero** siblings (D3 no-op) | our block still renders |
| 9 | probe errored / did not execute / returned empty | **fail-silent**, today's message byte-for-byte |

---

## 7. Risks + explicit assumptions

- **RISK-1 (user-accepted, Q10): no per-agent access re-check.** `deriveRouting` gives `incoming` the agent
  `incoming_stock_enquiries` and `inventory` the agent `general_enquiries`; the spine's `check-access` runs once
  per turn against the **origin** domain's agent only. A contact holding stock access but not incoming access can
  therefore see ETA data through the cross-probe. **Stated assumption: stock and incoming are one entitlement.**
  Mitigation in place: row-level `access_levels` scoping still flows through the probe, so company/brand data
  scoping is preserved — only the per-agent permission check is skipped. Revisit if entitlements are ever split.
- **RISK-2 (Q13/H1): the hoist touches a block promoted 2026-08-01.** Single source of truth is the goal; the cost
  is that a shipped, tested feature now depends on a new upstream node.
  - *Reachability argument (why #3 can never be starved):* #3 only does work when `last_result_set` is non-empty
    and `!manualResponse && !isEscalateBranch` — i.e. an answered turn, which by construction ran
    `get-results → validator`, and `crossdomain-zeroset` sits directly on that edge. Every path that reaches
    `compile-current-state` without it (If3-TRUE not-found, access-choice, clarify, not-supported, escalation,
    declined) already returns early from #3 today.
  - *Envelope-source hazard:* §3 node 1 — `getResultObj()` prefers `central-exchange`, the shared node can only see
    `validator`. Handled by replicating the unwrap, **verified by shadow-equality, never assumed**.
  - *Scope limit:* only the SET computation is hoisted. The probe is separate, so a probe failure cannot affect #3.
  - *Rollback:* the deleted inline computation is preserved verbatim in `tests/diffs/` so #3 can be restored to a
    self-contained block without reverting the whole bundle.
- **RISK-3: escalation-offer surface widens.** The armed phrase can now appear on turns that **did** return data.
  A later bare "yes" then becomes a real escalation → staff assignment ripple. Bounded by the zero-set guard
  (offer only when ≥1 asked product came back empty).
- **RISK-4: message density.** Total miss now carries miss line + on-hand block + sibling picker + offer + 5
  buttons. Bounded by the 3-row-per-product cap (Q11b) and D0 (siblings never cross-probed).
- **RISK-5: clone drift.** Clone `txiPzSxy3Pclsz6v` (135 nodes) predates the 2026-08-01 live promote. **Byte-diff
  gate before any edit** — see §8 step 1 ([[stale-byte-identical-fork-claim]]).

---

## 8. Build + test plan

### 8.0 TDD protocol (MANDATORY — tests are written and RED before any node is edited)

This change is `deterministic` tier, so every new node's inputs are pinnable → a real red/green loop is possible
offline at 0 token cost. The order is not negotiable:

1. **Capture real envelopes first — never hand-author a fixture.** Pull actual `validator` / `resolve-entity` /
   `get-session-vars` / reformulator outputs from REAL executions (live read-only via `get_execution(includeData)`,
   or clone runs) for each scenario. [[stale-case-fixtures-false-green]]: `tests/cases/*.json` already burned this
   project once — an outdated envelope makes runs look plausible while the node resolves `undefined`. Every fixture
   records the execution id it came from.
2. **Write the expected output BEFORE the implementation.** For each case: the exact `missing[]`, the exact block
   string, the exact final `userResponse` and state `response`. Committed to
   `tests/cases/crossdomain-*.json` + expectations in `tests/UAC.md` §X.
3. **RED — and prove the red is the right red.** Run every case against the UNMODIFIED clone. Each must fail, and
   the failure reason is asserted (missing node / absent block), not just "non-zero exit". A case that passes
   before implementation is a broken case, not a free win.
4. **GREEN one node at a time**, smallest step that turns exactly one case green:
   `crossdomain-zeroset` → `crossdomain-gate` → `crossdomain-probe` → `crossdomain-render` →
   `build-suggest-offer` D4 → `compile-current-state` 6b → hoist consumption 6a.
   No node is written before a red case demands it.
5. **Regression cases are RED-tested too.** The no-op matrix (§6) and X9/X10/X11 are written as cases that are GREEN
   before the change and must STAY green — and each gets a fail-on-purpose mutation proving the assertion has teeth
   ([[green-that-cannot-fail]]: four instances in one day of checks that passed *because* the guarded-against thing
   happened).
6. **Assert per-node `runData`, never execution status** ([[unwired-error-output-masks-failure]] — a `continue`
   error output wired to nothing reports success while dropping the turn).
7. **The shadow gate (§8 2b) is the hoist's red/green**: shadow diff must be provably capable of firing before the
   inline copy is deleted.

Refactor step (hoist) lands **last**, after the new behaviour is green — so a shadow-diff failure can never be
confused with a bug in the new feature.

### 8.1 Steps

1. **Byte-diff gate (before any edit).** Diff clone vs live for `build-suggest-offer` and `compile-current-state`.
   Any drift → sync the clone node to LIVE first, and record that as a drift-correction, **not** part of the
   promotable business diff. Build target = **LIVE + our own hunks**, never the fork wholesale.
2. **Offline units (0-token)** via `prepare_test_pin_data` → `test_workflow`. All inputs to the 4 new nodes are
   pinnable (`validator`, `resolve-entity`, `get-session-vars`, reformulator output).
   Cases: single product / multi-product partial / total miss / both-empty / container-only / disambiguation /
   non-{inventory,incoming} domain / >3 rows cap / probe-empty / probe-error.

   **2b. SHADOW-EQUALITY GATE (blocks the hoist — do this before deleting anything).**
   Stage 1: add `crossdomain-zeroset` and rewire, but **keep #3's inline computation intact**; have #3 compute both
   and emit `_shadow_diff` when the two `missing[]` (and `returnedCodes`) disagree.
   Stage 2: assert `_shadow_diff` is empty across **every** UAC case in step 3 **and** a replay-corpus sample of
   real historical inventory/incoming turns from `n8n_test` (`v_turns`), covering: OR-mode, AND-mode fallback,
   dym-picked turns, prefix-family turns, `central-exchange`-unwrapped envelopes.
   Stage 3: only then delete the inline copy; re-run the full suite and assert #3's printed line is **byte-identical**
   before and after.
   **Fail-on-purpose:** perturb the shared node's `returnedCodes` (drop one code) and assert `_shadow_diff` fires.
   A shadow gate that cannot report a difference proves nothing ([[green-that-cannot-fail]]).
3. **Clone end-to-end** via the `zz-chat` lane. Minimum UAC cases:
   - **X1** incoming miss, product HAS stock → §2.1 exactly; sibling picker intact below the block.
   - **X2** incoming miss, both empty → §2.2; team = purchasing.
   - **X3** inventory miss, product HAS incoming → mirror; team = warehouse.
   - **X4** partial inventory (A answered, B/C empty) → §2.3; live #3 line **unchanged and still present**.
   - **X5** partial incoming → §2.4.
   - **X6** `"yes"` after X4 → `is_escalation_confirmation: true`, correct team.
   - **X7** `"no it's okay"` after X4 → `Escalation declined.`
   - **X8** number-pick after X1 → still resolves to the **sibling**, not a cross-domain row (Q12/Q15 proof).
   - **X9** container-only ETA → byte-identical to live.
   - **X10** fully-answered stock turn → byte-identical to live (no phrase, no buttons, state `response` unchanged).
   - **X11** hoist regression: a turn that today prints `No stock records found for: …` prints the **same string**
     after the hoist (multi-product partial, dym-picked, and prefix-family variants).
4. **Fail-on-purpose tests** (mandatory — [[green-that-cannot-fail]]):
   - Force `crossdomain-probe` to error → assert the message is byte-identical to today's (F1).
   - Mutate the escalate phrase by one word → assert X6 **breaks**. If it still passes, the test is worthless.
   - Assert per-node `runData`, never execution status ([[unwired-error-output-masks-failure]]).
5. **§0 zero-egress gate** on every run (UAC.md §0 S1–S7). Note [[s7-llen-gate-unsound]] — use sink-delta +
   payload attribution, not a bare `LLEN` on the shared prod list.
6. **Reviewer sign-off** before promote: node-diff vs live, no-op matrix verified arm by arm, egress layer untouched.

---

## 9. Promote checklist (user-gated, ONE bundle)

- [ ] Backup live spine `activeVersionId` (`a40cd16d-…`) before touching anything.
- [ ] Remap `crossdomain-probe.workflowId`: `rysSPgUssLDf6xJc` → **`Fss5aAaXthJSWpZCgKiKR`**.
- [ ] Target nodes by **NAME**, not clone IDs ([[n8n-live-promote-via-mcp]]).
- [ ] Strip trailing whitespace (the channel trims it → byte-gate fails).
- [ ] Confirm the promoted `build-suggest-offer` = LIVE 416-line version + our D4 hunk only (D1/D2/D3 sha-diffed
      unchanged).
- [ ] Confirm #3's **observable output** (the `No stock records found for: …` line) is byte-identical to today —
      its computation is hoisted, its behaviour is not allowed to change. Shadow gate (§8 2b) green, inline copy
      archived in `tests/diffs/` for rollback.
- [ ] `publish_workflow` after `update_workflow` — MCP edits land on the DRAFT ([[publish-after-update-workflow]]).
- [ ] Post-promote smoke on the real screenshot case (`Pls check eta SRTWT5800`).

---

## 10. Follow-ups (logged, not built)

0. **Deliver the probe's packing list on cross-domain incoming turns** — ✅ **PLANNED 2026-08-04,
   user-approved: `plans/crossdomain-attachment-plan.md`, UAC `tests/UAC.md` §XA.** Ships **separately and
   after** this change (it is the only pending change that opens a new real-egress path on live).
   ⚠️ It also corrects a premise that matters here: on a TOTAL-MISS turn `If6` takes output **1**, so
   `central-exchange` — and with it the whole attachment chain — **never executes**. Proven by clone exec
   `11083744`. Two open decisions block its build: `D-ATTACH-MENTION` (should the block say a file is
   attached?) and **RISK-A1** (Q10/RISK-1's "no per-agent access re-check" would extend from text rows to
   a downloadable document — needs explicit re-consent).
1. **Date-widened incoming re-probe** — "nothing next week, but 90 arriving 12/09" (Q11).
2. Revisit RISK-1 if stock/incoming entitlements are ever split per contact.
3. Sibling-family cross-probe (Q5/D1) if customers start asking for sibling stock after seeing the picker.

---

## 11. BUILD STATUS (2026-08-03) — built + tested on clone, NOT promoted

Clone `txiPzSxy3Pclsz6v` active `64713df6-066e-4bbb-a982-53ae480a3cdd`.
Backups: `backups/clone-txiPzSxy3Pclsz6v-0a647e8b-20260803.json`, `backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json`.

### Byte-diff gate (§8.1 step 1) — RESULT
| node | live | clone | verdict |
|---|---|---|---|
| `compile-current-state` | 527L | 527L | **MATCH** |
| `disallowed-entity-gate` / `validator` | — | — | MATCH |
| `build-suggest-offer` | 415L | 414L | drift = **cosmetic only** (comment dashes + trailing blank) |
| `not-found-error-message` | 247L | 211L | clone STALE by 36L — **all 3 missing hunks are gated to `product_attachment` / order-type paths**, so behaviour on `inventory`/`incoming` product turns is identical. Sync DEFERRED, recorded here. Promote splices against LIVE text regardless. |

### Architecture CHANGED during build (better than planned)
The plan's §3 nodes 5/6b (edits to `build-suggest-offer` + `compile-current-state`) were **replaced by a single
new node `crossdomain-compose`** placed BETWEEN `compile-current-state` and its three consumers
(`sorento-sub-respond-sendmsg-respond2`, `guard-d-record`, `session-save-gate`).
Reason: `build-suggest-offer` has **6 `return out` exit points** with 6 message templates → 6 hunks in a
416-line node. The composer achieves the same result with **zero edits to either big node**, shrinking the
promotable diff to new nodes + wiring.

**Placement is marker-anchored, not sentence-parsed:** `['Related products:', 'Try:', 'Did you mean',
'Would you like me to escalate']`, earliest wins. The 4th marker is the frozen phrase itself — the catch-all
that anchors templates carrying none of the others (found/not-found breakdown). **Caught by test X2**, which
originally rendered the block BELOW the escalate question.

**⚠️ PROMOTE-CRITICAL DISCOVERY:** `sorento-sub-respond-sendmsg-respond2` reads
`$('compile-current-state').first().json.{user_response,quick_reply,variables.last_result_set}` **BY NAME**,
not from its input — so rewiring alone was inert. Those 3 expressions were repointed to `crossdomain-compose`.
**The live spine's equivalent send node must be repointed identically at promote or the feature is silently
invisible while every test looks green.** It is the ONLY by-name consumer of those fields (verified).

### Nodes built (5 new, 3 expression repoints, 0 edits to the 416/528-line nodes)
`crossdomain-zeroset` (Code) → `crossdomain-gate` (If) → `crossdomain-probe` (executeWorkflow,
`onError: continueRegularOutput`) → `crossdomain-render` (Code); `crossdomain-compose` (Code) after
`compile-current-state`. Main path: `validator → zeroset → gate → {TRUE: probe → render, FALSE: —} → If6`,
both arms reconverging on `If6` with the validator payload passed through plus a namespaced `_xd` key.

### Test results (all runs §0-clean: guards only, `would_log`/`would_write`/`would_send`, no real send)
| case | verdict | evidence |
|---|---|---|
| RED baselines | captured from REAL clone runs xd-red-1..4, screenshot case reproduced exactly | fixtures in `tests/cases/crossdomain-stock-incoming.json` |
| data layer | **GREEN** — block built, 6 probed rows → 2 zero-qty dropped, sorted desc, capped 3 + tail | exec 11005226 |
| **X1** incoming miss → on-hand above sibling picker | **GREEN** | 317/236/7 + "…and 1 more" |
| **X2** both axes empty | **GREEN after marker fix** | "— none on hand." above the escalate question |
| **X3** inventory miss → incoming (D2 path, mirror) | **GREEN** | "incoming 200 pcs, ETA 22/07/2026" |
| **X4** PARTIAL incoming turn | **GREEN** | live #3 line intact + block + phrase in BOTH strings + quick replies; `last_result_set`/`selection_context` unchanged |
| **X6** "yes" reconciles | **GREEN** | `is_escalation_confirmation: true`, `human-intervention-sub` guard fires |
| **FP2** phrase reworded → reconciliation dies | **GREEN (fails on purpose)** | `is_escalation_confirmation: false`, no HI guard — proves the frozen wording IS the contract |
| **X9** container-only ETA | **GREEN no-op** | byte-identical, no phrase |
| **X10** fully-answered stock turn | **GREEN no-op** | byte-identical to xd-red-2, no phrase |

### Design refinement forced by real data (not in the original decision table)
Real stock for SRTWT5800 = **6 location rows, 2 of them zero-qty**. Rendering rule tightened: **drop zero-qty
rows, sort by qty DESC (stock) / soonest ETA (incoming), then cap 3 + "…and N more."** A 0-qty location is not
stock and must not burn a capped slot. Recorded in the fixture's `render_rules`.

### REMAINING before promote
- [ ] **The HOIST (§3 node 1 / Q13-H1) is NOT DONE.** `crossdomain-zeroset` currently carries its own copy of
      the requested/missing rule and live #3 still computes its own. Single-source-of-truth still owed:
      run the shadow-equality gate (§8 2b), then delete #3's inline copy. **This is the last build step.**
- [ ] FP1 (force probe error → assert byte-identical), FP3, FP4
- [ ] X5 (partial inventory), X7 (decline), X8 (number-pick still resolves to the sibling), X11
- [ ] Reviewer pass
- [ ] Promote checklist §9 + the send-node repoint above

---

## 12. HOIST DONE + two findings from FP1 (2026-08-03, later session)

### Hoist (Q13/H1) — COMPLETE and verified
- Shadow gate ran FIRST, as designed: **5 comparable turns, all `agree:true`** (single-missing, 2-missing,
  inventory-origin, incoming-origin, 3-product query).
- **FP3 proved the gate had teeth** before it was trusted: a harness flag (`fp3_perturb`) drops one code from
  the hoisted set → gate reports `agree:false`. Control run same turn → `agree:true`.
- Then `compile-current-state` #3's inline computation (104 lines) was replaced by ~20 lines consuming
  `crossdomain-zeroset._xd`. Node 528 → **459 lines**. Deleted code archived verbatim at
  `tests/diffs/zerostock-inline-computation-preserved.js` for rollback.
- Post-hoist regression: #3's line byte-identical on every case
  (`No stock records found for: SRTWT5800.` / `…: SRTWT5800, SRTWT5800-FH.` / `…: SRTWC286-SH-NEW-200.`),
  X1/X5/X10 all correct.
- **Shadow gate then DELETED** — post-hoist both sides derive from the same node, so it was tautological:
  a green that cannot fail ([[green-that-cannot-fail]]).
- Deployment via **REST PUT** (MCP paste avoided). Landmines confirmed: REST GET does NOT redact credentials;
  PUT auto-publishes; **PUT's `settings` schema is narrower than storage** — `binaryMode`/`availableInMCP` are
  rejected, `{executionOrder, callerPolicy}` is accepted and the server preserves the rest. S-CRED re-verified
  after every PUT: `postgres:n8n_test-db` ×3, no prod binding.

### ⚠️ FINDING 1 — post-PUT race (operational, affects ALL testing here)
A canary run fired immediately after a PUT can execute a **transitional version in which the new nodes do not
participate**, silently producing the pre-change message. Observed once: a rejected (HTTP 400) PUT was followed
by a run that returned the exact RED baseline; 4 consecutive re-runs then returned the new message
deterministically. **Consequence: any assertion made in the seconds after a PUT is untrustworthy — this
produced a FALSE PASS on FP1.** Tester rule: after any PUT/publish, discard the first run or wait for
activation to settle before asserting.

### 🚩 FINDING 2 — "none on hand" can assert absence we have not established (UNRESOLVED, needs a decision)
`crossdomain-render` prints `- {code} — none on hand.` when the probe returns zero rows. But
`sub-get-results` returns a **valid, empty envelope** (`has_result:false`, `answers:[]`) for BOTH
"genuinely nothing" AND "the read did not work". Proven: pointing the probe at a nonexistent tool name
(`crm_this_tool_does_not_exist`) produced

```
No incoming stock (ETA) found for SRTWT5800.
- SRTWT5800 — none on hand.          ← for a product holding 564 pcs
```

The envelope-shape guard added to `crossdomain-render` (`hasEnvelope || env.error` → degrade silently) only
catches a HARD node failure. A **soft** failure is indistinguishable from a true zero.

Options:
- **(a) Accept** — same exposure the primary read already has; a soft-failing CRM read misreports today too.
- **(d) Never print the negative** — only ever state positive facts (`X pcs on hand` / `incoming N, ETA …`).
  The both-empty turn then renders exactly today's message + escalate offer. Loses Q17 row 7's explicitness
  but the bot can never assert an absence it did not verify. **RECOMMENDED.**

FP1 remains **NOT PROVEN** pending this decision; re-test after it lands, with the post-PUT settle rule.

### DECISION (d) IMPLEMENTED — positive facts only (2026-08-03, user call)
`crossdomain-render` no longer emits `— none on hand.` / `— no incoming.`. A zero-row probe contributes NO
line; if no product yields a positive fact the block is empty → `any:false` → `crossdomain-compose` passes the
turn through **byte-identical to today**. Verified: only 4 `lines.push` statements remain, all positive.
**This supersedes Q17 row 7** (which required the explicit none-line).

Post-(d) suite (warm-up run discarded per the settle rule):
| case | result |
|---|---|
| X1 incoming miss + stock | block present (317/236/7 + …and 1 more) |
| X2 both empty | **no block** — today's message + escalate offer |
| X3 inventory miss + incoming | `- SRTWC286-SH-NEW-200 — incoming 200 pcs, ETA 22/07/2026` |
| X4 partial incoming | #3 line byte-identical + block + phrase in state |
| X10 fully answered | no block, no phrase |
| **FP1 soft-failed read** | **byte-identical to the RED baseline** ✅ (was the false-pass; now proven) |

### Q11b SUPERSEDED — cap REMOVED (2026-08-03, user call)
`- …and N more.` is gone; **every** location / shipment renders. Rationale: a person can only draw from their
own location, so a truncated list can hide the only stock reachable for them — the same "show ALL, uncapped"
requirement as the sibling picker. Zero-qty rows are still dropped (a 0-qty location is not stock).
Verified: `Pls check eta SRTWT5800` renders all 4 non-zero locations (BRW / BRW-NTC / BRW-AM / BRW-IR).

### FORMAT PARITY (2026-08-03, user call) — supersedes the compact one-liner in §2
The block now re-renders each probe item's OWN `fields` (the same shape `output-structurer` consumes), so a
cross-domain row looks exactly like a row in a real stock / incoming answer — labels, flags and all
(`🚩 *(PENDING ALLOCATION)*` now carries through automatically). Changes:
- **Zero-qty rows are NO LONGER dropped.** The user noticed the cross-domain block showed 4 locations while
  `check stock` showed 6. Parity wins: every location the real answer shows, this shows.
  (Decision (d) is unaffected: it governs an EMPTY probe — zero ROWS — not rows whose quantity is 0.)
- **Bullets still, never numbers** (Q12) — the one deliberate divergence from canonical, because numbers are
  D3's contract with `last_result_set`.
- **Deterministic order added.** The CRM does NOT return a stable row order between calls (observed: the same
  product returned in two different location orders). Sorted: stock → quantity DESC, incoming → soonest ETA.
  Verified stable across consecutive runs.
- Blank line inserted between the block and the continuation marker (`Related products:` / `Try:`).

⚠️ **Length**: a 6-location product now adds ~30 lines to a miss message. Accepted for parity; revisit if
WhatsApp readability suffers.

### LEAD-IN LINE (2026-08-03, user call) — ⚠️ **on-hand wording SUPERSEDED, see §LEAD-IN REWORDED below**
The rows previously arrived with no explanation of what they were. The block now opens with an explicit pivot:
- origin `incoming` → ~~`But there is stock ON HAND for the requested products:`~~ **superseded 2026-08-04**
- origin `inventory` → `But there is INCOMING stock (ETA) for the requested products:` (**still current**)

Wording deliberately avoids the bare phrase "stock details found": on an incoming turn live #3 prints
`No stock records found for: X.` immediately above (where "stock records" means INCOMING records), and the two
sentences one line apart read as a contradiction. **OPEN:** narrowing #3's gate to `inventory` only (Q13b
option (ii), one line) would remove the collision at the source — user previously chose to leave #3 untouched.
*(This objection was retired the same day — see the `#3 WORDING NOW DOMAIN-AWARE` section above, and
§LEAD-IN REWORDED below.)*

### LEAD-IN REWORDED (2026-08-04, user call) — supersedes the on-hand lead-in above

The on-hand direction's lead-in is now, **exactly**:

```
But here are the stock details for the requested products:
```

The incoming direction is **unchanged**: `But there is INCOMING stock (ETA) for the requested products:`.

**Reason (user).** The block deliberately renders **zero-quantity rows** (FORMAT PARITY, 2026-08-03 — every
location `check stock` shows, this shows). So `But there is stock ON HAND` was asserting availability
immediately above rows reading `*Quantity On Hand:* 0` — a self-contradiction. Real case the user hit: a
product whose only row was `DC1: 2`; turns where **every** row is 0 also exist. The new lead-in states what
the rows *are* and asserts nothing about availability, letting the rows speak. It is the same class of fix as
decision (d): never let the bot assert something it has not established.

**Why the 2026-08-03 objection to "stock details" is dead (verified in the deployed node, not assumed).**
That objection was: live #3's miss line said `No stock records found for: X.` on BOTH domains, so on an
incoming turn "stock details" would sit one line under "no stock records" and read as a contradiction. The
miss line was made **domain-aware** later the same day. Verified in the deployed `compile-current-state`
(clone `a0f434f9`, L256–257):

```js
const _noun = (dh === 'incoming') ? 'incoming' : 'stock';
userResponse += `\n\nNo ${_noun} records found for: ${shown.join(', ')}.`;
```

`dh` is `qf.domain_hint` in **both** `compile-current-state` and `crossdomain-zeroset` (which sets
`origin_domain: dh`), so `origin_domain === 'incoming'` ⟺ `_noun === 'incoming'` — the two lines cannot
disagree. On an incoming turn the customer now reads `No incoming records found for: X.` above
`But here are the stock details…`. On the TOTAL-MISS branch the line above comes from
`not-found-error-message` (`No incoming stock (ETA) found for X.`) — also domain-correct. **No collision on
either branch.**

**Checks run before the change (all clear):**
- The old string is not a contract. Instance-wide REST census of **101 workflows** (includes archived —
  LESSONS §59a): the only occurrence of `stock ON HAND` / `ON HAND for the requested` anywhere was the
  `crossdomain-render` literal itself. Live spine `9qVyfUxmRQqrpGRMDLRuz` @ `a40cd16d`: **zero** hits in
  nodes or `activeVersion`. No `jsCode`, expression or condition matches on it. (The only frozen-regex
  contract in this feature remains `Would you like me to escalate…`, read by the parser's `output_exchange`
  — untouched.)
- **Marker placement unaffected.** `crossdomain-compose` searches its MARKERS (`Related products:`, `Try:`,
  `Did you mean`, `Here are the closest matches:`, `Would you like me to escalate`) in `out.user_response`,
  the message built **upstream**. The lead-in lives inside `xb.block`, which is *inserted* and never part of
  the haystack. The new string also contains none of the five markers.
- Nothing else about the block changed: bullets never numbers (Q12), uncapped, zero-QTY rows still rendered
  (format parity), an empty probe still contributes no line (decision (d)), `last_result_set` /
  `selection_context` untouched (Q15).

**Deployed:** clone `txiPzSxy3Pclsz6v` `1bfc2124` → **`a0f434f9-a516-45a8-95d9-5673dd9ddb4a`** (draft ==
active). Single node touched: `crossdomain-render` (the literal + the stale comment above it that argued for
the old wording). Backup: `n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-1bfc2124-20260804-before.json`.
Node-diff: `n8n-workflows-init/tests/diffs/crossdomain-leadin-reword.md`.

**Re-test needed** (expected-string change only, no logic change): **X1** and **T1** in
`tests/crossdomain-manual-test-script.md` / `tests/pre-promote-manual-tests.md` — the only cases whose
expected text contains the on-hand lead-in. X2/X3/X4/X9/X10 are unaffected (X3 is the inventory-origin
direction, whose lead-in did not change).

### ⚠️ #3 WORDING NOW DOMAIN-AWARE (2026-08-03, user-reported bug) — supersedes Q13b
Live #3's line was hardcoded `No stock records found for: X.` on BOTH domains. On an ETA turn it means
"no INCOMING records" while literally saying "stock", and it now sits one line above a block reporting real
on-hand stock — the customer read it as a contradiction ("i check eta … why it says no stock records found").

Fixed at source in `compile-current-state`:
```js
const _noun = (dh === 'incoming') ? 'incoming' : 'stock';
userResponse += `\n\nNo ${_noun} records found for: ${shown.join(', ')}.`;
```
- incoming turn → `No incoming records found for: SRTWT5800.`
- inventory turn → `No stock records found for: …` (**unchanged**, still the locked string)

**This RETIRES the "#3 output is byte-identical" invariant** asserted earlier in §11/§12. #3 is now byte-identical
on INVENTORY turns only; the incoming-turn wording is a deliberate, user-approved behaviour change that is part
of the promotable diff. Update X11's assertion accordingly, and note it in the reviewer hand-off — a reviewer
checking "#3 unchanged" against live will otherwise flag it as a regression.
