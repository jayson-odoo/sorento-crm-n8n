const fs = require('fs');
// 🔴 NODE BODIES ARE SOURCED FROM export/ (reviewer F-STALE, 2026-08-08). This suite used to read
// hand-held copies in this directory; they drifted from what was published, so `ALL PASS` was a
// statement about yesterday's bytes. Worse, the stale copies were MUTUALLY CONSISTENT — the stale
// dym-transform never emitted `dym_capped_codes`, so the stale build-suggest-offer was right not to
// strip it, and the gate built to catch that omission passed. See ../node-source.js.
// Run `python3 n8n-workflows-init/scripts/export-workflows.py --verify` first.
const P = __dirname;
const { loadNodes } = require('../node-source');
const _CLONE_FILES = ["build-suggest-offer.js", "dym-transform.js", "dym-annotate.js", "escalate-catalog.js"];
const _SRC = loadNodes('clone-sorento-consume-main-TEST', _CLONE_FILES);
// live-*.js are deliberate LOCAL snapshots of the live spine (the comparison baseline), so they are
// the ONLY files still read from this directory.
const src = (f) => (f in _SRC) ? _SRC[f] : fs.readFileSync(`${P}/${f}`, 'utf8');
const mk = (f) => new Function('$', '$input', '$execution', src(f));
const XF  = mk('dym-transform.js');
const ANN = mk('dym-annotate.js');
const BSO = mk('build-suggest-offer.js');
const EC   = mk('escalate-catalog.js');        // the CONSUMER — models the by-name re-sourcing
const LIVE_EC = mk('live-ec.js');

const item = (j) => ({ json: j });
const nodeStub = (j, executed = true) => ({
  isExecuted: executed,
  first: () => item(j),
  all: () => [item(j)],
});

let fails = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
  else console.log(`ok   ${name}`);
};
const truthy = (name, v) => { if (!v) { fails++; console.log(`FAIL ${name}`); } else console.log(`ok   ${name}`); };

const UU = (n) => `1439736c-20ca-4bba-b387-b242ff4a45${String(n).padStart(2, '0')}`;

function cand(code, uuid, type = 'product') {
  return { canonical_code: code, uuid, entity_type: type, match_tier: 'fuzzy' };
}

// ── world builder ─────────────────────────────────────────────────────────────
function world(o) {
  const notFound = o.notFound || {
    escalate_message: 'Could not find inventory for X. Would you like me to escalate?',
    is_clarification: false,
    found_summary: '',
  };
  const parser = {
    domain_hint: o.domain,
    entities: o.parserEntities || [],
    routing: { suggested_team: 'customer_service' },
  };
  const gate = {
    gate_debug: { domain: o.domain, allowed_lookup: o.allowed },
    compatible_entities: o.compat || [],
    require_specific: false,
  };
  const resolver = { resolutions: o.resolutions };
  const nodes = {
    "Call 'sub-query-reformulator'": nodeStub({ output: parser }),
    'resolve-entity': nodeStub(resolver),
    'disallowed-entity-gate': nodeStub(gate),
    'not-found-error-message': nodeStub(notFound),
    'sibling-transform': nodeStub({}, false),
    'sibling-probe': nodeStub({}, false),
    "Call 'sub-get-results'": nodeStub({}, false),
  };
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`no node ${n}`);
    return nodes[n];
  };
  return { $, nodes, notFound };
}

function runXf(w, inputJson) {
  return XF(w.$, { first: () => item(inputJson) }, { id: '999' })[0].json;
}
function runAnn(w, xfOut, probeJson) {
  w.nodes['dym-transform'] = nodeStub(xfOut);
  return ANN(w.$, { first: () => item(probeJson) }, { id: '999' });
}
function runBso(w, inputJson, annOut) {
  w.nodes['dym-annotate'] = annOut ? nodeStub(annOut) : nodeStub({}, false);
  return BSO(w.$, { first: () => item(inputJson) }, { id: '999' });
}

// ══ DP-1 product_attachment, one candidate has the cert ═══════════════════════
const ATT_ALLOWED = ['product', 'attachment', 'attachment_type', 'category', 'brand', 'certificate'];
const INV_ALLOWED = ['product', 'category', 'brand'];

