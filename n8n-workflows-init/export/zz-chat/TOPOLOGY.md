# TOPOLOGY — zz-chat  (`oyYfVvZHRZpWubTy`)

- versionId **7677e752-a612-4866-b461-4aeab031360b** · activeVersionId **7677e752-a612-4866-b461-4aeab031360b** · DRAFT == ACTIVE
- 20 nodes

## Edges
_21 edge groups_

```
build-item[0] -> clear-q
call-dispatch[0] -> read-list
chat[0] -> if-has-file
clear-lock[0] -> clear-ready
clear-q[0] -> clear-lock
clear-ready[0] -> clear-reply
clear-reply[0] -> push-queue
del-list[0] -> format-out
extract-audio-b64[0] -> prep-audio
extract-image-b64[0] -> prep-image
if-file-image[0] -> extract-image-b64
if-file-image[1] -> extract-audio-b64
if-has-file[0] -> if-file-image
if-has-file[1] -> build-item
prep-audio[0] -> store-audio
prep-image[0] -> store-image
push-queue[0] -> push-ready
push-ready[0] -> call-dispatch
read-list[0] -> del-list
store-audio[0] -> build-item
store-image[0] -> build-item
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **build-item** ← clear-lock, clear-q, clear-reply, del-list, push-queue, push-ready, read-list
- **chat** ← build-item, prep-audio, prep-image
- **prep-audio** ← build-item
- **prep-image** ← build-item
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
| clear-reply | redis | sorento-redis |
| del-list | redis | sorento-redis |
| push-queue | redis | sorento-redis |
| push-ready | redis | sorento-redis |
| read-list | redis | sorento-redis |
| store-audio | redis | sorento-redis |
| store-image | redis | sorento-redis |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| build-item | 83 |
| format-out | 42 |
| prep-audio | 27 |
| prep-image | 25 |
