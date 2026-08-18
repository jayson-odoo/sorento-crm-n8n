#!/usr/bin/env node
/* miss-company-routing rev-4 — runs the DEPLOYED spine bodies (byte-exact repo copies) with n8n globals
 * stubbed: escalation-context (offered-pool + code/alias resolver), clarify-company-reply / offer-hold-reply
 * (shared body, rev-4 copy), escalate-catalog (offer_hold case), offer-hold-gate (If leftValue) and
 * compile-current-state arm B (state re-persist on the offer-hold path).
 * Usage: node miss-company-routing-rev4.spine.test.js [diffs-dir]
 */
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || path.join(__dirname, '..', 'diffs', 'miss-company-routing');
const body = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const MOCHA = { company_id: '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2', company_name: 'Mocha', brand_code: null };
const SORENTO = { company_id: '00000000-0000-0000-0000-000000000001', company_name: 'Sorento', brand_code: 'mocha' };
const ROWS = [
  { idx: 1, label: 'Ms Bay', uuid: 'u-bay', respond_user_id: 'r1', company_id: MOCHA.company_id, company_name: 'Mocha', brand_code: null },
  { idx: 2, label: 'Maryam Ariffin', uuid: 'u-maryam', respond_user_id: 'r2', company_id: SORENTO.company_id, company_name: 'Sorento', brand_code: 'mocha' },
];
const PHRASE = "But no order matched — checked in Mocha and Sorento. Would you like me to escalate to customer_service team?";
const MULTI = {
  selection_context: 'member_offer', response: PHRASE, routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
  last_result_set: ROWS, routing_roster_plan: [{ plan_idx: 0, ...MOCHA }, { plan_idx: 1, ...SORENTO }],
  routing_companies: [{ ...MOCHA, codes: ['MUB6201'] }, { ...SORENTO, codes: ['MUB6201'] }], routing_company: null, routing_brand: 'mocha',
};
const SINGLE_PLAN = { ...MULTI, last_result_set: [ROWS[1]], routing_roster_plan: [{ plan_idx: 0, ...SORENTO }], routing_company: SORENTO.company_id };
const NO_PLAN = { ...MULTI, selection_context: null, last_result_set: [], routing_roster_plan: [] };

let fails = 0, passes = 0;
const check = (name, cond, got) => { if (!cond) { fails++; console.error(`FAIL ${name}: ${JSON.stringify(got)}`); } else { passes++; console.log(`ok   ${name}`); } };

// ── escalation-context ──
function escCtx(parserOut, prev, item) {
  const nodes = { "Call 'sub-query-reformulator'": { output: parserOut }, 'get-session-vars': { session_vars: { variables: prev } } };
  const $ = (n) => ({ first: () => ({ json: nodes[n] || {} }), isExecuted: n in nodes });
  const res = new Function('$', '$input', body('spine-escalation-context.js'))($, { first: () => ({ json: item || { x: 1 } }) });
  return res[0].json;
}
const conf = (pick) => ({ routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }, escalation: { is_escalation_confirmation: true, company_pick: pick } });
let r = escCtx(conf('Sorento'), MULTI);
check('esc-ctx: company_pick Sorento → Sorento row verbatim, source company_pick', r.routing_source === 'company_pick' && r.company_id === SORENTO.company_id && r.brand_code === 'mocha', r);
r = escCtx(conf('srt'), MULTI);
check('esc-ctx: company_pick "srt" (alias, defensive) → Sorento', r.routing_source === 'company_pick' && r.company_id === SORENTO.company_id, r);
r = escCtx(conf('MCH'), MULTI);
check('esc-ctx: company_pick "MCH" → Mocha', r.routing_source === 'company_pick' && r.company_id === MOCHA.company_id && r.brand_code === null, r);
r = escCtx(conf('Mocha'), SINGLE_PLAN);
check('esc-ctx (A): pick Mocha on a Sorento-only plan → NOT resolved (falls to prior_state Sorento)', r.routing_source !== 'company_pick' && r.company_id === SORENTO.company_id && r.routing_source === 'prior_state', r);
r = escCtx(conf('Mocha'), NO_PLAN);
check('esc-ctx (A): no plan → routing_companies pool → Mocha resolves', r.routing_source === 'company_pick' && r.company_id === MOCHA.company_id, r);
r = escCtx(conf(null), MULTI);
check('esc-ctx: bare confirm on multi → multi_company_unpicked (unchanged)', r.routing_source === 'multi_company_unpicked', r);
r = escCtx(conf('Cabana'), MULTI);
check('esc-ctx: pick outside pool → unchanged behaviour (multi_company_unpicked)', r.routing_source === 'multi_company_unpicked', r);
r = escCtx({ routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }, escalation: { is_escalation_confirmation: true, preferred_assignee_id: 'u-maryam', company_pick: 'Mocha' } }, MULTI);
check('esc-ctx: picked member outranks company_pick', r.routing_source === 'picked_member' && r.company_id === SORENTO.company_id, r);

