# User Acceptance Criteria — `sorento-consume-main` test harness

Target: `sorento-consume-main copy 2` (`txiPzSxy3Pclsz6v`), driven via `execute_workflow` →
`get_execution(includeData:true)`. All cases run with `test_mode: true`. See `../plans/plan.md` for the
kill-switch, payload schema, and `scope:` routing.

Notation: **Trigger** = (input message, contact_id, scope, mock?). **Expect-branch** = the path the
run must take. **Expect-output** = structural assertions on the response that *would* have been sent.
Every case is bound by the **§0 shared safety checklist** — that is the acceptance gate; a failure
there is a hard fail regardless of functional correctness.

---

## §0. MANDATORY safety checklist (applies to EVERY case)

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

## §1. Happy path — full-access business query  (contact `437264483`)
- **Trigger:** "Show me incoming stock for product SR-1234." · contact `437264483` (FULL access) ·
  `scope: deterministic` · `mock_parser_output` = business_query / domain `incoming` / entity product SR-1234.
- **Expect-branch:** `central-exchange` → `resolve-entity` (CRM read, 2xx) → access OK
  (`get-access-types`/`check-access` pass, `If5` access-granted side) → `disallowed-entity-gate`
  passes (`incoming` allows `product`) → `Execute 'sub-get-rag'` → `tool-filter` → `Loop Over Items` →
  `Call 'sub-get-results'` (real, read-only) → `output-structurer` → `compile-current-state` →
  `sorento-sub-respond-sendmsg-respond2` (**guarded**) → `save-session-vars` (**guarded**).
- **Expect-output (structural):** egress `sendmsg-sub` record present with a non-empty `message`
  string; if results exist, `compile-current-state.variables.last_result_set` is a non-empty array of
  `{idx,label,…}`; envelope from `output-structurer` has `items[]`/`has_result` shape. Do **not** assert
  exact text (real CRM + possible LLM).
- **Safety:** §0 all. Specifically S3 — `save-session-vars` blocked (it is the only happy-path write).
- **TBD contact needed?** No.

## §2. No-access  (contact `457216562`)
- **Trigger:** same business query as §1 · contact `457216562` (NO access) · `scope: deterministic` ·
  matching `mock_parser_output`.
- **Expect-branch:** `resolve-entity` read → access check fails (`check-access`/`If5` no-access side)
  → access-denied/escalation message path (`Edit Fields*` → `compile-current-state`) → guarded send.
  Must **not** reach `Call 'sub-get-results'`.
- **Expect-output:** the would-send message is an access-denied / "I can't share that" style string
  (assert it is non-empty and that no result set was produced: `last_result_set` empty / absent).
- **Safety:** §0 all. S4 trivially (get-results not reached). S2 — no escalation write.
- **TBD contact needed?** No.

## §3. Escalation / request-for-help  (contact `437264483`)
- **Trigger:** "I need to speak to a human about my order." · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` with `message_type:"request_for_help"`,
  `domain_hint != "portal_link"` (or `escalation.is_escalation_confirmation:true`).
- **Expect-branch:** `If2` TRUE (escalation gate; condition =
  `escalation.is_escalation_confirmation==true` OR
  `message_type=="request_for_help" && domain_hint!="portal_link"`) → `Call 'sub-human-intervention'`
  (`rrYXzE61gCNUck_zmXe-G`) called with `is_test/test_mode=true` → sub **short-circuits at the top**.
- **Expect-output:** egress log shows `{guard:"human-intervention-sub", blocked:true, would_write:{contact_id,agent,team,current_assignee}}`.
  The user-facing "routing you to a person" message is recorded as a blocked sendmsg, not sent.
- **Safety:** §0 all, with **S2 the focus**: assert NONE of `Assign or unassign a Conversation1`,
  `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the assignee-queue
  `Redis` push executed. This is the highest-risk branch (real assignment → staff notification ripple).
- **TBD contact needed?** No.

## §4. Not-supported-domain  (contact `437264483`)
- **Trigger:** an out-of-scope request, e.g. "What's the weather in KL?" · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` whose `domain_hint` is unsupported / `not_supported`.
- **Expect-branch:** `not-supported-domain` IF TRUE → canned not-supported message
  (`Edit Fields*`/`access-level-choice-message` path) → `compile-current-state` → guarded send.
  Must not reach resolve/get-rag/get-results.
- **Expect-output:** would-send message is the not-supported canned reply (non-empty); no result set.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §5. Entity-not-found / clarification  (contact `437264483`)
- **Trigger:** "Tell me about product ZZ-0000" (nonexistent code) · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` with a product entity that won't resolve.
- **Expect-branch:** `resolve-entity` read returns no match → `not-found-error-message` /
  `disallowed-entity-gate` clarification path (`require_specific` / `compile-current-state`'s
  `manualResponse` branch) → guarded send. May ask the user to clarify rather than escalate.
- **Expect-output:** would-send message is a not-found / clarification prompt; assert
  `compile-current-state` took the `not-found-error-message`/clarification branch (structural), no
  `last_result_set`.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §6. Ask-for-access / partial-access  (contact = **TBD**)
- **Trigger:** business query requiring an access level the contact only partially holds · contact
  **TBD partial-access** · `scope: deterministic` · matching `mock_parser_output`.
- **Expect-branch:** `get-access-types`/`Aggregate`/`check-access` yield a partial/intersection result
  → `access-level-choice-message` path producing a `quick_reply` choice → guarded send. Must not reach
  get-results for the disallowed scope.
- **Expect-output:** `compile-current-state.quick_reply` is a non-empty array (the access-level
  choice); would-send message asks the user to pick/confirm access. Structural only.
- **Safety:** §0 all.
- **TBD contact needed?** **YES — blocked until the partial-access dev contact exists (plan §7.1).**

## §7. Audio / transcription path  (contact `437264483`)
- **Trigger:** a voice message (synthesized popped item with
  `message.message.attachment` of an audio type) · contact `437264483` · `scope: deterministic` (or
  `parser` if asserting transcription content).
- **Expect-branch:** `if-message-is-audio` TRUE → `Transcribe a recording`
  (`@n8n/n8n-nodes-langchain.openAi`, Whisper — **note: a real transcription API call/cost unless
  stubbed**; flag to coder) → `transcribed-message` → normal pipeline →
  `sorento-sub-respond-sendmsg-respond-transcribed-message` (**guarded**).
- **Expect-output:** the transcribed text feeds `construct-user-prompt`/`tf-message`; would-send
  reply recorded as blocked. Assert the transcribe node ran and a non-empty transcript propagated.
- **Safety:** §0 all. Plus: confirm the transcription call is the only extra external call and is a
  read (no contact send). If transcription cost is unwanted, coder stubs it under `test_mode` with a
  payload-supplied transcript.
- **TBD contact needed?** No.

## §8. Attachment / media-send path  (contact `437264483`)
- **Trigger:** a query that resolves to downloadable resources (product images / files), e.g.
  "send me the catalogue images for SR-1234" · contact `437264483` · `scope: deterministic`.
- **Expect-branch:** results include attachments → `get-presigned-url` (CRM **read**, left live) →
  `send-message-files` / `send-message-images` / `send-message-video` (**guarded e/f/g**).
- **Expect-output:** egress log has one of `send-message-files|images|video` with `blocked:true` and a
  `would_send.body` containing the (real, presigned) media URL(s). Assert the presigned URL is
  well-formed; assert NO real POST to `api.respond.io/.../message` executed.
- **Safety:** §0 all; S1 focus on the three media egress nodes.
- **TBD contact needed?** No.

---

# Change: `fix-gate-render-notfound-msg` (gate render + not-found message)

Plan: `../plans/fix-gate-render-notfound-msg.md`. Two fixes — Fix A (`disallowed-entity-gate` final
require_specific clobber) + Fix B (`not-found-error-message` product_attachment phrasing). **Scope:
`deterministic`** for all cases below; contact `437264483` (FULL access); parser/reformulator bypassed
via `mock_parser_output` (pinned from Step 0 capture, plan §4); `resolve-entity` + get-results run as
real READS (allowed). Every case is still bound by **§0**.

> Redis seed item shape (per plan §3). Push to `main-message-list-test`, then `execute_workflow`,
> then `get_execution(includeData:true)` + read `test:egress:{test_run_id}`:
> ```jsonc
> {
>   "message": { "text": "<user text>", "message": { "message": { "text": "<user text>" } } },
>   "contact": { /* fixture tests/fixtures/contacts/437264483.json: id, phone, assignee.id, customFields */ },
>   "messageId": "test-<test_run_id>", "replyTo": null,
>   "test_run_id": "<id>", "scope": "deterministic",
>   "mock_parser_output": { /* the Step-0 captured reformulator output for this message */ }
> }
> ```
> The captured reformulator output must be injected at the reformulator bypass so
> `$('Call 'sub-query-reformulator'').first().json.output` returns it (clone's `parser-bypass-gate`).

## §9. Two distinct exact codes + missing attachment  (contact `437264483`) — Fix A + Fix B
- **Trigger:** M1 from Step 0 (e.g. "SPAN cert for srtwt03C or SRTUFV101") · `437264483` ·
  `scope: deterministic` · `mock_parser_output` = `tests/fixtures/parser/span-cert-two-codes.json`
  (`domain_hint:"product_attachment"`, two `product` entities raw `SRTWT03C`/`SRTUFV101`, an
  `attachment_type` entity raw `SPAN cert`; plus the descriptor token).
- **Expect-branch:** `resolve-entity` (real read) → `disallowed-entity-gate`: `require_specific === false`,
  `gate_passed === true`, `compatible_entities` = exactly the two exact products
  (SRTWT03C + SRTUFV101 uuids), NO descriptor/union codes. → `If3` FALSE → `Execute 'sub-get-rag'` →
  `tool-filter` → `Loop Over Items` → get-results (real read) → attachment genuinely missing →
  `Aggregate1` → `not-found-error-message` (`require_specific === false`) → Fix-B `else if
  product_attachment` branch → `tag-not-found` → guarded send.
- **Expect-output (structural):**
  - `disallowed-entity-gate.gate_clarification` is empty (no "please choose" / no "search needs to be
    more specific"); `compatible_entities.length === 2`.
  - `not-found-error-message.escalate_message`: does NOT contain substring `product_attachment`;
    contains `product SRTWT03C` and/or `product SRTUFV101` and the attachment-type raw (`SPAN cert`);
    ends with `Would you like me to escalate to ` + a team + ` team?`.
  - The would-send message (egress `sendmsg-sub` record) equals that `escalate_message`.
- **Safety:** §0 all (S1 send blocked; S2 no escalation write — not the escalation branch; S3
  save-session-vars blocked; S4 get-results tool in READ allowlist, never `crm_it_support_ticket_create`;
  S5; S6 deterministic → 0 LLM tokens).
- **TBD contact needed?** No.

## §10. Single exact + variant siblings — no false prompt  (contact `437264483`) — Fix A
- **Trigger:** a product_attachment (or incoming) query for a code with prefix-variant siblings, e.g.
  "image for SRTUB5202" · `437264483` · `scope: deterministic` · `mock_parser_output` with one `product`
  entity raw `SRTUB5202` (resolver returns SRTUB5202 exact + SRTUB5202-* prefix variants).
- **Expect-branch:** gate → `require_specific === false`, exact `SRTUB5202` passes as the sole
  `compatible_entity`; no "please choose". Then normal get-rag/get-results (real read).
- **Expect-output:** `disallowed-entity-gate.require_specific === false`, `gate_clarification` empty,
  `compatible_entities` = [SRTUB5202]; no output string contains "search needs to be more specific".
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §11. Exact-tier discriminator — ambiguity preserved vs exact passthrough  (contact `437264483`) — Fix A regression guard
This case pins the exact-tier discriminator with a matched PAIR: a zero-exact token (must still prompt)
and an exact token (must NOT prompt). Both resolver facts confirmed against the live resolver.

### §11a — genuine ambiguity (token `WC286`, ZERO exact) → SHORT list RETURNED
- **Trigger:** a product_attachment query for `WC286` · `437264483` · `scope: deterministic` ·
  `mock_parser_output` = `tests/fixtures/parser/wc286-ambiguous.json` (one `product` entity raw
  `WC286`; `domain_hint:"product_attachment"`).
- **Resolver fact (pinned):** token `WC286` → 10 matches, ALL `match_tier="substring"`, ZERO exact,
  `ambiguous=true`: `SRTWC286-SH`, `SRTWC286-SH-PP`, `SRTWC286-SH-NEW-150`, `SRTWC286-SH-150`,
  `SRTWC286-SH-NEW-P`, `SRTWC286-SH-NEW-200`, `SRTWC286-SH-NEW`, `SRTWC286-SH-UF`, `SRTWC286-SH-200`,
  `SRTWC286-SH-P`.
- **Expect-branch:** gate → no `exact_entity` for the token → `require_specific === true`,
  `gate_passed === false` → `If3` TRUE → `not-found-error-message` (`require_specific === true` → uses
  `gate.gate_clarification`) → guarded send.
- **Expect-output:** `disallowed-entity-gate.gate_clarification` IS returned (NOT suppressed) and is a
  SHORT "...search needs to be more specific. Multiple matches found — please choose:" list. ASSERT:
  every listed code starts with `SRTWC286` (the token-filter keeps them because each code contains
  `wc286`); the list contains ONLY `WC286`-* variants and NONE of the cross-token union noise (none of
  `AMS-FFAS9859-001500BT0`, `CB114`, `CB111`, `SHU8001`, `SRT0001`); `compatible_entities` are exactly
  those WC286 candidates' uuids; `not-found-error-message.escalate_message === gate.gate_clarification`.
  This proves Fix A did NOT kill legitimate disambiguation.

### §11b — exact token (`SRTUFV101` alone) → direct passthrough, NO prompt
- **Trigger:** a product_attachment query for `SRTUFV101` alone · `437264483` · `scope: deterministic` ·
  `mock_parser_output` with one `product` entity raw `SRTUFV101`.
- **Resolver fact (pinned):** token `SRTUFV101` → `[SRTUFV101 (exact), SRTUFV101-WEPLS (prefix)]` →
  exact-tier short-circuit.
- **Expect-branch:** gate → `require_specific === false`, exact `SRTUFV101` passes as the sole
  `compatible_entity` → `If3` FALSE → get-rag / get-results (real read).
- **Expect-output:** `disallowed-entity-gate.require_specific === false`, `gate_clarification` empty,
  `compatible_entities` = [SRTUFV101]; NO output string contains "please choose" / "search needs to be
  more specific". The `-WEPLS` prefix sibling does NOT trigger a prompt.

The §11a/§11b contrast pins the discriminator: zero-exact ⇒ prompt (preserved); ≥1 exact ⇒ passthrough.
- **Safety:** §0 all (both sub-cases).
- **TBD contact needed?** No.

## §12. Not-found message structure — no literal leak  (contact `437264483`) — Fix B
- **Trigger:** M2 from Step 0 (e.g. "srtufv101 SPAN cert") · `437264483` · `scope: deterministic` ·
  `mock_parser_output` = `tests/fixtures/parser/span-cert-srtufv101.json` (`domain_hint:
  "product_attachment"`, `product` raw `SRTUFV101`, `attachment_type` raw `SPAN cert`).
- **Expect-branch:** gate passes the single exact `SRTUFV101` (`require_specific === false`) → get-results
  (real read) → attachment missing → `not-found-error-message` Fix-B branch → guarded send. (If the
  reformulator's tokens instead drive `If3` TRUE via `unresolved_tokens`, the same Fix-B `else if`
  branch still fires with `require_specific === false`.)
- **Expect-output:** `not-found-error-message.escalate_message` does NOT contain `product_attachment`;
  matches the natural shape "Could not find a SPAN cert for product SRTUFV101. Would you like me to
  escalate to {team} team?" (assert: contains `SPAN cert`, contains `product SRTUFV101`, contains
  `Would you like me to escalate to`, absent `product_attachment`). Compare against the Step-0 BEFORE
  capture (which DID contain `product_attachment`) to prove the fix changed it.
- **Safety:** §0 all.
- **TBD contact needed?** No.

---

## Coverage / blockers summary

| # | Branch                         | Contact      | Scope         | Blocked by |
|---|--------------------------------|--------------|---------------|------------|
| 1 | happy path                     | 437264483    | deterministic | —          |
| 2 | no-access                      | 457216562    | deterministic | —          |
| 3 | escalation / request-for-help  | 437264483    | deterministic | —          |
| 4 | not-supported-domain           | 437264483    | deterministic | —          |
| 5 | entity-not-found / clarify     | 437264483    | deterministic | —          |
| 6 | ask-for-access / partial       | **TBD**      | deterministic | partial-access contact (plan §7.1) |
| 7 | audio / transcription          | 437264483    | deterministic/parser | transcription stub decision (coder) |
| 8 | attachment / media-send        | 437264483    | deterministic | —          |
| 9 | two exact codes + missing attachment (Fix A+B) | 437264483 | deterministic | Step-0 reformulator capture |
| 10| exact + variant siblings, no false prompt (Fix A) | 437264483 | deterministic | — |
| 11| exact-tier discriminator: WC286 ambiguity preserved / SRTUFV101 passthrough (Fix A guard) | 437264483 | deterministic | — |
| 12| not-found message, no literal leak (Fix B) | 437264483 | deterministic | Step-0 reformulator capture |

Cases 9–12 belong to change `fix-gate-render-notfound-msg` (plan `../plans/fix-gate-render-notfound-msg.md`).
Allowed-to-change golden nodes: `disallowed-entity-gate`, `not-found-error-message` + their downstream
cascade on corrected-branch turns ONLY; all unrelated turns must be byte-identical (plan §5.2).

Re-run any deterministic case as `scope: parser` (drop `mock_parser_output`) to validate the live
`gpt-4.1-mini` parser against the same branch, asserting parser output **structurally** (schema +
key fields), never exact text.

---

# Change: `vague-token-clarify-split` (confident-flag-driven not-found clarify)

Plan: `../plans/vague-token-clarify-split.md`. Change 1 (reformulator `XTODTw-dJcV0uRdC056hG`: per-entity
`confident` bool) + Change 2 (clone `not-found-error-message`: vague-token clarify branch). **Change-level
scope: `parser`** (the `confident` signal originates in the reformulator and §13a-parser/§13b/§13f require
the real reformulator). Per-case sub-tier noted below — Change-2 branch-logic cases run `deterministic`
via injected `mock_parser_output` with pinned `confident` flags (0 parser tokens). Contact `437264483`
(FULL access) unless noted. Every case is bound by **§0**.

> The decisive coupling (verified in `escalate-catalog`): `is_escalate_offer = !nf.is_clarification`. So
> the acceptance test for the vague path is: `not-found-error-message.is_clarification === true` ⟹
> `escalate-catalog.is_escalate_offer === false`. No `escalate-catalog`/`If3`/`tag-not-found` edit exists.
>
> Redis seed item shape (per `fix-gate-render-notfound-msg` §3); for `parser` cases OMIT
> `mock_parser_output` so `parser-bypass-gate` is FALSE and the real reformulator runs.

## §13. Vague-token clarify split

### §13a — vague mash → clarify, no escalate offer  (contact `437264483`)
- **Trigger:** `"One siew srtkt72ss already delivered?"` · `437264483`.
  - **§13a-parser** (`scope: parser`): real reformulator runs. **Assert (Change 1):** entities has exactly
    ONE entity, `hint:"order"`, `confident:false` (the qty+name+code mash). Pin this output to
    `tests/fixtures/parser/vague-mash-one-siew.json`.
  - **§13a-det** (`scope: deterministic`): `mock_parser_output = tests/fixtures/parser/vague-mash-one-siew.json`.
- **Expect-branch:** `resolve-entity` (real read) → `unresolved_tokens` contains `"One siew srtkt72ss"`
  → `If3` TRUE → `not-found-error-message`: the new vague-clarify check fires (unresolved token maps by
  `raw` to the `confident:false` entity) → `is_clarification = true` → `tag-not-found` →
  `escalate-catalog` (`not_found` → `is_escalate_offer = !is_clarification = false`) → guarded send.
- **Expect-output (structural):**
  - `not-found-error-message.is_clarification === true`; `not-found-error-message.require_specific`
    falsy → `escalate-catalog.manualResponse === true`.
  - `escalate-catalog.is_escalate_offer === false`.
  - `escalate_message` echoes the captured raw (`One siew srtkt72ss`), states it couldn't tell which part
    is which, and asks for a labeled specific drawn from `ALLOWED.order`
    (`order, customer_order, transporter, customer, or product` — i.e. contains the order/customer/product
    label set). It does **NOT** contain the substring `escalate to` / `Would you like me to escalate`.
  - The would-send egress `sendmsg-sub` record equals that `escalate_message`, `blocked:true`.
- **Safety:** §0 all. S2 — NOT the escalation branch (`If2` not taken), no assignment/SLA/comment write.
- **TBD contact needed?** No.

### §13b — labeled split → both confident → resolves  (contact `437264483`)  — `scope: parser`
- **Trigger:** `"customer one siew, product srtkt72ss"` (turn-2 labeled form) · `437264483` · real
  reformulator.
- **Expect-branch (Change 1):** reformulator SPLITS into ≥2 entities — a `{hint:"customer",confident:true}`
  and a `{hint:"product",confident:true}`. `resolve-entity` resolves an ORDER via `match_mode:"and"`
  (customer ∧ product) → `unresolved_tokens` empty → `If3` FALSE → `Execute 'sub-get-rag'` → get-results
  (real read). NO clarify, NO escalate-offer. Pin reformulator output to
  `tests/fixtures/parser/labeled-split-one-siew.json`.
- **Expect-output (structural):** entities array length ≥2, BOTH `confident:true`, hints `{customer,
  product}`; `resolve-entity.unresolved_tokens` empty (or the order resolved). No node output sets
  `is_clarification=true` for a vague token; no `escalate-catalog.is_escalate_offer` on this turn.
- **Verify-during-build dependency:** V-C1 (resolver ANDs customer+product into an order). If the resolver
  cannot AND-resolve, downgrade the assertion to: entities split + both confident + `If3` direction is the
  get-rag side (not the vague-clarify side). Flag, do not silently pass.
- **Safety:** §0 all. S4 — get-results tool in READ allowlist, never `crm_it_support_ticket_create`.
- **TBD contact needed?** No.

### §13c — clear-but-unresolved single code → escalate offer UNCHANGED  (contact `437264483`)
- **Trigger:** `"status of order SMC202606-9999"` (a clear, well-formed DO that does not exist) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` = one `{hint:"order", raw:"SMC202606-9999",
  confident:true}` entity, `domain_hint:"order"`.
- **Expect-branch:** `resolve-entity` (real read) → `unresolved_tokens` contains `SMC202606-9999` →
  `If3` TRUE → `not-found-error-message`: vague-clarify check does NOT fire (the unresolved token maps to
  a `confident:true` entity) → existing escalate `else` branch → `is_clarification=false` →
  `escalate-catalog.is_escalate_offer = true`.
- **Expect-output:** `is_clarification === false`; `is_escalate_offer === true`; `escalate_message` is the
  unchanged "Could not find order for … Would you like me to escalate to customer_service team?" shape
  (contains `Would you like me to escalate to`). This pins that the change does NOT regress the
  clear-but-missing escalate offer.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §13d — clear-but-no-data → escalate offer, NEVER hits vague-clarify  (contact `437264483`)
- **Trigger:** `"incoming for SRTKT72SS"` (a REAL product code that resolves but yields 0 incoming rows) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` = one `{hint:"product", raw:"SRTKT72SS",
  confident:true}` entity, `domain_hint:"incoming"`.
- **Expect-branch:** `resolve-entity` resolves `SRTKT72SS` → `unresolved_tokens` empty → `If3` FALSE →
  `Execute 'sub-get-rag'` → get-results (real read) → 0 rows → `Aggregate1` re-entry into
  `not-found-error-message`. On this re-entry `unresolved` is empty → vague-clarify check does NOT fire →
  existing escalate branch → `is_escalate_offer = true`.
- **Expect-output:** `not-found-error-message.is_clarification === false`;
  `escalate-catalog.is_escalate_offer === true`; the path went through get-rag/get-results (assert
  get-results node ran), NOT the `If3`-TRUE direct not-found. This proves a data-miss never masquerades as
  a vague-token clarify.
- **Safety:** §0 all. S4 — read tool only.
- **TBD contact needed?** No.

### §13e — multi-word-clear unresolved → escalate, NOT clarify  (contact `437264483`)
- **Trigger:** `"do you have water closet"` (multi-word but ONE clean category referent) · `437264483` ·
  `scope: deterministic` · `mock_parser_output` = one `{hint:"category", raw:"water closet",
  confident:true}` entity (domain e.g. `inventory`/`master_products`) — chosen so resolve-entity leaves it
  unresolved (or set `domain`/code so `If3` TRUE).
- **Expect-branch:** unresolved token `water closet` maps to a `confident:true` entity → vague-clarify
  check does NOT fire → existing escalate offer.
- **Expect-output:** `is_clarification === false`, `is_escalate_offer === true`. **Discriminator:** a
  2-word phrase does NOT trigger clarify — proving vagueness is semantic (`confident`), not word-count.
  Assert the `escalate_message` is the escalate-offer shape, not the "couldn't tell which part is which"
  clarify shape.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §13f — loop: repeated vague stays clarify; request_for_help escalates  (contact `437264483`)
- **Trigger (multi-turn, `scope: parser` for the vague turns):**
  - T1: `"One siew srtkt72ss already delivered?"` → clarify (as §13a).
  - T2: another vague mash, e.g. `"two pintu cks tu macam mana"` → clarify AGAIN (still
    `is_clarification=true`, `is_escalate_offer=false`). Assert NO new state accreted between T1/T2 (the
    only control is the current-turn `confident` flag; no session variable added) and the reformulator did
    NOT read T2 as an escalation confirmation (`If2` NOT taken — proves the dead next-turn-escalation
    worry).
  - T3: `"please get a human to help"` (`request_for_help`) → `If2` TRUE →
    `Call 'sub-human-intervention'` (`rrYXzE61gCNUck_zmXe-G`, `is_test=true`) → sub short-circuits.
- **Expect-output:** T1/T2 each → `is_escalate_offer=false`, NO `escalate to` substring. T3 → egress log
  `{guard:"human-intervention-sub", blocked:true}`.
- **Safety:** §0 all. **S2 is the focus on T3** (highest risk): assert NONE of `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the
  assignee-queue `Redis` push executed.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                  | Contact   | Sub-scope     | Blocked by |
|------|-----------------------------------------------------|-----------|---------------|------------|
| 13a-parser | reformulator emits `confident:false` (Change 1) | 437264483 | parser        | — |
| 13a-det    | vague → clarify, no escalate offer (Change 2)   | 437264483 | deterministic | 13a-parser fixture |
| 13b  | labeled split → both confident → resolves           | 437264483 | parser        | V-C1 resolver AND |
| 13c  | clear-but-unresolved → escalate UNCHANGED           | 437264483 | deterministic | — |
| 13d  | clear-but-no-data → escalate, never clarify         | 437264483 | deterministic | — |
| 13e  | multi-word-clear → escalate, not clarify            | 437264483 | deterministic | — |
| 13f  | loop: repeated vague clarify; RFH escalates         | 437264483 | parser        | — |

Cases 13a–13f belong to change `vague-token-clarify-split` (plan `../plans/vague-token-clarify-split.md`).
Allowed-to-change golden nodes (plan §7.2): the reformulator parse output (additive `confident` key on
entities) and clone `not-found-error-message` + its downstream cascade ONLY on turns where the vague-clarify
check flips `is_clarification`; every other turn byte-identical except the additive `confident:true` key.

---

# Change: `cert-brand-routing-fix` (deriveRouting isCert widened for brand-named certs)

Plan: `../plans/cert-brand-routing-fix.md`. Single-spot fix in reformulator `XTODTw-dJcV0uRdC056hG`
`output_exchange` → `deriveRouting`: widen the cert-vs-photo discriminator so a certificate named by its
issuing body/brand (SPAN, SIRIM, BOMBA, MS####, Halal) routes to `purchasing_certification` instead of
`marketing_product`. **Change-level scope: `parser`.** The assertion target is the reformulator's own
output `output.output.routing.suggested_team`; the fix lives inside the reformulator, so a `deterministic`
`mock_parser_output` injection at the clone's `parser-bypass-gate` **bypasses the reformulator and CANNOT
exercise `deriveRouting`** — these cases MUST run with the real (rebased) reformulator copy. Build/test
target: a fresh reformulator copy rebased on CURRENT live `XTODTw` + the fix, re-pointed from clone
`txiPzSxy3Pclsz6v` (plan §5). Contact `437264483` (FULL access) for all. Every case bound by **§0**.

> Decisive coupling (plan §0): `deriveRouting` discards the LLM's emitted `routing` and re-derives it
> mechanically (output_exchange lines 386–393), so the ONLY thing that matters is the post-fix
> `deriveRouting` output. Assert on `output_exchange.output.output.routing.suggested_team` from the
> reformulator sub-execution (`get_execution(includeData:true)` on the reformulator copy). Cheapest gate is
> the offline `deriveRouting` unit (plan §6 V-R0); the §14 cases are the end-to-end parser confirmation.
>
> Redis seed shape per `fix-gate-render-notfound-msg` §3; for these `parser` cases OMIT `mock_parser_output`
> so `parser-bypass-gate` is FALSE and the real (rebased) reformulator runs.

## §14. Cert-brand routing

### §14a — `SPAN cert` brand-named certificate → purchasing_certification  (the bug case) — `scope: parser`
- **Trigger:** `"may i have SPAN cert for urinal flush valve srtwt03C or SRTUFV101"` · `437264483` · real
  reformulator copy. (Exact reproduction of live exec `7019613`.)
- **Expect-branch:** reformulator parses `domain_hint:"product_attachment"`,
  `intent_hint:"check_product_attachment"`, an `attachment_type` entity `{raw:"SPAN"}`, and a `user_goal`
  containing `"certificate"`. `deriveRouting` `isCert` fires via BOTH the widened brand regex (`span`) AND
  the semantic fallback → `product_attachment` cert branch.
- **Expect-output (structural):** `output_exchange.output.output.routing.suggested_team ===
  "purchasing_certification"` and `…suggested_agent === "general_enquiries"`. (Pre-fix this was
  `marketing_product` — the regression boundary.) Do NOT assert exact `user_goal` text.
- **Safety:** §0 all. S2 — `suggested_team` must NOT drive a real assignment: the human-intervention sub
  short-circuits (`is_test=true`); no `Assign or unassign a Conversation1`, SLA, or PIC-comment write.
- **TBD contact needed?** No.

### §14b — `SIRIM cert` / `BOMBA cert` (brand word + "cert") → purchasing_certification — `scope: parser`
- **Trigger (run both):** `"SIRIM cert for SRTUFV101"` and `"BOMBA cert for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** `domain_hint:"product_attachment"`, attachment_type entity raw `SIRIM`/`BOMBA` (or
  `"certificate"`), `user_goal` contains `"cert"/"certificate"`. `isCert` fires via brand regex and/or the
  semantic fallback.
- **Expect-output:** `routing.suggested_team === "purchasing_certification"` for each.
- **Safety:** §0 all. S2 focus as §14a.
- **TBD contact needed?** No.

### §14c — bare brand, NO "cert" word → purchasing_certification via brand regex (#1) — `scope: parser`
- **Trigger:** `"SPAN for SRTUFV101"` (no "cert"/"certificate" word) · `437264483` · real reformulator copy.
- **Expect-branch:** route depends ENTIRELY on parser shape (plan §4): the brand-regex fallback (#1) helps
  ONLY IF the parser sets `domain_hint:"product_attachment"` AND emits an `attachment_type` entity
  `{raw:"SPAN"}`. The semantic fallback (#2) cannot help — no cert word in `user_goal`.
- **Expect-output:**
  - IF parser yields `domain_hint:"product_attachment"` + attachment_type `{raw:"SPAN"}` →
    `routing.suggested_team === "purchasing_certification"` (proves trigger #1, brand-regex path).
  - ELSE (parser routes it to `master_products`/null or omits the attachment_type entity) → record the
    observed `domain_hint` + entities, mark **inconclusive-by-parser**, and FLAG (do not pass/fail on a
    wrong premise; the fix is correctly inert for that shape — see plan §4). Does NOT block acceptance,
    which rests on §14a/§14b.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14d — plain `certificate` / `Ikram cert` → purchasing_certification (UNCHANGED) — `scope: parser`
- **Trigger (run both):** `"certificate for SRTUFV101"` and `"Ikram cert for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** attachment_type entity raw normalizes to `"certificate"`/`ikram`; the ORIGINAL
  `/cert|ikram/` already matched these — proves the widened regex is a strict superset (no regression on
  forms that already worked).
- **Expect-output:** `routing.suggested_team === "purchasing_certification"` for each.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14e — `photo` / `technical drawing` → marketing_product (UNCHANGED; over-fire guard) — `scope: parser`
- **Trigger (run both):** `"photo for SRTUFV101"` and `"technical drawing for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** `domain_hint:"product_attachment"`, attachment_type raw `photo`/`technical drawing`,
  `user_goal` has NO `cert`/`certificate` word → `isCert=false` (neither trigger fires) → photo branch.
- **Expect-output:** `routing.suggested_team === "marketing_product"` for each. **This is the critical
  guard against `isCert` over-firing** — a genuine photo/drawing request must NOT be pulled to
  `purchasing_certification`.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14f — non-attachment domain → routing UNCHANGED (no regression) — `scope: parser`
- **Trigger (run both):** `"incoming for SRTKT72SS"` (domain `incoming`) and a promotion query e.g.
  `"any promotion for sorento"` (domain `promotion`) · `437264483` · real reformulator copy.
- **Expect-branch:** `domain_hint` ≠ `product_attachment`, so `deriveRouting` never reads `isCert` →
  routing comes from the domain map only. Proves the fix is inert outside `product_attachment`.
- **Expect-output:** `incoming` → `routing.suggested_team === "purchasing"`,
  `suggested_agent === "incoming_stock_enquiries"`; promotion → `routing.suggested_team` starts with
  `"marketing_promotion_"`. (Assert byte-identical to a pre-fix run of the same message.)
- **Safety:** §0 all.
- **TBD contact needed?** No.

### Coverage (this change)
| #   | Branch / assertion                                          | Contact   | Sub-scope | Blocked by |
|-----|-------------------------------------------------------------|-----------|-----------|------------|
| 14a | SPAN cert → purchasing_certification (the bug, exec 7019613)| 437264483 | parser    | rebased reformulator copy |
| 14b | SIRIM/BOMBA cert → purchasing_certification                 | 437264483 | parser    | rebased reformulator copy |
| 14c | bare brand, no "cert" → purchasing_certification (regex #1) | 437264483 | parser    | parser shape (plan §4) |
| 14d | plain certificate / Ikram cert → purchasing_certification (UNCHANGED) | 437264483 | parser | — |
| 14e | photo / technical drawing → marketing_product (UNCHANGED, over-fire guard) | 437264483 | parser | — |
| 14f | non-attachment domain → routing UNCHANGED                   | 437264483 | parser    | — |

Primary correctness gate is the offline `deriveRouting` unit (plan §6 V-R0); §14a–§14f are the end-to-end
parser confirmation on the rebased copy. Acceptance rests on §14a/§14b/§14d/§14e/§14f; §14c may be
`inconclusive-by-parser` (flagged) without blocking. Plus a **sampled-regression pass** (plan §6 V-R5) over
real attachment/photo/cert traffic: assert the ONLY routing deltas are
`marketing_product → purchasing_certification` on genuine cert turns, zero drift on photo/drawing and
non-attachment turns.

---

# Change: `order-member-pick-name-resolve` (resolve a CS-member pick by NAME — LLM extracts, code resolves)

Plan: `../plans/order-member-pick-name-resolve.md`. Two deltas in reformulator `XTODTw-dJcV0uRdC056hG`:
**Δ-prompt** (`AI Agent.systemMessage`: a `== PERSON-NAME MENTION ==` section + a new `person_mention`
key in the OUTPUT block — the LLM ALWAYS extracts the surface name, never maps to a position, never gates on
context) + **Δ-code** (`output_exchange` Δ3: a new resolution arm — when `selection_context==='member_offer'`
AND `reference_positions` empty AND `person_mention` non-null, normalize + tier-match (exact → token-overlap →
substring) against `last_result_set[].label`; 1 match → resolve, >1 → `member_reprompt:'multi'`, 0 →
`member_reprompt:'out_of_range'`; arm sits inside the existing `!_isNewQuery` gate). **Change-level scope:
`parser`** — `person_mention` is LLM-emitted, so per LESSON 28 a `mock_reformulator_output` injection bypasses
both deltas; §15 cases MUST run the **real, rebased reformulator copy** (plan §6). The numeric/ordinal pick
path is UNCHANGED. Contact `437264483` (FULL access) for all. Every case bound by **§0**.

> **Two assertion layers (plan §6):**
> - **LLM layer** — assert `output.output.person_mention` is the extracted surface string (name turns) or
>   `null` (non-name turns). Real reformulator only.
> - **Code layer** — assert `output_exchange.output.output.escalation` after the resolution arm. Single-match
>   shape is `{ is_escalation_confirmation:true, preferred_assignee_id:<last_result_set[idx].uuid> }` with
>   `entities:[]`. Offline-unit-testable (plan §8 V0) + confirmed in the parser e2e run.
> Assert on the reformulator sub-execution (`get_execution(includeData:true)` → `output_exchange` output). Do
> NOT assert exact `user_goal`/free text.

> **Member_offer state seed (mechanism — plan §6a, LESSON 31).** A pick turn needs
> `previous_conversation_state.{selection_context:"member_offer", last_result_set:[…], domain_hint:"order"}`.
> Injecting it in the redis item does NOT work — the reformulator reads it from `get-session-vars`. **Pre-seed
> `respond_contacts_test` (cred `Dnnofg8Xb27VQOhI`) for `437264483`** and run each case as a single turn in
> **`mode=regress-capture`**, re-seeding between independent cases. The CODE matcher uses `latest_user_message`
> + `last_result_set` only (NOT `response`), so `response` is not load-bearing — seed a realistic one anyway.
> Synthetic uuids are safe (human-intervention sub guarded; no real assign). Two seed lists (validated offline
> against the §4 matcher):
> - **L-distinct** = `[{idx:1,label:"Ms Tan",uuid:"u-tan",respond_user_id:"1097739"},
>   {idx:2,label:"Mr Lee",uuid:"u-lee",respond_user_id:"1097740"},
>   {idx:3,label:"Ms Wong",uuid:"u-wong",respond_user_id:"1097741"}]` (distinct single surnames; "tan"→[1], "wong"→[3]).
> - **L-ambig** = `[{idx:1,label:"Ms Tan Mei",uuid:"u-tan1"},{idx:2,label:"Mr Lee",uuid:"u-lee"},
>   {idx:3,label:"Mr Tan Wei",uuid:"u-tan3"}]` (two compound "Tan"s; "tan" misses exact tier → token tier
>   collects [1,3] → multi).
>
> Capture both into `tests/fixtures/contacts/member-offer-distinct.json` /
> `tests/fixtures/contacts/member-offer-ambig.json`. For these `parser` cases OMIT `mock_reformulator_output`.

## §15. CS member pick by name

### §15a — exact name "Ms Tan"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"Ms Tan"` · `437264483` · real reformulator · session pre-seeded L-distinct.
- **LLM-layer:** `person_mention === "Ms Tan"` (surface).
- **Code-layer:** normalize → "tan", exact-tier matches idx1 → resolve.
- **Expect-output:** `escalation.is_escalation_confirmation === true`;
  `escalation.preferred_assignee_id === "u-tan"`; `escalation.member_reprompt` ABSENT; `entities === []`.
- **Safety:** §0 all. **S2 focus** — `preferred_assignee_id` set but the human-intervention sub short-circuits
  (`is_test=true`): NONE of `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
  `Call 'sub-add-comment-respond'`/`'1`, assignee-queue `Redis` push ran.
- **TBD contact needed?** No.

### §15b — honorific variant "miss tan"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"miss tan"` (lower-case, "Miss" vs listed "Ms") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "miss tan"` (surface, NOT normalized by the LLM).
- **Code-layer:** strip honorific "miss" + lowercase → "tan" → exact-tier idx1.
- **Expect-output:** `preferred_assignee_id === "u-tan"`, `is_escalation_confirmation:true`, `entities:[]`.
  Proves honorific/case normalization lives in CODE.
- **Safety:** §0 all (S2 as §15a).
- **TBD contact needed?** No.

### §15c — partial / surname only "tan"  (contact `437264483`) — seed L-distinct — `scope: parser` — **classification-sensitive**
- **Trigger:** `"tan"` (bare surname, unique in L-distinct) · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "tan"`.
- **Code-layer:** "tan" exact-matches only "Ms Tan"(→"tan") → idx1 IF the resolution arm is reached.
- **Observed (golden_run 11, 2026-07-01):** the real parser classifies a bare plausible-customer surname as a
  `current_message` customer entity + `domain_hint:"order"` → `_isNewQuery=true` → Δ3 member-arm **skipped** →
  routes to a new order query (no resolve). This routing is **run/seed-sensitive** (the same token resolved via
  the member arm in §15f). **Accepted safe-direction behavior** (user-confirmed 2026-06-30): bare surname that
  doubles as a customer name fails safe — never wrong-assigns.
- **Expect-output:** EITHER `preferred_assignee_id === "u-tan"` (arm reached) OR no resolve + new-query parse
  (`domain_hint:"order"`, `_isNewQuery=true`) — **both PASS**. A resolve to ANY uuid ≠ "u-tan" IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15d — typo "Mss Tann"  (contact `437264483`) — seed L-distinct — `scope: parser` — **best-effort**
- **Trigger:** `"Mss Tann"` (misspelled — "Mss" not a recognized honorific, "Tann" extra letter) · `437264483`.
- **LLM-layer:** `person_mention === "Mss Tann"` (surface).
- **Code-layer (deterministic best-effort, plan §5):** "mss" not stripped → "mss tann"; exact/token miss;
  substring tier: `_q.includes("tan")` (since "tann" contains "tan") → idx1. **Insertion-style typos resolve;
  transposition/deletion typos (e.g. "Tna") do NOT — code matching is not fuzzy.**
- **Expect-output:** PASS if `preferred_assignee_id === "u-tan"`. A **safe miss** (0 match →
  `member_reprompt:'out_of_range'`, no resolve) is **NOT a failure** — record `tolerated-miss`. A *wrong*
  resolve (any uuid ≠ "u-tan") IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15e — given/surname only "Wong"  (contact `437264483`) — seed L-distinct — `scope: parser` — **classification-sensitive**
- **Trigger:** `"Wong"` (references idx3 "Ms Wong") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Wong"`.
- **Code-layer:** "wong" exact-matches "Ms Wong"(→"wong") → idx3 IF the resolution arm is reached.
- **Observed (golden_run 11, 2026-07-01):** same as §15c — bare plausible-customer surname classified as a new
  order query (`domain_hint:"order"`, `_isNewQuery=true`) → member-arm skipped → no resolve. **Accepted
  safe-direction behavior**; never wrong-assigns.
- **Expect-output:** EITHER `preferred_assignee_id === "u-wong"` OR no resolve + new-query parse — **both PASS**.
  A resolve to ANY uuid ≠ "u-wong" IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15f — two-similar-names ambiguity "Tan"  (contact `437264483`) — seed **L-ambig** — `scope: parser`
- **Trigger:** `"Tan"` against L-ambig (idx1 "Ms Tan Mei" AND idx3 "Mr Tan Wei") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Tan"`.
- **Code-layer:** "tan" misses the exact tier (labels normalize to "tan mei"/"tan wei"); token tier: "tan" ∈
  both → matches [1,3] → `member_reprompt:'multi'`. **Never auto-picks** (ambiguity gate, plan §4.2).
- **Expect-output:** `escalation.member_reprompt === 'multi'`; `escalation.is_escalation_confirmation ===
  false`; `escalation.preferred_assignee_id` ABSENT; `correction === true`. **HARD invariant:** no single
  `preferred_assignee_id` is ever set for an ambiguous name.
- **Safety:** §0 all. **S2 is the focus** — a wrong CS assign here is the highest-risk failure.
- **TBD contact needed?** No.

### §15g — no-match name "Bob"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"Bob"` (matches nobody listed) · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Bob"` OR `null` — both acceptable (observed `null` in golden_run 11; the
  LLM does not always surface a non-listed name as a person mention).
- **Code-layer:** "bob" misses all three tiers → 0 match → `member_reprompt:'out_of_range'` (reprompt the
  list; plan §4 recommendation — reuses existing render, no clone change), OR a new-query/not-found re-offer.
- **Expect-output:** NO `preferred_assignee_id`; NO `is_escalation_confirmation:true`. Accept any of:
  `member_reprompt:'out_of_range'` reprompt, a clean abandon, or a not-found CS member re-offer (all observed/
  acceptable). A resolve to ANY member is a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15h — REGRESSION: plain numeric "2" still resolves  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"2"` · `437264483` · real reformulator.
- **Code-layer:** numeric `_extract` mines `2` → numeric single-pick arm (person_mention arm not reached).
- **Expect-output:** `preferred_assignee_id === "u-lee"` (idx2), `is_escalation_confirmation:true`. Proves the
  numeric path is unbroken by the new deltas. (`person_mention` is `null` for a bare number.)
- **Safety:** §0 all (S2 as §15a).
- **TBD contact needed?** No.

### §15i — REGRESSION: "yes" affirmative → round-robin  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"yes"` · `437264483` · real reformulator.
- **Expect-output:** `escalation.is_escalation_confirmation === true` with NO `preferred_assignee_id`
  (round-robin); `person_mention === null`. Proves affirmative confirmation is unchanged.
- **Safety:** §0 all. S2 — human-intervention sub still short-circuits (no real round-robin assign).
- **TBD contact needed?** No.

### §15j — REGRESSION: unrelated new query (no person) abandons  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"any incoming for CKS315"` (fresh business query, no person named — the Bug-2 case) · `437264483`.
- **Expect-branch:** `person_mention === null` (CKS315 is not a person); LLM parses `domain_hint:"incoming"`,
  entity `CKS315`(`current_message:true`) → `_isNewQuery=true` → Δ3 block skipped → normal new-query parse.
- **Expect-output:** NO `escalation.preferred_assignee_id`; NO `member_reprompt`; `domain_hint === "incoming"`,
  the `CKS315` entity present; `person_mention === null`. Routes to get-results, not re-offer.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15k — REGRESSION (NEW): person-naming new query in member_offer → abandons, NOT auto-resolve  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"any orders for Tan"` (a NEW business query that names a listed member, while member_offer is
  open) · `437264483` · real reformulator. **This pins the §5 residual-risk protection.**
- **Expect-branch:** LLM emits `person_mention === "Tan"` (a person IS named) AND parses a business query
  (`domain_hint:"order"` + a `current_message` entity) → `_isNewQuery === true` → Δ3 block SKIPPED →
  `person_mention` IGNORED → offer abandoned, normal order parse. **The `_isNewQuery` gate (plan §4.1), not the
  LLM, prevents the wrong resolve.**
- **Expect-output:** NO `escalation.preferred_assignee_id` (must NOT resolve to "u-tan"); NO `member_reprompt`;
  `domain_hint === "order"`. **A resolve to any member here is a HARD FAIL** (it would be a wrong CS assign in
  prod). If the LLM fails to set `domain_hint`/entity so `_isNewQuery` is false and the arm resolves, FLAG
  loudly (the §5 lowest-residual edge) — do not silently pass.
- **Safety:** §0 all. **S2 focus** — even on a mis-resolve, the human-intervention sub short-circuits in test;
  assert NO assign/SLA/comment/queue write fired.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                       | Contact   | Seed       | Sub-scope | Note |
|------|----------------------------------------------------------|-----------|------------|-----------|------|
| 15a  | exact name → resolve                                     | 437264483 | L-distinct | parser    | — |
| 15b  | honorific variant → resolve (code normalizes)            | 437264483 | L-distinct | parser    | — |
| 15c  | unique partial/surname → resolve OR safe new-query abandon | 437264483 | L-distinct | parser  | classification-sensitive; both pass, wrong-resolve = hard fail |
| 15d  | typo → resolve                                           | 437264483 | L-distinct | parser    | best-effort (insertion resolves; transposition safe-misses) |
| 15e  | given/surname only → resolve OR safe new-query abandon   | 437264483 | L-distinct | parser    | classification-sensitive; both pass, wrong-resolve = hard fail |
| 15f  | two-"Tan" ambiguity → `multi` reprompt, no auto-pick     | 437264483 | **L-ambig** | parser   | HARD: never single-pick |
| 15g  | no-match name → reprompt / abandon / re-offer, no resolve | 437264483 | L-distinct | parser   | person_mention null-or-"Bob"; wrong-resolve = hard fail |
| 15h  | regression: numeric "2" still resolves                   | 437264483 | L-distinct | parser    | person_mention null |
| 15i  | regression: "yes" → round-robin                          | 437264483 | L-distinct | parser    | person_mention null |
| 15j  | regression: unrelated new query (no person) abandons     | 437264483 | L-distinct | parser    | person_mention null |
| 15k  | regression: person-naming new query in member_offer abandons (§5 guard) | 437264483 | L-distinct | parser | HARD: `_isNewQuery` must gate |

Cheapest gate first: plan §8 V0 (offline `output_exchange` Δ-code unit — single/ambiguity/no-match/`_isNewQuery`
gate, 0-token) before the parser cases. **Golden handling (plan §7):** `person_mention` is additive on EVERY
parser output — register it as **ignored-when-`null`, flagged-when-non-null** in the replay diff (NOT a blanket
ignore; LESSON 21). Allowed-to-change golden nodes: the reformulator parse output (additive `person_mention` +
`escalation`/`correction` on member_offer name-reply turns) + `output_exchange` + the downstream escalation
cascade ONLY on those turns; every other turn byte-identical except the additive `person_mention` key. Name-pick
turns have **no historical golden** — capture §15a–§15k fresh as the new golden. Run V4 (sampled regression) to
prove the always-extract is inert off member_offer turns.

---

# Change: `fix-suggest-offer-uuid-label` (did-you-mean leaks raw UUIDs for promotions)

Plan: `../plans/fix-suggest-offer-uuid-label.md`. Single-node fix in spine `build-suggest-offer`
(id `7972abd8-5d6b-40ff-9d38-152782cd8091`; forked on clone `txiPzSxy3Pclsz6v`). D1 (and D2 defensively)
render a human label instead of a promotion's UUID `canonical_code`, and switch uuid-coded offers to
**numbered buttons + human names in the message text**. **Change-level scope: `deterministic`** — parser
bypassed via `mock_parser_output`; `resolve-entity` + get-results run as real READS. Contact `437264483`
(FULL access). Every case bound by **§0**.

> **Cheapest gate first: the offline `build-suggest-offer` unit (§V0 below) is the PRIMARY correctness
> gate** — it pins the fix against the confirmed resolver match shape with zero dependence on the live
> resolver's miss-vs-pin nondeterminism (plan §5/§7.3). The e2e cases confirm it fires in the real graph.
>
> Redis seed shape per `fix-gate-render-notfound-msg` §3 (push `main-message-list-test` → `execute_workflow`
> → `get_execution(includeData:true)` + read `test:egress:{test_run_id}`). `mock_parser_output` present ⇒
> reformulator bypassed (0 parser tokens).
>
> **UUID regex used in assertions:** `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i`.

## §V0. Offline `build-suggest-offer` unit  (0-token, no seed) — PRIMARY GATE
Feed the node synthetic upstream inputs (`$input.first().json`, `resolve-entity`, `disallowed-entity-gate`,
`Call 'sub-query-reformulator'`, `Call 'sub-get-results'`) and assert its output object.

- **V0-a — promotion D1 (the bug):** `resolve-entity` = one unresolved resolution `{token:"sorento",
  resolved:false, matches:[ {entity_type:"promotion", canonical_code:"406c76cb-…", uuid:"406c76cb-…",
  match_field:"description", display:{description:"SORENTO HIGH BASIN TAP PROMO_24062026 DEALER.pdf"}},
  {entity_type:"promotion", canonical_code:"7e9fee38-…", uuid:"7e9fee38-…", match_field:"description",
  display:{description:"SORENTO SINK MIXER PROMO_… DEALER.pdf"}} ]}`; `gate.gate_debug.allowed_lookup=
  ["product","promotion","category","brand"]`, `require_specific:false`; `q.domain_hint:"promotion"`,
  `q.routing.suggested_team:"marketing_promotion_sorento"`; `out.is_clarification` unset.
  - **Assert:** `suggest_offer===true`; `suggest_response` **contains NO UUID** (regex absent) AND contains
    both descriptions ("SORENTO HIGH BASIN…", "SORENTO SINK MIXER…"); `suggest_quick_reply` picks are
    **numeric** (`"1,2,…"` + Yes + No, each pick title ≤3 chars, no UUID); `suggest_last_result_set[0].uuid
    === "406c76cb-…"` and `[0].label` === the first description (round-trip carries uuid — plan §2.1);
    `suggest_selection_context==="suggest_offer"`.
- **V0-b — product D1 no-regression:** `matches:[{canonical_code:"CWCX605-RL", match_tier:"prefix",
  uuid:"…"}]` (real code, not a uuid). **Assert byte-identical to pre-fix code-mode:** `suggest_quick_reply`
  starts `"CWCX605-RL,…"`, `suggest_response` = "…Did you mean CWCX605-RL? Reply with a code to continue…";
  `suggest_last_result_set[0].label==="CWCX605-RL"`.
- **V0-c — drop-if-uuid-with-no-name:** single candidate `{entity_type:"promotion", canonical_code:"<uuid>",
  uuid:"<uuid>"}` with NO `display`. **Assert** candidate dropped → `suggest_offer===false` (falls through to
  escalate-only; no invented data; no uuid anywhere in output).
- **V0-d — D2 uuid guard:** `Call 'sub-get-results'` alternatives `[{value:"<uuid>", display:"SOME PROMO.pdf"}]`,
  `relaxed_axis:"entity"`. **Assert** no bare uuid rendered (display used / numbered mode). Control:
  `alternatives:[{value:"SRTWC287", display:"SRTWC287 (stock 5)"}]` → unchanged (value is a real code).
- **Safety:** offline unit, no egress at all.

## §16. E2E promotion did-you-mean — no UUID leak  (contact `437264483`) — D1
- **Trigger (E1):** `"any promotion for sorento"` · `437264483` · `scope: deterministic` ·
  `mock_parser_output` with `domain_hint:"promotion"`, a broad promo token entity `raw:"sorento"`,
  `routing.suggested_team:"marketing_promotion_sorento"`. `resolve-entity` runs as a real READ.
- **Expect-branch:** if the resolver MISSES with promotion candidates → `build-suggest-offer` D1 numbered mode
  → `compile-current-state` → guarded `sendmsg` sub. **If the resolver PINS one promo** (valid happy outcome,
  customer would get the PDF) → `suggest_offer` never set → **re-seed a barer token** until D1 fires
  (classification-sensitive, plan §5). D1-fired is required to exercise the assertions.
- **Expect-output (structural, once D1 fires):** the would-send message (egress `sendmsg-sub` record's
  `message`) contains **NO UUID** (regex absent) and contains human promo names (`display.description`
  strings); the egress record's `quick_reply` picks are numeric ("1","2",…) + Yes/No, each ≤3 chars;
  `compile-current-state.variables.last_result_set[i].uuid` is a promo UUID and `.label` is a description.
- **Safety:** §0 all. S1 send guarded; S2 NOT the escalation branch (no assignment write); S4 get-results not
  reached on the miss (or read-only if reached); S6 deterministic → 0 LLM tokens.
- **TBD contact needed?** No.

## §17. Round-trip — numeric pick resolves the promotion by UUID  (contact `437264483`) — D4/round-trip
- **Trigger (E2, turn 2 after §16):** reply `"1"` · `437264483` · `scope: deterministic` · session mid
  `suggest_offer` with the §16 `last_result_set` seeded (pre-seed `respond_contacts_test` for `437264483`
  in `mode=regress-capture`, per LESSON 31 — the reformulator reads `previous_conversation_state` from
  `get-session-vars`, not the redis item). Seed `selection_context:"suggest_offer"`, `domain_hint:"promotion"`,
  and a 2-row `last_result_set` where row1 `{idx:1, label:"SORENTO HIGH BASIN…pdf", value:"SORENTO HIGH
  BASIN…pdf", product:"406c76cb-…", uuid:"406c76cb-…"}`. Real reformulator (this turn asserts the round-trip,
  so run the parser — but the fix itself is scope-deterministic; this case is the round-trip confirmation).
- **Expect-branch:** `suggest-follow-up` sees `reference_positions:[1]` → `output_exchange` REFERENCE-POSITIONS
  block emits an entity carrying `uuid:"406c76cb-…"`, `hint:"promotion"`, domain retained → re-query promotion
  by uuid → get-results (real read) attempts the PDF → guarded send.
- **Expect-output (structural):** the resolved entity for the pick carries `uuid === "406c76cb-…"`
  (from `last_result_set[0].uuid`, plan §2.1); the would-send message contains **NO UUID** shown to the user;
  no `escalation.preferred_assignee_id` set (a promotion pick is a re-query, NOT a CS assign).
- **Safety:** §0 all. **S2 focus** — no assignment/SLA/PIC/queue write (the pick must NOT reach the
  human-intervention sub). S4 get-results read tool only.
- **TBD contact needed?** No.

## §18. No-regression — product fuzzy did-you-mean unchanged  (contact `437264483`) — D1 code-mode
- **Trigger (E3):** `"cwc605-rl have stock?"` (real char diff → resolver returns `CWCX605-RL` candidate) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` `domain_hint:"inventory"`, product entity
  `raw:"cwc605-rl"`. Real `resolve-entity` read.
- **Expect-branch/output:** `build-suggest-offer` D1 **code-mode** — `suggest_quick_reply` picks are the
  product CODE(s) (e.g. `"CWCX605-RL,Yes escalate,No it's okay"`), `suggest_response` = "…Did you mean
  CWCX605-RL? Reply with a code to continue…". Byte-identical to pre-fix. No numbering, no uuid.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §19. No-regression — happy promo (resolver PINS) returns the PDF  (contact `437264483`)
- **Trigger (E4):** `"Sorento Dealer"` (or another token that PINS one promo) · `437264483` ·
  `scope: deterministic` · `mock_parser_output` `domain_hint:"promotion"`. Real `resolve-entity` read.
- **Expect-branch/output:** `resolve-entity` PINS → normal promotion happy path → the PDF attachment offer;
  `build-suggest-offer` sets `suggest_offer` **false** (no miss) → downstream byte-identical to before the fix.
  Assert `suggest_offer` unset/false and no numbered/did-you-mean render.
- **Safety:** §0 all. S8/media send path (if attachment) guarded (S1); S4 get-results read-only.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                        | Contact   | Scope         | Blocked by |
|------|-----------------------------------------------------------|-----------|---------------|------------|
| V0-a | offline: promotion D1 → human names, no UUID, numeric btns | (offline) | deterministic | — |
| V0-b | offline: product D1 code-mode byte-identical              | (offline) | deterministic | — |
| V0-c | offline: uuid-no-name candidate dropped → escalate-only   | (offline) | deterministic | — |
| V0-d | offline: D2 alternatives uuid guard                       | (offline) | deterministic | — |
| 16   | e2e: promotion did-you-mean, no UUID leak                 | 437264483 | deterministic | resolver miss-vs-pin (token-broaden, plan §5) |
| 17   | e2e: numeric pick resolves promotion by UUID (round-trip) | 437264483 | deterministic | §16 last_result_set seed |
| 18   | no-regression: product fuzzy did-you-mean (code-mode)     | 437264483 | deterministic | — |
| 19   | no-regression: happy promo PINS → PDF, no suggest_offer   | 437264483 | deterministic | — |

Cases V0/§16–§19 belong to change `fix-suggest-offer-uuid-label` (plan `../plans/fix-suggest-offer-uuid-label.md`).
Allowed-to-change golden nodes: `build-suggest-offer` + its downstream cascade (`compile-current-state`,
guarded send) ONLY on promotion-miss turns; product-miss and happy turns byte-identical. Primary correctness
gate is the offline V0 unit; §16–§19 are e2e confirmation. **Open items (plan §7):** respond.io button-vs-list
limit + over-length behavior UNVERIFIED (numbers safe under all interpretations); D2 uuid `value` risk is
data-dependent (V0-d is the synthetic backstop).

---

## §20. `output_exchange` clobber / casual-clear / team fix  (contact `437264483`) — plan `../plans/output-exchange-9-1-10-fix.md`

Scope: **parser** (change is INSIDE the reformulator sub, after the LLM; the deterministic
`mock-reformulator-output` branch bypasses `output_exchange` → real reformulator required). Run on the
fork (`CpxE8LroLzCkrAQN`) / clone (`txiPzSxy3Pclsz6v`) in `uac` mode. **Concrete edits:** #1 gate clobber
(L444–L446), #3 gate casual-clear (L439–L441) + shared engagement block, #4 stop domain bleed
(decision-tree — no-op if draft==active), #5 team = confirm-only (L462–L472 unchanged). **#2 closing
regex backstop is CONTINGENT** — do NOT apply unless the §20 gate-check below fails; prefer a prompt
nudge (out-of-scope, user-gated).

> ⚠️ **Draft≠active:** MCP reads draft `2428b0cd`; the SIM tested active `303a25ec`. Coder must diff
> draft-vs-active for `output_exchange` before editing (plan §0/§4a).

### §20-GATE. Gratitude classification check (run FIRST, after #1+#4)
- **Setup:** apply #1+#3+#4 only. Real reformulator on the fork.
- **T:** T1 `may know delivery for cust yoo living for today` → T2 `okay thankyou` (order prev-state);
  AND T1 `Hi, can send me agreement` → T2 `thank you` (forms prev-state).
- **Expect-output:** raw LLM `message_type=casual` (golden baseline) AND final `output_exchange`
  `message_type=casual`, `domain_hint=null`, **no human-intervention `would_write`**.
- **Decision:** casual + no would-assign → **#2 NOT needed, #9 done.** Still business_query / would-assign
  → **STOP, escalate for the prompt-nudge decision** (do not add the code regex unilaterally).
- **Safety:** §0 all. **S2 is the gate** — a would-assign here is the #9 bug (a plain closing assigning
  staff). Assert NONE of `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
  `Call 'sub-add-comment-respond'` executed; human-intervention only `{blocked:true, would_write}`.

### §20a. #9-R / #9-R2 — gratitude → casual (repro must clear)
- **T:** as §20-GATE T2s.
- **Expect:** #9-R `casual`, no would-assign; #9-R2 `casual`, forms NOT re-listed (get-results not reached).
- **Safety:** §0 all; **S2 focus** + S3 (save-session-vars blocked).

### §20b. #9-G1 / #9-G2 / #9-N — continuation + escalation + boundary (must NOT break)
- **T:** G1 `check stock srt86cr` → `and its ETA?`; G2 ZZZ999XX escalate offer → `yes`;
  N `thanks, can you also check SRT79-SS-GM stock`.
- **Expect:** G1 stays business (domain=incoming, `srt86cr` carried); G2 escalation FIRES to purchasing
  (`escalation.is_escalation_confirmation=true`, `_engagesOffer=true` protects it); N business
  (domain=inventory, `SRT79-SS-GM` current) — gratitude+request boundary.
- **Safety:** §0 all. G2: S2 — escalation `would_write` to purchasing is `blocked:true` (no real assign).

### §20c. #1-N + #1 pick-protect — casual-clear boundary
- **T:** N offer pending → T2 bare `hi`; pick-protect: mid-offer reply the LLM mislabels casual but
  carries a resolved position / member-name.
- **Expect:** N entities **cleared** (`_engagesOffer=false`); pick-protect resolved entities / member
  name **NOT wiped** (`_engagesOffer=true`, incl. `_pmNow`), member_offer block resolves.
- **Note:** the sim `#1-R` "retain srt104 GY" is **out of scope** (entity-op `replace` drop, not
  casual-clear) — tracked as known-open, NOT an acceptance gate.
- **Safety:** §0 all.

### §20d. #10-R / #10-G / #10-N — escalation team via inheritance (confirm unchanged)
- **T:** R T1 `check eta SRTWT7448` → T2 `Nobody reply me` (replyTo=incoming); G1 order-miss →
  `Nobody reply me`; G2 `I want to talk to a human` (no ctx); N reply-to on a delivered non-escalation
  answer.
- **Expect:** R `message_type=request_for_help`, `suggested_team=purchasing` **via `priorRouting`
  inheritance** (not `derived`, not replyTo — `_reqHelp` immune to clobber); G1 `customer_service`;
  G2 default CS, no crash; N casual, no forced team.
- **Safety:** §0 all. **S2 focus** — R/G human-intervention writes are `blocked:true`; assert team in the
  `would_write` payload, NOT a real assignment.

### §20e. Regression guard set (must be byte-identical / behavior-identical)
Member-offer name-pick, numbered pick (`reference_positions>0`), escalation yes/no, suggest-offer /
Δ4-merge flows, CS member retarget/decline markers, access-levels carry (L435–L437), date-filter gate
(L587), deriveRouting brand clamp (L28). See plan §5.
- **Safety:** §0 all across the set; S2 the invariant (no member-pick/retarget ever produces a real assign).

---

# Change: `incoming-axis-gate-and-partial-message` (Option B — axis matrix + partial not-found)

Plan: `../plans/plan.md` → "Change: incoming-axis-gate-and-partial-message" (§B0–B5).
**Scope: `deterministic`** (Code-node gate + response-formatting; parser NOT edited). **Driver = the chat
webpage** `zz-chat` (`oyYfVvZHRZpWubTy`) → dispatcher `2D0cw2Y1aPW2LOlU` → the FRESH clone `NEWID`
(fork of live `9qVyfUxmRQqrpGRMDLRuz`, guard layer re-applied per plan §B3). **Not** `execute_workflow`
+ redis-seed. All cases: contact **`437264483`** (FULL access). Every case bound by **§0**.

> **§0 binding under the chat-webpage driver.** The chat driver runs the **live reformulator**
> (`XTODTw`, gpt-5.4-mini) once per turn — expected, a driver cost, NOT a §0-S6 violation (treat S6 as
> "no consume-main `gpt-4.1-mini` parser LLM ran; reformulator is the driver's parser"). Egress evidence:
> the reply is read from redis **`chat:reply:{chat_id}`** (chat_id = the chat sessionId); assert **S1**
> = no `api.respond.io/.../message` POST executed and every sendmsg fork short-circuited on `is_test`/`chat?`;
> **S2** = `Call 'sub-human-intervention'` not reached (business queries, not escalation); **S3** =
> `save-session-vars`/`update-human-intervened` orphaned/blocked (guard-d/-c record if F4 layer present);
> **S4** = resolved `tool` (`crm_incoming_stock_list` for incoming, a stock read for inventory) in the
> READ allowlist, never `crm_it_support_ticket_create`; **S5** = every invoked sub received
> `is_test===true`.

> **Concrete-input sourcing.** Containers `WHSU5485370` (found, `inbound_shipment`, ETA `2026-07-18`) and
> `BMOU649395378` (not found) are **grounded from exec 8519391** — use verbatim. Product codes below are
> best-known real families; a live resolver can drift (a code that is "vague" today may gain/lose
> siblings). **Prerequisite P-B1:** the tester runs case §21.1 first, reads the picklist it returns, and
> uses **option #1's full code** as the "exact product" in §21.2/§21.4/§21.5 (guarantees a single exact
> match) and any two picklist codes as the two vague tokens in §21.3. Assertions are **structural**
> (branch + itemization), never exact ETA/stock text.

## §21. Incoming axis-gate + partial not-found

### §21.1 — ETA, 1 vague product (incoming, PRODUCT axis) → picklist
- **Chat input:** `ETA for SRTBF117`
- **Expect-branch:** parser hint `product` → **PRODUCT MODE** (unchanged). `disallowed-entity-gate`:
  multiple products, no single exact → `require_specific=true`, `gate_passed=false` → `If3[0]` →
  `If-incoming-picker` (domain incoming) → `probe-incoming` → `annotate-incoming-picker` →
  `build-suggest-offer`.
- **Expect-output:** ONE numbered picklist of the SRTBF117 candidates, each annotated `— has incoming` /
  `— no incoming` (incoming-picker availability). `not_found_axis_tokens` absent/empty.
- **Safety:** §0 all. S1 send blocked (reply via `chat:reply`). S2 n/a (not escalation). S4 tool =
  `crm_incoming_stock_list` (probe), read-only.

### §21.2 — ETA, 1 exact product → proceed, ETA
- **Chat input:** `ETA for <exact code = §21.1 picklist option 1>`
- **Expect-branch:** PRODUCT MODE; single exact → `gate_passed=true`, `require_specific=false` →
  `If3[1]` → get-rag → `Call 'sub-get-results'` (`crm_incoming_stock_list`) → validator → `If6[0]` →
  central-exchange → compile-current-state.
- **Expect-output:** ETA/incoming detail for that one product; no picklist; no not-found itemization.
- **Safety:** §0 all.

### §21.3 — ETA, 2 vague products → ONE consolidated picklist (all candidates numbered together)
- **Chat input:** `ETA for SRTBF117 and SRTWC85`  (two multi-match prefixes)
- **Expect-branch:** PRODUCT MODE, both tokens ambiguous → `require_specific=true`, `gate_passed=false`
  → `If-incoming-picker` path.
- **Expect-output (coordinator refinement):** a **single** numbered choose-list that flattens the
  candidates of **both** tokens into one continuous `1..N` list — **NOT** one picklist per token.
  Assert `gate_clarification` is one numbered block and `build-suggest-offer` emits one offer.
  (Availability annotation applies to all lines.)
- **Safety:** §0 all.

### §21.4 — ETA, 2 exact products → proceed both
- **Chat input:** `ETA for <exact A> and <exact B>` (two picklist option full codes)
- **Expect-branch:** PRODUCT MODE, both single-exact → `gate_passed=true`, `require_specific=false` →
  get-results with both product uuids (one batched read).
- **Expect-output:** incoming/ETA for both products; no picklist; no not-found itemization.
- **Safety:** §0 all.

### §21.5 — ETA, 1 found product + 1 not-found product → proceed found, report not-found
- **Chat input:** `ETA for <exact A> and Z9ZZNOTAREALCODE`
- **Expect-branch:** PRODUCT MODE; A resolves single-exact, `Z9ZZNOTAREALCODE` → unresolved. `If3`
  guard (`if3-unresolved-guard-narrowed`): unresolved tokens present BUT `compatible_entities`
  non-empty (A) → runs get-results on A (does NOT dead-end).
- **Expect-output:** incoming/ETA for A; **and** the not-found itemization names the missing token.
  (Product-axis not-found reuses the existing `not-found-itemize`/breakdown path; assert the missing
  code appears and A is not listed as missing.)
- **Safety:** §0 all.

### §21.6 — 2 containers, 1 found + 1 not, "Sorento warehouse" noise  (the exec-8519391 repro) ★
- **Chat input:** `check ETA for BMOU649395378 and WHSU5485370 to Sorento warehouse`
- **Expect-parser (structural, live reformulator):** `domain_hint=incoming`; entities include
  `WHSU5485370`+`BMOU649395378` hinted `inbound_shipment` and `Sorento warehouse` hinted `warehouse`;
  **zero product hints**. (If the live parser drifts to hint a product, note it — that would route
  PRODUCT MODE and is a parser regression, not this change.)
- **Expect-branch:** **IDENTIFIER MODE**. `disallowed-entity-gate`:
  `require_specific===false`, `gate_passed===true`, `compatible_entities` = exactly the one
  `inbound_shipment` (WHSU, uuid `9e038abe-8775-4539-b863-eded5af48297`),
  `not_found_axis_tokens===["BMOU649395378"]`. **No** product picklist; the 4 "Sorento" products / the
  transporter / customers are **absent** from `compatible_entities`. → `If3[1]` → get-results
  (`crm_incoming_stock_list`, shipment_ids=[WHSU uuid]) → validator → `If6[0]` → central-exchange →
  compile-current-state.
- **Expect-output:** `userResponse` contains WHSU's incoming/ETA (grounded ETA `2026-07-18`) **AND** an
  itemized `I couldn't find any incoming shipment matching: … BMOU649395378`. The word "Sorento" never
  appears as a picklist option or a not-found item. `last_result_set` contains only the WHSU shipment
  (no Sorento product noise).
- **Safety:** §0 all — **S1 focus** (must NOT relaunch the old product picklist send; reply via
  `chat:reply`). S4 tool `crm_incoming_stock_list`, read-only.

### §21.7 — stock, 2 products, 1 found + 1 not (inventory, PRODUCT axis) → proceed found, report not-found
- **Chat input:** `stock for <exact A> and Z9ZZNOTAREALCODE`
- **Expect-branch:** domain `inventory` (axis = product) → PRODUCT MODE. A resolves single-exact,
  `Z9ZZNOTAREALCODE` unresolved → `If3` runs get-results on A (stock read).
- **Expect-output:** stock for A; **and** not-found itemization names the missing token, A not listed as
  missing. (Confirms the product-axis partial path is domain-general, mirroring §21.5 for inventory.)
- **Safety:** §0 all.

### Coverage / notes (this change)
- **Gate rewrite** (`disallowed-entity-gate` `5928ae64`): §21.1–21.4 (PRODUCT MODE unregressed, incl.
  consolidated picklist §21.3), §21.6 (IDENTIFIER MODE — the fix).
- **Partial messaging** (`compile-current-state` `0804657c` new IIFE): §21.5 (product axis), §21.6
  (incoming identifier axis), §21.7 (inventory). The all-miss path (`not-found-error-message`) is
  covered by legacy §12 and is untouched.
- **Cheap pre-checks** before the chat runs: plan §B5 V-B1/V-B2 via `prepare_test_pin_data`→
  `test_workflow` (pin exec-8519391 JSON) — assert gate output with **zero LLM**.
- **Open risk:** the resolved-but-empty refinement (a token that resolves but yields no get-results row)
  is NOT asserted here — the primary `not_found_axis_tokens` source is shape-independent and covers all
  7 cases; add a case only if the coder implements the answer-shape refinement (plan §B2 open risk).

---

# Change: `console-persistence` (stateful chat-console lane — session + chat_histories to n8n_test)

Status: PLAN (planner deliverable). No workflow edited, no execution run. Plan:
`../plans/console-persistence-plan.md`.
Scope tag: **`deterministic`** (Postgres persistence + IF-gate branching; parser NOT touched). **Driver
caveat:** driven by the **chat webpage** (`zz-chat oyYfVvZHRZpWubTy` → `zz-dispatcher-test 2D0cw2Y1aPW2LOlU`
→ clone `txiPzSxy3Pclsz6v`), so the live reformulator `XTODTw-dJcV0uRdC056hG` (gpt-5.4-mini) runs once per
turn and CRM reads are real — multi-turn session evolution requires it (no mock path through the console).
Parser output asserted **structurally only**. Notation for this change: **Chat input** = the text typed
into the console (contact fixed `437264483`, `mode:'chat-stateful'`, `contact.chat_id=sessionId`).

> **Grounded premise correction (read `../plans/console-persistence-plan.md` §0–1):** the lane is
> **already largely built** — `build-item` emits `mode:'chat-stateful'`; `session-get-gate`/`session-save-gate`
> already redirect to `respond_contacts_test`; send fork `sub-sendmsg-CHAT ublq9nSlrpz63xan` already logs
> BOTH plain-text and quick_reply to `n8n_test.chat_histories` via `log-chat-history-n8ntest` (the
> `quickreply-not-logged` gap is closed for the console corpus, via a direct pg insert, NOT the LOGFIX
> fork). These cases therefore **verify** the built lane; they are not a spec for new nodes. The prod
> PUT `save-session-vars` is orphaned (0 inbound) in every mode.

## §22.0 — S-CRED credential gate  (MANDATORY, run FIRST; blocks all of §22)
- **Not an execution — a static REST check.** `GET {N8N_API_BASE}/workflows/ublq9nSlrpz63xan` and
  `…/txiPzSxy3Pclsz6v` (header `X-N8N-API-KEY`).
- **Expect:** the Postgres nodes **`log-chat-history-n8ntest`** (in fork `ublq9`), **`pg-get-session`**,
  **`pg-upsert-session`** (in the clone) each have `credentials.postgres.id == "Dnnofg8Xb27VQOhI"`
  (`n8n_test-db`).
- **Hard fail + HALT** if any is `ETJL5KoaA1UpkDip` (`sorento-crm-db`, PROD) or missing. Rationale:
  `chat_histories` exists in **both** n8n_test and prod CRM, so a mis-bound `log-chat-history-n8ntest`
  would **silently INSERT into prod** with no error (plan §5, LESSON 10). This is the only path by which
  this lane could breach §0 — verify it before touching a single case.

## §22.1 — Session persists + evolves across turns  (contact `437264483`) — PRIMARY
- **Pre:** reset session row — `respond_contacts_test.session_vars = '{"variables":{}}'` for
  `respond_io_id='437264483'` (psql / in-workflow cred `Dnnofg8Xb27VQOhI`). Do this ONCE, before turn-1
  only (never between turns of this sequence).
- **Turn-1 chat input:** a query that returns a numbered result set (e.g. a stock/product listing that
  yields ≥2 candidates or a did-you-mean set).
- **Turn-1 expect:** reply lands in `chat:reply`; **then** `pg-upsert-session` ran →
  `respond_contacts_test.session_vars.variables.last_result_set` is a **non-empty** array of `{idx,label,…}`
  for `respond_io_id='437264483'` (assert via psql).
- **Turn-2 chat input:** a reference to turn-1's set (numeric pick, e.g. `2`, or "the second one").
- **Turn-2 expect:** the reformulator (fed by `pg-get-session` reading the row turn-1 wrote) resolves the
  reference against the persisted set → reply is about that specific item, NOT a fresh no-context search.
  This is the multi-turn state that `uac` mode could never produce (LESSON 31). Assert **structurally**
  (reply references the picked entity; `last_result_set` in the row evolved), not exact text.
- **Safety:** §0 all + S-CRED. **S3 focus** — session write went to `respond_contacts_test` (pg-upsert),
  prod PUT `save-session-vars` did NOT execute (0 inbound).

## §22.2 — Plain-text reply logged to n8n_test  (contact `437264483`)
- **Chat input:** any query that yields a plain-text (non-buttoned) answer.
- **Expect-branch:** fork `ublq9` `chat?` TRUE → `chat-build-parts` (type=`text`) → `console-loggable?`
  (text non-empty) → `log-chat-history-n8ntest`.
- **Expect-output:** a NEW `n8n_test.chat_histories` row: `type='outgoing'`, `channel='whatsapp'`,
  `contact_id='437264483'`, `result.source='chat-console'`, `message` = the reply text (psql assert).
- **Safety:** §0 all + S-CRED. S1 — no respond.io send POST; reply only in `chat:reply`.

## §22.3 — Quick-reply (buttoned) reply logged to n8n_test  (contact `437264483`) — closes `quickreply-not-logged`
- **Chat input:** a turn that produces **buttons** — a did-you-mean / suggest-on-miss set, an escalation
  offer ("escalate to purchasing team?" Yes/No), an access prompt, or a member/CS picker. (Pick a trigger
  known to yield `compile-current-state.quick_reply` non-empty; e.g. a fuzzy/ambiguous product token for
  did-you-mean, or an unresolved-but-clear code for the escalate offer.)
- **Expect-branch:** `chat?` TRUE → `chat-build-parts` emits a `type:'quick_reply'` item →
  `console-loggable?` (quick_reply non-empty) → `log-chat-history-n8ntest`.
- **Expect-output:** a NEW `chat_histories` row whose `result` jsonb has a **non-empty `quick_reply`
  array** (the button labels) and `source='chat-console'` (psql assert). Confirms buttoned turns are
  represented in the corpus — the exact gap this change targets.
- **Safety:** §0 all + S-CRED. S1 — the fork's real quick_reply `HTTP Request` (respond.io) did NOT
  execute (it's on the `chat?`-FALSE branch); reply buttons delivered only via `chat:reply`.

## §22.4 — Incoming user turn logged  (contact `437264483`) — CONDITIONAL on Gap-C (plan §4 C1/C2)
- **Only run if incoming logging is built.** If the coder ships C3 (defer), mark N/A and note the corpus
  is reply-only.
- **Chat input:** any single turn.
- **Expect-output:** a NEW `chat_histories` row `type='incoming'` carrying the typed text, paired
  (earlier `sent_at`, same contact) with the outgoing reply row from §22.2/§22.3.
- **Safety:** §0 all + S-CRED; the incoming logger must also bind `Dnnofg8Xb27VQOhI` (extend S-CRED to it).

## §22.5 — Fail-safe: no chat_id ⇒ live behavior (regression guard, structural)
- **Not a console run — a structural assertion** (no execution needed; confirm from topology or a
  targeted `test_workflow`): with `contact.chat_id` ABSENT and `is_test:true`, fork `ublq9` routes
  `chat?` FALSE → `test-guard` TRUE → `test-guard-record` (egress log), reaching neither `Send a Message`
  nor `log-chat-history-n8ntest`. Proves the console additions are additive + fail-safe (absent chat_id =
  today's guarded behavior) and that the chat-branch log write cannot fire for a non-chat item.
- **Safety:** §0 all — this case exists to prove S1/S3 hold on the non-console path.

### Coverage / notes (this change)
- **S-CRED (§22.0)** is the gate for the whole change — the single zero-egress crux (plan §5).
- **Session R/W** (`session-get/save-gate` + `pg-get/upsert-session`, mode `chat-stateful`): §22.1.
- **chat_histories logging** (`log-chat-history-n8ntest`, both branches): §22.2 (plain), §22.3
  (quick_reply — the corpus gap), §22.4 (incoming, conditional).
- **Fail-safe / no-regression:** §22.5 (chat_id absent ⇒ guarded WhatsApp behavior, no chat-branch write).
- **Mode duality / promote design:** plan §3 matrix; **not** exercised by these cases (test side only).
  Live-promote gaps (session-save FALSE arm wired = Gap A; LOGFIX `uoO5eiJFXA8THrry` ported for live
  buttoned persistence = Gap B) are promote-time checks, not console UAC.
- **Contention (not a case, a rule):** the console writes session for `437264483` — the same
  `respond_contacts_test` row used by golden capture/replay of Jayson's corpus. Never run a golden
  capture/replay on `437264483` while using the console (LESSON 30/41). Open decision: give the console a
  distinct `respond_io_id` to isolate (plan §7.4).
- **Driver cost:** each case runs the live reformulator once/turn (deterministic scope, structural parser
  assertions) — no other LLM unless the turn legitimately hits the clarification `Basic LLM Chain`
  (gated on `validator.has_result=false`).

---

# Change: `parser-domain-continuity-carry` (domain continuity moves LLM prompt → downstream code)

Plan: `../plans/parser-domain-continuity-carry.md`. Two edits INSIDE the reformulator sub `XTODTw`:
**Edit 1** (`AI Agent.text`: DELETE the `Previous domain:` line + sanitize the domain-word leak in the
`Previous response:` line so the LLM classifies domain from THIS TURN ONLY) + **Edit 2**
(`output_exchange`: 2a enable the reuse-path domain-carry for entity-less continuations, 2b add a
`DOMAIN_BLOCKED_HINTS`-compatibility-gated domain-carry for entity-bearing continuations). **Change-level
scope: `parser`** — the change is INSIDE the reformulator, after the LLM; per plan §8 + LESSON 28 a
`mock_reformulator_output` injection bypasses `output_exchange`, so these cases MUST run the **real,
forked reformulator copy** `RFRMID` (fork of current live `XTODTw` + the edits, re-pointed from clone
`txiPzSxy3Pclsz6v`). Contact `437264483` (FULL access) for all. Every case bound by **§0**.

> **DRIVER (mandatory) + REPLAY CAVEAT.** These are MULTI-TURN continuity cases: turn N reads turn N-1's
> `previous_conversation_state.domain_hint` + `.response`. `uac` mode CANNOT round-trip session state
> (LESSON 31), and golden `regress-replay` PINS the golden LLM output → it is **BLIND** to this prompt +
> `output_exchange` change (would show a false all-green). So every case runs a driver that persists
> session to `respond_contacts_test` between turns AND runs the REAL reformulator: **`chat-stateful`
> console lane** (PRIMARY — `zz-chat oyYfVvZHRZpWubTy` → dispatcher `2D0cw2Y1aPW2LOlU` → clone →
> `RFRMID`; reply from redis `chat:reply:{chat_id}`) OR **`mode=regress-capture`** (session from
> `respond_contacts_test`, no reset mid-sequence). Reset the session row ONCE before turn-1 of each chain,
> NEVER between turns.
>
> **§0 binding under the real-reformulator driver.** S6 = "no consume-main `Basic LLM Chain` (gpt-4.1-mini)
> ran unless the turn legitimately hits clarification; the reformulator gpt-5.4-mini is the driver's
> parser". S1 = no `api.respond.io/.../message` POST (reply only via `chat:reply` / clone egress log);
> S2 = `Call 'sub-human-intervention'` not reached on business turns; S3 = `save-session-vars`
> orphaned/blocked (session persisted to `respond_contacts_test` via `pg-upsert-session`, NOT prod PUT);
> S4 = resolved `tool` in the READ allowlist, never `crm_it_support_ticket_create`; S5 = every invoked
> sub received `is_test===true`.
>
> **Assertion target:** the reformulator sub-execution `output_exchange` output —
> `output.output.domain_hint`, `output.output.entities` (+ diagnostics `domain_inherited_compatible`,
> `domain_inherit_blocked`, `broaden_dropped`). Inspect via `get_execution(includeData:true)` on the clone
> run (the reformulator runs as a sub-execution). Do NOT assert exact `user_goal`/reply text.

## §V0. Offline `output_exchange` carry unit  (0-token, no seed) — PRIMARY GATE (plan §C6 V-P0/V-P1)
Pin the AI Agent output (incl. `domain_signal`) + a synthetic `previous_conversation_state` into the
forked `output_exchange` (via `prepare_test_pin_data`→`test_workflow` or a standalone harness) and assert
the carry directly. **The carry keys on `domain_signal`, NOT on `domain_hint===null`.**

- **V0-a — reuse-path carry (Edit 2a):** `entity_op:'reuse'`, `domain_signal:'none'`, `domain_hint:null`,
  `message_type:'business_query'`, prev `domain_hint:'master_products'`. **Assert**
  `output.output.domain_hint === 'master_products'`, `domain_reused_entityless === true`; `message_type`
  NOT overwritten to prev.
- **V0-b ★ — inferred-non-null carry (the coordinator hole):** `entity_op:'replace_combine'`,
  `domain_signal:'inferred'`, **`domain_hint:'master_products'`** (the LLM's bare-code guess), one current
  entity `{hint:'product', current_message:true, raw:'SRTWC286-SH'}`, prev `domain_hint:'incoming'`.
  **Assert** the carry OVERRIDES → `domain_hint === 'incoming'`, `domain_inherited_compatible === true`,
  product entity survives blocklist-apply. **A null-only gate would FAIL this** (domain_hint was non-null).
- **V0-c — incompatible = NO carry (charmant guard, code layer):** `entity_op:'replace_combine'`,
  `domain_signal:'inferred'`, `domain_hint:'order'` (or null), one current entity
  `{hint:'customer', current_message:true, raw:'charmant hardware'}`, prev `domain_hint:'incoming'`.
  **Assert** `domain_hint` NOT set to `incoming`, `domain_inherit_blocked === 'incoming'`, and the
  **customer entity is STILL present** after blocklist-apply (NOT `broaden_dropped`).
- **V0-d — explicit wins (no carry):** `entity_op:'replace_combine'`, `domain_signal:'explicit'`,
  `domain_hint:'master_products'`, prev `domain_hint:'incoming'`. **Assert** `domain_hint === 'master_products'`
  (unchanged; no carry, `domain_inherited_*`/`domain_reused_*` diagnostics absent).
- **V0-e — prompt sanitize (Edit 1b):** the `Previous response:` expression on input
  `"Previous turn (incoming): returned 1 records"` → renders `"Previous turn: returned 1 records"`; on an
  escalation-offer / `central-exchange` response string → unchanged. (String test on the AI Agent input.)
- **Safety:** offline unit, no egress at all.

## §V0b. `domain_signal` LLM validation (real reformulator, plan §C6 V-P0b)
Across a sample of the mined chains + the A/B triggers, assert the LLM sets `output.output.domain_signal`
correctly per turn: **`explicit`** on decisive-term turns (eta, list price, delivery-for-customer, stock,
GRN, dimension, selling price), **`inferred`** on bare-code-no-purpose-word turns (a bare "SRTWC286-SH"),
**`none`** when `domain_hint` is null. A systematically wrong signal (e.g. a bare code marked `explicit`,
or a decisive "list price" marked `inferred`) defeats the carry — **FLAG loudly** (the whole fix depends
on this signal being right; a wrong signal is a prompt-1c regression, triaged not silently passed).
- **Safety:** §0 all (real reformulator on the clone, zero egress).

## §23. Domain-continuity — real reformulator, multi-turn

### §23-A. Continuity must NOT regress (carry)  (contact `437264483`)

#### §23-A1 — incoming bare-code carry ★ (the coordinator hole)
- **Chat inputs (2 turns):** T1 `eta for SRTWB7249` → T2 `SRTWC286-SH` (bare code, no purpose word).
- **Expect per-turn:** T1 `domain_hint:incoming`, `domain_signal:explicit`; **T2 `domain_hint:incoming`**
  even though the LLM likely emits `domain_hint:master_products, domain_signal:inferred` — signal
  `inferred` + product ∉ `DOMAIN_BLOCKED_HINTS.incoming` → Edit 2b OVERRIDES to incoming
  (`domain_inherited_compatible:true`).
- **HARD ASSERT:** T2 `output.output.domain_hint === 'incoming'` — it **MUST NOT be `master_products`**
  (that is the exact regression the coordinator refinement closes). T2 `entities` contains the
  SRTWC286-SH product entity (retained, not `broaden_dropped`); reply is an incoming/ETA answer, not a
  price/stock answer.
- **Safety:** §0 all. S4 tool `crm_incoming_stock_list` (read).

#### §23-A5 — explicit override closes the loop
- **Chat inputs (2 turns):** T1 `eta for SRTWB7249` (incoming) → T2 `list price of SRTWC286-SH`.
- **Expect per-turn:** T1 `incoming`, `domain_signal:explicit`; **T2 `master_products`,
  `domain_signal:explicit`** → NO carry (decisive "list price" wins); `domain_inherited_*` diagnostics
  ABSENT on T2. Pairs with §23-A1 to pin the signal both directions (inferred→carry vs explicit→override).
- **Expect-output:** T2 reply is a price answer for SRTWC286-SH.
- **Safety:** §0 all.

#### §23-A2 — order bare-code carry
- **Chat inputs:** T1 `any delivery for kean wah marketing` (domain `order`) → T2 `SMC202606-0001` (bare DO code).
- **Expect per-turn:** T1 `order`; **T2 `order`** (carry; order/customer_order compatible under order).
- **Expect-output:** T2 resolves/queries as an order, not a product stock lookup.
- **Safety:** §0 all.

#### §23-A3 — promotion + master_products bare follow-ups carry
- **Chat inputs (run as two independent 2-turn chains):**
  - (i) T1 `any promotion for sorento` (`promotion`) → T2 `sink mixer` (bare product-ish, promo context) → **T2 `promotion`** (carry unless a decisive non-promo term).
  - (ii) T1 `list price of srtwc286-sh` (`master_products`) → T2 `how much wc286-sh?` → **T2 `master_products`** (carry).
- **Expect-output:** each T2 stays in the T1 domain; entity retained.
- **Safety:** §0 all.

#### §23-A4 — reuse no-entity continuation ("and the price?")  — Edit 2a
- **Chat inputs:** T1 `info for SRTBF117` (`master_products`, resolves a product) → T2 `and the price?`
  (NO entity, `entity_op:'reuse'`).
- **Expect per-turn:** T1 `master_products`; **T2 `master_products`** via the reuse-path carry
  (Edit 2a) — `entity_op:'reuse'`, `entities` = prior SRTBF117, `domain_hint` inherited.
- **Expect-output:** T2 reply is the price of SRTBF117 (the reused prior entity), NOT a no-context miss.
  Assert `output.output.domain_hint==='master_products'` and `message_type` is business_query (not
  overwritten to prev unconditionally).
- **Safety:** §0 all.

### §23-B. Contamination fixed (switch / compatibility gate)  (contact `437264483`)

#### §23-B1 — CHARMANT REPRO (the bug, exec 8655477) ★  — plan §C6 V-P2
- **Chat inputs:** T1 `Check eta Srtwt9611 gm` → T2 `Any delivery for charmant hardware`.
- **Expect-parser T1 (structural):** `domain_hint:incoming`, product entity `Srtwt9611`.
- **Expect-parser T2 (THE FIX):** `output.output.domain_hint === 'order'` (NOT `incoming`); the
  `charmant hardware` entity present in `output.output.entities` with `hint:'customer'` and **NOT** listed
  in `broaden_dropped`; `domain_inherit_blocked === 'incoming'` MAY be set (if the LLM emitted null and the
  gate refused the carry) — either the LLM classified `order` directly OR the gate blocked the wrong carry;
  both are correct as long as domain is `order` and the customer entity survives.
- **Expect-output:** T2 reply is a customer-delivery/order answer for charmant hardware; it does **NOT**
  return the stale `SRTWT9611` incoming file (the pre-fix cascade). `last_result_set` is not the T1
  incoming result.
- **HARD FAIL:** T2 `domain_hint === 'incoming'`, OR the `charmant hardware` entity in `broaden_dropped`,
  OR the reply re-returns the SRTWT9611 incoming file.
- **Safety:** §0 all. S2 — not the escalation branch; no assign/SLA/PIC write.

#### §23-B2 — promotion → decisive price override survives
- **Chat inputs:** T1 `any promotion for sorento` (`promotion`) → T2 `list price of srtwc286-sh`
  (decisive "list price" + product).
- **Expect per-turn:** T1 `promotion`; **T2 `master_products`** (decisive current term wins; NOT carried
  as `promotion`). The product entity retained.
- **Expect-output:** T2 reply is a price answer, not a promotion listing.
- **Safety:** §0 all.

### §23-C. Scale — 18 real mined chains (plan §C7)  (contact `437264483`)

Run all 18 chains from plan §C7 via the real-reformulator driver. For each turn, record actual
`output.output.domain_hint`; compare to the plan's expected-domain column. **Triage rule:** "carry" rows
(C1, C4, C5, C6, C8, C12, C15, C16, C18) are FIRM — a domain not matching the prior turn is a REGRESSION.
"switch" rows (C2, C7, C9, C10, C11, C13, C14) are the LLM's this-turn call — the expected switch passes;
a switch to a THIRD unrelated domain, or a wrong-carry of the prior domain, is triaged (LESSON 39). C3 is
positional (existing carry path), C17 is first-turn no-prior (assert NO spurious carry: `domain_inherited_*`
diagnostics absent when prevState empty).

- **Per-chain assertions:** (a) expected per-turn domain met (or flip triaged); (b) on every "switch"
  turn the CURRENT entity is retained (not `broaden_dropped`); (c) on every "carry" turn the diagnostic
  `domain_inherited_compatible` OR the reuse/positional carry is the mechanism (not an LLM coincidence —
  inspect the mechanism, not just the value).
- **C14 ★** (reuse-path + decisive term): T2 "info for SRTBF11834" → T3 "can i get the technical drawing?"
  (entity-less) → expect `product_attachment` via reuse-path (Edit 2a) with the decisive "technical
  drawing" setting the domain and SRTBF11834 reused as the entity.
- **C18 † verify-during-build:** confirm `customer` ∉ `DOMAIN_BLOCKED_HINTS.order` (it is not, live L371)
  → customer-after-order carries `order`. Flag if the parser reads T2 as a fresh customer query.
- **Safety:** §0 all on every turn of every chain. Any real egress = hard fail, halt.

### §23-D. Off-continuity inertness (regression guard)  (contact `437264483`)  — plan §C6 V-P5
- **Setup:** 5-8 single-turn corpus queries with NO prior session (reset row before each).
- **Expect:** `domain_inherited_compatible` / `domain_inherit_blocked` ABSENT (no prior domain to carry);
  `domain_hint` unchanged vs a pre-change reformulator run of the same message. Proves the change is inert
  when there is no prior state (no spurious carry).
- **Safety:** §0 all.

### Coverage (this change)
| #    | Branch / assertion                                          | Contact   | Sub-scope | Driver | Blocked by |
|------|-------------------------------------------------------------|-----------|-----------|--------|------------|
| V0-a | offline: reuse-path carry (Edit 2a)                         | (offline) | parser    | test_workflow | — |
| V0-b | ★ offline: inferred-non-null carry OVERRIDES (Edit 2b)      | (offline) | parser    | test_workflow | — |
| V0-c | offline: incompatible = NO carry, customer entity survives  | (offline) | parser    | test_workflow | — |
| V0-d | offline: explicit domain wins (no carry)                    | (offline) | parser    | test_workflow | — |
| V0-e | offline: prompt sanitize strips `(domain)`                  | (offline) | parser    | string test | — |
| V0b  | `domain_signal` set correctly by LLM (explicit/inferred/none)| 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-A1| ★ incoming bare-code carry (must NOT become master_products)| 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-A2| order bare-code carry                                       | 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-A3| promotion + master_products bare follow-ups carry          | 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-A4| reuse no-entity "and the price?" carry (Edit 2a)           | 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-A5| explicit override: "list price of B" after "eta A" → master_products | 437264483 | parser | chat-stateful | RFRMID fork |
| 23-B1| CHARMANT REPRO → order, customer entity retained ★         | 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-B2| promotion → decisive price override survives                | 437264483 | parser    | chat-stateful | RFRMID fork |
| 23-C | 18 real mined chains, per-turn domain + flip triage        | 437264483 | parser    | chat-stateful/regress-capture | RFRMID fork |
| 23-D | off-continuity inertness (no spurious carry)               | 437264483 | parser    | regress-capture | RFRMID fork |

Cases §V0/§23 belong to change `parser-domain-continuity-carry` (plan `../plans/parser-domain-continuity-carry.md`).
Allowed-to-change golden nodes: the reformulator `AI Agent.text` + `output_exchange` (domain-carry logic
+ additive diagnostics `domain_inherited_compatible`/`domain_inherit_blocked`) ONLY. Cheapest gate first:
§V0 offline units before any e2e. **Do NOT validate via pinned `regress-replay`** — it is blind to this
change (plan §C4). The SPINE `compile-current-state` leak-at-source is a flagged SEPARATE future change,
NOT promoted here.

---

# Change: `query-forward-sibling-picker` (incoming empty-exact-miss → sibling-family picker + escalate)

Plan: `../plans/query-forward-sibling-picker-plan.md` (full design, §0–§10) + `../plans/plan.md` →
"Change: query-forward-sibling-picker". **Scope: `deterministic`** — Code + HTTP-read + executeWorkflow-read
on the spine; **parser NOT edited**; the pick/escalate reconciliation **reuses the existing** reformulator
fork node `suggest-follow-up` (no reformulator edit). Build/test target = the current clone
**`txiPzSxy3Pclsz6v`**; reformulator fork it calls = **`wI5RkNGW3EOJfBdo`**; get-results sub =
**`rysSPgUssLDf6xJc`**. Driver = the chat webpage (`zz-chat oyYfVvZHRZpWubTy` → dispatcher
`2D0cw2Y1aPW2LOlU` → `txiPzSxy3Pclsz6v`, `mode:'chat-stateful'`, `contact.chat_id=sessionId`). All cases:
contact **`437264483`** (FULL access). Every case bound by **§0**.

> **§0 binding under the chat-webpage driver** (same as §21/§22): the live-ish reformulator fork runs once
> per turn (a driver cost, NOT an S6 violation — treat S6 as "no consume-main `gpt-4.1-mini` parser LLM
> ran"). Reply read from redis **`chat:reply:{chat_id}`**. **S1** = no `api.respond.io/.../message` POST;
> every sendmsg fork short-circuited on `is_test`/`chat?`. **S2** = `Call 'sub-human-intervention'` reached
> ONLY on a user "yes" (§Q5), and then via the guarded fork `vUfFUDjLAuMaeQE6` recording `would_write`
> (no real assign/SLA/PIC). **S3** = `save-session-vars`/`update-human-intervened` orphaned/guarded
> (`guard-d`/`guard-c` record). **S4** = every resolved read tool in the READ allowlist — `family-fetch`
> is `GET /master-data/products` (read) and `sibling-probe`/get-results is `crm_incoming_stock_list`
> (read); **never** `crm_it_support_ticket_create`. **S5** = every invoked sub received `is_test===true`.

> **Concrete-input sourcing (prerequisite P-Q1).** Base code `cb88ss` and its family {CB88SS, CB88SS-DIY,
> CB88SS-BL-DIY, CB88SS-GM-DIY, CB88SS-H} are grounded from clone exec **8691536** but the resolver/catalog
> can drift. Before the e2e cases, the tester runs **V-Q1** (a direct read of
> `GET /api/v1/master-data/products?query=CB88SS&variant_filter=all&limit=5000`, x-api-key) and records the
> ACTUAL family + which siblings have incoming (via one `crm_incoming_stock_list` on all sibling uuids).
> Assertions below are **structural** (branch + itemization + sort + annotation-consistency), never exact
> ETA text. If `cb88ss` no longer has ≥2 family members with a has/no-incoming mix, substitute a live base
> code that does (found via V-Q1) and note it.

## §Q. Query-forward sibling picker

### §Q1 — single exact, no incoming → sibling picker + escalate  (the flagship) ★
- **Chat input:** `check eta cb88ss`
- **Expect-branch:** `disallowed-entity-gate` exact-match-wins → `require_specific===false`,
  `compatible_entities=[CB88SS]`, `gate_passed===true` → `If3[FALSE]` → get-rag → `Call 'sub-get-results'`
  (`crm_incoming_stock_list`) → `validator.has_result===false` → `If6[FALSE]` → Loop → Aggregate1 →
  `not-found-error-message` → **`sibling-gate[TRUE]`** (incoming + require_specific false + product in
  compatible) → `family-fetch` (uncapped read) → `sibling-transform` (strict-prefix family) →
  `sibling-probe` (batched `crm_incoming_stock_list` over ALL sibling uuids) → `build-suggest-offer` **D3**.
- **Expect-output:** `build-suggest-offer.suggest_offer===true`. `user_response` lists **every** sibling
  (≥5: CB88SS + the 4 variants), each annotated exactly `— has incoming` or `— no incoming` (the exact
  `CB88SS` appears, annotated — it has none: `CB88SS — no incoming`), **sorted has-incoming-first then code
  order, NO cap**, followed by the escalate line naming **purchasing** team. `selection_context==='suggest_offer'`;
  `variables.last_result_set` (would-be-persisted, read from the guarded `save-session-vars` input) = the
  full sibling list `[{idx,label,value,product,uuid,entity_type:'product'}]`; `quick_reply` = `Yes, escalate` +
  `No, it's okay` ONLY (no per-sibling number buttons). The bare pre-change escalate string
  ("no incoming matched these") must NOT be the whole reply.
- **Assert annotation consistency:** every line marked `— has incoming` corresponds to a sibling whose code
  is in the `sibling-probe` returned items; every `— no incoming` is absent from it (V-Q3).
- **Safety:** §0 all. S2 n/a (no escalation this turn). S4 both tools reads.

### §Q2 — multi-exact, both no incoming → BOTH families gathered  (union)
- **Chat input:** `eta cb88ss and <second exact base with a family, e.g. srt-family base from V-Q1>`
- **Expect-branch:** both tokens resolve single-exact (two products in `compatible_entities`), both empty →
  same not-found path → `sibling-gate[TRUE]` → `family-loop` fetches EACH base's family → union (deduped by
  uuid) → one `sibling-probe` over the union → D3.
- **Expect-output:** ONE combined picker containing siblings of **both** families, numbered `1..N`
  continuous, each annotated + sorted has-incoming-first then code order; single escalate line.
  `suggest_last_result_set` covers both families.
- **Phase-1 note:** if the coder ships the single-fetch variant first (plan §3), this case is
  **KNOWN-DEFERRED** — mark BLOCKED-on-loop, do not fail the change; §Q1 still gates.
- **Safety:** §0 all.

### §Q3 — a sibling HAS incoming → annotation + sort correct
- **Chat input:** `check eta cb88ss` (same as §Q1; this asserts the has-incoming case explicitly)
- **Precondition:** V-Q1 confirmed ≥1 sibling in the family HAS incoming. (If none do, force this via the
  substitute base code from P-Q1 that has a mixed family.)
- **Expect-output:** every has-incoming sibling is annotated `— has incoming` AND appears **before** all
  `— no incoming` siblings (has-incoming-first); within each group, code ascending. The has-incoming
  sibling(s) are exactly the codes present in `sibling-probe` items.
- **Safety:** §0 all.

### §Q4 — reply "2" → re-query incoming for that sibling  (continuation)
- **Setup:** run §Q1 first (chat-stateful persists `selection_context:suggest_offer` +
  `last_result_set` + `domain_hint:incoming`). Then, same session:
- **Chat input (turn 2):** `2`
- **Expect (reformulator fork, structural):** `previous_conversation_state.selection_context==='suggest_offer'`
  → `output_exchange` maps `reference_positions:[2]` → position 2's `product` code as a current_message
  entity → `suggest-follow-up` inherits `domain_hint:'incoming'` (`domain_inherited_for_suggest` true),
  `message_type='business_query'`, `suggest_pick_context:true`.
- **Expect-branch:** the picked sibling code re-resolves exact → get-results `crm_incoming_stock_list` runs
  for **that** sibling. Output = its incoming detail (if it has incoming) OR — if that sibling also has no
  incoming — recursively the sibling picker again / plain escalate (acceptable; assert no crash, domain
  stayed incoming, no CS assign).
- **Safety:** §0 all. S2 — NO assignment (this is a data re-query, not an escalate). Assert
  `Call 'sub-human-intervention'` did NOT execute.

### §Q5 — reply "yes" → escalate to purchasing  (continuation)
- **Setup:** run §Q1 first. Same session.
- **Chat input (turn 2):** `yes`
- **Expect (reformulator fork):** `is_affirmative===true` under `selection_context:suggest_offer` →
  `suggest-follow-up` sets `escalation.is_escalation_confirmation:true`, `entities:[]`.
- **Expect-branch:** escalation confirmation → guarded human-intervention fork `vUfFUDjLAuMaeQE6`; team =
  purchasing (from `routing.suggested_team`).
- **Safety:** §0 all — **S2 focus**: the human-intervention sub short-circuited on `is_test` BEFORE
  `get-round-robin-assignee`; egress log shows `{guard:"human-intervention-sub", would_write, blocked:true}`;
  NO real `Assign or unassign`, NO SLA POST, NO PIC comment, NO assignee-queue push.

### §Q6 — zero siblings → plain escalate unchanged  (regression / fallback)
- **Chat input:** `check eta <an exact incoming code whose family = only itself, no incoming>` (a code with
  no `-variant` siblings; find one via V-Q1 returning a single-member family).
- **Expect-branch:** `sibling-gate` may enter the fetch path, but `sibling-transform` yields only the exact
  code (no extras) → **D3 returns false** → `build-suggest-offer.suggest_offer===false` → escalate-catalog
  plain escalate.
- **Expect-output:** the bare pre-change escalate message ("…escalate to purchasing team?"), byte-identical
  to today. No picker, no annotation.
- **Safety:** §0 all.

### §Q7 — non-incoming / require_specific / D1 / D2 unregressed  (regression guard)
- **§Q7a — order not-found (domain ≠ incoming):** `sibling-gate[FALSE]` (domain not incoming) →
  `build-suggest-offer` unchanged (D1/D2/plain escalate byte-identical). Chat: an order code with no
  results.
- **§Q7b — ambiguous incoming (require_specific true):** `ETA for SRTBF117` (multi-match prefix, no single
  exact) → `If3[TRUE] → If-incoming-picker[TRUE] → probe-incoming → annotate-incoming-picker →
  build-suggest-offer` — the EXISTING ambiguous availability picker, **unchanged** (sibling-gate not on this
  path). Assert the annotated numbered picklist renders as before.
- **§Q7c — D1 did-you-mean (unresolved incoming token):** an incoming token that does NOT resolve exactly
  (fuzzy candidates) → D1 fires as today; sibling-gate does not (no exact product in compatible). Assert D1
  output unchanged.
- **Safety:** §0 all.

### Coverage / notes (this change)
- **Business diff the reviewer promotes:** 5 new nodes (`sibling-gate` IF, `family-loop` splitInBatches
  [phase-1 optional], `family-fetch` httpRequest-READ, `sibling-transform` Code, `sibling-probe`
  executeWorkflow-READ) + `build-suggest-offer` (`7972abd8`) D3 edit + the not-found-path connection
  surgery. **No** parser/reformulator/`compile-current-state`/`escalate-catalog`/`disallowed-entity-gate`
  edit.
- **Cheapest checks first (plan §9):** V-Q1 (direct family read) + V-Q3 (batched probe) before any e2e chat.
- **CRUX:** the uncapped family is a NEW CRM **read** (`GET /master-data/products?query=<base>&variant_filter=all&limit=5000`,
  x-api-key) filtered strict-prefix in n8n — NOT the capped `resolutions[].matches` (resolver
  `PREFIX_LIMIT=20`), NOT an MCP tool (none exposes prefix/family). Reconciliation reuses the shipped
  `suggest-follow-up` (no reformulator edit).
- **Open items flagged in the plan:** (a) multi-product `family-loop` may be phase-2 (§Q2 deferred then);
  (b) a user typing a DEEP variant exact (`cb88ss-diy`) may under-gather the family (safe degradation —
  plan §2 open limitation); (c) V-Q1 confirms the products-list response shape (`id`+`product_code`).

---

# Change: `dym-candidate-map` (did-you-mean pick RETAINS prior customer + date)

Plan: `../plans/dym-candidate-map-plan.md`. Scope tag **`parser`** (reconciliation in fork `output_exchange`
= mock-blind; build/store hunks are deterministic spine Code, unit-testable offline). Multi-turn ⇒
`chat-stateful` (or `regress-capture`) driver + real reformulator; **replay is blind to the
`output_exchange` edit — do NOT use pinned replay for the CONSUME cases.** Every case bound by §0.
Bug: live `XTODTw` exec 8666864.

## §V-DYM0. Offline units  (0-token, no seed) — PRIMARY GATE (plan §8 V-DYM0)

Pin node `$()` sources via `prepare_test_pin_data`→`test_workflow` (or a standalone harness) and assert
directly. No LLM, no egress.

**Build side — `build-suggest-offer` (`7972abd8`, clone):** feed synthetic `resolve-entity` +
reformulator `q` (parser output):
- **V-DYM0-a — D1 code-mode map:** ambiguous token `Srtwc286` → matches `[SRTWC286-SH, SRTWC286-SH-PP,
  SRTWC286-SH-NEW-150]` (non-exact). **Assert** `out.suggest_offer===true` AND
  `out.dym_candidates` = 3 entries, each `{code:<one of the SH codes>, for_raw:'Srtwc286',
  for_hint:'product'}` (map keyed on `code`, not label).
- **V-DYM0-b — D1 fuzzy/typo map (non-prefix):** token `cwc2816` → resolver match `CWCX2816`. **Assert**
  `out.dym_candidates` contains `{code:'CWCX2816', for_raw:'cwc2816', for_hint:'product'}` — proves the
  linkage is captured from the resolver grouping, NOT derived by prefix.
- **V-DYM0-c — D2 alternatives map:** queried `askedCode` empty + `alternatives:[…]`. **Assert**
  `out.dym_candidates[].for_raw === askedCode` for each alternative code.
- **V-DYM0-d — non-suggestion return path:** no D1/D2/D3 fires. **Assert** `out.dym_candidates` is unset
  (→ Edit B writes `[]`).

**Consume side — `output_exchange` (`847a1173`, fork):** feed synthetic `previous_conversation_state` +
pinned LLM `output.output`:
- **V-DYM0-e ★ — flagship reconciliation:** prev `entities:[{customer 'I bath studio', canonical '300-I057'},
  {product 'Srtwc286', canonical 'SRTWC286-SH'}]`, `date_filter_start:'2026-07-13'`,
  `date_filter_end:'2026-07-15'`, `domain_hint:'order'`, `selection_context:'member_offer'`,
  `dym_candidates:[{code:'SRTWC286-SH', for_raw:'Srtwc286', for_hint:'product'}, …]`;
  `latest_user_message:'SRTWC286-SH'`; LLM `entities:[{SRTWC286-SH, hint:'order', current_message:true}]`,
  `entity_op:'replace_combine'`, **`scope_exclusive:true`**, no date. **Assert** `output.output.entities`
  contains BOTH the customer (300-I057) AND SRTWC286-SH (in-place replace of the source product),
  `scope_exclusive===false`, `date_filter_start==='2026-07-13'` & `date_filter_end==='2026-07-15'`,
  `domain_hint==='order'`, `dym_pick_applied===true`.
- **V-DYM0-f — fuzzy pick:** same shape, prev entity `{product 'cwc2816'}` +
  `dym_candidates:[{code:'CWCX2816', for_raw:'cwc2816'}]`, `latest_user_message:'CWCX2816'`. **Assert** the
  `cwc2816` prior entity is replaced by `CWCX2816`, no reliance on string/prefix match.
- **V-DYM0-g — single-token (no other prior):** prev `entities:[{product 'Srtwc286'}]` only. **Assert**
  `output.output.entities===[{SRTWC286-SH…}]`, resolves with no regression.
- **V-DYM0-h — code NOT in map (fallback):** `latest_user_message:'SRTUFV101'` not in `dym_candidates`.
  **Assert** `dym_pick_applied` absent; entities/`scope_exclusive` untouched (today's behaviour).
- **V-DYM0-i — no dym_candidates in prev (inertness):** prev has none. **Assert** `output_exchange`
  byte-behaviour-identical (`dym_pick_applied` absent).
- **Safety:** offline unit, zero egress.

## §24. Did-you-mean pick — real reformulator, multi-turn  (contact `437264483`)

Driver: `chat-stateful` (reset the `respond_contacts_test` row ONCE before T1 of each chain; NEVER between
turns). Real reformulator (fork `wI5RkNGW3EOJfBdo`). All zero-egress (§0 S1-S6).

### §24a — flagship repro: pick RETAINS customer + date  ★ (exec 8666864)
- **Chat inputs (2 turns):** T1 `I bath studio Srtwc286 delivery 13/07/26 to 15/07/2026` →
  T2 `SRTWC286-SH`.
- **Expect branch:** T1 order query → not-found → `build-suggest-offer` D1 did-you-mean, merged with CS
  member roster → `selection_context=member_offer`, `variables.dym_candidates` = the 3 SH codes persisted.
  T2 → `output_exchange` dym reconciliation (`dym_pick_applied`), member block skipped (Edit D).
- **HARD ASSERT (T2):** `output.output.entities` contains BOTH the customer (I bath studio / 300-I057)
  AND the product SRTWC286-SH; `scope_exclusive===false`; `date_filter_start==='2026-07-13'` &
  `date_filter_end==='2026-07-15'` (carried, survives the order date-gate); get-results scoped by
  customer + code + the 13-15/07 window. The customer + date **MUST NOT** be dropped (the exact regression).
- **Safety:** §0 all — reply via `chat:reply`; no send/assign/SLA/PIC/session-PUT; every sub `is_test`.

### §24b — fuzzy/typo pick (non-prefix suggestion)
- **Chat inputs (2 turns):** T1 a query whose product token resolves fuzzily (e.g. `check stock cwc2816`
  where the resolver suggests `cwcx2816`) → T2 `CWCX2816` (or tap the suggested code).
- **Expect:** T1 did-you-mean stores `dym_candidates:[{code:'CWCX2816', for_raw:'cwc2816'}]`. T2 resolves
  the `cwc2816` source entity to `CWCX2816` via the explicit map.
- **HARD ASSERT:** T2 resolves `CWCX2816`, `dym_pick_applied===true`, and the pick worked WITHOUT any
  prefix/substring relationship between `cwc2816` and `cwcx2816` (the map's `for_raw` did the linkage).
  If the resolver does not actually emit `cwcx2816` for `cwc2816`, substitute any real non-prefix fuzzy
  pair mined from the corpus — the assertion is "non-prefix pick resolves via the map".
- **Safety:** §0 all.

### §24c — precedence on the merged member_offer turn
Three sub-cases on the §24a merged T1 (each a fresh T2):
- **§24c-1 — NUMBER reply `2`** → member pick (member block `_pos`, `dym_pick_applied` false):
  `escalation.preferred_assignee_id` = roster idx-2 uuid; NOT a did-you-mean pick.
- **§24c-2 — bare `yes`** → round-robin escalate (member block `is_affirmative`):
  `escalation.is_escalation_confirmation===true`, no `dym_pick_applied`.
- **§24c-3 — dym CODE `SRTWC286-SH`** → did-you-mean pick (as §24a); member block skipped.
- **HARD ASSERT:** the three replies route to three distinct paths; no path broken.
- **Safety:** §0 all — the "yes" escalate uses the guarded human-intervention fork `vUfFUDjLAuMaeQE6`
  (records `would_write`, NO real assign — S2).

### §24d — code NOT in map → fresh query (fallback / regression)
- **Chat inputs:** T1 as §24a → T2 a code NOT among the offered candidates (e.g. `SRTUFV101`).
- **HARD ASSERT:** `dym_pick_applied` absent; T2 is processed as today (fresh query — no forced retain).
- **Safety:** §0 all.

### §24e — map cleared after consumption (persistence / no-linger)
- **Chat inputs:** T1 did-you-mean (stores map) → T2 the pick (consumes) → T3 an unrelated new query.
- **HARD ASSERT:** after T2, the persisted `variables.dym_candidates` is written `[]` (inspect
  `compile-current-state` output / the orphaned `save-session-vars` input, LESSON 42); T3 sees no stale
  `dym_candidates` in `previous_conversation_state` and does not spuriously reconcile.
- **Safety:** §0 all.

### §24f — single-token did-you-mean (no other prior entity) — regression guard
- **Chat inputs:** T1 an ambiguous product query with NO customer/date (e.g. `Srtwc286`) → T2 `SRTWC286-SH`.
- **HARD ASSERT:** T2 resolves SRTWC286-SH with nothing extra to retain; no error; result identical to the
  pre-change resolve-the-code behaviour (the retain logic is a no-op when there is only the source entity).
- **Safety:** §0 all.

### §24g — suggest-offer round-trip unregressed  (regression guard)
- Re-run UAC §17 (numeric promotion pick round-trip) and a non-merged D1 code pick (`selection_context=
  suggest_offer`, via `suggest-follow-up`): the pick still inherits domain + `business_query`.
- **HARD ASSERT:** §16/§17 behaviour + §15 member-pick behaviour unchanged; `dym_candidates` addition does
  not alter the existing suggest-offer / member-offer paths.
- **Safety:** §0 all.

### Coverage / notes (this change)
- Scope `parser` (fork `output_exchange` mock-blind). Build/store hunks deterministic (§V-DYM0 offline).
- Nodes: **`build-suggest-offer` (`7972abd8`)** + **`compile-current-state` (`7a130a0c`)** on clone
  `txiPzSxy3Pclsz6v`; **`output_exchange` (`847a1173`)** + member-block guard on fork `wI5RkNGW3EOJfBdo`.
- `dym_candidates` stored in `variables` (round-trips whole as `previous_conversation_state`, no whitelist),
  cleared by always writing `[]` when no offer.
- Distinct from [[backlog-post-resolve-entity-reconciliation]] (carried wrong-hint pollution) and
  [[parser-domain-continuity-carry]] (domain carry). Prereq: `chat-stateful` driver (session round-trip).

---

# Change: `dym-multitoken` (did-you-mean itemizes ALL missed tokens, not just the first)

Plan: `../plans/dym-multitoken-plan.md`. **Scope tag `deterministic`** — the only edited node is the
spine Code node `build-suggest-offer` (`7972abd8`, shared clone↔live); inputs are pinnable so the
primary gate is a 0-token offline unit. No parser prompt edit; `compile-current-state` and fork
`output_exchange` are **unchanged** (consumption is length-agnostic; the pick round-trip is pre-existing
machinery). Build/test on CLONE `txiPzSxy3Pclsz6v`; NEVER live spine `9qVyfUxmRQqrpGRMDLRuz`.
Every case bound by §0.

**Bug:** D1's loop `for (const res of missResolutions){ … if (cands.length){ d1={…}; break; } }`
**break**s on the FIRST missed token with candidates → on a multi-token miss only that token gets a
"did you mean"; the rest are silently dropped. `missResolutions` already holds every genuine-miss token
with its OWN per-token candidates.

## §MT0. Offline `build-suggest-offer` unit  (0-token, no seed) — PRIMARY GATE (plan §6 V-MT0)

Pin `$()` sources via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`, reformulator `q`
(`Call 'sub-query-reformulator'.output`), `disallowed-entity-gate`. No LLM, no egress.

**Fixture (all 3 tokens unresolved, each with its OWN alternatives; domain = stock/inventory; every
token hint=product; all candidates non-exact `match_tier`, `entity_type:'product'`, non-uuid
`canonical_code`, `uuid` present):**

| token (`res.token` / parser `raw`) | candidate codes (resolver rank order) | cap3 kept |
|---|---|---|
| `C21263XUW-P-ENG` | C2181XUW-P-ENG(0.55), C21131XUW-P-ENG, C21132XUW-P-ENG, BRC21263XUW-P-MY, C21133XW-P-ENG | C2181XUW-P-ENG, C21131XUW-P-ENG, C21132XUW-P-ENG |
| `Bravat C01014UW-P-ENG` | BRCX01014UW-P-ENG | BRCX01014UW-P-ENG |
| `Sorento SRTWCY8605-RL` | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL |

Gate fixture: `require_specific:false`, `gate_debug.allowed_lookup` includes `product`,
`gate_debug.domain:'inventory'`, `compatible_entities:[]`. Input item `is_clarification:false`. Parser
`q.routing.suggested_team` omitted → `team` defaults to `customer_service`.

### §MT-1 ★ — multi-token numbered multi-block (the fix)  — PRIMARY
- **HARD ASSERT (all must hold):**
  1. `out.suggest_offer===true`, `out.suggest_selection_context==='suggest_offer'`.
  2. `out.suggest_response` has **3 per-token blocks**, each with its own token label
     (`"C21263XUW-P-ENG"`, `"Bravat C01014UW-P-ENG"`, `"Sorento SRTWCY8605-RL"`) and its own candidate
     lines. Begins `Couldn't find some items:`; ends
     `Reply a number to pick, or 'yes' to escalate to customer_service.`
  3. **Global numbering contiguous 1..7** (cap3 + 1 + cap3 = 3+1+3): block A = 1,2,3; block B = 4;
     block C = 5,6,7.
  4. `out.suggest_last_result_set` **length 7**, `idx` 1..7 contiguous, `value`/`product` = the
     candidate codes in order (row1=`C2181XUW-P-ENG` … row7=`SRTWC8605-SC-RL`), each `entity_type:'product'`.
  5. `out.dym_offer.candidates` **length 7**, each `for_raw` == its source token — rows 1-3
     `for_raw:'C21263XUW-P-ENG'`, row 4 `for_raw:'Bravat C01014UW-P-ENG'`, rows 5-7
     `for_raw:'Sorento SRTWCY8605-RL'`; each `code` = its candidate code; `for_hint:'product'`.
     `out.dym_offer` = `{id:<exec id>, domain:'inventory', ttl:3, candidates:[7], picked:[]}`.
  6. `out.suggest_quick_reply` = exactly two comma-stripped buttons — the string
     `Yes escalate,No it's okay`. **No number buttons** (numbers are typed).
- **Safety:** §0 all — offline unit, zero egress; egress log empty.

### §MT-R ★ — single-token miss BYTE-IDENTICAL to today  — HARD REGRESSION GATE
- Reduce the §MT0 fixture to **token A only** (`C21263XUW-P-ENG` + its 5 alts).
- **HARD ASSERT:** output is **byte-identical** between (i) the current live `build-suggest-offer`
  jsCode and (ii) the changed clone node — i.e. code-mode message
  `Couldn't find "C21263XUW-P-ENG". Did you mean C2181XUW-P-ENG, C21131XUW-P-ENG, or C21132XUW-P-ENG? Reply with a code to continue, or would you like me to escalate to customer_service team?`,
  `suggest_quick_reply` = the 3 codes + `Yes escalate` + `No it's okay`, `suggest_last_result_set`
  length 3 (label=value=code), `dym_candidates` length 3 all `for_raw:'C21263XUW-P-ENG'`. Method: run
  the same pinned fixture against both jsCodes and diff.
- **Safety:** §0 all — offline unit, zero egress.

### §MT-cap — >5 missed tokens capped at 5 blocks
- Fixture: **6** missed product tokens, each with ≥1 candidate.
- **HARD ASSERT:** exactly **5** per-token blocks rendered; `suggest_last_result_set` length ≤ 15;
  idx contiguous 1..N with no gap.
- **Safety:** §0 all — offline unit.

### §MT-drop — token whose candidates all drop is SKIPPED (contiguous idx preserved)
- Fixture: §MT0 but the MIDDLE token (`Bravat C01014UW-P-ENG`)'s only candidate is a **bare uuid with
  no display name** (→ `humanLabel` returns null, dropped).
- **HARD ASSERT:** the middle token's block is **omitted**; only 2 blocks render (A then C); idx stays
  contiguous with NO gap (block A = 1,2,3; block C = 4,5,6); `dym_offer.candidates` length 6, none with
  `for_raw:'Bravat C01014UW-P-ENG'`.
- **Safety:** §0 all — offline unit.

### §MT-roundtrip — pick round-trip E2E (regression, best-effort, real reformulator)
`output_exchange` is **not edited** by this change, so this is a regression guard, not the gate.
Driver: `chat-stateful` (reset `respond_contacts_test` ONCE before T1). T1 = the §MT0 stock query.
- **§MT-roundtrip-num — NUMBER reply.** T2a = `5`. **ASSERT** T2 resolves via the fork positional path
  (`reference_positions=[5]` → `last_result_set[idx=5]` → entity `canonical_code='SRTWCY8605'`),
  domain `inventory`, get-results scoped to that code.
- **§MT-roundtrip-code — CODE reply (per-token `for_raw`).** T2b (fresh T2) = `SRTWC8605-SC-RL` (a
  candidate of the LAST token). **ASSERT** `tryDymPick` fires (`dym_pick_applied===true`), and the
  entity replaced is the one for `for_raw:'Sorento SRTWCY8605-RL'` — proving each candidate's own
  `for_raw` maps a code to the CORRECT source token (not token A's).
- **If** the real resolver/gate cannot be made to emit `require_specific:false` for a 3-product
  all-miss, **skip and record as UNVERIFIED** — §MT0 + §MT-R remain the gates. Change scope stays
  `deterministic` (output_exchange unedited).
- **Safety:** §0 all — reply via `chat:reply`; no send/assign/SLA/PIC/session-PUT; every sub `is_test`.

### Coverage / notes (this change)
- Scope `deterministic`. **Single-node** business diff: `build-suggest-offer` (`7972abd8`) only.
  `compile-current-state` (`0804657c` live / `7a130a0c` clone) reads the D1 output length-agnostically
  (`suggest_last_result_set`, `dym_offer`, `dym_candidates` mirror) — no edit. Fork `output_exchange`
  (`847a1173`) pick round-trip is pre-existing machinery — no edit.
- Round-trip: NUMBER → positional (`last_result_set[idx]`); CODE → `tryDymPick` by `code` then `for_raw`.
  Both confirmed against the unedited fork. Per-token `for_raw` is what makes a code pick replace the
  right token; the number path replaces wholesale (fine when no prior customer/date, as in the stock miss).
- Only `d1s.length > 1` triggers the numbered multi-block; `===1` reuses the existing single-token
  block verbatim (§MT-R gate). `dym-single-use` lifecycle (ttl/picked in compile-current-state) unchanged.
- Promotion: 1-node, user-gated, backup-first, byte-SHA gated (LESSONS §57/§58).

---

# Change: `dym-partial-success` (surface missed tokens on the ANSWERED happy path)

> ⛔ **HALTED / SUPERSEDED 2026-07-31** by `# Change: dym-partial-disambiguation` (§PD below). §PS-safety
> FAILED: a bare number already resolves a stock row today (`output_exchange` byIdx block is NOT gated by
> `selection_context`), so overwriting `last_result_set` destroys the live stock positional-pick affordance.
> §PS-1/§PS-zerocand functional logic was correct but is MOOT under the HALT — the pick wiring changes.
> The §PS cases below are retained for history; **do not run §PS as a promote gate.** Run **§PD** instead.

Plan: `../plans/dym-partial-success-plan.md` (**HALTED**). **Scope tag `deterministic`** — the only edited node is the
spine Code node `compile-current-state` (live `0804657c` / clone `7a130a0c`). All its `$()` inputs
(`resolve-entity`, `disallowed-entity-gate`, `central-exchange`, reformulator `q`, `get-session-vars`)
are pinnable → primary gate is a 0-token offline unit. No parser prompt edit; `build-suggest-offer`
(`7972abd8`) and fork `output_exchange` (`847a1173`) are **NOT edited** (we REUSE build-suggest-offer's
D1 detection logic; the pick round-trip is pre-existing machinery). Build/test on CLONE `txiPzSxy3Pclsz6v`;
NEVER live spine `9qVyfUxmRQqrpGRMDLRuz`. Every case bound by §0.

**Problem:** a multi-entity query where SOME tokens resolve and SOME miss (e.g.
`SRTW808 @3 SRTW809 @2 SRTWT902 @5 check stock`): `SRTWT902` resolves → gate `compatible_entities≥1` →
`If3` PROCEEDS → happy stock answer; `SRTW808`/`SRTW809` misses **VANISH** (build-suggest-offer never runs
on the happy path, and the dym lifecycle KILLS any offer on an answered turn — clone `7a130a0c` line 248
rule 5). Fix: on the answered happy path, surface the misses numbered under the stock answer and arm a
pick context by repurposing `last_result_set`.

**Verified read-only this cycle:** (A) `resolve-entity` keeps per-token `resolutions[]` + `alternatives`
for the unresolved tokens in a partial resolve — CONFIRMED at CRM source `entity_resolver.py` 3523-3544
(per-token independent; trigram alternatives on empty-match tokens). (B) `output_exchange` (`847a1173`)
positional path keys `byIdx` on `last_result_set[i].idx` and treats `selection_context==='suggest_offer'`
as a pick-context (lines 371, 399-435); code path `tryDymPick` matches `code` then `for_raw` (158-218).
(C) `user_response` (customer) = `central-exchange.response`, distinct from `variables.response`
(compressed parser view) — append to `user_response`.

## §PS0. Offline `compile-current-state` unit  (0-token, no seed) — PRIMARY GATE (plan §6 V-PS0)

Pin `$()` sources via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`,
`disallowed-entity-gate`, `central-exchange`, reformulator `q` (`Call 'sub-query-reformulator'.output`),
`get-session-vars`. No LLM, no egress.

**Fixture (partial-miss stock query — 1 resolved product + 2 unresolved tokens each with own
`alternatives`; domain=inventory; all hints product; all candidates non-exact `match_tier`,
`entity_type:'product'`, non-uuid `canonical_code`, `uuid` present):**

| token (`res.token` / parser `raw`) | resolver state | candidate codes (rank order) | cap3 kept |
|---|---|---|---|
| `SRTWT902` | `resolved:true`, 1 exact match → **excluded from misses** (this is the ANSWER) | — | — |
| `SRTW808` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8081-P(0.58), SRTW8082-P, SRTW8083-P | all 3 |
| `SRTW809` | `resolved:false`, `matches:[]`, `alternatives:[…]` | SRTW8091-P | SRTW8091-P |

Gate: `compatible_entities` contains resolved `SRTWT902`, `require_specific:false`,
`gate_debug.allowed_lookup` includes `product`, `gate_debug.domain:'inventory'`.
`central-exchange.response` = the SRTWT902 stock text; `central-exchange.items` = ≥1 SRTWT902 stock item.
`q.message_type='business_query'`, `q.domain_hint='inventory'`, `q.entities` include raw
`SRTW808`/`SRTW809`/`SRTWT902`. `get-session-vars.variables` empty. `$execution.id` = `<exec>`.

### §PS-1 ★ — partial-miss numbered append + armed pick context (the fix)  — PRIMARY
- **HARD ASSERT (all must hold):**
  1. `user_response` = the SRTWT902 stock answer (prefix UNCHANGED), FOLLOWED BY a blank line and a
     `Couldn't find these:` block: `"SRTW808" — did you mean:` (lines `1. …`,`2. …`,`3. …`) then
     `"SRTW809" — did you mean:` (line `4. …`), footer `Reply a number to check it, or ask again.`
  2. **Global numbering contiguous 1..4** (cap3 + 1): SRTW808 = 1,2,3; SRTW809 = 4.
  3. `variables.last_result_set` **length 4**, `idx` 1..4 contiguous, `value`/`product` = candidate codes
     in order (row1=`SRTW8081-P` … row4=`SRTW8091-P`), each `entity_type:'product'`.
     `variables.selection_context === 'suggest_offer'`.
  4. `variables.dym_offer.candidates` **length 4**, each `for_raw` == its source token — rows 1-3
     `for_raw:'SRTW808'`, row 4 `for_raw:'SRTW809'`; each `code`=its candidate code; `for_hint:'product'`.
     `variables.dym_offer` = `{id:'<exec>', domain:'inventory', ttl:3, candidates:[4], picked:[]}` — the
     offer **SURVIVED** the `_answered` kill. `variables.dym_candidates` mirrors those 4.
  5. `quick_reply` **unset/null** (numbers typed → no buttons).
  6. `variables.response` (compressed parser view) = the SAME `Previous turn (inventory): returned N …`
     as today (unchanged); miss text lives ONLY in `user_response`.
- **Safety:** §0 all — offline unit, zero egress; egress log empty.

### §PS-R ★ — no-miss happy path BYTE-IDENTICAL to today  — HARD REGRESSION GATE
- Reduce the §PS0 fixture to **`SRTWT902` alone** (all tokens resolve; no misses).
- **HARD ASSERT:** output **byte-identical** between (i) current live `compile-current-state` jsCode and
  (ii) the changed clone node — NO appended text, `variables.last_result_set` = the stock rows exactly as
  today, `variables.selection_context` null, `variables.dym_offer` lifecycle unchanged (rule 5 kills a
  carried offer on the answered turn). Method: run the same pinned fixture against both jsCodes and diff.
- **Safety:** §0 all — offline unit, zero egress.

### §PS-zerocand — missed token with NO candidates → plain line, picker NOT armed
- Fixture: §PS0 but ONE missed token (`ZZZQ999`) with **empty `matches` AND empty `alternatives`**
  (SRTWT902 still resolves + answers).
- **HARD ASSERT:** `user_response` gains a plain `"ZZZQ999"` line under `Couldn't find these:` with the
  **no-number-invite footer** (`Ask again with the correct code.`); `variables.last_result_set`
  UNCHANGED (the SRTWT902 stock rows); `variables.selection_context` null; `variables.dym_offer` follows
  today's answered-turn rule (no armed offer). Proves the `M===0` branch never arms an empty picker.
- **Safety:** §0 all — offline unit.

### §PS-safety ★ — plain-stock `last_result_set` is NOT pickable today (the repurpose is safe)  — CRITICAL, on UNEDITED node
- Prove, on the **UNEDITED** `compile-current-state` + fork `output_exchange`, that a plain/partial stock
  turn does not arm a positional pick today, so overwriting `last_result_set` on the partial path
  displaces nothing pickable.
- Method: pinned `output_exchange` unit with `prevState.selection_context=null`,
  `prevState.last_result_set=[stock rows idx 1..N]`, no `referenced_result_set`, reply message `"2"`.
- **HARD ASSERT:** `output.output.entities` are NOT the stock row at idx 2 (`_pickCtx` false → no
  auto-`reference_positions`; the byIdx block does not resolve a bare number without a pick context).
  **If a bare number DOES resolve a stock row today → HALT**; the design must add a guard before promote.
- **Safety:** §0 all — offline unit, zero egress.

### §PS-roundtrip — pick round-trip E2E (regression, best-effort, real reformulator)
`output_exchange` is **not edited**, so this is a regression guard, not the gate. Driver: `chat-stateful`
(reset `respond_contacts_test` ONCE before T1). T1 = the §PS0 partial-miss stock query.
- **§PS-roundtrip-num — NUMBER reply.** T2a = `1`. **ASSERT** T2 resolves via the fork positional path
  (`reference_positions=[1]` → `last_result_set[idx=1]` → entity `canonical_code='SRTW8081-P'`),
  domain `inventory`, get-results scoped to that code.
- **§PS-roundtrip-code — CODE reply (per-token `for_raw`).** T2b (fresh T2) = `SRTW8091-P` (the LAST
  token's candidate). **ASSERT** `tryDymPick` fires (`dym_pick_applied===true`); the entity replaced is
  the one for `for_raw:'SRTW809'`, and the resolved `SRTWT902` entity is RETAINED — proving per-token
  `for_raw` maps a code to the CORRECT missed token (not SRTW808's) without dropping the answered entity.
- **If** the real resolver/gate cannot produce a partial resolve (some resolve, some miss) with `If3`
  proceeding and `require_specific:false`, **skip and record as UNVERIFIED** — §PS0 + §PS-R + §PS-safety
  remain the gates. Change scope stays `deterministic` (output_exchange unedited).
- **Safety:** §0 all — reply via `chat:reply`; no send/assign/SLA/PIC/session-PUT; every sub `is_test`.

### Coverage / notes (this change)
| aspect | case |
|---|---|
| partial miss surfaced + numbered + armed | §PS-1 (PRIMARY) |
| no-miss happy path unchanged | §PS-R (HARD regression) |
| zero-candidate miss → plain line, no arm | §PS-zerocand |
| repurpose displaces nothing pickable | §PS-safety (CRITICAL, unedited node) |
| number + code round-trip | §PS-roundtrip (best-effort, real reformulator) |

- Scope `deterministic`. **Single-node** business diff: `compile-current-state` only (live `0804657c`).
  `build-suggest-offer` (`7972abd8`), fork `output_exchange` (`847a1173`), `If3`, `get-results`,
  `central-exchange`, the parser are **untouched**.
- REUSE (not edit) build-suggest-offer's D1 detection: `missResolutions` (excludes the resolved token),
  `tokenCandidates` (per-token own `matches`+`alternatives`, no cross-borrow), `humanLabel`/`isUuid`
  (never leak a uuid), cap3 per token, cap surfaced tokens at 5.
- The `last_result_set` repurpose + `selection_context='suggest_offer'` + `dym_offer` arming happen ONLY
  when `M ≥ 1` numbered candidates; `M===0` appends plain lines only and touches neither. No-miss path is
  a pure no-op → byte-identical (§PS-R). Offer survives via the `_newOffer` slot (lifecycle rule 1 beats
  rule 5); ttl/picked lifecycle otherwise unchanged.
- Ordering (coder): insert AFTER the disclaimer IIFE (so it reads the original stock `last_result_set`)
  and into the `_newOffer` computation; change `const selection_context` → `let`.
- Promotion: 1-node, user-gated, backup-first, byte-SHA gated, target by NAME, built live + own hunks
  (LESSONS §57/§58).

---

# Change: `dym-partial-disambiguation` v3 (two coexisting pick-sets; bare number → dym) — scope `parser`, **touches LIVE parser**

Plan: `../plans/dym-partial-disambiguation-plan.md` (**v3 — supersedes v2 clarify/ambiguous**). **Supersedes
§PS (HALTED).** **Scope tag `parser`** — the disambiguation lives in the reformulator sub `sub-semantic-parser`:
the AI-Agent PROMPT gains a `reference_target` classifier and the sub's `output_exchange` (`847a1173`) gains a
numbered-dym handler that LOOPS all picks. Per LESSON 28 a change INSIDE the reformulator is invisible to
`mock_reformulator_output` → the classifier is proven with the REAL reformulator (token-bearing). One spine
Code node (`compile-current-state` `0804657c`) also changes. Build/test on CLONE `txiPzSxy3Pclsz6v` + the
parser fork it calls `wI5RkNGW3EOJfBdo`; NEVER the live spine `9qVyfUxmRQqrpGRMDLRuz` or live parser
`XTODTw-dJcV0uRdC056hG` during build. Every case §0.

> ⚠️ **v2 (clarify / `ambiguous` / `[results numbered]`) is SUPERSEDED-by-user-feedback (2026-08-01).** User
> tested v2: partial-miss stock + reply `1, 4` hit the AMBIGUOUS→CLARIFY prompt and rejected it — bare numbers
> should route to dym directly, multi-select must resolve BOTH, and the prompt must not overfit. **The former
> §PD-ambiguous and §PD-followup cases are REMOVED.** Do NOT run them as a promote gate.

**Model (v3):** on a partial-miss answered turn (ALL domains — R3) TWO addressable sets coexist — RESULT
(`last_result_set`, KEPT unchanged so a qualified stock pick survives) and DYM (new `dym_last_result_set` +
`dym_offer.candidates`), the dym set numbered LOCAL idx `1..M` (no `N+1` offset). The parser emits
`reference_target: result|dym|null` (NO `ambiguous`): a **BARE number — one OR MORE** ("2", "1, 4", "1 and 4")
→ `dym`; a suggestion phrase ("suggestion 2") → `dym`; a **result-qualified phrase** ("product 2", "the 2nd
one", "price of the first") → `result`; no dym marker active → `null` → byte-identical to today.
`output_exchange` LOOPS every `reference_positions` entry (multi-select), each pick replacing its own `for_raw`
token. `compile-current-state` appends the dym-active marker **exactly** `[M did-you-mean suggestions active]`
(SINGLE bracket — **no `[results numbered]` in v3**) to `variables.response`, the ONLY parser-visible
prior-state channel (§0.1 of the plan).

**Accepted trade-off (recorded, not re-litigated):** bare number now routes to dym, so a stock-row drill-down
requires a qualified phrase ("product 2"/"the 2nd one"). The two-set model + unchanged byIdx preserve the
qualified stock pick; `last_result_set` is never overwritten (v1 HALT stays resolved).

**Verified read-only this cycle:** live `XTODTw` prompt + `output_exchange` are byte-identical to the clone
fork `wI5RkNGW3EOJfBdo`. `output_exchange` byIdx block (lines 399-446) is gated ONLY by
`!is_menu_label && reference_positions.length>0` — NOT `selection_context` (this is why the HALTED overwrite
was unsafe). Parser POSITIONAL rule (prompt 339-349) keys on "returned N records". Parser input template
injects ONLY `previous_conversation_state.response` + current message.

## §PD0. Offline `compile-current-state` unit (0-token, no seed) — spine-Code gate (plan V-PD-compile)

Pin `compile-current-state` `$()` inputs via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`,
`disallowed-entity-gate`, `central-exchange`, reformulator `q`, `get-session-vars`, per the plan §9
partial-miss fixture (`SRTWT902` resolved + `SRTW808`/`SRTW809` missed w/ alts). No LLM, no egress. Assert the
plan §9 acceptance points 1-6 on the CHANGED clone `compile-current-state` (in particular §9.5: `variables.response`
carries the SINGLE bracket `[M did-you-mean suggestions active]` and NO `[results numbered]`), and run the
current LIVE jsCode on the same input as a negative control (marker/`dym_last_result_set`/survival asserts go
RED on live).

### §PD-compile-R ★ — no-miss happy path BYTE-IDENTICAL — HARD REGRESSION GATE
- Reduce §PD0 fixture to `SRTWT902` alone. Assert changed `compile-current-state` output **byte-identical**
  to current LIVE: no `response` marker, `last_result_set` = stock rows, `selection_context` null, no
  `dym_last_result_set`, `dym_offer` lifecycle unchanged (rule 5 kills a carried offer on the answered turn).
- **Fail-on-purpose:** the byte-diff must be non-empty when run against the §PD0 (miss) fixture — proves the
  comparison is a real instrument, not a tautology.

### §PD-dym ★ — bare number → DYM candidate, ALL domains (real reformulator) — PRIMARY, `parser`
- Driver `chat-stateful` (reset `respond_contacts_test` ONCE before T1). T1 = plan §9 partial-miss **inventory**
  query; marker = `[M did-you-mean suggestions active]` (SINGLE bracket — v3 has NO `[results numbered]`).
  Real reformulator + resolver, egress structurally blocked (full clone, all subs `is_test:true`).
- **T2 = `"2"`** (fresh T2) → **ASSERT** parser `reference_positions=[2]` AND `reference_target="dym"`;
  `output_exchange` numbered-dym handler fires → resolves `dym_last_result_set[2]` → in-place replace via
  `for_raw` (`dym_pick_applied=true`, `dym_offer_pick_code` set); result `last_result_set` untouched; resolved
  `SRTWT902` entity RETAINED; `reference_positions` cleared so the byIdx block no-ops.
- **LESSON-39 scoring:** resolves to DYM candidate #2 = PASS; safe new-query abandon = PASS; resolves to a
  result row = soft FAIL, RECORD. Run ≥3×; a systematic wrong outcome blocks promote (R-v3-3).
- **Safety:** §0 all; S6 parser tier (only the reformulator LLM runs); S8 — fork carries `memoryPostgresChat`,
  isolated `is_test:false` fork runs BARRED, so test via full clone only.

### §PD-dym-multi ★ — MULTI-SELECT bare numbers → BOTH DYM candidates (real reformulator) — PRIMARY, `parser` — **NEW v3**
- Same T1 as §PD-dym (partial-miss with ≥2 missed tokens: `SRTW808`→dym rows 1-3, `SRTW809`→dym row 4).
- **T2 = `"1, 4"`** (and variant **`"1 and 4"`**, fresh T2 each) → **ASSERT** parser
  `reference_positions=[1,4]` AND `reference_target="dym"`; `output_exchange` **LOOPS** both positions →
  resolves `dym_last_result_set[1]` (for_raw `SRTW808`) AND `dym_last_result_set[4]` (for_raw `SRTW809`), so
  **BOTH** source tokens are replaced (replacements ACCUMULATE, not clobber — assert both candidate codes
  present in `entities`); `dym_pick_applied=true`; result `last_result_set` untouched; resolved `SRTWT902`
  entity RETAINED; `reference_positions` cleared. get-results returns stock for both picks (or #3's
  `No stock records found for:` note if a pick is empty).
- **LESSON-39 scoring:** resolves BOTH correct dym picks = PASS; safe new-query abandon = PASS; drops one pick
  OR resolves the wrong set = soft FAIL, RECORD. Run ≥3× each phrasing; a systematic drop/mis-route blocks
  promote (R-v3-3).
- **Same-token multi-pick edge (R-v3-1, flagged for user decision):** if run with `"1, 2"` (two candidates for
  the SAME missed token) the expected behavior depends on the R-v3-1 decision (accumulate-both vs last-wins per
  `for_raw`). Record the observed behavior; do NOT hard-fail until R-v3-1 is decided.
- **Safety:** §0 all; S6 parser tier; S8 full clone only.

### §PD-result ★ — result-qualified phrase → STOCK row (real reformulator) — PRIMARY, `parser`
- Same T1. **T2 = `"the 2nd one"`** (and variants **`"product 2"`**, **`"price of the first stock"`**, fresh
  T2 each) → **ASSERT** `reference_target="result"`; numbered-dym handler SKIPPED; the STOCK row resolves via
  the UNCHANGED byIdx over `last_result_set`; no dym pick applied.
- LESSON-39 scoring: resolves the correct STOCK row = PASS; safe abandon = PASS; resolves a DYM candidate
  (wrong set) = soft FAIL, RECORD. Run ≥3×.
- **Safety:** §0 all.

### §PD-classifier-ratio — bare-number↔result-phrase, both directions (real reformulator) — `parser`
- Sweep the §PD-dym / §PD-dym-multi / §PD-result phrasings and **report a pass RATIO** per direction:
  bare-number→dym (incl. multi `"1, 4"`/`"1 and 4"`) and result-phrase→result. A systematic wrong-default
  (e.g. bare number routing to result, or a multi drop) is a promote blocker (R-v3-3/R-v3-5).

### §PD-fullmiss ★ — full-miss dead-end (change #1) numbered pick STILL resolves (real reformulator) — REGRESSION
- T1 = a pure full-miss query (all tokens miss → change-#1 dead-end offer: `last_result_set` = dym suggest
  set, `selection_context='suggest_offer'`, NO `dym_last_result_set`). **T2 = `"1"`** → **ASSERT** the pick
  resolves against `last_result_set` (dym) via the UNCHANGED byIdx path (numbered-dym handler skipped
  because `dym_last_result_set` is absent) — byte-identical to change-#1 behavior today.
- **Safety:** §0 all.

### §PD-noref-R ★ — no-dym normal turn byte-identical + replay `norm()` rule — REGRESSION
- Normal stock turn, NO miss. **T2 bare number** → parser `reference_target=null` → byIdx over stock
  `last_result_set` resolves the stock row (today's affordance intact). Assert `output_exchange` output for
  a no-dym turn is byte-identical to today apart from the new `reference_target:null` key.
- Register the LESSON-40 replay `norm()` rule: drop `reference_target` when null on both sides; retain when
  non-null. Show a sample of golden turns does NOT diff on it.
- **Safety:** §0 all.

### §PD-promote — LIVE promote gate (not a case — the protocol)
- **Order (LESSON 51, separate publishes):** parser sub `XTODTw` FIRST (prompt + `output_exchange`, one
  publish), THEN spine `9qVyfUxmRQqrpGRMDLRuz` (`compile-current-state`). Parser-first keeps every
  intermediate state safe (spine writing an unread field = inert; parser reading an unwritten field →
  `reference_target=null` → today's behavior).
- Built as **live + own hunks** (LESSON 57 — the fork carries an extra orphaned `Postgres Chat Memory`
  node; never block-copy it), target by node **NAME** (LESSON 58c), byte-SHA gate both sides of each
  publish, backup-first, user-gated, live-write permission is USER-added (LESSON 58a — not self-grantable).
- Post-promote verify on a REAL partial-miss turn (LESSON 56 — the SPECIFIC paths, BOTH directions): `"2"` and
  `"1, 4"` route to dym (both picks resolve), `"the 2nd one"`/`"product 2"` route to stock.

### Coverage / notes (this change)
| aspect | case |
|---|---|
| result `last_result_set` KEPT; dym in a separate slot (idx 1..M local, R3); SINGLE-bracket marker in `response` | §PD0 (+ live negative control) |
| no-miss happy path byte-identical | §PD-compile-R (HARD, spine Code) |
| bare number → DYM, all domains | §PD-dym (PRIMARY, real reformulator) |
| MULTI-SELECT "1, 4"/"1 and 4" → BOTH dym picks | §PD-dym-multi (PRIMARY, real reformulator) — **NEW v3** |
| result-qualified phrase ("product 2"/"the 2nd one") → RESULT | §PD-result (PRIMARY, real reformulator) |
| classifier reliability ratio, both directions | §PD-classifier-ratio (real reformulator) |
| full-miss dead-end pick still works | §PD-fullmiss (regression) |
| no-dym turn byte-identical + replay rule | §PD-noref-R (regression, LESSON 40) |
| live promote protocol | §PD-promote (parser sub first, then spine) |
| ~~NUMBERED result + bare number → CLARIFY~~ | **REMOVED v3 (§PD-ambiguous / §PD-followup deleted — user rejected clarify)** |

- **Three business-diff nodes across two workflows** (plan §5): spine `compile-current-state` (`0804657c`,
  Code); parser sub `XTODTw` AI-Agent `systemMessage` (PROMPT) + `output_exchange` (`847a1173`, Code).
- **Decisions status (plan §7, v3):** **R1 clarify — REMOVED** (`reference_target` enum simplified to
  `result|dym|null`; no `ambiguous`). **R2 — CLOSED** (marker back to the single bracket
  `[M did-you-mean suggestions active]`; `[results numbered]` deleted; no wording sign-off outstanding).
  **R3 LOCKED** — dym idx LOCAL `1..M`, no offset, ALL domains. **R-v3-1 (NEW, OPEN)** — same-token multi-pick
  (`"1, 2"` both alts of one token): accumulate-both (recommended) vs last-wins per `for_raw` — **the one open
  pre-coding decision**. R-v3-2 bare-number-loses-stock-pick trade-off ACCEPTED. R-v3-3/-4/-5 (classifier
  reliability, replay `norm()`, live-parser blast radius) are process acknowledgements.

---

# Change: `turn-id-threading-completion` (escalation-path turn_id — cycle 2 of obs-latency-contract)

**scope: `deterministic`** — no parser, no get-results change. Every clone case injects
`mock_reformulator_output`; zero parser tokens.

Full spec: `plans/turn-id-threading-completion.md` (**REV 2**, user decisions folded in). Cases are
enumerated there as **§OBS-8 … §OBS-17** with triggers, expected paths, structural output assertions
and per-case §0 bindings; that document is the executable source and is not duplicated here.

**Why:** C1–C4 shipped, but post-promote verification found `turn_id: null` on outgoing escalation rows.
Cycle 1 enumerated the *spine's* sendmsg callers only. The true census is **15 sendmsg callers** (not 9)
and **4 save-sub callers**; `sub-human-intervention` (`rrYXzE61gCNUck_zmXe-G`) calls sendmsg three times
and passes no `turn_id`. Escalations are the slow turns, so excluding them biases p99 **optimistic**.

**Census: CLOSED and EXHAUSTIVE, 66/66 workflows** (rev 2). The nine previously-unreadable workflows
were re-scanned after `availableInMCP` was enabled; none contains any `executeWorkflow` node, so none
can be a caller. The "57 of 66" caveat is retired. Counts are final at 15 / 4.

**Acceptance (two co-equal criteria):**
1. an **escalation** turn produces one incoming row and one outgoing row sharing a single non-null
   `turn_id` equal to the **spine** execution id;
2. a **rate-limited** turn produces one incoming row and one outgoing row sharing a single non-null
   `turn_id` equal to the **ingress workflow's** execution id — on `sorento-main` **and** on
   `sorento-main-INJECT`.

**Rev-2 reclassification (user decisions).** `sorento-main` (#14) and `sorento-main-INJECT` (#15) are
**TURN-BOUND**, not proactive. Today a rate-limited turn produces **zero rows in either direction**:
the incoming is dropped before `Redis2` so no spine execution and no incoming row exists, and the
outgoing save crashes on the unguarded `contact.phone` deref. The customer receives the notice; neither
message is in the log. Hop 3 mints `turn_id` locally as the ingress workflow's own `$execution.id` and
logs both rows. **`sorento-main-INJECT` is currently carrying 100 % of production ingress** (55/55
sampled `sorento-main` executions drop at `in-failover?`), so it is promoted **first**.

**Binding:** every case is bound by §0 S1–S6 + S7 (**as replaced by the H1 sink-delta + payload
attribution gate — S7 as written must not be used**) + S8 (**as amended above: structural absence of
credentialed send nodes, not pinning**), plus the S3 extension.

**Case index**
| case | proves | mode |
|---|---|---|
| §OBS-8 | turn_id reaches `sub-human-intervention` | clone, guard-closed, zero-egress |
| §OBS-9 | HI forwards it to sendmsg (≠ HI's own exec id, ≠ sendmsg's) — PRIMARY | sub-level, guard-open, H2 stand-ins |
| §OBS-10 | out-of-hours caller `c5dd9961` threads | sub-level |
| §OBS-11 | working-hours caller `0ca5413f` threads | sub-level |
| §OBS-12 | **ACCEPTANCE** — incoming/outgoing pair on one turn_id | clone, end-to-end |
| §OBS-13 | proactive callers (#12, #13 only) still emit JSON `null` (negative) | sub-level |
| §OBS-14 | H4 — contactless caller yields a complete row, not a crash | sub-level, conditional on H4 bundling |
| **§OBS-15** | **ACCEPTANCE 2** — rate-limit turn logs both rows on one turn_id | `sorento-main TEST`, `Redis1` pinned to 31 |
| **§OBS-16** | INJECT twin identical — failover traffic gets the same semantics | `sorento-main-INJECT TEST`, injected-shape fixture |
| **§OBS-17** | H6 — #12 writes no row; multi-part loop-back control | sub-level, **conditional on H6, not recommended** |

**Deliberately turn_id-free (proactive, excluded from the SLA denominator by design):**
`respond-close-convo` (#13) and `schedule-working-day-detection` (#12) **only**. Null `turn_id` means
*deliberately outside the denominator*, never *unknown* — a contract point the CRM side must confirm.
`sorento-main` / `sorento-main-INJECT` were removed from this set in rev 2.

**Hunks, separately rejectable:**
- **H4** (guard `contact?.` in both sendmsg save blobs) — recommended, and **no longer a prerequisite
  for anything**: Hop 3 passes a real `contact` from `$('If1')`, so #14/#15 leave the contactless set.
  Rejecting H4 breaks neither hop; it leaves #5/#6 producing no outgoing row.
- **H6** (#12 not logged at all, user decision 2) — **specified but NOT recommended.** It needs a new
  `skip_log` input plus two IF nodes on the live shared sendmsg sub, including a rewire of the
  **loop-back edge** whose failure mode is silent truncation of multi-part messages. It buys nothing
  that `turn_id: null` does not already buy, and it creates the mirror image of the transcript hole
  decision 3 exists to close. See plan §2.2.

**Prerequisites (blocking):** H1 must land in §0 before the first run; H2 stand-ins must exist before
any `is_test:false` run; **ingress clones of `sorento-main` and `sorento-main-INJECT` must be built and
contained (plan §7.7) before §OBS-15/16** — in particular `Redis2` must be structurally unable to push
to the prod queue `main-message-list`; the **`sorento-main` draft divergence** (`in-failover?`
`typeValidation` draft `strict` vs active `loose`) must be reverted to `loose` in a separate
zero-functional-change publish before the feature publish (plan §7.6).

---

# Change: `chat-console-replyto-parity` — plan `../plans/chat-console-replyto-parity-plan.md`

Two deltas, two scope tags. **§25 = delta A** (zz-chat quote-reply parity, scope **`deterministic`**,
touches NO live workflow). **§26 = delta B** (delete the `reply to:` concatenation, scope **`parser`**,
**touches LIVE** — clone first, promote user-gated). **§DC = the two canaries owed by the live
`tryDymPick` prior-domain deletion**, scope **`parser`**, currently **VOID** pending §DC-0.

Notation for §25: **Chat input** = text typed into `zz-chat oyYfVvZHRZpWubTy` (contact fixed `437264483`,
`mode:'chat-stateful'`, `contact.chat_id = sessionId`). Quote turns use `/replyid <message_id> <text>`
(deterministic) or `/reply <n> <text>` (handle from the transcript). Every case is bound by **§0 S1–S8**;
a §0 failure is a hard fail regardless of functional correctness.

> **Grounded premise corrections (measured live 2026-07-31 — do not re-derive):**
> (a) `tf-message` output = the respond.io **body**, so consumers read `json.message.replyTo`; the console's
> `build-item` puts `replyTo` at `item.message.replyTo`, one level too shallow → **undefined today**
> (clone exec `10626106` vs live exec `10590713`). A patch that merely fills the existing `replyTo:{}` is a
> silent no-op. (b) `log-chat-history-n8ntest` writes `message_id` as the literal `NULL` and `result` as an
> **object**; the CRM's `get_referenced_result_set` returns `None` for anything that is not a **top-level
> array**. (c) the console lane reads session via `pg-get-session` (Postgres), so the CRM `?message_id=`
> node `get-session-vars-http` **never runs** for a console turn — the harness must mirror the lookup, and
> the CRM HTTP route itself stays **untested by this harness**.

## §25.0 — S-CRED credential gate  (MANDATORY, run FIRST; blocks all of §25)
- **Not an execution — a static REST check** (MCP `get_workflow_details` redacts credentials → vacuous,
  LESSON 47). `GET {N8N_API_BASE}/workflows/ublq9nSlrpz63xan`, `…/txiPzSxy3Pclsz6v`, `…/oyYfVvZHRZpWubTy`.
- **Expect:** all **six** Postgres nodes bind `credentials.postgres.id == "Dnnofg8Xb27VQOhI"` (`n8n_test-db`):
  `log-chat-history-n8ntest` (fork `ublq9`); `pg-get-session`, **`pg-get-session-ref` (NEW)**,
  `pg-upsert-session`, `log-incoming-chat-history-n8ntest` (clone); the **new handle-lookup node** in `zz-chat`.
- **Hard fail + HALT** on `ETJL5KoaA1UpkDip` (`sorento-crm-db`, PROD) or a missing binding. `chat_histories`
  exists in **both** databases, so a mis-bind SELECTs/INSERTs prod with **no error** (LESSON 10). This is
  the only path by which delta A can breach §0 — verify before a single case runs.

## §25.1 — Envelope depth: `replyTo` reaches the spine  (contact `437264483`) — PRIMARY, scope `deterministic`
- **Pre:** run one ordinary turn that yields a **numbered** result set (≥2 items). Record from
  `n8n_test.chat_histories` the new outgoing row's `message_id` (must be non-NULL) and its `result`.
- **Chat input (turn 2):** `/replyid <that message_id> 2`
- **Expect-branch:** `tf-message` → `sim-inject-gate` FALSE → `session-get-gate` TRUE → **`pg-get-session-ref`**
  (NOT `pg-get-session`) → `get-session-vars` NoOp → `Call 'sub-query-reformulator'`.
- **Expect-output (structural, from `get_execution` runData — never inferred):**
  - `tf-message` output json has `message.replyTo.id === <that message_id>` **AND** no top-level `replyTo` key;
  - `pg-get-session-ref` emitted `session_vars.referenced_result_set` as a **non-empty array**;
  - `Call 'sub-query-reformulator'` input `referenced_result_set` non-empty;
  - the parser resolved `reference_positions:[2]` against it → an entity carrying that row's `uuid`.
- **Safety:** §0 all + §25.0. S1 — no respond.io send; reply only in `chat:reply`. S3 — session write went to
  `respond_contacts_test`; prod PUT `save-session-vars` has 0 inbound and did not execute.

## §25.2 — Per-bubble subset, not the whole set  (contact `437264483`) — scope `deterministic`
- **Chat input (turn 1):** a query whose reply is long enough to split into **≥2** bubbles with numbered
  items in more than one part.
- **Expect-output:** `≥2` new `chat_histories` outgoing rows, each with a distinct non-NULL `message_id`, and
  `jsonb_typeof(result) = 'array'` on every row, with **different** `idx` sets per row (mirrors the live
  `Code in JavaScript` `idxIn` splitter).
- **Chat input (turn 2):** `/replyid <bubble-2 message_id> 1`
- **Expect-output:** `referenced_result_set` equals **bubble 2's** array only; the resolved entity is bubble
  2's first item — **not** the first item of the full set. A pass that returns the full set is a **FAIL**
  (that is the pre-change behaviour and it is more permissive than WhatsApp).
- **Safety:** §0 all + §25.0.

## §25.3 — Anti-recency proof: quote the OLDEST bubble  (contact `437264483`) — **the case that cannot pass by accident**
- **Pre:** reset `respond_contacts_test.session_vars = '{"variables":{}}'` for `respond_io_id='437264483'`
  ONCE, before turn 1 only (never mid-sequence, LESSON 31).
- **Turns 1–3:** three *different* numbered queries, so `variables.last_result_set` after turn 3 holds
  **turn 3's** set. Record turn 1's bubble `message_id`.
- **Chat input (turn 4):** `/replyid <turn-1 message_id> 1`
- **Expect:** the answer is about **turn 1's** item. Assert `referenced_result_set` == turn-1's array while
  `previous_conversation_state.last_result_set` == turn-3's array — proving the **pointer**, not the recency
  fallback, drove the resolution.
- **Inversion (MANDATORY, LESSON 61):** re-run with a **bogus** `message_id`. The case must go **RED** on the
  turn-1 assertion and fall back to turn-3's set. An assertion never shown to fail is not an instrument.
- **Safety:** §0 all + §25.0.

## §25.4 — Graceful miss  (contact `437264483`) — scope `deterministic`
- **Chat input:** `/replyid 99999999999999 what about this one`
- **Expect:** `pg-get-session-ref` ran and emitted `referenced_result_set: null` (mirroring the CRM's
  miss semantics — **`null`, not `[]`**); `output_exchange` falls back to `prevState.last_result_set`; the
  turn completes with **no error** and behaves as a non-reply turn.
- **Safety:** §0 all + §25.0.

## §25.5 — Non-reply regression guard  (contact `437264483`) — scope `deterministic`
- **Chat input:** any ordinary turn with **no** `/reply*` prefix.
- **Expect-branch:** `session-get-gate` TRUE → **`pg-get-session`** (the untouched SELECT), **not**
  `pg-get-session-ref`; `build-item`'s item carries **no** `replyTo` key inside `message.message`
  (matching production, where a non-reply body has no `replyTo` at all).
- **Expect-output:** `get-session-vars` output shape identical to a pre-change baseline run. Proves the
  change is additive and the 100% of turns that don't quote are untouched.
- **Safety:** §0 all + §25.0.

## §25.6 — Mirror-fidelity review  (not an execution — a documented clause-by-clause diff)
- Diff `pg-get-session-ref`'s SQL against the CRM's `get_referenced_result_set`
  (`app/services/conversation_variables_service.py:81-112`): same `WHERE contact_id AND message_id`; same
  `ORDER BY sent_at DESC, id DESC LIMIT 1`; same **array-or-null** coercion; key **absent** unless a
  `message_id` is supplied. Record the comparison in the run log.
- **Rationale:** a mirror that silently diverges is a harness that lies. This is a review artifact, not a
  green tick — a case with no recorded diff cannot be signed off.

## §25.7 — Known divergences to RECORD (not gates)
- The CRM HTTP route `?message_id=` is **not exercised** by this harness (pg lane) — covered only by the CRM
  repo's own tests.
- **Media bubbles are unquotable on live too** (`send-message-images/video/files` are inline httpRequests
  with no logger) → faithful by accident; record as a shared gap.
- The widget shows no visual quote block and bubbles are named by a printed handle, not tapped. Not
  observable downstream of `tf-message`.

## §26. Delete the `reply to:` concatenation — scope `parser`, **touches LIVE**
Target: `Call 'sub-query-reformulator'` › `/workflowInputs/value/latest_user_message` — delete line 2.
Clone first (`txiPzSxy3Pclsz6v`, same node NAME, same leaf), promote to `9qVyfUxmRQqrpGRMDLRuz` user-gated.
**Real reformulator required** — `mock_reformulator_output` feeds a sibling branch that skips
`output_exchange` entirely (LESSON 28), so no mock can exercise the prompt or the two unstripped readers.

## §26.0 — PRE-CHANGE RED (MANDATORY, run BEFORE the edit)
- Run §26.1's repro on the **unmodified** clone and record the **failure** (the quoted `Certification`
  context leaking into the parse). Without this recorded red, §26.1's green proves nothing (LESSON 61).
- ⚠️ Note the clone's own staleness: its line 2 lacks live's `.title` fallback, so on a quoted **quick_reply**
  bubble the clone appends `"reply to: undefined"` where live appends the button title. If the repro does not
  reproduce on the clone, that is the reason — do **not** read it as "the bug isn't real".

## §26.1 — THE REPRO: `Complaint` after a cert-miss escalate offer  (contact `437264483`) — PRIMARY
- **Turn 1:** a certificate request that misses → the bot replies *"no certificate matched … escalate to
  purchasing_certification?"* (buttoned).
- **Turn 2 (quote-reply):** quote that bubble and send exactly `Complaint`.
- **Expect (structural, tolerant):** the parser classifies a **complaint** — **no** `product_attachment`,
  **no** `attachment_type: Certification` carried from the quoted text — and the reply delivers the
  complaint **portal link**.
- **Hard fail:** any `Certification`/attachment context in the parser output that can only have come from
  the quoted bot text.
- **Safety:** §0 all.

## §26.2 — Positional pick by quote still works (regression)  (contact `437264483`)
- **Turn 1:** a numbered result set. **Turn 2:** quote that bubble, reply `2`.
- **Expect:** `reference_positions:[2]` resolved against `referenced_result_set` → the row with `idx=2`'s
  `uuid`. Proves the **structured** path alone carries the reference once the text is gone.
- **Safety:** §0 all.

## §26.3 — Member-pick regression (B-R2: `_extract` no longer scans the quoted text)  (contact `437264483`)
- **Pre:** reach `selection_context = 'member_offer'` (CS member roster offered).
- **Chat input:** a quote-reply whose **quoted bubble text contains a numeral or ordinal** (e.g. a numbered
  roster) while the user's own words do not unambiguously name a position.
- **Expect (LESSON 39 form — never a single deterministic value):** the correct member resolves **OR** the
  turn safely abandons to a new query / reprompt → **both PASS**. **Resolving to the WRONG member is a HARD
  FAIL** (a wrong CS assign triggers a staff email/WhatsApp ripple).
- **Note:** pre-change, `_extract` scanned the quoted text and could inject a **spurious** position. The
  change removes that; this case exists to prove the removal did not break the legitimate pick.
- **Safety:** §0 all — S2 especially (no assign/SLA/PIC write).

## §26.4 — `MENU_LABELS` shortcut now reachable on a quote-reply (B-R3, expected NEW behaviour)
- **Chat input:** quote a bubble and reply with text that is **exactly** a menu label.
- **Expect:** `userMsg` (L123) now equals the label → `MENU_LABELS[userMsg]` hits (L131). Pre-change this was
  **impossible** on every quote-reply because the suffix was appended. Assert as **intended new behaviour**,
  not as an unexplained diff.
- **Safety:** §0 all.

## §26.5 — Prompt hygiene  (assertion on the sub-execution's LLM input)
- **Expect:** in the reformulator sub-execution, the AI-Agent input's `Current user message:` line equals the
  user's typed text **exactly**, and the string `reply to:` appears **nowhere** in the rendered prompt.
- Assert on **payload shape**, never on execution status (LESSON 61a).
- **Safety:** §0 all.

## §26.6 — Media-bubble degradation (B-R1, ACCEPTED, must be recorded not hidden)
- **Chat input:** quote an **attachment/media** bubble (sent by `send-message-images/video/files` — no logger
  anywhere, so no `chat_histories` row exists).
- **Expect:** `referenced_result_set: null` → the turn behaves as a non-reply turn, no error. Pre-change the
  LLM at least saw the quoted text; post-change it sees nothing.
- **Verdict:** **accepted, bounded degradation.** Record it explicitly in the run log — a silent pass here
  would be a pass-by-luck.
- **Safety:** §0 all.

## §26.7 — No-quote regression  (contact `437264483`)
- **Chat input:** a representative sample of ordinary non-quote turns (mined from `chat_histories`,
  pre-labelled with expected outcome — LESSON 29: sample, don't sweep).
- **Expect:** parser output shape unchanged vs a pre-change baseline. `latest_user_message` is now a single
  line with no trailing blank line.
- **Safety:** §0 all.

## §26.8 — LIVE promote gate (not a case — the promote protocol)
- Backup the prior `versionId` + node body (LESSON 25). Pre-check **draft == active** on
  `9qVyfUxmRQqrpGRMDLRuz` (LESSON 23/24 — a stale draft is a revert-landmine).
- One `setNodeParameter` targeting the node by **NAME** (`Call 'sub-query-reformulator'`), path
  **`/workflowInputs/value/latest_user_message`** — never `/parameters/…` (LESSON 32b).
- **Byte-SHA gate:** draft == intended file → publish → re-fetch, active == intended file. Abort on any
  mismatch; every abort halts before a live write, at zero cost.
- Whitespace: strip trailing whitespace and be explicit that the target has **no trailing newline** — the
  authoring channel right-trims and will otherwise fail the gate on inert bytes (LESSON 58b).
- **Own publish, no riders** (LESSON 51). Live writes require user-added permission allow-rules and must be
  authored in the main agent's authorized turn (LESSON 26/58a); `sorento-coder` is barred from live.
- **Post-promote verification is on the CHANGED PATH** (LESSON 56): a real **quote-reply** live turn, not a
  happy-path turn. If it cannot be exercised, record **unverified** — never infer it from a clean diff.

## §DC. Canaries owed by the live `tryDymPick` prior-domain deletion — scope `parser`

> # ⛔ RETIRED / SUPERSEDED 2026-08-02 — DO NOT RUN §DC-1 or §DC-2 AS WRITTEN
> The code these two canaries were written against **no longer exists**. Bundle change #5
> (promoted live 2026-08-01, parser `88ef5c40`) replaced that whole region of `applyDymPick`. Live
> `output_exchange` **L204–218** now reads:
> ```js
> const _isBareCode  = norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
> const _viaNumbered = (_useSlot === false);
> if ((_isBareCode || _viaNumbered) && _offer && _offer.domain) {
>   output.output.domain_hint            = _offer.domain;
>   output.output.intent_hint            = _pv.intent_hint ?? null;
>   output.output.dym_pick_domain_forced = _offer.domain;
> }
> ```
> Three premises of §DC-1/§DC-2 are now false: the domain source is **`_offer.domain`**, not
> `_prev.domain_hint`; the intent rule is **`_pv.intent_hint ?? null`**, not `current || prev` or
> `prev || current`; and there is a **new gate** (`bare-code OR numbered`) that did not exist. Running them
> as written would report the behaviour of deleted code — the `green-that-cannot-fail` class.
>
> **Replacement coverage is already written: run `§DC5` instead** (`§DC5-0`, `§DC5-0b`, `§DC5-1`,
> `§DC5-REGR-newquery`, `§DC5-REGR-abort`, `§DC5-REGR-unrelatedcode`, `§DC5-noreg`). §DC5 tests #5's real
> gate in **both** directions, which is the property §DC-1/§DC-2 were reaching for:
>
> | probe (offer domain) | raw LLM | FINAL | `dym_pick_domain_forced` | fork exec |
> |---|---|---|---|---|
> | `SRT59-CR promotion` (inventory) | promotion | promotion ✅ | `None` — gate declined | `10839868` |
> | `have stock for srtwc8518-SH ?` (product_attachment) | inventory | inventory ✅ | `None` — gate declined | `10839898` |
> | bare `SRT59-CR` (inventory) — **⭐ POSITIVE CONTROL** | master_products | inventory | **`inventory` — FIRED** | `10839914` |
>
> ⚠️ **The positive control is not optional.** A #5 gate family that only ever shows the gate *declining*
> passes whether or not the gate can fire at all. §DC5's sign-off must cite a firing case; a §DC5 result
> without one is not evidence (LESSON 61).
>
> **§DC-0's substance survives, elsewhere:** the fork-parity precondition moved to **§27.0a**, where it is
> now a cheap *re-verify* (fork `wI5RkNGW3EOJfBdo` `output_exchange` is byte-identical to live `XTODTw`,
> sha1 `ceadf7bc…`, `diff` = 0 lines) rather than a build step. Cross-ref: plan §0.3, §0.11.

<details>
<summary>Historical text of §DC-0 / §DC-1 / §DC-2 (kept for provenance — not runnable)</summary>

## §DC-0 — ⛔ BLOCKER (run FIRST; DC-1/DC-2 are VOID until it passes)
- The clone's parser fork **`wI5RkNGW3EOJfBdo` still contains** the deleted line (fork L210):
  `if (_prev.domain_hint) { output.output.domain_hint = _prev.domain_hint; output.output.intent_hint = output.output.intent_hint || _prev.intent_hint; }`
  — absent from live `XTODTw`; every other difference in `output_exchange` is whitespace.
- **Expect:** delete that line from the fork, re-diff live↔fork, require **whitespace-only** difference.
- Until then, any DC canary exercises the **OLD** code and reports the OLD behaviour — false green or false
  red (`green-that-cannot-fail`). A DC result recorded before §DC-0 is **void, not pending**.
- ✅ **CLOSED 2026-08-02** — the line is gone from both sides; see §27.0a.

## §DC-1 — Incompatible pick: prev domain `order`, picked candidate `entity_type: promotion`  ⛔ RETIRED
- **Pre:** a turn establishing `variables.domain_hint = 'order'` plus a `dym_offer` whose candidates include
  one with `entity_type: 'promotion'`.
- **Chat input:** type that promotion code (a bare-code dym pick).
- **Expect:** the deleted line no longer force-carries `order`. Domain now comes solely from the rev4
  domain-continuity block (`output_exchange` L499–525), which inherits the prior domain **only** when every
  current-message entity's hint is compatible per `DOMAIN_BLOCKED_HINTS[prevDom]`. Assert: the picked entity
  keeps `hint: 'promotion'` (tryDymPick forces `_picked.hint = _hit.entity_type`), and either
  `domain_inherit_blocked: 'order'` is present **or** `domain_inherited_compatible` is absent.
- **Hard fail:** `domain_hint = 'order'` alongside a `promotion` entity (order-domain contamination).
- **Safety:** §0 all.
- ⛔ **Invalid as of #5:** a bare-code pick is now *deliberately* force-routed to `_offer.domain`, so the
  "domain comes solely from the rev4 block" premise is false, and the expectation would produce a
  spurious red. The order↔promotion contamination question is now covered by `§DC5-REGR-unrelatedcode`.

## §DC-2 — Intent precedence flipped: old `current || prev`, rev4 L520 is `prev || current`  ⛔ RETIRED
- **Pre:** turn 1 establishes `variables.intent_hint = 'check_stock'`.
- **Chat input (turn 2):** a bare-code dym pick where the LLM emits a **different non-null** `intent_hint`
  (e.g. `check_price`) and the domain signal is **not** explicit (`_explicit === false`).
- **Expect:** `intent_hint = 'check_stock'` (**prev wins** under rev4 L520
  `prev.intent_hint || current || null`), and the reply is the **stock** answer, not the price answer. Under
  the deleted line the current value would have won.
- **Safety:** §0 all.
- ⛔ **Invalid as of #5:** on a fired pick, `intent_hint` is now `_pv.intent_hint ?? null` — an
  **unconditional overwrite** from prior state, not an `||` precedence choice. The expected value happens to
  coincide in this one scenario, which makes the case *worse* than useless: it would pass for the wrong
  reason. Covered by `§DC5-0` / `§DC5-0b`.

</details>

---

# Change: `quoted-turn-state-pointer` — plan `../plans/quoted-turn-state-pointer-plan.md`

Four deltas. **C1** = CRM read-contract widening (`session_vars.referenced_state`) — CRM side, verified by
CRM pytest (§27.11), **not** by this harness. **C2** = the parser rebase, scope **`parser`**, **touches
LIVE** (parser `XTODTw-dJcV0uRdC056hG`, user-gated). **C3** = one spine leaf, scope **`deterministic`**,
**touches LIVE** (spine `9qVyfUxmRQqrpGRMDLRuz`, user-gated). **C4** = clone-only harness injection, scope
**`deterministic`**, touches nothing live.

> # ⚠️ REVISED 2026-08-02 — read this before running any §27 case
> The 6-change did-you-mean/partial-resolution/domain bundle went **LIVE 2026-08-01** (parser `88ef5c40`,
> spine `a40cd16d`; `output_exchange` 740 → 867 lines). Five changes to §27:
> 1. **§27.0a is SATISFIED** — the fork re-sync happened as part of the bundle. It is now a *re-verify*
>    gate, still mandatory.
> 2. **§27.0c is NEW** — clone-spine parity with the bundle (verified; re-verify before running).
> 3. **§27.3 is REWRITTEN.** The old "carry-site count stays at two" gate is **WRONG and would
>    false-fail** — live has 9+9 assignment sites and both carry gates gained `&& !_switchDomain`. It is
>    now a *content* gate with a mandatory induced-failure step.
> 4. **`referenced_state` now carries FIVE keys** — `dym_last_result_set` was added (plan §0.9). §27.5
>    gains rows **h/i**, and **§27.2b** and **§27.12** are NEW and are the two cases that hold that line.
> 5. **§27.13 is NEW** — it *records* the F7 gap (a quoted numbered dym pick needs a live dym marker),
>    scored MASKED. A §27 sign-off that does not mention F7 is incomplete.
>
> Also: **C1's four-key projection is already DEPLOYED and proven against prod** (clone execs `10820850`
> non-null / `10820865` null-with-key-present). The 5th key is the only CRM work left, and **C2 must not be
> promoted before it lands** (plan §6 ordering constraint / §9 M14).

Notation: cases run on the clone `txiPzSxy3Pclsz6v` in `mode=regress-capture` (session from
`n8n_test.respond_contacts_test`) unless the case says `sim-inject`. `sim-inject` cases put
`previous_conversation_state` + `referenced_result_set` + **`referenced_state`** (C4) directly in the redis
item — `sim-inject-gate` routes them to `sim-inject-session` → the `get-session-vars` NoOp, bypassing both
the Postgres and CRM session reads. Contact `437264483` (FULL access) unless stated. Every case is bound by
**§0 S1–S8**; a §0 failure is a hard fail regardless of functional correctness.

> **Grounded premises (measured live; ⭐ = re-measured or corrected 2026-08-02 — do NOT re-derive):**
> (a) **Outgoing `turn_id` is threaded on the ESCALATION path** — `Call 'sub-human-intervention'` passes
> `turn_id = $execution.id`, the sub declares it, all three of its sendmsg calls forward it, and both
> sendmsg loggers persist it. The predecessor plan's blocker #1 is CLOSED.
> (b) **Live parser emits `_parser_raw`** — ⭐ `output_exchange` **L76 + L866** (was 737) →
> `state_trace.parser_raw` is populated on live, so both raw and applied parser state are inspectable per
> turn. Note `_parser_raw_snapshot` snapshots `output.output`, **not** `parent_input`.
> (c) **`state_trace`'s `trim()` collapses ONLY `last_result_set` / `referenced_result_set` /
> `dym_candidates`, and only at TOP LEVEL** → `dym_offer.candidates`, `entities`, `domain_hint`,
> `intent_hint` survive intact. ⭐ **`dym_last_result_set` is NOT in that list either, so it also survives
> VERBATIM** — that is what makes the 5th key possible. `state_trace.after` is `compile-current-state`'s
> unwrapped `variables` (20 keys + a conditional 21st `dym_last_result_set`, emitted only when a dym set
> was armed).
> (d) ⭐ **The fork is now BYTE-IDENTICAL to live on `output_exchange`** (sha1
> `ceadf7bc933b4156b5e65c8758eddefd03c8c673`, `diff` = 0 lines, 867 lines each) and on `systemMessage`
> (sha1 `eaf99055f458caeebb787049de6b5a46c0c4c631`, 31,377 bytes). The 2-line `tryDymPick` overwrite is
> gone from both sides. The fork still carries the extra **orphaned** `Postgres Chat Memory` node (8 nodes
> vs live's 7) — so LESSON 57's "never block-copy the fork" rule stands.
> (e) **The clone CAN take injected session state** — `sim-inject-gate` → `sim-inject-session` (LESSON 31 is
> stale for the clone). ⭐ Re-fetched: it is still the **2-key** form; C4's third key is genuinely unbuilt.
> (f) ⭐ **NEW — quoting an INCOMING message yields `referenced_result_set: null`**, because incoming rows
> carry no `result`. Only quoting an **OUTGOING bot bubble** yields both keys. Any case that quotes a
> customer message and asserts on `referenced_result_set` is a `green-that-cannot-fail`.
> (g) ⭐ **NEW — `chat_histories.result` holds the STOCK set, never the dym set.** Only
> `sorento-sub-respond-sendmsg-respond2` passes `result_set` at all
> (`= compile-current-state.variables.last_result_set`), and the sub's `Code in JavaScript` further filters
> it by every line-start number scraped from the bubble text (`/(?:^|\n)\s*\*?(\d{1,3})[.)]/g`) — which
> **includes the did-you-mean numbers**, since they render as `  N. label`. Plan §0.10 / flag F8.

## §27.0 — Preconditions (MANDATORY, run FIRST; §27 is VOID without all three)

### §27.0a — ✅ Fork parity (SATISFIED 2026-08-02 → now a BLOCKING **RE-VERIFY**, not a build step)
- The `tryDymPick` prior-domain overwrite this gate was written to remove **no longer exists on either
  side** — the bundle rewrote that region and was promoted from the fork. Measured: fork
  `wI5RkNGW3EOJfBdo` `output_exchange` == live `XTODTw` **byte-for-byte** (`diff` = 0 lines, 867 lines,
  sha1 `ceadf7bc…`); `systemMessage` byte-identical (sha1 `eaf99055…`); trigger declarations identical
  (6 inputs, no `referenced_state`).
- **The gate stays MANDATORY in re-verify form** — a byte-identical claim decays the moment anything lands
  on either side (memory `stale-byte-identical-fork-claim`). Record, in the run log:
  1. `diff` (not just `diff -w`) of both `output_exchange` bodies = **0 lines**, plus both sha1s;
  2. same for `AI Agent.systemMessage`;
  3. `versionId == activeVersionId` on **both** workflows (LESSON 24 rider hazard);
  4. that the fork still has **8 nodes vs live's 7** — the orphaned `Postgres Chat Memory` (§27.0b).
- Build C2 on the fork; build the **promote target** as `live + only C2's hunks`, never a copy of the fork
  (LESSON 57 — it carries the extra node).
- A §27 result recorded before §27.0a is **void, not pending**.

### §27.0b — S-CRED credential gate (static REST, not an execution)
- MCP redacts credentials → its output is vacuous (LESSON 47). Via REST `GET {N8N_API_BASE}/workflows/{id}`
  for `txiPzSxy3Pclsz6v`, `ublq9nSlrpz63xan`, `oyYfVvZHRZpWubTy`: every Postgres node binds
  `Dnnofg8Xb27VQOhI` (`n8n_test-db`).
- **NEW this change:** report the credential bound to fork `wI5RkNGW3EOJfBdo`'s orphaned
  `Postgres Chat Memory` (`ai_memory: [[]]` → unreachable today, but unexplained).
- **HALT** on any `ETJL5KoaA1UpkDip` (prod `sorento-crm-db`) or missing binding — `chat_histories` exists in
  **both** databases, so a mis-bind reads/writes prod with no error (LESSON 10).
- Do not persist full REST GET dumps: `activeVersion` embeds literal API keys (LESSON 59b).

### §27.0c — ⭐ NEW: clone-spine parity with the bundle (BLOCKING re-verify)
The bundle changed two **spine** Code nodes. A stale clone would run pre-bundle spine code under every §27
case that touches the two-set model — the same false-green class as §27.0a, on the other side of the
boundary. Verified 2026-08-02; **re-verify before the first case**:

| node | required |
|---|---|
| `compile-current-state` | `diff -w` clone↔live = **0 lines** (528 lines both sides) |
| `build-suggest-offer` | `diff -w` = **exactly the 3 recorded cosmetic hunks and nothing else** — two comment box-rule widths + one trailing newline. Record them, so a later byte-diff is not mis-read as drift. |
| `Call 'sub-query-reformulator'` | targets fork **`wI5RkNGW3EOJfBdo`** (not live `XTODTw`; CLAUDE.md's prose bullet saying otherwise is stale — its table row is correct) and declares 6 inputs with **no** `referenced_state` |
| `sim-inject-session` | the 2-key form; C4's `referenced_state` line absent |

- Any other differing hunk on either Code node ⇒ **HALT** and reconcile before running §27.

## §27.1 — REBASE proof: quote an OLD bubble, not the previous one (`437264483`) — PRIMARY, scope `parser`
- **Pre:** reset `respond_contacts_test.session_vars = '{"variables":{}}'` for `437264483` **once**, before
  turn 1 only (never mid-sequence — LESSON 31).
- **Turns 1–3:** three *different-domain* numbered queries, so after turn 3 `variables.domain_hint` and
  `variables.entities` are **turn 3's**. Record turn 1's outgoing bubble `message_id` and its `turn_id`.
- **Turn 4:** quote turn 1's bubble with a deliberately **non-decisive** continuation (`and the price?` —
  must not produce a `_DECISIVE_INTENTS` member, else `_explicit` short-circuits the carry by design).
- **Expect-branch:** `tf-message.json.message.replyTo.id` populated → `get-session-vars` (or the clone
  mirror) returns **both** `referenced_result_set` and `referenced_state` → parser rebases.
- **Expect-output (structural, from `get_execution` runData — never inferred):**
  - `Call 'sub-query-reformulator'` input carries `referenced_state` with all **five** keys present
    (⭐ amended — `dym_last_result_set` is the 5th; `[]` is a valid value for it here);
  - parser output has `state_rebased_from_quote: true`;
  - `domain_hint` / `intent_hint` == **turn 1's**, and the resolved `entities` derive from turn 1's, while
    the session's `previous_conversation_state` still holds **turn 3's** — proving the pointer, not
    recency, drove it;
  - exactly one of `domain_reused_entityless` / `domain_inherited_compatible` is set (the same two carry
    sites as before — **no new diagnostic flag may appear**).
- **INVERSION (MANDATORY, LESSON 61):** re-run identically with `referenced_state` **absent**. The case
  must go **RED** on the turn-1 assertion and fall back to turn-3's domain. An assertion never shown to
  fail is not an instrument.
- **Safety:** §0 all + §27.0. S1 no send; S3 no prod session PUT (`save-session-vars` has 0 inbound).

## §27.2 — ⭐ Quoted did-you-mean picker beats an EXPIRED offer (`437264483`) — FLAGSHIP, scope `parser`
This is the case that proves the pointer supersedes the TTL machinery, and it **cannot pass by accident**:
pre-change the offer is gone from the session, so the pick has nothing to match.
- **Turn 1:** a query that yields a did-you-mean picker → `variables.dym_offer = {id, candidates:[…], ttl:3}`.
  Record the picker bubble's `message_id`; record `dym_offer.id` and one candidate `code`.
- **Turns 2–3:** two unrelated queries that **kill** the offer via `compile-current-state`'s lifecycle —
  rule 5 (`_answered`, i.e. each returns a non-empty `last_result_set`) is the cleanest killer. **Assert
  from the would-be-written session payload that `variables.dym_offer IS null` after turn 3** (read the
  input to the orphaned `save-session-vars` / `compile-current-state` output — LESSON 42). Without this
  assertion the case proves nothing.
- **Turn 4:** quote turn 1's picker bubble and type the candidate `code` (bare, no purpose-word — bare codes
  reliably get `intent_hint: null`, so `_explicit` is false and the rebase applies).
- **Expect-output:**
  - `state_rebased_from_quote: true`;
  - `dym_pick_applied: true` and `dym_offer_pick_code == <that code>` — resolved against the **quoted**
    offer's candidates, not the session's (which is `null`);
  - the picked entity replaced the source token **in place** (`entity_op: 'replace_combine'`,
    `scope_exclusive: false`), prior entities RETAINED, and `dym_slot == <dym_offer.id>` stamped;
  - `domain_hint` == turn 1's domain.
- **Pre-change RED (mandatory):** the identical turn 4 with `referenced_state` absent must **fail** — no
  `dym_pick_applied`, because `_prev.dym_offer` is `null`. Record that red.
- **Mirror-trap guard A (design §3.5 Trap A):** run a variant where turn 3 leaves a **live** `dym_offer` in
  session whose candidates differ, and the quoted turn's `dym_offer` is `null`. Assert `dym_pick_applied` is
  **absent** — the rebase must have zeroed the derived `dym_candidates` mirror. A pick resolved against the
  *current* offer while claiming to be a quoted pick is a **hard fail**.
- ⭐ **NEW 2026-08-02 — assert `dym_pick_domain_forced` too.** On the successful turn-4 pick, bundle #5
  fires (`_isBareCode` is true — the whole message is the code), so
  `dym_pick_domain_forced == <the QUOTED offer's domain>` and `domain_hint` matches it. This is a
  *stronger* flagship assertion than the original: #5's gate reads `_offer.domain` and `_pv.intent_hint`,
  both of which rebase, so it proves the rebase reached `applyDymPick` and not merely the carry gates. It
  also means the flagship no longer depends on `_explicit` being false, so **the quoted text channel
  cannot suppress it** (plan §7).
- **Safety:** §0 all + §27.0.

## §27.2b — ⭐ NEW: quote the bubble you JUST received → must be a NO-OP (`437264483`) — REGRESSION GUARD, scope `parser`
**This is the case that rejects clear-on-rebase** (plan §0.9(4)). It is the commonest quoted dym pick in
real use and it **works today**, so C2 must not touch it.
- **Turn 1:** a query that produces a **partial-miss** bubble — some tokens resolve (stock answer) and at
  least one genuine miss produces the numbered `Couldn't find these: … 1. … 2. …` block. Record the bubble's
  `message_id`; record `variables.dym_last_result_set` (idx→row) and `variables.dym_offer.id` from the
  would-be-written session payload (LESSON 42 — read `compile-current-state`'s output / the orphaned
  `save-session-vars` input; **never** infer).
- **Turn 2:** quote **that same** bubble and reply `2`.
- **Expect:** identical outcome to the un-quoted `2` — `reference_target: 'dym'`,
  `dym_pick_applied: true`, and the resolved code is **`dym_last_result_set[idx=2].value`**. Because the
  quoted turn *is* the previous turn, the rebase is a **no-op**: `state_rebased_from_quote: true` may be
  present, but every rebased key equals the session's own value.
- **HARD FAIL:** `dym_pick_applied` absent, **or** the reply resolving to a **stock** row instead of
  suggestion 2. That is precisely what `dym_last_result_set: []` (clear-on-rebase) would cause —
  `dymNumberedMultiSelect` returns early at L499 and control falls to the byIdx block, which prefers
  `referenced_result_set` = the quoted bubble's **stock** set (premise (g)).
- **Baseline discipline:** run turn 2 **pre-C2** first and record the green. A regression guard whose
  pre-change baseline was never captured cannot distinguish "C2 broke it" from "it never worked".
- **Safety:** §0 all + §27.0.

## §27.3 — The invariant gate (static, NOT an execution) — blocks promote · ⚠️ **REWRITTEN 2026-08-02**

> ⛔ **The previous version of this case was WRONG and would FALSE-FAIL.** It asserted "the carry-site count
> stays at **two**". Live now has **9** `output.output.domain_hint =` and **9**
> `output.output.intent_hint =` assignment sites, and **both** rev4 carry gates gained `&& !_switchDomain`
> (L384 and L629) from bundle #6. A loose grep reports 11 for `domain_hint` because L109 and L569 are `===`
> **comparisons** — that is almost certainly where the "11 write sites" figure came from.
> The **invariant still holds** (every site that reads prior state reads it through the rebound
> `parent_input` / `prevState` / `_pv`, so the rebase is still one statement), but a *count* no longer
> discriminates: it fails a correct C2, and relaxed to match the new count it would then **pass** a genuine
> new carry site such as `output.output.domain_hint = _refState.domain_hint;` — the exact line-210 bug
> class, because that writes the **output** side.

Run the four checks below against the `output_exchange` body extracted to a file, **before** and **after**
C2. Plan §3.3 has the same commands; keep them in sync.

```sh
# G1 — assignment-line CONTENT set: offset-insensitive, order-insensitive, must be IDENTICAL
grep -hoE 'output\.output\.(domain_hint|intent_hint)[[:space:]]*=[^=].*$' OUT.js \
  | sed -E 's/[[:space:]]+/ /g' | sort > sites.txt
wc -l < sites.txt && shasum sites.txt      # PRINT the count — never let empty output mean PASS

# G2 — the rebase block writes ONLY parent_input
awk '/QUOTED-TURN STATE REBASE/,/^}$/' OUT.js | grep -cE 'output\.output\.'     # required: 0

# G3 — exactly one parent_input reassignment beyond the `let` declaration
grep -cE '^[[:space:]]*parent_input[[:space:]]*=' OUT.js                        # required: 1

# G4 — both carry gates verbatim
grep -cF 'if (!_explicit && !_switchDomain) {' OUT.js                           # required: 2
```
- **Expected on live today: G1 population = 18** (9 + 9); **G4 = 2**.
- **⛔ MANDATORY INDUCED FAILURE (LESSON 61).** Take a scratch copy of the *post-C2* file, insert
  `output.output.domain_hint = _refState.domain_hint;` inside the rebase block, and record that **G1's sha
  changes AND G2 returns ≥ 1**. Record both the induced red and the real green. **A §27.3 result without a
  recorded induced red is not a result** — it is an assertion nobody has shown can fail.
- Assert the plan §3.3 **seven**-point checklist item by item: (1) the block assigns only `parent_input` +
  its own locals; (2) placement is after the L52 `parent_input` binding and **before the first
  `previous_conversation_state` read at L100** — note **L76 is NOT a constraint**, it snapshots
  `output.output`; (3) `_explicit` (L262) untouched; (4) **both gate lines byte-unchanged including
  `&& !_switchDomain`**, and both gate bodies byte-unchanged; (5) `state_rebased_from_quote` written **only
  when true**; (6) no `if (quoted) …` branch elsewhere; (7) `parent_input` reassigned exactly once.
- **Any G1 sha difference, G2 ≠ 0, G3 ≠ 1, G4 ≠ 2, or any checklist violation ⇒ REQUEST-CHANGES**, no
  discussion.
- **Context for the reviewer (do not test, just know):** the three owners of `domain_hint`-from-prior-state
  today are carry site 1 (L385–386), carry site 2 (L637–638) — both hole-filling — and **bundle #5's pick
  override (L215–216), which DOES overwrite the current turn's value** and is a documented exception
  (plan §2). #6 (L651/L653) writes from the current message only and is not an owner. C2 must not create a
  fourth.

## §27.4 — `_explicit` still wins: the rebase did NOT become an overwrite (`437264483`) — scope `parser`
- **Pre:** turns 1–3 as §27.1, so the quoted turn's domain differs from the current session's.
- **Turn 4:** quote turn 1's bubble **and** send a decisive message (`check stock for <code>` → a
  `_DECISIVE_INTENTS` member + a domain).
- **Expect:** `domain_hint` / `intent_hint` come from the **CURRENT turn**, not the quoted turn.
  `domain_reused_entityless` and `domain_inherited_compatible` both **absent**;
  `domain_signal_source: 'intent_explicit'`. `state_rebased_from_quote: true` may still be present — the
  rebase happened, the carry simply did not fire. That distinction is the point.
- **Hard fail:** the quoted domain overriding an explicit current-turn signal. That would mean a fourth
  carry site was added in disguise.
- **Safety:** §0 all + §27.0.

## §27.5 — Fail-safe matrix (`sim-inject`, ~0-token) — scope `deterministic`
One run per row. `referenced_state` is a redis-item field (C4), so every permutation is deterministic.

| # | injected `referenced_state` | expect |
|---|---|---|
| a | key **absent** | no rebase; `state_rebased_from_quote` **absent**; baseline == injected `previous_conversation_state` |
| b | `null` | as (a) |
| c | `{}` | as (a) — guard requires `'domain_hint' in` **and** `'entities' in` |
| d | `[]` (array) | as (a) — `!Array.isArray` guard |
| e | `"some string"` | as (a) |
| f | `{"domain_hint":"order"}` (no `entities`) | as (a) — **partial object must not half-rebase** |
| g | valid **5-key** object | **rebase fires**; `state_rebased_from_quote: true`; baseline == the injected quoted state, **including `dym_last_result_set`** |
| **h** ⭐ NEW | valid **4-key** object (`dym_last_result_set` **absent** — i.e. today's deployed CRM projection) | rebase fires on the four; `dym_last_result_set` → `[]`. **Record the behaviour; do NOT score it PASS.** This is plan §9 **M14**, the one miss path that does *not* degrade to today: it is clear-on-rebase, which §0.9 rejects. Its purpose is to make the M14 state visible and to prove the §6 deploy-ordering constraint is load-bearing rather than bureaucratic. |
| **i** ⭐ NEW | valid 5-key object whose `dym_last_result_set` is `[]` and whose `dym_offer` is `null` (a quoted turn that armed no dym set — the normal case) | rebase fires; `_dymActive` false, `dymNumberedMultiSelect` returns at L499, a positional reply falls to byIdx over the quoted `referenced_result_set`. **Correct** — resolution stays inside the quoted turn. |

- **INVERSION (MANDATORY):** (g) must demonstrably differ from (a) on `domain_hint` **and** `entities` **and
  `dym_last_result_set`**. A guard that is always false is not a guard (LESSON 61); rows a–f are only
  meaningful because g flips.
- ⚠️ **C4 must inject `referenced_state` VERBATIM.** If `sim-inject-session` helpfully defaults
  `dym_last_result_set` to `[]`, row (h) becomes untestable — a `green-that-cannot-fail` baked into the
  harness. Assert the injector passes the object through unmodified before running the matrix.
- **Expect for all rows:** the turn completes with **no error**, and `get-session-vars` output shape is
  otherwise unchanged.
- **Safety:** §0 all + §27.0. S6 — `deterministic` rows may still run the real reformulator fork once
  (driver cost, not a scope escalation); record token use in the run log.

## §27.6 — ⛔ `after: null` must NOT wipe continuity (`sim-inject`) — scope `deterministic`
The single most dangerous failure mode: a turn that wrote **no** state (no-access refusal, LLM fallback)
stores `state_trace.after = json null`, which is *meaningful*, not empty.
- **Inject:** `previous_conversation_state` = a rich baseline (domain, 3 entities, a `dym_offer`), and
  `referenced_state: null`.
- **Expect:** baseline **completely unchanged** — `domain_hint`, `entities`, `dym_offer` all still the
  injected values; `state_rebased_from_quote` absent; no error.
- **Hard fail:** any of those becoming `null` / `[]` / `{}`. That is strictly worse than today's behaviour
  and is the reason C1 returns `None` rather than `{}` for `after: null`.
- **Paired CRM test:** §27.11 test 5. Both are required; the n8n side alone cannot prove the CRM emits
  `null` rather than `{}`.
- **Safety:** §0 all + §27.0.

## §27.7 — 🔒 CS-assign non-interference (`437264483`) — SAFETY-CRITICAL, scope `parser`
The design's emergent theorem: every input to the member-pick arm (`selection_context` **L746**,
`last_result_set` **L748**, `latest_user_message` **L767/L778**, `priorRouting` **L681**) is **outside** the
whitelist, and `_hasPickSignal` (L787) is branched on **before** `_isNewQuery` (**L798** vs **L841**) — so
C2 cannot cause an assign that would not otherwise happen and cannot change **which** member is assigned.
Prove it, do not assume it.
⭐ **Strengthened by the bundle:** the arm's own entry gate is now
`if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true)` (**L747**) — a dym pick skips
the member arm entirely, so the one path C2 measurably influences is excluded by construction. **Add one
assertion for it:** on a turn where a dym pick applies while `selection_context === 'member_offer'`, confirm
the member arm did **not** run (no `member_*` diagnostics, no roster reprompt) — and that this is *not* an
assign either way.
- **Pre:** establish a pending `member_offer` — `variables.selection_context = 'member_offer'` with a
  known roster in `variables.last_result_set` (`{idx,label,uuid,respond_user_id}`). Record roster idx→uuid.
- **Turn:** quote an **older, unrelated** bubble (a different domain, different result set) and reply `2`.
- **Expect:** the member resolved is roster idx 2 from the **CURRENT** `last_result_set` — never from the
  quoted set. `selection_context` was **not** rebased (assert `previous_conversation_state.selection_context`
  is the session's). Per LESSON 39 the pass rule is **"correct member resolved OR safe abandon/reprompt →
  both PASS"**.
- **HARD FAIL:** resolution to the **WRONG** member's `uuid`, or an assign appearing where none would have.
- **Second turn (junk):** quote an old bubble and send a no-signal reply (no number, no name, no yes/no).
  Expect Tier 3 (abandon) **or** Tier 4 (reprompt) — both non-assigning. Either is PASS; an assign is a
  hard fail.
- **Safety:** §0 all + §27.0. **S2 is the gate**: inside `vUfFUDjLAuMaeQE6`, `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1` and the
  `sorento-respond-assignee-queue` push must NOT have executed; the guard must have recorded
  `{guard:"human-intervention-sub", blocked:true}` and returned before `get-round-robin-assignee`.

## §27.8 — Escalation offer is NOT rebased (`437264483`) — SAFETY, scope `parser`
- **Pre:** turn 1 emits a bubble containing the fixed wording `would you like me to escalate`. Record its
  `message_id`. Turns 2–3: ordinary queries whose `variables.response` does **not** contain that wording.
- **Turn 4:** quote turn 1's escalate-offer bubble and reply `yes`.
- **Expect:** `escalation.is_escalation_confirmation` is **NOT** true — `response` is outside the whitelist,
  so `prevResponse` (**L685**, re-anchored) is still turn 3's and `offeredEscalation` (L686) is false.
  Today's fail-safe behaviour,
  preserved deliberately.
- **Hard fail:** an escalation confirmation, or `Call 'sub-human-intervention'` running at all. A quoted
  bubble must never trigger a staff-ripple write the customer did not just see offered.
- **Safety:** §0 all + §27.0, **S2 as in §27.7**.

## §27.9 — 📌 Transitional double-channel: EXPECTED-MASKED pre-B (`437264483`) — scope `parser`
The quoted TEXT is still appended to `latest_user_message` during C's window, and it is interpolated RAW as
`Current user message:`. The text can manufacture a `_DECISIVE_INTENTS` member + a domain from the **bot's**
words, making `_explicit` true → both carry gates skipped → the rebase has no effect. That is a
*suppression*, never an inversion, so it is safe — but it must be recorded, not discovered later.
- **Turn 1:** produce a bubble whose TEXT contains a decisive purpose-word for domain **Y** while the
  turn's own state is domain **X** (e.g. a certificate-miss escalate-offer bubble: text says
  "certificate", state may be `product_attachment` with `attachment_type: Certification`).
- **Turns 2–3:** unrelated queries.
- **Turn 4:** quote turn 1's bubble with a non-decisive user word whose *correct* reading is a third domain
  (the live repro: `Complaint`).
- **Expect PRE-B (recorded expectation, NOT a failure):** the text channel may win —
  `domain_signal_source: 'intent_explicit'`, domain Y, no carry, and the complaint portal link may not be
  delivered. Record `state_rebased_from_quote` (it will be `true`: the rebase happened and was skipped) and
  record which channel decided.
- ⭐ **AMENDED 2026-08-02 — there are now THREE possible winners, and the case must name which one.** Bundle
  #6 added `&& !_switchDomain` to both carry gates, so a carry can also be suppressed by a bare domain word
  in the customer's own message. Distinguish by diagnostic:
  | winner | tell |
  |---|---|
  | text channel (the poisoned prompt — B's bug) | `domain_signal_source: 'intent_explicit'`, no `domain_switched_by_keyword` |
  | keyword switch (#6 — a legitimate current-turn signal, **not** a failure) | `domain_switched_by_keyword: <domain>` |
  | the pointer (the intended post-B outcome) | `domain_reused_entityless` or `domain_inherited_compatible`, with the **quoted** turn's domain |
  Recording only "the carry did not fire" is **not evidence** — all three look identical at that level of
  detail.
- **Expect POST-B (re-run, V-C12):** with line 2 deleted, `_explicit` is false → the rebase decides →
  domain X (or the correct complaint routing), and `Current user message:` equals the user's typed text
  exactly.
- **Scoring rule:** pre-B this case is **MASKED**, never FAIL. A tester who scores it FAIL has mis-read the
  ordering decision; a tester who scores it PASS without recording the winning channel has produced no
  evidence.
- **Safety:** §0 all + §27.0.

## §27.10 — Non-quote regression guard (`437264483`) — scope `parser`
- **Input:** a representative sample of ordinary, **non-reply** turns (≥6, mixed domains, including one
  bare-code continuation and one `casual`).
- **Expect:** `referenced_state` absent on every one; `state_rebased_from_quote` **absent** on every one;
  parser output shape and all continuity diagnostics identical to a pre-change baseline captured on the
  same seeds: `domain_signal_source`, `domain_reused_entityless`, `domain_inherited_compatible`,
  `domain_inherit_blocked`, `entity_op_applied`, and ⭐ the three the bundle added —
  **`domain_switched_by_keyword`** (#6), **`dym_pick_domain_forced`** (#5), **`select_all_expanded`** (#4).
  Omitting the new three would let a C2 side-effect on the bundle's paths pass unnoticed. Proves the ~100 %
  of turns that do not quote are untouched.
- ⭐ **Include at least one partial-miss turn in the sample** (a turn that arms `dym_last_result_set`), since
  that is the shape C2's 5th key interacts with and it did not exist when this case was written.
- **Replay note (V-C9):** `referenced_state` is a new key on the parser trigger's output — register it in
  the replay orchestrator's `norm()` (`aROEBlQyyoQaB7a1` › `Diff`) as *ignored when absent/null, retained
  when non-null* (LESSON 40). `state_rebased_from_quote` needs no rule (emitted only when true).
- **Safety:** §0 all + §27.0.

## §27.11 — CRM contract unit gate (pytest in the CRM repo — NOT this harness) · ⚠️ AMENDED 2026-08-02
Extend `sorento_crm_backend/tests/test_chat_history_result_set.py` (it already covers the sibling
`referenced_result_set`). **Twelve** tests, per plan §4.4; **four** are mandatory (5, 8, 11, 12).

> **Status:** the endpoint itself is **already deployed and proven against prod** (§0.8 / premises). Tests
> 1–10 lock the shipped four-key shape; **tests 11–12 and the key-count in test 8 are the outstanding
> delta** for the 5th key. C2 **must not be promoted** until 11/12 are green and the live route returns
> five keys (plan §6 / §9 M14).

1. injects `referenced_state` with all **five** keys on a `turn_id`-paired outgoing+incoming pair;
2. key **absent** without `?message_id=` (mirrors the existing `referenced_result_set` assertion);
3. `None` when the anchor row's `turn_id IS NULL`;
4. `None` when the paired incoming row has `state_trace IS NULL`;
5. **⛔ `None` — not `{}` — when `state_trace.after` is JSON null** (the §27.6 wipe hazard);
6. `None` when the same `message_id` belongs to a different contact (scoping);
7. newest turn wins on a duplicate `(contact_id, message_id)` (`ORDER BY sent_at DESC, id DESC LIMIT 1`);
8. **⛔ the projection withholds internal keys** — `after` carrying `last_result_set` /
   `selection_context` / `response` / `access_levels` / `routing` / `before` yields **exactly the FIVE**
   whitelisted keys (⭐ was four). Without this, a future `after` key silently starts leaking;
9. `after.dym_offer.candidates` round-trips with `code`/`for_raw`/`entity_type`/`uuid` intact (locks the
   `trim()` finding into CI);
10. `after.entities` non-list → `entities: []`, no 500.
11. ⭐ **⛔ NEW `test_referenced_state_dym_last_result_set_round_trips`** — `after.dym_last_result_set` is a
    list of rows and every row keeps `idx`/`label`/`value`/`product`/`uuid`/`entity_type`/**`for_raw`**/
    **`for_hint`**/**`for_canonical`**. The three `for_*` fields are what `applyDymPick` needs to replace the
    right entity in place; a projection that drops them looks fine and silently breaks quoted picks. **This
    test is also the CI lock on premise (c):** if anyone ever adds `dym_last_result_set` to `trim()`'s `RS`
    list, this goes red instead of C2 going quietly wrong.
12. ⭐ **⛔ NEW `test_referenced_state_dym_last_result_set_absent_becomes_empty_list`** — `after` with **no**
    `dym_last_result_set` key (the normal no-dym turn; `compile-current-state` L525 emits it conditionally)
    → `dym_last_result_set: []`, **present, not absent, not `None`**. `[]` is what disarms `_dymActive`
    (L453) and `dymNumberedMultiSelect` (L499); `None` breaks `Array.isArray` on the n8n side and
    `undefined` breaks object-spread exactness.
- **Also:** `EXPLAIN ANALYZE` the §4.2 SQL on prod-like data for a high-volume contact (V-C7). There is
  **no index on `chat_histories.turn_id`**; if it seq-scans a large per-contact slice, the partial index
  `(contact_id, turn_id) WHERE turn_id IS NOT NULL` becomes a precondition — in its **own** migration, not
  bundled (LESSON 51).
- **This harness cannot verify the live CRM route.** The clone's `sim-inject` matrix exercises the parser
  and spine contracts only. A green §27.5 is **not** evidence the endpoint works; do not let it read as
  such. And do **not** probe the prod CRM host to check.

## §27.12 — ⭐ NEW: the PAIRING proof — quoted offer must pair with the quoted numbered set (`sim-inject`) — SAFETY-CRITICAL, scope `deterministic`
The case plan §0.9 exists for. Without it, the 5th key is an argument; with it, it is evidence.
- **Inject:** a **current** `previous_conversation_state` carrying `dym_last_result_set` = **list A** (say
  idx 1–3 for product family A) **and** `dym_offer` = offer A; **and** a `referenced_state` whose
  `dym_offer` = offer **B** and `dym_last_result_set` = **list B** (idx 1–3, a different family). Ensure
  A[2] and B[2] are unmistakably different codes with different `entity_type`/domain.
- **Message:** a bare `2` (so the parser tags `reference_target: 'dym'` — list A's marker is active in the
  current session's `response`, which is what makes this reachable at all).
- **Expect:** resolved code == **B[2]**; assert **explicitly that it is NOT A[2]** (assert both the presence
  of B[2] and the absence of A[2] — a single positive assertion here can pass by coincidence of ordering).
  `dym_pick_domain_forced` == **B's** domain (bundle #5 fires via `_viaNumbered`).
- **⛔ MANDATORY negative control (this is the whole point):** re-run with the injected `referenced_state`
  **stripped to four keys** (no `dym_last_result_set`). Record that the answer **flips to A[2]** while
  `dym_pick_domain_forced` is still **B's** domain — the mis-pairing, reproduced on demand: position 2 of an
  unrelated list, force-routed to the quoted offer's domain, with no error and no diagnostic. That recorded
  red is what makes the 5th key evidence-backed rather than asserted, and it is also the empirical form of
  §27.5 row (h).
- **HARD FAIL:** the 5-key run resolving A[2]; or the 4-key run *not* reproducing the mis-pairing (which
  would mean the case cannot detect the bug it was written for).
- **Safety:** §0 all + §27.0. Pure `sim-inject`, ~0-token.

## §27.13 — 📌 NEW: F7 — a quoted dym pick needs a LIVE dym marker (RECORD the gap) (`437264483`) — scope `parser`, scored **MASKED**
`reference_target` is derived partly from the `[N did-you-mean suggestions active]` marker that
`compile-current-state` (L444) appends to `variables.response` — and **`response` is deliberately NOT
rebased** (plan §3.4: rebasing it would let a quoted "yes" confirm an escalation the customer did not just
see, a staff-ripple write). So a quoted dym pick only fires while a marker is *independently* active.
- **Turn 1:** a partial-miss query → numbered did-you-mean bubble. Record its `message_id` and its
  `dym_last_result_set`.
- **Turns 2–3:** ordinary queries that leave **no** dym marker in `variables.response`.
- **Turn 4:** quote turn 1's bubble and reply `2`.
- **Expected (RECORDED, not scored):** the parser most likely emits `reference_target` `'result'` or `null`
  → `dymNumberedMultiSelect` returns at L495 → the byIdx block resolves against
  `referenced_result_set`, which per premise (g) is the quoted bubble's **STOCK** set. So the customer gets
  stock row 2, not suggestion 2.
- **What to record, precisely:** the emitted `reference_target`; whether `dym_pick_applied` is present;
  which set the resolved entity came from; and whether the reply is coherent from the customer's point of
  view. Write it into the run log verbatim.
- **Scoring rule:** **MASKED — never PASS, never FAIL.** C2 neither causes nor fixes this; it is plan
  §0.10's pre-existing defect surfacing on the quote path. A tester who scores it FAIL has mis-read the
  scope; one who scores it PASS has hidden a known wrong answer.
- **Exit criterion for the gap:** F7's structural forced-route change (mirroring `_dymActive`'s
  "no marker regex, structural only" pattern at L453) — **its own plan, its own promote, must not ride
  C2's publish** (LESSON 51). Re-run this case then and require the flip to suggestion 2.
- **Safety:** §0 all + §27.0.

### Coverage (this change) · ⚠️ AMENDED 2026-08-02
| aspect | case |
|---|---|
| rebase to an OLD turn, not the previous one | §27.1 (+ inversion) |
| quoted did-you-mean beats an expired offer | §27.2 (+ pre-change red + mirror-trap A + ⭐ `dym_pick_domain_forced`) |
| ⭐ quoting the bubble you just received is a NO-OP (rejects clear-on-rebase) | **§27.2b** (+ pre-C2 baseline) |
| no fourth owner of domain-from-prior-state (the invariant) | §27.3 (static, **content** gate + **induced red**, blocks promote) |
| `_explicit` still wins (rebase ≠ overwrite) | §27.4 |
| every fail-safe path degrades to today | §27.5 a–g (+ inversion) |
| ⭐ M14 — 4-key CRM + new parser is NOT a safe degrade | **§27.5 (h)** + **§27.12** negative control |
| ⭐ quoted turn armed no dym set → correct disarm | **§27.5 (i)** |
| `after: null` must not wipe | §27.6 + §27.11(5) |
| ⭐ quoted offer pairs with the quoted numbered set | **§27.12** (+ mandatory negative control) |
| cannot change a CS assign | §27.7 (S2 gate, LESSON-39 pass rule; strengthened by L747's `dym_pick_applied` guard) |
| cannot confirm an escalation from an old bubble | §27.8 (S2 gate) |
| transitional double-channel, pre-B | §27.9 (MASKED, re-run post-B; must name **which** of the 3 channels won) |
| ⭐ F7 — quoted dym pick needs a live marker | **§27.13** (MASKED, recorded) |
| non-quote turns untouched | §27.10 (+ replay `norm()` rule) |
| CRM contract + projection boundary (5 keys) | §27.11 (12 tests; 5, 8, **11**, **12** mandatory) |

**Prerequisites (blocking):** **§27.0a** (fork parity re-verify), **§27.0b** (S-CRED) and **§27.0c** (clone
parity re-verify) all green before the first case. **Not blocking §27:** the partial/ask-for-access test
contact is still **TBD** — no §27 case needs it.

**Promote (all user-gated):** C2/C3 go as **two separate publishes** (LESSON 51), built as
**live + own hunks** (LESSON 57 — never copy the fork, it carries an extra orphaned `Postgres Chat Memory`
node), targeted by node **NAME** (LESSON 58c), byte-SHA-gated both sides of each publish, and verified
post-promote on a real **quote-reply of an OUTGOING bot bubble** (LESSON 56 + premise (f) — quoting an
incoming row yields no `referenced_result_set`).
⛔ **NEW blocking predecessor: assert the live CRM route returns `dym_last_result_set` (FIVE keys) before
publishing C2.** A quoted-bubble probe returning only four keys **HALTS** the promote — M14 is prevented by
deploy ordering, not by any runtime guard.

---

# Change: `dym-zerostock-itemize` (#3) — name resolved-but-empty products on an answered stock turn

Plan: `../plans/dym-zerostock-itemize-plan.md`. **Scope: `deterministic`** (edits only spine Code node
`compile-current-state`, live `0804657c` / clone `7a130a0c`; 0 LLM tokens — pin the parser via
`mock_reformulator_output`, run the offline unit via `prepare_test_pin_data`→`test_workflow`). Build/test on
CLONE `txiPzSxy3Pclsz6v`; never edit the live spine. Contact `437264483` (FULL access) for e2e cases. Every
case is bound by **§0** (S1–S8; prod-ingest = S7a/S7b sink-delta + attribution).

Exact locked wording (any deviation = FAIL): `No stock records found for: <comma-separated codes>.`
(single space after colon, `, ` between codes, trailing period; codes in query order, deduped
case-insensitively, capped at 10).

> ## ⚠️ REVISED 2026-08-01 — requested set = customer-REFERENCED (plan §1′)
> The requested set is now **TYPED-exact codes** (from `resolve-entity.resolutions[]`, `match_tier==='exact'`
> per token — mirroring `disallowed-entity-gate`'s own OR-mode logic) **∪ DYM-PICKED codes** (from
> `get-session-vars.…variables.dym_offer.picked` + `qf.dym_offer_pick_code`). It is **NOT** sourced from
> `disallowed-entity-gate.compatible_entities` any more — that flattened set includes resolver-expanded prefix
> siblings the customer never typed (tester OBS-1, run `runs/dym-v3-zerostock-rollup-20260801.json`). **NEW
> HARD case §ZS-1b** (variant suppression) is the flagship. **Fixtures pin `resolve-entity` output, not
> `compatible_entities`.** Typed codes get **family suppression** (satisfied if any same-token sibling
> returned a row); PICKED codes are **strict** (named if the exact picked code has no row, even with a stocked
> sibling).

## §ZS. Zero-stock completeness note

### §ZS-1 — multi-product stock, one resolved-empty (offline unit — PRIMARY GATE)  `scope: deterministic`
- **Trigger:** `check stock for SRTWT902, C2181XUW-P-ENG` (contact `437264483`). Pin the parser
  (`mock_reformulator_output`: `message_type:business_query`, `domain_hint:incoming`, both product entities)
  and pin `compile-current-state` inputs per plan §6: **`resolve-entity.resolutions`** = two single-exact
  product tokens `[{token:'SRTWT902', resolved:true, matches:[{product,'SRTWT902',match_tier:'exact'}]},`
  `{token:'C2181XUW-P-ENG', resolved:true, matches:[{product,'C2181XUW-P-ENG','exact'}]}]`; no dym pick;
  get-results `answers` = ≥1 row with `{label:'Product Code', value:'SRTWT902'}` and NO row for
  `C2181XUW-P-ENG`.
- **Expected branch/path:** happy answered inventory turn (`central-exchange`, `!manualResponse`,
  `!isEscalateBranch`); #3 block fires.
- **Structural assertions:** `user_response` ends `\n\nNo stock records found for: C2181XUW-P-ENG.`;
  `SRTWT902` NOT named; `variables.response` / `last_result_set` / `dym_offer` / `selection_context` /
  `quick_reply` byte-identical to the pre-change node on the same pinned input.
- **Safety:** §0 all. Offline unit → no egress node executes (S1 trivially); S4 get-results tool in READ
  allowlist, never a write tool; S5 `is_test:true`; S6 deterministic → 0 LLM tokens; S7a/S7b prod-sink delta
  zero (offline: no ingest at all).

### §ZS-1b — ★ NEW HARD CASE: bare typed code, resolver-expanded, some siblings stocked → NO #3 line (variant suppression)  `scope: deterministic`
- **The repro the revision fixes** (OLD #3 wrongly emitted `No stock records found for: SRTWT902-FRG, SRTWT902-GM-NL.`, tester OBS-1).
- **Trigger:** `check stock for SRTWT902` — a BARE code the customer typed once. Pin `resolve-entity.resolutions`
  = ONE ambiguous token whose `matches[]` carry the typed exact + four expansion siblings:
  `[{token:'SRTWT902', ambiguous:true, resolved:false, matches:[{product,'SRTWT902',match_tier:'exact'},`
  `{product,'SRTWT902-GM','prefix'},{product,'SRTWT902-GY','prefix'},{product,'SRTWT902-FRG','prefix'},`
  `{product,'SRTWT902-GM-NL','prefix'}]}]`. get-results `answers` = a `Product Code` row for `SRTWT902-GM`
  (and/or `SRTWT902`) but NONE for `-FRG`/`-GM-NL`. `domain_hint:'inventory'` (the domain the gate does NOT
  pre-exact-filter — where the OLD bug lived). `last_result_set.length >= 1`.
- **Expected:** **NO `No stock records found for:` line.** Typed set = `{SRTWT902}` only (the `prefix` siblings
  are excluded — never typed); family `{SRTWT902, -GM, -GY, -FRG, -GM-NL}` ∩ returned ≠ ∅ → `SRTWT902`
  satisfied → nothing named. `user_response` byte-identical to the no-#3 output.
- **Fail-on-purpose (MEMORY: green-that-cannot-fail):** repin every answer row to a NON-family code (e.g.
  `ABC123`) → family ∩ returned = ∅ → confirm `SRTWT902` IS then named. Proves the family gate can go red.
- **Structural assertions:** `-FRG` and `-GM-NL` NEVER appear in `user_response` (they were `prefix`-tier and
  must never enter the requested set, regardless of stock).
- **Safety:** §0 all (offline, as §ZS-1).

### §ZS-2 — dym multi-pick repro (two resolved-empty, PICKED → strict)  `scope: deterministic`
- **Trigger:** the repro — a prior did-you-mean offer, then pick `1,4,5,6,7` (contact `437264483`).
  On the answering turn pin `get-session-vars.…variables.dym_offer.picked` (and/or `qf.dym_offer_pick_code`)
  to include picks 1 `C2181XUW-P-ENG` and 5 `SRTWCY8605` (zero rows) plus 4/6/7 (have rows), and pin
  `resolve-entity.resolutions` carrying those picks as exact matches. get-results `answers` carry `Product
  Code` rows for 4/6/7 only.
- **Expected:** answer shows 4/6/7 stock rows + `\n\nNo stock records found for: C2181XUW-P-ENG, SRTWCY8605.`
- **Structural assertions:** exactly those two codes named, in query/pick order; the three with-stock codes
  NOT named; #3 writes only `user_response`. Picks are named **strictly** (family suppression does NOT apply
  to a pick — the customer chose that exact code).
- **Safety:** §0 all (as §ZS-1).

### §ZS-3 — all-resolved-with-stock → byte-identical no-op (HARD GATE)  `scope: deterministic`
- **Trigger:** §ZS-1 fixture reduced so BOTH products carry ≥1 returned `Product Code` row.
- **Expected:** `missing == []` → NO #3 line.
- **Structural assertions:** run the changed clone jsCode and the current LIVE `compile-current-state` jsCode
  against the same pinned input; `user_response` (and full output) **byte-identical**. This is the regression
  gate that blocks promote.
- **Safety:** §0 all.

### §ZS-4 — total-zero (all empty) → not-found path unchanged, #3 does NOT fire  `scope: deterministic`
- **Trigger:** all requested products return zero rows (get-results `answers:[]`, `has_result:false`).
- **Expected:** existing not-found/dead-end path; `last_result_set===[]`; NO `No stock records found for:` line
  (#3 must not turn a dead-end into a happy answer).
- **Fail-on-purpose check (MEMORY: green-that-cannot-fail):** temporarily flip the fixture to a 1-row answer
  and confirm the #3 line DOES appear — proves the `last_result_set.length>0` gate can go both ways before
  trusting the PASS.
- **Safety:** §0 all.

### §ZS-4b — domain gate (non-inventory answered turn)  `scope: deterministic`
- **Trigger:** an answered `order` turn with a resolved entity absent from the results.
- **Expected:** NO #3 line (`domain_hint` ∉ {inventory, incoming}); output byte-identical to today.
- **Safety:** §0 all.

### §ZS-5 — combined #2 + #3, correct order, no double-listing  `scope: deterministic` (N/A pending #2)
- **Trigger:** one resolved-empty product (#3) AND one unresolved did-you-mean token (#2) on the same
  inventory turn. Requires #2's `Couldn't find these:` append present in the clone `compile-current-state`.
- **Expected order (in `user_response`):** stock rows → `\n\nNo stock records found for: <resolved-empty>.` →
  `\n\nCouldn't find these: …` (#2 numbered dym block).
- **Structural assertions (disjointness):** the resolved-empty code appears ONLY in the #3 line (never in the
  dym block); the unresolved token appears ONLY in the #2 block (never in the #3 line). Confirms the (tighter,
  revised) structural guarantee: #3's TYPED set = tokens that are `resolved===true` OR carry an exact match;
  #2's `missResolutions` = `resolutions.filter(res.resolved !== true && !res.matches.some(isExact))` — these
  are **mutually exclusive by construction** (a token with an exact match, e.g. an expanded `SRTWT902`, is in
  #3 and explicitly excluded from #2; a multi-prefix-no-exact token is in #2 and skipped by #3; picks resolve
  exact → #3 only). No code can appear in both blocks.
- **Status:** if #2 is not yet in the clone, record **N/A pending #2** (do not block #3 promote on it).
- **Safety:** §0 all.

### §ZS-6 — e2e regression (real reformulator, best-effort)  `scope: deterministic` (E2E is parser-tier run, change stays deterministic)
- **Trigger:** via `chat-stateful`, contact `437264483`: **(6a)** bare `check stock for SRTWT902` (the OBS-1
  repro); **(6b)** `check stock for SRTWT902, C2181XUW-P-ENG`; **(6c)** (fresh) the dym multi-pick `1,4,5,6,7`.
- **Expected — the OLD-BUG NON-RECURRENCE is the point of 6a:** 6a → NO `No stock records found for:` line
  mentioning `SRTWT902-FRG`/`SRTWT902-GM-NL` (or any `-*` sibling `SRTWT902` was expanded into) — this is the
  behavior the revision fixes; if any SRTWT902 family variant has stock, expect NO #3 line at all. 6b →
  `SRTWT902` (family) suppressed + `No stock records found for: C2181XUW-P-ENG.` (only the typed empty code).
  6c → `No stock records found for: C2181XUW-P-ENG, SRTWCY8605.` (picks, strict).
- **Data-drift caveat:** exact stock is live-data-dependent; if data drifted, record **unverified** for the
  presence/absence of a specific code — BUT the sibling-non-recurrence assertion (no un-typed `-*` variant
  ever named) is a HARD assertion that must hold regardless of stock. V-ZS0/§ZS-1/§ZS-1b remain the gate.
- **Safety:** §0 all; real-reformulator run uses the FULL clone (subs `is_test:true`, egress orphaned/sinked);
  S6 → only the reformulator LLM runs; S7a/S7b prod-sink delta zero/attributed.

**Promotion:** 1-node business diff (`compile-current-state`, target by NAME), user-gated, backup-first,
byte-SHA gated both sides (LESSON 57/58); independent of #1 (`build-suggest-offer`) and #2 (parser). If #2
promotes in the same window, build target as live + both hunks and re-diff (LESSON 57).

---

# Change: `dym-all-and-domaincarry` (#4 select-ALL + #5 pick-domain-carry) — scope `parser`, **touches LIVE parser**

Plan `../plans/dym-all-and-domaincarry-plan.md`. Two additive hunks on the parser sub's `output_exchange`
(`847a1173`, live `XTODTw` / fork `wI5RkNGW3EOJfBdo`): **#5** forces a confirmed dym pick to stay in
`dym_offer.domain` (inside the shared `applyDymPick`); **#4** makes "all" select every did-you-mean suggestion
(a `_dymActive` branch in the ALL/SEMUA block routing through `dymNumberedMultiSelect`). No systemMessage
change, no spine change. Both are INSIDE the reformulator → invisible to `mock_reformulator_output`
(LESSON 28): flagship gates are 0-token OFFLINE units on `output_exchange`; round-trips use the REAL
reformulator. Folds into #2's parser publish (LESSON 57 build target = live + own hunks, node NAME,
byte-SHA both sides). Section names are `§ALL` (#4) and `§DC5` (#5) — the `5` disambiguates from the
pre-existing `§DC-0/1/2` (a different change).

> ⚠️ The fork ALREADY carries #2 v3 (`reference_target`, `dymNumberedMultiSelect`, `applyDymPick`),
> `dym_offer` (dym-single-use), #1 dym helpers, and domain-continuity rev4. #4/#5 are additive on top.

## §ALL. Select-ALL over an active did-you-mean offer (#4)

### §ALL-0 — offline `output_exchange` unit (0-token, no seed) — PRIMARY GATE
- **Pin:** `parent_input.previous_conversation_state` = `{ dym_last_result_set:[{idx:1,value:'C1',for_raw:'A',
  entity_type:'product',uuid:'u1'},{idx:2,value:'C2',for_raw:'A',…},{idx:3,value:'C3',for_raw:'B',…},
  {idx:4,value:'C4',for_raw:'B',…}], dym_offer:{id:'e1',domain:'inventory',candidates:[…4…],picked:[]},
  entities:[<resolved stock entity>], response:'Previous turn (inventory): returned 1 records [4 did-you-mean suggestions active]',
  domain_hint:'inventory', selection_context:null }`; `latest_user_message='all'`; raw
  `output.output.reference_positions=[]`, `reference_target=null`.
- **Assert:** `reference_positions` == `[1,2,3,4]`; `reference_target==='dym'`; `select_all_expanded===true`;
  `scope_intent===null`; after `dymNumberedMultiSelect` → `entities` ACCUMULATES all 4 picked candidates (both
  `for_raw='A'` alternatives ADD-BOTH, both `for_raw='B'`), resolved stock entity RETAINED; each picked entity
  path carries `domain_hint==='inventory'` (post-#5); `reference_positions` cleared to `[]` (stock byIdx no-ops).
- **Fail-on-purpose (MANDATORY):** run the CURRENT LIVE `output_exchange` on the identical input → "all" is
  NOT expanded (no `dym` route; falls to the broaden reading) → this assertion goes RED. Proves the gate.
- **Safety:** §0 all (offline — no egress, 0 LLM tokens).

### §ALL-0b — `semua` / `everything` variants (offline unit)
- **Trigger:** same pin, `latest_user_message` ∈ {`semua`, `everything`, `both`}.
- **Expected:** identical to §ALL-0 (existing `_isAll` regex already covers these).
- **Safety:** §0 all.

### §ALL-R ★ — non-dym "all" BYTE-IDENTICAL to today — HARD REGRESSION GATE
- **Trigger (offline unit, two sub-cases):** (a) `selection_context='suggest_offer'`, `last_result_set`
  non-empty, **NO** `dym_last_result_set`, msg `all` → the EXISTING expansion branch fires (positions = all
  `last_result_set` idx, `entity_op='reuse'`, domain/intent inherited) byte-identical to current LIVE; (b) a
  plain broaden "all" with NO offer and NO pick-context → neither branch fires → LLM broaden reading intact,
  byte-identical.
- **Assert:** node output byte-identical to the current LIVE `output_exchange` on the same input; the byte-diff
  vs §ALL-0 must be NON-empty (comparison is a real instrument, MEMORY green-that-cannot-fail).
- **Safety:** §0 all.

### §ALL-1 — real reformulator, multi-turn (the fix end-to-end)  (contact `437264483`) — `parser`
- **Trigger:** via `chat-stateful` (reset `respond_contacts_test` once before T1). T1 = partial-miss stock
  query (≥1 resolved product + ≥2 unresolved tokens with alternatives, per #2 §9 fixture) → dym offer. T2 =
  `all`.
- **Expected:** EVERY suggestion queried (multi-select); STOCK returned for each (or #3's `No stock records
  found for:` note if a pick is empty); each resolves in the STOCK domain (NOT catalogue).
- **Scoring (LESSON 39):** all suggestions queried in the stock domain OR safe abandon = PASS; a broaden
  "focus/expand?" prompt, or any catalogue answer = soft FAIL, RECORD. Run ≥3×; repeat with `semua`.
- **Safety:** §0 all; full clone (subs `is_test:true`, egress orphaned/sinked); S6 → only reformulator LLM;
  S7a/S7b prod-sink delta zero/attributed.

## §DC5. Did-you-mean PICK stays in the offer's domain (#5)

### §DC5-0 ★ — offline `output_exchange` unit, CONTAMINATED code-pick (0-token) — PRIMARY GATE
- **Pin:** `previous_conversation_state = { dym_offer:{id:'e1',domain:'inventory',candidates:[{code:'C2181XUW-P-ENG',
  uuid:'u1',entity_type:'product',for_raw:'C21263XUW-P-ENG',for_hint:'product'}],picked:[]},
  entities:[{raw:'C21263XUW-P-ENG',hint:'product',…}], intent_hint:'check_stock', domain_hint:'inventory' }`;
  `latest_user_message='C2181XUW-P-ENG'`; raw LLM `output.output` = `{entities:[{raw:'C2181XUW-P-ENG',
  current_message:true}], domain_hint:'master_products', intent_hint:'check_product', message_type:'business_query'}`.
- **Assert AFTER the node:** `domain_hint==='inventory'`; `routing.suggested_team==='warehouse'` &
  `suggested_agent==='general_enquiries'` (deriveRouting on the forced domain); `intent_hint==='check_stock'`
  (realigned to `prevState.intent_hint`); `dym_pick_applied===true`; `dym_pick_domain_forced==='inventory'`;
  entities = the picked code (replacing the source token) with prior entities retained.
- **Fail-on-purpose (MANDATORY):** run the CURRENT LIVE `output_exchange` on the identical input →
  `domain_hint` stays `master_products`, `routing.suggested_team==='purchasing_product'` (catalogue route) →
  RED. This is the exact repro (`check stock` pick → catalogue) proven wrong pre-#5.
- **Safety:** §0 all (offline — no egress, 0 LLM tokens).

### §DC5-0b — offline unit, NUMBERED-path pick
- **Pin:** `reference_target='dym'`, `dym_last_result_set=[{idx:2,value:'C2',for_raw:'A',entity_type:'product',uuid:'u2'}]`,
  `dym_offer.domain='inventory'`, `reference_positions=[2]`; raw LLM domain/intent null (bare number).
- **Assert:** picked row resolved; `domain_hint==='inventory'` (forced via `applyDymPick`); `dym_pick_domain_forced==='inventory'`.
  Confirms both code + numbered paths share the force.
- **Safety:** §0 all.

### §DC5-1 ★ — real reformulator flagship: pick a suggested code → STOCK not catalogue  (contact `437264483`) — `parser`
- **Trigger:** `chat-stateful`. T1 = `check stock for C21263XUW-P-ENG` (a miss with a did-you-mean offer).
  T2 = type a suggested code (e.g. `C2181XUW-P-ENG`).
- **Expected:** answer is STOCK for that code (or `No stock records found for <code>` if empty), **NOT** a
  `master_products` catalogue answer; NO "list price / discontinued / Here are the matching products". Parser
  `domain_hint == dym_offer.domain`; routing warehouse.
- **Scoring (LESSON 39):** stock-domain answer OR safe abandon = PASS; catalogue answer = HARD FAIL, RECORD.
  Run ≥3×. Numbered variant: T2 = `"2"`.
- **Safety:** §0 all; full clone; S6 reformulator only; S7a/S7b zero/attributed.

### §DC5-REGR-newquery ★ — NEW query after an offer → domain NOT forced (no-clobber)  (contact `437264483`) — `parser` — **CRITICAL**
- **Trigger:** T1 = stock did-you-mean offer (as §DC5-1). T2 (fresh) = an UNRELATED query, one per run:
  `what promotions do you have`, `show me the order for <customer>`, a DIFFERENT product `check stock for <other>`.
- **Expected:** T2 resolves as the parser classified it — `domain_hint` = `promotion`/`order`/the new
  product's domain, **NOT** `inventory`-forced; the answer is the NEW query (promotions / order / other
  product). `applyDymPick` did NOT run (no candidate `_codeMatches`, `reference_target` not `'dym'`).
- **Fail-on-purpose (the point of this case):** assert `domain_hint !== 'inventory'` (for the promo/order
  variants) — it would be `inventory` ONLY if #5 mis-fired on a non-pick. A pass here that could not detect a
  clobber is void; the assertion must be the negative one.
- **Scoring:** correct new-query domain = PASS; any inventory-force = HARD FAIL.
- **Safety:** §0 all; full clone; S6 reformulator only; S7a/S7b zero/attributed.

### §DC5-REGR-abort — casual abort after an offer → no pick, no force  (contact `437264483`) — `parser`
- **Trigger:** T1 offer; T2 = `no` / `never mind` / `thanks` (fresh each).
- **Expected:** existing casual/abort behavior unchanged (no dym pick, no domain force, escalation-decline
  arm behaves as today); `dym_pick_applied` NOT set, `dym_pick_domain_forced` absent.
- **Fail-on-purpose:** confirm `dym_pick_domain_forced` does not appear (would appear only if `applyDymPick` ran).
- **Safety:** §0 all.

### §DC5-REGR-unrelatedcode — bare code NOT in the offer → resolves on its own domain  (contact `437264483`) — `parser`
- **Trigger:** T1 offer; T2 = a bare code that is NOT one of the offered candidates.
- **Expected:** it resolves as a FRESH query (parser's own domain / continuity), NOT forced to the offer's
  stock domain. `_codeMatches` false for every candidate → `tryDymPick` returns → no override.
- **Fail-on-purpose:** assert the code was NOT reconciled as a pick (`dym_pick_domain_forced` absent) and the
  domain is the parser's, not a forced `inventory`.
- **Safety:** §0 all.

### §DC5-noreg ★ — no-dym normal turn BYTE-IDENTICAL — HARD REGRESSION GATE
- **Trigger (offline unit):** a normal turn with no dym offer and no pick.
- **Assert:** node output byte-identical to current LIVE `output_exchange`, apart from the new diagnostic keys
  which must be ABSENT here (`dym_pick_domain_forced`, `select_all_expanded` not present). Register both as
  drop-when-absent in the replay `norm()` (LESSON 40). Byte-diff vs §DC5-0 must be NON-empty.
- **Safety:** §0 all.

**Promotion:** additive hunks on `output_exchange`; folds into #2's parser publish (parser sub FIRST then
spine), target by node NAME, byte-SHA gated both sides (LESSON 57/58), user-gated, backup-first. Post-promote
verify on REAL turns (LESSON 56): a contaminated code-pick routes to stock; "all" resolves every suggestion; a
new-query-after-offer keeps its own domain.

---

# Change: `domain-switch-word` (#6) — a bare/dominant domain word SWITCHES domain — plan `../plans/domain-switch-word-plan.md`

Scope: **`parser`** (edits `output_exchange` inside the reformulator sub — mock-blind, REQUIRES the real
reformulator; offline `output_exchange` unit runs the pure-code logic 0-token). Fork under test =
`wI5RkNGW3EOJfBdo`; live promote target = `XTODTw`. Repro = clone spine `txiPzSxy3Pclsz6v` exec **10826285**:
`check stock for SRTW902` → dym → pick `SRTWT902` (inventory) → bare `promo` → STOCK again (rev4 reuse-path
carry reused `inventory`). Fix adds a deterministic `_switchDomain` signal (keyword→domain, current-message
only) that suppresses both continuity carries and sets `domain_hint` before blocklist-apply/deriveRouting.
All cases contact `437264483` (FULL access), multi-turn via **`chat-stateful` or `regress-capture`** (uac mode
can't round-trip; **replay is BLIND — the pinned mock bypasses `output_exchange`**). Every case bound by §0
(S1-S8). Diagnostic key: `domain_switched_by_keyword`.

## §DS. Domain-switch-word cases

### §DS-0 ★ — offline `output_exchange` unit, switch-over-reuse (0-token) — PRIMARY GATE
- **Input (synthetic pin):** prev state `{domain_hint:'inventory', entities:[{raw:'SRTWT902',hint:'product'}]}`;
  LLM output `{message_type:'clarification', domain_hint:null, intent_hint:null, entity_op:'reuse', entities:[]}`;
  `latest_user_message:'promo'`.
- **Assert:** `output.output.domain_hint==='promotion'`; `domain_switched_by_keyword==='promotion'`;
  `domain_reused_entityless` ABSENT (reuse carry suppressed); carried `SRTWT902` still in
  `output.output.entities` (product compatible with promotion); routing (deriveRouting) = `marketing_promotion_*`.
- **Fail-on-purpose:** on UNPATCHED `output_exchange` this same input yields `domain_hint:'inventory'` +
  `domain_reused_entityless:true` — the assert on `domain_hint==='promotion'` MUST go red. (Prove the gate can fail.)
- **Safety:** §0 all (offline, no egress).

### §DS-0b — offline unit, other switch domains + filler tolerance
- **Inputs (same prev inventory+SRTWT902, LLM null-intent reuse):** `latest_user_message` ∈
  { `order`, `incoming`, `catalogue`, `any promo?`, `show me the catalogue`, `stock ada?` }.
- **Assert:** domain switches to `order` / `incoming` / `master_products` / `promotion` / `master_products` /
  `inventory` respectively; `domain_switched_by_keyword` = that domain each time; filler-wrapped variants still
  fire (filler stripped to one switch token); carried entity present or blocklist-pruned per compatibility.
- **Safety:** §0 all.

### §DS-R1 ★ — real query does NOT double-fire — HARD REGRESSION GATE (offline unit)
- **Input:** prev inventory; LLM `check stock for SRTW902` shape with current entity
  `{raw:'SRTW902',hint:'product',current_message:true}` (`intent_hint:check_stock` → `_explicit`).
- **Assert:** `_switchDomain` null → `domain_switched_by_keyword` ABSENT; domain resolves via the normal path
  (inventory), NOT via #6. #6 must NOT touch it.
- **Safety:** §0 all.

### §DS-R2 ★ — genuine continuation (NO domain word) still carries — HARD REGRESSION GATE (offline unit)
- **Input:** prev inventory + `entities:[SRTWT902]`; LLM `how about SRTWT5902` with current entity
  `{raw:'SRTWT5902',hint:'product',current_message:true}`, `intent_hint:null`.
- **Assert:** `_switchDomain` null; rev4 entity-bearing carry fires → `domain_hint==='inventory'`,
  `domain_inherited_compatible===true`; `domain_switched_by_keyword` ABSENT. Continuity preserved, #6 inert.
- **Safety:** §0 all.

### §DS-R3 ★ — dym pick (bare code) is still a PICK, not a switch — HARD REGRESSION GATE (offline unit)
- **Input:** an active dym offer; `latest_user_message` = an offered CODE (e.g. `SRTWT902`).
- **Assert:** the dym-pick path (#5) resolves the pick as today; `_switchDomain` null (a code is unmapped in
  `_DOMAIN_SWITCH_WORDS`) → `domain_switched_by_keyword` ABSENT; #6 does not fire. Confirms code-vs-word triggers
  cannot collide.
- **Safety:** §0 all.

### §DS-R4 — ambiguous / excluded words do NOT switch (offline unit)
- **Inputs (prev inventory, null-intent reuse):** `latest_user_message` ∈ { `balance`, `delivery`, `price`,
  `promo stock` }.
- **Assert:** `_switchDomain` null for all (excluded words + mixed-domain message) → `domain_switched_by_keyword`
  ABSENT → rev4 carry runs (reuses inventory) unchanged. Guards the contamination boundary (D8/R1).
- **Safety:** §0 all.

### §DS-1 ★ — repro e2e (`chat-stateful`, real reformulator) — FLAGSHIP
- **Trigger:** T1 `check stock for SRTW902` → dym offer → T2 pick `SRTWT902` (inventory shown) → T3 `promo`.
- **Assert (T3):** `output.output.domain_hint==='promotion'`; `domain_switched_by_keyword==='promotion'`;
  routing recomputed to `marketing_promotion_*` (NOT `warehouse`); get-rag/get-results ran on PROMOTION (NOT the
  stock file returned at T2); carried SRTWT902 present in entities.
- **LLM precondition (record):** T3 raw `_parser_raw` has `intent_hint:null` / `domain_hint:null` (`!_explicit`).
  If the live LLM decisively classifies bare "promo" as promotion, #6 is simply unneeded that turn (domain
  already promotion) — record, not a failure.
- **Safety:** §0 all — reply via `chat:reply`, no respond.io send/comment (S1), no assign/SLA/PIC (S2), no
  session-PUT (S3), get-results read-only (S4), `is_test===true` on every sub (S5), S6 `parser`-bound, S7
  sink-delta+attribution clean.

### §DS-2 — other switches e2e (`chat-stateful`)
- **Trigger:** after a T1/T2 stock turn: (a) T3 `order` → domain `order`, routing `customer_service`; (b) fresh
  chain, T3 `incoming` → domain `incoming`, routing `purchasing`.
- **Assert:** `domain_switched_by_keyword` = the switched domain; routing recomputed; carried entity retained if
  compatible, else blocklist-pruned (customer under inventory/incoming drops → broad).
- **Safety:** §0 all.

### §DS-3 — off-continuity inert (single-turn, no prior state) — regression
- **Trigger:** 5-8 single-turn corpus messages whose first token is a domain word but which carry an entity
  (e.g. `stock for AP7540P`, `promo for brand X`), no prior state.
- **Assert:** `domain_switched_by_keyword` ABSENT; domain unchanged vs a pre-change run (no spurious switch when
  the message legitimately IS a query). §0 all.

**Promotion (§DS-promote):** four additive/one-line hunks on `output_exchange` (A insert map+`_switchDomain`,
B/C `&& !_switchDomain` on the two carry gates, D apply switch). Splice ONLY the #6 blocks onto live `XTODTw`
(co-resident with rev4+decline-flag+dym — NEVER wholesale-replace), target by node NAME, byte-SHA gated both
sides (LESSON 57/58), strip trailing whitespace, parser sub FIRST then spine (spine untouched here), user-gated,
backup-first. Register `domain_switched_by_keyword` as drop-when-absent in the replay `norm()` (LESSON 40).
Post-promote verify on a REAL turn (LESSON 56): bare `promo` after a stock turn routes to promotion, not stock.

---

# Change: `tool-loop-removal` — delete the per-tool loop from the spine

Plan: **`../plans/tool-loop-removal-plan.md`**. Scope tag: **`deterministic`** (plan §8 names "RAG
selection" in that tier). Build target clone **`txiPzSxy3Pclsz6v`**; live spine
`9qVyfUxmRQqrpGRMDLRuz` must stay at `a40cd16d` for the whole build.

**What changed:** `tool-filter` now returns exactly ONE flat tool item (highest `similarity`, tiebreak
`name` ASC); `Split Out1` and `Loop Over Items` are deleted; `If6 out1` takes over the loop's `out0` and
feeds `Aggregate1` directly. Full diff in plan §5.

**Why this UAC is unusually broad:** the removed nodes sit on the single path every answered turn AND
every miss turn takes, for all 7 domains. There is no domain gate and no feature flag. Coverage is
per-domain by construction, not by sampling.

### ⚠️ THE ONE THING THIS SUITE EXISTS TO CATCH
`Loop Over Items out0` is the join that carries "no result" into `Aggregate1 → not-found-error-message`,
where every miss template and the frozen escalate phrase live. If `If6 out1 → Aggregate1` is missing or
wrong, **every not-found turn dead-ends: the customer gets nothing and the execution still reports
`status: success`** (memory `unwired-error-output-masks-failure`; LESSONS §61a, measured on clone
`get-access-types` exec `9523682`). Therefore:

> **BINDING RULE for this whole section: no case may be scored on execution status.** Every miss case
> asserts **per-node runData presence** — `runData['Aggregate1'].length >= 1` **and**
> `runData['not-found-error-message'].length >= 1` — plus a non-empty `escalate_message`. A case whose
> only evidence is `status:success` is **void**, not weak (cf. §0 S7b's retracted execution-count gate).

### Drivers, discipline, and pre-conditions (read before running anything)

- **Single-turn cases:** `tests/harness/drive-clone.py <tag> "<message>"` → `zz-canary-run`
  (`POST /webhook/zz-run-hint`), mode `uac`, contact `437264483`. Returns the egress log.
- **Multi-turn cases (`-CONT`, `-DYM`, X6/X7/X8):** the chat console
  `https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`
  (`zz-chat` `oyYfVvZHRZpWubTy`), mode `chat-stateful`, session R/W → `respond_contacts_test`. `uac` mode
  cannot test follow-ups (session write is orphaned; LESSONS §31/§42).
- **Deterministic cases** inject `message.mock_reformulator_output` to pin `domain_hint` per domain at 0
  token cost (LESSONS §28). This is exactly the right tool here: the change is downstream of the parser,
  and per-domain coverage needs *deterministic* domain routing.
- **P-CLONE (blocking):** clone `activeVersionId` recorded at the top of the run log, and **discard the
  first turn after any publish** — a run fired seconds after a write can execute the PREVIOUS version.
  This produced a documented FALSE PASS on the crossdomain feature (FP1).
- **P-EXEC (blocking):** every case records its **executionId**. The crossdomain review's central
  evidence complaint was a run log that mapped no case to an exec — do not repeat it.
- **P-BASE (blocking, run BEFORE the edit):** capture the pre-change baseline on the clone for
  §TL-R2/§TL-AGG — a 1-tool miss turn's `Aggregate1` output and the full `user_response`. Without it the
  byte-identical gates are unfalsifiable. Reference values from live: exec **`11060071`** (1-tool incoming
  miss, `Aggregate1` = `{response_intro:["No matching results found."]}`) and exec **`11049139`**
  (2-tool inventory miss, `{response_intro:["No matching results found.","No matching results found."]}`).
- **P-CONTACT (prerequisite, unchanged):** the partial / ask-for-access contact is still **TBD** (plan
  §7.1). §TL-ACC-partial is **BLOCKED** until it exists; record it as blocked, never as passed.
- **Do not run concurrently** with a golden capture/replay — both share `respond_contacts_test` for
  `437264483` and the `main-message-list-test` list (LESSONS §30).

**Every case below is bound by §0 (S1–S8).** In addition, all cases carry the three structural
assertions from plan §10(TL-b): `runData['tool-filter'][0].data.main[0].length === 1`,
`runData["Call 'sub-get-results'"].length === 1`,
`runData['sorento-sub-respond-sendmsg-respond2'].length <= 1`. **A run with 2 sendmsg runs is a HARD
FAIL and halts the cycle** — on live that is two WhatsApp messages to one customer.

---

## §TL-S. Structural gates (static JSON, NOT executions) — run FIRST; §TL is VOID without them

### §TL-S1 ★ — the loop is gone and the join exists  — BLOCKING
- **Method:** re-fetch `get_workflow_details txiPzSxy3Pclsz6v` and assert all five:
  1. no node named `Split Out1`; 2. no node named `Loop Over Items`;
  3. **`Loop Over Items1` STILL EXISTS** (it is the unrelated media-egress loop — plan §3.1);
  4. `If6.main[1]` has **exactly one** target and it is `Aggregate1`;
  5. inbound edge sets are exactly `Aggregate1 ← {If6[1]}` and
     `not-found-error-message ← {Aggregate1[0], If-incoming-picker[1]}`.
- **Report the compared edge COUNT**, so empty checker output can never read as PASS (LESSONS §61b).
- Assertion 4 is the gate that catches the dead-end catastrophe. If it fails, stop — do not run §TL-1+.

### §TL-S2 ★ — the 1-tool invariant is enforced in CODE  — BLOCKING
- `tool-filter.jsCode` contains a single-element `return [{ json: … }]` and **no** `return { tools: … }`.
- The sort is **explicit** (`similarity` DESC, tiebreak `name` ASC) — not `tools[0]`. Plan §3.6/D9: the
  RAG sub SUMS similarity across `source_id`s, so `tools[0]` is not provably the maximum.
- `Execute 'sub-get-rag'`'s `limit` is still **5** (D6 rejected `limit:1` as a competing enforcement point).
- `Aggregate1.fieldsToAggregate` is **unchanged** (D5).
- `Call 'sub-get-results'`'s `tool` is still `={{ $json.name }}`.
- **No `is_test` leaf was added or copied anywhere** (LESSONS §48a).

### §TL-S3 — egress containment re-confirmed on the current clone (§0 S1/S3/S8, from JSON not memory)
5 orphaned (`send-message-files/-images/-video`, `update-human-intervened`, `save-session-vars`) + 1 sinked
(`Call 'sub-respond-save-message-redis'2 → tWm5DYLxfypmVC1T`, RPUSH `sorento-respond-message-TEST`); all 8
sendmsg callers → `ublq9nSlrpz63xan`; HI → `vUfFUDjLAuMaeQE6`. This change adds **zero** nodes and zero
credentialed nodes, so the assertion is that the sets are **unchanged**, which is falsifiable.

### §TL-S4 📌 — RECORD, do not fix: live calls the get-results TEST fork
Plan §6 / **P0**. Live `Call 'sub-get-results'` **and** `probe-incoming` point at `rysSPgUssLDf6xJc`
(`sub-get-results TEST`), not `Fss5aAaXthJSWpZCgKiKR`; `sibling-probe` alone uses live. Present in
live's published `activeVersion a40cd16d`, and in the 2026-07-23 backup. **This is out of scope.** The
reviewer will see it in the promote diff and must not silently "correct" it. Record with the three
corroborating sources; do not bundle.

---

## §TL-1 … §TL-7. HAPPY path, one case PER DOMAIN  (contact `437264483`, `scope: deterministic`)

Each: single-turn, `mock_reformulator_output` pinning `domain_hint`, real CRM read.
**Common assertions (all seven):**
- `runData['tool-filter'][0].data.main[0].length === 1`; the emitted item is **flat** (`.name` at top
  level, NOT `{tools:[…]}`).
- the resolved `tool` string passed to `Call 'sub-get-results'` is the domain's expected read tool, is in
  the READ allowlist, and is **never** `crm_it_support_ticket_create` (§0 **S4**, plan §6b/§10 TL-c).
- `_tool_pick` is recorded in the run log: `{chosen, rejected[], count}` — this is the per-turn artifact
  that makes plan §6(b)'s "data-dependent, not structural" risk observable.
- `If6` took **out0**; `central-exchange` ran; `Aggregate1` did **NOT** run; `compile-current-state`
  produced a non-empty `user_response`; `variables.last_result_set` is a non-empty `{idx,label,…}` array.
- §0 all, S6 = zero LLM nodes executed.

| id | domain | trigger (message) | expected tool |
|---|---|---|---|
| §TL-1 ★ | `inventory` | `check stock SRTWT5800` | `crm_inventory_stock_balance_list` |
| §TL-2 ★ | `incoming` | `pls check eta SRTWC286-SH-NEW-200` | `crm_incoming_stock_list` |
| §TL-3 | `product_attachment` | a packing-list / drawing request for a known product | the domain's attachment read tool |
| §TL-4 | `order` | an order-status query by SPO/order code | the order read tool |
| §TL-5 | `promotion` | a promotion enquiry (`srt79ss`-style code or promo name) | the promotion read tool |
| §TL-6 | `master_products` | a product-info / catalogue enquiry | the master-products read tool |
| §TL-7 | `portal_link` | a portal-link request | the portal-link read tool |

★ **§TL-1 is the flagship**: `inventory` is the ONLY domain that ever offered 2 tools (135/135 turns
pre-deletion). It must now resolve `crm_inventory_stock_balance_list` and **never**
`crm_inventory_warehouses_list` — assert the rejected candidate explicitly if the embedding is ever
re-added. Do not record the tool names for §TL-3…§TL-7 from memory; read them from the pre-change
baseline runs (P-BASE) — a guessed allowlist is not an allowlist.

---

## §TL-M1 … §TL-M7. ⭐ MISS turn PER DOMAIN — THE HIGHEST-RISK SET  (`437264483`, `deterministic`)

This is the path that used to exit via the loop's done branch. **Nothing else in this suite matters if
these fail.**

**Common assertions (all seven) — per-node runData ONLY, never status:**
1. `If6` took **out1**.
2. **`runData['Aggregate1'].length >= 1`** and its output `json` is `{response_intro:[<1 string>]}` —
   array length **1** (plan §3.3; nothing consumes the field, so length is asserted as an equivalence
   witness, not a contract).
3. **`runData['not-found-error-message'].length >= 1`**, and its output carries a **non-empty**
   `escalate_message`, plus `is_clarification` and `found_summary` keys.
4. The would-send `user_response` contains the domain's miss template **and** an escalate question.
5. `runData['Loop Over Items']` and `runData['Split Out1']` are **ABSENT** (the nodes no longer exist).
6. `central-exchange` did **NOT** run.
7. §0 all — S2 in particular: the escalate *offer* must not trigger an assignment (no `yes` sent).

| id | domain | trigger | notes |
|---|---|---|---|
| §TL-M1 ★★ | `inventory` | a stock query for a resolvable code with zero rows | **THE case.** Was the 2-tool 2-iteration path (live exec `11049139`). Now single-run. |
| §TL-M2 ★ | `incoming` | `check eta SRTWT5800` (no incoming) | Baseline for §TL-AGG; mirrors live exec `11060071`. |
| §TL-M3 | `product_attachment` | attachment request for a product with no attachment | the "missing attachment" arm |
| §TL-M4 | `order` | an order code with no matching order | |
| §TL-M5 | `promotion` | a promotion code with no match | |
| §TL-M6 | `master_products` | a product code with no catalogue entry | |
| §TL-M7 | `portal_link` | a portal-link request that yields nothing | if structurally reachable; if not, record **UNREACHABLE**, never infer a pass (LESSONS §56) |

### §TL-AGG ★ — `Aggregate1` output equality, MEASURED  — HARD GATE
- **Method:** compare post-change `Aggregate1` output `json` on §TL-M2 against the P-BASE pre-change
  capture and against live exec `11060071`'s `{response_intro:["No matching results found."]}`.
- **PASS:** the `json` objects are equal. **`pairedItem` divergence is EXPECTED and recorded** — the loop
  stamped `{sourceOverwrite:{previousNode:'If6',…}, item:0}`, direct wiring gives `{item:0}`; nothing
  downstream reads `pairedItem` (plan §3.2).
- ❌ FAIL on any `json` difference. This is the case that turns "byte-identical" from a claim into evidence.

### §TL-M-BYTE ★ — the miss MESSAGE is byte-identical to pre-change  — HARD REGRESSION GATE
Diff the full `user_response` of §TL-M1 and §TL-M2 against P-BASE. Only difference permitted: **none**.
The `dym-zerostock-itemize` / crossdomain noun work already fixed the wording; this change must not move
a single byte of it.

---

## §TL-D2 ★ — did-you-mean (D2 alternatives) still renders  — the case the change request MISSED
- **Trigger:** typo a product code so the CRM returns `alternatives[]` (e.g. a near-miss on a real code) ·
  `437264483` · real reformulator (**`scope: parser` run of a `deterministic` change** — precedent §ZS-6).
- **Why it is here:** `build-suggest-offer` lines ~294–309 **explicitly iterate the loop's runs** —
  `for (let ri = 0; ri < 25; ri++) { items = node.all(0, ri); … }` — to scan every tool's
  `alternatives[]`. This is the ONE genuinely load-bearing use of the loop (plan §3.8) and it is not in
  the change request's list.
- **Assert:**
  - a `Try:` / numbered-candidates block is present in `user_response`, sourced from
    `Call 'sub-get-results'` **run 0** (`alternatives` non-empty on run 0);
  - `build-suggest-offer` completed with **no node error** (the `node.all(0,1)` call must be caught by its
    own `catch → break`, not surface as a failure);
  - the numbering is contiguous and the pick contract intact (see §TL-DYM).
- **Recorded, not asserted:** the cross-run fallback (run 0 empty, run 1 non-empty ⇒ D2 from tool 2) is
  now unreachable. That behaviour was **wrong** — on the only multi-tool domain the 2nd tool was
  `crm_inventory_warehouses_list`, so its `alternatives` would have been warehouse-shaped strings shown
  as product suggestions. Record the loss deliberately (plan RR2).
- **Also assert the stale comment was corrected** in the same diff ("Multi-tool queries run get-results
  MORE THAN ONCE" is now false).

## §TL-DYM — did-you-mean round-trip: pick by number still resolves  (`chat-stateful`, `parser`)
- **Sequence:** §TL-D2, then reply `2`.
- **Assert:** the pick resolves against `last_result_set[1]` (idx 2), carried customer/date retained,
  `dym_offer` lifecycle intact. ❌ FAIL if the pick resolves to anything the cross-domain/sibling blocks
  contributed. This is the highest-value regression turn in the set (crossdomain manual script R6, and
  plan §3.8's downstream contract).

## §TL-CLR — clarify turn (vague mash) still clarifies  (`437264483`, `parser`)
- **Trigger:** `stock ah` (vague, non-confident).
- **Assert:** `Basic LLM Chain` clarification path taken; `central-exchange` fed from it; a clarification
  question is returned; **`Aggregate1` did NOT run**; no escalate offer. §0 all.

## §TL-RS — require-specific / disambiguation turn bypasses the whole subgraph  (`deterministic`)
- **Trigger:** a turn that sets `disallowed-entity-gate.require_specific === true`.
- **Assert:** `If3` took **out0**; `Execute 'sub-get-rag'` / `tool-filter` / `Call 'sub-get-results'` /
  `validator` / `If6` / `Aggregate1` **all ABSENT from runData**; the picklist renders. This proves the
  change is *structurally* invisible to the disambiguation path (crossdomain R8's reasoning, now an
  explicit assertion).

## §TL-ATT — attachment / media path unaffected  (`437264483`, `deterministic`)
- **Trigger:** a product-attachment turn that really returns a file (packing list / drawing).
- **Assert:** `central-exchange → if-got-attachments → Edit Fields → Split Out → Remove Duplicates →
  get-presigned-url → Loop Over Items1 → Switch` all ran; `Edit Fields`'s `$('validator')` read resolved;
  the attachment is represented in the egress log as `would_send` with a non-empty URL.
- **Explicitly assert `Loop Over Items1` RAN.** It is a *different* `splitInBatches` node on the media
  path — deleting it by name confusion is the obvious way to break this change (plan §3.1).
- §0 **S1** — all three `send-message-*` nodes remain orphaned; nothing sent.

## §TL-CONT — multi-turn continuity  (`chat-stateful`, `parser`)
- **Sequence:** any answered turn (§TL-1), then `how about SRTWC286-SH-NEW-200`.
- **Assert:** domain/entity carry works; `last_result_set` and `selection_context` evolve as before;
  `compile-current-state.variables` shape unchanged. The state chain is downstream of `If6 out0`, so this
  guards that the happy path's payload did not shift.

## §TL-ACC-noaccess — no-access contact still short-circuits  (contact `457216562`, `deterministic`)
- **Assert:** `check-access`/`If5` no-access side; the subgraph is never reached (`tool-filter` absent
  from runData); access-denied message returned. §0 all, S4 trivially.

## §TL-ACC-partial — ⛔ **BLOCKED** — partial / ask-for-access  (contact **TBD**)
Prerequisite P-CONTACT (plan §7.1). Record as **BLOCKED**, never as passed.

---

## §TL-EMPTY 📌 — zero tools from RAG: behaviour must be PRESERVED, and it is a pre-existing hole
- **Method:** two parts. (a) **Pre-change**, on the clone, drive a turn whose `domain_hint` matches no
  `mcp_tool` embedding (or pin `Execute 'sub-get-rag'`'s output to `{tools:[]}` via
  `prepare_test_pin_data` → `test_workflow`, LESSONS §34) and record exactly what happens.
  (b) **Post-change**, repeat and assert the behaviour is identical.
- **Expected (to be confirmed, not assumed):** `Split Out1` emitted 0 items ⇒ the loop body never ran ⇒
  `Aggregate1` never ran ⇒ **the turn dead-ended silently with a green execution and no reply.** The new
  `tool-filter` returns `[]` on empty, reproducing this exactly.
- 📌 **This is a PRE-EXISTING defect, deliberately not fixed** (plan D11/RR4): a customer gets no reply
  and no error is raised. Log it as backlog with the pre-change evidence attached, so the equivalence
  claim is measured and the hole is owned rather than inherited silently.

## §TL-SUM 📌 — RECORD: `sub-get-rag` SUMS similarity, so `tools[0]` ≠ provably-best
`sub-get-rag`'s final Code node collapses `source_id → name` and does `map[name].similarity += …`. Two
`source_id`s for one tool ⇒ summed score ⇒ `Object.values(map)`'s SQL best-first order can be wrong.
- **Assert:** `tool-filter` sorts explicitly (covered by §TL-S2), so the selection is correct even under
  summation.
- **Record:** every tool observed today has ONE `source_id`, so sort-vs-`[0]` currently agree. That is a
  `green-that-cannot-fail` shape — the assertion is only meaningful because §TL-FP3 forces it red.
- Backlog: the real fix (max instead of sum) belongs in `sub-get-rag`. Do not bundle.

---

## §TL-FP. FAIL-ON-PURPOSE — prove each critical assertion can go RED
Per memory `green-that-cannot-fail` and LESSONS §61: an assertion never shown to fail is not an
instrument. **All three must be demonstrated RED, evidence recorded, and REVERTED immediately.** Do each
on the clone, one at a time, re-publishing the correct build after each.

### §TL-FP1 ★★ — leave `If6 out1` UNWIRED and prove the miss suite catches it  — THE MANDATORY ONE
- **Do:** remove the `If6 [main 1] → Aggregate1` connection. Publish. Re-run **§TL-M1 and §TL-M2**.
- **MUST observe:** `runData['Aggregate1']` **absent**; `runData['not-found-error-message']` **absent**;
  no reply in the egress log — **and the execution reports `status: success`**.
- **The instrument being validated is the runData assertion, not the status.** Record the green status
  side by side with the absent nodes: that pairing is the whole reason §TL forbids status-based scoring.
  If §TL-M1/M2 report PASS in this state, **the entire miss suite is void** and must be rewritten before
  anything is promoted.
- **Revert immediately** and re-run §TL-S1 + §TL-M1/M2 green.

### §TL-FP2 ★ — make `tool-filter` emit the OLD `{tools:[…]}` shape and prove the tool assertion catches it
- **Do:** temporarily `return { tools: [best] }` instead of `return [{json: best}]`. Publish. Run §TL-1.
- **MUST observe:** the resolved `tool` passed to `Call 'sub-get-results'` is **`undefined`/empty**; and —
  the point of the case — `Call 'sub-get-results'` (`alwaysOutputData:true`, `onError:continueErrorOutput`)
  still yields an item that flows into `validator`, so the turn produces a **plausible but wrong** reply
  with a green execution (LESSONS §61a). §TL-1's `tool`-string assertion must FAIL.
- **Revert immediately.**

### §TL-FP3 ★ — feed 3 tools and prove the arity is enforced by CODE, not by the index
- **Do:** pin `Execute 'sub-get-rag'`'s output to `{tools:[{name:A,similarity:0.9},{name:B,similarity:0.8},
  {name:C,similarity:0.95}]}` via `prepare_test_pin_data` → `test_workflow` (no index mutation, no egress).
- **MUST observe:** `tool-filter` emits **exactly 1 item**, and it is **C** (0.95) — i.e. the explicit sort
  ran and `tools[0]` (A) was NOT taken. Downstream nodes each have exactly 1 run;
  `sorento-sub-respond-sendmsg-respond2` has ≤1 run.
- **This is the case that proves the 1-tool invariant is structural** (plan §4) and simultaneously proves
  D9's sort is real (§TL-SUM would otherwise be untestable). Without it, §TL-1…§TL-7 all pass on an index
  that happens to hold one row — a green that cannot fail.
- No revert needed (pin-only, nothing published).

---

## §TL-R. Manual regression set (extends `tests/crossdomain-manual-test-script.md` §5b R1–R10)

The splice sits on the path every turn takes, so the regression set is the same population as
crossdomain's plus the arity cases. Re-run **all** of these post-change; each records an exec id.

| id | trigger | must be |
|---|---|---|
| §TL-R1 | `check stock SRTWT5800` (product WITH stock) | normal answer, byte-identical to pre-change, no block |
| §TL-R2 ★ | an inventory miss with no cross-axis data | `No stock records found for: X.` **byte-identical to live** — the strongest single gate for both this change and the crossdomain hoist |
| §TL-R3 | an **order** enquiry | untouched — routing, no block, 1 tool |
| §TL-R4 | a **promotion** enquiry | untouched |
| §TL-R5 | a **complaint** / escalation turn | untouched; escalate phrase still from `escalate-catalog`, not doubled |
| §TL-R6 ★★ | a **did-you-mean** turn, then pick by number | = §TL-D2 + §TL-DYM. **Highest-value regression turn** — the D2 arm is the multi-run consumer (plan §3.8) |
| §TL-R7 | a **clarify** turn (`stock ah`) | = §TL-CLR |
| §TL-R8 | a **require-specific / disambiguation** turn | = §TL-RS |
| §TL-R9 | a product-attachment / packing-list turn | = §TL-ATT; `Loop Over Items1` ran |
| §TL-R10 | multi-turn: answered turn, then `how about X` | = §TL-CONT |
| §TL-R11 ⭐ NEW | an **AND-mode** turn (`stock for A and B`) | itemised miss line names the RIGHT products. The crossdomain hoist's equivalence was proven by inspection on **OR-mode only**; AND-mode was never sampled and now flows through changed wiring too |
| §TL-R12 ⭐ NEW | any turn, checked for arity | `sorento-sub-respond-sendmsg-respond2` has **exactly 1 run**. Cheap; guards the two-messages-to-one-customer failure |

---

## §TL-X. Cross-domain feature re-runs (it sits on this path) — see plan §9 Amendment B

`cross-domain-stock-incoming` is **REQUEST-CHANGES / not promoted**, and its splice
(`validator → zeroset → gate → {probe→render|} → If6`) sits directly on the rewired path. Loop removal
goes FIRST (plan §9), so the whole X-suite is re-run on the loop-free clone. Two cases **change meaning**:

| id | before | after loop removal |
|---|---|---|
| **§TL-X-T3** (was T3/F3, double probe) | "expect **2** probe runs; `executeOnce` is INERT; finding confirmed unfixed" | **assert `runData['crossdomain-probe'].length === 1`.** Structurally single-run. Also: **remove** the dead `executeOnce:true`, and **DO NOT** add the proposed `{{ $runIndex }} === 0` gate to `crossdomain-gate` — it would be permanently true, i.e. a condition that can never go false on the node deciding whether the probe runs |
| **§TL-X-T4** (was T4/F4, false cross-domain block) | open, unfixed, untested: per-tool `returnedCodes` vs per-turn `missing` ⇒ an answered turn could claim cross-domain stock and arm the escalate offer | **assert `runData['crossdomain-zeroset'].length === 1`** ⇒ the runs cannot disagree ⇒ **impossible by construction.** Closes F4 with no zeroset redesign |

Re-run, in priority order, each with an exec id: **T1** (marker anchoring), **T2** (`_xdApplied` absent),
**T3**, **T4**, **X1**, **X3**, **X4/X11a/X11b**, **X2**, **X9**, **X10**, then **X6/X7/X8** (console,
multi-turn). `crossdomain-render`/`compose` pin to run 0 via `.first()`, so the block content on a 1-tool
turn is unchanged — assert that, don't assume it.

---

## Coverage / notes (this change)

| requirement | covered by |
|---|---|
| one case per domain (7) | §TL-1 … §TL-7 |
| **miss turn per domain (7)** — the highest-risk path | §TL-M1 … §TL-M7 + §TL-AGG + §TL-M-BYTE |
| did-you-mean | §TL-D2 (render) + §TL-DYM (round-trip) |
| clarify | §TL-CLR |
| require-specific | §TL-RS |
| attachment | §TL-ATT |
| multi-turn continuity | §TL-CONT |
| cross-domain X-cases | §TL-X |
| 1-tool invariant is structural | §TL-S2 + §TL-FP3 |
| miss path genuinely exercised / dead-end would be caught | §TL-FP1 (mandatory) |
| R1–R10 reused + extended | §TL-R (adds R11 AND-mode, R12 arity) |
| access branches | §TL-ACC-noaccess; §TL-ACC-partial **BLOCKED** (contact TBD) |
| pre-existing holes owned, not inherited | §TL-EMPTY (0 tools), §TL-SUM (summed similarity), §TL-S4 (live→TEST fork) |

**Tier:** `deterministic`. §TL-D2 / §TL-DYM / §TL-CLR / §TL-CONT are **parser-tier runs of a
deterministic change** (they need real classification) — declare them so they don't pollute the S6
zero-LLM count. §TL-FP3 and §TL-EMPTY(a) use `prepare_test_pin_data` → `test_workflow`: no seed, no
egress, ~0 token.

**Not covered on the clone — flag for post-promote** (LESSONS §56): live's `save-session-vars` (the prod
conversation-variables PUT) is a *different node* from the clone's `pg-upsert-session`, and it is fed by
`compile-current-state`, which builds a **whitelisted** output object — so this change cannot pollute the
PUT body (contrast crossdomain **F2**). Verified by reading `compile-current-state` lines 482–526; assert
it again post-promote on one real miss turn rather than trusting the reading.

---

# Change: `crossdomain-attachment` (deliver the packing list on cross-domain INCOMING turns)

Plan: `../plans/crossdomain-attachment-plan.md`. **Scope: `deterministic`** for every case below unless a
case says otherwise. Contact `437264483` (FULL access). Build/test target = clone `txiPzSxy3Pclsz6v`
(layered on the `cross-domain-stock-incoming` build, clone `a0f434f9`) — **never live**.

Every case is bound by **§0 (S1–S8)**. §0 is the acceptance gate: a §0 failure is a hard fail and halts the
run, regardless of functional result.

## §XA — ⚠️ SCOPE NARROWED 2026-08-04 (user decision). Read before running anything.

The **"delivered exactly once"** framing is **WITHDRAWN**, and **§XA-FP1 is DROPPED**.

**Why (user, 2026-08-04):** duplicate suppression is already handled, three ways —
1. **Single root (structural).** `central-exchange[0] → if-got-attachments` was CUT; only `attach-merge`
   feeds the chain. The double-send FP1 chased existed *only* because FP1 artificially re-added the old edge.
2. **`Remove Duplicates`** on `url`, within the run.
3. **The CRM already de-dupes** on `(url, filename)` upstream (`sorento_crm_mcp/presenters.py:696-707`).

Plus main-answer and probe attachments can never both be non-empty — a turn has ONE `domain_hint`.

⚠️ **Keep straight which layer protects you:** `Remove Duplicates` dedupes *within a single chain run*. It
would NOT save you if the chain ran twice. That case is excluded **structurally** (one root), not by dedupe.
If anyone ever adds a second root, this protection is gone and nothing here will catch it.

**Empirically established before the withdrawal:** an induced genuine double-send still read **A-COUNT = 1**.
So A-COUNT is **not** a double-send detector, exactly as §XA-FP1's own escape hatch predicted. Do not use
A-COUNT to assert cardinality of any kind until it is re-instrumented.

### What §XA still has to prove
The remaining risk is **the feature silently not working**, not double-sending:
- **PRESENCE** — a file actually arrives on a cross-domain turn (**§XA.1**) and the pre-existing direct-eta
  turn still delivers after the re-rooting (**§XA.9** — highest value; its failure mode is *0 files with a
  green execution*).
- **NO SILENT CAP** — N containers ⇒ N files (**§XA.5**). The user explicitly accepted N files; a silent cap
  would be a quiet breach of that.
- **NEGATIVE CASES** unchanged — **§XA.6** (on-hand ⇒ no file), **§XA.7** (both empty ⇒ no file, no block).
- **PRESIGN FAILURE** (§A6 / **§XA-FP4**) — unchanged and still mandatory: a dropped file now leaves the
  customer reading *"I have attached the file(s) below."*, so this is the one path where a failure makes the
  bot state something **false**.

### Re-instrument before asserting any count
Do not count via A-COUNT. Count **`would_send` records in `test:egress:{test_run_id}`, keyed by `filename`** —
`guard-e/f/g-record` already write `presigned_url` + `filename`, one record per delivered file. Corroborate
with `runData['guard-g-record']` run count. Presence assertions (0 vs ≥1) are the floor; cardinality
assertions are only valid once this replacement is shown to distinguish 1 from 2 on a deliberately doubled
fixture.

---

## §XA.0 — How these cases are driven, and three rules that decide whether the results mean anything

**Driver: `tests/harness/drive-clone.py` (→ `zz-canary-run`, `POST /webhook/zz-run-hint`, mode `uac`).
NOT the chat console.** `guard-e/f/g-record` key their egress list off
`$('redis-pop-main-message-list').first().json.message.test_run_id`, which the console lane never seeds —
a console run produces no usable `test:egress:{…}` key. The console (`zz-chat`,
`https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`) is for a human
to **eyeball the 📎** via `chat-attach-push`, and for nothing else.

1. **Discard the first run after any workflow write.** A run fired seconds after a publish can execute the
   previous version. This already produced one false PASS on the sibling change.
2. **Record `case → executionId` for every case.** The `cross-domain-stock-incoming` review could not
   attribute most of its GREENs to a build. Do not repeat that.
3. **Never assert on execution status.** `get-presigned-url` has `onError: continueErrorOutput` with an
   **unwired `main[1]`**, and the CRM returns 404 for a path with no attachments row
   (`presigned_require_attachment_row`, `config.py:90`). A dropped file leaves the execution `success`.
   Assert **per-node runData** (LESSONS §61a).

**The four assertions every file-bearing case must carry** (all four, or the case is incomplete):

- **A-COUNT** — number of `{"kind":"would_send","guard":"send-message-files|images|video"}` entries in
  `test:egress:{test_run_id}` equals the expected N. Count entries, not "at least one".
- **A-NAME** — each entry's `payload.filename` and `payload.presigned_url` match the expected file;
  `presigned_url` is well-formed and carries `X-Amz-Signature`.
- **A-NODES** — `get-presigned-url` runData: run count == N, **every** run `executionStatus:"success"`.
  `Loop Over Items1` run count == N+1. `Switch` run count == N.
- **A-ORDER** — `executionIndex(sorento-sub-respond-sendmsg-respond2) < executionIndex(if-got-attachments)`.
  Text before file. (Baseline: exec `11081877` 42 < 47; exec `11081513` 44 < 48.)

**Ground truth (live CRM, drifts — re-verify before the run):**

| fixture | expect today |
|---|---|
| `SRTWC286-SH-NEW-200` | no on-hand stock; incoming 200 pcs, ETA 2026-07-22, container `FFAU3176932`, attachment `FFAU3176932.xlsx` (`https://cdn-sorento.com/packing_list/580150de-a767-4dde-a133-de5e31ccb90d/FFAU3176932.xlsx`, `…spreadsheetml.sheet`) |
| `SRTWT5800` | no incoming; on-hand in 6 locations; inventory envelope `attachments: []` |
| `SRTWT5800-FH` | no incoming AND no stock (both-empty) |
| `SRTWT5801` | on-hand 883 @ BRW; `attachments: []` |
| `SRTUB6213` | certification turn, 2 PDFs (the pre-existing attachment regression fixture, exec `11081877`) |

---

## §XA.1 — Total miss, single product → file delivered exactly once  ★ PRIMARY
- **Trigger:** `check stock SRTWC286-SH-NEW-200` · `437264483` · `scope: deterministic`.
- **Expect-branch:** `validator(has_result:false)` → `crossdomain-zeroset(_xd.active:true, origin=inventory)`
  → `crossdomain-gate` TRUE → `crossdomain-probe` → `crossdomain-render(_xdBlock.any:true)` →
  `If6` output **1** → `Aggregate1` → … → `cs-offer-gate[1]` → `compile-current-state` →
  `crossdomain-compose` → `sendmsg2` → **`attach-merge`** → `if-got-attachments` TRUE → `Edit Fields` →
  `Split Out` → `Remove Duplicates` → `get-presigned-url` → `Loop Over Items1` → `Switch` out **2** →
  `guard-g-record`.
- **Expect-output:** **A-COUNT = 1**, A-NAME = `FFAU3176932.xlsx`, A-NODES (1/2/1), A-ORDER.
  `central-exchange` has **no runData** (the miss branch — this is the whole point of the change).
  `attach-merge.attachments.length === 1`, sourced entirely from `_xdBlock.attachments`.
- **Also assert:** the delivered `user_response` still contains the frozen phrase
  `Would you like me to escalate to warehouse team?` byte-unchanged, and the block still sits above it.
- **Safety:** §0 all. S1 focus: `send-message-files/images/video` inbound count still **0** in the deployed
  clone JSON.

## §XA.2 — Partial inventory turn → file delivered exactly once
- **Trigger:** `check stock SRTWT5801 and SRTWC286-SH-NEW-200` · `437264483` · `deterministic`.
- **Expect-branch:** answered branch — `If6` output **0** → `central-exchange` runs; `_xd.missing` =
  `[SRTWC286-SH-NEW-200]`; `crossdomain-compose` takes the **isAnswered** arm (block + phrase +
  `Yes escalate,No it's okay` quick replies).
- **Expect-output:** **A-COUNT = 1** (`FFAU3176932.xlsx`), A-NAME, A-NODES, A-ORDER.
  `attach-merge.attachments` = `[]` (from `central-exchange`, inventory answer) **+** 1 (from the block).
- **Safety:** §0 all.

## §XA.3 — Partial INCOMING turn where the main answer already carries the same file → exactly once  ★
- **Trigger:** `check eta for SRTWT5800 and SRTWC286-SH-NEW-200` · `437264483` · `deterministic`.
  (This is the turn the change request named as the duplicate risk.)
- **Expect-branch:** `origin = incoming`. Main answer covers `SRTWC286-SH-NEW-200` **with** its xlsx;
  `_xd.missing = [SRTWT5800]`; probe = **inventory** → `attachments: []`.
- **Expect-output:** **A-COUNT = 1**, A-NAME = `FFAU3176932.xlsx`, A-NODES (1/2/1), A-ORDER.
  **And the provenance assertion:** `attach-merge` runData shows the entry came from `central-exchange`
  (main answer), and `crossdomain-render._xdBlock.attachments` is `[]`. If the file were counted twice the
  block side would have to have contributed — assert it did not, so a PASS here cannot be produced by two
  cancelling errors.
- **Note:** this case is expected to be **inert** — behaviour identical to pre-change. Its value is
  entirely in proving the duplicate cannot arise; it is meaningless on its own and must be read next to
  §XA.1 (LESSONS: a no-op passes on an inert build).
- **Safety:** §0 all.

## §XA.4 — Two missing products, ONE container → dedupe on `url`
- **Trigger:** a `check stock A and B` turn where A and B are both empty on hand and both ship in
  container `FFAU3176932` (pick the pair from the live CRM at run time — verification task **V1**).
  · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 1** — one file, not two. Record `Split Out` output item count and
  `Remove Duplicates` output item count **separately**: if Split Out already emitted 1, the CRM deduped at
  envelope level and `Remove Duplicates` did nothing. **Record which**, do not report "dedupe works"
  without it. FPA-2 settles it.
- **Safety:** §0 all.

## §XA.5 — Multiple missing products, DIFFERENT containers → N files, nothing silently capped
- **Trigger:** a `check stock A, B, C` turn where ≥2 of them are empty on hand with incoming in
  **different** containers · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = N** where N = distinct `url`s in the probe envelope. Record N.
  A-NODES with that N (`Loop Over Items1` = N+1 runs). Assert **no truncation**: every distinct `url` in
  `crossdomain-render._xdBlock.attachments` appears in the egress log.
- **Also assert (the §3.3 residual):** every delivered filename corresponds to a product that actually
  appears in `_xdBlock.block`. A file for a probed-but-unrendered product is a **finding**, not a pass.
- **Safety:** §0 all.

## §XA.6 — On-hand direction (origin = incoming) → NO file from the block
- **Trigger:** `check eta SRTWT5800` · `437264483` · `deterministic`.
- **Expect-branch:** `origin = incoming`, probe = `crm_inventory_stock_balance_list`, block renders the
  6 on-hand locations.
- **Expect-output:** **A-COUNT = 0.** `if-got-attachments` FALSE. `get-presigned-url` run count **0**.
  `crossdomain-render._xdBlock.attachments === []`. The text block is unchanged from the
  `cross-domain-stock-incoming` baseline **byte-for-byte**.
- **Safety:** §0 all.

## §XA.7 — Both axes empty → no file, no block  (decision (d))
- **Trigger:** `check stock SRTWT5800-FH` · `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 0**; `get-presigned-url` runs **0**; `if-got-attachments` FALSE or not
  executed; `_xdBlock = {block:"", any:false, …}`; `crossdomain-compose` returned the item unchanged;
  **no `_xdApplied` key** (F2 stays discharged); message byte-identical to the pre-change baseline.
- **Read next to §XA.1** — this passes on a completely inert build and proves nothing alone.
- **Safety:** §0 all.

## §XA.8 — No-op turns → `attach-merge` is byte-equal to today's source
- **Triggers (one run each, `437264483`, `deterministic`):**
  (a) non-{inventory,incoming} domain (an order or promotion enquiry);
  (b) non-`business_query` (a casual/thank-you turn);
  (c) fully answered inventory turn, nothing missing (`check stock SRTWT5800`);
  (d) container-only turn (`FFAU3176932`);
  (e) a `require_specific` / disambiguation turn;
  (f) a no-access turn (contact `457216562`).
- **Expect-output:** for every one — `attach-merge.attachments` **deep-equals**
  `central-exchange.attachments` (same order, same objects) when `central-exchange` ran, and `[]` when it
  did not. A-COUNT equals the pre-change baseline for that turn (normally 0). `crossdomain-render` never
  executed.
- **Safety:** §0 all. (f) additionally asserts S1/S2 on the no-access path.

## §XA.9 — REGRESSION: existing attachment turn survives the re-rooting  ★ HIGHEST-VALUE
- **Trigger:** the certification turn that produced exec `11081877` (2 PDFs for `SRTUB6213`) ·
  `437264483` · `deterministic`.
- **Expect-output:** **A-COUNT = 2**, same two filenames, **same order** as the pre-change baseline;
  A-NODES (`get-presigned-url` 2 runs both success, `Loop Over Items1` 3 runs, `Switch` 2 runs); A-ORDER.
- **Why this one matters most:** the change moves the trigger of the attachment chain for *every* existing
  file turn. If `attach-merge` mis-sources or the repointed `Edit Fields` is wrong, this goes to 0 files
  **with a green execution**. Run it on every build.
- **Safety:** §0 all.

## §XA.10 — Probe soft-fail → no file
- **Trigger:** §XA.1's message with `crossdomain-probe` forced into its degraded path (bogus tool string
  or a forced sub error; `onError: continueRegularOutput` means it still emits an item).
- **Expect-output:** `_xdBlock.degraded === true`, `any === false`; **A-COUNT = 0**;
  `get-presigned-url` runs 0; message byte-identical to the pre-change baseline (fail-silent, plan F1).
- **Safety:** §0 all.

## §XA.11 — Frozen-phrase + marker contract untouched
- **Trigger:** re-use §XA.1, §XA.2 and the F1 multi-token turn `check stock CSS8800, SRT393B-18, SRTMRL707`.
- **Expect-output:** `crossdomain-compose.user_response` is **byte-identical** to the
  `cross-domain-stock-incoming` baseline for each of those turns (this change adds no text — unless
  `D-ATTACH-MENTION` is taken, in which case re-baseline X1/X3/T1 and say so explicitly in the run log).
  The block still sits **above** the escalate question on the multi-token turn.
- **Safety:** §0 all.

---

## §XA-FP — Fail-on-purpose: prove each assertion can go RED

Per `green-that-cannot-fail`: an assertion never shown to fail is not an instrument. Each FPA below is
**induced on the clone, observed red, then reverted**, and the reverted state re-verified by re-running the
matching positive case. Record the executionId of both the red run and the restored run.

### §XA-FP1 — ~~"delivered exactly once" can detect a DOUBLE send~~  **DROPPED 2026-08-04 (user decision)**

**Do not run this case.** Duplicate suppression is handled structurally (single root) + `Remove Duplicates`
+ CRM-side dedupe — see the §XA scope banner at the top of this section. Kept below for the record only,
because running it once already paid for itself: it induced a real double-send and **A-COUNT still read 1**,
proving the counting instrument is blind. That finding is why cardinality assertions now require the
`test:egress` + `filename` replacement instead.

⚠️ It also cost an incident: the agent running it was killed mid-case, reverted the **draft** but never
published, and left the clone's **ACTIVE** version carrying the injected second root. A REST GET looked
clean; only `.activeVersion.connections` showed it. Any graph-mutating case must publish both the mutation
and the revert (or use REST PUT, which auto-publishes).

<details><summary>original case (do not run)</summary>
- **Induce:** temporarily **re-add** `central-exchange`[0] → `if-got-attachments` while keeping
  `attach-merge`[0] → `if-got-attachments`. Both roots now fire on the **answered** branch.
- **Run:** §XA.3 (`check eta for SRTWT5800 and SRTWC286-SH-NEW-200`) — an answered turn that carries a file.
- **Expect RED:** `if-got-attachments` runs **twice**; `get-presigned-url` runs 2×; **A-COUNT = 2** with the
  **same** `filename` twice. If A-COUNT still reads 1, the counting assertion is broken — fix the assertion
  before trusting any XA case.
- **Restore:** cut the extra edge; re-run §XA.3 → A-COUNT back to 1.
- **Note:** `Remove Duplicates` does **not** save you here — the two roots produce two separate
  *executions of the chain*, and dedupe is within a single node run. That is exactly why this fixture is
  the right one.
</details>

### §XA-FP2 — is `Remove Duplicates` actually load-bearing?
- **Induce:** `setNodeDisabled` on `Remove Duplicates`.
- **Run:** §XA.4 (two products, one container).
- **Expect:** A-COUNT rises 1 → 2 ⇒ the node is doing the work. If A-COUNT **stays 1**, the CRM already
  deduped at envelope level ⇒ record that as the true reason and downgrade the §XA.4 claim from "our dedupe
  works" to "no duplicate is produced upstream". Either outcome is a valid result; **silently reporting the
  first is not.**
- **Restore:** re-enable; re-run §XA.4.

### §XA-FP3 — the by-name repoint is load-bearing (the silent-zero failure)
- **Induce:** revert `Edit Fields` to `={{ $('validator').first().json.attachments }}`, keep the new wiring.
- **Run:** §XA.1.
- **Expect RED:** `Split Out` emits **0** items; **A-COUNT = 0**; `get-presigned-url` runs 0 — while the
  block is present in the text and the execution reports **`success`**. This is the demonstration that a
  status-based check would have scored this build green.
- **Restore:** repoint to `={{ $json.attachments }}`; re-run §XA.1 → A-COUNT 1.

### §XA-FP4 — a silent presign failure is detectable
- **Induce:** point `get-presigned-url` at a `file_path` with no attachments row (the CRM returns 404 under
  `presigned_require_attachment_row`), leaving `main[1]` unwired as it is today.
- **Run:** §XA.1.
- **Expect RED:** `get-presigned-url` run 1 with `executionStatus:"error"`; **A-COUNT = 0**; execution
  status still **`success`**. Assert that **A-NODES catches it and a status check does not.**
- **Restore:** revert; re-run §XA.1.

### §XA-FP5 — decision (d) can be broken
- **Induce:** temporarily drop the `xb.any !== true` guard in `attach-merge` so it forwards
  `_xdBlock.attachments` regardless.
- **Run:** §XA.7 (both empty) and §XA.10 (soft-fail).
- **Expect RED:** a file (or at minimum a `get-presigned-url` run) appears on a turn that says nothing.
  Confirms §XA.7/§XA.10 are not passing merely because the build is inert.
- **Restore:** re-add the guard; re-run both.

### §XA-FP6 — the S1 orphan assertion can go red
- **Induce:** in a **scratch copy** of the clone (never the clone itself), add
  `Switch`[2] → `send-message-files`.
- **Expect RED:** the inbound-edge census reports `send-message-files` inbound = 1.
- **Purpose:** proves the S1 instrument reads the deployed connection map rather than echoing an
  expectation. Discard the scratch copy.

---

### Coverage (this change)

| requirement | case |
|---|---|
| single-product cross-domain incoming, file delivered once | §XA.1 |
| partial turn where main already carries the same file, delivered exactly once | §XA.3 + §XA-FP1 |
| multi-product fan-out, N files, nothing capped | §XA.5 (+ §XA.4 for the same-container collapse) |
| on-hand direction, no file | §XA.6 |
| both-empty, no file and no block (decision (d)) | §XA.7 + §XA-FP5 |
| no-op turns unchanged | §XA.8 |
| existing attachment turns unchanged (the re-rooting regression) | §XA.9 |
| probe soft-fail | §XA.10 |
| frozen phrase / marker placement untouched | §XA.11 |
| assertions on the egress log, not the chat rendering | §XA.0 A-COUNT / A-NAME (all cases) |
| text before file | §XA.0 A-ORDER (all file-bearing cases) |
| every critical assertion shown red | §XA-FP1…FP6 |

**Tier:** `deterministic`. §XA.3, §XA.4, §XA.5 and §XA.8(a)(b)(e) need real classification to reach the
right domain/branch — declare those as **parser-tier runs of a deterministic change** so they do not
pollute the S6 zero-LLM count (same convention as the `tool-loop-removal` section).

**Blocked / not covered on the clone — carry to post-promote (LESSONS §56):**
- The **real send** is unprovable here: `send-message-files/images/video` are orphaned by design, so every
  case above proves the *decision* to send, never the send. Post-promote smoke on the cross-domain path
  **and** on a pre-existing certification turn is mandatory.
- **Partial-access behaviour** remains blocked — no partial-access test contact exists. This is now
  load-bearing, not cosmetic: **RISK-A1** (plan §7) is precisely a partial-entitlement question, and it
  cannot be exercised until that contact exists. Flag as a **prerequisite**, not a gap.
- The **live `save-session-vars` PUT** is a different node from the clone's `pg-upsert-session`. This change
  writes nothing onto `crossdomain-compose`'s item, so the PUT body should be byte-identical — verify it on
  one real turn post-promote rather than trusting the reading.

## §DP-0 — Preconditions (build-time GO/NO-GO, read-only, run BEFORE any wiring)  `scope: deterministic`

> Change `dym-probe-before-offer`. Design: `plans/dym-probe-before-offer-plan.md`.
> Every §DP case runs against the clone `txiPzSxy3Pclsz6v` in **`mode=regress-capture`** with the
> `respond_contacts_test` row reset between independent cases (LESSONS §31; memory
> `uac-mode-reads-prod-session` — `437264483`'s PROD session is stale-contaminated and `uac` mode reads
> it, which has silently produced wrong-question answers twice). Contact `437264483` (FULL access).
> **§0 applies to every case below.** Each case's §0 line is stated once here and inherited: S1 no send
> (the D1 render never reaches a credentialed send node on the clone); S2 no assign/SLA/PIC; S3 the 5
> orphaned + 1 sinked containment re-asserted from JSON; **S4 the probe tool is a READ tool** — assert
> the `tool` string passed to `dym-probe` is exactly `crm_master_product_attachments_list` or
> `crm_inventory_stock_balance_list` and never a `_create`/write tool; S5 `is_test/test_mode === true`
> on every sub call including `dym-probe`; S6 `deterministic` ⇒ **zero LLM nodes executed**;
> S7a TEST-sink delta accounted, S7b prod-sink delta zero via **both** the per-poll `LLEN` series and the
> per-poll pop payload, execution ids recorded; S8 no `is_test:false` run against any fork containing a
> credentialed node type.
>
> **Assert per-node `runData`, never execution status** (LESSONS §61a, memory
> `unwired-error-output-masks-failure`): an unwired error output makes a failed run report `success`.
> Every case names the node and the key it asserts.

- **§DP-0a (= plan §6-DP-V1) — attachment scoping uuid exists.** From a real live execution of a
  `product_attachment` certificate turn, read `disallowed-entity-gate` runData
  `.compatible_entities`. **Assert:** ≥1 entity with `entity_type ∈ {attachment_type, certificate}` AND
  a UUID-shaped `uuid`. **Report the whole array and its length** — an empty printout is not a pass.
  **FAIL ⇒ `product_attachment` ships DISABLED in `DOMAIN_PROBE`; §DP-1..§DP-4 are then N/A, not
  skipped-green.** Rationale: `disallowed-entity-gate.js:59-64` unions resolver entity types with raw
  parser hints, so the gate can pass with no uuid at all, and the probe then returns every attachment of
  every type → "has certificate" on a brochure-only product.
- **§DP-0b (= §6-DP-V2) — attachment probe envelope.** Read-only `crm_master_product_attachments_list`
  with a known `product_ids` + `attachment_type_ids`. **Assert:** `answers[].title` is a product code
  and `fields` carries both `Product Code` and `Attachment Type`. **Then repeat with
  `attachment_type_ids` OMITTED and assert the rows carry MIXED `Attachment Type` values** — this is the
  positive observation that the false-positive mode is real and is what `dym-annotate` layer 2 keys on.
- **§DP-0c (= §6-DP-V3) — inventory envelope + genuine zero.** Read-only
  `crm_inventory_stock_balance_list`. **Assert:** `Product Code` and `Quantity On Hand` present and
  numeric-parseable. **Find and record at least one product code whose rows sum to 0** — that code is
  the fixture for §DP-14. If no genuine-zero product can be found, §DP-14 is **blocked**, not passed.
- **§DP-0d (= §6-DP-V5) — probe target id.** From the clone workflow JSON (**not** memory, **not** MCP
  `get_workflow_details`'s redacted view): `dym-probe.workflowId.value === 'rysSPgUssLDf6xJc'`, and no
  `probe-incoming` parameter was copied into it. Live target would be `Fss5aAaXthJSWpZCgKiKR`;
  `probe-incoming` and `Call 'sub-get-results'` point at the TEST fork on LIVE and must never be the
  copy source.

## §DP-1 — product_attachment · SOME candidates have the document  `scope: deterministic`

- **Trigger:** `ibwc8315-s10 cert` (contact `437264483`) — a real measured dead-end. Pin
  `mock_reformulator_output`: `message_type:business_query`, `domain_hint:'product_attachment'`,
  entities = `[{raw:'ibwc8315-s10', hint:'product'}, {raw:'cert', hint:'attachment_type'}]`. Pin
  `resolve-entity.resolutions` to ONE genuine-miss token `ibwc8315-s10`, `resolved:false`, no exact
  match, `matches` = 3 non-exact product candidates each with a UUID-shaped `uuid`
  (`IBWC8315-S`, `IBWC8315-SL`, `IBWC8315-S10-P`). Pin `disallowed-entity-gate.compatible_entities` to
  include a UUID-shaped `attachment_type` (or `certificate`) entity. Pin the `dym-probe` answer set so
  **exactly one** candidate (`IBWC8315-SL`) has a row with a non-empty `Attachment Type`.
- **Expected branch/path:** `sibling-gate[1] → dym-transform → dym-gate[0] → dym-probe → dym-annotate →
  build-suggest-offer`. `dym-transform.probe_needed === true`; `dym-gate` takes output 0;
  `dym-annotate.dym_probe_meta.ok === true`.
- **Structural assertions (per-node runData):**
  - `dym-transform`: emits **exactly ONE item**; `probe_tool === 'crm_master_product_attachments_list'`;
    `probe_predicate === 'row_present_with_type'`; `dym_probe_entities` contains all 3 candidate
    products **and** the `attachment_type`/`certificate` entity, every one with a UUID-shaped `uuid`.
  - `dym-probe`: input `tool` equals the string above (**S4**); input `entities` is
    `dym-transform.dym_probe_entities` (not `compatible_entities`).
  - `dym-annotate`: output carries `escalate_message`, `is_clarification` and `found_summary` from
    `not-found-error-message` (**the load-bearing property** — proves the not-found payload was not
    replaced by the probe payload); `dym_available_codes === ['ibwc8315-sl']`;
    `dym_probe_meta.probed` has all 3 codes.
  - `build-suggest-offer`: `suggest_response` contains `IBWC8315-SL — has certificate` and both others
    `— no certificate`; **`IBWC8315-SL` is rendered FIRST** (has-first sort);
    `suggest_offer === true`; `suggest_selection_context === 'suggest_offer'`.
  - **`suggest_quick_reply` is `IBWC8315-SL,IBWC8315-S,IBWC8315-S10-P,Yes escalate,No it's okay`** — bare
    codes, no ` — has …` suffix anywhere in it, no stray comma.
  - `suggest_last_result_set` and `dym_candidates` are rebuilt from the **sorted** picks: entry `idx:1`
    is `IBWC8315-SL` in both, matching rendered line 1.
- **Safety:** §0 all, per §DP-0 preamble.

## §DP-2 — product_attachment · NONE of the candidates have the document  `scope: deterministic`

- **Trigger:** §DP-1 fixture with the probe answer set pinned to `answers: []`.
- **Expected:** offer still shown, all 3 codes labelled `— no certificate`, original API rank order
  preserved (sort is a no-op when every `has` is false, then code-order tiebreak applies —
  assert the exact rendered order).
- **Structural assertions:** `dym_available_codes === []`; `dym_probe_meta.ok === true` (the probe
  *succeeded* and found nothing — distinct from a failure); `answer_count === 0`; `suggest_offer ===
  true` (**the offer must NOT be suppressed**); `suggest_quick_reply` bare codes.
- **Safety:** §0 all.

## §DP-3 — product_attachment · probe returns EMPTY / unscoped  `scope: deterministic`

Two sub-cases; both must degrade to today's un-annotated offer.

- **§DP-3a — probe payload has no `answers`/`items` array** (pin `{}`). Assert
  `dym_probe_meta.ok === false`, `reason` non-null, `dym_available_codes === []`, and
  `suggest_response` contains **no** `— has ` or `— no ` substring at all.
- **§DP-3b — unscoped probe detected** (F3 layer 2): pin `answer_count > 0` with **zero** rows carrying
  an `Attachment Type` field. Assert `dym_probe_meta.ok === false`,
  `reason === 'unscoped_probe'`, and **no annotation rendered**. This is the case that stops a
  brochure-only product being labelled "has certificate".
- **Structural assertion for both:** `suggest_response`, `suggest_quick_reply`,
  `suggest_last_result_set` and `dym_candidates` are **byte-identical** to the current LIVE
  `build-suggest-offer` run on the same pinned input.
- **Safety:** §0 all.

## §DP-4 — product_attachment · probe ERRORS  `scope: deterministic`

- **Trigger:** §DP-1 fixture; induce a real `dym-probe` failure (unreachable tool name / forced sub
  error).
- **Expected:** turn completes with today's un-annotated offer. **Never a dead-end.**
- **Structural assertions:**
  - `dym-probe` node config asserted from JSON: `onError === 'continueRegularOutput'`. **Assert it is
    NOT `continueErrorOutput`** — an unwired `main[1]` would make this very case report green while the
    turn silently broke (LESSONS §61a).
  - `dym-annotate` **executed** and emitted `dym_probe_meta.ok === false`; the not-found keys
    (`escalate_message`) survive.
  - `build-suggest-offer` executed and `suggest_offer === true`; `tag-not-found` executed;
    `compile-current-state` produced a non-empty `user_response`.
  - Scored on **runData presence + payload shape**, explicitly **not** on execution status.
- **Safety:** §0 all.

## §DP-5 — inventory · SOME candidates have stock  `scope: deterministic`

- **Trigger:** `Have stock SRTUB2232-1600?` (contact `437264483`) — a real measured dead-end. Pin
  `domain_hint:'inventory'`; `resolve-entity.resolutions` = ONE genuine-miss token with 3 non-exact
  uuid-carrying candidates (`SRTBT2232-1600`, `SRTUB2232-1500`, `SRTUB2232-1800`). Pin the probe answers
  so `SRTUB2232-1800` has rows summing `Quantity On Hand > 0` and the others have **no rows**.
- **Expected:** `dym-transform.probe_tool === 'crm_inventory_stock_balance_list'`,
  `probe_predicate === 'qty_gt_zero'`.
- **Structural assertions:** `dym_available_codes === ['srtub2232-1800']`; `suggest_response` renders
  `SRTUB2232-1800 — has stock` FIRST and the other two `— no stock`; `suggest_quick_reply` is bare
  codes; `dym_probe_entities` contains **only** the 3 product candidates (no attachment entities —
  `requires` is empty for inventory).
- **Safety:** §0 all; S4 asserts the inventory read tool.

## §DP-6 — inventory · NONE have stock  `scope: deterministic`
- As §DP-2 with the inventory fixture: `answers: []` ⇒ all three `— no stock`, `ok:true`,
  `suggest_offer` still true, quick_reply bare.
- **Safety:** §0 all.

## §DP-7 — inventory · probe returns EMPTY  `scope: deterministic`
- As §DP-3a with the inventory fixture: `dym_probe_meta.ok === false` ⇒ no `— has `/`— no ` substring;
  output byte-identical to current LIVE on the same pinned input.
- **Safety:** §0 all.

## §DP-8 — inventory · probe ERRORS  `scope: deterministic`
- As §DP-4 with the inventory fixture. Same `onError` config assertion, same runData-not-status scoring.
- **Safety:** §0 all.

## §DP-9 — ★ HARD GATE: the unscoped-probe guard (F2a)  `scope: deterministic`

The single most dangerous failure in this change: an empty `product_ids` makes
`crm_inventory_stock_balance_list` return **every product × every active warehouse** ("ALL FILTERS
OPTIONAL"), which is both a large unnecessary prod read and a **100 % false-positive** annotation.

- **Trigger:** §DP-5 fixture with every candidate's `uuid` pinned to `null`.
- **Expected:** `dym-transform.probe_needed === false`,
  `probe_skip_reason === 'no_candidate_uuid'`; `dym-gate` takes output **1**.
- **Structural assertions:** **`dym-probe` DID NOT EXECUTE** — assert its absence from `runData`, not
  merely that no rows came back. `build-suggest-offer` output byte-identical to current LIVE.
- **Also assert the mirror for attachments:** §DP-1 fixture with the `attachment_type`/`certificate`
  entity removed ⇒ `probe_needed === false`, `probe_skip_reason === 'no_scoping_entity'`,
  `dym-probe` absent from runData (F3 layer 1).
- **Safety:** §0 all.

## §DP-10 — non-enabled domain unaffected — BYTE-IDENTICAL (regression gate, blocks promote)  `scope: deterministic`

- **Trigger:** one D1 miss per non-enabled domain: `order`, `master_products`, `promotion`, `incoming`.
- **Expected:** `dym-transform` executes (it is on the path) but emits `probe_needed === false` with
  `probe_skip_reason === 'domain_not_enabled'`; `dym-gate` output 1; `dym-probe` and `dym-annotate`
  **absent from runData**.
- **Structural assertions:** run the changed clone `build-suggest-offer` jsCode and the current LIVE
  jsCode against the same pinned input; `suggest_response`, `suggest_quick_reply`,
  `suggest_last_result_set`, `dym_candidates`, `dym_offer` and the full output object are
  **byte-identical**. This is the gate that blocks promote.
- **Safety:** §0 all.

## §DP-11 — 🔴 `suggest_quick_reply` stays BARE CODES (asserted on EVERY annotated case)  `scope: deterministic`

Code mode (`build-suggest-offer.js:274`) uses the codes as **button labels** and the pick round-trips on
that exact string through `output_exchange`'s `tryDymPick`. Annotation belongs in `suggest_response`
ONLY. This is the single easiest way to break the change.

- **§DP-11a — bareness.** On §DP-1, §DP-2, §DP-5 and §DP-6, assert `suggest_quick_reply`:
  matches `^[A-Za-z0-9\-\.\/]+(,[A-Za-z0-9\-\.\/]+)*,Yes escalate,No it's okay$`; contains **none** of
  the substrings `—`, ` has `, ` no `; splits on `,` to exactly `picks.length + 2` entries; and every
  code entry appears verbatim in `suggest_last_result_set[].value`.
- **§DP-11b — order consistency after the has-first sort.** The sort changes button order. Assert
  `suggest_quick_reply.split(',')[i] === suggest_last_result_set[i].value` for every `i < picks.length`,
  **and** that rendered line `i+1` of `suggest_response` names the same code. Then drive the follow-up
  turn: reply with the *second* offered code and assert `output_exchange` resolves that exact code (a
  stale, pre-sort `suggest_last_result_set` would resolve the wrong one).
- **Safety:** §0 all. Note the follow-up turn is multi-turn — do **not** reset
  `respond_contacts_test` between the two turns of §DP-11b (LESSONS §31).

## §DP-12 — coverage boundary: the OTHER two inbounds stay un-annotated (asserted, not assumed)  `scope: deterministic`

`build-suggest-offer` has 4 inbound after this change; only `dym-annotate[0]` and `dym-gate[1]` are new.
D1 can still fire on `annotate-incoming-picker[0]` and `sibling-probe[0]` (D3 returns early only when
`extras.length > 0`), and those turns are **un-annotated by construction**.

- **Trigger:** (a) an `incoming` ambiguous-picker turn reaching `annotate-incoming-picker[0]` whose D1
  fires; (b) a `sibling-probe[0]` turn where `extras.length === 0` so D3 falls through to D1.
- **Expected:** `dym-transform` and `dym-annotate` **absent from runData** on both;
  `build-suggest-offer` output byte-identical to current LIVE.
- **Structural assertion:** static — count inbound edges to `build-suggest-offer` in the clone JSON:
  **exactly 4**, named `sibling-probe[0]`, `annotate-incoming-picker[0]`, `dym-gate[1]`,
  `dym-annotate[0]`; `sibling-gate[1] -> build-suggest-offer` is **gone**.
- **Safety:** §0 all.

## §DP-13 — out-of-scope arms are byte-identical  `scope: deterministic`

- **§DP-13a — multi-token D1.** Pin a two-genuine-miss-token `inventory` fixture so
  `_survivors.length === 2`. Assert `dym-transform.probe_needed === false` with
  `probe_skip_reason === 'multi_token'`; `dym-probe`/`dym-annotate` absent from runData; the multi-token
  block's `suggest_response`, the **global contiguous `idx`** in `suggest_last_result_set`, and
  `dym_candidates` are **byte-identical** to current LIVE. (Renumbering across token blocks is the
  round-trip regression this exclusion exists to prevent.)
- **§DP-13b — numbered mode unreachable for the enabled domains.** Static assertion from
  `disallowed-entity-gate.js:6-15`: `allowed_lookup` is `['product','category','brand']` for `inventory`
  and `['product','attachment','attachment_type','category','brand','certificate']` for
  `product_attachment` — **neither contains `promotion`**, and `tokenCandidates()` filters on
  `allowed_lookup`, so no uuid-`canonical_code` candidate can survive. Then the dynamic half: attempt to
  pin a promotion candidate into an `inventory` D1 and assert it is **dropped by `tokenCandidates()`**
  (so numbered mode never renders). If it survives, the static claim is false — **hard fail**, do not
  ship the "unreachable" wording.
- **§DP-13c — D2 untouched.** A data-miss turn with `alternatives[]` in either enabled domain:
  `dym-transform.probe_needed === false` (no genuine-miss token) and D2's output byte-identical to LIVE.
- **Safety:** §0 all.

## §DP-14 — inventory genuine-zero rows are NOT "has stock" (F2b)  `scope: deterministic`

`crm_inventory_stock_balance_list` "returns a genuine 0", and emits one row **per warehouse**. Row
presence is therefore not has-stock — the property that makes the shipped incoming attribution work does
**not** generalize.

- **Trigger:** §DP-5 fixture, using the genuine-zero product code recorded by §DP-0c. Pin its probe rows
  to `Quantity On Hand: "0"` in two warehouses, `"—"` in a third, and give one other candidate a single
  row of `"4"`.
- **Expected:** the zero product is labelled **`— no stock`**; only the `"4"` product is `— has stock`.
- **Structural assertions:** `dym_available_codes` contains the `"4"` code and **not** the zero code;
  `dym_probe_meta.probed` contains **both** (they were probed, one just has none — a probed-but-zero code
  must render `— no stock`, never be left unlabelled); the `"—"` warehouse row parsed as 0, not NaN, not
  dropped.
- **Safety:** §0 all.

## §DP-FP — Fail-on-purpose: prove every §DP assertion can go RED  `scope: deterministic`

> Mandatory. This repo has a recurring **"green that cannot fail"** class — four instances in one day
> (LESSONS §61, memory `green-that-cannot-fail`). **An assertion never shown to fail is not an
> instrument.** No §DP case may be signed off until its matching FP below has been observed RED, with
> the execution id recorded.

- **§DP-FP-1 — annotation detector.** Against §DP-1, repin the probe so **all three** candidates have a
  typed attachment row. Confirm §DP-1's `dym_available_codes === ['ibwc8315-sl']` assertion goes **RED**
  (it becomes all three). Proves the code-attribution parser is actually reading the answers and not
  returning a fixed value.
- **§DP-FP-2 — has-first sort.** Repin so only the **last** candidate has the document; confirm the
  "rendered FIRST" assertion goes RED if the sort is removed from the jsCode. Run once with the sort
  deliberately deleted.
- **§DP-FP-3 — 🔴 quick_reply bareness.** Deliberately append `— has certificate` to one
  `suggest_quick_reply` entry and confirm **every clause** of §DP-11a goes RED — the regex, the
  substring checks, and the entry-count check. A bareness check that stays green here is worthless.
- **§DP-FP-4 — byte-identity gates.** Introduce a one-character change to the un-annotated render path
  and confirm §DP-3, §DP-10, §DP-12 and §DP-13a all go RED. If any stays green, that gate is comparing
  nothing — fix the gate before scoring the case.
- **§DP-FP-5 — the unscoped-probe guard.** Remove the `no_candidate_uuid` clause from `dym-transform`
  and confirm §DP-9's "`dym-probe` absent from runData" assertion goes RED (the probe fires with empty
  `product_ids`). This is the guard whose absence causes a full-table read; its test must be proven live.
- **§DP-FP-6 — genuine-zero predicate.** Switch `dym-annotate` from `qty_gt_zero` to row-presence and
  confirm §DP-14 goes RED (the zero product becomes `— has stock`).
- **§DP-FP-7 — error-path scoring.** Confirm §DP-4 is scored on runData, not status: change
  `dym-probe.onError` to `continueErrorOutput` with `main[1]` unwired, and verify the execution reports
  **`success`** while §DP-4's `dym-annotate`-executed / `ok:false` assertion goes RED. This reproduces
  the exact defect (LESSONS §61a) and proves the case can see it.
- **§DP-FP-8 — the §0 gate itself.** Per §0, confirm S4 can go red: pin the `tool` string to a write
  tool name in a scratch fixture and verify the S4 assertion fires before the probe runs.
