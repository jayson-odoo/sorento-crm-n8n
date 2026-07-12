# Regression CAPTURE orchestrator — `sorento-regression-orchestrator`

CAPTURE half of the per-node golden-master regression harness (plan §4). Drives the FAIL-CLOSED
regression clone over a small, ordered slice of the corpus and snapshots every node's output into
`golden_nodes`. Built + validated via n8n-mcp. **Clone and live were NOT edited.**

- **Workflow id:** `MGm32814G7XcGSD2`
- **URL:** https://automate-sorento.foundryx.my/workflow/MGm32814G7XcGSD2
- **Clone it drives:** `txiPzSxy3Pclsz6v` (sorento-consume-main TEST, FAIL-CLOSED) via `executeWorkflow` (mode=once, waitForSubWorkflow=true).
- **Validates:** `validate_workflow` → valid, 16 nodes.

## How to run

Manual trigger. Run from the UI (Execute Workflow) or via MCP `execute_workflow` (executionMode `manual`).
The whole loop is sequential (one clone run at a time) — required for the "latest execution = the one I
just fired" capture step.

### Parameters (edit the `Init Params` Code node, or pass as workflow input if later wrapped in an executeWorkflowTrigger)
| param | default | meaning |
|-------|---------|---------|
| `limit_conversations` | `2` | how many distinct conversations (contacts) to capture |
| `min_turns` | `2` | only pick conversations with at least this many turns (so the smoke shows multi-turn session evolution; set `1` for a full corpus run) |
| `run_label` | `baseline-<YYYYMMDD-HHmm>` | `golden_runs.label` |
| `throttle_seconds` | `2` | Wait between turns to bound prod read-load |

Conversation selection (`Select Turns`): the N conversations are chosen **shortest-first**
(`ORDER BY count(*) ASC, conversation_id ASC`) among those with `>= min_turns`. This deliberately
diverges from the plan's `ORDER BY contact_id` so the validation slice stays cheap and avoids the
802-turn contact `437264483`. For a full capture use `limit_conversations=41, min_turns=1`.

## Node flow (per turn, linear)
`Start Capture` → `Init Params` → `Insert golden_run` (RETURNING id = baseline_id) → `Select Turns`
(all turns of the N convos, ordered conversation_id, turn_index) → `Loop Turns` (splitInBatches, batchSize 1):

1. `Reset Session If First` — `UPDATE respond_contacts_test SET session_vars=seed_session_vars WHERE respond_io_id=$1 AND $2::int=1`. Wrapped in a CTE that always `SELECT`s a row so the chain never dies on a 0-row update (turns 2..N reset nothing).
2. `Build Redis Item` — Code node building the **exact** item shape the clone expects (verified against `redis-pop-main-message-list` which pops with `propertyName:"message"`, so the whole item lands at `$json.message`). `mode:"regress-capture"`, NO `mock_*`/`fixtures` (real LLMs + reads run). Message text/contact from `v_turns`. `test_run_id = "<baseline_id>:<trigger_chat_history_id>"`.
3. `Clear List` (redis delete `main-message-list-test`) → `Push Item` (redis push the item).
4. `Fire Clone` (executeWorkflow → `txiPzSxy3Pclsz6v`, waits for completion). `onError: continueRegularOutput` so one failing turn doesn't abort a full-corpus capture.
5. `Get Exec Id` (native **n8n** node, execution:getAll, limit 1, filter workflowId=clone) → latest clone execution.
6. `Get Exec Data` (native **n8n** node, execution:get, `options.activeWorkflows=true` = include detailed data) → the execution with `data.resultData.runData`.
7. `Flatten RunData` (Code) — walks `runData[nodeName][runIndex]`, emits one row per node-run.
8. `Insert Golden Nodes` (Postgres) — `jsonb_to_recordset($2)` bulk insert with `ON CONFLICT … DO NOTHING` (idempotency) and `md5(output_json::text)` as `output_norm_hash`.
9. `Throttle` (Wait `throttle_seconds`) → `nextBatch(Loop Turns)`.

