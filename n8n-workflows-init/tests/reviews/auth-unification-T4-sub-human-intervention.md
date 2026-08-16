# REVIEW — auth-unification T4 · `sub-human-intervention` SHARED sub (3 nodes, 1 workflow)

**Date:** 2026-07-22 · **Verdict: APPROVE the reviewed body**, subject to the promote checklist below.
**Reviewer performed reads only:** no workflow edited, no gate edited, no PUT sent, no publish, no
execution run, no escalation provoked, no webhook fired, no redis seeded, no CRM write. Independent
channel throughout: MCP `get_workflow_details` (draft vs `activeVersion`), a local sha/jq/git pass over
`body.json` + `before.json`, and READ-ONLY CRM source (`/…/sorento_crm`). Every claim re-derived, not
trusted.

---

## 0 · Byte identity — this review is valid ONLY for these bytes

Reviewer-recomputed, matches the task table and the coder's Deliverable-2 exactly:

```
4b394c028cee789d3960869f445b7fbdd53119149f5a5df6c15b7f52a80d0834   33446  T4-rrYXzE61gCNUck_zmXe-G-body.json
```

**Any regeneration of `body.json` VOIDS this approval and requires re-review.** Before the PUT: re-run
the §4.6 draft-vs-active diff, re-verify this sha + byte count, send unmodified (`--data-binary @…`).

---

## 1 · Right target — CONFIRMED live published sub, NOT the fork

MCP `get_workflow_details rrYXzE61gCNUck_zmXe-G` → `name: "sub-human-intervention"`, `active: true`,
`triggerCount: 0`. This is the **LIVE published** human-intervention sub called by the live spine
`9qVyfUxmRQqrpGRMDLRuz` and the escalation flow — **NOT** the clone's guarded fork
`vUfFUDjLAuMaeQE6` (already converted in T0, out of scope). Every artifact carries id
`rrYXzE61gCNUck_zmXe-G`. Correct target.

---

## 2 · The draft — verified via MCP (a DIFFERENT channel than the coder's REST body)

| pointer | value |
|---|---|
| `versionId` (draft, D1/D2/D4 applied) | `c3c35188-1711-4c38-a54f-a15eeaf7cd70` |
| `activeVersionId` (**UNCHANGED** — §4.10 rollback pointer) | `486c5c1a-9116-4894-af1a-13556627ab02` |

Both match the coder's recorded values. `activeVersionId` unchanged ⇒ **production bit-for-bit
unchanged.**

Draft `.nodes` vs `.activeVersion.nodes`, per the 3 targets:

| node | draft (`.nodes`) | published (`.activeVersion.nodes`) |
|---|---|---|
| `conversation-sla-tracking-create` | `authentication=genericCredentialType`, `genericAuthType=httpHeaderAuth`, `headerParameters.parameters=[]` | `x-api-key=M6Hur…` present, **no** authentication/genericAuthType |
| `get-round-robin-assignee` | same D1/D2/D4 | same — literal key, no auth |
| `get-working-days` | same D1/D2/D4 | same — literal key, no auth |

- **Only the 3 target nodes differ** between draft and published; all other 13 nodes byte-identical.
- Deltas are **only D1/D2/D4** on each (D3 rides the PUT body). `url`/`method`/`jsonBody`/`onError`/
  `position`/`id`/`type`/`typeVersion` untouched on all 3.
- `connections` draft == active (byte-identical).
- **No stray `parameters.parameters.*`** on any target (LESSONS 32b clear) — `authentication`/
  `genericAuthType` are real leaf keys, `headerParameters.parameters` is the real array.
- D4 = clean full-clear to `[]`: each target carried **exactly one** header (`x-api-key`) before
  (confirmed in `before.json` AND `activeVersion` — single-entry array), so **no second header was
  silently cleared.**
- `settings`/`name`/`active`/`pinData`/`staticData` untouched (see §3 for the intended settings strip).
- The inert `meta.aiBuilderAssisted/builderVariant:"mcp"` draft rider is present but **not shipped** —
  `body.json` top-level keys are exactly `{connections, name, nodes, settings}`, so `meta` is untouched
  by the promote. Non-concern, confirmed.

### Strongest single result — masked residual delta (before.json vs body.json)

Both projected to `{name, connections, nodes}`, nodes sorted by name, then `authentication`,
`genericAuthType`, `headerParameters`, and `credentials.httpHeaderAuth` deleted from every node, then
diffed:

```
maskedBefore 32378B   maskedBody 32453B
residual = ONLY  "credentials": {}  ×3, on exactly the 3 target nodes
```