function attWorld(extra = {}) {
  return world(Object.assign({
    domain: 'product_attachment',
    allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'ibwc8315-s10', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }],
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions: [{
      token: 'ibwc8315-s10', resolved: false,
      matches: [cand('IBWC8315-S', UU(1)), cand('IBWC8315-SL', UU(2)), cand('IBWC8315-S10-P', UU(3))],
    }],
  }, extra));
}
function invWorld(extra = {}) {
  return world(Object.assign({
    domain: 'inventory',
    allowed: INV_ALLOWED,
    parserEntities: [{ raw: 'srtub2232-1600', hint: 'product' }],
    compat: [],
    resolutions: [{
      token: 'srtub2232-1600', resolved: false,
      matches: [cand('SRTBT2232-1600', UU(4)), cand('SRTUB2232-1500', UU(5)), cand('SRTUB2232-1800', UU(6))],
    }],
  }, extra));
}
const attRow = (code, type) => ({ title: code, fields: [{ label: 'Product Code', value: code }, { label: 'Attachment Type', value: type }] });
const invRow = (code, qty) => ({ title: code, fields: [{ label: 'Product Code', value: code }, { label: 'Quantity On Hand', value: qty }] });

console.log('\n── DP-1 attachment, SOME have it ──');
{
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  eq('DP-1 probe_needed', xf.probe_needed, true);
  eq('DP-1 tool', xf.probe_tool, 'crm_master_product_attachments_list');
  eq('DP-1 predicate', xf.probe_predicate, 'row_present_with_type');
  eq('DP-1 entities', xf.dym_probe_entities.map(e => e.code), ['IBWC8315-S', 'IBWC8315-SL', 'IBWC8315-S10-P', 'Certification']);
  truthy('DP-1 entities all uuid', xf.dym_probe_entities.every(e => /^[0-9a-f-]{36}$/.test(e.uuid)));
  const ann = runAnn(w, xf, { answers: [attRow('IBWC8315-SL', 'Certification')] });
  eq('DP-1 available', ann.dym_available_codes, ['ibwc8315-sl']);
  eq('DP-1 ok', ann.dym_probe_meta.ok, true);
  eq('DP-1 probed', ann.dym_probe_meta.probed, ['ibwc8315-s', 'ibwc8315-sl', 'ibwc8315-s10-p']);
  truthy('DP-1 escalate_message survives', typeof ann.escalate_message === 'string' && ann.escalate_message.length > 0);
  truthy('DP-1 found_summary key present', 'found_summary' in ann);
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('DP-1 SL has certificate', out.suggest_response.includes('IBWC8315-SL - has certificate'));
  truthy('DP-1 S no certificate', out.suggest_response.includes('IBWC8315-S - no certificate'));
  truthy('DP-1 SL rendered first', /Did you mean:\n1\. IBWC8315-SL/.test(out.suggest_response));
  eq('DP-1 quick_reply', out.suggest_quick_reply, "IBWC8315-SL,IBWC8315-S,IBWC8315-S10-P,Yes escalate,No it's okay");
  eq('DP-1 lrs[0]', out.suggest_last_result_set[0].value, 'IBWC8315-SL');
  eq('DP-1 lrs idx1', out.suggest_last_result_set[0].idx, 1);
  eq('DP-1 dym_candidates[0]', out.dym_candidates[0].code, 'IBWC8315-SL');
  eq('DP-1 suggest_offer', out.suggest_offer, true);
  truthy('DP-1 ctrl keys stripped', !('dym_probe_meta' in out) && !('probe_needed' in out) && !('_dym_probe_input' in out));
  truthy('DP-1 notfound key kept', 'escalate_message' in out);
  // DP-11a bareness
  truthy('DP-11a regex', /^[A-Za-z0-9\-\.\/]+(,[A-Za-z0-9\-\.\/]+)*,Yes escalate,No it's okay$/.test(out.suggest_quick_reply));
  truthy('DP-11a no em-dash', !out.suggest_quick_reply.includes('—'));
  truthy('DP-11a no hyphen-suffix leak', !out.suggest_quick_reply.includes(' - has ') && !out.suggest_quick_reply.includes(' - no '));
  eq('DP-11a entry count', out.suggest_quick_reply.split(',').length, 5);
  // DP-11b index consistency
  const parts = out.suggest_quick_reply.split(',');
  truthy('DP-11b qr[i]==lrs[i]', out.suggest_last_result_set.every((e, i) => parts[i] === e.value));
}

console.log('\n── DP-2 attachment, NONE have it ──');
{
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, { answers: [] });
  eq('DP-2 available', ann.dym_available_codes, []);
  eq('DP-2 ok', ann.dym_probe_meta.ok, true);
  eq('DP-2 answer_count', ann.dym_probe_meta.answer_count, 0);
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  eq('DP-2 suggest_offer', out.suggest_offer, true);
  // F-RANK: stable partition, no tiebreak. Every has === false ⇒ zero movement ⇒ the
  // resolver's similarity order (S, SL, S10-P) survives intact. An alphabetical
  // tiebreak would render S, S10-P, SL and destroy the ranking.
  eq('DP-2 resolver order preserved', out.suggest_last_result_set.map(e => e.value), ['IBWC8315-S', 'IBWC8315-SL', 'IBWC8315-S10-P']);
  truthy('DP-2 all no certificate', (out.suggest_response.match(/ - no certificate/g) || []).length === 3);
  const baseline = runBso(attWorld(), attWorld().notFound, null);
  eq('DP-2 order matches un-annotated (LIVE) order', out.suggest_last_result_set.map(e => e.value), baseline.suggest_last_result_set.map(e => e.value));
}

