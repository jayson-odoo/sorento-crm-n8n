// ── #3 dym-zerostock-itemize: name resolved products that returned ZERO stock rows ──
// Customer-facing completeness note on an ANSWERED inventory/incoming turn. Runs AFTER the disclaimer
// IIFE and BEFORE the #2 partial-miss dym block, so the append order is: stock rows -> #3 line -> #2 block.
// Disjoint from #2 (Q5): #3 lists customer-REFERENCED empty products (TYPED-exact resolutions U DYM-PICKED);
// #2 lists UNRESOLVED tokens (missResolutions). Writes ONLY userResponse; byte-identical no-op when missing.length===0.
(() => {
  const dh = qf.domain_hint;
  if (dh !== 'inventory' && dh !== 'incoming') return;                 // Q4.4 domain gate
  if (qf.message_type !== 'business_query') return;                    // Q4.1
  if (manualResponse || isEscalateBranch) return;                      // Q4.2 / Q4.3
  if (!(Array.isArray(last_result_set) && last_result_set.length > 0)) return;  // Q4.5 has-rows
  if (typeof userResponse !== 'string' || userResponse.trim().length === 0) return;

  const norm = s => String(s).trim().toUpperCase();

  // returned set (Q2): distinct "Product Code" values across the answered items
  const resultObj = getResultObj();
  const items = Array.isArray(resultObj.answers) ? resultObj.answers
              : Array.isArray(resultObj.items)   ? resultObj.items : [];
  const returnedCodes = new Set();
  for (const it of items) {
    const f = ((it && it.fields) || []).find(x => String((x && x.label) || '').trim().toLowerCase() === 'product code');
    const v = f && f.value;
    if (v != null && String(v).trim() !== '' && String(v).trim() !== '—') returnedCodes.add(norm(v));
  }
  if (returnedCodes.size === 0) return;                                // Q4.5 can't attribute -> say nothing

  // requested set (REVISED §1'/§2'): customer-REFERENCED codes only (TYPED-exact U DYM-PICKED).
  // NOT sourced from compatible_entities: that flattened set drops match_tier and includes
  // resolver-expanded prefix siblings the customer never typed (they were named in error by the
  // old #3). TYPED-exact from resolve-entity.resolutions[] (mirrors disallowed-entity-gate OR-mode);
  // DYM-PICKED from get-session-vars dym_offer.picked + this turn's qf.dym_offer_pick_code.
  const _isProd = m => m && String(m.entity_type).toLowerCase() === 'product';
  const _rz = (() => { try { return $('resolve-entity').first().json || {}; } catch (e) { return {}; } })();

  // requested[] rows: { _n: norm(code), code: display, fam: Set<norm>, strict: bool }
  const requested = [];
  const _seen = new Set();
  const _add = (code, fam, strict) => {
    if (code == null || code === '') return;
    const n = norm(code); if (!n) return;
    if (_seen.has(n)) {                                                 // pick-strictness wins over typed-family
      if (strict) { const ex = requested.find(x => x._n === n); if (ex) { ex.fam = new Set([n]); ex.strict = true; } }
      return;
    }
    _seen.add(n);
    requested.push({ _n: n, code, fam: strict ? new Set([n]) : (fam || new Set([n])), strict: !!strict });
  };

  // (1) TYPED-exact from resolutions[] — keep exact-tier product code(s); else sole unambiguous
  //     product (R-ZS2 INCLUDE); else ambiguous multi-prefix -> add nothing (that is #2's job).
  const _or = Array.isArray(_rz.resolutions) ? _rz.resolutions : null;
  if (_or) {
    for (const r of _or) {
      const prods = ((r && r.matches) || []).filter(_isProd);
      if (!prods.length) continue;
      const fam = new Set(prods.map(m => norm(m.canonical_code)).filter(Boolean));   // resolver's own token family
      const exacts = prods.filter(m => m.match_tier === 'exact');
      if (exacts.length) { for (const m of exacts) if (m.canonical_code) _add(m.canonical_code, fam, false); }
      else if (prods.length === 1 && prods[0].canonical_code) _add(prods[0].canonical_code, fam, false);
    }
  } else {                                                             // AND-mode fallback (R-ZS3, strict per-code)
    const _tok = new Set((Array.isArray(_rz.tokens) ? _rz.tokens : []).map(norm));
    const _int = Array.isArray(_rz.intersection) ? _rz.intersection
               : (_rz.by_entity_type ? Object.values(_rz.by_entity_type).flat() : []);
    for (const m of _int) if (_isProd(m) && m.canonical_code && _tok.has(norm(m.canonical_code))) _add(m.canonical_code, null, false);
  }

  // (2) DYM-PICKED (strict) — prior cumulative picks + this turn's pick (independent of _dymOffer;
  //     #3 sits above the _dymOffer computation, so it derives picks directly from session + qf).
  const _pick = c => { if (c) _add(c, null, true); };
  try {
    const s = $('get-session-vars').first().json;
    const v = (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || null;
    const prev = (v && v.dym_offer && Array.isArray(v.dym_offer.picked)) ? v.dym_offer.picked : [];
    for (const c of prev) _pick(c);
  } catch (e) {}
  _pick(qf.dym_offer_pick_code);

  // missing (Q3' satisfaction) — REVISED: PREFIX-family for TYPED, STRICT for PICKED.
  // TYPED code X satisfied iff ANY returned Product Code equals OR starts with norm(X)
  //   (returnedCodes.some(rc => rc === X || rc.startsWith(X))) — X's SKU family has stock, so
  //   suppress. Works in BOTH resolver OR-mode and AND-mode (no reliance on the per-token family
  //   set, absent in AND-mode); aligns with the resolver's own ilike 'X%' expansion and only ever
  //   prefix-matches the customer's OWN typed code, never an un-typed parent -> cannot name a sibling
  //   the customer did not type (such siblings never enter requested[] to begin with).
  // PICKED code P satisfied iff returnedCodes has norm(P) EXACTLY (no prefix) — a picked SKU whose
  //   exact code is empty is still named even if a sibling has stock (§ZS-2). Q7 dedup handled above.
  const missing = [];
  for (const rq of requested) {
    let ok = false;
    if (rq.strict) {                                                    // PICKED -> strict exact
      ok = returnedCodes.has(rq._n);
    } else {                                                            // TYPED -> prefix family
      for (const rc of returnedCodes) if (rc === rq._n || rc.startsWith(rq._n)) { ok = true; break; }
    }
    if (!ok) missing.push(rq.code);
  }
  if (missing.length === 0) return;                                    // Q6 no-op

  const shown = missing.slice(0, 10);                                  // Q7 cap
  userResponse += `\n\nNo stock records found for: ${shown.join(', ')}.`;  // exact locked wording
})();