The sole residual is an empty `credentials:{}` on exactly the 3 targets (D3's footprint through the
mask — before.json targets had no `credentials` key). No other node key differs; no non-target node is
touched; no removed lines; connections byte-identical; node-name set identical. ⇒ **body = pre-change
live workflow modulo exactly D1/D2/D3/D4 on exactly the 3 targets and nothing else** — covering `id`,
`type`, `typeVersion`, `position`, `onError`, `url`, `method`, `jsonBody`, and `connections`. Byte
counts printed so the check cannot pass vacuously (LESSONS 45).

**Scope — no CRM-host blind spot:** the set of nodes carrying an `x-api-key` header over ALL node
types is exactly these 3; there is no non-CRM `httpRequest` node in the workflow. D4 targets = 3 = the
tranche.

---

## 3 · The body — verified as bytes

| check | result |
|---|---|
| top-level keys | exactly `connections, name, nodes, settings` |
| node count | 16 = live |
| credential bound | `httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` on exactly the 3 targets, and no other node |
| **occurrences of the literal CRM key** | **0** (grepped the literal — 0 in body) |
| residual `x-api-key` header entry anywhere | **0** |
| `sendHeaders` on the 3 targets | `true` preserved |
| `headerParameters.parameters` on the 3 targets | **`[]`** — exactly one entry (x-api-key) removed, no second header |

### `settings` — strip `binaryMode` AND `timeSavedMode`, KEEP `availableInMCP` (T3 Decision-1, ratified)

| | value |
|---|---|
| live storage `settings` | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, binaryMode:separate, timeSavedMode:fixed, timezone:Asia/Kuala_Lumpur}` |
| `settings` IN BODY | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, timezone:Asia/Kuala_Lumpur}` |
| stripped | **`binaryMode`, `timeSavedMode`** (both OpenAPI-invalid → 400-trap) |

- **This is the FIRST workflow in the programme carrying `timeSavedMode`** — both strip keys are
  exercised here. Stripping both is correct and lossless: `settings` is **merged, not replaced**
  (LESSONS 55), so `binaryMode:"separate"` and `timeSavedMode:"fixed"` survive from storage.
- **Keeping `availableInMCP` is right** — T3 Decision-1 established (from the T2 `after.json` artifacts)
  that `availableInMCP:true` in a PUT body neither 400s nor is lost; T2 shipped it and published. Keeping
  it sends the bytes T2 validated and relies on merge for nothing.
- `executionOrder`, `callerPolicy`, `timezone` preserved.
- **Post-PUT: re-assert `binaryMode == "separate"` AND `timeSavedMode == "fixed"` survived** (merge).

---

## 4 · Collateral survival baseline — verified from live, carried in the body

Pre-existing bindings (from `before.json` REST GET — MCP redacts creds on read, LESSONS 47/55):

| node | type | credential | id |
|---|---|---|---|
| `Assign or unassign a Conversation1` | respondio | `respondIoApi` | `OiS59QkzpKfKSdaa` (sorento-api) |
| `Redis` | redis | `redis` | `H5w6o7tptzTPMVdy` (sorento-redis) |
| `test-guard-record` | redis | `redis` | `H5w6o7tptzTPMVdy` (sorento-redis) |

**`body.json` carries all 3, plus the 3 new `httpHeaderAuth` bindings → 6 bound nodes total**
(reviewer-verified in the body bytes). None of the 3 targets had a credential before, so the 3 new
bindings are unambiguously new.

**Expected post-PUT bound-node count = 6.** The `respondIoApi` on `Assign or unassign a Conversation1`
is the live-assignment egress credential — **losing it breaks escalation assignment (safety-relevant,
not tidy)**. The 2 `redis` creds carry the assignee queue + the test-egress log. Any of the 3 missing
after the PUT → immediate rollback to `486c5c1a-…`.

---

## 5 · Silent vs LOUD — RE-DERIVED INDEPENDENTLY from `connections` (all 3 LOUD)

Derived by the reviewer from the MCP `connections`, not off `onError` alone:

| node | `onError` | downstream wiring | error output `main[1]` wired? | verdict |
|---|---|---|---|---|
| `conversation-sla-tracking-create` | absent (`stopWorkflow`) | `main[0] → Call 'sub-add-comment-respond'` | NO | 🔊 **LOUD** |
| `get-round-robin-assignee` | absent | `main[0] → if-conversation-unassigned` | NO | 🔊 **LOUD** |
| `get-working-days` | absent | `main[0] → …-pic1` | NO | 🔊 **LOUD** |

