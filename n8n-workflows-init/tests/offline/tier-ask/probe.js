#!/usr/bin/env node
// ── tier-ask offline probe (access-tier-ask-plan.md §4 / tests/uac/TA.md) ────────────────
// Exercises the REAL node bodies (this dir; OFFLINE_NODES_DIR overrides for mutate.sh) with
// fixtures derived from REAL executions (LESSONS §64):
//   live exec 12031183  — promotion turn: 7-name entitlement, 6-answer validator envelope,
//                          resolver output for SRTBF11710
//   fork  exec 12032634 — parser parent_input + raw AI string (real prior-state shape)
// RED-first: this probe was run against the PRE-change bodies (export copies) and shown red
// before the new bodies were written; mutate.sh keeps each family falsifiable.
//
// BLIND SPOT: asserts producer-node objects. The customer-boundary check (rendered reply +
// sendmsg payload on a live-run) is the tester's, per TA.md.
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = process.env.OFFLINE_NODES_DIR || __dirname;
const body = {};
for (const f of ['tier-gate.js', 'access-level-choice-message.js', 'compile-current-state.js',
                 'promo-picker.js', 'disallowed-entity-gate.js', 'output_exchange.js',
                 'semantic-input.expr.js']) {
  body[f] = fs.readFileSync(path.join(DIR, f), 'utf8');
}
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));
const mapperSrc = fs.readFileSync(path.join(__dirname, '..', 'access-tier', 'mapper.js'), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));

const checks = [];
const ck = (id, d, p, x) => checks.push({ id, d, p, x: typeof x === 'string' ? x : JSON.stringify(x) });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── shared vm runner ──────────────────────────────────────────────────────────
// $ stubs: nodes map name -> { json } (isExecuted true) ; anything else isExecuted:false.
function makeCtx({ nodes = {}, inputJson = {}, json = undefined, execId = 'offline-test' }) {
  const $ = (name) => {
    if (Object.prototype.hasOwnProperty.call(nodes, name)) {
      const v = nodes[name];
      return { isExecuted: true, first: () => ({ json: v }), item: { json: v } };
    }
    return { isExecuted: false, first: () => { throw new Error(`node '${name}' not executed`); },
             item: { json: {} } };
  };
  return vm.createContext({
    $, $input: { first: () => ({ json: inputJson }) }, $json: json !== undefined ? json : inputJson,
    $execution: { id: execId },
    console, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp, Error, Date,
  });
}
function runBody(file, opts) {
  const ctx = makeCtx(opts);
  return vm.runInContext(`(function(){${body[file]}\n})()`, ctx);
}

// ── EB — the mapper bytes are EMBEDDED, not rewritten (source of truth gate) ──
{
  const slice = (name) => {
    const m = mapperSrc.match(new RegExp(`function ${name}\\([^]*?\\n\\}\\n`));
    if (!m) throw new Error(`cannot slice ${name} from mapper.js`);
    return m[0];
  };
  const constLine = (name) => {
    const m = mapperSrc.match(new RegExp(`const ${name} = [^\\n]*\\n`));
    if (!m) throw new Error(`cannot slice const ${name}`);
    return m[0];
  };
  for (const fn of ['parseLevel', 'mapEntitlement', 'recompose', 'needsTierAsk']) {
    ck(`EB-tg-${fn}`, `tier-gate embeds mapper.js ${fn} byte-exact`, body['tier-gate.js'].includes(slice(fn)), fn);
  }
  ck('EB-tg-BRANDS', 'tier-gate embeds the BRANDS const byte-exact', body['tier-gate.js'].includes(constLine('BRANDS')), 'BRANDS');
  for (const fn of ['parseLevel', 'statedTiers', 'statedBrands']) {
    ck(`EB-ox-${fn}`, `output_exchange embeds mapper.js ${fn} byte-exact`, body['output_exchange.js'].includes(slice(fn)), fn);
  }
  ck('EB-ox-TIER_WORDS', 'output_exchange embeds the TIER_WORDS const byte-exact', body['output_exchange.js'].includes(constLine('TIER_WORDS')), 'TIER_WORDS');
}

