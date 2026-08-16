// ── ROUTING DERIVATION (mechanical map; parser emits semantic signals only) ──
function deriveRouting(out) {
  const domain = out.domain_hint;
  const ents = Array.isArray(out.entities) ? out.entities : [];

  // attachment_type discriminator (the cert-vs-photo split within product_attachment)
  const attachTypes = ents
    .filter(e => String(e.hint || '').toLowerCase() === 'attachment_type')
    .map(e => String(e.canonical_code || e.raw || '').toLowerCase());
  // cert-vs-photo discriminator. Fire when EITHER an attachment_type raw names a cert body/word,
  // OR the semantic signal (attachment intent + a cert word in user_goal) says certificate.
  // Brand-named certs (SPAN/SIRIM/BOMBA/MS####/Halal) arrive as attachment_type raw, not "certificate".
  const isCert =
    attachTypes.some(t => /cert|ikram|span|sirim|bomba|ms\s?\d|halal/i.test(t))
    || (out.intent_hint === 'check_product_attachment'
        && /cert|certificate/i.test(String(out.user_goal || '')));

  // brand for promotion routing (entity wins, else access level)
  const brandEnt = ents.find(e => String(e.hint || '').toLowerCase() === 'brand');
  const access = (out.access_levels || []).map(a => String(a).toLowerCase());
  let brand = brandEnt ? String(brandEnt.raw || '').toLowerCase() : null;
  if (!brand) {
    if (access.some(a => a.includes('mocha')))   brand = 'mocha';
    else if (access.some(a => a.includes('cabana'))) brand = 'cabana';
    else if (access.some(a => a.includes('sorento'))) brand = 'sorento';
  }
  // Δ3 fix: clamp to the valid promotion-brand enum; garbled/unknown -> default sorento downstream
  { const _VB = ['sorento','cabana','mocha']; const _b2 = String(brand || '').replace(/[^a-z]/g, ''); brand = _VB.find(v => _b2.includes(v)) || null; }

  switch (domain) {
    case 'master_products':    return { suggested_team: 'purchasing_product', suggested_agent: 'general_enquiries' };
    case 'incoming':           return { suggested_team: 'purchasing',       suggested_agent: 'incoming_stock_enquiries' };
    case 'product_attachment': return isCert
        ? { suggested_team: 'purchasing_certification', suggested_agent: 'general_enquiries' }
        : { suggested_team: 'marketing_product', suggested_agent: 'general_enquiries' };
    case 'forms':              return { suggested_team: 'marketing_form',   suggested_agent: 'marketing_form' };
    case 'inventory':          return { suggested_team: 'warehouse',        suggested_agent: 'general_enquiries' };
    case 'order':              return { suggested_team: 'customer_service',  suggested_agent: 'order_enquiries' };
    case 'promotion':          return { suggested_team: `marketing_promotion_${brand || 'sorento'}`, suggested_agent: 'general_enquiries' };
    // ideate: no CS team (an idea is captured, never escalated) but its OWN access agent, so
    // ideation can be granted/revoked per contact independently of every CRM domain.
    // This is the SINGLE source of truth for the ideate agent: the spine's check-access-http
    // keys on routing.suggested_agent, and the no-access message is rendered from the SAME
    // field — so the denial correctly reads "ideation", not a stale inherited agent.
    // Unknown agents fail CLOSED (deny_unknown_agent) => the CRM must register `ideation`.
    case 'ideate':             return { suggested_team: null, suggested_agent: 'ideation' };
    default:                   return { suggested_team: null,              suggested_agent: null };
  }
}

