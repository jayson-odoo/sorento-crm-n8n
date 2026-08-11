# CRM ask — split access entitlement into BRAND × TIER (two axes)

**For:** the `sorento_crm` agent. **Raised from:** `sorento_crm_n8n`, 2026-08-11.
**Decided by the user (jayson), grilled over three rounds — the shape below is settled intent,
the contract details are what we need to agree.**

## The problem the current model causes

Access levels today are COMPOUND: `Sorento Dealer`, `Cabana Dealer`, `Mocha Office`, `End User`…
One string carries two independent axes — WHICH BRAND the contact may see, and WHICH TIER of
document (office / dealer / end user pricing). Customer-visible fallout on the n8n side:

- The access-level ask had to enumerate 5–7 compound options in one WhatsApp message
  (measured live, contacts 477071889 / 404285551), and respond.io quick-replies can't multi-select.
- The current live workaround sends the FULL entitlement union with no ask at all — so a query
  answers with every tier's copy of the same promo (OFFICE.pdf + DEALER.pdf rows side by side).
- Promotion rows carry no brand (prior ask item 4, still open), so brand can only be inferred
  from the compound level name — which the parser was never supposed to parse.

## Target model (user-decided)

Per contact, TWO independent entitlement fields:

| axis | values | meaning |
|---|---|---|
| `brands` | subset of `sorento, cabana, mocha` | which brands' documents the contact may see |
| `access_levels` | subset of `office, dealer, end_user` | which tier of document |

- **The brand gate stays**: a Cabana-only dealer must never see Sorento dealer files.
  (Explicitly confirmed — collapsing to tier-only with cross-brand visibility was rejected.)
- A promotion (and its file) is tagged with `brand` + `access_level` (tier).
- The promotions read path (`crm_promotions_list` / get-results promotion tool + the entity
  resolver) accepts **both** filters together: `brands: [...]`, `access_levels: [...]` —
  n8n always sends both; an empty/omitted brands means "all brands the contact is entitled to"
  (server applies the entitlement gate, as it does today for levels).

n8n side (ours, not yours): the semantic parser keeps emitting brand as an ENTITY
(`{raw: "Cabana", hint: "brand"}`); we derive a normalized brand deterministically and send it as
the `brands` filter. Tier comes from the customer's words ("dealer price list") or a numbered
tier ask (office / dealer / end user, multi-selectable) when the contact holds >1 tier.

## Migration constraints (hard requirements from our side)

1. **Zero downtime / inert rollout.** We will ship a compatibility mapper
   (`"Sorento Dealer" → {brand: sorento, tier: dealer}`, `"End User" → {brand: *, tier: end_user}`)
   that consumes TODAY's compound names, so n8n works before, during and after your migration.
   For that to hold:
   - the entitlement read (`Aggregate` source — the access-types/contact-entitlement endpoint)
     must not change shape SILENTLY. Additive is fine (new `brands[]` + `tiers[]` fields beside
     the legacy `name[]`), rename/removal is not — tell us the cutover and we delete the mapper.
2. **Both-axes filtering must be one call.** Brand and tier land on the SAME tool invocation;
   two sequential filtered calls would double latency on the busiest promo path.
3. **`End User` mapping decision needed from you**: today it has no brand prefix. Is an
   end-user-tier document brand-scoped in the new model (our assumption: yes, brand axis applies
   to all tiers) or globally visible?
4. Existing open item 4 (promotion rows carry `brand` in resolver display) folds into this —
   same field, now load-bearing rather than display-only.

## What we need back from you

- Agreement (or counter-proposal) on the field names/shapes above for: contact entitlement,
  promotion tagging, tool params, resolver row display.
- Whether entitlement admin UI can set the two axes independently ("this contact: brands
  sorento+cabana, tiers dealer" — the user explicitly wants to configure brand access per contact).
- Migration plan sketch: additive fields first (n8n switches consumers), compound names retired
  last. Rough sequencing/ETA so we can schedule the n8n bundle.
- The `End User` brand-scoping decision (item 3).

## Sequencing on our side (for context, no action needed)

n8n builds now against today's data via the compat mapper: tier ask (numbered, multi-select,
per-query, only when >1 tier entitled and none stated), always-attach answers, brand from
entities. Your additive fields activate the clean path the day they exist — same
inert-until-data pattern as the brand routing (#16) that is already live and waiting on row brand.
