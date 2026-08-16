# State-transition monitor — CRM side

Companion to `state-transition-monitor-n8n-plan.md` (the producer half; **not yet written**).
Status: **PLAN ONLY — nothing built.**
Scope tag: **`deterministic`** — no LLM is invoked by any acceptance case here. (The tag is the
harness cost tier; it applies to the n8n companion plan. This plan's cases run as CRM pytest +
psql, not as clone executions — see §6.0 for what replaces the §0 gate.)

Goal: persist the per-turn `state_trace` the n8n spine will start sending, don't drop it, and make
it answer the question *"which turn silently dropped that entity, and what fired?"* in one query.

Repo under change: `sorento_crm_backend` in `/Users/tehjayson/Documents/foundryx/sorento_crm`
(**read-only reference from this repo — the change is authored in the CRM repo, not here**).
Paths below are given relative to `<BE>` = `/Users/tehjayson/Documents/foundryx/sorento_crm/sorento_crm_backend`.

---

## 0. Corrections to the brief (read first)

Modelled on `obs-latency-contract-plan.md` §0. Six items in the brief or its surrounding
assumptions are wrong or under-specified as literally written.

### 0.1 The primary blocker is real, and confirmed

`<BE>/app/schemas/external/chat_history.py:9`

```python
class ChatHistoryMessageIngestRequest(BaseModel):
    channel: str = "whatsapp"
    ...
    turn_id: Optional[str] = Field(None, max_length=64, description="n8n $execution.id, ...")
```

It inherits plain `pydantic.BaseModel` and declares **no `model_config` and no `class Config`**.
There is no shared base setting `extra` — sibling external schemas set it locally and explicitly
(`app/schemas/external/procurement.py:151`, `app/schemas/external/forms.py:32,43`), which proves
nothing is inherited. pydantic is `>=2.9` (`requirements.txt:6`), so the default is
**`extra="ignore"`**.

**Consequence: a `state_trace` key POSTed today is silently discarded. No 422, no log line.**
Worse than silent — `<BE>/app/api/v1/external/chat_history.py:131` logs
`request_payload=payload.model_dump_json()`, i.e. the **post-validation** dump, so the dropped key
does not even appear in `integration_logs`. There is no forensic trace that n8n ever sent it.

Fix is additive, not a config change: declare the field. Do **not** set `extra="allow"` — that
would make the model a bag and defeat the explicit-column INSERT in §0.2.

### 0.2 There is no service/CRUD layer — the INSERT is raw SQL with an explicit column list

The brief's "does it do `Model(**payload.dict())`?" has a third answer. `ingest_chat_message`
(`<BE>/app/api/v1/external/chat_history.py:46`) writes inline:

```python
INSERT INTO chat_histories (
    channel, contact_id, phone_number, message, sent_at, first_name, last_name, type,
    message_id, result, reply_to_message_id, reply_to_message, turn_id, ingest_at,
    respond_ts
) VALUES (...)
```

with a matching explicit params dict (lines 82–105). The SQLAlchemy `ChatHistory` model
(`<BE>/app/models/chat_history.py:9`) is **not** used on the write path at all.

**So "add the column + add the pydantic field" is insufficient.** A new field needs **four** edits,
three of them in this one function: column list, bind placeholder, params dict — plus the model
(for the ORM read paths). Adding only the schema field yields a validated-then-thrown-away value,
which passes a naive "does the API accept it?" test and persists nothing. UAC-CRM-1 exists
specifically to catch this.

### 0.3 The migration landmine is live in this repo — and the numbering currently *hides* it

`origin/main` has **307 revisions** with a **single head: `294_chat_latency_percentile`**.
The new migration is `295_chat_history_state_trace` with
`down_revision = "294_chat_latency_percentile"`.

That head happens to also be the highest-numbered file **today**. Do not learn the wrong lesson
from that coincidence. The chain is provably not the numbering:

- `286_form_cs_routing_conditions.py:33` has `down_revision = "274_ideation_workspace_config"` —
  it forks backwards past the entire 275–285 SCM chain.
- Three merge migrations consume numbered nodes mid-graph:
  `9785e8947154_merge_scm_module_chain_into_main.py:14` → `('273_import_source_file', '285_market_signal_sources')`;
  `932195fa2398_merge_sla_epic_236_attachment_storage_.py` → `('234_attachment_storage_status', '236_seed_sla_kpi_view_perm')`;
  `5f44ff967988_merge_auth_sessions_sla_notify_heads.py` → `('237_user_sessions', 'a1b2c3d4e5f6')`.

`285`, `273`, `236`, `234` are all consumed. Forking any of them yields two heads and
`alembic upgrade head` fails. **This already broke a deploy once.**