console.log('\n── F-RANK stable partition: within-group resolver order ──');
{
  // resolver order is S, SL, S10-P. First and THIRD have the document.
  // Stable partition ⇒ has-group keeps resolver order (S, S10-P), then the no-group (SL).
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, [attRow('IBWC8315-S', 'Certification'), attRow('IBWC8315-S10-P', 'Certification')]
    .reduce((acc, r) => (acc.answers.push(r), acc), { answers: [] }));
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  eq('F-RANK two-have order', out.suggest_last_result_set.map(e => e.value), ['IBWC8315-S', 'IBWC8315-S10-P', 'IBWC8315-SL']);
  eq('F-RANK two-have quick_reply', out.suggest_quick_reply, "IBWC8315-S,IBWC8315-S10-P,IBWC8315-SL,Yes escalate,No it's okay");

  // Only the MIDDLE candidate has it ⇒ it moves to front, the other two keep resolver order.
  const w2 = attWorld();
  const xf2 = runXf(w2, w2.notFound);
  const ann2 = runAnn(w2, xf2, { answers: [attRow('IBWC8315-SL', 'Certification')] });
  const out2 = runBso(w2, ann2, ann2);
  eq('F-RANK one-have (middle) order', out2.suggest_last_result_set.map(e => e.value), ['IBWC8315-SL', 'IBWC8315-S', 'IBWC8315-S10-P']);
}

console.log('\n── F-ATT: the REAL prod attachment envelope (exec 11421896, "mwc7625 cert") ──');
{
  // Verbatim row shape observed in production, incl. the extra fields the fixtures omit.
  const realRow = {
    title: 'MWC7625-SH-S10',
    fields: [
      { label: 'Product Code', value: 'MWC7625-SH-S10' },
      { label: 'Attachment Type', value: 'Certification' },
      { label: 'File Name', value: 'PPS - JBC WCM PC 000318 - EXP 07 JAN 2027.pdf' },
      { label: 'Certificate Number', value: '2-11250086' },
      { label: 'Valid Until', value: '2027-01-07' },
      { label: 'Validity', value: 'Valid' },
    ],
  };
  const w = world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'mwc7625', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }],
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions: [{
      token: 'mwc7625', resolved: false,
      matches: [cand('MWC7625-SH-S10', UU(11)), cand('MWC7625-RL', UU(12)), cand('MWC7625-SH', UU(13))],
    }],
  });
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, { answers: [realRow] });
  eq('F-ATT codeOf reads title as product code', ann.dym_available_codes, ['mwc7625-sh-s10']);
  eq('F-ATT ok', ann.dym_probe_meta.ok, true);
  eq('F-ATT not unscoped', ann.dym_probe_meta.reason, null);
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('F-ATT renders has certificate', out.suggest_response.includes('MWC7625-SH-S10 - has certificate'));
  truthy('F-ATT positive renders FIRST', /Did you mean:\n1\. MWC7625-SH-S10 - has certificate/.test(out.suggest_response));
  truthy('F-ATT quick_reply bare', !out.suggest_quick_reply.includes('—') && !out.suggest_quick_reply.includes('.pdf'));
}

console.log('\n── DP-3a probe {} / DP-3b unscoped ──');
{
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  const base = runBso(attWorld(), w.notFound, null);   // today's un-annotated render

  const a = runAnn(w, xf, {});
  eq('DP-3a ok', a.dym_probe_meta.ok, false);
  eq('DP-3a reason', a.dym_probe_meta.reason, 'no_answers_array');
  const o1 = runBso(attWorld(), a, a);
  truthy('DP-3a no annotation', !o1.suggest_response.includes(' - has ') && !o1.suggest_response.includes(' - no '));
  eq('DP-3a byte-identical', JSON.stringify(o1), JSON.stringify(base));

  const b = runAnn(w, xf, { answers: [{ title: 'IBWC8315-SL', fields: [{ label: 'File Name', value: 'x.pdf' }] }] });
  eq('DP-3b reason', b.dym_probe_meta.reason, 'unscoped_probe');
  eq('DP-3b ok', b.dym_probe_meta.ok, false);
  const o2 = runBso(attWorld(), b, b);
  eq('DP-3b byte-identical', JSON.stringify(o2), JSON.stringify(base));
  console.log('    base >>', JSON.stringify(base.suggest_response));
}

