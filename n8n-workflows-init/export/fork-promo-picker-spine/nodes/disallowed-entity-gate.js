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

// ── AMBIGUITY → REQUIRE SPECIFIC SELECTION ──────────────────────────────
// Domains where an ambiguous token must be disambiguated by the user before we
// can scope a lookup. (promotion already short-circuits below; this generalizes it.)
const REQUIRE_SPECIFIC_DOMAINS = new Set(['incoming', 'product_attachment']);
let require_specific = false;
let specific_options = [];
let exact_entities = [];   // tokens resolved by a single compatible exact match

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
        if (exacts.length === 1) {
          const m = exacts[0];
          exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
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
    if (prodExacts.length === 1) {
      const m = prodExacts[0];
      exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
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
  gate_clarification =
    `${domain} search needs to be more specific. Multiple matches found. Please choose:\n${numbered}`;
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

// ── document-class precision (container-status S1) ──────────────────────
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
// ── #9 multi-company routing ────────────────────────────────────────────────
// The resolver now stamps company_id/company_name on every match (CRM multi-company is
// live). Derive the escalation team from the RESOLVED ENTITY'S company instead of guessing
// from the customer's access levels — which is empty on an unqualified turn and made every
// promotion escalation fall back to `sorento`, sending Mocha/Cabana enquiries to the wrong
// team. Brand tokens already routed correctly; this covers product- and promotion-scoped
// turns too. Falls back to the parser's routing when no company is resolvable.
{
  const _VALID = ['sorento', 'cabana', 'mocha'];
  // ── #16 brand beats company ────────────────────────────────────────────────
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
  out.company_team = (domain === 'promotion' && _brands.length === 1)
    ? `marketing_promotion_${_brands[0]}` : null;
  out.resolved_companies = _brands;
}

// ── Q23 — a stated access level the contact does not hold ───────────────────
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
out.gate_debug = { domain, allowed_lookup: ALLOWED[domain], entities_count: entities.length };
return out;