// ── TG — tier-gate (ask trigger D2 + recomposition §3) ────────────────────────
function runTG({ names = FX.entitled_all, qf = {} }) {
  const parser = Object.assign(clone(FX.parser_promo_fresh), qf);
  return runBody('tier-gate.js', {
    inputJson: { name: clone(names) },
    nodes: { "Call 'sub-query-reformulator'": { output: parser } },
  });
}
// D9/D11 round-trip: run the REAL parser body, feed its output to the REAL tier-gate body.
// End-to-end across the sub boundary is the only place the "brand survives normalisation" and
// "a pick suppresses the ask" claims are actually decided — a tier-gate-only assertion would
// pass on a hand-passed query_brands the parser never emits.
function runParserThenTG({ msg, prev, llm, names = FX.entitled_all }) {
  const out = runOX({ msg, prev: clone(prev), llmRaw: clone(llm) });
  return { parser: out, gate: runBody('tier-gate.js', {
    inputJson: { name: clone(names) },
    nodes: { "Call 'sub-query-reformulator'": { output: out } },
  }) };
}
{
  const o = runTG({});
  ck('TG-1a', 'multi-tier + nothing stated -> ASK (tier_proceed false)', o.tier_proceed === false && o.tier_ask === true, o);
  ck('TG-1b', 'entitled tiers derived from the 7 real names', eq(o.entitled_tiers, ['dealer', 'office', 'end_user']), o.entitled_tiers);
  ck('TG-1c', 'name[] passes through for the choice renderer', Array.isArray(o.name) && o.name.length === 7, o.name);
}
{
  const o = runTG({ qf: { access_levels: ['dealer'] } });
  ck('TG-2a', 'stated tier -> proceed, no ask', o.tier_proceed === true && o.tier_ask === false, o);
  ck('TG-2b', 'recomposed = every entitled *Dealer name (tier, no brand -> all entitled brands)',
     eq(o.access_levels_recomposed, ['Cabana Dealer', 'Mocha Dealer', 'Sorento Dealer']), o.access_levels_recomposed);
}
{
  const o = runTG({ names: ['End User'] });
  ck('TG-3', 'single-tier contact -> silent (proceed, End User applied)',
     o.tier_proceed === true && o.tier_ask === false && eq(o.access_levels_recomposed, ['End User']), o);
}
{
  const o = runTG({ names: [] });
  ck('TG-4', 'zero entitlement -> the no-access lane keeps If4 FALSE without an ask',
     o.tier_proceed === false && o.tier_ask === false, o);
}
{
  const o = runTG({ qf: { access_levels: ['dealer'], entities: [
    { raw: 'Cabana', hint: 'brand', current_message: true },
    { raw: 'CBS212-WH', hint: 'product', current_message: true }] } });
  ck('TG-5', 'tier x named brand -> the one compound (TA-10)', eq(o.access_levels_recomposed, ['Cabana Dealer']) && eq(o.query_brands, ['cabana']), o);
}
{
  const o = runTG({ names: ['Sorento Dealer', 'End User'], qf: { access_levels: ['dealer'], entities: [{ raw: 'Cabana', hint: 'brand', current_message: true }] } });
  ck('TG-6', 'brand gate FAIL-CLOSED: unheld brand -> [] + brand_gate_empty, never a silent widen (TA-11)',
     eq(o.access_levels_recomposed, []) && o.brand_gate_empty === true, o);
}
{
  const o = runTG({ names: ['End User'], qf: { access_levels: ['office'] } });
  ck('TG-7', 'stated-but-unheld tier -> Q23 fallback to the REAL entitlement (TA-9)',
     o.tier_proceed === true && eq(o.access_levels_recomposed, ['End User']) && eq(o.tier_stated, ['office']) && o.brand_gate_empty === false, o);
}
{
  const o = runTG({ qf: { access_levels: ['Sorento Dealer'] } });
  ck('TG-8', 'legacy compound stated value still maps to its tier (parseLevel)', eq(o.tier_stated, ['dealer']) && o.tier_proceed === true, o);
}
{
  const o = runTG({ names: ['Platinum VIP'] });
  ck('TG-9', 'unmappable entitlement -> legacy full passthrough, no ask, NO invention',
     o.tier_proceed === true && eq(o.access_levels_recomposed, ['Platinum VIP']) && eq(o.entitled_unknown, ['Platinum VIP']), o);
}
{
  const o = runTG({ qf: { domain_hint: 'inventory' } });
  ck('TG-10', 'non-promotion domain never asks (defensive; A4)', o.tier_ask === false && o.tier_proceed === true, o);
}

// ── CM — access-level-choice-message (tier ask renderer, D1/D3) ───────────────
function runCM(tg) {
  return runBody('access-level-choice-message.js', {
    inputJson: tg,
    nodes: { "Call 'sub-query-reformulator'": { output: clone(FX.parser_promo_fresh) } },
  });
}
{
  const o = runCM(runTG({}));
  const want = 'Which access level do you need?\n1. Office\n2. Dealer\n3. End user\nReply with the number(s) — e.g. "1", "1 and 2", or "all".';
  ck('CM-1a', 'ask wording is EXACTLY the plan journey row 1 string', o.escalate_message === want, o.escalate_message);
  ck('CM-1b', 'D3: NO quick-reply buttons (quick_reply empty)', o.quick_reply === '', o.quick_reply);
  ck('CM-1c', 'roster rows carry the TIER TOKEN as value (parser resolves numbers to tiers, never entities)',
     eq(o.tier_last_result_set, FX.prior_tier_offer.last_result_set), o.tier_last_result_set);
  ck('CM-1d', 'is_clarification + tier_offer flags set', o.is_clarification === true && o.tier_offer === true, o);
}
{
  const o = runCM(runTG({ names: ['Sorento Dealer', 'End User'] }));
  ck('CM-2a', '2-tier contact gets 2 options, RENUMBERED (plan §4)',
     o.escalate_message.includes('1. Dealer\n2. End user') && !o.escalate_message.includes('Office'), o.escalate_message);
  ck('CM-2b', '2-tier roster idx contiguous with the right tiers',
     eq((o.tier_last_result_set || []).map(r => [r.idx, r.tier]), [[1, 'dealer'], [2, 'end_user']]), o.tier_last_result_set);
}
{
  const o = runCM(runTG({ names: [] }));
  ck('CM-3', 'zero entitlement -> the no-access message, no roster, no buttons',
     /no access levels configured/.test(o.escalate_message) && !o.tier_offer && o.quick_reply === '', o.escalate_message);
}

