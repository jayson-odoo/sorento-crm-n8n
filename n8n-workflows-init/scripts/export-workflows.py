#!/usr/bin/env python3
"""
export-workflows.py — pull n8n workflows into diffable, derived artifacts.

WHY THIS EXISTS
    Agents were re-deriving structure from a 444 KB workflow blob on every task
    (~6x in one session). This writes three artifacts per workflow:

        workflow.json   canonical, pretty, sorted  -> git diff works
        nodes/*.js      the JS bodies as real files -> lint / test / diff as code
        TOPOLOGY.md     ~10 KB derived map          -> 46x smaller than the blob,
                                                       answers most structural questions

    Plus MANIFEST.json carrying the versionId + per-node hashes the export came
    from, so a stale export can be DETECTED rather than silently trusted.

THE STALENESS RULE (read this before trusting any exported file)
    The remote instance is the source of truth. `normalized-workflows/` was
    deleted from this repo precisely because a stale local copy got trusted.
    So: never read an export without running `--verify` first. It is one cheap
    API call per workflow and it fails LOUDLY.

        python3 scripts/export-workflows.py            # export
        python3 scripts/export-workflows.py --verify   # is my export current?

    Run the export after every promote and every clone build.

SAFETY
    - Refuses to write if anything secret-looking appears (see SECRET_PATTERNS).
    - Strips `activeVersion` (a full duplicate copy of the workflow; flagged as
      secret-at-rest previously). Credentials in n8n are references only
      ({id, name}) and carry no secret material -- verified before writing.
    - Read-only against n8n. This script NEVER writes to the instance.
"""
import json, os, re, sys, hashlib, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "export"
ENV = ROOT.parent / ".env"

# id -> directory slug. Add workflows here as they become worth tracking.
TARGETS = {
    "9qVyfUxmRQqrpGRMDLRuz": "live-spine-sorento-consume-main",
    "txiPzSxy3Pclsz6v":      "clone-sorento-consume-main-TEST",
    "XTODTw-dJcV0uRdC056hG": "sub-semantic-parser",
    # The parser FORK the clone actually calls. Added 2026-08-08 (immortal-hint-class): it was
    # outside the export set, so every agent re-pulled it via REST and the fork<->live delta had to
    # be re-derived by hand each time (plan §0.2 / §6-IH-V5). Tracking it makes that delta a `git
    # diff` of two exported files. It is NOT live — never promote from this directory (LESSONS §57).
    "wI5RkNGW3EOJfBdo":      "sub-semantic-parser-FORK",
    "Fss5aAaXthJSWpZCgKiKR": "sub-get-results",
    "rysSPgUssLDf6xJc":      "sub-get-results-TEST",
    # The fork the CLONE's 6 get-results callers actually point at (container-status build).
    # Exported because an un-exported fork gets no staleness gate and no diffable artifact —
    # exactly how the parser FORK drifted unnoticed. Promotion targets Fss5aAa AND rysSPgU.
    "t4QvrtrPnTwRU6br":      "sub-get-results-CS-BUILD",
    "aoydkG1dbItXR5jXFEQsP": "sub-sendmsg",
    "77SG9jTdVKhwMwvR":      "sorento-dispatcher",
    # promotion-picker build targets (plan `plans/promotion-picker-plan.md`, GH #3-#10).
    # Spine fork is off the REBASED clone (c4c89ed1); parser fork is off LIVE (bb875580) — NOT off
    # wI5RkNGW3EOJfBdo, which is behind live by `resource_attachment` in DOMAIN_BLOCKED_HINTS.order
    # and .incoming. Registered on creation so the staleness gate covers them from day one.
    "RnpxEnAV3g20MmKj":      "fork-promo-picker-spine",
    "RJ326g9dwe3bTWyf":      "fork-promo-picker-parser",
    # sub-sendmsg fork carrying the quick-reply chunking fix (WhatsApp 1024-char interactive
    # body cap). Off LIVE c712e218 + 7 hunks + CHAT's console branch; the clone's 9 sendmsg
    # callers point here. Registered on creation so the staleness gate covers it from day one —
    # an un-exported fork is exactly how sub-semantic-parser-FORK drifted unnoticed.
    "aQUmwMVplmNcyUVc":      "fork-sendmsg-qrchunk",
}

