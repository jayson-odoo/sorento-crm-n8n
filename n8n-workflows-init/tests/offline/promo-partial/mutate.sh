#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
mutant() {
  f="$2"
  python3 - "$3" "$f" <<'PY' > /tmp/pp2_mutant.js
import sys,pathlib
s=pathlib.Path(sys.argv[2]).read_text(); exec(sys.argv[1]); sys.stdout.write(s)
PY
  # STRUCTURAL GUARD (3rd stale-anchor incident today): a mutant whose anchor string is absent
  # mutates nothing and reports healthy — a control that cannot fail. Hard-fail it instead.
  if cmp -s "$f" /tmp/pp2_mutant.js; then
    echo "  x $1 - STALE ANCHOR: mutation changed zero bytes"; fail=$((fail+1)); return
  fi
  cp "$f" /tmp/pp2_orig.js; cp /tmp/pp2_mutant.js "$f"
  if node --check "$f" 2>/dev/null && PREPUBLISH=1 node probe.js >/dev/null 2>&1; then
    echo "  x $1 - probe still PASSED"; fail=$((fail+1))
  else
    echo "  ok $1 - RED as required"; pass=$((pass+1))
  fi
  cp /tmp/pp2_orig.js "$f"
}
echo "mutants:"
mutant "S1 per-product note removed" promo-picker.after.js "s=s.replace('if (_unmatchedProducts.length && (env.response || env.response_intro)) {','if (false) {')"
mutant "S2 shown-promotion join broken (attribution lost)" promo-picker.after.js "s=s.replace('const _shownNames = new Set(answers.map((a) => {','const _shownNames = new Set([].map((a) => {')"
mutant "S4 note mutates the roster instead of being display-only" promo-picker.after.js "s=s.replace('  j._promo_unmatched = _unmatchedProducts;','  env.suggest_last_result_set = []; j._promo_unmatched = _unmatchedProducts;')"
mutant "T1 entitlement wording removed" not-found-error-message.after.js "s=s.replace('    parts.push(_entitlementMiss','    parts.push(false')"
mutant "T2 entitlement wording fires with NO promotion resolved" not-found-error-message.after.js "s=s.replace('    if (!_promoMatches.length) return null;','').replace('    if (!_named.length) return null;','').replace(\"const _label = _named[0] +\",\"const _label = (_named[0] || 'a promotion') +\")"
mutant "T3 inactive promotion blamed on access" not-found-error-message.after.js "s=s.replace('    if (!_anyActive) {','    if (false) {')"
mutant "T4 invents an access level when entitlement is unknown" not-found-error-message.after.js "s=s.replace(\"const _at = _levels.length ? \` at your access level (\${_levels.join(', ')})\` : ' to you';\",\"const _at = \` at your access level (\${_levels.join(', ')})\`;\")"
mutant "T5 fires outside the promotion domain" not-found-error-message.after.js "s=s.replace(\"if (q.domain_hint !== 'promotion') return null;\",'')"
mutant "U3 offer wording drifts off the parser contract" promo-picker.after.js "s=s.replace('Would you like me to escalate to','Shall I escalate to')"
mutant "U4 escalate offer fires on a fully answered turn" promo-picker.after.js "s=s.replace('if (_unmatchedProducts.length && (env.response || env.response_intro)) {','if ((env.response || env.response_intro)) {')"
mutant "U6 all-tokens-unmet not deferred to the not-found path" promo-picker.after.js "s=s.replace('  return unmet.length === tokens.length ? [] : unmet;','  return unmet;')"
mutant "U7 per-token attribution ignored (falls back to global)" promo-picker.after.js "s=s.replace('    if (own.some(m => _shownNames.has(norm(m.display && m.display.description)))) return true;','')"

mutant "V2 fires even when rows DO satisfy all tokens" promo-picker.after.js "s=s.replace('  return inter.length === 0 ? toks : [];','  return toks;')"
mutant "V3 single-token guard removed" promo-picker.after.js "s=s.replace('  if (toks.length < 2) return [];','')"
mutant "V4 fires when a token contributed nothing (should defer to per-item)" promo-picker.after.js "s=s.replace(\"  if (!toks.every(t => (own.get(norm(t)) || 0) > 0)) return [];\",'')"



mutant "W1 strict miss removed entirely" promo-picker.after.js "s=s.replace('if (_strictMiss && (env.response || env.response_intro)) {','if (false) {')"
mutant "W2 brand-only guard dropped (product decomposition collapses too)" promo-picker.after.js "s=s.replace(\"if (met.every(t => _tokenHint.get(norm(t)) === 'brand')) {\",'if (true) {')"
mutant "W3 attachments still sent on a not-found" promo-picker.after.js "s=s.replace('  env.attachments    = [];               // nothing is being answered; nothing may be sent','')"
mutant "W4 roster left armed on a not-found (stray 1 picks an invisible row)" promo-picker.after.js "s=s.replace('  env.suggest_last_result_set  = [];','')"
mutant "W5 escalation offer dropped from the strict miss" promo-picker.after.js "s=s.replace('\${_detail}. \${_offer}\`','\${_detail}.\`')"
mutant "W6 disjoint case no longer collapses" promo-picker.after.js "s=s.replace(\"if (_disjointTokens.length) return { tokens: _disjointTokens, words: [], reason: 'disjoint' };\",'')"
mutant "W7 response_intro left claiming an answer" promo-picker.after.js "s=s.replace('  env.response_intro = withNotice(_msg);','')"

mutant "X1 coverage consumption removed (shower-set ghost returns)" promo-picker.after.js "s=s.replace('    if (uw.length) m.set(norm(tc.token), uw);','')"
mutant "X2 truncated guard dropped (claims over trimmed rows)" promo-picker.after.js "s=s.replace('    if (cov.truncated === true) continue;     // trimmed/unscored rows -> cannot claim','')"
mutant "X3 absent promotion entry treated as no-match" promo-picker.after.js "s=s.replace('    if (!cov) continue;                       // absence = NO CLAIM, never \"no match\"','    if (!cov) { m.set(norm(tc.token), [String(tc.token)]); continue; }')"
mutant "X4 failing word no longer named" promo-picker.after.js "s=s.replace('  const _detail = _strictMiss.words.length','  const _detail = false')"
mutant "X5 word-level unmet no longer counts as unmet" promo-picker.after.js "s=s.replace('  for (const k of _coverageUnmet.keys()) unmet.add(k);   // word-level unmet counts as unmet','')"

echo
echo "$pass/$((pass+fail)) mutants correctly detected"
[ "$fail" -eq 0 ] || exit 1
