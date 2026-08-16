// ── SR offline probe — UAC tests/uac/SR.md, units SR-U1..SR-U8 (+ D gates) ──────────────
//
//   node probe.js
//
// ⚠️ SUPERSEDED-SLICE NOTE (spec-raw-text-migration, 2026-08-15). `free_terms` is GONE from
// the shipped request: `query` now carries the customer's raw text and feeds both the normal
// resolve probes and the spec deriver (CRM #142, conformance report DEV-3). So:
//   * SR-U1 is no longer "the free-terms builder". It is the RETIREMENT proof — the N-0
//     expression must be ABSENT from the shipped bytes and `free_terms` must not be on the
//     wire. Keeping the old builder assertions would have been assertions about deleted code.
//   * SR-U7 is the new unit: what `query` sends, and what it falls back to.
//   * SR-U6 now asserts VALUES, not key names, and SR-U8 covers the `spec_asked` filter, the
//     three-line humanise rule (class/brand verbatim) and the not-deployed degradation.
//
// Doctrine, all of it earned:
//   * every assertion takes a THUNK so a throwing body is a FAILURE, not a crashed suite (§72)
//   * the CLASSIFIER is imported from ../spec-shapeA/free-terms.js — one definition, no re-type
//   * `before` reads a FROZEN pre-fix body, `after` reads the builder output (§69)
//   * D1 proves the deployed bytes ARE the tested bytes, with THREE outcomes (§64)
//   * every "answered" case also asserts the reply carries NO other section's marker (§68)
//
// STATED HONESTLY, because it changes what a green here means:
// SR-U3/SR-U5 exercise a resolver envelope that NO recorded execution produced. All four frozen
// baselines took the AND path, where the CRM REPLACES `intersection` and appends exactly one
// query-keyed resolution, so no per-raw miss resolution survives to be suppressed. The shape
// tested here is the CRM's own OR-rewrite path (`references.py:_emit_spec_matches` -> `result
// .setdefault("resolutions", []).append(spec_resolution)` over an existing per-token
// `resolutions` array), reachable when the AND probes match NOTHING or when the parser emits
// `match_mode: "or"` with all-zero matches. It is a MODEL of live, not a recording of it.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { CLASSIFIER_SRC, CLASSIFIER_TRANSPORT, freeTerms, freeTermsTransport } = require('../spec-shapeA/free-terms.js');
const { MSG_TERM_SRC, FREE_TERMS_SRC } = require('./msg-term.js');
const { RAW_MESSAGE_SRC } = require('./raw-message.js');
const { renderJson } = require('../spec-shapeA/render-body.js');
const H = require('./ccs-harness.js');
const BSO = require('./bso-harness.js');

const DIR = __dirname;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// 🔴 BUILT ARTIFACTS MUST BE READ THROUGH HERE, NEVER THROUGH `read`.
// mutate.sh perturbs a SCRATCH COPY and points OFFLINE_NODES_DIR at it. The first cut of this
// suite asserted N-0 against the `msg-term.js` MODULE instead of the built body, so five
// mutants that genuinely broke the shipped expression came back SURVIVED — the assertions
// were sound and pointed at the wrong OBJECT (LESSONS §63), inside the very instrument built
// to prove the assertions can fail (LESSONS §72). The mutation gate is what found it.
const BUILT_DIR = process.env.OFFLINE_NODES_DIR || DIR;
const readBuilt = (f) => fs.readFileSync(path.join(BUILT_DIR, f), 'utf8');
const BODY = () => readBuilt('resolve-entity-http.after.jsonBody.txt');

// Fixture nodes for the jsonBody renderer — shape lifted from clone exec 12303548.
const nodesFor = (entities, text) => ({
  "Call 'sub-query-reformulator'": [{
    output: {
      user_goal: 'trying to get a double bowl kitchen sink with thickness 1.2mm',
      match_mode: 'and', domain_hint: 'master_products', entities, access_levels: ['End User'],
    },
  }],
  'tf-message': [{ message: { message: { text, type: 'text', attachment: { type: 'text', description: '' } } }, replyTo: {} }],
});
// THE values the node actually sends, evaluated from the BUILT BYTES.
const shippedJson = (entities, text) => renderJson(BODY(), nodesFor(entities, text)).json;
const shippedQuery = (entities, text) => shippedJson(entities, text).query;

let pass = 0, fail = 0;
function ok(name, thunk) {
  let v;
  try { v = thunk(); } catch (e) { fail++; console.log(`FAIL ${name}\n       threw: ${e.message}`); return; }
  if (v) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}
