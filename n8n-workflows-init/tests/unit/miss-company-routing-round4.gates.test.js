#!/usr/bin/env node
/* miss-company-routing ROUND 4 — evaluates the DEPLOYED bodies (byte-exact repo copies of clone
 * txiPzSxy3Pclsz6v @ accef88f + get-results fork t4QvrtrPnTwRU6br @ 9ee992e9) with n8n globals stubbed:
 *   W2  `miss-roster-gate` LANE/pairs — the full 11-tool truth table (== the CRM's stamp_lookup_companies
 *       set), both routing pairs of crm_master_product_attachments_list, the members flags, and the
 *       round-2/3 rows re-run unchanged.
 *   W3  the two new precedence legs (generic rendered-phrase leg + the promo-picker marker leg).
 *   W1  the `_codes` uuid-placeholder predicate in the get-results sub's `output-structurer`, exercised
 *       as the DEPLOYED source slice (predicate + the sentence it feeds).
 *   W5  `miss-roster-plan` — LANE lockstep and `team` stamped from the PARSER's suggested_team.
 * Usage: node miss-company-routing-round4.gates.test.js [diffs-dir]
 */
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || path.join(__dirname, '..', 'diffs', 'miss-company-routing');
const body = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const expr = (f) => {
  const s = body(f);
  if (!s.startsWith('={{ ') || !s.endsWith(' }}')) throw new Error(`${f}: not an n8n ={{ }} expression`);
  return s.slice(4, -3);
};
const GATE = expr('spine-miss-roster-gate.expr.txt');
const PLAN_BODY = body('spine-miss-roster-plan.js');
const OS_BODY = body('getresults-output-structurer.js');

let fails = 0, passes = 0;
const check = (name, cond, got) => { if (!cond) { fails++; console.error(`FAIL ${name}: ${JSON.stringify(got)}`); } else { passes++; console.log(`ok   ${name}`); } };

// n8n `$('node')` stub: nodes map name → json (absent ⇒ not executed; a function ⇒ throws on access).
const mk = (nodes) => (n) => {
  if (!(n in nodes)) return { isExecuted: false, first: () => { throw new Error(`Referenced node "${n}" is unexecuted`); }, all: () => { throw new Error('unexecuted'); } };
  if (typeof nodes[n] === 'function') return { isExecuted: true, first: () => nodes[n](), all: () => [nodes[n]()] };
  return { isExecuted: true, first: () => ({ json: nodes[n] }), all: () => [{ json: nodes[n] }] };
};
const evalGate = (json, nodes) => new Function('$json', '$', 'return ' + GATE)(json, mk(nodes));

// ── fixtures ──
const MOCHA = { id: '38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2', name: 'Mocha' };
const SORENTO = { id: '00000000-0000-0000-0000-000000000001', name: 'Sorento' };
const ans = (co) => ({ fields: [{ key: 'company_name', label: 'Company', value: co }, { key: 'code', value: 'MUB6201' }] });
// A miss envelope: both companies queried, only Mocha answered. `response` carries output-structurer's
// miss line and — critically for the W3 generic leg — NO escalation phrase.
const ENV = (noun) => ({ has_result: true, lookup_companies: [MOCHA, SORENTO], answers: [ans('Mocha')], response: `… *Sorento:* no ${noun} records for MUB6201.` });
const parser = (domain, team, agent) => ({ output: { domain_hint: domain, routing: { suggested_team: team, suggested_agent: agent } } });
const XD_NONE = { _xdBlock: { block: '', any: false } };
const XD_ANY = { _xdBlock: { block: '*Sorento* (warehouse): 0 …', any: true, team: 'warehouse' } };
const base = (tool, p, extra) => ({ 'tool-filter': { name: tool, similarity: 0.9 }, "Call 'sub-query-reformulator'": p, 'crossdomain-render': XD_NONE, ...(extra || {}) });

