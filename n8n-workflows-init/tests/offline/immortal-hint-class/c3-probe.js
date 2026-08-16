#!/usr/bin/env node
// §IH-10..§IH-16 — C3 `multitoken-d1-annotate`, offline (no n8n, no network).
//   node c3-probe.js [dir]     dir must hold the five node bodies (default: ./c3.after)
//
// The world builder is the same shape as tests/offline/dym-probe-before-offer/harness.js, which is
// the harness the shipped feature was built against — deliberately, so the two agree on what a turn
// looks like.
//
// ⚠️ SCOPE LIMIT, stated before any green is read. This proves the PRODUCER object and the rendered
// `suggest_response` string. It is NOT the customer boundary: nothing here models the by-name
// re-sourcing downstream (`escalate-catalog` re-reads `escalate_message` from
// `$('not-found-error-message')`, LESSONS §63c). The multi-token block writes `suggest_response`,
// which is a different field from the one that defect hit — but "different field, therefore safe"
// is an argument, not a measurement, and the real run must still assert
// `save-session-vars.user_response`.
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'c3.after');
const BASE = path.join(__dirname, 'c3.before');
// 🔴 F-STALE (reviewer, 2026-08-08): a before/after suite legitimately keeps a local AFTER copy,
// but it must PROVE that copy is the published body — otherwise every green here is a statement
// about bytes nobody is running. Fails loudly and exits 2 if it has drifted.
const { assertMatchesExport } = require('../node-source');
const _C3_FILES = ['dym-transform.js', 'dym-transform-partial.js', 'dym-annotate.js',
                   'dym-annotate-partial.js', 'build-suggest-offer.js', 'compile-current-state.js'];
if (path.basename(DIR) === 'c3.after') {
  const _v = assertMatchesExport('clone-sorento-consume-main-TEST',
    Object.fromEntries(_C3_FILES.map(f => [path.join(DIR, f), f])));
  console.log(`c3.after verified == published clone ${String(_v).slice(0, 8)}`);
}
const src = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const mk = (d, f) => new Function('$', '$input', '$execution', src(d, f));

let fails = 0, asserted = 0;
const RED = [];
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  asserted++;
  if (a !== b) { fails++; RED.push(name); console.log(`RED  ${name}\n     got  ${a}\n     want ${b}`); }
  else console.log(`ok   ${name}`);
};
const truthy = (name, v, extra) => {
  asserted++;
  if (!v) { fails++; RED.push(name); console.log(`RED  ${name}${extra ? '\n     ' + extra : ''}`); }
  else console.log(`ok   ${name}`);
};

const item = (j) => ({ json: j });
const nodeStub = (j, executed = true) => ({ isExecuted: executed, first: () => item(j), all: () => [item(j)] });
const UU = (n) => `1439736c-20ca-4bba-b387-b242ff4a45${String(n).padStart(2, '0')}`;
const cand = (code, uuid, type = 'product') => ({ canonical_code: code, uuid, entity_type: type, match_tier: 'fuzzy' });
const attRow = (code, type) => ({ title: code, fields: [{ label: 'Product Code', value: code }, { label: 'Attachment Type', value: type }] });

function world(o) {
  const notFound = o.notFound || {
    escalate_message: "Couldn't find some items. Would you like me to escalate?",
    is_clarification: false, found_summary: '',
  };
  const nodes = {
    "Call 'sub-query-reformulator'": nodeStub({ output: {
      domain_hint: o.domain, entities: o.parserEntities || [],
      routing: { suggested_team: 'customer_service' } } }),
    'resolve-entity': nodeStub({ resolutions: o.resolutions }),
    'disallowed-entity-gate': nodeStub({
      gate_debug: { domain: o.domain, allowed_lookup: o.allowed },
      compatible_entities: o.compat || [], require_specific: false }),
    'not-found-error-message': nodeStub(notFound),
    'sibling-transform': nodeStub({}, false),
    'sibling-probe': nodeStub({}, false),
    "Call 'sub-get-results'": nodeStub({}, false),
  };
  const $ = (n) => { if (!(n in nodes)) throw new Error(`no node ${n}`); return nodes[n]; };
  return { $, nodes, notFound };
}
const runXf = (d, w, j) => mk(d, 'dym-transform.js')(w.$, { first: () => item(j) }, { id: '999' })[0].json;
const runAnn = (d, w, xf, probe) => {
  w.nodes['dym-transform'] = nodeStub(xf);
  return mk(d, 'dym-annotate.js')(w.$, { first: () => item(probe) }, { id: '999' });
};
const runBso = (d, w, j, ann) => {
  w.nodes['dym-annotate'] = ann ? nodeStub(ann) : nodeStub({}, false);
  return mk(d, 'build-suggest-offer.js')(w.$, { first: () => item(j) }, { id: '999' });
};

