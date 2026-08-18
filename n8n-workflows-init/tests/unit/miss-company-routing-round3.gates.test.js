#!/usr/bin/env node
/* miss-company-routing round 3 — evaluates the DEPLOYED If leftValue expressions (byte-exact repo copies) with n8n
 * globals stubbed: `miss-roster-gate` (plan §R3.2 allowlist LANE + xd precedence leg; cases R3.3 (i)–(viii)) and
 * `cs-offer-gate` (D3 option (b): CS/order OR purchasing/incoming pair).
 * Usage: node miss-company-routing-round3.gates.test.js [diffs-dir]
 */
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || path.join(__dirname, '..', 'diffs', 'miss-company-routing');
const expr = (f) => {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (!s.startsWith('={{ ') || !s.endsWith(' }}')) throw new Error(`${f}: not an n8n ={{ }} expression`);
  return s.slice(4, -3);
};
const GATE = expr('spine-miss-roster-gate.expr.txt');
const CSG = expr('spine-cs-offer-gate.expr.txt');

let fails = 0, passes = 0;
const check = (name, cond, got) => { if (!cond) { fails++; console.error(`FAIL ${name}: ${JSON.stringify(got)}`); } else { passes++; console.log(`ok   ${name}`); } };

// n8n `$('node')` stub: nodes map name → json (undefined ⇒ not executed; a function ⇒ throws on access, models a
// node that never ran / a broken ref). `$json` = the gate's own input item (central-exchange envelope).
const mk = (nodes) => (n) => {
  if (!(n in nodes)) return { isExecuted: false, first: () => { throw new Error(`Referenced node "${n}" is unexecuted`); } };
  if (typeof nodes[n] === 'function') return { isExecuted: true, first: () => nodes[n]() };
  return { isExecuted: true, first: () => ({ json: nodes[n] }) };
};
const evalGate = (json, nodes) => new Function('$json', '$', 'return ' + GATE)(json, mk(nodes));
const evalCsg = (nodes) => new Function('$', 'return ' + CSG)(mk(nodes));

// ── fixtures ──
const MOCHA = { id: '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2', name: 'Mocha' };
const SORENTO = { id: '00000000-0000-0000-0000-000000000001', name: 'Sorento' };
const ans = (co, extra) => ({ fields: [{ key: 'company_name', label: 'Company', value: co }, { key: 'code', value: 'MUB6201' }], ...(extra || {}) });
// exec 12918600 shape: incoming for MUB6201 — Mocha answered, Sorento silent (miss line rendered by output-structurer)
const INCOMING_ENV = { has_result: true, lookup_companies: [MOCHA, SORENTO], answers: [ans('Mocha')], response: '… *Sorento:* no incoming stock records for MUB6201.', _xd: { active: false, team: 'purchasing', missing: [] } };
// M1 orders shape (round 2, exec 12901422): orders for MUB6201 — Mocha answered, Sorento silent
const ORDERS_ENV = { has_result: true, lookup_companies: [MOCHA, SORENTO], answers: [ans('Mocha')], response: '… *Sorento:* no orders records for MUB6201.' };
const parser = (domain, team, agent) => ({ output: { domain_hint: domain, routing: { suggested_team: team, suggested_agent: agent } } });
const INC = parser('incoming', 'purchasing', 'incoming_stock_enquiries');
const ORD = parser('order', 'customer_service', 'order_enquiries');
const XD_NONE = { _xdBlock: { block: '', any: false } };
const XD_ANY = { _xdBlock: { block: '*Sorento* (warehouse): 0 …', any: true, team: 'warehouse' } };
const base = (tool, p, xd) => ({ 'tool-filter': { name: tool, similarity: 0.9 }, "Call 'sub-query-reformulator'": p, ...(xd === undefined ? {} : { 'crossdomain-render': xd }) });

