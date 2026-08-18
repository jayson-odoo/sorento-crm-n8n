# miss-company-routing — round-3 UAC roll-up (2026-08-18, tester)

> **Two sections:** rev-1 (clone `05a83eef`, FAIL/BLOCKER F-R3-4) is kept below for the record; the **rev-2 section at the end is the current verdict (PASS)**.

## rev-1 (clone 05a83eef) — superseded

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


---

# rev-2 (clone `e54e114e`) — FULL round-3 re-run (2026-08-18, tester)

Targets: clone `txiPzSxy3Pclsz6v` @ **`e54e114e-86e6-4023-8926-3fec6fc1ef51`** (public-API `versionId` identical before and after the pass; the 9 lane
bodies sha-verified == `tests/diffs/miss-company-routing/*`: `miss-roster-gate.leftValue` **`d24dd81b`** (sandbox-safe `Object.keys(LANE).includes`),
`cs-offer-gate` g2 **`cfa8c18e`**, `build-cs-member-offer` **`63c1c46e`**, `build-miss-member-offer` `68eef4c7`, `escalation-context` `cca7a245`,
`compile-current-state` `5a84dfea`, `escalate-catalog` `0168df84`, `clarify-company-reply` `7ff06aa8`, `miss-roster-plan` `0b7907d6`) + parser fork
`wI5RkNGW3EOJfBdo` @ `c7d9cfa2` (unchanged) + HI fork `vUfFUDjLAuMaeQE6` @ `0fdba9e5` + sendmsg fork `aQUmwMVplmNcyUVc` @ `b48e0eaa`
(`Postgres Chat Memory1` cred `Dnnofg8Xb27VQOhI` n8n_test-db — S3). Live untouched before/after: spine `9qVy…` `cfd0e776-…` (the pre-existing
content-empty draft the coder recorded — node params + connections identical to the 03:58Z snapshot at `7aba1447`; nothing this pass), parser `XTODTw`
`89b63c51-…`, sendmsg `aoyd…` `91171ac3-…`, HI `rrYX…` `9249e00e-…`. Mechanism = rev-1 (`zz-run-hint` webhook seed → clone exec matched by
`test_run_id` → REST `includeData` + sub-executions; item `mode=uac`, deterministic mocks at item top level, follow-up turns state-injected via
`previous_conversation_state`; N4b omits the mock = real fork). Contact `437264483`. Prefix `UAC-MCR3-r2-`. Offline units: `tests/unit/miss-company-routing-round3.gates.test.js`
**52/52** on the repo expression files (== deployed shas).

## VERDICT: **PASS — F-R3-4 fixed (the gate evaluates in the real sandbox on every answered turn), F-R3-5 fixed (purchasing note), round-2 lanes byte-identical, zero egress on 25 executions.**

## PASS/FAIL table (rev-2)

