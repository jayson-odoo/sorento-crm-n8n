#!/usr/bin/env python3
"""
prune-nodes.py — delete PROVABLY DEAD nodes from an export, consistently.

WHY THIS EXISTS (mechanism decision, docs/SIMPLIFY-spine-audit.md slice 1)
    `export/<slug>/` is three artifacts that must agree: `workflow.json`,
    `nodes/*.js`, and `MANIFEST.json` (per-node sha256 + node_count). The
    unit harness loads every body through `tests/offline/node-source.js`,
    which dies with "the export is corrupt or hand-edited" the moment a body
    and its manifest sha disagree, and `tests/unit/_all-nodes.test.js`
    enumerates nodes from `MANIFEST.nodes`. So a node deletion is a THREE-FILE
    edit, and doing it by hand is exactly the failure that gate exists to
    catch. This script performs it as one atomic, re-runnable operation.

    It is NOT a general "edit the export" tool. It only DELETES, and only
    nodes it can first prove are dead. A change that alters behaviour does not
    belong here.

WHAT "DEAD" MEANS HERE (all four must hold, checked against the CURRENT export)
    1. not a trigger node;
    2. zero inbound connections from any node OUTSIDE the prune set (a whole
       dead lane can be pruned together, but it must be rooted in nothing);
    3. not read BY NAME — no `$('node')` / `$("node")` anywhere in any other
       node's serialized parameters. Rewiring does not redirect these, so a
       by-name reader makes a node load-bearing even with no inbound edge;
    4. not reachable, by main/any connection type, from ANY enabled trigger;
    5. does not FEED a surviving reachable node. n8n's langchain sub-nodes
       (`ai_languageModel`, `ai_tool`, …) point from the provider INTO its
       consumer, so a walk forward from the triggers never visits them: on
       this spine `OpenAI Chat Model` has zero inbound and is trigger-
       unreachable, yet it is the model behind `Basic LLM Chain`. Checks 1-4
       alone would have deleted it. (`docs/SIMPLIFY-spine-audit.md` §8 listed
       it as an orphan for exactly this reason — the audit was wrong.)

    A node that is unreachable because a CONDITION is hardwired off (n8n
    `if-transcribed-confirm`'s `={{ false }}`) fails check 4 only in spirit —
    it IS reachable in the graph — and is deliberately NOT prunable here. That
    is a flag someone can flip back, not dead surface. Same for a DISABLED
    trigger: disabling is an operator lever, not a deletion.

USAGE
    prune-nodes.py <slug> --nodes A,B,C            # prove only (default)
    prune-nodes.py <slug> --nodes A,B,C --write    # prove, then delete

    Read-only against n8n; it never talks to the API. Deploying the pruned
    export is `scripts/deploy.py`'s job and stays user-gated.

AFTER A PRUNE
    `MANIFEST.versionId` is left at the value the export was pulled at, on
    purpose: `deploy.py` gate (c) compares it to live to prove nobody else
    changed the workflow underneath you, and `export-workflows.py --verify`
    uses the same field. That means a pruned export reads as "current" while
    being deliberately ONE reviewed change ahead of live. `git status` is the
    thing that tells them apart — which is the point of the git-first deploy
    plan (`plans/test-pyramid-and-git-deploy.md`).
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent                                # n8n-workflows-init/
EXPORT = ROOT / "export"

BYNAME = re.compile(r"""\$\(\s*['"]([^'"]+)['"]\s*\)""")


def load(slug):
    d = EXPORT / slug
    wf = json.loads((d / "workflow.json").read_text())
    man = json.loads((d / "MANIFEST.json").read_text())
    return d, wf, man


def edges(wf):
    """{src: set(dst)} and {dst: set(src)} over EVERY connection type, not just main."""
    out, inb = {}, {}
    for src, kinds in (wf.get("connections") or {}).items():
        for _kind, branches in (kinds or {}).items():
            for branch in (branches or []):
                for c in (branch or []):
                    out.setdefault(src, set()).add(c["node"])
                    inb.setdefault(c["node"], set()).add(src)
    return out, inb


def byname_readers(wf):
    """{target node name: set(reader node names)} from every node's serialized parameters."""
    readers = {}
    for n in wf["nodes"]:
        for m in BYNAME.finditer(json.dumps(n)):
            readers.setdefault(m.group(1), set()).add(n["name"])
    return readers


