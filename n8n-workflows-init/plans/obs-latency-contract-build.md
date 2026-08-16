# Observability latency contract — BUILD + UAC spec (C1–C4)

Companion to `obs-latency-contract-plan.md` (design + recon). That plan's §0 corrections stand.
This document is the executable spec for coder → tester → reviewer.

- **scope: `deterministic`** — no change touches the parser or get-results. Every UAC case below
  runs with `mock_reformulator_output` injected (0 parser tokens). Tester uses the cheapest tier.
- **C5 DONE** (consumer header `X-Source: n8n` on `insert-message`, published live). **C6 dropped.**
- **DOCS-ONLY at planning time.** Nothing below has been built. No workflow was edited, no
  execution run, nothing published, during the recon that produced this spec.

Recon date 2026-07-21. All IDs/versionIds below were read live from MCP on that date.

---

## §A. Recon answers (the 6 questions) — grounded, do not re-derive

### A1. Live graph facts confirmed

| fact | value |
|---|---|
| save sub `UrETd-jm46tFj3Xw7w8vL` | published (`485413d5` == active). 2 nodes. `Redis push list="sorento-respond-message" messageData={{ $json.data }}`. Only `data` forwarded — plan §0.1 confirmed. |
| live sendmsg `aoydkG1dbItXR5jXFEQsP` | published (`8cf1b465` == active). **Already contains** `Call 'sub-respond-save-message-redis' (quick_reply)` — the LOGFIX fork was promoted. |
| spine `9qVyfUxmRQqrpGRMDLRuz` | draft `e26437e5` / active `6a0a0a5c`, 101 nodes each. |
| clone `txiPzSxy3Pclsz6v` | published (`5a934898` == active), 135 nodes. |

### A2. Q3 — spine DRAFT vs ACTIVE diff → **PUBLISH IS SAFE**

`get_workflow_details` on this MCP surface **does** return an `activeVersion` block (nodes +
connections). LESSONS §23 ("MCP cannot read the active node bodies") is **outdated** — a full
draft-vs-active diff is available via MCP. Update LESSONS.

Diff performed (node-id set + per-node `parameters` sha + connections):

- node id sets: **identical** (101 == 101, no adds/removes)
- connections: **byte-identical**
- disabled flags: none either side
- **exactly one node differs: `send-transcript-confirm`** (`97e84805-aaed-4c59-8f56-15dd287af427`)

The entire delta is `parameters.workflowInputs.schema`: `[]` in active, populated with 9
descriptor entries (`contact_identifer, message, quick_reply, input_message, test_run_id,
started_at, contact, result_set, is_test`) in draft. That is n8n's **UI-cached input-schema
hint** for the sub — it is display metadata, has no runtime effect, and contains **no expression
or value change**. It was created by someone opening that node in the editor after the
ideation/voice promotion.

**Verdict: the spine draft carries no uncommitted business logic. Publishing the spine will not
revert anything.** C1/C4 are unblocked. (Still follow LESSONS §25: sha the changed nodes before
and after publish.)

`sorento-main` (`NwMOBEQ1NW7LVky5`) also diverges — draft `415ff490` / active `952fc09a`, delta =
`in-failover?` `typeValidation` **draft=`strict`, active=`loose`** (note the direction: the plan
wrote "strict→loose"; the *draft* is the strict one, so publishing would **tighten** the live
failover gate). **This does not matter, because C4 requires no edit to `sorento-main` at all
(see A5). Do not publish `sorento-main`.**

### A3. Q2 — which sendmsg fork does the clone call?

**Neither candidate in the question's list that you'd expect.** All 8 clone sendmsg callers point
at **`ublq9nSlrpz63xan` = `sub-sendmsg-CHAT`** (published `5f73b96a`). Not `aoydkG1…` (live), not
`uoO5eiJFXA8THrry` (LOGFIX).

Two consequences, both material:

1. **`sub-sendmsg-CHAT` is STALE relative to live.** It was forked 2026-07-13, before the
   quick_reply logger was promoted to live on 2026-07-14. It has **no**
   `Call 'sub-respond-save-message-redis' (quick_reply)` node — its `HTTP Request` node has no
   outbound connection at all. So the fork the clone exercises is **missing one of the two save
   calls C3 must modify.** Building C3 on `sub-sendmsg-CHAT` cannot cover the quick_reply branch.
2. Per LESSONS "rebase on live then fix", C2/C3 must be built on a **fresh fork of the CURRENT
   live sub** — see §B2. Promote target remains live `aoydkG1dbItXR5jXFEQsP`.