| # | case | exec(s) | verdict | notes |
|---|---|---|---|---|
| P1 | roster purchasing/incoming_stock_enquiries × {Sorento, Mocha} | reused (rev-1 probe 12921184) + re-confirmed by N1 `get-cs-members-miss` and N4p-t1 `get-cs-members` | **PASS** | Sorento = Jereen Tee `1037238`, Mocha = Lucas `1177555` — unchanged |
| N1 | incoming partial miss "incoming for MUB6201" → miss picker `*Sorento* purchasing` | 12922904 | **PASS** | `tool-filter crm_incoming_stock_list`; **gate TRUE `[[1,0]]` (no ExpressionError)**; plan 1 Sorento row (brand mocha); `get-cs-members-miss` once → Jereen Tee; reply = Mocha block + `*Sorento:* no incoming stock records for MUB6201.` + `Would you like me to escalate to *Sorento* purchasing team?` + `Please choose who to route to (reply with the number):` + `2. Jereen Tee` + yes-sentence; attachment its own `would_send`; persisted `response` ends with the phrase, `last_result_set` idx1 + idx2 {Sorento, mocha}, `selection_context member_offer`, plan 1 row, `routing_company` Sorento, `routing_brand mocha` |
| N2 | N1 + "2" (idx-2 uuid, purchasing confirm mock) | 12923026 | **PASS** | `escalation-context` Sorento / mocha / `picked_member` / `purchasing`; clarify gate FALSE; HI fork got team purchasing / agent incoming_stock_enquiries / `explicit_assignee_id 3760012d-…` / brand+company pair, short-circuited at `test-guard`; `get-round-robin-assignee` not executed |
| N3 | N1 + bare "yes" | 12923036 | **PASS** | `prior_state` / Sorento / mocha / purchasing; HI pair matches; no explicit assignee |
| N4-picker | both-miss MWC-SC08B → grouped purchasing picker → "yes" → clarify → "sorento" | t1 12923063 · t2 12923096 · t3 12923121 | **PASS** | as rev-1 (cs-offer-gate TRUE, 2-row plan, Lucas / Jereen Tee, note + headers + company-name close; t2 `multi_company_unpicked` + rev-4 clarify copy + HI NOT called; t3 `company_pick` Sorento/mocha → HI). **F-R3-5 fixed:** note now reads `so I am listing the purchasing team members from each of them` |
| N4b | parser tier raw "mocha" on the t2 state (real fork) | 12923142 | **PASS** | fork `escalation {is_escalation_confirmation:true, company_pick:"Mocha"}`, routing purchasing re-applied, no `preferred_assignee_id`; spine `company_pick` → Mocha (brand null) → HI short-circuit; live parser unchanged |
| N5 | incoming no-miss → no offer: (a) Sorento-only SRTWT6801 (no `lookup_companies`) · (b) two-company MWCX7605-RL-S10-NEW with incoming in BOTH · (probe) no-entity incoming | a 12923438 · b 12923457 · probe 12923358 | **PASS** | gate FALSE `[[0,1]]` on a and b, no lane node, reply = blocks only, no phrase/picker, `selection_context null`, `routing_roster_plan null`. Byte-identity to the round-2 body asserted structurally (the FALSE branch is a pass-through and no other node on the answered no-miss path changed). Probe: no-entity not-found → widened cs-offer-gate → single picker (Jereen Tee, plan company null) — pre-existing not-found shape, recorded |
| N6 | cross-domain block wins | 12923507 (+ fixture attempts 12923559, 12923598) | **PASS** (real xd-probe path + offline unit ii) | Real 2-product turn: `crossdomain-probe` ran (stock read for MWC-SC08B → 0 rows) → `_xdBlock.any:false` → gate TRUE → exactly ONE `Would you like me to escalate` + picker. No live fixture with `_xdBlock.any:true` AND a per-company incoming miss (SRTWB890 / SRTWC286-SH-UF both have incoming → gate FALSE). Unit (ii)/(ii-b) on the deployed leftValue PASS |
| N7 | stock per-company miss stays OUT | 12923185 | **PASS** | `crm_inventory_stock_balance_list`, envelope has the `*Sorento:* no stock records` line, gate FALSE (no throw), no lane node, no phrase/picker |
| N8 | promotions per-company miss stays OUT | 12923304 (access prompt) · 12923327 (answered) · [12923199 = tester mock without `access_levels` → pre-existing `If4` error, zero egress, discarded] | **PASS** | t2 `crm_marketing_promotions_list`, answered envelope with the Sorento miss line, gate FALSE, no lane node, no phrase/picker. Unit (iv) PASS |
| N9 | routing mismatch fail-closed: (a) incoming tool + CS/order routing · (b) orders tool + purchasing routing | a 12923207 · b 12923225 | **PASS** | both gate FALSE, no lane node, reply = envelope text without offer. Unit (v)–(v-d) PASS |
| N10 | degraded roster on incoming | offline on the deployed `build-miss-member-offer` body (68eef4c7) with N1's real envelope+plan | **PASS** | 404 error item / `[]` / no item / no-`respond_user_id` ⇒ JSON-identical envelope passthrough (no phrase/picker, plan stays the axes value); real roster control ⇒ offer. `get-cs-members-miss.onError == continueRegularOutput` on the clone. P1 non-empty so not inducible live (UAC allows the offline proof) |
| R-M1 | orders partial miss "any order for MUB6201" | 12923242 | **PASS** | gate TRUE, `crm_order_management_orders_list`, `*Sorento* customer_service` phrase, picker 3..8; sent text **byte-identical** to round-2 M1r3 (12911114) modulo the data-stamp |
| R-M5 | qty-0 stock not a miss | 12923256 | **PASS** | gate FALSE, no offer |
| R-M8 | offer-hold: both-miss order offer → junk "asdkjh" (offer_hold mock) | t1 12923720 · t2 12923780 | **PASS** | t1 orders multi picker (note still `customer-service team members`) **byte-identical** to round-2 M7d t1; t2 `offer-hold-gate` TRUE → `offer-hold-reply` → `tag-offer-hold` → `escalate-catalog {offer_hold, is_escalate_offer:false}`, HI/roster/LLM not executed, rev-4 clarify copy, state survives (9 rows, 2-row plan, phrase kept) |
| R-B | single-company brand: not-found SRTWC287A-RL-7405 → single CS offer → "yes" | t1 12923736 · t2 12923790 | **PASS** | t1 `*Sorento* customer_service` phrase, plain 1..6, yes-sentence, 1-row plan {Sorento, brand sorento} **byte-identical** to round-2 M7e t1; t2 `prior_state` Sorento/`sorento` → HI pair, no explicit assignee |
| S3 | sendmsg fork prod-DB write closed | all text-reply execs | **PASS** | `Postgres Chat Memory1` cred `Dnnofg8Xb27VQOhI` (n8n_test-db); `Chat Memory Manager` success on every text-reply sub-execution; fork `HTTP Request` never executed |
| S | §0 zero-egress on every execution | 25 clone execs | **PASS** | tally below |

