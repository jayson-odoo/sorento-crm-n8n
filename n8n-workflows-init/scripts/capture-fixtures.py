#!/usr/bin/env python3
"""
capture-fixtures.py — capture per-node fixtures (ctx/input/expected) from real n8n
executions, for the Tier-1 unit-test harness (step 1B of
`n8n-workflows-init/plans/test-pyramid-and-git-deploy.md`).

Fixtures land at:
    n8n-workflows-init/tests/fixtures/nodes/<slug>/<nodeName>/<case>.json

one file per (Code node, runIndex) actually present in the execution, shaped:
    { "source": {execution_id, workflow_id, node, captured_at[, dev_contact]},
      "ctx": {<node name>: [{"json": {...}}]},   # every node that ran, runIndex 0, main[0]
      "input": [{"json": {...}}],                # this node's INPUT (previous node's output)
      "expected": [{"json": {...}}],              # this node's OUTPUT, main[0]
      "runIndex": 0,
      "execution": {"id": "<execution_id>"},      # so n8n-shim's $execution reads a real id
      "volatile": [] }

`ctx`/`input`/`expected` are PII-scrubbed via scripts/scrub-fixtures.py's own scrub_fixture_object
(imported below — see that file's docstring for exactly what is/isn't redacted and why). The map
(real value -> stable fake) persists at PII_MAP_PATH (repo-local, gitignored) across capture runs,
so the same real phone/email/name/contact-id always gets the same placeholder.

READ-ONLY against n8n. This script issues ONLY:
    GET /executions/:id?includeData=true
    GET /executions?workflowId=...
Never MCP update/publish/execute, never REST PUT/POST. See CLAUDE.md HARD SAFETY RULE.

Usage:
    capture-fixtures.py <execution_id> [--nodes a,b,c] [--case-prefix exec] [--slug <export-slug>]
    capture-fixtures.py --latest <workflow_id> [--n 5] [--nodes a,b,c] [--case-prefix exec] [--slug ...]

Verified runData layout (n8n self-hosted, checked against a real execution 2026-08-22):
    data.resultData.runData[nodeName]                      -> list, one entry per run (runIndex)
    runData[nodeName][runIndex].data.main[outputIndex]      -> that run's OUTPUT items on that
                                                                output branch (outputIndex 0 for a
                                                                plain node; an If/Switch branch can
                                                                land on outputIndex 1+)
    runData[nodeName][runIndex].source[0].previousNode      -> name of the node whose output fed
                                                                this run's INPUT
    runData[nodeName][runIndex].source[0].previousNodeRun   -> which run of previousNode (usually 0)
    runData[nodeName][runIndex].source[0].previousNodeOutput-> which output branch of previousNode
                                                                fed this input (NOT always 0 — an
                                                                If/Switch can hand off branch 1)
    top-level workflowId (exe["workflowId"], NOT exe["data"]["workflowId"]) identifies the workflow.
REST v1 does NOT support `nodeNames`/`truncateData` query params (that's an MCP-only convenience,
confirmed: `?nodeNames=x` -> {"message":"Unknown query parameter 'nodeNames'"}). Cursor pagination
on GET /executions uses `cursor=<opaque nextCursor>`, confirmed against a real page.
"""
import argparse
import importlib.util
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]        # n8n-workflows-init/
EXPORT = ROOT / "export"
FIXTURES = ROOT / "tests" / "fixtures" / "nodes"
ENV = ROOT.parent / ".env"

MAX_FIXTURE_BYTES = 400 * 1024

# PII scrub (mandatory, per plan step 1B) — delegated entirely to scrub-fixtures.py so there is
# ONE regex set / one definition of "PII" for both the batch scrubber and every future capture.
# Loaded by file path, not `import`, because the module's filename has a hyphen.
_scrub_spec = importlib.util.spec_from_file_location(
    "scrub_fixtures", pathlib.Path(__file__).resolve().parent / "scrub-fixtures.py"
)
scrub_fixtures = importlib.util.module_from_spec(_scrub_spec)
_scrub_spec.loader.exec_module(scrub_fixtures)

# repo-local, gitignored — NOT the scratchpad map used for the one-off historical-corpus scrub;
# this one needs to survive across future capture-fixtures.py runs, potentially in other sessions.
PII_MAP_PATH = ROOT / ".pii-scrub-map.json"


def env():
    if not ENV.exists():
        sys.exit(f"missing {ENV}")
    e = {}
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            e[k.strip()] = v.strip()
    return e["N8N_API_BASE"].rstrip("/"), e["N8N_API_KEY"]


