# UAC §XA

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §XA — ⚠️ SCOPE NARROWED 2026-08-04 (user decision). Read before running anything.

The **"delivered exactly once"** framing is **WITHDRAWN**, and **§XA-FP1 is DROPPED**.

**Why (user, 2026-08-04):** duplicate suppression is already handled, three ways —
1. **Single root (structural).** `central-exchange[0] → if-got-attachments` was CUT; only `attach-merge`
   feeds the chain. The double-send FP1 chased existed *only* because FP1 artificially re-added the old edge.
2. **`Remove Duplicates`** on `url`, within the run.
3. **The CRM already de-dupes** on `(url, filename)` upstream (`sorento_crm_mcp/presenters.py:696-707`).

Plus main-answer and probe attachments can never both be non-empty — a turn has ONE `domain_hint`.

⚠️ **Keep straight which layer protects you:** `Remove Duplicates` dedupes *within a single chain run*. It
would NOT save you if the chain ran twice. That case is excluded **structurally** (one root), not by dedupe.
If anyone ever adds a second root, this protection is gone and nothing here will catch it.

**Empirically established before the withdrawal:** an induced genuine double-send still read **A-COUNT = 1**.
So A-COUNT is **not** a double-send detector, exactly as §XA-FP1's own escape hatch predicted. Do not use
A-COUNT to assert cardinality of any kind until it is re-instrumented.

### What §XA still has to prove
The remaining risk is **the feature silently not working**, not double-sending:
- **PRESENCE** — a file actually arrives on a cross-domain turn (**§XA.1**) and the pre-existing direct-eta
  turn still delivers after the re-rooting (**§XA.9** — highest value; its failure mode is *0 files with a
  green execution*).
- **NO SILENT CAP** — N containers ⇒ N files (**§XA.5**). The user explicitly accepted N files; a silent cap
  would be a quiet breach of that.
- **NEGATIVE CASES** unchanged — **§XA.6** (on-hand ⇒ no file), **§XA.7** (both empty ⇒ no file, no block).
- **PRESIGN FAILURE** (§A6 / **§XA-FP4**) — unchanged and still mandatory: a dropped file now leaves the
  customer reading *"I have attached the file(s) below."*, so this is the one path where a failure makes the
  bot state something **false**.

### Re-instrument before asserting any count
Do not count via A-COUNT. Count **`would_send` records in `test:egress:{test_run_id}`, keyed by `filename`** —
`guard-e/f/g-record` already write `presigned_url` + `filename`, one record per delivered file. Corroborate
with `runData['guard-g-record']` run count. Presence assertions (0 vs ≥1) are the floor; cardinality
assertions are only valid once this replacement is shown to distinguish 1 from 2 on a deliberately doubled
fixture.

---

## §XA.0 — How these cases are driven, and three rules that decide whether the results mean anything

**Driver: `tests/harness/drive-clone.py` (→ `zz-canary-run`, `POST /webhook/zz-run-hint`, mode `uac`).
NOT the chat console.** `guard-e/f/g-record` key their egress list off
`$('redis-pop-main-message-list').first().json.message.test_run_id`, which the console lane never seeds —
a console run produces no usable `test:egress:{…}` key. The console (`zz-chat`,
`https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`) is for a human
to **eyeball the 📎** via `chat-attach-push`, and for nothing else.

1. **Discard the first run after any workflow write.** A run fired seconds after a publish can execute the
   previous version. This already produced one false PASS on the sibling change.
2. **Record `case → executionId` for every case.** The `cross-domain-stock-incoming` review could not
   attribute most of its GREENs to a build. Do not repeat that.
3. **Never assert on execution status.** `get-presigned-url` has `onError: continueErrorOutput` with an
   **unwired `main[1]`**, and the CRM returns 404 for a path with no attachments row
   (`presigned_require_attachment_row`, `config.py:90`). A dropped file leaves the execution `success`.
   Assert **per-node runData** (LESSONS §61a).

**The four assertions every file-bearing case must carry** (all four, or the case is incomplete):

- **A-COUNT** — number of `{"kind":"would_send","guard":"send-message-files|images|video"}` entries in
  `test:egress:{test_run_id}` equals the expected N. Count entries, not "at least one".
