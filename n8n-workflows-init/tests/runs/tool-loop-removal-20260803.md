# RUN LOG — `tool-loop-removal` UAC §TL + regression, clone `txiPzSxy3Pclsz6v`

Tester run, 2026-08-03. **No workflow was edited. Nothing was promoted.**

| | |
|---|---|
| target | clone `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) |
| clone `versionId` == `activeVersionId` at START | `cb4dffdb-c217-42a7-856f-0d45dca258ac`, `updatedAt 2026-08-03T12:34:09.087Z`, 138 nodes / 176 edges |
| clone re-checked at END of the run | **identical** (`cb4dffdb…`, same `updatedAt`) ⇒ nothing was published mid-suite |
| live spine, read-only both ends | `9qVyfUxmRQqrpGRMDLRuz` `versionId == activeVersionId == a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z`, 101 nodes, `Loop Over Items` + `Split Out1` **still present** ⇒ untouched |
| P-CLONE discipline | publish was 12:34:09Z; the throwaway turn was **14:41:57Z** (exec `11078752`, discarded) — every scored run is >2 h after the write. The throwaway independently confirms the running graph is post-change: `Loop Over Items`/`Split Out1` ABSENT from its runData, `tool-filter` emitted a flat 1-item |
| drivers | single-turn: `tests/harness/drive-clone.py` (mode `uac`, contact `437264483`) · multi-turn: `zz-chat` `oyYfVvZHRZpWubTy` (mode `chat-stateful`, session R/W `respond_contacts_test`) |
| tier actually run | **`parser`** on every case (real reformulator `wI5RkNGW3EOJfBdo` each turn). `mock_reformulator_output` was **not** used — P-BASE was captured with the same real-parser driver, and §TL-M-BYTE/§TL-AGG are only comparable against it if the driver matches. Declared per plan §10(TL-e); it inflates the token count vs the `deterministic` label, it does not weaken any assertion |
| scoring rule honoured | no case is scored on `status`. Every verdict is per-node `runData` presence + payload. All 48 executions returned `status: success`, including ones where the answer was wrong (`TL3`, `TL7`) — exactly why status is not evidence |
| concurrency | no golden capture/replay was running |

**Executions: 48** (39 single-turn + 9 chat) — 15 through `If6 out1` (the new edge A2), 21 through `If6 out0`, 12 never reaching the subgraph + 1 discarded throwaway. Every case below carries its `executionId`.

---

## §0 VERDICT — zero-egress gate

**PASS on all 48 executions.** Asserted per execution, not once for the suite.

| check | instrument | result |
|---|---|---|
| **S1** no real WhatsApp/comment send | `send-message-files` / `-images` / `-video` **absent from `runData` in all 48**; all three have **0 inbound edges** in the deployed JSON; the 8 sendmsg callers all → `ublq9nSlrpz63xan` with `is_test: true` (static, re-derived from deployed JSON below) | PASS |
| **S2** no assignment / escalation write | `Call 'sub-human-intervention'` ran on exactly **one** execution (`11081990`, the X6 `yes` leg) → sub-exec **`11081997`** on the guarded fork `vUfFUDjLAuMaeQE6`, whose **entire runData is 3 nodes**: `When Executed by Another Workflow`, `chat?`, `chat-escalation-push`. **No assign, no SLA POST, no PIC comment, no assignee-queue push.** `update-human-intervened` / `set-human-intervened` absent everywhere | PASS |
| **S3** no CRM/contact write | `save-session-vars` **absent from `runData` in all 48**, 0 inbound; every turn instead emitted a `would_write` guard record with the frozen PUT body. `update-human-intervened` absent, 0 inbound. Session writes went to `pg-upsert-session` → `n8n_test-db` (`Dnnofg8Xb27VQOhI`) on the 9 chat turns only | PASS |
| **S4** get-results never ran a write tool | resolved `tool` recorded per case (table below). Union over all 36 subgraph executions = **8 names**, all reads, `crm_it_support_ticket_create` **never** appeared. See the S4 mechanism finding (F-B) — this is an assertion, not a guarantee | PASS |
| **S5** `test_mode` provably present | every execution's `redis-pop-main-message-list` output carries `message.mode` (`uac` / `chat-stateful`) and the unique `message.test_run_id` used to attribute the exec; every invoked sub received `is_test: true` (11-node census, unchanged); the guards *firing* (`would_send`/`would_write`/`would_log` records exist) is positive proof the subs saw it, not an inference | PASS |
| **S6** token sinks bounded | parent-workflow LLM nodes: **0 runs on 47 of 48**; `TLCLRb` (`11080756`) ran `Basic LLM Chain` + `OpenAI Chat Model` (1 each) — the clarification path, expected. Reformulator sub: exactly 1 call/turn. `sub-get-results` = **0 tokens** (its AI Agent is orphaned — finding F-B). No new sink | PASS |
| **S8 / sink** | `Call 'sub-respond-save-message-redis'2` → fork `tWm5DYLxfypmVC1T` (unconsumed `sorento-respond-message-TEST`), recorded as `would_log`. Per LESSONS §45 / memory `s7-llen-gate-unsound` the LLEN gate is **not** used and not claimed | PASS |

Egress-log kinds observed, union over all `uac` runs: **`would_log`, `would_send`, `would_write` only.** Zero entries of any other kind. Attachment turns additionally record `send-message-files` / `send-message-images` as `would_send` guard rows while the real nodes never execute (`TL3b` `11079993`: `Edit Fields` → presigned URL present in the guard row, node absent from runData).

> **Instrument caveat, stated rather than buried:** for the **9 chat-console turns** the redis egress list was *not* read — `zz-canary-read` (`LLIbMXAixexM9Cwc`) is a `manualTrigger`, inactive, and I may not edit it. §0 for those 9 was derived from `runData` (orphan set absent) + the HI sub-execution. That is a *different, weaker* instrument for S1/S3 than the egress log, though S1/S3 on this clone are structural (0 inbound). Recorded as a gap, not papered over.

---

## §TL-S. Structural gates — re-derived by me from a fresh REST GET of the deployed graph

Compared population stated so empty output cannot read as PASS (LESSONS §61b): **138 nodes, 176 main edges, 0 dangling endpoints.**

### §TL-S1 ★ — PASS (5/5)
1. no node named `Split Out1` ✅ · 2. no node named `Loop Over Items` ✅ · 3. `Loop Over Items1` **still exists** ✅
4. **`If6.main[1]` == exactly one target == `Aggregate1`** ✅ (`If6.main[0]` == `central-exchange`)
5. `Aggregate1` inbound == `{If6[1]}` exactly ✅ · `not-found-error-message` inbound == `{Aggregate1[0], If-incoming-picker[1]}` exactly ✅

Also: `tool-filter[0]` has exactly one target (`replay-get-results`); no `connections` key survives for either deleted node; zero textual references to either deleted node's name anywhere in any node's `parameters` (including comments — the coder's PUT #2 reword holds).

### §TL-S2 ★ — PASS
`tool-filter.parameters` keys == `['jsCode']` only ⇒ default *Run Once for All Items*. `sha256(jsCode) = bffb4c3a40d4fa053756114e938b37722574acb72e09f0c54f79e83490dfdd0c` (matches the diff doc). Single-element `return [{ json: … }]` present · `return { tools: … }` absent · literal `tools[0]` absent · explicit `.sort()` on `similarity` with `name` tiebreak present · `if (!best) return [];` present · `Execute 'sub-get-rag'` `limit` still **5** · `Aggregate1.fieldsToAggregate` == `[{fieldToAggregate:"response_intro"}]` unchanged · `Call 'sub-get-results'` `tool` == `={{ $json.name }} ` unchanged (trailing space; harmless — the MCP node `.trim()`s it) · `is_test` census unchanged at **11** nodes · **zero `$runIndex`** anywhere.

### §TL-S3 — PASS
5 orphans (`send-message-files`, `-images`, `-video`, `update-human-intervened`, `save-session-vars`) all exist with **0 inbound**. Zero-inbound set = those 5 + `Code in JavaScript`, `OpenAI Chat Model`, `When Executed by Another Workflow`, `sorento-sub-respond-sendmsg-respond3` (9 total). Sinked logger → `tWm5DYLxfypmVC1T`. Exactly **8** sendmsg callers → `ublq9nSlrpz63xan`, all `is_test: true`. HI → fork `vUfFUDjLAuMaeQE6`. Credentialed nodes **28/28**; the 3 postgres nodes are all on `n8n_test-db`; **no node references a prod DB credential.**

### §TL-S4 📌 — RECORDED, not fixed
All **four** get-results callers on the clone point at `rysSPgUssLDf6xJc` (`sub-get-results TEST`): `Call 'sub-get-results'`, `probe-incoming`, `sibling-probe`, `crossdomain-probe`. Intentional and out of scope. (Note this is 4, not the 3 in CLAUDE.md's table — `crossdomain-probe` is the 4th.)

---

## §TL-1 … §TL-7 — HAPPY path, one per domain

Expected tool per domain was **not taken from memory**. It was mined from **118 live-spine executions** (`9qVyfUxmRQqrpGRMDLRuz`, last 150 execs) by reading each one's `tool-filter` output against its reformulator `domain_hint`:

| live domain_hint | tools returned by `sub-get-rag` | live turns |
|---|---|---|
| `inventory` | `crm_inventory_stock_balance_list` + `crm_inventory_warehouses_list` | 62 |
| `inventory` | `crm_inventory_stock_balance_list` (only) | 1 — the **newest**, exec `11070316` @ 13:02:52Z |
| `incoming` | `crm_incoming_stock_list` | 28 |
| `product_attachment` | `crm_master_product_attachments_list` | 12 |
| `order` | `crm_order_management_orders_list` | 8 |
| `promotion` | `crm_marketing_promotions_list` | 4 |
| `master_products` | `crm_master_products_list` | 2 |
| `portal_link` | `crm_portal_link_get` | 1 |

That 8-name set is the empirical READ allowlist used for S4.

| id | domain | exec | message | resolved tool | tf items | flat? | `_tool_pick` | If6 | verdict |
|---|---|---|---|---|---|---|---|---|---|
| §TL-1 ★ | inventory | **11079727** | `check stock SRTWT5800` | `crm_inventory_stock_balance_list` | 1 | yes (`name` top-level, no `tools`) | `{chosen:…stock_balance_list, rejected:[], count:1, has_product:true}` | out0 | **PASS** |
| §TL-2 ★ | incoming | **11079748** | `pls check eta SRTWC286-SH-NEW-200` | `crm_incoming_stock_list` | 1 | yes | `{…, rejected:[], count:1}` | out0 | **PASS** |
| §TL-3 | product_attachment | **11079993** | `SRTWT6230 photo` | `crm_master_product_attachments_list` | 1 | yes | `{…, rejected:[], count:1}` | out0 | **PASS** |
| §TL-4 | order | **11079790** | `PS202608-0030 done deliver?` | `crm_order_management_orders_list` | 1 | yes | `{…, count:1, has_product:false}` | out0 | **PASS** |
| §TL-5 | promotion | **11080021** | `show me dealer promotion for SRTKS1235-BL` | `crm_marketing_promotions_list` | 1 | yes | `{…, count:1}` | out0 | **PASS** |
| §TL-6 | master_products | **11079816** | `CB2828-SS-CR-DIY` | `crm_master_products_list` | 1 | yes | `{…, count:1}` | out0 | **PASS** |
| §TL-7 | portal_link | **11080046** | `please give me my portal link` | `crm_portal_link_get` | 1 | yes | `{…, count:1, has_product:false}` | out0 | **PASS** ⚠ |

All seven: `central-exchange` ran, `Aggregate1` **absent**, `not-found-error-message` **absent**, `runData["Call 'sub-get-results'"].length === 1`, `sendmsg-respond2` runs **== 1**, non-empty `user_response`, 0 parent LLM runs, §0 clean.

⚠ **§TL-7 deviation:** `variables.last_result_set` is `[]` (§TL-1…7 asks for a non-empty `{idx,label,…}` array). `crm_portal_link_get` returns a link, not a selectable result set — reproduced on both portal_link turns (`11080046`, `11080135`). Structurally downstream-of-parser and unrelated to the splice, but **not attributable to pre-change** (no pre-change portal_link baseline exists). Recorded, not scored as a failure.

**Three first attempts misrouted and are recorded rather than hidden** (cause: harness finding F-E, prod-session contamination — not the change):
- `TL3` `11079774` — `SRTWT6230` alone → parser reused carried domain `incoming`, answered an incoming miss. Superseded by `TL3b`.
- `TL5` `11079806` — `SRTKS1235-Bl promotion` → **access-level-choice** arm (`access-level-choice-message` ran, whole subgraph bypassed). A legitimate bypass path; superseded by `TL5b`.
- `TL7` `11079832` — `i need to lodge complaint` → carried entity `SRTWT9606-GM` + domain `incoming`, answered an incoming query. Superseded by `TL7b`.

---

## §TL-M1 … §TL-M7 — ⭐ MISS turn per domain (the highest-risk set)

**15 of the 48 executions took `If6 out1` through the new edge A2.** On **every single one**: `runData['Aggregate1'].length == 1`, output `json == {response_intro:[<exactly 1 string>]}`, `runData['not-found-error-message'].length == 1` with non-empty `escalate_message` + `is_clarification` + `found_summary`, `central-exchange` **absent**, `Loop Over Items` / `Split Out1` **absent**, `sendmsg-respond2` == 1.

| id | domain | exec | message | tool | `Aggregate1.json` | escalate_message non-empty | verdict |
|---|---|---|---|---|---|---|---|
| §TL-M1 ★★ | inventory | **11079398** | `check stock SRTWC286-SH-NEW-200` | `crm_inventory_stock_balance_list` | `{response_intro:["No matching results found."]}` | ✅ warehouse | **PASS** |
| §TL-M2 ★ | incoming | **11079433** | `check eta SRTWT5800` | `crm_incoming_stock_list` | same, 1 element | ✅ purchasing | **PASS** |
| §TL-M3 | product_attachment | **11080059** | `SRTUFV101 got certificate?` | `crm_master_product_attachments_list` | same, 1 element | ✅ purchasing_certification | **PASS** |
| §TL-M4 | order | **11081184** | `is PS202608-0030 still outstanding?` | `crm_order_management_orders_list` | same, 1 element | ✅ customer_service | **PASS** |
| §TL-M5 | promotion | **11080093** | `dealer promotion for SRTWT5800` | `crm_marketing_promotions_list` | same, 1 element | ✅ marketing_promotion_sorento | **PASS** |
| §TL-M6 | master_products | 11080123 · 11080722 · **11081468** | 3 attempts | `crm_master_products_list` | — | — | **UNREACHABLE** |
| §TL-M7 | portal_link | 11080135 · 11080046 | 2 attempts | `crm_portal_link_get` | — | — | **UNREACHABLE** |

**§TL-M6 UNREACHABLE — evidence, not inference.** Three attempts: `product catalogue info for SRTWB245` (`11080123`) routed to `product_attachment` require_specific; `product spec for SRTUFV101` (`11080722`) routed to `product_attachment`; `list price for SRTWT5800H` (`11081468`) reached `master_products` and **answered**. Structural argument: `resolve-entity` resolves a product token against the same product master that `crm_master_products_list` reads, so any *resolvable* code has a catalogue row; a *non-resolvable* token trips `If3` out0 and exits **before** `Execute 'sub-get-rag'` (demonstrated: `11080123`, `11081495`). A `master_products` miss therefore has no observed reachable trigger. **Not scored as a pass.**

**§TL-M7 UNREACHABLE.** `crm_portal_link_get` returned a live link on both attempts (`11080046`, `11080135`). No zero-row shape observed. **Not scored as a pass.**

**Additional miss-path executions (bonus coverage, same assertions all green):** `11080154` (D2 attachment), `11081139` (D1 multi-token + block), `11081310` (inventory miss, no cross-axis), `11080804` (incoming, both axes empty), `11079774`, `11081850`, `11081966`, `11082132`, `11082165`.

### §TL-AGG ★ — HARD GATE — **PASS**

Comparison made against P-BASE **and re-verified directly from the pre-change executions themselves** (both were still retrievable, so I did not take the run-log values on trust):

| | pre-change exec `11067219` (§TL-M2 baseline) | post-change exec `11079433` | equal? |
|---|---|---|---|
| `Aggregate1` output `json` | `{"response_intro":["No matching results found."]}` | `{"response_intro":["No matching results found."]}` | ✅ |
| `Aggregate1` output `pairedItem` | `[{"item":0}]` | `[{"item":0}]` | ✅ **also equal** |
| `Aggregate1` runs | 1 | 1 | ✅ |
| `Loop Over Items` runs | **2** | **node absent** | expected |
| `Split Out1` runs | **1** | **node absent** | expected |

The plan predicted a `pairedItem` divergence (`{sourceOverwrite:{previousNode:'If6'},item:0}` vs `{item:0}`). **Measured: there is none** — the loop already emitted `[{item:0}]`. Record that the anticipated divergence did not materialise.

Live cross-reference (different build, for context only): exec `11060071` (1 tool) → 1-element, `pairedItem [{item:0}]`; exec `11049139` (**2 tools**, `Loop Over Items` 3 runs, `Call 'sub-get-results'` **2 runs**) → **2-element** `{response_intro:["No matching results found.","No matching results found."]}`, `pairedItem [{item:0},{item:1}]`, and its customer message is `No stock for CSS8800. Try: … escalate to warehouse team?` — the same single-miss template. So the field is provably unconsumed.

### §TL-M-BYTE ★ — HARD GATE — **PASS**

The gate is the **final** customer string (`crossdomain-compose.user_response`, identical to the `would_send` payload), not `compile-current-state.user_response` — the cross-domain block is appended downstream of `compile`. P-BASE's shas are `sha256(text + "\n")`; reproduced exactly.

| case | P-BASE sha256 | post-change `crossdomain-compose` sha | post-change `would_send` sha | verdict |
|---|---|---|---|---|
| §TL-M1 (`11067200` → **11079398**) | `a138e89b4b0b8445599c21f0602bf58836e6820f1f95c364d6cb98c7219fe6a6` | `a138e89b…fe6a6` | `a138e89b…fe6a6` | **IDENTICAL** |
| §TL-M2 (`11067219` → **11079433**) | `f5b200cd6ac2685fe83490feb2b3fd14b8933593d7bd52654da7ef5eca971092` | `f5b200cd…1092` | `f5b200cd…1092` | **IDENTICAL** |

Zero bytes moved, including the `🚩  *(PENDING ALLOCATION)*` flag, the `Try:` list, the sibling `Related products:` picker and both escalate phrasings. `_xdApplied` absent both sides.

---

## §TL-D2 / §TL-DYM / §TL-CLR / §TL-RS / §TL-ATT / §TL-CONT / §TL-ACC

| id | exec | evidence | verdict |
|---|---|---|---|
| **§TL-D2 ★** | **11080154** | `SRTUB6203 got certificate?` → `No certificate for SRTUB6203. Try: SRTUB6201, SRTUB6213, SRTUB6503. Reply with a code to continue, or would you like me to escalate to purchasing_certification team?` · `build-suggest-offer` 1 run, **`node_errors == {}`** (its `node.all(0,1)` was swallowed by its own `catch → break`) · `alternatives` came from `Call 'sub-get-results'` **run 0** (the only run) · `selection_context == suggest_offer`, `last_result_set` 3 contiguous items, `dym_offer` armed with `ttl:3` and 3 candidates · quick_reply `SRTUB6201,SRTUB6213,SRTUB6503,Yes escalate,No it's okay` | **PASS** |
| **stale comment corrected** | static | deployed `build-suggest-offer` sha `40df90a3…`, 417 lines. `"MORE THAN ONCE"` **absent**; replaced by `get-results now runs EXACTLY ONCE per turn (tool-loop-removal, 2026-08-03…)`. The `for (let ri = 0; ri < 25; ri++)` scan and its `catch(e){break}` are byte-present | **PASS** |
| **§TL-DYM / §TL-R6 ★★** | t0 **11081850**, t1 **11081877** | chat-stateful. t0 = the D2 offer above. t1 = `2` → resolved to **`last_result_set[1]` = `SRTUB6213`** (idx 2), `attachment_type: Certification` retained, `dym_offer` → `null` (single-use lifecycle intact), reply = the two SRTUB6213 certificates. **Did not** resolve to any cross-domain/sibling contribution | **PASS** |
| **§TL-CLR** | **11080756** | `hi` → `Basic LLM Chain` 1 run + `OpenAI Chat Model` 1 run, `central-exchange` fed from it, **`Aggregate1` absent**, `tool-filter`/`get-rag`/`get-results` absent, reply `Hello! How can I help you today?`, no escalate offer | **PASS** ⚠ |
| ↳ ⚠ | 11080170 | The intended `stock ah` vague-mash trigger was classified `business_query` with the carried prod-session entity, so it **answered** instead of clarifying (finding F-E). The clarify LLM path is therefore proven via a `casual` turn, **not** via a vague business query. Weaker than §TL-CLR asks for | recorded |
| **§TL-RS** | **11080185** | `check eta SRTWT58` → `require_specific` true. `If3` **out0**. `Execute 'sub-get-rag'`, `tool-filter`, `Call 'sub-get-results'`, `validator`, `If6`, `Aggregate1` **all ABSENT from runData**. 15-item numbered picklist rendered, contiguous, `selection_context == disambiguation`. Proves the change is structurally invisible to the disambiguation path | **PASS** |
| **§TL-ATT / §TL-R9** | **11079993** | full chain ran: `central-exchange` → `if-got-attachments` → `Edit Fields` (1) → `Split Out` (1) → `Remove Duplicates` (1) → `get-presigned-url` (1) → **`Loop Over Items1` (2 runs)** → `Switch` (1). `Edit Fields`'s `$('validator')` read resolved (`attachments:[{url,filename,mimeType,attachmentType}]`). Egress: `send-message-images` `would_send` with a non-empty presigned S3 URL; the real `send-message-*` nodes absent. §0 S1 intact | **PASS** |
| **§TL-CONT / §TL-R10** | t0 **11082223**, t1 **11082257** | chat-stateful. `check stock SRTWT5800` → `how about SRTWC286-SH-NEW-200`. Entity carry ✅ (new code resolved and answered). `compile-current-state.variables` shape **unchanged** — same 19 keys on both turns. `last_result_set` / `selection_context` evolved normally. **BUT the domain did not carry**: t1 was classified `master_products`, not `inventory`, so it answered list-price instead of stock | **PARTIAL** — see finding F-D |
| **§TL-ACC-noaccess** | **11080890** | contact `457216562`. `If5` **out1**, `check-access` ran, **whole subgraph absent** (`tool-filter` absent), reply `Sorry, you are not allowed to access general_enquiries` via `sendmsg-respond5` (1 run). Egress: `would_log` + `would_send` only — **no `would_write`** | **PASS** (trivially — see audit) |
| **§TL-ACC-partial** | — | partial-access contact still TBD (P-CONTACT) | **BLOCKED** |

