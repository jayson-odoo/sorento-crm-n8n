// 🔴 FRESH OBJECT LITERAL — LOAD-BEARING, DO NOT CHANGE TO A SPREAD OF $input.
// dym-transform-partial sits directly upstream on the results lane and APPENDS 14 harness
// control keys to the item this node receives (dym_probe_entities, dym_candidate_codes,
// dym_excluded_codes, dym_capped_codes, probe_cap_applied, probe_tool, probe_noun,
// probe_predicate, probe_needed, probe_skip_reason, probe_lane, _dym_probe_input, plus
// dym_available_codes / dym_probe_meta added downstream by dym-annotate-partial).
// This node needs no strip list ONLY because it builds its output from scratch and copies
// named fields across. (Count was stale at 10 through the dym-probe and C3 changes — reviewer
// F-STRIP. Keep it accurate: it is the evidence the invariant was re-checked.)
// Refactoring this to `{...$input.first().json}` would carry every one of those keys into
// crossdomain-compose, which feeds save-session-vars — the conversation-variables PUT sends
// `JSON.stringify($json)`, the WHOLE item — persisting harness keys into every real customer
// session. It would also be INVISIBLE on the clone, because save-session-vars is orphaned
// there. Gate: tests/offline/dym-probe-before-offer/parity.js (F-CCS-STRIP).
let output = {};
const qf = $('Call \'sub-query-reformulator\'').first().json.output;
const contact = $('sorento-sub-respond-findcontact-respond').first().json;
let response;
let includeResponse = true;
let isEscalateBranch = true;
let quickReply;
let manualResponse = false
// ── unified escalate catalog (replaces the 7-arm isExecuted ladder) ──
// One catalog Code node resolves response + behavior flags per branch_kind.
// Escalate branches converge on 'escalate-catalog'; the happy path stays central-exchange.
const _cat = (() => {
  try { return $('escalate-catalog').isExecuted ? $('escalate-catalog').first().json : null; }
  catch (e) { return null; }
})();
// Δ3: CS member-offer override — when build-cs-member-offer ran, its numbered-list message
// + member roster (cs_last_result_set) + selection_context take priority over the catalog.
const _mem = (() => {
  try { return $('build-cs-member-offer').isExecuted ? $('build-cs-member-offer').first().json : null; }
  catch (e) { return null; }
})();
// suggest-on-miss override (D1/D2) — highest priority. When build-suggest-offer built a
// suggestion offer (resolver "did you mean" candidates / data-miss alternatives), its
// message + quick_reply + candidate roster win over the catalog AND the member offer.
const _sug = (() => {
  try {
    const nf = $('build-suggest-offer').isExecuted ? $('build-suggest-offer').first().json : null;
    return (nf && nf.suggest_offer === true) ? nf : null;
  } catch (e) { return null; }
})();
// Ideation relay (ideate branch): highest-priority manual reply. build-ideate-reply
// carried the turn-endpoint's reply_text (+ link) and the ideation pointer.
const _ideate = (() => {
  try { return $('build-ideate-reply').isExecuted ? $('build-ideate-reply').first().json : null; }
  catch (e) { return null; }
})();
// Δ4: date-suggest AND CS member roster both present → show BOTH.
// Date suggestion keeps its quick-reply buttons; the member picker is appended as
// numbers/names. A numeric/name reply resolves to a member (selection_context =
// member_offer below); tapping a date re-queries; 'yes' → round-robin.
const _merge = !!(_sug && _mem);
if (_ideate) {
  response        = _ideate.response;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_merge) {
  // brand-company-routing: this arm rebuilds its own picker, so it must carry the SAME company labels
  // build-cs-member-offer wrote - otherwise a two-company roster reaches the customer here as a bare
  // list of names with no company at all. Multi-company is decided by the SAME signal
  // build-cs-member-offer used, i.e. companies QUERIED (routing_companies.length > 1) - so a company
  // whose roster came back empty is disclosed on this path too instead of silently vanishing.
  // Single-company output is unchanged.
  const _rows = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : [];
  const _memCos = new Set();
  for (const m of _rows) {
    const _ids = (m && Array.isArray(m.company_ids) && m.company_ids.length) ? m.company_ids : [(m && m.company_id) || null];
    for (const _id of _ids) _memCos.add(_id || null);
  }
  // captain 2026-08-24: was `!!_mem.cs_multi_note` (the multi-company NOTE build-cs-member-offer
  // exported). The note is gone - annoying, and false once the routing axis widened to search every
  // company a subject is IN: a subject sits in one company, the TURN spans two. The multi-company
  // signal itself is unchanged, just read off routing_companies directly instead of a field that
  // existed only to carry that sentence.
  const _multiCo = Array.isArray(_mem.routing_companies) && _mem.routing_companies.length > 1;
  const _lines = _rows.map(m => {
    const _lbl = (Array.isArray(m.companies) && m.companies.length) ? m.companies : (m.company_name ? [m.company_name] : []);
    return (_multiCo && _lbl.length) ? `${m.idx}. ${m.label} (${_lbl.join(' / ')})` : `${m.idx}. ${m.label}`;
  });
  if (_multiCo) {
    for (const p of (Array.isArray(_mem.routing_companies) ? _mem.routing_companies : [])) {
      if (p && p.company_name && !_memCos.has(p.company_id || null)) _lines.push(`[ ${p.company_name}: no customer-service members are configured — omitted. ]`);
    }
  }
  const _picker = _lines.join('\n');
  response = `${_sug.suggest_response}\n\nTo escalate, choose who to route to. Reply the number or name:\n${_picker}\n\nOr just reply 'yes' and we'll assign automatically.`;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_sug) {
  response        = _sug.suggest_response;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_mem) {
  response        = _mem.response;
  manualResponse  = _mem.manualResponse;
  includeResponse = _mem.includeResponse;
  isEscalateBranch = true;
} else if (_cat) {
  response        = _cat.response;
  manualResponse  = _cat.manualResponse;
  includeResponse = _cat.includeResponse;
  isEscalateBranch = true;
} else if ($('central-exchange').isExecuted) {
  response = $('central-exchange').first().json.response; isEscalateBranch = false;
}
if ($('access-level-choice-message').isExecuted) {
  quickReply = $('access-level-choice-message').first().json.quick_reply.length > 0 ? $('access-level-choice-message').first().json.quick_reply: null
}
// suggest-on-miss quick replies (codes/dates + Yes,escalate + No,it's okay), comma-joined
if (_sug) { quickReply = _sug.suggest_quick_reply; }

function getResultObj() {
  try { if ($('central-exchange').isExecuted) return $('central-exchange').first().json; } catch (e) {}
  try { if ($('validator').isExecuted)        return $('validator').first().json; }        catch (e) {}
  try { if ($('disallowed-entity-gate').isExecuted)        return $('disallowed-entity-gate').first().json; }        catch (e) {}
  return $input.first().json || {};
}

