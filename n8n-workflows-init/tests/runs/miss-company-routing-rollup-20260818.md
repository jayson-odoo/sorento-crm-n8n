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

---

# rev-4 delta pass (2026-08-18, later session) — codes/aliases + any-shape picks, offer-hold, offered-pool rule, S3

Evidence: `tests/runs/miss-company-routing-{M8a,M8b,M8c,M8d,M8e,M8f,M8g,M8reg,S3}-20260818.json`. Diff: `tests/diffs/miss-company-routing.md`
§rev-4. UAC rows: M8a–M8g + S3 in `tests/miss-company-routing-UAC.md` (+ the captain's extra asks (i)–(vi)).

## Targets (verified via REST before the pass AND re-fetched after — unchanged, all draft==active)

- Clone `txiPzSxy3Pclsz6v` @ **`0557b0b4-8f2d-457e-8f64-4e1d600c6ca1`** (159 nodes). Rev-4 bodies sha-verified == diff-doc rev-4 table:
  `compile-current-state` `5a84dfea…`, `escalation-context` `cca7a245…`, `clarify-company-reply` == `offer-hold-reply` `7ff06aa8…`,
  `escalate-catalog` `0168df84…`, `offer-hold-gate` leftValue `8f14a430…`, `tag-offer-hold` params byte-equal. The 5 orphaned egress nodes
  still 0-inbound; every sendmsg/HI/parser `executeWorkflow` call still hard-codes `is_test=true` (get-results/rag/save-msg forks take none,
  pre-existing).
- Parser fork `wI5RkNGW3EOJfBdo` @ **`de9ff09d-a240-46af-98fd-0d5992fdd16d`** — the FINAL rev-4 body, NOT the intermediate `0cedb928`
  (`output_exchange` `b2ac7783…`, `AI Agent.systemMessage` `138008c2…`; and M8e-t3, the decline→"sorento" unit that separates the two
  bodies, behaved as the final body). `Postgres Chat Memory` on `n8n_test-db`.
- Sendmsg fork `aQUmwMVplmNcyUVc` @ **`b48e0eaa-6dbd-4f1b-bf81-40cf6804c933`**: `Postgres Chat Memory1.credentials.postgres ==
  {Dnnofg8Xb27VQOhI, n8n_test-db}`; no node in the fork carries `ETJL5KoaA1UpkDip`. HI fork `vUfFUDjLAuMaeQE6` @ `0fdba9e5-…`.
- Live untouched after: spine `efa21057-…`, parser `89b63c51-…`, HI `9249e00e-…`, sendmsg `aoydkG1dbItXR5jXFEQsP` `91171ac3-…` (its own
  `Postgres Chat Memory1` still on `sorento-crm-db` = live prod behaviour, out of scope).

## Mechanism (same as rev-3)

`POST /webhook/zz-run-hint` → clone execution matched by **my `test_run_id`** (`UAC-MCR-M8*-20260818`; captain/planner runs interleave)
→ REST `GET /executions/{id}?includeData=true` + every sub-execution. `mode=uac`, state injected at item TOP level as
`previous_conversation_state`; seeds = persisted `variables` lifted from earlier `save-session-vars would_write` payloads: **state_bothmiss**
(M7d-t1: MWC-SC08B both-miss 2-company offer, 9 member rows, 2-row plan), **state_m1r3** (M1r3-t1: MUB6201 partial miss — Sorento-only
roster offered, 1-row plan, `routing_companies` Mocha+Sorento), **state_srt** (M7e-t1: SRTWC287A-RL-7405 single-company CS offer).
Follow-up turns inject the previous turn's would_write. Every M8 turn ran the REAL parser (no mock) except `M8reg-t2m` (M3 confirm mock,
item top level). No `contact.chat_id`. 15 clone executions total. Corroboration cited (planner rev-4 replay 12913160/12913172/12913185/
12913195 — same outcomes); all verdicts below are from my own executions.

## Verdicts

