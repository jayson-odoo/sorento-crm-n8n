# T3 — CRM auth unification, respond-* writer workflows (8 nodes, 4 workflows)

**Change-id:** auth-unification-T3-respond-writers
**Date:** 2026-07-22
**Plan:** `n8n-workflows-init/plans/crm-auth-unification-plan.md` — §3 (D1–D4), §3.3 (REWRITTEN), §4 T3,
§4.6, §4.7 (AMENDED), §4.9 (AMENDED), §4.10, §5.1 (gate acceptance AMENDED + G7 CORRECTED)
**Authoritative tranche design:** `n8n-workflows-init/plans/T3-verification-design.md` (silent/loud,
PUT order, conversion-risk flags, collateral creds, per-node acceptance)
**Precedent:** `T2-schedule-system.md` + `reviews/auth-unification-T2-schedule-system.md`
**Gate:** `assert-auth.sh` (hardened 2026-07-22 — `--exclude` works, no phantom line, G5/G5b FAIL loudly
on jq error). **NOT edited during this tranche.**

---

## ✅ PROMOTE RECORD — 2026-07-22 (coder, user-approved) — ALL 4 PUBLISHED, ALL STATE-VERIFIED, NOTHING ROLLED BACK

**Plain state: all four T3 workflows are now converted, published, and state-verified in production.
PUT #1 landed earlier (HTTP 409, state good). PUTs #2, #3, #4 landed this run, each HTTP 200 and each
passing every post-PUT state assertion. Zero rollbacks, zero halts.** T3 is complete.

| # | workflow | id | HTTP | prior activeVersionId | new versionId==activeVersionId | pushed sha | who pushed |
|---|---|---|---|---|---|---|---|
| 1 | respond-create-update-contact-system | `gVbpRvD19qrafdqMpORkE` | **409** (state good) | `c1b801aa…` | `293ac316-dd42-4c07-8960-a08e7ff1412a` | `e75ccfac…` | coder (prior run) |
| 2 | respond-close-convo | `-WkzJMQZHmsFQm6A2abLJ` | **200** | `c0f023ff…` | `4a2e963d-dd2a-443e-bbb1-68b43ee29744` | `f167f154…` | coder (this run) |
| 3 | respond-send-user | `eG3AA-TWo17-E1-DlHLnH` | **200** | `d658273c…` | `c23ce991-64d7-43dc-b8e8-bcd4c9c12de0` | `45abae38…` | coder (this run) |
| 4 | respond-change-assignee-system | `z2RrHQ6qO9sDbNh2nrn4n` | **200** | `181bc50f…` | `0cd05898-f6db-442d-94b8-722fb0db9148` | `b72b2ecc…` | coder (this run) |

**409 vs 200:** only #1 returned 409 (its pre-existing intra-workflow duplicate webhookId
`635d2f4f…` on `Respond.io Trigger1`/`Trigger2`). #2/#3/#4 each have a unique trigger webhookId and
returned clean **200**. The 409-vs-200 distinction is a webhook-registration outcome, not a
data-write outcome — all four data writes + publishes persisted.

### PUT #2 · `-WkzJMQZHmsFQm6A2abLJ` (respond-close-convo) — HTTP 200, state VERIFIED GOOD

- **§4.6 pre-flight (MCP):** `activeVersionId=c0f023ff…` (== rollback pointer, unmoved),
  `versionId=ac6a7dd0…` (== staged draft), differing set = exactly the 2 targets, delta = D1/D2/D4.
  Body proven byte-faithful to the current live draft + D3 (semantic sorted-key compare; binaryMode
  stripped). PASS.
- **Body:** sha `f167f154…` / 12657 B re-verified immediately before PUT. Match.
- **PUT: HTTP 200.** New `versionId == activeVersionId == 4a2e963d…`, `active:true`.
- **Collateral (LESSONS 55): 7/7 exact** — 3× `respondIoApi=OiS59QkzpKfKSdaa` (`Respond.io Trigger`,
  `Assign or unassign a Conversation`, `Update a Contact`), 2× `postgres=ETJL5KoaA1UpkDip`
  (`Execute a SQL query`, `Execute a SQL query1`), 2× new `httpHeaderAuth=mNsZWyU82NYV58k2` on the targets.
- **Preservation:** `binaryMode == "separate"` **survived** (merge); `pinData`/`staticData`/node-set/
  connections unchanged; residual x-api-key **NONE**; literal CRM key **0** occurrences.
- **Gate (inline, leading-dash id):** RESULT **PASS** — G1–G4 PASS (2 CRM nodes), G5/G5b PASS pop **9**,
  G6 PASS ×2, residual NONE, draft==active. Exact match to the pre-declared post-PUT block (N=2, pop=9).
  `assert-auth.sh` was **not** edited; gate G1–G7 jq reproduced inline verbatim.

### PUT #3 · `eG3AA-TWo17-E1-DlHLnH` (respond-send-user) — HTTP 200, state VERIFIED GOOD

- **§4.6 pre-flight (MCP):** `activeVersionId=d658273c…` (unmoved), `versionId=84f87337…` (staged draft),
  differing set = exactly the 3 targets, delta = D1/D2/D4. Body byte-faithful to draft + D3. PASS.
- **Body:** sha `45abae38…` / 16066 B re-verified before PUT. Match.
- **PUT: HTTP 200.** New `versionId == activeVersionId == c23ce991…`, `active:true`.
- **Collateral: 7/7 exact** — 2× `respondIoApi` (`Respond.io Trigger`, `Update a Contact`), 2×
  `postgres=ETJL5KoaA1UpkDip` (`Select rows from a table`, `Execute a SQL query`), 3× new
  `httpHeaderAuth` on the targets. `save-session-vars` **`retryOnFail:true` preserved**.
- **Preservation:** `pinData` (2 keys) / `staticData` / node-set / connections unchanged; residual NONE;
  literal key 0.
- **Gate (`./assert-auth.sh eG3AA-TWo17-E1-DlHLnH T3-…-before.json`):** RESULT **PASS** — G1–G4 (3 nodes),
  G5/G5b pop **12**, G6 ×2, residual NONE. Exact match to pre-declared block (N=3, pop=12).

### PUT #4 · `z2RrHQ6qO9sDbNh2nrn4n` (respond-change-assignee-system) — HTTP 200, state VERIFIED GOOD (LAST — the silent one)

- **§4.6 pre-flight (MCP):** `activeVersionId=181bc50f…` (unmoved), `versionId=4d3799c6…` (staged draft),
  differing set = exactly the 2 targets, delta = D1/D2/D4. Body byte-faithful to draft + D3. PASS.
