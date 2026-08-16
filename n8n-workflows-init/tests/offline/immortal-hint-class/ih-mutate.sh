#!/usr/bin/env bash
# §IH-FP — fail-on-purpose for C1 / C2 / M2, under UAC §0 S9's three-part procedure:
#   (1) the search string must occur EXACTLY N>0 times BEFORE substituting,
#   (2) the file digest must have CHANGED after,
#   (3) abort WITHOUT running the suite on either failure.
# A suite result obtained without both assertions is VOID, not merely unconvincing (LESSONS §61b —
# the fifth instance of that class was a mutation harness that matched nothing and printed ALL PASS).
#
# Each step declares the EXACT expected red-set. "The suite went red somewhere" is not evidence that
# the mutation was caught by the assertion that is supposed to catch it (LESSONS §63 — sound
# assertions pointed at the wrong object).
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
MUT="$SP/oe.mut.js"
RC=0

score () {
  local expect_red="$1"
  local got; got=$(node "$SP/ih-probe.js" "$MUT" 2>&1 | sed -n 's/^REDKEYS: *//p' | tr -s ' ' | sed 's/ $//')
  local want; want=$(echo "$expect_red" | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')
  got=$(echo "$got" | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')
  echo "    RED fixtures : ${got:-<none>}"
  echo "    expected     : ${want:-<none>}"
  if [ "$got" = "$want" ]; then
    echo "    OK  instrument confirmed"
  else
    echo "    XX  MISMATCH — the named assertion is not the instrument for this mutation"
    RC=1
  fi
}

run_mut () {
  local label="$1" find="$2" repl="$3" expect_n="$4" expect_red="$5"
  cp "$SP/oe.after.js" "$MUT"
  # NOTE: `grep -Fo` splits a MULTI-LINE pattern on newlines and counts each line separately,
  # which over-counts and aborted a valid mutation on the first run of this harness. Count the
  # literal substring in Python instead — the S9 gate has to be right about its own arithmetic.
  local n; n=$(python3 -c 'import sys,pathlib; print(pathlib.Path(sys.argv[1]).read_text().count(sys.argv[2]))' "$MUT" "$find")
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

echo "baseline (unmutated): $(node "$SP/ih-probe.js" "$SP/oe.after.js" | tail -1)"
echo

# ── §IH-FP-1 — revert the axis fallback to the private `__${hint}` island ──────────────────────
run_mut "IH-FP-1  revert _ceAxisFor's fallback to \`__\${hint}\`" \
  '  const known = (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint];
  if (known) return known;
  if (hint) _ceUnknownHints.add(hint);
  return DOMAIN_SUBJECT_AXIS[domain] || '"'"'unscoped_scope'"'"';' \
  '  return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;' \
  1 "IH-3 IH-3-CTRL"

# ── §IH-FP-2 — drop ONLY the DOMAIN_SUBJECT_AXIS step, keep the shared axis. ───────────────────
# The plan's own rejected option (§2.2 "a single shared 'misc' axis with no domain step"). MEASURED:
# it reddens IH-3 and NOTHING ELSE — IH-4a/IH-4b carry only RECOGNISED hints, so the fallback is
# never reached there. That asymmetry IS the argument: the shared-axis-only variant is INERT on the
# exact transcript that motivated the change, which is the "test green, stay broken" shape.
run_mut "IH-FP-2  drop the DOMAIN_SUBJECT_AXIS step, keep 'unscoped_scope'" \
  "  return DOMAIN_SUBJECT_AXIS[domain] || 'unscoped_scope';" \
  "  return 'unscoped_scope';" \
  1 "IH-3"

# ── §IH-FP-3 — restore B2′'s permanent `ordinal` exemption (the M2 defect) ─────────────────────
run_mut "IH-FP-3  restore \`if (e.ordinal !== undefined) return false;\`" \
  '  if (_ceRefPickedKeys.has(_ceKey(e))) return false;   // M2: reference-position pick MINTED THIS TURN' \
  '  if (e.ordinal !== undefined) return false;' \
  1 "IH-4a"

# ── §IH-FP-3b — remove the exemption ENTIRELY (never record the this-turn pick). ───────────────
# The other direction. Without this step, IH-FP-3 alone cannot tell "made this-turn-only" from
# "deleted", because both make IH-4a green.
run_mut "IH-FP-3b  never record the this-turn pick (exemption removed entirely)" \
  '    _ceRefPickedKeys.add(_ceKey({ hint, canonical_code: row.product || raw, raw }));' \
  '    void 0;' \
  1 "IH-4b"

# ── §IH-FP-4 — restore the domain-name writer at the `sep === -1` arm ──────────────────────────
# MEASURED: IH-3 does NOT redden here and must not be listed. IH-3 carries no reference_positions,
# so the writer never runs on that turn — its poison is INJECTED, not minted. Listing IH-3 as an
# expected red (the first draft did) would have been a wrong-object claim about which case guards C2.
run_mut "IH-FP-4  restore \`hint = output.output.domain_hint || 'promotion'\`" \
  "      hint = _c2Hint(row.entity_type, output.output.domain_hint);                                 // C2" \
  "      hint = output.output.domain_hint || 'promotion';" \
  1 "IH-4b IH-6 IH-8b IH-9"

# ── §IH-FP-5 — break the promotion no-regression path ──────────────────────────────────────────
run_mut "IH-FP-5  DOMAIN_SUBJECT_HINT.promotion -> 'product'" \
  "    order: 'order', promotion: 'promotion'," \
  "    order: 'order', promotion: 'product'," \
  1 "IH-8a"

# ── §IH-FP-6 — widen the narrow guard so junk entity_types are accepted ────────────────────────
run_mut "IH-FP-6  accept any row.entity_type (drop KNOWN_ENTITY_HINTS)" \
  "    if (h && KNOWN_ENTITY_HINTS.has(h)) return h;" \
  "    if (h) return h;" \
  1 "IH-9"

# ── §IH-FP-F3 — remove the dormant-entity sweep (the tester pass-2 F3 defect) ──────────────────
# MUST redden IH-3-CTRL (dormant carried entity, reuse turn) and MUST NOT redden IH-3 (there the
# executor's prior-filter classifies the entity on its way to evicting it, so the diagnostic fires
# either way). That asymmetry IS the proof that IH-3-CTRL is the F3 gate and IH-3 never was.
run_mut "IH-FP-F3  remove the dormant-carried-entity sweep from the diagnostic" \
  '  for (const e of output.output.entities) _ceAxisFor(e, output.output.domain_hint);' \
  '  void 0;' \
  1 "IH-3-CTRL"

# ── negative control: a semantically inert edit must redden NOTHING ────────────────────────────
run_mut "IH-FP-CTRL  negative control (comment-only edit)" \
  "// C1 residual-class diagnostic." \
  "// C1 residual-class diagnostic (negative control marker)." \
  1 ""

rm -f "$MUT"
echo
if [ "$RC" = "0" ]; then echo "ALL MUTATIONS BEHAVED AS DECLARED"; else echo "MUTATION HARNESS RC=$RC"; fi
exit $RC
