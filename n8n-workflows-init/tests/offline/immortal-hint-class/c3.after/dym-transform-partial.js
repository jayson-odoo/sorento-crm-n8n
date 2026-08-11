// ── dym-transform (dym-probe-before-offer) ─────────────────────────────────────
// PURE planner for the "did you mean … — has/no <thing>" probe. Sits between
// sibling-gate[1] and build-suggest-offer. It mirrors build-suggest-offer's D1
// candidate selection EXACTLY (missResolutions + tokenCandidates + humanLabel
// survivors) and then decides whether a has-it probe is worth running.
//
// PASSTHROUGH IS LOAD-BEARING. dym-gate's FALSE branch feeds build-suggest-offer
// directly, and build-suggest-offer starts from `{...$input.first().json}` and
// expects the not-found payload (escalate_message / is_clarification /
// found_summary). So this node spreads its input and APPENDS its control keys;
// build-suggest-offer strips them again (_DYM_CTRL_KEYS) so the un-annotated
// output object stays byte-identical to today.
//
// Emits EXACTLY ONE item so dym-probe batches in a single sub-call.
// Never throws: every $('x') read is wrapped.
const _pass = (() => { try { return $input.first().json ?? {}; } catch (e) { return {}; } })();
const q     = (() => { try { return $('Call \'sub-query-reformulator\'').first().json.output ?? {}; } catch (e) { return {}; } })();
const r     = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
const gate  = (() => { try { return $('disallowed-entity-gate').first().json ?? {}; } catch (e) { return {}; } })();

// ── The ONLY place a domain is enabled. A third domain is one entry, not four nodes.
//   predicate/requires are declared PER DOMAIN on purpose: the shipped incoming
//   picker's "a row exists ⇒ it has the thing" rule does NOT generalize
//   (crm_inventory_stock_balance_list returns genuine-zero rows, one per warehouse).
const DOMAIN_PROBE = {
  product_attachment: {
    tool:      'crm_master_product_attachments_list',  // NOT crm_resource_attachments_list (no product_ids, filename titles)
    noun:      null,                                   // resolved at render time by attachmentNoun()
    predicate: 'row_present_with_type',
    requires:  ['attachment_type', 'certificate'],     // ≥1 UUID-shaped scoping entity or we do not probe
    // ── C3 mitigation (i): PROBE CAP. Multi-token carries up to 5 tokens x cap3 = 15 candidates in
    // ONE call. No `limit` is ever sent (TOOL_DEFAULT_QUERY_PARAMS has no entry for either probe
    // tool and entity-ids-transformer emits none), so the backend default applies:
    // `app/schemas/common.py:37  limit: int = 50`. Truncation is STRUCTURALLY UNDETECTABLE — the
    // render envelope (presenters.py:806-818 + _PASSTHROUGH_KEYS) carries no total/pagination, and
    // output-structurer.js forwards only nine keys and would drop it anyway. A candidate whose rows
    // fell off page 1 returns zero rows and renders a CONFIDENT `- no certificate` about a product
    // that has one — the exact class this feature exists to remove.
    // Overflow renders BARE (absent from dym_candidate_codes ⇒ absent from _dymProbed ⇒ no suffix),
    // so the cap can only ever withhold an annotation, never invent one.
    // ✅ MEASURED (tester pass 2, exec 11646010): ~0.8-1.3 rows/candidate, because the probe is
    // additionally scoped by attachment_type_ids. 8 candidates ⇒ ~10 of the 50-row budget, so this
    // is safe with a large margin and is CONFIRMED at 8. Contrast `inventory` below, where the
    // measured grain was 3x worse than estimated — do not generalise between the two domains.
    probe_cap: 8,
  },
  inventory: {
    tool:      'crm_inventory_stock_balance_list',
    noun:      'stock details',
    predicate: 'qty_gt_zero',                          // row presence is NOT has-stock.
    //   LABEL vs PREDICATE — SETTLED 2026-08-07, do not "fix" either side.
    //   Predicate = summed `Quantity On Hand` > 0, VERIFIED LIVE (UAC §DP-14 closed, exec
    //   11512474: SRTWC8318-RL-BL1 has one stock row at qty 0 and renders `- no stock
    //   details`; a row-presence predicate would have said "has"). The label deliberately
    //   says "stock details" anyway: shown that exact 0-on-hand case, the user chose NOT to
    //   surface the row-exists / qty-zero / no-row distinction to customers. The label
    //   describes what the customer can ACT ON (is there stock I can have), not what the
    //   database contains. Deliberate, informed simplification — not an oversight.
    requires:  [],
    // ── C3 mitigation (i), and this is the WORST case by a wide margin.
    // ✅ MEASURED, not derived (tester pass 2, exec 11646010): a SINGLE stocked candidate returned
    // 13 rows. 🔴 THE GRAIN IS warehouse × SYSTEM-LOCATION, not warehouse — the original estimate
    // assumed one row per active warehouse and was wrong by ~3x. At 13 rows/candidate the backend
    // default (`app/schemas/common.py:37  limit: int = 50`) admits 3 candidates, not 5: 5 x 13 = 65
    // would saturate every time.
    // Saturation is fail-CLOSED (zero annotation, never a false label), but a cap that always
    // saturates makes the feature silently VANISH on exactly the multi-token inventory turns it
    // exists for — the shape the user reported. So 3 is a correctness value, not a tuning value.
    // ⚠️ DO NOT RAISE without re-measuring the row grain first.
    probe_cap: 3,
  },
};

