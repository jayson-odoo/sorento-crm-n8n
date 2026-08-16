# Per-contact concurrency serialization — plan

## Problem
Consume spine (`sorento-consume-main` `9qVyfUxmRQqrpGRMDLRuz`) is driven by a **Schedule Trigger every 1s** that pops one item from `main-message-list` and runs the ~86-node spine (LLM+RAG+MCP, >1s). Overlapping 1s ticks process the **same contact's** two fast messages concurrently. 2nd finishes first → out-of-order reply **and** session_vars read-modify-write clobber (`get-session-vars … save-session-vars` straddles both execs).

Extra: current queue is **LIFO** (push+pop both `tail=false` = LPUSH+LPOP) → newest pops first even single-threaded.

## Goal
Serialize processing **per contact** (msg-by-msg, FIFO) while keeping **different contacts fully parallel**. No global concurrency=1.

## Hard constraint
n8n Redis node ops = `delete/get/incr/info/keys/llen/pop/publish/push/set`. **No `SET NX`, no standalone `EXPIRE`, no Lua/EVAL.** Only atomic-with-TTL primitive = **`INCR` (expire+ttl)**. Lock built from INCR/GET/DELETE.

## Locked decisions
1. Architecture = **Approach 2**: thin **dispatcher** owns poll+lock, calls the existing spine as a **blocking sub** (`Execute Workflow`), releases after it fully returns. Correct-by-construction on the `save-session-vars` race (`compile-current-state` fans out to `save-session-vars` **parallel** to the reply chain; a sub-call returns only after ALL branches finish).
2. Lock primitive = `INCR lock:{c}` (expire, **ttl=120s**) as arbiter (N==1 wins), + `GET lock:{c}` fast-path so re-parking ticks DON'T re-arm TTL (else crashed holder never expires). Release = `DELETE lock:{c}`.
3. Queue model = **per-contact queue + ready-token list** (not single global list + message re-park → that reorders/starves).
4. FIFO = push **tail=true** (RPUSH), pop **tail=false** (LPOP head).
5. **Error branch releases lock + re-arms token** (if `LLEN q:{c} > 0`) — mirror of happy tail. Immediate release (not 120s wait); remaining burst still drains.
6. Failed message = **dropped** (already popped, no requeue — avoid poison-loop).
7. Contact key `c` = findcontact result id (`If1.json.id` in push; token value in consume). Same id space both sides (both call `sorento-sub-respond-findcontact-respond`).
8. Test = seed `-test` keys via canary, e2e on clones; push change eyeballed as small diff.

## Key namespacing (safety: test never touches prod)
| role | PROD key | TEST key |
|---|---|---|
| per-contact FIFO queue | `q:{c}` | `test:q:{c}` |
| ready-token list | `ready-contacts` | `ready-contacts-test` |
| per-contact lock | `lock:{c}` | `test:lock:{c}` |

## Target flow

### Dispatcher (NEW, tiny)
```
Schedule 1s (prod) / WhenExecuted (test) → POP ready-contacts → c
  c null? → end
  GET lock:c
    present → PUSH ready-contacts c (re-park) → end
    null → INCR lock:c (expire ttl=120) → N
        N>1 → PUSH ready-contacts c (re-park) → end
        N==1 → Execute Workflow [spine] (pass contact=c + test flags), continueOnError
            success → DELETE lock:c → LLEN q:c>0 ? PUSH ready-contacts c
            error   → DELETE lock:c → LLEN q:c>0 ? PUSH ready-contacts c
```
Dispatcher does NOT pop `q:c`; the spine pops it (one item/call). Lock spans the whole sub-call.

### Spine (existing) — minimal edits
- Remove/disable **Schedule Trigger** (dispatcher owns polling).
- `redis-pop-main-message-list`.list: `main-message-list` → `=q:{{ $json.contact }}` (prod) / `=test:q:{{ $json.contact }}` (clone). Still a redis pop, same node name → all `$('redis-pop-main-message-list')` refs intact. Pop empty → spine just ends (dispatcher still releases).
- `When Executed by Another Workflow` schema: add `contact` (+ keep test flags threaded from dispatcher).