const ATT_ALLOWED = ['product', 'attachment', 'attachment_type', 'category', 'brand', 'certificate'];

// 🔴 GENUINELY MULTI-TOKEN (plan §7.2). Two real product codes the user typed in one message, both
// missing. NOT a stuck-entity artefact: once C1/C2 land the reported six-turn transcript collapses
// to a single token and a fixture built from it would pass WITHOUT running any C3 code.
function multiWorld(nTokens = 2, perToken = 3) {
  const resolutions = [];
  for (let t = 0; t < nTokens; t++) {
    resolutions.push({
      token: `tok${t + 1}`, resolved: false,
      matches: Array.from({ length: perToken }, (_, i) => cand(`P${t + 1}-${i + 1}`, UU(t * 10 + i + 1))),
    });
  }
  return world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: resolutions.map(r => ({ raw: r.token, hint: 'product' }))
      .concat([{ raw: 'cert', hint: 'attachment_type' }]),
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions,
  });
}
const stripSfx = (s) => String(s).replace(/ - (has|no) [a-z ]+$/gm, '');

// ══════════════════ §IH-10 — the pre-change baseline, CAPTURED ══════════════════
// Every byte-identity claim below diffs against THIS, not against a re-derivation. A byte-identity
// assertion with no captured baseline is void.
console.log('\n── §IH-10 baseline (pre-change bodies) ──');
const BASELINE = (() => {
  const w = multiWorld();
  const xf = runXf(BASE, w, w.notFound);
  const out = runBso(BASE, w, w.notFound, null);
  console.log('    pre-change probe_skip_reason :', JSON.stringify(xf.probe_skip_reason));
  console.log('    pre-change suggest_response  :', JSON.stringify(out.suggest_response));
  return { xf, out };
})();
eq('§IH-10 pre-change D1 multi-token was BLOCKED', BASELINE.xf.probe_skip_reason, 'multi_token');
eq('§IH-10 pre-change probe_needed false', BASELINE.xf.probe_needed, false);
truthy('§IH-10 pre-change render carries NO suffix',
  !/ - (has|no) /.test(BASELINE.out.suggest_response));

// ══════════════════ §IH-11 — the headline ══════════════════
console.log('\n── §IH-11 multi-token D1 annotates, numbering never moves ──');
{
  const w = multiWorld();
  const xf = runXf(DIR, w, w.notFound);
  eq('§IH-11.4 probe_lane', xf.probe_lane, 'd1');
  eq('§IH-11.4 probe_skip_reason null (cannot pass by failing to probe)', xf.probe_skip_reason, null);
  eq('§IH-11.4 probe_needed', xf.probe_needed, true);
  truthy("§IH-11.5 probe_skip_reason is never 'multi_token'", xf.probe_skip_reason !== 'multi_token');
  truthy('§IH-11.5s the multi_token literal is RETAINED in source',
    src(DIR, 'dym-transform.js').includes("'multi_token'"),
    'the literal must stay so runData can tell "never fired" from "constant removed"');
  eq('§IH-11.probe all 6 candidates probed', xf.dym_candidate_codes,
    ['P1-1', 'P1-2', 'P1-3', 'P2-1', 'P2-2', 'P2-3']);

  // P1-2 and P2-3 have the certificate; the rest do not.
  const ann = runAnn(DIR, w, xf, { answers: [attRow('P1-2', 'Certification'), attRow('P2-3', 'Certification')] });
  eq('§IH-11.probe annotate ok', ann.dym_probe_meta.ok, true);
  const out = runBso(DIR, w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));

  truthy('§IH-11.1 probed HAS carries " - has certificate"',
    out.suggest_response.includes('P1-2 - has certificate') &&
    out.suggest_response.includes('P2-3 - has certificate'));
  truthy('§IH-11.1 probed NOT-HAS carries " - no certificate"',
    out.suggest_response.includes('P1-1 - no certificate') &&
    out.suggest_response.includes('P2-1 - no certificate'));

  // 🔴 clause 3 — THE ANTI-RENUMBER GATE, and the whole reason C3 is allowed to exist.
  eq('§IH-11.3 numbering byte-identical to the §IH-10 baseline once suffixes are stripped',
    stripSfx(out.suggest_response), BASELINE.out.suggest_response);

  // §IH-11 invariants
  eq('§IH-11.inv suggest_quick_reply byte-identical', out.suggest_quick_reply,
    BASELINE.out.suggest_quick_reply);
  eq('§IH-11.inv suggest_quick_reply is exactly Yes/No', out.suggest_quick_reply,
    "Yes escalate,No it's okay");
  truthy('§IH-11.inv no suffix leaked into quick_reply',
    !out.suggest_quick_reply.includes(' - has ') && !out.suggest_quick_reply.includes(' - no '));
  eq('§IH-11.inv suggest_last_result_set BARE (labels + values)',
    out.suggest_last_result_set, BASELINE.out.suggest_last_result_set);
  eq('§IH-11.inv dym_candidates byte-identical (for_raw/for_hint/for_canonical)',
    out.dym_candidates, BASELINE.out.dym_candidates);
}

