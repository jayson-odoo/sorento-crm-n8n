#!/usr/bin/env bash
#
# deploy.sh — backup-first deploy of workflow JSON into PROD n8n (run on prod).
#
# Pipeline: confirm -> backup prod -> credential remap -> PUT via n8n public API
#           -> (re)activate via API -> done.
# Uses the n8n REST API (PUT /workflows/{id} then /activate) instead of the CLI
# `import:workflow`. The API update path creates a proper workflow_history row,
# so activation works — CLI import does not, and leaves workflows unpublishable
# ("Version not found"). The API body is only {name,nodes,connections,settings};
# version/active/publish fields are never sent, so cross-instance version FKs
# can't break. Workflow `id` is matched in place, preserving executeWorkflow refs.
#
# Usage (run AFTER `git pull` on prod):
#   ./scripts/deploy.sh <file.json> [<file.json>...]   # deploy these files
#   ./scripts/deploy.sh --all                          # deploy every normalized file
#   ./scripts/deploy.sh --changed                      # files changed in last git pull
#   ./scripts/deploy.sh --preserve-active <files>      # re-publish flows active before
#   ./scripts/deploy.sh --activate <ID,ID> <files>     # also (re)activate these ids
#
# Required env:
#   N8N_API_KEY    n8n public API key (Settings -> n8n API). NO default.
# Env overrides:
#   N8N_API_BASE   API base URL                (default: http://localhost:5678/api/v1)
#   COMPOSE_DIR    dir with docker-compose.yml (default: repo parent)
#   N8N_SERVICE    editor service              (default: n8n-main)  [backup only]
#   PG_SERVICE     postgres service            (default: postgres)
#   PG_USER/PG_DB  for cred dump + active snap (default: n8n_user / n8n)
#   YES=1          skip interactive confirmations
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NORM_DIR="$REPO_ROOT/normalized-workflows"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$REPO_ROOT/.." && pwd)}"
N8N_SERVICE="${N8N_SERVICE:-n8n-main}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${PG_USER:-n8n_user}"
PG_DB="${PG_DB:-n8n}"
N8N_API_BASE="${N8N_API_BASE:-http://localhost:5678/api/v1}"
N8N_API_KEY="${N8N_API_KEY:-}"
BACKUP_DIR="$REPO_ROOT/backups"

# n8n API helpers. api_put: update workflow body; api_activate: publish.
api_call() { # METHOD URL [datafile] -> prints http_code; body in $API_RESP
  local method="$1" url="$2" data="${3:-}"
  local args=(-sS -m 60 -o "$API_RESP" -w '%{http_code}' -X "$method" "$url" -H "X-N8N-API-KEY: $N8N_API_KEY")
  [ -n "$data" ] && args+=(-H "Content-Type: application/json" --data @"$data")
  curl "${args[@]}"
}