console.log('\n── DP-4 probe ERROR (onError passthrough) ──');
{
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  const a = runAnn(w, xf, xf);   // dym-probe echoed its input item
  eq('DP-4 ok', a.dym_probe_meta.ok, false);
  eq('DP-4 reason', a.dym_probe_meta.reason, 'probe_error');
  truthy('DP-4 escalate_message survives', typeof a.escalate_message === 'string');
  const out = runBso(attWorld(), a, a);
  eq('DP-4 suggest_offer', out.suggest_offer, true);
  eq('DP-4 byte-identical', JSON.stringify(out), JSON.stringify(runBso(attWorld(), w.notFound, null)));
}

console.log('\n── DP-5 inventory, SOME have stock ──');
{
  const w = invWorld();
  const xf = runXf(w, w.notFound);
  eq('DP-5 tool', xf.probe_tool, 'crm_inventory_stock_balance_list');
  eq('DP-5 predicate', xf.probe_predicate, 'qty_gt_zero');
  eq('DP-5 entities are 3 products only', xf.dym_probe_entities.map(e => e.entity_type), ['product', 'product', 'product']);
  const ann = runAnn(w, xf, { answers: [invRow('SRTUB2232-1800', '4')] });
  eq('DP-5 available', ann.dym_available_codes, ['srtub2232-1800']);
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('DP-5 1800 has stock first', /Did you mean:\n1\. SRTUB2232-1800 - has stock details/.test(out.suggest_response));
  truthy('DP-5 others no stock', (out.suggest_response.match(/ - no stock details/g) || []).length === 2);
  truthy('DP-5 qr bare', !out.suggest_quick_reply.includes('—'));
}

console.log('\n── DP-9 hard gate: no candidate uuid / no scoping entity ──');
{
  const w = world({
    domain: 'inventory', allowed: INV_ALLOWED, parserEntities: [], compat: [],
    resolutions: [{ token: 't', resolved: false, matches: [cand('A-1', null), cand('B-1', null)] }],
  });
  const xf = runXf(w, w.notFound);
  eq('DP-9 probe_needed', xf.probe_needed, false);
  eq('DP-9 reason', xf.probe_skip_reason, 'no_candidate_uuid');
  eq('DP-9 entities empty', xf.dym_probe_entities, []);

  const w2 = attWorld({ compat: [] });
  const xf2 = runXf(w2, w2.notFound);
  eq('DP-9 mirror probe_needed', xf2.probe_needed, false);
  eq('DP-9 mirror reason', xf2.probe_skip_reason, 'no_scoping_entity');
  eq('DP-9 mirror entities empty', xf2.dym_probe_entities, []);

  // hint-only attachment_type (uuid absent from compatible_entities) must NOT probe
  const w3 = attWorld({ compat: [{ uuid: null, entity_type: 'attachment_type', code: 'Certification' }] });
  eq('DP-9 hint-only reason', runXf(w3, w3.notFound).probe_skip_reason, 'no_scoping_entity');
}

console.log('\n── DP-10 non-enabled domains ──');
for (const d of ['order', 'master_products', 'promotion', 'incoming']) {
  const w = world({
    domain: d, allowed: ['product'], parserEntities: [{ raw: 'x', hint: 'product' }], compat: [],
    resolutions: [{ token: 'x', resolved: false, matches: [cand('A-1', UU(7)), cand('B-1', UU(8))] }],
  });
  const xf = runXf(w, w.notFound);
  eq(`DP-10 ${d} probe_needed`, xf.probe_needed, false);
  eq(`DP-10 ${d} reason`, xf.probe_skip_reason, 'domain_not_enabled');
  // build-suggest-offer on the gate-FALSE branch receives the xf item (passthrough + ctrl keys)
  const viaXf   = runBso(world({ domain: d, allowed: ['product'], parserEntities: [{ raw: 'x', hint: 'product' }], compat: [], resolutions: w.nodes['resolve-entity'].first().json.resolutions }), xf, null);
  const baseline = runBso(world({ domain: d, allowed: ['product'], parserEntities: [{ raw: 'x', hint: 'product' }], compat: [], resolutions: w.nodes['resolve-entity'].first().json.resolutions }), w.notFound, null);
  eq(`DP-10 ${d} byte-identical`, JSON.stringify(viaXf), JSON.stringify(baseline));
}

// 🛠 UPDATED by immortal-hint-class C3 (2026-08-08). C3 DELIBERATELY lifts the D1 multi-token
// exclusion: the objection was to has-first SORTING renumbering across token blocks, and C3
// annotates without sorting. These assertions asserted the OLD behaviour and went red the moment
// this suite started reading the published bodies (F-STALE). They are inverted here, not deleted —
// the shape still has to be pinned, just to its new correct value.
console.log('\n── DP-13a multi-token — D1 lane now PROBES (C3 lifted the exclusion) ──');
{
  const w = world({
    domain: 'inventory', allowed: INV_ALLOWED, parserEntities: [], compat: [],
    resolutions: [
      { token: 't1', resolved: false, matches: [cand('A-1', UU(7))] },
      { token: 't2', resolved: false, matches: [cand('B-1', UU(8))] },
    ],
  });
  const xf = runXf(w, w.notFound);
  eq('DP-13a reason (C3: no longer skipped)', xf.probe_skip_reason, null);
  eq('DP-13a probe_needed (C3: multi-token D1 probes)', xf.probe_needed, true);
}

