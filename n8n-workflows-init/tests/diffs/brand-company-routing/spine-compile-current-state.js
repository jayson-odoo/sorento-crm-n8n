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

// ── N-1a · say WHAT matched, on spec answers only (spec-raw-text-migration) ──────────
// The customer described a product in their own words and got five codes back with no
// indication of WHICH part of their description did the work — so a wrong assumption on our
// side and a right answer look identical to them.
//
// THE RULE: `matched_specs ∩ (spec_asked-keys ∪ {class})`, rendered as VALUES.
//   * `spec_asked` (CRM #142) is what the CUSTOMER asked for. Intersecting with it is what
//     keeps a HOUSE-PREFERENCE key out of a line that reads as "your words matched this" —
//     product_spec_search.py appends a preferred key to `matched_specs` exactly when the
//     customer did NOT state it, so it can never be in `spec_asked`. That is also why
//     `free_terms` needs no exclusion list: it is machinery, never in `spec_asked`.
//   * `class` is unioned back because it is customer-earned but structurally cannot arrive
//     through `spec_asked` on the deterministic path (the registry `class` row ships no
//     synonyms, so the phrase scores through `implied_classes`). It is NOT safe to assert
//     class is absent from `spec_asked` — with understand_phrase the model can put it there.
//   * VALUES come from `display.specifications` (CRM #142) — the compact values-only block.
//
// HUMANISING IS THREE LINES, NOT TWO: `class` verbatim, `brand` verbatim, everything else
// underscores-to-spaces + titlecase. Brand values carry real spaces and case ("NO LOGO",
// "American Standard"); re-casing them rewrites the catalogue's own spelling at the customer.
//
// `class` renders as its VALUE, never the key name, and leads the sentence.
// Anything that cannot be rendered honestly (boolean, object, missing) is DROPPED, not guessed.
// No in-answer spec row contributes a key => no line, byte-identical output.
(() => {
  const answered = !isEscalateBranch
    && includeResponse
    && !manualResponse
    && qf.message_type === 'business_query'
    && typeof userResponse === 'string'
    && userResponse.trim().length > 0
    && Array.isArray(last_result_set)
    && last_result_set.length > 0;
  if (!answered) return;
  // Named `_specRes`, not `_re`: N-2 below binds the same node to `_re`, and two identical
  // three-line openings would make the N-2 mutation anchors ambiguous (mutate.sh m8 VOIDs on a
  // duplicated anchor - which is the guard working, but a suite that cannot mutate N-2 is not
  // a suite). The names differ so each block stays independently addressable.
  const _specRes = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
  // The rows the customer was actually shown. Same construction as N-3's `_answerCodes`:
  // `compatible_entities` carries {uuid, entity_type, code} and no match_tier, so the tier is
  // read off the resolver rows and joined back to this set by uuid/code.
  const _shownEnts = [];
  const _shownSet = (() => {
    const s = new Set();
    try {
      for (const e of ($('disallowed-entity-gate').first().json.compatible_entities ?? [])) {
        _shownEnts.push(e);
        for (const v of [e && e.uuid, e && e.code]) {
          const k = String(v ?? '').trim().toLowerCase();
          if (k) s.add(k);
        }
      }
    } catch (e) { /* gate not executed -> no answer set -> no line */ }
    return s;
  })();
  if (!_shownSet.size) return;
  const _all = [];
  if (Array.isArray(_specRes.resolutions)) {
    for (const _res of _specRes.resolutions) if (Array.isArray(_res && _res.matches)) _all.push(..._res.matches);
  }
  if (Array.isArray(_specRes.intersection)) _all.push(..._specRes.intersection);
  const _inAnswer = (m) => [m && m.uuid, m && m.canonical_code]
    .some(v => { const k = String(v ?? '').trim().toLowerCase(); return k && _shownSet.has(k); });
  const _specRows = _all.filter(m => String(m?.match_tier ?? '').toLowerCase() === 'spec_search' && _inAnswer(m));
  // ── F2 · the sentence is WHOLE-ANSWER scoped, so its evidence must be too ──────────
  // The keys are sourced from spec rows, but the sentence is appended to the WHOLE reply. On
  // the mixed shape this slice newly makes reachable (the CRM's OR arm APPENDS a spec
  // resolution beside surviving code rows - conformance §C-1, MEASURED exec 12597847) the
  // reply carried 15 rows, 10 of them code-prefix matches, and still closed with
  // `_Matched on: mounting: Wall Hung._` - true of 5 rows and false of 10. Substitute a
  // product attribute and it sharpens: "SRTWC286 and 1.2mm sink" would invite the customer to
  // read the SRTWC286 rows as 1.2mm.
  //
  // So: emit ONLY when EVERY row the customer was shown is a spec_search row. A partial
  // attribution is not a weaker claim, it is a false one, and the whole SR family exists to
  // stop exactly that. Mixed => no line at all; the spec rows are still shown, they are simply
  // not described. Same join as `_inAnswer`, so "in the answer" and "the whole answer" cannot
  // disagree about what the answer is.
  //
  // Stated bound: a shown entity that is not a product spec row (a category or brand row lifted
  // into `compatible_entities`) also suppresses. That is the conservative direction and it is
  // the one this block must err in.
  const _specKeys = new Set();
  for (const m of _specRows) {
    for (const v of [m && m.uuid, m && m.canonical_code]) {
      const k = String(v ?? '').trim().toLowerCase();
      if (k) _specKeys.add(k);
    }
  }
  const _allShownAreSpec = _shownEnts.length > 0 && _shownEnts.every(e =>
    [e && e.uuid, e && e.code].some(v => { const k = String(v ?? '').trim().toLowerCase(); return k && _specKeys.has(k); }));
  if (!_allShownAreSpec) return;
  // First-seen order across rows, deduped. Row order is the ranker's order.
  const _keys = [];
  for (const m of _specRows) {
    const _ms = (m && m.display && Array.isArray(m.display.matched_specs)) ? m.display.matched_specs : [];
    for (const _k of _ms) {
      // STRINGS ONLY, never String(_k): the wire is a list of key names, and coercing junk
      // renders it. Caught by SR-U6-14 - an object entry became the literal "[object Object]"
      // inside a customer-facing sentence, the same failure the N-2 block guards against.
      const _key = typeof _k === 'string' ? _k.trim() : '';
      if (!_key) continue;
      if (_keys.indexOf(_key) < 0) _keys.push(_key);
    }
  }
  // THE NO-OP GUARANTEE: no spec key in the answer => no line, and the whole output stays
  // byte-identical. Deliberately not written as a separate "was there a spec row" flag - a
  // second guard for the SAME outcome would be unfalsifiable (LESSONS 66). F2's gate above is
  // a DIFFERENT question (is the whole answer spec-sourced?), not a second copy of this one,
  // and it has its own mutant.
  if (!_keys.length) return;
  // ── THE FILTER · matched_specs INTERSECT (spec_asked-keys UNION {class}) ──────────────
  // spec_asked is what the CUSTOMER asked for; matched_specs is what SCORED. A house
  // preference lands in the second and can never be in the first, which is what keeps an
  // unstated brand out of a sentence that reads as "your words matched this".
  const _asked = new Set();
  if (Array.isArray(_specRes.spec_asked)) {
    for (const _a of _specRes.spec_asked) {
      const _k = (_a && typeof _a === 'object' && typeof _a.key === 'string') ? _a.key
        : (typeof _a === 'string' ? _a : '');
      const _n = String(_k).trim().toLowerCase();
      if (_n) _asked.add(_n);
    }
  }
  // If `spec_asked` is ABSENT the endpoint predates CRM #142: nothing is asked-for, so only
  // `class` survives and the line degrades to the description form. That degradation is the
  // deployment TELL and is asserted (U8-14), not papered over with a fallback to the old
  // unfiltered behaviour - a fallback would make the deployed and undeployed states
  // indistinguishable at the customer boundary.
  const _selected = _keys.filter(k => { const n = k.toLowerCase(); return n === 'class' || _asked.has(n); });
  // Class leads: it is the noun the customer typed, and the qualifiers modify it. matched_specs
  // arrives sorted(), so first-seen order alone would bury it mid-sentence.
  const _ordered = _selected.filter(k => k.toLowerCase() === 'class')
    .concat(_selected.filter(k => k.toLowerCase() !== 'class'));
  // VALUES, from the first in-answer spec row that records the key. `display.specifications`
  // is values-only and may be null on the shape-B require path (CRM F9) - a missing key simply
  // drops out below.
  const _valueFor = (_k) => {
    for (const m of _specRows) {
      const _sp = m && m.display && m.display.specifications;
      if (_sp && typeof _sp === 'object' && !Array.isArray(_sp)
        && Object.prototype.hasOwnProperty.call(_sp, _k)) return _sp[_k];
    }
    return undefined;
  };
  // ── THE THREE-LINE HUMANISE RULE (conformance report DEV-1) ──────────────────────────
  // class verbatim, brand verbatim, everything else underscores-to-spaces + titlecase. The
  // branch exempts BOTH keys from the lower_snake enum pin because brand values carry real
  // spaces and case; re-casing "NO LOGO" or "SORENTO" rewrites the catalogue's own spelling.
  const _VERBATIM_KEYS = ['class', 'brand'];
  // TITLECASE PROPER — lower first, THEN capitalise. An uppercase-only pass would leave
  // "SORENTO" and "NO LOGO" untouched all by itself, which would make the class/brand
  // exemption an unfalsifiable guard (LESSONS §66: a mutant that cannot go red is a lie about
  // the assertion set). It is exempt because it is EXEMPT, and U8-7/U8-8/m24 prove it.
  const _title = (_s) => _s.replace(/_/g, ' ').toLowerCase()
    .replace(/\b[a-z]/g, (_c) => _c.toUpperCase()).trim();
  const _humanVal = (_k, _v) => {
    if (typeof _v === 'number' && isFinite(_v)) return String(_v);
    if (Array.isArray(_v)) {
      const _p = _v.map((_x) => _humanVal(_k, _x)).filter((_x) => typeof _x === 'string' && _x.length > 0);
      return _p.length ? _p.join(', ') : null;
    }
    if (typeof _v !== 'string') return null;      // boolean / object / null -> dropped, never guessed
    const _s = _v.trim();
    if (!_s) return null;
    return _VERBATIM_KEYS.indexOf(String(_k).toLowerCase()) >= 0 ? _s : _title(_s);
  };
  const _prettyKey = (_k) => String(_k).replace(/_/g, ' ').trim();
  const _parts = [];
  for (const _k of _ordered) {
    const _v = _humanVal(_k, _valueFor(_k));
    if (typeof _v !== 'string' || !_v.length) continue;
    _parts.push(_k.toLowerCase() === 'class' ? _v : `${_prettyKey(_k)}: ${_v}`);
  }
  const _and = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  userResponse += _parts.length
    ? `\n\n_Matched on: ${_and(_parts)}._`
    : '\n\n_Matched on your description._';
})();

