#!/usr/bin/env bash
# §0 S9 — fail-on-purpose. Each mutant breaks ONE property the probe claims to guard.
# Every mutant MUST make probe.js exit non-zero. A mutant that passes means that
# assertion is decorative and cannot fail — the defect class that keeps biting this repo.
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
mutant() {
  local name="$1" py="$2"
  python3 - "$py" <<'PY' > /tmp/mutant.js
import sys,pathlib
s=pathlib.Path('nfem.after.js').read_text()
exec(sys.argv[1])
sys.stdout.write(s)
PY
  if node --check /tmp/mutant.js 2>/dev/null && node probe.js /tmp/mutant.js >/dev/null 2>&1; then
    echo "  ✗ $name — probe still PASSED (assertion cannot fail)"; fail=$((fail+1))
  else
    echo "  ✓ $name — probe went RED as required"; pass=$((pass+1))
  fi
}

echo "mutants:"
# M1: undo #11's token filter -> the access level prints twice again
mutant "M1 access-level filter removed" \
  "s=s.replace(\"tokens.filter(_notAccess).join(' ')\",\"tokens.join(' ')\")"
# M2: undo #11's empty-requested handling -> ' for the requested item' returns
mutant "M2 requested empty-string reverted" \
  "s=s.replace(\": '';\",\": 'the requested item';\",1)"
# M3: undo the conditional ' for ' segment
mutant "M3 unconditional ' for requested'" \
  "s=s.replace('\${_forRequested}',' for \${requested}')"
# M4: undo #12's exact-match preference
mutant "M4 exact-match promotion removed" \
  "s=s.replace('if (i > 0) arr.unshift(arr.splice(i, 1)[0]);','')"
# M5: corrupt the (+N more) count so D2-2 must catch it
mutant "M5 (+N more) count corrupted" \
  "s=s.replace('codes.length - 1','codes.length + 7')"

echo
echo "$pass/$((pass+fail)) mutants correctly detected"
[ "$fail" -eq 0 ] || exit 1
