# HANDOFF — S3.2 conversation intervention tickets (n8n side)

Written 2026-08-15. Self-contained: read this plus the four files it points at and you can
continue without the prior conversation. Nothing here is promoted; **all live workflows are
untouched**.

## One-paragraph state

The CRM is moving conversation SLA from one-open-row-per-contact to per-enquiry **intervention
tickets**. The n8n half is a rework of `sub-human-intervention` so a ticket is ALWAYS created
(today the already-assigned branch is comment-only — the lost-enquiry bug), the out-of-hours
Redis queue is deleted in favour of an `in_working_hours` flag on the create response, and
resolve-on-close stops. It is **built and verified on a fork**, reviewed (APPROVE with
conditions), and **held**: the flip needs the CRM's PR #137 deployed, a separate live bug fixed
first, and the user's explicit go.

## Live workflow ids and their CURRENT versionIds (verify before trusting)

| role | id | versionId | note |
|---|---|---|---|
| live sub (promote target) | `rrYXzE61gCNUck_zmXe-G` | `5018a189-22df-4cb9-aa89-fa509377abe9` | UNTOUCHED, `updatedAt 2026-07-22` |
| live spine (caller; in flip scope) | `9qVyfUxmRQqrpGRMDLRuz` | `469e7259-6cfb-4505-bef4-f37a36bf454f` | UNTOUCHED |
| close-convo (flip scope) | `-WkzJMQZHmsFQm6A2abLJ` | `4a2e963d-dd2a-443e-bbb1-68b43ee29744` | UNTOUCHED |
| **fork — the built change** | `vUfFUDjLAuMaeQE6` | **`3186d960`** | build target (was 16eadb1e before the 2026-08-16 codex hardening) |
| **clone — caller fix** | `txiPzSxy3Pclsz6v` | **`c97f2f8f-e335-4a3b-8046-abea89bbfdf9`** | `input_message` mapping; ⚠️ SHARED harness — another session edited it 2026-08-13T11:30Z (was `6cd67cbf`); hunk re-verified intact (value present, `removed:false`, targets the fork). **Re-verify before every use.** |
| **throwaway — S8 test double** | `mTfA5b9TgHItWo2g` | **`386caa11`** | DISPOSABLE, delete after sign-off (was f7887fc2) |

Three rollback versionIds are the three UNTOUCHED rows above. Record them before any PUT.

## Read these four files

1. `intervention-tickets-s32.md` — the plan: contract, the five rework hunks, validation design.
2. `intervention-tickets-s32-FLIP-RUNBOOK.md` — **the executable artifact.** Preconditions P1–P9,
   Step 0 (ship the spine hunk alone, first), Steps 1–5, rollback, blocked items.
3. `../tests/diffs/intervention-tickets-s32/` — `node-diff.md` (what changed, per node, with
   param shas), `caller-input-message-fix.md`, `throwaway-build.md`, `create-response-fixtures.json`.
4. `../tests/reviews/intervention-tickets-s32-review.md` + `-delta.md` — REQUEST-CHANGES then
   **APPROVE with conditions**.

## Verification status

- **V2 functional matrix: 6/6 PASS** against throwaway `f7887fc2` — ⚠️ SUPERSEDED, see CURRENT STATE below; the body changed after this run. Post-#137 fixtures
  (execs 12265871, 12265978, 12266078, 12266195, 12266296, 12266396). Includes case (f), a
  deliberate negative that must ERROR.
- **V3 fail-closed**: PASS (exec 12206207).
- **Zero egress**: re-derived by the reviewer, not taken on report. Only egress is the BLOBTEST
  sink to an unconsumed list.
- **D1 CLOSED 2026-08-13** — `input_message` proven to transmit. Clone `c97f2f8f` driven via
  `zz-canary-run` in uac mode; inside the FORK's own execution (`12528018`) the sub's trigger
  received `"input_message": "Please escalate me to a human agent right now about my order --
  D1 verification probe."` — non-null, verbatim. Short-circuit confirmed (only trigger → `chat?`
  → `test-guard` → `test-guard-record` ran). Before-picture: live executions `12437115`,
  `12433018` still show `input_message: null` on the untouched spine. Full run doc:
  `../tests/runs/intervention-tickets-s32-D1-input-message.md`. This closes the delta review's
  only blocker that was ours; Step 0 remains worthwhile as the live-side confirmation but is no
  longer the ONLY evidence.
- **NOT verified**: S7a/S7b redis reads (no helper — see blocked items).

