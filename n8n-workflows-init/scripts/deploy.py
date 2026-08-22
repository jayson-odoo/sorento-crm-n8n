#!/usr/bin/env python3
"""
deploy.py — the ONLY sanctioned write path from export/<slug>/ into a live n8n
workflow. Step 5 of plans/test-pyramid-and-git-deploy.md ("git-first deploy").

Supersedes deploy.sh (docker/localhost, deleted normalized-workflows/ target —
kept only for its backup-first idea). This talks straight to the same n8n
instance the export/ tree was pulled from (no cross-instance credential
remap — see gate (g) below), and is a git-status + test + freshness gate in
front of a single `PUT /workflows/<id>`.

GATES (fail-closed, in order — first failure stops the run and exits 1):
  (a) git clean under export/<slug>/ and tests/           [--allow-dirty overrides, loudly]
  (b) `npm test` (REQUIRE_FULL_COVERAGE=1) exits 0
  (c) freshness: own-id deploy -> export/<slug>'s versionId must match live's
      versionId (export-workflows.py --verify semantics, for this one id);
      retarget (--to != the export's own id) -> the TARGET must have no
      unpublished draft (versionId == activeVersionId), so we never clobber
      one. Either way this is a single GET against n8n — read-only.
  (d) target safety: refuse a hardcoded PROTECTED live id without
      --i-know-this-is-live, and refuse the TEST clone
      (txiPzSxy3Pclsz6v — someone else's active build) without
      --target-override.
  (e) backup: GET the target's full current body -> tests/backups/, before
      anything else touches it.
  (f) assemble (via assemble.py) + build the PUT body: ONLY
      {name, nodes, connections, settings} — see NODE IDS / NAME / SETTINGS
      below for what is kept, dropped, or renamed and why.
  (g) credentials: passed through UNCHANGED. See CREDENTIALS below.
  (h) diff summary (added/removed/changed node names, jsCode sha deltas) vs
      the target's current body, then `--yes` or an interactive `y`.
  (i) PUT /api/v1/workflows/<id>. Only reached if NOT --dry-run and gate (h)
      was confirmed. Own-id deploys re-run export-workflows.py + --verify
      afterwards; a rollback command is always printed.

--dry-run performs (a)-(h) — including the real npm test run and the real
backup GET+write (both read-only / local, never a workflow write) — prints
the exact PUT body size + sha256 + the diff summary, and STOPS before (i).
This is the ONLY mode this script has ever been exercised in; see the task
report for why.

NODE IDS: passed through from the export UNCHANGED, never remapped to the
target's ids, even when retargeting (e.g. spine export -> clone id). Reasons,
checked against this repo's own data, not assumed:
  1. `connections` in workflow.json is keyed entirely by node NAME
     (verified: `wf["connections"]["Aggregate"] == {"main": [[{"node":
     "tier-gate", ...}]]}`) — node id plays no role in wiring.
  2. LESSONS #58(c) confirms `$('x')` / `setNodeParameter` resolve by node
     NAME too ("clone<->live node ids diverge for some nodes... targets by
     nodeName (unique)").
  3. Neither export-workflows.py nor the prior deploy.sh ever remap node
     ids — both pass the `nodes` array through untouched.
  4. n8n node ids only need to be unique WITHIN one workflow row, not
     globally, so a source id colliding with a target id across two
     different workflows is not a hazard.
  So: no id remap step exists in this script. (The one thing this does NOT
  cover: if a target has its own `pinData` keyed by node id rather than
  name, an id swap could orphan it — we never send pinData in the PUT body
  and n8n preserves what's already stored when a key is omitted, so this is
  believed inert, but it is unverified against a real PUT.)

NAME: the PUT body's `name` is always the TARGET's current live name (fetched
fresh in gate (c)/(e)), never the source export's own `name`. This is a
single rule that covers both cases asked for: retargeting never renames
someone else's clone, and an own-id deploy can't silently drift the name via
a stale export either.

SETTINGS: `binaryMode` and `timeSavedMode` are stripped before PUT — LESSONS
#55: the public `workflowSettings` schema is narrower than storage and 400s
on those two keys; omitting is lossless because settings is merged, not
replaced.

CREDENTIALS: passed through UNCHANGED (no cred-aliases.json / remap-creds.py
step). Those scripts exist for deploy.sh's use case — copying a workflow from
a LOCAL dev n8n instance into PROD, i.e. two different `credentials_entity`
tables where the ids genuinely don't match. This script never crosses an
instance boundary: `export/` was pulled from, and `--to` always targets, the
same `.env` N8N_API_BASE (automate-sorento.foundryx.my). A credential id
valid on the source workflow is already valid on the target, so remapping
would be solving a problem that doesn't exist here.

🚫 THIS SCRIPT NEVER EXECUTES A PUT DURING DEVELOPMENT/TESTING OF ITSELF.
Every invocation used to build and verify it was `--dry-run`.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent                  # n8n-workflows-init/
REPO_ROOT = ROOT.parent
EXPORT = ROOT / "export"
BACKUP_DIR = ROOT / "tests" / "backups"

# --- reuse export-workflows.py's auth + fetch, and assemble.py's fold-in ---
def _load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

ew = _load_module("export_workflows", "export-workflows.py")
asm = _load_module("assemble", "assemble.py")

# Never PUT to these without --i-know-this-is-live (CLAUDE.md "Key IDs").
PROTECTED = {
    "9qVyfUxmRQqrpGRMDLRuz": "LIVE spine sorento-consume-main",
    "XTODTw-dJcV0uRdC056hG": "LIVE parser sub-semantic-parser",
    "aoydkG1dbItXR5jXFEQsP": "LIVE sub-sendmsg",
    "rrYXzE61gCNUck_zmXe-G": "LIVE sub-human-intervention",
    "UrETd-jm46tFj3Xw7w8vL": "LIVE sub-save-message-redis",
}
# Never PUT here without --target-override (another person's active build).
CLONE_GUARD_ID = "txiPzSxy3Pclsz6v"
CLONE_GUARD_NAME = "clone-sorento-consume-main-TEST (someone else's active build)"

SETTINGS_STRIP_KEYS = {"binaryMode", "timeSavedMode"}  # LESSONS #55


def utc_stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def hr(title):
    print(f"\n--- {title} " + "-" * max(1, 60 - len(title)))


# ------------------------------------------------------------------ gate a --
def gate_a(slug, allow_dirty):
    export_path = str(EXPORT / slug)
    tests_path = str(ROOT / "tests")
    res = subprocess.run(
        ["git", "status", "--porcelain", "--", export_path, tests_path],
        cwd=REPO_ROOT, capture_output=True, text=True)
    dirty = res.stdout.strip()
    if not dirty:
        return True, f"(a) OK — git clean under export/{slug}/ and tests/"
    if allow_dirty:
        lines = "\n".join(f"        {l}" for l in dirty.splitlines())
        return True, (f"(a) ⚠️  DIRTY under export/{slug}/ or tests/ — proceeding anyway "
                       f"(--allow-dirty). UNCOMMITTED CHANGES ARE ABOUT TO BE DEPLOYED:\n{lines}")
    lines = "\n".join(f"        {l}" for l in dirty.splitlines())
    return False, (f"(a) FAIL — uncommitted changes under export/{slug}/ or tests/ "
                    f"(commit first, or pass --allow-dirty):\n{lines}")


# ------------------------------------------------------------------ gate b --
def gate_b():
    env = os.environ.copy()
    env["REQUIRE_FULL_COVERAGE"] = "1"
    res = subprocess.run(["npm", "test"], cwd=REPO_ROOT, capture_output=True,
                          text=True, env=env)
    out = res.stdout + res.stderr
    import re
    tests = sum(int(n) for n in re.findall(r"# tests (\d+)", out))
    passed = sum(int(n) for n in re.findall(r"# pass (\d+)", out))
    failed = sum(int(n) for n in re.findall(r"# fail (\d+)", out))
    tally = f"{passed}/{tests} passed, {failed} failed"
    if res.returncode != 0:
        tail = "\n".join(out.splitlines()[-40:])
        return False, f"(b) FAIL — `npm test` exit {res.returncode} ({tally}):\n{tail}"
    return True, f"(b) OK — `npm test` REQUIRE_FULL_COVERAGE=1: {tally}"


# ------------------------------------------------------------------ gate c --
def gate_c(base, key, slug, src_id, to_id, manifest):
    if to_id == src_id:
        try:
            live = ew.fetch(base, key, to_id)
        except urllib.error.HTTPError as e:
            return False, f"(c) FAIL — GET {to_id} failed: HTTP {e.code}", None
        exp_v, live_v = manifest.get("versionId"), live.get("versionId")
        if exp_v != live_v:
            return False, (f"(c) FAIL — export/{slug} is STALE: export versionId "
                            f"{exp_v} vs live {live_v}. Re-run export-workflows.py."), None
        return True, (f"(c) OK — export/{slug} matches live versionId "
                       f"{str(live_v)[:8]} (own-id deploy)"), live
    try:
        target = ew.fetch(base, key, to_id)
    except urllib.error.HTTPError as e:
        return False, f"(c) FAIL — GET {to_id} failed: HTTP {e.code}", None
    v, av = target.get("versionId"), target.get("activeVersionId")
    if v != av:
        return False, (f"(c) FAIL — target {to_id} ('{target.get('name')}') has an "
                        f"UNPUBLISHED DRAFT: versionId {v} != activeVersionId {av}. "
                        f"A deploy now would overwrite work not yet published. "
                        f"Publish or resolve it first."), None
    return True, (f"(c) OK — target {to_id} '{target.get('name')}' "
                   f"({len(target.get('nodes', []))} nodes) draft==active "
                   f"({str(v)[:8]}) — retargeting export/{slug} onto it"), target


# ------------------------------------------------------------------ gate d --
def gate_d(to_id, i_know_this_is_live, target_override):
    if to_id in PROTECTED and not i_know_this_is_live:
        return False, (f"(d) FAIL — {to_id} is PROTECTED ({PROTECTED[to_id]}). "
                        f"Pass --i-know-this-is-live to override.")
    if to_id == CLONE_GUARD_ID and not target_override:
        return False, (f"(d) FAIL — {to_id} is {CLONE_GUARD_NAME}. "
                        f"Pass --target-override to override.")
    note = ""
    if to_id in PROTECTED:
        note = f"  ⚠️  DEPLOYING TO LIVE ({PROTECTED[to_id]}) — --i-know-this-is-live acknowledged."
    elif to_id == CLONE_GUARD_ID:
        note = "  ⚠️  DEPLOYING TO SOMEONE ELSE'S CLONE — --target-override acknowledged."
    return True, f"(d) OK — {to_id} not blocked.{note}"


# ------------------------------------------------------------------ gate e --
def gate_e(target_wf, to_id):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    vid = target_wf.get("versionId") or "unknown"
    path = BACKUP_DIR / f"{to_id}-{vid}-{utc_stamp()}.json"
    path.write_text(json.dumps(target_wf, indent=2, sort_keys=True) + "\n")
    return path


# ------------------------------------------------------------------ gate f --
def build_put_body(assembled_wf, target_wf):
    settings = dict(assembled_wf.get("settings") or {})
    stripped = [k for k in SETTINGS_STRIP_KEYS if k in settings]
    for k in stripped:
        settings.pop(k, None)
    body = {
        "name": target_wf.get("name"),          # target's CURRENT name — never source's
        "nodes": assembled_wf.get("nodes"),      # node ids pass through UNCHANGED (see module docstring)
        "connections": assembled_wf.get("connections"),
        "settings": settings,
    }
    return body, stripped


# ------------------------------------------------------------------ gate h --
def compute_diff(assembled_nodes, target_nodes):
    a_by_name = {n["name"]: n for n in assembled_nodes}
    t_by_name = {n["name"]: n for n in target_nodes}
    added = sorted(set(a_by_name) - set(t_by_name))
    removed = sorted(set(t_by_name) - set(a_by_name))
    common = sorted(set(a_by_name) & set(t_by_name))

    def norm(n):
        d = {k: v for k, v in n.items() if k not in ("id", "position")}
        return json.dumps(d, sort_keys=True, default=str)

    changed, jscode_changed = [], []
    for name in common:
        a, t = a_by_name[name], t_by_name[name]
        a_js = (a.get("parameters") or {}).get("jsCode")
        t_js = (t.get("parameters") or {}).get("jsCode")
        if (a_js is not None or t_js is not None) and a_js != t_js:
            a_sha = hashlib.sha256((a_js or "").encode()).hexdigest()[:12]
            t_sha = hashlib.sha256((t_js or "").encode()).hexdigest()[:12]
            jscode_changed.append((name, t_sha, a_sha))
        if norm(a) != norm(t):
            changed.append(name)
    return {"added": added, "removed": removed, "changed": sorted(changed),
            "jscode_changed": jscode_changed, "common_count": len(common)}


def print_diff(diff):
    print(f"  common nodes: {diff['common_count']}   "
          f"added: {len(diff['added'])}   removed: {len(diff['removed'])}   "
          f"changed: {len(diff['changed'])}")
    for n in diff["added"]:
        print(f"    + {n}")
    for n in diff["removed"]:
        print(f"    - {n}")
    for n in diff["changed"]:
        print(f"    ~ {n}")
    if diff["jscode_changed"]:
        print("  jsCode sha changes:")
        for name, before, after in diff["jscode_changed"]:
            print(f"    ~ {name}: {before} -> {after}")


# ------------------------------------------------------------------ gate i --
def do_put(base, key, to_id, put_body):
    data = json.dumps(put_body).encode()
    req = urllib.request.Request(
        f"{base}/workflows/{to_id}", data=data, method="PUT",
        headers={"X-N8N-API-KEY": key, "Content-Type": "application/json",
                 "User-Agent": "curl/8.4.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, json.loads(r.read())


def rollback_command(backup_path, to_id):
    return f"python3 n8n-workflows-init/scripts/deploy.py --rollback {backup_path} --to {to_id}"


# ---------------------------------------------------------------- runners --
def do_deploy(args):
    slug = args.slug
    to_id = args.to
    export_dir = EXPORT / slug
    manifest_path = export_dir / "MANIFEST.json"
    if not manifest_path.exists():
        sys.exit(f"no such export: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    src_id = manifest["id"]

    print(f"=== deploy.py: {slug} -> {to_id} ==={' [DRY RUN]' if args.dry_run else ''}")

    base, key = ew.env()

    hr("gate (a) git clean")
    ok, msg = gate_a(slug, args.allow_dirty)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (b) npm test")
    ok, msg = gate_b()
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (c) freshness")
    ok, msg, target_wf = gate_c(base, key, slug, src_id, to_id, manifest)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (d) target safety")
    ok, msg = gate_d(to_id, args.i_know_this_is_live, args.target_override)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (e) backup")
    backup_path = gate_e(target_wf, to_id)
    print(f"  (e) OK — backup written -> {backup_path}")

    hr("gate (f) assemble + PUT body")
    try:
        assembled_wf, _stats = asm.assemble(slug, strip=True)
    except asm.AssembleError as e:
        sys.exit(f"  (f) FAIL — {e}")
    put_body, stripped_settings = build_put_body(assembled_wf, target_wf)
    print(f"  (f) OK — name='{put_body['name']}' (target's current name), "
          f"{len(put_body['nodes'])} nodes (ids pass through unchanged), "
          f"settings stripped: {stripped_settings or '(none)'}")

    hr("gate (g) credentials")
    print("  (g) OK — credentials passed through UNCHANGED "
          "(source and target are the same n8n instance; no remap needed)")

    hr("gate (h) diff vs target + confirm")
    diff = compute_diff(put_body["nodes"], target_wf.get("nodes", []))
    print_diff(diff)

    body_bytes = json.dumps(put_body).encode()
    sha = hashlib.sha256(body_bytes).hexdigest()
    print(f"\n  PUT body: {len(body_bytes)} bytes, sha256={sha}")

    if args.dry_run:
        print("\n=== DRY RUN: gates (a)-(h) complete. Stopping before gate (i) PUT. "
              "No write performed. ===")
        return

    if not args.yes:
        ans = input(f"\nProceed with PUT to {to_id}? [y/N] ").strip().lower()
        if ans != "y":
            print("aborted.")
            sys.exit(1)

    hr("gate (i) PUT")
    status, resp = do_put(base, key, to_id, put_body)
    print(f"  PUT {to_id}: HTTP {status}")
    if to_id == src_id:
        print("  re-running export-workflows.py + --verify for this slug ...")
        subprocess.run([sys.executable, str(SCRIPT_DIR / "export-workflows.py")], cwd=REPO_ROOT)
        subprocess.run([sys.executable, str(SCRIPT_DIR / "export-workflows.py"), "--verify"],
                        cwd=REPO_ROOT)
    print(f"\nRollback command:\n  {rollback_command(backup_path, to_id)}")


def do_rollback(args):
    to_id = args.to
    backup_path = pathlib.Path(args.rollback)
    if not backup_path.exists():
        sys.exit(f"no such backup file: {backup_path}")
    backup_wf = json.loads(backup_path.read_text())

    print(f"=== deploy.py --rollback {backup_path} -> {to_id} ==="
          f"{' [DRY RUN]' if args.dry_run else ''}")

    base, key = ew.env()

    hr("gate (d) target safety")
    ok, msg = gate_d(to_id, args.i_know_this_is_live, args.target_override)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (e) backup (of CURRENT target state, before rollback overwrites it)")
    try:
        target_wf = ew.fetch(base, key, to_id)
    except urllib.error.HTTPError as e:
        sys.exit(f"  (e) FAIL — GET {to_id} failed: HTTP {e.code}")
    backup_path2 = gate_e(target_wf, to_id)
    print(f"  (e) OK — pre-rollback backup written -> {backup_path2}")

    settings = dict(backup_wf.get("settings") or {})
    stripped = [k for k in SETTINGS_STRIP_KEYS if k in settings]
    for k in stripped:
        settings.pop(k, None)
    put_body = {
        "name": target_wf.get("name"),
        "nodes": backup_wf.get("nodes"),
        "connections": backup_wf.get("connections"),
        "settings": settings,
    }
    print(f"  settings stripped: {stripped or '(none)'}")

    hr("gate (h) diff vs current target + confirm")
    diff = compute_diff(put_body["nodes"], target_wf.get("nodes", []))
    print_diff(diff)

    body_bytes = json.dumps(put_body).encode()
    sha = hashlib.sha256(body_bytes).hexdigest()
    print(f"\n  PUT body: {len(body_bytes)} bytes, sha256={sha}")

    if args.dry_run:
        print("\n=== DRY RUN: rollback gates (d)/(e)/(h) complete. Stopping before "
              "gate (i) PUT. No write performed. ===")
        return

    if not args.yes:
        ans = input(f"\nProceed with ROLLBACK PUT to {to_id}? [y/N] ").strip().lower()
        if ans != "y":
            print("aborted.")
            sys.exit(1)

    hr("gate (i) PUT")
    status, resp = do_put(base, key, to_id, put_body)
    print(f"  PUT {to_id}: HTTP {status}")
    print(f"\nIf this target has its own export/ slug, re-run export-workflows.py for it.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", nargs="?", help="export/<slug> directory name "
                                             "(omit with --rollback)")
    ap.add_argument("--to", required=True, help="target n8n workflow id")
    ap.add_argument("--dry-run", action="store_true",
                     help="run gates (a)-(h), print the PUT body summary, stop before (i)")
    ap.add_argument("--yes", action="store_true", help="skip the interactive confirm at gate (h)")
    ap.add_argument("--allow-dirty", action="store_true",
                     help="proceed past gate (a) despite uncommitted changes (loud warning)")
    ap.add_argument("--i-know-this-is-live", action="store_true",
                     help="required to target a PROTECTED live id")
    ap.add_argument("--target-override", action="store_true",
                     help="required to target the TEST clone txiPzSxy3Pclsz6v")
    ap.add_argument("--rollback", metavar="BACKUP_FILE",
                     help="PUT a previously-saved tests/backups/*.json back onto --to "
                          "(gates d/e/h only)")
    args = ap.parse_args()

    if args.rollback:
        do_rollback(args)
        return

    if not args.slug:
        ap.error("slug is required unless --rollback is given")
    do_deploy(args)


if __name__ == "__main__":
    main()