- **Body:** sha `b72b2ecc…` / 3430 B re-verified before PUT. Match.
- **PUT: HTTP 200.** New `versionId == activeVersionId == 0cd05898…`, `active:true`.
- **Collateral: 3/3 exact** — 1× `respondIoApi` (`Respond.io Trigger`), 2× new `httpHeaderAuth` on the
  targets. `conversation-assignee-update` **`onError:continueErrorOutput` preserved** (the silent node).
- **Preservation:** `pinData`/`staticData`/node-set/connections unchanged; residual NONE; literal key 0.
- **Gate (`./assert-auth.sh z2RrHQ6qO9sDbNh2nrn4n T3-…-before.json`):** RESULT **PASS** — G1–G4 (2 nodes),
  G5/G5b pop **3**, G6 ×2, residual NONE. Exact match to pre-declared block (N=2, pop=3).

### Post-promote observational check (read-only, sparse — MCP `search_executions`, NOT provoked)

- `search_executions(status:["error","crashed"], startedAfter=2026-07-22T00:47:00Z)` on `-WkzJMQZ…`,
  `eG3AA…`, `z2RrHQ6…` → **`data:[]` on all three** (no errored/crashed executions since their PUTs).
  Window is short (PUTs just landed); the LOUD nodes (2,3,5,6,7,8) would surface a `status:error` on an
  auth failure and none appeared. Tester should keep the `status:error` rollback-watch running per
  Deliverable 6 and confirm a positive 2xx in-window (`save-session-vars` fastest, < 1 staffed hour).
