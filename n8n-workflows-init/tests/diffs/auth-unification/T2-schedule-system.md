# T2 — CRM auth unification, schedule + system workflows (6 nodes, 4 workflows)

**Change-id:** auth-unification-T2-schedule-system
**Date:** 2026-07-21
**Plan:** `n8n-workflows-init/plans/crm-auth-unification-plan.md` — §3 (D1–D4), §3.3 (REWRITTEN), §4 T2,
§4.6, §4.7 (AMENDED), §4.9 (AMENDED), §4.10, §5.1 (gate acceptance AMENDED + G7 baseline CORRECTED),
§5.2 (ACCEPTANCE CLAUSE REWRITTEN), §5.3, §2 CORRECTION 3 (amended)
**Precedent:** `T1-system-upload-attachments.md` + `reviews/auth-unification-T1-system-upload-attachments.md`
**Gate:** `assert-auth.sh` (frozen — NOT edited during this tranche, per the T1 ruling)

---

## ✅ STATUS SUPERSEDED 2026-07-21T16:40Z — ALL FOUR ARE CONVERTED AND PUBLISHED. See "PROMOTE RECORD" below.

> The "DRAFT ONLY" status block that followed is retained for history but is **no longer accurate**.
> One PUT (`FfmDkEWdt3Bian82`) was sent by the promoting agent. The other three were converted and
> published by a **concurrent third-party actor** during the same window. All six nodes are live.

---

## PROMOTE RECORD — 2026-07-21

### Summary

| # | workflow | id | prior activeVersionId | new activeVersionId | pushed by | gate |
|---|---|---|---|---|---|---|
| 1 | `system-healthcheck-ping` | `FfmDkEWdt3Bian82` | `b6537382-117a-4470-8cb6-308913d4a385` | `0e3a1e5d-3595-4d09-a082-731f7741a575` | **this agent, one PUT, sha `4575de7e…`, 1688 B** | PASS at 16:19 (exact match) |
| 2 | `schedule-working-day-detection` | `ss9S83XF7ZtmnaUyFtYZc` | `665c26de-1b6b-4b45-a3e8-303303c2df96` | `f3678f0e-9ad9-44d9-9e94-bb146bf61257` | ⚠️ third party @ 16:22:56Z | PASS |
| 3 | `schedule-sla-policy-checker` | `7lFff6i_udSxyUbCMdTuD` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` | `9e9a082a-4998-4ae8-b8d3-a0013185545e` | ⚠️ third party @ 16:21:40Z | PASS |
| 4 | `redis-consume-queue-mongo` | `Srs08P0Ha3Cv--YPx0-Yn` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` | `7b099c3c-c2cc-479d-972c-c1465684c264` | ⚠️ third party @ 16:22:27Z | PASS |

**Only PUT #1 was sent by the promoting agent.** The §4.6 pre-flight for workflow 2 HALTED: both its
`versionId` and `activeVersionId` had moved off their recorded values. Investigation found workflows
2, 3 and 4 already converted **and published** by another actor between 16:21:40Z and 16:22:56Z —
concurrent with, and out of, the ratified order (`Srs08P0Ha3Cv--YPx0-Yn`, the lossy ingest, was
**not** last; it went second). PUTs 2–4 were therefore **never sent**: the reviewed bytes were void
under review §12 rollback triggers 2 and 3, and the target state already existed.

### What shipped == what was reviewed

Canonical (sorted-key) node-graph comparison of the published state against each reviewed `body.json`,
with **non-zero byte counts printed on both sides** so the check cannot pass vacuously:

```
ss9S83XF7ZtmnaUyFtYZc   body 11274 B / after 11274 B   SEMANTICALLY IDENTICAL
7lFff6i_udSxyUbCMdTuD   body  5425 B / after  5425 B   SEMANTICALLY IDENTICAL
Srs08P0Ha3Cv--YPx0-Yn   body  3218 B / after  3218 B   SEMANTICALLY IDENTICAL
```

Only JSON key **ordering** differs (`authentication`/`genericAuthType` are emitted earlier).
`connections` byte-identical on all three. So the third party applied materially the reviewed change.

### Static assertions — all four

- Gate output: **`RESULT: PASS` on workflows 2, 3, 4**, matching review §10's corrected block exactly,
  including both phantom blank-exclusion lines. Workflow 1 printed `PASS` at 16:19 immediately after
  its PUT; it now prints `FAIL` **solely** because of a third-party draft created at 16:23:38Z (below).
- Collateral bound-node counts: **1 / 5 / 3 / 3** — exactly as pre-declared. All **6** pre-existing
  bindings survive: both `respondIoApi=OiS59QkzpKfKSdaa` and all four `redis=H5w6o7tptzTPMVdy`.
- `settings`: `timezone: Asia/Kuala_Lumpur` **preserved** on `ss9S83` (load-bearing — the 08:00 MYT
  trigger). `binaryMode`/`timeSavedMode` preserved everywhere they existed.
- `staticData`, `name`, `active`, node-id sets, `connections` unchanged on all four.
- `insert-message` `X-Source` header **survived**: `[{"name":"X-Source","value":"n8n"}]`, not `[]`.

### Dynamic verification

| node | verdict | evidence |
|---|---|---|
| `healthcheck-callback` | ✅ **VERIFIED (both branches)** | exec `9471268` → `{"status":"success","message":"Integration log updated successfully."}`, `error` absent (Group B 3-part conjunction). Also exec `9470106` → `httpCode 404` / `NOT_FOUND`, i.e. past the api-key dependency. **No 401/403.** |
| `get-due-escalations` | ✅ **VERIFIED** | exec `9471108` `main[0][0].json` = `{"status":"success","count":0,"items":[]}` — `count` **present** (presence, not truthiness), `error` **absent**, `executionStatus: success`. |
| `insert-message` | ⏳ **UNVERIFIED — no traffic** (positively explained, not assumed) | ~45 min of consecutive empty 5 s polls, 0 errors. **Cause proven, not inferred:** exec `9473856` shows `Redis1` (LLEN) → `{"sorento-respond-message": 0}`, `Redis` (POP) → `{"":null}`, `If` routing to output **1** (empty branch). The queue is genuinely empty; the poll is healthy and fully exercised up to the branch point. Per LESSONS 46 the LLEN depth series — not the execution count — is the sound instrument, and it reads 0. `insert-message` is not running because there is nothing to insert. **Carry as a trailing obligation until the first real message.** |
| `get-is-working-holiday` | ⏳ trailing | next 08:00 MYT tick |
| `conversation-sla-tracking-create` | ⏳ trailing | daily + queue-gated |
| `conversation-sla-tracking-escalate1` | **UNVERIFIED** | §5.3 — never provoked, never to be |

Error counts since publish: `ss9S83` 0/0 · `7lFff6i` **0 errors / 14 executions** · `Srs08P0`
**0 errors / 100 executions** · `FfmDkEWdt3Bian82` 1 error (a pre-existing-pattern 404) / 2.

