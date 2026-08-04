# CLAUDE.md

Guidance for Claude Code working in this repo. **Read this + `docs/LESSONS.md` before doing n8n work** — it will save you hours of re-discovery. Detailed design lives in `n8n-workflows-init/plans/` and `n8n-workflows-init/tests/`.

## What this is

n8n workflows integrating **Sorento CRM** with **respond.io** (WhatsApp). The chatbot answers product/stock/order/promotion/complaint enquiries. This repo also holds a **test + regression harness** built around the chatbot so changes can be verified without touching real customers.

## ⚠️ SOURCE OF TRUTH = the LIVE n8n instance (files are a *verified cache*)

- Workflows live in the **remote, self-hosted n8n** at `https://automate-sorento.foundryx.my`. The remote instance is authoritative — always.

### 🚀 READ THIS BEFORE PULLING A WORKFLOW — use the export, not the 444 KB blob

`n8n-workflows-init/export/` holds derived artifacts, refreshed by a script and **guarded against staleness**:

```bash
python3 n8n-workflows-init/scripts/export-workflows.py --verify   # ALWAYS run first (1 cheap API call/wf)
python3 n8n-workflows-init/scripts/export-workflows.py            # refresh after ANY promote / clone build
```

`--verify` compares each export's `versionId` to live and **exits 1, loudly**, if stale. This is what makes
the cache safe — the old `normalized-workflows/` was deleted because a stale copy got trusted silently.
**Never read an exported file without verifying first.** If verify fails, re-export; do not "just check MCP".

Per workflow you get:

| artifact | use it for | size |
|---|---|---|
| `TOPOLOGY.md` | edges, **who reads what BY NAME**, orphans, sub-calls, creds, code-node inventory | ~12 KB |
| `nodes/*.js` | the JS bodies as real files — `node --check`, grep, diff, unit-test | — |
| `workflow.json` | canonical + sorted, so `git diff` shows what moved | ~275 KB |
| `MANIFEST.json` | versionId + per-node sha256 (the staleness gate, and promote hash-gating) |  |

**`TOPOLOGY.md` answers most structural questions at 1/46th the size of the raw JSON.** Its
*Read BY NAME* section is the one people keep getting wrong: `$('x')` reads are NOT redirected by rewiring,
and a single-quote-only grep misses the `$("x")` form. Only fall back to `get_workflow_details` / REST when
you need something the export genuinely lacks.

- MCP (`get_workflow_details`) remains correct for ad-hoc lookups and is the only option for un-exported
  workflows. For **writes**, prefer REST PUT (auto-publishes; MCP edits land on a DRAFT and need
  `publish_workflow`).
- The **local docker stack is down** and not used. Ignore `docker-compose.yml` / localhost:5678.
- Connection facts, IDs, and creds are in **`.env`** (repo root, untracked). Read it.

## 🚫 HARD SAFETY RULE (non-negotiable)

**Testing must NEVER reach a real contact or mutate prod.** Specifically: no WhatsApp/comment send to a real respond.io contact; no assignment/SLA/PIC-comment write (those trigger staff email/WhatsApp ripple); no write to the prod CRM (`respond_contacts.session_vars`, conversation-variables PUT, etc.). CRM **reads** against prod are allowed. Every harness design choice exists to preserve this. If something is blocked, report it — never work around a safety/permission denial.

## The chatbot spine + the test clone

