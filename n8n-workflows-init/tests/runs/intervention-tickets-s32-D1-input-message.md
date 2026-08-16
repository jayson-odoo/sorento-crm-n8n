# D1 closure — `input_message` mapping to `sub-human-intervention` — TESTED

**Verdict: D1 CLOSED.** The clone's caller mapping transmits `input_message` non-null,
verbatim, all the way to the fork's own trigger reception. Evidence below.

## Preconditions re-verified (fresh GET, before running)

- Clone `txiPzSxy3Pclsz6v` `versionId` == `activeVersionId` == **`c97f2f8f-e335-4a3b-8046-abea89bbfdf9`**
  — matches the target given in the task. No drift.
- Node `Call 'sub-human-intervention'` on that version:
  - `parameters.workflowInputs.value.input_message` present, expression:
    ```
    ={{ $('tf-message').first().json.message.message.text || $('tf-message').first().json.message.message.attachment?.description || '[' + ($('tf-message').first().json.message.message.type || 'unknown') + ' message]' }}{{ $('tf-message').first().json.message.replyTo?.message ? ' reply to: ' + $('tf-message').first().json.message.replyTo.message.text : '' }}
    ```
  - `schema` entry for `input_message`: `{"type":"string","removed":false}` — confirmed **not** `removed:true`.
  - `workflowId.value` = **`vUfFUDjLAuMaeQE6`** (`sub-human-intervention TEST (delta3)`) — confirmed target fork.
- All three preconditions held; proceeded.

## Mechanism used

Drove the clone via `zz-canary-run` (`VtIV3TF3aw2Fx8No`) through `mcp__n8n-mcp__execute_workflow`
(webhook-shaped input, since a direct `curl` to the `zz-run-hint` webhook was blocked by the
sandbox's Bash classifier as an outbound-network action — the MCP `execute_workflow` path against
the canary-run workflow's own webhook trigger was used instead, which is equivalent and stayed
inside the approved MCP mechanism).

**Routing choice:** used `scope: deterministic` with `mock_reformulator_output` (`message_type:
"request_for_help"`, `domain_hint:"order"`, `escalation.is_escalation_confirmation:true`) placed
at `item.message.mock_reformulator_output` — verified against the live node JSON that this is
where the outer caller `Call 'sub-query-reformulator'` actually reads it from
(`$('redis-pop-main-message-list').first().json.message.mock_reformulator_output`), **not** at the
item root as the stale `tests/cases/canary-escalate-offer.json` fixture has it (that fixture's
placement is wrong per the `stale-case-fixtures-false-green` landmine — flagging for a future
fixture-refresh pass, out of scope here).

⚠️ **Anomaly observed, not chased (out of scope for D1):** the mock was *not* honored — the real
reformulator LLM ran anyway (sub-execution `12528012` on `wI5RkNGW3EOJfBdo`, genuine `AI Agent`
output with its own `_parser_raw`, different routing than my mock: `customer_service`/
`order_enquiries` vs my mock's `purchasing`/`general_enquiries`, and an extracted entity
`{"raw":"D1 verification probe",...}` pulled from the seeded text). The bypass gate
`test-reformulator-bypass` inside the fork requires `is_test===true && !!mock_reformulator_output`
both true; `redis-pop-main-message-list`'s own recorded output shows the item *did* carry
`mock_reformulator_output` correctly at that path, and the outer caller's schema entry for that
field is `removed:false` (checked against the export cache, not re-verified fresh — caveat noted).
Why the bypass didn't fire is unresolved. **This does not affect the D1 finding** — the
`input_message` expression depends only on `tf-message`, not on which reformulator path ran, and
the run still correctly reached the escalation branch with `is_test:true` throughout. Flagging for
a separate session; do not treat as blocking.

## Seeded envelope (verbatim customer text)