// entity_type values sub-get-results' entity-ids-transformer can turn into a
// narrowing *_ids filter. An entity it cannot map contributes NO narrowing, and
// crm_inventory_stock_balance_list documents "ALL FILTERS OPTIONAL — call with
// none to span every product", so an unmappable-only entity set would trigger a
// full-table read AND label every candidate "has stock". Unmappable ⇒ not probed.
const MAPPABLE = new Set(['product', 'promotion', 'order', 'customer_order', 'order_number',
  'customer', 'transporter', 'form', 'shipment', 'inbound_shipment',
  'attachment_type', 'attachment', 'certificate']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid  = (s) => UUID_RE.test(String(s || ''));
const norm    = (s) => String(s ?? '').trim().toLowerCase();
const cap3    = (a) => (Array.isArray(a) ? a.slice(0, 3) : []);
const isExact = (m) => String(m?.match_tier || '').toLowerCase() === 'exact';

// ── verbatim from build-suggest-offer: humanLabel / tokenCandidates / missResolutions ──
const humanLabel = (m) => {
  const c = m && m.canonical_code;
  if (c && !isUuid(c)) return String(c);
  const d = (m && m.display) || {};
  return d.description || d.product_name || d.name || null;
};

const allowedTypes = Array.isArray(gate?.gate_debug?.allowed_lookup) ? gate.gate_debug.allowed_lookup : null;
const unresolved   = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
const isClar       = _pass.is_clarification === true;
const requireSpec  = gate?.require_specific === true;

function tokenCandidates(res) {
  const acc = [];
  if (Array.isArray(res?.matches)) acc.push(...res.matches);
  if (Array.isArray(res?.alternatives)) acc.push(...res.alternatives);
  const seen = new Set(); const keep = [];
  for (const m of acc) {
    const code = m && m.canonical_code;
    if (!code) continue;
    if (isExact(m)) continue;
    if (allowedTypes && m.entity_type && !allowedTypes.includes(m.entity_type)) continue;
    if (seen.has(code)) continue;
    seen.add(code); keep.push(m);
  }
  return keep;
}

// ── F-DUPE: PRE-DEDUP uuid census, deliberately a SEPARATE pass ────────────────
// `product_code` is unique PER COMPANY (`app/models/product.py:182`
// `uq_products_company_product_code`), so one code under two uuids is TWO COMPANIES'
// products — not a data-entry duplicate. tokenCandidates() dedups by code and throws
// that evidence away, after which arrival order silently decides which company the
// rendered line represents. Both probe tools are company-scoped, so the twin returns
// zero rows and the line would read "— no <noun>": a true statement about someone
// else's product, printed where the customer reads their own.
//
// This walks the SAME accumulator with the SAME pre-dedup filters and returns
// code -> Set(uuid). It is a separate function ON PURPOSE: tokenCandidates() must stay
// byte-for-byte equivalent to build-suggest-offer's copy or `_survivors` diverges from
// what actually renders, which is the one thing this node may never get wrong. The
// duplicated acc-build is the price of not restructuring the load-bearing selection.
//
// isExact entries are counted (unlike in tokenCandidates): an exact-tier twin still
// proves the code is cross-company ambiguous. It cannot cause a false exclusion,
// because the same product resolved at two tiers carries the same uuid and the Set
// collapses it.
function uuidCensus(res) {
  const acc = [];
  if (Array.isArray(res?.matches)) acc.push(...res.matches);
  if (Array.isArray(res?.alternatives)) acc.push(...res.alternatives);
  const census = new Map();
  for (const m of acc) {
    const code = m && m.canonical_code;
    if (!code) continue;
    if (allowedTypes && m.entity_type && !allowedTypes.includes(m.entity_type)) continue;
    if (!isUuid(m.uuid)) continue;
    const k = norm(code);
    if (!census.has(k)) census.set(k, new Set());
    census.get(k).add(String(m.uuid));
  }
  return census;
}

let missResolutions = [];
if (Array.isArray(r?.resolutions)) {
  missResolutions = r.resolutions.filter(res => res && res.resolved !== true
    && !(Array.isArray(res.matches) && res.matches.some(isExact)));
} else if (unresolved.length) {
  missResolutions = [r];
}

let d1s = [];
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) {
      // _res is carried for the F-DUPE census only. build-suggest-offer's own copy of this
      // block does not have it and does not need it — nothing downstream of here reads it.
      d1s.push({ token: res.token || unresolved[0] || (q?.entities?.[0]?.raw) || 'that item', cands, _res: res });
    }
  }
  d1s = d1s.slice(0, 5);
}

