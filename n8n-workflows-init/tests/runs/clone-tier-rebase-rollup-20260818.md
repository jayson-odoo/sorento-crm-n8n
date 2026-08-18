# clone-tier-rebase — tester pass rollup (2026-08-18)

Change: backport of the live `7aba1447` tier-ask + promotion-picker lanes onto TEST clone
`txiPzSxy3Pclsz6v` (diff doc `tests/diffs/clone-tier-rebase-20260818.md`, coder smoke
`tests/runs/clone-tier-rebase-SMOKE-20260818.json`).

Clone verified at **061e46c9-c22e-43da-a62c-537612f3a80d** (versionId==activeVersionId, 171 nodes)
**before and after** the pass. Live spine `9qVyfUxmRQqrpGRMDLRuz` untouched (active `7aba1447`,
draft `cfd0e776` — identical before/after; never executed). Parser fork `wI5RkNGW3EOJfBdo @ c7d9cfa2`
unchanged. No workflow was edited; nothing promoted.

Mechanism, contacts, and per-case evidence: see `clone-tier-rebase-T{1..7}-20260818.json`.
Run-id prefix `UAC-TIERREB-`. 10 clone executions + 46 swept sub-executions + 6 timestamp-located
tier-probe executions on fork `t4QvrtrPnTwRU6br`.

## Verdicts

| case | what | clone exec(s) | verdict |
|---|---|---|---|
| T1 | tier ask renders (SRTBF11710, 3× "has promotion"), get-results suppressed, tier_offer + roster + query_brands persisted | 12939282 | **PASS** |
| T2 | tier pick "2" → dealer recomposed ["Sorento Dealer"], get-results via t4Qv clean tool/contact, real 2-promo result, attachments would_send | 12939427 | **PASS** |
| T3 | partial-tier ask — "3. End user - no promotion" variant (CWC7606-SH) | 12939549 | **PASS** |
| T4 | D14 suppression — 0 rows all tiers → no ask, fallback get-results `crm_marketing_promotions_list`, honest not-found | 12939589 | **PASS** |
| T5 | promo-pick lane — "1" (matched 1/files 1, drift []) and "all" (matched 2/files 2) against injected `suggest_last_result_set`; presign+files stay would_send | 12939644, 12939690 | **PASS** |
| T6 | round-3 rev-3 regression subset: Q1 / Q3-t1 / Q7-t1 / Q7oh-t2 — ALL byte-identical to baselines mod `_Data last updated_`; gates + persisted vars identical; Q1 zero roster GET; Q7 one roster GET | 12939801 / 12939837 / 12939877 / 12939902 | **PASS** |
| T7 | replay bypass — structural: tier lane hangs ONLY on `replay-get-results[1]` (live branch); replay TRUE[0] → fixture-get-results → validator | (wiring assert) | **PASS** |
| S | §0 tally (below) | all | **PASS** |

## §0 tally (S1–S6, all 10 executions)

- **S1** PASS. 36/36 egress records are `would_log`/`would_write`/`would_send`. Sendmsg fork
  `aQUmwMVplmNcyUVc` short-circuited on all 10 calls (union of executed nodes contains no HTTP
  send). No `api.respond.io` call anywhere in the 46 swept sub-executions. Driver
  `llen sorento-respond-message` after=0 on every run; sink `sorento-respond-message-TEST`
  +1 per run (save-msg fork `tWm5DYLxfypmVC1T`, its only nodes = trigger + Redis TEST push).
- **S2** PASS. HI fork never invoked; no Assign / sla / add-comment / assignee-queue /
  round-robin node executed anywhere.
- **S3** PASS. `save-session-vars` and `update-human-intervened` still 0-inbound and never
  executed; every state write is a `would_write` record.
