const fs = require('fs');
const body = fs.readFileSync('deployed-structurer.js', 'utf8');   // the DEPLOYED node code, unmodified

function run(envelope) {
  const $ = (name) => ({ first: () => ({ json: name === 'MCP Client1' ? envelope : { semantic_input: {} } }) });
  return new Function('$', body)($);
}

const alloc = (code, extraFields, flags) => ({
  title: code,
  fields: [{label:'Product Code',value:code},{label:'Incoming Quantity',value:60}, ...extraFields],
  flags: Object.assign({discontinued:false,expired:false,unallocated:false,partially_allocated:false}, flags),
});

const CASES = [
  ['C1 fully allocated → no badge',
   [alloc('A',[{label:'Warehouse Allocations',value:'BRW (100)'}],{})],
   r => !/ALLOCATION\)/.test(r)],

  ['C2 unallocated → PENDING',
   [alloc('B',[],{unallocated:true})],
   r => /🚩  \*\(PENDING ALLOCATION\)\*/.test(r) && !/PARTIAL/.test(r)],

  ['C3 partial → PARTIAL',
   [alloc('C',[{label:'Warehouse Allocations',value:'BRW (60)'},{label:'Unallocated Quantity',value:40}],{partially_allocated:true})],
   r => /🚩  \*\(PARTIAL ALLOCATION\)\*/.test(r) && /\*Unallocated Quantity:\* 40/.test(r) && !/PENDING/.test(r)],

  ['C4 discontinued + unallocated → both badges',
   [alloc('D',[],{discontinued:true,unallocated:true})],
   r => /PRODUCT DISCONTINUED/.test(r) && /PENDING ALLOCATION/.test(r)],

  ['C5 no flags key at all (pre-Phase-B MCP) → no badge, no crash',
   [{title:'E', fields:[{label:'Product Code',value:'E'}]}],
   r => !/ALLOCATION\)/.test(r) && /Product Code:\* E/.test(r)],

  ['C6 both flags true (defensive) → PENDING only, not doubled',
   [alloc('F',[],{unallocated:true,partially_allocated:true})],
   r => (r.match(/ALLOCATION\)/g)||[]).length === 1 && /PENDING/.test(r)],

  ['C7 mixed list → badge lands on the right item only',
   [alloc('G',[{label:'Warehouse Allocations',value:'BRW (100)'}],{}), alloc('H',[],{unallocated:true})],
   r => { const items = r.split(/\n(?=\d+\. )/); return !/ALLOCATION\)/.test(items[1]) && /PENDING ALLOCATION/.test(items[2]); }],
];

let fail = 0;
for (const [name, items, assertFn] of CASES) {
  const out = run({ items, intro: 'Here is the incoming stock.', has_result: true }); 
  const resp = out[0].json.response;
  const ok = assertFn(resp);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log('----\n' + resp + '\n----');
}

// negative control: strip the badge lines, C2 MUST fail
const stripped = body.split('\n').filter(l => !l.includes('ALLOCATION)*')).join('\n');
const negResp = new Function('$', stripped)((n)=>({first:()=>({json:{items:[alloc('B',[],{unallocated:true})],intro:'x',has_result:true}})}))[0].json.response;
const negOk = !/PENDING ALLOCATION/.test(negResp);
console.log(`${negOk ? 'PASS' : 'FAIL'}  NEG-CONTROL: assertion fails when badge code removed`);
if (!negOk) fail++;

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
