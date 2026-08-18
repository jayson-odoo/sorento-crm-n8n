# miss-company-routing — round-3 UAC roll-up (2026-08-18, tester)

Targets: clone `txiPzSxy3Pclsz6v` @ **`05a83eef-0f4f-4576-875a-fb1a26ca271c`** (draft==active before and after; `miss-roster-gate.leftValue`
sha `031dda83…` and `cs-offer-gate` g2 sha `cfa8c18e…` re-verified == the repo expression files) + parser fork `wI5RkNGW3EOJfBdo` @
`c7d9cfa2-…` (unchanged) + HI fork `vUfFUDjLAuMaeQE6` @ `0fdba9e5-…` + sendmsg fork `aQUmwMVplmNcyUVc` @ `b48e0eaa-…`. Live untouched after the
pass: spine `9qVy…` active `7aba1447-…` (draft `cfd0e776-…` = the pre-existing content-empty draft the coder recorded, not ours), parser
`XTODTw` `89b63c51-…`, sendmsg `aoyd…` `91171ac3-…`. Mechanism = round-2 (`zz-run-hint` webhook seed → clone exec matched by
`test_run_id` → REST `includeData` + sub-executions; item `mode=uac`, deterministic mocks at item top level, follow-up turns state-injected
via `previous_conversation_state`). Contact `437264483`. Prefix `UAC-MCR3-`.

## VERDICT: **FAIL — BLOCKER F-R3-4. Round 3 is NOT promotable; the round-2 orders lane is broken by the round-3 body.**

`miss-roster-gate.leftValue` (round-3 sha `031dda83`) throws inside n8n's expression sandbox:
`ExpressionError: Cannot access "prototype" due to security concerns` (node `miss-roster-gate`, parameter `conditions`, itemIndex 0).
Cause: the R3.2 allowlist leg `Object.prototype.hasOwnProperty.call(LANE, tool)` (`tests/diffs/miss-company-routing/spine-miss-roster-gate.expr.txt`
line 21). n8n's tournament sandbox blocks `prototype` / `constructor` / `__proto__` property access at the expression layer, so the IIFE's outer
`try { … } catch { return false }` does NOT catch it — the If node errors, the clone execution ends in `error` at `miss-roster-gate`, and
NOTHING downstream runs (no reply, no state, no egress). The LANE lookup executes on EVERY `has_result:true` envelope BEFORE the allowlist
decides, so the blast radius is the whole answered path — orders (round-2 lane, regression), incoming (the new lane) and every left-out
domain (stock proven; promotions/master products/attachments/certificates by construction). Promoted as-is it would take down every
answered turn on live. The 38/38 offline units passed because they evaluate the IIFE in plain Node, not in the n8n sandbox.

