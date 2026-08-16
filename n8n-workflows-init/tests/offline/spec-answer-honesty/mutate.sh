#!/usr/bin/env bash
# ── SR mutation gate — UAC §0 S9 + LESSONS §72 ─────────────────────────────────────────────
#
#   bash mutate.sh
#
# Every mutation must (S9, binding, all three, in order):
#   1. assert the search string occurs exactly N>0 times BEFORE substituting,
#   2. assert the file DIGEST CHANGED after,
#   3. abort loudly on either failure and NOT run the suite.
# A suite result obtained without both assertions is VOID, not weak.
#
# Plus the two §72 guards:
#   * zero-byte-mutation hard fail (`cmp -s`) — a stale anchor can never be scored a detection;
#   * the probe must reach its own summary line, so a CRASH is not counted as a detection.
#
# The mutants run against a SCRATCH COPY of the built artifacts; nothing in the repo, and
# nothing in export/, is edited in place. probe.js reads them via OFFLINE_NODES_DIR.
#
# SR.md names five mutants (m1..m5). Two of them (m1 join, m2 code filter) live in the
# EXPRESSION source rather than a Code body, so they are applied to the built jsonBody and are
# scored through probe.js's U1/U2 assertions — recorded here rather than left implicit.

set -uo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

CCS_AFTER="compile-current-state.after.js"
BODY_AFTER="resolve-entity-http.after.jsonBody.txt"
BSO_AFTER="build-suggest-offer.after.js"   # rev 4: the second F1 emitter

# Rebuild deterministically so a mutant is never scored against a stale artifact (§72 "resync
# before trusting" — offline suites are caches and they decay).
node build-body.js >/dev/null || { echo "FATAL: build-body.js failed"; exit 2; }
node build-ccs.js  >/dev/null || { echo "FATAL: build-ccs.js failed";  exit 2; }
node build-bso.js  >/dev/null || { echo "FATAL: build-bso.js failed";  exit 2; }

echo "── baseline: the unmutated suite must be GREEN before any mutant means anything ──"
if ! node probe.js >"$SCRATCH/base.log" 2>&1; then
  echo "FATAL: the unmutated suite is RED. Fix that first — mutation scores are meaningless."
  tail -30 "$SCRATCH/base.log"; exit 2
fi
grep -E '^[0-9]+ passed' "$SCRATCH/base.log" || { echo "FATAL: probe.js produced no summary"; exit 2; }
echo

CAUGHT=0; MISSED=0; VOID=0

# $1 id  $2 description  $3 target file  $4 search  $5 replace  $6 expected count
mutant() {
  local id="$1" desc="$2" file="$3" needle="$4" repl="$5" want="$6"
  rm -rf "$SCRATCH/m"; mkdir -p "$SCRATCH/m"
  cp "$DIR/$CCS_AFTER" "$DIR/$BODY_AFTER" "$DIR/$BSO_AFTER" "$SCRATCH/m/"

  local target="$SCRATCH/m/$file"
  # S9.1 — the search string must occur exactly `want` times, and want>0.
  # Counted with python, NOT `grep -Fo`: grep is line-based, so a MULTI-LINE anchor counts as
  # zero and the step is voided for the wrong reason. Found by this gate's own m8.
  local n
  n=$(NEEDLE="$needle" python3 -c 'import os,sys; print(open(sys.argv[1],encoding="utf-8").read().count(os.environ["NEEDLE"]))' "$target")
  if [ "$want" -le 0 ] || [ "$n" != "$want" ]; then
    echo "VOID $id — anchor occurs $n times in $file, expected exactly $want. NOT running the suite."
    echo "     (S9: a suite result obtained without a proven substitution is void, not weak.)"
    VOID=$((VOID+1)); return
  fi
  local before_sha; before_sha=$(shasum -a 256 "$target" | cut -d' ' -f1)

  python3 - "$target" "$needle" "$repl" <<'PY'
import sys
p, needle, repl = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(s.replace(needle, repl))
PY

  # S9.2 — the digest must have changed.  §72 — identical bytes is a hard fail, never a catch.
  local after_sha; after_sha=$(shasum -a 256 "$target" | cut -d' ' -f1)
  if [ "$before_sha" = "$after_sha" ]; then
    echo "VOID $id — ZERO-BYTE MUTATION ($file unchanged). NOT running the suite."
    VOID=$((VOID+1)); return
  fi

  # The suite must go RED *and* reach its own summary. A crash is not a detection (§72).
  local log="$SCRATCH/$id.log"
  OFFLINE_NODES_DIR="$SCRATCH/m" node probe.js >"$log" 2>&1
  local rc=$?
  if ! grep -qE '^[0-9]+ passed, [0-9]+ failed' "$log"; then
    echo "VOID $id — the probe never reached its summary line (it crashed). A crash is not a detection."
    tail -5 "$log"
    VOID=$((VOID+1)); return
  fi
  if [ $rc -ne 0 ]; then
    echo "CAUGHT $id — $desc"
    grep -m3 '^FAIL' "$log" | sed 's/^/         /'
    CAUGHT=$((CAUGHT+1))
  else
    echo "SURVIVED $id — $desc"
    echo "         >>> a surviving mutant is a claim about the FIXTURES first and the code second."
    MISSED=$((MISSED+1))
  fi
}

