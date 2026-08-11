# UAC — quick-reply chunking (WhatsApp 1024-char interactive body cap)

**Status:** built + tested on the fork, **promote HELD** (user-gated).
**Date:** 2026-08-11

## Defect

A buttoned reply was sent as ONE message. WhatsApp caps an interactive message's `body` at 1024
chars; respond.io rejects a longer one:

```
min body is 1, max body is 1024, parameter value is not valid
```

`sub-sendmsg` (`aoydkG1dbItXR5jXFEQsP` @ `c712e218`) had two send paths and only one chunked:

| path | chain | chunks? |
|---|---|---|
| plain text | `If[0]` → `Code in JavaScript` (LIMIT 1800) → `If1` → `Loop Over Items` → `Send a Message` | ✅ |
| **quick_reply** | `If[1]` → `HTTP Request` | ❌ |

`HTTP Request` carries **no `onError`, no retry, no error output**, so the 400 killed the whole
execution — the customer received **nothing**, not even the plain text. Observed on the real
SRTWT6813 incoming-miss turn: reply = **1191 chars** vs the 1024 cap.

Only one caller feeds `quick_reply`: spine `sorento-sub-respond-sendmsg-respond2` ←
`crossdomain-compose`. So `sub-sendmsg` is the single choke point.

## Build target

**`aQUmwMVplmNcyUVc` — `sub-sendmsg-QRCHUNK`** = LIVE `c712e218` + 7 hunks + CHAT's console branch.

Built off LIVE, **not** off `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), which is structurally divergent
(6 extra nodes) and **lacks the `(quick_reply)` logger entirely` — copying it would have regressed live.
See [[stale-byte-identical-fork-claim]].

The clone's **9** sendmsg callers (CLAUDE.md says 8 — stale) all repointed here; every one already
passes `is_test=true`, verified before repointing because the guard **fails open** on a missing flag.

## The 7 hunks

1. `Code in JavaScript` — `LIMIT` 1000 when `quick_reply` non-empty, else 1800 (unchanged).
2. Split-floor `800` → `Math.floor(LIMIT * 0.45)`, so a 1000-limit chunk still breaks on a line
   boundary instead of hard-cutting mid-field.
3. Each part carries `quick_reply` (**LAST part only**) + `contact_identifer` — `HTTP Request` now
   reads `$json` from the loop, not from the trigger.
4. Buttoned part carries the **WHOLE** `result_set`. It is the message a tap quotes, so its quote
   must resolve every offered row. Preserves today's behaviour, where the `(quick_reply)` row stored
   `result_set` whole.
5. Fallback: if NO part matched a numbered item, the whole set rides part 1 instead of vanishing.
   Live drops it to `[]` on **every** part of a multi-part unnumbered reply — a pre-existing bug,
   closed here.
6. Guard repositioned: `test-guard` sat between the trigger and the chunker, so a zero-egress run
   exercised **none** of the changed logic. Now `guard-qr` / `guard-text` sit between the chunker and
   the two real senders. Both real-egress nodes remain gated; guards are stripped at promote.
7. `chat-build-parts` (console mirror) chunks buttoned replies too — otherwise a post-promote console
   check shows the OLD single-message behaviour and reads as "not fixed".

Plus, defence in depth: both save-message callers repointed from the live prod logger
`UrETd-jm46tFj3Xw7w8vL` to the harness fork `tWm5DYLxfypmVC1T` (unconsumed sink), so even a guard
fail-open cannot write prod `chat_histories`. **Revert at promote** — this is a guard artifact.

## Evidence

### Offline unit — `tests/unit/sendmsg-quickreply-chunk.test.js`

15 cases, **15 passed**. Mutation pass: 6 mutants, each caught by the specific test meant to catch it
(no vacuous assertions — see [[green-that-cannot-fail]]).

| mutant | caught by |
|---|---|
| LIMIT always 1800 | cap test |
| buttons on every part | last-part-only test |
| buttoned part uses subset | whole-set test + exactly-one-part test |
| drop the no-numbering fallback | reachability test |
| drop `contact_identifer` carry | carry test |
| whole set on every part (the rejected option) | duplication + subsetting tests |

The **shipping** node body was extracted back out of the built workflow, wrapped in a `$()` shim, and
run against the same 15 cases — **15 passed**. The tested logic and the deployed logic are the same
code, not a claim.

Measured on the real turn:

```
BEFORE (live): 1 part, len 1191   -> exceeds 1024 -> 400 -> execution dies
AFTER:  part 1/2  len=989  buttons:no   result_idx=[]
        part 2/2  len=200  buttons:YES  result_idx=[1..10]
```

### Integration — fork exec `12036346` (`test_workflow`, pinned)

`Code`/`If`/`Loop` ran for real; credentialed + HTTP nodes pinned, so zero egress by construction.

- `Code in JavaScript` → 2 parts, `total_parts:2`; part 1 `quick_reply:""` `result:[]`; part 2
  `quick_reply` set, `result` = all 10 rows ✅
