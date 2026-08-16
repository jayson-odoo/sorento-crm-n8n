#!/usr/bin/env bash
# §0 S9 — every mutation must (1) occur exactly N>0 times BEFORE, (2) change the file digest AFTER,
# (3) abort WITHOUT running the suite on either failure. A suite result obtained without both
# assertions is VOID, not merely unconvincing (LESSONS §61b).
#
# This harness goes further than B1's: each step declares the EXACT set of fixtures it expects to go
# RED and fails if the observed red-set differs. "The suite went red somewhere" is not evidence that
# the mutation was caught by the assertion that was supposed to catch it (LESSONS §63 — wrong-object
# assertions are sound assertions pointed at the wrong thing).
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
MUT="$SP/oe.mut.js"
RC=0

run_mut () {
  local label="$1" find="$2" repl="$3" expect_n="$4" expect_red="$5"
  cp "$SP/oe.after.js" "$MUT"
  local n; n=$(grep -Fo -- "$find" "$MUT" | wc -l | tr -d ' ')
  echo "--- $label"
  echo "    occurrences before : $n (expected $expect_n)"
  if [ "$n" != "$expect_n" ] || [ "$n" = "0" ]; then
    echo "    ABORT: occurrence assertion failed — suite NOT run (VOID)"; RC=2; return 2
  fi
  local d0; d0=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  python3 - "$MUT" "$find" "$repl" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))
PY
  local d1; d1=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; RC=2; return 2; fi
  node --check "$MUT" || { echo "    ABORT: mutant does not parse — suite NOT run"; RC=2; return 2; }
  score "$expect_red"
}

# Two substitutions in one mutant (both S9-gated independently), for a guard split across two maps.
run_mut2 () {
  local label="$1" f1="$2" r1="$3" n1="$4" f2="$5" r2="$6" n2="$7" expect_red="$8"
  cp "$SP/oe.after.js" "$MUT"
  local a; a=$(grep -Fo -- "$f1" "$MUT" | wc -l | tr -d ' ')
  local b; b=$(grep -Fo -- "$f2" "$MUT" | wc -l | tr -d ' ')
  echo "--- $label"
  echo "    occurrences before : $a (expected $n1) and $b (expected $n2)"
  if [ "$a" != "$n1" ] || [ "$b" != "$n2" ] || [ "$a" = "0" ] || [ "$b" = "0" ]; then
    echo "    ABORT: occurrence assertion failed — suite NOT run (VOID)"; RC=2; return 2
  fi
  local d0; d0=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  python3 - "$MUT" "$f1" "$r1" "$f2" "$r2" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
t = t.replace(sys.argv[2], sys.argv[3]).replace(sys.argv[4], sys.argv[5])
p.write_text(t)
PY
  local d1; d1=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; RC=2; return 2; fi
  node --check "$MUT" || { echo "    ABORT: mutant does not parse — suite NOT run"; RC=2; return 2; }
  score "$expect_red"
}