- **A-NAME** — each entry's `payload.filename` and `payload.presigned_url` match the expected file;
  `presigned_url` is well-formed and carries `X-Amz-Signature`.
- **A-NODES** — `get-presigned-url` runData: run count == N, **every** run `executionStatus:"success"`.
  `Loop Over Items1` run count == N+1. `Switch` run count == N.
- **A-ORDER** — `executionIndex(sorento-sub-respond-sendmsg-respond2) < executionIndex(if-got-attachments)`.
  Text before file. (Baseline: exec `11081877` 42 < 47; exec `11081513` 44 < 48.)

**Ground truth (live CRM, drifts — re-verify before the run):**

| fixture | expect today |
|---|---|
| `SRTWC286-SH-NEW-200` | no on-hand stock; incoming 200 pcs, ETA 2026-07-22, container `FFAU3176932`, attachment `FFAU3176932.xlsx` (`https://cdn-sorento.com/packing_list/580150de-a767-4dde-a133-de5e31ccb90d/FFAU3176932.xlsx`, `…spreadsheetml.sheet`) |
| `SRTWT5800` | no incoming; on-hand in 6 locations; inventory envelope `attachments: []` |
| `SRTWT5800-FH` | no incoming AND no stock (both-empty) |
| `SRTWT5801` | on-hand 883 @ BRW; `attachments: []` |
| `SRTUB6213` | certification turn, 2 PDFs (the pre-existing attachment regression fixture, exec `11081877`) |

---

## §XA.1 — Total miss, single product → file delivered exactly once  ★ PRIMARY
- **Trigger:** `check stock SRTWC286-SH-NEW-200` · `437264483` · `scope: deterministic`.
- **Expect-branch:** `validator(has_result:false)` → `crossdomain-zeroset(_xd.active:true, origin=inventory)`
  → `crossdomain-gate` TRUE → `crossdomain-probe` → `crossdomain-render(_xdBlock.any:true)` →
  `If6` output **1** → `Aggregate1` → … → `cs-offer-gate[1]` → `compile-current-state` →
  `crossdomain-compose` → `sendmsg2` → **`attach-merge`** → `if-got-attachments` TRUE → `Edit Fields` →
  `Split Out` → `Remove Duplicates` → `get-presigned-url` → `Loop Over Items1` → `Switch` out **2** →
  `guard-g-record`.
- **Expect-output:** **A-COUNT = 1**, A-NAME = `FFAU3176932.xlsx`, A-NODES (1/2/1), A-ORDER.
  `central-exchange` has **no runData** (the miss branch — this is the whole point of the change).
  `attach-merge.attachments.length === 1`, sourced entirely from `_xdBlock.attachments`.
- **Also assert:** the delivered `user_response` still contains the frozen phrase
  `Would you like me to escalate to warehouse team?` byte-unchanged, and the block still sits above it.
- **Safety:** §0 all. S1 focus: `send-message-files/images/video` inbound count still **0** in the deployed
  clone JSON.

## §XA.2 — Partial inventory turn → file delivered exactly once
- **Trigger:** `check stock SRTWT5801 and SRTWC286-SH-NEW-200` · `437264483` · `deterministic`.
- **Expect-branch:** answered branch — `If6` output **0** → `central-exchange` runs; `_xd.missing` =
  `[SRTWC286-SH-NEW-200]`; `crossdomain-compose` takes the **isAnswered** arm (block + phrase +
  `Yes escalate,No it's okay` quick replies).
- **Expect-output:** **A-COUNT = 1** (`FFAU3176932.xlsx`), A-NAME, A-NODES, A-ORDER.
  `attach-merge.attachments` = `[]` (from `central-exchange`, inventory answer) **+** 1 (from the block).
- **Safety:** §0 all.

## §XA.3 — Partial INCOMING turn where the main answer already carries the same file → exactly once  ★
- **Trigger:** `check eta for SRTWT5800 and SRTWC286-SH-NEW-200` · `437264483` · `deterministic`.
  (This is the turn the change request named as the duplicate risk.)
- **Expect-branch:** `origin = incoming`. Main answer covers `SRTWC286-SH-NEW-200` **with** its xlsx;
  `_xd.missing = [SRTWT5800]`; probe = **inventory** → `attachments: []`.
