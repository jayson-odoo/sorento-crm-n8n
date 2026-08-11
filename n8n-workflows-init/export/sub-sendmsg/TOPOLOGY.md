# TOPOLOGY — sorento-sub-respond-sendmsg-respond  (`aoydkG1dbItXR5jXFEQsP`)

- versionId **91171ac3-ddad-4452-ace5-98da59480c48** · activeVersionId **91171ac3-ddad-4452-ace5-98da59480c48** · DRAFT == ACTIVE
- 17 nodes

## Edges
_16 edge groups_

```
Call 'sub-respond-save-message-redis' (quick_reply)[0] -> Loop Over Items
Call 'sub-respond-save-message-redis'1[0] -> Loop Over Items
Code in JavaScript[0] -> If1
Find a Message[0] -> Switch1
HTTP Request[0] -> Call 'sub-respond-save-message-redis' (quick_reply)
If1[0] -> Loop Over Items
Loop Over Items[0] -> Chat Memory Manager
Loop Over Items[1] -> is-last-quickreply
Send a Message[0] -> Call 'sub-respond-save-message-redis'1
Switch1[1] -> Send Template
Wait[0] -> Find a Message
When Executed by Another Workflow[0] -> test-guard
is-last-quickreply[0] -> HTTP Request
is-last-quickreply[1] -> Send a Message
test-guard[0] -> test-guard-record
test-guard[1] -> Code in JavaScript
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **HTTP Request** ← Call 'sub-respond-save-message-redis' (quick_reply)
- **Loop Over Items** ← Call 'sub-respond-save-message-redis' (quick_reply), Call 'sub-respond-save-message-redis'1
- **Send a Message** ← Call 'sub-respond-save-message-redis'1
- **When Executed by Another Workflow** ← Call 'sub-respond-save-message-redis' (quick_reply), Call 'sub-respond-save-message-redis'1, Chat Memory Manager, Code in JavaScript, Postgres Chat Memory1, Send a Message, test-guard, test-guard-record

## Zero inbound (orphaned / triggers)

- Postgres Chat Memory1
- Wait
- When Executed by Another Workflow

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-respond-save-message-redis' (quick_reply) | `UrETd-jm46tFj3Xw7w8vL` | sub-respond-save-message-redis |
| Call 'sub-respond-save-message-redis'1 | `UrETd-jm46tFj3Xw7w8vL` | sub-respond-save-message-redis |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Find a Message | respondIoApi | sorento-api |
| HTTP Request | respondIoApi | sorento-api |
| Postgres Chat Memory1 | postgres | sorento-crm-db |
| Send Template | respondIoApi | sorento-api |
| Send a Message | respondIoApi | sorento-api |
| test-guard-record | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| Code in JavaScript | 69 |
