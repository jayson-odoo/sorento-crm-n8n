// ── build-cs-member-offer (Δ3 + brand-company-routing) ──────────────────────
// Runs only when the cs-offer-gate passed (is_escalate_offer + customer_service + order_enquiries).
// Turns the live team-members roster(s) into a numbered escalation offer, and stores the roster as
// cs_last_result_set + selection_context so the NEXT turn's position pick resolves to a member.
// Empty roster → fall back to the catalog's generic offer (round-robin on a bare "yes").
// brand-company-routing: cs-roster-plan emits ONE item per company; get-cs-members runs once per
// item with fullResponse=true, so response i ↔ plan i by index. Multi-company ⇒ union of rosters,
// every member labelled with its company, and the reply explains why the list is longer.
// Single company ⇒ text byte-identical to the pre-change shape.
const plan = (() => { try { return $('cs-roster-plan').all().map(i => i.json); } catch (e) { return []; } })();
const resp = $('get-cs-members').all().map(i => i.json);
const rosterAt = (i) => {
  const r = resp[i];
  if (!r || r.error) return [];                              // onError item ⇒ empty roster for that company
  if (Array.isArray(r.body)) return r.body;                  // fullResponse shape
  if (Array.isArray(r)) return r;                            // legacy: one item, json=array
  return [];
};
// legacy shape tolerance: no plan (should not happen) or roster split into one item per element
const planItems = plan.length ? plan : [{ plan_idx: 0, company_id: null, company_name: null, brand_code: null, codes: [], multi_company: false, companies: [] }];
const isRow = (m) => m && m.user_id && m.respond_user_id;   // exclude members with no respond_user_id — respond.io assign can't reach them
let members = [];
const seen = new Map();
if (planItems.length === 1 && resp.length > 1 && !resp.some(r => r && (Array.isArray(r.body) || Array.isArray(r) || r.error))) {
  // legacy: get-cs-members split the array into one item per member
  members = resp.filter(isRow).map(m => ({ ...m, company_id: planItems[0].company_id || null, company_name: planItems[0].company_name || null, brand_code: planItems[0].brand_code || null, companies: planItems[0].company_name ? [planItems[0].company_name] : [], company_ids: [planItems[0].company_id || null] }));
} else {
  planItems.forEach((p, i) => {
    for (const m of rosterAt(i).filter(isRow)) {
      const prev = seen.get(m.user_id);
      // dedupe by user_id across companies (first company wins the assignment axes), but MEMBERSHIP is
      // a set: the row records every company whose roster returned it, so the renderer and the persisted
      // plan both see a shared member as belonging to all of them.
      if (prev) {
        if (p.company_name && !prev.companies.includes(p.company_name)) prev.companies.push(p.company_name);
        if (!prev.company_ids.includes(p.company_id || null)) prev.company_ids.push(p.company_id || null);
        continue;
      }
      const row = { ...m, company_id: p.company_id || null, company_name: p.company_name || null, brand_code: p.brand_code || null, companies: p.company_name ? [p.company_name] : [], company_ids: [p.company_id || null] };
      seen.set(m.user_id, row);
      members.push(row);
    }
  });
}
const cat = $('escalate-catalog').first().json;
const out = { ...cat };
out.routing_companies = planItems;   // evidence/debug: the plan the roster was built from

if (members.length === 0) {
  out.selection_context = null;
  out.member_offer = false;
  out.cs_last_result_set = [];
  return out;
}

const multi = planItems.length > 1;
// Group by MEMBERSHIP, not by the single company that won the dedupe: a member both companies returned
// is listed under each of them, keeping ONE number (its index in cs_last_result_set) so replying with it
// still resolves the same uuid. A company only earns the "no customer-service members" line when its own
// roster put nobody in the offer — otherwise a company sharing all its CS staff with the first one would
// be declared empty two lines under a member labelled with its name.
const inCo = (m, p) => (Array.isArray(m.company_ids) ? m.company_ids : [m.company_id || null]).some(id => (id || null) === (p.company_id || null));
let numbered;
if (!multi) {
  numbered = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
} else {
  const lines = [];
  const empty = [];
  for (const p of planItems) {
    const group = members.map((m, i) => ({ m, n: i + 1 })).filter(x => inCo(x.m, p));
    if (!group.length) { if (p.company_name) empty.push(p.company_name); continue; }
    lines.push(`${p.company_name || 'Other'}:`);
    for (const g of group) { lines.push(`${g.n}. ${g.m.name} (${(g.m.companies && g.m.companies.length ? g.m.companies : [g.m.company_name || p.company_name || '']).join(' / ')})`); }
  }
  for (const nm of empty) lines.push(`[ ${nm}: no customer-service members are configured — omitted. ]`);
  numbered = lines.join('\n');
}
const codes = [...new Set(planItems.flatMap(p => Array.isArray(p.codes) ? p.codes : []))];
const names = planItems.map(p => p.company_name).filter(Boolean);
const joinNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '');
const subject = codes.length ? codes.join(', ') : (cat.subject || cat.entity_label || 'This item');
// Preserve the not-found preamble from the catalog ("Could not find X for Y. Would you like me to escalate...?")
// then append the member picker — do NOT discard cat.response.
out.response = multi
  ? `${cat.response || 'Would you like me to escalate to customer_service team?'}\n\n` +
    `Note: ${subject} ${codes.length > 1 ? 'are' : 'is'} carried by more than one company (${joinNames}), so I am listing the customer-service team members from each of them — that is why there are more names than usual. Please choose who to route to (reply with the number):\n${numbered}\n\n` +
    `If you have no preference, just reply 'yes' and we'll assign automatically.`
  : `${cat.response || 'Would you like me to escalate to customer_service team?'}\n\n` +
    `Please choose who to route to (reply with the number):\n${numbered}\n\n` +
    `If you have no preference, just reply 'yes' and we'll assign automatically.`;
out.member_offer = true;
out.selection_context = 'member_offer';
out.cs_last_result_set = members.map((m, i) => ({
  idx: i + 1, label: m.name, uuid: m.user_id, respond_user_id: m.respond_user_id,
  company_id: m.company_id || null, company_name: m.company_name || null, brand_code: m.brand_code || null,
  company_ids: Array.isArray(m.company_ids) ? m.company_ids : [m.company_id || null],
}));
out.manualResponse = true;     // member offer is a manual response (skip business-summary overwrite)
out.includeResponse = true;
return out;
