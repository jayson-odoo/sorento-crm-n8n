-- =============================================================================
-- Per-Node Golden-Master Regression Harness — DATABASE LAYER
-- Target: n8n_test @ 72.62.195.19:5432 (user n8n_user) — isolated from prod CRM.
-- Source of truth for design: n8n-workflows-init/plans/regression-plan.md (§3).
--
-- Idempotent: safe to re-run. DROPs and recreates derived/golden/replay/session
-- objects. chat_histories_raw (the raw TEXT load, 4,765 rows) is NEVER touched —
-- it is the immutable raw source the clean chat_histories is derived from.
--
-- Run from the HOST:
--   PGPASSWORD='your_secure_password' psql -h 72.62.195.19 -p 5432 \
--     -U n8n_user -d n8n_test -f schema.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. chat_histories — CLEAN corpus derived from chat_histories_raw
-- -----------------------------------------------------------------------------
-- v_turns depends on chat_histories; golden_nodes FKs it. Drop dependents too.
DROP VIEW  IF EXISTS v_turns CASCADE;
DROP TABLE IF EXISTS chat_histories CASCADE;

CREATE TABLE chat_histories (
  id           bigint       PRIMARY KEY,          -- raw id with thousands-separators stripped ("34,667" -> 34667)
  channel      varchar(32)  NOT NULL,
  contact_id   varchar(128) NOT NULL,             -- = respond.io id = respond_io_id (lookup key)
  phone_number varchar(32)  NOT NULL,
  message      text,                              -- nullable: 7 outgoing (attachment-only) rows have NULL message; incoming always present
  sent_at      timestamp    NOT NULL,             -- parsed from non-zero-padded-hour text
  first_name   varchar(255),
  last_name    varchar(255),
  type         varchar(32)  NOT NULL,             -- 'incoming' | 'outgoing' (blank/fragment rows dropped)
  created_at   timestamp,                         -- nullable: raw had no NOT-NULL guarantee
  message_id   varchar(50),                       -- ALWAYS NULL on incoming (verified)
  result       jsonb                              -- outgoing result_set; raw "[NULL]" -> SQL NULL
);

-- Load + clean from the raw table:
--   * id: strip thousands-separators -> bigint
--   * sent_at/created_at: to_timestamp handles non-zero-padded hours ("... 2:29:25")
--   * literal "[NULL]" -> SQL NULL
--   * result -> jsonb (all non-null values are JSON arrays)
--   * filter to type IN ('incoming','outgoing') — drops the 127 blank/fragment rows
INSERT INTO chat_histories
  (id, channel, contact_id, phone_number, message, sent_at,
   first_name, last_name, type, created_at, message_id, result)
SELECT
  replace(r.id, ',', '')::bigint,
  r.channel,
  r.contact_id,
  r.phone_number,
  r.message,
  to_timestamp(r.sent_at, 'YYYY-MM-DD HH24:MI:SS'),
  nullif(r.first_name, '[NULL]'),
  nullif(r.last_name,  '[NULL]'),
  r.type,
  to_timestamp(nullif(r.created_at, '[NULL]'), 'YYYY-MM-DD HH24:MI:SS'),
  nullif(r.message_id, '[NULL]'),
  nullif(r.result, '[NULL]')::jsonb
FROM chat_histories_raw r
WHERE r.type IN ('incoming', 'outgoing');

-- Stable ordering for conversations/turns (contact, time, then PK as tiebreak).
CREATE INDEX ix_ch_contact_sent_id ON chat_histories (contact_id, sent_at, id);
CREATE INDEX ix_ch_type            ON chat_histories (type);

-- -----------------------------------------------------------------------------
-- 1b. v_turns — conversations/turns oracle (plan §3.1)
-- -----------------------------------------------------------------------------
-- Conversation = all incoming of one contact_id ordered by (sent_at, id).
-- Turn        = each incoming row.
-- Expected reply / result_set = the FIRST outgoing at/after the incoming's
-- timestamp for the same contact (LATERAL). Imperfect when several incoming
-- precede one outgoing — flagged in db-setup-notes.md; the per-node golden, not
-- expected_reply, is the real oracle.
CREATE VIEW v_turns AS
SELECT i.id                                                            AS trigger_chat_history_id,
       i.contact_id                                                   AS conversation_id,
       row_number() OVER (PARTITION BY i.contact_id ORDER BY i.sent_at, i.id) AS turn_index,
       i.message                                                      AS user_message,
       i.sent_at,
       i.phone_number,
       i.first_name,
       i.last_name,
       o.id                                                           AS expected_reply_chat_history_id,
       o.message                                                      AS expected_reply,
       o.result                                                       AS expected_result_set
