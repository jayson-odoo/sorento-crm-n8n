# TOPOLOGY — ht-sweeper  (`UmmjvYRl0h2GXd19`)

- versionId **11c55d58-8c11-4195-9949-a0163f5d0ffc** · activeVersionId **11c55d58-8c11-4195-9949-a0163f5d0ffc** · DRAFT == ACTIVE
- 22 nodes

## Edges
_21 edge groups_

```
Schedule Trigger[0] -> ht-sweep-enabled
ht-armed?[0] -> ht-sweep-timeout
ht-armed?[1] -> ht-sweep-idle
ht-carry-clear[0] -> ht-forget
ht-carry-contact[0] -> ht-recheck-stamp
ht-classify[0] -> ht-skip?
ht-clear-flag[0] -> ht-carry-clear
ht-findcontact[0] -> ht-carry-contact
ht-flag-still-true?[0] -> ht-clear-flag
ht-flag-still-true?[1] -> ht-forget-silent
ht-forget[0] -> ht-timeout-notice
ht-recheck-stamp[0] -> ht-classify
ht-skip?[0] -> ht-skip
ht-skip?[1] -> ht-flag-still-true?
ht-sweep-armed[0] -> ht-armed?
ht-sweep-census[0] -> ht-sweep-fanout
ht-sweep-enabled[0] -> ht-sweep-armed
ht-sweep-fanout[0] -> ht-findcontact
ht-sweep-keys[0] -> ht-sweep-census
ht-sweep-pilot[0] -> ht-sweep-keys
ht-sweep-timeout[0] -> ht-sweep-pilot
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **ht-classify** ← ht-carry-clear

## Zero inbound (orphaned / triggers)

- Schedule Trigger

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| ht-findcontact | `D62_NHUOrugeULSFwfjEJ` | sorento-sub-respond-findcontact-respond |
| ht-timeout-notice | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| ht-clear-flag | respondIoApi | sorento-api |
| ht-forget | redis | sorento-redis |
| ht-forget-silent | redis | sorento-redis |
| ht-recheck-stamp | redis | sorento-redis |
| ht-sweep-enabled | redis | sorento-redis |
| ht-sweep-keys | redis | sorento-redis |
| ht-sweep-pilot | redis | sorento-redis |
| ht-sweep-timeout | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| ht-classify | 169 |
| ht-sweep-census | 138 |
| ht-carry-contact | 134 |
| ht-carry-clear | 94 |
| ht-sweep-armed | 51 |
| ht-sweep-fanout | 24 |
