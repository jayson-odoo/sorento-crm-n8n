#!/usr/bin/env node
/* miss-company-routing rev-4 — runs the DEPLOYED parser-fork `output_exchange` body (byte-exact repo copy)
 * with n8n globals stubbed, on the captain-console repro states (both-miss MUB6201 offer: Mocha + Sorento
 * rosters; partial-miss offer: Sorento roster only). Asserts the company-pick tiers (codes / aliases /
 * request_for_help shape / longer replies), the offer_hold emission on unresolved multi-pool replies,
 * decline + new-query clearing, and the LESSON 39 bounds.
 * Usage: node miss-company-routing-rev4.output_exchange.test.js [path-to-output_exchange.js]
 */
const fs = require('fs');
const path = require('path');
const BODY = process.argv[2] || path.join(__dirname, '..', 'diffs', 'miss-company-routing', 'parser-fork-output_exchange.js');
const src = fs.readFileSync(BODY, 'utf8');

const ROW = (idx, label, uuid, company_name, company_id, brand_code) => ({ idx, label, uuid, respond_user_id: 'r' + idx, company_id, company_name, brand_code, company_ids: [company_id], companies: [company_name] });
const MOCHA = { company_id: '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2', company_name: 'Mocha', brand_code: null };
const SORENTO = { company_id: '00000000-0000-0000-0000-000000000001', company_name: 'Sorento', brand_code: 'mocha' };
const BOTH_STATE = {
  selection_context: 'member_offer',
  response: "Here's what you want:\n• product: MUB6201 (Mocha), MUB6201 (Sorento)\n\nBut no order matched — checked in Mocha and Sorento. Would you like me to escalate to customer_service team?",
  routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
  entities: [{ raw: 'MUB6201', hint: 'product', confident: true, canonical_code: 'MUB6201', current_message: true }],
  last_result_set: [ROW(1, 'Ms Bay', 'u-bay', 'Mocha', MOCHA.company_id, null), ROW(2, 'Nicky', 'u-nicky', 'Mocha', MOCHA.company_id, null), ROW(3, 'Maryam Ariffin', 'u-maryam', 'Sorento', SORENTO.company_id, 'mocha'), ROW(4, 'Cyndi', 'u-cyndi', 'Sorento', SORENTO.company_id, 'mocha')],
  routing_roster_plan: [{ plan_idx: 0, ...MOCHA }, { plan_idx: 1, ...SORENTO }],
  routing_companies: [{ ...MOCHA, codes: ['MUB6201'] }, { ...SORENTO, codes: ['MUB6201'] }],
  routing_company: null, routing_brand: 'mocha',
};
const SORENTO_ONLY_STATE = {   // partial miss: Mocha answered, Sorento's roster offered (rows 3-4)
  ...BOTH_STATE,
  last_result_set: [ROW(3, 'Maryam Ariffin', 'u-maryam', 'Sorento', SORENTO.company_id, 'mocha'), ROW(4, 'Cyndi', 'u-cyndi', 'Sorento', SORENTO.company_id, 'mocha')],
  routing_roster_plan: [{ plan_idx: 0, ...SORENTO }],
  routing_company: SORENTO.company_id, routing_brand: 'mocha',
};
const NO_CTX_STATE = { ...BOTH_STATE, selection_context: null, last_result_set: [] };   // multi offer, rosters empty (no member context)

function llm(over) {
  return Object.assign({
    message_type: 'casual', intent_hint: null, domain_hint: null, scope_intent: null, is_affirmative: null,
    user_goal: 'x', access_levels: [], date_mode: null, date_filter_start: null, date_filter_end: null, match_mode: 'and',
    demand_qty: null, entities: [], entity_op: 'reuse', scope_exclusive: false, requested_attributes: [], contains_flyer: false,
    reference_positions: [], reference_target: null, person_mention: null, is_active: null, order_status: null, correction: false,
    routing: { suggested_team: null, suggested_agent: null }, escalation: { is_escalation_confirmation: false, company_pick: null },
  }, over || {});
}

function run(message, llmOut, state) {
  const parent = { latest_user_message: message, previous_conversation_state: state, contact_id: 'c1' };
  const $ = (name) => ({ first: () => ({ json: name === 'When Executed by Another Workflow' ? parent : {} }), isExecuted: true, all: () => [] });
  const $json = { output: { output: JSON.parse(JSON.stringify(llmOut)) } };
  const fn = new Function('$', '$json', '$input', src);
  const res = fn($, $json, { first: () => ({ json: $json }), all: () => [{ json: $json }] });
  const item = Array.isArray(res) ? res[0] : res;
  return (item && item.json) ? item.json.output : item.output;
}