`Loop Turns` done → `Finish Run` appends `finished_at`/node/turn counts to `golden_runs.notes`.

## golden_nodes row shape written per node-run
`golden_run_id` (baseline_id), `conversation_id` (contact), `turn_index`, `trigger_chat_history_id`
(the incoming row id = key), `n8n_execution_id` (clone sub-exec id, provenance), `node_name`,
`node_type` (resolved from `execution.workflowData.nodes`, else `'unknown'`), `run_index` (0-based,
per node-run for loops), `output_json` = the node's `data.main` (the golden), `output_norm_hash` =
`md5(output_json::text)` (raw-output integrity/dedup hash; **timestamp/id normalization + sha256 are a
diff-time concern**, applied later by the replay orchestrator per plan §5.2 — `output_json` is the
forensic source of truth), `is_external` + `external_kind` for the pinnable nodes, `captured_at`.

`is_external=true` (these rows double as replay fixtures) is tagged for, by exact node name:
`Basic LLM Chain`→`llm-parser`, `Call 'sub-query-reformulator'`→`llm-reformulator`,
`Call 'sub-get-results'`→`read-get-results`, `resolve-entity-http`→`read-resolve-entity`,
`check-access-http`→`read-check-access`, `get-access-types`→`read-access-types`.

## Credentials (bound on the workflow)
- Postgres nodes (`Insert golden_run`, `Select Turns`, `Reset Session If First`, `Insert Golden Nodes`, `Finish Run`) → **`n8n_test-db`** (`Dnnofg8Xb27VQOhI`).
  ⚠️ **create_workflow auto-assignment wrongly bound these to `sorento-crm-db` (the PROD CRM DB) — I repointed all five to `n8n_test-db` immediately. Re-verify on any re-import.**
- Redis nodes (`Clear List`, `Push Item`) → `sorento-redis` (`H5w6o7tptzTPMVdy`).
- Execution-capture nodes (`Get Exec Id`, `Get Exec Data`) → native **n8n** node with the **`n8nApi` credential** `n8n account` (`fgddbYXCv9zR3YY1`). **No API key / JWT is hardcoded anywhere** — the n8n node injects `X-N8N-API-KEY` from the stored credential. (I originally drafted httpRequest+predefinedCredentialType n8nApi, but the MCP credential binder rejects `n8nApi` on `httpRequest`; the native `n8n` node accepts it cleanly and was the better choice.)

## Redis item shape — IMPORTANT (real-path nesting)
The message text MUST sit at `item.message.message.message.text`. The clone reads the user message via
`tf-message` (returns `redis.json.message.message`) and then `$('tf-message').first().json.message.message.text`
in `Call 'sub-query-reformulator'` (latest_user_message), `construct-user-prompt`, `guard-h-record`, and the
send nodes. The canary/UAC fixtures use a shallower 2-level nesting **but always supply
`mock_reformulator_output`, which bypasses this path** — so the shallow shape was never exercised against the
real reformulator. `Build Redis Item` therefore nests:
`message: { message: { message: { text, type, attachment } }, replyTo: {} }`.

## Smoke test (limit_conversations=2, min_turns=2) — result: FULLY GREEN. CAPTURE HALF DONE.
Final run: orchestrator exec `6765593` (status **success**, ~39 s for 5 turns), `golden_run` id `4`
(`baseline-20260627-1303`). Conversations `404280950` (3 turns) + `469779580` (2 turns) = **5 turns**.
Unblocked by the user setting the `n8n account` n8nApi credential **Base URL** → `…/api/v1`.

