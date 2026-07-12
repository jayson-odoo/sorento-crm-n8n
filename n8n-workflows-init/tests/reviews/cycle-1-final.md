# Cycle 1 — FINAL Reviewer Sign-off (authoritative, post fail-closed redesign + Guard H)

**Verdict: APPROVE** (with explicit UNVERIFIED list + one cosmetic bug). The harness is **safe to
keep using for further test cycles**. Nothing in this cycle is eligible for promotion to live — cycle-1
added only test scaffolding.

Reviewer: sorento-reviewer (read-only). No workflows edited, no executions run by me.
Date: 2026-06-27. Method: static graph inspection via n8n MCP (`get_workflow_details`) + spot-check of
the §3 execution + subexecution via `get_execution`.

---

## What I independently verified (the load-bearing claims)

### 1. FAIL-CLOSED clone (`txiPzSxy3Pclsz6v`, 82 nodes, active:false) — CONFIRMED
Computed inbound-connection count over the clone's `connections` graph for every real egress/log node:

| node | inbound_count |
|---|---|
| `update-human-intervened` | **0** |
| `save-session-vars` | **0** |
| `send-message-files` | **0** |
| `send-message-images` | **0** |
| `send-message-video` | **0** |
| `Call 'sub-respond-save-message-redis'2` (sub `UrETd-…`, Guard H) | **0** |

All six are structurally unreachable. The real send/write/log paths cannot execute regardless of any
flag or payload. This is a genuine fail-closed posture (not flag-dependent) — matches the diff.

### 2. Every clone call site to the 3 shared subs passes `is_test = true` (literal) — CONFIRMED
8 call sites, all `is_test: true` (literal boolean, not an expression), `test_run_id` from the redis item:
- send sub `aoydkG1dbItXR5jXFEQsP`: `respond`, `respond2`, `respond3`, `respond4`, `respond5`,
  `…-transcribed-message` (6).
- human-intervention `rrYXzE61gCNUck_zmXe-G`: `Call 'sub-human-intervention'` (1).
- reformulator `XTODTw-dJcV0uRdC056hG`: `Call 'sub-query-reformulator'` (1, with `mock_reformulator_output`).

### 3. The 3 shared subs are PUBLISHED, guard-first, FALSE-branch intact — CONFIRMED; live unaffected
- **send `aoydkG1dbItXR5jXFEQsP`**: `versionId == activeVersionId` (c5547583). `When Executed → test-guard`
  (`is_test === true`, loose boolean). TRUE→`test-guard-record` (redis push `would_send`, record-only).
  FALSE→`If`→ real `Send a Message` (respondio) / `HTTP Request` (api.respond.io). Guard precedes every
  real send; live FALSE path intact & reachable.
- **human-intervention `rrYXzE61gCNUck_zmXe-G`**: `versionId == activeVersionId` (da86c8e9). `test-guard`
  (`is_test===true`). TRUE→`test-guard-record` (`would_write`). FALSE→`…-routed-to-pic2 →
  get-round-robin-assignee → if-conversation-unassigned → Assign / SLA POST / comment / assignee-queue Redis`.
  Guard precedes all assign/SLA/comment/queue writes; live path intact.
- **reformulator `XTODTw-dJcV0uRdC056hG`** (sub-semantic-parser): `versionId == activeVersionId` (b3979d8e).
  `test-reformulator-bypass` = AND(`is_test===true`, `!!mock_reformulator_output`). TRUE→`mock-reformulator-output`
  (0 tokens). FALSE→`AI Agent` (live gpt LLM). Intact on FALSE.

**Live re-confirmation:** LIVE `sorento-consume-main` (`9qVyfUxmRQqrpGRMDLRuz`, active, 75 nodes) — all 8
of its call sites to the 3 subs pass **`is_test` ABSENT / `test_mode` ABSENT**. Zero `is_test:true`
patterns anywhere in the live JSON. Therefore prod always takes the subs' FALSE (real) branch; the
published guards never fire for live traffic. `is_test` is a field introduced THIS cycle, so no
pre-existing live caller can set it truthy. **Live is unaffected.** (Note: I exhaustively checked the
primary live consumer; a full sweep of every other live workflow was not performed, but the new-field
argument covers it.)

### 4. No safety-relevant expression reads from the trigger node — CONFIRMED
`$('When Executed by Another Workflow')` reference count in the clone = **0**. The trigger schema
(`test_mode`,`scope`,`mock_*`) is declared-but-inert. All control rides the popped redis item
(`$('redis-pop-main-message-list').first().json.message.*`): verified for `parser-bypass-gate`
(`!!…message.mock_parser_output`) and `mock-parser-output`. This is what makes the MCP-can't-pass-inputs
problem moot.

### 5. Run-data cross-check — zero egress, §0 gate held — CONFIRMED (§3 spot-checked directly)
I pulled `get_execution` for the highest-risk case myself:
- **§3 clone exec `6742290`**: executed nodes end at `guard-h-record`; `Call 'sub-human-intervention'`
  received input `is_test:true`; **none** of `update-human-intervened`, `save-session-vars`,
  `send-message-*` appear in runData. Only `guard-d-record` + `guard-h-record` (redis records) fired.