# Volatile / duplicative keys: excluded from workflow.json so a re-export with no
# real change produces an EMPTY git diff. Recorded in MANIFEST.json instead.
VOLATILE = {"activeVersion", "updatedAt", "createdAt", "triggerCount",
            "versionCounter", "shared", "tags", "isArchived", "sourceWorkflowId"}

SECRET_PATTERNS = {
    "apiKey":   r'"apiKey"\s*:\s*"[^"]+"',
    "password": r'"password"\s*:\s*"[^"]+"',
    "token":    r'"(accessToken|refreshToken|secret)"\s*:\s*"[^"]{8,}"',
    "bearer":   r'Bearer\s+[A-Za-z0-9._\-]{20,}',
    "pgconn":   r'postgres(ql)?://[^"\s]+',
    "jwt":      r'eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}',
}


def env():
    if not ENV.exists():
        sys.exit(f"missing {ENV}")
    e = {}
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            e[k.strip()] = v.strip()
    return e["N8N_API_BASE"].rstrip("/"), e["N8N_API_KEY"]


def fetch(base, key, wid):
    req = urllib.request.Request(
        f"{base}/workflows/{wid}",
        headers={"X-N8N-API-KEY": key, "User-Agent": "curl/8.4.0"},  # UA: Cloudflare blocks urllib's default
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def safe_name(n):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", n).strip("_")[:120]


def scan_secrets(text):
    return {k: len(re.findall(p, text)) for k, p in SECRET_PATTERNS.items()
            if re.search(p, text)}


def topology(wf):
    """The derived map. Everything an agent usually re-derives from the raw blob."""
    nodes = wf["nodes"]
    conns = wf.get("connections", {})
    by_name = {n["name"]: n for n in nodes}
    L = []
    L.append(f"# TOPOLOGY — {wf['name']}  (`{wf['id']}`)")
    L.append("")
    L.append(f"- versionId **{wf.get('versionId')}** · activeVersionId **{wf.get('activeVersionId')}**"
             f" · {'DRAFT == ACTIVE' if wf.get('versionId') == wf.get('activeVersionId') else '⚠️ DRAFT != ACTIVE'}")
    L.append(f"- {len(nodes)} nodes")
    L.append("")

    L.append("## Edges")
    L.append("```")
    edges = 0
    for s in sorted(conns):
        for i, out in enumerate(conns[s].get("main") or []):
            tgt = [e["node"] for e in (out or [])]
            if tgt:
                edges += 1
                L.append(f"{s}[{i}] -> {', '.join(tgt)}")
    L.append("```")
    L.insert(L.index("## Edges") + 1, f"_{edges} edge groups_\n")

    # by-name reads: the thing agents most often re-derive, and most often get wrong
    # (both quote forms matter -- a single-quote-only grep misses $("x") reads)
    reads = {}
    for n in nodes:
        blob = json.dumps(n.get("parameters", {}))
        for t in set(re.findall(r"\$\(\\?['\"]([^'\"\\]+)\\?['\"]\)", blob)):
            reads.setdefault(t, set()).add(n["name"])
    L += ["", "## Read BY NAME (`$('x')` / `$(\"x\")`)",
          "", "> Rewiring alone does NOT redirect these. Repoint the expression too.", ""]
    for t in sorted(reads):
        mark = "" if t in by_name else "  ⚠️ TARGET NOT IN THIS WORKFLOW"
        L.append(f"- **{t}** ← {', '.join(sorted(reads[t]))}{mark}")

    inbound = {}
    for s in conns:
        for out in (conns[s].get("main") or []):
            for e in (out or []):
                inbound.setdefault(e["node"], []).append(s)
    orphans = [n["name"] for n in nodes if n["name"] not in inbound]
    L += ["", "## Zero inbound (orphaned / triggers)", ""]
    L += [f"- {o}" for o in sorted(orphans)]

    subs = [(n["name"], (n["parameters"].get("workflowId") or {}).get("value"),
             (n["parameters"].get("workflowId") or {}).get("cachedResultName"))
            for n in nodes if n.get("type") == "n8n-nodes-base.executeWorkflow"]
    if subs:
        L += ["", "## Sub-workflow calls", "",
              "| node | workflowId | name |", "|---|---|---|"]
        L += [f"| {a} | `{b}` | {c or ''} |" for a, b, c in sorted(subs)]

    creds = [(n["name"], k, v.get("name")) for n in nodes
             for k, v in (n.get("credentials") or {}).items()]
    if creds:
        L += ["", "## Credentials (references only — no secrets)", "",
              "| node | type | credential |", "|---|---|---|"]
        L += [f"| {a} | {b} | {c} |" for a, b, c in sorted(creds)]

    code = [(n["name"], len(n["parameters"]["jsCode"].splitlines()))
            for n in nodes if n.get("parameters", {}).get("jsCode")]
    if code:
        L += ["", "## Code nodes (bodies exported to `nodes/`)", "",
              "| node | lines |", "|---|---|"]
        L += [f"| {a} | {b} |" for a, b in sorted(code, key=lambda x: -x[1])]
    return "\n".join(L) + "\n"


def do_export(base, key):
    OUT.mkdir(exist_ok=True)
    for wid, slug in TARGETS.items():
        try:
            wf = fetch(base, key, wid)
        except urllib.error.HTTPError as e:
            print(f"  ! {slug}: HTTP {e.code} — skipped")
            continue

        found = scan_secrets(json.dumps(wf))
        if found:
            print(f"  ! {slug}: SECRET-LOOKING MATERIAL {found} — refusing to write")
            continue

        d = OUT / slug
        (d / "nodes").mkdir(parents=True, exist_ok=True)
        for old in (d / "nodes").glob("*.js"):
            old.unlink()

        manifest = {"id": wid, "name": wf["name"],
                    "versionId": wf.get("versionId"),
                    "activeVersionId": wf.get("activeVersionId"),
                    "updatedAt": wf.get("updatedAt"),
                    "node_count": len(wf["nodes"]), "nodes": {}}

        for n in wf["nodes"]:
            js = (n.get("parameters") or {}).get("jsCode")
            if not js:
                continue
            f = d / "nodes" / f"{safe_name(n['name'])}.js"
            f.write_text(js)
            manifest["nodes"][n["name"]] = {
                "sha256": hashlib.sha256(js.encode()).hexdigest(),
                "lines": len(js.splitlines()), "file": f.name,
            }

        clean = {k: v for k, v in wf.items() if k not in VOLATILE}
        (d / "workflow.json").write_text(json.dumps(clean, indent=2, sort_keys=True) + "\n")
        (d / "TOPOLOGY.md").write_text(topology(wf))
        manifest["workflow_json_sha256"] = hashlib.sha256(
            (d / "workflow.json").read_bytes()).hexdigest()
        (d / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

        flag = "" if wf.get("versionId") == wf.get("activeVersionId") else "  ⚠️ DRAFT != ACTIVE"
        print(f"  ✓ {slug:38} v={str(wf.get('versionId'))[:8]} "
              f"{len(wf['nodes']):3} nodes  {len(manifest['nodes']):2} code files{flag}")


def do_verify(base, key):
    """Cheap freshness gate. Exit 1 if any export is stale — fail loud, never silent."""
    stale = []
    for wid, slug in TARGETS.items():
        m = OUT / slug / "MANIFEST.json"
        if not m.exists():
            print(f"  ? {slug}: never exported")
            stale.append(slug)
            continue
        man = json.loads(m.read_text())
        try:
            wf = fetch(base, key, wid)
        except urllib.error.HTTPError as e:
            print(f"  ! {slug}: HTTP {e.code}")
            stale.append(slug)
            continue
        if wf.get("versionId") != man.get("versionId"):
            print(f"  ✗ {slug}: STALE — export {str(man.get('versionId'))[:8]} "
                  f"vs live {str(wf.get('versionId'))[:8]}")
            stale.append(slug)
        else:
            print(f"  ✓ {slug}: current ({str(man.get('versionId'))[:8]})")
    if stale:
        print(f"\n🚩 {len(stale)} STALE. Do NOT trust these exports — re-run the export first.")
        return 1
    print("\nAll exports current — safe to read.")
    return 0


if __name__ == "__main__":
    base, key = env()
    if "--verify" in sys.argv:
        sys.exit(do_verify(base, key))
    print(f"exporting -> {OUT}")
    do_export(base, key)
    print("\nRun after every promote / clone build. Verify before trusting:"
          "\n  python3 n8n-workflows-init/scripts/export-workflows.py --verify")
