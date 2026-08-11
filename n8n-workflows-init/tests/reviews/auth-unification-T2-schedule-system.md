# REVIEW — auth-unification T2 · schedule + system (6 nodes, 4 workflows)

**Date:** 2026-07-21 · **Verdict: APPROVE the four reviewed bodies**, subject to 2 pre-PUT
conditions (§Conditions). Reviewer performed **reads only**: no workflow edited, no PUT sent, no
execution run, no webhook poked, no redis seeded. Two pre-existing executions were read
observationally (`9464991`, `9460930`).

---

## Byte identity — this review is valid ONLY for these bytes

All four sha256 and byte counts **re-computed by the reviewer** and matching the coder's table:

```
4575de7e3def71aad8950328eff4d597bc0cddf26df99dfb2cdf1cb4a78452a7   1688  T2-FfmDkEWdt3Bian82-body.json
28f53ecaa292748663982d4b8dd60c0c77bc9a98d4ffa335e9bded002e1b83fc  20917  T2-ss9S83XF7ZtmnaUyFtYZc-body.json
f30f5bf645af9af1d183aaf39f29575ab6754e5246258881887399e5235bdf91   9844  T2-7lFff6i_udSxyUbCMdTuD-body.json
3fec22ab81278d997199d8edb51a63fc5bbb9f771e500c65823c2da4e42c9cff   6377  T2-Srs08P0Ha3Cv--YPx0-Yn-body.json
```

**Any regeneration of any `body.json` VOIDS this approval for that workflow and requires
re-review.** The four are independent; regenerating one does not void the other three.

---

## 1 · The four drafts — verified through a DIFFERENT channel than the coder

The coder used REST. The reviewer used **MCP `get_workflow_details`**, diffing `.workflow` (draft)
against `.workflow.activeVersion` (published), per LESSONS 23.

| workflow | `versionId` (draft) | `activeVersionId` | active moved? |
|---|---|---|---|
| `FfmDkEWdt3Bian82` | `49d0c6d4-3150-4719-ae2f-3b0722a3d0eb` | `b6537382-117a-4470-8cb6-308913d4a385` | **NO** |
| `ss9S83XF7ZtmnaUyFtYZc` | `1f6d05b0-3926-4de2-98e7-98482fd159ce` | `665c26de-1b6b-4b45-a3e8-303303c2df96` | **NO** |
| `7lFff6i_udSxyUbCMdTuD` | `ca9d8766-77b5-4e71-87d4-4f42775f8dc8` | `26b8cc1a-9057-490b-ae26-15cc1689cec9` | **NO** |
| `Srs08P0Ha3Cv--YPx0-Yn` | `f4ffdcbd-12d2-4bf7-82b6-06f1910c27fa` | `7ee8307f-f4bc-4264-bb1d-c390539f8acb` | **NO** |

All eight pointers match the coder's recorded values exactly. **Production is bit-for-bit what it
was.**

Per workflow, draft vs `activeVersion`:

| check | result |
|---|---|
| nodes differing | exactly the 6 named targets, nothing else (1 / 2 / 2 / 1) |
| delta per differing node | exactly D1 + D2 + D4; every other node key identical |
| `onError` on the two `continueErrorOutput` nodes | preserved verbatim in the draft |
| `connections` draft vs active | **byte-identical, all four** |
| `settings` / `name` / `active` | untouched |
| stray `parameters.parameters.*` | **none** (LESSONS 32b clear ×4) |
| `pinData` / `staticData` | not sent in any body ⇒ preserved by merge |

### Strongest single result — masked residual delta

For each workflow I diffed `T2-<id>-before.json` (pre-change live) against `T2-<id>-body.json`,
having deleted **only** `parameters.authentication`, `parameters.genericAuthType`,
`parameters.headerParameters`, and `credentials.httpHeaderAuth` from every node:

```
FfmDkEWdt3Bian82        masked 1309 B both sides   residual delta: EMPTY
ss9S83XF7ZtmnaUyFtYZc   masked 20152 B both sides  residual delta: EMPTY
7lFff6i_udSxyUbCMdTuD   masked 9162 B both sides   residual delta: EMPTY
Srs08P0Ha3Cv--YPx0-Yn   masked 5850 B both sides   residual delta: EMPTY
```

⇒ **each PUT body equals the pre-change live workflow modulo exactly D1/D2/D3/D4 and nothing
else** — covering `id`, `type`, `typeVersion`, `position`, `onError`, `retryOnFail`, `disabled`,
`webhookId`, `jsonBody`, and `connections` on every node.

