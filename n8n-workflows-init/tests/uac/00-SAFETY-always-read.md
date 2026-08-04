# §0 — MANDATORY safety checklist

> Applies to EVERY case in every §-file. A §0 failure is a hard fail and halts the run.
> Read this file plus ONLY the §-file for the change you are working on.

A case PASSES only if all of these hold, asserted from `get_execution(includeData:true)` + the Redis
`test:egress:{test_run_id}` list:

- **S1 — Zero real WhatsApp/comment sends.** No execution data shows a respond.io send/comment with a
  2xx response. Every sendmsg path is represented in the egress log as
  `{guard:"sendmsg-sub"|"send-message-files"|"send-message-images"|"send-message-video", blocked:true}`.
  The shared send sub `aoydkG1dbItXR5jXFEQsP` short-circuited (no `api.respond.io/.../message` POST executed).
- **S2 — Zero assignment / escalation writes.** Inside `rrYXzE61gCNUck_zmXe-G`: `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create` (POST sla), `Call 'sub-add-comment-respond'`/`'1`,
  and the `Redis` push to `sorento-respond-assignee-queue` did **not** execute. If the escalation
  branch was taken, the human-intervention sub recorded `{guard:"human-intervention-sub", blocked:true}`
  and returned before `get-round-robin-assignee`.
- **S3 — Zero CRM/contact writes.** `save-session-vars` (PUT conversation-variables) and
  `update-human-intervened` (respond.io UPDATE_CONTACT) did not execute their real call; each is in the
  egress log as `would_write, blocked:true`. Both remain **orphaned** (0 inbound) on the clone.
  - **S3 amendment (2026-07-21, obs-latency-contract).** The clone's egress containment is no longer
    "6 nodes orphaned". It is now **5 orphaned + 1 sinked**:
    - **orphaned (0 inbound, unchanged):** `send-message-files`, `send-message-images`,
      `send-message-video`, `update-human-intervened`, `save-session-vars`.
    - **sinked (NEW):** `Call 'sub-respond-save-message-redis'2` is deliberately **un-orphaned** — it
      is now wired from `if-message-is-audio` output **1 (FALSE)**, mirroring the live spine, so that
      C1's incoming save blob is exercised end-to-end. Its containment is now *what it can reach*, not
      disconnection. S3 therefore requires asserting, **from the workflow JSON, not from memory**:
      1. `Call 'sub-respond-save-message-redis'2`.`workflowId.value` === **`tWm5DYLxfypmVC1T`**
         (`sub-respond-save-message-redis TEST`) — *never* the live `UrETd-jm46tFj3Xw7w8vL`; and
      2. that fork's `Redis.list` is the literal string **`sorento-respond-message-TEST`** (no `=`
         expression prefix), a list **no consumer reads** (`redis-consume-queue-mongo`
         `Srs08P0Ha3Cv--YPx0-Yn` is hardcoded to pop `sorento-respond-message` only).
    - The empirical backstop for this whole amendment is **S7**.
    > Note vs the build spec: `obs-latency-contract-build.md` §D predicted "4 orphaned + 1 sinked".
    > The true post-change count is **5 orphaned + 1 sinked** — the spec's arithmetic folded the save
    > node into a 5-node total, but CLAUDE.md listed 5 *other* egress nodes plus the save node (6).
    > Verified against the clone's own `DISCONNECTED_NODE` validation output after the change.
    > (Separately: `sorento-sub-respond-sendmsg-respond3` is also orphaned on the clone — caller #3
    > can never fire there, so §OBS-4 cannot cover it dynamically; static check only.)
- **S4 — get-results writes never fired.** No MCP write tool ran; the resolved `tool` passed to
  `Call 'sub-get-results'` is in the read allowlist and is **never** `crm_it_support_ticket_create`
  (see plan §6b). MCP Client1 invoked a read tool only.
- **S5 — `test_mode` provably present.** `When Executed by Another Workflow.json.test_mode === true`,
  and any invoked sub-workflow received `is_test/test_mode === true` in its inputs.
- **S6 — Token sinks bounded by scope** (plan §6c/§8): `deterministic` → no LLM node executed;
  `parser` → only consume-main `gpt-4.1-mini`; `get-results` → only the get-results LLM (if its agent
  path is live).
