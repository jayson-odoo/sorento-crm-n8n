#!/usr/bin/env python3
"""Generate zz-THROWAWAY-s32-pinmatrix programmatically from the fork JSON.

Byte-identical in nodes+connections EXCEPT 5 name-preserving Code stand-ins.

Committed as provenance for tests/diffs/intervention-tickets-s32/throwaway-build.md.
To re-run it, drop a fresh `fork.json` (a full REST `GET /workflows/vUfFUDjLAuMaeQE6`)
and the `standins/` directory beside this file. `fork.json` is deliberately NOT
committed — a full GET dump is a secret at rest (LESSONS §59b). The script hard-aborts
unless that dump is still at versionId fdc154b5-cb33-416c-a468-517fff59dc5e, so it
cannot silently regenerate against a drifted fork.
It emits `create-body.json`; POST it to /workflows, then publish.
"""
import copy
import json
import os
import pathlib

SD = pathlib.Path(__file__).parent
FORK = json.loads((SD / "fork.json").read_text())

FORK_VERSION_EXPECTED = "fdc154b5-cb33-416c-a468-517fff59dc5e"
assert FORK["versionId"] == FORK_VERSION_EXPECTED, (
    "FORK DRIFTED: %s != %s" % (FORK["versionId"], FORK_VERSION_EXPECTED)
)

NAME = "zz-THROWAWAY-s32-pinmatrix (DISPOSABLE — delete after S3.2 V2 sign-off)"

# node name -> stand-in source file
STANDINS = {
    "get-round-robin-assignee": "get-round-robin-assignee.js",
    "Assign or unassign a Conversation1": "assign-or-unassign.js",
    "conversation-sla-tracking-create": "conversation-sla-tracking-create.js",
    "get-working-days": "get-working-days.js",
    "Call 'sub-add-comment-respond'": "call-sub-add-comment-respond.js",
}

nodes = []
for n in FORK["nodes"]:
    n = copy.deepcopy(n)
    if n["name"] in STANDINS:
        js = (SD / "standins" / STANDINS[n["name"]]).read_text()
        # keep name / id / position; drop credentials; become a Code node
        nodes.append({
            "id": n["id"],
            "name": n["name"],
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": n["position"],
            "parameters": {"mode": "runOnceForEachItem", "jsCode": js},
        })
    else:
        nodes.append(n)

settings = dict(FORK.get("settings") or {})
settings.pop("binaryMode", None)
settings.pop("timeSavedMode", None)

body = {
    "name": NAME,
    "nodes": nodes,
    "connections": copy.deepcopy(FORK["connections"]),
    "settings": settings,
}

# no trailing whitespace anywhere in any string parameter (LESSONS §58b)
def scan(o, path=""):
    bad = []
    if isinstance(o, dict):
        for k, v in o.items():
            bad += scan(v, path + "/" + str(k))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            bad += scan(v, path + "/" + str(i))
    elif isinstance(o, str):
        for ln, line in enumerate(o.split("\n")):
            if line != line.rstrip():
                bad.append((path, ln, repr(line)))
    return bad

ws = scan(body["nodes"])
if ws:
    for b in ws:
        print("TRAILING WS", b)
    raise SystemExit("aborting: trailing whitespace in payload")

(SD / "create-body.json").write_text(json.dumps(body, indent=2, ensure_ascii=False))
print("payload written; nodes=%d standins=%d" % (len(nodes), len(STANDINS)))
