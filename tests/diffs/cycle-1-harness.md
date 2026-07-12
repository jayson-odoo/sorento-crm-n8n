# Cycle 1 — Test-Harness Guard Layer node-diff (FAIL-CLOSED redesign)

Target clone (TEST, never live): `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v`.
Live `9qVyfUxmRQqrpGRMDLRuz` was NOT touched.
Shared subs `aoydkG1dbItXR5jXFEQsP` (send), `rrYXzE61gCNUck_zmXe-G` (human-intervention),
`XTODTw-dJcV0uRdC056hG` (sub-semantic-parser/reformulator) carry a top-of-flow `is_test` guard
(published earlier this cycle); their internals are LEFT AS-IS in this revision.

Redis credential for every egress-record node: `sorento-redis` (`H5w6o7tptzTPMVdy`).
Egress records RPUSH to redis list `test:egress:{test_run_id}`.

---

## WHY THE REDESIGN (critical safety fix)
The MCP `execute_workflow` tool CANNOT pass custom JSON inputs to an `executeWorkflowTrigger`
(only chat/form/webhook inputs). So `$('When Executed by Another Workflow').first().json.test_mode`
is **undefined at run time** → a `test_mode`-gated `IF` would fall through to its FALSE/real branch →
**real egress**. The harness is therefore re-anchored to be **fail-closed and flag-independent**:

- The clone is **test-only**: every inline egress is now UNCONDITIONALLY blocked (no `IF`, no flag).
- All control fields are read from the **popped redis item**, not the trigger.

### Control anchor (VERIFIED against the clone)
The tester drives a case by `RPUSH`ing ONE JSON item onto redis list **`main-message-list-test`**,
then `execute_workflow(txiPzSxy3Pclsz6v)`. `redis-pop-main-message-list` (operation `pop`,
`propertyName: message`) pops it, so the item lands at `$('redis-pop-main-message-list').first().json.message`.
Verified: `sorento-sub-respond-findcontact-respond` reads `…json.message.contact`; `tf-message` reads
`…json.message.message`. Therefore control fields are read at:

```
$('redis-pop-main-message-list').first().json.message.test_run_id
$('redis-pop-main-message-list').first().json.message.mock_parser_output
$('redis-pop-main-message-list').first().json.message.mock_reformulator_output
$('redis-pop-main-message-list').first().json.message.scope        // routing only; not read by guards
```

### EXACT redis item the tester must push to `main-message-list-test`
```jsonc
{
  "message":   { /* whatsapp event: { text: "<user msg>" } or { attachment: {...} } */ },
  "contact":   { /* respond.io contact fixture: id, phone, assignee.id, customFields, firstName, lastName */ },
  "messageId": "test-<test_run_id>",
  "replyTo":   null,
  "test_run_id": "uac-happy-001",            // REQUIRED — scopes test:egress:{id}
  "scope": "deterministic",                  // deterministic | parser | get-results
  "mock_parser_output":      { /* parser JSON; present ⇒ Basic LLM Chain bypassed (0 tokens) */ },
  "mock_reformulator_output":{ /* reformulator inner `output` object; passed to the reformulator sub
                                  ⇒ its internal is_test+mock gate returns it (0 tokens) */ }
}
```
Omit `mock_parser_output` / `mock_reformulator_output` to run the real LLM tier (`scope:parser`/`get-results`).
The trigger payload (the `execute_workflow` arg) is now **ignored for safety**; the trigger schema
(`test_mode`,`scope`,`mock_parser_output`,`mock_reformulator_output`) is left declared but unused.

---

## Step-0 verification (re-confirmed)
- `Schedule Trigger`: ABSENT (0 scheduleTrigger nodes). PASS.
- `redis-pop-main-message-list`: `list = "main-message-list-test"`, `propertyName = "message"`. PASS.
- Entry path `When Executed by Another Workflow → redis-pop-main-message-list → tf-message` intact. PASS.
- Final consume-main node count: 74 → 82 (+12 harness nodes, −5 inline-guard `IF`s, +1 `guard-h-record`).
- No path executes `sub-respond-save-message-redis` (`UrETd-jm46tFj3Xw7w8vL`); its sole call site is orphaned (Guard H).

---

## T1 — Trigger payload schema (consume-main)
`When Executed by Another Workflow` `workflowInputs.values` still extended with `test_mode`(bool),
`scope`, `mock_parser_output`(obj), `mock_reformulator_output`(obj). **Now inert** — kept only so the
schema is non-surprising; nothing safety-relevant reads it (verified: 0 expressions reference the
trigger node).

