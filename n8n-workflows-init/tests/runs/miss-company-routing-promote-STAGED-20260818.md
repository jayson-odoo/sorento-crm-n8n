# Promote record — miss-company-routing (round 2 + round 3) → LIVE — **STAGED, NOT APPLIED** (2026-08-18)

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

### 2. Spine `9qVyfUxmRQqrpGRMDLRuz` — `PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` (one PUT, 127 → 136 nodes; 5 changed + 9 new + 11 connection keys)

| node | change | resulting sha |
|---|---|---|
| `escalation-context` | jsCode := repo `spine-escalation-context.js` (== clone) | `cca7a245` |
| `build-cs-member-offer` | jsCode := repo `spine-build-cs-member-offer.js` (== clone, round-3 rev-2 F-R3-5 team-label note) | `63c1c46e` |
| `escalate-catalog` | LIVE body + anchored insert of the `case 'offer_hold': … break;` block after `case 'escalation_declined'` (F6-i — live's `#9 _ct` hunk KEPT; NOT the clone body `0168df84`) — `PAYLOAD-node-escalate-catalog.js` | `5ec7d6a7` |
| `compile-current-state` | LIVE body `0b0912f1` + (1) rev-3 Δ4 merge-arm hunk (live lines 75–86 → clone 75–108) **keeping live's sentence "choose who to route to. Reply the number or name:"** (F6-ii) + (2) miss/clarify block (clone lines 1082–1148) inserted before the unique final `return output;`. Live→payload diff = exactly those two hunks; clone's unpromoted lane blocks (spec-search N-1a/N-2 etc.) NOT carried — `PAYLOAD-node-compile-current-state.js` | `492a8591` |
| `cs-offer-gate` (LIVE node, round 3) | conditions := clone (g1 `is_escalate_offer` unchanged; g2 = ONE boolean IIFE — routing pair ∈ {customer_service/order_enquiries, purchasing/incoming_stock_enquiries}, try→false; old g3 removed) — `tests/diffs/miss-company-routing/spine-cs-offer-gate.expr.txt`; live before-shape == clone PRE (3 conds) | g2 `cfa8c18e` |
| + `miss-roster-gate` (if 2.3, leftValue `d24dd81b` — round-3 rev-2 allowlist gate), `miss-roster-plan` (`0b7907d6`), `get-cs-members-miss` (== live `get-cs-members` params/cred), `build-miss-member-offer` (`68eef4c7`), `clarify-company-gate` (`63e30a3d`), `clarify-company-reply` (`7ff06aa8`), `offer-hold-gate` (if 2.3, `8f14a430`), `offer-hold-reply` (`7ff06aa8`), `tag-offer-hold` (set 3.4 `branch_kind=offer_hold`) | copied from clone `0557b0b4` byte-equal | — |
| connections | `central-exchange[0]→miss-roster-gate` {T→`miss-roster-plan→get-cs-members-miss→build-miss-member-offer→dym-transform-partial`, F→`dym-transform-partial`}; `escalation-context[0]→clarify-company-gate` {T→`clarify-company-reply` (terminal), F→`Call 'sub-human-intervention'`}; `If-ideate[1]→offer-hold-gate` {T→`offer-hold-reply→tag-offer-hold→escalate-catalog`, F→`If10`}. `If-ideate[0]` stays live's `ideate-turn-http`. | — |

Sweep of the payload: vs LIVE — param mismatches on exactly the 5 nodes above (4 round-2 + `cs-offer-gate`), 9 new, 0 dropped, connection keys
changed = exactly the 11 above; vs CLONE `0557b0b4` — the 13 touched nodes byte-equal except `escalate-catalog` and
`compile-current-state` (by design, F6); the 10 new/rewired connection entries byte-equal to the clone.

### 3. HI sub `rrYXzE61gCNUck_zmXe-G` / sendmsg `aoydkG1dbItXR5jXFEQsP` / replay `aROEBlQyyoQaB7a1` — nothing (R7 §4/§5, R4/R5 no norm rule).

## Apply order (when authorized) + post-checks

1. Re-fetch all three; assert versionIds/updatedAt above unchanged and draft==active — else STOP and re-measure.
2. PUT parser payload → assert `activeVersionId==versionId`, `output_exchange` `a68c5992`, systemMessage `138008c2`.
3. PUT spine payload → assert active, 136 nodes, the 5 shas above (incl. `miss-roster-gate` `d24dd81b`, `cs-offer-gate` g2 `cfa8c18e`), 9 new nodes present, the 3 rewires, hotfix leaves intact;
   full param-hash sweep vs `PRE-9qVy…` shows exactly the 5 changed + 9 new + 11 connection keys.
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
| **added (round 3)** | `crm_incoming_stock_list`, `crm_incoming_stock_by_product`, `crm_incoming_stock_shipments` (domain `incoming`, purchasing/incoming_stock_enquiries) | captain repro "incoming for MUB6201"; envelope shape identical to orders; offer names `*<Co>* purchasing team` (D1: the domain's own routing team — roster/HI/phrase stay in lockstep); `cs-offer-gate` widened so incoming not-found gets the same picker (D3=b) |
| left out | `crm_inventory_stock_balance_list` (stock) | captain decision 2: no balance row == qty 0 == honest answer (one allowlist row flips it — D2 default none) |
| left out | `crm_marketing_promotions_list`, `crm_marketing_promotion_products_list` | absence of a promotion is a definitive marketing fact; nothing for the other company's team to look up |
| left out | `crm_master_products_list`, `crm_master_product_attachments_list`, `crm_certificates_list` | that company simply lacks the record/file — honest answer; help still reachable via request_for_help |
| N/A by construction | resource attachments, forms, portal link, GRN/SPO, ideate | back end never stamps `lookup_companies` → gate shape legs can never pass |

New precedence leg: when `crossdomain-render` produced a block (`_xdBlock.any === true`) the gate yields (one offer per turn). Every leg is
fail-closed (missing tool-filter / non-allowlisted tool / routing mismatch / throw ⇒ false ⇒ turn byte-identical). Round-3 rev-2 evidence:
`tests/runs/miss-company-routing-round3-rollup-20260818.md` (N1–N10, R-M1/M5/M8/B, S — PASS, 25 execs zero egress); rev-1 blocker F-R3-4
(`Object.prototype` banned by the n8n expression sandbox → LESSONS #45) fixed in rev-2. Prerequisite P1: purchasing/incoming rosters exist for
both companies (Sorento: Jereen Tee; Mocha: Lucas) — an empty roster would fail closed (byte-identical turn), not mis-route.
