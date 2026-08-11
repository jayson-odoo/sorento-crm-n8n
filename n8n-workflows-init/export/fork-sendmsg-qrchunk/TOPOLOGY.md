# TOPOLOGY — sub-sendmsg-QRCHUNK  (`aQUmwMVplmNcyUVc`)

- versionId **51fed3d1-9a92-469a-9b7a-d77e56f8d302** · activeVersionId **51fed3d1-9a92-469a-9b7a-d77e56f8d302** · DRAFT == ACTIVE
- 24 nodes

## Edges
_25 edge groups_

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
When Executed by Another Workflow[0] -> chat?
chat-build-parts[0] -> chat-push
chat-push[0] -> console-loggable?
chat?[0] -> chat-build-parts
chat?[1] -> Code in JavaScript
console-loggable?[0] -> log-chat-history-n8ntest
guard-qr[0] -> guard-record-qr
guard-qr[1] -> HTTP Request
guard-record-qr[0] -> Loop Over Items
guard-record-text[0] -> Loop Over Items
guard-text[0] -> guard-record-text
guard-text[1] -> Send a Message
is-last-quickreply[0] -> guard-qr
is-last-quickreply[1] -> guard-text
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **HTTP Request** ← Call 'sub-respond-save-message-redis' (quick_reply)
- **Loop Over Items** ← Call 'sub-respond-save-message-redis' (quick_reply), Call 'sub-respond-save-message-redis'1
- **Send a Message** ← Call 'sub-respond-save-message-redis'1
- **When Executed by Another Workflow** ← Call 'sub-respond-save-message-redis' (quick_reply), Call 'sub-respond-save-message-redis'1, Chat Memory Manager, Code in JavaScript, Postgres Chat Memory1, Send a Message, chat-build-parts, chat?, guard-qr, guard-record-qr, guard-record-text, guard-text, log-chat-history-n8ntest

## Zero inbound (orphaned / triggers)

- Postgres Chat Memory1
- Wait
- When Executed by Another Workflow

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-respond-save-message-redis' (quick_reply) | `tWm5DYLxfypmVC1T` | sub-respond-save-message-redis TEST |
| Call 'sub-respond-save-message-redis'1 | `tWm5DYLxfypmVC1T` | sub-respond-save-message-redis TEST |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Find a Message | respondIoApi | sorento-api |
| HTTP Request | respondIoApi | sorento-api |
| Postgres Chat Memory1 | postgres | sorento-crm-db |
| Send Template | respondIoApi | sorento-api |
| Send a Message | respondIoApi | sorento-api |
| chat-push | redis | sorento-redis |
| guard-record-qr | redis | sorento-redis |
| guard-record-text | redis | sorento-redis |
| log-chat-history-n8ntest | postgres | n8n_test-db |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| Code in JavaScript | 69 |
| chat-build-parts | 37 |
