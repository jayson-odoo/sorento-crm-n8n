// ── build-ccs — produces the NEW compile-current-state body, deterministically ───────────
// spec-answer-honesty-plan §1 (N-2 + N-3). Same doctrine as build-body.js: every splice is
// anchored on a string ASSERTED to occur exactly once, and every splice is asserted to have
// changed the file. A builder that quietly matches nothing is the §72/S9 failure mode, one
// level up from the mutation harness.
//
//   node build-ccs.js            # writes compile-current-state.after.js
//   node build-ccs.js --print    # stdout only

const fs = require('fs');
const path = require('path');
const H = require('./ccs-hunks.js');

const DIR = __dirname;
const BEFORE = path.join(DIR, 'compile-current-state.before.js');
const AFTER = path.join(DIR, 'compile-current-state.after.js');

function once(hay, needle, label) {
  const n = hay.split(needle).length - 1;
  if (n !== 1) {
    throw new Error(`anchor "${label}" occurs ${n} times, expected exactly 1 — the node body ` +
      `moved. Re-freeze compile-current-state.before.js from the export and re-read the diff ` +
      `before rebuilding.`);
  }
}

function build() {
  const before = fs.readFileSync(BEFORE, 'utf8');
  let out = before;

  // N-3, part 1: the predicate declarations, immediately above `let missResolutions = [];`
  once(out, H.N3_ANCHOR, 'N3_ANCHOR (let missResolutions)');
  out = out.replace(H.N3_ANCHOR, H.N3_DECL + H.N3_ANCHOR);

  // N-3, part 2: one clause on the resolutions filter
  once(out, H.N3_FILTER_BEFORE, 'N3_FILTER_BEFORE (gate-resolved clause)');
  out = out.replace(H.N3_FILTER_BEFORE, H.N3_FILTER_AFTER);

  // (No part 3: the legacy single-resolution arm is deliberately untouched — see the proof
  // in ccs-hunks.js. A clause there would be unreachable.)

  // N-1a (SR-1b): the "Matched on" line. Spliced at the N-2 anchor FIRST, so the N-2 splice
  // below lands between it and the friendly-domain block — i.e. the emitted order is
  // N-1a, N-2, P/S, which is the order the customer reads them in.
  once(out, H.N2_ANCHOR, 'N2_ANCHOR (friendly domain disclaimers) [N-1a splice]');
  out = out.replace(H.N2_ANCHOR, H.N1A_BLOCK + H.N2_ANCHOR);

  // N-2: the unmet-qualifier line, immediately ABOVE the friendly-domain suffix block, so the
  // caveat sits with the answer rather than under a generic tip or a did-you-mean footer.
  once(out, H.N2_ANCHOR, 'N2_ANCHOR (friendly domain disclaimers)');
  out = out.replace(H.N2_ANCHOR, H.N2_BLOCK + H.N2_ANCHOR);

  if (out === before) throw new Error('every splice was a no-op — refusing to emit an unchanged body');
  return out;
}

if (require.main === module) {
  const out = build();
  if (process.argv.includes('--print')) process.stdout.write(out);
  else {
    fs.writeFileSync(AFTER, out);
    console.log(`wrote ${AFTER} (${Buffer.byteLength(out)} bytes)`);
  }
}

module.exports = { build };
