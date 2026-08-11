# Concurrency dispatcher — FIFO + single-flight + no-clobber demo (T1/T2/T3)

**Date:** 2026-07-14
**Target:** dev clone lane ONLY (never live). Dispatcher `zz-dispatcher-test` `2D0cw2Y1aPW2LOlU` → spine clone `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`. Helpers: `zz-seed-conc wrRISsj7445CCr8j`, `zz-inspect-conc 5ENLGUncNPdvPVrD`.
**Contact:** `437264483` (dev-test contact, per plan). Mode `uac` (egress blocked, real CRM reads + real reformulator).
**Mechanism:** programmatic — seed `test:q:{c}` + `ready-contacts-test` tokens, then fire `/webhook/zz-dispatch-test` MULTIPLE times OVERLAPPING (backgrounded curl) to simulate concurrent 1s-poller ticks. This creates the race the chat lane (blocking) cannot.

## What was seeded
2 messages for one contact, FIFO order, run_prefix `conc714a`:
- `conc714a-1` = "ONE what stock do you have for srt79ss"
- `conc714a-2` = "TWO any promotion for srt79ss"
Pre-fire inspect: `{lockval:null, qlen:2, readylen:2}`.

## Run 1 — 2 concurrent fires (the race)

Fired `/webhook/zz-dispatch-test` ×2 concurrently. Live lock poll DURING the run:
```
t+1s {"lockval":"1","qlen":1,"readylen":1}
t+2s {"lockval":"1","qlen":1,"readylen":1}
t+3s {"lockval":"1","qlen":1,"readylen":1}
t+4s {"lockval":"1","qlen":1,"readylen":1}
```
`lockval:"1"` = exactly ONE INCR happened (had both ticks acquired, it would read "2"). `qlen 2→1` = the winner popped the FIFO head. `readylen 1` = the loser re-parked its token while the winner ran.

Two dispatcher execs, ONE spine exec:

| dispatcher exec | popped | path taken | spine exec |
|---|---|---|---|
| `8590563` (WINNER) | 437264483 | get-lock=null → incr-lock=**1** → acquired → **call-spine** | `8590564` (14:52:24.973→28.741, success) |
| `8590568` (LOSER) | 437264483 | get-lock=**"1"** → lock-free?=FALSE → **rearm-busy** (re-park); **incr-lock NEVER ran, call-spine NEVER ran** | — none |

**T2 single-flight: PASS.** Two overlapping ticks, exactly ONE won the `INCR lock:{c}` (N==1) and ran the spine; the other took the GET fast-path, saw the lock held, re-parked the ready token (no TTL refresh), and did not touch the spine. No double-processing, no overlapping spine runs for the same contact.

**T1 FIFO (head): PASS.** Winner spine `8590564` popped `redis-pop-main-message-list` = `conc714a-1` ("ONE...stock...") — the first-seeded message, the queue HEAD (LPOP of an RPUSH-tail queue). Full happy path ran: real reformulator (sub `XTODTw` exec 8590569, inventory/check_stock) → resolve-entity (SRT79-SS ambiguous→3 matches) → get-rag → get-results (`crm_inventory_stock_balance_list`, READ) → would_send stock reply.

## Run 2 — drain msg#2

State before: `{lockval:null, qlen:1, readylen:1}` (lock had cleared, 1 message + 1 token remained). Fired ×2 concurrent again.
```
t+1s {"lockval":"1","qlen":0,"readylen":0}
```
Winner spine `8590962` (14:56:45.813→48.901) popped `redis-pop-main-message-list` = `conc714a-2` ("TWO...promotion...") — the queue TAIL, popped SECOND. Reformulator real-ran (promotion/check_promotion), would_send = access-level clarification ("Please specify which access level...").
Final: `{lockval:"1", qlen:0, readylen:0}` — both messages processed, NONE dropped, no dangling tokens.

**T1 FIFO (order): PASS.** msg#1 spine window `[14:52:24.973 → 14:52:28.741]` and msg#2 spine window `[14:56:45.813 → 14:56:48.901]` are strictly NON-OVERLAPPING (msg#2 begins 4m17s after msg#1 ends). The head (`conc714a-1`) was consumed and fully replied before the tail (`conc714a-2`) began. No out-of-order, no drop.

## T3 — no session-vars clobber: PASS (structural / correct-by-construction)

The clobber the design prevents is msg#2's get→modify→save straddling msg#1's. Evidence it cannot happen here:
- The lock is held across the **entire** spine sub-call (dispatcher runs it as a blocking `Execute Workflow`, `waitForSubWorkflow:true`). `compile-current-state` fans out to the session write **inside** that window, so the sub returns only after the write branch finishes.
- The two spines ran in strictly non-overlapping windows (above) → the two read-modify-write cycles never interleave → clobber is structurally impossible.
- Each turn computed its OWN correct state slice, never a merge: msg#1 would-write `domain=inventory / entities=[SRT79-SS] / last_result_set=[5 stock rows]`; msg#2 would-write `domain=promotion / last_result_set=[]`. Distinct, turn-correct payloads (read at `compile-current-state` / `session-save-gate` input).

