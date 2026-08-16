# S3.2 tester run — intervention-tickets-s32 pin-data matrix (V2), RE-RUN 2 — fixture refresh

Target: throwaway `mTfA5b9TgHItWo2g`
(`zz-THROWAWAY-s32-pinmatrix (DISPOSABLE — delete after S3.2 V2 sign-off)`) @ `versionId ==
activeVersionId == f7887fc2-2808-4b87-8fe1-9f11a40d304b`. Run date: 2026-08-13 · seat: tester.

**Fixtures tested here are the CRM peer's post-fix replay, dated 2026-08-13** — the peer found and
fixed a timestamp defect (the integration route was storing aware→naive-Malaysia datetimes into
naive-UTC columns, an 8h skew) and re-replayed our exact request body against the fixed branch.
The coordinator embedded the new verbatim values directly into this throwaway's
`conversation-sla-tracking-create` stand-in (confirmed below, §0) — `create-response-fixtures.json`
itself is **not** the source of truth for this run; it is out of date and carries its own
`_STALE_WARNING` (values captured pre-fix). Shape is unchanged (same 9 keys per fixture, same 3
fixture names + the `missing_in_working_hours` synthetic 4th case) — only the datetime/tracking_id
values moved. This run **supersedes** the 2026-08-12 matrix directly below the divider: same six
cases, same mechanism, only the rendered-timestamp assertions differ (everything else —
routing/node-presence/absence, egress accounting — is unchanged and re-verified fresh, not
carried over).

**No `execute_workflow`/`test_workflow` call was made against the fork `vUfFUDjLAuMaeQE6` or the
live sub `rrYXzE61gCNUck_zmXe-G` in this session.** Only `mTfA5b9TgHItWo2g` was driven. All six
executions in this run are fresh (`12265871`, `12265978`, `12266078`, `12266195`, `12266296`,
`12266396`) — none reused from the 2026-08-12 run or any other prior session.

## Headline result

**All six cases (a)–(f) PASS.** The routing/branch/node-presence shape is byte-for-byte identical
to the 2026-08-12 run (same fixture keys, same branches, same absent/present nodes) — what changed
is the *rendered* comment timestamps, which now reflect the peer's fixed datetime handling. Cases
(a)/(b)/(e) render the MYT conversion of `2026-08-13T01:25:12.693268` UTC → **`2026-08-13
09:25:12`** (routed line) and `02:25:12` UTC → **`10:25:12`** (both due lines). Cases (c)/(d) render
the OUT-OF-HOURS due timestamp `2026-08-14T01:00:00` UTC → **`2026-08-14 09:00:00`** — a clean
working-window boundary landing on a **different calendar day** than `initiated_at`
(`2026-08-13T01:25:25.919155` → `2026-08-13 09:25:25` routed), and the comment renders that
day-rollover sanely (no date truncation, no wraparound artifact). Case (f) is unchanged in kind:
the execution **errors** at `if-in-working-hours` with the coalesced sentinel `'MISSING_IN_WORKING_HOURS'`
rejected by strict boolean validation; create + comment ran (comment renders the same
`09:25:12`/`10:25:12` strings as (a)/(b)/(e), since it shares the `fresh_insert_in_hours`-derived
timestamps with the key deleted only from the *create* response, not from what the comment reads —
confirmed below); `get-working-days` and both reply legs (`…routed-to-pic`, `…routed-to-pic1`) are
absent from runData.

Cross-case, unchanged from the 2026-08-12 run: zero `sorento-respond-assignee-queue` anywhere
(static — node/string absent from the graph — and dynamic, confirmed absent from every case's
runData); `chat-escalation-push` and `test-guard-record` absent in every case (both branches
structurally unreachable once `chat?`/`test-guard` are confirmed FALSE, which every case's runData
shows). Only egress observed: the BLOBTEST (`69RhomhiCH4bpY1w`, `zz-sub-sendmsg-BLOBTEST`) RPUSH to
the unconsumed sink `sorento-respond-message-TEST`, via the 3 `executeWorkflow` sendmsg callers —
the harness's own sanctioned sink, S8-clean.

---

## 0. Pre-flight verification (mandatory before ANY run — performed by me, this session)

Fresh `get_workflow_details(mTfA5b9TgHItWo2g)`, then computed independently (Python,
`sha256(json.dumps(node.parameters, sort_keys=True, ensure_ascii=False))[:12]`):

| check | expected (per task brief) | actual | result |
|---|---|---|---|
| `versionId` | `f7887fc2-2808-4b87-8fe1-9f11a40d304b` | `f7887fc2-2808-4b87-8fe1-9f11a40d304b` | MATCH |
| `activeVersionId` | same | same | MATCH — published |
| `active` | `true` | `True` | MATCH |
| S8 sweep — `@respond-io/n8n-nodes-respond-io.respondio` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `n8n-nodes-base.httpRequest` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `@n8n/n8n-nodes-langchain.memoryPostgresChat` raw-substring count | 0 | 0 | MATCH |
| node-type inventory (by TYPE, not substring) | 6 code · 4 if · 3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger | `Counter` over 16 nodes: `n8n-nodes-base.executeWorkflowTrigger`×1, `n8n-nodes-base.code`×6, `n8n-nodes-base.if`×4, `n8n-nodes-base.executeWorkflow`×3, `n8n-nodes-base.redis`×2 | MATCH |
| `if-in-working-hours` param sha256[:12] | `722d7448d591` | `722d7448d591` | MATCH |
| `conversation-sla-tracking-create` (create stand-in) param sha256[:12] | `20c67a6b2079` | `20c67a6b2079` | MATCH — sha CHANGED from the 2026-08-12 run's `18191030897e` because the embedded fixture VALUES changed, exactly as expected; no key added/removed |
| credentialed-node count | 2, both redis | MCP redacts `credentials` entirely (documented landmine — see `docs/LESSONS.md`), so this is asserted via the type-proxy per UAC §0 S8's own rationale: the only 2 nodes capable of carrying a live credential are the 2 `n8n-nodes-base.redis` nodes (`test-guard-record`, `chat-escalation-push`); zero nodes of any other credentialed-capable type exist | MATCH (by type-proxy, credentials themselves unobservable via MCP) |
| node count | 16 | 16 | MATCH |

**Additional check per task**: read the create stand-in's embedded `jsCode` directly (not just its
hash) and confirmed the `FIXTURES` object matches the task's stated new values verbatim:
`fresh_insert_in_hours`/`retry_already_active` → `tracking_id
"04473f95-0f4a-4956-83fd-7ebda2a1fb7d"`, `initiated_at "2026-08-13T01:25:12.693268"`, `due_at`/
`due_at_resolution "2026-08-13T02:25:12.693268"`; `fresh_insert_out_of_hours` → `tracking_id
"6907d9f0-b445-4beb-8254-bed12d4944e4"`, `initiated_at "2026-08-13T01:25:25.919155"`, `due_at`/
`due_at_resolution "2026-08-14T01:00:00"`. **This is the authoritative source used for the
assertions below — not `create-response-fixtures.json`, which remains stale.**

Also confirmed (raw substring sweep over the full re-fetched workflow JSON, not per-node): the
three banned type strings occur **zero** times anywhere in the JSON. Separately noted, per the
task's own warning, that the literal string `respondio:assign+crm:sla+respondio:comment` DOES
appear — inside `test-guard-record`'s `messageData` template, as the *value* of a `"target"` key in
a redis-push payload string, not as a node `type` field. `test-guard-record` is itself
`n8n-nodes-base.redis` (confirmed above) and — independent of the string — never executes in any
of these 6 cases (`is_test:false` keeps `test-guard`'s TRUE branch, the only edge into
`test-guard-record`, empty in every case; confirmed per-case below). Not reported as a regression.

**No mismatch — proceeded to run the matrix.**

---

## 1. Mechanism

Unchanged from the 2026-08-12 run (`throwaway-build.md` §9 handover note 1): the trigger node
`When Executed by Another Workflow` was pinned directly via `test_workflow`'s `pinData`, with
`triggerNodeName: "When Executed by Another Workflow"` passed explicitly on every call — not
called via `executeWorkflow`, which would filter the undeclared `_case_*` keys.

