# Plan — Unify edit-field error nodes + CS-routing / member-escalation flow

Status: designed (grilled 2026-06-28). Build target = TEST clone `txiPzSxy3Pclsz6v`. **Never edit live spine `9qVyfUxmRQqrpGRMDLRuz`.** Promote each delta separately, user-gated, after its regression gate.

## Motivation

Two coupled problems:
1. The spine has ~7 scattered `Set` ("Edit Fields") nodes that each hold one escalation/error **message string**, plus a parallel 7-arm `isExecuted` ladder in `compile-current-state` that derives per-branch behavior flags. Error-prone, strings flung across the canvas.
2. New routing requirements: order enquiries must escalate to **customer_service** (not warehouse) and offer the salesperson a **picklist of CS members** to route to a specific person; general enquiries must split **product → purchasing_product** vs **product-attachment-certificate → purchasing_certification** (both currently land on bare `purchasing`).

Unifying (1) into a data catalog makes the new branches in (2) drop in as data, not new nodes + ladder arms.

## Ground-truth findings (from live spine + subs, 2026-06-28)

- 9 `Set` nodes named `Edit Fields`..`Edit Fields8`. Only **7 set `escalate_message`** and converge on `compile-current-state`. The other 2 are unrelated and **stay**: `Edit Fields` (sets `attachments` → Split Out), `Edit Fields2` (sets `not_allowed_check_stock` bool → If8; read by `validator`).
- The 7 escalate branches, their feeder, and the behavior `compile-current-state` derives:

  | branch_kind | fed by | feeder type | message | manualResponse | includeResponse |
  |---|---|---|---|---|---|
  | not_found | not-found-error-message | Code | ref (upstream `escalate_message`) | `!require_specific` | true |
  | access_choice | access-level-choice-message | Code | ref (upstream `escalate_message`) | true | true |
  | demand_qty | If8 (true) | IF | literal "Please specify your demand quantity" | true | true |
  | not_supported | not-supported-domain (true) | IF | literal (no goods-receive/SPO) | true | true |
  | clarify_menu | If1 (true) | IF | literal "are you asking about these?" menu | true | true |
  | escalate_offer | If10 (true, `correction==true`) | IF | literal "…escalate to {suggested_team}?" | true | true |
  | out_of_scope | If2 (true) | IF | literal "proceed to escalate to {suggested_team}" | true | **false** |

- **`isExecuted` on an IF node is true whenever it runs — it cannot tell which output fired.** That is *why* the current code keys off the per-branch `Edit Fields` (each on one output). ⇒ deleting all setters and inferring kind from routing-node `isExecuted` is INFEASIBLE for the 5 IF-fed branches. **Decision: uniform tag-setters** (all 7 self-declare `branch_kind`).
- Two offer points emit the phrase "Would you like me to escalate to {team} team?": `not-found-error-message` (no-result path, unless `require_specific`) **and** `EF7`/`correction`. `compile-current-state` already detects either via `offeredEscalation = /would you like me to escalate/i`.
- `disallowed-entity-gate` already renders **numbered** disambiguation lists (`1. …`), but doesn't say "reply with the number".
- Routing is emitted **by the LLM** in the parser sub (`XTODTw-dJcV0uRdC056hG`) system prompt (lines ~244–254); enum currently `purchasing | marketing_product | marketing_form | warehouse | marketing_promotion_{sorento,cabana,mocha}`. The sub has an `output_exchange` Code node (deterministic post-processor) and a `test-reformulator-bypass`/`mock-reformulator-output` path.
- Parser already supports **positional refs**: emits `reference_positions` (1-based into previous result set); spine resolves against stored `last_result_set`.
- Assignment today is **round-robin only**: `sub-human-intervention` (`rrYXzE61gCNUck_zmXe-G`) takes `(team, agent)`, calls CRM `POST /external/next-assignee {agent_code, team_code, policy_code:NORMAL, tier:1}` → one assignee with full `{assignee_id, assignee_respond_user_id, policy_id, tier_response_hours, tier_resolution_hours, name, email}`; downstream assign+SLA+comment consume that shape. **No path to assign a specific chosen person.**
- CRM (`sorento_crm/sorento_crm_backend`) already has internally `AccessAgentService.list_team_members(team_id)`, `get_next_assignee(agent_id, team_id)`, and `next_assignee.py` resolves `(agent_code/team_code[,tier]) → team_id` + SLA tier. Routes registered in `app/api/v1/external/__init__.py`.

