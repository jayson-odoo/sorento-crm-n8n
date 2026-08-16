#!/usr/bin/env bash
# §0 S9 — every mutant must drive probe.js RED.
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
mutant() {
  python3 - "$2" <<'PY' > /tmp/br_mutant.js
import sys,pathlib
s=pathlib.Path('gate.after.js').read_text(); exec(sys.argv[1]); sys.stdout.write(s)
PY
  cp gate.after.js /tmp/br_orig.js; cp /tmp/br_mutant.js gate.after.js
  if node --check gate.after.js 2>/dev/null && PREPUBLISH=1 node probe.js >/dev/null 2>&1; then
    echo "  x $1 - probe still PASSED"; fail=$((fail+1))
  else
    echo "  ok $1 - RED as required"; pass=$((pass+1))
  fi
  cp /tmp/br_orig.js gate.after.js
}
echo "mutants:"
mutant "Q1 brand ignored, back to company-only" "s=s.replace('.map(m => _brandTok(m) ||','.map(m => (false) ||')"
mutant "Q2 unknown brand invents a team instead of deferring to company" "s=s.replace(\"return _VALID.find(v => s.includes(v)) || null;\",\"return _VALID.find(v => s.includes(v)) || 'sorento';\")"
mutant "Q3 brand object shape not understood (only bare strings)" "s=s.replace(\"const s = (typeof b === 'object')\",\"const s = (false)\")"
mutant "Q4 bare-string brand not understood" "s=s.replace('      : String(b).toLowerCase();','      : \"\";')"
mutant "Q5 mixed brand set collapsed to the first match" "s=s.replace('out.resolved_company = _brands.length === 1 ? _brands[0] : null;','out.resolved_company = _brands[0] || null;')"
mutant "Q6 brand routing leaks outside the promotion domain" "s=s.replace(\"out.company_team = (domain === 'promotion' && _brands.length === 1)\",\"out.company_team = (_brands.length === 1)\")"
mutant "Q7 null brand treated as a brand" "s=s.replace('    if (!b) return null;','    if (!b) return null; if (b === null) return null;').replace(\"const b = m && m.display && m.display.brand;\",\"const b = (m && m.display && m.display.brand) || (m && m.display ? 'cabana' : null);\")"
mutant "Q8 parser-named brand ignored (back to company)" "s=s.replace('.map(m => _brandTok(m) || _parserBrand ||','.map(m => _brandTok(m) ||')"
mutant "Q9 typed brand outranks the row's own brand" "s=s.replace('.map(m => _brandTok(m) || _parserBrand ||','.map(m => _parserBrand || _brandTok(m) ||')"
mutant "Q10 any entity read as a brand, not just brand-hinted" "s=s.replace(\"if (String((e && e.hint) || '').toLowerCase() !== 'brand') continue;\",'')"

echo
echo "$pass/$((pass+fail)) mutants correctly detected"
[ "$fail" -eq 0 ] || exit 1