Base envelope (verbatim shape, only `test_run_id`/`turn_id` and the two `_case_*` fields varying
per case; `started_at` held constant at `2026-08-13T02:00:00.000Z` across all six calls —
harmless, since none of the stand-ins derive rendered timestamps from `started_at`, only from the
embedded fixture's own `initiated_at`/`due_at`/`due_at_resolution`):

```json
{
  "contact_id": 437264483, "agent": "CS", "team": "CS-TEAM",
  "contact_phone_number": "+60123456789", "current_assignee": null,
  "message_id": 9876543210, "is_test": false, "test_run_id": "s32-r2-<case>",
  "input_message": "I need help with my order SRT332-GM not delivered",
  "started_at": "2026-08-13T02:00:00.000Z", "contact": {}, "explicit_assignee_id": "",
  "turn_id": "s32-r2-<case>", "_case_already_assigned": <per case>,
  "_case_fixture": "<per case>"
}
```

Every `test_workflow` call **timed out on the client/transport side** (same transport artifact the
prior runs recorded), but every execution completed server-side — confirmed each time via
`search_executions(workflowId: mTfA5b9TgHItWo2g, limit: 3-6)` immediately after the timeout, then
`get_execution(includeData:true)` on the resulting execution id. Not repeated per case below.

`contact: {}` keeps `chat?` FALSE (no chat-console diversion) and `is_test: false` keeps
`test-guard` FALSE (no fail-closed short-circuit) — both independently confirmed in every case's
runData (`chat?` and `test-guard` each show `main[0]` empty / `main[1]` populated).

The MYT conversion is read directly from the comment stand-in's own `jsCode`:
`DateTime.fromISO(<fixture field>, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss')`
applied to `initiated_at` (routed line), `due_at` (respond line), `due_at_resolution` (resolve
line) — i.e. UTC + 8h, verbatim transplant from the fork per the node's own header comment.

---

## 2. Per-case results

### Case (a) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_in_hours"`

- execution **12265871** (started `2026-08-13T01:30:25.160Z`, `status: success`)
- nodes executed (in order): `When Executed by Another Workflow` → `chat?` (FALSE) →
  `test-guard` (FALSE) → `sorento-sub-respond-sendmsg-respond-routed-to-pic2` (sub-exec
  `12265872` → `69RhomhiCH4bpY1w`) → `get-round-robin-assignee` → `if-conversation-unassigned`
  (TRUE) → `Assign or unassign a Conversation1` → `conversation-sla-tracking-create` →
  `Call 'sub-add-comment-respond'` → `if-in-working-hours` (TRUE) → `return-assignee` →
  `sorento-sub-respond-sendmsg-respond-routed-to-pic` (sub-exec `12265874` → `69RhomhiCH4bpY1w`)

| assertion | expected | actual | result |
|---|---|---|---|
| Assign stand-in executed | yes | present, `_stand_in:"assign"`, `would_assign_contact:437264483`, `would_assign_user:123456` | PASS |
| `_rendered_body` (7 keys, exact) | byte-identical to prior run (fixture change doesn't touch the request body) | `{assigned_to_id:"USR-0042", contact_phone_number:"+60123456789", agent_code:"CS", team_set_code:"CS-TEAM", message_id:9876543210 (number), source_message_id:"9876543210" (string), source_message_text:"I need help with my order SRT332-GM not delivered"}` | PASS |
| create response `tracking_id`/`initiated_at`/`due_at` (new fixture) | `04473f95-0f4a-4956-83fd-7ebda2a1fb7d` / `2026-08-13T01:25:12.693268` / `2026-08-13T02:25:12.693268` | exact match, all three | PASS |
| **`_rendered_comment` — the changed assertion, quoted in full** | routed **2026-08-13 09:25:12**, respond/resolve **2026-08-13 10:25:12** | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:12.\nYou have until 2026-08-13 10:25:12 to respond.\nYou have until 2026-08-13 10:25:12 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` | **PASS** |
| `if-in-working-hours` | TRUE | `main[0]`=1 item, `main[1]`=`[]` | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |
| routed-to-pic leg executed | yes | `sorento-sub-respond-sendmsg-respond-routed-to-pic` present, sub-exec `12265874`→`69RhomhiCH4bpY1w` | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (a): PASS.**

### Case (b) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_in_hours"`

- execution **12265978** (started `01:31:35.647Z`, `status: success`)
- nodes executed: same chain as (a) **except** `if-conversation-unassigned` FALSE (`main[1]`=1
  item, `main[0]`=`[]`) → `conversation-sla-tracking-create` directly
  (`source[0].previousNodeOutput === 1`). Sub-execs: `12265979` (ack), `12265981` (`…pic`).

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT from runData — **the key assertion** | yes | key not present anywhere in the full `resultData.runData` object | **PASS** |
| `if-conversation-unassigned` FALSE → direct edge to create | yes | confirmed via `previousNodeOutput:1` on create's `source` | PASS |
| create response same new-fixture values as (a) | yes | byte-identical (only `test_run_id`/`turn_id` differ upstream) | PASS |
| **`_rendered_comment` — quoted in full** | same MYT strings as (a) | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:12.\nYou have until 2026-08-13 10:25:12 to respond.\nYou have until 2026-08-13 10:25:12 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` | **PASS** |
| `if-in-working-hours` TRUE → `return-assignee` (`"1096809"`) → `…pic` | yes | confirmed | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (b): PASS — the lost-enquiry fix confirmed by execution SHAPE (node absence), not reply
text.**

### Case (c) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution **12266078** (started `01:32:41.280Z`, `status: success`)
- nodes executed: `…pic2` (sub-exec `12266079`) → `get-round-robin-assignee` →
  `if-conversation-unassigned` (TRUE) → `Assign or unassign a Conversation1` → `create` →
  `comment` → `if-in-working-hours` (FALSE) → `get-working-days` → `…pic1` (sub-exec `12266081`)

| assertion | expected | actual | result |
|---|---|---|---|
| create response `tracking_id`/`initiated_at`/`due_at` (new fixture) | `6907d9f0-b445-4beb-8254-bed12d4944e4` / `2026-08-13T01:25:25.919155` / `2026-08-14T01:00:00` | exact match, all three | PASS |
| `if-in-working-hours` | FALSE | `main[0]`=`[]`, `main[1]`=1 item | PASS |
| **`_rendered_comment` — the changed assertion, quoted in full** | routed **2026-08-13 09:25:25**, respond/resolve **2026-08-14 09:00:00** (due date rolls to the NEXT calendar day vs `initiated_at`) | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:25.\nYou have until 2026-08-14 09:00:00 to respond.\nYou have until 2026-08-14 09:00:00 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` — day rollover renders sanely, no truncation/wraparound artifact | **PASS** |
| `get-working-days` executed | yes | `{working_day_ranges:[{start_weekday:"Tuesday",end_weekday:"Friday"}], working_hours_start:"08:00", working_hours_end:"23:59"}` | PASS |
| out-of-hours copy on `…pic1` | contains `"Tuesday - Friday"` / `"08:00 - 23:59"` | `"...Our operating hours (except public holidays):\nTuesday - Friday\n08:00 - 23:59"` | PASS |
| `return-assignee` ABSENT | yes | absent | PASS |
| create fires on Assign path (unassigned) | yes | `Assign or unassign a Conversation1` present, TRUE branch | PASS |

**Case (c): PASS.**

### Case (d) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution **12266195** (started `01:33:52.963Z`, `status: success`)
- nodes executed: `…pic2` (sub-exec `12266196`) → `get-round-robin-assignee` →
  `if-conversation-unassigned` (FALSE, direct to create) → `create` → `comment` →
  `if-in-working-hours` (FALSE) → `get-working-days` → `…pic1` (sub-exec `12266199`)

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT | yes | not present in runData (verified against the full key set) | PASS |
| create response same new out-of-hours fixture as (c) | yes | byte-identical | PASS |
| **`_rendered_comment` — quoted in full** | same as (c)'s day-rollover strings | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:25.\nYou have until 2026-08-14 09:00:00 to respond.\nYou have until 2026-08-14 09:00:00 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` | **PASS** |
| out-of-hours FALSE path as (c) | yes | `if-in-working-hours` `main[1]`=1 item, `get-working-days` executed, identical copy | PASS |
| `return-assignee` ABSENT | yes | absent | PASS |
| `chat?`/`test-guard` both FALSE | yes | `chat?` `main[1]`=1 item, `test-guard` `main[1]`=1 item | PASS |

**Case (d): PASS — combines the lost-enquiry fix and the out-of-hours split correctly.**

### Case (e) — `_case_already_assigned:false`, `_case_fixture:"retry_already_active"`

- execution **12266296** (started `01:34:58.519Z`, `status: success`)
- nodes executed: identical key-set to case (a) (`…pic2`(`12266297`)→`get-round-robin-assignee`→
  `if-conversation-unassigned`(TRUE)→`Assign…`→`create`→`comment`→`if-in-working-hours`(TRUE)→
  `return-assignee`→`…pic`(`12266299`))

| assertion | expected | actual | result |
|---|---|---|---|
| downstream shape identical to (a) | yes | same node key set, same edges, `executionStatus:"success"` on every node | PASS |
| create response carries retry fields + new fixture timestamps | `already_active:true, is_update:true, tracking_id:"04473f95-…", initiated_at:"2026-08-13T01:25:12.693268", due_at/due_at_resolution:"2026-08-13T02:25:12.693268"` | present unchanged through `comment`/`if-in-working-hours` | PASS |
| **`_rendered_comment` — quoted in full** | same MYT strings as (a) (retry shares the same underlying timestamps) | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:12.\nYou have until 2026-08-13 10:25:12 to respond.\nYou have until 2026-08-13 10:25:12 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` | **PASS** |
| nothing branches on `already_active`/`is_update` | yes | `if-in-working-hours` keys only on `in_working_hours` (`true` in this fixture) → TRUE, same as (a) | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |

**Case (e): PASS — the retry path produces no duplicate/divergent downstream behavior.**

### Case (f) — NEGATIVE, `_case_fixture:"missing_in_working_hours"` — fail-loud, unchanged expectation

- execution **12266396** (started `01:36:03.801Z`, **top-level `status: "error"`**)

| assertion (per task brief) | expected | actual | result |
|---|---|---|---|
| execution ERRORS | yes | `status: "error"` | PASS |
| `lastNodeExecuted` | `"if-in-working-hours"` | `"if-in-working-hours"` | PASS |
| that node's `executionStatus` | `"error"` | `"error"` | PASS |
| error message names the sentinel | contains `MISSING_IN_WORKING_HOURS` | `NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]` | PASS |
| `create` (`conversation-sla-tracking-create`) DID run | yes | present, `executionStatus:"success"`, response object has `in_working_hours` key **absent** (confirmed: key not present in the JSON, not `null`); other fields carry the new `fresh_insert_in_hours`-derived values (`tracking_id:"04473f95-…"`, `initiated_at:"2026-08-13T01:25:12.693268"`, `due_at/due_at_resolution:"2026-08-13T02:25:12.693268"`) with `in_working_hours` deleted, exactly as the stand-in's own code does (`delete response.in_working_hours`) | PASS |
| `comment` (`Call 'sub-add-comment-respond'`) DID run | yes | present, `_rendered_comment` rendered normally: `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-13 09:25:12.\nYou have until 2026-08-13 10:25:12 to respond.\nYou have until 2026-08-13 10:25:12 to resolve.\nReference message: https://app.respond.io/space/364817/inbox/437264483#9876543210"` — same as case (a)/(b)/(e), since the comment template reads `initiated_at`/`due_at`/`due_at_resolution` (all present), only `in_working_hours` is deleted | PASS |
| `get-working-days` ABSENT from runData | yes (no wrong out-of-hours copy produced) | absent from the full runData key set | PASS |
| `…routed-to-pic` (TRUE leg) ABSENT | yes | absent | PASS |
| `…routed-to-pic1` (FALSE leg) ABSENT | yes | absent | PASS |
| `Assign or unassign a Conversation1` DID run (unassigned path, same as (a)) | yes | present, `_stand_in:"assign"` | PASS (incidental — case (f) uses `_case_already_assigned:false`) |
| `…routed-to-pic2` (ack) DID run before the failure | yes | present, sub-exec `12266397`→`69RhomhiCH4bpY1w` | PASS |

**Case (f): PASS.** Identical fail-loud behavior to the 2026-08-12 run — the contact got the
"directing your enquiry" ack, was assigned (unassigned path), the SLA tracking row was created and
the SLA-alert comment posted (rendered with the same in-hours timestamps as (a)/(b)/(e), since the
comment path never reads the deleted key) — but the moment `if-in-working-hours` reads the
coalesced sentinel, the execution **stops with a visible error** instead of silently defaulting to
(and sending) the out-of-hours copy. Full raw error block, for the record:

```
NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]
node: if-in-working-hours (id 4a9c1e77-2b30-4c58-8f6d-91ae5d0b3c62)
leftValue: ={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}
conditions.options.typeValidation: "strict"
```

---

## 3. Cross-case static/dynamic assertions

| assertion | method | result |
|---|---|---|
| Zero RPUSH to `sorento-respond-assignee-queue` in any case | dynamic: no occurrence of the literal string in any of the 6 full runData JSON payloads. static: the pre-flight fetch's node-type inventory has **zero** `n8n-nodes-base.redis` nodes named `Redis`, only the two harness-named redis nodes (`test-guard-record`, `chat-escalation-push`) — the queue-push node does not exist in this 16-node graph | PASS (both) |
| `chat-escalation-push` absent in every case | dynamic: absent from all 6 runData sets; structurally guaranteed since `chat?` output `main[0]` (its only inbound edge) was confirmed empty (`[]`) in every case | PASS |
| `test-guard-record` absent in every case | dynamic: absent from all 6 runData sets; structurally guaranteed since `test-guard` output `main[0]` (its only inbound edge) was confirmed empty (`[]`) in every case | PASS |

---

## 4. Egress accounting (§0)

Per the task, the only sanctioned egress for any case is BLOBTEST's (`69RhomhiCH4bpY1w`,
`zz-sub-sendmsg-BLOBTEST`) RPUSH to the unconsumed sink `sorento-respond-message-TEST`.

| case | `…pic2` sub-exec (ack) | `…pic`/`…pic1` sub-exec (final reply) | count |
|---|---|---|---|
| (a) | `12265872` | `12265874` (`…pic`) | 2 |
| (b) | `12265979` | `12265981` (`…pic`) | 2 |
| (c) | `12266079` | `12266081` (`…pic1`) | 2 |
| (d) | `12266196` | `12266199` (`…pic1`) | 2 |
| (e) | `12266297` | `12266299` (`…pic`) | 2 |
| (f) | `12266397` | **(none — execution errors before the reply leg)** | 1 |
| **total** | | | **11** |

Every one of these 11 sub-executions targets `workflowId: 69RhomhiCH4bpY1w` (BLOBTEST), which per
`throwaway-build.md` §4/§5 contains zero credentialed send nodes and is S8-clean — this is the
harness's own sanctioned sink, not a violation.