console.log('\n── DP-13c D2 / no genuine-miss token ──');
{
  const w = world({
    domain: 'inventory', allowed: INV_ALLOWED, parserEntities: [], compat: [],
    resolutions: [{ token: 't', resolved: true, matches: [Object.assign(cand('A-1', UU(7)), { match_tier: 'exact' })] }],
  });
  const xf = runXf(w, w.notFound);
  eq('DP-13c reason', xf.probe_skip_reason, 'no_d1_candidates');
}

console.log('\n── DP-14 genuine-zero rows are NOT has-stock ──');
{
  const w = invWorld();
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, {
    answers: [
      invRow('SRTBT2232-1600', '0'), invRow('SRTBT2232-1600', '0'), invRow('SRTBT2232-1600', '—'),
      invRow('SRTUB2232-1800', '4'),
    ],
  });
  eq('DP-14 available', ann.dym_available_codes, ['srtub2232-1800']);
  truthy('DP-14 zero code probed', ann.dym_probe_meta.probed.includes('srtbt2232-1600'));
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('DP-14 zero code renders no stock', out.suggest_response.includes('SRTBT2232-1600 - no stock details'));
}

console.log('\n── F-DUPE: a code behind >1 uuid is EXCLUDED from the probe, renders BARE ──');
{
  // Resolver returns IBWC8315-SL twice: two companies' products sharing the code string
  // (product_code is unique per company). Siblings are unambiguous.
  const w = world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'ibwc8315-s10', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }],
    compat: [{ uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }],
    resolutions: [{
      token: 'ibwc8315-s10', resolved: false,
      matches: [cand('IBWC8315-S', UU(1)), cand('IBWC8315-SL', UU(2)), cand('IBWC8315-SL', UU(21)), cand('IBWC8315-S10-P', UU(3))],
    }],
  });
  const xf = runXf(w, w.notFound);
  eq('F-DUPE probe still runs', xf.probe_needed, true);
  eq('F-DUPE excluded', xf.dym_excluded_codes, [{ code: 'IBWC8315-SL', reason: 'multi_uuid_code', uuid_count: 2 }]);
  eq('F-DUPE probed codes', xf.dym_candidate_codes, ['IBWC8315-S', 'IBWC8315-S10-P']);
  eq('F-DUPE ambiguous uuid absent from probe entities',
     xf.dym_probe_entities.filter(e => e.entity_type === 'product').map(e => e.uuid).includes(UU(21)), false);
  eq('F-DUPE ambiguous CODE absent from probe entities',
     xf.dym_probe_entities.some(e => e.code === 'IBWC8315-SL'), false);
  const ann = runAnn(w, xf, { answers: [attRow('IBWC8315-S', 'Certification')] });
  eq('F-DUPE available', ann.dym_available_codes, ['ibwc8315-s']);
  eq('F-DUPE probed meta excludes ambiguous', ann.dym_probe_meta.probed, ['ibwc8315-s', 'ibwc8315-s10-p']);
  const out = runBso(w, ann, ann);
  console.log('    >>', JSON.stringify(out.suggest_response));
  truthy('F-DUPE has-code labelled', out.suggest_response.includes('IBWC8315-S - has certificate'));
  truthy('F-DUPE sibling labelled no', out.suggest_response.includes('IBWC8315-S10-P - no certificate'));
  // the ambiguous code must carry NO suffix at all — not "has", not "no"
  truthy('F-DUPE ambiguous code rendered BARE',
    /\n\d\. IBWC8315-SL\n/.test(out.suggest_response + '\n'));
  truthy('F-DUPE ambiguous code has no suffix',
    !/IBWC8315-SL - (has|no) /.test(out.suggest_response));
  // it is still OFFERED — exclusion removes the annotation, never the candidate
  truthy('F-DUPE ambiguous code still offered', out.suggest_quick_reply.split(',').includes('IBWC8315-SL'));
  eq('F-DUPE still 3 picks', out.suggest_last_result_set.length, 3);
  truthy('F-DUPE quick_reply bare', !out.suggest_quick_reply.includes('—'));
}