### ⚠️ OPEN ITEM — unattributed rider draft on `FfmDkEWdt3Bian82`

A third-party draft `851d5c1a-354f-436e-959f-6c54f2e219f8` was created at **16:23:38Z**, after and
independent of PUT #1. Diffed against the published active `0e3a1e5d`:

1. **`Webhook` node drops `responseMode: "onReceived"`** and gains `options: {}`. This is a real
   semantic change — without it the webhook no longer responds immediately, so the CRM watchdog would
   wait on workflow completion instead of getting "Workflow got started". The gate flags it: `RIDER Webhook`.
2. `settings` gains `binaryMode: "separate"`.

**This draft must NOT be published.** Per LESSONS 51 it should be reverted, or staged as its own
reviewed semantic-no-op. The published version is unaffected and healthy.

`Srs08P0Ha3Cv--YPx0-Yn` also gained `settings.binaryMode: "separate"` in its **published** state
(it had none before) — inert storage-mode setting, recorded not litigated. `ss9S83`'s `pinData`
Schedule-Trigger sample timestamp advanced 07-13 → 07-21; benign, affects manual runs only.

### Nothing was rolled back

Workflow 1's own PUT passed every assertion. Workflows 2–4 were never PUT by this agent, so there was
nothing of its own to revert; and their published state is materially the reviewed change, verified
green, so an unmandated rollback of another actor's correct work was declined as the more destructive
option. **Escalated to the user instead.**

---

## ⏸ (HISTORICAL) STATUS: DRAFT ONLY — D1/D2/D4 applied to four drafts. D3 NOT applied. NO PUT SENT. NOTHING PUBLISHED.

Per §4.7 as amended + LESSONS 55: on a live workflow **a REST PUT is the promote**, and REST PUT is
the only way to bind a generic-auth credential. This tranche stops one step short. The handoff
artifact is four drafts **plus four exact PUT bodies**, each independently reviewable, each
independently revertible.

**This tranche is FOUR separate workflows ⇒ FOUR separate PUTs and FOUR `body.json` files.**
They are deliberately not batched.

⚠️ **All four drafts are currently NON-FUNCTIONAL** (D1+D2 with no bound credential). **These are
ACTIVE workflows that fire on their own schedule** — a draft left armed here is more dangerous than
T1's, because any publish of any of them, for any reason, ships credential-less nodes into a path
that executes within seconds. Do not publish anything mid-sequence. Either complete or roll back
(§4.10).

---

## Prereq findings

### Plan §4 T2 node list — VERIFIED against live, exact

Re-derived from a fresh REST GET of each workflow, not trusted blind. The plan's list is correct:
**4 workflows, 6 CRM nodes, no more and no fewer.**

| workflow | id | active | archived | total nodes | CRM httpRequest nodes | non-CRM httpRequest |
|---|---|---|---|---|---|---|
| `schedule-sla-policy-checker` | `7lFff6i_udSxyUbCMdTuD` | ✅ | no | 8 | **2** | **0** |
| `schedule-working-day-detection` | `ss9S83XF7ZtmnaUyFtYZc` | ✅ | no | 17 | **2** | **0** |
| `system-healthcheck-ping` | `FfmDkEWdt3Bian82` | ✅ | no | 2 | **1** | **0** |
| `redis-consume-queue-mongo` | `Srs08P0Ha3Cv--YPx0-Yn` | ✅ | no | 8 | **1** | **0** |

**No scope blind spot.** Unlike T1 (which had `download-packing-list` on an S3 URL), **zero**
httpRequest nodes in this tranche point anywhere other than the CRM host — so the "CRM-host filter
might be hiding a node" question is closed by measurement, not assumption. Cross-checked a second
way: the set of nodes carrying an `x-api-key` header entry **over all node types** is exactly the
same 6.

All four owned by project `0HJOI5FmkQeIVfH8` — §2 CORRECTION 1 (no credential-sharing prerequisite)
re-confirmed for this tranche.

### ✅ No pre-existing riders — all four drafts were CLEAN before this work

Checked explicitly per the UI-silently-creates-a-draft hazard:

| workflow | `versionId` **before** | `activeVersionId` **before** | clean? |
|---|---|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` | ✅ identical |
| `ss9S83XF7ZtmnaUyFtYZc` | `665c26de-1b6b-4b45-a3e8-303303c2df96` | `665c26de-1b6b-4b45-a3e8-303303c2df96` | ✅ identical |
| `FfmDkEWdt3Bian82` | `b6537382-117a-4470-8cb6-308913d4a385` | `b6537382-117a-4470-8cb6-308913d4a385` | ✅ identical |
| `Srs08P0Ha3Cv--YPx0-Yn` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` | ✅ identical |

**4/4 `versionId == activeVersionId`.** No unattributed draft delta anywhere (LESSONS 51 rider: none).
Every draft divergence below is attributable to T2 and nothing else.

### Version pointers AFTER the MCP edits

| workflow | `versionId` **now** (draft w/ D1/D2/D4) | `activeVersionId` **now** (unchanged) |
|---|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `ca9d8766-77b5-4e71-87d4-4f42775f8dc8` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` |
| `ss9S83XF7ZtmnaUyFtYZc` | `1f6d05b0-3926-4de2-98e7-98482fd159ce` | `665c26de-1b6b-4b45-a3e8-303303c2df96` |
| `FfmDkEWdt3Bian82` | `49d0c6d4-3150-4719-ae2f-3b0722a3d0eb` | `b6537382-117a-4470-8cb6-308913d4a385` |
| `Srs08P0Ha3Cv--YPx0-Yn` | `f4ffdcbd-12d2-4bf7-82b6-06f1910c27fa` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` |

**All four `activeVersionId`s are unchanged** — production behaviour is bit-for-bit what it was.
These are also the four rollback pointers (§4.10).

---

## §4.9 backup

| workflow | full REST GET | per-node backup | gitignored |
|---|---|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `T2-7lFff6i_udSxyUbCMdTuD-before.json` | `T2-7lFff6i_udSxyUbCMdTuD-nodes-before.json` | ✅ |
| `ss9S83XF7ZtmnaUyFtYZc` | `T2-ss9S83XF7ZtmnaUyFtYZc-before.json` | `T2-ss9S83XF7ZtmnaUyFtYZc-nodes-before.json` | ✅ |
| `FfmDkEWdt3Bian82` | `T2-FfmDkEWdt3Bian82-before.json` | `T2-FfmDkEWdt3Bian82-nodes-before.json` | ✅ |
| `Srs08P0Ha3Cv--YPx0-Yn` | `T2-Srs08P0Ha3Cv--YPx0-Yn-before.json` | `T2-Srs08P0Ha3Cv--YPx0-Yn-nodes-before.json` | ✅ |

Gitignore coverage **verified with `git check-ignore -q` per file before writing any of them**, not
assumed from reading `.gitignore` (`*-before.json` / `*-after.json` / `*-body.json`).