def reachable(wf, out):
    nodes = {n["name"]: n for n in wf["nodes"]}
    seen = set()
    stack = [n for n, v in nodes.items()
             if "trigger" in v["type"].lower() and not v.get("disabled")]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(out.get(cur, ()))
    return seen


def prove(wf, targets):
    """Return a list of failure strings; empty == every target is provably dead."""
    nodes = {n["name"]: n for n in wf["nodes"]}
    out, inb = edges(wf)
    readers = byname_readers(wf)
    live = reachable(wf, out)
    tset = set(targets)
    fail = []
    for t in targets:
        if t not in nodes:
            fail.append(f"{t}: not in the export")
            continue
        if "trigger" in nodes[t]["type"].lower():
            fail.append(f"{t}: is a trigger — never prunable here")
        outside_in = inb.get(t, set()) - tset
        if outside_in:
            fail.append(f"{t}: has inbound connections from {sorted(outside_in)}")
        outside_readers = readers.get(t, set()) - tset
        if outside_readers:
            fail.append(f"{t}: is read BY NAME by {sorted(outside_readers)}")
        if t in live:
            fail.append(f"{t}: is reachable from an enabled trigger")
        feeds = {n for n in out.get(t, set()) - tset if n in live}
        if feeds:
            fail.append(f"{t}: FEEDS surviving live node(s) {sorted(feeds)} "
                        f"(langchain sub-nodes point provider -> consumer)")
    return fail


def prune(d, wf, man, targets):
    tset = set(targets)
    files = []
    for t in targets:
        rec = (man.get("nodes") or {}).get(t)
        if rec:
            files.append(rec["file"])
            del man["nodes"][t]
    wf["nodes"] = [n for n in wf["nodes"] if n["name"] not in tset]
    conns = wf.get("connections") or {}
    for t in targets:
        conns.pop(t, None)
    # A pruned node can still be named as a DESTINATION inside a surviving
    # node's connection list only if it had an inbound edge, which prove()
    # already refused — strip anyway so the artifact cannot carry a dangler.
    for src, kinds in list(conns.items()):
        for kind, branches in list((kinds or {}).items()):
            kinds[kind] = [[c for c in (b or []) if c["node"] not in tset]
                           for b in (branches or [])]
    wf["connections"] = conns
    man["node_count"] = len(wf["nodes"])

    (d / "workflow.json").write_text(json.dumps(wf, indent=2, sort_keys=True) + "\n")
    for f in files:
        p = d / "nodes" / f
        if p.exists():
            p.unlink()
    man["workflow_json_sha256"] = hashlib.sha256((d / "workflow.json").read_bytes()).hexdigest()
    (d / "MANIFEST.json").write_text(json.dumps(man, indent=2, sort_keys=True) + "\n")
    # TOPOLOGY.md is derived, and a stale one is worse than none: it is the file agents read
    # INSTEAD of the 275 KB blob. Re-render it with the exporter's own renderer so the pruned
    # export cannot describe nodes it no longer contains.
    spec = importlib.util.spec_from_file_location("exportwf", SCRIPT_DIR / "export-workflows.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    (d / "TOPOLOGY.md").write_text(mod.topology(wf))
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--nodes", required=True, help="comma-separated node names to delete")
    ap.add_argument("--write", action="store_true",
                    help="actually delete (default: prove only, change nothing)")
    a = ap.parse_args()

    targets = [t.strip() for t in a.nodes.split(",") if t.strip()]
    d, wf, man = load(a.slug)
    if not d.exists():
        sys.exit(f"no such export: {d}")

    fail = prove(wf, targets)
    if fail:
        print("REFUSED — these nodes are not provably dead:")
        for f in fail:
            print("  ✗ " + f)
        return 1
    for t in targets:
        print(f"  ✓ {t}: no inbound, no by-name reader, unreachable from every enabled trigger")

    if not a.write:
        print(f"\n{len(targets)} node(s) provably dead. Re-run with --write to delete.")
        return 0

    before = len(wf["nodes"])
    files = prune(d, wf, man, targets)
    print(f"\npruned {a.slug}: {before} -> {man['node_count']} nodes, "
          f"{len(files)} body file(s) removed ({', '.join(files) or 'none'})")
    print("MANIFEST.versionId left at the pulled value on purpose — see this file's header. "
          "The export is now ONE reviewed change ahead of live; git is what says so.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
