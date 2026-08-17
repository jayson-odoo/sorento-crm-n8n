# mc-label-n8n — handoff (2026-08-17, checkpoint on usage limit)

Branch `fm/mc-label-n8n` (worktree isolated, `no-mistakes doctor` OK). No workflow edited yet. No feature code written.

## Established
- n8n MCP server NOT loaded in this session (no `.mcp.json` at launch). Copied `.env` + `.mcp.json` from `/Users/tehjayson/Documents/foundryx/sorento_crm_n8n/` into worktree (gitignored). REST API works: `curl -H "X-N8N-API-KEY: $N8N_API_KEY" $N8N_API_BASE/workflows/<id>`.
- Backend PR #193 wire contract (merged 2026-08-17T00:37Z): envelope top-level `lookup_companies: [{id,name}]` (sorted by name, ONLY when lookup/result spans >1 company); rows get leading field `{key:"company_name",label:"Company",value:"Mocha"}`; empty intro `No matching results found for Mocha or Sorento.` Diff at scratchpad `pr193.diff`.
- Curl-driven UAC loop (no MCP needed): `POST https://automate-sorento.foundryx.my/webhook/zz-chat-console {text,contact_id,mode:"uac",chat_id}` → item on `test:q:{contact}` + `ready-contacts-test`, fires `zz-dispatch-test` → `call-spine` = clone `txiPzSxy3Pclsz6v`; reply via `POST /webhook/zz-chat-read {chat_id}` (`chat:reply:{chat_id}`); node data via REST `GET /executions/<id>?includeData=true`.
- Wire probe fired (chat_id `wireprobe-1786927488`, run `chatcon-1786927490369`) → status queued but NO new execution of dispatcher `2D0cw2Y1aPW2LOlU` / clone / `t4QvrtrPnTwRU6br` appeared after ~60s (last ones 2026-08-16 14:04). Likely dispatcher lock stuck or fire-dispatch 4s timeout — investigate `zz-dispatch-test` (lock key per contact 437264483, `rearm-*`), or fire `/webhook/zz-dispatch-test` directly. Until a live tool call shows `lookup_companies`, MCP-restart-after-#193 is UNVERIFIED → possibly `blocked: MCP not restarted after #193`.
- Targets: output-structurer on `t4QvrtrPnTwRU6br` (live `rysSPgUssLDf6xJc`); `not-found-error-message` build from LIVE `9qVyfUxmRQqrpGRMDLRuz` code (clone ~67 lines behind); `crossdomain-zeroset` identical clone/live.

## Next
1. Unstick/verify dispatcher; confirm `lookup_companies` on wire (else blocked).
2. Delegate coder (opus) → tester (sonnet) → reviewer (opus) per brief; then codex review; PR with promote steps.