# ── spec-raw-text-migration · m1/m2/m10 REPOINTED ──────────────────────────────────────
# SR.md's m1 (drop the join) and m2 (remove the per-word code filter) mutated the N-0
# `free_terms` EXPRESSION, which this slice DELETES. Left as they were they would have gone
# VOID on a stale anchor — the §72 failure the zero-byte guard exists to catch — so they are
# repointed at what replaced them: the `query` field and the absence of `free_terms`.
echo "── m1 (repointed) · the migration is HALF DONE: free_terms comes back beside raw query ──"
# This is the one configuration the CRM has never been measured under (DEV-3: derived free
# terms are UNIONed on top of the caller's, and understand_phrase appends the whole phrase).
mutant m1 "free_terms is re-added alongside the raw query -> the atomicity claim is void" \
  "$BODY_AFTER" '  "understand_phrase": false' '  "free_terms": [], "understand_phrase": false' 1

echo "── m2 (repointed) · the raw text is sent WITHOUT JSON escaping ──"
# The pre-migration `query` was a bare `"{{ ... }}"` interpolation. Safe while the value is LLM
# prose, fatal for a customer sentence carrying a quote, a backslash or a newline — the rendered
# body stops being JSON and the node fails on the critical path of every product turn.
mutant m2 "query is not JSON-escaped -> a quoted/newline customer message breaks the body" \
  "$BODY_AFTER" '  "query": {{ JSON.stringify(' '  "query": {{ String(' 1

echo "── m3 (SR.md) · key N-3 on TOKEN EQUALITY instead of the OUTCOME ──"
mutant m3 "N-3 suppresses only a token literally equal to the query token" \
  "$CCS_AFTER" \
  "const _tokenReachedSpecSearch = (tok) => _specSearchAnswered && _notCodeShaped([{ raw: tok }]).length > 0;" \
  "const _tokenReachedSpecSearch = (tok) => false;" 1

echo "── m4 (SR.md) · make the N-2 suffix ALWAYS-ON ──"
# Targets `_named.length === 0`, NOT `_unmet.length === 0`. The latter is a redundant early
# return: removed, the loop still yields an empty `_named` and the block returns anyway — an
# EQUIVALENT mutant, and scoring one either way is a lie about the assertion set (LESSONS §66).
mutant m4 "N-2 renders even when nothing was unmet" \
  "$CCS_AFTER" "  if (_named.length === 0) return;" "  if (false) return;" 1

