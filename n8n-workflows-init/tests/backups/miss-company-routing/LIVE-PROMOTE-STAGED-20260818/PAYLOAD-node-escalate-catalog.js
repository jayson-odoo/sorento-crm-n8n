// ── escalate-catalog ────────────────────────────────
// Single source of truth for escalation/error messages + their behavior flags.
// Each upstream branch sets ONE field `branch_kind`; this node maps it to the
// message + flags that compile-current-state used to derive via a 7-arm ladder.
// Dynamic kinds (not_found, access_choice) pull their message by reference from
// the upstream Code node that computed it.
const qf  = $('Call \'sub-query-reformulator\'').first().json.output;
const out = $input.first().json;
const kind = out.branch_kind;

let response = '';
let manualResponse = false;
let includeResponse = true;
let is_escalate_offer = false;

switch (kind) {
  case 'not_found': {
    // Normal not-found path uses not-found-error-message. The incoming-picker
    // availability branch bypasses it (annotate-incoming-picker computes the same
    // escalate_message/require_specific/is_clarification), so fall back to that node.
    // dym-probe-before-offer (rev 6): PREFER THE ANNOTATED COPY.
    // build-suggest-offer is the annotation authority for the require-specific picker; it
    // SPREADS rather than mutates, so reading not-found-error-message by name here returns
    // the PRE-annotation string and silently discards the suffixes — computed correctly,
    // rendered bare. This is the same by-name landmine the annotate-incoming-picker
    // fallback below was added for; the suffix is NOT recomputed here.
    // Source order: build-suggest-offer (annotated) -> not-found-error-message ->
    // annotate-incoming-picker. Every source carries escalate_message, require_specific and
    // is_clarification on the SAME object, so the flags below stay coherent with the text
    // regardless of which one wins. Fail-open by construction: a missing, unexecuted or
    // malformed preferred source falls through to exactly today's behaviour.
    const _annotated = (() => {
      try {
        const n = $('build-suggest-offer');
        if (!n.isExecuted) return null;
        const j = n.first().json;
        return (j && typeof j.escalate_message === 'string' && j.escalate_message) ? j : null;
      } catch (e) { return null; }
    })();
    const nfNode = $('not-found-error-message');
    const nf = _annotated
            || (nfNode.isExecuted ? nfNode.first().json : $('annotate-incoming-picker').first().json);
    response       = nf.escalate_message;
    manualResponse = !nf.require_specific;
    is_escalate_offer = !nf.is_clarification;   // offer only when it's not a clarification prompt
    break;
  }
  case 'access_choice':
    response       = $('access-level-choice-message').first().json.escalate_message;
    manualResponse = true;
    break;
  case 'demand_qty':
    response       = 'Please specify your demand quantity';
    manualResponse = true;
    break;
  case 'not_supported':
    response       = "Sorry, we don't support direct goods receive & SPO at the moment. You may ask about incoming stock for a specific product or container";
    manualResponse = true;
    break;
  case 'clarify_menu':
    response       = `I see you're ${qf.user_goal}, Let me understand more.\n\nAre you asking about any of these?\n\n- Product (List Price, Dimension)\n- Photos, Technical Specs, Cert\n- Promotion\n- Forms\n- Stock\n- Delivery order\n- Incoming\n- Catalogue, Warranty\n\nI can help with the topics listed above.`;
    manualResponse = true;
    break;
  case 'escalate_offer': {
    // #9: prefer the resolved entity's company team over the parser's access-level guess.
    const _ct = (() => { try { const g2 = $('disallowed-entity-gate'); return g2.isExecuted ? (g2.first().json.company_team || null) : null; } catch (e) { return null; } })();
    response       = `I am sorry the provided answer does not meet your requirements. Would you like me to escalate to ${_ct || qf.routing.suggested_team} team?`;
  }
    manualResponse = true;
    is_escalate_offer = true;
    break;
  case 'out_of_scope':
    response        = `Informed the user that request is out of scope and will proceed to escalate to the ${qf.routing.suggested_team} team`;
    manualResponse  = true;
    includeResponse = false;
    break;
  case 'escalation_declined':
    response          = 'Escalation declined.';   // FIXED canned reply — no LLM shaping
    manualResponse    = true;
    includeResponse   = true;
    is_escalate_offer = false;                     // → cs-offer-gate FALSE → straight to compile-current-state
    break;
  case 'offer_hold':
    // miss-company-routing rev-4: an unresolved reply on an open MULTI-company offer. The clarify ask
    // was composed upstream by offer-hold-reply (same body as clarify-company-reply); pull it by
    // reference — no LLM, no roster refetch, and compile-current-state re-persists the offer state.
    response          = (() => { try { const n = $('offer-hold-reply'); return n.isExecuted ? String(n.first().json.clarify_text || '') : ''; } catch (e) { return ''; } })();
    manualResponse    = true;
    includeResponse   = true;
    is_escalate_offer = false;                     // → cs-offer-gate FALSE → straight to compile-current-state
    break;
}

out.response          = response;
out.manualResponse    = manualResponse;
out.includeResponse   = includeResponse;
out.is_escalate_offer = is_escalate_offer;
return out;
