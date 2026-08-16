#!/usr/bin/env bash
# §5.1 static assertion gate for the CRM auth-unification programme.
#
#   ./assert-auth.sh <workflowId> [<before.json>] [--exclude NODE]...
#
# Asserts G1-G4 per node over EVERY httpRequest node pointing at the CRM host,
# and (when a before.json backup is supplied) G5 no-rider + G6 no-collateral.
#
# --exclude NODE  (repeatable) omits a node from G1-G4, G5 and G5b. Use it for a
# node deliberately held back to a later tranche, so the tranche can print a
# meaningful PASS instead of a FAIL that must be read past. The exclusion is
# DATA, in the recorded invocation -- never a paragraph in a diff note, because
# prose exclusions do not survive into the next tranche. Excluded nodes are
# always listed back explicitly, and still appear in the residual-key line.
#
# READ-ONLY. Uses REST GET only.
#   REST GET does NOT redact credentials -- it returns {id,name} per binding.
#   MCP get_workflow_details is the one that omits them (plan §2 CORRECTION 2).
#   The hazard is that PUT ALWAYS AUTO-PUBLISHES -- there is no draft-only PUT.
#   (Corrected 2026-07-21; the earlier "PUT wipes credentials" note here was
#   disproven in T0. See LESSONS 55.)
#
# Exit 0 = pass, 1 = fail.

set -euo pipefail

CRED_ID="mNsZWyU82NYV58k2"
CRED_NAME="crm-n8n-auth"
CRM_HOST='fe-sorento\.foundryx\.my'

WF=""; BEFORE=""; EXCLUDES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --exclude) EXCLUDES+=("${2:?--exclude needs a node name}"); shift 2 ;;
    --exclude=*) EXCLUDES+=("${1#*=}"); shift ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) if [ -z "$WF" ]; then WF="$1"; elif [ -z "$BEFORE" ]; then BEFORE="$1";
       else echo "unexpected arg: $1" >&2; exit 2; fi; shift ;;
  esac
done
[ -n "$WF" ] || { echo "usage: assert-auth.sh <workflowId> [before.json] [--exclude NODE]..." >&2; exit 2; }

# DEFECT-1 FIX (2026-07-22): printf with no args emitted one empty line, so an
# omitted --exclude produced [""] -- the gate reported one unnamed exclusion on a
# tranche that excluded nothing, and that phantom had to be carried in every
# pre-declared expected-output block. Build the array explicitly instead.
if [ "${#EXCLUDES[@]}" -eq 0 ]; then
  EXCL_JSON='[]'
else
  EXCL_JSON="$(printf '%s\n' "${EXCLUDES[@]}" | jq -R . | jq -s .)"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
set -a; . "$REPO_ROOT/.env"; set +a

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
AFTER="$TMP/after.json"

curl -sf -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_BASE/workflows/$WF" -o "$AFTER"

echo "== $(jq -r .name "$AFTER") ($WF)"
echo "   versionId=$(jq -r .versionId "$AFTER")  activeVersionId=$(jq -r .activeVersionId "$AFTER")"
[ "$(jq -r .versionId "$AFTER")" = "$(jq -r .activeVersionId "$AFTER")" ] \
  && echo "   draft == active (published)" \
  || echo "   !! UNPUBLISHED DRAFT -- assertions below describe the DRAFT, not what executes"

FAIL=0

if [ "$(echo "$EXCL_JSON" | jq 'length')" -gt 0 ]; then
  echo "   EXCLUDED from G1-G4/G5/G5b (deliberate, held to a later tranche):"
  echo "$EXCL_JSON" | jq -r '.[] | "     - \(.)"'
fi