---

## §TL-EMPTY / §TL-SUM

| id | verdict | detail |
|---|---|---|
| **§TL-EMPTY** | **PARTIAL — not discharged end-to-end** | Part (a), the *pre-change* measurement, is **impossible without rolling the clone back**, which I was instructed not to do. Part (b) is proven only at code level: the deployed `tool-filter` bytes return `[]` for both `tools: []` and `tools: undefined` (harness below). The end-to-end claim — "0 items ⇒ `Aggregate1` never runs ⇒ the turn dead-ends silently with a green execution and no reply" — is **unmeasured on either build**. Every domain in the registry returns ≥1 tool, so no natural trigger exists; exercising it needs `prepare_test_pin_data` → `test_workflow`. **Backlog item stands, still unowned by measurement.** |
| **§TL-SUM** | **RECORDED — and materially worse than the plan states** | `tool-filter` does sort explicitly (§TL-S2 ✅), so selection is deterministic under summation. But determinism is not correctness — see finding **F-A**. |

---

## §TL-FP. Fail-on-purpose

| id | verdict | detail |
|---|---|---|
| **§TL-FP1 ★★** | ~~NOT DISCHARGED~~ → **DISCHARGED later the same day — see the appendix at the end of this file.** | Was out of scope for the tester (requires publishing a mutation; the tester edits no workflow). The orchestrator ran it afterwards as a scoped mutate→verify→revert: both miss turns produced **no reply at all** with `status: success`, then reverted to a 0-diff graph. ⚠️ A re-reviewer reading only this row concluded FP1 was still open — **read the appendix**. |
| **§TL-FP2 ★** | **NOT DISCHARGED — out of scope** | Same reason (needs a published `tool-filter` mutation). |
| **§TL-FP3 ★** | **PASS at deployed-bytes level; in-n8n pin run NOT performed** | The `tool-filter` `jsCode` was extracted **from the deployed graph** (sha `bffb4c3a40d4fa053756114e938b37722574acb72e09f0c54f79e83490dfdd0c`, identical to the node the executions ran) and executed in `node` with `$()` stubbed. Results: |

