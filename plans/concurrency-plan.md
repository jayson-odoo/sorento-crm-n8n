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

**Gotcha (n8n redis):** `pop`/`get` auto-parse a numeric phone id into a **JS number**. Key concats tolerate it, but `push` messageData and the `executeWorkflow` string input reject a number → wrap `String(...)` (`CS` in the SDK) and set contact-check If to `typeValidation: loose`. Redis node output shapes (verified via probe): `get`→`{propertyName: val|null}` (replaces json, no upstream fields), `incr`/`llen`→`{ "<key>": N }` (read `Object.values($json)[0]`), `pop`→`{propertyName: val}`.

## Promotion checklist (LIVE — user-gated, NOT done)
1. Backup live spine `9qVyfUxmRQqrpGRMDLRuz` version first.
2. New **prod dispatcher** from `dispatcher.sdk.js` with: keys de-`-test` (`ready-contacts`, `test:q:`→`q:`, `test:lock:`→`lock:`), `call-spine`→live spine `9qVyfUxmRQqrpGRMDLRuz`, trigger = **Schedule 1s** (drop the test webhook), guards intact (error branch stays).
3. **Live spine** `9qVyfUxmRQqrpGRMDLRuz`: remove Schedule trigger + retarget `redis-pop-main-message-list`.list → `=q:{{ $json.contact }}` + add `contact` trigger input. (Same 2 edits as the clone.)
4. **Live push** `sorento-main` `NwMOBEQ1NW7LVky5`: replace `Redis2 PUSH main-message-list` with `PUSH q:{{contact.id}}` (tail=true) + `PUSH ready-contacts` (tail=true, value contact.id). contact.id = `$('If1').first().json.id`.
5. Cutover order: push+spine+dispatcher must flip together (drain `main-message-list` first, or accept a brief in-flight gap). Publish each; verify a live 2-fast-message contact serializes.

## Open / watch
- TTL=120s must exceed p99 spine duration (else same-contact overlap returns). Revisit if slow RAG/MCP.
- `ready-contacts` steady-state length bounded (pop-one/re-park-one = net zero); hot locked contact cycles 1 token/tick — harmless.
- Promotion: dispatcher gets the real Schedule 1s trigger; spine Schedule stays removed; push cutover to `q:`/`ready-contacts`. Backup live spine version first.