## F-R3-5 (purchasing vs customer-service note) — asserted

- Purchasing picker (N4p-t1, exec 12923063): `Note: MWC-SC08B is carried by more than one company (*Mocha* and *Sorento*), so I am listing the **purchasing** team members from each of them — …` ✔
- Orders multi picker (R-M8 t1, 12923720): `… listing the **customer-service** team members …` — byte-identical to round-2 M7d t1 ✔
- Single-company CS picker (R-B t1, 12923736) and orders partial-miss picker (R-M1, 12923242): byte-identical to round-2 M7e t1 / M1r3 t1 ✔ (unit `F-R3-5:*` 9/9 also green)

## §0 gate tally (rev-2)

- Clone executions this pass: **25** — `12922904` N1 · `12923026` N2 · `12923036` N3 · `12923063/12923096/12923121` N4p t1–t3 · `12923142` N4b · `12923438` N5a · `12923457` N5b · `12923358` N5-probe · `12923507/12923559/12923598` N6 · `12923185` N7 · `12923199` N8 (mock error, no egress) · `12923304/12923327` N8 · `12923207` N9a · `12923225` N9b · `12923242` R-M1 · `12923256` R-M5 · `12923720/12923780` R-M8 · `12923736/12923790` R-B. No probe helper run (P1 reused).
- Egress records: **only `would_log` / `would_write` / `would_send`** on every exec (HI turns: `would_write human-intervention-sub`); the errored N8 mock exec produced zero records.
- S1: sendmsg fork `HTTP Request` never executed on any of the 25 (fork nodes ≤ `Chat Memory Manager`); save-msg fork pushes only to `sorento-respond-message-TEST`. S2: HI fork invoked on N2/N3/N4p-t3/N4b/R-B-t2 only and short-circuited at `test-guard` every time (`When Executed…`, `chat?`, `test-guard`, `test-guard-record`); `get-round-robin-assignee` never executed; no assign/SLA/PIC. S3: none of the 5 orphaned nodes (`send-message-files/images/video`, `update-human-intervened`, `save-session-vars`) executed on any exec; `n8n_test` untouched (uac mode). S4: `tool-filter` ∈ {`crm_incoming_stock_list`, `crm_order_management_orders_list`, `crm_inventory_stock_balance_list`, `crm_marketing_promotions_list`} (all READ; get-results fork ran `MCP Client1` → `output-structurer` only — no LLM agent on any turn). S5: `is_test=true` on every parser / sendmsg / HI sub-execution (get-results / get-rag / save-msg forks carry none by pre-existing design). S6: 24 deterministic turns (fork bypass, 0 LLM tokens) + 1 parser-tier turn (N4b, one `AI Agent` call on the fork); no new token sink observed.
- Clone + forks + live re-fetched after the pass: versionIds and node hashes identical to the pre-pass fetch. Nothing edited, nothing promoted.

## Deviations / observations (rev-2)

