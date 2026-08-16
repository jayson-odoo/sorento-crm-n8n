# TOPOLOGY — sub-sendmsg-CHAT  (`ublq9nSlrpz63xan`)

- versionId **ab7f1ddd-fd11-4c5b-bd9b-6e7ebd20349a** · activeVersionId **ab7f1ddd-fd11-4c5b-bd9b-6e7ebd20349a** · DRAFT == ACTIVE
- 16 nodes

## Edges
_16 edge groups_

```
Call 'sub-respond-save-message-redis'1[0] -> Loop Over Items
Code in JavaScript[0] -> If1
If[0] -> Code in JavaScript
If[1] -> HTTP Request
If1[0] -> Loop Over Items
Loop Over Items[0] -> send-done
Loop Over Items[1] -> Send a Message
Send a Message[0] -> Call 'sub-respond-save-message-redis'1
When Executed by Another Workflow[0] -> chat?
chat-build-parts[0] -> chat-push
chat-push[0] -> console-loggable?
chat?[0] -> chat-build-parts
chat?[1] -> test-guard
console-loggable?[0] -> log-chat-history-n8ntest
test-guard[0] -> test-guard-record
test-guard[1] -> If
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **Loop Over Items** ← Call 'sub-respond-save-message-redis'1
- **Send a Message** ← Call 'sub-respond-save-message-redis'1
- **When Executed by Another Workflow** ← Call 'sub-respond-save-message-redis'1, Code in JavaScript, Send a Message, chat-build-parts, chat?, log-chat-history-n8ntest, test-guard, test-guard-record

## Zero inbound (orphaned / triggers)

- When Executed by Another Workflow

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-respond-save-message-redis'1 | `UrETd-jm46tFj3Xw7w8vL` | sub-respond-save-message-redis |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Send a Message | respondIoApi | sorento-api |
| chat-push | redis | sorento-redis |
| log-chat-history-n8ntest | postgres | n8n_test-db |
| test-guard-record | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| Code in JavaScript | 56 |
| chat-build-parts | 52 |
