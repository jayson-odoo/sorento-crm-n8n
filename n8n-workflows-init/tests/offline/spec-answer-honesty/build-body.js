// ── build-body — produces the NEW resolve-entity-http jsonBody, deterministically ────────
// spec-raw-text-migration §1.1 (supersedes spec-answer-honesty §1 / N-0).
//
// ONE leaf, TWO anchored edits that are ONE change:
//   1. `query`  : the parser's `user_goal` RESTATEMENT  ->  the customer's RAW TEXT
//   2. `free_terms` : DELETED entirely
//
// ⚠️ THE TWO ARE ATOMIC AND MUST NEVER BE SPLIT (conformance report DEV-3, verified in CRM
// source): `product_spec_understanding.py:413-415` merges derived free terms as a UNION on top
// of the caller's, and `understand_phrase` always appends the WHOLE phrase as a free term. A
// transitional body sending BOTH raw `query` AND the old N-0 `free_terms` would rank against
// `caller_terms + [raw sentence]` — a scoring input the live caller has never produced, i.e. a
// measurement of a configuration nobody will ever ship. Hence one builder, two splices, one
// artifact.
//
// WHY THE SWAP AT ALL: `ResolveReferenceRequest.query` is now fed to BOTH machines —
// `_resolve_input` (the normal code/trgm probes) AND `derive_search_inputs` (the spec deriver)
// — `references.py:1967-1977, 2051`. There is no separate raw-text field (the recorded OPEN
// QUESTION, answered NO). So the customer's own words are the only input that reaches the spec
// deriver, and `user_goal` — an LLM restatement — is the wrong string to search on.
//
// WHY A BUILDER: LESSONS §71's transport corollary — hand-transcribing a multi-KB node body
// through the tool channel drifted ±2 chars five times on the promo-picker promote. The body
// that gets PUT is generated from (a) the frozen BEFORE bytes pulled off the clone and
// (b) raw-message.js's RAW_MESSAGE_SRC, so the thing tested and the thing deployed are one
// object.
//
//   node build-body.js            # writes resolve-entity-http.after.jsonBody.txt
//   node build-body.js --print    # stdout only

const fs = require('fs');
const path = require('path');
const { RAW_MESSAGE_SRC } = require('./raw-message.js');

const DIR = __dirname;
const BEFORE = path.join(DIR, 'resolve-entity-http.before.jsonBody.txt');
const AFTER = path.join(DIR, 'resolve-entity-http.after.jsonBody.txt');

// ── NO FALLBACK TO THE RESTATEMENT — the STRICT reading (main session, 2026-08-15) ──────
// The build first shipped ` || user_goal || '' `, reasoning that `RAW_MESSAGE_SRC` can return ''
// (attachment-only turn with no caption, failed transcript) where `user_goal` never is, so the
// fallback preserved today's exact input on exactly those turns. The main session took the
// STRICT reading instead, and the reason is better than the one the fallback was built on:
//
//   The contract is that the restatement DIES ENTIRELY. On the only turns where the fallback
//   could ever fire, `user_goal` is precisely LLM-INVENTED TEXT — and `query` now feeds the
//   CRM's code-token extractor, `_synthesize_alpha_tokens` and the spec deriver. Handing those
//   machines a model's paraphrase of a turn that carried no words is worse than handing them
//   nothing: '' derives nothing, which IS the correct answer for a wordless turn, whereas a
//   restatement derives confident tokens the customer never typed.
//
// So `user_goal` no longer appears anywhere in this body, and the mutant is INVERTED: m10 now
// re-introduces the fallback and must go RED (U7-6/U7-8), rather than removing it.
const USER_GOAL = "$('Call \\'sub-query-reformulator\\'').first().json.output.user_goal";  // kept for the mutant + the absence assertion

const QUERY_EXPR = 'JSON.stringify(' + RAW_MESSAGE_SRC + " || '')";

const QUERY_BEFORE_RE = /^ {2}"query": "\{\{ .*\}\}",$/m;
const QUERY_AFTER = '  "query": {{ ' + QUERY_EXPR + ' }},';

// The whole `free_terms` line, including its newline — the field is DELETED, not blanked.
const FREE_TERMS_RE = /^ {2}"free_terms": \{\{.*\}\},\n/m;

function countRe(s, re) {
  return (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
}

function build() {
  const before = fs.readFileSync(BEFORE, 'utf8');

  const nq = countRe(before, QUERY_BEFORE_RE);
  if (nq !== 1) {
    throw new Error(`"query" line occurs ${nq} times in the before body, expected exactly 1 — ` +
      'the clone body moved; re-freeze resolve-entity-http.before.jsonBody.txt and re-read the ' +
      'diff before rebuilding');
  }
  const nf = countRe(before, FREE_TERMS_RE);
  if (nf !== 1) {
    throw new Error(`"free_terms" line occurs ${nf} times in the before body, expected exactly 1 ` +
      '— the clone body moved; re-freeze the frozen bytes before rebuilding');
  }

  let out = before.replace(QUERY_BEFORE_RE, QUERY_AFTER);
  if (out === before) throw new Error('the query splice was a no-op — refusing to emit');
  const mid = out;
  out = out.replace(FREE_TERMS_RE, '');
  if (out === mid) throw new Error('the free_terms deletion was a no-op — refusing to emit');

  if (/"free_terms"/.test(out)) throw new Error('free_terms survived the deletion — refusing to emit');
  // STRICT reading: the restatement dies entirely. `user_goal` must not appear ANYWHERE in the
  // emitted body — not as the source, not as a fallback. Asserted in the builder as well as in
  // the probe (U7-11), because this is the one property a later "helpful" edit would erode.
  if (out.includes('user_goal')) {
    throw new Error('user_goal survived somewhere in the body — the strict reading forbids the ' +
      'restatement reaching the CRM at all; refusing to emit');
  }
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

module.exports = { build, QUERY_BEFORE_RE, QUERY_AFTER, FREE_TERMS_RE, QUERY_EXPR, RAW_MESSAGE_SRC, USER_GOAL };