function eq(name, thunk, want) {
  let g;
  try { g = thunk(); } catch (e) { fail++; console.log(`FAIL ${name}\n       threw: ${e.message}`); return; }
  const a = JSON.stringify(g), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}\n       got  ${a}\n       want ${b}`); }
}

// Markers of every OTHER section a reply can carry (LESSONS §68: add the negative to the
// positive — a renderer suite that only checks for presence cannot see an intruder).
const FOREIGN = ["Couldn't find these", 'did you mean', 'Multiple matches found',
                 'Would you like me to escalate', 'Related products:', 'Here are the closest matches:'];
const noForeign = (s, except = []) =>
  FOREIGN.filter(m => !except.includes(m)).every(m => !String(s).includes(m));

// ── SR-1b · N-1a made nine "byte-identical to pre-fix" assertions WRONG, on purpose ──────
// LESSONS §73 rule 1: when you widen what something does, re-read every assertion that
// mentions it — including the ones that pass. Nine N-2/N-3 no-op assertions compared the
// whole output against the PRE-SR body on fixtures that carry spec rows IN THE ANSWER, which
// is exactly where N-1a is now supposed to add a line. Their job was always "N-2 rendered
// nothing here"; that job survives, the whole-object comparison does not.
//
// So: subtract the ONE line N-1a is contractually allowed to add — the EXACT string, not a
// pattern — and require it to be there exactly once. A malformed or duplicated N-1a line
// makes this THROW, i.e. the assertion still goes red rather than swallowing it, and N-1a's
// own no-op legs are byte-exact in SR-U6 (U6-15..U6-18) where no line may appear at all.
// Every fixture routed through here carries the same two spec rows, so the addition is this
// literal string and nothing else.
// spec-raw-text-migration: the line now carries the VALUE from `display.specifications` and is
// filtered by `spec_asked`, so the exact string these nine assertions subtract changed with it.
// The shared fixtures below (`specRow`, `orShape`, `andShape`) were updated to the post-#142
// wire — `spec_asked: [{key:'bowl_count', value:2}]`, `specifications: {class, bowl_count}` —
// which is what makes this literal deterministic.
// Run an ARBITRARY frozen body (e.g. a *.rev*.js RED baseline) through the same harness.
const mk = (src) => new Function('$', '$input', '$execution', src);

const N1A_LINE = '\n\n_Matched on: bowl count: 2._';
const afterLessN1A = (world) => {
  const s = JSON.stringify(H.run(H.AFTER(), world));
  const enc = JSON.stringify(N1A_LINE).slice(1, -1);
  const n = s.split(enc).length - 1;
  if (n !== 1) throw new Error(`expected EXACTLY one N-1a line "${N1A_LINE}", found ${n} — ` +
    'this assertion covers N-2/N-3 only, so it refuses to subtract a line it cannot identify');
  return s.split(enc).join('');
};

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U1 · N-0 RETIRED: `free_terms` is gone from the wire ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// The migration DELETES the field. These assertions replace the old free-terms builder units
// (U1-1..U1-16), which were assertions about code that no longer ships — the only honest
// successor to "does the builder build it right" is "is it provably not there".
// They are stated as the ABSENCE of three distinct things, because a half-migration (raw query
// AND the old free_terms) is the one configuration the CRM has never been measured under
// (conformance report DEV-3: derived free terms are UNIONed on top of the caller's).
{
  const AFTER = BODY();
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const MSG = 'please get me double bowl kitchen sink with thickness 1.2mm';

  ok('U1-R1 the shipped body carries NO `free_terms` field at all',
    () => !/"free_terms"/.test(AFTER));
  ok('U1-R2 the rendered request has no `free_terms` key (not merely empty)',
    () => !('free_terms' in shippedJson(ENT, MSG)));
  ok('U1-R3 the N-0 composed builder source is ABSENT from the shipped bytes',
    () => !AFTER.includes(FREE_TERMS_SRC));
  ok('U1-R4 the per-word message-term source is ABSENT from the shipped bytes',
    () => !AFTER.includes(MSG_TERM_SRC));
  ok('U1-R5 the code-shape classifier is ABSENT from the request body ...',
    () => !AFTER.includes(CLASSIFIER_SRC));
  // ... but it is STILL in the renderer, where N-3 uses it to keep a code miss speaking.
  // Deleting it from both would have silently turned N-3 into a blanket suppressor.
  // ... but it is STILL in the renderer, in the byte form the MCP write path delivers.
  ok('U1-R6 ... and STILL present in compile-current-state (N-3 scoping survives)',
    () => readBuilt('compile-current-state.after.js').includes(CLASSIFIER_TRANSPORT));
  // The two spellings must be ONE rule, proven as behaviour rather than assumed. The U+2212
  // paste form is the discriminator: it is the only fixture that exercises the decoded range.
  ok('U1-R8 the ASCII source and the transport form are the SAME classifier (U+2212 included)',
    () => {
      const cases = [['SRTWC286'], ['SRT332\u2212GM'], ['CBS212-WH'], ['wall hung basin'],
                     ['600mm'], ['SPO-2024-001'], ['1.2mm thickness']];
      return cases.every(c => JSON.stringify(freeTerms(c.map(raw => ({ raw }))))
        === JSON.stringify(freeTermsTransport(c.map(raw => ({ raw })))));
    });
  ok('U1-R9 ... and they are genuinely DIFFERENT bytes (so U1-R8 is not comparing a thing to'
    + ' itself, LESSONS \u00a770d)',
    () => CLASSIFIER_TRANSPORT !== CLASSIFIER_SRC
       && CLASSIFIER_SRC.includes('\\u2212') && !CLASSIFIER_TRANSPORT.includes('\\u2212'));
  ok('U1-R7 ATOMICITY: the body never sends raw `query` AND `free_terms` together',
    () => { const j = shippedJson(ENT, MSG); return j.query === MSG && !('free_terms' in j); });
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U7 · the raw-text migration: what `query` actually sends ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// `ResolveReferenceRequest.query` is now read by BOTH machines — `_resolve_input` (code-token
// regex, `_synthesize_alpha_tokens`, stopwords, AND/OR mode) and `derive_search_inputs` (the
// spec deriver). There is no separate raw-text channel. So this one string is the whole slice.
{
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const MSG = 'please get me double bowl kitchen sink with thickness 1.2mm';
  const USER_GOAL = 'trying to get a double bowl kitchen sink with thickness 1.2mm';

  eq('U7-1 `query` is the customer\'s message, verbatim', () => shippedQuery(ENT, MSG), MSG);
  ok('U7-2 DISCRIMINATOR: it is NOT the parser\'s user_goal restatement',
    // nodesFor()'s user_goal deliberately ALSO contains "thickness 1.2mm", so every other
    // assertion here passes against a body still wired to it. This is the only one that can
    // tell them apart (mutant m9).
    () => shippedQuery(ENT, MSG) !== USER_GOAL && !/^trying to/.test(shippedQuery(ENT, MSG)));
  ok('U7-3 the qualifier words now reach the CRM at all (the whole point of the slice)',
    () => /thickness/.test(shippedQuery(ENT, MSG)) && /1\.2mm/.test(shippedQuery(ENT, MSG)));
  ok('U7-4 adjacency survives: "thickness 1.2mm" stays contiguous (the CRM binds a number to a'
    + ' key by proximity, _QUANTITY_BINDING_WINDOW = 20 chars)',
    () => shippedQuery(ENT, MSG).includes('thickness 1.2mm'));
  ok('U7-5 a CODE is NOT stripped from the query (inverted vs N-0 — the CRM owns code tokens'
    + ' now, and `_is_code_shaped` deliberately keeps them in unresolved_tokens)',
    () => shippedQuery([{ raw: 'SRTWC286', hint: 'product' }], 'check stock SRTWC286 please')
      === 'check stock SRTWC286 please');

  // ── THE STRICT READING (main session, 2026-08-15): NO fallback to the restatement ─────
  // On the only turns where a fallback could fire, `user_goal` is LLM-INVENTED text — and
  // `query` now feeds the code-token extractor, `_synthesize_alpha_tokens` AND the spec
  // deriver. '' derives nothing, which is the correct answer for a wordless turn; a
  // restatement derives confident tokens the customer never typed. m10 re-introduces the
  // fallback and must go RED here.
  eq('U7-6 empty raw text sends an EMPTY query — never the LLM restatement',
    () => shippedQuery(ENT, ''), '');
  eq('U7-7 an audio/attachment turn uses the attachment description', () => {
    const n = nodesFor(ENT, undefined);
    n['tf-message'] = [{ message: { message: { attachment: { description: 'do you have wall hung basin' } } } }];
    return renderJson(BODY(), n).json.query;
  }, 'do you have wall hung basin');
  eq('U7-8 `tf-message` did not run => the guard absorbs the throw and the query is EMPTY,'
    + ' never a node error and never the restatement', () => {
    const n = nodesFor(ENT, MSG); delete n['tf-message'];
    return renderJson(BODY(), n).json.query;
  }, '');
  ok('U7-11 the restatement is GONE from the body entirely — not the source, not a fallback',
    () => !BODY().includes('user_goal'));

  ok('U7-9 the accessor in the shipped body IS raw-message.js\'s single definition',
    () => BODY().includes(RAW_MESSAGE_SRC));
  ok('U7-10 ... and compile-current-state\'s N-2 span reader uses the SAME bytes',
    () => readBuilt('compile-current-state.after.js').includes(RAW_MESSAGE_SRC));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U2 · degenerate inputs: the body still renders valid JSON ──');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  const AFTER = BODY();
  const BEFORE = read('resolve-entity-http.before.jsonBody.txt');
  const nodes = nodesFor;

  const CASES = [
    ['normal', [{ raw: 'double bowl kitchen sink', hint: 'category' }], 'please get me double bowl kitchen sink with thickness 1.2mm'],
    ['empty message', [{ raw: 'sink', hint: 'category' }], ''],
    ['null text', [{ raw: 'sink', hint: 'category' }], null],
    ['no entities', [], 'do you have wall hung basin'],
    ['quote in message', [{ raw: 'basin', hint: 'category' }], 'S trap 8" please "quoted"'],
    ['backslash in message', [{ raw: 'basin', hint: 'category' }], 'path a\\b and \\ alone'],
    ['newline in message', [{ raw: 'basin', hint: 'category' }], 'line one\nline two'],
    ['unicode message', [{ raw: 'basin', hint: 'category' }], 'saiz 600mm — harga? \u{1F600}'],
    ['entity with null raw', [{ raw: null, hint: 'category' }, { raw: 'sink' }], 'sink please'],
  ];

  // 🔴 THIS IS THE ASSERTION THE MIGRATION MAKES LOAD-BEARING. Before the slice the raw message
  // only ever reached the wire inside `JSON.stringify(...)` for `free_terms`; `query` was a
  // BARE `"{{ ... }}"` interpolation, which is safe only while the value is LLM prose. A quote,
  // a backslash or a newline in the customer's own sentence would have produced an unparseable
  // body and failed the node on the critical path of every product turn. Hence JSON.stringify
  // on the query too — and hence these nine fixtures, four of which are exactly those bytes.
  for (const [label, entities, text] of CASES) {
    ok(`U2 renders valid JSON — ${label}`, () => {
      const r = renderJson(AFTER, nodes(entities, text));
      return typeof r.json.query === 'string';
    });
  }
  ok('U2 RED-CONTROL: the PRE-migration body would NOT have survived a quoted message', () => {
    // The pre-migration `query` was a bare interpolation of user_goal. Feed it a user_goal that
    // contains a quote — which is what a raw customer sentence routinely does — and it breaks.
    // This proves the JSON.stringify above is doing work, rather than being decoration.
    const n = nodes([{ raw: 'basin' }], 'x');
    n["Call 'sub-query-reformulator'"][0].output.user_goal = 'S trap 8" please';
    let broke = false;
    try { renderJson(BEFORE, n); } catch (e) { broke = /not valid JSON/.test(e.message); }
    return broke;
  });
  ok('U2 the customer\'s quotes/backslashes/newlines survive INTACT into the query', () => {
    const s = 'S trap 8" please\nline two \\ done';
    return renderJson(AFTER, nodes([{ raw: 'basin' }], s)).json.query === s;
  });

  // The other EIGHT fields must be byte-identical to the pre-SR body on every fixture. This is
  // the n8n-side half of "one leaf changed" (LESSONS §71 — a diff built from Code bodies alone
  // is blind to exactly this node).
  for (const [label, entities, text] of CASES) {
    ok(`U2 all other fields byte-identical — ${label}`, () => {
      const a = renderJson(BEFORE, nodes(entities, text)).json;
      const b = renderJson(AFTER, nodes(entities, text)).json;
      delete a.free_terms; delete a.query; delete b.query;
      return JSON.stringify(a) === JSON.stringify(b);
    });
  }
  eq('U2 key set delta is EXACTLY minus free_terms (no rider field, nothing else moved)', () => {
    const a = Object.keys(renderJson(BEFORE, nodes([{ raw: 'x' }], 'x')).json).sort();
    const b = Object.keys(renderJson(AFTER, nodes([{ raw: 'x' }], 'x')).json).sort();
    return [a.filter(k => !b.includes(k)), b.filter(k => !a.includes(k))];
  }, [['free_terms'], []]);

  ok('U2 the shipped body is pure ASCII (byte-gate survivable)', () => !/[^\x00-\x7F]/.test(AFTER));
  ok('U2 the shipped body has no trailing whitespace', () => !/[ \t]+$/m.test(AFTER));
  ok('U2 `understand_phrase` still false (flipping it is a separate decision, not this slice)',
    () => renderJson(AFTER, nodes([{ raw: 'x' }], 'x')).json.understand_phrase === false);
  ok('U2 `spec_fallback` still true', () => renderJson(AFTER, nodes([{ raw: 'x' }], 'x')).json.spec_fallback === true);
  ok('U2 `tokens` still ONE token per entity raw (SA.md: never split the phrase)',
    () => JSON.stringify(renderJson(AFTER, nodes([{ raw: 'wall hung basin' }], 'do you have wall hung basin')).json.tokens)
      === JSON.stringify(['wall hung basin']));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U3 · N-3: a token whose words fed spec search is not reported missing ──');
// ════════════════════════════════════════════════════════════════════════════════════════
const UU = (n) => `1439736c-20ca-4bba-b387-b242ff4a45${String(n).padStart(2, '0')}`;
// POST-#142 WIRE. `display.specifications` is the compact values-only block the CRM now ships
// alongside `matched_specs` (conformance report C-3.1); `spec_asked` rides at TOP LEVEL of the
// response (added to the shapes below). Both were absent before the deploy — which is exactly
// why the pre-migration `compile-current-state.rev4.js` renders these fixtures differently and
// is used as this slice's RED baseline.
const SPECS = { class: 'Kitchen Sink', bowl_count: 2 };
const ASKED = [{ key: 'bowl_count', value: 2 }];
const specRow = (code, u) => ({
  entity_type: 'product', canonical_code: code, uuid: u, match_field: 'specifications',
  match_tier: 'spec_search', similarity: 9.6,
  display: { product_name: 'Cabana kitchen sink. Double bowl.', via_token: 'trying to get a double bowl kitchen sink', class: 'Kitchen Sink', matched_specs: ['bowl_count', 'free_terms'], specifications: SPECS, preferred_specs: [] },
});
const ROWS = [specRow('CKS315', UU(1)), specRow('CKS319', UU(2))];
const ANSWER = [{ uuid: UU(1), code: 'CKS315' }, { uuid: UU(2), code: 'CKS319' }];
const QUERY_TOKEN = 'trying to get a double bowl kitchen sink';

// The CRM's OR-rewrite shape: per-token resolutions survive, the spec resolution is APPENDED.
const orShape = (extra = []) => ({
  match_mode: 'or',
  tokens: ['double bowl kitchen sink', ...extra.map(e => e.token)],
  unresolved_tokens: ['double bowl kitchen sink', ...extra.map(e => e.token)],
  spec_unmet: [], spec_asked: ASKED, unrecognized_terms: [],
  resolutions: [
    { token: 'double bowl kitchen sink', resolved: false, ambiguous: false, matches: [], alternatives: [] },
    ...extra,
    { token: QUERY_TOKEN, resolved: false, ambiguous: true, matches: ROWS, alternatives: [] },
  ],
});

{
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const mkWorld = () => H.world({ entities: ENT, resolver: orShape(), answerRows: ANSWER });

  const before = H.run(H.BEFORE(), mkWorld());
  const after = H.run(H.AFTER(), mkWorld());

  ok('U3-1 RED: the pre-fix body reports the answered raw as missing',
    () => before.user_response.includes('"double bowl kitchen sink" — not found.'));
  ok('U3-2 the fix removes it', () => !after.user_response.includes('"double bowl kitchen sink"'));
  ok('U3-3 no "Couldn\'t find these" block at all', () => !after.user_response.includes("Couldn't find these"));
  ok('U3-4 the answer itself is untouched', () => after.user_response.includes('Here are the matching products.'));
  ok('U3-5 no OTHER section marker intruded (LESSONS §68)', () => noForeign(after.user_response));
  ok('U3-6 no dym set is armed (nothing to pick)', () => !('dym_last_result_set' in (after.variables || {})));
  ok('U3-7 the parser-facing `response` gains no "[N did-you-mean suggestions active]" marker',
    () => !/did-you-mean suggestions active/.test(after.variables.response));

  // NO-OP GUARANTEE: zero spec_search rows in the answer => byte-identical to the pre-fix body.
  const plain = () => H.world({
    entities: ENT, answerRows: ANSWER,
    resolver: {
      match_mode: 'or', tokens: ['double bowl kitchen sink'], unresolved_tokens: ['double bowl kitchen sink'],
      resolutions: [
        { token: 'double bowl kitchen sink', resolved: false, ambiguous: false, matches: [], alternatives: [] },
        { token: 'cks315', resolved: true, matches: [{ entity_type: 'product', canonical_code: 'CKS315', uuid: UU(1), match_tier: 'exact' }] },
      ],
    },
  });
  eq('U3-8 NO-OP: no spec_search row => whole output byte-identical to pre-fix',
    () => JSON.stringify(H.run(H.AFTER(), plain())), JSON.stringify(H.run(H.BEFORE(), plain())));

  // A spec_search row that is NOT in the answer must not suppress anything.
  const notShown = () => H.world({
    entities: ENT, resolver: orShape(),
    answerRows: [{ uuid: UU(77), code: 'SOMETHING-ELSE' }],
  });
  // 🔴 RE-POINTED by F1 (LESSONS §73 rule 1). The claim was, and still is, "a spec row that is
  // not in the answer must not suppress the customer's own token". The WHOLE-OBJECT comparison
  // against the pre-SR body no longer holds and must not be forced to: on this fixture the
  // pre-fix body also rendered the CRM's derived query token as a miss group, and F1 correctly
  // removes it. Asserting the two properties separately keeps the bound falsifiable instead of
  // deleting it.
  {
    const a = H.run(H.AFTER(), notShown()).user_response;
    const b = H.run(H.BEFORE(), notShown()).user_response;
    ok('U3-9a BOUND: spec rows NOT in the answer => the customer\'s own token is still surfaced',
      () => a.includes('"double bowl kitchen sink"'));
    ok('U3-9b [F1] the CRM-derived query token is not rendered at all ...',
      () => !a.includes(QUERY_TOKEN));
    ok('U3-9c [F1] ... and the pre-fix body DID render it (the RED half of the bound)',
      () => b.includes(QUERY_TOKEN));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U4 · N-2: the data-truth line, exactly once, never invented ──');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const andShape = (unmet) => ({
    match_mode: 'and',
    tokens: ['double bowl kitchen sink'],
    unresolved_tokens: [],
    spec_unmet: unmet,
    spec_asked: ASKED, unrecognized_terms: [],
    spec_candidates: [], floor_missed: false, semantic_used: false,
    intersection: ROWS,
    resolutions: [{ token: QUERY_TOKEN, resolved: false, ambiguous: true, matches: ROWS, alternatives: [] }],
  });
  // The customer's OWN TEXT, as tf-message carries it. Every fixture that renders a VALUE must
  // supply one: the value on the wire is a normalised number with no unit, so the only honest
  // source for "1.2mm" is the message the customer actually typed.
  const RAW12 = 'please get me double bowl kitchen sink with thickness 1.2mm';
  const w = (unmet, raw) => H.world({
    entities: ENT, resolver: andShape(unmet), answerRows: ANSWER, rawMessage: raw,
  });

  const one = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }], RAW12));
  console.log('    >> ' + JSON.stringify(one.user_response.split('\n\n').slice(-2).join('\n\n')));
  ok('U4-1 the line appears, quoting the customer\'s OWN span', () => one.user_response.includes(
    "thickness isn't recorded for these products, so I couldn't narrow by 1.2mm."));
  eq('U4-2 EXACTLY once', () => (one.user_response.match(/isn't recorded for these products/g) || []).length, 1);
  ok('U4-3 data-truth wording, NOT blame-the-search (decision §5.1)',
    () => !/couldn't filter/i.test(one.user_response) && !/search failed/i.test(one.user_response));
  ok('U4-4 no OTHER section marker intruded', () => noForeign(one.user_response));
  ok('U4-5 it sits ABOVE the friendly-domain P/S suffix', () => {
    const a = one.user_response.indexOf("isn't recorded for these products");
    const b = one.user_response.indexOf('P/S:');
    return a !== -1 && b !== -1 && a < b;
  });
  ok('U4-6 it carries none of crossdomain-compose\'s insertion markers', () => {
    const line = one.user_response.split('\n').find(l => l.includes("isn't recorded"));
    return ['Related products:', 'Try:', 'Did you mean', 'Here are the closest matches:', 'Would you like me to escalate']
      .every(m => !line.toLowerCase().includes(m.toLowerCase()));
  });

  // no-op halves
  // These fixtures carry spec rows IN THE ANSWER, so N-1a legitimately adds its one line —
  // subtracted exactly (see afterLessN1A). The claim under test is still N-2's: it rendered
  // nothing at all here.
  for (const [label, unmet] of [['empty []', []], ['absent', undefined], ['null', null], ['not an array', 'thickness']]) {
    eq(`U4-7 NO-OP: spec_unmet ${label} => byte-identical to pre-fix (less the N-1a line)`,
      () => afterLessN1A(w(unmet)), JSON.stringify(H.run(H.BEFORE(), w(unmet))));
  }

  // shape tolerance + grammar
  ok('U4-8 two keys pluralise and list both spans, as typed', () => H.run(H.AFTER(),
    w([{ key: 'thickness', value: 1.2 }, { key: 'bowl_count', value: 3 }],
      'double bowl kitchen sink with thickness 1.2mm and 3 bowls')).user_response.includes(
      "thickness and bowl count aren't recorded for these products, so I couldn't narrow by 1.2mm and 3."));
  ok('U4-9 underscored keys are humanised', () => H.run(H.AFTER(),
    w([{ key: 'trap_length', value: 200 }])).user_response.includes('trap length'));
  ok('U4-10 capped at 3 keys', () => {
    const s = H.run(H.AFTER(), w([1, 2, 3, 4, 5].map(i => ({ key: 'k' + i, value: i })))).user_response;
    return s.includes('k1, k2 and k3') && !s.includes('k4');
  });
  ok('U4-11 a boolean value is NOT quoted back ("narrow by true" is worse than silence)',
    () => { const s = H.run(H.AFTER(), w([{ key: 'wall_hung', value: true }])).user_response;
      return s.includes("wall hung isn't recorded for these products, so I couldn't narrow by it.") && !s.includes('true'); });
  ok('U4-12 legacy "key=value" string shape is tolerated, never "[object Object]"',
    () => { const s = H.run(H.AFTER(), w(['thickness=1.2'], RAW12)).user_response;
      return s.includes("thickness isn't recorded for these products, so I couldn't narrow by 1.2mm.")
        && !s.includes('[object Object]'); });
  ok('U4-13 a malformed entry never renders "[object Object]"',
    () => !H.run(H.AFTER(), w([{ nope: 1 }, null, { key: 'thickness', value: 1.2 }])).user_response.includes('[object Object]'));

  // ADDED BECAUSE MUTANT m4 SURVIVED (LESSONS §72: a surviving mutant teaches you a missing
  // assertion). Every no-op fixture above returns at the FIRST guard (`_unmet.length === 0`),
  // so nothing exercised the load-bearing second one — `spec_unmet` NON-empty but carrying no
  // nameable entry. Without that guard `_and([])` renders " and undefined isn't recorded ...".
  for (const [label, unmet] of [['all-null entries', [null, null]],
                                ['entries with no key', [{ nope: 1 }, { value: 2 }]],
                                ['mixed junk', [null, { nope: 1 }, 0, false]]]) {
    eq(`U4-15 NO-OP: spec_unmet non-empty but unnameable (${label}) => byte-identical to pre-fix (less the N-1a line)`,
      () => afterLessN1A(w(unmet)), JSON.stringify(H.run(H.BEFORE(), w(unmet))));
  }

  // the guard: an UNANSWERED turn must never carry the line
  const noRows = H.world({ entities: ENT, resolver: andShape([{ key: 'thickness', value: 1.2 }]), answerRows: [] });
  eq('U4-14 GUARD: zero rows shown => no line, byte-identical to pre-fix',
    () => JSON.stringify(H.run(H.AFTER(), noRows)), JSON.stringify(H.run(H.BEFORE(), noRows)));

  // ══════════════════════════════════════════════════════════════════════════════════════
  // SR-U4 · the CUSTOMER'S OWN SPAN — added after the tester measured the defect at the
  // customer boundary on clone rev d59c226c (run spec-answer-honesty-SR-2-20260813.json):
  //
  //     "thickness isn't recorded for these products, so I couldn't narrow by 1."
  //
  // The customer asked for 1.0mm. `spec_unmet[].value` is the NUMBER 1.0, which stringifies
  // to "1", and the unit is not on the wire at all (the CRM normalises to mm). Rendered bare
  // that is a truncation AND a different number from the one asked for.
  //
  // The rule under test: echo the customer's own words when their text contains a span for
  // that value (preferring the form carrying a unit), otherwise DROP the value and keep the
  // key. Never a bare normalised number, never an invented unit, never "narrow by .".
  // ══════════════════════════════════════════════════════════════════════════════════════
  const tail = (s) => (s.split('\n').find(l => l.includes("recorded for these products")) || '');

  // The premise, pinned rather than asserted from memory: this is WHY "1.0mm" broke.
  eq('U4-16a premise: the wire value 1.0 stringifies to "1" (the defect, in one line)',
    () => String(1.0), '1');
  ok('U4-16 value 1.0 + raw "1.0mm" => renders the customer\'s "1.0mm", never a bare "1"', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.0 }],
      'double bowl kitchen sink with thickness 1.0mm')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by 1.0mm.")
      && !/narrow by 1\.$/m.test(s) && noForeign(s);
  });
  ok('U4-17 value 1.2 + raw "1.2 mm" => the SPACED form, exactly as typed', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'double bowl kitchen sink with thickness 1.2 mm')).user_response;
    return s.includes("so I couldn't narrow by 1.2 mm.") && noForeign(s);
  });
  ok('U4-18 value present but ABSENT from the customer\'s text => fallback, no bare number', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'do you have a double bowl kitchen sink')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
      && !/1\.2/.test(tail(s)) && !/narrow by 1\b/.test(s);
  });
  for (const [label, v] of [['null', null], ['absent', undefined], ['empty string', ''],
                            ['whitespace', '   '], ['an object', { mm: 1.2 }]]) {
    ok(`U4-19 value ${label} => fallback form, never "[object Object]" and never "narrow by ."`, () => {
      const s = H.run(H.AFTER(), w([{ key: 'thickness', value: v }], RAW12)).user_response;
      return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
        && !s.includes('[object Object]') && !/narrow by \.\s*$/m.test(s);
    });
  }
  ok('U4-20 multiple unmet keys => ONE line, and a shared span is not repeated', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }, { key: 'depth', value: 1.2 }],
      RAW12)).user_response;
    return (s.match(/recorded for these products/g) || []).length === 1
      && s.includes("thickness and depth aren't recorded for these products, so I couldn't narrow by 1.2mm.")
      && (s.match(/1\.2mm/g) || []).length === 1;
  });
  ok('U4-21 mixed spans (one findable, one not) => the value list is dropped WHOLESALE', () => {
    // Never half a list: "narrow by 1.2mm and 3" when only one of the two was actually typed
    // would attribute a number to the customer that they did not write.
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }, { key: 'bowl_count', value: 3 }],
      RAW12)).user_response;
    return s.includes("thickness and bowl count aren't recorded for these products, so I couldn't narrow by them.")
      && !tail(s).includes('1.2mm');
  });
  ok('U4-22 `tf-message` did not run => the reader throws, the guard absorbs it, fallback renders', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }])).user_response;   // no rawMessage
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.");
  });
  ok('U4-23 a boolean is never echoed, even when the word appears in the message', () => {
    const s = H.run(H.AFTER(), w([{ key: 'wall_hung', value: true }],
      'is it true that you have a wall hung basin')).user_response;
    return s.includes("wall hung isn't recorded for these products, so I couldn't narrow by it.")
      && !tail(s).includes('true');
  });
  ok('U4-24 no unit is INVENTED: a bare "1.2" in the message renders bare', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'double bowl kitchen sink thickness 1.2')).user_response;
    return s.includes("so I couldn't narrow by 1.2.") && !s.includes('1.2mm');
  });
  ok('U4-25 digits INSIDE a product code are not lifted out as the customer\'s span', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'is srtwc1.2ab in stock')).user_response;
    return s.includes("so I couldn't narrow by it.") && !tail(s).includes('1.2');
  });
  ok('U4-28 digits inside a CODE are not lifted out even when they end the token', () => {
    // Discriminates the "previous character" guard specifically: "SRT332-GM" ends the digit run
    // at a hyphen, so the trailing-character guard alone would happily echo "332".
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 332 }],
      'do you have SRT332-GM in stock')).user_response;
    return s.includes("so I couldn't narrow by it.") && !tail(s).includes('332');
  });
  ok('U4-26 a unit-attached span WINS over an unrelated bare occurrence of the same number', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1 }],
      'i need 1 double bowl kitchen sink, thickness 1.0mm')).user_response;
    return s.includes("so I couldn't narrow by 1.0mm.");
  });
  // ══════════════════════════════════════════════════════════════════════════════════════
  // REV 3 — /codex-review (review §H). Two span-SELECTION defects, both reproduced
  // mechanically before a line was changed, neither a crash and neither changing WHICH
  // products come back: both make the explanatory sentence quote a span the customer did
  // not mean, in the one sentence whose entire purpose is not misleading them.
  //
  // The rule is now the CRM's own (`product_spec_search.py:_resolve_quantities`): a number
  // belongs to the key whose own word sits nearest, within _QUANTITY_BINDING_WINDOW = 20
  // characters. Where the CRM keeps the first of two equal distances we do NOT — a genuine
  // tie is AMBIGUOUS and falls back to "by it", because guessing is what produced both of
  // these defects and silence is already an approved outcome (plan §5.1).
  // ══════════════════════════════════════════════════════════════════════════════════════
  ok('U4-29 CODEX-1 a CODE SEPARATOR does not turn a part number into the customer\'s span', () => {
    // "ABC-1.2MM" is one token. The rev-2 guard rejected [0-9A-Za-z.] before the digits, and
    // '-' is none of those: /[0-9A-Za-z.]/.test('-') === false. Measured, not argued.
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'do you have ABC-1.2MM in stock')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
      && !tail(s).includes('1.2') && !tail(s).toUpperCase().includes('MM');
  });
  ok('U4-30 CODEX-2 the span NEAREST THE KEY\'S OWN WORD wins, not the first one that matches', () => {
    // "2m hose thickness 2mm": both spans carry a unit and both are numerically 2, so rev 2
    // took index 0 and told a customer asking about 2mm thickness "couldn't narrow by 2m".
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 2 }],
      '2m hose thickness 2mm')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by 2mm.")
      && !/narrow by 2m\./.test(s) && noForeign(s);
  });
  ok('U4-31 a genuine TIE is ambiguous -> the fallback, never a coin-flip', () => {
    // Both spans sit exactly one character from the key, and they disagree. There is no
    // evidence for either, so the value is dropped rather than guessed.
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 2 }],
      '2mm thickness 2cm')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
      && !/narrow by 2/.test(s);
  });
  ok('U4-32 a span FAR from the key it would be attributed to is not quoted', () => {
    // The key's word is in the sentence but 42 characters away — past the CRM's own binding
    // window — so the number was never bound to this key by anything, and we do not bind it.
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      'do you have 1.2mm pipe for the upstairs bathroom renovation thickness')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
      && !tail(s).includes('1.2');
  });
  ok('U4-35 a fragment of a LONGER NUMBER is not a span (the preceding-char guard, alone)', () => {
    // ADDED BECAUSE MUTANT m15 SURVIVED rev 3 (LESSONS §72). U4-25/U4-28 no longer discriminate
    // the preceding-character guard: rev 3's `_crossesCode` catches "srtwc1.2ab" and "SRT332-GM"
    // on its own, so removing the older guard left both green — two mechanisms suppressing one
    // symptom, which is precisely the shape LESSONS §64 says makes a test stop being evidence.
    // The guard's OWN shape is a dotted version/model number: "1.2.3" carries no letters, so
    // `_crossesCode` cannot see it, and only the preceding '.' stops "3" being quoted back.
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 3 }],
      'do you have the 1.2.3 series double bowl sink')).user_response;
    return s.includes("thickness isn't recorded for these products, so I couldn't narrow by it.")
      && !/narrow by 3\./.test(s);
  });
  ok('U4-33 [PRESERVE] no anchor in the sentence => the unit-carrying span still wins', () => {
    // The key's own word is absent (the CRM resolved `gauge` from free_terms, the customer
    // never typed it), so there is no proximity information at all and the rev-2 rule still
    // governs. This is the fixture that keeps mutant m12 discriminating after rev 3.
    const s = H.run(H.AFTER(), w([{ key: 'gauge', value: 1 }],
      'i need 1 double bowl kitchen sink, thickness 1.0mm')).user_response;
    return s.includes("gauge isn't recorded for these products, so I couldn't narrow by 1.0mm.");
  });
  ok('U4-34 [PRESERVE] proximity is measured in BOTH directions (key AFTER the number)', () => {
    const s = H.run(H.AFTER(), w([{ key: 'thickness', value: 1.2 }],
      '1.2mm thickness double bowl sink please')).user_response;
    return s.includes("so I couldn't narrow by 1.2mm.");
  });
  ok('U4-27 a non-numeric value is echoed only when the customer actually typed it', () => {
    const yes = H.run(H.AFTER(), w([{ key: 'material', value: 'stainless steel' }],
      'do you have a Stainless Steel double bowl sink')).user_response;
    const no = H.run(H.AFTER(), w([{ key: 'material', value: 'stainless_steel' }],
      'do you have a stainless steel double bowl sink')).user_response;
    return yes.includes("so I couldn't narrow by Stainless Steel.")     // verbatim, their casing
      && no.includes("so I couldn't narrow by it.");                    // normalised != typed
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U5 · N-3 must not over-suppress: a genuine miss still speaks ──');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  const ENT = [{ raw: 'wall hung basin', hint: 'category' }, { raw: 'SRTZZ999', hint: 'product' }];
  const miss = { token: 'SRTZZ999', resolved: false, ambiguous: false, matches: [], alternatives: [] };
  const w = () => H.world({ entities: ENT, resolver: orShape([miss]), answerRows: ANSWER });
  const after = H.run(H.AFTER(), w());
  console.log('    >> ' + JSON.stringify(after.user_response.split('\n\n').slice(-3).join('\n\n')));

  ok('U5-1 the spec answer renders', () => after.user_response.includes('Here are the matching products.'));
  ok('U5-2 the unknown CODE still gets its miss line (it never fed free_terms)',
    () => after.user_response.includes('"SRTZZ999" — not found.'));
  ok('U5-3 the descriptive raw is NOT reported missing',
    () => !after.user_response.includes('"double bowl kitchen sink"'));
  eq('U5-4 exactly ONE token is surfaced', () => (after.user_response.match(/— not found\./g) || []).length, 1);

  // Discriminating: prove the predicate is not a blanket mute of the whole block.
  const allCodes = () => H.world({
    entities: [{ raw: 'SRTZZ999' }], answerRows: ANSWER,
    resolver: { match_mode: 'or', tokens: ['SRTZZ999'], unresolved_tokens: ['SRTZZ999'], spec_asked: ASKED,
      resolutions: [miss, { token: QUERY_TOKEN, resolved: false, ambiguous: true, matches: ROWS, alternatives: [] }] },
  });
  eq('U5-5 BOUND: only-code miss beside a spec answer => byte-identical to pre-fix (less the N-1a line)',
    () => afterLessN1A(allCodes()), JSON.stringify(H.run(H.BEFORE(), allCodes())));

  // ── the LEGACY single-resolution arm is deliberately NOT patched ──────────────────────
  // A first draft scoped it too; U5-7 showed the clause could never fire, so it was deleted
  // (LESSONS §66) and these two cases now PIN the reason rather than the removed code.
  // On the legacy shape there is no `resolutions` array, so a spec_search row can only live in
  // `r.intersection` — and `_tokenWasAnswered(r)` reads exactly that against exactly the same
  // `_answerCodes`. The fifth patch has therefore already suppressed the block before any
  // sixth-patch clause could be reached, on the PRE-FIX body as well as the post-fix one.
  const legacy = (tok) => H.world({
    entities: [{ raw: tok }], answerRows: ANSWER,
    resolver: { match_mode: 'or', tokens: [tok], unresolved_tokens: [tok], spec_asked: ASKED,
      intersection: ROWS, alternatives: [], matches: [] },
  });
  ok('U5-6 legacy arm: `_tokenWasAnswered` already suppresses — and did so BEFORE the fix too',
    () => !H.run(H.AFTER(), legacy('wall hung basin')).user_response.includes("Couldn't find these")
       && !H.run(H.BEFORE(), legacy('wall hung basin')).user_response.includes("Couldn't find these"));
  eq('U5-7 legacy arm is byte-identical before/after for a CODE token too, less the N-1a line (clause would be dead)',
    () => afterLessN1A(legacy('SRTZZ999')),
    JSON.stringify(H.run(H.BEFORE(), legacy('SRTZZ999'))));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U6 · N-1a: the "Matched on" line — now VALUES, spec answers only ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// SR.md SR-1b, upgraded by spec-raw-text-migration. The wire now carries
// `display.specifications` (values-only) and top-level `spec_asked`, so the line names what the
// customer asked for and what it was matched to. The no-op guarantee — no in-answer spec key
// => output byte-identical — is unchanged and is still the half that protects every other turn.
const OMIT = Symbol('omit');
const sRow = (code, u, matched, specs) => {
  const d = { product_name: 'Cabana kitchen sink. Double bowl.', via_token: QUERY_TOKEN,
              class: 'Kitchen Sink', matched_specs: matched, preferred_specs: [] };
  if (specs !== OMIT) d.specifications = (specs === undefined ? SPECS : specs);
  return { entity_type: 'product', canonical_code: code, uuid: u, match_field: 'specifications',
           match_tier: 'spec_search', similarity: 9.6, display: d };
};
// The AND-path envelope the four frozen baselines actually recorded: one query-keyed
// resolution carrying every spec row, no surviving per-raw miss. `spec_asked` rides top level.
const specShape = (rows, unmet, asked) => {
  const o = {
    match_mode: 'and', tokens: ['double bowl kitchen sink'], unresolved_tokens: [],
    spec_unmet: unmet || [], spec_candidates: [], floor_missed: false, semantic_used: false,
    unrecognized_terms: [],
    resolutions: [{ token: QUERY_TOKEN, resolved: false, ambiguous: true, matches: rows, alternatives: [] }],
  };
  if (asked !== OMIT) o.spec_asked = (asked === undefined ? ASKED : asked);
  return o;
};
const line = (s) => (String(s).split('\n').find(l => l.includes('Matched on')) || '');
const count = (s, re) => (String(s).match(re) || []).length;
{
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const w = (rows, o) => H.world({
    entities: ENT, resolver: specShape(rows, (o || {}).unmet, (o || {}).asked),
    answerRows: (o || {}).answerRows || ANSWER, rawMessage: (o || {}).rawMessage,
  });

  const one = H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['bowl_count', 'free_terms']),
                                  sRow('CKS319', UU(2), ['bowl_count', 'free_terms'])]));
  console.log('    >> ' + JSON.stringify(line(one.user_response)));

  ok('U6-1 the line renders with the VALUE, humanised, italic',
    () => one.user_response.includes('\n\n_Matched on: bowl count: 2._'));
  eq('U6-2 EXACTLY once', () => count(one.user_response, /Matched on/g), 1);
  ok('U6-3 `free_terms` is NEVER rendered (machinery; and it can never be in spec_asked)',
    () => !/free[ _]terms/i.test(one.user_response));
  ok('U6-4 the raw snake key never reaches the customer', () => !one.user_response.includes('bowl_count'));
  ok('U6-5 DEDUPED across rows (two rows, one key)', () => count(one.user_response, /bowl count/g) === 1);
  ok('U6-6 it sits AFTER the product list and BEFORE the P/S footer', () => {
    const rows = one.user_response.indexOf('Here are the matching products.');
    const m = one.user_response.indexOf('Matched on');
    const ps = one.user_response.indexOf('P/S:');
    return rows !== -1 && m !== -1 && ps !== -1 && rows < m && m < ps;
  });
  ok('U6-7 no OTHER section marker intruded (LESSONS §68)', () => noForeign(one.user_response));
  ok('U6-8 it carries none of crossdomain-compose\'s insertion markers', () =>
    ['Related products:', 'Try:', 'Did you mean', 'Here are the closest matches:', 'Would you like me to escalate']
      .every(m => !line(one.user_response).toLowerCase().includes(m.toLowerCase())));

  // ONLY free_terms matched -> nothing survives the filter -> we matched on the description.
  const onlyFree = H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['free_terms']),
                                       sRow('CKS319', UU(2), ['free_terms'])]));
  ok('U6-9 only `free_terms` => "Matched on your description."',
    () => onlyFree.user_response.includes('\n\n_Matched on your description._')
       && !/free[ _]terms/i.test(onlyFree.user_response));
  eq('U6-10 and only once', () => count(onlyFree.user_response, /Matched on/g), 1);

  // FIRST-SEEN order across rows (after class, which always leads — see U8-2).
  ok('U6-11 first-seen order across rows ("mounting" is new on row 2, so it comes second)',
    () => H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['bowl_count', 'free_terms'], { bowl_count: 2, mounting: 'wall_hung' }),
                              sRow('CKS319', UU(2), ['mounting', 'bowl_count'], { bowl_count: 2, mounting: 'wall_hung' })],
      { asked: [{ key: 'bowl_count', value: 2 }, { key: 'mounting', value: 'wall_hung' }] })).user_response
      .includes('_Matched on: bowl count: 2 and mounting: Wall Hung._'));
  // ONE row => the answer must be that ONE row: F2 is whole-answer scoped, so a fixture that
  // shows two entities while only one is a spec row is a MIXED answer and correctly renders
  // nothing. Keeping the old 2-entity default here would have made these cases assert the
  // opposite of F2 (LESSONS §73 rule 1 — re-read the assertions you just widened).
  const ONE = [ANSWER[0]];
  ok('U6-12 three keys read as a list',
    () => H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['bowl_count', 'mounting', 'trap_length'],
        { bowl_count: 2, mounting: 'wall_hung', trap_length: 200 })],
      { answerRows: ONE, asked: [{ key: 'bowl_count' }, { key: 'mounting' }, { key: 'trap_length' }] })).user_response
      .includes('_Matched on: bowl count: 2, mounting: Wall Hung and trap length: 200._'));
  ok('U6-13 underscored KEYS are humanised, never echoed raw',
    () => { const s = H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['trap_length'], { trap_length: 200 })],
        { answerRows: ONE, asked: [{ key: 'trap_length' }] })).user_response;
      return s.includes('_Matched on: trap length: 200._') && !s.includes('trap_length'); });
  ok('U6-14 junk entries never render null/undefined/[object Object]',
    () => { const s = H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['bowl_count', null, '', '  ', { k: 1 }])],
        { answerRows: ONE })).user_response;
      return s.includes('Matched on: bowl count: 2')
        && !/null|undefined|\[object Object\]/.test(line(s)); });

  // ── THE NO-OP GUARANTEE — the half that protects every other turn in the product ──────
  const exactRow = { entity_type: 'product', canonical_code: 'SRTWC286', uuid: UU(1), match_tier: 'exact' };
  const codeTurn = () => H.world({
    entities: [{ raw: 'SRTWC286', hint: 'product' }], answerRows: [{ uuid: UU(1), code: 'SRTWC286' }],
    resolver: { match_mode: 'and', tokens: ['SRTWC286'], unresolved_tokens: [], spec_unmet: [],
      resolutions: [{ token: 'SRTWC286', resolved: true, matches: [exactRow], alternatives: [] }] },
  });
  eq('U6-15 NO-OP: a CODE turn (no spec row at all) => byte-identical to pre-fix [SR-12 offline]',
    () => JSON.stringify(H.run(H.AFTER(), codeTurn())), JSON.stringify(H.run(H.BEFORE(), codeTurn())));

  // 🔴 `answerRows: ONE` here is LOAD-BEARING, and the mutation gate is what proved it.
  // m21 (drop the `!_keys.length` gate) SURVIVED on the first rev-3 run: with the default
  // 2-entity answer and a single spec row, F2's new `_allShownAreSpec` gate returns FIRST, so
  // these fixtures stopped exercising the zero-key gate at all. Two mechanisms suppressing one
  // symptom is LESSONS §64 — the test stops being evidence for either. The shape only the
  // zero-key gate can reject is: EVERY shown row IS a spec row (so F2 passes) and NO spec key
  // survives. That is this fixture, with a one-row answer.
  for (const [label, rows] of [
    ['matched_specs absent', [{ ...sRow('CKS315', UU(1), []), display: { product_name: 'x', via_token: QUERY_TOKEN } }]],
    ['matched_specs empty', [sRow('CKS315', UU(1), [])]],
    ['matched_specs not an array', [sRow('CKS315', UU(1), 'bowl_count')]],
    ['matched_specs all blank', [sRow('CKS315', UU(1), ['', '   ', null])]],
  ]) {
    eq(`U6-16 NO-OP: spec rows present but ${label} => byte-identical to pre-fix`,
      () => JSON.stringify(H.run(H.AFTER(), w(rows, { answerRows: ONE }))),
      JSON.stringify(H.run(H.BEFORE(), w(rows, { answerRows: ONE }))));
  }

  const notShownRows = [sRow('CKS315', UU(1), ['bowl_count'])];
  const notShownOpts = { answerRows: [{ uuid: UU(77), code: 'SOMETHING-ELSE' }] };
  // RE-POINTED by F1, same reason as U3-9: the pre-fix body also printed the derived query
  // token here. N-1a's own claim (no in-answer spec row => no line) is asserted directly.
  ok('U6-17 NO-OP/BOUND: spec rows NOT in the answer => NO Matched-on line at all',
    () => !/Matched on/.test(H.run(H.AFTER(), w(notShownRows, notShownOpts)).user_response));

  const noRows = () => H.world({ entities: ENT, resolver: specShape([sRow('CKS315', UU(1), ['bowl_count'])]), answerRows: [] });
  eq('U6-18 GUARD: nothing shown to the customer => no line, byte-identical to pre-fix',
    () => JSON.stringify(H.run(H.AFTER(), noRows())), JSON.stringify(H.run(H.BEFORE(), noRows())));

  // ── COEXISTENCE — SR-10 at the offline tier: list + Matched-on + N-2, each exactly once ──
  const both = H.run(H.AFTER(), w([sRow('CKS315', UU(1), ['bowl_count', 'free_terms']),
                                   sRow('CKS319', UU(2), ['bowl_count', 'free_terms'])],
    { unmet: [{ key: 'thickness', value: 1.2 }],
      rawMessage: 'double bowl kitchen sink with thickness 1.2mm' }));
  console.log('    >> ' + JSON.stringify(both.user_response.split('\n\n').slice(-3).join('\n\n')));
  ok('U6-19 [SR-10] all three coexist: product list, Matched-on, the N-2 caveat', () =>
    both.user_response.includes('Here are the matching products.')
    && both.user_response.includes('_Matched on: bowl count: 2._')
    && both.user_response.includes("thickness isn't recorded for these products, so I couldn't narrow by 1.2mm."));
  ok('U6-20 [SR-10] each exactly once', () =>
    count(both.user_response, /Matched on/g) === 1
    && count(both.user_response, /isn't recorded for these products/g) === 1
    && count(both.user_response, /P\/S:/g) === 1);
  ok('U6-21 [SR-10] read order: rows -> what matched -> what could not -> the P/S tip', () => {
    const a = both.user_response.indexOf('Matched on');
    const b = both.user_response.indexOf("isn't recorded for these products");
    const c = both.user_response.indexOf('P/S:');
    return a !== -1 && a < b && b < c;
  });
  ok('U6-22 [SR-10] no OTHER section marker intruded', () => noForeign(both.user_response));

  // ── DEV-2 · THE MIXED HIT+MISS TURN, at full N-3 strength ────────────────────────────
  // The conformance report's blocking finding: the CRM's F2 strip NEVER clears a code-shaped
  // token, so a code the customer typed comes back unresolved BESIDE a populated spec
  // shortlist. The renderer has to say both things in one reply, and N-3 must not mute the code.
  const withMiss = H.run(H.AFTER(), H.world({
    entities: [{ raw: 'wall hung basin', hint: 'category' }, { raw: 'SRTZZ999', hint: 'product' }],
    answerRows: ANSWER,
    resolver: orShape([{ token: 'SRTZZ999', resolved: false, ambiguous: false, matches: [], alternatives: [] }]),
  }));
  ok('U6-23 [SR-4 / DEV-2] a genuine code miss still speaks, and the line still renders',
    () => withMiss.user_response.includes('"SRTZZ999" — not found.')
       && withMiss.user_response.includes('_Matched on: bowl count: 2._'));
  ok('U6-24 [DEV-2] the DESCRIPTIVE token is still suppressed on that same turn',
    () => !withMiss.user_response.includes('"wall hung basin"'));
  eq('U6-25 [DEV-2] exactly ONE miss is surfaced — the code, and only the code',
    () => (withMiss.user_response.match(/— not found\./g) || []).length, 1);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U8 · the spec_asked filter, the class VALUE, and the three-line humanise ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// Everything in this section is NEW behaviour introduced by spec-raw-text-migration. Its RED
// baseline is `compile-current-state.rev4.js` — the body the clone was actually running at
// c97f2f8f — run through the same harness (see the RED record in the node-diff).
{
  const ENT = [{ raw: 'double bowl kitchen sink', hint: 'category' }];
  const w = (rows, o) => H.world({
    entities: ENT, resolver: specShape(rows, (o || {}).unmet, (o || {}).asked),
    answerRows: (o || {}).answerRows || ANSWER, rawMessage: (o || {}).rawMessage,
  });
  // Every U8 fixture is a ONE-row answer, so the answer set is one entity: F2 requires EVERY
  // shown row to be a spec row, and a 2-entity answer with 1 spec row is a mixed answer.
  const say = (rows, o) => H.run(H.AFTER(), w(rows, Object.assign({ answerRows: [ANSWER[0]] }, o || {}))).user_response;

  // ── the class VALUE, never the key name, and it LEADS ────────────────────────────────
  const cls = say([sRow('CKS315', UU(1), ['bowl_count', 'class', 'free_terms'])]);   // 1 row, 1 shown
  console.log('    >> ' + JSON.stringify(line(cls)));
  ok('U8-1 `class` renders as its VALUE, never the key name',
    () => cls.includes('Kitchen Sink') && !/\bclass\b/i.test(line(cls)));
  ok('U8-2 `class` LEADS, even though matched_specs arrives sorted() with bowl_count first',
    () => cls.includes('_Matched on: Kitchen Sink and bowl count: 2._'));
  ok('U8-3 `class` survives the filter although it is NOT in spec_asked (the UNION)',
    () => cls.includes('Kitchen Sink'));
  ok('U8-4 `class` IS also accepted when spec_asked names it (understand_phrase path) — once',
    () => { const s = say([sRow('CKS315', UU(1), ['class', 'bowl_count'])],
      { asked: [{ key: 'class', value: 'Kitchen Sink' }, { key: 'bowl_count', value: 2 }] });
      return s.includes('_Matched on: Kitchen Sink and bowl count: 2._')
        && count(s, /Kitchen Sink/g) === 1; });

  // ── THE FILTER · a house-preference key is structurally excluded (retires SR-11) ──────
  // product_spec_search.py appends a preferred key to matched_specs EXACTLY when the customer
  // did not state it, so it can never be in spec_asked. This is the assertion that makes the
  // SR-1b "record the key set verbatim and review it by hand" instruction unnecessary.
  const pref = say([sRow('CKS315', UU(1), ['bowl_count', 'brand', 'free_terms'],
    { class: 'Kitchen Sink', bowl_count: 2, brand: 'SORENTO' })]);
  ok('U8-5 a house-preference `brand` the customer never stated is NOT announced as a match',
    () => pref.includes('_Matched on: bowl count: 2._') && !/SORENTO/i.test(pref));
  ok('U8-6 a key that scored but was not asked for is dropped, whatever it is',
    () => !say([sRow('CKS315', UU(1), ['bowl_count', 'material'],
      { class: 'Kitchen Sink', bowl_count: 2, material: 'stainless_steel' })]).includes('Stainless'));

  // ── DEV-1 · brand and class values are VERBATIM; everything else is humanised ─────────
  const brandAsked = [{ key: 'brand', value: 'NO LOGO' }];
  ok('U8-7 [DEV-1] a stated brand renders VERBATIM — "NO LOGO", never "No Logo"',
    () => { const s = say([sRow('CKS315', UU(1), ['brand'], { brand: 'NO LOGO' })], { asked: brandAsked });
      return s.includes('_Matched on: brand: NO LOGO._') && !s.includes('No Logo'); });
  ok('U8-8 [DEV-1] "SORENTO" is not re-cased either',
    () => say([sRow('CKS315', UU(1), ['brand'], { brand: 'SORENTO' })],
      { asked: [{ key: 'brand' }] }).includes('brand: SORENTO'));
  ok('U8-9 [DEV-1] a multi-word brand keeps the catalogue\'s spelling ("American Standard")',
    () => say([sRow('CKS315', UU(1), ['brand'], { brand: 'American Standard' })],
      { asked: [{ key: 'brand' }] }).includes('brand: American Standard'));
  ok('U8-10 [DEV-1] a class value with an acronym is verbatim ("Wall Hung WC")',
    () => say([sRow('CKS315', UU(1), ['class'], { class: 'Wall Hung WC' })]).includes('Matched on: Wall Hung WC.'));
  ok('U8-11 [DEV-1] a NON-exempt enum value IS humanised: wall_hung -> "Wall Hung"',
    () => say([sRow('CKS315', UU(1), ['mounting'], { mounting: 'wall_hung' })],
      { asked: [{ key: 'mounting' }] }).includes('mounting: Wall Hung'));
  ok('U8-12 [DEV-1] humanising is idempotent on an already-spaced value (the registry has no'
    + ' write-path validator until CRM #160, so malformed values are reachable)',
    () => say([sRow('CKS315', UU(1), ['mounting'], { mounting: 'Free Standing' })],
      { asked: [{ key: 'mounting' }] }).includes('mounting: Free Standing'));

  // ── VALUE SHAPES ─────────────────────────────────────────────────────────────────────
  ok('U8-13 a number stays a number, undecorated and un-normalised',
    () => say([sRow('CKS315', UU(1), ['thickness'], { thickness: 1.2 })],
      { asked: [{ key: 'thickness' }] }).includes('thickness: 1.2'));
  ok('U8-14 a LIST value is joined, each element humanised',
    () => say([sRow('CKS315', UU(1), ['finish'], { finish: ['brushed_nickel', 'matte_black'] })],
      { asked: [{ key: 'finish' }] }).includes('finish: Brushed Nickel, Matte Black'));
  ok('U8-15 a BOOLEAN value is DROPPED, never rendered as true/yes',
    () => { const s = say([sRow('CKS315', UU(1), ['bowl_count', 'overflow'], { class: 'Kitchen Sink', bowl_count: 2, overflow: true })],
        { asked: [{ key: 'bowl_count' }, { key: 'overflow' }] });
      return s.includes('_Matched on: bowl count: 2._') && !/true|Yes\b|overflow/i.test(line(s)); });
  ok('U8-16 an OBJECT value is dropped, never "[object Object]"',
    () => { const s = say([sRow('CKS315', UU(1), ['bowl_count', 'depth'], { class: 'Kitchen Sink', bowl_count: 2, depth: { value: 1, unit: 'mm' } })],
        { asked: [{ key: 'bowl_count' }, { key: 'depth' }] });
      return s.includes('_Matched on: bowl count: 2._') && !/\[object Object\]/.test(s); });
  ok('U8-17 `specifications` NULL (the shape-B require path, CRM F9) => the key drops out',
    () => say([sRow('CKS315', UU(1), ['bowl_count'], null)]).includes('_Matched on your description._'));
  ok('U8-18 `specifications` absent entirely => the key drops out, no throw',
    () => say([sRow('CKS315', UU(1), ['bowl_count'], OMIT)]).includes('_Matched on your description._'));
  ok('U8-19 an asked key that scored but has no recorded value drops out silently',
    () => say([sRow('CKS315', UU(1), ['bowl_count', 'thickness'], { class: 'Kitchen Sink', bowl_count: 2 })],
      { asked: [{ key: 'bowl_count' }, { key: 'thickness' }] }).includes('_Matched on: bowl count: 2._'));
  ok('U8-20 the VALUE comes from the FIRST in-answer row that records it (ranker order)',
    () => say([sRow('CKS315', UU(1), ['bowl_count'], { bowl_count: 2 }),
               sRow('CKS319', UU(2), ['bowl_count'], { bowl_count: 3 })],
      { answerRows: ANSWER }).includes('bowl count: 2'));

  // ── spec_asked SHAPE TOLERANCE + THE DEPLOYMENT TELL ─────────────────────────────────
  ok('U8-21 DEPLOYMENT TELL: `spec_asked` ABSENT (pre-#142 endpoint) => only class survives,'
    + ' so the line degrades to the description form rather than silently re-rendering the'
    + ' unfiltered rev-4 sentence',
    () => say([sRow('CKS315', UU(1), ['bowl_count', 'free_terms'])], { asked: OMIT })
      .includes('_Matched on your description._'));
  ok('U8-22 ... and with class matched, the ABSENT case still names the class',
    () => say([sRow('CKS315', UU(1), ['bowl_count', 'class'])], { asked: OMIT })
      .includes('_Matched on: Kitchen Sink._'));
  ok('U8-23 `spec_asked: []` behaves the same as absent (empty is not "everything")',
    () => say([sRow('CKS315', UU(1), ['bowl_count', 'free_terms'])], { asked: [] })
      .includes('_Matched on your description._'));
  ok('U8-24 bare-string `spec_asked` entries are tolerated',
    () => say([sRow('CKS315', UU(1), ['bowl_count'])], { asked: ['bowl_count'] })
      .includes('_Matched on: bowl count: 2._'));
  ok('U8-25 junk `spec_asked` entries never throw and never widen the filter',
    () => { const s = say([sRow('CKS315', UU(1), ['bowl_count', 'free_terms'])],
        { asked: [null, 7, { nope: 1 }, { key: 'bowl_count' }] });
      return s.includes('_Matched on: bowl count: 2._') && !/free[ _]terms/i.test(s); });
  ok('U8-26 `spec_asked` not an array is tolerated (treated as nothing asked)',
    () => say([sRow('CKS315', UU(1), ['bowl_count', 'class'])], { asked: 'bowl_count' })
      .includes('_Matched on: Kitchen Sink._'));
  ok('U8-27 the rendered line never carries null / undefined / [object Object]',
    () => { const s = line(say([sRow('CKS315', UU(1), ['bowl_count', 'class', 'free_terms', null])]));
      return s.length > 0 && !/null|undefined|\[object Object\]/.test(s); });
}

console.log('\n── SR-U9 · [F1] the CRM-derived query token is never rendered as a customer token ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// Reviewer F1 (BLOCKER). Since `query` is the customer's whole sentence, the CRM appends a
// resolution whose `token` IS that sentence (MEASURED, exec 12597847:
// `resolutions[2].token === "SRTWC286 and wall hung basin"`), and a renderer that groups misses
// by token prints the customer's own question back at them as a failed search term (MEASURED at
// the customer boundary, exec 12597815).
//
// RED baseline for this whole section: `compile-current-state.rev5.js` — the body deployed at
// clone `6656a1de`, i.e. this slice WITHOUT F1/F2.
{
  const ENT = [{ raw: 'wall hung basin', hint: 'category' }];
  const SENTENCE = 'wall hung basin got SIRIM cert?';
  // The exec-12597815/12597847 shape: the customer's own token keeps its (empty) resolution,
  // AND the CRM appends one keyed on the whole sentence carrying trgm alternatives.
  const alt = (code, u) => ({ entity_type: 'product', canonical_code: code, uuid: u, match_tier: 'trgm' });
  const derivedShape = (extra = []) => ({
    match_mode: 'and', fallback_match_mode: 'or',
    tokens: ['wall hung basin'],
    unresolved_tokens: ['wall hung basin', SENTENCE],
    spec_unmet: [], spec_asked: [],
    resolutions: [
      { token: 'wall hung basin', resolved: false, ambiguous: false, matches: [],
        alternatives: [alt('BRBC2296-1', UU(31)), alt('MAB7029C', UU(32))] },
      ...extra,
      { token: SENTENCE, resolved: false, ambiguous: false, matches: [],
        alternatives: [alt('BRBC22137W-1', UU(33)), alt('BRBC22292W', UU(34))] },
    ],
  });
  const w9 = (extra) => H.world({
    entities: ENT, resolver: derivedShape(extra), answerRows: ANSWER, rawMessage: SENTENCE,
  });

  const before9 = H.run(H.BEFORE(), w9()).user_response;
  const after9 = H.run(H.AFTER(), w9()).user_response;
  console.log('    >> ' + JSON.stringify((after9.split('\n').find(l => l.includes('did you mean')) || '(no dym group)')));

  ok('U9-1 RED: the pre-F1 body renders the customer\'s whole QUESTION as a failed search term',
    () => before9.includes(`"${SENTENCE}" — did you mean:`));
  ok('U9-2 the fix removes it — the sentence never appears as a group label',
    () => !after9.includes(`"${SENTENCE}" — did you mean:`));
  ok('U9-3 ... nor as a plain miss line', () => !after9.includes(`"${SENTENCE}" — not found.`));
  ok('U9-4 ... nor anywhere in the reply at all (assert the WHOLE string, LESSONS §68)',
    () => !after9.includes(SENTENCE));
  // NO OVER-SUPPRESSION. The customer's OWN token is a sent token and must still speak.
  ok('U9-5 the customer\'s own token IS still surfaced (the fail-open half)',
    () => after9.includes('"wall hung basin" — did you mean:'));
  ok('U9-6 and its candidates are still numbered from 1',
    () => /\n {2}1\. BRBC2296-1/.test(after9));
  ok('U9-7 no OTHER section marker intruded', () => noForeign(after9, ["Couldn't find these", 'did you mean']));

  // A genuine unknown CODE the customer typed is a SENT token, so it is untouched by F1.
  const withCode = H.run(H.AFTER(), H.world({
    entities: [{ raw: 'wall hung basin', hint: 'category' }, { raw: 'SRTZZ999', hint: 'product' }],
    resolver: derivedShape([{ token: 'SRTZZ999', resolved: false, ambiguous: false, matches: [], alternatives: [] }]),
    answerRows: ANSWER, rawMessage: 'wall hung basin and SRTZZ999',
  })).user_response;
  ok('U9-8 a genuine unknown CODE the customer typed still gets its miss line',
    () => withCode.includes('"SRTZZ999" — not found.'));
  ok('U9-9 ... on the same reply where the derived sentence was suppressed',
    () => !withCode.includes(`"${SENTENCE}"`));

  // ── THE FAIL-OPEN BOUNDS (UAC SR-U5: a genuine miss must never be silenced) ───────────
  // No entities sent at all => the sent-token set cannot discriminate, so the rule narrows to
  // the raw turn text ITSELF and every other token still speaks.
  const noEnt = H.run(H.AFTER(), H.world({
    entities: [], resolver: derivedShape([{ token: 'basin', resolved: false, ambiguous: false, matches: [], alternatives: [] }]),
    answerRows: ANSWER, rawMessage: SENTENCE,
  })).user_response;
  ok('U9-10 BOUND: with NO sent tokens, only the raw turn text itself is suppressed',
    () => !noEnt.includes(`"${SENTENCE}"`) && noEnt.includes('"basin" — not found.'));
  ok('U9-11 BOUND: ... and the token that merely LOOKS derived still speaks',
    () => noEnt.includes('"wall hung basin"'));
  // Neither signal available => suppress nothing.
  const blind = H.run(H.AFTER(), H.world({
    entities: [], resolver: derivedShape(), answerRows: ANSWER,   // rawMessage omitted -> tf-message throws
  })).user_response;
  ok('U9-12 BOUND: no sent tokens AND no turn text => nothing is suppressed (fail-open)',
    () => blind.includes(`"${SENTENCE}"`));

  // Case/whitespace folding, so a CRM echo that differs only in case is still a sent token.
  const folded = H.run(H.AFTER(), H.world({
    entities: [{ raw: '  Wall Hung Basin ', hint: 'category' }],
    resolver: derivedShape(), answerRows: ANSWER, rawMessage: SENTENCE,
  })).user_response;
  ok('U9-13 a sent token that differs only in case/whitespace is NOT treated as derived',
    () => folded.includes('"wall hung basin" — did you mean:'));

  // ── 🔴 F1 IS NOT CLOSED BY THIS NODE — the TRIPWIRE ──────────────────────────────────
  // The exec-12597815 boundary output was rendered by `build-suggest-offer`, NOT by
  // compile-current-state (verified from runData: bso emits `suggest_response` already
  // containing the label, and compile-current-state sets manualResponse and passes it through).
  // That node is OUTSIDE this slice's authorised two. This assertion states the GAP as a fact,
  // so it goes RED the moment somebody fixes bso — forcing this comment to be re-read rather
  // than letting a half-fix read as a whole one (LESSONS §63: right assertion, wrong object).
  // ── INVERTED at rev 4 (the third node was authorised) ────────────────────────────────
  // This assertion used to state the GAP — that `build-suggest-offer` still lacked the guard —
  // so that it would go red the moment anybody fixed it. It has been fixed, so it now states
  // the FIX, on the DEPLOYED bytes rather than on the local build. It stays here rather than
  // moving to U11 because its job is unchanged: make the two-emitter fact impossible to forget.
  const BSO_DEPLOYED = path.resolve(DIR, '../../../export/clone-sorento-consume-main-TEST/nodes/build-suggest-offer.js');
  ok('U9-14 the SECOND emitter `build-suggest-offer` carries the guard too, in the DEPLOYED bytes',
    () => {
      if (process.env.OFFLINE_NODES_DIR) return true;   // mutation mode: the copy is meant to differ
      if (!fs.existsSync(BSO_DEPLOYED)) { console.log('       export missing — run export-workflows.py'); return false; }
      const src = fs.readFileSync(BSO_DEPLOYED, 'utf8');
      return src.includes('_isDerivedQueryToken(res.token)')
        && src.includes('blocks.push(`"${token}" — did you mean:\\n`');
    });
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── SR-U10 · [F2] the Matched-on line is whole-answer scoped ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// Reviewer F2. The keys are spec-row-sourced but the sentence is appended to the WHOLE reply.
// MEASURED on the mixed shape this slice newly makes reachable (SA-5, exec 12597847): 15 rows,
// 10 of them code-prefix matches, closing with `_Matched on: mounting: Wall Hung._` — true of
// 5 rows, false of 10. RED baseline: compile-current-state.rev5.js.
{
  const ENT = [{ raw: 'SRTWC286', hint: 'product' }, { raw: 'wall hung basin', hint: 'category' }];
  const codeRow = (code, u) => ({ entity_type: 'product', canonical_code: code, uuid: u,
    match_field: 'product_code', match_tier: 'prefix' });
  const specR = (code, u) => ({ entity_type: 'product', canonical_code: code, uuid: u,
    match_field: 'specifications', match_tier: 'spec_search', similarity: 9.6,
    display: { product_name: 'Bravat wall hung basin', via_token: 'SRTWC286 and wall hung basin',
               class: 'Basin', matched_specs: ['mounting', 'free_terms'],
               specifications: { class: 'Basin', mounting: 'wall_hung' }, preferred_specs: [] } });
  const CODE_ROWS = [codeRow('SRTWC286', UU(41)), codeRow('SRTWC286-B', UU(42))];
  const SPEC_ROWS = [specR('BRBC2296-1', UU(43)), specR('BRBC22137W-1', UU(44))];
  const mixedAnswer = [...CODE_ROWS, ...SPEC_ROWS].map(m => ({ uuid: m.uuid, code: m.canonical_code }));
  const mixed = () => H.world({
    entities: ENT, answerRows: mixedAnswer, rawMessage: 'SRTWC286 and wall hung basin',
    resolver: {
      match_mode: 'and', fallback_match_mode: 'or',
      fallback_reason: 'AND-mode produced zero intersection; switched to OR-mode',
      tokens: ['SRTWC286', 'wall hung basin'], unresolved_tokens: [],
      spec_unmet: [], spec_asked: [{ key: 'mounting', value: 'wall_hung' }],
      resolutions: [
        { token: 'SRTWC286', resolved: false, ambiguous: true, matches: CODE_ROWS, alternatives: [] },
        { token: 'wall hung basin', resolved: false, ambiguous: false, matches: [], alternatives: [] },
        { token: 'SRTWC286 and wall hung basin', resolved: false, ambiguous: true, matches: SPEC_ROWS, alternatives: [] },
      ],
    },
  });

  const beforeMixed = H.run(mk(read('compile-current-state.rev5.js')), mixed()).user_response;
  const afterMixed = H.run(H.AFTER(), mixed()).user_response;
  ok('U10-1 RED: rev 5 closes a MIXED answer with a spec-only attribution',
    () => beforeMixed.includes('_Matched on: mounting: Wall Hung._'));
  ok('U10-2 the fix suppresses it entirely on a mixed answer',
    () => !/Matched on/.test(afterMixed));
  ok('U10-3 the spec rows are still SHOWN — suppression is of the CLAIM, not of the answer',
    () => afterMixed.includes('Here are the matching products.'));
  ok('U10-4 no OTHER section marker intruded', () => noForeign(afterMixed));

  // The all-spec answer (the AND arm, where the CRM REPLACES) must still render.
  const pureAnswer = SPEC_ROWS.map(m => ({ uuid: m.uuid, code: m.canonical_code }));
  const pure = () => H.world({
    entities: ENT, answerRows: pureAnswer, rawMessage: 'wall hung basin',
    resolver: { match_mode: 'and', tokens: ['wall hung basin'], unresolved_tokens: [],
      spec_unmet: [], spec_asked: [{ key: 'mounting', value: 'wall_hung' }],
      intersection: SPEC_ROWS,
      resolutions: [{ token: 'wall hung basin', resolved: false, ambiguous: true, matches: SPEC_ROWS, alternatives: [] }] },
  });
  // `class` is NOT in these rows' matched_specs, so it is correctly absent from the line —
  // the filter renders what the ANSWER earned, not everything `specifications` happens to hold.
  ok('U10-5 [PRESERVE] an ALL-spec answer still renders the line (F2 is a scope gate, not a kill)',
    () => H.run(H.AFTER(), pure()).user_response.includes('_Matched on: mounting: Wall Hung._'));
  ok('U10-6 ONE non-spec row among many is enough to suppress (the claim is all-or-nothing)',
    () => { const rows = [...SPEC_ROWS];
      const ans = [...pureAnswer, { uuid: UU(45), code: 'SOMETHING-CODE' }];
      const wld = H.world({ entities: ENT, answerRows: ans, rawMessage: 'wall hung basin',
        resolver: { match_mode: 'and', tokens: ['wall hung basin'], unresolved_tokens: [], spec_unmet: [],
          spec_asked: [{ key: 'mounting' }], intersection: rows,
          resolutions: [{ token: 'wall hung basin', resolved: false, ambiguous: true, matches: rows, alternatives: [] }] } });
      return !/Matched on/.test(H.run(H.AFTER(), wld).user_response); });
}

console.log('\n── SR-U11 · [F1] the SECOND emitter: build-suggest-offer, at the customer boundary ──');
// ════════════════════════════════════════════════════════════════════════════════════════
// Reviewer F1's cited output (exec 12597815) was rendered HERE, not by compile-current-state —
// verified from runData: bso emits `suggest_response` already containing the block, and
// compile-current-state sets `manualResponse` and passes it through verbatim. Rev 3 fixed the
// other emitter and this reply did not change; rev 4 fixes this one. Assertions are on
// `suggest_response`, the string the customer actually reads (LESSONS §63 rule i).
{
  const SENT = 'wall hung basin got SIRIM cert?';
  const alt = (c, u) => ({ entity_type: 'product', canonical_code: c, uuid: u, match_tier: 'trgm' });
  const ENTS = [{ raw: 'wall hung basin', hint: 'product', canonical_code: null, current_message: true, confident: true },
                { raw: 'SIRIM cert', hint: 'attachment_type', canonical_code: 'Certification', current_message: true, confident: true }];
  // The exec-12597815 envelope: the customer's token keeps its own (empty, trgm-alternative)
  // resolution, and the CRM appends one keyed on the WHOLE SENTENCE carrying three more.
  const resolver = (extra = []) => ({
    match_mode: 'and', fallback_match_mode: 'or',
    tokens: ['wall hung basin', 'SIRIM cert'],
    unresolved_tokens: ['wall hung basin', SENT],
    resolutions: [
      { token: 'wall hung basin', resolved: false, ambiguous: false, matches: [],
        alternatives: [alt('BRBC2296-1 (WALL HUNG)', UU(31)), alt('MAB7029C-WALL HUNG', UU(32)), alt('MAB7029E-WALL HUNG', UU(33))] },
      { token: 'SIRIM cert', resolved: true, alternatives: [],
        matches: [{ entity_type: 'attachment_type', canonical_code: 'Certification', uuid: UU(40), match_tier: 'exact' }] },
      ...extra,
      { token: SENT, resolved: false, ambiguous: false, matches: [],
        alternatives: [alt('BRBC22137W-1 (WALL HUNG)', UU(34)), alt('BRBC22292W', UU(35)), alt('BRBC22350W-1-SG', UU(36))] },
    ],
  });
  const wB = (o) => BSO.world(Object.assign({ entities: ENTS, resolver: resolver(), rawMessage: SENT }, o || {}));
  const before11 = BSO.run(BSO.BEFORE(), wB());
  const after11 = BSO.run(BSO.AFTER(), wB());
  console.log('    >> ' + JSON.stringify(after11.suggest_response));

  ok('U11-1 RED: the deployed bso renders the customer\'s whole QUESTION as a failed search term',
    () => before11.suggest_response.includes(`"${SENT}" — did you mean:`));
  ok('U11-2 the fix removes it', () => !after11.suggest_response.includes(`"${SENT}" — did you mean:`));
  ok('U11-3 ... and the sentence appears NOWHERE in the reply (assert the WHOLE string, §68)',
    () => !after11.suggest_response.includes(SENT));
  ok('U11-4 the customer\'s OWN token still gets its suggestions (no over-suppression)',
    () => /BRBC2296-1 \(WALL HUNG\)/.test(after11.suggest_response)
       && /MAB7029C-WALL HUNG/.test(after11.suggest_response)
       && /MAB7029E-WALL HUNG/.test(after11.suggest_response));
  ok('U11-5 the phantom token\'s three candidates are gone from the offer',
    () => !/BRBC22137W-1|BRBC22292W|BRBC22350W-1-SG/.test(after11.suggest_response));
  eq('U11-6 the offer roster drops from 6 to 3', () => (after11.suggest_last_result_set || []).length, 3);

  // ── 🔴 THE QUIETER DEFECT F1 ALSO FIXES — pick-linkage corruption ────────────────────
  // Each dym candidate carries `for_raw`, the entity token a pick must replace (memory
  // `didyoumean-entity-retention`: "label each suggestion with its source token so a pick
  // replaces the right entity and keeps customer/date"). On the deployed body three of six
  // candidates carry `for_raw: "<the whole sentence>"` — a raw the PARSER NEVER EMITTED, so a
  // customer picking one of them hands `output_exchange` a replacement target that matches no
  // entity. The wording defect is what the reviewer saw; this one is silent.
  const rawsOf = (o) => [...new Set((o.dym_candidates || []).map(c => c.for_raw))];
  const sent = new Set(ENTS.map(e => e.raw));
  ok('U11-7 RED: the deployed body attributes candidates to a token the parser never emitted',
    () => rawsOf(before11).some(r => !sent.has(r)));
  ok('U11-8 every surviving candidate is attributed to a REAL parser entity',
    () => rawsOf(after11).length > 0 && rawsOf(after11).every(r => sent.has(r)));

  // ── NO OVER-SUPPRESSION / FAIL-OPEN, same bounds as the other emitter ────────────────
  const withCode = BSO.run(BSO.AFTER(), wB({
    entities: [...ENTS, { raw: 'SRTZZ999', hint: 'product' }],
    resolver: resolver([{ token: 'SRTZZ999', resolved: false, ambiguous: false, matches: [],
      alternatives: [alt('SRTZZ998', UU(37))] }]),
    rawMessage: 'wall hung basin and SRTZZ999 got SIRIM cert?',
  }));
  ok('U11-9 a genuine unknown CODE the customer typed still gets its suggestions',
    () => withCode.suggest_response.includes('SRTZZ999'));
  ok('U11-10 ... on the same reply where the derived sentence is suppressed',
    () => !withCode.suggest_response.includes('wall hung basin and SRTZZ999 got SIRIM cert?'));

  const blind = BSO.run(BSO.AFTER(), BSO.world({ entities: [], resolver: resolver() }));  // no tf-message
  ok('U11-11 BOUND: no sent tokens AND no turn text => nothing is suppressed (fail-open)',
    () => blind.suggest_response.includes(SENT));
  const noEnt = BSO.run(BSO.AFTER(), BSO.world({ entities: [], resolver: resolver(), rawMessage: SENT }));
  ok('U11-12 BOUND: with no sent tokens, only the raw turn text itself is suppressed',
    () => !noEnt.suggest_response.includes(`"${SENT}" — did you mean:`)
       && noEnt.suggest_response.includes('wall hung basin'));

  // The wording in THIS block is identical on live and on the clone, unlike
  // compile-current-state's miss lines — asserted so a later edit cannot quietly rewrite it.
  ok('U11-13 the did-you-mean wording is untouched by the guard',
    () => readBuilt('build-suggest-offer.after.js').includes('blocks.push(`"${token}" — did you mean:\\n`'));

  // ONE definition across both emitters.
  // The two splices sit at different scope depths (2-space inside compile-current-state's IIFE,
  // 0-space at build-suggest-offer's top level), so they are identical modulo LEADING
  // indentation — which is exactly what `derivedTokenSrc(parserVar, indent)` varies. Comparing
  // the logic lines still goes red if anybody hand-edits one copy, which is the point.
  ok('U11-14 both emitters carry the SAME predicate logic (one source, two splices)',
    () => {
      const pred = '_isDerivedQueryToken = (tok) => {';
      const grab = (src) => src.slice(src.indexOf(pred)).split('};')[0]
        .split('\n').map(l => l.trim()).join('\n');
      const a = readBuilt('compile-current-state.after.js');
      const b = readBuilt('build-suggest-offer.after.js');
      return a.includes(pred) && b.includes(pred) && grab(a) === grab(b);
    });
  // ... and the sent-token half too, which is the arm that actually decides most turns.
  ok('U11-15 both emitters build the sent-token set from their own parser output, identically',
    () => {
      const grab = (src, v) => src.slice(src.indexOf('const _sentTokens = (() => {'))
        .split('})();')[0].split('\n').map(l => l.trim()).join('\n').split(v + '.entities').join('PARSER.entities');   // ALL occurrences, not just the first
      return grab(readBuilt('compile-current-state.after.js'), 'qf')
          === grab(readBuilt('build-suggest-offer.after.js'), 'q');
    });
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── D · deployment gates (run these at the START of every test pass, LESSONS §64) ──');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  ok('D0 the built AFTER body is what build-ccs.js emits (deterministic)', () => {
    if (process.env.OFFLINE_NODES_DIR) return true;   // mutation mode: the copy is meant to differ
    return require('./build-ccs.js').build() === read('compile-current-state.after.js');
  });
  ok('D0b the built AFTER jsonBody is what build-body.js emits (deterministic)', () => {
    if (process.env.OFFLINE_NODES_DIR) return true;
    return require('./build-body.js').build() === read('resolve-entity-http.after.jsonBody.txt');
  });
  ok('D0c the AFTER body parses', () => { new Function('$', '$input', '$execution', read('compile-current-state.after.js')); return true; });
  // The frozen rev-4 bytes are this slice's RED baseline; if the builder ever emitted them
  // again the whole SR-U8 red record would be vacuous (LESSONS §70d: a harness needs a
  // discriminator that changes only when the intended version is loaded).
  ok('D0d the AFTER body DIFFERS from the frozen rev-4 RED baseline',
    () => read('compile-current-state.after.js') !== read('compile-current-state.rev4.js'));
  ok('D0d2 the AFTER body DIFFERS from the frozen rev-5 RED baseline (F1/F2 are real bytes)',
    () => read('compile-current-state.after.js') !== read('compile-current-state.rev5.js'));
  ok('D0e the AFTER jsonBody DIFFERS from the frozen rev-4 RED baseline',
    () => read('resolve-entity-http.after.jsonBody.txt') !== read('resolve-entity-http.rev4.jsonBody.txt'));

  // D1: three outcomes, never two. `not-yet-deployed` and `drifted` are DIFFERENT facts.
  const expPath = path.resolve(DIR, '../../../export/clone-sorento-consume-main-TEST/nodes/compile-current-state.js');
  ok('D1 clone deployment state (DEPLOYED / NOT-YET-DEPLOYED / SUPERSEDED / DRIFTED)', () => {
    if (process.env.OFFLINE_NODES_DIR) { console.log('       (mutation mode — deployment gate skipped)'); return true; }
    if (!fs.existsSync(expPath)) { console.log('       export missing — run export-workflows.py'); return false; }
    const deployed = fs.readFileSync(expPath, 'utf8');
    const after = read('compile-current-state.after.js');
    const before = read('compile-current-state.before.js');
    if (deployed === after) { console.log('       state: DEPLOYED (sha ' + sha256(after).slice(0, 12) + ')'); return true; }
    if (deployed === before) { console.log('       state: NOT-YET-DEPLOYED (clone still carries the pre-fix body) — expected before the PUT'); return true; }
    // A revision of THIS change that has been superseded is a different fact from "someone
    // else edited the node", and reporting them as one number is what §64 rule ii warns
    // about. Named here so the report says WHICH body it found, not merely "not ours".
    const PRIOR = {
      e727631f94d523e37c89dd61736bd8f65850f6fcec663c542a0497aecd0aa335: 'rev 1 (bare wire value)',
      e3b844c6cb674f54b780a817af5d0287607db790aafc207ddf1d11e73f3aa4f0: 'rev 2 (customer span, first match)',
      '7959776fa7ce4a0fe5908ca1bcdc5c4ef9c653b02f2cce8db7f3407c86a7566e': 'rev 3 (span nearest the key; no N-1a line)',
      '82707a95a7c63d74b6dbc963774630e21a5bd1c9cb4748671706a4a8a63e67b5': 'rev 4 (N-1a KEY NAMES, pre-raw-text-migration — frozen as compile-current-state.rev4.js, the RED baseline for SR-U8)',
      '9a8f141c473028d4054400049baf3f8d622525d616e7d558375fd8f10a0b2aee': 'rev 5 (raw-text migration WITHOUT the reviewer\'s F1/F2 — frozen as compile-current-state.rev5.js, the RED baseline for SR-U9 and the F2 assertions)',
    };
    const known = PRIOR[sha256(deployed)];
    if (known) {
      console.log(`       state: SUPERSEDED — the clone still carries ${known}. Expected between the`);
      console.log('       build and the PUT; a FAIL after the PUT means the write did not land.');
      return false;
    }
    console.log('       state: DRIFTED — the clone is neither the before nor the after body.');
    console.log('       deployed sha ' + sha256(deployed).slice(0, 12) + ' / after ' + sha256(after).slice(0, 12) + ' / before ' + sha256(before).slice(0, 12));
    console.log('       This is LESSONS §64: a UI save can silently revert a published clone change.');
    return false;
  });

  // D2 — the SAME gate for the THIRD leaf (rev 4). Three leaves now ship, so three gates.
  const bsoPath = path.resolve(DIR, '../../../export/clone-sorento-consume-main-TEST/nodes/build-suggest-offer.js');
  ok('D2 clone deployment state for build-suggest-offer (the second F1 emitter)', () => {
    if (process.env.OFFLINE_NODES_DIR) { console.log('       (mutation mode — deployment gate skipped)'); return true; }
    if (!fs.existsSync(bsoPath)) { console.log('       export missing — run export-workflows.py'); return false; }
    const deployed = fs.readFileSync(bsoPath, 'utf8');
    const after = read('build-suggest-offer.after.js');
    const before = read('build-suggest-offer.before.js');
    if (deployed === after) { console.log('       state: DEPLOYED (sha ' + sha256(after).slice(0, 12) + ')'); return true; }
    if (deployed === before) { console.log('       state: NOT-YET-DEPLOYED (clone still carries the pre-F1 bso body)'); return false; }
    console.log('       state: DRIFTED — deployed sha ' + sha256(deployed).slice(0, 12)
      + ' / after ' + sha256(after).slice(0, 12) + ' / before ' + sha256(before).slice(0, 12));
    return false;
  });
  ok('D0f the built bso body is what build-bso.js emits (deterministic)', () => {
    if (process.env.OFFLINE_NODES_DIR) return true;
    return require('./build-bso.js').build() === read('build-suggest-offer.after.js');
  });
  ok('D0g the bso AFTER body DIFFERS from its frozen RED baseline',
    () => read('build-suggest-offer.after.js') !== read('build-suggest-offer.before.js'));

  // D1b — the SAME gate for `resolve-entity-http.jsonBody`, which is NOT a Code node and so is
  // invisible to `export/*/nodes/*.js`. LESSONS §71: a promote review built from nodes/*.js is
  // blind to exactly this parameter, and that blindness shipped a live outage. The jsonBody is
  // read out of the exported workflow.json instead.
  const wfPath = path.resolve(DIR, '../../../export/clone-sorento-consume-main-TEST/workflow.json');
  ok('D1b clone deployment state for resolve-entity-http.jsonBody (non-Code node)', () => {
    if (process.env.OFFLINE_NODES_DIR) { console.log('       (mutation mode — deployment gate skipped)'); return true; }
    if (!fs.existsSync(wfPath)) { console.log('       export missing — run export-workflows.py'); return false; }
    const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    const node = (wf.nodes || []).find(n => n.name === 'resolve-entity-http');
    if (!node) { console.log('       node resolve-entity-http not found in the export'); return false; }
    const deployed = String((node.parameters || {}).jsonBody || '');
    const after = read('resolve-entity-http.after.jsonBody.txt');
    const rev4 = read('resolve-entity-http.rev4.jsonBody.txt');
    const before = read('resolve-entity-http.before.jsonBody.txt');
    if (deployed === after) { console.log('       state: DEPLOYED (sha ' + sha256(after).slice(0, 12) + ')'); return true; }
    if (deployed === rev4) {
      console.log('       state: SUPERSEDED — the clone still carries rev 4 (N-0 free_terms).');
      console.log('       Expected between the build and the PUT; a FAIL after the PUT means the write did not land.');
      return false;
    }
    if (deployed === before) { console.log('       state: NOT-YET-DEPLOYED (pre-SR body)'); return false; }
    console.log('       state: DRIFTED — deployed sha ' + sha256(deployed).slice(0, 12)
      + ' / after ' + sha256(after).slice(0, 12) + ' / rev4 ' + sha256(rev4).slice(0, 12));
    return false;
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
