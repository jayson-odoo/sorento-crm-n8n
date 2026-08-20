// ── Domain ↔ Entity-Type Gate (compatibility + required-type) ──────────────
const parser   = $('Call \'sub-query-reformulator\'').first().json.output ?? {};
const domain   = parser.domain_hint ?? null;
const resolver = $('resolve-entity').first().json ?? {};

const ALLOWED = {
  master_products:    ['product', 'category', 'brand'],
  product_attachment: ['product', 'attachment', 'attachment_type', 'category', 'brand', 'certificate'],
  promotion:          ['product', 'promotion', 'category', 'brand'],
  inventory:          ['product', 'category', 'brand'],
  order:              ['order', 'customer_order', 'transporter', 'customer', 'product'],
  incoming:           ['product', 'inbound_shipment', 'category', 'brand'],
  forms:              ['form'],
  portal_link:        [],
};
const ALLOWS_EMPTY = {
  // S1 (promotion-picker): a promotion cannot be answered by a general search. Flipping this
  // to false routes a scope-less promotion ask into not-found-error-message's EXISTING
  // `needsScope` arm ("can't be answered with a general search — please specify a ..."),
  // reusing that renderer rather than adding a second one.
  promotion: false, incoming: true, forms: true, portal_link: true,
  master_products: false, product_attachment: false, inventory: false, order: false,
};

// Domains that need a SPECIFIC type present to be scopable (beyond compatibility).
const REQUIRED_TYPES = { product_attachment: ['attachment_type'] };
const TYPE_PROMPT = {
  attachment_type: 'product image, technical drawing, 3D model, or certificate',
};

// Flatten + de-dupe resolver matches.
const flat = [
  ...(resolver.resolutions ?? []).flatMap(r => r.matches ?? []),
  ...(resolver.intersection ?? []),
  ...Object.values(resolver.by_entity_type ?? {}).flat(),
];
const byUuid = {};
for (const m of flat) if (m && m.uuid) byUuid[m.uuid] = { uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code };
const entities = Object.values(byUuid);

const allowed = ALLOWED[domain] ?? null;
let gate_passed = true, gate_reason = 'ok', gate_clarification = '';
let compatible_entities = entities;

if (allowed === null) {
  gate_reason = `domain '${domain}' not in matrix; passing through unscoped`;
} else {
  compatible_entities = entities.filter(e => allowed.includes(e.entity_type));

  if (entities.length === 0) {
    gate_passed = ALLOWS_EMPTY[domain] === true;
    gate_reason = gate_passed ? `no entities; '${domain}' permits broad query`
                              : `no entities and '${domain}' requires a scoping entity`;
  } else if (compatible_entities.length === 0) {
    const got = [...new Set(entities.map(e => e.entity_type))].join(', ');
    gate_passed = false;
    gate_reason = `types [${got}] incompatible with '${domain}'`;
  }
}

// Required-type check (only if still passing). Look in resolver output AND raw parser hints,
// since an attachment_type may be a filter the parser carried, not a UUID-resolved record.
if (gate_passed && Array.isArray(REQUIRED_TYPES[domain])) {
  const haveTypes = new Set([
    ...entities.map(e => e.entity_type),
    ...(parser.entities ?? []).map(e => e.hint),
  ]);
  const missing = REQUIRED_TYPES[domain].filter(t => !haveTypes.has(t));
  if (missing.length > 0) {
    gate_passed = false;
    gate_reason = `'${domain}' requires [${missing.join(', ')}] but none resolved`;

    const subject = (parser.entities ?? []).find(e => e.hint === 'product')?.raw || 'this product';
    gate_clarification = missing.map(t =>
      t === 'attachment_type'
        ? `Please specify which type of attachment you need for ${subject}, e.g. ${TYPE_PROMPT.attachment_type}.`
        : `Please specify the ${t}.`
    ).join(' ');
  }
}

// ── B1 attachment-subject-gate ─────────────────────────────────────────
// The named subject product MISSED. A carried certificate / attachment_type must not be
// allowed to scope the lookup on its own: certificate_ids alone satisfies the tool's narrowing
// tuple (server.py:40, OR semantics) and returns every product carrying that certificate.
// Observed: exec 11509873, 26 unrelated products + a PDF. Dead-end to not-found so the
// did-you-mean the customer actually needs is what gets rendered.
// Predicate is resolver-derived (unresolved_tokens ∩ parser product raws) on purpose — NOT
// `current_message`, which is a known-corrupted signal (plan §5 B4).
if (gate_passed && domain === 'product_attachment') {
  const _n = s => String(s ?? '').trim().toLowerCase();
  const _unresolved = (resolver.unresolved_tokens ?? []).map(_n);
  const _productRaws = new Set((parser.entities ?? [])
    .filter(e => String(e.hint || '').toLowerCase() === 'product')
    .map(e => _n(e.raw)));
  const _missedSubject = _unresolved.some(t => _productRaws.has(t));
  const _haveProduct   = compatible_entities.some(e => e.entity_type === 'product');
  if (_missedSubject && !_haveProduct) {
    gate_passed = false;
    gate_reason = `'product_attachment' subject product did not resolve; refusing to scope on carried entities`;
  }
}

