# PRE-PROMOTE MANUAL TEST CHECKLIST

For a human eyeballing the clone before promoting. Covers **three** stacked changes sharing one code path:

1. **`tool-loop-removal`** — reviewer APPROVED (`tests/reviews/tool-loop-removal.md`)
2. **`cross-domain-stock-incoming`** — REQUEST-CHANGES resolved; on-hand lead-in reworded 2026-08-04
3. **cross-domain attachment + presign error path** — built 2026-08-04, under automated test (§4 below)

Target: clone **`txiPzSxy3Pclsz6v`**, expected `versionId == activeVersionId == dacf9224-…`. Later versions are
fine, but draft and active must **match** — see §0 rule 1. Live spine must stay at `a40cd16d`.

**Downtime question answered in §9.** Short version: no.

---

## 0. Setup — 3 minutes, and it decides whether the rest is worth doing

**Console:** `https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`
(`zz-chat` `oyYfVvZHRZpWubTy`). Mode `chat-stateful`, contact `437264483`, session R/W → `respond_contacts_test`.
Multi-turn state persists — required for every `yes`/`no`/number follow-up below.

**Five rules:**

0. **Check `versionId == activeVersionId` FIRST.** Executions run the **active** version; the n8n UI and a REST
   GET both show the **draft**. An agent died mid-test on 2026-08-04 leaving a *sabotaged active version* while
   every normal view looked clean. If they differ, stop and report — do not test.
1. **Send one throwaway message first and ignore the reply.** A turn fired seconds after any workflow write can
   execute the *previous* version. This already produced one false PASS on this feature.
2. **State carries between your turns.** The console is stateful, so turn N+1 inherits turn N's domain, entities
   and dates. When you start a new scenario, make the first message **domain-decisive** (say "stock" or "eta"
   explicitly) or you'll be testing carry-over, not the thing you meant.
3. **Note the execution id** for anything that looks wrong — without it a report can't be diagnosed.
4. If anything reaches a real customer or writes prod: **stop and tell me.** That's a design failure, not a test
   result.

**Ground truth — verify first, it's live CRM and it drifts.** These are the fixtures everything below uses:

| type this | expect today |
|---|---|
| `check stock SRTWT5800` | 6 locations: BRW 316, BRW-NTC 236, BRW-AM 7, BRW-IR 4, BRW-BB 0, BRW-RSV 0 |
| `check eta SRTWC286-SH-NEW-200` | incoming 200 pcs, ETA 22/07/2026, container FFAU3176932, **📎 xlsx** |

If the numbers moved, use the new ones. Don't call a CRM change a regression.

---

## 1. ⭐ If you only run eight, run these

The highest information-per-minute set. Everything else is breadth.

| # | type this | the thing being checked |
|---|---|---|
| 1 | `check stock SRTWT5800` | happy path unbroken (§TL-R1) |
| 2 | `check eta SRTWT5800` | **miss path** — the new `If6 out1 → Aggregate1` edge, the single biggest risk in the loop removal. Plus the cross-domain block should tell you about the 564 pcs on hand. |
| 3 | `check stock SRTWC286-SH-NEW-200` | miss on the other axis → block reports incoming 200 / ETA **+ 📎 packing list + "I have attached the file(s) below."** |
| 3b | `check eta SRTWC286-SH-NEW-200` | ★ **re-rooting regression** — the pre-existing attachment turn must still deliver its 📎. Failure mode: **0 files, green execution.** |
| 4 | `check stock CSS8800` | **did-you-mean D2 arm** — the one place that used to read the loop's extra runs (highest-value regression turn) |
| 5 | then reply `2` | number-pick still resolves against the picker, not a cross-domain row |
| 6 | `check eta SRTWT5800-FH` | both axes empty → **no block at all**, no invented absence |
| 7 | after #2, reply `yes` | escalation confirms (frozen phrase contract) |
| 8 | after #3, reply `No it's okay` | `Escalation declined.` — this path was never run until yesterday |

---

## 2. Loop removal — one happy + one miss per domain

The loop sat on the path *every* turn takes, so breadth matters more than depth here. For each: you should get a
sensible answer, and the reply should arrive at all.

| id | domain | happy turn | miss turn |
|---|---|---|---|
| D1 | inventory | `check stock SRTWT5800` | `check stock SRTWT9999-NOPE` |
| D2 | incoming | `check eta SRTWC286-SH-NEW-200` | `check eta SRTWT5800` |
| D3 | product_attachment | ask for a packing list / drawing for a known product | same for a product with no attachment |
| D4 | order | an order-status query by SPO / order code | an order code with no match |
| D5 | promotion | a promotion enquiry (`srt79ss`-style code or promo name) | a promo code with no match |
| D6 | master_products | a product-info / catalogue enquiry | a code with no catalogue entry |
| D7 | portal_link | a portal-link request | — |

