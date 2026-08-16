# CRM ask — emit `brand` on every product resolution

> ## ✅ DELIVERED 2026-08-10 — `sorento-crm` PR #118, run 31360309054, blue/green deployed.
> Verified against a LIVE envelope (exec `11909651`), not the merge:
> `CBS212-WH`, `match_field: product_code`, `match_tier: "and"` now carries
> `display.brand = { brand_code: "CABANA", brand_name: "CABANA" }` beside `company_name: "Sorento"`.
> End to end, the reported turn now reads *"…escalate to **marketing_promotion_cabana** team?"*.
> **Items 1 and 2 below are done. Item 4 (brand on PROMOTION rows) is still open** — promotion
> matches post-deploy still carry `brand: null`, so a promotion-scoped enquiry still routes by
> company. Item 3 (do not derive from code prefix) remains a standing constraint.

**For:** the `sorento_crm` agent. **Raised from:** `sorento_crm_n8n`, 2026-08-10.
**Symptom that raised it:** `promo for CBS212-WH` (a **Cabana** product) offers escalation to
`marketing_promotion_sorento`.

## The model (settled with the user, 2026-08-10)

**Cabana is a BRAND under the Sorento COMPANY.** Mocha is a separate COMPANY.

Therefore promotion escalation must route on **brand first, company second**:

| resolved | team |
|---|---|
| brand Cabana | `marketing_promotion_cabana` |
| brand Mocha *(or company Mocha)* | `marketing_promotion_mocha` |
| any other brand, or no brand | fall back to **company** → `marketing_promotion_sorento` |

User's words: *"if not cabana, then sorento for the brands, so for those other brands also fall
under sorento marketing promotion team."*

## Why n8n cannot do this alone

`company_name` for `CBS212-WH` is `"Sorento"` — correct under this model, and therefore useless for
distinguishing Cabana. The only field that can distinguish it is `brand`, and **the resolver does
not return `brand` on the match path that a product-code lookup takes.**

Measured over 123 resolution rows in 8 captured executions (exec ids below):

| match path | rows | carrying `display.brand` |
|---|---|---|
| `brand_access` / `brand_access_fallback` | 8 | **8** |
| `product_code` `exact` \| `and` \| `prefix` \| `substring` | 52 | **0** |
| `promotion_membership` / `via_product` | 48 | **0** |
| `description` / `substring` | 15 | **0** |

So brand is emitted *only* when the resolver matched **via** brand access. A direct code lookup —
the overwhelmingly common case, and exactly the CBS212-WH case (`product_code` / `and`) — returns:

```json
{ "entity_type": "product", "canonical_code": "CBS212-WH",
  "uuid": "2c03ed5a-0219-4b16-9ae2-7da5f1516ef3",
  "match_field": "product_code", "match_tier": "and",
  "company_id": "00000000-0000-0000-0000-000000000001", "company_name": "Sorento",
  "display": { "product_name": "CBS212-WH", "is_active": true } }
```

No `brand` key at all.

## The ask

1. **Include `brand` in `display` on EVERY product resolution match**, whatever the match path —
   `product_code` (all tiers), `brand_access`, and any future path. Same shape already used on the
   brand-access path, so nothing new to design:

   ```json
   "brand": { "brand_id": "…", "brand_code": "CABANA", "brand_name": "Cabana" }
   ```

   n8n also accepts a bare string (`"brand": "Cabana"`) — either shape works, but pick one and be
   consistent.

2. **Populate brand on the Cabana products.** `CBS212-WH` currently has none. Whether that is a
   null column or a derivation gap is yours to determine — please check the underlying data before
   changing the serializer, so we do not ship a field that is reliably `null`.

3. **Do NOT derive brand from the code prefix** (`CBS…` → Cabana). That is precisely the mistake
   that mislabelled 1,934 rows before. Brand must come from the product's own brand relation.

4. Ideally also emit `brand` on **promotion** rows (`promotion_membership` / `via_product`), so a
   promotion-scoped enquiry routes as accurately as a product-scoped one. Lower priority — the
   product path is what the reported symptom needs.

## What is already done on the n8n side

Landed on the promotion-picker fork `RnpxEnAV3g20MmKj` (`b5889aae`), **not promoted to live**:

`disallowed-entity-gate` now derives the team from **brand when present, company otherwise**. It
was previously company-only — the block even named its variable `_brands` while reading
`company_name`, so the `cabana` arm was unreachable.

The change is **inert on 115 of the 123 rows above** (no brand ⇒ identical behaviour), and it does
**not** fix CBS212-WH on its own — verified by re-running the turn after publishing: still
`marketing_promotion_sorento`. It starts working the moment the CRM emits brand on the product_code
path; no further n8n change is needed then.

Gate: `n8n-workflows-init/tests/offline/brand-routing/` — 62 assertions (42 replaying real recorded
gate output to prove inertness, plus the brand behaviours), 7 mutants.

## Evidence

Executions on `RnpxEnAV3g20MmKj`: `11894257` (CBS212-WH), `11894212` (SRTBF11834),
`11891721` (the brand-access path that *does* carry brand), `11893115`, `11893090`, `11893014`,
`11889275`, `11888566`. Fixtures captured verbatim in
`n8n-workflows-init/tests/offline/brand-routing/fixtures.json`.