// ══════════════════ §IH-FP-R — the by-name downstream consumers ══════════════════
// Enumerated by RENDERED STRING, not graph inbound (LESSONS §63ii). Grepping the clone + live
// spine for `Couldn't find some items` / `— did you mean` returns THREE Code nodes:
//   build-suggest-offer   — the producer, under test
//   compile-current-state — `response = _sug.suggest_response` (a by-name read of the WHOLE object,
//                           so it carries our annotation; this is the customer path)
//   crossdomain-compose   — does NOT re-render, but SPLICES a cross-domain block into
//                           `out.user_response` at the earliest of five MARKERS, then snaps to the
//                           start of that marker's line/sentence.
// C3 must not move that splice point. The invariant that guarantees it is asserted here rather
// than argued: the suffix only ever lands on CANDIDATE lines, which all sit after the first
// `— did you mean:` header, and it contains no `. ` that could re-target the sentence snap.
console.log('\n── §IH-FP-R crossdomain-compose splice point is unmoved ──');
{
  const w = multiWorld();
  const xf = runXf(DIR, w, w.notFound);
  const ann = runAnn(DIR, w, xf, { answers: [attRow('P1-2', 'Certification')] });
  const s = runBso(DIR, w, ann, ann).suggest_response;
  const b = BASELINE.out.suggest_response;
  const firstMarker = (t) => t.toLowerCase().indexOf('did you mean');
  eq('§IH-FP-R earliest marker index unmoved', firstMarker(s), firstMarker(b));
  truthy('§IH-FP-R no suffix appears before the marker',
    !/ - (has|no) /.test(s.slice(0, firstMarker(s))));
  truthy("§IH-FP-R the suffix introduces no '. ' that could re-target the sentence snap",
    !/ - (has|no) [a-z ]*\. /.test(s));
  eq('§IH-FP-R the lead-in line is byte-identical', s.split('\n')[0], b.split('\n')[0]);
  eq('§IH-FP-R every header line is byte-identical',
    s.split('\n').filter(l => l.includes('did you mean')),
    b.split('\n').filter(l => l.includes('did you mean')));
}

// ══════════════════ §IH-12 — the two scope questions ══════════════════
console.log('\n── §IH-12 scope, asserted not assumed ──');
{
  const w = multiWorld(3, 2);
  const xf = runXf(DIR, w, w.notFound);
  eq('§IH-12a exactly ONE tool for the whole turn (probe_tool is a single string)',
    typeof xf.probe_tool, 'string');
  eq('§IH-12a one item emitted ⇒ ONE sub-call regardless of token count',
    mk(DIR, 'dym-transform.js')(w.$, { first: () => item(w.notFound) }, { id: '9' }).length, 1);

  // (b) mixed entity types: category/brand are in allowed_lookup but NOT in MAPPABLE.
  const wm = world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'tok1', hint: 'product' }, { raw: 'tok2', hint: 'category' },
                     { raw: 'cert', hint: 'attachment_type' }],
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions: [
      { token: 'tok1', resolved: false, matches: [cand('P1-1', UU(1)), cand('P1-2', UU(2))] },
      { token: 'tok2', resolved: false, matches: [cand('CAT-A', UU(3), 'category'), cand('BR-B', UU(4), 'brand')] },
    ],
  });
  const xm = runXf(DIR, wm, wm.notFound);
  eq('§IH-12b unmappable types absent from dym_candidate_codes', xm.dym_candidate_codes, ['P1-1', 'P1-2']);
  const am = runAnn(DIR, wm, xm, { answers: [attRow('P1-2', 'Certification')] });
  const om = runBso(DIR, wm, am, am);
  console.log('    >>', JSON.stringify(om.suggest_response));
  truthy('§IH-12b unmappable codes render BARE', !/CAT-A - /.test(om.suggest_response) && !/BR-B - /.test(om.suggest_response));
  truthy('§IH-12b the mappable token is still annotated', om.suggest_response.includes('P1-2 - has certificate'));
}

