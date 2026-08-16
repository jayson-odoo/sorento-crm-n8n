# Run log — `crossdomain-attachment` · narrowed §XA suite

**Date 2026-08-04. Target: clone `txiPzSxy3Pclsz6v` ONLY. Nothing promoted. No workflow edited except the two
deliberate §XA-FP faults, both reverted and re-verified (see §6).**

| | |
|---|---|
| clone at start | `dacf9224-eb80-46e9-b0ed-a2b27d218cf5` — `versionId == activeVersionId`, 141 nodes, `active:true` |
| clone at end | `a5cf2434-83b6-455b-b9a4-79e3b4162f19` — `versionId == activeVersionId`, **content byte-identical to `dacf9224`** (see §6) |
| live spine at start | `9qVyfUxmRQqrpGRMDLRuz` @ **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`**, `updatedAt 2026-08-02T23:34:18.534Z`, 101 nodes |
| live spine at end | **identical** — same versionId, same `updatedAt`. Live never written, never read for writing. |
| driver | `tests/harness/drive-clone.py` → `POST /webhook/zz-run-hint` (`zz-canary-run VtIV3TF3aw2Fx8No`), mode `uac`, contact `437264483`. Chat console NOT used. |
| scope | narrowed per the §XA banner (2026-08-04). **§XA-FP1 NOT run. A-COUNT not used for any cardinality claim.** |

**Cardinality instrument (the A-COUNT replacement).** Every count below is the number of
`{"kind":"would_send","guard":"send-message-files|images|video"}` records in `test:egress:{test_run_id}`,
keyed by `payload.filename`, corroborated by `runData['guard-g-record']` run count. It was shown to
distinguish **0 / 1 / 2 / 6** on this build (0 = exec `11163516`, 1 = `11162665`, 2 = `11163146`,
6 = `11162850`), so it is a real instrument, not an assertion that can only read 1.

> ⚠️ **Reader caveat discovered this run:** the *order* of rows returned by `read-egress` is **not**
> chronological (`fp4a-01` shows the apology row before the main-answer row that preceded it in time).
> Count from the egress list; take **ordering** only from `guard-*-record` run order and `executionIndex`.

---

## 0. Safety gate (§0 S1–S7) — asserted on every run, all PASS

| id | assertion | evidence |
|---|---|---|
| **S1** | zero real WhatsApp/comment sends | `send-message-files` / `-images` / `-video` inbound = **0** in the deployed connection map, re-asserted **4×** (pre-mutation, fault-induced, FP-B-induced, final). Every `sub-sendmsg-CHAT` invocation short-circuits: sub runData = `[When Executed by Another Workflow, chat?, test-guard, test-guard-record]` — **no real-send node ever executed** (checked on sub execs `11164238`, `11164082`, `11164067`). No `api.respond.io/.../message` call anywhere. |
| **S2** | zero assignment/escalation writes | no assign / SLA POST / PIC-comment / assignee-queue node in any runData; `sub-human-intervention` not invoked on any case in this suite. |
| **S3** | zero CRM/contact writes | `save-session-vars` inbound = **0** (orphan) and `update-human-intervened` inbound = **0**, both re-asserted 4×. The only session artefact is the `save-session-vars` **`would_write`** guard record. |
| **S4** | get-results ran no write tool | `sub-get-results TEST` (`rysSPgUssLDf6xJc`) runData on execs `11164291/11164237/11164236` = `[trigger, entity-ids-transformer, MCP Client1, output-structurer]`. Resolved `tool` ∈ {`crm_incoming_stock_list`, `crm_inventory_stock_balance_list`} — READ only. **`crm_it_support_ticket_create` never appears.** |
| **S5** | `test_mode` provably present | trigger carries `test_mode:true` + `test_run_id`; sendmsg sub received `is_test=True` (all 3 sampled sub execs, with the matching `test_run_id`); reformulator fork `wI5RkNGW3EOJfBdo` received `is_test=True` (exec `11164228`). |
| **S6** | token sinks bounded by scope | **no LLM node executed in the spine on any of the 30 executions** (`Basic LLM Chain`, `OpenAI Chat Model`, `AI Agent` all absent from spine runData). Spend = 1 reformulator sub call/turn (parser-tier, as UAC §XA permits) + the get-results sub, which spends **0** (see finding **F-3**). |
| **S7** | prod ingest not touched (sink-delta + attribution, LESSONS §45) | per-run `LLEN sorento-respond-message` **0 → 0** on every run; harness sink `sorento-respond-message-TEST` **+1 exactly per run** (513→519 across 6 consecutive runs). Attribution: the +1 is the message-logger fork's RPUSH, on a list no consumer reads. |

Every egress row across all 30 executions was `would_log` / `would_write` / `would_send`. **Zero real egress.
Gate holds; no halt condition was reached.**

---

## 1. Results — the narrowed case list

| case | trigger | executionId | verdict |
|---|---|---|---|
| **§XA.9 ★** re-rooting regression (direct eta) | `check eta SRTWC286-SH-NEW-200` | **`11162612`** | **PASS** |
| **§XA.9b ★** re-rooting regression (UAC's named cert fixture) | `certification for SRTUB6213` | **`11163255`** (re-run post-teardown `11163932`) | **PASS** |
| **§XA.1 ★** presence on a cross-domain turn | `check stock SRTWC286-SH-NEW-200` | **`11162665`** (re-run post-teardown `11163910`) | **PASS** |
| **§XA.5** N containers ⇒ N files, no silent cap | `check stock MWB7621, SRTWB243-35MM, SRTWC286-SH-NEW-200` | **`11163146`** | **PASS** (N=2) |
| **§XA.6** on-hand direction ⇒ no file | `check eta SRTWT5800` | **`11162731`** | **PASS** |
| **§XA.7** both axes empty ⇒ no file, no block | `check stock SRTWT5800-FH` | **`11162759`** | **PASS** |
| **§XA.11** frozen phrase + marker/placement | `11162665` + `11163215` + `11163233` | — | **PASS (partial)** — see §1.7 |
| **§XA-FP4 / §A6 FP-A** presign failure fires the apology once | 2-file cross-domain turn, presign → `127.0.0.1:9` | **`11163516`** | **PASS** |
| **§XA-FP4 / §A6 FP-B** mention gate is load-bearing (must go RED) | same turn, `ATTACH_NOTE` → `ZZZ-NO-SUCH-CLAIM-ZZZ` | **`11163686`** | **PASS (went RED as required)** |
| **§XA-FP4 / §A6 FP-C** partial wording | per-item forced fail on `FFAU3176932` only | **`11163792`** | **PASS** |
| bonus — §XA.3 provenance (no duplicate can arise) | `check eta for SRTWT5800 and SRTWC286-SH-NEW-200` | **`11164225`** | **PASS** |

Supporting / discarded runs, recorded for completeness:
`11162545` (throwaway #1), `11162850` (N=6 direct fan-out), `11162914` `11162996` `11163037` `11163081`
(§XA.5 fixture discovery), `11163452` `11163666` `11163776` `11163889` (post-write throwaways).

---

### 1.1 §XA.9 — `check eta SRTWC286-SH-NEW-200` · exec `11162612` · **PASS**

The highest-value case: its failure mode is *0 files with a green execution*. It did not fail that way.

| assertion | expected | actual |
|---|---|---|
| files delivered | 1 | **1** |
| filename | `FFAU3176932.xlsx` | `FFAU3176932.xlsx` |
| presigned URL | well-formed, carries `X-Amz-Signature` | **yes** |
| `get-presigned-url` | 1 run, `main[0]` 1 item, `main[1]` 0 items | **1 / 1 / 0** |
| `Loop Over Items1` | N+1 = 2 runs | **2** |
| `Switch` | N = 1 run | **1** |
| `guard-g-record` | 1 run | **1** |
| A-ORDER (text before file) | `idx(sendmsg2) < idx(if-got-attachments)` | **42 < 45** |
| provenance | `attach-merge.attachments` deep-equals `central-exchange.attachments` | **identical single object** |
| `crossdomain-render` | did not run (answered turn) | **no runData** |

### 1.2 §XA.9b — cert turn, 2 PDFs · exec `11163255` · **PASS**

The UAC-named fixture (exec `11081877`) was a chat-console **turn 2** (`"2"`, a number-pick) and is not
reproducible as a single `uac` turn; `certification for SRTUB6213` reproduces the same envelope in one turn.

| assertion | pre-change baseline (`11081877`) | this build (`11163255`) |
|---|---|---|
| files | 2 | **2** |
| filenames | `IKRAM  - IKRAM 01024FC - EXP 28 FEB 2027.pdf`, `PPS - DFY - IKRAM 01024FC - EXP 17 AUG 2026.pdf` | **same two** |
| **delivery order** (`guard-g-record` run order) | IKRAM → PPS | **IKRAM → PPS — identical** |
| `Split Out` / `Remove Duplicates` order | IKRAM, PPS | **IKRAM, PPS** |
| `get-presigned-url` | 1 run, 2 items out, 0 err | **1 / 2 / 0** |
| `Loop Over Items1` / `Switch` / `guard-g` | 3 / 2 / 2 | **3 / 2 / 2** |
| A-ORDER | 42 < 47 | **42 < 45** (index shifted because `attach-merge` is now interposed; the ordering relation holds) |
| provenance | — | `attach-merge` deep-equals `central-exchange.attachments` |

Re-run after the fault teardown (`11163932`) reproduced the identical `user_response` sha
`4adc253b0022…` and the same 2 files.

### 1.3 §XA.1 — `check stock SRTWC286-SH-NEW-200` · exec `11162665` · **PASS**

| assertion | actual |
|---|---|
| **`central-exchange` has NO runData** (the whole point of the change) | **confirmed — absent** |
| branch | `validator → crossdomain-zeroset → crossdomain-gate(T) → crossdomain-probe → crossdomain-render → If6[1] → Aggregate1 → … → crossdomain-compose → sendmsg2 → attach-merge → if-got-attachments(T) → Edit Fields → Split Out → Remove Duplicates → get-presigned-url → Loop Over Items1 → Switch[2] → guard-g-record` — **exactly as designed** |
| files | **1**, `FFAU3176932.xlsx`, signed |
| `attach-merge.attachments` | 1 object, **sourced entirely from `_xdBlock.attachments`** (`central-exchange` never ran, so `MAIN` is `[]`) |
| A-NODES | presign 1 run / 1 out / 0 err · `Loop Over Items1` 2 · `Switch` 1 · `guard-g` 1 |
| A-ORDER | **50 < 53** |
| frozen phrase | `…or would you like me to escalate to warehouse team?` present, byte-unchanged vs P-BASE; block above it |
| `crossdomain-compose` item keys | `[quick_reply, user_response, variables]` — **no `_xdApplied`** (F2 stays discharged) |

Re-run post-teardown (`11163910`) → identical `user_response` sha `214fa6e35d77…`, 1 file.

### 1.4 §XA.5 — N containers ⇒ N files · exec `11163146` · **PASS (N=2)**

Fixture had to be constructed at run time (V1). `check stock SRTWC286-SH-NEW-150, -P, -NEW` (`11162914`)
turned out **fully answered** — all three hold on-hand stock, so no block fires. The working fixture is
`check stock MWB7621, SRTWB243-35MM, SRTWC286-SH-NEW-200` (products mined from container `ECMU7393988`).

| assertion | actual |
|---|---|
| distinct `url`s in `crossdomain-render._xdBlock.attachments` | **2** (`FFAU3176932.xlsx`, `ECMU7393988.xlsx`) |
| files delivered | **2** — every distinct url appears in the egress log, **nothing truncated** |
| `Split Out` / `Remove Duplicates` items | 2 / 2 |
| `get-presigned-url` | 1 run, **2** items out, 0 err |
| `Loop Over Items1` = N+1 | **3** |
| `Switch` = N · `guard-g` = N | **2 / 2** |
| A-ORDER | **44 < 47** |
| **§3.3 residual** — every delivered filename maps to a product actually rendered in `_xdBlock.block` | **holds**: `ECMU7393988.xlsx` ↔ `SRTWB243-35MM` (rendered), `FFAU3176932.xlsx` ↔ `SRTWC286-SH-NEW-200` (rendered). No orphan file. |

Independently, the direct incoming path was observed delivering **6** files for 6 distinct containers
(exec `11162850`) — no cap at 2, 3 or 5 either.

### 1.5 §XA.6 — on-hand direction ⇒ no file · exec `11162731` · **PASS**

`origin = incoming`, probe = `crm_inventory_stock_balance_list`, block renders 6 on-hand locations.
`_xdBlock.attachments === []`; `attach-merge` emitted `{attachments: []}`; `if-got-attachments` ran and went
**FALSE** (`Edit Fields` has no runData); `get-presigned-url` **0 runs**; **0 files**.
Text carries **no** `I have attached the file(s) below.` — the conditional mention gate is doing its job.

### 1.6 §XA.7 — both axes empty ⇒ no file, no block · exec `11162759` · **PASS**

`_xdBlock = {block:"", any:false, attachments:[], probed_rows:0, rendered_rows:0}`; `attach-merge` `[]`;
`if-got-attachments` FALSE; `get-presigned-url` 0 runs; 0 files; `crossdomain-compose` keys carry
**no `_xdApplied`**. Message is the plain dym form:
`No stock for SRTWT5800-FH. Try: SRTWT5800, SRTWT5801, SRTWT5803. …`
**Read next to §XA.1** — on its own this passes on an inert build; §XA.1 on the same build shows the block
and the file do appear, so the negative is meaningful.

### 1.7 §XA.11 — frozen phrase + marker/placement · **PASS (partial)**

| turn | exec | result |
|---|---|---|
| §XA.1 `check stock SRTWC286-SH-NEW-200` | `11162665` | phrase `…or would you like me to escalate to warehouse team?` byte-unchanged; block above it |
| §XA.2 `check stock SRTWT5801 and SRTWC286-SH-NEW-200` | `11163215` | frozen `Would you like me to escalate to warehouse team?` byte-exact, block **above** it; 1 file (`attach-merge` = `central-exchange` `[]` + block 1) |
| F1 multi-token `check stock CSS8800, SRT393B-18, SRTMRL707` | `11163233` | block sits **above** `Would you like me to escalate to warehouse team?` ✓ · 1 file `TCLU1848910.xlsx` ↔ `SRT393B-18` (rendered) ✓ |

**Not discharged:** on this build/CRM state the multi-token turn produced **no did-you-mean candidate list**
(the reply is `Here's what you want: • product: CSS8800 (+2 more) / But no inventory matched these.`), so the
*"block above the candidates"* half of the F1 contract had nothing to be above — **UNREACHABLE this run**,
not passed. It needs a turn that actually renders candidates.

