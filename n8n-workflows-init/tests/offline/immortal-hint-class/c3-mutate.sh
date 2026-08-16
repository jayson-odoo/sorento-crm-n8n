#!/usr/bin/env bash
# §IH-FP-6..11 — fail-on-purpose for C3, under UAC §0 S9's three-part procedure:
#   (1) the search string must occur EXACTLY N>0 times BEFORE substituting,
#   (2) the file digest must have CHANGED after,
#   (3) abort WITHOUT running the suite on either failure.
# A suite result obtained without both assertions is VOID (LESSONS §61b).
#
# Each step declares the EXACT expected red-set, keyed on the §IH clause. "Something went red" is
# not evidence the NAMED assertion is the instrument (LESSONS §63).
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
MUT="$SP/c3.mut"
RC=0

score () {
  local expect_red="$1"
  local got; got=$(node "$SP/c3-probe.js" "$MUT" 2>&1 | sed -n 's/^REDKEYS: *//p' \
    | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ' | sed 's/ $//')
  local want; want=$(echo "$expect_red" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ' | sed 's/ $//')
  echo "    RED clauses  : ${got:-<none>}"
  echo "    expected     : ${want:-<none>}"
  if [ "$got" = "$want" ]; then echo "    OK  instrument confirmed"
  else echo "    XX  MISMATCH — the named assertion is not the instrument for this mutation"; RC=1; fi
}

run_mut () {
  local label="$1" file="$2" find="$3" repl="$4" expect_n="$5" expect_red="$6"
  rm -rf "$MUT"; cp -R "$SP/c3.after" "$MUT"
  local n; n=$(python3 -c 'import sys,pathlib; print(pathlib.Path(sys.argv[1]).read_text().count(sys.argv[2]))' "$MUT/$file" "$find")
  echo "--- $label"
  echo "    target             : $file"
  echo "    occurrences before : $n (expected $expect_n)"
  if [ "$n" != "$expect_n" ] || [ "$n" = "0" ]; then
    echo "    ABORT: occurrence assertion failed — suite NOT run (VOID)"; RC=2; return 2
  fi
  local d0; d0=$(shasum -a 256 "$MUT/$file" | cut -d' ' -f1)
  python3 - "$MUT/$file" "$find" "$repl" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))
PY
  local d1; d1=$(shasum -a 256 "$MUT/$file" | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; RC=2; return 2; fi
  node --check "$MUT/$file" || { echo "    ABORT: mutant does not parse — suite NOT run"; RC=2; return 2; }
  score "$expect_red"
}

# Apply the same substitution to BOTH lane copies (the normal, correct case).
run_mut2 () {
  local label="$1" f1="$2" f2="$3" find="$4" repl="$5" expect_n="$6" expect_red="$7"
  rm -rf "$MUT"; cp -R "$SP/c3.after" "$MUT"
  local a; a=$(python3 -c 'import sys,pathlib; print(pathlib.Path(sys.argv[1]).read_text().count(sys.argv[2]))' "$MUT/$f1" "$find")
  local b; b=$(python3 -c 'import sys,pathlib; print(pathlib.Path(sys.argv[1]).read_text().count(sys.argv[2]))' "$MUT/$f2" "$find")
  echo "--- $label"
  echo "    occurrences before : $a and $b (expected $expect_n each)"
  if [ "$a" != "$expect_n" ] || [ "$b" != "$expect_n" ] || [ "$a" = "0" ]; then
    echo "    ABORT: occurrence assertion failed — suite NOT run (VOID)"; RC=2; return 2
  fi
  local d0; d0=$(cat "$MUT/$f1" "$MUT/$f2" | shasum -a 256 | cut -d' ' -f1)
  python3 - "$MUT/$f1" "$MUT/$f2" "$find" "$repl" <<'PY'
import sys, pathlib
for f in sys.argv[1:3]:
    p = pathlib.Path(f); p.write_text(p.read_text().replace(sys.argv[3], sys.argv[4]))
PY
  local d1; d1=$(cat "$MUT/$f1" "$MUT/$f2" | shasum -a 256 | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; RC=2; return 2; fi
  node --check "$MUT/$f1" && node --check "$MUT/$f2" || { echo "    ABORT: mutant does not parse"; RC=2; return 2; }
  score "$expect_red"
}

echo "baseline (unmutated): $(node "$SP/c3-probe.js" "$SP/c3.after" | tail -1)"
echo

# ── §IH-FP-6 — restore the D1 multi-token exclusion ───────────────────────────────────────────
# Must redden the LANE/SKIP-REASON clauses (§IH-11.4/11.5), not merely the suffix clause — the
# suffix would also disappear if the probe simply failed, which is a different bug.
run_mut2 "IH-FP-6  restore \`_survivors.length === 1 ? _survivors : null\`" \
  "dym-transform.js" "dym-transform-partial.js" \
  "    const _blocks = _survivors;" \
  "    const _blocks = _isPartialLane ? _survivors : (_survivors.length === 1 ? _survivors : null);" \
  1 "§IH-11.1 §IH-11.4 §IH-11.5 §IH-11.probe §IH-12a §IH-12b §IH-13 §IH-13b §IH-14"

# ── §IH-FP-7 — apply the has-first sort from D3 to the multi-token picks. ─────────────────────
# 🔴 THE gate that proves clause 3 detects RENUMBERING rather than riding on clause 1: the suffix
# clauses must stay GREEN (every code is still annotated) while clause 3 reddens (the order moved).
run_mut "IH-FP-7  apply the has-first sort to the multi-token picks" \
  "build-suggest-offer.js" \
  "    const candLines = [];
    for (const p of s.picks) {" \
  "    const candLines = [];
    s.picks.sort((a, b) => (_dymHas.has(_dymNorm(b.m.canonical_code)) ? 1 : 0) - (_dymHas.has(_dymNorm(a.m.canonical_code)) ? 1 : 0));
    for (const p of s.picks) {" \
  1 "§IH-11.3 §IH-11.inv §IH-13.n"

# ── §IH-FP-8 — annotate p.label instead of the rendered line ───────────────────────────────────
# MEASURED: it reddens the suggest_last_result_set BARE assertion ONLY. The plan (IH.md §IH-FP-8)
# also expects §IH-16 — it CANNOT redden there, because §IH-16 exercises the SINGLE-token code-mode
# block, a different arm that C3 does not touch. The plan's expectation assumed a shared render
# path that does not exist. Recorded, not re-aimed.
run_mut "IH-FP-8  annotate p.label instead of the rendered line" \
  "build-suggest-offer.js" \
  "      candLines.push(\`  \${idx}. \${p.label}\${_sfx}\`);" \
  "      p.label = \`\${p.label}\${_sfx}\`;
      candLines.push(\`  \${idx}. \${p.label}\`);" \
  1 "§IH-11.inv"

# ── §IH-FP-9 — raise the saturation threshold above the fixture's row count ────────────────────
run_mut2 "IH-FP-9  raise _PAGE_SATURATION above the fixture's row count" \
  "dym-annotate.js" "dym-annotate-partial.js" \
  "const _PAGE_SATURATION = 50;" "const _PAGE_SATURATION = 500;" \
  1 "§IH-14 fail-open"

# ── §IH-FP-10 — remove the cap so all 15 are probed ───────────────────────────────────────────
run_mut2 "IH-FP-10  disable the probe cap" \
  "dym-transform.js" "dym-transform-partial.js" \
  "  if (Number.isFinite(_cap) && _cap > 0 && cands.length > _cap) {" \
  "  if (false) {" \
  1 "§IH-13 §IH-13b §IH-15"

# ── §IH-FP-11 — apply C3 to dym-transform only, not the -partial twin ─────────────────────────
run_mut "IH-FP-11  revert the gate on the -partial twin ONLY" \
  "dym-transform-partial.js" \
  "    const _blocks = _survivors;" \
  "    const _blocks = _isPartialLane ? _survivors : (_survivors.length === 1 ? _survivors : null);" \
  1 "§IH-15"

# ── §IH-FP-F1 — restore the unsafe inventory cap (the tester pass-2 F1 blocker) ────────────────
# `probe_cap: 5` at the measured 13-rows/candidate grain is 65 rows against a 50-row budget: the
# probe saturates every time and the feature silently vanishes. Must redden the inventory arm and
# ONLY that arm — product_attachment is untouched by F1 and its live-proven behaviour must stay green.
run_mut2 "IH-FP-F1  restore the unsafe inventory probe_cap of 5" \
  "dym-transform.js" "dym-transform-partial.js" \
  "    probe_cap: 3," "    probe_cap: 5," \
  1 "§IH-13b"

# ── negative control ──────────────────────────────────────────────────────────────────────────
# ⚠️ Must edit BOTH twins. The first draft edited dym-transform.js only and reddened §IH-15 — i.e.
# it was not a negative control at all, it was a second §IH-FP-11. Recorded rather than re-aimed.
run_mut2 "IH-FP-CTRL  negative control (comment-only edit, BOTH twins)" \
  "dym-transform.js" "dym-transform-partial.js" \
  "// ── C3 mitigation (i): apply the cap." \
  "// ── C3 mitigation (i): apply the cap (negative control marker)." \
  1 ""

rm -rf "$MUT"
echo
if [ "$RC" = "0" ]; then echo "ALL MUTATIONS BEHAVED AS DECLARED"; else echo "MUTATION HARNESS RC=$RC"; fi
exit $RC