1. **None blocking.** F-R3-4 and F-R3-5 are closed on `e54e114e`; the round-2 lanes (R-M1 / R-M8 / R-B) are byte-identical.
2. N8 first attempt (12923199) errored at the pre-existing `If4` because my promotion mock omitted `access_levels` (the real parser always emits it; the round-2 M6b mock carried it) — tester mock omission, re-run green; noted so nobody reads it as a clone regression.
3. Observation (pre-existing presenter, out of scope): the promotions per-company miss line renders promotion UUIDs with the code (`*Sorento:* no promotions records for 67f07a6c-…, 62a48f82-…, MUB6201.`).
4. Observation (pre-existing axes logic, out of scope): on N5b (incoming answered in BOTH companies) `routing_companies` persisted a single Mocha row (`routing_company` Mocha) although `lookup_companies` and the answers cover both — the escalation axes are computed by `disallowed-entity-gate` from resolve-entity, not from the envelope; harmless for the miss lane (gate FALSE) but worth a look for a later routing round.
5. Observation (D3=b consequence): a no-entity incoming not-found turn now renders a single member picker with plan `company_id null` (probe 12923358) — same shape CS/order already had.
6. Fixture notes: MUB6201 incoming still a Sorento partial miss; MWC-SC08B has neither incoming nor stock (so it cannot drive an xd block); SRTWT6801 = Sorento-only incoming; MWCX7605-RL-S10-NEW = two-company incoming in both.

Evidence files (rev-2): `miss-company-routing-{N1r2,N2r2,N3r2,N4pickerr2,N4br2,N5r2,N6r2,N7r2,N8r2,N9r2,N10r2,R-M1r2,R-M5r2,R-M8r2,R-Br2}-20260818.json`
(each: exec ids, sub-exec ids + `is_test`, nodes executed, gate branch counts, lane nodes, tool, plans, roster calls, escalation-context, sent texts, would_write payloads, full egress list, S0 block).

---

# rev-3 (clone `7db593b0`) — Q-series "plain offer for incoming + stock, members orders-only" (2026-08-18, tester)

