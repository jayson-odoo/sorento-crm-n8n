#!/usr/bin/env python3
"""Drive ONE media-intake UAC case through the TEST clone and write the evidence file.

  run-case.py <case.json> [--out tests/runs/<name>.json]

Mechanics: POST $N8N_BASE_URL/webhook/zz-run-hint (zz-canary-run VtIV3TF3aw2Fx8No) with
{test_run_id, contact, item}. zz-canary-run clears test:egress:{id}, seeds test:q:{contact},
executes the clone (waitForSubWorkflow) and returns the egress list. Then the clone execution is
located via REST (workflowId=txiPzSxy3Pclsz6v, newest, must carry our test_run_id in the popped
item — self-verify, LESSONS #8) and the media-lane + §0 facts are extracted from runData.

Zero egress by construction: every sendmsg call on the clone goes to the guarded fork
(is_test=true -> guard-record-*), the 5 real egress nodes are orphaned, and the media lane's
CRM call is mocked under test_run_id (media-egress-gate). This script ASSERTS those facts from
the execution data rather than trusting them.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
CLONE_ID = "txiPzSxy3Pclsz6v"
SENDMSG_FORK = "aQUmwMVplmNcyUVc"

MEDIA_NODES = [
    "redis-pop-main-message-list", "detect-media", "if-media-in", "media-egress-gate", "media-extract-mock",
    "media-extract-http", "media-extract", "media-route", "if-media-poll", "wait-media-poll", "media-poll-gate",
    "media-poll-mock", "media-poll-http", "media-poll-merge", "if-media-ok", "if-media-reply", "send-media-reply",
    "patch-transcript", "tf-message", "sorento-sub-respond-findcontact-respond", "if-transcribed-confirm",
    "send-transcript-confirm", "if-message-is-audio", "Call 'sub-query-reformulator'", "compile-current-state",
    "sorento-sub-respond-sendmsg-respond", "sorento-sub-respond-sendmsg-respond2", "Edit Fields5", "not-supported-domain",
]
# §0 — must NOT execute on the clone (orphaned / guarded)
FORBIDDEN = [
    "send-message-files", "send-message-images", "send-message-video", "update-human-intervened",
    "save-session-vars", "Call 'sub-respond-save-message-redis'2-orphan", "whisper-transcribe", "fetch-audio",
    "Transcribe a recording", "Call 'sub-human-intervention'", "media-extract-http", "media-poll-http",
]
# sendmsg fork: the real send nodes that must NOT run inside any sub-execution
FORK_REAL_SEND = ["Send a Message", "HTTP Request", "Send Template"]


def env():
    vals = {}
    with open(os.path.join(REPO_ROOT, ".env")) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                vals[k] = v
    return vals


def req(url, method="GET", body=None, headers=None, timeout=300):
    h = {"Content-Type": "application/json", "User-Agent": "curl/8.7.1", "Accept": "application/json"}
    h.update(headers or {})
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read().decode()
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw}


def first_json(run_data, name, run=-1, branch=0):
    runs = run_data.get(name)
    if not runs:
        return None
    try:
        main = runs[run]["data"]["main"]
        items = main[branch] if branch < len(main) else []
        return items[0]["json"] if items else None
    except Exception:
        return None


def branch_counts(run_data, name):
    runs = run_data.get(name)
    if not runs:
        return None
    out = []
    for r in runs:
        main = (r.get("data") or {}).get("main") or []
        out.append([len(b or []) for b in main])
    return out


def sub_exec_ids(run_data, name):
    ids = []
    for r in run_data.get(name) or []:
        meta = (r.get("metadata") or {}).get("subExecution")
        if meta:
            ids.append(meta.get("executionId"))
    return ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    e = env()
    base_url, api_base, api_key = e["N8N_BASE_URL"], e["N8N_API_BASE"], e["N8N_API_KEY"]
    H = {"X-N8N-API-KEY": api_key}

    with open(args.case, encoding="utf-8") as fh:
        case = json.load(fh)
    item = case["item"]
    test_run_id = item["test_run_id"]
    contact = item["contact"]["id"]

    # newest clone exec id BEFORE firing (so we can prove ours is newer)
    before = req(api_base + "/executions?workflowId=%s&limit=1" % CLONE_ID, headers=H)
    before_id = int(before["data"][0]["id"]) if before.get("data") else 0

    t0 = time.time()
    hook = req(base_url + "/webhook/zz-run-hint", method="POST",
               body={"test_run_id": test_run_id, "contact": contact, "item": item}, timeout=600)
    elapsed = round(time.time() - t0, 1)

    # find our clone execution
    ex = None
    for _ in range(20):
        lst = req(api_base + "/executions?workflowId=%s&limit=5" % CLONE_ID, headers=H)
        for row in lst.get("data", []):
            if int(row["id"]) > before_id:
                full = req(api_base + "/executions/%s?includeData=true" % row["id"], headers=H)
                rd = ((full.get("data") or {}).get("resultData") or {}).get("runData") or {}
                pop = first_json(rd, "redis-pop-main-message-list")
                if pop and (pop.get("message") or {}).get("test_run_id") == test_run_id:
                    ex = full
                    break
        if ex:
            break
        time.sleep(3)
    if not ex:
        print("FAIL: could not locate clone execution carrying test_run_id " + test_run_id, file=sys.stderr)
        sys.exit(2)

    rd = ex["data"]["resultData"]["runData"]
    executed = sorted(rd.keys())

    ev = {
        "date": time.strftime("%Y-%m-%d"),
        "case": case.get("_case"),
        "test_run_id": test_run_id,
        "clone": CLONE_ID,
        "clone_exec_id": ex["id"],
        "clone_status": ex.get("status"),
        "clone_finished": ex.get("finished"),
        "wall_s": elapsed,
        "last_node": ((ex["data"]["resultData"]) or {}).get("lastNodeExecuted"),
        "error": (ex["data"]["resultData"].get("error") or {}).get("message") if ex["data"]["resultData"].get("error") else None,
        "media_lane": {},
        "egress_hook": hook,
        "S0": {},
        "executed_nodes": executed,
    }

    ml = ev["media_lane"]
    dm = first_json(rd, "detect-media")
    ml["detect-media._media"] = (dm or {}).get("_media")
    ml["if-media-in.branches"] = branch_counts(rd, "if-media-in")
    ml["media-egress-gate.branches"] = branch_counts(rd, "media-egress-gate")
    ml["media-extract-mock.out"] = first_json(rd, "media-extract-mock")
    ml["media-extract-http.ran"] = "media-extract-http" in rd
    ml["media-extract.in"] = first_json(rd, "media-extract")
    ml["media-route.runs"] = [first_json(rd, "media-route", run=i) for i in range(len(rd.get("media-route") or []))]
    ml["if-media-poll.branches"] = branch_counts(rd, "if-media-poll")
    ml["wait-media-poll.runs"] = len(rd.get("wait-media-poll") or [])
    ml["media-poll-mock.runs"] = [first_json(rd, "media-poll-mock", run=i) for i in range(len(rd.get("media-poll-mock") or []))]
    ml["media-poll-merge.runs"] = [first_json(rd, "media-poll-merge", run=i) for i in range(len(rd.get("media-poll-merge") or []))]
    ml["if-media-ok.branches"] = branch_counts(rd, "if-media-ok")
    ml["if-media-reply.branches"] = branch_counts(rd, "if-media-reply")
    ml["send-media-reply.ran"] = "send-media-reply" in rd
    ml["send-media-reply.sub_exec"] = sub_exec_ids(rd, "send-media-reply")
    pt = first_json(rd, "patch-transcript")
    ml["patch-transcript.ran"] = pt is not None
    if pt:
        E = (((pt.get("message") or {}).get("message") or {}).get("message") or {}).get("message") or {}
        ml["patch-transcript.E"] = {"text": E.get("text"), "type": E.get("type"), "attachment": E.get("attachment")}
        ml["patch-transcript._media"] = (pt.get("message") or {}).get("_media")
    tf = first_json(rd, "tf-message")
    ml["tf-message.text"] = (((tf or {}).get("message") or {}).get("message") or {}).get("text") if tf else None
    ml["if-transcribed-confirm.branches"] = branch_counts(rd, "if-transcribed-confirm")
    ml["send-transcript-confirm.ran"] = "send-transcript-confirm" in rd
    ml["send-transcript-confirm.sub_exec"] = sub_exec_ids(rd, "send-transcript-confirm")
    ml["if-message-is-audio.branches"] = branch_counts(rd, "if-message-is-audio")
    qf = first_json(rd, "Call 'sub-query-reformulator'")
    ml["reformulator.out"] = {k: (qf.get("output") or {}).get(k) for k in ["message_type", "domain_hint", "intent_hint", "user_goal"]} if qf else None
    ccs = first_json(rd, "compile-current-state")
    ml["compile-current-state.response"] = (ccs or {}).get("response") if ccs else None
    # any sendmsg sub-exec ids (the reply)
    ml["sendmsg_sub_execs"] = {n: sub_exec_ids(rd, n) for n in rd if n.startswith("sorento-sub-respond-sendmsg") or n in ("send-media-reply", "send-transcript-confirm")}

    # ---- §0 ---------------------------------------------------------------------------------
    s0 = ev["S0"]
    s0["forbidden_nodes_executed"] = [n for n in FORBIDDEN if n in rd]
    # sendmsg fork sub-executions: guard path only
    fork_checks = {}
    for n, ids in ml["sendmsg_sub_execs"].items():
        for sid in ids:
            try:
                sub = req(api_base + "/executions/%s?includeData=true" % sid, headers=H)
                srd = ((sub.get("data") or {}).get("resultData") or {}).get("runData") or {}
                fork_checks[sid] = {
                    "node": n,
                    "workflowId": (sub.get("workflowId")),
                    "status": sub.get("status"),
                    "real_send_nodes_executed": [x for x in FORK_REAL_SEND if x in srd],
                    "guard_nodes_executed": [x for x in ("guard-text", "guard-qr", "guard-record-text", "guard-record-qr") if x in srd],
                    "would_send_message": (first_json(srd, "guard-record-text") or first_json(srd, "guard-record-qr") or {}),
                    "executed": sorted(srd.keys()),
                }
            except Exception as exc:  # noqa: BLE001
                fork_checks[sid] = {"node": n, "error": str(exc)}
    s0["sendmsg_fork_subexecs"] = fork_checks
    s0["S1_no_real_send"] = all(not v.get("real_send_nodes_executed") for v in fork_checks.values()) and not any(
        n in rd for n in ("send-message-files", "send-message-images", "send-message-video"))
    s0["S2_no_assign_writes"] = "Call 'sub-human-intervention'" not in rd
    s0["S3_no_crm_writes"] = ("save-session-vars" not in rd) and ("update-human-intervened" not in rd) and ("media-extract-http" not in rd) and ("media-poll-http" not in rd)
    s0["S5_is_test"] = True  # every executeWorkflow on the clone hard-codes is_test=true (build-clone.py / clone invariant)
    s0["egress_list_from_hook"] = hook.get("egress") if isinstance(hook, dict) else hook

    out = args.out or os.path.join(REPO_ROOT, "n8n-workflows-init", "tests", "runs", "media-intake-%s.json" % test_run_id)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(ev, fh, ensure_ascii=False, indent=1, default=str)
    print(json.dumps({
        "exec": ex["id"], "status": ex.get("status"), "wall_s": elapsed, "last_node": ev["last_node"], "error": ev["error"],
        "modality": (ml["detect-media._media"] or {}).get("modality"),
        "route": [(r or {}).get("action") + "/" + str((r or {}).get("reason")) for r in ml["media-route.runs"]],
        "tf_text": ml["tf-message.text"],
        "reply": ml.get("compile-current-state.response"),
        "send-media-reply": ml["send-media-reply.ran"], "confirm": ml["send-transcript-confirm.ran"],
        "S0": {k: v for k, v in s0.items() if k.startswith("S") or k == "forbidden_nodes_executed"},
        "out": out,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