- **`sorento-consume-main`** (`9qVyfUxmRQqrpGRMDLRuz`, ~75 nodes, LIVE/active) — the spine: redis-pop → reformulator (gpt-5.4-mini, the "semantic parser", sub `XTODTw-dJcV0uRdC056hG`) → branch (escalation/no-access/ask-access/not-supported/clarify/happy) → resolve-entity → get-rag → get-results (MCP read) → shape → send + log. A second LLM, `Basic LLM Chain` (gpt-4.1-mini), is the **clarification** path (gated behind `validator.has_result=false`, NOT always-on).
- **`sorento-consume-main TEST`** (`txiPzSxy3Pclsz6v`, ~97 nodes) — the **fail-closed clone** we test against. Driven by a redis item on list `main-message-list-test` via a Manual-Trigger wrapper (`zz-canary-run` `VtIV3TF3aw2Fx8No`). It is **structurally incapable of real egress**:
  - **5 orphaned + 1 sinked** (amended 2026-07-21, obs-latency-contract). Orphaned (0 inbound): `send-message-files/images/video`, `update-human-intervened`, the prod `save-session-vars` PUT. **Sinked:** `Call 'sub-respond-save-message-redis'2` is now deliberately WIRED (from `if-message-is-audio` output 1/FALSE, mirroring live) but repointed to the fork **`tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`)**, whose only egress is an RPUSH to the literal list `sorento-respond-message-TEST` that **no consumer reads**. Empirical gate: `LLEN sorento-respond-message` must be unchanged before/after every run (UAC.md §0 **S7**).
  - All 8 shared-sub calls pass `is_test=true` → the (forked) subs short-circuit before any real send/assign.
  - ✅ **Clone sendmsg wiring RESTORED 2026-07-21** (clone @ `1f39712a`): all 8 sendmsg callers point at **`ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`)**, chat console working. The obs-latency-contract build fork `sJI3DbsLCG01JfRs` (`sub-sendmsg-OBS`) is no longer wired to the clone. ⚠️ `sub-sendmsg-CHAT` is still STALE vs live (forked 2026-07-13, lacks the quick_reply logger promoted 2026-07-14) — reconciling it is an open item.
  - ⚠️ **Clone sub wiring is MIXED (re-verified 2026-07-14, exec 8519391):** reformulator `Call 'sub-query-reformulator'` calls the **live published sub `XTODTw-dJcV0uRdC056hG`** (the old fork `CpxE8LroLzCkrAQN` is NOT wired in — earlier 2026-07-01 note was stale). Human-intervention DOES call the guarded fork **`vUfFUDjLAuMaeQE6`** (NOT live `rrYXzE61…`). So: a **parser change must edit/publish the live sub `XTODTw`** (there is no wired fork to shield it — treat parser edits as touching live and gate accordingly); human-intervention changes edit the fork. Promotion of any sub targets the live published ID.
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
| reformulator sub the CLONE actually calls — **corrected 2026-07-21**, it is a FORK, not the live sub (`CpxE8LroLzCkrAQN` NOT wired either) | `wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`) |
| sub: get-results (MCP read) | `Fss5aAaXthJSWpZCgKiKR` |
| ↳ get-results fork the CLONE actually calls (all 3 callers: `Call 'sub-get-results'`, `probe-incoming`, `sibling-probe`) — verified 2026-08-02 | `rysSPgUssLDf6xJc` (`sub-get-results TEST`) |
| sub: get-rag (pgvector) | `tWP33QOFT7SxThfT` |
| sub: save-message-redis (msg logger, LIVE — prod ingest list) | `UrETd-jm46tFj3Xw7w8vL` |
| ↳ harness fork the CLONE calls (RPUSHes `sorento-respond-message-TEST`, unconsumed) | `tWm5DYLxfypmVC1T` |
| sub: sendmsg fork for obs-latency-contract C2/C3 (fresh off live @ `8cf1b465`) | `sJI3DbsLCG01JfRs` (`sub-sendmsg-OBS`) |
| sub: sendmsg fork for the chat console (clone's normal target — restore after OBS sign-off) | `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) |
| capture orchestrator | `MGm32814G7XcGSD2` |
| replay orchestrator | `aROEBlQyyoQaB7a1` |
| test helpers | `zz-canary-run VtIV3TF3aw2Fx8No`, `zz-canary-seed 4eDGDBL3rEkGQuBV`, `zz-canary-read LLIbMXAixexM9Cwc` |

## Two harnesses

1. **UAC / smoke** (cycle 1): drive the clone in `uac` mode with a hand-crafted redis item; assert the branch + the **egress log** (redis key `test:egress:{test_run_id}`, records `would_send`/`would_write` instead of acting). Cases + safety checklist (§0 S1–S6) in `tests/UAC.md`. Per-case results in `tests/runs/`.
   **📖 UAC is split — do NOT read the 4,000-line `tests/UAC.md` monolith.** Read
   `tests/uac/00-SAFETY-always-read.md` (§0, mandatory for every case) **plus the one `tests/uac/<FAMILY>.md`
   for your change** — e.g. `TL.md` (tool-loop-removal), `XA.md` (cross-domain attachment). Index +
   what-covers-what: `tests/uac/README.md`. That is ~478 lines instead of 3,986 for the same job. The
   monolith is retained only for provenance; the split files are the same bytes, regrouped.

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