```
items=1 pick=C  rejected=["A","B"] count=3 flat=true   <- 3 tools A@0.9 B@0.8 C@0.95   (tools[0] would have been A)
items=1 pick=crm_inventory_stock_balance_list  rejected=["crm_inventory_warehouses_list"] count=2   <- real pre-deletion pair
items=1 pick=crm_inventory_stock_balance_list  rejected=["crm_inventory_warehouses_list"] count=2   <- same pair, insertion order REVERSED
items=1 pick=crm_inventory_warehouses_list     rejected=["crm_inventory_stock_balance_list"] count=2 <- SUM hazard: warehouses summed to 0.95  ⚠ see F-A
items=0                                                <- tools: []        (§TL-EMPTY equivalence)
items=0                                                <- tools: undefined (§TL-EMPTY equivalence)
items=1 pick=A count=1                                 <- compatible_entities undefined: NO THROW (old body threw)
items=1 pick=aaa rejected=["zzz"] count=2              <- equal similarity → name ASC, deterministic
items=1 pick=B   rejected=["A"]   count=2              <- non-numeric similarity loses to 0.1
items=1 pick=T5  rejected=["T4","T3","T2","T1"] count=5 <- 5 tools (the limit:5 maximum fan-in)
```

**Substitute negative control for the runData instrument (since §TL-FP1 is undischarged):** the same checker that reported `Aggregate1: 1` / `not-found-error-message: 1` on all 15 miss executions reported **`Aggregate1: ABSENT`, `not-found-error-message: ABSENT`** on all 21 happy-path executions — with `status: success` in both groups. So the instrument *does* discriminate presence from absence on real data and is not vacuous. It has **not** been shown red on a *miss* turn, which is precisely what §TL-FP1 exists to prove; do not treat this as equivalent.

