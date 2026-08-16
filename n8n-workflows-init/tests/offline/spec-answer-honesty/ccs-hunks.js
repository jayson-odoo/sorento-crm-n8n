// ── SR N-2 + N-3 · the compile-current-state hunks — SINGLE SOURCE OF TRUTH ─────────────
// spec-answer-honesty-plan §1 (SR-1). These strings are what `build-ccs.js` splices into the
// frozen BEFORE body to produce the bytes that get PUT. Nothing is hand-typed into the node.
//
// The N-3 hunk imports the code-shape rule from `../spec-shapeA/free-terms.js`
// (CLASSIFIER_SRC) — the same string the shipped `free_terms` expression uses — so "was this
// token one of the words we sent to spec search" has exactly ONE definition in this repo.

const { CLASSIFIER_SRC, CLASSIFIER_TRANSPORT } = require('../spec-shapeA/free-terms.js');
const { RAW_MESSAGE_SRC } = require('./raw-message.js');
const { derivedTokenSrc } = require('./derived-token.js');

// ── N-3 · a token whose words FED spec search was answered by it ────────────────────────
// Inserted immediately before `let missResolutions = [];`, and the filter gains one clause.
//
// SIXTH surface of the class §67 names. The fifth patch (`_tokenWasAnswered`) keys on the
// token's OWN candidates appearing in the answer. Spec rows do not arrive that way: the CRM
// APPENDS a NEW resolution keyed on `payload.query` — the parser's restatement — and leaves
// the customer's own raw sitting on a resolution with `matches: []`
// (`references.py:_emit_spec_matches`, `result.setdefault("resolutions", []).append(...)`).
// So the raw reads as a genuine miss and gets `"..." - not found.` printed UNDER the answer
// its own words produced.
//
// OUTCOME-KEYED, per §67: the invariant is not "the query-token mechanism", it is *a
// spec_search row in the answer means the descriptive words were answered*. A seventh
// mechanism that promotes free terms needs no seventh patch here.
//
// SCOPED so it cannot mute a genuine miss (UAC SR-U5): only NON-CODE-SHAPED tokens are covered.
// An unknown code (`SRTZZ999`) sitting beside a spec answer is therefore still surfaced.
//
// ⚠️ RE-JUSTIFIED FOR THE RAW-TEXT MIGRATION (spec-raw-text-migration, DEV-2). The scoping used
// to mean "these are the words we put in `free_terms`". `free_terms` is gone: the customer's
// WHOLE sentence now rides in `query` and reaches the spec deriver, so every word arguably fed
// spec search. The code-shape rule survives because the CRM adopted the SAME carve-out on its
// side — `references.py:1953-1957` clears an unresolved token only when every content word of
// it appears in a shown row, and `_is_code_shaped(t)` tokens are NEVER cleared. So a code the
// customer typed is guaranteed to come back in `unresolved_tokens` beside a full spec answer,
// and N-3 must not mute it. The predicate is therefore renamed to what it actually tests
// (`_notCodeShaped`) rather than to the deleted field it used to describe (LESSONS §70b: a name
// that promises more than the mechanism delivers is its own defect).
//
// N-3 STAYS AT FULL STRENGTH. The frozen contract had it demoted to belt-and-braces once the
// CRM stripped caller-`free_terms` from the footer; review finding F2 REPLACED that mechanism
// with a stricter word-level rule that consults no caller field at all, so N-3 is once again
// the ONLY guard for a token the CRM's rule declines to clear.
//
// The spec_search row must be IN THE ANSWER, not merely present in the resolver payload:
// `_answerCodes` is built from `disallowed-entity-gate.compatible_entities`, which is the list
// the customer was actually shown. `compatible_entities` carries only `{uuid, entity_type,
// code}` (measured, exec 12303548) — no `match_tier` — so the tier has to be read off the
// resolver matches and joined to the answer set by uuid/code.
const N3_DECL = `  // ── a token whose WORDS FED SPEC SEARCH was answered by it (spec-answer-honesty N-3) ──
  // SIXTH surface of the class §67 names, and the first one where the answer arrives on a
  // DIFFERENT resolution than the token. The CRM appends a new resolution keyed on
  // \`payload.query\` (the parser's restatement) carrying every \`match_tier: "spec_search"\`
  // row, and leaves the customer's own raw on a resolution with \`matches: []\`
  // (references.py \`_emit_spec_matches\`). \`_tokenWasAnswered\` reads the token's OWN
  // candidates, finds none, and the raw is reported missing UNDERNEATH the answer its own
  // words produced. Measured shape frozen in tests/offline/spec-answer-honesty/baselines/.
  //
  // Outcome-keyed, not mechanism-keyed: ANY spec_search row in the answer means the
  // descriptive words were answered. Scoped by the code-shape rule, which the CRM now shares
  // (\`references.py\` _is_code_shaped: a code-shaped unresolved token is NEVER cleared, even
  // beside a full spec answer) — so an unknown CODE still surfaces its own miss (UAC SR-U5)
  // and a mixed hit+miss turn renders BOTH. Zero spec_search rows in the answer => inert.
  const _notCodeShaped = ${CLASSIFIER_TRANSPORT};
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
  // Since spec-raw-text-migration \`query\` IS the customer's whole sentence, the resolution
  // the CRM appends for it comes back with \`token\` == that sentence (MEASURED, exec 12597847:
  // \`resolutions[2].token === "SRTWC286 and wall hung basin"\`). Every renderer that groups
  // misses BY TOKEN then prints the customer's own question back at them as a failed search
  // term (MEASURED at the customer boundary, exec 12597815). It is not a customer entity:
  // n8n never sent it.
  //
  // Keyed on WHAT WE SENT. \`resolve-entity-http\` builds its \`tokens\` from exactly
  // \`qf.entities[].raw\`, so the sent set is decidable HERE without trusting anything the CRM
  // echoes back — and every CRM-derived probe token (the appended query resolution, and any
  // \`_synthesize_alpha_tokens\` split of the sentence) falls outside it by construction.
  //
  // FAIL-OPEN, deliberately (UAC SR-U5: a genuine miss must never be silenced). When we sent
  // NO tokens at all the set cannot discriminate, so the rule narrows to the raw turn text
  // itself; and when neither the entity set nor the turn text is available, nothing is
  // suppressed.
${derivedTokenSrc('qf').replace(/\n$/, '')}
`;

