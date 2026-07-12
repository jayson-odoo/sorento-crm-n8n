# Cycle 1 — `mode`-gated regression record/replay (TEST clone only)

Target: `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v` (the existing UAC clone, extended).
Live `9qVyfUxmRQqrpGRMDLRuz` and the published subs: UNTOUCHED.
Builds on the fail-closed harness (`cycle-1-harness.md`). All egress stays blocked in every mode
(the 5 orphaned egress nodes + `is_test=true` sub calls + Guard H stay exactly as-is; the prod-CRM
`save-session-vars` PUT stays ORPHANED in all modes).

## `mode` field
Read from the redis item: `$('redis-pop-main-message-list').first().json.message.mode` ∈
`{ uac (default/absent), regress-capture, regress-replay }`. Everything below is ADDITIVE and gated;
when `mode` is absent/`uac`, every new gate takes its FALSE/real branch → behaviour identical to the
prior canary-passing graph.

Postgres credential: `n8n_test-db` (`Dnnofg8Xb27VQOhI`, type `postgres`). All DB I/O targets
`n8n_test.respond_contacts_test` (PK `respond_io_id`, jsonb `session_vars`) — never prod.

---

## IMPLEMENTED THIS PASS (zero risk to the uac/canary path)

### 1. Read-node REPLAY — zero-name-ref reads (`get-access-types`, `Call 'sub-get-results'`)
Pattern: `IF mode==='regress-replay'` immediately upstream; TRUE → a code node emitting the recorded
fixture from `…message.fixtures.<key>` in the real node's output shape; FALSE → the real node.
Safe because **neither node is referenced by `$('node')` anywhere** (verified: 0 refs each), so the
real node can be skipped without breaking downstream — downstream reads `$json` (the fixture code's output).

| node | replay IF | fixture code (key) | wiring |
|---|---|---|---|
| `get-access-types` (httpRequest) | `replay-get-access-types` | `fixture-get-access-types` (`fixtures.get_access_types`, emits one item per row so `Aggregate` on `name` works) | `If`[0] → replay; TRUE → fixture → `Aggregate`; FALSE → `get-access-types` → `Aggregate` |
| `Call 'sub-get-results'` (executeWorkflow) | `replay-get-results` | `fixture-get-results` (`fixtures.get_results`) | `Loop Over Items`[1] → replay; TRUE → fixture → `validator`; FALSE → `Call 'sub-get-results'` → `validator` |

`uac` / `regress-capture`: mode≠regress-replay → FALSE branch → real call (unchanged).
The inserted IFs are transparent on the uac path: `get-access-types` reads only name-refs (ignores
`$json`); `Call 'sub-get-results'` reads `$json.name` which the IF passes through from `Loop Over Items`.

### 2. SESSION SAVE redirect → Postgres (additive, regress-only)
- ADDED `session-save-gate` (`IF` `mode ∈ {regress-capture, regress-replay}`) as a THIRD edge off
  `compile-current-state` (alongside the unchanged `…respond2` and `guard-d-record`).
- TRUE → `pg-upsert-session` (`postgres` v2.6 `executeQuery`):
  `INSERT INTO n8n_test.respond_contacts_test (respond_io_id, session_vars, updated_at)
   VALUES ($1, $2::jsonb, now())
   ON CONFLICT (respond_io_id) DO UPDATE SET session_vars = EXCLUDED.session_vars, updated_at = now();`
  `queryReplacement = [ findcontact.id, JSON.stringify($json) ]` ($json = `compile-current-state`
  output = the exact body the real PUT would have sent — the would_write payload).
- `uac`: gate FALSE → nothing. The real `save-session-vars` httpRequest stays **orphaned (0 inbound)
  in all modes** — prod CRM is never written. The DB write hits only `n8n_test`.

### LLM replay (already present from the fail-closed harness, reused here)
`mock_parser_output` / `mock_reformulator_output` in the redis item drive the existing parser &
reformulator bypasses → `regress-replay` spends 0 LLM tokens; `regress-capture` omits them so the
real `gpt-4.1-mini` (parser) + `gpt-5.4-mini` (reformulator) run for capture.

### n8n node types used
- `n8n-nodes-base.if` (mode gates), `n8n-nodes-base.code` (fixture injectors),
  `n8n-nodes-base.postgres` v2.6 `executeQuery` (session upsert; cred `n8n_test-db`).

---

## NAME-REFERENCED reads/session (previously deferred) — NOW COMPLETED

### 3. Name-referenced reads/session — via remove + re-add NoOp-passthrough (no renameNode)
The three nodes read by name (`$('node')`) downstream were converted so the original name now belongs to
a **NoOp passthrough that always executes**, while the real call moves to a `-http` sibling and a
fixture/postgres branch is added. Because `$('resolve-entity')` etc. live in OTHER nodes' params (a
plain string), they were NOT touched by `removeNode` and now resolve to the new same-named NoOp — which
forwards whichever branch ran. This sidesteps BOTH unknowns (`renameNode` rewriting AND
`this.helpers.httpRequest` availability). All consumers use `.first()` only, so the NoOp (preserving
item 0) is safe.

Per-node structure — `<upstreams> → <gate IF> →` TRUE `→ <fixture|pg> →` `<NoOp name=<orig>>` `→ <downstream>`;
FALSE `→ <orig>-http →` same NoOp:

| original (now NoOp) | gate (condition) | TRUE branch | real-call node (FALSE) | downstream | name-refs preserved |
|---|---|---|---|---|---|
| `resolve-entity` | `replay-resolve-entity` (`mode==='regress-replay'`) | `fixture-resolve-entity` (`fixtures.resolve_entity`) | `resolve-entity-http` (httpRequest, verbatim copy) | `disallowed-entity-gate` | 4 ✓ |
| `check-access` | `replay-check-access` (`mode==='regress-replay'`) | `fixture-check-access` (`fixtures.check_access`) | `check-access-http` (verbatim) | `If5` | 1 ✓ |
| `get-session-vars` | `session-get-gate` (`mode ∈ {regress-capture, regress-replay}`) | `pg-get-session` (postgres SELECT) | `get-session-vars-http` (verbatim) | `Call 'sub-query-reformulator'` | 3 ✓ |

- `resolve-entity` / `check-access`: gate is `mode==='regress-replay'` → uac AND regress-capture take the
  real http call (capture must hit real CRM to be recorded); only replay injects the fixture.
- `get-session-vars`: gate is `mode ∈ regress-*` → BOTH regress modes read the `n8n_test` copy; uac reads
  live CRM. `pg-get-session` (executeQuery):
  `SELECT COALESCE((SELECT session_vars FROM n8n_test.respond_contacts_test WHERE respond_io_id = $1 LIMIT 1),
   '{"variables":{},"referenced_result_set":[]}'::jsonb) AS session_vars`
  (`queryReplacement = [ findcontact.id ]`) — COALESCE guarantees exactly 1 row (so the NoOp always emits an
  item), shaped to `.json.session_vars` exactly as the http body and the 3 consumers expect.

The `-http` siblings are byte-for-byte copies of the original node params (method/url/headers incl. the
inlined `x-api-key`/body), httpRequest v4.3. The inlined `x-api-key` HARDCODED_CREDENTIALS warnings on
`resolve-entity-http`/`check-access-http`/`get-session-vars-http` are the SAME pre-existing pattern as the
originals (also in LIVE) — not new.

---

## Verification (post-change, from get_workflow_details — nodeCount 97)
- (a) **uac path data-identical**: `mode` absent ⇒ `replay-resolve-entity`/`replay-check-access` FALSE →
  real `*-http` → NoOp(orig name) → original downstream; `session-get-gate` FALSE → `get-session-vars-http`
  → NoOp → reformulator; `replay-get-access-types`/`replay-get-results` FALSE → real nodes;
  `session-save-gate` FALSE → no DB write. `$('resolve-entity')`(4)/`$('check-access')`(1)/
  `$('get-session-vars')`(3) all still present and now resolve to the executing NoOps. (Structurally +N
  transparent NoOp/IF nodes; data unchanged.)
- (b) **regress-replay**: ALL 4 reads injected from the redis item
  (`fixtures.{resolve_entity,check_access,get_access_types,get_results}`) + parser & reformulator mocks
  (0 LLM tokens). Session GET from `n8n_test` copy; session SAVE upsert to `n8n_test`.
- (c) **regress-capture**: `resolve-entity`/`check-access`/`get-access-types`/`get-results` run REAL
  (FALSE branch) for capture; both LLMs run real (mocks absent). Session GET + SAVE via the `n8n_test`
  copy.
- (d) **all modes**: `save-session-vars` (prod PUT), `update-human-intervened`, `send-message-files/images/video`,
  and `Call 'sub-respond-save-message-redis'2` have **inbound = 0** → unreachable. Sub calls still pass
  `is_test=true`. Egress + prod CRM PUT remain fully blocked.
- (e) **node types used**: `n8n-nodes-base.if`, `n8n-nodes-base.code`, `n8n-nodes-base.noOp`,
  `n8n-nodes-base.httpRequest` v4.3 (re-added real calls), `n8n-nodes-base.postgres` v2.6 `executeQuery`
  (cred `n8n_test-db`).

## ⚠️ TESTER MUST RE-RUN THE CANARY (this touched the canary-critical path)
These conversions inserted IF/NoOp/`-http` nodes onto the uac happy path (resolve-entity, check-access,
get-session-vars). I could NOT run executions. Before the clone is trusted, the **tester must re-run the
UAC §4 canary, and ideally §2 (no-access) and §3 (escalation), with `mode` absent** and confirm:
(1) uac output is still byte-identical to the prior canary, and (2) zero egress (egress list shows only
`blocked:true`; no respond.io 2xx, no assignment/SLA/PUT). Specifically confirm the NoOp passthroughs
forward the `*-http` outputs unchanged and that `$('resolve-entity')`/`$('check-access')`/
`$('get-session-vars')` resolve to the right data.

## Nodes added/changed this pass (consume-main → nodeCount 97)
- Read-replay (zero-ref): `replay-get-access-types`, `fixture-get-access-types`, `replay-get-results`,
  `fixture-get-results`.
- Session SAVE: `session-save-gate`, `pg-upsert-session`.
- Name-referenced conversions (each: original → NoOp passthrough + `-http` real node + gate IF + fixture/pg):
  - resolve-entity: `resolve-entity` (now NoOp), `resolve-entity-http`, `replay-resolve-entity`, `fixture-resolve-entity`.
  - check-access: `check-access` (now NoOp), `check-access-http`, `replay-check-access`, `fixture-check-access`.
  - get-session-vars: `get-session-vars` (now NoOp), `get-session-vars-http`, `session-get-gate`, `pg-get-session`.