---

## §TL-R. Regression set (= crossdomain manual script §5b R1–R10, extended)

| id | exec | result | note |
|---|---|---|---|
| §TL-R1 | **11079727** | **PASS** | `check stock SRTWT5800` → 6 locations, no block, 1 tool, 1 read, 1 send |
| §TL-R2 ★ | **11081513** (+ **11081310**) | **PASS** | `11081513` (`check stock for SRTWT5800-FH and SRTWT5801`) → answered SRTWT5801 **plus** `No stock records found for: SRTWT5800-FH.` with **no block** (incoming axis empty ⇒ silent). `11081310` (`check stock SRTWT5800-FH`) → `No stock for SRTWT5800-FH. Try: SRTWT5800, SRTWT5801, SRTWT5803. …`. Both template lines are **byte-identical to live wording** mined from 183 live responses: live carries `No stock records found for: CSS8800.` (exec `11048521`), `No stock records found for: SRT393-18.` (`11047791`), `No stock for CSS8800. Try: CSS8802, CSS5800, CSS8814. Reply with a code to continue, or would you like me to escalate to warehouse team?` (`11049139`). Caveat in the audit |
| §TL-R3 | **11079790** | **PASS** | order enquiry, 1 tool, no block, normal routing |
| §TL-R4 | **11080021** | **PASS** | promotion enquiry, 1 tool, 3 flyers, `Loop Over Items1` 4 runs / `Switch` 3 (media path, untouched) |
| §TL-R5 | **11080777** | **PASS (weak)** | complaint text → the not-supported/topic-menu arm; subgraph entirely bypassed, no escalate phrase, nothing doubled. It did **not** reach an escalation. Escalate-phrase non-duplication was instead verified on the 15 miss turns: exactly **one** `…escalate to <team>…` per message, sourced from `escalate-catalog` (which ran on the X6 `yes` leg) |
| §TL-R6 ★★ | **11081850** + **11081877** | **PASS** | = §TL-D2 + §TL-DYM |
| §TL-R7 | **11080756** | **PASS** ⚠ | = §TL-CLR (caveat above) |
| §TL-R8 | **11080185** | **PASS** | = §TL-RS |
| §TL-R9 | **11079993** | **PASS** | = §TL-ATT, `Loop Over Items1` ran (2) |
| §TL-R10 | **11082223** + **11082257** | **PARTIAL** | = §TL-CONT |
| §TL-R11 ⭐ AND-mode | **11080788** | **PASS** | `check stock for SRTWT5800 and SRTWC286-SH-NEW-200` → answered SRTWT5800's 6 rows, then `No stock records found for: SRTWC286-SH-NEW-200.` — **the itemised miss line names the RIGHT product** — then the incoming block for that product only, then one escalate question, quick_reply `Yes escalate,No it's okay`. The hoist's AND-mode path (never sampled before) is correct |
| §TL-R12 ⭐ arity | **all 48** | **PASS** | `sorento-sub-respond-sendmsg-respond2` runs **== 1** on every execution; total sendmsg runs across all callers == 1 on every execution. **Zero executions with 2 sends.** `Call 'sub-get-results'` == 1 on all 36 subgraph executions |

---

## §TL-X. Cross-domain feature re-runs on the loop-free topology

| id | exec | result | evidence |
|---|---|---|---|
| **T1** (marker/placement) | **11081139** | **PASS** | `check stock SRTWC286-SH-NEW-200 and SRTWT58000 and SRTWC286-SH-NEWW` → hits the **D1 multi-token lower-case arm WITH a cross-domain block AND a numbered candidate list** — the riskiest combination in the manual script. Rendered order: `Couldn't find some items:` → **block** (`But there is INCOMING stock (ETA)…`) → `"SRTWT58000" — did you mean:` `1. 2. 3.` / `"SRTWC286-SH-NEWW" — did you mean:` `4. 5. 6.` → `Reply a number to pick, or 'yes' to escalate to warehouse.` **Block is above the numbered list and above the escalate invite; numbering is contiguous 1–6 and nothing is interleaved.** |
| ↳ | 11080868 | recorded | The first D1 multi-token attempt exited at `If3` out0 (no resolvable entity ⇒ no validator ⇒ no block), so it proved nothing about placement — noting it because it *looked* correct. `11081139` is the one with teeth |
| ↳ numbered/uuid arm | 11081164 · 11081495 | **NOT REACHED** | Promotion typos produced the access-level-choice arm (`11081164`) and the D1 **prose** single-token form (`11081495`, `Couldn't find "SRTKS1235-BLX". Did you mean SRTKS1235-BL, SRTKS1035-BL, or SRTKS1225-BL?`). The uuid-numbered candidate arm was not triggered; `11081139` covers the numbered-list risk |
| **T2** (`_xdApplied` absent) | all 36 | **PASS** | `crossdomain-compose` output keys == `['quick_reply','user_response','variables']` on **every** one of the 36 executions that reached it. `_xdApplied` **absent** in all. Also already absent pre-change (`11067200`/`11067219`) |
| **§TL-X-T3** | **11079398 · 11079433 · 11079774 · 11080788 · 11080804 · 11080828 · 11081139 · 11081310 · 11081966** | **PASS** | `runData['crossdomain-probe'].length === 1` on every execution where it ran (9). Never 2. `executeOnce` is gone; **no `$runIndex`** anywhere (S2). **Discriminating power caveat in the audit** |
| **§TL-X-T4** | all 36 | **PASS** | `runData['crossdomain-zeroset'].length === 1` on every subgraph execution. Runs cannot disagree ⇒ F4 closed by construction |
| **X1** | **11079433** | **PASS** | incoming miss + on-hand: `No incoming stock (ETA) found for SRTWT5800.` → block, 6 locations **qty DESC** (316/236/7/4/0/0) → sibling `Related products:` 1–3 → escalate. Block ABOVE the sibling list. Byte-identical to P-BASE (§TL-M-BYTE) |
| **X2** | **11080804** | **PASS** | `check eta SRTWT5800-FH` — both axes empty. `crossdomain-probe` ran (1), `crossdomain-render` ran (1), and **no block, no lead-in** in the message. Decision (d) holds: an empty probe never asserts an absence |
| **X3** | **11079398** | **PASS** | inventory miss + incoming: block with `200` / ETA `2026-07-22` / container `FFAU3176932` / `🚩  *(PENDING ALLOCATION)*`, above `Try:` and above the escalate question. Byte-identical to P-BASE |
| **X4 / X11a / X11b** | **11080828** | **PASS** | partial incoming turn: SRTWC286-SH-NEW-200 answered (attachment lane) **plus** `No incoming records found for: SRTWT5800.` **plus** the on-hand block for the missing one only **plus** one escalate question, quick_reply `Yes escalate,No it's okay`. Hoist line (X11) names the right product |
| **X5** (partial inventory) | **11080788** | **PASS** | = §TL-R11, the mirror of X4 on the inventory axis. First run of X5 |
| **X6** | t0 **11081966**, t1 **11081990** | **PASS** | `yes` after X1 → `If2`/`divert-suggest-yes`/`is-human-intervened`/`escalate-catalog` ran; `Call 'sub-human-intervention'` → sub-exec `11081997` on fork `vUfFUDjLAuMaeQE6` with `is_test:true`, `team:purchasing`, `agent:incoming_stock_enquiries`, `turn_id:11081990`. Sub ran **3 nodes only** (trigger, `chat?`, `chat-escalation-push`) — record-only, zero staff ripple. Chat reply `⚠️ [escalated to purchasing team]` |
| **X7** | t0 **11082082**, t1 **11082117** | **PASS** | **first run ever.** `No it's okay` after X4 → reply exactly `Escalation declined.`, `Call 'sub-human-intervention'` **absent** |
| **X8** | t0 **11082132**, t1 **11082165** | **PASS** | `2` after X1 → resolved to the **sibling picker's** item #2, `SRTWT5800-FH` (t0 `last_result_set[1]` = `{idx:2,label:"SRTWT5800-FH",uuid:37946fa7-…}`), then correctly answered `no incoming` for it. **Not** a cross-domain row ⇒ the block stays display-only. First exec-attributed run |
| **X9** | **11080848** | **PASS (no-op)** | `FFAU3176932` → order domain, `If3` out0, **no block**, `Could not find order for FFAU3176932. Would you like me to escalate to customer_service team?` + CS member roster 1–6. Byte-identity to live not measurable on the clone |
| **X10** | **11079727** | **PASS (no-op)** | fully-answered stock turn: no block, no escalate phrase, no quick replies |