// ══════════════════ §IH-13 — the probe cap ══════════════════
console.log('\n── §IH-13 probe cap: overflow renders BARE ──');
{
  const w = multiWorld(5, 3);                       // 5 tokens x cap3 = 15 candidates
  const xf = runXf(DIR, w, w.notFound);
  eq('§IH-13 probe_cap_applied', xf.probe_cap_applied, true);
  eq('§IH-13 probed count == product_attachment probe_cap', xf.dym_candidate_codes.length, 8);
  eq('§IH-13 capped codes recorded', xf.dym_capped_codes.length, 7);
  eq('§IH-13 probed + capped == the full 15', xf.dym_candidate_codes.length + xf.dym_capped_codes.length, 15);
  truthy('§IH-13 probed and capped are disjoint',
    !xf.dym_candidate_codes.some(c => xf.dym_capped_codes.includes(c)));
  eq('§IH-13 the turn does NOT dead-end', xf.probe_needed, true);

  const ann = runAnn(DIR, w, xf, { answers: [attRow('P1-2', 'Certification')] });
  const out = runBso(DIR, w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('§IH-13 an uncapped code IS annotated', out.suggest_response.includes('P1-2 - has certificate'));
  for (const c of xf.dym_capped_codes) {
    truthy(`§IH-13 capped ${c} renders BARE (never a misleading "- no")`,
      !out.suggest_response.includes(`${c} - `));
  }
  // numbering STILL byte-identical to a pre-change render of the same world
  const wB = multiWorld(5, 3);
  const baseOut = runBso(BASE, wB, wB.notFound, null);
  eq('§IH-13.n numbering unchanged under capping', stripSfx(out.suggest_response), baseOut.suggest_response);
}

// ══════════════════ §IH-13b — the INVENTORY cap, measured (tester pass 2 F1) ══════════════════
// 🔴 This arm exists because the first shipped value was WRONG. `inventory: 5` was derived from an
// assumed grain of one row per active warehouse; exec 11646010 measured the real grain as
// warehouse × SYSTEM-LOCATION — 13 rows for a SINGLE stocked candidate. 5 × 13 = 65 > 50, so the
// cap saturated every time and the feature silently vanished on exactly the multi-token inventory
// turns it exists for. Measured-safe cap is 3.
console.log('\n── §IH-13b inventory cap = 3, grounded in the measured 13-rows/candidate grain ──');
{
  const INV_ALLOWED = ['product', 'category', 'brand'];
  const invRow = (code, qty) => ({ title: code,
    fields: [{ label: 'Product Code', value: code }, { label: 'Quantity On Hand', value: qty }] });
  const invWorld = () => world({
    domain: 'inventory', allowed: INV_ALLOWED,
    parserEntities: [{ raw: 'tok1', hint: 'product' }, { raw: 'tok2', hint: 'product' }],
    resolutions: [
      { token: 'tok1', resolved: false, matches: [cand('I1-1', UU(1)), cand('I1-2', UU(2)), cand('I1-3', UU(3))] },
      { token: 'tok2', resolved: false, matches: [cand('I2-1', UU(4)), cand('I2-2', UU(5)), cand('I2-3', UU(6))] },
    ],
  });
  const w = invWorld();
  const xf = runXf(DIR, w, w.notFound);
  eq('§IH-13b inventory probe_cap is 3 (NOT 5 — see exec 11646010)', xf.dym_candidate_codes.length, 3);
  eq('§IH-13b cap applied on a 6-candidate multi-token inventory turn', xf.probe_cap_applied, true);
  eq('§IH-13b the other 3 are recorded as capped', xf.dym_capped_codes.length, 3);
  eq('§IH-13b the turn still probes (does not dead-end)', xf.probe_needed, true);

  // THE POINT OF THE FIX: at the measured grain, a capped inventory probe must NOT saturate.
  const MEASURED_ROWS_PER_CANDIDATE = 13;                       // exec 11646010
  const rows = [];
  for (const c of xf.dym_candidate_codes) {
    for (let i = 0; i < MEASURED_ROWS_PER_CANDIDATE; i++) rows.push(invRow(c, i === 0 ? '5' : '0'));
  }
  eq('§IH-13b 3 x 13 = 39 rows, under the 50 budget', rows.length, 39);
  const ann = runAnn(DIR, w, xf, { answers: rows });
  eq('§IH-13b annotation SURVIVES at the measured grain', ann.dym_probe_meta.ok, true);
  truthy('§IH-13b the annotation is non-empty', ann.dym_available_codes.length > 0);

  // and the counterfactual: the OLD cap of 5 would have saturated and silently killed the feature
  const rows5 = [];
  for (let c = 0; c < 5; c++) for (let i = 0; i < MEASURED_ROWS_PER_CANDIDATE; i++) rows5.push(invRow('X' + c, '0'));
  eq('§IH-13b counterfactual: the OLD cap of 5 would saturate (5 x 13 = 65 >= 50)', rows5.length >= 50, true);

  // product_attachment must be UNDISTURBED by the inventory change
  const wa = multiWorld(5, 3);
  eq('§IH-13b product_attachment cap still 8 (F1 did not disturb the live-proven arm)',
    runXf(DIR, wa, wa.notFound).dym_candidate_codes.length, 8);
}

// ══════════════════ §IH-14 — page saturation ══════════════════
console.log('\n── §IH-14 page saturation ⇒ zero annotation ──');
{
  const w = multiWorld(5, 3);
  const xf = runXf(DIR, w, w.notFound);
  // 50 rows = a full backend page (app/schemas/common.py:37 limit=50). Truncation is structurally
  // undetectable, so a full page is the only available signal.
  const answers = Array.from({ length: 50 }, (_, i) => attRow(`P1-${(i % 3) + 1}`, 'Certification'));
  const ann = runAnn(DIR, w, xf, { answers });
  eq('§IH-14 ok false', ann.dym_probe_meta.ok, false);
  eq('§IH-14 reason', ann.dym_probe_meta.reason, 'page_saturated');
  eq('§IH-14 dym_available_codes empty', ann.dym_available_codes, []);
  eq('§IH-14 answer_count retained for diagnosis', ann.dym_probe_meta.answer_count, 50);
  const out = runBso(DIR, w, ann, ann);
  const wB = multiWorld(5, 3);
  eq('§IH-14 suggest_response byte-identical to the un-annotated baseline',
    out.suggest_response, runBso(BASE, wB, wB.notFound, null).suggest_response);

  // 49 rows must NOT saturate — otherwise the gate is a constant, not an instrument
  const ann49 = runAnn(DIR, w, xf, { answers: answers.slice(0, 49) });
  eq('§IH-14 boundary: 49 rows does NOT saturate', ann49.dym_probe_meta.ok, true);
}

// ══════════════════ §IH-15 — the -partial twins carry the same edit ══════════════════
console.log('\n── §IH-15 the -partial twins ──');
{
  const normLane = (s) => s
    .replace(/const _PAYLOAD_SRC = .*$/m, 'const _PAYLOAD_SRC = <LANE>;')
    .replace(/const _XF_SRC      = .*$/m, 'const _XF_SRC      = <LANE>;');
  eq('§IH-15 dym-transform twins identical', src(DIR, 'dym-transform.js'), src(DIR, 'dym-transform-partial.js'));
  eq('§IH-15 dym-annotate twins identical apart from the two lane literals',
    normLane(src(DIR, 'dym-annotate.js')), normLane(src(DIR, 'dym-annotate-partial.js')));
  truthy('§IH-15 the cap reached dym-transform-partial', src(DIR, 'dym-transform-partial.js').includes('probe_cap_applied'));
  truthy('§IH-15 saturation reached dym-annotate-partial', src(DIR, 'dym-annotate-partial.js').includes('_PAGE_SATURATION'));

  // the PARTIAL lane's own multi-token fixture — it already shipped multi-token, so it inherits
  // both mitigations or it keeps the pre-existing truncation defect (dym plan §8f).
  const w = multiWorld(5, 3);
  w.nodes['central-exchange'] = nodeStub({ has_result: true });
  const xfP = runXf(DIR, w, w.notFound);
  eq('§IH-15 partial lane detected', xfP.probe_lane, 'partial');
  eq('§IH-15 partial lane cap applied too', xfP.probe_cap_applied, true);
  eq('§IH-15 partial lane probed count', xfP.dym_candidate_codes.length, 8);
}

// ══════════════════ §IH-16 — everything else byte-identical ══════════════════
console.log('\n── §IH-16 scope: single-token + non-enabled domains unchanged ──');
{
  // single-token CODE mode, product_attachment
  const one = () => world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'ibwc8315-s10', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }],
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions: [{ token: 'ibwc8315-s10', resolved: false,
      matches: [cand('IBWC8315-S', UU(1)), cand('IBWC8315-SL', UU(2)), cand('IBWC8315-S10-P', UU(3))] }],
  });
  const wA = one(), wB = one();
  const xfA = runXf(DIR, wA, wA.notFound), xfB = runXf(BASE, wB, wB.notFound);
  eq('§IH-16 single-token dym_candidate_codes unchanged', xfA.dym_candidate_codes, xfB.dym_candidate_codes);
  eq('§IH-16 single-token probe_cap NOT applied (cap3 < probe_cap)', xfA.probe_cap_applied, false);
  const p = { answers: [attRow('IBWC8315-SL', 'Certification')] };
  const oA = runBso(DIR, wA, runAnn(DIR, wA, xfA, p), runAnn(DIR, wA, xfA, p));
  const oB = runBso(BASE, wB, runAnn(BASE, wB, xfB, p), runAnn(BASE, wB, xfB, p));
  eq('§IH-16 single-token suggest_response byte-identical', oA.suggest_response, oB.suggest_response);
  eq('§IH-16 single-token quick_reply byte-identical', oA.suggest_quick_reply, oB.suggest_quick_reply);
  eq('§IH-16 single-token dym_candidates byte-identical', oA.dym_candidates, oB.dym_candidates);

  // a NON-enabled domain must be untouched on both lanes
  const nd = () => world({
    domain: 'order', allowed: ['order', 'customer'],
    parserEntities: [{ raw: 'tok1', hint: 'order' }],
    resolutions: [
      { token: 'tok1', resolved: false, matches: [cand('SO-1', UU(1), 'order'), cand('SO-2', UU(2), 'order')] },
      { token: 'tok2', resolved: false, matches: [cand('SO-3', UU(3), 'order')] },
    ],
  });
  const nA = nd(), nB = nd();
  eq('§IH-16 non-enabled domain still skipped', runXf(DIR, nA, nA.notFound).probe_skip_reason, 'domain_not_enabled');
  eq('§IH-16 non-enabled domain render byte-identical',
    runBso(DIR, nA, nA.notFound, null).suggest_response,
    runBso(BASE, nB, nB.notFound, null).suggest_response);
}

