# Promote record — miss-company-routing (round 2 + round 3 rev-3) → LIVE — **STAGED, NOT APPLIED** (2026-08-18)

> **Round-3 rev-3 re-stage (captain console corrections, 2026-08-18):** member roster/picker is ORDERS-ONLY; incoming AND
> stock per-company misses get the PLAIN escalation offer (frozen phrase naming the miss company + its routing team —
> purchasing / warehouse), no roster GET, no picker; a qty-0 stock row counts as an answer, only a fully absent company is
> a miss; `cs-offer-gate` REVERTED to its live shape (D3=b undone). Clone `7db593b0` (tester Q1–Q9+S PASS, 23 execs zero
> egress). Spine payload sweep is now **4 changed + 10 new + 12 connection keys, 127 → 137 nodes**; parser payload
> unchanged. Superseded staging deltas (rev-2 `d24dd81b`/`63c1c46e` cs-offer-gate widening) are gone from the payload.

> **Round-3 fold-in (captain HOLD on `promote-round2`, 2026-08-18):** the spine payload was refreshed with the round-3 rev-2 clone
> bodies (clone `txiPzSxy3Pclsz6v` @ `e54e114e`, tester rev-2 PASS 25 execs zero egress). Delta vs the round-2 staging: `miss-roster-gate`
> leftValue `024d91e3` → `d24dd81b` (tool/domain/routing allowlist + crossdomain precedence leg, sandbox-safe), `build-cs-member-offer`
> `c7046c45` → `63c1c46e` (F-R3-5 team-label note; orders/single output byte-identical), and ONE additional live node `cs-offer-gate`
> (conditions: 3 → 2, g2 = allowlist IIFE `cfa8c18e`, live before-shape identical to clone PRE) so incoming not-found turns get the same
> picker (D3=b). Parser payload unchanged. See §"Round-3 domain audit" below and `plans/miss-company-routing-plan.md` §Round 3.

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
| spine `cs-offer-gate` conditions (round 3) | 3 conditions, == clone PRE shape (`ce99a16c` jq -c) | ✓ |
| `tool-filter` / `crossdomain-render` exist on live (new gate legs) | — | ✓ (`tool-filter` `bffb4c3a` == clone) |
| no `prototype`/`constructor`/`__proto__` in any non-Code node expression (LESSONS #45) | — | ✓ 0 hits |
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

### 2. Spine `9qVyfUxmRQqrpGRMDLRuz` — `PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` (one PUT, 127 → 137 nodes; 4 changed + 10 new + 12 connection keys)

| node | change | resulting sha |
|---|---|---|
| `escalation-context` | jsCode := repo `spine-escalation-context.js` (== clone) | `cca7a245` |
| `build-cs-member-offer` | jsCode := repo `spine-build-cs-member-offer.js` (== clone, round-3 rev-2 F-R3-5 team-label note) | `63c1c46e` |
| `escalate-catalog` | LIVE body + anchored insert of the `case 'offer_hold': … break;` block after `case 'escalation_declined'` (F6-i — live's `#9 _ct` hunk KEPT; NOT the clone body `0168df84`) — `PAYLOAD-node-escalate-catalog.js` | `5ec7d6a7` |
| `compile-current-state` | LIVE body `0b0912f1` + (1) the Δ4 merge-arm hunk **keeping live's sentence "choose who to route to. Reply the number or name:"** (F6-ii) + (2) the rev-3 miss/clarify block (plain-offer arm incl.) re-extracted from clone `7db593b0` (`6bff997d`) by its comment anchors, inserted before the unique final `return output;`. Live→payload diff = exactly those two hunks (5 hunk ranges incl. the merge-arm split); clone's unpromoted lane blocks NOT carried — `PAYLOAD-node-compile-current-state.js` | `c864f204` |
| + 10 nodes copied from clone `7db593b0` byte-equal: `miss-roster-gate` (if 2.3, leftValue `92ca1ccc` — rev-3 LANE: orders×2 members:true, incoming×3 members:false, stock `crm_inventory_stock_balance_list` inventory/warehouse/general_enquiries members:false; xd precedence; sandbox-safe), `miss-roster-plan` (`c4a19b6f`, LANE lockstep + team/members stamped), **`miss-members-gate` (NEW if 2.3, `14576e69` — TRUE→roster, FALSE→plain)**, `get-cs-members-miss` (== live `get-cs-members` params/cred), `build-miss-member-offer` (`fab11982`, plain arm), `clarify-company-gate` (`63e30a3d`), `clarify-company-reply` (`377c2df4`, plain-clarify copy branch), `offer-hold-gate` (if 2.3, `8f14a430`), `offer-hold-reply` (`377c2df4`), `tag-offer-hold` (set 3.4 `branch_kind=offer_hold`) | — |
| connections | `central-exchange[0]→miss-roster-gate` {T→`miss-roster-plan→miss-members-gate` {T→`get-cs-members-miss→build-miss-member-offer`, F→`build-miss-member-offer`} →`dym-transform-partial`, F→`dym-transform-partial`}; `escalation-context[0]→clarify-company-gate` {T→`clarify-company-reply` (terminal), F→`Call 'sub-human-intervention'`}; `If-ideate[1]→offer-hold-gate` {T→`offer-hold-reply→tag-offer-hold→escalate-catalog`, F→`If10`}. `If-ideate[0]` stays live's `ideate-turn-http`. | — |

Sweep of the payload: vs LIVE — param mismatches on exactly the 4 nodes above (`cs-offer-gate` reverted to live byte-equal, dropped from the payload delta), 10 new, 0 dropped, connection keys changed = exactly 12; vs CLONE `7db593b0` — all touched/new nodes byte-equal except `escalate-catalog` and `compile-current-state` (by design, F6 anchored transplants); the new/rewired connection entries byte-equal to the clone.

### 3. HI sub `rrYXzE61gCNUck_zmXe-G` / sendmsg `aoydkG1dbItXR5jXFEQsP` / replay `aROEBlQyyoQaB7a1` — nothing (R7 §4/§5, R4/R5 no norm rule).

## Apply order (when authorized) + post-checks

1. Re-fetch all three; assert versionIds/updatedAt above unchanged and draft==active — else STOP and re-measure.
2. PUT parser payload → assert `activeVersionId==versionId`, `output_exchange` `a68c5992`, systemMessage `138008c2`.
3. PUT spine payload → assert active, 137 nodes, the shas above (incl. `miss-roster-gate` `92ca1ccc`, `miss-members-gate` `14576e69`, ccs `c864f204`; `cs-offer-gate` must equal live), 10 new nodes present, the 3 rewires + miss-members-gate split, hotfix leaves intact;
   full param-hash sweep vs `PRE-9qVy…` shows exactly the 4 changed + 10 new + 12 connection keys. Post-PUT: smoke ONE answered turn (LESSONS #45).
   ⚠️ Live currently carries a content-empty UI draft `cfd0e776` ≠ active `7aba1447` (nodes/connections/settings identical to the
   PRE backup — verified twice); the PUT supersedes it. Re-check before applying that the draft is still content-identical.
4. Re-assert HI `9249e00e` unchanged. Record POST versionIds here. Any mismatch ⇒ PUT PRE bodies back.
5. Watch (R7 §7): partial-miss order turn; both-miss offer → clarify → "srt"/"sorento" → HI Sorento pair; "yes mocha" on a
   single-company offer stays that company; `next-assignee`/`team-members` 404 "No team found" = revert trigger.

## Round-3 domain audit (captain requirement 2) — which per-company lookups offer the miss escalation

Ground truth (planner R3.0): the `*<Co>:* no <X> records for <code>.` line is rendered by the get-results sub's `output-structurer` for ANY
tool whose CRM envelope stamps `lookup_companies` (>1) — so the offer scope is decided solely by `miss-roster-gate`'s allowlist.

| status | tools (allowlist key = `tool-filter` name) | why |
|---|---|---|
| covered (round 2) | `crm_order_management_orders_list`, `crm_order_management_orders_by_product_list` (domain `order`, CS/order_enquiries) | original captain journey |
| **added (round 3, PLAIN — no roster, no picker; captain console corrections)** | `crm_incoming_stock_list`, `crm_incoming_stock_by_product`, `crm_incoming_stock_shipments` (incoming → purchasing/incoming_stock_enquiries); `crm_inventory_stock_balance_list` (inventory → warehouse/general_enquiries; qty-0 row = answered, only an absent company is a miss) | captain repros "incoming/stock for MUB6201"; plain frozen phrase `…escalate to *<Co>* <team> team?`, "yes" → that company's team round-robin, both-miss → company-only clarify; member picker stays ORDERS-ONLY (`cs-offer-gate` back to live shape) |
| left out | `crm_marketing_promotions_list`, `crm_marketing_promotion_products_list` | absence of a promotion is a definitive marketing fact; nothing for the other company's team to look up |
| left out | `crm_master_products_list`, `crm_master_product_attachments_list`, `crm_certificates_list` | that company simply lacks the record/file — honest answer; help still reachable via request_for_help |
| N/A by construction | resource attachments, forms, portal link, GRN/SPO, ideate | back end never stamps `lookup_companies` → gate shape legs can never pass |

New precedence leg: when `crossdomain-render` produced a block (`_xdBlock.any === true`) the gate yields (one offer per turn). Every leg is
fail-closed (missing tool-filter / non-allowlisted tool / routing mismatch / throw ⇒ false ⇒ turn byte-identical). Round-3 rev-2 evidence:
`tests/runs/miss-company-routing-round3-rollup-20260818.md` (N1–N10, R-M1/M5/M8/B, S — PASS, 25 execs zero egress); rev-1 blocker F-R3-4
(`Object.prototype` banned by the n8n expression sandbox → LESSONS #45) fixed in rev-2. Prerequisite P1: purchasing/incoming rosters exist for
both companies (Sorento: Jereen Tee; Mocha: Lucas) — an empty roster would fail closed (byte-identical turn), not mis-route.