`crossdomain-render` / `crossdomain-compose` pin to run 0 via `.first()`; **asserted, not assumed** — both ran exactly 1× on every execution, so `.first()` and "run 0" are the same object on a 1-tool turn.

---

## 🚩 Findings for the reviewer

**F-A ⚠ RAISE plan RR3 from "MEDIUM, latent" — the mitigation does not mitigate.** Measured on the deployed `tool-filter` bytes: if `sub-get-rag`'s **summed** `similarity` ever puts `crm_inventory_warehouses_list` above `crm_inventory_stock_balance_list`, the code deterministically picks `warehouses_list` for a per-product stock query — a tool the plan itself (RR1) says structurally cannot answer one. **Pre-change the loop would still have run `stock_balance_list` on the second iteration; post-change there is no second chance**, so the same data condition changes from "slower but correct" to "one wrong answer, no fallback". The explicit sort (D9) makes the choice *deterministic*, not *right*; `_tool_pick.rejected[]` makes it *observable after the fact*. Currently dormant (see F-C). The real fix (max instead of sum in `sub-get-rag`) is correctly out of scope — but this should be logged at higher severity than the plan has it.

**F-B ✅ `sub-get-results`'s LLM agent IS orphaned — get-results is a 0-token deterministic read.** On the fork `rysSPgUssLDf6xJc`: `AI Agent` has **no `main` inbound** (only `ai_tool` from `MCP Client` and `ai_languageModel` from `OpenAI Chat Model`); the trigger feeds only `entity-ids-transformer` → `MCP Client1` → `output-structurer`. Three sampled sub-executions (`11082267`, `11082234`, `11082180`) ran **exactly those four nodes** — the agent, the model and the agent-side MCP client never executed. Consequences: (i) §0 S6 — get-results contributes **zero tokens**; (ii) **§0 S4 has no allowlist anywhere in the system** — `MCP Client1.tool` is `={{ $('When Executed by Another Workflow').first().json.tool.trim() }}`, i.e. whatever `tool-filter` picked, forwarded verbatim to `http://72.62.195.20:8765/mcp`. This change **narrows** the surface from ≤5 names/turn to exactly 1, which is a real safety improvement, but S4 remains an assertion on observed data (8 read names over 48 runs), exactly as plan §6(b) says.

