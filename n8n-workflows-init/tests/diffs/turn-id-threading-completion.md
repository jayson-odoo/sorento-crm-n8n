# Node diff — turn-id-threading-completion (cycle 2 build)

**Change id:** `turn-id-threading-completion`
**Plan:** `plans/turn-id-threading-completion.md` (REV 2, authoritative)
**Built:** 2026-07-21
**Nothing live was edited or published.** All edits are on clones/forks. No executions were run.

> **DIFF RULE:** UI Duplicate regenerated ALL node ids on both ingress clones. Diff clone ↔ live by
> **NODE NAME**, not node id. The plan's §7.6 reference to live id `0204df88` corresponds to
> `99a4175e` on the INJECT clone and `e91849d6` on the main clone.

---

## 0. Artifact inventory

| artifact | id | state after this build |
|---|---|---|
| **NEW** `zz-sub-sendmsg-STANDIN` (H2 stand-in) | `lJ4IZEGwoTh6aay4` | created + **published** (`19313cc1`) |
| **NEW (cycle 2b)** `zz-sub-sendmsg-BLOBTEST` (H2 stand-in **with** save blobs) | `69RhomhiCH4bpY1w` | created + **published**; **cycle 2c: re-edited + re-published (`86cc9542`)** — see §STEP 0b, §STEP 6 |
| `sorento-main-INJECT TEST` (clone) | `4kfNkL6afjidbP4D` | edited (**+ cycle 2c §STEP 7**); `active=false`, `activeVersionId=null` |
| `sorento-main TEST` (clone) | `ucf8g8sON5n4v0ry` | edited (**+ cycle 2c §STEP 7**); `active=false`, `activeVersionId=null` |
| `sorento-consume-main TEST` (spine clone) | `txiPzSxy3Pclsz6v` | edited + published (`394082d4`) — untouched in cycle 2c |
| `sub-human-intervention TEST (delta3)` (HI fork) | `vUfFUDjLAuMaeQE6` | edited + published (`c41e1c7e`) — untouched in cycle 2c |
| `sub-sendmsg-OBS` (sendmsg fork) | `sJI3DbsLCG01JfRs` | edited — **DRAFT ONLY, never published** (see §H4, §STEP 6). **Cycle 2d: DEMOTED — not the H4 promote source; BLOBTEST is (§9.2). ARCHIVE after P2.** |
| `sub-respond-save-message-redis TEST` (sink) | `tWm5DYLxfypmVC1T` | unchanged (already declares `turn_id`) |

**Untouched live artifacts (confirmed):** `9qVyfUxmRQqrpGRMDLRuz`, `aoydkG1dbItXR5jXFEQsP`,
`rrYXzE61gCNUck_zmXe-G`, `UrETd-jm46tFj3Xw7w8vL`, `NwMOBEQ1NW7LVky5`, `sk0zN90Cas4Y6Y2w`,
`-WkzJMQZHmsFQm6A2abLJ`, `ss9S83XF7ZtmnaUyFtYZc`.

---

## STEP 0 — H2 zero-credential sendmsg stand-in (NEW workflow `lJ4IZEGwoTh6aay4`)

**Intent:** give every test caller of the sendmsg sub a target that is *structurally* incapable of
egress, rather than one gated by a flag or a runtime pin (reviewer H2; UAC §0 S8-as-amended).

Three nodes, zero credentialed egress nodes:

| node | type | purpose |
|---|---|---|
| `When Executed by Another Workflow` | `executeWorkflowTrigger` v1.2 | declares the **full 10-input surface** of `aoydkG1dbItXR5jXFEQsP`, byte-for-byte in the same order and with the same types: `contact_identifer`(any), `message`, `quick_reply`, `input_message`, `test_run_id`, `started_at`, `contact`(object), `result_set`(array), `is_test`(boolean), `turn_id` |
| `record-would-send` | `code` v2 | builds the would-send record incl. `turn_id`, and a synthetic `messageId` |
| `push-egress-log` | `redis` v1 (`sorento-redis` `H5w6o7tptzTPMVdy`) | RPUSH to `=test:egress:{{ …test_run_id }}` |

**Explicitly absent (assert from JSON before any run):** no `@respond-io/n8n-nodes-respond-io.respondio`,
no `n8n-nodes-base.httpRequest`, no `@n8n/n8n-nodes-langchain.memoryPostgresChat`, no
`executeWorkflow` node at all — so no call to `UrETd-jm46tFj3Xw7w8vL`.

