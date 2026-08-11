# PROMOTE ORDER — three stacked changes, all APPROVED (2026-08-04)

All three now carry a reviewer APPROVE. **They are NOT independent — the order below is load-bearing.**
User gate: promote only on explicit go, one step at a time, verifying between steps.

Live spine `9qVyfUxmRQqrpGRMDLRuz`, currently `a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, draft == active.
Clone `txiPzSxy3Pclsz6v` @ `a5cf2434-83b6-455b-b9a4-79e3b4162f19`, draft == active.

| # | change | review | verdict |
|---|---|---|---|
| 1 | `tool-loop-removal` | `tests/reviews/tool-loop-removal.md` | **APPROVE** |
| 2 | `cross-domain-stock-incoming` | `tests/reviews/cross-domain-stock-incoming-rereview.md` | **APPROVE** (supersedes the 2026-08-03 REQUEST-CHANGES) |
| 3 | attachment + presign error path | `tests/reviews/crossdomain-attachment.md` | **APPROVE**, conditional on its checklist |

---

## Why this order, and why it cannot be reshuffled

**#1 must go first (re-reviewer constraint N1).** Live still has `Split Out1` / `Loop Over Items`, so the F4
hazard — a turn that *answered* also claiming cross-domain stock and arming the escalate offer — is **live-real
on multi-tool turns**. Live exec `11049139` returned 2 tools. The current 1-tool state arrived via **embedding
data, not a workflow change, and can revert at any time.** Promoting #2 before #1 ships a known
customer-facing defect that today's data merely masks.

**#3 must not be split from its own mention (attachment reviewer).** Live's `get-presigned-url` has
`main[1]` unwired — a dropped file is silent on production *today*. Once the `I have attached the file(s)
below.` sentence ships, a silent drop becomes the bot **stating something false**. The notice node + edge must
land in the same promote as the mention.

**#2 and #3 are entangled in one node (N2 — the trap).** `crossdomain-render`'s **deployed body already
contains the attachment change** (`ATTACH_NOTE` / `XD_FILES`). Promoting #2 with the deployed body would make
live say *"I have attached the file(s) below."* **with no delivery chain behind it.**

- clean pre-attachment body (verified): sha256[:12] **`5c0067a97d36`**, 5968 bytes / 5786 chars
- source: `backups/clone-txiPzSxy3Pclsz6v-a0f434f9-20260804-xdattach-before.json`
- extract with `jq -j` (NOT `jq -r` — it appends a newline and changes the hash)
- that body has the reworded lead-in and **no** `ATTACH_NOTE` ✓

**Either** promote #2 with the clean body and #3 with the full body, **or** promote #2+#3 together with the
full body. Never #2 alone with the deployed body.

---

## Step 1 — `tool-loop-removal`

- [ ] **P1 (re-confirm at promote time):** a live inventory execution returns `tools.length === 1`.
      Verified 2026-08-04 07:2x across 6 live inventory turns, all `crm_inventory_stock_balance_list`.
      This rests on embedding-registry state that can revert — re-check, don't assume.
- [ ] **P4:** live-write permission allow-rules (user must add; cannot self-grant).
- [ ] Backup live `a40cd16d`; confirm draft == active before writing.
- [ ] Cut `Split Out1`, `Loop Over Items`. Add **`If6 out1 → Aggregate1`**. Live wires
      `tool-filter → Call 'sub-get-results'` **direct** (no `replay-get-results` harness hop).
- [ ] `tool-filter` = whole-body replace (live sha `54ac512b…` was byte-identical to clone-pre; re-verify).
- [ ] `build-suggest-offer` target is **pre-built and hashed**: 418 lines, 24040 chars, sha
      `8a2943ec6008aa3b23230a67c56639509d0851a09fbeb1d5fa7cf0a941c23f06` = live's 416-line body with L295–296
      replaced. **Do NOT copy the clone's 417-line body** (ships two comment reflows, drops a trailing blank).
- [ ] **`crossdomain-probe.executeOnce` removal is NOT promotable** — that node does not exist on live yet.
      A promote built mechanically from "the clone's delta" will abort here.
- [ ] Target by NAME. Plan §5's clone id for `tool-filter` is **wrong** (`5c40413a` is live's) — use diff-doc §9.1.
- [ ] Smoke (read-only): `check stock SRTWT5800`, then a **miss** turn — the miss path is the risk.

## Step 2 — `cross-domain-stock-incoming`

- [ ] Backup live again (post-step-1 version).
- [ ] Remap `crossdomain-probe.workflowId`: `rysSPgUssLDf6xJc` → **`Fss5aAaXthJSWpZCgKiKR`**.
- [ ] 🚩 **Repoint live `sorento-sub-respond-sendmsg-respond2`'s three by-name reads**
      `$('compile-current-state').first().json.{user_response, quick_reply, variables.last_result_set}` →
      `$('crossdomain-compose')`. **Rewiring alone is INERT** — this cost a debugging cycle once already.
- [ ] **Rewire BOTH live consumers** of `compile-current-state`: `save-session-vars` **and** the send node
      (live has two, not the clone's three). Omit `save-session-vars` and the E1 state append never persists.
- [ ] Decide `Call 'sub-respond-save-message-redis'2` (`state_trace.after`): repoint to `crossdomain-compose`,
      or record the logged-vs-persisted divergence deliberately.
- [ ] `crossdomain-render`: use the **clean** body `5c0067a97d36` if shipping without step 3.
- [ ] Port `compile-current-state` as **live's body + the 2 verified hunks only**.
- [ ] Do NOT copy `is_test` anywhere.
- [ ] Smoke: `Pls check eta SRTWT5800` (read-only). **Do NOT smoke the `yes` leg on a real contact** — the
      phrase now arms on turns that returned data, so a bare `yes` is a real staff-assignment ripple.

## Step 3 — attachment + presign error path

- [ ] **V4 blast-radius estimate** (reviewer prerequisite, answerable offline): how many live turns/day newly
      send a file.
- [ ] Cut `central-exchange[0] → if-got-attachments`; add `sendmsg2[0] → attach-merge → if-got-attachments`.
- [ ] Repoint `if-got-attachments` gate and `Edit Fields` payload to `$json.attachments`.
- [ ] `get-presigned-url.main[1] → presign-fail-notice → <sender>`.
- [ ] 🚩 **The sender must NOT be block-copied** (LESSONS §48): on live it needs
      `workflowId = aoydkG1dbItXR5jXFEQsP`, **no `is_test`, no `test_run_id`**.
- [ ] Precondition verified by the reviewer on live execs `11168257` / `11166419`: live's sendmsg sub emits
      **1 item** on `main[0]`. The whole chain depends on it. Re-verify if live's sendmsg sub changes.
- [ ] Smoke: `check eta SRTWC286-SH-NEW-200` — a **real file send to the test contact**. This is the only
      path the clone cannot exercise (senders orphaned by design), so it is **mandatory**.

---

## Ships unverified — accept knowingly

- **E1 state-append half** — never exercised: the clone writes via `pg-upsert-session`, live via an HTTP PUT.
  Verify on the first real partial turn after step 2.
- **The real file send** — orphaned on the clone by construction. Step 3's smoke is the first real test.
- **RISK-A1 partial access** — accepted **unmeasured** (user re-consent 2026-08-04): the packing list reaches
  contacts with stock-but-not-incoming access and covers the whole container. No partial-access test contact
  exists, so this cannot be tested at all.
- **Dedupe ownership** — §XA.4/FP2 were dropped by user decision; no claim is established about which layer
  owns it. Protection is single-root (structural) + `Remove Duplicates` + CRM-side dedupe. **Adding a second
  root later would defeat it silently.**
- **Apology on the cert population** — mechanism verified, never actually fired.
- **AND-mode / DYM-PICKED-strict zeroset branches** — code-equivalent, still unsampled. The run log's §TL-R11
  claim that AND-mode is established is **withdrawn** by the re-reviewer: `resolve-entity` returned
  `fallback_match_mode:"or"`, so the parser's `match_mode:"and"` is not the resolver's branch selector.

## Recorded, NOT to be fixed or bundled

- **P0:** live's `Call 'sub-get-results'` + `probe-incoming` → `rysSPgUssLDf6xJc` (`sub-get-results TEST`),
  while `sibling-probe` → `Fss5aAaXthJSWpZCgKiKR`. **Live is split.** Byte-identical today, so no defect —
  but any "harness-only" edit to that fork is an ungated live change that passes §0. Separate user-gated change.

## Doc debt (not promote-blocking)

- UAC §XA.0 / §XA.9 assert `get-presigned-url` run count == N. **Wrong** — it runs once with N items. A future
  tester following it literally scores a correct build RED on N≥2. Fix with F-1 before the next §XA run.
- §XA-FP4's `executionStatus:"error"` prediction is un-failable — the node reports `success` with 0 items on
  `main[0]`. Assert item counts per output, never status.
- `tests/harness/crossdomain-render.reference.js` still stale (3960 vs 7576 chars, no `LEAD`). Re-sync or delete.
- `marker-proof.js` never asserts or exits non-zero — it is a demonstration, not a gate.

## Rollback

Any step: `publish_workflow` with the prior `activeVersionId`. Instant, no downtime (see
`tests/pre-promote-manual-tests.md` §9 — ingress is a separate workflow, messages queue in redis, the
per-contact lock releases on both success and error paths plus a 120s TTL).
