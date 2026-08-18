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

---

# rev-3 delta pass (2026-08-18, later session) — "yes mocha" resolves + offer copy

Evidence: `tests/runs/miss-company-routing-{M7a,M7b,M7c,M7d,M7e,M1r3,M4r3}-20260818.json`. Diff: `tests/diffs/miss-company-routing.md`
§rev-3. UAC rows: M7a–M7e + the re-worded M1 / M4a-t1 rows in `tests/miss-company-routing-UAC.md`.

## Targets (verified before AND re-fetched after the pass — unchanged)

- Clone `txiPzSxy3Pclsz6v` @ **`709461ec-632c-4dac-a38a-e98346e6f9a6`** (draft==active, 156 nodes). Rev-3 bodies sha-verified
  against the published workflow == diff-doc rev-3 table: `compile-current-state` `07a31bb3…`, `build-cs-member-offer` `c7046c45…`,
  `build-miss-member-offer` `68eef4c7…`.
- Parser fork `wI5RkNGW3EOJfBdo` @ **`3a397f2b-687b-457f-bab3-42c10f77185c`** (draft==active): `output_exchange` `ea40047b…`,
  `AI Agent.systemMessage` `619097f5…`.
- HI fork `vUfFUDjLAuMaeQE6` @ `0fdba9e5-…`; sendmsg fork `aQUmwMVplmNcyUVc` @ `51fed3d1-…`.
- Live untouched after: spine `efa21057-…`, parser `89b63c51-…`, HI `9249e00e-…` (draft==active).

## Mechanism (differs from the rev-1 pass — read this before re-running)