**All 3 are LOUD** — a 401 hard-fails the execution and is visible to
`search_executions(status:["error"])` on `rrYXzE61…`. **T4 has NO silent node** (unlike T3's 2
Family-A silent nodes), so its post-promote verification is tractable: arm a `status:error`
rollback-watch and any auth failure surfaces. Confirmed per node. (The adjacent `executeWorkflow`
sendmsg/comment nodes carry `onError:continueErrorOutput`, but they are not targets and are byte-identical.)

---

## 6 · Credential-inheritance, per node — verified against CRM source (READ ONLY), not on trust

| node | endpoint | handler dep (CRM source) | family | already-measured proof |
|---|---|---|---|---|
| `conversation-sla-tracking-create` | POST `/sla-management/conversation-sla-tracking` | router-level `Depends(require_module_enabled_with_api_key("sla"))` (`app/api/v1/__init__.py`) + handler `get_current_user_or_api_key` (`sla/sla_tracking.py`) | **B** | T2 exec **9471108** (`get-due-escalations`, same `/sla-management` router, 2xx, `error` absent — proves the key is **enabled for the "sla" module**) |
| `get-round-robin-assignee` | POST `/external/next-assignee` | handler `post_next_assignee` → `Depends(get_external_api_user)` (`external/next_assignee.py:250-252`) | **A** | T0 exec **9456211** (`get-session-vars-http`, 2xx) + T2 `insert-message` |
| `get-working-days` | GET `/external/work-calendar` | handler `get_work_calendar_summary` → `Depends(get_external_api_user)` (`external/work_calendar.py:28-29`; docstring: "Auth: X-API-Key header (get_external_api_user), same as other /external routes") | **A** | same as above |

**Every T4 endpoint's actual auth dependency, read from source, is on an already-measured family** —
no endpoint rides an unmeasured dependency. The credential is one shared object (`mNsZWyU82NYV58k2`).
So each node's auth = **P1 (measured, inherited) + P2 (§5.1 gate, per node)**, not clean-static-diff ⇒
pass (LESSONS 54). The coder's Family mapping is confirmed exactly.

The `/external` router carries no top-level auth dependency — each external handler enforces
`get_external_api_user` itself; both target handlers do. The `/sla-management` router carries the
module-gate at mount, and the create handler accepts the API key via `get_current_user_or_api_key`.
Family B is strictly the stronger check (module-gate + key) and is the one T2 9471108 already cleared.

---

## 7 · Shared-sub ripple — conversion is PURE auth-plumbing, no behavioural change toward callers

The change alters **how the 3 nodes authenticate**, never **whether/when/what** they fire. Confirmed
from the MCP draft that the conversion does **not** touch:

- the `test-guard` IF (`is_test===true` gate) — unchanged; test callers still short-circuit to
  `test-guard-record`, live callers still reach the real path;
- the round-robin `jsonBody` (`get-round-robin-assignee` payload) — unchanged;
- the SLA `jsonBody` (`conversation-sla-tracking-create` payload) — unchanged;
- the `Redis` assignee-queue payload, the PIC sendmsg/comment sub-calls, `return-assignee` output —
  unchanged;
- `connections` — byte-identical;
- the caller contract: `When Executed by Another Workflow` `workflowInputs` (contact_id, agent, team,
  is_test, turn_id, …) — unchanged.

Nothing a caller (spine / escalation flow) passes interacts with credential resolution. **The
conversion cannot change the sub's behaviour toward its callers.** Ripple is limited to: if the PUT
publishes a credential-less draft, the 3 nodes 401 on the next live escalation. That is exactly why the
body binds D3 and why publishing this draft mid-sequence is forbidden (see §10).

---

## 8 · No 409 expected — exec-trigger, clean 200 is the expected PUT result

