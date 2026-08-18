// ── build-cs-member-offer (Δ3 + brand-company-routing) ──────────────────────
// Runs only when the cs-offer-gate passed (is_escalate_offer + customer_service + order_enquiries).
// Turns the live team-members roster(s) into a numbered escalation offer, and stores the roster as
// cs_last_result_set + selection_context so the NEXT turn's position pick resolves to a member.
// Empty roster → fall back to the catalog's generic offer (round-robin on a bare "yes").
// brand-company-routing: cs-roster-plan emits ONE item per company; get-cs-members runs once per
// item with fullResponse=true, so response i ↔ plan i by index. Multi-company ⇒ union of rosters,
// every member labelled with its company, and the reply explains why the list is longer.
// Single company ⇒ text byte-identical to the pre-change shape, except (miss-company-routing rev-3) the
// escalate phrase names the company: `…escalate to *Sorento* customer_service team?`.
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
    // miss-company-routing rev-3 (captain copy decisions): the group header carries the company — bold,
    // presenter style `*Company:*` — and the member lines are plain `n. Name` (no per-member suffix).
    // A shared member (rev-6) keeps ONE number and appears under each group it belongs to.
    lines.push(`*${p.company_name || 'Other'}:*`);
    for (const g of group) { lines.push(`${g.n}. ${g.m.name}`); }
  }
  for (const nm of empty) lines.push(`[ ${nm}: no customer-service members are configured — omitted. ]`);
  numbered = lines.join('\n');
}
const codes = [...new Set(planItems.flatMap(p => Array.isArray(p.codes) ? p.codes : []))];
const names = planItems.map(p => p.company_name).filter(Boolean);
// miss-company-routing rev-3: company names are WhatsApp-bold (`*Mocha*`) wherever the multi-company
// text names them — the note and the closing sentence — matching the presenter's `*Company:*` style.
const boldNames = names.map(n => `*${n}*`);
const joinNames = boldNames.length > 1 ? `${boldNames.slice(0, -1).join(', ')} and ${boldNames[boldNames.length - 1]}` : (boldNames[0] || '');
const subject = codes.length ? codes.join(', ') : (cat.subject || cat.entity_label || 'This item');
// The multi-company explanation is written ONCE here and exported on the item: compile-current-state's
// Δ4 merge arm rebuilds its own picker and must say the same thing rather than a second wording.
// miss-company-routing round-3 rev-2 (F-R3-5): the note names the ROUTING team (cs-offer-gate now also opens the
// picker for purchasing/incoming), humanised `_`→`-`: customer_service ⇒ "customer-service" (orders text byte-identical),
// purchasing ⇒ "purchasing". Fail-closed to the old literal when the parser output is unreadable.
const teamLabel = (() => { try { const t = $('Call \'sub-query-reformulator\'').first().json.output.routing.suggested_team; return (typeof t === 'string' && t.trim()) ? t.trim().replace(/_/g, '-') : 'customer-service'; } catch (e) { return 'customer-service'; } })();
const multiNote = multi
  ? `Note: ${subject} ${codes.length > 1 ? 'are' : 'is'} carried by more than one company (${joinNames}), so I am listing the ${teamLabel} team members from each of them — that is why there are more names than usual.`
  : null;
out.cs_multi_note = multiNote;
// miss-company-routing rev-3: on a MULTI-company offer a bare "yes" cannot assign (escalation-context
// clarifies on multi_company_unpicked), so the closing sentence asks for the company instead. Written
// ONCE here and exported (cs_multi_close) so the Δ4 merge arm cannot drift; names in the offer's own
// order, N companies supported. Single company keeps the original yes-sentence byte-for-byte.
const multiClose = multi
  ? `If you have no preference, reply with the company name (${boldNames.join(' / ')}) and we'll assign accordingly.`
  : null;
out.cs_multi_close = multiClose;
// miss-company-routing rev-3: a SINGLE-company offer names the company inside the escalate phrase —
// `Would you like me to escalate to *Sorento* customer_service team?`. The parser contract is the PREFIX
// regex /would you like me to escalate/i, so the insertion after "to" is contract-safe; the phrase is
// rewritten in place inside cat.response (first occurrence, case-insensitive on the lead) so the visible
// reply and the persisted variables.response (both = out.response) carry the same text. Exported as
// cs_offer_company (null on multi / unnamed) so the Δ4 merge arm can apply the SAME rewrite to its phrase.
const offerCompany = (!multi && planItems[0] && planItems[0].company_name) ? String(planItems[0].company_name) : null;
out.cs_offer_company = offerCompany;
const nameCompany = (txt) => (offerCompany && typeof txt === 'string')
  ? txt.replace(/(would you like me to escalate to )(\S+ team\?)/i, (s, a, b) => `${a}*${offerCompany}* ${b}`)
  : txt;
// Preserve the not-found preamble from the catalog ("Could not find X for Y. Would you like me to escalate...?")
// then append the member picker — do NOT discard cat.response.
out.response = multi
  ? `${cat.response || 'Would you like me to escalate to customer_service team?'}\n\n` +
    `${multiNote} Please choose who to route to (reply with the number):\n${numbered}\n\n` +
    `${multiClose}`
  : `${nameCompany(cat.response || 'Would you like me to escalate to customer_service team?')}\n\n` +
    `Please choose who to route to (reply with the number):\n${numbered}\n\n` +
    `If you have no preference, just reply 'yes' and we'll assign automatically.`;
out.member_offer = true;
out.selection_context = 'member_offer';
out.cs_last_result_set = members.map((m, i) => ({
  idx: i + 1, label: m.name, uuid: m.user_id, respond_user_id: m.respond_user_id,
  company_id: m.company_id || null, company_name: m.company_name || null, brand_code: m.brand_code || null,
  company_ids: Array.isArray(m.company_ids) ? m.company_ids : [m.company_id || null],
  companies: Array.isArray(m.companies) ? m.companies : (m.company_name ? [m.company_name] : []),
}));
out.manualResponse = true;     // member offer is a manual response (skip business-summary overwrite)
out.includeResponse = true;
return out;
