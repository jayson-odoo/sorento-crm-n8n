# CRM auth unification — move every CRM call onto `crm-n8n-auth`

**Status: PLAN ONLY.** Nothing built, nothing published, no credential touched.
**Scope tag: `deterministic`** for the conversion itself — the delta touches only auth parameters, no
parser and no business logic.

⚠️ **The "0 token cost across every tranche" claim was FALSE — corrected 2026-07-21 post-T0.**
Verification is not token-free, because several in-scope nodes only exist downstream of real LLM
work and cannot be reached otherwise:
- `resolve-entity-clarification` sits behind `validator.has_result=false`, so reaching it runs
  `Basic LLM Chain` + `OpenAI Chat Model` — the clarification LLM is **intrinsic to that branch**.
- `get-presigned-url` and `family-fetch` only exist downstream of a real get-results MCP read.

Both are **reads** and both are permitted, but a strictly-`deterministic` suite cannot cover those
nodes. Budget for real LLM calls in every tranche whose node list includes them, and record the
deviation rather than claiming a zero-token run.
**Programme position: FIRST of three.** See §9.

Goal: every n8n HTTP node calling `https://fe-sorento.foundryx.my` authenticates via the existing
header-auth credential **`crm-n8n-auth` (`mNsZWyU82NYV58k2`, `httpHeaderAuth`)**, and carries no
hardcoded `x-api-key` header. Behaviour-identical on every path — this is a pure auth-plumbing
change with a **zero functional delta**.

---

## 0. Census — re-verified 2026-07-21 against the REST API

Enumerated via `GET {N8N_API_BASE}/workflows?limit=250` (`X-N8N-API-KEY`). **Not MCP** —
`search_workflows` returns only 70 of 98 workflows; the 28 archived are invisible to it. Known
landmine, do not re-discover.

Instance: **98 workflows, 58 active, 28 archived.** One CRM host. Two distinct literal values: the
real key on 78 nodes, and the literal string `test` on one.

| | nodes |
|---|---|
| carry a hardcoded `x-api-key` | **79** |
| ↳ non-archived (**in scope**) | **53** |
| ↳ archived (**out of scope**, §1) | 26 |

Every count in this plan reproduced exactly. **All three of the brief's census figures confirmed.**

### 0.1 The "53" is draft-based — real conversion count is 62

The spine contributes **1** to the 53 because REST GET returns the **draft**, where 9 of 10 nodes are
already converted. Measured against the **active** version the spine needs **10** conversions. So:

```
in-scope nodes (draft-measured)          53
  − spine draft residual                 −1
  + spine active nodes needing work     +10
= actual node conversions to perform     62
```

### 0.2 In-scope workflows

| # | workflow | id | nodes | trigger | tranche |
|---|---|---|---|---|---|
| 1 | `system-upload-attachments` | `_NbFU3cCoEQwPSbvn14vV` | 22 | webhook + execWf | T1 |
| 2 | `sorento-consume-main TEST` (clone) | `txiPzSxy3Pclsz6v` | 10 | execWf | **T0** |
| 3 | `sub-human-intervention TEST (delta3)` (fork) | `vUfFUDjLAuMaeQE6` | 3 | execWf | **T0** |
| 4 | `sub-human-intervention` (SHARED) | `rrYXzE61gCNUck_zmXe-G` | 3 | execWf | T4 |
| 5 | `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` | 3 | respondioTrigger + webhook | T3 |
| 6 | `respond-change-assignee-system` | `z2RrHQ6qO9sDbNh2nrn4n` | 2 | respondioTrigger | T3 |
| 7 | `schedule-working-day-detection` | `ss9S83XF7ZtmnaUyFtYZc` | 2 | scheduleTrigger | T2 |
| 8 | `schedule-sla-policy-checker` | `7lFff6i_udSxyUbCMdTuD` | 2 | scheduleTrigger | T2 |
| 9 | `respond-close-convo` | `-WkzJMQZHmsFQm6A2abLJ` | 2 | respondioTrigger | T3 |
| 10 | `respond-create-update-contact-system` | `gVbpRvD19qrafdqMpORkE` | 1 | respondioTrigger ×3 | T3 |
| 11 | `redis-consume-queue-mongo` | `Srs08P0Ha3Cv--YPx0-Yn` | 1 | scheduleTrigger 5s | T2 |
| 12 | `system-healthcheck-ping` | `FfmDkEWdt3Bian82` | 1 | webhook | T2 |
| 13 | `sorento-consume-main` (LIVE SPINE) | `9qVyfUxmRQqrpGRMDLRuz` | 1 draft / **10 active** | redis-pop | **T5** |

Sum of the `nodes` column = **53** ✓.

---

## 1. Scope

### In scope
The 62 node conversions in §0.1, across the 13 workflows in §0.2. Per-node delta in §3.

### Out of scope — stated once, do not re-litigate

- **Key rotation.** The literal key `M6Hur…` **stays valid**. This work is auth *unification*, not
  secret elimination.
- **Therefore the 28 archived workflows (26 offending nodes) are OUT OF SCOPE.** They are inert; with
  no rotation there is no reason to touch them. Closed.
- **Residual, stated plainly and accepted:** the key remains at rest in workflow JSON, in n8n version
  history, and in stored execution data. Nothing in this plan reduces that exposure. If that residual
  ever becomes unacceptable, the answer is rotation — a *different* programme, which would then drag
  the 26 archived nodes back in.
- **`integration-log-update3`'s literal `test` key** — recorded in §8(a), gets its own ticket, and is
  **explicitly NOT converted in T1** (rationale in §4.2).
- **The unauthenticated MCP client nodes** — recorded in §8(b), own ticket.

---

## 2. Corrections to the brief (verified — three premises were wrong)

Flagging loudly per the planner contract. Two of these make the work *easier*; one makes a hazard
*worse*.

### ✅ CORRECTION 1 — the credential-sharing prerequisite does not exist

The brief flagged `crm-n8n-auth`'s `isGlobal: false` (scoped to project `0HJOI5FmkQeIVfH8`) as a
blocker requiring a sharing step for workflows owned elsewhere.

**All 13 in-scope workflows are owned by `0HJOI5FmkQeIVfH8`.** Verified per-workflow via
`GET /workflows/{id}` → `.shared[].projectId` — 13/13 return
`workflow:owner@0HJOI5FmkQeIVfH8 (Teh Jayson <jayson@foundryx.my>)`, the same project that homes the
credential (`list_credentials` → `homeProject.id`).

**No sharing prerequisite. No blocked tranche.** Every workflow can bind the credential today.

### ✅ CORRECTION 2 — credential binding IS programmatically verifiable, via REST (not MCP)

The brief's trap: "`get_workflow_details` returns no `credentials` block, so you cannot verify from
MCP which credential is bound — use a UI check." Half right, and the wrong half is load-bearing.

- **MCP `get_workflow_details` omits `credentials` entirely.** Confirmed on
  `sub-add-comment-respond` (`2l8egTLJbyGOPvG-DbtDX`) — the `Add a Comment` node returns no
  `credentials` key.
- **REST `GET /workflows/{id}` RETURNS the binding** — `{"respondIoApi":{"id":"OiS59QkzpKfKSdaa",
  "name":"sorento-api"}}` for that same node. It returns **id + name only, never the secret**.
- Instance-wide: 380 nodes carry a populated `credentials` block over REST.

**Consequence: the acceptance gate is a script, not a human eyeballing the UI.** The reviewer asserts
binding with one jq expression (§5.1). This also directly refutes LESSONS 47's "no `credentials`
block is vacuous evidence" *for the REST channel* — it is vacuous for MCP only. Worth folding back
into LESSONS after sign-off.

