// ── escalation-context (brand-company-routing) ──────────────────────────────
// What the escalation turn sends to sub-human-intervention: the brand/company axes, resolved
// from (1) the picked member's row in the frozen last_result_set, else (2) prior-turn state
// (same team only — a domain switch drops the axes), else (3) a brand the customer stated.
// rev-3: a picked row's brand_code is authoritative whenever the row matched — with or without a
// company_id (null stays null — the SAME pool the roster call used); prev.routing_brand is only a
// fallback for a legacy row that has no brand_code key.
// Bare "yes" after a multi-company offer => company_id null (CRM resolves via contact/default).
// Pass-through: the incoming item is spread so downstream $json refs are unchanged.
const o = $('Call \'sub-query-reformulator\'').first().json.output || {};
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const team = (o.routing || {}).suggested_team || null;
const sameTeam = !!(prev.routing && team && prev.routing.suggested_team === team);
const picked = (o.escalation || {}).preferred_assignee_id || null;
const row = picked ? (Array.isArray(prev.last_result_set) ? prev.last_result_set : []).find(r => r && r.uuid === picked) : null;
const qb = (Array.isArray(o.query_brands) && o.query_brands.length) ? String(o.query_brands[0]).toLowerCase() : null;
let brand_code = null, company_id = null, company_name = null, source = 'none';
if (row) {
  company_id = row.company_id || null;
  company_name = row.company_name || null;
  brand_code = ('brand_code' in row) ? (row.brand_code || null) : ((sameTeam ? prev.routing_brand : null) || null);
  source = 'picked_member';
} else if (sameTeam) {
  const cos = Array.isArray(prev.routing_companies) ? prev.routing_companies : [];
  company_id = prev.routing_company || null;
  brand_code = qb || prev.routing_brand || null;
  const c = cos.find(x => x && x.company_id === company_id);
  company_name = c ? (c.company_name || null) : null;
  source = company_id ? 'prior_state' : (cos.length > 1 ? 'multi_company_unpicked' : 'prior_state_no_company');
} else if (qb) {
  brand_code = qb;
  source = 'stated_brand';
}
return [{ json: { ...$input.first().json, brand_code, company_id, company_name, routing_source: source, team } }];
