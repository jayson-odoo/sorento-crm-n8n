# Δ1 / Δ2 / Δ3 — Promotion Runbook (clone → live)

Reviewer: sorento-reviewer · Date: 2026-06-28 · **ANALYSIS ONLY — no live workflow was written by this review.**
The main agent EXECUTES the op arrays below verbatim. Promotion is user-gated. Never edit live mid-cycle; apply a delta's ops then publish once.

## Verdicts (one line each)
- **Δ2 (parser routing): APPROVE** — clean 4-line logic change, prod-safe, deferred real-LLM gate is low-risk. Gate: confirm CRM has all 3 new teams.
- **Δ1 (catalog refactor): APPROVE (conditional)** — structurally correct and per-branch byte-identical; the plan's stated **0-diff 600-row replay gate is UNMET**. Approve to promote only if user accepts proceeding on per-branch + offline evidence, else HOLD for the broad replay.
- **Δ3 (CS member flow): HOLD (promote last, after a real chained run)** — wiring + parser + sub each verified in isolation but never end-to-end with the real LLM; `respond_user_id=null` member policy is unresolved. Spine/sub/parser/CRM all ready; needs the deferred chained-run gate + the null-member decision before go-live.

## Source-of-truth IDs and current active versions (verified this session)
| target | id | activeVersionId (pre-promo) | published-gated? |
|---|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | `6af20fbc-ea36-42b4-b647-3b6d9ba22b13` | yes (active entry) |
| live parser sub `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | `b3979d8e-7259-48d4-b57d-90acdb75ae4f` | **yes (shared sub — MUST publish, LESSON #17)** |
| live human-intervention sub | `rrYXzE61gCNUck_zmXe-G` | `da86c8e9-f091-4969-86cb-8345e51b8f86` | **yes (shared sub — MUST publish)** |
| clone spine (Δ1+Δ3) | `txiPzSxy3Pclsz6v` | (n8n_test, not MCP-published) | — |
| clone parser (Δ2+Δ3-parser) | `SB8wEXKdpITfhYXA` | — | — |
| clone human-int (Δ3) | `vUfFUDjLAuMaeQE6` | — | — |

**LESSON #17 is load-bearing:** the parser and human-int subs are called via `executeWorkflow`; if you update but do NOT `publish_workflow`, callers resolve to the OLD active version. After every sub update you MUST `publish_workflow` and verify `activeVersionId` advances.

## Promotion ORDER (dependencies)
`Δ2 (parser) → Δ1 (spine refactor) → Δ3 (spine + parser + human-int)`.
- Δ1 and Δ2 are mutually independent (different workflows). Δ3 depends on **both** Δ1 (catalog/compile) and Δ2 (parser must emit `customer_service`/`order_enquiries` and carry the member-pick block) **and** the CRM endpoints (live).
- Δ3's parser change = adding the member-pick override to `output_exchange`, which is **inert until the Δ3 spine sets `selection_context='member_offer'`** (gated `if (_selCtx === 'member_offer')`). Likewise the Δ3 `_mem` reads in `compile-current-state` are wrapped in `try/catch → null`, so they are inert until the `build-cs-member-offer` node exists. This dormancy is what makes the per-delta split safe.

## Artifact files (sha256 — executor must verify before applying)
```
delta2-parser-output_exchange.js          473763b42f160f36eaffc5d835ae7b9c21a6e7f34d6981caa9e6fcd07bb807ff
delta2-parser-systemMessage.txt           f4d662cbbdfafb7c4b7f797bed41e6fcaa240e66f7785653af300314fdc7708a
delta3-parser-output_exchange.FULL.js     a19ec86107c1f88cd9d24200b323ba7eaf4402a46f6b8718a9d2049fde073a5e
delta1-compile-current-state.js           e98093359b655e7f53df3c67b3a1a0a4512d72d4504470271493b085d3432636
delta3-compile-current-state.FULL.js      b44ce77cefffbe3739c0a3c89c781bd53550cea6b4f542602d70e13457920c2c
delta1-spine-nodes.json (7 tag + escalate-catalog)   8ed4e94bfe9126322f50dd300a9ab31e9870a31c1289e7f3899c1a4ad83af11e
delta3-spine-nodes.json (cs-offer-gate, get-cs-members, build-cs-member-offer)  f5326479226de36c43acefd0d1dc47f0c7857361fa810bc6d8ecc36ed598c1dc
delta1-delta3-spine-nodes.CLONE.json (combined incl. human-int call ref)
```
All under `/Users/tehjayson/Documents/foundryx/sorento_crm_n8n/n8n-workflows-init/tests/reviews/`.
The `*-spine-nodes.json` files contain full node objects `{name,type,typeVersion,parameters,position,id}` lifted from the clone. **Drop the `id` field on addNode** (let n8n assign) to avoid any cross-workflow id reuse; keep `name`, `type`, `typeVersion`, `parameters`, `position`.

update_workflow op schema in use: `addNode{node:{name,type,typeVersion,parameters,position}}`, `removeNode{nodeName}`, `addConnection{source,target,sourceIndex,targetIndex}`, `removeConnection{source,target,sourceIndex,targetIndex}`, `updateNodeParameters{nodeName,parameters,replace}`, `setNodeParameter{nodeName,path(JSON-Pointer),value}`. Default connectionType `main`.

---

# Δ2 — Parser routing extraction + purchasing split + order→CS

**Target:** live parser sub `XTODTw-dJcV0uRdC056hG` ONLY. No spine change (the live spine's `Call 'sub-query-reformulator'` already points at `XTODTw` and the routing contract `output.routing.{suggested_team,suggested_agent}` is preserved).

**Exact clone↔live diff (this delta):** only two nodes differ, `output_exchange` and `AI Agent`; connections identical; no other param changes (verified). The test nodes `test-reformulator-bypass` / `mock-reformulator-output` already exist in live (guard scaffolding) and are untouched.
- `output_exchange.jsCode`: deriveRouting switch remaps `master_products → purchasing_product`, `product_attachment(cert) → purchasing_certification`, `order → customer_service` (was `warehouse`); plus a promotion-brand clamp `brand → {sorento|cabana|mocha}|null`.
- `AI Agent.options.systemMessage`: the same 3 team remaps in the routing-mapping bullets + the routing enum gains `purchasing_product|purchasing_certification|customer_service`.

**Guard/repoint reconciliation:** none needed. The changed nodes carry **no** test-only refs (scanned: clean). Parser sub is self-contained (no sub-calls, no clone-sub references). Postgres Chat Memory / OpenAI creds are NOT touched (we only set `output_exchange.jsCode` and `AI Agent.options.systemMessage`).

**Backup:** `get_workflow_details XTODTw-dJcV0uRdC056hG` → save full JSON to `scratchpad/backup-XTODTw-pre-delta2.json`. Record `activeVersionId b3979d8e…`.

**Op array (1 update_workflow call, workflowId `XTODTw-dJcV0uRdC056hG`):**
```
[
  { "type":"setNodeParameter", "nodeName":"output_exchange",
    "path":"/jsCode", "value": <contents of delta2-parser-output_exchange.js> },
  { "type":"setNodeParameter", "nodeName":"AI Agent",
    "path":"/options/systemMessage", "value": <contents of delta2-parser-systemMessage.txt> }
]
```
(Use `setNodeParameter`; do NOT `updateNodeParameters replace:true` — that would drop the unrelated `options` keys / promptType.)

**Publish:** `publish_workflow XTODTw-dJcV0uRdC056hG` → re-`get_workflow_details` → assert `activeVersionId != b3979d8e…` (advanced).

**Post-promote verification:**
1. `get_workflow_details XTODTw` → `jq` the new `output_exchange.jsCode`; `diff` vs `delta2-parser-output_exchange.js` → empty.
2. `diff` new `AI Agent.options.systemMessage` vs `delta2-parser-systemMessage.txt` → empty.
3. Safe sanity (NO real customer): drive the clone or a staff-number test item through the parser path for a known order enquiry and an order-attachment(cert) enquiry; assert `output.routing.suggested_team` = `customer_service` / `purchasing_certification`. Do this against the test clone, not live, or via a staff respond.io contact you control.

**Rollback:** `update_workflow` setNodeParameter both paths back to the backup values; `publish_workflow`.

**Residual risk:**
- Deferred gate: real-LLM end-to-end run of deriveRouting not executed (offline 11-case test green; change is 3 string swaps + a deterministic brand clamp that overwrites `output.routing` exactly as before). LOW.
- **CRM dependency (BLOCKER to confirm):** escalations now route to `customer_service`, `purchasing_product`, `purchasing_certification`. Only `customer_service/order_enquiries` is confirmed to exist in CRM (Δ3 canary fetched its roster). **Confirm `purchasing_product` and `purchasing_certification` teams exist with agents+members+SLA before promoting**, else a product/cert escalation will fail at `next-assignee`. If unconfirmed → HOLD Δ2.
- Brand-clamp behavior change: a garbled promotion brand now routes to `marketing_promotion_sorento` (was an invalid team string). Improvement, but untested live.

---

# Δ1 — Catalog refactor (pure; spine only)

**Target:** live spine `9qVyfUxmRQqrpGRMDLRuz`.

**Exact clone↔live structural diff (Δ1 portion):**
- **ADD 8 nodes** (full defs in `delta1-spine-nodes.json`): `tag-not-found`, `tag-access-choice`, `tag-demand-qty`, `tag-not-supported`, `tag-clarify-menu`, `tag-escalate-offer`, `tag-out-of-scope` (each `n8n-nodes-base.set` v3.4 setting `branch_kind` to its literal), and `escalate-catalog` (`n8n-nodes-base.code` v2). All carry **no** creds and **no** test refs (verified). `escalate-catalog` references only live nodes (`Call 'sub-query-reformulator'`, `not-found-error-message`, `access-level-choice-message`, `$input`).
- **REMOVE 7 nodes:** `Edit Fields1`, `Edit Fields3`, `Edit Fields4`, `Edit Fields5`, `Edit Fields6`, `Edit Fields7`, `Edit Fields8`. (Confirmed: only `compile-current-state` referenced these; after the compile rewrite nothing else does. **Keep `Edit Fields` and `Edit Fields2` — unrelated, they stay.**)
- **Rewire** (feeder→tag mirrors the old feeder→EF one-to-one; tags converge on the catalog; catalog → compile):
  | feeder (out idx) | old → EF | new → tag |
  |---|---|---|
  | `not-found-error-message` [0] | Edit Fields1 | `tag-not-found` |
  | `access-level-choice-message` [0] | Edit Fields3 | `tag-access-choice` |
  | `If8` [0] | Edit Fields4 | `tag-demand-qty` |
  | `not-supported-domain` [0] | Edit Fields5 | `tag-not-supported` |
  | `If1` [0] | Edit Fields6 | `tag-clarify-menu` |
  | `If10` [0] | Edit Fields7 | `tag-escalate-offer` |
  | `If2` [0] | Edit Fields8 | `tag-out-of-scope` |
  (`If2`[0] also feeds `Call 'sub-human-intervention'` — that edge is untouched.)
- **CHANGE** `compile-current-state.jsCode`: replace the 7-arm `Edit Fields*` `isExecuted` ladder with the `escalate-catalog` read (`delta1-compile-current-state.js`). Validated: diff vs live shows ONLY the ladder→catalog swap; **no `selection_context` key, no `_mem`** (those are Δ3).

**Guard/repoint reconciliation:** none. No added Δ1 node references a clone sub or carries a test ref; no cred binding. The `Δ1-only` compile excludes all Δ3/test bits.

**Backup:** `get_workflow_details 9qVyfUxmRQqrpGRMDLRuz` → `scratchpad/backup-spine-pre-delta1.json`. Record `activeVersionId 6af20fbc…`.

**Op array (1 update_workflow call, workflowId `9qVyfUxmRQqrpGRMDLRuz`; 45 ops, ordered):**
```
// 1) add the 8 new nodes (parameters+position from delta1-spine-nodes.json, drop id)
addNode tag-not-found ; addNode tag-access-choice ; addNode tag-demand-qty ;
addNode tag-not-supported ; addNode tag-clarify-menu ; addNode tag-escalate-offer ;
addNode tag-out-of-scope ; addNode escalate-catalog
// 2) tags → catalog, catalog → compile
addConnection {source:"tag-not-found",      target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-access-choice",  target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-demand-qty",     target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-not-supported",  target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-clarify-menu",   target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-escalate-offer", target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"tag-out-of-scope",   target:"escalate-catalog", sourceIndex:0, targetIndex:0}
addConnection {source:"escalate-catalog",   target:"compile-current-state", sourceIndex:0, targetIndex:0}
// 3) rewire each feeder: drop feeder→EF, add feeder→tag
removeConnection {source:"not-found-error-message",     target:"Edit Fields1", sourceIndex:0, targetIndex:0}
addConnection    {source:"not-found-error-message",     target:"tag-not-found", sourceIndex:0, targetIndex:0}
removeConnection {source:"access-level-choice-message", target:"Edit Fields3", sourceIndex:0, targetIndex:0}
addConnection    {source:"access-level-choice-message", target:"tag-access-choice", sourceIndex:0, targetIndex:0}
removeConnection {source:"If8",                 target:"Edit Fields4", sourceIndex:0, targetIndex:0}
addConnection    {source:"If8",                 target:"tag-demand-qty", sourceIndex:0, targetIndex:0}
removeConnection {source:"not-supported-domain",target:"Edit Fields5", sourceIndex:0, targetIndex:0}
addConnection    {source:"not-supported-domain",target:"tag-not-supported", sourceIndex:0, targetIndex:0}
removeConnection {source:"If1",                 target:"Edit Fields6", sourceIndex:0, targetIndex:0}
addConnection    {source:"If1",                 target:"tag-clarify-menu", sourceIndex:0, targetIndex:0}
removeConnection {source:"If10",                target:"Edit Fields7", sourceIndex:0, targetIndex:0}
addConnection    {source:"If10",                target:"tag-escalate-offer", sourceIndex:0, targetIndex:0}
removeConnection {source:"If2",                 target:"Edit Fields8", sourceIndex:0, targetIndex:0}
addConnection    {source:"If2",                 target:"tag-out-of-scope", sourceIndex:0, targetIndex:0}
// 4) drop EF→compile edges
removeConnection {source:"Edit Fields1", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields3", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields4", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields5", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields6", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields7", target:"compile-current-state", sourceIndex:0, targetIndex:0}
removeConnection {source:"Edit Fields8", target:"compile-current-state", sourceIndex:0, targetIndex:0}
// 5) rewrite compile (Δ1-only)
updateNodeParameters {nodeName:"compile-current-state", replace:false,
   parameters:{ jsCode: <contents of delta1-compile-current-state.js> }}
// 6) remove the old EF setters
removeNode {nodeName:"Edit Fields1"} ; removeNode {nodeName:"Edit Fields3"} ;
removeNode {nodeName:"Edit Fields4"} ; removeNode {nodeName:"Edit Fields5"} ;
removeNode {nodeName:"Edit Fields6"} ; removeNode {nodeName:"Edit Fields7"} ;
removeNode {nodeName:"Edit Fields8"}
```
(Single atomic call; if the executor prefers, it may run `validate_workflow`-equivalent by re-reading after. Keep `setNodeParameter`/`updateNodeParameters replace:false` so untouched compile params survive — Code node only has `jsCode`, so either is fine.)

**Publish:** `publish_workflow 9qVyfUxmRQqrpGRMDLRuz` → assert `activeVersionId` advanced from `6af20fbc…`.

**Post-promote verification:**
1. Node-set: `get_workflow_details` → assert `Edit Fields1/3/4/5/6/7/8` ABSENT; `Edit Fields` + `Edit Fields2` PRESENT; all 7 `tag-*` + `escalate-catalog` PRESENT.
2. Connections: assert each feeder→tag (7), each tag→escalate-catalog (7), escalate-catalog→compile (1), central-exchange→compile (still present); assert ZERO edges referencing any `Edit Fields[134567 8]`.
3. compile sha: `jq` live `compile-current-state.jsCode` → `diff` vs `delta1-compile-current-state.js` → empty.
4. Safe behavioral sanity (test clone or staff number, never a real customer): one run per escalate branch (clarify_menu, escalate_offer, demand_qty, not_supported, out_of_scope, not_found) → assert `would_send` message byte-identical to the pre-Δ1 baseline in `tests/runs/delta1-results.md` and `out_of_scope` keeps `includeResponse=false`.

**Rollback:** restore `compile-current-state.jsCode` from backup; re-add `Edit Fields1/3/4/5/6/7/8` (defs in backup) with feeder→EF and EF→compile edges; remove the 8 new nodes + their edges; `publish_workflow`. (Simplest: re-import the backup via UI Duplicate-then-swap if op rollback is error-prone.)

**Residual risk:**
- **Plan gate UNMET:** Δ1's defined acceptance is a **0-diff broad replay over ~600 golden rows** — NOT yet run (per `delta2-delta3-results.md` deferred list). Evidence to date = per-branch canary byte-identical (6/7 branches; `access_choice` live case not run) + offline `delta1-catalog.test.js` green. The happy-path (central-exchange) and branch-interaction coverage that the broad replay provides is missing. **Recommend running the 600-row replay on the clone and demanding zero `replay_node_diffs` before promoting**; if the user accepts the per-branch+offline evidence, Δ1 is low-risk (pure refactor, catalog logic offline-equivalent to the old ladder).

---

# Δ3 — CS member-escalation flow (spine + parser + human-int sub; CRM live)

Promote LAST, only after Δ1 + Δ2 are live AND the deferred chained-run gate + null-member decision are resolved. Three live targets; do them in this order: **parser → human-int sub → spine** (so the spine's new wiring lands when both subs already understand the new fields). Each sub must be published.

## Δ3-A — Parser sub `XTODTw-dJcV0uRdC056hG`
**Diff:** `output_exchange.jsCode` gains the CS member-pick override block (gated `if (_selCtx==='member_offer')`). `AI Agent.systemMessage` UNCHANGED from Δ2 (the member-pick logic is fully deterministic in `output_exchange`; no prompt edit).
**Reconciliation:** block is clean (no test refs); reads only `parent_input.previous_conversation_state` and `output.output`.
**Backup:** `scratchpad/backup-XTODTw-pre-delta3.json`.
**Op array (workflowId `XTODTw-dJcV0uRdC056hG`):**
```
[ { "type":"setNodeParameter", "nodeName":"output_exchange",
    "path":"/jsCode", "value": <contents of delta3-parser-output_exchange.FULL.js> } ]
```
(This file = Δ2 output_exchange + the member-pick block; it supersedes the Δ2 jsCode. Requires Δ2 already applied logically, but the file is self-contained = the final desired state.)
**Publish:** `publish_workflow XTODTw` → assert activeVersionId advances. Verify `diff` live jsCode vs `delta3-parser-output_exchange.FULL.js` empty.

## Δ3-B — Human-intervention sub `rrYXzE61gCNUck_zmXe-G`
**Diff (2 business changes only):**
1. `When Executed by Another Workflow` trigger `workflowInputs.values`: append `{ "name":"explicit_assignee_id" }` (becomes the 12th input; clone has exactly this, no `type`).
2. `get-round-robin-assignee` httpRequest `jsonBody`: add the `preferred_assignee_id` line.
**Reconciliation:** the live sub ALREADY contains the guard scaffolding (`test-guard`, `test-guard-record`) and ALREADY points its internal sub-calls at the shared published subs (`aoydkG1dbItXR5jXFEQsP`, `2l8egTLJbyGOPvG-DbtDX`) — **do NOT touch those.** The clone's only extra (logging `explicit_assignee_id` in `test-guard-record`) is test-only; **skip it.** No repoint needed.
**Backup:** `scratchpad/backup-humanint-pre-delta3.json`. Record `activeVersionId da86c8e9…`.
**Op array (workflowId `rrYXzE61gCNUck_zmXe-G`):**
```
[
  { "type":"setNodeParameter", "nodeName":"When Executed by Another Workflow",
    "path":"/workflowInputs/values/-",            // append to array
    "value": { "name":"explicit_assignee_id" } },
  { "type":"setNodeParameter", "nodeName":"get-round-robin-assignee",
    "path":"/jsonBody",
    "value": "={\n    \"agent_code\": \"{{ $('When Executed by Another Workflow').first().json.agent }}\",\n    \"team_code\": \"{{ $('When Executed by Another Workflow').first().json.team }}\",\n    \"contact_phone_number\": \"{{ $('When Executed by Another Workflow').first().json.contact_phone_number }}\",\n    \"policy_code\": \"NORMAL\",\n    \"preferred_assignee_id\": \"{{ $('When Executed by Another Workflow').first().json.explicit_assignee_id || '' }}\",\n    \"tier\": 1\n}" }
]
```
(If the executor's `setNodeParameter` does not support JSON-Pointer array-append `/-`, instead `updateNodeParameters {nodeName:"When Executed by Another Workflow", replace:false, parameters:{ workflowInputs:{ values:[ <the full 12-entry values array from the clone trigger> ] }}}` — the full clone array is: contact_id(any), agent, team, contact_phone_number, current_assignee(any), message_id(any), is_test(boolean), test_run_id, input_message, started_at, contact(object), explicit_assignee_id.)
**Publish:** `publish_workflow rrYXzE61gCNUck_zmXe-G` → assert activeVersionId advances from `da86c8e9…`.
**Safety note:** `preferred_assignee_id` defaults to `''` when absent → CRM falls back to round-robin (backward-compatible). The empty default means existing (non-Δ3) callers are unaffected.

## Δ3-C — Spine `9qVyfUxmRQqrpGRMDLRuz`
**Diff:**
- **ADD 3 nodes** (full defs in `delta3-spine-nodes.json`): `cs-offer-gate` (IF v2.3; conds `escalate-catalog.is_escalate_offer==true` AND `routing.suggested_team=='customer_service'` AND `routing.suggested_agent=='order_enquiries'`), `get-cs-members` (httpRequest v4.3, **GET** `https://fe-sorento.foundryx.my/api/v1/external/team-members?...` — prod READ, inline x-api-key, no cred, no test ref), `build-cs-member-offer` (code v2; reads `escalate-catalog`+`get-cs-members`; clean).
- **Rewire:** insert the gate between catalog and compile —
  - remove `escalate-catalog`[0]→`compile-current-state`
  - add `escalate-catalog`[0]→`cs-offer-gate`
  - add `cs-offer-gate`[0]→`get-cs-members`  (TRUE)
  - add `cs-offer-gate`[1]→`compile-current-state`  (FALSE)
  - add `get-cs-members`[0]→`build-cs-member-offer`
  - add `build-cs-member-offer`[0]→`compile-current-state`
- **CHANGE** `compile-current-state.jsCode` → FULL (`delta3-compile-current-state.FULL.js`): adds the `_mem` override + `selection_context` + member `last_result_set`.
- **CHANGE** `Call 'sub-human-intervention'`: add input `explicit_assignee_id`.
**Reconciliation (CRITICAL):**
- The clone's `Call 'sub-human-intervention'` points at the CLONE sub `vUfFUDjLAuMaeQE6` and carries `is_test:true`+`test_run_id` — **the LIVE node already points at `rrYXzE61gCNUck_zmXe-G` and has no is_test/test_run_id; DO NOT overwrite the node.** Promote ONLY the single new input via setNodeParameter (below). Do not import the clone node.
- `get-cs-members` is a GET (read) to prod CRM — allowed. No write nodes added.
**Backup:** `scratchpad/backup-spine-pre-delta3.json`.
**Op array (workflowId `9qVyfUxmRQqrpGRMDLRuz`):**
```
[
  // add nodes (params/position from delta3-spine-nodes.json, drop id)
  { "type":"addNode", "node": <cs-offer-gate> },
  { "type":"addNode", "node": <get-cs-members> },
  { "type":"addNode", "node": <build-cs-member-offer> },
  // rewire
  { "type":"removeConnection", "source":"escalate-catalog", "target":"compile-current-state", "sourceIndex":0, "targetIndex":0 },
  { "type":"addConnection",    "source":"escalate-catalog", "target":"cs-offer-gate", "sourceIndex":0, "targetIndex":0 },
  { "type":"addConnection",    "source":"cs-offer-gate",    "target":"get-cs-members", "sourceIndex":0, "targetIndex":0 },
  { "type":"addConnection",    "source":"cs-offer-gate",    "target":"compile-current-state", "sourceIndex":1, "targetIndex":0 },
  { "type":"addConnection",    "source":"get-cs-members",   "target":"build-cs-member-offer", "sourceIndex":0, "targetIndex":0 },
  { "type":"addConnection",    "source":"build-cs-member-offer", "target":"compile-current-state", "sourceIndex":0, "targetIndex":0 },
  // compile -> FULL
  { "type":"updateNodeParameters", "nodeName":"compile-current-state", "replace":false,
    "parameters": { "jsCode": <contents of delta3-compile-current-state.FULL.js> } },
  // human-int call: add the one new input (repoint NOT needed; live already = rrYX)
  { "type":"setNodeParameter", "nodeName":"Call 'sub-human-intervention'",
    "path":"/workflowInputs/value/explicit_assignee_id",
    "value":"={{ $('Call \\'sub-query-reformulator\\'').first().json.output.escalation.preferred_assignee_id || '' }}" }
]
```
**Publish:** `publish_workflow 9qVyfUxmRQqrpGRMDLRuz` → assert activeVersionId advances.
**Post-promote verification:**
1. Node-set: `cs-offer-gate`, `get-cs-members`, `build-cs-member-offer` present; `get-cs-members` URL host = `fe-sorento.foundryx.my`, method GET.
2. Connections: `escalate-catalog`→`cs-offer-gate` (NOT →compile); gate[0]→get-cs-members; gate[1]→compile; get-cs-members→build-cs-member-offer→compile; central-exchange→compile intact.
3. compile sha = `delta3-compile-current-state.FULL.js`. human-int call: `workflowId.value=='rrYXzE61gCNUck_zmXe-G'`, has `explicit_assignee_id` input, has NO `is_test`/`test_run_id`.
4. Safe end-to-end (test clone or staff number ONLY): the deferred **chained 2-round** check — round-1 order escalation → assert `would_send` numbered member offer; round-2 numeric pick → assert `would_write` assignment carries `preferred_assignee_id` = the picked member uuid; bare-yes → round-robin (empty preferred). Never run against a real customer.

**Rollback:** restore `compile-current-state.jsCode` from backup; remove the 3 new nodes + their 5 edges; re-add `escalate-catalog`→`compile-current-state`; remove the `explicit_assignee_id` input from the human-int call; `publish_workflow`. (Δ3-A/B subs: setNodeParameter back to backup + publish.)

**Residual risk (HOLD reasons):**
- Deferred gate: a **real chained run with the live LLM** (regress-capture so the REAL parser emits `reference_positions` for a numbered reply and the member block resolves live) was NOT done — spine wiring, parser override, and the sub were each validated separately + offline. End-to-end with the real model is unverified.
- **Unresolved product policy:** a CS member (Sarah) has `respond_user_id=null`. A null-respond member in the offer can break targeted assignment / comment (`assignee_respond_user_id` null). Decide: exclude null-respond members from the offer in `build-cs-member-offer`, OR let CRM reject and fall back to round-robin. Must resolve before go-live.
- Depends on Δ1 (catalog/compile) + Δ2 (parser routing + member-pick block) + CRM `team-members` & `preferred_assignee_id` endpoints (live, confirmed).

---

# Cross-cutting checklist
- [ ] CRM has all 3 new teams (customer_service, purchasing_product, purchasing_certification) with agents/members/SLA — gate for Δ2 + Δ3.
- [ ] Backup each live target BEFORE its ops (4 backups total: spine×2 stages, parser, human-int).
- [ ] After EVERY sub/spine update → `publish_workflow` → confirm `activeVersionId` advanced. (Unpublished shared-sub edits do NOT take effect for `executeWorkflow` callers — LESSON #17.)
- [ ] Verify every artifact sha256 before applying; on addNode, drop the clone `id`.
- [ ] Never edit a live workflow mid-cycle; never run a sanity check against a real respond.io customer — use the test clone or a staff-controlled number; egress on the clone stays guarded/orphaned.
- [ ] Do NOT promote any test-scaffolding node: `Call 'sub-query-reformulator'` (clone repoint+is_test), spine trigger `When Executed by Another Workflow`, bypassed `check-access`/`resolve-entity`/`get-session-vars`, `redis-pop-main-message-list`, all `sorento-sub-respond-sendmsg-respond*` (is_test/test_run_id only), `fixture-*`, `replay-*`, `mock-*`, `guard-*-record`, `*-http`, `pg-*`, `session-*-gate`, `parser-bypass-gate`, `cs-offer-gate` is BUSINESS (keep). `disallowed-entity-gate` + `not-found-error-message` already match live (Fix A+B) — exclude.
```