let fails = 0, passes = 0;
const check = (name, cond, got) => { if (!cond) { fails++; console.error(`FAIL ${name}: ${JSON.stringify(got)}`); } else { passes++; console.log(`ok   ${name}`); } };
const esc = (o) => o.escalation || {};
const isPick = (o, company) => esc(o).is_escalation_confirmation === true && esc(o).company_pick === company && !esc(o).preferred_assignee_id;
const isHold = (o) => esc(o).is_escalation_confirmation !== true && esc(o).offer_hold === true && typeof esc(o).member_reprompt === 'string' && o.member_pick_context === true && o.correction !== true;

// ── captain transcript (both-miss offer) ──
let o = run('yes please escalate to srt team', llm({ message_type: 'request_for_help', is_affirmative: true, user_goal: 'trying to escalate to the SRT team' }), BOTH_STATE);
check('M8a "yes please escalate to srt team" → Sorento pick (code, 6-word reply)', isPick(o, 'Sorento'), esc(o));
o = run('srt', llm({ message_type: 'casual', correction: true }), BOTH_STATE);
check('M8b "srt" → Sorento pick (code)', isPick(o, 'Sorento'), esc(o));
o = run('please escalate to sorento team', llm({ message_type: 'request_for_help', is_affirmative: null }), BOTH_STATE);
check('M8c "please escalate to sorento team" (request_for_help, not affirmative) → Sorento pick', isPick(o, 'Sorento'), esc(o));
o = run('sorento pls', llm({ message_type: 'casual' }), BOTH_STATE);
check('"sorento pls" → Sorento pick', isPick(o, 'Sorento'), esc(o));
o = run('route to mch', llm({ message_type: 'request_for_help' }), BOTH_STATE);
check('"route to mch" → Mocha pick (alias)', isPick(o, 'Mocha'), esc(o));
o = run('MCH', llm({ message_type: 'casual' }), BOTH_STATE);
check('"MCH" → Mocha pick (case-insensitive alias)', isPick(o, 'Mocha'), esc(o));
o = run('can you route this to the sorento team please', llm({ message_type: 'request_for_help' }), BOTH_STATE);
check('8-word request naming sorento → Sorento pick (kept ≤6)', isPick(o, 'Sorento'), esc(o));
o = run('yes please escalate to mcha team', llm({ message_type: 'request_for_help', is_affirmative: true, escalation: { is_escalation_confirmation: true, company_pick: 'Mocha' } }), BOTH_STATE);
check('typo "mcha" + LLM company_pick Mocha → Mocha pick (validated LLM tier)', isPick(o, 'Mocha'), esc(o));
o = run('yes please escalate to mcha team', llm({ message_type: 'request_for_help', is_affirmative: true, escalation: { is_escalation_confirmation: true, company_pick: 'SRT' } }), BOTH_STATE);
check('LLM company_pick "SRT" (code) canonicalises to Sorento', isPick(o, 'Sorento'), esc(o));

// ── unresolved on a MULTI pool → offer_hold (no correction, no drop) ──
o = run('asdkjh', llm({ message_type: 'casual', correction: true }), BOTH_STATE);
check('M8d junk "asdkjh" on multi pool → offer_hold, not confirmed', isHold(o), esc(o));
o = run('hello there', llm({ message_type: 'casual' }), BOTH_STATE);
check('casual "hello there" on multi pool → offer_hold', isHold(o), esc(o));
o = run('9', llm({ message_type: 'casual' }), BOTH_STATE);
check('out-of-range number "9" (4 rows) on multi pool → offer_hold', isHold(o) && esc(o).member_reprompt === 'out_of_range', esc(o));
o = run('mocha and sorento', llm({ message_type: 'casual' }), BOTH_STATE);
check('"mocha and sorento" (both) → ambiguous → offer_hold', isHold(o), esc(o));
o = run('mr lee please', llm({ message_type: 'casual', person_mention: 'lee' }), BOTH_STATE);
check('unknown person "mr lee" on multi pool → offer_hold (out_of_range)', isHold(o) && esc(o).member_reprompt === 'out_of_range', esc(o));
// state survives is a SPINE property (offer-hold-gate + ccs arm B); the parser must simply not clear it:
check('offer_hold turn does not clear selection_context/last_result_set on the parser output', o.selection_context !== null && !(Array.isArray(o.last_result_set) && o.last_result_set.length === 0 && 'last_result_set' in o), { sc: o.selection_context, lrs: o.last_result_set });