Emitted item shape (mimics a completed send so a caller reading the sub's return is not surprised):
`{guard:'sendmsg-standin', kind:'would_send', target, payload{…all 10 inputs…}, test_run_id, turn_id, ts, messageId}`.

**Reviewer note:** `turn_id` is recorded at BOTH top level and inside `payload`, so V-T-b
(turn_id ≠ HI's own exec id ≠ sendmsg's own exec id) is assertable straight off the egress log.

---

## STEP 0b — B2 RESOLVED: the 4th fork, zero-credential **AND** blob-retaining (`69RhomhiCH4bpY1w`)

**User decision (option 1), 2026-07-21:** build a sendmsg fork that is *both* zero-credential *and*
retains the save blobs, so §OBS-9/10/11 can assert `turn_id` inside a **rendered save blob**, not
merely that it reached the sub. This closes blocker **B2** and supersedes the STANDIN for those cases.

**Built from** `sJI3DbsLCG01JfRs` (`sub-sendmsg-OBS`) **draft**, which already carries C2 (`turn_id`
trigger input), C3 (`turn_id` + messageId-derived `sent_at` in both blobs) and **H4** (`contact?.`
guards). Because the OBS *draft* was the source, **H4 is inherited by this fork** even though the
OBS publish was denied — so §OBS-14 becomes runnable here without B1 being resolved.

> **Method note.** MCP cannot duplicate a workflow (LESSONS §3) and REST is barred by the security
> rule. The fork was therefore built in two phases: `create_workflow_from_code` for the graph shape,
> then ONE atomic `update_workflow` of 5 `updateNodeParameters {replace:true}` ops carrying the
> **exact** parameter objects. Phase 2 exists specifically to avoid SDK/`expr()` quoting drift on the
> four load-bearing strings (LESSONS §25). All were byte-verified against the source on re-fetch.

### Node inventory (11 nodes)

| node | type | vs `sub-sendmsg-OBS` |
|---|---|---|
| `When Executed by Another Workflow` | `executeWorkflowTrigger` v1.1 | **identical** — same 10 inputs, same order, same types (`contact_identifer` any, `contact` object, `result_set` array, `is_test` boolean, `turn_id` untyped) |
| `test-guard` | `if` v2.3 | **identical** (KEPT per task item 6) |
| `test-guard-record` | `redis` v1 | **identical** (KEPT per task item 6) — `messageData` byte-verified incl. the `turn_id ?? null` line |
| `If` | `if` v2.3 | identical (quick_reply empty gate) |
| `Code in JavaScript` | `code` v2 | `jsCode` **byte-identical**, incl. trailing whitespace (`const parts = [];   `, `},    `) and the `→` in the comment |
| `If1` | `if` v2.3 | identical |
| `Loop Over Items` | `splitInBatches` v3 | identical |
| **`Send a Message`** | **`code` v2** | ⚠️ **REPLACED** — was `@respond-io/…respondio` (credentialed) |
| **`HTTP Request`** | **`code` v2** | ⚠️ **REPLACED** — was `n8n-nodes-base.httpRequest` |
| `Call 'sub-respond-save-message-redis'1` | `executeWorkflow` v1.3 | **blob byte-identical**, target `tWm5DYLxfypmVC1T` |
| `Call 'sub-respond-save-message-redis' (quick_reply)` | `executeWorkflow` v1.3 | **blob byte-identical**, target `tWm5DYLxfypmVC1T` |

### (a) `Send a Message` — name-preserving Code stand-in (task item 1)

Name is preserved **exactly**, so `$('Send a Message').item.json.messageId` — read by the text save
blob for both `sent_at` and `message_id` — resolves in the real node context. `jsCode`:

```js
const cid = $('When Executed by Another Workflow').first().json.contact_identifer ?? null;
return $input.all().map((it, i) => ({ json: { contactId: cid, messageId: Number(String(Date.now()) + String(i).padStart(3, '0')) }, pairedItem: { item: i } }));
```

Output shape matches the real respond.io return (`{"contactId":423729104,"messageId":1784593772234503}`):
`contactId` from `contact_identifer`, `messageId` a **16-digit microsecond-epoch integer**
(13-digit `Date.now()` + a 3-digit per-item suffix). So `Math.floor(messageId / 1000)` yields a sane
epoch-ms `sent_at`, exactly as C3 intends. 1.78e15 is well inside `Number.MAX_SAFE_INTEGER`
(9.007e15), so no precision loss. `pairedItem` is set so the save node's `.item` resolves per loop
iteration.

### (b) `HTTP Request` — name-preserving Code stand-in (task item 2)

Identical `jsCode`. Confirmed from live exec `9347803` that the respond.io quick_reply POST really
does return `messageId`, so the stand-in is faithful and the quick_reply blob's
`$('HTTP Request').item.json.messageId` resolves.

### (c) Zero credentialed egress nodes (task item 3)

`create_workflow_from_code` reported `autoAssignedCredentials`: **exactly one** —
`test-guard-record` → `sorento-redis` (type `redis`). That is required for `test-guard-record` to
function, is not an egress path, and is the same binding the STANDIN carries. **No auto-bind occurred
on any other node**, and the subsequent `update_workflow` calls returned
`autoAssignedCredentials: []`. No respondio / httpRequest / memoryPostgresChat node was ever created,
so there was nothing for the classifier to arm.

### (d) Both save calls KEPT, pointed at the TEST sink (task item 4)

Both `executeWorkflow` nodes target **`tWm5DYLxfypmVC1T`** (`sub-respond-save-message-redis TEST`),
**not** live `UrETd-jm46tFj3Xw7w8vL`. Blobs are unchanged from the OBS fork draft — they are the
thing under test. Both retain `"turn_id": …turn_id ?? null` and the C3 `sent_at` ternary; both
carry H4's `contact?.phone` / `contact?.firstName` / `contact?.lastName`. The two blobs' *differing*
opening whitespace is preserved (`JSON.stringify(\n  {\n    "contact_id"` on the text node vs
`JSON.stringify({\n  "contact_id"` on the quick_reply node).

### (e) `Chat Memory Manager` / `Postgres Chat Memory1` — REMOVED (task item 5)

**Removed, not retained.** Justification for the choice the task left open: neither sits on the
loop-back edge, so removal cannot break the loop.
- `Chat Memory Manager` was a terminal leaf on `Loop Over Items` output **0** (the *done* branch) and
  one of two parallel targets of `HTTP Request`. Both are pure sinks.
- `Postgres Chat Memory1` (`memoryPostgresChat`) attached only via `ai_memory` to that manager, and
  is an explicitly banned type — retaining it means a live Postgres write is reachable.

The loop-bearing path is untouched: `Loop Over Items`[1] → `Send a Message` →
`Call '…redis'1` → **back to `Loop Over Items`**. Verified present on re-fetch. The only shape change
is `Loop Over Items` output 0 now being empty (`"main":[[],[…]]`) — a terminating done-branch, which
is correct.

Also removed: the pre-existing **disabled** dead-end chain `Wait` → `Find a Message` → `Switch1` →
`Send Template`. Three of those four are `respondio` nodes; disabled or not, they are banned types
and would have failed the S8 structural check.

### (f) Verification — re-fetched JSON after publish

| assertion | result |
|---|---|
| zero nodes of type `@respond-io/n8n-nodes-respond-io.respondio` | **PASS** |
| zero nodes of type `n8n-nodes-base.httpRequest` | **PASS** |
| zero nodes of type `@n8n/n8n-nodes-langchain.memoryPostgresChat` | **PASS** (also zero `memoryManager`) |
| both save calls target `tWm5DYLxfypmVC1T` | **PASS** |
| `Send a Message` exists, type `n8n-nodes-base.code`, exact name | **PASS** |
| `HTTP Request` exists, type `n8n-nodes-base.code`, exact name | **PASS** |
| no `credentials` block on any node | **PASS, but see caveat** |
| `test-guard` + `test-guard-record` intact | **PASS** |
| published (`versionId == activeVersionId == 4f80648c`) | **PASS** |

> ⚠️ **Caveat on the credentials assertion — read this before scoring it.** MCP
> `get_workflow_details` **redacts credentials entirely**: `sub-sendmsg-OBS` and
> `zz-sub-sendmsg-STANDIN` both show **no** `credentials` block on any node despite demonstrably
> carrying bound credentials (OBS's armed `sorento-api`; the STANDIN's `sorento-redis`). So "no
> credentials block appears" is **vacuously true on this surface for every workflow** and is NOT
> evidence of anything. The decisive check is **node type**, which is what S8 has been rewritten to
> assert (§STEP 5b). Do not treat the redacted field as a passing safety gate.

---

## STEP 1 — fidelity fix, `ucf8g8sON5n4v0ry` only

| node | leaf | before | after |
|---|---|---|---|
| `in-failover?` (id `7510ec67`) | `/parameters/conditions/options/typeValidation` | `"strict"` | **`"loose"`** |

**Why.** The clone was UI-Duplicated from `sorento-main`'s **unpublished DRAFT**, which carries an
unowned `strict` delta (plan §7.6). PRODUCTION runs the **active** version `952fc09a`, which is
`loose`. Left uncorrected, the clone would have been a faithful mirror of a version that has never
served a request — and Hop 3 would have been UAC'd against the wrong graph. This restores
clone ≡ production. It does **not** endorse or pre-empt §7.6's option (a) publish on live; that
remains a separate, user-gated live action.

---

## STEP 2 — per-clone containment guards (ONE atomic `update_workflow` per clone)

Applied identically to both clones except where noted. INJECT = `4kfNkL6afjidbP4D`,
main = `ucf8g8sON5n4v0ry`.

### (a) Orphan `Redis2` — the prod-queue injection path

| clone | node | change |
|---|---|---|
| INJECT | `Redis2` (`7d269fbc`) | connection `If`[0] → `Redis2` **REMOVED** |
| main | `Redis2` (`1e51f7ce`) | connection `If`[0] → `Redis2` **REMOVED** |

`Redis2` is the sole push to the prod list `main-message-list`; a stray push injects a synthetic
message into the real spine. It now has zero inbound connections on both clones. Hop 3 uses `If`
output **1**, which is untouched by this removal.

**Additional hardening — DEVIATION, see §Deviations D1.** The checklist's "orphan it" and the
pre-handoff assertion "no node has `parameters.list == "main-message-list"`" are in tension:
orphaning leaves the literal in the JSON, and the first assertion run FAILED on exactly that. Both
are now satisfied — the node stays orphaned **and** its list literal is repointed:

| clone | node | leaf | before | after |
|---|---|---|---|---|
| both | `Redis2` | `/parameters/list` | `"main-message-list"` | `"zz-dead-main-message-list-TEST"` |

Chosen literal is deliberately **not** `main-message-list-test` — that list IS consumed (spine clone
+ replay orchestrator, LESSONS §30), so repointing there would have swapped one injection path for
another. `zz-dead-main-message-list-TEST` has no consumer.

### (b) Repoint the sendmsg caller + add test flags

Node `Call 'sorento-sub-respond-sendmsg-respond'` — INJECT `99a4175e`, main `e91849d6`.

| leaf | before | after |
|---|---|---|
| `/parameters/workflowId` | `aoydkG1dbItXR5jXFEQsP` (**LIVE sendmsg**) | `lJ4IZEGwoTh6aay4` (STANDIN) → **`69RhomhiCH4bpY1w`** (BLOBTEST, cycle 2c §STEP 7) |
| `/parameters/workflowInputs/value` | 2 keys | 6 keys (below) |
| `/parameters/workflowInputs/schema` | 6 entries, `is_test` absent | 10 entries, `is_test` + `turn_id` present, `removed:false` |

`workflowInputs.value` after (identical on both clones):
```
contact_identifer : ={{ $('consolidate').first().json.contact.id }}          (unchanged)
message           : Each contact is only allowed to send MAXIMUM 10 …        (unchanged, literal)
test_run_id       : ={{ $('When Executed by Another Workflow').isExecuted ? ($('When Executed by Another Workflow').first().json.test_run_id || $execution.id) : $execution.id }}
contact           : ={{ $('If1').first().json }}                             (plan §2.3.4 op 3d)
is_test           : ={{ true }}
turn_id           : ={{ $execution.id }}                                     (plan §2.3.4 op 3d)
```

**Schema verified post-save** (the checklist's stated hazard — a value key absent from the cached
schema array can be filtered on save). Confirmed present after re-fetch:
`is_test` → `removed:false`, `type:"boolean"`; `turn_id` → `removed:false`.
`quick_reply`/`input_message`/`started_at`/`result_set` remain `removed:true` (unchanged).

`test_run_id` expression rationale: honours a seeded `test_run_id` when the clone is driven through
its `executeWorkflowTrigger`, and falls back to `$execution.id` when driven via `test_workflow` or
the webhook, so the egress list key is always resolvable by the tester. The `.isExecuted` guard
mirrors the C1 precedent (`$('tf-message').isExecuted`).

**`turn_id` + `contact` (op 3d) — DEVIATION, see §Deviations D2.** STEP 2b of the checklist named
only `is_test` + `test_run_id`. Op 3d of plan §2.3.4 is nonetheless implemented here, because
without it the outgoing half of the rate-limit turn carries no `turn_id` and **§OBS-15 assertion 2 /
V-T-j / V-T-k cannot pass** — the build would be untestable against its own acceptance criterion.
`contact` uses the exact expression form the HI fork's three sendmsg callers already use for the
same key under `convertFieldsToString: true` (`={{ $('…').first().json }}` — not a stringify),
per the plan's build caution. V-T-k must still confirm empirically that it arrives as an object.

### (c) Namespace the rate-limit INCR key — real cross-contamination path

| clone | node | leaf | before | after |
|---|---|---|---|---|
| INJECT | `Redis1` (`12370ce9`) | `/parameters/key` | `="{{ $('If1').first().json.id }}"` | `=test:rl:{{ $('If1').first().json.id }}` |
| main | `Redis1` (`78dbc820`) | `/parameters/key` | `="{{ $('If1').first().json.id }}"` | `=test:rl:{{ $('If1').first().json.id }}` |

Unnamespaced, a test run INCRs the **same counter a live customer is rate-limited against** — both
live ingress workflows INCR the bare contact id in one shared namespace (plan §2.4). A burst of test
runs could therefore rate-limit a real customer. `operation:incr`, `expire:true`, `ttl:1` unchanged.

**Safe by construction downstream:** `If` reads `{{ $json[$json.keys()[0]] }}` — the first key of the
Redis output whatever it is named — so renaming the key does not affect the gate. Note the rename
also drops the literal `"` quoting that the original key carried.

### (d) Delete `Respond.io Trigger` — **main clone only**

| node | change |
|---|---|
| `Respond.io Trigger` (`5c307885`, `@respond-io/n8n-nodes-respond-io.respondioTrigger`) | connection → `consolidate` removed, then node **DELETED** |

Deleted, not merely disabled: on activation this node subscribes the **shared** respond.io
credential to the real event stream, which would pull live customer traffic into the clone.
Deletion removes the capability rather than gating it. Post-fetch: zero `respondioTrigger` nodes on
either clone. (INJECT never had one.)

### (e) Retag both Webhook nodes

| clone | node | leaf | before | after |
|---|---|---|---|---|
| INJECT | `Webhook` (`bf01581c`) | `/parameters/path` | `a41d0d4e-91b1-4fae-9360-f91517d95bf1` | `zz-test-inject-a41d0d4e-91b1-4fae-9360-f91517d95bf1` |
| main | `Webhook` (`55e0669b`) | `/parameters/path` | `fdd4fe8a-e8eb-4a30-a394-d07d1c1bf6e8` | `zz-test-main-fdd4fe8a-e8eb-4a30-a394-d07d1c1bf6e8` |

The clones inherited the *live* webhook paths. Any external caller (or leftover respond.io
configuration) hitting the original path would have driven the clone. Retagging makes the clone URLs
non-colliding and self-identifying. `webhookId` is left untouched — the path is what forms the URL.

### (f) Hop 3 — `save-ratelimit-incoming` (NEW node on both clones)

**New node** `save-ratelimit-incoming` — `n8n-nodes-base.executeWorkflow` typeVersion `1.3`,
target **`tWm5DYLxfypmVC1T`** (the TEST sink, **NOT** live `UrETd-jm46tFj3Xw7w8vL`).
INJECT id `a5100001-…-0001` @ `[336,1760]`, main id `a5100002-…-0002` @ `[1008,1760]`.

**Connection rewire (per plan §2.3.4 ops 3b/3c), both clones:**

| # | change |
|---|---|
| 1 | `If`[1] → `Call 'sorento-sub-respond-sendmsg-respond'` **REMOVED** |
| 2 | `If`[1] → `save-ratelimit-incoming` **ADDED** |
| 3 | `save-ratelimit-incoming` → `Call 'sorento-sub-respond-sendmsg-respond'` **ADDED** |

Resulting shape (verified post-fetch, identical on both):
`If.main = [null, [save-ratelimit-incoming]]` and
`save-ratelimit-incoming.main = [[Call 'sorento-sub-respond-sendmsg-respond']]`.

Order is **save-then-send**, per plan §2.3.4: it puts the rows in chronological order, means a send
failure still leaves the incoming recorded, and makes `$execution.id` trivially identical for both
rows (same execution).

**Top-level inputs** (decorative per reviewer F6 — the sink forwards only `{{ $json.data }}`;
retained for shape parity with the spine's C1, **do not "tidy" them away**):
```
contact_id   : ={{ $('If1').first().json.id }}
phone_number : ={{ $('If1').first().json.phone }}
message      : ={{ $('consolidate').first().json.message.message.text }}
sent_at      : ={{ new Date().getTime() }}
turn_id      : ={{ $execution.id }}
```

**`data` blob (load-bearing), byte-identical on both clones:**
```
={{ JSON.stringify({
  "contact_id": `${$('If1').first().json.id}`,
  "phone_number": $('If1').first().json.phone,
  "message": $('consolidate').first().json.message.message.text,
  "sent_at": $('consolidate').first().json.message.messageId
             ? Math.floor($('consolidate').first().json.message.messageId / 1000)
             : new Date().getTime(),
  "first_name": $('If1').first().json.firstName,
  "last_name": $('If1').first().json.lastName,
  "reply_to_message_id": $('consolidate').first().json.message.replyTo?.id ?? null,
  "reply_to_message": $('consolidate').first().json.message.replyTo?.message?.text ?? null,
  "type": "incoming",
  "message_id": `${$('consolidate').first().json.message.messageId}`,
  "turn_id": `${$execution.id}`
}) }}
```

**Node-reference substitution (plan §2.3.2) — the load-bearing correctness claim.**
`messageId` is **NOT** at `$('tf-message')` here; `tf-message` is spine-only. The plan's established
equivalences are used verbatim:
- `$('tf-message').first().json` (spine) ≡ **`$('consolidate').first().json`** (ingress)
- `$('sorento-sub-respond-findcontact-respond').first().json` (spine) ≡ **`$('If1').first().json`** (ingress)

`If1` runs upstream of `Redis1`/`If`, so it is available on the rate-limited branch — this is what
makes Hop 3 cheap. Both substitutions verified against the clone graphs.

Deliberate deviations from C1, carried from plan §2.3.4 (do **not** "fix" in review):
- `message` is a straight text read, not C1's degenerate ternary (whose fallbacks exist for the
  spine's voice/attachment paths, which cannot occur here). Attachment-only rate-limited messages
  store `undefined` — accepted, tracked as **V-T-m**.
- `sent_at` mirrors C1's `messageId / 1000` **exactly**. `messageId` is microseconds, so this yields
  ms (== the body's own `timestamp`). Mirroring C1 byte-for-byte is the point: incoming rows from
  both paths agree by construction. **Do not "correct" the units** — that is a separate,
  CRM-coordinated change.

Schema array declares all six sink inputs (`contact_id`, `phone_number`, `message`, `sent_at`,
`turn_id`, `data`) with `removed:false`. Sink `tWm5DYLxfypmVC1T` verified to declare all six and to
be published (`versionId == activeVersionId == ce78408e`).

---

## STEP 3 — Hop 1: spine clone → HI fork → sendmsg

### 3.1 Spine clone `txiPzSxy3Pclsz6v` (published `394082d4`)

| node | leaf | change |
|---|---|---|
| `Call 'sub-human-intervention'` (`133fcc06`) | `/parameters/workflowInputs/value/turn_id` | **ADDED** `={{ $execution.id }}` |

Param-only, additive, zero connection changes. All 9 pre-existing keys untouched.
Value form is identical to the 8 sendmsg callers, so incoming and outgoing agree by construction.

> ⚠️ **PROMOTE WARNING (plan §10 step 4).** This clone node also carries `is_test: true`. When 1a is
> promoted to live `9qVyfUxmRQqrpGRMDLRuz`, promote **only the single `turn_id` leaf** via
> `setNodeParameter`. **Never copy this clone's `workflowInputs.value` wholesale** — injecting
> `is_test: true` into live sends `test-guard` TRUE on production traffic: every reply recorded and
> never sent, a total outage of the reply path.

Schema note: `turn_id` was added to `value` only, not to the caller's cached `schema` array (a
`/schema/-` append is unsupported by this MCP surface). Verified persisted after save. This matches
the C1 precedent, which has `turn_id` in `value`, absent from `schema`, and works.

### 3.2 HI fork `vUfFUDjLAuMaeQE6` (published `e253c7b2`)

**Trigger input declaration** — `When Executed by Another Workflow` (`9c94bf98`):

| leaf | change |
|---|---|
| `/parameters/workflowInputs/values` | appended 13th entry **`{"name": "turn_id"}`** |

**Untyped**, per cycle-1 finding F4 (settled at exec `9392400`: an untyped input renders JSON `null`
when unmapped; `type:"any"` was explicitly rejected). Additive — the 12 existing entries are
byte-identical and existing callers that omit `turn_id` pass `undefined`.

**All three sendmsg callers** — each gains one key:

| node | id | added to `workflowInputs.value` |
|---|---|---|
| `sorento-sub-respond-sendmsg-respond-routed-to-pic2` | `a1ea185e` | `turn_id: ={{ $('When Executed by Another Workflow').first().json.turn_id }}` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic1` | `c5dd9961` | same |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic` | `0ca5413f` | same |

This is a copy of the pattern all three already use for `test_run_id` / `started_at` / `contact`.
All other keys byte-identical. **V-T-c** is satisfiable by static read of this fork.

**SAFETY REPOINT of the same three callers — DEVIATION, see §Deviations D3:**

| leaf | before | after (cycle 2) | **after (cycle 2b, current)** |
|---|---|---|---|
| `/parameters/workflowId` (×3) | `aoydkG1dbItXR5jXFEQsP` (**LIVE, credentialed**) | `lJ4IZEGwoTh6aay4` (STANDIN) | **`69RhomhiCH4bpY1w`** (BLOBTEST) |

**Cycle-2b repoint (this task).** All three callers — `sorento-sub-respond-sendmsg-respond-routed-to-pic`
(`0ca5413f`), `-pic1` (`c5dd9961`), `-pic2` (`a1ea185e`) — were repointed from the STANDIN to the
**BLOBTEST** fork so §OBS-9/10/11 exercise the **save-blob path** and can assert `turn_id` inside a
rendered blob (B2). `is_test` handling is unchanged, as are all other input keys including
`turn_id: ={{ $('When Executed by Another Workflow').first().json.turn_id }}`.

**Published** — HI fork now at `c41e1c7e` (was `e253c7b2`). The LESSONS §24 draft-vs-active gate was
run immediately before publishing: across all 18 nodes the **only** delta was the three `workflowId`
leaves above, and the `connections` object was byte-identical. No foreign draft content shipped.

> Note the three callers keep `onError: "continueErrorOutput"`, so a stand-in failure surfaces as an
> error branch rather than a silent pass — useful for the tester.

Not in the checklist, but required by plan §OBS-9 ("all three sendmsg callers repointed to the
H2-instrumented sendmsg fork") and by the hard safety rule. §OBS-9/10/11 run this fork **guard-open
at `is_test:false`**; pointed at the live sub those runs are **real WhatsApp sends to a real
contact**. Harmless to the guard-closed spine-clone path (`test-guard` TRUE dead-ends before these
nodes ever run).

**Build-only instrumentation** — `test-guard-record` (`afe432e5`), for §OBS-8:

| leaf | change |
|---|---|
| `/parameters/messageData` | added one line `"turn_id": {{ JSON.stringify($('When Executed by Another Workflow').first().json.turn_id ?? null) }},` |

Placed immediately before the existing `test_run_id` line; every other line byte-identical. This is
what lets §OBS-8 assert `turn_id` === the spine execution id from the egress record while the guard
is **closed**. **STRIP BEFORE PROMOTE** — this fork is not a promote source, but flagging per
plan §9.2.

---

## STEP 4 — hunk **H4** (SEPARATELY LABELLED — reviewer may reject this hunk alone)

> ⚠️ **AMENDED BY cycle 2c §STEP 6 — read that section with this one.** As written below, H4 was
> incomplete: optional chaining alone yields `undefined`, which `JSON.stringify` **drops**, so
> contactless rows omitted `phone_number`/`first_name`/`last_name` instead of rendering JSON `null`
> (tester F2). §STEP 6 adds `?? null` to all six blob sites on **both** forks. The hunk's promote
> text is now "`contact?.X ?? null`", not "`contact?.X`".

> **REJECTING H4 BREAKS NOTHING ELSE IN THIS DIFF.** Hop 1 (§STEP 3) and Hop 3 (§STEP 2f) are both
> independent of it — Hop 1 because HI callers #9–#11 already pass `contact`, Hop 3 because op 3d
> now passes a real `contact` object from `$('If1')` (plan §2.3.3 decoupling). H4 is the only hunk
> here that changes **row volume** rather than row content.

**Target:** `sJI3DbsLCG01JfRs` (`sub-sendmsg-OBS`) — the sendmsg fork used for testing. See
§Deviations **D4** for why this target and not the STANDIN.

**Change:** optional-chain the three contact dereferences in **both** save blobs. **8 sites**, matching
reviewer F5's count (3 in each `data` blob + the top-level `phone_number` on each of the 2 nodes):

| node | id | leaf | before | after |
|---|---|---|---|---|
| `Call 'sub-respond-save-message-redis'1` | `1e52dd57` | `/workflowInputs/value/phone_number` | `…json.contact.phone` | `…json.contact?.phone` |
| `Call 'sub-respond-save-message-redis'1` | `1e52dd57` | `/workflowInputs/value/data` | `contact.phone`, `contact.firstName`, `contact.lastName` | `contact?.phone`, `contact?.firstName`, `contact?.lastName` |
| `Call 'sub-respond-save-message-redis' (quick_reply)` | `b2467204` | `/workflowInputs/value/phone_number` | `…json.contact.phone` | `…json.contact?.phone` |
| `Call 'sub-respond-save-message-redis' (quick_reply)` | `b2467204` | `/workflowInputs/value/data` | `contact.phone`, `contact.firstName`, `contact.lastName` | `contact?.phone`, `contact?.firstName`, `contact?.lastName` |

**Every other character of both blobs is byte-identical** — including the two blobs' differing
opening whitespace (`JSON.stringify(\n  {\n    "contact_id"` on node 1 vs `JSON.stringify({\n  "contact_id"`
on node 2), the `sent_at` ternaries, `turn_id ?? null`, key order, and the `result` / `quick_reply` tails.
The `phone_number` top-level key is included because it is evaluated too and would throw first,
so guarding only the `data` blob would not actually prevent the crash.

**Why it is the lowest-risk edit shape available:** optional chaining cannot break a caller that
currently works — where `contact` exists, behaviour is byte-identical. The contactless set it fixes
is now **#5, #6, #12, #13** (#14/#15 left the set via op 3d).

**Verification:** V-T-f. §OBS-14 asserts a contactless caller produces a complete row rather than
crashing; the control re-runs a contact-bearing input and requires byte-identical blob shape.

---

## STEP 5 — hunk **H1**: `tests/UAC.md` §0 S7 replacement (doc change, no workflow edit)

Old S7 (`LLEN sorento-respond-message` equal before/after) is **withdrawn as unsound** and replaced
by a two-part gate. Both tightenings the reviewer required are written in as binding:

- **S7a — TEST-sink delta is the positive signal.** `LLEN sorento-respond-message-TEST` before/after;
  every expected save must appear, and each new payload must carry the run's own `test_run_id` /
  `turn_id`. **Zero TEST-sink delta when a save is expected is a FAIL** — it means the save went
  somewhere else, possibly prod.
- **S7b — prod-sink delta must be zero, and any non-zero delta must be ATTRIBUTED.** Uses a
  drain-independent counter (consumer execution ledger preferred; LLEN corroborating only).
  - **(a) Non-zero delta → the run HALTS IMMEDIATELY**, worded as binding, not discretionary
    ("do not run the next case, do not note-it-and-continue"). Resumable only after each consumer
    execution in the window is retrieved and attributed to an unrelated producer, with the execution
    id recorded. A payload carrying this run's `test_run_id` / `turn_id` / `message_id` / fixture
    contact → **HARD FAIL, halt the cycle, escalate, do not resume.**
  - **(b) Unretrievable consumer execution → UNATTRIBUTABLE → FAIL.** Explicitly **not**
    inconclusive-pass, not "probably unrelated", not resumable. Absence of evidence is scored as
    failure, because the alternative is a silent prod write scored green.
- **Reporting made mandatory:** every case must record TEST-sink delta, prod-sink delta, and the
  attribution decision + execution ids when non-zero. A case with no S7 line is incomplete.

The stale "⚠️ S7 is unsound as written" advisory block below the checklist is replaced with a
DISCHARGED note clearing plan blocker §7.4.

---

## STEP 5b — `tests/UAC.md` §0 **S8 rewritten** (doc change, no workflow edit) [cycle 2b]

Resolves **B4**. The old S8 named `sub-sendmsg-OBS` as *pin-required*, which is now actively unsafe
advice: that fork fails the H2 structural check, and pinning cannot rescue it.

| | before | after |
|---|---|---|
| mechanism | runtime `pinData` on `Send a Message` + `HTTP Request` | **structural absence of banned node types**, asserted from re-fetched JSON before the run |
| status of pinning | required | **withdrawn** (was "superseded for §OBS-8…14") |
| banned types | — | `@respond-io/…respondio`, `n8n-nodes-base.httpRequest`, `@n8n/n8n-nodes-langchain.memoryPostgresChat` |
| which fork to run | `sub-sendmsg-OBS` | **table added**: BLOBTEST ✅ (use for OBS-9/10/11), STANDIN ✅ (no blobs), **OBS ❌ DO NOT RUN** |
| failure handling | "if pinning cannot be confirmed, do not run" | "a fork failing the check **must not be run at all** — it is not rescuable by pinning" |

Also newly recorded in S8: **MCP `get_workflow_details` redacts credentials**, so a missing
`credentials` block is vacuous and node type is the only sound proxy. The S3 extension is retained,
reworded to "whichever sendmsg fork the case targets".

---

## STEP 6 — **cycle 2c FIX 1**: H4 defect — `?? null` on all six blob contact sites

**Origin:** tester finding **F2** (§OBS-14 scored PASS WITH DEFECT; recommendation REQUEST-CHANGES
on H4 alone).

**The defect.** H4 (§STEP 4) optional-chained the three contact dereferences, which stops the crash
— but `contact?.phone` on a contactless caller evaluates to `undefined`, and **`JSON.stringify`
drops keys whose value is `undefined`**. So a contactless outgoing row did not gain `phone_number` /
`first_name` / `last_name` as JSON `null`; it **omitted those three columns entirely**. §OBS-14
(and UAC OBS-14's stated expectation) requires JSON `null`. The hunk also contradicted itself: the
same object literal writes `"turn_id": … ?? null` one line below.

**The fix.** Append `?? null` to the three contact reads in **both** `data` blobs — **6 sites**
(3 keys × 2 save blobs). No other character of either blob changes.

| node | leaf | before | after |
|---|---|---|---|
| `Call 'sub-respond-save-message-redis'1` | `/workflowInputs/value/data` | `contact?.phone,` · `contact?.firstName,` · `contact?.lastName,` | `contact?.phone ?? null,` · `contact?.firstName ?? null,` · `contact?.lastName ?? null,` |
| `Call 'sub-respond-save-message-redis' (quick_reply)` | `/workflowInputs/value/data` | same three | same three |

**Applied to BOTH forks:**

| workflow | id | state |
|---|---|---|
| `zz-sub-sendmsg-BLOBTEST` (**the artifact under test**) | `69RhomhiCH4bpY1w` | edited + **PUBLISHED** — `versionId == activeVersionId == 86cc9542` |
| `sub-sendmsg-OBS` ~~(promote source-of-record)~~ **DEMOTED cycle 2d — NOT a promote source, see §9.2** | `sJI3DbsLCG01JfRs` | edited **DRAFT ONLY — not published, publish not attempted** (S8 ❌ DO-NOT-RUN; leaving it unpublished is the safer state, per B1). **ARCHIVE after P2.** |

Both forks' blobs were byte-identical before the fix, so both received the identical two
`setNodeParameter` ops and remain byte-identical to each other after it. The promote source
therefore matches the tested artifact.

**Deliberately NOT changed: the top-level `phone_number` input** (`={{ …contact?.phone }}`) on both
save nodes. It is a plain n8n expression, not a `JSON.stringify` argument, so the drop-undefined-key
behaviour does not apply; and per reviewer F6 the sink forwards only `{{ $json.data }}`, making the
top-level key decorative.

> ⚠️ **CORRECTED (cycle 2d, task 3b — reviewer §P2).** This section previously ended
> *"Six sites is the correct count, not eight."* **That sentence is withdrawn — it mis-scopes the
> promote and must not be read as the H4 site count.** Six is the correct count **only of the cycle-2c
> `?? null` delta**. The **H4 hunk as a whole is EIGHT sites**, exactly as §STEP 4 states, and the
> promote must carry all eight:
>
> | where | sites | live `bdb672e6` today | promote to |
> |---|---|---|---|
> | `/workflowInputs/value/phone_number` (top level, both save nodes) | **2** | `contact.phone` | `contact?.phone` — **`?.` only, NO `?? null`** |
> | inside `/workflowInputs/value/data` (3 keys × 2 blobs) | **6** | `contact.phone` / `.firstName` / `.lastName` | `contact?.X ?? null` |
>
> Promoting only the six blob sites ships an H4 that **still throws** on exactly the contactless
> callers (#5/#6/#12/#13) the hunk exists to fix — live's top-level `phone_number` is bare
> `contact.phone` and is evaluated as part of the same `workflowInputs` object. See §STEP 9 for the
> verbatim evidence on both artifacts.

**Publish gate (LESSONS §24) run immediately before publishing BLOBTEST.** Full draft-vs-
`activeVersion` diff across all 11 nodes: the **only** parameter deltas were the two `data` blobs
above, and `connections` was byte-identical. One cosmetic non-delta noted for the reviewer: three
`if` nodes (`test-guard`, `If`, `If1`) carry an empty `"options": {}` in the draft that the prior
active version omitted — an n8n serialization artifact from the cycle-2b `updateNodeParameters`
call, already present in the draft before this task began, functionally inert (the key was
already `{}`). No foreign draft content shipped.

---

## STEP 7 — **cycle 2c FIX 2**: close coverage gap **G1** — repoint both ingress clones to BLOBTEST

**Origin:** tester gap **G1**. Both ingress clones pointed their sendmsg caller at the **STANDIN**
`lJ4IZEGwoTh6aay4`, which has **no save blobs at all**. §OBS-15/16 assertion 2 ("the outgoing half of
the rate-limit turn carries the same `turn_id`") was therefore proven off the **egress record**
rather than off a **rendered outgoing save blob**. V-T-k (contact arrives as an object) was fully
proven either way; what was indirect was only "those fields render populated in the blob".

**One leaf per clone. Nothing else touched.**

| clone | node (name) | node id | leaf | before | after |
|---|---|---|---|---|---|
| `sorento-main-INJECT TEST` `4kfNkL6afjidbP4D` | `Call 'sorento-sub-respond-sendmsg-respond'` | `99a4175e` | `/workflowId` | `lJ4IZEGwoTh6aay4` (STANDIN) | **`69RhomhiCH4bpY1w`** (BLOBTEST) |
| `sorento-main TEST` `ucf8g8sON5n4v0ry` | `Call 'sorento-sub-respond-sendmsg-respond'` | `e91849d6` | `/workflowId` | `lJ4IZEGwoTh6aay4` (STANDIN) | **`69RhomhiCH4bpY1w`** (BLOBTEST) |

The `workflowId` resource-locator object was replaced whole so `cachedResultName` /
`cachedResultUrl` stay consistent with `value` (a stale cached name is a review trap, not a runtime
bug).

**`workflowInputs` untouched on both** — verified byte-identical after the edit. All six keys and the
full 10-entry schema survive:
`contact_identifer`, `message` (literal), `test_run_id` (the `.isExecuted` fallback form), `contact`
(`={{ $('If1').first().json }}`), `is_test` (`={{ true }}`), `turn_id` (`={{ $execution.id }}`).

**Safety: strictly non-decreasing.** BLOBTEST is, like the STANDIN, structurally incapable of egress
(zero nodes of type `respondio` / `httpRequest` / `memoryPostgresChat`; both save calls target the
TEST sink `tWm5DYLxfypmVC1T`, never live `UrETd-jm46tFj3Xw7w8vL`). The swap adds the blob path and
removes nothing. **Neither clone was published** — both remain `active:false` /
`activeVersionId:null`.

**Effect on the retest:** §OBS-15/16 assertion 2 can now be asserted directly off a rendered
outgoing blob at the TEST sink, closing G1. Note the TEST-sink delta per Hop-3 case rises from 1
(incoming only) to **2** (incoming + outgoing) — the S7a expected-count must be updated accordingly,
or a correct run will look like an over-count.

---

## STEP 8 — **cycle 2c FIX 3**: documentation corrections (no workflow edit)

**(a) `plans/turn-id-threading-completion.md` §OBS-11 — corrected to STATIC-COVERAGE-ONLY.**
The plan asserted "callers #9–#11 are then all covered dynamically … all are reachable". Per tester
finding **F1** that is false for `0ca5413f`: it has exactly two inbound edges and **both pass
through the add-comment sub**, so reaching it dynamically requires a **real respond.io PIC comment**
(§0 **S2 violation**). `executeWorkflow` nodes are **unpinnable on this MCP surface** (confirmed via
`prepare_test_pin_data` `nodesSkipped`), so the pin-the-sub escape does not exist. §OBS-11 is now
marked **DO NOT RUN dynamically**, with static coverage recorded as sufficient: the hunk is one
added `workflowInputs.value` key, byte-identical to the keys on `a1ea185e` / `c5dd9961`, both of
which **are** exercised dynamically (§OBS-9 / §OBS-10), and V-T-c already discharges #11 by static
read.

**(b) `docs/LESSONS.md` — new entry 32b, the `setNodeParameter` pointer footgun.**
Per tester finding **F8**: `setNodeParameter` with `path: "/parameters/<key>"` does **not** overwrite
`parameters.<key>` — the JSON pointer is relative to `parameters` already, so it silently creates
`parameters.parameters.<key>`. The op reports success, validation is silent, and a re-fetch shows the
value present — while the node keeps executing the OLD value. Correct form is `/<key>`. Recorded
with the detection tell (a stray `parameters.parameters.*` in the re-fetched node) and the safer
fallback (`updateNodeParameters {replace:true}`). All ops in this cycle use the relative form.

---

## STEP 9 — **cycle 2d**: H4 site-count reconciliation, OBS demotion, and two promoter warnings

**No workflow was edited in cycle 2d. No workflow was published. No execution was run.** This step is
a reconciliation and three record corrections. All evidence below is quoted verbatim from JSON
re-fetched from MCP on 2026-07-21.

### 9.1 The contradiction, RESOLVED — reviewer §P2 and tester §OBS-14 are **both correct**

The reviewer said H4 is 8 sites because the top-level `phone_number` inputs *"EVALUATE FIRST and THROW
when `contact` is absent"*. The tester passed §OBS-14 with a contactless payload against BLOBTEST.
These looked mutually exclusive. They are not — **they are statements about two different artifacts.**

**Evidence A — BLOBTEST `69RhomhiCH4bpY1w` @ `86cc9542`, both save nodes, top-level input, verbatim:**
```
"phone_number":"={{ $('When Executed by Another Workflow').first().json.contact?.phone }}"
```
Present **identically on both** `Call 'sub-respond-save-message-redis'1` (`f2d9c307`) and
`Call 'sub-respond-save-message-redis' (quick_reply)` (`2fc486a2`). **Already optional-chained** —
inherited from the cycle-2 H4 edit (§STEP 4), which did apply all eight sites. It cannot throw.

**Evidence B — LIVE `aoydkG1dbItXR5jXFEQsP` @ `bdb672e6` (draft == active), both save nodes, verbatim:**
```
"phone_number":"={{ $('When Executed by Another Workflow').first().json.contact.phone }}"
```
On `fc0b22ca` (text) and `c2985929` (quick_reply). **Bare — no `?.`.** This is the artifact the
reviewer was describing, and on it the claim is exactly right.

`phone_number` is the **only** top-level input on either node that dereferences `contact`; `contact_id`
reads `contact_identifer`, `message` reads `Loop Over Items` / the trigger `message`, `sent_at` is
`new Date().getTime()`. So the top-level exposure is 2 sites, not more.

**Evidence C — the contactless path DID evaluate the top-level inputs.** §OBS-14 exec `9426323`
(BLOBTEST) → sink sub-exec `9426324` (`tWm5DYLxfypmVC1T`). The sink trigger's resolved input item:
```json
{"contact_id":"437264483","message":"Your inquiry has been routed to the PIC. (OBS-14 …)",
 "sent_at":1784620472270,"turn_id":null,
 "data":"{\"contact_id\":\"437264483\",\"phone_number\":null,…,\"first_name\":null,\"last_name\":null,…}"}
```
The whole `workflowInputs` object rendered and the sub-execution completed `success` — so
`phone_number` **was** evaluated. It resolved to `undefined` (hence the key is absent from the
top-level item, while `data` correctly carries `"phone_number":null`) and **did not throw**, because
of the `?.`. The tester's PASS is genuine, not an artefact of the path being skipped.

**Conclusion.** No gap exists on BLOBTEST → **task 2 was NOT performed, deliberately.** No `?? null`
was added to the top-level inputs either: the reviewer's own ruling is `?.` **only** there (plain
expression, not a `JSON.stringify` argument), and BLOBTEST already satisfies it. Making the change
would have been an unrequired edit to a validated artifact. **The gap is real on LIVE only, and it is
a promote-scope defect in the record, not a build defect** — corrected at §STEP 6.

### 9.2 `sub-sendmsg-OBS` `sJI3DbsLCG01JfRs` — **DEMOTED from source of record**

Per reviewer §F. **BLOBTEST `69RhomhiCH4bpY1w` @ `86cc9542` is the H4 SOURCE OF RECORD**; its two
`data` blobs were byte-verified against live by the reviewer (§B) and its behaviour was verified
dynamically by the tester (§OBS-14). OBS's post-STEP-6 state was **asserted but never verified** — the
tester correctly never fetched or ran it — so it cannot serve as a promote source.

- ❌ **NOT the promote source.** §Deviations D4's closing sentence ("`sJI3DbsLCG01JfRs` remains the
  promote-source-of-record for the H4 hunk text") and §STEP 6's table label "(promote source-of-record)"
  are **both withdrawn.**
- ❌ **Do not publish it.** Publishing would make a credentialed, unreviewed, S8-failing workflow
  (3 banned node types, one armed `sorento-api` credential) resolvable by any caller. B1's denial was
  the correct outcome and must not be revisited. Leaving it unpublished is the safer state.
- ❌ **Do not run it** (S8 ❌, unchanged).
- ➡️ **ARCHIVE** after P2 is verified, re-asserting zero inbound references at archive time. Archival
  is a write and is user-gated.

### 9.3 ⚠️ PROMOTER WARNING — reviewer finding **R1**: `If`[0] → `Redis2` has ZERO clone coverage

**Both ingress clones carry `If.main[0] = null`.** `Redis2` was deliberately orphaned for containment
(§STEP 2a), so **the clones have never executed the normal, non-rate-limited path.** Every §OBS-15/16
assertion is about `If`[1].

> **The only way Hop 3 can break production is by disturbing `If`[0] → `Redis2` on INJECT — and that
> is precisely the edge on which the clone evidence is silent.** Hop 3 is a connection-editing change
> on that exact IF node.

**Blast radius if broken:** nothing is enqueued, no spine execution is created, **100 % of ingress is
lost, silently** — and on INJECT, which carries all live traffic (55/55 sampled `sorento-main`
executions drop at `in-failover?`).

**Binding on the promoter:**
- Target live shape is `If.main = [[{Redis2}], [{save-ratelimit-incoming}]]`.
- **The clones' `null` in slot 0 must NOT be replicated.** It is a containment artifact, not a shape
  to copy. Any promote that block-copies the clone's `connections` ships the outage.
- The pre-publish expected-delta assertion (P5 / P6b) must explicitly include *"`If.main[0]`
  unchanged, still `[{Redis2}]`"*. Anything else → **HALT**.
- Post-publish (P11c): **watch real executions** taking `If`[0] → `Redis2`. Infer nothing.

### 9.4 ⚠️ PROMOTER WARNING — purity **Hazard 2**: the HI fork's `workflowId` is repointed to BLOBTEST

Companion to the cycle-1 hazard (`is_test: true` on clone sendmsg callers — §STEP 3.1 PROMOTE WARNING),
and **worse**, because its failure mode is invisible to a happy-path check.

The HI fork `vUfFUDjLAuMaeQE6`'s three sendmsg callers — `sorento-sub-respond-sendmsg-respond-routed-to-pic`
(`0ca5413f`), `-pic1` (`c5dd9961`), `-pic2` (`a1ea185e`) — have had `workflowId` repointed to
**`69RhomhiCH4bpY1w` (BLOBTEST)**, a harness stand-in whose `Send a Message` and `HTTP Request` are
**Code nodes** with no respond.io node anywhere in the graph (§STEP 0b, §Deviations D3).

**If those node parameters are copied to live `rrYXzE61gCNUck_zmXe-G`, every production escalation
reply is repointed at a Code stub.** Failure mode: **silent** (no error — the stub returns a
well-formed `{contactId, messageId}`), **total**, and **specific to escalations** — so a happy-path
post-promote check would never catch it. That is exactly the check that let this cycle's defect
through in the first place.

**Binding on the promoter:**
- **Live must keep `workflowId = aoydkG1dbItXR5jXFEQsP` on all three callers.** Assert it after the edit.
- Add **one leaf key** per node via `setNodeParameter` (`/workflowInputs/value/turn_id`, relative
  pointer — LESSONS §32b). **Never** a block copy of `workflowInputs.value`, never
  `updateNodeParameters` deep-merge, **never touch `workflowId`.**
- P11(a) — the live escalation-turn check — is the **only** verification that would catch this.
  Do not skip it because P1 looked clean.

### 9.5 Cycle 2d verification (re-fetched from MCP; **zero writes, zero publishes, zero executions**)

| assertion | result |
|---|---|
| BLOBTEST `69RhomhiCH4bpY1w` top-level `phone_number` = `contact?.phone` on **both** save nodes | **PASS** (quoted §9.1 Evidence A) |
| LIVE `aoydkG1dbItXR5jXFEQsP` top-level `phone_number` = bare `contact.phone` on **both** save nodes | **CONFIRMED** — the promote gap is real on live (§9.1 Evidence B) |
| §OBS-14 contactless path evaluated the top-level inputs without throwing | **PASS** — sink sub-exec `9426324` status `success`, `data` blob renders the three nulls (§9.1 Evidence C) |
| BLOBTEST unchanged by cycle 2d — `versionId == activeVersionId == 86cc9542` | **PASS** (unchanged from cycle 2c) |
| BLOBTEST zero nodes of type `@respond-io/…respondio` / `n8n-nodes-base.httpRequest` / `@n8n/…memoryPostgresChat` | **PASS** — `Send a Message` and `HTTP Request` are `n8n-nodes-base.code` |
| BLOBTEST both save calls still target `tWm5DYLxfypmVC1T` | **PASS** |
| INJECT clone `4kfNkL6afjidbP4D`: `active == false`, `activeVersionId == null`, `activeVersion == null` | **PASS** — `updatedAt 07:43:01.827Z`, unchanged since cycle 2c |
| main clone `ucf8g8sON5n4v0ry`: `active == false`, `activeVersionId == null`, `activeVersion == null` | **PASS** — `updatedAt 07:43:16.471Z`, unchanged since cycle 2c |
| both clones `If.main[0] == null` (the R1 shape — **do not replicate on live**) | **CONFIRMED on both** (§9.3) |
| HI fork's three sendmsg callers still point at BLOBTEST (Hazard 2 live) | **CONFIRMED** (§9.4) |
| no live workflow read-only? — no live workflow edited or published in cycle 2d | **PASS** |
| zero executions run in cycle 2d | **PASS** |

---

## Cycle 2c verification (re-fetched from MCP AFTER all edits and the publish)

| assertion | result |
|---|---|
| BLOBTEST text blob: `contact?.phone ?? null` | **PASS** |
| BLOBTEST text blob: `contact?.firstName ?? null` | **PASS** |
| BLOBTEST text blob: `contact?.lastName ?? null` | **PASS** |
| BLOBTEST quick_reply blob: `contact?.phone ?? null` | **PASS** |
| BLOBTEST quick_reply blob: `contact?.firstName ?? null` | **PASS** |
| BLOBTEST quick_reply blob: `contact?.lastName ?? null` | **PASS** |
| BLOBTEST `turn_id ?? null` still present in both blobs | **PASS** |
| BLOBTEST published, `versionId == activeVersionId == 86cc9542` | **PASS** |
| BLOBTEST zero nodes of type `@respond-io/…respondio` | **PASS** |
| BLOBTEST zero nodes of type `n8n-nodes-base.httpRequest` | **PASS** (the node *named* `HTTP Request` is `n8n-nodes-base.code`) |
| BLOBTEST zero nodes of type `@n8n/…memoryPostgresChat` | **PASS** (also zero `memoryManager`) |
| BLOBTEST both save calls still target `tWm5DYLxfypmVC1T` | **PASS** |
| OBS `sJI3DbsLCG01JfRs`: same six sites present | **PASS** |
| OBS `versionId (4ca60219→new draft) != activeVersionId (25b1a299)` — still draft-only | **PASS** (not published; publish not attempted) |
| INJECT clone sendmsg caller `workflowId == 69RhomhiCH4bpY1w` | **PASS** |
| main clone sendmsg caller `workflowId == 69RhomhiCH4bpY1w` | **PASS** |
| INJECT clone `active == false`, `activeVersionId == null`, `activeVersion == null` | **PASS** |
| main clone `active == false`, `activeVersionId == null`, `activeVersion == null` | **PASS** |
| both clones' sendmsg `workflowInputs.value` unchanged (6 keys, same expressions) | **PASS** |
| no live workflow edited or published in cycle 2c | **PASS** |
| zero executions run in cycle 2c | **PASS** |

---

## Pre-handoff assertion results (re-fetched from MCP after all edits)

| assertion | INJECT `4kfNkL6afjidbP4D` | main `ucf8g8sON5n4v0ry` |
|---|---|---|
| no node has `parameters.list == "main-message-list"` | **PASS** (after D1 remediation) | **PASS** (after D1 remediation) |
| no `executeWorkflow` targets `aoydkG1dbItXR5jXFEQsP` | PASS | PASS |
| no `executeWorkflow` targets `UrETd-jm46tFj3Xw7w8vL` | PASS | PASS |
| no `executeWorkflow` targets `ublq9nSlrpz63xan` | PASS | PASS |
| no `executeWorkflow` targets `uoO5eiJFXA8THrry` | PASS | PASS |
| only live-sub reference is `D62_NHUOrugeULSFwfjEJ` (permitted read) | PASS | PASS |
| no `respondioTrigger` node | PASS | PASS |
| `active == false` | PASS | PASS |
| `activeVersionId == null` | PASS | PASS |

Full `executeWorkflow` inventory on both clones (3 nodes each, identical id set):
`Call 'sorento-sub-respond-findcontact-respond'` → `D62_NHUOrugeULSFwfjEJ` (permitted CRM read) ·
`Call 'sorento-sub-respond-sendmsg-respond'` → `lJ4IZEGwoTh6aay4` (STANDIN)
**[SUPERSEDED cycle 2c §STEP 7 → `69RhomhiCH4bpY1w` BLOBTEST on both clones]** ·
`save-ratelimit-incoming` → `tWm5DYLxfypmVC1T` (TEST sink).

Also confirmed: `get-set` (main clone only) is a Postgres **read** of `failover_watermark` —
permitted, unchanged.

---

## Validation result

`mcp__n8n-mcp__validate_workflow` on this MCP surface validates **SDK code**, not a workflow id
(schema takes `code`, not `workflowId`) — the cycle-1 phrasing "`validate_workflow txiPzSxy3Pclsz6v`"
does not map to a callable operation here. Substituted evidence:

- `validate_workflow(code)` on the STANDIN before creation → `{"valid": true, "nodeCount": 3}`.
- Every `update_workflow` call ran server-side validation and returned **zero errors**; all
  operations applied atomically (`appliedOperations` == ops submitted on every call).
- Warnings returned are the **documented pre-existing set** (LESSONS §13) and were NOT "fixed":
  `HARDCODED_CREDENTIALS` on the `x-api-key` httpRequest nodes, `DISCONNECTED_NODE` on the
  deliberately-orphaned egress nodes (incl. the newly-orphaned `Redis2` — expected and desired),
  `MISSING_EXPRESSION_PREFIX` on `Transcribe a recording`, `INVALID_PARAMETER` on
  `OpenAI Chat Model` `builtInTools`, and `SUBNODE_NOT_CONNECTED` on `sub-sendmsg-OBS`'s
  `Chat Memory Manager`. All are present in live too.

---

## Deviations from the checklist (each flagged for reviewer decision)

**D1 — `Redis2` list literal repointed, not just orphaned.** STEP 2a said "orphan it"; the
pre-handoff assertion said no node may carry `parameters.list == "main-message-list"`. The first
assertion run FAILED on this. Resolved by doing both: node stays orphaned AND the literal is
repointed to the unconsumed `zz-dead-main-message-list-TEST`. Defence in depth — even a future
accidental reconnection cannot reach the prod queue. Reviewer may revert the param if strict
live-fidelity of the orphaned node is preferred, but then the pre-handoff assertion must be
re-worded.

**D2 — op 3d (`turn_id` + `contact` on the sendmsg caller) implemented, though STEP 2b named only
`is_test`/`test_run_id`.** Without it, §OBS-15 assertion 2, V-T-j and V-T-k cannot pass and the
build is untestable against its own acceptance criterion. Op 3d is explicit in plan §2.3.4.

**D3 — HI fork's three sendmsg callers repointed. [UPDATED cycle 2b: STANDIN → BLOBTEST.]** Not in
STEP 3, but required by plan §OBS-9 and by the hard safety rule: §OBS-9/10/11 run the fork
guard-**open** at `is_test:false`, and pointed at live `aoydkG1dbItXR5jXFEQsP` those runs are real
WhatsApp sends. Now points at `69RhomhiCH4bpY1w` so the blob path is exercised. Strictly
safety-increasing and trivially reversible.

**D4 — H4 target. [UPDATED cycle 2b.]** STEP 4 says "the sendmsg fork used for testing", but the
STANDIN has **no save blobs** (no `executeWorkflow` node at all), so it cannot host H4. In cycle 2
the only candidate was `sJI3DbsLCG01JfRs`, whose publish was denied (B1). **Cycle 2b supersedes
this:** BLOBTEST was forked from the OBS **draft**, so it **inherits H4** (`contact?.` on all 8
sites in both blobs) *and is published*. §OBS-14 should therefore run against
**`69RhomhiCH4bpY1w`**, which makes it independent of B1. ~~`sJI3DbsLCG01JfRs` remains the
promote-source-of-record for the H4 hunk text~~ — **WITHDRAWN cycle 2d (§9.2): OBS is NOT the promote
source; BLOBTEST `69RhomhiCH4bpY1w` @ `86cc9542` is.** OBS must not be executed (S8 ❌), must not be
published, and should be archived after P2.

**D5 — BLOBTEST built via SDK code + parameter patch, not UI Duplicate (cycle 2b).** MCP cannot
duplicate a workflow and REST is barred by the security rule, so the fork was hand-ported:
`create_workflow_from_code` for graph shape, then one atomic `update_workflow` carrying the exact
parameter objects. The four load-bearing strings (`Code in JavaScript` jsCode, both `data` blobs,
`test-guard-record` messageData) were byte-verified against the source on re-fetch. Reviewer should
spot-check the two blobs rather than assume duplication fidelity.

**D6 — HI fork published (cycle 2b).** The repoint would otherwise be invisible to the spine clone
(LESSONS §37). Gated on a full draft-vs-active diff first; only the three `workflowId` leaves
differed. New `activeVersionId` `c41e1c7e`.

---

## Blockers / gaps the reviewer and tester MUST know

**B1 — `publish_workflow(sJI3DbsLCG01JfRs)` was DENIED by the permission classifier.** The H4 edit
is therefore on the **DRAFT only** and is **invisible to callers** (LESSONS §37: parents resolve the
published version). This is fail-closed and currently inert — no workflow references
`sub-sendmsg-OBS` right now. Not worked around.

> **DOWNGRADED to non-blocking (cycle 2b).** §OBS-14 no longer needs it: BLOBTEST inherited H4 from
> the OBS draft and is published. **No user action is required to proceed with the UAC cycle.**
> `sJI3DbsLCG01JfRs` stays draft-only and unrun; publishing it is optional housekeeping, and given
> it fails S8 (three banned node types) leaving it unpublished is arguably the safer state.

**B2 — ✅ RESOLVED (cycle 2b, user decision: option 1).** The 4th fork
**`zz-sub-sendmsg-BLOBTEST` `69RhomhiCH4bpY1w`** is both zero-credential **and** blob-retaining
(§STEP 0b), and the HI fork's three sendmsg callers now point at it (§3.2). §OBS-9/10/11 can
therefore assert `turn_id === "9999101…3"` **inside a rendered save blob** at the TEST sink
`tWm5DYLxfypmVC1T`, in addition to V-T-b's inequalities. No decision outstanding.

**B3 — ✅ RESOLVED (cycle 2b).** H4 is now exercisable **without** B1: BLOBTEST inherits H4 from the
OBS draft and **is published**. §OBS-14 drives `69RhomhiCH4bpY1w` directly via `test_workflow` with
caller #12/#13's 2-key shape. `sub-sendmsg-OBS` remains referenced by nothing and must not be run.

**B4 — ✅ RESOLVED (cycle 2b).** `tests/UAC.md` §0 **S8 has been rewritten** now that B2 is settled.
Pinning is **withdrawn**, not merely superseded; the binding rule is the structural node-**type**
check, and S8 now carries a fork table stating which of the three sendmsg forks may be run at
`is_test:false`: **BLOBTEST `69RhomhiCH4bpY1w` ✅ (use this)**, STANDIN `lJ4IZEGwoTh6aay4` ✅ (no
blobs), **`sub-sendmsg-OBS` `sJI3DbsLCG01JfRs` ❌ DO NOT RUN**. S8 also now records that MCP redacts
credentials, so node type is the only sound proxy. `CLAUDE.md`'s clone-wiring line was already
correct and was **not** touched.

**B5 — not built, out of scope, unchanged:** H6 (dropped by user decision), #12
`schedule-working-day-detection`, #13 `respond-close-convo`, and §5 `respond-send-user` (V-T-h).
All four are untouched and unpublished.