// ── miss-roster-gate: R3.3 (i)–(viii) ──
check('(i) incoming envelope (12918600) + incoming routing + tool crm_incoming_stock_list ⇒ TRUE', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', INC, XD_NONE)) === true);
check('(i-b) crm_incoming_stock_by_product ⇒ TRUE', evalGate(INCOMING_ENV, base('crm_incoming_stock_by_product', INC, XD_NONE)) === true);
check('(i-c) crm_incoming_stock_shipments ⇒ TRUE', evalGate(INCOMING_ENV, base('crm_incoming_stock_shipments', INC, XD_NONE)) === true);
check('(i-d) crossdomain-render not executed on the turn ⇒ TRUE (leg only yields when the node ran)', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', INC)) === true);
check('(ii) same with _xdBlock.any:true ⇒ FALSE (crossdomain-compose owns the offer)', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', INC, XD_ANY)) === false);
check('(ii-b) crossdomain-render ran but emitted no _xdBlock ⇒ TRUE (any !== true)', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', INC, { other: 1 })) === true);
check('(iii) tool crm_inventory_stock_balance_list / domain inventory / warehouse routing ⇒ FALSE', evalGate({ ...INCOMING_ENV, response: '*Sorento:* no stock records' }, base('crm_inventory_stock_balance_list', parser('inventory', 'warehouse', 'general_enquiries'), XD_NONE)) === false);
check('(iv) promotions tool ⇒ FALSE', evalGate(INCOMING_ENV, base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'), XD_NONE)) === false);
check('(iv-b) master products / product attachments / certificates tools ⇒ FALSE', ['crm_master_products_list', 'crm_master_product_attachments_list', 'crm_certificates_list'].every(t => evalGate(INCOMING_ENV, base(t, parser('master_products', 'purchasing_product', 'general_enquiries'), XD_NONE)) === false));
check('(v) incoming tool but routing customer_service/order_enquiries ⇒ FALSE (retarget → no picker for the wrong pool)', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', parser('incoming', 'customer_service', 'order_enquiries'), XD_NONE)) === false);
check('(v-b) incoming tool, purchasing team but wrong agent ⇒ FALSE', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', parser('incoming', 'purchasing', 'general_enquiries'), XD_NONE)) === false);
check('(v-c) incoming tool but domain_hint order ⇒ FALSE (domain leg pins the lane)', evalGate(INCOMING_ENV, base('crm_incoming_stock_list', parser('order', 'purchasing', 'incoming_stock_enquiries'), XD_NONE)) === false);
check('(v-d) orders tool with incoming routing ⇒ FALSE', evalGate(ORDERS_ENV, base('crm_order_management_orders_list', parser('order', 'purchasing', 'incoming_stock_enquiries'), XD_NONE)) === false);
check('(vi) M1 orders envelope + CS/order routing + crm_order_management_orders_list ⇒ TRUE (unchanged)', evalGate(ORDERS_ENV, base('crm_order_management_orders_list', ORD, XD_NONE)) === true);
check('(vi-b) crm_order_management_orders_by_product_list ⇒ TRUE', evalGate(ORDERS_ENV, base('crm_order_management_orders_by_product_list', ORD, XD_NONE)) === true);
check('(vi-c) orders envelope, crossdomain-render never ran (orders lane, live shape) ⇒ TRUE', evalGate(ORDERS_ENV, base('crm_order_management_orders_list', ORD)) === true);
check('(vii-a) tool-filter not executed ⇒ FALSE', evalGate(INCOMING_ENV, { "Call 'sub-query-reformulator'": INC, 'crossdomain-render': XD_NONE }) === false);
check('(vii-b) tool-filter throws ⇒ FALSE', evalGate(INCOMING_ENV, { 'tool-filter': () => { throw new Error('boom'); }, "Call 'sub-query-reformulator'": INC }) === false);
check('(vii-c) tool-filter json null / name missing / non-allowlisted ⇒ FALSE', [null, {}, { name: '' }, { name: 'crm_resource_attachments_list' }, { name: 'CRM_INCOMING_STOCK_LIST' }, { name: 'toString' }, { name: 'hasOwnProperty' }].every(tf => evalGate(INCOMING_ENV, { 'tool-filter': tf, "Call 'sub-query-reformulator'": INC }) === false));
check('(vii-d) tool name with surrounding whitespace is trimmed ⇒ TRUE', evalGate(INCOMING_ENV, base(' crm_incoming_stock_list ', INC)) === true);
check('(vii-e) parser node not executed ⇒ FALSE', evalGate(INCOMING_ENV, { 'tool-filter': { name: 'crm_incoming_stock_list' } }) === false);
check('(viii) miss set empty (both companies answered) ⇒ FALSE', evalGate({ ...INCOMING_ENV, answers: [ans('Mocha'), ans('Sorento')] }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('(viii-b) miss set empty via case/whitespace ("sorento ") ⇒ FALSE', evalGate({ ...INCOMING_ENV, answers: [ans('Mocha'), ans('sorento ')] }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('(viii-c) single-company lookup (no lookup_companies) ⇒ FALSE', evalGate({ ...INCOMING_ENV, lookup_companies: undefined }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('(viii-d) has_result false (not-found path) ⇒ FALSE', evalGate({ ...INCOMING_ENV, has_result: false }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('(viii-e) an answer without company_name field ⇒ FALSE (presenter shape not in play)', evalGate({ ...INCOMING_ENV, answers: [ans('Mocha'), { fields: [{ key: 'code', value: 'X' }] }] }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('(viii-f) empty answers ⇒ FALSE', evalGate({ ...INCOMING_ENV, answers: [] }, base('crm_incoming_stock_list', INC, XD_NONE)) === false);
check('($json null-ish) $json without fields ⇒ FALSE, never throws', evalGate({}, base('crm_incoming_stock_list', INC, XD_NONE)) === false);

// ── cs-offer-gate (g2 leftValue; g1 is_escalate_offer is a separate byte-identical condition ANDed by the node) ──
const csg = (team, agent) => evalCsg({ "Call 'sub-query-reformulator'": parser('x', team, agent) });
check('cs-offer-gate: customer_service/order_enquiries ⇒ TRUE (orders, unchanged)', csg('customer_service', 'order_enquiries') === true);
check('cs-offer-gate: purchasing/incoming_stock_enquiries ⇒ TRUE (incoming, new)', csg('purchasing', 'incoming_stock_enquiries') === true);
check('cs-offer-gate: marketing_promotion/general_enquiries ⇒ FALSE', csg('marketing_promotion', 'general_enquiries') === false);
check('cs-offer-gate: warehouse/general_enquiries ⇒ FALSE', csg('warehouse', 'general_enquiries') === false);
check('cs-offer-gate: purchasing/general_enquiries ⇒ FALSE (pair, not team alone)', csg('purchasing', 'general_enquiries') === false);
check('cs-offer-gate: customer_service/incoming_stock_enquiries ⇒ FALSE (cross pair)', csg('customer_service', 'incoming_stock_enquiries') === false);
check('cs-offer-gate: routing null ⇒ FALSE (fail-closed; the old g2 leftValue would have thrown)', evalCsg({ "Call 'sub-query-reformulator'": { output: { routing: null } } }) === false);
check('cs-offer-gate: parser node not executed ⇒ FALSE', evalCsg({}) === false);
// g1 semantics (node-level AND) — modelled: is_escalate_offer false ⇒ node false regardless of g2
const nodeAnd = (isOffer, team, agent) => (isOffer === true) && csg(team, agent);
check('cs-offer-gate node: is_escalate_offer false + incoming pair ⇒ FALSE', nodeAnd(false, 'purchasing', 'incoming_stock_enquiries') === false);
check('cs-offer-gate node: is_escalate_offer true + incoming pair ⇒ TRUE', nodeAnd(true, 'purchasing', 'incoming_stock_enquiries') === true);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