// ── decline / new query clear ──
o = run('no', llm({ message_type: 'casual', is_affirmative: false }), BOTH_STATE);
check('M8e "no" → escalation_declined (no hold, no pick)', esc(o).escalation_declined === true && !esc(o).offer_hold && !esc(o).company_pick, esc(o));
o = run("no it's okay", llm({ message_type: 'casual', is_affirmative: false }), BOTH_STATE);
check('"no it\'s okay" → escalation_declined', esc(o).escalation_declined === true, esc(o));
o = run('no not sorento', llm({ message_type: 'casual', is_affirmative: false }), BOTH_STATE);
check('"no not sorento" → negator refuses pick → declined', esc(o).escalation_declined === true && !esc(o).company_pick, esc(o));
o = run('any mocha promotions this month', llm({ message_type: 'business_query', domain_hint: 'promotion', entities: [{ raw: 'mocha', hint: 'brand', current_message: true }] }), BOTH_STATE);
check('M8f new query "any mocha promotions this month" → NOT hijacked (no company_pick, no hold)', !esc(o).company_pick && !esc(o).offer_hold && o.member_pick_context !== true, esc(o));
o = run('check stock MUB6201 sorento', llm({ message_type: 'business_query', domain_hint: 'inventory', entities: [{ raw: 'MUB6201', hint: 'product', canonical_code: 'MUB6201', current_message: true }] }), BOTH_STATE);
check('product code + company word → NOT hijacked (LESSON 39)', !esc(o).company_pick && !esc(o).offer_hold, esc(o));
o = run('check stock SRTKT72SS', llm({ message_type: 'business_query', domain_hint: 'inventory', entities: [{ raw: 'SRTKT72SS', hint: 'product', canonical_code: 'SRTKT72SS', current_message: true }] }), BOTH_STATE);
check('"SRTKT72SS" is not the srt alias (word-boundary + product-code refuse)', !esc(o).company_pick && !esc(o).offer_hold, esc(o));

// ── member picks keep outranking ──
o = run('maryam', llm({ message_type: 'casual', person_mention: 'maryam' }), BOTH_STATE);
check('"maryam" → member pick u-maryam', esc(o).preferred_assignee_id === 'u-maryam', esc(o));
o = run('2', llm({ message_type: 'casual' }), BOTH_STATE);
check('"2" → member pick u-nicky', esc(o).preferred_assignee_id === 'u-nicky', esc(o));
o = run('yes', llm({ message_type: 'confirmation', is_affirmative: true }), BOTH_STATE);
check('bare "yes" on multi → plain confirmation (spine clarifies)', esc(o).is_escalation_confirmation === true && !esc(o).company_pick, esc(o));
o = run('yes mocha', llm({ message_type: 'confirmation', is_affirmative: true }), BOTH_STATE);
check('rev-3 "yes mocha" still → Mocha pick', isPick(o, 'Mocha'), esc(o));

// ── (A) pool = OFFERED companies (plan-first) ──
o = run('yes mocha', llm({ message_type: 'confirmation', is_affirmative: true, escalation: { is_escalation_confirmation: true, company_pick: 'Mocha' } }), SORENTO_ONLY_STATE);
check('Sorento-only offer: "yes mocha" (+LLM pick Mocha) → NO Mocha pick; plain confirm → single offered pool', esc(o).is_escalation_confirmation === true && !esc(o).company_pick, esc(o));
o = run('mocha', llm({ message_type: 'casual' }), SORENTO_ONLY_STATE);
check('Sorento-only offer: bare "mocha" → no pick, single pool → reprompt (correction:true, no offer_hold)', !esc(o).company_pick && esc(o).offer_hold !== true && o.correction === true, esc(o));
o = run('srt', llm({ message_type: 'casual' }), SORENTO_ONLY_STATE);
check('Sorento-only offer: "srt" → Sorento pick', isPick(o, 'Sorento'), esc(o));

// ── open offer WITHOUT member context (rev-4 arm) ──
o = run('sorento', llm({ message_type: 'casual' }), NO_CTX_STATE);
check('no selection_context, multi plan: "sorento" → Sorento pick', isPick(o, 'Sorento'), esc(o));
o = run('mocha promotions', llm({ message_type: 'business_query', domain_hint: 'promotion' }), NO_CTX_STATE);
check('no selection_context: "mocha promotions" (domain) → untouched', !esc(o).company_pick, esc(o));
o = run('sorento', llm({ message_type: 'casual' }), { ...NO_CTX_STATE, response: 'Hi there! How can I assist you today?', routing_roster_plan: [] });
check('no offer open at all: "sorento" → untouched', !esc(o).company_pick, esc(o));
o = run('sorento', llm({ message_type: 'casual' }), { ...NO_CTX_STATE, response: 'Escalation declined.', escalation: { is_escalation_confirmation: false, escalation_declined: true } });
check('after an explicit decline (plan carried, no phrase): "sorento" → untouched (offer closed)', !esc(o).company_pick, esc(o));

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
