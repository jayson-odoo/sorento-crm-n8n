# Axis-gate revert — clone `txiPzSxy3Pclsz6v` restored to LIVE baseline

**Date:** 2026-07-14
**Target:** clone spine `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v` (DEV clone only — live `9qVyfUxmRQqrpGRMDLRuz` untouched, no promote)
**Reason (user-directed):** DROP the incoming-axis-gate re-architecture. The original bug (container query "…to Sorento warehouse" → greedy fallback products → spurious picklist) is already fixed at source in the live parser `XTODTw-dJcV0uRdC056hG` (`'warehouse'` in `DOMAIN_BLOCKED_HINTS.incoming`). The axis-gate additionally broke plain product-ETA queries (SRT6632-GM / SRTWB1543 dead-ended "Could not find incoming"). Net: revert the 3 axis-gate business nodes to the prod-correct behavior.

## Baselines / versions
| item | value |
|---|---|
| LIVE spine active versionId (source of truth for revert) | `bcdb5633-f760-451b-b0a8-fc03a0d884c8` |
| clone active versionId BEFORE revert (iter-4 axis-gate) | `0008b89a-0386-4b9d-a15a-28e349c26842` |
| clone active versionId AFTER revert (this change) | **`677efeb3-fb55-46aa-b186-fa0a72757900`** |

## Nodes reverted (match by NAME on clone; overwrite `parameters.jsCode` with live's)
All three are `n8n-nodes-base.code` (typeVersion 2). Post-publish sha-gate: each node's `jsCode` on the published clone is now **byte-IDENTICAL** to its live counterpart (verified via REST GET on both, `jq -r .parameters.jsCode | cmp`).

| node (name) | live node id | clone node id | before → after |
|---|---|---|---|
| `disallowed-entity-gate` | `5928ae64-39d2-4d5d-bd85-f9ea47901f8b` | `b07ca5db-1b95-4249-97d1-63d10a112ca4` | axis-matrix gate (AXIS map, IDENTIFIER/PRODUCT per-token classification, `not_found_axis_tokens`/`not_found_product_tokens`, iter-4 single-exact product admit) → **live Domain↔Entity-Type gate** (compatibility + REQUIRED_TYPES + REQUIRE_SPECIFIC_DOMAINS ambiguity picklist). No axis buckets, no product/axis not-found emission. |
| `compile-current-state` | `0804657c-f600-450b-8ae9-17972406f0e9` | `7a130a0c-530f-4bfb-a8f2-059ec71c2ea2` | had extra "Option B partial not-found itemization" IIFE (appended `not_found_axis_tokens` / `not_found_product_tokens` bullet lists on the happy path) → **removed**; back to live (escalate catalog + suggest/member overrides + friendly disclaimers only). |
| `build-suggest-offer` | `7972abd8-5d6b-40ff-9d38-152782cd8091` | `7972abd8-5d6b-40ff-9d38-152782cd8091` (same id) | had §21.8 incoming empty-AND special-case wording ("No incoming stock of {products} in {containers}…") → **removed**; back to live generic D2 template ("No {noun} for {askedCode}. Try: …"). |

## What did NOT change (verified)
- Node-param diff between pre-edit and post-edit clone = **exactly these 3 nodes**; node count 114→114.
- `settings` unchanged (`availableInMCP:true`, `callerPolicy`, `binaryMode`, `executionOrder:v1` all preserved) — edits done via MCP `update_workflow` (granular, leaves settings intact); REST PUT was NOT used because the public API can't round-trip `availableInMCP`.
- Console-persistence lane untouched: `pg-get-session`, `pg-upsert-session`, `log-incoming-chat-history-n8ntest` still bound to Postgres cred `Dnnofg8Xb27VQOhI`; `session-get-gate`/`session-save-gate`/`console-incoming-gate`/`sim-inject-gate` present, types unchanged; send fork `ublq9nSlrpz63xan` call refs intact.
- All egress guards / orphaned egress nodes untouched (same DISCONNECTED_NODE warnings as before — LESSONS #13).

## Method
1. REST GET live (`9qVyfUxmRQqrpGRMDLRuz`) + clone → `jq -r .parameters.jsCode` per node; confirmed the 3 clone nodes carried only axis-gate deltas (AXIS/`not_found_axis`/`not_found_product` present on clone, absent on live).
2. MCP `update_workflow` `setNodeParameter /jsCode` with the live jsCode (ASCII-safe JSON-encoded from the live bytes to avoid transcription drift on box-drawing/em-dash/emoji chars), then `publish_workflow`.
3. Post-publish sha-gate: fetched published clone via REST, `cmp` each node's jsCode vs live → all 3 IDENTICAL. (First publish left 2 cosmetic-only mismatches — gate line-78 comment banner box-char count, compile trailing newline — corrected in a second pass; now byte-exact.)

## Validation
`update_workflow` write-time validation passed on every apply — only pre-existing warnings (hardcoded `x-api-key` on http nodes, DISCONNECTED_NODE on the deliberately-orphaned egress nodes, OpenAI `builtInTools`, Transcribe expression-prefix), all present in live per LESSONS #13. (This SDK-based n8n-mcp has no validate-by-id tool; `validate_workflow` validates raw SDK code, not an existing workflow — write-time validation is the equivalent gate.)

## Prereq note
The clone has NO Schedule Trigger node — it is driven by `When Executed by Another Workflow` (executeWorkflowTrigger). There is therefore no schedule trigger that could consume the shared prod `main-message-list`; nothing to disable.