- **Expect-output:** **A-COUNT = 1**, A-NAME = `FFAU3176932.xlsx`, A-NODES (1/2/1), A-ORDER.
  **And the provenance assertion:** `attach-merge` runData shows the entry came from `central-exchange`
  (main answer), and `crossdomain-render._xdBlock.attachments` is `[]`. If the file were counted twice the
  block side would have to have contributed — assert it did not, so a PASS here cannot be produced by two
  cancelling errors.
- **Note:** this case is expected to be **inert** — behaviour identical to pre-change. Its value is
  entirely in proving the duplicate cannot arise; it is meaningless on its own and must be read next to
  §XA.1 (LESSONS: a no-op passes on an inert build).
- **Safety:** §0 all.

## §XA.4 — Two missing products, ONE container → dedupe on `url`
- **Trigger:** a `check stock A and B` turn where A and B are both empty on hand and both ship in
  container `FFAU3176932` (pick the pair from the live CRM at run time — verification task **V1**).
  · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 1** — one file, not two. Record `Split Out` output item count and
  `Remove Duplicates` output item count **separately**: if Split Out already emitted 1, the CRM deduped at
  envelope level and `Remove Duplicates` did nothing. **Record which**, do not report "dedupe works"
  without it. FPA-2 settles it.
- **Safety:** §0 all.

## §XA.5 — Multiple missing products, DIFFERENT containers → N files, nothing silently capped
- **Trigger:** a `check stock A, B, C` turn where ≥2 of them are empty on hand with incoming in
  **different** containers · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = N** where N = distinct `url`s in the probe envelope. Record N.
  A-NODES with that N (`Loop Over Items1` = N+1 runs). Assert **no truncation**: every distinct `url` in
  `crossdomain-render._xdBlock.attachments` appears in the egress log.
- **Also assert (the §3.3 residual):** every delivered filename corresponds to a product that actually
  appears in `_xdBlock.block`. A file for a probed-but-unrendered product is a **finding**, not a pass.
- **Safety:** §0 all.

## §XA.6 — On-hand direction (origin = incoming) → NO file from the block
- **Trigger:** `check eta SRTWT5800` · `437264483` · `deterministic`.
- **Expect-branch:** `origin = incoming`, probe = `crm_inventory_stock_balance_list`, block renders the
  6 on-hand locations.
- **Expect-output:** **A-COUNT = 0.** `if-got-attachments` FALSE. `get-presigned-url` run count **0**.
  `crossdomain-render._xdBlock.attachments === []`. The text block is unchanged from the
  `cross-domain-stock-incoming` baseline **byte-for-byte**.
- **Safety:** §0 all.

## §XA.7 — Both axes empty → no file, no block  (decision (d))
- **Trigger:** `check stock SRTWT5800-FH` · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 0**; `get-presigned-url` runs **0**; `if-got-attachments` FALSE or not
  executed; `_xdBlock = {block:"", any:false, …}`; `crossdomain-compose` returned the item unchanged;
  **no `_xdApplied` key** (F2 stays discharged); message byte-identical to the pre-change baseline.
- **Read next to §XA.1** — this passes on a completely inert build and proves nothing alone.
- **Safety:** §0 all.

## §XA.8 — No-op turns → `attach-merge` is byte-equal to today's source
- **Triggers (one run each, `437264483`, `deterministic`):**
  (a) non-{inventory,incoming} domain (an order or promotion enquiry);
  (b) non-`business_query` (a casual/thank-you turn);
  (c) fully answered inventory turn, nothing missing (`check stock SRTWT5800`);
  (d) container-only turn (`FFAU3176932`);
  (e) a `require_specific` / disambiguation turn;
  (f) a no-access turn (contact `457216562`).
- **Expect-output:** for every one — `attach-merge.attachments` **deep-equals**
  `central-exchange.attachments` (same order, same objects) when `central-exchange` ran, and `[]` when it
  did not. A-COUNT equals the pre-change baseline for that turn (normally 0). `crossdomain-render` never
  executed.
- **Safety:** §0 all. (f) additionally asserts S1/S2 on the no-access path.