**Re-baseline, as the diff §7.3 predicted.** `D-ATTACH-MENTION` changes the bytes of every cross-domain turn
that carries a file. New baselines recorded here:

| turn | `user_response` sha256 |
|---|---|
| §XA.1 `check stock SRTWC286-SH-NEW-200` | `214fa6e35d77c5c54cc0d95c339925b8b4a9bebaf25a8d3cefc9399109b1d290` |
| §XA.2 partial inventory | `f174c3db41a78e1f7fce7ea9c5d89d93e45b9da86ddd06a3b8daf06d00b4ec0b` |
| F1 multi-token | `446a29aae6e404477458135e6b93af30bb0ac1aad065548d840906cf7d57ec83` |
| §XA.6 on-hand direction (**no** file, no mention) | `91f645ed7aacafa1e20b339af25029a3f71800c69dfbdb275c58ff6be92e4c30` |
| §XA.7 both empty | `ceb832a4e34627a26f5a612bfd20cf986ee1377b4c9573c6302480ac1f1c2d41` |
| §XA.9b cert turn | `4adc253b00229e096381081654a7cad47c5ed4021381f385c4afd725f64fe804` |

---

## 2. §XA-FP4 / §A6 — the presign-failure path (MANDATORY). All three sub-cases PASS.

Fault induced exactly as specified: `get-presigned-url.url` → **`http://127.0.0.1:9/forcefail`** (closed local
port — **zero requests left the container**; the real CRM host was never given a bad path). Cases serialised;
nothing else ran while the attachment path was dead. Throwaway run discarded after every write
(`11163452`, `11163666`, `11163776`, `11163889`).