*Methodology note, recorded because it nearly produced a false pass:* my first attempt at this diff
used a malformed jq filter. Both sides came back **empty**, and `diff` dutifully reported "no
difference" — a green result from two empty files. The masked byte counts above are printed
precisely so the check cannot pass vacuously. This is the same class of defect I flag in the gate
below (§11).

### Scope — no blind spot, re-derived two ways

| workflow | nodes | httpRequest total | CRM-host | non-CRM | nodes carrying `x-api-key` (**any** node type) |
|---|---|---|---|---|---|
| `FfmDkEWdt3Bian82` | 2 | 1 | 1 | 0 | `healthcheck-callback` |
| `ss9S83XF7ZtmnaUyFtYZc` | 17 | 2 | 2 | 0 | `get-is-working-holiday`, `conversation-sla-tracking-create` |
| `7lFff6i_udSxyUbCMdTuD` | 8 | 2 | 2 | 0 | `conversation-sla-tracking-escalate1`, `get-due-escalations` |
| `Srs08P0Ha3Cv--YPx0-Yn` | 8 | 1 | 1 | 0 | `insert-message` |
| | | | **6** | **0** | **6** |

The two independent derivations agree at 6. Unlike T1 there is **no** non-CRM httpRequest node, so
the "CRM-host filter might be hiding something" question is closed by measurement.

---

## 2 · The four bodies

| check | result |
|---|---|
| top-level keys | exactly `connections, name, nodes, settings` ×4 |
| node counts | 2 / 17 / 8 / 8 — match live |
| credential bound | `httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` on all 6 targets, and on **no other node** |
| **occurrences of the literal CRM key** | **0 / 0 / 0 / 0** (grepped for the 32-char literal) |
| residual `x-api-key` string anywhere in body | **0 ×4** |
| `sendHeaders` | `true` preserved on all 6 (§3.2) |
| `settings` `del()` | correct — see below |
| `pinData` / `staticData` / `active` | **not sent** ×4 (correct; merged not replaced) |

### `settings` — verified against the live values, not the coder's table

| workflow | live `settings` | body `settings` | stripped |
|---|---|---|---|
| `FfmDkEWdt3Bian82` | `availableInMCP, executionOrder` | identical | *(nothing)* |
| `ss9S83XF7ZtmnaUyFtYZc` | `availableInMCP, binaryMode, callerPolicy, executionOrder, timeSavedMode, timezone` | `availableInMCP, callerPolicy, executionOrder, **timezone**` | `binaryMode`, `timeSavedMode` |
| `7lFff6i_udSxyUbCMdTuD` | `availableInMCP, binaryMode, executionOrder` | `availableInMCP, executionOrder` | `binaryMode` |
| `Srs08P0Ha3Cv--YPx0-Yn` | `availableInMCP, callerPolicy, executionOrder, timeSavedMode` | `availableInMCP, callerPolicy, executionOrder` | `timeSavedMode` |

Only the two OpenAPI-invalid keys are stripped anywhere. **`settings.timezone:
"Asia/Kuala_Lumpur"` is present in the `ss9S83` body** — confirmed in the bytes. It is
load-bearing: with `rule.interval = [{"triggerAtHour": 8}]` it is the sole reason the daily trigger
fires at 08:00 MYT rather than 08:00 UTC. Losing it would silently shift the workflow 8 hours.

### Collateral credentials — all pre-existing carried

Verified in the body bytes, not inferred:

| workflow | pre-existing carried | + new | **expected post-PUT bound-node count** |
|---|---|---|---|
| `FfmDkEWdt3Bian82` | *(none)* | 1 | **1** |
| `ss9S83XF7ZtmnaUyFtYZc` | `list-length`, `pop` (`redis=H5w6o7tptzTPMVdy`), `Assign or unassign a Conversation1` (`respondIoApi=OiS59QkzpKfKSdaa`) | 2 | **5** |
| `7lFff6i_udSxyUbCMdTuD` | `Assign or unassign a Conversation1` (`respondIoApi=OiS59QkzpKfKSdaa`) | 2 | **3** |
| `Srs08P0Ha3Cv--YPx0-Yn` | `Redis`, `Redis1` (`redis=H5w6o7tptzTPMVdy`) | 1 | **3** |
| **tranche** | **6** | **6** | **12** |

**Any of the 6 pre-existing bindings missing after a PUT → immediate rollback of that workflow.**
Note the two `respondIoApi` bindings are the respond.io assignment nodes — losing one is a
production egress-path outage, so this assertion is safety-relevant, not merely tidy.

---

## 3 · `insert-message` D4 — the tranche's easiest silent mistake · **CORRECT**

Confirmed in **both** channels, independently:

- **body bytes** (`T2-Srs08P0Ha3Cv--YPx0-Yn-body.json`):
  `parameters.headerParameters.parameters == [{"name":"X-Source","value":"n8n"}]`
