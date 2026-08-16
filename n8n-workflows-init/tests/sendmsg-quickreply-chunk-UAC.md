# UAC — quick-reply chunking (WhatsApp 1024-char interactive body cap)

**Status:** ✅ **PROMOTED LIVE 2026-08-11** — `aoydkG1dbItXR5jXFEQsP` @ `91171ac3`, draft == active.
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
2. Split-floor becomes `quickReply ? 450 : 800`, so a 1000-limit chunk still breaks on a line
   boundary instead of hard-cutting mid-field. **800 is kept verbatim on the plain path** — see
   review finding R1.
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

23 cases, **23 passed**. Mutation pass (`sendmsg-quickreply-chunk.mutate.py`): 19 mutants,
**18 caught + 1 justified survivor**, each caught by the specific test meant to catch it
(no vacuous assertions — see [[green-that-cannot-fail]]).

| mutant | caught by |
|---|---|
| LIMIT always 1800 | cap test |
| buttons on every part | last-part-only test |
| buttoned part uses subset | whole-set test + exactly-one-part test |
| drop the no-numbering fallback | reachability test |
| drop `contact_identifer` carry | carry test |
| whole set on every part (the rejected option) | duplication + subsetting tests |
| proportional plain-path floor (R1) | plain-path byte-identity test |

The **shipping** node body was extracted back out of the built workflow, wrapped in a `$()` shim, and
run against the same 23 cases — **23 passed**. The tested logic and the deployed logic are the same
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

~~The `is_test:false` variant~~ **CLOSED by exec `12052223`** — see R2 above.

Still unproven: real WhatsApp delivery ordering of N parts, and that a real button tap arrives with
`replyTo` pointing at the buttoned message. Both need a send to a real contact — user's call.

## Promote — DONE 2026-08-11

Hash gate: live was `c712e218`, draft == active, matching the reviewed export baseline. Backup at
`tests/backups/sub-sendmsg-PRE-qrchunk-c712e218.json`.

16 operations applied to the draft, verified BEFORE publishing:

- guard artifacts absent (`guard-qr`/`guard-text`/recorders/console branch): **none present**;
- live's own `test-guard` + `test-guard-record` retained;
- both save-message callers still target the **prod** logger `UrETd-jm46tFj3Xw7w8vL` (the harness
  sink repoint was a fork-only guard and was NOT carried over);
- old `If` removed, `is-last-quickreply` added, loop closes through both branches;
- promoted `Code in JavaScript` is **byte-identical** to the tested fork body (comments/blank
  normalised) and carries no `is_test` / `test_run_id` / `chat_id` reference;
- the promoted body was re-shimmed and run against the 23-case suite: **23 passed**.

Published `91171ac3`; re-read confirms `versionId == activeVersionId`. Exports re-synced.

**Rollback:** publish `c712e218` (or PUT the backup file above).

Original checklist, for reference:

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


## Review findings

Self-review before promote. Three findings, all in code I had written.

### R1 — plain-path split boundaries silently changed (FIXED)

Making the floor proportional (`Math.floor(LIMIT * 0.45)` = 810 for the plain path, up from 800)
changed the **plain** path, which this change is supposed to leave alone. Any message whose only
newline before 1800 falls in `[800, 810)` split differently:

```
newline@800..809   BEFORE parts=[800,1800,200]   AFTER parts=[1800,1001]
```

Fixed to `quickReply ? 450 : 800`, so the plain path is byte-identical to live. Locked by a new
regression case sweeping newline positions 780–830 and asserting `AFTER == BEFORE`; it fails when
the proportional floor is restored.

### R2 — `$('Loop Over Items').item` in the quick_reply logger (CLOSED — exec `12052223`)

The `(quick_reply)` save-message node now sits inside the loop and reaches back with
`$('Loop Over Items').item`. This is **new**: on live that node is not in a loop and read the
trigger instead.

It could not be exercised. With `is_test=true` the guard blocks the send branch, so the node never
runs; the `is_test=false` pinned run that would reach it was blocked by the Claude Code classifier
and not worked around.

If n8n cannot resolve the paired item it throws *"Can't determine which item to use"* — which
would kill every buttoned turn, i.e. **the same symptom as the bug being fixed**.

Assessment: risk is low but real. Live's plain-path sibling uses the identical idiom at
`Loop → Send a Message → save-msg1` and works in production. Mine is
`Loop → is-last-quickreply → guard-qr → HTTP Request → save-msg`, and exec `12036346` shows
`pairedItem` surviving both If nodes. The only unverified hop is `HTTP Request`, the same class of
hop as `Send a Message` in the proven path.

**CLOSED.** Exec `12052223`, `is_test:false`, senders pinned, save-message nodes left unpinned so
their expressions evaluated for real:

