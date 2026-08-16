# S3.2 FLIP RUNBOOK — conversation intervention tickets (n8n side)

Status: NOT EXECUTED. Every step below is **user-gated**; nothing here runs without an explicit go.
Plan: `intervention-tickets-s32.md` · Evidence: `../tests/diffs/intervention-tickets-s32/` +
`../tests/runs/intervention-tickets-s32-pinmatrix.md`

The flip touches **two live workflows in one window**. Doing only the first is worse than doing
neither: always-create without the close-convo fix means a single Respond close event resolves
every open sibling ticket for that contact.

## Preconditions — ALL must hold before asking for the go

| # | gate | how to verify | owner |
|---|---|---|---|
| P1 | CRM BE + FE deployed to prod, `/integration` returns `in_working_hours` on **all three** shapes (fresh insert, idempotent retry, out-of-hours) verified against **PROD**, not dev | curl the prod route read-only | peer + us |
| P2 | Old n8n flow still green post-deploy (create is back-compat) | one real intervention observed OR peer's A1/A2 tests on prod build | peer |
| P3 | `LLEN sorento-respond-assignee-queue == 0` | redis read at flip time, **during working hours** | us |
| P4 | Reviewer seat APPROVE on the node-diff + matrix | `sorento-reviewer` output | us |
| P5 | Matrix ALL PASS against the version being promoted | `intervention-tickets-s32-pinmatrix.md` verdict line | us |
| P6 | Live `rrYXzE61gCNUck_zmXe-G` still at `5018a189-22df-4cb9-aa89-fa509377abe9` | REST GET immediately before the PUT | us |
| P7 | `GET /external/conversation-sla-tracking/open-count` EXISTS in the deployed build (Step 4 gate) | curl the route read-only | peer |
| P8 | Reviewer findings F1/F2/F3 all discharged (see Step 2b) | review doc + follow-up diffs | us |
| P8b | Fixtures RE-CAPTURED from the post-#137 branch and the timestamp assertion re-run | fresh replay + matrix re-run | us |
| P10 | ✅ MET 2026-08-15 — S4.5 webhook fires ONLY for user-origin resolves. Red-first tests (3 failed → 6 passed): user-principal last-ticket resolve → outbox row; API-key PUT last-ticket resolve → NO close-convo row, no send; RQ Respond close unchanged. UAC AC-M3 + PLAN S4.5 | done | peer |
| P11 | ✅ MET 2026-08-15 — AC-G2 landed, verified on a REAL dev create (Sat 18:51 MYT, out of hours). Persisted notification body: `Clock starts Tue 18 Aug 08:00 MYT · respond by Tue 18 Aug 09:00 MYT` (Mon was a holiday — the clock jumped a day, exactly the ambiguity the line exists for). Same body all channels; in_app/whatsapp/web_push sent, email queued. In-hours: `Respond by <due MYT>` unconditional; after first response: `Resolve by <due_at_resolution MYT>`; escalation body appends the same line; U+00B7 survives the WhatsApp sanitizer (pinned). 9 tests green | done | peer |
| P9 | Live spine's `next-assignee` 404s cleared — 4 of the 10 most recent live executions already error there | check recent executions before the canary | us |

⚠️ P9 — DIAGNOSED 2026-08-12, and it is a live customer-facing failure, not just canary noise.
`POST /external/next-assignee` returns 404 for SOME CONTACTS DETERMINISTICALLY: 4 of the 10
retained live executions die at `get-round-robin-assignee`. Same `agent=incoming_stock_enquiries,
team=purchasing` succeeds for +60165622487 and fails for +60167751178 — the only variable that
tracks the outcome is the contact. Per-contact: +60167751178 0ok/3err, +60166611178 0ok/1err;
three other contacts 6ok/0err. Failing execs 12173314, 12172778, 12162100, 12152090.

The customer is told "we are directing your enquiry to the correct person" by `…routed-to-pic2`
BEFORE this call, so an affected customer is promised help and then gets nothing, forever.
Raised with the CRM peer (they own the endpoint); hypothesis is contact→company resolution.
Post-flip the ticket create is what guarantees visibility — but it sits DOWNSTREAM of this 404,
so it would never run for these contacts either. Fix or understand before the flip.

⚠️ P1 is upgraded to a PROD check (delta-review D4) because the fail-loud sentinel converts a
missing `in_working_hours` into a customer-visible dead end: the contact has already received the
"directing your enquiry" ack, the ticket and comment are created, and then the execution errors
with no final message. A dev-only verification is not enough for a field that behaves that way.

