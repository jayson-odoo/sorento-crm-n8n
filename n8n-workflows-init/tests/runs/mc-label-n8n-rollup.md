# UAC rollup — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Tester pass** 2026-08-17 · branch `fm/mc-label-n8n` · target clone `sorento-consume-main TEST` (`txiPzSxy3Pclsz6v`) only.
Mechanism: n8n MCP unavailable this session — chat-console curl loop (`zz-chat-console` seed → `zz-dispatch-test` fire →
`zz-chat-read` poll → `GET /executions/{id}?includeData=true`), per the tester task brief. Contact `437264483`
(genuine two-company Mocha+Sorento contact) for all three cases.

## Result

| case | trigger | verdict | clone exec | key evidence |
|---|---|---|---|---|
| 1 — multi-company all-empty | `MWC-SC08B check stock` | **PASS** | `12774464` | reply has BOTH `MWC-SC08B (Mocha)` and `MWC-SC08B (Sorento)`, ` — checked in Mocha and Sorento`; both sub-get-results calls (`12774475` incoming_stock, `12774472` stock) show `lookup_companies:[Mocha,Sorento]` passed through output-structurer with per-company no-record lines; `entity-ids-transformer.product_ids` carries both uuids (`142fdca2…` Mocha + `e5f1a203…` Sorento) in both sub-execs, proving the crossdomain union fix (change 3) fired end to end |
| 2 — single-company, not found | `SRTWC287A-RL-7405 check stock` | **PASS** | `12775076` | resolver returns exactly 1 match (Sorento); `not-found-error-message.escalate_message` and the final reply carry no `(Sorento)` suffix, no `checked in`; `lookup_companies` occurs **0** times anywhere in the full execution JSON; `_xd.missing[0]` has no `uuids` key (inert single-uuid case) |
| 3 — single-company, found | `SRTFC2031 check stock` | **PASS** | `12775298` | resolver returns exactly 1 match (Sorento); `If6` happy branch taken; reply renders the stock row with no `Company:` field; `answers[0].fields` has no `company_name` key; `lookup_companies` occurs **0** times anywhere in the execution |

**Overall verdict: PASS.** All three cases match the coder's node-diff spec (`n8n-workflows-init/tests/diffs/mc-label-n8n.md`) structurally, and every case passed the §0 safety gate (S1–S6).

## Egress summary (S1–S6, all three cases, identical pattern)

- **S1 — zero real sends.** Every reply routed through `sorento-sub-respond-sendmsg-respond2` → sub-workflow
  `sub-sendmsg-QRCHUNK` (`aQUmwMVplmNcyUVc`, the chat-console send path, **not** the standard guarded
  `aoydkG1dbItXR5jXFEQsP`). In all three sub-executions (`12774477`, `12775098`, `12775312`) the runData contains
  only `[When Executed by Another Workflow, chat-build-parts, chat-push, chat?, console-loggable?,
  log-chat-history-n8ntest]` — the sub's own `HTTP Request` node (`https://api.respond.io/v2/contact/.../message`)
  is defined in the workflow but **never executed**. Delivery was exclusively via `chat-push`
  (`n8n-nodes-base.redis`, `push` to `chat:reply:{chat_id}`).
- **S2 — zero assignment/escalation writes.** No assign/SLA/PIC-comment/assignee-queue node appears in any of the
  three clone executions' runData (62-node key list checked each time); only `is-human-intervened` (a read check
  on `custom_fields.is_human_intervened`) ran. No human-intervention sub-workflow was invoked in any case (none of
  the three turns actioned an escalation — case 1/2 only *ask* whether to escalate).
- **S3 — zero CRM/contact writes.** `save-session-vars` and `update-human-intervened` are absent from all three
  runData key lists (orphaned nodes, 0 inbound, structurally unreachable in the clone).
- **S4 — get-results read-only.** Resolved tools across all sub-get-results calls: `crm_incoming_stock_list`
  (crossdomain probe) and `crm_inventory_stock_balance_list ` (main) — both in the READ allowlist; never
  `crm_it_support_ticket_create`.
- **S5 — test_mode present.** In every case the popped redis item carries `scope="chat-console"`, `mode="uac"`, and
  a `test_run_id` matching the `zz-chat-console` seed response (verified per-case, ruling out latest-by-time
  mis-attribution). All 8 shared-sub-call node *parameters* in the clone workflow definition hardcode
  `is_test:true` (11 literal occurrences found in each execution's JSON, consistent across all three runs); the
  chat-console sendmsg call also carries a hardcoded `is_test:true`. Note: the `When Executed by Another Workflow`
  trigger node itself reads `test_mode`/`test_run_id` as `null` at runtime in this dispatcher-fired mechanism —
  this is the documented lesson-1 quirk (exec-trigger inputs aren't readable this way); control correctly rides in
  the redis item instead, which was present and correct in all three cases.
- **S6 — token sinks bounded.** None of the three cases used `mock_parser_output`/`mock_reformulator_output` — all
  are live parser + live get-results runs by design (the point of this UAC is to prove the deployed backend PR
  #193 envelope end to end). `Call 'sub-query-reformulator'` executed for real in all three; every sub-get-results
  call invoked exactly one read-only MCP Client1 tool; no write-tool node executed in any case.

## Anomalies

- **Case 2 candidate search (informational, not a defect):** 3 probe runs (`SRTWB101`, `SRTUB5202`,
  `SRTWC7405-RL`) were needed before landing on `SRTWC287A-RL-7405` as a clean single-company/zero-stock case —
  the first two resolved single-company but had stock rows (kept `SRTWB101` as an unused extra Case-3-shaped
  candidate), and the third produced a did-you-mean list rather than a clean miss. This is expected given the
  product catalog's density, not a bug.
- **Case 2's final chat reply routes through the pre-existing sibling/DYM-alternatives renderer**
  (`"No stock for X. Try: ..."`) rather than surfacing `not-found-error-message.escalate_message` verbatim — this
  is unrelated pre-existing clone behavior (the `alternatives`/`relaxed_axis` path), not part of `mc-label`.
  `not-found-error-message`'s own `escalate_message` output was inspected directly in the execution and confirmed
  byte-identical to the single-company (no-suffix) shape.
- **Live→clone drift on `not-found-error-message` (per the coder's diff doc appendix), not triggered here:** none
  of the three cases exercised the `_entitlementMiss` (promotion) arm, the "nothing resolved at all" arm, or the
  `gate.access_notice` prefix, so this drift import was not exercised or flagged as a regression by this pass —
  noted for completeness per the tester brief, not because it fired.
- **Extra observation, not required by the case spec:** `SRTWB101` and `SRTUB5202` (case-2 probes 1 and 2) are
  single-company (Sorento) codes WITH stock rows and rendered with no `Company:` field — consistent additional
  evidence for the Case 3 assertion (found path stays unlabelled on single-company), beyond the `SRTFC2031` case
  actually used.

## Deliverables

- `n8n-workflows-init/tests/runs/mc-label-n8n-case1.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-case2.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-case3.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-rollup.md` (this file)

No workflow was edited. Live spine `9qVyfUxmRQqrpGRMDLRuz` was not touched by this tester pass (read via prior
coder artifacts only).
