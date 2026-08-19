# CLAUDE.md

Guidance for Claude Code working in this repo. **Read this + `docs/LESSONS.md` before doing n8n work** — it will save you hours of re-discovery. Detailed design lives in `n8n-workflows-init/plans/` and `n8n-workflows-init/tests/`.

## What this is

n8n workflows integrating **Sorento CRM** with **respond.io** (WhatsApp). The chatbot answers product/stock/order/promotion/complaint enquiries. This repo also holds a **test + regression harness** built around the chatbot so changes can be verified without touching real customers.

## ⚠️ SOURCE OF TRUTH = the LIVE n8n instance via MCP (not files)

- Workflows live in the **remote, self-hosted n8n** at `https://automate-sorento.foundryx.my`, driven through the **n8n MCP server** (`.mcp.json`). The old `n8n-workflows-init/normalized-workflows/` snapshot was **deleted** — do NOT trust JSON files as current; always `get_workflow_details` from MCP.
- The **local docker stack is down** and not used. Ignore `docker-compose.yml` / localhost:5678.
- Connection facts, IDs, and creds are in **`.env`** (repo root, untracked). Read it.

## 🚫 HARD SAFETY RULE (non-negotiable)

**Testing must NEVER reach a real contact or mutate prod.** Specifically: no WhatsApp/comment send to a real respond.io contact; no assignment/SLA/PIC-comment write (those trigger staff email/WhatsApp ripple); no write to the prod CRM (`respond_contacts.session_vars`, conversation-variables PUT, etc.). CRM **reads** against prod are allowed. Every harness design choice exists to preserve this. If something is blocked, report it — never work around a safety/permission denial.

## The chatbot spine + the test clone

- **`sorento-consume-main`** (`9qVyfUxmRQqrpGRMDLRuz`, ~75 nodes, LIVE/active) — the spine: redis-pop → reformulator (gpt-5.4-mini, the "semantic parser", sub `XTODTw-dJcV0uRdC056hG`) → branch (escalation/no-access/ask-access/not-supported/clarify/happy) → resolve-entity → get-rag → get-results (MCP read) → shape → send + log. A second LLM, `Basic LLM Chain` (gpt-4.1-mini), is the **clarification** path (gated behind `validator.has_result=false`, NOT always-on).
- **`sorento-consume-main TEST`** (`txiPzSxy3Pclsz6v`, ~97 nodes) — the **fail-closed clone** we test against. Driven by a redis item on list `main-message-list-test` via a Manual-Trigger wrapper (`zz-canary-run` `VtIV3TF3aw2Fx8No`). It is **structurally incapable of real egress**:
  - 5 egress nodes orphaned (0 inbound): `send-message-files/images/video`, `update-human-intervened`, the prod `save-session-vars` PUT; plus `Call 'sub-respond-save-message-redis'2`.
  - All 8 shared-sub calls pass `is_test=true` → the (forked) subs short-circuit before any real send/assign.
  - ⚠️ **Clone sub wiring ≠ live IDs (drifts; re-verify with `jq '.nodes[]|select(.type=="n8n-nodes-base.executeWorkflow")|.parameters.workflowId.value'` before editing a sub).** As of 2026-08-19 the clone calls: reformulator fork **`wI5RkNGW3EOJfBdo`** (NOT live `XTODTw`), human-intervention fork **`vUfFUDjLAuMaeQE6`** (NOT live `rrYXzE61…`), sendmsg fork **`aQUmwMVplmNcyUVc`** (guarded `guard-text`/`guard-qr` on `is_test`), get-results **`t4QvrtrPnTwRU6br`**, save-message **`tWm5DYLxfypmVC1T`**. All forks are guarded (`is_test` short-circuit). When testing a parser change, edit/publish the **fork** the clone actually calls; promotion targets the live sub.
  - **Mode field** in the redis item: `uac` (default — egress blocked, real reads) | `regress-capture` (real LLMs+reads, session→`n8n_test` copy) | `regress-replay` (everything pinned from golden: 0 token/0 prod-read/0 egress).
- **NEVER edit the live spine `9qVyfUxmRQqrpGRMDLRuz`.** Build/test on the clone; promote only a reviewed business-logic diff (guards stripped), user-gated.

## Key IDs (verify still exist before relying on them)

