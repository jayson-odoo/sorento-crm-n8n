# Live promotion log — 2026-07-06

User-gated live promotion executed per pre-flight `promote-preflight-20260706.md` §4. Verification was **STRUCTURAL ONLY** (get_workflow_details + sha of changed leaves + connection scan). **ZERO functional execution** (no execute_workflow / test_workflow / message injection) against ANY live workflow — no real contact was reached, no prod mutation.

Result: **BOTH STAGES SHIPPED CLEAN.** All post-publish shas match targets; both workflows are published (versionId == activeVersionId, no stale draft).

---

## Byte-exact source verification (pre-write)
- `fork_sysmsg.txt` (stripped) → `d8bfbf4bf74d735ddd4db7ff20b86a068d06693072fdfded7f2e1eb7dcbaec91` ✓
- `fork_outexch.js` (stripped) → `f092f0e9074152b0f8e36054a41504b767261b68d79d6cecdbc17090846cef8b` ✓

---

## STAGE 1 — live sub `XTODTw-dJcV0uRdC056hG` (sub-semantic-parser)

| | pre-write (baseline) | post-publish (active) | target | match |
|---|---|---|---|---|
| activeVersionId | `0a931adb-d5e8-4914-bca7-15e1e6201957` | `303a25ec-8782-460c-b115-483083573051` | — | — |
| versionId==activeVersionId | yes (no stale draft) | yes (no stale draft) | — | ✓ |
| `AI Agent`.systemMessage | `cb813c67…` (expected) | `d8bfbf4bf74d735d…7dcbaec91` | `d8bfbf4b…` | ✓ |
| `output_exchange`.jsCode | `b9c60033…` (expected) | `f092f0e9074152b0…90846cef8b` | `f092f0e9…` | ✓ |
| node count | 8 | 8 | — | ✓ |

- Changed nodes: **only** `AI Agent` + `output_exchange`. Other 6 nodes byte-identical to backup (`When Executed…`, `OpenAI Chat Model`, `Postgres Chat Memory`, `test-reformulator-bypass`, `mock-reformulator-output`, `suggest-follow-up`). No connection change.
- **Gotchas hit (draft-only, live never at risk):**
  1. Initial `setNodeParameter` with path `/parameters/options/systemMessage` **mis-nested** into `parameters.parameters.*` (the JSON-Pointer is relative to `.parameters`, so `/parameters/...` double-prefixes). Real leaf unchanged → detected by draft sha still == baseline. Fixed with `updateNodeParameters {replace:true}` supplying the clean full `.parameters` (drops the stray key) — sibling params `promptType`/`text`/`mode` preserved from backup.
  2. `output_exchange` jsCode box-drawing divider runs (`─`) mis-counted when emitted as `─` escapes (deterministically off by a few on long runs). Root-caused: **raw `─` glyphs count correctly; `─` escapes on long runs drift.** Re-emitted the two `── divider ──` lines with raw glyphs → exact.
- New activeVersionId: **`303a25ec-8782-460c-b115-483083573051`**.
- Backup for revert: `tests/backups/live-sub-XTODTw-0a931adb-20260706.json` (prior active `0a931adb`).

---

## STAGE 2 — live spine `9qVyfUxmRQqrpGRMDLRuz` (sorento-consume-main, ACTIVE)

| | pre-write (baseline) | post-publish (active) |
|---|---|---|
| activeVersionId | `540c4b66-a5f1-4a9f-bace-1e84c7159f4e` | `887ef75b-a2fe-4809-9185-f65b2be4a82c` |
| versionId==activeVersionId | yes (no stale draft) | yes (no stale draft) |
| node count | 80 | 83 (+3) |
| `escalate-catalog`.jsCode | `0612475273bb…` (live-now) | `0508b847d661…` == target ✓ |
| `build-suggest-offer`.jsCode | `90ea33e6a1ac…` (live-now, incl 09:12Z UUID-guard) | `f1558d5a1397…` == target ✓ |

Pre-write structural confirmations: If2-TRUE fanned to exactly `Call 'sub-human-intervention'` + `tag-out-of-scope`; If10[0]→tag-escalate-offer, If10[1]→If9; If9's only inbound = If10; the 3 new nodes did not pre-exist.

### Nodes added (3, pure adds; NO `is_test`/mock/test scaffolding — grep-verified)
- `is-escalation-declined` (`n8n-nodes-base.if` 2.3) — boolean-true on `$('Call 'sub-query-reformulator'').first().json.output.escalation?.escalation_declined === true`
- `tag-escalation-declined` (`n8n-nodes-base.set` 3.4) — `branch_kind = "escalation_declined"` (string)
- `divert-suggest-yes` (`n8n-nodes-base.if` 2.3) — boolean-true IIFE: `is_escalation_confirmation===true && suggest_pick_context===true && suggested_team==='customer_service' && suggested_agent==='order_enquiries' && !preferred_assignee_id`

### Param edits (business-logic only)
- `escalate-catalog`: surgical insert of `case 'escalation_declined':` (response `'Escalation declined.'`, manualResponse=true, includeResponse=true, is_escalate_offer=false) after the `out_of_scope` case. **Live's line-1 divider preserved** (differs from clone only cosmetically). Final = live-now + this 6-line case (sha `0508b847`).
- `build-suggest-offer`: applied ONLY the `isCsOrder` date-trim hunk on top of live-now (which already carried the 09:12Z UUID-guard). Verified live-now↔clone differ by ONLY this hunk, so target = clone body (sha `f1558d5a`).

### Post-publish connection scan (ACTIVE `887ef75b`) — all correct
- `If2`[0] → **divert-suggest-yes ONLY**; `If2`[1] → `If10`
- `divert-suggest-yes`[0] → `tag-escalate-offer`; `divert-suggest-yes`[1] → { `Call 'sub-human-intervention'`, `tag-out-of-scope` } (live fan-out restored)
- `If10`[0] → `tag-escalate-offer`; `If10`[1] → `is-escalation-declined`
- `is-escalation-declined`[0] → `tag-escalation-declined`; `is-escalation-declined`[1] → `If9`
- `tag-escalation-declined`[0] → `escalate-catalog`
- `If9` inbound = **is-escalation-declined ONLY**
- `Call 'sub-human-intervention'` inbound = divert-suggest-yes ONLY (If2 edge removed)
- `tag-out-of-scope` inbound = divert-suggest-yes ONLY (If2 edge removed)
- `tag-escalate-offer` inbound = If10 + divert-suggest-yes
- `escalate-catalog` inbound = 7 tags + `tag-escalation-declined`

Node-diff vs backup: only `escalate-catalog` + `build-suggest-offer` params changed among common nodes; 3 new nodes added; 0 removed. No egress/human-intervention/assign/SLA/PIC/CRM-write node edited.

- New activeVersionId: **`887ef75b-a2fe-4809-9185-f65b2be4a82c`**.
- Backup for revert: `tests/backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-540c4b66-20260706.json` (prior active `540c4b66`).

---

## Revert (if ever needed)
`publish_workflow(<id>, versionId=<prior active>)`:
- Stage 1: `publish_workflow("XTODTw-dJcV0uRdC056hG", "0a931adb-d5e8-4914-bca7-15e1e6201957")`
- Stage 2: `publish_workflow("9qVyfUxmRQqrpGRMDLRuz", "540c4b66-a5f1-4a9f-bace-1e84c7159f4e")`

## Safety attestation
Zero functional executions against any live workflow. All edits landed in draft, sha-gated on the draft **before** each publish, and re-sha-gated on the active **after** each publish. A wrong draft is inert (parents resolve only the published version), so live production was never exposed to an unverified state at any point.
