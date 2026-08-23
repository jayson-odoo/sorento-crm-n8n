#!/usr/bin/env python3
"""
assemble.py — inverse of export-workflows.py: fold nodes/*.js bodies back into
a workflow.json, ready for deploy.py to PUT.

WHY THIS EXISTS
    Step 5 of plans/test-pyramid-and-git-deploy.md ("git-first deploy"). Once
    `export/<slug>/nodes/*.js` are the files agents edit, something has to fold
    an edited body back into the Code node's `parameters.jsCode` before it can
    be shipped. This is that something. It is READ-ONLY against n8n — it never
    talks to the API, only to the local export/ tree.

MAPPING
    Which file belongs to which node comes from `export/<slug>/MANIFEST.json`
    (`nodes.<nodeName>.file`), the same manifest export-workflows.py writes.
    Nodes not listed there (no jsCode) pass through workflow.json unchanged.

WHITESPACE
    Every folded-in jsCode body has trailing whitespace stripped from each
    line (not the newlines themselves) before being written back. This is the
    LESSONS #58(b) landmine: the tool-call authoring channel right-trims
    trailing whitespace, so a source line with trailing spaces can never be
    reproduced byte-exact through that channel, and a sha-gate downstream
    would fail on inert bytes. Stripping here means assemble's output is
    always representable by that channel and always sha-stable. Some CURRENTLY
    LIVE code already carries trailing whitespace on a handful of lines (seen
    in central-exchange.js, construct-user-prompt.js, validator.js,
    output_exchange.js in several exports) — that whitespace is semantically
    inert in JS, so stripping it is safe, but it means `--check` compares
    against a trailing-whitespace-normalized copy of workflow.json's own
    jsCode, not the raw bytes (see --check below).

ROUND-TRIP CHECK
    `assemble.py --check <slug>` re-derives each Code node's jsCode from
    nodes/*.js and compares it, byte-for-byte, against the SAME workflow.json
    the export wrote — after applying the identical trailing-whitespace strip
    to both sides. (Applying it to both sides, not just the assembled side, is
    what makes this a real round-trip check rather than a fixed point of the
    stripping step: it proves the fold-in reproduces the file's content
    exactly, with no reordering, truncation, or cross-node mixup — the only
    thing left unverified is whitespace we deliberately treat as inert.) Exits
    1 and prints every mismatching node on failure; exits 0 and prints a
    one-line summary (node count, code-node count) on success.

USAGE
    assemble.py <slug> [--out PATH]     write the assembled workflow.json
    assemble.py --check <slug>          round-trip check, exit 1 on mismatch
"""
import argparse
import hashlib
import json
import pathlib
import sys
import tempfile

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent          # n8n-workflows-init/
EXPORT = ROOT / "export"

# S14 (reviewer): this used to be a hardcoded path under one specific agent session's scratchpad
# (`/private/tmp/claude-501/.../fbe01629-.../scratchpad/assembled`) — dead on any other machine or
# session. `tempfile.gettempdir()` is the portable equivalent (`/tmp` on this box, but correct
# wherever it runs); `--out` still overrides it for anyone who wants a specific location.
DEFAULT_OUT_DIR = pathlib.Path(tempfile.gettempdir()) / "sorento-crm-n8n-assembled"


class AssembleError(Exception):
    pass


def strip_trailing_ws(text):
    """Strip trailing horizontal whitespace from every line. Never touches
    the newline characters themselves or collapses blank lines."""
    return "\n".join(line.rstrip(" \t") for line in text.split("\n"))


def load_export(slug):
    d = EXPORT / slug
    wf_path = d / "workflow.json"
    manifest_path = d / "MANIFEST.json"
    if not wf_path.exists():
        raise AssembleError(f"no such export: {wf_path} does not exist "
                             f"(run export-workflows.py first?)")
    if not manifest_path.exists():
        raise AssembleError(f"no such export: {manifest_path} does not exist")
    wf = json.loads(wf_path.read_text())
    manifest = json.loads(manifest_path.read_text())
    return d, wf, manifest