**Instruction to the implementer: resolve the head at implementation time, from the tool, not from
`ls`.** Both of these, and they must agree:

```bash
cd <BE> && alembic heads          # must print exactly ONE revision
cd <BE> && alembic current        # what the target DB is actually at
```

If `alembic heads` prints more than one line, **stop** — the correct change is a merge migration
first, authored separately, not a fork. If you cannot run alembic (no DB), the offline equivalent
is: parse every `revision`/`down_revision` in `<BE>/alembic/versions/*.py`, collect every string
appearing in any `down_revision` (including tuple members) as the parent set, and take the
revisions absent from it. That is exactly how the single head above was established.

### 0.4 `after: null` survives only under one specific typing choice

The brief says `"after": null` must not be coerced, dropped, or treated as a failure. That is not
automatic — it depends on decisions not yet made:

- **Type `state_trace` as an opaque `Optional[dict[str, Any]]`.** If it is instead modelled as a
  nested pydantic model with an `after: Optional[StateModel]` field, a later `model_dump(exclude_none=True)`
  anywhere on the path erases the difference between *"the turn wrote no state"* and *"the field was
  never sent"* — which is the entire signal. The v1 contract says the layer set will evolve; an
  opaque dict is also what makes that true.
- **Serialize with `json.dumps(...)`, not by handing the dict to the `text()` bind.** Follow the
  `result` precedent exactly (`<BE>/app/api/v1/external/chat_history.py:91`):
  `json.dumps(payload.result) if payload.result is not None else None`.
- **Guard on `is not None`, never on falsiness.** `if payload.state_trace:` would drop a `{}` trace.
  `{}` is not expected on the wire, but the guard must not be the thing that decides.

Under those three, `{"after": null}` round-trips as jsonb `null` inside the document, and
`jsonb_typeof(state_trace->'after') = 'null'` — which is what the view in §5 keys on.

### 0.5 Adding the field doubles the storage, not increases it by one column

`<BE>/app/api/v1/external/chat_history.py:131` writes `request_payload=payload.model_dump_json()`
into `integration_logs.request_payload`, which is `Column(Text)`
(`<BE>/app/models/integration.py:21`). Every ingest is logged. Once `state_trace` is a declared
field, **the whole trace is written a second time, as text, on every incoming message** — and
`integration_logs` has no purge (§4).

This is not hypothetical overhead; it is the larger of the two costs, since the jsonb copy at least
benefits from a single TOAST compression pass on a column that is actually queried, while the log
copy is write-only. **Exclude it from the integration log:**

```python
request_payload=payload.model_dump_json(exclude={"state_trace"}),
```

Note the interaction with §0.4: `exclude=` on the *log* call is correct and safe;
`exclude_none=True` anywhere on the *persistence* path is not. Different calls, opposite rules.

### 0.6 The view introduces a convention that `chat_histories` has so far avoided

Two facts the design should respect rather than fight:

