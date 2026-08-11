// TRUE byte-identity gate: LIVE build-suggest-offer vs the MODIFIED clone body,
// 🔴 NODE BODIES ARE SOURCED FROM export/ (reviewer F-STALE, 2026-08-08). This suite used to read
// hand-held copies in this directory; they drifted from what was published, so `ALL PASS` was a
// statement about yesterday's bytes. Worse, the stale copies were MUTUALLY CONSISTENT — the stale
// dym-transform never emitted `dym_capped_codes`, so the stale build-suggest-offer was right not to
// strip it, and the gate built to catch that omission passed. See ../node-source.js.
// Run `python3 n8n-workflows-init/scripts/export-workflows.py --verify` first.
// on every path this change must not touch. Comparison is cross-file, so a
// regression in the modified body makes it go red (unlike a same-file A/B).
const fs = require('fs'); const P = __dirname;
const { loadNodes } = require('../node-source');
const _CLONE_FILES = ["build-suggest-offer.js", "dym-transform.js", "dym-annotate.js"];
const _SRC = loadNodes('clone-sorento-consume-main-TEST', _CLONE_FILES);
// live-*.js are deliberate LOCAL snapshots of the live spine (the comparison baseline), so they are
// the ONLY files still read from this directory.
const src = (f) => (f in _SRC) ? _SRC[f] : fs.readFileSync(`${P}/${f}`, 'utf8');
const mk = f => new Function('$','$input','$execution', src(f));
const LIVE = mk('live-bso.js'), NEW = mk('build-suggest-offer.js'), XF = mk('dym-transform.js'), ANN = mk('dym-annotate.js');
const item = j => ({json:j});
const stub = (j,e=true) => ({isExecuted:e, first:()=>item(j), all:()=>[item(j)]});
let fails=0; const chk=(n,a,b)=>{ if(JSON.stringify(a)!==JSON.stringify(b)){fails++;console.log(`FAIL ${n}\n A ${JSON.stringify(a)}\n B ${JSON.stringify(b)}`);} else console.log(`ok   ${n}`); };
const UU = n => `1439736c-20ca-4bba-b387-b242ff4a45${String(n).padStart(2,'0')}`;
const cand = (c,u,t='product',tier='fuzzy') => ({canonical_code:c,uuid:u,entity_type:t,match_tier:tier});