Fix for the coder: replace the `hasOwnProperty.call` with a sandbox-safe membership test (e.g. `Object.keys(LANE).includes(tool)` — keeps
the prototype-name protection), grep the whole expression (and `cs-offer-gate`'s g2, which is clean) for `prototype|constructor|__proto__`,
re-publish, then round 3 must be re-run IN FULL (N1–N10 + R + S). LESSONS candidate: "n8n expressions cannot touch `prototype`/`constructor`/
`__proto__` — the sandbox throws outside your try/catch; lint expression files for those tokens; a plain-Node unit does not prove an
expression runs in n8n — smoke one execution."

## PASS/FAIL table

| # | case | exec(s) | verdict | notes |
|---|---|---|---|---|
| P1 | roster probe purchasing/incoming_stock_enquiries × {Sorento, Mocha} (`zz-roster-probe`, CRM GET only, helper not edited — `probe-params` pinned via `test_workflow`) | 12921184 | **PASS / not blocked** | Sorento = 1 member (Jereen Tee `1037238`; same with `brand_code=mocha` and with no company), Mocha = 1 member (Lucas `1177555`). Corroborated by N4-picker t1's own `get-cs-members` (2×200, same rosters). |
| N1 | incoming partial miss "incoming for MUB6201" (incoming mock) → miss picker `*Sorento* purchasing team` | 12921362 | **FAIL** | Fixture still partial-miss (real read: `has_result:true`, `lookup_companies` [Mocha, Sorento], one Mocha answer, `*Sorento:* no incoming stock records for MUB6201.`; `tool-filter` `crm_incoming_stock_list`). `miss-roster-gate` THREW (F-R3-4); execution error; no reply/state/egress. |
| N2 | N1 + "2" | – | **NOT RUN** | depends on N1's persisted state (none exists) |
| N3 | N1 + "yes" | – | **NOT RUN** | same |
| N4a | incoming both-miss → clarify → "mocha" (NO picker, F-R3-1 as written) | – | **SUPERSEDED** | coder applied D3=(b): the picker now renders — covered by N4-picker below |
| N4-picker | incoming both-miss "incoming for MWC-SC08B" → phrase + grouped picker (both purchasing rosters) → "yes" → clarify → "sorento" → HI Sorento pair, `company_pick` | t1 12921463 · t2 12921546 · t3 12921567 | **PASS** | t1: `cs-offer-gate` TRUE (widened g2), `cs-roster-plan` 2 rows, `get-cs-members` once per company (Mocha→Lucas, Sorento→Jereen Tee), reply = `…checked in Mocha and Sorento. Would you like me to escalate to purchasing team?` + note + `*Mocha:*\n1. Lucas\n*Sorento:*\n2. Jereen Tee` + company-name close; state `selection_context member_offer`, 2 member rows, `routing_roster_plan` 2, `routing_company` null, `routing_brand mocha`, `routing_companies` 2. t2: `routing_source multi_company_unpicked`, `team purchasing`, HI NOT called, rev-4 clarify copy sent, state re-persisted. t3: `escalation-context` `company_id` Sorento / `brand_code mocha` / `routing_source company_pick` / `team purchasing`; HI fork called with that pair + `agent incoming_stock_enquiries`, no explicit assignee, short-circuited at `test-guard`; egress `would_write human-intervention-sub` matches. **Copy deviation F-R3-5 (cosmetic):** the multi-company note says "listing the *customer-service* team members" on a purchasing picker (`cs_multi_note` literal in `build-cs-member-offer`, same family as coder F-R3-3). |
| N4b | parser-tier "mocha" | – | **NOT RUN** | halted after the blocker (parser fork unchanged; N4-picker t3 covered the spine arm deterministically) |
| N5 | incoming no-miss → no offer | – | **NOT RUN** | any `has_result:true` turn errors (F-R3-4) — cannot be byte-identical |
| N6 | crossdomain block wins | – | **NOT RUN** | same |
| N7 | stock per-company miss stays OUT (inventory mock, "stock for MUB6201") | 12921451 | **FAIL** | `tool-filter` `crm_inventory_stock_balance_list`, envelope carried `*Sorento:* no stock records for MUB6201.`; gate THREW instead of returning false — turn is a hard error, NOT byte-identical to pre-round-3 (blast radius proof for left-out domains). |
| N8 | promotions stays OUT | – | **NOT RUN** | same defect by construction (LANE lookup precedes the allowlist decision) |
| N9 | routing mismatch fail-closed | – | **NOT RUN** | same |
| N10 | degraded roster | – | **NOT RUN** | P1 not blocked; would need a pinned 404 — moot until F-R3-4 is fixed |
| R-M1 | regression: orders partial miss "any order for MUB6201" (order mock) — expected the M1r3 picker (`*Sorento* customer_service team`) | 12921439 | **FAIL (REGRESSION)** | `tool-filter` `crm_order_management_orders_list`, envelope partial-miss as in round 2; gate THREW; no reply. The round-2 lane that passed on `0557b0b4` (M1r3 exec 12911114) is broken on `05a83eef`. |
| R-M5 / R-M8 / R-B | stock qty0 no-offer · offer-hold · single-company brand routing | – | **NOT RUN** | M5 would hit the same error (answered stock turn); M8/B not attempted after the halt (they run on injected state; the parser fork/HI path is unchanged — nothing round-3 touches them; re-run with the full set after the fix) |
| S | §0 zero-egress on every execution | 7 clone execs + 1 probe | **PASS** | see tally |

## §0 gate tally

- Clone executions this pass: **7** (`12921362` N1 · `12921439` R-M1 · `12921451` N7 · `12921463` N4-picker t1 · `12921546` t2 · `12921567` t3) + probe `12921184` (helper, CRM GET).
- Egress records: **only `would_log` / `would_write` / `would_send`** (N4-picker t1: log+write+send; t2: log+write+send; t3: log+write+`would_write human-intervention-sub`); the three erroring execs produced **zero** records (died before any sink).
- S1: sendmsg fork `HTTP Request` never executed (fork last node `Chat Memory Manager`); save-msg fork pushes only to `sorento-respond-message-TEST`. S2: HI fork invoked once (t3) and short-circuited at `test-guard` (`chat?`, `test-guard`, `test-guard-record` only); no assign/SLA/PIC. S3: none of the 5 orphaned egress nodes (`send-message-files/images/video`, `update-human-intervened`, `save-session-vars`) executed on any exec; `n8n_test` untouched (uac mode). S4: `tool-filter` = `crm_incoming_stock_list` / `crm_order_management_orders_list` / `crm_inventory_stock_balance_list` (all READ; get-results fork `t4QvrtrPnTwRU6br` ran `MCP Client1` → `output-structurer` only). S5: `is_test=true` on every parser / sendmsg / HI sub-execution (get-results/get-rag/save-msg forks carry none by pre-existing design). S6: every turn deterministic (parser fork bypass `mock-reformulator-output`), 0 LLM tokens; the get-results LLM agent path is not the mock — read-tool only.
- Live/forks re-checked after the pass: unchanged (table above). No workflow edited by this pass; nothing promoted.

## Deviations / findings for the captain

1. **F-R3-4 BLOCKER** (above) — round 3 as published cannot run; regression on the round-2 orders lane; would be a live outage if promoted.
2. **F-R3-5 (cosmetic, new):** `build-cs-member-offer` `cs_multi_note` literal says "customer-service team members" on the widened (purchasing) picker.
3. F-R3-1 is now moot on the clone (D3=b applied): the incoming not-found path renders the picker (N4-picker PASS).
4. Fixture note: MUB6201 incoming is still a Sorento partial miss on 2026-08-18 (real read); no substitution needed.
5. Harness note: `test_workflow` on `zz-roster-probe` with only `probe-params` pinned runs the credentialed GET for real (the tool description over-states pinning) — usable as a zero-edit read-only probe.

Evidence files: `miss-company-routing-P1-20260818.json`, `-N1-`, `-N7-`, `-R-M1-`, `-N4picker-20260818.json` (each: exec ids, sub-exec ids, nodes executed, key node outputs, egress list, S0 block).