echo "── m5 (SR.md) · N-3 suppresses ALL misses (the blanket mute) ──"
mutant m5 "N-3 degenerates into a blanket mute of the miss block (DEV-2: the code miss dies)" \
  "$CCS_AFTER" \
  "const _tokenReachedSpecSearch = (tok) => _specSearchAnswered && _notCodeShaped([{ raw: tok }]).length > 0;" \
  "const _tokenReachedSpecSearch = (tok) => true;" 1

echo "── m6 · N-3 stops requiring the spec row to be IN THE ANSWER ──"
mutant m6 "the answer-set join is dropped; any spec row anywhere suppresses" \
  "$CCS_AFTER" \
  "return _rows.some(m => String(m?.match_tier ?? '').toLowerCase() === 'spec_search'" \
  "return _rows.some(m => true || String(m?.match_tier ?? '').toLowerCase() === 'spec_search'" 1

echo "── m7 · N-2 reverts to the blame-the-search wording (decision §5.1) ──"
mutant m7 "wording becomes 'I couldn't filter by ...'" \
  "$CCS_AFTER" "recorded for these products" "filterable, so I couldn't filter by these products" 1

echo "── m8 · N-2 loses the answered-turn guard ──"
mutant m8 "the line can render on an unanswered/escalate turn" \
  "$CCS_AFTER" "    && last_result_set.length > 0;
  if (!answered) return;
  const _re" "    && last_result_set.length >= 0;
  if (!answered) return;
  const _re" 1

# NOTE: no backticks in these echo strings — inside a double-quoted bash string a backtick
# pair is COMMAND SUBSTITUTION. This line used to read `query` and the shell dutifully ran
# `query`, printing "command not found" into an otherwise-successful run (LESSONS D14: a
# non-zero-noise run that still reports success is worth one grep).
echo "── m9 (repointed) · the query field sources the LLM restatement, not the customer's words ──"
mutant m9 "query built from user_goal, not tf-message -> U7-2, the only discriminator" \
  "$BODY_AFTER" "const _j = \$('tf-message').first().json;" \
  "const _j = { message: { message: { text: \$('Call \\'sub-query-reformulator\\'').first().json.output.user_goal } } };" 1

echo "── m10 (INVERTED, main-session decision) · the LLM restatement comes back as a fallback ──"
# The strict reading: `user_goal` must not reach the CRM at all. On the only turns where a
# fallback could fire (attachment-only, failed transcript) the restatement is LLM-INVENTED text,
# and `query` feeds the code-token extractor + `_synthesize_alpha_tokens` + the spec deriver.
# '' derives nothing, which is correct for a wordless turn. This mutant restores the fallback.
mutant m10 "user_goal is re-introduced as a fallback -> an empty turn sends invented tokens" \
  "$BODY_AFTER" "})() || '') }}," "})() || \$('Call \\'sub-query-reformulator\\'').first().json.output.user_goal || '') }}," 1

echo "── m11 · N-2 echoes the NORMALISED wire value instead of the customer's span ──"
# This IS the defect the tester measured at the boundary (run spec-answer-honesty-SR-2-20260813):
# `value: 1.0` stringifies to "1", so the customer who typed 1.0mm was told "narrow by 1."
mutant m11 "the wire value is printed bare -> 1.0mm renders as '1'" \
  "$CCS_AFTER" \
  "    if (/^\d+(?:\.\d+)?\$/.test(_v)) return _pickSpan(_numCands(Number(_v)), _k);" \
  "    if (/^\d+(?:\.\d+)?\$/.test(_v)) return _v;" 1

echo "── m12 · N-2 stops preferring the UNIT-CARRYING span (no-anchor branch) ──"
mutant m12 "with no key word in the sentence, '1' and '1.0mm' become indistinguishable" \
  "$CCS_AFTER" \
  "      if (_withUnit.length) _pool = _withUnit;" \
  "      if (false) _pool = _withUnit;" 1

echo "── m13 · N-2 quotes a PARTIAL value list (one span found, one not) ──"
mutant m13 "all-or-nothing becomes some-or-nothing -> a number the customer never wrote" \
  "$CCS_AFTER" \
  "const _quotable = _spans.every(s => typeof s === 'string' && s.length > 0);" \
  "const _quotable = _spans.some(s => typeof s === 'string' && s.length > 0);" 1