1. **`Get Exec Id` no longer 404s** — the capture fetch works; orchestrator completed cleanly to `Finish Run`.
2. **`golden_nodes` populated: 186 rows across 5 turns** (per turn: 32069→43, 33221→43, 33223→31, 37402→26,
   37405→43). One row per node-run (`Loop Over Items` loops captured at `run_index` 0/1).
   **Sample row** (`check-access-http`, turn 32069): `golden_run_id=4, conversation_id=404280950,
   turn_index=1, trigger_chat_history_id=32069, n8n_execution_id=6765594, node_name=check-access-http,
   node_type=n8n-nodes-base.httpRequest, run_index=0, output_json=[[{"json":{"allowed":true,"decision":
   "allow","agent_name":"General Enquiries"}}]], output_norm_hash=24e173eb…, is_external=t,
   external_kind=read-check-access, captured_at=…`.
   **`is_external` coverage** — set on every pinnable node that actually ran. All kinds observed across the
   run: `llm-reformulator` (`Call 'sub-query-reformulator'`), `read-check-access` (`check-access-http`),
   `read-resolve-entity` (`resolve-entity-http`), `read-get-results` (`Call 'sub-get-results'`), and
   `llm-parser` (`Basic LLM Chain`, fired on turn 33223 "Yes"). Turns whose message didn't resolve entities
   / fetch results have fewer external rows (e.g. 37402 = 2) — expected; `is_external` reflects the real path.
   (`get-access-types` was not exercised by these 5 messages.)
3. **Multi-turn + session progression PROVEN** (contact `469779580`, turns 37402 → 37405, read from the
   captured `pg-get-session` outputs):
   - Turn 1 (37402) READ **seed**: `{"variables":{}, "last_result_set":[]}`.
   - Turn 2 (37405) READ **turn 1's evolved session**: `message_type:"clarification"`, `user_goal:"trying to
     ask what capabilities are available"`, the full clarification `response`, routing — exactly what turn 1's
     `pg-upsert-session` wrote. Per-conversation reset + intra-conversation evolution both work.
4. **Zero real egress across all 5 turns** — real egress nodes captured = **NONE**
   (`send-message-files/images/video`, `update-human-intervened`, `save-session-vars` PUT never ran). Present
   instead (×5 each): `sorento-sub-respond-sendmsg-respond2` (send sub called with `is_test:true` → blocked
   inside the shared sub), `guard-d-record` + `guard-h-record` (blocked-egress redis records), and
   `pg-upsert-session` (session write). **Only writes were to `n8n_test`** (`golden_nodes` +
   `respond_contacts_test`). No prod writes. (Real CRM *reads* are expected in capture mode; `check-access`
   logs 1 benign `mcp_access_log` row/turn in prod, per plan §8.)
5. **Idempotency PROVEN** — re-inserting `golden_run 4`'s 186 rows into itself with the orchestrator's exact
   `ON CONFLICT (golden_run_id, trigger_chat_history_id, node_name, run_index) DO NOTHING` → **0 rows
   inserted**, count stayed 186. The unique constraint holds.

**Per-turn cost (capture mode):** ~1–2 LLM completions (reformulator always; parser on some routings,
~1.5–2.5k tokens each) + 1 RAG embedding + up to 3 reads (check-access, resolve-entity, get-results MCP).
Clone wall-time ≈ 8 s/turn; orchestrator end-to-end ≈ 8 s/turn incl. the 2 s throttle. A full 41-conversation
/ 2,216-turn capture ≈ low-tens-of-thousands of rows — budget tokens/reads accordingly and run off-peak.

> `golden_run 4` (186 rows, 2 conversations) is left in place as a validated mini-baseline. Delete it before
> minting the official full-corpus baseline if you want a clean `golden_runs`.

## Open items / limitations
- **Execution-id retrieval:** native n8n `execution:getAll` filtered by `workflowId`, limit 1, newest-first;
  robust under strictly-sequential orchestration (sub-executions persisted + retrievable). `Fire Clone` also
  exposes `metadata.subExecution.executionId` if a future version prefers to skip the list call.