- **MCP draft** (`Srs08P0Ha3Cv--YPx0-Yn` `.workflow.nodes`): same array. The `activeVersion` still
  carries `[{x-api-key, «REAL_KEY»}, {X-Source, "n8n"}]`, so exactly one entry was removed and the
  survivor is byte-identical.

All other five targets are `[]`, correctly. **Not `[]` on `insert-message` — verified, not
accepted.**

---

## 4 · PUT ORDER — **RATIFIED**, with one amendment

The coder's ordering argument is **confirmed from `connections`** (MCP, `Srs08P0Ha3Cv--YPx0-Yn`):

```
Schedule Trigger → Redis1 (LLEN) → Redis (POP sorento-respond-message)
                                 → If → output-parser → insert-message → Execution Data
```

The POP genuinely precedes `insert-message`, with no re-queue anywhere in the graph. A broken
publish therefore **permanently destroys every message arriving while broken**, at 5 s granularity.
"Loud" is not "recoverable" here. **`Srs08P0Ha3Cv--YPx0-Yn` goes LAST.** Ratified.

Order stands: `FfmDkEWdt3Bian82` → `ss9S83XF7ZtmnaUyFtYZc` → `7lFff6i_udSxyUbCMdTuD` →
`Srs08P0Ha3Cv--YPx0-Yn`.

**One session or spaced? — ONE staffed session, sequential, with a gate between each.** Rationale:
the parked-draft hazard (§12) is the dominant risk and it scales with wall-clock time, so spreading
four PUTs across days maximises exactly the wrong quantity. But the gate between them is not
optional:

- **Between PUTs, the STATIC assertions are blocking** (gate exact-match, collateral count,
  `settings` merge, `pinData`/`staticData`/`connections`/`name`/`active`, `versionId ==
  activeVersionId`). These are all immediate. Do not proceed on a red one.
- **DYNAMIC proof is blocking only for the canary.** Do not PUT #2 until a real
  `healthcheck-callback` execution has been read post-PUT (≈2×/hour, so ≤~35 min).
- Dynamic proof for #2's two nodes is up to 24 h away and **must not** block #3 or #4 — see §9.

**Amendment considered and rejected:** putting `7lFff6i_udSxyUbCMdTuD` first would give the fastest
unconditional runtime verdict (60 s, `get-due-escalations` runs every tick). Rejected because it is
the tranche's *silent* workflow and sits on the SLA escalation path — the wrong object to learn the
mechanism on. `FfmDkEWdt3Bian82` stays the canary: 2 nodes, zero pre-existing credentials, LOUD
failure, and (see §8) **both** of its outcome branches are positive auth evidence.

---

## 5 · Silent vs loud — **RE-DERIVED INDEPENDENTLY, COder CONFIRMED**

Derived by the reviewer from MCP `connections`, not inherited:

| node | `onError` | `connections[node].main` length | verdict |
|---|---|---|---|
| `get-due-escalations` | `continueErrorOutput` | **1** (`main[0] → Split Out`) | 🔇 **SILENT** |
| `conversation-sla-tracking-escalate1` | `continueErrorOutput` | **1** (`main[0] → Call 'sub-add-comment-respond'`) | 🔇 **SILENT** |
| `get-is-working-holiday` | unset | 1 | LOUD |
| `conversation-sla-tracking-create` | unset | 1 | LOUD |
| `healthcheck-callback` | unset | 1 | LOUD |
| `insert-message` | unset | 1 | LOUD (and **lossy**) |

Confirmed: `search_executions(status:["error"])` is **blind** to `7lFff6i_udSxyUbCMdTuD`'s two
nodes. A 401 on `get-due-escalations` routes to an unwired output; the execution reports `success`;
**SLA escalations stop silently behind a green execution list.**

### RULING — verification required for `schedule-sla-policy-checker`

The blind spot makes positive verification **more** urgent, not excusable. I draw a sharp line
between the two silent nodes:

- **`get-due-escalations` — MUST be positively verified, within 5 minutes of its PUT.** It runs
  unconditionally every 60 s, so a verdict is always obtainable. Assert
  `runData["get-due-escalations"][0].data.main[0][0].json` **has** `count`. Failure to obtain that
  evidence within 5 minutes is a **rollback trigger**, not an "unverified". Absence of errors is
  **not** evidence here and may not be recorded as such.
- **`conversation-sla-tracking-escalate1` — may be recorded UNVERIFIED.** §5.3 forbids provoking it
  and there is no non-provoking way to force it. Never fire it. If a genuine due escalation occurs
  in the watch window, read that execution and apply §5.2; otherwise record UNVERIFIED and carry it
  forward. **Never infer it from `get-due-escalations` passing** — they are different endpoints on
  different routers.

