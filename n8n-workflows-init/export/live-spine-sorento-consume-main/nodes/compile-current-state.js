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
  const _picker = (Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : [])
    .map(m => `${m.idx}. ${m.label}`).join('\n');
  response = `${_sug.suggest_response}\n\nTo escalate, choose who to route to — reply the number or name:\n${_picker}\n\nOr just reply 'yes' and we'll assign automatically.`;
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
const selection_context = _merge ? 'member_offer' : (_sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : (_isDisambig ? 'disambiguation' : null)));

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
        .filter(x => x && x.resolved === true && x.resolved_by === 'document-class-narrowing')
        .map(x => String(x.token ?? '').trim().toLowerCase())
        .filter(Boolean));
    } catch (e) { return new Set(); }
  })();
  let missResolutions = [];
  if (Array.isArray(r?.resolutions)) {
    missResolutions = r.resolutions.filter(res => res && res.resolved !== true
      && !(Array.isArray(res.matches) && res.matches.some(isExact))
      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase()));
  } else if (unresolved.length) {
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
  let idx = 0;
  const _lines = [];
  const _numbered = [];   // -> dym_last_result_set rows (only when M >= 1)
  const _dymCands = [];   // -> dym offer candidates (only when M >= 1)
  for (const res of surfaced) {
    const token = res.token || unresolved[0] || (qf.entities?.[0]?.raw) || 'that item';
    const picks = cap3(tokenCandidates(res)).map(m => ({ m, label: humanLabel(m) })).filter(p => p.label);
    if (picks.length) {
      // dym-candidate-map: each candidate keeps its OWN source token (per-token _srcEnt; no borrow).
      const _srcEnt = _entities.find(e => String(e.raw || '').toLowerCase().trim() === String(token || '').toLowerCase().trim());
      _lines.push(`"${token}" — did you mean:`);
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
      _lines.push(`"${token}" — not found.`);   // zero renderable candidates -> plain line, no idx
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
return output;

