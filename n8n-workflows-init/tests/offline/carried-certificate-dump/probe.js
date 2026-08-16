const fs=require('fs');
const body=fs.readFileSync(process.argv[2],'utf8');
function run(parserOut, resolverOut, inputJson){
  const $ = (name)=>({ first:()=>({ json: name==="Call 'sub-query-reformulator'" ? {output:parserOut}
                                        : name==='resolve-entity' ? resolverOut : {} }) });
  const $input={first:()=>({json:JSON.parse(JSON.stringify(inputJson))})};
  return new Function('$','$input', body + "\n")($,$input);
}
const cases=[
 // 1. the bad turn (seeded state): srtwc8317-rl1 missed; carried cert+attachment_type resolved
 {name:'CD-1 bad turn (srtwc8317-rl1 cert, carried cert)',
  parser:{domain_hint:'product_attachment',entities:[
    {raw:'srtwc8317-rl1',hint:'product',current_message:true},
    {raw:'cert',hint:'attachment_type',canonical_code:'certificate',current_message:true},
    {raw:'PC000078',hint:'certificate',canonical_code:'PC 000078'}]},
  resolver:{unresolved_tokens:['srtwc8317-rl1'],tokens:['srtwc8317-rl1','cert','PC000078'],
    resolutions:[
      {token:'srtwc8317-rl1',matches:[]},
      {token:'cert',matches:[{uuid:'1439736c-20ca-4bba-b387-b242ff4a4599',entity_type:'attachment_type',canonical_code:'Certification',match_tier:'exact'}]},
      {token:'PC000078',matches:[{uuid:'aa10fd73-96bf-4418-91c3-7780a36305fe',entity_type:'certificate',canonical_code:'PC 000078',match_tier:'exact'}]}]},
  expectFire:true},
 // 2. legitimate certificate listing — no product hint at all
 {name:'CD-2 certification with number PC000078 (no product hint)',
  parser:{domain_hint:'product_attachment',entities:[
    {raw:'PC000078',hint:'certificate'},{raw:'certification',hint:'attachment_type'}]},
  resolver:{unresolved_tokens:[],tokens:['PC000078','certification'],
    resolutions:[
      {token:'PC000078',matches:[{uuid:'aa10fd73',entity_type:'certificate',canonical_code:'PC 000078',match_tier:'exact'}]},
      {token:'certification',matches:[{uuid:'1439736c',entity_type:'attachment_type',canonical_code:'Certification',match_tier:'exact'}]}]},
  expectFire:false},
 // 3. resolving product + cert -> intersection
 {name:'CD-3 MWC7602-RL-P cert (product RESOLVES) + carried cert',
  parser:{domain_hint:'product_attachment',entities:[
    {raw:'MWC7602-RL-P',hint:'product'},{raw:'cert',hint:'attachment_type'},{raw:'PC000078',hint:'certificate'}]},
  resolver:{unresolved_tokens:[],tokens:['MWC7602-RL-P','cert','PC000078'],
    resolutions:[
      {token:'MWC7602-RL-P',matches:[{uuid:'72aa8105',entity_type:'product',canonical_code:'MWC7602-RL-P',match_tier:'exact'}]},
      {token:'cert',matches:[{uuid:'1439736c',entity_type:'attachment_type',canonical_code:'Certification',match_tier:'exact'}]},
      {token:'PC000078',matches:[{uuid:'aa10fd73',entity_type:'certificate',canonical_code:'PC 000078',match_tier:'exact'}]}]},
  expectFire:false},
 // 4. other domain, same shape (inventory) — B1 must NOT fire
 {name:'CD-4 inventory miss with carried certificate',
  parser:{domain_hint:'inventory',entities:[{raw:'srtwc8317-rl1',hint:'product'}]},
  resolver:{unresolved_tokens:['srtwc8317-rl1'],tokens:['srtwc8317-rl1'],
    resolutions:[{token:'srtwc8317-rl1',matches:[]},
      {token:'PC000078',matches:[{uuid:'aa10fd73',entity_type:'certificate',canonical_code:'PC 000078',match_tier:'exact'}]}]},
  expectFire:false},
 // 5. unresolved product, NO attachment_type at all (required-type block already blocks) — B1 must be inert
 {name:'CD-x product_attachment, unresolved product, no attachment_type (pre-blocked by required-type)',
  parser:{domain_hint:'product_attachment',entities:[{raw:'srtwc8317-rl1',hint:'product'}]},
  resolver:{unresolved_tokens:['srtwc8317-rl1'],tokens:['srtwc8317-rl1'],resolutions:[{token:'srtwc8317-rl1',matches:[]}]},
  expectFire:false},
 // ---- discriminators: each exists so a specific §CD-FP mutation goes RED ----
 // FP-1 discriminator: a NON-product_attachment domain that still has gate_passed===true when B1
 // runs, and a missed product raw. Without this, `domain === 'product_attachment'` -> `true`
 // is undetectable (every other domain fixture was already gate_passed===false by then).
 {name:'FP1-D master_products: brand resolves, product raw MISSES (B1 must stay inert)',
  parser:{domain_hint:'master_products',entities:[
    {raw:'srtwc8317-rl1',hint:'product'},{raw:'sorento',hint:'brand'}]},
  resolver:{unresolved_tokens:['srtwc8317-rl1'],tokens:['srtwc8317-rl1','sorento'],
    resolutions:[{token:'srtwc8317-rl1',matches:[]},
      {token:'sorento',matches:[{uuid:'brand-1',entity_type:'brand',canonical_code:'SORENTO',match_tier:'exact'}]}]},
  expectFire:false},
 // FP-2 discriminator: one product raw MISSES while another product RESOLVES. B1 must not fire —
 // there is a real product to scope on. Drops of `!_haveProduct` are caught only here.
 {name:'FP2-D product_attachment: MWC7602-RL-P resolves, srtwc8317-rl1 misses (B1 must stay inert)',
  parser:{domain_hint:'product_attachment',entities:[
    {raw:'MWC7602-RL-P',hint:'product'},{raw:'srtwc8317-rl1',hint:'product'},
    {raw:'cert',hint:'attachment_type'}]},
  resolver:{unresolved_tokens:['srtwc8317-rl1'],tokens:['MWC7602-RL-P','srtwc8317-rl1','cert'],
    resolutions:[
      {token:'MWC7602-RL-P',matches:[{uuid:'72aa8105',entity_type:'product',canonical_code:'MWC7602-RL-P',match_tier:'exact'}]},
      {token:'srtwc8317-rl1',matches:[]},
      {token:'cert',matches:[{uuid:'1439736c',entity_type:'attachment_type',canonical_code:'Certification',match_tier:'exact'}]}]},
  expectFire:false},
 // FP-3 discriminator: an UNRESOLVED non-product raw (an unknown certificate number) with no
 // product hint anywhere. B1 keys on product raws only, so it must stay inert. Widening the
 // hint filter is caught only here.
 {name:'FP3-D product_attachment: unknown certificate number misses, no product hint (B1 must stay inert)',
  parser:{domain_hint:'product_attachment',entities:[
    {raw:'PC000079',hint:'certificate'},{raw:'certification',hint:'attachment_type'}]},
  resolver:{unresolved_tokens:['pc000079'],tokens:['PC000079','certification'],
    resolutions:[{token:'PC000079',matches:[]},
      {token:'certification',matches:[{uuid:'1439736c',entity_type:'attachment_type',canonical_code:'Certification',match_tier:'exact'}]}]},
  expectFire:false},
];
let bad=0;
for(const c of cases){
  const r=run(c.parser,c.resolver,{});
  const fired=/subject product did not resolve/.test(r.gate_reason);
  const ok = fired===c.expectFire;
  if(!ok) bad++;
  console.log(`${ok?'OK  ':'FAIL'} ${c.name}\n     gate_passed=${r.gate_passed} require_specific=${r.require_specific} B1fired=${fired} (expect ${c.expectFire})\n     gate_reason=${JSON.stringify(r.gate_reason)}\n     compatible_entities=${JSON.stringify(r.compatible_entities)}`);
}
console.log(`\ncompared population: ${cases.length} cases, ${bad} unexpected`);
process.exit(bad?1:0);
