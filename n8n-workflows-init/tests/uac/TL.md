# UAC §TL

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §TL-S. Structural gates (static JSON, NOT executions) — run FIRST; §TL is VOID without them

### §TL-S1 ★ — the loop is gone and the join exists  — BLOCKING
- **Method:** re-fetch `get_workflow_details txiPzSxy3Pclsz6v` and assert all five:
  1. no node named `Split Out1`; 2. no node named `Loop Over Items`;
  3. **`Loop Over Items1` STILL EXISTS** (it is the unrelated media-egress loop — plan §3.1);
  4. `If6.main[1]` has **exactly one** target and it is `Aggregate1`;
  5. inbound edge sets are exactly `Aggregate1 ← {If6[1]}` and
     `not-found-error-message ← {Aggregate1[0], If-incoming-picker[1]}`.
- **Report the compared edge COUNT**, so empty checker output can never read as PASS (LESSONS §61b).
- Assertion 4 is the gate that catches the dead-end catastrophe. If it fails, stop — do not run §TL-1+.

### §TL-S2 ★ — the 1-tool invariant is enforced in CODE  — BLOCKING
- `tool-filter.jsCode` contains a single-element `return [{ json: … }]` and **no** `return { tools: … }`.
- The sort is **explicit** (`similarity` DESC, tiebreak `name` ASC) — not `tools[0]`. Plan §3.6/D9: the
  RAG sub SUMS similarity across `source_id`s, so `tools[0]` is not provably the maximum.
- `Execute 'sub-get-rag'`'s `limit` is still **5** (D6 rejected `limit:1` as a competing enforcement point).
- `Aggregate1.fieldsToAggregate` is **unchanged** (D5).
- `Call 'sub-get-results'`'s `tool` is still `={{ $json.name }}`.
- **No `is_test` leaf was added or copied anywhere** (LESSONS §48a).

### §TL-S3 — egress containment re-confirmed on the current clone (§0 S1/S3/S8, from JSON not memory)
5 orphaned (`send-message-files/-images/-video`, `update-human-intervened`, `save-session-vars`) + 1 sinked
(`Call 'sub-respond-save-message-redis'2 → tWm5DYLxfypmVC1T`, RPUSH `sorento-respond-message-TEST`); all 8
sendmsg callers → `ublq9nSlrpz63xan`; HI → `vUfFUDjLAuMaeQE6`. This change adds **zero** nodes and zero
credentialed nodes, so the assertion is that the sets are **unchanged**, which is falsifiable.

### §TL-S4 📌 — RECORD, do not fix: live calls the get-results TEST fork
Plan §6 / **P0**. Live `Call 'sub-get-results'` **and** `probe-incoming` point at `rysSPgUssLDf6xJc`
(`sub-get-results TEST`), not `Fss5aAaXthJSWpZCgKiKR`; `sibling-probe` alone uses live. Present in
live's published `activeVersion a40cd16d`, and in the 2026-07-23 backup. **This is out of scope.** The
reviewer will see it in the promote diff and must not silently "correct" it. Record with the three
corroborating sources; do not bundle.

---

## §TL-1 … §TL-7. HAPPY path, one case PER DOMAIN  (contact `437264483`, `scope: deterministic`)

Each: single-turn, `mock_reformulator_output` pinning `domain_hint`, real CRM read.
**Common assertions (all seven):**
- `runData['tool-filter'][0].data.main[0].length === 1`; the emitted item is **flat** (`.name` at top
  level, NOT `{tools:[…]}`).
- the resolved `tool` string passed to `Call 'sub-get-results'` is the domain's expected read tool, is in
  the READ allowlist, and is **never** `crm_it_support_ticket_create` (§0 **S4**, plan §6b/§10 TL-c).
- `_tool_pick` is recorded in the run log: `{chosen, rejected[], count}` — this is the per-turn artifact
  that makes plan §6(b)'s "data-dependent, not structural" risk observable.
- `If6` took **out0**; `central-exchange` ran; `Aggregate1` did **NOT** run; `compile-current-state`
  produced a non-empty `user_response`; `variables.last_result_set` is a non-empty `{idx,label,…}` array.
