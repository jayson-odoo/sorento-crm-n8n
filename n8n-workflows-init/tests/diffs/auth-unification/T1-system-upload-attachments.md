# T1 — CRM auth unification, `system-upload-attachments` (21 of 22 nodes)

**Change-id:** auth-unification-T1-system-upload-attachments
**Date:** 2026-07-21
**Plan:** `n8n-workflows-init/plans/crm-auth-unification-plan.md` — §3 (D1–D4), §3.3, §4 T1, §4.2, §4.6,
§4.7 (AMENDED), §4.9 (AMENDED), §4.10, §5.1, §5.2 (ACCEPTANCE CLAUSE REWRITTEN)
**Recipe:** `T0-clone-fork.md` (validated), `assert-auth.sh` (gate)

| workflow | id | trigger | total nodes | CRM nodes | converted |
|---|---|---|---|---|---|
| `system-upload-attachments` | `_NbFU3cCoEQwPSbvn14vV` | `Webhook` + `When Executed by Another Workflow` | 50 | 22 | **21** |

**This is a LIVE, `active: true` production workflow.** No respond.io egress anywhere in it.

---

## ✅ STATUS: PROMOTED 2026-07-21T15:02:52Z — PUT sent, D3 bound, published. Left in production.

**Superseded the DRAFT-ONLY status below.** The user-gated PUT was executed per the review's
§PROMOTE CHECKLIST steps 1–10. No rollback.

| | |
|---|---|
| PUT at (UTC) | `2026-07-21T15:02:52Z` |
| HTTP status | **200** |
| sha256 of pushed bytes | `f95062be7e4a0a5e859b564448709373308c38bb3e852a69b1bbd79464d6c995` (84,287 B — re-verified immediately pre-PUT, unmodified, `--data-binary`) |
| `activeVersionId` **prior** | `b0e3dbeb-d4a3-42bd-9ef6-3771767af41c` |
| `activeVersionId` **new** | `1f844cc5-7245-4c44-ba68-7adeb29649cb` |
| `versionId` new | `1f844cc5-7245-4c44-ba68-7adeb29649cb` — **draft == active, no dirty draft** |
| rollback pointer if ever needed | `publish_workflow` → `b0e3dbeb-d4a3-42bd-9ef6-3771767af41c` |

**Checklist results**

| step | result |
|---|---|
| 1 · §4.6 pre-flight re-diff | PASS — `activeVersionId=b0e3dbeb…`, `versionId=a28d4ee4…`, differing set **exactly the 21** named nodes, every delta masked-residual-equal (confined to D1/D2/D4), zero non-`parameters` field diffs, node-id set 50/50 identical |
| 2 · sha re-verify | PASS — sha and size both exact |
| 3 · one PUT, bytes unmodified | PASS — single `PUT --data-binary`, HTTP 200 |
| 4 · capture `after.json` | PASS — gitignored (`*-after.json`) |
| 5 · collateral credentials | PASS — **29 bound** = 7 × `googlePalmApi=fr3jSAU1JR6Ioobn` + 1 × `pdfapihubApi=It527CvGZPUoKIgV` + 21 × `httpHeaderAuth=mNsZWyU82NYV58k2`. All 8 pre-existing survived |
| 6 · preservation | PASS — `settings.binaryMode == "separate"` (merge-not-replace re-proven), `pinData` 2 keys identical, `staticData` identical, `name`/`active` unchanged, `connections` hash `e885577…` unchanged, node-id set unchanged, `versionId == activeVersionId` |
| 7 · gate | PASS on exact expected-output match — see below. **One deviation: the G7 literal `53 → 32`** (see G7 note) |
| 8 · rollback | **not triggered** |

**Independent confirmation the reviewed artifact is what executes:** `body.json` vs `after.json`
compared over `{parameters, credentials, type, typeVersion, position, onError, retryOnFail, disabled}`
for all 50 nodes → **differing nodes: `[]`**; `name` and `connections` equal. The server stored the
reviewed bytes verbatim.