⚠️ All four `-before.json` and all four `-nodes-before.json` contain the **literal live CRM key**.
Never commit. All four `body.json` were checked and contain **0 occurrences** of it.

---

## The delta

| # | change | mechanism | applied here? |
|---|---|---|---|
| D1 | `parameters.authentication = "genericCredentialType"` | MCP `setNodeParameter` `/authentication` | ✅ 6/6 |
| D2 | `parameters.genericAuthType = "httpHeaderAuth"` | MCP `setNodeParameter` `/genericAuthType` | ✅ 6/6 |
| D3 | `credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` | **REST PUT** (staged in 4 × `body.json`) | ⏸ **NOT applied — user-gated** |
| D4 | drop the `x-api-key` entry | MCP `setNodeParameter` `/headerParameters/parameters` | ✅ 6/6 |

**Ops issued: four separate atomic `update_workflow` calls** — 3 + 6 + 6 + 3 = **18
`setNodeParameter` ops**, all applied. Zero `renameNode`, zero connection ops, zero position changes,
zero `addNode`, zero `setNodeCredential`. All four responses reported
**`autoAssignedCredentials: []`** — LESSONS 47 did not fire.

**LESSONS 32b check:** zero nodes across all four workflows carry a stray `parameters.parameters.*`.
The real leaf keys changed; re-read from a fresh REST GET confirms it.

### ⚠️ D4 is NOT `[]` for one node — `insert-message` carries a second header

This is T2's analogue of `ideate-turn-http`'s `Content-Type` (§3.2 — "non-`x-api-key` headers are
retained"). It is the single easiest thing to get wrong in this tranche.

| node | headers BEFORE | headers AFTER (D4) |
|---|---|---|
| `insert-message` | `[{x-api-key, «REAL_KEY»}, {X-Source, "n8n"}]` | **`[{"name":"X-Source","value":"n8n"}]`** |
| all other 5 | `[{x-api-key, «REAL_KEY»}]` | `[]` |

`X-Source: n8n` is preserved verbatim and asserted by G5b (`PASS — non-x-api-key headers preserved
verbatim`), not merely claimed. `sendHeaders` left `true` on all six (§3.2).

---

## Node changes, grouped by workflow

Every node below was, before: `authentication` unset (`"none"` at runtime), `genericAuthType` unset,
**no credential block at all** (`credentials: null`), `x-api-key` present, `sendHeaders: true`,
`typeVersion 4.3`, `retryOnFail` absent.

### 1 · `system-healthcheck-ping` `FfmDkEWdt3Bian82` — CANARY, PUT THIS FIRST

Plan §4 T2: *"`system-healthcheck-ping` is the liveness probe… Convert it **first within T2** as a
canary."* Recommended PUT order preserved below.

| node | endpoint | onError | `main[1]` wired? | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|---|
| `healthcheck-callback` | `POST /api/v1/integration-management/integration-logs/{{ $json.body.integration_log_id }}/status` | unset ⇒ `stopWorkflow` | n/a | **LOUD** | ✅ | ✅ | `[]` | ⏸ PUT |

⚠️ **NOT self-driving.** Plan §4 T2 groups this under "self-driving (schedule/webhook) → they verify
themselves within minutes of publish." It is **webhook**-triggered (`POST /webhook/system-healthcheck-ping`,
`responseMode: onReceived`), poked by the CRM watchdog (`user-agent: Sorento-CRM/1.0.0`) — it fires on
someone else's clock, not n8n's. Observed cadence ≈ 2×/hour. Fast enough to be a canary; not "minutes".

### 2 · `schedule-working-day-detection` `ss9S83XF7ZtmnaUyFtYZc`

| node | endpoint | onError | `main[1]` wired? | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|---|
| `get-is-working-holiday` | `GET /api/v1/external/work-calendar/is-working-day` | unset ⇒ `stopWorkflow` | n/a | **LOUD** | ✅ | ✅ | `[]` | ⏸ PUT |
| `conversation-sla-tracking-create` | `POST /api/v1/sla-management/conversation-sla-tracking` | unset ⇒ `stopWorkflow` | n/a | **LOUD** | ✅ | ✅ | `[]` | ⏸ PUT |

⚠️⚠️ **THIS WORKFLOW RUNS ONCE PER DAY — plan §4 T2's "verify within minutes" is WRONG for it.**
`Schedule Trigger` rule is `{"interval":[{"triggerAtHour":8}]}` with `settings.timezone =
Asia/Kuala_Lumpur` — **08:00 MYT / 00:00 UTC, once daily.** Confirmed empirically: the only execution
in the search window is `9384140` at `2026-07-21T00:00:49Z`. **Verification latency is up to ~24 h**,
and `conversation-sla-tracking-create` is additionally gated behind `If1` on a non-empty queue, so
even the daily run may not reach it. Plan correction — see §Plan corrections below.

### 3 · `schedule-sla-policy-checker` `7lFff6i_udSxyUbCMdTuD` — ⚠️ SLA ESCALATION PATH

| node | endpoint | onError | `main[1]` wired? | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|---|
| `get-due-escalations` | `GET .../conversation-sla-tracking/integration/due-escalations` | `continueErrorOutput` | **NO** | 🔇 **SILENT** | ✅ | ✅ | `[]` | ⏸ PUT |
| `conversation-sla-tracking-escalate1` | `POST .../conversation-sla-tracking/integration/escalate` | `continueErrorOutput` | **NO** | 🔇 **SILENT** | ✅ | ✅ | `[]` | ⏸ PUT |

⚠️ **`conversation-sla-tracking-escalate1` is on the SLA escalation path (§5.3). It must NEVER be
provoked** — escalation triggers staff notification ripple. Verification is **observational only**:
read an execution that fired on its own, never fire it. Recorded here for the tester as a hard
instruction, not a preference.

Runs every 60 s (`{"interval":[{"field":"minutes","minutesInterval":1}]}`); the escalate node only
runs when there is genuinely a due escalation.

### 4 · `redis-consume-queue-mongo` `Srs08P0Ha3Cv--YPx0-Yn` — ⚠️ HIGHEST CONSEQUENCE IN THIS TRANCHE

| node | endpoint | onError | `main[1]` wired? | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|---|
| `insert-message` | `POST /api/v1/external/chat-history/messages` | unset ⇒ `stopWorkflow` | n/a | **LOUD** | ✅ | ✅ | **`[{X-Source: n8n}]`** | ⏸ PUT |

This is the chat-history ingest — the POST that records every message, and the path the obs-latency
`turn_id` work depends on. Runs every **5 s**.

⚠️⚠️ **"LOUD" here does NOT mean "harmless". A failure is loud AND lossy.** From `connections`:

```
Schedule Trigger → Redis1 (LLEN sorento-respond-message)
                 → Redis  (POP  sorento-respond-message)   ← the message leaves the queue HERE
                 → If (non-empty) → output-parser → insert-message → Execution Data
```