Also carried forward, untouched and outside auth scope, recorded so the tester does not read it as
evidence in either direction: `7lFff6i_udSxyUbCMdTuD › Assign or unassign a Conversation1` uses
`continueRegularOutput` — it emits a fake success item, so a failed assignment is
indistinguishable from a successful one.

---

## 6 · §5.2 acceptance — **SUFFICIENT**, including the weak node

**Group A (5 nodes) — accepted as proposed.** Keys `count` · `escalated` · `is_working_day` ·
`already_active` · `id`, each with `error` ABSENT.

**The two falsy-value traps are correctly identified and are binding.** `count: 0` (the common
"nothing due" case) and `escalated: false` (the already-at-tier-3 short-circuit) are legitimate 200
values. Mechanically, the tester must use **presence** predicates:

```
main[0][0].json | has("count")      == true
main[0][0].json | has("escalated")  == true
main[0][0].json | has("error")      == false
```

⚠️ Do **not** write these as `.count // "NULL"` or any truthiness form. That exact null-check idiom
is a recorded landmine in this repo and would convert the tranche's most common success case into a
false failure on the SLA path — the one workflow where a false signal is most expensive.

**Group B (`healthcheck-callback`) — the T1 precedent MAY be inherited without re-argument.**
Ruled sufficient on four grounds, three of which I verified myself:

1. **Same endpoint, same handler, same literal** as T1's 17 callbacks — it is the identical object,
   not an analogous one. No new argument is owed.
2. **Empirically re-confirmed by the reviewer.** Execution `9460930` (pre-change),
   `healthcheck-callback` `main[0][0].json` is exactly
   `{"status":"success","message":"Integration log updated successfully."}`, no `error` key. The
   3-part conjunction is grounded in measurement.
3. **The loud-failure backstop is real.** Execution `9464991` shows the node erroring with
   `executionStatus: "error"` and the whole execution `status: "error"`. `onError` is unset, so
   `search_executions(status:["error"])` is a genuinely valid backstop *for this node* (unlike the
   two in §5).
4. **T2's Group B is materially STRONGER than T1's** — see §8. Both of this node's outcome branches
   yield positive auth evidence, so it produces a verdict on ~100% of its invocations rather than
   only the ~50% that succeed.

The semantic trap stands and must be restated wherever this is recorded: `status: "success"`
describes **the HTTP callback**, never the health of anything.

---

## 7 · G7 — coder's conclusion **RATIFIED**, with a plan amendment

**The census is draft-measured and must not be read as promote evidence.** I have direct proof
rather than an inference: MCP shows all four **drafts** with `headerParameters.parameters` already
stripped, while all four `activeVersion`s still carry the literal key — with nothing published. A
census over `GET /workflows` reads drafts, so it already moved 19 → 13 at MCP-edit time.

Published-state evidence is **`versionId == activeVersionId` plus G3=true**, exactly as the coder
states. Ratified.

**Expected post-tranche census: 13** — i.e. **unchanged across all four PUTs.** That non-movement
is the pre-declared expectation and must not be read as a failed promote. Decomposition (3+3+2+2+1+1
for T3/T4/T5 = 12, plus 1 for T1b) is arithmetically consistent with §5.1's corrected
"19 = 18 + 1".

**Correction to add to the plan:** because the fall was consumed at draft time, G7's binding rule
*"must fall by exactly the tranche's node count"* is **untestable post-PUT for T2**. What survives
post-PUT is only the weaker half — *"must not rise, and must read 13."* State that explicitly so a
later reader does not mistake a flat census for a broken promote.

**Improvement for T3+:** LESSONS 23 (corrected) establishes that MCP returns an
`activeVersion: {nodes, connections}` block. A **published-state** census is therefore
constructible, and G7 should be measured against `activeVersion` from T3 onward. That restores the
metric's meaning instead of documenting its ambiguity a second time.

---

## 8 · Pre-existing 404 noise — **CONFIRMED**, and it is better news than the coder claims

Confirmed by the reviewer from execution `9464991` (`2026-07-21T15:21:21Z`, **pre-change** —
the node still shows `authentication: "none"` and the literal `x-api-key`):

```
httpCode  404
code      NOT_FOUND
message   "Integration Log not found. Someone might have deleted it already."
uri       .../integration-logs/4d6f91cf-7b7b-4281-8d36-63fa892bab20/status
UA        Sorento-CRM/1.0.0
```

**Distinguishing rule, explicit and binding — discriminate on `httpCode`, never on the presence of
errors:**

