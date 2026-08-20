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
  // D9: prefer the DERIVED query_brands — it is the union of the brand entity and the brand half
  // of a compound stated level, so it survives the tier-token normalisation that made the
  // access-level fallback below dead. Measured (exec 12041502): the LLM itself routed
  // marketing_promotion_cabana, and this function downgraded it to sorento because by the time it
  // ran, access_levels said "dealer". Absent/empty query_brands ⇒ the original two rules, verbatim.
  const brandEnt = ents.find(e => String(e.hint || '').toLowerCase() === 'brand');
  const access = (out.access_levels || []).map(a => String(a).toLowerCase());
  let brand = (Array.isArray(out.query_brands) && out.query_brands.length) ? out.query_brands[0] : null;
  if (!brand) brand = brandEnt ? String(brandEnt.raw || '').toLowerCase() : null;
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
    // brand-company-routing: ONE promotion team for every brand (CRM migration 371 collapsed the
    // legacy marketing_promotion_<brand> T1 rows into base `marketing_promotion` + brand_code).
    // The brand is carried separately (query_brands / brand entity), never in the team name.
    case 'promotion':          return { suggested_team: 'marketing_promotion', suggested_agent: 'general_enquiries' };
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
// miss-company-routing rev-3: the LLM may now emit escalation.company_pick (semantic fallback). It is
// read ONLY from the frozen snapshot inside the Δ3 member-offer arm, where it is validated against the
// persisted company pool; strip the raw key here so an unvalidated / null value never rides the live
// escalation object (and never diffs golden turns — Lesson 40).
try { if (output.output && output.output.escalation && typeof output.output.escalation === 'object' && 'company_pick' in output.output.escalation) delete output.output.escalation.company_pick; } catch (e) {}
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
// ── the carried-vs-renamed test must not hinge on WHICH key an entity happens to carry ──
// _ceKey collapses to `canonical_code || raw`, so the SAME entity keys differently depending on
// whether it has been resolved yet: prior state holds the picked customer as
// `customer|dbr-59e57de1b7` while the LLM re-emits it as `customer|yoo living house [a/c iii] -
// pricetag`. The sets then never intersect, the entity looks un-renamed, and the eviction pass
// drops it — retyping "customer yoo living delivery status for srtwc286" lost the customer and
// answered 20 orders across other companies (fork exec 13246777 -> spine exec 13246769).
// Compare on BOTH forms instead, so an entity counts as re-named when the LLM names EITHER its
// code or its raw text. _ceKey itself is untouched (the pick-provenance sets key on it).
const _ceKeysOf = (e) => {
  const _h = _ceNorm(e && e.hint) + '|';
  const _out = [];
  if (e && e.canonical_code) _out.push(_h + _ceNorm(e.canonical_code));
  if (e && e.raw) _out.push(_h + _ceNorm(e.raw));
  return _out.length ? _out : [_ceKey(e)];
};
const _cePriorKeysAny = new Set(
  (Array.isArray(parent_input.previous_conversation_state?.entities)
    ? parent_input.previous_conversation_state.entities : []).flatMap(_ceKeysOf));