**Gate output — actual == expected**, one G1–G4 FAIL row (`integration-log-update3`, all-false),
zero other FAIL rows, exactly one `HEADER-DRIFT` on that same node, residual == that node, G5 / G5b-scope
/ G6 PASS, `draft == active (published)`. Positive (not inferred) assertion over the 22 CRM nodes:
**`all4_true = 21`, `G3_true = 21`**, `all4_false = ["integration-log-update3"]`. The only surviving
`x-api-key` value anywhere in the workflow is the literal `"test"` — **the real CRM key is now absent
from this workflow entirely.**

Cosmetic: the `HEADER-DRIFT` line renders JSON-quoted because the script's `jq -n` lacks `-r`. Script
artifact, deterministic, same node — not a state difference. Fold into the `--exclude` micro-change.

### ⚠️ G7 census — the checklist's `53 → 32` is stale arithmetic; the normative rule PASSES

Measured instance-wide non-archived count after T1: **19, not 32.** Reconciled, not waved through:

```
plan §0.2 baseline                          53
  − T0 (clone 10 + fork 3, already landed)  −13
  − T1 (this tranche)                       −21
                                          =  19   ← measured
```

`53 → 32` was computed as `53 − 21`, which double-counts T0's 13 as still outstanding. Per-workflow
counts match plan §0.2 **exactly** for all 10 untouched in-scope workflows (3,3,2,2,2,2,1,1,1,1 = 18)
— **none rose** — plus this workflow's 1. §5.1's binding G7 rule is *"must fall by exactly the
tranche's node count and never rise"*: 22 → 1 locally, 40 → 19 instance-wide, **a fall of exactly 21.**
The rule passes; only the pre-declared literal was wrong. **Not treated as a rollback trigger** — it is
a documentation arithmetic error, carrying no evidence about the published state. Flagged for reviewer
ratification; T2's expected G7 should be derived from **19**.

---

## ⏸ (SUPERSEDED — historical) STATUS: DRAFT ONLY — D1/D2/D4 applied, D3 NOT applied, NOT published, NO PUT sent.

Per §4.7 as amended + LESSONS 55: on a live workflow **a REST PUT is the promote**, and REST PUT is
the only way to bind a generic-auth credential (MCP `setNodeCredential` is whitelist-blocked). So
this tranche deliberately stops one step short. The handoff artifact is the draft **plus the exact
bytes of the PUT body**, both for review; the PUT itself is user-gated.

| version pointer | value |
|---|---|
| `activeVersionId` **before and now** (unchanged) | `b0e3dbeb-d4a3-42bd-9ef6-3771767af41c` |
| `versionId` before this work | `b0e3dbeb-d4a3-42bd-9ef6-3771767af41c` (**draft == active — clean, no pre-existing draft**) |
| `versionId` now (draft carrying D1/D2/D4) | `a28d4ee4-daf7-4c0c-8622-23eacdb16dc1` |

Because the workflow was **clean before this work** (`versionId == activeVersionId`), every draft
divergence is attributable to T1 and nothing is riding along (LESSONS 24/51 rider hazard: none).

⚠️ **The draft is currently non-functional and MUST NOT be published as-is.** D1+D2 without D3 makes
n8n demand a credential that is not bound; publishing now would break all 21 nodes. Active is
untouched and continues to serve production. If T1 is not completed promptly, roll the draft back per
§4.10 rather than leaving it parked as a publish rider.

---

## §4.9 backup

| artifact | path | gitignored |
|---|---|---|
| full REST GET, pre-change | `T1-_NbFU3cCoEQwPSbvn14vV-before.json` | ✅ verified via `git check-ignore` (`*-before.json`) |
| per-node `{name,id,type,typeVersion,onError,retryOnFail,position,parameters,credentials}` for all 22 CRM nodes | `T1-_NbFU3cCoEQwPSbvn14vV-nodes-before.json` | ✅ (`*-before.json`) |
| the PUT body for the gated promote | `T1-_NbFU3cCoEQwPSbvn14vV-body.json` | ✅ added `*-body.json` to the directory `.gitignore`, verified via `git check-ignore` |

⚠️ `-before.json` and `-nodes-before.json` contain the **literal live CRM key** (22 unconverted nodes
at capture time). Never commit. `body.json` was checked and contains **0 occurrences** of the real
key (all 21 converted; `integration-log-update3` retains only the literal string `test`) — it is
gitignored anyway.

