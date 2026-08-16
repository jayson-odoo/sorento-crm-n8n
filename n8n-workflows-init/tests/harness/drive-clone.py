#!/usr/bin/env python3
"""Drive the fail-closed clone via zz-canary-run. UAC mode: real CRM reads, zero egress."""
import json, sys, time, urllib.request

env = {}
for line in open("/Users/tehjayson/Documents/foundryx/sorento_crm_n8n/.env"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")

BASE = env["N8N_BASE_URL"].rstrip("/")
CONTACT_ID = 437264483

def run(tag, text, contact_id=CONTACT_ID):
    ts = int(time.time() * 1000)
    contact = {
        "id": contact_id, "firstName": "Jayson", "lastName": "", "phone": "+60123456789",
        "countryCode": "MY", "status": "open",
        "custom_fields": [{"name": "is_human_intervened", "value": "false"}],
    }
    item = {
        "mode": "uac",
        "test_run_id": tag,
        "contact": contact,
        "message": {
            "event_type": "message.received",
            "contact": contact,
            "message": {
                "messageId": ts, "contactId": contact_id, "channelId": 453209,
                "traffic": "incoming", "timestamp": ts,
                "message": {"type": "text", "text": text},
            },
        },
    }
    body = json.dumps({"test_run_id": tag, "contact": contact_id, "item": item}).encode()
    req = urllib.request.Request(
        BASE + "/webhook/zz-run-hint", data=body,
        headers={"Content-Type": "application/json",
                 "User-Agent": "curl/8.7.1"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)

if __name__ == "__main__":
    tag, text = sys.argv[1], sys.argv[2]
    out = run(tag, text)
    print(json.dumps(out, indent=1)[:6000])
