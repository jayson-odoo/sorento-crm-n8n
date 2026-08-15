# Throwaway build — `zz-THROWAWAY-s32-pinmatrix` (S3.2 V2 functional matrix)

Change id: `intervention-tickets-s32` · slice: **V2 S8-compliant test double** · seat: coder
Build date: 2026-08-12 · executions run: **3, all on this throwaway, in the fail-loud pass only**
(§12 — mechanism verification, NOT the matrix; the matrix is still the tester's slice)
Amended 2026-08-12 (**hardening pass** — the create stand-in re-synced to the hardened fork
template, plan edit-list item 3 "HARDENING" bullet). See §11.
Amended 2026-08-12 (**fail-loud pass** — `if-in-working-hours` re-keyed after the tester's case (f)
FAIL; 3 mechanism-verification executions run on this throwaway). See §12.

| | |
|---|---|
| **workflow id** | **`mTfA5b9TgHItWo2g`** |
| name | `zz-THROWAWAY-s32-pinmatrix (DISPOSABLE — delete after S3.2 V2 sign-off)` |
| versionId (current, after the **fail-loud** PUT, §12) | **`2d1c03b3-fa63-44c9-8ff3-9c045e62200e`** (was `040b8fed-912e-4a53-9da9-3ef953136fe7`, before that `72e1d765-a8a9-46c5-a142-d7fe992ed4c7`) |
| activeVersionId | `2d1c03b3-fa63-44c9-8ff3-9c045e62200e` — **published**, `versionId == activeVersionId` |
| active | `True` |
| settings | `{"executionOrder": "v1", "availableInMCP": true}` (`availableInMCP: true` survived, so `test_workflow` can reach it) |
| node count | 16 (identical to the fork) |
| source of truth | REST `GET /workflows/vUfFUDjLAuMaeQE6` @ `fdc154b5-cb33-416c-a468-517fff59dc5e` for the original build; re-synced against the hardened fork @ `ceb72e9e-d708-4f35-b5ec-9d18286d316d`; fail-loud edit applied here FIRST and then mirrored to the fork @ **`16eadb1e-157b-419a-9441-e6510c40f4fc`** (drift-gated every time) |
| transport | REST `POST /workflows` (create) → MCP `publish_workflow` → REST `PUT` ×3 (one corrective edit + the hardening re-sync + the fail-loud edit) — HTTP 200 throughout |
| fork after this build | `vUfFUDjLAuMaeQE6` @ **`16eadb1e-…`** — moved by its **own** fail-loud PUT (`node-diff.md` §4a), never by this workflow's PUTs |
| live sub after the build | `rrYXzE61gCNUck_zmXe-G` still `5018a189-…`, `updatedAt 2026-07-22T01:27:32.239Z` — **not touched** |

> ⚠️ **DISPOSABLE.** Delete this workflow after S3.2 V2 sign-off. It is a test double, not a
> promote candidate: nothing in it may ever be copied toward `vUfFUDjLAuMaeQE6` or live.

---

## 1. Why it exists

UAC §0 **S8** forbids any `is_test:false` run against a graph containing a node of type
`@respond-io/…respondio`, `n8n-nodes-base.httpRequest`, or `@n8n/…memoryPostgresChat`, and
withdraws pinning as a safety mechanism. The fork `vUfFUDjLAuMaeQE6` fails that check four times
over (1 respondio + 3 httpRequest), and `test_workflow` does **not** pin `executeWorkflow` nodes —
so `Call 'sub-add-comment-respond'` would have executed the **unguarded live sub**
`2l8egTLJbyGOPvG-DbtDX` and posted a real respond.io comment with certainty. The fork therefore
cannot be run at `is_test:false` at all, and the fork's own `test-guard` short-circuits the entire
flow at `is_test:true`, which is a green that cannot fail (plan §Validation).

This throwaway is the S8-sanctioned escape: the same graph with the five egress/read nodes replaced
by **name-preserving Code stand-ins**, so every `$('<node>')` read still resolves and there is no
credentialed or network-capable node left on the path under test.

## 2. Generation method (programmatic, not hand-built)

`throwaway-standins/build.py` (committed beside this file):

1. Load the fresh REST GET of the fork and **assert `versionId == fdc154b5-cb33-416c-a468-517fff59dc5e`**;
   abort otherwise. (A hand-copied graph would decay exactly the way LESSONS §57 describes.)
   ⚠️ That pin is the **original** build's. The fork has since moved to `ceb72e9e-…` (the hardening
   PUT, §11), so re-running `build.py` unmodified will correctly ABORT. Bump the pin to the fork's
   current versionId before any regeneration — do not delete the assertion.
2. `deepcopy` every node. For the 5 stand-in names, emit a node that keeps the fork's **`id`,
   `name`, `position`** and replaces only `type`/`typeVersion`/`parameters` with
   `n8n-nodes-base.code` v2, `{mode:"runOnceForEachItem", jsCode:<file>}`, and **no `credentials`
   key at all**. The other 11 nodes are passed through byte-for-byte.
3. `deepcopy` `connections` unmodified — no rewiring whatsoever. Every stand-in is a single-main-output
   node replacing a single-main-output node, and both `If` nodes are untouched, so the topology is
   structurally unchanged.
4. `settings` copied, with `binaryMode`/`timeSavedMode` stripped (LESSONS §55 — the public
   `workflowSettings` schema rejects them). Neither was present here.
5. Refuse to emit the payload if **any** string parameter has trailing whitespace on any line
   (LESSONS §58b) — clean.

`mode: runOnceForEachItem` is deliberate and load-bearing: three of the five bodies transplant
`$('X').item` reads verbatim from the node they replace, and `$('X').item` / `$json` / `$input.item`
**only exist in per-item mode** in a Code node. Rewriting them to `.first()` would have changed the
paired-item semantics of the thing under test.

## 3. The 5 stand-in bodies (verbatim, as published)

