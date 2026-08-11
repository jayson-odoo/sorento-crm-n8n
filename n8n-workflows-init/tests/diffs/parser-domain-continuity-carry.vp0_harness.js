const fs = require('fs');
const SC = '/private/tmp/claude-501/-Users-tehjayson-Documents-foundryx-sorento-crm-n8n/4b4ca0db-c867-43e8-91e0-97708402406e/scratchpad';
const codeBody = fs.readFileSync(SC + '/new_output_exchange.js', 'utf8');
// Wrap the n8n Code-node body (uses top-level `return`) in a function.
const runCode = new Function('$json', '$', codeBody);

function makeOutput(o) {
  // fill defaults the code touches so it won't throw
  return Object.assign({
    message_type: 'business_query', intent_hint: null, domain_hint: null,
    domain_signal: 'none', scope_intent: null, is_affirmative: null,
    user_goal: null, access_levels: [], date_mode: null,
    date_filter_start: null, date_filter_end: null, match_mode: 'and',
    demand_qty: null, entities: [], entity_op: 'replace_combine',
    scope_exclusive: false, requested_attributes: [], contains_flyer: false,
    reference_positions: [], person_mention: null, is_active: null,
    order_status: null, correction: false,
    routing: { suggested_team: null, suggested_agent: null },
    escalation: { is_escalation_confirmation: false },
  }, o);
}
function makeParent(pcs, extra) {
  return Object.assign({
    latest_user_message: '', user_message: '', referenced_result_set: [],
    previous_conversation_state: pcs || {},
  }, extra || {});
}
function run(name, outObj, parentPcs) {
  const $json = { output: { output: makeOutput(outObj) } };
  const parent = makeParent(parentPcs);
  const $ = () => ({ first: () => ({ json: parent }) });
  try {
    const res = runCode($json, $);
    return res.output;
  } catch (e) {
    return { __error: e.message + '\n' + e.stack };
  }
}
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function entHints(o) { return (o.entities || []).map(e => `${e.hint}:${e.raw}`); }

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  -- ${detail}`); }
}

// ── V0-a: reuse-path carry (Edit 2a) ──
console.log('\n=== V0-a reuse-path carry (Edit 2a) ===');
{
  const o = run('V0-a',
    { message_type: 'business_query', entity_op: 'reuse', domain_hint: null,
      domain_signal: 'none', entities: [], intent_hint: null },
    { domain_hint: 'master_products', intent_hint: 'check_product',
      message_type: 'business_query',
      entities: [{ raw: 'SRTBF117', hint: 'product', current_message: false }] });
  if (o.__error) { assert('V0-a no error', false, o.__error); }
  else {
    assert('domain_hint === master_products', o.domain_hint === 'master_products', `got ${o.domain_hint}`);
    assert('domain_reused_entityless === true', o.domain_reused_entityless === true, `got ${o.domain_reused_entityless}`);
    assert('message_type NOT overwritten (business_query)', o.message_type === 'business_query', `got ${o.message_type}`);
    assert('prior product entity survives', entHints(o).includes('product:SRTBF117'), entHints(o).join(','));
    console.log('    diag:', JSON.stringify({domain_hint:o.domain_hint, domain_reused_entityless:o.domain_reused_entityless, ents:entHints(o)}));
  }
}

// ── V0-b ★: inferred-non-null carry OVERRIDES (Edit 2b) ──
console.log('\n=== V0-b ★ inferred-non-null carry OVERRIDES (Edit 2b) ===');
{
  const o = run('V0-b',
    { message_type: 'business_query', entity_op: 'replace_combine',
      domain_hint: 'master_products', domain_signal: 'inferred', intent_hint: 'check_product',
      entities: [{ raw: 'SRTWC286-SH', hint: 'product', current_message: true }] },
    { domain_hint: 'incoming', intent_hint: 'check_incoming', entities: [] });
  if (o.__error) { assert('V0-b no error', false, o.__error); }
  else {
    assert('domain_hint OVERRIDDEN to incoming', o.domain_hint === 'incoming', `got ${o.domain_hint}`);
    assert('domain_inherited_compatible === true', o.domain_inherited_compatible === true, `got ${o.domain_inherited_compatible}`);
    assert('product entity survives blocklist', entHints(o).includes('product:SRTWC286-SH'), entHints(o).join(','));
    assert('NOT master_products (the closed hole)', o.domain_hint !== 'master_products', `got ${o.domain_hint}`);
    console.log('    diag:', JSON.stringify({domain_hint:o.domain_hint, domain_inherited_compatible:o.domain_inherited_compatible, ents:entHints(o)}));
  }
}

// ── V0-c: incompatible = NO carry (charmant guard) ──
console.log('\n=== V0-c incompatible = NO carry (charmant guard) ===');
{
  const o = run('V0-c',
    { message_type: 'business_query', entity_op: 'replace_combine',
      domain_hint: 'order', domain_signal: 'inferred', intent_hint: 'check_order',
      entities: [{ raw: 'charmant hardware', hint: 'customer', current_message: true }] },
    { domain_hint: 'incoming', intent_hint: 'check_incoming', entities: [] });
  if (o.__error) { assert('V0-c no error', false, o.__error); }
  else {
    assert('domain_hint NOT incoming (stays order)', o.domain_hint !== 'incoming', `got ${o.domain_hint}`);
    assert('domain_hint === order', o.domain_hint === 'order', `got ${o.domain_hint}`);
    assert('domain_inherit_blocked === incoming', o.domain_inherit_blocked === 'incoming', `got ${o.domain_inherit_blocked}`);
    assert('customer entity STILL present (not broaden_dropped)', entHints(o).includes('customer:charmant hardware'), entHints(o).join(',') + ' dropped=' + JSON.stringify(o.broaden_dropped));
    console.log('    diag:', JSON.stringify({domain_hint:o.domain_hint, domain_inherit_blocked:o.domain_inherit_blocked, ents:entHints(o), broaden_dropped:o.broaden_dropped}));
  }
}

// ── V0-d: explicit wins (no carry) ──
console.log('\n=== V0-d explicit wins (no carry) ===');
{
  const o = run('V0-d',
    { message_type: 'business_query', entity_op: 'replace_combine',
      domain_hint: 'master_products', domain_signal: 'explicit', intent_hint: 'check_product',
      entities: [{ raw: 'SRTWC286-SH', hint: 'product', current_message: true }] },
    { domain_hint: 'incoming', intent_hint: 'check_incoming', entities: [] });
  if (o.__error) { assert('V0-d no error', false, o.__error); }
  else {
    assert('domain_hint stays master_products', o.domain_hint === 'master_products', `got ${o.domain_hint}`);
    assert('domain_inherited_compatible ABSENT', !has(o, 'domain_inherited_compatible'), `present=${o.domain_inherited_compatible}`);
    assert('domain_inherit_blocked ABSENT', !has(o, 'domain_inherit_blocked'), `present=${o.domain_inherit_blocked}`);
    assert('domain_reused_entityless ABSENT', !has(o, 'domain_reused_entityless'), `present=${o.domain_reused_entityless}`);
    console.log('    diag:', JSON.stringify({domain_hint:o.domain_hint, ents:entHints(o)}));
  }
}

// ── V0-e: prompt-sanitize regex (Edit 1b) ──
console.log('\n=== V0-e prompt sanitize regex (Edit 1b) ===');
{
  const strip = (s) => String(s ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn');
  const c1 = strip('Previous turn (incoming): returned 1 records');
  assert('strips (incoming)', c1 === 'Previous turn: returned 1 records', `got "${c1}"`);
  const c2 = strip('Previous turn (master_products): no results.');
  assert('strips (master_products) underscore', c2 === 'Previous turn: no results.', `got "${c2}"`);
  const c3 = strip('Would you like me to escalate this to our team?');
  assert('escalation-offer unchanged', c3 === 'Would you like me to escalate this to our team?', `got "${c3}"`);
  const c4 = strip('Here are the 3 promotions I found for Sorento.');
  assert('central-exchange response unchanged', c4 === 'Here are the 3 promotions I found for Sorento.', `got "${c4}"`);
  const c5 = strip('');
  assert('empty/null safe', c5 === '', `got "${c5}"`);
}

console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
process.exit(fail === 0 ? 0 : 1);