---

## Guards c–g — inline egress, FAIL-CLOSED (consume-main)
The `IF test_mode` nodes were REMOVED. Upstream now wires straight to the record node; the real egress
node has **0 inbound connections** (unreachable). Each record node RPUSHes to `test:egress:{test_run_id}`
(test_run_id from the redis item) and passes its item through.

| Guard | record node | upstream → record (verified) | real egress node (now orphaned, 0 inbound) | downstream of record |
|---|---|---|---|---|
| c | `guard-c-record` (redis) | `is-human-intervened`[idx1] → guard-c-record (alongside `set-human-intervened`, which still carries flow) | `update-human-intervened` | leaf |
| d | `guard-d-record` (redis) | `compile-current-state` → guard-d-record (alongside `sorento-sub-respond-sendmsg-respond2`) | `save-session-vars` | leaf |
| e | `guard-e-record` (redis) | `Switch`[idx0] → guard-e-record | `send-message-images` | `Loop Over Items1` (continues media loop) |
| f | `guard-f-record` (redis) | `Switch`[idx1] → guard-f-record | `send-message-video` | `Loop Over Items1` |
| g | `guard-g-record` (redis) | `Switch`[idx2] → guard-g-record | `send-message-files` | `Loop Over Items1` |

Record payloads: c `{guard:"update-human-intervened",kind:"would_write",payload:{contactId,fields:{is_human_intervened:false}}}`;
d `{guard:"save-session-vars",kind:"would_write",payload:{contact_id,body:$json}}`;
e/f/g `{guard:"send-message-images|video|files",kind:"would_send",payload:{presigned_url,filename}}`.
`get-presigned-url` left LIVE (CRM read; plan §2.4).

## Guards a–b — shared subs, FAIL-CLOSED at the call site (consume-main)
The subs' published top-guards fire on `is_test === true`. Because the clone is test-only, EVERY
call site from the clone hardcodes the input **`is_test = true` (literal boolean, not an expression)**,
so the published guards ALWAYS block. `test_run_id` is passed from the redis item so the subs' record
pushes are scoped. Call sites (8):
- 6 send-sub callers (`…respond`, `respond2`, `respond3`, `respond4`, `respond5`, `…transcribed-message`):
  `is_test=true`, `test_run_id=={{ …message.test_run_id }}`.
