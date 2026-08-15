# S3.2 — sub-human-intervention rework for conversation intervention tickets

Status: CONTRACT LOCKED (peer answers 2026-08-12, verified against sla_tracking.py on their
branch) — buildable end-to-end on the fork. Flip is user-gated.
Contract (CRM repo, branch `feat/conversation-intervention-tickets`):
`documentation/plans/sla/conversation-intervention-tickets-acceptance-criteria.md` (§A, no-regression)
+ `PLAN-conversation-intervention-tickets.md` (S3.2) + the S1.4 header of
`sorento_crm_frontend/.../services/interventionTicketService.ts`.

## Targets

| thing | id | role |
|---|---|---|
| live sub (NEVER edit; promote target, user-gated) | `rrYXzE61gCNUck_zmXe-G` | production |
| build target — fork the clone calls | `vUfFUDjLAuMaeQE6` (`sub-human-intervention TEST (delta3)`) | build/test |
| resolve-on-close workflow (separate, ACTIVE — in flip scope) | `-WkzJMQZHmsFQm6A2abLJ` (`respond-close-convo`) | must stop resolving conversation rows at flip |
| out-of-hours queue drain (goes dead after flip) | `ss9S83XF7ZtmnaUyFtYZc` (`schedule-working-day-detection`) | flip precondition: `LLEN sorento-respond-assignee-queue == 0` |

## Fork state (diffed vs live 2026-08-12, fork versionId 344e1a83…, live 5018a189…)

Fork = live + harness hunks ONLY, plus one drifted expression:
- harness (KEEP on fork, STRIP at promote): `chat?` + `chat-escalation-push` (chat-console reply
  push to `chat:reply:{chat_id}`); 3 sendmsg callers repointed `aoydkG1dbItXR5jXFEQsP` →
  `69RhomhiCH4bpY1w` (`zz-sub-sendmsg-BLOBTEST`); `test-guard-record` payload wording.
