# Neighbour / Suggest-on-Miss API — contract for n8n

**Audience:** the n8n chatbot builder agent.
**Status:** backend BUILT + verified (2026-07-04, CRM repo). This doc is the contract to build the
render/UX half against. Companion: `suggest-on-miss-plan.md` (§4/§5 = your work).

**One-line model:** the CRM never dead-ends a miss. Two kinds of miss, two sources of suggestion —
both arrive **inside a tool response you already call**. You do not call any new endpoint. You read
two extra fields and render them.

---

## 0. The two miss types (do not conflate)

| | Miss type 1 — RESOLUTION miss | Miss type 2 — DATA miss |
|---|---|---|
| Meaning | the token matched no product/customer | the entity resolved, but the asked domain has 0 rows |
| Example | `SRTKT71SX` → no such code | `SRTWC8066` exists but has 0 stock |
| Source field | `references/resolve` → per-token `alternatives[]` (`matches[]` stays `[]`) | domain tool → `alternatives[]` (+ `relaxed_axis`) |
| When | at the resolve step (no second call) | at get-results (domain tool step) |
| Render as | "no such code; did you mean X, Y?" | "no stock; try {sibling}, or escalate" |

You handle BOTH. They can co-occur in a turn but come from different calls.

---

## 1. Flow (2 steps, deterministic)

```
user msg
  → STEP 1  references/resolve            → canonical_code(s)   [+ matches[] if a token missed]
  → pick domain tool by `domain`          (you already compute `domain`)
  → STEP 2  <domain MCP tool>(code, ...)  → data                [+ alternatives[] if data empty]
  → render
```

You already know `domain`. Keep a **static `domain → tool` map** (below) — no LLM tool-guessing
needed. Call that one tool. If its `data` is empty, `alternatives[]` is already in the same response.

---

## 2. STEP 1 — `references/resolve` (RESOLUTION miss → `matches[]`)

`POST /api/v1/system/references/resolve`

Request (unchanged from today):
```json
{ "tokens": ["cwc757"], "match_mode": "or", "allowed_entity_types": ["product"],
  "domain": "inventory", "limit": 15 }
```

Response — per token, the branch signal:
- **exact hit** → the token appears resolved (`matches[]` non-empty, in `resolutions`/`intersection`),
  `unresolved_tokens` empty → proceed to STEP 2 with `canonical_code`. `alternatives` is `[]` here.
- **resolution miss** → the token is in `unresolved_tokens`, `matches[]` stays `[]`, AND the per-token
  **`alternatives[]`** carries trigram "did you mean" neighbours → **render "no such code; did you mean …"**
  using `alternatives[].canonical_code`. No second call needed.
- **none** → `matches[]` `[]` AND `alternatives[]` `[]` → no candidates → escalation-only.

`matches[]` entry (exact/prefix/embedding — a resolved candidate):
```json
{ "entity_type":"product", "canonical_code":"SRTKT71SS", "uuid":"…",
  "match_field":"product_code", "match_tier":"exact", "similarity":null,
  "display":{ "product_name":"…", "is_active":true } }
```

`alternatives[]` entry (trigram did-you-mean — present ONLY when `matches[]` is empty). **Same field
shape as `matches[]`**, always `match_tier:"trgm"`:
```json
{ "entity_type":"product", "canonical_code":"SRTKT71SS", "uuid":"192f418d-…",
  "match_field":"product_code", "match_tier":"trgm", "similarity":0.667,
  "display":{ "product_name":"SRTKT71SS", "is_variant":false } }
```
- `match_tier` ∈ `exact | prefix | substring | trgm | word | embedding`. In `matches` → resolved;
  in `alternatives` → always `trgm`.
