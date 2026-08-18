#!/usr/bin/env node
/* miss-company-routing round 3 (rev-3) — evaluates the DEPLOYED bodies (byte-exact repo copies) with n8n globals
 * stubbed: `miss-roster-gate` (rev-3 §V1 LANE incl. the stock row + members flags; cases R3.3 (i)–(viii)),
 * `miss-members-gate` (NEW rev-3 If), `miss-roster-plan` (members/team stamping), `build-miss-member-offer`
 * (plain arm + members-arm regression), `compile-current-state` (plain arm), `clarify-company-reply` (copy
 * branches) and `cs-offer-gate` (rev-3: REVERTED to the round-2/live 3-condition CS/order-only shape).
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
check('(iii) rev-3: tool crm_inventory_stock_balance_list / domain inventory / warehouse routing ⇒ TRUE (stock row joined the LANE)', evalGate({ ...INCOMING_ENV, response: '*Sorento:* no stock records' }, base('crm_inventory_stock_balance_list', parser('inventory', 'warehouse', 'general_enquiries'), XD_NONE)) === true);
check('(iii-b) stock tool with purchasing routing ⇒ FALSE (lockstep leg)', evalGate(INCOMING_ENV, base('crm_inventory_stock_balance_list', parser('inventory', 'purchasing', 'incoming_stock_enquiries'), XD_NONE)) === false);
check('(iii-c) stock tool with domain incoming ⇒ FALSE (domain leg)', evalGate(INCOMING_ENV, base('crm_inventory_stock_balance_list', parser('incoming', 'warehouse', 'general_enquiries'), XD_NONE)) === false);
// (iv)/(iv-b) SUPERSEDED BY ROUND 4 (captain reversed D2/D2'): promotions ×2, master products, product
// attachments and certificates joined the LANE. The rows below keep the round-3 fixtures but assert the
// round-4 truth; the full 11-tool truth table lives in miss-company-routing-round4.gates.test.js.
check('(iv) round-4: promotions tool on its own domain+pair ⇒ TRUE (was FALSE in round 3)', evalGate(INCOMING_ENV, base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'), XD_NONE)) === true);
check('(iv-b) round-4: master products on its own domain+pair ⇒ TRUE; attachments/certificates on the WRONG domain still ⇒ FALSE', evalGate(INCOMING_ENV, base('crm_master_products_list', parser('master_products', 'purchasing_product', 'general_enquiries'), XD_NONE)) === true && ['crm_master_product_attachments_list', 'crm_certificates_list'].every(t => evalGate(INCOMING_ENV, base(t, parser('master_products', 'purchasing_product', 'general_enquiries'), XD_NONE)) === false));
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

// ── cs-offer-gate — rev-3: REVERTED to the round-2/live 3-condition shape (g1 boolean is_escalate_offer ·
// g2 string suggested_team == 'customer_service' · g3 string suggested_agent == 'order_enquiries'; conditions json
// ce99a16c). The repo expr file is g2's plain leftValue; g3 mirrors it with suggested_agent. Node = g1 && g2 && g3.
check('cs-offer-gate: repo file is the reverted live g2 (plain member expression, fafa8b77)', CSG === "$('Call \\'sub-query-reformulator\\'').first().json.output.routing.suggested_team");
const csgTeam = (team, agent) => { try { return evalCsg({ "Call 'sub-query-reformulator'": parser('x', team, agent) }); } catch (e) { return { threw: true }; } };
const nodeRevert = (isOffer, team, agent) => (isOffer === true) && csgTeam(team, agent) === 'customer_service' && agent === 'order_enquiries';
check('cs-offer-gate reverted: customer_service/order_enquiries ⇒ TRUE (orders picker kept)', nodeRevert(true, 'customer_service', 'order_enquiries') === true);
check('cs-offer-gate reverted: purchasing/incoming_stock_enquiries ⇒ FALSE (incoming not-found back to the plain phrase)', nodeRevert(true, 'purchasing', 'incoming_stock_enquiries') === false);
check('cs-offer-gate reverted: warehouse/general_enquiries ⇒ FALSE (stock not-found stays plain)', nodeRevert(true, 'warehouse', 'general_enquiries') === false);
check('cs-offer-gate reverted: customer_service/incoming_stock_enquiries ⇒ FALSE (pair, not team alone)', nodeRevert(true, 'customer_service', 'incoming_stock_enquiries') === false);
check('cs-offer-gate reverted: is_escalate_offer false + CS/order ⇒ FALSE (g1 ANDed)', nodeRevert(false, 'customer_service', 'order_enquiries') === false);

// ── round-3 rev-2 (F-R3-4): the n8n EXPRESSION sandbox forbids prototype / constructor / __proto__ member access and the
// error is NOT catchable inside the expression (LESSONS #45). Offline `new Function` cannot see it — grep every deployed
// expression file for the tokens so the 031dda83 regression cannot recur. (Code-node jsCode is a different sandbox — not scanned.)
const FORBIDDEN = /prototype|constructor|__proto__/;
for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.expr.txt')).sort()) {
  const bad = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => FORBIDDEN.test(l));
  check(`sandbox: ${f} has no prototype/constructor/__proto__ token`, bad.length === 0, bad);
}
check('sandbox: miss-roster-gate membership test is Object.keys(...).includes (rev-2 form)', /Object\.keys\(LANE\)\.includes\(tool\)/.test(GATE));

// ── round-3 rev-2 (F-R3-5): build-cs-member-offer cs_multi_note names the ROUTING team; orders/single output byte-identical
// to the PRE body (backups/…/round-3-rev2/build-cs-member-offer.jsCode.js = clone 05a83eef).
const BCMO_NEW = fs.readFileSync(path.join(DIR, 'spine-build-cs-member-offer.js'), 'utf8');
const BCMO_OLD = fs.readFileSync(path.join(__dirname, '..', 'backups', 'miss-company-routing', 'spine-txiPzSxy3Pclsz6v', 'round-3-rev2', 'build-cs-member-offer.jsCode.js'), 'utf8');
const mkAll = (nodes) => (n) => {
  if (!(n in nodes)) throw new Error(`Referenced node "${n}" is unexecuted`);
  const v = nodes[n]; const arr = Array.isArray(v) ? v : [v];
  return { all: () => arr.map(json => ({ json })), first: () => ({ json: arr[0] }) };
};
const runBcmo = (body, nodes) => new Function('$', body)(mkAll(nodes));
const CAT_ORD = { response: 'Could not find orders for MUB6201. Would you like me to escalate to customer_service team?', is_escalate_offer: true };
const CAT_INC = { response: 'Could not find incoming stock for MWC-SC08B. Would you like me to escalate to purchasing team?', is_escalate_offer: true };
const planOf = (names, codes) => names.map((n, i) => ({ plan_idx: i, company_id: `co-${n.toLowerCase()}`, company_name: n, brand_code: n.toLowerCase(), codes, multi_company: names.length > 1, companies: names }));
const roster = (...ms) => ({ body: ms.map(([id, name]) => ({ user_id: id, respond_user_id: `r-${id}`, name })) });
const nodesFor = (cat, plan, rosters, parserOut) => ({ 'escalate-catalog': cat, 'cs-roster-plan': plan, 'get-cs-members': rosters, ...(parserOut === undefined ? {} : { "Call 'sub-query-reformulator'": parserOut }) });
const multiOrd = nodesFor(CAT_ORD, planOf(['Mocha', 'Sorento'], ['MUB6201']), [roster(['u1', 'Aisyah']), roster(['u2', 'Jereen Tee'])], ORD);
const multiInc = nodesFor(CAT_INC, planOf(['Mocha', 'Sorento'], ['MWC-SC08B']), [roster(['u1', 'Lucas']), roster(['u2', 'Jereen Tee'])], INC);
const singleOrd = nodesFor(CAT_ORD, planOf(['Sorento'], ['MUB6201']), [roster(['u2', 'Jereen Tee'], ['u3', 'Cyndi'])], ORD);
const singleInc = nodesFor(CAT_INC, planOf(['Sorento'], ['MWC-SC08B']), [roster(['u2', 'Jereen Tee'])], INC);
const oOrd = runBcmo(BCMO_NEW, multiOrd), oOrdOld = runBcmo(BCMO_OLD, multiOrd);
check('F-R3-5: orders multi note still says "customer-service team members" (byte-identical to PRE body)', oOrd.cs_multi_note === oOrdOld.cs_multi_note && /listing the customer-service team members/.test(oOrd.cs_multi_note), oOrd.cs_multi_note);
check('F-R3-5: orders multi full item identical to PRE body', JSON.stringify(oOrd) === JSON.stringify(oOrdOld));
const oInc = runBcmo(BCMO_NEW, multiInc), oIncOld = runBcmo(BCMO_OLD, multiInc);
check('F-R3-5: incoming multi note says "purchasing team members"', /listing the purchasing team members/.test(oInc.cs_multi_note), oInc.cs_multi_note);
check('F-R3-5: incoming multi — ONLY the note wording differs vs PRE body', oIncOld.cs_multi_note.replace('customer-service team members', 'purchasing team members') === oInc.cs_multi_note && JSON.stringify({ ...oInc, cs_multi_note: 0, response: 0 }) === JSON.stringify({ ...oIncOld, cs_multi_note: 0, response: 0 }) && oInc.response === oIncOld.response.replace('customer-service team members', 'purchasing team members'));
check('F-R3-5: single-company orders item identical to PRE body', JSON.stringify(runBcmo(BCMO_NEW, singleOrd)) === JSON.stringify(runBcmo(BCMO_OLD, singleOrd)));
check('F-R3-5: single-company incoming item identical to PRE body (no note on single)', JSON.stringify(runBcmo(BCMO_NEW, singleInc)) === JSON.stringify(runBcmo(BCMO_OLD, singleInc)));
check('F-R3-5: parser node unexecuted ⇒ falls back to "customer-service" (never throws)', /listing the customer-service team members/.test(runBcmo(BCMO_NEW, nodesFor(CAT_ORD, planOf(['Mocha', 'Sorento'], ['MUB6201']), [roster(['u1', 'A']), roster(['u2', 'B'])])).cs_multi_note));
check('F-R3-5: routing null / empty team ⇒ "customer-service"', [{ output: { routing: null } }, { output: { routing: { suggested_team: '  ' } } }, { output: {} }].every(po => /listing the customer-service team members/.test(runBcmo(BCMO_NEW, nodesFor(CAT_ORD, planOf(['Mocha', 'Sorento'], ['MUB6201']), [roster(['u1', 'A']), roster(['u2', 'B'])], po)).cs_multi_note)));
check('F-R3-5: other team humanised (marketing_promotion ⇒ marketing-promotion)', /listing the marketing-promotion team members/.test(runBcmo(BCMO_NEW, nodesFor(CAT_ORD, planOf(['Mocha', 'Sorento'], ['X']), [roster(['u1', 'A']), roster(['u2', 'B'])], parser('promotion', 'marketing_promotion', 'general_enquiries'))).cs_multi_note));

// ── rev-3: miss-members-gate (NEW If) — ={{ $json.members === true }} ──
const MMG = expr('spine-miss-members-gate.expr.txt');
const evalMmg = (json) => new Function('$json', 'return ' + MMG)(json);
check('miss-members-gate: members true ⇒ TRUE (orders lane → roster fetch)', evalMmg({ members: true, company_name: 'Sorento' }) === true);
check('miss-members-gate: members false ⇒ FALSE (plain lane)', evalMmg({ members: false, company_name: 'Sorento' }) === false);
check('miss-members-gate: flag MISSING ⇒ FALSE (fail-closed)', evalMmg({ company_name: 'Sorento' }) === false);
check('miss-members-gate: string "true" ⇒ FALSE (strict ===)', evalMmg({ members: 'true' }) === false);
check('miss-members-gate: the _miss_plan_empty sentinel ⇒ FALSE (never spends a roster read)', evalMmg({ plan_idx: 0, company_id: null, company_name: null, team: null, members: false, _miss_plan_empty: true }) === false);

// ── rev-3: miss-roster-plan — LANE mirror + members/team stamping ──
const body = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const PLAN_BODY = body('spine-miss-roster-plan.js');
const GATE_LANE = GATE.slice(GATE.indexOf('  const LANE = {'), GATE.indexOf('  };', GATE.indexOf('  const LANE = {')) + 4);
const PLAN_LANE = PLAN_BODY.slice(PLAN_BODY.indexOf('  const LANE = {'), PLAN_BODY.indexOf('  };', PLAN_BODY.indexOf('  const LANE = {')) + 4);
check('LANE lockstep: miss-roster-gate and miss-roster-plan carry a BYTE-IDENTICAL LANE block', GATE_LANE === PLAN_LANE && GATE_LANE.includes('crm_inventory_stock_balance_list'));
check('LANE flags (round 4): members:true on the two ORDERS rows ONLY; the other 9 rows members:false', (GATE_LANE.match(/members: true /g) || []).length === 2 && (GATE_LANE.match(/members: false /g) || []).length === 9);
const mkPlanNodes = (nodes) => (n) => {
  if (!(n in nodes)) return { isExecuted: false, first: () => { throw new Error(`Referenced node "${n}" is unexecuted`); }, all: () => { throw new Error('unexecuted'); } };
  return { isExecuted: true, first: () => ({ json: nodes[n] }), all: () => [{ json: nodes[n] }] };
};
// ROUND 4: miss-roster-plan stamps `team` from the PARSER's suggested_team (a LANE row may carry two
// routing pairs), so the reformulator node must be stubbed. The gate has already proven the parser pair
// is one of the row's pairs, so the lane team and the parser team agree on every reachable turn.
const runPlan = (env, tool, rc, po) => new Function('$', PLAN_BODY)(mkPlanNodes({ 'central-exchange': env, 'tool-filter': { name: tool }, ...(po === undefined ? {} : { "Call 'sub-query-reformulator'": po }), ...(rc === undefined ? {} : { 'disallowed-entity-gate': { routing_companies: rc } }) })).map(i => i.json);
const RC = [{ company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', codes: ['SRT'] }];
let pl = runPlan(ORDERS_ENV, 'crm_order_management_orders_list', RC, ORD);
check('plan: orders single miss ⇒ ONE item, members:true, team customer_service, brand looked up', pl.length === 1 && pl[0].company_name === 'Sorento' && pl[0].members === true && pl[0].team === 'customer_service' && pl[0].brand_code === 'sorento', pl);
pl = runPlan(INCOMING_ENV, 'crm_incoming_stock_list', RC, INC);
check('plan: incoming single miss ⇒ members:false, team purchasing', pl.length === 1 && pl[0].members === false && pl[0].team === 'purchasing', pl);
pl = runPlan({ ...INCOMING_ENV, response: 'stock' }, 'crm_inventory_stock_balance_list', RC, parser('inventory', 'warehouse', 'general_enquiries'));
check('plan: stock single miss ⇒ members:false, team warehouse', pl.length === 1 && pl[0].members === false && pl[0].team === 'warehouse', pl);
pl = runPlan({ ...INCOMING_ENV, answers: [] }, 'crm_incoming_stock_by_product', RC, INC);
check('plan: both-miss ⇒ 2 items, every members:false, multi_company true', pl.length === 2 && pl.every(x => x.members === false && x.team === 'purchasing') && pl[0].multi_company === true, pl);
pl = runPlan({ ...ORDERS_ENV, answers: [ans('Mocha'), ans('Sorento')] }, 'crm_order_management_orders_list', RC, ORD);
check('plan: no miss ⇒ ONE sentinel, members:false, team:null, _miss_plan_empty', pl.length === 1 && pl[0]._miss_plan_empty === true && pl[0].members === false && pl[0].team === null, pl);
pl = runPlan(ORDERS_ENV, 'crm_resource_attachments_list', RC, ORD);
check('plan: non-LANE tool (unreachable — gate gates) ⇒ members:false, team:null (fail-closed, plain path)', pl.length === 1 && pl[0].members === false && pl[0].team === null, pl);

// ── rev-3: build-miss-member-offer — PLAIN arm + members-arm regression vs the PRE (rev-2/e54e114e) body ──
const BMMO_NEW = body('spine-build-miss-member-offer.js');
const BMMO_PRE = fs.readFileSync(path.join(__dirname, '..', 'backups', 'miss-company-routing', 'spine-txiPzSxy3Pclsz6v', 'round-3-rev3', 'build-miss-member-offer.jsCode.js'), 'utf8');
const runBmmo = (bodySrc, env, planItems, inputItems) => {
  const nodes = { 'central-exchange': env, 'miss-roster-plan': planItems };
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`Referenced node "${n}" is unexecuted`);
    const arr = Array.isArray(nodes[n]) ? nodes[n] : [nodes[n]];
    return { all: () => arr.map(json => ({ json })), first: () => ({ json: arr[0] }) };
  };
  const $input = { all: () => inputItems.map(json => ({ json })), first: () => ({ json: inputItems[0] }) };
  return new Function('$', '$input', bodySrc)($, $input).map(i => i.json);
};
const P_INC1 = [{ plan_idx: 0, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', codes: ['SRT'], multi_company: false, companies: ['Sorento'], team: 'purchasing', members: false }];
const P_INC2 = [{ ...P_INC1[0], multi_company: true, companies: ['Mocha', 'Sorento'] }, { plan_idx: 1, company_id: MOCHA.id, company_name: 'Mocha', brand_code: 'mocha', codes: [], multi_company: true, companies: ['Mocha', 'Sorento'], team: 'purchasing', members: false }];
const SENT = [{ plan_idx: 0, company_id: null, company_name: null, brand_code: null, codes: [], multi_company: false, companies: [], team: null, members: false, _miss_plan_empty: true }];
let bo = runBmmo(BMMO_NEW, INCOMING_ENV, P_INC1, P_INC1);
check('bmmo plain: incoming single miss ⇒ miss_plain_offer:true + plan identity (team carried), NO rows/text/member_offer', bo.length === 1 && bo[0].miss_plain_offer === true && Array.isArray(bo[0].miss_roster_plan) && bo[0].miss_roster_plan.length === 1 && bo[0].miss_roster_plan[0].team === 'purchasing' && bo[0].miss_roster_plan[0].company_id === SORENTO.id && !('miss_member_offer' in bo[0]) && !('miss_member_rows' in bo[0]) && !('miss_offer_text' in bo[0]) && bo[0].response === INCOMING_ENV.response, bo[0]);
bo = runBmmo(BMMO_NEW, INCOMING_ENV, P_INC2, P_INC2);
check('bmmo plain: both-miss ⇒ 2 plan entries, still no picker keys', bo[0].miss_plain_offer === true && bo[0].miss_roster_plan.length === 2 && !('miss_offer_text' in bo[0]), bo[0]);
bo = runBmmo(BMMO_NEW, INCOMING_ENV, SENT, SENT);
check('bmmo plain: sentinel only ⇒ envelope passthrough (no miss_plain_offer)', bo.length === 1 && !('miss_plain_offer' in bo[0]) && !('miss_member_offer' in bo[0]) && JSON.stringify(bo[0]) === JSON.stringify(INCOMING_ENV), bo[0]);
const P_NOFLAG = [{ ...P_INC1[0] }]; delete P_NOFLAG[0].members;
bo = runBmmo(BMMO_NEW, INCOMING_ENV, P_NOFLAG, P_NOFLAG);
check('bmmo plain: members flag MISSING ⇒ passthrough (fail-closed: roster parse yields [] on plan-item input)', bo.length === 1 && !('miss_plain_offer' in bo[0]) && JSON.stringify(bo[0]) === JSON.stringify(INCOMING_ENV), bo[0]);
// members arm regression: orders lane (members:true) with roster input ⇒ byte-identical to the PRE body
const P_ORD1 = [{ plan_idx: 0, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', codes: ['MUB6201'], multi_company: false, companies: ['Sorento'], team: 'customer_service', members: true }];
const ROSTER1 = [{ body: [{ user_id: 'u2', respond_user_id: 'r-u2', name: 'Jereen Tee' }, { user_id: 'u3', respond_user_id: 'r-u3', name: 'Cyndi' }] }];
const ORD_ENV_N = { ...ORDERS_ENV, response: '1. Order A\n2. Order B\n\n*Sorento:* no orders records for MUB6201.' };
// The members-arm CODE is byte-identical to rev-2; the only output delta is that miss_roster_plan's items now
// carry the two keys miss-roster-plan stamps (team, members) — transient envelope only: ccs's rows arm maps the
// plan down to {plan_idx, company_id, company_name, brand_code} before persisting, so persisted state, the picker
// text and every other envelope key are byte-identical to the PRE body.
const stripFlags = (o) => ({ ...o, miss_roster_plan: (o.miss_roster_plan || []).map(({ team, members, ...r }) => r) });
const bmmoNewOut = runBmmo(BMMO_NEW, ORD_ENV_N, P_ORD1, ROSTER1)[0];
const bmmoPreOut = runBmmo(BMMO_PRE, ORD_ENV_N, P_ORD1.map(({ team, members, ...r }) => r), ROSTER1)[0];
check('bmmo members arm: orders single miss ⇒ output identical to the PRE (rev-2) body modulo the stamped team/members plan keys', JSON.stringify(stripFlags(bmmoNewOut)) === JSON.stringify(bmmoPreOut));
const ccsMap = (plan) => plan.map((p, i) => ({ plan_idx: (p && p.plan_idx != null) ? p.plan_idx : i, company_id: (p && p.company_id) || null, company_name: (p && p.company_name) || null, brand_code: (p && p.brand_code) || null }));
check('bmmo members arm: ccs-persisted plan identity (rows-arm mapping) byte-identical NEW vs PRE', JSON.stringify(ccsMap(bmmoNewOut.miss_roster_plan)) === JSON.stringify(ccsMap(bmmoPreOut.miss_roster_plan)));
check('bmmo members arm: picker text present + selection keys', (() => { const o = runBmmo(BMMO_NEW, ORD_ENV_N, P_ORD1, ROSTER1)[0]; return o.miss_member_offer === true && o.miss_member_rows.length === 2 && /choose who to route to/.test(o.miss_offer_text) && !('miss_plain_offer' in o); })());

// ── rev-3: compile-current-state PLAIN arm (frozen phrase only; no rows, no picker, no selection_context) ──
const CCS_NEW = body('spine-compile-current-state.js');
const CCS_PRE = fs.readFileSync(path.join(__dirname, '..', 'backups', 'miss-company-routing', 'spine-txiPzSxy3Pclsz6v', 'round-3-rev3', 'compile-current-state.jsCode.js'), 'utf8');
const runCcs = (bodySrc, parserOut, catJson, bmmoJson, prev) => {
  const nodes = {
    "Call 'sub-query-reformulator'": { output: parserOut },
    'sorento-sub-respond-findcontact-respond': { id: 'c1', firstName: 'T' },
    'get-session-vars': { session_vars: { variables: prev || {} } },
    'escalate-catalog': catJson,
    ...(bmmoJson === undefined ? {} : { 'build-miss-member-offer': bmmoJson }),
  };
  const $ = (n) => ({ first: () => ({ json: nodes[n] }), all: () => [{ json: nodes[n] }], isExecuted: n in nodes && nodes[n] != null });
  return new Function('$', '$input', bodySrc)($, { first: () => ({ json: catJson || {} }), all: () => [{ json: catJson || {} }] });
};
const P_INC = (team, agent) => ({ message_type: 'business', domain_hint: 'incoming', is_affirmative: null, entities: [], routing: { suggested_team: team, suggested_agent: agent }, escalation: { is_escalation_confirmation: false }, member_pick_context: false, user_goal: 'incoming stock', access_levels: [], query_brands: [] });
const CAT_HAPPY = { branch_kind: 'happy', response: 'Incoming stock for MUB6201:\n1. …\n\n*Sorento:* no incoming stock records for MUB6201.', manualResponse: true, includeResponse: true, is_escalate_offer: false };
const PLAIN1 = { has_result: true, miss_plain_offer: true, miss_roster_plan: [{ plan_idx: 0, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', team: 'purchasing' }], response: CAT_HAPPY.response };
const PLAIN2 = { has_result: true, miss_plain_offer: true, miss_roster_plan: [{ plan_idx: 0, company_id: MOCHA.id, company_name: 'Mocha', brand_code: 'mocha', team: 'purchasing' }, { plan_idx: 1, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', team: 'purchasing' }], response: CAT_HAPPY.response };
let cr = runCcs(CCS_NEW, P_INC('purchasing', 'incoming_stock_enquiries'), CAT_HAPPY, PLAIN1);
check('ccs plain single: frozen phrase appended, names the company bold + the LANE team', cr.user_response.endsWith('\n\nWould you like me to escalate to *Sorento* purchasing team?') && /would you like me to escalate/i.test(cr.variables.response) && cr.variables.response.endsWith('Would you like me to escalate to *Sorento* purchasing team?'), cr.user_response);
check('ccs plain single: NO selection_context, NO picker text', cr.variables.selection_context !== 'member_offer' && !/choose who to route to/.test(cr.user_response), cr.variables.selection_context);
check('ccs plain single: pool identity persisted (plan w/o team + the single pair)', JSON.stringify(cr.variables.routing_roster_plan) === JSON.stringify([{ plan_idx: 0, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento' }]) && cr.variables.routing_company === SORENTO.id && cr.variables.routing_brand === 'sorento', cr.variables);
let crPre = runCcs(CCS_PRE, P_INC('purchasing', 'incoming_stock_enquiries'), CAT_HAPPY, { has_result: true, response: CAT_HAPPY.response });
check('ccs plain single: last_result_set NOT extended (== PRE-body value on the same turn)', JSON.stringify(cr.variables.last_result_set) === JSON.stringify(crPre.variables.last_result_set), cr.variables.last_result_set);
cr = runCcs(CCS_NEW, P_INC('purchasing', 'incoming_stock_enquiries'), CAT_HAPPY, PLAIN2);
check('ccs plain multi: plain phrase (no company), nulled pair, 2-entry plan persisted', cr.user_response.endsWith('\n\nWould you like me to escalate to purchasing team?') && cr.variables.routing_company === null && cr.variables.routing_brand === null && cr.variables.routing_roster_plan.length === 2, cr.user_response);
cr = runCcs(CCS_NEW, { ...P_INC('warehouse', 'general_enquiries'), domain_hint: 'inventory' }, { ...CAT_HAPPY, response: 'Stock:\n1. …\n\n*Sorento:* no stock records for MUB6201.' }, { ...PLAIN1, miss_roster_plan: [{ ...PLAIN1.miss_roster_plan[0], team: 'warehouse' }] });
check('ccs plain stock: phrase names the warehouse team', cr.user_response.endsWith('Would you like me to escalate to *Sorento* warehouse team?'), cr.user_response);
cr = runCcs(CCS_NEW, P_INC('purchasing', 'incoming_stock_enquiries'), CAT_HAPPY, { ...PLAIN1, miss_roster_plan: [{ ...PLAIN1.miss_roster_plan[0], team: null }] });
check('ccs plain: plan team missing ⇒ falls back to the parser suggested_team (gate-enforced lockstep)', cr.user_response.endsWith('Would you like me to escalate to *Sorento* purchasing team?'), cr.user_response);
cr = runCcs(CCS_NEW, P_INC('purchasing', 'incoming_stock_enquiries'), { ...CAT_HAPPY, response: '', includeResponse: false }, PLAIN1);
check('ccs plain: empty user_response ⇒ arm silent (guard set shared with the rows arm)', !/would you like me to escalate/i.test(String(cr.user_response || '')), cr.user_response);
check('ccs regression: bmmo passthrough turn (no plain/member keys) ⇒ output byte-identical NEW vs PRE body', JSON.stringify(runCcs(CCS_NEW, P_INC('purchasing', 'incoming_stock_enquiries'), CAT_HAPPY, { has_result: true, response: CAT_HAPPY.response })) === JSON.stringify(crPre));
const MEMJ = { has_result: true, miss_member_offer: true, miss_member_rows: [{ idx: 3, label: 'Jereen Tee', uuid: 'u2', respond_user_id: 'r-u2', company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', company_ids: [SORENTO.id], companies: ['Sorento'] }], miss_offer_text: 'Please choose who to route to (reply with the number):\n3. Jereen Tee\n\nIf you have no preference, just reply \'yes\' and we\'ll assign automatically.', miss_roster_plan: [{ plan_idx: 0, company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', team: 'customer_service', members: true }], response: 'orders…' };
const P_ORD = { ...P_INC('customer_service', 'order_enquiries'), domain_hint: 'order' };
const CAT_O = { branch_kind: 'happy', response: '1. Order A\n\n*Sorento:* no orders records for MUB6201.', manualResponse: true, includeResponse: true, is_escalate_offer: false };
check('ccs regression: MEMBERS mode byte-identical NEW vs PRE body (rows arm untouched; stamped plan keys stripped by the mapping)', JSON.stringify(runCcs(CCS_NEW, P_ORD, CAT_O, MEMJ)) === JSON.stringify(runCcs(CCS_PRE, P_ORD, CAT_O, { ...MEMJ, miss_roster_plan: MEMJ.miss_roster_plan.map(({ team, members, ...r }) => r) })));

// ── rev-3: clarify-company-reply / offer-hold-reply copy branches (ONE body on BOTH nodes) ──
const CCR = body('spine-clarify-company-reply.js');
const runCcr = (prev, inputJson) => new Function('$', '$input', CCR)((n) => {
  if (n !== 'get-session-vars') throw new Error('unexpected node ' + n);
  return { first: () => ({ json: { session_vars: { variables: prev } } }) };
}, { first: () => ({ json: inputJson || {} }) })[0].json;
const PREV_MEM = { selection_context: 'member_offer', routing_roster_plan: [{ company_name: 'Mocha' }, { company_name: 'Sorento' }] };
const PREV_PLAIN = { routing_roster_plan: [{ company_name: 'Mocha' }, { company_name: 'Sorento' }] };
let cc = runCcr(PREV_MEM, {});
check('clarify copy: member_offer context ⇒ rev-4 copy byte-identical (number/name/company)', cc.clarify_text === "Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company (Mocha / Sorento) and I'll assign automatically." && cc.clarify_company === true, cc.clarify_text);
cc = runCcr(PREV_PLAIN, {});
check('clarify copy: NO picker context ⇒ rev-3 company-only copy', cc.clarify_text === "Both *Mocha* and *Sorento* teams are listed — reply with the company (Mocha / Sorento) and I'll assign automatically.", cc.clarify_text);
cc = runCcr({ selection_context: 'suggest_offer', routing_roster_plan: [{ company_name: 'Mocha' }, { company_name: 'Sorento' }] }, {});
check('clarify copy: any non-member_offer context takes the company-only branch', /reply with the company \(Mocha \/ Sorento\)/.test(cc.clarify_text), cc.clarify_text);
cc = runCcr({ routing_companies: [{ company_name: 'Mocha' }, { company_name: 'Sorento' }] }, {});
check('clarify copy: falls back to routing_companies for names (unchanged)', /Both \*Mocha\* and \*Sorento\* teams are listed/.test(cc.clarify_text), cc.clarify_text);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
