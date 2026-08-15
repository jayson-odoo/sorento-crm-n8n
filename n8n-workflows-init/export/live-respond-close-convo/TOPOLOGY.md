# TOPOLOGY — respond-close-convo  (`-WkzJMQZHmsFQm6A2abLJ`)

- versionId **4a2e963d-dd2a-443e-bbb1-68b43ee29744** · activeVersionId **4a2e963d-dd2a-443e-bbb1-68b43ee29744** · DRAFT == ACTIVE
- 9 nodes

## Edges
_9 edge groups_

```
Assign or unassign a Conversation[0] -> Update a Contact
Execute a SQL query[0] -> Execute a SQL query1
Execute a SQL query1[0] -> If
If[0] -> conversation-sla-tracking-update
If[1] -> Assign or unassign a Conversation
Respond.io Trigger[0] -> Execute a SQL query
Update a Contact[0] -> sorento-sub-respond-sendmsg-respond
conversation-sla-event-tracking-create[0] -> Assign or unassign a Conversation
conversation-sla-tracking-update[0] -> conversation-sla-event-tracking-create
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **Execute a SQL query1** ← conversation-sla-tracking-update
- **Respond.io Trigger** ← Assign or unassign a Conversation, Execute a SQL query1, Update a Contact, conversation-sla-tracking-update

## Zero inbound (orphaned / triggers)

- Respond.io Trigger

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| sorento-sub-respond-sendmsg-respond | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Assign or unassign a Conversation | respondIoApi | sorento-api |
| Execute a SQL query | postgres | sorento-crm-db |
| Execute a SQL query1 | postgres | sorento-crm-db |
| Respond.io Trigger | respondIoApi | sorento-api |
| Update a Contact | respondIoApi | sorento-api |
| conversation-sla-event-tracking-create | httpHeaderAuth | crm-n8n-auth |
| conversation-sla-tracking-update | httpHeaderAuth | crm-n8n-auth |