echo "── m14 · N-2 loses the boolean guard ──"
mutant m14 "a boolean is echoed when the WORD happens to be in the message" \
  "$CCS_AFTER" \
  "    if (!_v || !_rawMsg || _v === 'true' || _v === 'false') return null;" \
  "    if (!_v || !_rawMsg) return null;" 1

echo "── m15 · N-2 loses the preceding-character guard (a fragment of a longer number) ──"
# REV 3: this mutant SURVIVED once, and that was a fixture problem, not robustness. Rev 3's
# `_crossesCode` independently rejects "SRT332-GM" and "srtwc1.2ab", so U4-25/U4-28 stopped
# discriminating this guard (LESSONS §64 - two mechanisms suppressing one symptom). U4-35 is
# the shape only this guard can see: "1.2.3" carries no letters at all.
mutant m15 "'1.2.3' donates its trailing 3 to the sentence (U4-35)" \
  "$CCS_AFTER" \
  "      if (_prev && /[0-9A-Za-z.]/.test(_prev)) continue;" \
  "      if (false) continue;" 1

echo "── m16 · N-2 FABRICATES the unit when the customer's span cannot be found ──"
mutant m16 "'mm' is invented -> the reply states data the wire never carried" \
  "$CCS_AFTER" \
  "    if (/^\d+(?:\.\d+)?\$/.test(_v)) return _pickSpan(_numCands(Number(_v)), _k);" \
  "    if (/^\d+(?:\.\d+)?\$/.test(_v)) return _pickSpan(_numCands(Number(_v)), _k) || (_v + 'mm');" 1

echo "── m17 (rev 3, codex-1) · N-2 loses the CODE-SEPARATOR guard ──"
mutant m17 "'ABC-1.2MM' donates 1.2MM to the sentence as if the customer had typed a spec" \
  "$CCS_AFTER" \
  "      if (_crossesCode(_s, _end)) continue;" \
  "      if (false) continue;" 1

echo "── m18 (rev 3, codex-2) · N-2 reverts to rev-2 SELECTION: first match, unit-preferring ──"
# Not "delete a line" but "restore the previous algorithm", so the mutant reproduces the
# measured defect text ("narrow by 2m") rather than merely degrading to the fallback.
mutant m18 "proximity is ignored -> '2m hose thickness 2mm' quotes the 2m hose" \
  "$CCS_AFTER" \
  "    const _anchors = _keyAnchors(_k);" \
  "    const _anchors = []; return (_pool.filter(_c => _c.unit)[0] || _pool[0]).text;" 1

echo "── m19 (rev 3) · N-2 loses the AMBIGUITY guard (a tie picks one and calls it evidence) ──"
mutant m19 "two equally-near, disagreeing spans -> the first is quoted as the customer's" \
  "$CCS_AFTER" \
  "    return _texts.length === 1 ? _texts[0] : null;" \
  "    return _texts[0] || null;" 1


# ── SR-1b · N-1a, the "Matched on" line ─────────────────────────────────────────────────
# NUMBERING NOTE, so a tester reading SR.md is not left guessing: SR.md's SR-1b table names
# these (m19) (m20) (m21), but m19 was already taken by rev 3's ambiguity-guard mutant. They
# ship here as m20/m21/m22 in the same order — free_terms, the zero-key guard, the dedup.
echo "── m20 (repointed) · N-1a drops the spec_asked FILTER entirely ──"
# One mutant, three defects: `free_terms` is announced as a spec (SR.md's m19), an unstated
# HOUSE-PREFERENCE brand is announced as something the customer's words matched (the SR-1b
# finding this slice retires), and any key that merely scored joins the sentence.
mutant m20 "matched_specs is rendered unfiltered -> free_terms and an unstated brand are announced" \
  "$CCS_AFTER" \
  "  const _selected = _keys.filter(k => { const n = k.toLowerCase(); return n === 'class' || _asked.has(n); });" \
  "  const _selected = _keys.slice();" 1