let userResponse;
if (includeResponse) {
  userResponse = response;
} // escalate/clarification → short, pass through as-is
let last_result_set = [];

if (true) {
  const resultObj = getResultObj();

  // envelope shape: items[]; tolerate legacy answers[] and gate compatible_entities[]
  let items = Array.isArray(resultObj.items) ? resultObj.items
              : Array.isArray(resultObj.answers) ? resultObj.answers
              : Array.isArray(resultObj.compatible_entities) ? resultObj.compatible_entities
              : [];
  const domain = qf.domain_hint || 'result';
  const offeredEscalation = /would you like me to escalate/i.test(userResponse);
  if (resultObj.require_specific === true && Array.isArray(resultObj.compatible_entities)) {
    items = items.filter(e => String(e.entity_type).toLowerCase() === 'product');
  }
  if (qf.message_type == "business_query" && !manualResponse) {
    if (items.length === 0 ) {
      response = `Previous turn (${domain}): no results.`;
    } else {
      const fieldVal = (it, labelWanted) => {
        const f = (it.fields || []).find(x =>
          String(x.label || '').toLowerCase() === labelWanted.toLowerCase());
        return f ? f.value : null;
      };

      const indexed = items.map((it, i) => {
        const firstField = (it.fields || [])[0];
        // label priority covers BOTH shapes:
        //   envelope item → title / fields
        //   compatible_entity → code / canonical_code / product_name
        const label =
          it.title ||
          it.code ||                              // ← gate compatible_entities
          it.canonical_code ||                    // ← raw resolver match, if used
          it.display?.product_name ||             // ← raw resolver match
          fieldVal(it, 'Form Name') ||
          fieldVal(it, 'Promotion Name') ||
          fieldVal(it, 'Product') ||
          (firstField ? firstField.value : null) ||
          `item ${i + 1}`;

        return {
          idx: i + 1,
          uuid: it.uuid || it.id || null,
          label: String(label).replace(/\*/g, '').trim(),
          entity_type: it.entity_type || null,
          product: fieldVal(it, 'Product') || it.product || it.code || null,
          attachment_type: it.attachmentType || it.attachment_type || null,
          filename: it.filename || null,
        };
      });

      const what = indexed[0].attachment_type || 'records';
      response = `Previous turn (${domain}): returned ${items.length} ${what}`;
      last_result_set = indexed;
    }
  }
}

// ── reconcile parser hints with resolver's authoritative entity_type ──
// The resolver checked against real data; its entity_type wins over the parser's hint.
function reconcileEntities(parserEntities, resolverJson) {
  if (!Array.isArray(parserEntities)) return parserEntities || [];

  const resolutions  = Array.isArray(resolverJson?.resolutions)  ? resolverJson.resolutions  : [];
  const intersection = Array.isArray(resolverJson?.intersection) ? resolverJson.intersection : [];

  // normalize: a lookup from a raw value → resolved match
  // OR-mode: match pe.raw to the resolution token, take its first match
  // AND-mode: match pe.raw to a match's canonical_code / product_name
  const norm = s => String(s || '').toLowerCase().trim();

  return parserEntities.map(pe => {
    const raw = norm(pe.raw);
    let match = null;

    // OR-mode: by token
    const res = resolutions.find(r => norm(r.token || r.query) === raw);
    if (res?.matches?.length) match = res.matches[0];

    // AND-mode (or OR-mode that didn't token-match): by the record's own value
    if (!match && intersection.length) {
      match = intersection.find(m =>
        norm(m.canonical_code) === raw ||
        norm(m.display?.product_name) === raw
      ) || null;
    }

    if (match?.entity_type) {
      return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code };
    }
    return pe;   // unresolved → keep parser's guess
  });
}

const resolverJson = (() => {
  try { return $('resolve-entity').first().json; } catch (e) { return {}; }
})();
const reconciledEntities = reconcileEntities(qf.entities, resolverJson);

// Δ3: member-offer roster becomes the persisted last_result_set so a round-2 position pick
// resolves to a member; selection_context flags the next turn as a member-pick context.
if (_merge) { last_result_set = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : []; }
else if (_sug) { last_result_set = Array.isArray(_sug.suggest_last_result_set) ? _sug.suggest_last_result_set : []; }
else if (_mem) { last_result_set = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : []; }
const _isDisambig = (() => { try { const r = getResultObj(); return !!(r && r.require_specific === true && Array.isArray(r.compatible_entities) && r.compatible_entities.length > 0); } catch (e) { return false; } })();
// promotion-picker S4: promo-picker builds its own roster, and the parser's ALL handler is
// gated on selection_context === 'suggest_offer', so without an arm here "all" over a
// promotion list silently does nothing (measured). LOWEST precedence on purpose — member,
// suggest and cs rosters must still win a stray "2" (UAC §PP-8).
const _promo = (() => {
  try { const n = $('promo-picker');
        if (!n.isExecuted) return null;
        const j = n.first().json;
        return (Array.isArray(j.suggest_last_result_set) && j.suggest_last_result_set.length) ? j : null;
  } catch (e) { return null; }
})();
if (!_merge && !_sug && !_mem && _promo) { last_result_set = _promo.suggest_last_result_set; }
// tier-ask (access-tier-ask-plan §4): the ask turn persists the TIER roster so the parser
// fork's tier_offer reconciliation resolves "2" / "1 and 2" / "all" to TIER TOKENS next
// turn. LOWEST precedence by construction: member/suggest/cs/promo rosters must all win a
// stray number (TA-14) — and the ask turn cannot co-occur with any of them anyway (If4
// FALSE bypasses resolve-entity/get-results entirely). D4: the tier itself is NEVER
// persisted — only the offer roster is, and only for this one round-trip.
const _tier = (() => {
  try { const n = $('access-level-choice-message');
        if (!n.isExecuted) return null;
        const t = n.first().json;
        return (t && t.tier_offer === true && Array.isArray(t.tier_last_result_set) && t.tier_last_result_set.length) ? t : null;
  } catch (e) { return null; }
})();
if (!_merge && !_sug && !_mem && !_promo && _tier) { last_result_set = _tier.tier_last_result_set; }
const selection_context = _merge ? 'member_offer' : (_sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : (_promo ? 'suggest_offer' : (_tier ? 'tier_offer' : (_isDisambig ? 'disambiguation' : null)))));