- **S4** PASS. All 13 `t4QvrtrPnTwRU6br` invocations (7 get-results + 6 tier probes) used read
  tools only: `crm_marketing_promotions_list` ×10, `crm_incoming_stock_list`,
  `crm_inventory_stock_balance_list`, `crm_order_management_orders_list`. Never
  `crm_it_support_ticket_create`. `contact_id` trimmed on all (PR #24 hotfix leaves confirmed).
- **S5** PASS. Trigger `test_mode===true` on all 10 clone execs; parser + sendmsg sub inputs
  `is_test=true` (get-results fork receives none by pre-existing design; covered by S4).
- **S6** PASS. Deterministic turns (T1/T3/T4/T6×4): **0 LLM nodes** anywhere (parser fork
  short-circuits at `test-reformulator-bypass`). Parser turns (T2/T5×2): LLM = parser fork
  `AI Agent`+`OpenAI Chat Model` only. get-results fork: **agent not live** — 0 LLM in 13
  invocations (`MCP Client1`/`entity-ids-transformer`/`output-structurer` only). Pre-existing
  sinks: get-rag OpenAI **embeddings** HTTP on 9 execs (unchanged, all scopes). New non-LLM
  cost from the graft: 3 CRM probe reads per ask-lane promotion turn (T1/T3/T4).

## Deviations / observations

1. **Task reference missing:** `tests/runs/promotion-hotfix-20260818.md` does not exist in this
   worktree. Contact-487555417 conventions were taken from `clone-tier-rebase-SMOKE-20260818.json`
   and the seed envelope byte-recovered from smoke exec 12938676.
2. **T2 result differs from the cited hotfix observation** ("CABANA COMBINE PROMO DEALER pdf"):
   the real parser carried `query_brands:["sorento"]` from the injected state, so tier-gate
   recomposed `["Sorento Dealer"]` and the CRM returned the 2 SORENTO DEALER promos. Correct per
   tier-gate semantics (brand ∩ tier); functional expectation (real result + attachment
   would_send) met.
3. **Harness cosmetic bug — `guard-g-record` emits malformed JSON:** its template interpolates
   `{{ JSON.stringify($json.url) }}` but the presign item carries `presigned_url`, so every
   send-message-files egress record renders `"presigned_url": ,` and fails `fromjson`. The
   blocked-send guarantee is unaffected (send node 0-inbound; record still lists filename), but
   tooling that parses the egress list skips these records. Suggest s/$json.url/$json.presigned_url/.
4. **T6-Q7 driver saw prod llen 2→0:** two items were on the LIVE `sorento-respond-message`
   list before that run and were drained during it — transient live traffic consumed by the live
   sender (adjacent runs 0→0; sink +1 exactly; no node in any of my executions writes that list).
   Not egress from the clone.
5. **T5 "all" republished a 6-row roster:** the pick re-query came back wider (that turn's parser
   dropped the brand narrowing), but label-based resolution picked exactly the 2 promotions the
   customer saw (`drift:[]`, files 2). Vestigial-lane behavior, parser-variance, not a graft defect.
6. **Replay determinism footnotes** (T7 file, for the reviewer): (a) grafted `get-presigned-url`
   sits on the shared attachments loop — a replay turn with attachments now makes a real
   (read-only, stateless) CRM presign POST, so replay is no longer strictly 0-external-call for
   attachment turns; (b) `promo-dym-probe` is not replay-gated, same as the pre-existing
   `dym-probe` it parallels (exposure unchanged); (c) `promo-picker` in replay is a pure code
   node over pinned data.
7. **get-results LLM liveness:** the agent path is NOT live on fork `t4QvrtrPnTwRU6br` (no
   agent node executed in any invocation) — get-results tier remains 0-LLM.
8. **Driver scope field:** `zz-canary-run` hardcodes `workflowInputs.scope='deterministic'`;
   actual tier control rides in the redis item (LESSONS #1). S6 judged from observed LLM nodes.

## Egress tally

36 records / 10 executions, all `would_*`: T1 3, T2 5, T3 3, T4 3, T5-1 4, T5-all 5,
T6Q1 4, T6Q3 3, T6Q7 3, T6Q7oh2 3. Zero real sends, zero assignment/SLA/PIC writes, zero CRM
writes. Prod redis list untouched by the harness on every run.