Fixture: `check stock MWB7621, SRTWB243-35MM, SRTWC286-SH-NEW-200` — 2 files, and its delivered text
contains `I have attached the file(s) below.`, which is what arms the gate.

### FP-A — exec `11163516` — **PASS**

| assertion (§A6) | expected | actual |
|---|---|---|
| `get-presigned-url` runs | 1 | **1** |
| its `main[1]` | N ≥ 2 items | **`main[0]` = 0 items, `main[1]` = 2 items** |
| `presign-fail-notice` | 1 run, 1 item, `failed == total == N` | **1 run, 1 item, `failed:2, total:2`** |
| `sorento-sub-respond-sendmsg-presign-fail` | 1 run | **1** |
| egress gains exactly one `Sorry —` | 1 | **1**, text byte-exact: `Sorry — I couldn't attach the file(s). Please ask again, or I can escalate this.` |
| `guard-e/f/g-record` records | 0 | **0 / 0 / 0**, files delivered **0** |
| `runData['Loop Over Items1']` | absent | **absent** |
| execution status | stays `success` | **`success`** |

> 🚩 **Finding F-1 — the failure is even quieter than §XA-FP4 assumed.** UAC §XA-FP4 predicted
> `get-presigned-url` run 1 with **`executionStatus:"error"`**. It is **`executionStatus:"success"`**.
> With `onError: continueErrorOutput`, *neither* the execution status *nor* the node's own
> `executionStatus` goes red — the only signal is `main[0]` emitting 0 items while `main[1]` carries N.
> **Any future assertion on this node must count items per output, not read `executionStatus`.** The
> assertion in UAC as written would itself have been a green-that-cannot-fail.