**Also stale in CLAUDE.md — flag loudly:** the clone's `Call 'sub-query-reformulator'` now points
at **`wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`)**, *not* the live
`XTODTw-dJcV0uRdC056hG` that CLAUDE.md records. Irrelevant to C1–C4 (deterministic scope, parser
mocked) but CLAUDE.md's clone-wiring table is wrong and should be corrected.

**⚠️ LOUD FLAG — unrelated to this change, but found in the ACTIVE live spine:**
`Call 'sub-get-results'` and `probe-incoming` on the **live, active** spine target
**`rysSPgUssLDf6xJc` = `sub-get-results TEST`**, while `sibling-probe` targets the live
`Fss5aAaXthJSWpZCgKiKR`. Live production traffic is running through a workflow named "TEST".
This may be intentional (a fork promoted by rewiring) or fallout from the ideation/voice
promotion. **Out of scope for C1–C4 — do not fix here — but it needs a decision from the user.**

### A4. Q4 — voice path: messageId survives, and the incoming save IS reached

Both halves confirmed by code inspection; no execution needed.

Shape (per `patch-transcript`'s own grounded comment, exec 9240705):
`redis-pop.json.message` = queue item `A`; `A.message` = `B` (**tf-message returns `B`**, via
`return $input.first().json.message.message`); `B.message.message` = `E` `{text,type,attachment}`.
`messageId` sits on `B.message`, i.e. `$('tf-message').first().json.message.messageId`. Consistent
with the existing blob's `$('tf-message').first().json.message.message.text` (= `E.text`).

1. **messageId survives `patch-transcript` → `tf-message`.** `patch-transcript` deep-clones the
   whole queue item (`JSON.parse(JSON.stringify(src))`) and mutates **only** `E.text`, `E.type`,
   `E.attachment`. `messageId` is a *sibling of* `.message` one level above `E` and is never
   touched. It is carried through verbatim.
2. **The incoming save IS reached on a voice turn.** On the spine,
   `Call 'sub-respond-save-message-redis'2` hangs off `if-message-is-audio` **output index 1
   (FALSE)**, alongside `get-session-vars`. Output 0 (TRUE) is dead-empty. `if-message-is-audio`
   tests `$('tf-message').first().json.message.message.attachment.type == "audio"`, and
   `patch-transcript` **deliberately sets `E.attachment.type = 'text'`** (its comment says so
   explicitly: "so the EXISTING downstream `if-message-is-audio` gate takes its normal FALSE
   branch"). A transcribed voice turn therefore takes FALSE and hits the save. ✅

   Precision note: voice messageIds are real respond.io incoming ids, so the §0.2 whole-second
   caveat applies to them identically. No special handling.

### A5. Q5 — all 9 sendmsg callers, and who gets `turn_id`

Read from the spine's **active** version. Exactly 8 spine callers, all → `aoydkG1dbItXR5jXFEQsP`.

| # | caller node (spine, active) | current inputs | turn_id? |
|---|---|---|---|
| 1 | `sorento-sub-respond-sendmsg-respond` | contact, contact_identifer, input_message, message | **YES** |
| 2 | `sorento-sub-respond-sendmsg-respond2` (quick_reply path) | contact, contact_identifer, input_message, message, quick_reply, result_set | **YES** |
| 3 | `sorento-sub-respond-sendmsg-respond3` | contact, contact_identifer, message | **YES** |
| 4 | `sorento-sub-respond-sendmsg-respond4` | contact, contact_identifer, input_message, message, result_set | **YES** |
| 5 | `sorento-sub-respond-sendmsg-respond5` | contact_identifer, input_message, message — **no `contact`** | **YES** |
| 6 | `sorento-sub-respond-sendmsg-respond-transcribed-message` | contact_identifer, message — **no `contact`** | **YES** |
| 7 | `send-transcript-confirm` | contact, contact_identifer, input_message, message | **YES** |
| 8 | `send-voice-not-allowed` | contact, contact_identifer, input_message, message | **YES** |
| 9 | `sorento-main` › `Call 'sorento-sub-respond-sendmsg-respond'` (rate-limit notice) | contact_identifer, message only | **NO — deliberate** |

All 8 spine callers get `turn_id: {{ $execution.id }}`. Caller 9 gets **nothing**: the incoming
that triggered it is dropped before the queue, so it has no paired incoming row and must stay out
of the SLA denominator (handoff §Change 3). **Because caller 9 needs no edit, `sorento-main` is
never touched and never published** — which is what keeps its `in-failover?` draft divergence
(A2) harmless.

Pre-existing defect **re-confirmed, still out of scope**: callers 5 and 6 pass no `contact`
object, yet the sub's save blobs dereference `contact.phone` / `contact.firstName`. Caller 9 has
the same hole. Do not fix here; log it as backlog.

### A6. Q1 — the TEST SINK PROBLEM

Confirmed on the clone: `Call 'sub-respond-save-message-redis'2` has **0 inbound connections**
(orphaned) and targets the **real** save sub `UrETd-…`, which RPUSHes to the **real prod ingest
list** `sorento-respond-message`, drained by `redis-consume-queue-mongo` into the prod CRM.
Un-orphaning it as-is would write to prod. Zero prod ingest writes is non-negotiable.

**Options evaluated:**

- **(c) assert the rendered expression only via the egress log** — *rejected.* There is no
  `would_write` guard on the save call today, so (c) requires building a new guard node anyway —
  the same amount of work as a fork, with strictly less fidelity. Worse, it proves nothing about
  the thing most likely to break: whether `$('tf-message').first().json.message.messageId`
  actually *resolves* inside an `executeWorkflow` input at runtime. n8n expressions fail quietly
  to `undefined`/`[object Object]`; a guard that re-renders the expression in a *different* node
  context can resolve differently from the real one. (c) can produce a green run over a broken
  blob.
- **(b) point the clone's node at a test-only redis list** — the node calls a sub; the list lives
  inside the sub. So "(b)" is only reachable *via* a forked sub. Collapses into (a).
- **(a) fork the save sub with a test list** — **SELECTED.**

**Decision: fork the save sub, then repoint + wire on the clone.**

Create `sub-respond-save-message-redis TEST` — an exact duplicate of `UrETd-jm46tFj3Xw7w8vL` with
one parameter changed: `Redis.list` = `test:ingest:{{ $json.turn_id || 'nokey' }}`… **no** — keep
it dead simple and non-expression: `Redis.list = "sorento-respond-message-TEST"`. Rationale for a
fixed literal: an expression that fails to render could fall back to an empty list name or throw;
a literal cannot. **No consumer reads that list** — `redis-consume-queue-mongo`
(`Srs08P0Ha3Cv--YPx0-Yn`) is hardcoded to pop `sorento-respond-message` only.

Then on the clone `txiPzSxy3Pclsz6v`:
1. repoint `Call 'sub-respond-save-message-redis'2` → the TEST fork, **and**
2. wire it inbound from `if-message-is-audio` **output index 1**, mirroring the spine.

**Why un-orphaning is safe here.** The node was orphaned because it targeted the real sub. Once
it targets a fork whose *only* egress is an RPUSH to an unconsumed list, the node has no path to
prod: no respond.io call, no CRM call, no prod-list write. The fail-closed property is preserved
by *what the node can reach*, not by disconnection — which is the stronger form. The blast radius
of a mistake is a growing redis list nobody reads.

**This changes the §0 safety checklist and the checklist must be amended (see §D).** CLAUDE.md
and `plans/plan.md` both record "5 egress nodes orphaned (0 inbound)" including this node. After
this change it is **4 orphaned + 1 sinked**. Coder must update both docs; reviewer must confirm
the amendment landed, or the next agent will read a false invariant.

**Belt-and-braces, mandatory:** the tester additionally asserts `LLEN sorento-respond-message` is
**unchanged** across every run (snapshot before, compare after). That is the empirical gate and it
does not depend on trusting any of the above reasoning.

---

## §B. Build spec

Build order: B1 (fork save sub) → B2 (fork sendmsg, C2+C3) → B3 (clone wiring, C1+C4) → UAC →
review → user-gated promote. **Never edit the live spine or any live sub during build.**

### B1. `sub-respond-save-message-redis TEST` — the sink

- Duplicate `UrETd-jm46tFj3Xw7w8vL` (UI Duplicate; it is 2 nodes, so `create_workflow_from_code`
  is also acceptable here — this is the one workflow small enough that hand-porting is not lossy).
- Change **one** parameter: `Redis.list` → literal `sorento-respond-message-TEST`.
- Add input `turn_id` to the trigger's `workflowInputs` so the schema matches the modified callers
  (the sub ignores it; only `data` is forwarded — but a schema mismatch produces confusing UI).
- **Publish it** (LESSONS §37 — a parent sees only the published version of a sub).
- Record its new id in this file and in the coder's node-diff.

### B2. `sub-sendmsg-OBS` — C2 + C3

**Fork source = the CURRENT LIVE `aoydkG1dbItXR5jXFEQsP` @ `8cf1b465`** (NOT `sub-sendmsg-CHAT`,
which is stale per A3, and NOT the LOGFIX fork, which is already merged into live). This is the
"rebase on live then fix" rule. The chat-console `chat?`/`chat-push` layer is deliberately **not**
carried into this fork — see the testability note in §C2.

**C2 — new input.** On `When Executed by Another Workflow`, append `{name:"turn_id"}` to
`workflowInputs.values`. Additive; existing callers that omit it pass `undefined`.

**C3 — both save-call data blobs.** In `Call 'sub-respond-save-message-redis'1` (text branch, off
`Send a Message`) add to the blob, and change `sent_at`:

```js
"turn_id": $('When Executed by Another Workflow').first().json.turn_id ?? null,
"sent_at": $('Send a Message').item.json.messageId
             ? Math.floor($('Send a Message').item.json.messageId / 1000)
             : new Date().getTime(),
```

In `Call 'sub-respond-save-message-redis' (quick_reply)` (off `HTTP Request`) the same, reading
`$('HTTP Request').item.json.messageId` instead — matching the `message_id` field already there.

`turn_id` uses `?? null` deliberately: a proactive send (no turn_id) must serialize as an explicit
`null`, never the string `"undefined"`. Do **not** template it (`` `${…}` ``) — that stringifies
`undefined`. `message_id` keeps its existing backtick form (unchanged, already shipping).

`sent_at` keeps the plan's `new Date().getTime()` fallback. Rationale unchanged and worth
restating for the reviewer: a `NaN`/`null` `sent_at` breaks transcript ordering for every user,
which is strictly worse than the imprecision being fixed. Degrade to today's behaviour, never to
garbage.

**Build-only guard changes (stripped before promote — mark each clearly in the node-diff):**
- Repoint **both** save calls → the B1 TEST fork.
- Add `turn_id` to `test-guard-record`'s recorded payload, so C4's threading is assertable from
  the egress log on an end-to-end clone run:
  `"turn_id": {{ JSON.stringify($('When Executed by Another Workflow').first().json.turn_id ?? null) }}`

Publish the fork.

### B3. Clone `txiPzSxy3Pclsz6v` — C1 + C4

**C1 — incoming save blob.** On `Call 'sub-respond-save-message-redis'2`, add to the `data` blob
and change `sent_at` (exactly the plan §C1 snippet; `tf-message` is resolved by node name so this
is voice-safe per A4):

```js
"message_id": `${$('tf-message').first().json.message.messageId}`,
"turn_id": `${$execution.id}`,
"sent_at": $('tf-message').first().json.message.messageId
             ? Math.floor($('tf-message').first().json.message.messageId / 1000)
             : new Date().getTime(),
```

Note `turn_id` here **is** templated — on the spine `$execution.id` always exists, so the
`?? null` concern of B2 does not apply. Keep spine and sub consistent in *value* (both produce the
spine execution id as a string), not in syntax.

Add `turn_id` to the node's `workflowInputs.value` too (the sub input from B1), so the save sub
receives it as a first-class input as well as inside the blob. Harmless, and matches C2's shape.

**C1 wiring (harness-only, per A6):** repoint the node → B1 TEST fork; connect
`if-message-is-audio` output **1** → this node.

**C4 — 8 callers.** Add `turn_id: {{ $execution.id }}` to `workflowInputs.value` on all 8 spine
sendmsg callers listed in A5 (#1–#8). On the clone these currently point at `sub-sendmsg-CHAT`;
**repoint all 8 to the B2 `sub-sendmsg-OBS` fork** for the duration of this build, so the UAC
exercises the fork that will be promoted. Record the original target (`ublq9nSlrpz63xan`) in the
node-diff so the chat-console wiring can be restored afterwards — **this is a build-only rewire
and must be reverted on the clone after sign-off**, or the chat console breaks.

Do **not** add `turn_id` to caller #9 (`sorento-main`). Do not open `sorento-main` at all.

Batch all clone edits into **one** `update_workflow` call (LESSONS §33). Publish the clone.

### B4. Promote diff (user-gated, after reviewer APPROVE)

Business-logic-only, guards stripped:
1. Live sub `aoydkG1dbItXR5jXFEQsP`: C2 input + C3 both blobs. Save calls point at the **real**
   `UrETd-…` (revert the B2 repoint). `test-guard-record` turn_id line **removed**. Publish.
2. Live spine `9qVyfUxmRQqrpGRMDLRuz`: C1 blob + C4 on 8 callers. The save node's target stays
   `UrETd-…` and its **inbound edge from `if-message-is-audio`[1] is the real live wiring** —
   note carefully: on the live spine that edge **already exists**; only the clone needed it added.
   Publish (safe per A2 — but re-verify the draft delta immediately before, per LESSONS §24/25).
3. Sub before spine (LESSONS §37).
4. Backup prior versionIds first; sha-verify draft pre-publish and active post-publish; auto-revert
   on mismatch.

---

## §C. Testability — read this before writing test code

### C1 is end-to-end testable on the clone. C3 is not.

**`Call 'sub-respond-save-message-redis'2` (C1) runs on a normal clone run** once wired — it sits
on the FALSE branch of `if-message-is-audio`, upstream of everything guarded, and its blob reads
only from `tf-message` and `findcontact`. A standard `uac`-mode seed exercises it fully, and the
resolved `data` blob is readable from `get_execution` runData as that node's **input** (LESSONS
§42 pattern). This is the highest-fidelity assertion available and it is free.

**The C3 blobs are unreachable in any safe end-to-end mode.** In the sendmsg sub, `test-guard`
TRUE → `test-guard-record` → **dead end**; neither save call is downstream of it. And both blobs
read `messageId` from `Send a Message` / `HTTP Request` — the two nodes that must never execute
under test. So there is no seed that renders those blobs safely end-to-end.

**Mechanism for C3: sub-level UAC via `prepare_test_pin_data` → `test_workflow`** on
`sub-sendmsg-OBS` (LESSONS §34). Pin `Send a Message` and `HTTP Request` with synthetic
`messageId` values; the pure-logic nodes (`If`, `Code in JavaScript`, `If1`, `Loop Over Items`)
execute for real; the save calls execute for real against the **B1 TEST sink**, so their resolved
`data` blobs appear in runData and land in `sorento-respond-message-TEST`. Drive with
`is_test` **false** for these cases only — the guard must be open for the branch to run — which is
precisely why the save calls must already be repointed to the TEST fork (B2) before any C3 case is
run. **Ordering is a safety precondition, not a convenience: verify the repoint landed, and verify
`Send a Message`/`HTTP Request` are pinned, BEFORE the first C3 execution.** An unpinned
`Send a Message` with `is_test:false` is a real WhatsApp send.

Synthetic messageIds to pin (chosen to exercise both precision regimes):
- text branch `Send a Message` → `messageId: 1784519974123456` (real microseconds, outgoing-like)
- quick_reply branch `HTTP Request` → **see C2 below**

### C2. The quick_reply response shape is UNVERIFIED — treat as a discovery case

The quick_reply blob reads `$('HTTP Request').item.json.messageId` from a **raw respond.io
`POST /v2/contact/id:{id}/message`**. We have never confirmed that response body contains
`messageId`. The existing live field may be silently writing `"undefined"`.

Do **not** resolve this by calling respond.io. Instead:

1. **Evidence-first, zero-egress:** search live executions of `aoydkG1dbItXR5jXFEQsP` for a run
   that took the quick_reply branch, and read the `HTTP Request` node's output from runData
   (`search_executions` → one targeted `get_execution(includeData, nodeNames:["HTTP Request"])`,
   LESSONS §35). That is a historical record — reading it sends nothing.
2. If a real response is found: pin its actual shape, and the UAC asserts the true behaviour.
3. If no such execution exists, or the response has no `messageId`: **the case is a
   documented-unknown, not a pass.** Pin `{}` and assert the blob degrades safely — `sent_at`
   falls back to `new Date().getTime()` (not `NaN`), `turn_id` still present. Report the gap to
   the CRM side: outgoing quick_reply rows may carry no usable `message_id`, which is a separate
   defect from anything C1–C4 fixes.

Under no circumstance should a green UAC be reported for the quick_reply `message_id` without
evidence of the real response shape.

---

## §D. §0 SAFETY CHECKLIST — amendment (binding on every case below)

All cases are bound by the existing `tests/UAC.md` §0 checklist S1–S6, **with these amendments**,
which the coder must also apply to `tests/UAC.md` §0 and to `plans/plan.md` §2.3 and CLAUDE.md:

- **S3 (amended).** The orphan count changes from **5 orphaned** to **4 orphaned + 1 sinked**.
  `Call 'sub-respond-save-message-redis'2` is no longer orphaned; it is *sinked*. S3 now requires:
  the node's target workflowId is the **B1 TEST fork**, and that fork's `Redis.list` is literally
  `sorento-respond-message-TEST`. Assert both from the workflow JSON, not from memory.
  `save-session-vars` and `update-human-intervened` remain orphaned and unchanged.
- **S7 (NEW — prod ingest untouched).** `LLEN sorento-respond-message` is snapshotted immediately
  before and immediately after every run and must be **identical**. Any increase is a prod write:
  **hard fail, halt the entire run**, do not continue to later cases. This is the primary gate for
  this change and it supersedes reasoning about wiring.
- **S8 (NEW — sub-level runs).** For any case executed with `is_test:false` (the C3 cases in §E5–
  §E6 only): `Send a Message` and `HTTP Request` **must both be pinned** and must show **zero real
  invocations** in runData. Verify pinning is in effect *before* execution. If pin data cannot be
  confirmed, do not run the case.
- **S1/S2/S4/S5/S6** unchanged. S6 resolves to `deterministic`: **no LLM node may execute in any
  case below.**

---

## §E. UAC cases

Add to `tests/UAC.md` as `§OBS-1` … `§OBS-7`. Contact `437264483` (Jayson, FULL access) unless
stated. `scope: deterministic` throughout — every clone case injects `mock_reformulator_output`;
zero parser tokens.

### §OBS-1 — Incoming save blob carries message_id / turn_id / sent_at (PRIMARY, C1)

- **Trigger:** typed text "Show me incoming stock for product SR-1234." · contact `437264483` ·
  `mode: uac` · `mock_reformulator_output` = business_query / domain `incoming` / product SR-1234
  (reuse §1's mock verbatim). Redis item's `message.messageId` set to a **known literal**
  `1784519974000000` so the assertion is exact, not approximate.
- **Expect-path:** `redis-pop` → `if-audio-in`[1] → `tf-message` → findcontact →
  `if-message-is-audio`[**1** = FALSE] → `Call 'sub-respond-save-message-redis'2` **executes**
  (this is the new edge) and `get-session-vars` also executes (unchanged sibling).
- **Expect-output (structural), read from that node's resolved input in runData, `data` parsed:**
  - `message_id === "1784519974000000"` — a **string**, non-empty, not `"undefined"`, not `"null"`
  - `turn_id === String(<this execution's id>)` — non-empty, matches the run's own execution id
  - `sent_at === 1784519974000` — exactly `Math.floor(messageId/1000)`, an integer, **not** `NaN`,
    and **not** within 5s of wall-clock (proving it came from messageId, not `Date.now()`)
  - `type === "incoming"`; all pre-existing keys (`contact_id`, `phone_number`, `message`,
    `first_name`, `last_name`, `reply_to_message_id`, `reply_to_message`) still present and
    unchanged in shape — **no field regressed**
- **Safety:** §0 all + **S7** + amended **S3**. Also assert `LLEN sorento-respond-message-TEST`
  increased by exactly 1 (the write went to the sink, proving the path ran).

### §OBS-2 — sent_at fallback when messageId is absent (C1 degradation)

- **Trigger:** same as §OBS-1 but the redis item's `message.messageId` is **omitted entirely**.
- **Expect-output:** `sent_at` is a plausible wall-clock ms integer (within 60s of run time),
  **not `NaN`, not `null`, not `0`**. `message_id` renders as the string `"undefined"` — that is
  the accepted current behaviour of the backtick form; assert it explicitly so a future change to
  it is caught. Run must not error.
- **Rationale:** this is the case that protects every existing user's transcript ordering. It is
  not optional.
- **Safety:** §0 all + S7.

### §OBS-3 — Voice turn: messageId survives transcription (C1, A4)

- **Trigger:** voice item on the mock lane — `mock_transcript: "show me incoming stock for SR-1234"`,
  `attachment.type: "audio"`, `message.messageId` = `1784519974000000` · contact `437264483` ·
  `mode: uac` · same `mock_reformulator_output` (no Whisper call; use `if-audio-mock`, **not**
  `fetch-audio`/`whisper-transcribe` — those are real network calls and must not execute).
- **Expect-path:** `if-audio-in`[0] → `if-voice-allowed` → mock lane → `patch-transcript` →
  `tf-message` → … → `if-message-is-audio` takes **FALSE** (because `patch-transcript` set
  `E.attachment.type='text'`) → save node executes.
- **Expect-output:** identical assertions to §OBS-1 — `message_id === "1784519974000000"`,
  `sent_at === 1784519974000`. Additionally `message` equals the transcript text, proving the
  patched item and the preserved messageId coexist.
- **Safety:** §0 all + S7. Assert `whisper-transcribe` and `fetch-audio` did **not** execute
  (no OpenAI/network egress; also required by S6/deterministic).

### §OBS-4 — turn_id threads spine → sendmsg sub (PRIMARY, C4 + C2)

- **Trigger:** §OBS-1's trigger. `mode: uac`, `is_test:true` (guard closed — this case tests
  *threading*, not the blob).
- **Expect-path:** the reply path reaches `sorento-sub-respond-sendmsg-respond2` (or whichever
  caller the branch selects) → `sub-sendmsg-OBS` → `test-guard` TRUE → `test-guard-record`.
- **Expect-output:** the `test:egress:{test_run_id}` record for `guard:"sendmsg-sub"` contains
  `turn_id` **equal to the spine execution id** — the same value asserted in §OBS-1's blob. This is
  the whole point of C4: incoming and outgoing must agree. Assert **string equality between the
  two**, not merely "both present".
- **Coverage requirement:** across §OBS-4's runs, exercise **at least callers #1, #2 and #7** (a
  plain reply, a quick_reply reply, and the transcript-confirm path). The remaining callers are
  verified statically — reviewer confirms all 8 carry `turn_id: {{ $execution.id }}` by reading the
  clone JSON. A static check is sufficient for the untriggered ones; do not invent exotic seeds.
- **Safety:** §0 all + S7. S1 — the send was blocked, recorded, never executed.

### §OBS-5 — Outgoing text blob carries turn_id + sent_at (C3, sub-level)

- **Mechanism:** `test_workflow` on `sub-sendmsg-OBS` per §C1. **`is_test:false`, `Send a Message`
  PINNED** with `{messageId: 1784519974123456}`. Inputs: `contact_identifer`, `contact`
  (`{phone, firstName, lastName}`), `message: "hello"`, `quick_reply: ""`,
  `turn_id: "9999001"`.
- **Expect-path:** `test-guard` FALSE → `If` (quick_reply empty ⇒ TRUE) → `Code in JavaScript` →
  `If1` → `Loop Over Items` → `Send a Message` (**pinned, not executed**) →
  `Call 'sub-respond-save-message-redis'1` → **B1 TEST sink**.
- **Expect-output** (resolved `data` blob from runData):
  - `turn_id === "9999001"` — the threaded value, **not** this sub's own execution id
    (assert inequality with the sub's execution id explicitly — that is §0.3's exact failure mode)
  - `message_id === "1784519974123456"`, `sent_at === 1784519974123`
  - `type === "outgoing"`; `result` and all pre-existing keys intact
- **Safety:** §0 all + **S7** + **S8**. `Send a Message` shows zero real invocations.

### §OBS-6 — Outgoing quick_reply blob (C3, sub-level) — **UNVERIFIED RESPONSE SHAPE**

- **Prerequisite:** complete the §C2 evidence step first. The pin for `HTTP Request` is whatever
  that historical execution shows.
- **Mechanism:** as §OBS-5 but `quick_reply: "Yes escalate,No it's okay"`, `HTTP Request` PINNED,
  `turn_id: "9999002"`.
- **Expect-path:** `If` FALSE → `HTTP Request` (**pinned**) →
  `Call 'sub-respond-save-message-redis' (quick_reply)` → TEST sink.
  ⚠️ This node does not exist in `sub-sendmsg-CHAT` — its presence in `sub-sendmsg-OBS` is itself
  proof the fork was correctly rebased on live (A3). Assert the node exists and executed.
- **Expect-output:** `turn_id === "9999002"` (≠ sub execution id); `quick_reply` present.
  For `message_id`/`sent_at`, **two admissible outcomes**:
  - *(a) response carries `messageId`* → assert `message_id` equals it and
    `sent_at === Math.floor(messageId/1000)`. PASS.
  - *(b) response has no `messageId`* → assert `sent_at` is a wall-clock fallback (not `NaN`) and
    the run does not error. **Report as PASS-with-finding**, and raise the missing outgoing
    `message_id` on the quick_reply branch as a **separate defect** to the CRM side.
  A run that asserts neither, or that guesses the shape without evidence, is a **FAIL**.
- **Safety:** §0 all + S7 + S8. Zero real POST to `api.respond.io`.

### §OBS-7 — Proactive send carries NO turn_id (C4 negative, sorento-main)

- **Mechanism:** `test_workflow` on `sub-sendmsg-OBS`, `is_test:false`, `Send a Message` PINNED.
  Inputs replicate caller #9 exactly: **only** `contact_identifer` and
  `message: "Each contact is only allowed to send MAXIMUM 10 messages…"`. **No `turn_id`, no
  `contact`, no `is_test`.**
- **Expect-output:** the resolved blob's `turn_id` is **JSON `null`** — explicitly *not* the string
  `"undefined"`, *not* `""`, *not* absent-with-a-different-key. This is what the `?? null` in B2
  buys and it is what lets the CRM exclude proactive rows from the SLA denominator. If it
  serializes as `"undefined"`, C3 is wrong and must be fixed before promote.
- **Known secondary outcome:** with no `contact` object the blob dereferences `contact.phone` and
  may throw — the **pre-existing** defect from A5. If it throws, that is the expected current
  behaviour: record it, assert `turn_id` from the partial render or from a `contact`-supplied
  variant, and **do not fix it in this change**. Note it in the backlog.
- **Safety:** §0 all + S7 + S8.
- **Also assert statically:** `sorento-main`'s caller node was **not modified** and `sorento-main`
  was **not published** (its versionId is still `415ff490`, activeVersionId still `952fc09a`).

---

## §F. Verification tasks (plan §6 style)

- **V-OBS-a — prod ingest list untouched.** `LLEN sorento-respond-message` identical before/after
  the full run. The single most important check; gates everything.
- **V-OBS-b — sink is real and isolated.** B1 fork's `Redis.list == "sorento-respond-message-TEST"`
  (literal, no expression). Grep every workflow touched: no node other than the untouched live
  save sub references `sorento-respond-message`.
- **V-OBS-c — turn_id pairing.** For one end-to-end run, the incoming blob's `turn_id` (§OBS-1) and
  the sendmsg egress record's `turn_id` (§OBS-4) are the **same string**, and both equal the spine
  execution id. This is the acceptance criterion for the whole change.
- **V-OBS-d — sent_at never degrades to garbage.** Across §OBS-1/2/3/5/6: `sent_at` is always a
  positive integer; never `NaN`, `null`, `0`, or a string.
- **V-OBS-e — no field regressed.** Diff the resolved blob key-set before vs after the change for
  both incoming and outgoing. Expect exactly `+turn_id` (both) and `+message_id` (incoming only);
  every other key byte-identical in shape.
- **V-OBS-f — all 8 callers carry turn_id.** Static read of the clone JSON; all 8 nodes from A5
  have `turn_id: {{ $execution.id }}`. Caller #9 does not, and `sorento-main` is unmodified.
- **V-OBS-g — spine draft still clean at promote time.** Immediately before promoting, re-run the
  A2 diff. If anything beyond `send-transcript-confirm.schema` has appeared in the draft, **halt**
  and escalate — someone edited the spine in the UI (LESSONS §24 revert-landmine).
- **V-OBS-h — docs amended.** `tests/UAC.md` §0, `plans/plan.md` §2.3, and CLAUDE.md all say
  "4 orphaned + 1 sinked" and name the B1 fork. Reviewer blocks on this.
- **V-OBS-i — clone restored.** After sign-off, the clone's 8 sendmsg callers are repointed back to
  `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), or the chat console is knowingly left broken with the
  user's agreement.

---

## §G. Blockers / prerequisites

1. **`sub-sendmsg-CHAT` is stale vs live** (A3) — missing the promoted quick_reply save node. The
   fork divergence is now two-way: live has the logger, CHAT has the chat gate. Someone must
   eventually reconcile them or the chat console will keep drifting from production. **Not blocking
   C1–C4** (we fork fresh from live), but it means the clone's default wiring does not represent
   live, and any future clone-based test of outgoing logging is invalid until fixed.
2. **quick_reply response shape unverified** (§C2) — §OBS-6 cannot be fully green without
   historical evidence. May resolve to "PASS-with-finding" and a new defect for the CRM side.
3. **Live spine runs `sub-get-results TEST`** (A3) — needs a user decision. Unrelated to this
   change; do not touch it here.
4. **CLAUDE.md clone-wiring table is wrong** — reformulator fork is `wI5RkNGW3EOJfBdo`, not
   `XTODTw-dJcV0uRdC056hG`. Correct it.
5. **LESSONS §23 is outdated** — `get_workflow_details` *does* return `activeVersion` node bodies;
   draft-vs-active is fully diffable via MCP. Correct it; it changes how every future promotion is
   gated.
6. No new test contact needed. `437264483` covers every case; §OBS-5/6/7 are sub-level and use a
   synthetic contact object.
7. **UAC ↔ replay redis contention** (LESSONS §30) still applies — do not run these concurrently
   with a replay.