- **The 2 SILENT nodes are invisible to this query** and are recorded **UNVERIFIED-by-positive-proof**,
  auth-covered by the credential-inheritance argument (P1 measured + P2 gate):
  `contact-create-update` (#1) and `conversation-assignee-update` (#4). **Not provoked; must not be**
  (`updated:true` is the only positive proof for #4, arriving ≤1 staffed day at ~3/h organic).
- **Webhook re-registration is NOT read-only-verifiable.** All four report `active:true`; #1's 409 means
  its webhook re-subscription step errored. See the UI-confirmation ask below.

### ⚠️ UI-confirmation ask for the user (webhook health — not provable read-only)

`active:true` via API is not full proof each respond.io trigger re-subscribed. #1 returned 409 on its
webhook step (user already confirmed #1 healthy in the UI). #2/#3/#4 returned clean 200, which is a
better signal, but re-registration still cannot be verified read-only. **Please confirm in the n8n UI
that all four show Active with no trigger-registration error:** `respond-close-convo`,
`respond-send-user`, `respond-change-assignee-system` (and `respond-create-update-contact-system`,
already confirmed).

---

## ⏸ SUPERSEDED — 2026-07-22 (coder) — 1 of 4 PUBLISHED, SEQUENCE HALTED on a 409 webhook-conflict

*(Superseded by the completed promote record above. Retained for the audit trail of the earlier halt.)*

**Plain state: PUT #1 (`respond-create-update-contact-system`) is LIVE and its auth conversion is
verified correct. PUTs #2–#4 were NOT sent. Nothing was rolled back.** The stop is deliberate, not a
crash.

### PUT #1 · `gVbpRvD19qrafdqMpORkE` — PUBLISHED, auth conversion verified GOOD, but PUT returned HTTP 409

- **Pre-flight (MCP):** `activeVersionId=c1b801aa…` (== recorded rollback pointer), `versionId=2c81a4d5…`
  (== staged draft), sole differing node `contact-create-update`, delta = D1/D2/D4 only. PASS.
- **Body:** sha `e75ccfac…` / 10282 B re-verified immediately before PUT. Match.
- **PUT result: HTTP 409** `{"message":"There is a conflict with one of the webhooks."}` — BUT the write
  **persisted and published anyway**: new `versionId == activeVersionId == 293ac316-dd42-4c07-8960-a08e7ff1412a`,
  `active:true`. The 409 is a webhook **re-registration** failure that fires AFTER the workflow is saved
  + published. **Root cause: `Respond.io Trigger1` and `Respond.io Trigger2` share the same `webhookId`
  `635d2f4f-c5f8-4167-95ee-9c20b931b4d4`** (a pre-existing intra-workflow duplicate); re-registering the
  second collides. Prior `activeVersionId` for rollback: `c1b801aa-6f4e-493e-a1d9-d12879f878f8`.
- **Collateral (LESSONS 55): 5/5 present, exact** — `Respond.io Trigger`/`Trigger1`/`Trigger2` +
  `Update a Contact` all `respondIoApi=OiS59QkzpKfKSdaa`, `contact-create-update`
  `httpHeaderAuth=mNsZWyU82NYV58k2`. No binding lost.
- **Structure:** connections byte-identical; node-name set identical; residual x-api-key NONE;
  `versionId == activeVersionId`.
- **Gate:** `./assert-auth.sh gVbpRvD19qrafdqMpORkE T3-…-before.json` → **RESULT: PASS** (exit 0),
  G1–G4 PASS (1 node), G5/G5b PASS pop 7, G6 PASS ×2, residual NONE, draft==active — exact match to the
  pre-declared post-PUT block.
- **Open caveat (needs UI confirmation by the user):** the 409 means n8n's webhook re-registration
  step errored. `active:true` is reported and respond.io holds the external webhook independently, so
  ingestion very likely continues — but this is not provable via the read-only REST API. **User should
  confirm in the UI that `respond-create-update-contact-system` is Active and its respond.io triggers
  show no activation error.**

### PUTs #2–#4 · NOT SENT — sequence halted

`-WkzJMQZHmsFQm6A2abLJ` (close-convo), `eG3AA-TWo17-E1-DlHLnH` (send-user), `z2RrHQ6qO9sDbNh2nrn4n`
(change-assignee) remain **armed drafts** (D1/D2/D4 applied, D3 not bound, unpublished). All four
`activeVersionId`s for #2–#4 are UNCHANGED from the recorded pointers (production bit-for-bit unchanged
on those three). **Reason for halt:** PUT #1 returned an unanticipated 409 on a LIVE staff-facing
workflow; per the task rules ("a failed PUT is not retried blind — capture, assess, report"; "report
blocks, never work around them") I did not fire three more identical PUTs into live workflows behind an
un-resolved error mode. #2–#4 each have a **unique** trigger webhookId (no intra-workflow duplicate),
so PUT #1's specific 409 cause may not apply to them — but that cannot be confirmed without PUTting a
live workflow, which the rules forbid. **User decision required** (see the two options in the coder
handoff).

---

## ⏸ ORIGINAL STATUS (superseded by the promote record above): DRAFT ONLY — D1/D2/D4 applied to four drafts. D3 NOT applied. NO PUT SENT. NOTHING PUBLISHED.

Per §4.7 as amended + LESSONS 55: on a live workflow **a REST PUT is the promote**, and REST PUT is the
only way to bind a generic-auth credential (MCP cannot bind `httpHeaderAuth`). This tranche stops one
step short. The handoff artifact is **four drafts + four exact PUT bodies**, each independently
reviewable and revertible, each with a recorded sha256 + byte size.

**FOUR separate workflows ⇒ FOUR separate PUTs and FOUR `body.json`. Deliberately not batched.**

⚠️ **These are LIVE, active, respond.io-trigger-subscribed workflows that fire on real staff/customer
activity.** All four drafts are currently NON-FUNCTIONAL on their target nodes (D1+D2 with no bound
credential). **A publish of any of them, for any reason, ships credential-less nodes into a
staff-facing path on the next trigger.** Do not publish anything mid-sequence. Either complete the PUT
sequence (§5) or roll back (§4.10). Parked-draft window: **24 h from 2026-07-22, or until any of the
four `activeVersionId`s moves, whichever is first** (T2-review §12 precedent — self-firing workflows).

---

## Prereq findings

### Node list — RE-VERIFIED against live (REST GET + MCP, 2026-07-22), exact match to T3-design §0

**4 workflows, 8 CRM nodes, no more, no fewer.** All `active:true`, `isArchived:false`. Every CRM node
carries `authentication:none`, no credential, `sendHeaders:true`, `x-api-key` as its **only** header,
`typeVersion 4.3`. No non-CRM httpRequest node exists in any of the four → **no CRM-host-filter blind
spot** (cross-checked: the set of nodes carrying an `x-api-key` header over ALL node types is exactly
these 8).

| # | node | workflow | id | method · endpoint | family | onError | `main[1]` wired | verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `contact-create-update` | respond-create-update-contact-system | `gVbpRvD19qrafdqMpORkE` (7 nodes) | POST `/external/respond-contacts` | A | `continueErrorOutput` | **NO** (`→ findcontact` only) | 🔇 **SILENT** |
| 2 | `conversation-sla-tracking-update` | respond-close-convo | `-WkzJMQZHmsFQm6A2abLJ` (9 nodes) | PUT `/sla-management/conversation-sla-tracking/{id}` | B | absent ⇒ stopWorkflow | n/a | 🔊 LOUD |
| 3 | `conversation-sla-event-tracking-create` | respond-close-convo | `-WkzJMQZHmsFQm6A2abLJ` | POST `/sla-management/…/event-logs` | B | absent ⇒ stopWorkflow | n/a | 🔊 LOUD |
| 4 | `conversation-assignee-update` | respond-change-assignee-system | `z2RrHQ6qO9sDbNh2nrn4n` (3 nodes) | POST `/external/conversation-assignee` | A | `continueErrorOutput` | **NO** (`→ sla-event-create` only) | 🔇 **SILENT** |
| 5 | `conversation-sla-event-tracking-create` | respond-change-assignee-system | `z2RrHQ6qO9sDbNh2nrn4n` | POST `/sla-management/…/event-logs` | B | absent ⇒ stopWorkflow | n/a | 🔊 LOUD (unreachable if #4 401s) |
| 6 | `conversation-sla-tracking-update` | respond-send-user | `eG3AA-TWo17-E1-DlHLnH` (12 nodes) | PUT `/sla-management/conversation-sla-tracking/{id}` | B | absent ⇒ stopWorkflow | n/a | 🔊 LOUD |
| 7 | `conversation-sla-event-tracking-create` | respond-send-user | `eG3AA-TWo17-E1-DlHLnH` | POST `/sla-management/…/event-logs` | B | absent ⇒ stopWorkflow | n/a | 🔊 LOUD |
| 8 | `save-session-vars` | respond-send-user | `eG3AA-TWo17-E1-DlHLnH` | PUT `/external/conversation-variables/{contact.id}` | A | absent ⇒ stopWorkflow, `retryOnFail:true` | n/a | 🔊 LOUD |

**Silent/loud re-derived independently from each workflow's `connections`** (not inherited from the
design doc, not read off `onError` alone). Two SILENT nodes total — `contact-create-update` and
`conversation-assignee-update` — both Family A, both the first/only CRM writer in their workflow, so
**their workflow has no `status:error` backstop**: a 401 leaves the whole execution `status:success`.
`search_executions(status:["error"])` is blind to both.

> **Sharpest point (unchanged from design §1):** `respond-change-assignee-system` goes silent even
> though #5 is LOUD — #5 sits *downstream* of the silent #4, so a 401 on #4 means #5 never runs and no
> error is ever raised. Assignments silently stop. Treat change-assignee as a silent-failure workflow.

### ✅ No pre-existing rider draft — all four were CLEAN before this work (MCP, the channel REST can't give)

Per the concurrent-publisher hazard: before editing each, `versionId` and `activeVersionId` were
recorded via **MCP `get_workflow_details`**. All four `versionId == activeVersionId` → nobody got there
first, no unattributed draft delta anywhere.

| workflow | id | `versionId` **before** == `activeVersionId` |
|---|---|---|
| respond-create-update-contact-system | `gVbpRvD19qrafdqMpORkE` | `c1b801aa-6f4e-493e-a1d9-d12879f878f8` |
| respond-close-convo | `-WkzJMQZHmsFQm6A2abLJ` | `c0f023ff-35f5-4a64-89e9-643ac0f976ca` |
| respond-change-assignee-system | `z2RrHQ6qO9sDbNh2nrn4n` | `181bc50f-bbc0-42a3-b218-0a6d7a4587ca` |
| respond-send-user | `eG3AA-TWo17-E1-DlHLnH` | `d658273c-6f86-48f7-aa15-560d295ccce3` |

### Version pointers AFTER the MCP edits (MCP-confirmed; active unchanged = production bit-for-bit unchanged)

| workflow | `versionId` **now** (draft w/ D1/D2/D4) | `activeVersionId` **now** (UNCHANGED) |
|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `2c81a4d5-89a9-444d-a54d-28db98172417` | `c1b801aa-6f4e-493e-a1d9-d12879f878f8` |
| `-WkzJMQZHmsFQm6A2abLJ` | `ac6a7dd0-39f4-4a0e-af65-fe82196d3064` | `c0f023ff-35f5-4a64-89e9-643ac0f976ca` |
| `z2RrHQ6qO9sDbNh2nrn4n` | `4d3799c6-ee60-4d98-abfa-c33de95423f7` | `181bc50f-bbc0-42a3-b218-0a6d7a4587ca` |
| `eG3AA-TWo17-E1-DlHLnH` | `84f87337-c903-4023-8fdf-782c1b7417ba` | `d658273c-6f86-48f7-aa15-560d295ccce3` |

**All four `activeVersionId`s unchanged.** These are the four rollback pointers (§4.10). MCP
draft-vs-`activeVersion` diff confirms the published `activeVersion` still carries the literal
`x-api-key` on all 8 target nodes (1/2/2/3 per workflow) — production untouched.

> **Note:** REST GET on this instance **does** expose `activeVersionId` and embeds `activeVersion.nodes`
> (the T3-design §6 / older-lesson claim that it does not is stale for this API version). MCP was still
> used as the authoritative before/after channel per the task; REST and MCP pointers agree exactly.

> **Draft `meta` rider (inert):** MCP `update_workflow` stamped `meta.aiBuilderAssisted:true,
> builderVariant:"mcp"` onto each draft. This is **not** shipped by the PUT — each `body.json` contains
> only `{name,nodes,connections,settings}`, so `meta` is untouched by the promote. Recorded, not a
> concern.

---

## The delta

| # | change | mechanism | applied here? |
|---|---|---|---|
| D1 | `parameters.authentication = "genericCredentialType"` | MCP `setNodeParameter` `/authentication` | ✅ 8/8 |
| D2 | `parameters.genericAuthType = "httpHeaderAuth"` | MCP `setNodeParameter` `/genericAuthType` | ✅ 8/8 |
| D3 | `credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` | **REST PUT** (staged in 4 × `body.json`) | ⏸ **NOT applied — user-gated** |
| D4 | drop the `x-api-key` header entry | MCP `setNodeParameter` `/headerParameters/parameters` = `[]` | ✅ 8/8 |

**Ops issued: four separate atomic `update_workflow` calls** — 3 + 6 + 6 + 9 = **24 `setNodeParameter`
ops**, all applied. Zero `renameNode`, connection ops, position changes, `addNode`, `setNodeCredential`.
All four responses reported **`autoAssignedCredentials: []`** — LESSONS 47 did not fire.

**D4 is a clean full-clear to `[]` on ALL 8** — every CRM node carried `x-api-key` as its *only* header
(design fact #2 confirmed per node from live). **No second header on any T3 node** (unlike T2's
`X-Source`). So G5b's job here is trivially "the header array became `[]`", verified per node.

**LESSONS 32b check:** zero nodes across all four drafts carry a stray `parameters.parameters.*`
(confirmed `strayNested=none` on all 8 targets from a fresh draft GET). The real leaf keys changed.

---

## Node changes, grouped by workflow (+ silent/loud + PUT order)

The credentials the PUT must NOT drop are listed per workflow (LESSONS 55 collateral baseline). All
`postgres = sorento-crm-db (ETJL5KoaA1UpkDip)` bindings point at **prod** — expected for live
workflows, not a footgun; must survive the PUT.

### PUT #1 · `respond-create-update-contact-system` `gVbpRvD19qrafdqMpORkE` — LOWEST BLAST RADIUS

Contact-metadata upsert; no staff ripple, no send, no SLA. Safest place to re-prove the recipe on a
live respond-trigger workflow.

| node | endpoint | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|
| `contact-create-update` | POST `/external/respond-contacts` | 🔇 SILENT | ✅ | ✅ | `[]` | ⏸ PUT |

Collateral (must survive): `respondIoApi = sorento-api (OiS59QkzpKfKSdaa)` on **4 nodes** — `Respond.io
Trigger`, `Respond.io Trigger1`, `Update a Contact`, `Respond.io Trigger2`.

### PUT #2 · `respond-close-convo` `-WkzJMQZHmsFQm6A2abLJ` — clears the `binaryMode` settings landmine

2 LOUD Family-B nodes, moderate consequence (~1.25/h). Delivers the T3-local Family-B organic 2xx early.

| node | endpoint | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|
| `conversation-sla-tracking-update` | PUT `/sla-management/conversation-sla-tracking/{id}` | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |
| `conversation-sla-event-tracking-create` | POST `/sla-management/…/event-logs` | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |

⚠️ **`settings.binaryMode:"separate"`** — the LESSONS-55 400-trap. **`del(.settings.binaryMode)`** applied
in the body (lossless — settings is merged, not replaced; survives from storage post-PUT). Post-PUT,
re-assert `binaryMode == "separate"` survived.

Collateral (must survive): `respondIoApi = sorento-api (OiS59QkzpKfKSdaa)` on `Respond.io Trigger`,
`Assign or unassign a Conversation`, `Update a Contact` (**3**) + `postgres = sorento-crm-db
(ETJL5KoaA1UpkDip)` on `Execute a SQL query`, `Execute a SQL query1` (**2**).

### PUT #3 · `respond-send-user` `eG3AA-TWo17-E1-DlHLnH` — highest frequency, all LOUD, fastest verifier

`save-session-vars` writes session state on **every** bot reply (~4/h). All 3 nodes LOUD ⇒
self-announcing; verifies in < 1 staffed hour.

| node | endpoint | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|
| `conversation-sla-tracking-update` | PUT `/sla-management/conversation-sla-tracking/{id}` | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |
| `conversation-sla-event-tracking-create` | POST `/sla-management/…/event-logs` | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |
| `save-session-vars` | PUT `/external/conversation-variables/{contact.id}` | 🔊 LOUD (`retryOnFail:true`) | ✅ | ✅ | `[]` | ⏸ PUT |

Collateral (must survive): `respondIoApi = sorento-api (OiS59QkzpKfKSdaa)` on `Respond.io Trigger`,
`Update a Contact` (**2**) + `postgres = sorento-crm-db (ETJL5KoaA1UpkDip)` on `Select rows from a
table`, `Execute a SQL query` (**2**).

### PUT #4 · `respond-change-assignee-system` `z2RrHQ6qO9sDbNh2nrn4n` — LAST (silent + most staff-visible)

Most staff-visible path (assignment) and the sharpest silent-failure workflow (§Node list): a 401 on
the silent `conversation-assignee-update` stops assignments with **no error raised**. Its auth is
Family-A-inherited + Family-B already proven by PUT #2, so nothing is lost by deferring; promote only
after the recipe is proven on the other three.

| node | endpoint | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|
| `conversation-assignee-update` | POST `/external/conversation-assignee` | 🔇 SILENT | ✅ | ✅ | `[]` | ⏸ PUT |
| `conversation-sla-event-tracking-create` | POST `/sla-management/…/event-logs` | 🔊 LOUD (masked by silent #1) | ✅ | ✅ | `[]` | ⏸ PUT |

Collateral (must survive): `respondIoApi = sorento-api (OiS59QkzpKfKSdaa)` on `Respond.io Trigger` (**1**).

**PUT order (§5, for the promote checklist — NOT executed here):**
create-contact → close-convo → send-user → **change-assignee last**.

---

## Deliverable 2 · The four `body.json` files

Each built by the T2-validated recipe from a **fresh REST GET taken after that workflow's MCP edits**
(so it carries D1/D2/D4 from the draft) with D3 layered on for that workflow's targets only:

```
{name, nodes, connections, settings}
| .settings |= del(.binaryMode, .timeSavedMode)
| .nodes |= map(<targets> → credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth})
```

| # | file | sha256 | bytes | nodes | targets bound | total bound nodes |
|---|---|---|---|---|---|---|
| 1 | `T3-gVbpRvD19qrafdqMpORkE-body.json` | `e75ccfac261066a3a633c71d9c06ecea68a742669b7f43773caa459fbb95a844` | **10,282** | 7 | 1 | 5 |
| 2 | `T3--WkzJMQZHmsFQm6A2abLJ-body.json` | `f167f15448acb35ac9c204237bbcafd9eb3fa4982f5823003ed1c4eb1f02683a` | **12,657** | 9 | 2 | 7 |
| 3 | `T3-eG3AA-TWo17-E1-DlHLnH-body.json` | `45abae38bd7467a00ba35f0c13cd9bd10d1ebc6f372dc9960c0d08af2cd8f147` | **16,066** | 12 | 3 | 7 |
| 4 | `T3-z2RrHQ6qO9sDbNh2nrn4n-body.json` | `b72b2eccbd2780f7f545d1464d4fbad452f366d64c411da9a0b10c5c6c70b6c0` | **3,430** | 3 | 2 | 3 |

Listed in **recommended PUT order** (lowest blast radius first; change-assignee last).

Verified for all four: top-level keys exactly `connections, name, nodes, settings`; node count matches
live; **0 occurrences of the real CRM key**; **0 residual `x-api-key` entries**; D3 bound on exactly the
target nodes and no other; every pre-existing binding carried.

### `settings` per body — and the one deliberate deviation from T3-design §6

| workflow | settings BEFORE | stripped | settings IN BODY |
|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `executionOrder, availableInMCP` | *(nothing)* | `{"executionOrder":"v1","availableInMCP":true}` |
| `-WkzJMQZHmsFQm6A2abLJ` | `executionOrder, availableInMCP, binaryMode` | **`binaryMode`** | `{"executionOrder":"v1","availableInMCP":true}` |
| `z2RrHQ6qO9sDbNh2nrn4n` | `executionOrder, availableInMCP` | *(nothing)* | `{"executionOrder":"v1","availableInMCP":true}` |
| `eG3AA-TWo17-E1-DlHLnH` | `executionOrder, availableInMCP` | *(nothing)* | `{"executionOrder":"v1","availableInMCP":true}` |

No `timeSavedMode`, `timezone`, or `callerPolicy` anywhere. Only `respond-close-convo` had a trap key.

> ⚠️ **DEVIATION FROM T3-design §6, flagged for the reviewer.** Design §6 says to *also* strip
> `availableInMCP` "per T2 precedent." **T2 did NOT strip `availableInMCP`** — every T2 approved+
> published body kept it (T2 diff §Deliverable-2, review §2), and it published without a 400, proving
> it is schema-valid. The task's own conversion-fact #1 says "`del(.settings.binaryMode)` (and
> `.timeSavedMode` if present) … exactly as T2 did." I therefore stripped **only** the OpenAPI-invalid
> key `binaryMode`, matching the empirically-validated T2 recipe, and **kept `availableInMCP`**. This
> is the more conservative choice: keeping a schema-valid key relies on merge for nothing, whereas
> stripping it would rely on merge to preserve it. Both are lossless; I chose the one that matches the
> published-and-approved T2 bytes. If the reviewer prefers design §6's literal form, regenerating each
> body with `del(.settings.availableInMCP)` added is a trivial, gate-neutral change (post-PUT settings
> are identical either way via merge).

### ⚠️ Reviewed bytes must equal pushed bytes

The reviewer reviews each `body.json` **as bytes**; the shas above make that provable. Before each PUT:
re-run that workflow's draft-vs-active diff, re-verify **that file's** sha, send it unmodified
(`--data-binary @…`). A regenerated body **voids the review for that workflow only** — the four are
independent.

---

## Deliverable 3 · §5.1 gate — run per workflow against the draft

**No `--exclude` used on any invocation.** Every CRM node in all four workflows is in T3 scope; nothing
held back. Recorded as the absence of the flag, per §5.1.

Three ran through `assert-auth.sh` directly. **The fourth (`-WkzJMQZHmsFQm6A2abLJ`) has a leading-dash
workflow id that `assert-auth.sh`'s arg parser rejects** (`case … -*) echo "unknown flag"; exit 2`, no
`--` end-of-options handling). I **did not modify the gate** (frozen during the tranche it judges). I
reproduced the gate's exact G1–G7 jq logic inline for that one id, using the same REST GET and same
assertions; output matches the other three's signature. **→ New item for the deferred gate
micro-change: support `--` end-of-options (or a leading-dash id) so `assert-auth.sh` can judge
`-WkzJMQZHmsFQm6A2abLJ` directly.**

```
./assert-auth.sh gVbpRvD19qrafdqMpORkE  T3-gVbpRvD19qrafdqMpORkE-before.json
# -WkzJMQZHmsFQm6A2abLJ : gate logic reproduced inline (parser rejects leading-dash id)
./assert-auth.sh z2RrHQ6qO9sDbNh2nrn4n  T3-z2RrHQ6qO9sDbNh2nrn4n-before.json
./assert-auth.sh eG3AA-TWo17-E1-DlHLnH  T3-eG3AA-TWo17-E1-DlHLnH-before.json
```

Actual output, all four (differing lines), with the **hardened gate's compared-node population** now
printed:

| workflow | G1–G4 | G5 (pop) | G5b (pop) | G6 nodes | G6 conns | residual | RESULT |
|---|---|---|---|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | FAIL ×1 — `contact-create-update` `G1=t G2=t G3=false G4=t` | PASS (**7**) | PASS (**7**) | PASS | PASS (byte-identical) | **NONE** | FAIL |
| `-WkzJMQZHmsFQm6A2abLJ` | FAIL ×2 — `conversation-sla-tracking-update`, `conversation-sla-event-tracking-create`, both `G3=false` | PASS (**9**) | PASS (**9**) | PASS | PASS | **NONE** | FAIL |
| `z2RrHQ6qO9sDbNh2nrn4n` | FAIL ×2 — `conversation-assignee-update`, `conversation-sla-event-tracking-create`, both `G3=false` | PASS (**3**) | PASS (**3**) | PASS | PASS | **NONE** | FAIL |
| `eG3AA-TWo17-E1-DlHLnH` | FAIL ×3 — `conversation-sla-tracking-update`, `conversation-sla-event-tracking-create`, `save-session-vars`, all `G3=false` | PASS (**12**) | PASS (**12**) | PASS | PASS | **NONE** | FAIL |

### `RESULT: FAIL` is the CORRECT and EXPECTED output pre-PUT — stated explicitly

**Sole cause on all four is `G3=false`.** G3 asserts the credential binding (D3), deliberately deferred
to the user-gated PUT. **There is no intermediate state in which G3 could pass pre-PUT.** No exclusions,
no `HEADER-DRIFT`, residual **NONE ×4** — the pre-PUT signature is uniform and minimal.

**Proven green right now:** G1/G2/G4 8/8; **G5 no-rider PASS ×4** over 7/9/3/12 compared nodes; **G5b
PASS ×4** (header arrays became `[]`, no non-x-api-key header to preserve on any node); **G6 PASS ×4**
with `connections` **byte-identical**; LESSONS 32b clean ×4.

**Independent draft-vs-`activeVersion` node diff (MCP-embedded `activeVersion`):** differing nodes =
**1 / 2 / 2 / 3** = exactly the targets; **out-of-scope rider nodes = [] on all four** (the only
parameter delta on each changed node is `authentication` + `genericAuthType` + `headerParameters`);
`connections` and node-name set identical draft-vs-active.

### Expected post-PUT gate output, pre-declared (per §5.1 exact-match acceptance)

The gate is now **hardened** (no phantom exclusion line; `--exclude` not passed ⇒ `[]`). Per workflow,
after its own PUT, the run must match **exactly** (N = 1 / 2 / 3 / 2 for create-contact / close-convo /
send-user / change-assignee; pop = 7 / 9 / 12 / 3):

```
== <workflow name> (<id>)
   versionId=<V>  activeVersionId=<V>
   draft == active (published)

-- G1-G4 (per node: authentication / genericAuthType / credential / no x-api-key)
   PASS -- all N CRM nodes satisfy G1-G4

-- G5 no-rider (only authentication / genericAuthType / headerParameters changed)
   PASS -- no out-of-scope key changed on any of <pop> compared nodes

-- G5b headerParameters: only the x-api-key entry removed
   PASS -- non-x-api-key headers preserved verbatim across <pop> nodes

-- G6 no-collateral (node set, connections)
   PASS -- node-name set identical
   PASS -- connections byte-identical

-- residual hardcoded x-api-key in this workflow: NONE

RESULT: PASS
```

**No phantom `EXCLUDED …` block** — the hardened gate does not print it when `--exclude` is absent (this
is the T2-review Condition-1 defect, now fixed in the instrument). For `-WkzJMQZHmsFQm6A2abLJ`, until
the gate supports leading-dash ids, the tester must reproduce the gate logic inline (as done here) or
temporarily wrap it; a raw `./assert-auth.sh -WkzJM…` will still print `unknown flag`.

---

## Deliverable 4 · Pre-PUT collateral-credential baseline (LESSONS 55)

Every credential bound anywhere in each workflow **before** T3. **All must still be bound, unchanged,
after that workflow's PUT.** Any loss → immediate rollback via that workflow's prior `activeVersionId`.
None of the 8 target nodes had **any** credential before T3, so all 8 new `httpHeaderAuth` bindings are
unambiguously new.

| workflow | node | type | credential | id | name |
|---|---|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `Respond.io Trigger` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `gVbpRvD19qrafdqMpORkE` | `Respond.io Trigger1` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `gVbpRvD19qrafdqMpORkE` | `Update a Contact` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `gVbpRvD19qrafdqMpORkE` | `Respond.io Trigger2` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `-WkzJMQZHmsFQm6A2abLJ` | `Respond.io Trigger` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `-WkzJMQZHmsFQm6A2abLJ` | `Assign or unassign a Conversation` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `-WkzJMQZHmsFQm6A2abLJ` | `Update a Contact` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `-WkzJMQZHmsFQm6A2abLJ` | `Execute a SQL query` | postgres | `postgres` | `ETJL5KoaA1UpkDip` | sorento-crm-db (**prod**) |
| `-WkzJMQZHmsFQm6A2abLJ` | `Execute a SQL query1` | postgres | `postgres` | `ETJL5KoaA1UpkDip` | sorento-crm-db (**prod**) |
| `z2RrHQ6qO9sDbNh2nrn4n` | `Respond.io Trigger` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `eG3AA-TWo17-E1-DlHLnH` | `Respond.io Trigger` | respondioTrigger | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `eG3AA-TWo17-E1-DlHLnH` | `Update a Contact` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `eG3AA-TWo17-E1-DlHLnH` | `Select rows from a table` | postgres | `postgres` | `ETJL5KoaA1UpkDip` | sorento-crm-db (**prod**) |
| `eG3AA-TWo17-E1-DlHLnH` | `Execute a SQL query` | postgres | `postgres` | `ETJL5KoaA1UpkDip` | sorento-crm-db (**prod**) |

### Expected bound-node counts post-PUT

| workflow | pre-existing | + new `httpHeaderAuth` | = expected total |
|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | 4 | 1 | **5** |
| `-WkzJMQZHmsFQm6A2abLJ` | 5 | 2 | **7** |
| `eG3AA-TWo17-E1-DlHLnH` | 4 | 3 | **7** |
| `z2RrHQ6qO9sDbNh2nrn4n` | 1 | 2 | **3** |
| **tranche** | **14** | **8** | **22** |

All 22 confirmed present in the reviewed body bytes (both `respondIoApi` and `postgres` collateral
plus the 8 new `httpHeaderAuth`). Post-PUT assertion, per workflow:

```bash
jq -r '.nodes[]|select(.credentials!=null and (.credentials|length)>0)
       |"\(.name)\t\(.credentials|to_entries|map("\(.key)=\(.value.id)")|join(","))"' T3-<id>-after.json
```

---

## Deliverable 5 · Expected G7 census — draft-measured delta from the corrected baseline

Per T2-review §7 (ratified): the post-T2 instance-wide non-archived residual is **13** (draft-measured),
decomposing as T3 (send-user 3 + change-assignee 2 + close-convo 2 + create-contact 1 = **8**) + T4
`sub-human-intervention` (3) + T5 `sorento-consume-main` (1) + T1b `system-upload-attachments` (1).

T3 converts **8 nodes → 0** across its four workflows:

| workflow | before | after | delta |
|---|---|---|---|
| `respond-send-user` | 3 | **0** | −3 |
| `respond-change-assignee-system` | 2 | **0** | −2 |
| `respond-close-convo` | 2 | **0** | −2 |
| `respond-create-update-contact-system` | 1 | **0** | −1 |
| **tranche** | **8** | **0** | **−8** |

**Expected instance-wide G7 after T3: 13 − 8 = `5`** (draft-measured), residual = T4 (3) + T5 (1) +
T1b (1). Per-workflow residual confirmed **0/0/0/0** by the gate's residual line (**NONE ×4**).

> ⚠️ **G7 is DRAFT-measured** (REST `GET /workflows` returns drafts). My MCP edits already stripped
> `x-api-key` from the 8 T3 target drafts, so a census run **right now, with nothing published, already
> reads 5.** **G7 cannot distinguish "drafted" from "published"** and is NOT evidence of a successful
> promote. Published-state evidence is `versionId == activeVersionId` **plus G3=true** in the gate. The
> binding rule "must fall by exactly the node count and never rise" is satisfied at draft time (−8);
> the only testable-post-PUT half is "must not rise, and must read 5." (T2-review §7 improvement: from
> T3 on, G7 could be measured against MCP `activeVersion` to restore the metric — recorded, not done
> here since the instance-wide `activeVersion` census was out of this task's scope.)

---

## Deliverable 6 · Per-node acceptance clause for the tester (copied from T3-design §3)

**PAST executions cannot verify auth** — a pre-conversion run used the literal key. **Only a POST-PUT
execution counts** (LESSONS 54). Auth-resolution premise **P1 is already MEASURED** and inherited, not
re-provoked: Family A via **T0 exec 9456211** (`get-session-vars-http` 2xx) + **T2** `insert-message`;
Family B via **T2 exec 9471108** (`get-due-escalations` = `{"status":"success","count":0,"items":[]}`,
`error` absent — proves the key is enabled for the `sla` module). The credential is one shared object
(`mNsZWyU82NYV58k2`); the two dependencies are shared across tranches. So each node's auth is the
deduction P1 (measured) + P2 (§5.1 gate, per-node), **not** clean-static-diff ⇒ pass.

**Universal acceptance clause — assert on runData PRESENCE, never on execution status:**

```
main[0][0].json.<domain key below>   PRESENT   (presence, not truthiness — beware falsy 0/false/"")
AND main[0][0].json.error            ABSENT
```

Method (LESSONS 35): `search_executions(workflowId, window)` → **one** targeted
`get_execution(includeData:true, nodeNames:[…], truncateData:N)`. Never list-with-data.

| node · workflow | silent/loud | endpoint · handler | domain key to assert | window / trigger | rollback trigger |
|---|---|---|---|---|---|
| `contact-create-update` · create-contact | 🔇 SILENT | POST `/external/respond-contacts` → `RespondContactSyncResponse` | **`action`** ∈ {created,updated} ∧ `error` absent | **auth NOT gated on it** — Family-A inherited + G1–G4. Organic proof best-effort, ~0 traffic (rare) | CRM-side: `respond_contacts` upsert stops advancing for new contacts; or optional Family-A read-probe 401s. **Recorded UNVERIFIED-by-positive-dynamic-proof; never provoke.** |
| `conversation-sla-tracking-update` · close-convo | 🔊 LOUD | PUT `/sla-management/…/{id}` → `ConversationSLATrackingResponse` (bare record, **no `status` envelope**) | **`current_tier`** present (or `id`+`updated_at`) ∧ `error` absent | ~1.25/h conversation-close; ≤1 staffed day, neg ≈0 | new `status:error` exec on `-WkzJMQZ…` |
| `conversation-sla-event-tracking-create` · close-convo | 🔊 LOUD | POST `/sla-management/…/event-logs` (**201**) → `ConversationSLAEventLogResponse` | **`event_type`** ∧ **`sla_tracking_id`** present ∧ `error` absent | same close event (after #2) | new `status:error` on `-WkzJMQZ…` |
| `conversation-assignee-update` · change-assignee | 🔇 SILENT | POST `/external/conversation-assignee` → `set_assignee_for_tracking` | **`updated`==true** AND **`tracking_id`** present ∧ `error` absent | ~3/h staff (re)assignment; positive proof fast, ≤1 staffed day. Auth Family-A inherited | expiry with **no** `updated:true` 2xx AND no CRM-side assignee movement ⇒ rollback (no `status:error` backstop — silent workflow) |
| `conversation-sla-event-tracking-create` · change-assignee | 🔊 LOUD (masked if #4 401s) | POST `/sla-management/…/event-logs` | **`event_type`** ∧ **`sla_tracking_id`** ∧ `error` absent | same reassignment, **only while #4 succeeds** | new `status:error` on `z2RrHQ6…`; a silent #4 masks #5 |
| `conversation-sla-tracking-update` · send-user | 🔊 LOUD | PUT `/sla-management/…/{id}` (bare record) | **`current_tier`** present ∧ `error` absent | bot reply where `Select rows` returns a tracking row; Family-B already proven by close-convo + T2 | new `status:error` on `eG3AA…` |
| `conversation-sla-event-tracking-create` · send-user | 🔊 LOUD | POST `/sla-management/…/event-logs` | **`event_type`** ∧ **`sla_tracking_id`** ∧ `error` absent | same reply (after #6) | new `status:error` on `eG3AA…` |
| `save-session-vars` · send-user | 🔊 LOUD (`retryOnFail`) | PUT `/external/conversation-variables/{id}` → `ConversationStateResponse` | **`session_vars`** object AND **`respond_io_id`** present ∧ `error` absent | **every** bot reply (~4/h) → **< 1 staffed hour**, neg ≈0 | new `status:error` on `eG3AA…` (stopWorkflow+retry) |

**Falsy / ambiguity traps (design §3, binding):**
- `current_tier` can be `1` (falsy-ish) — assert *presence*, not value.
- `conversation-assignee-update`: a legitimate **404** ("no SLA tracking for this contact") arrives as
  `json.error` on `main[1]` and is **structurally indistinguishable from a 401** at the workflow level
  (both dead-end the silent node). ⇒ **Only a positive `updated:true` run counts as proof; an absent
  run is inconclusive, never a pass.**

**Credential-inheritance argument for the 2 SILENT nodes** (`contact-create-update`,
`conversation-assignee-update`): both are Family A; the shared credential's secret is proven accepted by
`get_external_api_user` via T0 exec 9456211 (2xx). Their auth rides P1 (measured) + P2 (the §5.1 gate,
green here except G3 which the PUT supplies), **not** the error-watch (which is structurally blind to
them). Positive dynamic corroboration is best-effort; the SILENT nodes are never provoked.

**One safe optional positive probe** (corroboration, not a gate): a **READ** bound to `crm-n8n-auth` —
Family B `GET /sla-management/conversation-sla-tracking/dashboard`; Family A the existing T0
`get-session-vars-http`. Zero egress, no staff ripple. Do **not** curl with a raw key (LESSONS 14).

---

## §4.9 backup

| workflow | full REST GET (before) | per-node backup (rollback) | gitignored |
|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `T3-gVbpRvD19qrafdqMpORkE-before.json` | `T3-gVbpRvD19qrafdqMpORkE-nodes-before.json` | ✅ |
| `-WkzJMQZHmsFQm6A2abLJ` | `T3--WkzJMQZHmsFQm6A2abLJ-before.json` | `T3--WkzJMQZHmsFQm6A2abLJ-nodes-before.json` | ✅ |
| `z2RrHQ6qO9sDbNh2nrn4n` | `T3-z2RrHQ6qO9sDbNh2nrn4n-before.json` | `T3-z2RrHQ6qO9sDbNh2nrn4n-nodes-before.json` | ✅ |
| `eG3AA-TWo17-E1-DlHLnH` | `T3-eG3AA-TWo17-E1-DlHLnH-before.json` | `T3-eG3AA-TWo17-E1-DlHLnH-nodes-before.json` | ✅ |

`git check-ignore -q` run per file (all 12 body/before/nodes-before) **before** writing any of them.
Repo-wide secret scan via `find . -path ./.git -prune -o -type f -print | xargs grep -l <key>` (NOT
`grep -rl`, which false-negatives here): the literal CRM key appears only in the gitignored `before` /
`nodes-before` backups (T0–T3) — **0 occurrences in any tracked file, 0 in any of the four `body.json`.**

---

## Rollback (§4.10, "draft edited, not yet published")

Nothing published → active untouched → **rollback needs no publish.** Per workflow, re-apply from
`T3-<id>-nodes-before.json`: for each target node delete `/authentication` and `/genericAuthType`, and
restore `/headerParameters/parameters` to the backup's single-entry `x-api-key` array.

Rollback pointers, should any PUT land and need reverting (`publish_workflow` ← prior `activeVersionId`):

| workflow | rollback to |
|---|---|
| `gVbpRvD19qrafdqMpORkE` | `c1b801aa-6f4e-493e-a1d9-d12879f878f8` |
| `-WkzJMQZHmsFQm6A2abLJ` | `c0f023ff-35f5-4a64-89e9-643ac0f976ca` |
| `z2RrHQ6qO9sDbNh2nrn4n` | `181bc50f-bbc0-42a3-b218-0a6d7a4587ca` |
| `eG3AA-TWo17-E1-DlHLnH` | `d658273c-6f86-48f7-aa15-560d295ccce3` |

⚠️ **Do not park half-done.** If PUTs 1–2 land and 3–4 do not, two workflows are converted and two carry
armed credential-less drafts on self-firing paths — the worst state. Complete all four or roll back the
landed ones.

---

## Pre-existing validation warnings — untouched, NOT "fixed" (LESSONS 13)

- `respond-close-convo › Execute a SQL query1` (postgres, **not a T3 target, not touched**):
  `MISSING_EXPRESSION_PREFIX` — its `query` contains `'{{ $('Respond.io Trigger')…phone }}'` without an
  `=` prefix. Surfaced by the `update_workflow` response; pre-existing, present in the active version.
  Recorded so the tester does not misattribute it post-PUT.
- The `HARDCODED_CREDENTIALS` warnings on all 8 target nodes are **gone** in the drafts — the intended
  signal.

Also carried, outside auth scope, recorded so the tester doesn't read it as evidence either way:
`respond-close-convo › Assign or unassign a Conversation` uses `onError:continueRegularOutput` (emits a
fake success item — a failed assignment looks like a success). Untouched by T3.

---

## Safety

**No egress of any kind.** Params-only edits into four unpublished drafts. No PUT, no publish, no
execution run, no webhook fired, no redis seed, no message injected, no CRM write.

- No WhatsApp/comment reached any respond.io contact.
- No assignment, reassignment, SLA POST, or PIC comment was originated. The silent
  `conversation-assignee-update` and the whole assignment path were **not** provoked and must not be.
- No conversation-variable write, contact-field mutation, or CRM record create.
- Reads performed: REST `GET /workflows` (×4 before + ×4 draft), MCP `get_workflow_details` (×4 before,
  ×4 after), `list_credentials`. Observation only; nothing triggered.

**Not touched:** the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone `txiPzSxy3Pclsz6v`, the fork
`vUfFUDjLAuMaeQE6`, the already-converted T0–T2 workflows, and every other workflow on the instance. The
only live-instance mutation is four draft pointers moving; **all four `activeVersionId`s unchanged, so
production is bit-for-bit what it was.**

---

## Handoff

1. **Reviewer:** review the four drafts and four `body.json` **as bytes** (shas in Deliverable 2). Please
   rule on: the **`availableInMCP` settings deviation from design §6** (Deliverable 2 — I kept it, per
   what T2 actually shipped); the `-WkzJMQZHmsFQm6A2abLJ` **leading-dash gate limitation** (add `--`
   support to the deferred gate micro-change); and whether the SILENT-node Family-A credential-
   inheritance argument (Deliverable 6) is sufficient without a new execution.
2. **User gate:** approve each PUT **individually**. Four PUTs, four gates, four independent reverts.
3. **PUT order** (lowest blast radius first): `gVbpRvD19qrafdqMpORkE` → `-WkzJMQZHmsFQm6A2abLJ` →
   `eG3AA-TWo17-E1-DlHLnH` → `z2RrHQ6qO9sDbNh2nrn4n`. Per workflow, in one action: §4.6 re-diff
   (HALT if `activeVersionId` moved off its pointer, or `versionId` off its draft pointer, or the
   differing-node set ≠ its 1/2/3/2 targets) → re-verify **that file's** sha → `PUT --data-binary
   @T3-<id>-body.json` unmodified. Do not proceed until the previous one's post-PUT statics are green.
4. **Immediately post each PUT:** capture `after.json`; re-run `assert-auth.sh` (expect the pre-declared
   `RESULT: PASS`; use the inline reproduction for `-WkzJMQZ…`); assert collateral bound counts
   **5 / 7 / 7 / 3**; assert `binaryMode == "separate"` survived on `-WkzJMQZ…`; assert `pinData` /
   `staticData` / `name` / `active` / `connections` / node-id set unchanged; `versionId ==
   activeVersionId`.
5. **Tester §Deliverable-6:** assert per-node `runData` **presence** (never execution status; the two
   SILENT nodes report `success` on a 401). `updated:true` is the ONLY proof for `conversation-assignee-
   update` (404 ≡ 401 at workflow level). Record `contact-create-update` **UNVERIFIED-by-positive-
   dynamic-proof** (rare traffic) — auth-covered by inheritance, corroboration best-effort, **never
   provoke.** LOUD nodes: arm a `status:error` rollback-watch + best-effort positive 2xx in-window.
6. **T4 not started.** No work on any T4/T5 workflow or the shared subs.