// ── CCS — compile-current-state (tier_offer arm + D4 non-persistence) ─────────
function runCCS({ nodes = {}, qf = clone(FX.parser_promo_fresh), inputJson = {} }) {
  return runBody('compile-current-state.js', {
    inputJson,
    nodes: Object.assign({
      "Call 'sub-query-reformulator'": { output: qf },
      'sorento-sub-respond-findcontact-respond': { id: 437264483 },
    }, nodes),
  });
}
{
  const cm = runCM(runTG({}));
  const o = runCCS({ nodes: {
    'escalate-catalog': { response: cm.escalate_message, manualResponse: true, includeResponse: true },
    'access-level-choice-message': cm,
  } });
  ck('CCS-1a', 'ask turn persists selection_context tier_offer', o.variables.selection_context === 'tier_offer', o.variables.selection_context);
  ck('CCS-1b', 'ask turn persists the tier roster as last_result_set', eq(o.variables.last_result_set, FX.prior_tier_offer.last_result_set), o.variables.last_result_set);
  ck('CCS-1c', 'original query scope (the promotion entity) is carried in state (TA-1)',
     (o.variables.entities || []).some(e => e.raw === 'SRTBF11710'), o.variables.entities);
  ck('CCS-1d', 'D4: tier is NEVER written to session vars (no access_levels key)',
     !('access_levels' in o.variables) && !('tier' in o.variables), Object.keys(o.variables).join(','));
  ck('CCS-1e', 'no quick-reply buttons ride the ask (D3)', o.quick_reply === null || o.quick_reply === undefined, o.quick_reply);
  ck('CCS-1f', 'the customer reads the ask text', o.user_response === cm.escalate_message, o.user_response);
}
{
  // TA-14 precedence: a member offer built THIS turn must shadow the tier arm
  const cm = runCM(runTG({}));
  const o = runCCS({ nodes: {
    'escalate-catalog': { response: 'x', manualResponse: true, includeResponse: true },
    'access-level-choice-message': cm,
    'build-cs-member-offer': { response: 'pick a member', manualResponse: true, includeResponse: true,
      selection_context: 'member_offer', cs_last_result_set: [{ idx: 1, label: 'Aina', uuid: 'u-1' }] },
  } });
  ck('CCS-2', 'member_offer shadows tier_offer (tier arm is LOWEST precedence, TA-14)',
     o.variables.selection_context === 'member_offer' && o.variables.last_result_set[0].label === 'Aina', o.variables.selection_context);
}
{
  // no tier offer -> byte-inert arm
  const o = runCCS({ nodes: {
    'central-exchange': { response: 'Previous turn (promotion): returned 6 records' },
    'validator': clone(FX.validator_promo),
  } });
  ck('CCS-3', 'no tier offer -> selection_context untouched by the new arm', o.variables.selection_context !== 'tier_offer', o.variables.selection_context);
}