echo "── m21 (SR-1b, SR.md's m20) · N-1a loses the zero-key guard (the no-op guarantee) ──"
# The ONLY gate, on purpose — see the hunk comment. With it gone, every answered turn with no
# spec key renders "Matched on your description.", i.e. a code turn claims a description match.
mutant m21 "the line renders on turns with no spec key at all -> the no-op guarantee is gone" \
  "$CCS_AFTER" \
  "  if (!_keys.length) return;" \
  "  if (false) return;" 1

echo "── m22 (SR-1b, SR.md's m21) · N-1a stops deduping across rows ──"
mutant m22 "five spec rows repeat the same key five times in the sentence" \
  "$CCS_AFTER" \
  "      if (_keys.indexOf(_key) < 0) _keys.push(_key);" \
  "      _keys.push(_key);" 1

# ── spec-raw-text-migration · the new N-1a rules ────────────────────────────────────────
echo "── m23 · N-1a reverts to KEY NAMES (the rev-4 renderer) ──"
mutant m23 "values are dropped -> the line says 'bowl count' with no value, as rev 4 did" \
  "$CCS_AFTER" \
  "    _parts.push(_k.toLowerCase() === 'class' ? _v : \`\${_prettyKey(_k)}: \${_v}\`);" \
  "    _parts.push(_prettyKey(_k));" 1

echo "── m24 (DEV-1) · brand and class lose the VERBATIM exemption ──"
# The blocking renderer condition in the conformance report: blind humanising rewrites the
# catalogue's own spelling in customer-facing text ("SORENTO" -> "Sorento", "NO LOGO" -> "No Logo").
mutant m24 "class/brand are titlecased like any enum -> catalogue spelling is rewritten" \
  "$CCS_AFTER" "  const _VERBATIM_KEYS = ['class', 'brand'];" "  const _VERBATIM_KEYS = [];" 1

echo "── m25 · N-1a renders the class KEY NAME instead of its VALUE ──"
mutant m25 "'class: Kitchen Sink' instead of 'Kitchen Sink' -> S4 deviation 1 unpinned" \
  "$CCS_AFTER" \
  "    _parts.push(_k.toLowerCase() === 'class' ? _v : \`\${_prettyKey(_k)}: \${_v}\`);" \
  "    _parts.push(\`\${_prettyKey(_k)}: \${_v}\`);" 1

echo "── m26 · the class stops LEADING the sentence ──"
mutant m26 "class falls back into sorted() position, buried between qualifiers" \
  "$CCS_AFTER" \
  "  const _ordered = _selected.filter(k => k.toLowerCase() === 'class')" \
  "  const _ordered = _selected.slice(); if (false) _selected.filter(k => k.toLowerCase() === 'class')" 1

echo "── m27 · an unrenderable value is COERCED instead of dropped ──"
mutant m27 "a boolean/object value is stringified -> 'narrow by true' / '[object Object]'" \
  "$CCS_AFTER" \
  "    if (typeof _v !== 'string') return null;      // boolean / object / null -> dropped, never guessed" \
  "    if (typeof _v !== 'string') return String(_v);" 1

echo "── m28 · the class UNION is dropped (only spec_asked keys survive) ──"
# The conformance addendum is explicit that `class ∉ spec_asked` is an ARTEFACT, not an
# invariant, so the union must never be simplified away in either direction.
mutant m28 "class is filtered out -> the noun the customer typed disappears from the line" \
  "$CCS_AFTER" \
  "  const _selected = _keys.filter(k => { const n = k.toLowerCase(); return n === 'class' || _asked.has(n); });" \
  "  const _selected = _keys.filter(k => _asked.has(k.toLowerCase()));" 1

