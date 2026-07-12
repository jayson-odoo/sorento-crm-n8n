# Regression harness — DB setup notes

Database layer for the per-node golden-master regression harness.
Target: `n8n_test @ 72.62.195.19:5432` (user `n8n_user`), isolated from prod CRM.
All DDL + load/seed SQL lives in `schema.sql` (idempotent, re-runnable).
Design source of truth: `../../plans/regression-plan.md` §3.

Run:
```
PGPASSWORD='your_secure_password' psql -h 72.62.195.19 -p 5432 -U n8n_user -d n8n_test -f schema.sql
```

## Tables created (with row counts)

| Object | Type | Rows | Purpose |
|--------|------|------|---------|
| `chat_histories_raw` | table | 4,765 | **Untouched** raw TEXT load (the immutable source). Not in schema.sql. |
| `chat_histories` | table | **4,638** (2,216 incoming / 2,422 outgoing, 41 contacts) | Clean, typed corpus derived from `_raw`. |
| `v_turns` | view | **2,216** turns over **41** conversations | Conversations/turns oracle. |
| `golden_runs` | table | 0 | One row per capture run (immutable golden version). |
| `golden_nodes` | table | 0 | THE golden: per (conversation, turn, node, run) I/O + norm hash. |
| `replay_runs` | table | 0 | One row per replay run (baseline compared against). |
| `replay_node_diffs` | table | 0 | Per-node diff results (match/regression/volatile/missing/new). |
| `respond_contacts_test` | table | **41** | Session copy; seeded one row per incoming contact. |

## `chat_histories` — clean/load (derived from `chat_histories_raw`)

Transformations applied in the `INSERT … SELECT … WHERE type IN ('incoming','outgoing')`:
- **`id`**: thousands-separators stripped — `replace(id,',','')::bigint` (`"34,667"` → `34667`). All 4,638 ids unique → PK.
- **`sent_at` / `created_at`**: `to_timestamp(…, 'YYYY-MM-DD HH24:MI:SS')` — handles the **non-zero-padded hours** in the raw text (e.g. `2026-05-25 2:29:25`). All parse cleanly.
- **`[NULL]` literal → SQL NULL** via `nullif(...,'[NULL]')` on `first_name`, `last_name`, `created_at`, `message_id`, `result`.
- **`result` → `jsonb`** (every non-null value is a JSON array string).
- **Filter** to `type IN ('incoming','outgoing')` — drops the **127** blank/fragment rows (CSV embedded-newline artifacts).
- Indexes: `ix_ch_contact_sent_id (contact_id, sent_at, id)` (stable conversation/turn ordering) and `ix_ch_type (type)`.

Verified quirks from the raw data:
- `message_id` and `result` are **always NULL on incoming** (0 non-null of each) — keying is on `chat_histories.id`, never `message_id`.
- `message` is **NULL on 7 outgoing rows** (attachment-only replies). → `message` is **nullable** (deviation from plan, below). Incoming `message` is always present.

## `v_turns` — conversations/turns view shape

Definition (plan §3.1): conversation = all incoming of one `contact_id` ordered by `(sent_at, id)`; turn = each incoming row; expected reply = the FIRST outgoing at/after the incoming's timestamp for that contact (LATERAL join).

Columns:
```
trigger_chat_history_id  bigint   -- the incoming row id = golden/diff key
conversation_id          varchar  -- contact_id
turn_index               int      -- row_number() per contact ordered by (sent_at, id)
user_message             text     -- incoming message
sent_at                  timestamp
phone_number, first_name, last_name           -- contact fields (for the redis item)
expected_reply_chat_history_id  bigint         -- the matched outgoing id
expected_reply           text     -- coarse oracle (NOT the real oracle)
expected_result_set      jsonb    -- outgoing result_set (coarse expected-result check)
```

Verified: 2,216 turns / 41 conversations. Top contact `437264483` (Jayson) = **802** turns (matches plan). 977 turns carry a non-null `expected_result_set`; 25 turns have no following outgoing (`expected_reply` NULL — trailing incoming with no bot reply).