// ── friendly domain disclaimers (append to user-facing text on the happy path only) ──
// master_products answered → nudge toward the catalogue for attributes not shown.
// resource_attachment catalogue answered → tip to search by product code for attributes.
(() => {
  const dh = qf.domain_hint;
  const answered = !isEscalateBranch
    && includeResponse
    && typeof userResponse === 'string'
    && userResponse.trim().length > 0
    && Array.isArray(last_result_set)
    && last_result_set.length > 0;
  if (!answered) return;
  if (dh === 'master_products') {
    userResponse += "\n\nP/S: if the spec you're after isn't shown above, just ask me for the *product catalogue* and I'll pull it up for you 😊";
  } else if (dh === 'resource_attachment') {
    const ents = Array.isArray(reconciledEntities) ? reconciledEntities : (qf.entities || []);
    const wantsCatalogue = ents.some(e => /catalog|katalog/i.test(String((e && e.raw) || '')));
    if (wantsCatalogue) {
      userResponse += "\n\nTip: looking for a specific detail like material or finish? Search the *product code* inside the catalogue and you'll find all its attributes there 👍";
    }
  }
})();

// ── #3 dym-zerostock-itemize: name resolved products that returned ZERO stock rows ──
// Customer-facing completeness note on an ANSWERED inventory/incoming turn. Runs AFTER the disclaimer
// IIFE and BEFORE the #2 partial-miss dym block, so the append order is: stock rows -> #3 line -> #2 block.
// Disjoint from #2 (Q5): #3 lists customer-REFERENCED empty products (TYPED-exact resolutions U DYM-PICKED);
// #2 lists UNRESOLVED tokens (missResolutions). Writes ONLY userResponse; byte-identical no-op when missing.length===0.
//
// ── HOISTED 2026-08-03 (cross-domain-stock-incoming, Q13/H1: single source of truth) ──
// The requested[] / returnedCodes / missing[] computation that used to live inline HERE now lives in
// `crossdomain-zeroset` (upstream of If6), shared with the cross-domain feature. Guards, the 10-item cap
// and the exact wording below are UNCHANGED — this is a pure refactor with zero observable change, proven
// by the shadow gate BEFORE the inline copy was deleted. The deleted code is preserved verbatim in
// tests/diffs/zerostock-inline-computation-preserved.js for rollback.
// Reachability: #3 only speaks on an answered turn, which by construction ran get-results -> validator,
// and crossdomain-zeroset sits on that edge — so it has always executed by the time this runs.
(() => {
  const dh = qf.domain_hint;
  if (dh !== 'inventory' && dh !== 'incoming') return;                 // Q4.4 domain gate
  if (qf.message_type !== 'business_query') return;                    // Q4.1
  if (manualResponse || isEscalateBranch) return;                      // Q4.2 / Q4.3
  if (!(Array.isArray(last_result_set) && last_result_set.length > 0)) return;  // Q4.5 has-rows
  if (typeof userResponse !== 'string' || userResponse.trim().length === 0) return;

  const zsNode = $('crossdomain-zeroset');
  if (!zsNode.isExecuted) return;                                      // defensive: degrade silently, never throw
  const zs = (zsNode.first().json || {})._xd || {};

  const returnedCodes = Array.isArray(zs.returned_codes) ? zs.returned_codes : [];
  if (returnedCodes.length === 0) return;                              // Q4.5 can't attribute -> say nothing
  const missing = (Array.isArray(zs.missing) ? zs.missing : []).map(m => m && m.code).filter(Boolean);
  if (missing.length === 0) return;                                    // Q6 no-op

  const shown = missing.slice(0, 10);                                  // Q7 cap
  // DOMAIN-AWARE NOUN (2026-08-03, user-reported): this line fires on BOTH inventory and incoming turns,
  // but was hardcoded to "stock records". On an ETA turn it means "no INCOMING records" while literally
  // saying "stock" — and it now sits one line above a block that reports real on-hand stock, so the two
  // sentences contradicted each other. The inventory wording is unchanged (still the locked string).
  const _noun = (dh === 'incoming') ? 'incoming' : 'stock';
  userResponse += `\n\nNo ${_noun} records found for: ${shown.join(', ')}.`;
})();

