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

if (resolver.fallback_match_mode && domain == "promotion") {
  gate_passed = false
  gate_reason = "Ambiguous result"
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
    `${domain} search needs to be more specific. Multiple matches found — please choose:\n${numbered}`;
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

const out = $input.first().json;
out.gate_passed = gate_passed;
out.require_specific = require_specific;
out.gate_reason = gate_reason;
out.gate_clarification = gate_clarification;   // '' when nothing to ask
out.compatible_entities = compatible_entities;
out.gate_debug = { domain, allowed_lookup: ALLOWED[domain], entities_count: entities.length };
return out;
