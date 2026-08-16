(() => {
  const parser = $("Call 'sub-query-reformulator'").first().json.output;
  // access-tier-ask-plan §3/§4: the tier×brand→compound recomposition is computed ONCE, in
  // tier-gate (byte-embedded mapper: chosen/stated tiers × query brand ∩ entitlement, with
  // brand_gate_empty FAIL-CLOSED and the Q23 unheld-tier fallback). This lane just reads it —
  // the S2b entitlement-union expression is replaced. tier-gate executes exactly when
  // Aggregate does (same promotion lane); off that lane the parser's own access_levels pass
  // through untouched (legacy behaviour — usually []).
  const _tgOk = $('tier-gate').isExecuted;
  const accessLevels = _tgOk
    ? $('tier-gate').first().json.access_levels_recomposed
    : (Array.isArray(parser.access_levels) ? parser.access_levels : []);
  return {
    message_type:      parser.message_type      ?? null,
    intent_hint:       parser.intent_hint       ?? null,
    domain_hint:       parser.domain_hint       ?? null,
    user_goal:         parser.user_goal         ?? null,
    access_levels:     accessLevels,
    contact_id:        $("sorento-sub-respond-findcontact-respond").first().json.id.toString() ?? null,
    space_id:          "364817",
    date_mode:         parser.date_mode         ?? null,
    date_filter_start: parser.date_filter_start ?? null,
    date_filter_end:   parser.date_filter_end   ?? null,
    is_active:         parser.is_active         ?? null,
    order_status:      parser.order_status      ?? null,
    requested_attributes: parser.requested_attributes ?? [],
  };
})()