| thing | id |
|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` |
| TEST clone (build/test target) | `txiPzSxy3Pclsz6v` |
| sub: sendmsg (shared, published+guarded) | `aoydkG1dbItXR5jXFEQsP` |
| sub: human-intervention (live published+guarded) | `rrYXzE61gCNUck_zmXe-G` |
| ↳ human-intervention fork the CLONE actually calls | `vUfFUDjLAuMaeQE6` |
| sub: reformulator / semantic-parser gpt-5.4-mini (live published+guarded) | `XTODTw-dJcV0uRdC056hG` |
| ↳ reformulator fork the CLONE actually calls (build/test parser changes here) | `wI5RkNGW3EOJfBdo` (was `CpxE8LroLzCkrAQN`; verify) |
| sub: get-results (MCP read) | `Fss5aAaXthJSWpZCgKiKR` |
| sub: get-rag (pgvector) | `tWP33QOFT7SxThfT` |
| sub: save-message-redis (msg logger) | `UrETd-jm46tFj3Xw7w8vL` |
| capture orchestrator | `MGm32814G7XcGSD2` |
| replay orchestrator | `aROEBlQyyoQaB7a1` |
| test helpers | `zz-canary-run VtIV3TF3aw2Fx8No` (POST `/webhook/zz-run-hint` `{test_run_id,contact,item}` — the clone pops `test:q:{contact}`), `zz-canary-seed 4eDGDBL3rEkGQuBV`, `zz-canary-read LLIbMXAixexM9Cwc`, `zz-media-probe tF02D1bUGYBADVkN` (CRM media endpoint zero-write 404/422 probe, keep inactive) |

## Media intake lane (voice + image → CRM `POST /api/v1/external/media/process`) — clone-built 2026-08-19, promote HELD

`redis-pop → detect-media → if-media-in → [media-egress-gate → mock | media-extract-http] → media-extract → media-route → (poll loop) → if-media-ok → patch-transcript → tf-message` / `if-media-reply → send-media-reply`. The CRM is the wording authority; n8n sends `notices[].text` / `result.*_message` verbatim (+ the two CRM fallbacks). On the harness the CRM call is MOCKED (`mock_media_response`, `mock_media_poll[]` in the redis item) because the real route writes the prod ledger. Plan `n8n-workflows-init/plans/media-intake-plan.md`, UAC `tests/media-intake-UAC.md`, bodies `tests/diffs/media-intake/`, builder/driver `tests/media-intake/`. The CRM contract lives in the sorento-crm repo (PR #158: `app/schemas/external/media.py`, `media_access_service.py`, `media_extract/wording.py`).

## Two harnesses

1. **UAC / smoke** (cycle 1): drive the clone in `uac` mode with a hand-crafted redis item; assert the branch + the **egress log** (redis key `test:egress:{test_run_id}`, records `would_send`/`would_write` instead of acting). Cases + safety checklist (§0 S1–S6) in `tests/UAC.md`. Per-case results in `tests/runs/`.
2. **Regression (golden-master)**: capture every node's input/output for ~2,216 real historical messages into the **`n8n_test`** DB as a golden base; on a future change, **replay** with all externals pinned (deterministic, 0-cost) and diff each node's output vs golden. Design: `plans/regression-plan.md`. Build notes: `tests/regression/orchestrator-notes.md`. Schema: `tests/regression/schema.sql`. Reviewer sign-off: `tests/reviews/`.

## The `n8n_test` database (regression base + session copy)

- Postgres `n8n_test` @ `72.62.195.19:5432` (`n8n_user` / see `.env`), **isolated from the prod CRM DB** (`sorento-crm-db`) and reachable by both the remote n8n (in-workflow `n8n_test-db` cred `Dnnofg8Xb27VQOhI`) and your host (psql).
- Tables: `chat_histories` (corpus), `v_turns` (VIEW: 2,216 turns = incoming + paired reply), `respond_contacts_test` (session copy, PK `respond_io_id`), `golden_runs`/`golden_nodes` (the base), `replay_runs`/`replay_node_diffs` (diffs), `turn_review` (confidence triage). Convenience VIEW `v_replies` joins incoming · state_before · clone_reply · state_after · confidence.
- Connect: `PGPASSWORD=… psql -h 72.62.195.19 -p 5432 -U n8n_user -d n8n_test` (inline the full command; do NOT put `psql …` in a shell var — zsh mis-splits it).

## Agent pipeline (project agents in `.claude/agents/`)

Work flows **planner → coder → tester → reviewer** (custom subagents `sorento-planner/coder/tester/reviewer`). Each carries the safety rule, IDs, and role contract. When dispatching, tell the agent to **read this file + `docs/LESSONS.md`** first so it doesn't re-discover. Plans/UAC live in `plans/` + `tests/`.

## Common tasks

- Inspect a workflow: `get_workflow_details <id>` (large output saves to a file — jq/grep it, don't read whole). Diff vs live by node-name + param hash.
- Run a UAC case: seed the redis item → fire `zz-canary-run` (or `execute_workflow`) → `get_execution(includeData)` → read `test:egress:{id}`.
- Capture/replay: set `Init Params` defaults on the orchestrator, then `execute_workflow` it; resumable via a stable `run_label`.
- Promote to live: ONLY a reviewed business-logic diff, guards stripped, user-gated, backup-first.

## See also

- `docs/LESSONS.md` — n8n/MCP gotchas (read before editing workflows).
- `n8n-workflows-init/plans/` — plan.md (UAC harness), regression-plan.md.
- `n8n-workflows-init/tests/` — UAC.md, regression-UAC.md, diffs/, runs/, reviews/, regression/.
- The separate Sorento CRM repo (read-only ref) at `/Users/tehjayson/Documents/foundryx/sorento_crm` — API/MCP contracts.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
