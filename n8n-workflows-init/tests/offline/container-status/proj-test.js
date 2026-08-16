// Projection harness — drives the REAL output-structurer body with stubbed n8n globals.
// Fixtures assume sorento_crm_mcp PR #109 has landed: every incoming/stock field carries `key`.
const fs = require('fs');
const body = fs.readFileSync(process.argv[2], 'utf8');

function run(envelope, requestedAttributes) {
  const $ = (name) => {
    if (name === 'MCP Client1') return { first: () => ({ json: envelope }) };
    if (name === 'When Executed by Another Workflow')
      return { first: () => ({ json: { semantic_input: { requested_attributes: requestedAttributes } } }) };
    throw new Error('unexpected $(' + name + ')');
  };
  return new Function('$', body)($)[0].json;
}

const KF = (key, label, value) => ({ key, label, value });
const UF = (label, value) => ({ label, value });          // unkeyed: other result types

// A realistic keyed incoming row: identity + several clearance fields.
const incomingItem = () => ({
  title: 'AAA',
  fields: [
    KF('product_code', 'Product Code', 'AAA'),
    KF('shipment_number', 'Shipment', 'SH-1'),
    KF('shipping_container_number', 'Container', 'ABCD1234'),
    KF('remaining_incoming_quantity', 'Incoming Quantity', 12),
    KF('estimated_arrival_date', 'ETA', '2026-08-13'),
    KF('inspection_date', 'CIDB Inspection', '2026-08-01'),
    KF('approval_date', 'CIDB Approval', '2026-08-05'),
    KF('gatepass_date', 'Gatepass', '2026-08-09'),
    KF('coa_permit_no', 'COA Permit No.', 'COA-9'),
  ],
  flags: {},
});
const env = (items, fieldAccess) => ({
  items, attachments: [], action_links: [], intro: 'Here are the incoming shipments.',
  // result_type is what the SCOPE GUARD keys on — a real incoming envelope always carries it.
  // Without it the guard correctly declines to project, so omitting it here made these fixtures
  // assert against a code path production never takes.
  has_result: true, result_type: 'incoming_stock',
  ...(fieldAccess ? { field_access: fieldAccess } : {}),
});
// An unkeyed result type — orders. Must be untouched.
const orderEnv = env([{ title: 'PS1', fields: [
  UF('Order Number', 'PS1'), UF('Customer', 'ACME'), UF('Status', 'Delivered'),
], flags: {} }]);

const labelsOf = o => o.answers[0].fields.map(f => f.label).join('|');
const ALL_KEYS = ['product_code','product_name','shipment_number','shipping_container_number',
  'batch_number','remaining_incoming_quantity','warehouse_allocations','unallocated_quantity',
  'warehouse','system_location','quantity_on_hand','estimated_arrival_date','eta_delay_date',
  'inspection_date','approval_date','gatepass_date','warehouse_arrival_date',
  'informed_collection_date','collection_date','loading_date','etc_date','etd_date','liner_code',
  'china_forwarder','malaysia_forwarder','consignee','delivery_warehouse','free_days_available',
  'loc','stacked','coa_permit_no'];