- **§3 human-intervention subexec `6742292`** (the assignment/email-ripple guard): runData contains
  EXACTLY 3 nodes — `When Executed` (is_test:true) → `test-guard` (TRUE) → `test-guard-record`;
  `lastNodeExecuted: test-guard-record`. `get-round-robin-assignee`, `Assign or unassign a Conversation1`,
  `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, the assignee-queue `Redis`
  push, and `get-working-days` **did not run**. S2 (zero assignment/SLA/comment/queue writes) verified
  empirically, not just structurally.

The other passing cases are consistent with this mechanism and their run JSONs:
- §4 canary `canary-nsd-20260627` (exec referenced 6731044-series), §2 `6742128` (subexec 6742130
  send-sub short-circuit), §5 `6742420`, plus §1 `6742544` (blocked, see below). Every executed case
  reports zero orphaned-egress-node execution and `would_*` records only. **3 functional passes (§2, §3,
  §5) + 1 canary (§4) are legitimate zero-egress runs.**

---

## Cosmetic bug — `guard-h-record` malformed JSON (NOT an egress issue) — LOW severity
`guard-h-record.messageData` reads `$('tf-message').first().json.message.message.text`, one level too
deep (`tf-message.json` IS already the message object, so the correct path is `…json.message.text`).
The over-deep access yields an empty interpolation → the pushed record is non-parseable JSON
(`"message":  ,`). Impact is confined to a `would_log` record on the **test-scoped** redis list
`test:egress:{test_run_id}`; it is a redis `push` (operation `push`), never a respond.io/CRM call, and
the node's data passthrough (the contact object) is unaffected, so downstream flow is fine. **Not an
egress concern.** Fix is one-line for log hygiene; does not block approval.

---

## What remains UNVERIFIED (must be stated before any future promote)

| UAC | Branch | Status | Why unproven |
|---|---|---|---|
| **§1 / S4** | happy path + `get-rag → get-results` | **BLOCKED** | No resolvable product code. Placeholders `SRTWC7405-RL`, `SR-1234` don't resolve at the CRM `references/resolve` (domain `incoming`) → degrades to not-found (= §5). `Call 'sub-get-results'` never ran. **The READ-tool allowlist (never `crm_it_support_ticket_create`) is therefore UNTESTED.** Needs a known-good code from the user. |
| **§6** | partial-access / ask-for-access | **NOT RUN** | No partial-access dev contact (plan §7.1). `quick_reply` access-choice path unexercised. |
| **§7** | audio / transcription | **NOT RUN** | `Transcribe a recording` (Whisper) is a real API cost unless stubbed; coder deferred. |
| **§8** | attachment / media-send (guards e/f/g) | **NOT RUN** | Not in this batch. The 3 media egress nodes are orphaned (proven inbound=0) but the `get-presigned-url → send-message-*` flow was never exercised end-to-end. |

### Latent risk to flag for §1/§8 (important)
`Call 'sub-get-results'` (`Fss5aAaXthJSWpZCgKiKR`) and `Execute 'sub-get-rag'` (`tWP33QOFT7SxThfT`) are
called from the clone **without** an `is_test` guard and are **not** among the 3 published guarded subs.
They were never reached in cycle-1, so no egress occurred. But the moment §1 is run for real with a
resolvable entity, `sub-get-results` will execute a real MCP tool. Safety then rests ENTIRELY on the
resolved tool being in the read allowlist — there is **no structural guard** on get-results. Before
running §1/§8 against a real contact, the coder should either (a) add a fail-closed guard / read-tool
assertion around get-results, or (b) the tester must assert the resolved `tool` ∈ read allowlist
pre-execution. Treat §1 as not-yet-safe-to-run until that is in place.

---

## Misc / promote-hygiene notes
- DISCONNECTED_NODE validation warnings on the 5 orphaned egress nodes are **intended** (fail-closed).
  Pre-existing warnings (HARDCODED_CREDENTIALS x-api-key, disconnected `Code in JavaScript` /
  `…sendmsg-respond3`, builtInTools, Transcribe binaryPropertyName) also exist in LIVE — not introduced.
- Egress records still lack a literal `blocked:true` field; proof is record-presence + `kind`
  (`would_send`/`would_write`/`would_log`). Acceptable but a `blocked:true` field would make assertions
  unambiguous — nice-to-have for cycle-2.
- The harness clone diverges from live by design (orphaned egress + record nodes + 2 mock nodes). **A
  future promote must NOT copy the clone to live.** Only a separately-reviewed business-logic diff, with
  all `guard-*`/`test-guard`/`mock-*`/`is_test` scaffolding stripped, may be applied to
  `9qVyfUxmRQqrpGRMDLRuz`, backup-first, never mid-cycle. The 3 shared subs' published test-guards are
  the one piece that DOES live in prod — they are inert for prod (is_test never truthy) and may stay.
- `redis-pop-main-message-list` showed `credentials:null` via the read API (likely redaction); the seed
  run proved `sorento-redis` works on that instance. Re-attach if a run ever errors on the pop.

---

## Headline
**APPROVE.** Clone is structurally incapable of real egress (6 egress/log nodes inbound=0); 3 shared subs
PUBLISHED with guard-before-egress and live FALSE branch intact; live consumer passes no truthy `is_test`
so prod is unaffected; §2/§3/§5 + §4 canary are legitimate zero-egress passes (S2 verified directly from
subexec 6742292). Harness is safe to keep using.
**UNVERIFIED:** §1/S4 (read-tool allowlist — blocked on a resolvable product code; get-results is
currently UNGUARDED), §6 (partial-access contact), §7 (audio/Whisper), §8 (media-send).
**Bug:** `guard-h-record` malformed-JSON record — cosmetic, log-only, non-egress, LOW.
