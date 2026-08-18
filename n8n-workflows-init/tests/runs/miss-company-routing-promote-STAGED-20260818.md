# Promote record — miss-company-routing (round 2) → LIVE — **STAGED, NOT APPLIED** (2026-08-18)

Status: payload built and gate-verified against live **spine `7aba1447`** (post promotion-hotfix, PR #24) and live
**parser `89b63c51`**. Nothing has been PUT/published. Awaiting captain word (`needs-decision [key=promote-round2]`).
Map: `tests/reviews/miss-company-routing.md` R7 (rev-5 body per R8/R9). Method when authorized: n8n public REST
`PUT /workflows/{id}` with the staged payloads (byte-exact; PUT auto-activates on this instance — verify
`activeVersionId == versionId` after each), sub before parent (parser first, then spine).

## Live at staging time (draft == active on all three; re-fetch and re-assert before applying)

| workflow | versionId (draft == active) | updatedAt |
|---|---|---|
| spine `9qVyfUxmRQqrpGRMDLRuz` | `7aba1447-61f6-490d-89b4-22d1a196716d` | 2026-08-18T03:47:32Z |
| parser `XTODTw-dJcV0uRdC056hG` | `89b63c51-57f0-45fd-96ce-2df103c2fb9d` | 2026-08-18T00:03:06Z |
| HI sub `rrYXzE61gCNUck_zmXe-G` | `9249e00e-3dd9-4766-8c49-2f32f8f66bda` | 2026-08-18T00:04:13Z |

Backups (rollback sources): `tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PRE-*.json`.
Rollback = PUT the PRE body back (or `publish_workflow` the versionId above).

## R7 gates re-measured on `7aba1447` / `89b63c51` — ALL PASS (hotfix touched only `Call 'sub-get-results'` + `tier-probe`)

| gate | expected (R7) | measured |
|---|---|---|
| parser `output_exchange.jsCode` sha | `3ee5b658` | `3ee5b658` ✓ |
| parser `AI Agent.options.systemMessage` sha | `583bcfb0` | `583bcfb0` ✓ |
| parser trigger name / inputs | `When Executed by Another Workflow` carries `previous_conversation_state` | ✓ |
| spine `escalation-context.jsCode` | `8c12563c` | `8c12563c` ✓ (== rev-8 base ⇒ repo body applies whole) |
| spine `build-cs-member-offer.jsCode` | `37a1b023` | `37a1b023` ✓ (== rev-8 base ⇒ repo body applies whole) |
| spine `escalate-catalog.jsCode` | `8b4ae985`, exactly one `case 'escalation_declined'`, no `offer_hold` | ✓ (1 / 0) |
| spine `compile-current-state.jsCode` | `0b0912f1`, unique final `return output;`, deps `_ideate,_sug,_mem,_dymLastResultSet,qf` | ✓ |
| new nodes absent on live | 9 names | ✓ (0 present; new node ids do not collide) |
| edge `central-exchange` | single edge → `dym-transform-partial` (its only inbound) | ✓ |
| edge HI inbound | exactly one: `escalation-context` | ✓ |
| edge `If-ideate[1]` | → `If10`, If10's only inbound | ✓ |
| `get-cs-members-miss` source | mirror LIVE `get-cs-members` (params + credential) | ✓ clone node params/credential == live `get-cs-members` byte-equal |
| every `$('…')` reference in touched/new bodies exists on live | — | ✓ (none missing) |
| hotfix leaves preserved | `Call 'sub-get-results'` `tool={{ $('tool-filter').first().json.name }}`, `contact_id` no trailing space; `tier-probe` same; `if-tier-ask` `loose`/v2 | ✓ untouched in payload |
| no fork ids / `is_test` leaves leaked | `wI5RkNGW3EOJfBdo`, `vUfFUDjLAuMaeQE6`, `t4QvrtrPnTwRU6br`, `aQUmwMVplmNcyUVc`, `tWm5DYLxfypmVC1T` | ✓ zero occurrences; `is_test` appears only in a comment inside `clarify-company-reply`/`offer-hold-reply` |

## Payloads (exact live change)

### 1. Parser `XTODTw-dJcV0uRdC056hG` — `PAYLOAD-XTODTw-dJcV0uRdC056hG.json`
`output_exchange.jsCode` := `tests/diffs/miss-company-routing/parser-fork-output_exchange.js` (**`a68c5992`**, rev-5),
`AI Agent.options.systemMessage` := `parser-fork-AI-Agent.systemMessage.txt` (`138008c2`). All other nodes/connections =
live as-is (the fork's `Postgres Chat Memory` and its OLDER `suggest-follow-up` are NOT carried — live's
`suggest-follow-up` keeps its dash-normalise hunk).

### 2. Spine `9qVyfUxmRQqrpGRMDLRuz` — `PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` (one PUT, 127 → 136 nodes)

| node | change | resulting sha |
|---|---|---|
| `escalation-context` | jsCode := repo `spine-escalation-context.js` (== clone) | `cca7a245` |
| `build-cs-member-offer` | jsCode := repo `spine-build-cs-member-offer.js` (== clone) | `c7046c45` |
| `escalate-catalog` | LIVE body + anchored insert of the `case 'offer_hold': … break;` block after `case 'escalation_declined'` (F6-i — live's `#9 _ct` hunk KEPT; NOT the clone body `0168df84`) — `PAYLOAD-node-escalate-catalog.js` | `5ec7d6a7` |
| `compile-current-state` | LIVE body `0b0912f1` + (1) rev-3 Δ4 merge-arm hunk (live lines 75–86 → clone 75–108) **keeping live's sentence "choose who to route to. Reply the number or name:"** (F6-ii) + (2) miss/clarify block (clone lines 1082–1148) inserted before the unique final `return output;`. Live→payload diff = exactly those two hunks; clone's unpromoted lane blocks (spec-search N-1a/N-2 etc.) NOT carried — `PAYLOAD-node-compile-current-state.js` | `492a8591` |
| + `miss-roster-gate` (if 2.3, leftValue `024d91e3`), `miss-roster-plan` (`0b7907d6`), `get-cs-members-miss` (== live `get-cs-members` params/cred), `build-miss-member-offer` (`68eef4c7`), `clarify-company-gate` (`63e30a3d`), `clarify-company-reply` (`7ff06aa8`), `offer-hold-gate` (if 2.3, `8f14a430`), `offer-hold-reply` (`7ff06aa8`), `tag-offer-hold` (set 3.4 `branch_kind=offer_hold`) | copied from clone `0557b0b4` byte-equal | — |
| connections | `central-exchange[0]→miss-roster-gate` {T→`miss-roster-plan→get-cs-members-miss→build-miss-member-offer→dym-transform-partial`, F→`dym-transform-partial`}; `escalation-context[0]→clarify-company-gate` {T→`clarify-company-reply` (terminal), F→`Call 'sub-human-intervention'`}; `If-ideate[1]→offer-hold-gate` {T→`offer-hold-reply→tag-offer-hold→escalate-catalog`, F→`If10`}. `If-ideate[0]` stays live's `ideate-turn-http`. | — |

Sweep of the payload: vs LIVE — param mismatches on exactly the 4 nodes above, 9 new, 0 dropped, connection keys
changed = exactly the 11 above; vs CLONE `0557b0b4` — the 13 touched nodes byte-equal except `escalate-catalog` and
`compile-current-state` (by design, F6); the 10 new/rewired connection entries byte-equal to the clone.

### 3. HI sub `rrYXzE61gCNUck_zmXe-G` / sendmsg `aoydkG1dbItXR5jXFEQsP` / replay `aROEBlQyyoQaB7a1` — nothing (R7 §4/§5, R4/R5 no norm rule).

## Apply order (when authorized) + post-checks

1. Re-fetch all three; assert versionIds/updatedAt above unchanged and draft==active — else STOP and re-measure.
2. PUT parser payload → assert `activeVersionId==versionId`, `output_exchange` `a68c5992`, systemMessage `138008c2`.
3. PUT spine payload → assert active, 136 nodes, the 4 shas above, 9 new nodes present, the 3 rewires, hotfix leaves intact;
   full param-hash sweep vs `PRE-9qVy…` shows exactly the 4 changed + 9 new + 11 connection keys.
4. Re-assert HI `9249e00e` unchanged. Record POST versionIds here. Any mismatch ⇒ PUT PRE bodies back.
5. Watch (R7 §7): partial-miss order turn; both-miss offer → clarify → "srt"/"sorento" → HI Sorento pair; "yes mocha" on a
   single-company offer stays that company; `next-assignee`/`team-members` 404 "No team found" = revert trigger.