**F-C 🚩 the 1-tool premise (plan §4.1 / RR6) became true on LIVE *today*, by data, and moved mid-day.** Live inventory turns returned **2** tools in 62 of 63 sampled executions, up to and including exec `11059966` @ **11:01:39Z**; the newest inventory turn, exec `11070316` @ **13:02:52Z**, returned **1**. So `crm_inventory_warehouses_list` stopped matching the `inventory` domain query somewhere in that window. P1 is therefore satisfied **as of now** — but by a registry/embedding state that changed without a workflow change and can change back. This is the reason the arity must be enforced in code (it is) rather than assumed from the index, and the reason my per-domain arity assertions are data-inert (see audit item 1).

**F-D §TL-CONT: domain continuity did not hold, and it is not this change's doing.** `how about SRTWC286-SH-NEW-200` after a stock turn was classified `domain_hint: master_products` by the reformulator (exec `11082257`), so it answered list-price rather than stock. The entire splice is downstream of `Call 'sub-query-reformulator'`, which is a separate workflow this diff does not touch — structurally unattributable to `tool-loop-removal`. Matches memory `backlog-bare-code-domain-carry`. Flagged so it is not read as a loop-removal regression, and not silently absorbed either.

**F-E 🧨 HARNESS HAZARD — the dev contact's PROD session is stale-contaminated, and `uac` mode reads it.** `get-session-vars-http` for `437264483` returns a fixed prior state (`domain_hint: incoming`, entity `Srtwt9606 gm` / `SRTWT9606-GM`, `response: "Previous turn (incoming): returned 1 records"`). Because `save-session-vars` is orphaned, my runs neither wrote nor cleared it — every `uac` turn inherits the same contamination. Three of my first attempts misrouted because of it (`11079774`, `11079832`, `11080170`) and each produced a *plausible, green* answer to the wrong question. This is a live false-green generator for any future `uac` case whose message is not domain-decisive. LESSONS §31's `mode=regress-capture` remedy applies; worth adding to the drivers' preconditions.

**F-F minor.** CLAUDE.md's key-ID table says three get-results callers on the clone; there are **four** (`crossdomain-probe` is the fourth). Diff §5 has it right.

---

## 🔍 Green-that-cannot-fail audit — which of my passes are weak evidence

**Would still pass if the change were inert or broken:**

1. **§TL-1…§TL-7 and §TL-R12's arity assertions (`tool-filter` emits 1 item, get-results runs once) — DATA-INERT, the weakest large block.** `_tool_pick.count == 1` on **all 36** subgraph executions: `sub-get-rag` returned exactly one tool for every domain today (F-C). A build with the old `{tools:[…]}` + loop would also have produced 1 read and 1 send on every one of these turns. These 36 greens therefore say almost nothing about the arity change. The only thing that makes them meaningful is the deployed-bytes §TL-FP3 proof (3 tools → 1 item, and it is C not A) plus §TL-S2's structural read. **If the reviewer discounts §TL-FP3, treat the whole per-domain arity claim as unproven.**
2. **§TL-AGG cannot distinguish the two hypotheses it appears to test.** It proves post-change == pre-change on a **1-tool** miss. It does **not** prove that the 2-element → 1-element transition is invisible, because no execution on *this* build ever had 2 tools. The only 2-element measurement (`11049139`) is a different build. The `nothing consumes response_intro` claim rests on that cross-build comparison plus code reading, not on a same-build A/B.
3. **§TL-X-T3 ("probe runs exactly 1") is non-discriminating as an observation.** P-BASE `11067200`/`11067219` **also** show `crossdomain-probe: 1` — *with the loop still present* — because they were 1-tool turns. So my 9 greens do not distinguish "structurally single-run" from "the data can no longer produce two runs". What actually closes F3 is the structural fact that no `splitInBatches` remains on that path (§TL-S1, verified). Same argument applies to **§TL-X-T4**.
4. **§TL-ACC-noaccess passes on any build** — it short-circuits at `If5` before anything this change touched. Zero diagnostic value for `tool-loop-removal`; kept only as a §0 datapoint.
5. **§TL-R5** as run never reached an escalation, so "escalate phrase not doubled" was proven on the miss turns instead, not by R5 itself.
6. **§TL-R2's "byte-identical to live"** is a *template-line* comparison against live executions with **different product codes**, not a byte diff of the same input on both builds. Strong on wording, silent on anything code-specific. (§TL-M-BYTE is the one that does the real same-input byte diff.)
7. **§TL-CLR** was proven with a `casual` greeting, not the vague business mash §TL-CLR specifies (F-E blocked the intended trigger). It proves the LLM branch and the subgraph bypass; it does not prove clarification of a vague query.
8. **T1's first attempt (`11080868`) is a textbook false green** — correctly ordered output, but the arm was never reached (`If3` out0, no block existed to misplace). `11081139` is the run with teeth. Recording both because the failure mode is exactly the "confirm the reply really contains the lower-case `did you mean:` wording" warning in the manual script.
9. **The runData miss-path instrument has not been shown red on a miss turn.** It *is* shown to discriminate — 21 happy-path executions reported `Aggregate1`/`not-found-error-message` ABSENT with `status: success` — but §TL-FP1's exact pairing (a *miss* turn with those nodes absent and the execution still green) is undischarged. Until it is, the 15 miss greens rest on the instrument's behaviour in a different population.

**Strongest / genuinely falsifiable evidence:** §TL-M-BYTE (same clone, same two messages, pre vs post, sha equal — would have gone red on a single byte); §TL-S1.4/5a (shown red against synthetic mutations by the coder, and it keys on the exact edge whose absence is the catastrophe); §TL-DYM and X8 (a wrong pick would have surfaced a different product code); X7 (`Escalation declined.` is an exact string); the X6 HI sub-execution (3 nodes — a real assign would have added many); §TL-RS (six named nodes absent, and my checker demonstrably reports them present elsewhere).

---

## ❌ Could not discharge