**Known already:** the automated suite recorded `master_products` and `portal_link` **miss** turns as
**UNREACHABLE** after several attempts — nobody could construct one. If you can't either, that matches; don't
force it.

**What a loop-removal failure looks like:** no reply at all, or a reply that stops mid-thought. The execution
will still say "success" — that's the whole reason this change was gated so hard.

---

## 3. Cross-domain feature (rides on the same path)

| id | type this | expect |
|---|---|---|
| X1 | `pls check eta SRTWT5800` | `No incoming records found for: SRTWT5800.` → `But here are the stock details for the requested products:` → all 6 locations, **qty DESC** → sibling `Related products:` list → escalate question. **Block ABOVE the sibling list.** |
| X2 | `check eta SRTWT5800-FH` | both empty → **no block**, message as it always was |
| X3 | `check stock SRTWC286-SH-NEW-200` | `But there is INCOMING stock (ETA)…` 200 pcs, ETA 22/07/2026 |
| X4 | `check eta SRTWT5800 and SRTWC286-SH-NEW-200` | partial: one real answer **plus** miss line **plus** block for the missing one only |
| X9 | `FFAU3176932` | container turn → no block |
| T1 | `check stock CSS8800, SRT393B-18, SRTMRL707` | **the F1 fix** — a multi-token did-you-mean turn. Block must sit **above** the candidates and **above** the escalate question, never at the end. |
| T2 | (any turn producing a block) | in the n8n UI, `crossdomain-compose` output must have **no `_xdApplied` key** |

**Format parity check:** the block should look like a real stock answer — same `*Product Code:*` /
`*Warehouse:*` / `*Quantity On Hand:*` styling, flags like `🚩 PENDING ALLOCATION` carried through. Compare
against your §0 baseline.

**Run X1 twice.** The location order must be identical both times. CRM row order is *not* stable between calls,
so the renderer sorts; if the order shuffles, the sort broke.

**Rows with qty 0 are shown** (BRW-BB and BRW-RSV). Only a completely empty probe stays silent. That asymmetry
is deliberate: an empty result and a failed read look identical, so the bot must never assert an absence.

---

## 3b. Attachments — NEW 2026-08-04, highest-risk area

| id | type this | expect |
|---|---|---|
| A1 | `check stock SRTWC286-SH-NEW-200` | cross-domain incoming → **📎 FFAU3176932.xlsx** + `I have attached the file(s) below.` |
| A2 ★ | `check eta SRTWC286-SH-NEW-200` | **re-rooting regression** — direct eta still delivers its 📎, exactly as before |
| A3 | `pls check eta SRTWT5800` | on-hand direction → block but **NO file, NO "I have attached…" sentence** |
| A4 | `check eta SRTWT5800-FH` | both empty → no block, **no file** |
| A5 | a turn missing several products in **different** containers | N files, none silently dropped; same container twice ⇒ appears **once** |
| A6 | `FFAU3176932` and other no-op turns | unchanged, no new file |

**Why A2 matters most:** the chain was **re-rooted** — `central-exchange → if-got-attachments` was cut, replaced
by `sendmsg2 → attach-merge → if-got-attachments`. If that went wrong, files stop arriving on turns that worked
yesterday, with a green execution and no error anywhere.

⚠️ **The sentence is a promise.** If a file ever fails to attach, the customer reads "I have attached the file(s)
below." with no file — and the text is sent *first*, so it can't be retracted. That's why the presign error path
was added (a failure now sends `Sorry — I couldn't attach the file(s)…`). You can't easily trigger this by hand;
the automated suite forces it by pointing the presign call at a dead local port.

⚠️ **A 📎 in the console does NOT prove live would send it.** The clone has a console-only lane
(`chat-attach?` → `chat-attach-push`); live uses `send-message-files`. The console proves the file was
*selected*, not that the real sender works.

---

## 4. Multi-turn (needs the console's persisted state)

| id | sequence | expect |
|---|---|---|
| M1 | X1, then `yes` | escalation confirmed; on the clone the staff ping is record-only |
| M2 | X4, then `No it's okay` | `Escalation declined.` |
| M3 | X1, then `2` | resolves to sibling #2 (`SRTWT5800-FH`), **not** a cross-domain row |
| M4 | `check stock CSS8800`, then `2` | did-you-mean pick by number → real answer for that code |
| M5 | any answered turn, then `how about SRTWC286-SH-NEW-200` | entity carry works |

**Known partial:** in M5, entity and state shape carry correctly but **domain does not** (`inventory` →
`master_products`). That's parser-side, upstream of everything we changed, and matches the existing backlog
item. Not a regression from these changes.

---

## 5. Must-not-change (regression)

