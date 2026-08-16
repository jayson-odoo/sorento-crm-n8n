// ── SA free-terms classifier — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// spec-search-shapeA-wiring-plan §2. `CLASSIFIER_SRC` is the EXACT JS that build-body.js
// splices into `resolve-entity`'s jsonBody, and it is the same string this module evaluates
// for SA-P5. There is no second copy to drift: an assertion here is an assertion about the
// bytes that ship (LESSONS §69 stale-baseline, §72 offline suites are caches that decay).
//
// ── WHAT COUNTS AS A CODE ──────────────────────────────────────────────────────────────
// A code is: contains a digit AND the WHOLE token is two-or-more leading letters followed
// only by letters, digits and code separators (. _ / and any dash).
//   SRTWC286, CBS212-WH, SRTKS6047-NEW, MBF97582, TT440, SPO-2024-001  -> code, dropped
// The leading-LETTERS requirement is the load-bearing half, not "contains a digit", because
// the digit-bearing tokens that matter most to spec search are DIMENSIONS and those lead with
// the number:  600mm, 1m, 1200, 300x600, "2 hole"  -> kept. A dropped dimension is a lost
// spec boost; that is the expensive direction. Keeping a stray code costs at most one weak
// text hit inside `search_specs`, and only on a turn where the code already failed to
// resolve — the CRM runs the fallback ONLY when the normal probes returned zero matches.
//
// DASH-AGNOSTIC BY CONSTRUCTION. SA-P5 requires `SRT332−GM` (U+2212, the Excel/Sheets paste
// form) to be excluded too. The parser folds unicode dashes to ASCII in the LAST node of
// `sub-semantic-parser` (`suggest-follow-up.js`, `_DASHES`), so by the time this runs the fold
// has normally happened — but this classifier must not DEPEND on that ordering, so the
// separator class carries the same dash set. Written as \u escapes, not literal glyphs, so
// the shipped expression is pure ASCII and survives byte-gating (LESSONS §57: multibyte
// characters in a node body turn a byte comparison into a char-count argument).
//
// KNOWN BOUND, pinned by P5-11: a hyphenated DESCRIPTION carrying a digit ("wall-hung-600")
// is read as a code and dropped. Space-separated phrases — which is how the parser actually
// emits descriptive raws — are unaffected, and on such a turn the other raws still carry the
// description. Recorded rather than silently accepted, per LESSONS §66: label the bound.
//
// Bias, stated once: this filter is allowed to be wrong in the "kept a code" direction and is
// not allowed to be wrong in the "dropped a description" direction.

const CLASSIFIER_SRC =
  "(_e) => (Array.isArray(_e) ? _e : []).map(x => String((x && x.raw) || '').trim())" +
  ".filter(v => v.length > 0 && !(/[0-9]/.test(v) && " +
  "/^[A-Za-z][A-Za-z][A-Za-z0-9._\\/\\-\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D]*$/.test(v)))" +
  ".filter((v, i, a) => a.indexOf(v) === i)";

// ── CLASSIFIER_TRANSPORT — the SAME rule, in the byte form the MCP write path delivers ───
// (added 2026-08-15, spec-raw-text-migration; measured, three times, on clone txiPzSxy3Pclsz6v)
//
// `update_workflow`'s payload is JSON, and a `\uXXXX` sequence inside it is DECODED by the
// JSON parser before n8n ever sees it. So a node body containing `‐` as SOURCE arrives at
// the workflow carrying the literal character. Every attempt to write the escaped form landed
// the decoded one; the byte gate caught it every time, which is the gate working — but the
// conclusion is that the escaped form is NOT WRITABLE through this transport, not that the
// write kept failing.
//
// Rather than keep two spellings that a future reader could pick the wrong one of, the
// transport form is DERIVED here, mechanically, from the one source of truth. Both compile to
// the identical RegExp (a character class of the same code points), and probe.js asserts that
// as behaviour over the U+2212 paste form, not as an assumption.
//
// Which one to use where:
//   * `CLASSIFIER_SRC`       — the ASCII form. Still what LIVE's `resolve-entity` jsonBody
//                              carries (written before this transport was characterised) and
//                              what the shape-A suite pins.
//   * `CLASSIFIER_TRANSPORT` — what any body written through MCP will hold, and therefore what
//                              `build-ccs.js` splices and what the deployment gate compares.
const CLASSIFIER_TRANSPORT = CLASSIFIER_SRC.replace(
  /\\u([0-9A-Fa-f]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

// Built from the shipping strings, never re-typed.
const freeTerms = new Function('return (' + CLASSIFIER_SRC + ');')();
const freeTermsTransport = new Function('return (' + CLASSIFIER_TRANSPORT + ');')();

module.exports = { CLASSIFIER_SRC, CLASSIFIER_TRANSPORT, freeTerms, freeTermsTransport };