- **Views exist, but in exactly one migration and in a dedicated schema.**
  `<BE>/alembic/versions/274_scm_m0_views_reg.py` holds `CREATE VIEW scm.<name>_v AS ...` in
  module-level string constants executed via `op.execute()`. Namespaced schema, `_v` suffix. No
  materialized views anywhere in the repo. Follow it: **`scm` is the wrong schema for this**, so
  either place the view in `public` and accept the deviation, or state the schema explicitly. This
  plan proposes `public.v_turn_state_transition` and flags the naming deviation (`v_` prefix per the
  brief vs. the repo's `_v` suffix) as a reviewer decision, not a silent choice.
- **jsonb GIN is already an established pattern** (`138_form_inbound_shipment_access_levels.py:29`,
  `057_attachment_access_levels.py:33` — `postgresql_using="gin"` on JSONB columns), so "the repo
  doesn't do that" is not an argument against it. `chat_histories` nonetheless deliberately carries
  **only narrow and partial btree indexes**, including two partial ones added as raw SQL in
  migration `290`. §4 recommends keeping it that way, on volume grounds, not on precedent grounds.

---

## 1. Contract v1 — restated canonically

Locked by the brief. Reproduced here so the CRM implementer needs no other document.

New column `chat_histories.state_trace jsonb NULL`. **One** jsonb column, not four — the layer set
will evolve and we refuse to re-migrate per layer.

Populated **only** on `type = 'incoming'` rows — exactly one per turn. Outgoing rows get
`state_trace = NULL`. Joins to its reply via the already-live `turn_id`.

```json
{
  "v": 1,
  "before":         {...},        // conversation state PRE-turn
  "parser_raw":     {...}|null,   // semantic-parser LLM output, pre post-processing
  "parser_applied": {...},        // post-processed; carries the decision flags
                                  //   domain_signal_source, scope_exclusive_applied,
                                  //   entity_op_applied, entities_filtered, dym_pick_applied
  "after":          {...}|null    // state written back at end of turn; null = turn wrote NO state
}
```

`"after": null` is **meaningful and expected on real traffic** — no-access refusals,
voice-not-allowed, and LLM-fallback branches never write state. Not an error, not `{}`, not absent.

n8n trims before sending: `last_result_set`, `referenced_result_set`, `dym_candidates` arrive as
`{"n": <int>, "first": <string>}`, not full arrays. **CRM stores as received** — no reshaping, no
validation of inner structure.

### 1.1 Contract items the n8n plan must lock (open)

The view in §5 cannot be written without these. They are producer-side decisions; listed here so
they are not discovered during CRM implementation.

- **N1 — are `before`/`after` the `variables` object, or `{"variables": {...}}`?** The spine's
  persisted blob is `output.variables` (a flat object: `message_type`, `intent_hint`, `domain_hint`,
  `entities`, `routing`, `escalation`, `last_result_set`, `selection_context`, `dym_candidates`, …),
  and `previous_conversation_state` is that object **unwrapped**. This plan assumes **unwrapped**, so
  entities live at `state_trace->'before'->'entities'`. If n8n sends it wrapped, every path in §5
  gains a `->'variables'` and the view must be re-issued.
- **N2 — entity identity key.** This plan assumes `entities` is a JSON **array of objects** each
  carrying a `raw` string (the surface token) and a `hint`/`entity_type`. Identity for
  lost/gained set arithmetic is `lower(trim(raw))`. If entities become keyed by resolved `uuid`
  instead, identity should switch to `uuid` with `raw` as the display label — a one-line change,
  isolated to the `b`/`a` CTEs.
- **N3 — flag value domain.** `scope_exclusive_applied`, `entity_op_applied`, `entities_filtered`,
  `dym_pick_applied` are assumed booleans; `domain_signal_source` a string. §5's `cause_flags`
  treats booleans as set-when-`true` and strings as set-when-non-null.

---

## 2. Change set

| # | Where | Change | Risk |
|---|---|---|---|
| M1 | `<BE>/alembic/versions/295_chat_history_state_trace.py` (new) | `ADD COLUMN state_trace jsonb NULL`, idempotent | low — nullable, no default, no rewrite |
| M2 | `<BE>/app/models/chat_history.py` | `state_trace = Column(JSONB, nullable=True)` | low — ORM read paths only |
| M3 | `<BE>/app/schemas/external/chat_history.py` | add `state_trace` field to `ChatHistoryMessageIngestRequest` | **blocker fix** (§0.1) |
| M4 | `<BE>/app/api/v1/external/chat_history.py` | 3 edits in `ingest_chat_message`: column list, bind, params | **blocker fix** (§0.2) |
| M5 | same file, line 131 | `model_dump_json(exclude={"state_trace"})` on the integration log | med — silent 2× storage if skipped (§0.5) |
| M6 | migration `295` (same file as M1) | `CREATE OR REPLACE VIEW public.v_turn_state_transition` | low — read-only artifact |

Deliberately **out of scope**: the retrieval endpoint `get_chat_history_messages`
(same file, line 149) has its own explicit SELECT list and explicit `ChatHistoryMessageItem(...)`
construction — `state_trace` will not surface there, and should not. It is a debugging column, not
part of the external read contract. Same for the admin DTO in
`<BE>/app/services/chat_history_query.py`. Say so in the PR so a reviewer doesn't file it as an
omission.

### M3 detail

Alongside `turn_id` (lines 36–44), matching its style:

```python
state_trace: Optional[dict[str, Any]] = Field(
    None,
    description="Per-turn conversation state transition (v1). Incoming rows only; NULL on "
    "outgoing. Opaque by design: {v, before, parser_raw, parser_applied, after}. "
    "`after: null` means the turn wrote no state (no-access refusal, voice-not-allowed, "
    "LLM fallback) and is a real signal — never coerce it to {}.",
)
```

`dict[str, Any]` — **not** a nested model (§0.4). `Any` is already imported (line 21 uses it).
No `max_length`; no inner validation. The producer owns the shape.

### M4 detail

Three edits, all in `ingest_chat_message`:

1. Column list → append `, state_trace` after `respond_ts`.
2. VALUES → append `, :state_trace`.
3. Params dict → mirror the `result` precedent **exactly**:

```python
"state_trace": json.dumps(payload.state_trace) if payload.state_trace is not None else None,
```

`is not None`, not truthiness (§0.4). `json.dumps` of a dict containing `{"after": None}` emits
`"after": null` — the round-trip that UAC-CRM-2 asserts.

Note there is no `type == 'incoming'` guard in the INSERT, and there should not be: the contract
says n8n sends `state_trace` only on incoming rows. Enforcing it CRM-side would silently discard a
producer bug instead of surfacing it. UAC-CRM-3 asserts the **observed** invariant on real data,
which is the honest place for it.

---

## 3. Migration (M1 + M6)

File `<BE>/alembic/versions/295_chat_history_state_trace.py`.
`revision = "295_chat_history_state_trace"`, `down_revision = <resolved per §0.3>`.

Copy the structure of `290_chat_history_latency_columns.py` — it is the right pattern and it is the
direct precedent:

- an `_existing_columns(conn)` idempotency guard reading `information_schema.columns`, with
  `if name in present: continue` before the `add_column`. Re-runnable against a partially-migrated
  DB, which matters because this table is the highest-volume write path in the CRM.
- column **nullable, no server_default** → Postgres records the change in catalog only. No table
  rewrite, no `ACCESS EXCLUSIVE` held for the length of a scan. This is the property that makes the
  migration safe to run against live without a maintenance window, and it is explicitly mandated by
  the obs-latency acceptance criteria (OBS-S4-22).
- **no index** in v1 (§4).
- `downgrade()` drops the view first, then the column. Order matters — dropping a column a view
  depends on fails without `CASCADE`, and `CASCADE` would drop the view silently. Drop it
  explicitly so the down-migration is auditable.

```python
def upgrade():
    conn = op.get_bind()
    if "state_trace" not in _existing_columns(conn):
        op.add_column("chat_histories", sa.Column("state_trace", postgresql.JSONB(), nullable=True))
    op.execute(_STATE_TRANSITION_V)   # CREATE OR REPLACE VIEW, §5

def downgrade():
    op.execute("DROP VIEW IF EXISTS public.v_turn_state_transition")
    op.drop_column("chat_histories", "state_trace")
```

`CREATE OR REPLACE VIEW` (not `CREATE VIEW`) so re-running upgrade is idempotent alongside the
column guard. Caveat the implementer must know: `CREATE OR REPLACE VIEW` cannot change the output
column list or types — only the body. Any later change to the view's columns needs an explicit
`DROP VIEW` first. Note this in the migration docstring; it will bite whoever adds the sixth
computed column.

---

## 4. Storage cost, and the index question

### Recommendation

**Add the column. Add no index in v1. Exclude the trace from the integration log (M5).**

### Sizing

Per-trace, trimmed per contract:

| layer | contents | est. serialized |
|---|---|---|
| `before` | `variables` object; the three big arrays trimmed to `{n, first}` | 0.4–1.2 KB |
| `parser_raw` | raw LLM output: hints, entities[], scope, dates | 0.5–1.5 KB |
| `parser_applied` | same shape + 5 decision flags | 0.5–1.5 KB |
| `after` | as `before`, or `null` | 0–1.2 KB |
| | **typical** | **≈3 KB**, p95 ≈6 KB |

Trimming is what makes this tractable — an untrimmed `last_result_set` alone can exceed the whole
budget, which is why the contract mandates `{n, first}`.

Above the 2 KB TOAST threshold Postgres applies pglz to the jsonb; this payload is highly
repetitive (recurring keys, enum-ish values), so **3–5× is the realistic compression range**,
putting the stored cost near **0.6–1.0 KB per incoming row**.

Volume: this repo has no authoritative prod row count and probing prod is out of bounds. The
anchors available are the `n8n_test` corpus (2,216 turns of real history) and the documented
consumer ceiling of ~12 rows/min (`obs-latency-contract-plan.md` §2). Rather than invent a rate,
run one query at implementation time:

```sql
SELECT count(*) FILTER (WHERE type = 'incoming') AS incoming_30d,
       pg_size_pretty(pg_total_relation_size('chat_histories')) AS current_total
FROM chat_histories WHERE sent_at > now() - interval '30 days';
```

The arithmetic to apply: at **1 KB stored** per incoming row, 1,000 incoming/day is **~365 MB/yr**;
100/day is **~37 MB/yr**. Against a table already carrying every message body plus five indexes,
that is a rounding error at the low end and manageable at the high end. **Nothing in the plausible
range makes this column the problem.** The M5 duplicate, uncompressed-and-never-read in a table
with no purge policy, is the part actually worth eliminating — hence M5 is scoped as med risk, not
cosmetic.

### Why no GIN

The access pattern this exists to serve is *"show me the trace for this turn / this contact, recently."*
Both are already served by existing btree indexes — `ix_chat_histories_turn` (partial, on
`turn_id, type, respond_ts`) and `ix_chat_histories_channel_contact_sent_id`. The view in §5 filters
on `type` and `sent_at`, never on trace internals.

A whole-document GIN would be paid on **every insert** on the CRM's highest-volume write path, to
accelerate a query pattern — *"all turns anywhere in history where `scope_exclusive_applied` was
true"* — that nobody has yet run once. That is the definition of premature. When flag-search does
become hot, the right answer is still not a document GIN but a **narrow partial expression index**
on the one flag, e.g.:

```sql
CREATE INDEX CONCURRENTLY ix_chat_histories_scope_exclusive
ON chat_histories (sent_at)
WHERE (state_trace->'parser_applied'->>'scope_exclusive_applied') = 'true';
```

which matches how `290` already indexes this table (narrow, partial, raw SQL). Defer it; note it
here so it isn't re-litigated from scratch.

---

## 5. The debugging surface — `v_turn_state_transition` (M6)

This is where the value lands. The raw jsonb is unreadable at 3 KB/row; the view turns it into the
answer.

Written against contract items **N1 (unwrapped), N2 (`raw` identity), N3 (booleans)** in §1.1 — if
those move, this moves with them.

```sql
CREATE OR REPLACE VIEW public.v_turn_state_transition AS
WITH t AS (
    SELECT id, turn_id, contact_id, phone_number, first_name,
           sent_at, message, state_trace
    FROM   chat_histories
    WHERE  type = 'incoming'
      AND  state_trace IS NOT NULL
),
-- `after` may be jsonb null (turn wrote NO state). That is NOT "everything was lost" --
-- it is "unknowable from this row". wrote_state carries the distinction; the set
-- arithmetic below is suppressed to NULL when it is false.
flags AS (
    SELECT t.id,
           (jsonb_typeof(t.state_trace->'after') <> 'null') AS wrote_state,
           t.state_trace->'parser_raw'                       AS praw,
           t.state_trace->'parser_applied'                   AS papp
    FROM t
),
b AS (
    SELECT t.id,
           lower(btrim(e->>'raw'))                       AS k,
           COALESCE(e->>'raw', '')                       AS label,
           COALESCE(e->>'entity_type', e->>'hint', '?')  AS etype
    FROM t, LATERAL jsonb_array_elements(
             COALESCE(t.state_trace->'before'->'entities', '[]'::jsonb)) e
    WHERE  e->>'raw' IS NOT NULL
),
a AS (
    SELECT t.id,
           lower(btrim(e->>'raw'))                       AS k,
           COALESCE(e->>'raw', '')                       AS label,
           COALESCE(e->>'entity_type', e->>'hint', '?')  AS etype
    FROM t, LATERAL jsonb_array_elements(
             COALESCE(t.state_trace->'after'->'entities', '[]'::jsonb)) e
    WHERE  e->>'raw' IS NOT NULL
)
SELECT
    t.turn_id,
    t.id                                        AS chat_history_id,
    t.contact_id,
    t.phone_number,
    t.first_name,
    t.sent_at,
    t.message                                   AS incoming_message,
    f.wrote_state,
    COALESCE(t.state_trace->>'v', '?')          AS trace_version,

    -- entities present BEFORE but absent AFTER. NULL (not '{}') when the turn wrote
    -- no state -- absence of a write is not evidence of a loss.
    CASE WHEN f.wrote_state THEN COALESCE((
        SELECT array_agg(DISTINCT b.etype || ':' || b.label ORDER BY b.etype || ':' || b.label)
        FROM b WHERE b.id = t.id
          AND NOT EXISTS (SELECT 1 FROM a WHERE a.id = t.id AND a.k = b.k)
    ), '{}') END                                AS entities_lost,

    CASE WHEN f.wrote_state THEN COALESCE((
        SELECT array_agg(DISTINCT a.etype || ':' || a.label ORDER BY a.etype || ':' || a.label)
        FROM a WHERE a.id = t.id
          AND NOT EXISTS (SELECT 1 FROM b WHERE b.id = t.id AND b.k = a.k)
    ), '{}') END                                AS entities_gained,

    -- which decision flags fired this turn. Booleans: set when true.
    -- domain_signal_source is a string: reported as source=<value> when non-null.
    COALESCE((
        SELECT array_agg(x ORDER BY x) FROM (
            SELECT 'scope_exclusive_applied' AS x
              WHERE (f.papp->>'scope_exclusive_applied')::text = 'true'
            UNION ALL SELECT 'entity_op_applied'
              WHERE (f.papp->>'entity_op_applied')::text = 'true'
            UNION ALL SELECT 'entities_filtered'
              WHERE (f.papp->>'entities_filtered')::text = 'true'
            UNION ALL SELECT 'dym_pick_applied'
              WHERE (f.papp->>'dym_pick_applied')::text = 'true'
            UNION ALL SELECT 'source=' || (f.papp->>'domain_signal_source')
              WHERE f.papp->>'domain_signal_source' IS NOT NULL
        ) s
    ), '{}')                                    AS cause_flags,

    -- did post-processing overrule the LLM? NULL when parser_raw was not captured.
    CASE WHEN f.praw IS NULL OR jsonb_typeof(f.praw) = 'null' THEN NULL
         ELSE COALESCE((
            SELECT array_agg(x ORDER BY x) FROM (
                SELECT 'domain' AS x
                  WHERE f.praw->>'domain_hint' IS DISTINCT FROM f.papp->>'domain_hint'
                UNION ALL SELECT 'scope'
                  WHERE f.praw->>'scope_exclusive' IS DISTINCT FROM f.papp->>'scope_exclusive'
                UNION ALL SELECT 'entities'
                  WHERE COALESCE(f.praw->'entities','[]'::jsonb)
                     IS DISTINCT FROM COALESCE(f.papp->'entities','[]'::jsonb)
            ) s
         ), '{}')
    END                                         AS parser_drift,

    t.state_trace                               AS raw_trace
FROM t JOIN flags f ON f.id = t.id;
```

Design notes worth defending in review:

- **`entities_lost` is `NULL`, not `{}`, when `wrote_state` is false.** This is the whole point of
  refusing to coerce `after`. A no-access refusal did not lose the customer entity — it did not
  touch it. Reporting `{}` there would be wrong in the safe direction; reporting the full before-set
  as "lost" would be wrong in the direction that generates false investigations.
- **`cause_flags` and `parser_drift` are `text[]`**, so `WHERE 'scope_exclusive_applied' = ANY(cause_flags)`
  is the natural filter without any jsonb operators at the call site.
- **`raw_trace` is retained.** The view is a lens, not a replacement; every triage eventually needs
  the untransformed document, and making people re-join to `chat_histories` for it guarantees they
  will instead trust an incomplete summary.
- **Identity is `lower(btrim(raw))`** so a re-cased or padded token is not reported as
  simultaneously lost and gained. The display label keeps original casing.

### 5.1 Worked example — the motivating case

Customer entity resolves on turn 1; survives turn 2 via a did-you-mean merge-back; **silently
vanishes on turn 3** when `scope_exclusive` fires without the merge-back.

```sql
SELECT sent_at, left(incoming_message, 44) AS msg,
       wrote_state, entities_lost, entities_gained, cause_flags, parser_drift
FROM   public.v_turn_state_transition
WHERE  contact_id = '437264483'
  AND  sent_at > now() - interval '1 day'
ORDER  BY sent_at;
```

Expected output shape — the bug is the third row, and it is visible without reading any jsonb:

```
 sent_at  | msg                          | wrote_state | entities_lost         | entities_gained    | cause_flags                                  | parser_drift
----------+------------------------------+-------------+-----------------------+--------------------+----------------------------------------------+--------------
 10:02:11 | any orders for tan trading    | t           | {}                    | {customer:tan trading} | {source=current_message}                 | {}
 10:03:40 | SRTWC286                      | t           | {}                    | {product:SRTWC286} | {dym_pick_applied,entity_op_applied,source=dym} | {domain,scope}
 10:05:02 | how about SRTWC287            | t           | {customer:tan trading}| {product:SRTWC287} | {scope_exclusive_applied,entity_op_applied,source=current_message} | {}
```

Row 2 is the control: `dym_pick_applied` present, `parser_drift = {domain,scope}` (post-processing
correctly overruled the LLM's wrong hint and its `scope_exclusive`), nothing lost.
Row 3 is the defect: **`entities_lost` is non-empty, `scope_exclusive_applied` fired, and
`dym_pick_applied` is absent** — the merge-back did not run. That conjunction is the signature, and
it is now a `WHERE` clause rather than an afternoon:

```sql
SELECT * FROM public.v_turn_state_transition
WHERE  entities_lost <> '{}'
  AND  'scope_exclusive_applied' = ANY(cause_flags)
  AND  NOT ('dym_pick_applied' = ANY(cause_flags))
  AND  sent_at > now() - interval '7 days'
ORDER  BY sent_at DESC;
```

Note `entities_lost <> '{}'` also correctly excludes the `NULL` (no-state-written) rows, since
`NULL <> '{}'` is `NULL`, not true. That is intended, and is the second reason `after: null` must
not be coerced.

---

## 6. Acceptance cases

### §6.0 Safety gate (what replaces UAC §0 here)

These cases run as **CRM pytest + psql against a local/dev database**. They do not drive the n8n
clone, so harness gates **S1, S2, S4, S6, S7 are structurally N/A** — no workflow executes, no
respond.io call is constructed, no LLM is invoked, no redis list is touched. **S5 is N/A** (no
`test_mode` flag exists on this path).

The binding gate for this plan is the CLAUDE.md prod rule, in its CRM-write form. Every case below
additionally requires:

- **S3-CRM — no write against the prod CRM database.** `alembic upgrade`, the ingest POST, and every
  assertion target a local/dev DB. The implementer must confirm the target from
  `alembic current` + the resolved connection URL **before** running any case, and record it in the
  run log. CRM **reads** against prod remain permitted; this plan requires none.
- **S8-CRM — no live n8n producer during CRM testing.** Cases post synthetic payloads with a
  curl/pytest client. Do not enable the n8n side to generate test traffic (see §7 — it must not be
  sending yet anyway).

A failure of S3-CRM or S8-CRM is a hard fail regardless of functional correctness.

### §6.1 — UAC-CRM-1: unknown-key passthrough actually persists  *(the blocker test)*
- **Trigger:** `POST /api/v1/external/chat-history/messages` with a minimal valid body
  (`channel, contact_id, phone_number, message, sent_at, type='incoming'`) **plus** a populated
  `state_trace` object containing all four layers and `"v": 1`.
- **Expect:** 201. Then `SELECT state_trace FROM chat_histories WHERE id = <returned id>` returns a
  **non-NULL jsonb** whose `->>'v'` is `'1'` and which contains all four layer keys.
- **Why it exists:** this is the §0.1 + §0.2 blocker. It fails today, and it fails *again* if only
  M3 lands without M4 — the schema accepts the key and the INSERT throws it away. Asserting the API
  returns 201 is **not** sufficient and must not be the assertion.
- **Negative control (same case):** run the identical POST against the pre-migration code path and
  confirm it returns 201 with `state_trace IS NULL`. Proves the test discriminates.

### §6.2 — UAC-CRM-2: `after: null` round-trips as jsonb null
- **Trigger:** POST with `state_trace.after = null`, all other layers populated.
- **Expect, all three:**
  - `jsonb_typeof(state_trace->'after') = 'null'` — **not** `'object'`, and not SQL NULL.
  - `state_trace ? 'after'` is **true** — the key is present, not omitted.
  - `state_trace->'after' <> '{}'::jsonb`.
- **And through the view:** the row's `wrote_state` is `false` and `entities_lost` is **SQL NULL**
  (not `{}`).
- **Why it exists:** the three failure modes (coerced to `{}`, dropped entirely, rejected as
  invalid) are individually plausible and individually silent. §0.4 lists the three implementation
  choices that each cause one of them.

### §6.3 — UAC-CRM-3: outgoing rows keep `state_trace IS NULL`
- **Trigger:** POST a `type='outgoing'` row carrying the same `turn_id` as §6.1 and **no**
  `state_trace` key.
- **Expect:** 201; `state_trace IS NULL`; the pair joins — exactly two rows for that `turn_id`, one
  `incoming` with a trace, one `outgoing` without.
- **Plus, as a data invariant** (run after any real traffic reaches the environment):
  `SELECT count(*) FROM chat_histories WHERE type <> 'incoming' AND state_trace IS NOT NULL` = **0**.
  Non-zero is a producer defect, not a CRM defect (§M4 detail) — report it to the n8n side rather
  than adding a CRM-side guard.

### §6.4 — UAC-CRM-4: migration up AND down are both clean
- `alembic heads` prints exactly one revision **before** authoring (§0.3). Record it.
- `alembic upgrade head` → column exists, is `jsonb`, is nullable; view exists.
- `alembic upgrade head` **again** → no error (the `_existing_columns` guard + `CREATE OR REPLACE`).
- `alembic downgrade -1` → view gone **and** column gone, no `CASCADE` used, table intact and
  row count unchanged.
- `alembic upgrade head` once more → clean.
- **And:** `alembic heads` still prints exactly one revision afterwards. A second head means the
  `down_revision` forked a consumed node — the §0.3 landmine — and it must be fixed before merge,
  not papered over with a merge migration.

### §6.5 — UAC-CRM-5: the view returns the expected `entities_lost` for the worked example
- **Trigger:** seed three synthetic incoming rows reproducing §5.1 — turn 1 gains
  `customer:tan trading`; turn 2 carries `dym_pick_applied` and loses nothing; turn 3 carries
  `scope_exclusive_applied` **without** `dym_pick_applied` and drops the customer from `after`.
- **Expect:** the turn-3 row has `entities_lost = {'customer:tan trading'}`,
  `'scope_exclusive_applied' = ANY(cause_flags)`, `NOT ('dym_pick_applied' = ANY(cause_flags))`.
  Turns 1 and 2 have `entities_lost = '{}'`.
- **And:** the §5.1 signature query returns **exactly** the turn-3 row from that fixture — not zero
  rows (view broken), not all three (predicate too loose).
- **Case-fold control:** a fourth synthetic turn where the entity's `raw` changes case only
  (`Tan Trading` → `tan trading`) must yield `entities_lost = '{}'` and `entities_gained = '{}'`.
  Guards the N2 identity rule.

### §6.6 — UAC-CRM-6: no regression to `turn_id` / `message_id` / `sent_at`
- **Trigger:** replay a payload shaped exactly like today's live n8n producer — `turn_id`,
  `message_id`, `sent_at`, `result`, `reply_to_*`, and **no** `state_trace` key at all.
- **Expect:** 201; all obs-latency fields land unchanged; `respond_ts` is still derived by
  `respond_ts_from_message_id`; `ingest_at` still stamped; `state_trace IS NULL`.
- **Why it exists:** M4 edits the shared INSERT statement that every chat row goes through. A
  mis-ordered bind parameter there corrupts the obs-latency columns for **all** traffic, and the
  symptom (wrong `turn_id`) looks like an n8n threading bug — the failure mode
  `obs-latency-contract-plan.md` §0.3 spent a cycle on.
- **Plus:** confirm `integration_logs.request_payload` for this row is byte-identical in shape to
  pre-change (M5's `exclude` must not perturb payloads that never had a `state_trace`).

### §6.7 — UAC-CRM-7: M5 exclusion holds
- **Trigger:** the §6.1 payload.
- **Expect:** `chat_histories.state_trace` is populated, **and** the corresponding
  `integration_logs.request_payload` does **not** contain the substring `state_trace`.
- **Why it exists:** §0.5. Without it the trace is stored twice forever in a table with no purge,
  and nothing else in this suite would notice.

---

## 7. Sequencing vs the n8n side

**CRM lands first. This is not a preference.**

```
  M1..M5 merged + `alembic upgrade head` on the target env
      │
      ▼   (column exists, passthrough live, n8n still silent -> HARMLESS)
  n8n producer starts sending state_trace
      │
      ▼
  M6 view already present; traces queryable from the first turn
```

- **CRM before n8n — required.** Until M3+M4 land, `state_trace` is dropped by pydantic
  `extra="ignore"` with no 422, no log line, and — per §0.1 — **not even a record in
  `integration_logs`**, because the log stores the post-validation dump. Every trace sent in that
  window is unrecoverable and the producer looks healthy. There is no backfill: the state is
  ephemeral and gone with the execution.
- **The reverse is harmless.** Column present, n8n not yet sending → every row simply has
  `state_trace IS NULL`. The view returns zero rows (it filters `state_trace IS NOT NULL`) rather
  than erroring. Nothing degrades. So there is no cost to landing CRM early and every reason to.
- **Verify the seam on the path you changed**, per LESSONS §54: after n8n starts sending, confirm
  a real **incoming** row has a non-NULL `state_trace` **and** that its paired outgoing row has
  `state_trace IS NULL` — do not infer either from a clean migration or from a happy-path spot check.
  The first real trace to arrive should also be checked for `after: null` handling on a genuine
  no-access turn (contact `457216562`), since that branch is the one §6.2 only simulates.
- **M6 (the view) may land with M1** — it is read-only and returns zero rows until traces exist.
  Splitting it into a later migration buys nothing and risks it being forgotten.

---

## 8. Open items

- **N1/N2/N3** (§1.1) — producer-side shape decisions the view depends on. Lock these in
  `state-transition-monitor-n8n-plan.md` before M6 is written, or accept that the view will need a
  `DROP VIEW` + re-create (§3 caveat) rather than a `CREATE OR REPLACE`.
- **View naming** (§0.6) — `public.v_turn_state_transition` (brief's prefix) vs the repo's sole
  precedent `scm.<name>_v` (suffix, namespaced schema). Reviewer decision; flagged, not silently taken.
- **Trace on the escalation path** — obs-latency shipped with outgoing `turn_id` still null on
  escalation because sub-callers were never enumerated transitively (LESSONS §49). The escalation
  branch writes state via a different node; whether it emits `state_trace` at all is an n8n-side
  question that must be answered before anyone reads an absence of escalation traces as "escalations
  never lose entities."
