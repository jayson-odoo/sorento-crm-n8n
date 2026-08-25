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
    `- e.g. product image, technical drawing, or certificate.`;
  is_clarification = true;

} else if (needsScope) {
  // The customer reaches this by CLEARING every filter one at a time - "all products", then
  // "all time", then "all customers" - which is a reasonable thing to try and lands on a request
  // for every delivery order ever. Refusing is right; the old wording was not: it read
  // "A order enquiry can't be answered with a general search" (broken article, exec 13696xxx),
  // named the internal entity types as the fix, and never said the one useful thing - that a
  // single filter is enough to continue. Say what to do, in the customer's own vocabulary.
  const _scopeWord = ({ order: 'delivery order', incoming: 'incoming shipment',
    inventory: 'stock', promotion: 'promotion', goods_receive: 'goods receipt',
    master_products: 'product' })[String(q.domain_hint || '').toLowerCase()] || String(q.domain_hint || 'that');
  // allowedTypes are the resolver's INTERNAL entity types (order, customer_order, order_number,
  // transporter, spo ...). Printing them raw asks the customer to speak our schema, and several
  // are the same thing to them. Fold to the words a person would use, keep the order stable, drop
  // duplicates, and cap it - a list of seven is not a prompt, it is a wall.
  const _HUMAN_SCOPE = { order: 'order number', order_number: 'order number',
    customer_order: 'order number', spo: 'SPO number', customer: 'customer',
    transporter: 'transporter', product: 'product code', warehouse: 'warehouse',
    inbound_shipment: 'container', goods_receive: 'goods receipt' };
  const _asked = [];
  for (const t of (Array.isArray(allowedTypes) ? allowedTypes : [])) {
    const w = _HUMAN_SCOPE[String(t || '').toLowerCase()];
    if (w && !_asked.includes(w)) _asked.push(w);
  }
  // The date range is one MORE option, so it belongs inside the list - appending it after a
  // finished list produced "a order number, transporter, or customer, or a date range" (two ors,
  // and the same broken article this arm was rewritten to remove). The article agrees with
  // whatever word ends up first, which varies with the domain's allowed_lookup.
  const _opts = (_asked.length ? _asked.slice(0, 3) : ['customer', 'product code']).concat('date range');
  const _art = /^[aeiou]/i.test(_opts[0]) ? 'an' : 'a';
  escalate_message =
    `That would search every ${_scopeWord} we have - I need at least one filter to narrow it down. ` +
    `Give me ${_art} ${humanList(_opts)}, and I can look it up.`;
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

  // NARROWED (captain, 2026-08-24): the miss-lane search-scope header - Customer, Product, any
  // extra axis in scope, and Dates - is a DELIVERY ORDER disclosure, not a general one. It used
  // to gate on "domains the CRM date-filters", which let it fire on other domains where it is
  // actively wrong, not just noisy: exec 13735476, an `incoming` MISS ("eta"), rendered
  // "Dates: all dates" between the found-bullets and the escalate offer - customers do not
  // date-filter incoming in practice, and a container has no customer. The rule is now: this
  // header describes a delivery-order search specifically. See also compile-current-state.js
  // `_DATE_DOMAINS` (same rule, the happy-path twin of this block, can't share code - two
  // separate n8n nodes).
  const _DATE_SCOPE_DOMAINS = new Set(['order']);
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
  // ── multi-company: which company each resolved entity belongs to (mc-label 2026-08-17) ──
  // The resolver stamps `company_name` on every match — the same field disallowed-entity-gate's
  // #9 routing block already reads, so this adds no new dependency on the CRM.
  // The problem: one typed code can exist in TWO companies, and the resolver returns one match
  // per company with the SAME canonical_code. The dedup below is on the LABEL STRING, so the two
  // collapse into one bullet — "• product: MWC-SC08B" says one product where two were searched,
  // and the "no ... matched these" that follows reads as one company's answer.
  const _coByUuid = new Map();
  for (const m of _allMatches) {
    const cn = String((m && m.company_name) ?? '').trim();
    if (m && m.uuid && cn && !_coByUuid.has(m.uuid)) _coByUuid.set(m.uuid, cn);
  }
  // Keyed to what was ACTUALLY sent to the tool (`_compat`), NEVER to the caller's access list:
  // a contact entitled to three companies who asked about a one-company product searched ONE, and
  // "checked in Mocha, Sorento and Cabana" would be a false statement about work never done.
  // VERIFY 3 (review 2, 2026-08-17). Only entity types that actually become TOOL IDS may
  // contribute to a claim about what was searched. `sub-get-results`' entity-ids-transformer maps
  // entity_type -> an `*_ids` tool param, and `brand` / `category` appear in NEITHER map: the gate
  // lets them through for compatibility (ALLOWED.inventory = ['product','category','brand'],
  // ALLOWED.incoming adds inbound_shipment) and the transformer then drops them as
  // `unmapped_types`. So a category or brand resolved in Mocha, beside a product resolved in
  // Sorento, would make " — checked in Mocha and Sorento" a false statement about a lookup that
  // only ever queried Sorento's product id.
  // DENY-list, not an allow-list, ON PURPOSE: every other allowed type (product, promotion, order,
  // customer_order, customer, transporter, form, inbound_shipment, attachment, attachment_type,
  // certificate) does carry a tool param today, and if the CRM later gives `category` one this
  // UNDER-claims — it omits a company we did search — instead of over-claiming. Silence is
  // recoverable; a false statement about work not done is not.
  const _NO_TOOL_ID = new Set(['brand', 'category']);
  const _searchedCos = [...new Set(_compat
    .filter(c => !_NO_TOOL_ID.has(String((c && c.entity_type) ?? '')))
    .map(c => _coByUuid.get(c.uuid)).filter(Boolean))];
  const _multiCo = _searchedCos.length > 1;
  // "Mocha and Sorento"; "A, B and C" beyond two.
  const _andList = (a) => a.length <= 1
    ? (a[0] || '')
    : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;

  const _byType = new Map();
  for (const c of _compat) {
    const et = c.entity_type || 'item';
    // prefer the human display (e.g. promotion description) over a raw UUID code
    const base = _dispByUuid.get(c.uuid) || c.code || c.uuid;
    if (!base) continue;
    const _co = _coByUuid.get(c.uuid);
    // Qualify ONLY in the multi-company case. One company keeps today's bare label byte for byte,
    // and "MWC-SC08B (Sorento)" on a single-company answer would be noise about a distinction the
    // customer has no reason to care about.
    const label = (_multiCo && _co) ? `${base} (${_co})` : base;
    if (!_byType.has(et)) _byType.set(et, []);
    const arr = _byType.get(et);
    if (!arr.includes(label)) arr.push(label);
  }
  // #12: when the customer typed a code that matches EXACTLY, that code must be the
  // representative. `_compat` order is arbitrary, so codes[0] could name a sibling variant
  // (SRTSH1040-T for a typed SRTSH1040), reading as if we looked up a different product.
  const _tokSet = new Set(tokens.map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean));
  // mc-label: the label may now carry a " (Company)" suffix, which no typed token will ever match.
  // Strip it for the comparison ONLY in the multi-company case — an order label is legitimately
  // `DO123 (Acme Sdn Bhd)`, and stripping unconditionally would start reordering single-company
  // types that do not reorder today.
  const _bareLabel = (l) => _multiCo ? String(l).replace(/\s+\([^)]*\)$/, '') : String(l);
  for (const arr of _byType.values()) {
    const i = arr.findIndex(l => _tokSet.has(_bareLabel(l).trim().toLowerCase()));
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

  // Match key for "is this string the same thing the customer typed": separators and case dropped.
  // resolve-entity strips dashes/spaces off product-hint tokens before it resolves them (2262a99b),
  // so the customer's "SRT 2405-CR" reaches us as "srt2405cr" while the code reads "SRT2405-CR".
  // Shared by the typed-code check below and the not-found token labels further down.
  const _typeNorm = (s) => String(s ?? '').replace(/[-\s]+/g, '').toLowerCase();

  // ── WHAT THE CUSTOMER TYPED vs WHAT THE RESOLVER EXPANDED TO (captain, 2026-08-24) ──────────
  // "Incoming SRT 2405-CR, srt2405-GY" - two product codes, both typed out in full - came back as
  // "• product: SRT2405-GY (+1 more)", and the same reply then printed stock detail for
  // SRT2405-CR: the summary hid the very code the customer had asked for, and then contradicted
  // itself further down. The cap below is NOT the bug and does not go away: "srtwc286" is ONE
  // token that the RESOLVER expands into ten sibling codes, and ten codes in a WhatsApp bullet is
  // not a summary any more (FIX 1, review 2, 2026-08-17 - that reason still holds).
  // The rule is the one that fixed the miss-company and dropped-filter bugs earlier today: we may
  // summarize our OWN expansions, we may never hide something the customer asked for by name.
  // `resolutions` already maps each typed token to what it matched (the same mechanism `_axisWords`
  // uses to label an axis in the customer's words), so a code counts as TYPED when the token IS
  // that code (or the label it renders as) - not when the token is a fragment we grew into it.
  // When `resolutions` is absent (older/other resolver modes return by_entity_type / intersection
  // only) we cannot tell typed from expanded, so nothing is registered and every line falls back
  // to today's exact output - fail toward the shorter line, never toward a wall of codes.
  const _typedOrder = new Map();      // normalized label -> the position the customer typed it in
  let _typedSeq = 0;
  for (const res of (Array.isArray(r?.resolutions) ? r.resolutions : [])) {
    const tok = _typeNorm(res && res.token);
    if (!tok) continue;
    const _hits = new Set();          // the DISTINCT things this one token names outright
    for (const m of (Array.isArray(res && res.matches) ? res.matches : [])) {
      if (!m || !_compatUuids.has(m.uuid)) continue;
      // Same key the bullet groups on below, so a match registers as the group it will render as
      // ("DO123 (Acme Sdn Bhd)", a promotion's description, a product's name).
      const g = _typeNorm(_dispByUuid.get(m.uuid) || m.canonical_code || m.uuid);
      if (g && (tok === _typeNorm(m.canonical_code) || tok === g)) _hits.add(g);
    }
    // ONE token naming SEVERAL distinct things is the resolver expanding, not the customer
    // listing: measured on `display--not-found-error-message.json`, customer code "300-D059"
    // carries three separate debtor accounts (SETAPAK / ACC 2 / DENHO), and naming all three is
    // the wall of labels the cap exists to prevent. Only a token that lands on exactly one thing
    // is a code the customer asked for by name.
    if (_hits.size !== 1) continue;
    const g = [..._hits][0];
    if (!_typedOrder.has(g)) _typedOrder.set(g, _typedSeq++);
  }

  const _foundLines = [];
  for (const [et, codes] of _byType) {
    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean).
    // FIX 1 (review 2, 2026-08-17). The cap is over DISTINCT CODES, not over labels. My first
    // version skipped it entirely whenever `_multiCo`, on the reasoning that the extra entries are
    // the same code in another company — true for ONE code, false for the turn: a turn that
    // resolved eight distinct products in a multi-company set dumped all eight into the WhatsApp
    // reply. The cap is not incidental, it is what keeps this line a summary.
    // So: group the type's labels by their BARE code (insertion order preserved, so the
    // typed-code-first reorder above still chooses the representative), render the representative
    // group IN FULL — naming its company variants is the entire point of the qualification — and
    // count the remaining DISTINCT CODES. Single-company is byte-identical: `_bareLabel` is the
    // identity there, so every label is its own group and this collapses to `codes[0]` + (+N).
    const _order = [];
    const _byCode = new Map();
    for (const l of codes) {
      const bare = _bareLabel(l);
      if (!_byCode.has(bare)) { _byCode.set(bare, []); _order.push(bare); }
      _byCode.get(bare).push(l);
    }
    // typed-codes (captain, 2026-08-24): every code the customer typed THIS TURN is named, in the
    // order they typed it - `_compat` order is arbitrary, and the customer's own order is the only
    // one that is theirs to recognise. Nothing typed => the single representative, exactly as
    // before, and the count then covers the whole resolver expansion.
    const _typed = _order
      .filter(b => _typedOrder.has(_typeNorm(b)))
      .sort((x, y) => _typedOrder.get(_typeNorm(x)) - _typedOrder.get(_typeNorm(y)));
    const _named = _typed.length ? _typed : [_order[0]];
    const extra = _order.length > _named.length ? ` (+${_order.length - _named.length} more)` : '';
    _foundLines.push(`• ${et}: ${_named.map(b => _byCode.get(b).join(', ')).join(', ')}${extra}`);
  }
  _found_summary = _foundLines.join('\n');   // datemiss-summary: reused by build-suggest-offer
  // tokens the user gave that resolved to NOTHING (exclude those that resolved via fallback tiers)
  const _notFoundRaw = unresolved.filter(t => !_resolvedToks.has(normRaw(t)));
  const _useBreakdown = _foundLines.length > 0;
  // entity-type-label: name what the bot thought a not-found token was — resolver PRIMARY
  // (this token's own resolution's matches[0].entity_type — open vocabulary, prettified only
  // if snake_case/ugly), parser hint FALLBACK (byRaw, matched by the SAME normalized key) when
  // the resolver named nothing for this token, bare when neither is known (byte-identical to
  // the old line then). Matches the confirm-prefix IIFE's priority in compile-current-state
  // so a token's type label never disagrees between the media-confirm line and this miss line.
  // Match key is space/dash-stripped + lowercased on BOTH sides: resolver tokens are stripped
  // before they reach the resolver (2262a99b), parser `entities[].raw` is not. That is `_typeNorm`,
  // defined above the found-bullets because the typed-code check needs the same key.
  const _prettifyType = (t) => {
    const s = String(t ?? '').trim();
    if (!s) return '';
    if (!/[_-]/.test(s) && s === s.toLowerCase()) return s;
    return s.replace(/[_-]+/g, ' ').trim().toLowerCase();
  };
  // FIRST-wins on a normalized-key collision (agrees with compile-current-state's
  // .find(), which also keeps the first match). A plain Map(...map()) would keep the
  // LAST entity instead, letting the two nodes disagree on which entity a token names.
  const _byRawStripped = new Map();
  for (const e of allEnts) {
    const _k = _typeNorm(e.raw);
    if (!_byRawStripped.has(_k)) _byRawStripped.set(_k, e);
  }
  const _typeOfToken = (t) => {
    try {
      const res = (Array.isArray(r?.resolutions) ? r.resolutions : []).find(x => _typeNorm(x?.token) === _typeNorm(t));
      const m0 = res && Array.isArray(res.matches) && res.matches[0];
      if (m0 && m0.entity_type) return _prettifyType(m0.entity_type);
    } catch (e) { /* no resolutions -> fall through to parser hint */ }
    const hint = _byRawStripped.get(_typeNorm(t))?.hint;
    return hint ? String(hint) : '';
  };
  // Quote what the CUSTOMER typed. resolve-entity strips separators for product-hint tokens, so the
  // resolver token is "mfg6651gm" while the person wrote "mfg6651-gm" — echoing the stripped form
  // back reads like we mangled their input (console retest, exec 13635810). _byRawStripped is keyed
  // on exactly that normalization, so the original raw is one lookup away.
  const _rawOfTok = (t) => _byRawStripped.get(_typeNorm(t))?.raw || t;
  const _labelTok = (t) => { const tl = _typeOfToken(t); return `"${_rawOfTok(t)}"${tl ? ` (${tl})` : ''}`; };
  // notFoundRaw override lets a branch fold some unresolved tokens into the searched noun
  // instead of listing them as "couldn't find" (e.g. attachment qualifiers like "SPAN").
  // mc-label: state the SEARCH SCOPE, so "nothing matched" cannot be read as "nothing matched in
  // the one company you were thinking of". Empty on a single-company turn, which keeps the
  // sentence byte-identical there. `_entitlementMiss` deliberately does not take it — that arm is
  // about a promotion being withheld from this contact, not about where we looked.
  const _coSuffix = _multiCo ? ` - checked in ${_andList(_searchedCos)}` : '';
  // ── THE SEARCH SCOPE, ALWAYS (captain plan E2, 2026-08-24) ──────────────────────────────────
  // exec 13746945, "any delivery for SRTWB2805-BL": the gate scope was `{product: 1}` and nothing
  // else, so the search really was every delivery order, for ANY customer, over ANY date. The
  // reply named the one thing that resolved ("• product: SRTWB2805-BL"), said "no order matched
  // these", and the customer had to come back and ask "did it search all customers?" - because
  // nothing said so. The found-bullets structurally cannot answer that: they name what RESOLVED,
  // and an axis nobody filled resolves to nothing, so an open axis is invisible on exactly the
  // turn where it decided the result. That is the captain's E2 requirement word for word - "an
  // EMPTY result states them too - that is the entire point". So a miss now OPENS with the same
  // three-line header an answer does (Customer / Product / Dates, extra axes between Product and
  // Dates when in scope), then the found-bullets, then the escalate offer: one shape to learn.
  //
  // ⚠ DELIBERATE DUPLICATE - KEEP IN LOCKSTEP with compile-current-state.js's "SEARCH SCOPE
  // DISCLOSURE" IIFE (the happy-path twin: same axis list, same label priority, same date
  // formatting, same `order`-only gate, and since 2026-08-25 the same customer's-spelling rule on
  // path 1). They are two separate n8n Code nodes and cannot import from each other, exactly as
  // `_DATE_SCOPE_DOMAINS` / `_DATE_DOMAINS` already are. CHANGE BOTH TOGETHER or the answer and
  // the miss start disclosing the same search in two different shapes.
  //
  // Which axes are active comes from the GATE (`compatible_entities`: entity_type + code), never
  // from the parser's hints - a bare code is often hinted `order` and matched by the resolver as a
  // product, and rendering from hints is the bug commit 70bb1e3 fixed on the happy path.
  const _AXES = [
    { label: 'Customer', types: ['customer'], hints: ['customer'], always: true, allText: 'all customers' },
    { label: 'Product',  types: ['product'],  hints: ['product'],  always: true, allText: 'all products' },
    { label: 'Order',       types: ['customer_order', 'order', 'order_number'], hints: ['order', 'customer_order', 'order_number'] },
    { label: 'Transporter', types: ['transporter'], hints: ['transporter'] },
    { label: 'Container',   types: ['inbound_shipment'], hints: ['inbound_shipment', 'container'] },
    { label: 'Warehouse',   types: ['warehouse'], hints: ['warehouse'] },
  ];
  const _axisWords = (axis) => {
    const typeSet = new Set(axis.types);
    const rows = _compat.filter(e => e && typeSet.has(normRaw(e.entity_type)));
    if (!rows.length) return null;                                     // axis never put in scope
    const words = new Set();
    for (const res of (Array.isArray(r?.resolutions) ? r.resolutions : [])) {   // 1. the customer's own typed token
      const hitsAxis = (Array.isArray(res && res.matches) ? res.matches : [])
        .some(m => m && typeSet.has(normRaw(m.entity_type)));
      const tok = String((res && res.token) ?? '').trim();
      // `res.token` is the RESOLVER's echo, not the customer's spelling - resolve-entity is sent
      // `canonical_code ?? raw`, strips `[-\s]+` on a product hint, and the CRM lowercases what it
      // returns, so the header read `Product: srtks7646` above a bullet reading `SRTKS7646`.
      // `_rawOfTok` is the same lookup the not-found list already quotes through (`_byRawStripped`,
      // stripped+lowercased key, first-wins), so the header, the bullets and the miss list all name
      // a token the one way. Unmatched token => returned unchanged, i.e. today's behaviour.
      if (hitsAxis && tok) words.add(_rawOfTok(tok));
    }
    if (!words.size) {                                                 // 2. the parser's own hinted raw
      for (const e of allEnts) {
        if (!e || !axis.hints.includes(normRaw(e.hint))) continue;
        const v = String(e.raw ?? '').trim();
        if (v) words.add(v);
      }
    }
    if (!words.size) {                                                 // 3. last resort: the gate's own label
      for (const row of rows) {
        const v = String((row && (row.title || row.code)) ?? '').trim();
        if (v) words.add(v);
      }
    }
    return [...words].join(', ');
  };
  const buildBreakdownMsg = (domainWord, notFoundRaw) => {
    const nf = (notFoundRaw ?? _notFoundRaw).map(_labelTok);
    const parts = [];
    // Only for a delivery-order search; elsewhere this is noise on an answer it does not apply to.
    if (_DATE_SCOPE_DOMAINS.has(String(q.domain_hint || '').toLowerCase())) {
      const _ds = q.date_filter_start || null, _de = q.date_filter_end || null;
      const _fmtD = (v) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? ''); };
      const _head = [];
      for (const axis of _AXES) {
        const words = _axisWords(axis);
        if (axis.always) _head.push(`${axis.label}: ${words || axis.allText}`);
        else if (words) _head.push(`${axis.label}: ${words}`);
      }
      // Dates last, and stated even when no window was set: `dateRange` below is the empty string
      // whenever the customer named no dates, so "no order matched these" never said whether it
      // had looked at all dates or just this month.
      _head.push(`Dates: ${(!_ds && !_de) ? 'all dates'
        : (_ds && _de && _ds === _de) ? _fmtD(_ds)
        : `${_ds ? _fmtD(_ds) : 'earliest'} to ${_de ? _fmtD(_de) : 'today'}`}`);
      parts.push(_head.join('\n'));
    }
    if (_foundLines.length) parts.push(`Here's what you want:\n${_foundLines.join('\n')}`);
    if (nf.length) parts.push(`Couldn't find: ${nf.join(', ')}.`);
    parts.push(_entitlementMiss
      || `But no${active_inactive} ${domainWord}${dateRange}${access} matched these${_coSuffix}. Would you like me to escalate to ${team} team?`);
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
        `I understood ${resolvedSummary}, but couldn't make out "${captured}" - ` +
        `is that a ${labels}? Please label it, e.g. customer <name>, product <code>.`;
    } else {
      escalate_message =
        `I captured "${captured}" but couldn't tell which part is which. ` +
        `For a ${q.domain_hint} enquiry, please give me a labeled specific - e.g. ${labels}.`;
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
        const st  = d.status ? ` - current status: ${d.status}` : '';
        escalate_message =
          `Order ${label} hasn't been delivered yet${st}. ` +
          `Would you like me to escalate to ${team} team?`;
      } else {
        escalate_message =
          `Order ${label} has no outstanding items - it looks already delivered or closed. ` +
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
      `Couldn't find: ${_notFoundRaw.map(_labelTok).join(', ')}. ` +
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