> This does not weaken LESSONS 47's actual warning (MCP auto-binds credentials and cannot unset
> them). It only gives us a read channel that can *see* what MCP did.

### ⚠️ CORRECTION 3 — `save-session-vars` is LOUD; the real silent-failure nodes are three others

> **⚠️ THIS SECTION IS ITSELF PARTLY WRONG — amended 2026-07-21 post-T1.**
> The silent-failure list below was assembled by reading each node's **`onError` value alone,
> without checking whether its error output is actually wired.** `continueErrorOutput` is only
> silent when `main[1]` goes nowhere.
>
> Counter-example found in T1: all four `system-upload-attachments` business writers
> (`packing-list-insert`, `technical-attachments-create`, `forms-insert`, `promotion-create`) are
> `continueErrorOutput` **with `main[1]` WIRED** to a fail-status callback
> (e.g. `packing-list-insert → integration-log-update12`). A 401 there does not vanish — it
> reports a *failure* status to the CRM. Still a failure, but **CRM-observable**, and a useful
> post-promote signal rather than a blind spot.
>
> **Consequence: re-derive the silent-failure list per tranche from `connections`, not from
> `onError`.** The same over-generalisation may affect the T2/T3 nodes this section names — treat
> those as unverified until checked the same way. The genuinely silent case remains
> `continueErrorOutput` + unwired `main[1]` (confirmed on the spine's `check-access`,
> `get-access-types`, `get-presigned-url`).

The brief: "`save-session-vars` is a prod PUT, so an auth failure there is silent data loss, not a
visible error." **Wrong, and the correction is worse news, not better.**

Verified `onError` on the spine's **active** version:

| node | `onError` | `retryOnFail` | 401 behaviour |
|---|---|---|---|
| `save-session-vars` | `stopWorkflow` | true | **LOUD** — retries, then hard execution error |
| `get-session-vars` | `stopWorkflow` | true | LOUD |
| `resolve-entity` | `stopWorkflow` | true | LOUD |
| `resolve-entity-clarification` | `stopWorkflow` | true | LOUD |
| `get-cs-members` / `family-fetch` / `ideate-turn-http` | `stopWorkflow` | false | LOUD |
| **`check-access`** | `continueErrorOutput` | true | **SILENT** |
| **`get-access-types`** | `continueErrorOutput` | true | **SILENT** |
| **`get-presigned-url`** | `continueErrorOutput` | true | **SILENT** |

`save-session-vars` (both on the spine and in `respond-send-user`) is `stopWorkflow` + retry — a 401
fails the execution visibly. It is one of the *easiest* nodes to verify, not the hardest.

The genuine hazard is the three `continueErrorOutput` nodes, and it is sharper than the brief
supposed: **their error output (`main[1]`) is not wired to anything.** Confirmed from
`activeVersion.connections` — only `main[0]` has edges (`check-access [out 0] -> If5`,
`get-access-types [out 0] -> Aggregate`, `get-presigned-url [out 0] -> Loop Over Items1`).

So on a 401 the item routes to an unconnected output and the branch **silently dead-ends**. The
execution finishes with status **`success`**. The customer gets no reply. **You cannot find this by
filtering executions for `status:error`** — which is exactly the detection method a reviewer would
reach for. `check-access` failing this way silently drops turns for every contact.

**This governs T5 acceptance (§5.4): per-node runData presence assertions, never execution status.**

Same pattern outside the spine — 11 in-scope nodes swallow errors:
`respond-create-update-contact-system›contact-create-update`;
`system-upload-attachments›packing-list-insert / technical-attachments-create / forms-insert /
promotion-create`; `schedule-sla-policy-checker›get-due-escalations /
conversation-sla-tracking-escalate1`; `respond-change-assignee-system›conversation-assignee-update`
(all `continueErrorOutput`); plus clone `get-presigned-url` / `get-access-types`
(`continueErrorOutput`) and clone **`get-session-vars-http` (`continueRegularOutput` — worst case:
the 401 body flows downstream *as if it were session data*)**.

### ⚠️ The spine draft is a moving target — confirmed, and pinned as of this write

Three `versionId`s were observed during the audit because the user was hand-editing live. Current
state at plan time:

```
versionId       = 76045382-c73d-4a5e-b002-f604925f1fe3   (draft — 10 nodes converted)
activeVersionId = 8b4615fc-b75e-4385-b7eb-3c51b6ad68c7   (active — 10 nodes still literal)
updatedAt       = 2026-07-21T09:48:10.616Z
```

Draft-vs-active differing nodes (LESSONS 23 jq): **exactly the 10 in-scope nodes, nothing else.**
`get-presigned-url, resolve-entity, get-access-types, check-access, save-session-vars,
get-session-vars, resolve-entity-clarification, get-cs-members, family-fetch, ideate-turn-http`.

**No node list for the spine is hardcoded downstream of this section.** T5 mandates a fresh read +
re-diff immediately before any work, and **halts** if the delta is not exactly these 10 (§4.6).

---

## 3. The per-node delta (exact, derived from the user's own converted nodes)

Sourced byte-exact from spine draft `resolve-entity` (converted) vs spine active `resolve-entity`
(unconverted).

**Before (active):**
```jsonc
"parameters": {
  "method": "POST",
  "url": "=https://fe-sorento.foundryx.my/api/v1/system/references/resolve",
  "sendHeaders": true,
  "headerParameters": { "parameters": [ { "name": "x-api-key", "value": "«REAL_KEY»" } ] },
  ...
},
"credentials": null
```

**After (draft):**
```jsonc
"parameters": {
  "method": "POST",
  "url": "=https://fe-sorento.foundryx.my/api/v1/system/references/resolve",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendHeaders": true,
  "headerParameters": { "parameters": [] },
  ...
},
"credentials": { "httpHeaderAuth": { "id": "mNsZWyU82NYV58k2", "name": "crm-n8n-auth" } }
```

### 3.1 The four-part delta — ALL FOUR are required for "done"

| # | change | path |
|---|---|---|
| D1 | set `"genericCredentialType"` | `parameters.authentication` |
| D2 | set `"httpHeaderAuth"` | `parameters.genericAuthType` |
| D3 | bind the credential | `credentials.httpHeaderAuth = {id:"mNsZWyU82NYV58k2", name:"crm-n8n-auth"}` |
| D4 | **remove the `x-api-key` entry** | `parameters.headerParameters.parameters[]` |

**D4 is the one that gets forgotten, and partial conversion is the real failure mode — not total
failure.** The live proof is in the draft right now: `resolve-entity-clarification` has D1+D2+D3
applied *and still carries the literal header* — double-authed. It works (so it passes any smoke
test) while leaving the key in place, defeating the entire point of the change.

**Definition of done, per node — the reviewer checks all four (§5.1). Three of four is a FAIL.**

### 3.2 Conventions to preserve

- **`sendHeaders` stays `true` with an empty `parameters: []`.** Do not set it `false` and do not
  delete `headerParameters`. Matches the user's converted nodes; minimises the diff.
- **Non-`x-api-key` headers are retained.** Only `ideate-turn-http` has one (`Content-Type`). D4
  removes *only* the `x-api-key` entry, leaving `parameters: [{"name":"Content-Type",...}]`.
- **`url`, `method`, `jsonBody`, `options`, `onError`, `retryOnFail`, position, name, id: untouched.**
  Any diff outside D1–D4 is an unauthorised rider (LESSONS 51).

### 3.3 Mechanics — the highest-risk landmine in this migration

