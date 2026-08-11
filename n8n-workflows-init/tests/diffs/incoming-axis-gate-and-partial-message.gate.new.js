// ── Domain ↔ Entity-Type Gate (compatibility + required-type) ──────────────
const parser   = $('Call \'sub-query-reformulator\'').first().json.output ?? {};
const domain   = parser.domain_hint ?? null;
const resolver = $('resolve-entity').first().json ?? {};

const ALLOWED = {
  master_products:    ['product', 'category', 'brand'],
  product_attachment: ['product', 'attachment', 'attachment_type', 'category', 'brand'],
  promotion:          ['product', 'promotion', 'category', 'brand'],
  inventory:          ['product', 'category', 'brand'],
  order:              ['order', 'customer_order', 'transporter', 'customer', 'product'],
  incoming:           ['product', 'inbound_shipment', 'category', 'brand'],
  forms:              ['form'],
  portal_link:        [],
};
const ALLOWS_EMPTY = {
  promotion: true, incoming: true, forms: true, portal_link: true,
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
        ? `Please specify which type of attachment you need for ${subject} — e.g. ${TYPE_PROMPT.attachment_type}.`
        : `Please specify the ${t}.`
    ).join(' ');
  }
}

// ── PER-TOKEN parser-hint classification (Option B iteration 2) ───────────────
// Replaces the whole-query IDENTIFIER/PRODUCT mode switch (too coarse for a message mixing containers +
// a product). Each resolver token is classified by its PARSER hint — NOT by what the greedy resolver
// matched — so a warehouse-hinted "Sorento" that fell back to products is NOISE (dropped even if the
// parser 'warehouse' block leaks), and containers + a product in one message are each handled on their
// own axis.
//   AXIS    = hint ∈ AXIS[domain]                    (incoming: inbound_shipment)
//   PRODUCT = hint ∈ ALLOWED[domain] but NOT an axis (product/category/brand; also product_attachment's
//             attachment_type — so that domain keeps resolving)
//   NOISE   = hint not compatible with the domain at all (e.g. warehouse) → dropped entirely
const REQUIRE_SPECIFIC_DOMAINS = new Set(['incoming', 'product_attachment']);
const AXIS = { incoming: ['inbound_shipment'] };   // order OMITTED (would drop customer/transporter scoping)
const PRODUCT_FAMILY = new Set(['product', 'category', 'brand']);

let require_specific = false;
let specific_options = [];
let exact_entities = [];              // resolved product/attachment exacts
let compatible_axis = [];             // resolved axis (inbound_shipment) matches
let not_found_axis_tokens = [];       // AXIS-hinted parser tokens with no axis-type match
let not_found_product_tokens = [];    // PRODUCT_FAMILY-hinted parser tokens with no product match

const norm = s => String(s || '').toLowerCase().trim();
const parserEnts = parser.entities ?? [];
const axisTypes  = new Set(AXIS[domain] ?? []);
const hasAxis    = axisTypes.size > 0;
// "product-ish" disambiguation bucket = compatible types that are NOT the axis. Covers product/category/
// brand (incoming/inventory) AND attachment_type/attachment (product_attachment) so that domain keeps
// resolving. A hint outside ALLOWED[domain] classifies as NOISE.
const compatNonAxis = new Set((ALLOWED[domain] ?? []).filter(t => !axisTypes.has(t)));

// resolver token → parser entity hint (fuzzy: exact, then includes either direction — handles the parser
// raw "Sorento warehouse" ⊃ resolver token "Sorento" truncation).
const hintForToken = (token) => {
  const t = norm(token);
  let pe = parserEnts.find(e => norm(e.raw) === t);
  if (!pe) pe = parserEnts.find(e => { const r = norm(e.raw); return r && (r.includes(t) || t.includes(r)); });
  return pe ? pe.hint : null;
};
const classifyHint = (hint) =>
  (hasAxis && axisTypes.has(hint)) ? 'AXIS'
  : compatNonAxis.has(hint)        ? 'PRODUCT'
  :                                  'NOISE';

const resolutions  = Array.isArray(resolver.resolutions)  ? resolver.resolutions  : null;
const intersection = Array.isArray(resolver.intersection) ? resolver.intersection
                   : (resolver.by_entity_type ? Object.values(resolver.by_entity_type).flat() : null);

