#!/usr/bin/env bash
#
# reactivate-from-backup.sh — re-activate every workflow that was active in a
# given backup snapshot, via the n8n public API. Recovery tool for when prod's
# active set got clobbered (e.g. failed CLI imports flipping workflows inactive).
#
# Reads the workflow JSON files inside a deploy.sh backup tgz, and for each with
# "active": true, calls POST /workflows/{id}/activate on prod.
#
# Usage:
#   N8N_API_KEY=... ./scripts/reactivate-from-backup.sh <backup.tgz>
#   N8N_API_KEY=... ./scripts/reactivate-from-backup.sh            # auto: earliest backup
#
# Env: N8N_API_BASE (default http://localhost:5678/api/v1), N8N_API_KEY (required)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups"
N8N_API_BASE="${N8N_API_BASE:-http://localhost:5678/api/v1}"
N8N_API_KEY="${N8N_API_KEY:-}"

[ -n "$N8N_API_KEY" ] || { echo "!! N8N_API_KEY required" >&2; exit 1; }

TGZ="${1:-}"
if [ -z "$TGZ" ]; then
  TGZ="$(ls -tr "$BACKUP_DIR"/*.tgz 2>/dev/null | head -1)"   # earliest = most pristine
fi
[ -f "$TGZ" ] || { echo "!! backup tgz not found: ${TGZ:-<none>}" >&2; exit 1; }
echo ">> reactivating from backup: $TGZ"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar xzf "$TGZ" -C "$WORK"
DIR="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | head -1)"

RESP="$(mktemp)"
ok=0; fail=0; skipped=0
for f in "$DIR"/*.json; do
  read -r id active name < <(python3 -c "
import json,sys
w=json.load(open(sys.argv[1]))
print(w.get('id',''), w.get('active'), w.get('name','')[:40])" "$f")
  if [ "$active" != "True" ]; then skipped=$((skipped+1)); continue; fi
  code="$(curl -sS -m 30 -o "$RESP" -w '%{http_code}' -X POST \
    "$N8N_API_BASE/workflows/$id/activate" -H "X-N8N-API-KEY: $N8N_API_KEY")"
  if [ "$code" = "200" ]; then echo "   activated $id ($name)"; ok=$((ok+1))
  else echo "   !! FAILED ($code) $id ($name): $(head -c 160 "$RESP")"; fail=$((fail+1)); fi
done
echo ">> done: $ok activated, $fail failed, $skipped were inactive in backup."
[ "$fail" -eq 0 ]