> ### ⛔ REWRITTEN 2026-07-21 — the original text here was FACTUALLY WRONG and self-contradictory.
>
> It asserted that REST GET redacts the credential secret and that PUT writes the redacted form
> back, wiping credentials. **Both claims are disproven** (see LESSONS 55, measured in T0). It then
> declared *"REST is READ-ONLY in this programme. No exceptions"* — which **forbids the exact
> action every tranche's promote consists of**, since MCP cannot bind `httpHeaderAuth` at all.
> This block was a blocking condition of the T0 review and was not closed before T1 ran.
>
> **The corrected rules:**
>
> 1. **MCP cannot bind a generic-auth credential.** `setNodeCredential` / `addNode` share a
>    credential-type whitelist omitting `httpHeaderAuth`. **REST PUT is the ONLY programmatic path
>    for D3.** It is therefore mandatory, not forbidden.
> 2. **REST GET does NOT redact credentials** — it returns `{id, name}` per binding.
>    *MCP* `get_workflow_details` is the one that omits them.
> 3. **The real hazard: PUT ALWAYS AUTO-PUBLISHES.** There is no draft-only PUT.
>    ⇒ **Never PUT a body you are not willing to publish, and never PUT a body not derived from a
>    fresh faithful REST GET of that same workflow.**
> 4. **On a live workflow the PUT *is* the promote** — it cannot be staged for review afterwards.
>    Hence the §4.7 sequence: MCP draft edits → review the draft **and the body bytes** → user gate
>    → one unmodified PUT.
> 5. **Always assert collateral credentials after any PUT** (LESSONS 55). Every pre-existing
>    binding on that workflow must survive. Any loss → immediate rollback.

- **Use `setNodeParameter` ×3 per node** (`/authentication`, `/genericAuthType`,
  `/headerParameters/parameters`). **Amended 2026-07-21:** the original text mandated
  `updateNodeParameters {replace:true}`, reasoning that `setNodeParameter` cannot remove an array
  entry. It can — you write the surviving array as the value (`[]` where `x-api-key` was the only
  header). `setNodeParameter` is preferred because `replace:true` re-transmits each node's entire
  `parameters` object — including multi-KB `jsonBody` expressions — to delete one header, which is
  exactly the hand-retyping hazard LESSONS 25 exists to prevent. Verified correct across T0 and T1.
- **`setNodeParameter` path is relative to `parameters`** — `/authentication`, never
  `/parameters/authentication` (LESSONS 32b; silently creates `parameters.parameters.*`).
- **Batch per workflow: ONE `update_workflow` call, ≤100 ops, atomic** (LESSONS 33). T1's 21 nodes
  fit in one call.
- **MCP auto-binds credentials and cannot unset them** (LESSONS 47). Here that works *for* us — D3 is
  a binding, not an unbinding. But it means a mis-bound credential cannot be removed via MCP; a wrong
  binding is repaired by re-binding correctly, or in the UI.

---

## 4. Tranches — ordered lowest blast radius first

Six tranches. **Each is its own full pipeline cycle (plan → coder → tester → reviewer → user-gated
promote) and its own publish.** No tranche starts before the previous is signed off.

Ordering principle: *distance from a real customer*. T0 cannot reach one at all; T5 is the path every
customer message takes.

> **The brief suggested starting at `system-upload-attachments`. Amended: T0 is inserted ahead of
> it.** Two reasons, both load-bearing. (1) It is the only tranche with *zero* prod blast radius, so
> it is where the D1–D4 recipe and the §5.1 verification script get debugged — paying that cost on a
> live workflow is avoidable. (2) The clone and the fork must be converted **anyway** to preserve
> clone↔live parity; if they are left unconverted, T5's promote diff shows 10 spurious node deltas
> and the reviewer loses the ability to assert "the diff is exactly D1–D4." Doing them last would
> mean promoting the spine against a knowingly-divergent clone. T0 is not a rehearsal we invented —
> it is required work that happens to be the safest place to start.

### T0 — clone + fork (13 nodes) · zero prod blast radius

