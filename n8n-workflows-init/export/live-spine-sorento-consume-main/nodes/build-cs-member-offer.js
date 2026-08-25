// ── build-cs-member-offer (Δ3 + brand-company-routing) ──────────────────────
// Runs only when the cs-offer-gate passed (is_escalate_offer + customer_service + order_enquiries).
// Turns the live team-members roster(s) into a numbered escalation offer, and stores the roster as
// cs_last_result_set + selection_context so the NEXT turn's position pick resolves to a member.
// Empty roster → fall back to the catalog's generic offer (round-robin on a bare "yes").
// brand-company-routing: cs-roster-plan emits ONE item per company; get-cs-members runs once per
// item with fullResponse=true, so response i ↔ plan i by index. Multi-company ⇒ union of rosters,
// every member listed plain (`n. Name`) under a bold `*Company:*` group header (captain 2026-08-24:
// no explanatory note - the grouped list already shows this on its own).
// Single company ⇒ text byte-identical to the pre-change shape, except (miss-company-routing rev-3)
// the escalate phrase names the company: `…escalate to *Sorento* customer service team?`.
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
  // miss-company-routing rev-3 (captain copy decisions): the group header carries the company — bold,
  // presenter style `*Company:*` — and the member lines are plain `n. Name` (no per-member suffix).
  // A shared member (rev-6) keeps ONE number and appears under each group it belongs to.
  const _printed = new Set();
  for (const p of planItems) {
    const group = members.map((m, i) => ({ m, n: i + 1 })).filter(x => inCo(x.m, p));
    if (!group.length) { if (p.company_name) empty.push(p.company_name); continue; }
    lines.push(`*${p.company_name || 'Other'}:*`);
    for (const g of group) { lines.push(`${g.n}. ${g.m.name}`); _printed.add(g.n); }
  }
  // EVERY ROW PRINTS. A member row placed under no header would vanish from the printed list while
  // KEEPING its number in cs_last_result_set — the customer is invited to pick a number they were
  // never shown (the exact row-drop defect compile-current-state's Δ4 renderer documents from the
  // reverted rev-3 bundle). Unreachable today BY CONSTRUCTION — every members row's company_ids[0]
  // is the plan item that contributed it, so inCo(m, its own origin p) is always true — but the
  // property is load-bearing enough to hold by code, not by inference about upstream shapes.
  members.forEach((m, i) => {
    if (_printed.has(i + 1)) return;
    const _lbl = (Array.isArray(m.companies) && m.companies.length) ? m.companies : (m.company_name ? [m.company_name] : []);
    lines.push(_lbl.length ? `${i + 1}. ${m.name} (${_lbl.join(' / ')})` : `${i + 1}. ${m.name}`);
  });
  for (const nm of empty) lines.push(`[ ${nm}: no customer-service members are configured - omitted. ]`);
  numbered = lines.join('\n');
}
// captain 2026-08-24: dropped the "Note: X is carried by more than one company (...)" sentence that
// used to sit here (cs_multi_note). It was annoying, and it had gone false: once the routing axis
// widened to search every company a subject is IN, not just the one the customer named (the gate's
// _NO_TOOL_ID hunk), each subject sits in exactly ONE company - it is the TURN that spans two. It
// was also the one place a customer ever saw an internal DEBTOR CODE, because `subject` printed the
// roster plan's `codes` and for a customer that is 300-D059 (exec 13687248). `codes`/`names`/
// `joinNames`/`subject` existed only to word this sentence and go with it; `cs_multi_note` is
// deleted, not just unprinted - nothing else reads it (compile-current-state's Δ4 arm now derives
// multi-company from routing_companies.length). The `Mocha:` / `Sorento:` grouped list below is
// left to explain itself.
// miss-company-routing rev-3, SINGLE-company half only: the offer names the company inside the
// escalate phrase — `Would you like me to escalate to *Sorento* customer service team?`. The parser
// contract is the PREFIX regex /would you like me to escalate/i, so the insertion after "to" is
// contract-safe; the phrase is rewritten in place inside cat.response (first occurrence,
// case-insensitive on the lead) so the visible reply and the persisted variables.response (both =
// out.response) carry the same text. Exported as cs_offer_company (null on multi / unnamed) so
// compile-current-state's Δ4 merge arm (already live, reading exactly this key) applies the SAME
// rewrite to its own phrase.
// miss-company-routing rev-3, MULTI-company half (company-pick part 3, restored 2026-08-25 — the
// "cs_multi_close is NOT ported" divergence is retired): on a MULTI-company offer a bare "yes"
// cannot assign (escalation-context clarifies on multi_company_unpicked), so the closing sentence
// asks for the COMPANY instead — a reply the live parser now honours (the deterministic
// _coCompanyPick arm, sub-semantic-parser XTODTw @ 8717de6b, resolves a company name or code/alias
// against the persisted routing_roster_plan and emits a validated escalation.company_pick).
// Written ONCE here and exported (cs_multi_close) so compile-current-state's Δ4 merge arm cannot
// drift (its `_close` falls back only when the key is absent/null — e.g. an offer persisted before
// this shipped). Names in the offer's own order, N companies supported, WhatsApp-bold to match the
// `*Company:*` group headers. Single company keeps the original yes-sentence byte-for-byte
// (cs_multi_close = null).
// DELIBERATE DIVERGENCE from the clone's rev-3 body (kept):
//   * the rewrite regex spans a MULTI-WORD team — `(?:[a-z0-9-]+ )*[a-z0-9-]+`, the exact form
//     compile-current-state already ships. The clone's `\S+ team\?` cannot cross a space, and since
//     the team display prettifier landed every multi-word team renders with spaces
//     (`customer service team`), so the clone form silently matched nothing and dropped the label.
//     Still a no-op on a string already carrying `*Company*` after "to": `*` is outside the class.
const names = planItems.map(p => p.company_name).filter(Boolean);
const boldNames = names.map(n => `*${n}*`);
const multiClose = multi
  ? `If you have no preference, reply with the company name (${boldNames.join(' / ')}) and we'll assign accordingly.`
  : null;
out.cs_multi_close = multiClose;
const offerCompany = (!multi && planItems[0] && planItems[0].company_name) ? String(planItems[0].company_name) : null;
out.cs_offer_company = offerCompany;
const nameCompany = (txt) => (offerCompany && typeof txt === 'string')
  ? txt.replace(/(would you like me to escalate to )((?:[a-z0-9-]+ )*[a-z0-9-]+ team\?)/i, (s, a, b) => `${a}*${offerCompany}* ${b}`)
  : txt;
// Preserve the not-found preamble from the catalog ("Could not find X for Y. Would you like me to escalate...?")
// then append the member picker — do NOT discard cat.response.
// The multi and single arms are the SAME text apart from `numbered` (grouped-with-headers vs flat,
// built above), the single-arm company rewrite — nameCompany is a no-op when offerCompany is
// null, i.e. on every multi turn — and the closing sentence (multiClose on multi, the original
// yes-sentence on single), so this stays written once rather than as a ternary.
// The fallback literal names the team the way the rest of the copy now does: spaces, not the
// internal slug (captain 2026-08-24 - live was emitting `marketing_promotion_sorento team` at a
// customer). Prefix `Would you like me to escalate` is byte-identical, so the parser contract holds.
out.response = `${nameCompany(cat.response || 'Would you like me to escalate to customer service team?')}\n\n` +
  `Please choose who to route to (reply with the number):\n${numbered}\n\n` +
  `${multiClose || `If you have no preference, just reply 'yes' and we'll assign automatically.`}`;
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
