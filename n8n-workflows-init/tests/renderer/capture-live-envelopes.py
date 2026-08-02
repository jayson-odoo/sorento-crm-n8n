"""Capture REAL render envelopes from the live CRM MCP server for the n8n renderer harness.

Produces `live-envelopes-<date>.json` — the fixture `live-envelope-harness.js` runs the DEPLOYED
`output-structurer` against. Re-run after any change to the CRM MCP presenter, then point the
harness at the new file.

Needs the CRM stack up (MCP on :8765, backend on :8000) and the `mcp` client package, which the
CRM backend venv already has:

    cd sorento_crm/sorento_crm_backend
    venv/bin/python ../../sorento_crm_n8n/n8n-workflows-init/tests/renderer/capture-live-envelopes.py

The product UUIDs below are dev-database rows picked for their allocation state. On another
database re-pick them: a still-incoming line with allocated < shipped (partial), one with no
`spo_allocations` row (pending), and one with allocated == shipped (fully allocated).
"""
import asyncio, json, os
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

URL = "http://localhost:8765/mcp"
RPACC = "c18fa9ea-ad6b-46c4-88a7-d7423d4229e0"        # partial (69/2) + pending (1/none)
FULLY = "94137042-2999-4077-ada6-9a5afc2186fc"        # SRTKT1831SS, 267 shipped / 267 allocated
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live-envelopes-20260802.json")

CAPTURES = [
    ("L1 incoming list — partial + pending in one envelope",
     "crm_incoming_stock_list", {"product_ids": [RPACC], "limit": 3, "view": "render"}),
    ("L2 incoming by-product — same two states, product-rooted shape",
     "crm_incoming_stock_by_product", {"product_ids": [RPACC], "view": "render"}),
    ("L3 incoming shipments — shipment level, carries no allocations",
     "crm_incoming_stock_shipments",
     {"eta_from": "2026-07-01", "eta_to": "2026-07-31", "limit": 2, "view": "render"}),
    ("L4 incoming list — fully allocated, must stay badge-free",
     "crm_incoming_stock_list", {"product_ids": [FULLY], "limit": 2, "view": "render"}),
]


async def main():
    out = {
        "_source": "captured from the live CRM MCP server (localhost:8765) against the live "
                   "backend + dev database. Real rows, no fixtures. Regenerate with "
                   "sorento_crm scratchpad/capture.py after any presenter change.",
        "_captured_at": "2026-08-02",
        "_crm_branch": "feat/incoming-allocation-signal",
        "envelopes": [],
    }
    async with streamablehttp_client(URL) as (read, write, _):
        async with ClientSession(read, write) as s:
            await s.initialize()
            for name, tool, args in CAPTURES:
                res = await s.call_tool(tool, args)
                env = json.loads("".join(c.text for c in res.content if getattr(c, "text", None)))
                out["envelopes"].append({"name": name, "tool": tool, "args": args, "envelope": env})
                flags = [i["flags"] for i in env.get("items", [])]
                print(f"{name}\n   items={len(env.get('items', []))} flags={json.dumps(flags)}")
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print("\nwrote", OUT)


asyncio.run(main())