// ── AMBIGUITY → REQUIRE SPECIFIC SELECTION ──────────────────────────────────
// Domains where an ambiguous token must be disambiguated by the user before we
// can scope a lookup. (promotion already short-circuits below; this generalizes it.)
const REQUIRE_SPECIFIC_DOMAINS = new Set(['incoming', 'product_attachment']);
let require_specific = false;
let specific_options = [];
let exact_entities = [];   // tokens resolved by a single compatible exact match
let _collapsedTokens = [];  // mc-prefix-collapse: tokens whose non-exact hits were ONE code in N companies

if (REQUIRE_SPECIFIC_DOMAINS.has(domain)) {
  const allowedTypes = ALLOWED[domain] ?? null;
  const norm = s => String(s || '').toLowerCase().trim();
  const tokens = resolver.tokens ?? [];
  const typedTokens = new Set(tokens.map(norm));

  const isCompatible = m => allowedTypes === null || allowedTypes.includes(m.entity_type);
  const isProd = m => String(m.entity_type).toLowerCase() === 'product';

  // OR-mode: per-token resolutions[]. AND-mode: flat intersection[] (no token, no usable tier).
  const orResolutions = Array.isArray(resolver.resolutions) ? resolver.resolutions : null;
  const andMatches    = Array.isArray(resolver.intersection) ? resolver.intersection
                      : (resolver.by_entity_type ? Object.values(resolver.by_entity_type).flat() : null);

  if (orResolutions) {
    // ── OR-MODE ──
    // FIX D: the disambiguation choose-list is PRODUCT-ONLY. Non-product matches
    // (attachment_type, etc.) are resolved straight through and NEVER offered as a
    // choice. Only genuine multi-product-no-exact tokens prompt the user.
    const stillAmbiguous = [];
    for (const r of orResolutions) {
      const matches = (r.matches ?? []).filter(isCompatible);
      if (matches.length === 0) continue;

      const products    = matches.filter(isProd);
      const nonProducts = matches.filter(m => !isProd(m));

      // resolve non-product matches (attachment_type, etc.) — never a choose-list option
      if (nonProducts.length > 0) {
        const npExact = nonProducts.filter(m => m.match_tier === 'exact');
        const pick = npExact.length === 1 ? npExact[0] : nonProducts[0];
        exact_entities.push({ uuid: pick.uuid, entity_type: pick.entity_type, code: pick.canonical_code });
      }

      // products: exact-tier wins (user typed a full code; ignore -BL/-150 variants)
      if (products.length > 0) {
        const exacts = products.filter(m => m.match_tier === 'exact');
        // mc-label-n8n follow-up: N exact hits that share ONE code (same product in several
        // companies) are NOT ambiguous — resolve every uuid; downstream labels per company.
        const _sameCode = (arr) => arr.length > 0 && new Set(arr.map(m => String(m.canonical_code || '').toLowerCase().trim())).size === 1;
        if (_sameCode(exacts)) {
          for (const m of exacts) exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
        } else if (exacts.length === 0 && _sameCode(products)) {
          // mc-prefix-collapse (exec 13002464): the SAME collapse for a non-exact tier. "MHS1542-CR" has
          // no exact row; its two prefix hits are ONE code (MHS1542-CR-DIY) in two companies. That is one
          // product, not a choice — the old branch fell through to stillAmbiguous and rendered the same
          // label twice ("1. MHS1542-CR-DIY / 2. MHS1542-CR-DIY").
          for (const m of products) exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
          _collapsedTokens.push(String(r.token ?? '').trim().toLowerCase());
        } else if (products.length === 1) {
          const m = products[0];
          exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
        } else {
          // multiple product matches, no single exact → genuinely ambiguous → prompt
          stillAmbiguous.push({ token: r.token, products });
        }
      }
    }
    if (stillAmbiguous.length > 0) {
      specific_options = stillAmbiguous.map(o => ({
        token: o.token,
        candidates: o.products.map(m => ({
          uuid: m.uuid,
          label: m.canonical_code || m.display?.product_name || m.uuid,
          entity_type: m.entity_type,
        })),
      })).filter(o => o.candidates.length > 0);
    }

  } else if (andMatches) {
    // ── AND-MODE: tier is uninformative; exact = canonical_code EQUALS a typed token ──
    // FIX D: resolve non-product matches straight through; choose-list = products only.
    const compatMatches = andMatches.filter(m => m && isCompatible(m));
    const nonProducts = compatMatches.filter(m => !isProd(m));
    for (const m of nonProducts) {
      exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
    }
    const products = compatMatches.filter(isProd);
    const prodExacts = products.filter(m => typedTokens.has(norm(m.canonical_code)));
    // mc-label-n8n follow-up: same code exact in >1 company → resolve all uuids, no prompt.
    if (prodExacts.length >= 1 && new Set(prodExacts.map(m => String(m.canonical_code || '').toLowerCase().trim())).size === 1) {
      for (const m of prodExacts) exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
    } else if (prodExacts.length === 0 && products.length > 1
               && new Set(products.map(m => String(m.canonical_code || '').toLowerCase().trim())).size === 1) {
      // mc-prefix-collapse: AND-mode twin of the OR-mode arm — N rows, ONE code, several companies → one product.
      for (const m of products) exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
    } else if (products.length > 1) {
      specific_options = [{
        token: tokens.join(', '),
        candidates: products.map(m => ({
          uuid: m.uuid,
          label: m.canonical_code || m.display?.product_name || m.uuid,
          entity_type: m.entity_type,
        })),
      }];
    } else if (products.length === 1) {
      const m = products[0];
      exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
    }
  }

  // ── shared: if we built options, require the user to pick ──
  if (specific_options.length > 0) {
  const norm = s => String(s || '').toLowerCase().trim();
  const tokens = (resolver.tokens ?? []).map(norm).filter(Boolean);

  // keep only candidates whose CODE relates to a typed token (drop description-only matches)
  if (tokens.length > 0) {
    specific_options = specific_options.map(o => ({
      ...o,
      candidates: o.candidates.filter(c => {
        const code = norm(c.code || c.canonical_code || c.label);
        // candidate's code contains a typed token, OR a typed token contains the code
        return tokens.some(t => code.includes(t) || t.includes(code));
      }),
    })).filter(o => o.candidates.length > 0);
  }
}

// FIX A: drop candidates already covered by an exact code-resolution (descriptor noise),
// then drop any token group left empty. A descriptor token whose matches are all the same
// products we already resolved exactly must NOT manufacture false ambiguity.
if (specific_options.length > 0 && exact_entities.length > 0) {
  const exactUuids = new Set(exact_entities.map(e => e.uuid));
  specific_options = specific_options
    .map(o => ({ ...o, candidates: o.candidates.filter(c => !exactUuids.has(c.uuid)) }))
    .filter(o => o.candidates.length > 0);
}

if (specific_options.length > 0) {
  require_specific = true;
  gate_passed = false;
  gate_reason = `'${domain}' ambiguous (no single exact match); user must pick`;
  const flatLabels = specific_options.flatMap(o => o.candidates.map(c => c.label));
  const numbered = flatLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
  // mc-prefix-collapse (exec 13002464): say what DID resolve. Four codes typed, three resolved
  // cleanly, and the customer saw only the picker for the fourth — nothing said the other three
  // were found. Distinct product codes from exact_entities, in order; a header line, never a
  // numbered one (downstream annotators key on /^\d+\.\s/ and must not see this as a pick).
  const _foundCodes = [...new Set(exact_entities
    .filter(e => String(e.entity_type).toLowerCase() === 'product')
    .map(e => String(e.code || '').trim()).filter(Boolean))];
  const _foundLine = _foundCodes.length ? `Found: ${_foundCodes.join(', ')}.\n` : '';
  gate_clarification =
    `${_foundLine}${domain} search needs to be more specific. Multiple matches found. Please choose:\n${numbered}`;
}

  // FIX A: when prompting, the selectable set comes from the token-filtered, exact-deduped
  // specific_options — NOT from the unfiltered `entities` union. gate_clarification was already
  // rendered from specific_options above; do NOT re-derive it here.
  if (require_specific) {
    const optUuids = new Set(specific_options.flatMap(o => o.candidates.map(c => c.uuid)));
    compatible_entities = entities.filter(e => optUuids.has(e.uuid));
  } else if (exact_entities.length > 0) {
    // not prompting → pass the cleanly-resolved entities through as a SET
    compatible_entities = exact_entities;
  }
}

