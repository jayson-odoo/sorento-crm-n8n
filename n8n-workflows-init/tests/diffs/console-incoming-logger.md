# Node-diff — console incoming-turn logger (Gap C / C1)

**Change-id:** `console-incoming-logger`
**Target:** clone spine `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v` (NEVER live `9qVyfUxmRQqrpGRMDLRuz`)
**Plan:** `n8n-workflows-init/plans/console-persistence-plan.md` §4 Gap C, Option C1
**Published active versionId (after):** `9eb9762e-d502-4f02-bf9d-d54a344ba699` (was `0da4d7d7-2b04-45d8-96c1-bd4f05a6ccf7`; before the original build: `23d2228d-9699-4942-a630-a1874d4ba5f6`)
**Scope:** `deterministic` — additive Postgres INSERT + IF gate. No parser prompt, no egress node touched.
**Partial-from-stopped-run:** none found. Clone was clean (active == versionId, no incoming-logger node). Built fresh.

---

## What & why

Only **outgoing** bot replies were logged to `n8n_test.chat_histories` (via the send fork's
`log-chat-history-n8ntest`). The **incoming** customer turn was never persisted, so the console-lane
corpus was reply-only with no paired incoming. This adds an incoming-turn logger to the clone spine,
gated to the console lane only, so `v_turns` can pair incoming↔outgoing.

## Graph placement

```
redis-pop-main-message-list → tf-message → sorento-sub-respond-findcontact-respond
                                                   ├── (existing, UNCHANGED) → is-human-intervened → …branch…
                                                   └── (NEW) → console-incoming-gate ──TRUE──▶ log-incoming-chat-history-n8ntest
                                                                                    └─FALSE─▶ (nothing connected)
```

- Fan-out **added** off `sorento-sub-respond-findcontact-respond` (output 0). The pre-existing edge
  `findcontact → is-human-intervened` is **byte-identical** (still the first entry in the connection
  array; REST-verified). The new branch is purely additive — non-console modes are unaffected.
- Placed **early** (right after pop/parse/findcontact, before all branch logic) so every console turn
  logs its incoming regardless of downstream outcome (escalation / no-access / clarify / happy).

## Nodes added

### 1. `console-incoming-gate` (IF, typeVersion 2.3) — id `550df90b-9737-4106-96b9-703ba5e8814e`
Mirrors the existing `session-get-gate` IF pattern (v2.3, boolean-true operator).

**Condition (combinator `and`, single boolean condition, TRUE-branch = output 0):**
```
={{ $('redis-pop-main-message-list').first().json.message.mode === 'chat-stateful'
    && !!((($('redis-pop-main-message-list').first().json.message||{}).contact||{}).chat_id) }}
```
- Fires **only** when `mode === 'chat-stateful'` **AND** `contact.chat_id` present — i.e. exactly the
  console lane (`zz-chat › build-item` stamps both; real traffic and other modes stamp neither).
- **Does NOT fire** in `uac` (mode `uac`/absent), `regress-capture`, `regress-replay`, or live
  (mode absent). Strict `=== 'chat-stateful'` — deliberately narrower than `session-get-gate`
  (which also allows regress modes) so the console corpus stays clean of regress turns.
- FALSE branch (output 1) has **no connection** → in any non-console mode the Postgres node never
  executes (zero DB touch). Fail-safe + additive.

### 2. `log-incoming-chat-history-n8ntest` (Postgres, typeVersion 2.6) — id `2ceb90be-2d36-4ce2-aed9-80edc040d00a`
Mirrors the reply logger `log-chat-history-n8ntest` (same table/columns/style), `type='incoming'`.