- drift (REBASE to live's form before layering): `Call 'sub-add-comment-respond'` comment
  expression (fork uses `.toDateTime()`, live uses `DateTime.fromISO(...)` — live wins).

## Business change (the promotable diff)

Current live routing after test-guard FALSE:

```
routed-to-pic2 ("directing your enquiry" ack)
→ get-round-robin-assignee (POST /external/next-assignee)
→ if-conversation-unassigned (unassigned AND working-hours)
   TRUE : Assign(respond.io) → conversation-sla-tracking-create → comment → return-assignee → sendmsg "routed to PIC"
   FALSE: comment-switch
      A_W  (assigned & working): comment1 (tag only — NO create: the lost-enquiry bug) → sendmsg "routed to PIC"
      A_NW (!working)          : Redis RPUSH sorento-respond-assignee-queue → get-working-days → sendmsg out-of-hours
```

Target routing (per contract items 1–4):

```
routed-to-pic2 (unchanged ack)
→ get-round-robin-assignee (unchanged)
→ if-conversation-unassigned — condition NARROWED to `is_already_assigned == false` only
   TRUE : Assign(respond.io, cosmetic)      ─┐
   FALSE: (nothing — skip assign)           ─┴→ conversation-sla-tracking-create  (ALWAYS, both branches)
→ Call 'sub-add-comment-respond' (SLA-alert comment, existing node, now both branches)
→ if-in-working-hours (NEW if node on $('conversation-sla-tracking-create').first().json.in_working_hours)
   TRUE : return-assignee → sendmsg "routed to PIC"            (existing pair)
   FALSE: get-working-days → sendmsg out-of-hours copy         (existing pair)
```

Node edit list on the fork:
1. `if-conversation-unassigned`: delete the `is_working_hours` condition; keep only
   `is_already_assigned == false`.
2. Wire `if-conversation-unassigned` FALSE output → `conversation-sla-tracking-create`
   (create gains a second inbound edge; its expressions read `$('get-round-robin-assignee')`
   by name, so both paths resolve — verify in runData, TOPOLOGY "reads BY NAME" rule).
3. `conversation-sla-tracking-create` — LOCKED shape:
   - URL → `POST https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration`
     (the ONLY route whose response carries `in_working_hours`; bare `POST /` does not).
   - Body (drop `policy_id` + `current_tier` — accepted but ignored; backend resolves policy
     from (agent_code, team_set_code) and forces tier 1):
     ```json
     {
         "assigned_to_id": "{{ $('get-round-robin-assignee').item.json.assignee_id }}",
         "contact_phone_number": "{{ $('When Executed by Another Workflow').first().json.contact_phone_number }}",
         "agent_code": "{{ $('When Executed by Another Workflow').first().json.agent }}",
         "team_set_code": "{{ $('When Executed by Another Workflow').first().json.team }}",
         "message_id": {{ $('When Executed by Another Workflow').first().json.message_id }},
         "source_message_id": "{{ $('When Executed by Another Workflow').first().json.message_id }}",
         "source_message_text": {{ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }}
     }
     ```
     `source_message_id` quoted STRING; `message_id` stays as today (BeforeValidator coerces);
     `source_message_text` JSON.stringify'd — it becomes the worklist enquiry snippet.
   - HARDENING (coder finding 2026-08-12, throwaway build): `contact_phone_number`,
     `agent_code`, `team_set_code` were interpolated raw between quote chars — a `"`, `\` or
     newline in any of them malforms the body (latent on live today too). Fix: emit all three
     via `{{ JSON.stringify(x ?? '') }}` (unquoted key in the template, stringify supplies the
     quotes), matching `source_message_text`'s pattern. Throwaway create stand-in must carry
     the same transplanted expressions so tested bytes == promoted bytes.
   - Response (every call, insert and retry): {status, message, tracking_id, is_update,
     already_active, in_working_hours, initiated_at, due_at, due_at_resolution, assigned_to,
     assigned_to_id}.
4. NEW `if-in-working-hours` between comment and the two reply pairs, keyed on the CREATE
   RESPONSE's `in_working_hours` (not next-assignee's `is_working_hours`).
   - FAIL-LOUD (amended 2026-08-12 after case (f) proved `typeValidation:"strict"` alone routes an
     ABSENT key silently FALSE): `leftValue` coalesces the missing case to a sentinel string —
     `={{ …first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}` — which strict boolean
     validation rejects as a node error, while real `true`/`false` route unchanged.
5. DELETE: `comment-switch`, `Redis` (queue push), `Call 'sub-add-comment-respond'1`
   (the already-assigned tag comment is superseded — CRM notifies the assignee directly;
   the surviving SLA-alert comment covers both branches).
6. No resolve call exists in this sub; resolve-on-close is handled in `respond-close-convo`
   (separate change, same flip).
7. Tidy: rename/position new node; no generic names.

Return value: `return-assignee` reads `assigned_to` from the create response — now reachable on
both branches (in-hours). Out-of-hours path ends at the sendmsg like live does today.
⚠️ Dev replay showed `assigned_to` (TEXT) can hold a legacy respond-user-id-shaped value
("1096809"); `assigned_to_id` is the CRM user UUID. Same field live reads today, so no rework
change — but if anything user-facing consumes `agent_assignee`, prefer `assigned_to_id` or the
next-assignee output (reviewer: check the spine caller).

Contract loop CLOSED pre-deploy 2026-08-12: peer replayed the exact rendered body against the
real dev backend; verbatim responses stored in
`tests/diffs/intervention-tickets-s32/create-response-fixtures.json` and used as the pin-data
fixtures. Datetimes NAIVE UTC ISO; retry keys on `already_active` (comes with `is_update:true`).

## Peer answers (2026-08-12 — all resolved)

- P1/P2. Locked into edit-list item 3 above.
- P3. BOTH, sequenced: the n8n edit to `respond-close-convo` is the PRIMARY guard at flip
  (gate/unpublish its conversation-scope resolve leg); BE hardening (reject conversation-scope
  `is_resolved` from API-key principals) follows in a later deploy — peer opened the ticket.
  Loop note: re-resolving a resolved row is idempotent and the contact-scoped GET returns open
  rows only, so the loop terminates; the real noise is the unassign + contact sendmsg.
- P4. No reachable dev CRM. Instead: send the peer the fork's rendered create-body JSON sample;
  they replay it against their local dev backend and return the actual response JSON —
  contract loop closed pre-deploy with zero prod writes. First live E2E = post-flip canary
  (dev contact 437264483), user-gated.
- Work-calendar read stays (create response carries only the bool, not the window).
- `respond-change-assignee-system` NOT deprecated (only `POST /{id}/sync-assignee` is); it now
  mutates the most-recent open ticket — leave untouched at flip.

## Validation (all zero-egress; UAC family = tests/uac/00-SAFETY + this file)

⚠️ The sub's `test-guard` short-circuits the ENTIRE flow (trigger → guard → egress-record → end).
An `is_test` run executes zero branch logic — as functional verification it is a green that
cannot fail. It remains ONLY as the fail-closed proof.

- V1. Rebase fork onto live's node forms (keep harness hunks), node-diff doc with bundles kept
  separable (harness vs rework).
- V2. Functional matrix — REDESIGNED 2026-08-12 after the tester's §0 S8 halt. S8 (rewritten
  2026-07-21) withdraws pinning as a safety mechanism: no `is_test:false` run against ANY fork
  whose JSON contains a respondio / httpRequest / memoryPostgresChat node, and `test_workflow`
  does NOT pin `executeWorkflow` nodes (they execute normally — and `sub-add-comment-respond`
  `2l8egTLJbyGOPvG-DbtDX` is an UNGUARDED live sub: a real comment with certainty).
  S8-compliant design, per S8's own stand-in pattern:
  * Build `zz-THROWAWAY-s32-pinmatrix` GENERATED programmatically from `fork-after.json`,
    byte-identical except exactly 5 nodes transformed into name-preserving Code stand-ins:
    `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
    `get-round-robin-assignee`, `get-working-days`, `Call 'sub-add-comment-respond'`.
  * The create stand-in RENDERS the real request body (the HTTP node's exact jsonBody
    expressions transplanted into JS) and emits it as `_rendered_body` for assertion, then
    returns the verbatim dev fixture (`create-response-fixtures.json`) selected by a `_case`
    field on the trigger envelope. Round-robin/work-calendar stand-ins likewise case-keyed.
    The comment stand-in renders the SLA-alert comment expression and emits it for assertion.
  * The 3 sendmsg callers STAY (they point at `zz-sub-sendmsg-BLOBTEST` `69RhomhiCH4bpY1w`,
    S8-verified ✅ — sinks to the unconsumed TEST list).
  * Run matrix via `test_workflow` on the throwaway; assert per-node runData + rendered
    payloads. Prove throwaway==fork equality outside the 5 stand-ins in the run doc.
    Throwaway carries the DISPOSABLE naming convention and is deleted after sign-off.
  Cases:
  (a) unassigned + in_working_hours:true → assign path + create + PIC copy
  (b) ASSIGNED + in_working_hours:true → NO assign, create fires, PIC copy   ← the bug fix
  (c) unassigned + in_working_hours:false → create + out-of-hours copy (work-calendar read OK)
  (d) assigned + in_working_hours:false → create + out-of-hours copy
  (e) retry: create pinned with already_active:true → no duplicate downstream side effects
  Assert per-node runData, never execution status. Assert the queue-push node is GONE and no
  RPUSH to `sorento-respond-assignee-queue` occurs in any case.
- V3. Fail-closed: clone-driven uac-mode run (is_test=true) → `test-guard-record` egress entry
  present; §0 gates via sink-delta (S7 LLEN alone unsound).
- V4. Pre-flip E2E only against a NON-prod CRM (P4); a real create against prod is a prod write
  + staff-notification ripple — forbidden. Otherwise first live validation = post-flip canary
  with dev contact 437264483, user-gated.

## Flip-time change #2: respond-close-convo (`-WkzJMQZHmsFQm6A2abLJ`) — spec'd 2026-08-12, NOT built (live workflow, edit only inside the gated flip window)

Verified structure (versionId 4a2e963d…): trigger `conversationClosed` (eventSource user+api+n8n
— so the CRM's AC-C3 best-effort close DOES fire it) → SQL policy → **SQL1:
`SELECT cst.id FROM conversation_sla_tracking … WHERE rc.phone_number = … AND source_entity_type IS NULL`
— RAW SQL, NO `is_resolved=false` filter, NO LIMIT** → If(notEmpty) TRUE →
`conversation-sla-tracking-update` (PUT is_resolved per item!) → event-log create → unassign →
clear `is_human_intervened` → sendmsg "conversation closed" to contact.

⚠️ CORRECTION to the peer's loop analysis: the row lookup is NOT the open-rows-only API GET —
it is raw Postgres returning ALL conversation rows for the contact. The HTTP node runs once per
item, so post-flip a single Respond close event would PUT `is_resolved` on EVERY row,
**including open sibling tickets** — a direct AC-E4 violation, worse than idempotent-noise.
The n8n edit here is mandatory at flip, and the BE hardening ticket is higher-priority than
"follow-up nicety".

Edit at flip (agreed with peer 2026-08-12): rewire `If` TRUE output → open-tickets gate
(below); DELETE `conversation-sla-tracking-update` + `conversation-sla-event-tracking-create`.

NEW open-tickets gate (peer improvement, accepted): before the unassign + closing message,
`GET /api/v1/external/conversation-sla-tracking?contact_id=...` (returns OPEN rows only) →
If EMPTY → proceed (unassign, clear `is_human_intervened`, send closing message);
If NON-EMPTY → stop (a human closing the Respond conversation while sibling tickets are still
open must NOT tell the contact everything is resolved, must not unassign, and must not clear
the intervened flag — the bot would re-engage mid-intervention).

Closing message KEPT (today's contact-facing behavior; killing it = product decision surfaced
in the peer's flip-approval summary). With the gate, the CRM's AC-C3 best-effort close
round-trip is harmless-by-construction. BE hardening #133 sequenced same-day post-flip
(peer side). Rollback = publish prior versionId `4a2e963d-dd2a-443e-bbb1-68b43ee29744`.

## Reviewer notes

- Param-sha tables in `tests/diffs/intervention-tickets-s32/` were computed with
  `json.dumps(..., ensure_ascii=False)`. The default (`ensure_ascii=True`) reproduces 15/16 but
  gives a spurious mismatch on `Call 'sub-add-comment-respond'` (the `⏰` character). Use
  `ensure_ascii=False` when re-running the "change still present" gate.
- `assigned_to` (TEXT) in the create response can hold a legacy respond-user-id-shaped value;
  check what the spine caller does with `agent_assignee` (prefer `assigned_to_id` if user-facing).
- V2 matrix drives the throwaway `mTfA5b9TgHItWo2g` by PINNING the trigger node (the `_case_*`
  keys are deliberately NOT declared trigger inputs — an executeWorkflow call would filter them).
- Case (b)/(d) discriminator is execution shape: `Assign or unassign a Conversation1` ABSENT
  from runData — the reply text is identical either side of the lost-enquiry fix.

## Cutover (S3.3, user-gated)

BE/FE deploy → old flow still green (create is back-compat) → verify
`LLEN sorento-respond-assignee-queue == 0` during working hours → explicit user go →
promote reviewed business diff (harness hunks stripped, sendmsg targets restored to
`aoydkG1dbItXR5jXFEQsP`, hash-gated per MANIFEST) to `rrYXzE61gCNUck_zmXe-G` + the
`respond-close-convo` resolve removal in the same gated window → canary → re-export.
Rollback = publish prior versionId (live 5018a189-22df-4cb9-aa89-fa509377abe9).
