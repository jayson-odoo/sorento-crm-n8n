# Promote record — brand-company-routing → LIVE (2026-08-18, captain-gated)

Captain gate: explicit "can promote to live" (2026-08-18, after testing the republished clone at the chat console).
Executed per the promote checklist in `tests/reviews/brand-company-routing.md` §4. Method: n8n public REST
`GET`/`PUT /workflows/{id}` with `jq --rawfile` (byte-exact bodies); on this instance PUT auto-activates
(`activeVersionId == versionId` immediately — verified on every step).

## P0 backups

Fresh pre-promote dumps (draft==active on all three, no stale drafts):
`tests/backups/brand-company-routing/LIVE-PROMOTE-20260818/{9qVyfUxmRQqrpGRMDLRuz,rrYXzE61gCNUck_zmXe-G,XTODTw-dJcV0uRdC056hG}.json`
— spine `d6f6b90c-…`, HI sub `5018a189-…`, parser `9df39ff6-…`. These are the rollback sources.

## Pre-flight gates (all PASS)

- Live rebase-source shas unchanged: spine `disallowed-entity-gate` `8e1b5470…`, `build-cs-member-offer` `bd3a2b24…`,
  `compile-current-state` `3fa9d170…`, parser `output_exchange` `67a73561…`, `AI Agent.systemMessage` `0555a9e8…`.
- P3a: live HI call `726da5dc-…` has exactly ONE inbound edge — `divert-suggest-yes[1]` (plus its parallel
  `tag-out-of-scope` fan-out). No bypassing edge to rewire.
- Every `$('…')` cross-node reference in the new bodies exists on live (incl. `tier-gate`, which the clone lacks).

## Applied

| workflow | new active versionId | changes |
|---|---|---|
| parser `XTODTw-dJcV0uRdC056hG` | `89b63c51-57f0-45fd-96ce-2df103c2fb9d` | `output_exchange.jsCode` = `3ee5b658…`, `AI Agent.systemMessage` = `583bcfb0…` (P1, byte-exact repo files) |
| HI sub `rrYXzE61gCNUck_zmXe-G` | `9249e00e-3dd9-4766-8c49-2f32f8f66bda` | trigger inputs += `brand_code`,`company_id`; `get-round-robin-assignee` jsonBody += both axes; `conversation-sla-tracking-create` jsonBody: `team_set_code` → rr echo `?? team`, += both axes — live URL `…/conversation-sla-tracking` KEPT (P2; §2 transformations applied to live's own body shape, which differs from the fork's — fork bodies NOT pasted). CRM `ConversationSLATrackingCreate` has no brand/company fields; pydantic ignores extras (verified in schema) — harmless today, correct if the endpoint later learns them. Live's `test-guard`/`test-guard-record` (unreachable in prod, `is_test` never sent) untouched; no `chat?` node on live. |
| spine `9qVyfUxmRQqrpGRMDLRuz` | `efa21057-a7e0-4be3-b6af-f8ced2c3749c` | One atomic PUT: `disallowed-entity-gate` = `ca13af1c…`, `build-cs-member-offer` = `37a1b023…` (repo files, rebase sources unchanged); `compile-current-state` = `0b0912f1…` — the TWO hunks (Δ4 merge-arm labelling/note/omission + routing-axes/roster-plan persistence block) transplanted onto the live body, preserving live's own picker sentence ("choose who to route to. Reply the number or name:") so single-company output stays byte-identical to live; `cs-roster-plan` (`f1dc05ef…`) + `escalation-context` (`8c12563c…`) added; rewires `cs-offer-gate[0]→cs-roster-plan→get-cs-members` and `divert-suggest-yes[1]→escalation-context→Call 'sub-human-intervention'` (`tag-out-of-scope` edge kept); `get-cs-members` url += brand/company segments, `fullResponse:true`, `onError:continueRegularOutput`; HI call += the two rev-8 `isExecuted`-guarded inputs + schema entries (workflowId stays `rrYXzE61…`, no `is_test`). All five body shas re-fetched and verified post-publish. |
| replay `aROEBlQyyoQaB7a1` | draft `d7355680-…` (unpublished, as designed) | `Diff.jsCode` = rev-4 container-scoped `norm()` rule (`16c13603…`), applied 2026-08-18 pre-promote (P4). Overwritten body was this change's own rev-1 rule — verified by diff before replacing. |

The clone `txiPzSxy3Pclsz6v` was republished with the final rev-8 bodies the same day (version `b5c29d54-…`,
sha-verified) — clone and live now carry the same business logic; the clone additionally carries its
fail-closed guards and the chat-console assignee-surfacing rewire in HI fork `vUfFUDjLAuMaeQE6` (`0fdba9e5-…`).

## Waived / open (captain-accepted by promoting)

- P6's full UAC re-run on the rev-8 clone (B2/B2b/B3rev2/B4/B5/B5b–B5f/B6) and the AC8 sample replay were NOT
  machine-executed; the captain tested the republished clone manually at the chat console and gated the promote on that.
- P5 watch stands: on the first real CS escalation, check the `next-assignee` response echo
  (`company_id`/`brand_code`/`team_set_code`) matches the offer. Revert trigger: any 404
  "No team found … in company …" from `next-assignee` (a company missing its `customer_service` team set —
  admin config, not code). Rollback = PUT the P0 backup bodies back (auto-activates).