- `is-last-quickreply` run 0 → FALSE branch (`guard-text`); run 1 → TRUE branch (`guard-qr`) ✅
- `guard-qr` / `guard-text` with `is_test:true` → both took output 0 → recorders ✅
- **`HTTP Request` and `Send a Message` have NO runData entries — they never executed.** Zero egress
  proven structurally, not by a shared counter (see [[s7-llen-gate-unsound]])
- `Loop Over Items` contextData: `currentRunIndex:2, maxRunIndex:2, noItemsLeft:true, done:true` —
  loop consumed both parts and terminated; the return-to-loop edges do not stall ✅
- `lastNodeExecuted: Chat Memory Manager` — the loop-done branch ran, so hunk 7's consolidation
  (memory inserted once at loop end for BOTH paths) works ✅

### Clone lane — run `qrchunk-140523`

Confirms the fork is reached through the real spine: `guard-record-text` fired with the new per-part
payload shape (`part`/`total_parts`/`message_len`/`result_idx`) and the guard blocked.

That turn took the **total-miss** path (1 part, 104 chars, no buttons), so it does not exercise
chunking. Also surfaced [[uac-mode-reads-prod-session]]: a stale entity `welps WEP2352-6` carried
in from 437264483's prod session.

### Reply-to resolution — CRM side

`sorento_crm_backend/tests/test_chat_history_multipart_turn.py` — 8 cases, **8 passed**; existing
`test_chat_history_result_set.py` 27 still green. Local DB, fixture rolls back, no prod contact.

3 service mutants, all caught, service restored clean:

| mutant | caught by |
|---|---|
| `referenced_state` keyed on `message_id` instead of `turn_id` | 3 tests |
| `referenced_result_set` ignores `message_id` | 4 tests |
| `referenced_result_set` drops the contact scope | scoping test |

**The answer to "does a pick still resolve when the turn spans messages":**

| quoted part | domain / intent / entities | result set |
|---|---|---|
| part 1 | ✅ identical | part 1's subset |
| part 2 | ✅ identical | part 2's subset |
| part 3 (buttoned — what a tap quotes) | ✅ identical | **whole set** |

`referenced_state` resolves quoted row → `turn_id` → the turn's incoming `state_trace`. All parts of
one turn share `$execution.id`, so **domain cannot vary by part**. `referenced_result_set` resolves
per `message_id`, which is why the buttoned part carries the whole set.

**Documented consequence, not a defect:** on the real SRTWT6813 shape (no `1.`/`2.` numbering),
quoting the *stock-list* part alone resolves zero rows — but still resolves the correct domain, so it
degrades to a domain-correct re-ask, not a stateless one. Taps quote the part that does resolve.

## Coverage gap

The `is_test:false` variant of exec `12036346` — proving the buttoned part routes to `HTTP Request`
and plain parts to `Send a Message` — was **blocked by the Claude Code classifier** and not run.
(`test_workflow` pins both nodes, so it would not have sent anything, but the block was not worked
around.) Residual risk is low: the wiring `guard-qr[1] -> HTTP Request` / `guard-text[1] -> Send a
Message` is verified in the read-back GET, and both If outputs are exercised elsewhere in the same
execution. **Not empirically proven.**

Also unproven: real WhatsApp delivery ordering of N parts, and that a real button tap arrives with
`replyTo` pointing at the buttoned message. Both need a send to a real contact — user's call.

## Promote checklist (HELD — user-gated)

Target: live `aoydkG1dbItXR5jXFEQsP`. Hash-gate on `c712e218` first.

1. Back up live `sub-sendmsg` (export dir `sub-sendmsg/` is the pre-promote snapshot @ `c712e218`).
2. Port hunks 1–5 to `Code in JavaScript` + the `(quick_reply)` save-message node.
3. Add `is-last-quickreply`; rewire `Loop Over Items[1]` → it; `[0]` → `HTTP Request`,
   `[1]` → `Send a Message`. Delete the old `If`.
4. `HTTP Request` → `(quick_reply)` logger → `Loop Over Items` (close the loop).
5. Drop `HTTP Request` → `Chat Memory Manager`; the loop-done branch covers both paths.
6. **STRIP the guards** — no `guard-qr` / `guard-text` / recorders on live; keep live's own
   `test-guard` right after the trigger.
7. **REVERT** both save-message callers to `UrETd-jm46tFj3Xw7w8vL`.
8. Do NOT port the console branch (`chat?` / `chat-build-parts` / `chat-push` / `console-loggable?`
   / `log-chat-history-n8ntest`).
9. Re-export + `--verify`; confirm `versionId == activeVersionId`.
10. Rollback = publish `c712e218`.

Note `build-suggest-offer` emits `[...codes, YES, NO]` with no count cap; WhatsApp allows max 3 reply
buttons. Separate failure mode, out of scope here.