| workflow | id | nodes |
|---|---|---|
| `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `get-presigned-url`, `get-access-types`, `save-session-vars`, `resolve-entity-clarification`, `resolve-entity-http`, `check-access-http`, `get-session-vars-http`, `get-cs-members`, `family-fetch`, `ideate-turn-http` (10) |
| `sub-human-intervention TEST (delta3)` | `vUfFUDjLAuMaeQE6` | `conversation-sla-tracking-create`, `get-round-robin-assignee`, `get-working-days` (3) |

Notes:
- `save-session-vars` on the clone is **orphaned** (0 inbound) and stays orphaned. Convert it anyway
  — parity with live matters more than exercising it. Verified statically only (§5.2).
- The fork's three nodes are inside the guarded human-intervention path; `is_test=true`
  short-circuits before they run. Static verification only.
- Deliverables: the debugged D1–D4 recipe, the §5.1 assertion script, and the UAC evidence that a
  converted node authenticates successfully against prod CRM (a **read**, which is permitted).

### T1 — `system-upload-attachments` `_NbFU3cCoEQwPSbvn14vV` (21 of 22 nodes)

Webhook-triggered, CRM-initiated, non-chatbot, **no respond.io egress at all** — nothing here can
reach a customer. The largest single tranche and the safest prod one.

- 4 business writers: `packing-list-insert`, `technical-attachments-create`, `forms-insert`,
  `promotion-create` (all `continueErrorOutput` + `retryOnFail`).
- 17 status callbacks: `integration-log-update-successful`, `-successful3`, `-successful4`,
  `-successful5`, `integration-log-update1`, `4`, `5`, `6`, `7`, `8`, `10`, `11`, `12`, `14`,
  `integration-log-update-promotion-fail`, `-download-fail`, `-packinglist-ai-fail`.
- **`integration-log-update3` is NOT in T1 — it is converted separately as T1b. See §4.2.**

#### §4.2 Why `integration-log-update3` is split into its own tranche

**User decision 2026-07-21: it IS converted.** It is separated from T1 not to defer it, but because
it is the one node in this programme whose conversion is a deliberate **behaviour change**, and T1's
entire acceptance argument is "zero functional delta." Mixing them would destroy that argument for
all 21 other nodes.

It carries the literal string `test` as its key, so it is **currently failing auth on every
invocation**. Binding `crm-n8n-auth` makes it start succeeding.

It is **not dead code.** Verified from `connections`: wired from `analyze_document_output_parser1`
**output 1** — a reachable error branch. So a document-analysis failure has never reported terminal
status to the CRM, and its `integration_logs` row never reaches a terminal state. Converting this
node **fixes that**, and begins firing a status callback the CRM has not received in production.

T1 converts 21 nodes and the reviewer asserts `integration-log-update3` is **unchanged** by T1.

#### T1b — `system-upload-attachments › integration-log-update3` (1 node) · BEHAVIOUR CHANGE

Same D1–D4 delta as every other node. What differs is the **acceptance argument**, which is the
inverse of T1's:

- **T1 acceptance:** no functional delta. Prove nothing changed.
- **T1b acceptance:** a functional delta is **expected and intended**. Prove the callback now
  reaches the CRM and lands the `integration_logs` row in a terminal state.

Required before promote:
1. **Establish the current failure empirically** — confirm the node returns 401/403 today, so
   "it started working" is measured against a known baseline rather than assumed.
2. **Identify what the CRM does on first receipt of this callback.** The endpoint is
   `POST /api/v1/integration-management/integration-logs/{id}/status`. It has been receiving this
   status from every *other* callback node for as long as those have worked, so the handler is
   exercised — but confirm the specific status value THIS node sends is one the CRM already handles,
   and that a document-analysis-failure log row transitioning to terminal has no unwanted downstream
   effect (notification, retry suppression, dashboard/SLA counting).
3. **Drive the error branch deliberately** — `analyze_document_output_parser1` output 1 — rather than
   waiting for an organic failure. A conversion verified only on the happy path proves nothing here,
   because this node only ever runs on the failure path.
4. Promote T1b **separately from T1**, with its own user gate, so the behaviour change is visible in
   isolation and independently revertible.

If step 2 surfaces an unwanted downstream effect, **halt and report** — the fix then belongs to
whoever owns the upload integration's error handling, and T1b returns to being a ticket.

### T2 — schedule + system (6 nodes)

| workflow | id | nodes |
|---|---|---|
| `system-healthcheck-ping` | `FfmDkEWdt3Bian82` | `healthcheck-callback` |
| `schedule-working-day-detection` | `ss9S83XF7ZtmnaUyFtYZc` | `get-is-working-holiday`, `conversation-sla-tracking-create` |
| `schedule-sla-policy-checker` | `7lFff6i_udSxyUbCMdTuD` | `get-due-escalations`, `conversation-sla-tracking-escalate1` |
| `redis-consume-queue-mongo` | `Srs08P0Ha3Cv--YPx0-Yn` | `insert-message` |

- Self-driving (schedule/webhook) → they verify themselves within minutes of publish, no test harness
  needed. `redis-consume-queue-mongo` polls every **5 s**, so `insert-message` produces a verdict
  almost immediately — publish it during a staffed window and watch.
- `system-healthcheck-ping` is the liveness probe. If its conversion breaks, the CRM watchdog alerts.
  Convert it **first within T2** as a canary.
- ⚠️ `schedule-sla-policy-checker›conversation-sla-tracking-escalate1` **triggers real staff
  escalation**. It runs on its own schedule against real due escalations — we neither trigger nor
  suppress it. Verification is **observational only** (§5.3): read an execution that fired on its own.
  Never fire it manually.
- `insert-message` tolerating unknown keys is **confirmed and settled** — not re-investigated.

### T3 — `respond-*` writers (8 nodes)

| workflow | id | nodes |
|---|---|---|
| `respond-create-update-contact-system` | `gVbpRvD19qrafdqMpORkE` | `contact-create-update` |
| `respond-close-convo` | `-WkzJMQZHmsFQm6A2abLJ` | `conversation-sla-tracking-update`, `conversation-sla-event-tracking-create` |
| `respond-change-assignee-system` | `z2RrHQ6qO9sDbNh2nrn4n` | `conversation-assignee-update`, `conversation-sla-event-tracking-create` |
| `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` | `conversation-sla-tracking-update`, `conversation-sla-event-tracking-create`, `save-session-vars` |

⚠️ **These are respond.io-trigger-driven assignment / SLA / session paths — precisely the flows the
hard safety rule protects.** They fire on real staff activity. Verification is **observational
only**, never provoked (§5.3, §6 UAC-T3).

### T4 — `sub-human-intervention` `rrYXzE61gCNUck_zmXe-G` (3 nodes) · SHARED

`conversation-sla-tracking-create`, `get-round-robin-assignee`, `get-working-days`.

Shared sub — ripples into the live spine's escalation branch **and** (LESSONS 49) calls sendmsg 3×
itself. Isolated into its own tranche because a break here degrades every escalation.

- T0 already converted the fork `vUfFUDjLAuMaeQE6`; T4 applies the identical delta to the live
  published sub. **The fork↔live node diff after T4 must be D1–D4-identical** — a free correctness
  check unavailable to any other tranche.
- ⚠️ **LESSONS 37: publish the sub.** Callers resolve only the *published* version; an unpublished
  sub edit is invisible and the spine keeps invoking the old one.
- ⚠️ **LESSONS 48: do not block-copy anything from the fork.** Apply D1–D4 to the live sub directly.
  The fork carries harness guards that must never reach live.

### T5 — `sorento-consume-main` `9qVyfUxmRQqrpGRMDLRuz` (10 nodes) · LIVE SPINE, LAST

`get-presigned-url`, `resolve-entity`, `get-access-types`, `check-access`, `save-session-vars`,
`get-session-vars`, `resolve-entity-clarification`, `get-cs-members`, `family-fetch`,
`ideate-turn-http`.

#### §4.6 Mandatory pre-flight — halt conditions

Run immediately before any spine work. **Do not proceed on a stale read; the draft moves.**

1. `GET /workflows/9qVyfUxmRQqrpGRMDLRuz` (read-only). Record `versionId` + `activeVersionId`.
2. Draft-vs-active differing-node diff (LESSONS 23 jq, §2).
3. **HALT if** the differing set is not exactly the 10 nodes in §2; **or** any differing node's delta
   is not confined to D1–D4; **or** `activeVersionId` ≠ `8b4615fc-…` (someone published in the
   interim — re-baseline the whole tranche).
4. Confirm the *only* remaining `x-api-key` in the draft is `resolve-entity-clarification`'s.

#### §4.7 How the existing hand-made draft is handled

> **AMENDED 2026-07-21 post-T0 — reviewer-ratified. On a live workflow, a PUT *is* the promote.**
>
> LESSONS 55: there is no draft-only PUT, and REST PUT is the only path that can bind a generic-auth
> credential (MCP's `setNodeCredential` rejects `httpHeaderAuth` outright). So T5 cannot be staged
> for review as a single PUT-shaped change. Required sequence:
>
> 1. Apply **D1, D2, D4** via MCP `setNodeParameter` into the **draft**. No credential binding yet,
>    no publish. A node in this state is non-functional (n8n refuses to run it without a
>    credential) — which is why the draft must not be published mid-sequence.
> 2. **Review the draft**, plus the exact `body.json` that step 3 will send — reviewed **as bytes**.
> 3. Re-run the §4.6 pre-flight diff **immediately before** the PUT.
> 4. **One PUT**, sending the reviewed bytes **unmodified**, which binds D3 and publishes in the same
>    operation.
>
> Steps 2–4 exist because a reviewed artifact and published bytes must be the same object. If the
> body is regenerated between review and PUT, the review is void. Assert collateral credentials
> immediately after (LESSONS 55) — every pre-existing binding on that workflow must survive.

Per the locked decision: **the draft is a proof-of-concept, not the promotion artifact.** It is not
published as-is.

But it is also not discarded — and it cannot be cheaply reset (LESSONS 24: re-publishing the active
`versionId` does **not** reset the draft; draft and active are independent pointers). So:

**The coder takes ownership of the draft.** It re-derives the intended state independently from the
active version using the T0-validated D1–D4 recipe, then applies MCP ops to bring the draft to
*exactly* that state — which, given the pre-flight in §4.6, is the single corrective op:

```
updateNodeParameters { nodeName: "resolve-entity-clarification", replace: true,
                       parameters: { …identical to draft, with the x-api-key entry removed… } }
