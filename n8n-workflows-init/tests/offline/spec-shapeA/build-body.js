// ── build-body — produces the NEW resolve-entity jsonBody, deterministically ─────────────
// spec-search-shapeA-wiring-plan §2: three fields appended to an otherwise untouched body.
//
// WHY A BUILDER AND NOT A HAND-TYPED BODY: LESSONS §71's transport corollary — hand
// transcribing a multi-KB node body through the tool channel drifted ±2 chars five times on
// the promo-picker promote. The body that gets PUT is generated from (a) the frozen BEFORE
// bytes pulled off the clone and (b) `free-terms.js`'s CLASSIFIER_SRC, so the thing tested and
// the thing deployed are the same object.
//
// The splice is APPEND-ONLY and anchored on a string that occurs exactly once. It never
// rewrites an existing field, so the eight fields the spine has always sent cannot be
// collateral damage (LESSONS §D14: a builder can fail silently in the direction of a
// valid-looking document — so probe.js re-renders both bodies and diffs them field by field).
//
//   node build-body.js            # writes resolve-entity.after.jsonBody.txt
//   node build-body.js --print    # stdout only

const fs = require('fs');
const path = require('path');
const { CLASSIFIER_SRC } = require('./free-terms.js');

const DIR = __dirname;
const BEFORE = path.join(DIR, 'resolve-entity.before.jsonBody.txt');
const AFTER = path.join(DIR, 'resolve-entity.after.jsonBody.txt');

// The reformulator accessor, in the SAME escaped spelling the live body already uses. Taken
// from the frozen bytes rather than re-typed: the node name genuinely contains apostrophes
// (`Call 'sub-query-reformulator'`), so the escaping is load-bearing.
const ENTITIES = "$('Call \\'sub-query-reformulator\\'').first().json.output.entities";

const ANCHOR = '  "fallback_to_all_types": true,\n  "limit": 15\n}';

const ADDED = [
  '  "fallback_to_all_types": true,',
  '  "limit": 15,',
  // Unconditional. The CRM gates it itself: `_result_has_zero_matches(result)` in
  // references.py means a request that resolves normally gets a byte-identical response, so
  // the feature is inert for every turn that works today.
  '  "spec_fallback": true,',
  // No `|| []` on the accessor: the classifier's own `Array.isArray(_e) ? _e : []` already
  // covers an absent/null entity list, and a mutant proved the extra guard unobservable —
  // an EQUIVALENT mutant, i.e. dead code. Removed rather than kept with a test that cannot
  // fail (LESSONS §66: a surviving mutant is a claim about the fixtures, and when the claim
  // is "this code does nothing", the fix is to delete the code).
  '  "free_terms": {{ JSON.stringify((' + CLASSIFIER_SRC + ')(' + ENTITIES + ')) }},',
  // v1 is the deterministic tier only. `understand_phrase` costs 2-3 s on the reply path and
  // reads `query`, which n8n fills with the parser's RESTATEMENT ("trying to get..."), not the
  // customer's words — two unknowns at once. v2 (plan §5).
  '  "understand_phrase": false',
  '}',
].join('\n');

function build() {
  const before = fs.readFileSync(BEFORE, 'utf8');
  const n = before.split(ANCHOR).length - 1;
  if (n !== 1) {
    throw new Error(`anchor occurs ${n} times in the before body, expected exactly 1 — the clone body moved; re-freeze resolve-entity.before.jsonBody.txt and re-read the diff before rebuilding`);
  }
  return before.replace(ANCHOR, ADDED);
}

if (require.main === module) {
  const out = build();
  if (process.argv.includes('--print')) {
    process.stdout.write(out);
  } else {
    fs.writeFileSync(AFTER, out);
    console.log(`wrote ${AFTER} (${Buffer.byteLength(out)} bytes)`);
  }
}

module.exports = { build, ANCHOR, ADDED };
