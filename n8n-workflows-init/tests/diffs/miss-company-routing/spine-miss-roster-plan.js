// ── miss-roster-plan (miss-company-routing, rev-3) ──────────────────────────
// One item per MISS company on an ANSWERED turn that passed miss-roster-gate — orders, incoming
// AND stock lanes (rev-3; the old "order turn" wording was stale — F-R3-2): a company the envelope
// says was queried (lookup_companies) but that contributed no answer (no
// answers[].fields[key='company_name'] naming it). miss-roster-gate has already verified the shape
// (has_result, lane domain+routing lockstep, EVERY answer labelled with a company_name key field,
// non-empty miss set) with the SAME derivation — keep the two in lockstep: an empty result here
// would starve the happy lane of its item, so the impossible-empty case degrades to ONE
// null-company sentinel item (members:false — a sentinel must NEVER fetch a roster;
// miss-members-gate routes it FALSE and build-miss-member-offer passes the envelope through, turn
// byte-identical). Every real item carries the lane's `members` flag (true = orders-only member
// picker via get-cs-members-miss; false = plain offer, NO roster fetch — miss-members-gate reads
// it off $json) and `team` (the frozen phrase names this team; == the parser's suggested_team,
// which the gate enforced). Item shape mirrors cs-roster-plan so downstream consumers
// (build-miss-member-offer, the ccs persistence hunk, escalation-context) treat the two plans
// identically; brand_code is looked up from disallowed-entity-gate's routing_companies entry for
// the company (null when absent — the roster call then runs company-only, same pool the CRM would
// assign from).
const env = $('central-exchange').first().json;
  const LANE = {  // rev-3 allowlist (§V1) — tool ⇒ parser domain + routing pair (offer phrase, roster URL, HI team in lockstep) + members (true = orders-only member picker; false = plain offer, NO roster fetch). MIRRORED BYTE-IDENTICAL in miss-roster-gate and miss-roster-plan — edit both together.
    'crm_order_management_orders_list':            { domain: 'order',     team: 'customer_service', agent: 'order_enquiries',          members: true },
    'crm_order_management_orders_by_product_list': { domain: 'order',     team: 'customer_service', agent: 'order_enquiries',          members: true },
    'crm_incoming_stock_list':                     { domain: 'incoming',  team: 'purchasing',       agent: 'incoming_stock_enquiries', members: false },
    'crm_incoming_stock_by_product':               { domain: 'incoming',  team: 'purchasing',       agent: 'incoming_stock_enquiries', members: false },
    'crm_incoming_stock_shipments':                { domain: 'incoming',  team: 'purchasing',       agent: 'incoming_stock_enquiries', members: false },
    'crm_inventory_stock_balance_list':            { domain: 'inventory', team: 'warehouse',        agent: 'general_enquiries',        members: false },
  };
const tool = String((($('tool-filter').first().json) || {}).name || '').trim();
const lane = (tool && Object.keys(LANE).includes(tool)) ? LANE[tool] : null;  // fail-closed: unknown lane ⇒ members:false, team:null (plain path, never a roster fetch)
const lc = Array.isArray(env.lookup_companies) ? env.lookup_companies : [];
const ans = Array.isArray(env.answers) ? env.answers : [];
const answered = new Set();
for (const a of ans) {
  const f = (a && Array.isArray(a.fields)) ? a.fields.find(x => x && x.key === 'company_name' && x.value) : null;
  if (f) answered.add(String(f.value).toLowerCase().trim());
}
const g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : {}; } catch (e) { return {}; } })();
const rc = Array.isArray(g.routing_companies) ? g.routing_companies : [];
const miss = lc.filter(c => c && c.name && !answered.has(String(c.name).toLowerCase().trim()));
if (!miss.length) {
  // gate/plan divergence sentinel — see header. build-miss-member-offer drops null-company items.
  return [{ json: { plan_idx: 0, company_id: null, company_name: null, brand_code: null, codes: [], multi_company: false, companies: [], team: null, members: false, _miss_plan_empty: true } }];
}
return miss.map((c, i) => {
  const m = rc.find(x => x && ((x.company_id && c.id && x.company_id === c.id) || (x.company_name && c.name && String(x.company_name).toLowerCase().trim() === String(c.name).toLowerCase().trim()))) || null;
  return { json: {
    plan_idx: i,
    company_id: c.id || null,
    company_name: c.name || null,
    brand_code: (m && m.brand_code) || null,
    codes: (m && Array.isArray(m.codes)) ? m.codes : [],
    multi_company: miss.length > 1,
    companies: miss.map(x => x.name).filter(Boolean),
    team: lane ? lane.team : null,
    members: lane ? lane.members === true : false,
  } };
});
