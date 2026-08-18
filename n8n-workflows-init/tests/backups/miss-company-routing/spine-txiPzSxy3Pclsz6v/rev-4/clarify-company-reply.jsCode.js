// ── clarify-company-reply (miss-company-routing, captain case B follow-up) ──
// A bare "yes" landed on a MULTI-company offer (escalation-context resolved
// routing_source === 'multi_company_unpicked'): silently assigning would round-robin a pool the
// customer never chose. clarify-company-gate has already diverted the HI call to here, so the
// escalation is NOT executed. This node only COMPOSES the clarify ask; it sends nothing itself:
// compile-current-state — which runs AFTER this branch (measured node order: the
// escalation-context chain completes before the tag-out-of-scope → ccs lane starts,
// exec 12836119) — sees this node executed, replaces the parser's confirmation text with
// clarify_text on the EXISTING guarded send path (crossdomain-compose →
// sorento-sub-respond-sendmsg-respond2, is_test=true on the clone) and RE-persists the prior
// offer state (frozen phrase + rows + roster plan) so the next reply — a number, a member name,
// or a company name (parser §2 company_pick) — still resolves against the same offer.
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const pools = (Array.isArray(prev.routing_roster_plan) && prev.routing_roster_plan.length)
  ? prev.routing_roster_plan
  : (Array.isArray(prev.routing_companies) ? prev.routing_companies : []);
const names = [...new Set(pools.map(p => p && p.company_name).filter(Boolean))];
const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '');
const list = names.length ? names.join(' / ') : 'the companies listed';
const lead = names.length === 2 ? `Both ${joined} teams are listed`
  : (joined ? `${joined} teams are listed` : `More than one team is listed`);
const clarify_text = `${lead} — reply a number, a name, or just the company (${list}) and I'll assign automatically.`;
return [{ json: { ...$input.first().json, clarify_company: true, clarify_text } }];