| post-PUT `runData["healthcheck-callback"][0]` | reading |
|---|---|
| `executionStatus: success`, `main[0][0].json` = the 3-part Group B envelope | ✅ auth resolved |
| `error.httpCode == "404"` + `code: NOT_FOUND` | ✅ **status quo AND positive auth evidence** — see below |
| `error.httpCode == "401"` or `"403"` | 🚨 **REGRESSION → roll back immediately** |
| any other httpCode | investigate before proceeding |

**Why a 404 is positive evidence:** the CRM applies
`dependencies=[Depends(require_module_enabled_with_api_key("base"))]` at the
`/integration-management/integration-logs` router prefix, and FastAPI evaluates router dependencies
*before* the path handler. A response body of `"Integration Log not found"` therefore proves the
request **got past the api-key dependency**. The 404 half of this node's traffic is not noise to be
tolerated — it is a second, independent proof that the credential resolved. This is what makes the
canary produce a verdict on essentially every invocation.

**Required before PUT #1:** capture a baseline 404-vs-2xx count over a fixed window (the coder
observed two distinct callers — the `:34`-past ones succeed, the `:21` ones 404) so post-PUT rates
are comparable rather than impressionistic.

---

## 9 · Verification timing — RULING on what gates T3

The coder's plan correction is **accepted**: §4 T2's "verify within minutes" is wrong for two of
four. Confirmed from MCP — `ss9S83XF7ZtmnaUyFtYZc`'s trigger is `{"interval":[{"triggerAtHour":8}]}`
with `settings.timezone: Asia/Kuala_Lumpur`, i.e. **once daily at 08:00 MYT**; and
`FfmDkEWdt3Bian82` is webhook-poked by the CRM watchdog on someone else's clock.

I also correct one detail: `conversation-sla-tracking-create` is **doubly** gated, not singly. From
`connections`: `if-is-working-day` → `list-length` → `if-queue-not-empty` → `pop` → … → `If1`
(`conversation_assignee_id` notExists) → `conversation-sla-tracking-create`. Its probability of
firing on any given daily tick is materially lower than "daily". This strengthens, not weakens, the
coder's point.

**RULING — separate "T3 may start" from "T2 is signed off". They are different bars.**

**T3 may start once ALL of the following hold:**
1. All four PUTs landed; all four static post-PUT assertion sets green (gate exact-match,
   collateral counts 1/5/3/3, `settings` merge, preservation, `versionId == activeVersionId`).
2. Runtime proof from the three fast-reachable nodes: `healthcheck-callback` (≈2×/hour),
   `get-due-escalations` (60 s, **mandatory** per §5), `insert-message` (find an execution where it
   actually **has** `runData` — most 5 s polls are empty and prove nothing; LESSONS 46).

**T3 must NOT be blocked on** `get-is-working-holiday`, `conversation-sla-tracking-create`, or
`conversation-sla-tracking-escalate1`. Waiting up to 24 h for a daily trigger would extend the
parked-draft-adjacent risk window across T3 for no gain.

**But T2 CANNOT BE SIGNED OFF until the next 08:00 MYT tick has been read.** These are recorded as
**trailing obligations with a named deadline and an owner**, never as inference from a clean static
diff (LESSONS 54):

| trailing obligation | deadline | if not met |
|---|---|---|
| `get-is-working-holiday` runData carries `is_working_day` | next 08:00 MYT tick | 🚨 escalate — see below |
| `conversation-sla-tracking-create` runData carries `already_active` | next 08:00 MYT tick | record **UNVERIFIED** (gate may legitimately not open) |
| `conversation-sla-tracking-escalate1` runData carries `escalated` | end of watch window | record **UNVERIFIED**; never provoke |

⚠️ **`get-is-working-holiday` is the FIRST node after the trigger** of that workflow
(`Schedule Trigger → get-is-working-holiday → if-is-working-day → …`) and it is LOUD. If it 401s,
the *entire* daily workflow dies at node 1 — no working-day detection, no queue drain, no PIC
routing, no SLA tracking — **once per day, at 08:00, with nobody watching.** Its trailing obligation
is not bookkeeping. Diarise the 08:00 MYT read explicitly and treat a miss as an escalation, not a
shrug.

---

## 10 · Pre-declared gate output — **AMENDED** (this is Condition 1)

`RESULT: FAIL ×4` pre-PUT, sole cause `G3=false`, is **correct and expected**. G3 asserts D3, which
is the PUT; there is no intermediate state in which it could pass. No exclusions, no `HEADER-DRIFT`,
residual `NONE ×4` — the pre-PUT signature is uniform and minimal, and I confirm the coder's reading
of it.

**The coder's pre-declared post-PUT block is incomplete: it omits two lines the instrument will
actually print** (the phantom exclusion block, §11). Under §5.1's *exact expected-output match*
acceptance, an expected-output block that omits emitted lines is itself a defect — it either raises
a false alarm at the worst moment or trains the reader to skim past the gate's output, which is the
failure mode §5.1 exists to prevent.

