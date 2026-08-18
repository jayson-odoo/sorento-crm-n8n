# miss-company-routing — ROUND 4 tester roll-up (2026-08-18)

Targets (draft==active verified **before and after**; live never driven, nothing edited or promoted):

| workflow | id | versionId |
|---|---|---|
| TEST clone (spine, sole run target) | `txiPzSxy3Pclsz6v` | **`3e7fa66d`** |
| get-results fork | `t4QvrtrPnTwRU6br` | **`9ee992e9`** |
| parser fork (untouched) | `wI5RkNGW3EOJfBdo` | `c7d9cfa2` |
| sendmsg fork | `aQUmwMVplmNcyUVc` | `b48e0eaa` |
| HI fork | `vUfFUDjLAuMaeQE6` | `0fdba9e5` |
| save-msg fork | `tWm5DYLxfypmVC1T` | `ce78408e` |

Round-4 body shas re-verified against `tests/diffs/miss-company-routing/*` **before and after** the pass:
`output-structurer 698f89f1` · `miss-roster-gate e4575d3e` · `miss-roster-plan 95d6c814` ·
`disallowed-entity-gate 069b3691` · `promo-picker 05a96e3a` · (unchanged) `compile-current-state 8deebd5e`,
`escalate-catalog 0168df84`, `build-miss-member-offer fab11982`, parser fork `output_exchange a68c5992` /
`systemMessage 138008c2`. Guards: the 5 egress nodes still have **0 inbound edges**; `executeWorkflow` targets
still all forks.

Units on the repo bodies (byte-equal to deployed): round4 **101/101**, round3 **85/85**, rev4.spine **33/33**,
rev4.output_exchange **48/48**, delta1/2/3 GREEN. LESSONS #45 grep: **0** hits of
`prototype|constructor|__proto__` across all 5 `.expr.txt` files.

## Verdicts

| # | case | verdict | clone exec(s) |
|---|---|---|---|
| **CAP** | captain's own turn end-to-end: "promotion for MUB6201" → tier ask → "dealer" → "yes" | **PASS** | 12946833 / 12946868 / 12946926 |
| R1 | (A)+(B) the captain's exact promotions turn | **PASS** | 12945979 |
| R2 | R1 then bare "yes" → HI `marketing_promotion` + Sorento | **PASS** | 12946147 |
| R3 | promo roster still works on top of the offer ("1") | **PASS** | 12946268 |
| R4 | negative — a promotions PICK turn gets NO miss offer | **PASS** | 12946268 |
| R5 | negative — `_promo_unmatched` two-product turn ⇒ exactly ONE offer | **PASS** | 12946317 |
| R6 | master products per-company miss + "yes" | **BLOCKED — no live fixture; offline + deployed-body proof PASS** | 12946366, 12946543, 12946564, 12946584, 12946627 |
| R7 | product attachments miss + "yes" + file ordering | **PASS** | 12946417 / 12948208 |
| R8 | certificates miss + "yes" | **PASS (deviation D4: tool is `crm_master_product_attachments_list`)** | 12946443 / 12948185 (+12946775, 12947106) |
| R9 | promotion products miss | **BLOCKED — tool not reachable via RAG; offline proof PASS** | 12946742 |
| R10 | negative — tier-ask turn gets NO miss offer (D14) | **PASS** | 12946833 |
| R11 | total not-found already offers, per domain, + (d) control | **PASS** (one observed sub-case, see D7) | 12946985 / 12947150 / 12947034 / 12947058 (+12947013) |
| R12 | regression subset — rounds 2/3 + tier lane unmoved | **PASS** (byte-identical modulo stamp) | 12947249, 12947271, 12947295, 12947316, 12947403, 12947432 |
| R13 | (A) code hygiene on an orders-by-DO turn | **BLOCKED — no two-company DO fixture; offline + live-adjacent proof PASS** | 12946645 (+12947249) |
| T1 | tier-rebase regression (tier ask on 487555417 / SRTBF11710) | **PASS** | 12947469 |
| S3 | sendmsg fork prod-DB write closed (`…-S3-round4-20260818.json`) | **PASS** | – |
| **S** | §0 S1–S6 on EVERY execution | **PASS** | all 32 |

