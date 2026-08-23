# TOPOLOGY — sub-human-intervention TEST (delta3)  (`vUfFUDjLAuMaeQE6`)

- versionId **0fdba9e5-d188-484e-b3f4-a06fbf43e1b8** · activeVersionId **0fdba9e5-d188-484e-b3f4-a06fbf43e1b8** · DRAFT == ACTIVE
- 17 nodes

## Edges
_18 edge groups_

```
Assign or unassign a Conversation1[0] -> conversation-sla-tracking-create
Call 'sub-add-comment-respond'[0] -> if-in-working-hours
When Executed by Another Workflow[0] -> chat?
chat-after-assignee?[0] -> chat-escalation-push
chat-after-assignee?[1] -> if-conversation-unassigned
chat?[0] -> get-round-robin-assignee
chat?[1] -> test-guard
conversation-sla-tracking-create[0] -> Call 'sub-add-comment-respond'
get-round-robin-assignee[0] -> chat-after-assignee?
get-working-days[0] -> sorento-sub-respond-sendmsg-respond-routed-to-pic1
if-conversation-unassigned[0] -> Assign or unassign a Conversation1
if-conversation-unassigned[1] -> conversation-sla-tracking-create
if-in-working-hours[0] -> return-assignee
if-in-working-hours[1] -> get-working-days
return-assignee[0] -> sorento-sub-respond-sendmsg-respond-routed-to-pic
sorento-sub-respond-sendmsg-respond-routed-to-pic2[0] -> get-round-robin-assignee
test-guard[0] -> test-guard-record
test-guard[1] -> sorento-sub-respond-sendmsg-respond-routed-to-pic2
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **When Executed by Another Workflow** ← Assign or unassign a Conversation1, Call 'sub-add-comment-respond', chat-after-assignee?, chat-escalation-push, chat?, conversation-sla-tracking-create, get-round-robin-assignee, sorento-sub-respond-sendmsg-respond-routed-to-pic, sorento-sub-respond-sendmsg-respond-routed-to-pic1, sorento-sub-respond-sendmsg-respond-routed-to-pic2, test-guard, test-guard-record
- **conversation-sla-tracking-create** ← Call 'sub-add-comment-respond', if-in-working-hours, return-assignee
- **get-round-robin-assignee** ← Call 'sub-add-comment-respond', conversation-sla-tracking-create

## Zero inbound (orphaned / triggers)

- When Executed by Another Workflow

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-add-comment-respond' | `2l8egTLJbyGOPvG-DbtDX` | sub-add-comment-respond |
| sorento-sub-respond-sendmsg-respond-routed-to-pic | `69RhomhiCH4bpY1w` | zz-sub-sendmsg-BLOBTEST |
| sorento-sub-respond-sendmsg-respond-routed-to-pic1 | `69RhomhiCH4bpY1w` | zz-sub-sendmsg-BLOBTEST |
| sorento-sub-respond-sendmsg-respond-routed-to-pic2 | `69RhomhiCH4bpY1w` | zz-sub-sendmsg-BLOBTEST |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Assign or unassign a Conversation1 | respondIoApi | sorento-api |
| chat-escalation-push | redis | sorento-redis |
| conversation-sla-tracking-create | httpHeaderAuth | crm-n8n-auth |
| get-round-robin-assignee | httpHeaderAuth | crm-n8n-auth |
| get-working-days | httpHeaderAuth | crm-n8n-auth |
| test-guard-record | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| return-assignee | 5 |
