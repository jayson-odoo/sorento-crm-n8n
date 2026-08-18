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
| `crm_inventory_stock_balance_list` | inventory | yes (`_stock` L812) | yes (`inventory_service.list_stock`) | `stock records` | warehouse / general_enquiries | "no balance row" is the same business fact as a 0-on-hand row (captain decision 2: qty 0 is an answer) — an honest answer, not a hand-off | **LEFT OUT** (decision 2; would be inconsistent to offer on "no row" but not on "0") — one allowlist row flips it (D2) |
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
link, GRN/SPO, ideate.

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