- **Node settings:** `Fire Clone` = `onError: continueRegularOutput` (one bad turn won't abort a full capture);
  `Get Exec Id` / `Get Exec Data` / `Finish Run` = `executeOnce: true` (Finish Run previously appended its
  summary once per loop item — fixed).
- **`output_norm_hash` = md5(raw output)** at capture time (non-null integrity/dedup aid). The plan's
  sha256-of-*normalized*-output is a **diff-time** computation in the replay orchestrator, from `output_json`.
- **contact `custom_fields: []`** in the built item; egress blocked regardless; `is-human-intervened` took
  the not-intervened branch (verified).
- **Idempotency caveat:** each run mints a *new* `golden_run`, so within-run dup is impossible; true resume of
  an existing baseline_id is not wired (capture always starts fresh).
- **`n8nApi` credential dependency:** capture needs the `n8n account` credential Base URL correct
  (`…/api/v1`). If the n8n API key is rotated, update that credential.

---

# REPLAY + DIFF half — `sorento-regression-replay` (BUILT ✅)

- **Approach:** a **sibling workflow** (the accepted capture workflow is left untouched). Id **`aROEBlQyyoQaB7a1`**.
- **URL:** https://automate-sorento.foundryx.my/workflow/aROEBlQyyoQaB7a1
- Reuses the capture loop shape; for each turn it builds the replay pins, fires the clone in
  `mode:"regress-replay"`, then **normalizes + diffs every node vs the golden** and writes `replay_runs` +
  `replay_node_diffs`.

## Params (Init Params Code node)
| param | default | meaning |
|-------|---------|---------|
| `baseline_golden_run_id` | `6` | which `golden_runs` row to replay/diff against |
| `replay_label` | `replay-<YYYYMMDD-HHmm>` | `replay_runs.label` |
| `throttle_seconds` | `1` | Wait between turns |

`Select Turns` replays exactly the turns present in that baseline (`trigger_chat_history_id IN (SELECT … FROM
golden_nodes WHERE golden_run_id=$1)`), in `conversation_id, turn_index` order; per-conversation session reset
(turn-1) identical to capture.

## Pins (built per turn from `golden_nodes WHERE is_external`)
`Build Item` reads the turn's `is_external` golden rows (`Fetch Externals`) and packs the redis item
(`mode:"regress-replay"`, same 3-level message nesting):
- `mock_parser_output` ← `llm-parser` row's `output_json[0][0].json.text` (the clone's `mock-parser-output`
  emits `{output: mock_parser_output}` → `central-exchange` reads `.output`, matching the real `.text`).
- `mock_reformulator_output` ← `llm-reformulator` row's `output_json[0][0].json.output` (the reformulator sub's
  bypass emits `{output: mock_reformulator_output}`, matching the golden `{output:{…}}`).
- `fixtures.resolve_entity` / `check_access` / `get_results` ← the read rows' `output_json[0][0].json`.
  `fixtures.get_access_types` ← array of the row's items (not exercised by this corpus).
The clone's existing replay gates consume these keys → in replay the real reads + both LLMs are bypassed.

## Diff (the `Diff` Code node) — keys on `node_id`
- **Keyed on `(node_id, run_index)`**, NOT `node_name`. The golden carries `node_id` (captured from
  `execution.workflowData.nodes`); the replay resolves each node's id from the replay execution's
  `workflowData`. A **renamed** node keeps its id → still matches (no false `missing`/`new`). Only a truly
  removed/added node (different id) is `missing`/`new`. The remove+re-add surgery nodes on the clone
  (`*-http`, NoOp passthroughs) have their own ids — correctly treated as distinct nodes, not renames.