confirm() { [ "${YES:-0}" = "1" ] && return 0; read -rp "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ]; }
# risky prompts (credential safety): non-interactive (CI) FAILS CLOSED unless FORCE=1.
confirm_risky() {
  if [ "${YES:-0}" = "1" ]; then [ "${FORCE:-0}" = "1" ]; return; fi
  read -rp "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ]
}

# ---- parse args -------------------------------------------------------------
ACTIVATE_IDS=""
PRESERVE_ACTIVE=0
CHANGED_USED=0
FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --activate)        ACTIVATE_IDS="$2"; shift 2;;
    --preserve-active) PRESERVE_ACTIVE=1; shift;;        # re-activate whatever was active before import
    --all)      while IFS= read -r f; do FILES+=("$f"); done < <(ls "$NORM_DIR"/*.json); shift;;
    --changed)  CHANGED_USED=1
                # diff base preference: explicit DEPLOY_DIFF_BASE (CI passes the push's
                # before-SHA) -> ORIG_HEAD (set by git pull) -> reflog HEAD@{1} -> HEAD~1.
                DIFF_BASE=""
                if [ -n "${DEPLOY_DIFF_BASE:-}" ] && git -C "$REPO_ROOT" rev-parse --verify -q "${DEPLOY_DIFF_BASE}^{commit}" >/dev/null; then
                  DIFF_BASE="$DEPLOY_DIFF_BASE"
                else
                  DIFF_BASE="$(git -C "$REPO_ROOT" rev-parse --verify -q ORIG_HEAD || git -C "$REPO_ROOT" rev-parse --verify -q 'HEAD@{1}' || git -C "$REPO_ROOT" rev-parse --verify -q 'HEAD~1')"
                fi
                echo ">> --changed diff base: ${DIFF_BASE:-<none>}"
                while IFS= read -r f; do [ -n "$f" ] && FILES+=("$NORM_DIR/$(basename "$f")"); done \
                   < <(git -C "$REPO_ROOT" diff --name-only "$DIFF_BASE" HEAD -- normalized-workflows/ 2>/dev/null | xargs -n1 basename 2>/dev/null); shift;;
    *)          FILES+=("$1"); shift;;
  esac
done

if [ ${#FILES[@]} -eq 0 ]; then
  if [ "$CHANGED_USED" = "1" ]; then
    echo ">> --changed matched no workflow files; nothing to deploy. exiting cleanly."; exit 0
  fi
  echo "!! no files to deploy. pass file paths, --all, or --changed." >&2; exit 1
fi

echo "==================== DEPLOY TO PROD ===================="
echo ">> compose dir : $COMPOSE_DIR"
echo ">> targets (${#FILES[@]}):"
for f in "${FILES[@]}"; do echo "     $f"; done
[ -n "$ACTIVATE_IDS" ] && echo ">> will activate: $ACTIVATE_IDS"
if [ -z "$N8N_API_KEY" ]; then
  echo "!! N8N_API_KEY not set — required for API deploy. Get one in n8n UI: Settings -> n8n API." >&2
  exit 1
fi
API_RESP="$(mktemp)"
confirm "Proceed?" || { echo "aborted."; exit 1; }

cd "$COMPOSE_DIR"

# ---- 1. backup prod ---------------------------------------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
echo; echo ">> [1/4] backing up ALL prod workflows ..."
docker compose exec -T "$N8N_SERVICE" sh -c 'rm -rf /tmp/prod-backup && mkdir -p /tmp/prod-backup'
docker compose exec -T "$N8N_SERVICE" n8n export:workflow --all --separate --pretty --output=/tmp/prod-backup
mkdir -p "$BACKUP_DIR"
docker compose cp "$N8N_SERVICE:/tmp/prod-backup/." "$BACKUP_DIR/prod-$STAMP/"
( cd "$BACKUP_DIR" && tar czf "prod-$STAMP.tgz" "prod-$STAMP" && rm -rf "prod-$STAMP" )
echo "   backup -> $BACKUP_DIR/prod-$STAMP.tgz"

# snapshot currently-active workflow ids (to restore after import if --preserve-active)
ACTIVE_BEFORE="$(docker compose exec -T "$PG_SERVICE" psql -U "$PG_USER" -d "$PG_DB" -t -A \
  -c 'SELECT id FROM workflow_entity WHERE active=true;' 2>/dev/null | tr -d '\r' | sed '/^$/d' || true)"
[ -n "$ACTIVE_BEFORE" ] && echo "   active on prod now: $(echo "$ACTIVE_BEFORE" | wc -l | tr -d ' ') workflow(s)"

# ---- 2. credential remap: resolve every node cred against PROD's live table -
# import:workflow never touches credentials_entity, so prod SECRETS are safe.
# What we fix is the node's cred REFERENCE (id+name) -> prod's id, matched by
# name+type. Dev-only names (local-*) translate via cred-aliases.json first.
echo; echo ">> [2/4] credential remap (resolve refs against prod credentials_entity) ..."
PROD_CREDS_FILE="$(mktemp)"
docker compose exec -T "$PG_SERVICE" psql -U "$PG_USER" -d "$PG_DB" -t -A -F'|' \
  -c 'SELECT id,name,type FROM credentials_entity;' > "$PROD_CREDS_FILE" 2>/dev/null || true
if [ ! -s "$PROD_CREDS_FILE" ]; then
  echo "   !! could not read prod credentials_entity (check PG_SERVICE/PG_USER/PG_DB)."
  confirm_risky "Import AS-IS with no remap (nodes may have dangling creds)?" \
    || { echo "aborted (backup kept). [CI fails closed here; set FORCE=1 to override]"; exit 1; }
  DEPLOY_FILES=("${FILES[@]}")
else
  echo "   prod has $(wc -l < "$PROD_CREDS_FILE" | tr -d ' ') credential(s)."
  ALIASES="${CRED_ALIASES:-$SCRIPT_DIR/cred-aliases.json}"
  [ -f "$ALIASES" ] || ALIASES="$SCRIPT_DIR/cred-aliases.example.json"
  echo "   aliases: $(basename "$ALIASES")"
  REMAP_DIR="$(mktemp -d)"
  if python3 "$SCRIPT_DIR/remap-creds.py" "$PROD_CREDS_FILE" "$ALIASES" "$REMAP_DIR" "${FILES[@]}"; then
    DEPLOY_FILES=()
    for f in "${FILES[@]}"; do DEPLOY_FILES+=("$REMAP_DIR/$(basename "$f")"); done
  else
    echo "   !! UNMAPPED credentials (see above) — those prod creds don't exist yet."
    confirm_risky "Import anyway (those nodes will be broken)?" \
      || { echo "aborted (backup kept). Create the prod creds or add aliases, then retry. [CI fails closed; FORCE=1 to override]"; exit 1; }
    DEPLOY_FILES=()
    for f in "${FILES[@]}"; do DEPLOY_FILES+=("$REMAP_DIR/$(basename "$f")"); done
  fi
fi
confirm "Continue to import?" || { echo "aborted (backup kept)."; exit 1; }

# ---- 3. update via API (PUT) -----------------------------------------------
# PUT /workflows/{id} with {name,nodes,connections,settings}. Creates a new
# workflow_history version in place. Per-file tolerant. Records id->file map.
echo; echo ">> [3/4] updating workflows via API ($N8N_API_BASE) ..."
IMPORT_FAILED=()
declare -A DEPLOYED_BY_ID=()
for f in "${DEPLOY_FILES[@]}"; do
  base="$(basename "$f")"
  wid="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('id',''))" "$f")"
  body="$(mktemp)"
  python3 - "$f" > "$body" <<'PY'
import json,sys
wf=json.load(open(sys.argv[1]))
print(json.dumps({"name":wf["name"],"nodes":wf["nodes"],
                  "connections":wf.get("connections",{}),"settings":wf.get("settings",{})}))
PY
  code="$(api_call PUT "$N8N_API_BASE/workflows/$wid" "$body")"
  if [ "$code" = "200" ]; then
    echo "   updated $base ($wid)"; DEPLOYED_BY_ID["$wid"]="$base"
  else
    echo "   !! FAILED ($code) $base ($wid): $(head -c 200 "$API_RESP")"
    IMPORT_FAILED+=("$base")
  fi
  rm -f "$body"
done
[ ${#IMPORT_FAILED[@]} -gt 0 ] && echo "   !! ${#IMPORT_FAILED[@]} update(s) failed: ${IMPORT_FAILED[*]}"

# ---- 4. (re)activate via API -----------------------------------------------
# Publish the new version for workflows that were active before (deployed ∩
# active-before) plus any explicit --activate ids. activate uses current state,
# so it republishes the just-PUT version. Untouched workflows keep their state.
ACT_SET=""
[ -n "$ACTIVATE_IDS" ] && ACT_SET="$(echo "$ACTIVATE_IDS" | tr ',' '\n')"
if [ "$PRESERVE_ACTIVE" = "1" ]; then
  inter="$(comm -12 <(echo "$ACTIVE_BEFORE" | sed '/^$/d' | sort -u) \
                    <(printf '%s\n' "${!DEPLOYED_BY_ID[@]}" | sed '/^$/d' | sort -u))"
  ACT_SET="$(printf '%s\n%s\n' "$ACT_SET" "$inter")"
fi
ACT_SET="$(echo "$ACT_SET" | sed '/^$/d' | sort -u)"
ACTIVATE_FAILED=()
if [ -n "$ACT_SET" ]; then
  echo; echo ">> [4/4] (re)activating $(echo "$ACT_SET" | wc -l | tr -d ' ') workflow(s) via API ..."
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    code="$(api_call POST "$N8N_API_BASE/workflows/$id/activate")"
    if [ "$code" = "200" ]; then echo "   activated $id"
    else echo "   !! FAILED to activate ($code) $id: $(head -c 160 "$API_RESP")"; ACTIVATE_FAILED+=("$id"); fi
  done <<< "$ACT_SET"
else
  echo; echo ">> [4/4] no activation requested (use --preserve-active or --activate)."
fi

echo
echo "DONE. Backup: $BACKUP_DIR/prod-$STAMP.tgz"
echo "Rollback:  extract that tgz; PUT the old bodies back via the same API."

RC=0
if [ "${IMPORT_FAILED:+x}" = "x" ] && [ ${#IMPORT_FAILED[@]} -gt 0 ]; then
  echo "!! deploy finished WITH UPDATE FAILURES: ${IMPORT_FAILED[*]}"; RC=1
fi
if [ "${ACTIVATE_FAILED:+x}" = "x" ] && [ ${#ACTIVATE_FAILED[@]} -gt 0 ]; then
  echo "!! activation FAILURES (flip these Active in UI): ${ACTIVATE_FAILED[*]}"; RC=1
fi
exit $RC
