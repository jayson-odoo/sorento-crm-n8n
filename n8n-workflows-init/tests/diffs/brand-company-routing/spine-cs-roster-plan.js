// ── cs-roster-plan (brand-company-routing) ──────────────────────────────────
// One item per company to query for the CS roster. Reads the routing axes computed by
// disallowed-entity-gate (routing_companies[{company_id,company_name,brand_code,codes}]).
// No resolve this turn (gate not executed / no companies) => ONE fallback item carrying the gate's
// routing_brand when it has one => get-cs-members makes exactly today's single call (null-guarded params).
// These items ARE the pool identity: compile-current-state persists them verbatim as
// variables.routing_roster_plan and escalation-context assigns from that same pair on the bare-"yes"
// turn, so the fetch-time and assignment-time axes cannot drift apart.
const g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : {}; } catch (e) { return {}; } })();
const cos = (Array.isArray(g.routing_companies) && g.routing_companies.length)
  ? g.routing_companies
  : [{ company_id: null, company_name: null, brand_code: g.routing_brand || null, codes: [] }];
return cos.map((c, i) => ({ json: {
  plan_idx: i,
  company_id: c.company_id || null,
  company_name: c.company_name || null,
  brand_code: c.brand_code || null,
  codes: Array.isArray(c.codes) ? c.codes : [],
  multi_company: cos.length > 1,
  companies: cos.map(x => x.company_name).filter(Boolean),
} }));