**Corrected pre-declared post-PUT output, per workflow, to be matched EXACTLY** (N = 1, 2, 2, 1
respectively):

```
== <workflow name> (<id>)
   versionId=<V>  activeVersionId=<V>
   draft == active (published)
   EXCLUDED from G1-G4/G5/G5b (deliberate, held to a later tranche):
     - 

-- G1-G4 (per node: authentication / genericAuthType / credential / no x-api-key)
   PASS -- all N CRM nodes satisfy G1-G4

-- G5 no-rider (only authentication / genericAuthType / headerParameters changed)
   PASS -- no out-of-scope key changed on any node

-- G5b headerParameters: only the x-api-key entry removed
   PASS -- non-x-api-key headers preserved verbatim

-- G6 no-collateral (node set, connections)
   PASS -- node-name set identical
   PASS -- connections byte-identical

-- residual hardcoded x-api-key in this workflow: NONE

RESULT: PASS
```

The two `EXCLUDED …` / `- ` lines are **expected artefacts of a known cosmetic defect** and are not
a real exclusion. Any deviation from the above — including a *missing* phantom line, which would
mean the instrument changed mid-tranche — is a REQUEST-CHANGES / rollback trigger.

T2 is the first tranche able to print `RESULT: PASS`, because it excludes nothing.

---

## 11 · Gate defect — restraint **RATIFIED**, plus a second, more serious defect

**Coder's cosmetic defect: confirmed, reproduced in isolation.**

```
EXCLUDES=(); printf '%s\n' ${EXCLUDES[@]+"${EXCLUDES[@]}"} | jq -R . | jq -s .
  →  [""]        length 1   ⇒ the block prints with a blank entry
index("healthcheck-callback") → null   ⇒ genuinely inert, no node is excluded
```

**Declining to fix it mid-tranche is RATIFIED**, per the T1 ruling: editing the assertion instrument
during the tranche it judges destroys its independence, and freezing it across the PUT is what makes
the before/after runs comparable. The correct handling is exactly what the coder did — document it
and put it in the expected output (§10, Condition 1).

### ⚠️ NEW FINDING — G5 and G5b can report PASS on a broken jq (latent false-pass)

`assert-auth.sh` lines 108 and 122 both end their jq with `2>/dev/null || true`, and lines 109/123
then treat **empty output as PASS**. So any jq failure — malformed `before.json`, an unreadable
file, a future edit with a syntax error — silently yields `PASS -- no out-of-scope key changed on
any node`. **The gate cannot distinguish "nothing changed" from "the check did not run."**

This is more serious than the cosmetic defect, and it is not hypothetical: I hit precisely this
failure mode in my own residual-delta check (§1) and only caught it because I printed the input
sizes. A rider-detection gate that fails open is the same class of instrument error as LESSONS 45's
LLEN gate — *it can report PASS while the thing it guards against occurred.*

**For T2 this is mitigated, but not by the gate:** I reproduced G5/G5b's substance independently via
the masked residual-delta diff, with non-zero byte counts printed on both sides, EMPTY on all four.
G5/G5b's green rows are therefore **corroborated, not trusted**.

**Deferred fix list for the post-T2 gate micro-change** (its own review, before T1b), now three
items:
1. `[ ${#EXCLUDES[@]} -eq 0 ] && EXCL_JSON='[]' || EXCL_JSON=…` — the phantom exclusion.
2. **Remove `2>/dev/null || true` from G5/G5b; make a jq failure a hard FAIL, and assert the input
   parsed** (e.g. non-zero node count on both sides) before reporting PASS.
3. The outstanding `jq -n` missing-`-r` cosmetic carried from T1.

---

## 12 · Parked-draft hazard — **24 hours**, not T1's 72

Four armed, non-functional drafts on **ACTIVE, self-firing** workflows. Any publish of any of them,
for any reason, ships credential-less nodes into a path that executes within **5 seconds**
(`redis-consume-queue-mongo`), **60 seconds** (`schedule-sla-policy-checker`), or on the next
watchdog poke. T1's drafts sat on a workflow driven by external uploads; these drive themselves.

**Maximum parking window: 24 hours from 2026-07-21, or until any of the four `activeVersionId`s
moves, whichever is first.** T1's 72 h does not transfer — the hazard is qualitatively different.

**Roll back (§4.10) immediately if:**
1. Any of the four workflows must be published for an unrelated reason.
2. Any of the four `activeVersionId`s moves off its recorded value → **re-baseline that tranche
   member, do not reconcile.**