---

## The delta — D1/D2/D4 applied, D3 deferred to the gated PUT

| # | change | path / mechanism | applied here? |
|---|---|---|---|
| D1 | `parameters.authentication = "genericCredentialType"` | MCP `setNodeParameter` `/authentication` | ✅ 21/21 |
| D2 | `parameters.genericAuthType = "httpHeaderAuth"` | MCP `setNodeParameter` `/genericAuthType` | ✅ 21/21 |
| D3 | `credentials.httpHeaderAuth = {id:"mNsZWyU82NYV58k2", name:"crm-n8n-auth"}` | **REST PUT** (staged in `body.json`) | ⏸ **NOT applied — user-gated** |
| D4 | drop the `x-api-key` entry from `headerParameters.parameters[]` | MCP `setNodeParameter` `/headerParameters/parameters` = `[]` | ✅ 21/21 |

**All 21 target nodes carried exactly one header (`x-api-key`) and nothing else**, so D4's surviving
array is `[]` for every one — unlike T0, there is no `Content-Type` to preserve on this workflow.
`sendHeaders` left `true` throughout (§3.2).

**Ops issued:** one atomic `update_workflow` call, **63 `setNodeParameter` ops** (21 × 3), all
applied. Zero `renameNode`, zero connection ops, zero position changes, zero `addNode`.
Response reported **`autoAssignedCredentials: []`** — no stray auto-binding (LESSONS 47 did not fire;
consistent with T0's finding that that path is `addNode`-only).

---

## Node changes

All 21 were, before: `authentication` unset, `genericAuthType` unset, **no credential block at all**,
`headerParameters.parameters = [{name:"x-api-key", value:"«REAL_KEY»"}]`, `sendHeaders: true`,
`sendBody: true`, `method: POST`, `typeVersion 4.3`.

### Group A — business writers (4)

| node | endpoint | onError (preserved) | retryOnFail | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|---|---|
| `packing-list-insert` | `POST /api/v1/external/packing-lists` | `continueErrorOutput` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `technical-attachments-create` | `POST /api/v1/external/product-attachments` | `continueErrorOutput` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `forms-insert` | `POST /api/v1/external/forms` | `continueErrorOutput` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `promotion-create` | `POST /api/v1/external/promotions` | `continueErrorOutput` | true | ✅ | ✅ | `[]` | ⏸ PUT |

### Group B — status callbacks (17)

All hit `POST /api/v1/integration-management/integration-logs/{{ $('Webhook').first().json.body.integration_log_id }}/status`.
All `onError` unset (default `stopWorkflow`).

| node | retryOnFail | D1 | D2 | D4 | D3 |
|---|---|---|---|---|---|
| `integration-log-update-successful` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-successful3` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-successful4` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-successful5` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update1` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update4` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update5` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update6` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update7` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update8` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update10` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update11` | **false** | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update12` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update14` | true | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-promotion-fail` | **false** | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-download-fail` | **false** | ✅ | ✅ | `[]` | ⏸ PUT |
| `integration-log-update-packinglist-ai-fail` | **false** | ✅ | ✅ | `[]` | ⏸ PUT |

`retryOnFail` variance is **pre-existing and preserved verbatim** — asserted by G5, not assumed.

### Excluded — `integration-log-update3` (tranche T1b)

**Untouched, byte-identical, asserted.** Still `authentication` unset, `genericAuthType` unset, no
credential, `headerParameters.parameters = [{name:"x-api-key", value:"test"}]`.

Re-confirmed from `connections` in the backup: wired from **`analyze_document_output_parser1`
[out 1] → `integration-log-update3`** — a reachable error branch, so plan §4.2 / §8(a) still holds
(it is a silently-failing status callback, not dead code).

---

## §5.1 gate result — `./assert-auth.sh _NbFU3cCoEQwPSbvn14vV T1-…-before.json`

```
   versionId=a28d4ee4-…  activeVersionId=b0e3dbeb-…
   !! UNPUBLISHED DRAFT -- assertions below describe the DRAFT, not what executes

-- G1-G4:  FAIL ×22
   21 targets:  G1=true G2=true G3=FALSE G4=true
   integration-log-update3: G1=false G2=false G3=false G4=false
-- G5  no-rider ..................... PASS
-- G5b headerParameters drift ....... HEADER-DRIFT integration-log-update3
-- G6  node set / connections ....... PASS  (connections byte-identical)
-- residual hardcoded x-api-key ..... integration-log-update3
RESULT: FAIL
```

### What the gate says, and what it cannot yet say — read this before treating FAIL as a defect

**`RESULT: FAIL` is the CORRECT and EXPECTED output at this stage.** Three distinct causes, all
accounted for:

1. **G3=false on all 21 targets — expected, not a defect.** G3 asserts the credential binding, which
   is D3, which is deliberately deferred to the user-gated PUT. **G3 cannot pass until the PUT lands**
   and there is no intermediate state in which it could. It becomes assertable only post-PUT.
2. **`integration-log-update3` failing G1–G4 — expected.** It is out of T1 scope by design (§4.2). The
   gate has no per-tranche exclusion concept, so it reports the node it was never asked to convert.
   Its all-false row is itself the **positive evidence that T1 left it alone.**
3. **G5b `HEADER-DRIFT integration-log-update3` — a gate artifact, not a finding.** G5b's rule is
   "every node's `x-api-key` must be gone"; T1's rule is "every node's except this one". The two
   disagree by construction. ⚠️ **Reviewer action requested:** `assert-auth.sh` needs an optional
   exclude-list argument, otherwise T1 and T1b can never both print PASS. Recorded rather than
   silently worked around.

**What IS proven right now:**

- **G1, G2, G4 — 21/21 green.** All three parts of the draft-applicable delta landed on every node.
- **G5 no-rider — PASS.** Every node's `parameters` with `authentication`/`genericAuthType`/
  `headerParameters` deleted is byte-identical to the backup; `onError`, `retryOnFail`, `position`,
  `id`, `type`, `typeVersion`, `disabled` all unchanged.
- **G6 no-collateral — PASS.** Node-name set identical; **`connections` byte-identical**.
- **Independent full-workflow diff:** exactly **21 of 50** node objects differ from the backup — the
  21 targets and nothing else. `settings`, `pinData`, `staticData`, `name`, `active` all unchanged.
- **LESSONS 32b check:** zero nodes carry a stray `parameters.parameters.*`. The real keys changed.
- **Server-side corroboration of D4:** n8n's own validator now emits `HARDCODED_CREDENTIALS` for
  **`integration-log-update3` only** — down from 22. Independent of my own assertions.

**G7 census** is deferred — not meaningful until the change is published. Expected on promote:
**53 → 32** (21 converted, `integration-log-update3` retained).

---

## The gated PUT — `body.json`

| | |
|---|---|
| path | `n8n-workflows-init/tests/diffs/auth-unification/T1-_NbFU3cCoEQwPSbvn14vV-body.json` |
| size | **84,287 bytes** |
| **SHA-256** | **`f95062be7e4a0a5e859b564448709373308c38bb3e852a69b1bbd79464d6c995`** |

Built by the T0-validated recipe from a **fresh REST GET taken after the MCP edits** (so it carries
D1/D2/D4 from the draft) with D3 layered on for the 21 targets:

```
{name, nodes, connections, settings}
| .settings |= del(.binaryMode, .timeSavedMode)
| .nodes |= map(<21 targets> → authentication/genericAuthType/headerParameters/credentials)
```

Verified contents:

- top-level keys exactly `connections, name, nodes, settings`; 50 nodes.
- **21** nodes bound to `httpHeaderAuth = {id: mNsZWyU82NYV58k2, name: crm-n8n-auth}`.
- **0 occurrences of the real CRM key.** Only `integration-log-update3` still holds an `x-api-key`
  entry, value `test`, untouched.
- `settings` = `{"executionOrder":"v1","availableInMCP":true,"callerPolicy":"workflowsFromSameOwner"}`
  — `binaryMode` stripped per LESSONS 55. **The pre-change settings key set here is
  `availableInMCP, binaryMode, callerPolicy, executionOrder` — identical to T0's clone**, where this
  exact `del()` was proven to PUT successfully and `binaryMode:"separate"` survived the merge. This is
  precedent, not inference.
- `pinData` and `staticData` deliberately not sent (both exist on this workflow); they are merged, not
  replaced, and survived on both T0 targets.
- Collateral credentials carried in the body: **`googlePalmApi=fr3jSAU1JR6Ioobn` ×7,
  `pdfapihubApi=It527CvGZPUoKIgV` ×1** — see the baseline below.

### ⚠️ Reviewed bytes must equal pushed bytes

The reviewer reviews `body.json` **as bytes**, and the sha above is what makes that provable. Before
the PUT: re-run the §4.6-style draft-vs-active diff, then **re-verify the sha and send the file
unmodified** (`--data-binary @body.json`). If anything mutates the draft in the interim, `body.json`
must be regenerated **and re-reviewed** — a regenerated body voids the review (§4.7 step 2–4).

---

## Deliverable 4 — pre-PUT credential baseline for the LESSONS 55 collateral assertion

Every credential bound anywhere in `_NbFU3cCoEQwPSbvn14vV` **before** T1. All 8 must still be bound,
unchanged, after the PUT.

| node | node type | credential key | id | name |
|---|---|---|---|---|
| `analyze-promotion` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-promotion1` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-product-image` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-product-video` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-product-document` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-marketing-form` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `analyze-packing-list` | `@n8n/n8n-nodes-langchain.googleGemini` | `googlePalmApi` | `fr3jSAU1JR6Ioobn` | `sorento-gemini` |
| `Split a pdf` | `n8n-nodes-pdf-split-merge.pdfSplitMerge` | `pdfapihubApi` | `It527CvGZPUoKIgV` | `PDF Hub account` |

**Baseline: 8 bindings across 8 nodes, 2 distinct credentials. Expected post-PUT: 8/8 survive, plus
21 new `httpHeaderAuth` bindings = 29 bound nodes.** Note this workflow had **zero** `httpHeaderAuth`
bindings before T1, so the 21 are unambiguously new.

Post-PUT assertion:

```bash
jq -r '.nodes[]|select(.credentials!=null and (.credentials|length)>0)
       |"\(.name)\t\(.credentials|to_entries|map("\(.key)=\(.value.id)")|join(","))"' after.json
```

---

## Deliverable 6 — §5.2 per-node acceptance: the domain-specific key

Per the rewritten acceptance clause, the **only** clause that fires is
`main[0][0].json` carrying a named domain-specific key, plus `main[0][0].json.error` explicitly
absent. Response shapes below were read from the CRM source
(`/Users/tehjayson/Documents/foundryx/sorento_crm/sorento_crm_backend`), not guessed.

### Group A — business writers: clean keys available

| node | endpoint | success code | literal top-level keys | **assert on** |
|---|---|---|---|---|
| `packing-list-insert` | `POST /external/packing-lists` | **201** | `shipment`, `skipped_product_codes`, `unknown_product_codes`, `already_existed`, `message` | **`shipment`** |
| `technical-attachments-create` | `POST /external/product-attachments` | 200 | bulk: `attachment_id`, `linked`, `skipped_product_codes`, `already_linked` · single: ORM row incl. `attachment_id` | **`attachment_id`** (present on both branches) |
| `forms-insert` | `POST /external/forms` | 200 | `form`, `already_existed`, `message` | **`form`** |
| `promotion-create` | `POST /external/promotions` | 200 | `promotion`, `already_existed`, `message`, `warnings`, `unknown_product_codes` | **`promotion`** |

⚠️ **Do NOT assert on `message`.** It collides with the CRM's unhandled-500 envelope
`{"message": "Internal server error"}`. `detail` is likewise unsafe (the FastAPI `HTTPException`
shape). `shipment` / `attachment_id` / `form` / `promotion` are clean.

⚠️ **A 2xx here does not mean "created".** All three of packing-lists / forms / promotions have an
idempotent path returning 2xx with `already_existed: true`. Fine for an auth assertion; do not
over-read it.

⚠️ `technical-attachments-create` is the weakest of the four: the single-product branch returns a raw
ORM row with **no `response_model`**, so its exact serialised key set is inferred from the model, not
read from a schema. `attachment_id` is a real column and is literal in the bulk schema, so it holds on
both branches — but if the tester sees a different shape, that is a documentation gap, not a T1
regression.

### Group B — status callbacks (17): ⚠️ NO domain-specific key exists

**This is the flagged case the acceptance clause asked me to think about rather than copy-paste.**

The handler returns a **literal bare envelope** and nothing else:

```python
return {"status": "success", "message": "Integration log updated successfully."}
```

There is no `id`, no echoed `integration_log_id`, no resource object. **All 17 nodes hit this one
endpoint, so all 17 share this problem.** Options, and why I land where I do:

- ❌ `message` — collides with the 500 envelope. Unusable.
- ❌ execution status / `error == null` / `main[1]` empty — the three clauses the T0 negative control
  proved decorative.
- ⚠️ **`main[0][0].json.status == "success"`** — the least-bad option, and I recommend it **paired
  with** `main[0][0].json.error` absent. It is a literal from the handler; and on the measured
  AxiosError envelope the status lives at `json.error.status` (nested), **not** at `json.status`, so a
  top-level `status == "success"` does discriminate against exactly the failure shape T0 measured.

  Its weakness, stated plainly: `status` is a generic key, not a domain key. It would not
  discriminate against a hypothetical error envelope that happened to carry a top-level `status`. It
  is weaker evidence than `shipment`/`form`/`promotion` and should be recorded as such.

- **Mitigating factor specific to Group B:** all 17 are `onError` unset → **`stopWorkflow`**. A 401
  fails the execution **loudly** — these nodes cannot silently swallow an auth failure the way the
  plan's `continueErrorOutput` nodes can. So for Group B the §5.4-style backstop
  (`search_executions(status:["error"])`) is genuinely valid, unlike for Group A.

**Recommendation to the tester:** treat Group A as the real §5.2 dynamic proof (4 endpoints, 4 clean
domain keys). Treat Group B's `status == "success"` as supporting evidence, and lean on the
loud-failure property as the primary Group B guarantee. Do not report Group B as having a
domain-specific key — it does not.

### Nodes with NO reachable dynamic path (record as unverified, LESSONS 54 / plan §5.2)

| node | why |
|---|---|
| **`integration-log-update11`** | ⚠️ **NEW FINDING — 0 inbound connections.** Pre-existing (confirmed from the backup's `connections`, present before T1 — **not** caused by this change). It is disconnected in the same sense as the clone's `save-session-vars`. It can never execute, so it is **statically verifiable only**. Plan §5.2's unreachable table does not list it; it should. |
| `integration-log-update-promotion-fail` | requires an induced promotion failure (plan §5.2, already listed) |
| `integration-log-update-download-fail` | requires an induced download failure (already listed) |
| `integration-log-update-packinglist-ai-fail` | requires an induced packing-list AI failure (already listed) |

---

## ⚠️ Correction to plan §2 CORRECTION 3 — the 4 writers' error outputs ARE wired here

Plan §2 CORRECTION 3 lists `system-upload-attachments`'s four writers among the in-scope nodes that
"swallow errors", by analogy with the spine's `check-access` / `get-access-types` /
`get-presigned-url`, whose `main[1]` is unconnected so a 401 silently dead-ends.

**That does not hold for this workflow.** Read from the backup's `connections`:

| node | `main[0]` → | `main[1]` (error) → |
|---|---|---|
| `packing-list-insert` | `integration-log-update-successful` | **`integration-log-update12`** |
| `technical-attachments-create` | `integration-log-update-successful3` | **`integration-log-update10`** |
| `forms-insert` | `integration-log-update-successful5` | **`integration-log-update14`** |
| `promotion-create` | `integration-log-update-successful4` | **`integration-log-update-promotion-fail`** |

All four error outputs are wired to a fail-status callback. So a 401 on a writer does **not** vanish —
it routes to a callback that reports a **failure** status to the CRM. That is still a wrong outcome,
but it is a **visible, CRM-observable** one, not the silent dead-end the plan's blanket phrasing
implies.

Two consequences the reviewer should weigh:

1. T1's blast radius on a D3 mistake is smaller than §2 CORRECTION 3 suggests — but the failure mode
   is *mislabelling*: the CRM would record a genuine document as failed. Detectable from the CRM side
   as a spike in failure-status `integration_logs` rows, which is a useful post-promote signal worth
   naming in the acceptance.
2. §2 CORRECTION 3's node list was assembled by `onError` value alone, without checking wiring. The
   same over-generalisation may apply to the other non-spine nodes it names
   (`respond-create-update-contact-system›contact-create-update`, `schedule-sla-policy-checker`'s two,
   `respond-change-assignee-system›conversation-assignee-update`) — **worth re-checking per-workflow
   in T2/T3 rather than inheriting the claim.**

---

## Pre-existing validation warnings — untouched, NOT "fixed" (LESSONS 13)

Present before and after; all belong to this workflow's normal state:

- `DISCONNECTED_NODE`: `analyze_document_output_parser17`, `integration-log-update11` (both
  pre-existing — see above), plus the two trigger nodes which are legitimately sourceless.
- `INVALID_PARAMETER` `parameters.resource: "document"` on `analyze-promotion`, `analyze-promotion1`,
  `analyze-product-document`, `analyze-marketing-form`, `analyze-packing-list` (googleGemini nodes).
- `HARDCODED_CREDENTIALS` on `integration-log-update3` — **intentionally retained** (T1b).

The other 21 `HARDCODED_CREDENTIALS` warnings are gone. That is the intended signal.

---

## Safety

No egress of any kind. **Params-only edits into an unpublished draft on one workflow.** No PUT, no
publish, no execution run, no webhook fired, no redis seed, no message injected. Nothing was written
to the CRM and nothing reached respond.io — this workflow has no respond.io egress at all, which is
why it is the first prod tranche.

The live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone `txiPzSxy3Pclsz6v`, the fork `vUfFUDjLAuMaeQE6`,
and every other workflow were **not touched**. The only live-instance mutation this tranche made is
`_NbFU3cCoEQwPSbvn14vV`'s draft pointer moving `b0e3dbeb…` → `a28d4ee4…`; `activeVersionId` is
unchanged, so **production behaviour is bit-for-bit what it was before this work.**

## Rollback (§4.10, "draft edited, not yet published")

Nothing published → active untouched → **rollback needs no publish.** To discard the draft, re-apply
per-node from `T1-_NbFU3cCoEQwPSbvn14vV-nodes-before.json`: for each of the 21 nodes delete
`/authentication` and `/genericAuthType` and restore `/headerParameters/parameters` to the backup's
array.

If instead the draft is left in place, note it is a **publish rider** — any publish of
`system-upload-attachments` for any unrelated reason ships 21 credential-less nodes (LESSONS 24).
Either finish T1 or roll it back; do not park it.

## Handoff

1. **Reviewer:** review the draft **and `body.json` as bytes** (sha
   `f95062be7e4a0a5e859b564448709373308c38bb3e852a69b1bbd79464d6c995`). Please also rule on the two
   flagged items: the `assert-auth.sh` exclude-list gap, and the §2 CORRECTION 3 wiring correction.
2. **User gate:** approve the PUT.
3. **Then, in one action:** re-run the draft-vs-active diff, re-verify the sha, `PUT --data-binary
   @body.json` **unmodified** → binds D3 and publishes in the same operation.
4. **Immediately post-PUT:** re-run `assert-auth.sh` (expect `RESULT: FAIL` still, from
   `integration-log-update3` alone — 21/21 green on G1–G4); assert the 8-credential collateral
   baseline above survives; assert `settings`/`pinData`/`staticData`/`name`/`active` unchanged;
   confirm `versionId == activeVersionId`.
5. **Tester:** §5.2 per-node — Group A's four domain keys, Group B's `status == "success"` caveated
   as above, and the four unreachable nodes recorded as **unverified**, never inferred.
6. **T1b** (`integration-log-update3`) remains a separate, separately-gated tranche.