**Redis LLEN/LRANGE sink-delta (S7a/S7b) — NOT independently verified; gap reconfirmed, not
worked around.** Same tooling gap the 2026-08-12 run recorded: `.env` carries only
`REDIS_TEST_MSG_LIST=main-message-list-test` and `REDIS_EGRESS_KEY_PREFIX=test:egress:` (list
name/prefix constants), no redis host/port/password. The remote redis is reachable only via the
in-workflow `sorento-redis` credential. No parameterized redis-read helper was available to this
session (`zz-canary-read` has a hardcoded stale key on a non-expression field; editing it is out of
the tester's remit) and none was invented. This run's egress evidence is therefore the **BLOBTEST
sub-execution runData** above (payload content: the ack/reply text delivered to the "would-be"
contact, `turn_id` matching each case's `test_run_id`) rather than an independent `LLEN`/`LRANGE`
read of `sorento-respond-message-TEST` or the prod sink `sorento-respond-message`. Same gap as both
prior tester sessions on this slice — still open, flagged again for the record, not routed around.

**No egress of any other kind occurred in any case:** the pre-flight S8 sweep (§0 above) confirms
zero nodes of type `respondio`, `httpRequest`, or `memoryPostgresChat` exist anywhere in this
workflow, so no credentialed write of any kind — assignment, SLA POST, respond.io comment, prod
CRM write — was structurally possible in this run, independent of the sink-delta gap above.

**Fork/live-untouched confirmation.** No `get_workflow_details`, `execute_workflow`, or
`test_workflow` call was made against `vUfFUDjLAuMaeQE6` or `rrYXzE61gCNUck_zmXe-G` at any point
in this session — every MCP call in this run targeted `mTfA5b9TgHItWo2g` only.

---

## Summary table

| case | envelope | terminal node(s) | key assertion | result |
|---|---|---|---|---|
| pre-flight | — | — | versionId==activeVersionId==`f7887fc2-…`, S8 sweep clean, `if-in-working-hours` sha `722d7448d591`, create-stand-in sha `20c67a6b2079`, embedded fixture VALUES match the task's new figures verbatim | **PASS** |
| (a) | unassigned, in-hours | `…pic` (exec 12265871) | `_rendered_comment` = `"...routed to you at 2026-08-13 09:25:12...until 2026-08-13 10:25:12 to respond...to resolve..."`, `if-in-working-hours` TRUE, `return-assignee` | **PASS** |
| (b) | **assigned**, in-hours | `…pic` (exec 12265978) | `Assign or unassign a Conversation1` ABSENT (lost-enquiry fix); same rendered comment as (a) | **PASS** |
| (c) | unassigned, out-of-hours | `…pic1` (exec 12266078) | `_rendered_comment` = `"...routed to you at 2026-08-13 09:25:25...until 2026-08-14 09:00:00..."` (day rollover), `if-in-working-hours` FALSE, `get-working-days`, out-of-hours copy | **PASS** |
| (d) | **assigned**, out-of-hours | `…pic1` (exec 12266195) | Assign ABSENT + FALSE path; same rendered comment as (c) | **PASS** |
| (e) | unassigned, retry (`already_active:true`) | `…pic` (exec 12266296) | shape identical to (a), same rendered comment, no branching on retry fields | **PASS** |
| (f) | unassigned, `in_working_hours` **absent** (negative, fail-loud) | `if-in-working-hours` **errors** (exec 12266396) | execution ERRORS at `if-in-working-hours`; create+comment ran (comment renders (a)'s timestamps); `get-working-days`+both reply legs ABSENT | **PASS** (inverted expectation met) |
| cross-case | (a)-(f) | — | zero `sorento-respond-assignee-queue` (static+dynamic); `chat-escalation-push`/`test-guard-record` absent every case | **PASS** |
| egress | (a)-(f) | — | 11 BLOBTEST sub-execs (2×5 + 1), zero banned-type nodes anywhere; LLEN/LRANGE gate NOT independently verified (tooling gap, unchanged across all 3 tester sessions on this slice) | **PASS (structural)** / gap noted |

**Overall: 6/6 cases PASS.** Target confirmed `mTfA5b9TgHItWo2g` @
`versionId == activeVersionId == f7887fc2-2808-4b87-8fe1-9f11a40d304b` throughout this run.
**Neither the fork `vUfFUDjLAuMaeQE6` nor the live sub `rrYXzE61gCNUck_zmXe-G` was run, edited,
queried, or otherwise touched in this session.**

## Verdict for the reviewer

**ALL PASS — 6/6 V2 functional matrix cases (a)–(f), re-verified fresh against the CRM peer's
post-fix (2026-08-13) create-response fixtures.** The routing/node-presence shape is unchanged from
the 2026-08-12 matrix; only the rendered-comment timestamp assertions changed, and both changed
assertions are now evidenced against the corrected data: (a)/(b)/(e) render `2026-08-13 09:25:12`
routed / `10:25:12` respond+resolve; (c)/(d) render `2026-08-13 09:25:25` routed / `2026-08-14
09:00:00` respond+resolve (a same-run day rollover, rendered sanely — no truncation or wraparound).
Case (f)'s fail-loud behavior is unchanged and still PASSes with the inverted (error-expected)
assertion. §0 safety gate holds structurally for every case (S1/S2/S3/S4/S5/S8 all verified from
runData/JSON; S7a/S7b remain an open tooling gap across all three tester sessions on this slice, not
a failure — no redis-read credential exists in this environment). No egress beyond the sanctioned
BLOBTEST sink. Fork and live were not touched. **The prior matrix's timestamp assertions
(`2026-08-12 21:58:54`/`22:58:54` etc., derived from the pre-fix fixtures) are superseded by this
run and should not be cited as evidence going forward** — they are preserved below only for
provenance.

Open item carried forward (not a gate failure, a recommendation, now flagged a third time):
provision a parameterized redis-read helper (key name as an expression input) so a future tester
can close the S7a/S7b sink-delta gap without editing test scaffolding mid-run.

Housekeeping reminder: `mTfA5b9TgHItWo2g` remains DISPOSABLE per `throwaway-build.md` §9 note 5 —
delete after S3.2 V2 sign-off.

---
---

# HISTORY — SUPERSEDED (kept for provenance, unmodified below this line)

Everything below this divider is the **complete, unmodified content of this file as it stood
before this fixture-refresh re-run** (i.e. the entire file produced by the 2026-08-12 tester
session, which itself already contained two further layers of superseded history — the
2026-08-12 V2 matrix with case (f) FAIL, and the even earlier S8-halt run against the fork
directly). Nothing below this line has been edited. The matrix at the top of this file (dated
2026-08-13, fixtures = peer's post-fix replay) is now the current, authoritative result.

# S3.2 tester run — intervention-tickets-s32 pin-data matrix (V2), RE-RUN

Target: throwaway `mTfA5b9TgHItWo2g`
(`zz-THROWAWAY-s32-pinmatrix (DISPOSABLE — delete after S3.2 V2 sign-off)`) @ `versionId ==
activeVersionId == 2d1c03b3-fa63-44c9-8ff3-9c045e62200e`. Run date: 2026-08-12 · seat: tester.

**This is the successor run to the matrix below it in this file.** That prior run tested the
*same* throwaway at an *earlier* versionId (`040b8fed-…`) and, in its case (f), found that
`if-in-working-hours`'s bare `leftValue` did **not** error on an absent `in_working_hours` — a
real finding. The coder then applied a fail-loud fix (`?? 'MISSING_IN_WORKING_HOURS'`) to both
the fork and this throwaway (`node-diff.md` §4a, `throwaway-build.md` §12), moving the throwaway
to `2d1c03b3-…`. This run re-executes the full six-case matrix **fresh, from scratch, against
that new versionId** — no result is reused from the earlier run or from the coder's own
mechanism-verification executions (`12211350`/`12211487`/`12211589`, which remain coder evidence
only, never matrix results). Case (f)'s expectation is now **inverted**: it must ERROR, and it
does.

**No `execute_workflow`/`test_workflow` call was made against the fork `vUfFUDjLAuMaeQE6` or the
live sub `rrYXzE61gCNUck_zmXe-G` in this session.** Only `mTfA5b9TgHItWo2g` was driven.

## Headline result

**All six cases (a)–(f) PASS.** Cases (a)–(e) reproduce the shapes the earlier run already
established (create/comment rendering, the lost-enquiry fix via node-absence, the working-hours
split, retry no-op). Case (f) now behaves exactly as the plan always intended: the execution
**errors** at `if-in-working-hours` with the coalesced sentinel rejected by strict boolean
validation, the create and comment stand-ins ran (so the contact was already acked, assigned if
applicable, and an SLA-alert comment posted before the failure), and — the point of the
fail-loud fix — **no out-of-hours copy was silently sent**: `get-working-days` and both reply
legs (`…routed-to-pic`, `…routed-to-pic1`) are absent from runData.

Cross-case: zero `sorento-respond-assignee-queue` anywhere (static — the node/string does not
exist in this graph at all — and dynamic, confirmed absent from every case's runData);
`chat-escalation-push` and `test-guard-record` absent in every case (both branches structurally
unreachable once `chat?`/`test-guard` are confirmed FALSE, which every case's runData shows).
Only egress observed: the BLOBTEST (`69RhomhiCH4bpY1w`, `zz-sub-sendmsg-BLOBTEST`) RPUSH to the
unconsumed sink `sorento-respond-message-TEST`, via the 3 `executeWorkflow` sendmsg callers — the
harness's own sanctioned sink, S8-clean.

---

## 0. Pre-flight verification (mandatory before ANY run — performed by me, this session)

Fresh `get_workflow_details(mTfA5b9TgHItWo2g)`, then computed independently (Python, `sha256(json.dumps(node.parameters, sort_keys=True, ensure_ascii=False))[:12]`):

| check | expected (per task brief) | actual | result |
|---|---|---|---|
| `versionId` | `2d1c03b3-fa63-44c9-8ff3-9c045e62200e` | `2d1c03b3-fa63-44c9-8ff3-9c045e62200e` | MATCH |
| `activeVersionId` | same | same | MATCH — published |
| `active` | `true` | `True` | MATCH |
| S8 sweep — `@respond-io/n8n-nodes-respond-io.respondio` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `n8n-nodes-base.httpRequest` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `@n8n/n8n-nodes-langchain.memoryPostgresChat` raw-substring count | 0 | 0 | MATCH |
| node-type inventory | 6 code · 4 if · 3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger | same (`Counter` over 16 nodes) | MATCH |
| `if-in-working-hours` param sha256[:12] | `722d7448d591` | `722d7448d591` | MATCH |
| `conversation-sla-tracking-create` (create stand-in) param sha256[:12] | `18191030897e` | `18191030897e` | MATCH |
| node count | 16 | 16 | MATCH |

**No mismatch — proceeded to run the matrix.** (I did not additionally re-verify the fork's
`if-in-working-hours` sha or the live sub's `versionId`, per the instruction not to run or touch
either — the task's own pre-verification 5 minutes prior already covers them, and this run made
zero calls against `vUfFUDjLAuMaeQE6` / `rrYXzE61gCNUck_zmXe-G` to re-check with.)

---

## 1. Mechanism

Per `throwaway-build.md` §9 handover note 1 (unchanged from the prior run): the trigger node
`When Executed by Another Workflow` was pinned directly via `test_workflow`'s `pinData`, with
`triggerNodeName: "When Executed by Another Workflow"` passed explicitly on every call — not
called via `executeWorkflow`, which would filter the undeclared `_case_*` keys.

Base envelope (verbatim shape, only `test_run_id`/`turn_id` and the two `_case_*` fields varying
per case; `started_at` held constant at `2026-08-12T16:00:30.000Z` across all six calls):

```json
{
  "contact_id": 437264483, "agent": "CS", "team": "CS-TEAM",
  "contact_phone_number": "+60123456789", "current_assignee": null,
  "message_id": 9876543210, "is_test": false, "test_run_id": "s32-m2-<case>",
  "input_message": "I need help with my order SRT332-GM not delivered",
  "started_at": "2026-08-12T16:00:30.000Z", "contact": {}, "explicit_assignee_id": "",
  "turn_id": "s32-m2-<case>", "_case_already_assigned": <per case>,
  "_case_fixture": "<per case>"
}
```

Every `test_workflow` call **timed out on the client/transport side** (same transport artifact
the prior run recorded), but every execution completed server-side — confirmed each time via
`search_executions(workflowId: mTfA5b9TgHItWo2g, limit: 3)` immediately after the timeout, then
`get_execution(includeData:true)` on the resulting execution id. Not repeated per case below.

`contact: {}` keeps `chat?` FALSE (no chat-console diversion) and `is_test: false` keeps
`test-guard` FALSE (no fail-closed short-circuit) — both independently confirmed in every case's
runData (`chat?` and `test-guard` each show `main[0]` empty / `main[1]` populated).

---

## 2. Per-case results

### Case (a) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_in_hours"`

- execution **12216535** (started `2026-08-12T16:00:44.037Z`, `status: success`)
- nodes executed (in order): `When Executed by Another Workflow` → `chat?` (FALSE) →
  `test-guard` (FALSE) → `sorento-sub-respond-sendmsg-respond-routed-to-pic2` (sub-exec
  `12216536` → `69RhomhiCH4bpY1w`) → `get-round-robin-assignee` → `if-conversation-unassigned`
  (TRUE) → `Assign or unassign a Conversation1` → `conversation-sla-tracking-create` →
  `Call 'sub-add-comment-respond'` → `if-in-working-hours` (TRUE) → `return-assignee` →
  `sorento-sub-respond-sendmsg-respond-routed-to-pic` (sub-exec `12216538` → `69RhomhiCH4bpY1w`)

| assertion | expected | actual | result |
|---|---|---|---|
| Assign stand-in executed | yes | present, `_stand_in:"assign"`, `would_assign_contact:437264483`, `would_assign_user:123456` | PASS |
| `_rendered_body` (7 keys, exact) | `{assigned_to_id:"USR-0042", contact_phone_number:"+60123456789", agent_code:"CS", team_set_code:"CS-TEAM", message_id:9876543210 (number), source_message_id:"9876543210" (string), source_message_text:"I need help with my order SRT332-GM not delivered"}` | byte-identical | PASS |
| `_rendered_url` | `.../conversation-sla-tracking/integration` | `https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration` | PASS |
| comment stand-in executed, `_rendered_comment` timestamps | `21:58:54` routed / `22:58:54` respond+resolve | `"Team: CS-TEAM\n⏰ SLA Alert: This contact is routed to you at 2026-08-12 21:58:54.\nYou have until 2026-08-12 22:58:54 to respond.\nYou have until 2026-08-12 22:58:54 to resolve.\n..."` | PASS |
| `if-in-working-hours` | TRUE | `main[0]`=1 item, `main[1]`=`[]` | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |
| routed-to-pic leg executed | yes | `sorento-sub-respond-sendmsg-respond-routed-to-pic` present, sub-exec `12216538`→`69RhomhiCH4bpY1w` | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (a): PASS.**

### Case (b) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_in_hours"`

- execution **12216661** (started `16:02:09.689Z`, `status: success`)
- nodes executed: same chain as (a) **except** `if-conversation-unassigned` FALSE (`main[1]`=1
  item, `main[0]`=`[]`) → `conversation-sla-tracking-create` directly
  (`source[0].previousNodeOutput === 1`).

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT from runData — **the key assertion** | yes | key not present anywhere in the full `resultData.runData` object (checked against the complete unfiltered JSON, not a single-field probe) | **PASS** |
| `if-conversation-unassigned` FALSE → direct edge to create | yes | confirmed via `previousNodeOutput:1` on create's `source` | PASS |
| create/comment `_rendered_body`/`_rendered_comment` | same as (a) (only `test_run_id`/`turn_id` differ upstream, not in the body) | byte-identical | PASS |
| `if-in-working-hours` TRUE → `return-assignee` (`"1096809"`) → `…pic` | yes | confirmed | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (b): PASS — the lost-enquiry fix confirmed by execution SHAPE (node absence), not reply
text.**

### Case (c) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution **12216789** (started `16:03:35.433Z`, `status: success`)
- nodes executed: `…pic2` (sub-exec `12216790`) → `get-round-robin-assignee` →
  `if-conversation-unassigned` (TRUE) → `Assign or unassign a Conversation1` → `create` →
  `comment` → `if-in-working-hours` (FALSE) → `get-working-days` → `…pic1` (sub-exec `12216792`)

| assertion | expected | actual | result |
|---|---|---|---|
| `if-in-working-hours` | FALSE | `main[0]`=`[]`, `main[1]`=1 item | PASS |
| `get-working-days` executed | yes | `{working_day_ranges:[{start_weekday:"Tuesday",end_weekday:"Friday"}], working_hours_start:"08:00", working_hours_end:"23:59"}` | PASS |
| out-of-hours copy on `…pic1` | contains `"Tuesday - Friday"` / `"08:00 - 23:59"` | `"...Our operating hours (except public holidays):\nTuesday - Friday\n08:00 - 23:59"` | PASS |
| `return-assignee` ABSENT | yes | absent | PASS |
| create fires on Assign path (unassigned) | yes | `Assign or unassign a Conversation1` present, TRUE branch | PASS |

**Case (c): PASS.**

### Case (d) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution **12216915** (started `16:05:00.435Z`, `status: success`)
- nodes executed: `…pic2` (sub-exec `12216916`) → `get-round-robin-assignee` →
  `if-conversation-unassigned` (FALSE, direct to create) → `create` → `comment` →
  `if-in-working-hours` (FALSE) → `get-working-days` → `…pic1` (sub-exec `12216918`)

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT | yes | explicitly requested by name in `get_execution(nodeNames:[...])` and absent from the returned set — not present | PASS |
| out-of-hours FALSE path as (c) | yes | `if-in-working-hours` `main[1]`=1 item, `get-working-days` executed, identical copy | PASS |
| `return-assignee` ABSENT | yes | absent | PASS |
| `chat?`/`test-guard` both FALSE | yes | `chat?` `main[1]`=1 item, `test-guard` `main[1]`=1 item (re-confirmed via a second targeted `get_execution` call) | PASS |

**Case (d): PASS — combines the lost-enquiry fix and the out-of-hours split correctly.**

### Case (e) — `_case_already_assigned:false`, `_case_fixture:"retry_already_active"`

- execution **12217048** (started `16:06:31.780Z`, `status: success`)
- nodes executed: identical key-set to case (a) (`…pic2`(`12217049`)→`get-round-robin-assignee`→
  `if-conversation-unassigned`(TRUE)→`Assign…`→`create`→`comment`→`if-in-working-hours`(TRUE)→
  `return-assignee`→`…pic`(`12217051`))

| assertion | expected | actual | result |
|---|---|---|---|
| downstream shape identical to (a) | yes | same node key set, same edges, `executionStatus:"success"` on every node | PASS |
| create response carries retry fields unchanged | `already_active:true, is_update:true` | present unchanged through `comment`/`if-in-working-hours` | PASS |
| nothing branches on `already_active`/`is_update` | yes | `if-in-working-hours` keys only on `in_working_hours` (`true` in this fixture) → TRUE, same as (a) | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |

**Case (e): PASS — the retry path produces no duplicate/divergent downstream behavior.**

### Case (f) — NEGATIVE, `_case_fixture:"missing_in_working_hours"` — expectation INVERTED to fail-loud

- execution **12217176** (started `16:07:58.181Z`, **top-level `status: "error"`**)

| assertion (per task brief, inverted expectation) | expected | actual | result |
|---|---|---|---|
| execution ERRORS | yes | `status: "error"` | PASS |
| `lastNodeExecuted` | `"if-in-working-hours"` | `"if-in-working-hours"` | PASS |
| that node's `executionStatus` | `"error"` | `"error"` | PASS |
| error message names the sentinel | contains `MISSING_IN_WORKING_HOURS` | `NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]` | PASS |
| `create` (`conversation-sla-tracking-create`) DID run | yes | present, `executionStatus:"success"`, response object has `in_working_hours` key **absent** (confirmed: key not present in the JSON, not `null`) | PASS |
| `comment` (`Call 'sub-add-comment-respond'`) DID run | yes | present, `_rendered_comment` rendered normally (`21:58:54`/`22:58:54`, same as case (a)'s fixture minus `in_working_hours`) | PASS |
| `get-working-days` ABSENT from runData | yes (no wrong out-of-hours copy produced) | absent from the full runData key set | PASS |
| `…routed-to-pic` (TRUE leg) ABSENT | yes | absent | PASS |
| `…routed-to-pic1` (FALSE leg) ABSENT | yes | absent | PASS |
| `Assign or unassign a Conversation1` DID run (unassigned path, same as (a)) | yes | present, `_stand_in:"assign"` | PASS (incidental — case (f) uses `_case_already_assigned:false`) |
| `…routed-to-pic2` (ack) DID run before the failure | yes | present, sub-exec `12217177`→`69RhomhiCH4bpY1w` | PASS |

**Case (f): PASS.** This is the fail-loud fix working exactly as the coder's §4a intended and as
the earlier run's own case (f) FAIL demanded: the contact got the "directing your enquiry" ack,
was assigned (unassigned path), the SLA tracking row was created and the SLA-alert comment
posted — but the moment the create response's `in_working_hours` key is absent, the execution
**stops with a visible error** at `if-in-working-hours` instead of silently defaulting to (and
sending) the out-of-hours copy. Full raw error block, for the record:

```
NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]
node: if-in-working-hours (id 4a9c1e77-2b30-4c58-8f6d-91ae5d0b3c62)
leftValue: ={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}
conditions.options.typeValidation: "strict"
```

---

## 3. Cross-case static/dynamic assertions

| assertion | method | result |
|---|---|---|
| Zero RPUSH to `sorento-respond-assignee-queue` in any case | dynamic: no occurrence of the literal string in any of the 6 full runData JSON payloads. static: the pre-flight fetch's node-type inventory has **zero** `n8n-nodes-base.redis` nodes named `Redis`, only the two harness-named redis nodes (`test-guard-record`, `chat-escalation-push`) — the queue-push node does not exist in this 16-node graph | PASS (both) |
| `chat-escalation-push` absent in every case | dynamic: absent from all 6 runData sets; structurally guaranteed since `chat?` output `main[0]` (its only inbound edge) was confirmed empty (`[]`) in every case | PASS |
| `test-guard-record` absent in every case | dynamic: absent from all 6 runData sets; structurally guaranteed since `test-guard` output `main[0]` (its only inbound edge) was confirmed empty (`[]`) in every case | PASS |

---

## 4. Egress accounting (§0)

Per the task, the only sanctioned egress for any case is BLOBTEST's (`69RhomhiCH4bpY1w`,
`zz-sub-sendmsg-BLOBTEST`) RPUSH to the unconsumed sink `sorento-respond-message-TEST`.

| case | `…pic2` sub-exec (ack) | `…pic`/`…pic1` sub-exec (final reply) | count |
|---|---|---|---|
| (a) | `12216536` | `12216538` (`…pic`) | 2 |
| (b) | `12216662` | `12216664` (`…pic`) | 2 |
| (c) | `12216790` | `12216792` (`…pic1`) | 2 |
| (d) | `12216916` | `12216918` (`…pic1`) | 2 |
| (e) | `12217049` | `12217051` (`…pic`) | 2 |
| (f) | `12217177` | **(none — execution errors before the reply leg)** | 1 |
| **total** | | | **11** |

Every one of these 11 sub-executions targets `workflowId: 69RhomhiCH4bpY1w` (BLOBTEST), which per
`throwaway-build.md` §4/§5 contains zero credentialed send nodes and is S8-clean — this is the
harness's own sanctioned sink, not a violation.

**Redis LLEN/LRANGE sink-delta (S7a/S7b) — NOT independently verified; gap reconfirmed, not
worked around.** I checked `.env` before running: it carries only
`REDIS_TEST_MSG_LIST=main-message-list-test` and `REDIS_EGRESS_KEY_PREFIX=test:egress:` (list
name/prefix constants), no redis host/port/password. The remote redis is reachable only via the
in-workflow `sorento-redis` credential. I did not find a parameterized redis-read helper among
the documented test-helper IDs (`zz-canary-read` has a hardcoded stale key on a non-expression
field per CLAUDE.md/LESSONS; editing it is out of the tester's remit) and did not invent access.
This run's egress evidence is therefore the **BLOBTEST sub-execution runData** above (payload
content: the ack/reply text delivered to the "would-be" contact, `turn_id` matching each case's
`test_run_id`) rather than an independent `LLEN`/`LRANGE` read of `sorento-respond-message-TEST`
or the prod sink `sorento-respond-message`. This is weaker than a direct redis read and is not
represented as a discharged S7a/S7b gate. **Same gap as the prior tester session on this
slice — still open, flagged again for the record, not routed around.**

**No egress of any other kind occurred in any case:** the pre-flight S8 sweep (§0 above) confirms
zero nodes of type `respondio`, `httpRequest`, or `memoryPostgresChat` exist anywhere in this
workflow, so no credentialed write of any kind — assignment, SLA POST, respond.io comment, prod
CRM write — was structurally possible in this run, independent of the sink-delta gap above.

**Fork/live-untouched confirmation.** No `get_workflow_details`, `execute_workflow`, or
`test_workflow` call was made against `vUfFUDjLAuMaeQE6` or `rrYXzE61gCNUck_zmXe-G` at any point
in this session — every MCP call in this run targeted `mTfA5b9TgHItWo2g` only.

---

## Summary table

| case | envelope | terminal node(s) | key assertion | result |
|---|---|---|---|---|
| pre-flight | — | — | versionId==activeVersionId==`2d1c03b3-…`, S8 sweep clean, `if-in-working-hours` sha `722d7448d591`, create-stand-in sha `18191030897e` | **PASS** |
| (a) | unassigned, in-hours | `…pic` (exec 12216535) | full `_rendered_body`/`_rendered_comment`, `if-in-working-hours` TRUE, `return-assignee` | **PASS** |
| (b) | **assigned**, in-hours | `…pic` (exec 12216661) | `Assign or unassign a Conversation1` ABSENT (lost-enquiry fix) | **PASS** |
| (c) | unassigned, out-of-hours | `…pic1` (exec 12216789) | `if-in-working-hours` FALSE, `get-working-days`, out-of-hours copy | **PASS** |
| (d) | **assigned**, out-of-hours | `…pic1` (exec 12216915) | Assign ABSENT + FALSE path | **PASS** |
| (e) | unassigned, retry (`already_active:true`) | `…pic` (exec 12217048) | shape identical to (a), no branching on retry fields | **PASS** |
| (f) | unassigned, `in_working_hours` **absent** (negative, fail-loud) | `if-in-working-hours` **errors** (exec 12217176) | execution ERRORS at `if-in-working-hours`; create+comment ran; `get-working-days`+both reply legs ABSENT | **PASS** (inverted expectation met) |
| cross-case | (a)-(f) | — | zero `sorento-respond-assignee-queue` (static+dynamic); `chat-escalation-push`/`test-guard-record` absent every case | **PASS** |
| egress | (a)-(f) | — | 11 BLOBTEST sub-execs (2×5 + 1), zero banned-type nodes anywhere; LLEN/LRANGE gate NOT independently verified (tooling gap, unchanged from prior session) | **PASS (structural)** / gap noted |

**Overall: 6/6 cases PASS.** Target confirmed `mTfA5b9TgHItWo2g` @
`versionId == activeVersionId == 2d1c03b3-fa63-44c9-8ff3-9c045e62200e` throughout this run.
**Neither the fork `vUfFUDjLAuMaeQE6` nor the live sub `rrYXzE61gCNUck_zmXe-G` was run, edited,
queried, or otherwise touched in this session.**

## Verdict for the reviewer

**ALL PASS — 6/6 V2 functional matrix cases (a)–(f), including the fail-loud case (f) with its
now-inverted (error-expected) assertion. §0 safety gate holds structurally for every case
(S1/S2/S3/S4/S5/S8 all verified from runData/JSON; S7a/S7b remain an open tooling gap, not a
failure — no redis-read credential exists in this environment for either tester session on this
slice). No egress beyond the sanctioned BLOBTEST sink. Fork and live were not touched.**

Open item carried forward (not a gate failure, a recommendation): provision a parameterized
redis-read helper (key name as an expression input) so a future tester can close the S7a/S7b
sink-delta gap without editing test scaffolding mid-run — same recommendation the prior tester
session recorded, still unaddressed.

Housekeeping reminder: `mTfA5b9TgHItWo2g` remains DISPOSABLE per `throwaway-build.md` §9 note 5 —
delete after S3.2 V2 sign-off.

---
---

# HISTORY — SUPERSEDED (kept for provenance, unmodified below this line)

Everything below this divider is the **complete, unmodified content** of this file as produced
by the prior tester session (dated 2026-08-12, before the coder's fail-loud fix moved the
throwaway from `040b8fed-…` to `2d1c03b3-…`). It contains two layers of its own: that session's
V2 matrix result (case (f) **FAIL** — the finding that triggered the fail-loud fix), followed by
an even earlier, already-superseded S8-halt run against the fork directly. Both are preserved
verbatim for audit trail. The matrix at the top of this file (this run, against `2d1c03b3-…`) is
now the current, authoritative V2 result.

# S3.2 tester run — intervention-tickets-s32 pin-data matrix (V2)

Target (THIS run): throwaway `mTfA5b9TgHItWo2g`
(`zz-THROWAWAY-s32-pinmatrix (DISPOSABLE — delete after S3.2 V2 sign-off)`), the S8-compliant
double of the fork `vUfFUDjLAuMaeQE6`. Run date: 2026-08-12 · seat: tester

**Fork `vUfFUDjLAuMaeQE6` and live `rrYXzE61gCNUck_zmXe-G` were NOT run in this session** — the
throwaway is the S8-sanctioned escape documented in `throwaway-build.md`, generated
programmatically from a byte-verified snapshot of the fork with exactly 5 nodes replaced by
name-preserving Code stand-ins. No `execute_workflow`/`test_workflow` call was made against
either `vUfFUDjLAuMaeQE6` or `rrYXzE61gCNUck_zmXe-G` in this run.

## Headline result

**V2 matrix (a)–(e) all PASS. Case (f) — the negative/fail-loud case — is a FAIL, and it is a
real finding, not a harness defect:** `if-in-working-hours` (typeValidation `strict`, boolean
`true` operation) does **not** throw when `in_working_hours` is absent from the upstream
object; it silently evaluates FALSE and routes to the out-of-hours leg, identically to cases
(c)/(d). The node-diff's own annotation ("a non-boolean `in_working_hours` errors rather than
silently falling to FALSE… Deliberate, fail loud") is **empirically wrong for the
key-absent/`undefined` case** — n8n's strict boolean validation does not treat "absent" as
"non-boolean" the way the plan assumed. This is flagged for the coder/reviewer below.

---

## 0. Pre-flight verification (mandatory before ANY run — all confirmed)

Re-`GET` on `mTfA5b9TgHItWo2g` immediately before running:

| check | expected | actual | result |
|---|---|---|---|
| `versionId` | `040b8fed-912e-4a53-9da9-3ef953136fe7` | `040b8fed-912e-4a53-9da9-3ef953136fe7` | MATCH |
| `activeVersionId` | same | same | MATCH — published |
| `active` | `true` | `true` | MATCH |
| S8 sweep — `@respond-io/n8n-nodes-respond-io.respondio` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `n8n-nodes-base.httpRequest` raw-substring count | 0 | 0 | MATCH |
| S8 sweep — `@n8n/n8n-nodes-langchain.memoryPostgresChat` raw-substring count | 0 | 0 | MATCH |
| node-type inventory | 6 code · 4 if · 3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger | same, 16 nodes total | MATCH |
| `conversation-sla-tracking-create` param sha256[:12] (`sort_keys, ensure_ascii=False`) | `18191030897e` | `18191030897e` | MATCH |
| `conversation-sla-tracking-create` `jsCode` sha256[:16] | `e082c29ea5c2145b` (5792 chars) | `e082c29ea5c2145b` (5792 chars) | MATCH |
| `nodes == activeVersion.nodes` | true | true (deep-equal, incl. the create stand-in) | MATCH |

**No mismatch — proceeded to run the matrix.**

---

## 1. Mechanism

Per `throwaway-build.md` §9 handover note 1: the trigger node `When Executed by Another
Workflow` was **pinned directly via `test_workflow`'s `pinData`**, not called via
`executeWorkflow` (a typed `executeWorkflowTrigger` would filter the undeclared `_case_*` keys —
confirmed by design, not tested destructively). `triggerNodeName: "When Executed by
Another Workflow"` was passed explicitly on every call.

Base envelope (verbatim from the task), with only `test_run_id`/`turn_id`/`started_at` and the
two `_case_*` fields varying per case:

```json
{
  "contact_id": 437264483, "agent": "CS", "team": "CS-TEAM",
  "contact_phone_number": "+60123456789", "current_assignee": null,
  "message_id": 9876543210, "is_test": false, "test_run_id": "s32-m-<case>",
  "input_message": "I need help with my order SRT332-GM not delivered",
  "started_at": "<now ISO>", "contact": {}, "explicit_assignee_id": "",
  "turn_id": "s32-m-<case>", "_case_already_assigned": <per case>,
  "_case_fixture": "<per case>"
}
```

`is_test:false` is safe on this specific target only: the S8 sweep above confirms the graph is
structurally incapable of a credentialed send/write, and the 3 `executeWorkflow` legs all
target `69RhomhiCH4bpY1w` (`zz-sub-sendmsg-BLOBTEST`), itself S8-clean and sinked to the
unconsumed TEST list. `contact: {}` makes `chat?` FALSE (no chat-console diversion);
`is_test:false` makes `test-guard` FALSE (no fail-closed short-circuit) — both confirmed in
every case's runData below.

Every `test_workflow` call **timed out on the client/transport side** but the execution
completed server-side in every case (confirmed via `search_executions` immediately after each
timeout, then `get_execution(includeData:true)` by the resulting execution id). This is a
transport artifact, not a correctness signal — noted once here, not repeated per case.

---

## 2. Per-case results

### Case (a) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_in_hours"`

- execution id **12209927** · trigger pin sha256[:16] `7336e1f1ee3c4766` (`test_run_id
  s32-m-a`)
- nodes executed (runData key set, in order): `When Executed by Another Workflow` → `chat?`
  (FALSE) → `test-guard` (FALSE) → `sorento-sub-respond-sendmsg-respond-routed-to-pic2` (sub-exec
  `12209929` → `69RhomhiCH4bpY1w`) → `get-round-robin-assignee` → `if-conversation-unassigned`
  (TRUE) → `Assign or unassign a Conversation1` → `conversation-sla-tracking-create` →
  `Call 'sub-add-comment-respond'` → `if-in-working-hours` (TRUE) → `return-assignee` →
  `sorento-sub-respond-sendmsg-respond-routed-to-pic` (sub-exec `12209931` → `69RhomhiCH4bpY1w`)

| assertion | expected | actual | result |
|---|---|---|---|
| Assign stand-in executed | yes | present in runData, `_stand_in:"assign"` | PASS |
| `_rendered_body.assigned_to_id` | `"USR-0042"` | `"USR-0042"` | PASS |
| `_rendered_body.contact_phone_number` | `"+60123456789"` | `"+60123456789"` | PASS |
| `_rendered_body.agent_code` | `"CS"` | `"CS"` | PASS |
| `_rendered_body.team_set_code` | `"CS-TEAM"` | `"CS-TEAM"` | PASS |
| `_rendered_body.message_id` (number) | `9876543210` | `9876543210` (JSON number) | PASS |
| `_rendered_body.source_message_id` (string) | `"9876543210"` | `"9876543210"` (JSON string) | PASS |
| `_rendered_body.source_message_text` | exact input_message | `"I need help with my order SRT332-GM not delivered"` | PASS |
| `_rendered_url` | ends `/conversation-sla-tracking/integration` | `https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration` | PASS |
| comment stand-in executed | yes | present, `_stand_in:"comment"` | PASS |
| `_rendered_comment` contains `2026-08-12 21:58:54` | yes (13:58:54 UTC → MYT +8) | `"⏰ SLA Alert: This contact is routed to you at 2026-08-12 21:58:54."` | PASS |
| `_rendered_comment` due/resolve lines | present | `"You have until 2026-08-12 22:58:54 to respond."` / `"You have until 2026-08-12 22:58:54 to resolve."` | PASS |
| `if-in-working-hours` | TRUE | `main[0]`=1 item, `main[1]`=`[]` | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |
| routed-to-pic leg executed | yes | `sorento-sub-respond-sendmsg-respond-routed-to-pic` present, sub-exec `12209931`→`69RhomhiCH4bpY1w` | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (a): PASS — all 15 assertions hold.**

### Case (b) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_in_hours"`

- execution id **12210066** · trigger pin sha256[:16] `86a5793abf49648a` (`test_run_id
  s32-m-b`)
- nodes executed: same chain as (a) EXCEPT `if-conversation-unassigned` FALSE →
  `conversation-sla-tracking-create` directly (`source.previousNodeOutput:1`).

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT from runData | yes — **the key assertion** | key not present anywhere in `resultData.runData` (verified against the full JSON object, not a single-field check) | **PASS** |
| `if-conversation-unassigned` fired FALSE, direct edge to create | yes | `if-conversation-unassigned` output `main[1]`=1 item / `main[0]`=`[]`; `conversation-sla-tracking-create.source[0].previousNodeOutput === 1` | PASS |
| create executed, same `_rendered_body`/`_rendered_url` as (a) | yes | byte-identical `_rendered_body` (only `test_run_id`/`turn_id` differ upstream, not in the body) | PASS |
| comment stand-in, `_rendered_comment` timestamps | same as (a) | identical `21:58:54`/`22:58:54` strings | PASS |
| `if-in-working-hours` TRUE → `return-assignee` → `…pic` | yes | confirmed, `agent_assignee:"1096809"` | PASS |
| `get-working-days` NOT in runData | absent | absent | PASS |

**Case (b): PASS — the lost-enquiry fix is confirmed by execution SHAPE (node absence), not
reply text, matching the plan's discriminator.**

### Case (c) — `_case_already_assigned:false`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution id **12210183** · trigger pin sha256[:16] `edc6e10ebe8809f1` (`test_run_id
  s32-m-c`)
- nodes executed: `…pic2` (sub-exec `12210184`→`69RhomhiCH4bpY1w`) → `get-round-robin-assignee`
  → `if-conversation-unassigned` (TRUE) → `Assign or unassign a Conversation1` →
  `conversation-sla-tracking-create` → `Call 'sub-add-comment-respond'` → `if-in-working-hours`
  (FALSE) → `get-working-days` → `sorento-sub-respond-sendmsg-respond-routed-to-pic1` (sub-exec
  `12210186`→`69RhomhiCH4bpY1w`)

| assertion | expected | actual | result |
|---|---|---|---|
| `if-in-working-hours` | FALSE | `main[0]`=`[]`, `main[1]`=1 item | PASS |
| `get-working-days` executed | yes | present, `{working_day_ranges:[{start_weekday:"Tuesday",end_weekday:"Friday"}], working_hours_start:"08:00", working_hours_end:"23:59"}` | PASS |
| `routed-to-pic1` leg executed with out-of-hours copy | yes, contains `"Tuesday - Friday"` and `"08:00 - 23:59"` | message body: `"...Our operating hours (except public holidays):\nTuesday - Friday\n08:00 - 23:59"` | PASS |
| `return-assignee` ABSENT | yes | key not present in runData | PASS |
| create fires (Assign path, unassigned) | yes | `Assign or unassign a Conversation1` present, `if-conversation-unassigned` TRUE branch | PASS |

**Case (c): PASS — all 5 assertions hold.**

### Case (d) — `_case_already_assigned:true`, `_case_fixture:"fresh_insert_out_of_hours"`

- execution id **12210301** · trigger pin sha256[:16] `e2ee5da518e02586` (`test_run_id
  s32-m-d`)
- nodes executed: `…pic2` (sub-exec `12210302`) → `get-round-robin-assignee` →
  `if-conversation-unassigned` (FALSE, direct to create) → `conversation-sla-tracking-create` →
  `Call 'sub-add-comment-respond'` → `if-in-working-hours` (FALSE) → `get-working-days` →
  `…pic1` (sub-exec `12210304`→`69RhomhiCH4bpY1w`)

| assertion | expected | actual | result |
|---|---|---|---|
| `Assign or unassign a Conversation1` ABSENT | yes | key not present in runData | PASS |
| FALSE path (out-of-hours) as (c) | yes | `if-in-working-hours` FALSE, `get-working-days` executed, same out-of-hours copy | PASS |
| `return-assignee` ABSENT | yes | absent | PASS |

**Case (d): PASS — combines the lost-enquiry fix and the out-of-hours split correctly.**

### Case (e) — `_case_already_assigned:false`, `_case_fixture:"retry_already_active"`

- execution id **12210422** · trigger pin sha256[:16] `bbce890e2d247fdb` (`test_run_id
  s32-m-e`)
- nodes executed: identical key-set to case (a) (`…pic2`→`get-round-robin-assignee`→
  `if-conversation-unassigned`(TRUE)→`Assign…`→`create`→`comment`→`if-in-working-hours`(TRUE)→
  `return-assignee`→`…pic`), sub-execs `12210423`/`12210425`→`69RhomhiCH4bpY1w`.

| assertion | expected | actual | result |
|---|---|---|---|
| downstream shape identical to (a) | yes | same node key set, same edges, `executionStatus:"success"` on every node | PASS |
| no node errors on `already_active`/`is_update` | yes | zero errors anywhere in runData; `create` response carries `already_active:true, is_update:true` unchanged through `comment`/`if-in-working-hours` | PASS |
| nothing branches on `already_active`/`is_update` | yes | `if-in-working-hours` still keys only on `in_working_hours` (`true` in this fixture) → TRUE branch, same as (a) | PASS |
| `return-assignee.agent_assignee` | `"1096809"` | `"1096809"` | PASS |

**Case (e): PASS — the retry path produces no duplicate/divergent downstream behavior.**

### Case (f) — NEGATIVE, `_case_fixture:"missing_in_working_hours"` (expected: ERROR)

- execution id **12210538** · trigger pin sha256[:16] `b1e9975c869b65d2` (`test_run_id
  s32-m-f`) · **top-level execution `status: "success"` — no error anywhere**

| assertion (per task spec) | expected | actual | result |
|---|---|---|---|
| `create` (`conversation-sla-tracking-create`) DID run | yes | executed, response has `in_working_hours` key **deleted** (confirmed: absent from the JSON object, not `null`) | PASS |
| `comment` (`Call 'sub-add-comment-respond'`) DID run | yes | executed, `_rendered_comment` rendered normally (doesn't reference `in_working_hours`) | PASS |
| execution ERRORS at `if-in-working-hours` | **yes — required** | **NO ERROR.** `if-in-working-hours` `executionStatus:"success"`, output `main[0]`=`[]`, `main[1]`=1 item — it evaluated the missing key as **FALSE** and routed to the out-of-hours leg exactly like case (c)/(d) | **FAIL** |
| error node is exactly `if-in-working-hours` | n/a (no error occurred) | n/a | **FAIL** |

Downstream of the silent-FALSE route, execution continued normally: `get-working-days` executed
→ `sorento-sub-respond-sendmsg-respond-routed-to-pic1` executed (sub-exec `12210539`/`12210541`
→ `69RhomhiCH4bpY1w`), delivering the out-of-hours copy to the (would-be) customer.

**Case (f): FAIL.** This is not a harness/mechanism problem — the throwaway's `if-in-working-hours`
condition is byte-identical to the fork's (`node-diff.md` sha `84997fcc6296`, confirmed MATCH in
the equality table, §6 of `throwaway-build.md`), so this result is representative of what the
**promotable business logic** will actually do on live, not an artifact of the stand-in. The
node-diff's design comment — *"`typeValidation: "strict"` means a non-boolean `in_working_hours`
errors rather than silently falling to FALSE. Deliberate (fail loud)"* — is **empirically
incorrect for the key-absent case**: n8n's strict-mode boolean filter does not throw on
`undefined`; `Boolean(undefined) === false` satisfies the comparison silently. **Flagged for the
coder/reviewer:** if catching a malformed/missing `in_working_hours` from the CRM response is a
real requirement (rather than "best-effort default to out-of-hours"), the current `if-in-working-
hours` condition does not deliver it — an explicit `exists`/`isNotEmpty` check ahead of the
boolean check, or a Code-node guard, would be needed. If silently defaulting to the out-of-hours
copy on a malformed response is actually acceptable behavior, the node-diff's design-intent
comment should be corrected rather than left asserting a guarantee the node does not provide.

---

## 3. Cross-case static/dynamic assertions (per task, "Also across (a)–(e)")

| assertion | method | result |
|---|---|---|
| Zero RPUSH to `sorento-respond-assignee-queue` in any case | dynamic: grepped every case's full runData JSON for the literal string — 0 hits in all 6 cases. static: grepped the whole re-fetched workflow JSON — 0 occurrences; no node named `Redis` exists in the 16-node graph | PASS (both static and dynamic) |
| `chat-escalation-push` absent (chat_id empty) | dynamic: absent from runData in all 6 cases (`chat?` always took the FALSE branch) | PASS |
| `test-guard-record` absent (is_test false) | dynamic: absent from runData in all 6 cases (`test-guard` always took the FALSE branch) | PASS |

---

## 4. Egress accounting (§0)

Per the task, the only sanctioned egress for any case is BLOBTEST's (`69RhomhiCH4bpY1w`,
`zz-sub-sendmsg-BLOBTEST`) RPUSH to the unconsumed sink `sorento-respond-message-TEST`.

**BLOBTEST sub-executions observed, by case (all target `workflowId: 69RhomhiCH4bpY1w`):**

| case | `…pic2` sub-exec (ack) | `…pic`/`…pic1` sub-exec (final reply) | count |
|---|---|---|---|
| (a) | `12209929` | `12209931` (`…pic`) | 2 |
| (b) | `12210067` | `12210069` (`…pic`) | 2 |
| (c) | `12210184` | `12210186` (`…pic1`) | 2 |
| (d) | `12210302` | `12210304` (`…pic1`) | 2 |
| (e) | `12210423` | `12210425` (`…pic`) | 2 |
| (f) | `12210539` | `12210541` (`…pic1`) | 2 |
| **total** | | | **12** |

Every one of these 12 sub-executions is an expected sink write per §0's "the ONLY egress any
case may produce" clause — each is a `sorento-sub-respond-sendmsg-respond-routed-to-pic[/1/2]`
call into the S8-clean BLOBTEST fork, which per `throwaway-build.md` §4/§5 contains zero
credentialed send nodes and is name-preserving-Code-stand-in based (`Send a Message` / `HTTP
Request` synthetic, per LESSONS §47's prescribed fix).

**Redis LLEN/LRANGE sink-delta (S7a/S7b) — NOT independently verified; gap flagged, not
worked around.** Repeating the same gap the prior tester session on this slice recorded: `.env`
carries only `REDIS_TEST_MSG_LIST`/`REDIS_EGRESS_KEY_PREFIX` (list-name constants), no redis
host/port/password — the remote redis is reachable only via the in-workflow `sorento-redis`
credential, and no parameterized redis-read helper (like a generic `LLEN`/`LRANGE` probe) was
available among the known test-helper IDs (`zz-canary-read` has a hardcoded stale key on a
non-expression field; editing it is out of the tester's remit). I did **not** invent access —
this run's egress evidence is the **BLOBTEST sub-execution runData** (§2 tables above, each
case's rendered reply payload) rather than an independent LLEN/LRANGE read of
`sorento-respond-message-TEST` or `sorento-respond-message`. This is weaker than a direct
redis read and should not be represented as a discharged S7a/S7b gate — it is a payload-level
attribution from the n8n execution side only.

**No egress of any other kind occurred in any case:** no node of type `respondio`,
`httpRequest`, or `memoryPostgresChat` exists anywhere in this workflow (S8 sweep, §0), so no
credentialed write of any kind — assignment, SLA POST, respond.io comment, prod CRM write — was
structurally possible in this run, independent of the sink-delta gap above.

---

## Summary table

| case | envelope | nodes executed (terminal) | key assertion | result |
|---|---|---|---|---|
| pre-flight | — | — | versionId==activeVersionId==`040b8fed…`, S8 sweep clean, create-stand-in sha `18191030897e` | PASS |
| (a) | unassigned, in-hours | `…pic` | full `_rendered_body`/`_rendered_comment`/`if-in-working-hours` TRUE/`return-assignee` | **PASS** |
| (b) | **assigned**, in-hours | `…pic` | `Assign or unassign a Conversation1` ABSENT (lost-enquiry fix) | **PASS** |
| (c) | unassigned, out-of-hours | `…pic1` | `if-in-working-hours` FALSE, `get-working-days`, out-of-hours copy | **PASS** |
| (d) | **assigned**, out-of-hours | `…pic1` | Assign ABSENT + FALSE path | **PASS** |
| (e) | unassigned, retry (`already_active:true`) | `…pic` | shape identical to (a), no branching on retry fields | **PASS** |
| (f) | unassigned, `in_working_hours` **absent** (negative) | `…pic1` | expected ERROR at `if-in-working-hours` — **did not occur**; silently routed FALSE | **FAIL — real finding, not a harness defect** |
| cross-case | (a)-(e) | — | zero `sorento-respond-assignee-queue` RPUSH (static+dynamic), `chat-escalation-push`/`test-guard-record` absent | PASS |
| egress | (a)-(f) | — | 12 BLOBTEST sub-execs, zero banned-type nodes anywhere; LLEN/LRANGE gate NOT independently verified (tooling gap, same as prior session) | PASS (structural) / gap noted |

**Overall: 5/6 functional cases PASS (a, b, c, d, e). Case (f) is a FAIL** — the negative test
correctly proves cases (a)–(e) *can* fail (LESSONS §61's "assertion must be shown red"
requirement is satisfied insofar as *something* went differently), but the specific failure mode
the plan predicted (a thrown validation error) did not occur; instead the node silently
defaulted to the out-of-hours branch. **This must be resolved (fix the condition, or correct the
design-intent comment and re-scope case (f)'s expectation) before this slice can be signed off
as fully matching the plan's V2 acceptance criteria.**

**Target confirmation:** the throwaway tested in this run is confirmed
`versionId == activeVersionId == 040b8fed-912e-4a53-9da9-3ef953136fe7` (re-verified immediately
before the first case). **Neither the fork `vUfFUDjLAuMaeQE6` nor the live sub
`rrYXzE61gCNUck_zmXe-G` was run, edited, or otherwise touched in this session.**

---
---

# PRIOR RUN — HISTORY, SUPERSEDED (kept for provenance)

The section below is the **unmodified prior tester run** on this slice, which halted before any
execution because it was (incorrectly, per the plan's later V2 redesign) pointed at the fork
`vUfFUDjLAuMaeQE6` directly rather than at an S8-compliant throwaway double. The plan's
"REDESIGNED 2026-08-12 after the tester's §0 S8 halt" bullet and this whole throwaway
(`mTfA5b9TgHItWo2g`) exist *because of* the halt recorded below. It is retained verbatim below
the divider for audit trail; the matrix above is the current, authoritative result for V2.

# S3.2 tester run — intervention-tickets-s32 pin-data matrix (V2) + fail-closed proof (V3)

Target: `vUfFUDjLAuMaeQE6` (`sub-human-intervention TEST (delta3)`) · Run date: 2026-08-12 · seat: tester

## Headline result

**V2 (functional pin-data matrix, cases a–f) is HALTED, not executed.** The fork fails the
binding UAC `tests/uac/00-SAFETY-always-read.md` §0 **S8** gate, and a second, independent,
mechanism-level check confirms a real egress write is unavoidable if any case reaches
`Call 'sub-add-comment-respond'` — which is every one of cases (a)–(e). Both findings are
below. **V3 (fail-closed proof) is safe and was executed — PASS**, with one instrumentation
gap noted (§ Tooling gap).

A mid-run message from the coordinator asked me to re-run V2 with the CRM peer's real
dev-backend fixtures (verbatim response bodies for the fresh-insert / out-of-hours / retry
cases). I did not do this. The fixture swap does not address the reason V2 is blocked — the
problem is the **execution mechanism** (`test_workflow` against this specific fork), not the
realism of the pinned data. Swapping fixtures and running anyway would be exactly the "pinning
rescues an S8-failing fork" move that §0 S8 explicitly forbids. I used the real fixtures only
for the structural (unexecuted) walk-through below, and flag this for the coder/reviewer.

---

## 0. Target verification (gate before any run)

Re-`GET` on `vUfFUDjLAuMaeQE6`:

| check | result |
|---|---|
| `versionId` | `fdc154b5-cb33-416c-a468-517fff59dc5e` |
| `activeVersionId` | `fdc154b5-cb33-416c-a468-517fff59dc5e` — **matches versionId** |
| `if-conversation-unassigned` sha256[:12] | computed `50391b189ae0` == node-diff `50391b189ae0` — **MATCH** |
| `conversation-sla-tracking-create` sha256[:12] | computed `086487442a3d` == node-diff `086487442a3d` — **MATCH** |
| `if-in-working-hours` sha256[:12] | computed `84997fcc6296` == node-diff `84997fcc6296` — **MATCH** |

Target is NOT drifted. Proceeding was authorized by this gate — the S8 finding below is
independent of drift.

---

## 1. S8 gate failure — the reason V2 is halted

`tests/uac/00-SAFETY-always-read.md` §0 S8 (rewritten 2026-07-21, "pinning is withdrawn, not
merely superseded"):

> No `is_test:false` run may execute against a fork whose JSON contains any node of type
> `@respond-io/n8n-nodes-respond-io.respondio`, `n8n-nodes-base.httpRequest`, or
> `@n8n/n8n-nodes-langchain.memoryPostgresChat`. … A fork failing the check **must not be run
> at all** — it is not rescuable by pinning.
>
> S3 extension (same change): additionally assert the HI fork `vUfFUDjLAuMaeQE6` … contain
> **zero credentialed send nodes**.

Node-type scan of the re-fetched `vUfFUDjLAuMaeQE6` JSON (16 nodes):

| node | type | S8 status |
|---|---|---|
| `Assign or unassign a Conversation1` | `@respond-io/n8n-nodes-respond-io.respondio` | **BANNED type** |
| `conversation-sla-tracking-create` | `n8n-nodes-base.httpRequest` | **BANNED type** |
| `get-round-robin-assignee` | `n8n-nodes-base.httpRequest` | **BANNED type** |
| `get-working-days` | `n8n-nodes-base.httpRequest` | **BANNED type** |

All four are reachable on the `is_test:false` branch that every V2 case (a)–(f) requires
(`test-guard` FALSE → `…routed-to-pic2` → `get-round-robin-assignee` → …). Per S8's own binding
text this fork **must not be run at all** at `is_test:false` — the rule contains no carve-out
for "unless the pin mechanism is `test_workflow`". V2 as scoped (base envelope `is_test: false`)
is exactly the case S8 forbids.

## 2. Independent, mechanism-level confirmation (not just a policy reading)

I did not rely on the policy text alone. I called `mcp__n8n-mcp__prepare_test_pin_data` on the
fork to see what the tool itself treats as pinnable:

```
nodesWithoutSchema (needs pin data, I supply it): When Executed by Another Workflow,
  Assign or unassign a Conversation1, conversation-sla-tracking-create,
  get-round-robin-assignee, get-working-days, test-guard-record, chat-escalation-push
nodesSkipped (executes NORMALLY — no pinning offered): if-conversation-unassigned,
  sorento-sub-respond-sendmsg-respond-routed-to-pic[1|2], return-assignee,
  Call 'sub-add-comment-respond', test-guard, chat?, if-in-working-hours
```

`Call 'sub-add-comment-respond'` (an `executeWorkflow` node, workflowId `2l8egTLJbyGOPvG-DbtDX`)
is in **`nodesSkipped`** — the tool does not pin `executeWorkflow` nodes at all; per its own
description ("Other nodes … execute normally") it actually invokes the target sub-workflow.
That node sits on **every** V2 branch after `conversation-sla-tracking-create` (cases a–e all
pass through it before the working-hours split).

I fetched `2l8egTLJbyGOPvG-DbtDX` (`sub-add-comment-respond`) to see what it does:

```
When Executed by Another Workflow (contact_id, user_id, comment)
  → Add a Comment  [type: @respond-io/n8n-nodes-respond-io.respondio, resource: COMMENTS]
```

Two nodes, **zero guard of any kind** — no `is_test`/`test_mode` check, no branch, nothing
between the trigger and the live respond.io COMMENTS write. `active: true`,
`versionId == activeVersionId` (published). This is not a harness fork; it is the same live,
unguarded comment-posting sub the plan's own §"Node edit list" item 3/5 assumes is shared with
production. The HI fork's caller passes no `is_test` field into it either (its
`workflowInputs.value` mapping is `contact_id`/`comment`/`user_id` only), so this sub could not
self-guard even if it wanted to.

**Conclusion: running any V2 case via `test_workflow` on this fork would, with certainty (not
risk), post a real respond.io comment** via `Add a Comment` against `contact_id 437264483`'s
conversation — an S1/S2 violation — regardless of how the four S8-banned nodes are pinned. This
is a second, independent reason V2 cannot be executed as scoped, on top of the S8 node-type
ban. (`Add a Comment`'s body is the "⏰ SLA Alert…" template from the plan's item 3 — a real,
substantive write, not an inert ping.)

The three sendmsg callers (`…routed-to-pic`, `…routed-to-pic1`, `…routed-to-pic2`) are **not**
part of this problem — I re-verified `69RhomhiCH4bpY1w` (`zz-sub-sendmsg-BLOBTEST`, the fork
they all point at): zero nodes of any S8-banned type; `Send a Message` / `HTTP Request` are
name-preserving Code-node stand-ins (per LESSONS §47's prescribed fix), and it carries its own
`test-guard`. BLOBTEST is S8-compliant and safe to invoke for real, exactly as the UAC S8 table
already records. `sub-add-comment-respond` is the gap the S8 table doesn't cover because it was
never a sendmsg fork.

## 3. Decision

- **V2 (a)–(f): NOT EXECUTED.** No `test_workflow` / `execute_workflow` call was made against
  `vUfFUDjLAuMaeQE6` with `is_test:false`.
- **The coordinator's mid-run fixture update was received and read, but not acted on by
  running anything.** The peer's real fixtures are used below only in the structural
  (unexecuted) walkthrough — see §4.
- **What must happen before V2 can be run at all:** the coder must either (a) replace
  `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
  `get-round-robin-assignee`, `get-working-days` with name-preserving Code-node stand-ins
  (LESSONS §47 pattern) on a NEW fork, **and** repoint `Call 'sub-add-comment-respond'` at an
  S8-compliant comment-sink fork (a BLOBTEST-shaped fork for the comment sub, which does not
  currently exist), or (b) get an explicit, separately-authorized, user-gated exception to run
  against a real non-prod CRM/respond.io sandbox with the dev contact — which is what the
  plan's own P4 already prescribed for the CRM leg ("no reachable dev CRM… zero prod writes")
  and evidently does not cover the respond.io comment leg. This is a build-side gap, not
  something a tester can safely route around.

## 4. V2 — structural-only walkthrough (NOT executed; record only)

Using the peer's real fixtures (dated 2026-08-12) and the fork's actual expressions read from
the re-fetched JSON, reasoning through the graph without running it:

- `if-conversation-unassigned` — single condition, `is_already_assigned == false`.
- `if-in-working-hours` — single condition, strict boolean, reads
  `$('conversation-sla-tracking-create').first().json.in_working_hours` (the CREATE response,
  not `get-round-robin-assignee`'s `is_working_hours` — confirmed from the live expression
  string, matches plan item 4).
- `return-assignee` Code node reads `$('conversation-sla-tracking-create').first().json.assigned_to`
  (NOT `.assigned_to_id`) — so with the peer's real fixture (`assigned_to: "1096809"`), the
  coordinator's corrected assertion (`agent_assignee == "1096809"`) is **structurally
  consistent with the actual expression**, not a guess.
- Grepped the fork's full node-parameter text (from the same `get_workflow_details` fetch) for
  `already_active` and `is_update`: **zero occurrences outside the create node's own response
  schema** — no downstream node branches on either field, confirming case (e)'s premise
  ("nothing branches on `already_active`") structurally, independent of execution.

| case | envelope delta vs base | structural path (unexecuted) | would satisfy |
|---|---|---|---|
| (a) | `is_already_assigned:false`, create=FRESH INSERT (`in_working_hours:true`) | unassigned→`Assign`→create→comment→`if-in-working-hours` TRUE→`return-assignee`(`agent_assignee="1096809"`)→`…pic`. `get-working-days` NOT on path. | node-diff's resulting graph, TRUE leg |
| (b) | `is_already_assigned:true`, same create fixture | `if-conversation-unassigned` FALSE → create **directly** (Assign node not on path) → comment → TRUE leg as (a). This is the lost-enquiry fix, confirmed from the FALSE-branch wiring (`main[1]` → `conversation-sla-tracking-create`), not inferred | the plan's headline fix |
| (c) | unassigned, create=OUT-OF-HOURS (`in_working_hours:false`) | unassigned→Assign→create→comment→`if-in-working-hours` FALSE→`get-working-days`→`…pic1`. `return-assignee` NOT on path | FALSE leg |
| (d) | assigned, OUT-OF-HOURS fixture | FALSE leg as (c), Assign not on path | FALSE leg + fix |
| (e) | RETRY fixture (`already_active:true, is_update:true`, same `tracking_id`, `in_working_hours:true`) | identical path to (a)/(b)'s TRUE leg; `already_active`/`is_update` read by nothing downstream (grep above) | no duplicate side effects (structural only) |
| (f) | create pinned **without** `in_working_hours` | `if-in-working-hours`'s condition (`typeValidation:"strict"`, boolean `true` op) reads `undefined` off a missing key — strict-mode boolean validation against `undefined` is documented n8n behavior as a thrown validation error, matching the node-diff author's own annotation. **This is a design expectation, not an executed observation.** | fail-loud design intent — unconfirmed empirically |

**None of the rows above are PASS/FAIL in the UAC sense** — they are unexecuted structural
readings, recorded because the coordinator asked for the real-fixture pass. They do not
discharge plan §Validation V2, which requires runData.

> **NOTE added by the current (superseding) run:** case (f)'s structural prediction above —
> "strict-mode boolean validation against `undefined` is documented n8n behavior as a thrown
> validation error" — **was executed in the current run above and found FALSE.** The node
> evaluates the missing key as `false` and does not throw. See the current run's §2 case (f)
> and headline result.

---

## 5. V3 — fail-closed proof (EXECUTED, safe)

`is_test:true` never reaches any S8-banned node or `Call 'sub-add-comment-respond'` — `chat?`
FALSE → `test-guard` TRUE → `test-guard-record` is the entire reachable set. Ran via
`test_workflow` (trigger + inert/unreached pins on the 4 banned nodes + `chat-escalation-push`,
supplied defensively even though unreached; `test-guard-record` deliberately left **unpinned**
so its redis push executes for real against the harness's own `test:egress:*` sink).

Envelope used (`s32-guard-1`):
```
contact_id 437264483, agent "CS", team "CS-TEAM", contact_phone_number "+60123456789",
current_assignee null, message_id 9876543210, is_test true, test_run_id "s32-guard-1",
input_message "I need help with my order SRT332-GM not delivered",
started_at "2026-08-12T13:58:51.000Z", contact {}, explicit_assignee_id "", turn_id "s32-guard-1"
```

Executions (both server-side successes; the MCP call itself client-timed-out on the response
transport both times — confirmed via `search_executions`, unrelated to correctness):
`12206099` (first attempt), `12206207` (final, includes the `chat-escalation-push` pin) — using
`12206207`.

### Assertions (from `get_execution(includeData:true)` runData, node-by-node — never status alone)

| assertion | evidence |
|---|---|
| `test-guard` TRUE | `test-guard` output: `main[0]` (TRUE) = 1 item, `main[1]` (FALSE) = `[]` |
| `test-guard-record` executed | present in `runData`, `executionStatus:"success"`, ran immediately after `test-guard` (`source.previousNode:"test-guard", previousNodeOutput:0`) |
| `chat?` correctly FALSE (chat_id empty) | `chat?` output: `main[0]` (TRUE→push) = `[]`, `main[1]` (FALSE→test-guard) = 1 item |
| Nothing downstream of `test-guard` FALSE executed | `runData` contains **exactly 4 node keys**: `When Executed by Another Workflow`, `chat?`, `test-guard`, `test-guard-record`. `…routed-to-pic2`, `get-round-robin-assignee`, `if-conversation-unassigned`, `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`, `if-in-working-hours`, `return-assignee`, `get-working-days`, `…pic`/`…pic1`, `chat-escalation-push` — **all absent from runData** |
| `sorento-respond-assignee-queue` RPUSH impossible | the `Redis` node (assignee-queue push) does not exist in this fork's 16-node graph at all — structural, not run-scoped. Zero occurrences of the literal string `sorento-respond-assignee-queue` anywhere in the re-fetched JSON |
| `LRANGE test:egress:s32-guard-1` contains the `would_write` record | **see Tooling gap below** — not independently read back; inferred from `test-guard-record`'s `executionStatus:"success"` (a redis-push failure surfaces as a node error here — no `continueErrorOutput`/swallow path on this node) plus the node's own `messageData` template (`guard:"human-intervention-sub", kind:"would_write", target:"respondio:assign+crm:sla+respondio:comment"`) rendered against the known envelope |

### §0 gate (V3)

- **S1/S2** — no send/assign/SLA/comment node executed (runData proves it, see table above).
- **S3** — same; the only real write attempted was `test-guard-record`'s push to the harness's
  own `test:egress:` sink.
- **S5** — `is_test:true` present on the trigger's own output (confirmed in `runData`), consumed
  by `test-guard`.
- **S7 (sink-delta)** — `sorento-respond-message` (prod ingest) LLEN = **0**,
  `sorento-respond-message-TEST` (TEST sink) LLEN = **1422**, both read via `zz-canary-read`
  (execution `12206578`, manual mode) ~4 min after the V3 run. **No true before/after delta was
  captured** (see Tooling gap) — but this run's executed path (`chat?`→`test-guard`→
  `test-guard-record`) topologically never touches either sink list; a delta measurement would
  be redundant with, and weaker than, this structural guarantee. I record the post-run snapshot
  for the file, not as the primary evidence.
- **S8** — the fork contains banned node types, but this run's `is_test:true` branch never
  reaches them (confirmed via the runData node-key set above) — S8's ban is scoped to
  `is_test:false` runs, so V3 does not trigger it.

**V3 verdict: PASS**, with the LRANGE-content caveat below.

---

## 6. Tooling gap (report, not worked around)

I could not directly read arbitrary redis keys (e.g. `test:egress:s32-guard-1`) from outside
n8n:
- `.env` carries only `REDIS_TEST_MSG_LIST` / `REDIS_EGRESS_KEY_PREFIX` (list-name/prefix
  constants) — no redis host/port/password. Redis is reachable only via the in-workflow
  `sorento-redis` credential.
- The existing read helper `zz-canary-read` (`LLIbMXAixexM9Cwc`) has a **hardcoded** key
  (`test:egress:9426737`, a stale key from an old run) on its `Read Egress` node — a plain
  string, not an expression, so it cannot be redirected to my run's key without editing the
  workflow. I did not edit it (out of the tester's remit).
- I did not find any other parameterized redis-read helper among the known IDs
  (`zz-canary-seed` is write-only and hardcoded to `main-message-list-test`; `zz-canary-run` is
  the exec wrapper for the main clone, not a redis probe).

I therefore relied on `test-guard-record`'s `executionStatus:"success"` plus the absence of a
swallow/continueErrorOutput path on that node as the evidence that the push executed, rather
than reading the pushed value back. This is **weaker than a direct LRANGE** and should not be
treated as fully discharging the LRANGE requirement in the V3 spec. **Recommendation:** add a
parameterized redis-read helper (input: key name, via a webhook trigger like `zz-canary-seed`
already uses) so future testers can close this gap without editing test scaffolding mid-run.

---

## Summary table (PRIOR RUN)

| slice | case | executed? | result | note |
|---|---|---|---|---|
| target verify | — | yes | PASS | versionId==activeVersionId, 3/3 sha spot-checks match |
| V2 | (a) unassigned, ITH:true | **NO — S8 HALT** | BLOCKED | fork contains banned node types + unguarded `sub-add-comment-respond` |
| V2 | (b) assigned, ITH:true (lost-enquiry fix) | **NO — S8 HALT** | BLOCKED | same |
| V2 | (c) unassigned, ITH:false | **NO — S8 HALT** | BLOCKED | same |
| V2 | (d) assigned, ITH:false | **NO — S8 HALT** | BLOCKED | same |
| V2 | (e) retry | **NO — S8 HALT** | BLOCKED | same |
| V2 | (f) negative (missing `in_working_hours`) | **NO — S8 HALT** | BLOCKED | same |
| V2 | (a)-(f) | — | STRUCTURAL-ONLY (§4) | unexecuted, does not discharge plan V2 |
| V3 | fail-closed (`is_test:true`) | yes | **PASS** | LRANGE content inferred, not read back (tooling gap) |

**Overall (prior run): this slice is INCOMPLETE by design — safety-halted, not signed off.** V3
was the only functional evidence produced. The S8 halt this run recorded is exactly what
prompted the plan's V2 redesign and the throwaway build documented in `throwaway-build.md`,
whose execution is the current (superseding) run at the top of this file.