- §0 all, S6 = zero LLM nodes executed.

| id | domain | trigger (message) | expected tool |
|---|---|---|---|
| §TL-1 ★ | `inventory` | `check stock SRTWT5800` | `crm_inventory_stock_balance_list` |
| §TL-2 ★ | `incoming` | `pls check eta SRTWC286-SH-NEW-200` | `crm_incoming_stock_list` |
| §TL-3 | `product_attachment` | a packing-list / drawing request for a known product | the domain's attachment read tool |
| §TL-4 | `order` | an order-status query by SPO/order code | the order read tool |
| §TL-5 | `promotion` | a promotion enquiry (`srt79ss`-style code or promo name) | the promotion read tool |
| §TL-6 | `master_products` | a product-info / catalogue enquiry | the master-products read tool |
| §TL-7 | `portal_link` | a portal-link request | the portal-link read tool |

★ **§TL-1 is the flagship**: `inventory` is the ONLY domain that ever offered 2 tools (135/135 turns
pre-deletion). It must now resolve `crm_inventory_stock_balance_list` and **never**
`crm_inventory_warehouses_list` — assert the rejected candidate explicitly if the embedding is ever
re-added. Do not record the tool names for §TL-3…§TL-7 from memory; read them from the pre-change
baseline runs (P-BASE) — a guessed allowlist is not an allowlist.

---

## §TL-M1 … §TL-M7. ⭐ MISS turn PER DOMAIN — THE HIGHEST-RISK SET  (`437264483`, `deterministic`)

This is the path that used to exit via the loop's done branch. **Nothing else in this suite matters if
these fail.**

**Common assertions (all seven) — per-node runData ONLY, never status:**
1. `If6` took **out1**.
2. **`runData['Aggregate1'].length >= 1`** and its output `json` is `{response_intro:[<1 string>]}` —
   array length **1** (plan §3.3; nothing consumes the field, so length is asserted as an equivalence
   witness, not a contract).
3. **`runData['not-found-error-message'].length >= 1`**, and its output carries a **non-empty**
   `escalate_message`, plus `is_clarification` and `found_summary` keys.
4. The would-send `user_response` contains the domain's miss template **and** an escalate question.
5. `runData['Loop Over Items']` and `runData['Split Out1']` are **ABSENT** (the nodes no longer exist).
6. `central-exchange` did **NOT** run.
7. §0 all — S2 in particular: the escalate *offer* must not trigger an assignment (no `yes` sent).

| id | domain | trigger | notes |
|---|---|---|---|
| §TL-M1 ★★ | `inventory` | a stock query for a resolvable code with zero rows | **THE case.** Was the 2-tool 2-iteration path (live exec `11049139`). Now single-run. |
| §TL-M2 ★ | `incoming` | `check eta SRTWT5800` (no incoming) | Baseline for §TL-AGG; mirrors live exec `11060071`. |
| §TL-M3 | `product_attachment` | attachment request for a product with no attachment | the "missing attachment" arm |
| §TL-M4 | `order` | an order code with no matching order | |
| §TL-M5 | `promotion` | a promotion code with no match | |
| §TL-M6 | `master_products` | a product code with no catalogue entry | |
| §TL-M7 | `portal_link` | a portal-link request that yields nothing | if structurally reachable; if not, record **UNREACHABLE**, never infer a pass (LESSONS §56) |

### §TL-AGG ★ — `Aggregate1` output equality, MEASURED  — HARD GATE
- **Method:** compare post-change `Aggregate1` output `json` on §TL-M2 against the P-BASE pre-change
  capture and against live exec `11060071`'s `{response_intro:["No matching results found."]}`.
- **PASS:** the `json` objects are equal. **`pairedItem` divergence is EXPECTED and recorded** — the loop
  stamped `{sourceOverwrite:{previousNode:'If6',…}, item:0}`, direct wiring gives `{item:0}`; nothing
  downstream reads `pairedItem` (plan §3.2).