### FP-B — exec `11163686` — **PASS (RED as required)**

`ATTACH_NOTE` in `presign-fail-notice` swapped to `ZZZ-NO-SUCH-CLAIM-ZZZ` (jsCode sha `ad8043e3ebc7` →
`fecc089b9285`), forced-fail URL still in place, same turn:

- `presign-fail-notice` ran — **0 output items**;
- `sorento-sub-respond-sendmsg-presign-fail` — **no runData**;
- egress gained **no** `Sorry —` record; 0 files.

The gate is genuinely wired to the delivered text. **FP-A's green is therefore worth something.**
Literal restored byte-exactly afterwards — re-fetched sha **`ad8043e3ebc7`**, `byte-match: True`.

### FP-C — exec `11163792` — **PASS**

Per-item URL so exactly one of the two files fails:
`={{ String($json.filename || '').includes('FFAU3176932') ? 'http://127.0.0.1:9/forcefail' : 'https://fe-sorento.foundryx.my/api/v1/external/presigned-url' }}`

- `get-presigned-url` 1 run, `main[0]` **1** item, `main[1]` **1** item;
- `presign-fail-notice` 1 run, 1 item, `failed:1, total:2`;
- notice text byte-exact: **`Sorry — 1 of 2 files didn't attach. Please ask again, or I can escalate this.`**;
- apology fired **exactly once**; `guard-g-record` logged **1** `would_send` (`ECMU7393988.xlsx`) — the file
  that did presign successfully;