- **Normalization** (applied to both golden `output_json` and replay output before hashing/compare):
  - strip harness-control keys that legitimately differ by mode: `mode`, `mock_parser_output`,
    `mock_reformulator_output`, `fixtures`, `test_run_id`, `scope`; strip n8n `pairedItem`.
  - timestamp/volatile keys → `<V>`: any `*_at`, `ts`, `timestamp`, `last_updated*`, `elapsed`/`elapsed_ms`,
    `startTime`, `executionTime`, `started_at`, `finished_at`, `captured_at`.
  - ISO-8601 / 13-digit-epoch **string values** → `<TS>`.
  - **`similarity`** (RAG cosine score) rounded to 3 decimals — see gap (1) below.
  - KEEP all business data (entity UUIDs, product codes, response text, variables).
- **Statuses** (`replay_node_diffs.diff_status`): `match | regression | volatile | missing | new`.
  PASS = zero `regression|missing|new`.
- **Harness allowlist → `volatile`** (record/replay machinery that structurally differs capture-vs-replay,
  never a behaviour regression): `parser-bypass-gate`, `mock-parser-output`, `Basic LLM Chain`,
  `OpenAI Chat Model`, `replay-*`/`fixture-*`/`*-http` read pairs, `Call 'sub-get-results'`,
  `get-access-types`. (Plan §5.2 volatile allowlist — presigned-url/transcribe/save-message-redis-ts — is
  also reserved but those nodes are off this corpus.)
- For **every** diff row we persist the RAW (un-normalized) `golden_input`, `golden_output`, `replay_input`,
  `replay_output` for side-by-side inspection; the verdict uses the normalized hashes.

## Normalization gaps found + fixed (first replay surfaced false diffs; resolved precisely, no over-strip)
1. **`Execute 'sub-get-rag'` + its consumers** (`tool-filter`, `Split Out1`, `Loop Over Items`) showed
   `regression` — pure **float jitter in the RAG cosine `similarity`** (e.g. 0.51242 vs 0.51235, identical
   tool names + order). RAG runs **live** in replay (the clone has no get-rag replay gate, and editing the
   clone is out of scope), so the embedding floats jitter ~1e-4. Fix: round the named `similarity` field to
   3 decimals — keeps tool selection/order fully diffable, absorbs jitter. (Not over-stripping: one named,
   identifiable volatile float.)
2. **`OpenAI Chat Model`** showed `missing` — it is the parser `Basic LLM Chain`'s model subnode; it runs in
   capture (parser live) but not replay (parser mocked). Added to the harness allowlist → `volatile`.

## Validation results (golden_run 6, conversations 404280950 + 469779580, 5 turns, 211 node-diffs)
- **(4a) Unchanged replay vs its golden → 0 regressions.** `replay_runs.summary` =
  `{turns:5, nodes:211, match:172, volatile:39, regression:0, missing:0, new:0}`. PASS.
- **(4b) Planted-change catch.** Per the original task's hard "**do not edit the clone**" constraint, the
  planted change was injected into the **golden baseline** (the symmetric, fully-reversible equivalent —
  it makes replay output ≠ golden, exercising the identical detection path a clone change would). Mutated
  `compile-current-state`/turn 32069 `user_response` → replay produced **exactly 1 `regression`** at that
  node (`node_id 7a130a0c-…`), all others still match. Restored the golden → replay back to **0
  regressions**; `golden_run 6` intact (198 rows). The diff catches a regression and isolates it to the
  exact node. (If a literal clone-node planted change is later wanted, it requires clone-edit authorization
  the original brief withheld; the detection mechanism is identical.)
- **Replay safety = 0 LLM completion tokens / 0 prod CRM reads / 0 egress.** Verified from the diff data:
  `resolve-entity-http`, `check-access-http`, `Call 'sub-get-results'` ran in capture but **NOT** replay
  (fixtures used); `Call 'sub-query-reformulator'` runs but its internal AI Agent is bypassed (mock);
  parser bypassed; **no** `send-message-*`/`update-human-intervened`/`save-session-vars` ran. **Sole live
  call: `Execute 'sub-get-rag'`** (~1 embedding + 1 pgvector read per turn) — the clone has no get-rag
  replay gate, so it can't be pinned without editing the clone; it is deterministic (similarity rounded) so
  it causes no false diffs. Session reads/writes hit the `n8n_test` copy only.

