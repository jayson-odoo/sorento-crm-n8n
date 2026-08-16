# Dispatcher lock-release robustness fix

**Change-id:** dispatcher-lock-release-fix
**Date:** 2026-07-14
**Target (clone lane only):** `zz-dispatcher-test` `2D0cw2Y1aPW2LOlU`
**New active versionId:** `4be6a9de-9fcd-428b-b9b1-ea895c56f32a` (draft == active; published)
**Prior active versionId:** `1d863842-e3e4-411d-9fe5-63b158dcf0a6`
**Live spine (`9qVyfUxmRQqrpGRMDLRuz`) NOT touched — read-only inspection only.**
**Spine clone (`txiPzSxy3Pclsz6v`) NOT touched — no console/persistence node changed.**

## Bug being fixed (from `tests/runs/concurrency-fifo-singleflight-20260714.md` §FINDING)

On a **successful** spine run the dispatcher's happy-path release never fired:
`call-spine` (the `executeWorkflow` blocking sub that runs the spine clone) returned
`data.main:[[],[]]` — **both outputs empty** — because the spine clone's new terminal
executed node is `console-incoming-gate` (a chat-console persistence addition, commits
07-13/14) which emits an **empty** connected output. A sub-workflow returns the items of
its last-executed node, so `call-spine` returned 0 items → the downstream
`del-lock` (DELETE `test:lock:{c}`) and `rearm-more` (re-push ready token if
`llen test:q:{c} > 0`) **never ran** (a node with 0 input items does not execute).
Net effect: the per-contact lock cleared only via its **120s TTL**, and the queue did not
auto-rearm on success → next same-contact message waits up to 120s. Single-flight / FIFO /
no-clobber correctness stayed intact; only throughput degraded.

Root cause is that the release path depended on the spine emitting a non-empty terminal
item. The fix makes the release **independent of how many items the spine returns**, and is
confined entirely to the dispatcher (the spine's `console-incoming-gate` and every
console-persistence node are left byte-identical).

## Node changes (2 settings ops, one atomic `update_workflow`, then `publish_workflow`)

### 1. `call-spine` (`n8n-nodes-base.executeWorkflow` v1.3, id `3756f155-…`)
Guarantees ≥1 item flows into `del-lock` even when the spine's terminal output is empty.

| field | before | after |
|---|---|---|
| `alwaysOutputData` | (unset → default false) | **`true`** |
| `onError` | `continueErrorOutput` | `continueErrorOutput` (preserved) |
| `parameters` | unchanged | unchanged (still `workflowId=txiPzSxy3Pclsz6v`, `contact` input, `waitForSubWorkflow:true`) |

**Mechanism / release guarantee:** `alwaysOutputData:true` makes n8n emit a single empty
item `[{}]` on the node's **main output (index 0)** when the node would otherwise produce no
data. So on a successful spine run that returns 0 items, `call-spine` output[0] becomes
`[{}]` → `del-lock` receives one item → the whole success release chain
(`del-lock → llen-q → more-in-queue? → rearm-more`) runs. This is the **only** n8n-native
way to make a downstream node run when its source emitted 0 items (a normalizing Set/Code
node placed downstream would itself receive 0 items and also not run), so it is applied on
the emitting node itself.

### 2. `del-lock` (`n8n-nodes-base.redis` delete, id `61db208c-…`)
Keeps the release exactly-once so the **error branch behavior is unchanged**.

| field | before | after |
|---|---|---|
| `executeOnce` | (unset → default false) | **`true`** |
| `parameters` | unchanged | unchanged (DELETE `test:lock:{{ $('pop-ready-contacts').first().json.contact }}`) |

**Why:** `call-spine` has **two** connections into `del-lock` — output[0] (success) and
output[1] (error, from `continueErrorOutput`). With `alwaysOutputData:true` there is a
version-dependent possibility that on the **error** path n8n pads output[0] to `[{}]` while
output[1] still carries the error item → `del-lock` would receive **2** items → `llen-q` /
`more-in-queue?` / `rearm-more` would process 2 items → **double token rearm**. Setting
`executeOnce:true` on `del-lock` collapses any 1-or-2 item input to exactly one processed
item, so the release chain rearms **at most one** ready token regardless — preserving the
T3 error-branch guarantee (release lock + rearm once). The lock key uses
`$('pop-ready-contacts').first()`, independent of the input item, so `executeOnce` does not
change which lock is deleted.

## What was intentionally NOT changed
- Acquire/lock logic (`pop-ready-contacts`, `get-lock`, `lock-free?`, `incr-lock` INCR
  arbiter, `acquired?`, `rearm-lost`/`rearm-busy` re-park) — untouched.
- The `call-spine → del-lock` connections (both out[0] and out[1] → `del-lock`) — untouched.
- The spine clone `txiPzSxy3Pclsz6v` and its `console-incoming-gate` / console-persistence
  nodes — untouched (the dispatcher now tolerates an empty spine terminal rather than
  depending on the spine changing).
- Zero egress: the dispatcher touches only `ready-contacts-test` / `test:lock:{c}` /
  `test:q:{c}` redis keys and calls the fail-closed spine clone with `is_test` semantics —
  no new egress surface introduced.

## Release guarantee (summary)
- **Success (0-item spine terminal):** `alwaysOutputData` → `del-lock` gets `[{}]` → lock
  DELETEd + `llen test:q:{c} > 0` ? re-push one `ready-contacts-test` token. Auto-drain
  restored; no 120s TTL wait.
- **Success (≥1-item terminal):** `del-lock` gets the real items, `executeOnce` collapses to
  one → single delete + single rearm.
- **Error (spine throws):** output[1] error item → `del-lock` (executeOnce → one item) →
  lock DELETEd + conditional single rearm — same as pre-fix T3 behavior.

## Live-spine terminal-shape finding (read-only, for promote)
Inspected LIVE spine `9qVyfUxmRQqrpGRMDLRuz` (active versionId
`bcdb5633-f760-451b-b0a8-fc03a0d884c8`, 86 nodes) read-only. Terminal nodes (no outgoing
main connection):

| terminal node | type | emits ≥1 item? |
|---|---|---|
| `sorento-sub-respond-sendmsg-respond3` | executeWorkflow (send sub) | yes (sub output) |
| `sorento-sub-respond-sendmsg-respond-transcribed-message` | executeWorkflow | yes (sub output) |
| `Call 'sub-respond-save-message-redis'2` | executeWorkflow | yes (sub output) |
| `save-session-vars` | httpRequest (PUT) | yes (HTTP response item) |
| `update-human-intervened` | respondio node | yes (response item) |
| `transcribed-message` | code | yes (returns items) |
| `Execution Data` | executionData | yes (passes input through) |

**Finding:** unlike the clone (whose new `console-incoming-gate` terminal emits an *empty*
connected output → the exact bug above), **every** live terminal is a real emitter
(sub-call / HTTP / code / executionData) that returns ≥1 item on its main output on any real
branch. So **live is NOT currently broken the way the clone is** — a dispatcher calling the
live spine would normally get ≥1 item and release on success today.

**Implication for promote:** the same release-robustness fix (`alwaysOutputData:true` on the
promoted dispatcher's `call-spine`, `executeOnce:true` on `del-lock`) is **recommended and
sufficient** but not strictly required to fix a live breakage. Apply it anyway on the
prod dispatcher for defense-in-depth against any edge branch whose last-executed node emits
0 items (e.g. an IF false-branch that dead-ends at an empty-output node), so the prod
release never depends on terminal item count.