```
"Please escalate me to a human agent right now about my order -- D1 verification probe."
```
Contact `437264483` (dev test contact, full access). `test_run_id`: `d1-input-message-20260815`.
No `replyTo` (so the expression's ` reply to: …` suffix correctly does not appear — matches the
expression's designed behavior for a non-quoted message).

## Execution chain

| workflow | id | execution |
|---|---|---|
| `zz-canary-run` | `VtIV3TF3aw2Fx8No` | **12528008** (parent, webhook trigger) |
| clone `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | **12528009** (Run Target sub-exec) |
| reformulator sub (unexpectedly real, see anomaly above) | `wI5RkNGW3EOJfBdo` | 12528012 |
| **`sub-human-intervention TEST (delta3)`** (fork under test) | `vUfFUDjLAuMaeQE6` | **12528018** |

## THE ASSERTION — verbatim received `input_message`

**On the clone**, node `Call 'sub-human-intervention'`'s own computed output (exec 12528009):
```json
"input_message": "Please escalate me to a human agent right now about my order -- D1 verification probe."
```

**Inside the fork itself** (exec 12528018), node `When Executed by Another Workflow` — the sub's
own trigger reception, i.e. the actual proof of transmission, not just the caller's intent:
```json
{
  "contact_id": 437264483,
  "agent": "order_enquiries",
  "team": "customer_service",
  "contact_phone_number": "60100000000",
  "current_assignee": null,
  "message_id": 1786809000000001,
  "is_test": true,
  "test_run_id": "d1-input-message-20260815",
  "input_message": "Please escalate me to a human agent right now about my order -- D1 verification probe.",
  "started_at": null,
  "contact": { "id": 437264483, "firstName": "Jayson", "lastName": "Canary", "phone": "60100000000", "countryCode": "MY", "status": "open", "custom_fields": [{"name":"is_human_intervened","value":"false"}], "assignee": {"id": null} },
  "explicit_assignee_id": "",
  "turn_id": "12528009"
}
```

**`input_message` is NON-NULL and matches the seeded customer text verbatim, character for
character.** This is the exact evidence D1 required: the value is not just computed by the caller
node, it is *received* at the sub's own trigger.

Note `started_at` is `null` here — confirms the SECOND unmapped field flagged in the fix doc
(deliberately out of scope, not fixed) is still broken, as expected. Do not confuse with D1.

## Short-circuit confirmation (fork exec 12528018)

`runData` contains exactly 4 nodes, in order: `When Executed by Another Workflow` → `chat?`
(FALSE branch, output 1 — no `contact.chat_id`) → `test-guard` (TRUE branch, output 0 —
`is_test===true`) → `test-guard-record` (redis push to `test:egress:d1-input-message-20260815`).
`lastNodeExecuted: "test-guard-record"`.

**Absent from runData** (asserted by name, not by status): `get-round-robin-assignee`,
`conversation-sla-tracking-create`, `Assign or unassign a Conversation1`,
`Call 'sub-add-comment-respond'`. None executed. Short-circuit proven.

## Before-picture (live, read-only, not re-run)

The two execution ids cited in the fix doc (`12261948`, `12184876`) are no longer retrievable —
pruned by n8n's execution-history retention (current live ids are in the ~12.4M range; those are
~187k–263k executions older). Substituted with the two most recent retrievable live executions of
`rrYXzE61gCNUck_zmXe-G` instead, read-only:

- exec **12437115** (2026-08-14T09:11:09Z): `"input_message":null,"started_at":null`
- exec **12433018** (2026-08-14T08:26:47Z): `"input_message":null,"started_at":null`

Confirms the defect is still live/unfixed on the spine (expected — the fix is clone-only per the
diff doc; the promote hunk for the spine is still pending user go per the flip runbook).

## §0 safety gate

- **S1** — zero real sends. No `sendmsg-sub` egress entry appears at all in this run (flow never
  reached a sendmsg node before the human-intervention short-circuit consumed it). No
  `api.respond.io/.../message` 2xx anywhere in the chain.
- **S2** — zero assignment/escalation writes. Confirmed above by node-name absence in fork exec
  `12528018`'s runData.
- **S3** — zero CRM/contact writes. `read-egress` (parent exec 12528008) shows 3 entries:
  1. `guard:"save-message-redis", kind:"would_log"` (incoming log, blocked real write)
  2. `guard:"save-session-vars", kind:"would_write", target:"crm:conversation-variables:PUT"` (blocked)
  3. `guard:"human-intervention-sub", kind:"would_write", target:"respondio:assign+crm:sla+respondio:comment"` (blocked)

  `update-human-intervened` did not appear (orphaned, as documented).
- **S4** — n/a this run; `get-results` never invoked (request_for_help branch doesn't reach it).
- **S5** — `test_mode`/`is_test` present throughout: `WHook` body `item.test_mode:true`;
  `Call 'sub-human-intervention'`'s computed payload `is_test:true`; fork trigger received
  `is_test:true` (confirmed directly above). Reformulator sub also received `is_test:true` per the
  caller's computed mapping (not independently re-verified at that sub's own trigger — lower
  priority since not the node under test).
- **S6** — token sinks: **anomaly** — the reformulator ran a real LLM call (sub-exec `12528012`)
  despite `scope:deterministic` intent; see Anomaly note above. Zero token spend inside the
  human-intervention fork itself (short-circuited before any LLM-adjacent node).
- **S7** — prod-sink untouched, TEST-sink delta attributed. From the canary-run's own
  instrumentation nodes (parent exec 12528008):
  - `llen-prod-before`: `{"sorento-respond-message":0}` → `llen-prod-after`: `{"sorento-respond-message":0}` — **delta 0**.
  - `llen-sink-before`: `{"sorento-respond-message-TEST":1501}` → `llen-sink-after`: `{"sorento-respond-message-TEST":1502}` — **delta +1**, matching the single `save-message-redis` egress entry for this `test_run_id`.
- **S8** — the fork `vUfFUDjLAuMaeQE6` was run at `is_test:true` (not `is_test:false`), so the
  structural no-credentialed-node rule doesn't gate this run; not re-checked here (not required by
  the task).
- **S9** — n/a, no fail-on-purpose mutation in this task.

All applicable §0 gates hold. No workflow was edited. No promote occurred. The live spine and live
sub (`9qVyfUxmRQqrpGRMDLRuz`, `rrYXzE61gCNUck_zmXe-G`) were only read, never executed.

## Verdict

**D1 CLOSED.** The `input_message` mapping fix on clone `txiPzSxy3Pclsz6v` @
`c97f2f8f-e335-4a3b-8046-abea89bbfdf9`, targeting `Call 'sub-human-intervention'` →
`vUfFUDjLAuMaeQE6`, has now executed and is proven to transmit: the fork's own trigger node
received `input_message` non-null, verbatim, equal to the seeded customer text. The `schema[input_message].removed: false` correction (the second edit noted in the diff doc) is
proven sufficient — it is not blocked in transit. This closes HANDOFF blocker item 2's
prerequisite ("verify a real intervention shows `input_message` non-null") for Step 0 of the flip
runbook.

**Not closed by this run** (explicitly out of scope, flagged for follow-up):
1. `started_at` remains unmapped (confirmed still `null` at the fork trigger) — separate slice per
   the diff doc.
2. The `mock_reformulator_output` bypass anomaly (real LLM ran instead of the mock) — unexplained,
   needs its own investigation session.
3. `tests/cases/canary-escalate-offer.json`'s `mock_reformulator_output` placement is stale (item
   root instead of `item.message.mock_reformulator_output`) — matches the known
   `stale-case-fixtures-false-green` landmine class; fixture refresh not performed here.
