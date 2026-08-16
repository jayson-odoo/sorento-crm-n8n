# T4 — CRM auth unification, `sub-human-intervention` SHARED sub (3 nodes, 1 workflow)

**Change-id:** auth-unification-T4-sub-human-intervention
**Date:** 2026-07-22
**Target (ONLY):** `sub-human-intervention` `rrYXzE61gCNUck_zmXe-G` — the **LIVE published** human-intervention sub.
**Plan:** `n8n-workflows-init/plans/crm-auth-unification-plan.md` — §3 (D1–D4), §3.3 (REWRITTEN), §4 T4,
§4.6, §4.7 (AMENDED), §4.9 (AMENDED), §4.10, §5.1 (gate AMENDED + G7 CORRECTED), §5.2, §5.3.
**Verification-design carried over:** `plans/T3-verification-design.md` (credential-inheritance P1+P2
argument, acceptance-clause shape, `availableInMCP` correction — strip only `binaryMode`/`timeSavedMode`).
**Precedent:** `T3-respond-writers.md` + `reviews/auth-unification-T3-respond-writers.md`.
**Gate:** `assert-auth.sh` (hardened 2026-07-22). **NOT edited during this tranche.** This id has **no**
leading dash → the gate runs it directly (unlike T3's `-WkzJMQZ…`).

---

## ✅ PROMOTED LIVE 2026-07-22 — user-gated PUT sent, published, state-verified. SAFE IN PRODUCTION.

**Promote record (coder, 2026-07-22):**

| item | value |
|---|---|
| target | `sub-human-intervention` `rrYXzE61gCNUck_zmXe-G` (LIVE published sub — NOT the fork `vUfFUDjLAuMaeQE6`) |
| PUT | ONE `PUT /workflows/rrYXzE61gCNUck_zmXe-G` `--data-binary @T4-rrYXzE61gCNUck_zmXe-G-body.json` (bytes unmodified) |
| pushed body sha256 | `4b394c028cee789d3960869f445b7fbdd53119149f5a5df6c15b7f52a80d0834` (33446 B) — re-verified pre-PUT |
| **HTTP code** | **200** (expected — exec-trigger, no webhook 409) |
| prior `activeVersionId` (rollback pointer) | `486c5c1a-9116-4894-af1a-13556627ab02` |
| **new `activeVersionId` == `versionId`** | **`5018a189-22df-4cb9-aa89-fa509377abe9`** (`active:true`, published) |

**§4.6 pre-flight (MCP + fresh REST GET, immediately before the PUT):** `activeVersionId` still
`486c5c1a-…`; `versionId` still `c3c35188-…`; differing-node set vs the pre-change published state =
**exactly the 3 targets**, each carrying only D1(`authentication`)+D2(`genericAuthType`)+D4(`headers→[]`);
node-name set + connections byte-identical; USER had **not** pre-converted (published still carried the
literal key on all 3). `body.json` verified = draft + D3 (`httpHeaderAuth` on the 3 targets) + settings
strip, nothing else.

**Post-PUT STATE verification (the real gate):**
- **5a** `versionId == activeVersionId == 5018a189-…`, `active:true` ✅
- **5b** all 3 targets → `authentication=genericCredentialType`, `genericAuthType=httpHeaderAuth`,
  `httpHeaderAuth={mNsZWyU82NYV58k2, crm-n8n-auth}`, `headerParameters.parameters=[]`, x-api-key count 0 ✅
- **5c collateral — 6 bound nodes (expected 6):** `respondIoApi=OiS59QkzpKfKSdaa` (Assign or unassign a
  Conversation1) SURVIVED, `redis=H5w6o7tptzTPMVdy` ×2 (Redis, test-guard-record) SURVIVED, + 3 new
  `httpHeaderAuth`. **No collateral loss.** ✅
- **5d** settings retains `binaryMode:separate` **and** `timeSavedMode:fixed` (survived via merge) +
  `availableInMCP`/`executionOrder`/`callerPolicy`/`timezone`; residual x-api-key anywhere = 0; node-name
  set, node-id set, and connections byte-identical vs before.json ✅

**Gate (frozen `assert-auth.sh`, no `--exclude`):** `RESULT: PASS` exit 0 — `draft == active`, G1-G4 PASS
all 3, G5 PASS (16), G5b PASS (16), G6 PASS ×2, residual **NONE**, **no phantom EXCLUDED line**. Exact
match to the pre-declared post-PUT block below.

**Post-promote error-watch (observational, no provocation):** MCP `search_executions(rrYXzE61…,
status:[error,crashed], startedAfter=PUT window)` → **0 executions**. All 3 nodes are LOUD, so a
post-conversion 401 would surface as `status:error`; none seen. Absence is **expected** (the sub only runs
on organic escalation) — this is observational, not positive proof. The sub was **not** executed and **no
escalation was provoked**.

**Not touched:** the fork `vUfFUDjLAuMaeQE6`, the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone
`txiPzSxy3Pclsz6v`, the T0-T3 converted workflows, `assert-auth.sh`. Transient full-GET deleted; all
literal-key files gitignored (0 tracked); `after.json` + `body.json` carry no literal key.

---

## ⏸ STATUS (superseded by the promote record above): DRAFT ONLY — D1/D2/D4 applied. D3 NOT applied. NO PUT SENT. NOTHING PUBLISHED.

Per §4.7 (amended) + LESSONS 55: on a live workflow **a REST PUT is the promote**, and REST PUT is the
only way to bind a generic-auth credential (MCP cannot bind `httpHeaderAuth`). This tranche stops one
step short. Handoff artifact = **one draft + one exact PUT body** (`T4-…-body.json`, sha + bytes below).

⚠️ **SHARED SUB — higher ripple than any leaf workflow.** `rrYXzE61gCNUck_zmXe-G` is called by the LIVE
spine `9qVyfUxmRQqrpGRMDLRuz` and the escalation flow. When it runs **unguarded** (live callers), the 3
target nodes do real round-robin assignment, SLA-tracking creation, and working-days lookup. The draft
is currently **non-functional on those 3 nodes** (D1+D2 with no bound credential). **A publish of this
draft, for any reason, ships credential-less nodes into the live escalation path on the next
escalation** — degrading round-robin assignment, SLA creation and staff notification for real
customers. Do not publish mid-sequence: either complete the PUT (§promote checklist) or roll back (§4.10).

**This is the LIVE published sub `rrYXzE61gCNUck_zmXe-G`, NOT the guarded fork `vUfFUDjLAuMaeQE6`**
(the fork is the clone's; it was already converted in T0 and is out of scope here). Confirmed target id
on every MCP/REST call in this run.

---

## Prereq findings

### Node list — RE-VERIFIED against live (MCP `get_workflow_details` + REST GET, 2026-07-22)

**Exactly 3 CRM httpRequest nodes hit `fe-sorento.foundryx.my`, no more, no fewer.** Blind-spot check:
the set of nodes carrying an `x-api-key` header over **ALL** node types is exactly these 3 (jq over the
whole node list). No non-CRM `httpRequest` node exists anywhere in the workflow → **no CRM-host-filter
blind spot**. Each target: `authentication` absent (⇒ `none`), no credential, `sendHeaders:true`,
`x-api-key` as its **only** header, `typeVersion 4.3`.

| # | node | method · endpoint | auth family | 2nd header | onError (live) | error out `main[1]` wired | verdict |
|---|---|---|---|---|---|---|---|
| 1 | `conversation-sla-tracking-create` | POST `/api/v1/sla-management/conversation-sla-tracking` | **B** | NONE | absent ⇒ `stopWorkflow` | n/a | 🔊 **LOUD** |
| 2 | `get-round-robin-assignee` | POST `/api/v1/external/next-assignee` | **A** | NONE | absent ⇒ `stopWorkflow` | n/a | 🔊 **LOUD** |
| 3 | `get-working-days` | GET `/api/v1/external/work-calendar` | **A** | NONE | absent ⇒ `stopWorkflow` | n/a | 🔊 **LOUD** |

- **NO second headers** on any of the 3 — each carried `x-api-key` as its only header, so D4 is a clean
  full-clear to `headerParameters.parameters: []`. Nothing else cleared. (Reported per node, per task.)
- **Silent/loud re-derived from `connections`** (not off `onError` alone): all 3 nodes have `onError`
  **absent** (n8n default = `stopWorkflow`) and each has only `main[0]` wired downstream. On a 401 each
  **hard-fails the execution → LOUD**. None silently swallows. Wirings:
  `Assign or unassign a Conversation1 → conversation-sla-tracking-create → Call 'sub-add-comment-respond'`;
  `…-pic2 → get-round-robin-assignee → if-conversation-unassigned`; `Redis → get-working-days → …-pic1`.
- **These 3 run only on the LIVE (unguarded) path.** The sub's `test-guard` routes `is_test===true` to
  `test-guard-record` (a `test:egress:{id}` RPUSH) and `false` to the real assignment/SLA/PIC path. So
  test callers short-circuit; LIVE callers reach these nodes for real. **The sub was NOT executed and
  no escalation was provoked** (safety).

### Auth families + success-response keys — CONFIRMED from CRM source (READ ONLY, `/…/sorento_crm`)

| node | handler (source) | auth dependency | family | success-response domain key |
|---|---|---|---|---|
| `conversation-sla-tracking-create` | `sla_tracking.py:735 create_sla_tracking` → `ConversationSLATrackingResponse` (201) | SLA router mounted `prefix="/sla-management"` `Depends(require_module_enabled_with_api_key("sla"))` (`api/v1/__init__.py:104-109`) + per-handler `Depends(get_current_user_or_api_key)` | **B** | **`initiated_at`** present (also `current_tier`/`due_at`/`due_at_resolution`/`assigned_to`) ∧ `error` absent |
| `get-round-robin-assignee` | `external/next_assignee.py:249 post_next_assignee` (`_format_assignee_response`+`_enrich_n8n_response`) | `Depends(get_external_api_user)` | **A** | **`status_flags`** present (list) AND **`is_working_hours`** present ∧ `error` absent (also `assignee_respond_user_id`, `message`) |
| `get-working-days` | `external/work_calendar.py:23 get_work_calendar_summary` → `ExternalWorkCalendarSummary` | `Depends(get_external_api_user)` | **A** | **`working_day_ranges`** present (list) AND **`working_hours_start`** present ∧ `error` absent |

Families match the task's stated expectation exactly: Family B for `conversation-sla-tracking-create`
(same dep+module-gate as T2 exec **9471108** `get-due-escalations`, which proved the key is *enabled for
the "sla" module*); Family A for `get-round-robin-assignee` (`/external/next-assignee`) and
`get-working-days` (`/external/work-calendar`) (same `get_external_api_user` dep proven by **T0 exec
9456211** `get-session-vars-http` + **T2** `insert-message`).

### No pre-existing rider draft — CLEAN before this work (MCP, the channel REST cannot give)

| pointer | value before my edits |
|---|---|
| `versionId` (before) == `activeVersionId` | `486c5c1a-9116-4894-af1a-13556627ab02` |

`versionId == activeVersionId` before I touched it ⇒ **nobody hand-converted it in the UI; no
unattributed draft delta.** The `activeVersion.nodes` still carry the literal `x-api-key`
(`M6Hur…`) on all 3 targets ⇒ the user did **not** pre-convert this. Proceeded (no byte-equality STOP).

### Version pointers AFTER the MCP edits (MCP-confirmed)

| pointer | value now |
|---|---|
| `versionId` (draft w/ D1/D2/D4) | `c3c35188-1711-4c38-a54f-a15eeaf7cd70` |
| `activeVersionId` (**UNCHANGED** — rollback pointer) | `486c5c1a-9116-4894-af1a-13556627ab02` |

`activeVersionId` unchanged ⇒ **production bit-for-bit unchanged.** `486c5c1a…` is the §4.10 rollback
pointer. MCP draft-vs-`activeVersion` diff: the published `activeVersion` still carries the literal
`x-api-key` on all 3 targets.

> **Draft `meta` rider (inert):** MCP `update_workflow` stamped `meta.aiBuilderAssisted:true,
> builderVariant:"mcp"` onto the draft. **Not shipped by the PUT** — `body.json` contains only
> `{name,nodes,connections,settings}`, so `meta` is untouched by the promote. Recorded, not a concern.

---

## The delta

| # | change | mechanism | applied here? |
|---|---|---|---|
| D1 | `parameters.authentication = "genericCredentialType"` | MCP `setNodeParameter` `/authentication` | ✅ 3/3 |
| D2 | `parameters.genericAuthType = "httpHeaderAuth"` | MCP `setNodeParameter` `/genericAuthType` | ✅ 3/3 |
| D3 | `credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` | **REST PUT** (staged in `body.json`) | ⏸ **NOT applied — user-gated** |
| D4 | drop the `x-api-key` header entry | MCP `setNodeParameter` `/headerParameters/parameters = []` | ✅ 3/3 |

**Ops issued: ONE atomic `update_workflow` = 9 `setNodeParameter` ops** (3 per node), all applied;
`autoAssignedCredentials: []` (LESSONS 47 did NOT fire); zero `validationWarnings`. Zero `renameNode`,
connection ops, position changes, `addNode`, `setNodeCredential`.

**LESSONS 32b check:** `strayNested=none` on all 3 targets (no `parameters.parameters.*`); the real leaf
keys changed. D4 = clean full-clear to `[]` on all 3 (no non-`x-api-key` header to preserve on any node).

### Per-node change

| node | endpoint | family | loud/silent | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|
| `conversation-sla-tracking-create` | POST `/sla-management/conversation-sla-tracking` | B | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |
| `get-round-robin-assignee` | POST `/external/next-assignee` | A | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |
| `get-working-days` | GET `/external/work-calendar` | A | 🔊 LOUD | ✅ | ✅ | `[]` | ⏸ PUT |

`url`, `method`, `sendBody`, `specifyBody`, `jsonBody`, `options`, `onError`, `retryOnFail`, `position`,
`name`, `id`, `typeVersion` untouched on all 3.

---

## Deliverable 2 · `body.json`

Single workflow ⇒ **ONE** `body.json`. Built from a fresh REST GET **after** the MCP edits (so it
carries D1/D2/D4 from the draft) with D3 layered on the 3 targets:

```
{name, nodes, connections, settings}
| .settings |= del(.binaryMode, .timeSavedMode)
| .nodes |= map(<3 targets> → credentials.httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth})
```

| file | sha256 | bytes | nodes | targets bound | total bound nodes |
|---|---|---|---|---|---|
| `T4-rrYXzE61gCNUck_zmXe-G-body.json` | `4b394c028cee789d3960869f445b7fbdd53119149f5a5df6c15b7f52a80d0834` | **33,446** | 16 | 3 | **6** |

Verified: top-level keys exactly `connections, name, nodes, settings`; node count 16 = live; **0**
occurrences of the literal CRM key; **0** residual `x-api-key` entries; D3 bound on exactly the 3 targets
and no other; every pre-existing binding carried.

### `settings` — strip only `binaryMode`/`timeSavedMode` (T3 Decision-1 recipe, ratified)

| | value |
|---|---|
| live `settings` | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, binaryMode:separate, timeSavedMode:fixed, timezone:Asia/Kuala_Lumpur}` |
| **stripped** | **`binaryMode`, `timeSavedMode`** (both OpenAPI-invalid → 400-trap; lossless — settings is merged, they survive from storage) |
| `settings` IN BODY | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, timezone:Asia/Kuala_Lumpur}` |

**`availableInMCP` KEPT** (T3 Decision-1: T2 kept it and published without a 400; it is schema-valid).
`executionOrder`, `callerPolicy`, `timezone` kept. **Post-PUT: re-assert `binaryMode == "separate"` and
`timeSavedMode == "fixed"` survived** (merge). This workflow is the first in the programme to carry
`timeSavedMode` — both strip keys are exercised here.

### ⚠️ Reviewed bytes must equal pushed bytes

The reviewer reviews `body.json` **as bytes** (sha above). Before the PUT: re-run the §4.6 draft-vs-active
diff, re-verify the sha, send unmodified (`--data-binary @T4-…-body.json`). A regenerated body **voids
the review.**

---

## Deliverable 3 · §5.1 gate — run against the DRAFT (pre-PUT). `RESULT: FAIL` is CORRECT & EXPECTED.

`./assert-auth.sh rrYXzE61gCNUck_zmXe-G T4-rrYXzE61gCNUck_zmXe-G-before.json` (no `--exclude`; every CRM
node is in T4 scope). **No leading-dash problem — the gate ran directly.** Actual output:

```
== sub-human-intervention (rrYXzE61gCNUck_zmXe-G)
   versionId=c3c35188-…  activeVersionId=486c5c1a-…
   !! UNPUBLISHED DRAFT -- assertions below describe the DRAFT, not what executes
-- G1-G4
   FAIL conversation-sla-tracking-create  G1=true G2=true G3=false G4=true
   FAIL get-round-robin-assignee          G1=true G2=true G3=false G4=true
   FAIL get-working-days                  G1=true G2=true G3=false G4=true
-- G5 no-rider     PASS -- no out-of-scope key changed on any of 16 compared nodes
-- G5b headers     PASS -- non-x-api-key headers preserved verbatim across 16 nodes
-- G6 no-collateral PASS node-name set identical ; PASS connections byte-identical
-- residual hardcoded x-api-key in this workflow: NONE
RESULT: FAIL   (exit 1)
```

**Compared-node population:** G1–G4 over the **3** CRM nodes; G5/G5b over **16** nodes (full node set,
before∩body by name). **Sole cause of FAIL: `G3=false` on all 3** — G3 asserts the credential binding
(D3), deliberately deferred to the user-gated PUT. No intermediate state can pass G3 pre-PUT. No riders,
no `HEADER-DRIFT`, residual NONE. Proven green now: G1/G2/G4 3/3, G5 PASS (16), G5b PASS (16), G6 PASS ×2.

### Independent draft-vs-active masked residual delta (before.json vs body.json)

Projected both to `{name, connections, nodes}`, sorted nodes by name, deleted D1/D2/D3/D4 keys from every
node, diffed:

```
maskedBefore 32378B   maskedBody 32453B
residual = only "credentials": {} ×3, on exactly the 3 target nodes (the D3 footprint through the mask)
```

Nothing else differs; no removed lines; connections byte-identical; node-name set identical. ⇒ body =
pre-change live workflow **modulo exactly D1/D2/D3/D4 on exactly the 3 targets** — covering `id`, `type`,
`typeVersion`, `position`, `onError`, `retryOnFail`, `url`, `method`, `jsonBody`, `connections`.

### Pre-declared EXPECTED post-PUT gate output (§5.1 exact-match acceptance) — N=3, pop=16

```
== sub-human-intervention (rrYXzE61gCNUck_zmXe-G)
   versionId=<V>  activeVersionId=<V>
   draft == active (published)

-- G1-G4 (per node: authentication / genericAuthType / credential / no x-api-key)
   PASS -- all 3 CRM nodes satisfy G1-G4

-- G5 no-rider (only authentication / genericAuthType / headerParameters changed)
   PASS -- no out-of-scope key changed on any of 16 compared nodes

-- G5b headerParameters: only the x-api-key entry removed
   PASS -- non-x-api-key headers preserved verbatim across 16 nodes

-- G6 no-collateral (node set, connections)
   PASS -- node-name set identical
   PASS -- connections byte-identical

-- residual hardcoded x-api-key in this workflow: NONE

RESULT: PASS
```

No phantom `EXCLUDED` line (hardened gate, `--exclude` absent ⇒ `[]`). Any deviation from this exact
block post-PUT ⇒ REQUEST-CHANGES / rollback.

---

## Deliverable 4 · Pre-PUT collateral-credential baseline (LESSONS 55)

Every credential bound anywhere in the workflow **before** T4 (MCP redacts creds on read — this came from
the REST GET `before.json`, which returns `{id,name}`). **All must still be bound, unchanged, after the
PUT.** None of the 3 target nodes had any credential before T4 → all 3 new `httpHeaderAuth` bindings are
unambiguously new.

| node | type | credential | id | name |
|---|---|---|---|---|
| `Assign or unassign a Conversation1` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` | sorento-api |
| `Redis` | redis | `redis` | `H5w6o7tptzTPMVdy` | sorento-redis |
| `test-guard-record` | redis | `redis` | `H5w6o7tptzTPMVdy` | sorento-redis |

### Expected bound-node count post-PUT

| | count |
|---|---|
| pre-existing (1 `respondIoApi` + 2 `redis`) | 3 |
| + new `httpHeaderAuth` on the 3 targets | 3 |
| **= expected total bound nodes** | **6** |

Post-PUT assertion:
```bash
jq -r '.nodes[]|select(.credentials!=null and (.credentials|length)>0)
       |"\(.name)\t\(.credentials|to_entries|map("\(.key)=\(.value.id)")|join(","))"' T4-…-after.json
```
Any of the 3 pre-existing bindings missing → immediate rollback. (The `respondIoApi` on
`Assign or unassign a Conversation1` is the live-assignment egress credential — losing it breaks
escalation assignment; safety-relevant, not tidy. The 2 `redis` creds carry the sub's queue + test-egress
log.)

---

## Deliverable 5 · Expected G7 census (draft-measured)

- **Within-workflow:** 3 → **0** (delta **−3**). The gate's residual line already reads **NONE** on the
  draft. Binding G7 rule ("must fall by exactly the node count, never rise") satisfied at draft time.
- **Instance-wide (draft-measured):** post-T3 residual = **5** (= T4 3 + T5 1 + T1b 1, per T3-review §7).
  My MCP edits already stripped `x-api-key` from the 3 T4 drafts, so a census **right now, nothing
  published, already reads 2** (= T5 1 + T1b 1). ⚠️ **G7 is DRAFT-measured and is NOT promote evidence**
  (it cannot distinguish "drafted" from "published"). The published-state half is "must not rise, and
  must read 2 after the PUT"; the −3 fall is consumed at draft time. Published-state proof =
  `versionId == activeVersionId` **plus G3=true** in the gate. (I did **not** run the full instance-wide
  census — out of a single-workflow coder edit's scope, per the T3 precedent; the within-workflow residual
  is authoritative here.)

---

## Deliverable 6 · Per-node acceptance clause for the tester (§5.2 / §5.3, observational)

**PAST executions cannot verify auth** (they ran on the literal key). **Only a POST-PUT execution
counts** (LESSONS 54). Auth-resolution premise **P1 is already MEASURED** and inherited, not re-provoked:
Family A via **T0 exec 9456211** (`get-session-vars-http` 2xx) + **T2** `insert-message`; Family B via
**T2 exec 9471108** (`get-due-escalations` = `{"status":"success","count":0,"items":[]}`, `error`
absent — proves the key is enabled for the `sla` module). The credential is one shared object
(`mNsZWyU82NYV58k2`); the two dependencies are shared across tranches. So each node's auth = the deduction
**P1 (measured) + P2 (§5.1 gate, per node)**, NOT clean-static-diff ⇒ pass.

**This is an egress-adjacent SHARED sub → OBSERVATIONAL verification only (§5.3). Never provoke an
escalation.** All 3 nodes run only when a LIVE caller reaches the unguarded path (an organic escalation);
`execute_workflow` on this sub would fire real round-robin assignment + SLA create + a real
`sorento-sub-respond-sendmsg-respond` PIC send — **forbidden**.

**Universal acceptance clause — assert on runData PRESENCE, never execution status:**
```
main[0][0].json.<domain key below>   PRESENT   (presence, not truthiness — current_tier can be 1)
AND main[0][0].json.error            ABSENT
```
Method (LESSONS 35): `search_executions(workflowId:rrYXzE61gCNUck_zmXe-G, window)` → **one** targeted
`get_execution(includeData:true, nodeNames:[…], truncateData:N)`. Never list-with-data.

| node | family | silent/loud | domain key to assert | trigger / window | rollback trigger |
|---|---|---|---|---|---|
| `conversation-sla-tracking-create` | B | 🔊 LOUD | **`initiated_at`** present (or `current_tier`/`due_at`) ∧ `error` absent | organic escalation reaching the assign path; Family B already proven (T2 9471108) | new `status:error` exec on `rrYXzE61…` |
| `get-round-robin-assignee` | A | 🔊 LOUD | **`status_flags`** present (list) ∧ **`is_working_hours`** present ∧ `error` absent | same organic escalation; Family A already proven (T0 9456211) | new `status:error` exec on `rrYXzE61…` |
| `get-working-days` | A | 🔊 LOUD | **`working_day_ranges`** present (list) ∧ **`working_hours_start`** present ∧ `error` absent | non-working-hours escalation branch (reached via `Redis → get-working-days`) | new `status:error` exec on `rrYXzE61…` |

All 3 are **LOUD** ⇒ a 401 hard-fails the execution and is visible to
`search_executions(status:["error"])` — arm that rollback-watch on `rrYXzE61…` post-PUT. No silent node
in this tranche (unlike T3's 2 Family-A silent nodes). A safe optional positive **read** probe bound to
`crm-n8n-auth` re-proves each family on demand without any escalation (Family B
`GET /sla-management/conversation-sla-tracking/dashboard`; Family A the existing T0 `get-session-vars-http`
GET). Do NOT curl with a raw key (LESSONS 14).

---

## ⚠️ No 409 expected on the eventual PUT (exec-trigger, NOT respond.io-webhook)

T3's PUT #1 returned HTTP **409** (webhook re-registration conflict) because those are
`respondioTrigger`/webhook workflows. **`sub-human-intervention` is exec-trigger-driven**
(`executeWorkflowTrigger` — "no production triggers … can only be executed in manual mode"), so there is
**no webhook re-registration step** and the T3-style 409 should **NOT** apply. **A clean HTTP 200 is
expected** on the eventual PUT. If a 409 (or any non-200) appears, treat it as unexpected: capture,
assess, report — do not retry blind.

---

## Backup (§4.9) + Rollback (§4.10)

| artifact | file | gitignored |
|---|---|---|
| full REST GET (before) — carries the live literal key | `T4-rrYXzE61gCNUck_zmXe-G-before.json` | ✅ |
| per-node backup (3 targets: params + credentials) | `T4-rrYXzE61gCNUck_zmXe-G-nodes-before.json` | ✅ |
| PUT body (D1/D2/D4 + D3) | `T4-rrYXzE61gCNUck_zmXe-G-body.json` | ✅ |

`git check-ignore -q` confirmed per file before writing. **Secret scan** (`find … | xargs grep -l`, NOT
`grep -rl`): the literal CRM key appears only in the two gitignored T4 backups (`before` / `nodes-before`)
— **0 occurrences in any tracked file, 0 in `body.json`.** Transient scratchpad full-GET deleted.

**Rollback:**
- **Draft edited, not yet published (current state):** re-apply from `nodes-before.json` — per target,
  delete `/authentication` + `/genericAuthType` and restore `/headerParameters/parameters` to the single
  `x-api-key` entry. Nothing shipped; active untouched.
- **If the PUT lands and needs reverting:** `publish_workflow` the prior `activeVersionId`
  **`486c5c1a-9116-4894-af1a-13556627ab02`** (single pointer move; expect a dirty draft afterwards).

---

## Promote checklist — user-gated (per §4.7 sequence), SHARED-SUB ripple emphasized

⚠️ **SHARED-SUB RIPPLE — a broken publish degrades live escalation for real customers** (round-robin
assignment, SLA creation, staff PIC notification). Publish only in a staffed window with the rollback
pointer to hand.

1. **§4.6 re-diff immediately before the PUT (MCP).** HALT if `activeVersionId` ≠
   `486c5c1a-…`; or `versionId` ≠ `c3c35188-…`; or the differing-node set ≠ the 3 targets; or any delta
   exceeds D1/D2/D4.
2. **Re-verify the sha256** (`4b394c028cee…`) + byte count (33,446). Mismatch → stop; review void.
3. **One PUT, bytes unmodified:** `--data-binary @T4-rrYXzE61gCNUck_zmXe-G-body.json`. Binds D3 and
   publishes in one op. Do not hand-edit / re-serialise / pipe through `jq`. **Expect HTTP 200**
   (exec-trigger, no webhook 409).
4. **LESSONS 37: publish the sub.** Callers resolve only the *published* version — this PUT (which
   publishes) is what makes the conversion visible to the live spine + escalation flow. Confirm
   `versionId == activeVersionId` after.
5. **Capture** `GET → T4-…-after.json` (gitignored).
6. **Collateral (LESSONS 55):** expected bound-node count **6** — the 3 pre-existing
   (`respondIoApi=OiS59QkzpKfKSdaa`, `redis=H5w6o7tptzTPMVdy` ×2) survive + 3 new `httpHeaderAuth`. Any
   loss → immediate rollback to `486c5c1a-…`.
7. **Preservation:** `binaryMode == "separate"` **and** `timeSavedMode == "fixed"` survived (merge);
   `pinData`/`staticData`/`name`/`active`/`connections`/node-id set unchanged.
8. **Gate:** `./assert-auth.sh rrYXzE61gCNUck_zmXe-G T4-…-before.json` → **exact match** to the pre-declared
   post-PUT block above (`RESULT: PASS`, G5/G5b pop 16, no phantom EXCLUDED line). Gate stays **frozen**.
9. **Do NOT block-copy anything from the fork `vUfFUDjLAuMaeQE6`** (LESSONS 48) — the fork carries harness
   guards that must never reach live. This tranche applied D1–D4 to the live sub **directly**.
10. **Free correctness check (§4 T4):** after the PUT, the fork↔live node diff on the 3 targets should be
    D1–D4-identical (both now converted).

**Post-PUT dynamic acceptance (tester):** observational only — arm a `status:error` rollback-watch on
`rrYXzE61…` (all 3 nodes LOUD); best-effort positive 2xx from an organic escalation per Deliverable 6.
**Do NOT provoke an escalation** (`execute_workflow` = real assignment + SLA + PIC send).

---

## Safety

**No egress of any kind.** Params-only edits into one unpublished draft. No PUT, no publish, no execution
run, no escalation provoked, no webhook fired, no redis seed, no message injected, no CRM write. Reads:
MCP `get_workflow_details` (×2), REST `GET /workflows/rrYXzE61…` (×2, before + draft), CRM source
(READ ONLY). The literal CRM key never entered a tracked file.

**Not touched:** the fork `vUfFUDjLAuMaeQE6`, the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone
`txiPzSxy3Pclsz6v`, the T0–T3 already-converted workflows, `assert-auth.sh`, and every other workflow on
the instance. **The only live-instance mutation is one draft pointer moving; `activeVersionId` unchanged,
so production is bit-for-bit what it was.** T5 not started.