// ── dym-partial-disambiguation v3 §2.1: surface genuine-miss tokens on the ANSWERED happy path ──
// When SOME tokens resolved (stock answered) and OTHERS are genuine misses, the misses vanish today
// (build-suggest-offer is downstream of not-found and never runs on the If3-proceeds path). This block
// reuses build-suggest-offer's D1 detection to (a) APPEND a numbered "did you mean" block to
// userResponse, (b) persist a SEPARATE dym_last_result_set (idx 1..M) WITHOUT touching last_result_set
// or selection_context (the stock positional-pick affordance is preserved — the HALT lesson), (c) feed
// a dym offer into the _newOffer slot so it SURVIVES the _answered kill (rule 1 beats rule 5), and
// (d) append the SINGLE parser-visible marker to `response`. v3 removes the v2 [results numbered] second
// bracket and the AMBIGUOUS->CLARIFY branch entirely. No genuine miss -> pure no-op -> byte-identical.
let _dymLastResultSet = null;   // NEW dym set (idx 1..M); stays null on every no-dym turn (key omitted)
let _partialOffer = null;       // feeds the _newOffer slot so the offer survives the answered turn
(() => {
  const _answered = !isEscalateBranch
    && includeResponse
    && typeof userResponse === 'string'
    && userResponse.trim().length > 0
    && Array.isArray(last_result_set)
    && last_result_set.length > 0
    && qf.message_type === 'business_query'
    && !manualResponse;
  if (!_answered) return;

  const r    = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
  const gate = (() => { try { return $('disallowed-entity-gate').first().json ?? {}; } catch (e) { return {}; } })();

  // Guard exactly as build-suggest-offer (defensive parity — both false on a true happy answer).
  const isClar = (() => { try { return getResultObj().is_clarification === true; } catch (e) { return false; } })();
  if (isClar || gate.require_specific === true) return;

  // ── D1 detection (ported from build-suggest-offer) ──
  const cap3 = (a) => (Array.isArray(a) ? a.slice(0, 3) : []);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (s) => UUID_RE.test(String(s || ''));
  const humanLabel = (m) => {
    const c = m && m.canonical_code;
    if (c && !isUuid(c)) return String(c);
    const d = (m && m.display) || {};
    return d.description || d.product_name || d.name || null;
  };
  const isExact = (m) => String(m?.match_tier || '').toLowerCase() === 'exact';
  const allowedTypes = Array.isArray(gate?.gate_debug?.allowed_lookup) ? gate.gate_debug.allowed_lookup : null;
  const _mkOffer = (cands) => (Array.isArray(cands) && cands.length)
    ? { id: String($execution.id), domain: (qf && qf.domain_hint) || null, ttl: 3, candidates: cands, picked: [] }
    : null;
  function tokenCandidates(res) {
    const acc = [];
    if (Array.isArray(res?.matches)) acc.push(...res.matches);
    if (Array.isArray(res?.alternatives)) acc.push(...res.alternatives);
    const seen = new Set(); const keep = [];
    for (const m of acc) {
      const code = m && m.canonical_code;
      if (!code) continue;
      if (isExact(m)) continue;                                                  // exact would have resolved
      if (allowedTypes && m.entity_type && !allowedTypes.includes(m.entity_type)) continue;
      if (seen.has(code)) continue;
      seen.add(code); keep.push(m);
    }
    return keep;
  }

  // Genuine-miss tokens (their OWN resolution, no exact match). Excludes the resolved answer token.
  const unresolved = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
  // ── honour the gate's document-class narrowing (container-status S1) ────────────────
  // `r` is the RAW resolver node, so a token the GATE resolved still looks unresolved here.
  // This is the FOURTH surface that builds a did-you-mean from `resolutions`, and the one the
  // customer actually saw: "container status list" returned the right file AND "Couldn't find
  // these: ... did you mean Packing List, Stock_List, container_status" underneath it.
  // Narrow by construction: only tokens stamped `resolved_by === 'document-class-narrowing'`.
  const _gateResolvedTokens = (() => {
    try {
      const _g = $('disallowed-entity-gate').first().json ?? {};
      return new Set((_g.resolutions ?? [])
        .filter(x => x && x.resolved === true && (x.resolved_by === 'document-class-narrowing' || x.resolved_by === 'same-code-collapse'))   // mc-prefix-collapse: honour the gate's same-code stamp too
        .map(x => String(x.token ?? '').trim().toLowerCase())
        .filter(Boolean));
    } catch (e) { return new Set(); }
  })();
  // ── a token whose OWN candidates BECAME the answer is not a miss (promo-scope-dym) ──
  // FIFTH surface of the class the `document-class-narrowing` narrowing above patched fourth.
  // That one names the MECHANISM; this one names the OUTCOME, so a sixth promotion mechanism
  // needs no sixth patch. Measured on exec 11889275 ("6047 promo"): resolve-entity returns
  // `{ token: "6047", resolved: false, ambiguous: true, matches: [15 promotions, every one
  // match_tier "via_product" and therefore never `isExact`] }`, disallowed-entity-gate lifts all
  // 15 into `compatible_entities` — which IS the list the customer was shown — and nobody writes
  // `resolved` back. So this filter offered three rows of the customer's own answer back to them
  // as "did you mean". Same on the "all" pick turn for "bathroom furniture".
  //
  // Keyed PER TOKEN on that token's own candidates, never on "something was answered": a genuine
  // miss contributes nothing to compatible_entities and is still surfaced, and an empty
  // compatible_entities suppresses nothing. Gate: tests/offline/promo-scope-dym/probe.js
  // (A1-A5 the defect, C1-C4 the surviving feature, D1 the no-blanket-mute bound).
  const _answerCodes = (() => {
    const s = new Set();
    try {
      for (const e of ($('disallowed-entity-gate').first().json.compatible_entities ?? [])) {
        for (const v of [e && e.uuid, e && e.code]) {
          const k = String(v ?? '').trim().toLowerCase();
          if (k) s.add(k);
        }
      }
    } catch (e) { /* gate not executed -> no answer set -> suppress nothing */ }
    return s;
  })();
  // `intersection` is the THIRD place an answer set hides. resolve-entity returns two envelopes:
  // the per-token `resolutions[]` shape, and a legacy blob { tokens, intersection, alternatives,
  // unresolved_tokens, ... } with NO `resolutions` at all — that is the one the legacy arm below
  // renders. Measured on exec 11891721 ("dealer version only"): `unresolved_tokens: ["6047"]`
  // alongside `intersection: [8 products, match_tier "brand_access_fallback",
  // display.via_token: "6047"]`, i.e. the token that "failed" is the token that produced the
  // answer. Reading only matches/alternatives left this envelope unprotected and the customer got
  // `"6047" — not found.` under four correct rows.
  const _tokenWasAnswered = (res) => {
    if (!_answerCodes.size) return false;
    const cands = [].concat(Array.isArray(res?.matches) ? res.matches : [],
                            Array.isArray(res?.alternatives) ? res.alternatives : [],
                            Array.isArray(res?.intersection) ? res.intersection : []);
    return cands.some(m => [m && m.uuid, m && m.canonical_code]
      .some(v => { const k = String(v ?? '').trim().toLowerCase(); return k && _answerCodes.has(k); }));
  };
  // ── one miss, one voice (2026-08-11) ─────────────────────────────────────────
  // promo-picker now renders its own miss for promotion turns ("No promotion found for …").
  // Without this, the same token was ALSO reported here: measured live, "cabana shower head promo"
  // answered with the picker's miss AND "Couldn't find these: \"shower head\" — not found." — two
  // voices, one miss. Skip any token the picker already reported. Guarded: on workflows without a
  // promo-picker node (clone/live) the set is empty and this is byte-inert.
  const _pickerReported = (() => {
    const s2 = new Set();
    try {
      const pp = $('promo-picker');
      if (pp.isExecuted) {
        const o = pp.first().json || {};
        for (const t of ((o._promo_notfound && o._promo_notfound.tokens) || []))
          s2.add(String(t ?? '').trim().toLowerCase());
        for (const t of (o._promo_unmatched || []))
          s2.add(String(t ?? '').trim().toLowerCase());
      }
    } catch (e) { /* node absent -> empty set */ }
    return s2;
  })();
  let missResolutions = [];
  if (Array.isArray(r?.resolutions)) {
    missResolutions = r.resolutions.filter(res => res && res.resolved !== true
      && !(Array.isArray(res.matches) && res.matches.some(isExact))
      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
      && !_pickerReported.has(String(res.token ?? '').trim().toLowerCase())
      && !_tokenWasAnswered(res));
  } else if (unresolved.length && !_tokenWasAnswered(r)
      && !unresolved.every(t => _pickerReported.has(String(t ?? '').trim().toLowerCase()))) {
    missResolutions = [r];   // legacy single-resolution shape
  }
  const surfaced = missResolutions.slice(0, 5);   // cap missed tokens shown at 5
  if (surfaced.length === 0) return;               // no genuine miss -> pure no-op (byte-identical)

  // Render each surfaced token (numbered when it has candidates, else a plain not-found line).
  // Global CONTIGUOUS idx 1..M across tokens; per-token candidates via its OWN matches/alternatives.
  // ── dym-probe-before-offer, 2nd consumer: has-it annotation for the PARTIAL-RESOLUTION
  // renderer. Identical contract to build-suggest-offer's D1 block — same _dymOk/_dymHas/
  // _dymProbed/_dymNoun names, same fail-open rule, same "not probed ⇒ NO suffix" rule.
  // Two lanes reach here: the results lane (central-exchange → dym-*-partial) and the
  // not-found lane (… → dym-annotate → … → cs-offer-gate[1]). Prefer whichever executed.
  // 🔴 NO SORT HERE. This block assigns a GLOBAL CONTIGUOUS idx across tokens that
  // _numbered/_dymCands are keyed on, and _numbered carries the for_raw/for_hint/
  // for_canonical pick-linkage. Reordering would renumber across token blocks and break the
  // round-trip. Annotation is suffix-only and order-preserving; has-first is D1's alone.
  const _dymNorm = (s) => String(s ?? '').trim().toLowerCase();
  const _dymAnn = (() => {
    for (const n of ['dym-annotate-partial', 'dym-annotate']) {
      try { const x = $(n); if (x.isExecuted) return x.first().json || {}; } catch (e) { /* not on this path */ }
    }
    return null;
  })();
  const _dymOk     = !!(_dymAnn && _dymAnn.dym_probe_meta && _dymAnn.dym_probe_meta.ok === true);
  const _dymHas    = new Set(_dymOk ? (_dymAnn.dym_available_codes || []).map(_dymNorm) : []);
  const _dymProbed = new Set(_dymOk ? (_dymAnn.dym_probe_meta.probed || []).map(_dymNorm) : []);
  const _dymAttNoun = () => {
    if (qf?.domain_hint !== 'product_attachment') return null;
    const at = Array.isArray(qf?.entities)
      ? qf.entities.find(e => String(e.hint || '').toLowerCase() === 'attachment_type') : null;
    return (at && at.raw) ? at.raw : 'document';
  };
  const _dymNounOf = (n) => { const s = String(n ?? '').trim(); return /^cert/i.test(s) ? 'certificate' : (s || 'document'); };
  const _dymNoun   = _dymOk ? _dymNounOf(_dymAnn.dym_probe_meta.noun || _dymAttNoun()) : null;
  const _dymSfx = (code) => {
    if (!_dymOk) return '';
    const k = _dymNorm(code);
    if (!_dymProbed.has(k)) return '';          // never a misleading "no" for an unprobed code
    return _dymHas.has(k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`;
  };

  const _entities = Array.isArray(qf.entities) ? qf.entities : [];
  // entity-type-label helpers: normalized match key (resolve-entity's `token` is space/dash-
  // stripped before it reaches the resolver, `entities[].raw` is not) and a display-prettifier
  // for a snake_case/kebab-ish resolver entity_type (open vocabulary; a plain lowercase word
  // passes through as-is). Mirrors the confirm-prefix IIFE below (normTok/prettify) byte-for-byte.
  const _typeNorm = (s) => String(s ?? '').replace(/[-\s]+/g, '').toLowerCase();
  const _prettifyType = (t) => {
    const s = String(t ?? '').trim();
    if (!s) return '';
    if (!/[_-]/.test(s) && s === s.toLowerCase()) return s;
    return s.replace(/[_-]+/g, ' ').trim().toLowerCase();
  };
  let idx = 0;
  const _lines = [];
  const _numbered = [];   // -> dym_last_result_set rows (only when M >= 1)
  const _dymCands = [];   // -> dym offer candidates (only when M >= 1)
  for (const res of surfaced) {
    const token = res.token || unresolved[0] || (qf.entities?.[0]?.raw) || 'that item';
    const picks = cap3(tokenCandidates(res)).map(m => ({ m, label: humanLabel(m) })).filter(p => p.label);
    // entity-type-label: annotate the miss/DYM line with what the bot thought this token was —
    // resolver PRIMARY (this token's own res.matches[0].entity_type — open vocabulary,
    // prettified only if snake_case/ugly), parser hint (qf.entities[].hint) FALLBACK when the
    // resolver named nothing, bare when neither is known (byte-identical then). Matches the
    // confirm-prefix IIFE's priority below so a token's type label never disagrees between the
    // media-confirm line and this miss/DYM line. Uses its OWN source-entity lookup (_typeSrcEnt,
    // dash/space-normalized) rather than the picks-branch's _srcEnt below (pick-linkage match,
    // case-insensitive-trim) so restoring labels here cannot perturb that linkage's behavior.
    const _typeSrcEnt = _entities.find(e => _typeNorm(e.raw) === _typeNorm(token));
    const _rawType = (res && Array.isArray(res.matches) && res.matches[0] && res.matches[0].entity_type) || null;
    const _typeLabel = _prettifyType(_rawType) || (_typeSrcEnt && _typeSrcEnt.hint) || '';
    const _typeSfx = _typeLabel ? ` (${_typeLabel})` : '';
    if (picks.length) {
      // dym-candidate-map: each candidate keeps its OWN source token (per-token _srcEnt; no borrow).
      const _srcEnt = _entities.find(e => String(e.raw || '').toLowerCase().trim() === String(token || '').toLowerCase().trim());
      _lines.push(`"${token}"${_typeSfx}, did you mean:`);
      for (const p of picks) {
        idx += 1;
        const isU = isUuid(p.m.canonical_code);
        const _forRaw = token;
        const _forHint = p.m.entity_type || (_srcEnt && _srcEnt.hint) || null;
        const _forCanon = (_srcEnt && _srcEnt.canonical_code) || null;
        // dym-probe-before-offer: suffix only, keyed on the CODE (never the label), so a
        // uuid-coded candidate rendered by name is simply not probed and gets nothing.
        _lines.push(`  ${idx}. ${p.label}${_dymSfx(p.m.canonical_code)}`);
        // superset row: display shape (idx/label/value/product/uuid/entity_type) + pick-linkage
        // (for_raw/for_hint/for_canonical) so the numbered-DYM handler in output_exchange can run the
        // SAME in-place replacement tryDymPick does.
        _numbered.push({
          idx, label: p.label, value: isU ? p.label : p.m.canonical_code,
          product: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
          for_raw: _forRaw, for_hint: _forHint, for_canonical: _forCanon,
        });
        _dymCands.push({
          code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
          for_raw: _forRaw, for_hint: _forHint, for_canonical: _forCanon,
        });
      }
    } else {
      _lines.push(`"${token}"${_typeSfx}: not found.`);   // zero renderable candidates -> plain line, no idx
    }
  }
  const M = _numbered.length;   // total numbered candidates across surfaced tokens
  const _footer = M >= 1 ? 'Reply a number to check it, or ask again.' : 'Ask again with the correct code.';
  userResponse += `\n\nCouldn't find these:\n` + _lines.join('\n') + `\n\n` + _footer;

  // Arm the dym set ONLY when there is >= 1 numbered candidate. Do NOT touch last_result_set or
  // selection_context (the withdrawn HALT behaviour). Append the SINGLE parser-visible marker to
  // `response` (the compressed, parser-facing view) so the parser learns a dym offer is active next turn.
  if (M >= 1) {
    _dymLastResultSet = _numbered;
    _partialOffer = _mkOffer(_dymCands);
    response += ` [${M} did-you-mean suggestions active]`;
  }
})();


// ── dym-single-use-fix: did-you-mean offer LIFECYCLE (supersede / retain / expire) ──
// Replaces the single-turn dym_candidates erasure with an explicit offer that survives repeated
// picks but is bounded by domain-switch / escalation / answer / TTL. First matching rule wins;
// EVERY non-retaining branch writes null explicitly — never reliance on key absence (§3c).
const _newOffer = (_sug && _sug.dym_offer && Array.isArray(_sug.dym_offer.candidates) && _sug.dym_offer.candidates.length)
  ? _sug.dym_offer : (_partialOffer || null);   // dym-partial-disambiguation: partial-miss offer survives the answered turn
const _prevOffer = (() => {
  try {
    const s = $('get-session-vars').first().json;
    const v = (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || null;
    return (v && v.dym_offer && typeof v.dym_offer === 'object') ? v.dym_offer : null;
  } catch (e) { return null; }
})();
const _pickApplied = qf.dym_pick_applied === true;
// a human owns the thread once escalation is confirmed OR a specific member was resolved this turn
const _escalated = !!(qf.escalation && (qf.escalation.is_escalation_confirmation === true || qf.escalation.preferred_assignee_id));
const _answered = Array.isArray(last_result_set) && last_result_set.length > 0;
const _dymOffer = (() => {
  if (_newOffer) return { ..._newOffer, ttl: 3, picked: [] };                    // 1. fresh offer → REPLACE
  if (!_prevOffer) return null;                                                  //    nothing to carry
  // 2. domain switch — reads the POST-carry domain_hint (null never kills: a bare-code pick emits null)
  if (qf.domain_hint && _prevOffer.domain && qf.domain_hint !== _prevOffer.domain) return null;
  if (_escalated) return null;                                                   // 3. escalation committed → DIE
  if (_pickApplied) {                                                            // 4. pick applied → RETAIN (T3 fix)
    const _picked = Array.isArray(_prevOffer.picked) ? _prevOffer.picked.slice() : [];
    if (qf.dym_offer_pick_code && !_picked.includes(qf.dym_offer_pick_code)) _picked.push(qf.dym_offer_pick_code);
    return { ..._prevOffer, ttl: 3, picked: _picked };
  }
  if (_answered) return null;                                                    // 5. answered, no pick → DIE
  if (!(Number(_prevOffer.ttl) > 1)) return null;                               // 6. TTL exhausted (ttl-1<=0)
  return { ..._prevOffer, ttl: Number(_prevOffer.ttl) - 1 };                     // 7. otherwise RETAIN, decrement
})();

output = {
  "variables": {
    "message_type": qf.message_type,
    "intent_hint": qf.intent_hint,
    "domain_hint": qf.domain_hint,
    "user_goal": qf.user_goal,
    "query_scope": qf.query_scope,
    // S3 (promotion-picker) + F4(b): access_levels IS persisted again, but the carry that reads it
    // is now CONDITIONAL (output_exchange: only when this turn states no tier AND reuses the
    // previous scope). S3 removed an UNCONDITIONAL carry, which made a tier chosen once sticky for
    // the whole session; D4 targets that stickiness, not the memory itself. Without persisting it,
    // a follow-up inside the same question filtered by nothing and re-widened 2 files to 6.
    // F7: query_brands IS session state, and the distinction is the point. The TIER is a per-turn
    // CHOICE that goes stale (D4). The BRAND is a constraint the customer put on the question, and
    // it must survive a continuation for the same reason `entities` does — the scope-reuse blocks
    // carry the entities forward, and without this the brand half of that scope silently vanished
    // and re-opened a gate that had already denied the turn (execs 12057894 → 12057965).
    "query_brands": qf.query_brands,
    "access_levels": qf.access_levels,
    "entities": reconciledEntities,
    "routing": qf.routing,
    "escalation": qf.escalation,
    "response": response,                 // now the COMPRESSED view (parser-facing)
    "last_result_set": last_result_set,
    "selection_context": selection_context,
    "date_filter_start": qf.date_filter_start,
    "date_filter_end": qf.date_filter_end,
    "date_mode": qf.date_mode,
    "match_mode": qf.match_mode,
    "contains_flyer": qf.contains_flyer,
    // dym-single-use-fix: persist the lifecycle-managed offer (null clears it — see §3c above).
    // dym_candidates is a READ-ONLY LEGACY MIRROR of the offer's candidates, kept only for the
    // spine↔parser promotion window so an OLD parser can still pick; delete it once both are live.
    "dym_offer": _dymOffer,
    "dym_candidates": (_dymOffer && Array.isArray(_dymOffer.candidates)) ? _dymOffer.candidates : [],
    // Ideation pointer (Rev-3.1): on an ideate turn, persist the endpoint's returned
    // pointer; on any other turn carry the prior one forward so a CRM question
    // mid-collection does not wipe an open draft. Reads 'get-session-vars' (the CRM
    // session read) and tolerates BOTH shapes: the endpoint keys `ideation` flat under
    // session_vars, n8n's own writer nests it under `variables`. A throw here would
    // return null and a CRM interrupt would WIPE the open draft (IU3).
    "ideation": _ideate ? _ideate.ideation : (() => {
      try {
        const s = $('get-session-vars').first().json;
        return (s && s.session_vars && s.session_vars.variables && s.session_vars.variables.ideation)
          || (s && s.variables && s.variables.ideation) || null;
      } catch (e) { return null; }
    })()
  },
  "user_response": userResponse,
  "quick_reply": quickReply
};
// dym-partial-disambiguation v3: emit dym_last_result_set ONLY when a dym set exists this turn
// (absent on every no-dym turn -> output byte-identical to live).
if (_dymLastResultSet) output.variables.dym_last_result_set = _dymLastResultSet;
// brand-company-routing: routing axes for the escalation turn (report §5.2; null-inert for replay norm)
{
  const _g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : null; } catch (e) { return null; } })();
  const _prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
  const _sameTeam = _prev && _prev.routing && qf.routing && _prev.routing.suggested_team === qf.routing.suggested_team;
  const _fresh = _g && Array.isArray(_g.routing_companies) && _g.routing_companies.length > 0;
  // The roster plan ACTUALLY used by get-cs-members this turn — the (company_id, brand_code) pairs the
  // offered members were fetched with. escalation-context reads this back so the pool assigned from is the
  // pool shown; it is the single definition of pool identity, never re-derived from routing_brand.
  // Only the plan items that CONTRIBUTED a member are kept: a company whose roster came back empty
  // (404/5xx degraded by onError, or no CS members configured) was named in the reply but has nobody
  // to assign, so it must not turn a de-facto single pool into "both axes null" on the bare-"yes" turn.
  // Carried forward ONLY when this turn fetched NO roster at all AND did not resolve a fresh company set:
  // whenever cs-roster-plan ran, the fetch-derived intersection is the answer even when it is empty (the
  // roster shown this turn superseded the old one). A plan must never outlive the roster it describes.
  const _planItems = (() => { try { const n = $('cs-roster-plan'); return n.isExecuted ? n.all().map(i => i.json) : null; } catch (e) { return null; } })();
  const _shownRows = (!_ideate && _mem && Array.isArray(_mem.cs_last_result_set)) ? _mem.cs_last_result_set : [];
  const _shownCos = new Set();
  for (const r of _shownRows) {
    const _ids = (r && Array.isArray(r.company_ids) && r.company_ids.length) ? r.company_ids : [(r && r.company_id) || null];
    for (const _id of _ids) _shownCos.add(_id || null);
  }
  const _usedPlan = (Array.isArray(_planItems) ? _planItems : []).filter(p => _shownCos.has((p && p.company_id) || null));
  output.variables.routing_roster_plan = _usedPlan.length
    ? _usedPlan.map((p, i) => ({ plan_idx: (p && p.plan_idx != null) ? p.plan_idx : i, company_id: (p && p.company_id) || null, company_name: (p && p.company_name) || null, brand_code: (p && p.brand_code) || null }))
    : (_planItems === null && !_fresh && _sameTeam && Array.isArray(_prev.routing_roster_plan) ? _prev.routing_roster_plan : null);
  output.variables.routing_brand        = _fresh ? (_g.routing_brand ?? null)        : (_sameTeam ? (_prev.routing_brand ?? null) : null);
  output.variables.routing_brand_source = _fresh ? (_g.routing_brand_source ?? null) : (_sameTeam ? (_prev.routing_brand_source ?? null) : null);
  output.variables.routing_company      = _fresh ? (_g.routing_company ?? null)      : (_sameTeam ? (_prev.routing_company ?? null) : null);
  output.variables.routing_companies    = _fresh ? _g.routing_companies              : (_sameTeam && Array.isArray(_prev.routing_companies) ? _prev.routing_companies : null);
}
// MI-D (2026-08-22, captain Option D): media confirm MERGED into the answer, not a separate
// message. send-transcript-confirm is gated off (if-transcribed-confirm forced false - see
// that node); this block prepends the CRM's photo/voice confirmation_text (question-stripped,
// entity-type labeled) as the first line(s) of whatever this node ends up sending. Placed as
// the LAST statement before `return output` so it applies exactly once regardless of which
// internal branch (central-exchange happy path / escalate-catalog miss / build-suggest-offer
// DYM / the multi-company clarify override above) produced `output.user_response`.
// RESTORED 2026-08-22 (media-scope edit): an intervening publish reverted this workflow to a
// pre-MI-D draft (versionId 8b576315 -> 91e57e21, ~11:54Z) and lost this block along with three
// unrelated hunks (customer-picker roster extension, entity-type-label on miss/DYM lines, the
// em-dash sanitizer) - those three are OUT OF SCOPE here and were NOT restored; only this block,
// byte-identical to the pre-revert capture except for the media-scope filter/trim below, flagged
// in the report. See docs/LESSONS.md #24 (revert landmine).
(() => {
  try {
    if (!$('patch-transcript').isExecuted) return;                 // text turn - no media, no-op
    const media = ($('patch-transcript').first().json.message || {})._media || {};
    const rawFull = media.confirmation_text;
    if (typeof rawFull !== 'string' || !rawFull.trim()) return;     // media turn but nothing to confirm
    if (typeof output.user_response !== 'string' || !output.user_response.trim()) return;

    // NOTICE SPLIT (2026-08-22, quote-strip fix): media-route now appends degraded-tier/other
    // notices AFTER the confirmation sentence, joined with the lane's "\n\n" separator, so
    // confirmation_text can arrive as "<confirmation>[.?]\n\n<notice...>". Split on the FIRST
    // blank-line boundary: only the confirmation segment gets the interrogative-tail strip and
    // the shape/label logic below; any notices are carried through verbatim, untouched, and
    // re-spliced back between the (stripped) confirmation and the answer body.
    const _blankIdx = rawFull.indexOf('\n\n');
    const raw = _blankIdx === -1 ? rawFull : rawFull.slice(0, _blankIdx);
    const noticesTail = _blankIdx === -1 ? '' : rawFull.slice(_blankIdx + 2);
    const joinNotices = (s) => noticesTail ? `${s}\n\n${noticesTail}` : s;

    // 1. strip the trailing confirmation question ("Is that right?" / any interrogative tail -
    // a trailing clause with no internal sentence punctuation that ends in "?") - applied to
    // the confirmation segment only, never to a notice.
    const stripped = raw.replace(/\s*[^.!?]*\?\s*$/, '').trim();
    let stmt = stripped || raw.replace(/\?+\s*$/, '').trim();

    // CAPTAIN DECISION 2026-08-22 (media entity scope): on a media-derived turn only
    // product/customer/order entities are meaningful; OCR noise the extractor reads off the
    // image (sizes/dimensions, dates, loose furniture words the parser hints as category)
    // must not become lookup entities and must not appear in this prefix.
    // AMENDED 2026-08-22 (captain): promotion added to the allow-list too, so a promotion
    // entity read off a flyer is both looked up (resolve-entity-http) and named here.
    // The caption's own attachment_type entity (e.g. "photo"/"technical drawing") is the
    // request's FILTER, never something read FROM the media - it is excluded from the prefix
    // the same way it always was (never a printed clause), not by this allow-set.
    const ALLOW_HINTS = new Set(['product', 'customer', 'order', 'promotion']);
    // Attribute-kind clauses (self-describing, e.g. "size L580xW460xH400mm") never become
    // entities - CRM `app/services/media_extract/wording.py` ATTRIBUTE_LABELS is the closed
    // vocabulary: batch_number/barcode/box_dimension/product_size/quantity/document_number/
    // document_date. All except document_number are dropped as noise; document_number is kept
    // (order/document-number is the one attribute kind the captain named meaningful). FLAG: if
    // "document date" ever turns out load-bearing on some turn, this one-line list is the revert.
    const DROP_ATTR_LABELS = ['size', 'quantity', 'batch number', 'barcode', 'box dimension', 'document date'];

    // 2. label source per token: resolve-entity matches[].entity_type PRIMARY (open vocabulary -
    // whatever the resolver returns, prettified only if snake_case/ugly), reformulator `hint`
    // FALLBACK for tokens the resolver didn't cover (or never ran), bare when neither classifies.
    const qEnts = (() => {
      try { return $('Call \'sub-query-reformulator\'').first().json.output.entities || []; }
      catch (e) { return []; }
    })();
    const resolutions = (() => {
      try {
        if (!$('resolve-entity').isExecuted) return [];
        const rj = $('resolve-entity').first().json || {};
        return Array.isArray(rj.resolutions) ? rj.resolutions : [];
      } catch (e) { return []; }
    })();

    const normTok = (s) => String(s ?? '').replace(/[-\s]+/g, '').toLowerCase();
    const prettify = (t) => {
      const s = String(t ?? '').trim();
      if (!s) return '';
      if (!/[_-]/.test(s) && s === s.toLowerCase()) return s;      // already a plain lowercase word
      return s.replace(/[_-]+/g, ' ').trim().toLowerCase();
    };

    // resolve-entity's `token` is SPACE-STRIPPED before it ever reaches the resolver (dashes
    // kept) - reformulator's `entities[].raw` is the UNSTRIPPED original spelling and is what
    // actually appears in the CRM's confirmation_text (e.g. Whisper renders "SRT WC286SH" with
    // the space; resolve-entity's token for the SAME entity is "SRTWC286SH"). Join the two by
    // the normalized key so we search for the text as it ACTUALLY reads in confirmation_text,
    // while still taking the entity_type from the resolver (the authoritative source).
    const qByNorm = new Map();
    for (const e of qEnts) { if (e && e.raw) qByNorm.set(normTok(e.raw), e); }

    // labelFor: normTok(raw) -> { type, allowed }. `allowed` decides membership in the media
    // prefix (Step 2B) and mirrors resolve-entity-http's own media-scope filter (Step 2A) so a
    // token's verdict never disagrees between the resolve request and this prefix.
    const labelFor = new Map();
    for (const res of resolutions) {
      const t = res && res.token;
      if (!t) continue;
      const m = [].concat(res.matches || [])[0];
      if (!m || !m.entity_type) continue;
      const key = normTok(t);
      const qe = qByNorm.get(key);
      // attachment_type is the request's FILTER (e.g. the caption "check product photo"),
      // never something read FROM the image/voice - skip it by hint, not by token value.
      if (qe && String(qe.hint || '').toLowerCase() === 'attachment_type') continue;
      const hint = qe ? String(qe.hint || '').toLowerCase() : null;
      const allowed = hint ? ALLOW_HINTS.has(hint) : ALLOW_HINTS.has(String(m.entity_type || '').toLowerCase());
      labelFor.set(key, { type: String(m.entity_type), allowed });
    }
    for (const e of qEnts) {
      if (!e || !e.raw || !e.hint) continue;
      const key = normTok(e.raw);
      if (String(e.hint).toLowerCase() === 'attachment_type') continue;   // same skip as above
      if (labelFor.has(key)) continue;                                    // resolver already classified it
      labelFor.set(key, { type: e.hint, allowed: ALLOW_HINTS.has(String(e.hint).toLowerCase()) });
    }

    // 3. wording.py `confirmation()`/`clarification()` both build this sentence as a fixed
    // "I read <join_phrase(entity+attribute phrases)> from that photo[.<tail>]" shape (image
    // only - voice's `voice_confirmation()` just quotes the transcript verbatim and has no item
    // list, so this regex simply won't match a voice turn and stmt passes through unchanged,
    // same as before this edit). `join_phrase`: ", ".join(items[:-1]) + " and " + items[-1].
    const shape = /^(I read )(.+?)( from that photo\.)([\s\S]*)$/;
    const sm = shape.exec(stmt);
    if (sm) {
      const lead = sm[1], itemsBlob = sm[2], tail = sm[3], rest = sm[4];
      let items;
      const commaParts = itemsBlob.split(', ');
      if (commaParts.length > 1) {
        const last = commaParts.pop();
        const lastParts = last.split(' and ');
        items = commaParts.concat(lastParts.length === 2 ? lastParts : [last]);
      } else {
        const twoParts = itemsBlob.split(' and ');
        items = twoParts.length === 2 ? twoParts : [itemsBlob];
      }

      const kept = [];
      for (const raw0 of items) {
        const item = raw0.trim();
        if (!item) continue;
        const attrHit = DROP_ATTR_LABELS.some(lbl => item.toLowerCase().startsWith(lbl + ' '));
        if (attrHit) continue;                              // drop: recognized noise attribute kind
        const found = labelFor.get(normTok(item));
        if (found) {
          if (!found.allowed) continue;                      // drop: disallowed hint (e.g. category)
          const label = prettify(found.type);
          kept.push(label ? `${item} (${label})` : item);
        } else {
          kept.push(item);   // unrecognized clause (e.g. "document number ..."): keep bare, never guessed
        }
      }

      if (kept.length) {
        const joined = kept.length === 1 ? kept[0] : kept.slice(0, -1).join(', ') + ' and ' + kept[kept.length - 1];
        stmt = `${lead}${joined}${tail}${rest}`;
        output.user_response = `${joinNotices(stmt)}\n\n${output.user_response}`;
      } else if (noticesTail) {
        // kept.length === 0: nothing allow-set survived (every read item was noise) - skip the
        // entity-confirmation prefix (never invent CRM-unsourced wording), but a notice still
        // carries real information (e.g. degraded tier) and must still reach the customer.
        output.user_response = `${noticesTail}\n\n${output.user_response}`;
      }
      // kept.length === 0 and no notices: nothing to prepend, the underlying answer sends
      // unprefixed, exactly as before.
      return;
    }

    // CAPTAIN DECISION 2026-08-22 (voice quote must stay verbatim): confirmation_text
    // didn't match the known "I read ... from that photo." shape - this is the path every
    // VOICE turn takes (voice_confirmation() just quotes the transcript verbatim, no item
    // list to label). Pass the sentence through UNLABELED - no regex-splice label injection.
    // The removed splice risked landing mid-word ("SRT (product)WC286SH") and put labels
    // inside a quoted transcript, which the captain ruled out here. `stmt` already has the
    // trailing interrogative tail stripped (step 1 above), so nothing further is needed.
    output.user_response = `${joinNotices(stmt)}\n\n${output.user_response}`;
  } catch (e) { /* never block the answer on a labeling bug - send it unlabeled/unprefixed */ }
})();
// EM-DASH SANITIZER (captain hard rule 2026-08-22): dynamic text (LLM/CRM/RAG sourced) must
// never carry U+2014 to the customer. Deep-walk the final payload and fold every em-dash to a
// hyphen -- covers user_response, quick_reply, and every persisted variables.* string, no
// matter which arm produced it. Non-string / non-object values pass through untouched.
(function _sanitizeEmDash(o) {
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') o[k] = v.replace(/\u2014/g, '-');
      else if (v && typeof v === 'object') _sanitizeEmDash(v);
    }
  }
  return o;
})(output);

return output;