## Re-bless path (intended changes)
When a change is *intended*, its diffs are expected. To re-bless:
1. Review `replay_node_diffs WHERE diff_status IN ('regression','missing','new')` for the replay run;
   confirm each (the RAW `golden_*` vs `replay_*` columns show exactly what changed). Set `blessed=true` on
   the ones that are intended.
2. **Mint a new immutable golden** (never edit a golden in place — auditability). Simplest + cleanest: run
   the **capture** orchestrator against the changed clone → a new `golden_runs` row whose `is_external` rows
   are the refreshed replay fixtures too. Keep the old `golden_run` for history. Point future replays at the
   new `baseline_golden_run_id`.
   (Cheaper fork-apply — copy the prior golden, overwrite only the blessed `(node_id,run_index)` rows with
   the replay outputs, and refresh any blessed `is_external` rows so the pins stay consistent — is possible
   but must keep fixtures and downstream rows coherent; prefer re-capture unless tokens are a concern.)
3. A replay PASSES iff zero `regression|missing|new` remain unblessed.

---

# FINAL SCHEMA (what column holds what)

### `golden_nodes` (the per-node golden; one row per node-run)
`id` · `golden_run_id`→golden_runs · `conversation_id` (contact) · `turn_index` · `trigger_chat_history_id`
(incoming row id = turn key) · `n8n_execution_id` (clone sub-exec, provenance) · `node_name` (readability) ·
`node_id` (**stable UUID — diff keys on this**) · `node_type` · `run_index` (0-based per node-run) ·
`input_json` (node input, resolved from the runData `source`; null for trigger/source-less nodes) ·
`output_json` (the golden output = `data.main`) · `output_norm_hash` (md5 of raw output, integrity/dedup;
normalized sha is a diff-time concern) · `is_external` + `external_kind` (the pinnable nodes → replay
fixtures) · `captured_at`.

### `golden_runs` (one row per capture/baseline)
`id` · `label` · `workflow_id` (clone captured from) · `git_ref` · `captured_at` · `notes` (mode + counts).

### `replay_runs` (one row per replay)
`id` · `golden_run_id` (baseline compared against) · `label` · `git_ref` · `replayed_at` ·
`summary` jsonb `{turns,nodes,match,regression,volatile,missing,new}`.

### `replay_node_diffs` (one row per (turn, node) diff)
`id` · `replay_run_id` · `trigger_chat_history_id` · `node_name` · `node_id` (**keyed on this + run_index**) ·
`run_index` · `golden_norm_hash` · `replay_norm_hash` · `diff_status`
(`match|regression|volatile|missing|new`) · `diff_json` (normalized golden-vs-replay delta, regressions only) ·
`golden_input` · `golden_output` · `replay_input` · `replay_output` (**RAW, un-normalized, for side-by-side
inspection**) · `blessed`.

Query for a given turn+node → `SELECT golden_input, golden_output, replay_input, replay_output, diff_status
FROM replay_node_diffs WHERE replay_run_id=? AND trigger_chat_history_id=? AND node_id=?`.