- Alternatives are **entity-level, NOT domain-gated** (resolve doesn't know if the neighbour has stock).
  Ranked variants-first then similarity-desc, floored at 0.40, capped at 5. Multi-entity: when no
  whitelist is passed, a token can surface product + customer + order neighbours together.
- `render` uses `alternatives[].canonical_code`. Feed the picked code back into resolve (or straight to
  the domain tool) as `product_id`/`tokens`.
- `match_mode:"and"` → an empty intersection carries a top-level **`alternatives[]`** (union across the
  tokens, deduped) instead of per-token. When AND falls back to OR (`fallback_match_mode:"or"`) you get
  the per-token `resolutions[].alternatives` form instead.

---

## 3. STEP 2 — domain tools (DATA miss → `alternatives[]`)

Call the tool for the turn's `domain`. On an **empty** result the response gains two top-level fields:

```json
{ "data": [], "empty": true,
  "alternatives": [ … ],
  "relaxed_axis": "entity" | "date" }
```

- With data → **no** `alternatives`/`relaxed_axis` keys at all (output byte-identical to today).
- Empty AND a data-bearing neighbour exists within range → `alternatives[]` populated.
- Empty AND no neighbour has data (or nearest is too far) → **`alternatives` absent / empty** →
  render "no similar {X} with {data}" (see §6).

### `domain → MCP tool` map (build this as a lookup)

| `domain` | MCP tool | HTTP (reference) | key input | axis |
|---|---|---|---|---|
| `inventory` | `crm_inventory_stock_balance_list` | `GET /api/v1/inventory/stock/balance` | `product_id` (code or uuid) | entity |
| `incoming` | `crm_incoming_stock_by_product` | `GET /api/v1/incoming-stock/by-product` | `product_ids` | entity |
| `order` | `crm_order_management_orders_list` | `GET /api/v1/order-management/orders` | `customer_query` + `actual_delivery_date_from/_to` | **date** |
| `product_attachment` | `crm_master_product_attachments_list` | `GET /api/v1/master-data/product-attachments` | `product_id` + `attachment_type_ids` | entity |
| `promotion` | `crm_marketing_promotions_list` | `GET /api/v1/marketing/promotions` | `product_ids` (uuid) | entity |
| `master_products` | `crm_master_products_list` | `GET /api/v1/master-data/products` | `query` (code/text) | entity |

Domains with **no** neighbour (never emit `alternatives`): `forms`, `portal_link`, `goods_receive`,
`spo_allocation`, `resource_attachment`, `null`. For those, an empty result = normal empty; offer
escalation only.

### `alternatives[]` entry shapes

**Entity axis** (`relaxed_axis:"entity"`) — every domain except `order`:
```json
{ "value":"SRTWC8066-SC", "display":"SRTWC8066-SC", "id":"efbe923b-…",
  "sim":0.833, "is_variant":true }
```
- `value` = the neighbour's **canonical code** — render this; use it as the follow-up tap title and
  as the `product_id`/`query` for a re-query.
- `is_variant:true` = a real variant of what the user asked (curated graph); `false` = a trigram
  near-neighbour. Variants are ranked first.
- `sim` = trigram similarity (0–1), already floored at 0.40. `id` = product UUID (for a re-query;
  do **not** show it to the user).

**Date axis** (`relaxed_axis:"date"`) — `order` domain only:
```json
{ "value":"2026-04-02", "display":"2026-04-02 (DO 202604-0326)", "order_number":"202604-0326" }
```
- `value` = the nearest delivery date (ISO). `display` = ready-to-show label. `order_number` = the DO.

Cap: backend returns ≤3 alternatives.

---

## 4. Verified examples (real responses)

**Stock (inventory, entity):** `GET /api/v1/inventory/stock/balance?product_id=SRTWC8066`
```json
{ "data":[], "pagination":{"total":0}, "empty":true, "relaxed_axis":"entity",
  "alternatives":[
    {"value":"SRTWC8066-SC","sim":0.833,"is_variant":true,"id":"…"},
    {"value":"SRTWC8066-S-RG","sim":0.714,"is_variant":true,"id":"…"},
    {"value":"SRTWC8066-S-BL","sim":0.714,"is_variant":true,"id":"…"} ] }
```

**The "8518 rule" (a no-data neighbour is skipped):** `SRTWC8601` — its nearest neighbour
`SRTWC8601-RL` (sim 0.769) has 0 stock, so it is **absent**; the walk continues to in-stock ones:
```json
{ "empty":true, "relaxed_axis":"entity",
  "alternatives":[ {"value":"SRTWC8601-P-RL",…}, {"value":"SRTWC8601-300-RL",…}, {"value":"SRTWC8601-S-200-RL",…} ] }
```

**Too far → no neighbour:** `ADX-BTE010` (only data-bearing neighbour below the 0.40 floor)
```json
{ "empty":true }        // no "alternatives", no "relaxed_axis" → render "no similar with stock"
```

**Order (date):** `GET /api/v1/order-management/orders?customer_query=LUXEWARE BATH AND ART [A/C IV]&actual_delivery_date_from=2026-04-05&actual_delivery_date_to=2026-04-05`
```json
{ "relaxed_axis":"date",
  "alternatives":[
    {"value":"2026-04-02","display":"2026-04-02 (DO 202604-0326)","order_number":"202604-0326"},
    {"value":"2026-04-01","display":"2026-04-01 (DO 202604-0089)","order_number":"202604-0089"},
    {"value":"2026-04-09","display":"2026-04-09 (DO 202604-1027)","order_number":"202604-1027"} ] }
```

**Promotion (entity):** `product_ids=[<uuid of MWT8703SS-DIY>]` (no promo)
```json
{ "empty":true, "relaxed_axis":"entity",
  "alternatives":[ {"value":"MWT8703SS-BL-DIY","sim":0.824,"is_variant":true} ] }
```

**Master products (entity):** `GET /api/v1/master-data/products?query=SRTKT71SX` (typo, 0 rows)
```json
{ "empty":true, "relaxed_axis":"entity",
  "alternatives":[ {"value":"SRTKT71SS",…}, {"value":"SRTKT71SS-BL",…}, {"value":"SRTKT71SS-GM",…} ] }
```
A resolving query with rows (`query=SRTKT71SS`) → normal result, **no** alternatives.

---

## 5. Rendering (your §5 — combined offer + quick replies)

On any miss, render ONE interactive message carrying both the suggestion and an escalation option:

> **SRTWC8066** has no stock.
> [SRTWC8066-SC] [SRTWC8066-S-RG] [SRTWC8066-S-BL] [Yes, escalate] [No, it's okay]

- Suggestion button title = `alternatives[i].value` (entity) or `alternatives[i].value` date (date axis).
  Tapping it is self-resolving: it comes back as a bare code/date → resolve → get-results.
- Phrase by `relaxed_axis`:
  - `entity` → "no {stock/eta/promo/doc} for {code}, but {alt.value} has it"
  - `date` → "no delivery on {asked date}; {customer} has delivery on {alt.value}"
- Escalation is offered on every miss (the MCP empty response also carries `suggested_escalation`
  from the existing escalation-hint layer — unchanged; compose it into the same message).
- Cap the buttons per the WhatsApp reply-button / list limits you already handle.

---

## 6. Edge cases / invariants

- **No `alternatives` key on an empty result** → there is genuinely no similar item with data (or all
  are below the 0.40 similarity floor). Render "No similar {product} with {stock/eta/…}. Escalate?"
  Do NOT invent a suggestion.
- **Multi-product query** (>1 resolved input) → tools return **no** alternatives ("which product's
  neighbours?" is undefined). Only single-entity misses get them.
- **`references/resolve` alternatives are entity-level (not domain-gated)** — a did-you-mean over codes,
  present only when `matches[]` is empty. The domain tools' `alternatives` are the has-data ones. Both
  exist; use resolve's to fix a mistyped code, the tool's to find a sibling that actually has data.
- **With-data responses are byte-identical to today** — the two keys appear ONLY on the empty path,
  so your existing happy-path rendering is untouched. Gate your new render on
  `response.alternatives != null`.
- **`value` is always human-readable** (code or date) — safe to show and to feed back into resolve.
  `id`/`uuid` are for machine re-query only; never display.
- **Ranking is done for you**: alternatives arrive best-first (variants above near-neighbours; nearest
  date first). Render in array order.

---

## 7. Not yet wired (ask CRM if your flow needs them)
- `crm_marketing_promotion_products_list` (`/api/v1/marketing/promotion-products`) — the
  product-line-granularity promo tool. Only `crm_marketing_promotions_list` emits alternatives today.
  If the "does product X have a promo" flow hits promotion-products, request the mirror.
- Promotion alternatives fire only when the product is in **no promo at all**; an EXPIRED-only promo
  returns a row (active→inactive fallback) and so is not the empty path.