## §XA.9 — REGRESSION: existing attachment turn survives the re-rooting  ★ HIGHEST-VALUE
- **Trigger:** the certification turn that produced exec `11081877` (2 PDFs for `SRTUB6213`) ·
  `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 2**, same two filenames, **same order** as the pre-change baseline;
  A-NODES (`get-presigned-url` 2 runs both success, `Loop Over Items1` 3 runs, `Switch` 2 runs); A-ORDER.
- **Why this one matters most:** the change moves the trigger of the attachment chain for *every* existing
  file turn. If `attach-merge` mis-sources or the repointed `Edit Fields` is wrong, this goes to 0 files
  **with a green execution**. Run it on every build.
- **Safety:** §0 all.

## §XA.10 — Probe soft-fail → no file
- **Trigger:** §XA.1's message with `crossdomain-probe` forced into its degraded path (bogus tool string
  or a forced sub error; `onError: continueRegularOutput` means it still emits an item).
- **Expect-output:** `_xdBlock.degraded === true`, `any === false`; **A-COUNT = 0**;
  `get-presigned-url` runs 0; message byte-identical to the pre-change baseline (fail-silent, plan F1).
- **Safety:** §0 all.

## §XA.11 — Frozen-phrase + marker contract untouched
- **Trigger:** re-use §XA.1, §XA.2 and the F1 multi-token turn `check stock CSS8800, SRT393B-18, SRTMRL707`.
- **Expect-output:** `crossdomain-compose.user_response` is **byte-identical** to the
  `cross-domain-stock-incoming` baseline for each of those turns (this change adds no text — unless
  `D-ATTACH-MENTION` is taken, in which case re-baseline X1/X3/T1 and say so explicitly in the run log).
  The block still sits **above** the escalate question on the multi-token turn.
- **Safety:** §0 all.

---

## §XA-FP — Fail-on-purpose: prove each assertion can go RED

Per `green-that-cannot-fail`: an assertion never shown to fail is not an instrument. Each FPA below is
**induced on the clone, observed red, then reverted**, and the reverted state re-verified by re-running the
matching positive case. Record the executionId of both the red run and the restored run.

### §XA-FP1 — ~~"delivered exactly once" can detect a DOUBLE send~~  **DROPPED 2026-08-04 (user decision)**

**Do not run this case.** Duplicate suppression is handled structurally (single root) + `Remove Duplicates`
+ CRM-side dedupe — see the §XA scope banner at the top of this section. Kept below for the record only,
because running it once already paid for itself: it induced a real double-send and **A-COUNT still read 1**,
proving the counting instrument is blind. That finding is why cardinality assertions now require the
`test:egress` + `filename` replacement instead.

⚠️ It also cost an incident: the agent running it was killed mid-case, reverted the **draft** but never
published, and left the clone's **ACTIVE** version carrying the injected second root. A REST GET looked
clean; only `.activeVersion.connections` showed it. Any graph-mutating case must publish both the mutation
and the revert (or use REST PUT, which auto-publishes).

<details><summary>original case (do not run)</summary>
- **Induce:** temporarily **re-add** `central-exchange`[0] → `if-got-attachments` while keeping
  `attach-merge`[0] → `if-got-attachments`. Both roots now fire on the **answered** branch.
- **Run:** §XA.3 (`check eta for SRTWT5800 and SRTWC286-SH-NEW-200`) — an answered turn that carries a file.
- **Expect RED:** `if-got-attachments` runs **twice**; `get-presigned-url` runs 2×; **A-COUNT = 2** with the
  **same** `filename` twice. If A-COUNT still reads 1, the counting assertion is broken — fix the assertion
  before trusting any XA case.
- **Restore:** cut the extra edge; re-run §XA.3 → A-COUNT back to 1.
- **Note:** `Remove Duplicates` does **not** save you here — the two roots produce two separate
  *executions of the chain*, and dedupe is within a single node run. That is exactly why this fixture is
  the right one.
</details>

### §XA-FP2 — is `Remove Duplicates` actually load-bearing?
- **Induce:** `setNodeDisabled` on `Remove Duplicates`.
- **Run:** §XA.4 (two products, one container).
- **Expect:** A-COUNT rises 1 → 2 ⇒ the node is doing the work. If A-COUNT **stays 1**, the CRM already
  deduped at envelope level ⇒ record that as the true reason and downgrade the §XA.4 claim from "our dedupe
  works" to "no duplicate is produced upstream". Either outcome is a valid result; **silently reporting the
  first is not.**
- **Restore:** re-enable; re-run §XA.4.

### §XA-FP3 — the by-name repoint is load-bearing (the silent-zero failure)
- **Induce:** revert `Edit Fields` to `={{ $('validator').first().json.attachments }}`, keep the new wiring.
- **Run:** §XA.1.
- **Expect RED:** `Split Out` emits **0** items; **A-COUNT = 0**; `get-presigned-url` runs 0 — while the
  block is present in the text and the execution reports **`success`**. This is the demonstration that a
  status-based check would have scored this build green.
- **Restore:** repoint to `={{ $json.attachments }}`; re-run §XA.1 → A-COUNT 1.

### §XA-FP4 — a silent presign failure is detectable
- **Induce:** point `get-presigned-url` at a `file_path` with no attachments row (the CRM returns 404 under
  `presigned_require_attachment_row`), leaving `main[1]` unwired as it is today.
- **Run:** §XA.1.
- **Expect RED:** `get-presigned-url` run 1 with `executionStatus:"error"`; **A-COUNT = 0**; execution
  status still **`success`**. Assert that **A-NODES catches it and a status check does not.**
- **Restore:** revert; re-run §XA.1.

### §XA-FP5 — decision (d) can be broken
- **Induce:** temporarily drop the `xb.any !== true` guard in `attach-merge` so it forwards
  `_xdBlock.attachments` regardless.
- **Run:** §XA.7 (both empty) and §XA.10 (soft-fail).
- **Expect RED:** a file (or at minimum a `get-presigned-url` run) appears on a turn that says nothing.
  Confirms §XA.7/§XA.10 are not passing merely because the build is inert.
- **Restore:** re-add the guard; re-run both.

### §XA-FP6 — the S1 orphan assertion can go red
- **Induce:** in a **scratch copy** of the clone (never the clone itself), add
  `Switch`[2] → `send-message-files`.
- **Expect RED:** the inbound-edge census reports `send-message-files` inbound = 1.
- **Purpose:** proves the S1 instrument reads the deployed connection map rather than echoing an
  expectation. Discard the scratch copy.

---

### Coverage (this change)

| requirement | case |
|---|---|
| single-product cross-domain incoming, file delivered once | §XA.1 |
| partial turn where main already carries the same file, delivered exactly once | §XA.3 + §XA-FP1 |
| multi-product fan-out, N files, nothing capped | §XA.5 (+ §XA.4 for the same-container collapse) |
| on-hand direction, no file | §XA.6 |
| both-empty, no file and no block (decision (d)) | §XA.7 + §XA-FP5 |
| no-op turns unchanged | §XA.8 |
| existing attachment turns unchanged (the re-rooting regression) | §XA.9 |
| probe soft-fail | §XA.10 |
| frozen phrase / marker placement untouched | §XA.11 |
| assertions on the egress log, not the chat rendering | §XA.0 A-COUNT / A-NAME (all cases) |
| text before file | §XA.0 A-ORDER (all file-bearing cases) |
| every critical assertion shown red | §XA-FP1…FP6 |

**Tier:** `deterministic`. §XA.3, §XA.4, §XA.5 and §XA.8(a)(b)(e) need real classification to reach the
right domain/branch — declare those as **parser-tier runs of a deterministic change** so they do not
pollute the S6 zero-LLM count (same convention as the `tool-loop-removal` section).

**Blocked / not covered on the clone — carry to post-promote (LESSONS §56):**
- The **real send** is unprovable here: `send-message-files/images/video` are orphaned by design, so every
  case above proves the *decision* to send, never the send. Post-promote smoke on the cross-domain path
  **and** on a pre-existing certification turn is mandatory.
- **Partial-access behaviour** remains blocked — no partial-access test contact exists. This is now
  load-bearing, not cosmetic: **RISK-A1** (plan §7) is precisely a partial-entitlement question, and it
  cannot be exercised until that contact exists. Flag as a **prerequisite**, not a gap.
- The **live `save-session-vars` PUT** is a different node from the clone's `pg-upsert-session`. This change
  writes nothing onto `crossdomain-compose`'s item, so the PUT body should be byte-identical — verify it on
  one real turn post-promote rather than trusting the reading.