The redis **POP happens before `insert-message`**. On a 401 the execution errors visibly, but the
popped message is **already gone and is never re-queued**. So a broken publish does not merely stop
recording — it **permanently loses every message that arrives while it is broken**, at 5 s
granularity. That, not invisibility, is why this is the highest-consequence node in T2 and why it
should be PUT **last**, into a staffed window, with the rollback pointer `7ee8307f-…` to hand.

The disabled `Analyze document` node (googleGemini) is pre-existing and untouched; it is the source
of this workflow's one pre-existing validation warning (LESSONS 13 — not "fixed").

---

## Deliverable 1 · Silent vs loud — RE-DERIVED FROM `connections`, per node, not from `onError`

Per §2 CORRECTION 3 as amended, and per the explicit instruction not to inherit the claim. Method:
a node is genuinely silent only if `onError == "continueErrorOutput"` **AND** its `connections`
entry has `main` of length 1 (i.e. `main[1]` absent / unwired).

| node | `onError` | `connections[node].main` length | verdict |
|---|---|---|---|
| `get-due-escalations` | `continueErrorOutput` | **1** (`main[0] → Split Out` only) | 🔇 **SILENT** |
| `conversation-sla-tracking-escalate1` | `continueErrorOutput` | **1** (`main[0] → Call 'sub-add-comment-respond'` only) | 🔇 **SILENT** |
| `get-is-working-holiday` | unset | 1 | **LOUD** |
| `conversation-sla-tracking-create` | unset | 1 | **LOUD** |
| `healthcheck-callback` | unset | 1 | **LOUD** |
| `insert-message` | unset | 1 | **LOUD** (but lossy — see above) |

**Result: the T1 reviewer's ruling is CONFIRMED by independent re-derivation.** Both
`schedule-sla-policy-checker` nodes are genuinely silent; the T1 over-generalisation really was
confined to `system-upload-attachments`. On a 401, `get-due-escalations` routes to an unwired output
and the execution still reports **`success`** — **`search_executions(status:["error"])` is blind to
this workflow's two nodes.** Assert per-node `runData`, never execution status.

Consequence, stated plainly: a broken `get-due-escalations` means **SLA escalations silently stop
happening**, with a green execution list. That is a monitoring blind spot, not just a node bug.

**Also noted (not httpRequest, outside auth scope, carried forward from the T1 review):**
`schedule-sla-policy-checker › Assign or unassign a Conversation1` uses `continueRegularOutput` —
it emits a fake success item, so a failed assignment is indistinguishable from a successful one.
Untouched by T2; recorded so the tester does not read it as evidence either way.

---

## Deliverable 2 · The four `body.json` files

Each built by the T1-validated recipe from a **fresh REST GET taken after that workflow's MCP edits**
(so it carries D1/D2/D4 from the draft) with D3 layered on for that workflow's targets only:

```
{name, nodes, connections, settings}
| .settings |= del(.binaryMode, .timeSavedMode)
| .nodes |= map(<targets> → credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth})
```

| # | file | sha256 | bytes | nodes | targets bound |
|---|---|---|---|---|---|
| 1 | `T2-FfmDkEWdt3Bian82-body.json` | `4575de7e3def71aad8950328eff4d597bc0cddf26df99dfb2cdf1cb4a78452a7` | **1,688** | 2 | 1 |
| 2 | `T2-ss9S83XF7ZtmnaUyFtYZc-body.json` | `28f53ecaa292748663982d4b8dd60c0c77bc9a98d4ffa335e9bded002e1b83fc` | **20,917** | 17 | 2 |
| 3 | `T2-7lFff6i_udSxyUbCMdTuD-body.json` | `f30f5bf645af9af1d183aaf39f29575ab6754e5246258881887399e5235bdf91` | **9,844** | 8 | 2 |
| 4 | `T2-Srs08P0Ha3Cv--YPx0-Yn-body.json` | `3fec22ab81278d997199d8edb51a63fc5bbb9f771e500c65823c2da4e42c9cff` | **6,377** | 8 | 1 |

Listed in the **recommended PUT order** (canary first, chat-history ingest last).

Verified for all four: top-level keys exactly `connections, name, nodes, settings`; node count matches
the live workflow; **0 occurrences of the real CRM key**; **0 residual `x-api-key` entries**.

### `settings` per body — the LESSONS 55 `del()`

| workflow | settings BEFORE | stripped | settings IN BODY |
|---|---|---|---|
| `FfmDkEWdt3Bian82` | `availableInMCP, executionOrder` | *(nothing to strip)* | `{"availableInMCP":true,"executionOrder":"v1"}` |
| `ss9S83XF7ZtmnaUyFtYZc` | `availableInMCP, binaryMode, callerPolicy, executionOrder, timeSavedMode, timezone` | `binaryMode`, `timeSavedMode` | `{"availableInMCP":true,"callerPolicy":"workflowsFromSameOwner","executionOrder":"v1","timezone":"Asia/Kuala_Lumpur"}` |
| `7lFff6i_udSxyUbCMdTuD` | `availableInMCP, binaryMode, executionOrder` | `binaryMode` | `{"availableInMCP":true,"executionOrder":"v1"}` |
| `Srs08P0Ha3Cv--YPx0-Yn` | `availableInMCP, callerPolicy, executionOrder, timeSavedMode` | `timeSavedMode` | `{"availableInMCP":true,"callerPolicy":"workflowsFromSameOwner","executionOrder":"v1"}` |

`settings` is **merged, not replaced** (proven in T0, re-proven in T1 where `binaryMode:"separate"`
survived), so the stripping is lossless. **Post-PUT, re-assert** `binaryMode == "separate"` on
`ss9S83` and `7lFff6i`, and `timeSavedMode == "fixed"` on `ss9S83` and `Srs08P0`.

⚠️ **`ss9S83XF7ZtmnaUyFtYZc` carries `settings.timezone: "Asia/Kuala_Lumpur"`, which is NOT stripped
and IS sent.** It is load-bearing: it is what makes the daily trigger fire at 08:00 local rather than
08:00 UTC. If the PUT were to drop it, the workflow would silently shift by 8 hours. It is present in
the body — verify it is present in `after.json` too.

`pinData` and `staticData` are deliberately **not sent** on any of the four (merged, not replaced —
survived on both T0 targets and on T1). Pre-change values, for the post-PUT preservation assertion:

| workflow | `pinData` | `staticData` |
|---|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `{"Schedule Trigger":[…]}` | `{"node:Schedule Trigger":{"recurrenceRules":[]}}` |
| `ss9S83XF7ZtmnaUyFtYZc` | `{"Schedule Trigger":[…]}` | `{"node:Schedule Trigger":{"recurrenceRules":[]}}` |
| `FfmDkEWdt3Bian82` | **`null`** | **`null`** |
| `Srs08P0Ha3Cv--YPx0-Yn` | `{"Schedule Trigger":[…]}` | `{"node:Schedule Trigger":{"recurrenceRules":[]}}` |

### ⚠️ Reviewed bytes must equal pushed bytes

