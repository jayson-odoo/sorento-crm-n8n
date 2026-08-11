# Node-diff: quick-reply reply logging fix

**Change-id:** `quickreply-logging-fix`
**Date:** 2026-07-14
**Author role:** coder
**Bug ref:** memory `quickreply-not-logged.md` — buttoned bot replies bypass `save-message-redis` → missing from `chat_histories`.

## Targets
- **Live sub (NOT edited, promotion target):** `sorento-sub-respond-sendmsg-respond` = `aoydkG1dbItXR5jXFEQsP` (active version `c5547583`).
- **Fork built + tested here:** `sorento-sub-respond-sendmsg-LOGFIX` = **`uoO5eiJFXA8THrry`**
  - Created via `create_workflow_from_code` (established MCP fork method in this project; UI-Duplicate not reachable via MCP and the prod host must not be driven).
  - Published: **yes** — `activeVersionId = 0749feb8-d9ae-4507-9364-aa5294d2ba3c` (== draft `versionId`; draft==active, no stale-draft landmine).
  - `active:false` at workflow level, triggerless, `availableInMCP:true`. Not wired into any live caller.
  - **Separate change** from the incoming-axis-gate work; does not touch it.
  - **NOT** the pre-existing chat fork `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) — that is a different change (chat-console `chat_id` gate, and it removed the langchain memory nodes). This fork was built fresh from the live sub so the reviewer sees the fix in a faithful context.

## The bug (confirmed against live structure)
Inside the sub: `When Executed → test-guard → If (quick_reply empty?)`
- `If` **TRUE** (plain text): `Code → If1 → Loop → Send a Message → Call 'sub-respond-save-message-redis'1` (type `outgoing`) → **LOGGED**.
- `If` **FALSE** (quick_reply present): `HTTP Request` (respond.io v2 quick_reply POST) → `Chat Memory Manager` → **done. NOT LOGGED.**

## The fix (one added node + one added connection)
Add a `save-message-redis` call on the **quick_reply branch**, wired as a **parallel fan-out off `HTTP Request`** so the existing `HTTP Request → Chat Memory Manager` edge stays byte-identical.

### Added node
| field | value |
|---|---|
| name | `Call 'sub-respond-save-message-redis' (quick_reply)` |
| id | `c2985929-1260-407a-8f79-5c4b238900db` |
| type | `n8n-nodes-base.executeWorkflow` v1.3 |
| position | `[1216, 760]` |
| workflowId | `UrETd-jm46tFj3Xw7w8vL` (`sub-respond-save-message-redis`) |

**workflowInputs.value** (mirrors the plain-text logger; sources from the quick_reply-branch context):
- `contact_id` = `{{ $('When Executed by Another Workflow').first().json.contact_identifer }}`
- `phone_number` = `{{ $('When Executed by Another Workflow').first().json.contact.phone }}`
- `message` = `{{ $('When Executed by Another Workflow').first().json.message }}` (the quick_reply title that was sent)
- `sent_at` = `{{ new Date().getTime() }}`
- `data` = `JSON.stringify({ contact_id, phone_number, message, sent_at, first_name, last_name, type:"outgoing", message_id:` `` `${$('HTTP Request').item.json.messageId}` `` `, quick_reply, result })`
  - `message_id` ← **`$('HTTP Request').item.json.messageId`** (see source below)
  - `quick_reply` ← `$('When Executed by Another Workflow').first().json.quick_reply` (extra field vs plain-text logger, records the buttons)
  - `result` ← `$('When Executed by Another Workflow').first().json.result_set`
- `type` = `"outgoing"` (matches plain-text branch)

Schema array (`contact_id, phone_number, message, sent_at, data`) copied from the plain-text logger.

### Added connection
`HTTP Request`.main[0] now fans out to **two** targets: `[ Chat Memory Manager, Call 'sub-respond-save-message-redis' (quick_reply) ]`.
- Pre-existing `HTTP Request → Chat Memory Manager` edge unchanged (byte-identical) → LLM memory behavior untouched.
- New logger is a terminal node (no downstream).

## message_id source (the field path finding)
The plain-text logger uses `$('Send a Message').item.json.messageId` (respond.io community node `SEND_MESSAGE`). On the quick_reply branch the send is the raw **`HTTP Request`** POST to the same respond.io v2 endpoint (`POST /v2/contact/id:{id}/message`), whose success body is `{"messageId": <number>}`.
- Grounded in the **sibling respondio node's proven output**: sampled live executions show `$('Send a Message').item.json.messageId` = e.g. `"1783996922700277"` (a ~16-digit id) — the raw v2 POST returns the same `messageId` field.
- Could not capture a live execution that took the quick_reply (`HTTP Request`) branch: 8 recent sub-executions sampled all took the plain-text path (buttoned replies are rare in the current window — even "escalate to purchasing team?" offers are currently sent as plain text). So the field is confirmed structurally/by-convention, not by a captured quick_reply run.
- Field path used: **`$('HTTP Request').item.json.messageId`** (httpRequest returns the parsed JSON body as item json; `.item` is the single paired item on this non-looping branch).

## Test-safety proof (zero prod-write in test mode)
Structural, not flag-trusted:
1. `test-guard` (`is_test === true`) routes to **output 0 (TRUE) → `test-guard-record`**, which has **no outgoing connection** → execution stops.
2. The new logger is fed **only** by `HTTP Request`. `HTTP Request` is reachable **only** via `test-guard` output 1 (FALSE) → `If` output 1 → `HTTP Request`.
3. In test mode `test-guard` never routes to output 1, so `If`, `HTTP Request`, `Chat Memory Manager`, and the **new logger never execute**.

⇒ **A test-mode execution reaches `test-guard-record` and stops; it can never reach the new `save-message-redis` call.** Zero prod chat_histories write in test mode.

The new logger fires only on a **real (non-test) quick_reply send** — exactly like the existing plain-text logger. Full end-to-end proof (a buttoned reply appearing in `chat_histories`) is only observable **post-promote in non-test mode**; pre-promote verification here is structural + test-guard-based.

## Intentional deviations from live (documented)
1. **4 disabled dead nodes omitted** from the fork: `Wait`, `Find a Message`, `Switch1`, `Send Template` (all `disabled:true`, 0 reachable inbound in live, never execute, not part of the fix). Promotion applies only the added node to live — the live dead nodes are untouched.
2. **`HTTP Request` credential left unbound** in the fork. MCP `setNodeCredential` statically rejects `respondIoApi` on `httpRequest` (the `predefinedCredentialType`/`nodeCredentialType` mechanism isn't recognized by that validator). Harmless: `HTTP Request` never runs in test mode; and an unbound cred is **fail-closed** (a stray non-test run would error, not POST). The live promotion target already has this credential bound.
3. Credentials auto-bound on the fork: `test-guard-record → sorento-redis`, `Postgres Chat Memory1 → sorento-crm-db` (matches live intent; runs only on the real branch, never in test), `Send a Message → sorento-api`. No wrong/test-DB mis-bind.

## Validation
- SDK `validate_workflow(code)`: **valid**, `nodeCount:12` (pre-add), one benign warning `SUBNODE_NOT_CONNECTED` on `Chat Memory Manager` — a validator misclassification of `memoryManager` (a root node that consumes an `ai_memory` subnode; the `Postgres Chat Memory1 --ai_memory--> Chat Memory Manager` connection IS present). Not a defect; the same node type is a plain node in live.
- `update_workflow` applied all param/structure ops atomically (each validated on apply); final `nodeCount:13`.
- `publish_workflow`: success. (Note: this MCP `validate_workflow` only validates SDK code, not a workflow by id; the update-time validation + the pre-create code validation are the equivalent gate.)

## Promotion note (for reviewer → user-gated)
Promotion is a single additive diff on **live `aoydkG1dbItXR5jXFEQsP`**:
- addNode `Call 'sub-respond-save-message-redis' (quick_reply)` (params above), and
- addConnection `HTTP Request`.main[0] → new logger (keeping the existing `HTTP Request → Chat Memory Manager` edge).

No live node is modified or removed; the real (FALSE) branch send path stays byte-identical. Coder does NOT promote (user-gated).