const _ceLlmKeysAny = new Set(
  (Array.isArray(_parser_raw_snapshot?.entities) ? _parser_raw_snapshot.entities : []).flatMap(_ceKeysOf));
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
  const _ks = _ceKeysOf(e);
  return _ks.some(k => _cePriorKeysAny.has(k)) && !_ks.some(k => _ceLlmKeysAny.has(k));
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
    // ADD-BOTH safety: an entity ALREADY minted by a pick THIS TURN is not a source token. Without
    // this exclusion the second candidate of a multi-pick (same for_raw, same for_hint) lands on the
    // first pick's own entity and overwrites it — measured, exec 13203346: merging both MASTILE KLANG
    // accounts returned only the last one. _ceDymPickedKeys already records every code applyDymPick
    // minted this turn, so the guard needs no new state.
    const _sameHint = _prior.filter(e => norm(e.hint) === norm(_hit.for_hint) && !_ceDymPickedKeys.has(_ceKey(e)));
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
  if (_hit) { output.output.entities = applyDymPick(_hit, _offer, _prev.entities, true); return; }
  // ── PARTIAL-REPLY PICK (captain, 2026-08-20) ────────────────────────────────
  // A reply that is a FRAGMENT of an offered code — "MASTILE KLANG" against the offered
  // "MASTILE KLANG SDN BHD" — is a pick, not a new query. Customers reply with the name they
  // know, not the ledger's full legal string. MEASURED: exec 13201053 fell through to the
  // member-pick arm and answered with the clarification LLM ("what information do you need
  // about MASTILE KLANG?"), losing the turn's date window and product entirely.
  // The exact-match path above is untouched; this runs ONLY when it found nothing.
  // Guards: a fully-classified new query (own domain AND intent) is never hijacked; ≥4 chars;
  // never a date or a bare number (the numbered path owns those); and the reply must be
  // contained IN the candidate, never the reverse — an offered code embedded in a larger
  // new-domain phrase must keep falling through (the #5 domain-carry regression guard).
  if (output.output.domain_hint && output.output.intent_hint) return;
  if (_msg.length < 4 || _msg.length > 60 || _isDateLike(_msg) || /^\d+$/.test(_msg)) return;
  // "reply a product then is product, reply a person's name then is person" (captain, 2026-08-20):
  // a reply that IS a label on the open roster (CS members, company picks) belongs to that arm, even
  // if it also happens to be a fragment of an offered code. The exact-code path above still wins for
  // a real code; only the fuzzy fragment path defers here.
  const _rosterLabels = new Set((Array.isArray(_prev.last_result_set) ? _prev.last_result_set : [])
      .map(_r => norm(_r && _r.label)).filter(Boolean));
  if (_rosterLabels.has(_msg)) return;
  const _partials = _cands.filter(c => !_isDateLike(c.code)
      && norm(c.code) !== _msg && norm(c.code).includes(_msg));
  if (!_partials.length) return;
  // An ambiguous fragment MERGES every candidate it matches (captain's decision, 2026-08-20):
  // "MASTILE KLANG" prefixes both the plain account and "[A/C I]", so both are queried rather
  // than one being guessed. Threaded with slot-matching OFF so replacements ACCUMULATE (the
  // ADD-BOTH contract dymNumberedMultiSelect already uses) and so #5's domain-carry fires —
  // a fragment reply is a bare-reply-to-offer, never a fresh catalogue lookup.
  let _base = Array.isArray(_prev.entities) ? _prev.entities : [];
  for (const _c of _partials) _base = applyDymPick(_c, _offer, _base, false);
  output.output.entities = _base;
  output.output.dym_partial_pick = _partials.length;   // diagnostic (drop-when-absent in replay norm())
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
    // WHO / WHAT / WHO-DELIVERS are INDEPENDENT filters in this domain — they AND together in the
    // query, so they cannot share one axis. They used to: every order hint mapped to 'order_scope',
    // and the executor keeps prior entities only on axes the current turn did NOT name
    // (keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))). So naming a PRODUCT evicted the
    // carried CUSTOMER, and re-typing "customer yoo living delivery status for srtwc286" — where the
    // LLM re-emits the customer as carried and the product as current — answered 20 orders across
    // other companies (fork exec 13246777 -> spine exec 13246769).
    customer: 'customer_scope', transporter: 'transporter_scope', product: 'order_scope',
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
      // ── A DOMAIN CHANGE IS A NEW ENQUIRY (captain, 2026-08-21) ────────────────
      // Since customer/product stopped sharing one axis, scope that the turn did not name survives —
      // which is right for a follow-up inside one domain ("...and for yoo living?") but wrong across
      // domains: "any offer for srtwc286-sh" (promotion) followed by "customer yoo living deliveyr"
      // (order) inherited SRTWC286-SH and filtered the delivery question by it (exec 13255552).
      // Only the paths where the customer NAMED new scope clear it; a pure `reuse` turn ("any
      // promotion for it") is exactly the cross-domain carry that must keep working, and is handled
      // by the case above, never here. A null current domain (a bare pick, a casual reply) is not a
      // change — the domain is inherited further down.
      const _prevDom = parent_input.previous_conversation_state?.domain_hint || null;
      const _curDom  = output.output.domain_hint || null;
      if (_prevDom && _curDom && _prevDom !== _curDom && current.length > 0) {
        if (keptPrior.length) output.output.scope_cleared_on_domain_change = keptPrior.length;   // diagnostic
        keptPrior = [];
      }
      // ── NAMING A NEW ENTITY IS A NEW QUESTION (captain, 2026-08-21) ───────────
      // An unnamed filter that survives is INVISIBLE: the answer prints "Here are the orders I
      // found" with no statement of scope, so a carried product silently narrows the result and a
      // short list — or "No delivery in July" — reads as ground truth. That is more dangerous than
      // the leak was, because nothing on screen shows it happened.
      // Scope: the ORDER domain only, where it was measured. Other domains keep their carry
      // semantics (product_attachment's "and the technical drawing?" must still reuse the product).
      // EXCEPTION — the carried CUSTOMER survives: dropping it on a product-only follow-up
      // ("what about srtwc8318") turns the turn into a product-only order query, which enumerates
      // every customer who bought it. That is the exact exposure the If3 gate closed. A newly named
      // customer still replaces it through the axis rule above.
      // The LLM often returns a null domain for a short follow-up ("what about customer yoo living");
      // the domain is inherited further down. Judge on the EFFECTIVE domain, or the rule silently
      // never fires on exactly the turns it is meant to catch (measured, exec 13258638).
      const _effDom = String(_curDom || _prevDom || '').toLowerCase();
      if (_effDom === 'order' && current.length > 0 && keptPrior.length) {
        const _kpBefore = keptPrior.length;
        keptPrior = keptPrior.filter(e => String((e && e.hint) || '').toLowerCase() === 'customer');
        if (keptPrior.length !== _kpBefore) output.output.scope_cleared_on_new_entity = _kpBefore - keptPrior.length;
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

// ── TIER-ONLY ACCESS ASK (access-tier-ask-plan.md §4) ─────────────────────────
// (a) tier_offer reconciliation: a positional / tier-word reply to the tier ask resolves to
//     TIER TOKENS in output.access_levels — NEVER to entities (the roster rows carry tier
//     values, not records). Keyed STRICTLY on selection_context === 'tier_offer', so it can
//     never shadow member_offer / suggest_offer / disambiguation (TA-14).
// (b) statedTiers port: tier words anywhere in the message ("dealer price", "harga
//     pengedar", compound "Sorento Dealer") become stated tiers deterministically, and the
//     LLM's own access_levels are normalised through parseLevel — so downstream always sees
//     tier tokens (['dealer']), which the spine's tier-gate recomposes into today's
//     compound names (D6/D8: no new LLM field; the mapper dies at CRM cutover).
// (c) the ask round-trip carries the ORIGINAL query scope: prev entities are reused
//     (S5-shaped, own flag `_tier_pick_scope_reused`) so the answer turn re-runs the same
//     promotion query at the chosen tier. D4: the tier itself is per-turn only —
//     compile-current-state never persists access_levels.
// The block between the markers is a BYTE-COPY of tests/offline/access-tier/mapper.js
// (source of truth; probe.js EB-* enforces byte identity).
// >>> mapper-embed (generated by gen-embeds.js — DO NOT EDIT BY HAND)
const BRANDS = ['sorento', 'cabana', 'mocha'];
const TIER_WORDS = { dealer: 'dealer', office: 'office', 'end user': 'end_user' };

function parseLevel(name) {
  const s = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'end user' || s === 'enduser' || s === 'end-user') return { brand: null, tier: 'end_user' };
  const m = s.match(/^(sorento|cabana|mocha) (dealer|office)$/);
  return m ? { brand: m[1], tier: m[2] } : null;
}

