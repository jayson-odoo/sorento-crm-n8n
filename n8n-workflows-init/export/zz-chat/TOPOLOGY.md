# TOPOLOGY — zz-chat  (`oyYfVvZHRZpWubTy`)

- versionId **581ccc65-7e35-40c4-bcaf-3506721d1f78** · activeVersionId **581ccc65-7e35-40c4-bcaf-3506721d1f78** · DRAFT == ACTIVE
- 13 nodes

## Edges
_13 edge groups_

```
build-item[0] -> clear-q
call-dispatch[0] -> read-list
chat[0] -> if-has-file
clear-lock[0] -> clear-ready
clear-q[0] -> clear-lock
clear-ready[0] -> push-queue
del-list[0] -> format-out
extract-audio-b64[0] -> build-item
if-has-file[0] -> extract-audio-b64
if-has-file[1] -> build-item
push-queue[0] -> push-ready
push-ready[0] -> call-dispatch
read-list[0] -> del-list
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **build-item** ← clear-lock, clear-q, del-list, push-queue, push-ready, read-list
- **chat** ← build-item
- **extract-audio-b64** ← build-item
- **read-list** ← format-out

## Zero inbound (orphaned / triggers)

- chat

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| call-dispatch | `2D0cw2Y1aPW2LOlU` | zz-dispatcher-test |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| clear-lock | redis | sorento-redis |
| clear-q | redis | sorento-redis |
| clear-ready | redis | sorento-redis |
| del-list | redis | sorento-redis |
| push-queue | redis | sorento-redis |
| push-ready | redis | sorento-redis |
| read-list | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| build-item | 69 |
| format-out | 42 |