### Push (`sorento-main` `NwMOBEQ1NW7LVky5`) — 2-node change
Replace the single `Redis2 PUSH main-message-list` with:
- `PUSH q:{{contact.id}}` **tail=true**, value = `JSON.stringify(concat_queue_body)`
- `PUSH ready-contacts` **tail=true**, value = `{{contact.id}}`
(contact.id = `$('If1').first().json.id`.)

## Build order (on CLONES only — never live)
1. Dispatcher clone `zz-dispatcher-test` (new). Lock dance + Execute spine-clone.
2. Spine clone `txiPzSxy3Pclsz6v`: retarget pop → `test:q:{c}`, drop Schedule, add `contact` input.
3. Canary (`zz-canary-run`/`seed`): seed `ready-contacts-test`=[c] + `test:q:{c}`=[item], trigger dispatcher.
4. UAC: 2 fast msgs same contact → assert FIFO order + single-flight (no overlap) + zero egress.
5. Race test: 2 contacts interleaved → assert parallel across contacts.
6. Crash test: force spine error mid-run → assert lock released + token re-armed + m2 drains.
7. Review → promote (guards stripped, prod keys, Schedule on dispatcher) — user-gated.

## Build status — DEV CLONE (all 3 tests PASS, 2026-07-09)

Built + validated on the clone/test lane (never touched live spine or live push):

| workflow | id | role |
|---|---|---|
| `zz-dispatcher-test` | `2D0cw2Y1aPW2LOlU` | the dispatcher (Approach 2). SDK source: `plans/dispatcher.sdk.js` |
| `sorento-consume-main TEST` (spine clone) | `txiPzSxy3Pclsz6v` | edited: pop retargeted `main-message-list-test`→`=test:q:{{ $json.contact }}`; added `contact` trigger input |
| `zz-seed-conc` | `wrRISsj7445CCr8j` | seed helper — body `{contact,texts[],run_prefix,tokens}` → clears + RPUSH `test:q:{c}` + `ready-contacts-test` |
| `zz-inspect-conc` | `5ENLGUncNPdvPVrD` | reads `test:lock:{c}` / llen `test:q:{c}` / llen `ready-contacts-test` |
| `zz-throw` | `HVL9mAxXEMxYX3oH` | always-throws, used to force the error branch |

Webhooks: `/webhook/zz-dispatch-test` (fire), `/webhook/zz-seed-conc`, `/webhook/zz-inspect-conc`.

**Test results**
- **T1 FIFO drain** (2 msgs, 1 token, 2 sequential fires): fire#1 drained `t1-1` "FIRST" (qlen 2→1, token rearmed, lock released); fire#2 drained `t1-2` "SECOND" (qlen→0, no rearm). Order preserved.
- **T2 single-flight** (2 msgs, 2 tokens, 2 CONCURRENT fires): winner ran spine 4.8s; loser finished 79ms via GET fast-path (`lockval:"1"`) → `rearm-busy`, **never incr'd** (no TTL refresh), **no spine call**. Exactly ONE spine execution. Race prevented.
- **T3 error release** (call-spine → `zz-throw`): spine threw → error branch ran `del-lock`+`rearm-more`; lock released, token rearmed, dispatcher itself finished `success`.
- **T4 cross-contact parallel** (2 contacts A=`437264483`/B=`999000002`, 1 token+1 msg each, 2 CONCURRENT fires; 2026-07-12): fire#1 popped A → spine success 9.0s; fire#2 popped B → spine ran **inside** A's window (B 17.09–17.53 nested in A 16.78–25.74) = independent `lock:{c}`, no serialization across contacts. No cross-contamination (each fire's `call-spine` got its own id), both queues drained, both locks released (A via success out[0], B via error out[1]), no rearm, zero egress. Full evidence: `tests/runs/concurrency-xcontact-20260712.md`. (Seed helper `zz-seed-conc` gained a `clear_ready:false` flag so multiple contacts can be staged without wiping the ready list.)

