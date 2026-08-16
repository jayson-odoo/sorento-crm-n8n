# HANDOFF — `cross-domain-stock-incoming`

**Status: BUILT + GREEN ON CLONE. REVIEWED → REQUEST-CHANGES (narrow). NOT PROMOTED. Live spine untouched.**
Date 2026-08-03. Read this + `plans/cross-domain-stock-incoming-plan.md` before continuing.

> **⚠️ REVIEW LANDED 2026-08-03 — `tests/reviews/cross-domain-stock-incoming.md` is now the authority on
> what remains.** Verdict **REQUEST-CHANGES (narrow)**: zero-egress PASS, hoist PASS (proven by code, not by
> the deleted shadow gate), byte-identical retirement correctly scoped, regex contract / decision (d) /
> display-only all PASS. Three findings + evidence gaps block promote:
> - **F1** `crossdomain-compose` marker search uses case-sensitive `indexOf`; live's D1 multi-token arm
>   renders `did you mean:` / `…or would you like me to escalate…` in **lower case** → `idx === -1` → block
>   appended at the END, below the escalate question (the exact bug X2 caught, on an untested arm).
> - **F2** `_xdApplied` debug key would enter live's conversation-variables PUT (`save-session-vars` sends
>   `JSON.stringify($json)`); the clone can't catch it because it writes via `pg-upsert-session` instead.
> - **F3** the "only by-name consumer" census missed live `Call 'sub-respond-save-message-redis'2`
>   (`state_trace.after`), and live `compile-current-state` feeds **two** nodes, not three — `save-session-vars`
>   must be rewired too or the E1 state append never persists.
> - Run log maps **no case → executionId**, so most GREENs can't be attributed to a build (post-publish race).
> - Clone is now @ `043358ae` (this doc's `64713df6` is stale).
> §5 and §6 below are superseded by the review's checklist.

---

## 1. What this feature does

Customer asks about ONE axis, gets nothing, and walks away — while the goods sit on the other axis.
Real repro: `incoming for SRTWT5800` → "no incoming", while that product holds **564 pcs** across BRW.

Now, when an asked product returns ZERO rows on its own axis, the bot probes the OTHER axis and **tells**
(never "want me to check?"). Works both directions, and **per-product**, so it also fires on partial turns
(ask A+B, A answered, B empty → B gets cross-facts).

```
No incoming records found for: SRTWT5800.
But here are the stock details for the requested products:

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW
*Quantity On Hand:* 316
… (all locations, qty DESC)

Would you like me to escalate to purchasing team?
```

---

## 2. Where it lives

| thing | id / path |
|---|---|
| build target (ONLY place edited) | clone **`txiPzSxy3Pclsz6v`** |
| live spine — NEVER edited this session | `9qVyfUxmRQqrpGRMDLRuz` (active `a40cd16d`) |
| get-results sub on clone | `rysSPgUssLDf6xJc` → live `Fss5aAaXthJSWpZCgKiKR` (**remap at promote**) |
| plan + all decisions | `plans/cross-domain-stock-incoming-plan.md` (§1 decision table, §11/§12 build status) |
| test spec + real ground truth | `tests/cases/crossdomain-stock-incoming.json` |
| run log | `tests/runs/crossdomain-stock-incoming-20260803.md` |
| harness driver | `tests/harness/drive-clone.py` |
| renderer reference copy | `tests/harness/crossdomain-render.reference.js` |
| clone backup (pre-change) | `backups/clone-txiPzSxy3Pclsz6v-0a647e8b-20260803.json` |
| live backup | `backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json` |
| deleted #3 code (rollback) | `tests/diffs/zerostock-inline-computation-preserved.js` |

### Nodes added (5) + edits
```
validator → crossdomain-zeroset → crossdomain-gate ┬─TRUE→ crossdomain-probe → crossdomain-render ─┐
                                                   └─FALSE──────────────────────────────────────────┴→ If6 (unchanged)

compile-current-state → crossdomain-compose → [sendmsg2, guard-d-record, session-save-gate]
```
- `crossdomain-zeroset` — SINGLE SOURCE for "asked but returned nothing" (`_xd.missing`)
- `crossdomain-gate` — domain ∈ {inventory,incoming} && missing>0
- `crossdomain-probe` — other domain's tool, batched, `onError: continueRegularOutput`
- `crossdomain-render` — builds the block (canonical fields, bullets, positive facts only)
- `crossdomain-compose` — folds block + escalate phrase into message AND state
- `compile-current-state` — #3 hoisted to consume zeroset (528→459 lines) + domain-aware noun

---

## 3. How to run a test (2 min)

```bash
cd n8n-workflows-init/tests/harness
python3 drive-clone.py <tag> "incoming for SRTWT5800"
```
Drives the clone via `zz-canary-run` (`POST /webhook/zz-run-hint`), mode `uac`, contact 437264483.
Returns the egress log — assert guards are `would_log`/`would_write`/`would_send` ONLY.

**Known-good test data (live, drift-sensitive):**
- `SRTWT5800` — no incoming, **has stock** in 6 locations (BRW 316, BRW-NTC 236, BRW-AM 7, BRW-IR 4, two at 0)
- `SRTWC286-SH-NEW-200` — no stock, **has incoming** 200 pcs ETA 2026-07-22, container FFAU3176932
- `SRTWT5800-FH` / `-HEAD` — no incoming AND no stock (both-empty case)
- `FFAU3176932` — container with 4 products (container-only no-op case)

---

## 4. Test status

**GREEN:** X1 (incoming miss→stock), X2 (both empty→no block), X3 (stock miss→incoming), X4/X11a (partial
incoming), X11b (2 missing), X5 (partial inventory), X6 ("yes"→escalation confirmed), X9 (container no-op),
X10 (fully-answered no-op), **X8 (number-pick → sibling, user-verified manually)**.
**Fail-on-purpose GREEN:** FP1 (soft-failed read → byte-identical), FP2 (reworded phrase → escalation dies),
FP3 (shadow perturbation detected).
Shadow-equality gate: 5 turns all agreed pre-hoist, then deleted as tautological.
Zero-egress §0 held on every run.

**NOT RUN: X7** — decline path (`No it's okay` after a partial turn) → expect `Escalation declined.`

---

## 5. Open items (ranked)

1. **Double probe** — `crossdomain-probe` executes **twice** per miss turn (verified: sub-executions
   `11033905` + `11033907` in exec `11033897`). Output unaffected (all reads use `.first()`), but it is
   2 CRM reads instead of 1. Fix: `executeOnce: true` on the probe. Cheap, safe.
2. **X7** — run the decline case.
3. **Unify the 4 miss templates** — same situation produces different sentences depending on sibling count:
   D3 `No incoming stock (ETA) found for X. Related products:` / D2 `No stock for X. Try:` / breakdown
   `Here's what you want: • product: X … But no incoming matched these.` / plain `Could not find …`.
   The breakdown one is the worst — announces success, then retracts. **Pre-existing, not caused by this
   change.** Own diff: touches `not-found-error-message` (247L) + `build-suggest-offer` (416L), and the
   escalate phrase is a regex contract.
4. **Attachment on cross-domain incoming** — ✅ **NOW PLANNED: `plans/crossdomain-attachment-plan.md`
   + `tests/UAC.md` §XA (user-approved 2026-08-04). Ships SEPARATELY, AFTER this change.** ⚠️ That
   investigation found this item's premise incomplete: on a TOTAL-MISS turn `central-exchange` never
   executes (`If6[1]`), so the entire attachment chain is unreachable there — the fix is a re-root, not a
   merge. See that plan §1. Original note below. — the probe ALREADY returns the packing list
   (`FFAU3176932.xlsx`, proven in exec `11033897`); we discard it. Sending it is an **egress path** whose
   senders are deliberately orphaned on the clone, so it needs its own change + egress review.
5. Reviewer pass, then user-gated promote.

---

## 6. Promote checklist (user-gated — do NOT promote unprompted)

- [ ] Backup live `activeVersionId` first.
- [ ] Remap `crossdomain-probe.workflowId`: `rysSPgUssLDf6xJc` → **`Fss5aAaXthJSWpZCgKiKR`**.
- [ ] **🚩 REPOINT THE LIVE SEND NODE.** `sorento-sub-respond-sendmsg-respond2` reads
      `$('compile-current-state').first().json.{user_response,quick_reply,variables.last_result_set}`
      **BY NAME**. Rewiring alone is INERT — this cost a debugging cycle. Repoint all three to
      `crossdomain-compose`, or the feature ships invisible while every test looks green.
      (Verified: it is the ONLY by-name consumer of those fields.)
- [ ] Port `compile-current-state` = live 528L + hoist (→459L) + domain-aware noun.
- [ ] Target nodes by NAME, not clone IDs; strip trailing whitespace.
- [ ] `publish_workflow` after `update_workflow` (MCP edits land on DRAFT).
- [ ] Post-promote smoke: `Pls check eta SRTWT5800`.

### ⚠️ Tell the reviewer this
The earlier invariant "#3's output is byte-identical to live" **no longer holds**. It is byte-identical on
**inventory** turns only. On **incoming** turns the noun changed (`No incoming records found for: …`) — a
deliberate, user-approved fix for a pre-existing bug where the line said "stock" but meant incoming. A reviewer
diffing #3 against live will otherwise flag it as a regression.

---

## 7. Landmines learned this session (all cost real time)

1. **Post-publish race** — a run fired seconds after any write can execute the PREVIOUS version and return the
   pre-change message. **It produced a FALSE PASS on FP1.** Always discard the first run after a write.
2. **`$('node-name')` beats wiring** — a consumer reading a node BY NAME ignores your rewiring entirely.
   Grep for by-name consumers before assuming a splice took effect.
3. **Empty envelope ≠ absence** — `sub-get-results` returns the SAME empty envelope for "nothing there" and
   "the read failed". Proven: a bogus tool name made the bot print "none on hand" for a product holding
   564 pcs. Drove decision (d): **positive facts only, never assert an absence you didn't verify.**
4. **CRM row order is NOT stable** between calls — same product returned locations in different orders.
   Sort deterministically, never inherit presenter order.
5. **REST beats MCP for big code edits** — the 403 was Cloudflare blocking urllib's UA (use curl's).
   GET does NOT redact credentials; PUT auto-publishes; PUT's `settings` schema is narrower than storage
   (send `{executionOrder, callerPolicy}`; the server preserves `binaryMode`/`availableInMCP`).
   Re-verify S-CRED after every PUT (`postgres:n8n_test-db` ×3, never prod).

---

## 8. Key design decisions (full table in plan §1)

- **Tell, don't offer** — needs zero parser change.
- **Escalate team = origin domain** even when both axes are empty (incoming→purchasing, inventory→warehouse).
- **E1 reconciliation** — the phrase `Would you like me to escalate to {team} team?` is a **frozen regex
  contract** read by the parser's `output_exchange` against `previous_conversation_state.response`. It must be
  appended to **BOTH** the visible text and the state. Reword it and "yes" silently stops working (FP2 proves it).
- **Bullets, never numbers** — numbers are D3's contract with `last_result_set`; a stray `2` must still pick a
  sibling (X8 confirms).
- **Display-only** — `last_result_set` / `selection_context` untouched.
- **No per-agent access re-check** (user-accepted risk): `incoming`→`incoming_stock_enquiries` and
  `inventory`→`general_enquiries` are different agents. Stated assumption: stock+incoming = one entitlement.
  Row-level `access_levels` scoping still applies.
- **Uncapped** — every location/shipment renders; truncation could hide the only stock reachable from a
  person's own location.
