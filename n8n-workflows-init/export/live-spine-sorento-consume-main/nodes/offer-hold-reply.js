// ── offer-hold-reply / clarify-company-reply (ONE body deployed to BOTH nodes) ────────────────
// A MULTI-company offer is open and this reply did not resolve it. Two lanes arrive here:
//   * clarify-company-reply — a bare "yes": escalation-context resolved
//     routing_source === 'multi_company_unpicked' and clarify-company-gate diverted the
//     human-intervention call here, because silently assigning would round-robin a pool the
//     customer never chose (the open live bug this node closes).
//   * offer-hold-reply — the parser stayed in the offer but resolved nothing
//     (escalation.member_reprompt 'out_of_range'/'multi', or escalation.offer_hold on a parser that
//     emits it): junk, an out-of-range number, an ambiguous name, small talk. offer-hold-gate routes
//     here BEFORE If10, so neither the fallback member re-offer nor the clarification LLM can
//     replace the pool that was already shown.
// This node only COMPOSES the clarify ask; it sends nothing itself. compile-current-state runs AFTER
// it on both lanes (clarify: measured node order, exec 12836119; offer-hold: the linear chain
// offer-hold-reply → tag-offer-hold → escalate-catalog → cs-offer-gate → compile-current-state),
// sees this node executed, puts clarify_text on the EXISTING send path (crossdomain-compose →
// sorento-sub-respond-sendmsg-respond2) and RE-persists the prior offer state (frozen phrase + rows
// + roster plan + companies + selection_context) so the NEXT reply still resolves against the same
// offer. Only an explicit decline or a brand-new business query clears it.
//
// COPY — the ask offers a NUMBER or a NAME, never a company. The company names are bold in the lead
// (WhatsApp single *asterisks*) so the customer can see which pools are in play, but they are not an
// affordance: the LIVE parser (sub-semantic-parser XTODTw @ 177c50a9) has NO company_pick handler —
// grepped, 0 occurrences — so a company-name reply comes back as Tier-4 junk and the bot re-prints
// this same ask, forever. Both gates upstream require an OPEN member picker before this node can run
// (offer-hold-gate: selection_context === 'member_offer'; clarify-company-gate: that PLUS a
// non-empty last_result_set), so a number or a name always has something to resolve against.
// Re-open the company affordance only in the same change that ships a parser which parses it.
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const pools = (Array.isArray(prev.routing_roster_plan) && prev.routing_roster_plan.length)
  ? prev.routing_roster_plan
  : (Array.isArray(prev.routing_companies) ? prev.routing_companies : []);
const names = [...new Set(pools.map(p => p && p.company_name).filter(Boolean))];
const bold = names.map(n => `*${n}*`);
const joinedBold = bold.length > 1 ? `${bold.slice(0, -1).join(', ')} and ${bold[bold.length - 1]}` : (bold[0] || '');
const lead = names.length === 2 ? `Both ${joinedBold} teams are listed`
  : (joinedBold ? `${joinedBold} teams are listed` : `More than one team is listed`);
const clarify_text = `${lead} - reply a number or a name and I'll assign automatically.`;
return [{ json: { ...$input.first().json, clarify_company: true, clarify_text } }];
