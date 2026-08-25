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
// COPY — the ask offers a NUMBER, a NAME, or the COMPANY (company-pick part 3, restored 2026-08-25).
// The affordance was stripped while the LIVE parser had no company_pick handler (a company-name
// reply came back as Tier-4 junk and this ask re-printed forever); the parser now carries the
// deterministic _coCompanyPick arm (sub-semantic-parser XTODTw @ 8717de6b, live), which resolves a
// bare company name, a *bold* copy of it, or a company code/alias (SRT / MCH / CBN) against the
// SAME persisted pool this node prints (routing_roster_plan, else routing_companies),
// case-insensitively and word-boundary, and emits a validated escalation.company_pick that
// escalation-context's cpickRow consumes. A name outside the offered pool — or a reply naming two —
// resolves to nothing and re-prints this ask: fail-closed, never a wrong assign. When the pool
// carries NO names at all (degraded state) the parser has nothing to match (_coCompanyPick refuses
// every pick on an empty pool), so the ask degrades to number/name only — never invite a reply that
// cannot resolve. Company names are bold in the lead AND in the parenthetical (WhatsApp single
// *asterisks*); D5 dedup: two pool rows sharing one company_name collapse to ONE printed name, and
// that single-name parenthetical still resolves (the pool keys are per-name). Both gates upstream
// require an OPEN member picker before this node can run (offer-hold-gate: selection_context ===
// 'member_offer'; clarify-company-gate: that PLUS a non-empty last_result_set), so a number or a
// name always has something to resolve against.
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const pools = (Array.isArray(prev.routing_roster_plan) && prev.routing_roster_plan.length)
  ? prev.routing_roster_plan
  : (Array.isArray(prev.routing_companies) ? prev.routing_companies : []);
const names = [...new Set(pools.map(p => p && p.company_name).filter(Boolean))];
const bold = names.map(n => `*${n}*`);
const list = bold.join(' / ');
const joinedBold = bold.length > 1 ? `${bold.slice(0, -1).join(', ')} and ${bold[bold.length - 1]}` : (bold[0] || '');
const lead = names.length === 2 ? `Both ${joinedBold} teams are listed`
  : (joinedBold ? `${joinedBold} teams are listed` : `More than one team is listed`);
const clarify_text = names.length
  ? `${lead} - reply a number, a name, or the company (${list}) and I'll assign automatically.`
  : `${lead} - reply a number or a name and I'll assign automatically.`;
return [{ json: { ...$input.first().json, clarify_company: true, clarify_text } }];
