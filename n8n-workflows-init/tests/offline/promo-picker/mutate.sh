#!/usr/bin/env bash
# §0 S9 — every mutant must drive probe.js RED. A mutant that passes marks a decorative assertion.
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
mutant() {
  python3 - "$2" <<'PY' > /tmp/pp_mutant.js
import sys,pathlib
s=pathlib.Path('promo-picker.js').read_text(); exec(sys.argv[1]); sys.stdout.write(s)
PY
  # a mutant that leaves the body byte-identical is a STALE ANCHOR — hard fail, never "caught"
  if cmp -s /tmp/pp_mutant.js promo-picker.js; then
    echo "  ✗ $1 — MUTANT WAS A NO-OP (stale anchor)"; fail=$((fail+1)); return
  fi
  if node --check /tmp/pp_mutant.js 2>/dev/null && node probe.js /tmp/pp_mutant.js >/dev/null 2>&1; then
    echo "  ✗ $1 — probe still PASSED"; fail=$((fail+1))
  else
    echo "  ✓ $1 — RED as required"; pass=$((pass+1))
  fi
}
echo "mutants:"
mutant "M1 the S4 list-gate sneaks back (D5 broken: attachments emptied)" "s=s.replace('  // ── scope echo ──','  env.attachments = [];\n  // ── scope echo ──',1)"
mutant "M2 picker fires on a single promotion (D2 broken)" "s=s.replace('if (answers.length > 1) {','if (answers.length > 0) {')"
mutant "M3 roster labels carry numbering"                  "s=s.replace('label: labelOf(a, i),','label: (i+1)+\". \"+labelOf(a, i),')"
mutant "M4 pick ignores positions, sends everything"       "s=s.replace('const pickedAtts = pickedIdx.map','const pickedAtts = atts.map')"
mutant "M5 selection_context wrong -> ALL handler dies"    "s=s.replace(\"'suggest_offer'\",\"'promo_offer'\")"
mutant "M6 out-of-range no longer recorded"                "s=s.replace('out_of_range: positions.filter(n => n > answers.length),','out_of_range: [],')"
mutant "M7 off-domain guard removed"                       "s=s.replace(\"if ((parser.domain_hint ?? null) !== 'promotion') return j;\",'')"
mutant "M8 drift silently swallowed"                       "s=s.replace('drift.push({ idx: n, resolved_by: \'name\' });','')"
mutant "M9  response left unfiltered on a pick"  "s=s.replace('env.response = withNotice([_pickIntro, renderBlocks(pickedAns)].filter(Boolean).join(\'\\\\n\\\\n\'));','')"
mutant "M10 list intro replacement dropped (count/scope vanish)" "s=s.replace('env.response_intro = withNotice(_listIntro);','')"
mutant "M11 pre-narrowed lane removed (dym pick gets double-filtered)" "s=s.replace('if (_pickedEntities) {','if (false) {')"
mutant "M12 rosters stop being (re)published (repeat picks break)" "s=s.replace('env.suggest_last_result_set = answers.map','env.suggest_last_result_set = [].map',2)"
mutant "M13 unknown shape falls through (fail-OPEN returns)" "s=s.replace('  if (atts.length > 1) {','  if (false) {',1)"
mutant "M14 wrapped envelope no longer unwrapped"             "s=s.replace('const env     = (j && typeof j.output === \'object\' && j.output !== null) ? j.output : j;','const env     = j;')"
mutant "M15 roster-label validation removed"                  "s=s.replace('if (_pickLabels.length > 0) {','if (false) {')"
mutant "M16 scope echo dropped (intro no longer says what it is for)" "s=s.replace('_scopeLabel ? ','false ? ')"
mutant "M17 scope echo unbounded (a filename-length promotion name is printed)" "s=s.replace('return s.length > 60 ? \'\' : s;','return s;')"
mutant "M18 scope echo prefers the canonical code over the typed words" "s=s.replace('String((e && e.raw) || \'\').trim()','String((e && e.canonical_code) || (e && e.raw) || \'\').trim()')"
mutant "M19 scope echo stops de-duplicating raws" "s=s.replace('if (v && !raws.some(x => x.toLowerCase() === v.toLowerCase())) raws.push(v);','if (v) raws.push(v);')"

mutant "P1 sort removed entirely" "s=s.replace('const _reordered = _order.some((src, dst) => src !== dst);','const _reordered = false;')"
mutant "P2 sort ascending (soonest-expiring first)" "s=s.replace('if (ex > ey) return -1; if (ex < ey) return 1;','if (ex > ey) return 1; if (ex < ey) return -1;')"
mutant "P3 answers permuted but attachments NOT (every pick sends the wrong file)" "s=s.replace('if (_pairable) { const _t = _order.map(i => atts[i]); atts.splice(0, atts.length, ..._t); }','')"
mutant "P4 rows with no end date float to the TOP" "s=s.replace('if (ex === null) return 1; if (ey === null) return -1;','if (ex === null) return -1; if (ey === null) return 1;')"
mutant "P5 stale LLM body reused on a reordered list" "s=s.replace('const _swapped = _reordered ? null : reintro(env.response, env.response_intro, _listIntro);','const _swapped = reintro(env.response, env.response_intro, _listIntro);')"
mutant "P6 freshness stamp dropped by the rebuild" "s=s.replace('[_listIntro, renderBlocks(answers), _tail]','[_listIntro, renderBlocks(answers)]')"
mutant "P7 start-date tiebreak removed" "s=s.replace('if (sx !== sy) { if (sx === null) return 1; if (sy === null) return -1; if (sx > sy) return -1; if (sx < sy) return 1; }','')"

echo
echo "$pass/$((pass+fail)) mutants correctly detected"
[ "$fail" -eq 0 ] || exit 1
