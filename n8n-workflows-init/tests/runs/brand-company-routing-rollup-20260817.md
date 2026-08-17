# Rollup — `brand-company-routing` tester pass · 2026-08-17

Plan `plans/brand-company-routing-plan.md` · UAC `tests/brand-company-routing-UAC.md` · Node-diff `tests/diffs/brand-company-routing.md`.
Targets (all `versionId == activeVersionId`, verified via REST before the run): spine clone `txiPzSxy3Pclsz6v` @ `ac51a12e-1493-4bc8-82a1-8beef6065dd8`,
HI fork `vUfFUDjLAuMaeQE6` @ `d2b82e80-8f22-437d-bf33-3781c505cd5f`, parser fork `wI5RkNGW3EOJfBdo` @ `7b4baaa8-5cb5-460e-b2f4-94a562dcc54f`,
replay orchestrator `aROEBlQyyoQaB7a1` @ `d52af206-…` (unpublished, as before). **Live untouched:** `9qVyfUxmRQqrpGRMDLRuz` `d6f6b90c-…`,
`XTODTw-dJcV0uRdC056hG` `9df39ff6-…` (updatedAt 2026-08-11), `rrYXzE61gCNUck_zmXe-G` `5018a189-…`. Published Code bodies of
`disallowed-entity-gate / build-cs-member-offer / compile-current-state / cs-roster-plan / escalation-context` are byte-identical to
`tests/diffs/brand-company-routing/*.js` (sha256 re-checked from a REST fetch); replay `Diff.jsCode` identical modulo one trailing newline in the file.

**Headline: §0 S1–S6 ZERO-EGRESS HELD on all 17 clone executions. No HALT.** Functional: B1 B2 B3 B4 B5 B7 B8 B9 P1 R1 PASS; B6 PASS-WITH-NOTE
(guard proven by variant B6b; the literal B6 sequence exposes a UAC-wording vs implementation ambiguity, see notes). No code defect found.

## Mechanism
`zz-canary-run VtIV3TF3aw2Fx8No` fired via `execute_workflow` (webhook body `{test_run_id, contact:"437264483", item}`) — it clears+seeds
`test:q:437264483` with `item`, runs the clone with `waitForSubWorkflow`, then reads `test:egress:{test_run_id}`. Item shape per `zz-canary-seed`
(`message.message.message.text`, Lesson 12), `mode=regress-capture` (session via `n8n_test.respond_contacts_test`, Lesson 31),
`scope=deterministic` + `message.mock_reformulator_output` (parser fork `test-reformulator-bypass` fired on every deterministic turn: sub nodes =
trigger/bypass/mock only, **AI Agent never executed**), P1 without mock (`scope=parser`). Node outputs + sub-executions read via n8n REST
`GET /executions/{id}?includeData=true` (Lesson 7; extracted with a script, no full dumps in context). Session row reset to
`{"variables":{},"referenced_result_set":[]}` between INDEPENDENT cases via host `psql` to `n8n_test` (guarded `current_database()='n8n_test'`,
`RETURNING` checked; the `.env` `N8N_TEST_DB_*` cred — never a prod DB). Runs strictly serial; no replay/dispatcher activity at start (Lesson 30).

