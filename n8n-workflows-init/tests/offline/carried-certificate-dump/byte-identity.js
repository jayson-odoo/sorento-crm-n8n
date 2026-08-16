// §CD-4 / plan §2.3: "every other domain byte-identical". Runs the BEFORE body and the AFTER
// body on the SAME pinned inputs and diffs the whole output object, not just gate_passed.
const fs=require('fs'), path=require('path');
const dir=__dirname;
const cases=require('./cases.json');
function run(body,parserOut,resolverOut){
  const $=(n)=>({first:()=>({json:n==="Call 'sub-query-reformulator'"?{output:parserOut}:n==='resolve-entity'?resolverOut:{}})});
  const $input={first:()=>({json:{}})};
  return new Function('$','$input',body+"\n")($,$input);
}
const before=fs.readFileSync(path.join(dir,'gate.before.js'),'utf8');
const after =fs.readFileSync(path.join(dir,'gate.after.js'),'utf8');
let diffs=0, same=0;
for(const c of cases){
  const a=JSON.stringify(run(before,c.parser,c.resolver));
  const b=JSON.stringify(run(after ,c.parser,c.resolver));
  if(a===b){ same++; console.log(`IDENTICAL  ${c.name}`); }
  else { diffs++; console.log(`DIFFERS    ${c.name}\n   before: ${a}\n   after : ${b}`); }
}
console.log(`\ncompared population: ${cases.length}  identical: ${same}  differing: ${diffs}`);
console.log(diffs===1 ? 'EXPECTED: exactly 1 differing case (CD-1, the reported dump).' : 'UNEXPECTED differing count.');
process.exit(diffs===1?0:1);
