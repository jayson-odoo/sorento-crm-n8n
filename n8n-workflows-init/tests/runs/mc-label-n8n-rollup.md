# UAC rollup — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Tester pass 1** 2026-08-17 · **tester pass 2** 2026-08-17 (post-reviewer B1 fix, blocker B3) · branch `fm/mc-label-n8n`
· target clone `sorento-consume-main TEST` (`txiPzSxy3Pclsz6v`) only. Mechanism: n8n MCP unavailable this session —
chat-console curl loop (`zz-chat-console` seed → `zz-dispatch-test` fire → `zz-chat-read` poll /
`GET /executions?workflowId=...` polling → `GET /executions/{id}?includeData=true`), per the tester task brief.
Contact `437264483` (genuine two-company Mocha+Sorento contact) for all five cases.

**Pass 2 context:** reviewer (`n8n-workflows-init/tests/reviews/mc-label-n8n.md`) returned REQUEST-CHANGES: **B1**
(`output-structurer` could emit a self-contradictory "no records" line underneath rows it had just rendered, when
those rows carry no `company_name` field) and **B3** (the multi-company-**with-rows** shape was never run in pass 1,
which is what let B1 through). Coder fixed B1 with a `_canAttribute` guard and republished `output-structurer` to
`t4QvrtrPnTwRU6br` (versionId `179f1842-8061-4e59-9c72-74ad2b602f29`, jsCode sha256 `25a2eed9…`). Pass 2 = **Case 4**
(closes B3) + a cheap **Case 1 re-check** on the republished sub.

## Result

| case | trigger | verdict | clone exec | key evidence |
|---|---|---|---|---|
| 1 — multi-company all-empty | `MWC-SC08B check stock` | **PASS** | `12774464` | reply has BOTH `MWC-SC08B (Mocha)` and `MWC-SC08B (Sorento)`, ` — checked in Mocha and Sorento`; both sub-get-results calls (`12774475` incoming_stock, `12774472` stock) show `lookup_companies:[Mocha,Sorento]` passed through output-structurer with per-company no-record lines; `entity-ids-transformer.product_ids` carries both uuids (`142fdca2…` Mocha + `e5f1a203…` Sorento) in both sub-execs, proving the crossdomain union fix (change 3) fired end to end |
| 2 — single-company, not found | `SRTWC287A-RL-7405 check stock` | **PASS** | `12775076` | resolver returns exactly 1 match (Sorento); `not-found-error-message.escalate_message` and the final reply carry no `(Sorento)` suffix, no `checked in`; `lookup_companies` occurs **0** times anywhere in the full execution JSON; `_xd.missing[0]` has no `uuids` key (inert single-uuid case) |
| 3 — single-company, found | `SRTFC2031 check stock` | **PASS** | `12775298` | resolver returns exactly 1 match (Sorento); `If6` happy branch taken; reply renders the stock row with no `Company:` field; `answers[0].fields` has no `company_name` key; `lookup_companies` occurs **0** times anywhere in the execution |
| 4 — multi-company **with rows** (B3) | `MUB5202 check stock` | **PASS** | `12778370` | resolver 2 matches (Mocha `d77629fc…`, Sorento `911d2093…`); Mocha has 2 stock rows (rows carry leading `company_name:"Mocha"`/`Company` field — **row-stamp confirmed on the wire** for the `stock` presenter), Sorento has 0; reply renders `*Company:* Mocha` on both Mocha rows and exactly **one** trailing `*Sorento:* no stock records for MUB5202.` line — **no** line for Mocha, the company that DID render rows. This is the B1 fix (`_canAttribute`) working correctly on real rows, on the republished sub (jsCode sha `25a2eed9…` byte-verified from the exec) |
| 1-recheck — same as case 1, re-run post-B1 | `MWC-SC08B check stock` | **PASS** | `12778877` | identical structural result to case 1 (`(Mocha)`/`(Sorento)` labels, ` — checked in Mocha and Sorento`, both per-company no-record lines present since `items=[]` ⇒ `_canAttribute=true`), confirming the B1 fix did not regress the all-empty path; both sub-execs' `output-structurer` jsCode sha byte-verified as `25a2eed9…` |

**Overall verdict: PASS (5/5).** All five cases match the coder's node-diff spec (`n8n-workflows-init/tests/diffs/mc-label-n8n.md`, post-B1 revision) structurally, and every case passed the §0 safety gate (S1–S6). **B3 is closed.**

## Row-stamp wire observation (new in pass 2, answers B1's open question for the `stock` presenter)

