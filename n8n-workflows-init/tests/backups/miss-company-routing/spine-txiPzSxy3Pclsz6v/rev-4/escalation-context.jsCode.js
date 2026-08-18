// ── escalation-context (brand-company-routing) ──────────────────────────────
// What the escalation turn sends to sub-human-intervention: the brand/company axes, resolved
// from (1) the picked member's row in the frozen last_result_set, else (2) the roster plan the
// offer was actually fetched with (same team only — a domain switch drops the axes), else (3) a
// brand the customer stated when no roster was involved at all.
// Pool identity (rev-3 picked / rev-4 unpicked): both axes are always what the get-cs-members call
// used — a picked row's own company_id/brand_code, or the single persisted routing_roster_plan pair,
// verbatim (null stays null). Never re-derived from routing_brand or this turn's query_brands, which
// would narrow next-assignee to a pool the customer was never shown.
// Bare "yes" after a multi-company offer => both axes null (CRM resolves via contact/default).
// Pass-through: the incoming item is spread so downstream $json refs are unchanged.
const o = $('Call \'sub-query-reformulator\'').first().json.output || {};
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const team = (o.routing || {}).suggested_team || null;
const sameTeam = !!(prev.routing && team && prev.routing.suggested_team === team);
const picked = (o.escalation || {}).preferred_assignee_id || null;
const row = picked ? (Array.isArray(prev.last_result_set) ? prev.last_result_set : []).find(r => r && r.uuid === picked) : null;
const qb = (Array.isArray(o.query_brands) && o.query_brands.length === 1) ? String(o.query_brands[0]).toLowerCase() : null;
// miss-company-routing: a company-name reply on the confirmation turn. The parser (§2) emits
// escalation.company_pick only after word-boundary-matching the reply against the companies the
// PERSISTED state names and finding no member match. Resolve it against that same persisted pool
// identity — the roster plan first, then routing_companies — case-insensitive on name or id, and
// send the matched row's (company_id, brand_code) VERBATIM. No match ⇒ cpickRow null ⇒ the arm
// below never fires and everything behaves exactly as before.
const cpick = (o.escalation || {}).company_pick ? String((o.escalation || {}).company_pick).toLowerCase().trim() : null;
const cpickRow = cpick ? [
  ...(Array.isArray(prev.routing_roster_plan) ? prev.routing_roster_plan : []),
  ...(Array.isArray(prev.routing_companies) ? prev.routing_companies : []),
].find(c => c && ((c.company_name && String(c.company_name).toLowerCase().trim() === cpick) || (c.company_id && String(c.company_id).toLowerCase() === cpick))) || null : null;
let brand_code = null, company_id = null, company_name = null, source = 'none';
if (row) {
  company_id = row.company_id || null;
  company_name = row.company_name || null;
  brand_code = ('brand_code' in row) ? (row.brand_code || null) : ((sameTeam ? prev.routing_brand : null) || null);
  source = 'picked_member';
} else if (cpickRow) {
  // miss-company-routing: company pick — sits ABOVE the multi-company-unpicked arm (inside
  // sameTeam below) so a resolvable company reply routes instead of re-clarifying.
  company_id = cpickRow.company_id || null;
  company_name = cpickRow.company_name || null;
  brand_code = cpickRow.brand_code || null;
  source = 'company_pick';
} else if (sameTeam) {
  const rp = Array.isArray(prev.routing_roster_plan) ? prev.routing_roster_plan : [];
  if (rp.length === 1) {
    company_id = rp[0].company_id || null;
    company_name = rp[0].company_name || null;
    brand_code = rp[0].brand_code || null;
    source = company_id ? 'prior_state' : 'prior_state_no_company';
  } else if (rp.length > 1) {
    source = 'multi_company_unpicked';
  } else {
    const cos = Array.isArray(prev.routing_companies) ? prev.routing_companies : [];
    company_id = prev.routing_company || null;
    const c = cos.find(x => x && x.company_id === company_id);
    company_name = c ? (c.company_name || null) : null;
    source = company_id ? 'prior_state' : (cos.length > 1 ? 'multi_company_unpicked' : 'prior_state_no_company');
    // miss-company-routing rev-2 (captain decision 2026-08-18): NO roster was fetched for this offer
    // (routing_roster_plan empty), so there is no shown pool for a brand to disagree with — carry the
    // resolved brand from prior state instead of dropping it. next-assignee narrows to
    // brand-tagged + untagged members, so this can only refine the pool, and there is no pinned
    // pick on this arm to exclude. The roster-backed arms above keep their fetch-verbatim brand.
    if (source !== 'multi_company_unpicked') brand_code = prev.routing_brand ?? null;
  }
} else if (qb) {
  brand_code = qb;
  source = 'stated_brand';
}
return [{ json: { ...$input.first().json, brand_code, company_id, company_name, routing_source: source, team } }];
