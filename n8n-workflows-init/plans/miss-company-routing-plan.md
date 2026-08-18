# miss-company-routing — result-aware escalation scoping (plan, rev-1)

Captain decisions (2026-08-18, verbatim intent):
1. **Partial miss on an order enquiry** (one company has records, the other none): the reply keeps the found
   results and the presenter's miss line, then goes **straight to the miss company's member picker**
   ("please choose who to route to (reply with the number)" + that company's CS members). A bare "yes" and a
   number pick both route to the **miss** company.
2. **Quantity 0 is NOT a miss.** A stock row with 0 on hand is an answer; this feature is scoped to the
   order-records lane only and must not fire on stock/incoming turns.
3. **Both companies miss + bare "yes"** (today: both axes null → default pool): do NOT silently assign —
   reply a clarify ("which company — Mocha or Sorento? or reply a number/name") and accept a **company-name
   reply** as the pick; `next-assignee` with `company_id` and no `preferred_assignee_id` already round-robins
   that company's pool (verified — no CRM change).

Builds ON TOP of the promoted brand-company-routing change (live spine `efa21057-…`, clone `b5c29d54-…`).
Build target: the clone `txiPzSxy3Pclsz6v` + parser fork `wI5RkNGW3EOJfBdo` (verify wiring first per AGENTS.md).
Live untouched until the captain's gate.

## 0. Grounding (verified 2026-08-18 on live execution 12901422/12901255 + clone dump `b5c29d54`)

- The per-company order reply — including "*Sorento:* no orders records for MUB6201." — is composed by the
  CRM MCP presenter inside the `sub-get-results` envelope (`response`). The envelope carries the structured
  signals we need: `lookup_companies: [{id,name}…]` (companies queried) and per-answer
  `fields[{key:"company_name", value}]`. **Miss companies = lookup_companies minus the companies that appear
  in `answers[].fields[key=company_name]`.** Only compute when `has_result === true`, the domain is orders,
  and EVERY answer carries a `company_name` key field (else no offer — conservative fail-open). Stock rows
  (qty 0 included) are answers, so decision 2 holds automatically.
- Case A (partial miss) rides the **happy path**: `escalate-catalog`/`cs-offer-gate`/`cs-roster-plan` never
  run (they live on the miss branches), and `crossdomain-compose`'s answered arm didn't fire (its `_xdBlock`
  is the cross-DOMAIN probe, not per-company orders). Consequence verified: today's state after case A has
  **no** "Would you like me to escalate" phrase, so even a bare "yes" would not confirm an escalation.
- Parser contracts (locked): `output_exchange` recognises an escalation confirmation by
  `/would you like me to escalate/i` against `previous_conversation_state.response`; a number/name pick
  resolves against the persisted `last_result_set` rows (Δ3 retarget arm). Both are reused, not modified —
  the new turn must therefore (a) append the frozen phrase to the persisted `variables.response`, and
  (b) persist the member rows into `last_result_set` with **continuous idx numbering** (the reply's order
  blocks are numbered `1.`, members continue `2..N` — "a stray 2 must still pick" the right row).

## 1. Spine clone changes (new mini-lane + two merge hunks)

| node | change |
|---|---|
| `miss-roster-gate` (NEW, If) | On the happy path after `Call 'sub-get-results'`/validator: fires when `has_result`, routing is `customer_service`/`order_enquiries`, and the computed miss set is non-empty. Exact insertion point: coder picks the seam between the validator and `compile-current-state` that runs on answered order turns; fail-closed (gate false) on any missing signal. |
| `miss-roster-plan` (NEW, code v2) | One item per **miss** company: `{plan_idx, company_id, company_name, brand_code, multi_company}` — brand looked up from `disallowed-entity-gate`'s `routing_companies` entry for that company (try/catch, null when absent). Mirrors `cs-roster-plan`'s item shape so downstream consumers (ccs persistence, escalation-context) treat it identically. |
| `get-cs-members-miss` (NEW, HTTP) | Same URL pattern/credential/options as `get-cs-members` (brand/company query segments, `fullResponse:true`, `onError: continueRegularOutput`). Dedicated node — do NOT re-enter the miss lane's `get-cs-members`; the two lanes continue differently. |
| `build-miss-member-offer` (NEW, code v2) | Renders the picker: `Please choose who to route to (reply with the number):` + `n. Name (Company)` lines (numbering continues after the reply's existing numbered blocks), + `If you have no preference, just reply 'yes' and we'll assign automatically.` Emits `miss_member_rows` (cs_last_result_set-shaped rows incl. `company_id/company_name/brand_code/company_ids`), `miss_offer_text`, `miss_roster_plan` (the plan items that contributed members — same intersection rule as rev-5). Zero members from every miss company ⇒ emits nothing (turn stays byte-identical). |
| `compile-current-state` (hunk) | New answered-turn merge arm (precedent: Δ4 `_merge`): when `build-miss-member-offer` ran and produced rows — append `miss_offer_text` + the frozen phrase `Would you like me to escalate to ${team} team?` to `user_response` (phrase BEFORE the picker, keeping the locked wording intact), append the phrase to persisted `variables.response`, extend `last_result_set` with the member rows (continuous idx), and persist `routing_roster_plan`/`routing_company`/`routing_brand` from the MISS plan (single miss company ⇒ that pair verbatim — the bare-"yes" rev-4 arm then routes there with no further change). All keys null-inert. |
| `escalation-context` (arm) | New `company_pick` arm: when the parser emits `escalation.company_pick`, resolve it against the persisted `routing_roster_plan`/`routing_companies` (case-insensitive name or id match) → that row's `(company_id, brand_code)` verbatim, `routing_source:'company_pick'`. Sits ABOVE the multi-company-unpicked arm. |
| `clarify-company-gate` (NEW, If) + `clarify-company-reply` (NEW, code) | Between `escalation-context` and `Call 'sub-human-intervention'`: when `routing_source === 'multi_company_unpicked'` → divert to a clarify reply ("Both X and Y teams are listed — reply a number, a name, or just the company (X / Y) and I'll assign automatically.") sent via the existing send path, escalation NOT executed, state preserved so the next reply still resolves (offer context, incl. the frozen phrase, re-persisted). Everything else → HI call unchanged. ⚠️ this diverts an arm that previously always reached the HI call — the HI-call input guards (rev-8 `isExecuted`) already tolerate it. |

## 2. Parser fork changes (`wI5RkNGW3EOJfBdo`, rebase-on-live discipline as before)

- `output_exchange`: in the escalation-confirmation context (the same arm that today resolves number/name
  picks), when the reply matches a company named in the prior state's `routing_companies`/`routing_roster_plan`
  (case-insensitive, word-boundary) and matches NO member row → emit `output.escalation.company_pick = <name>`
  with `is_escalation_confirmation: true` and no `preferred_assignee_id`. A reply matching a member still wins
  (member pick outranks company pick).
- systemMessage: one short addition documenting the company-name reply on escalation-confirmation turns.

## 3. Replay norm

`company_pick`/`routing_source` etc. ride existing containers; new state keys introduced here
(`last_result_set` member rows on answered turns) surface as diffs against golden by design (Lesson 40).
No new `norm()` rule expected; re-check at review.

## 4. Safety

All existing clone guards untouched; the new lane's only egress-adjacent node is `get-cs-members-miss`
(CRM **read**, allowed) and the clarify reply through the already-guarded send path. UAC must re-assert §0
zero-egress (S1–S6).

## 5. UAC (tests/miss-company-routing-UAC.md)

- **M1** partial miss (order found in Mocha only, product in both): reply = results + presenter miss line +
  phrase + Sorento-only picker (6 members, numbering continues after the order block); roster call carries
  `company_id=<sorento>` (+brand when the plan row has one); state: `routing_roster_plan` = 1 Sorento row,
  phrase present in `variables.response`.
- **M2** M1 then number pick → parser resolves member uuid; HI inputs carry the Sorento pair
  (`routing_source: picked_member`).
- **M3** M1 then bare "yes" → HI inputs carry the Sorento pair (rev-4 verbatim arm; no code change needed —
  assert it).
- **M4** both-miss (case B) then bare "yes" → NO HI call, clarify-company reply sent, zero egress; then reply
  "mocha" → HI inputs carry the Mocha pair (`routing_source: company_pick`).
- **M5** stock enquiry with a qty-0 row (screenshot shape) → no picker, no miss lane (gate false).
- **M6** regression: single-company product B3rev2-shape turn unchanged; non-order domains unchanged.
- **S** §0 zero-egress checklist on every case.

## Round 3 — incoming-stock + all-domain audit (2026-08-18)

Captain order (`firstmate/data/brand-routing-n8n/round3-fold-in.md`): round 2 is HELD, not promoted alone. Extend it so an
**incoming-stock per-company miss** offers escalation exactly like the orders path (same picker, offer-hold, partial/qty-0/both-miss
rules), AUDIT every per-company reply builder, fold everything into ONE combined round-2+3 live change. `[key=promote-round2]` is closed
by this fold-in. Builds ON TOP of clone `txiPzSxy3Pclsz6v` @ `0557b0b4-…` + parser fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2-…` (guards untouched).
**scope: `deterministic`** (one If-expression change; the parser fork is NOT touched — parser-tier turns below are regression re-runs only).

### R3.0 Grounding (verified read-only 2026-08-18)

- **Repro on the clone, real parser:** exec `12918600` (chat console, contact 437264483, "incoming for MUB6201"). `tool-filter.name ==
  "crm_incoming_stock_list"`; parser `domain_hint:"incoming"`, `routing {suggested_team:"purchasing", suggested_agent:"incoming_stock_enquiries"}`;
  `central-exchange` envelope: `has_result:true`, `lookup_companies:[Mocha 38db4f20…, Sorento 00000000-…0001]`, ONE answer with
  `fields[0] {key:"company_name", value:"Mocha"}`, `response` ends `*Sorento:* no incoming stock records for MUB6201.`, one attachment
  (packing list), `_xd {active:false, team:"purchasing", missing:[]}`; `disallowed-entity-gate.routing_companies` = 2 rows (Sorento row
  `brand_code:"mocha"`). **`miss-roster-gate` took the FALSE branch** — the only failing legs are `domain_hint !== 'order'` and the
  CS/order routing pair. Every other signal the round-2 lane needs is already present on the incoming turn.
- **Where the miss line comes from (corrects §0's wording):** the CRM presenter (`sorento_crm_mcp/presenters.py`, worktree
  `agent-af782288cc8ee12b6` @ `0c415d6e9`) stamps `lookup_companies` (passthrough key, `_PASSTHROUGH_KEYS`) and a leading
  `{key:"company_name", label:"Company"}` row field per builder; the sentence `*<Co>:* no <result_type> records for <codes>.` is rendered by
  the get-results sub's **`output-structurer`** (fork `t4QvrtrPnTwRU6br` = what the clone calls; "mc-label 2026-08-17" block) for ANY tool
  whose envelope carries `lookup_companies.length > 1` and whose rows are company-attributed. So the miss line is domain-agnostic; the
  ROUND-2 GATE is what scoped the offer to orders.
- **Backend stamps `lookup_companies` only when the lookup spans >1 company** (`company_scope.stamp_lookup_companies`: companies of the
  products asked about ∪ companies of the rows returned; single-company scope short-circuits). Services that stamp: orders (list + by-product),
  incoming (list, by-product, shipments), inventory stock, promotions (list + promotion-products), master products, product attachments,
  certificates. NOT stamped: resource attachments, forms, portal link, GRN/goods-receive, SPO — those envelopes can never satisfy the gate's
  shape legs (fail-closed by construction).
- **Team plumbing is team-agnostic already:** `get-cs-members-miss` URL takes `agent_code/team_code` from the parser routing;
  `compile-current-state` `_mcTeam = qf.routing.suggested_team`; `escalation-context`/HI carry the parser team; parser
  `output_exchange` line ~1221 re-applies the PRIOR routing on a bare "yes" (`derived ?? priorRouting ?? 'customer_service'`); the
  confirmation contract is the domain-free prefix `/would you like me to escalate/i`. Nothing outside the gate is domain-keyed except the
  pre-existing **`cs-offer-gate`** (the NOT-FOUND-path member picker — still CS/order only, see finding F-R3-1) and `crossdomain-zeroset`'s
  own `_xd.team` map (inventory→warehouse, incoming→purchasing — consistent with the parser).
- **New interaction the orders lane never had:** incoming/inventory answered turns can carry a `crossdomain-render` block; `crossdomain-compose`
  then appends ITS OWN frozen phrase (`Would you like me to escalate to ${xb.team} team?`) + quick replies. Two offers on one turn would break
  the "yes" contract. `crossdomain-render` runs BEFORE `central-exchange` (edge order: validator → crossdomain-zeroset → crossdomain-gate →
  probe → render → If6 → central-exchange → miss-roster-gate), so the gate can and must yield to it.

### R3.1 Domain audit — every tool the get-results envelope can carry

Grounding columns: presenter builder = `sorento_crm_mcp/presenters.py` (`_BUILDERS`, `_RESULT_TYPE`); stamp = backend service calling
`stamp_lookup_companies`; routing = parser fork systemMessage "== ROUTING ==" + `output_exchange` `deriveRouting`. "Offer?" = round-3 decision.

| tool (`tool-filter.name`) | domain_hint | presenter row `company_name`? | backend stamps `lookup_companies`? | miss line noun | parser routing (team / agent) | per-company miss means | Offer? |
|---|---|---|---|---|---|---|---|
| `crm_order_management_orders_list` | order | yes (`_orders_list` L308) | yes (`order_service.list_orders`) | `orders records` | customer_service / order_enquiries | the other company's CS may hold the order — genuine hand-off | **COVERED (round 2)** |
| `crm_order_management_orders_by_product_list` | order | yes (L334) | yes (`list_orders_by_product`) | `orders records` | customer_service / order_enquiries | same | **COVERED (round 2)** — the gate now names the tool explicitly |
| `crm_incoming_stock_list` | incoming | yes (`_incoming_list` L386) | yes (`incoming_list`) | `incoming stock records` | purchasing / incoming_stock_enquiries | the other company's purchasing knows its inbound — captain: genuine | **ADDED (round 3)** |
| `crm_incoming_stock_by_product` | incoming | yes (L423) | yes (`incoming_for_product`) | `incoming stock records` | purchasing / incoming_stock_enquiries | same | **ADDED** |
| `crm_incoming_stock_shipments` | incoming | yes (L465) | yes (`incoming_shipments`) | `incoming shipments records` | purchasing / incoming_stock_enquiries | same (container listing) | **ADDED** (same lane; shape legs protect) |
| `crm_inventory_stock_balance_list` | inventory | yes (`_stock` L812) | yes (`inventory_service.list_stock`) | `stock records` | warehouse / general_enquiries | "no balance row" is the same business fact as a 0-on-hand row (captain decision 2: qty 0 is an answer) — an honest answer, not a hand-off | ~~LEFT OUT~~ **COVERED-PLAIN (rev-3** — captain correction 2026-08-18: plain offer, no members; a qty-0 ROW is still an answer, only a company with ZERO rows is a miss**)** |
| `crm_marketing_promotions_list` | promotion | yes (`_promotions` L493) | yes (`marketing_service.list_promotions`) | `promotions records` | marketing_promotion / general_enquiries | no promotion exists at that company — a definitive marketing fact, nothing for the other team to look up | **LEFT OUT** (D2 flip available; offer would read `*Sorento* marketing_promotion team`, HI resolves that team per company) |
| `crm_marketing_promotion_products_list` | promotion | yes (L511) | yes (`list_promotion_products`) | `promotion products records` | marketing_promotion / general_enquiries | same | **LEFT OUT** |
| `crm_master_products_list` | master_products | yes (`_products` L532) | yes (`product_service.list_products`) | `products records` | purchasing_product / general_enquiries | product not in that company's catalogue (only reachable via spec/attribute filters — a product in both masters returns a row) — honest answer | **LEFT OUT** |
| `crm_master_product_attachments_list` | product_attachment | yes (L562) | yes (`list_product_attachments`) | `product attachments records` | marketing_product (photo/drawing) or purchasing_certification (certificate) / general_enquiries | that company has no file — honest answer; the customer can still ask for help (`request_for_help`) | **LEFT OUT** (D2) |
| `crm_certificates_list` | product_attachment (certificate) | yes (`_certificates` L655) | yes (`certificate_query_service.list_certificates`) | `certificates records` | purchasing_certification / general_enquiries | same | **LEFT OUT** (D2) |
| `crm_resource_attachments_list` | resource_attachment | yes (L754) | **no** | never rendered | — | n/a (documents are shared) | N/A — gate cannot fire (no `lookup_companies`) |
| `crm_forms_management_forms_list` | forms | no | no | never | marketing_form / marketing_form | n/a | N/A |
| `crm_portal_link_get` | portal_link | no | no | never | — | n/a | N/A |
| GRN / SPO tools (`crm_procurement_grn_*`, spo) | goods_receive / spo_allocation | no (`_generic`) | no | never | none (parser emits null routing) | n/a | N/A |
| ideate | ideate | — (no CRM tool) | — | — | none | n/a | N/A |

Verified: presenter/stamp columns from code (paths above); the incoming envelope shape from clone exec `12918600`; the orders shape from round
2 (`12901422`). No CRM probe was spent — the captain's own repro is the incoming evidence. **Fixture warning:** MUB6201's Mocha incoming row
(container TXGU8711127) has ETA 2026-08-25 — after arrival the turn becomes both-miss; the tester re-probes and substitutes a same-shape code.

Summary: covered = orders (2 tools) · added = incoming (3 tools) · left out = stock, promotions (2), master products, product attachments,
certificates (decision 2 + "honest answer" rule; each is a one-row allowlist flip) · N/A by construction = resource attachments, forms, portal
link, GRN/SPO, ideate. *(Superseded in part by rev-3: stock moves to covered-plain; incoming moves to plain (offer, no members); the member
picker becomes orders-only. See "Round 3 rev-3" below.)*

### R3.2 Recommended gate generalisation (the ONLY body change)

`miss-roster-gate.leftValue` — replace the two round-2 legs (`domain_hint !== 'order'`, CS/order routing pair) with a **tool allowlist that pins
domain AND routing pair together**, plus one new precedence leg. Everything else in the expression (has_result, lookup_companies, every answer
labelled with a `company_name` key field, non-empty miss set, outer try→false) is byte-identical:

```
const LANE = {  // R3.1 allowlist — tool ⇒ the parser domain it must ride on + the routing pair the roster call / HI will use
  'crm_order_management_orders_list':            { domain: 'order',    team: 'customer_service', agent: 'order_enquiries' },
  'crm_order_management_orders_by_product_list': { domain: 'order',    team: 'customer_service', agent: 'order_enquiries' },
  'crm_incoming_stock_list':                     { domain: 'incoming', team: 'purchasing',       agent: 'incoming_stock_enquiries' },
  'crm_incoming_stock_by_product':               { domain: 'incoming', team: 'purchasing',       agent: 'incoming_stock_enquiries' },
  'crm_incoming_stock_shipments':                { domain: 'incoming', team: 'purchasing',       agent: 'incoming_stock_enquiries' },
};
const tool = String((($('tool-filter').first().json) || {}).name || '').trim();
const lane = Object.prototype.hasOwnProperty.call(LANE, tool) ? LANE[tool] : null;
if (!lane) return false;
const o = $('Call \'sub-query-reformulator\'').first().json.output || {};
if (o.domain_hint !== lane.domain) return false;
const r = o.routing || {};
if (r.suggested_team !== lane.team || r.suggested_agent !== lane.agent) return false;
// one offer per turn: crossdomain-compose appends its OWN frozen phrase when crossdomain-render produced a block — yield to it
{ const xr = $('crossdomain-render'); if (xr.isExecuted && ((((xr.first().json) || {})._xdBlock) || {}).any === true) return false; }
```

Why this shape: the tool name is the direct witness of WHICH presenter built the envelope (the miss noun comes from it), the domain leg keeps
the RAG pick and the parser in agreement, and the routing leg keeps the offer text (`_mcTeam`), the roster URL and HI's team in lockstep — a
turn where the customer explicitly named another team (`request_for_help` retarget → routing ≠ lane) gets NO picker rather than a picker for
the wrong pool. `tool-filter` exists on live (sha `bffb4c3a`, == clone) and is what `Call 'sub-get-results'` already reads (hotfix leaf);
`crossdomain-render` exists on live with the same `_xdBlock.any` contract. Non-covered turns are byte-identical (gate false → same FALSE
edge as today). Left-out domains flip by adding a row (D2) — no other node changes.

**No change to:** `miss-roster-plan` (it re-derives the miss SET only — no domain leg; its header comment says "order turn", leave the body
byte-identical so the staged payload sha holds; note the stale wording in the diff doc), `get-cs-members-miss`, `build-miss-member-offer`,
`compile-current-state` (the miss arm keys on `build-miss-member-offer.isExecuted`, phrase = `Would you like me to escalate to *<Co>*
${suggested_team} team?` ⇒ reads `*Sorento* purchasing team` on incoming — consistent with the not-found phrase `escalate-catalog` already emits
for incoming and with what HI/`next-assignee` will actually route to), `escalation-context`, `clarify-company-*`, `offer-hold-*`,
`escalate-catalog`, parser fork (systemMessage + `output_exchange`), HI, sendmsg.

Team the offer names per domain: orders → `customer_service`, incoming → `purchasing` (the parser's routing; HI routes there via
`next-assignee(agent_code=incoming_stock_enquiries, team_code=purchasing, company_id)`; the roster shown comes from
`team-members?agent_code=incoming_stock_enquiries&team_code=purchasing&company_id=<miss>`). If the captain instead wants "customer_service"
named on every domain (**D1**), that is NOT a copy change — the roster call, `escalation-context.team` and HI would have to be overridden too;
recommend against (the phrase must name the team that will actually receive the assignment).

Decisions for the captain: **D1** team per domain (default: the domain's own routing team). **D2** any left-out domain to flip in
(default: none). **D3** finding F-R3-1 below (default: leave).

### R3.3 Node-by-node for the coder (clone `0557b0b4` + fork `c7d9cfa2`; guards untouched)

| node | change |
|---|---|
| `miss-roster-gate` (If, existing) | `setNodeParameter /conditions/conditions/0/leftValue` := the R3.2 expression (full text to `tests/diffs/miss-company-routing/spine-miss-roster-gate.expr.txt`, header comment updated to "answered ORDER or INCOMING turn … allowlist R3.1"). Publish; assert draft==active; sha the leftValue both sides. |
| everything else | byte-identical. Re-assert shas: `miss-roster-plan` `0b7907d6`, `build-miss-member-offer` `68eef4c7`, `compile-current-state` `5a84dfea` (clone body), `escalation-context` `cca7a245`, `clarify-company-reply`/`offer-hold-reply` `7ff06aa8`, `offer-hold-gate` leftValue `8f14a430`, `clarify-company-gate` `63e30a3d`; parser fork stays `c7d9cfa2` (`output_exchange` `a68c5992`, systemMessage `138008c2`). |
| offline units (`tests/unit/`) | add a `miss-roster-gate` expression harness (evaluate the IIFE with stubbed `$json`/`$()`): (i) exec-12918600 envelope + incoming routing ⇒ TRUE; (ii) same with `_xdBlock.any:true` ⇒ FALSE; (iii) same with tool `crm_inventory_stock_balance_list` / domain inventory / warehouse routing ⇒ FALSE; (iv) promotions tool ⇒ FALSE; (v) incoming tool but routing customer_service ⇒ FALSE; (vi) M1 orders envelope ⇒ TRUE (unchanged); (vii) tool-filter missing/throws ⇒ FALSE; (viii) miss set empty ⇒ FALSE. |

Diff doc: append "round-3" section to `tests/diffs/miss-company-routing.md` (before/after sha of the leftValue, unit results, the stale
"order turn" comments left in `miss-roster-plan`/`build-miss-member-offer` by design).

### R3.4 Replay-norm impact

None new. The gate is deterministic on pinned inputs; golden envelopes predate PR #193's `lookup_companies` stamping (2026-08-17), so on the
2,216-turn corpus the gate stays FALSE exactly as before → 0 expected diffs. Fresh captures of the round-3 UAC turns (synthetic
`chat_histories` rows, Lesson 41) will show the new lane nodes + `last_result_set` member rows on incoming miss turns by design.

### R3.5 Safety

No new node, no new external call: the only egress-adjacent node remains `get-cs-members-miss` (CRM **read**, `onError:
continueRegularOutput`) — on incoming it now also fires (GET `…/team-members?agent_code=incoming_stock_enquiries&team_code=purchasing…`).
Every clone guard (`is_test=true`, orphaned egress nodes, forks) untouched. §0 S1–S6 on every case. Fail-closed on every new leg (missing
tool-filter, non-allowlisted tool, routing mismatch, xd block, roster 404/empty ⇒ turn byte-identical).

**Prerequisite P1 (tester, before N1):** read-only roster probe (`zz-roster-probe ZS0KErse7GDh9mJK`, CRM GET only) for
`(team_code=purchasing, agent_code=incoming_stock_enquiries)` × {Sorento `00000000-…0001`, Mocha `38db4f20-…`}. If the miss company's
roster is empty/404 (`No team found … in company` = admin config, R7 §7(iv)), the incoming offer cannot render (round-2 zero-member rule ⇒
byte-identical turn) — record BLOCKED-BY-CONFIG and hand the captain the team-set gap; the harness must not paper over it.

### R3.6 Findings

- **F-R3-1 (pre-existing, not changed by round 3):** on an incoming BOTH-miss (not-found path) the offer is the plain
  `Would you like me to escalate to purchasing team?` with NO picker (`cs-offer-gate` is CS/order-only), yet a following bare "yes" lands on
  `multi_company_unpicked` → the rev-4 clarify copy `Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company
  (Mocha / Sorento) …` although no numbered list was shown; a company reply then routes correctly (`company_pick`). Options for **D3**:
  (a) leave (copy slightly over-promises; behaviour correct), (b) widen `cs-offer-gate` to the same R3.1 allowlist so incoming not-found turns get
  the picker too (touches `cs-offer-gate` only — `cs-roster-plan`/`get-cs-members`/`build-cs-member-offer` are already team-agnostic), (c) make
  `clarify-company-reply` drop "a number, a name," when the persisted `routing_roster_plan` is empty. Default: (a); (b) is the consistent choice
  if the captain wants "exactly like orders" on the not-found path as well.
- **F-R3-2:** `miss-roster-plan` / `build-miss-member-offer` header comments still say "answered order turn" — bodies deliberately untouched
  (payload sha stability); fix wording at the next body change.

### R3.7 Promote implication (combined round-2+3 record)

Staged payload `tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` changes in exactly ONE
node: `miss-roster-gate` (new node, leftValue `024d91e3` → the round-3 sha). R7 3e / R10 4a+4d rows must be re-measured for that node; every
other R7 gate, the 9-node/11-edge shape, `escalate-catalog`/`compile-current-state` anchored insertions and the parser payload
(`a68c5992` / `138008c2`) are unchanged. Refresh the STAGED run doc as one round-2+3 record, then `needs-decision [key=promote-round2-3]`.

### Round 3 rev-3 (captain corrections: plain offer for incoming+stock, members orders-only)

Captain corrections (2026-08-18, live chat-console test of the clone — these OVERRIDE D1–D3 where they conflict):
1. Incoming miss reply showed the member picker ("…Please choose who to route to … 2. Jereen Tee…") — "there is no
   need to get the members for incoming lol, this only applies for customer order enquiries". Incoming keeps the
   escalation OFFER but with **no roster fetch and no member picker**.
2. Stock reply ("Company: Mocha … Quantity On Hand: 0 / … *Sorento:* no stock records for MUB6201.") — "things like
   stock also should have the would you like me to escalate, but without the members; we only need cs members".
   Stock per-company miss (a company ENTIRELY absent from the answers) now gets the plain offer too. Decision 2
   still stands and is compatible: a qty-0 ROW is an answer (its `company_name` field marks the company answered);
   only a company with ZERO rows is a miss — the existing gate/plan derivation yields exactly this with no extra leg.

**Rev-3 shape:** member picker (roster fetch + numbered members + number/name picks) = **orders/customer_service
ONLY**. Incoming + stock miss = plain frozen phrase `Would you like me to escalate to *<Co>* <team> team?` (single
miss names the company; both-miss = plain phrase, no company). "Yes" routes via the persisted axes (single-miss →
that company's team round-robin via the rev-4 `prior_state` arm; both-miss → `multi_company_unpicked` → company
clarify; a company-name reply resolves via the parser's EXISTING rev-4 open-offer `company_pick` arm — see §V3
below, **no parser change**). No roster call at all on the plain lanes. D3 moves from (b) to (c): `cs-offer-gate`
reverts to CS/order-only and the clarify copy drops "a number, a name" when no picker was shown.

Builds on clone `txiPzSxy3Pclsz6v` @ `e54e114e` + parser fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2` (**fork untouched**).
**scope: `deterministic`** — spine-only; the 1–3 parser-tier turns below are regression proofs of UNCHANGED fork
arms (precedent: round-2 M4b / round-3 N4b, R11 check 13).

#### V1. LANE table (rev-3 — the single allowlist, mirrored byte-identical in `miss-roster-gate` and `miss-roster-plan`)

| tool (`tool-filter.name`) | domain_hint | team (phrase + roster + HI, D1: the domain's own routing team) | agent | `members` |
|---|---|---|---|---|
| `crm_order_management_orders_list` | order | customer_service | order_enquiries | **true** |
| `crm_order_management_orders_by_product_list` | order | customer_service | order_enquiries | **true** |
| `crm_incoming_stock_list` | incoming | purchasing | incoming_stock_enquiries | **false** |
| `crm_incoming_stock_by_product` | incoming | purchasing | incoming_stock_enquiries | **false** |
| `crm_incoming_stock_shipments` | incoming | purchasing | incoming_stock_enquiries | **false** |
| `crm_inventory_stock_balance_list` (NEW row) | inventory | warehouse | general_enquiries | **false** |

Grounding: stock tool + routing pair verified against the deployed parser fork (`output_exchange` `deriveRouting`:
`case 'inventory': { suggested_team: 'warehouse', suggested_agent: 'general_enquiries' }`, sha `a68c5992` == clone
fork; consistent with `crossdomain-zeroset`'s inventory→warehouse map and the R3.1 audit row). Stock has exactly ONE
per-company presenter tool — `crm_inventory_stock_balance_list` (`_stock`, stamped by `inventory_service.list_stock`;
R11 check 24 confirmed the 14-tool sweep, no other stock renderer). Phrase team per lane = the lane's `team` column
verbatim (`*Sorento* purchasing team` — captain-accepted wording; stock reads `*Sorento* warehouse team`): the phrase
must name the team HI will actually route to (`next-assignee(agent_code=<agent>, team_code=<team>, company_id)`).
The `members` flag is carried in BOTH LANE copies for byte-identical lockstep; the gate ignores it (offer/no-offer
only), `miss-roster-plan` stamps it onto every plan item.

**D2' (captain-confirm at the promote gate):** promotions ×2 / master products / product attachments / certificates
STAY OUT ("definitive answer, nothing for the other team to look up"). The captain's "things like stock" wording
COULD be read as "every per-company miss line" — each is still a one-row LANE flip (`members:false`); do not flip
without an explicit captain order.

#### V2. Roster skip design (chosen: option (a) — one new If node)

An HTTP node in the path always fires, so plain lanes must be routed AROUND `get-cs-members-miss`, not through it:

- **`miss-members-gate` (NEW, If)** between `miss-roster-plan` and `get-cs-members-miss`. leftValue
  `={{ $json.members === true }}` (plan items all carry the lane flag; no forbidden sandbox tokens — LESSONS #45
  grep + one real-execution smoke still mandatory). TRUE → `get-cs-members-miss` → `build-miss-member-offer`
  (orders lane, unchanged chain). FALSE → `build-miss-member-offer` **directly** (plain lanes + the
  `_miss_plan_empty` sentinel, which now never spends its stray roster read).
- Rejected alternatives: making `get-cs-members-miss` conditional (impossible — HTTP in path fires); replacing
  `miss-roster-gate` with a Switch (remove+re-add churn, larger review surface); routing plain lanes from the gate
  straight to `dym-transform-partial` (the lane must re-emit the ENVELOPE item — `miss-roster-plan` outputs plan
  items and would break the happy-path reply; `build-miss-member-offer` is the existing envelope re-emitter).
- Promote-payload delta of (a): +1 node, +1 changed connection key (see §V7). Smallest of the workable options.

#### V3. Node-by-node (coder; clone `e54e114e` + fork `c7d9cfa2`; guards untouched; fork NOT edited)

| node | change |
|---|---|
| `miss-roster-gate` (If, existing) | leftValue: add the ONE stock row to LANE (+ the `members` field on every row, ignored by the gate). Every other leg byte-identical (has_result, domain+routing lockstep, xd yield, company_name-labelled answers, non-empty miss set, try→false). New sha replaces `d24dd81b`. |
| `miss-roster-plan` (code, existing) | Mirror the rev-3 LANE (with `members`); stamp `members: lane.members` on every real plan item and `members:false` on the `_miss_plan_empty` sentinel (a sentinel must never fetch a roster). Fix the stale "order turn" header comment while the body is open (closes F-R3-2 for this node). Derivation otherwise byte-identical. |
| `miss-members-gate` (NEW, If) | §V2. Fail-closed note: a plan item MISSING the flag routes FALSE → plain path → `build-miss-member-offer` sees plan items, roster parse yields `[]` → envelope passthrough, turn byte-identical (never a broken turn, never a surprise picker). |
| `get-cs-members-miss` | byte-identical (now reached only via `miss-members-gate` TRUE = orders). |
| `build-miss-member-offer` (code, existing) | New **plain arm** ABOVE the roster parsing: read the plan via `$('miss-roster-plan')` as today; when every non-sentinel plan item carries `members === false` → skip roster parsing entirely and return `[{ json: { ...env, miss_plain_offer: true, miss_roster_plan: <non-sentinel plan items mapped {plan_idx, company_id, company_name, brand_code}> } }]` — NO `miss_member_offer`, NO `miss_member_rows`, NO `miss_offer_text` (pool = ALL miss companies; no intersection rule — no roster was shown). Zero non-sentinel items ⇒ envelope passthrough. Members lanes byte-identical output (M1r3 shape). Fix the stale header comment (F-R3-2). |
| `compile-current-state` (hunk) | Third arm in the rev-2 miss/clarify block, after the rows arm: `else if (_mcMem && _mcMem.miss_plain_offer === true && <same guard set as the rows arm: !_ideate && !_sug && !_mem && !_dymLastResultSet && non-empty user_response> && _mcPlan.length)` → append **the frozen phrase ONLY**: `output.user_response += "\n\n" + _mcPhrase;` and the SAME phrase to persisted `variables.response` (parser prefix-regex contract `/would you like me to escalate/i` — verified: the confirmation arm and the rev-4 open-offer arm both key on `previous_conversation_state.response`); persist `routing_roster_plan = _mcPlan`, `routing_company`/`routing_brand` = the single pair when `_mcPlan.length === 1`, nulls when >1. **NO picker text, NO `last_result_set` extension, NO `selection_context` change** (stays null — the Δ3 member arm must NOT open). `_mcCo`/`_mcTeam`/`_mcPhrase` composition is shared with the rows arm and already renders `*<Co>* <team> team` on single-miss and the plain phrase on multi. |
| `clarify-company-reply` + `offer-hold-reply` (shared body) | Copy branch: `prev.selection_context === 'member_offer'` → EXISTING copy byte-identical (`… — reply a number, a name, or the company (X / Y) and I'll assign automatically.`); ELSE (no picker was shown — plain-offer both-miss, not-found both-miss) → **frozen rev-3 copy** `${lead} — reply with the company (${list}) and I'll assign automatically.` (closes F-R3-1 properly, option (c)). `offer-hold-gate` only fires with `selection_context === 'member_offer'`, so `offer-hold-reply` always takes the member branch — no behaviour change there. |
| `cs-offer-gate` (If, existing) | **REVERT to the round-2/live shape** (conditions json `ce99a16c`, 3 conditions — byte-exact from the PRE backup `PRE-9qVy…-7aba1447.json` / clone `0557b0b4`; D3=b undone). Consequence: incoming/stock NOT-FOUND turns return to the pre-round-3 plain phrase (`escalate-catalog` not_found → `Would you like me to escalate to <team> team?`, no picker); a following "yes" on a 2-company not-found still lands `multi_company_unpicked` → clarify, now with the rev-3 plain copy (F-R3-1 closed by copy, not by picker). CS/order not-found keeps its picker. |
| `build-cs-member-offer` | **KEEP `63c1c46e`** (dynamic team note). With the revert the purchasing note is unreachable, but the body's orders/single-company output is proven byte-identical (R11 check 26 + F-R3-5 units) — keeping avoids another body flip and preserves the F-R3-3-family fix. |
| everything else | byte-identical: `escalation-context` `cca7a245`, `clarify-company-gate` `63e30a3d`, `offer-hold-gate` `8f14a430`, `escalate-catalog` `0168df84`, `tag-offer-hold`, HI, sendmsg, parser fork `c7d9cfa2` (`a68c5992`/`138008c2`). |

**Parser verification (no edit, but a NEWLY LOAD-BEARING arm):** the rev-4 "company pick on an OPEN offer WITHOUT
member-pick context" arm (`output_exchange` — `_selCtx !== 'member_offer'`, frozen phrase in the persisted
`response`, `!domain_hint`, `_coCompanyPick`) is what resolves a company-name reply after a PLAIN both-miss offer
(and after its clarify, which re-persists the phrase; the clarify arm writes `selection_context` only when truthy,
so the plain offer's null context survives). That arm has never been proven on a real execution (it was written
for the empty-roster edge; every prior company_pick run rode the Δ3 `member_offer` arm) — UAC Q6 is its parser-tier
proof. Lesson-39 tolerance applies (a bare company token is seed-sensitive: resolve OR safe new-query abandon both
pass; a WRONG company or a member resolve = hard fail). Bare "yes" needs no context at all (prefix regex on the
persisted response → confirmation arm → escalation-context `prior_state` / `multi_company_unpicked`).

**Junk on a plain offer (accepted + documented, not guarded):** `offer-hold-gate` keys on parser
`member_pick_context === true` AND persisted `selection_context === 'member_offer'` — neither holds on a plain
offer, so junk falls through to the normal path (typically the clarification LLM), ccs persists THAT reply and the
frozen phrase is gone → the offer closes (a later "yes"/company-name does nothing — same as the M8e decline
semantics: the carried-forward `routing_roster_plan` is inert without the phrase). This is byte-identical to how
the pre-existing not-found plain offer has always behaved; protecting it would need a parser `offer_hold` emission
outside the Δ3 arm = a fork change out of rev-3's scope. UAC Q9 documents it.

#### V4. Replay-norm impact

None new. Golden envelopes predate `lookup_companies` stamping ⇒ `miss-roster-gate` stays FALSE corpus-wide (stock
row included). The `cs-offer-gate` revert restores the exact pre-round-3 gate; on the pinned corpus g2 was FALSE
either way (golden parser outputs predate the `routing` field — F-R11-3) ⇒ same branch, 0 diffs. Fresh captures of
rev-3 UAC turns surface the new nodes/keys as diffs BY DESIGN (Lessons 40/41). `miss_plain_offer` /
`members` ride existing per-run containers — no `norm()` rule.

#### V5. Safety

STRICTLY LESS egress-adjacent than rev-2: plain lanes make NO external call at all (the roster GET now fires only
on orders); no new external call anywhere; every clone guard untouched; all new/changed legs fail closed (missing
`members` flag → plain path → passthrough; sentinel → passthrough; plain arm guard miss → no phrase → turn
byte-identical). §0 S1–S6 on every case. LESSONS #45: grep every new/changed expression for
`prototype|constructor|__proto__` + smoke ONE real clone execution through `miss-members-gate` and the new
`miss-roster-gate` leftValue BEFORE tester handoff.

**Prerequisite P2 (tester, read-only, optional-but-recommended):** `zz-roster-probe` for
`(team_code=warehouse, agent_code=general_enquiries)` × {Sorento, Mocha} — the clone's HI fork short-circuits before
any CRM team lookup, but a live "yes" on a stock miss will hit `next-assignee` with that pair; an empty/404 team is
an admin-config gap to hand the captain (BLOCKED-BY-CONFIG rule, R7 §7(iv)), NOT a harness failure. No probe needed
for the plain offers themselves (no roster call).

#### V6. UAC

Cases Q1–Q9 + S3/S appended to `tests/miss-company-routing-UAC.md` ("Round 3 rev-3" section): incoming single-miss
plain offer (asserts `get-cs-members-miss` NOT executed), incoming "yes" → HI purchasing pair, stock single-miss
plain offer + "yes" (captain's exact MUB6201 shape: Mocha rows incl. qty 0 = answered, Sorento absent = the only
miss), stock fully-answered/qty-0 control (no offer), stock both-miss → plain phrase → "yes" → plain-copy clarify →
company reply → HI, parser-tier open-offer company_pick proof, orders regression (picker byte-identical, M1r3),
not-found regression (cs-offer-gate reverted: no picker on incoming/stock, picker kept on CS/order, plain clarify
copy on "yes"), junk-on-plain-offer behaviour doc, §0 everywhere.

#### V7. Promote implication (combined round-2+3 payload refresh)

Vs the CURRENT staged payload (R10/R11: 136 nodes, 5 changed + 9 new + 11 connection keys):
- **`cs-offer-gate` DROPS from the payload** (reverted = byte-identical to live `ce99a16c`) ⇒ changed 5 → **4**
  (`compile-current-state` — NEW payload body, the plain arm anchored on the R10 F6 live-based body;
  `escalate-catalog` `5ec7d6a7`, `build-cs-member-offer` `63c1c46e`, `escalation-context` `cca7a245` unchanged).
- New nodes 9 → **10** (+ `miss-members-gate`); within them, NEW shas for `miss-roster-gate` (stock row — replaces
  `d24dd81b`), `miss-roster-plan` (members flag), `build-miss-member-offer` (plain arm),
  `clarify-company-reply`/`offer-hold-reply` (copy branch); `get-cs-members-miss`/`clarify-company-gate`/
  `offer-hold-gate`/`tag-offer-hold` unchanged.
- Connection keys 11 → **12** (the `miss-roster-plan` key retargets to `miss-members-gate`; + the new
  `miss-members-gate` key). Node count 136 → **137**.
- Sweep expectation (R7 3g / R10 3a-3b / R11 delta 4): **4 changed + 10 new + 12 connection keys, 137 nodes,
  0 dropped, 0 non-param field diffs.** Parser payload unchanged (`a68c5992`/`138008c2`); apply order and rollback
  method unchanged. R11 delta rows 1/3/4 must be re-measured for the new shas; R11 delta 6 watch list gains: an
  incoming PLAIN miss turn (phrase, no picker, no roster GET) and a stock PLAIN miss turn, and the incoming
  not-found watch row reverts to "NO picker".
Refresh the STAGED run doc as one round-2+3(rev-3) record, then `needs-decision [key=promote-round2-3]` with the
D2' captain-confirm line.

## Round 4 — all-domain miss offer + miss-line code hygiene (2026-08-18)

Captain orders (2026-08-18, verbatim): (A) the promotions miss line leaked uuids —
`Sorento: no promotions records for 67f07a6c-…, 62a48f82-…, 0899962d-…, b0da7e8f-…, MUB6201.`;
(B) *"you need to show would you like me to escalate in promotion domain also, basically all domain
also need to behave like this, if no record, then offer to escalate"*, and (locked, do not re-raise)
*"correct other than orders, all domain don't need member list"*.

**(B) REVERSES D2/D2'.** Promotions ×2, master products, product attachments and certificates come
INTO the LANE. `members` stays **true on the two orders tools ONLY** — for every current and future row.

**scope: `deterministic`.** Spine = two mirrored bodies (`miss-roster-gate` leftValue +
`miss-roster-plan` jsCode). Sub = one Code node (`output-structurer`) in the get-results sub. The
parser fork is **NOT** touched (`c7d9cfa2` / `output_exchange` `a68c5992` / systemMessage `138008c2`).
Parser-tier turns in the round-4 UAC are regression proofs of UNCHANGED arms.
Build base: clone `txiPzSxy3Pclsz6v` @ **`061e46c9`** (post tier-lane rebase) + get-results fork
**`t4QvrtrPnTwRU6br`** @ `87df404c`. Live untouched until the captain's gate.

### W0. Grounding (read-only, verified 2026-08-18 on the live/clone graphs + CRM source)

**⚠️ LOUD PLAN/PREMISE CORRECTION — the live spine calls TWO get-results copies, and neither of them
is only-`Fss`.** Measured on live `9qVyfUxmRQqrpGRMDLRuz` (draft `cfd0e776`) AND on the promote
backup `PRE-9qVyfUxmRQqrpGRMDLRuz-7aba1447.json` (the ACTIVE body) — identical in both:

| live spine node | get-results workflow it calls |
|---|---|
| `Call 'sub-get-results'` (the customer-visible answer path), `probe-incoming`, `tier-probe` | **`rysSPgUssLDf6xJc`** — *named* `sub-get-results TEST` |
| `sibling-probe`, `crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe` | **`Fss5aAaXthJSWpZCgKiKR`** — `sub-get-results` (the "published shared" one) |

The clone `061e46c9` points ALL EIGHT of the same callers at the fork `t4QvrtrPnTwRU6br`.
Consequences to carry forward:
- `AGENTS.md`'s "sub: get-results = `Fss5aAaXthJSWpZCgKiKR`" is only half true — the **answer** path on
  live is `rys`. `plans/pending-allocation-flag-plan.md` §Phase C ("`rys` is the clone's fork, live
  `Fss` is never touched", and its rollback plan) is **STALE** — do not act on it.
- `output-structurer` bodies: `t4Qv` == `rys` **byte-identical** (`eac4759f`); `Fss` (`11afa233`)
  differs from them in EXACTLY ONE region — the timeline field-order block (`rys`/`t4Qv` carry the
  2026-08-18 "sort dates in place" rewrite for CRM PR #217; `Fss` still carries the older
  facts-then-dates rewrite). **The mc-label `_codes` block is byte-identical in all three.**
  ⇒ the (A) hunk must be applied **anchored, per copy** (`setNodeParameter /jsCode` on each copy's
  OWN body). Copying a whole body across copies would smuggle the unrelated timeline rewrite into
  `Fss` — an unreviewed change.

Other facts re-verified today (no CRM probe spent, no execution run):
- **(A) root cause, confirmed end-to-end.** Clone spine exec `12941592` → get-results sub exec
  `12941604`. Sub input `entities` =
  `[{uuid:'67f07a6c-…',entity_type:'promotion',code:'67f07a6c-…'} ×4, {uuid:'31f26a89-…',entity_type:'product',code:'MUB6201'}, {uuid:'fbc8fb94-…',entity_type:'product',code:'MUB6201'}]`,
  `tool: crm_marketing_promotions_list`. The parser emitted ONE entity (`MUB6201`, hint `product`);
  `resolve-entity` EXPANDED it into the product's promotions (`by_entity_type {promotion:4, product:2}`,
  `match_field:'promotion_membership'`, `match_tier:'via_product'`); `disallowed-entity-gate`
  forwards `compatible_entities` as `{uuid, entity_type, code}` with `code = canonical_code`, and the
  CRM fills `canonical_code` with the record's **own uuid** for types that have no code. The
  `output-structurer` mc-label block's own comment ("`code` is the canonical code the customer
  recognises (MWC-SC08B), never a uuid") is therefore false for every non-code-bearing entity type.
  **Doubly wrong:** the four uuids are MOCHA's promotions (resolved through the Mocha product) and
  were printed under `*Sorento:*`.
- **Graph order (clone == live for every node named here):** `Call 'sub-get-results'` → `validator` →
  `promo-picker` → `crossdomain-zeroset` → `crossdomain-gate` → (`crossdomain-probe` →
  `crossdomain-render`) → `If6` → `central-exchange` → **`miss-roster-gate`** → `miss-roster-plan` →
  `miss-members-gate` → (`get-cs-members-miss`) → `build-miss-member-offer` → `dym-transform-partial`
  → … → `compile-current-state` → `crossdomain-compose` → text send (+ `attach-merge` → file sends).
- **`compile-current-state`'s plain arm is already team-agnostic:** `_mcTeamP` reads
  `miss_roster_plan[0].team`, and the phrase is
  `Would you like me to escalate to ${_mcCoP}${_mcTeamP} team?`. A new LANE row therefore needs **no
  ccs change** — it renders `…escalate to *Sorento* marketing_promotion team?` automatically.
- **Backend stamping set is exactly 11 service functions** (`grep stamp_lookup_companies` over
  `sorento_crm_backend/app/services`, worktree `agent-af782288cc8ee12b6` @ `0c415d6e9`):
  `list_orders`, `list_orders_by_product`, `incoming_list`, `incoming_for_product`,
  `incoming_shipments`, `list_stock`, `list_promotions`, `list_promotion_products`, `list_products`,
  `list_product_attachments`, `list_certificates` — no others. Their 11 tools are exactly the
  round-4 LANE (see W2): **LANE == the stamping set**, which is the closure property that makes
  "all domains" checkable rather than aspirational.
- **Every one of those 11 presenters stamps a leading `{key:'company_name', label:'Company'}` row
  field** (`presenters.py` L308/334/386/423/465/493/511/532/562/655/812) — the gate's
  "every answer is company-attributed" leg can pass on all of them. `_RESULT_TYPE` nouns:
  `promotions`, `promotion_products`, `products`, `product_attachments`, `certificates`.
- **`crossdomain-zeroset` returns OFF for any domain ≠ inventory/incoming** (line 12), so the
  existing `_xdBlock.any` precedence leg is inert for every round-4 domain — it stays, unchanged.

### W1. (A) miss-line code hygiene — the predicate

Change ONE statement in `output-structurer`'s mc-label block (the `_codes` builder). Everything else
in the block — `_lookupCos`, `_coOfRow`, `_shownCos`, `_canAttribute`, `_noun`, `_silent`, the
`_codes.length ? \` for …\` : ''` clause — stays byte-identical.

```js
    // ROUND 4 (A). `code` is the CRM's `canonical_code`, which is a CODE only for record types that
    // HAVE one. For types that do not (promotions), the resolver fills it with the record's OWN
    // uuid as a placeholder and disallowed-entity-gate copies that into `code` — so this block's
    // header invariant ("never a uuid") is violated by every non-product entity type. Measured
    // (clone exec 12941592 / sub 12941604, "promotion for MUB6201"): four promotion uuids printed
    // under "*Sorento:* no promotions records for …" — and they were MOCHA's promotions, resolved
    // via the Mocha product. Keep a code only when it IS a code: not equal to its own entity's
    // uuid, and not uuid-shaped. When nothing survives, `_codes.length` already drops the
    // " for …" clause and the sentence stays truthful ("*Sorento:* no promotions records.").
    const _isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    let _codes = [];
    try {
      const _ents0 = $('When Executed by Another Workflow').first().json.entities;
      const _ents = (typeof _ents0 === 'string' ? safe(_ents0) : _ents0) || [];
      _codes = [...new Set((Array.isArray(_ents) ? _ents : [])
        .map(x => ({ c: String((x && x.code) ?? '').trim(), u: String((x && x.uuid) ?? '').trim() }))
        .filter(x => x.c && x.c !== x.u && !_isUuid(x.c))
        .map(x => x.c))];
    } catch (err) { _codes = []; }
```

**Why this predicate and not the alternatives.**
- `entity_type === 'product'` — **REJECTED.** It would break the ORDERS lane that is already staged:
  "any order for DO M2608-1026" resolves an `order`/`customer_order` entity whose `canonical_code`
  IS the DO number the customer typed, and the current line correctly reads
  `*Sorento:* no orders records for M2608-1026.` A product-only filter silently deletes that.
- uuid-regex alone — accepted as HALF the rule; the `code !== uuid` half is the one that states the
  actual CRM convention (placeholder = the row's own id) and would still hold if the CRM ever used a
  non-uuid placeholder id.
- dropping the ` for …` clause entirely — **REJECTED**: it throws away a correct, load-bearing code
  on every orders/incoming/stock turn to fix one type.
- Combined (`code && code !== uuid && !uuidShaped`) is the minimum that is correct in both directions.

**What the line reads, per case (all must be asserted in UAC):**

| turn | `_codes` after the fix | rendered line |
|---|---|---|
| captain's turn — "promotion for MUB6201", Mocha has 4 promos, Sorento none | `['MUB6201']` | `*Sorento:* no promotions records for MUB6201.` |
| orders by product (M1/Q7) | `['MUB6201']` | unchanged — `*Sorento:* no orders records for MUB6201.` |
| orders by DO number | `['M2608-1026']` | unchanged |
| incoming / stock (Q1/Q3) | unchanged | unchanged |
| promotion named by NAME only, no product entity (Q25 shape) | `[]` | `*Sorento:* no promotions records.` — truthful, readable, no clause |
| incoming broad query, no entities at all (`ALLOWS_EMPTY.incoming === true`) | `[]` | `*Sorento:* no incoming stock records.` — already today's behaviour |

**What happens when the customer names NO product at all.** `disallowed-entity-gate.ALLOWS_EMPTY`
is `false` for promotion, master_products, product_attachment, inventory and order. A bare
"any promotion?" therefore FAILS the gate (`no entities and 'promotion' requires a scoping entity`),
`Call 'sub-get-results'` never runs (`If3` dead-ends), there is no envelope, no `lookup_companies`,
no miss line and no miss offer — the customer gets `not-found-error-message`'s `needsScope`
clarification ("A promotion enquiry can't be answered with a general search — please specify a
product, promotion, category, or brand"), which is a question, not a dead end. **So on every
reachable promotions miss the resolver's product-expansion guarantees a clean code is present** —
the empty-`_codes` row above is the rare promotion-named-by-name case, not the common one.
`incoming`, `forms` and `portal_link` are the only `ALLOWS_EMPTY:true` domains.

**Which sub copies change**

| id | name | role | round-4 action |
|---|---|---|---|
| `t4QvrtrPnTwRU6br` | `sub-get-results CS-BUILD` | what the **clone** calls (all 8 callers) | **BUILD + TEST here.** Publish before running clone UAC (LESSONS #37). |
| `rysSPgUssLDf6xJc` | `sub-get-results TEST` (misleading name) | what **LIVE** `Call 'sub-get-results'` / `probe-incoming` / `tier-probe` call — this renders the customer-visible miss line | **PROMOTE target #1.** Body == `t4Qv` today, so the hunk lands identically; still apply anchored + sha-gate. |
| `Fss5aAaXthJSWpZCgKiKR` | `sub-get-results` | what LIVE `sibling-probe` / `crossdomain-probe` / `dym-probe` / `dym-probe-partial` / `promo-dym-probe` call; the published shared sub other workflows may resolve | **PROMOTE target #2**, anchored on ITS OWN body (older timeline block — do NOT overwrite with the `rys` body). |

Probes consume `has_result`/`answers`, not the rendered miss line, so `Fss` is included for
**copy-drift hygiene and shared-sub correctness**, not because a probe prints the sentence today.

### W2. Round-4 LANE table (the single allowlist, mirrored byte-identical in `miss-roster-gate` and `miss-roster-plan`)

Row shape changes from `{domain, team, agent, members}` to **`{domain, pairs: [[team, agent], …], members}`**
— because `crm_master_product_attachments_list` legitimately rides TWO routing pairs (the parser's
`deriveRouting` splits `product_attachment` on `isCert`). Single-pair rows carry a one-element array.
`members` semantics unchanged (the gate ignores it; `miss-roster-plan` stamps it; `miss-members-gate`
reads it).

| tool (`tool-filter.name`) | domain_hint | routing pair(s) — team / agent (verified against fork `output_exchange` `a68c5992` `deriveRouting`) | `members` | miss-line noun (`_RESULT_TYPE`) | status |
|---|---|---|---|---|---|
| `crm_order_management_orders_list` | `order` | `customer_service` / `order_enquiries` | **true** | `orders records` | round 2 |
| `crm_order_management_orders_by_product_list` | `order` | `customer_service` / `order_enquiries` | **true** | `orders records` | round 2 |
| `crm_incoming_stock_list` | `incoming` | `purchasing` / `incoming_stock_enquiries` | false | `incoming stock records` | round 3 |
| `crm_incoming_stock_by_product` | `incoming` | `purchasing` / `incoming_stock_enquiries` | false | `incoming stock records` | round 3 |
| `crm_incoming_stock_shipments` | `incoming` | `purchasing` / `incoming_stock_enquiries` | false | `incoming shipments records` | round 3 |
| `crm_inventory_stock_balance_list` | `inventory` | `warehouse` / `general_enquiries` | false | `stock records` | round 3 rev-3 |
| **`crm_marketing_promotions_list`** | `promotion` | `marketing_promotion` / `general_enquiries` | false | `promotions records` | **ROUND 4** |
| **`crm_marketing_promotion_products_list`** | `promotion` | `marketing_promotion` / `general_enquiries` | false | `promotion products records` | **ROUND 4** |
| **`crm_master_products_list`** | `master_products` | `purchasing_product` / `general_enquiries` | false | `products records` | **ROUND 4** |
| **`crm_master_product_attachments_list`** | `product_attachment` | `marketing_product` / `general_enquiries` **and** `purchasing_certification` / `general_enquiries` | false | `product attachments records` | **ROUND 4** |
| **`crm_certificates_list`** | `product_attachment` | `purchasing_certification` / `general_enquiries` | false | `certificates records` | **ROUND 4** |

**Not in the LANE, and structurally cannot be:** `crm_resource_attachments_list`,
`crm_forms_management_forms_list`, `crm_portal_link_get`, `crm_procurement_grn_*`, SPO, ideate — their
backends never call `stamp_lookup_companies`, so `lookup_companies` is absent and the gate's shape
legs can never pass. **The LANE now equals the stamping set exactly (11/11)** — the captain's
"all domains" is complete by construction, not by enumeration luck.

Team naming per domain (D1 unchanged: each domain names its OWN routing team, which is the team HI
will actually assign to via `next-assignee(agent_code, team_code, company_id)`):
`*<Co>* customer_service` (orders) · `purchasing` (incoming) · `warehouse` (stock) ·
**`marketing_promotion`** (promotions) · **`purchasing_product`** (master products) ·
**`marketing_product`** or **`purchasing_certification`** (attachments, per the parser's own cert
split) · **`purchasing_certification`** (certificates).

Because a row can now carry two pairs, `miss-roster-plan` must stamp `team` from the **parser's
actual `suggested_team`** (which the gate has already proven is one of the row's pairs), not from a
hard-coded row field — otherwise a certificate ask would be told "marketing_product team".

### W3. Precedence — a turn may carry exactly ONE escalation offer

The orders/incoming/stock lanes only ever had to yield to `crossdomain-render`. Promotions bring a
SECOND renderer that writes its own offer: **`promo-picker`** (runs between `validator` and
`crossdomain-zeroset`, `domain_hint === 'promotion'` only). Measured arms in the deployed body:

| promo-picker arm | marker on its output | what it does to `env.response` | why the miss lane must yield |
|---|---|---|---|
| brand gate closed | `_brand_gate_closed: true` | REPLACES with a denial **+ its own** `Would you like me to escalate to <team> team?`; `answers=[]`, `attachments=[]` | second offer; also `answers=[]` already fails the gate |
| strict not-found | `_promo_notfound` | REPLACES with `No promotion found for … Would you like me to escalate to <team> team?`; `answers=[]` | second offer |
| **per-item decomposition** | `_promo_unmatched` | **APPENDS** `No promotion found for <codes>. Would you like me to escalate to <team> team?` — **and KEEPS `answers`** | ⚠️ the real one: gate would otherwise fire on an answered turn that ALREADY offered |
| positional pick | `_promo_pick` | REBUILDS `response` from the picked rows — **the mc-label miss line is gone from the text** | an offer with no visible miss statement |
| unrecognised envelope | `_promo_picker_shape` | fail-closed suppression | fail closed |

Two new legs in `miss-roster-gate` (order: after the existing xd leg, before the
`lookup_companies` legs):

```js
  // ROUND 4 · one offer per turn (a) — GENERIC: the rendered reply already carries the frozen
  // phrase (promo-picker's _promo_unmatched / strict-miss / brand-gate arms write their own, and any
  // future renderer that does the same is covered without another leg). Inert on the round-2/3
  // lanes: output-structurer never writes the phrase, and crossdomain-compose runs AFTER ccs.
  if (/would you like me to escalate/i.test(String(j.response || ''))) return false;
  // ROUND 4 · one offer per turn (b) — promo-picker rebuilt or short-circuited the reply. Marker
  // keys ride on promo-picker's own item; read them by node reference (central-exchange unwraps
  // `input.output` on the wrapped shape and would drop them).
  { const pp = $('promo-picker'); if (pp.isExecuted) { const p = pp.first().json || {};
      if (p._brand_gate_closed === true || p._promo_notfound || p._promo_unmatched
          || p._promo_pick || p._promo_picker_shape) return false; } }
```

Both are fail-closed and sandbox-safe (no `prototype`/`constructor`/`__proto__` — LESSONS #45 grep
still mandatory, plus ONE real clone execution through the changed leftValue before tester handoff).

**Tier-ask lane (D14) — no code needed, prove it structurally.** `if-tier-ask` TRUE →
`tier-probe-plan` → `tier-probe` → `tier-probe-collect` → `if-tier-has-any` TRUE →
`access-level-choice-message` (the ask). On that path `Call 'sub-get-results'`, `validator`,
`promo-picker` and `central-exchange` **never execute**, so `miss-roster-gate` is not in the run at
all and the miss offer cannot fire. `escalate-catalog`'s `access_choice` arm sets
`is_escalate_offer:false`, so the ask turn carries no offer of any kind. UAC R10 asserts the
non-execution set rather than a flag value.

**Attachment / certificate turns — where the offer sits.** `compile-current-state` appends the
phrase to `output.user_response`; `crossdomain-compose` hands that to
`sorento-sub-respond-sendmsg-respond2` (the TEXT message), and the files leave separately via
`attach-merge → if-got-attachments → Edit Fields → send-message-files/images/video`. So the offer is
the **last line of the text message and precedes the file sends** — the correct place, and it needs
no change. UAC R7/R1 assert the ordering on the `would_send` records.

**Promotions roster/`selection_context` interaction (no change, assert it).** On an answered
promotions turn with >1 promotion, `promo-picker` publishes `suggest_last_result_set` and
`compile-current-state` sets `selection_context = 'suggest_offer'` with the promotion roster as
`last_result_set` (ccs `_promo` arm, lowest precedence). The plain miss arm does not touch either, so
both survive: a numeric reply still picks a promotion, and "yes" still rides the confirmation arm off
the frozen phrase in the persisted `response`. `divert-suggest-yes` cannot hijack it — its condition
requires `customer_service`/`order_enquiries` routing. The ccs plain-arm guard set
(`!_ideate && !_sug && !_mem && !_dymLastResultSet`) does **not** include `_promo`, which is what
makes the promotions offer reachable at all; that is deliberate and must be stated in the diff doc.

### W4. Total-not-found coverage per domain (captain sense (ii)) — ALREADY TRUE EVERYWHERE, one caveat class

Path: `validator`/`If6` no-result → `tag-not-found` → **`not-found-error-message`** → `escalate-catalog`
(`case 'not_found'`, `is_escalate_offer = !nf.is_clarification`) → `cs-offer-gate` (picker, orders-only)
→ `compile-current-state`.

`not-found-error-message` is **domain-agnostic**: every non-clarification arm ends with
`Would you like me to escalate to ${team} team?`, `team = q.routing?.suggested_team || 'customer_service'`.
Verified arms: the generic `Could not find <domain> for <requested>…`, `buildBreakdownMsg`
("But no <domain> matched these — checked in Mocha and Sorento. Would you like me to escalate…"),
the zero-resolution `Couldn't find: "x". Would you like me to escalate…`, the product_attachment
natural-phrasing arm, the order status-filter arms, and the promotion `_entitlementMiss` arms
("… is not available at your access level (…). Would you like me to escalate…" / "… has ended, so
there is nothing to send. Would you like me to escalate…"). **So promotions, certificates, product
attachments and master products already offer on a total not-found today — nothing to add.**
Promotions are in fact covered twice: `promo-picker`'s strict-miss and brand-gate arms carry their
own identically-prefixed offer.

**The only domains-without-an-offer are the four `is_clarification = true` arms**, and every one of
them is a QUESTION rather than a dead end (the answer then lands on a path that does offer). Node =
`not-found-error-message`; flag = `is_clarification`; consumer = `escalate-catalog` `not_found`:

| arm | fires when | reply | recommendation |
|---|---|---|---|
| `missingAttachmentType` | `domain_hint = product_attachment`, gate failed, no attachment_type | "Please provide the attachment type for product X — e.g. product image, technical drawing, or certificate." | LEAVE |
| `needsScope` | `ALLOWS_EMPTY[domain] === false` and no entity at all (promotion, master_products, product_attachment, inventory, order) | "A <domain> enquiry can't be answered with a general search — please specify a …" | LEAVE |
| `vagueUnresolved` | a parser entity with `confident:false` | "I captured 'x' but couldn't tell which part is which…" | LEAVE (vague-token-clarify design) |
| `require_specific` | `disallowed-entity-gate.require_specific` (did-you-mean picker) | the gate's `gate_clarification` | LEAVE |

**Captain-confirm C1:** default is LEAVE all four. Flipping any of them to also offer would mean
asking a question and offering an escalation in the same breath; if the captain wants it, it is a
one-line change (`is_clarification` no longer suppressing `is_escalate_offer` for that arm) — do not
do it without an explicit order.

### W5. Node-by-node for the coder (clone `061e46c9` + fork `t4QvrtrPnTwRU6br`; guards untouched; parser fork NOT edited)

| # | node / workflow | change |
|---|---|---|
| 1 | `t4QvrtrPnTwRU6br` › `output-structurer` (Code) | `setNodeParameter /jsCode` := current body with the W1 `_codes` hunk substituted in place (anchored on the two comment lines above `let _codes = []` and the `} catch (err) { _codes = []; }` line). Nothing else in the file changes. Write the new body to `tests/diffs/miss-company-routing/getresults-output-structurer.js`; record before-sha `eac4759f` and the after-sha. **Publish the sub** (LESSONS #37 — the clone resolves only the published version). |
| 2 | clone › `miss-roster-gate` (If, existing) | `setNodeParameter /conditions/conditions/0/leftValue` := the round-4 expression: LANE rewritten to the `pairs` shape + the 5 new rows (W2), the routing leg becomes `if (!lane.pairs.some(p => p[0] === r.suggested_team && p[1] === r.suggested_agent)) return false;`, plus the two W3 precedence legs. Every other leg byte-identical (`has_result`, tool allowlist membership via `Object.keys(LANE).includes(tool)`, xd yield, company_name-labelled answers, non-empty miss set, outer `try → false`). Full text to `tests/diffs/miss-company-routing/spine-miss-roster-gate.expr.txt`. Before-sha of the leftValue on `061e46c9` = **`92ca1ccc`**. |
| 3 | clone › `miss-roster-plan` (Code, existing) | Mirror the SAME LANE literal byte-for-byte (the header comment already says "edit both together"). Stamp `team` from the parser: `const o = $('Call \'sub-query-reformulator\'').first().json.output \|\| {}; const _team = String(((o.routing)\|\|{}).suggested_team \|\| '').trim() \|\| null;` → `team: lane ? _team : null` (fail-closed: no lane ⇒ `team:null`, `members:false` ⇒ plain path ⇒ envelope passthrough). Sentinel item unchanged (`team:null, members:false, _miss_plain_offer:true`). Update the header comment to name the round-4 lanes. Body to `tests/diffs/miss-company-routing/spine-miss-roster-plan.js`. |
| 4 | everything else on the clone | **byte-identical.** Re-assert on `061e46c9`: `miss-members-gate` leftValue `14576e69`, `offer-hold-gate` `8f14a430`, `clarify-company-gate` `63e30a3d`, `cs-offer-gate` conditions `ce99a16c` (still the reverted live shape), `build-miss-member-offer` / `compile-current-state` / `clarify-company-reply` / `offer-hold-reply` / `escalation-context` / `escalate-catalog` / `build-cs-member-offer` unchanged (measured `061e46c9` == the staged payload for all of them except the two deliberate live-anchored transplants `escalate-catalog` and `compile-current-state`). Parser fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2` UNTOUCHED. |
| 5 | offline units (`tests/unit/`) | Extend the round-3 gate harness (or add `miss-company-routing-round4.gates.test.js`) — see W6. |
| 6 | pre-handoff smoke (LESSONS #45) | grep the new `.expr.txt` for `prototype\|constructor\|__proto__` (must be 0) AND run ONE real clone execution through the changed `miss-roster-gate` leftValue with no `ExpressionError` before the tester starts. |

Diff doc: append a "round-4" section to `tests/diffs/miss-company-routing.md` — before/after shas for
the three bodies, the LANE shape migration (`team/agent` → `pairs`), the two precedence legs, the
`_codes` predicate, unit results, and the explicit note that the ccs plain-arm guard set deliberately
omits `_promo`.

### W6. Verification tasks (plan §6 equivalent)

**Offline units** (run against the DEPLOYED bodies pulled by sha, never a local copy):
1. `_codes` predicate on the deployed `output-structurer` body — (i) exec-12941604 entity array ⇒ `['MUB6201']`; (ii) orders-by-DO entity (`{entity_type:'order', code:'M2608-1026', uuid:'…'}`) ⇒ `['M2608-1026']`; (iii) promotion-only entities ⇒ `[]` and the sentence renders `*Sorento:* no promotions records.`; (iv) mixed product+promotion ⇒ product code only, deduped; (v) `entities` as a JSON STRING (the `safe()` path) ⇒ same result; (vi) missing/throwing `entities` ⇒ `[]`, no throw.
2. `miss-roster-gate` LANE/pairs — TRUE: promotions envelope + `promotion`/`marketing_promotion`+`general_enquiries`; master_products; attachments on EACH of its two pairs; certificates on `purchasing_certification`. FALSE: certificates tool with `marketing_product` routing; promotions tool with `inventory` domain; every round-2/3 case re-run unchanged (orders TRUE, incoming TRUE, stock TRUE, stock-all-answered FALSE, `_xdBlock.any` FALSE, missing tool-filter FALSE, empty miss set FALSE).
3. New precedence legs — response containing `Would you like me to escalate` ⇒ FALSE; `promo-picker` `_promo_unmatched` / `_promo_pick` / `_promo_notfound` / `_brand_gate_closed` / `_promo_picker_shape` ⇒ FALSE each; `promo-picker` executed with NO marker ⇒ unchanged (TRUE on a promotions miss).
4. `miss-roster-plan` — round-4 rows produce `members:false` + `team` == the parser's `suggested_team`; attachments row stamps `marketing_product` on a photo turn and `purchasing_certification` on a cert turn; unknown tool ⇒ `team:null, members:false`.
5. LANE lockstep — assert the LANE literal in the gate expression file and in the plan body file are byte-identical (string compare, not eyeball).
6. LESSONS #45 grep on every changed `.expr.txt` (0 hits).

**Clone UAC:** `tests/miss-company-routing-UAC.md` §"Round 4" (R1–R13 + S3 + S).

**Prerequisite P3 (tester, read-only, BEFORE the round-4 "yes" cases):** `zz-roster-probe`
(`ZS0KErse7GDh9mJK`, CRM GET only) for each new pair × {Sorento `00000000-…0001`, Mocha
`38db4f20-…`}: `marketing_promotion`/`general_enquiries`, `purchasing_product`/`general_enquiries`,
`marketing_product`/`general_enquiries`, `purchasing_certification`/`general_enquiries`. The plain
lanes make **no roster call**, so an empty team does NOT break the offer — but a LIVE "yes" would hit
`next-assignee` with that pair. An empty/404 team (`No team found … in company`) is
**BLOCKED-BY-CONFIG** (admin, not code — R7 §7(iv)): record it, hand the captain the team-set gap per
company, do NOT paper over it and do NOT drop the LANE row for it. Precedent: P2 found
`warehouse`/`general_enquiries` populated 1 member per company.

### W7. Replay-norm impact

None new. Golden envelopes predate PR #193's `lookup_companies` stamping, so `miss-roster-gate` stays
FALSE corpus-wide on replay regardless of the new rows, and the `_codes` predicate only narrows a
string that golden turns never rendered (no `lookup_companies` ⇒ the whole mc-label block is inert).
`pairs`, `team` and the precedence markers ride existing per-run containers — **no `norm()` rule**.
Fresh captures of the round-4 UAC turns surface the new keys as diffs BY DESIGN (Lessons 40/41);
their synthetic `chat_histories` rows must carry a `UAC-MCR4-` prefix and be excluded from any later
full-corpus capture (Lesson 41).

### W8. Safety

No new node, no new edge, no new external call. Every round-4 LANE row is `members:false`, so the
round-4 lanes make **zero** CRM roster reads — strictly less egress-adjacent than the orders lane.
All clone guards untouched (`is_test=true` on every shared-sub call, the 5 orphaned egress nodes,
the forks). Every new leg fails closed: unknown tool ⇒ no offer; routing pair not in `pairs` ⇒ no
offer; phrase already present ⇒ no offer; any promo-picker marker ⇒ no offer; `promo-picker` throwing
⇒ caught by the outer `try` ⇒ false; missing `members` flag ⇒ plain path ⇒ envelope passthrough ⇒
byte-identical turn. The (A) hunk can only SHORTEN a rendered sentence — it can never add text, and
its failure mode (`_codes = []`) is the already-shipped no-clause sentence. §0 S1–S6 on every case.

### W9. Promote implication

**Spine `9qVyfUxmRQqrpGRMDLRuz`** — the staged combined round-2+3 payload
(`tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json`)
changes in exactly **two of its ten new nodes**: `miss-roster-gate` (leftValue `92ca1ccc` → round-4
sha) and `miss-roster-plan` (jsCode → round-4 sha). Everything else holds: still
**4 changed + 10 new + 12 connection keys @ 137 nodes**, `cs-offer-gate` byte-equal to live
`ce99a16c`, `compile-current-state`/`escalate-catalog` still the R10-F6 live-anchored transplants,
parser payload (`a68c5992`/`138008c2`) unchanged, apply order and rollback unchanged. R12 promote
rows 2 and 3 must be re-measured for those two shas; R12 row 5's watch list gains a promotions
plain-miss turn (clean code + `*<Co>* marketing_promotion team`, zero `team-members` GET) and an
attachment/certificate plain-miss turn.

**NEW — the promote set now includes a get-results sub, and it is TWO ids.** This is the first
promotion outside spine + parser, so it needs its own gates:

| stage | id | body basis | gate |
|---|---|---|---|
| build/test | `t4QvrtrPnTwRU6br` | its own body (`eac4759f` → round-4 sha) | published before clone UAC |
| promote #1 | **`rysSPgUssLDf6xJc`** (live `Call 'sub-get-results'`, `probe-incoming`, `tier-probe`) | ITS OWN body — re-fetch and confirm it is still byte-equal to `t4Qv` at promote time; if it has drifted, re-anchor the hunk, do not copy | pre-PUT sha of the current body, post-PUT sha of the new one; `activeVersionId == versionId` |
| promote #2 | **`Fss5aAaXthJSWpZCgKiKR`** (live `sibling-probe`, `crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe`) | **ITS OWN body (`11afa233`)** — it carries the OLDER timeline block; overwriting it with the `rys` body would ship an unrelated, unreviewed timeline rewrite | same, plus an explicit assert that the timeline block is UNCHANGED (only the `_codes` region differs pre/post) |

Apply order becomes **subs first, then parser, then spine** (LESSONS #37: a parent resolves only the
published version of a sub). Use `setNodeParameter /jsCode` on each sub, not a REST PUT — the public
API rejects these subs' stored `settings` shape (`availableInMCP`/`callerPolicy`/`binaryMode`),
per `plans/pending-allocation-flag-plan.md` §Phase C. Back up all three sub bodies first
(`tests/backups/miss-company-routing/ROUND4/PRE-<id>.json`); rollback = restore the PRE `jsCode` and
republish.

**Docs debt to raise with the captain (NOT auto-applied by this round):** `AGENTS.md`/`CLAUDE.md`'s
get-results row and `plans/pending-allocation-flag-plan.md` §Phase C both describe the OPPOSITE of the
live wiring (W0). The plan file is safe for the coder to correct; the AGENTS.md/CLAUDE.md edit is
captain-gated (project instructions) — raise it, do not silently rewrite it.

### W10. Findings + captain-confirm

- **F-R4-1 (fixed by this round):** the mc-label `_codes` invariant is violated by every entity type
  the CRM has no code for. Round 4 fixes the symptom in the renderer; the deeper convention
  (`canonical_code := uuid` placeholder) stays a CRM contract we read defensively.
- **F-R4-2 (LOUD, docs debt, no code):** live calls `rysSPgUssLDf6xJc` (named "TEST") for the
  customer-visible get-results path — `AGENTS.md` and `pending-allocation-flag-plan.md` are stale.
  See W0/W9. Nothing to change in the graph; the naming is a landmine for the next agent.
- **F-R4-3 (pre-existing inconsistency, captain-confirm C4):** `disallowed-entity-gate` still builds
  `company_team = 'marketing_promotion_' + brand` and `promo-picker` PREFERS it over the parser's
  routing (default literal `'marketing_promotion_sorento'`), while the parser's `deriveRouting`
  returns the collapsed `marketing_promotion` (CRM migration 371 merged the brand-suffixed T1 rows).
  So a promotions turn can name `marketing_promotion_sorento` in a not-found offer and
  `marketing_promotion` in the round-4 miss offer — two names for one pool, and the first may not
  resolve at `next-assignee` at all. **Default recommendation: fix it in this round** (one line —
  `out.company_team = (domain === 'promotion' && _brands.length === 1) ? 'marketing_promotion' : null;`
  in `disallowed-entity-gate`, or drop the `company_team` preference in `promo-picker._escTeam`).
  It directly serves the invariant this whole feature rests on: *the phrase must name the team HI
  will actually assign to*. Flagged rather than silently bundled — it touches a node outside the
  round-4 surface. Confirm before the coder starts.
- **Captain-confirm C1 (W4):** the four `is_clarification` arms keep offering NO escalation
  (they ask a question instead). Default LEAVE.
- **Captain-confirm C2:** `crm_marketing_promotion_products_list` is included for completeness; a
  per-company miss there means "that company's copy of this promotion lists no products", which is
  thin but harmless. Default INCLUDE.
- **Captain-confirm C3:** `crm_master_products_list` is included but **near-unreachable** — a product
  code that resolves in both companies returns a row in both, so a miss needs a spec/attribute-filtered
  list. Default INCLUDE (costs nothing, closes the "all domains" claim).
- **Captain-confirm C5:** `crm_certificates_list` is restricted to the `purchasing_certification`
  pair only (a certificates envelope under `marketing_product` routing is incoherent ⇒ fail-closed,
  no offer). `crm_master_product_attachments_list` accepts BOTH pairs because it genuinely serves
  photo and certificate asks. Default as stated.
- **F-R4-4 (accepted residual, carried from R12 F-R12-2a):** junk on a plain offer still closes it
  (the clarification LLM overwrites the persisted phrase). Unchanged by round 4; the fix is a parser
  `offer_hold` emission outside the Δ3 arm — a future fork round.
- **Measurement note:** the sha convention used for `leftValue` in the STAGED doc reproduces exactly
  (`printf '%s' … | shasum -a256 | cut -c1-8`); the doc's `jsCode` shas were taken over the repo
  FILES (trailing newline) and do NOT reproduce against the raw param string. Use ONE convention in
  the round-4 diff doc and say which.
