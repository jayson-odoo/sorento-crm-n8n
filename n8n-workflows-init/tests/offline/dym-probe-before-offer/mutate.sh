#!/bin/bash
# mutate.sh — fail-on-purpose harness with a MUTATION THAT CANNOT SILENTLY NO-OP.
#
# WHY THIS EXISTS. A fail-positive run mutates the code, expects the suite to go RED, and
# scores the gate as a working instrument. If the substitution never applies, the suite
# prints ALL PASS — which is indistinguishable from "the suite genuinely resisted the
# mutation". The mutation harness then becomes itself an uninstrumented instrument.
# This happened here: the tester targeted `return (hb - ha);` while the source reads
# `return hb - ha;` (no parens), sed matched nothing, and the suite printed ALL PASS.
# Fifth instance of the "green that cannot fail" class in this repo (LESSONS §61).
#
# THE RULE, enforced below and non-negotiable for any fail-positive step:
#   1. assert the search string occurs EXACTLY N>0 times BEFORE substituting;
#   2. assert the file DIGEST CHANGED after substituting;
#   3. abort loudly on either failure — never fall through to running the suite.
# A suite result is only admissible as evidence if both assertions passed.
#
# ⚠️ "GATE IS BLIND" IS RELATIVE TO THE SUITE YOU AIMED AT — READ BEFORE FILING ONE.
# This script can only tell you that *the suite you passed* did not react. A suite that STUBS the
# mutated node cannot see the mutation at all, and will report blindness that does not exist.
#   Concrete case in this directory: `ccs-harness.js` stubs `dym-transform-partial`'s OUTPUT, so it
#   gates the RENDERER (compile-current-state), not the lane detection. Mutating lane detection in
#   dym-transform-partial.js and aiming ccs-harness.js at it prints GATE IS BLIND every time — the
#   stub means the mutated code never runs. That mutation belongs against `harness.js`, which
#   executes dym-transform for real. This cost one false alarm and very nearly a second.
# ⚠️ `parity.js` IS NOT A mutate.sh TARGET. It reads bodies from the EXPORT (by design, so it
# asserts what is PUBLISHED), not from the working copies in this directory — so mutating a file
# here can never move it. Its invariants each carry their own INTERNAL negative control that
# corrupts the source in memory; run `node parity.js` and read the `[control]` lines instead.
#
# Rule of thumb: mutate a node's logic -> aim at the suite that EXECUTES that node; mutate a
# renderer -> aim at the suite that executes the renderer. Grep the suite for `stub(`/`nodeStub(`
# on the node you are mutating; if it is stubbed, that suite is the wrong target by construction.
# BEFORE FILING A BLINDNESS REPORT: re-run the same mutation against EVERY other suite here
# (harness.js, byteid.js, ccs-harness.js). It is only a real blind spot if NONE of them go red.
#
# usage: ./mutate.sh <file> <literal-search> <literal-replace> <expected-occurrences> <suite.js>
# The suite is EXPECTED TO FAIL. Exit 0 means "mutation applied AND the suite went red"
# (the gate works). Exit 1 means the mutation was a no-op, or that suite did not react — see the
# warning above before concluding the latter.
set -u
cd "$(dirname "$0")" || exit 1

FILE="${1:?file}"; SEARCH="${2:?search}"; REPLACE="${3:?replace}"; WANT="${4:?expected occurrences}"; SUITE="${5:?suite}"

# 🔴 F-STALE (2026-08-08): node bodies now live in export/ and the suites read them from there.
# mutate.sh must NEVER edit the export — it is the artifact under audit, and a corrupted export
# makes node-source.js abort on the sha gate (correctly, but uselessly). So: stage a SCRATCH COPY
# of the export, mutate that, and redirect the suite to it via OFFLINE_NODES_DIR.
EXPORT_NODES="$(cd "$(dirname "$0")/../../../export/clone-sorento-consume-main-TEST/nodes" && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
cp "$EXPORT_NODES"/*.js "$SCRATCH"/ 2>/dev/null
if [ ! -f "$SCRATCH/$FILE" ]; then
  echo "ABORT: $FILE is not an exported clone node — mutate.sh targets published bodies only."
  echo "       available: $(cd "$SCRATCH" && ls *.js | tr '\n' ' ')"
  exit 2
fi
FILE="$SCRATCH/$FILE"
export OFFLINE_NODES_DIR="$SCRATCH"

[ -f "$FILE" ] || { echo "ABORT: no such file: $FILE"; exit 1; }

# (1) occurrence count BEFORE — literal, not regex (-F), counting every occurrence (-o).
GOT=$(grep -Fo -- "$SEARCH" "$FILE" | wc -l | tr -d ' ')
echo "occurrences before : $GOT (expected $WANT)"
if [ "$GOT" != "$WANT" ]; then
  echo "ABORT: search string occurs $GOT times, expected $WANT."
  echo "       The mutation would be a NO-OP and the suite result would be MEANINGLESS."
  echo "       Fix the search string against the real source — do not run the suite."
  exit 1
fi

BEFORE=$(shasum -a256 "$FILE" | cut -d' ' -f1)
cp "$FILE" "$FILE.mutbak"
restore() { mv -f "$FILE.mutbak" "$FILE"; }
trap restore EXIT

python3 - "$FILE" "$SEARCH" "$REPLACE" <<'PY'
import sys, pathlib
f, s, r = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(f); p.write_text(p.read_text().replace(s, r))
PY

# (2) digest MUST have changed.
AFTER=$(shasum -a256 "$FILE" | cut -d' ' -f1)
echo "digest before      : ${BEFORE:0:12}"
echo "digest after       : ${AFTER:0:12}"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "ABORT: digest unchanged — the substitution did not apply. Suite NOT run."
  exit 1
fi
node --check "$FILE" || { echo "ABORT: mutation produced invalid JS. Suite NOT run."; exit 1; }

# (3) the suite is expected to FAIL.
echo "--- running $SUITE against the mutated body (expected: RED) ---"
node "$SUITE"; RC=$?
echo "--------------------------------------------------------------"
if [ "$RC" -eq 0 ]; then
  echo "RESULT: ❌ $SUITE DID NOT REACT — mutation applied (digest changed) but $SUITE still PASSED."
  echo "        This is NOT yet a blind spot. $SUITE may STUB the node you mutated, in which case"
  echo "        the mutated code never ran. Check:  grep -n \"stub(\\|nodeStub(\" $SUITE"
  echo "        Re-run this mutation against the OTHER suites before filing a blindness report:"
  for s in *.js; do case "$s" in *harness*.js|byteid.js) [ "$s" = "$SUITE" ] || echo "          ./mutate.sh $FILE <search> <replace> $WANT $s";; esac; done
  echo "        It is a real blind spot ONLY if none of them go red."
  exit 1
fi
echo "RESULT: ✅ gate works — mutation applied and $SUITE went RED (exit $RC)."
exit 0
