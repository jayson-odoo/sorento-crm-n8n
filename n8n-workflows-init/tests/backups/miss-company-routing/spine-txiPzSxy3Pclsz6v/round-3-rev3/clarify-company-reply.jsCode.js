// ── clarify-company-reply / offer-hold-reply (miss-company-routing; ONE body deployed to BOTH nodes) ──
// A MULTI-company offer is open and this reply did not resolve it — either a bare "yes" (case B:
// escalation-context resolved routing_source === 'multi_company_unpicked' and clarify-company-gate
// diverted the HI call to `clarify-company-reply`; silently assigning would round-robin a pool the
// customer never chose), or (rev-4, node `offer-hold-reply`) the parser stayed in the offer but
// resolved nothing (escalation.offer_hold / member_reprompt on a multi pool — junk, out-of-range
// number, ambiguous name, small talk): offer-hold-gate routes here BEFORE If10 so neither the
// fallback member re-offer nor the clarification LLM can replace the shown pool.
// This node only COMPOSES the clarify ask; it sends nothing itself: compile-current-state — which
// runs AFTER this branch (case B: measured node order, exec 12836119; offer-hold: linear chain
// offer-hold-reply → tag-offer-hold → escalate-catalog → cs-offer-gate → ccs) — sees this node
// executed, puts clarify_text on the EXISTING guarded send path (crossdomain-compose →
// sorento-sub-respond-sendmsg-respond2, is_test=true on the clone) and RE-persists the prior offer
// state (frozen phrase + rows + roster plan + companies + selection_context) so the next reply — a
// number, a member name, or a company name/code (parser company_pick) — still resolves against
// the same offer. Only an explicit decline or a brand-new business query clears the offer.
// Copy (rev-4 captain decision): company names bold in the lead (WhatsApp single *asterisks*),
// "reply a number, a name, or the company (X / Y)"; codes (SRT / MCH / CBN) are accepted silently.
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const pools = (Array.isArray(prev.routing_roster_plan) && prev.routing_roster_plan.length)
  ? prev.routing_roster_plan
  : (Array.isArray(prev.routing_companies) ? prev.routing_companies : []);
const names = [...new Set(pools.map(p => p && p.company_name).filter(Boolean))];
const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '');
const list = names.length ? names.join(' / ') : 'the companies listed';
const bold = names.map(n => `*${n}*`);
const joinedBold = bold.length > 1 ? `${bold.slice(0, -1).join(', ')} and ${bold[bold.length - 1]}` : (bold[0] || '');
const lead = names.length === 2 ? `Both ${joinedBold} teams are listed`
  : (joinedBold ? `${joinedBold} teams are listed` : `More than one team is listed`);
const clarify_text = `${lead} — reply a number, a name, or the company (${list}) and I'll assign automatically.`;
return [{ json: { ...$input.first().json, clarify_company: true, clarify_text } }];
