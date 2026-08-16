// ── DERIVED_TOKEN_SRC — "is this resolution token OURS, or the CRM's own?" ──────────────
// spec-raw-text-migration rev 4, reviewer F1. ONE definition, TWO emitters.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────
// Since this slice put the customer's RAW SENTENCE in `query`, the CRM appends a resolution
// whose `token` IS that sentence (MEASURED, exec 12597847:
// `resolutions[2].token === "SRTWC286 and wall hung basin"`). Any renderer that groups misses
// BY TOKEN then prints the customer's own question back at them as a failed search term
// (MEASURED at the customer boundary, exec 12597815):
//
//     "wall hung basin got SIRIM cert?" — did you mean:
//       4. BRBC22137W-1 (WALL HUNG) - no SIRIM cert
//
// ── WHY IT IS A SHARED STRING AND NOT TWO COPIES ───────────────────────────────────────
// Enumerating renderers by RENDERED STRING rather than by graph inbound (LESSONS §63) finds
// EXACTLY TWO emitters of `"${token}" — did you mean:` in the spine:
//   * `compile-current-state` — the ANSWERED partial-miss path;
//   * `build-suggest-offer`   — the NOT-FOUND lane, and the one that produced exec 12597815.
// Rev 3 fixed only the first and the customer-visible reply did not change. That is the
// wrong-object failure in its purest form, so rev 4 fixes both — from one source, because two
// hand-maintained copies of a rule this load-bearing is the next §63 waiting to happen.
//
// ── THE RULE ───────────────────────────────────────────────────────────────────────────
// Keyed on WHAT WE SENT. `resolve-entity-http` builds its `tokens` array from exactly
// `<parser>.entities[].raw`, so "is this token ours?" is decidable inside the renderer without
// trusting anything the CRM echoes back — and every CRM-derived probe token falls outside the
// set by construction: the appended query resolution, and any `_synthesize_alpha_tokens`
// whitespace-split of the sentence (which DEV-3 warns multiplies on exactly this migration).
//
// FAIL-OPEN, deliberately (UAC SR-U5: a genuine miss must never be silenced):
//   * sent tokens present  -> suppress any token NOT in the set;
//   * no sent tokens       -> narrow to the raw turn text itself;
//   * neither available    -> suppress nothing.
//
// The two call sites differ only in what they call the parser output (`qf` in
// compile-current-state, `q` in build-suggest-offer), which is why this is a function of that
// name rather than a constant.

const { RAW_MESSAGE_SRC } = require('./raw-message.js');

/**
 * @param {string} parserVar  the in-scope identifier holding the parser output
 *                            (`qf` in compile-current-state, `q` in build-suggest-offer)
 * @param {string} indent     leading whitespace for the emitted block
 */
function derivedTokenSrc(parserVar, indent = '  ') {
  const i = indent;
  return [
    `${i}const _sentTokens = (() => {`,
    `${i}  const s = new Set();`,
    `${i}  for (const e of (Array.isArray(${parserVar}.entities) ? ${parserVar}.entities : [])) {`,
    `${i}    const k = String((e && e.raw) ?? '').trim().toLowerCase();`,
    `${i}    if (k) s.add(k);`,
    `${i}  }`,
    `${i}  return s;`,
    `${i}})();`,
    `${i}const _rawTurn = String(${RAW_MESSAGE_SRC} ?? '').trim().toLowerCase();`,
    `${i}const _isDerivedQueryToken = (tok) => {`,
    `${i}  const k = String(tok ?? '').trim().toLowerCase();`,
    `${i}  if (!k) return false;`,
    `${i}  if (_sentTokens.size) return !_sentTokens.has(k);`,
    `${i}  return !!_rawTurn && k === _rawTurn;`,
    `${i}};`,
    '',
  ].join('\n');
}

// The one filter clause both emitters add, so neither can drift from the other.
const DERIVED_TOKEN_CLAUSE = '&& !_isDerivedQueryToken(res.token)';

module.exports = { derivedTokenSrc, DERIVED_TOKEN_CLAUSE, RAW_MESSAGE_SRC };