3. Any of the four `versionId`s moves off its recorded draft pointer → **that `body.json` is
   VOID**; regenerate and re-review that workflow only.
4. The 24 h window expires.

**Additional binding rule specific to T2: do not leave the sequence half-done.** If PUTs 1–2 land
and 3–4 do not, two workflows are converted and two carry armed drafts — the worst state available,
and it persists unattended. Either complete all four or roll back the ones already landed.

Rollback while nothing is published needs **no publish** — re-apply per node from
`T2-<id>-nodes-before.json`, remembering `insert-message`'s array has **two** entries.

---

## 13 · PROMOTE CHECKLIST — user-gated, ordered, per workflow

**Before starting (once):**

- **A.** Capture the `system-healthcheck-ping` 404-vs-2xx baseline over a fixed window (§8).
- **B.** Confirm a staffed window with the four rollback pointers to hand:
  `b6537382-…` / `665c26de-…` / `26b8cc1a-…` / `7ee8307f-…`.
- **C.** Amend the pre-declared expected gate output to §10's corrected block (**Condition 1**).

**Then, per workflow, in this order — `FfmDkEWdt3Bian82` → `ss9S83XF7ZtmnaUyFtYZc` →
`7lFff6i_udSxyUbCMdTuD` → `Srs08P0Ha3Cv--YPx0-Yn`:**

1. **§4.6 re-diff immediately before the PUT.** HALT if `activeVersionId` ≠ that workflow's recorded
   pointer; or `versionId` ≠ its recorded draft pointer; or the differing-node set is not exactly
   its 1/2/2/1 named targets; or any delta exceeds D1/D2/D4.
2. **Re-verify that file's sha256 and byte count** against §Byte identity. Mismatch → **stop; that
   workflow's review is void.**
3. **One PUT, bytes unmodified:** `--data-binary @T2-<id>-body.json`. Binds D3 and publishes in the
   same operation. Do not hand-edit, re-serialise, or pipe through `jq`.
4. **Capture** `GET → T2-<id>-after.json` (gitignored — verified).
5. **Collateral assertion (LESSONS 55):** expected bound-node count **1 / 5 / 3 / 3**. Enumerate and
   confirm every pre-existing binding survives — in particular both `respondIoApi=OiS59QkzpKfKSdaa`
   bindings and all four `redis=H5w6o7tptzTPMVdy`. **Any loss → roll back that workflow
   immediately.**
6. **Preservation:** `binaryMode == "separate"` on `ss9S83` + `7lFff6i`; `timeSavedMode == "fixed"`
   on `ss9S83` + `Srs08P0`; **`timezone == "Asia/Kuala_Lumpur"` on `ss9S83`**; `pinData` /
   `staticData` / `name` / `active` / `connections` / node-id set unchanged;
   `versionId == activeVersionId`.
7. **Gate:** `./assert-auth.sh <id> T2-<id>-before.json` (no `--exclude`) → **exact match** against
   §10's corrected block, including the two phantom-exclusion lines. Note G5/G5b are corroborated by
   step 6, not trusted alone (§11).
8. **Rollback trigger:** any failure at 5–7 → `publish_workflow` that workflow's prior
   `activeVersionId`. Single pointer move. Expect a dirty draft afterwards.
9. **Gate to the next PUT:** static steps 5–7 green. **Plus, for PUT #1 only:** read a real
   post-PUT `healthcheck-callback` execution and confirm a 2xx (3-part Group B conjunction) **or** a
   `404/NOT_FOUND` — either proves auth. A `401`/`403` → roll back and stop the tranche.
   **Plus, for PUT #3 only:** within 5 minutes, assert `get-due-escalations` runData carries
   `count` (presence). Not obtainable → rollback (§5).
