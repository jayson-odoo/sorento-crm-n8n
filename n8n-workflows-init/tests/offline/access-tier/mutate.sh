#!/usr/bin/env bash
# ── access-tier fail-on-purpose gate (§0 S9 / LESSONS §61) ───────────────────────────────
# Each mutation breaks ONE mapper behaviour; the probe must go RED for it. A mutation that
# leaves the file byte-identical (stale anchor) is a HARD FAIL — the control that cannot fail
# is the recurring class this guard exists for (memory: green-that-cannot-fail).
set -uo pipefail
cd "$(dirname "$0")"
SRC=mapper.js
BAK=$(mktemp)
cp "$SRC" "$BAK"
restore() { cp "$BAK" "$SRC"; }
trap restore EXIT

fails=0; runs=0
mutate() { # $1=name $2=sed-expr $3=probe-line-regex that must go RED
  runs=$((runs+1))
  restore
  sed -i '' -E "$2" "$SRC"
  if cmp -s "$SRC" "$BAK"; then
    echo "🔴 $1: MUTATION WAS A NO-OP (stale anchor) — fix the sed"; fails=$((fails+1)); return
  fi
  out=$(node probe.js 2>&1)
  if echo "$out" | grep -q "✗ $3"; then
    echo "  ✓ $1 -> probe went red on the right assertion"
  else
    echo "🔴 $1: probe did NOT catch it (expected ✗ $3)"; echo "$out" | tail -3; fails=$((fails+1))
  fi
}

# 1. kill the end-user brandless parse -> P3/M2/R4 red
mutate "end-user parse deleted" \
  "s/if \(s === 'end user' \|\| s === 'enduser' \|\| s === 'end-user'\) return \{ brand: null, tier: 'end_user' \};/if (false) return null;/" \
  "P3"

# 2. brand-gate widen regression (the bug R5 caught for real during build)
mutate "brand_gate_empty widens again" \
  "s/\(brandGateEmpty \? \[\] : qb\.filter\(b => entMap\.brands\.includes\(b\)\)\)/qb.filter(b => entMap.brands.includes(b)).length ? qb : entMap.brands/" \
  "R5"

# 3. recompose stops honouring the brand filter -> R1/R3 red
mutate "brand filter ignored in recompose" \
  "s/if \(p\.brand && !allowBrands\.includes\(p\.brand\)\) continue;/;/" \
  "R1"

# 4. ask fires even when a tier was stated -> A3 red
mutate "stated-tier no longer suppresses ask" \
  "s/if \(Array\.isArray\(stated\) && stated\.length > 0\) return false;//" \
  "A3"

# 5. ask fires for single-tier contacts -> A2 red
mutate "single-tier contact asked anyway" \
  "s/\.length > 1;/.length >= 1;/" \
  "A2"

# 6. word boundary lost: 'dealership' matches -> S6 red
mutate "dealer substring match (dealership)" \
  "s/ \(dealer\|dealers\|pengedar\) /(dealer|dealers|pengedar)/" \
  "S6"

# 7. unknown level guessed as a brand+tier -> M4 red
mutate "unknown level invented" \
  "s/return m \? \{ brand: m\[1\], tier: m\[2\] \} : null;/return m ? { brand: m[1], tier: m[2] } : { brand: 'sorento', tier: 'dealer' };/" \
  "M4"

# 8. BLOCKER-4 regression: brand recovered ONLY from entities again -> B1/B3 red
mutate "compound-level brand recovery dropped" \
  "s/if \(p && p\.brand\) out\.add\(p\.brand\);/;/" \
  "B1"

# 9. BLOCKER-3 regression: pendingPick no longer suppresses the ask -> A6 red
mutate "pendingPick exemption removed" \
  "s/if \(opts && opts\.pendingPick === true\) return false;//" \
  "A6"

restore
echo
echo "$((runs-fails))/$runs mutations caught"
exit $((fails > 0 ? 1 : 0))
