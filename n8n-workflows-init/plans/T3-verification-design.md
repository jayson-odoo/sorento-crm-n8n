# T3 — observational verification design (`respond-*` writers)

**Companion to** `plans/crm-auth-unification-plan.md` §4 (T3), §5.2, §5.3. Cross-referenced from the
plan's **§5.3-T3** anchor. Scope tag inherited: **`deterministic`** (auth-plumbing only, zero
functional delta). **DOCS ONLY** — nothing here is executed; the coder stages T3, the tester/observer
verifies against it.

T3 targets **8 nodes across 4 live, respond.io-trigger-driven workflows** — the assignment / SLA /
session-write paths the hard safety rule protects. Unlike T0–T2 the harness **cannot drive the
input** (firing the trigger needs a real staff/customer event; a manual `execute_workflow` would run
real respond.io writes + a real `sorento-sub-respond-sendmsg-respond` send — forbidden). Verification
is **observational only**. This doc makes that concrete.

---

## 0. Node list — RE-VERIFIED against live (REST GET, 2026-07-22)

All 8 confirmed present, all `active:true`, all CRM nodes still carry a hardcoded `x-api-key` and no
credential. Counts match the plan's T3 row.

| # | node | workflow | id | endpoint (method) | auth family |
|---|---|---|---|---|---|
| 1 | `contact-create-update` | `respond-create-update-contact-system` | `gVbpRvD19qrafdqMpORkE` (7 nodes) | `POST /api/v1/external/respond-contacts` | **A** |
| 2 | `conversation-sla-tracking-update` | `respond-close-convo` | `-WkzJMQZHmsFQm6A2abLJ` (9 nodes) | `PUT /api/v1/sla-management/conversation-sla-tracking/{id}` | **B** |
| 3 | `conversation-sla-event-tracking-create` | `respond-close-convo` | `-WkzJMQZHmsFQm6A2abLJ` | `POST /api/v1/sla-management/conversation-sla-tracking/event-logs` | **B** |
| 4 | `conversation-assignee-update` | `respond-change-assignee-system` | `z2RrHQ6qO9sDbNh2nrn4n` (3 nodes) | `POST /api/v1/external/conversation-assignee` | **A** |
| 5 | `conversation-sla-event-tracking-create` | `respond-change-assignee-system` | `z2RrHQ6qO9sDbNh2nrn4n` | `POST /api/v1/sla-management/conversation-sla-tracking/event-logs` | **B** |
| 6 | `conversation-sla-tracking-update` | `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` (12 nodes) | `PUT /api/v1/sla-management/conversation-sla-tracking/{id}` | **B** |
| 7 | `conversation-sla-event-tracking-create` | `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` | `POST /api/v1/sla-management/conversation-sla-tracking/event-logs` | **B** |
| 8 | `save-session-vars` | `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` | `PUT /api/v1/external/conversation-variables/{contact.id}` | **A** |

**Two auth families, and the distinction is load-bearing** (they are validated by different CRM
dependencies, so a credential accepted by one is not automatically accepted by the other):

- **Family A — external router.** Dependency `Depends(get_external_api_user)` on each handler
  (`app/api/v1/external/respond_contacts.py`, `conversation_assignee.py`,
  `conversation_variables.py`). Bad key → 401.
- **Family B — SLA router.** Mounted `prefix="/sla-management"` with
  `dependencies=[Depends(require_module_enabled_with_api_key("sla"))]`
  (`app/api/v1/__init__.py:105-109`), plus per-handler `Depends(get_current_user_or_api_key)`
  (`app/api/v1/sla/sla_tracking.py:1230, 1560`). Bad key OR "sla" module disabled → 401.

---

## 1. Silent vs LOUD — re-derived from `connections` (NOT `onError`)

Rule (plan §2 CORRECTION 3, amended): a node is **SILENT** iff `onError == continueErrorOutput` **and
its error output `main[1]` is unwired** — a 401 then routes to a dead output and the execution
finishes `status:success`. Otherwise a 401 hard-fails the execution (**LOUD**).

Verified from each workflow's `connections`:

| # | node | `onError` (live) | `main[1]` wired? | verdict | workflow-level failure mode on 401 |
|---|---|---|---|---|---|
| 1 | `contact-create-update` | `continueErrorOutput` | **NO** (only `[out 0] → findcontact`) | 🔇 **SILENT** | **fully silent** — it is the only business step; downstream skipped, exec `success` |
| 2 | `conversation-sla-tracking-update` (close) | *(absent ⇒ stopWorkflow)* | n/a | 🔊 **LOUD** | exec `error` |
| 3 | `conversation-sla-event-tracking-create` (close) | *(absent ⇒ stopWorkflow)* | n/a | 🔊 **LOUD** | exec `error` |
| 4 | `conversation-assignee-update` | `continueErrorOutput` | **NO** (only `[out 0] → sla-event-create`) | 🔇 **SILENT** | **fully silent** — first node; on 401 the downstream loud SLA-event node never runs, so the whole exec is `success` |
| 5 | `conversation-sla-event-tracking-create` (assignee) | *(absent ⇒ stopWorkflow)* | n/a | 🔊 **LOUD** *(but unreachable if #4 401s)* | see caveat below |
| 6 | `conversation-sla-tracking-update` (send-user) | *(absent ⇒ stopWorkflow)* | n/a | 🔊 **LOUD** | exec `error` |
| 7 | `conversation-sla-event-tracking-create` (send-user) | *(absent ⇒ stopWorkflow)* | n/a | 🔊 **LOUD** | exec `error` |
| 8 | `save-session-vars` (send-user) | *(absent ⇒ stopWorkflow)*, `retryOnFail:true` | n/a | 🔊 **LOUD** | retries, then exec `error` |

> **`onError` absent == n8n default == `stopWorkflow` == LOUD.** REST GET shows the key simply omitted
> on nodes 2,3,6,7,8 (the jq rendered it `"default"`); functionally identical to the plan §5.4 claim
> that `save-session-vars` is `stopWorkflow`. **Confirmed: `save-session-vars` is LOUD**
> (`onError` absent + `retryOnFail:true`), and **so are all four SLA writer nodes**.

**Two SILENT nodes total: `contact-create-update` and `conversation-assignee-update`** — both Family
A. Crucially, each is the *first/only* CRM writer in its workflow, so **its workflow has no
`status:error` backstop at all**: on a 401 the entire execution reports `success`. `search_executions
status:["error"]` is **blind** to both. This is exactly the CORRECTION-3 trap, and it is why their
safety cannot rest on an error-watch (see §3).

> **Sharpest point — `respond-change-assignee-system` can go silent even though node #5 is LOUD.**
> #5 (`sla-event-create`, loud) sits *downstream* of #4 (`assignee-update`, silent). If #4 401s,
> #5 never executes → no error is ever raised → assignments silently stop happening. The loud node
> does not rescue the workflow. Treat change-assignee as a silent-failure workflow.

---

## 2. THE CRUX — credential resolution is already PROVEN; no T3 provocation is needed

The T3 residual risk is **not** "does `crm-n8n-auth` resolve at runtime against these endpoints." That
question is already answered by **measured** 2xx executions from earlier tranches, because the
credential is one shared object (`mNsZWyU82NYV58k2`) and the two auth dependencies are shared across
tranches:

| family | dependency | proving execution (measured, not inferred) | source |
|---|---|---|---|
| **A** (external / `get_external_api_user`) | same dep as nodes 1,4,8 | **T0** `get-session-vars-http` 2xx on `GET /external/conversation-variables` (exec 9456211); **T2** `insert-message` 2xx on `POST /external/chat-history/messages` | plan §5.2, T2 review |
| **B** (SLA / `require_module_enabled_with_api_key("sla")` + `get_current_user_or_api_key`) | same dep+module-gate as nodes 2,3,5,6,7 | **T2** `get-due-escalations` ✅ VERIFIED — exec **9471108**, `main[0][0].json = {"status":"success","count":0,"items":[]}`, `error` absent | T2 review line 70 |

**So `crm-n8n-auth`'s secret is proven accepted by BOTH dependencies before T3 begins.** T2's
`get-due-escalations` is the load-bearing proof that the credential's key is also *enabled for the
"sla" module* — the one thing external-router proofs could not cover.

**The sound T3 acceptance argument, per node, is therefore a deduction — not the forbidden
"clean-static-diff ⇒ runtime pass" (LESSONS 54):**

```
(P1) the shared credential resolves 2xx through dependency D        [MEASURED — table above]
(P2) node N statically binds that credential, sends no residual     [SCRIPTED — §5.1 gate G1–G4]
     x-api-key header, and its url/method/body are byte-unchanged    [SCRIPTED — G5 no-rider]
⟹   node N authenticates when it runs.
```

P1 is a measurement on the identical dependency; only P2 is per-node, and P2 is fully deterministic
via the §5.1 REST-GET gate. **This is why no T3 node needs a new risky execution to be considered
auth-verified.** The observational proof in §3 is *corroboration* + the *rollback watch*, not the gate.

---

## 3. Per-node observation plan, acceptance clause, window, rollback

CRM success-response keys read from source (READ ONLY) — name the domain key, never hand-wave:

| node | endpoint · handler | success body (key source) | domain key to assert |
|---|---|---|---|
| `contact-create-update` | `POST /external/respond-contacts` · `respond_contacts.py` → `RespondContactSyncResponse` (`schemas/external/contacts.py:21`) | `{id, phone_number, name, first_name, last_name, respond_io_id, action}` | **`action`** ∈ {`"created"`,`"updated"`} |
| `conversation-assignee-update` | `POST /external/conversation-assignee` · `conversation_assignee.py` → `set_assignee_for_tracking` (`services/sla_service.py:2938`) | `{updated:true, message, tracking_id, contact_phone, current_tier, routing, assigned_to, assigned_to_id, assignee_respond_user_id, …}` | **`updated`==true** AND **`tracking_id`** present |
| `conversation-sla-tracking-update` (close, send-user) | `PUT /sla-management/…/{id}` · `sla_tracking.py:1224` → `ConversationSLATrackingResponse` (`schemas/sla.py:427`, ~60 keys, **no `status` envelope**) | bare tracking record | **`current_tier`** present (or `id`+`updated_at`) |
| `conversation-sla-event-tracking-create` (×3) | `POST /sla-management/…/event-logs` · `sla_tracking.py:1556`, **201** → `ConversationSLAEventLogResponse` (`schemas/sla.py:333`) | `{id, sla_tracking_id, event_type, event_at, …}` | **`event_type`** present AND **`sla_tracking_id`** present |
| `save-session-vars` | `PUT /external/conversation-variables/{id}` · `conversation_variables.py:71` → `ConversationStateResponse` (`schemas/external/conversation_variables.py:7`) | `{respond_io_id, session_vars}` | **`session_vars`** is an object AND **`respond_io_id`** present |

**Universal acceptance clause (plan §5.2, rewritten form)** — assert on **runData presence, never on
execution status**:

```
main[0][0].json.<domain key above>   PRESENT   (presence, not truthiness — beware falsy 0/false/"")
AND main[0][0].json.error            ABSENT
```

> **Falsy / ambiguity traps, per T2 precedent:**
> - `current_tier` can be `1` (falsy-ish); assert *presence*, not value.
> - `conversation-assignee-update`: a legitimate **404** ("no SLA tracking for this contact") arrives
>   as `json.error` on `main[1]` and is **structurally indistinguishable from a 401** at the workflow
>   level (both dead-end the silent node). ⇒ **Only a positive `updated:true` run counts as proof;
>   an absent run is inconclusive, never a pass.**

Method (LESSONS 35): `search_executions(workflowId, window)` → **one** targeted
`get_execution(includeData:true, nodeNames:[…], truncateData:N)`. Never list-with-data.

**Observed live cadence (REST executions, 4 h staffed window 2026-07-21 03:54–08:00), and which
nodes actually fire** (confirmed from real runData):

| workflow | ~cadence | nodes seen firing organically |
|---|---|---|
| `respond-send-user` | ~4/h | `save-session-vars` **every fire**; SLA nodes only when `Select rows` returns a tracking row (not every fire) |
| `respond-change-assignee-system` | ~3/h | `conversation-assignee-update` **and** `sla-event-create` both fire |
| `respond-close-convo` | ~1.25/h | both `sla-tracking-update` **and** `sla-event-create` fire |
| `respond-create-update-contact-system` | **~0** (rare / pruned) | none observed in window |

### Per-node verdict table

| # | node · workflow | silent/loud | trigger event that proves it | acceptance clause | max unverified window | rollback trigger |
|---|---|---|---|---|---|---|
| 1 | `contact-create-update` · create-contact | 🔇 SILENT | organic respond.io **contact create/update** event → `POST /external/respond-contacts` (rare) | `action` ∈{created,updated} ∧ `error` absent | **auth NOT gated** on it (Family-A inherited §2 + G1–G4). Positive corroboration: **best-effort, 5 staffed days**, no rollback pressure | CRM-side only: `respond_contacts` upsert stops advancing for genuinely-new contacts. Or optional safe Family-A read-probe (§4) 401s |
| 2 | `sla-tracking-update` · close-convo | 🔊 LOUD | organic **conversation close** (If out 0 path) | `current_tier` present ∧ `error` absent | **1 staffed working day** for positive proof; **negative window ≈0** (self-announcing) | any new `status:error` exec on `-WkzJMQZ…` post-PUT |
| 3 | `sla-event-create` · close-convo | 🔊 LOUD | same close event (runs after #2) | `event_type` ∧ `sla_tracking_id` present ∧ `error` absent | 1 staffed day / neg ≈0 | new `status:error` on `-WkzJMQZ…` |
| 4 | `conversation-assignee-update` · change-assignee | 🔇 SILENT | organic **staff (re)assignment** → `POST /external/conversation-assignee` (~3/h) | `updated`==true ∧ `tracking_id` present ∧ `error` absent | **1 staffed working day** — positive proof arrives fast at 3/h. Auth also Family-A inherited (§2) | expiry with **no** confirming `updated:true` 2xx AND no CRM-side assignee movement ⇒ rollback. (No `status:error` backstop — silent workflow) |
| 5 | `sla-event-create` · change-assignee | 🔊 LOUD (unreachable if #4 401s) | same reassignment event | `event_type` ∧ `sla_tracking_id` present ∧ `error` absent | 1 staffed day / neg ≈0 **only while #4 succeeds** | new `status:error` on `z2RrHQ6…`; note a silent #4 masks #5 |
| 6 | `sla-tracking-update` · send-user | 🔊 LOUD | organic **bot reply** where `Select rows` returns a tracking row | `current_tier` present ∧ `error` absent | 1 staffed day; if the SLA path doesn't fire, Family-B is already proven by #2/#5 + T2 → covered by §2 | new `status:error` on `eG3AA…` |
| 7 | `sla-event-create` · send-user | 🔊 LOUD | same reply (after #6) | `event_type` ∧ `sla_tracking_id` present ∧ `error` absent | 1 staffed day / neg ≈0 | new `status:error` on `eG3AA…` |
| 8 | `save-session-vars` · send-user | 🔊 LOUD | **every** bot reply (~4/h, unconditional from the respond trigger) | `session_vars` object ∧ `respond_io_id` present ∧ `error` absent | **< 1 staffed hour** (fires every reply) / neg ≈0 | new `status:error` on `eG3AA…` (stopWorkflow+retry) |

**PAST executions cannot verify auth.** A pre-conversion execution ran on the *literal* key; it proves
endpoint reachability and the runData shape (use it as the acceptance-clause template — that is how
the domain keys above were named) but says **nothing** about whether `crm-n8n-auth` resolves. **Only a
POST-PUT execution counts** (LESSONS 54). This is asserted per node; no T3 node is marked verified from
a pre-conversion run or a clean static diff alone — the runtime premise P1 in §2 comes from measured
*post-conversion* 2xx executions in T0/T2 on the identical dependency.

---

## 4. Is there ANY safe way to force traffic? — investigated, answered honestly

- **Firing the respond.io trigger is impossible without a real event**, and a manual
  `execute_workflow` on any of these 4 runs real CRM writes AND (close-convo, and any path reaching
  `Update a Contact`/`Assign or unassign`) a real `sorento-sub-respond-sendmsg-respond` send +
  assignment ripple. **Forbidden. Do not.** No provocation is invented here.

- **No provocation is needed** for credential resolution — §2: Family A proven (T0/T2), Family B proven
  (T2 exec 9471108). Combined with the deterministic §5.1 gate, every node's auth is decided without
  new traffic.

- **One genuinely-safe optional positive probe exists, and it is a READ** — recommended as a pre-T3
  harness asset, run as an n8n node **bound to `crm-n8n-auth`** (credential referenced, secret never
  extracted — do NOT curl with a raw key, LESSONS 14 / security rule):
  - **Family B:** `GET /api/v1/sla-management/conversation-sla-tracking/dashboard` (or `GET /…/`) —
    both accept api-key via `get_current_user_or_api_key` (`sla_tracking.py:243,652`). READ-ONLY, no
    staff ripple. A 2xx re-proves Family-B credential resolution on demand.
  - **Family A:** the existing T0 `get-session-vars-http` (`GET /external/conversation-variables/{id}`)
    already is this probe; it can be re-run any time, zero egress.
  These are corroboration, not gates — the LOUD nodes self-announce a break, and the SILENT nodes'
  auth is Family-A-inherited.

- **Genuinely unverifiable-by-positive-proof within a bounded window:** `contact-create-update`
  (silent + ~0 traffic). Recorded per LESSONS 54 as **statically-verified (G1–G4) + Family-A
  credential-inherited**, with organic positive proof **best-effort / not a gate**. Its auth is not
  left to chance (§2 deduction holds); only its node-specific *dynamic corroboration* is open. **Do
  not provoke it.**

---

## 5. PUT ordering + blast radius (4 workflows = 4 PUTs)

Each PUT is the **promote** (auto-publishes; LESSONS 55) of a **live, active, trigger-subscribed**
workflow — a broken publish blackholes the respond.io trigger until rolled back. Order by ascending
blast radius (the programme's "distance from a real customer" principle), while front-loading the
tranche whose organic proof corroborates later ones:

1. **`respond-create-update-contact-system`** — **lowest consequence** (contact-metadata upsert, no
   staff ripple, no send, no SLA). Its one node is SILENT but Family-A-inherited (§2), so its rare
   traffic imposes no positive-proof gate. Safest place to re-prove the D1–D4 recipe on a live
   respond-trigger workflow.
2. **`respond-close-convo`** — 2 LOUD Family-B nodes, moderate consequence, ~1.25/h. Delivers the
   **T3-local Family-B organic 2xx** early and clears the `binaryMode` settings landmine (§6) on a
   moderate workflow. Loud ⇒ self-announcing.
3. **`respond-send-user`** — **highest frequency + highest consequence-if-broken** (`save-session-vars`
   writes session state on **every** reply; the hint's premise is correct — this is the
   highest-consequence workflow). BUT all 3 nodes are LOUD and it verifies fastest (< 1 h via
   `save-session-vars`). Landing it here gives a Family-A organic 2xx and a self-announcing backstop
   before the most staff-visible one.
4. **`respond-change-assignee-system`** — **LAST.** Most **staff-visible** path (assignment) and the
   sharpest silent-failure workflow (§1: a 401 on the silent `conversation-assignee-update` stops
   assignments with **no error raised**). Its auth is Family-A-inherited + Family-B already proven by
   step 2, so nothing is lost by deferring; promoting it only after the recipe is proven on 3 live
   respond-trigger workflows minimises the chance of a staff-facing functional break.

> **Why send-user is 3rd, not last, despite being highest-consequence:** its failure mode is **LOUD**
> (self-announcing, immediately rollback-able) and it is the fastest verifier. change-assignee's
> failure mode is **SILENT** (invisible assignment loss), which is the worse operational risk, so it
> earns the last, most-cautious slot.

---

## 6. Conversion-risk flags — is T3's CONVERSION riskier than T2?

Scanned all 4 workflows. The delta is D1–D4 as in T2, but T3 has these tranche-specific hazards:

- **`respond-close-convo` carries `settings.binaryMode:"separate"`** — the LESSONS-55 landmine: the
  public `workflowSettings` OpenAPI schema omits `binaryMode`, so echoing it in the PUT body 400s
  (`settings must NOT have additional properties`). **`del(.settings.binaryMode)` before the PUT**
  (lossless — settings is merged, not replaced). The other 3 have only `{executionOrder, availableInMCP}`. **Keep `executionOrder:"v1"`.**

  > ⚠️ **CORRECTED 2026-07-22 (T3 coder caught it, reviewer ratified).** The original text said
  > "strip `availableInMCP` too per T2 precedent." That was **wrong and self-contradictory**: T2 did
  > **NOT** strip `availableInMCP` — its approved, published bodies kept `availableInMCP:true` and
  > published without a 400, proving it **schema-valid in a PUT body**. Only `binaryMode` /
  > `timeSavedMode` are the out-of-schema 400-trap. **Do NOT strip `availableInMCP`; keep it.**
  > Applies to T4/T5 as well — strip only `binaryMode`/`timeSavedMode`, nothing else.
- **NO second headers on any T3 CRM node** (unlike T2's `X-Source`, unlike the spine's
  `ideate-turn-http` `Content-Type`). Every one of the 8 carries **only** `x-api-key`, so **D4 is a
  clean full-clear to `headerParameters.parameters: []`** on all 8. Simpler than T2.
- **Collateral credentials that MUST survive each PUT** (re-assert after — LESSONS 55):
  - all 4: `respondIoApi = sorento-api / OiS59QkzpKfKSdaa` (triggers + `Update a Contact` / `Assign`)
  - `respond-close-convo`: + `postgres = sorento-crm-db / ETJL5KoaA1UpkDip` ×2
  - `respond-send-user`: + `postgres = sorento-crm-db / ETJL5KoaA1UpkDip` ×2

  These `postgres` creds point at **prod `sorento-crm-db`** — expected for live workflows, not a
  footgun to "fix"; just must not be dropped by the PUT.
- **Draft check is mandatory and NOT satisfiable by REST GET alone.** REST GET returns a single
  `versionId` (all 4 show `active:true`, `updatedAt` 2026-06-27/28 — no hand-editing signal, low
  risk), but PUT publishes the *draft* if draft ≠ active (LESSONS 55). **Before each PUT the coder
  MUST MCP `get_workflow_details` and confirm `versionId == activeVersionId`**, and capture
  `activeVersionId` for the §4.9 backup / §4.10 rollback (REST GET does not expose it).
- **`-before.json` backups carry the live literal key** (unconverted `x-api-key`) → live secret at
  rest. `n8n-workflows-init/tests/diffs/auth-unification/.gitignore` **already covers**
  `T3-*-before.json` (verified via `git check-ignore`). Never commit them.
- **These are the highest-blast-radius PUTs so far** (live active trigger workflows that write CRM +
  can send). The PUT-is-the-promote discipline (plan §4.7 sequence: MCP D1/D2/D4 into draft → review
  body as bytes → re-diff → one unmodified PUT binding D3 + publishing) applies unchanged; the only
  new element vs T2 is the trigger-subscription blast radius, mitigated by the ascending-risk order in
  §5 and the loud-node error-watch.

**Net:** the CONVERSION mechanics are *not* materially riskier than T2 (same delta, cleaner headers,
one known settings-key strip). The added risk is entirely in **blast radius on publish**, handled by
ordering + rollback, and in the **2 silent nodes' functional failure mode**, handled by the §2
credential inheritance rather than by an error-watch that is structurally blind to them.

---

## 7. Acceptance summary — T3 is done when

1. §4.9 backup captured per workflow (incl. `activeVersionId` via MCP); `.gitignore` confirmed.
2. §5.1 G1–G7 green over all 8 nodes (scripted, REST GET). This is the **primary gate** (P2 in §2).
3. Credential-resolution premise (P1) recorded as inherited-and-measured: Family A (T0 9456211 / T2),
   Family B (T2 **9471108**). No new provocation.
4. Per-node §3 verdict recorded: LOUD nodes have a `status:error` rollback-watch armed + best-effort
   positive 2xx within the stated window; SILENT nodes (1,4) recorded as statically-verified +
   Family-A-inherited, with the CRM-side / read-probe rollback trigger noted and **no provocation**.
5. `contact-create-update` explicitly recorded **UNVERIFIED-by-positive-dynamic-proof** (rare traffic)
   — auth-covered by §2, corroboration best-effort. Never inferred from the diff (LESSONS 54).
6. User-gated promote, one workflow at a time, in the §5 order. Post-PUT: re-run §5.1 against active;
   collateral credentials re-asserted; G7 census falls by exactly the node count and never rises.