# ---- G1-G4: the four-part per-node gate --------------------------------------
echo
echo "-- G1-G4 (per node: authentication / genericAuthType / credential / no x-api-key)"
G14="$(jq -r --arg cid "$CRED_ID" --arg cname "$CRED_NAME" --arg host "$CRM_HOST" --argjson excl "$EXCL_JSON" '
  .nodes[]
  | select(.type=="n8n-nodes-base.httpRequest")
  | select((.parameters.url//"")|test($host))
  | . as $node | select(($excl | index($node.name)) == null)
  | { n: .name,
      G1: (.parameters.authentication  == "genericCredentialType"),
      G2: (.parameters.genericAuthType == "httpHeaderAuth"),
      G3: ((.credentials.httpHeaderAuth.id//"") == $cid
           and (.credentials.httpHeaderAuth.name//"") == $cname),
      G4: (([ (.parameters.headerParameters.parameters//[])[]
              | select((.name//""|ascii_downcase) == "x-api-key") ] | length) == 0) }
  | select((.G1 and .G2 and .G3 and .G4) | not)
  | "   FAIL \(.n)  G1=\(.G1) G2=\(.G2) G3=\(.G3) G4=\(.G4)"' "$AFTER")"

TOTAL="$(jq -r --arg host "$CRM_HOST" --argjson excl "$EXCL_JSON" '[.nodes[]|select(.type=="n8n-nodes-base.httpRequest")|select((.parameters.url//"")|test($host))|. as $nd|select(($excl|index($nd.name))==null)]|length' "$AFTER")"
if [ -n "$G14" ]; then echo "$G14"; FAIL=1; else echo "   PASS -- all $TOTAL CRM nodes satisfy G1-G4"; fi

# ---- G5/G6: no rider, no collateral (needs the pre-change backup) ------------
if [ -n "$BEFORE" ]; then
  echo
  echo "-- G5 no-rider (only authentication / genericAuthType / headerParameters changed)"
  G5="$(jq -n -r --slurpfile b "$BEFORE" --slurpfile a "$AFTER" --argjson excl "$EXCL_JSON" '
    ($b[0].nodes | map({key:.name, value:.}) | from_entries) as $B
    | ($a[0].nodes | map({key:.name, value:.}) | from_entries) as $A
    | [ $A | keys[] | select($B[.] != null) | . as $k0 | select(($excl|index($k0)) == null)
        | . as $k
        | ( ($A[$k].parameters | del(.authentication, .genericAuthType, .headerParameters)) as $ap
          | ($B[$k].parameters | del(.authentication, .genericAuthType, .headerParameters)) as $bp
          | ( [ $ap != $bp,
                ($A[$k].onError      != $B[$k].onError),
                ($A[$k].retryOnFail  != $B[$k].retryOnFail),
                ($A[$k].position     != $B[$k].position),
                ($A[$k].id           != $B[$k].id),
                ($A[$k].type         != $B[$k].type),
                ($A[$k].typeVersion  != $B[$k].typeVersion),
                ($A[$k].disabled     != $B[$k].disabled) ] | any )
            as $changed
          | select($changed) | "   RIDER \($k)" ) ]
    | .[]')" || G5_ERR=1
  # DEFECT-2 FIX (2026-07-22): this jq previously ended `2>/dev/null || true`, so a
  # jq FAILURE produced empty output and was reported as PASS -- the gate could not
  # tell "nothing changed" from "the check never ran" (see [[green-that-cannot-fail]]).
  # Now: jq errors fail loudly, and we print the comparison population so a vacuous
  # pass over zero nodes is visible rather than reassuring.
  G5_POP="$(jq -n --slurpfile b "$BEFORE" --slurpfile a "$AFTER" --argjson excl "$EXCL_JSON" '
    ($b[0].nodes|map(.name)) as $bn | ($a[0].nodes|map(.name)) as $an
    | [ $an[] | select(. as $x | $bn|index($x)) | select(. as $x | ($excl|index($x))==null) ] | length' 2>/dev/null)" \
    || { G5_ERR=1; G5_POP=0; }
  G5_POP="${G5_POP:-0}"
  if [ "${G5_ERR:-0}" -eq 1 ]; then
    echo "   !! G5 CHECK DID NOT RUN (jq error) -- this is a FAILURE, not a pass"; FAIL=1
  elif [ "$G5_POP" -eq 0 ]; then
    echo "   !! G5 compared 0 nodes -- vacuous, treat as FAILURE"; FAIL=1
  elif [ -n "$G5" ]; then echo "$G5"; FAIL=1
  else echo "   PASS -- no out-of-scope key changed on any of $G5_POP compared nodes"; fi

  echo
  echo "-- G5b headerParameters: only the x-api-key entry removed"
  G5B="$(jq -n -r --slurpfile b "$BEFORE" --slurpfile a "$AFTER" --argjson excl "$EXCL_JSON" '
    ($b[0].nodes | map({key:.name, value:.}) | from_entries) as $B
    | ($a[0].nodes | map({key:.name, value:.}) | from_entries) as $A
    | [ $A | keys[] | select($B[.] != null) | . as $k | select(($excl|index($k)) == null)
        | (($B[$k].parameters.headerParameters.parameters//[])
           | map(select((.name//""|ascii_downcase) != "x-api-key"))) as $expect
        | (($A[$k].parameters.headerParameters.parameters//[])) as $actual
        | select($expect != $actual)
        | "   HEADER-DRIFT \($k): expected \($expect|tojson) got \($actual|tojson)" ]
    | .[]')" || G5B_ERR=1
  if [ "${G5B_ERR:-0}" -eq 1 ]; then
    echo "   !! G5b CHECK DID NOT RUN (jq error) -- this is a FAILURE, not a pass"; FAIL=1
  elif [ "$G5_POP" -eq 0 ]; then
    echo "   !! G5b compared 0 nodes -- vacuous, treat as FAILURE"; FAIL=1
  elif [ -n "$G5B" ]; then echo "$G5B"; FAIL=1
  else echo "   PASS -- non-x-api-key headers preserved verbatim across $G5_POP nodes"; fi

  echo
  echo "-- G6 no-collateral (node set, connections)"
  NB="$(jq -r '[.nodes[].name]|sort|@json' "$BEFORE")"
  NA="$(jq -r '[.nodes[].name]|sort|@json' "$AFTER")"
  [ "$NB" = "$NA" ] && echo "   PASS -- node-name set identical" \
                    || { echo "   FAIL -- node set changed"; FAIL=1; }
  CB="$(jq -S -c .connections "$BEFORE")"
  CA="$(jq -S -c .connections "$AFTER")"
  [ "$CB" = "$CA" ] && echo "   PASS -- connections byte-identical" \
                    || { echo "   FAIL -- connections changed"; FAIL=1; }
fi

# ---- G7 input: residual literal keys anywhere in this workflow ---------------
echo
RESID="$(jq -r --argjson excl "$EXCL_JSON" '
  [ .nodes[]
    | select([(.parameters.headerParameters.parameters//[])[]|select((.name//""|ascii_downcase)=="x-api-key")]|length>0)
    | . as $nd
    | $nd.name + (if ($excl|index($nd.name)) != null then " (excluded, expected)" else " (UNEXPECTED)" end) ]
  | join(", ")' "$AFTER")"
[ -z "$RESID" ] && echo "-- residual hardcoded x-api-key in this workflow: NONE" \
                || echo "-- residual hardcoded x-api-key in this workflow: $RESID"
# An UNEXPECTED residual is a genuine miss (D4 skipped). An excluded one is by design.
if echo "$RESID" | grep -q "(UNEXPECTED)"; then
  echo "   !! residual key on a node that was NOT excluded -- D4 was skipped there"
  FAIL=1
fi

echo
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAIL"