# FP-6 is a BLOCK MOVE, not a substitution: relocate the reconciliation pass from below block (B) to
# above dymNumberedMultiSelect. Same three S9 gates.
run_move () {
  local label="$1" expect_red="$2"
  cp "$SP/oe.after.js" "$MUT"
  echo "--- $label"
  local d0; d0=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  python3 - "$MUT" <<'PY' || exit 2
import sys, pathlib
p = pathlib.Path(sys.argv[1]); L = p.read_text().split("\n")
start = [i for i, l in enumerate(L) if l.startswith("// ── B2' (carried-certificate-dump) — POST-MERGE ENTITY RECONCILIATION")]
anchor = [i for i, l in enumerate(L) if l.startswith("(function dymNumberedMultiSelect(){")]
print("    occurrences before : block=%d anchor=%d (expected 1 and 1)" % (len(start), len(anchor)))
if len(start) != 1 or len(anchor) != 1:
    print("    ABORT: anchor assertion failed — suite NOT run (VOID)"); sys.exit(1)
s = start[0]
end = next(i for i in range(s, len(L)) if L[i].startswith("  if (_rcDupes > 0)"))
end += 1                                  # the closing brace of the block
assert L[end] == "}", "unexpected block terminator: %r" % L[end]
block = L[s:end + 1]
rest = L[:s] + L[end + 1:]
a = next(i for i, l in enumerate(rest) if l.startswith("(function dymNumberedMultiSelect(){"))
p.write_text("\n".join(rest[:a] + block + [""] + rest[a:]))
PY
  local d1; d1=$(shasum -a 256 "$MUT" | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; RC=2; return 2; fi
  node --check "$MUT" || { echo "    ABORT: mutant does not parse — suite NOT run"; RC=2; return 2; }
  score "$expect_red"
}

score () {
  local expect_red="$1"
  local got; got=$(node "$SP/oe-probe.js" "$MUT" 2>&1 | awk '/^FAIL /{print $2}' | sort | tr '\n' ' ' | sed 's/ $//')
  local want; want=$(echo "$expect_red" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  echo "    RED fixtures : ${got:-<none>}"
  echo "    expected     : ${want:-<none>}"
  if [ "$got" = "$want" ]; then
    echo "    ✅ instrument confirmed — the mutation reddens exactly the fixtures that are supposed to catch it"
  else
    echo "    ❌ MISMATCH — the named assertion is not the instrument for this mutation"
    RC=1
  fi
}

echo "baseline (unmutated): $(node "$SP/oe-probe.js" "$SP/oe.after.js" | tail -1)"
echo

# ── §CD-FP-4 — part 1, the axis entries ────────────────────────────────────────────────────────
# Step (a) is documented as a NON-instrument: HINT_AXIS_DEFAULT still covers `certificate`, so
# removing the AXIS_BY_DOMAIN entry alone changes nothing. Recording that rather than hiding it.
AX_DOMAIN="    certificate:     'attachment_scope',   // B2' part 1: was \`__certificate\` -> never evicted (exec 11509873)"
AX_DEFAULT="  certificate: 'attachment_scope', attachment: 'attachment_scope',   // B2' part 1"
# 4a and 4b are each a NON-instrument by construction, and that is the finding worth recording:
# the two maps shadow one another, so removing either alone is inert for a product_attachment turn.
run_mut  "CD-FP-4a  drop certificate from AXIS_BY_DOMAIN only (expected: NOT an instrument)" \
  "$AX_DOMAIN" "" 1 ""
run_mut  "CD-FP-4b  drop certificate from HINT_AXIS_DEFAULT only (expected: NOT an instrument — the domain map shadows it)" \
  "$AX_DEFAULT" "" 1 ""
run_mut2 "CD-FP-4c  drop certificate from BOTH maps" \
  "$AX_DOMAIN" "" 1 "$AX_DEFAULT" "" 1 "CD-10b CD-11a CD-11a2 CD-11b CD-5 CD-7c2 FP8-D"

# ── §CD-FP-6 — part 2, the pass POSITION ───────────────────────────────────────────────────────
run_move "CD-FP-6   move the pass above dymNumberedMultiSelect (expect CD-11b RED, CD-11a GREEN)" \
  "CD-11b"

# ── §CD-FP-7 — part 3, provenance vs the corrupted flag. THE most important mutation in the family.
run_mut "CD-FP-7   isCarried() -> the current_message flag" \
  "  return _cePriorKeys.has(_k) && !_ceLlmKeys.has(_k);" \
  "  return e.current_message !== true;" 1 "CD-11a CD-11a2 CD-11b CD-7c2"

# ── §CD-FP-8 — part 4, the widened product_scope trigger ───────────────────────────────────────
run_mut "CD-FP-8   drop the product_scope half (i.e. revert to B2-as-designed)" \
  "  const _rcEvict = _rcContribAttach || _rcContribProduct;" \
  "  const _rcEvict = _rcContribAttach;" 1 "CD-11a CD-11a2 CD-11b CD-7c2 FP8-D"

# ── §CD-FP-9 — part 5, the dedupe ──────────────────────────────────────────────────────────────
run_mut "CD-FP-9   disable the dedupe" \
  "    if (_rcSeenKey.has(_k) || (_u && _rcSeenUuid.has(_u))) {" \
  "    if (false) {" 1 "CD-7c CD-7c2"

# ── negative control: a string that is NOT in the file must ABORT, never run ────────────────────
run_mut "CD-FP-0   NEGATIVE CONTROL (string not present — must ABORT)" \
  "return (hb - ha);" "return 0;" 1 ""

rm -f "$MUT"
echo
if [ "$RC" = "0" ]; then echo "MUTATION SUITE: all instruments confirmed"; else echo "MUTATION SUITE: rc=$RC (0 = ok, 1 = a mismatch, 2 = an ABORT — expected only for CD-FP-0)"; fi
exit 0