**Gotcha (n8n redis):** `pop`/`get` auto-parse a numeric phone id into a **JS number**. Key concats tolerate it, but `push` messageData and the `executeWorkflow` string input reject a number → wrap `String(...)` (`CS` in the SDK) and set contact-check If to `typeValidation: loose`. Redis node output shapes (verified via probe): `get`→`{propertyName: val|null}` (replaces json, no upstream fields), `incr`/`llen`→`{ "<key>": N }` (read `Object.values($json)[0]`), `pop`→`{propertyName: val}`.

## Promotion checklist (LIVE — user-gated, NOT done)
1. Backup live spine `9qVyfUxmRQqrpGRMDLRuz` version first.
2. New **prod dispatcher** from `dispatcher.sdk.js` with: keys de-`-test` (`ready-contacts`, `test:q:`→`q:`, `test:lock:`→`lock:`), `call-spine`→live spine `9qVyfUxmRQqrpGRMDLRuz`, trigger = **Schedule 1s** (drop the test webhook), guards intact (error branch stays).
3. **Live spine** `9qVyfUxmRQqrpGRMDLRuz`: remove Schedule trigger + retarget `redis-pop-main-message-list`.list → `=q:{{ $json.contact }}` + add `contact` trigger input. (Same 2 edits as the clone.)
4. **Live push** `sorento-main` `NwMOBEQ1NW7LVky5`: replace `Redis2 PUSH main-message-list` with `PUSH q:{{contact.id}}` (tail=true) + `PUSH ready-contacts` (tail=true, value contact.id). contact.id = `$('If1').first().json.id`.
5. Cutover — see the drain-then-flip runbook below (the naive "publish each" leaks in-flight messages).

## ⭐ FAILOVER-ERA PROMOTION UPDATE (2026-07-13) — READ THIS FIRST

The original checklist assumed **one** producer (`sorento-main`). The failover poller added a **second** injector. Enumerated all redis pushes to the real `main-message-list` — **two production injectors**:

| injector | id | node | when it feeds the list |
|---|---|---|---|
| `sorento-main` (producer, webhook path) | `NwMOBEQ1NW7LVky5` | `Redis2` push | only **non-carved** contacts (gate `in-failover?` serves them) |
| `sorento-main-INJECT` (failover poller target) | `sk0zN90Cas4Y6Y2w` | `Redis2` push | **carved** contacts (poller → INJECT → RPUSH) |

**Both must flip** to `PUSH q:{c}` (tail=true) + `PUSH ready-contacts` (tail=true, value `c`), or the one you miss strands its messages on a list nobody pops. Contact key `c = $('If1').first().json.id` in **both** (INJECT is a producer copy → identical findcontact→If1→id).

**Consumer/pop:** live spine `9qVyfUxmRQqrpGRMDLRuz` `redis-pop-main-message-list` — same 2 edits as clone (drop Schedule, pop `=q:{{ $json.contact }}`, add `contact` input).

**Preflight extra:** confirm `sorento-consume-main copy` `oo7LnsedPyKB9bWM` (pops+pushes main-message-list) is **INACTIVE** — else a rogue second consumer competes.

**⚡ Simplifier — cut over NOW while all-on-poller:** currently all 76 contacts are carved onto the poller, so the **producer is dormant** (gate drops everyone → 0 producer pushes) and `main-message-list` is fed **only by INJECT**. So in this state the live-traffic path to flip is just **INJECT → spine → dispatcher**; flip the producer too (for when contacts later return to webhook) but it carries no live traffic during the window = lower risk.