console.log('\n── F-DUPE: ALL candidates ambiguous ⇒ probe never runs ──');
{
  const w = world({
    domain: 'inventory', allowed: INV_ALLOWED, parserEntities: [], compat: [],
    resolutions: [{
      token: 'srtub2232-1600', resolved: false,
      matches: [cand('SRTBT2232-1600', UU(4)), cand('SRTBT2232-1600', UU(41))],
    }],
  });
  const xf = runXf(w, w.notFound);
  eq('F-DUPE-ALL probe_needed', xf.probe_needed, false);
  eq('F-DUPE-ALL reason', xf.probe_skip_reason, 'multi_uuid_code');
  eq('F-DUPE-ALL entities empty', xf.dym_probe_entities, []);
  eq('F-DUPE-ALL probed empty', xf.dym_candidate_codes, []);
  eq('F-DUPE-ALL excluded recorded', xf.dym_excluded_codes.map(x => x.code), ['SRTBT2232-1600']);
}

console.log('\n── F-DUPE: same product at two tiers is NOT ambiguous (same uuid) ──');
{
  const w = invWorld({
    resolutions: [{
      token: 'srtub2232-1600', resolved: false,
      matches: [cand('SRTBT2232-1600', UU(4)), Object.assign(cand('SRTBT2232-1600', UU(4)), { match_tier: 'prefix' }),
                cand('SRTUB2232-1500', UU(5)), cand('SRTUB2232-1800', UU(6))],
    }],
  });
  const xf = runXf(w, w.notFound);
  eq('F-DUPE same-uuid not excluded', xf.dym_excluded_codes, []);
  eq('F-DUPE same-uuid probed', xf.dym_candidate_codes, ['SRTBT2232-1600', 'SRTUB2232-1500', 'SRTUB2232-1800']);
}

console.log('\n── PICKER: require-specific numbered picker (4th surface), 8 candidates ──');
{
  // disallowed-entity-gate render: compatible_entities == the offered option uuids, and the
  // attachment_type uuid is NOT among them (the gate replaces compatible_entities with the
  // option set) — so the scoping entity must come from the resolver flatten.
  const CODES = ['SRTWC193','SRTWC190','SRTWC195','SRTWC191','SRTWC192','SRTWC194','SRTWC196','SRTWC197'];
  const compat = CODES.map((c,i) => ({ uuid: UU(20+i), entity_type: 'product', code: c }));
  const clar = 'product_attachment search needs to be more specific. Multiple matches found — please choose:\n'
    + CODES.map((c,i) => `${i+1}. ${c}`).join('\n');
  const w = world({
    domain: 'product_attachment', allowed: ATT_ALLOWED,
    parserEntities: [{ raw: 'srtwc19', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }],
    compat,
    resolutions: [{ token: 'srtwc19', resolved: false,
      matches: [...compat.map(e => cand(e.code, e.uuid)),
                { canonical_code: 'Certification', uuid: UU(99), entity_type: 'attachment_type', match_tier: 'exact' }] }],
    notFound: { escalate_message: clar, is_clarification: false, found_summary: '' },
  });
  w.nodes['disallowed-entity-gate'] = nodeStub({
    gate_debug: { domain: 'product_attachment', allowed_lookup: ATT_ALLOWED },
    compatible_entities: compat, require_specific: true, gate_clarification: clar,
  });
  const xf = runXf(w, w.notFound);
  eq('PICKER lane', xf.probe_lane, 'picker');
  eq('PICKER probe_needed', xf.probe_needed, true);
  eq('PICKER probed all 8', xf.dym_candidate_codes, CODES);
  truthy('PICKER scoping entity found via resolver fallback',
    xf.dym_probe_entities.some(e => e.entity_type === 'attachment_type' && e.uuid === UU(99)));
  eq('PICKER entity count 8+1', xf.dym_probe_entities.length, 9);
  const ann = runAnn(w, xf, { answers: [attRow('SRTWC193','Certification'), attRow('SRTWC195','Certification')] });
  eq('PICKER available', ann.dym_available_codes.sort(), ['srtwc193','srtwc195']);
  const out = runBso(w, ann, ann);
  console.log('    >>\n' + out.escalate_message.split('\n').map(l => '       ' + l).join('\n'));
  truthy('PICKER 193 has', out.escalate_message.includes('1. SRTWC193 - has certificate'));
  truthy('PICKER 195 has', out.escalate_message.includes('3. SRTWC195 - has certificate'));
  eq('PICKER no-count', (out.escalate_message.match(/ - no certificate/g) || []).length, 6);
  truthy('PICKER header untouched', out.escalate_message.startsWith('product_attachment search needs to be more specific. Multiple matches found — please choose:'));
  eq('PICKER numbering unchanged', out.escalate_message.split('\n').slice(1).map(l => l.match(/^(\d+)\./)[1]), ['1','2','3','4','5','6','7','8']);
  eq('PICKER suggest_offer stays false (no D1)', out.suggest_offer, false);
  truthy('PICKER no quick_reply invented', out.suggest_quick_reply === undefined);
  truthy('PICKER message length sane', out.escalate_message.length < 700);
}

