# Δ2 + Δ3 build results (2026-06-28)

## Clones (safe test targets; live untouched)
- spine: txiPzSxy3Pclsz6v (101 nodes after Δ1+Δ3)
- parser clone: SB8wEXKdpITfhYXA "sub-query-reformulator TEST (delta2)" (active) — spine repointed here
- human-intervention clone: vUfFUDjLAuMaeQE6 "sub-human-intervention TEST (delta3)" (active) — spine repointed here
- NOTE: clones activated via REST POST /workflows/{id}/activate (publish_workflow needs availableInMCP, set via UI only). Not MCP-published.

## Δ2 routing (deterministic, in parser output_exchange deriveRouting)
- Offline: tests/unit/delta2-routing.test.js GREEN (11 cases).
- Applied: master_products->purchasing_product, product_attachment(cert)->purchasing_certification, order->customer_service. incoming stays purchasing. prompt bullets+enum synced.
- Routing already deterministic pre-change (deriveRouting overwrites output.routing); only 3 team strings remapped.

## Δ3 member-escalation flow
- Offline: tests/unit/delta3-member-flow.test.js GREEN (offer + 6 pick/fallback cases).
- CRM (user-owned): GET /external/team-members -> [{user_id,name,respond_user_id,email,sort_order}]; next-assignee body preferred_assignee_id (skip round-robin, 404 if not member). LIVE.
- Spine: escalate-catalog -> cs-offer-gate(IF is_escalate_offer && customer_service && order_enquiries) -> get-cs-members(HTTP) -> build-cs-member-offer -> compile. compile: _mem override + selection_context + member last_result_set.
- Parser clone output_exchange: member-pick override (position->preferred_assignee_id; yes->round-robin; no->decline; new q->abandon).
- human-intervention clone: explicit_assignee_id input -> preferred_assignee_id body + logged in test-guard-record.

### Live canary verification
- Round 1 (canary-csoffer-r1c): real CS roster fetched (Ms Tan/Sarah/Sandy Lim/Nur), numbered offer + hints sent, last_result_set=4 members, selection_context=member_offer, routing customer_service/order_enquiries. GREEN.
- Round 2 (canary-cspick-r2, spine via mock pick idx 3): human-intervention would_write explicit_assignee_id=Sandy uuid (4dbed5e6...), team customer_service, agent order_enquiries; sendmsg null (out_of_scope); selection_context cleared. GREEN. All egress blocked (safe).

## Remaining (deferred gates, not blockers to build)
- Δ1: access_choice canary (contact 430229069) + 600-row replay.
- Δ2: real-LLM parser run confirming deriveRouting end-to-end (logic offline-proven; only 3 string swaps in existing fn).
- Δ3: real chained run (session-persisting regress-capture mode) so the REAL parser emits reference_positions for a numbered reply + member-block resolves live. Spine wiring + parser logic each verified separately.
- Product Q: Sarah has respond_user_id=null -> exclude null-respond members from offer, or let CRM reject targeted assign?
- Promotion: all changes on clones; promote each delta to live (parser sub XTODTw, human-intervention rrYXzE61, spine 9qVyfUxmRQqrpGRMDLRuz) user-gated after gates pass.