MCP `triggerInfo`: *"This workflow has no production triggers … can only be executed in manual mode"*;
the trigger node is `executeWorkflowTrigger`. There is **no webhook re-registration step**, so the
T3-style HTTP 409 does **NOT** apply. A clean **HTTP 200** is the expected PUT result — and a 409 here
**would be anomalous** (unlike T3, where PUT #1's 409 was benign webhook re-registration). If any
non-200 appears: capture, assess, report — do not retry blind.

---

## 9 · G7 census — draft-measured, ratified; NOT promote evidence

- **Within-workflow:** 3 → **0** (delta −3). The gate residual line reads **NONE** on the draft. The
  binding G7 rule ("must fall by exactly the node count, never rise") is satisfied at draft time.
- **Instance-wide (draft-measured):** post-T3 residual was **5** (= T4 3 + T5 1 + T1b 1, per T3-review
  §7). T4's MCP edits already stripped `x-api-key` from the 3 T4 drafts, so a census **right now,
  nothing published, reads 2**. The coder decomposes those 2 as **T5 (spine 1) + T1b
  (system-upload-attachments 1)**.
  - ⚠️ **Minor bookkeeping discrepancy (non-blocking):** the task framing says the tranche "should
    leave only T5's spine," i.e. expects **1**, whereas the coder's count (consistent with T3-review §7)
    leaves **2** (T5 + T1b). This does not affect the T4 bytes, the safety posture, or the gate result,
    and I did not run a full instance-wide census (out of a single-workflow review's scope, per the T3
    precedent). **Reconcile whether T1b `system-upload-attachments` is still an open residual** before
    treating instance-wide G7 as closed. G7 is draft-measured and is **NOT promote evidence** regardless.
- **Published-state proof for T4** = `versionId == activeVersionId` **plus G3=true** in the gate,
  post-PUT — not the census number.

---

## 10 · Parked-draft window + rollback — SHARED SUB in the live escalation path

`rrYXzE61…` is an **ACTIVE shared sub on the live escalation path**. The draft is currently
**non-functional on the 3 nodes** (D1+D2, no bound credential). **Any publish of this draft, for any
reason, ships credential-less nodes into the live escalation path on the next escalation** — degrading
round-robin assignment, SLA creation, and staff PIC notification for real customers.

Because this sub is **exec-trigger-driven** (not self-firing on a webhook/schedule like T2/T3), it does
not publish itself — the parking hazard is lower than T3's self-firing writers. But the blast radius of
an *accidental* publish is higher (whole escalation path). Ruling:

- **Do NOT publish mid-sequence.** Either complete the PUT (§11) or roll back (below). Never park the
  draft published-but-credential-less.
- **Maximum parking window: 48 h from 2026-07-22**, or until `activeVersionId` moves off
  `486c5c1a-…`, whichever is first. (48 h, matching a non-self-firing sub; if `activeVersionId` moves,
  re-baseline — do not reconcile. If `versionId` moves off `c3c35188-…`, `body.json` is **VOID** —
  regenerate + re-review.)

**Rollback:**
- **Draft edited, not yet published (current state):** re-apply from `T4-…-nodes-before.json` — per
  target, delete `/authentication` + `/genericAuthType`, restore `/headerParameters/parameters` to the
  single `x-api-key` entry. Nothing shipped; active untouched.
- **If the PUT lands and needs reverting:** `publish_workflow` the prior `activeVersionId`
  **`486c5c1a-9116-4894-af1a-13556627ab02`** (single pointer move; expect a dirty draft afterwards).

---

## 11 · Secret hygiene — verified, not trusted

- `git check-ignore -q`: all three T4 artifacts (`body`/`before`/`nodes-before`) → **IGNORED**.
- Repo-wide `find … | xargs grep -l <key>` (LESSONS: `grep -rl` false-negatives here): **28** files
  carry the literal key — **all 28 gitignored** (T0–T4 backups + `scratchpad/*` + a
  `promote-20260716` backup). **0 tracked files.**
- `git log -S<key> --all` → **empty. Key never committed.**
- **0 occurrences of the literal in `body.json`.**

---

## PROMOTE CHECKLIST — user-gated, SHARED-SUB ripple emphasized

Guard scaffolding is not applicable here — the reviewed body IS the promote bytes (the PUT is the
promote; no post-PUT-review stage). No business-logic diff to re-apply to the live spine; T4 is
auth-plumbing only. Publish only in a **staffed window** with the rollback pointer to hand — a broken
publish degrades live escalation (round-robin assignment, SLA creation, staff PIC notification) for
real customers.

1. **§4.6 re-diff immediately before the PUT (MCP).** HALT if `activeVersionId` ≠ `486c5c1a-…`; or
   `versionId` ≠ `c3c35188-…`; or the differing-node set ≠ the 3 targets; or any delta exceeds D1/D2/D4.
2. **Re-verify sha256 `4b394c028cee…` + byte count 33446.** Mismatch → stop; review void.
3. **One PUT, bytes unmodified:** `--data-binary @T4-rrYXzE61gCNUck_zmXe-G-body.json`. Binds D3 and
   publishes in one op. Do not hand-edit / re-serialise / pipe through `jq`. **Expect HTTP 200**
   (exec-trigger, no webhook 409); any non-200 → capture + report, do not retry blind.
4. **LESSONS 37:** the PUT publishes → confirm `versionId == activeVersionId` after; only then does the
   conversion become visible to the live spine + escalation flow.
5. **Capture** `GET → T4-…-after.json` (gitignored).
6. **Collateral (LESSONS 55):** expected bound-node count **6** — `respondIoApi=OiS59QkzpKfKSdaa` +
   `redis=H5w6o7tptzTPMVdy` ×2 survive, + 3 new `httpHeaderAuth`. Any loss → immediate rollback to
   `486c5c1a-…`.
7. **Preservation:** `binaryMode == "separate"` **AND** `timeSavedMode == "fixed"` survived (merge);
   `pinData`/`staticData`/`name`/`active`/`connections`/node-id set unchanged.
8. **Gate:** `./assert-auth.sh rrYXzE61gCNUck_zmXe-G T4-…-before.json` (no `--exclude`; no leading-dash
   issue — the gate runs directly) → **exact match** to the coder's pre-declared post-PUT block
   (`RESULT: PASS`, G1–G4 all 3, G5/G5b pop **16**, G6 ×2, residual NONE, **no phantom EXCLUDED line**).
   Gate stays **frozen**.
9. **Do NOT block-copy anything from the fork `vUfFUDjLAuMaeQE6`** (LESSONS 48) — this tranche applied
   D1–D4 to the live sub directly. (Free correctness check per §4 T4: post-PUT, the fork↔live node diff
   on the 3 targets should be D1–D4-identical.)

**Post-PUT dynamic acceptance (tester) — assert on runData PRESENCE, never execution status; do NOT
provoke an escalation (`execute_workflow` = real assignment + SLA create + real PIC send):**

| node | family | domain key to assert (present ∧ `error` absent) | trigger / rollback |
|---|---|---|---|
| `conversation-sla-tracking-create` | B | `initiated_at` (or `current_tier`/`due_at`) — presence, `current_tier` can be `1` | organic escalation reaching assign path; rollback on new `status:error` on `rrYXzE61…` |
| `get-round-robin-assignee` | A | `status_flags` (list) ∧ `is_working_hours` | same escalation; rollback on new `status:error` |
| `get-working-days` | A | `working_day_ranges` (list) ∧ `working_hours_start` | non-working-hours escalation branch; rollback on new `status:error` |

All 3 LOUD ⇒ arm a `status:error` rollback-watch on `rrYXzE61…` post-PUT; a 401 hard-fails and
surfaces. Positive 2xx is best-effort from an organic escalation. Optional safe re-proof: a **read**
probe bound to `crm-n8n-auth` (Family B `GET /sla-management/conversation-sla-tracking/dashboard`;
Family A the existing T0 `get-session-vars-http` GET) — never curl a raw key (LESSONS 14).

---

## Safety

**No egress of any kind originated by this change or this review.** The change alters how the 3 CRM
nodes authenticate, never whether/when/what they fire (§7). The `Assign or unassign` egress node, the
PIC sendmsg/comment sub-calls, the `test-guard` gate, the round-robin logic, and the SLA payload are
byte-identical in the body (proven by the masked residual delta), and the `respondIoApi` credential is
carried and asserted at checklist step 6. No assignment, SLA write, PIC comment, conversation-variable
write, contact mutation, or CRM create was originated. The sub was not executed and no escalation was
provoked.

**Reviewer actions were reads only:** MCP `get_workflow_details` ×1, local sha/jq/git over
`body.json`+`before.json`, READ-ONLY CRM source. No PUT, no publish, no execution, no webhook, no
redis, no CRM write.

**Not touched:** the fork `vUfFUDjLAuMaeQE6`, the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone
`txiPzSxy3Pclsz6v`, the T0–T3 already-converted workflows, `assert-auth.sh`, and every other workflow
on the instance. **The only live-instance mutation is one draft pointer moving; `activeVersionId`
unchanged, so production is bit-for-bit what it was.**

---

# VERDICT: **APPROVE** the reviewed body `T4-rrYXzE61gCNUck_zmXe-G-body.json` (sha `4b394c028cee…`, 33446 B).

Zero egress re-confirmed. Promotion remains **user-gated**: one PUT, one approval, one revert pointer
(`486c5c1a-…`). The reviewer authorises; the reviewer does not promote. Non-blocking follow-up: reconcile
the instance-wide G7 residual (task expects 1 remaining = T5 spine; coder's count = 2 = T5 + T1b) — a
bookkeeping item that does not affect these bytes or the promote.
