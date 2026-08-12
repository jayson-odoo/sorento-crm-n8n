#!/bin/bash
# mutate.sh — fail-on-purpose harness for human-intervened-timeout, with a mutation that CANNOT
# silently no-op.
#
# WHY (UAC §0 S9 + LESSONS §61b/§72). A fail-positive step mutates the code, expects the suite to
# go RED, and then scores the gate as a working instrument. If the substitution never applies the
# suite prints ALL PASS — indistinguishable from "the suite genuinely resisted the mutation". That
# exact failure has shipped twice in this repo (`dym-probe-before-offer`: sed matched nothing;
# `promo-picker`: a mangled path made every mutant crash and the crash output matched the red-grep).
#
# THE RULES, enforced below and non-negotiable:
#   1. the search string must occur EXACTLY N>0 times BEFORE substituting (literal, counted);
#   2. the file digest MUST have changed after substituting, AND the mutant must differ from the
#      original by `cmp` (§72's zero-byte-mutation hard fail);
#   3. the mutant must still be valid JS (`node --check`) — a syntax error goes red for the wrong
#      reason and would score as a detection;
#   4. abort loudly on any of the above and DO NOT run the suite. A suite result obtained without
#      all of them is VOID, not merely unconvincing.
#
# The tracked bodies are never edited: everything happens on a scratch copy that harness.js reads
# via OFFLINE_NODES_DIR.
#
# usage:
#   ./mutate.sh                                     run the whole battery (this is the gate)
#   ./mutate.sh <file> <search> <replace> <count>   run one ad-hoc mutant
set -u
cd "$(dirname "$0")" || exit 1
SUITE=harness.js

