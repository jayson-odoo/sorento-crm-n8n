// Offline harness for the SECOND dym consumer: compile-current-state's partial-resolution
// 🔴 NODE BODIES ARE SOURCED FROM export/ (reviewer F-STALE, 2026-08-08). This suite used to read
// hand-held copies in this directory; they drifted from what was published, so `ALL PASS` was a
// statement about yesterday's bytes. Worse, the stale copies were MUTUALLY CONSISTENT — the stale
// dym-transform never emitted `dym_capped_codes`, so the stale build-suggest-offer was right not to
// strip it, and the gate built to catch that omission passed. See ../node-source.js.
// Run `python3 n8n-workflows-init/scripts/export-workflows.py --verify` first.
// renderer. Runs the published bytes with a stubbed $ / $input / $execution.
// Unknown nodes THROW, mirroring n8n — the node's own try/catch IIFEs must absorb them.
const fs = require('fs');
const P = __dirname;
const { loadNodes } = require('../node-source');
const _CLONE_FILES = ["compile-current-state.js", "dym-transform-partial.js", "dym-annotate-partial.js"];
const _SRC = loadNodes('clone-sorento-consume-main-TEST', _CLONE_FILES);
// live-*.js are deliberate LOCAL snapshots of the live spine (the comparison baseline), so they are
// the ONLY files still read from this directory.
const src = (f) => (f in _SRC) ? _SRC[f] : fs.readFileSync(`${P}/${f}`, 'utf8');
const mk = (f) => new Function('$', '$input', '$execution', src(f));
const NEW = mk('compile-current-state.js');
const LIVE = mk('live-ccs.js');
const XF = mk('dym-transform-partial.js');
const ANN = mk('dym-annotate-partial.js');

const item = (j) => ({ json: j });
const stub = (j, e = true) => ({ isExecuted: e, first: () => item(j), all: () => [item(j)] });
let fails = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { fails++; console.log(`FAIL ${n}\n  got  ${a}\n  want ${b}`); } else console.log(`ok   ${n}`); };
const truthy = (n, v) => { if (!v) { fails++; console.log(`FAIL ${n}`); } else console.log(`ok   ${n}`); };

const UU = (n) => `1439736c-20ca-4bba-b387-b242ff4a45${String(n).padStart(2, '0')}`;
const cand = (c, u, t = 'product') => ({ canonical_code: c, uuid: u, entity_type: t, match_tier: 'fuzzy' });
const attRow = (c, t) => ({ title: c, fields: [{ label: 'Product Code', value: c }, { label: 'Attachment Type', value: t }] });
const invRow = (c, q) => ({ title: c, fields: [{ label: 'Product Code', value: c }, { label: 'Quantity On Hand', value: q }] });

// A partially-resolved turn: SRTWC8317 answered, "srtwc8317-rl1" missed with 3 candidates.
function build(domain, allowed, matches, parserEntities) {
  const parser = {
    domain_hint: domain, entities: parserEntities, message_type: 'business_query',
    routing: { suggested_team: 'warehouse' }, access_levels: [],
  };
  const resolver = { resolutions: [
    { token: 'srtwc8317', resolved: true, matches: [Object.assign(cand('SRTWC8317', UU(50)), { match_tier: 'exact' })] },
    { token: 'srtwc8317-rl1', resolved: false, matches },
  ] };
  const gate = { gate_debug: { domain, allowed_lookup: allowed },
    compatible_entities: domain === 'product_attachment'
      ? [{ uuid: UU(50), entity_type: 'product', code: 'SRTWC8317' }, { uuid: UU(99), entity_type: 'attachment_type', code: 'Certification' }]
      : [{ uuid: UU(50), entity_type: 'product', code: 'SRTWC8317' }] };
  const ce = {
    response: 'Here are the results.\n\n1. *Product Code:* SRTWC8317',
    has_result: true,
    items: [{ title: 'SRTWC8317', fields: [{ label: 'Product Code', value: 'SRTWC8317' }] }],
  };
  const nodes = {
    "Call 'sub-query-reformulator'": stub({ output: parser }),
    'sorento-sub-respond-findcontact-respond': stub({ id: 437264483 }),
    'resolve-entity': stub(resolver),
    'disallowed-entity-gate': stub(gate),
    'central-exchange': stub(ce),
  };
  // Fidelity model: a node that EXISTS in the workflow but did not run on this path reports
  // isExecuted:false and throws on .first() — n8n's actual behaviour. The node under test must
  // absorb that through its own guards; if it doesn't, that is a real defect, not a harness bug.
  const NOTRUN = { isExecuted: false, first: () => { throw new Error('no data'); }, all: () => [] };
  const $ = (n) => (n in nodes ? nodes[n] : NOTRUN);
  return { $, nodes, ce };
}

