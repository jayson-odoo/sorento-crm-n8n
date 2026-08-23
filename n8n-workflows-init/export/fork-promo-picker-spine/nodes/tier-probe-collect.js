// ── tier-probe-collect ───────────────────────────────────────────────────────────────────
// access-tier-ask-plan D14. Folds the N per-tier probe responses back into ONE item carrying
// `tier_availability` ({office:true, dealer:false, end_user:false}) for the ask renderer, and
// `tier_any_available` for the routing IF.
//
// PAIRING: the sub-call runs once per input item and n8n preserves input order, so probe result
// i belongs to plan item i. That is an ordering assumption, so it is made explicit and checked:
// if the counts disagree we do NOT guess an alignment — every tier falls back to "unknown"
// (null), the renderer drops the annotation entirely, and the ask still works. A wrong pairing
// would tell a customer "no promotion" about a tier that has them, which is worse than silence.
//
// AVAILABILITY is deliberately generous: a tier counts as available on `has_result === true` OR
// a non-empty answers[]. The envelope has carried both over time, and the failure direction
// matters — a false "no promotion" hides real files, while a false "has promotion" costs the
// customer one wasted pick, which is exactly today's behaviour.
const results = $input.all();
const planItems = $('tier-probe-plan').all().map(i => i.json);
const base = $('tier-gate').first().json;

const ORDER = ['dealer', 'office', 'end_user'];
let availability = null;

if (planItems.length > 0 && planItems.length === results.length && planItems[0].probe_skipped !== true) {
  availability = {};
  for (let i = 0; i < planItems.length; i++) {
    const tier = planItems[i].probe_tier;
    if (!tier) continue;
    const j = (results[i] && results[i].json) || {};
    const rows = Array.isArray(j.answers) ? j.answers : [];
    availability[tier] = j.has_result === true || rows.length > 0;
  }
}

// null availability => "we could not determine this", NOT "nothing is available". The renderer
// and the router both read it that way: no annotation, and the ask proceeds as before.
const any = availability ? Object.values(availability).some(Boolean) : true;

return [{
  json: {
    ...base,
    tier_availability: availability,
    tier_available_list: availability ? ORDER.filter(t => availability[t]) : null,
    tier_any_available: any,
    _tier_probe_count: results.length,
    _tier_probe_planned: planItems.length,
  },
}];