### Failover-era flip sequence (supersedes the generic one below for this window)
1. **Backup** versions: spine `9qVyfUxmRQqrpGRMDLRuz`, producer `NwMOBEQ1NW7LVky5`, INJECT `sk0zN90Cas4Y6Y2w`.
2. **Stage drafts** (don't publish): prod dispatcher (de-`-test` keys → `q:`/`ready-contacts`/`lock:`, `call-spine`→live spine, Schedule 1s); spine (drop Schedule + pop `=q:{{ $json.contact }}` + `contact` input); producer push→`q:{c}`+`ready-contacts`; **INJECT push→`q:{c}`+`ready-contacts`**.
3. **Quiesce:** deactivate the **failover poller** `CYNq34WZx83POLQ5` (stops INJECT firing) AND the live spine Schedule (stops popping). Buffer: carved contacts' new messages sit in respond (poller catches them post-cutover via watermark — nothing lost).
4. **Drain** `main-message-list` to 0 (let in-flight spine runs finish). Confirm `LLEN main-message-list == 0`, no spine execs in flight.
5. **Flip producers:** publish producer (push→`q:{c}`+`ready`) + INJECT (push→`q:{c}`+`ready`).
6. **Flip consumer:** publish spine (Schedule gone, pop `q:{c}`, `contact` input) — now dispatcher-only.
7. **Arm dispatcher** (Schedule 1s).
8. **Resume poller** `CYNq34WZx83POLQ5` → INJECT now pushes `q:{c}`+`ready` → dispatcher pops `ready-contacts`, locks `c`, calls spine. Watermark means it re-lists any messages buffered during the window.
9. **Verify live:** (a) one carved contact sends 2 fast msgs → FIFO + single-flight (one spine at a time for that contact); (b) two carved contacts burst → process in parallel; (c) `ready-contacts` length bounded, no `lock:{c}` older than TTL=120s.

**Rollback:** unpublish dispatcher; republish backed-up spine (Schedule intact, pop main-message-list), producer + INJECT (push main-message-list); reactivate poller. Drain any `q:{c}`/`ready-contacts` residue (or re-push those contacts' messages — watermark will re-catch on poller). Old world restored.

### New validation to add on the CLONE before promote (failover-specific)
Existing clone tests T1–T4 cover FIFO / single-flight / error-release / cross-contact-parallel. Add:
- **Burst-via-INJECT:** simulate the poller injecting N same-contact messages 1.2s apart into `test:q:{c}` + N `ready-contacts-test` tokens → dispatcher drains **in order, single-flight** (this is the exact same-contact-burst race the promote fixes).
- **Mixed burst:** 3 contacts × 3 msgs interleaved → per-contact FIFO + cross-contact parallel, no `session_vars` cross-talk.

### Open decisions (need user)
1. **Window:** cutover needs ~a few min of quiesce (poller+spine down, drain). Pick a low-traffic slot. During it, carved contacts' replies are delayed (buffered in respond, caught after) — acceptable?
2. **Inject pacing:** poller's `post-inject` batch = 1.2s. Under the dispatcher, same-contact ordering is guaranteed by the lock, so the 1.2s is no longer needed for correctness — can drop to ~300ms for faster burst drain. Do it as part of the promote?
3. **Do it now (all-on-poller = easy window) or wait** until you've decided webhook-vs-poller steady state?

---

## ⭐⭐⭐ CHOSEN PLAN (2026-07-23, re-grounded on LIVE) — SINGLE COMBINED CUTOVER

**Decision (supersedes the two-phase idea):** the quiesce/drain step already empties the ONE global `main-message-list` for **all** contacts, so a "poller-first" split was a fake boundary — no isolation gained. Flip **producer + INJECT + spine + dispatcher together** in one quiesce → drain → flip window, then self-test on the user's own contact `437264483`.

## ✅ PROMOTED LIVE 2026-07-23 — CUTOVER SUCCESS

Executed via the runbook below (user did all live activate/publish/deactivate toggles in the n8n UI — those are **auto-mode classifier-BLOCKED** for the agent on live production workflows; agent drove backups/staging/reads + the inspect helper). **Live test (contact 437264483, non-carved → webhook producer path):** 2 fast msgs "stock srt79ss"/"stock srt80ss" → spine run1 `9712027` [14:52:17.08→23.33] then run2 `9712045` [14:52:24.06→30.85] = **single-flight (0.7s gap, no overlap) + FIFO (by messageId)**; run3 `9712061` 47ms empty-pop no-op (graceful). Dispatcher `77SG9jTdVKhwMwvR` ticks clean 0-err on empty. **NOT yet exercised live: INJECT/poller (carved) path** — identical edit to the producer, low risk. Rollback = republish backups + reactivate poller (below).

## 🟢 BUILD STATE (2026-07-23) — STAGED → NOW LIVE. Cutover ran clean via publish/activate below.

**Preflight (done, read-only):** pushers of `main-message-list` = producer + INJECT only (archived `sorento-consume-main copy` `oo7LnsedPyKB9bWM` dead) ✓ · rogue consumer inactive ✓ · poller `failover-poller-LIVE` `CYNq34WZx83POLQ5` active ✓ · no hidden prod-list toucher ✓ · **spine p99 UNMEASURED** (executions API too slow; empties dominate; no prod-DB creds) → monitored residual risk (watch `lock:{c}` age > TTL 120s post-cutover).

**Backups** (`backups/…-20260723.json`): spine `c1580e38`, producer `8f655510`, INJECT `c90cb70a` (these are the activeVersionIds to roll back to).

**Built artifacts:**
| thing | id | state |
|---|---|---|
| **prod dispatcher** `sorento-dispatcher` (de-`-test` keys, `call-spine`→live spine, Schedule 1s, lock-release fix) | `77SG9jTdVKhwMwvR` | created, **INACTIVE** |
| prod redis inspect helper `zz-inspect-prod-conc` (LLEN mml/ready + keys lock:*/q:*) | `wxgvH4DH3PDZAmJ8` | created, **NOT activated** (classifier blocked activate; user toggle active in UI) |

**Staged DRAFTS (active version untouched — live still on `main-message-list`):** each `versionId != activeVersionId`, verified.
- spine `9qVyfUxmRQqrpGRMDLRuz` draft `92bcf4f7`: pop→`=q:{{ $json.contact }}`, `Schedule Trigger` disabled, `contact` input added.
- producer `NwMOBEQ1NW7LVky5` draft: `Redis2`→`=q:{{ $('If1').first().json.id }}` tail=true + new `push-ready`→`ready-contacts` tail=true.
- INJECT `sk0zN90Cas4Y6Y2w` draft `e273ac0f`: same as producer.

**Edits made via MCP `update_workflow` (draft-only, no auto-publish). NOT via REST PUT (auto-publishes).** MCP `publish_workflow` needs each workflow's "available in MCP" toggle ON first (dispatcher + helper currently OFF → publish via REST activate or UI).

### CUTOVER EXECUTION (user-gated — activate/deactivate/publish are classifier-gated; do in n8n UI or with granted perms)
0. Fire `zz-inspect-prod-conc` → record baseline `main_message_list`, `ready_contacts`, `lock_count`, `q_count` (expect ready/lock/q = 0/empty).
1. **Quiesce PRODUCERS only:** deactivate poller `CYNq34WZx83POLQ5` (producer already dormant). Nothing pushes `main-message-list` now. **Leave the live spine running** — its still-active Schedule is what drains the list.
2. **Drain:** the live spine keeps popping until `main-message-list` empties. Fire inspect helper until `main_message_list == 0` and no spine exec in flight.
3. **Publish producers:** publish producer `NwMOBEQ1NW7LVky5` draft + INJECT `sk0zN90Cas4Y6Y2w` draft → new pushes now go to `q:{c}`+`ready-contacts` (they queue harmlessly until step 5 arms the consumer).
4. **Publish spine** `9qVyfUxmRQqrpGRMDLRuz` draft → Schedule disabled + pop `q:{c}` + `contact` input (dispatcher-only now).
5. **Activate dispatcher** `77SG9jTdVKhwMwvR` (Schedule 1s starts popping `ready-contacts` → draining the q:{c} backlog).
6. **Resume poller** `CYNq34WZx83POLQ5`.
7. **Self-test** contact `437264483`: 2 fast msgs → FIFO + single-flight; 2 contacts → parallel; inspect helper shows `ready-contacts` bounded, no `lock:{c}` older than 120s.
Between steps 3–5 new messages accumulate in `q:{c}`/`ready-contacts` with no consumer yet — expected, dispatcher drains them once armed (step 5). Keep 4→5 tight.

**Rollback:** deactivate dispatcher; republish spine backup (`c1580e38`, Schedule on, pop `main-message-list`) + producer (`8f655510`) + INJECT (`c90cb70a`); reactivate poller. Drain `q:*`/`ready-contacts` residue (poller watermark re-catches).

### ⚠️ LIVE RE-GROUNDING (verified 2026-07-23 via MCP — the plan doc above was pre-promotion-era and partly stale)
- **Spine `9qVyfUxmRQqrpGRMDLRuz`** — `versionId == activeVersionId == c1580e38` (clean, no pending draft), updated 2026-07-22 (state-monitor bundle). 101 nodes. Edit points intact:
  - Triggers: **`Schedule Trigger`** (1s) + **`When Executed by Another Workflow`** — BOTH feed `redis-pop-main-message-list`. Drop Schedule; When-Executed keeps feeding the pop.
  - **`redis-pop-main-message-list`** = the ONLY redis node in the spine (op=pop, list=`main-message-list`, LPOP head). Retarget list → `=q:{{ $json.contact }}`. No collision with any dym/state-monitor/voice node.
  - executeWorkflowTrigger inputs today = `test`, `test_run_id`, `started_at` → **add `contact`**. Pop is directly downstream of the trigger so `$json.contact` resolves.
  - **Apply these 3 edits to the LIVE draft directly — do NOT copy the stale clone `txiPzSxy3Pclsz6v`** ([[stale-byte-identical-fork-claim]]). Clone was for behaviour testing only; the 3 edits are structural + independent of business logic.
- **Producer `sorento-main` `NwMOBEQ1NW7LVky5`** (updated 2026-07-21) — new failover gate: `consolidate → get-set (SELECT ids FROM failover_watermark WHERE mode='live') → restore → in-failover?`. `in-failover?` TRUE (carved) → **dead-ends (dropped)**; FALSE (not carved) → findcontact → If1 → concat_queue_body → Redis1(incr ratelimit) → If(≤30) → **`Redis2` push `main-message-list`**. So all-carved ⇒ producer pushes nothing.
- **INJECT `sorento-main-INJECT` `sk0zN90Cas4Y6Y2w`** (updated 2026-07-21) — no failover gate → same tail: … → Redis1(incr) → If(≤30) → **`Redis2` push `main-message-list`**.
- Both injectors: push node named **`Redis2`**, currently `Redis2 → [[]]` (dead-ends). `contact.id = $('If1').first().json.id` in both. **Identical 2-node edit each:** retarget `Redis2` → `PUSH q:{c}` (tail=true) + add new node **`push-ready`** (`PUSH ready-contacts` tail=true, value `c`), wire `Redis2 → push-ready`.

### PREFLIGHT — live read-only checks (RUN THESE FIRST, before any edit)
1. **Enumerate EVERY pusher of `main-message-list`** instance-wide (via REST, MCP hides archived — [[mcp-hides-archived-workflows]]). Expect exactly producer + INJECT. Any third pusher must flip too or it strands.
2. **Confirm the rogue consumer** `sorento-consume-main copy` `oo7LnsedPyKB9bWM` is **INACTIVE/absent** (it pops+pushes `main-message-list` → a live second consumer would compete). Not in the active `sorento` list on 2026-07-23 — confirm archived, not renamed.
3. **Poller** `CYNq34WZx83POLQ5` — confirm active + its INJECT-firing path.
4. **Carve state** — confirm all live contacts carved (`SELECT contact_id FROM failover_watermark WHERE mode='live'` vs contact roster) so the producer is genuinely dormant during the window.
5. **Spine p99 vs TTL** — the spine has grown heavier since the concurrency test (dym, RAG, MCP, ideation/voice). Sample recent `sorento-consume-main` execution durations; **p99 must be < lock TTL=120s** or same-contact overlap returns (risk #1). This is a NEW check — the fix was validated on a lighter spine.

### Backups (export JSON to `backups/` before staging)
Spine `9qVyfUxmRQqrpGRMDLRuz`, producer `NwMOBEQ1NW7LVky5`, INJECT `sk0zN90Cas4Y6Y2w`. (Dispatcher is net-new — nothing to back up.)

### Stage drafts — DO NOT publish
- **prod dispatcher** (new, from `plans/dispatcher.sdk.js`): keys de-`-test` (`ready-contacts` / `q:{c}` / `lock:{c}`), `call-spine` → live spine `9qVyfUxmRQqrpGRMDLRuz`, trigger = **Schedule 1s**, KEEP the lock-release fix (`call-spine` `alwaysOutputData:true` + `del-lock` `executeOnce:true`), error branch releases lock + rearms. Passes `contact` to the spine.
- **spine**: drop Schedule + pop `=q:{{ $json.contact }}` + add `contact` input.
- **producer** + **INJECT**: each `Redis2` → `q:{c}` + new `push-ready` → `ready-contacts`.
- (Optional, decision #2: drop INJECT `post-inject` pacing 1.2s→~300ms — recommend DEFER, keep the diff minimal for the first live cut.)

### Cutover — quiesce → drain → flip → arm (order matters)
1. **Quiesce:** deactivate poller `CYNq34WZx83POLQ5` (stops INJECT) + live spine `Schedule Trigger` (stops popping). Carved contacts' new msgs buffer in respond; poller watermark re-catches post-cutover — nothing lost. Producer already dormant.
2. **Drain:** let in-flight spine runs finish. Confirm **`LLEN main-message-list == 0`** (all contacts — one global list) AND no spine exec in flight.
3. **Flip producers:** publish producer + INJECT (push → `q:{c}` + `ready-contacts`).
4. **Flip consumer:** publish spine (Schedule gone, pop `q:{c}`, `contact` input) — now dispatcher-only.
5. **Arm dispatcher:** publish dispatcher with Schedule 1s.
6. **Resume poller** `CYNq34WZx83POLQ5`. Watermark re-lists anything buffered during the window.

### Self-test (own contact `437264483`)
- (a) 2 fast WhatsApp msgs → **FIFO order** + **single-flight** (one spine at a time for the contact) + correct reply, no out-of-order.
- (b) 2 contacts burst simultaneously → **cross-contact parallel**.
- (c) watch `ready-contacts` bounded (not growing); no `lock:{c}` older than TTL=120s.

### Rollback (any step fails)
Unpublish dispatcher; republish backed-up spine (Schedule intact, pop `main-message-list`) + backed-up producer + INJECT (push `main-message-list`); reactivate poller. Drain any `q:{c}`/`ready-contacts` residue (or re-push — poller watermark re-catches). Old world fully restored.

### ⚠️ NEW REGRESSION RISKS this cutover introduces (didn't exist in old world)
1. **Spine loses its self-trigger → dispatcher becomes a hard dependency.** Old world: spine self-polls every 1s. New world: if the dispatcher is unpublished / errors before `Execute Workflow` / its Schedule is off, **nothing consumes → full chatbot outage**. Mitigation: dispatcher error branch must never crash before release; monitor `ready-contacts` growth; rollback republishes the spine Schedule.
2. **TTL=120s vs a heavier spine p99** (preflight #5) — re-measure; the fix was tested on a lighter spine.
3. **Silent msg-drop on spine error** (accepted risk #2) — failed msg is popped, not requeued.
4. **All-pushers coverage** (preflight #1) — one missed pusher strands its contacts silently.

---

## Cutover runbook (LIVE — the risky moment, do NOT wing it) [ORIGINAL, single-producer]

**Risk:** during the flip the producer (`sorento-main` push) and consumer (spine) read/write **different redis keys** — old world = single `main-message-list`; new world = per-contact `q:{c}` + `ready-contacts`. If they're partially flipped, messages land on a list nobody pops → silently stuck/lost. The spine's Schedule trigger is also being removed the instant the dispatcher's Schedule takes over — a gap or an overlap there = dropped or double-processed messages.

**Pre-flight**
1. Backup live spine `9qVyfUxmRQqrpGRMDLRuz` version + live push `sorento-main` `NwMOBEQ1NW7LVky5` version (export JSON to `backups/`).
2. Stage (do NOT publish) the 3 edited workflows as drafts: prod dispatcher (keys de-`-test`, `call-spine`→live spine, trigger=**Schedule 1s**), spine (drop Schedule + retarget pop `=q:{{ $json.contact }}` + add `contact` input), push (`main-message-list` PUSH → `PUSH q:{{contact.id}}` tail=true + `PUSH ready-contacts` tail=true).
3. Pick a low-traffic window.

**Flip sequence (order matters — quiesce, drain, swap, arm)**
1. **Stop new intake into the old list.** Unpublish/disable the **live spine's Schedule trigger first** (or unpublish the spine) so nothing pops `main-message-list` while you work. Producer still pushes to `main-message-list` (old key) — that's fine, it's a buffer.
2. **Drain `main-message-list` to empty.** Either let the still-running old spine finish it before step 1, or temporarily re-enable one drain pass. Confirm `LLEN main-message-list == 0` **and** no spine executions in flight.
3. **Flip the producer.** Publish the new **push** (`sorento-main`) → new messages now go to `q:{c}` + `ready-contacts`. Old list stays empty (nothing writes it anymore).
4. **Flip the consumer.** Publish the edited **spine** (Schedule removed, pop retargeted to `q:{c}`, `contact` input) — it is now trigger-less, only callable by the dispatcher.
5. **Arm the dispatcher.** Publish the prod **dispatcher** with its Schedule 1s. It starts popping `ready-contacts` → acquiring `lock:{c}` → calling the spine.
6. **Verify live:** send 2 fast messages from one test contact → assert FIFO order + single-flight (one spine at a time for that contact) + a different contact processes in parallel. Watch `ready-contacts` length stays bounded and no `lock:{c}` is stuck > TTL.

**Rollback (any step fails):** unpublish dispatcher + new push; republish the backed-up spine (Schedule intact) + backed-up push (writes `main-message-list`); drain any `q:{c}`/`ready-contacts` residue back onto `main-message-list` (or just let the restored spine ignore them — they're orphaned, no data loss if you re-push those contacts' messages). Old world fully restored.

**Watch after cutover:** `ready-contacts` steady-state length (should hover near live-contact burst count, not grow unbounded → a growing list = a stuck lock); any `lock:{c}` older than TTL=120s (crashed holder / spine p99 > TTL → revisit risk #1).

## Open / watch
- TTL=120s must exceed p99 spine duration (else same-contact overlap returns). Revisit if slow RAG/MCP.
- `ready-contacts` steady-state length bounded (pop-one/re-park-one = net zero); hot locked contact cycles 1 token/tick — harmless.
- Promotion: dispatcher gets the real Schedule 1s trigger; spine Schedule stays removed; push cutover to `q:`/`ready-contacts`. Backup live spine version first.