| item | why |
|---|---|
| ~~**§TL-FP1 ★★ (mandatory)**~~ **— NOW DISCHARGED, see appendix** | Needed a **published mutation** (unwire `If6 main[1]`) + re-run of §TL-M1/M2 — out of scope for a tester who edits no workflow, so it was correctly left open here. The orchestrator then ran it by fault injection (NOT by inspection): §TL-M1 `11083256` / §TL-M2 `11083280` both `status: success` with `Aggregate1`, `not-found-error-message`, `compile-current-state` and `sendmsg2` all ABSENT and **no reply produced**. Instrument validated. |
| **§TL-FP2 ★** | needs a published `tool-filter` mutation. Same reason. |
| **§TL-FP3 in-n8n** | discharged on the **deployed bytes** offline; the `prepare_test_pin_data` → `test_workflow` variant was **not** run. Pinning a 138-node workflow requires supplying data for ~20 credentialed/HTTP nodes; a half-pinned run would produce a plausible-but-meaningless result, which is the failure mode this suite exists to avoid. Recommend it be run as its own scoped task. |
| **§TL-M6** (master_products miss) | **UNREACHABLE** — 3 attempts + a structural argument (`resolve-entity` and `crm_master_products_list` read the same master). |
| **§TL-M7** (portal_link miss) | **UNREACHABLE** — 2 attempts, always returns a link. |
| **§TL-EMPTY** | part (a) needs the clone rolled back (forbidden); part (b) end-to-end needs a pin. Only the code-level `[]` behaviour is proven. |
| **§TL-ACC-partial** | **BLOCKED** on P-CONTACT (partial-access contact still TBD). |
| **§TL-CONT domain carry** | observed failing; unattributable without a pre-change run (see F-D). |
| **§TL-7 `last_result_set` non-empty** | portal_link returns `[]`; no pre-change portal_link baseline exists to attribute against. |
| **§0 egress-log read on the 9 chat turns** | `zz-canary-read` is `manualTrigger` + inactive and I may not edit it; §0 for those turns used `runData` + the HI sub-execution instead. |
| **uuid-numbered did-you-mean arm** | not triggered in 2 attempts (access-level-choice / prose form). `11081139` covers the numbered-list placement risk. |
| **X9 / X10 "byte-identical to live"** | not measurable on the clone — the clone carries the unpromoted crossdomain splice, so its output is expected to differ from live on any turn where a block applies. |
| **golden-master replay (R-automated)** | still broken per memory `replay-harness-stale-broken` (pushes `main-message-list-test`, clone pops `test:q:{contact}`) — a green report from it would be false. Not run. §5b/§TL-R was the regression pass. |

---

## Appendix — case → executionId (all 48)

| tag | exec | started (UTC) | message |
|---|---|---|---|
| _throwaway (discarded)_ | 11078752 | 14:41:57 | `check stock SRTWT5800` |
| TL-M1 (first M1, egress not captured) | 11079020 | 14:44:56 | `check stock SRTWC286-SH-NEW-200` |
| §TL-M1 | **11079398** | 14:49:18 | `check stock SRTWC286-SH-NEW-200` |
| §TL-M2 / X1 | **11079433** | 14:49:37 | `check eta SRTWT5800` |
| §TL-1 / R1 / X10 | **11079727** | 14:52:58 | `check stock SRTWT5800` |
| §TL-2 | **11079748** | 14:53:08 | `pls check eta SRTWC286-SH-NEW-200` |
| TL3 (misrouted) | 11079774 | 14:53:21 | `SRTWT6230` |
| §TL-4 / R3 | **11079790** | 14:53:26 | `PS202608-0030 done deliver?` |
| TL5 (access-level-choice arm) | 11079806 | 14:53:33 | `SRTKS1235-Bl promotion` |
| §TL-6 | **11079816** | 14:53:36 | `CB2828-SS-CR-DIY` |
| TL7 (misrouted) | 11079832 | 14:53:43 | `i need to lodge complaint` |
| §TL-3 / ATT / R9 | **11079993** | 14:55:31 | `SRTWT6230 photo` |
| §TL-5 / R4 | **11080021** | 14:55:46 | `show me dealer promotion for SRTKS1235-BL` |
| §TL-7 | **11080046** | 14:55:59 | `please give me my portal link` |
| §TL-M3 | **11080059** | 14:56:03 | `SRTUFV101 got certificate?` |
| TLM4 (answered) | 11080078 | 14:56:11 | `order status for SRTWB245` |
| §TL-M5 | **11080093** | 14:56:17 | `dealer promotion for SRTWT5800` |
| TLM6 (routed product_attachment) | 11080123 | 14:56:34 | `product catalogue info for SRTWB245` |
| §TL-M7 attempt | 11080135 | 14:56:39 | `portal link for lodging complaint` |
| §TL-D2 / R6a | **11080154** | 14:56:47 | `SRTUB6203 got certificate?` |
| TLCLR (misrouted) | 11080170 | 14:56:54 | `stock ah` |
| §TL-RS / R8 | **11080185** | 14:56:59 | `check eta SRTWT58` |
| TLM4b (answered) | 11080612 | 15:01:14 | `order status for SRTUFV101` |
| TLM6b (routed product_attachment) | 11080722 | 15:02:26 | `product spec for SRTUFV101` |
| §TL-CLR / R7 | **11080756** | 15:02:45 | `hi` |
| §TL-R5 | **11080777** | 15:02:56 | complaint text |
| §TL-R11 / X5 | **11080788** | 15:03:00 | `check stock for SRTWT5800 and SRTWC286-SH-NEW-200` |
| X2 | **11080804** | 15:03:06 | `check eta SRTWT5800-FH` |
| X4 / X11 | **11080828** | 15:03:17 | `check eta SRTWT5800 and SRTWC286-SH-NEW-200` |
| X9 | **11080848** | 15:03:25 | `FFAU3176932` |
| T1 attempt 1 (no block reached) | 11080868 | 15:03:36 | `check stock SRTWC286-SH-NEWW and SRTWT58000` |
| §TL-ACC-noaccess | **11080890** | 15:03:49 | `check stock SRTWT5800` (contact `457216562`) |
| T1 numbered attempt (access-choice) | 11081164 | 15:06:53 | `promotion for SRTKS1235-BLX` |
| **T1** | **11081139** | 15:06:40 | `check stock SRTWC286-SH-NEW-200 and SRTWT58000 and SRTWC286-SH-NEWW` |
| §TL-M4 | **11081184** | 15:07:02 | `is PS202608-0030 still outstanding?` |
| §TL-R2 (single) | **11081310** | 15:08:21 | `check stock SRTWT5800-FH` |
| §TL-M6 attempt 3 (answered) | 11081468 | 15:10:07 | `list price for SRTWT5800H` |
| T1 numbered attempt 2 (prose arm) | 11081495 | 15:10:21 | `dealer promotion for SRTKS1235-BLX` |
| §TL-R2 ★ (itemised) | **11081513** | 15:10:30 | `check stock for SRTWT5800-FH and SRTWT5801` |
| §TL-DYM t0 | **11081850** | 15:14:22 | `SRTUB6203 got certificate?` (chat) |
| §TL-DYM t1 | **11081877** | 15:14:35 | `2` (chat) |
| X6 t0 | **11081966** | 15:15:33 | `pls check eta SRTWT5800` (chat) |
| X6 t1 | **11081990** | 15:15:43 | `yes` (chat) → HI sub-exec **11081997** |
| X7 t0 | **11082082** | 15:16:43 | `check eta SRTWT5800 and SRTWC286-SH-NEW-200` (chat) |
| X7 t1 | **11082117** | 15:17:00 | `No it's okay` (chat) |
| X8 t0 | **11082132** | 15:17:07 | `pls check eta SRTWT5800` (chat) |
| X8 t1 | **11082165** | 15:17:24 | `2` (chat) |
| §TL-CONT t0 | **11082223** | 15:17:57 | `check stock SRTWT5800` (chat) |
| §TL-CONT t1 | **11082257** | 15:18:15 | `how about SRTWC286-SH-NEW-200` (chat) |

