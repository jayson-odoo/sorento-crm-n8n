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
        // mc-label-n8n follow-up: N exact hits that share ONE code (same product in several
        // companies) are NOT ambiguous — resolve every uuid; downstream labels per company.
        const _sameCode = (arr) => arr.length > 0 && new Set(arr.map(m => String(m.canonical_code || '').toLowerCase().trim())).size === 1;
        if (_sameCode(exacts)) {
          for (const m of exacts) exact_entities.push({ uuid: m.uuid, entity_type: m.entity_type, code: m.canonical_code });
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
out.gate_reason = gate_reason;
out.gate_clarification = gate_clarification;   // '' when nothing to ask
out.compatible_entities = compatible_entities;
out.gate_debug = { domain, allowed_lookup: ALLOWED[domain], entities_count: entities.length };
return out;