function lane(w, probeAnswers) {
  const xf = XF(w.$, { first: () => item(w.ce) }, { id: '999' })[0].json;
  w.nodes['dym-transform-partial'] = stub(xf);
  const ann = ANN(w.$, { first: () => item(probeAnswers) }, { id: '999' });
  w.nodes['dym-annotate-partial'] = stub(ann);
  return { xf, ann };
}
const run = (fn, w, inp) => fn(w.$, { first: () => item(inp) }, { id: '999' });

const ATT = ['product', 'attachment', 'attachment_type', 'category', 'brand', 'certificate'];
const INV = ['product', 'category', 'brand'];
const M3 = [cand('SRTWC8317-RL', UU(51)), cand('SRTWC8317-P-RL', UU(52)), cand('SRTWC8317-SH', UU(53))];
const PE_ATT = [{ raw: 'srtwc8317-rl1', hint: 'product' }, { raw: 'cert', hint: 'attachment_type' }];
const PE_INV = [{ raw: 'srtwc8317-rl1', hint: 'product' }];

console.log('\n── CCS-1 attachment partial-resolution: annotated, idx CONTIGUOUS and unreordered ──');
{
  const w = build('product_attachment', ATT, M3, PE_ATT);
  const { xf, ann } = lane(w, { answers: [attRow('SRTWC8317-P-RL', 'Certification')] });
  eq('CCS-1 probe_needed', xf.probe_needed, true);
  eq('CCS-1 tool', xf.probe_tool, 'crm_master_product_attachments_list');
  eq('CCS-1 available', ann.dym_available_codes, ['srtwc8317-p-rl']);
  truthy('CCS-1 payload is central-exchange, not not-found', ann.has_result === true && String(ann.response).startsWith('Here are the results.'));
  const out = run(NEW, w, ann);
  console.log('    >>', JSON.stringify(out.user_response));
  truthy('CCS-1 has certificate', out.user_response.includes('SRTWC8317-P-RL - has certificate'));
  truthy('CCS-1 no certificate x2', (out.user_response.match(/ - no certificate/g) || []).length === 2);
  truthy('CCS-1 no em-dash suffix', !out.user_response.includes('— has ') && !out.user_response.includes('— no '));
  // 🔴 order + numbering must be exactly as LIVE renders them (no has-first sort here)
  const live = run(LIVE, build('product_attachment', ATT, M3, PE_ATT), w.ce);
  const strip = (s) => String(s).replace(/ - (has|no) [a-z ]+/g, '');
  eq('CCS-1 idx/order identical to LIVE once suffixes stripped', strip(out.user_response), live.user_response);
  eq('CCS-1 dym_last_result_set == LIVE', JSON.stringify((out.variables||{}).dym_last_result_set), JSON.stringify((live.variables||{}).dym_last_result_set));
  truthy('CCS-1 pick-linkage intact', ((out.variables||{}).dym_last_result_set || []).every(r => 'for_raw' in r && 'for_hint' in r && 'for_canonical' in r));
  eq('CCS-1 for_raw preserved', ((out.variables||{}).dym_last_result_set || []).map(r => r.for_raw), ['srtwc8317-rl1', 'srtwc8317-rl1', 'srtwc8317-rl1']);
}

console.log('\n── CCS-2 inventory partial: "stock details" wording ──');
{
  const w = build('inventory', INV, M3, PE_INV);
  const { xf, ann } = lane(w, { answers: [invRow('SRTWC8317-SH', '7')] });
  eq('CCS-2 noun', xf.probe_noun, 'stock details');
  const out = run(NEW, w, ann);
  console.log('    >>', JSON.stringify(out.user_response));
  truthy('CCS-2 has stock details', out.user_response.includes('SRTWC8317-SH - has stock details'));
  truthy('CCS-2 no stock details x2', (out.user_response.match(/ - no stock details/g) || []).length === 2);
  truthy('CCS-2 not bare "has stock"', !/- has stock(?! details)/.test(out.user_response));
}

console.log('\n── CCS-3 fail-open: no dym-annotate on this path ⇒ BYTE-IDENTICAL to LIVE ──');
{
  const w = build('inventory', INV, M3, PE_INV);
  const out = run(NEW, w, w.ce);                       // neither annotate node executed
  const live = run(LIVE, build('inventory', INV, M3, PE_INV), w.ce);
  eq('CCS-3 whole output byte-identical', JSON.stringify(out), JSON.stringify(live));
}

console.log('\n── CCS-4 fail-open: probe failed (ok:false) ⇒ BYTE-IDENTICAL to LIVE ──');
{
  const w = build('inventory', INV, M3, PE_INV);
  const { ann } = lane(w, {});                          // no answers array ⇒ ok:false
  eq('CCS-4 ok false', ann.dym_probe_meta.ok, false);
  const out = run(NEW, w, ann);
  const live = run(LIVE, build('inventory', INV, M3, PE_INV), w.ce);
  eq('CCS-4 whole output byte-identical', JSON.stringify(out), JSON.stringify(live));
}