const cases = [
  ['P1 asked CIDB approval -> identity + ETA + approval only',
    () => labelsOf(run(env([incomingItem()]), ['approval_date'])),
    'Product Code|Shipment|Container|Incoming Quantity|ETA|CIDB Approval'],

  ['P2 asked nothing -> identity + ETA, all other clearance dropped',
    () => labelsOf(run(env([incomingItem()]), [])),
    'Product Code|Shipment|Container|Incoming Quantity|ETA'],

  ['P3 "cleared CIDB" -> BOTH inspection and approval survive',
    () => labelsOf(run(env([incomingItem()]), ['inspection_date', 'approval_date'])),
    'Product Code|Shipment|Container|Incoming Quantity|ETA|CIDB Inspection|CIDB Approval'],

  ['P4 unkeyed result type is untouched',
    () => labelsOf(run(orderEnv, ['approval_date'])),
    'Order Number|Customer|Status'],

  ['P5 denied -> "can\'t share", NOT "not recorded"',
    () => {
      const o = run(env([incomingItem()], { denied: [{ field: 'liner_code', outcome: 'field_not_allowed' }] }),
        ['liner_code']);
      return /can't share the liner code/.test(o.response) && !/not recorded/.test(o.response);
    }, true],

  ['P6 absent AND not denied -> per-ROW "not recorded yet", no trailing line',
    () => {
      const o = run(env([incomingItem()]), ['etd_date']);
      const f = o.answers[0].fields.find(x => x.key === 'etd_date');
      return { inRow: f && f.value, label: f && f.label,
               trailing: /not recorded yet\.$/m.test(o.response.trim()),
               denied: /can't share/.test(o.response) };
    }, { inRow: 'not recorded yet', label: 'Etd', trailing: false, denied: false }],

  ['P7 shown key produces NO note at all',
    () => {
      const o = run(env([incomingItem()]), ['approval_date']);
      return !/not recorded/.test(o.response) && !/can't share/.test(o.response);
    }, true],

  ['P8 R3: no CRM field KEY ever appears in the customer response',
    () => {
      const o = run(env([incomingItem()], { denied: [{ field: 'liner_code' }] }),
        ['approval_date', 'inspection_date', 'liner_code']);
      return ALL_KEYS.filter(k => o.response.includes(k));
    }, []],

  ['P9 R3: the key changes NOTHING a customer sees, given the same surviving fields',
    () => {
      const asked = ['inspection_date', 'approval_date', 'gatepass_date', 'coa_permit_no'];
      const keyed = run(env([incomingItem()]), asked);
      // same fields, keys stripped, and ALSO no requested attrs -> unkeyed path renders them all
      const stripped = run(env([{ ...incomingItem(),
        fields: incomingItem().fields.map(({ label, value }) => ({ label, value })) }]), []);
      return keyed.response === stripped.response;
    }, true],

  ['P10 DEPLOY GUARD: unkeyed envelope (#109 not live) must NOT invent "not recorded yet"',
    () => {
      const stripped = env([{ ...incomingItem(),
        fields: incomingItem().fields.map(({ label, value }) => ({ label, value })) }]);
      const o = run(stripped, ['liner_code', 'etd_date']);
      return { notes: /not recorded|can't share/.test(o.response), served: o.keys_served,
               fields: o.answers[0].fields.length };
    }, { notes: false, served: false, fields: 9 }],

  ['P11 DRIFT: a renamed CRM label must not affect a key-based projection',
    () => {
      // CRM renames "CIDB Approval" -> "Customs Approval". Key is unchanged.
      const it = incomingItem();
      it.fields = it.fields.map(f => f.key === 'approval_date' ? { ...f, label: 'Customs Approval' } : f);
      return labelsOf(run(env([it]), ['approval_date']));
    }, 'Product Code|Shipment|Container|Incoming Quantity|ETA|Customs Approval'],
];

let fail = 0;
for (const [name, fn, want] of cases) {
  let got;
  try { got = fn(); } catch (e) { got = 'THREW: ' + e.message; }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
console.log(fail ? `\n${fail}/${cases.length} FAILED` : `\nall ${cases.length} passed`);
if (fail) process.exitCode = 1;   // NOT process.exit — appended cases below must still run

// ── appended 2026-08-09: per-row absence, global denial, chronological order ──
const KF2=(key,label,value)=>({key,label,value});
const cont=(code,eta,extra=[])=>({title:code,fields:[
  KF2('product_code','Product Code','SRTWC286-SH-NEW'),
  KF2('shipping_container_number','Container',code),
  KF2('estimated_arrival_date','ETA',eta), ...extra],flags:{}});
// exactly the shape the user hit: 4 containers, only ONE carries an ETA Delay, order scrambled
const mixed=()=>env([
  cont('TCNU2274916','2026-06-26'),
  cont('WHSU6840437','2026-07-18',[KF2('eta_delay_date','ETA Delay','2026-07-22')]),
  cont('ECMU7393988','2026-08-01'),
  cont('TCKU6245254','2026-06-09'),
]);
const extra=[
  ['X1 absence is annotated PER ROW, not once at the end',
    ()=>{const o=run(mixed(),['eta_delay_date']);
      return o.answers.map(it=>(it.fields.find(f=>f.key==='eta_delay_date')||{}).value);},
    // post-SORT order: 06-09, 06-26, 07-18, 08-01 — the delay belongs to the 07-18 container
    ['not recorded yet','not recorded yet','2026-07-22','not recorded yet']],
  ['X2 the per-row label matches what the CRM called it on the row that HAS it',
    ()=>{const o=run(mixed(),['eta_delay_date']);
      return [...new Set(o.answers.map(it=>(it.fields.find(f=>f.key==='eta_delay_date')||{}).label))];},
    ['ETA Delay']],
  ['X3 chronological: rows sorted ascending by ETA',
    ()=>run(mixed(),['eta_delay_date']).answers.map(it=>it.fields.find(f=>f.key==='estimated_arrival_date').value),
    ['2026-06-09','2026-06-26','2026-07-18','2026-08-01']],
  ['X4 DENIED stays ONE global line, never repeated per row',
    ()=>{const o=run(env([cont('A','2026-06-26'),cont('B','2026-07-01')],
        {denied:[{field:'eta_delay_date',outcome:'field_not_allowed'}]}),['eta_delay_date']);
      const perRow=o.answers.some(it=>it.fields.some(f=>f.key==='eta_delay_date'));
      const n=(o.response.match(/can't share/g)||[]).length;
      return {perRow, lines:n};},
    {perRow:false, lines:1}],
  ['X5 no ETA anywhere -> order untouched, no crash',
    ()=>{const o=run(env([{title:'A',fields:[KF2('product_code','Product Code','A')],flags:{}},
                          {title:'B',fields:[KF2('product_code','Product Code','B')],flags:{}}]),[]);
      return o.answers.map(it=>it.fields[0].value);},
    ['A','B']],
  ['X6 rows with NO ETA sort LAST, not first',
    ()=>{const o=run(env([{title:'noeta',fields:[KF2('product_code','Product Code','noeta')],flags:{}},
                          cont('Z','2026-07-01')]),[]);
      return o.answers.map(it=>it.title);},
    ['Z','noeta']],
];
let f2=0;
console.log('\n--- appended cases ---');
for(const [n,fn,want] of extra){
  let got; try{got=fn();}catch(e){got='THREW: '+e.message;}
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok)f2++;
  console.log(`${ok?'  PASS':'  FAIL'}  ${n}`);
  if(!ok)console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
if(f2)process.exitCode=1;

// ── appended: CRM PR #109 forward-compat (keyed attachments + field_vocabulary) ──
const envRT=(items,rt,extra={})=>({items,attachments:[],action_links:[],
  intro:'Here are the results.',has_result:true,result_type:rt,...extra});
const docItem=()=>({title:'Container Status 2026.xlsx',fields:[
  {key:'original_filename',label:'File Name',value:'container-status-2026.xlsx'},
  {key:'uploaded_at',label:'Uploaded',value:'2026-08-08'}],flags:{}});
const incRT=(...f)=>envRT([{title:'AAA',fields:[
  KF2('product_code','Product Code','AAA'),
  KF2('estimated_arrival_date','ETA','2026-08-13'),...f],flags:{}}],'incoming_stock');
const y=[
  ['Y1 #109 keyed DOCUMENT envelope survives projection intact',
    ()=>run(envRT([docItem()],'attachments'),['approval_date']).answers[0].fields.map(f=>f.label),
    ['File Name','Uploaded']],
  ['Y2 keyed STOCK envelope untouched (no clearance there)',
    ()=>run(envRT([{title:'A',fields:[KF2('product_code','Product Code','A'),
        KF2('quantity_on_hand','Quantity On Hand',12)],flags:{}}],'stock'),['approval_date'])
      .answers[0].fields.map(f=>f.label),
    ['Product Code','Quantity On Hand']],
  ['Y3 incoming envelope still projects',
    ()=>run(incRT(KF2('approval_date','CIDB Approval','2026-08-05'),
                  KF2('liner_code','Liner','X')),['approval_date']).answers[0].fields.map(f=>f.label),
    ['Product Code','ETA','CIDB Approval']],
  ['Y4 field_vocabulary names a key NO row carries ("Etd" -> "ETD")',
    ()=>{const o=run(envRT([{title:'A',fields:[KF2('product_code','Product Code','A'),
          KF2('estimated_arrival_date','ETA','2026-08-13')],flags:{}}],'incoming_stock',
          {field_vocabulary:{etd_date:'ETD',eta_delay_date:'ETA Delay'}}),['etd_date']);
      const f=o.answers[0].fields.find(x=>x.key==='etd_date');
      return f&&f.label;},
    'ETD'],
  ['Y5 no field_vocabulary -> humanised fallback still works (pre-#109)',
    ()=>{const o=run(incRT(),['etd_date']);
      const f=o.answers[0].fields.find(x=>x.key==='etd_date'); return f&&f.label;},
    'Etd'],
];
let f3=0;
console.log('\n--- #109 forward-compat ---');
for(const [n,fn,want] of y){
  let got; try{got=fn();}catch(e){got='THREW: '+e.message;}
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok)f3++;
  console.log(`${ok?'  PASS':'  FAIL'}  ${n}`);
  if(!ok)console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
if(f3)process.exitCode=1;

// ── appended: FULL TIMELINE sentinel ──────────────────────────────────────────
const tlRow=()=>({title:'AAA',fields:[
  KF2('product_code','Product Code','AAA'),
  KF2('shipping_container_number','Container','TCNU1'),
  KF2('estimated_arrival_date','ETA','2026-06-26'),
  KF2('inspection_date','CIDB Inspection','2026-07-01'),
  KF2('gatepass_date','Gatepass','2026-07-10'),
  KF2('liner_code','Liner','EVERGREEN')],flags:{}});
const tl=(fa)=>env([tlRow()],fa);
const z=[
  ['T1 timeline keeps EVERY recorded checkpoint (membership; W1-W3 own ORDER)',
    ()=>run(tl(),['__all__']).answers[0].fields.map(f=>f.label).sort(),
    ['CIDB Inspection','Container','ETA','Gatepass','Liner','Product Code']],
  ['T2 timeline does NOT itemise absent fields',
    ()=>{const o=run(tl(),['__all__']);
      return {rows:o.answers[0].fields.some(f=>f.value==='not recorded yet'),
              text:/not recorded yet/.test(o.response)};},
    {rows:false,text:false}],
  ['T3 timeline never advertises an unasked-for denial (sentinel alone)',
    ()=>{const o=run(tl({denied:[{field:'etd_date',label:'ETD',outcome:'field_not_allowed'}]}),['__all__']);
      return /can't share/.test(o.response);},
    false],
  // T3b is the case that makes the !_isTimeline guard falsifiable. `_isTimeline` is
  // `.some(k === '__all__')` — CONTAINS the sentinel, not IS it alone. The prompt tells the LLM to
  // emit it alone, but that is an instruction, not an invariant, and the code tolerates a mixed
  // array on purpose. With the sentinel AND a denied key present, removing the guard emits the
  // note. T3 (sentinel alone) cannot see that; only this shape can.
  ['T3b MIXED sentinel+denied key: guard still suppresses (this is what T3 could not test)',
    ()=>{const o=run(tl({denied:[{field:'eta_delay_date',label:'ETA Delay',outcome:'field_not_allowed'}]}),
        ['__all__','eta_delay_date']);
      return /can't share/.test(o.response);},
    false],

  ['T4 EXPLICIT ask still gets both messages (timeline suppression is not global)',
    ()=>{const o=run(tl({denied:[{field:'etd_date',label:'ETD',outcome:'field_not_allowed'}]}),
        ['etd_date','collection_date']);
      return {denied:/can't share the ETD/i.test(o.response),
              absent:o.answers[0].fields.some(f=>f.key==='collection_date'&&f.value==='not recorded yet')};},
    {denied:true,absent:true}],
  ['T5 timeline still sorts chronologically and still hides nothing keyed',
    ()=>{const o=run(env([
        {title:'B',fields:[KF2('product_code','Product Code','B'),KF2('estimated_arrival_date','ETA','2026-08-01'),
                           KF2('gatepass_date','Gatepass','2026-08-05')],flags:{}},
        {title:'A',fields:[KF2('product_code','Product Code','A'),KF2('estimated_arrival_date','ETA','2026-06-09')],flags:{}},
      ]),['__all__']);
      return o.answers.map(it=>it.fields.find(f=>f.key==='estimated_arrival_date').value);},
    ['2026-06-09','2026-08-01']],
  ['T6 sentinel never survives as a field NOR as text (it leaks HUMANISED, not literal)',
    ()=>{const o=run(tl(),['__all__']);
      return {asField:o.answers[0].fields.some(f=>f.key==='__all__'),
              literal:/__all__/.test(o.response),
              humanised:/\*\s+all\s+:/.test(o.response)||/\ball\b:/.test(o.response)};},
    {asField:false,literal:false,humanised:false}],
];
let f4=0;
console.log('\n--- full timeline ---');
for(const [n,fn,want] of z){
  let got; try{got=fn();}catch(e){got='THREW: '+e.message;}
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok)f4++;
  console.log(`${ok?'  PASS':'  FAIL'}  ${n}`);
  if(!ok)console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
if(f4)process.exitCode=1;

// ── appended: timeline FIELD order (facts top, dates chronological) ───────────
const realRow=()=>({title:'X',fields:[
  KF2('product_code','Product Code','SRTWCY8605'),
  KF2('shipping_container_number','Container','DFSU7715680'),
  KF2('remaining_incoming_quantity','Incoming Quantity',225),
  KF2('estimated_arrival_date','ETA','2026-06-09'),
  KF2('inspection_date','CIDB Inspection','2026-06-19'),
  KF2('gatepass_date','Gatepass','2026-06-29'),
  KF2('collection_date','Collection','2026-07-04'),
  KF2('loading_date','Loading','2026-05-30'),
  KF2('etc_date','ETC','2026-05-31'),
  KF2('etd_date','ETD','2026-06-02'),
  KF2('liner_code','Liner','TCLC'),
  KF2('consignee','Consignee','Sorento'),
  KF2('free_days_available','Free Days Available',7),
  KF2('loc','Location','YARD-A')],flags:{}});
const w=[
  ['W1 non-date facts stay at TOP, in original order',
    ()=>run(env([realRow()]),['__all__']).answers[0].fields
        .filter(f=>!/^\d{4}-\d{2}-\d{2}/.test(String(f.value))).map(f=>f.label),
    ['Product Code','Container','Incoming Quantity','Liner','Consignee','Free Days Available','Location']],
  ['W2 dates follow, ascending',
    ()=>run(env([realRow()]),['__all__']).answers[0].fields
        .filter(f=>/^\d{4}-\d{2}-\d{2}/.test(String(f.value))).map(f=>f.value),
    ['2026-05-30','2026-05-31','2026-06-02','2026-06-09','2026-06-19','2026-06-29','2026-07-04']],
  ['W3 every date sits AFTER every fact (no interleaving)',
    ()=>{const fs=run(env([realRow()]),['__all__']).answers[0].fields
          .map(f=>/^\d{4}-\d{2}-\d{2}/.test(String(f.value))?'D':'F').join('');
      return /^F+D+$/.test(fs);}, true],
  ['W4 numeric-looking non-dates are NOT treated as dates',
    ()=>run(env([realRow()]),['__all__']).answers[0].fields
        .findIndex(f=>f.key==='free_days_available') < 
        run(env([realRow()]),['__all__']).answers[0].fields.findIndex(f=>f.key==='loading_date'),
    true],
  ['W5 NON-timeline answers keep CRM order untouched',
    ()=>run(env([realRow()]),['gatepass_date']).answers[0].fields.map(f=>f.label),
    ['Product Code','Container','Incoming Quantity','ETA','Gatepass']],
];
let f5=0;
console.log('\n--- timeline field order ---');
for(const [n,fn,want] of w){
  let got; try{got=fn();}catch(e){got='THREW: '+e.message;}
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok)f5++;
  console.log(`${ok?'  PASS':'  FAIL'}  ${n}`);
  if(!ok)console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
if(f5)process.exitCode=1;