- **S7 — Prod ingest untouched: sink-delta + payload attribution** (added 2026-07-21
  obs-latency-contract; **REPLACED 2026-07-21 turn-id-threading-completion, reviewer H1**). The
  original S7 (`LLEN sorento-respond-message` equal before/after) is **withdrawn as unsound**: it is
  an equality invariant on a shared list drained every ~5s, so it is both false-positive prone (a
  concurrent producer trips it) and — fatally — **false-negative prone** (our write at T is drained
  by T+3s and the count reads back equal). A gate that can report PASS while a prod write occurred
  manufactures confidence. It is replaced by a **two-part** gate; **both parts are mandatory**.

  **S7a — TEST-sink delta is the positive signal.** The harness writes only to the unconsumed sink
  `sorento-respond-message-TEST` (via `tWm5DYLxfypmVC1T`). Snapshot `LLEN
  sorento-respond-message-TEST` immediately before and after the run. Every save the case expects
  must appear here. `LRANGE` the newly-added entries and assert each payload carries the run's own
  `test_run_id` / `turn_id`. **Zero TEST-sink delta when the case expects a save is a FAIL** (it
  means the save was routed somewhere else — possibly prod).

  **S7b — prod-sink delta must be zero, and any non-zero delta must be ATTRIBUTED.**
  (**METHOD REPLACED 2026-07-21, turn-id-threading-completion cycle 2c — tester F10 retraction,
  made binding by the reviewer §C3.**)

  > ⛔ **RETRACTED — DO NOT USE: counting consumer executions.** The prior text ranked
  > "count executions of the prod ingest consumer inside the run window" **first** and called it
  > *authoritative*. It is not weak evidence, it is **ZERO evidence — it is a clock.** The consumer
  > emits one execution per 5s poll **unconditionally** (~140 in an 11-minute window), so the count
  > is a function of elapsed time and of nothing else; its mutual information with "did a prod write
  > occur" is nil. This is the same defect class cycle 1 rejected in the original S7 — a gate that
  > can report PASS while a prod write occurred — reintroduced by another route. **Never score a
  > case on this signal.**

  The sound instrument is the **prod ingest consumer `Srs08P0Ha3Cv--YPx0-Yn`'s first node**, which
  runs `LLEN sorento-respond-message` every 5 s and **retains the value in execution data**. Reading
  that value across the consumer executions covering the run window yields a **5-second-resolution
  depth series** — which is what defeats drain-blindness (finding F7): a write at T is visible in the
  poll at ≤ T+5 s, whether or not it is drained immediately afterwards.

  **Two CO-MANDATORY signals — both required, neither corroborating.**
    1. **The per-poll `LLEN` depth series** for every consumer execution covering the run window.
    2. **The per-poll POP PAYLOAD** from the same executions. The `Redis` pop node emits `{"":null}`
       on an empty pop; a real payload names the message that was taken.

  **Why the pop payload is co-mandatory, not corroborating.** LLEN alone still has a hole: a write
  that lands **and is popped inside a single poll's own execution** shows `LLEN 0` at the top of that
  very poll, so the depth series never sees it. The pop payload is the only signal that observes
  that write. A case that reports LLEN-only is **incomplete and cannot be signed off** — record both,
  for every covering poll, with the execution ids.

  - **Delta == 0 → PASS** — i.e. every covering poll shows `LLEN 0` **and** an empty pop.
  - **Delta > 0 → the run HALTS IMMEDIATELY, pending attribution.** This is **binding, not
    discretionary**: do not run the next case, do not "note it and continue". Then retrieve each
    consumer execution in the window and inspect its payload:
      - payload attributable to an unrelated producer (different `contact_id`, no `test_run_id`, and
        a `message_id` not present in this run's fixtures) → record the attribution in the run log
        with the execution id, then the case may be **resumed**;
      - payload carries this run's `test_run_id`, `turn_id`, `message_id`, or fixture contact →
        **HARD FAIL. The harness leaked to prod. Halt the entire cycle and escalate; do not resume.**
  - **Unretrievable consumer execution → UNATTRIBUTABLE → FAIL.** If a consumer execution in the
    window cannot be fetched (pruned by retention, permission-denied, MCP-inaccessible), the delta
    is **not** attributable and the case is a **FAIL**. It is explicitly **NOT** an
    inconclusive-pass, **NOT** "probably unrelated", and **NOT** resumable. Absence of evidence is
    recorded as failure, because the alternative is a silent prod write scored green.

  **Reporting.** Every case's result MUST record: TEST-sink delta (before/after); prod-sink delta
  established from **both** S7b signals — the per-poll `LLEN` series **and** the per-poll pop
  payload — listing the covering consumer execution ids; and, when the prod delta is non-zero, the
  attribution decision with those execution ids. A case with no S7 line, or with only one of the two
  S7b signals, is incomplete and cannot be signed off. **A case scored on consumer execution COUNT
  is not incomplete but void** — rerun it.
- **S8 — Sub-level `is_test:false` runs require STRUCTURAL absence of credentialed send nodes**
  (added 2026-07-21 obs-latency-contract as a pinning rule; **rewritten 2026-07-21,
  turn-id-threading-completion cycle 2 — pinning is withdrawn, not merely superseded**).

  Reviewer H2 is adopted in full: runtime pinning is **not** relied on anywhere. The binding rule is:

  > **No `is_test:false` run may execute against a fork whose JSON contains any node of type
  > `@respond-io/n8n-nodes-respond-io.respondio`, `n8n-nodes-base.httpRequest`, or
  > `@n8n/n8n-nodes-langchain.memoryPostgresChat`.** Assert this from a re-fetched
  > `get_workflow_details` *before* running. A fork failing the check **must not be run at all** —
  > it is not rescuable by pinning.

  The egress nodes are removed and re-added as **name-preserving Code-node stand-ins** named exactly
  `Send a Message` and `HTTP Request`, each emitting `{contactId, messageId}` with a synthetic
  microsecond-epoch `messageId`, so `$('Send a Message').item.json.messageId` and
  `$('HTTP Request').item.json.messageId` still resolve in the real node context with **no
  credentialed node anywhere in the graph**.

  Rationale for withdrawing pinning: a pin proves pins were honoured on *that* call, not the next; a
  typo'd node key in a later `pinData` map silently does not apply; and credentials are **invisible
  to MCP `get_workflow_details`** (it redacts them entirely — the STANDIN and OBS forks both show no
  `credentials` block despite carrying bound credentials), so "is it credentialed?" is not directly
  answerable and node **type** is the only sound proxy.

  **Which fork to run — current arrangement (cycle 2):**

  | fork | id | S8 status | use |
  |---|---|---|---|
  | `zz-sub-sendmsg-BLOBTEST` | `69RhomhiCH4bpY1w` | ✅ **PASSES** — zero nodes of all three banned types; both save blobs retained, both targeting the TEST sink `tWm5DYLxfypmVC1T` | **the fork for §OBS-9/10/11** and any case asserting `turn_id` inside a *rendered save blob*. The HI fork's three sendmsg callers point here |
  | `zz-sub-sendmsg-STANDIN` | `lJ4IZEGwoTh6aay4` | ✅ passes — but has **no save blobs** (no `executeWorkflow` node at all) | egress-log-only assertions; superseded by BLOBTEST for OBS-9/10/11 |
  | `sub-sendmsg-OBS` | `sJI3DbsLCG01JfRs` | ❌ **FAILS** — still contains a credentialed `Send a Message` (respondio), an `HTTP Request`, and `Postgres Chat Memory1` | **DO NOT RUN at `is_test:false`.** Draft-only H4 edit, publish denied. Static/diff reference only |

  ⚠️ `Send a Message` in `sub-sendmsg-OBS` carries the real `sorento-api` respond.io credential
  (auto-bound by n8n-MCP on node creation; not removable via MCP), so an `is_test:false` run against
  it **is a real WhatsApp send** regardless of pinning. This is the concrete failure S8 exists to
  prevent.
  - **S3 extension (same change).** Additionally assert the HI fork `vUfFUDjLAuMaeQE6` and whichever
    sendmsg fork the case targets contain **zero credentialed send nodes**. From JSON, not memory.

> If S1–S5, S7 or S8 cannot be affirmatively verified for a case, treat as **FAIL and halt the run** —
> do not proceed to later cases (a real egress means the kill-switch is leaking).

> ✅ **Reviewer H1 is DISCHARGED (2026-07-21).** The unsound LLEN-equality S7 has been replaced
> above by S7a/S7b (sink-delta + payload attribution), including both required tightenings:
> (a) a non-zero prod delta **halts** pending attribution — binding, not discretionary;
> (b) an unretrievable consumer execution is **UNATTRIBUTABLE → FAIL**, never inconclusive-pass.
> Blocker §7.4 of `plans/turn-id-threading-completion.md` is therefore cleared.

---