Case 4 (`MUB5202`, `crm_inventory_stock_balance_list`) is the **first execution this cycle to observe a non-empty
multi-company envelope**. Result: `answers[].fields[0] = {"key":"company_name","label":"Company","value":"Mocha"}` —
**the CRM DOES stamp rows with `company_name` for the `stock` presenter.** This confirms the B1 fix's "rows are
stamped" branch renders correctly (`*Company:* Mocha` on every Mocha row, exactly one silent `*Sorento:* no stock
records...` line, no contradiction).

**Still unobserved:** whether the `incoming_stock` presenter (the `crossdomain-probe` path) stamps rows the same
way. 5 probe attempts (budget per the task brief) did not surface a multi-company product with actual
incoming-stock rows — `MUB5202`'s incoming set is empty in both companies (probe exec `12778466`), and a further
guess (`MFC2031`) did not resolve at all. This remains an **open backend-verification item** for a future pass with
a known multi-company-incoming-stock candidate. It is not a blocker for n8n behavior: the `_canAttribute` guard is
identical code shared by both presenters, and the all-empty incoming case (exec `12778466`, `items=[]`) already
proves the guard's "cannot attribute ⇒ items empty ⇒ still safe to name both silent" branch works; if incoming rows
turn out to be unstamped, `_canAttribute` correctly suppresses the silent-company line under them rather than
contradicting itself — the failure mode B1 exists to prevent.

## Egress summary (S1–S6, all five cases, identical pattern)

- **S1 — zero real sends.** Every reply routed through `sorento-sub-respond-sendmsg-respond2` → sub-workflow
  `sub-sendmsg-QRCHUNK` (`aQUmwMVplmNcyUVc`, the chat-console send path, **not** the standard guarded
  `aoydkG1dbItXR5jXFEQsP`). In all five sub-executions (`12774477`, `12775098`, `12775312`, `12778384`, `12778889`)
  the runData contains only `[When Executed by Another Workflow, chat-build-parts, chat-push, chat?,
  console-loggable?, log-chat-history-n8ntest]` — the sub's own `HTTP Request` node
  (`https://api.respond.io/v2/contact/.../message`) is defined in the workflow but **never executed**. Delivery was
  exclusively via `chat-push` (`n8n-nodes-base.redis`, `push` to `chat:reply:{chat_id}`).
- **S2 — zero assignment/escalation writes.** No assign/SLA/PIC-comment/assignee-queue node appears in any of the
  five clone executions' runData; only `is-human-intervened` (a read check on
  `custom_fields.is_human_intervened`) ran. No human-intervention sub-workflow was invoked in any case (none of the
  five turns actioned an escalation — cases 1/2/1-recheck only *ask* whether to escalate).
- **S3 — zero CRM/contact writes.** `save-session-vars` and `update-human-intervened` are absent from all five
  runData key lists (orphaned nodes, 0 inbound, structurally unreachable in the clone).
- **S4 — get-results read-only.** Resolved tools across all sub-get-results calls: `crm_incoming_stock_list`
  (crossdomain probe) and `crm_inventory_stock_balance_list ` (main) — both in the READ allowlist; never
  `crm_it_support_ticket_create`.
- **S5 — test_mode present.** In every case the popped redis item carries `scope="chat-console"`, `mode="uac"`, and
  a `test_run_id` matching the `zz-chat-console` seed response (verified per-case, ruling out latest-by-time
  mis-attribution). All 8 shared-sub-call node *parameters* in the clone workflow definition hardcode
  `is_test:true` (11 literal occurrences found in each execution's JSON, consistent across all five runs); the
  chat-console sendmsg call also carries a hardcoded `is_test:true`. Note: the `When Executed by Another Workflow`
  trigger node itself reads `test_mode`/`test_run_id` as `null` at runtime in this dispatcher-fired mechanism —
  this is the documented lesson-1 quirk (exec-trigger inputs aren't readable this way); control correctly rides in
  the redis item instead, which was present and correct in all five cases.
- **S6 — token sinks bounded.** None of the five cases used `mock_parser_output`/`mock_reformulator_output` — all
  are live parser + live get-results runs by design (the point of this UAC is to prove the deployed backend PR
  #193 envelope end to end). `Call 'sub-query-reformulator'` executed for real in all five; every sub-get-results
  call invoked exactly one read-only MCP Client1 tool; no write-tool node executed in any case.
- **Republished-sub verification (pass 2 only).** Cases 4 and 1-recheck both ran against `t4QvrtrPnTwRU6br`'s
  post-B1 `output-structurer` — confirmed directly, not assumed: `jq -j '<jsCode>' | sha256sum` against each
  sub-exec's own `workflowData.nodes` returned `25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de`
  in all four sub-execs checked (`12778383`, `12778886`, `12778885`, and cross-checked against the diff doc's
  post-B1 value), matching the diff doc exactly.

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
- **Case 4 candidate search (5 probes used, informational):** the guessed `MWC-`-style prefix does not generalize —
  `MWC-WB101` and `MWC-UB5202` did not resolve, but the fuzzy `alternatives` on the second probe revealed the real
  cross-company naming convention for this product family is unprefixed (`MUB5202`), which resolved cleanly to
  both companies and became the case. A follow-up guess (`MFC2031`) for a Mocha-catalog incoming-stock candidate
  did not resolve. Not a defect — catalog naming conventions are not uniform and this is expected probing cost.
- **Row-stamp on `incoming_stock` presenter — open item, reported loudly per the tester brief:** not observed on
  the wire this cycle (see the dedicated section above). Recommend a targeted backend-side check or a future UAC
  probe with a known multi-company incoming-stock candidate before this is fully closed out; current n8n behavior
  is correct under either outcome.
- **Reviewer B2 (promote-mapping) not in this tester's scope:** B2 concerns the *live* promote mapping
  (`Fss5aAaXthJSWpZCgKiKR` as a mandatory second target) and is a promotion-checklist item, not a clone-UAC
  assertion — no clone case exercises it and none was expected to.

## Deliverables

- `n8n-workflows-init/tests/runs/mc-label-n8n-case1.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-case2.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-case3.json`
- `n8n-workflows-init/tests/runs/mc-label-n8n-case4.json` (B3, pass 2)
- `n8n-workflows-init/tests/runs/mc-label-n8n-case1-recheck.json` (pass 2)
- `n8n-workflows-init/tests/runs/mc-label-n8n-rollup.md` (this file)

No workflow was edited in either pass. Live spine `9qVyfUxmRQqrpGRMDLRuz` was not touched by this tester (read via
prior coder/reviewer artifacts only). The only workflow write in this change's history remains the coder's B1
republish of `t4QvrtrPnTwRU6br`, already landed before this tester pass began.
