#!/usr/bin/env python3
"""Build the MEDIA INTAKE lane onto the TEST clone (txiPzSxy3Pclsz6v) — byte-exact, one PUT.

Usage:
  build-clone.py --expect-version <versionId> [--dry-run] [--out staged.json]

Mechanics (LESSONS #25/#32-33, memory n8n-rest-put-byte-exact):
  * fresh GET of the clone; REFUSE unless .versionId == --expect-version (concurrent-edit guard);
  * assemble nodes/connections in Python from the repo files in tests/diffs/media-intake/;
  * PUT {name,nodes,connections,settings:{executionOrder}} — this instance auto-activates on PUT;
  * verify the new activeVersionId == versionId and sha the jsCode bodies against the repo files.

NEVER point this at the live spine. The target id is hard-coded to the clone.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
import uuid

CLONE_ID = "txiPzSxy3Pclsz6v"
LIVE_ID = "9qVyfUxmRQqrpGRMDLRuz"
HERE = os.path.dirname(os.path.abspath(__file__))
DIFFS = os.path.normpath(os.path.join(HERE, "..", "diffs", "media-intake"))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))

SENDMSG_FORK = "aQUmwMVplmNcyUVc"  # clone's guarded sendmsg fork (sub-sendmsg-QRCHUNK)
CRM_BASE = "https://fe-sorento.foundryx.my"
CRM_CRED = {"httpHeaderAuth": {"id": "mNsZWyU82NYV58k2", "name": "crm-n8n-auth"}}

POP = "$('redis-pop-main-message-list').first().json.message"
EGRESS_GATE_EXPR = (
    "={{ (" + POP + ".test_run_id && " + POP + ".scope !== 'chat-ui') ? true : false }}"
)

# ---------------------------------------------------------------------------------------------


def env():
    vals = {}
    with open(os.path.join(REPO_ROOT, ".env")) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k] = v
    return vals["N8N_API_BASE"], vals["N8N_API_KEY"]


def api(method, path, body=None):
    base, key = env()
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"X-N8N-API-KEY": key, "Content-Type": "application/json", "User-Agent": "curl/8.7.1", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def read(name):
    with open(os.path.join(DIFFS, name), encoding="utf-8") as fh:
        return fh.read()


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:8]


def if_node(name, left, pos, *, boolean=True, right=True):
    cond = {
        "id": name + "-c1",
        "leftValue": left,
        "rightValue": right if not boolean else True,
        "operator": {"type": "boolean", "operation": "true", "singleValue": True}
        if boolean
        else {"type": "string", "operation": "equals"},
    }
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": [cond],
                "combinator": "and",
            },
            "options": {},
        },
        "name": name,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.3,
        "position": pos,
    }


def code_node(name, filename, pos):
    return {
        "parameters": {"jsCode": read(filename)},
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos,
    }


def noop(name, pos):
    return {"parameters": {}, "name": name, "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": pos}


MEDIA_BODY_EXPR = read("media-extract-http.jsonBody.expr.txt").rstrip("\n")


def http_extract(pos):
    return {
        "parameters": {
            "method": "POST",
            "url": CRM_BASE + "/api/v1/external/media/process",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"}]},
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": MEDIA_BODY_EXPR,
            "options": {"timeout": 40000},
        },
        "name": "media-extract-http",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "credentials": CRM_CRED,
        # PLAN §1.2: retryOnFail is FREE thanks to the idempotency key; onError must NOT be
        # continueErrorOutput-with-unwired-output (documented incident). continueRegularOutput
        # hands media-route an {error} item so a timeout/5xx becomes a customer reply, never a
        # dead turn. 40 s × 2 tries + 1 s < the 120 s dispatcher lock even with an 18 s spine.
        "retryOnFail": True,
        "maxTries": 2,
        "waitBetweenTries": 1000,
        "onError": "continueRegularOutput",
    }


def http_poll(pos):
    return {
        "parameters": {
            "method": "GET",
            "url": "=" + CRM_BASE + "/api/v1/external/media/jobs/{{ $json.job_id }}",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "options": {"timeout": 15000},
        },
        "name": "media-poll-http",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "credentials": CRM_CRED,
        "onError": "continueRegularOutput",
    }


def wait_node(pos):
    return {
        "parameters": {"amount": "={{ $json.poll_wait_s }}"},
        "name": "wait-media-poll",
        "type": "n8n-nodes-base.wait",
        "typeVersion": 1.1,
        "position": pos,
    }


def send_media_reply(pos):
    return {
        "parameters": {
            "workflowId": {
                "__rl": True,
                "value": SENDMSG_FORK,
                "mode": "list",
                "cachedResultName": "sub-sendmsg-QRCHUNK",
                "cachedResultUrl": "/workflow/" + SENDMSG_FORK,
            },
            "workflowInputs": {
                "mappingMode": "defineBelow",
                "value": {
                    "contact_identifer": "={{ " + POP + ".contact.id }}",
                    "message": "={{ $json.reply_text }}",
                    "input_message": "=[{{ $json.modality === 'image' ? 'image' : 'voice note' }}] {{ " + POP + ".messageId }}",
                    "contact": "={{ " + POP + ".contact }}",
                    "is_test": True,
                    "test_run_id": "={{ " + POP + ".test_run_id }}",
                    "turn_id": "={{ $execution.id }}",
                },
                "matchingColumns": [],
                "schema": [],
                "attemptToConvertTypes": False,
                "convertFieldsToString": True,
            },
            "options": {},
        },
        "name": "send-media-reply",
        "type": "n8n-nodes-base.executeWorkflow",
        "typeVersion": 1.3,
        "position": pos,
    }


def build(wf):
    nodes = wf["nodes"]
    conns = wf["connections"]
    by_name = {n["name"]: n for n in nodes}

    # ---- sanity: anchors we rely on must exist --------------------------------------------
    for must in ["redis-pop-main-message-list", "tf-message", "patch-transcript", "if-transcribed-confirm",
                 "send-transcript-confirm", "if-audio-b64", "decode-audio-b64", "whisper-transcribe"]:
        assert must in by_name, "anchor node missing on clone: " + must
    for new in ["detect-media", "if-media-in", "media-egress-gate", "media-extract-mock", "media-extract-http",
                "media-extract", "media-route", "if-media-poll", "wait-media-poll", "media-poll-gate",
                "media-poll-mock", "media-poll-http", "media-poll-merge", "if-media-ok", "if-media-reply",
                "send-media-reply", "console-whisper-adapter"]:
        assert new not in by_name, "name collision on clone: " + new

    # ---- remove the legacy Whisper lane (kept in the PRE backup) ----------------------------
    remove = ["if-audio-in", "if-voice-allowed", "if-audio-mock", "fetch-audio", "send-voice-not-allowed"]
    removed = [n for n in remove if n in by_name]
    nodes[:] = [n for n in nodes if n["name"] not in remove]
    for r in remove:
        conns.pop(r, None)
    # whisper-transcribe -> patch-transcript becomes whisper-transcribe -> console-whisper-adapter
    conns["whisper-transcribe"] = {"main": [[{"node": "console-whisper-adapter", "type": "main", "index": 0}]]}
    # if-audio-b64: [0] decode (unchanged) ; [1] -> tf-message (was fetch-audio)
    conns["if-audio-b64"] = {"main": [
        [{"node": "decode-audio-b64", "type": "main", "index": 0}],
        [{"node": "tf-message", "type": "main", "index": 0}],
    ]}
    # redis-pop -> detect-media (was if-audio-in)
    conns["redis-pop-main-message-list"] = {"main": [[{"node": "detect-media", "type": "main", "index": 0}]]}

    # ---- positions: the old lane lived around x≈-1700..-900, y≈3200..3500 -----------------
    X0, Y0 = -2100, 3700
    P = lambda col, row: [X0 + col * 240, Y0 + row * 200]

    new_nodes = [
        code_node("detect-media", "detect-media.js", P(0, 0)),
        if_node("if-media-in", "={{ $json._media && $json._media.modality ? true : false }}", P(1, 0)),
        if_node("media-egress-gate", EGRESS_GATE_EXPR, P(2, -1)),
        code_node("media-extract-mock", "media-extract-mock.js", P(3, -2)),
        http_extract(P(3, -1)),
        noop("media-extract", P(4, -1)),
        code_node("media-route", "media-route.js", P(5, -1)),
        if_node("if-media-poll", "={{ $json.action === 'poll' }}", P(6, -1)),
        wait_node(P(7, -3)),
        if_node("media-poll-gate", EGRESS_GATE_EXPR, P(8, -3)),
        code_node("media-poll-mock", "media-poll-mock.js", P(9, -4)),
        http_poll(P(9, -3)),
        code_node("media-poll-merge", "media-poll-merge.js", P(10, -3)),
        if_node("if-media-ok", "={{ $json.action === 'continue' }}", P(7, -1)),
        if_node("if-media-reply", "={{ $json.action === 'reply' }}", P(8, 0)),
        send_media_reply(P(9, 0)),
        code_node("console-whisper-adapter", "console-whisper-adapter.js", P(6, 2)),
    ]
    for n in new_nodes:
        n["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "sorento-media-intake/" + n["name"]))
    nodes.extend(new_nodes)

    def edge(src, out_idx, dst):
        conns.setdefault(src, {"main": []})
        while len(conns[src]["main"]) <= out_idx:
            conns[src]["main"].append([])
        conns[src]["main"][out_idx].append({"node": dst, "type": "main", "index": 0})

    edge("detect-media", 0, "if-media-in")
    edge("if-media-in", 0, "media-egress-gate")
    edge("if-media-in", 1, "if-audio-b64")
    edge("media-egress-gate", 0, "media-extract-mock")
    edge("media-egress-gate", 1, "media-extract-http")
    edge("media-extract-mock", 0, "media-extract")
    edge("media-extract-http", 0, "media-extract")
    edge("media-extract", 0, "media-route")
    edge("media-route", 0, "if-media-poll")
    edge("if-media-poll", 0, "wait-media-poll")
    edge("if-media-poll", 1, "if-media-ok")
    edge("wait-media-poll", 0, "media-poll-gate")
    edge("media-poll-gate", 0, "media-poll-mock")
    edge("media-poll-gate", 1, "media-poll-http")
    edge("media-poll-mock", 0, "media-poll-merge")
    edge("media-poll-http", 0, "media-poll-merge")
    edge("media-poll-merge", 0, "media-route")
    edge("if-media-ok", 0, "patch-transcript")
    edge("if-media-ok", 1, "if-media-reply")
    edge("if-media-reply", 0, "send-media-reply")
    conns["if-media-reply"]["main"].append([])  # explicit empty FALSE output (silent)
    edge("console-whisper-adapter", 0, "if-media-ok")

    # ---- patch-transcript: new body, same name/id/position -------------------------------
    by_name["patch-transcript"]["parameters"]["jsCode"] = read("patch-transcript.js")

    # ---- if-transcribed-confirm: gate on the CRM confirmation text, not attachment.type ---
    itc = by_name["if-transcribed-confirm"]
    itc["parameters"]["conditions"]["conditions"] = [{
        "id": "tc1",
        "leftValue": read("if-transcribed-confirm.expr.txt").rstrip("\n"),
        "rightValue": True,
        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
    }]
    itc["parameters"]["conditions"]["options"]["typeValidation"] = "loose"

    # ---- send-transcript-confirm: message = CRM confirmation (+ appended notices) ----------
    stc = by_name["send-transcript-confirm"]
    stc["parameters"]["workflowInputs"]["value"]["message"] = read("send-transcript-confirm.message.expr.txt").rstrip("\n")

    return {"removed": removed, "added": [n["name"] for n in new_nodes]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect-version", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    wf = api("GET", "/workflows/" + CLONE_ID)
    assert wf["id"] == CLONE_ID and wf["id"] != LIVE_ID
    if wf.get("versionId") != args.expect_version:
        print("REFUSE: clone versionId is %s, expected %s — concurrent edit? re-read before building"
              % (wf.get("versionId"), args.expect_version), file=sys.stderr)
        sys.exit(2)

    summary = build(wf)
    payload = {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": {"executionOrder": wf["settings"].get("executionOrder", "v1")},
    }
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(json.dumps({"removed": summary["removed"], "added": summary["added"], "nodes": len(payload["nodes"])}))
    if args.dry_run:
        return

    res = api("PUT", "/workflows/" + CLONE_ID, payload)
    after = api("GET", "/workflows/" + CLONE_ID)
    print(json.dumps({
        "put_versionId": res.get("versionId"),
        "after_versionId": after.get("versionId"),
        "after_activeVersionId": after.get("activeVersionId"),
        "active": after.get("active"),
        "nodes": len(after["nodes"]),
    }))
    # sha-verify every promoted jsCode body against the repo file
    names = {n["name"]: n for n in after["nodes"]}
    for name, fn in [("detect-media", "detect-media.js"), ("media-route", "media-route.js"),
                     ("media-poll-merge", "media-poll-merge.js"), ("patch-transcript", "patch-transcript.js"),
                     ("media-extract-mock", "media-extract-mock.js"), ("media-poll-mock", "media-poll-mock.js"),
                     ("console-whisper-adapter", "console-whisper-adapter.js")]:
        live = names[name]["parameters"]["jsCode"]
        ok = live == read(fn)
        print("%-26s %s %s" % (name, sha(live), "OK" if ok else "MISMATCH"))
        if not ok:
            sys.exit(3)


if __name__ == "__main__":
    main()
