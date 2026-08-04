# TOPOLOGY — sorento-dispatcher  (`77SG9jTdVKhwMwvR`)

- versionId **32315a54-c109-4a21-9a32-edb97aca76e8** · activeVersionId **32315a54-c109-4a21-9a32-edb97aca76e8** · DRAFT == ACTIVE
- 15 nodes

## Edges
_19 edge groups_

```
Schedule Trigger[0] -> pop-ready-contacts
acquired?[0] -> call-spine
acquired?[1] -> rearm-lost
call-spine[0] -> del-lock
call-spine[1] -> del-lock
del-lock[0] -> llen-q
get-lock[0] -> lock-free?
has-contact?[0] -> get-lock
has-contact?[1] -> done
incr-lock[0] -> acquired?
llen-q[0] -> more-in-queue?
lock-free?[0] -> incr-lock
lock-free?[1] -> rearm-busy
more-in-queue?[0] -> rearm-more
more-in-queue?[1] -> done
pop-ready-contacts[0] -> has-contact?
rearm-busy[0] -> done
rearm-lost[0] -> done
rearm-more[0] -> done
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **pop-ready-contacts** ← call-spine, del-lock, get-lock, incr-lock, llen-q, rearm-busy, rearm-lost, rearm-more

## Zero inbound (orphaned / triggers)

- Schedule Trigger

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| call-spine | `9qVyfUxmRQqrpGRMDLRuz` | sorento-consume-main |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| del-lock | redis | sorento-redis |
| get-lock | redis | sorento-redis |
| incr-lock | redis | sorento-redis |
| llen-q | redis | sorento-redis |
| pop-ready-contacts | redis | sorento-redis |
| rearm-busy | redis | sorento-redis |
| rearm-lost | redis | sorento-redis |
| rearm-more | redis | sorento-redis |
