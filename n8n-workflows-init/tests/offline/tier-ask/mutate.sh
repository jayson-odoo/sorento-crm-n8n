#!/usr/bin/env bash
# ── tier-ask fail-on-purpose gate (§0 S9 / LESSONS §61) ──────────────────────────────────
# Each mutation breaks ONE behaviour of the new bodies; probe.js must go RED on the named
# assertion. Mutations run against a SCRATCH COPY (OFFLINE_NODES_DIR) so the committed
# bodies are never touched. A mutation that leaves the target byte-identical (stale anchor)
# is a HARD FAIL — the control that cannot fail is the recurring class this guard exists
# for (memory: green-that-cannot-fail).
set -uo pipefail
cd "$(dirname "$0")"
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

fails=0; runs=0
mutate() { # $1=name $2=file $3=sed-expr $4=probe-id that must go RED
  runs=$((runs+1))
  cp ./*.js "$SCRATCH"/
  sed -i '' -E "$3" "$SCRATCH/$2"
  if cmp -s "$SCRATCH/$2" "./$2"; then
    echo "🔴 $1: MUTATION WAS A NO-OP (stale anchor) — fix the sed"; fails=$((fails+1)); return
  fi
  out=$(OFFLINE_NODES_DIR="$SCRATCH" node probe.js 2>&1)
  if echo "$out" | grep -q "FAIL  $4 "; then
    echo "  ✓ $1 -> probe went red on $4"
  else
    echo "🔴 $1: probe did NOT catch it (expected FAIL $4)"; echo "$out" | tail -3; fails=$((fails+1))
  fi
}

# 1. stated tier no longer suppresses the ask (D2 broken)
mutate "stated-tier no longer suppresses ask" tier-gate.js \
  "s/if \(Array\.isArray\(stated\) && stated\.length > 0\) return false;//" \
  "TG-2a"

# 2. brand gate widens again (the R5 leak: Cabana ask answered with Sorento files)
mutate "brand_gate_empty widens again" tier-gate.js \
  "s/\(brandGateEmpty \? \[\] : qb\.filter\(b => entMap\.brands\.includes\(b\)\)\)/qb.filter(b => entMap.brands.includes(b)).length ? qb : entMap.brands/" \
  "TG-6"

# 3. Q23 unheld-tier fallback deleted (customer gets a bare not-found for an entitlement problem)
mutate "Q23 unheld-tier fallback deleted" tier-gate.js \
  "s/if \(access_levels_recomposed\.length === 0 && !brand_gate_empty && tier_stated\.length\) \{/if (false) {/" \
  "TG-7"

# 4. quick-reply buttons come back on the ask (D3 broken)
mutate "quick-reply buttons return" access-level-choice-message.js \
  "s/out\.quick_reply = '';/out.quick_reply = names.join(\",\");/" \
  "CM-1b"

# 5. ask wording drifts from the plan string
mutate "ask wording drift" access-level-choice-message.js \
  "s/Which access level do you need\?/Which access level would you like?/" \
  "CM-1a"

# 6. tier_offer context value typo (parser would never reconcile the reply)
mutate "selection_context typo" compile-current-state.js \
  "s/_tier \? 'tier_offer'/_tier ? 'tier_offers'/" \
  "CCS-1a"

# 7. the S4 list-gate sneaks back in (D5 broken: attachments emptied)
mutate "S4 attachment-emptying resurrected" promo-picker.js \
  "s|// ── scope echo ──|env.attachments = [];\n  // ── scope echo ──|" \
  "PP-1a"

# 8. gate held-check breaks (every stated tier reads unheld -> false notice)
mutate "gate held-check broken" disallowed-entity-gate.js \
  "s/const _heldT = _statedT\.filter\(t => _entT\.includes\(t\)\);/const _heldT = [];/" \
  "GQ-2"

# 9. statedTiers normalisation dropped (stated tier word never reaches the spine)
mutate "statedTiers normalisation dropped" output_exchange.js \
  "s/output\.output\.access_levels = TIER_ORDER\.filter\(t => _set\.has\(t\)\);/;/" \
  "OX-6a"

# 10. scope reuse flag dropped (promo-picker would double-filter / mis-lane the pick turn)
mutate "tier-pick scope-reuse flag dropped" output_exchange.js \
  "s/output\.output\._tier_pick_scope_reused = true;/;/" \
  "OX-1c"

# 11. tier positions not consumed (byIdx would mint entities off the tier roster)
mutate "tier positions not consumed" output_exchange.js \
  "s/^  output\.output\.reference_positions = \[\];$/  ;/" \
  "OX-1e"

# 12. semantic_input stops reading tier-gate (recomposition never reaches the CRM)
mutate "semantic_input ignores tier-gate" semantic-input.expr.js \
  "s/\? \\\$\('tier-gate'\)\.first\(\)\.json\.access_levels_recomposed/? []/" \
  "SI-1a"

# 13. word boundary lost in the EMBEDDED statedTiers ('dealership' would match) — the
#     byte-identity gate is what must catch a hand-edit inside the markers
mutate "embedded statedTiers edited by hand" output_exchange.js \
  "s/ \(dealer\|dealers\|pengedar\) /(dealer|dealers|pengedar)/" \
  "EB-ox-statedTiers"

echo
echo "$((runs-fails))/$runs mutations caught"
exit $((fails > 0 ? 1 : 0))