def api_get(base, key, path):
    req = urllib.request.Request(
        f"{base}{path}",
        headers={"X-N8N-API-KEY": key, "User-Agent": "curl/8.4.0"},  # UA: Cloudflare blocks urllib default
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def list_executions(base, key, workflow_id, status="success", limit=20):
    """GET /executions?workflowId=... with cursor pagination, newest first."""
    out = []
    cursor = None
    while len(out) < limit:
        page_size = min(limit - len(out), 50)
        path = f"/executions?workflowId={workflow_id}&status={status}&limit={page_size}"
        if cursor:
            path += f"&cursor={cursor}"
        page = api_get(base, key, path)
        out.extend(page.get("data", []))
        cursor = page.get("nextCursor")
        if not cursor or not page.get("data"):
            break
    return out[:limit]


def get_execution(base, key, execution_id):
    return api_get(base, key, f"/executions/{execution_id}?includeData=true")


def safe_dirname(n):
    """Mirror export-workflows.py's safe_name so slug/node paths stay filesystem-clean."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", n).strip("_")[:120] or "_"


def find_slug(workflow_id, override=None):
    if override:
        return override
    for wf_json in sorted(EXPORT.glob("*/workflow.json")):
        try:
            wf = json.loads(wf_json.read_text())
        except Exception:
            continue
        if wf.get("id") == workflow_id:
            return wf_json.parent.name
    sys.exit(f"FAIL: no export/*/workflow.json has id == {workflow_id!r}. "
              f"Pass --slug, or run export-workflows.py to add/refresh this workflow's export.")


def load_code_nodes(slug):
    wf_path = EXPORT / slug / "workflow.json"
    if not wf_path.exists():
        sys.exit(f"FAIL: {wf_path} does not exist (bad --slug?)")
    wf = json.loads(wf_path.read_text())
    return {n["name"] for n in wf["nodes"] if n.get("type") == "n8n-nodes-base.code"}


# One PIIMap for the whole script run (possibly many fixtures across many --nodes / --latest N).
# Loaded lazily so a --help / argument-error exit never touches the map file.
_PMAP = None


def get_pmap():
    global _PMAP
    if _PMAP is None:
        _PMAP = scrub_fixtures.PIIMap(PII_MAP_PATH)
    return _PMAP


def save_pmap():
    if _PMAP is not None:
        _PMAP.save()


def clean_items(items):
    """Keep json only (drop binary/pairedItem), PII-scrubbed via scrub-fixtures.py."""
    out = []
    for it in items or []:
        j = (it or {}).get("json", {})
        out.append({"json": scrub_fixtures.scrub_fixture_object(j, get_pmap())})
    return out


def node_output(run_entry, output_index=0):
    if not run_entry:
        return []
    main = ((run_entry.get("data") or {}).get("main")) or []
    if output_index >= len(main) or main[output_index] is None:
        return []
    return main[output_index]


def build_ctx(run_data):
    """Every node that ran, runIndex 0, main[0] -> serves any $('x') read in the shim."""
    ctx = {}
    for name, entries in run_data.items():
        if not entries:
            continue
        ctx[name] = clean_items(node_output(entries[0], 0))
    return ctx


def resolve_input(run_data, entry, warnings, node_name, run_idx):
    src = entry.get("source") or []
    if not src or src[0] is None:
        warnings.append(f"{node_name}[run {run_idx}]: no source (trigger / first node) -> input=[]")
        return []
    if len(src) > 1:
        warnings.append(f"{node_name}[run {run_idx}]: MULTI-INPUT ({len(src)} sources, "
                         f"e.g. a Merge) -- using source[0]={src[0].get('previousNode')!r}, "
                         f"other branch(es) dropped")
    s0 = src[0]
    prev = s0.get("previousNode")
    if not prev:
        warnings.append(f"{node_name}[run {run_idx}]: source[0].previousNode missing -> input=[]")
        return []
    prev_run = s0.get("previousNodeRun") or 0
    prev_out = s0.get("previousNodeOutput") or 0
    prev_entries = run_data.get(prev)
    if not prev_entries or prev_run >= len(prev_entries):
        warnings.append(f"{node_name}[run {run_idx}]: previousNode {prev!r} run {prev_run} "
                         f"not in this execution's runData -> input=[]")
        return []
    return clean_items(node_output(prev_entries[prev_run], prev_out))


def existing_fixture_count(slug, node_name):
    d = FIXTURES / slug / safe_dirname(node_name)
    if not d.exists():
        return 0
    return len(list(d.glob("*.json")))


def capture_one(base, key, execution_id, nodes_filter, case_base, slug_override, dev_contact,
                 only_missing=False, min_fixtures=1):
    exe = get_execution(base, key, execution_id)
    workflow_id = exe.get("workflowId")
    run_data = ((exe.get("data") or {}).get("resultData") or {}).get("runData") or {}
    if not run_data:
        print(f"  ! exec {execution_id}: no resultData.runData (unfinished / no data) -- skipped")
        return []

    slug = find_slug(workflow_id, slug_override)
    code_nodes = load_code_nodes(slug)
    ran = set(run_data.keys())

    if nodes_filter:
        requested = set(nodes_filter)
        targets = requested & code_nodes & ran
        skipped = requested - targets
        if skipped:
            print(f"  (--nodes skipped, not Code / did not run in this exec: {sorted(skipped)})")
    else:
        targets = code_nodes & ran

    if only_missing:
        before = targets
        targets = {n for n in targets if existing_fixture_count(slug, n) < min_fixtures}
        skipped = before - targets
        if skipped:
            print(f"  (--only-missing skipped, already >= {min_fixtures} fixture(s): {sorted(skipped)})")

    if not targets:
        print(f"  ! exec {execution_id} (slug {slug}): no matching Code nodes ran -- skipped")
        return []

    ctx = build_ctx(run_data)
    warnings = []
    rows = []

    for node_name in sorted(targets):
        entries = run_data[node_name]
        for run_idx, entry in enumerate(entries):
            case = case_base if run_idx == 0 else f"{case_base}-r{run_idx}"
            inp = resolve_input(run_data, entry, warnings, node_name, run_idx)
            expected = clean_items(node_output(entry, 0))

            source = {
                "execution_id": str(execution_id),
                "workflow_id": workflow_id,
                "node": node_name,
                "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            if dev_contact:
                source["dev_contact"] = True

            fixture = {
                "source": source,
                "ctx": ctx,
                "input": inp,
                "expected": expected,
                "runIndex": run_idx,
                "execution": {"id": str(execution_id)},
                "volatile": [],
            }

            out_dir = FIXTURES / slug / safe_dirname(node_name)
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / f"{case}.json"
            text = json.dumps(fixture, indent=2, sort_keys=False) + "\n"
            out_path.write_text(text)
            save_pmap()  # persist after every fixture written, not just at script exit — a
                          # mid-run crash must never leave written-to-disk placeholders orphaned
                          # from an unsaved map (next run would renumber and desync them)

            size = len(text.encode())
            if size > MAX_FIXTURE_BYTES:
                biggest = sorted(((k, len(json.dumps(v))) for k, v in ctx.items()),
                                  key=lambda kv: -kv[1])[:5]
                print(f"  ! {out_path.relative_to(ROOT)}: {size / 1024:.0f} KB > 400 KB budget. "
                      f"Biggest ctx keys: {biggest}")

            rows.append((slug, node_name, case, len(inp), len(expected), size, out_path))

    for w in warnings:
        print(f"  ~ {w}")
    return rows


def print_table(rows):
    if not rows:
        print("(no fixtures written)")
        return
    print(f"\n{'slug':32} {'node':26} {'case':24} {'in':>4} {'out':>4} {'KB':>7}  file")
    total = 0
    for slug, node, case, nin, nout, size, path in rows:
        total += size
        print(f"{slug:32} {node:26} {case:24} {nin:4} {nout:4} {size / 1024:7.1f}  {path}")
    print(f"\n{len(rows)} fixtures, {total / 1024:.1f} KB total")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("execution_id", nargs="?", help="capture from this one execution")
    ap.add_argument("--latest", metavar="WORKFLOW_ID",
                     help="capture from the last N finished executions of this workflow")
    ap.add_argument("--n", type=int, default=5, help="how many, with --latest (default 5)")
    ap.add_argument("--nodes", help="comma-separated node names; default = every Code node that ran")
    ap.add_argument("--case-prefix", help="case file basename; default exec-<execution_id>")
    ap.add_argument("--slug", help="export dir slug; default = auto-match by workflowId")
    ap.add_argument("--dev-contact", action="store_true",
                     help="stamp source.dev_contact=true (use for the 437264483 test contact)")
    ap.add_argument("--only-missing", action="store_true",
                     help="skip nodes that already have >= --min fixtures on disk (cheap re-runs)")
    ap.add_argument("--min", type=int, default=1,
                     help="fixture-count threshold for --only-missing (default 1)")
    args = ap.parse_args()

    if not args.execution_id and not args.latest:
        ap.error("give an execution_id or --latest WORKFLOW_ID")

    base, key = env()
    nodes_filter = [n.strip() for n in args.nodes.split(",")] if args.nodes else None

    all_rows = []
    if args.latest:
        # NOTE: with multiple executions, a bare --case-prefix would collide across them
        # (every execution writing the same <prefix>.json, silently overwriting). Always
        # fold the execution_id in here so each capture gets its own file.
        execs = list_executions(base, key, args.latest, status="success", limit=args.n)
        print(f"found {len(execs)} finished executions of {args.latest}")
        for e in execs:
            print(f"-- exec {e['id']} ({e.get('startedAt')})")
            case_base = f"{args.case_prefix}-{e['id']}" if args.case_prefix else f"exec-{e['id']}"
            all_rows += capture_one(base, key, e["id"], nodes_filter, case_base,
                                     args.slug, args.dev_contact,
                                     args.only_missing, args.min)
    else:
        case_base = args.case_prefix or f"exec-{args.execution_id}"
        all_rows = capture_one(base, key, args.execution_id, nodes_filter, case_base,
                                args.slug, args.dev_contact,
                                args.only_missing, args.min)

    print_table(all_rows)
    save_pmap()


if __name__ == "__main__":
    main()