Pre-change references re-read directly (not taken on trust from the P-BASE log): clone `11067200`, `11067219`; live `11049139`, `11060071`, `11070316`, `11059966`, `11048521`, `11047791`.

---

# §TL-FP1 ★★ — DISCHARGED (the mandatory fail-on-purpose)

Run by the orchestrator after the tester's pass, as a scoped mutate → verify → revert on the clone.
Live spine untouched throughout (`a40cd16d`).

## Method
1. Baseline captured (`versionId cb4dffdb-c217-42a7-856f-0d45dca258ac`). Mutate and revert bodies built from
   the same GET; verified they differ **only** in `connections["If6"].main[1]`.
2. PUT with `If6.main[1] = []` → published `6731a6dc-5fe3-4f0d-b326-c81ebefa0189`.
   Settings preserved (`binaryMode`/`availableInMCP` intact), 28/28 credentials, postgres = `n8n_test-db` only.
3. Discarded the first run after the write, then ran §TL-M1 and §TL-M2.

## MUST-observe — ALL CONFIRMED

| assertion | §TL-M1 `11083256` | §TL-M2 `11083280` |
|---|---|---|
| n8n reported status | **`success`** | **`success`** |
| `resultData.error` | none | none |
| `runData['Aggregate1']` | **ABSENT** | **ABSENT** |
| `runData['not-found-error-message']` | **ABSENT** | **ABSENT** |
| `runData['compile-current-state']` | ABSENT | ABSENT |
| `runData['sorento-sub-respond-sendmsg-respond2']` | ABSENT | ABSENT |
| egress log | `would_log` only — **no `would_send`, no reply** | same |

A healthy miss turn emits 3 guards (`would_log`/`would_write`/`would_send`); under the mutation only the
inbound logger fired. **The customer receives no reply at all and n8n still reports a clean success.** That is
the dead-end catastrophe §TL-S1.4 exists to catch, and it confirms the instrument: the runData assertions go
RED while status-based scoring would have called it green.

**Negative control (unplanned but useful):** the discarded happy-path run `11083242`
(`check stock SRTWT5800`) had `compile-current-state` and `sendmsg2` **PRESENT** under the same mutation — so
the unwired edge killed *only* the miss path, not the workflow generally.

## Revert — verified
PUT of the baseline body → `3e4d5ea6-c3ae-42d9-aad5-e1d8d5db3874`. `If6.main[1]` back to `[{Aggregate1}]`,
settings/credentials unchanged. Normalized graph diff (nodes+params+`executeOnce`+connections) vs the
pre-FP1 `cb4dffdb` capture: **0 lines**. The new `versionId` reflects only that a PUT always creates a
version; the content is identical.

## Post-revert re-run — §TL-S1 + §TL-M1/M2 green again

| exec | case | `Aggregate1` | `not-found` | `crossdomain-probe` runs | `crossdomain-zeroset` runs | sha256(`user_response`) |
|---|---|---|---|---|---|---|
| `11083437` | §TL-M1 | PRESENT | PRESENT | **1** | **1** | `a138e89b…fe6a6` ✅ == P-BASE |
| `11083457` | §TL-M2 | PRESENT | PRESENT | **1** | **1** | `f5b200cd…1092` ✅ == P-BASE |
| `11083416` | happy control | ABSENT | ABSENT | 0 | 1 | `eba46bab…` (happy answer; differs by design) |

§0 PASS on every run. The single-run probe/zeroset counts confirm crossdomain **F3** and **F4** are now
impossible by construction rather than dormant.

**Verdict: §TL-FP1 PASS. The miss suite is a real instrument, not a green that cannot fail.**

---

# §TL-FP2 ★ — DISCHARGED

Same scoped mutate → verify → revert method as §TL-FP1. Mutation: `tool-filter`'s final
`return [{json: …}]` replaced with `return { tools: [best] };` (the OLD pre-change shape). Built by editing
only that node's `jsCode`; verified the revert body was untouched and that `tool-filter` was the sole
differing node. Published, first run after the write discarded, then §TL-1 (`check stock SRTWT5800`).

## MUST-observe — CONFIRMED

| assertion | observed (exec `11083629`) |
|---|---|
| n8n status | **`success`**, `error: none` |
| `tool-filter` output | `{"tools":[{"name":"crm_inventory_stock_balance_list","similarity":0.481…}]}` — the wrapper object, **no top-level `name`** |
| item count | 1 (one item whose `json` is the wrapper, not the tool) |
| `validator` runs | 1 |
| egress | 3 guards — a reply **was** produced |
| reply | `Here's what you want:` / `• product: SRTWT5800 (+3 more)` / `But no inventory matched these. Would you like me to escalate to warehouse team?` |

`SRTWT5800` holds **564 pcs across 6 locations**. So the mutation produced a **plausible, confidently-worded,
completely wrong** answer on a green execution — LESSONS §61a, and the same failure family as the
decision-(d) landmine (a bogus tool name once made the bot print "none on hand" for this very product).
§TL-1's `tool`-string assertion goes RED here, so it is a real instrument.

⚠️ **Correction to a mis-measured assertion.** The check first used —
`runData["Call 'sub-get-results'"][0].data.main[0][0].json.tool` — reads that node's **output**, which never
carries a `tool` key, so it reports `<<EMPTY>>` on the healthy build too (verified on execs `11083725` /
`11083744`). It is **not** discriminating and must not be used as FP2 evidence. The discriminating signals are
the two in the table: `tool-filter`'s item shape (flat + `name` vs wrapper without `name`), and the wrong
reply. Recorded because a non-discriminating assertion presented as proof is exactly the
`green-that-cannot-fail` pattern this suite exists to defeat.

## Revert — verified
`1bfc2124-8afa-48e1-ad95-2bfa86b00e02`. Normalized graph diff vs the pre-FP `cb4dffdb` capture: **0 lines**.
28/28 credentials, postgres `n8n_test-db` only, settings preserved. §0 structural re-check: all 5 egress nodes
still zero-inbound; every sendmsg caller still `ublq9nSlrpz63xan`.

Post-revert green confirmed: §TL-M1 exec `11083744` — `Aggregate1` PRESENT, `tool-filter` flat with
`name=crm_inventory_stock_balance_list`, and `sha256(user_response)` = `a138e89b…fe6a6`, **== P-BASE**.

**Verdict: §TL-FP2 PASS.**

---

# Fail-on-purpose summary

| case | status | proves |
|---|---|---|
| §TL-FP1 ★★ | **PASS** | miss suite is real; a dead-ended `If6 out1` yields NO reply on a `status: success` execution, caught only by runData assertions |
| §TL-FP2 ★ | **PASS** | `tool-filter`'s output shape matters; wrong shape ⇒ plausible-but-wrong answer, green execution |
| §TL-FP3 ★ | **NOT RUN** — needs `prepare_test_pin_data` → `test_workflow`. Partially substituted by the coder's offline proof against the **deployed** bytes (A@0.9 / B@0.8 / C@0.95 ⇒ 1 item, and it is **C**, so `tools[0]` is demonstrably not what shipped). The pin run remains owed. |

Clone left at **`1bfc2124-8afa-48e1-ad95-2bfa86b00e02`**, content-identical to the reviewed `cb4dffdb`.
Live spine untouched at `a40cd16d` throughout.
