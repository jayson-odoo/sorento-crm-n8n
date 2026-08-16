#!/usr/bin/env bash
# §0 S9: every mutation must (1) occur N>0 times BEFORE, (2) change the digest AFTER,
# (3) abort WITHOUT running the suite on either failure. A suite result without both is VOID.
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
run_mut () {
  local label="$1" find="$2" repl="$3" expect_n="$4"
  local f="$SP/gate.mut.js"
  cp "$SP/gate.after.js" "$f"
  local n; n=$(grep -Fo -- "$find" "$f" | wc -l | tr -d ' ')
  echo "--- $label"
  echo "    occurrences before : $n (expected $expect_n)"
  if [ "$n" != "$expect_n" ] || [ "$n" = "0" ]; then echo "    ABORT: occurrence assertion failed — suite NOT run (VOID)"; return 2; fi
  local d0; d0=$(shasum -a 256 "$f" | cut -d' ' -f1)
  python3 - "$f" "$find" "$repl" <<'PY'
import sys,pathlib
p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2],sys.argv[3]))
PY
  local d1; d1=$(shasum -a 256 "$f" | cut -d' ' -f1)
  echo "    digest before/after: ${d0:0:12} -> ${d1:0:12}"
  if [ "$d0" = "$d1" ]; then echo "    ABORT: digest unchanged — suite NOT run (VOID)"; return 2; fi
  node --check "$f" || { echo "    ABORT: mutant does not parse"; return 2; }
  node "$SP/probe.js" "$f" >/dev/null 2>&1
  local rc=$?
  if [ $rc -ne 0 ]; then echo "    suite RED  ✅ (gate is a working instrument)"; else echo "    suite GREEN ❌ (gate did not detect the mutation)"; fi
  node "$SP/probe.js" "$f" 2>&1 | grep -E '^FAIL|^compared' | sed 's/^/      /'
  return $rc
}
run_mut "CD-FP-1  domain guard -> true"        "gate_passed && domain === 'product_attachment'" "gate_passed && true" 1
run_mut "CD-FP-2  drop the !_haveProduct term" "if (_missedSubject && !_haveProduct) {" "if (_missedSubject) {" 1
run_mut "CD-FP-3  product-hint filter -> all"  ".filter(e => String(e.hint || '').toLowerCase() === 'product')" ".filter(e => true)" 1
run_mut "CD-FP-0  NEGATIVE CONTROL (string not present)" "return (hb - ha);" "return 0;" 1