## Locked design decisions (grill outcomes)

1. **Unify mechanism = catalog + branch-kind tag** (not single converging node, not cosmetic).
2. **Hybrid catalog with refs**: literal kinds own their text; dynamic kinds (not_found, access_choice) declared as refs to their upstream Code node; all behavior flags in the one table.
3. **Uniform tag-setters** for all 7 branches (each sets `branch_kind`); catalog Code node at convergence resolves; `compile-current-state` ladder collapses to one `$json.branch_kind` read. (Corrected from an earlier "delete setters / infer from isExecuted" idea — infeasible for IF-fed branches.)
4. **Two→three promotions, regression-gated.** Refactor is pure (0-diff in **replay** mode, no LLM activation). Features get their own reviewed-diff cycles. Never bundle (can't separate regression from intended change).
5. **Team taxonomy:** keep `purchasing` (for `incoming`/incoming_stock_enquiries). Add `customer_service`, `purchasing_product`, `purchasing_certification`. Map order→customer_service/order_enquiries; master_products→purchasing_product/general_enquiries; product_attachment(certificate)→purchasing_certification/general_enquiries; product_attachment(photo/drawing)→marketing_product (unchanged).
6. **Member-listing scope = customer_service / order_enquiries only.** Purchasing split is routing-only (no per-member picker).
7. **Offer trigger = on failure (Q7=B).** Bot still answers orders; member offer fires wherever an escalate-offer already fires (no-result *and* correction), gated by team+agent.
8. **Pick capture = reuse `last_result_set` + `reference_positions`** with one selection list and numbered UX everywhere. A `selection_context` marker in session_vars (`member_offer` | `entity_choice` | null) lets a deterministic code node interpret a position without the parser guessing which list it indexes.
9. **Assign-specific = extend `next-assignee` with optional `preferred_assignee_id`** (Q9=A): valid team member → return that member, same shape, **no cursor advance**; absent → round-robin as today (backward-compatible).
10. **Routing derivation moves into parser sub `output_exchange`** (deterministic), preserving `output.routing.{suggested_team,suggested_agent}` contract → zero spine ref churn.
11. **Parser-sub changes tested via a parser-sub clone** (Q12=A) pointed to by the TEST clone; promote to the shared sub only after review. Mocks (`mock-reformulator-output`) used only for spine-side deterministic regression, not to validate the parser edit itself.
12. **Fallbacks:** 0 members→generic offer+round-robin; bare "yes"→round-robin (offer message hints "if no preference, just reply yes"); invalid pick→re-render same numbered list once (keep marker); "no"→decline + clear marker; new question→abandon + clear marker.
13. **Testing the stateful 2-round flow = chained canary runs** (Q15=A): turn-1 writes session, turn-2 reads. `list-members` joins the replay pinned-reads set.

## Δ1 — Catalog refactor (pure; 0-diff replay gate)

- Add tiny `Set` per escalate branch → `branch_kind` (replace each EF1/3/4/5/6/7/8 1:1). Keep `Edit Fields` + `Edit Fields2`.
- New **catalog** Code node at the convergence point: maps `branch_kind` → `{message|ref, manualResponse, includeResponse, require_specific, is_escalate_offer}`. `is_escalate_offer = (kind==escalate_offer) || (kind==not_found && !is_clarification)`.
- Rewrite `compile-current-state`: drop the 7-arm `isExecuted` ladder, read catalog output. Preserve everything else (quick_reply from access-level-choice-message, last_result_set build, reconcileEntities, business_query summary).
- **Gate:** `regress-replay` (LLMs + reads pinned from golden) → demand **zero** `replay_node_diffs`. Review → promote business-logic diff only (guards stripped), user-gated.

## Δ2 — Routing extraction + purchasing split + order→CS (intended diffs)

- In parser sub `output_exchange`: derive `routing.{suggested_team,suggested_agent}` from `domain_hint` (+ `attachment_type` for product_attachment cert-vs-photo, + `brand` for promotion) from a static table; implement previous-routing carry-forward (when current turn has no routing signal, reuse `previous_conversation_state`). Remove routing-emission rules from the LLM prompt; LLM keeps emitting `domain_hint`, `entities`/`attachment_type`, `brand`.
- New enum: add `customer_service, purchasing_product, purchasing_certification`; keep `purchasing`.
- `disallowed-entity-gate`: append "reply with the number" to numbered disambiguation.
- **CRM (owned by us):** create the 3 teams; link to agents (order_enquiries / general_enquiries / incoming_stock_enquiries); populate members incl. `respond_user_id`; configure SLA policy/tiers. **Deploy before the n8n delta.**
- **Test:** parser-sub clone capture/replay (validates derivation) + spine replay → only the intended routing/message diffs (order→customer_service, purchasing split, numbered-UX); everything else 0-diff. Promote.

## Δ3 — CS member-escalation flow

- **CRM (owned by us):**
  - `GET /external/team-members?team_code&agent_code[&tier]` → resolve team_id (reuse `next_assignee` resolver) → `list_team_members` → `[{user_id, name, respond_user_id, email, sort_order}]` (active members only, ordered by sort_order).
  - Extend `next-assignee`: optional `preferred_assignee_id` → validate it is a member of the resolved team → return that member in the identical shape; **do not advance the round-robin cursor**. Absent → unchanged round-robin.
- **Spine (clone):**
  - Post-catalog gated enrichment: `IF (is_escalate_offer && suggested_team=='customer_service' && suggested_agent=='order_enquiries')` → `build-cs-member-offer` (HTTP list-members → compose numbered message + "reply with the number" + "if no preference, just reply yes" hint → store members as `last_result_set` items `{idx,label:name,uuid:user_id,respond_user_id}`, set `selection_context='member_offer'`) → merge → `compile-current-state`. Else passthrough.
  - Round 2: `resolve-escalation-assignee` Code node before `Call 'sub-human-intervention'` — if `selection_context=='member_offer'` && `reference_positions` present → `last_result_set[reference_positions[0]-1].user_id` → set `explicit_assignee_id`; bare-yes (no position) → null. Add `explicit_assignee_id` to the human-intervention call inputs. Clear `selection_context` after consume.
  - `sub-human-intervention`: add `explicit_assignee_id` input (backward-compatible default null) → pass as `preferred_assignee_id` to the `get-round-robin-assignee` (next-assignee) call. No other downstream change.
- **Parser (clone):** one rule — a member-pick reply (number / name / "the second one" / "yes") after a member-offer ⇒ `is_escalation_confirmation=true` and emit `reference_positions` (numbered UX makes this native; name→position resolved from the visible offer text). Feed `selection_context` via `previous_conversation_state`.
- **Fallbacks:** per decision 12.
- **Test:** chained canary runs (happy 2-round + 5 fallbacks; assert egress log `would_send` offer shape and `would_write` assignment carries correct `preferred_assignee_id` / round-robin). `list-members` added to replay pinned-reads. Spine replay guards no-regression on existing branches. Deploy CRM endpoints first. Promote.

## Cross-cutting / prerequisites

- Cross-repo order: **CRM deploy precedes the dependent n8n delta** (404 otherwise). Δ2 needs team data; Δ3 needs endpoints. CRM owned by us.
- Parser-sub clone must be created and the TEST clone's `Call 'sub-query-reformulator'` repointed to it before Δ2/Δ3 parser edits.
- Safety unchanged: all egress on the clone stays guarded/orphaned; reads against prod allowed; assignment writes only via the guarded sub (logged as `would_write` in test).

## Open / to confirm at build time

- Exact `branch_kind` literals + catalog table values (mirror current behavior precisely).
- SLA policy/tier choice for customer_service assignments (reuse NORMAL tier-1 as today unless specified).
- Whether `selection_context`/member `last_result_set` collides with any existing `last_result_set` consumer assuming business-record shape — guard those reads on the marker.
