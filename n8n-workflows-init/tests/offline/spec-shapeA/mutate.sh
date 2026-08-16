#!/usr/bin/env bash
# ── SA fail-on-purpose gate (§0 S9 / LESSONS §61, §72) ───────────────────────────────────
# Every assertion in probe.js is worthless until a mutant has made it red. Each mutation
# below breaks ONE behaviour and names the assertion that must go ✗.
#
# S9 is enforced literally, all three parts, and the run ABORTS rather than scoring a suite
# whose mutation may not have applied:
#   1. the search string must occur EXACTLY N>0 times before substituting (literal count);
#   2. the file digest must CHANGE after;
#   3. either failure aborts loudly and the suite is NOT run.
# Plus the §72 zero-byte guard: a mutant byte-identical to the original can never be scored
# as a detection. (That guard is what caught a stale anchor in the promo-picker harness on
# the very change that recorded the lesson.)
#
# MAPPING TO UAC SA.md's m1-m3. SA.md writes them against the LIVE-CRM probes (SA-P1/P2/P5);
# those four probes are UNRUN here because this seat may not reach production hosts, so m1/m3
# are realised against their OFFLINE counterparts and m2 lands exactly where SA.md puts it:
#   m1 "strip spec_fallback"          -> B3/B4  (was: SA-P1 red)
#   m2 "code-shaped raws let through" -> P5-1   (SA-P5, unchanged)
#   m3 "parity comparison disturbed"  -> B2/B4  (was: SA-P2 red)
# The remaining mutants (m4-m7) are per-assertion instruments for the cases SA.md does not
# enumerate. Re-run m1-m3 against the live probes once someone with CRM credentials runs
# crm-probe.js — until then those three are proven only at the body-composition layer, and
# this comment is the record of that gap.
set -uo pipefail
cd "$(dirname "$0")"

BUILD=build-body.js
CLASS=free-terms.js
BAK_BUILD=$(mktemp); cp "$BUILD" "$BAK_BUILD"
BAK_CLASS=$(mktemp); cp "$CLASS" "$BAK_CLASS"
restore() { cp "$BAK_BUILD" "$BUILD"; cp "$BAK_CLASS" "$CLASS"; }
trap restore EXIT

fails=0; runs=0

# $1 name  $2 file  $3 literal-find  $4 literal-replace  $5 expected-count  $6 assertion id
mutate() {
  runs=$((runs+1))
  restore
  local name="$1" file="$2" find="$3" repl="$4" want="$5" assertion="$6"
  local before_digest after_digest
  before_digest=$(shasum -a 256 "$file" | cut -d' ' -f1)

  # S9.1 — literal occurrence count, asserted BEFORE substituting.
  local n
  n=$(grep -Fo -- "$find" "$file" | wc -l | tr -d ' ')
  if [ "$n" != "$want" ]; then
    echo "🛑 $name: ABORT — search string occurs $n times in $file, expected $want. The source moved; fix the anchor. Suite NOT run (S9)."
    exit 2
  fi

  FIND="$find" REPL="$repl" python3 - "$file" <<'PY'
import os, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(s.replace(os.environ['FIND'], os.environ['REPL']))
PY

  # S9.2 + §72 — the bytes must actually have moved.
  after_digest=$(shasum -a 256 "$file" | cut -d' ' -f1)
  if [ "$before_digest" = "$after_digest" ]; then
    echo "🛑 $name: ABORT — digest unchanged, the mutation was a no-op. Suite NOT run (S9/§72)."
    exit 2
  fi

  out=$(node probe.js 2>&1)
  # §72's actual failure: the probe CRASHED and the "did it go red?" grep matched the crash
  # output. A run that never reached its own summary line is not evidence in either direction.
  if ! echo "$out" | grep -q "passed, .* failed"; then
    echo "🛑 $name: ABORT — probe.js did not complete (no summary line). A crash is not a detection."
    echo "$out" | tail -5
    exit 2
  fi
  if echo "$out" | grep -q "✗ $assertion"; then
    echo "  ✓ $name -> probe went red on $assertion"
  else
    echo "🔴 $name: probe did NOT catch it (expected ✗ $assertion)"
    echo "$out" | grep -E '✗|failed' | head -3
    fails=$((fails+1))
  fi
}