⚠️ P3 is currently UNVERIFIABLE — the redis-read helper is still blocked (see the tooling-gap
section; fourth session to ask). Either the helper lands, or P3 is checked some other way, or the
flip proceeds with a stated unknown about stranded queue items. Do not silently skip it.

⚠️ P3 exists because `schedule-working-day-detection` (`ss9S83XF7ZtmnaUyFtYZc`) is the ONLY
consumer of that queue. Items sitting in it at flip time are stranded enquiries — the reworked
sub never pushes again, and the drain only runs at working-day start.

## Step 0 — SHIP THE SPINE CALLER HUNK FIRST, ON ITS OWN (delta-review recommendation)

Do Step 2c's spine edit as a standalone promote BEFORE the rest of the flip, not inside the
window. Rationale: against today's live sub it is a strict no-op (the sub reads `input_message`
only for sendmsg inputs that no node consumes), so it carries no pairing requirement; it rolls
back in one line; and **one real intervention afterwards proves `input_message` arrives non-null**
— which is the only way to close blocker D1, since the fix has never executed anywhere. Doing it
early also de-risks the window: if `removed: false` turns out not to be the operative flag, we
learn it on a no-op change instead of mid-flip.

Verify after: a live execution of `rrYXzE61gCNUck_zmXe-G` shows `input_message` non-null on the
trigger. Today's executions (12261948, 12184876) show `null` — that is the before-picture.

## Step 1 — Back up live (ALL THREE targets)

REST GET each to the scratchpad (NOT the repo — full GETs are secrets at rest):
- sub `rrYXzE61gCNUck_zmXe-G` → versionId `5018a189-22df-4cb9-aa89-fa509377abe9`
- close-convo `-WkzJMQZHmsFQm6A2abLJ` → versionId `4a2e963d-dd2a-443e-bbb1-68b43ee29744`
- **spine `9qVyfUxmRQqrpGRMDLRuz` → versionId `469e7259-6cfb-4505-bef4-f37a36bf454f`**
  (was missing from this list — delta-review D2; the spine is in flip scope via Step 2c/Step 0)

Those three versionIds ARE the rollback. Record them in the run log before touching anything.

⚠️ PUT-body hygiene for every target: build the body from `{name, nodes, connections, settings}`
ONLY. Never echo `pinData` — the API accepts it, so it will not fail loudly; it will just ship
pinned test data to a live workflow. `settings` MERGES rather than replaces. Strip
`settings.binaryMode` (spine + sub) and `settings.timeSavedMode` (sub). The spine's settings are
`{availableInMCP, binaryMode, callerPolicy, executionOrder}` — only `binaryMode` needs stripping
there. `settings.timezone` on the sub is unproven against the public schema; strip it too unless
a PUT proves otherwise.

## Step 2 — Build the promote payload as LIVE + own hunks (NOT a fork copy)

Per `[[stale-byte-identical-fork-claim]]`: do **not** PUT the fork's JSON. Start from live's
current GET and apply only these five REWORK hunks, by node NAME:

1. `if-conversation-unassigned` — delete the `is_working_hours` condition
   (id `ba3b3fbe-0d12-45e2-bccb-e716b5f11081`); keep only `is_already_assigned` is-false.
2. Connections: `if-conversation-unassigned.main[1]` → `conversation-sla-tracking-create`
   (was `comment-switch`). Create ends with two inbound edges.
3. `conversation-sla-tracking-create` — URL to `.../conversation-sla-tracking/integration`;
   body to the hardened form (see node-diff §3/§3a — `JSON.stringify(x ?? '')` on
   phone/agent/team, `assigned_to_id`, quoted `source_message_id`, `source_message_text`).
4. ADD `if-in-working-hours` (params byte-identical to fork sha `722d7448d591`, incl. the
   `?? 'MISSING_IN_WORKING_HOURS'` fail-loud sentinel); rewire
   `Call 'sub-add-comment-respond'` → it; TRUE → `return-assignee`, FALSE → `get-working-days`.
5. DELETE `comment-switch`, `Redis`, `Call 'sub-add-comment-respond'1`.

**Harness that must NOT appear in the payload** (fork-only, strip): `chat?`,
`chat-escalation-push`, the 3 sendmsg callers repointed to `69RhomhiCH4bpY1w` (live keeps
`aoydkG1dbItXR5jXFEQsP`), the fork's `test-guard-record` wording (live keeps its own).
Live's `test-guard` / `test-guard-record` and the trigger→test-guard edge stay exactly as live
has them.

