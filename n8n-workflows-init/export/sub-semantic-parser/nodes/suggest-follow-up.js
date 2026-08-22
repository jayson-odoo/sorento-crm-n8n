// ── suggest-offer follow-up (D4/D5) ────────────────────────────────────────
// Runs AFTER output_exchange (all entity-op / reference-position resolution done).
// When the PREVIOUS turn was a suggest_offer: a tapped code / typed position → re-query
// in the RETAINED domain (never a CS assign); plain "yes" → escalate; "no" → decline+stop.
// Inert on every other turn → parser output byte-identical when selection_context differs.
const output = $input.first().json;
const parent_input = $('When Executed by Another Workflow').first().json;
const prevState = parent_input.previous_conversation_state || {};
if (output && output.output && prevState.selection_context === 'suggest_offer') {
  const _o = output.output;
  const _hasEntityPick = Array.isArray(_o.entities) && _o.entities.some(e => e.current_message === true);
  const _hasPosPick    = Array.isArray(_o.reference_positions) && _o.reference_positions.length > 0;
  if (_hasEntityPick || _hasPosPick) {
    // a bare code (button tap) or a position was given → keep prior domain when the
    // reply carried no decisive domain term, then let normal processing re-query.
    if (!_o.domain_hint && prevState.domain_hint) {
      _o.domain_hint  = prevState.domain_hint;
      _o.intent_hint  = _o.intent_hint || prevState.intent_hint;
      _o.domain_inherited_for_suggest = true;
    }
    if (_o.domain_hint) _o.message_type = 'business_query';
  } else if (_o.is_affirmative === true) {
    // plain "yes" on a suggest_offer = escalate, ALWAYS (never a pick)
    _o.escalation = { is_escalation_confirmation: true };
    _o.entities = [];
  } else if (_o.is_affirmative === false) {
    // "No, it's okay" = decline + acknowledge + stop
    _o.escalation = { is_escalation_confirmation: false, escalation_declined: true };
    _o.message_type = 'casual';
    _o.entities = [];
  }
  _o.suggest_pick_context = true;
}

// ── unicode dash normalize ──────────────────────────────────────────────────
// Excel/Word/Sheets/PDF copy-paste emits U+2212 MINUS SIGN, U+2013 EN DASH and
// friends instead of ASCII '-'. Observed live (exec 12053189): "SRT332−GM" carrying
// a U+2212 reached the resolver verbatim, missed the exact match because the CRM
// stores that code with an ASCII hyphen, and only survived as a did-you-mean — one
// tap away from a code the customer had already typed correctly.
//
// Sits at the END of the LAST node in the sub, so it folds whatever the whole
// pipeline finally settled on, and resolve-entity + get-results both see the ASCII
// form. Runs on EVERY turn — deliberately outside the suggest_offer branch above.
// Covered by tests/unit/entity-dash-normalise.test.js (15 cases, 7 mutants).
const _DASHES = /[‐-―−﹘﹣－]/g;
if (output && output.output && Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) {
    if (!e) continue;
    if (typeof e.raw === 'string') e.raw = e.raw.replace(_DASHES, '-');
    if (typeof e.canonical_code === 'string') e.canonical_code = e.canonical_code.replace(_DASHES, '-');
  }
}

return output;