console.log('\n── 🔴 RENDERED-TEXT gate: what escalate-catalog actually emits to the customer ──');
{
  // WHY THIS EXISTS. Every other assertion in this file targets an INTERMEDIATE node's output
  // object. escalate-catalog re-sources escalate_message BY NAME from the node UPSTREAM of the
  // whole dym chain, so a perfectly-annotated build-suggest-offer output can be discarded and the
  // customer still receives the bare picker — with every other gate green. The assertion target
  // was the wrong OBJECT, not a broken assertion. This gate asserts the CONSUMER's output.
  const CODES = ['SRTWC193','SRTWC190','SRTWC195'];
  const compat = CODES.map((c,i) => ({ uuid: UU(20+i), entity_type: 'product', code: c }));
  const clar = 'product_attachment search needs to be more specific. Multiple matches found — please choose:\n'
    + CODES.map((c,i) => `${i+1}. ${c}`).join('\n');
  const mkW = () => {
    const w = world({ domain:'product_attachment', allowed:ATT_ALLOWED,
      parserEntities:[{raw:'srtwc19',hint:'product'},{raw:'cert',hint:'attachment_type'}], compat,
      resolutions:[{token:'srtwc19',resolved:false,matches:[...compat.map(e=>cand(e.code,e.uuid)),
        {canonical_code:'Certification',uuid:UU(99),entity_type:'attachment_type',match_tier:'exact'}]}],
      notFound:{ escalate_message: clar, is_clarification:false, found_summary:'', require_specific:true } });
    w.nodes['disallowed-entity-gate'] = nodeStub({ gate_debug:{domain:'product_attachment',allowed_lookup:ATT_ALLOWED},
      compatible_entities: compat, require_specific:true, gate_clarification: clar });
    return w;
  };
  const runEC = (fn, w, bso) => {
    w.nodes['build-suggest-offer'] = bso ? nodeStub(bso) : nodeStub({}, false);
    w.nodes['not-found-error-message'] = nodeStub({ escalate_message: clar, is_clarification:false, require_specific:true });
    w.nodes['annotate-incoming-picker'] = nodeStub({}, false);
    return fn(w.$, { first: () => item({ branch_kind: 'not_found' }) }, { id:'999' });
  };
  const w = mkW();
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, { answers: [attRow('SRTWC195','Certification')] });
  const bso = runBso(w, ann, ann);
  const ec = runEC(EC, mkW(), bso);
  const emitted = Array.isArray(ec) ? ec[0].json.response : ec.response;
  console.log('    CUSTOMER RECEIVES >>\n' + String(emitted).split('\n').map(l=>'       '+l).join('\n'));
  truthy('RENDERED picker annotation reaches the customer', String(emitted).includes('SRTWC195 - has certificate'));
  eq('RENDERED no-count', (String(emitted).match(/ - no certificate/g) || []).length, 2);
  truthy('RENDERED header intact', String(emitted).startsWith('product_attachment search needs'));
  // flags must stay coherent with whichever object won
  const flags = Array.isArray(ec) ? ec[0].json : ec;
  eq('RENDERED manualResponse preserved', flags.manualResponse, false);   // require_specific true -> !true
  eq('RENDERED is_escalate_offer preserved', flags.is_escalate_offer, true);
  // the pre-fix consumer must NOT carry it — proves this gate discriminates
  const ecLive = runEC(LIVE_EC, mkW(), bso);
  const emittedLive = Array.isArray(ecLive) ? ecLive[0].json.response : ecLive.response;
  truthy('RENDERED gate discriminates (LIVE consumer drops the annotation)',
    !String(emittedLive).includes(' - has certificate') && String(emittedLive) === clar);

  // fail-open: build-suggest-offer absent / malformed -> today's text, never empty
  const ecNone = runEC(EC, mkW(), null);
  eq('RENDERED fail-open (no bso) == gate text', (Array.isArray(ecNone)?ecNone[0].json:ecNone).response, clar);
  const ecBad = runEC(EC, mkW(), { escalate_message: '' });
  eq('RENDERED fail-open (empty escalate_message) == gate text', (Array.isArray(ecBad)?ecBad[0].json:ecBad).response, clar);
  const ecNull = runEC(EC, mkW(), { escalate_message: null });
  eq('RENDERED fail-open (null) == gate text', (Array.isArray(ecNull)?ecNull[0].json:ecNull).response, clar);

  // incoming fallback must be untouched: not-found-error-message NOT executed
  const wi = mkW();
  wi.nodes['build-suggest-offer'] = nodeStub({}, false);
  wi.nodes['not-found-error-message'] = nodeStub({}, false);
  wi.nodes['annotate-incoming-picker'] = nodeStub({ escalate_message: '1. X — has incoming', is_clarification:false, require_specific:true });
  const ecInc = EC(wi.$, { first: () => item({ branch_kind:'not_found' }) }, { id:'999' });
  eq('RENDERED incoming fallback intact', (Array.isArray(ecInc)?ecInc[0].json:ecInc).response, '1. X — has incoming');
}

