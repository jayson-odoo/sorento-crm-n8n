-- Test results table for replaying chat_histories sequences through n8n workflows.
-- Input  = one or more rows from chat_histories (a contact's chat slice).
-- Output = one or more messages produced by the n8n workflow.

CREATE TABLE IF NOT EXISTS test_results (
    id                       BIGSERIAL PRIMARY KEY,
    test_run_id              BIGINT       NOT NULL,
    test_name                VARCHAR(255),

    -- Input: sequence of chat_histories rows fed to the workflow.
    input_chat_history_ids   BIGINT[]     NOT NULL,
    trigger_chat_history_id  BIGINT       REFERENCES chat_histories(id) ON DELETE SET NULL,
    input_messages           JSONB        NOT NULL,   -- materialized [{role, message, sent_at, ...}, ...]

    -- Workflow under test.
    workflow_name            VARCHAR(255) NOT NULL,
    workflow_id              VARCHAR(64),
    agent_route              VARCHAR(64),
    model                    VARCHAR(64),

    -- Output: messages emitted by the workflow.
    output_messages          JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{message, type, ...}, ...]
    expected_messages        JSONB,                                       -- optional golden output

    -- Judgement.
    passed                   BOOLEAN,
    score                    NUMERIC(4,3) CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
    judge_notes              TEXT,

    -- Telemetry.
    latency_ms               INTEGER,
    tokens_input             INTEGER,
    tokens_output            INTEGER,
    error                    TEXT,
    metadata                 JSONB        NOT NULL DEFAULT '{}'::jsonb,

    started_at               TIMESTAMPTZ,
    finished_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_test_results_run          ON test_results (test_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_test_results_workflow     ON test_results (workflow_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_test_results_trigger_chat ON test_results (trigger_chat_history_id);
CREATE INDEX IF NOT EXISTS ix_test_results_passed       ON test_results (test_run_id, passed);
CREATE INDEX IF NOT EXISTS ix_test_results_input_ids    ON test_results USING gin (input_chat_history_ids);
CREATE INDEX IF NOT EXISTS ix_test_results_metadata     ON test_results USING gin (metadata);

COMMENT ON TABLE  test_results IS 'Per-test outcomes: chat_histories slice -> n8n workflow -> output messages.';
COMMENT ON COLUMN test_results.test_run_id             IS 'Integer grouping all rows from one test invocation (caller-assigned).';
COMMENT ON COLUMN test_results.input_chat_history_ids  IS 'Ordered chat_histories.id list fed as input.';
COMMENT ON COLUMN test_results.trigger_chat_history_id IS 'Last/triggering message in the input slice.';
COMMENT ON COLUMN test_results.input_messages          IS 'Materialized input chat sequence (snapshot of fields used).';
COMMENT ON COLUMN test_results.output_messages         IS 'Array of messages emitted by the workflow.';
COMMENT ON COLUMN test_results.expected_messages       IS 'Optional golden/expected output for diffing.';
COMMENT ON COLUMN test_results.agent_route             IS 'Branch main.json dispatched to.';
COMMENT ON COLUMN test_results.score                   IS '0..1 judge score (LLM-as-judge or rubric).';
COMMENT ON COLUMN test_results.metadata                IS 'Free-form: tool calls, intermediate steps, model raw usage, etc.';