- ❌ FAIL on any `json` difference. This is the case that turns "byte-identical" from a claim into evidence.

### §TL-M-BYTE ★ — the miss MESSAGE is byte-identical to pre-change  — HARD REGRESSION GATE
Diff the full `user_response` of §TL-M1 and §TL-M2 against P-BASE. Only difference permitted: **none**.
The `dym-zerostock-itemize` / crossdomain noun work already fixed the wording; this change must not move
a single byte of it.

---

## §TL-D2 ★ — did-you-mean (D2 alternatives) still renders  — the case the change request MISSED
- **Trigger:** typo a product code so the CRM returns `alternatives[]` (e.g. a near-miss on a real code) ·
  `437264483` · real reformulator (**`scope: parser` run of a `deterministic` change** — precedent §ZS-6).
- **Why it is here:** `build-suggest-offer` lines ~294–309 **explicitly iterate the loop's runs** —
  `for (let ri = 0; ri < 25; ri++) { items = node.all(0, ri); … }` — to scan every tool's
  `alternatives[]`. This is the ONE genuinely load-bearing use of the loop (plan §3.8) and it is not in
  the change request's list.
- **Assert:**
  - a `Try:` / numbered-candidates block is present in `user_response`, sourced from
    `Call 'sub-get-results'` **run 0** (`alternatives` non-empty on run 0);
  - `build-suggest-offer` completed with **no node error** (the `node.all(0,1)` call must be caught by its
    own `catch → break`, not surface as a failure);
  - the numbering is contiguous and the pick contract intact (see §TL-DYM).
- **Recorded, not asserted:** the cross-run fallback (run 0 empty, run 1 non-empty ⇒ D2 from tool 2) is
  now unreachable. That behaviour was **wrong** — on the only multi-tool domain the 2nd tool was
  `crm_inventory_warehouses_list`, so its `alternatives` would have been warehouse-shaped strings shown
  as product suggestions. Record the loss deliberately (plan RR2).