Each is also a standalone file in `throwaway-standins/`, extracted from the published workflow
(not from my working copy) and `node --check`ed there.

### `get-round-robin-assignee`

- replaces: **`n8n-nodes-base.httpRequest`**, credential(s) `{"httpHeaderAuth": {"id": "mNsZWyU82NYV58k2", "name": "crm-n8n-auth"}}`
- becomes: `n8n-nodes-base.code` v2, `mode: runOnceForEachItem`
- node id / position preserved: `89103c96-7827-4735-84c5-8c55a24ec9fd` / `[-288, 224]`
- `sha256(jsCode)[:16]` = `26bc7297d294a6a2` · 1391 chars · `node --check` **OK**
- file: `throwaway-standins/get-round-robin-assignee.js`

```javascript
// ─── S8 STAND-IN for the credentialed httpRequest `get-round-robin-assignee` ───
// Real node: POST https://fe-sorento.foundryx.my/api/v1/external/next-assignee
// (credential `crm-n8n-auth`). Replaced by a Code node of the SAME NAME so every
// downstream `$('get-round-robin-assignee')` read still resolves, with no
// credentialed node anywhere in the graph (UAC §0 S8).
//
// Case control rides on the TRIGGER envelope, not on a guard flag:
//   _case_already_assigned : boolean — drives `is_already_assigned`, i.e. which
//                            branch of `if-conversation-unassigned` is taken.
// Missing/non-boolean => THROW. A silent default would make case (b) run as
// case (a) and report green (LESSONS §61: no assertion that cannot fail).

const trig = $('When Executed by Another Workflow').first().json;
const already = trig._case_already_assigned;

if (typeof already !== 'boolean') {
  throw new Error(
    "[stand-in get-round-robin-assignee] trigger json._case_already_assigned must be a boolean (true|false); got " +
    JSON.stringify(already)
  );
}

return {
  json: {
    assignee_id: 'USR-0042',
    assignee_respond_user_id: 123456,
    policy_id: 'POL-1',
    is_already_assigned: already,
    is_working_hours: true,
    conversation_assignee_id: null,
    conversation_assignee_name: null,
    tier_response_hours: 1,
    tier_resolution_hours: 24
  }
};
```

### `Assign or unassign a Conversation1`

- replaces: **`@respond-io/n8n-nodes-respond-io.respondio`**, credential(s) `{"respondIoApi": {"id": "OiS59QkzpKfKSdaa", "name": "sorento-api"}}`
- becomes: `n8n-nodes-base.code` v2, `mode: runOnceForEachItem`
- node id / position preserved: `7687d2be-6276-4512-8e12-696dbced687a` / `[160, 32]`
- `sha256(jsCode)[:16]` = `96219975779fda31` · 897 chars · `node --check` **OK**
- file: `throwaway-standins/assign-or-unassign.js`

```javascript
// ─── S8 STAND-IN for the credentialed respondio node `Assign or unassign a Conversation1` ───
// Real node: the respond.io community node, resource CONVERSATIONS,
// assignmentType userId, credential `sorento-api` — a REAL assignment write with a
// staff email/WhatsApp ripple. Replaced by a Code node of the SAME NAME.
//
// The two expressions the real node evaluates are transplanted verbatim and emitted
// as `would_assign_*` so the tester can assert WHAT would have been assigned:
//   contactId       = {{ $('When Executed by Another Workflow').first().json.contact_id }}
//   assigneeUserId  = {{ $json.assignee_respond_user_id }}

const passthrough = $input.item.json;

return {
  json: {
    ...passthrough,
    _stand_in: 'assign',
    would_assign_contact: $('When Executed by Another Workflow').first().json.contact_id,
    would_assign_user: $json.assignee_respond_user_id
  }
};
```

### `conversation-sla-tracking-create`

- replaces: **`n8n-nodes-base.httpRequest`**, credential(s) `{"httpHeaderAuth": {"id": "mNsZWyU82NYV58k2", "name": "crm-n8n-auth"}}`
- becomes: `n8n-nodes-base.code` v2, `mode: runOnceForEachItem`
- node id / position preserved: `06ae4997-3eed-4f22-9871-18f405aff5be` / `[384, 32]`
- `sha256(jsCode)[:16]` = **`e082c29ea5c2145b`** · 5792 chars · `node --check` **OK**
  (was `6cfe0b2a086e4651` · 5257 chars before the hardening re-sync, §11)
- param sha = **`18191030897e`** (was `7fd0739a7d86`)
- file: `throwaway-standins/conversation-sla-tracking-create.js`

```javascript
// ─── S8 STAND-IN for the credentialed httpRequest `conversation-sla-tracking-create` ───
// Real node: POST https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration
// (credential `crm-n8n-auth`) — a REAL CRM write. Replaced by a Code node of the SAME NAME
// so every downstream `$('conversation-sla-tracking-create')` read still resolves.
//
// It does BOTH halves of the test double:
//  (i)  RENDERS the exact request body the real HTTP node would have sent. The jsonBody
//       template below is transplanted VERBATIM from the fork's httpRequest node — same
//       $() reads, same JSON.stringify calls, same quoting (message_id unquoted numeric,
//       source_message_id quoted string). It is rendered as a STRING and then JSON.parse'd,
//       so an unescapable value fails here exactly as it would have corrupted the real
//       request — a hand-built object literal would have silently papered over that.
//       HARDENING 2026-08-12: contact_phone_number / agent_code / team_set_code are now
//       emitted via JSON.stringify(x ?? '') with the template's surrounding quote chars
//       REMOVED (stringify supplies them), so a `"`, `\` or newline in any of the three no
//       longer malforms the body. `assigned_to_id` is deliberately left raw-interpolated
//       between quote chars — byte-for-byte with the fork — so a `"` there is still a
//       render failure, which is what keeps this instrument able to go red.
//  (ii) RETURNS the verbatim dev-backend fixture selected by the trigger's `_case_fixture`.
//
// `_rendered_body` / `_rendered_body_raw` / `_rendered_url` are merged ALONGSIDE the
// fixture keys, so downstream reads of in_working_hours / initiated_at / due_at /
// due_at_resolution / assigned_to are unaffected.