const N3_ANCHOR = '  let missResolutions = [];\n';

const N3_FILTER_BEFORE =
  "      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())\n";
const N3_FILTER_AFTER =
  "      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())\n" +
  "      && !_isDerivedQueryToken(res.token)\n" +
  "      && !_tokenReachedSpecSearch(res.token)\n";

// ── THE LEGACY ARM IS DELIBERATELY NOT TOUCHED — the clause would be dead code ───────────
// A first draft added `&& !unresolved.every(t => _tokenReachedSpecSearch(t))` to the legacy
// single-resolution arm too. SR-U5-7 showed it can never fire, so it was DELETED rather than
// shipped with a test that cannot go red (LESSONS §66: a surviving mutant is a claim about
// your fixtures, and when the claim is "this code does nothing", the fix is to delete it).
//
// The proof is short. The legacy arm runs only when `r.resolutions` is NOT an array, so the
// only place a spec_search row can live is `r.intersection`. `_specSearchAnswered` requires
// such a row to also be in `_answerCodes`; `_tokenWasAnswered(r)` reads `r.intersection`
// against the SAME `_answerCodes`. So `_specSearchAnswered => _tokenWasAnswered(r)` on this
// shape, and the existing fifth-patch guard has already returned before the new clause is
// reached. SR-U5-6/U5-7 pin both halves of that, against the pre-fix body as well.

// ── N-2 · say what was ignored ──────────────────────────────────────────────────────────
// Appended right after the answer rows and BEFORE the friendly-domain P/S suffix, so the
// caveat sits with the answer it qualifies rather than under a generic tip or under a
// did-you-mean footer.
//
// WORDING IS THE DATA-TRUTH FORM, decision §5.1 — the spec ISN'T RECORDED, not "the search
// failed". Blame-the-search phrasing invites "then try again properly"; the catalogue simply
// does not carry the value for these products.
//
// SHAPE, measured not guessed: `spec_unmet` is a list of OBJECTS `{key, value}`
// (product_spec_search.py `unmet`, computed over `asked` = extracted_specs + the registry
// resolution of free_terms). UAC SR.md's `spec_unmet: ["thickness=1.2"]` is a placeholder —
// the real wire shape is objects, and this hunk reads both defensively.
//
// `spec_unmet` only exists on a response where the CRM ran spec search, and it is `[]` when
// everything asked for was met, so on every turn that works today this block is a pure no-op.
const N2_ANCHOR = `// ── friendly domain disclaimers`;

