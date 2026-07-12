# Per-Node Golden-Master Regression Harness — `sorento-consume-main`

Status: PLAN (planner deliverable). No workflow edited, no execution run, no data loaded.
Author: planner agent. Source of truth for node facts: live n8n via `get_workflow_details`
(`9qVyfUxmRQqrpGRMDLRuz` consume-main, `Fss5aAaXthJSWpZCgKiKR` get-results, `XTODTw-dJcV0uRdC056hG`
reformulator) and the Sorento CRM backend (`/Users/tehjayson/Documents/foundryx/sorento_crm`).

This is a **sibling** sub-project to the UAC harness (`plans/plan.md` + `tests/UAC.md`). It reuses the
UAC clone's egress-safety layer wholesale and adds a record/replay layer + a session copy. Read
`plans/plan.md` §2 (kill-switch) and `tests/diffs/cycle-1-harness.md` (FAIL-CLOSED clone) first — this
plan assumes that foundation and does not re-derive it.

---

## 0. Goal + the LOCKED design (do not relitigate)

**Goal.** Lock the CURRENT behaviour of the chatbot as a golden baseline so future changes can't
silently regress. **Mechanism (n8n can't run nodes in isolation):** run the FULL flow once per
historical message, snapshot EVERY node's output via `get_execution(includeData:true)`, store as
golden. On a future change, replay the same 2,216 messages **hermetically** (every non-deterministic
input pinned) and diff each node's normalized output vs golden. Any unexpected per-node diff =
regression; intended diffs get re-blessed.

Locked decisions this plan designs to (from the brief):
1. **Granularity** = per-node golden master (full-flow run, snapshot every node).
2. **Determinism** = FULL PIN / hermetic replay. Pin the 2 LLMs (parser `Basic LLM Chain`/`gpt-4.1-mini`;
   reformulator sub `XTODTw-dJcV0uRdC056hG`/`gpt-5.4-mini`) and the live CRM reads (`resolve-entity`,
   `get-access-types`, `check-access`, get-results sub `Fss5aAaXthJSWpZCgKiKR`). Normalize timestamps.
   **Capture is free** (`get_execution` already records each read's response); **replay injects** the
   stored responses into the read nodes — that record/replay layer is the core new infra.
3. **session_vars** = a `respond_contacts` COPY in `n8n_test` (NOT pinned). In regression mode
   `get-session-vars` READS the copy and `save-session-vars` WRITES the copy (redirect, not block), so
   session evolves across turns. Seed from the 47 contacts' current prod state; RESET per conversation.
   Prod `respond_contacts` never touched.
4. **Turn model** = multi-turn, full ordered conversations: all 2,216 incoming messages, grouped per
   contact, replayed in `sent_at` order; session evolves in the copy; reset the copy per conversation.
5. **Egress** still fully blocked (reuse the FAIL-CLOSED guards from cycle-1).
6. **Scope** = 2,216 incoming (not deduped).

---

## 1. Corpus reality (verified against the CSV + live workflows) — read before designing

CSV: `/Users/tehjayson/Desktop/sorento_project/chat_histories - Sheet1.csv`, 48,477 rows.
Verified with a Python `csv` pass:

| Fact | Value | Consequence for the design |
|------|-------|----------------------------|
| `type='incoming'` rows | **2,216** | the replay corpus (SCOPE). |
| `type='outgoing'` rows | 2,422 | bot replies = expected final reply; 1,578 carry a non-null `result`. |
| rows with **empty/blank `type`** | **127** | CSV fragments (embedded newlines in long quoted `result`/`message` values that even a CSV parser leaves with blank type, plus a few genuinely blank rows). **The loader MUST filter to `type IN ('incoming','outgoing')`** and discard the rest. |
| distinct contacts (all) | **47** | the copy seeds 47 rows. |
| distinct **incoming** contacts | **41** | only 41 contacts actually drive turns. ⚠️ The brief's "47 contacts" = all contacts incl. outgoing-only; the replay touches **41**. Seed all 47 anyway (cheap), drive 41. |
| incoming rows with non-null `message_id` | **0** | ⚠️ **message_id is ALWAYS NULL on incoming.** Cannot key fixtures or the `?message_id` `referenced_result_set` injection on it. **Key everything on `chat_histories.id`** (the row PK, always present and unique). |
| incoming rows that look like media/audio | **0** | the audio/transcribe and attachment/presigned branches are **never exercised by this corpus**. Pin them for safety (§6) but expect them off-path. |
| top incoming contact | `437264483` (Jayson) = 802 msgs | the FULL-access happy-path contact; also the UAC test contact. |
| `result` column shape (outgoing) | `[{idx,uuid,label,product,filename,entity_type,attachment_type}, …]` | this is the **`compile-current-state.variables.last_result_set`** array (the result_set). Use as a coarse expected-result check, not a node fixture. |

`chat_histories` today is **EMPTY** and **MALFORMED**: it has a junk extra column
`"id\tchannel\tcontact_id… (integer)"` from a prior bad load. **DROP + recreate** (§3.1) before loading.

---

## 2. The regression clone

### 2.1 DECISION: a SEPARATE dedicated regression clone (duplicate the UAC clone, then layer on)

**Recommendation: build a new dedicated clone `sorento-consume-main REGRESSION` by UI-Duplicating the
existing FAIL-CLOSED UAC clone `txiPzSxy3Pclsz6v`, NOT by adding a "regression mode" branch to that
clone in place.**

Reasoning:
- The UAC clone already solves the hard, dangerous part: egress is **structurally** fail-closed (real
  send/write nodes have 0 inbound; the 3 shared subs are called with `is_test=true`; parser +
  reformulator have mock-bypass; control rides the redis item; Schedule Trigger deleted). Re-deriving
  that is wasteful and risky. **Duplicating inherits all of it**, proven, byte-for-byte.
- But regression behaviour **diverges** from UAC in two safety-relevant ways:
  - **reads:** UAC runs `resolve-entity`/`get-access-types`/`check-access`/get-results **LIVE against
    prod** every run. Regression must run them live only during CAPTURE, then **inject from fixtures**
    during REPLAY (0 prod read).
  - **session:** UAC **blocks** `save-session-vars` (orphaned). Regression must **redirect** it to the
    `n8n_test` copy (write), and redirect `get-session-vars` to READ the copy, so session evolves.
  Bolting both modes onto the single UAC clone via per-read `IF(mode)` branches multiplies the
  decision surface at every external node and makes a mode-selection bug able to cause a prod write
  (save-session-vars) or a prod read during replay. A **separate clone keeps the UAC clone's invariant
  "save-session-vars is unreachable" intact** (UAC never writes session at all) while the regression
  clone owns the redirect. Two clones, each with one clear behaviour, beats one clone with a mode
  multiplexer on the most dangerous nodes.
- Cost of a second clone is low: it's a UI Duplicate + a bounded set of read/session edits (§2.3).

**Mode field (within the regression clone).** The clone still needs two *internal* modes because
capture and replay differ at the read nodes and only there. Selected by a field in the redis item:

```
$('redis-pop-main-message-list').first().json.message.mode  ∈  "regress-capture" | "regress-replay"
```

| Behaviour | `regress-capture` | `regress-replay` |
|-----------|-------------------|------------------|
| `resolve-entity` / `resolve-entity-clarification` | LIVE (prod read) | INJECT fixture |
| `get-access-types` | LIVE | INJECT fixture |
| `check-access` | LIVE | INJECT fixture |
| get-results sub (`Fss5aAaXthJSWpZCgKiKR`) | LIVE (MCP read) | INJECT fixture |
| `get-presigned-url` | LIVE | INJECT fixture (§6) |
| parser `Basic LLM Chain` | LIVE *or* mock (see note) | mock (pinned) |
| reformulator sub | LIVE *or* mock | mock (pinned) |
| `get-session-vars` | READ copy (`n8n_test`) | READ copy |
| `save-session-vars` | WRITE copy | WRITE copy |
| all egress (send/assign/SLA/comment) | BLOCKED (inherited) | BLOCKED (inherited) |

> **Parser/reformulator during capture — important nuance.** To make the golden itself deterministic,
> CAPTURE should run the LLMs **once** and freeze their outputs as the parser/reformulator fixtures
> that replay reuses. Practically: capture runs the LLMs **live** (spending tokens once), records their
> output as golden + fixture; replay feeds those exact outputs back as `mock_parser_output` /
> `mock_reformulator_output` (the existing bypass). So the golden's parser output IS the replay pin —
> no separate "mock authoring" step. This is why FULL PIN is achievable without hand-writing mocks.

### 2.2 Inherited, unchanged from the UAC clone (do NOT rebuild)
- FAIL-CLOSED egress: `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`
  real-write nodes have 0 inbound; the 5 inline guard-record nodes + Guard H orphan; all shared-sub
  call sites pass `is_test=true`. (cycle-1-harness.md §"Guards".)
- `redis-pop-main-message-list` pops **`main-message-list-test`** (never prod `main-message-list`).
- Schedule Trigger DELETED (clone must have ZERO scheduleTrigger — re-verify each cycle).
- Parser bypass gate (`parser-bypass-gate` → `mock-parser-output` → `central-exchange`) keyed on
  `message.mock_parser_output`.
- Reformulator bypass lives inside sub `XTODTw-dJcV0uRdC056hG` (`test-reformulator-bypass` IF on
  `is_test && mock_reformulator_output`).

### 2.3 New edits the coder applies on the regression clone (delta vs UAC clone)

Five concrete changes, all on the clone only:

**(R1) Session redirect — `get-session-vars` → READ the copy.**
The live node is `httpRequest GET https://fe-sorento.foundryx.my/api/v1/external/conversation-variables/{id}`.
Replace with a **Postgres SELECT** against `n8n_test.respond_contacts_test` (or repoint the URL at a
local shim — Postgres node is cleaner and removes a prod dependency):
```sql
SELECT session_vars FROM respond_contacts_test WHERE respond_io_id = $1;
```
where `$1 = $('sorento-sub-respond-findcontact-respond').first().json.id`.
**Replicate the CRM's `?message_id` feature**: if the incoming item carries a `message_id`, the prod
endpoint injects `session_vars.referenced_result_set` = the `result` JSON of that chat-history row
(CRM `conversation_variables.py:58-65`). Mirror it:
```sql
-- only when message.message_id present (corpus: never, replyTo always null — keep for fidelity)
session_vars := session_vars || jsonb_build_object('referenced_result_set',
   (SELECT result::jsonb FROM chat_histories WHERE contact_id=$1 AND id=$2));
```
Output must match the CRM response shape `{ respond_io_id, session_vars:{…} }` so downstream
`Call 'sub-query-reformulator'` (which reads `previous_conversation_state`) sees the same object.

**(R2) Session redirect — `save-session-vars` → WRITE the copy.**
On the UAC clone this node is orphaned (Guard D records, real PUT unreachable). On the regression clone,
**replace the orphaned PUT with a Postgres UPDATE** wired in on the live path (fed by
`compile-current-state`), and ALSO keep the egress-record (so the run still logs what it wrote):
```sql
UPDATE respond_contacts_test
   SET session_vars = CAST($2 AS jsonb), updated_at = NOW()
 WHERE respond_io_id = $1;          -- $1 = contact respond_io_id, $2 = JSON.stringify($json)
```
This is the **only intentional write in regression mode** and it targets `n8n_test`, never prod. The
prod `save-session-vars` PUT node stays orphaned/0-inbound (kept for diff parity).

**(R3) Read record/replay IF in front of each pinned read node.** Pattern (mirrors `parser-bypass-gate`):
for each of `resolve-entity`, `resolve-entity-clarification`, `get-access-types`, `check-access`,
`get-presigned-url` — insert `IF mode==='regress-replay' AND fixture present`:
- TRUE → a small `code` node that returns the stored fixture (shape-identical to the live response),
  bypassing the httpRequest;
- FALSE → the real httpRequest (live read; used in capture).
Fixtures arrive in the redis item under `message.fixtures.<nodeName>` (§4.2). Capture mode always takes
FALSE (live) and the fixture is harvested from `get_execution`.

**(R4) get-results record/replay at the sub call site.** `Call 'sub-get-results'` (executeWorkflow →
`Fss5aAaXthJSWpZCgKiKR`). Extend the shared get-results sub with a mock-bypass exactly like the
reformulator sub: a top IF `is_test && mock_results` → return `{output: mock_results}` (the captured
`output-structurer` envelope) at 0 cost; else run the live deterministic `entity-ids-transformer →
MCP Client1 → output-structurer` path. The clone's call site passes `is_test=true` and, in replay,
`mock_results = message.fixtures['get-results']`. **Note: the gpt-5.4-mini `AI Agent` in this sub is
ORPHANED** (confirmed: 0 inbound main) — get-results spends **zero LLM tokens** today; the fixture is
the deterministic MCP envelope.

**(R5) Mode plumbing.** Add a `mode` reader (`message.mode`) used only by R3/R4 IF conditions.
Capture vs replay never touches the egress branch (still fail-closed regardless of `mode`).

> **Safety invariant preserved:** even in `regress-capture`, the only prod *writes* possible are the
> blocked egress (send/assign/SLA/comment — all still 0-inbound) and `save-session-vars` (now
> redirected to `n8n_test`). Prod CRM/respond.io receive **reads only** during capture, **nothing**
> during replay.

---

## 3. Storage schema

All in the dedicated **`n8n_test` database on `72.62.195.19:5432`** (user `n8n_user`, password
`your_secure_password`). This server hosts only the `n8n` operational DB + `postgres`; the prod CRM /
`respond_contacts` is **not** here, so `n8n_test` is fully isolated from prod. It is reachable from
**both** the host (psql — one-off setup: DDL, CSV load, contact seeding) **and** the remote self-hosted
n8n (in-workflow Postgres nodes — session redirect + golden storage + orchestration reads). This makes
the in-workflow design viable and prod-safe.

- **In-workflow Postgres nodes** use an **n8n Postgres credential pointing at `n8n_test@72.62.195.19`** —
  coder/user must create it (prereq §8; if MCP can't create credentials, the user creates it in the UI).
- **Host-side psql** (setup only) connects to the same `n8n_test@72.62.195.19` as `n8n_user`.

> Note: the tables I inspected during planning (`chat_histories` malformed, `test_results` ≈3,066 rows)
> were on a **prior localhost instance**, not `.19`. The authoritative target is now `.19`; assume it may
> be fresh/empty and recreate `chat_histories` + the regression tables there regardless (§3.1).

### 3.1 `chat_histories` — fix + load (the corpus)

The current table is malformed (junk column). DDL to recreate (drop the junk column; keep the indexes
the loader needs):
```sql
DROP TABLE IF EXISTS chat_histories CASCADE;   -- test_results FK is ON DELETE SET NULL; recreate after
CREATE TABLE chat_histories (
  id           bigint PRIMARY KEY,             -- CSV id (strip thousands separators: "34,667" -> 34667)
  channel      varchar(32)  NOT NULL,
  contact_id   varchar(128) NOT NULL,          -- = respond.io id = respond_io_id (lookup key)
  phone_number varchar(32)  NOT NULL,
  message      text         NOT NULL,
  sent_at      timestamp    NOT NULL,
  first_name   varchar(255),
  last_name    varchar(255),
  type         varchar(32)  NOT NULL,          -- 'incoming' | 'outgoing'
  created_at   timestamp    NOT NULL DEFAULT now(),
  message_id   varchar(50),                    -- always NULL on incoming (verified)
  result       jsonb                           -- outgoing result_set; CSV "[NULL]" -> SQL NULL
);
CREATE INDEX ix_ch_contact_sent_id ON chat_histories (contact_id, sent_at, id);
CREATE INDEX ix_ch_type ON chat_histories (type);
```
**Load rules (HOST-SIDE setup — psql `\copy` or a small one-off script to `n8n_test@.19`; NOT the
orchestrator workflow):**
- Use a real CSV parser (handles the embedded-newline quoted `result`/`message`).
- **Filter `type IN ('incoming','outgoing')`** — drop the 127 blank/fragment rows.
- `id`: strip commas → bigint. `result`/`message_id`: map literal `"[NULL]"` → NULL; `result` parses as
  JSON (it's a JSON array string).
- `sent_at`: parse `YYYY-MM-DD H:MM:SS`.

**Deriving conversations + turns (a view, not a column):**
```sql
CREATE VIEW v_turns AS
SELECT i.id                       AS trigger_chat_history_id,
       i.contact_id              AS conversation_id,
       row_number() OVER (PARTITION BY i.contact_id ORDER BY i.sent_at, i.id) AS turn_index,
       i.message                 AS user_message,
       i.sent_at,
       o.message                 AS expected_reply,        -- next outgoing same contact
       o.result                  AS expected_result_set
FROM   chat_histories i
LEFT JOIN LATERAL (
   SELECT message, result FROM chat_histories o
   WHERE o.contact_id=i.contact_id AND o.type='outgoing' AND o.sent_at>=i.sent_at
   ORDER BY o.sent_at, o.id LIMIT 1
) o ON true
WHERE i.type='incoming';
```
Conversation = all incoming of one `contact_id` ordered by `(sent_at,id)`. Turn = each incoming. Expected
final reply = the first outgoing at/after the incoming's timestamp. (Imperfect when multiple incoming
precede one outgoing — flag §8; the per-node golden, not the expected_reply, is the real oracle.)

### 3.2 Golden master tables (the per-node snapshot)

```sql
-- one row per capture run (immutable golden version)
CREATE TABLE golden_runs (
  id           bigserial PRIMARY KEY,
  label        text NOT NULL,                  -- e.g. 'baseline-2026-06-27'
  workflow_id  varchar(64) NOT NULL,           -- the regression clone id captured from
  git_ref      text,                           -- subrepo commit of the clone snapshot
  captured_at  timestamptz NOT NULL DEFAULT now(),
  notes        text
);

-- THE GOLDEN: per (conversation, turn, node, run) input/output + normalized hash.
CREATE TABLE golden_nodes (
  id               bigserial PRIMARY KEY,
  golden_run_id    bigint NOT NULL REFERENCES golden_runs(id) ON DELETE CASCADE,
  conversation_id  varchar(128) NOT NULL,
  turn_index       int NOT NULL,
  trigger_chat_history_id bigint NOT NULL REFERENCES chat_histories(id) ON DELETE CASCADE,
  n8n_execution_id varchar(64) NOT NULL,       -- provenance
  node_name        text NOT NULL,
  node_type        text NOT NULL,
  run_index        int NOT NULL DEFAULT 0,     -- a node can execute >1x per flow (loops); 0-based
  input_json       jsonb,                      -- node input items (optional/large; may be omitted for big nodes)
  output_json      jsonb NOT NULL,             -- node output items (the golden)
  output_norm_hash text NOT NULL,              -- sha256 of normalized output (§5.2)
  is_external      boolean NOT NULL DEFAULT false,  -- LLM/read fixture? doubles as the replay fixture
  external_kind    text,                       -- 'llm-parser'|'llm-reformulator'|'read-resolve-entity'|
                                               -- 'read-access-types'|'read-check-access'|'read-get-results'|
                                               -- 'read-presigned-url'
  UNIQUE (golden_run_id, trigger_chat_history_id, node_name, run_index)
);
CREATE INDEX ix_gn_run_trigger ON golden_nodes (golden_run_id, trigger_chat_history_id);
CREATE INDEX ix_gn_external ON golden_nodes (golden_run_id, trigger_chat_history_id, external_kind)
  WHERE is_external;
CREATE INDEX ix_gn_hash ON golden_nodes (golden_run_id, node_name, output_norm_hash);
```
The **replay fixtures are just the `is_external=true` subset of `golden_nodes`** — no separate fixture
table. The replay orchestrator selects them per `trigger_chat_history_id` and packs them into the redis
item's `fixtures`/`mock_*` fields (§4.2).

### 3.3 Replay + diff tables

```sql
CREATE TABLE replay_runs (
  id            bigserial PRIMARY KEY,
  golden_run_id bigint NOT NULL REFERENCES golden_runs(id),  -- baseline compared against
  label         text NOT NULL,                 -- e.g. 'after-change-XYZ'
  git_ref       text,
  replayed_at   timestamptz NOT NULL DEFAULT now(),
  summary       jsonb                          -- {turns, nodes, matches, regressions, volatile, missing, new}
);

CREATE TABLE replay_node_diffs (
  id              bigserial PRIMARY KEY,
  replay_run_id   bigint NOT NULL REFERENCES replay_runs(id) ON DELETE CASCADE,
  trigger_chat_history_id bigint NOT NULL,
  node_name       text NOT NULL,
  run_index       int NOT NULL DEFAULT 0,
  golden_norm_hash text,
  replay_norm_hash text,
  diff_status     text NOT NULL,               -- 'match'|'regression'|'volatile'|'missing'|'new'
  diff_json       jsonb,                        -- structural delta (only when not match/volatile)
  blessed         boolean NOT NULL DEFAULT false,
  UNIQUE (replay_run_id, trigger_chat_history_id, node_name, run_index)
);
CREATE INDEX ix_rnd_status ON replay_node_diffs (replay_run_id, diff_status);
```

### 3.4 `respond_contacts_test` — the session copy

```sql
CREATE TABLE respond_contacts_test (
  respond_io_id     varchar(128) PRIMARY KEY,  -- = chat_histories.contact_id
  phone_number      varchar(32),
  first_name        varchar(255),
  last_name         varchar(255),
  workspace_id      uuid,                       -- if needed for space match; access reads are pinned, so optional
  session_vars      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- evolves across a conversation
  seed_session_vars jsonb NOT NULL DEFAULT '{}'::jsonb,   -- reset baseline (immutable)
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```
- **Seed (one-time, HOST-SIDE setup):** for each of the 47 contacts, GET prod
  `/api/v1/external/conversation-variables/{respond_io_id}` (a READ, safe) → upsert into
  `respond_contacts_test@.19` with both `session_vars` and `seed_session_vars` = that snapshot. Run from
  the host (curl + psql to `.19`); not part of the orchestration workflow. (Mirrors `respond_contacts.session_vars`, CRM
  `access.py:120`; the path param is `respond_io_id`, CRM `conversation_variables.py:33`.)
- **Reset per conversation (orchestrator, before each contact's turn-1):**
  `UPDATE respond_contacts_test SET session_vars = seed_session_vars, updated_at=now() WHERE respond_io_id=$1;`
- **Fidelity caveat (§8):** the historical *initial* session at the time each conversation started is
  not recoverable; we reset to a single captured current snapshot. Golden capture and replay both use
  the same seed, so the diff is still valid (both sides identical baseline); only absolute fidelity to
  the original live run is approximate. Access types/agents are NOT columns here — those reads are pinned
  via fixtures, so the copy needs only `session_vars`.

### 3.5 What about the existing `test_results`?
Leave it. It is judge/message-grained (`output_messages`, `expected_messages`, `score`, `judge_notes`)
and serves the UAC harness. The regression harness is **node-grained** and uses the new tables above.
The `test_results.trigger_chat_history_id` FK is recreated after the `chat_histories` rebuild.

---

## 4. Capture orchestration

### 4.1 Driver = a reusable n8n ORCHESTRATOR WORKFLOW

The orchestration is a **single reusable n8n workflow** `sorento-regression-orchestrator` (NOT an
external script), parameterised by a manual-trigger / `executeWorkflowTrigger` input:
`{ run_mode: "capture" | "replay", golden_run_id, replay_run_id?, contact_filter?, resume:true }`. It is
re-runnable for every future regression cycle. It owns the loop, the per-conversation reset, the redis
injection, firing the clone, harvesting per-node data, and writing golden/diff rows — all via n8n nodes
against `n8n_test@.19`.

**Execution-data capture mechanism — DECISION: n8n REST API `GET /executions/{id}?includeData=true`,
NOT inline-persist.**

Reasoning:
- **Inline-persist** (every clone node writes its own I/O to `n8n_test`) is rejected: it would add ~75
  persist nodes to the clone, and — fatally — **those persist nodes would themselves become nodes in the
  golden**, polluting the very graph we golden-master and diverging the clone's structure from live. It's
  also fragile (every new node needs a paired writer) and can't capture node *input*.
- **REST API** keeps the clone byte-clean (its node graph stays a faithful copy of live for diffing),
  captures **all** nodes uniformly (including ones we didn't anticipate) with both input and output, in
  one call. n8n persists full `runData` per execution; `GET /api/v1/executions/{id}?includeData=true`
  returns `data.resultData.runData` = `{ "<nodeName>": [ { data.main[0][…], source, … }, … ] }` (one
  array entry per node run → gives us `run_index` for free).

**Orchestrator node graph (per turn):**
1. **Postgres SELECT** the next un-captured turn from `v_turns` (ordered `conversation_id, turn_index`),
   skipping turns already in `golden_nodes` for this `golden_run_id` (resume/idempotency). At a
   conversation boundary, first run the **reset UPDATE** (`respond_contacts_test.session_vars =
   seed_session_vars WHERE respond_io_id = <conversation_id>`).
2. **Build redis item** (Code node; §4.2). In `replay` mode, a prior Postgres SELECT pulls this turn's
   `is_external` golden rows and packs `mock_parser_output` / `mock_reformulator_output` / `fixtures` /
   `mock_results`.
3. **Redis RPUSH** `main-message-list-test` ← the item.
4. **Fire the clone** via `executeWorkflow` (→ regression clone). The clone pops exactly one item, runs,
   and its final node **returns `{ execution_id: $execution.id }`** back to the orchestrator. (Coder
   verify: sub-executions are persisted & retrievable by id; **fallback** if not — query
   `GET /api/v1/executions?workflowId=<cloneId>&limit=1` ordered by `startedAt desc`, safe because the
   orchestrator is strictly sequential, one clone run at a time.)
5. **httpRequest** `GET {N8N_BASE}/api/v1/executions/{execution_id}?includeData=true`, header
   `X-N8N-API-KEY` (an n8n API-key credential; prereq §8).
6. **Code: flatten + normalize.** Walk `runData`: for each node, for each run (→ `run_index`) extract
   input + output, apply normalization (§5.2), `sha256` the normalized output.
7. **Postgres INSERT** the rows: `golden_nodes` (capture) or `replay_node_diffs` after comparing each
   `output_norm_hash` to the baseline `golden_nodes` (replay; §5).
8. **Wait** node (throttle) → loop to next turn.

The loop is a `splitInBatches` (or a self-referencing executeWorkflow) over conversations→turns.
Host-side psql does the one-off setup (DDL, CSV load, contact seeding); the orchestrator workflow does
everything per-turn at run time.

- **Idempotency / resume:** the `UNIQUE(golden_run_id, trigger_chat_history_id, node_name, run_index)`
  + the step-1 "skip already-captured" SELECT make a re-run resume mid-corpus. Resume restarts at a
  conversation boundary (re-running a few already-done turns of that conversation is cheap and rebuilds
  the session copy correctly).
- **Throttle:** the Wait node bounds prod read-load (§8). ~2,216 turns ×
  {resolve-entity ±clarification, get-access-types, check-access, get-results MCP} ≈ **8–11k prod reads**
  for a full capture — run off-peak, announce to whoever owns the CRM.
- **Determinism of the golden itself:** capture runs the 2 LLMs live ONCE; their outputs are frozen as
  `is_external` golden rows and become the replay pins (§2.1 note). Capture is the *only* time tokens are
  spent; replay reuses the frozen outputs.

### 4.2 Redis item shape (capture + replay) — extends cycle-1's schema

```jsonc
{
  "message":   { "text": "<chat_histories.message>" },     // tf-message reads .message.message
  "contact":   { "id":"<contact_id>", "phone":"<phone_number>",
                 "firstName":"<first_name>", "lastName":"<last_name>",
                 "assignee": { "id": "<synth-or-captured>" }, "customFields": {} },
  "messageId": "<chat_histories.id>",                       // key = row PK (message_id is NULL!)
  "replyTo":   null,

  "mode": "regress-capture",                                // | "regress-replay"
  "trigger_chat_history_id": 34667,                         // the golden/diff key
  "test_run_id": "golden-<golden_run_id>-<id>",             // scopes redis egress list
  "scope": "deterministic",

  // CAPTURE: omit (LLMs run live, reads run live). REPLAY: populated from golden_nodes is_external subset:
  "mock_parser_output":       { /* frozen parser output */ },
  "mock_reformulator_output": { /* frozen reformulator output.output */ },
  "fixtures": {
    "resolve-entity":               { /* frozen response */ },
    "resolve-entity-clarification": { /* … */ },
    "get-access-types":             [ /* … */ ],
    "check-access":                 { /* … */ },
    "get-presigned-url":            { /* … */ }
  },
  "mock_results": { /* frozen get-results output-structurer envelope */ }
}
```
Contact fixture: `id/phone/first/last` come straight from the CSV row. `assignee.id`/`customFields`
aren't in the CSV; since egress is blocked they don't affect safety, but `assignee.id` can change the
human-intervention branch input — capture one contact fixture per contact during host-side seeding (a
respond.io or CRM read) OR synthesize a stable placeholder. Recommend storing per-contact
`assignee.id`/`customFields` alongside the session copy in `n8n_test` (add columns to
`respond_contacts_test`, or a small `contacts_test` table) so the orchestrator reads them inline — keeps
all run inputs in the DB, no file fixtures (prereq §8).

---

## 5. Replay + diff

### 5.1 Replay run (future change, fully hermetic)
Same loop as §4.1 with `mode='regress-replay'`, `golden_run_id` = the baseline, and each item populated
with that turn's `mock_parser_output` / `mock_reformulator_output` / `fixtures` / `mock_results` selected
from `golden_nodes WHERE is_external AND trigger_chat_history_id=…`. Session copy is reset per
conversation and evolves via the redirected `save-session-vars` (so a node that changed *how* session is
written will surface as a diff on later turns — desired). Result: **0 tokens, 0 prod reads, 0 egress, 0
prod writes** (only `respond_contacts_test` is written). For each node, compute `replay_norm_hash` and
compare to `golden_nodes.output_norm_hash`; write `replay_node_diffs`.

### 5.2 Normalization (defines regression vs volatile) — THE diff oracle

Normalize each node's output before hashing. Two layers:

**(N1) Global normalizers (every node):**
- Replace any ISO-8601 / epoch-ms timestamp value with the sentinel `"<TS>"`. Covers `new Date()`,
  `$now`, `sent_at`, `updated_at`, `created_at`.
- Replace n8n execution/run ids, and any 32+ hex / UUID-shaped *generated* id with `"<ID>"` — but
  **do not** mask business UUIDs that come from fixtures (product `uuid`, entity ids are part of the
  golden and must diff). Distinguish by field name allowlist, not by shape (§ coder builds the field map).
- Sort arrays that the workflow treats as unordered only where order is non-deterministic (default: keep
  order; flag specific nodes if needed).

**(N2) Node-specific normalizers (from the §6 audit):**
| Node | Normalize |
|------|-----------|
| `Call 'sub-respond-save-message-redis'2` | `sent_at` (×2 `new Date().getTime()`). **Orphaned on the clone (Guard H)** → off-path → usually no output to normalize, but cover it. |
| `get-presigned-url` | strip the signed-URL query (`?X-Amz-…`/signature/expiry); keep path. In replay it's pinned, so this only matters during capture. |
| `Transcribe a recording` | Whisper output — non-deterministic. Off-corpus (0 audio). If ever hit, pin via payload transcript. |
| reformulator `AI Agent` / parser `Basic LLM Chain` | pinned in replay → their output equals the golden by construction; their `$now`-laced prompts never reach output. |
| Postgres-write `save-session-vars` (redirected) | `updated_at` → `<TS>`. |

**Diff status rules:**
- hash equal → `match`.
- hash differs, node in the **volatile allowlist** (the N2 set whose variance is expected/inherent:
  presigned-url, transcribe, save-message-redis ts) → `volatile` (informational, never a regression).
- hash differs, node NOT volatile → **`regression`** (the signal).
- node present in golden, absent in replay → `missing` (a node stopped executing — often a real
  regression: a branch changed). node present in replay, absent in golden → `new`.

A replay PASSES (no regression) iff `replay_node_diffs` has **zero `regression`/`missing`/`new`** rows
(volatile/match only). One deliberately-injected node change MUST surface as ≥1 `regression` row
(UAC criterion).

### 5.3 Re-bless workflow (intended changes)
When a change *intends* to alter behaviour, its diffs are expected. Re-bless = promote the new outputs
to a new immutable golden version:
1. Review `replay_node_diffs WHERE diff_status IN ('regression','missing','new')` for the replay run;
   confirm each is intended.
2. Mark them `blessed=true`.
3. Mint a **new `golden_runs` row** (new version) = the prior golden with the blessed turns/nodes
   replaced by the replay outputs (fork-and-apply). Never edit a golden version in place (auditability).
   Simplest implementation: re-run a fresh **capture** on the changed clone to mint the new baseline,
   and keep the old golden_run for history. (Capture-to-rebless is clean but spends tokens once;
   fork-apply from the replay outputs is cheaper but must also refresh the `is_external` fixtures.)
4. Future replays compare against the new `golden_run_id`.

---

## 6. Non-determinism audit (live workflow scan — findings)

Scanned consume-main (`9qVyfUxmRQqrpGRMDLRuz`), get-results (`Fss5aAaXthJSWpZCgKiKR`), reformulator
(`XTODTw-dJcV0uRdC056hG`) for `new Date(`, `Date.now`, `$now`, `$today`, `Math.random`, `uuid`, `crypto`,
`randomUUID`, `$execution.id`, `$runIndex`.

**Genuine non-determinism (needs normalization or pinning):**
1. **`Call 'sub-respond-save-message-redis'2`** (consume-main, executeWorkflow) — `"sent_at": new
   Date().getTime()` (×2, one expression + one in a JSON blob). Wall-clock. **ORPHANED on the clone
   (Guard H, cycle-1)** → off-path; normalize defensively (N2).
2. **`get-presigned-url`** (consume-main, httpRequest POST `/external/presigned-url`) — response carries
   a signed URL with signature/expiry → varies per call. **Normalize (N2) + PIN in replay (R3).**
   Off-corpus (0 attachment messages) but covered.
3. **`Transcribe a recording`** (consume-main, langchain.openAi Whisper) — STT output non-deterministic.
   **Off-corpus (0 audio)**; pin via payload transcript if ever exercised.
4. **reformulator `AI Agent`** (`gpt-5.4-mini`, LIVE) — LLM + `CURRENT DATE: {{ $now… }}` in the system
   prompt → date- and sampling-dependent. **PINNED** (`mock_reformulator_output`, existing bypass).
5. **parser `Basic LLM Chain` / `OpenAI Chat Model`** (`gpt-4.1-mini`, LIVE) — LLM. **PINNED**
   (`mock_parser_output`, existing bypass).
6. **get-results `AI Agent`** (`gpt-5.4-mini`) — has `$now` in prompt but is **ORPHANED** (0 inbound
   main); live path is deterministic `MCP Client1 → output-structurer`. The MCP read is **PINNED** (R4).

**False positives (deterministic given input — no action):**
- `output_exchange`, `output-structurer` (get-results): `new Date(isoString)` parse an *input* ISO →
  deterministic. `entity-ids-transformer`, `compile-current-state`, `disallowed-entity-gate`: all `uuid`
  hits are *reads* of input fields, no generation.
- No `Math.random`/`randomUUID`/`crypto`/`$execution.id`/`$runIndex` anywhere.

**Live reads not yet pinned that replay MUST pin (else replay hits prod):**
- `resolve-entity` + `resolve-entity-clarification` → POST `/api/v1/system/references/resolve`
  (CRM `references.py:1339`). Response: `{resolutions[{token,resolved,ambiguous,matches[{entity_type,
  canonical_code,uuid,match_field,match_tier,display}]}], unresolved_tokens, ambiguous_tokens, empty}`.
- `get-access-types` → GET `/api/v1/external/contact-access-types/active?contact_id&space_id`
  (CRM `contact_access_types.py:20`). Response: `[{name, keywords[]}]` (service truth, not the docstring).
- `check-access` → POST `/api/v1/external/access-agent/check` (CRM `access_agent.py:20`). Response:
  `{allowed, decision, agent_name}` (`decision ∈ allow|deny_no_access|deny_unknown_agent|deny_unknown_contact`).
  ⚠️ each live call writes an `mcp_access_log` row — a prod side effect during CAPTURE (read-ish; benign
  log). Acceptable for capture; zero in replay (pinned).
- get-results MCP server `http://72.62.195.20:8765/mcp` → pinned via R4. Envelope = `output-structurer`
  output (`ListResponse`-derived `{data[], pagination, empty, fallback_used, resolved_entities}`).
- `get-presigned-url` → pinned (R3).
**Session reads/writes** (`get-session-vars` GET, `save-session-vars` PUT
`/external/conversation-variables/{id}`, CRM `conversation_variables.py:33/68`) are **redirected to the
copy** (R1/R2), not pinned.

---

## 7. Pipeline for this sub-project (planner → coder → tester → reviewer)

- **planner (this doc + `tests/regression-UAC.md`).** Done when both exist, the clone strategy + mode
  field + record/replay wiring + schema DDL + load/seed/reset are specified, and the audit lists every
  node needing normalization/pinning.
- **coder.** Builds: (1) a NEW regression clone (UI-Duplicate of `txiPzSxy3Pclsz6v` → keep the egress
  fail-closed layer) with R1–R5 (§2.3) + the get-results `mock_results` bypass; (2) the
  `sorento-regression-orchestrator` workflow (§4.1) with the REST-API capture mechanism; (3) the schema
  DDL (§3). Creates the `n8n_test@.19` Postgres credential **and** the n8n API-key credential (or flags
  for the user to make them in the UI). Provides the host-side setup SQL/scripts (DDL, CSV load, contact
  seeding) for the user/host to run via psql to `.19`. Produces a node-diff `tests/diffs/regression-clone.md`
  for the reviewer. Done when the clone + orchestrator validate, the clone has ZERO scheduleTrigger, and a
  1-message dry capture writes golden_nodes rows.
- **tester.** Runs the **orchestrator workflow in capture mode on a SMALL sample first (~2 conversations,
  one a short `437264483` slice)**; then a **capture→replay self-check** on that sample (run it in replay
  mode immediately, expect ZERO regression diffs = the harness is deterministic) BEFORE the full 2,216
  capture. Then full capture → mint baseline `golden_run`. Done when the small sample shows 0 false
  positives and every safety check (regression-UAC §0) passes.
- **reviewer.** Verifies: (1) determinism — an unchanged replay = 0 `regression` diffs; a planted node
  change IS caught; (2) prod-safety — replay logs show 0 prod reads, 0 tokens, 0 egress, 0 prod writes;
  only `respond_contacts_test` written; (3) no prod `respond_contacts`/session ever touched; (4) the
  egress fail-closed layer is intact on the clone. Done when approved + zero-egress/zero-prod-write
  re-confirmed.

`scope:` tag for this sub-project = a new tier **`regression`** (all reads + LLMs pinned, structural +
hash diffing). It supersedes the per-case parser/get-results tiers during a regression run.

---

## 8. Prerequisites & risks (top of the list = highest)

1. **Prod read-load of the capture run.** A full capture = ~8–11k prod CRM/MCP reads + ~2,216×2 LLM
   calls (one-time token cost). Throttle, run off-peak, and notify the CRM owner. `check-access` writes
   an `mcp_access_log` row per call (≈2,216 benign log rows in prod). **Confirm this is acceptable.**
2. **`message_id` is NULL on all 2,216 incoming** → all keying is on `chat_histories.id`. The CRM's
   `?message_id` `referenced_result_set` injection (R1) therefore never fires for this corpus
   (`replyTo` always null). Keep the mechanism for fidelity but expect it dormant.
3. **CSV load hygiene:** drop the 127 blank/fragment rows (embedded newlines in quoted `result`); strip
   thousands-separators from `id`; map `"[NULL]"` → NULL; `result` → jsonb. Recreate the malformed
   `chat_histories` table first.
4. **Copy seeding needs the 47 contacts' prod `session_vars`** — GET
   `/external/conversation-variables/{respond_io_id}` per contact (47 reads, safe). **Fidelity caveat:**
   historical initial session at conversation start is unrecoverable; we reset to one current snapshot.
   Both golden and replay use the same seed, so diffs stay valid; absolute fidelity is approximate.
5. **Storage size:** ~2,216 turns × ~75 nodes (some multi-run) ≈ **170–250k `golden_nodes` rows**, each
   holding input+output JSONB. Could be low-GB. Mitigations: store `output_json` always but `input_json`
   only for nodes the diff inspects; truncate/omit huge RAG/embedding payloads; rely on `output_norm_hash`
   for the fast diff and keep full JSON for forensics only. **Decide retention before full capture.**
6. **`save-session-vars` redirect is the one regression-mode write** — it MUST target `n8n_test@.19`
   only. Prereq: the n8n Postgres credential is scoped to `n8n_test@72.62.195.19` (a server that does NOT
   host prod CRM/respond_contacts — so even a wrong DB name there can't hit prod); reviewer re-confirms
   the prod PUT node stays 0-inbound. Gate hard.
7. **`result`-column semantics:** it is the outgoing `last_result_set` (`{idx,uuid,label,product,
   filename,entity_type,attachment_type}`), useful as a coarse expected-result check, **not** a node
   fixture. The real oracle is the per-node golden, not `expected_reply`/`result`.
8. **Message→item mapping:** CSV row → cycle-1 redis item (§4.2). `message.message.text` = CSV `message`;
   `messageId` = row id; `contact` synthesized from CSV (+ optional captured `assignee.id`/`customFields`
   fixture). Multiple consecutive incoming before one outgoing makes `expected_reply` ambiguous (the
   `v_turns` LATERAL picks the first outgoing ≥ the incoming) — golden diffing is unaffected.
9. **get-results sub is shared+published** — adding the `mock_results` bypass touches a node prod also
   uses. Mirror the reformulator pattern exactly (bypass fires only on `is_test=true`, which prod never
   passes). Reviewer re-confirms prod callers don't trigger it.
10. **Credentials to create (prereq):** (a) an n8n **Postgres credential** for `n8n_test@72.62.195.19`
    (`n8n_user`/`your_secure_password`); (b) an n8n **API-key** for the orchestrator's
    `GET /executions/{id}?includeData=true` capture call. If MCP can't create credentials, the user
    creates both in the n8n UI — flag and block on it.
11. **Sub-execution data retrievability** (§4.1 step 4) — confirm the clone, fired via `executeWorkflow`,
    produces an execution record whose `runData` is retrievable by id through the REST API. If
    sub-executions aren't separately persisted, use the documented fallback (`GET /executions?workflowId=
    <cloneId>&limit=1`, safe under strictly-sequential orchestration). Open question for the coder.
12. **41 vs 47 contacts** — replay drives 41 (incoming) contacts; seed all 47. Don't expect turns for the
    6 outgoing-only contacts.
13. **DB connectivity — RESOLVED.** `n8n_test@72.62.195.19:5432` is reachable from both the host (setup
    via psql) and the remote self-hosted n8n (in-workflow Postgres nodes), and is isolated from prod
    (no CRM/respond_contacts on that server). The earlier "container/localhost unreachable" caveat no
    longer applies.

---

## Appendix A — node-name crib (exact names, for the coder)

consume-main reads/writes: `resolve-entity`, `resolve-entity-clarification`, `get-access-types`,
`check-access`, `get-session-vars`, `save-session-vars`, `get-presigned-url`, `send-message-files`,
`send-message-images`, `send-message-video`, `update-human-intervened`. LLM: `Basic LLM Chain` +
`OpenAI Chat Model` (gpt-4.1-mini), `Transcribe a recording`. Sub calls: `Call 'sub-query-reformulator'`,
`Call 'sub-get-results'`, `Execute 'sub-get-rag'`, `Call 'sub-respond-save-message-redis'2`,
`Call 'sub-human-intervention'`. State: `central-exchange`, `compile-current-state`,
`construct-user-prompt`, `tf-message`, `sorento-sub-respond-findcontact-respond`,
`redis-pop-main-message-list` (list `main-message-list-test` on the clone).
get-results sub: live path `When Executed → entity-ids-transformer → MCP Client1 → output-structurer`;
orphaned `AI Agent` (gpt-5.4-mini). reformulator sub: `test-reformulator-bypass` IF →
`mock-reformulator-output` | `AI Agent`(gpt-5.4-mini) → `output_exchange`.

## Appendix B — CRM read-endpoint shapes (fixture authoring reference)
- resolve: `POST /api/v1/system/references/resolve` → `{resolutions[{token,resolved,ambiguous,
  matches[{entity_type,canonical_code,uuid,match_field,match_tier,display{…}}]}], unresolved_tokens,
  ambiguous_tokens, empty}` (CRM `app/api/v1/system/references.py:1339`, `:181-191`, `:250-282`).
- access-types: `GET /api/v1/external/contact-access-types/active` → `[{name, keywords[]}]`
  (CRM `app/api/v1/external/contact_access_types.py:20`, service `contact_access_type_service.py:314`).
- access-check: `POST /api/v1/external/access-agent/check` → `{allowed, decision, agent_name}`
  (CRM `app/api/v1/external/access_agent.py:20`).
- get-results family: `ListResponse` `{data[], pagination{total,page,limit}, empty, fallback_used,
  resolved_entities}` (CRM `app/schemas/common.py:29`); chatbot sees `output-structurer`'s envelope.
- conversation-variables: `GET/PUT /api/v1/external/conversation-variables/{respond_io_id}` →
  `{respond_io_id, session_vars{…}}`; PUT overwrites `session_vars` wholesale
  (CRM `app/api/v1/external/conversation_variables.py:33/68`, model `app/models/access.py:120`).