const _survivors = d1s
  .map(block => ({ block, picks: cap3(block.cands).map(m => ({ m, label: humanLabel(m) })).filter(p => p.label) }))
  .filter(s => s.picks.length);

// ── lanes ────────────────────────────────────────────────────────────────────
// ONE body is deployed to every lane, so the lane is DETECTED, never configured.
// `central-exchange` is the direct upstream of dym-transform-partial and belongs to the
// results arm of If6; the not-found and picker lanes come off the other arm, so the two
// are provably disjoint (confirmed in runData: on a partial turn neither Aggregate1 nor
// dym-transform appears). Fail-safe: if the probe throws we fall back to the CONSERVATIVE
// single-token limit, never the looser one.
const _isPartialLane = (() => { try { return $('central-exchange').isExecuted === true; } catch (e) { return false; } })();

// ── decide ────────────────────────────────────────────────────────────────────
const domain = (gate && gate.gate_debug && gate.gate_debug.domain) || q?.domain_hint || null;
const cfg    = DOMAIN_PROBE[domain] || null;

// PICKER lane — the require-specific numbered picker rendered by disallowed-entity-gate
// into gate_clarification and carried to the customer as not-found-error-message's
// escalate_message. Its candidates are NOT D1 survivors: they are the gate's own option
// set, already uuid-carrying and already filtered to the offered uuids
// (`compatible_entities = entities.filter(e => optUuids.has(e.uuid))`). D1 never fires on
// these turns (requireSpec suppresses it), which is why the surface was un-annotated.
const _pickerCands = (() => {
  if (!cfg) return null;
  if (gate?.require_specific !== true) return null;
  if (!String(gate?.gate_clarification ?? '').trim()) return null;
  const ce = Array.isArray(gate?.compatible_entities) ? gate.compatible_entities : [];
  return ce.length ? ce.map(e => ({ canonical_code: e.code, uuid: e.uuid, entity_type: e.entity_type })) : null;
})();

