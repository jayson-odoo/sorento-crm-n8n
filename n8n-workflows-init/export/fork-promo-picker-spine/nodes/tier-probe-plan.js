// ── tier-probe-plan ──────────────────────────────────────────────────────────────────────
// access-tier-ask-plan D14. Fans the ask turn out into ONE ITEM PER ENTITLED TIER so the
// downstream `tier-probe` sub-call (mode: run once for EACH item) asks the CRM, per tier,
// "are there any promotions here at all?" before we make the customer choose.
//
// WHY per tier and not one call: promotion rows carry NO access level (verified on a real
// payload — fields are Promotion / Start Date / End Date, and `field_access` is null). The
// incoming-stock picker can annotate with ONE batched call because its rows carry the product
// code to match on; there is no equivalent key for tier. The only alternative is reading the
// tier out of the filename ("... DEALER USE.pdf"), which is the same string-guessing that
// mislabelled 1,934 rows on the brand work. So: one deterministic call per tier.
//
// Reached only from `if-tier-ask` TRUE, so tier_ask is true here, which means >1 entitled tier
// (needsTierAsk's bound). The defensive single-item fallback exists because returning [] would
// silently skip EVERY downstream node — including the ask itself — and the customer would get
// nothing at all rather than a degraded ask.
const tg = $('tier-gate').first().json;
const plan = Array.isArray(tg.tier_probe_plan) ? tg.tier_probe_plan : [];

if (plan.length === 0) {
  return [{ json: { ...tg, probe_tier: null, probe_access_levels: [], probe_skipped: true } }];
}

return plan.map(p => ({
  json: {
    ...tg,
    probe_tier: p.tier,
    // the compound names for THIS tier alone (tier × query brand ∩ entitlement, from the same
    // recompose the answer lane uses — never string-built, never the raw entitlement)
    probe_access_levels: Array.isArray(p.access_levels) ? p.access_levels : [],
    probe_skipped: false,
  },
}));