- `Loop Over Items1` 2 runs, `Switch` 1, execution `success`.

---

## 3. §XA.3 provenance (bonus, run because it settles the duplicate question structurally)

`check eta for SRTWT5800 and SRTWC286-SH-NEW-200` · exec `11164225`:

- main answer carries the file — `central-exchange.attachments` = **1** (`FFAU3176932.xlsx`);
- probe is the **inventory** direction — `crossdomain-render._xdBlock.attachments` = **`[]`**;
- delivered: **1** file.

So on the one turn named as the duplicate risk, the block side contributes **nothing** — a PASS here cannot
be manufactured by two cancelling errors. Consistent with the §XA banner's structural argument.

---

## 4. Regression — R1–R8 + §TL-M-BYTE

| id | trigger | exec | verdict |
|---|---|---|---|
| R1 | `check stock SRTWT5800` | `11163989` | **PASS** — answered, **no block** (`crossdomain-render` no runData), 0 files, `attach-merge` `[]` deep-equals `central-exchange` `[]` |
| R2 | inventory miss wording | `11163215` / `11164225` | **PASS** — `No stock records found for: SRTWC286-SH-NEW-200.` (inventory) and `No incoming records found for: SRTWT5800.` (incoming — the intended noun change) |
| R3 | order enquiry (`status of order SPO-2024-0001`) | `11164009` | **PASS (change-scoped)** — did-you-mean + CS roster, no block, 0 files, attachment path inert |
| R4 | promotion enquiry (`any promotion for srt79ss`) | `11164027` | **PASS (change-scoped)** — access-level clarify, no block, 0 files |
| R5 | complaint turn | `11164040` | **PASS (change-scoped)**, but see **F-2** |
| R6 | `stock ah` (vague) | `11164056` | **UNRELIABLE — see F-4.** Attachment path inert (the change-scoped assertion holds); the clarify behaviour itself is unmeasurable in `uac` mode |
| R7 | require-specific (`check stock`) | `11164074` | **UNRELIABLE — same cause as R6.** No block, 0 files |
| R8 | attachment turn | `11163255` / `11163932` | **PASS** — 2 PDFs, same names, same order (§1.2). *This is now the highest-value regression turn on that list, and it is green.* |

