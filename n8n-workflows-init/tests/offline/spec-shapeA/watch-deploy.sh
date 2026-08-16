#!/usr/bin/env bash
# Polls the live CRM (via the zz-crm-probe webhook) until the shape-B contract appears.
# Detector: POST with require:{stock:true} — pre-deploy Pydantic drops the unknown field
# (no `predicate` key in the response); post-deploy the response carries `predicate`.
# Read-only. Exits 0 on detection, 1 on timeout.
set -u
WEBHOOK='https://automate-sorento.foundryx.my/webhook/zz-crm-probe-shapeA-x7q2m'
DIR="$(cd "$(dirname "$0")" && pwd)"
for i in $(seq 1 60); do
  RES=$(curl -sS -m 30 -X POST "$WEBHOOK" -H 'content-type: application/json' -d '{
    "qs": "contact_id=437264483&space_id=364817",
    "payload": {"query":"deploy detector","match_mode":"and","tokens":["flurbish"],
      "allowed_entity_types":["category"],"access_levels":[],"domain":"master_products",
      "fallback_to_all_types":true,"limit":5,"free_terms":["flurbish"],
      "require":{"stock":true}}
  }' 2>/dev/null)
  if printf '%s' "$RES" | grep -q '"predicate"'; then
    echo "DEPLOY DETECTED at attempt $i ($(date))"
    printf '%s' "$RES" > "$DIR/deploy-detector-first-response.json"
    exit 0
  fi
  echo "attempt $i: not deployed yet ($(date))"
  sleep 60
done
echo "TIMEOUT after 60 attempts"
exit 1