one_mutant() {
  local LABEL="$1" FILE="$2" SEARCH="$3" REPLACE="$4" WANT="$5"
  local SCRATCH; SCRATCH="$(mktemp -d)"
  cp nodes/*.js "$SCRATCH"/
  local T="$SCRATCH/$FILE"
  if [ ! -f "$T" ]; then
    echo "ABORT[$LABEL]: nodes/$FILE does not exist. available: $(ls nodes)"; rm -rf "$SCRATCH"; return 2
  fi

  # (1) literal occurrence count BEFORE.
  #
  # NOT `grep -Fo`. The reference implementation in dym-probe-before-offer/mutate.sh uses it, and it
  # is WRONG for any anchor spanning a newline: grep is line-based, so a two-line -F pattern is
  # treated as two alternatives and the count becomes "lines matching either half". Measured here on
  # the FP-GUESS anchor: reported 8, true count 1. That miscount aborts a valid mutant (annoying) —
  # but it can also report exactly N for an anchor that does not occur at all (dangerous), which is
  # the §61 "green that cannot fail" class inside the very guard built to prevent it. Count the
  # literal in Python, newlines included.
  local GOT; GOT=$(SEARCH="$SEARCH" python3 - "$T" <<'PY'
import os, pathlib, sys
print(pathlib.Path(sys.argv[1]).read_text().count(os.environ['SEARCH']))
PY
)
  if [ "$GOT" != "$WANT" ]; then
    echo "ABORT[$LABEL]: search string occurs $GOT times in $FILE, expected $WANT."
    echo "               The mutation would be a NO-OP and the suite result MEANINGLESS."
    rm -rf "$SCRATCH"; return 1
  fi

  local BEFORE AFTER
  BEFORE=$(shasum -a256 "$T" | cut -d' ' -f1)
  cp "$T" "$SCRATCH/orig.js"
  SEARCH="$SEARCH" REPLACE="$REPLACE" python3 - "$T" <<'PY'
import os, pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text().replace(os.environ['SEARCH'], os.environ['REPLACE']))
PY
  AFTER=$(shasum -a256 "$T" | cut -d' ' -f1)

  # (2) digest changed AND bytes differ — §72's zero-byte-mutation hard fail
  if [ "$BEFORE" = "$AFTER" ] || cmp -s "$T" "$SCRATCH/orig.js"; then
    echo "ABORT[$LABEL]: mutant is byte-identical to the original. Suite NOT run."
    rm -rf "$SCRATCH"; return 1
  fi
  # (3) still valid JS, so a red result means a failed assertion and not a parse error
  if ! node --check "$T" >/dev/null 2>&1; then
    echo "ABORT[$LABEL]: mutation produced invalid JS. Suite NOT run (a syntax error would score as"
    echo "               a detection for the wrong reason)."
    rm -rf "$SCRATCH"; return 1
  fi

  # (4) the suite is EXPECTED TO FAIL
  local OUT RC
  OUT=$(OFFLINE_NODES_DIR="$SCRATCH" node "$SUITE" 2>&1); RC=$?
  rm -rf "$SCRATCH"
  if [ "$RC" -eq 0 ]; then
    echo "SURVIVED[$LABEL]  ${FILE}: '${SEARCH}' -> '${REPLACE}'  (digest ${BEFORE:0:8}->${AFTER:0:8})"
    echo "  The suite did NOT react. Either an assertion is missing, or the fixtures cannot"
    echo "  discriminate the two states (LESSONS §66 — a surviving mutant is a claim about your"
    echo "  FIXTURES first and your code second). Do not record this as coverage."
    return 1
  fi
  local NRED; NRED=$(printf '%s\n' "$OUT" | grep -c '^FAIL ')
  # A CRASH IS NOT A DETECTION. This is the §72 trap in its exact original form: promo-picker's
  # mutate.sh scored 26/26 while every mutant merely crashed the probe and the "did it go red?" grep
  # matched the crash output. A non-zero exit with zero FAIL lines means the suite blew up before it
  # could compare anything, so it tells you nothing about whether any assertion discriminates the two
  # states. Report it as its own outcome and fail the battery.
  if [ "$NRED" -eq 0 ]; then
    echo "CRASHED[$LABEL]   ${FILE}: '${SEARCH}' -> '${REPLACE}'  (exit ${RC}, ZERO FAIL lines)"
    echo "  The suite threw instead of asserting. That is NOT a detection (LESSONS §72). Add an"
    echo "  assertion that survives the exception — wrap the affected call in noThrow()/throws() so"
    echo "  the mutant produces a comparison, not a stack trace."
    printf '%s\n' "$OUT" | tail -4 | sed 's/^/    /'
    return 1
  fi
  echo "CAUGHT[$LABEL]    ${FILE}: '${SEARCH}' -> '${REPLACE}'  (${NRED} assertion(s) went RED)"
  printf '%s\n' "$OUT" | grep '^FAIL ' | head -3 | sed 's/^/    /'
  return 0
}

if [ "$#" -ge 4 ]; then
  one_mutant "adhoc" "$1" "$2" "$3" "$4"; exit $?
fi

# ── RESYNC BEFORE TRUSTING (§72's SECOND guard; reviewer instrument-gap 1) ─────────────────────────
# This script copies ./nodes/*.js to scratch and mutates those. Nothing here checked those bytes against
# what is DEPLOYED, so a standalone run printed a confident 24/24 ✅ against possibly-stale code — §72's
# first guard implemented, its second one delegated to assert-built.py C4 BY COMMENT ONLY, with nothing
# enforcing the ordering. Now enforced: C4 runs first and a mismatch aborts.
# Set HT_SKIP_RESYNC=1 only when deliberately offline (and know the result certifies nothing deployed).
if [ "${HT_SKIP_RESYNC:-0}" != "1" ]; then
  if [ -z "${N8N_API_BASE:-}" ] || [ -z "${N8N_API_KEY:-}" ]; then
    echo "ABORT: N8N_API_BASE/N8N_API_KEY unset, so the deployed bodies cannot be checked."
    echo "       A mutation score against unverified bytes is VOID (§72). Source the repo .env, or set"
    echo "       HT_SKIP_RESYNC=1 to run knowingly-unverified."
    exit 2
  fi
  echo "── resync: are ./nodes/*.js the bytes that are deployed? (assert-built.py C4) ──"
  RESYNC=$(python3 assert-built.py 2>&1 | grep -E '^(ok|FAIL) +C4 ')
  printf '%s\n' "$RESYNC" | sed 's/^/   /'
  if printf '%s\n' "$RESYNC" | grep -q '^FAIL'; then
    echo "ABORT: a deployed Code body differs from its tracked source. Every mutant below would be"
    echo "       measured against code nobody is running (the stale-body class that made promo-picker's"
    echo "       26/26 meaningless). Fix the drift, then re-run."
    exit 1
  fi
  if [ -z "$RESYNC" ]; then
    echo "ABORT: C4 produced no output at all — cannot distinguish 'in sync' from 'check did not run'."
    exit 2
  fi
fi

echo "════ fail-on-purpose battery — every mutant below MUST be caught ════"
FAILED=0
run() { one_mutant "$@" || FAILED=$((FAILED+1)); }

# ── S1 ht-gate ────────────────────────────────────────────────────────────────────────────────────
# HT-FP1: invert the allowlist predicate → HT-5/HT-6 must go RED.
run FP1 ht-gate.js \
  "ht_pilot.indexOf(contact_id) !== -1" \
  "ht_pilot.indexOf(contact_id) === -1" 1
# HT-FP1b: drop the allowlist entirely (act on everyone always).
run FP1b ht-gate.js \
  "const ht_allowlisted = !ht_pilot_active || ht_pilot.indexOf(contact_id) !== -1;" \
  "const ht_allowlisted = true;" 1
# HT-FP3: hardcode the rendered minutes → the timeout-120 renderer assertions must go RED.
run FP3 ht-gate.js \
  "const ht_timeout_min = Math.max(1, Math.round(ht_timeout_sec / 60));" \
  "const ht_timeout_min = 5;" 1
# kill-switch opened up (accepts anything truthy) → HT-4's "true is not on" assertion must go RED.
run FP-KILL ht-gate.js \
  "return v !== null && v !== undefined && String(v).trim() === '1';" \
  "return !!v;" 1
# the source re-check removed → HT-3's gate-level assertion must go RED.
run FP-SRC ht-gate.js \
  "else if (source !== 'User') ht_skip_reason = 'source-not-user';" \
  "else if (false) ht_skip_reason = 'source-not-user';" 1
# the timeout floor removed → the 30s-clamp assertion must go RED.
run FP-FLOOR ht-gate.js \
  "return Math.max(FLOOR_TIMEOUT_SEC, Math.floor(n));" \
  "return Math.floor(n);" 1

# HT-2's whole point: invert first-vs-refresh → a second message would re-notice.
run FP-FIRST ht-arm.js \
  "ht_is_first: missing || unparseable," \
  "ht_is_first: !(missing || unparseable)," 1
# treat an unparseable stamp as a refresh → the notice would be suppressed forever for that contact.
run FP-CORRUPT ht-arm.js \
  "const unparseable = !missing && !Number.isFinite(prev_ms);" \
  "const unparseable = false;" 1

# ── rev5 finding #1: a FAILED config read must not resolve to "act on everyone" ───────────────────
# ⚠️ NOT A MUTANT — DO NOT RE-ADD. `const ht_pilot = rPilot.ok ? parsePilot(rPilot.value) : []` ->
# `parsePilot(rPilot.value)` was tried and SURVIVED, and it is genuinely EQUIVALENT: on a failed read
# `rPilot.value` is `undefined` and `parsePilot(undefined)` already returns `[]`. The ternary is
# self-documenting, not load-bearing. What actually stops the fail-open is the PRECEDENCE check below
# (FP-READPREC) — the skip fires before the allowlist is consulted at all. Recording this so the next
# person does not read the ternary as the fix. (Same for the census twin.)
# drop the precedence so a read failure falls through to the allowlist check.
run FP-READPREC ht-gate.js \
  "if (ht_config_read_failures.length) ht_skip_reason = 'config-read-failure';" \
  "if (false) ht_skip_reason = 'config-read-failure';" 1
# stop distinguishing a missing property (propertyName drift) from a present null.
run FP-READPROP ht-gate.js \
  "  if (!Object.prototype.hasOwnProperty.call(f.json, prop)) {" \
  "  if (false) {" 1
# the same in the sweeper — here the precedence IS the per-row skip_reason.
run FP-SWEEPREADPREC ht-sweep-census.js \
  "  if (ht_config_read_failures.length) skip_reason = 'config-read-failure';" \
  "  if (false) skip_reason = 'config-read-failure';" 1
# THE ASYMMETRY, in the direction that would break it: treat an absent VALUE as a read failure. That
# would make the announce flip (empty pilot list = everyone) impossible — the fix must not overshoot.
run FP-FLIPBROKEN ht-gate.js \
  "const ht_config_read_failures = [rEnabled, rTimeout, rPilot].filter((r) => !r.ok).map((r) => r.why);" \
  "const ht_config_read_failures = [rEnabled, rTimeout, rPilot].filter((r) => !r.ok || r.value === null).map((r) => r.why || 'null');" 1

# ── rev5 finding #6: the kill-switch must gate the KEYS scan, not just the census ─────────────────
run FP-ARMED ht-sweep-armed.js \
  "const ht_armed = ht_enabled;" \
  "const ht_armed = true;" 1
run FP-ARMEDREAD ht-sweep-armed.js \
  "const ht_enabled = r.ok && r.value !== null && r.value !== undefined && String(r.value).trim() === '1';" \
  "const ht_enabled = String(r.value).trim() !== '0';" 1

# ── S2 census / fanout ────────────────────────────────────────────────────────────────────────────
# expiry comparison inverted → HT-8/HT-10/HT-13 must go RED.
run FP-EXP ht-sweep-census.js \
  "const expired = score_ms <= cutoff_ms;" \
  "const expired = score_ms > cutoff_ms;" 1
# the sweeper's kill-switch dropped → HT-11 must go RED.
run FP-SWEEPKILL ht-sweep-census.js \
  "if (!ht_enabled) skip_reason = 'kill-switch-off';" \
  "if (false) skip_reason = 'kill-switch-off';" 1
# the sweeper's allowlist dropped → HT-12 must go RED (this is the one that would sweep real
# customers on the day the feature is switched on for a pilot).
run FP-SWEEPPILOT ht-sweep-census.js \
  "else if (ht_pilot_active && ht_pilot.indexOf(contact_id) === -1) skip_reason = 'not-in-pilot-allowlist';" \
  "else if (false) skip_reason = 'not-in-pilot-allowlist';" 1
# rev5 finding #5: an epoch-0 stamp back in the unparseable branch -> never reaped, immortal flag.
run FP-EPOCH0 ht-sweep-census.js \
  "  if (!Number.isFinite(score_ms)) {" \
  "  if (!Number.isFinite(score_ms) || score_ms <= 0) {" 1
# rev5 finding #5b: Number('') === 0, so an absent re-read is reported as a real epoch-0 measurement.
run FP-RECHECKZERO ht-classify.js \
  "  const rescore = rescoreAbsent ? NaN : Number(String(rescoreRaw).trim());" \
  "  const rescore = Number(String(rescoreRaw == null ? '' : rescoreRaw).trim());" 1
# an unparseable stamp treated as ancient → the junk-keyspace assertion must go RED.
run FP-JUNK ht-sweep-census.js \
  "expired: false, eligible: false, skip_reason: 'unparseable-stamp'," \
  "expired: true, eligible: true, skip_reason: null," 1
# the timeout stops being read at runtime → HT-13 must go RED.
run FP-BAKED ht-sweep-census.js \
  "const cutoff_ms = NOW - ht_timeout_sec * 1000;" \
  "const cutoff_ms = NOW - 300 * 1000;" 1
# the fan-out ignores eligibility → every skip case must go RED.
run FP-FANOUT ht-sweep-fanout.js \
  ".filter((x) => x && x.eligible === true)" \
  ".filter((x) => !!x)" 1

# ── S2 ht-carry-contact (added for F-RECHECK) ─────────────────────────────────────────────────────
# The defect itself was a workflow PARAMETER, so its primary gate is assert-built.py C9 (which has its
# own three mutants, including a faithful reconstruction of the pre-fix graph). These cover the CODE
# half: the contract C9 checks against.
#
# ⚠️ NOT A MUTANT — DELIBERATELY ABSENT, DO NOT RE-ADD. `contact_id,` -> `contact_id: fetchedId ||
# contact_id,` was tried and SURVIVED. Investigating rather than papering over it (LESSONS §66: a
# surviving mutant is a claim about your FIXTURES first and your code second) showed it is a genuinely
# EQUIVALENT mutant, and the reason matters: the mis-attribution guard three lines above THROWS unless
# `fetchedId === contact_id`, so on every path that returns, the two expressions are provably the same
# value. No fixture can distinguish them, because a fixture that could would abort first.
# It is only equivalent WHILE that guard stands — so the invariant it establishes
# (`contact_id === String(contact.id)` on every returned row) is now pinned as an assertion in
# harness.js, and FP-CARRYPAIR below is the mutant that proves the guard itself can go red. Two
# instruments instead of one misleading one.
# (FP-CARRYPAIR retired: the `fetchedId && fetchedId !== contact_id` guard it targeted was REWRITTEN in
#  rev3 — it was the reviewer's R2 fail-open. Identity pairing replaced it, so the refusal that matters
#  now is "a lookup returned a contact nobody asked for". The §0-S9 count guard flagged the stale anchor
#  rather than scoring a silent no-op as a detection — second time it has earned its keep here.)
# drop the unrequested-contact refusal -> a lookup for a stranger derives a redis DELETE key.
run FP-CARRYSTRANGER ht-carry-contact.js \
  "  if (!wanted.has(id)) {" \
  "  if (false) {" 1
# nest the contact under a different key -> ht-classify can no longer read custom_fields.
run FP-CARRYNEST ht-carry-contact.js \
  "      contact," \
  "      contact: undefined," 1
# R2: restore the fail-OPEN guard (demand a contradiction instead of an identification) -> an id-less
# payload would pair and reach clear-and-notify.
run FP-CARRYOPEN ht-carry-contact.js \
  "  if (!id) { unidentifiable++; continue; }" \
  "  if (!id) { byId.set(String(candidates[0].json.contact_id).trim(), j); continue; }" 1
# R3: treat a missing lookup as if the contact were found -> a not-found contact would be authorised.
run FP-CARRYMISS ht-carry-contact.js \
  "      lookup_missing: contact === null," \
  "      lookup_missing: false," 1
# R3: refuse a short lookup list instead of reaping -> one deleted contact wedges every future tick.
run FP-CARRYWEDGE ht-carry-contact.js \
  "return candidates.map((c, i) => {" \
  "if (byId.size !== candidates.length) throw new Error('index misalignment');
return candidates.map((c, i) => {" 1
# rev5 finding #2: restore the stranger THROW -> one merged/deleted contact wedges the tick forever.
run FP-STRANGERWEDGE ht-carry-contact.js \
  "    strangers.push(id);
    byId.delete(id);" \
  "    throw new Error('lookup returned contact ' + id + ', which no candidate asked for');" 1
# ⚠️ `byId.delete(id)` -> `/* kept */` was tried and SURVIVED — correctly. `wanted` is exactly the set of
# candidate ids, so a stranger left in the map can never be looked up by any candidate; the delete is
# hygiene, not the guard. The observable half is the RECORD, which is what makes a contact merge visible
# in runData instead of being inferred from a silent reap:
run FP-STRANGERQUIET ht-carry-contact.js \
  "    strangers.push(id);" \
  "    /* not recorded */" 1

# ── the FIXTURE LAYER itself (tester follow-up, rev4) ─────────────────────────────────────────────
# An unknown tag falling through to the default silently ran the egress-authorising outcome. That is
# §61 one level below the code — a typo in a case is indistinguishable from the case passing.
run FP-TAGFALLTHROUGH standin-ht-findcontact.js \
  "if (tag !== '' && KNOWN_TAGS.indexOf(tag) === -1) {" \
  "if (false) {" 1
# the hard-miss tag stops emitting zero items -> HT-18 (forget-unknown / the permanent-wedge gate) goes
# back to being unreachable, and a notfound contact would be authorised for a flag write and a send.
run FP-TAGNOTFOUND standin-ht-findcontact.js \
  "if (tag === 'notfound') return;" \
  "if (false) return;" 1
# 'notfound' quietly dropped from the known list -> using it would throw instead of exercising HT-18.
run FP-TAGKNOWN standin-ht-findcontact.js \
  "const KNOWN_TAGS = ['flag=false', 'flag=null', 'noflag', 'nocf', 'notfound'];" \
  "const KNOWN_TAGS = ['flag=false', 'flag=null', 'noflag', 'nocf'];" 1

# ── S2 ht-carry-clear (added rev3 for reviewer R1) ────────────────────────────────────────────────
# R1's own defect is a PARAMETER, gated by assert-built.py C9b (which has its own mutants including a
# reconstruction of the rev2 graph, plus a proof that plain C9 is blind to it). These cover the code half.
#
# read contact_id from the STAND-IN's extra field first -> works on the build, breaks on live, which is
# the exact shape that made R1 invisible.
# read ONLY the stand-in's extra field -> resolves on the build, undefined on live, which is exactly the
# shape that made R1 invisible. (An earlier version merely REORDERED the two and SURVIVED — correctly:
# either ordering still falls back, so the orderings are equivalent. The hazard is losing the fallback,
# not choosing it second. LESSONS §66 — the survivor was a claim about the mutant, not about the code.)
run FP-CLEARSRC ht-carry-clear.js \
  "  const raw = j.contactId !== undefined && j.contactId !== null ? j.contactId : j.contact_id;" \
  "  const raw = j.contact_id;" 1
# drop the authorisation re-check -> an unauthorised row could reach a real WhatsApp send.
run FP-CLEARAUTH ht-carry-clear.js \
  "  if (d.action !== 'clear-and-notify') {" \
  "  if (false) {" 1
# allow an unidentified update through -> empty recipient, empty body, on a live send path.
run FP-CLEAREMPTY ht-carry-clear.js \
  "  if (!contact_id) {" \
  "  if (false) {" 1

# ── S2 classify ───────────────────────────────────────────────────────────────────────────────────
# HT-FP2: drop the flag-still-true check → HT-9 (the ghost-message gate) must go RED.
run FP2 ht-classify.js \
  "if (f.flag) {" \
  "if (true) {" 1
# the malformed-payload throw softened → HT-FP4 must go RED (this is the vacuity guard itself).
run FP-VACUOUS ht-classify.js \
  "if (!Array.isArray(cf)) {" \
  "if (false) {" 1
# the race guard removed → the mid-tick-reply assertion must go RED.
run FP-RACE ht-classify.js \
  "} else if (rescore > cutoff_ms) {" \
  "} else if (false) {" 1
# an unknown flag encoding guessed instead of refused.
run FP-GUESS ht-classify.js \
  "  throw new Error(
    \`ht-classify: is_human_intervened has an unrecognised encoding" \
  "  return { present: true, raw, flag: true };
  throw new Error(
    \`ht-classify: is_human_intervened has an unrecognised encoding" 1
# the wrong-object read (§63): take the candidates off $input instead of by name. $input here is
# the Redis `get`'s fresh item, so this is the shape that looks fine in review and throws in prod.
run FP-WRONGOBJ ht-classify.js \
  "const items = nodeAll('ht-carry-contact');" \
  "const items = \$input.all();" 1
# (FP-ATTR retired: the mis-attribution guard moved from ht-classify to ht-carry-contact with the
#  F-RECHECK fix — deliberately upstream of the first redis-key derivation. FP-CARRYPAIR is its
#  replacement. The §0-S9 count guard is what flagged the stale anchor instead of silently scoring a
#  no-op as a detection.)

# ── S3 config ─────────────────────────────────────────────────────────────────────────────────────
# HT-15: the floor clamp removed → 0 would reach redis.
run FP-CLAMP ht-config-apply.js \
  "if (!Number.isFinite(minutes) || minutes <= 0) {" \
  "if (!Number.isFinite(minutes)) {" 1
# the kill-switch written with a spelling ht-gate does not accept → the round-trip must go RED.
run FP-ROUNDTRIP ht-config-apply.js \
  "enabled_value: enabled ? '1' : '0'," \
  "enabled_value: enabled ? 'true' : 'false'," 1
# minutes→seconds conversion dropped → the round-trip cutoff assertion must go RED.
run FP-UNITS ht-config-apply.js \
  "  timeout_sec = minutes * 60;" \
  "  timeout_sec = minutes;" 1

# rev5 finding #3: fractional minutes -> the notice misstates the timeout by up to ~50%.
run FP-FRACMIN ht-config-apply.js \
  "let minutes = Number.isFinite(rawMinutesNum) ? Math.round(rawMinutesNum) : rawMinutesNum;" \
  "let minutes = rawMinutesNum;" 1
# rev5 finding #4: an unrecognised kill value writes OFF silently -> a dropdown relabel disables the
# feature with a clean echo and nothing to look at.
run FP-KILLSILENT ht-config-apply.js \
  "} else if (KILL_ON.indexOf(killStr) === -1 && KILL_OFF.indexOf(killStr) === -1) {" \
  "} else if (false) {" 1

# ── R8 + ht-config-echo (reviewer instrument-gap 2: a promoted node with zero assertions) ──────────
# un-pluralise -> "1 minutes" reaches a customer at the reachable 1-minute setting.
run FP-PLURAL ht-gate.js \
  "minute\${min === 1 ? '' : 's'}" \
  "minutes" 1
# the read-back honesty mechanism silenced -> the form would report success for a write that did not land.
run FP-ECHOMISMATCH ht-config-echo.js \
  "if (readback.timeout_sec !== w.timeout_sec) mismatches.push" \
  "if (false) mismatches.push" 1
# the echo composed from INTENT instead of the read-back -> it repeats what the user typed regardless.
run FP-ECHOINTENT ht-config-echo.js \
  "  \`Timeout: \${minutes === null ? '(not set)' : minutes + ' minute(s)'}  [\${readback.timeout_sec} s]\`," \
  "  \`Timeout: \${w.timeout_min} minute(s)  [\${w.timeout_sec} s]\`," 1

echo "═════════════════════════════════════════════════════════════════════"
if [ "$FAILED" -ne 0 ]; then
  echo "RESULT: ❌ $FAILED mutant(s) survived or aborted. The gate is NOT proven."
  exit 1
fi
echo "RESULT: ✅ every mutant was caught — the suite is an instrument, not decoration."
echo "NOTE (LESSONS §72): a 100% score is a smell, not a triumph, so here is the honest history of"
echo "     this number rather than a claim about it. On the first full run 19 of 20 mutants were"
echo "     caught and FP-GUESS ABORTED — not because the code resisted it, but because the counter"
echo "     itself was broken: the reference \`grep -Fo\` is line-based and reported 8 occurrences of a"
echo "     multi-line anchor that occurs once. The guard refusing to run was the only reason that"
echo "     surfaced; the fix is the Python literal count above."
echo "     SECOND ROUND (F-RECHECK fix): FP-CARRYID SURVIVED, and FP-ATTR aborted on a stale anchor."
echo "     Both were real. The survivor turned out to be an EQUIVALENT mutant — provably so, because a"
echo "     guard three lines up throws on the only input that could distinguish it — so it was removed"
echo "     with the reasoning written down and replaced by a pinned INVARIANT plus a mutant on the"
echo "     guard itself. The abort was a stale anchor from moving that guard between nodes, which the"
echo "     S9 count guard caught instead of scoring as a detection. Treat 24/24 as 'no gap found by"
echo "     these 24 probes', not as 'no gap' — and note the biggest defect this feature has had"
echo "     (F-RECHECK) was invisible to ALL of them, because it lived in a workflow PARAMETER. That is"
echo "     assert-built.py C9's job, and C9 has its own three mutants including the real pre-fix graph."
exit 0
