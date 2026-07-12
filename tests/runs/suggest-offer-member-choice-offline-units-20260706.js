const fs = require('fs');
const SP = '/private/tmp/claude-501/-Users-tehjayson-Documents-foundryx-sorento-crm-n8n/05221fba-a638-4724-9d79-020d085edebd/scratchpad';
const codeBody = fs.readFileSync(SP + '/build-suggest-offer.js', 'utf8');
const buildFn = new Function('$input', '$', codeBody);

// ---- mock n8n context factory ----
function mkCtx({ base, q, resolve, gate, getResultsRuns }) {
  const $input = { first: () => ({ json: base || {} }) };
  const nodes = {
    "Call 'sub-query-reformulator'": { first: () => ({ json: { output: q || {} } }) },
    "resolve-entity": { first: () => ({ json: resolve || {} }) },
    "disallowed-entity-gate": { first: () => ({ json: gate || {} }) },
    "Call 'sub-get-results'": {
      isExecuted: Array.isArray(getResultsRuns) && getResultsRuns.length > 0,
      all: (outIdx, runIdx) => {
        if (!getResultsRuns || runIdx >= getResultsRuns.length) return [];
        return getResultsRuns[runIdx].map(j => ({ json: j }));
      },
    },
  };
  const $ = (name) => {
    if (!nodes[name]) throw new Error('no node ' + name);
    return nodes[name];
  };
  return { $input, $ };
}

function run(cfg) {
  const { $input, $ } = mkCtx(cfg);
  return buildFn($input, $);
}

let pass = 0, fail = 0;
const results = [];
function assert(name, cond, detail) {
  (cond ? pass++ : fail++);
  results.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  :: ' + detail : ''));
}

// ===== §V0-a  CS/order date offer -> dates ONLY =====
{
  const o = run({
    base: { some: 'notfound' },
    q: { domain_hint: 'order', routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
         entities: [{ hint: 'customer', raw: 'ABC Trading' }], date_filter_start: '2026-07-05' },
    getResultsRuns: [[{ alternatives: [{ value: '2026-07-08', display: 'Tue 08 Jul' }, { value: '2026-07-10', display: 'Thu 10 Jul' }], relaxed_axis: 'date' }]],
  });
  assert('V0a suggest_offer===true', o.suggest_offer === true, String(o.suggest_offer));
  assert('V0a quick_reply dates ONLY (no YES/NO)', o.suggest_quick_reply === '2026-07-08,2026-07-10', JSON.stringify(o.suggest_quick_reply));
  assert('V0a response has "No delivery on"', /No delivery on/.test(o.suggest_response||''), '');
  assert('V0a response has escalate offer', /would you like me to escalate/.test(o.suggest_response||''), '');
  assert('V0a last_result_set len 2 w/ date values', Array.isArray(o.suggest_last_result_set) && o.suggest_last_result_set.length===2 && o.suggest_last_result_set[0].value==='2026-07-08' && o.suggest_last_result_set[1].value==='2026-07-10', JSON.stringify(o.suggest_last_result_set));
}

// ===== §V0-b  NON-CS (warehouse) date offer -> buttons retained =====
{
  const o = run({
    base: {},
    q: { domain_hint: 'order', routing: { suggested_team: 'warehouse', suggested_agent: 'general_enquiries' },
         entities: [{ hint: 'customer', raw: 'ABC Trading' }], date_filter_start: '2026-07-05' },
    getResultsRuns: [[{ alternatives: [{ value: '2026-07-08', display: 'Tue 08 Jul' }, { value: '2026-07-10', display: 'Thu 10 Jul' }], relaxed_axis: 'date' }]],
  });
  assert('V0b quick_reply dates + buttons (comma-stripped)', o.suggest_quick_reply === "2026-07-08,2026-07-10,Yes escalate,No it's okay", JSON.stringify(o.suggest_quick_reply));
}

// ===== §V0-c  D1 did-you-mean product -> buttons byte-identical =====
{
  const o = run({
    base: {},
    q: { domain_hint: 'inventory', routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
         entities: [{ hint: 'product', raw: 'cwcx605rl' }] },
    resolve: { resolutions: [{ token: 'cwcx605rl', resolved: false,
      matches: [{ canonical_code: 'CWCX605-RL', match_tier: 'prefix', entity_type: 'product' }], alternatives: [] }] },
  });
  assert('V0c D1 quick_reply starts CWCX605-RL + keeps buttons', o.suggest_quick_reply === "CWCX605-RL,Yes escalate,No it's okay", JSON.stringify(o.suggest_quick_reply));
  assert('V0c D1 suggest_offer true', o.suggest_offer === true, '');
}