console.log('\n── PICKER: F-DUPE + fail-open carry over ──');
{
  const CODES = ['A-1','B-1','C-1'];
  const compat = [{uuid:UU(30),entity_type:'product',code:'A-1'},{uuid:UU(31),entity_type:'product',code:'B-1'},
                  {uuid:UU(32),entity_type:'product',code:'B-1'},{uuid:UU(33),entity_type:'product',code:'C-1'}];
  const clar = 'inventory search needs to be more specific. Multiple matches found — please choose:\n1. A-1\n2. B-1\n3. C-1';
  const mk = () => { const w = world({ domain:'inventory', allowed:INV_ALLOWED, parserEntities:[], compat,
      resolutions:[{token:'x',resolved:false,matches:compat.map(e=>cand(e.code,e.uuid))}],
      notFound:{escalate_message:clar,is_clarification:false,found_summary:''} });
    w.nodes['disallowed-entity-gate'] = nodeStub({ gate_debug:{domain:'inventory',allowed_lookup:INV_ALLOWED},
      compatible_entities: compat, require_specific:true, gate_clarification: clar }); return w; };
  const w = mk();
  const xf = runXf(w, w.notFound);
  eq('PICKER F-DUPE excluded', xf.dym_excluded_codes.map(x=>x.code), ['B-1']);
  const ann = runAnn(w, xf, { answers: [invRow('A-1','5')] });
  const out = runBso(w, ann, ann);
  truthy('PICKER F-DUPE ambiguous bare', /\n2\. B-1$/m.test(out.escalate_message));
  truthy('PICKER F-DUPE sibling labelled', out.escalate_message.includes('1. A-1 - has stock details'));
  // fail-open: probe failed -> escalate_message byte-identical to the gate text
  const w2 = mk(); const xf2 = runXf(w2, w2.notFound);
  const ann2 = runAnn(w2, xf2, {});
  eq('PICKER fail-open ok:false', ann2.dym_probe_meta.ok, false);
  eq('PICKER fail-open text byte-identical', runBso(mk(), ann2, ann2).escalate_message, clar);
  eq('PICKER no-annotate text byte-identical', runBso(mk(), w.notFound, null).escalate_message, clar);
}

// 🛠 SUPERSEDED by immortal-hint-class C3 (2026-08-08). This section's premise — "the lift is
// partial-lane only" — is no longer true: C3 extends multi-token to the D1 lane. Retained (not
// deleted) because it is still the only place that pins BOTH lanes side by side, which is what
// catches a lane-detection regression.
console.log('\n── MULTI-TOKEN now allowed on BOTH lanes (C3 lifted the D1 exclusion) ──');
{
  const two = [
    { token:'t1', resolved:false, matches:[cand('A-1',UU(7)),cand('A-2',UU(9))] },
    { token:'t2', resolved:false, matches:[cand('B-1',UU(8))] },
  ];
  const wD1 = world({ domain:'inventory', allowed:INV_ALLOWED, parserEntities:[], compat:[], resolutions:two });
  eq('D1 lane no longer skipped (C3)', runXf(wD1, wD1.notFound).probe_skip_reason, null);
  eq('D1 lane probe_needed true (C3)', runXf(wD1, wD1.notFound).probe_needed, true);
  eq('D1 lane is still labelled d1, not partial', runXf(wD1, wD1.notFound).probe_lane, 'd1');
  const wP = world({ domain:'inventory', allowed:INV_ALLOWED, parserEntities:[], compat:[], resolutions:two });
  wP.nodes['central-exchange'] = nodeStub({ has_result:true });
  const xfP = runXf(wP, wP.notFound);
  eq('partial lane multi-token allowed', xfP.probe_needed, true);
  eq('partial lane', xfP.probe_lane, 'partial');
  eq('partial lane probes all 3 across 2 tokens', xfP.dym_candidate_codes, ['A-1','A-2','B-1']);
}

console.log('\n── FP-1 all three have it (detector must move) ──');
{
  const w = attWorld();
  const xf = runXf(w, w.notFound);
  const ann = runAnn(w, xf, { answers: ['IBWC8315-S', 'IBWC8315-SL', 'IBWC8315-S10-P'].map(c => attRow(c, 'Certification')) });
  eq('FP-1 available (all 3)', ann.dym_available_codes.sort(), ['ibwc8315-s', 'ibwc8315-s10-p', 'ibwc8315-sl']);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