// F-DUPE census for the picker lane: same rule (code -> Set(uuid)), different source.
const _pickerCensus = () => {
  const c = new Map();
  for (const m of (_pickerCands || [])) {
    if (!m.canonical_code || !isUuid(m.uuid)) continue;
    const k = norm(m.canonical_code);
    if (!c.has(k)) c.set(k, new Set());
    c.get(k).add(String(m.uuid));
  }
  return c;
};

// F3 layer-1 scoping entity. On the picker lane compatible_entities is REPLACED by the
// option uuids, so the attachment_type/certificate uuid is not there — fall back to the
// resolver's own flatten. Additive: the other lanes still find it in compatible_entities
// first and are byte-unaffected.
const _scopingFrom = (reqs) => {
  const seen = new Set(); const out = [];
  const take = (e) => {
    const et = String(e?.entity_type ?? ''); const uu = e?.uuid;
    if (!reqs.includes(et) || !isUuid(uu) || seen.has(uu)) return;
    seen.add(uu); out.push({ uuid: uu, entity_type: et, code: (e.code ?? e.canonical_code) ?? null });
  };
  for (const e of (Array.isArray(gate?.compatible_entities) ? gate.compatible_entities : [])) take(e);
  if (out.length === 0) {
    const flat = [
      ...((r?.resolutions ?? []).flatMap(x => x.matches ?? [])),
      ...(Array.isArray(r?.intersection) ? r.intersection : []),
      ...Object.values(r?.by_entity_type ?? {}).flat(),
    ];
    for (const m of flat) take(m);
  }
  return out;
};

let probe_needed = false;
let probe_skip_reason = null;
let probe_tool = null, probe_noun = null, probe_predicate = null;
let dym_probe_entities = [];
let dym_candidate_codes = [];
let dym_excluded_codes = [];   // F-DUPE: rendered but deliberately NOT probed
let dym_capped_codes = [];     // C3 (i): over the domain's probe_cap ⇒ NOT probed ⇒ rendered BARE
let probe_cap_applied = false;
let probe_lane = 'd1';

// Candidate set + census, per lane.
let _picks = null, _census = null;
if (cfg) {
  if (_pickerCands) {
    probe_lane = 'picker';
    _picks = _pickerCands.map(m => ({ m }));
    _census = _pickerCensus();
  } else if (_survivors.length >= 1) {
    // ── C3 (immortal-hint-class) — MULTI-TOKEN IS NOW ALLOWED ON THE D1 LANE TOO ───────────────
    // The exclusion existed because D1 assigns a GLOBAL CONTIGUOUS idx across token sub-lists and
    // has-first sorting would renumber across blocks. The objection was to the SORT, never to the
    // SUFFIX: C3 annotates the rendered line WITHOUT re-sorting, so the renumbering hazard does not
    // exist and the exclusion dissolves. Same posture as the partial lane, which has shipped
    // multi-token since rev 4.
    //
    // It also stopped being a rare edge case. One stuck session entity makes EVERY turn carry ≥2
    // missed tokens, so every turn takes this path and the annotation becomes permanently
    // unreachable — six consecutive live turns did exactly that.
    //
    // `probe_skip_reason: 'multi_token'` is now unreachable on both lanes. The LITERAL IS RETAINED
    // DELIBERATELY (below) so a runData search for it distinguishes "never fired" from "constant
    // removed" — §IH-11 clause 5 asserts its absence.
    const _blocks = _survivors;
    if (_blocks) {
      probe_lane = _isPartialLane ? 'partial' : 'd1';
      _picks = _blocks.flatMap(s => s.picks);
      _census = new Map();
      for (const s of _blocks) {
        for (const [k, set] of uuidCensus(s.block._res)) {
          if (!_census.has(k)) _census.set(k, new Set());
          for (const u of set) _census.get(k).add(u);
        }
      }
    }
  }
}