| case | tier | clone exec | verdict | note |
|---|---|---|---|---|
| M8a "yes please escalate to srt team" (both-miss) | parser | 12913499 | **PASS** | pool rendered `Mocha (code MCH) / Sorento (code SRT)`; LLM raw `request_for_help`, `is_affirmative:true`, `company_pick:"Sorento"`; oe `{is_escalation_confirmation:true, company_pick:"Sorento"}`, no `preferred_assignee_id`, `member_pick_context:true`, no `current_message:true` entity; spine `company_pick` Sorento/`mocha`; clarify gate FALSE; `offer-hold-gate`/`If10`/LLM not executed; HI fork `is_test`, Sorento pair, short-circuit `test-guard-record`; egress pair, `explicit_assignee_id` null |
| M8b "srt" | parser | 12913556 | **PASS** | LLM raw `casual`, `company_pick:"Sorento"` (LLM knows the codes now); oe `company_pick Sorento`, no `member_reprompt`/`offer_hold`; same spine/HI chain as M8a |
| M8c "please escalate to sorento team" | parser | 12913573 | **PASS** | LLM raw `request_for_help`, `is_affirmative:null` (the captain 12910616 shape); oe `company_pick Sorento` → `company_pick` source, HI Sorento/mocha — NOT `multi_company_unpicked` |
| M8d t2 junk "asdkjh" on the multi offer | parser | 12913601 | **PASS** | oe `{is_escalation_confirmation:false, member_reprompt:"out_of_range", offer_hold:true}`, `correction:false`, `member_pick_context:true`; spine `If2`F → `If-ideate`F → **`offer-hold-gate` TRUE → `offer-hold-reply` → `tag-offer-hold` → `escalate-catalog` (`branch_kind offer_hold`, `is_escalate_offer false`, `manualResponse true`)**; `If10`/`Basic LLM Chain`/`cs-roster-plan`/`get-cs-members`/`build-cs-member-offer`/`clarify-company-reply`/HI NOT executed; sent == rev-4 clarify copy `Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company (Mocha / Sorento) and I'll assign automatically.`; persisted: `member_offer`, the same 9 rows (1 Ms Bay … 9 Nurain), 2-row plan, 2 companies, `response` still carries the frozen phrase |
| M8d t3 "sorento" (t2 state injected) | parser | 12913630 | **PASS** | pool rendered from the survived state; oe `company_pick Sorento`; spine `company_pick` Sorento/mocha; HI short-circuit, egress Sorento pair |
| M8d single-offer junk (M1 seed, "asdkjh") | parser | 12913669 | **PASS** | oe `{member_reprompt:"out_of_range"}` (NO `offer_hold`), `correction:true`; `offer-hold-gate` executed FALSE → `If10` → `If9` → `Basic LLM Chain` ("Hello! How can I assist you today?"), `offer-hold-reply` not run, HI not called — the pre-rev-4 path incl. its pre-existing single-offer state loss (`selection_context` → null), documented out of scope |
| M8e "no" · (i) "no it's okay" | parser | 12913705 · 12913720 | **PASS** | both: LLM `is_affirmative:false`; oe `{is_escalation_confirmation:false, escalation_declined:true}`, no `offer_hold`/`company_pick`; `offer-hold-gate` FALSE → `If10` → `is-escalation-declined` TRUE → `tag-escalation-declined`; sent `Escalation declined.`; HI NOT called; persisted `selection_context null`, `response "Escalation declined."`, `last_result_set []` (offer cleared; `routing_roster_plan` 2 rows still carried by the axes block — expected, see diff doc) |
| M8e t3 "sorento" after the decline | parser | 12913748 | **PASS** | oe `{is_escalation_confirmation:false}` — NO `company_pick`, `member_pick_context` null; `escalation-context` not executed, HI not called; casual → `Basic LLM Chain` small-talk (`Hi! Could you please share the company name you want to respond with?`) |
| M8f "any mocha promotions this month" | parser | 12913787 | **PASS** | oe `business_query`/`promotion`, entity `Mocha` (brand, current), NO `company_pick`/`offer_hold`, `member_pick_context` null; `offer-hold-gate` FALSE → normal promotion path (access-level-choice quick replies for this contact); no escalation-context/HI; persisted `selection_context null`, plan cleared |
| (ii) M8-newquery "stock for MWB7629" | parser | 12913802 | **PASS** | oe `business_query`/`inventory`, entity `MWB7629` current, no pick/hold; `offer-hold-gate` FALSE; real lookup (`resolve-entity` + get-results `crm_inventory_stock_balance_list`, probe `crm_incoming_stock_list` — reads) → not-found → dym suggest offer (`No stock for MWB7629. Try: MWB7620, MWB7621, MWB7624 …`); persisted `selection_context suggest_offer`, plan cleared — the offer was replaced, not hijacked |
| M8g (iii) "yes mocha" on the Sorento-only partial-miss seed | parser | 12913844 | **PASS** | pool rendered **`Sorento (code SRT)` only**; LLM raw `is_affirmative:true`, `company_pick:null`; oe `{is_escalation_confirmation:true}` (no `company_pick`), `member_pick_context:true`; spine **`prior_state` → Sorento/`mocha`**; HI fork inputs `company_id` Sorento (never Mocha), short-circuit; egress Sorento pair, no explicit assignee |
| M8g companion "srt" (same seed) | parser | 12913866 | **PASS** | oe `company_pick Sorento` → `company_pick` source Sorento/mocha, HI short-circuit |
| (vi) M8reg single-company CS offer + "yes" | det (t2m) + parser (t2p) | 12913916 · 12913930 | **PASS** | t2m: fork ran only mock/bypass (AI Agent not executed); t2p: pool `Sorento (code SRT)`, oe `{is_escalation_confirmation:true}`; both: `prior_state` Sorento/`sorento`, clarify FALSE, HI short-circuit, egress pair, no explicit assignee — unchanged behaviour |
| S3 (iv) sendmsg fork chat memory | – | all 15 sendmsg sub-execs | **PASS** | every sendmsg sub-execution's `workflowData` has `Postgres Chat Memory1` on `{Dnnofg8Xb27VQOhI, n8n_test-db}`, no node with `ETJL5KoaA1UpkDip`; `Chat Memory Manager` (insert) ran `{success:true}` on the 7 text-reply turns (12913607, 12913682, 12913711, 12913728, 12913764, 12913795, 12913817) → `n8n_test`; never `Send a Message`/HTTP |
| **§0 zero-egress (v)** | all 15 execs | **PASS — gate held** | see below |

