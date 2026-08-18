// ── build-cs-member-offer (Δ3) ──────────────────────────────────
// Runs only when the cs-offer-gate passed (is_escalate_offer + customer_service + order_enquiries).
// Turns the live team-members roster into a numbered escalation offer, and stores the roster as
// cs_last_result_set + selection_context so the NEXT turn's position pick resolves to a member.
// Empty roster → fall back to the catalog's generic offer (round-robin on a bare "yes").
// get-cs-members returns a JSON array; n8n may emit it as one item (json=array) OR split into
// one item per element — handle both, then keep only real members.
let _raw = $('get-cs-members').all().map(i => i.json);
let members = (_raw.length === 1 && Array.isArray(_raw[0])) ? _raw[0] : _raw;
// exclude members with no respond_user_id — respond.io conversation-assign can't reach them
members = (Array.isArray(members) ? members : []).filter(m => m && m.user_id && m.respond_user_id);
const cat = $('escalate-catalog').first().json;
const out = { ...cat };

if (members.length === 0) {
  out.selection_context = null;
  out.member_offer = false;
  out.cs_last_result_set = [];
  return out;
}

const numbered = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
// Preserve the not-found preamble from the catalog ("Could not find X for Y. Would you like me to escalate...?")
// then append the member picker — do NOT discard cat.response.
out.response =
  `${cat.response || 'Would you like me to escalate to customer_service team?'}\n\n` +
  `Please choose who to route to (reply with the number):\n${numbered}\n\n` +
  `If you have no preference, just reply 'yes' and we'll assign automatically.`;
out.member_offer = true;
out.selection_context = 'member_offer';
out.cs_last_result_set = members.map((m, i) => ({
  idx: i + 1, label: m.name, uuid: m.user_id, respond_user_id: m.respond_user_id,
}));
out.manualResponse = true;     // member offer is a manual response (skip business-summary overwrite)
out.includeResponse = true;
return out;