- **Also assert the stale comment was corrected** in the same diff ("Multi-tool queries run get-results
  MORE THAN ONCE" is now false).

## §TL-DYM — did-you-mean round-trip: pick by number still resolves  (`chat-stateful`, `parser`)
- **Sequence:** §TL-D2, then reply `2`.
- **Assert:** the pick resolves against `last_result_set[1]` (idx 2), carried customer/date retained,
  `dym_offer` lifecycle intact. ❌ FAIL if the pick resolves to anything the cross-domain/sibling blocks
  contributed. This is the highest-value regression turn in the set (crossdomain manual script R6, and
  plan §3.8's downstream contract).

## §TL-CLR — clarify turn (vague mash) still clarifies  (`437264483`, `parser`)
- **Trigger:** `stock ah` (vague, non-confident).
- **Assert:** `Basic LLM Chain` clarification path taken; `central-exchange` fed from it; a clarification
  question is returned; **`Aggregate1` did NOT run**; no escalate offer. §0 all.

## §TL-RS — require-specific / disambiguation turn bypasses the whole subgraph  (`deterministic`)
- **Trigger:** a turn that sets `disallowed-entity-gate.require_specific === true`.
- **Assert:** `If3` took **out0**; `Execute 'sub-get-rag'` / `tool-filter` / `Call 'sub-get-results'` /
  `validator` / `If6` / `Aggregate1` **all ABSENT from runData**; the picklist renders. This proves the
  change is *structurally* invisible to the disambiguation path (crossdomain R8's reasoning, now an
  explicit assertion).

## §TL-ATT — attachment / media path unaffected  (`437264483`, `deterministic`)
- **Trigger:** a product-attachment turn that really returns a file (packing list / drawing).
- **Assert:** `central-exchange → if-got-attachments → Edit Fields → Split Out → Remove Duplicates →
  get-presigned-url → Loop Over Items1 → Switch` all ran; `Edit Fields`'s `$('validator')` read resolved;
  the attachment is represented in the egress log as `would_send` with a non-empty URL.
- **Explicitly assert `Loop Over Items1` RAN.** It is a *different* `splitInBatches` node on the media
  path — deleting it by name confusion is the obvious way to break this change (plan §3.1).
- §0 **S1** — all three `send-message-*` nodes remain orphaned; nothing sent.

## §TL-CONT — multi-turn continuity  (`chat-stateful`, `parser`)
- **Sequence:** any answered turn (§TL-1), then `how about SRTWC286-SH-NEW-200`.
- **Assert:** domain/entity carry works; `last_result_set` and `selection_context` evolve as before;
  `compile-current-state.variables` shape unchanged. The state chain is downstream of `If6 out0`, so this
  guards that the happy path's payload did not shift.

## §TL-ACC-noaccess — no-access contact still short-circuits  (contact `457216562`, `deterministic`)
- **Assert:** `check-access`/`If5` no-access side; the subgraph is never reached (`tool-filter` absent
  from runData); access-denied message returned. §0 all, S4 trivially.

## §TL-ACC-partial — ⛔ **BLOCKED** — partial / ask-for-access  (contact **TBD**)
Prerequisite P-CONTACT (plan §7.1). Record as **BLOCKED**, never as passed.

---

## §TL-EMPTY 📌 — zero tools from RAG: behaviour must be PRESERVED, and it is a pre-existing hole
- **Method:** two parts. (a) **Pre-change**, on the clone, drive a turn whose `domain_hint` matches no
  `mcp_tool` embedding (or pin `Execute 'sub-get-rag'`'s output to `{tools:[]}` via
  `prepare_test_pin_data` → `test_workflow`, LESSONS §34) and record exactly what happens.
  (b) **Post-change**, repeat and assert the behaviour is identical.
- **Expected (to be confirmed, not assumed):** `Split Out1` emitted 0 items ⇒ the loop body never ran ⇒
  `Aggregate1` never ran ⇒ **the turn dead-ended silently with a green execution and no reply.** The new
  `tool-filter` returns `[]` on empty, reproducing this exactly.
- 📌 **This is a PRE-EXISTING defect, deliberately not fixed** (plan D11/RR4): a customer gets no reply
  and no error is raised. Log it as backlog with the pre-change evidence attached, so the equivalence
  claim is measured and the hole is owned rather than inherited silently.

## §TL-SUM 📌 — RECORD: `sub-get-rag` SUMS similarity, so `tools[0]` ≠ provably-best
`sub-get-rag`'s final Code node collapses `source_id → name` and does `map[name].similarity += …`. Two
`source_id`s for one tool ⇒ summed score ⇒ `Object.values(map)`'s SQL best-first order can be wrong.
- **Assert:** `tool-filter` sorts explicitly (covered by §TL-S2), so the selection is correct even under
  summation.
- **Record:** every tool observed today has ONE `source_id`, so sort-vs-`[0]` currently agree. That is a
  `green-that-cannot-fail` shape — the assertion is only meaningful because §TL-FP3 forces it red.
- Backlog: the real fix (max instead of sum) belongs in `sub-get-rag`. Do not bundle.

---

## §TL-FP. FAIL-ON-PURPOSE — prove each critical assertion can go RED
Per memory `green-that-cannot-fail` and LESSONS §61: an assertion never shown to fail is not an
instrument. **All three must be demonstrated RED, evidence recorded, and REVERTED immediately.** Do each
on the clone, one at a time, re-publishing the correct build after each.

### §TL-FP1 ★★ — leave `If6 out1` UNWIRED and prove the miss suite catches it  — THE MANDATORY ONE
- **Do:** remove the `If6 [main 1] → Aggregate1` connection. Publish. Re-run **§TL-M1 and §TL-M2**.
- **MUST observe:** `runData['Aggregate1']` **absent**; `runData['not-found-error-message']` **absent**;
  no reply in the egress log — **and the execution reports `status: success`**.
- **The instrument being validated is the runData assertion, not the status.** Record the green status
  side by side with the absent nodes: that pairing is the whole reason §TL forbids status-based scoring.
  If §TL-M1/M2 report PASS in this state, **the entire miss suite is void** and must be rewritten before
  anything is promoted.
- **Revert immediately** and re-run §TL-S1 + §TL-M1/M2 green.

### §TL-FP2 ★ — make `tool-filter` emit the OLD `{tools:[…]}` shape and prove the tool assertion catches it
- **Do:** temporarily `return { tools: [best] }` instead of `return [{json: best}]`. Publish. Run §TL-1.
- **MUST observe:** the resolved `tool` passed to `Call 'sub-get-results'` is **`undefined`/empty**; and —
  the point of the case — `Call 'sub-get-results'` (`alwaysOutputData:true`, `onError:continueErrorOutput`)
  still yields an item that flows into `validator`, so the turn produces a **plausible but wrong** reply
  with a green execution (LESSONS §61a). §TL-1's `tool`-string assertion must FAIL.
- **Revert immediately.**

### §TL-FP3 ★ — feed 3 tools and prove the arity is enforced by CODE, not by the index
- **Do:** pin `Execute 'sub-get-rag'`'s output to `{tools:[{name:A,similarity:0.9},{name:B,similarity:0.8},
  {name:C,similarity:0.95}]}` via `prepare_test_pin_data` → `test_workflow` (no index mutation, no egress).
- **MUST observe:** `tool-filter` emits **exactly 1 item**, and it is **C** (0.95) — i.e. the explicit sort
  ran and `tools[0]` (A) was NOT taken. Downstream nodes each have exactly 1 run;
  `sorento-sub-respond-sendmsg-respond2` has ≤1 run.
- **This is the case that proves the 1-tool invariant is structural** (plan §4) and simultaneously proves
  D9's sort is real (§TL-SUM would otherwise be untestable). Without it, §TL-1…§TL-7 all pass on an index
  that happens to hold one row — a green that cannot fail.
- No revert needed (pin-only, nothing published).

---

## §TL-R. Manual regression set (extends `tests/crossdomain-manual-test-script.md` §5b R1–R10)

The splice sits on the path every turn takes, so the regression set is the same population as
crossdomain's plus the arity cases. Re-run **all** of these post-change; each records an exec id.

| id | trigger | must be |
|---|---|---|
| §TL-R1 | `check stock SRTWT5800` (product WITH stock) | normal answer, byte-identical to pre-change, no block |
| §TL-R2 ★ | an inventory miss with no cross-axis data | `No stock records found for: X.` **byte-identical to live** — the strongest single gate for both this change and the crossdomain hoist |
| §TL-R3 | an **order** enquiry | untouched — routing, no block, 1 tool |
| §TL-R4 | a **promotion** enquiry | untouched |
| §TL-R5 | a **complaint** / escalation turn | untouched; escalate phrase still from `escalate-catalog`, not doubled |
| §TL-R6 ★★ | a **did-you-mean** turn, then pick by number | = §TL-D2 + §TL-DYM. **Highest-value regression turn** — the D2 arm is the multi-run consumer (plan §3.8) |
| §TL-R7 | a **clarify** turn (`stock ah`) | = §TL-CLR |
| §TL-R8 | a **require-specific / disambiguation** turn | = §TL-RS |
| §TL-R9 | a product-attachment / packing-list turn | = §TL-ATT; `Loop Over Items1` ran |
| §TL-R10 | multi-turn: answered turn, then `how about X` | = §TL-CONT |
| §TL-R11 ⭐ NEW | an **AND-mode** turn (`stock for A and B`) | itemised miss line names the RIGHT products. The crossdomain hoist's equivalence was proven by inspection on **OR-mode only**; AND-mode was never sampled and now flows through changed wiring too |
| §TL-R12 ⭐ NEW | any turn, checked for arity | `sorento-sub-respond-sendmsg-respond2` has **exactly 1 run**. Cheap; guards the two-messages-to-one-customer failure |

---

## §TL-X. Cross-domain feature re-runs (it sits on this path) — see plan §9 Amendment B

`cross-domain-stock-incoming` is **REQUEST-CHANGES / not promoted**, and its splice
(`validator → zeroset → gate → {probe→render|} → If6`) sits directly on the rewired path. Loop removal
goes FIRST (plan §9), so the whole X-suite is re-run on the loop-free clone. Two cases **change meaning**:

| id | before | after loop removal |
|---|---|---|
| **§TL-X-T3** (was T3/F3, double probe) | "expect **2** probe runs; `executeOnce` is INERT; finding confirmed unfixed" | **assert `runData['crossdomain-probe'].length === 1`.** Structurally single-run. Also: **remove** the dead `executeOnce:true`, and **DO NOT** add the proposed `{{ $runIndex }} === 0` gate to `crossdomain-gate` — it would be permanently true, i.e. a condition that can never go false on the node deciding whether the probe runs |
| **§TL-X-T4** (was T4/F4, false cross-domain block) | open, unfixed, untested: per-tool `returnedCodes` vs per-turn `missing` ⇒ an answered turn could claim cross-domain stock and arm the escalate offer | **assert `runData['crossdomain-zeroset'].length === 1`** ⇒ the runs cannot disagree ⇒ **impossible by construction.** Closes F4 with no zeroset redesign |

Re-run, in priority order, each with an exec id: **T1** (marker anchoring), **T2** (`_xdApplied` absent),
**T3**, **T4**, **X1**, **X3**, **X4/X11a/X11b**, **X2**, **X9**, **X10**, then **X6/X7/X8** (console,
multi-turn). `crossdomain-render`/`compose` pin to run 0 via `.first()`, so the block content on a 1-tool
turn is unchanged — assert that, don't assume it.

---

## Coverage / notes (this change)

| requirement | covered by |
|---|---|
| one case per domain (7) | §TL-1 … §TL-7 |
| **miss turn per domain (7)** — the highest-risk path | §TL-M1 … §TL-M7 + §TL-AGG + §TL-M-BYTE |
| did-you-mean | §TL-D2 (render) + §TL-DYM (round-trip) |
| clarify | §TL-CLR |
| require-specific | §TL-RS |
| attachment | §TL-ATT |
| multi-turn continuity | §TL-CONT |
| cross-domain X-cases | §TL-X |
| 1-tool invariant is structural | §TL-S2 + §TL-FP3 |
| miss path genuinely exercised / dead-end would be caught | §TL-FP1 (mandatory) |
| R1–R10 reused + extended | §TL-R (adds R11 AND-mode, R12 arity) |
| access branches | §TL-ACC-noaccess; §TL-ACC-partial **BLOCKED** (contact TBD) |
| pre-existing holes owned, not inherited | §TL-EMPTY (0 tools), §TL-SUM (summed similarity), §TL-S4 (live→TEST fork) |

**Tier:** `deterministic`. §TL-D2 / §TL-DYM / §TL-CLR / §TL-CONT are **parser-tier runs of a
deterministic change** (they need real classification) — declare them so they don't pollute the S6
zero-LLM count. §TL-FP3 and §TL-EMPTY(a) use `prepare_test_pin_data` → `test_workflow`: no seed, no
egress, ~0 token.

**Not covered on the clone — flag for post-promote** (LESSONS §56): live's `save-session-vars` (the prod
conversation-variables PUT) is a *different node* from the clone's `pg-upsert-session`, and it is fed by
`compile-current-state`, which builds a **whitelisted** output object — so this change cannot pollute the
PUT body (contrast crossdomain **F2**). Verified by reading `compile-current-state` lines 482–526; assert
it again post-promote on one real miss turn rather than trusting the reading.

---

# Change: `crossdomain-attachment` (deliver the packing list on cross-domain INCOMING turns)

Plan: `../plans/crossdomain-attachment-plan.md`. **Scope: `deterministic`** for every case below unless a
case says otherwise. Contact `437264483` (FULL access). Build/test target = clone `txiPzSxy3Pclsz6v`
(layered on the `cross-domain-stock-incoming` build, clone `a0f434f9`) — **never live**.

Every case is bound by **§0 (S1–S8)**. §0 is the acceptance gate: a §0 failure is a hard fail and halts the
run, regardless of functional result.
