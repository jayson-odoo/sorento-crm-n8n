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
mutate "unheld brand widens to full entitlement again" tier-gate.js \
  "s/\(brandUnheld \? \[\] : qb\.filter\(b => entMap\.brands\.includes\(b\)\)\)/entMap.brands/" \
  "TG-6"

# F1 regressions: re-merging the two flags, in either direction
mutate "brandless entitlement can be brand-denied again (F1)" tier-gate.js \
  "s/qb\.length > 0 && entMap\.brands\.length > 0 && !qb\.some/qb.length > 0 \&\& !qb.some/" \
  "F1-1"

mutate "notice keys on the suppression flag again" disallowed-entity-gate.js \
  "s/} else if \(out\.brand_unheld\) {/} else if (out.brand_gate_empty) {/" \
  "F1-6"

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

# ── UAC round 1 blockers (plan §1b) ──────────────────────────────────────────────────────

# 14. D9: the brand half of a compound level is discarded again (the exact 12041502 defect)
mutate "D9 compound-level brand discarded" output_exchange.js \
  "s/output\.output\.query_brands = statedBrands\(output\.output\.entities, _rawLevels\);/output.output.query_brands = statedBrands(output.output.entities, []);/" \
  "D9-1b"

# 15. D9: the brand harvest happens AFTER tier-token normalisation — the trap the plan names
#     ("once normalised to ['dealer'] the brand is unrecoverable"). Recomputing from the
#     normalised array must NOT silently yield [].
mutate "D9 brand harvested after normalisation" output_exchange.js \
  "s|^  output\.output\.access_levels = TIER_ORDER\.filter\(t => _set\.has\(t\)\);$|  output.output.access_levels = TIER_ORDER.filter(t => _set.has(t));\n  output.output.query_brands = statedBrands(output.output.entities, output.output.access_levels);|" \
  "D9-1b"

# 16. D9: routing stops preferring the recovered brand (cabana ask routed to sorento)
mutate "D9 routing ignores recovered brand" output_exchange.js \
  "s/let brand = \(Array\.isArray\(out\.query_brands\) && out\.query_brands\.length\) \? out\.query_brands\[0\] : null;/let brand = null;/" \
  "D9-1e"

# 17. D9: tier-gate stops consuming the parser brand (falls back to entity-only = the old bug)
mutate "D9 tier-gate ignores parser query_brands" tier-gate.js \
  "s/const query_brands = Array\.isArray\(parser\.query_brands\)/const query_brands = Array.isArray(parser.__never)/" \
  "D9-1c"

# 18. D11: pendingPick not passed -> the ask discards a resolved pick again (12041783)
mutate "D11 pendingPick not passed to needsTierAsk" tier-gate.js \
  "s/needsTierAsk\(parser\.domain_hint, tier_stated, entMap\.tiers, \{ pendingPick \}\)/needsTierAsk(parser.domain_hint, tier_stated, entMap.tiers)/" \
  "D11-1b"

# 19. D11: the continuation half dropped ("the august one" re-asks — 12041879)
mutate "D11 continuation no longer counts" output_exchange.js \
  "s/\(_ppResolvedPick \|\| \(_ppRosterPending && !_ppNamedNewScope\)\)/(_ppResolvedPick)/" \
  "D11-2a"

# 20. D11 OVER-CORRECTION: the new-scope bound removed -> a NEW query stops re-asking, silently
#     repealing D4. This is the mutation that proves D11 did not swallow TA-7.
mutate "D11 over-corrects and repeals D4" output_exchange.js \
  "s/(_ppRosterPending && !_ppNamedNewScope)/(_ppRosterPending)/" \
  "D11-3b"

# 21. D11: the tier ask's own roster starts counting as a pending roster -> an unanswered ask
#     can never re-fire and the turn answers at full entitlement instead
mutate "D11 tier_offer counted as a pending roster" output_exchange.js \
  "s/\(_ppPrevCtx !== 'tier_offer' && Array\.isArray\(prevState\.last_result_set\)/(Array.isArray(prevState.last_result_set)/" \
  "D11-8a"

# 22. D10: the brand-gate denial is removed -> files flow again (the 12041565 leak)
mutate "D10 fail-closed guard removed" promo-picker.js \
  "s/^if \(_brandGateClosed\) \{$/if (false) {/" \
  "D10-1a"

# 23. D10: guard kept but attachments left alone (suppress text only — the half-fix)
mutate "D10 suppresses text but not files" promo-picker.js \
  "s/^  env\.attachments      = \[\];$/  ;/" \
  "D10-1a"

# 24. D10: guard moved AFTER the shape check -> unrecognised envelope leaks
mutate "D10 guard no longer precedes the shape check" promo-picker.js \
  "s/return g\.isExecuted && g\.first\(\)\.json\.brand_gate_empty === true;/return false;/" \
  "D10-2"

# 25. D10 OVER-CORRECTION: closing on the tier-level Q23 notice too, which must still ANSWER
mutate "D10 over-corrects and eats the Q23 answer" promo-picker.js \
  "s/^if \(_brandGateClosed\) \{$/if (_brandGateClosed || _notice) {/" \
  "D10-4"

echo
echo "$((runs-fails))/$runs mutations caught"
exit $((fails > 0 ? 1 : 0))
