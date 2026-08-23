# TOPOLOGY — sub-human-intervention  (`rrYXzE61gCNUck_zmXe-G`)

- versionId **9249e00e-3dd9-4766-8c49-2f32f8f66bda** · activeVersionId **9249e00e-3dd9-4766-8c49-2f32f8f66bda** · DRAFT == ACTIVE
- 16 nodes

## Edges
_16 edge groups_

```
Assign or unassign a Conversation1[0] -> conversation-sla-tracking-create
Call 'sub-add-comment-respond'[0] -> return-assignee
Call 'sub-add-comment-respond'1[0] -> sorento-sub-respond-sendmsg-respond-routed-to-pic
Redis[0] -> get-working-days
When Executed by Another Workflow[0] -> test-guard
comment-switch[0] -> Call 'sub-add-comment-respond'1
comment-switch[1] -> Redis
conversation-sla-tracking-create[0] -> Call 'sub-add-comment-respond'
get-round-robin-assignee[0] -> if-conversation-unassigned
get-working-days[0] -> sorento-sub-respond-sendmsg-respond-routed-to-pic1
if-conversation-unassigned[0] -> Assign or unassign a Conversation1
if-conversation-unassigned[1] -> comment-switch
return-assignee[0] -> sorento-sub-respond-sendmsg-respond-routed-to-pic
sorento-sub-respond-sendmsg-respond-routed-to-pic2[0] -> get-round-robin-assignee
test-guard[0] -> test-guard-record
test-guard[1] -> sorento-sub-respond-sendmsg-respond-routed-to-pic2
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **When Executed by Another Workflow** ← Assign or unassign a Conversation1, Call 'sub-add-comment-respond', Call 'sub-add-comment-respond'1, Redis, conversation-sla-tracking-create, get-round-robin-assignee, sorento-sub-respond-sendmsg-respond-routed-to-pic, sorento-sub-respond-sendmsg-respond-routed-to-pic1, sorento-sub-respond-sendmsg-respond-routed-to-pic2, test-guard, test-guard-record
- **conversation-sla-tracking-create** ← Call 'sub-add-comment-respond', return-assignee
- **get-round-robin-assignee** ← Call 'sub-add-comment-respond', Call 'sub-add-comment-respond'1, conversation-sla-tracking-create

## Zero inbound (orphaned / triggers)

- When Executed by Another Workflow

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-add-comment-respond' | `2l8egTLJbyGOPvG-DbtDX` | sub-add-comment-respond |
| Call 'sub-add-comment-respond'1 | `2l8egTLJbyGOPvG-DbtDX` | sub-add-comment-respond |
| sorento-sub-respond-sendmsg-respond-routed-to-pic | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond-routed-to-pic1 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond-routed-to-pic2 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Assign or unassign a Conversation1 | respondIoApi | sorento-api |
| Redis | redis | sorento-redis |
| conversation-sla-tracking-create | httpHeaderAuth | crm-n8n-auth |
| get-round-robin-assignee | httpHeaderAuth | crm-n8n-auth |
| get-working-days | httpHeaderAuth | crm-n8n-auth |
| test-guard-record | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| return-assignee | 5 |