| id | type this | must be |
|---|---|---|
| R1 | `check stock SRTWT5800` | byte-identical to pre-change; no block |
| R2 | an inventory miss | `No stock records found for: X.` — inventory wording **unchanged**. ⚠️ On an **incoming** miss the noun is deliberately now `No incoming records found for: X.` — that one is an intended fix, not a regression. |
| R3 | an order enquiry | untouched |
| R4 | a promotion enquiry | untouched |
| R5 | a complaint / escalation turn | untouched; escalate phrase not doubled |
| R6 | `stock ah` (vague) | still asks you to clarify |
| R7 | a require-specific / disambiguation turn | no block (bypasses the whole subgraph) |
| R8 | an attachment turn | attachment still delivered |

> **Note for the next change.** A third change is planned — `crossdomain-attachment`
> (`../plans/crossdomain-attachment-plan.md`, UAC §XA) — which **re-roots** the attachment chain so the
> packing list also rides the cross-domain block. It ships **separately, after** both changes on this page.
> When it lands, **R8 becomes the highest-value regression turn on this list**, and a new turn joins it:
> `check stock SRTWC286-SH-NEW-200` must deliver the text **and then** `FFAU3176932.xlsx`. Today that turn
> correctly delivers **no file** — do not report that as a bug against the current build.

**R2 and R6 are the highest-value regression turns.** The `#3` miss-line computation was proven equivalent by
*code inspection*, not by the shadow-equality gate (that only ever sampled OR-mode turns, then was deleted). If
`No stock records found for: …` ever names the **wrong** products, or names none when it should, that's the
hoist and it matters.

Also worth one turn each: an **AND-mode** query (`stock for SRTWT5800 and CSS8800`) and a **dym-picked** turn —
those two branches were never sampled by that gate.

---

## 6. Things that will look right but prove nothing

Worth knowing so you don't over-trust a green:

- **Any happy-path turn tells you nothing about the loop removal.** A happy turn exits via a different branch
  and is green whether the miss edge is wired or not. I made this exact mistake yesterday and the reviewer
  struck it. **The miss turns are the test.**
- **"No block appeared" passes on a completely inert build.** X2, X9 and the no-op turns are only meaningful
  next to a turn where the block *does* appear.
- **A green execution status means nothing here.** An unwired branch drops the turn silently and n8n still
  reports success. Judge by whether a sensible reply arrived.
- **A plausible, confident, wrong answer is the signature failure of this subsystem.** Proven yesterday: with a
  broken tool string the bot said "no inventory matched" for `SRTWT5800` — which holds 564 pcs. If an answer
  contradicts your §0 baseline, that's the bug, however fluent it reads.

---

## 7. Don't test these

- **Never smoke the `yes` leg against a real contact after promote.** The escalate phrase now arms on turns that
  *did* return data, so a bare `yes` is a genuine staff assignment ripple. Use the clone or the console.
- **Partial-access behaviour** is blocked — no partial-access test contact exists yet.
- **The automated golden-master replay** is broken (pushes one queue, the clone pops another) and will report a
  false 100%. Ignore any green from it. This checklist is the regression pass.

---

## 9. Does the promote cause downtime? — **No.** Verified from the live graph, not assumed.

**Ingress never touches the workflow being promoted.**
```
respond.io → sorento-main-INJECT   (webhook — SEPARATE workflow, untouched by the promote)
           → redis  q:{contact}  +  ready-contacts
           → sorento-dispatcher   (77SG9jTdVKhwMwvR — SEPARATE, untouched)
           → call-spine (executeWorkflow) → sorento-consume-main   ← the promote target
```
The spine's only enabled trigger is `When Executed by Another Workflow`; its `Schedule Trigger` is **disabled**.
So there is **no webhook to re-register** and no ingress gap — the webhook lives in a different workflow.

**Messages queue, they don't drop.** Incoming messages sit in redis `q:{contact}`, and the pop happens *inside*
the spine — so a turn that never starts is still in the queue.

**Publishing is a version swap, not a restart.** New executions use the new active version; executions already
running finish on the version they started with.

**The per-contact lock cannot stick.** `call-spine` has `onError: continueErrorOutput`, and **both** its success
and error outputs go to `del-lock` — the lock is released either way. `incr-lock` also carries a **120s TTL**
backstop, and the dispatcher re-arms via `llen-q → more-in-queue? → rearm-more`.

**Realistic worst case:** one turn in flight at the exact moment of the swap. It either completes on the old
version, or errors → lock released → re-armed. One customer might see one slow or missed reply. Not an outage.

**To reduce even that:** promote in a quiet window; check `LLEN q:*` is ~0 first. Rollback is another version
publish (`publish_workflow` with the previous `activeVersionId`) — equally instant.

🚩 **The real risk is not downtime — it's a silent no-op.** Live's send node reads `compile-current-state`
**by name**. Rewiring without repointing it leaves everything green while the feature simply never appears.
Post-promote, confirm with `Pls check eta SRTWT5800` (read-only) that the block actually renders.

---

## 8. Results

| id | exec id | PASS / FAIL | what you saw |
|----|---------|-------------|--------------|
|    |         |             |              |

Anything in §1 that fails, or any turn with no reply at all, is a stop-and-report.
