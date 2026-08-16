#!/usr/bin/env bash
# §0 S9 — every mutant must drive probe.js RED. A mutant that survives marks a decorative
# assertion, and a decorative assertion is worse than no assertion (LESSONS §61).
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
mutant() {
  python3 - "$2" <<'PY' > /tmp/psd_mutant.js
import sys,pathlib
s=pathlib.Path('compile-current-state.after.js').read_text(); exec(sys.argv[1]); sys.stdout.write(s)
PY
  if cmp -s compile-current-state.after.js /tmp/psd_mutant.js; then
    echo "  x $1 - STALE ANCHOR: mutation changed zero bytes"; fail=$((fail+1)); return
  fi
  cp compile-current-state.after.js /tmp/psd_orig.js
  cp /tmp/psd_mutant.js compile-current-state.after.js
  if node --check compile-current-state.after.js 2>/dev/null && PREPUBLISH=1 node probe.js >/dev/null 2>&1; then
    echo "  ✗ $1 — probe still PASSED"; fail=$((fail+1))
  else
    echo "  ✓ $1 — RED as required"; pass=$((pass+1))
  fi
  cp /tmp/psd_orig.js compile-current-state.after.js
}
echo "mutants:"
# the fix itself
mutant "N1 answered-token suppression removed (the reported defect returns)" \
  "s=s.replace('      && !_tokenWasAnswered(res));','      );')"
# over-suppression: the partial-miss FEATURE must not be collateral
mutant "N2 blanket mute — every miss treated as answered" \
  "s=s.replace('  const _tokenWasAnswered = (res) => {','  const _tokenWasAnswered = (res) => { return true;')"
mutant "N3 mute keyed on a heuristic (ambiguous) instead of the token's own candidates" \
  "s=s.replace('    if (!_answerCodes.size) return false;','    if (!_answerCodes.size) return false; return res && res.ambiguous === true;')"
# the bound: an empty answer set must suppress nothing
mutant "N4 empty compatible_entities mutes everything anyway" \
  "s=s.replace('    if (!_answerCodes.size) return false;','    if (!_answerCodes.size) return true;')"
# the match must be by CODE, not by mere presence of a matches[] array
mutant "N5 suppression fires on any token that HAS candidates" \
  "s=s.replace('    return cands.some(m => [m && m.uuid, m && m.canonical_code]','    return cands.length > 0 || cands.some(m => [m && m.uuid, m && m.canonical_code]')"
mutant "N6 legacy intersection answer set no longer consulted" \
  "s=s.replace('                            Array.isArray(res?.intersection) ? res.intersection : []);','                            );')"

mutant "N7 picker dedup removed (double voice returns)" \
  "s=s.replace(\"      && !_pickerReported.has(String(res.token ?? '').trim().toLowerCase())\",'')"
mutant "N8 picker dedup became a blanket mute" \
  "s=s.replace('    } catch (e) { /* node absent -> empty set */ }','    } catch (e) { }\\n    s2.add(String((r?.tokens||[])[0]??\\'\\').trim().toLowerCase()); for (const t of (r?.tokens||[])) s2.add(String(t??\\'\\').trim().toLowerCase());')"

echo
echo "$pass/$((pass+fail)) mutants correctly detected"
[ "$fail" -eq 0 ] || exit 1
