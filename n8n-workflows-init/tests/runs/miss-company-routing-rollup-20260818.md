# miss-company-routing — tester rollup (UAC pass, 2026-08-18)

Tester: sorento-tester · Plan: `plans/miss-company-routing-plan.md` · UAC: `tests/miss-company-routing-UAC.md` ·
Diff: `tests/diffs/miss-company-routing.md` · Evidence: `tests/runs/miss-company-routing-{M1,M2,M3,M4a,M4b,M5,M6,R2spot}-20260818.json`

## Targets (verified before the pass; re-verified after)

- Clone `txiPzSxy3Pclsz6v` @ **`a1969f5c-884e-4bee-85fb-bd96c18c6d89`** (draft==active, 156 nodes) during **all** M-case
  executions. All 9 changed/new bodies sha-verified byte-equal to `tests/diffs/miss-company-routing/*` before running;
  `get-cs-members-miss` params+credentials deep-equal to `get-cs-members`, `onError: continueRegularOutput`; the 5 orphaned
  egress nodes still 0-inbound; every sendmsg/HI/parser sub-call still passes `is_test=true`.
- Parser fork `wI5RkNGW3EOJfBdo` @ **`d7be8443-827e-4a85-9638-aa243fea6c2d`** (unchanged through the pass).
- **Clone republished MID-PASS**: rev-2 `d4ce02eb-e337-447c-bf05-9a13f504dd53` published 02:13:03Z — *after* the last
  M-run (02:12:08Z), so every M-case ran on `a1969f5c`. Diff = one guarded line in `escalation-context`'s NO-roster-plan
  sameTeam sub-branch only (sha `4d7bbe29…`→`c14da5d7…`, matches the diff doc's rev-2 section). No M-case traverses that
  sub-branch (all escalation turns had plan rows). **Spot-check re-ran the two roster-backed arms on `d4ce02eb`**
  (picked_member + multi_company_unpicked clarify) — identical outputs, zero egress (`R2spot` file). Rev-2's own
  photo→yes journey is queued per the diff doc and is NOT covered by this pass.
- Live untouched (re-fetched after the pass): spine `9qVyfUxmRQqrpGRMDLRuz` @ `efa21057-…`, parser `XTODTw-dJcV0uRdC056hG`
  @ `89b63c51-…`, HI `rrYXzE61gCNUck_zmXe-G` @ `9249e00e-…` (all draft==active, unchanged).

## Mechanism

`POST /webhook/zz-run-hint` (zz-canary-run `VtIV3TF3aw2Fx8No`; clears `test:q:437264483` + `test:egress:{id}`, seeds the
item, executes the clone with waitForSubWorkflow, returns the egress list) → REST `GET /executions/{id}?includeData=true`
incl. sub-executions. Items `mode=regress-capture` (session via `n8n_test.respond_contacts_test`; row reset to
`{"variables":{},"referenced_result_set":[]}` between independent cases, never inside a sequence; reset again after the
last run). Roster re-probed first via `zz-roster-probe` (exec 12905975): Sorento+mocha pool = 6 members
(Maryam Ariffin, Cyndi, Aisyah, Balqis, Niki, Nurain) — matches M1's expected count.

## Verdicts

| case | turns (run/clone execs) | verdict | note |
|---|---|---|---|
| M1 partial miss → Sorento picker | 12906535/12906536 | **PASS** | gate TRUE; plan = 1 `{Sorento, mocha}` row; `get-cs-members-miss` once (200, 6 members), `get-cs-members` NOT run; reply = 2 order blocks + "*Sorento:* no orders records" + frozen phrase + picker 3..8 `n. Name (Sorento)` + yes-sentence; persisted: phrase in `variables.response`, lrs = 2 order + 6 member rows (idx continuous, full shape), `selection_context member_offer`, 1-row `routing_roster_plan`, `routing_company/brand = Sorento/mocha` |
| M2 number pick | 12906601/12906602 | **PASS** | pick "3" (Maryam, uuid `0d69dfb7…`); escalation-context Sorento/mocha `picked_member`; clarify gate FALSE; HI inputs+egress carry the pair + explicit assignee; HI fork short-circuit at `test-guard-record`, `get-round-robin-assignee` NOT run |
| M3 bare "yes" | t1 12906653/12906654 · t2 12906672/12906673 | **PASS** | rev-4 verbatim arm: `prior_state`, Sorento/mocha pair, no explicit assignee; gate FALSE; HI short-circuit |
| M4a both-miss → clarify → "mocha" | 12906722/12906724 · 12906747/12906748 · 12906761/12906762 | **PASS** | t2: `multi_company_unpicked` → clarify gate TRUE, **HI NOT called, no HI egress**, exact plan wording sent via guarded send; state re-persisted (phrase, 9 rows, member_offer, 2-row plan). t3: `company_pick` → Mocha pair (brand null per B2 shape), HI short-circuit, no explicit assignee |
| M4b parser-tier "mocha" | t1 12906828/12906829 · t2 12906844/12906845 · t3 12906857/12906858 | **PASS** | real fork run (`is_test=true`): `output_exchange` emitted `escalation {is_escalation_confirmation:true, company_pick:"Mocha"}`, `entities []`, no `preferred_assignee_id`, via **Tier 2.5** (`member_pick_context:true`); downstream identical to M4a t3; live parser versionId unchanged after |
| M5 qty-0 stock not a miss | 12906909/12906910 | **PASS** | gate executed FALSE (domain+routing legs) even though the envelope had a qty-0 row AND a "*Sorento:* no stock records" line; no picker/phrase; state pre-change stock shape |
| M6 regression guard | a 12906987/12906988 · b 12907044/12907045 + 12907107/12907109 · c offline | **PASS** | a: found-order turn, gate FALSE, miss lane inert, state pre-change. b: promotion rides the access-choice path (miss lane never reached, no new node ran). c: offline units on the byte-exact deployed bodies — degraded roster ⇒ exact passthrough, zero-member ⇒ passthrough, gate false on all-answered/no-lookup/unlabelled/wrong-domain, true on the real M1 envelope |
| R2spot rev-2 binding | 12907363/12907364 · 12907381/12907382 · 12907418/12907419 · 12907434/12907435 | **PASS** | picked_member + clarify-divert arms byte-identical on `d4ce02eb` |
| **S §0 zero-egress** | all 20 clone executions | **PASS — gate held** | see below |

## §0 safety gate (S1–S6) — PASS on every execution

Across all 20 clone executions (15 M-runs + 1 discarded first M1 attempt + 4 rev-2 spot-checks):

- **S1** zero real sends — every sendmsg sub (`aQUmwMVplmNcyUVc`) received `is_test=true` and stopped at the guard nodes;
  no respond.io message HTTP anywhere; `send-message-files/images/video` never executed. Runner llen probes: prod list
  `sorento-respond-message` 0→0 on every run.
- **S2** zero assignment/escalation writes — every HI invocation hit fork `vUfFUDjLAuMaeQE6` and short-circuited at
  `test-guard`/`test-guard-record` (nodes = trigger, chat?, test-guard, test-guard-record only); assign/SLA/comment/
  assignee-queue/`get-round-robin-assignee` never executed. M4a-t2/R2b-t2 (clarify divert): HI not invoked at all, no HI
  egress record.
- **S3** zero CRM/contact writes — orphaned `save-session-vars` (prod PUT) and `update-human-intervened` absent from every
  runData; session persisted only via `pg-upsert-session` (cred `n8n_test-db`). Egress lists contain only
  `would_log`/`would_write`/`would_send` guard records.
- **S4** get-results read-only — tools observed: `crm_order_management_orders_list`, `crm_inventory_stock_balance_list`;
  never a write tool. The only NEW external call in the whole pass is `get-cs-members-miss` = GET
  `…/external/team-members?…` (CRM read, same credential as `get-cs-members`).
- **S5** test_mode provably present — trigger `test_mode=true` on every clone exec; parser/sendmsg/HI subs `is_test=true`.
  Pre-existing note carried over from the B-series: the get-results fork `t4QvrtrPnTwRU6br` takes no `is_test` input
  (read-only tool verified under S4).
- **S6** token sinks bounded — deterministic turns: parser fork ran only
  `mock-reformulator-output`/`test-reformulator-bypass` (AI Agent NOT executed), clone LLM nodes = none. Exactly TWO real
  LLM executions in the pass: (1) M4b t3 — by design (parser tier, fork gpt-5.4-mini); (2) the discarded first M1 attempt
  (see deviations). No new token sink observed.

## Deviations / notes for the reviewer

1. **UAC seed-template mock placement is wrong.** The template puts `mock_reformulator_output` inside `item.message`; the
   clone maps it from `$('redis-pop-main-message-list').json.message.mock_reformulator_output` and the redis pop wraps the
   whole seeded item under `message` — so the mock must sit at the item TOP level. First M1 attempt
   (`UAC-MCR-M1-t1-20260818`, 12906280/12906281) therefore ran the real fork LLM once (S6-deterministic violation on that
   attempt only; zero egress held; functional path identical). Case re-run cleanly after a session reset. Fix the template
   in `tests/miss-company-routing-UAC.md` (and note it for future UACs).
2. **CRM fixture drift (benign).** MUB6201 now has TWO Mocha order records (M2608-0723, M2608-1026), so the picker numbers
   members 3..8 (UAC's literal text said 2..7 after one order block) and M2's pick is "3" not "2". The structural rule the
   plan locks — numbering CONTINUES after the reply's numbered blocks — is exactly what held.
3. **M6a envelope shape.** An order-NUMBER lookup returns `lookup_companies: null` and answers without a `company_name`
   field → the gate failed closed on those legs (not the literal "miss set empty" leg). Same no-offer outcome; the
   miss-set-empty leg is proven by the offline unit on the deployed gate expression (all-answered ⇒ false).
4. **M6b (promotion) never reaches an answered envelope** for this contact under the deterministic mock — the
   access-level-choice reprompt repeats even after a "dealer" reply (pre-existing promotion-flow mechanics, unrelated to
   this change; no new node executed on either turn). The "answered non-order turn ⇒ gate executed FALSE" evidence is M5.
5. **Clone republished mid-pass (rev-2).** All M-runs pre-date the publish; rev-2 diff is confined to the no-plan
   escalation arm; roster-backed arms spot-checked green on the new version. Rev-2's own photo→yes journey still needs its
   queued verification run — not part of this UAC.
6. Sorento roster pool re-probed at 6 members (matches UAC); `zz-roster-probe` exec 12905975. `n8n_test` session row reset
   to empty after the final run.
7. get-results LLM liveness: the fork's agent path did NOT run on any turn (`MCP Client1` + structurer only) — consistent
   with the B-series observation that the get-results agent is orphaned in the fork.