echo "SA mutation gate"

# m1 — the feature flag itself never reaches the body. Without spec_fallback the CRM does
#      nothing at all, so this is the mutation that must not survive.
mutate "m1 spec_fallback stripped from the body" "$BUILD" \
  "  '  \"spec_fallback\": true,'," "" 1 "B3"

# m2 — SA.md's m2, verbatim: code-shaped raws are let into free_terms.
mutate "m2 code-shaped raws let through" "$CLASS" \
  '!(/[0-9]/.test(v)' '!(false && /[0-9]/.test(v)' 1 "P5-1"

# m2' — the over-correction in the other direction: the leading-letter requirement is
#       dropped, so dimensions ("600mm") are eaten as codes. P5-4 is the only guard against
#       silently deleting the customer's spec, so it needs its own mutant (LESSONS §F7: a
#       bound assertion is worth nothing until a mutant has made it red).
mutate "m2' leading-letter requirement dropped -> dimensions eaten" "$CLASS" \
  '/^[A-Za-z][A-Za-z][A-Za-z0-9' '/^[A-Za-z0-9' 1 "P5-4"

# m3a — a pre-existing field is disturbed. This is SA-P2's parity claim at the body layer:
#       if the change can move `limit`, it can move anything the spine already sends.
mutate "m3a pre-existing field changed (limit 15 -> 25)" "$BUILD" \
  '"limit": 15,' '"limit": 25,' 1 "B2"

# m3b — a stray field rides along. Same shape as the promotion-picker outage (LESSONS §71):
#       a hunk nobody reviewed travelling inside a change nobody re-diffed.
mutate "m3b stray fourth field injected" "$BUILD" \
  '"spec_fallback": true,' '"spec_fallback": true, "spec_mode": "always",' 1 "B4"

# m4 — the unicode-dash half of the separator class. Its absence is invisible on every ASCII
#      fixture, which is exactly why it gets its own mutant.
mutate "m4 U+2212 dropped from the code separator class" "$CLASS" \
  '\\u2212' '' 1 "P5-2"

# m5 — dedupe removed.
mutate "m5 dedupe removed" "$CLASS" \
  '.filter((v, i, a) => a.indexOf(v) === i)' '' 1 "P5-8"

# m6 — trim removed.
mutate "m6 trim removed" "$CLASS" \
  ".trim())" ')' 1 "P5-7"

# m7 — v1's deterministic-only decision silently reversed: understand_phrase true would add
#      2-3 s to every zero-match reply and read the parser's restatement as the customer's
#      words. B3 is the only thing pinning it.
mutate "m7 understand_phrase flipped to true" "$BUILD" \
  '"understand_phrase": false' '"understand_phrase": true' 1 "B3"

# m8 — the guard that lets a missing/null entity list render as [] instead of throwing.
#      HISTORY, kept deliberately: the first version of this mutant removed a `|| []` from the
#      ACCESSOR and survived, because the classifier's own Array.isArray guard already covered
#      that shape — an EQUIVALENT mutant, i.e. the `|| []` was dead code. It was deleted from
#      build-body.js rather than defended with an assertion that could not fail, and the mutant
#      was re-pointed at the guard that is actually load-bearing. This is the §72 loop working:
#      the surviving mutant taught the missing assertion (B6) AND removed dead code.
mutate "m8 Array.isArray guard removed -> missing entity list throws" "$CLASS" \
  '(Array.isArray(_e) ? _e : [])' '(_e)' 1 "B6"

restore
echo
echo "$((runs-fails))/$runs mutations caught"
exit $((fails > 0 ? 1 : 0))