// ===== §V0-d  D2 non-date (entity axis), non-CS -> buttons retained =====
{
  const o = run({
    base: {},
    q: { domain_hint: 'inventory', routing: { suggested_team: 'warehouse', suggested_agent: 'general_enquiries' },
         entities: [{ hint: 'product', raw: 'SRTWC287' }] },
    getResultsRuns: [[{ alternatives: [{ value: 'SRTWC287-BL' }, { value: 'SRTWC287-WH' }], relaxed_axis: 'entity' }]],
  });
  assert('V0d D2 non-date ends w/ buttons', /Yes escalate,No it's okay$/.test(o.suggest_quick_reply||''), JSON.stringify(o.suggest_quick_reply));
}

// ===== §V0-d2 (deviation guard C.1): D2 non-date but CS/order -> STILL keeps buttons =====
{
  const o = run({
    base: {},
    q: { domain_hint: 'order', routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
         entities: [{ hint: 'product', raw: 'SRTWC287' }] },
    getResultsRuns: [[{ alternatives: [{ value: 'SRTWC287-BL' }, { value: 'SRTWC287-WH' }], relaxed_axis: 'entity' }]],
  });
  assert('V0d2 D2 non-date CS/order STILL keeps buttons (axis guard)', o.suggest_quick_reply === "SRTWC287-BL,SRTWC287-WH,Yes escalate,No it's okay", JSON.stringify(o.suggest_quick_reply));
}

// ===== §V0-a control: CS but agent!=order_enquiries date offer -> keeps buttons =====
{
  const o = run({
    base: {},
    q: { domain_hint: 'order', routing: { suggested_team: 'customer_service', suggested_agent: 'general_enquiries' },
         entities: [{ hint: 'customer', raw: 'ABC' }], date_filter_start: '2026-07-05' },
    getResultsRuns: [[{ alternatives: [{ value: '2026-07-08', display: 'Tue 08 Jul' }], relaxed_axis: 'date' }]],
  });
  assert('V0a-ctrl CS non-order_enquiries date keeps buttons', /Yes escalate,No it's okay$/.test(o.suggest_quick_reply||''), JSON.stringify(o.suggest_quick_reply));
}

// ===== §V0b  divert-suggest-yes condition unit =====
function divert(o) {
  const e = o.escalation || {}; const r = o.routing || {};
  return e.is_escalation_confirmation === true
    && o.suggest_pick_context === true
    && r.suggested_team === 'customer_service'
    && r.suggested_agent === 'order_enquiries'
    && !e.preferred_assignee_id;
}
const M_suggest_yes = { escalation: { is_escalation_confirmation: true }, suggest_pick_context: true, routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' } };
const M_member_pick = { escalation: { is_escalation_confirmation: true, preferred_assignee_id: 'u-lee' }, member_pick_context: true, routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' } };
const M_wh_retarget = { escalation: { is_escalation_confirmation: true, retarget_team: true }, member_pick_context: true, routing: { suggested_team: 'warehouse', suggested_agent: 'general_enquiries' } };
const M_nonCS_yes  = { escalation: { is_escalation_confirmation: true }, suggest_pick_context: true, routing: { suggested_team: 'purchasing', suggested_agent: 'incoming_stock_enquiries' } };
const M_member_bare_yes = { escalation: { is_escalation_confirmation: true }, member_pick_context: true, routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' } };
assert('V0b divert TRUE for M-suggest-yes', divert(M_suggest_yes) === true, String(divert(M_suggest_yes)));
assert('V0b divert FALSE for M-member-pick', divert(M_member_pick) === false, String(divert(M_member_pick)));
assert('V0b divert FALSE for M-warehouse-retarget', divert(M_wh_retarget) === false, String(divert(M_wh_retarget)));
assert('V0b divert FALSE for M-nonCS-suggest-yes', divert(M_nonCS_yes) === false, String(divert(M_nonCS_yes)));
assert('V0b divert FALSE for member-bare-yes (no suggest_pick_context)', divert(M_member_bare_yes) === false, String(divert(M_member_bare_yes)));

console.log(results.join('\n'));
console.log(`\n==== ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