echo "── m29 · the VALUE is taken from the LAST in-answer row instead of the first ──"
mutant m29 "row order stops being the ranker's order -> an arbitrary row describes the answer" \
  "$CCS_AFTER" \
  "    for (const m of _specRows) {" \
  "    for (const m of _specRows.slice().reverse()) {" 1

# ── reviewer findings F1 / F2 ───────────────────────────────────────────────────────────
echo "── m30 (F1) · the CRM-derived query token is rendered as a customer token again ──"
# The BLOCKER: the customer's own question printed back at them as a failed search term.
mutant m30 "the full-sentence token heads a did-you-mean group again (exec 12597815's defect)" \
  "$CCS_AFTER" \
  "    if (_sentTokens.size) return !_sentTokens.has(k);" \
  "    if (_sentTokens.size) return false;" 1

echo "── m30b (F1) · the predicate is disabled outright ──"
# m30 leaves the raw-turn-text fallback arm live; this one kills the whole rule, so the two
# arms are each shown to be load-bearing rather than one covering for the other.
mutant m30b "no derived-token suppression at all" \
  "$CCS_AFTER" \
  "    if (!k) return false;
    if (_sentTokens.size) return !_sentTokens.has(k);" \
  "    if (!k) return false;
    if (true) return false;" 1

echo "── m31 (F2) · the Matched-on line is emitted on a MIXED answer again ──"
mutant m31 "a spec-only attribution closes a reply whose rows mostly matched on CODE" \
  "$CCS_AFTER" "  if (!_allShownAreSpec) return;" "  if (false) return;" 1

# ── reviewer F1, the SECOND emitter (rev 4) ─────────────────────────────────────────────
# Same two arms as m30/m30b, on build-suggest-offer. Kept separate rather than folded in:
# rev 3 proved that fixing one emitter and assuming the other is a §63 wrong-object failure,
# so each node needs its own mutant or the suite makes exactly that assumption again.
echo "── m32 (F1/bso) · the derived query token is a customer token again, via the sent-token arm ──"
mutant m32 "bso renders the customer's whole QUESTION as a failed search term (exec 12597815)" \
  "$BSO_AFTER" \
  "  if (_sentTokens.size) return !_sentTokens.has(k);" \
  "  if (_sentTokens.size) return false;" 1

echo "── m32b (F1/bso) · the predicate is disabled outright ──"
mutant m32b "no derived-token suppression in bso at all" \
  "$BSO_AFTER" \
  "  if (!k) return false;
  if (_sentTokens.size) return !_sentTokens.has(k);" \
  "  if (!k) return false;
  if (true) return false;" 1

echo "── m33 (F1/bso) · the filter clause is dropped, predicate left in place ──"
# Distinct from m32/m32b: proves the CLAUSE is wired, not merely that the predicate exists.
# A guard that is defined and never called is the shape a careless merge produces.
mutant m33 "the predicate is defined but never consulted by the miss filter" \
  "$BSO_AFTER" \
  "    && !_isDerivedQueryToken(res.token));" \
  "    && true);" 1

echo
echo "── stale-anchor self-test: a mutant that CANNOT apply must be VOID, never CAUGHT ──"
mutant selftest "deliberately impossible anchor" "$CCS_AFTER" "this string is not in the body" "x" 1

echo
echo "════════════════════════════════════════════════════════════════════"
echo "caught=$CAUGHT  survived=$MISSED  void=$VOID"
echo "The selftest above MUST appear as VOID — that is the instrument proving"
echo "a no-op substitution can never be scored as a detection (LESSONS §72)."
if [ "$MISSED" -gt 0 ]; then
  echo "RESULT: a mutant SURVIVED — read it as a missing assertion, not as robustness."
fi
# void==1 is the expected selftest. Anything more means a real anchor went stale.
if [ "$VOID" -ne 1 ]; then
  echo "RESULT: unexpected VOID count ($VOID, expected exactly 1 = the selftest)."
  echo "        A real anchor has gone stale — the suite result is VOID until it is repaired."
  exit 2
fi
[ "$MISSED" -eq 0 ] && exit 0 || exit 1
