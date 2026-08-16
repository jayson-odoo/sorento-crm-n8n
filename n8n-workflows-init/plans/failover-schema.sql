-- Failover poller — ledger + control schema (n8n_test DB, isolated from prod CRM)
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS failover_ledger (
  message_id    bigint       NOT NULL,          -- respond.io messageId (also encodes ts: //1e6 = unix sec)
  contact_id    bigint       NOT NULL,          -- respond_io_id
  mode          text         NOT NULL,          -- 'test' | 'live'
  text          text,                            -- incoming message text (for label UI)
  status        text         NOT NULL,          -- pending|answered|needs_answer|injected|skipped_media
  injected_at   timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, message_id)                 -- claim key; test/live isolated in one table
);

CREATE TABLE IF NOT EXISTS failover_watermark (
  mode        text   NOT NULL,
  contact_id  bigint NOT NULL,
  watermark   bigint NOT NULL,                   -- max messageId injected/seeded for this contact
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, contact_id)
);

CREATE TABLE IF NOT EXISTS failover_state (
  mode               text PRIMARY KEY,           -- 'test' | 'live'
  enabled            boolean NOT NULL DEFAULT false,
  cutoff_message_id  bigint,                      -- seed floor = cutoff_ts_unix * 1_000_000
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO failover_state (mode, enabled) VALUES ('test', false), ('live', false)
  ON CONFLICT (mode) DO NOTHING;

CREATE OR REPLACE VIEW v_failover_pending AS
SELECT mode, contact_id, message_id, text,
       to_timestamp(message_id / 1000000) AT TIME ZONE 'Asia/Kuala_Lumpur' AS arrived_myt,
       status
FROM failover_ledger WHERE status='pending' ORDER BY contact_id, message_id;