FROM   chat_histories i
LEFT JOIN LATERAL (
   SELECT o.id, o.message, o.result
   FROM   chat_histories o
   WHERE  o.contact_id = i.contact_id
     AND  o.type = 'outgoing'
     AND  o.sent_at >= i.sent_at
   ORDER  BY o.sent_at, o.id
   LIMIT  1
) o ON true
WHERE i.type = 'incoming';

-- -----------------------------------------------------------------------------
-- 2. Golden master tables (per-node snapshot) — plan §3.2
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS golden_nodes CASCADE;
DROP TABLE IF EXISTS golden_runs  CASCADE;

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
-- The replay fixtures ARE the is_external=true subset of this table (no separate
-- fixture table). Normalization (timestamp/id stripping) is applied at diff time;
-- output_norm_hash stores the sha256 of the normalized output.
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
  input_json       jsonb,                      -- node input items (optional/large; may be omitted)
  output_json      jsonb NOT NULL,             -- node output items (the golden)
  output_norm_hash text NOT NULL,              -- sha256 of normalized output (plan §5.2)
  is_external      boolean NOT NULL DEFAULT false,  -- LLM/read fixture? doubles as the replay fixture
  external_kind    text,                       -- 'llm-parser'|'llm-reformulator'|'read-resolve-entity'|
                                               -- 'read-access-types'|'read-check-access'|'read-get-results'|
                                               -- 'read-presigned-url'
  captured_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (golden_run_id, trigger_chat_history_id, node_name, run_index)
);
CREATE INDEX ix_gn_run_trigger ON golden_nodes (golden_run_id, trigger_chat_history_id);
CREATE INDEX ix_gn_external    ON golden_nodes (golden_run_id, trigger_chat_history_id, external_kind)
  WHERE is_external;
CREATE INDEX ix_gn_hash        ON golden_nodes (golden_run_id, node_name, output_norm_hash);

-- -----------------------------------------------------------------------------
-- 3. Replay + diff tables — plan §3.3
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS replay_node_diffs CASCADE;
DROP TABLE IF EXISTS replay_runs       CASCADE;

CREATE TABLE replay_runs (
  id            bigserial PRIMARY KEY,
  golden_run_id bigint NOT NULL REFERENCES golden_runs(id),  -- baseline compared against
  label         text NOT NULL,                 -- e.g. 'after-change-XYZ'
  git_ref       text,
  replayed_at   timestamptz NOT NULL DEFAULT now(),
  summary       jsonb                          -- {turns,nodes,matches,regressions,volatile,missing,new}
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

-- -----------------------------------------------------------------------------
-- 4. respond_contacts_test — the session copy — plan §3.4
-- -----------------------------------------------------------------------------
-- PK column is respond_io_id (= chat_histories.contact_id) to match the plan's
-- R1/R2 session-redirect SQL (WHERE respond_io_id = $1). It IS the contact_id.
DROP TABLE IF EXISTS respond_contacts_test CASCADE;

CREATE TABLE respond_contacts_test (
  respond_io_id     varchar(128) PRIMARY KEY,             -- = chat_histories.contact_id
  phone_number      varchar(32),
  first_name        varchar(255),
  last_name         varchar(255),
  workspace_id      uuid,                                 -- optional; access reads are pinned
  session_vars      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- evolves across a conversation
  seed_session_vars jsonb NOT NULL DEFAULT '{}'::jsonb,   -- reset baseline (immutable)
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Seed one row per distinct contact that has INCOMING messages (the 41 contacts
-- that actually drive turns). session_vars = seed_session_vars = a NEUTRAL/EMPTY
-- session object. The historical INITIAL session at each conversation's start is
-- UNRECOVERABLE — both golden capture and replay use this same seed, so the diff
-- stays valid (identical baseline on both sides); only absolute fidelity to the
-- original live run is approximate. See db-setup-notes.md.
--
-- Seed shape {"variables":{}, "last_result_set":[]} mirrors the minimal session
-- object the consume-main flow reads (get-session-vars consumers / compile-current-state).
INSERT INTO respond_contacts_test
  (respond_io_id, phone_number, first_name, last_name, session_vars, seed_session_vars)
SELECT
  ch.contact_id,
  max(nullif(ch.phone_number, '[NULL]')),
  max(nullif(ch.first_name,   '[NULL]')),
  max(nullif(ch.last_name,    '[NULL]')),
  '{"variables":{},"last_result_set":[]}'::jsonb,
  '{"variables":{},"last_result_set":[]}'::jsonb
FROM chat_histories ch
WHERE ch.type = 'incoming'
GROUP BY ch.contact_id;

COMMIT;
