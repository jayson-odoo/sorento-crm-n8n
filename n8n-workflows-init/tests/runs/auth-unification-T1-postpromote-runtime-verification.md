# RUN — T1 post-promote runtime verification · `system-upload-attachments` `_NbFU3cCoEQwPSbvn14vV`

**Date:** 2026-07-21 · **Tester** · Read-only. No workflow edited, published, or PUT. No credential
modified. No execution originated by me. No webhook fired. No prod host probed.

**Promote:** 2026-07-21T15:02:52Z · `activeVersionId` = `1f844cc5-7245-4c44-ba68-7adeb29649cb`
**Observation window:** 15:02:52Z → 15:15Z (~12 min)
**Rollback pointer if needed:** `publish_workflow` → `b0e3dbeb-d4a3-42bd-9ef6-3771767af41c`

---

## VERDICT — T1 is working in production. Nothing is broken. No rollback indicated.

One of the 21 nodes has **hard, measured runtime proof**; the remaining 20 are **UNVERIFIED for lack
of traffic**, not for any observed failure. There is **zero evidence of an auth failure anywhere**:
zero errored executions since the promote, and the one node that did execute returned a real business
payload.

**Evidence is sufficient to green-light T2**, with one caveat and one new finding (below).

---

## Per-node results

Method per plan §5.2: assert per-node `runData`, never execution status.

### Group A — business writers (4)

| node | clause | evidence | result |
|---|---|---|---|
| `packing-list-insert` | `main[0][0].json.shipment` present · `.error` ABSENT | **exec `9464048`** | **PASS** |
| `technical-attachments-create` | `attachment_id` | no execution in window | **UNVERIFIED** |
| `forms-insert` | `form` | no execution in window | **UNVERIFIED** |
| `promotion-create` | `promotion` | no execution in window | **UNVERIFIED** |

### Group B — status callbacks (17)

Clause: `status=="success"` ∧ `message=="Integration log updated successfully."` ∧ `error` ABSENT.

| node | evidence | result |
|---|---|---|
| `integration-log-update-successful`, `-successful3`, `-successful4`, `-successful5`, `-update1`, `-update4`, `-update5`, `-update6`, `-update7`, `-update8`, `-update10`, `-update12`, `-update14` (13 nodes) | no execution in window | **UNVERIFIED** |
| `integration-log-update11` | **0 inbound connections — can never execute** | **UNVERIFIED (permanent, static-only)** |
| `-promotion-fail`, `-download-fail`, `-packinglist-ai-fail` | require an induced upload failure | **UNVERIFIED (by design)** |

No Group B node was recorded PASS. None was inferred green.

---

## The one PASS — exec `9464048`, in detail

A **manual partial re-execution** (`mode: manual`, `destinationNode: packing-list-insert`,
`mode: inclusive`), started **15:10:47Z — 8 min after the promote**, therefore on the new active
version. Upstream node data was replayed from the 10:07Z natural execution (`startTime` deltas ≈ 5 h);
**only `packing-list-insert` genuinely executed at 15:10:47Z.** That makes it a clean, isolated probe
of exactly the changed thing.

`runData["packing-list-insert"][0].data.main`:

```
main[0][0].json = { shipment: {...}, skipped_product_codes: [],
                    unknown_product_codes: [], already_existed: true,
                    message: "Packing list updated in place." }
main[0][1]      = []            (error output empty)
json.error      = ABSENT
```

`shipment` present, `error` absent → **both halves of the §5.2 clause satisfied.** `runtimeData`
carries an encrypted `credentials` blob, confirming a credential was resolved for the node.

⚠️ Not originated by me. Note it performed a **real prod write**: `shipment_lines` under shipment
`ed24e35c-3e22-43b2-9e26-c082b0be2366` carry `created_at: 2026-07-21T15:10:47`. Recorded factually.

⚠️ Per §5.2, `already_existed: true` means updated-in-place, not created. Fine for an auth assertion;
do not over-read it.

---

## Why the 20 UNVERIFIED nodes are low-risk — risk assessment, NOT evidence

Stated separately and explicitly **not** used to upgrade any verdict (plan §5.2, LESSONS 54/56).

Read from CRM source (`/Users/tehjayson/Documents/foundryx/sorento_crm/sorento_crm_backend`), not guessed:

- `/api/v1/external/packing-lists` → `get_external_api_user` (`app/dependencies.py:546`) — requires
  `X-API-Key` present **and** `api_key == settings.external_api_key`, else 401.
- `/api/v1/integration-management/integration-logs/{id}/status` →
  `require_module_enabled_with_api_key("base")` → `get_current_user_or_api_key`
  (`app/dependencies.py:585`) — compares against the **same** `settings.external_api_key` via
  `hmac.compare_digest`, resolves `id="system"`, and the module gate then returns early on
  `uid == "system"`.
- The CRM's own comment at `app/api/v1/__init__.py:134` states the logs router takes the
  **"same key as /external/*"**.

**There is exactly one external API key value in this CRM.** So exec `9464048`'s 2xx proves that
`crm-n8n-auth` (`mNsZWyU82NYV58k2`) is bound, resolves at runtime, injects the header under the
correct name, and that the value equals `settings.external_api_key`. All 21 nodes carry an identical
binding — re-confirmed below on the **active** version — and their endpoints check that same single
value.

The residual risk that any of the other 20 401s is therefore very low. It is still **not measured**,
and is recorded as UNVERIFIED.

---

## Active-version re-confirmation (static, from `activeVersion` block)

23 `httpRequest` nodes. All 21 targets on the **active** version:
`authentication=genericCredentialType`, `genericAuthType=httpHeaderAuth`, `headerParameters.parameters=[]`.

