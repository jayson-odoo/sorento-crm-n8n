// ── miss-roster-plan (miss-company-routing — PLAIN HALF ONLY) ───────────────
// One item for the MISS company on an ANSWERED turn that passed miss-roster-gate: a company the
// envelope says was queried (lookup_companies) but that contributed no answer (no
// answers[].fields[key='company_name'] naming it). miss-roster-gate has already verified the shape
// (has_result, lane domain + one of the lane's routing pairs, no competing offer on the turn, EVERY
// answer labelled with a company_name key field, EXACTLY ONE miss company) with the SAME
// derivation — keep the two in lockstep.
//
// TWO DELIBERATE NARROWINGS vs the clone body this was promoted from (Stage B set 4, piece 1):
//
//  (1) `members: false` ON EVERY LANE ROW. The members arm — get-cs-members-miss (a CRM roster
//      fetch) + miss-members-gate + build-miss-member-offer's picker rendering — is NOT on live.
//      Only the PLAIN offer ships: the frozen escalation phrase, no picker, no last_result_set
//      extension. A `members: true` row would route a turn at a node that does not exist, so the
//      flag is false everywhere and stays false until the members half is promoted with its nodes.
//      Consequence, and the reason this is written as a data flag rather than deleted code:
//      build-miss-member-offer's plain arm keys on `real.every(p => p.members === false)`, so
//      `miss_member_offer` can never be emitted and compile-current-state's Case A (the
//      `_mcBase.concat(_mcRows)` last_result_set concatenation, the one that can renumber a picker)
//      is unreachable by construction.
//
//  (2) EXACTLY ONE MISS COMPANY, or nothing. Two or more misses would persist a multi-entry
//      `routing_roster_plan`, and escalation-context turns rp.length > 1 into
//      `routing_source: 'multi_company_unpicked'` with `company_id: null`, which it hands to
//      Call 'sub-human-intervention' with NO gate — a real round-robin assign on a pool the
//      customer never picked (staff email/WhatsApp ripple). The gate that suppresses that assign
//      (clarify-company-gate) is a different Stage B set and is not on live. So multi-miss is
//      capped HERE and in miss-roster-gate (mirrored, same as the LANE table), and degrades to the
//      sentinel below.
//
// The sentinel: an empty result would starve the happy lane of its item, so both the capped
// multi-miss case and the impossible gate/plan-divergence case degrade to ONE null-company
// sentinel item (members:false — a sentinel must NEVER fetch a roster). build-miss-member-offer
// drops null-company items and passes the envelope through, leaving the turn byte-identical.
//
// Every real item carries `team` — the team the frozen phrase names and the team HI would assign
// to. `team` is stamped from the PARSER's actual suggested_team, not from a hard-coded row field,
// because a row may carry TWO routing pairs (crm_master_product_attachments_list rides
// marketing_product for photo asks and purchasing_certification for certificate asks) — a
// hard-coded team would tell a certificates ask "marketing_product team". The gate has already
// proven the parser's pair is one of the row's, so the parser value is always in-lane. Item shape
// mirrors cs-roster-plan so downstream consumers (build-miss-member-offer, the ccs persistence
// hunk, escalation-context) treat the two plans identically; brand_code is looked up from
// disallowed-entity-gate's routing_companies entry for the company (null when absent).
const env = $('central-exchange').first().json;
  const LANE = {  // tool ⇒ parser domain + the routing PAIR(S) it may ride (offer phrase and HI team in lockstep) + members (FALSE on every row — see narrowing (1) above; the members half is not on live). LANE == the CRM's stamp_lookup_companies set (11/11), so "all domains" is closed by construction, not by enumeration luck. MIRRORED BYTE-IDENTICAL in miss-roster-gate and miss-roster-plan — edit both together.
    'crm_order_management_orders_list':            { domain: 'order',              pairs: [['customer_service', 'order_enquiries']],                                                        members: false },
    'crm_order_management_orders_by_product_list': { domain: 'order',              pairs: [['customer_service', 'order_enquiries']],                                                        members: false },
    'crm_incoming_stock_list':                     { domain: 'incoming',           pairs: [['purchasing', 'incoming_stock_enquiries']],                                                     members: false },
    'crm_incoming_stock_by_product':               { domain: 'incoming',           pairs: [['purchasing', 'incoming_stock_enquiries']],                                                     members: false },
    'crm_incoming_stock_shipments':                { domain: 'incoming',           pairs: [['purchasing', 'incoming_stock_enquiries']],                                                     members: false },
    'crm_inventory_stock_balance_list':            { domain: 'inventory',          pairs: [['warehouse', 'general_enquiries']],                                                             members: false },
    'crm_marketing_promotions_list':               { domain: 'promotion',          pairs: [['marketing_promotion', 'general_enquiries']],                                                   members: false },
    'crm_marketing_promotion_products_list':       { domain: 'promotion',          pairs: [['marketing_promotion', 'general_enquiries']],                                                   members: false },
    'crm_master_products_list':                    { domain: 'master_products',    pairs: [['purchasing_product', 'general_enquiries']],                                                    members: false },
    'crm_master_product_attachments_list':         { domain: 'product_attachment', pairs: [['marketing_product', 'general_enquiries'], ['purchasing_certification', 'general_enquiries']],   members: false },
    'crm_certificates_list':                       { domain: 'product_attachment', pairs: [['purchasing_certification', 'general_enquiries']],                                              members: false },
  };
// WRAPPED, like every other upstream read in this node. `tool-filter` runs on every answered turn,
// but a Code node that throws takes the WHOLE turn down (no onError on this node), and this is the
// one read that had no fallback. Unreadable tool ⇒ lane null ⇒ members:false, team:null, which is
// the same fail-closed shape an off-LANE tool already produces.
const tool = (() => { try { return String((($('tool-filter').first().json) || {}).name || '').trim(); } catch (e) { return ''; } })();
const lane = (tool && Object.keys(LANE).includes(tool)) ? LANE[tool] : null;  // fail-closed: unknown lane ⇒ members:false, team:null (plain path, never a roster fetch)
// The phrase/HI team comes from the parser, which the gate proved is one of the lane's pairs.
// Fail-closed: unreadable routing ⇒ null ⇒ ccs's _mcTeamP falls back to the parser's own
// suggested_team (same value) and, failing that, 'customer_service'.
const _team = (() => { try { const o = $("Call 'sub-query-reformulator'").first().json.output || {}; return String(((o.routing) || {}).suggested_team || '').trim() || null; } catch (e) { return null; } })();
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
// SINGLE-MISS CAP (narrowing (2)) + gate/plan divergence sentinel — see header.
// build-miss-member-offer drops null-company items, so both degrade to an untouched turn.
if (miss.length !== 1) {
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
    multi_company: false,
    companies: miss.map(x => x.name).filter(Boolean),
    team: lane ? _team : null,
    members: lane ? lane.members === true : false,
  } };
});