let output = {};
let parent_input = $('When Executed by Another Workflow').first().json
const norm = (v) => (v === null || v === undefined || v === 'null' || v === '') ? null : v;
if ($json.output && typeof $json.output === 'object') {
  output = $json.output;
} else {
  let raw = String($json.output || '');
  raw = raw.replace(/```[\s\S]*?```/g, match =>
    match.replace(/```json?|\```/g, '')
  );
  const idx = raw.indexOf('{');
  if (idx === -1) {
    output = { output: raw };
    output.quick_reply = $json.quick_reply;
  } else {
    const startSlice = raw.slice(idx);
    const last = startSlice.lastIndexOf('}');
    const cleanSlice = last !== -1 ? startSlice.slice(0, last + 1) : startSlice;
    output.output = JSON.parse(cleanSlice);
  }
}

// ── state-transition monitor: snapshot the RAW LLM object BEFORE any post-processing.
// Everything below this line mutates output.output; this is the only point where the
// pre-code shape still exists. Top-level key only (see plan §B5).
const _parser_raw_snapshot = (() => {
  try { return JSON.parse(JSON.stringify(output.output ?? null)); } catch (e) { return null; }
})();
// ── B2' (carried-certificate-dump) — CARRIED-ENTITY PROVENANCE (plan §3.6 part 3) ─────────────
// "Carried" is derived from PROVENANCE, never from `current_message`. That flag is a proven-corrupted
// signal: applyDymPick re-maps EVERY prior entity to `current_message: true` before the executor runs,
// and block (B) does it again for prior attachment_types (plan §5.1, writers W4 + W7 — observed on
// parser exec 11509876, where all seven carried entities arrived flagged true). The uncorrupted
// this-turn signal is `_parser_raw_snapshot` above: the frozen raw LLM object, captured before any
// mutation. An entity is CARRIED iff it was in prior state and the LLM did not emit it this turn.
const _ceNorm = (v) => String(v ?? '').trim().toLowerCase();
const _ceKey  = (e) => _ceNorm(e && e.hint) + '|' + _ceNorm((e && (e.canonical_code || e.raw)) || '');
const _cePriorKeys = new Set(
  (Array.isArray(parent_input.previous_conversation_state?.entities)
    ? parent_input.previous_conversation_state.entities : []).map(_ceKey));
const _ceLlmKeys = new Set(
  (Array.isArray(_parser_raw_snapshot?.entities) ? _parser_raw_snapshot.entities : []).map(_ceKey));
// Codes minted by applyDymPick THIS TURN are genuine this-turn choices (the customer picked them), so
// they are recorded rather than inferred — a picked code that happens to collide with a prior entity
// key must still count as a contribution. Local variable only: no new output key, no replay-diff noise.
const _ceDymPickedKeys = new Set();
// M2 (immortal-hint-class §2.4) — the SAME record-don't-infer pattern for REFERENCE POSITIONS.
// B2' tested the persisted field `e.ordinal`, which is written once and then lives in session state
// forever, so a positional-pick entity was exempt from eviction for the rest of the session — the
// exact failure shape part 3 was designed to defeat, arriving by a different route. Populated by the
// reference-positions block below, which runs BEFORE the reconciliation pass that reads it.
const _ceRefPickedKeys = new Set();
const _ceIsCarried = (e) => {
  if (!e) return false;
  if (_ceRefPickedKeys.has(_ceKey(e))) return false;   // M2: reference-position pick MINTED THIS TURN
  const _k = _ceKey(e);
  if (_ceDymPickedKeys.has(_k)) return false;     // did-you-mean pick = this-turn selection
  return _cePriorKeys.has(_k) && !_ceLlmKeys.has(_k);
};

// ── §10 follow-up (3) — hoist raw LLM signals + coerce string-"null" hints ──
// (a) Capture the LLM's RAW message_type + routing at the TOP, BEFORE any downstream
//     message_type mutation (the ~L420 decline clobber, the ~L435 domain->business_query
//     clobber, and the position-pick reclassifies). The retarget intent must be immune to
//     ALL of them — reading _reqHelp AFTER a mid-mutation was the row-5 non-determinism bug.
const _llmMsgTypeRaw = output.output.message_type;
const _reqHelp       = _llmMsgTypeRaw === 'request_for_help';
const _llmTeamRaw    = output.output?.routing?.suggested_team;
const _llmAgentRaw   = output.output?.routing?.suggested_agent;
const _llmTeamN      = norm(_llmTeamRaw);
const _llmAgentN     = norm(_llmAgentRaw);
// (b) The LLM occasionally emits the LITERAL STRING "null" for a hint. That is truthy, so it
//     mis-fires the ~L435 domain->business_query clobber (and deriveRouting/blocklist/_isNewQuery).
//     Coerce to real null here so every downstream check reads it correctly. norm() passes real
//     domains through untouched — only "null"/""/undefined become null.
output.output.domain_hint = norm(output.output.domain_hint);
output.output.intent_hint = norm(output.output.intent_hint);

// reuse means "no new value this turn" — but if the parser emitted current entities,
// it contradicts itself. Promote to additive replace_combine so the new value survives.
const _priorEnts0 = Array.isArray(parent_input.previous_conversation_state?.entities) ? parent_input.previous_conversation_state.entities : [];
if (output.output.entity_op === 'reuse' && Array.isArray(output.output.entities) && output.output.entities.length > 0 && (output.output.entities.some(e => e.current_message === true) || _priorEnts0.length === 0)) {
  if (_priorEnts0.length === 0) {
    output.output.entities = output.output.entities.map(e => ({ ...e, current_message: true }));
  }
  output.output.entity_op = 'replace_combine';
  output.output.entity_op_corrected = 'reuse->replace_combine';  // visibility
}

if (output.output.domain_hint === 'resource_attachment') {
  const ents = Array.isArray(output.output.entities) ? output.output.entities : [];
  const hasProduct = ents.some(e => String(e.hint || '').toLowerCase() === 'product');

  if (hasProduct) {
    output.output.domain_hint = 'product_attachment';
    output.output.intent_hint = 'check_product_attachment';
    output.output.domain_corrected = 'resource_attachment->product_attachment (product present)';
  }
}
// ── MENU-LABEL OVERRIDE ──────────────────────────────────────
// Exact menu/button labels are SELECTIONS (→ portal link), not free-text queries.
// Override whatever the LLM guessed when the user message is a known label.
// IMPORTANT: match against the original user message, not the LLM output.
const userMsg = String($json.user_message ?? $json.latest_user_message ?? '').trim().toLowerCase();
const MENU_LABELS = {
  "stock enquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "stock_enquiry" },
  "stock inquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "stock_enquiry" },
  "complaint":       { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "complaint" },
  "price enquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "price_enquiry" },
  // add the rest of your menu options here
};
const menuHit = MENU_LABELS[userMsg];
if (menuHit && output.output) {
  output.output.message_type = "business_query";
  output.output.intent_hint  = menuHit.intent_hint;
  output.output.domain_hint  = menuHit.domain_hint;
  output.output.portal       = menuHit.portal;
  output.output.entities     = [];          // a label has no filter entities
  output.output.is_menu_label = true;        // flag so downstream routes to portal handler
}

// ── FLYER INJECTION (deterministic; parser only flags contains_flyer) ──
// Flyer is a resource-type filter that COEXISTS with brand/category — not a scope
// competitor. Inject it with its own hint so the axis/replace logic never drops it,
// and so it survives the broaden-blocklist.
if (output.output && !output.output.is_menu_label && output.output.contains_flyer === true) {
  const ents = Array.isArray(output.output.entities) ? output.output.entities : [];
  const alreadyHas = ents.some(e => String(e.raw || '').toLowerCase() === 'flyer');
  if (!alreadyHas) {
    ents.push({ raw: 'flyer', hint: 'flyer', current_message: true });  // own hint → own axis
  }
  output.output.entities = ents;
}

// ── DID-YOU-MEAN PICK RECONCILIATION (labeled candidate→token map) ──
// If the prev turn stored dym_candidates and THIS message is a code matching one, RETAIN all prior
// entities, REPLACE only the source token's entity in-place with the picked code, CARRY the prior date,
// and IGNORE the LLM's scope_exclusive + (mis-)hint. Keyed on the EXPLICIT map, never on string/prefix.
// dym-partial-disambiguation v3 (B1): the in-place retention/replacement body is factored into the
// hoisted applyDymPick(_hit,_offer,_priorEnts,_useSlot) so the code-reply path (tryDymPick) AND the
// numbered multi-select handler share ONE retention implementation. tryDymPick calls it with slot
// matching ON (_useSlot=true) — byte-behaviour-identical to before. The numbered handler calls it with
// slot matching OFF so multi-picks ACCUMULATE (R-v3-1 ADD-BOTH), threading the entity set per pick.
function applyDymPick(_hit, _offer, _priorEnts, _useSlot){
  const norm = s => String(s ?? '').trim().toLowerCase();
  const _pv = parent_input.previous_conversation_state || {};
  const _prior = Array.isArray(_priorEnts) ? _priorEnts.map(e=>({ ...e })) : [];
  // dym-single-use-fix: the offer id, stamped onto the picked entity, is a STABLE handle back to the
  // offer. The first pick overwrites the source entity's raw with the picked code, destroying the
  // for_raw linkage; the slot id survives every subsequent pick (code-reply path only — see _useSlot).
  const _slot = (_offer && _offer.id != null) ? _offer.id : null;
  // find WHICH prior entity this suggestion was FOR — tier 0: the stamped dym_slot (survives raw
  // overwrite), then for_raw / for_canonical / unambiguous single-for_hint. Slot-matching is SKIPPED
  // (_useSlot=false) on the numbered multi-select path so a for_raw already consumed THIS turn falls to
  // append (ADD-BOTH), instead of the shared offer id re-hitting the first pick's new entity.
  let _idx = -1;
  if (_useSlot !== false && _slot != null) _idx = _prior.findIndex(e => e && e.dym_slot != null && norm(e.dym_slot) === norm(_slot));
  if (_idx < 0) _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));
  if (_idx < 0 && _hit.for_canonical) _idx = _prior.findIndex(e => norm(e.canonical_code) === norm(_hit.for_canonical));
  if (_idx < 0 && _hit.for_hint) {
    const _sameHint = _prior.filter(e => norm(e.hint) === norm(_hit.for_hint));
    if (_sameHint.length === 1) _idx = _prior.indexOf(_sameHint[0]);   // unambiguous single-hint fallback
  }
  // FORCE the type from the candidate record — entity_type is the PICKED candidate's resolved type;
  // for_hint describes the SOURCE token and only coincidentally matches. Never trust the LLM hint here.
  const _picked = { raw: _hit.code, hint: _hit.entity_type || _hit.for_hint || (_idx>=0 ? _prior[_idx].hint : null),
                    canonical_code: _hit.code, uuid: _hit.uuid || null, current_message: true };
  if (_slot != null) _picked.dym_slot = _slot;   // stamp so tier-0 resolves the NEXT pick (code-reply)
  _ceDymPickedKeys.add(_ceKey(_picked));   // B2' part 3: a did-you-mean pick IS a this-turn choice
  let _final;
  if (_idx >= 0) { _prior[_idx] = _picked; _final = _prior.map(e=>({ ...e, current_message: true })); }
  else { _final = [ _picked, ..._prior.map(e=>({ ...e, current_message: true })) ]; output.output.dym_replace_unmatched = true; }

  output.output.entity_op       = 'replace_combine';
  output.output.scope_exclusive = false;       // IGNORE the LLM's scope_exclusive=true
  output.output.message_type    = 'business_query';
  // carry the prior date window if THIS turn named none
  if (!(output.output.date_filter_start || output.output.date_filter_end)) {
    if (_pv.date_filter_start) output.output.date_filter_start = _pv.date_filter_start;
    if (_pv.date_filter_end)   output.output.date_filter_end   = _pv.date_filter_end;
    if (_pv.date_mode)         output.output.date_mode         = _pv.date_mode;
  }
  output.output.dym_pick_applied = true;       // diagnostic + precedence guard (see §4)
  // let the spine append to picked[] + reset the TTL without re-deriving anything (§3c rule 4)
  output.output.dym_offer_pick_code = _hit.code;
  // ── #5 domain-carry: a CONFIRMED, UNAMBIGUOUS dym pick STAYS in the offer's domain (never a
  // catalogue lookup). STRICT gate (R-DC-1 stricter): force ONLY when the whole user message IS the
  // picked code (bare-code reply) OR the pick came via the numbered/dym-select handler (_useSlot===false,
  // the explicit signal dymNumberedMultiSelect passes; tryDymPick passes _useSlot=true). An offered code
  // embedded in a larger NEW-domain phrase ("promotions for <code>") is norm(code)!==msg AND not numbered
  // → NOT forced → the parser's classified domain passes through (the key regression guard). No-op when
  // the offer stored no domain. Routing is NOT hand-set: deriveRouting (~L649) recomputes it from the
  // forced domain_hint (both pick paths run before deriveRouting).
  const _isBareCode  = norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
  const _viaNumbered = (_useSlot === false);
  if ((_isBareCode || _viaNumbered) && _offer && _offer.domain) {
    output.output.domain_hint            = _offer.domain;              // load-bearing: RAG filter + gate + deriveRouting
    output.output.intent_hint            = _pv.intent_hint ?? null;    // realign to offer intent; drop contaminated check_product
    output.output.dym_pick_domain_forced = _offer.domain;             // diagnostic (drop-when-absent in replay norm())
  }
  return _final;                               // chosen replaces source token in-place; others RETAINED
}
(function tryDymPick(){
  const _prev = parent_input.previous_conversation_state || {};
  // dym-single-use-fix: source candidates from the offer object; fall back to the legacy flat array
  // during the spine↔parser promotion window (an OLD spine writes only dym_candidates).
  const _offer = (_prev.dym_offer && typeof _prev.dym_offer === 'object') ? _prev.dym_offer : null;
  const _cands = (_offer && Array.isArray(_offer.candidates)) ? _offer.candidates
               : (Array.isArray(_prev.dym_candidates) ? _prev.dym_candidates : []);
  if (!_cands.length || !output.output) return;
  const norm = s => String(s ?? '').trim().toLowerCase();
  // FINDING-1 FIX (belt-and-suspenders): a dym pick must be an ENTITY-CODE, never a DATE. Even if a
  // stray date-valued candidate leaks into the map, a date reply must NEVER hijack tryDymPick — it
  // has to fall through to normal date handling (date_filter update + keep entities).
  const _isDateLike = s => { const v = String(s ?? '').trim(); return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(v); };
  // the picked code: the raw user reply (button tap / typed), OR a current-message entity's raw/canonical
  const _msg = norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
  const _curEnts = Array.isArray(output.output.entities) ? output.output.entities.filter(e=>e&&e.current_message===true) : [];
  const _codeMatches = c => !_isDateLike(c.code) && (norm(c.code) === _msg
      || _curEnts.some(e => norm(e.raw)===norm(c.code) || norm(e.canonical_code)===norm(c.code)));
  // NOTE: picked[] is a RECORD, not a filter — re-picking the same code is idempotent, so we do NOT
  // skip codes already in _offer.picked. That is what makes a SECOND pick from the same offer work.
  const _hit = _cands.find(_codeMatches);
  if (!_hit) return;                          // code not in the map → fall through to today's behaviour
  output.output.entities = applyDymPick(_hit, _offer, _prev.entities, true);
})();

// ── REVISION 4: intent-only effective domain signal (de-overfit) ──
// The reliable this-turn signal is the LLM intent_hint. Decisive intents (check_product, check_incoming, …)
// fire ONLY on a real purpose-word classification; bare codes reliably get intent_hint null. Derive the
// effective signal PURELY from intent — no message-stripping heuristic, and no LLM domain_signal field
// (both dropped in rev4). Computed ONCE; BOTH carry gates (reuse-path + entity-bearing) read this shared
// `_explicit`. Carry fires on `!_explicit`.
const _DECISIVE_INTENTS = new Set([
  'check_product','check_incoming','check_promotion','check_order','check_stock',
  'check_goods_receive','check_spo','check_product_attachment',
  'get_forms','get_portal_link','get_resource_attachment',
  // ideate: a proposal is an explicit this-turn signal — it must OVERRIDE a carried CRM
  // domain (else "I have an idea…" right after an order query inherits `order`). The
  // reverse (ideate → bare continuation) still carries, because those turns have no
  // decisive intent and fall through the !_explicit gate below.
  'submit_idea',
]);
const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;
output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none';  // diagnostic

// ── #6: deterministic domain-SWITCH word signal (this-turn-only) ──
// A bare/dominant domain word in the CURRENT message must SWITCH domain, NOT let the continuity
// carry reuse the prior domain (repro exec 10826285: "promo" after a stock turn → stock again).
// Fires ONLY when the LLM gave no decisive domain (!_explicit) AND the message reduces to switch
// word(s) of exactly ONE domain with NO other content token (no code / customer / number). A real
// query ("check stock for X") has a current entity → never reaches this. Whole-word, case-insensitive.
const _DOMAIN_SWITCH_WORDS = {
  // promotion
  promo:'promotion', promos:'promotion', promotion:'promotion', promotions:'promotion', promosi:'promotion',
  // inventory (stock/balance-on-hand)
  stock:'inventory', stocks:'inventory', inventory:'inventory', stok:'inventory', qty:'inventory', quantity:'inventory',
  // order (customer sales orders)
  order:'order', orders:'order', outstanding:'order', tempahan:'order',
  // incoming (inbound shipments / containers)
  incoming:'incoming', eta:'incoming', shipment:'incoming', shipments:'incoming',
  arriving:'incoming', container:'incoming', containers:'incoming',
  // master_products (catalogue / specification)
  catalogue:'master_products', catalog:'master_products', spec:'master_products', specs:'master_products',
  specification:'master_products', specifications:'master_products', dimension:'master_products', dimensions:'master_products',
};
// filler removed before testing "dominant": greeting/politeness/interrogative/BM connectors + generic verbs.
const _SWITCH_FILLER = new Set([
  'the','a','an','for','to','of','on','in','me','my','i','is','are','be','any','some','pls','plz','please',
  'can','could','would','you','u','got','have','has','had','do','does','did','what','whats','how','much','many',
  'check','get','show','give','tell','about','need','want','wanna','see','list','all',
  'ada','untuk','tolong','boleh','nak','saya','ni','tu','ke','yang','dan','ada?','pun','je','ya','ha',
]);
let _switchDomain = null;
if (!_explicit) {
  const _swMsg = String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0].toLowerCase();
  const _swToks = (_swMsg.match(/[a-z0-9]+/g) || []).filter(t => !_SWITCH_FILLER.has(t));
  // defense-in-depth: a current-message entity means this is a real query / entity-bearing continuation
  const _swHasCurEnt = (Array.isArray(output.output.entities) ? output.output.entities : [])
                         .some(e => e && e.current_message === true);
  if (_swToks.length >= 1 && !_swHasCurEnt) {
    const _swDoms = _swToks.map(t => _DOMAIN_SWITCH_WORDS[t] || null);
    // EVERY remaining content token must be a switch word of the SAME domain (a code / customer name is
    // unmapped → null → no fire; a mix of two domains → no fire). This is what enforces "bare/dominant".
    if (_swDoms.every(d => d !== null) && new Set(_swDoms).size === 1) {
      _switchDomain = _swDoms[0];
    }
  }
}


// ── AXIS MAP (hoisted for B2': the op executor AND the post-merge reconciliation pass below must
// classify entities with ONE definition, and the pass needs it at module scope) ──
// axis depends on DOMAIN: in promotion, product/brand/category/flyer all scope "which promotion"
const AXIS_BY_DOMAIN = {
  promotion: {
    brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope',
    flyer: 'promo_scope', product: 'promo_scope',   // ← product joins promo_scope HERE
  },
  master_products: {
    product: 'product_scope', category: 'product_scope', brand: 'product_scope',
  },
  order: {
    order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
    customer: 'order_scope', transporter: 'order_scope', product: 'order_scope',
  },
  incoming: {
    product: 'incoming_scope', inbound_shipment: 'incoming_scope',
    category: 'incoming_scope', brand: 'incoming_scope',
  },
  product_attachment: {
    product: 'product_scope', category: 'product_scope', brand: 'product_scope',
    attachment_type: 'attachment_scope',   // type is its own axis (coexists with product)
    certificate:     'attachment_scope',   // B2' part 1: was `__certificate` -> never evicted (exec 11509873)
    attachment:      'attachment_scope',   // B2' part 1: same class, same hazard
  },
  // …
};

// fallback flat map for hints/domains not covered
const HINT_AXIS_DEFAULT = {
  brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope', flyer: 'promo_scope',
  product: 'product_scope', attachment_type: 'attachment_scope',
  certificate: 'attachment_scope', attachment: 'attachment_scope',   // B2' part 1
  customer: 'order_scope', transporter: 'order_scope', order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
  warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
  inbound_shipment: 'incoming_scope',   // C1: mapped under `incoming` only; fell to __ elsewhere
  grn:              'doc',              // C1: sibling of goods_receive/spo, was unmapped
};

// ── C1 (immortal-hint-class) — AN UNRECOGNISED HINT MUST NEVER GET A PRIVATE AXIS ─────────────
// `__${hint}` produced an island no current-turn entity could ever collide with, so the executor's
// `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))` retained it on EVERY subsequent turn.
// Observed: ('M2399','product_attachment',ordinal:1) surviving six consecutive turns (parser exec
// 11554793) — a DOMAIN name in the entity hint field, minted by the reference-positions block (C2
// fixes the writer; this fixes the class). Same mechanism as the `__certificate` bug B2' fixed BY
// NAME; the class stayed open because the fallback itself was never changed.
//
// Two-step fallback:
//   1. the domain's SUBJECT axis — an unrecognised hint under domain D is, in every observed case,
//      the subject of D's own query (a domain-named hint minted by the reference-positions block is
//      literally that), so it belongs on D's primary axis and evicts normally;
//   2. ONE shared axis for anything left — unknown hints collide with each other rather than each
//      getting an island. Never `__${hint}`.
// Rejected: a single shared 'misc' axis with no domain step — inert on the exact transcript that
// motivated the fix (nothing else that turn carried an unrecognised hint), i.e. "test green, stay
// broken". Rejected: dropping/throwing on an unknown hint — this family is fail-open by contract.
const DOMAIN_SUBJECT_AXIS = {
  product_attachment: 'product_scope', master_products: 'product_scope',
  inventory: 'product_scope', resource_attachment: 'product_scope',
  incoming: 'incoming_scope', promotion: 'promo_scope',
  order: 'order_scope', spo_allocation: 'order_scope',
  goods_receive: 'doc', forms: 'doc', portal_link: 'doc',
};
// Diagnostic so the RESIDUAL unrecognised class is MEASURABLE in production instead of assumed
// empty. Emitted only when non-empty ⇒ drop-when-absent in the replay norm() (LESSONS §40).
const _ceUnknownHints = new Set();
const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  const known = (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint];
  if (known) return known;
  if (hint) _ceUnknownHints.add(hint);
  return DOMAIN_SUBJECT_AXIS[domain] || 'unscoped_scope';
};

// ── ENTITY OPERATION EXECUTOR (op + axis-aware replace/combine) ──
if (output.output && !output.output.is_menu_label) {
    const domain = output.output.domain_hint;
    const axisOf = (e) => _ceAxisFor(e, domain);

  const op = output.output.entity_op || 'replace_combine';
  const all = Array.isArray(output.output.entities) ? output.output.entities : [];

  // split on the flag the PARSER set — do NOT override it
  const current = all.filter(e => e.current_message === true);
  // PRIOR entities = from previous conversation state (always false)
  const prior = Array.isArray(parent_input.previous_conversation_state?.entities)
    ? parent_input.previous_conversation_state?.entities.map(e => ({ ...e, current_message: false }))
    : [];

  let finalEntities;
  switch (op) {
    case 'clear':
      finalEntities = [];
      break;
    case 'reuse': {
      finalEntities = prior;
      // date: only carry if THIS turn named no date
      const hasCurrentDate = output.output.date_filter_start || output.output.date_filter_end;
      if (!hasCurrentDate) {
        if (parent_input.previous_conversation_state?.date_filter_start) output.output.date_filter_start = parent_input.previous_conversation_state?.date_filter_start;
        if (parent_input.previous_conversation_state?.date_filter_end)   output.output.date_filter_end   = parent_input.previous_conversation_state?.date_filter_end;
        if (parent_input.previous_conversation_state?.date_mode)         output.output.date_mode         = parent_input.previous_conversation_state?.date_mode;
      }

      // is_active: only carry if THIS turn left it null (no status word)
      const curActive = norm(output.output.is_active);
      if (curActive === null && parent_input.previous_conversation_state?.is_active !== undefined && norm(parent_input.previous_conversation_state?.is_active) !== null) {
        output.output.is_active = parent_input.previous_conversation_state?.is_active;
      }
      // domain continuity for entity-less reuse (e.g. "and the price?"): carry prior domain UNLESS a
      // decisive current-turn term was present (effective signal 'explicit' → current wins). rev4: shared _explicit.
      if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
        if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the reuse carry
          output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint || output.output.domain_hint || null;
          output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
          output.output.domain_reused_entityless = true;   // diagnostic
        }
      }
      break;
    }
    case 'modify':
    case 'replace_combine':
    default: {
      const currentAxes = new Set(current.map(axisOf));
      const exclusive = output.output.scope_exclusive === true;

      let keptPrior;
      if (exclusive) {
        if (current.length === 0) {
          // "restrict to only [nothing]" is meaningless — the user named no new value.
          // This is almost always a tier/attribute change, not an entity narrow. Keep prior.
          keptPrior = prior;
          output.output.exclusive_ignored_no_current = true;
        } else {
          keptPrior = [];   // genuine exclusive: current IS the full scope
        }
      } else {
        keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)));
      }

      finalEntities = [...current, ...keptPrior];
      output.output.scope_exclusive_applied = exclusive;
      break;
    }
  }

  output.output.entities = finalEntities;
  output.output.entity_op_applied = op;
}
// (A) A positional pick continues the PRIOR business query — the parser may have
// mislabeled the bare "1" as casual with null domain. Inherit prior context FIRST,
// so the attachment_type carry below (gated on domain) can fire.
const prevState = parent_input.previous_conversation_state || {};

// order_status: order delivery-status filter (outstanding|delivered|null). Default null.
if (output.output.order_status === undefined) output.output.order_status = null;
if (output.output.order_status !== 'outstanding' && output.output.order_status !== 'delivered') output.output.order_status = output.output.order_status || null;

// ── "ALL / SEMUA" on a numbered menu → expand to EVERY offered position ──
// Gated on a pick-context (disambiguation menu or suggest-offer) so a legitimate
// "all warehouses"-style broaden in other domains is left untouched. Cancels the
// LLM's default "broaden" reading and turns "all" into a multi-position pick.
{
  const _selCtx  = String(prevState.selection_context || '');
  // A quote-reply (respond.io replyTo) delivers the replied-to menu in referenced_result_set —
  // prefer it over the immediate last_result_set, and treat its presence as a pick-context
  // (selection_context reflects the immediate prev turn, which is null on a reply-to-older-msg).
  const _refSet  = Array.isArray(parent_input.referenced_result_set) ? parent_input.referenced_result_set : [];
  const _lrsAll  = _refSet.length > 0 ? _refSet : (Array.isArray(prevState.last_result_set) ? prevState.last_result_set : []);
  const _pickCtx = _refSet.length > 0 || _selCtx === 'disambiguation' || _selCtx === 'suggest_offer';
  // strip the appended "reply to: <quoted text>" so the bare user word is matched
  const _msgAll  = String(parent_input.latest_user_message ?? parent_input.user_message ?? userMsg ?? '').split(/\s*reply to:/i)[0].trim().toLowerCase().replace(/[.!\s]+$/,'');
  const _isAll   = /^(all|all of them|all of it|everything|every one|semua|semuanya|semua sekali|both|kedua|kedua-duanya)$/i.test(_msgAll);
  const _noPos   = !Array.isArray(output.output.reference_positions) || output.output.reference_positions.length === 0;
  // #4: "all" over an ACTIVE did-you-mean offer selects EVERY suggestion. STRUCTURAL gate (R-ALL-1):
  // a non-empty dym_last_result_set persisted by compile-current-state on the partial-miss turn (no
  // marker regex — structural only). Route through dymNumberedMultiSelect (below) by forcing
  // reference_target='dym' + every dym idx, so each suggestion loops via applyDymPick (ADD-BOTH) and
  // inherits #5's domain-carry. Ordering: this block is BEFORE dymNumberedMultiSelect (~L420), which
  // consumes the forced route. Do NOT set entity_op='reuse' — applyDymPick sets replace_combine per pick.
  // When _dymActive is false, control falls to the EXISTING non-dym expansion branch VERBATIM.
  const _dymActive = Array.isArray(prevState.dym_last_result_set) && prevState.dym_last_result_set.length > 0;
  if (_isAll && _noPos && _dymActive) {
    output.output.reference_positions = prevState.dym_last_result_set.map(r => Number(r.idx)).filter(Number.isInteger);
    output.output.reference_target    = 'dym';    // dymNumberedMultiSelect (~L420) catches this forced route
    output.output.scope_intent        = null;     // cancel the LLM's broaden reading
    output.output.message_type        = 'business_query';
    output.output.select_all_expanded = true;     // diagnostic + escalation-decline immunity (~L611)
  } else if (_isAll && _pickCtx && _lrsAll.length > 0 && _noPos) {
    output.output.reference_positions = _lrsAll.map(r => Number(r.idx)).filter(x => Number.isInteger(x));
    output.output.scope_intent  = null;          // NOT a broaden
    output.output.entity_op     = 'reuse';
    output.output.message_type  = 'business_query';
    if (!output.output.domain_hint) output.output.domain_hint = prevState.domain_hint;
    if (!output.output.intent_hint) output.output.intent_hint = prevState.intent_hint;
    output.output.select_all_expanded = true;    // diagnostic
  }
}
if (!output.output.domain_hint && prevState?.domain_hint && output.output.reference_positions.length > 0) {
  output.output.domain_hint  = prevState?.domain_hint;
  output.output.intent_hint  = output.output.intent_hint || prevState.intent_hint;
  output.output.message_type = 'business_query';
  output.output.domain_inherited_for_position = true;
}
// pick under a menu business_query, even if LLM carried a domain_hint
if (prevState?.selection_context === 'disambiguation'
    && Array.isArray(output.output.reference_positions)
    && output.output.reference_positions.length > 0
    && output.output.message_type === 'casual') {
  output.output.message_type = 'business_query';
}
// ── dym-partial-disambiguation v3 (B2): NUMBERED did-you-mean MULTI-SELECT handler ──
// A positional reply the parser tagged reference_target='dym' resolves against the SEPARATE
// dym_last_result_set (idx 1..M) persisted by compile-current-state on the partial-miss turn (the stock
// last_result_set is left untouched, so a 'result'-qualified reply still resolves stock via the byIdx
// block below). LOOP every reference_position (R-v3-1 ADD-BOTH): each picked row is applied via the
// shared applyDymPick with slot-matching OFF, threading the entity set so replacements ACCUMULATE — a
// for_raw already consumed this turn falls to append, so two alternatives for ONE missed token are both
// ADDED (never last-wins). Then clear reference_positions so the stock byIdx block no-ops this turn.
// Inert on every other turn: returns early unless reference_target==='dym' AND a dym set exists (a stray
// non-null reference_target on a no-dym turn hits the empty-set guard and leaves the byIdx path untouched).
(function dymNumberedMultiSelect(){
  if (!output.output || output.output.is_menu_label) return;
  if ((output.output.reference_target || null) !== 'dym') return;      // result/null -> byIdx path unchanged
  const _positions = Array.isArray(output.output.reference_positions) ? output.output.reference_positions : [];
  if (_positions.length === 0) return;
  const _dymSet = Array.isArray(prevState.dym_last_result_set) ? prevState.dym_last_result_set : [];
  if (_dymSet.length === 0) return;                                     // no dym set -> untouched byIdx (backbone guard)
  const _offer = (prevState.dym_offer && typeof prevState.dym_offer === 'object') ? prevState.dym_offer : null;
  const _byIdx = new Map(_dymSet.map(r => [Number(r.idx), r]));
  let _base = Array.isArray(prevState.entities) ? prevState.entities : [];   // retains the resolved stock entity
  let _applied = false;
  for (const _p of _positions) {
    const _row = _byIdx.get(Number(_p));
    if (!_row) continue;                                                // out-of-range position -> skip (never resolve)
    const _hit = { code: (_row.value != null ? _row.value : _row.product), uuid: _row.uuid || null,
                   entity_type: _row.entity_type || null, for_raw: _row.for_raw,
                   for_hint: _row.for_hint, for_canonical: _row.for_canonical };
    _base = applyDymPick(_hit, _offer, _base, false);                   // thread; slot-match OFF -> ADD-BOTH
    _applied = true;
  }
  if (_applied) {
    output.output.entities = _base;
    output.output.reference_positions = [];                            // consumed -> stock byIdx no-ops this turn
  }
})();

// ── REFERENCE POSITIONS → ENTITIES ──
if (output.output && !output.output.is_menu_label &&
    Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0) {

  const lastSet = Array.isArray(parent_input.referenced_result_set)
    ? parent_input.referenced_result_set
    : (Array.isArray(prevState.last_result_set) ? prevState.last_result_set : []);

  const byIdx = new Map(lastSet.map(r => [r.idx, r]));

  const HINT_MAP = {
    promotion: 'promotion', product: 'product', order: 'order',
    order_number: 'order', customer: 'customer', form: 'form',
  };

  // ── C2 (immortal-hint-class) — NEVER STAMP A DOMAIN NAME INTO AN ENTITY HINT ────────────────
  // `hint = output.output.domain_hint || 'promotion'` fired whenever the frozen row's label had no
  // "<type>: " prefix — which is EVERY bare product-code title, i.e. every product_attachment /
  // inventory / master_products / incoming result. HINT_MAP covers only 6 hints, so every other
  // domain's result set minted a domain-named hint on any positional pick. The hint field is
  // enum-validated NOWHERE repo-wide, and reconcileEntities only corrects a bad hint when the token
  // RESOLVES — so bad hints are permanent on exactly the unresolved population did-you-mean is
  // built from. Prefer signals that already exist and are already correct:
  //   1. the resolver's authoritative entity_type, persisted on the frozen row
  //      (compile-current-state `entity_type: it.entity_type || null`) — null for render-envelope
  //      answer items, which is exactly when (2) carries the decision;
  //   2. the DOMAIN's SUBJECT entity hint — an entity hint, never a domain name.
  // The legacy `|| 'promotion'` tail is DROPPED, not preserved: it is itself an instance of this
  // same defect (a pick on an unknown domain became a *promotion* entity). Every real promotion
  // turn keeps its hint byte-identical via DOMAIN_SUBJECT_HINT.promotion.
  const DOMAIN_SUBJECT_HINT = {
    product_attachment: 'product', master_products: 'product', inventory: 'product',
    incoming: 'product', resource_attachment: 'attachment', portal_link: 'form',
    goods_receive: 'goods_receive', spo_allocation: 'spo', forms: 'form',
    order: 'order', promotion: 'promotion',
  };
  const KNOWN_ENTITY_HINTS = new Set([
    'product','promotion','customer','transporter','inbound_shipment','warehouse','attachment',
    'form','order','category','brand','attachment_type','certificate','flyer','order_number',
    'customer_order','goods_receive','spo','grn','forms',
  ]);
  const _c2Hint = (candidate, domain) => {
    const h = String(candidate ?? '').trim().toLowerCase();
    if (h && KNOWN_ENTITY_HINTS.has(h)) return h;
    return DOMAIN_SUBJECT_HINT[domain] || 'product';
  };

  const resolved = [];
  const outOfRange = [];

  for (const posRaw of output.output.reference_positions) {
    const pos = Number(posRaw);
    const row = byIdx.get(pos);
    if (!row || !row.label) { outOfRange.push(pos); continue; }

    const sep = row.label.indexOf(': ');
    let hint, raw;
    if (sep !== -1) {
      const before = row.label.slice(0, sep).trim().toLowerCase();
      raw  = row.label.slice(sep + 2).trim();
      hint = _c2Hint(HINT_MAP[before] || before || row.entity_type, output.output.domain_hint);   // C2
    } else {
      raw  = row.label.trim();
      hint = _c2Hint(row.entity_type, output.output.domain_hint);                                 // C2
    }
    // carry uuid/code straight from the frozen row so it needn't re-resolve
    resolved.push({ raw, hint, ordinal: pos, current_message: true,
                    uuid: row.uuid || null, canonical_code: row.product || raw });
    // M2: this pick was minted THIS TURN — record it, never infer it from the persisted `ordinal`.
    // Key shape must match _ceKey exactly (hint | canonical_code||raw), computed from the SAME
    // values pushed above, or the reconciliation pass will not recognise the entity it just saw.
    _ceRefPickedKeys.add(_ceKey({ hint, canonical_code: row.product || raw, raw }));
  }

  output.output.entities = [...resolved];

  // match_mode: 'or' only when MULTIPLE positions were picked — not because we
  // appended an attachment_type (product + type must AND together).
  const positionalPicks = resolved.filter(r => r.ordinal !== undefined).length;
  if (positionalPicks > 1) output.output.match_mode = 'or';

  output.output.positions_resolved = positionalPicks;
  output.output.positions_out_of_range = outOfRange;
}

// (B) product_attachment: re-attach attachment_type if the current turn lacks one.
  if (output.output.domain_hint === 'product_attachment') {
    const currentHasAttachType =
      output.output.entities.some(r => String(r.hint || '').toLowerCase() === 'attachment_type') ||
      (Array.isArray(output.output.entities) && output.output.entities.some(e =>
        String(e.hint || '').toLowerCase() === 'attachment_type' && e.current_message === true));

    if (!currentHasAttachType) {
      const priorEnts = Array.isArray(prevState.entities) ? prevState.entities : [];
      const priorAttachTypes = priorEnts.filter(e =>
        String(e.hint || '').toLowerCase() === 'attachment_type');
      for (const at of priorAttachTypes) {
        output.output.entities.push({ raw: at.raw, hint: at.hint,
                        canonical_code: at.canonical_code, current_message: true });
      }
    }
  }

// ── domain-aware entity-type BLOCKLIST ──
// ── domain-aware entity-type BLOCKLIST ──
// Always-blocked: hints that never make sense for the domain.
const DOMAIN_BLOCKED_HINTS = {
  master_products: ['forms', 'form', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type', 'flyer'],
  product_attachment: ['forms', 'form', 'promotion', 'customer', 'transporter', 'order', 'spo', 'grn', 'goods_receive', 'attachment', 'inbound_shipment', 'access_levels', 'customer_order', 'order_number', 'flyer'],
  promotion: ['forms', 'form', 'attachment', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type'],
  forms: ['product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels'],
  inventory: ['customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'attachment_type'],
  order: ['forms', 'form', 'promotion', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'attachment', 'flyer'],  // 'spo' removed: PS-codes resolve as customer_order; bare code hinted spo must survive reuse under order domain
  incoming: ['forms', 'form', 'attachment', 'promotion', 'customer', 'transporter', 'warehouse', 'spo', 'grn', 'goods_receive', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  portal_link: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  resource_attachment: ['forms', 'form', 'product', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type', 'flyer'],
  goods_receive: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  spo_allocation: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
};

// Broaden-only blocked: hints that NARROW the result and therefore contradict an
// "all / everything" request. Applied ONLY when scope_intent === 'broaden'.
// (Brand/access stay — they are context, not a subset filter.)
const DOMAIN_BROADEN_BLOCKED_HINTS = {
  promotion:          ['promotion', 'attachment'],            // a named promotion / flyer narrows "all promos"
  master_products:    ['product'],                            // a specific code narrows "all products"
  product_attachment: ['product', 'attachment_type'],
  inventory:          ['product'],
  order:              ['order', 'customer'],
  incoming:           ['inbound_shipment', 'product'],
  forms:              ['form'],
  resource_attachment:['attachment'],
  goods_receive:      ['goods_receive'],
  spo_allocation:     ['spo'],
};

// ── domain continuity for entity-bearing continuations (bare "Y" code) ──
// Key on the EFFECTIVE domain signal (shared _explicit; rev4 intent-only), NOT domain_hint===null:
//   explicit → current domain is decisive, keep it (no carry).
//   not-explicit ('none') → if a current-message entity exists AND its hint is COMPATIBLE with the prev
//     domain (reuse the SAME DOMAIN_BLOCKED_HINTS map used by blocklist-apply) → INHERIT prev domain,
//     OVERRIDING the LLM's guessed domain (this stops "incoming for A" → bare "B" flipping to
//     master_products). If incompatible → topic switch → do NOT inherit; keep the current domain
//     (null 'none' → downstream clarify; otherwise the entity's own guessed domain / re-derive).
// Must run BEFORE blocklist-apply so the correct domain drives the filter.
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the entity-bearing carry
    const prevDom = parent_input.previous_conversation_state?.domain_hint || null;
    const curEnts = (Array.isArray(output.output.entities) ? output.output.entities : [])
                      .filter(e => e && e.current_message === true);
    if (prevDom && curEnts.length > 0) {
      const blockedForPrev = new Set(DOMAIN_BLOCKED_HINTS[prevDom] || []);   // hoist declaration — see note
      const compatible = curEnts.every(e => !blockedForPrev.has(String(e.hint || '').toLowerCase()));
      if (compatible) {
        output.output.domain_hint  = prevDom;                                // OVERRIDE guessed domain
        output.output.intent_hint  = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
        output.output.domain_inherited_compatible = true;   // diagnostic
      } else {
        output.output.domain_inherit_blocked = prevDom;     // diagnostic: topic switch, kept current
      }
    }
  }
}

// #6: a bare/dominant domain-switch word overrides the continuity carry. Placed after both carry
// blocks and before the blocklist-apply (next line reads output.output.domain_hint) and before
// deriveRouting (~L679), so routing/get-rag/get-results all honor the switched domain.
if (_switchDomain) {
  output.output.domain_hint = _switchDomain;
  output.output.domain_switched_by_keyword = _switchDomain;   // diagnostic
  output.output.intent_hint = null;   // drop carried/guessed intent; downstream re-derives from the new domain
}

// ── B2' (carried-certificate-dump) — POST-MERGE ENTITY RECONCILIATION ──────────────────────────
// Placed AFTER every entity-set writer — tryDymPick (applyDymPick), the op executor,
// dymNumberedMultiSelect, the reference-positions block and block (B) — and after the two
// domain-carry blocks + the #6 switch, so `domain_hint` is FINAL and the axis classification here is
// the one the rest of the turn uses. Runs immediately BEFORE blocklist-apply. Plan §3.6 parts 2/4/5.
//
// Why a post-merge pass and not a wider `prior` filter (plan §3.0): the executor's axis filter at
// `keptPrior = prior.filter(...)` touches `prior` ONLY — `current` is spread unfiltered — and
// applyDymPick promotes every carried entity into `current` before the executor runs, while
// dymNumberedMultiSelect overwrites the executor's output wholesale afterwards. Both bypass the axis
// map entirely. This pass sits downstream of all of them.
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  const _rcDomain = output.output.domain_hint;
  const _rcEnts   = output.output.entities;
  // INSTANCE-bound attachment scope: a specific certificate NUMBER or a specific attachment. These
  // are narrowing filters bound to the product they were resolved against, so they are stale by
  // construction the moment product scope changes (an empty product_ids ∧ certificate_ids
  // intersection reads to the customer as a confident "no certificate for X" — F-CARRY-NARROW).
  // `attachment_type` is deliberately NOT evictable here: it is a TYPE filter that legitimately
  // outlives a product change, and re-attaching it is block (B)'s entire purpose.
  const _RC_INSTANCE_HINTS = new Set(['certificate', 'attachment']);

  // "contributes" = present in the final set and NOT carried (provenance, per _ceIsCarried).
  let _rcContribAttach = false, _rcContribProduct = false;
  for (const e of _rcEnts) {
    if (_ceIsCarried(e)) continue;
    const _ax = _ceAxisFor(e, _rcDomain);
    if (_ax === 'attachment_scope') _rcContribAttach = true;
    if (_ax === 'product_scope')    _rcContribProduct = true;
  }
  // Part 4 — the widened trigger. The product_scope half is the load-bearing one: it is what fixes
  // the bare-product follow-up (plan §3.2 row 2, ruled a design error by §3.0) AND the post-B1
  // did-you-mean CODE reply, which is the modal turn B1 funnels affected customers into.
  const _rcEvict = _rcContribAttach || _rcContribProduct;
  const _rcDropped = [];
  let _rcKept = _rcEnts;
  if (_rcEvict) {
    _rcKept = _rcEnts.filter(e => {
      const _drop = _ceIsCarried(e)
        && _ceAxisFor(e, _rcDomain) === 'attachment_scope'
        && _RC_INSTANCE_HINTS.has(_ceNorm(e && e.hint));
      if (_drop) _rcDropped.push(String(e.hint) + ':' + String(e.canonical_code || e.raw));
      return !_drop;
    });
  }

  // Part 5 — dedupe. `current` is spread unconditionally by the executor and is never pruned, so once
  // applyDymPick promotes the carried set into `current` the entity list becomes append-only for that
  // axis. That is what produced FIVE copies of PC 000078 in the observed state (plan §5.1c) and what
  // made gate_debug.entities_count disagree with compatible_entities.length.
  const _rcSeenKey = new Set(), _rcSeenUuid = new Set(), _rcOut = [];
  let _rcDupes = 0;
  for (const e of _rcKept) {
    const _k = _ceKey(e);
    const _u = (e && e.uuid) ? (_ceNorm(e.hint) + '|' + _ceNorm(e.uuid)) : null;
    if (_rcSeenKey.has(_k) || (_u && _rcSeenUuid.has(_u))) {
      _rcDupes++;
      // never lose a resolution to the dedupe: backfill onto the retained twin
      const _first = _rcOut.find(x => _ceKey(x) === _k)
        || (_u ? _rcOut.find(x => x && x.uuid && (_ceNorm(x.hint) + '|' + _ceNorm(x.uuid)) === _u) : null);
      if (_first) {
        if (!_first.uuid && e && e.uuid) _first.uuid = e.uuid;
        if (!_first.canonical_code && e && e.canonical_code) _first.canonical_code = e.canonical_code;
      }
      continue;
    }
    _rcSeenKey.add(_k);
    if (_u) _rcSeenUuid.add(_u);
    _rcOut.push(e);
  }

  output.output.entities = _rcOut;
  // diagnostics: emitted ONLY when non-zero, so they are drop-when-absent in the replay norm()
  // (LESSONS §40) instead of diffing on every golden turn.
  if (_rcDropped.length) output.output.carried_attachment_evicted = _rcDropped;
  if (_rcDupes > 0)      output.output.entities_deduped = _rcDupes;
}

// C1 residual-class diagnostic. Every hint that reached the two-step fallback this turn, so the
// "no orthogonal unrecognised hint exists" premise is MEASURABLE on real traffic instead of
// assumed. Sorted for determinism; emitted only when non-empty (LESSONS §40 drop-when-absent).
//
// 🔴 F3 (tester pass 2, exec 11645628) — THE DIAGNOSTIC WAS BLIND WHERE IT MATTERED MOST.
// _ceUnknownHints is populated as a side effect of _ceAxisFor, and the contribution loop above
// short-circuits on `if (_ceIsCarried(e)) continue;` BEFORE classifying. On a reuse turn the
// executor takes `finalEntities = prior` and never calls axisOf at all. So a DORMANT carried
// entity — precisely the immortal population this diagnostic exists to measure — was never
// counted: exec 11645628 carried the unrecognised `M2399` in state for the whole turn and emitted
// no diagnostic. Exactly inverted from plan §2.1's intent.
//
// Fixed by classifying the FINAL entity set explicitly. This is DIAGNOSTIC-ONLY and cannot change
// behaviour: every eviction decision was already taken above, and _ceAxisFor is pure apart from
// this Set. Placement note: blocklist-apply runs after this and may still drop an entity, so a
// blocklisted hint is counted as "seen this turn" — correct for a measurement of what reached the
// fallback, and deliberately NOT moved later to keep the change surface at one block.
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) _ceAxisFor(e, output.output.domain_hint);
}
if (output.output && !output.output.is_menu_label && _ceUnknownHints.size) {
  output.output.unknown_entity_hints = [..._ceUnknownHints].sort();
}

if (output.output?.entities && Array.isArray(output.output.entities)) {
  const domain = output.output.domain_hint;
  const isBroaden = output.output.scope_intent === 'broaden';

  // union of always-blocked + (broaden-blocked if broadening)
  const blocked = new Set([
    ...(DOMAIN_BLOCKED_HINTS[domain] || []),
    ...(isBroaden ? (DOMAIN_BROADEN_BLOCKED_HINTS[domain] || []) : []),
  ]);

  if (blocked.size > 0) {
    const before = output.output.entities.length;
    const dropped = [];
    output.output.entities = output.output.entities.filter(e => {
      const hit = blocked.has(String(e.hint || '').toLowerCase());
      if (hit) dropped.push(`${e.hint}:${e.raw}`);
      return !hit;
    });
    const after = output.output.entities.length;
    output.output.entities_filtered = (after !== before);
    output.output.entities_emptied_by_filter = (before > 0 && after === 0);
    if (dropped.length) output.output.broaden_dropped = dropped;   // visibility into what scope-blocking removed
  }
}

const priorRouting  = parent_input?.previous_conversation_state?.routing ?? {};

// escalation confirmation = previous response OFFERED escalation (fixed wording)
//                           AND current message is affirmative
const prevResponse = String(parent_input?.previous_conversation_state?.response || '');
const offeredEscalation = /would you like me to escalate/i.test(prevResponse);
const isAffirmative = output.output.is_affirmative === true;
const isDecline     = output.output.is_affirmative === false;

// A position pick (a numbered choice, or "all" resolved against a menu / referenced set) is NOT
// a decline of the escalation offer — don't let is_affirmative=false collapse it to casual (which
// would then wipe the resolved entities below).
const _isPositionPick = (Number(output.output.positions_resolved) > 0)
  || output.output.select_all_expanded === true
  || (Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0);
if (offeredEscalation && isAffirmative) {
  output.output.escalation = { is_escalation_confirmation: true };
} else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp) {
  output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
  output.output.message_type = 'casual';
}

if (output.output.access_levels.length == 0) {
  output.output.access_levels = $('When Executed by Another Workflow').first().json.previous_conversation_state?.access_levels || []
}

const _engagesOffer = (isAffirmative || isDecline || _isPositionPick);
if (output.output.message_type == 'casual' && !_engagesOffer) {
  output.output.entities = []
}


if (output.output.domain_hint && output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  output.output.message_type = "business_query"
}

// ── attachment_type i18n normalize ─────────────────────────────────────────────
// The resolver + get-results read entity.raw. The LLM sets canonical_code to the
// English kind (photo/certificate/…) for attachment_type; mirror it into raw so a
// foreign word (gambar→photo) resolves. Authority/brand certs keep canonical_code
// null (per prompt) → raw untouched → cert routing preserved.
if (Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) {
    if (String(e.hint || '').toLowerCase() === 'attachment_type' && e.canonical_code) {
      e.raw = e.canonical_code;
    }
  }
}

// _llmTeamRaw/_llmAgentRaw captured at the TOP (§10 follow-up (3) hoist) — pre-mutation, single source.
const derived = output.output.domain_hint
  ? deriveRouting(output.output)
  : { suggested_team: null, suggested_agent: null };

// For a request_for_help turn with a valid LLM team, that team WINS over deriveRouting/prior.
// TERNARY (not `_reqHelp && _llmTeamN`): `false ?? y === false` would poison the nullish chain.
// _reqHelp / _llmTeamN / _llmAgentN are the hoisted single-source vars (§10 follow-up (3)).
const suggested_team  = (_reqHelp ? _llmTeamN  : null) ?? norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = (_reqHelp ? _llmAgentN : null) ?? norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';

output.output.routing = { suggested_team, suggested_agent };



// ── Δ3: CS member-pick override (final say; v2 robust extractor) ──
const _selCtx = (parent_input.previous_conversation_state || {}).selection_context;
if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true) {
  const _lastSet = Array.isArray((parent_input.previous_conversation_state || {}).last_result_set) ? parent_input.previous_conversation_state.last_result_set : [];
  const _maxIdx = _lastSet.length;
  const _ORD = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, '1st':1, '2nd':2, '3rd':3, '4th':4, '5th':5, '6th':6 };
  const _extract = (msg, llm) => {
    if (Array.isArray(llm) && llm.length) return [...new Set(llm.map(Number).filter(n => !isNaN(n)))];
    const t = String(msg || '').trim().toLowerCase(); const c = [];
    if (/^#?\s*\d+$/.test(t)) c.push(parseInt(t.replace(/\D/g, ''), 10));
    for (const w in _ORD) if (new RegExp('\\b' + w + '\\b').test(t)) c.push(_ORD[w]);
    const opt = t.match(/\b(?:option|number|no\.?|choice)\s*#?\s*(\d+)/g); if (opt) opt.forEach(m => c.push(parseInt(m.replace(/\D/g, ''), 10)));
    if (c.length === 0 && t.split(/\s+/).filter(Boolean).length <= 4) { t.split(/\s+/).forEach(w => { if (/^#?\d+$/.test(w)) c.push(parseInt(w.replace(/\D/g, ''), 10)); }); }
    return [...new Set(c)].filter(n => !isNaN(n));
  };
  const _o = output.output;
  const _normName = s => String(s || '').toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^(ms|miss|mrs|mr|encik|en|puan|pn|cik|tuan|dato|datin|dr)\.?\s+/, '');   // strip ONE leading honorific
  // In member_offer context a bare number, or a short reply matching a member label, is ALWAYS a
  // pick — never a new query — even if the LLM speculatively assigned a domain (e.g. bare "Nur",
  // which also looks like customer NURTECH, gets parsed as a new order search). Force the pick.
  const _rawReply = String(parent_input.latest_user_message || '').split(/\s*reply to:/i)[0].trim();
  const _replyWords = _rawReply.split(/\s+/).filter(Boolean);
  const _replyIsNumber = /^#?\s*\d+$/.test(_rawReply);
  const _replyMatchesMember = _replyWords.length > 0 && _replyWords.length <= 3 && _lastSet.some(r => {
    const a = _normName(r.label), b = _normName(_rawReply);
    return a && b && (a === b || a.split(' ').some(t => t && t === b) || b.split(' ').some(t => t && t === a) || a.includes(b) || b.includes(a));
  });
  const _forcePick = _replyIsNumber || _replyMatchesMember;

  // ── entry-gate precedence: 1 retarget → 2 pick → 3 new-query abandon → 4 junk reprompt ──
  const _priorTeam = norm(priorRouting.suggested_team) || 'customer_service';
  const _pos = _extract(parent_input.latest_user_message, output.output.reference_positions);
  // §1.1 fix: key ONLY on an actual extracted person name. The old `: _rawReply` fallback made this
  // arm truthy for EVERY worded reply → it shadowed the affirmative (yes/no) arms below.
  const _pm = (typeof _o.person_mention === 'string' && _o.person_mention.trim()) ? _o.person_mention.trim() : '';
  // §1.3 broaden: a real question (with OR without a current-message entity) abandons the offer.
  const _isNewQuery = (!!_o.domain_hint || _o.message_type === 'business_query' || _o.message_type === 'clarification')
    && _o.is_affirmative !== true;
  // pick signal = a bare number/member-name (_forcePick), a resolved position, an extracted person
  // name, or a bare yes/no. _forcePick is INCLUDED here so it still outranks new-query (LESSON 39).
  const _hasPickSignal = _forcePick || _pos.length > 0 || !!_pm
    || _o.is_affirmative === true || _o.is_affirmative === false;

  if (_reqHelp && _llmTeamN && _llmTeamN !== _priorTeam) {
    // Tier 1 — RETARGET: LLM named a DIFFERENT team mid-offer → abandon CS roster, direct-assign it.
    output.output.routing = { suggested_team: _llmTeamN, suggested_agent: (norm(_llmAgentRaw) || 'general_enquiries') };
    output.output.escalation = { is_escalation_confirmation: true, retarget_team: true };
    output.output.message_type = 'request_for_help';
    output.output.selection_context = null;
    output.output.last_result_set = [];
    output.output.member_pick_context = false;
  } else if (_hasPickSignal) {
    // Tier 2 — PICK SIGNAL: number / position / person-name / bare yes|no.
    if (_pos.length === 1 && _pos[0] >= 1 && _pos[0] <= _maxIdx) {
      const _row = _lastSet.find(r => Number(r.idx) === _pos[0]);
      output.output.escalation = { is_escalation_confirmation: true, preferred_assignee_id: _row.uuid };
      output.output.entities = [];
    } else if (_pos.length > 1) {
      output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'multi' };
      output.output.correction = true;   // re-offer the member list (only one allowed)
    } else if (_pos.length === 1) {
      output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
      output.output.correction = true;   // re-offer the member list
    } else if (_pm) {
      // Δ name-resolution arm: numeric _pos empty + a person_mention present → match vs last_result_set labels
      const _q  = _normName(_pm);
      const _qt = new Set(_q.split(' ').filter(Boolean));
      const _norm = _lastSet.map(r => ({ idx: Number(r.idx), uuid: r.uuid, ln: _normName(r.label) }));
      // tiered: exact -> token overlap -> substring; collect ALL idx at the FIRST tier that yields matches
      let _m = _norm.filter(r => r.ln === _q);
      if (!_m.length) _m = _norm.filter(r => r.ln.split(' ').some(t => _qt.has(t)));
      if (!_m.length) _m = _norm.filter(r => r.ln.includes(_q) || _q.includes(r.ln));
      _m = [...new Map(_m.map(r => [r.idx, r])).values()];   // dedupe by idx
      if (_m.length === 1) {
        output.output.escalation = { is_escalation_confirmation: true, preferred_assignee_id: _m[0].uuid };
        output.output.entities = [];
      } else if (_m.length > 1) {
        output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'multi' };
        output.output.correction = true;   // ambiguity gate: reprompt, NEVER auto-pick
      } else {
        output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
        output.output.correction = true;   // 0 match -> reprompt the member list
      }
    } else if (_o.is_affirmative === true) {
      output.output.escalation = { is_escalation_confirmation: true };   // no preferred -> round-robin
    } else if (_o.is_affirmative === false) {
      // §10 Part 2 — plain decline (no position/person_mention pick, no named-team retarget;
      // Tier 1 already consumed request_for_help + team != prior). Emit a DETERMINISTIC decline
      // marker the spine's is-escalation-declined IF keys on, so the reply is a FIXED
      // "Escalation declined." and NEVER the clarification LLM. Do NOT set correction/member_reprompt.
      output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
      output.output.message_type = 'casual';
    }
    output.output.member_pick_context = true;
  } else if (_isNewQuery) {
    // Tier 3 — NEW QUERY: abandon the offer. Do NOT set member_pick_context and do NOT touch
    // routing/escalation/entities — normal downstream processing answers it.
  } else {
    // Tier 4 — junk / no signal: reprompt the member list once.
    output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
    output.output.correction = true;
    output.output.member_pick_context = true;
  }
}

// ── DATE-FILTER DOMAIN GATE (policy lives here, not in the LLM) ──
// The parser extracts a date window whenever the message names one, for ANY domain.
// This whitelist is the deterministic policy for which domains actually honor it.
// Add a domain here to open the date filter to it — no prompt change needed.
const DATE_FILTER_DOMAINS = new Set(['promotion', 'order']);
if (!DATE_FILTER_DOMAINS.has(output.output.domain_hint)) {
  if (output.output.date_filter_start || output.output.date_filter_end || output.output.date_mode) {
    output.output.date_filter_gated = output.output.domain_hint || null;  // visibility: what we stripped for
  }
  output.output.date_filter_start = null;
  output.output.date_filter_end   = null;
  output.output.date_mode         = null;
}

output._parser_raw = _parser_raw_snapshot;
return output