Correctly untouched:
- `integration-log-update3` — `authentication` UNSET, still carries `x-api-key` (T1b, by design).
- `download-packing-list` — S3, no auth, out of scope.

(MCP redacts credentials on read (LESSONS 47), so D3 binding itself is not re-assertable here; it was
asserted post-PUT from REST `after.json` — 29 bound nodes, all 8 pre-existing survived.)

---

## Errored-execution backstop (checklist step 10, first half)

`search_executions(workflowId, status:["error","crashed"])`:

| exec | when | verdict |
|---|---|---|
| `9422257` | 2026-07-21T07:09:35Z | **PRE-promote.** Not auth. |
| `9407224` | 2026-07-21T04:21:45Z | **PRE-promote.** Not auth. |

**Zero errored executions since the promote.** Because all 17 Group B nodes are `onError: stopWorkflow`,
a genuine 401 would be loud and would land here — but with zero webhook executions in the window, the
backstop has had **no opportunity to fire**. This is absence of evidence, not evidence of health, and
is scored as such.

**Both pre-promote errors share one unrelated pre-existing defect** — see Incidental Findings.

---

## Post-promote watch (checklist step 10, second half) — PARTIALLY BLOCKED

Named signal: a spike in failure-status `integration_logs` rows.

- **CRM-side query: BLOCKED.** No read path to the prod CRM DB from here; probing prod hosts /
  using repo creds against live is forbidden. Not worked around. **This check must be run by someone
  with CRM DB access.**
- **n8n-side proxy: CLEAN.** A failure-status spike would require the writers' `main[1]` fail
  callbacks to fire. Since the promote, no writer ran except `packing-list-insert`, which succeeded
  down `main[0]`. Zero fail-callback executions. So no spike has originated from this workflow.

---

## Traffic context — why coverage is thin, and how to close it

Natural webhook traffic, 24 h pre-promote: **13 executions**, clustered in business hours
(last natural one 10:07Z). Since the promote (12 min, and ~23:15 MYT — after hours): **zero natural
executions.**

The coverage gap is a timing artifact, not a defect. **Closing it costs one read**: at the next
natural upload, `search_executions` → one targeted `get_execution(includeData, nodeNames:[...])` and
apply the §5.2 / Group B clauses. A packing-list upload alone would cover
`packing-list-insert` + `integration-log-update-successful` in one shot.

---

## ⚠️ NEW FINDING — a dirty draft has appeared on live since the promote

| pointer | value |
|---|---|
| `activeVersionId` | `1f844cc5-7245-4c44-ba68-7adeb29649cb` (as promoted — **unchanged**) |
| `versionId` (draft) | **`972f5e36-05de-442d-8c76-73d0f09f50de`** |
| `updatedAt` | **2026-07-21T15:10:24Z** (24 s before the manual re-run) |

The promote checklist step 6 asserted `versionId == activeVersionId`. **That no longer holds.**

**Diffed, and it is benign.** Canonical (sorted-key) comparison of draft vs active:

- **semantic `parameters` diffs: NONE** on all 50 nodes. The 21 nodes that differ by raw `tojson`
  differ only in **JSON key ordering** — a UI re-serialisation artifact.
- node-id set identical · `connections` byte-identical · `settings` identical.
- one real delta: `integration-log-update-packinglist-ai-fail` `position [672,1800] → [672,1808]` —
  an **8-pixel node drag**.

Diagnosis: someone opened the workflow in the n8n UI at 15:10:24Z to set up the manual re-execution,
and the editor auto-saved a draft (LESSONS 24). **Production behaviour is unaffected** — active is
untouched and is the reviewed artifact.

**Why it still matters (LESSONS 24/51):** this is now a **publish rider**. Any future
`publish_workflow` on `_NbFU3cCoEQwPSbvn14vV` — including the **T1b tranche** — ships the node move
along with it. Harmless here, but T1b must re-run the draft-vs-active diff and decide whether to
stage it as its own semantic-no-op publish (LESSONS 51) rather than let it ride.

---

## Incidental findings (out of scope, each needs its own ticket)

**(1) `analyze_document_output_parser28` has a JavaScript syntax error — pre-existing, live, breaks
every unsupported-document upload.** Sole cause of both pre-promote errored executions
(`9422257`, `9407224`). Unbalanced braces:

```js
return {
  json: {
    output: {
      response: "This document type is not supported. ..."
    }
};          // ← closes `json`, never closes the outer object
```

→ `SyntaxError: Unexpected token ';'`, `stopWorkflow`. Any upload routed to `Switch` output 6
(e.g. `attachment_type: "Stock_List"`) hard-fails, so **the CRM never receives its status callback for
unsupported document types.** Unrelated to auth; not introduced by T1; not touched.

**(2) The prior operator's manual re-run performed a real prod write** (shipment lines re-created).
Noted so it is not later mistaken for organic activity.

---

## T2 green-light

**Yes, proceed to T2**, with three carry-forwards:

1. **The mechanism is proven end-to-end.** `crm-n8n-auth` binds, resolves at runtime, injects the
   right header, and the CRM accepts it — measured, not inferred. That was the open question T1 left,
   and it is now closed. The D1/D2/D3/D4 recipe is validated against production.
2. **Carry the 20 UNVERIFIED nodes forward as an open item, not a closed one.** Cost to close: one
   read at the next natural upload. Do not let T2 overwrite the window.
3. **Two housekeeping items before T1b:** re-run the draft-vs-active diff (dirty draft above), and
   fix `assert-auth.sh` with `--exclude` as the review already required. Also: T2's expected G7
   should derive from **19**, not the stale `32`.

**Not a blocker for T2, but must be owned:** the CRM-side `integration_logs` failure-spike check
remains **unrun** — it needs someone with prod CRM DB access.
