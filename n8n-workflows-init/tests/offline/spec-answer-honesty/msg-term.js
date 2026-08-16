// ── SR N-0 · the message free-term builder — SINGLE SOURCE OF TRUTH ─────────────────────
// spec-answer-honesty-plan §1 (SR-1, N-0). `MSG_TERM_SRC` is the EXACT JS that
// `build-body.js` splices into `resolve-entity-http`'s jsonBody, and it is the same string
// this module evaluates for SR-U1/SR-U2. There is no second copy to drift (LESSONS §69/§72).
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────
// Measured, exec 12303472 vs 12303548 (frozen in ./baselines): "…thickness 1.2mm" and
// "…thickness 1.0mm" return a BYTE-IDENTICAL reply, because `free_terms` was built from the
// parser's ENTITY RAWS and the parser emitted exactly one entity, `double bowl kitchen sink`.
// The words "thickness" and "1.2mm" were never sent, so `spec_unmet` was `[]` — nothing was
// unmet because nothing was asked.
//
// ── WHY THE WHOLE MESSAGE, JOINED, AS ONE TERM ─────────────────────────────────────────
// The CRM binds a number to a spec key by PROXIMITY to that key's own `_self` synonyms:
// `_resolve_quantities` (product_spec_search.py) only claims a quantity when the key word is
// within `_QUANTITY_BINDING_WINDOW` characters of the number. `thickness` IS a registry key.
// So the words have to arrive in their original order and adjacency, which is what a single
// joined term guarantees.
//
// Note for the reviewer, because the plan says something slightly stronger than the code
// does: the CRM already joins all free terms into ONE haystack
// (`resolve_terms_to_specs`: `" ".join(t.lower() for t in free_terms)`), so *separate* terms
// do not by themselves destroy adjacency — ORDER is what matters. The reason case C failed is
// simply that the qualifier words were never sent at all. Joining is still the right shape: it
// makes adjacency independent of how the array is ordered or deduped downstream, and it keeps
// the classifier's dedup (see below) from silently reordering the customer's sentence.
//
// ── WHY PER-WORD, VIA A ONE-ELEMENT ARRAY ──────────────────────────────────────────────
// The shipped classifier ends in `.filter((v, i, a) => a.indexOf(v) === i)` — a DEDUP. Fed a
// word list it would delete a legitimately repeated word ("1.2mm thickness and 1.2mm depth")
// and change the sentence. Calling it with a ONE-ELEMENT array per word makes the dedup a
// no-op while reusing the shipped bytes verbatim, so the code-shape rule has exactly one
// definition in this repo (`../spec-shapeA/free-terms.js`).
//
// ── ADDITIVE, NOT REPLACING ────────────────────────────────────────────────────────────
// The message term is APPENDED to the existing entity-raw terms; it does not replace them.
// Two measured reasons, both about not degrading SA-P1 (plan §4's stated bound):
//   1. `search_specs` derives `implied_classes` PER TERM via `resolve_classes_for_term`,
//      which matches a whole term against a class label/synonym. `double bowl kitchen sink`
//      resolves a class; `please get me double bowl kitchen sink with thickness 1.2mm` does
//      not. Replacing would lose the strongest signal the ranker has.
//   2. Carried entities (`current_message: false`) are NOT in this turn's raw message. A
//      follow-up "how about 1.0mm" would otherwise lose the subject of the sentence.
// Additive makes the free-term set a strict SUPERSET of today's, so the match set cannot
// shrink by construction.
//
// ── KNOWN BOUND, STATED (plan §4) ──────────────────────────────────────────────────────
// The message term is noisier: `_tokens()` in the CRM keeps every word longer than 2 chars,
// so filler ("please", "get", "with") reaches `wanted_terms` and can earn `free_term_boost`
// against a rendered spec sentence. That boost also counts as `evidence`, and `evidence <= 0`
// is what DROPS a product and what sets `floor_missed`. So a filler word that appears in many
// rendered sentences slightly lowers the effective relevance floor. Recorded rather than
// silently accepted (LESSONS §66); no stop-word list is added here because that would be a
// second mechanism guarding the same outcome (LESSONS §67) and the plan does not ask for one.
// UAC SR-6 ("purple levitating sink") is the case that settles whether it matters.
//
// The source is pure ASCII (no literal glyphs) so the shipped expression survives byte-gating,
// exactly as CLASSIFIER_SRC does — see free-terms.js's note on LESSONS §57.

const { CLASSIFIER_SRC, freeTerms } = require('../spec-shapeA/free-terms.js');

// One expression, taking the raw message string, returning ONE joined term (or '' when the
// message contributes nothing). `_c` is the shipped classifier, passed in rather than inlined
// twice, so build-body.js splices CLASSIFIER_SRC exactly once into the shipped body.
const MSG_TERM_SRC =
  "(_c) => (_m) => String(_m == null ? '' : _m).split(/\\s+/)" +
  ".filter(w => _c([{ raw: w }]).length > 0).join(' ')";

// Built from the shipping strings, never re-typed.
const msgTerm = new Function('return (' + MSG_TERM_SRC + ');')()(freeTerms);

// The whole `free_terms` value, as the shipped body computes it: entity-raw terms first
// (unchanged from shape A), then the message term, then dedup. Kept here so probe.js can
// assert the COMPOSED result and not just the message half.
// CLASSIFIER_SRC is inlined ONCE and bound to `_c`, so the shipped body carries exactly one
// copy of the code-shape rule. Note `_c(_e)` returns a fresh array (map+filter+filter), so the
// push below cannot mutate the parser's entity list.
const FREE_TERMS_SRC =
  "((_c) => (_e, _m) => { const _t = _c(_e); " +
  "const _x = (" + MSG_TERM_SRC + ")(_c)(_m); " +
  "if (_x) _t.push(_x); return _t.filter((v, i, a) => a.indexOf(v) === i); })(" + CLASSIFIER_SRC + ")";

const freeTermsFull = new Function('return (' + FREE_TERMS_SRC + ');')();

module.exports = { MSG_TERM_SRC, FREE_TERMS_SRC, msgTerm, freeTermsFull, CLASSIFIER_SRC, freeTerms };
