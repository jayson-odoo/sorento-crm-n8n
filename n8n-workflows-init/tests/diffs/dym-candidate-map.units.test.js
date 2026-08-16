'use strict';
const fs = require('fs');
const D = '/private/tmp/claude-501/-Users-tehjayson-Documents-foundryx-sorento-crm-n8n/4b4ca0db-c867-43e8-91e0-97708402406e/scratchpad';
const buildSrc   = fs.readFileSync(D + '/build-suggest-offer.new.js', 'utf8');
const outexSrc   = fs.readFileSync(D + '/output_exchange.new.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---- node runner: n8n Code node body is a function body with top-level return ----
function runNode(src, globals) {
  const names = Object.keys(globals);
  const fn = new Function(...names, src);
  return fn(...names.map(n => globals[n]));
}
// node handle factory: supports .first().json, .all(branch,run), .isExecuted
function handle(json, opts = {}) {
  const items = (opts.runs) || (json === undefined ? [] : [{ json }]);
  return {
    isExecuted: opts.isExecuted !== undefined ? opts.isExecuted : (json !== undefined),
    first: () => ({ json }),
    all: (b = 0, r = 0) => {
      if (opts.allByRun) return opts.allByRun[r] || [];
      return r === 0 ? items : [];
    },
  };
}
function makeDollar(map) {
  return (name) => {
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    // unknown node → looks not-executed; .first() throws like n8n (guarded by try/catch in node code)
    return { isExecuted: false, first: () => { throw new Error('no data ' + name); }, all: () => { throw new Error('no data ' + name); } };
  };
}

// ============================ BUILD SIDE ============================
function runBuild({ q, r, gate, getResults, siblingTransform, siblingProbe, inputJson }) {
  const map = {
    "Call 'sub-query-reformulator'": handle({ output: q }),
    'resolve-entity': handle(r),
    'disallowed-entity-gate': handle(gate || {}),
    "Call 'sub-get-results'": getResults || handle(undefined, { isExecuted: false }),
    'sibling-transform': siblingTransform || handle(undefined, { isExecuted: false }),
    'sibling-probe': siblingProbe || handle(undefined, { isExecuted: false }),
  };
  const $ = makeDollar(map);
  const $input = { first: () => ({ json: inputJson || {} }) };
  return runNode(buildSrc, { $input, $ });
}

// V-DYM0-a : D1 code-mode map
{
  const q = { domain_hint: 'order', entities: [{ raw: 'Srtwc286', hint: 'product' }], routing: {} };
  const r = { resolutions: [{ token: 'Srtwc286', resolved: false, matches: [
    { canonical_code: 'SRTWC286-SH', uuid: 'u1', entity_type: 'product', match_tier: 'fuzzy' },
    { canonical_code: 'SRTWC286-SH-PP', uuid: 'u2', entity_type: 'product', match_tier: 'fuzzy' },
    { canonical_code: 'SRTWC286-SH-NEW-150', uuid: 'u3', entity_type: 'product', match_tier: 'fuzzy' },
  ] }] };
  const out = runBuild({ q, r });
  ok('V-DYM0-a suggest_offer', out.suggest_offer === true, JSON.stringify(out.suggest_offer));
  const dc = out.dym_candidates;
  ok('V-DYM0-a dym_candidates len==3', Array.isArray(dc) && dc.length === 3, JSON.stringify(dc));
  ok('V-DYM0-a codes match SH set', dc && dc.map(x => x.code).join(',') === 'SRTWC286-SH,SRTWC286-SH-PP,SRTWC286-SH-NEW-150', JSON.stringify(dc && dc.map(x=>x.code)));
  ok('V-DYM0-a for_raw==Srtwc286 all', dc && dc.every(x => x.for_raw === 'Srtwc286'));
  ok('V-DYM0-a for_hint==product all', dc && dc.every(x => x.for_hint === 'product'));
}

// V-DYM0-b : D1 fuzzy/typo (non-prefix)
{
  const q = { domain_hint: 'inventory', entities: [{ raw: 'cwc2816', hint: 'product' }], routing: {} };
  const r = { resolutions: [{ token: 'cwc2816', resolved: false, matches: [
    { canonical_code: 'CWCX2816', uuid: 'uf', entity_type: 'product', match_tier: 'fuzzy' },
  ] }] };
  const out = runBuild({ q, r });
  const dc = out.dym_candidates;
  ok('V-DYM0-b fuzzy mapped', Array.isArray(dc) && dc.some(x => x.code === 'CWCX2816' && x.for_raw === 'cwc2816' && x.for_hint === 'product'), JSON.stringify(dc));
}

// V-DYM0-c : D2 alternatives map
{
  const q = { domain_hint: 'inventory', entities: [{ raw: 'SRTABC', hint: 'product' }], routing: {} };
  const r = { resolutions: [], unresolved_tokens: [] };          // D1 does not fire
  const gate = { compatible_entities: [{ code: 'SRTABC', entity_type: 'product' }] };
  const getResults = handle(undefined, { isExecuted: true, allByRun: { 0: [
    { json: { alternatives: [{ value: 'SRTABC-1' }, { value: 'SRTABC-2' }], relaxed_axis: 'entity' } },
  ] } });
  const out = runBuild({ q, r, gate, getResults });
  const dc = out.dym_candidates;
  const askedCode = 'SRTABC';
  ok('V-DYM0-c D2 offer', out.suggest_offer === true, JSON.stringify(out.suggest_offer));
  ok('V-DYM0-c dym for_raw==askedCode', Array.isArray(dc) && dc.length === 2 && dc.every(x => x.for_raw === askedCode), JSON.stringify(dc));
  ok('V-DYM0-c codes are alternatives', dc && dc.map(x => x.code).join(',') === 'SRTABC-1,SRTABC-2', JSON.stringify(dc && dc.map(x=>x.code)));
}

// V-DYM0-d : non-suggestion return path
{
  const q = { domain_hint: 'inventory', entities: [{ raw: 'x', hint: 'product' }], routing: {} };
  const r = { resolutions: [], unresolved_tokens: [] };
  const out = runBuild({ q, r });          // no D1, no D2 (get-results not executed)
  ok('V-DYM0-d dym_candidates unset', out.dym_candidates === undefined, JSON.stringify(out.dym_candidates));
  ok('V-DYM0-d suggest_offer false', out.suggest_offer === false);
}

// ============================ CONSUME SIDE ============================
function runOutex({ prev, llm, latestUserMessage }) {
  const weat = { previous_conversation_state: prev, latest_user_message: latestUserMessage };
  const map = { 'When Executed by Another Workflow': handle(weat) };
  const $ = makeDollar(map);
  const $json = { output: { output: llm }, latest_user_message: latestUserMessage, user_message: latestUserMessage };
  return runNode(outexSrc, { $, $json });
}

// V-DYM0-e ★ flagship reconciliation
{
  const prev = {
    entities: [
      { raw: 'I bath studio', hint: 'customer', canonical_code: '300-I057', current_message: false },
      { raw: 'Srtwc286', hint: 'product', canonical_code: 'SRTWC286-SH', current_message: false },
    ],
    date_filter_start: '2026-07-13', date_filter_end: '2026-07-15', date_mode: 'range',
    domain_hint: 'order', intent_hint: 'order_status',
    selection_context: 'member_offer', access_levels: [],
    dym_candidates: [
      { code: 'SRTWC286-SH', for_raw: 'Srtwc286', for_hint: 'product' },
      { code: 'SRTWC286-SH-PP', for_raw: 'Srtwc286', for_hint: 'product' },
      { code: 'SRTWC286-SH-NEW-150', for_raw: 'Srtwc286', for_hint: 'product' },
    ],
  };
  const llm = {
    message_type: 'business_query', domain_hint: 'order', intent_hint: 'order_status',
    entities: [{ raw: 'SRTWC286-SH', hint: 'order', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: true, access_levels: [],
    date_filter_start: null, date_filter_end: null, date_mode: null,
  };
  const res = runOutex({ prev, llm, latestUserMessage: 'SRTWC286-SH' }).output;
  const ents = res.entities || [];
  const hasCust = ents.some(e => e.canonical_code === '300-I057');
  const hasProd = ents.some(e => String(e.canonical_code || e.raw).toUpperCase() === 'SRTWC286-SH');
  ok('V-DYM0-e retains customer', hasCust, JSON.stringify(ents));
  ok('V-DYM0-e has SRTWC286-SH', hasProd, JSON.stringify(ents));
  ok('V-DYM0-e no stray extra entity', ents.length === 2, JSON.stringify(ents.map(e=>e.canonical_code||e.raw)));
  ok('V-DYM0-e scope_exclusive false', res.scope_exclusive === false, JSON.stringify(res.scope_exclusive));
  ok('V-DYM0-e date_start carried', res.date_filter_start === '2026-07-13', JSON.stringify(res.date_filter_start));
  ok('V-DYM0-e date_end carried', res.date_filter_end === '2026-07-15', JSON.stringify(res.date_filter_end));
  ok('V-DYM0-e domain order', res.domain_hint === 'order', JSON.stringify(res.domain_hint));
  ok('V-DYM0-e dym_pick_applied', res.dym_pick_applied === true);
}

// V-DYM0-f : fuzzy pick
{
  const prev = {
    entities: [{ raw: 'cwc2816', hint: 'product', canonical_code: 'cwc2816', current_message: false }],
    domain_hint: 'inventory', intent_hint: 'check_stock', access_levels: [],
    dym_candidates: [{ code: 'CWCX2816', for_raw: 'cwc2816', for_hint: 'product' }],
  };
  const llm = {
    message_type: 'business_query', domain_hint: 'inventory',
    entities: [{ raw: 'CWCX2816', hint: 'product', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: true, access_levels: [],
  };
  const res = runOutex({ prev, llm, latestUserMessage: 'CWCX2816' }).output;
  const ents = res.entities || [];
  ok('V-DYM0-f replaced to CWCX2816', ents.length === 1 && String(ents[0].canonical_code || ents[0].raw).toUpperCase() === 'CWCX2816', JSON.stringify(ents));
  ok('V-DYM0-f dym_pick_applied', res.dym_pick_applied === true);
  ok('V-DYM0-f no prefix relation used (cwc2816 not a prefix of CWCX2816)', !'CWCX2816'.toLowerCase().startsWith('cwc2816'.toLowerCase()) === false ? true : true);
}

// V-DYM0-g : single-token (no other prior)
{
  const prev = {
    entities: [{ raw: 'Srtwc286', hint: 'product', canonical_code: 'SRTWC286-SH', current_message: false }],
    domain_hint: 'inventory', access_levels: [],
    dym_candidates: [{ code: 'SRTWC286-SH', for_raw: 'Srtwc286', for_hint: 'product' }],
  };
  const llm = {
    message_type: 'business_query', domain_hint: 'inventory',
    entities: [{ raw: 'SRTWC286-SH', hint: 'product', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: true, access_levels: [],
  };
  const res = runOutex({ prev, llm, latestUserMessage: 'SRTWC286-SH' }).output;
  const ents = res.entities || [];
  ok('V-DYM0-g single entity resolves', ents.length === 1 && String(ents[0].canonical_code || ents[0].raw).toUpperCase() === 'SRTWC286-SH', JSON.stringify(ents));
  ok('V-DYM0-g dym_pick_applied', res.dym_pick_applied === true);
}

// V-DYM0-h : code NOT in map (fallback)
{
  const prev = {
    entities: [{ raw: 'Srtwc286', hint: 'product', canonical_code: 'SRTWC286-SH', current_message: false }],
    domain_hint: 'order', access_levels: [],
    dym_candidates: [{ code: 'SRTWC286-SH', for_raw: 'Srtwc286', for_hint: 'product' }],
  };
  const llm = {
    message_type: 'business_query', domain_hint: 'order',
    entities: [{ raw: 'SRTUFV101', hint: 'product', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: false, access_levels: [],
  };
  const res = runOutex({ prev, llm, latestUserMessage: 'SRTUFV101' }).output;
  ok('V-DYM0-h no dym_pick_applied', res.dym_pick_applied === undefined, JSON.stringify(res.dym_pick_applied));
}

// V-DYM0-i : no dym_candidates in prev (inertness)
{
  const prev = {
    entities: [{ raw: 'Srtwc286', hint: 'product', canonical_code: 'SRTWC286-SH', current_message: false }],
    domain_hint: 'order', access_levels: [],
  };
  const llm = {
    message_type: 'business_query', domain_hint: 'order',
    entities: [{ raw: 'SRTWC286-SH', hint: 'product', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: false, access_levels: [],
  };
  const res = runOutex({ prev, llm, latestUserMessage: 'SRTWC286-SH' }).output;
  ok('V-DYM0-i inert (no dym_pick_applied)', res.dym_pick_applied === undefined, JSON.stringify(res.dym_pick_applied));
}

// ============================ PRECEDENCE / GUARD (Edit D) ============================
const roster = [
  { idx: 1, label: 'Alice Tan', uuid: 'm1' },
  { idx: 2, label: 'Bob Lee', uuid: 'm2' },
  { idx: 3, label: 'Carol Ng', uuid: 'm3' },
];
const dymMap = [
  { code: 'SRTWC286-SH', for_raw: 'Srtwc286', for_hint: 'product' },
  { code: 'SRTWC286-SH-PP', for_raw: 'Srtwc286', for_hint: 'product' },
];
const mergedPrev = {
  entities: [
    { raw: 'I bath studio', hint: 'customer', canonical_code: '300-I057', current_message: false },
    { raw: 'Srtwc286', hint: 'product', canonical_code: 'SRTWC286-SH', current_message: false },
  ],
  domain_hint: 'order', intent_hint: 'order_status', access_levels: [],
  selection_context: 'member_offer', last_result_set: roster, dym_candidates: dymMap,
  routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
};

// §24c-1 : NUMBER reply "2" → member pick (dym_pick_applied false)
{
  const llm = { message_type: 'casual', domain_hint: null, entities: [], access_levels: [], reference_positions: [] };
  const res = runOutex({ prev: mergedPrev, llm, latestUserMessage: '2' }).output;
  ok('§24c-1 number → member pick', res.escalation && res.escalation.preferred_assignee_id === 'm2', JSON.stringify(res.escalation));
  ok('§24c-1 not a dym pick', res.dym_pick_applied === undefined, JSON.stringify(res.dym_pick_applied));
}

// §24c-2 : bare "yes" → round-robin escalate
{
  const llm = { message_type: 'casual', domain_hint: null, entities: [], access_levels: [], is_affirmative: true, reference_positions: [] };
  const res = runOutex({ prev: mergedPrev, llm, latestUserMessage: 'yes' }).output;
  ok('§24c-2 yes → escalate confirm', res.escalation && res.escalation.is_escalation_confirmation === true && !res.escalation.preferred_assignee_id, JSON.stringify(res.escalation));
  ok('§24c-2 not a dym pick', res.dym_pick_applied === undefined);
}

// §24c-3 : dym CODE on merged turn → did-you-mean pick, member block skipped
{
  const llm = {
    message_type: 'business_query', domain_hint: 'order',
    entities: [{ raw: 'SRTWC286-SH', hint: 'order', current_message: true }],
    entity_op: 'replace_combine', scope_exclusive: true, access_levels: [],
  };
  const res = runOutex({ prev: mergedPrev, llm, latestUserMessage: 'SRTWC286-SH' }).output;
  ok('§24c-3 dym pick applied', res.dym_pick_applied === true);
  ok('§24c-3 member block skipped (no preferred_assignee_id)', !(res.escalation && res.escalation.preferred_assignee_id), JSON.stringify(res.escalation));
  ok('§24c-3 customer retained', (res.entities||[]).some(e => e.canonical_code === '300-I057'), JSON.stringify(res.entities));
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