Targets: clone `txiPzSxy3Pclsz6v` @ **`7db593b0-ef2e-453b-bc98-30ff9267bf41`** (draft==active before AND after the pass; 160 nodes; the
seven changed bodies re-fetched and byte-compared `==` `tests/diffs/miss-company-routing/*`: `miss-roster-gate.leftValue` **`92ca1ccc`**,
`miss-roster-plan` **`c4a19b6f`**, NEW `miss-members-gate` **`14576e69`**, `build-miss-member-offer` **`fab11982`**,
`compile-current-state` **`6bff997d`**, `clarify-company-reply`==`offer-hold-reply` **`377c2df4`**, `cs-offer-gate` conditions
**`ce99a16c`** / g2 `fafa8b77`) + parser fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2` (output_exchange `a68c5992` / systemMessage `138008c2` —
unchanged) + sendmsg fork `aQUmwMVplmNcyUVc` @ `b48e0eaa` + HI fork `vUfFUDjLAuMaeQE6` @ `0fdba9e5`. Live untouched before/after:
spine `9qVy…` active `7aba1447` (draft `cfd0e776` pre-existing), parser `XTODTw` `89b63c51`, sendmsg `aoyd…` `91171ac3`.
Mechanism = rev-2 (`zz-run-hint` webhook seed → clone exec matched by `test_run_id` → REST `includeData` + sub-executions; item
`mode=uac`, deterministic mocks at item top level (+ `access_levels:["dealer"]` on business-query mocks), follow-up turns state-injected
via `previous_conversation_state`; Q6/Q9 parser-tier turns omit the mock = real fork). Contact `437264483`. Prefix `UAC-MCR3r3-`.
**Egress read: DIRECT from `test:egress:{test_run_id}` via the `zz-run-hint` webhook response (the canary's own `read-egress` node) —
`zz-canary-read LLIbMXAixexM9Cwc` was NOT republished (coder note 5): it has no published version AND its `Read Egress` key is
hardcoded to a stale run id (`test:egress:9426737`), so republishing it unchanged would not have produced usable evidence anyway.**
Offline units: `miss-company-routing-round3.gates.test.js` **85/85**, `rev4.spine` **33/33**, `rev4.output_exchange` **48/48** on the
repo bodies (byte-== deployed).

## VERDICT: **PASS — plain offer live on incoming + stock, roster read provably orders-only, qty-0 = answered, both-miss plain clarify copy exact, open-offer company_pick arm proven on the real parser, orders/not-found lanes byte-identical, zero egress on 23 executions.**

## PASS/FAIL table (rev-3 Q-series)

| # | case | exec(s) | verdict | notes |
|---|---|---|---|---|
| P2 | warehouse roster probe (read-only `zz-roster-probe` via `test_workflow`, only `probe-params` pinned) | 12931119 | **PASS / not blocked** | Sorento warehouse/general_enquiries = Ili Mahfuzah `1096809` (same with `brand_code=mocha`); Mocha = Tasa `1177437`; control purchasing/Sorento = Jereen Tee `1037238`. Plain offers make no roster call — this documents what a LIVE "yes" would hit at `next-assignee`. |
| Q1 | incoming single-miss MUB6201 → PLAIN offer | 12931343 | **PASS** | `crm_incoming_stock_list`; gate TRUE `[1,0]`; plan 1 item `{Sorento, mocha, team purchasing, members:false}`; **`miss-members-gate` FALSE `[0,1]`, `get-cs-members-miss` NOT executed — zero `team-members` GET on the exec**; bmmo `miss_plain_offer:true`, no member keys; reply = Mocha block + miss line + `Would you like me to escalate to *Sorento* purchasing team?` and NOTHING after (no picker/member line/yes-sentence); attachment its own `would_send`; persisted: phrase-tail response, `last_result_set` 1 envelope row only, `selection_context null`, 1-row plan (team stripped), Sorento/mocha pair |
| Q2 | Q1 + bare "yes" | 12931497 | **PASS** | `prior_state` / Sorento / mocha / purchasing; clarify gate FALSE; HI fork short-circuit, payload agent `incoming_stock_enquiries` team `purchasing`, no explicit assignee; `get-round-robin-assignee` not executed |
| Q3 | stock single-miss MUB6201 (captain shape, qty-0 row) → offer + "yes" | t1 12931546 · t2 12931581 | **PASS** | t1: `crm_inventory_stock_balance_list`; **qty-0 Mocha row = ANSWERED — plan exactly 1 item, Sorento**; `miss-members-gate` FALSE, no roster call; `…escalate to *Sorento* warehouse team?`, no picker; `selection_context null`. t2: `prior_state` Sorento/mocha/`warehouse`; HI payload team warehouse / agent general_enquiries — never CS/purchasing |
| Q4 | stock all-answered ⇒ NO offer + R-M5 re-check | Q4b 12931789 · bonus 12931825 · control 12931633 | **PASS** (leg (a) = offline unit) | (b) SRTWT6801 single-company: gate FALSE `[0,1]`, no lane node, no phrase. Bonus SRTWB890 single-company WITH qty-0 rows: gate FALSE, no offer. (a) **no live two-company both-stocked fixture exists** (MWCX7605-RL-S10-NEW no stock → recorded as not-found control 12931633; MWC-SC08B none; MUB6201 Mocha-only; read-only rys stock sweep page 1 = zero cross-company codes) — offline unit (stock all-answered / qty-0-everywhere ⇒ FALSE) is the (a) proof. **R-M5 re-check per captain:** the old R-M5 fixture IS the MUB6201 Sorento-absent shape — its rev-3 expected value is the Q3-t1 OFFER (verified), not silence; qty-0 ROW = answered, only an ABSENT company = miss |
| Q5 | both-miss plain → "yes" → PLAIN clarify → company → HI | t1 12932631 (fixture probe) · t2 12932702 · t3 12932742 | **PASS** (t1 = offline unit per UAC note) | t1: no both-miss-answered live fixture EXISTS — the MUB6201+MWC-SC08B multi-product stock turn folds to a Sorento-only single miss (plan codes `[MUB6201, MWC-SC08B]`, itself a consistent variant); unit (ccs plain multi + bmmo plain multi) = t1 proof; t2/t3 state-injected. t2: `multi_company_unpicked`, clarify gate TRUE, HI NOT called, **reply == `Both *Mocha* and *Sorento* teams are listed — reply with the company (Mocha / Sorento) and I'll assign automatically.` — NO `a number, a name`**; re-persisted (phrase kept, 2-row plan, `selection_context` STILL null). t3: `company_pick` → Mocha pair → HI, no explicit assignee |
| Q6 | parser tier — open-offer `company_pick` arm (first execution proof) | "sorento" 12932775 (fork 12932781) · "yes mocha" 12932843 (fork 12932846) | **PASS** | fork emitted `{is_escalation_confirmation:true, company_pick:"Sorento"/"Mocha"}` via the no-context arm (casual, `domain_hint null`, no current entity, no `preferred_assignee_id`); spine `company_pick` → right pair → HI short-circuit. No Lesson-39 abandon occurred (both first-run). Live parser unchanged after |
| Q7 | orders regression — picker + offer-hold unchanged | 12932893 · 12932950 · 12932982 · 12933018 | **PASS** | M1 shape: `miss-members-gate` TRUE `[1,0]` → `get-cs-members-miss` ONCE (200, 6 members); sent text **byte-identical to R-M1 12923242** modulo data-stamp; `selection_context member_offer`, 8-row lrs. "yes" spot: `prior_state` Sorento/mocha CS pair == round 2. Offer-hold: t1 **byte-identical to rev-2 R-M8 t1**; t2 `offer-hold-gate` TRUE → member-branch copy UNCHANGED (`…a number, a name, or the company…`), state survives, HI/LLM not run |
| Q8 | not-found regression (cs-offer-gate reverted) | a 12933063 · b 12933106 · c-t2 12933137 · c-t3 12933164 | **PASS** | (a) incoming not-found: gate FALSE, plain `…escalate to purchasing team?`, NO picker, roster/picker nodes not executed (pre-round-3 shape restored). (b) CS/order not-found: picker renders, **byte-identical to rev-2 R-B t1 12923736**. (c) "yes" → `multi_company_unpicked` → **rev-3 PLAIN clarify copy** → "sorento" → HI Sorento/mocha purchasing pair |
| Q9 | junk on a PLAIN offer (behaviour doc) | t2 12933197 · t3-mock 12933236 · t3-parser 12933310 | **PASS** | t2 (parser, "asdkjh"): no crash, `offer-hold-gate` FALSE, no HI, clarification LLM permitted; persisted response loses the frozen phrase (offer closed). t3-parser ("yes" after close, real fork): fork `is_escalation_confirmation:false` (`offeredEscalation` regex false) → If2 FALSE → **HI not reached**. t3-mock (confirm MOCK) DID reach HI — **tester-mock artifact, not a clone defect**: the mock force-feeds the parser flag, bypassing the parser-side regex the UAC keys on; spine arms byte-identical pre/post rev-3 (identical pre-existing plain-offer semantics, NOT a rev-3 regression) |
| S3 | sendmsg fork prod-DB write closed | all text-reply execs | **PASS** | `Postgres Chat Memory1` cred `Dnnofg8Xb27VQOhI` (n8n_test-db) on `b48e0eaa`; `Chat Memory Manager` success on text-reply sub-execs (e.g. 12931358, 12932711); fork `HTTP Request` never executed |
| S | §0 zero-egress on EVERY case | 23 clone execs + probe | **PASS** | tally below |