let _custProbeEntities = null;   // set by the ambiguity picker below; consumed by probe-customer-orders
let _custFamilies = null;        // base -> [uuid,...] for the rendered candidates; persisted for the pick turn

// ── AMBIGUOUS CUSTOMER → ASK WHICH COMPANY (captain, 2026-08-20) ──────────────
// A fuzzy customer token can resolve to several UNRELATED companies: "4 smart" returned 15
// accounts across 4 SMART PLUS, SB SMART CONCEPT, EUROSMART BATHROOM SOLUTION, DE SMART HOME
// TRADING, FOUR SMART PLUS ENTERPRISE and V SMART KITCHEN, and the answer listed 16 orders
// belonging to three of them (exec 13207261). The If3 miss gate cannot catch this — the customer
// DID resolve, just to too many — so ask instead of unioning, reusing the require_specific picker
// this node already renders (numbered list -> selection_context 'disambiguation' -> positional
// pick). No new lane, no new node.
//
// Accounts of the SAME company are NOT ambiguity: "MASTILE KLANG SDN BHD", "… [A/C I]",
// "… - [IBORN]" share one base name and must keep answering together (the blessed case returns
// exactly one order and must not start asking). Grouping is therefore by BASE NAME, with
// bracketed/parenthesised account suffixes and the SDN BHD form stripped before counting.
//
// Never fires when the customer arrived via an explicit PICK — the captain's rule is that a pick
// merges the whole family — nor when another picker already claimed this turn (!require_specific).
// shared by the ambiguity picker AND the pinned-pick block below — ONE definition, so the two
// can never disagree about what counts as "the same company".
const _custName = (m) => {
  const d = (m && m.display) || {};
  // strip the ACCOUNT suffix only ("- [IBORN]", "[A/C I]") — the legal name, including a
  // parenthesised "(M)", stays. The picker lists COMPANIES; account markers are noise here.
  return String(d.customer_name || d.debtor_name || '').trim()
    .replace(/\s*-\s*\[[^\]]*\]\s*$/, '')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim();
};
const _custBase = (m) => (_custName(m) || String((m && m.canonical_code) || ''))
  .toUpperCase()
  .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')          // [A/C I], (CERAMIC & ELLECI)
  .replace(/\bSDN\.?\s*BHD\.?\b|\bSDN\b|\bBHD\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

if (!require_specific && (ALLOWED[domain] ?? []).includes('customer')) {
  const _pickApplied = parser.dym_pick_applied === true
    || Number(parser.dym_partial_pick) > 0
    || (Array.isArray(parser.reference_positions) && parser.reference_positions.length > 0);
  const _bases = new Map();
  for (const m of flat) {
    if (!m || !m.uuid || String(m.entity_type).toLowerCase() !== 'customer') continue;
    const b = _custBase(m);
    if (b && !_bases.has(b)) _bases.set(b, m);          // first row wins: resolver ranks by similarity
  }
  if (!_pickApplied && _bases.size > 1) {
    const _reps = [..._bases.values()].slice(0, 8);     // cap the list; 8 lines is already a lot to read
    // FORWARD PROBE INPUT (captain, 2026-08-21): the picker is about to replace compatible_entities
    // with the customer options, which would drop the product/date scope the customer actually asked
    // about. Keep a merged list — the candidates PLUS everything else that resolved this turn — so the
    // probe can ask "does this customer have a matching delivery?" under the SAME filters.
    // Send the WHOLE ACCOUNT FAMILY of each candidate, keyed by canonical code — a representative
    // uuid alone probes the wrong rows: YOO LIVING HOUSE's orders sit on a sibling account, so a
    // one-uuid-per-company probe came back empty and every line read "no delivery" (exec 13250405).
    const _repBases = new Set(_reps.map(_custBase).filter(Boolean));
    const _famRowsAll = flat.filter(m => m && m.uuid
      && String(m.entity_type).toLowerCase() === 'customer'
      && _repBases.has(_custBase(m)));
    const _famRows = _famRowsAll;
    const _famSeen = new Set();
    // Remember WHICH uuids each rendered candidate stands for. The pick turn re-resolves only the
    // label it was given, and a label like "A CRAFT IDEA SDN BHD (SRT)" matches exactly ONE account,
    // so family expansion had nothing to expand and the answer covered one account while the probe
    // had counted the whole family — "has delivery" on the picker, "no delivery" after picking
    // (execs 13256193 / 13256248). Persisted by compile-current-state, read back below on the pick.
    _custFamilies = {};
    for (const _m of _famRowsAll) {
      const _b = _custBase(_m);
      if (!_b || !_repBases.has(_b)) continue;
      (_custFamilies[_b] = _custFamilies[_b] || []).push(String(_m.uuid));
    }
    _custProbeEntities = [
      ..._famRows.filter(m => !_famSeen.has(String(m.uuid)) && _famSeen.add(String(m.uuid)))
                 .map(m => ({ uuid: m.uuid, entity_type: 'customer', code: m.canonical_code })),
      ...compatible_entities.filter(c => String(c && c.entity_type).toLowerCase() !== 'customer'),
    ];
    require_specific   = true;
    gate_passed        = false;
    gate_reason        = `'${domain}' customer token matches ${_bases.size} different companies; user must pick`;
    gate_clarification = 'Which customer do you mean? Please choose:\n'
      + _reps.map((m, i) => `${i + 1}. ${_custName(m) || m.canonical_code}`).join('\n');
    // the roster compile-current-state persists comes from compatible_entities, so it must be the
    // SAME rows in the SAME order as the numbered lines above or the positional pick misresolves.
    // `title` is what compile-current-state labels the roster row with (its priority is
    // title -> code -> canonical_code), so the persisted rows read as company NAMES and a reply
    // by name resolves as well as a reply by number. `code` stays the canonical debtor code.
    compatible_entities = _reps.map(m => ({ uuid: m.uuid, entity_type: 'customer', code: m.canonical_code, title: _custName(m) || m.canonical_code }));
  }
}

// ── A PINNED PICK WINS OVER FUZZY RE-RESOLUTION (captain, 2026-08-20) ────────
// An entity carrying a uuid came from a roster pick — the customer already told us which row they
// meant. The resolver still re-resolves its NAME as text, and that sprays siblings: picking
// "SIGNATURE BUILDING MATERIAL SDN BHD" off the picker matched 9 customers, KL BUILDING MATERIALS
// among them, and the answer showed the wrong company (exec 13212841). Restrict the picked
// entity's TYPE to the pinned uuids; other types (the product, the date-scoped rest) are untouched.
// Fails open: applied only when every pinned uuid actually survived resolution, so a stale pin
// leaves the turn byte-identical.
if (!require_specific) {
  const _pins = (Array.isArray(parser.entities) ? parser.entities : [])
    .filter(e => e && e.current_message === true && e.uuid);
  const _pinUuids = new Set(_pins.map(e => String(e.uuid)));
  if (_pinUuids.size) {
    // A PICK IS AUTHORITATIVE — DO NOT MAKE IT SURVIVE TEXT RE-RESOLUTION.
    // The roster row we ourselves rendered carries the uuid the customer chose, but the spine still
    // re-resolves its LABEL as text, and a label the CRM cannot match back ("YOO LIVING HOUSE
    // [A/C III] - PRICETAG", canonical_code DBR-59e57de1b7) resolves to nothing: the picked customer
    // vanished, If3 refused the turn, and the reply named only the product (exec 13245182 — the gate
    // was right to block, but the customer should never have gone missing). Re-seat any pinned row
    // the resolver dropped. Type-checked against the domain's allow-list, and the uuid can only come
    // from a roster this flow built, so nothing unvetted enters here.
    const _allowedPin = ALLOWED[domain] ?? null;
    // Re-seat CARRIED picks too (current_message false): a customer chosen two turns ago is just as
    // authoritative as one chosen now, and its label re-resolves no better. Only the RESTRICT filter
    // below stays keyed on this-turn pins, so a carried row can never narrow a freshly named scope.
    const _pinsAll = (Array.isArray(parser.entities) ? parser.entities : []).filter(e => e && e.uuid);
    for (const _e of _pinsAll) {
      const _u = String(_e.uuid);
      if (compatible_entities.some(c => String(c.uuid) === _u)) continue;
      const _t = String(_e.hint || '').toLowerCase();
      if (!_t || (_allowedPin && !_allowedPin.includes(_t))) continue;
      // Label with something a human recognises: a picked customer's canonical_code is often a
      // synthetic debtor id (DBR-59e57de1b7), which the miss/answer renderers print verbatim —
      // "customer: DBR-59e57de1b7". The entity's raw IS the roster label we showed, so prefer it
      // whenever the canonical code is synthetic. Products keep their canonical code.
      const _synthetic = /^(dbr-|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(String(_e.canonical_code || ''));
      const _label = (_synthetic ? (_e.raw || _e.canonical_code) : (_e.canonical_code || _e.raw)) || null;
      compatible_entities = [...compatible_entities,
        { uuid: _u, entity_type: _t, code: _label }];
    }
    const _pinTypes = new Set(_pins.map(e => String(e.hint || '').toLowerCase()).filter(Boolean));
    const _allPresent = [..._pinUuids].every(u => compatible_entities.some(c => String(c.uuid) === u));
    if (_allPresent) {
      // A picked CUSTOMER selects its whole ACCOUNT FAMILY, never just the pinned row — the
      // captain's rule is that a pick answers the company. Picking "SIGNATURE BUILDING MATERIAL
      // SDN BHD" therefore keeps 300-S292/S293/S294 ([A/C I]/[III]/[IV]) and drops KL BUILDING
      // MATERIALS, KOW HOCK, MKH, TEK WEE and TROPICANA, which merely share the words.
      // A pick must cover the SAME accounts the picker's probe counted. This turn's resolver only
      // sees the label it was handed, so read the family remembered from the picker turn.
      const _famMem = (() => { try {
        const _s = $('get-session-vars').first().json;
        const _v = (_s && _s.session_vars && _s.session_vars.variables) || (_s && _s.variables) || {};
        return (_v && typeof _v.picker_families === 'object' && _v.picker_families) || null;
      } catch (e) { return null; } })();
      const _famAdded = new Set();
      if (_famMem) {
        const _have = new Set(compatible_entities.map(c => String(c && c.uuid)));
        for (const _e of _pins) {
          if (String(_e.hint || '').toLowerCase() !== 'customer') continue;
          const _b = _custBase({ display: {}, canonical_code: _e.raw || _e.canonical_code });
          const _fam = _famMem[_b];
          if (!Array.isArray(_fam)) continue;
          for (const _u of _fam) {
            if (_have.has(String(_u))) continue;
            compatible_entities = [...compatible_entities, { uuid: String(_u), entity_type: 'customer', code: _e.raw || _e.canonical_code }];
            _have.add(String(_u)); _famAdded.add(String(_u));
          }
        }
      }
      const _rowByUuid = new Map(flat.filter(m => m && m.uuid).map(m => [String(m.uuid), m]));
      const _pinBases = new Set([..._pinUuids]
        .map(u => _rowByUuid.get(u))
        .filter(m => m && String(m.entity_type).toLowerCase() === 'customer')
        .map(_custBase).filter(Boolean));
      const _kept = compatible_entities.filter(c => {
        const t = String(c.entity_type).toLowerCase();
        if (!_pinTypes.has(t)) return true;                       // other types untouched
        if (_pinUuids.has(String(c.uuid))) return true;           // the pinned row itself
        if (_famAdded.has(String(c.uuid))) return true;           // remembered family of the pick
        if (t !== 'customer' || !_pinBases.size) return false;    // non-customer pins stay exact
        const row = _rowByUuid.get(String(c.uuid));
        return !!row && _pinBases.has(_custBase(row));            // same company -> keep
      });
      if (_kept.length) compatible_entities = _kept;
    }
  }
}

// ── document-class precision (container-status S1) ────────────────────────────
// The CRM resolver answers an attachment miss with a word-tier fallback over
// attachment_type: "container status list" returns Packing List (word:list),
// Stock_List (word:list) AND container_status (word:status). All three reach
// attachment_type_id, so a contact GRANTED container status is handed three
// document types when they asked for one. (Measured: exec 11661198.)
//
// The parser already named the class it meant — an `attachment` entity carries
// canonical_code "container status". Use it to pick.
//
// FAIL-OPEN by design: if the parser named nothing, or nothing matches, keep the
// full set. Over-broad is today's behaviour; a wrong narrowing would silently
// answer about the wrong document.
const _dcNorm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const _dcWanted = new Set(
  (parser.entities ?? [])
    .filter(e => ['attachment', 'attachment_type'].includes(String(e.hint || '').toLowerCase()))
    .map(e => _dcNorm(e.canonical_code))
    .filter(Boolean)
);
let _dcSoleUuid = null;   // set when narrowing lands on exactly ONE document class
if (_dcWanted.size > 0) {
  const _dcTypeMatches = compatible_entities.filter(e => e.entity_type === 'attachment_type');
  if (_dcTypeMatches.length > 1) {
    // `code` is the slug ("container_status"); display.type_name is the human label
    // ("Container Status"). Either may carry the class, so check both — Packing List
    // and Stock_List have code null and only a type_name.
    const _dcNameByUuid = {};
    for (const m of flat) if (m && m.uuid) _dcNameByUuid[m.uuid] = m.display && m.display.type_name;
    const _dcKeep = _dcTypeMatches.filter(e =>
      _dcWanted.has(_dcNorm(e.code)) || _dcWanted.has(_dcNorm(_dcNameByUuid[e.uuid])));
    if (_dcKeep.length > 0) {
      const _dcKeepUuids = new Set(_dcKeep.map(e => e.uuid));
      compatible_entities = compatible_entities.filter(
        e => e.entity_type !== 'attachment_type' || _dcKeepUuids.has(e.uuid));
      gate_reason += `; document-class narrowed to [${_dcKeep.map(e => e.code || _dcNameByUuid[e.uuid]).join(', ')}]`;
      if (_dcKeep.length === 1) _dcSoleUuid = _dcKeep[0].uuid;
    }
  }
}

const out = $input.first().json;

// ── record the narrowing in `resolutions`, not just in `compatible_entities` ──────────
// Narrowing above fixes WHICH document we ask the CRM for, but the resolver's own verdict for
// the token is still {resolved:false, ambiguous:true} — and dym-transform picks its did-you-mean
// candidates straight off `resolutions` (dym-transform.js:155, `res.resolved !== true`). Left
// alone the customer gets BOTH the file and "Couldn't find 'container status list' — did you
// mean Packing List, Stock_List, container_status" in one message, which reads as broken even
// though the answer above it is correct. Measured on the clone after the param fix.
//
// Only claim resolution when the narrowing was UNAMBIGUOUS (exactly one class survived) AND this
// token's own matches actually contain that uuid — otherwise a second, genuinely-missed token in
// the same turn would be silently marked resolved and lose its did-you-mean.
// mc-prefix-collapse: a token collapsed above (one code, several companies, non-exact tier) IS answered —
// its uuids are in compatible_entities. Stamp it like document-class narrowing does; the dym consumers
// key on `resolved_by` (they must accept 'same-code-collapse' — see their _gateResolvedTokens filter).
if (_collapsedTokens.length && Array.isArray(out.resolutions)) {
  for (const res of out.resolutions) {
    if (!res || res.resolved === true) continue;
    if (!_collapsedTokens.includes(String(res.token ?? '').trim().toLowerCase())) continue;
    res.resolved  = true;
    res.ambiguous = false;
    res.resolved_by = 'same-code-collapse';
  }
}
if (_dcSoleUuid && Array.isArray(out.resolutions)) {
  for (const res of out.resolutions) {
    if (!res || res.resolved === true) continue;
    const ms = Array.isArray(res.matches) ? res.matches : [];
    const hit = ms.find(m => m && m.uuid === _dcSoleUuid);
    if (!hit) continue;
    res.resolved  = true;
    res.ambiguous = false;
    res.matches   = [hit];            // the class we actually asked for, not the word-tier spray
    res.resolved_by = 'document-class-narrowing';
  }
}
out.gate_passed = gate_passed;
out.require_specific = require_specific;
// ── #9 multi-company routing ──────────────────────────────────────────────
// The resolver now stamps company_id/company_name on every match (CRM multi-company is
// live). Derive the escalation team from the RESOLVED ENTITY'S company instead of guessing
// from the customer's access levels — which is empty on an unqualified turn and made every
// promotion escalation fall back to `sorento`, sending Mocha/Cabana enquiries to the wrong
// team. Brand tokens already routed correctly; this covers product- and promotion-scoped
// turns too. Falls back to the parser's routing when no company is resolvable.
{
  const _VALID = ['sorento', 'cabana', 'mocha'];
  // ── #16 brand beats company ────────────────────────────────────────────
  // This block was written calling its variable `_brands` while reading `company_name`, and that
  // conflation is a real bug once the model is stated: **Cabana is a BRAND under the Sorento
  // COMPANY.** So `company_name` is only ever "Sorento" or "Mocha", the `cabana` arm above is
  // unreachable, and every Cabana enquiry routes to the Sorento team (exec 11894257: CBS212-WH →
  // company "Sorento" → marketing_promotion_sorento). The parser's own enum was already
  // brand-keyed — `marketing_promotion_<brand>`, allowed sorento|cabana|mocha — so only the gate
  // was wrong.
  //
  // Rule: brand names a team → that team; otherwise fall back to the COMPANY, which is what
  // carries Mocha and is the right answer for every other brand ("if not cabana, then sorento").
  //
  // ⚠️ INERT until the CRM emits brand. Surveyed 35 product resolutions across every match path
  // (exact/and/prefix/substring): not one carries `display.brand`. `_brandTok` returns null on
  // every one of them, so this collapses to the previous company-only behaviour byte for byte.
  // Gate: tests/offline/brand-routing/probe.js — 48 INERT assertions replay real recorded gate
  // output fixture by fixture, so the day this stops being inert, they say so.
  const _brandTok = (m) => {
    const b = m && m.display && m.display.brand;
    if (!b) return null;
    const s = (typeof b === 'object')
      ? `${b.brand_name || ''} ${b.brand_code || ''}`.toLowerCase()
      : String(b).toLowerCase();
    return _VALID.find(v => s.includes(v)) || null;   // unknown brand ⇒ defer to company
  };
  // ── the brand the CUSTOMER named, between row-brand and company ──────────────
  // Promotion rows carry no `brand` (CRM ask item 4), so an all-Cabana promotion list fell all the
  // way through to company — and company is "Sorento" for every Cabana product by definition, so
  // it routed Cabana enquiries to the Sorento team even after #16. The parser already identifies
  // the brand as an ENTITY (`{raw: "Cabana", hint: "brand"}`); prefer that over the company.
  // Order: the row's own brand > the brand the customer named > the row's company.
  const _parserBrand = (() => {
    for (const e of (Array.isArray(parser.entities) ? parser.entities : [])) {
      if (String((e && e.hint) || '').toLowerCase() !== 'brand') continue;
      const v = _VALID.find(x => String((e && e.raw) || '').toLowerCase().includes(x));
      if (v) return v;
    }
    return null;
  })();
  const _names = flat.map(m => String((m && m.company_name) || '').toLowerCase()).filter(Boolean);
  const _brands = [...new Set(flat
    .map(m => _brandTok(m) || _parserBrand || _VALID.find(v => String((m && m.company_name) || '').toLowerCase().includes(v)) || null)
    .filter(Boolean))];
  // Only when UNAMBIGUOUS — a mixed-company result set must not be collapsed to an arbitrary
  // first match (the dedup-by-code failure shape).
  out.resolved_company = _brands.length === 1 ? _brands[0] : null;
  // F-R4-3 (captain, 2026-08-18: "fix it now, we should do marketing_promotion"). CRM migration 371
  // MERGED the brand-suffixed T1 rows, so `marketing_promotion_<brand>` no longer names a team the
  // CRM can resolve — next-assignee(team_code='marketing_promotion_sorento') finds nothing. The
  // parser fork's deriveRouting (a68c5992) already returns the collapsed `marketing_promotion`, and
  // BOTH consumers of this field PREFER it over the parser's routing (promo-picker._escTeam and
  // escalate-catalog's live `_ct` hunk), so one promotions turn could name TWO different teams for
  // one pool — the brand-suffixed one in the not-found offer, the collapsed one in the round-4 miss
  // offer. Collapse it at the source. The `_brands.length === 1` guard is kept verbatim: the field
  // still goes null on a mixed/unresolvable company set and the consumers still fall back to the
  // parser's routing exactly as before. The brand axis is NOT lost — the routing_brand /
  // routing_companies block below still carries it for the roster and the assignment.
  out.company_team = (domain === 'promotion' && _brands.length === 1)
    ? 'marketing_promotion' : null;
  out.resolved_companies = _brands;
  // ── brand-company-routing: routing axes for roster + assignment ──
  // company = the enquired ITEM's company (primary axis); brand = its brand row (secondary, narrows the pool)
  const _compat = new Set(compatible_entities.map(e => e.uuid));
  let _rows = flat.filter(m => m && m.uuid && _compat.has(m.uuid) && m.entity_type === 'product');
  if (!_rows.length) _rows = flat.filter(m => m && m.uuid && _compat.has(m.uuid) && m.company_id);
  const _bc = m => { const b = m && m.display && m.display.brand; const c = b && (typeof b === 'object' ? b.brand_code : b); return c ? String(c).trim().toLowerCase() : null; };
  const _byCo = new Map();
  for (const m of _rows) { if (!m.company_id) continue; const g = _byCo.get(m.company_id) || { company_id: m.company_id, company_name: m.company_name || null, brands: new Set(), codes: new Set() }; const b = _bc(m); if (b) g.brands.add(b); if (m.canonical_code) g.codes.add(m.canonical_code); _byCo.set(m.company_id, g); }
  const _allBrands = [...new Set(_rows.map(_bc).filter(Boolean))];
  // brand unknown stays unknown: the resolved rows' brand only when unambiguous, else the customer's
  // OWN stated brand only when they named exactly one. No access-level guess — a null brand makes the
  // CRM resolve from the company-bounded base pool, which is wider than an arbitrarily narrowed one.
  const _qb = (Array.isArray(parser.query_brands) && parser.query_brands.length === 1) ? String(parser.query_brands[0]).toLowerCase() : null;
  out.routing_brand = _allBrands.length === 1 ? _allBrands[0] : (_qb || null);
  out.routing_brand_source = _allBrands.length === 1 ? 'resolved' : (_qb ? 'stated' : null);
  // per-company brand = that company's OWN row brand (unambiguous) — the global routing_brand is only
  // inherited when there is a single company (multi-company entries never borrow another company's brand)
  const _cos = [..._byCo.values()];
  out.routing_companies = _cos.map(g => ({ company_id: g.company_id, company_name: g.company_name, brand_code: g.brands.size === 1 ? [...g.brands][0] : (_cos.length === 1 ? (out.routing_brand || null) : null), codes: [...g.codes] })).sort((a, b) => String(a.company_name).localeCompare(String(b.company_name)));
  out.routing_company = out.routing_companies.length === 1 ? out.routing_companies[0].company_id : null;
}

// ── Q23 — a stated access level the contact does not hold ───────────────────────
// Say so, then still show what they DO have. Without this the intersection is empty, the CRM
// returns nothing and the customer gets a generic "not found" for a question that was really
// an entitlement problem.
{
  // F5: `Aggregate` only runs when intent_hint == 'check_promotion' (node `If`). On any other
  // turn it is unexecuted, _entitled is [] and EVERY stated level looked unheld — producing a
  // false "You don't have access to End User promotions" on e.g. a stock question. Require the
  // promotion domain AND a real entitlement read before claiming anything about access.
  //
  // access-tier-ask-plan §4: stated values are TIER TOKENS now (the parser fork emits
  // ['dealer']). tier-gate — always executed when Aggregate is, same lane — already
  // normalised them (compound "Sorento Dealer" included, via parseLevel) and mapped the
  // entitlement to tiers. Held is checked AT TIER LEVEL: a contact holding any *Dealer
  // name "holds" dealer. The legacy exact-name check is kept as the fallback when
  // tier-gate is absent, so nothing regresses off this fork.
  let _tg = null;
  try { _tg = $('tier-gate').isExecuted ? $('tier-gate').first().json : null; } catch (e) { _tg = null; }
  if (domain === 'promotion' && _tg) {
    const _statedT = Array.isArray(_tg.tier_stated) ? _tg.tier_stated : [];
    const _entT = Array.isArray(_tg.entitled_tiers) ? _tg.entitled_tiers : [];
    const _heldT = _statedT.filter(t => _entT.includes(t));
    const _TIER_LABEL = { dealer: 'dealer', office: 'office', end_user: 'end user' };
    out.access_denied_levels = (_statedT.length > 0 && _heldT.length === 0) ? _statedT : [];
    out.brand_gate_empty = _tg.brand_gate_empty === true;
    // F1: NOTICE keys on brand_unheld, SUPPRESSION on brand_gate_empty. They are different
    // questions — "you named a brand you don't hold" vs "nothing may be sent" — and while one
    // flag answered both, a brandless contact was told what they have and then shown nothing.
    out.brand_unheld = _tg.brand_unheld === true;
    if (out.access_denied_levels.length) {
      out.access_notice = `You don't have access to ${_statedT.map(t => _TIER_LABEL[t] || t).join(', ')} promotions. Here's what you do have:`;
    } else if (out.brand_unheld) {
      // R5/TA-11: the customer named brand(s) they hold no entitlement for. tier-gate sent
      // [] to get-results (FAIL-CLOSED — the CRM returns nothing), so the not-found path
      // renders; it prepends this notice, which is the WHY.
      // F5: a flat denial is the ONLY correct copy here, because brand_unheld now implies the gate
      // closed (mapper R9d) — nothing follows the notice. The first F5 fix made this copy
      // conditional ("— here's what you do have:" when something survived); that branch became
      // unreachable once brand_unheld stopped firing beside a brandless answer, so it was removed
      // rather than shipped as a branch no mutation could turn red.
      out.access_notice = `You don't have access to ${(Array.isArray(_tg.query_brands) ? _tg.query_brands : []).join(', ')} promotions.`;
    } else {
      out.access_notice = '';
    }
  } else {
    let _aggOk = false, _entitled = [];
    try { _aggOk = $('Aggregate').isExecuted; if (_aggOk) _entitled = $('Aggregate').first().json.name || []; } catch (e) { _aggOk = false; }
    const _stated = (domain === 'promotion' && _aggOk)
      ? (Array.isArray(parser.access_levels) ? parser.access_levels : []).map(a => String(a || '').trim()).filter(Boolean)
      : [];
    const _lc = _entitled.map(a => String(a).toLowerCase());
    const _held = _stated.filter(a => _lc.includes(a.toLowerCase()));
    out.access_denied_levels = (_stated.length > 0 && _held.length === 0) ? _stated : [];
    out.access_notice = out.access_denied_levels.length
      ? `You don't have access to ${_stated.join(', ')} promotions. Here's what you do have:` : '';
    out.brand_gate_empty = false;
    out.brand_unheld = false;
  }
}

out.gate_reason = gate_reason;
out.gate_clarification = gate_clarification;   // '' when nothing to ask
out.compatible_entities = compatible_entities;
if (_custProbeEntities && _custProbeEntities.length) out.customer_probe_entities = _custProbeEntities;
if (_custFamilies && Object.keys(_custFamilies).length) out.picker_families = _custFamilies;
out.gate_debug = { domain, allowed_lookup: ALLOWED[domain], entities_count: entities.length };
return out;

