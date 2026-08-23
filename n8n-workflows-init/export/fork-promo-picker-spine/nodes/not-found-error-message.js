const q    = $('Call \'sub-query-reformulator\'').first().json.output;
const r    = $('resolve-entity').first().json ?? {};
const gate = $('disallowed-entity-gate').first().json ?? {};

const resolvedTypes = r?.by_entity_type ? Object.keys(r.by_entity_type) : [];
const parserHints   = Array.isArray(q?.entities) ? q.entities.map(e => e.hint) : [];
const haveAttachmentType =
  resolvedTypes.includes('attachment_type') || parserHints.includes('attachment_type');

const gatePassed = gate.gate_passed !== false;
const gateReason = gate.gate_reason || '';
const allowedTypes = gate?.gate_debug?.allowed_lookup ?? [];


// readable list: ['product','category','brand'] -> "product, category, or brand"
const humanList = (arr) => {
  const a = arr.filter(Boolean);
  if (a.length === 0) return 'a valid value';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')}, or ${a[a.length - 1]}`;
};

const missingAttachmentType =
  q.domain_hint === 'product_attachment' && !gatePassed && !haveAttachmentType;
const unresolved = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
const hasUnresolved = unresolved.length > 0;

// needsScope = gate failed for lack of scope AND the user genuinely gave nothing.
// If they gave a token that just didn't resolve, that's a lookup miss, not a scope gap.
const needsScope =
  !gatePassed && !missingAttachmentType && !hasUnresolved &&
  /requires a scoping entity/.test(gateReason);

let escalate_message;
const _statusLabel = (q.domain_hint === 'order' && q.order_status === 'outstanding') ? 'outstanding ' : (q.domain_hint === 'order' && q.order_status === 'delivered') ? 'delivered ' : '';
let is_clarification = false;
// datemiss-summary: expose the resolved-entity bullets (• customer: … / • product: …) so
// build-suggest-offer can show them on the date-relaxation offer too, not just escalate_message.
let _found_summary = '';