## §0 gate tally (rev-3)

- Clone executions this pass: **23** — `12931343` Q1 · `12931497` Q2 · `12931546/12931581` Q3 · `12931633` Q4a-control · `12931789` Q4b · `12931825` Q4-bonus · `12932631/12932702/12932742` Q5 · `12932775/12932843` Q6 · `12932893/12932950/12932982/12933018` Q7 · `12933063/12933106/12933137/12933164` Q8 · `12933197/12933236/12933310` Q9. Probes: `12931119` (zz-roster-probe P2), 5 read-only `rysSPgUssLDf6xJc` stock-sweep runs (CRM READ only).
- Egress records: **only `would_log` / `would_send` / `would_write`** on all 23 (HI turns: `would_write human-intervention-sub`); read directly from `test:egress:{id}` via the webhook response.
- **Q1–Q5 hard assert: zero `team-members` GETs** — `get-cs-members-miss`/`get-cs-members` absent from every Q1–Q5 exec's runData; the roster read fired ONLY on Q7-t1 (orders, via `miss-members-gate` TRUE) and Q7oh-t1/Q8b (CS not-found picker, pre-existing lane).
- S1: sendmsg fork `HTTP Request` never executed; save-msg fork pushes only to `sorento-respond-message-TEST` (node param verified + sink LLEN +1 per exec); prod ingest `sorento-respond-message` LLEN 0→0 on 22/23 canary snapshots — the single Q5-t2 `0→1` transient is a REAL inbound customer message caught between snapshots (consumed by live before the next exec; clone/fork redis writes enumerated: only `test:egress:*`, `chat:reply:*`, `sorento-respond-message-TEST` — nothing can touch the prod list).
- S2: HI fork invoked only on Q2/Q3-t2/Q5-t3/Q6×2/Q7-t2/Q8c-t3/Q9-t3-mock and short-circuited at `test-guard` every time (`chat?`, `test-guard`, `test-guard-record` only); `get-round-robin-assignee` never executed; no assign/SLA/PIC.
- S3: none of the 5 orphaned egress nodes executed on any exec; `n8n_test` untouched (uac mode, state-injection).
- S4: `tool-filter` ∈ {`crm_incoming_stock_list`, `crm_inventory_stock_balance_list`, `crm_order_management_orders_list`} (all READ); get-results fork `t4QvrtrPnTwRU6br` ran `MCP Client1` → `output-structurer` only — **the get-results LLM agent stayed orphaned on every turn** (no `AI Agent` in any get-results sub).
- S5: `is_test=true` verified on every parser / sendmsg / HI sub-execution fetched (11 execs spot-swept covering every sub type; the clone's call nodes hardcode it and the body is sha-pinned); get-rag / get-results / save-msg forks carry none by pre-existing design.
- S6: 19 deterministic turns 0 LLM token; 4 parser-tier turns = fork `AI Agent` (gpt-4.1-mini per fork config) ×4 + `Basic LLM Chain` clarification on Q9-t2/t3p (permitted by the case). **No new token sink** (no reformulator-adjacent node beyond the known fork agent).
- Clone + forks + live re-fetched after the pass: versionIds identical to the pre-pass fetch (clone `7db593b0`, parser fork `c7d9cfa2`, sendmsg `b48e0eaa`, HI `0fdba9e5`, live `7aba1447`/`89b63c51`/`91171ac3`). Nothing edited, nothing published, nothing promoted.

## Deviations / observations (rev-3)

1. **None blocking.** All Q-series functional expectations hold on `7db593b0`; the two byte-identity anchors (R-M1 picker, R-M8 offer-hold pair, R-B not-found picker) all match.
2. **Q4a / Q5-t1 fixtures do not exist in live data** (anticipated by the UAC): no two-company product stocked in both companies; both-miss-answered impossible for a single product and the multi-product attempt folds to single-miss. Offline units (85/85 on byte-verified deployed bodies) carry those two legs; every other leg is real-execution proof.
3. **Q9 t3 mock-vs-parser split**: with a forced confirm MOCK a "yes" after the offer closed still routes to HI (`prior_state`) because the `offeredEscalation` regex lives in the parser fork (`output_exchange`), not the spine — pre-existing semantics, byte-identical arms, NOT a rev-3 regression; the real-parser run proves the UAC expectation (no HI). Worth remembering when writing future confirm-mock cases on closed offers.
4. **`zz-canary-read` left unpublished**: its `Read Egress` key is hardcoded (`test:egress:9426737`), so a republish would still read a stale key; the `zz-run-hint` webhook response is the reliable direct egress read. Candidate cleanup for a later round: parameterize the helper.
5. Fixture notes (2026-08-18): MUB6201 incoming still Sorento partial miss (ETA 2026-08-25 volatile); MUB6201 stock = the captain's console shape (Mocha HOLD qty-0 + MOCHA-WH qty-3, Sorento absent); MWCX7605-RL-S10-NEW has incoming in BOTH companies but no stock; SRTWT6801 / SRTWB890 single-company stocked (SRTWB890 with qty-0 rows).
6. P2: both warehouse/general_enquiries rosters are 1-member (Sorento: Ili Mahfuzah; Mocha: Tasa) — a LIVE plain-offer "yes" on the stock lane has a valid `next-assignee` pool in both companies.

Evidence files (rev-3): `miss-company-routing-{Q1..Q9,QP2}-20260818.json` (each: exec ids, sub-exec ids + `is_test`, nodes executed,
gate branch counts, lane nodes, tool, plans, roster calls, escalation-context, sent texts, would_write payloads, full egress list).