The reviewer reviews each `body.json` **as bytes**; the shas above are what make that provable.
Before each PUT: re-run that workflow's draft-vs-active diff, re-verify **that file's** sha, and send
it unmodified (`--data-binary @…`). A regenerated body **voids the review** for that workflow only —
the four are independent, which is the point of keeping them separate.

---

## Deliverable 3 · §5.1 gate — run per workflow against the draft

**No `--exclude` was used on any invocation.** Every CRM node in all four workflows is in T2 scope;
nothing is held back to a later tranche. Recorded here as the absence of a flag, per §5.1's
"record the exclusion as DATA, in the invocation."

```
./assert-auth.sh FfmDkEWdt3Bian82      T2-FfmDkEWdt3Bian82-before.json
./assert-auth.sh ss9S83XF7ZtmnaUyFtYZc T2-ss9S83XF7ZtmnaUyFtYZc-before.json
./assert-auth.sh 7lFff6i_udSxyUbCMdTuD T2-7lFff6i_udSxyUbCMdTuD-before.json
./assert-auth.sh Srs08P0Ha3Cv--YPx0-Yn T2-Srs08P0Ha3Cv--YPx0-Yn-before.json
```

Actual output, all four (abridged to the differing lines):

| workflow | G1–G4 | G5 | G5b | G6 nodes | G6 connections | residual | RESULT |
|---|---|---|---|---|---|---|---|
| `FfmDkEWdt3Bian82` | FAIL ×1 — `healthcheck-callback` `G1=true G2=true G3=false G4=true` | PASS | PASS | PASS | PASS (byte-identical) | **NONE** | FAIL |
| `ss9S83XF7ZtmnaUyFtYZc` | FAIL ×2 — `get-is-working-holiday`, `conversation-sla-tracking-create`, both `G1=true G2=true G3=false G4=true` | PASS | PASS | PASS | PASS | **NONE** | FAIL |
| `7lFff6i_udSxyUbCMdTuD` | FAIL ×2 — `conversation-sla-tracking-escalate1`, `get-due-escalations`, both `G1=true G2=true G3=false G4=true` | PASS | PASS | PASS | PASS | **NONE** | FAIL |
| `Srs08P0Ha3Cv--YPx0-Yn` | FAIL ×1 — `insert-message` `G1=true G2=true G3=false G4=true` | PASS | PASS | PASS | PASS | **NONE** | FAIL |

### `RESULT: FAIL` is the CORRECT and EXPECTED output pre-PUT — stated explicitly

**The sole cause on all four is `G3=false`.** G3 asserts the credential binding, which is D3, which
is deliberately deferred to the user-gated PUT. **G3 cannot pass until the PUT lands; there is no
intermediate state in which it could.**

**Unlike T1, T2 has no second cause.** There is no excluded node, no `HEADER-DRIFT`, and the residual
line reads **NONE** on all four. So the pre-PUT signature is uniform and minimal: *G3 false on
exactly the tranche's own nodes, everything else green.*

**What IS proven right now:**

- **G1, G2, G4 — 6/6 green** across all four workflows.
- **G5 no-rider — PASS ×4.** Every node's `parameters` with `authentication`/`genericAuthType`/
  `headerParameters` deleted is byte-identical to its backup; `onError`, `retryOnFail`, `position`,
  `id`, `type`, `typeVersion`, `disabled` unchanged.
- **G5b — PASS ×4.** Confirms `X-Source: n8n` survived on `insert-message`.
- **G6 no-collateral — PASS ×4**, `connections` **byte-identical** on all four.
- **LESSONS 32b — clean ×4**, no stray `parameters.parameters.*`.

### Expected post-PUT gate output, pre-declared (per §5.1 exact-match acceptance)

Per workflow, after its own PUT, the run must match **exactly**:

> **⚠️ CORRECTED 2026-07-21 — reviewer blocking condition 1.** The original block below omitted the
> two lines the gate **actually prints** when `--exclude` is not passed. Under §5.1's exact-match
> acceptance that is a real defect: it would either raise a false alarm on a correct run, or train
> the reader to skim past deviations. The phantom lines come from `printf '%s\n'` with no arguments
> yielding `[""]` — length 1 — so the gate reports one unnamed exclusion on a tranche that excluded
> nothing. Cosmetic in the gate, **not** cosmetic in a pre-declared exact-match block.

```
   draft == active (published)
   EXCLUDED from G1-G4/G5/G5b (deliberate, held to a later tranche):
     -                                          ← PHANTOM: blank, expected, not a real exclusion
-- G1-G4 ...... PASS -- all N CRM nodes satisfy G1-G4       (N = 1, 2, 2, 1)
-- G5  ........ PASS -- no out-of-scope key changed on any node
-- G5b ........ PASS -- non-x-api-key headers preserved verbatim
-- G6  ........ PASS -- node-name set identical
                PASS -- connections byte-identical
-- residual hardcoded x-api-key in this workflow: NONE
RESULT: PASS
```

**All four are expected to print `RESULT: PASS`** — T2 is the first tranche that can, because it has
no excluded node. Any deviation **other than the two phantom lines above** is a REQUEST-CHANGES /
rollback trigger.

### ⚠️ SECOND gate defect — reviewer-found, worse than the phantom line

`assert-auth.sh` lines 108/122 end their jq with `2>/dev/null || true`, and **empty output is then
treated as PASS**. So any jq failure silently prints `PASS -- no out-of-scope key changed`: the
rider gate **cannot distinguish "nothing changed" from "the check did not run."** Same class as the
LESSONS 45 LLEN gate — it can report PASS while the guarded-against thing occurred.

The reviewer hit this live: their first independent diff used a malformed jq, both sides came back
empty, and `diff` reported "no difference" — a green result from two empty files, caught only by
printing input sizes.

**T2 is covered** because the reviewer reproduced G5/G5b's substance independently. **Fix both gate
defects as one reviewed micro-change after T2's PUTs and before T3**, together with the `--exclude`
phantom. Do not touch the instrument mid-tranche. See [[green-that-cannot-fail]].

### ⚠️ Gate defect found (cosmetic, NOT fixed — the gate is frozen during the tranche it judges)

With **no** `--exclude` flags, `assert-auth.sh` still prints:

```
   EXCLUDED from G1-G4/G5/G5b (deliberate, held to a later tranche):
     - 
```

Cause: `EXCL_JSON="$(printf '%s\n' ${EXCLUDES[@]+"${EXCLUDES[@]}"} | jq -R . | jq -s .)"` — with an
empty array, `printf` still emits one empty line, so `EXCL_JSON` is `[""]`, whose length is 1, so the
block prints with a blank entry.

**Functionally inert** — `[""]` never matches a real node name, so G1–G4/G5/G5b/residual are all
unaffected (independently confirmed: the six target nodes are all evaluated and reported).
**But it is misleading in exactly the way §5.1 warns about**: the exclusion list is supposed to be
DATA, and it currently renders as "one node excluded (unnamed)" on a tranche that excluded nothing.
A reviewer skimming the output could read it as an undocumented exclusion.