## P3 (read-only roster probe, exec 12945607)

12 read-only `GET /api/v1/external/team-members` probes; **11 × 200 with ≥1 member, 1 × 404**.

| team_code (agent `general_enquiries`) | Sorento `0000…0001` +brand mocha | Sorento, no brand | Mocha `38db4f20…` |
|---|---|---|---|
| `marketing_promotion` | 200 (Kia Yee) | 200 (Am, Kia Yee, Aqi) | 200 (Kia Yee) |
| `purchasing_product` | 200 (Chew Hong) | 200 (Chew Hong) | 200 (Arwen) |
| `marketing_product` | 200 (Charissa Wang, Kia Yee) | 200 (Tay Zhi Yang, Charissa Wang, Kia Yee) | 200 (Kia Yee) |
| `purchasing_certification` | 200 (Josephine Ng) | 200 (Josephine Ng) | **404 BLOCKED-BY-CONFIG** |

**BLOCKED-BY-CONFIG — company Mocha (`38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2`), team `purchasing_certification`.**
CRM detail: *"No team found for agent and team_code='purchasing_certification' in company
'38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2'. Configure that company's team set before routing to it."*
Impact: the round-4 certificates lane is a PLAIN offer and makes **no** roster call, so nothing is blocked at
render time — but a **live "yes"** on a *Mocha* certificates miss would reach `next-assignee` with an
unconfigured team. Admin team-set gap; captain action.

## Deviations

- **D1 — live parser drifted BEFORE this pass.** The UAC quotes live `XTODTw-dJcV0uRdC056hG` @ `89b63c51`;
  it is actually **`b9ac64a2`** (workflow `updatedAt 2026-08-18T07:17:57Z`, i.e. before the tester started).
  It is byte-identical before and after my pass. Not caused here — flagged because the promote gate reads
  "live parser unchanged", and the staged promote payload's anchors were built against `89b63c51`.
- **D2 — the helper `zz-roster-probe` (`ZS0KErse7GDh9mJK`) was edited and restored.** Its `probe-params`
  `jsCode` was temporarily swapped for the 12 P3 URLs, executed once, then restored and re-verified
  **byte-equal (sha `ad5b8b07`)**. It is an INACTIVE test helper, not a system under test; only read-only
  `team-members` GETs were issued; `next-assignee` was never called. Its `versionId` is now `d400bdaa`.
- **D3 — R6 (master products) has no live per-company-miss fixture and is structurally unlikely to.**
  Five live probes all answered every company in `lookup_companies`. Proven instead on the DEPLOYED bodies
  (gate row + plan stamping units, plus a render proof lifting `compile-current-state` lines 1223–1225 verbatim).
- **D4 — certificates asks resolve to `crm_master_product_attachments_list`, never `crm_certificates_list`.**
  `sub-get-rag` returned exactly ONE tool candidate on all 32 executions (`_tool_pick.count == 1`,
  `rejected == []`), so the tool cannot be steered from the message text. The gate still fired TRUE on the
  attachments row's **second** pair (`purchasing_certification/general_enquiries`) — the two-pair design
  working as intended — and the offer named `purchasing_certification`. Consequence: the miss noun reads
  "product attachments", not "certificates". The `crm_certificates_list` row and its companion negative (C5)
  are offline-proven only.
- **D5 — `crm_marketing_promotion_products_list` (R9) is not reachable through the RAG registry** for the
  same reason; offline-proven only.
- **D6 — R13 has no two-company DO fixture.** `M2608-1026` resolves to a single company. Proven by the
  `W1(ii)` unit on the deployed `output-structurer` plus the live R12(a) evidence that the code clause
  survives on an orders turn.
- **D7 — observed, pre-existing, not a round-4 regression.** On a MULTI-VARIANT product a *certificates*
  total-not-found (exec 12947013, `SRTWC8066-SH`) sets `escalate-catalog.is_escalate_offer = true` but renders
  the DYM variant chooser (`manualResponse:false`), so the visible reply carries **no** offer. Re-run with a
  single unresolvable code (`ZZZQ9999`, exec 12947150) gives the expected offer.