// ── (A) require-specific domains (incoming, product_attachment): axis + product disambiguation ──
if (REQUIRE_SPECIFIC_DOMAINS.has(domain)) {
  const allowedTypes = ALLOWED[domain] ?? null;
  const typedTokens  = new Set((resolver.tokens ?? []).map(norm));
  const isCompatible = m => allowedTypes === null || allowedTypes.includes(m.entity_type);
  const isProd = m => String(m.entity_type).toLowerCase() === 'product';

  // (A1) AXIS handling — ALWAYS, regardless of co-existing product tokens (fixes 8528931).
  if (hasAxis) {
    const axisParserEnts = parserEnts.filter(e => axisTypes.has(e.hint));
    for (const e of axisParserEnts) {
      const raw = norm(e.raw);
      const hitRes = (resolutions ?? []).find(r =>
        (raw.includes(norm(r.token)) || norm(r.token).includes(raw)) &&
        (r.matches ?? []).some(m => axisTypes.has(m.entity_type)));
      if (hitRes) {
        for (const m of (hitRes.matches ?? []).filter(m => axisTypes.has(m.entity_type))) {
          compatible_axis.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
        }
      } else {
        // ── PRODUCT-ONLY-ON-INCOMING fix (repro exec 8565622: "Srt6632-GM ETA") ──
        // An axis-hinted token (parser hint inbound_shipment) with NO inbound_shipment match may still
        // resolve exact + unambiguous to a PRODUCT — incoming is legitimately searchable BY product
        // ("find the shipments containing SRT6632-GM"; ALLOWED.incoming includes 'product'). Classify by
        // the RESOLVED entity_type against the domain's allowed NON-axis lookup (compatNonAxis), NOT by
        // the parser hint, and admit that single exact as a product search-key so get-results queries
        // incoming by product (matching live/prod). Only exact + unambiguous single resolution
        // auto-admits; a genuinely ambiguous / multi-match resolution stays in not_found_axis_tokens
        // (never silently promoted to a picklist — the PRODUCT-hinted picklist path is unchanged).
        const fbRes = (resolutions ?? []).find(r =>
          (raw.includes(norm(r.token)) || norm(r.token).includes(raw)));
        const fbMatches = (fbRes?.matches ?? []).filter(m => m && compatNonAxis.has(String(m.entity_type)));
        const fbExact = (fbRes && fbRes.resolved === true && fbRes.ambiguous !== true
                         && fbMatches.length === 1 && fbMatches[0].match_tier === 'exact')
                        ? fbMatches[0] : null;
        if (fbExact) {
          exact_entities.push({ uuid: fbExact.uuid, entity_type: fbExact.entity_type, code: fbExact.canonical_code });
        } else {
          not_found_axis_tokens.push(e.raw);
        }
      }
    }
    if (!resolutions && intersection) {   // AND-mode: axis matches carry no token
      for (const m of intersection.filter(m => m && axisTypes.has(m.entity_type))) {
        compatible_axis.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
      }
    }
  }

  // (A2) PRODUCT disambiguation — existing OR/AND logic, PRE-FILTERED to PRODUCT-classified tokens ONLY
  //      so AXIS + NOISE tokens can never become picklist candidates (fixes 8529182).
  const productResolutions  = resolutions ? resolutions.filter(r => classifyHint(hintForToken(r.token)) === 'PRODUCT') : null;
  const productIntersection = (!resolutions && intersection) ? intersection.filter(m => m && compatNonAxis.has(String(m.entity_type))) : null;

  if (productResolutions) {
    // ── OR-MODE ── (unchanged body, over productResolutions)
    // FIX D: the disambiguation choose-list is PRODUCT-ONLY. Non-product matches (attachment_type, etc.)
    // are resolved straight through and NEVER offered as a choice.
    const stillAmbiguous = [];
    for (const r of productResolutions) {
      const matches = (r.matches ?? []).filter(isCompatible);
      if (matches.length === 0) continue;

      const products    = matches.filter(isProd);
      const nonProducts = matches.filter(m => !isProd(m));

      if (nonProducts.length > 0) {
        const npExact = nonProducts.filter(m => m.match_tier === 'exact');
        const pick = npExact.length === 1 ? npExact[0] : nonProducts[0];
        exact_entities.push({ uuid: pick.uuid, entity_type: pick.entity_type, code: pick.canonical_code });
      }

      if (products.length > 0) {
        const exacts = products.filter(m => m.match_tier === 'exact');
        if (exacts.length === 1) {
          const m = exacts[0];
          exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
        } else if (products.length === 1) {
          const m = products[0];
          exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
        } else {
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

  } else if (productIntersection) {
    // ── AND-MODE ── (unchanged body, over productIntersection)
    const compatMatches = productIntersection.filter(m => m && isCompatible(m));
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
        token: (resolver.tokens ?? []).join(', '),
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

  // shared: token-relatedness filter (drop description-only matches) — unchanged
  if (specific_options.length > 0) {
    const tokens2 = (resolver.tokens ?? []).map(norm).filter(Boolean);
    if (tokens2.length > 0) {
      specific_options = specific_options.map(o => ({
        ...o,
        candidates: o.candidates.filter(c => {
          const code = norm(c.code || c.canonical_code || c.label);
          return tokens2.some(t => code.includes(t) || t.includes(code));
        }),
      })).filter(o => o.candidates.length > 0);
    }
  }

  // FIX A: drop candidates already covered by an exact code-resolution (descriptor noise) — unchanged
  if (specific_options.length > 0 && exact_entities.length > 0) {
    const exactUuids = new Set(exact_entities.map(e => e.uuid));
    specific_options = specific_options
      .map(o => ({ ...o, candidates: o.candidates.filter(c => !exactUuids.has(c.uuid)) }))
      .filter(o => o.candidates.length > 0);
  }

  // require the user to pick ONLY when a genuinely ambiguous PRODUCT token remains — unchanged render
  if (specific_options.length > 0) {
    require_specific = true;
    gate_passed = false;
    gate_reason = `'${domain}' ambiguous (no single exact match); user must pick`;
    const flatLabels = specific_options.flatMap(o => o.candidates.map(c => c.label));
    const numbered = flatLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
    gate_clarification =
      `${domain} search needs to be more specific. Multiple matches found — please choose:\n${numbered}`;
  }

  // (A3) final compatible set = picklist candidates (if prompting) else resolved axis ∪ product exacts.
  //      In the mixed partial case (WHSU resolved + BMOU/product not) this keeps WHSU in compatible_entities
  //      so get-results runs and validator.has_result=true → happy path (NOT suggest-on-miss/escalate).
  if (require_specific) {
    const optUuids = new Set(specific_options.flatMap(o => o.candidates.map(c => c.uuid)));
    compatible_entities = entities.filter(e => optUuids.has(e.uuid));
  } else {
    const merged = [...compatible_axis, ...exact_entities];
    const byU = {};
    for (const e of merged) if (e && e.uuid) byU[e.uuid] = e;
    compatible_entities = Object.values(byU);
    // preserve identifier-mode empty handling for axis domains (pure-container / nothing resolved)
    if (hasAxis && compatible_entities.length === 0) {
      gate_passed = (ALLOWS_EMPTY[domain] === true) ? gate_passed : false;
    }
  }
}

// ── (B) product not-found itemization — proceed path, any domain with product-family hints ──
//     Preserves the §21.7 inventory/master_products behaviour AND covers the require-specific proceed
//     path (e.g. incoming with a container + an unresolved product). Skipped when a picklist is shown.
if (gate_passed === true && require_specific === false) {
  const isOrMode   = Array.isArray(resolver.resolutions);
  const unresolved = (resolver.unresolved_tokens ?? []).map(norm);
  const seen = new Set();
  for (const e of parserEnts.filter(pe => PRODUCT_FAMILY.has(pe.hint))) {
    const raw = norm(e.raw);
    // false-positive guard: any resolution with a PRODUCT match for this raw → resolved → NEVER flagged.
    const resolvedProd = (resolver.resolutions ?? []).some(r =>
      (raw.includes(norm(r.token)) || norm(r.token).includes(raw)) &&
      (r.matches ?? []).some(m => String(m.entity_type).toLowerCase() === 'product'));
    if (resolvedProd) continue;
    const inUnresolved = unresolved.some(u => u && (raw.includes(u) || u.includes(raw)));
    if ((inUnresolved || isOrMode) && !seen.has(raw)) {
      seen.add(raw);
      not_found_product_tokens.push(e.raw);
    }
  }
}

const out = $input.first().json;
out.gate_passed = gate_passed;
out.require_specific = require_specific;
out.gate_reason = gate_reason;
out.gate_clarification = gate_clarification;   // '' when nothing to ask
out.compatible_entities = compatible_entities;
out.not_found_axis_tokens = not_found_axis_tokens;         // AXIS-hinted tokens not resolved (drives B2 axis line)
out.not_found_product_tokens = not_found_product_tokens;   // PRODUCT-hinted tokens not resolved (drives B2 product line)
out.gate_debug = { domain, allowed_lookup: ALLOWED[domain], entities_count: entities.length, axis_matches: compatible_axis.length, product_exacts: exact_entities.length, require_specific };
return out;
