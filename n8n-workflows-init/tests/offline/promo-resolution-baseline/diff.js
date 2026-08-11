#!/usr/bin/env node
// Diff two promotion-resolution captures. Exists so "no regression to promotion enquiry" is a
// measurement, not an opinion.
//
//   node diff.js baseline.json after.json
//
// Exit 0 = every phrase kept its result set. Exit 1 = something moved; the report says what.
// A shrinking set is the regression to fear (a promotion the customer used to find, now missing).
// A growing set is usually the point of the change, but it is still reported — silently widening
// is how the "cabana car" rows got in.
const fs = require('fs');
const [, , aPath, bPath] = process.argv;
if (!aPath || !bPath) { console.log('usage: node diff.js baseline.json after.json'); process.exit(2); }
const load = (p) => Object.fromEntries(JSON.parse(fs.readFileSync(p, 'utf8')).map(r => [r.phrase, r]));
const A = load(aPath), B = load(bPath);

let lost = 0, gained = 0, tier = 0, ok = 0, unstable = 0;
for (const phrase of Object.keys(A)) {
  const a = A[phrase], b = B[phrase];
  if (!b) { console.log(`\n❓ ${phrase}\n   missing from ${bPath}`); continue; }
  // The PARSER is non-deterministic on some phrases: "promotion flyer" produced tokens ['flyer']
  // (n=7) in one capture and [] (n=0) in the next, with no resolver change in between. If the
  // resolver was never asked the same question, the row sets are NOT comparable and reporting the
  // difference as LOST would blame the resolver for the parser. Flag and skip.
  const tk = (r) => JSON.stringify((r.tokens || []).map(t => String(t).toLowerCase()).sort());
  if (tk(a) !== tk(b)) {
    unstable++;
    console.log(`\n⚠️  ${phrase}`);
    console.log(`   NOT COMPARABLE — parser emitted different tokens: ${tk(a)} -> ${tk(b)}`);
    console.log(`   (n ${a.n} -> ${b.n}) re-capture this phrase before judging it`);
    continue;
  }
  const key = (r) => `${r.type}:${r.uuid || r.code}`;
  const am = new Map((a.rows || []).map(r => [key(r), r]));
  const bm = new Map((b.rows || []).map(r => [key(r), r]));
  const missing = [...am.keys()].filter(k => !bm.has(k));
  const added = [...bm.keys()].filter(k => !am.has(k));
  const retiered = [...am.keys()].filter(k => bm.has(k) &&
    (am.get(k).tier !== bm.get(k).tier || am.get(k).field !== bm.get(k).field));
  if (!missing.length && !added.length && !retiered.length) { ok++; continue; }
  console.log(`\n${missing.length ? '🔴' : '⚠️ '} ${phrase}`);
  console.log(`   n ${a.n} -> ${b.n}   fallback ${a.fallback_applied} -> ${b.fallback_applied}`);
  for (const k of missing) { lost++; console.log(`   LOST   ${(am.get(k).desc || am.get(k).code || k).slice(0, 66)}`); }
  for (const k of added) { gained++; console.log(`   GAINED ${(bm.get(k).desc || bm.get(k).code || k).slice(0, 66)}`); }
  for (const k of retiered) {
    tier++;
    console.log(`   TIER   ${(am.get(k).desc || am.get(k).code || k).slice(0, 50)}  ` +
                `${am.get(k).field}/${am.get(k).tier} -> ${bm.get(k).field}/${bm.get(k).tier}`);
  }
}
console.log(`\n${ok}/${Object.keys(A).length} phrases unchanged | lost ${lost} | gained ${gained} | retiered ${tier} | not-comparable ${unstable}`);
if (unstable) console.log('⚠️  NOT-COMPARABLE phrases prove nothing either way — the parser asked a different question.');
if (lost) console.log('🔴 LOST rows are the regression: a promotion the customer could find before, and cannot now.');
process.exit(lost ? 1 : 0);