const N2_BLOCK = `// ── N-2 · name the qualifier we could not filter by (spec-answer-honesty) ────────────
// Silence must never pass as success. When the customer states a spec the catalogue does not
// record, the rows come back looking like a direct answer to a question that was never asked:
// measured, "...thickness 1.2mm" and "...thickness 1.0mm" returned a BYTE-IDENTICAL reply
// (execs 12303472 / 12303548, frozen in tests/offline/spec-answer-honesty/baselines/).
//
// Data-truth wording (plan decision §5.1): the spec ISN'T RECORDED for these products. Not
// "I couldn't filter" — that reads as a broken search and invites "then try again properly".
//
// \`spec_unmet\` is emitted only by the CRM's spec-search fallback and is \`[]\` when everything
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
  // C-2 forward-compat: when the CRM ships \`unrecognized_terms\` (a term it could not map to a
  // key at all) it is a DIFFERENT statement from "recorded nowhere", so it is read separately
  // and only used as a fallback source of names until its own wording lands.
  const _unmet = Array.isArray(_re.spec_unmet) ? _re.spec_unmet : [];
  if (_unmet.length === 0) return;
  // Wire shape is [{key, value}] (product_spec_search.py \`unmet\`). Tolerate a bare string or a
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
  // told "...so I couldn't narrow by 1." The wire carries \`value: 1.0\` as the NUMBER 1
  // (String(1.0) === '1') and the CRM normalises everything to millimetres, so THE UNIT IS
  // NOT ON THE WIRE AT ALL. Rendered bare that is both a truncation and a different number
  // from the one asked for.
  // So the value is echoed from the customer's OWN MESSAGE or not at all: find the span in
  // their text whose numeric value equals the unmet value, preferring the form that carries
  // a unit, and print it verbatim ("1.0mm", "1.2 mm" - as typed). Fabricating "mm" would be
  // inventing data; printing "1" would be stating a number nobody asked for. When no span
  // exists the value is DROPPED and the key carries the sentence alone.
  // ONE definition, shared with the \`query\` field this slice now sends (raw-message.js).
  // Before the migration the identical accessor was hand-written here AND in build-body.js;
  // now that the same string decides what the CRM SEARCHES on, two spellings of it would be
  // LESSONS §63 waiting to happen. Probe U7-10 asserts both shipped artifacts carry the
  // byte-identical source.
  const _rawMsg = ${RAW_MESSAGE_SRC};
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
  const _isTokChar = (_c) => !!_c && /[0-9A-Za-z._\\/-]/.test(_c);
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
      const _rx = new RegExp('\\\\b' + _f + '(?:s)?\\\\b', 'g');
      let _a;
      while ((_a = _rx.exec(_hay)) !== null) _out.push({ start: _a.index, end: _a.index + _a[0].length });
    }
    return _out;
  };
  const _numCands = (_n) => {
    const _out = [];
    const _rx = /\\d+(?:\\.\\d+)?/g;
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
    if (/^\\d+(?:\\.\\d+)?$/.test(_v)) return _pickSpan(_numCands(Number(_v)), _k);
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
    ? \`so I couldn't narrow by \${_and(_spans.filter((s, i, a) => a.indexOf(s) === i))}.\`
    : (_shown.length === 1 ? "so I couldn't narrow by it." : "so I couldn't narrow by them.");
  userResponse += \`\\n\\n\${_keyList} \${_isAre} recorded for these products, \${_tail}\`;
})();

`;