10. **`Srs08P0Ha3Cv--YPx0-Yn` (#4) — heightened watch.** Immediately post-PUT, find an execution
    where `insert-message` actually **has** `runData` (most 5 s polls are empty and prove nothing)
    and assert `has("id")` + `has("error") == false`. Any error → roll back at once; every 5 s of
    delay is permanently lost chat history.

**Trailing obligations (do not block T3; do block T2 sign-off) — §9:** the 08:00 MYT read of
`get-is-working-holiday` (escalate if missed) and `conversation-sla-tracking-create`; and the
observational-only watch for `conversation-sla-tracking-escalate1`, **never provoked**.

**Post-promote watch:** `search_executions(status:["error"])` is valid for `FfmDkEWdt3Bian82`,
`ss9S83XF7ZtmnaUyFtYZc`, and `Srs08P0Ha3Cv--YPx0-Yn` — and **void for
`7lFff6i_udSxyUbCMdTuD`**, where per-node `runData` is the only instrument.

**Then separately:** the `assert-auth.sh` micro-change (three items, §11) → its own review → T1b.

---

## Conditions

1. **Amend the pre-declared post-PUT expected gate output to §10's block**, including the two
   phantom-exclusion lines. Documentation-only; does not touch the reviewed bytes. **Must be done
   before PUT #1** — otherwise the tranche's exact-match acceptance is being run against a block
   known not to match.
2. **Record the G5/G5b fail-open defect (§11) in the deferred gate micro-change list** before T3, so
   the instrument is repaired before the tranche with 8 nodes across 4 more live workflows relies on
   it. Non-blocking for T2, whose G5/G5b results I corroborated independently.

Neither condition affects the four `body.json` files. **The bytes are approved as they stand.**

---

## Minor / non-blocking

- **Pre-existing broken node reference (LESSONS 5), `ss9S83XF7ZtmnaUyFtYZc`:**
  `Code in JavaScript` (on `If1`'s FALSE branch) evaluates
  `$('Execute a SQL query').first().json.pic_respond_user_id` — **no node named `Execute a SQL
  query` exists in the workflow**. It would throw if that branch ever ran. Pre-existing, in the
  active version, untouched by T2. Recorded so the tester does not misattribute it post-PUT, and
  flagged as worth its own ticket.
- The coder describes `conversation-sla-tracking-create` as gated behind `If1`; it is gated behind
  `if-is-working-day` → `if-queue-not-empty` → … → `If1`. Strengthens the coder's own point.
- Pre-existing validation warning on `redis-consume-queue-mongo › Analyze document` (googleGemini,
  **disabled**) is correctly untouched (LESSONS 13).
- The `conversation-sla-tracking-create` 307-redirect note is a reasonable low-risk recording. I
  confirm from execution `9464991`'s request context that n8n sets `followRedirect: true`,
  `followAllRedirects: true`, and `sendCredentialsOnCrossOriginRedirect: true` — same-host, same
  injection point. Worth a glance on that node's first post-PUT run, not a blocker.
- All six plan corrections raised by the coder are **accepted**, with the amendments in §7
  (G7 measurement channel) and §9 (T3-start vs T2-signoff).

---

## Secret hygiene — verified, not trusted

- `git check-ignore -q` run per file: all four `body.json`, all four `before.json`, all four
  `nodes-before.json` → **IGNORED**.
- Repo scan for the 32-char literal used
  `find . -path ./.git -prune -o -type f -print | xargs grep -l` (**`grep -rl` gives false negatives
  in this repo**). 18 files contain it; **all 18 are gitignored.** Beyond the auth-unification
  backups these are `scratchpad/clone.json`, `scratchpad/clone2.json`, `scratchpad/rev4/clone_final.json`,
  and `tests/reviews/backups/promote-20260716/step2/clone.node.family-fetch.json` — pre-existing,
  correctly ignored, recorded for awareness.
- `git log -S<key> --all` → **empty. The key was never committed.**
- **0 occurrences of the literal in any of the four `body.json`.**

---

## Safety

**No egress originated by this change or by this review.**

- None of the six converted nodes sends a WhatsApp message or comment to a respond.io contact. All
  six are CRM HTTP calls; the change alters **how they authenticate**, never **whether or when they
  fire**.
- The two respond.io assignment nodes in scope-adjacent position
  (`ss9S83XF7ZtmnaUyFtYZc` and `7lFff6i_udSxyUbCMdTuD` › `Assign or unassign a Conversation1`) are
  **byte-identical** in every body — proven by the masked residual delta, which would have surfaced
  any change to them. Their `respondIoApi` credentials are carried and are asserted at checklist
  step 5.
- `conversation-sla-tracking-escalate1` — the one node whose success triggers a staff ripple — was
  **not provoked** by the coder and must not be by the tester (§5.3). Verification is observational
  only.
- No conversation-variable write, contact mutation, or CRM record create was originated.
- Reviewer actions were reads only: 4 × MCP `get_workflow_details`, 2 × `get_execution` on
  **pre-existing** executions (`9464991`, `9460930`), and local file/jq/git operations. No PUT, no
  publish, no execution, no webhook, no redis.
- **Not touched:** the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone `txiPzSxy3Pclsz6v`, the fork
  `vUfFUDjLAuMaeQE6`, `system-upload-attachments` `_NbFU3cCoEQwPSbvn14vV`, and every other workflow
  on the instance.

**All four `activeVersionId`s are unchanged. Production is bit-for-bit what it was.**

---

# VERDICT: **APPROVE** the four reviewed bodies, subject to Conditions 1–2.

Promotion remains **user-gated**: four PUTs, four independent approvals, four independent reverts.
The reviewer authorises; the reviewer does not promote.