console.log('\n── CCS-5 F-DUPE carries over: multi-uuid code renders BARE here too ──');
{
  const dupes = [cand('SRTWC8317-RL', UU(51)), cand('SRTWC8317-P-RL', UU(52)), cand('SRTWC8317-P-RL', UU(62)), cand('SRTWC8317-SH', UU(53))];
  const w = build('inventory', INV, dupes, PE_INV);
  const { xf, ann } = lane(w, { answers: [invRow('SRTWC8317-SH', '7')] });
  eq('CCS-5 excluded', xf.dym_excluded_codes.map(x => x.code), ['SRTWC8317-P-RL']);
  eq('CCS-5 probed', xf.dym_candidate_codes, ['SRTWC8317-RL', 'SRTWC8317-SH']);
  const out = run(NEW, w, ann);
  console.log('    >>', JSON.stringify(out.user_response));
  truthy('CCS-5 ambiguous bare', !/SRTWC8317-P-RL - (has|no) /.test(out.user_response));
  truthy('CCS-5 ambiguous still offered', ((out.variables||{}).dym_last_result_set || []).some(r => r.value === 'SRTWC8317-P-RL'));
  truthy('CCS-5 sibling labelled', out.user_response.includes('SRTWC8317-SH - has stock details'));
}

console.log('\n── CCS-6 non-enabled domain ⇒ probe never runs ⇒ BYTE-IDENTICAL ──');
{
  const w = build('order', ['order', 'customer', 'product'], M3, PE_INV);
  const { xf } = lane(w, { answers: [] });
  eq('CCS-6 skip reason', xf.probe_skip_reason, 'domain_not_enabled');
  eq('CCS-6 probe_needed', xf.probe_needed, false);
  const out = run(NEW, w, xf);                          // gate-FALSE feeds the xf item through
  const live = run(LIVE, build('order', ['order', 'customer', 'product'], M3, PE_INV), w.ce);
  eq('CCS-6 whole output byte-identical', JSON.stringify(out), JSON.stringify(live));
}

console.log('\n── 🔴 RENDERED-TEXT gate: D1 surface reaches the customer via compile-current-state ──');
{
  // compile-current-state:27 sources the D1 message from $('build-suggest-offer') — the
  // annotation authority itself — so this surface is NOT exposed to the escalate-catalog
  // re-sourcing defect. Asserted, not assumed: that assumption is exactly what failed on the
  // picker surface. This targets the CONSUMER's rendered user_response, not build-suggest-offer.
  const w = build('inventory', INV, M3, PE_INV);
  const annotated = "Couldn't find \"srtwc8317-rl1\". Did you mean:\n1. SRTWC8317-SH - has stock details\n2. SRTWC8317-RL - no stock details\nReply with a code to continue, or would you like me to escalate to warehouse team?";
  w.nodes['build-suggest-offer'] = stub({
    suggest_offer: true, suggest_selection_context: 'suggest_offer',
    suggest_response: annotated,
    suggest_quick_reply: "SRTWC8317-SH,SRTWC8317-RL,Yes escalate,No it's okay",
    suggest_last_result_set: [{ idx:1, label:'SRTWC8317-SH', value:'SRTWC8317-SH' }, { idx:2, label:'SRTWC8317-RL', value:'SRTWC8317-RL' }],
    escalate_message: 'x', is_clarification: false,
  });
  const out = run(NEW, w, w.ce);
  truthy('RENDERED D1 annotation reaches user_response', String(out.user_response).includes('SRTWC8317-SH - has stock details'));
  truthy('RENDERED D1 no-suffix present too', String(out.user_response).includes('SRTWC8317-RL - no stock details'));
  truthy('RENDERED D1 quick_reply stays bare', !String(out.quick_reply ?? out.quickReply ?? '').includes(' - has '));
  // discriminates: strip the annotation from the authority and the rendered text loses it
  const w2 = build('inventory', INV, M3, PE_INV);
  w2.nodes['build-suggest-offer'] = stub({ suggest_offer: true, suggest_selection_context:'suggest_offer',
    suggest_response: annotated.replace(/ - (has|no) stock details/g, ''),
    suggest_quick_reply: "SRTWC8317-SH,SRTWC8317-RL,Yes escalate,No it's okay",
    suggest_last_result_set: [], escalate_message: 'x', is_clarification: false });
  truthy('RENDERED D1 gate discriminates', !String(run(NEW, w2, w2.ce).user_response).includes(' - has stock details'));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