// ── N-1a · the "Matched on" line — VALUES, filtered by what the customer ASKED ──────────
// SR-1b built this as KEY NAMES ONLY, because on the pre-#142 wire a spec row carried
// `display.matched_specs` (registry key names) and no values at all. CRM PR #142 ships two
// fields that change both halves of that sentence, and this slice consumes them:
//
//   `display.specifications`  — compact VALUES-only block, `{"value":1.2,"unit":"mm"}`
//                               unwrapped to `1.2` (product_spec_search.py `values_only`).
//                               Lists stay lists, numbers stay numbers.
//   top-level `spec_asked`    — `[{key, value}]`, the qualifier keys the CUSTOMER asked for
//                               (product_spec_search.py `asked_for`), house preferences
//                               structurally absent.
//
// ── THE FILTER: `matched_specs ∩ (spec_asked-keys ∪ {class})` ───────────────────────────
// This is the recorded S4 upgrade, and it also RETIRES the SR-1b honesty finding rather than
// documenting it a second time. `matched_specs` means "keys that scored", NOT "keys the
// customer asked about": product_spec_search.py:1006-1013 appends a HOUSE-PREFERENCE key to
// the match set precisely when the customer did NOT state it (`if key in stated: continue`),
// so a standing "our own brand first" weighting could put `brand` into a line that reads as
// *"here is what your words matched"*. The intersection deletes that class of defect at the
// root: a preference key can never be in `spec_asked`, because a preference only ever applies
// to an UNSTATED key. SR-11's "record the key set verbatim, a house-preference key is a review
// trigger" instruction is therefore retired — there is nothing left to review by hand.
//
// `class` is unioned back in because it is customer-earned and can never arrive through
// `spec_asked` on the deterministic path: the registry `class` row ships `"synonyms": {}`, so
// "kitchen sink" reaches the ranker as a free term and scores through `implied_classes`, which
// appends `"class"` to `matched` and never to `specs`. ⚠️ Per the conformance report's
// addendum, `class ∉ spec_asked` is an ARTEFACT of the deterministic path, NOT an invariant —
// with `understand_phrase: true` the model may return `{"key":"class",...}` and it flows
// straight into `asked_for`. The UNION is correct under BOTH readings and must never be
// "simplified" into an assertion that class is absent.
//
// `free_terms` needs no special case any more: it is machinery, it can never be in
// `spec_asked` (it is appended to `matched`, never to `specs`) and it is not `class`, so the
// intersection drops it structurally. The old `_MACHINERY_KEYS` list is DELETED rather than
// kept as a belt — two mechanisms suppressing one outcome is exactly what makes both of their
// tests stop being evidence (LESSONS §64).
//
// ── THE HUMANISE RULE IS THREE LINES, NOT TWO (conformance report DEV-1) ────────────────
// The frozen contract said `class` verbatim + everything else `replace('_',' ')` + titlecase.
// The branch pins the lower_snake enum format with `{class, brand}` exempt, not `{class}`:
// brand values legitimately carry spaces and case — "American Standard", and "NO LOGO", a real
// catalogue value this PR deliberately made bindable. Blind-humanising rewrites the
// catalogue's own spelling ("SORENTO" -> "Sorento", "NO LOGO" -> "No Logo") in customer-facing
// text, which is the same fabrication this whole change exists to prevent. So: `class`
// verbatim, `brand` verbatim, everything else humanised.
//
// ⚠️ The enum-format guarantee is a pytest over SEEDED registry rows, not a registry-side
// constraint — a UI synonym edit can break it in production with no guard firing (CRM PR #160
// builds the validator; not merged at build time). The renderer therefore never DEPENDS on the
// format: `replace('_',' ')` + titlecase is idempotent on an already-spaced value.
//
// ── CLASS RENDERS AS ITS VALUE, AND FIRST ──────────────────────────────────────────────
// "class" as a key name tells the customer nothing; the VALUE is the noun they typed. It is
// emitted bare ("Kitchen Sink") and first, because the class is the thing and the qualifiers
// modify it — `matched_specs` arrives `sorted(set(...))`, so first-seen order alone would bury
// it mid-sentence between `bowl_count` and `free_terms`.
//
// ── UNRENDERABLE VALUES ARE DROPPED, NEVER GUESSED ─────────────────────────────────────
// Strings, finite numbers and lists of those render. A boolean, an object, `null`, or a key
// absent from `specifications` (which is `null` outright on the shape-B require path, F9)
// drops that key from the line. No key-name fallback: printing a bare key beside rendered
// values would be a second rendering rule, and "Matched on: has overflow" states nothing.
//
// THE NO-OP GUARANTEE IS UNCHANGED. No in-answer spec row contributes a key => NO line, output
// byte-identical. Code turns, stock turns, order turns and escalations are untouched.
const N1A_BLOCK = `// ── N-1a · say WHAT matched, on spec answers only (spec-raw-text-migration) ──────────
// The customer described a product in their own words and got five codes back with no
// indication of WHICH part of their description did the work — so a wrong assumption on our
// side and a right answer look identical to them.
//
// THE RULE: \`matched_specs ∩ (spec_asked-keys ∪ {class})\`, rendered as VALUES.
//   * \`spec_asked\` (CRM #142) is what the CUSTOMER asked for. Intersecting with it is what
//     keeps a HOUSE-PREFERENCE key out of a line that reads as "your words matched this" —
//     product_spec_search.py appends a preferred key to \`matched_specs\` exactly when the
//     customer did NOT state it, so it can never be in \`spec_asked\`. That is also why
//     \`free_terms\` needs no exclusion list: it is machinery, never in \`spec_asked\`.
//   * \`class\` is unioned back because it is customer-earned but structurally cannot arrive
//     through \`spec_asked\` on the deterministic path (the registry \`class\` row ships no
//     synonyms, so the phrase scores through \`implied_classes\`). It is NOT safe to assert
//     class is absent from \`spec_asked\` — with understand_phrase the model can put it there.
//   * VALUES come from \`display.specifications\` (CRM #142) — the compact values-only block.
//
// HUMANISING IS THREE LINES, NOT TWO: \`class\` verbatim, \`brand\` verbatim, everything else
// underscores-to-spaces + titlecase. Brand values carry real spaces and case ("NO LOGO",
// "American Standard"); re-casing them rewrites the catalogue's own spelling at the customer.
//
// \`class\` renders as its VALUE, never the key name, and leads the sentence.
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
  // Named \`_specRes\`, not \`_re\`: N-2 below binds the same node to \`_re\`, and two identical
  // three-line openings would make the N-2 mutation anchors ambiguous (mutate.sh m8 VOIDs on a
  // duplicated anchor - which is the guard working, but a suite that cannot mutate N-2 is not
  // a suite). The names differ so each block stays independently addressable.
  const _specRes = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
  // The rows the customer was actually shown. Same construction as N-3's \`_answerCodes\`:
  // \`compatible_entities\` carries {uuid, entity_type, code} and no match_tier, so the tier is
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
  // \`_Matched on: mounting: Wall Hung._\` - true of 5 rows and false of 10. Substitute a
  // product attribute and it sharpens: "SRTWC286 and 1.2mm sink" would invite the customer to
  // read the SRTWC286 rows as 1.2mm.
  //
  // So: emit ONLY when EVERY row the customer was shown is a spec_search row. A partial
  // attribution is not a weaker claim, it is a false one, and the whole SR family exists to
  // stop exactly that. Mixed => no line at all; the spec rows are still shown, they are simply
  // not described. Same join as \`_inAnswer\`, so "in the answer" and "the whole answer" cannot
  // disagree about what the answer is.
  //
  // Stated bound: a shown entity that is not a product spec row (a category or brand row lifted
  // into \`compatible_entities\`) also suppresses. That is the conservative direction and it is
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
  // If \`spec_asked\` is ABSENT the endpoint predates CRM #142: nothing is asked-for, so only
  // \`class\` survives and the line degrades to the description form. That degradation is the
  // deployment TELL and is asserted (U8-14), not papered over with a fallback to the old
  // unfiltered behaviour - a fallback would make the deployed and undeployed states
  // indistinguishable at the customer boundary.
  const _selected = _keys.filter(k => { const n = k.toLowerCase(); return n === 'class' || _asked.has(n); });
  // Class leads: it is the noun the customer typed, and the qualifiers modify it. matched_specs
  // arrives sorted(), so first-seen order alone would bury it mid-sentence.
  const _ordered = _selected.filter(k => k.toLowerCase() === 'class')
    .concat(_selected.filter(k => k.toLowerCase() !== 'class'));
  // VALUES, from the first in-answer spec row that records the key. \`display.specifications\`
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
    .replace(/\\b[a-z]/g, (_c) => _c.toUpperCase()).trim();
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
    _parts.push(_k.toLowerCase() === 'class' ? _v : \`\${_prettyKey(_k)}: \${_v}\`);
  }
  const _and = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  userResponse += _parts.length
    ? \`\\n\\n_Matched on: \${_and(_parts)}._\`
    : '\\n\\n_Matched on your description._';
})();

`;

module.exports = {
  N3_DECL, N3_ANCHOR, N3_FILTER_BEFORE, N3_FILTER_AFTER,
  N2_ANCHOR, N2_BLOCK, N1A_BLOCK, CLASSIFIER_SRC, CLASSIFIER_TRANSPORT,
};