if (missingAttachmentType) {
  const subject = Array.isArray(q?.entities) ? q.entities.find(e => e.hint === 'product') : null;
  const subjectText = subject ? `${subject.hint} ${subject.raw}` : 'the requested product';
  escalate_message =
    `Please provide the attachment type for ${subjectText} ` +
    `— e.g. product image, technical drawing, or certificate.`;
  is_clarification = true;

} else if (needsScope) {
  escalate_message =
    `A ${q.domain_hint} enquiry can't be answered with a general search — ` +
    `please specify a ${humanList(allowedTypes)} so I can look it up.`;
  is_clarification = true;

} else {
  const tokens     = Array.isArray(r?.tokens) ? r.tokens : [];
  // #11: the access-level phrase ("Mocha Dealer") arrives as a resolver TOKEN, and the
  // `access` suffix below already names it. Without this filter the level prints twice:
  // "Could not find promotion for Mocha Dealer for Mocha Dealer."
  const _accessSet = new Set((Array.isArray(q?.access_levels) ? q.access_levels : [])
    .map(a => String(a ?? '').trim().toLowerCase()).filter(Boolean));
  const _notAccess = t => !_accessSet.has(String(t ?? '').trim().toLowerCase());
  const tokenText  = tokens.filter(_notAccess).join(' ');
  // tokens the user gave that didn't resolve — name them so the miss is concrete
  const unresolvedText = unresolved.filter(_notAccess).join(', ');

  let requested;
  if (resolvedTypes.length && tokenText) {
    requested = `${resolvedTypes.join('/')} ${tokenText}`;
  } else if (tokenText) {
    requested = tokenText;
  } else if (unresolvedText) {
    requested = unresolvedText;
  } else {
    const entities = (Array.isArray(q?.entities) ? q.entities : []).filter(e => _notAccess(e?.raw));
    // #11: '' (not 'the requested item') so the " for ..." segment can be dropped entirely —
    // the access suffix already says what was searched for.
    requested = entities.length
      ? entities.map(e => `${e.hint || 'item'} ${e.raw}`).join(', ')
      : '';
  }

  const dateRange = (q.date_filter_start && q.date_filter_end)
    ? ` from ${q.date_filter_start} to ${q.date_filter_end}` : '';
  // S2 (promotion-picker): the spine now sends the contact's ENTITLEMENT UNION when the
  // customer names no level, while q.access_levels (the parser's view) stays empty — so the
  // old `|| 'End User'` fallback printed a level that was never searched ("no promotion for
  // End User matched these"). Name a level only when the customer actually named one.
  const access = (q.intent_hint === 'check_promotion' && Array.isArray(q.access_levels) && q.access_levels.length)
    ? ` for ${q.access_levels.join(', ')}` : '';
  const team = q.routing?.suggested_team || 'customer_service';
  const active_inactive = q.is_active == true ? " active" : (q.is_active == false ? " inactive" : "")
  const allEnts = Array.isArray(q?.entities) ? q.entities : [];
  const normRaw = s => String(s ?? '').trim().toLowerCase();
  const byRaw = new Map(allEnts.map(e => [normRaw(e.raw), e]));

  // -- resolved-entity breakdown from gate.compatible_entities (authoritative resolved set) --
  // Names what the system actually resolved (entity_type + code), grouped by type, so an
  // entity-not-found miss reads differently from an entity-found-but-no-domain-data miss.
  const _compat = Array.isArray(gate?.compatible_entities) ? gate.compatible_entities : [];
  const _compatUuids = new Set(_compat.map(c => c.uuid));
  // all resolver matches across OR-mode resolutions + AND-mode intersection/by_entity_type
  const _allMatches = [
    ...(Array.isArray(r?.intersection) ? r.intersection : []),
    ...Object.values(r?.by_entity_type ?? {}).flat(),
    ...(Array.isArray(r?.resolutions) ? r.resolutions : []).flatMap(x => x.matches ?? []),
  ];
  // uuid -> friendly display name (promotions have no code — their identifier is the description)
  const _ORDER_TYPES = new Set(['order', 'customer_order', 'order_number']);
  const _dispByUuid = new Map();
  for (const m of _allMatches) {
    if (!m) continue;
    const d = m.display || {};
    let name;
    if (_ORDER_TYPES.has(m.entity_type)) {
      // order-ish: the user identifies by the DO/order NUMBER — show the code, add the customer for context.
      name = m.canonical_code
        ? (d.customer_name ? `${m.canonical_code} (${d.customer_name})` : m.canonical_code)
        : (d.customer_name || '');
    } else {
      // attachment_type shows its type_name (e.g. "Certification"), NOT the long alias description.
      // description stays ahead of canonical_code so promotions (code == uuid) still show their name.
      name = d.product_name || d.customer_name || d.debtor_name || d.type_name || d.description || m.canonical_code || '';
    }
    if (m.uuid && name && !_dispByUuid.has(m.uuid)) _dispByUuid.set(m.uuid, name);
  }
  // tokens that ACTUALLY produced a compatible entity (via_token / resolution token) —
  // these must NOT be listed as "not found" even if the resolver kept them in unresolved_tokens
  // (fallback-tier matches like brand_access_fallback stay in unresolved_tokens yet resolve).
  const _resolvedToks = new Set();
  for (const m of _allMatches) {
    if (m && _compatUuids.has(m.uuid)) {
      if (m.display?.via_token) _resolvedToks.add(normRaw(m.display.via_token));
      if (m.canonical_code)     _resolvedToks.add(normRaw(m.canonical_code));
    }
  }
  for (const res of (Array.isArray(r?.resolutions) ? r.resolutions : [])) {
    if ((res.matches ?? []).some(m => _compatUuids.has(m.uuid))) _resolvedToks.add(normRaw(res.token));
  }
  const _byType = new Map();
  for (const c of _compat) {
    const et = c.entity_type || 'item';
    // prefer the human display (e.g. promotion description) over a raw UUID code
    const label = _dispByUuid.get(c.uuid) || c.code || c.uuid;
    if (!label) continue;
    if (!_byType.has(et)) _byType.set(et, []);
    const arr = _byType.get(et);
    if (!arr.includes(label)) arr.push(label);
  }
  // #12: when the customer typed a code that matches EXACTLY, that code must be the
  // representative. `_compat` order is arbitrary, so codes[0] could name a sibling variant
  // (SRTSH1040-T for a typed SRTSH1040), reading as if we looked up a different product.
  const _tokSet = new Set(tokens.map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean));
  for (const arr of _byType.values()) {
    const i = arr.findIndex(l => _tokSet.has(String(l).trim().toLowerCase()));
    if (i > 0) arr.unshift(arr.splice(i, 1)[0]);
  }
  // ── entitlement miss ≠ data miss ─────────────────────────────────────────────
  // "Here's what you want: • promotion: X … But no promotion matched these." names a promotion
  // and then denies it in the same breath. Measured (exec 11917052): the resolver DID resolve
  // `SORENTO PP PROMO COMBINE_29072026.pdf` this turn via promotion_membership, display.is_active
  // TRUE, display.products ["SRTWB247"] — no stale carry. The contact's entitlement is
  // Aggregate.name = ["End User"], get-results applied it, and the Office-only promo came back
  // empty. Every fact needed to say so was already on the wire; only the sentence was wrong.
  //
  // Fires ONLY when a promotion was genuinely resolved and nothing came back. A turn that
  // resolved no promotion at all is a real data miss and keeps the original wording (B7), and an
  // INACTIVE promotion has ended rather than being withheld (B8) — blaming access there would be
  // a second false statement, not a fix for the first.
  const _entitlementMiss = (() => {
    if (q.domain_hint !== 'promotion') return null;
    const _promoMatches = [];
    const _push = (arr) => { for (const m of (arr || [])) if (m && m.entity_type === 'promotion') _promoMatches.push(m); };
    _push(r?.intersection);
    _push(r?.by_entity_type?.promotion);
    for (const res of (r?.resolutions || [])) _push(res?.matches);
    if (!_promoMatches.length) return null;
    const _seen = new Set(); const _uniq = [];
    for (const m of _promoMatches) {
      const k = m.uuid || m.canonical_code;
      if (!k || _seen.has(k)) continue;
      _seen.add(k); _uniq.push(m);
    }
    const _named = _uniq.map(m => (m.display && m.display.description) || null).filter(Boolean);
    if (!_named.length) return null;
    const _label = _named[0] + (_named.length > 1 ? ` and ${_named.length - 1} other${_named.length > 2 ? 's' : ''}` : '');
    const _anyActive = _uniq.some(m => m.display && m.display.is_active !== false);
    if (!_anyActive) {
      return `${_label} has ended, so there is nothing to send. Would you like me to escalate to ${team} team?`;
    }
    // Entitlement comes from the CRM read, not from anything the customer said. Absent ⇒ do not
    // invent a level (B9): say it is unavailable to them without naming one.
    let _levels = [];
    try {
      const _agg = $('Aggregate');
      if (_agg.isExecuted) _levels = (_agg.first().json.name || []).map(x => String(x || '').trim()).filter(Boolean);
    } catch (e) { _levels = []; }
    const _at = _levels.length ? ` at your access level (${_levels.join(', ')})` : ' to you';
    return `${_label} is not available${_at}. Would you like me to escalate to ${team} team?`;
  })();

  const _foundLines = [];
  for (const [et, codes] of _byType) {
    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean)
    const extra = codes.length > 1 ? ` (+${codes.length - 1} more)` : '';
    _foundLines.push(`• ${et}: ${codes[0]}${extra}`);
  }
  _found_summary = _foundLines.join('\n');   // datemiss-summary: reused by build-suggest-offer
  // tokens the user gave that resolved to NOTHING (exclude those that resolved via fallback tiers)
  const _notFoundRaw = unresolved.filter(t => !_resolvedToks.has(normRaw(t)));
  const _useBreakdown = _foundLines.length > 0;
  // notFoundRaw override lets a branch fold some unresolved tokens into the searched noun
  // instead of listing them as "couldn't find" (e.g. attachment qualifiers like "SPAN").
  const buildBreakdownMsg = (domainWord, notFoundRaw) => {
    const nf = (notFoundRaw ?? _notFoundRaw).map(t => `"${t}"`);
    const parts = [];
    if (_foundLines.length) parts.push(`Here's what you want:\n${_foundLines.join('\n')}`);
    if (nf.length) parts.push(`Couldn't find: ${nf.join(', ')}.`);
    parts.push(_entitlementMiss
      || `But no${active_inactive} ${domainWord}${dateRange}${access} matched these. Would you like me to escalate to ${team} team?`);
    return parts.join('\n\n');
  };

  // vague-token clarify: among UNRESOLVED tokens only, map each back to a reformulator
  // entity by raw and read its `confident` flag. ANY confident:false => vague mash, not a
  // clear-but-missing record => CLARIFY (no escalate offer). Default-true: only === false fires.
  const vagueUnresolved = unresolved.filter(t => byRaw.get(normRaw(t))?.confident === false);

  if (vagueUnresolved.length > 0) {
    is_clarification = true;                       // escalate-catalog: is_escalate_offer = !is_clarification = false
    const labels = humanList(allowedTypes);        // ALLOWED[domain] = gate_debug.allowed_lookup
    const captured = vagueUnresolved.join(', ');
    // partial-aware: name what DID resolve (entities not in unresolved), excluding the vague blob(s).
    const unresolvedSet = new Set(unresolved.map(normRaw));
    const resolvedEnts = allEnts.filter(e => e && e.raw && !unresolvedSet.has(normRaw(e.raw)));
    const resolvedSummary = resolvedEnts
      .map(e => `${e.hint || 'item'} ${e.raw}`.trim())
      .filter(Boolean)
      .join(', ');
    if (resolvedSummary) {
      escalate_message =
        `I understood ${resolvedSummary}, but couldn't make out "${captured}" — ` +
        `is that a ${labels}? Please label it, e.g. customer <name>, product <code>.`;
    } else {
      escalate_message =
        `I captured "${captured}" but couldn't tell which part is which. ` +
        `For a ${q.domain_hint} enquiry, please give me a labeled specific — e.g. ${labels}.`;
    }
  } else {
  const require_specific = gate.require_specific
  if (require_specific) {
    escalate_message = gate.gate_clarification
  } else if (q.domain_hint === 'product_attachment') {
    // FIX B: natural, parser-driven phrasing — never leak the 'product_attachment' literal.
    const ents = Array.isArray(q?.entities) ? q.entities : [];
    const productRaws = ents.filter(e => e.hint === 'product').map(e => e.raw).filter(Boolean);
    const attachRaws  = ents.filter(e => e.hint === 'attachment_type').map(e => e.raw).filter(Boolean);
    const attachEnt   = ents.find(e => e.hint === 'attachment_type');
    if (_useBreakdown) {
      // combine the attachment-type qualifiers into ONE searched noun ("SPAN certificate")
      // and fold those qualifiers OUT of the "couldn't find" list (don't double-name them).
      const attachNoun = attachRaws.length ? attachRaws.join(' ') : (attachEnt?.raw || 'attachment');
      const attachSet  = new Set(attachRaws.map(normRaw));
      const nfRaw      = _notFoundRaw.filter(t => !attachSet.has(normRaw(t)));
      escalate_message = buildBreakdownMsg(attachNoun, nfRaw);
    } else {
      const prodText = productRaws.length ? `product ${productRaws.join(' and ')}` : '';
      let subject;
      if (attachEnt?.raw && prodText)      subject = `a ${attachEnt.raw} for ${prodText}`;
      else if (attachEnt?.raw)             subject = `a ${attachEnt.raw}`;
      else if (prodText)                   subject = `attachments for ${prodText}`;
      else                                 subject = requested || 'the requested item';   // fall back to the old token text
      escalate_message =
        `Could not find${active_inactive} ${subject}${dateRange}${access}. ` +
        `Would you like me to escalate to ${team} team?`;
    }
  } else {
    // status-filter-aware: a SPECIFIC order/customer_order resolved (the DO exists) but the
    // delivered/outstanding filter returned nothing => the order isn't a miss, it's just not in
    // that status. Say so, using the resolved match's own status/dates.
    const _orderMatch = _allMatches.find(m => m && _compatUuids.has(m.uuid) && _ORDER_TYPES.has(m.entity_type));
    if (_orderMatch && (q.order_status === 'delivered' || q.order_status === 'outstanding')) {
      const d = _orderMatch.display || {};
      const label = `${_orderMatch.canonical_code}${d.customer_name ? ` (${d.customer_name})` : ''}`;
      if (q.order_status === 'delivered') {
        const eta = d.estimated_delivery_date ? ` (estimated delivery ${d.estimated_delivery_date})` : '';
        const st  = d.status ? ` — current status: ${d.status}` : '';
        escalate_message =
          `Order ${label} hasn't been delivered yet${st}. ` +
          `Would you like me to escalate to ${team} team?`;
      } else {
        escalate_message =
          `Order ${label} has no outstanding items — it looks already delivered or closed. ` +
          `Would you like me to escalate to ${team} team?`;
      }
    } else if (_useBreakdown) {
      escalate_message = buildBreakdownMsg(`${_statusLabel}${q.domain_hint}`);
    } else if (_notFoundRaw.length && !_foundLines.length) {
      // NOTHING resolved. "Could not find promotion for stwc26" states that promotions were
      // searched and none matched — they were not. If3 dead-ends on the no-compatible-entity
      // branch and `Call 'sub-get-results'` never runs (verified, execs 12069620 / 12069702:
      // tool-filter, validator and the sub-call are all absent from runData). Saying we searched
      // sends the customer off correcting the wrong thing — retyping the domain rather than the
      // code they mistyped.
      // Phrasing is buildBreakdownMsg's, verbatim, so the zero-resolution and partial-resolution
      // misses read identically; the did-you-mean variant ("Couldn't find \"x\". Did you mean...")
      // still overrides this whenever the resolver returns alternatives.
      // Domain-agnostic ON PURPOSE: this node serves promotion, inventory and incoming alike.
      escalate_message =
      `Couldn't find: ${_notFoundRaw.map(t => `"${t}"`).join(', ')}. ` +
      `Would you like me to escalate to ${team} team?`;
    } else {
      const _forRequested = requested ? ` for ${requested}` : '';
      escalate_message =
      `Could not find${active_inactive} ${_statusLabel}${q.domain_hint}${_forRequested}${dateRange}${access}. ` +
      `Would you like me to escalate to ${team} team?`;
    }
  }
  }
}

// Q23: the customer named an access level they do not hold. The gate detects it; say so here
// too, or an entitlement problem reads as an ordinary "couldn't find it".
if (gate && gate.access_notice && escalate_message) {
  escalate_message = `${gate.access_notice}\n\n${escalate_message}`;
}

const out = $input.first().json;
out.escalate_message = escalate_message;
out.is_clarification = is_clarification;
out.found_summary = _found_summary;   // datemiss-summary: resolved-entity bullets for the date arm
return out;