// ── N-2 · name the qualifier we could not filter by (spec-answer-honesty) ────────────
// Silence must never pass as success. When the customer states a spec the catalogue does not
// record, the rows come back looking like a direct answer to a question that was never asked:
// measured, "...thickness 1.2mm" and "...thickness 1.0mm" returned a BYTE-IDENTICAL reply
// (execs 12303472 / 12303548, frozen in tests/offline/spec-answer-honesty/baselines/).
//
// Data-truth wording (plan decision §5.1): the spec ISN'T RECORDED for these products. Not
// "I couldn't filter" — that reads as a broken search and invites "then try again properly".
//
// `spec_unmet` is emitted only by the CRM's spec-search fallback and is `[]` when everything
// asked for was met, so this is a byte-identical no-op on every turn that works today. Runs
// on the ANSWERED happy path only, with the same guards as the friendly-domain suffix below.
// Deliberately contains NONE of crossdomain-compose's insertion markers ('Did you mean',
// 'Try:', 'Related products:', 'Here are the closest matches:', 'Would you like me to
// escalate'), so it cannot move where the cross-domain block lands.
(() => {
  const answered = !isEscalateBranch
    && includeResponse
    && !manualResponse
    && qf.message_type === 'business_query'
    && typeof userResponse === 'string'
    && userResponse.trim().length > 0
    && Array.isArray(last_result_set)
    && last_result_set.length > 0;
  if (!answered) return;
  const _re = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
  // C-2 forward-compat: when the CRM ships `unrecognized_terms` (a term it could not map to a
  // key at all) it is a DIFFERENT statement from "recorded nowhere", so it is read separately
  // and only used as a fallback source of names until its own wording lands.
  const _unmet = Array.isArray(_re.spec_unmet) ? _re.spec_unmet : [];
  if (_unmet.length === 0) return;
  // Wire shape is [{key, value}] (product_spec_search.py `unmet`). Tolerate a bare string or a
  // "key=value" spelling rather than rendering "[object Object]" at the customer.
  const _pretty = (k) => String(k ?? '').replace(/_/g, ' ').trim();
  const _named = [];
  for (const u of _unmet) {
    if (u == null) continue;
    if (typeof u === 'string') {
      const [k, v] = u.split('=');
      _named.push({ key: _pretty(k), value: v == null ? null : String(v).trim() });
    } else if (typeof u === 'object' && u.key != null) {
      _named.push({ key: _pretty(u.key), value: u.value == null ? null : String(u.value).trim() });
    }
  }
  if (_named.length === 0) return;
  const _shown = _named.slice(0, 3);   // cap, same spirit as the miss-token cap of 5
  const _and = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const _keyList = _and(_shown.map(x => x.key));
  const _isAre = _shown.length === 1 ? "isn't" : "aren't";
  // ── QUOTE THE CUSTOMER'S OWN SPAN, never the normalised value ────────────────────────
  // MEASURED at the customer boundary on clone d59c226c (tester run
  // tests/runs/spec-answer-honesty-SR-2-20260813.json): a customer who typed "1.0mm" was
  // told "...so I couldn't narrow by 1." The wire carries `value: 1.0` as the NUMBER 1
  // (String(1.0) === '1') and the CRM normalises everything to millimetres, so THE UNIT IS
  // NOT ON THE WIRE AT ALL. Rendered bare that is both a truncation and a different number
  // from the one asked for.
  // So the value is echoed from the customer's OWN MESSAGE or not at all: find the span in
  // their text whose numeric value equals the unmet value, preferring the form that carries
  // a unit, and print it verbatim ("1.0mm", "1.2 mm" - as typed). Fabricating "mm" would be
  // inventing data; printing "1" would be stating a number nobody asked for. When no span
  // exists the value is DROPPED and the key carries the sentence alone.
  // ONE definition, shared with the `query` field this slice now sends (raw-message.js).
  // Before the migration the identical accessor was hand-written here AND in build-body.js;
  // now that the same string decides what the CRM SEARCHES on, two spellings of it would be
  // LESSONS §63 waiting to happen. Probe U7-10 asserts both shipped artifacts carry the
  // byte-identical source.
  const _rawMsg = (() => { try { const _j = $('tf-message').first().json; return String((_j && _j.message && _j.message.message && (_j.message.message.text || (_j.message.message.attachment && _j.message.message.attachment.description))) || ''); } catch (_err) { return ''; } })();
  // Units the catalogue's spec keys actually carry. A WHITELIST on purpose: matching "any
  // letters after the number" would echo "2 sinks" as if it were a measurement.
  const _units = new Set(['mm', 'cm', 'm', 'mtr', 'meter', 'meters', 'metre', 'metres',
    'in', 'inch', 'inches', 'ft', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters',
    'kg', 'g', 'w', 'kw', 'v', 'bar', 'mpa', '"', "'"]);
  // ── REV 3 - WHICH span, not just any span (/codex-review, review section H) ──────────
  // Two selection defects, both mechanically reproduced against the deployed rev-2 body
  // before a line was changed. Neither crashes and neither moves which products come back;
  // both quote a span the customer did not mean, in the one sentence whose whole purpose is
  // to avoid misleading them:
  //   1. the "inside a code" guard rejected [0-9A-Za-z.] before the digits but NOT a code
  //      SEPARATOR, and /[0-9A-Za-z.]/.test('-') is false - so "do you have ABC-1.2MM in
  //      stock" rendered "...couldn't narrow by 1.2MM", quoting a part number back as if it
  //      were the customer's spec;
  //   2. the scan returned the FIRST span whose number matched, so "2m hose thickness 2mm"
  //      rendered "...couldn't narrow by 2m" for a THICKNESS of 2mm - a different unit
  //      family, a different quantity, stated as the customer's own.
  // The replacement is not a new invention: it is the CRM's own binding rule
  // (product_spec_search.py _resolve_quantities) - a number belongs to the key whose own
  // word sits NEAREST it, within _QUANTITY_BINDING_WINDOW = 20 characters, measured in
  // either direction. The registry synonyms are not on the wire, so the anchor set is the
  // unmet key's own words (and their plural). Where the CRM keeps the first of two equal
  // distances, this does NOT: a genuine tie is AMBIGUOUS and drops to "by it", because
  // guessing is exactly what produced both defects and silence is an approved outcome
  // (plan decision 5.1). No proximity information at all (the key's word is not in the
  // sentence, e.g. the CRM resolved it out of free_terms) keeps the rev-2 rule: prefer the
  // unit-carrying span, and require the survivors to agree.
  const _WINDOW = 20;
  const _isTokChar = (_c) => !!_c && /[0-9A-Za-z._\/-]/.test(_c);
  // A hyphen, underscore or slash does NOT end a token here - that is the whole point.
  // "ABC-1.2MM" is one part number; if anything outside the number (and the unit already
  // absorbed into the span) carries a letter, this is a code, not a measurement.
  const _crossesCode = (_s, _e) => {
    let _ts = _s, _te = _e;
    while (_ts > 0 && _isTokChar(_rawMsg.charAt(_ts - 1))) _ts--;
    while (_te < _rawMsg.length && _isTokChar(_rawMsg.charAt(_te))) _te++;
    return /[A-Za-z]/.test(_rawMsg.slice(_ts, _s) + _rawMsg.slice(_e, _te));
  };
  // The key's own words, normalised to [a-z0-9 ] so no regex escaping is needed, matched
  // whole-word with an optional plural ("bowl count" also anchors on "bowl"/"bowls").
  const _keyAnchors = (_k) => {
    const _out = [];
    const _norm = String(_k == null ? '' : _k).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!_norm || !_rawMsg) return _out;
    const _forms = [];
    if (_norm.length >= 3) _forms.push(_norm);
    for (const _w of _norm.split(' ')) if (_w.length >= 3 && _forms.indexOf(_w) < 0) _forms.push(_w);
    const _hay = _rawMsg.toLowerCase();
    for (const _f of _forms) {
      const _rx = new RegExp('\\b' + _f + '(?:s)?\\b', 'g');
      let _a;
      while ((_a = _rx.exec(_hay)) !== null) _out.push({ start: _a.index, end: _a.index + _a[0].length });
    }
    return _out;
  };
  const _numCands = (_n) => {
    const _out = [];
    const _rx = /\d+(?:\.\d+)?/g;
    let _m;
    while ((_m = _rx.exec(_rawMsg)) !== null) {
      const _s = _m.index;
      const _prev = _s > 0 ? _rawMsg.charAt(_s - 1) : '';
      if (_prev && /[0-9A-Za-z.]/.test(_prev)) continue;          // inside a code or a longer number
      if (!(Math.abs(Number(_m[0]) - _n) < 1e-9)) continue;       // a different quantity
      let _end = _s + _m[0].length;
      const _rest = _rawMsg.slice(_end);
      const _u = /^ ?([A-Za-z]{1,7}|"|')/.exec(_rest);
      const _hasUnit = !!(_u && _units.has(_u[1].toLowerCase())
        && !/[A-Za-z]/.test(_rest.charAt(_u[0].length)));
      if (_hasUnit) _end += _u[0].length;
      if (/[0-9A-Za-z]/.test(_rawMsg.charAt(_end))) continue;     // "1.2xyz" - never echo a partial token
      if (_crossesCode(_s, _end)) continue;                       // "ABC-1.2MM" is a part number
      _out.push({ start: _s, end: _end, text: _rawMsg.slice(_s, _end), unit: _hasUnit });
    }
    return _out;
  };
  const _pickSpan = (_cands, _k) => {
    if (!_cands.length) return null;
    let _pool = _cands;
    const _anchors = _keyAnchors(_k);
    if (_anchors.length) {
      const _scored = [];
      for (const _c of _cands) {
        let _best = Infinity;
        for (const _a of _anchors) {
          const _d = _c.start >= _a.end ? _c.start - _a.end : _a.start - _c.end;
          if (_d >= 0 && _d < _best) _best = _d;
        }
        if (_best <= _WINDOW) _scored.push({ c: _c, d: _best });
      }
      if (!_scored.length) return null;                           // nothing sits near the key
      const _min = Math.min(..._scored.map(_x => _x.d));
      _pool = _scored.filter(_x => _x.d === _min).map(_x => _x.c);
    } else {
      const _withUnit = _pool.filter(_c => _c.unit);
      if (_withUnit.length) _pool = _withUnit;
    }
    const _texts = _pool.map(_c => _c.text).filter((_t, _i, _a) => _a.indexOf(_t) === _i);
    return _texts.length === 1 ? _texts[0] : null;                // a genuine tie is AMBIGUOUS
  };
  const _spanFor = (v, _k) => {
    const _v = v == null ? '' : String(v).trim();
    // A boolean is not a quantity anyone typed - "couldn't narrow by true" is worse than
    // silence - and it must not be echoed just because the WORD appears in the message.
    if (!_v || !_rawMsg || _v === 'true' || _v === 'false') return null;
    if (/^\d+(?:\.\d+)?$/.test(_v)) return _pickSpan(_numCands(Number(_v)), _k);
    // Non-numeric (a material, a finish): echo it only if the customer actually wrote it,
    // in THEIR casing. A CRM-normalised spelling they never typed falls back.
    const _i = _rawMsg.toLowerCase().indexOf(_v.toLowerCase());
    if (_i < 0) return null;
    const _b = _i > 0 ? _rawMsg.charAt(_i - 1) : '';
    const _a = _rawMsg.charAt(_i + _v.length);
    if ((_b && /[0-9A-Za-z]/.test(_b)) || (_a && /[0-9A-Za-z]/.test(_a))) return null;
    if (_crossesCode(_i, _i + _v.length)) return null;             // "ABC-STEEL-X" is a code too
    return _rawMsg.substr(_i, _v.length);
  };
  // ALL-OR-NOTHING, so the key list and the value list can never desync and half a list can
  // never attribute a number to the customer that they did not write. Deduped: two keys that
  // failed on the same span read "thickness and depth ... by 1.2mm", not "by 1.2mm and 1.2mm".
  const _spans = _shown.map(x => _spanFor(x.value, x.key));
  const _quotable = _spans.every(s => typeof s === 'string' && s.length > 0);
  const _tail = _quotable
    ? `so I couldn't narrow by ${_and(_spans.filter((s, i, a) => a.indexOf(s) === i))}.`
    : (_shown.length === 1 ? "so I couldn't narrow by it." : "so I couldn't narrow by them.");
  userResponse += `\n\n${_keyList} ${_isAre} recorded for these products, ${_tail}`;
})();

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
  // ── a token whose WORDS FED SPEC SEARCH was answered by it (spec-answer-honesty N-3) ──
  // SIXTH surface of the class §67 names, and the first one where the answer arrives on a
  // DIFFERENT resolution than the token. The CRM appends a new resolution keyed on
  // `payload.query` (the parser's restatement) carrying every `match_tier: "spec_search"`
  // row, and leaves the customer's own raw on a resolution with `matches: []`
  // (references.py `_emit_spec_matches`). `_tokenWasAnswered` reads the token's OWN
  // candidates, finds none, and the raw is reported missing UNDERNEATH the answer its own
  // words produced. Measured shape frozen in tests/offline/spec-answer-honesty/baselines/.
  //
  // Outcome-keyed, not mechanism-keyed: ANY spec_search row in the answer means the
  // descriptive words were answered. Scoped by the code-shape rule, which the CRM now shares
  // (`references.py` _is_code_shaped: a code-shaped unresolved token is NEVER cleared, even
  // beside a full spec answer) — so an unknown CODE still surfaces its own miss (UAC SR-U5)
  // and a mixed hit+miss turn renders BOTH. Zero spec_search rows in the answer => inert.
  const _notCodeShaped = (_e) => (Array.isArray(_e) ? _e : []).map(x => String((x && x.raw) || '').trim()).filter(v => v.length > 0 && !(/[0-9]/.test(v) && /^[A-Za-z][A-Za-z][A-Za-z0-9._\/\-‐-―−﹘﹣－]*$/.test(v))).filter((v, i, a) => a.indexOf(v) === i);
  const _specSearchAnswered = (() => {
    if (!_answerCodes.size) return false;
    const _rows = [];
    if (Array.isArray(r?.resolutions)) {
      for (const _res of r.resolutions) if (Array.isArray(_res?.matches)) _rows.push(..._res.matches);
    }
    if (Array.isArray(r?.intersection)) _rows.push(...r.intersection);
    return _rows.some(m => String(m?.match_tier ?? '').toLowerCase() === 'spec_search'
      && [m && m.uuid, m && m.canonical_code]
        .some(v => { const k = String(v ?? '').trim().toLowerCase(); return k && _answerCodes.has(k); }));
  })();
  const _tokenReachedSpecSearch = (tok) => _specSearchAnswered && _notCodeShaped([{ raw: tok }]).length > 0;
  // ── F1 · the CRM's own QUERY-KEYED resolution is NOT a customer token ────────────────
  // Since spec-raw-text-migration `query` IS the customer's whole sentence, the resolution
  // the CRM appends for it comes back with `token` == that sentence (MEASURED, exec 12597847:
  // `resolutions[2].token === "SRTWC286 and wall hung basin"`). Every renderer that groups
  // misses BY TOKEN then prints the customer's own question back at them as a failed search
  // term (MEASURED at the customer boundary, exec 12597815). It is not a customer entity:
  // n8n never sent it.
  //
  // Keyed on WHAT WE SENT. `resolve-entity-http` builds its `tokens` from exactly
  // `qf.entities[].raw`, so the sent set is decidable HERE without trusting anything the CRM
  // echoes back — and every CRM-derived probe token (the appended query resolution, and any
  // `_synthesize_alpha_tokens` split of the sentence) falls outside it by construction.
  //
  // FAIL-OPEN, deliberately (UAC SR-U5: a genuine miss must never be silenced). When we sent
  // NO tokens at all the set cannot discriminate, so the rule narrows to the raw turn text
  // itself; and when neither the entity set nor the turn text is available, nothing is
  // suppressed.
  const _sentTokens = (() => {
    const s = new Set();
    for (const e of (Array.isArray(qf.entities) ? qf.entities : [])) {
      const k = String((e && e.raw) ?? '').trim().toLowerCase();
      if (k) s.add(k);
    }
    return s;
  })();
  const _rawTurn = String((() => { try { const _j = $('tf-message').first().json; return String((_j && _j.message && _j.message.message && (_j.message.message.text || (_j.message.message.attachment && _j.message.message.attachment.description))) || ''); } catch (_err) { return ''; } })() ?? '').trim().toLowerCase();
  const _isDerivedQueryToken = (tok) => {
    const k = String(tok ?? '').trim().toLowerCase();
    if (!k) return false;
    if (_sentTokens.size) return !_sentTokens.has(k);
    return !!_rawTurn && k === _rawTurn;
  };
  let missResolutions = [];
  if (Array.isArray(r?.resolutions)) {
    missResolutions = r.resolutions.filter(res => res && res.resolved !== true
      && !(Array.isArray(res.matches) && res.matches.some(isExact))
      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
      && !_isDerivedQueryToken(res.token)
      && !_tokenReachedSpecSearch(res.token)
      && !_tokenWasAnswered(res));
  } else if (unresolved.length && !_tokenWasAnswered(r)) {
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
// brand-company-routing: routing axes for the escalation turn (report §5.2; null-inert for replay norm)
{
  const _g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : null; } catch (e) { return null; } })();
  const _prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
  const _sameTeam = _prev && _prev.routing && qf.routing && _prev.routing.suggested_team === qf.routing.suggested_team;
  const _fresh = _g && Array.isArray(_g.routing_companies) && _g.routing_companies.length > 0;
  // The roster plan ACTUALLY used by get-cs-members this turn — the (company_id, brand_code) pairs the
  // offered members were fetched with. escalation-context reads this back so the pool assigned from is the
  // pool shown; it is the single definition of pool identity, never re-derived from routing_brand.
  const _planItems = (() => { try { const n = $('cs-roster-plan'); return n.isExecuted ? n.all().map(i => i.json) : null; } catch (e) { return null; } })();
  output.variables.routing_roster_plan = (Array.isArray(_planItems) && _planItems.length)
    ? _planItems.map((p, i) => ({ plan_idx: (p && p.plan_idx != null) ? p.plan_idx : i, company_id: (p && p.company_id) || null, company_name: (p && p.company_name) || null, brand_code: (p && p.brand_code) || null }))
    : (_sameTeam && Array.isArray(_prev.routing_roster_plan) ? _prev.routing_roster_plan : null);
  output.variables.routing_brand        = _fresh ? (_g.routing_brand ?? null)        : (_sameTeam ? (_prev.routing_brand ?? null) : null);
  output.variables.routing_brand_source = _fresh ? (_g.routing_brand_source ?? null) : (_sameTeam ? (_prev.routing_brand_source ?? null) : null);
  output.variables.routing_company      = _fresh ? (_g.routing_company ?? null)      : (_sameTeam ? (_prev.routing_company ?? null) : null);
  output.variables.routing_companies    = _fresh ? _g.routing_companies              : (_sameTeam && Array.isArray(_prev.routing_companies) ? _prev.routing_companies : null);
}
return output;

