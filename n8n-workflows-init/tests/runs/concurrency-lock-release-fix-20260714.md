# Concurrency dispatcher — lock-release-fix RE-RUN (immediate release + auto-rearm)

**Date:** 2026-07-14 (re-run after coder's `dispatcher-lock-release-fix`)
**Target:** dev clone lane ONLY (never live). Dispatcher `zz-dispatcher-test` `2D0cw2Y1aPW2LOlU` **activeVersionId `4be6a9de-9fcd-428b-b9b1-ea895c56f32a`** (fix published; draft==active) → spine clone `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`.
**Fix under test:** `call-spine` `alwaysOutputData:true` (+ `onError:continueErrorOutput`) and `del-lock` `executeOnce:true` — makes the success-path release independent of how many items the spine terminal emits.
**Contact:** `437264483`. Mode `uac` (egress blocked, real CRM reads + real reformulator). No regression replay running (checked `aROEBlQyyoQaB7a1`/`MGm32814G7XcGSD2` → 0 running).
**Helpers:** `zz-seed-conc wrRISsj7445CCr8j`, `zz-inspect-conc 5ENLGUncNPdvPVrD`.
**Pre-fix confirmed present in active version:** `call-spine.alwaysOutputData=true`, `call-spine.onError=continueErrorOutput`, `del-lock.executeOnce=true`.

---

## Assertion 1 — SUCCESS-PATH RELEASE FIRES IMMEDIATELY: **PASS**

Phase A: seeded 2 msgs / **1 ready token**, emulated the 1s poller (fire `/webhook/zz-dispatch-test` each tick) and logged `test:lock`/`test:q`/`ready-contacts-test`.

**Winner dispatcher `8593131`** `[15:22:09.575 → 15:22:16.246]` — full release chain EXECUTED (not skipped), from `get_execution(includeData:true)` runData:

| node | ran? | value |
|---|---|---|
| incr-lock | ✓ | `{test:lock:437264483: 1}` (N==1 acquired) |
| call-spine | ✓ | `executionTime 6643ms`, sub `8593132`, **output[0]=`[{}]`** (the `alwaysOutputData` synthetic item — spine terminal `console-incoming-gate` emitted empty), output[1]=`[]` |
| **del-lock** | **✓ EXECUTED** | startTime **1784042536237 = 15:22:16.237**, DELETE `test:lock:437264483` |
| llen-q | ✓ | `{test:q:437264483: 1}` |
| more-in-queue? | ✓ | true branch (1>0) |
| rearm-more | ✓ | re-pushed ready token |
| **lastNodeExecuted** | | **`done`** (pre-fix bug had `call-spine`) |

**Immediate-release proof (timestamps):** spine `8593132` stopped **15:22:16.217**; `del-lock` ran **15:22:16.237** → lock DELETED **~20 ms** after the spine finished. The lock's INCR-acquire was 15:22:09.593; it was cleared by `del-lock` at 15:22:16.237 — held ≈6.64 s (== spine runtime), **NOT** the 120 s TTL. The redis poll independently corroborates: `lockval:"1"` while the spine ran, `lockval:null` from 15:22:21 onward (via `del-lock`, not TTL). `redaction.production:false`.

Same on the msg#2 winner `8593156` `[15:22:17.841 → 15:22:20.977]`: `del-lock` EXECUTED, `llen-q=0`, `more-in-queue?`=false → `done` (correctly no rearm). `del-lock` @15:22:20.968 vs spine `8593157` stop @15:22:20.948 → ~20 ms.

Contrast with the prior (buggy) run `concurrency-fifo-singleflight-20260714.md`: there `call-spine` returned `[[],[]]`, `del-lock` never ran, `lastNodeExecuted:"call-spine"`, lock lingered to the 120 s TTL.

---

## Assertion 2 — AUTO-REARM ON SUCCESS (msg#2 drains without TTL wait): **PASS**

Seed = 2 msgs / **1 token** (only enough for msg#1; msg#2 can only drain if the queue auto-rearms). After msg#1, `rearm-more` (above) re-pushed a ready token; the next poller tick popped it and drained msg#2.

**Latency proof (spine windows, non-overlapping, back-to-back):**
- msg#1 spine `8593132` `[15:22:09.620 → 15:22:16.217]` (popped `conc714fix-a-1` "ONE…stock…")
- msg#2 spine `8593157` `[15:22:17.882 → 15:22:20.948]` (popped `conc714fix-a-2` "TWO…promotion…")
- **Gap msg#1-end → msg#2-start = 15:22:16.217 → 15:22:17.882 = 1.665 s.**

msg#2's dispatcher `8593156` `get-lock` read `null` (lock had been freed by msg#1's `del-lock`) and `incr-lock`=1 → acquired the rearmed token immediately. **1.66 s vs the prior run's ~4 min 17 s lag** — auto-drain restored; no 120 s TTL wait.

---

## Assertion 3 — NO REGRESSION to the guarantees

### T1 FIFO (head + order): **PASS**
- Phase A: msg#1 spine popped `conc714fix-a-1` (head), msg#2 spine popped `conc714fix-a-2` (tail); spine windows strictly non-overlapping (msg#2 begins 1.665 s after msg#1 ends). In order, none dropped.
- Phase B: winner spine `8593688` popped `conc714fix-b-1` (head); drain spine `8593706` popped `conc714fix-b-2`. In order.

### T2 single-flight (2 concurrent fires, one acquires): **PASS**
Phase B: seeded 2 msgs / **2 tokens**, fired `/webhook/zz-dispatch-test` ×2 **concurrently** (`fire & fire & wait`). Two dispatcher execs raced:

| disp exec | window | pop | lock read | path | spine |
|---|---|---|---|---|---|
| `8593687` WINNER | 15:27:38.059→43.062 (5.0s) | 437264483 | get-lock=null → **incr-lock=1** | acquired → **call-spine** | `8593688` (msg1 head) |
| `8593689` LOSER | 15:27:38.206→38.238 (32ms) | 437264483 | **get-lock="1"** | lock-free?=FALSE → **rearm-busy** (re-park); **incr-lock NEVER ran, call-spine NEVER ran** | — none |

Live redis during the race: `{lockval:"1", qlen:1, readylen:1}` — `lockval:"1"` = exactly ONE INCR won (had both raced through INCR it would read "2"); `qlen 2→1` = winner popped the head; `readylen` settled to 1 = loser re-parked its token. Exactly ONE spine ran for the two overlapping fires. No double-processing, no overlapping same-contact spine.

### Error-branch release: **STRUCTURALLY PRESERVED (not re-executed)**
Exercising the error branch requires re-pointing dispatcher `call-spine` at `zz-throw` `HVL9mAxXEMxYX3oH` — a dispatcher edit the tester must not make. Preserved by construction + prior validation:
- `call-spine.onError=continueErrorOutput` → output[1] (error item) → `del-lock` → `llen-q` → `more-in-queue?` → `rearm-more` — wiring unchanged.
- `del-lock.executeOnce=true` collapses a 1-or-2-item input to exactly one processed item, so the error path releases + rearms **at most once** (guards the version-dependent edge where `alwaysOutputData` pads out[0]=`[{}]` while out[1] still carries the error item → 2 items into `del-lock`). Lock key uses `$('pop-ready-contacts').first()`, independent of the input item, so `executeOnce` doesn't change which lock is deleted.
- T3 error-release was validated 2026-07-09 (memory `per-contact-concurrency-dispatcher`); this fix does not alter that path's reachability, only makes it exactly-once.

---

## §0 SAFETY GATE — **PASS (zero egress, all 4 spine runs)**

Asserted from `get_execution(includeData:true)` on spine execs `8593132`, `8593157` (Phase A) and `8593688`, `8593706` (Phase B):

- **S1 zero real WhatsApp/comment sends** — the send sub `sorento-sub-respond-sendmsg-respond2` (`ublq9nSlrpz63xan`) executed on all 4 with **`is_test:true`** in its payload → short-circuited to a `would_send` payload; no `api.respond.io/.../message` call. `redaction.production:false`. ✓
- **S2 zero assignment/escalation writes** — inventory turns took the happy get-results path; promotion turns took the **access-level clarification** branch (`is_clarification:true`, `branch_kind:access_choice`, `is_escalate_offer:false`, `cs-offer-gate`→no-offer). No assign / SLA POST / PIC-comment / assignee-queue node ran on any turn. ✓
- **S3 zero CRM/contact writes** — `session-save-gate` routed to the **no-write branch** (output[0] empty, data on output[1]) on all 4; the prod `save-session-vars` PUT + `update-human-intervened` are orphaned and did not run. Only `get-session-vars-http` (a READ) ran. ✓
- **S4 get-results READ-only** — inventory turns resolved tool **`crm_inventory_stock_balance_list`** (READ allowlist), never `crm_it_support_ticket_create` or any write tool; promotion turns never reached get-results (clarification branch). ✓
- **S5 test_mode present** — popped redis item `mode:"uac"` on all 4; the invoked send sub received `is_test:true`. ✓
- **S6 token sinks bounded** — per inventory turn: 1 reformulator LLM (sub `XTODTw-dJcV0uRdC056hG`, ~2.2–3.1 s) + 1 get-rag pgvector + 1 get-results MCP read. Per promotion turn: 1 reformulator LLM only. `Basic LLM Chain` (clarification) did NOT run. No new/unexpected sink (no reformulator-outside-sub, no extra LLM). ✓

**S1–S5 affirmatively verified for every case → gate holds, no HALT.**

---

## Verdict

| assertion | result |
|---|---|
| 1. Success-path release fires immediately (del-lock + rearm EXECUTE; lock deleted ~20 ms after spine, not 120 s TTL) | **PASS** |
| 2. Auto-rearm on success (msg#2 drains 1.665 s after msg#1, not ~4 min) | **PASS** |
| 3a. T1 FIFO (head + order) | **PASS** |
| 3b. T2 single-flight (lock=="1", loser re-parks, one spine) | **PASS** |
| 3c. Error-branch release | **PRESERVED** (structural; not re-executed — would need a dispatcher edit) |
| 4. §0 zero-egress (all 4 spine runs) | **PASS** |

**The `dispatcher-lock-release-fix` is confirmed on the clone.** The prior throughput regression (success-path lock lingering to the 120 s TTL, no auto-drain) is resolved: `call-spine.alwaysOutputData:true` emits a synthetic `[{}]` on output[0] when the spine terminal (`console-incoming-gate`) returns empty, driving `del-lock`/`llen-q`/`more-in-queue?`/`rearm-more`; `del-lock.executeOnce:true` keeps release exactly-once for the error path.

### Notes for reviewer / promote
- **Dangling ready token (benign, pre-existing):** Phase B ended `{lockval:null, qlen:0, readylen:1}` — 1 surplus `ready-contacts-test` token from loser-repark + rearm-more when 2 tokens were seeded for 2 msgs. Inert in the test lane (dispatcher has no schedule trigger; only the webhook fires it) and wiped by the next `zz-seed-conc` `clear_ready:true`. It is the known token-accounting artifact, not introduced by this fix. On the LIVE dispatcher a stray token would drive one extra tick that pops an empty `q:{c}` and calls the spine with no message — worth confirming the spine no-ops gracefully on an empty pop before promote (out of scope here; dispatcher not editable by tester).
- Live spine `9qVyfUxmRQqrpGRMDLRuz` is NOT broken the same way (every live terminal emits ≥1 item — see `dispatcher-lock-release-fix.md`); the fix is recommended defense-in-depth on the prod dispatcher regardless.

### Executions
- Phase A: dispatcher `8593131`(win,msg1)/`8593156`(win,msg2); spine `8593132`(conc714fix-a-1 stock)/`8593157`(conc714fix-a-2 promotion); reformulator subs `8593133`/`8593159`; get-results sub `8593151` (READ, inventory).
- Phase B: dispatcher `8593687`(WINNER)/`8593689`(LOSER,rearm-busy)/`8593705`(drain); spine `8593688`(conc714fix-b-1 head)/`8593706`(conc714fix-b-2); reformulator subs run inside each.
- Poll logs: `scratchpad/phaseA.out`, `scratchpad/phaseB.out`.
