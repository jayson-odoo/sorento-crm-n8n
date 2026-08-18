# promotion-hotfix-tier-tool — node-diff (coder, 2026-08-18)

**Target edited:** fork `RnpxEnAV3g20MmKj` ("sorento-consume-main PROMO-PICKER") — the tier-lane build clone (guarded: sendmsg→`ublq9nSlrpz63xan` test-guard, HI→`vUfFUDjLAuMaeQE6`, get-results→CS-BUILD `t4QvrtrPnTwRU6br`).
**Not touched:** live `9qVyfUxmRQqrpGRMDLRuz`, clone `txiPzSxy3Pclsz6v`.
**Method:** one atomic `update_workflow` with 3× `setNodeParameter` (byte-exact single-leaf writes). No node adds/removes, no reconnects, no workflowId-target changes.
**Pre-edit backup:** `tests/backups/promotion-hotfix-20260818/FORK-RnpxEnAV3g20MmKj-2063daa8-PRE.json`.

| | before | after |
|---|---|---|
| fork versionId | `2063daa8-6438-4ceb-9aae-7baad765957c` (== active) | draft `8d13d386-05a4-4f60-810a-88297118c53c` (active still `2063daa8…` — NOT published; see note) |

## The bug (proven: live exec 12907178 → sub-exec 12907191)
`Call 'sub-get-results'` sent `tool = "={{ $json.name }} "`. It has two inbound edges:
- `if-tier-ask` FALSE → item is `tool-filter` output → `$json.name` = tool name (fine).
- `if-tier-has-any` FALSE → item is `tier-probe-collect` output (= `tier-gate` passthrough) → `$json.name` = the contact's **access-level name array** ("Sorento Office,Sorento Dealer,…") → CRM MCP `Unknown tool` → `has_result:false` → "no promotion matched".

`tool-filter` executes upstream on BOTH paths, so `$('tool-filter').first().json.name` is always the tool name — exactly what the sibling `tier-probe` node already uses.

## Leaf changes (3)

### 1. `Call 'sub-get-results'` › `parameters.workflowInputs.value.tool`
- before: `={{ $json.name }} ` (trailing space)
- after:  `={{ $('tool-filter').first().json.name }}`
- why: fix the wrong-item source on the `if-tier-has-any` FALSE path (the actual bug).

### 2. `Call 'sub-get-results'` › `parameters.workflowInputs.value.contact_id`
- before: `={{ $('sorento-sub-respond-findcontact-respond').first().json.id }} ` (trailing space)
- after:  `={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}`
- why: drop stray trailing whitespace (hygiene; expression value unchanged).

### 3. `tier-probe` › `parameters.workflowInputs.value.contact_id`
- before: `={{ $('sorento-sub-respond-findcontact-respond').first().json.id }} ` (trailing space)
- after:  `={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}`
- why: same hygiene, keeps the two sibling get-results callers identical.

Untouched on both nodes: `workflowId` (`t4QvrtrPnTwRU6br` on the fork), `semantic_input`, `user_prompt`, all other inputs/options.

## Verification (REST GET after update)
- Three leaves assert exact values: OK.
- Per-node `parameters` sha1 vs PRE backup: only `Call 'sub-get-results'` and `tier-probe` differ; all other 156 nodes identical.
- `connections` byte-identical; all non-parameter node fields identical (158 nodes).
- `validate_node_config` on both edited nodes: `valid: true`. (`validate_workflow` on this MCP server only accepts SDK `code`, not a workflowId; the `update_workflow` call itself ran validation — no errors, only the pre-existing warnings: hardcoded x-api-key / disconnected orphaned egress nodes / `Transcribe a recording` expression prefix.)
- Safety: no egress node touched; the fork remains guarded exactly as before.

## Note for tester/orchestrator — draft vs active
`update_workflow` created a **draft** (`versionId 8d13d386…`, `activeVersionId` still `2063daa8…`). Per LESSONS #17/#23, calls that resolve the fork (and any exec of the fork) run the ACTIVE version, so a UAC run against the fork will still hit the bug until the draft is published. Before this edit the fork's draft == active (versionIds equal), so the draft now differs from active by ONLY these 3 leaves — safe to `publish_workflow` when the orchestrator/tester wants to run it. Coder did not publish (out of scope for this task).

## Live promotion payload (for the user-gated promote step — NOT done)
Live `9qVyfUxmRQqrpGRMDLRuz` (backup `LIVE-9qVyfUxmRQqrpGRMDLRuz-efa21057-PRE.json`, versionId `efa21057-a7e0-4be3-b6af-f8ced2c3749c`) carries the identical three "before" values on nodes `Call 'sub-get-results'` and `tier-probe` (its get-results target is `rysSPgUssLDf6xJc` — leave that untouched). The promotion is the same 3× `setNodeParameter` ops verbatim:
```json
[{"type":"setNodeParameter","nodeName":"Call 'sub-get-results'","path":"/workflowInputs/value/tool","value":"={{ $('tool-filter').first().json.name }}"},
 {"type":"setNodeParameter","nodeName":"Call 'sub-get-results'","path":"/workflowInputs/value/contact_id","value":"={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}"},
 {"type":"setNodeParameter","nodeName":"tier-probe","path":"/workflowInputs/value/contact_id","value":"={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}"}]
```
Then sha-verify the two nodes + publish check per LESSONS #24/#25 (confirm live draft == active before publishing).

## Orchestrator addendum
Fork draft `8d13d386…` was published by the orchestrator (test workflow only; `activeVersionId == versionId == 8d13d386…`) and verified: `tests/runs/promotion-hotfix-20260818.{md,json}`.