**Caveat (honest framing, per LESSONS 31/42):** in `uac` mode the actual persistence is blocked (session-save-gate routed to the no-write branch) and the session READ sources PROD, so this proves the SERIALIZATION GUARANTEE that prevents clobber (non-overlapping RMW windows) — not a literal 2-turn state round-trip. A literal round-trip would need `regress-capture` mode (session sourced from/written to `respond_contacts_test`).

## §0 SAFETY GATE — PASS (zero egress, both messages)

Asserted from `get_execution(includeData:true)` on both spine sub-execs (`8590564`, `8590962`):
- **S1 zero real WhatsApp/comment sends** — the send sub `sorento-sub-respond-sendmsg-respond2` executed with `is_test:true` in its payload → short-circuited; the reply is a `would_send` payload, no `api.respond.io/.../message` call. `redaction.production:false`. ✓
- **S2 zero assignment/escalation writes** — both turns took the happy get-results path (not escalation); no assign / SLA / PIC-comment / assignee-queue node ran. ✓
- **S3 zero CRM/contact writes** — `session-save-gate` routed to the no-write branch (output[0] empty) on both turns; `save-session-vars` PUT + `update-human-intervened` orphaned; only `get-session-vars-http` (a READ) ran. ✓
- **S4 get-results READ-only** — resolved tool `crm_inventory_stock_balance_list` (READ allowlist); never `crm_it_support_ticket_create` or any write tool. ✓
- **S5 test_mode present** — popped redis item `mode:"uac"`; the invoked send sub received `is_test:true`. ✓
- **S6 token sinks bounded** — per turn: 1 reformulator LLM (gpt sub, ~2.1–2.5s), 1 get-rag pgvector, 1 get-results MCP read. `Basic LLM Chain` (clarification) did NOT run (has_result path). No new/unexpected sink. ✓

## ⚠️ FINDING — success-path lock release is BROKEN on the clone (chat-console regression)

The dispatcher's happy-path release (`del-lock` → `llen-q` → rearm) is downstream of `call-spine` **output[0]**. On both winner dispatcher execs (`8590563`, `8590960`), `call-spine` returned `data.main:[[],[]]` — **both outputs empty** — so `del-lock` never ran and `lastNodeExecuted:"call-spine"`. The lock cleared only via the **120s TTL expiry**, not `del-lock` (observed: `lockval:"1"` persisted from t+1s until ~t+124s, then flipped to `null`).

Root cause: the spine clone's terminal executed node is now `console-incoming-gate` (a **chat-console** addition, commits 07-13/14 — `sim-inject-gate`/`session-get-gate`/`session-save-gate`/`console-incoming-gate` are all new), which emits an empty array on its connected output → the sub-workflow returns zero items → the dispatcher's success branch gets no item to act on. In the prior T4 run (2026-07-12, before chat-console) `del-lock` fired on success (`out[0]`).

Impact:
- **Correctness preserved** (FIFO + single-flight + no-clobber all still hold — single-flight is actually MORE conservative since the lock is held the full TTL).
- **Throughput degraded** — on success the queue does NOT auto-rearm (`rearm-more` never runs), so the next same-contact message waits up to TTL=120s before another tick can acquire, instead of draining immediately. The error branch (T3-style) still releases promptly because it carries an item.
- **Design fragility to surface for promotion:** the dispatcher's release must not depend on the spine emitting a non-empty terminal item. Recommend making `call-spine` release-independent of item count (e.g. `alwaysOutputData:true` on the executeWorkflow node, or a Merge that guarantees ≥1 item into `del-lock`) before/at promotion. This is a clone-lane artifact (chat-console edits to `txiPzSxy3Pclsz6v`); the LIVE promotion target `9qVyfUxmRQqrpGRMDLRuz` should be re-checked for terminal-output shape, and the dispatcher hardened regardless.

## Verdict
- T1 FIFO (head + order): **PASS**
- T2 single-flight: **PASS**
- T3 no session clobber (structural): **PASS**
- §0 zero-egress: **PASS**
- New finding: dispatcher success-path lock-release broken by chat-console spine edits → lock lingers to TTL, auto-drain lost. Correctness intact; harden before promote.

Executions: dispatcher `8590563`(win)/`8590568`(lose)/`8590960`(win); spine `8590564`(conc714a-1)/`8590962`(conc714a-2); reformulator subs `8590569`/`8590964`; get-results subs `8590576`/`8590969` (READ).