✅ **The fork↔live delta is now a `git diff`.** All three durable S3.2 targets were added to the
export set 2026-08-13 (`scripts/export-workflows.py` TARGETS): `live-sub-human-intervention`
(5018a189), `sub-human-intervention-FORK` (16eadb1e), `live-respond-close-convo` (4a2e963d).
Run `--verify` first, then diff `export/live-sub-human-intervention/` against
`export/sub-human-intervention-FORK/`. This also gives both promote targets a staleness gate they
did not have while the change was in flight.

Delta re-derived from the fresh exports (**third independent derivation; agrees with the
reviewer's recount exactly** — 3 deleted, 3 added, 6 changed, 7 identical of 16 nodes):

| bucket | nodes | at promote |
|---|---|---|
| only in LIVE | `comment-switch`, `Redis`, `Call 'sub-add-comment-respond'1` | DELETE (rework) |
| only in FORK | `if-in-working-hours` | KEEP (rework) |
| only in FORK | `chat?`, `chat-escalation-push` | STRIP (harness) |
| changed | `conversation-sla-tracking-create`, `if-conversation-unassigned` | KEEP (rework) |
| changed | the 3 `…routed-to-pic*` callers, `test-guard-record` | STRIP (harness — live's own form) |

Gate values confirmed against the exported fork: `69RhomhiCH4bpY1w` appears **6** times in the
fork (each of the 3 callers carries it in `value` AND `cachedResultUrl`) and
`aoydkG1dbItXR5jXFEQsP` appears **0**. So the promoted payload must invert that exactly:
`aoydkG1dbItXR5jXFEQsP` × 6, `69RhomhiCH4bpY1w` × 0.

Pre-PUT assertions on the payload: zero occurrences of `69RhomhiCH4bpY1w`, `chat:reply:`,
`sorento-respond-assignee-queue`, `is_test` scaffolding beyond what live already carries; all
three sendmsg callers point at `aoydkG1dbItXR5jXFEQsP`; no trailing whitespace in expressions.

## Step 2b — REVIEWER FINDINGS that change this runbook (2026-08-12, REQUEST-CHANGES)

- **F2 (fixes Step 3 before it fails):** live's `settings` carry `binaryMode: "separate"` and
  `timeSavedMode: "fixed"`, which the PUBLIC workflow schema REJECTS. The Step-3 PUT would 400
  as written. Strip both keys from the payload (`del(.settings.binaryMode, .settings.timeSavedMode)`).
  Fails safe — pre-write — but it would stall a gated window.
- **Strip-list gate value CORRECTED:** `aoydkG1dbItXR5jXFEQsP` must appear **6** times in the
  promoted payload, not 3 — each sendmsg caller carries it in `value` AND in `cachedResultUrl`.
  The reviewer independently recomputed the fork↔live delta twice and confirms the Step-2 strip
  list is otherwise COMPLETE (3 only-live, 3 only-fork, 6 changed, 7 identical), including the
  trigger→`chat?` edge removal.
- **F1 (BLOCKER) adds a FOURTH live workflow to flip scope — the SPINE.** See Step 2c.
- **F3 (MEDIUM, open):** on the already-assigned branch, n8n sends the ROUND-ROBIN pick as
  `assigned_to_id` while respond.io keeps the conversation on someone else (live exec 12199710:
  Jereen vs Josephine). The deleted `Call '…respond'1` used to tag the real owner. Knock-on: the
  peer's planned `agent-replied` endpoint keys on (contact, replying user), so the actual replier
  won't match the ticket owner → clock never stops → false breach while a human is answering.
  BLOCKED on the peer confirming (a) whether the backend honours `assigned_to_id` at all, and
  (b) who should own a ticket raised on an already-assigned conversation.

## Step 2c — SPINE caller hunk (`9qVyfUxmRQqrpGRMDLRuz`) — REQUIRED, was missing

Verified directly: `Call 'sub-human-intervention'` maps 9 inputs on the live spine and NEITHER
spine nor clone maps **`input_message`**. The sub declares it, the reworked create body sends
`source_message_text: JSON.stringify(input_message || '')`, so the CRM worklist snippet would be
`""` on every real intervention. Three sendmsg callers inside the sub have also been reading it
as null all along (pre-existing).

✅ BUILT on the clone `txiPzSxy3Pclsz6v` (`be62b3a8` → `a01871ab`, exactly one node changed).
Full evidence + the copy-pasteable promote hunk:
`../tests/diffs/intervention-tickets-s32/caller-input-message-fix.md`.

Hunk — TWO edits to `Call 'sub-human-intervention'`, both required:
1. add key `input_message` to `parameters.workflowInputs.value` (expression below);
2. **set that field's `parameters.workflowInputs.schema[id=input_message].removed` to `false`**
   — it is `true` on both spine and clone today.

⚠️ Edit 2 was missed on the first pass and caught by the delta review. A `value` key whose schema
entry says `removed: true` is a shape found NOWHERE else in the instance (all 7 working
precedents are `removed: false` or have no schema entry at all), so it is unproven that n8n
transmits it — and if it doesn't, the flip silently reproduces F1 under a review saying it was
fixed. The canonical working caller `sorento-sub-respond-sendmsg-respond2` carries
`removed: false` + present-in-value; mirror that exactly. (Clone now at `6cd67cbf`, fixed.)
Note `started_at` remains `removed: true` and absent from value on both — untouched, see below.

Expression uses `$('tf-message')` by-name reads only:

```
={{ $('tf-message').first().json.message.message.text || $('tf-message').first().json.message.message.attachment?.description || '[' + ($('tf-message').first().json.message.message.type || 'unknown') + ' message]' }}{{ $('tf-message').first().json.message.replyTo?.message ? ' reply to: ' + $('tf-message').first().json.message.replyTo.message.text : '' }}
```

⚠️ Do NOT transcribe the canonical spine form used by 4 other callers: it ends in
`|| $json.message`, which is POSITION-DEPENDENT and would bind to a different object at this
node, and its `attachment.description` lacks optional chaining (throws on every text message).

Rollback for the spine is its own prior versionId — capture it in Step 1 alongside the other two.

## Step 3 — PUT live sub, verify

REST PUT (auto-publishes). Then re-GET: `versionId == activeVersionId`, new versionId recorded,
the five hunks present, credentials intact (expect `crm-n8n-auth` ×3, `sorento-api` ×1,
`sorento-redis` ×1 — one fewer than today, the deleted `Redis` node's).

## Step 4 — PUT `respond-close-convo` in the SAME window — REDESIGNED 2026-08-15 (user decision: INERT LAUNCH)

🔴 **User decision 2026-08-15, overrides the CRM plan's "accept the transition escalation noise":**
rollout needs staff training and is not a one-day thing, so **production must be inert at launch**.
Concretely: a Respond close KEEPS resolving tickets, and an agent reply in Respond KEEPS marking
responded — both under multi-open, both behind a config flag that is flipped OFF later, once staff
are trained to resolve from the CRM. Day one, nothing about staff's Respond workflow changes; the
CRM just starts holding correct per-enquiry data. This DEFERS the CRM's AC-E4 ("Respond close
resolves nothing") and AC-C3's no-Respond-call clause to the flag flip — a contract change, sent
to the peer.

**Close semantic (user-confirmed): resolve ALL open tickets for the contact.** Matches what
staff expect today ("I closed it, we're done"). It also FIXES today's raw SQL, which resolves
every conversation row for the contact with no `is_resolved` filter and no LIMIT.

**Exactly ONE "Your conversation is marked as closed and resolved…" message per close event
(user-confirmed).** ⚠️ Today this holds only by ACCIDENT: the SQL returns N rows, every downstream
node fans out N times (N resolves, N unassigns, N event-logs), and the ONLY reason the contact
gets one message is that `Update a Contact` happens to carry `executeOnce: true`, collapsing the
stream before the sendmsg node. Nobody designed that. The rework makes once-per-close EXPLICIT on
the message leg (a deliberate collapse node, or `executeOnce` on the gate itself, with a comment
saying why) so a future edit to `Update a Contact` cannot turn one message into N.

Target shape:

```
Respond.io Trigger (conversationClosed)
→ SQL: SELECT id FROM conversation_sla_tracking … WHERE contact = … AND is_resolved = false AND conversation scope
→ If(any rows)
   TRUE  → flag check `close_resolves_tickets` (redis config, same pattern as ht-cfg-*)
            true  → PUT is_resolved per row (per-item fan-out is CORRECT here) → event-log per row
            false → skip resolve (CRM-only resolve phase)
→ [collapse to ONE item — explicit]
→ open-count gate: GET /external/conversation-sla-tracking/open-count?contact_id=…
     count == 0 → unassign + clear is_human_intervened + ONE closing message
     count  > 0 → stop (only reachable once the flag is off; under the flag count is always 0)
```

Under the flag the gate is inert-by-construction (resolve-all just ran, count is 0, message
always sends — identical to today). After the flip it becomes load-bearing.

**Sequencing consequence for the CRM:** their BE hardening #133 (reject conversation-scope
`is_resolved` from API-key principals) would BREAK the inert phase — it must land AFTER the flag
is flipped off, not "same day post-flip" as previously agreed. Sent to the peer.

Endpoint dependency unchanged: `open-count` (always-200, `{contact_id, open_count}`) is in CRM PR
#137, not deployed. Do not wire a placeholder.

### Step 4 — USER DECISION 2026-08-15 (later, supersedes the flag mechanism below): TWO WORKFLOWS, ACTIVATE/DEACTIVATE IS THE SWITCH

The CRM close lane is a **separate n8n workflow**, not a second trigger inside close-convo:
- **Launch**: `respond-close-convo` (Respond trigger, resolve-all-open under the inert semantic)
  ACTIVE · new `crm-close-convo` (webhook, secret gate, event_id dedup, message only) INACTIVE.
- **Switchover** (staff trained): deactivate the Respond lane, activate the CRM lane. Visible in
  the workflow list; rollback = re-activate. Same intent as the `close_resolves_tickets` flag,
  cleaner form — prefer this. Both lanes share the message leg via a sub.
- Known, user-accepted tradeoff: during launch a CRM-screen resolve sends the customer NO closing
  message. Tell staff.
- Ask to CRM: leave `N8N_CLOSE_CONVO_WEBHOOK_URL` UNSET until switchover (their spec: unset =
  skipped with a warning), rather than retrying into an inactive webhook's 404 for weeks.

🔴 **LOOP CHECK — CONFIRMED REAL (user's instinct was right), fix in progress at the source.**
CRM code-verified 2026-08-15: `_notify_close_convo_webhook_best_effort` fires inside
`ConversationSLATrackingService.update_tracking` (`sla_service.py` ~4636-4642) on ANY resolve that
empties the contact's open set, **principal-agnostic** — and the API-key `PUT /{tracking_id}` route
(~1608, `get_current_user_or_api_key`) reaches the same method. So as built, a staff Respond close
→ lane B resolves via PUT → S4.5 webhook → lane A → SECOND closing message. Fix (CRM coder briefed,
own commit + tests): `update_tracking` takes a resolve origin; the PUT route passes `api_key` for
API-key principals; the close webhook fires ONLY for user-origin resolves. RQ Respond close
unchanged. **Do not consider the loop closed until the peer confirms the commit + test output.**
Precondition P10 added. Under the two-workflow launch the loop is impossible regardless (lane A
inactive); the fix matters at switchover / any mixed period.

CRM-side launch procedure confirmed: `N8N_CLOSE_CONVO_WEBHOOK_URL` UNSET on prod until switchover
(unset → warn + skip, no outbox row); retries bounded (`max_retry_allowed` default 3, exponential
backoff, then parked failed). Recorded in their PLAN S4.5.

**Belt-and-braces regardless of the answer**: per-contact `SETNX close:msg:{contact_id} EX 60` on
the closing-message send — "one closing message per contact per 60 s" — enforces the user's rule
under any path, including loops nobody has thought of.

### Step 4 addendum 2026-08-15 — DUAL-TRIGGER close-convo (CRM S4.5, as-built)

The CRM now calls n8n DIRECTLY on a CRM-side resolve that empties the contact's open set
(S4.5, built 2026-08-15): `POST <N8N_CLOSE_CONVO_WEBHOOK_URL>`, header `X-CRM-Webhook-Secret`
(same secret machinery as S4.1), single JSON object `{event:"ticket_resolved", event_id (uuid5 of
tracking_id:resolved_at — idempotency key, identical across retries), source:"User",
closedBySource:"crm", tracking_id, contact{respond_io_id,phone}, resolved_by{respond_user_id|null,
crm_user_id, name, display_name — never blank}, resolved_at (UTC Z), team_name, category, summary,
open_ticket_count (0 by construction), crm{business_table,business_id}}`. Full text: PLAN S4.5.

**AND the pre-existing best-effort RQ Respond conversation-close job is UNCHANGED and still fires
on the same gate** ("the webhook is additive"). So one CRM resolve produces TWO signals into n8n:
the direct webhook, and a Respond `conversationClosed` event. **Without a gate that is two
closing messages — a violation of the user's one-message rule.**

close-convo therefore becomes dual-trigger, mirroring `respond-send-user`:

```
[A] Webhook trigger (new path; NOT live's a38a6c3a… — that is respond-send-user's)
     → secret gate (reuse the S4.1 pattern: sha256-in-redis; `$env` is BLOCKED in Code nodes — measured)
     → idempotency: SETNX close:event:{event_id} EX 86400 — drop if already seen
     → NO ticket resolve (already resolved CRM-side; open_ticket_count is 0 by construction)
     → converge ↓
[B] Respond.io Trigger (conversationClosed)
     → SOURCE GATE — see below
     → flag `close_resolves_tickets` → resolve-all-open per row (SQL scoped, is_resolved=false)
     → converge ↓
[collapse to ONE item — explicit]
→ open-count gate → unassign + clear is_human_intervened + ONE closing message
```

**Source gate — how to drop the CRM's API close on lane [B].** The peer's plan says "gate on
`closedBySource == "user"`". ⚠️ `closedBySource` is a field the CRM INVENTS in its own webhook
body; whether Respond's `conversationClosed` payload carries an equivalent is UNVERIFIED — there
are 0 retained close-convo executions to inspect and the live nodes read only
`conversation.closedBy.id`. Do NOT build a gate on an unverified payload field. Use the trigger
node's own filter instead: live's `Respond.io Trigger` carries
`"eventSource": ["user","api","n8n"]` (verified in the export). Set it to **`["user"]`** so the
CRM's API-originated close never even starts an execution. That is an allowlist, so it fails
closed on anything unknown, and it depends on nothing in the payload.

✅ **LOCKED 2026-08-15, both sides verified.** CRM side (peer read the code): their ONLY close
path is `RespondClient.close_conversation` (`integration_service.py:323`), a direct httpx POST to
`api.respond.io/v2/contact/{id}/conversation/status`, run from RQ task `respond_io_tasks.py:462`
— nothing CRM-side closes through n8n, so it lands as source `api`. n8n side (I enumerated every
workflow on the instance): **zero** workflows close a Respond conversation, so nothing legitimate
arrives as `n8n`. Therefore `eventSource: ["user"]` exactly. `closedBySource` stays in lane A's
body as informational only, never a gate.

Idempotency across the two lanes is by construction: [A] dedups on `event_id`; [B] never fires
for the CRM close once the source gate is in; a manual Respond-app close is `user` and has no
[A] counterpart. So each real-world close → exactly one message.

Under the inert flag: manual Respond close → [B] → resolve-all → one message (today's behaviour).
CRM resolve of the last ticket → [A] → one message; its Respond echo dropped at [B]. After the
flag flips: [B] stops resolving; the open-count gate becomes load-bearing on both lanes.

**NEW LANE, not S3.2 scope — the `comment.created` forwarder does NOT EXIST yet.** Enumerated
every Respond trigger on the instance (2026-08-15): `newContact`, `contactUpdated`×2,
`contactAssigneeUpdated`, `conversationClosed`, `newOutgoingMessage` — no comment event, and no
workflow references the CRM ingest `POST /api/v1/external/chat-history/comments`. Peer confirms:
AC-L3's "when n8n forwards comment.created events" names a lane the CRM built the RECEIVING half
of; the n8n half is a fresh plan → build → test → promote slice, user's call. Contract when built:
`X-API-Key`, body `{contact_id (respond_io_id) | phone_number, comment_id REQUIRED (idempotency —
ingest 400s without it), text, author_respond_user_id?, author_name?, created_at? epoch ms}`.
Recommend a small dedicated workflow on the Respond comment trigger (verify the event's exact
name on this instance first) rather than bolting onto the spine.

## Step 4b — `respond-send-user` (`eG3AA-TWo17-E1-DlHLnH`) — NEWLY FOUND SCOPE, blocked on contract

Found 2026-08-12 by enumerating every ACTIVE workflow touching conversation SLA (there are FIVE,
not the three previously scoped). This is the agent-reply → `is_responded` path (the peer's R3).

Its Postgres SELECT on `conversation_sla_tracking` filters on exactly:
`policy_id = <arbitrary first row of sla_policies>` · `is_responded = false` ·
`assigned_to = <replying Respond user id>` — **no contact predicate at all**. The downstream PUT
runs once per row, so ONE agent reply stamps `is_responded` on EVERY unresponded ticket that
agent owns, across all contacts.

⚠️ This is wrong TODAY under the singleton model (an agent with open rows for 5 contacts who
replies to one marks all 5 responded), so live response/breach metrics are optimistically wrong.
Multi-open multiplies it. It is NOT caused by the intervention-tickets branch.

🚨 **SEQUENCING LANDMINE — two bugs are partially cancelling** (peer data check 2026-08-12).
`SELECT sp.id FROM sla_policies LIMIT 1` is unordered and currently returns the NORMAL policy,
while open unresponded rows split NORMAL/WAREHOUSE. So the *broken* policy predicate is
accidentally NARROWING the blast radius — WAREHOUSE rows are invisible to the bulk stamp today.
**Anyone who "tidies" the policy lookup without adding the contact predicate makes the damage
strictly worse.** Contact scoping first, or both together. Never the policy fix alone.

Peer's data also confirms the gun is loaded: one assignee currently holds 5 open unresponded rows
across 5 distinct contacts (another holds 2 across 2). Their fingerprint query found zero
clusters, but on a 21-row dev snapshot that clears nothing — prod is unqueried.

RESOLUTION — peer chose option (iii) and is building it. Locked shape:
`POST /api/v1/external/conversation-sla-tracking/agent-replied`, auth `X-API-Key`, ALWAYS 200.
Body `{contact_id, replied_by, replied_at?}`; response
`{matched, tracking_id, skipped_reason: null|"ambiguous"|"no_open_ticket"|"already_responded", open_ticket_count}`.
Server applies AC-E3 in one place: exactly one open unanswered ticket for that (contact, user) →
stamp it; 2+ → no clock change, `ambiguous`; zero → `no_open_ticket`.

n8n side once it exists (DO NOT BUILD YET — peer says wait for confirmation the route is live):
delete the `Execute a SQL query` policy lookup, the `Select rows from a table` Postgres SELECT,
the per-row `conversation-sla-tracking-update` PUT and `conversation-sla-event-tracking-create`
(the server writes the event log); replace with ONE call to `agent-replied`. No raw SQL, no
per-row fan-out, no policy_id anywhere.

Signal preservation: the peer's respond-idempotency fix (400 → 200 no-op) would otherwise absorb
the bulk stamps and delete the only current evidence; the new endpoint logs `ambiguous` /
`no_open_ticket` outcomes to `integration_log`, so the signal moves rather than disappears.

📌 Config check inherited from the S4.1 slice (same workflow, different session): at deploy,
verify `system_settings.n8n_crm_chat_outbound_webhook_url` on **prod** holds the real value
`https://automate-sorento.foundryx.my/webhook/a38a6c3a-1d70-43f4-8424-4b63a39283b3` — that path
belongs to live `respond-send-user`'s `Webhook` node. Dev currently holds a mangled literal
(`https://webhook/a38a6c3a-…`) and must be fixed at flip. The S4.1 fork
`GszqvOIDfGgUO0BC` (`respond-send-user S41-FORK`, `3b621aca`, 27 nodes, **inactive**) uses a
DISTINCT path `s41-fork-3f7c1a92-…` — keep it distinct; two workflows registering `a38a6c3a-…`
is not a thing to discover mid-flip.

⚠️ **CONCURRENT EDITING — `respond-send-user` is being changed by another session.** It moved from
`c23ce991` to `9b779edd` (updatedAt 2026-08-12T22:07Z) while this work was in flight, gaining ten
`ht-*` nodes (the human-intervened-timeout S4 feature). The Postgres SELECT this finding is about
is UNCHANGED, so the defect stands — but whoever performs Step 4b must re-read the workflow
immediately beforehand and rebase onto whatever the timeout feature has landed. Do not PUT a body
derived from a snapshot taken earlier in this cycle, or S4 gets silently reverted
(see the agent-death / stale-snapshot landmines in LESSONS).

## Step 4c — `schedule-sla-policy-checker` (`7lFff6i_udSxyUbCMdTuD`) — AC-E5 ambiguity, peer-side

Escalation posts `{respond_contact_id, policy_id, escalation_reason}` to
`.../integration/escalate` — contact-scoped, no `tracking_id`. Peer checked both ends:
- `GET /integration/due-escalations` DOES return one item per ROW (good — breaching siblings are
  visible to the scheduler; my earlier worry was unfounded).
- `POST /integration/escalate` resolves the MOST-RECENT open row, and its schema comment still
  says "one-open-per-contact". So the scheduler can escalate the WRONG sibling even though
  due-escalations correctly named the right one.

Peer is adding an optional `tracking_id` to escalate, taking precedence over contact+policy
(contact path stays for back-compat). n8n change is then a one-field pass-through of the `id`
due-escalations already returns per item. DO NOT BUILD until the peer confirms the field name.

## Step 5 — Canary (dev contact 437264483 only)

One real intervention through the live path with the user's own WhatsApp contact. Assert:
a ticket row is created (CRM worklist shows it), the in-hours copy is chosen, the SLA comment
carries MYT-converted times, and — the actual point of the change — a SECOND enquiry from the
same contact while the first is open creates a SECOND ticket rather than dying silently.

Then: `python3 n8n-workflows-init/scripts/export-workflows.py` and commit the artifacts.

## Rollback (any step)

Publish the prior versionId: live sub → `5018a189-22df-4cb9-aa89-fa509377abe9`,
respond-close-convo → `4a2e963d-dd2a-443e-bbb1-68b43ee29744`. Rolling back the sub alone is
safe; rolling back close-convo alone is NOT (leaves always-create + mass-resolve together).

## Post-flip tidy (not in the gated window)

- Peer ships BE hardening #133 (reject conversation-scope `is_resolved` from API-key principals)
  same day.
- Remove the now-dead drain leg from `schedule-working-day-detection`.
- Delete the throwaway `mTfA5b9TgHItWo2g` after reviewer sign-off.
- `sub-add-comment-respond` (`2l8egTLJbyGOPvG-DbtDX`) is an UNGUARDED live sub — no `is_test`
  check at all. Not a flip blocker, but it is why the V2 matrix needed a full test double.
  Worth guarding on its own ticket.

## CRM side — PR #137 (open, NOT merged, NOT deployed)

Carries everything this runbook is blocked on: `GET .../open-count` (always 200,
`{contact_id, open_count}`, conversation scope) for the Step-4 gate; `POST .../agent-replied`
(always 200, `{matched, tracking_id, skipped_reason, open_ticket_count}`, contact-first AC-E3
applied server-side, idempotent, logs every outcome incl. skips) which retires the Step-4b raw
SQL; optional `tracking_id` on `/integration/escalate` for Step 4c; and `in_working_hours` pinned
by contract test on all three response shapes, which is what our fail-loud sentinel relies on.

NONE of it is wired here. All three stay specced-not-built until the routes are live in prod.

⚠️ `open_ticket_count` means OPEN on `open-count` but OPEN-AND-UNANSWERED on `agent-replied` —
same field name, different denominators. Never compare them across the two endpoints.

⚠️ `agent-replied` currently inherits `.view` from its router mount, so a write that mutates SLA
clocks is reachable by any read-only principal. Deliberate (a new write slug without a grant
migration would 403 the integration in prod), scheduled for a post-flip permission slice. Raised
with the peer to record it as a known gap rather than a chat message, and to consider an interim
API-key restriction. Track it — if the permission slice slips, this is what nobody remembers.

## Open tooling gap — the S7a/S7b redis read (needs the user's go)

Three tester sessions in a row have been unable to discharge the §0 redis gates by reading redis;
they asserted egress from runData payloads instead and flagged it honestly each time. Cause,
now confirmed: `.env` carries redis list NAMES only (`REDIS_TEST_MSG_LIST`,
`REDIS_EGRESS_KEY_PREFIX`) — no host, port or password. The redis is reachable only from inside
the n8n instance via the `sorento-redis` credential (`H5w6o7tptzTPMVdy`). The existing
`zz-canary-read` (`LLIbMXAixexM9Cwc`) cannot fill the gap: it is INACTIVE, uses a `manualTrigger`,
and hardcodes one egress key.

Proposed fix (BLOCKED — creating a workflow was denied by the permission classifier; needs the
user to approve or to create it): a small `zz-redis-read` helper —
`executeWorkflowTrigger(key)` → Code guard → `llen` → `lrange`, driven by `test_workflow` with
the trigger pinned. Two deliberate properties: no webhook (so no public surface), and a key
ALLOWLIST in the guard (`test:egress:`, `sorento-respond-message*`, `main-message-list*`,
`sorento-respond-assignee-queue`, `chat:reply:`) so the helper can never read arbitrary keys.

Not a blocker for THIS change: the matrix ran against a double whose S8 sweep is clean, so no
real-egress path exists to observe. It IS a blocker for treating §0 S7 as discharged-by-evidence
rather than discharged-by-construction on future changes — and the queue-empty precondition P3
of this very runbook needs a redis read at flip time.
