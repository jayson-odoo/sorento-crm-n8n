# Cycle 1 — Test-Harness Guard Layer — REVIEW

**Verdict: REQUEST-CHANGES** (one operational blocker — a publish-state gate — must be cleared before the tester runs).

**Headline:**
- **LIVE PROD IS SAFE RIGHT NOW.** The three shared-sub guards are logically inert for live traffic, AND no live caller passes `is_test`/`test_mode` truthy, AND the live-executed (published) versions of the subs are byte-identical to pre-change.
- **TESTER: NO-GO until the 3 shared subs are PUBLISHED.** The guards the coder added to the three shared subs currently live ONLY in an **unpublished draft**. The published (`activeVersion`) of each shared sub still has **no guard**. If n8n resolves an Execute-Workflow call to the published version, a `test_mode:true` run would hit the **real** respond.io send / assignment / SLA path → real egress. This must be removed as a risk before any execution.

The harness build itself is correct (all 7 guards + 2 bypasses present, wiring/anchoring correct, inert logic sound). The blocker is a publish/version-state precondition, not a code defect.

---

## PRIORITY 1 — Are the 3 shared-sub guards INERT for live traffic?

Method: for each sub, MCP `get_workflow_details` returns BOTH `.workflow` (the draft, with the new guards) AND `.workflow.activeVersion` (the published version that prod runs). I inspected both, plus every live call site in `9qVyfUxmRQqrpGRMDLRuz`.