function W(o){
  const notFound = {escalate_message:'Could not find. Escalate?', is_clarification:false, found_summary:''};
  const nodes = {
    "Call 'sub-query-reformulator'": stub({output:{domain_hint:o.domain, entities:o.pe||[], routing:{suggested_team:'customer_service'}, date_filter_start:o.ds||null, date_filter_end:o.de||null}}),
    'resolve-entity': stub({resolutions:o.res}),
    'disallowed-entity-gate': stub({gate_debug:{domain:o.domain, allowed_lookup:o.allowed}, compatible_entities:o.compat||[], require_specific:false}),
    'not-found-error-message': stub(notFound),
    'sibling-transform': stub({},false), 'sibling-probe': stub({},false),
    "Call 'sub-get-results'": o.alts ? stub({alternatives:o.alts, relaxed_axis:o.axis||'entity'}) : stub({},false),
    'dym-annotate': stub({},false),
  };
  return {$:(n)=>{ if(!(n in nodes)) throw new Error('no '+n); return nodes[n]; }, nodes, notFound};
}
function cmp(name,o,viaXf){
  const wa=W(o), wb=W(o);
  const live = LIVE(wa.$, {first:()=>item(wa.notFound)}, {id:'999'});
  let inp = wb.notFound;
  if (viaXf) inp = XF(wb.$, {first:()=>item(wb.notFound)}, {id:'999'})[0].json;
  const nw = NEW(wb.$, {first:()=>item(inp)}, {id:'999'});
  chk(name, nw, live);
}
// non-enabled domains, single-token D1 code mode
for (const d of ['order','master_products','incoming']) cmp(`DP-10 ${d} D1-code`, {domain:d, allowed:['product'], pe:[{raw:'x',hint:'product'}], res:[{token:'x',resolved:false,matches:[cand('A-1',UU(7)),cand('B-1',UU(8))]}]}, true);
// enabled domain, but probe skipped (no uuid) -> gate FALSE branch
cmp('DP-9 inventory no-uuid', {domain:'inventory', allowed:['product','category','brand'], pe:[], res:[{token:'t',resolved:false,matches:[cand('A-1',null),cand('B-1',null)]}]}, true);
// multi-token D1 (global contiguous idx)
cmp('DP-13a multi-token', {domain:'inventory', allowed:['product','category','brand'], pe:[], res:[{token:'t1',resolved:false,matches:[cand('A-1',UU(7))]},{token:'t2',resolved:false,matches:[cand('B-1',UU(8))]}]}, true);
// numbered mode (uuid canonical_code + display name) in a promotion domain
cmp('DP-13b numbered mode', {domain:'promotion', allowed:['product','promotion','category','brand'], pe:[], res:[{token:'p',resolved:false,matches:[{canonical_code:UU(9),uuid:UU(9),entity_type:'promotion',match_tier:'fuzzy',display:{description:'Raya Promo'}}]}]}, true);
// D2 alternatives, non-uuid, entity axis, in an ENABLED domain
cmp('DP-13c D2 inventory', {domain:'inventory', allowed:['product','category','brand'], pe:[{raw:'z',hint:'product'}], compat:[{uuid:UU(3),entity_type:'product',code:'Z-1'}], res:[{token:'z',resolved:true,matches:[cand('Z-1',UU(3),'product','exact')]}], alts:[{value:'Y-1'},{value:'Y-2'}]}, true);
// D2 alternatives in product_attachment (attachmentNoun path must be untouched)
cmp('DP-13c D2 attachment noun', {domain:'product_attachment', allowed:['product','attachment_type'], pe:[{raw:'a',hint:'product'},{raw:'cert',hint:'attachment_type'}], compat:[{uuid:UU(3),entity_type:'product',code:'A-1'}], res:[{token:'a',resolved:true,matches:[cand('A-1',UU(3),'product','exact')]}], alts:[{value:'B-1'}]}, true);
// D2 date axis
cmp('D2 date axis', {domain:'order', allowed:['order','customer'], pe:[{raw:'ACME',hint:'customer'}], ds:'2026-01-01', res:[{token:'ACME',resolved:true,matches:[cand('ACME',UU(3),'customer','exact')]}], alts:[{value:'2026-01-05',display:'5 Jan'}], axis:'date'}, true);
// F-DUPE: every candidate behind >1 uuid ⇒ probe never runs ⇒ un-annotated render must be
// byte-identical to LIVE (the "all excluded" path the reviewer required covering).
cmp('F-DUPE all-excluded byte-identical', {domain:'inventory', allowed:['product','category','brand'], pe:[], res:[{token:'t',resolved:false,matches:[cand('A-1',UU(7)),cand('A-1',UU(17)),cand('B-1',UU(8)),cand('B-1',UU(18))]}]}, true);
// F-DUPE: mixed — one ambiguous code among unambiguous ones; gate-FALSE render still == LIVE.
cmp('F-DUPE mixed, gate-FALSE byte-identical', {domain:'inventory', allowed:['product','category','brand'], pe:[], res:[{token:'t',resolved:false,matches:[cand('A-1',UU(7)),cand('B-1',UU(8)),cand('B-1',UU(18))]}]}, true);
// direct inbound (sibling-probe / annotate-incoming-picker) — no dym-transform in the path
cmp('DP-12 direct inbound', {domain:'incoming', allowed:['product'], pe:[{raw:'x',hint:'product'}], res:[{token:'x',resolved:false,matches:[cand('A-1',UU(7))]}]}, false);
console.log(fails===0?'\nBYTE-IDENTITY: ALL PASS':`\n${fails} FAILURES`); process.exit(fails?1:0);
