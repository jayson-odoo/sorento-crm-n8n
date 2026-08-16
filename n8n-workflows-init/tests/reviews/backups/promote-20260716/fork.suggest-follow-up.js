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
return output;