// ── clarify-company-reply / offer-hold-reply (shared body) ──
function clarify(prev) {
  const $ = (n) => ({ first: () => ({ json: n === 'get-session-vars' ? { session_vars: { variables: prev } } : {} }), isExecuted: true });
  return new Function('$', '$input', body('spine-clarify-company-reply.js'))($, { first: () => ({ json: { routing_source: 'multi_company_unpicked' } }) })[0].json;
}
r = clarify(MULTI);
check('clarify copy (rev-4): bold lead names + "or the company (Mocha / Sorento)"', r.clarify_text === "Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company (Mocha / Sorento) and I'll assign automatically." && r.clarify_company === true, r.clarify_text);
r = clarify({ ...MULTI, routing_roster_plan: [{ ...MOCHA }, { ...SORENTO }, { company_id: 'c3', company_name: 'Cabana' }] });
check('clarify copy: 3 companies generalises', /^\*Mocha\*, \*Sorento\* and \*Cabana\* teams are listed — reply a number, a name, or the company \(Mocha \/ Sorento \/ Cabana\)/.test(r.clarify_text), r.clarify_text);
r = clarify({ ...MULTI, routing_roster_plan: [], routing_companies: [] });
check('clarify copy: no names degrades', /^More than one team is listed — reply a number, a name, or the company \(the companies listed\)/.test(r.clarify_text), r.clarify_text);

// ── escalate-catalog offer_hold ──
function catalog(kind, holdJson) {
  const nodes = { "Call 'sub-query-reformulator'": { output: { routing: { suggested_team: 'customer_service' }, user_goal: 'x' } }, 'offer-hold-reply': holdJson };
  const $ = (n) => ({ first: () => ({ json: nodes[n] || {} }), isExecuted: n in nodes && nodes[n] != null });
  return new Function('$', '$input', body('spine-escalate-catalog.js'))($, { first: () => ({ json: { branch_kind: kind } }) });
}
r = catalog('offer_hold', { clarify_text: 'CLARIFY' });
check('catalog offer_hold → clarify text by reference, manual, no roster offer', r.response === 'CLARIFY' && r.manualResponse === true && r.includeResponse === true && r.is_escalate_offer === false, r);
r = catalog('offer_hold', null);
check('catalog offer_hold with no upstream node → empty response, still manual (fail-safe; ccs arm B never fires)', r.response === '' && r.manualResponse === true, r);
r = catalog('escalation_declined', null);
check('catalog escalation_declined unchanged', r.response === 'Escalation declined.' && r.is_escalate_offer === false, r);
r = catalog('escalate_offer', null);
check('catalog escalate_offer unchanged', /Would you like me to escalate to customer_service team\?$/.test(r.response) && r.is_escalate_offer === true, r);

