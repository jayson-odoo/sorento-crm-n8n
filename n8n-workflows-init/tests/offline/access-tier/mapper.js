// ── access-tier compat mapper ────────────────────────────────────────────────────────────
// Bridges TODAY's compound entitlement names ("Sorento Dealer", "End User") to the target
// brand × tier model (plans/access-tier-ask-plan.md §3) until the CRM ships additive
// `brands[]` / `tiers[]` fields — then this whole file is DEAD CODE and must be deleted.
//
// These exact bytes embed into the spine (get-results input lane). Keep dependency-free.
// Fixtures: real entitlement from live execs 12031183 / 12024557 / 12020037 — every sampled
// contact holds ALL SEVEN names, so the multi-tier ask path is the modal case, not an edge.

const BRANDS = ['sorento', 'cabana', 'mocha'];
const TIER_WORDS = { dealer: 'dealer', office: 'office', 'end user': 'end_user' };

// "Sorento Dealer" -> {brand:'sorento', tier:'dealer'} · "End User" -> {brand:null, tier:'end_user'}
// Unknown name -> null (NEVER guessed: an unrecognised level is excluded from the split model and
// reported via `unknown`, but the caller keeps it in the legacy passthrough — fail-open, LESSONS
// C1 class: no silent invention).
function parseLevel(name) {
  const s = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'end user' || s === 'enduser' || s === 'end-user') return { brand: null, tier: 'end_user' };
  const m = s.match(/^(sorento|cabana|mocha) (dealer|office)$/);
  return m ? { brand: m[1], tier: m[2] } : null;
}

// entitlement names[] -> { brands[], tiers[], unknown[] }  (order: BRANDS order / dealer,office,end_user)
function mapEntitlement(names) {
  const brands = new Set(), tiers = new Set(), unknown = [];
  for (const n of (Array.isArray(names) ? names : [])) {
    const p = parseLevel(n);
    if (!p) { if (String(n ?? '').trim()) unknown.push(String(n)); continue; }
    if (p.brand) brands.add(p.brand);
    tiers.add(p.tier);
  }
  const TIER_ORDER = ['dealer', 'office', 'end_user'];
  return {
    brands: BRANDS.filter(b => brands.has(b)),
    tiers: TIER_ORDER.filter(t => tiers.has(t)),
    unknown,
  };
}

// Recompose the compound access_levels the CRM understands TODAY from (chosen tiers ×
// query brand ∩ entitlement). Selects from the contact's OWN entitled names — never
// string-builds a compound — so casing/spelling can't drift from what the CRM stores.
//   tiers:       tiers the customer chose/stated (['dealer'] / ['dealer','office'] / ...)
//   queryBrands: brands named in the query ([] = no brand filter -> all entitled brands)
//   entitled:    the raw Aggregate name[] for this contact
// Returns { access_levels: [...], brand_gate_empty: bool }
//   brand_gate_empty=true ⇒ the customer named brand(s) they hold NO entitlement for —
//   caller renders the Q23-style notice instead of silently widening.
function recompose(tiers, queryBrands, entitled) {
  const want = new Set((Array.isArray(tiers) ? tiers : []).map(t => String(t ?? '').trim().toLowerCase()));
  const qb = (Array.isArray(queryBrands) ? queryBrands : [])
    .map(b => String(b ?? '').trim().toLowerCase()).filter(b => BRANDS.includes(b));
  const ent = Array.isArray(entitled) ? entitled : [];
  const entMap = mapEntitlement(ent);
  const brandGateEmpty = qb.length > 0 && !qb.some(b => entMap.brands.includes(b));
  // brand_gate_empty ⇒ allow NOTHING (probe R5): falling back to the full entitlement here would
  // silently answer a Cabana ask with Sorento files — the exact widen the flag exists to stop.
  const allowBrands = qb.length
    ? (brandGateEmpty ? [] : qb.filter(b => entMap.brands.includes(b)))
    : entMap.brands;
  const out = [];
  for (const n of ent) {
    const p = parseLevel(n);
    if (!p || !want.has(p.tier)) continue;
    // end_user is brandless TODAY: include it whenever its tier was chosen. When the CRM's
    // brand-scoping decision for end_user lands (contract §3 item 3), this branch follows it.
    if (p.brand && !allowBrands.includes(p.brand)) continue;
    if (!out.includes(n)) out.push(n);
  }
  return { access_levels: out, brand_gate_empty: brandGateEmpty };
}

// ── tier derivation from the customer's words (parser-side helper) ──────────────────────
// STATED tier detection only — a tier word anywhere in the message or an access-ish entity.
// Deliberately narrow: "dealer" / "office" / "end user" (+ ms/typo variants measured in real
// traffic). NOT fuzzy — an unmatched word means "not stated" and the ask fires, which is the
// safe direction (an extra ask beats a silently wrong tier).
function statedTiers(message, entities) {
  const found = new Set();
  const txt = ' ' + String(message ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (/ (dealer|dealers|pengedar) /.test(txt)) found.add('dealer');
  if (/ (office|ofis) /.test(txt)) found.add('office');
  if (/ end ?users? |ke pengguna? | enduser /.test(txt)) found.add('end_user');
  for (const e of (Array.isArray(entities) ? entities : [])) {
    const p = parseLevel(e && (e.canonical_code || e.raw));
    if (p) found.add(p.tier);
    else {
      const s = String((e && (e.canonical_code || e.raw)) ?? '').trim().toLowerCase();
      if (TIER_WORDS[s]) found.add(TIER_WORDS[s]);
    }
  }
  return ['dealer', 'office', 'end_user'].filter(t => found.has(t));
}

// Ask-trigger (plan D2): promotion query AND nothing stated AND >1 distinct entitled tier.
function needsTierAsk(domain, stated, entitledTiers) {
  if (domain !== 'promotion') return false;
  if (Array.isArray(stated) && stated.length > 0) return false;
  return (Array.isArray(entitledTiers) ? entitledTiers : []).length > 1;
}

module.exports = { parseLevel, mapEntitlement, recompose, statedTiers, needsTierAsk, BRANDS };