- `Call 'sub-human-intervention'`: `is_test=true`, `test_run_id=={{ …message.test_run_id }}`.
- `Call 'sub-query-reformulator'`: `is_test=true`, `mock_reformulator_output=={{ …message.mock_reformulator_output }}`.
(The three shared subs' internal guard nodes were published earlier this cycle and are unchanged here.)

## Guard H — incoming-message logger, ORPHANED (consume-main)
`Call 'sub-respond-save-message-redis'2` (target sub `UrETd-jm46tFj3Xw7w8vL`) logs the incoming message
to redis→mongo. In test it (a) errored the canary run with "Invalid argument type" on its internal redis
push to `sorento-respond-message`, and (b) would pollute the real contact's mongo conversation history.
Only ONE call site exists in the clone, and it is terminal (no downstream consumer).
- Rewire: `if-message-is-audio`[idx1] previously → [`Call 'sub-respond-save-message-redis'2`, `get-session-vars`].
  Now → [`get-session-vars` (unchanged — carries the normal flow into the reformulator), **`guard-h-record`**].
  `Call 'sub-respond-save-message-redis'2` now has **0 inbound** (orphaned, never runs → sub `UrETd` never runs).
- ADDED `guard-h-record` (`redis` push, optional/observability): `{guard:"save-message-redis",
  kind:"would_log", target:"redis:sorento-respond-message->mongo", payload:{contact_id, message}}` to
  `test:egress:{test_run_id}`.
- Effect: happy-path and not-supported-domain paths now run to completion without the "Invalid argument type"
  halt; no incoming-message log is written to the real conversation store.

## T5 — Parser bypass (`Basic LLM Chain` / gpt-4.1-mini), re-anchored
- `parser-bypass-gate` (`if`) condition now: `!!$('redis-pop-main-message-list').first().json.message.mock_parser_output`
  (the `test_mode` clause was dropped). TRUE ⇒ bypass; absent ⇒ real chain (live tier).
- `mock-parser-output` (`code`) now: `const m = $('redis-pop-main-message-list').first().json.message;
  return [{ json: { output: m.mock_parser_output } }];` → `central-exchange` (accepts pre-parsed `output`).
- Wiring unchanged: `construct-user-prompt → parser-bypass-gate` → TRUE `mock-parser-output → central-exchange`,
  FALSE `Basic LLM Chain → central-exchange`.

## T6 — Reformulator bypass (`sub-semantic-parser` `XTODTw-dJcV0uRdC056hG`)
**Finding: IT IS AN LLM CALL** — trigger → `AI Agent` (`OpenAI Chat Model` = **gpt-5.4-mini** + Postgres
memory) → `output_exchange` → return. Inputs: `latest_user_message`(str), `contact_id`,
`previous_conversation_state`(obj), `referenced_result_set`(arr). Output:
`{ output: { message_type, intent_hint, domain_hint, user_goal, access_levels, entities,
routing:{suggested_team,suggested_agent}, date_mode, … } }` (consume-main reads `.json.output.*`).
Bypass lives INSIDE the sub (so the `$('Call 'sub-query-reformulator'')` name-refs stay valid): the
sub's `test-reformulator-bypass` `IF` fires on its own trigger inputs `is_test && mock_reformulator_output`,
returning `{output: mock_reformulator_output}` at 0 tokens. **This works because sub→sub executeWorkflow
DOES pass inputs** (unlike the MCP top-level trigger). The clone's call site supplies `is_test=true`
+ `mock_reformulator_output` (from the redis item), so deterministic cases spend 0 reformulator tokens;
omit the mock ⇒ real gpt-5.4-mini runs.

## T7 — SKIPPED (audio/transcription). `Transcribe a recording` left as-is.

---

## Final verification (post-revision, from get_workflow_details)
- (a) `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`: **inbound_count = 0** each → real egress unreachable.
- (b) All 8 shared-sub call sites: `is_test = true` (literal); control from redis item.
- (c) Parser gate + mock code read `…message.mock_parser_output`; reformulator call passes `…message.mock_reformulator_output`.
- (d) **0 expressions reference `When Executed by Another Workflow`** — no guard/bypass depends on the (unreachable) trigger payload.
- (e) `Call 'sub-respond-save-message-redis'2` (only call site of `UrETd`): **inbound = 0** → orphaned; `get-session-vars` still fed by `if-message-is-audio`[idx1], so the flow completes.

## Validation state
`update_workflow` returned only PRE-EXISTING warnings + the EXPECTED new `DISCONNECTED_NODE` warnings on
the 5 now-orphaned real-egress nodes (intended: they are deliberately unreachable on the test-only clone).
Pre-existing (also in LIVE): HARDCODED_CREDENTIALS (x-api-key inlined), DISCONNECTED `Code in JavaScript`
& `sorento-sub-respond-sendmsg-respond3`, `OpenAI Chat Model` builtInTools, `Transcribe` binaryPropertyName.
No new *errors*.

## Nodes (final on clone)
- consume-main harness nodes (8 present): `parser-bypass-gate`, `mock-parser-output`,
  `guard-c-record`, `guard-d-record`, `guard-e-record`, `guard-f-record`, `guard-g-record`, `guard-h-record`.
  (Removed this revision: `guard-update-human-intervened`, `guard-save-session-vars`,
  `guard-send-message-images`, `guard-send-message-video`, `guard-send-message-files`.)
- Orphaned-by-design real egress/log (kept, 0 inbound): `update-human-intervened`, `save-session-vars`,
  `send-message-images`, `send-message-video`, `send-message-files`, `Call 'sub-respond-save-message-redis'2`.

## Notes for reviewer & tester
- The clone is now **structurally incapable of real egress**: every send/write path either dead-ends at a
  redis-record node or routes into a published sub that hard-blocks on `is_test=true`. No flag, no payload
  dependency.
- Tester: push the redis item (schema above) to `main-message-list-test`; assert on
  `test:egress:{test_run_id}` + node outputs. `test_run_id` is REQUIRED in the pushed item.
- Reviewer: shared subs `aoydkG1dbItXR5jXFEQsP`/`rrYXzE61gCNUck_zmXe-G`/`XTODTw-dJcV0uRdC056hG` are
  live-shared; their guards fire only on `is_test=true`, which prod callers never pass — re-confirm.
- `redis-pop-main-message-list` showed `credentials:null` via the read API (likely redaction). If it
  actually lost `sorento-redis` during the step-0 clone, re-attach before runs (the new Redis push
  record nodes already carry `sorento-redis`).
