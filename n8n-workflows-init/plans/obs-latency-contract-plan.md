# Observability latency contract — n8n side (CRM slice S4)

Source request: `sorento_crm/.claude/worktrees/observability-monitoring/documentation/plans/observability/n8n-contract-handoff.md`
Status: **PLAN ONLY — nothing built, nothing promoted.**

> **Build spec for C1–C4: `obs-latency-contract-build.md`** (scope `deterministic`) — resolves the
> test-sink problem, the sendmsg-fork question, the spine draft/active diff, the voice path, the
> 9-caller turn_id matrix, and the §OBS-1…§OBS-7 UAC cases. C5 is DONE (live). C6 is dropped.
> Note two corrections it makes to §2 blockers: the spine draft delta is **cosmetic only**
> (publish is safe), and `sorento-main` never needs an edit or a publish.

## 0. Corrections to the handoff (read first)

The handoff was written without visibility into our topology. Four of its instructions are
wrong as literally written.

### 0.1 There is no direct HTTP ingest from the spine

Actual chain:

```
spine 9qVyfUxmRQqrpGRMDLRuz  ─┐
sendmsg sub aoydkG1dbItXR5jXFEQsP ─┴─> sub-respond-save-message-redis (UrETd-jm46tFj3Xw7w8vL)
                                        └─ RPUSH data(string) -> redis list "sorento-respond-message"
                                             └─ redis-consume-queue-mongo (Srs08P0Ha3Cv--YPx0-Yn)
                                                  Schedule 5s -> POP 1 -> output-parser -> insert-message
                                                     POST https://fe-sorento.foundryx.my/api/v1/external/chat-history/messages
                                                     body = {{ $json }}   headers = x-api-key only
```

Consequences:
- New fields must be added **inside the `data` JSON blob** at each caller. The sub's other
  inputs (`contact_id`, `phone_number`, `message`, `sent_at`) are decorative — only `data`
  is forwarded.
- `X-Source: n8n` belongs on **one node**: `insert-message`. Not on the spine.
- `X-Correlation-Id: {{ $execution.id }}` on `insert-message` would be the *consumer's*
  execution id — meaningless. Correlation must ride in the body (`turn_id`) instead.

### 0.2 `message.timestamp` does not exist

Handoff Change 1 says `$('tf-message').first().json.message.message.timestamp`. Wrong on
both counts:

- Nesting is off by one. `tf-message` returns the respond.io webhook body, so the correct
  level is `$('tf-message').first().json.message.messageId` (as already used by
  `Call 'sub-human-intervention'`).
- respond.io sends **no timestamp field at all**. Verified during the failover work
  (`plans/failover-poller-plan.md:22,44,186`): `messageId` *is* the timestamp —
  epoch microseconds. `1783908698634447` → 2026-07-13 10:11:38 MYT.

So: `sent_at_ms = Math.floor(messageId / 1000)`.

This matches the handoff's own worked example (`message_id 1784519974000000` ↔
`sent_at 1784519974000`) — the arithmetic they wrote is right, the field name is invented.

Precision note for the CRM side: **incoming** messageIds carry trailing zeros
(`unix_seconds × 1e6`), so incoming `sent_at` is whole-second precision. Outgoing carry real
microseconds. Sub-second latency claims on the incoming leg are not supportable from this
field. The SLA itself is unaffected — it uses `respond_ts` from their resolver.

### 0.3 `turn_id: {{ $execution.id }}` is wrong for outgoing

The outgoing save runs **inside the sendmsg sub**, which is a separate n8n execution from
the spine (confirmed: sub exec 9386788, `parentExecutionId` 9386778). `$execution.id` there
is the sub's id, so incoming and outgoing rows of one turn would get *different* turn_ids —
silently breaking pairing in a way that looks like it works.

`turn_id` must be **threaded**: spine computes `$execution.id`, passes it as a new sendmsg
sub input, the sub writes it into the blob.

### 0.4 Outgoing `message_id` is already shipping

Live, right now (exec 9386788):

```json
{"type":"outgoing","message_id":"1784593772234503","sent_at":1784593772280, ...}
```

Both outgoing save calls already read `$('Send a Message').item.json.messageId` /
`$('HTTP Request').item.json.messageId`.