// ── offer-hold-gate leftValue ──
const gateSrc = fs.readFileSync(path.join(DIR, 'spine-offer-hold-gate.expr.txt'), 'utf8');
check('gate file: no trailing newline, starts with ={{', gateSrc.startsWith('={{ ') && gateSrc.endsWith(' }}'), gateSrc.slice(-10));
const gateInner = gateSrc.slice(4, -3);
function gate(parserOut, prev) {
  const nodes = { "Call 'sub-query-reformulator'": { output: parserOut }, 'get-session-vars': { session_vars: { variables: prev } } };
  const $ = (n) => ({ first: () => ({ json: nodes[n] || {} }) });
  return new Function('$', 'return (' + gateInner + ')')($);
}
const HOLD = { member_pick_context: true, escalation: { is_escalation_confirmation: false, member_reprompt: 'out_of_range', offer_hold: true } };
check('gate: hold on multi → true', gate(HOLD, MULTI) === true);
check('gate: legacy reprompt (no offer_hold key) on multi → true', gate({ member_pick_context: true, escalation: { is_escalation_confirmation: false, member_reprompt: 'multi' } }, MULTI) === true);
check('gate: hold on single plan → false (If10 path unchanged)', gate(HOLD, SINGLE_PLAN) === false);
check('gate: confirmation → false', gate({ member_pick_context: true, escalation: { is_escalation_confirmation: true, company_pick: 'Sorento' } }, MULTI) === false);
check('gate: declined → false', gate({ member_pick_context: true, escalation: { is_escalation_confirmation: false, escalation_declined: true } }, MULTI) === false);
check('gate: retarget → false', gate({ member_pick_context: false, escalation: { is_escalation_confirmation: true, retarget_team: true } }, MULTI) === false);
check('gate: new query (no member_pick_context) → false', gate({ escalation: { is_escalation_confirmation: false }, domain_hint: 'promotion' }, MULTI) === false);
check('gate: no selection_context → false', gate(HOLD, NO_PLAN) === false);
check('gate: empty everything → false', gate({}, {}) === false);

// ── compile-current-state arm B on the offer-hold path ──
function ccs(parserOut, prev, holdJson, catJson) {
  const nodes = {
    "Call 'sub-query-reformulator'": { output: parserOut },
    'sorento-sub-respond-findcontact-respond': { id: 'c1', firstName: 'T' },
    'get-session-vars': { session_vars: { variables: prev } },
    'escalate-catalog': catJson,
    'offer-hold-reply': holdJson,
  };
  const $ = (n) => ({ first: () => ({ json: nodes[n] }), all: () => [{ json: nodes[n] }], isExecuted: n in nodes && nodes[n] != null });
  return new Function('$', '$input', body('spine-compile-current-state.js'))($, { first: () => ({ json: catJson || {} }), all: () => [{ json: catJson || {} }] });
}
const HOLD_OUT = { message_type: 'casual', domain_hint: null, is_affirmative: null, entities: [], routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }, escalation: { is_escalation_confirmation: false, member_reprompt: 'out_of_range', offer_hold: true }, member_pick_context: true, user_goal: 'x', access_levels: [], query_brands: [] };
const CLAR = "Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company (Mocha / Sorento) and I'll assign automatically.";
r = ccs(HOLD_OUT, MULTI, { clarify_company: true, clarify_text: CLAR }, { branch_kind: 'offer_hold', response: CLAR, manualResponse: true, includeResponse: true, is_escalate_offer: false });
check('ccs hold: user_response = clarify text', r.user_response === CLAR, r.user_response);
check('ccs hold: selection_context survives', r.variables.selection_context === 'member_offer', r.variables.selection_context);
check('ccs hold: last_result_set survives (rows)', Array.isArray(r.variables.last_result_set) && r.variables.last_result_set.length === 2 && r.variables.last_result_set[1].uuid === 'u-maryam', r.variables.last_result_set);
check('ccs hold: routing_roster_plan survives (2)', Array.isArray(r.variables.routing_roster_plan) && r.variables.routing_roster_plan.length === 2, r.variables.routing_roster_plan);
check('ccs hold: routing_companies survives', Array.isArray(r.variables.routing_companies) && r.variables.routing_companies.length === 2, r.variables.routing_companies);
check('ccs hold: frozen phrase survives in variables.response', /would you like me to escalate/i.test(r.variables.response) && r.variables.response === PHRASE, r.variables.response);
check('ccs hold: routing persisted (customer_service) so sameTeam holds next turn', r.variables.routing && r.variables.routing.suggested_team === 'customer_service', r.variables.routing);
// negative: a plain casual turn with no hold node executed must NOT re-persist (byte-identical to before)
r = ccs({ ...HOLD_OUT, escalation: { is_escalation_confirmation: false }, member_pick_context: false }, MULTI, null, { branch_kind: 'clarify_menu', response: 'menu', manualResponse: true, includeResponse: true, is_escalate_offer: false });
check('ccs no-hold catalog turn: arm B silent (selection_context not re-persisted)', r.variables.selection_context !== 'member_offer' && r.user_response === 'menu', { sc: r.variables.selection_context, ur: r.user_response });

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