```
Call '…(quick_reply)'  executionStatus: success      <- the paired item RESOLVED
  message : part 2 text (buttoned part), not the full reply   <- R3 fix confirmed live
  result  : all 10 rows                                       <- whole set on the buttoned part
  subExec : 12052225 -> tWm5DYLxfypmVC1T                      <- harness sink, not the prod logger
Call '…redis'1         message: part 1, result: []            <- per-part subset preserved
HTTP Request           {"status":"PINNED-NOT-SENT"}  <- reached from guard-qr output 1
Send a Message         {"status":"PINNED-NOT-SENT"}  <- reached from guard-text output 1
```

No "Can't determine which item to use". This run also closes the coverage gap below: the real-send
routing (buttoned part -> HTTP Request, plain parts -> Send a Message) is now empirically proven,
with both senders pinned so nothing was transmitted.

**Egress audit for this run** (asked before running, verified not asserted):
- both senders pinned — `PINNED-NOT-SENT` echoed back in their runData, respond.io never called;
- `Chat Memory Manager` + `Postgres Chat Memory1` (binds **prod** `sorento-crm-db`) pinned — verified
  returning the pin value rather than inserting;
- the unpinned loggers call `tWm5DYLxfypmVC1T`, which is **2 nodes**: trigger + one RPUSH to
  `sorento-respond-message-TEST`. No HTTP node, no respond.io node;
- enumerated **all 110 workflows over REST** (MCP hides archived — [[mcp-hides-archived-workflows]]):
  the only reader of that list is `zz-canary-read`, **inactive**, 8 Redis reads, no send node. Dead end;
- contact was `437264483`, the dev contact.

### R3 — quick_reply logger passed the FULL message, not the part (FIXED)

Its top-level `message` input still read the trigger while `data.message` read the part, so the two
disagreed and the head parts would have been logged with the whole reply text. The plain-path
sibling uses the part in both. Cause: the build script patched only inside the `data` JSON. Both
loggers now read `$('Loop Over Items').item.json.message` in both places.


### R4 — the char-based cap is not sufficient; replies are multi-byte (FIXED)

Found by applying LESSONS §72's *"100% on first run is a smell"* heuristic and hunting survivors.
A broader sweep produced **4 survivors out of 9**, three of which were real gaps.

`LIMIT = 1000` counts **characters**. Customer-facing text is full of multi-byte glyphs:

```
crossdomain-render.js:110   line += '\n⚠️  *(PRODUCT DISCONTINUED)*';     ⚠️ = 6 bytes
build-suggest-offer.js:100  `${i+1}. ${s.code} — ${...}`                  — = 3 bytes
not-found-error-message.js:206  `• ${et}: ${codes[0]}`                    • = 3 bytes
compile-current-state.js:236  '… catalogue* and I'll pull it up 😊'       😊 = 4 bytes
```

Meta documents the cap as 1024 **characters**, but its validators are inconsistent about chars vs
UTF-8 bytes across endpoints, and that cannot be settled from here. A 900-char run of em-dashes is
2700 bytes — char-legal, byte-illegal. If the cap is bytes, the original fix would still 400 and
the turn would still die.

Byte-capping is strictly dominant: a no-op if the limit really is characters, and the difference
between working and a dead turn if it is bytes. Added `BYTE_CAP = quickReply ? 1000 : Infinity`
with a shrink loop, **button path only** so the plain path keeps live's exact boundaries (R1).

Also added a surrogate-pair guard: the hard-cut branch (`at = lim`, reached when there is no
newline or space in the window) could slice an astral glyph in half and emit a lone surrogate.

**`TextEncoder` availability was the risk that mattered** — if n8n's Code sandbox did not expose
it, the node would throw on every buttoned turn. Verified in the real runtime: fork exec
`12039174`, `executionStatus: "success"`, emoji-heavy payload, 715 chars / 815 bytes → 1 part
(correct, both caps satisfied).

### R5 / R6 — two assertions were near-vacuous (FIXED)

The survivor hunt showed that dropping `.trim()` on each part and setting the button-path `FLOOR`
to 0 both went undetected: the "no text lost" test normalised whitespace away, and the
"no mid-line cut" test used a regex loose enough to pass either way. Replaced with assertions on
the **chosen boundary** (parts must end on a record boundary), on exact trimming, and on the
hard-cut/early-newline branches that were previously unreachable by any fixture.

### R7 — my own mutation sweep scored a crash as a survivor (FIXED)

The first sweep mis-escaped a regex anchor; the anchor assertion fired, the mutant was never
applied, the suite ran against unmutated code and passed — and the sweep printed `SURVIVED`. That
is precisely §72's failure mode reproduced in a new harness. The committed
`sendmsg-quickreply-chunk.mutate.py` therefore separates three outcomes (`caught` / `SURVIVED` /
`ERROR`), hard-fails on anchor-miss and zero-byte mutations, refuses to run when `after()` has
drifted from the deployed node body, and does **not** count a justified survivor as a detection.
