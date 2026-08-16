// ── build-bso — produces the NEW build-suggest-offer body, deterministically ────────────
// spec-raw-text-migration rev 4, reviewer F1 (the SECOND emitter).
//
// WHY A THIRD NODE. Rev 3 fixed `compile-current-state` and the customer-visible reply did not
// change, because the cited defect (exec 12597815) is rendered HERE — `build-suggest-offer` is
// the not-found lane, and `compile-current-state` only passes its `suggest_response` through
// (the suggest override sets `manualResponse = true`). Enumerating renderers by RENDERED STRING
// finds exactly two emitters of `"${token}" — did you mean:`; this is the other one.
//
// ONE predicate + ONE filter clause, both from `derived-token.js`, so the two emitters cannot
// drift apart.
//
//   node build-bso.js            # writes build-suggest-offer.after.js
//   node build-bso.js --print    # stdout only

const fs = require('fs');
const path = require('path');
const { derivedTokenSrc, DERIVED_TOKEN_CLAUSE } = require('./derived-token.js');

const DIR = __dirname;
const BEFORE = path.join(DIR, 'build-suggest-offer.before.js');
const AFTER = path.join(DIR, 'build-suggest-offer.after.js');

// The predicate goes immediately above the miss filter it guards.
const ANCHOR = 'let missResolutions = [];\n';

// The filter's last clause, at this node's own indentation, closing the `.filter(` call.
const CLAUSE_BEFORE =
  "    && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase()));\n";
const CLAUSE_AFTER =
  "    && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())\n" +
  '    ' + DERIVED_TOKEN_CLAUSE + ');\n';

const HEADER = `// ── F1 · the CRM's own QUERY-KEYED resolution is NOT a customer token ──────────────────
// Since spec-raw-text-migration \`query\` IS the customer's whole sentence, the resolution the
// CRM appends for it comes back with \`token\` == that sentence (MEASURED, exec 12597847). THIS
// node is the one that rendered it back at the customer (MEASURED, exec 12597815):
//     "wall hung basin got SIRIM cert?" — did you mean:
// i.e. their own question, quoted as something we could not find, heading a second overlapping
// candidate list. It is not a customer entity: n8n never sent it as a token.
//
// Identical rule and identical bytes to compile-current-state's — both are spliced from
// tests/offline/spec-answer-honesty/derived-token.js, because two hand-maintained copies of
// this rule is the next LESSONS §63 waiting to happen. Fail-open bounds are documented there.
`;

// ── TRANSPORT DETERMINISM: canonicalise long trailing banner runs ──────────────────────
// LESSONS §71's transport corollary, measured AGAIN here: hand-transcribing a multi-KB body
// through the MCP tool channel drifts by ±1-2 characters on long runs of `─`. It cost three
// aborted writes on this node alone (the byte gate caught every one — that is the gate working,
// but retrying an unbounded transcription is not a strategy). REST PUT, the documented
// deterministic alternative, is forbidden for this slice.
//
// So the builder removes the ambiguity instead of hoping: every line ending in a run of MORE
// than 8 box-drawing dashes has that trailing run truncated to exactly 8. A short run is
// countable by eye and reproduces first time.
//
// SAFETY, asserted not assumed: this touches COMMENT LINES ONLY (verified: 8 lines, 0 of them
// code), changes no semantics, and is confined to the CLONE. The promote body is built as
// LIVE + hunks by node name, so live's own banners are never rewritten by this.
const BANNER_RE = /─{9,}(\s*)$/gm;
function canonicaliseBanners(src) {
  const out = src.replace(BANNER_RE, '────────$1');
  const changed = src.split('\n').filter((l, i) => l !== out.split('\n')[i]);
  const code = changed.filter((l) => !l.trim().startsWith('//'));
  if (code.length) {
    throw new Error(`banner canonicalisation touched ${code.length} NON-COMMENT line(s) — ` +
      'refusing to emit: ' + JSON.stringify(code.slice(0, 3)));
  }
  return out;
}

function once(hay, needle, label) {
  const n = hay.split(needle).length - 1;
  if (n !== 1) {
    throw new Error(`anchor "${label}" occurs ${n} times, expected exactly 1 — the node body ` +
      'moved. Re-freeze build-suggest-offer.before.js from the export and re-read the diff ' +
      'before rebuilding.');
  }
}

function build() {
  const before = fs.readFileSync(BEFORE, 'utf8');
  let out = before;

  once(out, ANCHOR, 'ANCHOR (let missResolutions)');
  out = out.replace(ANCHOR, HEADER + derivedTokenSrc('q', '') + ANCHOR);

  once(out, CLAUSE_BEFORE, 'CLAUSE_BEFORE (gate-resolved clause, closing the filter)');
  out = out.replace(CLAUSE_BEFORE, CLAUSE_AFTER);

  if (out === before) throw new Error('every splice was a no-op — refusing to emit an unchanged body');
  if (!out.includes('_isDerivedQueryToken(res.token)')) {
    throw new Error('the filter clause did not land — refusing to emit');
  }
  // The wording in this block is IDENTICAL on live and on the clone (`— did you mean:`), unlike
  // compile-current-state's miss lines. Assert it survived, so a future edit cannot quietly
  // rewrite a customer-facing string while adding a guard.
  if (!out.includes('blocks.push(`"${token}" — did you mean:\\n`')) {
    throw new Error('the did-you-mean wording changed — refusing to emit');
  }
  out = canonicaliseBanners(out);
  // Post-condition: the hunk and the wording survived the canonicalisation.
  if (!out.includes('_isDerivedQueryToken(res.token)')) {
    throw new Error('the filter clause did not survive canonicalisation — refusing to emit');
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

module.exports = { build, ANCHOR, CLAUSE_BEFORE, CLAUSE_AFTER };
