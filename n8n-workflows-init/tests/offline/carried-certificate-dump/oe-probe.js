#!/usr/bin/env node
// §CD-5 / §CD-7c / §CD-10b / §CD-11a / §CD-11b assertions against a real `output_exchange` body.
//   node oe-probe.js [bodyPath]      (default: oe.after.js)
// Exit 0 = all green, 1 = at least one RED. Prints the compared-population count (LESSONS §61).
const path = require('path');
const { makeRunner, norm, keyOf } = require('./oe-run');

const bodyPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'oe.after.js');
const cases = require('./oe-cases');
const run = makeRunner(bodyPath);

let fails = 0, compared = 0;

for (const c of cases) {
  if (c.tag === 'non-interference' && Object.keys(c.expect).length === 0) continue;
  compared++;
  const problems = [];
  let out;
  try {
    out = run(c);
  } catch (e) {
    problems.push('THREW: ' + e.message);
  }
  if (out) {
    const o = out.output || {};
    const ents = Array.isArray(o.entities) ? o.entities : [];
    const hints = ents.map(e => norm(e.hint));
    const raws = ents.map(e => norm(e.raw));
    const ex = c.expect;

    for (const h of ex.noHint || []) {
      if (hints.includes(norm(h))) {
        problems.push(`hint '${h}' PRESENT but must be evicted -> ` +
          JSON.stringify(ents.filter(e => norm(e.hint) === norm(h))));
      }
    }
    for (const h of ex.hasHint || []) {
      if (!hints.includes(norm(h))) problems.push(`hint '${h}' MISSING (over-eviction)`);
    }
    for (const r of ex.hasRaw || []) {
      if (!raws.includes(norm(r))) problems.push(`raw '${r}' MISSING -> ${JSON.stringify(raws)}`);
    }
    if (ex.dymPickApplied !== undefined && o.dym_pick_applied !== ex.dymPickApplied) {
      // per §CD-11: if the pick did not run the case is VOID, not green
      problems.push(`dym_pick_applied === ${o.dym_pick_applied}, expected ${ex.dymPickApplied} (case is VOID, not green)`);
    }
    if (ex.entityOpApplied && o.entity_op_applied !== ex.entityOpApplied) {
      problems.push(`entity_op_applied === ${o.entity_op_applied}, expected ${ex.entityOpApplied}`);
    }
    for (const [h, n] of Object.entries(ex.hintCount || {})) {
      const got = hints.filter(x => x === norm(h)).length;
      if (got !== n) problems.push(`hint '${h}' count ${got}, expected ${n}`);
    }
    if (ex.noDuplicateKeys) {
      const seen = new Set(), dupes = [];
      for (const e of ents) { const k = keyOf(e); if (seen.has(k)) dupes.push(k); seen.add(k); }
      if (dupes.length) problems.push(`duplicate entity keys: ${JSON.stringify(dupes)}`);
    }
    for (const [k, u] of Object.entries(ex.uuidForKey || {})) {
      const hit = ents.find(e => keyOf(e) === k);
      if (!hit) problems.push(`uuidForKey: no entity with key '${k}' -> ${JSON.stringify(ents.map(keyOf))}`);
      else if (norm(hit.uuid) !== norm(u)) problems.push(`'${k}'.uuid === ${hit.uuid}, expected ${u} (the dedupe dropped the resolution)`);
    }
  }

  if (problems.length) {
    fails++;
    console.log(`FAIL ${c.id}`);
    for (const p of problems) console.log(`       ${p}`);
  } else {
    console.log(`ok   ${c.id}`);
  }
}

console.log(`compared population: ${compared} fixtures against ${path.basename(bodyPath)}`);
console.log(fails ? `RED   ${fails}/${compared}` : `GREEN ${compared}/${compared}`);
process.exit(fails ? 1 : 0);