if (!cfg) {
  probe_skip_reason = 'domain_not_enabled';
} else if (!_picks) {
  probe_skip_reason = _survivors.length > 1 ? 'multi_token' : 'no_d1_candidates';
} else if (_picks.length === 0) {
  probe_skip_reason = 'no_d1_candidates';
} else {
  const cands = [];
  const seen = new Set();
  let droppedOther = 0;
  for (const p of _picks) {
    const m = p.m || {};
    const code = m.canonical_code;
    const et = m.entity_type || 'product';
    if (!code) continue;
    const k = norm(code);
    // F-DUPE. More than one uuid behind this code ⇒ more than one company's product.
    // We cannot tell which one the customer means, and the probe answers carry no
    // product id (presenters.py emits code/name/type/file fields, never the uuid), so
    // the annotation could not be attributed back even if we unioned the uuids — while
    // the PICK resolves to exactly one uuid (output_exchange applyDymPick reads a single
    // dym_candidates entry). Union would therefore promise "has" and then dead-end on
    // the empty twin. Excluding the code is the only truthful option: it renders BARE
    // (every renderer suffixes nothing for a code absent from _dymProbed) while its
    // unambiguous siblings are still labelled.
    const uu = _census.get(k);
    if (uu && uu.size > 1) {
      if (!dym_excluded_codes.some(x => norm(x.code) === k)) {
        dym_excluded_codes.push({ code: String(code), reason: 'multi_uuid_code', uuid_count: uu.size });
      }
      continue;
    }
    if (!isUuid(m.uuid)) { droppedOther += 1; continue; }   // unresolvable → cannot narrow the probe
    if (!MAPPABLE.has(String(et))) { droppedOther += 1; continue; } // no *_ids filter → would unscope the read
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push({ uuid: m.uuid, entity_type: String(et), code: String(code) });
    dym_candidate_codes.push(String(code));        // == what is actually probed
  }

  // ── C3 mitigation (i): apply the cap. `cands` and `dym_candidate_codes` are built in the same
  // loop under the same condition, so they are parallel arrays and a matched truncation is exact.
  // FAIL-OPEN by construction: a missing / non-positive / non-numeric probe_cap disables the cap
  // entirely rather than dropping candidates.
  const _cap = Number(cfg.probe_cap);
  if (Number.isFinite(_cap) && _cap > 0 && cands.length > _cap) {
    dym_capped_codes = cands.slice(_cap).map(c => c.code);
    cands.length = _cap;
    dym_candidate_codes = dym_candidate_codes.slice(0, _cap);
    probe_cap_applied = true;
  }

  if (cands.length === 0) {
    // HARD GATE. An empty product_ids makes crm_inventory_stock_balance_list return
    // every product x every active warehouse → huge prod read + 100% false positives.
    // Name the F-DUPE exclusion when it is the sole cause, so runData distinguishes
    // "nothing resolvable" from "everything ambiguous".
    probe_skip_reason = (dym_excluded_codes.length > 0 && droppedOther === 0)
      ? 'multi_uuid_code'
      : 'no_candidate_uuid';
    dym_candidate_codes = [];
  } else {
    let scoping = [];
    if (Array.isArray(cfg.requires) && cfg.requires.length) {
      scoping = _scopingFrom(cfg.requires);
      if (scoping.length === 0) {
        // The gate can pass on a raw parser HINT with no uuid. Probing without an
        // attachment_type filter returns every attachment of every type → a
        // brochure-only product would be labelled "has certificate". Fail closed.
        probe_skip_reason = 'no_scoping_entity';
        dym_candidate_codes = [];
      }
    }
    if (!probe_skip_reason) {
      probe_needed    = true;
      probe_tool      = cfg.tool;
      probe_noun      = cfg.noun;
      probe_predicate = cfg.predicate;
      dym_probe_entities = [...cands, ...scoping];
    }
  }
}

return [{
  json: {
    ..._pass,
    dym_probe_entities,
    dym_candidate_codes,
    dym_excluded_codes,
    dym_capped_codes,
    probe_cap_applied,
    probe_tool,
    probe_noun,
    probe_predicate,
    probe_needed,
    probe_skip_reason,
    probe_lane,
    // Sentinel. dym-probe runs onError:continueRegularOutput, so a failed sub-call
    // emits THIS item unchanged. dym-annotate keys on the sentinel to tell
    // "probe failed" apart from a real (possibly empty) probe envelope — the
    // not-found payload we pass through can itself carry an `answers` key.
    _dym_probe_input: true,
  },
}];