For every one of R1–R8: `crossdomain-render` never executed except where a block is intended, `attach-merge`
ran once and emitted `[]` (or exactly `central-exchange.attachments`), `if-got-attachments` went FALSE, and
`get-presigned-url` had 0 runs. The re-rooting adds **one** node-run to every turn and changes nothing else.

### §TL-M-BYTE vs P-BASE (`tests/runs/tool-loop-removal-PBASE-20260803.md`)

Both miss turns differ from P-BASE. **Both deltas are legitimate and are exactly the expected wording
changes — no other byte moved.** Line-level diffs:

**M1 — `check stock SRTWC286-SH-NEW-200`** (P-BASE `a138e89b…` → now `214fa6e35d77…`)

```diff
@@
 🚩  *(PENDING ALLOCATION)*
 
+I have attached the file(s) below.
+
 Try: SRTWC286-SH-NEW, SRTWC286-SH-NEW-P, SRTWC286-SH-NEW-150. Reply with a code to continue, or would you like me to escalate to warehouse team?
```

One insertion: the `D-ATTACH-MENTION` sentence at the end of the block. This is the change under test and
the re-baseline was pre-announced in `tests/diffs/crossdomain-attachment.md` §7.3. **Not a regression.**

**M2 — `check eta SRTWT5800`** (P-BASE `f5b200cd…` → now `91f645ed7aac…`)

```diff
 No incoming stock (ETA) found for SRTWT5800.
-But there is stock ON HAND for the requested products:
+But here are the stock details for the requested products:
```

One substitution: the LEAD-IN reword, which belongs to the **`cross-domain-stock-incoming`** change (already
documented as expected in `tests/pre-promote-manual-tests.md` §3 X1), **not** to `crossdomain-attachment`.
No attachment mention appears here — correct, because the on-hand direction returns `attachments: []`.
**Not a regression.**

All 6 stock rows, their values, their order, the `Related products:` list and the escalate line are
byte-identical to P-BASE.

---

## 5. Green-that-cannot-fail audit

Which of the above would also pass on an inert or broken build, and what stops that reading:

| passing check | would it also pass if the feature were dead? | what rescues it |
|---|---|---|
| §XA.6, §XA.7, R1, R3–R7 ("no file, no block") | **YES — every one of them.** These are all satisfied by a completely inert build. | §XA.1 / §XA.5 / §XA.9 on the **same build version** show a file *does* arrive. Read the negatives only next to those. |
| §XA.9 / §XA.9b (pre-existing attachment turns) | **YES if the re-rooting were reverted** — they passed before the change too. | Their value is the *converse*: they'd go 0-files if `attach-merge` mis-sourced. They are a regression instrument, not a feature instrument. |
| §XA.3 provenance | **YES — it is expected to be inert.** | Only meaningful beside §XA.1. Stated as such. |
| execution `status: success` | **ALWAYS.** Never used. | Every verdict is per-node `runData`. FP-A proves the point: total presign failure, `status: success`, **and the node's own `executionStatus` also `success`** (F-1). |
| A-COUNT (`Split Out` / envelope counting) | proven blind by the previous tester's induced double-send | **Not used.** Counting is from `test:egress:{…}` `would_send` records keyed by `filename`, shown to read 0 / 1 / 2 / 6 on this build. |
| FP-A ("the apology fires") | **YES if the gate were wired to nothing** | **FP-B** was run and went RED (0 output items, no sender runData, no `Sorry —` row). |
| S1 orphan census | would pass if the census echoed an expectation rather than reading the graph | The census is computed from the **deployed** connection map fetched by REST, and it did move (from 8 → 9 sendmsg callers when the addendum landed). **However §XA-FP6 — inducing a red on the census in a scratch copy — was NOT run** (out of the narrowed scope). The instrument is therefore *argued*, not *demonstrated*. Carry it. |
| S7 `LLEN sorento-respond-message` 0→0 | **YES — drain-blind** (LESSONS §45) | Paired with the sink-delta: `sorento-respond-message-TEST` +1 exactly per run, unconsumed list, attributable payload. The LLEN alone is reported as corroboration only. |
| R6 / R7 ("clarify still works") | **cannot fail either way** — see F-4 | Reported as **UNRELIABLE**, not PASS. |