- **D8 — repo artifact drift.** `tests/diffs/miss-company-routing/spine-compile-current-state.js` is
  `6bff997d` (the round-3 rev-3 body) while the clone runs **`8deebd5e`** (the clone-tier-rebase body). The
  diff is only the tier/promo `last_result_set` precedence arms and the picker-reported de-dup — the miss-offer
  rendering block is identical — but three unit suites read the stale file. Worth refreshing.

## Precedence negatives (one offer per turn)

| leg | proof | result |
|---|---|---|
| tier-ask turn (`if-tier-has-any` TRUE) ⇒ miss lane unreachable | LIVE exec 12946833 (R10/CAP-t1) | non-execution set asserted, 0 offers |
| `_promo_pick` ⇒ gate FALSE | LIVE exec 12946268 (R3/R4) | 0 offers on the rebuilt pick reply |
| `_promo_unmatched` ⇒ gate FALSE | LIVE exec 12946317 (R5) | exactly 1 offer |
| generic phrase-already-present leg (a) | LIVE exec 12946317 (either leg acceptable; FALSE asserted) | exactly 1 offer |
| crossdomain `_xdBlock.any` ⇒ gate yields | LIVE exec 12947316 (R12d) | `_xdBlock` non-empty, exactly 1 offer, gate never reached |
| `_promo_notfound` / `_brand_gate_closed` / `_promo_picker_shape` markers | **offline only** — no live turn in this pass produced those markers (the promotions total-not-found arrived via the DYM renderer instead). Each marker is individually covered by `miss-company-routing-round4.gates.test.js` on the deployed gate body. | unit PASS |

## Notable, for the reviewer

- **get-results LLM liveness:** the fork's `AI Agent` / `MCP Client` / `OpenAI Chat Model` are orphaned
  (0 inbound) — and so are the SAME three nodes on **both live** get-results subs (`rysSPgUssLDf6xJc`,
  `Fss5aAaXthJSWpZCgKiKR`). The get-results agent is not live anywhere; the sub is a deterministic read
  pipeline and §0 S4's read-allowlist assumption holds by construction.
- **No new token sink.** 30 of 32 turns bypassed the parser entirely; the real parser ran on exactly the 2
  declared parser-tier turns; 0 clone-level `Basic LLM Chain`; `sub-get-rag` ran 22× (pre-existing sink).
  The reformulator was never invoked twice on a turn.

## Egress tally

**32 clone executions · 145 sub-executions swept · 117 egress records — 100 % `would_*`, 0 real egress.**

| kind | n |
|---|---|
| `would_send` | 48 |
| `would_write` | 37 |
| `would_log` | 32 |

- Orphaned egress nodes executed: **0** across all 32 executions.
- `api.respond.io` references anywhere in the 145 sub-executions: **0**.
- Prod redis list `sorento-respond-message`: **never grew** (0 of 31 canary-run executions had `after > before`;
  one showed 1→0, the live spine draining a real customer message). Sink `…-TEST` grew +1 per run.
- Only CRM roster GET in the whole pass: **one** `get-cs-members-miss` on R12(a) (the orders regression),
  plus the 12 read-only P3 probes. Zero roster GETs on every round-4 lane.
- HI fork invoked 5×, each short-circuiting at `test-guard → test-guard-record`; zero assign / SLA /
  PIC-comment / round-robin executions anywhere.

### Execution ids

`12945979 R1` · `12946147 R2` · `12946268 R3/R4` · `12946317 R5` · `12946366 R6-probe` ·
`12946417 R7-t1` · `12946443 R8-t1` · `12946543/12946564/12946584/12946627 R6-probes` ·
`12946645 R13-probe` · `12946742 R9-probe` · `12946775 R8-cert-variant` · `12946833 CAP-t1/R10` ·
`12946868 CAP-t2` · `12946926 CAP-t3` · `12946985 R11a` · `12947013 R11b(multi-variant)` ·
`12947034 R11c` · `12947058 R11d` · `12947106 R11b2` · `12947150 R11b3` · `12947249 R12a` ·
`12947271 R12b` · `12947295 R12c` · `12947316 R12d` · `12947403 R12e` · `12947432 R12-offer-hold` ·
`12947469 T1` · `12948185 R8-t2` · `12948208 R7-t2` · (P3 helper) `12945607`.
