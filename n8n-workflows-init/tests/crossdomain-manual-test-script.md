# MANUAL TEST SCRIPT — `cross-domain-stock-incoming` post-fix (F1 / F2 / executeOnce)

For a human eyeballing the clone in the chat console. Companion to
`tests/reviews/cross-domain-stock-incoming.md` (the review that ordered these fixes) and
`plans/cross-domain-stock-incoming-plan.md` (locked decisions).

Target: clone **`txiPzSxy3Pclsz6v`** only. Live spine `9qVyfUxmRQqrpGRMDLRuz` must stay at `a40cd16d`.

---

## 0. Setup + discipline (read before typing anything)

**Console:** `https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`
(`zz-chat` `oyYfVvZHRZpWubTy`). Mode `chat-stateful`, contact `437264483`, session R/W →
`respond_contacts_test`. Blocking call, so the reply lands in the widget. Multi-turn state persists — this is
the ONLY driver that can test the "yes"/"no" follow-up legs. (`drive-clone.py` is mode `uac`, single-turn,
session write orphaned → cannot test follow-ups.)

**Four rules that decide whether your eyeball is worth anything:**

1. **Confirm the build.** Clone `activeVersionId` must be **`6d479172-50e4-4be3-9e88-895a86b2701b`**
   (published 2026-08-03, F1+F2+executeOnce). Pre-fix backup:
   `backups/clone-txiPzSxy3Pclsz6v-043358ae-20260803-before.json`. If the id differs, you're testing
   something else.
2. **Discard the first turn after any write.** A run fired seconds after a publish can execute the PREVIOUS
   version. This already produced one FALSE PASS this feature (FP1). Send one throwaway message, ignore the
   reply, then start.
3. **Record the executionId per case.** The reviewer's main evidence complaint: the existing run log maps no
   case to an exec id, so most GREENs can't be attributed to a build. Note the exec id (or timestamp) beside
   each result below.
4. **Don't run this concurrently with a regression golden-capture** — both share the
   `respond_contacts_test` row for 437264483.

**Verify ground truth FIRST — the test data is live CRM and drifts.** Before judging any cross-domain
output, establish what's actually true today:

| type | expected today | why you need it |
|---|---|---|
| `check stock SRTWT5800` | stock in 6 locations: BRW 316, BRW-NTC 236, BRW-AM 7, BRW-IR 4, two at 0 | T1's baseline — and the format the cross-domain block must MATCH |
| `check eta SRTWC286-SH-NEW-200` | incoming 200 pcs, ETA 2026-07-22, container FFAU3176932 | T3's baseline |

If those numbers have moved, use the new numbers — don't declare a failure because the CRM changed.

---

## 1. The three fixes (T-series) — test these first, they're why we're here

### T1 — F1: block must sit ABOVE the escalate question on the lower-case-marker arm

**This is the actual defect.** The block-placement code searched for markers case-sensitively; live's D1
multi-token arm writes `did you mean:` and `…or would you like me to escalate…` in lower case, so no marker
matched and the block was appended at the very END — below the numbered picker AND below the escalate
question.

**The defect was wider than the review found: 4 arms were broken, not 1.** The fix added a new marker
(`Here are the closest matches:`) and snaps the insert to the winning marker's line/sentence start. Census
verified against live `build-suggest-offer` 416L / `not-found-error-message` 248L:

| arm | was | now |
|---|---|---|
| D3 sibling picker (`Related products:`) | ✅ | ✅ byte-identical |
| **D1 multi-token** (`"tok" — did you mean:`) | ❌ appended at END | ✅ anchored |
| **D1 numbered / uuid** (`Here are the closest matches:`) | ❌ END | ✅ above the numbers |
| D1 single-token (`Did you mean`) | ✅ | ✅ byte-identical |
| D2 `Try:` | ✅ | ✅ byte-identical |
| **D2 date arm** (lower-case escalate only) | ❌ END | ✅ anchored |
| **D2 numbered / uuid alts** | ❌ END | ✅ above the numbers |
| not-found plain + breakdown (capital `Would you like me to escalate`) | ✅ | ✅ byte-identical |
| clarification arms (vague / require_specific / needsScope / attachment-type) | no marker | unchanged — no list and no escalate invite, so nothing to sit above |