## Case table
| case | zz-canary-run → clone exec (subs) | verdict | S1 | S2 | S3 | S4 | S5 | S6 | notes |
|---|---|---|---|---|---|---|---|---|---|
| B1 | 12833867 → **12833868** (parser 12833873, get-rag 12833875, get-results 12833878, sendmsg 12833884, save-msg 12833885) | PASS | ✓ | ✓ (HI not called) | ✓ | ✓ `crm_order_management_orders_list` | ✓ | ✓ 0 LLM | deg `routing_companies=[Sorento]`, `routing_company=Sorento`, `routing_brand=sorento(resolved)`; plan 1 item; get-cs-members 1 item → 6 members; reply = today's shape; `cs_last_result_set[].company_id` all Sorento; ccs persisted |
| B2 | 12834050 → **12834051** (parser 12834053, get-rag 12834056, get-results 12834061, sendmsg 12834065, save-msg 12834067) | PASS | ✓ | ✓ | ✓ | ✓ orders_list | ✓ | ✓ | `routing_companies=[Mocha(brand null), Sorento(brand mocha)]`, `routing_company=null`; plan 2; get-cs-members 2 items (Mocha 3, Sorento 6, fullResponse); reply has the "carried by more than one company (Mocha and Sorento)" note, `Mocha:`/`Sorento:` groups, 1..9 continuous, every line `(Mocha)`/`(Sorento)`; Mocha id `38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2` |
| B3 | 12834122 → **12834123** (parser 12834129, **HI 12834130**, sendmsg 12834131) | PASS | ✓ | ✓ HI short-circuit `test-guard-record`; `get-round-robin-assignee` NOT run | ✓ | ✓ (n/a) | ✓ | ✓ | pick "2" = Nicky (Mocha): `escalation-context {company_id: Mocha, company_name: Mocha, brand_code: "mocha", routing_source: picked_member}`; HI inputs `brand_code=mocha, company_id=<Mocha>, explicit_assignee_id=450e8690…`; egress payload equal |
| B4 | 12833987 → **12833988** (parser 12833991, **HI 12833992**, sendmsg 12833993) | PASS | ✓ | ✓ | ✓ | ✓ (n/a) | ✓ | ✓ | after B1: `{company_id: Sorento, brand_code: sorento, routing_source: prior_state}`; HI + egress payload equal |
| B5 | t1 12834186 → 12834187; t2 12834243 → **12834244** (parser 12834249, **HI 12834250**, sendmsg 12834251) | PASS | ✓ | ✓ | ✓ | ✓ (t1 orders_list) | ✓ | ✓ | after B2 re-run: `{company_id: null, brand_code: mocha, routing_source: multi_company_unpicked}`; HI `company_id=""`, egress `company_id:null` |
| B6 | t1 12834330→12834331; t2 12834379→12834380 (get-results 12834389 `crm_inventory_stock_balance_list`); t3 12834433→12834434 (HI 12834440) · **B6b** t1 12834500→12834501; t2 12834547→12834548; t3 12834598→12834599 (HI 12834603) | PASS-WITH-NOTE | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | literal B6: turn 2 "stock of SRTWC287A-RL-7405" **re-resolves the product** → deg emits `routing_companies=[Sorento]` FRESH → ccs `routing_company=Sorento` (not null); turn 3 → `escalation-context {Sorento, sorento, prior_state}`. **B6b** (turn 2 = warehouse question with no resolvable entity): ccs `routing_*` all null after the team switch; turn 3 `{null, null, prior_state_no_company}`, HI/egress null — carry-forward guard proven |
| B7 | probe `zz-roster-probe ZS0KErse7GDh9mJK` exec 12834976 | PASS | ✓ | ✓ GET only | ✓ | – | – | ✓ | roster parity table below; A4 gate: base `marketing_promotion` exists |
| B8 | 12834674 → **12834675** (parser 12834679, **HI 12834681**, sendmsg 12834682) | PASS | ✓ | ✓ | ✓ | ✓ (n/a) | ✓ | ✓ | `escalation-context {null,null,routing_source:none}`, HI inputs `brand_code:"", company_id:""`, egress payload null |
| B9 | B9 12834736→12834737 (not-supported: no offer); B9b 12834813→12834814 (business_query+correction: If10 F); **B9c 12834885→12834886** (correction + `message_type:complaint`) | PASS | ✓ | ✓ | ✓ | ✓ (n/a) | ✓ | ✓ | deg not executed → plan = 1 fallback item (null company/brand) → get-cs-members URL without `company_id`/`brand_code` → 6 members → single-company shape, `cs_last_result_set` company/brand keys null, ccs `routing_*` null. UAC's example trigger (`tag-not-supported`) never reaches `cs-offer-gate` (is_escalate_offer only for not_found/escalate_offer) — doc issue |
| P1 | 12835027 → **12835028** (parser fork **12835031 real LLM**, sendmsg 12835039) | PASS | ✓ | ✓ | ✓ | ✓ (n/a) | ✓ | ✓ only reformulator AI Agent | raw AI Agent + output_exchange both `routing.suggested_team="marketing_promotion"` (no suffix), domain promotion, entity MWC-SC08B; clone then asked for an access level (pre-existing multi-access behaviour) |
| R1 | – (static) | PASS (static) | n/a | n/a | n/a | n/a | n/a | n/a | norm() rule present in `Diff`; null-both-sides keys dropped (verified they ARE null on non-CS turns B6bt2/B9c/P1); sample replay NOT run (see below) |

Egress lists (from `read-egress`) per case contained only: `save-message-redis would_log` (TEST sink `sorento-respond-message-TEST`; prod list `sorento-respond-message` llen 0→0),
`save-session-vars would_write` (guard-d-record; the orphaned prod PUT never ran), `sendmsg-sub would_send` (TEST sendmsg fork `aQUmwMVplmNcyUVc`, `is_test=true`, terminal
`guard-record-text/qr`), and on escalation turns `human-intervention-sub would_write` (fork `vUfFUDjLAuMaeQE6` nodes = trigger/chat?/test-guard/test-guard-record only).
`send-message-files/images/video`, `update-human-intervened`, prod `save-session-vars` absent from every clone runData. get-results TEST fork `t4QvrtrPnTwRU6br`
ran only `MCP Client1` with read tools (`crm_order_management_orders_list`, `crm_inventory_stock_balance_list`); it takes no `is_test` input (pre-existing).