---

## 6. Graph-mutation protocol — compliance and end-state proof

Two mutations, both **published**, both reverted, each end-state asserted against the `dacf9224` baseline
(node-parameter shas + full connection map), not just node params:

| step | mechanism | versionId after | draft==active | connections vs `dacf9224` | nodes differing |
|---|---|---|---|---|---|
| baseline | — | `dacf9224…` | ✅ | identical | **none** |
| fault A6 (`/url` → dead port) | MCP `setNodeParameter` + explicit `publish_workflow` | `18dc4d37…` | ✅ | identical | `get-presigned-url` only |
| FP-B (`ATTACH_NOTE`) | REST PUT (auto-publishes) | `b569865b…` | ✅ | identical | `get-presigned-url`, `presign-fail-notice` |
| FP-C (per-item url) + `ATTACH_NOTE` restored | REST PUT | `a4886114…` | ✅ | identical | `get-presigned-url` only |
| **teardown** | REST PUT | **`a5cf2434…`** | ✅ | **identical** | **none** |

**Restoration proof.** Final REST GET of `txiPzSxy3Pclsz6v`:
- `versionId == activeVersionId == a5cf2434-83b6-455b-b9a4-79e3b4162f19` — **draft == active**;
- **zero** nodes differ in `parameters` from the `dacf9224` snapshot;
- connection map **byte-identical** to `dacf9224`;
- full content hash over `{nodes minus id/position, connections}`: `567adc028b58700e` **before and after** —
  the clone is content-identical to `dacf9224`; only the version pointer moved (a new pointer is unavoidable,
  a PUT/publish always mints one);
- `get-presigned-url.url` = `=https://fe-sorento.foundryx.my/api/v1/external/presigned-url` (byte-match);
- `presign-fail-notice` jsCode sha `ad8043e3ebc7` — the original;
- 28 credentialed nodes before and after every PUT, **identical set**; `pinData` preserved on every PUT;
  `settings` unchanged (`binaryMode:separate` survived the narrowed PUT schema, as LESSONS §55 predicts);
- S1 orphan census re-asserted: `send-message-files/images/video`, `update-human-intervened`,
  `save-session-vars` all inbound **0**.

Two positive cases were re-run after teardown and reproduced their pre-fault `user_response` shas exactly
(`11163910` = `214fa6e35d77…`, `11163932` = `4adc253b0022…`) — the clone attaches files again.

**Live spine:** `9qVyfUxmRQqrpGRMDLRuz` read at both ends of the run — `a40cd16d-c404-4d82-bc46-8a2e756e9dc1`,
`updatedAt 2026-08-02T23:34:18.534Z`, unchanged. Never written.

---

## 7. Findings

**F-1 🚩 `get-presigned-url` failure is invisible to *both* status signals.** UAC §XA-FP4 expected the node's
`executionStatus` to read `error`. Measured (exec `11163516`): the node reports **`success`** while emitting
0 items on `main[0]` and 2 on `main[1]`. Only per-output item counts detect it. This is a live defect
(addendum §A1 already establishes the unwired `main[1]` exists on live), and it means the *assertion* UAC
proposed was itself un-failable. **Update §XA-FP4's A-NODES clause to count items per output.**

**F-2 (observation, not attributable to this change).** `I want to complain about a damaged item I received`
was classified `message_type: request_for_help`, `domain_hint: portal_link` and answered with a portal link —
no complaint/escalation handling, no escalate phrase. Parser-side, upstream of everything in this change; the
attachment path was inert on that turn. Recording it because R5's intent ("complaint turn untouched") cannot
be evaluated against a baseline nobody captured.

**F-3 🚩 the get-results agent is dead weight on every turn observed — surfacing as instructed.** In
`sub-get-results TEST` (`rysSPgUssLDf6xJc`), runData on execs `11164291 / 11164237 / 11164236` is
`[trigger, entity-ids-transformer, MCP Client1, output-structurer]`. **`AI Agent`, `OpenAI Chat Model` and the
`MCP Client` *tool* node never execute**, even though `AI Agent` still has 2 inbound main edges. The tool is
chosen deterministically by the **caller** (`tool` workflow input) and executed by `MCP Client1`. Consequences:
(a) get-results costs **0 tokens** — the S6 denominator is the reformulator only; (b) the LLM arm is
effectively orphaned and any future `tool` value the caller sends is executed with no model in the loop;
(c) this is the same sub live's main read path calls (memory `live-calls-getresults-test-fork`), so it
describes production too.