There is a **runnable local proof** covering all 11 shapes with verbatim live text:
```bash
node n8n-workflows-init/tests/diffs/cross-domain-stock-incoming-review-fixes.marker-proof.js
```
It asserts block-above-numbered-list and block-above-escalate-invite on every arm. Run it first — if it fails,
stop and don't waste console turns.

Then eyeball at least the **two riskiest live arms**: a turn hitting D1 multi-token (one product that resolves
but returns nothing on the asked axis + two or more near-miss/typo'd codes, so did-you-mean renders per token)
and a turn hitting a **numbered** candidate list (typo a code so uuid alternatives render as `1.` `2.` `3.`).
The numbered arms matter most — they're where a mis-anchored insert could land *inside* the list and corrupt
the pick contract.

**Eyeball, in this order top-to-bottom:**
1. the miss line (`No stock records found for: …`)
2. the cross-domain block, opening `But here are the stock details for the requested products:`
   (reworded 2026-08-04 — see plan §LEAD-IN REWORDED; the incoming-direction lead-in
   `But there is INCOMING stock (ETA) for the requested products:` is unchanged)
3. the did-you-mean / numbered candidates
4. the escalate question, **LAST**

❌ FAIL if the block appears after the escalate question, or interleaved inside the numbered list.

⚠️ **Green that cannot fail:** if your test turn doesn't actually reach the D1 multi-token arm, you'll get a
correctly-ordered message and learn nothing. Confirm the reply really contains the lower-case
`did you mean:` wording before you trust the pass.

### T2 — F2: `_xdApplied` must not be in the payload

Not visible in the chat. On any turn that produces a cross-domain block, check the execution's
`crossdomain-compose` output JSON in the n8n UI.

❌ FAIL if a top-level `_xdApplied` key exists.

Why it matters: on LIVE, `save-session-vars` PUTs `JSON.stringify($json)` — the whole item — into the real
customer session. The clone cannot catch this itself (it writes via `pg-upsert-session`, a jsonb upsert that
swallows any shape), so this check only exists if you do it by hand.

### T3 — F3: `executeOnce` is INERT. Expect the double read to STILL be there.

⚠️ **Do not record this as a pass just because the checkbox is set.** n8n's `executeOnce` truncates a node's
input to the first item *within a run* (`input.slice(0,1)`); it does **not** suppress additional **runs**. The
fan-out here is `Split Out1` → 2 tools → **2 runs of 1 item each**. So the flag cannot halve the CRM reads.

On a miss turn, count `runData['crossdomain-probe'].length`:
- **2** → confirms the finding; the double read is real and unfixed. (Baseline: exec `11033897` produced
  sub-execs `11033905` + `11033907`.)
- **1** → the finding is wrong and the flag did work. Say so.

Which item wins is unchanged either way — `_xd` and `_xdBlock` were character-identical on runs 0 and 1, and
render/compose already pin to run 0 via `.first()`. So this is a cost issue (2 CRM reads per miss turn on live,
forever), not a correctness issue.

**Effective fix, NOT applied — needs your call:** add `{{ $runIndex }} === 0` to `crossdomain-gate`; run 1 then
takes the FALSE branch that already wires to `If6`. It's a 4th change and it alters which edge feeds `If6`,
so it wasn't done unprompted.

### T4 — 🚩 F4: multi-tool turn can produce a FALSE cross-domain block (new, pre-existing, UNFIXED)

`crossdomain-zeroset` computes `returnedCodes` from the **per-run (per-tool)** validator envelope, but
`missing` is a claim about the **whole turn**. On a multi-tool turn the runs can disagree:
`crm_inventory_stock_balance_list` answers product X on run 0, `crm_inventory_warehouses_list` yields no
product-code rows on run 1 → **run 1 alone computes `missing:[X]`**. If run 0's gate was FALSE, `render` ran
only on run 1, so `.first()` returns the run-1 block.

Customer-visible result: **a turn that successfully answered X also says "But there is INCOMING stock (ETA)
for the requested products…" and arms the escalate offer.** Adjacent to review RISK-3.

No existing test covers it — on the tested turn both tools returned nothing.

**How to hunt for it:** type a turn that selects two tools where only one yields product-code rows. Candidates
to try: `stock for SRTWT5800 and which warehouse`, `stock SRTWT5800 by warehouse`, or anything mixing a
product-level read with a list/lookup read. Check `runData['crossdomain-zeroset']` per run — if run 1's `_xd.missing`
names a product that run 0 answered, that's F4 live.

Correct fix is the **union of `returnedCodes` across runs** — a zero-set design change (plan Q7/Q13),
deliberately out of scope for this fix round. **Decide before promote:** fix, or promote with the hole
documented.

---

## 2. Feature suite (X-series) — re-run on the fixed build, with exec ids this time

Every one of these was GREEN before, but on an unattributable build. Re-running is cheap.

| id | type this | expect |
|---|---|---|
| X1 | `pls check eta SRTWT5800` | `No incoming records found for: SRTWT5800.` then `But here are the stock details for the requested products:` then all locations sorted qty DESC, then the sibling `Related products:` list, then escalate question. Block ABOVE the sibling list. |
| X2 | `check eta SRTWT5800-FH` | both axes empty → **NO block at all**, no lead-in, message identical to today's behaviour. This is decision (d): an empty probe never asserts an absence, because a failed read and a genuine nothing look identical. |
| X3 | `check stock SRTWC286-SH-NEW-200` | `No stock records found for: …` then `But there is INCOMING stock (ETA)…` then 200 pcs / ETA 22/07/2026 |
| X4 | `check eta SRTWT5800 and SRTWC286-SH-NEW-200` (partial: one answers, one doesn't) | the answered product's real answer **plus** the miss line **plus** the block for the missing one only. Quick replies present. |
| X9 | `FFAU3176932` (container) | no-op — no block. |
| X10 | any fully-answered turn, e.g. `check stock SRTWC286-SH-NEW-200`… use a product with stock | no-op — no block, message unchanged. |

**Format parity check on X1/X3 (easy to miss):** the cross-domain block should look like a real stock/incoming
answer — same `*Product Code:*` / `*Warehouse:*` / `*Quantity On Hand:*` field style, flags like
`🚩 PENDING ALLOCATION` carried through. Compare side-by-side with the §0 baseline you captured.
Rows with **qty 0 are shown**; only *empty probes* (zero rows) are silent. Bullets `- `, never numbers.

**Ordering/sort check:** CRM row order is NOT stable between calls. Run X1 twice — the location order in the
block must be identical both times (qty DESC). If it shuffles, the sort broke.

---

## 3. Follow-up legs (need the console's multi-turn state)

| id | sequence | expect |
|---|---|---|
| X6 | X1, then `yes` | escalation confirmed, human-intervention guard fires (record-only on the clone — no real staff ping). |
| X7 | X4, then `No it's okay` | `Escalation declined.` **Never run before.** The reviewer traced it as structurally immune (the decline path is upstream of get-results), so this is a completeness check, not a risk. |
| X8 | X1, then `2` | must resolve to the **sibling picker's** item #2 from `last_result_set` — NOT a cross-domain row. Recorded as "user-verified manually" with no exec id; needs a real one. This is the contract that keeps the block display-only. |

⚠️ **X6 is the one leg with a real-world edge.** The escalate phrase now arms on turns that DID return data.
On the clone that's harmless. **Post-promote, do NOT smoke the "yes" leg against a real contact** — it's a
genuine staff assignment ripple.

---

## 4. Fail-on-purpose (prove the assertions can fail)

Half the suite passes identically on a completely inert build, so these are what make the greens mean
something. Only worth redoing if you want independent confidence.

| id | do this | expect |
|---|---|---|
| FP2 | temporarily reword the escalate phrase | the follow-up `yes` **stops working** (`is_escalation_confirmation:false`). Proves the frozen regex contract: the parser matches `/would you like me to escalate/i` against the stored state. **Only informative paired with a passing X6** — on its own it's a bare negative that any breakage produces. Revert immediately. |
| FP1 | point the probe at a bogus tool name | message comes back **byte-identical to today** — no `none on hand`, no invented absence. Revert immediately. |

---

## 5. REGRESSION — what to check, and an honest limit

### 5a. ⚠️ The automated golden-master replay harness is NOT usable as-is

The `n8n_test` replay path pushes to `main-message-list-test` while the clone pops `test:q:{contact}` — it
produces **false 100%-regression reports** until repaired. So "run the regression suite" is not currently a
one-command answer. Either repair that plumbing first (separate task) or treat §5b as the regression pass.
Don't accept a green replay report without fixing this first.

### 5b. Manual regression set (what this change could plausibly break)

The splice sits between `validator` and `If6`, and `crossdomain-compose` sits between
`compile-current-state` and its consumers — so every turn that reaches an answer flows through new code.
That's the blast radius.

| id | type this | must be |
|---|---|---|
| R1 | `check stock SRTWT5800` (product WITH stock) | normal answer, **no block**, byte-identical to pre-change |
| R2 | any inventory miss with no cross-axis data | `No stock records found for: X.` — **byte-identical to live**. The #3 noun fix is scoped to *incoming* turns only; inventory wording must not have moved. |
| R3 | an **order** enquiry (e.g. an SPO/order code) | untouched — no block, no phrase, normal routing |
| R4 | a **promotion** enquiry | untouched |
| R5 | a **complaint** / escalation turn | untouched — and note the escalate phrase should come from `escalate-catalog` as before, not doubled |
| R6 | a **did-you-mean** turn (typo a code) → then pick by number | picker still resolves correctly; numbering intact |
| R7 | a **clarify** turn (vague mash, e.g. `stock ah`) | still clarifies; no block |
| R8 | a **require-specific / disambiguation** turn | no block (it bypasses `validator` entirely — structural, not guarded in code) |
| R9 | a product-attachment / packing-list turn | attachment still delivered as before. The cross-domain probe *does* return a packing list on incoming turns; we deliberately discard it — confirm nothing leaked in. |
| R10 | multi-turn: any answered turn, then a follow-up `how about X` | domain/entity carry still works — `last_result_set` and `selection_context` must be untouched by this change |

**The specific thing to be suspicious of:** the review proved the #3 hoist equivalent **by code inspection**,
not by the shadow-equality gate (that was run on OR-mode turns only, then deleted). The three residual
divergences were argued unreachable — AND-mode-fallback and dym-PICKED turns were never sampled. So R6 and
any AND-mode turn ("stock for A and B") are the highest-value regression turns in this table. If #3's
itemised miss line ever names the WRONG products, or names none when it should, that's the hoist.

### 5c. Not covered by any test on the clone — flag for post-promote

Live's `save-session-vars` (the prod conversation-variables PUT) is a **different node** from the clone's
`pg-upsert-session`. The E1 state append — the half that makes a partial-turn `yes` reconcile — travels
through it. **It has never been exercised.** First real partial turn after promote, verify the stored
session `response` actually ends with the escalate phrase.

---

## 6. Results

Record per case: id · exec id / timestamp · PASS/FAIL · what you actually saw.

| id | exec | result | notes |
|---|---|---|---|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| X1 | | | |
| X2 | | | |
| X3 | | | |
| X4 | | | |
| X6 | | | |
| X7 | | | |
| X8 | | | |
| X9 | | | |
| X10 | | | |
| R1–R10 | | | |