function statedTiers(message, entities) {
  const found = new Set();
  const txt = ' ' + String(message ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (/ (dealer|dealers|pengedar) /.test(txt)) found.add('dealer');
  if (/ (office|ofis) /.test(txt)) found.add('office');
  if (/ end ?users? |ke pengguna? | enduser /.test(txt)) found.add('end_user');
  for (const e of (Array.isArray(entities) ? entities : [])) {
    const p = parseLevel(e && (e.canonical_code || e.raw));
    if (p) found.add(p.tier);
    else {
      const s = String((e && (e.canonical_code || e.raw)) ?? '').trim().toLowerCase();
      if (TIER_WORDS[s]) found.add(TIER_WORDS[s]);
    }
  }
  return ['dealer', 'office', 'end_user'].filter(t => found.has(t));
}

function statedBrands(entities, rawLevels, message) {
  const out = new Set();
  const _txt = ' ' + String(message ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (const b of BRANDS) if (_txt.includes(' ' + b + ' ')) out.add(b);
  for (const e of (Array.isArray(entities) ? entities : [])) {
    if (String((e && e.hint) || '').toLowerCase() !== 'brand') continue;
    const s = String((e && (e.canonical_code || e.raw)) || '').toLowerCase();
    const v = BRANDS.find(b => s.includes(b));
    if (v) out.add(v);
  }
  const fromLevels = new Set();
  for (const l of (Array.isArray(rawLevels) ? rawLevels : [])) {
    const p = parseLevel(l);
    if (p && p.brand) fromLevels.add(p.brand);
  }
  if (fromLevels.size === 1) for (const b of fromLevels) out.add(b);
  return BRANDS.filter(b => out.has(b));
}
// <<< mapper-embed
const TIER_ORDER = ['dealer', 'office', 'end_user'];

(function tierOfferPick(){
  if (!output.output || output.output.is_menu_label) return;
  if (String(prevState.selection_context || '') !== 'tier_offer') return;   // TA-14 guard
  const _roster = (Array.isArray(prevState.last_result_set) ? prevState.last_result_set : [])
    .filter(r => r && TIER_ORDER.includes(String((r.tier != null ? r.tier : r.value) || '').toLowerCase()));
  if (!_roster.length) return;
  const _tierOf = r => String((r.tier != null ? r.tier : r.value) || '').toLowerCase();
  const _msg = String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0].trim().toLowerCase();
  const _isAll = /^(all|all of them|all of it|everything|every one|semua|semuanya|semua sekali|both|kedua|kedua-duanya)[.!\s]*$/i.test(_msg);
  let _pos = (Array.isArray(output.output.reference_positions) ? output.output.reference_positions : [])
    .map(Number).filter(n => Number.isInteger(n) && n >= 1);
  // the LLM often tags a bare number `casual` with no positions — extract digits ourselves,
  // but ONLY from a digits-and-connectives reply ("1", "1 and 2", "1,2"), never a query.
  if (!_pos.length && /^#?\s*\d+(\s*(?:,|and|&|\+)?\s*\d+)*[\s.!]*$/i.test(_msg)) {
    _pos = (_msg.match(/\d+/g) || []).map(Number);
  }
  const _stated = statedTiers(_msg, output.output.entities);
  const _chosen = new Set(_stated);
  if (_isAll) for (const r of _roster) _chosen.add(_tierOf(r));
  for (const p of _pos) {
    const r = _roster.find(x => Number(x.idx) === p);
    if (r) _chosen.add(_tierOf(r));   // an out-of-range position is simply not a pick
  }
  if (!_chosen.size) return;   // no pick signal → a new query / casual abandons the ask (TA-12/13)
  output.output.access_levels = TIER_ORDER.filter(t => _chosen.has(t));
  // (c) carry the ORIGINAL scope to the answer turn — S5-shaped, own flag
  const _prevEnts = Array.isArray(prevState.entities) ? prevState.entities : [];
  if (_prevEnts.length) {
    output.output.entities  = _prevEnts.map(x => ({ ...x, current_message: false }));
    output.output.entity_op = 'reuse';
  }
  if (!(output.output.date_filter_start || output.output.date_filter_end)) {
    if (prevState.date_filter_start) output.output.date_filter_start = prevState.date_filter_start;
    if (prevState.date_filter_end)   output.output.date_filter_end   = prevState.date_filter_end;
    if (prevState.date_mode)         output.output.date_mode         = prevState.date_mode;
  }
  output.output._tier_pick_scope_reused = true;
  output.output.domain_hint  = 'promotion';
  output.output.intent_hint  = prevState.intent_hint || 'check_promotion';
  output.output.message_type = 'business_query';
  output.output.scope_intent = null;
  // consumed: the positions were TIER picks — they must not mint entities off the roster
  // (reference-positions block) nor re-trigger the S5 promo scope-reuse below.
  output.output.reference_positions = [];
  output.output.reference_target    = null;
})();

// (b)+(d) stated tiers → output.access_levels as TIER TOKENS, every turn. Deterministic and
// idempotent: tier tokens already present (e.g. from the pick above) pass straight through.
//
// D9 (UAC round 1, fork execs 12041502/12041592): the brand must be harvested HERE, in the same
// block, because this is the LAST point where the raw compound level still exists. Measured: for
// "cabana dealer promo for CBS212-WH" the LLM emits access_levels ["Cabana Dealer"] and NO brand
// entity, while "cabana promo for CBS212-WH dealer" emits the entity and a bare "dealer" — so an
// entities-only read made a SECURITY BOUNDARY depend on word order. `statedBrands` unions both
// sources. Fed the RAW LLM levels (the frozen `_parser_raw_snapshot`, plus whatever is on
// access_levels right now) — one line later they are tier tokens and the brand is unrecoverable.
// This is D6-compliant: no new LLM field, derived deterministically in output_exchange.
{
  const _msgT = String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0];
  const _rawLevels = [].concat(
    Array.isArray(_parser_raw_snapshot && _parser_raw_snapshot.access_levels) ? _parser_raw_snapshot.access_levels : [],
    Array.isArray(output.output.access_levels) ? output.output.access_levels : []);
  // F3: `_msgT` is the third, DETERMINISTIC source — the customer's own words. Without it the
  // brand gate applied only when the LLM chose to emit the brand somewhere (exec 12059952 emitted
  // it nowhere, and two Cabana files went out unnoticed to a Sorento-only contact).
  output.output.query_brands = statedBrands(output.output.entities, _rawLevels, _msgT);
  // F7 (execs 12057894 → 12057965): the brand is part of the QUERY SCOPE, so it must travel with
  // the scope. The promo/tier scope-reuse blocks carry the previous turn's ENTITIES forward, but
  // the carried brand entity comes back re-typed (`hint: 'brand'` → `'promotion'`), so statedBrands
  // finds nothing and query_brands collapses to []. A turn-1 brand DENIAL was therefore evaded by
  // any continuation ("2", "the august one") — no tier ask involved.
  // This is NOT the carry D4 deleted: D4 is about the TIER, a per-turn CHOICE that goes stale
  // (pick office once, get office forever). A brand the customer named constrains the question
  // itself, exactly like the product code beside it.
  // Two conditions, both required, so the carry can never widen or silently narrow:
  //   - this turn named NO brand of its own (otherwise the new brand REPLACES, never unions);
  //   - this turn is genuinely REUSING the previous scope — an `entity_op: 'reuse'`, or entities
  //     that exist and are all carried. A turn with a NEW entity, or with no scope at all, starts
  //     clean rather than inheriting a constraint the customer did not restate.
  if (!output.output.query_brands.length) {
    const _prevBrands = (Array.isArray(prevState.query_brands) ? prevState.query_brands : [])
      .filter(b => BRANDS.includes(String(b ?? '').toLowerCase()));
    const _ents = Array.isArray(output.output.entities) ? output.output.entities : [];
    const _reusingScope = output.output.entity_op === 'reuse'
      || (_ents.length > 0 && !_ents.some(e => e && e.current_message === true));
    if (_prevBrands.length && _reusingScope) {
      output.output.query_brands = BRANDS.filter(b => _prevBrands.includes(b));
      output.output._query_brands_carried = true;
    }
  }
  const _set = new Set(statedTiers(_msgT, output.output.entities));
  for (const a of _rawLevels) {
    const s = String(a ?? '').trim().toLowerCase();
    if (TIER_ORDER.includes(s)) { _set.add(s); continue; }
    const p = parseLevel(a);
    if (p) _set.add(p.tier);
  }
  output.output.access_levels = TIER_ORDER.filter(t => _set.has(t));
  // F4(b): carry the PICKED TIER across a continuation of the same question. Measured: after
  // "2" -> 2 DEALER files, "the august one" returned 6 files across every tier, because D4 keeps
  // the tier out of session state and D11 forbids re-asking on a continuation, so the turn filtered
  // by nothing at all.
  // This is NOT the carry S3 deleted. That one was unconditional, so a tier chosen once stuck for
  // the whole session even across unrelated questions. Both conditions below are required, and the
  // second is what bounds it to the SAME question:
  //   - this turn states no tier of its own (a stated tier always wins, F4-3);
  //   - this turn reuses the previous scope, so a NEW query inherits nothing and the ask re-fires
  //     (D4 / TA-7 intact, F4-2).
  // Same predicate as the brand carry (D13) directly above; kept separate because the two axes can
  // legitimately disagree (new brand, same tier).
  if (!output.output.access_levels.length) {
    const _prevTiers = (Array.isArray(prevState.access_levels) ? prevState.access_levels : [])
      .map(t => String(t ?? '').trim().toLowerCase()).filter(t => TIER_ORDER.includes(t));
    const _ents2 = Array.isArray(output.output.entities) ? output.output.entities : [];
    const _reusing2 = output.output.entity_op === 'reuse'
      || (_ents2.length > 0 && !_ents2.some(e => e && e.current_message === true));
    if (_prevTiers.length && _reusing2) {
      output.output.access_levels = TIER_ORDER.filter(t => _prevTiers.includes(t));
      output.output._tier_carried = true;
    }
  }
}

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

  // (C) A CUSTOMER PICK NARROWS *WHO*, NOT *WHAT* (captain, 2026-08-20) ──────
  // The positional path replaces the whole entity set with the picked rows, so answering the
  // "Which customer do you mean?" picker threw the rest of the question away: "yoo living delivery
  // status for srtwc286" -> pick "1" -> EVERY order for YOO LIVING HOUSE, the product gone (exec
  // 13214595; the session carried both entities into that turn). Re-attach the prior scope for every
  // OTHER entity type, exactly as (B) re-attaches attachment_type. The customer itself is
  // deliberately NOT carried — replacing it is the entire point of the pick.
  if (Array.isArray(output.output.entities)
      && output.output.entities.some(e => e && String(e.hint || '').toLowerCase() === 'customer' && e.ordinal !== undefined)) {
    const _cpPrior = Array.isArray(prevState.entities) ? prevState.entities : [];
    const _cpKey = (e) => String((e && e.hint) || '').toLowerCase() + '|'
      + String((e && (e.canonical_code || e.raw)) || '').toLowerCase();
    const _cpSeen = new Set(output.output.entities.map(_cpKey));
    for (const _p of _cpPrior) {
      const _h = String((_p && _p.hint) || '').toLowerCase();
      if (!_h || _h === 'customer') continue;
      const _k = _cpKey(_p);
      if (_cpSeen.has(_k)) continue;
      output.output.entities.push({ ..._p, current_message: true });
      _cpSeen.add(_k);
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
  order: ['forms', 'form', 'promotion', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'attachment', 'resource_attachment', 'flyer'],  // 'spo' removed: PS-codes resolve as customer_order; bare code hinted spo must survive reuse under order domain
  incoming: ['forms', 'form', 'attachment', 'promotion', 'customer', 'transporter', 'warehouse', 'spo', 'grn', 'goods_receive', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer', 'resource_attachment'],
  portal_link: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  // 'brand' + 'category' added 2026-08-09 (live exec 11818957). A promotion turn leaves
  // brand='Sorento' / category='pop up waste' in state; the next turn "Container status report"
  // routed correctly to resource_attachment but CARRIED both (current_message:false). 'Sorento'
  // then fuzzy-matched promotion PDFs, those promo uuids joined compatible_entities, and the
  // customer got "Couldn't pin down Sorento" + three promo PDFs instead of the container file.
  // `crm_resource_attachments_list` has NO brand or category param, so these hints can never
  // narrow a document lookup — they can only pollute it. Same treatment order/incoming give them.
  resource_attachment: ['forms', 'form', 'product', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type', 'flyer', 'brand', 'category'],
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

// ── S3 (promotion-picker): the access-level CARRY IS DELETED ────────────────────────────
// It made a level chosen once sticky for the rest of the session: ask for office, then ask
// for dealer, still get office (reproduced, PP-0b). Entitlement is now re-read from CRM every
// turn (spine S2b), so there is nothing to go stale and nothing to carry.
//
// ── S5 (promotion-picker): a positional pick carries its own scope ──────────────────────
// "1 and 2" resolves to reference_positions but entities:[] — entity_op is already 'reuse',
// yet nothing reinstates the scope, so the gate sees a scope-less promotion ask and refuses
// (measured exec 11827959). Reuse the PREVIOUS turn's entities so the SAME query re-runs and
// the positions still line up with the roster the customer is looking at. Promotion domain
// only, and only when this turn resolved no entity of its own.
{
  const _prev = $('When Executed by Another Workflow').first().json.previous_conversation_state || {};
  const _picking = Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0;
  const _noScope = !Array.isArray(output.output.entities) || output.output.entities.length === 0;
  // The pick must NOT become the new scope. The parser resolves positions into the PICKED
  // promotion's own entities; letting that stand narrows the next query to that one promotion,
  // so the roster collapses to 1 and every later number returns the same file (reproduced:
  // 7 listed, "5" correct, then "3" returned #5 again).
  // Reuse the previous turn's NON-promotion scope on every promotion pick — not only when this
  // turn resolved nothing — so repeat picks keep addressing the list the customer can see.
  // QUOTE-REPLY WINS. When the customer quote-replies an OLDER list, the parser has already
  // resolved the position against `referenced_result_set` — that IS the right answer, and the
  // scope reuse below would discard it and re-run the PREVIOUS turn's query instead, returning
  // the wrong promotion (PP-7: quoted list #2 vs current list #2).
  const _quoted = Array.isArray(parent_input.referenced_result_set) && parent_input.referenced_result_set.length > 0;
  // F1: a numbered pick on a promotion DID-YOU-MEAN offer also arrives with reference_positions.
  // The dym path has already resolved the customer's choice; overwriting entities with the
  // previous turn's scope would discard the pick and re-run the failing query.
  //
  // ⚠️ `reference_target === 'dym'` is NOT that signal — it is the model's DEFAULT and comes back
  // 'dym' on an ordinary promo-roster pick too (measured: reference_target 'dym', entities [],
  // no dym set anywhere). Gating on it broke EVERY repeat pick. The real discriminator is whether
  // a dym offer was actually PENDING in the previous state.
  const _prevDym = (Array.isArray(_prev.dym_last_result_set) && _prev.dym_last_result_set.length > 0)
                || !!(_prev.dym_offer && typeof _prev.dym_offer === 'object');
  const _dymPick = _prevDym || output.output.dym_pick_applied === true;
  // F10: do NOT drop promotion-hinted entities here. Q25 allows a list scoped BY A PROMOTION
  // NAME; filtering those out left _prevScope empty, nothing was reused, the picked promotion
  // became the new scope and the roster collapsed to 1 — the exact defect fixed for
  // product-scoped lists, still live for promotion-name-scoped ones.
  // Reusing prev.entities wholesale is safe because THIS block is what writes them: on every
  // promotion pick we overwrite entities with the reused scope, so the persisted state carries
  // the ORIGINAL scope, never the pick.
  const _prevScope = (_quoted || _dymPick) ? [] : (Array.isArray(_prev.entities) ? _prev.entities : []);
  if (output.output.domain_hint === 'promotion' && _picking && _prevScope.length > 0) {
    output.output.entities = _prevScope.map(x => ({ ...x, current_message: false }));
    output.output.entity_op = 'reuse';
    output.output._promo_pick_scope_reused = true;
    // N2: name WHICH rows were picked, from the roster the customer actually saw. promo-picker
    // prefers these over a raw index — indexing assumes the re-run returns the same order as the
    // turn that built the roster, and nothing guarantees that.
    const _roster = _quoted
      ? (Array.isArray(parent_input.referenced_result_set) ? parent_input.referenced_result_set : [])
      : (Array.isArray(_prev.last_result_set) ? _prev.last_result_set : []);
    if (_roster.length) {
      output.output._promo_pick_labels = output.output.reference_positions
        .map(n => (_roster[Number(n) - 1] || {}).label)
        .filter(Boolean);
    }
  } else if (output.output.domain_hint === 'promotion' && _picking && _noScope && !_quoted && !_dymPick
             && Array.isArray(_prev.entities) && _prev.entities.length > 0) {
    output.output.entities = _prev.entities.map(x => ({ ...x, current_message: false }));
    output.output.entity_op = 'reuse';
    output.output._promo_pick_scope_reused = true;
  }
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
// brand-company-routing: normalise the LLM's legacy memory / a prior-state carry of the suffixed
// promotion team to the single base team (the CRM resolves the brand via brand_code, not the name).
if (/^marketing_promotion_(sorento|cabana|mocha)$/.test(String(output.output.routing.suggested_team || ''))) {
  output.output.routing.suggested_team = 'marketing_promotion';
}



// ── miss-company-routing: company-pick resolver (shared by the Δ3 member-offer arm and the
// rev-4 open-offer arm below) ──────────────────────────────────────────────────────────────
// The offer (or the clarify ask after a bare "yes" on a multi-company offer) names companies; a
// SHORT reply that word-boundary-matches exactly ONE company of the OFFERED pool — and matches no
// member row — is a pool pick, not a new query. Emitted as escalation.company_pick (the CANONICAL
// company_name from state, NO preferred_assignee_id): the spine's escalation-context resolves it
// against the same persisted pool. Member tiers outrank it (see the Δ3 arm). >1 company matched ⇒
// ambiguous ⇒ no pick (the reprompt/clarify arms handle it).
// rev-3: confirmation / filler tokens are stripped word-level (case-insensitive,
// punctuation-insensitive) BEFORE matching, so "yes mocha" / "mocha please" / "ok the mocha one" all
// reduce to "mocha"; a reply that strips to NOTHING ("yes", "ok pls") is a plain confirmation.
// rev-4 (captain console 2026-08-18, clone execs 12910551 / 12910575 / 12910616):
//  (A) POOL = the companies actually OFFERED: routing_roster_plan when the plan is non-empty (those
//      are the rosters shown), routing_companies ONLY when no plan exists (no roster offered — the
//      photo/marketing case). Never the union: on a Sorento-only partial-miss offer "yes mocha" must
//      NOT route to Mocha (Mocha was never offered) — it degrades to whatever the reply is without the
//      company word (a plain "yes" ⇒ the single offered pool, per the offer text).
//  (B) company CODES + aliases resolve as picks — the offer state only carries names, but customers
//      reply with the CRM company code ("srt", "yes please escalate to srt team"). No upstream code
//      source exists on the offer turn (resolve-entity matches and get-results' lookup_companies carry
//      {company_id, company_name} only), so _CO_ALIASES is a STOPGAP kept byte-identical here and in
//      the spine's escalation-context; the real source would be the CRM companies.code column threaded
//      resolve-entity match → disallowed-entity-gate.routing_companies[].company_code → the persisted
//      plan rows — pool rows carrying company_code/code are already honoured below. Match order per
//      company: name → code → alias, case-insensitive, word-boundary; exactly ONE company may hit.
//  (C) bound: the deterministic tier runs on (i) a reply of ≤4 words (rev-3 rule, unchanged), or (ii)
//      a LONGER reply whose filler-stripped remainder is ≤6 words AND carries no product-code-like
//      token, no current-message entity, and was not classified as a domain query by the LLM — so "yes
//      please escalate to srt team" / "can you route this to the sorento team please" resolve, while
//      "any mocha promotions this month" (domain promotion) and "check stock MUB6201 sorento" (product
//      code) stay new queries (LESSON 39). Any product-code-like token refuses the pick on BOTH paths.
//      rev-5 (F5): the ≤4-word path applies the SAME entity/domain guard once the stripped remainder has
//      ≥2 tokens ("mocha promotions", "show sorento orders" ⇒ answered); a single token stays unguarded.
//  (D) a negator anywhere in the reply ("no", "not mocha", "don't want sorento") refuses the pick —
//      never assign against a stated negative; the decline / reprompt arms handle it.
//  (E) `multi` = the offered pool has >1 company (routing_roster_plan.length > 1 — the same criterion
//      escalation-context uses for multi_company_unpicked): an unresolved reply on a MULTI pool must
//      not drop the offer (see the offer_hold emission in the Δ3 arm).
const _CO_ALIASES = { sorento: ['sorento', 'srt'], mocha: ['mocha', 'mch'], cabana: ['cabana', 'cbn'] };   // STOPGAP — mirror of escalation-context; real source = CRM companies.code
const _coFillers = new Set(['yes','ya','yeah','yep','yup','ok','okay','okie','oki','k','sure','please','pls','plz','pl','kindly','team','the','a','an','to','for','of','on','at','in','route','assign','escalate','escalation','pass','send','forward','transfer','connect','pick','choose','select','prefer','handle','help','one','lah','la','leh','lor','ah','go','with','it','that','this','then','can','could','would','like','want','need','you','me','my','us','i','ill','id','company','side','instead','guys','ppl','people','staff','department','dept','group','thanks','thank','ty','tq']);
const _coNegators = new Set(['no','not','nope','nah','never','dont','neither','nor','none','without','except','cancel','stop']);
const _coTok = w => String(w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function _coCompanyPick(o) {
  const st = parent_input.previous_conversation_state || {};
  const rp = Array.isArray(st.routing_roster_plan) ? st.routing_roster_plan : [];
  const src = rp.length ? rp : (Array.isArray(st.routing_companies) ? st.routing_companies : []);   // (A) offered pool
  const pool = new Map();   // lower(company_name) -> { name (canonical, as persisted), keys: Set(name|code|alias) }
  for (const c of src) {
    if (!c || !c.company_name) continue;
    const name = String(c.company_name); const nk = name.toLowerCase().trim();
    const ent = pool.get(nk) || { name, keys: new Set() };
    ent.keys.add(nk);
    for (const ck of [c.company_code, c.code]) if (typeof ck === 'string' && ck.trim()) ent.keys.add(ck.toLowerCase().trim());   // (B) code, when a source ever carries it
    for (const a of (_CO_ALIASES[nk] || [])) ent.keys.add(a);                                                              // (B) alias stopgap
    pool.set(nk, ent);
  }
  const rawReply = String(parent_input.latest_user_message || '').split(/\s*reply to:/i)[0].trim();
  const words = rawReply.split(/\s+/).filter(Boolean);
  const kept = words.filter(w => !_coFillers.has(_coTok(w)));                                            // reply minus fillers (any length)
  const hasNeg = words.some(w => _coNegators.has(_coTok(w)));                                            // (D)
  const prodTok = words.some(w => /^[a-z]{2,}[a-z0-9-]*\d/i.test(String(w).replace(/[^a-z0-9-]/gi, '')));   // (C) MUB6201 / SRTKT72SS / MWCX7608-SH-S10
  const curEnt = (Array.isArray(o.entities) ? o.entities : []).some(e => e && e.current_message === true);
  const domainQ = (!!o.domain_hint || o.message_type === 'business_query' || o.message_type === 'clarification') && o.is_affirmative !== true;   // == the Δ3 arm's _isNewQuery (kept in lockstep)
  // rev-5 (reviewer F5): the SHORT path (≤4 words) is unguarded ONLY while the filler-stripped remainder is a
  // single token ("srt", "mocha", "yes mocha team please" ⇒ ["mocha"]); a ≥2-token remainder ("mocha promotions",
  // "sorento stock MUB", "show sorento orders", "mocha promotions this month") must ALSO carry no current-message
  // entity and not be a domain query — the same guard as the long path — so a short new query naming an offered
  // company right after an offer is answered, not turned into a company-scoped escalation (LESSON 39).
  const shortOk = words.length > 0 && words.length <= 4 && (kept.length < 2 || (!curEnt && !domainQ));
  const longOk  = words.length > 4 && kept.length > 0 && kept.length <= 6 && !curEnt && !domainQ;
  const hits = (texts) => {   // exactly-one company, word-boundary on ANY of its keys, across the given lower-cased texts
    const h = new Set();
    for (const ent of pool.values()) {
      for (const k of ent.keys) {
        const re = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
        if (texts.some(t => re.test(t))) { h.add(ent.name); break; }
      }
    }
    return h.size === 1 ? [...h][0] : null;
  };
  const pick = (() => {   // deterministic tier
    if (!pool.size || hasNeg || prodTok) return null;
    const texts = [];
    if ((shortOk || longOk) && kept.length) texts.push(kept.join(' ').toLowerCase());
    const pmRaw = (typeof o.person_mention === 'string' && o.person_mention.trim()) ? o.person_mention.trim().toLowerCase() : '';
    if (pmRaw) texts.push(pmRaw);
    if (!texts.length) return null;
    return hits(texts);
  })();
  // rev-3 semantic fallback: the LLM may name the picked company (escalation.company_pick, read from the
  // frozen raw snapshot — the live key was stripped at the top). ACCEPTED only after validation: exactly
  // one OFFERED company matches it (case-insensitive name/code/alias, else word-boundary exactly-one) AND
  // the reply is not a bare confirmation (strips to nothing ⇒ a hallucinated pick on "yes" is refused)
  // AND (rev-4) no negator, and the LLM did not classify the turn as a domain query. Deterministic wins.
  const pickLlm = (() => {
    try {
      if (!pool.size || !kept.length || hasNeg || domainQ) return null;
      const raw = _parser_raw_snapshot && _parser_raw_snapshot.escalation ? _parser_raw_snapshot.escalation.company_pick : null;
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const k = raw.toLowerCase().trim();
      const direct = [...pool.values()].filter(ent => ent.keys.has(k));
      if (direct.length === 1) return direct[0].name;
      if (direct.length > 1) return null;
      return hits([k]);
    } catch (e) { return null; }
  })();
  return { pool, pick, pickLlm, any: pick || pickLlm, multi: rp.length > 1, hasNeg, kept, words };
}

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

  // ── miss-company-routing §2 / rev-4: company pick (resolver hoisted above this arm: _coCompanyPick) ──
  const _co = _coCompanyPick(_o);
  const _coPickAny = _co.any;
  // rev-4: an unresolved reply on a MULTI-company pool must NOT drop the offer. Emit the reprompt
  // marker WITHOUT correction:true (the If10 re-offer path would refetch a fallback roster and replace
  // the shown pool) plus escalation.offer_hold — the spine's offer-hold-gate replies with the clarify
  // ask and RE-persists the offer state, so the next reply still resolves. Single-company pools keep
  // the pre-rev-4 reprompt semantics (correction:true → member-list re-offer via If10).
  const _coReprompt = (kind) => {
    output.output.escalation = _co.multi
      ? { is_escalation_confirmation: false, member_reprompt: kind, offer_hold: true }
      : { is_escalation_confirmation: false, member_reprompt: kind };
    output.output.correction = !_co.multi;   // multi: explicitly NOT the If10 re-offer (the offer-hold-gate sits before If10 anyway)
  };

  // ── entry-gate precedence: 1 retarget → 2 pick → 3 new-query abandon → 4 junk reprompt ──
  const _priorTeam = norm(priorRouting.suggested_team) || 'customer_service';
  // exec 13045880 / 13206773 ("4 smart delivery status" on a 4-member offer): the loose "any bare-digit
  // word in a <=4-word reply" arm of _extract read the customer NAME "4 smart" as pick #4 and escalated
  // a delivery question. That arm is a best-effort guess, not a pick the customer typed (bare "4", "#4",
  // "option 4", "4th" are still matched by the strict arms). Keep the guess ONLY when the LLM did not
  // read the turn as a new business query; a business_query carrying a current-message entity that
  // CONTAINS the digit token is the name, not a position. _forcePick (whole reply is a number / a member
  // name) is untouched, so LESSON 39's wrong-assign guarantee stands.
  let _pos = _extract(parent_input.latest_user_message, output.output.reference_positions);
  {
    const _t = String(parent_input.latest_user_message || '').split(/\s*reply to:/i)[0].trim().toLowerCase();
    const _strict = (Array.isArray(output.output.reference_positions) && output.output.reference_positions.length)
      || /^#?\s*\d+$/.test(_t)
      || Object.keys(_ORD).some(w => new RegExp('\\b' + w + '\\b').test(_t))
      || /\b(?:option|number|no\.?|choice)\s*#?\s*\d+/.test(_t);
    const _llmNewQuery = (!!_o.domain_hint || _o.message_type === 'business_query') && _o.is_affirmative !== true;
    const _digitInEntity = (Array.isArray(_o.entities) ? _o.entities : []).some(e => e && e.current_message
      && _pos.some(n => new RegExp('(^|\\D)' + n + '(\\D|$)').test(String(e.raw || ''))));
    if (!_strict && _pos.length && _llmNewQuery && _digitInEntity) _pos = [];
  }
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
    if (/^marketing_promotion_(sorento|cabana|mocha)$/.test(String(_llmTeamN))) output.output.routing.suggested_team = 'marketing_promotion';   // brand-company-routing: same normalisation on the retarget arm
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
      _coReprompt('multi');           // re-offer the member list (only one allowed) / rev-4: hold a multi pool
    } else if (_pos.length === 1) {
      _coReprompt('out_of_range');    // re-offer the member list / rev-4: hold a multi pool
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
        _coReprompt('multi');           // ambiguity gate: reprompt, NEVER auto-pick
      } else if (_coPickAny) {
        // miss-company-routing: the person-extractor surfaced a company name; no member matched →
        // it is the company pick, not an unknown person.
        output.output.escalation = { is_escalation_confirmation: true, company_pick: _coPickAny };
        output.output.entities = [];
      } else {
        _coReprompt('out_of_range');    // 0 match -> reprompt the member list / rev-4: hold a multi pool
      }
    } else if (_o.is_affirmative === true) {
      // rev-3: "yes mocha" — the LLM reads it as an affirmative, which used to land here as a bare
      // confirmation (⇒ re-clarify on a multi-company pool). No member resolved on this arm, so a
      // validated company pick rides the confirmation; without one it is the plain round-robin yes.
      output.output.escalation = _coPickAny
        ? { is_escalation_confirmation: true, company_pick: _coPickAny }
        : { is_escalation_confirmation: true };   // no preferred -> round-robin
    } else if (_o.is_affirmative === false && _coPickAny) {
      // rev-4: the LLM read a decline but the reply names exactly ONE offered company with no
      // negator ("nah just sorento" is refused by the negator rule — see _coCompanyPick (D); this
      // arm is reached e.g. when is_affirmative=false was inferred from tone) → company pick.
      output.output.escalation = { is_escalation_confirmation: true, company_pick: _coPickAny };
      output.output.entities = [];
    } else if (_o.is_affirmative === false) {
      // §10 Part 2 — plain decline (no position/person_mention pick, no named-team retarget;
      // Tier 1 already consumed request_for_help + team != prior). Emit a DETERMINISTIC decline
      // marker the spine's is-escalation-declined IF keys on, so the reply is a FIXED
      // "Escalation declined." and NEVER the clarification LLM. Do NOT set correction/member_reprompt.
      output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
      output.output.message_type = 'casual';
    }
    output.output.member_pick_context = true;
  } else if (_coPickAny) {
    // Tier 2.5 — COMPANY PICK (miss-company-routing): no member/number/yes-no signal, but the
    // short reply (deterministic, filler-stripped) or the validated LLM company_pick names exactly
    // one persisted company → confirm the escalation scoped to it.
    output.output.escalation = { is_escalation_confirmation: true, company_pick: _coPickAny };
    output.output.entities = [];
    output.output.member_pick_context = true;
  } else if (_isNewQuery) {
    // Tier 3 — NEW QUERY: abandon the offer. Do NOT set member_pick_context and do NOT touch
    // routing/escalation/entities — normal downstream processing answers it.
  } else {
    // Tier 4 — junk / no signal: reprompt the member list once (rev-4: hold a multi pool instead).
    _coReprompt('out_of_range');
    output.output.member_pick_context = true;
  }
}
// ── rev-4: company pick on an OPEN offer WITHOUT member-pick context ──
// The Δ3 arm is entry-gated on selection_context === 'member_offer'. An escalation offer can be
// open without it (a multi-company offer whose rosters all came back empty; a persisted plan with
// no rows): a reply naming exactly ONE offered company still engages the offer. "Open" = the FROZEN
// phrase is in the persisted previous response (the offer was the last bot message; a decline
// "Escalation declined." or any other reply clears it) — deliberately NOT the persisted roster plan,
// which the spine carries forward across same-team turns (incl. a decline) and would re-open a
// closed offer. Only the company tiers run here (there are no member rows to resolve against); a
// retarget to a different named team (Tier 1 semantics) still wins; a reply carrying a concrete
// domain_hint is a new query and is left untouched; everything else is byte-identical to before.
if (_selCtx !== 'member_offer' && output.output.dym_pick_applied !== true) {
  const _stO = parent_input.previous_conversation_state || {};
  const _openO = /would you like me to escalate/i.test(String(_stO.response || ''));
  if (_openO && !output.output.domain_hint) {
    const _coO = _coCompanyPick(output.output);
    const _retargetO = _reqHelp && _llmTeamN && _llmTeamN !== (norm(priorRouting.suggested_team) || 'customer_service');
    if (_coO.any && !_retargetO) {
      output.output.escalation = { is_escalation_confirmation: true, company_pick: _coO.any };
      output.output.entities = [];
      output.output.member_pick_context = true;
    }
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

// ── D11 — PENDING NON-TIER PICK (UAC round 1, fork execs 12041783 / 12041879) ─
// The spine's tier-gate must not fire the access-level ask on top of a pick the parser has
// ALREADY resolved. Measured: "2" against a 6-row suggest_offer roster resolved correctly here
// (reference_positions [2], entity_op 'reuse', no tier minted) and the ask then discarded it;
// "the august one" after the same answer re-asked instead of continuing (plan journey row 5).
//
// Placed LAST so every writer above has run: the promo scope-reuse block, dymNumberedMultiSelect,
// the reference-positions block and the Δ3 member arm all set the flags this reads.
//
// TWO signals, and the BOUND between them is the whole design:
//   (1) an explicitly RESOLVED pick — provenance flags, unambiguous;
//   (2) a CONTINUATION — a non-tier roster is pending AND this turn named no new scope.
// The `!_ppNamedNewScope` half is what keeps D4 alive: "promo for CBS212-WH" with a roster still
// pending IS a new query and MUST re-ask (TA-7). And prev `tier_offer` is excluded by name — the
// tier ask's own roster is not a foreign pick, or the ask could never legitimately re-fire.
{
  const _ppPrevCtx = String(prevState.selection_context || '');
  // `tier_offer` is excluded HERE and only here (a second outer `!== 'tier_offer'` guard was
  // written and then deleted: it was unreachable given this line and `_tier_pick_scope_reused`,
  // i.e. a clause no mutation could turn red — the decorative-guard smell, LESSONS §61).
  const _ppRosterPending = ['suggest_offer', 'member_offer', 'disambiguation'].includes(_ppPrevCtx)
    || (_ppPrevCtx !== 'tier_offer' && Array.isArray(prevState.last_result_set) && prevState.last_result_set.length > 0);
  const _ppNamedNewScope = (Array.isArray(output.output.entities) ? output.output.entities : [])
    .some(e => e && e.current_message === true);
  const _ppResolvedPick = output.output._promo_pick_scope_reused === true
    || output.output.dym_pick_applied === true
    || output.output.member_pick_context === true
    || Number(output.output.positions_resolved) > 0
    || output.output.select_all_expanded === true
    || (Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0);
  if (output.output._tier_pick_scope_reused !== true
      && (_ppResolvedPick || (_ppRosterPending && !_ppNamedNewScope))) {
    output.output._pending_pick = true;
  }
}

output._parser_raw = _parser_raw_snapshot;
return output