## §0 safety gate (S1–S6) — PASS on all 15 clone executions (per-case `S0` block in each JSON)

- **S1** no `send-message-files/images/video` in any runData; every sendmsg sub-exec `is_test=true`, executed only `Code in JavaScript /
  If1 / chat? / Loop Over Items / Chat Memory Manager / guard-text|guard-qr / guard-record-* / is-last-quickreply` — never `Send a Message` /
  `HTTP Request` / `Send Template`; egress lists contain only `would_log` / `would_write` / `would_send`.
- **S2** every HI invocation (M8a, M8b, M8c, M8d-t3, M8g, M8g-srt, M8reg ×2 = 8) hit fork `vUfFUDjLAuMaeQE6` with `is_test=true` and ran only
  `trigger, chat?, test-guard, test-guard-record`; `get-round-robin-assignee`/assign/SLA/comment never executed. M8d-t2, M8d-single, M8e ×3,
  M8f, M8newq: HI not invoked at all.
- **S3** orphaned `save-session-vars` (prod PUT) and `update-human-intervened` absent from every runData; `mode=uac` ⇒ `pg-upsert-session`
  did not run; **the rev-3 caveat is CLOSED** — the sendmsg fork's `Chat Memory Manager` now inserts under `n8n_test-db` (see S3 row).
- **S4** get-results fork `t4QvrtrPnTwRU6br` ran only on M8newq: resolved tools `crm_inventory_stock_balance_list` (trailing space,
  pre-existing) and `crm_incoming_stock_list` (crossdomain-probe) — both `_list` READS per the MCP catalog (`sorento_crm_mcp/catalog.py`:
  the only write-shaped tools are `crm_it_support_ticket_create`, `crm_complaint_close`, `crm_order_cancel`, `crm_purchase_request_approve/reject`);
  never `crm_it_support_ticket_create`. Agent path not executed (`MCP Client1` + structurer only — orphaned-agent observation stands).
  Other externals: `resolve-entity-http`, `check-access-http`, `get-rag` (reads).
- **S5** trigger `test_mode=true` on all 15; parser fork / sendmsg / HI subs `is_test=true` on every invocation.
- **S6** parser tier by design: 14 real fork LLM runs (gpt-5.4-mini) — one per parser-tier turn; the mock turn ran only
  `mock-reformulator-output` + `test-reformulator-bypass`. Clone LLM (`Basic LLM Chain`, gpt-4.1-mini) executed on exactly TWO turns, both the
  pre-existing casual/small-talk lane (M8d-single 12913669, M8e-t3 12913748) — not a new sink; the offer-hold path (M8d-t2) is LLM-free as
  designed. No reformulator/clarify LLM added.

## Observed-vs-expected deviations (verbatim)

1. **None on the UAC-asserted routing/state/wording.** Every M8a–M8g row, the captain's (i)–(vi) asks and S3 matched the expected values
   exactly (tables above).
2. **Persisted `entities` after a held/junk turn = `[]`.** On M8d-t2 (junk on the multi offer) `output_exchange.entities == []` (the reprompt
   arm does not carry the prior MWC-SC08B forward) and arm B does not re-persist `entities`, so the survived state has `entities: []`
   (the M7c/M8a pick turns instead carried `{MWC-SC08B, current_message:false}`; M8b/M8c also emitted `[]`). Routing was unaffected
   (M8d-t3 resolved on that state); flagging only because the offer state now loses its product context across a held turn — reviewer/planner
   to decide whether arm B should also restore `entities`.
3. **`routing_roster_plan` (2 rows) is still carried after a decline** (M8e: axes block, same team) — expected per the diff doc's second
   parser publish (offer-open = frozen phrase only), and M8e-t3 proved a later "sorento" does not re-open it.
4. Single-offer junk still loses state via the casual/LLM lane (M8d-single: `selection_context` → null, "Hello! How can I assist you today?")
   — the diff doc's declared out-of-scope pre-existing gap; recorded, not a rev-4 FAIL.