**F-4 landmine — `uac` mode makes "does it still clarify?" unmeasurable.** R6 (`stock ah`) and R7
(`check stock`) both returned a full stock answer for `SRTWT9606-GM` and produced **byte-identical**
responses (`95b9b0ba…` twice). Parser output shows why: `entities: [{raw:"Srtwt9606 gm", canonical_code:
"SRTWT9606-GM", current_message:false}]` — a **carried** entity from the PROD session for contact `437264483`,
which `uac` mode reads (LESSONS §31). No vague turn can be tested this way. Two runs agreeing here is not
evidence of stability; it is evidence they read the same frozen prior state. Use `mode=regress-capture` with
a reset `respond_contacts_test` row for any clarify/vague case.

**F-5 (reader trap).** The `read-egress` list order is **not** chronological. In `11163516` the apology row
precedes the main-answer row that was sent before it. Count from the list; never infer ordering from it.

**F-6 (minor).** The main-answer row order (`check stock SRTWT5800`, exec `11163989`) is **not** qty-DESC and
not stable across calls — `BRW-NTC 236, BRW-BB 0, BRW-AM 7, BRW-IR 4, BRW 316, BRW-RSV 0`. The renderer's
sort applies to the cross-domain **block** (which was correctly qty-DESC and stable), not to the main answer.
Pre-existing and untouched by this change, but the `pre-promote-manual-tests.md` §3 instruction *"run X1
twice, the order must be identical"* only holds for the block.

---

## 8. Not discharged / carried

1. **§XA-FP6** (prove the S1 orphan census can go red, in a scratch copy) — **not run**, outside the narrowed
   scope. The census is argued from the deployed graph but never demonstrated red.
2. **The F1 "block above the candidates" clause** — **UNREACHABLE this run**: the multi-token turn produced no
   candidate list on today's CRM state. Needs a turn that renders candidates.
3. **R6 / R7 clarify behaviour** — unmeasurable in `uac` mode (F-4). Needs `regress-capture` + a session reset.
4. **The real send is unprovable on the clone** by design (`send-message-files/images/video` orphaned). Every
   case above proves the *decision* to send. Post-promote smoke on (a) a cross-domain `check stock` turn and
   (b) a pre-existing certification turn remains **mandatory**.
5. **Partial-access behaviour** — still blocked, no partial-access contact exists. This is a **prerequisite**
   for RISK-A1, not a cosmetic gap.
6. **Live `save-session-vars` PUT body** — a different node from the clone's `pg-upsert-session`. The
   `would_write` payloads observed here carry no `_xdBlock`/`attachments` key, consistent with the whitelisted
   rebuild, but verify on one real turn post-promote.
7. **§XA.2 / §XA.4 / §XA.8 / §XA.10** — outside the narrowed list; §XA.2 was nonetheless exercised as part of
   §XA.11 (exec `11163215`, PASS). §XA.4 (same-container dedupe) and §XA-FP2 were **not** run, so no claim is
   made about whether `Remove Duplicates` or the CRM presenter owns dedupe.

---

## 9. Bottom line

**The narrowed §XA suite is GREEN, and the §0 gate held on all 30 executions with zero real egress.**
The feature demonstrably works on the crux turn, the re-rooting broke no pre-existing attachment turn,
N containers deliver N files uncapped, the two negative directions stay silent, and the presign-failure
apology fires exactly once — with its gate proven load-bearing by an induced RED. The clone is restored to
`dacf9224` content with `draft == active`; live is untouched at `a40cd16d`.

**Nothing is promoted. Promotion remains user-gated**, and the promote checklist must carry
`presign-fail-notice` + the `get-presigned-url`[main:1] edge + a **live-shaped** sender
(`workflowId = aoydkG1dbItXR5jXFEQsP`, **`is_test` absent**) alongside `D-ATTACH-MENTION` — shipping the
mention without the error path would ship the false-claim hazard to a new production population (F-1).