// ══════════════════ fail-open contract ══════════════════
console.log('\n── C3 fail-open: every degraded path == the un-annotated offer ──');
{
  const mkW = () => multiWorld(2, 3);
  const wB = mkW();
  const bare = runBso(BASE, wB, wB.notFound, null).suggest_response;
  const paths = {
    'probe error (sentinel)': (w, xf) => runAnn(DIR, w, xf, { ...xf, _dym_probe_input: true }),
    'probe error ({error})':  (w, xf) => runAnn(DIR, w, xf, { error: 'boom' }),
    'no answers array':       (w, xf) => runAnn(DIR, w, xf, {}),
    'unscoped probe':         (w, xf) => runAnn(DIR, w, xf, { answers: [attRow('P1-1', '')] }),
    'page saturated':         (w, xf) => runAnn(DIR, w, xf, { answers: Array.from({ length: 60 }, () => attRow('P1-1', 'Certification')) }),
    'dym-annotate never ran': (w) => null,
  };
  for (const [label, f] of Object.entries(paths)) {
    const w = mkW();
    const xf = runXf(DIR, w, w.notFound);
    const ann = f(w, xf);
    const out = runBso(DIR, w, ann || w.notFound, ann);
    eq(`fail-open [${label}] byte-identical to the un-annotated offer`, out.suggest_response, bare);
  }
}

// LESSONS §61b — print the compared-population count; an empty checker output is NEVER a pass.
console.log(`\ncompared population: ${asserted} assertions against ${path.basename(DIR)}`);
// Clause-level keys: the LEADING TOKEN of each assertion name. Fine-grained on purpose — a
// mutation harness that can only say "§IH-11 went red" cannot prove that §IH-FP-7 reddens the
// anti-renumber clause ALONE while the suffix clauses stay green, which is the whole point of it.
console.log('REDKEYS:' + RED.map(n => ' ' + n.split(/\s+/)[0]).join(''));
console.log(fails === 0 ? `ALL PASS ${asserted}/${asserted}` : `${fails} RED / ${asserted}`);
process.exit(fails === 0 ? 0 : 1);