Per the T1 ruling (*"the coder was right not to edit the gate mid-tranche — editing the assertion
instrument during the tranche it judges destroys its independence"*), **I did not fix it.** Suggested
fix for a later micro-change, alongside the outstanding `jq -n` missing-`-r` cosmetic from T1:
`[ ${#EXCLUDES[@]} -eq 0 ] && EXCL_JSON='[]' || EXCL_JSON=...`.

---

## Deliverable 4 · Pre-PUT credential baseline (LESSONS 55 collateral assertion)

Every credential bound anywhere in each workflow **before** T2. **All must still be bound, unchanged,
after that workflow's PUT.** Any loss → immediate rollback via that workflow's prior `activeVersionId`.

| workflow | node | node type | credential | id | name |
|---|---|---|---|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `Assign or unassign a Conversation1` | `@respond-io/n8n-nodes-respond-io.respondio` | `respondIoApi` | `OiS59QkzpKfKSdaa` | `sorento-api` |
| `ss9S83XF7ZtmnaUyFtYZc` | `list-length` | `n8n-nodes-base.redis` | `redis` | `H5w6o7tptzTPMVdy` | `sorento-redis` |
| `ss9S83XF7ZtmnaUyFtYZc` | `pop` | `n8n-nodes-base.redis` | `redis` | `H5w6o7tptzTPMVdy` | `sorento-redis` |
| `ss9S83XF7ZtmnaUyFtYZc` | `Assign or unassign a Conversation1` | `@respond-io/n8n-nodes-respond-io.respondio` | `respondIoApi` | `OiS59QkzpKfKSdaa` | `sorento-api` |
| `FfmDkEWdt3Bian82` | — | — | — | — | **none (0 bound)** |
| `Srs08P0Ha3Cv--YPx0-Yn` | `Redis` | `n8n-nodes-base.redis` | `redis` | `H5w6o7tptzTPMVdy` | `sorento-redis` |
| `Srs08P0Ha3Cv--YPx0-Yn` | `Redis1` | `n8n-nodes-base.redis` | `redis` | `H5w6o7tptzTPMVdy` | `sorento-redis` |

**Expected bound-node counts post-PUT:**

| workflow | pre-existing | + new `httpHeaderAuth` | = expected total |
|---|---|---|---|
| `FfmDkEWdt3Bian82` | 0 | 1 | **1** |
| `ss9S83XF7ZtmnaUyFtYZc` | 3 | 2 | **5** |
| `7lFff6i_udSxyUbCMdTuD` | 1 | 2 | **3** |
| `Srs08P0Ha3Cv--YPx0-Yn` | 2 | 1 | **3** |
| **tranche** | **6** | **6** | **12** |

None of the four had **any** `httpHeaderAuth` binding before T2, so every one of the 6 new bindings is
unambiguously new — no ambiguity about what the PUT added.

Post-PUT assertion, per workflow:

```bash
jq -r '.nodes[]|select(.credentials!=null and (.credentials|length)>0)
       |"\(.name)\t\(.credentials|to_entries|map("\(.key)=\(.value.id)")|join(","))"' T2-<id>-after.json
```

---

## Deliverable 5 · §5.2 per-node acceptance — the domain-specific key

Per the rewritten acceptance clause, the **only** clause that fires is `main[0][0].json` carrying a
named domain-specific key, **plus `main[0][0].json.error` explicitly ABSENT**. Response shapes below
were **read from the CRM source** (`/Users/tehjayson/Documents/foundryx/sorento_crm/sorento_crm_backend`),
not guessed. Every one of the six endpoints was confirmed to sit behind an api-key dependency that
**genuinely 401s on a bad key** — so auth is really exercised in all six cases.

### Error-envelope baseline (what makes a key unusable)

- unhandled 500 → `{"message": "Internal server error"}` (`app/main.py:97`)
- handled `AppException` → **top-level** `{"message":…, "detail":…, "code":…}` (`app/main.py:80-85`,
  `app/services/error_handler.py:6-21`)

⇒ **`message`, `detail`, and `code` are all poisoned** as assertion keys, in this tranche as in T1.
`status` appears in **no** error envelope, but it is generic rather than domain-specific.

### Group A — nodes WITH a clean domain-specific key (4 of 6)

| node | endpoint | success | source | top-level keys | **ASSERT ON** | strength |
|---|---|---|---|---|---|---|
| `get-due-escalations` | `GET .../integration/due-escalations` | 200 | `api/v1/sla/sla_tracking.py:788` | `status, count, items` | **`count`** | strong |
| `conversation-sla-tracking-escalate1` | `POST .../integration/escalate` | 200 | `api/v1/sla/sla_tracking.py:814` | `status, escalated, message, tracking_id, from_tier, to_tier, current_tier, assigned_to_*, message_id` | **`escalated`** (or `tracking_id`) | strong |
| `get-is-working-holiday` | `GET /external/work-calendar/is-working-day` | 200 | `schemas/calendar.py:104` (`ExternalWorkingDayCheckResponse`) | `is_working_day, timezone, local_datetime, local_date, weekday, is_public_holiday` | **`is_working_day`** | strong |
| `insert-message` | `POST /external/chat-history/messages` | **201** | `schemas/external/chat_history.py:38` (`ChatHistoryMessageIngestResponse`) | `id, status` | **`id`** | strong |
| `conversation-sla-tracking-create` | `POST /sla-management/conversation-sla-tracking` | **201** | `schemas/sla.py:427` (`ConversationSLATrackingResponse`) | ~60-key tracking record, **no `status`** | **`already_active`** (or `current_tier`) | strong |

Notes that matter:

- **`get-due-escalations` returns an OBJECT, not a bare array.** `{"status","count","items"}` — n8n
  gets one item with `items` nested, so there is no item-spreading and `count` is a stable top-level
  key. **The empty case is `{"status":"success","count":0,"items":[]}`** — the keys are
  unconditional. ⚠️ **Assert key PRESENCE, never truthiness**: "nothing due" is the common case and
  `count: 0` is falsy. This is the single easiest false-failure in the tranche.
- **`conversation-sla-tracking-escalate1`: `escalated` can legitimately be `false`** on a 200 (the
  already-at-tier-3 short-circuit). Again: **presence, not truthiness.** `message` is poisoned —
  do not use it.
- **`conversation-sla-tracking-create` has NO `status` key** — it is a bare record, not an envelope.
  Do not reach for the Group B clause here by reflex.
- **`insert-message`'s `status` is `"created"`, not `"success"`** — a useful extra discriminator, but
  `id` (the `chat_histories.id` from `INSERT … RETURNING id`) is the real domain key.

### Group B — the ONE node with NO domain-specific key: `healthcheck-callback`

Same endpoint and same problem as T1's 17 status callbacks. The handler
(`app/api/v1/integrations/logs.py:160`) returns a literal bare envelope and nothing else:

```python
return {"status": "success", "message": "Integration log updated successfully."}
```

No `id`, no echoed `integration_log_id`, no resource object. `message` collides with the 500 envelope.
**There is no domain-specific key and none may be invented.**

Apply the **T1 Group B precedent verbatim** (§5.2 GROUP B EXCEPTION — assert the *value*, since the
collision is on the key, not the value), as a **conjunction of all three**:

```
main[0][0].json.status  == "success"
main[0][0].json.message == "Integration log updated successfully."
main[0][0].json.error   ABSENT
```

✅ **Confirmed empirically, not inferred** — execution `9460930` (`2026-07-21T14:34:26Z`, pre-change)
shows `healthcheck-callback` runData `main[0][0].json` = exactly
`{"status":"success","message":"Integration log updated successfully."}`.

**Flagged as weak:** `status` is a generic key. Mitigating factor, same as T1 Group B: `onError` is
unset ⇒ `stopWorkflow`, so a 401 fails the execution **loudly** and the
`search_executions(status:["error"])` backstop is genuinely valid for this node.

⚠️ **Semantic trap, restated:** that `status:"success"` describes **the HTTP callback**, not the
health of anything. Never read it as "the system is healthy."

### Assertion-strength summary

| node | strength | why |
|---|---|---|
| `get-is-working-holiday` | **strong** | unique domain key, `response_model`-declared |
| `insert-message` | **strong** | `id` is unique and `response_model`-declared |
| `conversation-sla-tracking-create` | **strong** | `response_model`-declared |
| `get-due-escalations` | **strong**, with a falsy-value trap | assert presence of `count`, not its value |
| `conversation-sla-tracking-escalate1` | **strong**, with a falsy-value trap | assert presence of `escalated`, not its value |
| `healthcheck-callback` | ⚠️ **WEAK** | no domain key exists; value-assertion + loud-failure property |

**One weak node in six.** Flagged explicitly per the deliverable.

### Reachability — and how each node can actually be verified

| node | reachable? | how / caveat |
|---|---|---|
| `healthcheck-callback` | ✅ ~2×/hour | CRM watchdog webhook. **Fastest verdict in the tranche → canary.** |
| `insert-message` | ✅ but sparse | Workflow polls every 5 s, but **most executions are empty polls where `insert-message` never runs at all** (verified: exec `9465526` has empty `runData`). LESSONS 46 applies exactly — counting executions is a clock, not a signal. The tester must find an execution where `insert-message` **has runData**, not merely one that succeeded. |
| `get-due-escalations` | ✅ every 60 s | Runs unconditionally on every tick. Straightforward. |
| `get-is-working-holiday` | ⏳ **once daily, 08:00 MYT** | Up to ~24 h latency. |
| `conversation-sla-tracking-create` | ⏳ once daily **AND** gated | Behind `If1` on a non-empty queue — may not run even on the daily tick. **Record as UNVERIFIED if it does not fire; never infer from a clean static diff (LESSONS 54).** |
| `conversation-sla-tracking-escalate1` | 🚫 **NEVER PROVOKE** | §5.3 observational only — real staff escalation ripple. Wait for a genuine due escalation, read that execution, or record **UNVERIFIED**. |

⚠️ **Pre-existing error baseline the tester MUST NOT misattribute:** `system-healthcheck-ping` already
errors on roughly half its invocations, and has done so **before any T2 change**. Example: execution
`9464991` (`2026-07-21T15:21:21Z`) — `httpCode: 404`, `NOT_FOUND`, *"Integration Log not found. Someone
might have deleted it already."* The CRM pokes the webhook with an `integration_log_id` that no longer
exists. Two distinct callers are visible: the `:34`-past-the-hour ones succeed, the `:21` ones 404.
**This is not auth and is not caused by T2.** A post-PUT 404 is the status quo; a post-PUT **401** is
the regression. Distinguish by `httpCode`, not by the presence of errors.

### Redirect note — `conversation-sla-tracking-create` (informational, low risk)

The CRM route is declared `@router.post("/")` with FastAPI's default `redirect_slashes=True`, but the
n8n node's URL has **no** trailing slash — so this request already takes a **307** hop today, and the
307 preserves the POST body. The concern would be whether the auth header survives the hop once it
comes from a credential rather than a literal header parameter. Read from a real execution's request
context, n8n sets `followRedirect: true`, `followAllRedirects: true`,
`sendCredentialsOnCrossOriginRedirect: true`, and `httpHeaderAuth` injects into the same
`requestOptions.headers` that a literal header parameter does. **Same-host, same injection point ⇒
behaviour should be identical.** Recorded as low-risk rather than silently assumed; worth a glance in
the tester's first post-PUT run of this node.

---

## Deliverable 6 · G7 census — derived from the CORRECTED baseline of 19, not the stale 32

Per §5.1 as corrected: after T1 the true instance-wide non-archived count is **19**, decomposing as
18 (T2–T5 in-scope) + 1 (`integration-log-update3`, held for T1b).

```
19  (post-T1, corrected baseline)
 −6 (T2: 2 + 2 + 1 + 1)
=13  ← expected instance-wide non-archived count after all four T2 PUTs
```

Per workflow:

| workflow | before | after | delta |
|---|---|---|---|
| `schedule-sla-policy-checker` | 2 | **0** | −2 |
| `schedule-working-day-detection` | 2 | **0** | −2 |
| `system-healthcheck-ping` | 1 | **0** | −1 |
| `redis-consume-queue-mongo` | 1 | **0** | −1 |
| **tranche** | **6** | **0** | **−6** |

**Expected post-tranche census: 13**, distributed as:

| workflow | tranche | expected residual |
|---|---|---|
| `respond-send-user` | T3 | 3 |
| `sub-human-intervention` | T4 | 3 |
| `respond-change-assignee-system` | T3 | 2 |
| `respond-close-convo` | T3 | 2 |
| `respond-create-update-contact-system` | T3 | 1 |
| `sorento-consume-main` (draft-measured; **10** against active) | T5 | 1 |
| `system-upload-attachments` (`integration-log-update3`) | T1b | 1 |
| | | **13** |

Archived: **26**, unchanged (out of scope, §1). Instance totals re-verified: 98 workflows, 58 active,
28 archived — matching plan §0 exactly.

### ⚠️ The census is DRAFT-measured, so it has ALREADY moved 19 → 13 before any PUT

REST `GET /workflows` returns the **draft**. My MCP edits removed the `x-api-key` entries from four
drafts, so a census run **right now**, with nothing published, already reads **13** — and I measured
exactly that.

**This means the post-PUT census cannot distinguish "published" from "drafted".** It is not evidence
of a successful promote and must not be read as such. The published-state evidence is
`versionId == activeVersionId` plus **G3=true** in the gate, not the census. G7's binding rule —
*"must fall by exactly the tranche's node count and never rise"* — is satisfied and none of the other
in-scope workflows rose (3,3,2,2,1,1 = 12, matching §0.2 exactly, plus 1 for T1b). Flagged for
reviewer ratification; this draft-vs-active ambiguity in G7 is a property of the instrument that T1
did not surface because T1's census was only run post-PUT.

---

## Plan corrections arising from T2

1. **§4 T2's "Self-driving (schedule/webhook) → they verify themselves within minutes of publish" is
   wrong for two of the four.**
   - `schedule-working-day-detection` runs **once daily at 08:00 MYT** (`triggerAtHour: 8` +
     `settings.timezone: Asia/Kuala_Lumpur`). Verification latency is up to **~24 hours**, and its
     second node is additionally queue-gated so it may not fire even then.
   - `system-healthcheck-ping` is **webhook**-triggered by the CRM watchdog, not scheduled — it fires
     on someone else's clock (≈2×/hour observed).

   Only `schedule-sla-policy-checker` (60 s) and `redis-consume-queue-mongo` (5 s) match the plan's
   description. **The tranche cannot be fully verified within minutes; budget a day.**

2. **§2 CORRECTION 3's T2 entries are CORRECT** — re-derived from `connections`, both
   `schedule-sla-policy-checker` nodes are genuinely silent (`main` length 1). The T1 reviewer's
   ruling that the over-generalisation was confined to `system-upload-attachments` is confirmed by an
   independent re-derivation, as instructed.

3. **§5.2's unreachable/hard-to-reach table should gain `conversation-sla-tracking-create`**
   (daily + queue-gated) alongside the already-listed `conversation-sla-tracking-escalate1`.

4. **`insert-message`'s failure mode is loud AND lossy** — the redis POP precedes it, so a broken
   publish permanently loses messages rather than merely failing visibly. Worth stating in the plan;
   "loud" has been used throughout as a synonym for "safe to detect after the fact", and here it
   isn't.

5. **G7 is draft-measured** (above) — the plan should say so, since it changes what the metric proves.

6. **`assert-auth.sh` prints a phantom blank exclusion** when `--exclude` is not passed (above).

---

## Pre-existing validation warnings — untouched, NOT "fixed" (LESSONS 13)

- `redis-consume-queue-mongo › Analyze document` (googleGemini, **disabled**): `INVALID_PARAMETER`
  `parameters.resource: "document"`, expected `"audio"`. Present before and after; same class as T1's
  googleGemini warnings.
- The `HARDCODED_CREDENTIALS` warnings on all 6 target nodes are **gone** in the drafts. That is the
  intended signal.

---

## Safety

**No egress of any kind.** Params-only edits into four unpublished drafts. No PUT, no publish, no
execution run, no webhook fired, no redis seed, no message injected, no CRM write.

- No WhatsApp/comment reached any respond.io contact.
- No assignment, reassignment, SLA POST, or PIC comment was originated. `conversation-sla-tracking-escalate1`
  was **not** provoked and must not be (§5.3).
- No conversation-variable write, contact-field mutation, or CRM record create.
- Reads performed: REST `GET /workflows` (×4 + census), and three `get_execution` reads of
  **pre-existing, naturally-occurring** executions (`9464991`, `9460930`, `9465526`) — observation
  only, nothing triggered.

**Not touched:** the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone `txiPzSxy3Pclsz6v`, the fork
`vUfFUDjLAuMaeQE6`, `system-upload-attachments` `_NbFU3cCoEQwPSbvn14vV`, and every other workflow on
the instance. The only live-instance mutation is four draft pointers moving; **all four
`activeVersionId`s are unchanged, so production behaviour is bit-for-bit what it was.**

---

## Rollback (§4.10, "draft edited, not yet published")

Nothing published → active untouched → **rollback needs no publish.** Per workflow, re-apply from
that workflow's `T2-<id>-nodes-before.json`: for each target node delete `/authentication` and
`/genericAuthType`, and restore `/headerParameters/parameters` to the backup's array (remembering
`insert-message`'s array has **two** entries).

Recorded rollback pointers, should any PUT land and need reverting (`publish_workflow` ← prior
`activeVersionId`):

| workflow | rollback to |
|---|---|
| `7lFff6i_udSxyUbCMdTuD` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` |
| `ss9S83XF7ZtmnaUyFtYZc` | `665c26de-1b6b-4b45-a3e8-303303c2df96` |
| `FfmDkEWdt3Bian82` | `b6537382-117a-4470-8cb6-308913d4a385` |
| `Srs08P0Ha3Cv--YPx0-Yn` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` |

⚠️ **Parked-draft hazard is sharper than T1's.** These are ACTIVE, self-firing workflows. A parked
draft means any publish of any of them, for any reason, ships credential-less nodes into a path that
executes in seconds (5 s for `redis-consume-queue-mongo`). **Either finish T2 or roll it back — do not
park it.** Recommend the same 72 h limit the T1 review imposed, or until any of the four
`activeVersionId`s moves, whichever is first.

---

## Handoff

1. **Reviewer:** review the four drafts and the four `body.json` files **as bytes** (shas above).
   Please rule on: the six plan corrections; the G7 draft-measured ambiguity; the `assert-auth.sh`
   phantom-exclusion defect; and whether the `healthcheck-callback` Group B assertion may inherit the
   T1 precedent without re-argument.
2. **User gate:** approve each PUT **individually**. Four PUTs, four gates, four independent reverts.
3. **Recommended PUT order** (canary first, lossiest last):
   `FfmDkEWdt3Bian82` → `ss9S83XF7ZtmnaUyFtYZc` → `7lFff6i_udSxyUbCMdTuD` → `Srs08P0Ha3Cv--YPx0-Yn`.
   Per workflow, in one action: re-run the draft-vs-active diff → re-verify **that file's** sha →
   `PUT --data-binary @T2-<id>-body.json` unmodified. **Do not proceed to the next workflow until the
   previous one's post-PUT assertions are green.**
4. **Immediately post each PUT:** capture `after.json`; re-run that workflow's `assert-auth.sh`
   (expect the pre-declared `RESULT: PASS`); assert its credential baseline survives (expected bound
   counts 1 / 5 / 3 / 3); assert `settings` merge preserved `binaryMode` / `timeSavedMode` /
   **`timezone`**; assert `pinData` / `staticData` / `name` / `active` / `connections` unchanged;
   confirm `versionId == activeVersionId`.
5. **Tester §5.2:** Group A's five domain keys — **presence, not truthiness**, for `count` and
   `escalated`. Group B (`healthcheck-callback`) = the 3-part conjunction, recorded as supporting
   evidence with the weakness flagged. Assert per-node `runData`, **never** execution status — the two
   `schedule-sla-policy-checker` nodes are genuinely silent and report `success` on a 401. Baseline
   the pre-existing 404s on `system-healthcheck-ping` before reading any post-PUT error. Record
   `conversation-sla-tracking-create` and `conversation-sla-tracking-escalate1` as **UNVERIFIED** if
   they do not fire naturally — never provoke either, and never infer from a clean static diff.
6. **T3 not started.** No work was done on any T3/T4/T5 workflow.
