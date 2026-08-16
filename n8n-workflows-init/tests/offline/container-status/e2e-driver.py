#!/usr/bin/env python3
"""End-to-end clone driver for the container-status build.

Drives the REAL clone against the REAL CRM (reads only) and reports, per scenario:
  - what the parser decided (domain_hint / intent_hint / requested_attributes)
  - whether the CRM served `key` on render fields  (the #109 deploy gate)
  - which field LABELS survived the projection
  - the customer-facing response
  - egress guard rows

Safety: mode=uac, previous_conversation_state={} (clean slate, no stale prod session),
clone's egress nodes are orphaned/sinked. CRM reads only.
"""
import json, subprocess, sys, time, uuid

env = {}
for line in open('.env'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k] = v.strip().strip('"').strip("'")

BASE = env['N8N_BASE_URL'].rstrip('/')
API = env['N8N_API_BASE'].rstrip('/')
KEY = env['N8N_API_KEY']
CLONE = 'txiPzSxy3Pclsz6v'
import os
CONTACT = int(os.environ.get("E2E_CONTACT") or env.get("CONTACT_FULL_ACCESS","437264483"))


def curl(args, timeout=180):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def api(path):
    r = curl(['curl', '-sS', '-H', f'X-N8N-API-KEY: {KEY}', f'{API}{path}'])
    return json.loads(r.stdout)


def build_item(text, run_id):
    contact = {
        "id": CONTACT, "firstName": "Dev", "lastName": "Tester",
        "phone": f"+{CONTACT}", "countryCode": "MY", "status": "open",
        "custom_fields": [{"name": "is_human_intervened", "value": "false"}],
    }
    return {
        "mode": "uac",
        "test_run_id": run_id,
        # {} is TRUTHY -> sim-inject-gate takes the injected-state arm, so the run does NOT
        # inherit 437264483's stale prod session (uac-mode-reads-prod-session). CRM tool
        # reads still go to the real CRM; only the SESSION source is injected.
        "previous_conversation_state": {},
        "contact": contact,
        "message": {
            "event_type": "message.received",
            "contact": contact,
            "message": {
                "messageId": f"e2e-{uuid.uuid4().hex[:10]}",
                "contactId": CONTACT,
                "channelId": 1,
                "traffic": "incoming",
                "timestamp": int(time.time()),
                "message": {"type": "text", "text": text},
            },
        },
    }


def latest_exec_id():
    d = api(f'/executions?workflowId={CLONE}&limit=1')
    rows = d.get('data', [])
    return rows[0]['id'] if rows else None


def run(text, run_id, wait=150):
    before = latest_exec_id()
    payload = {"test_run_id": run_id, "contact": CONTACT, "item": build_item(text, run_id)}
    p = '/tmp/e2e_payload.json'
    open(p, 'w').write(json.dumps(payload))
    r = curl(['curl', '-sS', '-m', str(wait), '-X', 'POST', '-H', 'Content-Type: application/json',
              f'{BASE}/webhook/zz-run-hint', '--data', '@' + p], timeout=wait + 20)
    hook = None
    try:
        hook = json.loads(r.stdout)
    except Exception:
        hook = {'raw': r.stdout[:400]}
    # find the execution this produced
    eid = None
    for _ in range(30):
        cur = latest_exec_id()
        if cur and cur != before:
            eid = cur
            break
        time.sleep(3)
    return hook, eid


def node_out(data, name):
    """Return the first json item output by `name`, or None."""
    rd = (((data or {}).get('data') or {}).get('resultData') or {}).get('runData') or {}
    runs = rd.get(name)
    if not runs:
        return None
    for run_ in runs:
        main = ((run_.get('data') or {}).get('main') or [])
        for branch in main:
            if branch:
                return branch[0].get('json')
    return None


def analyse(eid):
    d = api(f'/executions/{eid}?includeData=true')
    rd = (((d or {}).get('data') or {}).get('resultData') or {}).get('runData') or {}
    out = {'exec': eid, 'status': d.get('status'), 'nodes_run': len(rd)}

    parser = node_out(d, "Call 'sub-query-reformulator'")
    if parser:
        o = parser.get('output', parser)
        if isinstance(o, str):
            try: o = json.loads(o)
            except Exception: o = {}
        out['domain_hint'] = o.get('domain_hint')
        out['intent_hint'] = o.get('intent_hint')
        out['requested_attributes'] = o.get('requested_attributes')
        out['entities'] = [
            {'raw': e.get('raw'), 'hint': e.get('hint'), 'cc': e.get('canonical_code')}
            for e in (o.get('entities') or [])
        ]

    gr = node_out(d, "Call 'sub-get-results'")
    if gr:
        out['keys_served'] = gr.get('keys_served')
        out['gr_requested'] = gr.get('requested_attributes')
        answers = gr.get('answers') or []
        out['rows'] = len(answers)
        if answers:
            f0 = answers[0].get('fields') or []
            out['labels'] = [f.get('label') for f in f0]
            out['keys'] = [f.get('key') for f in f0 if 'key' in f]
        fa = gr.get('field_access')
        out['denied'] = [x.get('field') for x in ((fa or {}).get('denied') or [])] if fa else None

    for cand in ('compile-current-state', 'validator'):
        v = node_out(d, cand)
        if v and v.get('user_response'):
            out['response'] = v['user_response']
            break
    if 'response' not in out and gr:
        out['response'] = gr.get('response')
    out['ran'] = sorted(rd.keys())
    return out


if __name__ == '__main__':
    text = sys.argv[1]
    rid = sys.argv[2] if len(sys.argv) > 2 else 'e2e-' + uuid.uuid4().hex[:6]
    hook, eid = run(text, rid)
    print('run_id', rid, '| webhook keys:', list(hook.keys()) if isinstance(hook, dict) else '?')
    if not eid:
        print('NO EXECUTION FOUND'); sys.exit(1)
    res = analyse(eid)
    for k in ('exec', 'status', 'domain_hint', 'intent_hint', 'requested_attributes', 'entities',
              'keys_served', 'gr_requested', 'rows', 'labels', 'keys', 'denied'):
        if k in res:
            print(f'{k:22} {json.dumps(res[k], ensure_ascii=False)}')
    print('--- response ---')
    print(res.get('response'))
    open(f'/tmp/e2e-{rid}.json', 'w').write(json.dumps(res, ensure_ascii=False, indent=2))