// ── W2. the full round-4 LANE truth table ───────────────────────────────────────────────────────
// [tool, domain, [[team, agent], …], members, miss-line noun]
const LANE_SPEC = [
  ['crm_order_management_orders_list',            'order',              [['customer_service', 'order_enquiries']], true,  'orders'],
  ['crm_order_management_orders_by_product_list', 'order',              [['customer_service', 'order_enquiries']], true,  'orders'],
  ['crm_incoming_stock_list',                     'incoming',           [['purchasing', 'incoming_stock_enquiries']], false, 'incoming stock'],
  ['crm_incoming_stock_by_product',               'incoming',           [['purchasing', 'incoming_stock_enquiries']], false, 'incoming stock'],
  ['crm_incoming_stock_shipments',                'incoming',           [['purchasing', 'incoming_stock_enquiries']], false, 'incoming shipments'],
  ['crm_inventory_stock_balance_list',            'inventory',          [['warehouse', 'general_enquiries']], false, 'stock'],
  ['crm_marketing_promotions_list',               'promotion',          [['marketing_promotion', 'general_enquiries']], false, 'promotions'],
  ['crm_marketing_promotion_products_list',       'promotion',          [['marketing_promotion', 'general_enquiries']], false, 'promotion products'],
  ['crm_master_products_list',                    'master_products',    [['purchasing_product', 'general_enquiries']], false, 'products'],
  ['crm_master_product_attachments_list',         'product_attachment', [['marketing_product', 'general_enquiries'], ['purchasing_certification', 'general_enquiries']], false, 'product attachments'],
  ['crm_certificates_list',                       'product_attachment', [['purchasing_certification', 'general_enquiries']], false, 'certificates'],
];
check('W2: LANE_SPEC covers 11 tools == the CRM stamp_lookup_companies set', LANE_SPEC.length === 11);
for (const [tool, domain, pairs, , noun] of LANE_SPEC) {
  for (const [team, agent] of pairs) {
    check(`W2 TRUE: ${tool} · ${domain} · ${team}/${agent}`, evalGate(ENV(noun), base(tool, parser(domain, team, agent))) === true);
  }
}
// every LANE tool must reject every OTHER lane's routing pair (the domain+pair lockstep leg)
const ALL_PAIRS = [...new Set(LANE_SPEC.flatMap(([, , p]) => p.map(x => x.join('|'))))].map(s => s.split('|'));
let crossFalse = 0, crossTrue = 0;
for (const [tool, domain, pairs, , noun] of LANE_SPEC) {
  const own = new Set(pairs.map(p => p.join('|')));
  for (const [team, agent] of ALL_PAIRS) {
    if (own.has(`${team}|${agent}`)) continue;
    const r = evalGate(ENV(noun), base(tool, parser(domain, team, agent)));
    if (r === false) crossFalse++; else { crossTrue++; console.error(`  cross-pair leak: ${tool} accepted ${team}/${agent}`); }
  }
}
check(`W2: every LANE tool rejects every foreign routing pair (${crossFalse} combinations)`, crossTrue === 0 && crossFalse > 0);
// C5: certificates is restricted to purchasing_certification; attachments accepts BOTH pairs
check('W2/C5: crm_certificates_list under marketing_product routing ⇒ FALSE (incoherent ⇒ fail-closed)', evalGate(ENV('certificates'), base('crm_certificates_list', parser('product_attachment', 'marketing_product', 'general_enquiries'))) === false);
check('W2/C5: crm_master_product_attachments_list accepts BOTH of its pairs', evalGate(ENV('product attachments'), base('crm_master_product_attachments_list', parser('product_attachment', 'marketing_product', 'general_enquiries'))) === true && evalGate(ENV('product attachments'), base('crm_master_product_attachments_list', parser('product_attachment', 'purchasing_certification', 'general_enquiries'))) === true);
// domain leg still pins the lane even when the pair is right
check('W2: promotions tool with domain inventory ⇒ FALSE (domain leg)', evalGate(ENV('promotions'), base('crm_marketing_promotions_list', parser('inventory', 'marketing_promotion', 'general_enquiries'))) === false);
check('W2: certificates tool with domain promotion ⇒ FALSE (domain leg)', evalGate(ENV('certificates'), base('crm_certificates_list', parser('promotion', 'purchasing_certification', 'general_enquiries'))) === false);
// structurally-excluded tools stay out
check('W2: non-stamping tools (resource attachments / forms / portal link / GRN) ⇒ FALSE', ['crm_resource_attachments_list', 'crm_forms_management_forms_list', 'crm_portal_link_get', 'crm_procurement_grn_list'].every(t => evalGate(ENV('x'), base(t, parser('promotion', 'marketing_promotion', 'general_enquiries'))) === false));
// round-2/3 shape legs re-run unchanged on a round-4 lane
check('W2 regression: _xdBlock.any ⇒ FALSE on a promotions miss too', evalGate(ENV('promotions'), base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'), { 'crossdomain-render': XD_ANY })) === false);
check('W2 regression: has_result false ⇒ FALSE', evalGate({ ...ENV('promotions'), has_result: false }, base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'))) === false);
check('W2 regression: miss set empty ⇒ FALSE', evalGate({ ...ENV('promotions'), answers: [ans('Mocha'), ans('Sorento')] }, base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'))) === false);
check('W2 regression: an answer without a company_name field ⇒ FALSE', evalGate({ ...ENV('promotions'), answers: [ans('Mocha'), { fields: [{ key: 'code', value: 'X' }] }] }, base('crm_marketing_promotions_list', parser('promotion', 'marketing_promotion', 'general_enquiries'))) === false);
check('W2 regression: tool-filter missing ⇒ FALSE', evalGate(ENV('promotions'), { "Call 'sub-query-reformulator'": parser('promotion', 'marketing_promotion', 'general_enquiries') }) === false);
check('W2 regression: tool-filter throws ⇒ FALSE (outer try)', evalGate(ENV('promotions'), { 'tool-filter': () => { throw new Error('boom'); }, "Call 'sub-query-reformulator'": parser('promotion', 'marketing_promotion', 'general_enquiries') }) === false);

// ── W3. precedence — a turn may carry exactly ONE escalation offer ──────────────────────────────
const PROMO = parser('promotion', 'marketing_promotion', 'general_enquiries');
const promoEnv = ENV('promotions');
check('W3(a): rendered response already carries the frozen phrase ⇒ FALSE', evalGate({ ...promoEnv, response: `${promoEnv.response}\n\nNo promotion found for X. Would you like me to escalate to marketing_promotion team?` }, base('crm_marketing_promotions_list', PROMO)) === false);
check('W3(a): phrase match is case-insensitive', evalGate({ ...promoEnv, response: 'WOULD YOU LIKE ME TO ESCALATE to marketing team?' }, base('crm_marketing_promotions_list', PROMO)) === false);
check('W3(a): inert on the round-2/3 lanes (no phrase in an output-structurer response)', evalGate(ENV('orders'), base('crm_order_management_orders_list', parser('order', 'customer_service', 'order_enquiries'))) === true);
check('W3(a): response missing/null ⇒ leg inert, never throws', evalGate({ ...promoEnv, response: null }, base('crm_marketing_promotions_list', PROMO)) === true && evalGate({ ...promoEnv, response: undefined }, base('crm_marketing_promotions_list', PROMO)) === true);
for (const [marker, value] of [['_brand_gate_closed', true], ['_promo_notfound', { tokens: ['x'], reason: 'strict' }], ['_promo_unmatched', ['MUB6201']], ['_promo_pick', { positions: [1], matched: 1 }], ['_promo_picker_shape', 'unrecognised']]) {
  check(`W3(b): promo-picker marker ${marker} ⇒ FALSE`, evalGate(promoEnv, base('crm_marketing_promotions_list', PROMO, { 'promo-picker': { [marker]: value } })) === false);
}
check('W3(b): _brand_gate_closed is strict === true (a falsy/other value does not fire the leg alone)', evalGate(promoEnv, base('crm_marketing_promotions_list', PROMO, { 'promo-picker': { _brand_gate_closed: false } })) === true);
check('W3(b): promo-picker EXECUTED with no marker ⇒ TRUE (the common answered-promotions miss)', evalGate(promoEnv, base('crm_marketing_promotions_list', PROMO, { 'promo-picker': { some: 'passthrough', output: { has_result: true } } })) === true);
check('W3(b): promo-picker NOT executed (non-promotion domains) ⇒ TRUE', evalGate(ENV('incoming stock'), base('crm_incoming_stock_list', parser('incoming', 'purchasing', 'incoming_stock_enquiries'))) === true);
check('W3(b): promo-picker throws on access ⇒ FALSE (outer try, fail-closed)', evalGate(promoEnv, base('crm_marketing_promotions_list', PROMO, { 'promo-picker': () => { throw new Error('boom'); } })) === false);
check('W3(b): _promo_unmatched set to undefined (promo-picker\'s own empty form) ⇒ leg inert', evalGate(promoEnv, base('crm_marketing_promotions_list', PROMO, { 'promo-picker': { _promo_unmatched: undefined } })) === true);

// ── W1. `_codes` uuid-placeholder predicate, from the DEPLOYED output-structurer body ───────────
const SLICE_START = OS_BODY.indexOf('    const _isUuid = s =>');
const SLICE_END = OS_BODY.indexOf("if (_canAttribute && _silent.length) msg +=");
check('W1: the deployed output-structurer carries the round-4 _codes hunk', SLICE_START > 0 && SLICE_END > SLICE_START);
const SLICE = OS_BODY.slice(SLICE_START, OS_BODY.indexOf('\n', SLICE_END));
const runCodes = (entities, resultType, opts) => {
  const o = opts || {};
  const $ = mk({ 'When Executed by Another Workflow': entities === undefined ? undefined : { entities } });
  const safe = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const fn = new Function('$', 'safe', 'e', '_lookupCos', '_shownCos', '_canAttribute',
    'let msg = "";\n' + SLICE + '\nreturn { _codes, _what, msg };');
  return fn($, safe, { result_type: resultType }, o.lookupCos || [MOCHA, SORENTO], o.shown || new Set(['Mocha']), o.canAttribute !== false);
};
const UU = ['67f07a6c-0000-4000-8000-000000000001', '62a48f82-0000-4000-8000-000000000002', '0899962d-0000-4000-8000-000000000003', 'b0da7e8f-0000-4000-8000-000000000004'];
// exec 12941592 / sub 12941604 — the captain's turn, verbatim entity shape
const CAPTAIN_ENTS = [
  ...UU.map(u => ({ uuid: u, entity_type: 'promotion', code: u })),
  { uuid: '31f26a89-0000-4000-8000-00000000000a', entity_type: 'product', code: 'MUB6201' },
  { uuid: 'fbc8fb94-0000-4000-8000-00000000000b', entity_type: 'product', code: 'MUB6201' },
];
let r = runCodes(CAPTAIN_ENTS, 'promotions');
check('W1(i): captain\'s turn — 4 promotion uuid placeholders dropped, MUB6201 kept (deduped)', JSON.stringify(r._codes) === JSON.stringify(['MUB6201']), r._codes);
check('W1(i): rendered miss line is "*Sorento:* no promotions records for MUB6201." with zero uuids', r.msg.trim() === '*Sorento:* no promotions records for MUB6201.' && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(r.msg), r.msg);
r = runCodes([{ uuid: 'aa11bb22-0000-4000-8000-0000000000cc', entity_type: 'order', code: 'M2608-1026' }], 'orders');
check('W1(ii): orders-by-DO — the DO number M2608-1026 is KEPT (an entity_type===\'product\' filter would have deleted it)', JSON.stringify(r._codes) === JSON.stringify(['M2608-1026']) && r.msg.trim() === '*Sorento:* no orders records for M2608-1026.', r._codes);
r = runCodes(UU.map(u => ({ uuid: u, entity_type: 'promotion', code: u })), 'promotions');
check('W1(iii): promotion-only entities ⇒ [] and the truthful no-clause sentence', JSON.stringify(r._codes) === JSON.stringify([]) && r.msg.trim() === '*Sorento:* no promotions records.', [r._codes, r.msg]);
r = runCodes([{ uuid: UU[0], entity_type: 'promotion', code: UU[0] }, { uuid: 'x1', entity_type: 'product', code: 'MUB6201' }, { uuid: 'x2', entity_type: 'product', code: 'MUB6201' }], 'promotions');
check('W1(iv): mixed product+promotion ⇒ the product code only, deduped', JSON.stringify(r._codes) === JSON.stringify(['MUB6201']), r._codes);
r = runCodes(JSON.stringify(CAPTAIN_ENTS), 'promotions');
check('W1(v): `entities` as a JSON STRING (the safe() path) ⇒ same result', JSON.stringify(r._codes) === JSON.stringify(['MUB6201']), r._codes);
check('W1(vi): missing / unexecuted trigger ⇒ [], no throw', JSON.stringify(runCodes(undefined, 'promotions')._codes) === JSON.stringify([]));
check('W1(vi): entities null / non-array / unparseable string ⇒ [], no throw', [null, 42, '{not json', {}].every(v => JSON.stringify(runCodes(v, 'promotions')._codes) === JSON.stringify([])));
check('W1: a uuid-SHAPED code that differs from its own uuid is still dropped (regex half)', JSON.stringify(runCodes([{ uuid: 'row-1', entity_type: 'promotion', code: UU[1] }], 'promotions')._codes) === JSON.stringify([]));
check('W1: an UPPERCASE uuid placeholder is dropped (case-insensitive regex)', JSON.stringify(runCodes([{ uuid: 'r', entity_type: 'promotion', code: UU[2].toUpperCase() }], 'promotions')._codes) === JSON.stringify([]));
check('W1: a non-uuid placeholder equal to its own uuid is dropped (code !== uuid half)', JSON.stringify(runCodes([{ uuid: 'REC-77', entity_type: 'promotion', code: 'REC-77' }], 'promotions')._codes) === JSON.stringify([]));
check('W1: a code that merely CONTAINS a uuid-like run is kept (anchored regex)', JSON.stringify(runCodes([{ uuid: 'u', entity_type: 'product', code: `PRE-${UU[0]}` }], 'products')._codes) === JSON.stringify([`PRE-${UU[0]}`]));
check('W1: empty survivor set ⇒ the " for …" clause is dropped, sentence still truthful', runCodes([{ uuid: UU[0], entity_type: 'promotion', code: UU[0] }], 'certificates').msg.trim() === '*Sorento:* no certificates records.');
check('W1: no miss company ⇒ the block says nothing at all', runCodes(CAPTAIN_ENTS, 'promotions', { shown: new Set(['Mocha', 'Sorento']) }).msg === '');
check('W1: rows present but unattributed (_canAttribute false) ⇒ says nothing (B1 rule intact)', runCodes(CAPTAIN_ENTS, 'promotions', { canAttribute: false }).msg === '');

// ── W5. miss-roster-plan — LANE lockstep + `team` from the parser ───────────────────────────────
const sliceLane = (s) => { const i = s.indexOf('  const LANE = {'); return s.slice(i, s.indexOf('  };', i) + 4); };
const GATE_LANE = sliceLane(GATE), PLAN_LANE = sliceLane(PLAN_BODY);
check('W5: LANE literal is BYTE-IDENTICAL in miss-roster-gate and miss-roster-plan', GATE_LANE === PLAN_LANE && GATE_LANE.length > 0);
check('W5: the LANE literal names all 11 round-4 tools', LANE_SPEC.every(([t]) => GATE_LANE.includes(`'${t}':`)));
check('W5: members:true appears on the two ORDERS rows ONLY', (GATE_LANE.match(/members: true /g) || []).length === 2 && LANE_SPEC.filter(([, , , m]) => m).every(([t]) => /members: true/.test(GATE_LANE.split(`'${t}':`)[1].split('\n')[0])));
check('W5: the other 9 rows are members:false', (GATE_LANE.match(/members: false /g) || []).length === 9);
const runPlan = (env, tool, po, rc) => new Function('$', PLAN_BODY)(mk({ 'central-exchange': env, 'tool-filter': { name: tool }, ...(po === undefined ? {} : { "Call 'sub-query-reformulator'": po }), ...(rc === undefined ? {} : { 'disallowed-entity-gate': { routing_companies: rc } }) })).map(i => i.json);
const RC = [{ company_id: SORENTO.id, company_name: 'Sorento', brand_code: 'sorento', codes: ['SRT'] }];
for (const [tool, domain, pairs, members, noun] of LANE_SPEC) {
  for (const [team, agent] of pairs) {
    const pl = runPlan(ENV(noun), tool, parser(domain, team, agent), RC);
    check(`W5 plan: ${tool} · ${team} ⇒ 1 item, members:${members}, team stamped from the parser`, pl.length === 1 && pl[0].company_name === 'Sorento' && pl[0].members === members && pl[0].team === team, pl[0]);
  }
}
check('W5: the two-pair attachments row cannot mislabel a certificates ask', runPlan(ENV('product attachments'), 'crm_master_product_attachments_list', parser('product_attachment', 'purchasing_certification', 'general_enquiries'), RC)[0].team === 'purchasing_certification');
check('W5: the same row stamps marketing_product on a photo ask', runPlan(ENV('product attachments'), 'crm_master_product_attachments_list', parser('product_attachment', 'marketing_product', 'general_enquiries'), RC)[0].team === 'marketing_product');
check('W5: unknown tool ⇒ team:null, members:false (fail-closed, plain path)', (() => { const p = runPlan(ENV('x'), 'crm_resource_attachments_list', PROMO, RC)[0]; return p.team === null && p.members === false; })());
check('W5: parser node unexecuted ⇒ team:null, never throws (ccs _mcTeamP then falls back)', (() => { const p = runPlan(ENV('promotions'), 'crm_marketing_promotions_list', undefined, RC)[0]; return p.team === null && p.members === false; })());
check('W5: routing null / blank team ⇒ team:null', [{ output: { routing: null } }, { output: { routing: { suggested_team: '   ' } } }, { output: {} }].every(po => runPlan(ENV('promotions'), 'crm_marketing_promotions_list', po, RC)[0].team === null));
check('W5: no miss ⇒ ONE sentinel (members:false, team:null) — never a roster fetch', (() => { const p = runPlan({ ...ENV('promotions'), answers: [ans('Mocha'), ans('Sorento')] }, 'crm_marketing_promotions_list', PROMO, RC); return p.length === 1 && p[0]._miss_plan_empty === true && p[0].members === false && p[0].team === null; })());
check('W5: both-miss promotions ⇒ 2 items, multi_company, every members:false', (() => { const p = runPlan({ ...ENV('promotions'), answers: [] }, 'crm_marketing_promotions_list', PROMO, RC); return p.length === 2 && p[0].multi_company === true && p.every(x => x.members === false && x.team === 'marketing_promotion'); })());

// ── LESSONS #45: forbidden-token scan on every deployed expression file ─────────────────────────
const FORBIDDEN = /prototype|constructor|__proto__/;
for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.expr.txt')).sort()) {
  check(`sandbox: ${f} has no prototype/constructor/__proto__ token`, !FORBIDDEN.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
}
check('sandbox: the round-4 gate still uses the Object.keys(...).includes membership form', /Object\.keys\(LANE\)\.includes\(tool\)/.test(GATE));
check('sandbox: the round-4 gate\'s pairs leg uses .some on a plain array', /lane\.pairs\.some\(p => p\[0\] === r\.suggested_team && p\[1\] === r\.suggested_agent\)/.test(GATE));

// ── F-R4-3. the promotions team is the COLLAPSED `marketing_promotion` everywhere ───────────────
// Captain 2026-08-18: "fix it now, we should do marketing_promotion". CRM migration 371 merged the
// brand-suffixed T1 rows, so `marketing_promotion_<brand>` names no resolvable team. Producers:
// disallowed-entity-gate.company_team, promo-picker._escTeam, and the parser's deriveRouting.
const DEG = body('spine-disallowed-entity-gate.js');
const PP = body('spine-promo-picker.js');
const CAT_LIVE = fs.readFileSync(path.join(__dirname, '..', 'backups', 'miss-company-routing', 'LIVE-PROMOTE-STAGED-20260818', 'PAYLOAD-node-escalate-catalog.js'), 'utf8');

// (1) the gate emits the collapsed team — exercised on the DEPLOYED body's own statement
const degSlice = (() => {
  const i = DEG.indexOf("  out.company_team = (domain === 'promotion'");
  return DEG.slice(i, DEG.indexOf('\n', DEG.indexOf('null;', i)));
})();
const runCompanyTeam = (domain, brands) => new Function('domain', '_brands', 'out', degSlice + '\nreturn out.company_team;')(domain, brands, {});
check('F-R4-3: promotions + one resolved company ⇒ company_team === "marketing_promotion" (collapsed)', runCompanyTeam('promotion', ['sorento']) === 'marketing_promotion', runCompanyTeam('promotion', ['sorento']));
check('F-R4-3: the brand no longer leaks into the team name (mocha resolves the same value)', runCompanyTeam('promotion', ['mocha']) === 'marketing_promotion');
check('F-R4-3: guard kept verbatim — mixed companies ⇒ null (consumers fall back to the parser routing)', runCompanyTeam('promotion', ['sorento', 'mocha']) === null);
check('F-R4-3: guard kept verbatim — zero companies ⇒ null', runCompanyTeam('promotion', []) === null);
check('F-R4-3: non-promotion domains ⇒ null (unchanged)', ['order', 'incoming', 'inventory', 'product_attachment', 'master_products'].every(d => runCompanyTeam(d, ['sorento']) === null));
check('F-R4-3: no brand-suffixed team survives in EXECUTABLE code (comments may still quote it)', DEG.split('\n').filter(l => !l.trim().startsWith('//')).every(l => !/marketing_promotion_[a-z]/.test(l)));

// (2) promo-picker's offer text names the collapsed team on every one of its three arms
const escTeamSrc = PP.slice(PP.indexOf('const _escTeam = (() => {'), PP.indexOf('})();', PP.indexOf('const _escTeam = (() => {')) + 5);
const runEscTeam = (companyTeam, parserTeam) => new Function('$', 'parser', escTeamSrc + '\nreturn _escTeam;')(
  mk(companyTeam === undefined ? {} : { 'disallowed-entity-gate': { company_team: companyTeam } }),
  { routing: parserTeam === undefined ? null : { suggested_team: parserTeam } });
check('F-R4-3: promo-picker prefers company_team ⇒ "marketing_promotion" (offer text and miss offer agree)', runEscTeam('marketing_promotion', 'marketing_promotion') === 'marketing_promotion');
check('F-R4-3: company_team null ⇒ falls back to the parser routing, same string (A || B collapses)', runEscTeam(null, 'marketing_promotion') === 'marketing_promotion');
check('F-R4-3: gate unexecuted ⇒ parser routing, still collapsed', runEscTeam(undefined, 'marketing_promotion') === 'marketing_promotion');
check('F-R4-3: last-resort default is the COLLAPSED team (was marketing_promotion_sorento)', runEscTeam(null, undefined) === 'marketing_promotion');
check('F-R4-3: no brand-suffixed team survives in promo-picker EXECUTABLE code', PP.split('\n').filter(l => !l.trim().startsWith('//')).every(l => !/marketing_promotion_[a-z]/.test(l)));
check('F-R4-3: promo-picker\'s three offer strings all interpolate _escTeam', (PP.match(/Would you like me to escalate to \$\{_escTeam\} team\?/g) || []).length === 3);

// (3) escalate-catalog's LIVE `_ct` arm resolves to the same collapsed team
const ctSrc = CAT_LIVE.slice(CAT_LIVE.indexOf('    const _ct = (() => {'), CAT_LIVE.indexOf('\n', CAT_LIVE.indexOf('    const _ct = (() => {')));
check('F-R4-3: the live escalate-catalog _ct hunk is present in the staged payload body', ctSrc.includes("g2.first().json.company_team"));
const runCt = (companyTeam, parserTeam) => { const _ct = new Function('$', ctSrc + '\nreturn _ct;')(mk(companyTeam === undefined ? {} : { 'disallowed-entity-gate': { company_team: companyTeam } })); return _ct || parserTeam; };
check('F-R4-3: live _ct with the collapsed company_team ⇒ "marketing_promotion"', runCt('marketing_promotion', 'marketing_promotion') === 'marketing_promotion');
check('F-R4-3: live _ct null ⇒ parser routing, SAME string ⇒ one turn can no longer name two teams', runCt(null, 'marketing_promotion') === runCt('marketing_promotion', 'marketing_promotion'));

// (4) end-to-end agreement: every team-naming producer on a promotions turn returns one value
const PRODUCERS = [runCompanyTeam('promotion', ['sorento']), runEscTeam('marketing_promotion', 'marketing_promotion'), runCt('marketing_promotion', 'marketing_promotion'), runPlan(ENV('promotions'), 'crm_marketing_promotions_list', PROMO, RC)[0].team];
check('F-R4-3: gate · promo-picker · escalate-catalog · miss-roster-plan all name ONE team on a promotions turn', new Set(PRODUCERS).size === 1 && PRODUCERS[0] === 'marketing_promotion', PRODUCERS);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
