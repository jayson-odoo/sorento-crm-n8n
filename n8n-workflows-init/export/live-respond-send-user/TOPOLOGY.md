# TOPOLOGY — respond-send-user  (`eG3AA-TWo17-E1-DlHLnH`)

- versionId **9b779edd-3bdd-4b71-b89a-0d85f22b0caa** · activeVersionId **9b779edd-3bdd-4b71-b89a-0d85f22b0caa** · DRAFT == ACTIVE
- 24 nodes

## Edges
_20 edge groups_

```
Execute a SQL query[0] -> Select rows from a table
If[0] -> Execute a SQL query, Update a Contact
Respond.io Trigger[0] -> If, compile-current-state, Call 'sub-respond-save-message-redis'
Select rows from a table[0] -> conversation-sla-tracking-update
Update a Contact[0] -> ht-cfg-enabled
Webhook[0] -> webhook-to-respond-convert
compile-current-state[0] -> save-session-vars
conversation-sla-tracking-update[0] -> conversation-sla-event-tracking-create
ht-act?[0] -> ht-prev-stamp
ht-act?[1] -> ht-inert
ht-arm[0] -> ht-stamp
ht-cfg-enabled[0] -> ht-cfg-timeout
ht-cfg-pilot[0] -> ht-gate
ht-cfg-timeout[0] -> ht-cfg-pilot
ht-first?[0] -> ht-intervene-notice
ht-first?[1] -> ht-refresh-only
ht-gate[0] -> ht-act?
ht-prev-stamp[0] -> ht-arm
ht-stamp[0] -> ht-first?
webhook-to-respond-convert[0] -> Call 'sub-respond-save-message-redis', Execute a SQL query
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **<node>** ← ht-gate  ⚠️ TARGET NOT IN THIS WORKFLOW
- **Respond.io Trigger** ← Select rows from a table, conversation-sla-tracking-update, ht-gate, save-session-vars
- **Select rows from a table** ← conversation-sla-tracking-update
- **ht-arm** ← ht-intervene-notice, ht-stamp
- **ht-gate** ← ht-arm
- **ht-prev-stamp** ← ht-arm
- **webhook-to-respond-convert** ← Select rows from a table, conversation-sla-tracking-update
- **x** ← ht-gate  ⚠️ TARGET NOT IN THIS WORKFLOW

## Zero inbound (orphaned / triggers)

- Respond.io Trigger
- Webhook

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-respond-save-message-redis' | `UrETd-jm46tFj3Xw7w8vL` | sub-respond-save-message-redis |
| ht-intervene-notice | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| Execute a SQL query | postgres | sorento-crm-db |
| Respond.io Trigger | respondIoApi | sorento-api |
| Select rows from a table | postgres | sorento-crm-db |
| Update a Contact | respondIoApi | sorento-api |
| conversation-sla-event-tracking-create | httpHeaderAuth | crm-n8n-auth |
| conversation-sla-tracking-update | httpHeaderAuth | crm-n8n-auth |
| ht-cfg-enabled | redis | sorento-redis |
| ht-cfg-pilot | redis | sorento-redis |
| ht-cfg-timeout | redis | sorento-redis |
| ht-prev-stamp | redis | sorento-redis |
| ht-stamp | redis | sorento-redis |
| save-session-vars | httpHeaderAuth | crm-n8n-auth |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| ht-gate | 137 |
| ht-arm | 39 |
| compile-current-state | 8 |
| webhook-to-respond-convert | 2 |