### Capture-workflow changes for this half (orchestrator `MGm32814G7XcGSD2`)
`Flatten RunData` now also resolves `node_id` (from `workflowData.nodes`) and `node_input` (from each
run's `source`); `Insert Golden Nodes` writes them into `golden_nodes.node_id` / `.input_json`. The two
new columns (`golden_nodes.node_id`, and `replay_node_diffs.node_id` + `golden_input/golden_output/
replay_input/replay_output`) were added via additive `ALTER TABLE ADD COLUMN`. `golden_run 6` is the current
mini-baseline (re-captured with node_id + node_input); the older node_id-less `golden_run 4` was deleted.

---

# CAPTURE HARDENING (reviewer GO-WITH-FIXES — 2 HIGH fixes landed on `MGm32814G7XcGSD2`)

## FIX 1 — RESUMABLE capture (was: always minted a new golden_run, restarted from turn 1 on crash)
- **`Init Params`** now takes (all optional, read from trigger input; defaults shown):
  `baseline_id` (null), `run_label` (`baseline-<stamp>`), `limit_conversations` (2), `min_turns` (2),
  `max_turns_per_conversation` (null=all), `conversation_ids` (csv, null=auto-select), `throttle_seconds` (2).
- **`Insert golden_run` is now reuse-or-create:** if `baseline_id` is given it uses that run; else if a
  `golden_runs` row with the same `run_label` exists it REUSES it; else it inserts a new one. So re-running
  with the same `run_label` (or `baseline_id`) continues the same baseline.
- **Resume semantics = CONVERSATION-GRANULAR (the simplest *correct* choice for non-deterministic capture).**
  Rationale: capture runs the **real** reformulator LLM (non-deterministic), so you cannot safely resume
  mid-conversation — turn N's golden depends on turns 1..N-1's exact outputs + evolved session. Turn-granular
  skip would also corrupt on a crash *during* a turn (session written, golden not). So:
  - New node **`Purge Partial`** (after Insert golden_run): deletes the golden rows of any conversation that
    is *partially* captured for this run (0 < done_turns < total_turns).
  - **`Select Turns`** returns all turns of conversations that are **not fully captured** for this golden_run
    (fully-captured conversations are skipped entirely), honouring `min_turns`, `limit_conversations`,
    `conversation_ids`, and `max_turns_per_conversation`. Stable order: shortest-conversation-first,
    then `conversation_id`.
  - Net: a crashed/partial conversation is re-done from its turn 1 (reset + full replay → internally
    consistent golden); completed conversations cost nothing on resume; `INSERT … ON CONFLICT DO NOTHING`
    is the final dedup backstop. Re-running a finished baseline does nothing (0 turns, 0 new rows).
- **Full run:** pass `limit_conversations` ≥ 41 (or large) + `min_turns` 1 + a **stable `run_label`** (so it's
  resumable). The `manualTrigger` can't take MCP inputs, so for the full run either trigger from the UI with
  those inputs or set them as the `Init Params` defaults. Default (limit 2 / min_turns 2) stays small/safe for
  testing.

## FIX 2 — EXACT sub-execution id (was: `GET /executions?workflowId=clone&limit=1` "latest")
- The reviewer's suggested `Fire Clone` `metadata.subExecution.executionId` is **NOT reachable from inside
  the workflow** — a Code node's `$input.first()` exposes only `["json","pairedItem"]`; item `metadata` is
  not passed to downstream nodes (verified at runtime). It exists only in the *persisted execution data*.
- Implemented exactness a robust, self-verifying way instead: keep latest-by-`workflowId` (which **is** exact
  under this orchestrator's strictly-sequential firing — each turn's `Fire Clone` waits for completion before
  the next), and **`Flatten RunData` now VERIFIES attribution**: it reads the fetched execution's
  `redis-pop-main-message-list` output `message.test_run_id` and asserts it equals the unique
  `"<golden_run_id>:<trigger_chat_history_id>"` this turn injected. **On any mismatch it throws** (refuses to
  write mis-attributed golden) — so mis-attribution is impossible-to-silently-pass, not just unlikely.
  (`test_run_id` is unique per (run,turn).)

## Validation (no full run yet)
- **get-access-types path exercised** ✅ — captured the first 4 turns of promotion conversation `445239397`
  (`conversation_ids='445239397', max_turns_per_conversation=4`) into `golden_run 7`. Turn 2
  ("Send me mocha bathroom furniture promotion") + turn 3 ("Mocha office") hit `intent_hint=check_promotion`
  → **`get-access-types` ran and is captured with `is_external=true, external_kind=read-access-types`**
  (its fixture/replay path now has golden data to pin from).
- **Exec-id EXACT** ✅ — the 4 turns captured 4 **distinct** `n8n_execution_id`s; spot-check: the row for
  turn `33378` has `n8n_execution_id=6773037`, and clone exec `6773037`'s `redis-pop` shows
  `test_run_id="7:33378"` = exactly this turn's marker (not merely "latest"). The verify-throw never fired.
- **RESUME proven** ✅ — Run A (`run_label='val-resume'`, `404280950`, `max_turns_per_conversation=1`)
  captured only turn 1 (partial, golden_run 8). Run B (same `run_label`, no cap) **reused golden_run 8**
  (no new run), `Purge Partial` dropped the partial turn-1, and all 3 turns were captured —
  **104 rows = 104 distinct (trigger,node,run) keys → zero duplicates**. Run C (same again) captured **0**
  new turns (conversation fully done), golden_run unchanged → idempotent.
- **Zero egress / n8n_test-only** ✅ — across the validation runs, the orphaned real-egress nodes
  (`send-message-*`, `update-human-intervened`, `save-session-vars` PUT) never ran; only the blocked send sub
  (`is_test`), guard records, and the `pg-upsert-session` write to `n8n_test` appear.

## READY for the full run — cost estimate (restate)
- Scope: 41 conversations / 2,216 turns. Per turn ≈ 1–2 LLM completions (~1.5–2.5k tokens) + 1 RAG embedding
  + up to 3 prod reads (resolve-entity, check-access, get-results MCP; `check-access` also writes 1 benign
  `mcp_access_log` row). Clone ≈ 8 s/turn + 2 s throttle ⇒ **~6 h wall-clock**; **~7–9k prod CRM/MCP reads**;
  **~one-time token spend** (capture is the only place tokens are spent — replay reuses the frozen outputs).
  Run off-peak, notify the CRM owner. Resumable, so a crash costs at most the one in-flight conversation.

## Golden RETENTION decision — recommend **KEEP ALL** (no truncation)
- Checked: the largest `output_json` is ≈ 12 KB (business result-sets — product lists from get-results), and
  **there are no raw embedding vectors in the golden**. The RAG node (`Execute 'sub-get-rag'`) outputs only
  `{tools:[{name,similarity}]}`; the embedding vectors live inside the get-rag *sub-execution*, which is not
  captured at the clone level. So the "truncate large RAG vectors" concern does not apply here.
- Size: `golden_run 6` (5 turns, 198 rows) = **704 KB** (output+input) ⇒ full corpus ≈ **~300–400 MB** golden.
  Manageable. **Recommendation: keep full `output_json` + `input_json`** (forensic value + they ARE the diff
  source). If a future flow change ever emits raw vectors at the clone level, drop/round them in the diff
  normalizer (like the `similarity` rounding) rather than truncating at capture.

## Validation artifacts left in place
- `golden_run 6` (replay-validated mini-baseline, 198 rows) and `golden_run 7` (`val-accesstypes`, 137 rows,
  includes the `get-access-types` fixtures) are kept. Delete them before minting the official full baseline if
  a clean `golden_runs` is wanted. The `val-resume` run was deleted.
- `golden_run 11` (`memberpick-name-resolve-20260701`, 377 rows / 11 turns) = the §15a–k member_offer
  name-reply baseline (feature `order-member-pick-name-resolve`, live @ df6ce019). It required **11 synthetic
  `chat_histories` rows** (ids 9150001–9150011, `conversation_id LIKE 'UAC15-%'`) to satisfy the `golden_nodes`
  FK. ⚠️ **A future full-corpus capture MUST exclude `conversation_id LIKE 'UAC15-%'`** (or delete `golden_run
  11` + those synthetic rows first), else they're captured as 11 stray 1-turn conversations polluting the
  baseline. Captured via the dedicated per-case driver `sorento-memberpick-capture` (`oQsdw8UNDwXBTRKt`).