**Known imperfection (plan-flagged, expected):** when several incoming precede one outgoing, the LATERAL maps each of them to that same first outgoing. Example in `437264483`: turns 6/7/8 all map to reply id `34768`. This is fine — the **per-node golden (`golden_nodes`), not `expected_reply`, is the real diff oracle**; `expected_reply`/`expected_result_set` are coarse sanity checks only.

## Golden / replay tables

Built per plan §3.2–§3.3 verbatim. Notes:
- **Replay fixtures are the `is_external=true` subset of `golden_nodes`** — no separate fixture table. The replay orchestrator selects them per `trigger_chat_history_id`.
- `golden_nodes` keyed by `UNIQUE (golden_run_id, trigger_chat_history_id, node_name, run_index)` (resume/idempotency). `run_index` 0-based for nodes that execute >1× (loops).
- **Normalization intent**: `output_norm_hash` stores the sha256 of the *normalized* output; timestamp/id stripping (plan §5.2) happens **at diff time** in the orchestrator, not in the DB. `output_json` stores the raw golden for forensics; `is_external` rows double as replay pins.
- Diff statuses recorded in `replay_node_diffs.diff_status`: `match | regression | volatile | missing | new`.

## `respond_contacts_test` — session copy

- **PK = `respond_io_id`** (= `chat_histories.contact_id`) to match the plan's R1/R2 session-redirect SQL (`WHERE respond_io_id = $1`). It IS the contact_id.
- Seeded **41** rows — one per distinct contact that has incoming messages (the contacts that actually drive turns). `phone_number`/`first_name`/`last_name` pulled from the corpus.
- **Seed shape** (both `session_vars` and `seed_session_vars`):
  ```json
  {"variables": {}, "last_result_set": []}
  ```
  A neutral/empty session object mirroring the minimal shape the consume-main flow reads.
- **Reset per conversation** (orchestrator, before each contact's turn 1):
  ```sql
  UPDATE respond_contacts_test SET session_vars = seed_session_vars, updated_at = now()
   WHERE respond_io_id = $1;
  ```

### ⚠️ Caveat: initial session is UNRECOVERABLE
The historical *initial* `session_vars` at the moment each conversation started cannot be reconstructed from the corpus. We reset to a single neutral baseline. Because **both golden capture and replay use the identical seed**, the per-node diff stays valid (same baseline on both sides); only **absolute fidelity to the original live run is approximate**. If a more faithful seed is wanted later, the orchestrator setup can GET prod `/external/conversation-variables/{respond_io_id}` per contact (a safe read) and overwrite both columns — out of scope for this DB-layer task.

## Deviations from the plan's DDL (with reason)

1. **`chat_histories.message` is nullable** (plan had `NOT NULL`). 7 outgoing (attachment-only) rows have a real SQL NULL message; forcing NOT NULL aborts the load. Incoming messages — the replay corpus — are always present, so the corpus contract is unaffected.
2. **`chat_histories.created_at` is nullable, no `DEFAULT now()`** (plan had `NOT NULL DEFAULT now()`). `created_at` is copied verbatim from the raw row (preserving provenance); defaulting to `now()` would falsify the timestamp. All loaded rows happen to have a value, but the column is left nullable for honesty rather than fabricating one.
3. **Added `golden_nodes.captured_at timestamptz DEFAULT now()`** (per the coder brief's suggested column; plan §3.2 omitted it). Provenance only.
4. **Added bookkeeping columns to `v_turns`** (`phone_number`, `first_name`, `last_name`, `expected_reply_chat_history_id`) beyond the plan's minimal projection — the orchestrator needs contact fields to build the redis item and the reply id for traceability. Pure additions; no semantic change.
5. **`respond_contacts_test` seed = neutral `{}` shape, 41 rows** (plan suggested seeding all 47 from prod `conversation-variables`). The loaded corpus has **only 41 distinct contacts total** (all of them have incoming) — there is no 47-vs-41 split in this dataset. Prod-read seeding was deliberately skipped per the brief (initial session unrecoverable anyway); neutral seed used instead. See caveat above.

## Not touched / out of scope
- `chat_histories_raw` preserved as the raw source (not dropped).
- No n8n workflow edits, no prod CRM access, no executions.
- `golden_runs`/`golden_nodes`/`replay_runs`/`replay_node_diffs` created empty (populated by the orchestrator at capture/replay time).