### Send sub `aoydkG1dbItXR5jXFEQsP` — **INERT-FOR-LIVE = YES**
- Guard `test-guard` (`if` v2.3): `={{ $('When Executed by Another Workflow').first().json.is_test }}`, operator `boolean/true`, `typeValidation:"loose"`. Connections: TRUE(out0)→`test-guard-record` (redis push, terminal stub); FALSE(out1)→`If` (the original first node, real send path).
- Absent `is_test` → with the boolean-`true` operator under loose validation, `undefined` is not true → **FALSE branch → `If` → real send. Byte-identical to pre-change.**
- TRUE branch is a leaf (record only); never reached by live. FALSE branch reaches the unchanged `If`/`Send a Message`/quick-reply `HTTP Request` graph.
- Live callers (all in consume-main, verified): `respond`, `respond2`, `respond3`, `respond4`, `respond5`, `respond-transcribed-message` — **none** include an `is_test` value (field is `removed:true`/absent in every call's inputs). The send sub is also called from inside the human-intervention sub (routed-to-pic/1/2) **without** passing `is_test`.

### Human-intervention sub `rrYXzE61gCNUck_zmXe-G` — **INERT-FOR-LIVE = YES**
- Guard `test-guard` (`if` v2.3): `={{ ...json.is_test }}`, `boolean/true`, loose. TRUE(out0)→`test-guard-record` (terminal stub); FALSE(out1)→`sorento-sub-respond-sendmsg-respond-routed-to-pic2` (original first node).
- Absent `is_test` → FALSE → `routed-to-pic2` → `get-round-robin-assignee` → real assignment/SLA/comment/assignee-queue path. **Byte-identical.**
- The blocked writes (`Assign or unassign a Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, the `sorento-respond-assignee-queue` Redis push) sit downstream of the FALSE branch and are untouched.
- Live caller: `Call 'sub-human-intervention'` in consume-main — `is_test` is `removed:true` and not present in the passed values. **Not truthy.**

### Reformulator / semantic-parser `XTODTw-dJcV0uRdC056hG` — **INERT-FOR-LIVE = YES**
- Guard `test-reformulator-bypass` (`if` v2.3): AND of two boolean-`true` conditions — `...json.is_test` AND `!!...json.mock_reformulator_output`, loose. TRUE(out0)→`mock-reformulator-output` (code, returns `{output: mock}`); FALSE(out1)→`AI Agent` (real LLM path; `ai_languageModel`/`ai_memory` subnode wiring preserved).
- Absent `is_test` (and absent mock) → AND short-circuits FALSE → **`AI Agent` real path. Byte-identical.** Double-gated, so even safer.
- Live caller: `Call 'sub-query-reformulator'` passes only `latest_user_message`, `contact_id`, `previous_conversation_state`, `referenced_result_set`. **No `is_test`, no `mock_reformulator_output`.**

### Cross-cutting note on the published vs draft split (the reason for the blocker)
For all three subs, `versionId != activeVersionId` and the `activeVersion` node graph **does not contain the guard nodes** (e.g. parser active graph is `When Executed → AI Agent` directly; send/hi active graphs go straight to `If`/`routed-to-pic2`). So the guards are an **unpublished draft**.
- This is *why live is safe today*: prod runs the published, byte-identical-to-original versions.
- This is *why the tester is gated*: the test clone calls these shared subs with `is_test = test_mode = true`. If Execute-Workflow resolves the sub to its **published** (unguarded) version, the guard never runs and the real send/assign fires. I cannot determine n8n's sub-version-resolution semantics by inspection alone, and I am read-only / must not run executions to probe it. The conservative, robust fix is to **publish the three guarded subs** — which is provably safe for live (per the INERT analysis above + no truthy live caller), and makes test-safety hold regardless of resolution semantics.

---

## PRIORITY 2 — Clone correctness (`txiPzSxy3Pclsz6v`) — PASS (with creds caveat)

- `active:false`, `activeVersionId:null` → the clone has no published version, so its **own** inline guards always execute on manual `execute_workflow`. Good.
- Step-0: **zero `scheduleTrigger`** nodes (confirmed). `redis-pop-main-message-list.list == "main-message-list-test"` (confirmed, off the shared prod queue).
- All 7 guard points present and correctly wired:
  - a/b — clone call sites pass `is_test = {{ ...test_mode }}` to the send sub (all 6 call sites) and the human-intervention sub, and `is_test + mock_reformulator_output` to the reformulator. (Reformulator call omits `test_run_id`; acceptable — that sub has no redis record node, its only "egress" is LLM tokens.)
  - c `guard-update-human-intervened`: fed from `is-human-intervened`[idx1] alongside `set-human-intervened`; TRUE→`guard-c-record`, FALSE→`update-human-intervened` (real).
  - d `guard-save-session-vars`: fed from `compile-current-state` alongside `sorento-sub-respond-sendmsg-respond2`; TRUE→`guard-d-record`, FALSE→`save-session-vars` (real).
  - e/f/g: `Switch` out0/1/2 → `guard-send-message-images/video/files`; each TRUE→`guard-{e,f,g}-record`→`Loop Over Items1`, FALSE→real `send-message-*`.
- All 6 inline guards + `parser-bypass-gate` anchor on `={{ $('When Executed by Another Workflow').first().json.test_mode }}` (the trigger node, not the central-state blob). Correct per plan §2.1.
- **T5 parser bypass**: `parser-bypass-gate` = `test_mode===true AND !!mock_parser_output` (both conditions present); TRUE→`mock-parser-output`→`central-exchange`, FALSE→`Basic LLM Chain`. Correct — `scope:parser` (no mock) falls through to the real chain.
- **T6 reformulator bypass**: double-gated as above. Correct.
- Clone trigger declares `test`, `test_run_id`, `started_at`, `test_mode`, `scope`, `mock_parser_output`, `mock_reformulator_output`. Correct.

### Redis credential question (coder flagged `credentials:null` on `redis-pop-main-message-list`)
**Resolved: the read API redacts credentials universally — `credentials:null` is NOT evidence of loss, but also NOT confirmation of presence.** Proof: the untouched **LIVE** workflow (75 nodes, runs in prod every second so its creds are definitely valid) returns `credentials:null`/absent for **all 75 nodes**, including its own `redis-pop-main-message-list`. So MCP `get_workflow_details` strips creds from every node.
- Consequence: I **cannot confirm from MCP** whether the clone's `redis-pop-main-message-list` or the new push nodes (`guard-d/c/e/f/g-record` on the clone; `test-guard-record` in the two subs; none in the parser) actually have `sorento-redis` (`H5w6o7tptzTPMVdy`, which does exist in the instance) attached.
- **Action for tester/coder: verify in the n8n UI** that `redis-pop-main-message-list` and every guard-record push node carry `sorento-redis` before runs. Note this is a test-correctness item, not a safety leak: if a record node lacks a cred it errors on the TRUE branch *after* the real egress was already bypassed on the FALSE branch — fail-safe (the run fails / the log is incomplete; no send occurs).

---

## PRIORITY 3 — Will the §0 safety assertions be satisfiable?

Mostly yes, with two assertion-contract mismatches the tester must adapt to (neither is a safety leak):

1. **Egress records do not contain a literal `blocked:true` field.** UAC §0 S1/S2/S3 describe records as `{guard:"…", blocked:true}`. The actual record schema RPUSHed to `test:egress:{test_run_id}` is `{guard, kind:"would_send"|"would_write", target, payload, test_run_id, ts}` — no `blocked` key. The **presence** of the record (only emitted on the guard's TRUE branch) IS the proof of block, and `kind` conveys send-vs-write. Tester must assert on record presence + `kind`, not a `blocked` field — OR coder adds `"blocked": true` to each record for literal §0 compliance. The stronger, schema-independent safety assertion (absence of any real 2xx respond.io send / write in `get_execution` data) remains fully available.
2. **§3 escalation expectation.** UAC §3 expects the "routing you to a person" message recorded as a blocked `sendmsg-sub`. In practice the human-intervention sub short-circuits at its **top** guard (before `routed-to-pic2`), so the send sub is never invoked on that path — only a single `human-intervention-sub` record appears. Tester should expect exactly the `human-intervention-sub` record for §3, not an additional `sendmsg-sub` record.

`test_mode` provably present (S5): clone trigger carries it and all sub call sites forward it — observable in execution data. S6 token-sink bounding is structurally supported by the two bypasses.

---

## BLOCKERS (must clear before tester runs)

1. **[BLOCKER — publish gate] The guard layer on the three shared subs is unpublished.** `aoydkG1dbItXR5jXFEQsP`, `rrYXzE61gCNUck_zmXe-G`, `XTODTw-dJcV0uRdC056hG` each have the guards only in their draft; `activeVersion` is unguarded. **Fix:** publish the three subs (their guards are inert for live, so publishing does not change prod behavior), OR empirically confirm — without risking egress — that Execute-Workflow from a manual clone run resolves sub-workflows to their latest/draft version. Until one of these is done, a `test_mode:true` run can leak real sends/assignments. **Tester go/no-go: NO-GO.**

## NON-BLOCKING FINDINGS (fix or adapt)

2. **[VERIFY] Redis creds unconfirmable via API** — confirm `sorento-redis` is attached to `redis-pop-main-message-list` and all guard-record push nodes in the UI (read API redacts; fail-safe but would break the egress log / runs).
3. **[ASSERTION] Record schema lacks `blocked:true`** — add it, or assert on presence + `kind`.
4. **[ASSERTION] §3** — expect only the `human-intervention-sub` record (sub short-circuits before the routed-to-pic send).
5. **[INFO] Live has its own pre-existing unpublished draft** (`versionId f6bb0c13 != activeVersionId b4574211`) unrelated to this change; its draft call sites also pass no truthy `is_test`. Not a concern, but the eventual promotion deploy should be mindful of live's draft/publish state.

---

## Go / No-Go

- **Live prod safe right now:** YES.
- **Tester cleared to begin executions:** NO — clear Blocker #1 (publish the 3 shared subs) and Finding #2 (confirm redis creds) first. Once both are done, the harness is safe to run; the inert-for-live analysis already authorizes publishing the subs without touching prod behavior.