`POST /webhook/zz-run-hint` → clone execution matched by **my `test_run_id`** (`UAC-MCR-<case>-20260818`; the captain's
`chatui-*` runs were interleaved on the same clone, so "latest execution" is NOT reliable) → REST `GET /executions/{id}?
includeData=true` + every sub-execution. Items ran `mode=uac` with **state injected at item TOP level as
`previous_conversation_state`** (`sim-inject-gate` → `sim-inject-session` → `get-session-vars`; the injected object is the
prior turn's persisted `variables` lifted from its `save-session-vars would_write` payload). No `n8n_test` session
round-trip, no `contact.chat_id` (HI fork stops at `test-guard`), mock at item TOP level on deterministic turns, NO mock on
parser-tier turns (real fork gpt-5.4-mini). Nine clone executions total.

## Verdicts

| case | tier | clone exec(s) | verdict | note |
|---|---|---|---|---|
| M7d multi wording (both-miss MWC-SC08B offer) | det | 12910840 | **PASS** | sent == ccs.user_response == persisted `variables.response`; close EXACTLY `If you have no preference, reply with the company name (*Mocha* / *Sorento*) and we'll assign accordingly.`; no `just reply 'yes'`; headers `*Mocha:*`/`*Sorento:*`; lines plain (`1. Ms Bay` … `9. Nurain`, no suffix); note `(*Mocha* and *Sorento*)`; phrase plain `…escalate to customer_service team?`; `cs_multi_close` exported, `cs_offer_company` null. Miss-lane multi arm covered by an offline unit on the DEPLOYED `build-miss-member-offer` (jq'd from 709461ec): 2 rows ⇒ headers + company sentence, shared member one number under each; 1 row ⇒ flat + yes-sentence; one empty ⇒ single; all empty ⇒ passthrough |
| M4r3 (M4a-t1 wording re-assert) | det | 12910840 (same exec) | **PASS** | as M7d + persisted: `member_offer`, 9 rows idx 1..9, 2-row plan, `routing_company` null, `routing_companies` 2 |
| M7c bare "yes" still clarifies on multi | **parser** (t2p) + det (t2m) | 12910902 · 12911184 | **PASS** | t2p: fork `AI Agent` RAN and the systemMessage expression rendered `Companies named in the pending offer …: Mocha / Sorento` from the injected state (read from `OpenAI Chat Model.inputOverride`); LLM raw `escalation {is_escalation_confirmation:true, company_pick:null}`, `is_affirmative:true`; `output_exchange` → `{is_escalation_confirmation:true}` (no `company_pick` key — raw key stripped); spine `multi_company_unpicked` → clarify TRUE → **HI NOT called, no HI egress**; clarify text byte-equal to plan; state re-persisted (phrase, 9 rows, member_offer, 2-row plan). t2m (mock) identical spine outcome |
| M7a "yes mocha" | **parser** | 12910944 | **PASS** | pool rendered `Mocha / Sorento`; LLM raw `is_affirmative:true` + `company_pick:"Mocha"` (Tier-2 affirmative arm — the exact branch that used to lose the pick); `output_exchange.escalation == {is_escalation_confirmation:true, company_pick:"Mocha"}`, no `preferred_assignee_id`, `member_pick_context:true`; spine `escalation-context` `company_pick` / Mocha / brand null; clarify gate FALSE (`clarify-company-reply` not run); HI fork is_test=true, `company_id` Mocha, short-circuit at `test-guard-record`; egress `human-intervention-sub` payload Mocha, `explicit_assignee_id` null. Corroborates the planner's exec 12910397 |
| M7b "mocha please" | **parser** | 12910996 | **PASS** | identical chain to M7a (`company_pick:"Mocha"`, HI short-circuit with the Mocha pair) |
| M7e single-company wording (CS arm) + bare yes | det | 12911046 · 12911085 | **PASS** | t1 SRTWC287A-RL-7405 not-found → `…escalate to *Sorento* customer_service team?`; picker `1. Maryam Ariffin` … `6. Nurain` plain, no headers; yes-sentence byte-identical; `build-cs-member-offer.response == sent == persisted variables.response`; `cs_offer_company "Sorento"`, `cs_multi_close` null; 1-row plan {Sorento, brand `sorento`}. t2 "yes" (M3 mock, injected t1 state) → `prior_state` Sorento/`sorento`, gate FALSE, HI short-circuit, egress pair matches, no explicit assignee |
| M1r3 partial miss (MUB6201) + REAL-parser bare yes | det (t1) + **parser** (t2p) | 12911114 · 12911145 | **PASS** | t1: gate TRUE, plan 1 {Sorento, mocha}, `get-cs-members-miss` once (200, 6), `get-cs-members` not run; reply = 2 Mocha order blocks + `*Sorento:* no orders records for MUB6201.` + `Would you like me to escalate to *Sorento* customer_service team?` + `Please choose…` + `3. Maryam Ariffin` … `8. Nurain` (plain, numbering continues after the 2 order blocks) + unchanged yes-sentence; persisted `variables.response` ends with the same bold phrase, lrs 8 rows idx 1..8 full shape, member_offer, 1-row plan, `routing_company` Sorento / `routing_brand` mocha. t2p (real parser "yes"): pool rendered `Sorento / Mocha` (plan ∪ `routing_companies` — MUB6201 resolves in both), raw `company_pick:null`, oe `{is_escalation_confirmation:true}` → spine `prior_state` Sorento/mocha, HI short-circuit, egress pair matches |
| **§0 zero-egress** | all 9 execs | **PASS — gate held** | see below + the S3 caveat |

## §0 safety gate (S1–S6) — PASS on all 9 clone executions (per-case `S0` block in each JSON)

- **S1** no `send-message-files/images/video` in any runData; every sendmsg sub-exec (`aQUmwMVplmNcyUVc`) had `is_test=true`
  and executed only `Code in JavaScript / If1 / Loop Over Items / chat? / guard-text / guard-record-text / is-last-quickreply`
  (+ `Chat Memory Manager`, see caveat) — never `Send a Message` / `HTTP Request` / `Send Template`; egress lists contain only
  `would_log` / `would_write` / `would_send`.
- **S2** every HI invocation (M7a, M7b, M7e-t2, M1r3-t2p) hit fork `vUfFUDjLAuMaeQE6` with `is_test=true` and ran only
  `trigger, chat?, test-guard, test-guard-record`; `get-round-robin-assignee`/assign/SLA/comment never executed. M7c: HI not
  invoked at all.
- **S3** orphaned `save-session-vars` (prod PUT) and `update-human-intervened` absent from every runData; `mode=uac` ⇒
  `session-save-gate` FALSE, `pg-upsert-session` did not run either (n8n_test untouched). **Caveat (pre-existing, NOT rev-3):**
  the sendmsg fork's `Loop Over Items` done-branch runs `Chat Memory Manager` (mode `insert`) backed by `Postgres Chat Memory1`
  whose credential is **`sorento-crm-db` (`ETJL5KoaA1UpkDip`)**, session key = `contact_identifer` (437264483) — it executed
  (`{success:true}`) on every text-reply turn (M7d-t1, M7e-t1, M1r3-t1, M7c-t2p/t2m) BEFORE `guard-text`. It is byte-identical
  wiring to the live sendmsg sub `aoydkG1dbItXR5jXFEQsP` and it also ran on every prior pass (e.g. rev-1 M4a-t1 sendmsg exec
  12906739), so it is not new and reaches no contact/session/assignment — but it IS an insert into an n8n chat-memory table
  in the prod CRM database under the captain's real contact id. Flagging for the reviewer/captain: if "zero CRM writes" is
  meant literally, the fork's memory node should be re-pointed to `n8n_test-db` (the parser fork already uses `n8n_test-db`
  for its `Postgres Chat Memory`) or moved behind the guard. Not treated as a rev-3 FAIL.
- **S4** get-results fork `t4QvrtrPnTwRU6br` ran only on the 3 order turns; resolved `tool` = `crm_order_management_orders_list`
  (note: the value carries a trailing space, pre-existing) — READ; agent path not executed (`MCP Client1` + structurer only,
  consistent with the orphaned-agent observation). Only other external call: `get-cs-members-miss`/`get-cs-members` GET
  team-members (CRM read).
- **S5** trigger `test_mode=true` on all 9; parser fork / sendmsg / HI subs `is_test=true` on every invocation.
- **S6** deterministic turns: fork ran only `mock-reformulator-output` + `test-reformulator-bypass` (AI Agent NOT executed);
  clone LLM nodes: none on any turn. Exactly FOUR real LLM executions, all by design (parser tier): M7c-t2p, M7a-t3, M7b-t3,
  M1r3-t2p. No new token sink observed (no reformulator/clarify LLM on the clone).

## Observed-vs-expected deviations (verbatim)

1. **`entities` on the parser-tier company-pick turns is NOT `[]`.** UAC M7a/M7b say `entities == []`; observed
   `output_exchange.entities == [{"raw":"MWC-SC08B","hint":"product","current_message":false,"canonical_code":"MWC-SC08B"}]`
   (LLM `entity_op:"reuse"`, prior entity carried with `current_message:false`). Same on M7c/M1r3-t2p (real "yes") and on the
   planner's exec 12910397 (`MUB6201`, `current_message:false`). Rev-1 M4b saw `[]` only because its t2 was a MOCK turn whose
   persisted state had `entities: []`. Not a regression — no `current_message:true` entity, no query re-fires, downstream
   identical (company_pick → HI). Suggest re-wording the UAC to "no `current_message:true` entity".
2. **Pool rendering on the M1 (partial-miss) state = `Sorento / Mocha`**, not just `Sorento` — by design (plan ⊕
   `routing_companies`; MUB6201 resolves in both). Consequence worth knowing: on that state "yes mocha" would be a valid
   `company_pick` → Mocha (its `routing_companies` row carries the Mocha company_id), even though only Sorento was offered.
   Not exercised; flag for the planner.
3. Nothing else deviated: every wording assertion (headers, plain lines, note, multi close, single-company bold phrase,
   unchanged yes-sentence), the parser assertions and the spine routing matched the UAC rows exactly.
