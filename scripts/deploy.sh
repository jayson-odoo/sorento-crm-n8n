#!/usr/bin/env bash
#
# deploy.sh — backup-first import of workflow JSON into PROD n8n (run on prod).
#
# Pipeline: confirm -> backup prod -> credential-id sanity report -> import by id
#           -> optional activate -> restart -> tail logs.
# Import upserts by internal `id`, so matching IDs update in place and keep all
# cross-workflow executeWorkflow references intact.
#
# Usage (run AFTER `git pull` on prod):
#   ./scripts/deploy.sh <file.json> [<file.json>...]   # deploy these files
#   ./scripts/deploy.sh --all                          # deploy every normalized file
#   ./scripts/deploy.sh --changed                      # files changed in last git pull
#   ./scripts/deploy.sh --activate <ID,ID> <file...>   # also (re)activate these ids
#
# Env overrides:
#   COMPOSE_DIR    dir with docker-compose.yml   (default: repo parent)
#   N8N_SERVICE    editor service               (default: n8n-main)
#   WORKER_SERVICE worker service               (default: n8n-worker)
#   PG_SERVICE     postgres service             (default: postgres)
#   PG_USER/PG_DB  for cred check               (default: n8n_user / n8n)
#   YES=1          skip interactive confirmations
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NORM_DIR="$REPO_ROOT/normalized-workflows"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$REPO_ROOT/.." && pwd)}"
N8N_SERVICE="${N8N_SERVICE:-n8n-main}"
WORKER_SERVICE="${WORKER_SERVICE:-n8n-worker}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${PG_USER:-n8n_user}"
PG_DB="${PG_DB:-n8n}"
BACKUP_DIR="$REPO_ROOT/backups"

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
                # diff base: ORIG_HEAD (set by `git pull`) else reflog HEAD@{1}
                DIFF_BASE="$(git -C "$REPO_ROOT" rev-parse --verify -q ORIG_HEAD || git -C "$REPO_ROOT" rev-parse --verify -q 'HEAD@{1}')"
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
confirm "Proceed?" || { echo "aborted."; exit 1; }

cd "$COMPOSE_DIR"

# ---- 1. backup prod ---------------------------------------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
echo; echo ">> [1/5] backing up ALL prod workflows ..."
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
echo; echo ">> [2/5] credential remap (resolve refs against prod credentials_entity) ..."
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

# ---- 3. import (upsert by id) ----------------------------------------------
echo; echo ">> [3/5] importing ..."
for f in "${DEPLOY_FILES[@]}"; do
  base="$(basename "$f")"
  docker compose cp "$f" "$N8N_SERVICE:/tmp/$base"
  docker compose exec -T "$N8N_SERVICE" n8n import:workflow --input="/tmp/$base"
  echo "   imported $base"
done

# ---- 4. activate ------------------------------------------------------------
# Build the set to activate: explicit --activate ids, plus (if --preserve-active)
# every id that was active before import. Restores prod's live state after upsert.
ACT_SET=""
[ -n "$ACTIVATE_IDS" ] && ACT_SET="$(echo "$ACTIVATE_IDS" | tr ',' '\n')"
[ "$PRESERVE_ACTIVE" = "1" ] && ACT_SET="$(printf '%s\n%s\n' "$ACT_SET" "$ACTIVE_BEFORE")"
ACT_SET="$(echo "$ACT_SET" | sed '/^$/d' | sort -u)"
if [ -n "$ACT_SET" ]; then
  echo; echo ">> [4/5] (re)activating $(echo "$ACT_SET" | wc -l | tr -d ' ') workflow(s) ..."
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    docker compose exec -T "$N8N_SERVICE" n8n update:workflow --id="$id" --active=true >/dev/null \
      && echo "   activated $id" || echo "   !! failed to activate $id"
  done <<< "$ACT_SET"
else
  echo; echo ">> [4/5] no activation requested (use --preserve-active or --activate); imported state applies."
fi

# ---- 5. restart + tail ------------------------------------------------------
echo; echo ">> [5/5] restarting $N8N_SERVICE $WORKER_SERVICE ..."
docker compose restart "$N8N_SERVICE" "$WORKER_SERVICE"
echo
echo "DONE. Backup: $BACKUP_DIR/prod-$STAMP.tgz"
echo "Rollback:  extract that tgz and re-run import on the old files."
if [ "${YES:-0}" = "1" ]; then
  echo "Recent logs:"; docker compose logs --tail=60 "$N8N_SERVICE"   # non-interactive (CI): no follow
else
  echo "Tailing logs (Ctrl-C to stop):"; docker compose logs -f --tail=40 "$N8N_SERVICE"
fi