```

The reviewer then verifies the draft against the independently-derived expectation — it is
**accepted on its merits, not on its provenance.** If §4.6 or §5.1 finds anything the recipe does not
account for, the delta is reverted node-by-node until the draft equals the derived state.

This satisfies the locked decision (pipeline-governed, reviewed, user-gated) without discarding
correct work. **Publishing the draft unexamined is exactly what is prohibited; publishing it after it
has been independently derived, diffed, and reviewed is the deliverable.**

#### §4.8 The rider coupling — why auth goes first

While the spine carries an unpublished auth draft, **any spine publish for any reason ships that
draft as a rider** (LESSONS 24 — `publish_workflow` ships the whole draft, not your hunk). The
state-transition-monitor work (programme item 2) touches the spine. Publishing it while this draft
sits there would drag the auth change live unreviewed and untested, inside someone else's promote.

**That is the entire argument for the fixed programme order** (§9). Until T5 lands, the spine draft
is a loaded rider and no other spine publish is safe.

### 4.9 Backup — every tranche, before any op

For each workflow in the tranche, **before the first `update_workflow`**:

1. `GET /workflows/{id}` → save whole response to
   `n8n-workflows-init/tests/diffs/auth-unification/T{n}-{workflowId}-before.json`. **Read-only GET.**
2. Record `versionId` + `activeVersionId` into the tranche's diff note.
3. Extract and record the pre-change `parameters` + `credentials` of every node to be touched.

The backup exists to answer "what exactly did we change" and to rebuild a node by hand.

⚠️ **SECRET HANDLING — amended 2026-07-21 post-T0.** The original text called these files
secret-free. That is **wrong in one direction that matters**: the `credentials` blocks carry only
`{id, name}` (no secret material), **but until a node is converted its `parameters` still contain
the literal CRM `x-api-key` value**. So a `-before.json` for any unconverted workflow is a live
secret at rest, and this repo has a GitHub remote.

- `n8n-workflows-init/tests/diffs/auth-unification/.gitignore` excludes `*-before.json` /
  `*-after.json`. **Verify it covers your tranche's filenames before writing them.**
- Backups stay on disk for the rollback path (§4.10). **Never commit them.**
- Plan §1 accepts the key at rest inside n8n. It does **not** sanction copying it into git.

**Restore semantics, corrected:** it is not a PUT-back restore artifact — but not for the reason
originally given. Per LESSONS 55, a REST PUT is information-preserving for credentials; the reason
not to PUT a backup is that **PUT auto-publishes**, so restoring by PUT would publish. The primary
rollback is the `publish_workflow` pointer move in §4.10.

### 4.10 Rollback

| situation | action |
|---|---|
| Draft edited, **not yet published** | Re-apply the recorded pre-change `parameters` via `updateNodeParameters {replace:true}`. Nothing shipped; active is untouched. |
| **Published**, break detected | `publish_workflow` the recorded prior `activeVersionId`. Single pointer move, seconds. **This is the primary rollback and it is why §4.9 step 2 is mandatory.** |
| Credential mis-bound | MCP cannot unset a credential (LESSONS 47). Re-bind correctly via `updateNodeParameters`, or unbind in the UI. |
| Rollback leaves a dirty draft | Expected — the draft does not follow the active pointer. Reconcile the draft before the *next* publish (LESSONS 51: stage it as its own semantic-no-op publish). |

Rollback is cheap here precisely because the change is small and uniform. There is no data migration
and no state to unwind — a revert restores the literal key, which still works (§1).

---

## 5. Verification — per node, never per workflow

Rationale: several in-scope nodes sit on branches a smoke test never reaches. A green happy-path run
is **not** evidence for `resolve-entity-clarification` (gated on `validator.has_result=false`),
`get-cs-members` (escalation/member-pick), `get-presigned-url` (media), `ideate-turn-http`, or the 17
`integration-log-update*` callbacks.

**Every one of the 62 nodes gets a verdict from §5.1. §5.2–5.4 add dynamic proof where obtainable.**

### 5.1 STATIC — the four-part gate (mandatory, all 62 nodes, scripted)

> **⚠️ GATE ACCEPTANCE AMENDED 2026-07-21 post-T1 — reviewer-mandated. This supersedes T0 review
> condition 7's "post-PUT `assert-auth.sh` → `RESULT: PASS`".**
>
> `assert-auth.sh` has **no per-tranche exclusion concept**, so a tranche that deliberately excludes
> a node (T1 excludes `integration-log-update3`, which is T1b) can **never** print `PASS`. T1 and
> T1b cannot both be green under the old rule.
>
> **Acceptance is an EXACT EXPECTED-OUTPUT MATCH, not the `RESULT` line.** "Expect FAIL" would
> destroy the signal — a genuine new failure also prints `FAIL` and would be waved through. The
> post-PUT run must match the tranche's pre-declared expected output exactly: which rows fail, which
> node, which sub-checks, how many `HEADER-DRIFT` entries, and the residual set.
>
> **Record the exclusion as DATA, not prose** — in the recorded invocation
> (`assert-auth.sh <wf> <before.json> --exclude integration-log-update3`), never in a diff-note
> paragraph. Prose exclusions do not survive into the next tranche.
>
> **Fix the gate (`--exclude` flag) as its own reviewed micro-change AFTER the T1 PUT and BEFORE
> T1b.** Do not edit the assertion instrument during the tranche it is judging — that destroys its
> independence, and freezing it across the PUT is what makes the before/after runs comparable.
>
> ✅ **DONE 2026-07-22, after T2's PUTs. Three defects fixed, and the fix was proven to FAIL:**
> 1. `--exclude NODE` (repeatable) added; exclusion is recorded in the invocation, as data.
> 2. **Phantom blank exclusion REMOVED** — `printf` with no args yielded `[""]`. Pre-declared
>    expected-output blocks from T2 onward must **no longer** carry the two phantom lines.
> 3. **`2>/dev/null || true` silent-PASS removed** — G5/G5b previously reported
>    `PASS -- no out-of-scope key changed` when the jq had *failed*, i.e. the gate could not tell
>    "nothing changed" from "the check never ran" ([[green-that-cannot-fail]]). Now a jq error prints
>    `!! G5 CHECK DID NOT RUN (jq error) -- this is a FAILURE, not a pass` and exits non-zero, a
>    comparison over **0 nodes** is treated as failure, and the compared-node population is printed
>    alongside every PASS so a vacuous pass is visible.
>
> Negative control run on a malformed `before.json`: the old gate printed `RESULT: PASS`; the fixed
> gate prints the explicit CHECK-DID-NOT-RUN failure and exits 5.

Per §2 CORRECTION 2, this is a script over REST GET. For each converted node assert **all four**:

```
G1  parameters.authentication  == "genericCredentialType"
G2  parameters.genericAuthType == "httpHeaderAuth"
G3  credentials.httpHeaderAuth == {id:"mNsZWyU82NYV58k2", name:"crm-n8n-auth"}
G4  NO entry in parameters.headerParameters.parameters[] with name ~= /^x-api-key$/i
```

Reference assertion (read-only):

```bash
jq -r --arg cid mNsZWyU82NYV58k2 '
  .nodes[] | select(.type=="n8n-nodes-base.httpRequest")
  | select((.parameters.url//"")|test("fe-sorento\\.foundryx\\.my"))
  | {n:.name,
     G1:(.parameters.authentication=="genericCredentialType"),
     G2:(.parameters.genericAuthType=="httpHeaderAuth"),
     G3:((.credentials.httpHeaderAuth.id//"")==$cid),
     G4:(([(.parameters.headerParameters.parameters//[])[]
           |select((.name//""|ascii_downcase)=="x-api-key")]|length)==0)}
  | select(.G1 and .G2 and .G3 and .G4 | not)' WF.json
```

**Empty output = tranche passes G1–G4.** Any row is a partial conversion → REQUEST-CHANGES.

Plus, per tranche:
- **G5 — no rider.** Diff every touched node's full `parameters` before-vs-after; the only differences
  are D1, D2, D4. Any other key changed = unauthorised rider (LESSONS 51).
- **G6 — no collateral.** Untouched nodes are byte-identical, `connections` byte-identical.
- **G7 — instance-wide monotonic progress.** Re-run the §0 census after each tranche; the
  non-archived `x-api-key` count must fall by exactly the tranche's node count and never rise.
  ⚠️ **CORRECTED 2026-07-21 post-T1 promote.** The pre-declared "T1: 53 → 32" was arithmetic error —
  it computed `53 − 21` and **double-counted T0's 13 nodes** (clone 10 + fork 3) as still outstanding
  when T0 had already removed them from the same baseline. True chain:

  ```
  53 (§0.2 baseline)  − 13 (T0, landed)  − 21 (T1, landed)  =  19   ← measured after T1
  ```

  The **binding G7 rule passed** — "must fall by exactly the tranche's node count and never rise":
  22 → 1 within the workflow, 40 → 19 instance-wide, a fall of exactly 21, and none of the 10
  untouched in-scope workflows rose (3,3,2,2,2,2,1,1,1,1 = 18, matching §0.2 exactly). Only the
  pre-declared literal was wrong, and it carries no information about published state — which is why
  this was not a rollback trigger. **Ratification required from the reviewer.**

  **Every later tranche's expected G7 must be derived from 19, not 32.** Remaining after T1:
  19 = 18 (T2–T5 in-scope) + 1 (`integration-log-update3`, held for T1b).

### 5.2 DYNAMIC — per-node proof of a real authenticated call

G1–G4 prove *configuration*. They do **not** prove the credential resolves at runtime. One node per
distinct CRM endpoint family, per tranche, must show a real 2xx.

Method: after publish, `search_executions(workflowId, time window)` → **one** targeted
`get_execution(includeData:true, nodeNames:[…], truncateData:N)` (LESSONS 35 — never
list-with-data). Assert the node's `runData` output is a **business payload**, not absent and not an
error envelope.

**⚠️ Assert on runData presence, never on execution status** — per CORRECTION 3, the
`continueErrorOutput` nodes fail into an unwired output and the execution still reports `success`.

> **⚠️ ACCEPTANCE CLAUSE REWRITTEN 2026-07-21 — negative control, run post-T0.**
> Measured on `get-session-vars-http`: good exec `9456211` vs induced-404 exec `9456578`.
> A real CRM 404 arrived as `main[0] = {"error":{"message":"404 - …","name":"AxiosError",
> "status":404}}` while node `executionStatus == success`, runData `error == null`, and
> `main[1]` empty. **Three of the four obvious clauses are decorative:**
>
> | clause | catches it? |
> |---|---|
> | `executionStatus == success` | ❌ passes |
> | `error == null` | ❌ passes |
> | `main[1]` empty | ❌ passes |
> | `main[0]` carries a domain-specific key | ✅ **the only one that fires** |
>
> **T1–T5 acceptance per node is therefore ONE mandatory clause, in two halves:**
> 1. `main[0][0].json` contains the node's **named domain-specific key** (`resolutions[]`,
>    `allowed`, `respond_io_id`, `presigned_url`, …) — name it per node, do not hand-wave;
> 2. `main[0][0].json.error` is **explicitly ABSENT**.
>
> **GROUP B EXCEPTION — status-callback nodes with no domain key (added post-T1, reviewer-mandated).**
> The 17 `system-upload-attachments` status callbacks return a bare
> `{"status":"success","message":"..."}` — no domain-specific key exists and none may be invented.
> The collision is on the **key**, not the **value**: the handler
> (`sorento_crm_backend/app/api/v1/integrations/logs.py:160`) returns a literal unique to it, and
> unreachable by any error path (the 500 envelope is `"Internal server error"`; n8n wraps non-2xx
> under `json.error`). So assert the **value**, which is functionally domain-specific:
>
> ```
> main[0][0].json.status  == "success"
> main[0][0].json.message == "Integration log updated successfully."
> main[0][0].json.error   ABSENT
> ```
>
> All three, as a conjunction. With it, Group B is acceptable for a production tranche.
>
> ⚠️ **Semantic trap:** that `status:"success"` describes **the HTTP callback**, not the integration
> outcome. A callback *reporting a failed integration* also returns `{"status":"success"}`. Never
> read a green assertion as "the upload succeeded."
>
> ✅ Auth IS genuinely exercised: the router applies
> `dependencies=[Depends(require_module_enabled_with_api_key("base"))]` to the
> `/integration-management/integration-logs` prefix, so a bad key 401s. This also confirms §4.2/§8(a)'s
> premise that `integration-log-update3`'s literal `test` key fails on every invocation.
>
> The other three clauses are recorded as **informational only**. Do not let a tranche pass on them.
>
> Confirms §2 CORRECTION 3's stated worst case empirically: the downstream `get-session-vars`
> Code node consumed the AxiosError envelope **as if it were session data**.
>
> **`test_workflow` pinData cannot be used for this.** Its type is `{nodeName: Array<{json:…}>}`
> — a flat item array mapping to `main[0]` only, with no representation for `main[1]` and none for
> the runData `error` object. The mechanism named in the T0 review is structurally incapable of
> producing the failure it was proposed to detect. Induce failures with real inputs instead.
>
> **OPEN GAP — the `continueErrorOutput` dead-end was NOT induced.** `get-access-types` and
> `get-presigned-url` interpolate the same contact id as `check-access-http`, and any id bad enough
> to fail them makes `check-access-http` return a legitimate 2xx denial (`deny_unknown_contact`),
> so `If5` routes to no-access and neither node is reached. No fixture value fails one and not the
> other. That their runData would fire clauses 1–3 is an **inference from two real errored nodes
> (execs 9445222, 9445575), not a measurement.** Closing it needs a second CRM credential holding
> an invalid key — MCP cannot create credentials (LESSONS 2), so the user must add it in the n8n
> UI. **Recommended as a one-off harness asset before T5.**

Nodes with **no reachable dynamic path**, verified statically only, recorded as such (LESSONS 54 —
record as unverified, never infer from a clean diff):

| node | why unreachable |
|---|---|
| clone `save-session-vars` | orphaned by design (0 inbound) |
| fork `vUfFUDjLAuMaeQE6` ×3 | `is_test=true` short-circuits upstream |
| **`system-upload-attachments › integration-log-update11`** | **ADDED 2026-07-21 post-T1.** **0 inbound connections** — pre-existing, not caused by T1. It can never execute, so it is statically-verifiable only. Convert it for parity (it holds the literal key) but do not expect dynamic evidence. |
| **`ideate-turn-http`** (clone AND its live-spine counterpart in T5) | **ADDED 2026-07-21 post-T0.** `POST /external/ideation/turn` is a prod **WRITE**. `ideate-egress-gate` evaluates `test_run_id && scope !== 'chat-ui'` and routes every test turn to `ideate-turn-mock`; the HTTP node hangs off the FALSE output. Confirmed empirically (case A11: mock executed, HTTP node absent). It **cannot** be dynamically verified without originating a real prod write, which the §0 safety rule forbids. Mitigating factor, recorded by the reviewer: it is `onError: stopWorkflow`, so an auth failure here fails **loudly** — unlike the `continueErrorOutput` nodes above, it cannot silently swallow a 401. This is an accepted, recorded gap: **one live node will convert with static verification only.** |
| `system-upload-attachments` fail-path callbacks (`-promotion-fail`, `-download-fail`, `-packinglist-ai-fail`) | require an induced upload failure |
| `schedule-sla-policy-checker›conversation-sla-tracking-escalate1` | never provoked (§5.3) |

### 5.3 OBSERVATIONAL — the egress-adjacent workflows (T2 escalate, T3, T4)

These paths trigger staff email/WhatsApp ripple. **They are never fired to test them.** Instead:

1. Publish during a staffed window.
2. Wait for the path to fire **on its own**, from genuine staff/customer activity.
3. Read that execution (`search_executions` → targeted `get_execution`) and apply §5.2.
4. If it has not fired within the window, the node stays **unverified** and is recorded as such. It is
   never marked verified by inference, and it is never provoked.

This is the only method compatible with the hard safety rule for `respond-send-user`,
`respond-change-assignee-system`, `respond-close-convo`, `sub-human-intervention`, and
`conversation-sla-tracking-escalate1`. It trades speed for the guarantee that **the harness never
originates a staff-visible event.**

### 5.3-T3 T3 observational verification design → `plans/T3-verification-design.md`

The full per-node T3 design (8 nodes, 4 workflows) lives in **`plans/T3-verification-design.md`**.
Load-bearing conclusions, folded back here so the plan is self-consistent:

- **Node list re-verified 2026-07-22** against live (REST GET): all 8 present, `active:true`, still
  literal-keyed. Node counts: `respond-create-update-contact-system` 7, `respond-close-convo` 9,
  `respond-change-assignee-system` 3, `respond-send-user` 12.
- **Silent/loud re-derived from `connections`** (per §2 CORRECTION 3 amended): only **two** T3 nodes
  are SILENT — `contact-create-update` and `conversation-assignee-update` (both `continueErrorOutput`
  with `main[1]` **unwired**), and each is the *only/first* writer in its workflow ⇒ **its workflow
  has no `status:error` backstop**. The other six are LOUD (`onError` absent ⇒ `stopWorkflow`).
  **`save-session-vars` is LOUD** (`stopWorkflow` + `retryOnFail:true`) — confirms §5.4.
- **Two auth families** (validated by different CRM deps): **A** external `get_external_api_user`
  (nodes `contact-create-update`, `conversation-assignee-update`, `save-session-vars`); **B** SLA
  router `require_module_enabled_with_api_key("sla")` + `get_current_user_or_api_key` (the four SLA
  writer nodes).
- **CRUX: `crm-n8n-auth` resolution is already PROVEN by measured 2xx** — Family A by **T0**
  `get-session-vars-http` (exec 9456211) + **T2** `insert-message`; Family B by **T2**
  `get-due-escalations` (**exec 9471108**, verified). So T3 auth acceptance is the deduction
  *(P1 measured credential resolution on the identical dependency) + (P2 scripted §5.1 G1–G4/G5 per
  node)* ⇒ node authenticates — **not** the forbidden clean-diff inference (LESSONS 54), and needing
  **no new provocation**. Observation (§5.3) is corroboration + the rollback watch, not the gate.
- **No safe way to force the trigger** (manual exec = real CRM writes + real send/assignment ripple —
  forbidden). One optional **read-only** probe bound to `crm-n8n-auth` re-proves each family on demand:
  Family B `GET /sla-management/conversation-sla-tracking/dashboard`; Family A the existing T0
  `get-session-vars-http` GET.
- **PUT order** (ascending blast radius): (1) `respond-create-update-contact-system` (lowest),
  (2) `respond-close-convo` (delivers Family-B organic 2xx; clears the `binaryMode` settings strip),
  (3) `respond-send-user` (highest-consequence but LOUD + fastest verifier, Family-A organic 2xx),
  (4) `respond-change-assignee-system` **LAST** (most staff-visible; sharpest silent-failure workflow).
- **Conversion-risk flags:** `respond-close-convo` `settings.binaryMode:"separate"` must be stripped
  before PUT (LESSONS-55 400-trap); NO second headers on any T3 node (D4 = clean `[]`); collateral
  `respondIoApi` (all 4) + `postgres/sorento-crm-db` (close-convo, send-user) must survive each PUT;
  mandatory MCP `versionId==activeVersionId` draft check before every PUT (REST GET can't confirm it).

The per-node acceptance table (trigger · clause · max window · rollback trigger), CRM response keys
with source line refs, and the full risk analysis are in the standalone doc.

### 5.4 The `save-session-vars` question, answered

The brief asked how a silent auth failure on `save-session-vars` would be caught. Per CORRECTION 3 it
is **not silent** — `onError=stopWorkflow`, `retryOnFail=true`, on both the spine and
`respond-send-user`. A 401 retries, then hard-fails the execution.

Detection, in order:
1. **Direct (T5 §5.2):** read a post-publish execution that reached `save-session-vars`; assert
   runData shows a 2xx PUT. This is a genuine prod write, but it is a write the spine performs on
   every turn regardless — we are observing normal operation, not originating one.
2. **Backstop:** `search_executions(workflowId:9qVyfUxmRQqrpGRMDLRuz, status:["error"], window)`.
   Any new error is a T5 rollback trigger. Valid **only** for the `stopWorkflow` nodes.
3. **Corroboration:** `check-access` / `get-access-types` / `get-presigned-url` need §5.2's runData
   check because step 2 is blind to them.

Cross-check from the CRM side: `respond_contacts.session_vars` continues to advance for active
conversations after the publish.

---

## 6. §UAC cases

Format per `tests/UAC.md`. **Scope `deterministic`** — every case injects
`message.mock_reformulator_output`, so 0 parser tokens and 0 get-results tokens across the suite
(plan §8 tier routing; LESSONS 28).

### §0 binding — applies to EVERY case below

Each case passes only if the shared safety checklist **S1–S7** in `tests/UAC.md` §0 holds, asserted
from `get_execution(includeData:true)` + `test:egress:{test_run_id}`. **A §0 failure is a hard fail
regardless of functional correctness.** Note S7 is the *replaced* two-part gate (S7a TEST-sink delta
+ S7b prod-sink attribution) — the withdrawn `LLEN` equality form is not acceptable evidence.

Only T0 runs on the harness. **T1–T5 have no UAC cases by construction** — they target live
workflows the harness cannot drive without prod egress. Their acceptance is §5.1 (static, all nodes)
+ §5.2/§5.3 (dynamic/observational). Stated explicitly so nobody reads the absence of UAC as an
oversight. **T3's per-node observational acceptance table** (the equivalent of a UAC block for an
observation-only tranche: trigger event · acceptance clause · max unverified window · rollback
trigger, all 8 nodes) is **`plans/T3-verification-design.md` §3**, summarised in §5.3-T3.

---

**§AUTH-1 — clone happy path survives conversion (T0)**
- **Trigger:** contact `437264483` (full access), `mode=uac`, `scope=deterministic`, injected
  `mock_reformulator_output` for a product-stock query.
- **Expect-branch:** happy path → `resolve-entity-http` → `check-access-http` → get-rag →
  get-results → shape → sendmsg guard.
- **Expect-output (structural):** `resolve-entity-http` and `check-access-http` runData each carry a
  2xx CRM payload of the **same shape as the pre-conversion baseline** (`matches[]` /
  access-decision object). Reply text is **byte-identical** to the pre-conversion run for the same
  fixture — this is the zero-functional-delta assertion.
- **Binds:** S1–S7. Additionally G1–G4 on both nodes.

**§AUTH-2 — no-access branch (T0)**
- **Trigger:** contact `457216562` (no access), `mode=uac`, injected parser output.
- **Expect-branch:** `check-access-http` → no-access refusal.
- **Expect-output:** `check-access-http` returns a 2xx *denial* (not an auth error). **Critical
  distinction:** a 401 on this node routes to its unwired error output and the turn dead-ends
  silently (CORRECTION 3) — assert the denial payload is present, never merely that no error
  occurred.
- **Binds:** S1–S7.

**§AUTH-3 — `get-session-vars-http` does not leak an auth error as session data (T0)**
- **Trigger:** contact `437264483`, **`mode=uac` (default)**.
  ⚠️ **CORRECTED 2026-07-21 post-T0 — the original text said `mode=regress-capture`, which does not
  work.** `session-get-gate` routes `['regress-capture','regress-replay','chat-stateful']` to
  `pg-get-session` (the `n8n_test` Postgres path), so that mode is precisely the one that **never
  executes `get-session-vars-http`** — the case would have passed while testing nothing. Only
  default/`uac` mode takes the real prod CRM GET, which is the call whose auth is under test. A
  prod session **read** is permitted by the safety rule.
- **Expect-branch:** normal session read.
- **Expect-output:** runData is a session-variables object. **This node is
  `onError=continueRegularOutput`** — on 401 the error body flows downstream *as session data*.
  Assert the payload has the session shape and no `message`/`statusCode`/`error` keys.
- **Binds:** S1–S7. Highest-value case in the suite: the one failure mode that is both silent **and**
  data-corrupting.

**§AUTH-4 — clarification path (T0)**
- **Trigger:** contact `437264483`, injected parser output producing `validator.has_result=false`.
- **Expect-branch:** clarification → `resolve-entity-clarification`.
- **Expect-output:** node executes with a 2xx resolve payload. **This is the node that is
  double-authed on the spine draft (§3.1)** — the clone's copy must show G4 clean, proving the recipe
  removes the header rather than merely adding the credential.
- **Binds:** S1–S7.

**§AUTH-5 — escalation / `get-cs-members` (T0)**
- **Trigger:** contact `437264483`, injected parser output routing to CS escalation with a member
  offer.
- **Expect-branch:** escalation → `get-cs-members` → member roster rendered → human-intervention fork
  `vUfFUDjLAuMaeQE6` **short-circuits on `is_test=true`**.
- **Expect-output:** `get-cs-members` returns a 2xx roster (a prod CRM **read** — permitted). The
  fork's three converted nodes **must NOT execute**; assert absent from runData.
- **Binds:** S1–S7, **S2 especially** — zero assignment/SLA/PIC-comment writes. This case proves the
  conversion did not disturb the guard that keeps escalation testing safe.

**§AUTH-6 — static containment re-assertion after T0 (T0)**
- **Trigger:** none (static assertion over the clone + fork JSON, post-change).
- **Expect:** clone containment **unchanged** by the conversion — 5 orphaned + 1 sinked (UAC.md §0 S3
  amendment); `Call 'sub-respond-save-message-redis'2`.`workflowId.value` still `tWm5DYLxfypmVC1T`;
  that fork's `Redis.list` still the literal `sorento-respond-message-TEST`; clone `save-session-vars`
  still 0 inbound; all 8 shared-sub calls still pass `is_test=true`.
- **Rationale:** D1–D4 touch only HTTP-auth params and must not perturb containment. This case exists
  so that "we only changed auth" is **asserted, not assumed**.
- **Binds:** S1–S7 vacuously; this case *is* the containment proof for the tranche.

---

## 7. Acceptance — done means

Per tranche:
1. §4.9 backup captured; prior `activeVersionId` recorded.
2. §5.1 G1–G7 all green over the tranche's nodes.
3. §5.2 dynamic proof for ≥1 node per CRM endpoint family; unreachable nodes explicitly listed as
   statically-verified-only.
4. §5.3 observational verdict, or an explicit **unverified** record, for every egress-adjacent node.
5. Reviewer APPROVE with a promote checklist.
6. **User-gated promote.** Publish. Post-publish re-run of §5.1 against the *active* version.
7. §5.1 G7 census delta matches expectation.

Programme-complete when the non-archived `x-api-key` census reads **1** — `integration-log-update3`,
deliberately retained (§4.2, §8a) — and every remaining occurrence is archived-only.

---

## 8. Incidental findings — scoped OUT, recorded, each needs its own ticket

### (a) `system-upload-attachments › integration-log-update3` authenticates with the literal `test`

- `POST «CRM»/api/v1/integration-management/integration-logs/{{…integration_log_id}}/status`,
  header `x-api-key: test`. **Enabled.**
- **Not dead code** — wired from `analyze_document_output_parser1` **output 1** (a reachable error
  branch). Corrects the brief's "either dead code or a silently-failing status callback": it is
  reachable, therefore it is the second.
- So a document-analysis failure has been failing to report its status to the CRM for as long as this
  has been in place. The CRM's `integration_logs` row for those failures never reaches a terminal
  state.
- ~~Do not fix inside this programme~~ **SUPERSEDED by user decision 2026-07-21: it IS in scope, as
  tranche T1b (§4.2).** It is held separate from T1 because its conversion is an intended behaviour
  change, and folding it in would invalidate T1's zero-functional-delta acceptance argument for the
  other 21 nodes. T1b carries its own baseline-then-verify procedure and its own promote gate.

### (b) 5 MCP client nodes call an internal host over plain HTTP with no auth at all

- `http://72.62.195.20:8765/mcp` — **plain HTTP**, `authentication: "none"`, no credential, no header.
- Nodes: `sub-get-results` (`Fss5aAaXthJSWpZCgKiKR`) › `MCP Client`, `MCP Client1`;
  `sub-get-results TEST` (`rysSPgUssLDf6xJc`) › `MCP Client`, `MCP Client1`;
  `sorento-consume-main copy` (`oo7LnsedPyKB9bWM`, **archived**) › `MCP Client`.
- Credential **`crm-mcp-auth` (`nmfxIzFEMPYEvAZn`, `httpHeaderAuth`)** exists and is **bound by zero
  nodes** instance-wide (verified over REST, which does expose bindings — §2 CORRECTION 2). It was
  created for this and never wired.
- `sub-get-results` is on the live spine's read path, so this is unauthenticated plaintext on a
  production data-read route. Different failure mode from the `x-api-key` work (absent auth, not
  misplaced auth), different endpoint, different credential → **separate ticket, not a late tranche
  here.**
- Not investigated further: whether `72.62.195.20:8765` is network-restricted. **Do not probe it.**

---

## 9. Programme order (locked)

1. **This plan — CRM auth unification** ← first
2. State-transition monitor / incoming-binding —
   `plans/state-transition-monitor-n8n-plan.md` + `-crm-plan.md`
3. dym entity fix — `plans/dym-single-use-fix.md`

**The coupling is not stylistic.** Items 2 and 3 touch the spine. While the spine carries an
unpublished auth draft, any spine publish drags that draft live as a rider (§4.8, LESSONS 24). Auth
must land first so that items 2 and 3 publish from a clean draft.

**If item 2 or 3 must move first for a business reason, the spine draft has to be reconciled anyway**
— either by completing T5 or by explicitly reverting the draft's 10 nodes to match active. There is
no third option in which the draft is simply ignored.

---

## 10. Handoff to the coder

- **Read `CLAUDE.md` + `docs/LESSONS.md` first.**
- **Start at T0.** Do not touch a live workflow until T0 is reviewer-approved.
- **REST is read-only. Every write is MCP `update_workflow`.** (§3.3 — the PUT landmine is the top
  risk in this programme.)
- Node lists for T0–T4 in §4 are verified as of 2026-07-21 and may be used directly. **The spine list
  may not** — §4.6 pre-flight is mandatory and has halt conditions.
- Per-tranche diff note → `n8n-workflows-init/tests/diffs/auth-unification/T{n}-*.md`, in the repo's
  established diff format.
- **Never publish. Promotion is user-gated, per tranche.**
