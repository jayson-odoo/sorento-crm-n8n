#!/usr/bin/env python3
"""REGRESSION: promotion -> container-status transition must not carry brand/category.

Reproduces live exec 11818957: a promotion turn leaves brand='Sorento' /
category='pop up waste' in state; the next turn "Container status report" routed correctly to
resource_attachment but CARRIED both, 'Sorento' fuzzy-matched promotion PDFs, and the customer got
"Couldn't pin down Sorento" + promo PDFs instead of the container file.

Injects the carried state directly rather than replaying two turns, so the assertion is on the
mechanism (the blocklist) and not on whatever the previous turn happened to produce.
"""
import json, subprocess, sys, time, uuid, os
env = {}
for line in open('.env'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); env[k] = v.strip().strip('"').strip("'")
BASE = env['N8N_BASE_URL'].rstrip('/'); API = env['N8N_API_BASE'].rstrip('/'); KEY = env['N8N_API_KEY']
CLONE = 'txiPzSxy3Pclsz6v'; CONTACT = int(env.get('CONTACT_FULL_ACCESS', '437264483'))

# The state a promotion turn leaves behind — verbatim shape from live exec 11818957.
CARRIED = {
    "domain": "promotion",
    "entities": [
        {"raw": "Sorento",      "hint": "brand",    "canonical_code": None, "current_message": True, "confident": True},
        {"raw": "pop up waste", "hint": "category", "canonical_code": None, "current_message": True, "confident": True},
    ],
}

def api(p):
    return json.loads(subprocess.run(['curl','-sS','-H',f'X-N8N-API-KEY: {KEY}',f'{API}{p}'],capture_output=True,text=True).stdout)

def run(text, rid):
    contact = {"id": CONTACT, "firstName": "Dev", "lastName": "Tester", "phone": f"+{CONTACT}",
               "countryCode": "MY", "status": "open",
               "custom_fields": [{"name": "is_human_intervened", "value": "false"}]}
    item = {"mode": "uac", "test_run_id": rid, "previous_conversation_state": CARRIED, "contact": contact,
            "message": {"event_type": "message.received", "contact": contact,
                        "message": {"messageId": f"carry-{uuid.uuid4().hex[:8]}", "contactId": CONTACT,
                                    "channelId": 1, "traffic": "incoming", "timestamp": int(time.time()),
                                    "message": {"type": "text", "text": text}}}}
    before = api(f'/executions?workflowId={CLONE}&limit=1')['data'][0]['id']
    open('/tmp/carry.json','w').write(json.dumps({"test_run_id": rid, "contact": CONTACT, "item": item}))
    subprocess.run(['curl','-sS','-m','150','-X','POST','-H','Content-Type: application/json',
                    f'{BASE}/webhook/zz-run-hint','--data','@/tmp/carry.json'],capture_output=True,text=True)
    for _ in range(30):
        cur = api(f'/executions?workflowId={CLONE}&limit=1')['data'][0]['id']
        if cur != before: return cur
        time.sleep(3)
    return None

eid = run("Container status report", 'carry-' + uuid.uuid4().hex[:6])
d = api(f'/executions/{eid}?includeData=true')
rd = d['data']['resultData']['runData']
def out(n):
    for x in rd.get(n, []):
        for b in (x.get('data', {}).get('main') or []):
            if b: return b[0].get('json')
p = out("Call 'sub-query-reformulator'") or {}
o = p.get('output', p)
if isinstance(o, str): o = json.loads(o)
ents = o.get('entities') or []
hints = [e.get('hint') for e in ents]
resp = None
for c in ('compile-current-state','validator','escalate-catalog'):
    v = out(c)
    if v and v.get('user_response'): resp = v['user_response']; break

checks = [
    ("routes to resource_attachment", o.get('domain_hint') == 'resource_attachment', o.get('domain_hint')),
    ("carried 'brand' DROPPED",       'brand' not in hints,                          hints),
    ("carried 'category' DROPPED",    'category' not in hints,                       hints),
    ("the document entity SURVIVES",  any(e.get('hint') == 'attachment' for e in ents), hints),
    ("no 'Couldn't pin down' in reply", "pin down" not in (resp or ''),              (resp or '')[:70]),
    ("no promotion PDF in reply",     'PROMO' not in (resp or '').upper(),           (resp or '')[:70]),
    ("container file returned",       'Container Status' in (resp or ''),            (resp or '')[:70]),
]
print(f'exec {eid}  domain={o.get("domain_hint")}  entity hints={hints}')
fail = 0
for name, ok, got in checks:
    if not ok: fail += 1
    print(f'  {"PASS" if ok else "FAIL"}  {name}' + ('' if ok else f'   got: {got}'))
print(f'\n--- reply ---\n{(resp or "")[:300]}')
sys.exit(1 if fail else 0)
