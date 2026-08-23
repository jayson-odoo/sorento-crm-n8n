# Test pyramid + git-first deploy for the n8n spine (DESIGN, 2026-08-22)

Owner decisions (locked): git = source of truth · deploy = script · logic STAYS in n8n ·
fast unit/integration/functional tests per node + per flow · **green gate before any deploy** ·
primary regression concern = Code-node in/out (esp. parser `output_exchange`, 1,386 lines), not the LLM.

## Why the current state fails the gate
| what | state |
|---|---|
| golden-master replay | per-node diff, last golden 2026-07-07, noise floor 311/1545 — retire |
| `tests/offline/*` (20 dirs) | right idea (real body via `vm`, fixtures from real execs, sha-gated by `node-source.js`) — but one bespoke shim per dir, no runner, ~10/37 spine nodes |
| `tests/unit/*.test.js` | copy-pasted function bodies → drift class (LESSONS §63) — delete or port |
| `deploy.sh` | targets deleted `normalized-workflows/` + localhost — rewrite |
| UAC | agent-run prose, minutes/case — keep as functional tier only, scripted |

## Shape (three tiers, one command)

```
npm test            unit        ms      every Code node, every fixture, no network
npm run test:flow   integration seconds lanes of nodes chained in-process, HTTP/sub stubbed
npm run test:e2e    functional  minutes ~15 smoke turns on the CLONE via redis (existing UAC path)
npm run deploy      gate: unit+flow green + export verified + PR merged → REST PUT → export → verify
```

### Tier 1 — unit: one harness, every Code node
- `tests/harness/n8n-shim.js` — ONE shim, used by every test. Provides exactly what the bodies use
  (measured: `$('x').first()/all()`, `$input.first()/all()`, `$json`, `$runIndex`, `$execution`).
  `$('x')` resolves from a `ctx` map `{nodeName: [items]}`; missing name → throws (a test that
  reads an unstubbed node fails loudly, not with `undefined`).
- Bodies loaded only via `node-source.js` (sha-gated against export). No copies. Ever.
- Fixtures = **captured from real executions**: `scripts/capture-fixtures.py <execution_id> [--nodes a,b]`
  → `tests/fixtures/nodes/<node>/<case>.json` `{ctx, input, expected_output}` (REST `GET /executions/:id?includeData=true`;
  `runData[node][0].data.main[0]` = output, upstream nodes = ctx). PII-scrub contact fields.
- One spec per node: `tests/unit/<node>.test.js` — loads all fixtures for that node, runs body, deep-equals
  output (with a per-node `volatile` allowlist: timestamps, ids). Plus hand-written edge cases.
- Runner: `node --test` (built-in, no deps). Target < 2 s for all 37 + parser's 3.
- Coverage gate: a test that lists spine Code nodes from `workflow.json` and fails if any has no fixture.

### Tier 2 — integration (flow): lanes in-process
- `tests/harness/run-lane.js` — walks `workflow.json` connections from node A to node B, executing
  Code/If/Set/Switch nodes natively (If/Set/Switch evaluated by a small expression evaluator covering the
  forms actually used: `$('x').first().json.a.b`, `===`, `equals`, `gt`, `empty`), and HTTP/executeWorkflow
  nodes from `stubs/<node>.json`.
- Lane fixtures from the same captured executions: `{start_node, end_node, ctx, expected: {end_output, path}}`.
  **Asserts the PATH taken** (list of node names) as well as the output — the routing regressions
  (`If7`…`If10`) are invisible to per-node tests.
- Lanes: intake→route, happy (resolve→gate→rag→results→validator→promo→crossdomain→compile),
  miss (dym/sibling/incoming → suggest-offer), escalate, access-choice, parser (`output_exchange` chain).
- Target < 30 s.

### Tier 3 — functional: clone smoke
- `scripts/e2e.py` — seeds redis item → fires `zz-canary-run` → reads egress log → asserts reply text /
  quick_replies / branch_kind. ~15 turns, one per lane. Existing §0 safety gates unchanged.
- Run before promote only (minutes). Not on every edit.

### Git-first deploy
- Source = `export/<slug>/workflow.json` + `nodes/*.js`. Edit the **files**. `scripts/assemble.py` folds
  `nodes/*.js` back into `workflow.json` (inverse of export). Agents no longer `update_workflow` via MCP
  for spine/parser changes.
- `scripts/deploy.py <slug> --to clone|live`: refuse unless (a) working tree clean + on merged PR, (b)
  `npm test` + `test:flow` green on this commit, (c) `--verify` passes (export == live, so we're not
  clobbering an unseen live edit), (d) backup of live versionId written to `tests/backups/`. Then REST
  PUT → re-export → `--verify` → print rollback command.
- CI (GitHub Actions): `npm test` + `test:flow` on every PR. Functional + deploy stay local, user-gated.

## Status 2026-08-22 — steps 1–5 BUILT (nothing written to n8n)
- unit: 200 pass / 0 fail / 2 dead-skip, 38/40 Code nodes fixture-covered (2 dead: `Code in JavaScript`, `presign-fail-notice`); flow: 20/20, 5 lanes. Whole suite ~0.5 s.
- `scripts/capture-fixtures.py`, `tests/harness/n8n-shim.js`, `tests/harness/run-lane.js`, `tests/unit/_all-nodes.test.js`, `tests/flow/*`, `.github/workflows/n8n-tests.yml`, `scripts/assemble.py` (21/21 slugs round-trip), `scripts/deploy.py` (gates a–i; PROTECTED live ids + clone-guard `txiPzSxy3Pclsz6v`; dry-run verified; gate (i) PUT never executed yet).
- Known: first live deploy of spine shows 3 jsCode-sha "changes" = trailing-whitespace strip only (`central-exchange`, `construct-user-prompt`, `validator`). Fixtures 10 MB untracked — decide on committing.
- **Step 2b (2026-08-23): the suite is now MEASURED, not asserted.** `npm run mutate`
  (`tests/harness/mutate.js`) breaks each node body on purpose and reports how many mutants the
  suite kills; today's numbers per node are recorded in `tests/MUTATION-BASELINE.md` so drift is
  visible. Repo 35% → 37%; `output_exchange` 22% → 88% on a 100-mutant sample, via 72 hand-reasoned
  fixtures. That file also carries the four defects the exercise surfaced in `output_exchange` —
  one behavioural (numbered did-you-mean multi-select is last-wins, not ADD-BOTH), three dead-code.
  `mutate` is NOT part of `npm test`: it takes ~25 min and is a metric, not a gate.
- Next = step 6 on a FRESH clone (not media-intake).

## Build order (each step PR'd, nothing touches live until step 6)
1. shim + `capture-fixtures.py` + `node --test` runner; port 3 existing offline probes to prove it (promo-picker, dym-transform, output_exchange).
2. capture fixtures for ALL 37 spine + 3 parser Code nodes from last 2 weeks of live executions (≥3 cases/node where traffic allows); coverage gate on.
3. lane runner + 6 lane fixtures, path assertions.
4. CI on PR.
5. `assemble.py` + `deploy.py` (clone target first), retire `deploy.sh`, delete `tests/unit/*` copy-paste tests + golden-replay docs → archive.
6. first real use: `docs/SIMPLIFY-spine-audit.md` §8 (delete dead) deployed to clone via the new path, e2e, then live.

Effort: steps 1–2 ≈ 1 day agent time; 3–5 ≈ 1–2 days. Parser untouched throughout.

## Non-goals
No golden replay revival. No CRM migration. No new n8n sub-workflows for testing. No mocking the LLM
beyond pinned `output_exchange` inputs.
