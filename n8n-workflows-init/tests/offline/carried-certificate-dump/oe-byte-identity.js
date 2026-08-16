#!/usr/bin/env node
// Non-interference comparator: runs EVERY fixture through the pre-B2' fork body and the post-B2' body
// and deep-compares the WHOLE returned object (not just entities).
//
// ⚠️ Honest scope. Plan §8.6 says "every other domain byte-identical". That is NOT literally true of
// B2' and this script is written to say so out loud: part 5 (dedupe) is domain-independent, so any
// turn carrying a duplicate entity key changes in EVERY domain. What this script asserts is the
// defensible invariant: a turn with (a) no carried instance-attachment entity and (b) no duplicate
// entity key is byte-identical. Each differing fixture is printed with its diff so the reviewer sees
// the blast radius rather than a bare count.
const path = require('path');
const { makeRunner, norm, keyOf } = require('./oe-run');

const before = makeRunner(path.join(__dirname, 'oe.before.js'));
const after = makeRunner(path.join(__dirname, process.argv[2] || 'oe.after.js'));
const cases = require('./oe-cases');

const INSTANCE = new Set(['certificate', 'attachment']);

let differ = 0, same = 0, unexpected = 0;
for (const c of cases) {
  const a = JSON.stringify(before(c));
  const b = JSON.stringify(after(c));
  // does this fixture legitimately expect a change?
  const prior = (c.parent_input.previous_conversation_state || {}).entities || [];
  const hasCarriedInstance = prior.some(e => INSTANCE.has(norm(e.hint)));
  const keys = prior.map(keyOf);
  const hasDupe = new Set(keys).size !== keys.length;
  const mayChange = hasCarriedInstance || hasDupe;

  if (a === b) {
    same++;
    console.log(`identical  ${c.id}`);
  } else {
    differ++;
    const tag = mayChange ? 'CHANGED (expected)' : 'CHANGED (UNEXPECTED)';
    if (!mayChange) unexpected++;
    console.log(`${tag}  ${c.id}`);
    const ea = (JSON.parse(a).output || {}).entities || [];
    const eb = (JSON.parse(b).output || {}).entities || [];
    console.log(`     before entities: ${JSON.stringify(ea.map(keyOf))}`);
    console.log(`     after  entities: ${JSON.stringify(eb.map(keyOf))}`);
  }
}
console.log(`compared population: ${cases.length} fixtures  (identical ${same} / changed ${differ})`);
console.log(unexpected
  ? `RED   ${unexpected} fixture(s) changed with neither a carried instance-attachment nor a duplicate key`
  : `GREEN every change is attributable to a carried instance-attachment entity or a duplicate entity key`);
process.exit(unexpected ? 1 : 0);