## B7 roster parity (READ-ONLY `GET …/external/team-members`, cred `crm-n8n-auth mNsZWyU82NYV58k2` = clone's `get-cs-members` cred; never `next-assignee`)
| probe (agent_code=order_enquiries&team_code=customer_service&tier=1&contact_id=437264483 + …) | HTTP | user_ids returned | offered in | match |
|---|---|---|---|---|
| `&company_id=<Sorento>&brand_code=mocha` | 200 | 0d69dfb7, 12246ae8, 70578600, a41fbc80, b69bb614, c483d959 (Maryam Ariffin, Cyndi, Aisyah, Balqis, Niki, Nurain) | B2 idx 4–9 (Sorento) | exact, same order |
| `&company_id=<Mocha>` | 200 | 3a66bad8, 450e8690, 730049fc (Ms Bay, Nicky, Kah Xin) | B2 idx 1–3 (Mocha) | exact |
| `&company_id=<Sorento>&brand_code=sorento` | 200 | same 6 as row 1 | B1 idx 1–6 | exact |
| (no company/brand) | 200 | same 6 | B9c fallback idx 1–6 | exact |
| `agent_code=general_enquiries&team_code=marketing_promotion&company_id=<Sorento>` (A4 gate) | 200 | b295e6c5 Am, f54ca6e5 Kia Yee, eb6ef9e2 Aqi | – | base key exists → parser flip safe |
| same `+&brand_code=mocha` | 200 | f54ca6e5 Kia Yee | – | brand narrows |
| `…marketing_promotion&company_id=<Mocha>` | 200 | f54ca6e5 Kia Yee | – | – |

## Notes / findings for the reviewer
1. **No code defect.** All plan §3 nodes behave as specified; deviation-1 of the diff doc (Mocha entry brand null / Sorento entry mocha) is what B2 asserts and observes.
2. **B6 UAC wording vs implementation.** UAC B6 expects `routing_company==null` after a *stock question about the same product*. Implementation (plan §3.5) recomputes the axes FRESH whenever `disallowed-entity-gate` resolves ≥1 company — and the stock turn resolves SRTWC287A-RL-7405 → Sorento. So the literal sequence yields company=Sorento on the warehouse escalation (product's own company, same team as turn 2 — not a stale CS carry). The carry-forward guard itself is proven by B6b. Planner should either amend B6 to a non-resolving turn or decide that a same-turn fresh resolve must not populate the axes for non-CS teams.
3. **B3 brand fallback.** A picked Mocha-company member (row brand null) gets `brand_code='mocha'` from `prev.routing_brand` (Sorento row's brand) per §3.6. Payload = company Mocha + brand mocha. Plan-conformant; flag only if the CRM should receive brand null for a company whose rows carry no brand.
4. **B9 UAC example wrong**: `tag-not-supported` never offers members (`escalate-catalog.is_escalate_offer` false). The fallback path is reachable via `escalate_offer` (correction with non-business_query message_type) or `divert-suggest-yes[0]`; asserted with B9c.
5. **P1** proves the parser flip at the LLM level (raw output already `marketing_promotion`); the offer/roster path for promotions was not exercised because the two-company contact is asked for an access level first (`access_levels=[]`) — pre-existing, out of scope.
6. **get-cs-members URL evidence**: n8n runData does not retain the resolved httpRequest URL; asserted by (a) the input item(s) from `cs-roster-plan` + the node URL expression, (b) distinct rosters per item, (c) B7 probes with the reconstructed URLs returning identical rosters.
7. **S5 nuance**: get-results TEST fork receives no `is_test` (pre-existing design); covered by S4 (read tools only). `Call 'sub-respond-save-message-redis'2` is NOT orphaned on today's clone (CLAUDE.md drift) — it calls TEST fork `tWm5DYLxfypmVC1T` which pushes to `sorento-respond-message-TEST` only (prod list llen unchanged 0→0 in every run).
8. **R1 sample replay not run**: the replay orchestrator attributes turns by "latest clone execution" and would need its `Init Params` defaults edited (`turn_limit`) — a workflow edit outside the tester remit + wedge risk (Lessons 29/30). Static check: rule present, keys verified null on non-CS turns → inert; non-null on CS-resolve turns → surfaces (intended, Lesson 40).

## Cleanup
- `n8n_test.respond_contacts_test[437264483].session_vars` reset to `{"variables":{},"referenced_result_set":[]}` after the last run (was reset before every independent case; multi-turn pairs B3←B2, B4←B1, B5, B6, B6b kept state within the pair).
- No `chat_histories` / `golden_*` rows written (`console-incoming-gate` false; capture orchestrator not run) — nothing to exclude per Lesson 41.
- Redis: `test:q:437264483` drained by each run; `test:egress:UAC-BCR-*-20260817` lists left in place (harmless test keys; `zz-canary-run` deletes per id on re-run).
- Helper `zz-roster-probe` (`ZS0KErse7GDh9mJK`, inactive/manual, READ-only GET) left for the reviewer; safe to archive.
- Nothing edited on the spine clone, forks, live workflows, or the replay orchestrator.

Evidence files: `tests/runs/brand-company-routing-{B1,B2,B3,B4,B5,B6,B7,B8,B9,P1,R1}-20260817.json`.