## ⚠️ CURRENT STATE 2026-08-16 — ONE STEP OUTSTANDING, DO NOT CALL THIS GREEN YET

The mandated cross-model codex review returned **VERDICT: FIX** on the create body, and the fix
was applied but **the matrix has NOT been re-run against it**. Sequence:

- codex found: `message_id` interpolated UNQUOTED (missing → `"message_id": ,` → malformed JSON →
  create fails → intervention dies after the customer was told help is coming); `assigned_to_id`
  quoted-raw (missing → literal `"undefined"`).
- I found what codex missed: **`source_message_id`, the idempotency key the whole feature dedups
  on, was quoted-raw** — missing rendered `""`, i.e. an empty identity key and silently broken
  dedup. The 6/6 matrix never saw it because every case pinned a valid id.
- Applied to fork `vUfFUDjLAuMaeQE6` → **`3186d960`** and throwaway `mTfA5b9TgHItWo2g` →
  **`386caa11`** (both published, versionId==activeVersionId). Verified after an agent died
  mid-task: fork has 16 nodes, ONLY the create node changed, the other 15 byte-match their
  recorded shas; throwaway S8-clean by node type. Live sub `5018a189` and spine `469e7259`
  UNTOUCHED.
- Final body: all six interpolations now safe; `source_message_id` renders a quoted string when
  present and a bare JSON `null` when missing, so the backend rejects it LOUDLY rather than
  creating a ticket with an empty identity.

**NEXT SESSION, FIRST THING:** re-run the V2 matrix against fork `3186d960` / throwaway
`386caa11` — the create body is asserted in cases (a)–(e), so the previous 6/6 no longer applies.
Also unverified: the `probe.js` fail-on-purpose retarget (hardening `assigned_to_id` disarmed the
old case-5 instrument — a green-that-cannot-fail if not replaced) and the node-diff/throwaway-build
doc updates. Weekly usage limit hit 2026-08-16, resets **Aug 18 5pm MYT**.

## USER DECISIONS 2026-08-15 — these override the CRM plan and are recorded there too

- **INERT LAUNCH.** Rollout needs staff training; production must be inert on day one. So a
  Respond close KEEPS resolving tickets (**all open tickets for the contact**) and an agent reply
  in Respond KEEPS marking responded — both behind an n8n redis config flag
  `close_resolves_tickets` (same `ht-cfg-*` pattern as the human-intervened timeout). Flag ON at
  launch; OFF after training → CRM-only resolve. CRM UAC AC-E4 / AC-C3-no-Respond-call are
  DEFERRED to the flip (peer amended the UAC, commit 72c47790b); CRM hardening #133 must land
  AFTER the flip.
- **Exactly ONE closing message per close event.** Today holds only by accident (`executeOnce`
  on the unrelated `Update a Contact`); the rework makes it explicit.
- **Out-of-hours**: ticket clock start verified correct (fixture: Sat 09:25 MYT → Mon 09:00 MYT).
  The assignee EMAIL did NOT state it — peer verified, added AC-G2 ("Clock starts <day time MYT>
  · respond by <day time MYT>", in-hours line unconditional, all three channels). Awaiting the
  rendered strings from their passing test.

## close-convo is now DUAL-TRIGGER (CRM S4.5, as-built 2026-08-15)

CRM resolve of a contact's last open ticket now POSTs directly to n8n (`ticket_resolved`, secret
header, `event_id` idempotency) AND still fires its Respond API close. Guard against the double:
lane A dedups on `event_id` (SETNX 24h); lane B's `Respond.io Trigger` gets
`eventSource: ["user"]` — LOCKED, verified both sides (CRM's only close path is a direct Respond
API call → `api`; zero n8n workflows close conversations → nothing arrives as `n8n`). Do NOT gate
on the CRM-invented `closedBySource` payload field. Full shape in runbook Step 4 + addendum.

**NEW SLICE, not S3.2**: the `comment.created` → CRM forwarder does not exist on n8n (full
Respond-trigger inventory taken). User-gated future work; contract captured in the runbook.

## Decisions and why (do not re-litigate)

- **Build on the fork, promote as LIVE + own hunks.** Never PUT the fork's JSON at live: it
  carries harness hunks (chat console nodes, sendmsg repointed to BLOBTEST).
