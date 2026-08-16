#!/usr/bin/env bash
# ── assert-b1-present.sh ──────────────────────────────────────────────────────
# Run this FIRST in every test pass that claims anything about B1.
#
# WHY: B1 was silently reverted on the clone by a UI save on 2026-08-07 and went
# unnoticed for a day, because B2' (parser-side certificate eviction) shipped in the
# meantime and MASKS B1's absence — the customer-visible text is identical either way.
# A coder, two testers and a reviewer all passed over it. Behaviour looking right is
# NOT evidence the change is still there. Verify PRESENCE by node sha, every pass.
#
#   ./assert-b1-present.sh          # exits 0 only if the clone still carries B1
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
EXPECT_SHA="a8938abe2e5c0189c43d3af376c2689dc4597ea222520d6b28e5e01e33a4ea27"
PRE_B1_SHA="7626c83ebe7df2d2c4b116a699fe241f7f3f3d0ad2066e8028bca6bdd95c034f"
WID="txiPzSxy3Pclsz6v"

python3 - "$ROOT" "$WID" "$EXPECT_SHA" "$PRE_B1_SHA" <<'PY'
import sys, json, hashlib, pathlib, urllib.request
root, wid, expect, prb1 = sys.argv[1:5]
e = {}
for line in (pathlib.Path(root)/'.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, v = line.split('=', 1); e[k.strip()] = v.strip()
base = e['N8N_API_BASE'].rstrip('/')
req = urllib.request.Request(f"{base}/workflows/{wid}",
        headers={"X-N8N-API-KEY": e['N8N_API_KEY'], "User-Agent": "curl/8.4.0"})
wf = json.loads(urllib.request.urlopen(req, timeout=60).read())
n = [x for x in wf['nodes'] if x['name'] == 'disallowed-entity-gate']
if len(n) != 1:
    print("FATAL: disallowed-entity-gate not found (or duplicated)"); sys.exit(2)
sha = hashlib.sha256(n[0]['parameters']['jsCode'].encode()).hexdigest()
print(f"clone versionId : {wf['versionId']}")
print(f"draft == active : {wf['versionId'] == wf['activeVersionId']}")
print(f"gate sha256     : {sha}")
if sha == expect:
    print("RESULT: PASS — B1 is present."); sys.exit(0)
if sha == prb1:
    print("RESULT: FAIL — gate is the PRE-B1 body. B1 HAS BEEN REVERTED.")
    print("        Do NOT record any B1 result from this pass. Restore B1 first")
    print("        (tests/diffs/carried-certificate-dump-B1.md), then re-run.")
    sys.exit(1)
print("RESULT: FAIL — gate matches neither the pre-B1 nor the post-B1 body.")
print("        Someone else edited this node. Diff before doing anything.")
sys.exit(1)
PY
