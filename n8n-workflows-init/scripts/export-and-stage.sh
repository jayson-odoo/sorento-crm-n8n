#!/usr/bin/env bash
#
# export-and-stage.sh — Step 1+2 of the deploy pipeline (run on LOCAL/dev).
#
# Exports workflows from the running local n8n DB and copies each one over the
# matching file in normalized-workflows/ (matched by internal workflow `id`, not
# filename), so you can `git diff` to review what actually changed before deploy.
#
# Usage:
#   ./scripts/export-and-stage.sh                 # export & stage ALL workflows
#   ./scripts/export-and-stage.sh <ID> [<ID>...]  # only these workflow IDs
#
# Env overrides:
#   COMPOSE_DIR   dir containing docker-compose.yml   (default: repo parent)
#   N8N_SERVICE   editor service name                 (default: n8n-main)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"                  # n8n-workflows-init
NORM_DIR="$REPO_ROOT/normalized-workflows"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$REPO_ROOT/.." && pwd)}" # where docker-compose.yml lives
N8N_SERVICE="${N8N_SERVICE:-n8n-main}"
CONTAINER_TMP="/tmp/wf-export"
HOST_TMP="$(mktemp -d)"
trap 'rm -rf "$HOST_TMP"' EXIT

FILTER_IDS=("$@")
# bash 3.2 (macOS) treats "${arr[@]}" as unbound when empty under `set -u`
exp_ids() { [ ${#FILTER_IDS[@]} -gt 0 ] && printf '%s\n' "${FILTER_IDS[@]}"; }

echo ">> compose dir : $COMPOSE_DIR"
echo ">> service     : $N8N_SERVICE"
echo ">> staging into: $NORM_DIR"
[ ${#FILTER_IDS[@]} -gt 0 ] && echo ">> id filter   : ${FILTER_IDS[*]}" || echo ">> id filter   : (all)"

cd "$COMPOSE_DIR"

# 1. export from local n8n DB, one file per workflow, into a clean container dir
docker compose exec -T "$N8N_SERVICE" sh -c "rm -rf $CONTAINER_TMP && mkdir -p $CONTAINER_TMP"
docker compose exec -T "$N8N_SERVICE" n8n export:workflow --all --separate --pretty --output="$CONTAINER_TMP"

# 2. pull the exported files to a host temp dir
docker compose cp "$N8N_SERVICE:$CONTAINER_TMP/." "$HOST_TMP/"

# 3. match each export to its repo file by internal `id` and overwrite in place
python3 - "$NORM_DIR" "$HOST_TMP" $(exp_ids) <<'PY'
import json, os, sys, shutil

norm_dir, export_dir, *filter_ids = sys.argv[1:]
filter_ids = set(filter_ids)

# id -> repo filepath, from existing normalized-workflows
repo_by_id = {}
for fn in os.listdir(norm_dir):
    if not fn.endswith(".json"):
        continue
    p = os.path.join(norm_dir, fn)
    try:
        with open(p) as f:
            repo_by_id[json.load(f).get("id")] = p
    except Exception as e:
        print(f"!! skip unreadable repo file {fn}: {e}")

def slug(name):
    return "".join(c if c.isalnum() else "-" for c in name).strip("-").lower() or "unnamed"

staged, created = [], []
for fn in sorted(os.listdir(export_dir)):
    if not fn.endswith(".json"):
        continue
    with open(os.path.join(export_dir, fn)) as f:
        wf = json.load(f)
    wid, name = wf.get("id"), wf.get("name", "?")
    if filter_ids and wid not in filter_ids:
        continue
    body = json.dumps(wf, indent=2, ensure_ascii=False) + "\n"
    if wid in repo_by_id:
        with open(repo_by_id[wid], "w") as f:
            f.write(body)
        staged.append(f"{os.path.basename(repo_by_id[wid])}  (id={wid}, name={name})")
    else:
        dest = os.path.join(norm_dir, slug(name) + ".json")
        with open(dest, "w") as f:
            f.write(body)
        created.append(f"{os.path.basename(dest)}  (id={wid}, name={name})  [NEW]")

print(f"\n== staged {len(staged)} existing workflow(s) ==")
for s in staged:   print("  ~", s)
if created:
    print(f"\n== {len(created)} NEW workflow(s) written (no prior repo file) ==")
    for s in created: print("  +", s)
if filter_ids:
    missing = filter_ids - {json.load(open(os.path.join(export_dir, f)))["id"]
                            for f in os.listdir(export_dir) if f.endswith(".json")}
    if missing:
        print("\n!! requested IDs NOT found in export:", ", ".join(sorted(missing)))
PY

# 4. show the diff = your review gate
echo
echo ">> git status (review before committing):"
git -C "$REPO_ROOT" status --short -- normalized-workflows/ || true
echo
echo ">> Review with:  git -C \"$REPO_ROOT\" diff -- normalized-workflows/"
echo ">> Then commit:  git -C \"$REPO_ROOT\" add -A && git -C \"$REPO_ROOT\" commit -m 'deploy: <what changed>' && git -C \"$REPO_ROOT\" push"