- **A test double, not pinning.** §0 S8 withdrew pinning as a safety mechanism, and n8n's
  `test_workflow` does NOT pin `executeWorkflow` nodes — and `sub-add-comment-respond`
  (`2l8egTLJbyGOPvG-DbtDX`) is an **unguarded live sub**, so a naive matrix run posts real
  respond.io comments. Hence `zz-THROWAWAY-s32-pinmatrix` with 5 name-preserving Code stand-ins.
- **Fail loud on a missing `in_working_hours`.** Strict typeValidation does NOT catch an absent
  key (it coerces to false and routes silently). Sentinel `?? 'MISSING_IN_WORKING_HOURS'` makes
  it error. Trade accepted: visible failure over silently wrong customer copy.
- **Round-robin pick owns the ticket**, not the Respond assignee — forcing the Respond assignee
  would reinstate the one-assignee limit the feature removes. Peer confirmed and reformulated
  their `agent-replied` rule to be contact-first so it cannot produce a false breach.
- **Rejected**: the peer's original close-convo gate (reading `is_resolved` off a route that
  returns one "preferred" row) — it depends on an unowned ORDER BY and fails by telling a
  customer everything is resolved while a ticket is open. Took a real `open-count` endpoint.
- **Rejected**: copying the canonical spine `input_message` expression — it ends in
  `|| $json.message`, which at those nodes is the **bot's** text, not the customer's.

## Blocked / needs a human decision

1. **Redis-read helper** — creating a workflow was denied by the permission classifier. Four
   sessions have now been unable to discharge the §0 S7 gates or check the flip's queue-empty
   precondition. Proposed `zz-redis-read`: executeWorkflowTrigger(key) → allowlist guard →
   `llen` + `lrange`; no webhook, key allowlist. Needs the user to approve or create it.
2. **Step 0 (spine caller hunk)** — a live spine edit. No-op against today's sub, but live.
   User-gated.
3. **CRM PR #137** — open, NOT merged, NOT deployed. `open-count`, `agent-replied` and the
   escalate `tracking_id` are all **specced-not-built** here until those routes are live in prod.
4. **Peer issue #134** ships BEFORE the flip (see live bugs below).

## Live bugs found along the way — NOT caused by this feature

- **`next-assignee` 404 → escalations dropped.** 4 of 10 retained live executions die at
  `get-round-robin-assignee`, deterministic per contact (MOCHA contacts asking for a team that
  exists only under SRT). The customer is told "directing your enquiry to the correct person"
  BEFORE this call, so they are promised help and get nothing, forever. Peer issue #134, fix
  specced, ships before the flip. Detail: memory `next-assignee-404-drops-escalations`.
- **`respond-send-user` marks every ticket responded.** Its SELECT has no contact predicate, so
  one agent reply stops the clock on every ticket that agent owns. Wrong today; worse under
  multi-open. ⚠️ Two bugs partially cancel — the broken `policy_id LIMIT 1` accidentally narrows
  the blast radius, so fixing the policy lookup alone makes it strictly worse. Peer is retiring
  the raw SQL via `agent-replied`. Detail: memory `respond-send-user-marks-all-tickets`.
- **`started_at` is unmapped** on the same caller as `input_message`, so latency measurement on
  the escalation path likely reads null. Deliberately out of scope — its own slice.

## Landmines for the next session

- `respond-send-user` is being edited by ANOTHER session (human-intervened-timeout, +10 `ht-*`
  nodes). Re-read immediately before any PUT there or you revert their work.
- Param-sha tables in the diffs dir used `json.dumps(..., ensure_ascii=False)`. The default gives
  a spurious mismatch on the one node containing `⏰`.
- S8 must be checked by **node type**, never grep — stand-in comments legitimately contain the
  banned type names (memory `s8-gate-check-type-not-grep`).
- PUT bodies: `{name, nodes, connections, settings}` only. Never echo `pinData` (accepted, not
  rejected — it would ship pinned test data to live). Strip `settings.binaryMode` /
  `timeSavedMode`.
- Browser work uses `npx -y agent-browser`, never playwright (Chrome is uninstalled).

## Next steps, in order

1. Await CRM PR #137 merge + prod deploy, and #134 shipping first.
2. Get a decision on the redis helper (blocker 1) — it also gates precondition P3.
3. On the user's go: Step 0 (spine hunk alone) → verify a real intervention shows
   `input_message` non-null → then the paired flip window per the runbook.
4. After sign-off: delete throwaway `mTfA5b9TgHItWo2g`, re-run
   `scripts/export-workflows.py`, commit artifacts.