// ── PP — promo-picker (D5 always-attach; picker list-gate REMOVED) ────────────
function runPP({ inputJson = clone(FX.validator_promo), qf = {}, nodes = {} }) {
  const parser = Object.assign(clone(FX.parser_promo_fresh), qf);
  return runBody('promo-picker.js', {
    inputJson,
    nodes: Object.assign({ "Call 'sub-query-reformulator'": { output: parser } }, nodes),
  });
}
{
  const o = runPP({});
  ck('PP-1a', 'D5: 6 promotions -> ALL 6 files still attached (list-gate removed)', (o.attachments || []).length === 6, `len=${(o.attachments || []).length}`);
  ck('PP-1b', 'roster still published for follow-up numbers (TA-8)', (o.suggest_last_result_set || []).length === 6, o.suggest_last_result_set && o.suggest_last_result_set.length);
  ck('PP-1c', 'selection_context still suggest_offer', o.suggest_selection_context === 'suggest_offer', o.suggest_selection_context);
  ck('PP-1d', 'intro says files are attached, scope echoed', /^I found 6 promotions for SRTBF11710\. I have attached the file\(s\) below\./.test(o.response_intro || ''), o.response_intro);
  ck('PP-1e', 'no pick-invite sentence anywhere (the removed S4 renderer)', !/reply with the number you want/i.test(o.response || ''), (o.response || '').slice(0, 120));
  ck('PP-1f', 'S4b sort survives: latest END DATE first (2026-11-06 rows lead)',
     ((o.answers || [])[0] || { fields: [] }).fields.some(f => f.value === '2026-11-06'), (o.answers || [])[0]);
  ck('PP-1g', 'attachments stay index-paired with the sorted answers',
     (o.attachments || [])[0] && /UPDATED/.test(o.attachments[0].filename), (o.attachments || []).map(a => a.filename)[0]);
  ck('PP-1h', 'response body rebuilt in sorted order', /^1\. \*Promotion:\* UPDATED/m.test(o.response || ''), (o.response || '').split('\n\n')[1]);
  ck('PP-1i', 'freshness stamp survives the rebuild', /_Data last updated:/.test(o.response || ''), (o.response || '').slice(-50));
}
{
  const o = runPP({ nodes: { 'disallowed-entity-gate': { access_notice: "You don't have access to office promotions — here's what you do have:" } } });
  ck('PP-2', 'Q23 notice still leads an always-attach answer', /^You don't have access to office/.test(o.response || ''), (o.response || '').slice(0, 60));
}
{
  const o = runPP({ qf: { reference_positions: [1], _promo_pick_scope_reused: true } });
  ck('PP-3', 'vestigial positional-pick lane STAYS (old sessions): pick 1 -> exactly 1 file',
     (o.attachments || []).length === 1, `len=${(o.attachments || []).length}`);
}
{
  // strict not-found (disjoint union) is UNTOUCHED
  const R = { tokens: ['Cabana', 'kitchen tap'],
    intersection: [],
    resolutions: [
      { token: 'Cabana', matches: [{ entity_type: 'promotion', canonical_code: 'c-1', display: { description: 'CABANA X' } }] },
      { token: 'kitchen tap', matches: [{ entity_type: 'promotion', canonical_code: 'k-1', display: { description: 'TAP Y' } }] }] };
  const o = runPP({ nodes: { 'resolve-entity': R } });
  ck('PP-4a', 'strict not-found (disjoint) still fires and empties attachments',
     /^No promotion found for Cabana kitchen tap/.test(o.response || '') && (o.attachments || []).length === 0, (o.response || '').slice(0, 80));
  ck('PP-4b', 'and clears the roster (a stray "1" must not pick an invisible row)',
     eq(o.suggest_last_result_set, []) && o.suggest_selection_context === null, o.suggest_selection_context);
}
{
  const one = clone(FX.validator_promo); one.answers = one.answers.slice(0, 1); one.attachments = one.attachments.slice(0, 1);
  const o = runPP({ inputJson: one });
  ck('PP-5', 'single promotion untouched (D2 preserved)', (o.attachments || []).length === 1 && !o.suggest_last_result_set, o.attachments && o.attachments.length);
}

// ── GQ — disallowed-entity-gate Q23 (tier-level held-check + brand notice) ────
function runGQ({ qf = {}, tierGate = undefined, agg = FX.entitled_all }) {
  const parser = Object.assign(clone(FX.parser_promo_fresh), qf);
  const nodes = {
    "Call 'sub-query-reformulator'": { output: parser },
    'resolve-entity': clone(FX.resolver_promo),
  };
  if (agg) nodes['Aggregate'] = { name: clone(agg) };
  if (tierGate) nodes['tier-gate'] = tierGate;
  return runBody('disallowed-entity-gate.js', { inputJson: clone(FX.resolver_promo), nodes });
}
{
  const tg = runTG({ names: ['End User'], qf: { access_levels: ['office'] } });
  const o = runGQ({ qf: { access_levels: ['office'] }, tierGate: tg, agg: ['End User'] });
  ck('GQ-1', 'unheld TIER -> notice names the tier, answer continues at real entitlement (TA-9)',
     o.access_notice === "You don't have access to office promotions — here's what you do have:" && eq(o.access_denied_levels, ['office']), o.access_notice);
}
{
  const tg = runTG({ qf: { access_levels: ['dealer'] } });
  const o = runGQ({ qf: { access_levels: ['dealer'] }, tierGate: tg });
  ck('GQ-2', 'held tier (any *Dealer name held) -> NO notice', o.access_notice === '' && eq(o.access_denied_levels, []), o.access_notice);
}
{
  const tg = runTG({ names: ['Sorento Dealer', 'End User'], qf: { access_levels: ['dealer'], entities: [{ raw: 'Cabana', hint: 'brand', current_message: true }] } });
  const o = runGQ({ qf: { access_levels: ['dealer'] }, tierGate: tg, agg: ['Sorento Dealer', 'End User'] });
  ck('GQ-3', 'brand_gate_empty -> brand notice (TA-11); not-found path prepends it',
     o.access_notice === "You don't have access to cabana promotions." && o.brand_gate_empty === true, o.access_notice);
}
{
  // legacy fallback: tier-gate absent -> exact-name compound check unchanged
  const o = runGQ({ qf: { access_levels: ['Platinum VIP'] }, tierGate: undefined });
  ck('GQ-4', 'tier-gate absent -> legacy exact-name held-check still works',
     /don't have access to Platinum VIP/.test(o.access_notice) && eq(o.access_denied_levels, ['Platinum VIP']), o.access_notice);
}

// ── OX — output_exchange (tier-pick reconciliation + statedTiers port) ────────
function runOX({ msg, prev = clone(FX.prior_tier_offer), llm = {}, llmRaw = undefined, refSet = undefined }) {
  // llmRaw = a verbatim recorded LLM object (preferred); llm = per-key edits on the stock one
  const raw = llmRaw !== undefined ? clone(llmRaw) : Object.assign(JSON.parse(FX.ai_raw_stock), llm);
  const parent = clone(FX.parent_input);
  parent.latest_user_message = msg;
  parent.previous_conversation_state = prev;
  if (refSet !== undefined) parent.referenced_result_set = refSet;
  const r = runBody('output_exchange.js', {
    json: { output: JSON.stringify(raw) },
    nodes: { 'When Executed by Another Workflow': parent },
  });
  return r.output;
}
const CASUAL = { message_type: 'casual', intent_hint: null, domain_hint: null, user_goal: 'replying to the access question', entities: [], routing: { suggested_team: null, suggested_agent: null } };
{
  const o = runOX({ msg: '2', llm: Object.assign({}, CASUAL, { reference_positions: [2], reference_target: 'dym' }) });
  ck('OX-1a', 'tier pick "2" -> access_levels = [\'dealer\'] (TIER tokens, never entities)', eq(o.access_levels, ['dealer']), o.access_levels);
  ck('OX-1b', 'no roster row becomes an entity; the ORIGINAL scope is reused (TA-2)',
     (o.entities || []).length === 1 && o.entities[0].raw === 'SRTBF11710', o.entities);
  ck('OX-1c', 'S5-shaped flag with its OWN name', o._tier_pick_scope_reused === true && o._promo_pick_scope_reused !== true, o._tier_pick_scope_reused);
  ck('OX-1d', 'turn re-runs as a promotion business query', o.domain_hint === 'promotion' && o.message_type === 'business_query' && o.intent_hint === 'check_promotion', [o.domain_hint, o.message_type, o.intent_hint]);
  ck('OX-1e', 'positions consumed (byIdx / S5 must not double-fire)', eq(o.reference_positions, []), o.reference_positions);
}
{
  const o = runOX({ msg: '1 and 2', llm: Object.assign({}, CASUAL, { reference_positions: [] }) });
  ck('OX-2', 'multi-pick "1 and 2" -> office+dealer (digits extracted when the LLM gave none, TA-3)',
     eq(o.access_levels, ['dealer', 'office']), o.access_levels);
}
{
  const o = runOX({ msg: 'all', llm: Object.assign({}, CASUAL, { reference_positions: [], scope_intent: 'broaden' }) });
  ck('OX-3', '"all" -> every offered tier (TA-4)', eq(o.access_levels, ['dealer', 'office', 'end_user']), o.access_levels);
}
{
  const o = runOX({ msg: 'dealer', llm: CASUAL });
  ck('OX-4', 'a tier WORD answers the ask too', eq(o.access_levels, ['dealer']) && o._tier_pick_scope_reused === true, o.access_levels);
}
{
  const o = runOX({ msg: 'Sorento Dealer', llm: CASUAL });
  ck('OX-5', 'compound reply still maps to its tier (parseLevel, S5-class)', eq(o.access_levels, ['dealer']), o.access_levels);
}
{
  // fresh promo query with a tier word -> statedTiers port (TA-5); NOT a pick turn
  const o = runOX({ msg: 'promo for SRTBF11710 dealer', prev: clone(FX.parent_input.previous_conversation_state),
    llm: { message_type: 'business_query', intent_hint: 'check_promotion', domain_hint: 'promotion',
           user_goal: 'trying to check dealer promotions for SRTBF11710', access_levels: [],
           entities: [{ raw: 'SRTBF11710', hint: 'promotion', canonical_code: null, current_message: true, confident: true }] } });
  ck('OX-6a', 'stated tier word -> access_levels [\'dealer\'] deterministically (TA-5)', eq(o.access_levels, ['dealer']), o.access_levels);
  ck('OX-6b', 'not flagged as an ask round-trip', o._tier_pick_scope_reused !== true, o._tier_pick_scope_reused);
}
{
  const o = runOX({ msg: 'harga pengedar untuk SRTBF11710', prev: clone(FX.parent_input.previous_conversation_state),
    llm: { message_type: 'business_query', intent_hint: 'check_promotion', domain_hint: 'promotion', access_levels: [],
           entities: [{ raw: 'SRTBF11710', hint: 'promotion', canonical_code: null, current_message: true, confident: true }] } });
  ck('OX-7', 'Malay tier word (pengedar) maps to dealer', eq(o.access_levels, ['dealer']), o.access_levels);
}
{
  const o = runOX({ msg: 'any promo?', prev: clone(FX.parent_input.previous_conversation_state),
    llm: { message_type: 'business_query', intent_hint: 'check_promotion', domain_hint: 'promotion',
           access_levels: ['Mocha Dealer'], entities: [] } });
  ck('OX-8', 'LLM-emitted COMPOUND access_levels are normalised to tier tokens (d)', eq(o.access_levels, ['dealer']), o.access_levels);
}
{
  // TA-14: member_offer pending -> "2" is a MEMBER pick, tiers untouched
  const prev = clone(FX.parent_input.previous_conversation_state);
  prev.selection_context = 'member_offer';
  prev.last_result_set = [{ idx: 1, label: 'Aina', uuid: 'u-1' }, { idx: 2, label: 'Farid', uuid: 'u-2' }];
  const o = runOX({ msg: '2', prev, llm: Object.assign({}, CASUAL, { reference_positions: [2] }) });
  ck('OX-9a', 'member_offer context: "2" resolves to the MEMBER (tier block never fires, TA-14)',
     o.escalation && o.escalation.preferred_assignee_id === 'u-2', o.escalation);
  ck('OX-9b', 'and access_levels stays empty', eq(o.access_levels || [], []), o.access_levels);
}
{
  // TA-14: suggest_offer (promo roster) pending -> "1" resolves to the promotion ROW, not a tier
  const prev = clone(FX.parent_input.previous_conversation_state);
  prev.selection_context = 'suggest_offer';
  prev.domain_hint = 'promotion'; prev.intent_hint = 'check_promotion';
  prev.entities = clone(FX.prior_tier_offer.entities);
  prev.last_result_set = FX.validator_promo.answers.map((a, i) => ({ idx: i + 1, label: a.title, value: a.title, uuid: null, entity_type: 'promotion', filename: FX.validator_promo.attachments[i].filename }));
  const o = runOX({ msg: '1', prev, llm: Object.assign({}, CASUAL, { reference_positions: [1] }) });
  ck('OX-10', 'suggest_offer context: positional pick keeps the promo lane (scope reuse, no tier)',
     eq(o.access_levels || [], []) && o._tier_pick_scope_reused !== true && o._promo_pick_scope_reused === true, [o.access_levels, o._promo_pick_scope_reused]);
}
{
  const o = runOX({ msg: 'thank you', llm: Object.assign({}, CASUAL, { user_goal: 'thanking' }) });
  ck('OX-11', 'casual under a pending tier ask -> no pick, no scope hijack, offer dies inert (TA-13)',
     o._tier_pick_scope_reused !== true && eq(o.access_levels || [], []) && o.message_type === 'casual', [o.message_type, o.access_levels]);
}
{
  const o = runOX({ msg: 'check stock srtwc286',
    llm: { message_type: 'business_query', intent_hint: 'check_stock', domain_hint: 'inventory', access_levels: [],
           entities: [{ raw: 'srtwc286', hint: 'product', canonical_code: null, current_message: true, confident: true }] } });
  ck('OX-12', 'a NEW query abandons the tier ask (no tier leak into inventory, TA-12)',
     o.domain_hint === 'inventory' && eq(o.access_levels || [], []) && o._tier_pick_scope_reused !== true, [o.domain_hint, o.access_levels]);
}

// ── SI — Call 'sub-get-results' semantic_input (reads tier-gate, single source) ──
function runSI({ nodes }) {
  const ctx = makeCtx({ nodes, inputJson: {} });
  return vm.runInContext(body['semantic-input.expr.js'], ctx);
}
{
  const tg = runTG({ qf: { access_levels: ['dealer'] } });
  const o = runSI({ nodes: {
    "Call 'sub-query-reformulator'": { output: clone(FX.parser_promo_fresh) },
    'tier-gate': tg,
    'sorento-sub-respond-findcontact-respond': { id: 437264483 },
  } });
  ck('SI-1a', 'semantic_input.access_levels = tier-gate recomposition (S2b union replaced)',
     eq(o.access_levels, ['Cabana Dealer', 'Mocha Dealer', 'Sorento Dealer']), o.access_levels);
  ck('SI-1b', 'envelope keys unchanged (contract parity with the old expression)',
     eq(Object.keys(o).sort(), ['access_levels', 'contact_id', 'date_filter_end', 'date_filter_start', 'date_mode', 'domain_hint', 'intent_hint', 'is_active', 'message_type', 'order_status', 'requested_attributes', 'space_id', 'user_goal'].sort()), Object.keys(o));
}
{
  const qf = clone(FX.parser_promo_fresh); qf.access_levels = ['dealer'];
  const o = runSI({ nodes: {
    "Call 'sub-query-reformulator'": { output: qf },
    'sorento-sub-respond-findcontact-respond': { id: 437264483 },
  } });
  ck('SI-2', 'off the promotion lane (tier-gate absent) the parser value passes through',
     eq(o.access_levels, ['dealer']), o.access_levels);
}

// ══ UAC round 1 blockers — D9 / D10 / D11 (plan §1b) ═════════════════════════
// Every case below is built from the verbatim node output of the execution that FAILED,
// so each one is red against the shipped-and-rejected build by construction.

// ── D9 — brand recovered from a COMPOUND stated level (fork exec 12041502) ────
{
  const r = runParserThenTG({ msg: 'cabana dealer promo for CBS212-WH',
    prev: FX.parent_input.previous_conversation_state, llm: FX.ai_raw_cabana_dealer_compound });
  ck('D9-1a', 'compound "Cabana Dealer" still normalises to the tier token', eq(r.parser.access_levels, ['dealer']), r.parser.access_levels);
  ck('D9-1b', 'and its BRAND half is recovered, not discarded (exec 12041502 defect)',
     eq(r.parser.query_brands, ['cabana']), r.parser.query_brands);
  ck('D9-1c', 'tier-gate consumes the parser brand', eq(r.gate.query_brands, ['cabana']), r.gate.query_brands);
  ck('D9-1d', 'recomposition scopes to Cabana Dealer only — no Sorento leak',
     eq(r.gate.access_levels_recomposed, ['Cabana Dealer']), r.gate.access_levels_recomposed);
  ck('D9-1e', 'routing follows the recovered brand (the LLM said cabana; we downgraded it to sorento)',
     r.parser.routing.suggested_team === 'marketing_promotion_cabana', r.parser.routing);
}
{
  // the OTHER phrasing must be unchanged — D9 is a union, not a replacement (TA-10R still passes)
  const r = runParserThenTG({ msg: 'cabana promo for CBS212-WH dealer',
    prev: FX.parent_input.previous_conversation_state,
    llm: Object.assign(clone(FX.ai_raw_cabana_dealer_compound), { access_levels: ['dealer'],
      entities: [{ raw: 'CBS212-WH', hint: 'product', canonical_code: null, current_message: true, confident: true },
                 { raw: 'Cabana', hint: 'brand', canonical_code: null, current_message: true, confident: true }] }) });
  ck('D9-2a', 'entity-sourced brand still works (word order no longer matters)', eq(r.parser.query_brands, ['cabana']), r.parser.query_brands);
  ck('D9-2b', 'and recomposes identically to the compound phrasing', eq(r.gate.access_levels_recomposed, ['Cabana Dealer']), r.gate.access_levels_recomposed);
}
{
  const r = runParserThenTG({ msg: 'cabana dealer promo for CBS212-WH',
    prev: FX.parent_input.previous_conversation_state, llm: FX.ai_raw_cabana_dealer_compound,
    names: ['Sorento Dealer', 'End User'] });
  ck('D9-3', 'compound-stated brand a contact does NOT hold now trips the gate (was silent: exec 12041502)',
     r.gate.brand_gate_empty === true && eq(r.gate.access_levels_recomposed, []), r.gate);
}
{
  const r = runParserThenTG({ msg: 'promo for SRTBF11710',
    prev: FX.parent_input.previous_conversation_state, llm: FX.ai_raw_new_promo_query });
  ck('D9-4', 'no brand anywhere -> query_brands [] and no gate (inert)',
     eq(r.parser.query_brands, []) && r.gate.brand_gate_empty === false, [r.parser.query_brands, r.gate.brand_gate_empty]);
}

// ── D11 — a pending non-tier pick outranks the ask (execs 12041783 / 12041879) ─
{
  const r = runParserThenTG({ msg: '2', prev: FX.prior_suggest_offer, llm: FX.ai_raw_positional_pick });
  ck('D11-1a', 'positional pick vs a suggest_offer roster is flagged pendingPick', r.parser._pending_pick === true, r.parser._pending_pick);
  ck('D11-1b', 'the pick SURVIVES: no tier ask fires (exec 12041783 discarded it)',
     r.gate.tier_ask === false && r.gate.tier_proceed === true, r.gate);
  ck('D11-1c', 'and the promo scope-reuse lane is untouched', r.parser._promo_pick_scope_reused === true, r.parser._promo_pick_scope_reused);
}
{
  const r = runParserThenTG({ msg: 'the august one', prev: FX.prior_suggest_offer, llm: FX.ai_raw_continuation_august });
  ck('D11-2a', 'entity-less continuation is flagged pendingPick (exec 12041879)', r.parser._pending_pick === true, r.parser._pending_pick);
  ck('D11-2b', 'continuation stays a continuation — no re-ask (plan journey row 5)',
     r.gate.tier_ask === false && r.gate.tier_proceed === true, r.gate);
}
{
  // THE BOUND: a NEW query must still re-ask (TA-7/D4) even with a roster pending, or D11
  // silently repeals non-persistence. Same fixture, but the customer named a new scope.
  const r = runParserThenTG({ msg: 'promo for CBS212-WH', prev: FX.prior_suggest_offer, llm: FX.ai_raw_new_promo_query });
  ck('D11-3a', 'a NEW named scope is NOT a pending pick', r.parser._pending_pick !== true, r.parser._pending_pick);
  ck('D11-3b', 'so the ask still fires (TA-7 / D4 non-persistence preserved)', r.gate.tier_ask === true, r.gate.tier_ask);
}
{
  const r = runParserThenTG({ msg: 'promo for CBS212-WH', prev: FX.prior_answered_no_roster, llm: FX.ai_raw_new_promo_query });
  ck('D11-4', 'TA-7 exactly as run (exec 12040890 prev state): ask fires', r.gate.tier_ask === true && r.parser._pending_pick !== true, r.gate.tier_ask);
}
{
  // the tier ask's OWN roster must never count as a pending pick, or the ask could never re-fire
  const r = runParserThenTG({ msg: 'promo for CBS212-WH', prev: FX.prior_tier_offer, llm: FX.ai_raw_new_promo_query });
  ck('D11-5', 'tier_offer is not a "pending non-tier pick"', r.parser._pending_pick !== true, r.parser._pending_pick);
}
{
  // THE discriminating case for the tier_offer exclusion: the customer IGNORES the tier ask and
  // sends an entity-less non-pick. That is not an answer to the ask, so the ask must re-fire —
  // if the tier roster counted as "a pending roster", _pending_pick would suppress it forever
  // and the turn would silently answer at FULL entitlement with the question unanswered.
  const r = runParserThenTG({ msg: 'what about promotions?', prev: FX.prior_tier_offer,
    llm: Object.assign(clone(FX.ai_raw_continuation_august), { user_goal: 'asking about promotions generally' }) });
  ck('D11-8a', 'entity-less non-pick under a PENDING TIER ASK is not a pending pick', r.parser._pending_pick !== true, r.parser._pending_pick);
  ck('D11-8b', 'so the unanswered tier ask re-fires instead of answering at full entitlement',
     r.gate.tier_ask === true && r.gate.tier_proceed === false, r.gate.tier_ask);
}
{
  // defence in depth: tier-gate must also honour the spine-visible pick flags on their own,
  // so a stale/live parser without _pending_pick still cannot discard a pick.
  const o = runTG({ qf: { _promo_pick_scope_reused: true } });
  ck('D11-6a', 'tier-gate suppresses on _promo_pick_scope_reused alone', o.tier_ask === false && o.tier_proceed === true, o.tier_ask);
  const o2 = runTG({ qf: { dym_pick_applied: true } });
  ck('D11-6b', 'and on dym_pick_applied alone', o2.tier_ask === false, o2.tier_ask);
  const o3 = runTG({ qf: { member_pick_context: true } });
  ck('D11-6c', 'and on member_pick_context alone', o3.tier_ask === false, o3.tier_ask);
}
{
  const o = runTG({ qf: { _tier_pick_scope_reused: true, access_levels: ['dealer'] } });
  ck('D11-7', 'the TIER pick turn itself is not treated as a foreign pending pick',
     o.tier_proceed === true && eq(o.tier_stated, ['dealer']), o);
}

// ── D10 — the brand gate fails closed IN n8n (exec 12041565) ──────────────────
{
  const o = runPP({ nodes: { 'disallowed-entity-gate': {
    brand_gate_empty: true, access_notice: "You don't have access to cabana promotions.",
    company_team: 'marketing_promotion_cabana' } } });
  ck('D10-1a', 'brand gate closed -> ZERO attachments, whatever the CRM returned (exec 12041565 sent 6)',
     (o.attachments || []).length === 0, `len=${(o.attachments || []).length}`);
  ck('D10-1b', 'and ZERO answer rows — the answer block is suppressed, not just unattached',
     (o.answers || []).length === 0, `len=${(o.answers || []).length}`);
  ck('D10-1c', 'customer gets the notice', /^You don't have access to cabana promotions\./.test(o.response || ''), (o.response || '').slice(0, 80));
  ck('D10-1d', 'plus an escalation offer routed to the named brand team',
     /Would you like me to escalate to marketing_promotion_cabana team\?/.test(o.response || ''), o.response);
  ck('D10-1e', 'no Sorento filename survives anywhere in the reply',
     !/SORENTO/i.test(o.response || '') && !/\.pdf/i.test(o.response || ''), (o.response || '').slice(0, 200));
  ck('D10-1f', 'roster cleared — a later "1" cannot pick a suppressed row',
     eq(o.suggest_last_result_set, []) && o.suggest_selection_context === null, o.suggest_selection_context);
  ck('D10-1g', 'response_intro suppressed too (it is what the sendmsg caption reads)',
     !/attached the file/i.test(o.response_intro || ''), o.response_intro);
  ck('D10-1h', 'the suppression is recorded for the reviewer/tester', o._brand_gate_closed === true, o._brand_gate_closed);
}
{
  // the fail-closed guard must not depend on the envelope being parseable
  const o = runPP({ inputJson: { attachments: clone(FX.validator_promo.attachments).slice(0, 1) },
    nodes: { 'disallowed-entity-gate': { brand_gate_empty: true, access_notice: 'You don\'t have access to cabana promotions.' } } });
  ck('D10-2', 'unrecognised envelope + closed gate still sends nothing', (o.attachments || []).length === 0, `len=${(o.attachments || []).length}`);
}
{
  const o = runPP({ nodes: { 'disallowed-entity-gate': { brand_gate_empty: false, access_notice: '' } } });
  ck('D10-3', 'gate open -> byte-inert, the D5 answer is unchanged',
     (o.attachments || []).length === 6 && /I have attached the file\(s\) below/.test(o.response_intro || ''), (o.attachments || []).length);
}
{
  // D10 must not swallow the ordinary Q23 tier notice, which still ANSWERS at real entitlement
  const o = runPP({ nodes: { 'disallowed-entity-gate': {
    brand_gate_empty: false, access_notice: "You don't have access to office promotions — here's what you do have:" } } });
  ck('D10-4', 'tier-level Q23 still answers WITH files (only the brand gate closes)',
     (o.attachments || []).length === 6 && /don't have access to office/.test(o.response || ''), (o.attachments || []).length);
}

// ── report ────────────────────────────────────────────────────────────────────
let bad = 0;
for (const c of checks) {
  if (!c.p) bad++;
  console.log(`${c.p ? 'PASS' : 'FAIL'}  ${c.id}  ${c.d}`);
  if (!c.p) console.log(`        ${c.x}`);
}
console.log(`\n${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