// ── verbatim from tests/diffs/intervention-tickets-s32/create-response-fixtures.json ──
const FIXTURES = {
  "fresh_insert_in_hours": {
    "status": "success",
    "message": "SLA tracking created successfully.",
    "tracking_id": "1926bae0-ed33-40c9-b324-96bde109d06e",
    "is_update": false,
    "already_active": false,
    "in_working_hours": true,
    "initiated_at": "2026-08-12T13:58:54.229717",
    "due_at": "2026-08-12T14:58:54.229717",
    "due_at_resolution": "2026-08-12T14:58:54.229717",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "retry_already_active": {
    "status": "success",
    "message": "Active SLA tracking already exists for this contact; returned existing tracking.",
    "tracking_id": "1926bae0-ed33-40c9-b324-96bde109d06e",
    "is_update": true,
    "already_active": true,
    "in_working_hours": true,
    "initiated_at": "2026-08-12T13:58:54.229717",
    "due_at": "2026-08-12T14:58:54.229717",
    "due_at_resolution": "2026-08-12T14:58:54.229717",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "fresh_insert_out_of_hours": {
    "status": "success",
    "message": "SLA tracking created successfully.",
    "tracking_id": "33ae44ea-4286-471a-8dc7-5caa76b3cdb1",
    "is_update": false,
    "already_active": false,
    "in_working_hours": false,
    "initiated_at": "2026-08-12T13:59:53.939402",
    "due_at": "2026-08-13T00:59:53.939402",
    "due_at_resolution": "2026-08-13T00:59:53.939402",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  }
};

const ALLOWED = [
  'fresh_insert_in_hours',
  'retry_already_active',
  'fresh_insert_out_of_hours',
  'missing_in_working_hours'
];

const trig = $('When Executed by Another Workflow').first().json;
const caseKey = trig._case_fixture;

if (ALLOWED.indexOf(caseKey) === -1) {
  throw new Error(
    "[stand-in conversation-sla-tracking-create] trigger json._case_fixture must be one of " +
    ALLOWED.join(' | ') + "; got " + JSON.stringify(caseKey)
  );
}

// ── (i) render the real request, verbatim transplant of the httpRequest node ──
const _rendered_url =
  'https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration';

const _rendered_body_raw = `{
    "assigned_to_id": "${ $('get-round-robin-assignee').item.json.assignee_id }",
    "contact_phone_number": ${ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') },
    "agent_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') },
    "team_set_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') },
    "message_id": ${ $('When Executed by Another Workflow').first().json.message_id },
    "source_message_id": "${ $('When Executed by Another Workflow').first().json.message_id }",
    "source_message_text": ${ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }
}`;

let _rendered_body;
try {
  _rendered_body = JSON.parse(_rendered_body_raw);
} catch (e) {
  throw new Error(
    '[stand-in conversation-sla-tracking-create] the rendered request body is not valid JSON — ' +
    'the real HTTP node would have sent this same malformed payload: ' + e.message +
    '\n---\n' + _rendered_body_raw + '\n---'
  );
}

// ── (ii) the pinned dev-backend response ──
let response;
if (caseKey === 'missing_in_working_hours') {
  // case (f): fresh_insert_in_hours with the in_working_hours key ABSENT, to exercise
  // `if-in-working-hours`'s typeValidation:"strict" (must error, not silently go FALSE).
  response = { ...FIXTURES.fresh_insert_in_hours };
  delete response.in_working_hours;
} else {
  response = { ...FIXTURES[caseKey] };
}

return {
  json: {
    ...response,
    _stand_in: 'sla-create',
    _case_fixture: caseKey,
    _rendered_url,
    _rendered_body,
    _rendered_body_raw
  }
};
```

### `get-working-days`

- replaces: **`n8n-nodes-base.httpRequest`**, credential(s) `{"httpHeaderAuth": {"id": "mNsZWyU82NYV58k2", "name": "crm-n8n-auth"}}`
- becomes: `n8n-nodes-base.code` v2, `mode: runOnceForEachItem`
- node id / position preserved: `321258ea-de71-47f8-a3b5-a3c14d2bb6b4` / `[1040, 176]`
- `sha256(jsCode)[:16]` = `266a45376a4c9538` · 800 chars · `node --check` **OK**
- file: `throwaway-standins/get-working-days.js`

```javascript
// ─── S8 STAND-IN for the credentialed httpRequest `get-working-days` ───
// Real node: GET https://fe-sorento.foundryx.my/api/v1/external/work-calendar
// (credential `crm-n8n-auth`). A READ, but S8 bans the node TYPE, not the verb: no
// HTTP Request node of any kind may exist in a graph run at is_test:false.
//
// Output shape mirrors what the out-of-hours reply actually consumes in
// `sorento-sub-respond-sendmsg-respond-routed-to-pic1`:
//   {{ $json.working_day_ranges[0].start_weekday }} - {{ $json.working_day_ranges[0].end_weekday }}
//   {{ $json.working_hours_start }} - {{ $json.working_hours_end }}

return {
  json: {
    working_day_ranges: [
      { start_weekday: 'Tuesday', end_weekday: 'Friday' }
    ],
    working_hours_start: '08:00',
    working_hours_end: '23:59'
  }
};
```

### `Call 'sub-add-comment-respond'`

- replaces: **`n8n-nodes-base.executeWorkflow`**, credential(s) `(none)`
- becomes: `n8n-nodes-base.code` v2, `mode: runOnceForEachItem`
- node id / position preserved: `e46f7d04-c53c-484a-9c5c-de37ebade46f` / `[608, 32]`
- `sha256(jsCode)[:16]` = `abee6ea9837fcb66` · 2086 chars · `node --check` **OK**
- file: `throwaway-standins/call-sub-add-comment-respond.js`

```javascript
// ─── S8 STAND-IN for the executeWorkflow node `Call 'sub-add-comment-respond'` ───
// Real node calls sub `2l8egTLJbyGOPvG-DbtDX` (`sub-add-comment-respond`), which is an
// UNGUARDED LIVE sub — it posts a real respond.io comment on a real conversation, with a
// staff-notification ripple. `test_workflow` does NOT pin executeWorkflow nodes (they
// execute normally), so this node MUST be removed, not pinned (UAC §0 S8).
//
// Replaced by a Code node of the SAME NAME. The SLA-alert comment template is transplanted
// VERBATIM from the fork's `workflowInputs.value.comment` expression (the live/rebased form:
// DateTime.fromISO(..., { zone: 'utc' }).setZone('Asia/Kuala_Lumpur')), so the tester asserts
// the exact string the real sub would have been handed. `user_id` is read the same way the
// real node reads it: $('get-round-robin-assignee').first().json.assignee_respond_user_id.

const _rendered_comment = `Team: ${ $('When Executed by Another Workflow').item.json.team }
⏰ SLA Alert: This contact is routed to you at ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.initiated_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') }.
You have until ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') } to respond.
You have until ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at_resolution, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') } to resolve.
Reference message: https://app.respond.io/space/364817/inbox/${ $('When Executed by Another Workflow').first().json.contact_id }#${ $('When Executed by Another Workflow').first().json.message_id }`;

const passthrough = $input.item.json;

return {
  json: {
    ...passthrough,
    _stand_in: 'comment',
    _rendered_comment,
    _comment_user_id: $('get-round-robin-assignee').first().json.assignee_respond_user_id,
    _comment_contact_id: $('When Executed by Another Workflow').first().json.contact_id
  }
};
```

### Contract notes on the two rendering stand-ins

**`conversation-sla-tracking-create`** renders the body as a **string** from the httpRequest node's
`jsonBody` template (verbatim, `{{ … }}` → `${ … }`, same `$()` reads, same `JSON.stringify` calls,
same quoting) and then `JSON.parse`s it. **This equivalence is now machine-checked, not asserted**:
the fork's published `jsonBody` with its leading `=` stripped and every `{{ x }}` rewritten to
`${ x }` is **string-equal** to the stand-in's `_rendered_body_raw` template literal (§11).
That is stronger than hand-writing an object literal: it
preserves `message_id` as an **unquoted number** and `source_message_id` as a **quoted string**
without me deciding those types, and it fails loudly if the rendered text is not valid JSON.
Both `_rendered_body` (object) and `_rendered_body_raw` (the exact string) are emitted, alongside
`_rendered_url`, merged with the fixture keys so downstream reads of `in_working_hours` /
`initiated_at` / `due_at` / `due_at_resolution` / `assigned_to` are unaffected.

**`Call 'sub-add-comment-respond'`** transplants the rebased (== live) comment expression, so
`DateTime.fromISO(…, {zone:'utc'}).setZone('Asia/Kuala_Lumpur')` runs for real (Luxon's `DateTime`
is a Code-node global) and `_rendered_comment` is the exact string the live sub would receive.
`_comment_user_id` is read the way the real node reads it
(`$('get-round-robin-assignee').first().json.assignee_respond_user_id`).

**Case control** rides on the trigger envelope: `_case_already_assigned` (boolean) and
`_case_fixture` (one of the four allowed keys). Both stand-ins **throw** on a missing/ill-typed
value rather than defaulting — a silent default would make case (b) execute as case (a) and report
green, which is the LESSONS §61 class this whole slice exists to avoid.

`_case_fixture` mapping:

| `_case_fixture` | response | matrix case |
|---|---|---|
| `fresh_insert_in_hours` | fixture verbatim (`in_working_hours: true`, `already_active: false`) | a, b |
| `fresh_insert_out_of_hours` | fixture verbatim (`in_working_hours: false`) | c, d |
| `retry_already_active` | fixture verbatim (`already_active: true`, `is_update: true`) | e |
| `missing_in_working_hours` | `fresh_insert_in_hours` with the `in_working_hours` key **deleted** | f |

Case (f) exists to force an absent `in_working_hours` — it must **error**, not silently fall to the
out-of-hours branch. The stand-in `delete`s the key (it is absent, not `null`). ⚠️ **Corrected
2026-08-12:** the original rationale here — "because `if-in-working-hours` carries
`typeValidation: "strict"`" — was wrong, and case (f) proved it (execution `12210538`: no error, the
node routed FALSE). Strict validation rejects a value that is present with the wrong type; it
coerces `undefined` to `false`. The If now coalesces the absent case to a sentinel string so strict
validation has something to reject — see §12 and `node-diff.md` §4a. The stand-in itself is
unchanged: deleting the key is still exactly the input the case needs.

## 4. S8 sweep — result

Asserted on a **fresh re-GET after the final PUT**, over the *entire* workflow JSON (including the
`activeVersion` block, which LESSONS §59b notes still carries the shipped node set):

| banned node type | raw-substring occurrences in the whole JSON | nodes with that `type` | `activeVersion.nodes` with that `type` |
|---|---|---|---|
| `@respond-io/n8n-nodes-respond-io.respondio` | **0** | **none** | **none** |
| `n8n-nodes-base.httpRequest` | **0** | **none** | **none** |
| `@n8n/n8n-nodes-langchain.memoryPostgresChat` | **0** | **none** | **none** |

Node-type inventory of all 16 nodes (the sound proxy — MCP redacts credentials, LESSONS §47):

| type | count | nodes |
|---|---|---|
| `n8n-nodes-base.code` | 6 | `Assign or unassign a Conversation1`, `Call 'sub-add-comment-respond'`, `conversation-sla-tracking-create`, `get-round-robin-assignee`, `get-working-days`, `return-assignee` |
| `n8n-nodes-base.executeWorkflow` | 3 | `sorento-sub-respond-sendmsg-respond-routed-to-pic`, `sorento-sub-respond-sendmsg-respond-routed-to-pic1`, `sorento-sub-respond-sendmsg-respond-routed-to-pic2` |
| `n8n-nodes-base.executeWorkflowTrigger` | 1 | `When Executed by Another Workflow` |
| `n8n-nodes-base.if` | 4 | `chat?`, `if-conversation-unassigned`, `if-in-working-hours`, `test-guard` |
| `n8n-nodes-base.redis` | 2 | `chat-escalation-push`, `test-guard-record` |

**Verified independently twice**: once via REST (which does *not* redact credentials, LESSONS §55)
and once via MCP `get_workflow_details` — both return zero banned types and identical type sets for
`nodes` and `activeVersion.nodes`.

## 5. Credentialed-node inventory (from REST, which does not redact)

| node | type | credential |
|---|---|---|
| `test-guard-record` | `n8n-nodes-base.redis` | `redis` → `sorento-redis` (`H5w6o7tptzTPMVdy`) |
| `chat-escalation-push` | `n8n-nodes-base.redis` | `redis` → `sorento-redis` (`H5w6o7tptzTPMVdy`) |

**That is the complete list — exactly 2 nodes, both redis, both pre-existing harness nodes.**

- The three `executeWorkflow` sendmsg callers carry **no credentials of their own** (verified: their
  `credentials` key is absent), and all three still target `69RhomhiCH4bpY1w`
  (`zz-sub-sendmsg-BLOBTEST`) — the S8-✅ sink fork, unchanged from the fork.
- The fork's 4 other credentialed nodes are gone with the nodes that held them:
  `respondIoApi → sorento-api` (assign) and `httpHeaderAuth → crm-n8n-auth` ×3
  (next-assignee, sla-create, work-calendar). n8n-MCP could not have removed those credentials
  (LESSONS §47); replacing the node is the only mechanism that does.
- `sorento-api` / `crm-n8n-auth` still appear as **plain text inside stand-in comments**, documenting
  what was replaced. They are not bindings, and no secret value appears anywhere in the workflow.

## 6. Equality proof vs the fork

Re-derived live 2026-08-12 **after both fail-loud PUTs** (fork `16eadb1e-…` vs throwaway
`2d1c03b3-…`); the only row that moved vs the post-hardening derivation is `if-in-working-hours`,
and it moved **identically on both sides**. Per-node `sha256(json.dumps(parameters, sort_keys=True, ensure_ascii=False))[:12]`. `ensure_ascii=False`
is required to reproduce `node-diff.md`'s table — the `⏰` in the SLA-alert comment makes the two
settings disagree on exactly that one node (`c2cd407558ce` vs `86ebdd024010`). Fork column below is
re-derived live and matches `node-diff.md`'s post-build table on all 16 nodes.

| node | fork sha | throwaway sha | verdict |
|---|---|---|---|
| `Assign or unassign a Conversation1` | `7669b6c4d7cb` | `16c1dfb51459` | **STAND-IN** — differs by design |
| `Call 'sub-add-comment-respond'` | `c2cd407558ce` | `8ee3a06d26c6` | **STAND-IN** — differs by design |
| `When Executed by Another Workflow` | `048ecba6eec7` | `048ecba6eec7` | MATCH |
| `chat-escalation-push` | `b6f384e4bc9f` | `b6f384e4bc9f` | MATCH |
| `chat?` | `aab7ec62a352` | `aab7ec62a352` | MATCH |
| `conversation-sla-tracking-create` | `7a6db3f826ef` | `18191030897e` | **STAND-IN** — differs by design |
| `get-round-robin-assignee` | `b40f59333e24` | `640f41d2c653` | **STAND-IN** — differs by design |
| `get-working-days` | `47416000dd11` | `81082b50c05b` | **STAND-IN** — differs by design |
| `if-conversation-unassigned` | `50391b189ae0` | `50391b189ae0` | MATCH |
| `if-in-working-hours` | `722d7448d591` | `722d7448d591` | MATCH (both moved from `84997fcc6296` in the fail-loud pass, §12) |
| `return-assignee` | `ac0f05302a93` | `ac0f05302a93` | MATCH |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic` | `c92a80efe303` | `c92a80efe303` | MATCH |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic1` | `ac24ccda63c3` | `ac24ccda63c3` | MATCH |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic2` | `d4b3270a5ffe` | `d4b3270a5ffe` | MATCH |
| `test-guard` | `4c7e7ac0dcec` | `4c7e7ac0dcec` | MATCH |
| `test-guard-record` | `45a71381e314` | `45a71381e314` | MATCH |

- node-name sets equal: **yes** (16 vs 16).
- **All 11 non-stand-in nodes match the fork's param sha exactly**, and additionally match on
  `id`, `position`, `type`, `typeVersion` and `credentials`.
- All 5 stand-ins keep the fork's `id` and `position`; only `type`/`typeVersion`/`parameters` differ.
- unexpected differences: **0**

**Connections deep-equal:** `fork.connections == throwaway.connections` → **True**
(canonical sha `66a1ef742d9495e9` on both sides). `activeVersion.connections == connections` and
`activeVersion.nodes == nodes` → **True** (so the published version *is* the reviewed version;
no unowned draft delta, LESSONS §51).

Resulting graph is therefore identical to `node-diff.md` §Resulting graph, with five nodes swapped
in place:

```
When Executed by Another Workflow
  → chat?                                     [HARNESS, untouched]
      TRUE  → chat-escalation-push            [HARNESS, terminal]
      FALSE → test-guard                      [untouched]
                TRUE  → test-guard-record     [fail-closed, terminal]
                FALSE → …routed-to-pic2       [executeWorkflow → zz-sub-sendmsg-BLOBTEST]
                          → get-round-robin-assignee            « STAND-IN »
                            → if-conversation-unassigned        [untouched]
                                TRUE  → Assign …Conversation1   « STAND-IN » ─┐
                                FALSE → ──────────────────────────────────────┴→ conversation-sla-tracking-create   « STAND-IN »
                                                                                  → Call 'sub-add-comment-respond'   « STAND-IN »
                                                                                    → if-in-working-hours            [untouched]
                                                                                        TRUE  → return-assignee → …routed-to-pic
                                                                                        FALSE → get-working-days « STAND-IN » → …routed-to-pic1
```

## 7. `node --check`

All five bodies were extracted from the **published** workflow JSON to files and checked with
`node --check` (node v22.21.1): **5/5 OK**. Byte-gated: each published `jsCode` is byte-identical to
its source file (`throwaway-standins/*.js`), so the committed files are the deployed bytes, not a
transcription (LESSONS §69/§71).

| file | sha256[:16] | chars | `node --check` |
|---|---|---|---|
| `get-round-robin-assignee.js` | `26bc7297d294a6a2` | 1391 | OK |
| `assign-or-unassign.js` | `96219975779fda31` | 897 | OK |
| `conversation-sla-tracking-create.js` | **`e082c29ea5c2145b`** | 5792 | OK |
| `get-working-days.js` | `266a45376a4c9538` | 800 | OK |
| `call-sub-add-comment-respond.js` | `abee6ea9837fcb66` | 2086 | OK |

## 8. Offline probe (bonus instrument — not a substitute for the matrix)

`throwaway-standins/probe.js` runs the five **published** bodies under a stubbed Code-node context
(`$`, `$input`, `$json`, a minimal Luxon `DateTime` shim) with zero network and zero n8n. It walks
all six cases a–f along the branch each case actually takes and asserts **154** properties
(147 + 7 added by the hardening pass, §11), including:

- `message_id` renders as a **number** and `source_message_id` as the **same value as a string**;
- the rendered body's key set is **exactly** the locked 7 keys — no `policy_id`, no `current_tier`,
  no `assigned_to`;
- `source_message_text` survives an embedded `"` and a newline (round-trips to the input);
- the comment reads `initiated_at`/`due_at`/`due_at_resolution` **off the create response** and
  converts `utc → Asia/Kuala_Lumpur`;
- case (f) produces a response with `in_working_hours` **absent**, not `null`/`false`;
- five **fail-on-purpose** cases proving the guards go RED (absent `_case_already_assigned`, a
  *string* `"true"`, a typo'd `_case_fixture`, an absent `_case_fixture`, and an unrenderable body —
  the last one now driven through the still-raw `assigned_to_id`, see §11);
- **(added §11)** the three hardened keys survive a hostile value (`a"b\c\n d`, `C"S`, `CS\n"TEAM`)
  by round-tripping into `_rendered_body` unchanged, and `null` / `undefined` / an absent key each
  render `""`.

Result: **all 154 assertions pass, all five deliberate faults go red.** Re-run with
`cd throwaway-standins && node probe.js .`

What the probe explicitly does **not** cover, and why it is not evidence for the matrix: it stubs
n8n's paired-item resolution, its typed-input handling, `if-conversation-unassigned` /
`if-in-working-hours` themselves, and the `executeWorkflow` sendmsg legs. Only the tester's
`test_workflow` run exercises those.

## 9. Handover notes for the tester (read before driving the matrix)

1. **Drive it by pinning the trigger node, not by calling it from a parent.**
   `_case_already_assigned` and `_case_fixture` are **not** declared in
   `When Executed by Another Workflow`'s `workflowInputs.values` — the trigger is one of the 11
   byte-identical nodes and I was instructed to keep it untouched. A typed `executeWorkflowTrigger`
   filters an incoming payload to its declared inputs, so an `executeWorkflow` call would very likely
   drop both `_case_*` keys — at which point **both stand-ins throw by design** (they refuse to
   default), which is the correct loud failure rather than a silent case collapse. `test_workflow`
   pinData on the trigger node replaces the node's output wholesale and is not filtered, so it
   carries the `_case_*` keys through. If you need them declared instead, that is a trigger-node
   param change and it breaks the equality proof in §6 — re-record it, don't do it silently.
2. **Also pin `contact.chat_id` empty and `is_test` false** so `chat?` goes FALSE and `test-guard`
   goes FALSE — otherwise you re-run the short-circuit the plan already calls a green that cannot fail.
3. **Assert per-node runData, never execution status** — and specifically assert
   `Assign or unassign a Conversation1` is **ABSENT from runData** on cases (b) and (d). That is the
   execution-shape discriminator for the lost-enquiry fix (LESSONS §64 rule iii); the reply text is
   identical either side of it, so text alone cannot see it.
4. **The queue-push assertion is static here**: `sorento-respond-assignee-queue` occurs **0 times**
   in this workflow's JSON, and the `Redis` node that pushed it does not exist. There is no dynamic
   assertion to make; record it as a static check.
5. **Delete `mTfA5b9TgHItWo2g` after sign-off.**

## 10. Deviations, and one finding

- **Two publishes, not one.** The first published version (`dcfa7b27-…`) passed the type-level S8
  check but my *raw-substring* sweep found 2 hits for `@respond-io/…respondio` and 2 for
  `n8n-nodes-base.httpRequest` — both were my own **comment prose** naming the type being replaced.
  Rather than explain away a red instrument, I rewrote the comments so a naive
  `grep -F '<banned type>'` over this workflow returns a clean **0**, and re-PUT
  (`72e1d765-…`). No functional change; the only diff between the two versions is comment text in
  `assign-or-unassign.js` and `get-working-days.js`. Recorded because §6's equality table and §7's
  shas describe `72e1d765-…` — **superseded: they now describe `040b8fed-…`, §11** — and because a
  future reviewer running the obvious grep should not have to rediscover this.
- **Superset on the create stand-in.** The brief asked for `_rendered_body` + `_rendered_url`; I also
  emit `_rendered_body_raw` (the exact pre-parse string, for a byte-level assertion),
  `_stand_in: "sla-create"` and `_case_fixture` (echoed back so a run log records which fixture
  produced the row). Additive only.
- **Superset on the comment stand-in.** Also emits `_comment_contact_id`, the `contact_id` the real
  node passes as the sub's first input, so the tester can assert the whole call and not just the text.
- **`validate_workflow` remains unavailable for this** — on this MCP surface it validates n8n
  Workflow **SDK source code** (`{code: string}`), not a workflow id, exactly as `node-diff.md`
  §"Not performed" records. The structural assertions in §4–§7 stand in its place.
- **Finding, pre-existing, not introduced here (worth one line to the reviewer). → RESOLVED, see §11.**
  The locked `jsonBody` interpolated `contact_phone_number`, `agent_code` and `team_set_code` **raw
  between quote characters**; only `source_message_text` was `JSON.stringify`'d. So any of those three
  containing a `"`, `\` or newline produced a malformed request body on **live** too. The stand-in
  surfaced this as an explicit throw (probe case 5); the real httpRequest node would send the
  malformed payload. Today's values are digits/short codes, so this was latent, not live — but it was a
  property of the promotable body, not of the harness. **The plan absorbed it as edit-list item 3's
  HARDENING bullet and it is now fixed on the fork (`node-diff.md` §3a) and mirrored here (§11).**

---

## 11. Hardening re-sync (2026-08-12, second PUT — `72e1d765-…` → `040b8fed-…`)

The §10 finding was adopted into the plan and fixed on the fork (`node-diff.md` §3a): the fork's
`jsonBody` now emits `contact_phone_number`, `agent_code` and `team_set_code` via
`{{ JSON.stringify(x ?? '') }}` with the template's surrounding quote chars removed. Because the
create stand-in exists to render **the fork's bytes**, it had to be re-synced or the matrix would
have tested a body that is no longer the one being promoted.

**Scope of this PUT — exactly one node's `jsCode`:**

| | before | after |
|---|---|---|
| throwaway versionId | `72e1d765-a8a9-46c5-a142-d7fe992ed4c7` | **`040b8fed-912e-4a53-9da9-3ef953136fe7`** (`== activeVersionId`) |
| `conversation-sla-tracking-create` param sha | `7fd0739a7d86` | **`18191030897e`** |
| its `sha256(jsCode)[:16]` | `6cfe0b2a086e4651` (5257 chars) | **`e082c29ea5c2145b`** (5792 chars) |
| other 15 nodes' param shas | — | **all unchanged** (delta table re-run: exactly one node CHANGED) |
| `connections` | — | deep-equal to before; `activeVersion.nodes == nodes` |
| credentialed nodes | 2 (both redis) | **2, unchanged** — `test-guard-record`, `chat-escalation-push` |

**Code delta** — 3 template lines plus the header comment. Nothing else in the body moved: the
`FIXTURES` blob, the `_case_fixture` allow-list and throw, `_rendered_url`, the `JSON.parse` +
throw, the `missing_in_working_hours` key-delete, and the returned key set
(`_stand_in` / `_case_fixture` / `_rendered_url` / `_rendered_body` / `_rendered_body_raw` merged
over the fixture) are byte-identical.

```
-    "contact_phone_number": "${ $('When Executed by Another Workflow').first().json.contact_phone_number }",
-    "agent_code": "${ $('When Executed by Another Workflow').first().json.agent }",
-    "team_set_code": "${ $('When Executed by Another Workflow').first().json.team }",
+    "contact_phone_number": ${ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') },
+    "agent_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') },
+    "team_set_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') },
```

**Equivalence gate (machine-checked, on both re-fetched published workflows).** Take the fork's
published `jsonBody`, drop the leading `=`, rewrite every `{{ x }}` to `${ x }` — the result is
**string-equal** to the stand-in's `_rendered_body_raw` template literal. So "the stand-in renders
the fork's body" is now a check, not a claim, and it will go red the next time either side drifts.

**Re-verified after the PUT:**

- `node --check` on the **published** body (extracted from the re-GET, not from my working copy):
  **OK**; published `jsCode` is **byte-identical** to
  `throwaway-standins/conversation-sla-tracking-create.js` — same 5792 bytes, same
  `sha256 e082c29ea5c2145b…`, trailing newline included — so the committed file *is* the deployed
  bytes (LESSONS §69/§71). (The fenced listing in §3 above, like the other four, omits only that
  final newline; the file and `published-jscode.json` are the authority.)
- **S8 sweep re-run** on a fresh re-GET over the whole JSON incl. `activeVersion`: raw-substring
  occurrences `@respond-io/n8n-nodes-respond-io.respondio` **0**, `n8n-nodes-base.httpRequest` **0**,
  `@n8n/n8n-nodes-langchain.memoryPostgresChat` **0**; zero nodes of any banned type in `nodes` and
  in `activeVersion.nodes`. Type inventory unchanged: 6 code · 4 if · 3 executeWorkflow ·
  2 redis · 1 executeWorkflowTrigger. (The new comment text was written to keep a naive
  `grep -F '<banned type>'` clean, per §10's first deviation.)
- `sorento-respond-assignee-queue`: **0** occurrences.
- No trailing whitespace on any line of any string parameter in the PUT body.
- Live `rrYXzE61gCNUck_zmXe-G` after both PUTs: `5018a189-…`, `updatedAt 2026-07-22T01:27:32.239Z`
  — **not touched**.

**`published-jscode.json` refreshed** from the re-fetched published workflow (same 5 keys, same
order). Only the create body's bytes changed:

| stand-in | sha256[:16] | chars |
|---|---|---|
| `Assign or unassign a Conversation1` | `96219975779fda31` | 897 |
| `Call 'sub-add-comment-respond'` | `abee6ea9837fcb66` | 2086 |
| `conversation-sla-tracking-create` | **`e082c29ea5c2145b`** | **5792** |
| `get-round-robin-assignee` | `26bc7297d294a6a2` | 1391 |
| `get-working-days` | `266a45376a4c9538` | 800 |

**`probe.js` updated — and the update was proven able to fail.** The old fail-on-purpose case 5
drove an unrenderable body through `contact_phone_number: 'a"b'`; after the hardening that value is
safe, so the case would have become a green that cannot fail (LESSONS §61 — the exact class this
slice exists to avoid). It is retargeted at `assigned_to_id` (still raw-interpolated, deliberately),
which keeps a live "malformed body throws" instrument. Seven positive hardening assertions were
added. Both new blocks catch a throw and report a labelled FAIL rather than crashing the probe.

Fail-on-purpose proof: the same probe, run against a **reconstructed pre-hardening** body
(the published body with only those 3 lines reverted, `sha256[:16] fca0a1f8d9b60fa9`), reports
**8 FAILs** — including `null contact_phone_number renders as ""  "null"`, i.e. it catches the
old form emitting the literal string `"null"`. Against the published hardened body: **154/154 PASS,
0 FAIL**.

**Not changed, deliberately:** `assigned_to_id` is still raw-interpolated between quote chars in
both the fork and this stand-in — the plan scoped the hardening to the three trigger-sourced keys,
and byte-for-byte parity with the fork is the whole point of the stand-in. Flagged in
`node-diff.md` §3a as a known remaining edge.

**Handover impact: none.** §9's instructions are unchanged — same `_case_*` trigger keys, same
allowed fixtures, same discriminator (`Assign or unassign a Conversation1` absent from runData on
cases b/d), same "pin the trigger, don't call it from a parent". A tester who already pinned an
envelope needs no change.

---

## 12. Fail-loud re-key of `if-in-working-hours` (2026-08-12, third PUT — `040b8fed-…` → `2d1c03b3-…`)

Origin: the tester's V2 **case (f) FAIL**
(`tests/runs/intervention-tickets-s32-pinmatrix.md`) — with the bare `leftValue`, an absent
`in_working_hours` routed FALSE silently instead of erroring. The fix is a business-logic change to
the promotable If, so it lands on the fork; it is mirrored here **first** so the mechanism could be
proven before the fork was written to, and so §6's byte-equality on this node survives.

**Scope of this PUT — exactly one node's `leftValue`:**

| | before | after |
|---|---|---|
| throwaway versionId | `040b8fed-912e-4a53-9da9-3ef953136fe7` | **`2d1c03b3-fa63-44c9-8ff3-9c045e62200e`** (`== activeVersionId`) |
| `if-in-working-hours` param sha | `84997fcc6296` | **`722d7448d591`** — same value on the fork |
| other 15 nodes' param shas | — | **all unchanged** (delta table re-run: exactly one node CHANGED) |
| `connections` | — | deep-equal to before; `activeVersion.nodes == nodes` |
| credentialed nodes | 2 (both redis) | **2, unchanged** — `test-guard-record`, `chat-escalation-push` |
| the 5 stand-in bodies | — | **untouched**, all 5 `jsCode` shas as in §7/§11 |

```
-  "leftValue": "={{ $('conversation-sla-tracking-create').first().json.in_working_hours }}"
+  "leftValue": "={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}"
```

**Mechanism verification — 3 executions on THIS throwaway, `is_test:false`, trigger pinned exactly
as §9 prescribes.** These are *mechanism verification for the coder seat*, not the official matrix:

| run | `_case_fixture` | execution | outcome |
|---|---|---|---|
| (f)-shaped | `missing_in_working_hours` | **12211350** | `status: "error"`, `lastNodeExecuted: "if-in-working-hours"` — `NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]`. `get-working-days` / `…routed-to-pic1` absent from runData |
| (a)-shaped | `fresh_insert_in_hours` | **12211487** | TRUE branch unchanged → `return-assignee` (`agent_assignee: "1096809"`) → `…routed-to-pic` |
| (c)-shaped | `fresh_insert_out_of_hours` | **12211589** | FALSE branch unchanged → `get-working-days` → `…routed-to-pic1`, `Tuesday - Friday` / `08:00 - 23:59` copy |

The (f) run is also the instrument's own red proof: the same throwaway, same fixture, produced a
green `success` before this PUT (execution `12210538`) and an error at the named node after it.

Egress: BLOBTEST (`69RhomhiCH4bpY1w`) sub-executions only — **1** for the (f) run (just the
`…routed-to-pic2` ack; the run dies before the reply leg) and **2** each for (a)/(c). No other node
type capable of egress exists in this graph.

**Re-verified after the PUT** (fresh re-GET): `versionId == activeVersionId`,
`activeVersion.nodes == nodes`, `connections` deep-equal, node count 16, published `leftValue`
byte-equal to the intended string and byte-equal to the fork's; S8 sweep over the whole JSON incl.
`activeVersion` → `respondio` **0** / `httpRequest` **0** / `memoryPostgresChat` **0**, type
inventory unchanged (6 code · 4 if · 3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger);
`sorento-respond-assignee-queue` **0**; no trailing whitespace in the PUT body; live
`rrYXzE61gCNUck_zmXe-G` still `5018a189-…`, `updatedAt 2026-07-22T01:27:32.239Z` — **not touched**.

**Handover impact for the tester:** case (f)'s expectation is now the one the plan always intended —
the execution must ERROR at `if-in-working-hours`. Cases (a)–(e) are unaffected in shape, but they
must be **re-run** against `2d1c03b3-…` (the (a)/(c) shapes above are coder evidence, not matrix
results). `probe.js` is unaffected: it exercises the 5 stand-in bodies, and `if-in-working-hours` is
an n8n node it never stubbed.