**Credential binding (S-CRED, the #1 footgun):**
`postgres.id = "Dnnofg8Xb27VQOhI"` (`n8n_test-db`, host 72.62.195.19, db `n8n_test`).
**NOT** prod `sorento-crm-db` (`ETJL5KoaA1UpkDip`). REST-GET confirmed post-publish
(`get_workflow_details` strips creds; verified via `GET /api/v1/workflows/txiPzSxy3Pclsz6v`).
`update_workflow` reported `autoAssignedCredentials: []` (no wrong-cred auto-bind, cf. LESSON 10).

**Query (operation `executeQuery`):**
```sql
INSERT INTO chat_histories
  (id, channel, contact_id, phone_number, message, sent_at,
   first_name, last_name, type, created_at, message_id, result)
SELECT COALESCE(MAX(id),0)+1, 'whatsapp', $1, $2, $3,
       COALESCE(to_timestamp(NULLIF($7,'')::double precision / 1000.0), NOW()),
       $4, $5, 'incoming', NOW(), NULL, $6::jsonb
FROM chat_histories;
```
Column set is **identical** to the reply logger (matches `chat_histories` schema + `v_turns`), with
`type='incoming'`, `message_id=NULL` (always NULL on incoming, per schema.sql line 35), and no
result_set / quick_reply. `channel='whatsapp'` matches the reply logger so pairs are consistent.

**⚠️ `sent_at` source fix (2026-07-14, tester REQUEST-CHANGES §22.4):** `sent_at` was `NOW()`.
Because the console-lane gate branch runs AFTER the send fork's outgoing INSERT, `NOW()` resolved
~30–53 ms LATER than the reply → `incoming.sent_at > outgoing.sent_at` → `v_turns` (join
`o.sent_at >= i.sent_at`) mis-paired off-by-one (turn-1 incoming pairing turn-2's reply; last
incoming → NULL). Verified on rows 9150015/17/19/22/24.
**Fix:** stamp `sent_at` from the message's **early arrival timestamp already on the item**, not a
late `NOW()`. The popped console item carries `messageId` (== `test_run_id`) = `<prefix>-<epoch_ms>`
(e.g. `chatui-1784021675701` = 2026-07-14T09:34:35.701Z), stamped at injection — BEFORE pop/parse
and ~6 s before the reply send (confirmed on exec 8563165: messageId epoch `…675701` vs redis-pop
`startTime …675845` vs outgoing `NOW()` ~6 s later). The queryReplacement now extracts the trailing
epoch-ms (`$7`) and `sent_at = COALESCE(to_timestamp($7/1000.0), NOW())`. Only the `sent_at` source
changed; every other column, the gate, and the cred are byte-identical.
- `sent_at` is `timestamp` (no tz, schema.sql line 30). Both `NOW()` and `to_timestamp(epoch)` write
  through the same server-tz coercion, so ordering is preserved; and the messageId epoch is monotonic
  per turn (`Date.now()` at injection) → also fixes the intra-conversation `row_number ORDER BY sent_at`.
- `messageId`/`test_run_id` are stamped by a server-side Code node (`zz-chat` chatui lane /
  `zz-chat-console` build-item = `chatcon-`), i.e. the SAME clock as `NOW()` — no client-skew risk.
- Fail-safe: if `messageId`/`test_run_id` is absent or has no trailing epoch, `$7=''` → `NULLIF`→NULL
  → `COALESCE`→`NOW()` (degraded old behavior only when the field is truly missing; never crashes).

**Row-value mapping (`options.queryReplacement`, defensive IIFE, sourced from the popped redis item
`$('redis-pop-main-message-list').first().json.message` = the whole item):**
| $ | column | source path (relative to `…json.message` = item) |
|---|---|---|
| $1 | contact_id | `String(item.contact.id)` → `'437264483'` (same id the outgoing logger uses → pairs in v_turns) |
| $2 | phone_number | `String(item.contact.phone \|\| '60100000000')` |
| $3 | message | `item.message.message.message.text` (deep path per LESSON 12) `\|\| ''` |
| $4 | first_name | `item.contact.firstName \|\| null` |
| $5 | last_name | `item.contact.lastName \|\| null` |
| $6 | result (jsonb) | `{ type:'incoming', source:'chat-console' }` |
| $7 | (→ sent_at) | trailing epoch-ms of `item.messageId \|\| item.test_run_id`, else `''` |

Exact expression:
```
={{ (() => {
  const it = ($('redis-pop-main-message-list').first().json.message) || {};
  const c  = it.contact || {};
  const text = (((it.message||{}).message||{}).message||{}).text || '';
  const idraw = String(it.messageId || it.test_run_id || '');
  const m = idraw.match(/(\d{10,})$/);
  const epochMs = m ? m[1] : '';
  return [ String(c.id), String(c.phone || '60100000000'), text,
           (c.firstName || null), (c.lastName || null),
           JSON.stringify({ type: 'incoming', source: 'chat-console' }),
           epochMs ];
})() }}
```
IIFE + `|| {}` guards make it fail-safe against a missing field (no crash → no execution abort).

## Pairing correctness (v_turns)

`v_turns` pairs each `type='incoming'` row with the first `type='outgoing'` row for the same
`contact_id` at `sent_at >= incoming.sent_at` (schema.sql §1b). **The incoming node's gate branch
actually executes AFTER the send fork's outgoing INSERT** (not "early" — that was the original
build's mistaken assumption), so a `NOW()`-stamped incoming resolved LATER than the reply and
mis-paired. Fixed by sourcing `incoming.sent_at` from the injection-time `messageId` epoch (~6 s
before the reply), guaranteeing `incoming.sent_at < its own outgoing.sent_at` per turn on
`contact_id='437264483'` regardless of node execution order.

## Connections changed (REST-verified after publish)
- `sorento-sub-respond-findcontact-respond`.main[0] = `[is-human-intervened(idx0)  (unchanged), console-incoming-gate(idx0)  (NEW)]`
- `console-incoming-gate`.main[0] (TRUE) = `[log-incoming-chat-history-n8ntest(idx0)]`; main[1] (FALSE) = none

## Zero-egress posture
- Additive branch off a passthrough node; existing spine flow byte-identical.
- Only DB written is `n8n_test.chat_histories` via `Dnnofg8Xb27VQOhI` (REST-confirmed). No respond.io,
  no assign/SLA/PIC, no prod CRM/session write. Non-console modes never execute the node (IF FALSE
  unconnected).

## Validation
`update_workflow` applied all 4 ops atomically (`appliedOperations: 4`) and would have errored on any
bad node ref (LESSON 36 = success ⇒ applied/validated). All returned `validationWarnings` are the
pre-existing allowlisted set (LESSON 13: hardcoded x-api-key on httpRequest nodes, DISCONNECTED_NODE on
the deliberately-orphaned egress nodes, OpenAI builtInTools, Transcribe expression-prefix) — none
reference the two new nodes.

## Follow-ups for tester (not done here — tester's job)
- V-CP4: drive a `chat-stateful` turn and assert a `type='incoming'` `chat_histories` row
  (`result.source='chat-console'`, `contact_id='437264483'`) paired (earlier `sent_at`, same
  conversation) with the outgoing row.
- V-CP5: confirm zero egress + S-CRED green on the run.
- V-CP6 (re-test of the sent_at fix): drive a **multi-turn** `chat-stateful` console conversation
  (≥3 turns) and assert `v_turns` pairs each incoming with **its own** turn's reply — i.e.
  `incoming.sent_at < outgoing.sent_at` for every turn, no off-by-one, last incoming not NULL.
  Spot-check that `chat_histories.sent_at` for incoming rows matches the `messageId` epoch, not run time.