def assemble(slug, strip=True):
    """Returns (assembled_workflow_dict, stats). stats has code_nodes,
    total_nodes, and per-node {name: jsCode} for both the assembled body and
    the original (pre-strip) body, for --check to compare."""
    d, wf, manifest = load_export(slug)
    manifest_nodes = manifest.get("nodes", {})

    original_js = {}
    assembled_js = {}
    missing_files = []

    for node in wf.get("nodes", []):
        name = node.get("name")
        info = manifest_nodes.get(name)
        if not info:
            continue  # not a Code node (or had no jsCode at export time)
        original_js[name] = (node.get("parameters") or {}).get("jsCode")
        body_path = d / "nodes" / info["file"]
        if not body_path.exists():
            missing_files.append((name, str(body_path)))
            continue
        body = body_path.read_text()
        if strip:
            body = strip_trailing_ws(body)
        node.setdefault("parameters", {})["jsCode"] = body
        assembled_js[name] = body

    if missing_files:
        detail = "; ".join(f"{n} -> {p}" for n, p in missing_files)
        raise AssembleError(f"{slug}: MANIFEST.json references missing file(s): {detail}")

    stats = {
        "total_nodes": len(wf.get("nodes", [])),
        "code_nodes": len(assembled_js),
        "original_js": original_js,
        "assembled_js": assembled_js,
    }
    return wf, stats


def do_write(slug, out_path):
    wf, stats = assemble(slug, strip=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(wf, indent=2, sort_keys=True) + "\n"
    out_path.write_text(text)
    sha = hashlib.sha256(text.encode()).hexdigest()
    print(f"  {slug}: {stats['total_nodes']} nodes, {stats['code_nodes']} code nodes "
          f"folded -> {out_path}")
    print(f"  sha256 {sha}  ({len(text)} bytes)")
    return out_path


def do_check(slug):
    try:
        wf, stats = assemble(slug, strip=True)
    except AssembleError as e:
        print(f"  ✗ {slug}: {e}")
        return False

    mismatches = []
    for name, assembled_body in stats["assembled_js"].items():
        original_body = stats["original_js"].get(name)
        if original_body is None:
            mismatches.append((name, "original had no jsCode (manifest/workflow.json disagree)"))
            continue
        normalized_original = strip_trailing_ws(original_body)
        if assembled_body != normalized_original:
            # find first differing line for a useful message
            a_lines = assembled_body.split("\n")
            o_lines = normalized_original.split("\n")
            first_diff = next(
                (i for i, (a, o) in enumerate(zip(a_lines, o_lines)) if a != o),
                min(len(a_lines), len(o_lines)))
            mismatches.append(
                (name, f"differs at line {first_diff + 1} "
                       f"({len(a_lines)} vs {len(o_lines)} lines)"))

    if mismatches:
        print(f"  ✗ {slug}: {len(mismatches)}/{stats['code_nodes']} code node(s) MISMATCH")
        for name, why in mismatches:
            print(f"      - {name}: {why}")
        return False

    print(f"  ✓ {slug}: {stats['code_nodes']}/{stats['code_nodes']} code node(s) round-trip clean "
          f"({stats['total_nodes']} nodes total)")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="export/<slug> directory name")
    ap.add_argument("--out", help="output path for the assembled workflow.json "
                                   "(default: scratchpad/assembled/<slug>.json)")
    ap.add_argument("--check", action="store_true",
                     help="round-trip check instead of writing; exit 1 on mismatch")
    args = ap.parse_args()

    if args.check:
        ok = do_check(args.slug)
        sys.exit(0 if ok else 1)

    out_path = pathlib.Path(args.out) if args.out else (DEFAULT_OUT_DIR / f"{args.slug}.json")
    try:
        do_write(args.slug, out_path)
    except AssembleError as e:
        print(f"  ✗ {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