**Ask the CRM side to re-run their count.** "4 of 1520" is consistent with the column
having landed 4 rows ago, not with n8n failing to send it. If the count stays flat while
new outgoing traffic flows, the loss is in the consumer or the ingest schema — not here.

Unverified sub-case: the quick_reply branch reads `$('HTTP Request').item.json.messageId`
from a raw respond.io POST. Response shape not yet confirmed to include `messageId`. Tester
must assert this branch separately.

## 1. Scope of change

| # | Where | Change | Risk |
|---|---|---|---|
| C1 | spine `Call 'sub-respond-save-message-redis'2` data blob | add `message_id`, `turn_id`; `sent_at` from messageId | med — live spine |
| C2 | sendmsg sub: new `turn_id` workflow input | additive input | low |
| C3 | sendmsg sub: both save-call data blobs | add `turn_id`; `sent_at` from messageId | low |
| C4 | 8 spine callers + 1 `sorento-main` caller of sendmsg | pass `turn_id: {{ $execution.id }}` | med — live spine |
| C5 | `insert-message` (consumer) | add header `X-Source: n8n` | low |
| C6 | 7 spine CRM HTTP nodes (+ subs) | add `X-Source: n8n`, `X-Correlation-Id: {{ $execution.id }}` | low, cosmetic |

C6 is attribution only — no SLA impact. Ship last, or skip.

### C1 detail

Inside the `data` blob of `Call 'sub-respond-save-message-redis'2`, add:

```js
"message_id": `${$('tf-message').first().json.message.messageId}`,
"turn_id": `${$execution.id}`,
"sent_at": $('tf-message').first().json.message.messageId
             ? Math.floor($('tf-message').first().json.message.messageId / 1000)
             : new Date().getTime(),
```

Fallback on `sent_at` is deliberate: a missing messageId must degrade to today's behaviour,
never to `null`/`NaN` — a NaN `sent_at` would break transcript ordering for everyone, which
is a worse outcome than the imprecision we are fixing.

Coder must confirm messageId survives the **`patch-transcript` → `tf-message`** path (voice
notes), where the text is rewritten upstream.

### C4 detail — proactive sends

Callers that must pass **no** `turn_id` (no incoming message exists → CRM excludes them
from the SLA denominator, per handoff §Change 3):

- `sorento-main` → `Call 'sorento-sub-respond-sendmsg-respond'` (rate-limit notice). The
  incoming that triggered it is dropped before the queue, so it has no paired row.

Pre-existing defect found during recon, **out of scope but flagged**: two spine callers
pass no `contact` object — `sorento-sub-respond-sendmsg-respond5` and
`sorento-sub-respond-sendmsg-respond-transcribed-message`. Their save blobs dereference
`contact.phone` / `contact.firstName`. Worth a separate look; do not fix here.

## 2. Blockers before any edit

1. **Spine draft ≠ active.** `versionId e26437e5-34e6-4fb7-9170-bf380cdd6edc` vs
   `activeVersionId 6a0a0a5c-9f3d-4325-a1a2-9d2b95efae01`. Publishing the spine would ship
   whatever else is sitting in that draft. Diff draft vs active and identify the delta
   before touching it. (`sorento-main` also diverges — that one is benign: `in-failover?`
   typeValidation strict→loose.)
2. Consumer throughput: `redis-consume-queue-mongo` pops **1 item per 5s** — ceiling ~12
   rows/min. Under burst, `ingest_at − respond_ts` measures *our queue backlog*, not webhook
   lag. The CRM side treats that delta as webhook lag; tell them, or the failover scenario
   they care most about will be misattributed.

## 3. Build order

Per CLAUDE.md: build on clone `txiPzSxy3Pclsz6v` + forks, UAC on clone, reviewer sign-off,
then user-gated promote. Never edit the live spine directly.

1. C5 (consumer header) — standalone, no clone needed, additive.
2. C2 + C3 on a sendmsg fork.
3. C1 + C4 on the clone.
4. Promote as one reviewed diff.
5. C6 last, or drop.

Sequencing rationale differs from the handoff's ("message_id first"): outgoing message_id
already ships, so the actual critical path is **incoming message_id (C1)** — that is the
half of every turn the resolver currently cannot see.
