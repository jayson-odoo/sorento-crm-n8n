# UAC run: `incoming-axis-gate-and-partial-message` (§21.1–21.7)

- **Date:** 2026-07-14
- **Target:** clone `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`, active version `06b96650-2b19-4ba7-ad8b-9029368104c3`.
- **Scope:** deterministic (Code-node gate + response-formatting; parser NOT edited).
- **Driver substitution:** the Playwright browser profile was **locked by another session** (could not
  reclaim/close). Fallback used = the SAME `zz-chat` chatTrigger workflow (`oyYfVvZHRZpWubTy`) driven via
  `execute_workflow(inputs:{type:'chat',chatInput:…})` in production mode. This exercises the identical
  chat lane (`build-item` → `test:q:437264483` → dispatcher `2D0cw2Y1aPW2LOlU` → clone `txiPzSxy3Pclsz6v`
  → `chat:reply:{chat_id}` → `format-out`), only without the browser widget. Contact `437264483` (FULL),
  `mode:uac`, one turn per case (per-contact queue serialized; ran sequentially).
- **§0 evidence basis:** asserted from `get_execution(includeData:true)` runData on the clone execution
  (the §0 preamble authorizes this). Direct read of the redis `test:egress:{test_run_id}` list was **not**
  performed — no redis-read path was available this session (browser locked; `zz-canary-read`
  `LLIbMXAixexM9Cwc` is a hardcoded-key manualTrigger not drivable via MCP and must not be edited). The
  runData is the stronger artifact: it shows definitively whether any real-egress node executed. On every
  case the real-egress nodes (`send-message-files/images/video`, `save-session-vars`,
  `update-human-intervened`, `Call 'sub-human-intervention'`) were **ABSENT from runData** (did not execute),
  every reply returned via `chat:reply`, and `lastNodeExecuted` was `guard-h-record` (the sendmsg guard).
  get-results always routed to the TEST fork `rysSPgUssLDf6xJc` (never the live get-results) and always
  resolved a READ tool. **S1–S5 affirmatively verified on all 7 cases; no real egress anywhere.**

## Verdicts

| Case | Exec (clone) | §0 | Behaviour | Verdict |
|---|---|---|---|---|
| 21.1 ETA 1 vague product | 8525615 | PASS | PASS | **PASS** |
| 21.2 ETA 1 exact product | 8525836 | PASS | PASS | **PASS** |
| 21.3 ETA 2 vague products | 8525929 | PASS | PASS | **PASS** |
| 21.4 ETA 2 exact products | 8526007 | PASS | PASS | **PASS** |
| 21.5 ETA 1 found + 1 not-found | 8526075 | PASS | PASS | **PASS** |
| 21.6 FLAGSHIP 2 containers (exec-8519391 repro) ★ | 8526154 | PASS | PASS | **PASS** |
| 21.7 stock 2 products 1 found + 1 not | 8526246 | PASS | DIVERGENCE | **§0 PASS / functional gap** |

P-B1 harvest (from 21.1 picklist): exact A = `SRTBF11701`, exact B = `SRTBF11707`.

## Per-case detail

### §21.1 — ETA "SRTBF117" → picklist  · clone exec 8525615
Gate: `identifier_axis:false` (PRODUCT MODE), `require_specific:true`, `gate_passed:false`,
`not_found_axis_tokens:[]`, 15 SRTBF117 candidates. Reply = ONE numbered picklist (1..15), each annotated
`— has/no incoming`. If3 → output[0] (picklist path).
§0: get-results/send-message-*/save-session-vars/update-human-intervened/sub-human-intervention all absent;
`guard-d-record`+`guard-h-record` fired; reply via chat:reply. PASS.

### §21.2 — ETA "SRTBF11701" (exact) → proceed  · clone exec 8525836
Gate: PRODUCT MODE, `gate_passed:true`, `require_specific:false`, `not_found_axis_tokens:[]`, intersection=1
(SRTBF11701). If3 → output[1] (proceed). get-results ran (read, sub-exec 8525847, `has_result:false` — no
incoming). Reply: "• product: SRTBF11701 … no incoming matched these … escalate to purchasing?" No picklist,
no not-found itemization. §0: real-egress nodes absent, read-only. PASS.

### §21.3 — ETA "SRTBF117 and SRTWC85" → ONE consolidated picklist  · clone exec 8525929
Reply = single continuous numbered list 1..30 (SRTBF117 = 1–15, SRTWC85 = 16–30), each annotated has/no
incoming — NOT split per token (matches coordinator refinement). §0: NO node in the queried egress+get-results
set executed; `lastNodeExecuted:guard-h-record`; reply via chat:reply. Gate behaviour (require_specific=true,
PRODUCT MODE) confirmed by the rendered consolidated `gate_clarification`. PASS.

### §21.4 — ETA "SRTBF11701 and SRTBF11707" (both exact) → proceed both  · clone exec 8526007
Gate: PRODUCT MODE, `gate_passed:true`, `require_specific:false`, `not_found_axis_tokens:[]`, both tokens
resolved exact → compatible_entities = 2 products. If3 → output[1]. get-results batched read (sub-exec 8526016,
`has_result:false`). Reply: "• product: SRTBF11701 (+1 more) … no incoming …". No picklist, no not-found. §0
PASS.

### §21.5 — ETA "SRTBF11701 and Z9ZZNOTAREALCODE" → proceed found + itemize not-found  · clone exec 8526075
Gate: PRODUCT MODE, `gate_passed:true`, `require_specific:false`, `not_found_axis_tokens:[]`,
`unresolved_tokens:["Z9ZZNOTAREALCODE"]`, compatible=[SRTBF11701]. **If3 → output[1] (proceed)** — the
narrowed `if3-unresolved-guard-narrowed` works (unresolved present but compatible non-empty ⇒ no dead-end).
get-results ran on SRTBF11701 (read, sub-exec 8526090, `has_result:false`). Reply: "• product: SRTBF11701 /
Couldn't find: "Z9ZZNOTAREALCODE". / But no incoming matched these…" — missing token itemized, A NOT listed as
missing. (Itemization comes from the no-result echo path, since incoming returned no rows; `not_found_axis_tokens`
is empty because this is product-axis.) §0: real-egress absent, read-only. PASS.

### §21.6 — FLAGSHIP "check ETA for BMOU649395378 and WHSU5485370 to Sorento warehouse"  · clone exec 8526154 ★
IDENTIFIER MODE confirmed exactly:
- `gate_debug.identifier_axis:true`, `gate_passed:true`, `require_specific:false`
- `compatible_entities` = exactly ONE `inbound_shipment` uuid `9e038abe-8775-4539-b863-eded5af48297` (WHSU)
- `not_found_axis_tokens:["BMOU649395378"]`
- `gate_reason:"identifier-axis 'incoming': 1 axis match(es); 1 not found; noise tokens dropped"`
- Resolver surfaced ALL the "Sorento" noise (transporter SORENTO, 5 customers, 4 products, 2 promotions) →
  every one DROPPED from compatible_entities (only WHSU remains).
- If3 → output[1] (proceed). get-results (read, sub-exec 8526165, `has_result:true`): 3 WHSU5485370 incoming
  lines, ETA `2026-07-18` + packing-list xlsx.

Reply (`format-out`, via chat:reply): the 3 WHSU incoming lines with ETA 2026-07-18, then
`I couldn't find any incoming shipment matching: • BMOU649395378`, then the xlsx as a 📎 chat attachment.
"Sorento" appears nowhere as a picklist option or a not-found item. No product picklist.
§0 (S1 focus — the old product-picklist send must NOT relaunch, and the xlsx must NOT hit a real send):
`send-message-files/images/video` all ABSENT — the xlsx routed via `chat-attach-push` → chat:reply (presigned
URL), never the real send-message-files egress node. `save-session-vars`/`update-human-intervened`/
`sub-human-intervention` absent. `lastNodeExecuted:guard-h-record`. **PASS — the exec-8519391 repro is fixed.**

### §21.7 — stock "SRTBF11701 and Z9ZZNOTAREALCODE"  · clone exec 8526246 — §0 PASS, functional DIVERGENCE
Gate: `domain:inventory`, `identifier_axis:false` (PRODUCT MODE — inventory correctly NOT in the incoming-only
AXIS matrix), `gate_passed:true`, `require_specific:false`, `not_found_axis_tokens:[]`,
`unresolved_tokens:["Z9ZZNOTAREALCODE"]`, compatible=[SRTBF11701]. If3 → output[1] (proceed). get-results ran on
SRTBF11701 (read, sub-exec 8526256, `has_result:true`): stock WH3 (PSM), Qty 0, DISCONTINUED.
Reply: only the found product's stock table + "Data last updated…" — **the not-found token Z9ZZNOTAREALCODE is
NOT itemized.** A is (correctly) not listed as missing.

**Why it diverges (and why it is NOT a regression from this change):** the new `compile-current-state` B2 IIFE
only appends `gate.not_found_axis_tokens`, which is empty for product-axis. Product-axis not-found relies on the
pre-existing not-found-itemize / no-result echo path, which fires only on the DEAD-END / `has_result:false`
branch. §21.5 itemized only because incoming returned `has_result:false` (no rows). §21.7's found product
returned stock (`has_result:true`), so the success output-structurer replaced `userResponse` and suppressed the
unresolved-token breakdown. This change touched only the incoming identifier-axis path (axis matrix is
incoming-only + the identifier-axis IIFE); the inventory/product-axis/output-structurer path is untouched, so it
cannot have regressed. The divergence is a UAC-expectation-vs-baseline gap: the written §21.7 expectation
assumed product-axis success paths itemize unresolved tokens, which the codebase never did.
§0: real-egress nodes all absent, get-results read-only (`crm_inventory_warehouses_list` candidate; stock read).
**§0 PASS.**

## Roll-up
- **§0 zero-egress gate: PASS on all 7 cases.** No real WhatsApp/comment send, no assignment/SLA/PIC/CRM write,
  no write tool in get-results, reply always via `chat:reply`, guard layer active, get-results always on the
  TEST fork. The kill-switch held.
- **The change's target behaviour (incoming axis gate + identifier-axis partial not-found) works:** §21.1–21.6
  all PASS, including the flagship exec-8519391 repro (§21.6) — IDENTIFIER MODE with the single WHSU shipment,
  `not_found_axis_tokens:["BMOU649395378"]`, Sorento noise dropped, WHSU ETA + itemized BMOU not-found, no
  product picklist.
- **One functional gap (§21.7):** product-axis (inventory) partial does NOT itemize the not-found token on the
  get-results SUCCESS branch. Not a safety issue and not a regression from this change; it is a pre-existing
  product-axis behaviour that the §21.7 expectation over-assumed. Reviewer/planner to decide: (a) accept and
  correct the §21.7 UAC expectation, or (b) file a separate enhancement to append unresolved product tokens on
  the success path.

---

# Re-run after product extension (2026-07-14, later same day)

- **Target:** clone `txiPzSxy3Pclsz6v`, active version **`4d1c1f4e-1c5a-4178-83b0-e8362bb8ef7b`** (extended
  + re-published).
- **What changed:** gate now emits `not_found_product_tokens` (product-family-hinted parser entities the
  resolver couldn't match, PROCEED path only, never when a picklist shows); `compile-current-state` B2 IIFE
  now appends "I couldn't find any product matching: X" on the SUCCESS branch alongside any axis line.
  PRODUCT MODE picklist logic byte-unchanged.
- **Driver + §0 discipline:** unchanged from above (same `zz-chat` chatTrigger lane; §0 from clone runData).

## Re-run verdicts

| Case | Chat exec | Clone exec | require_specific | not_found_axis_tokens | not_found_product_tokens | §0 | Behaviour | Verdict |
|---|---|---|---|---|---|---|---|---|
| 21.1 1 vague | 8527537 | 8527539 | true (picklist) | [] | **[]** | PASS | picklist unchanged, no leak | **PASS** |
| 21.2 1 exact | 8527627 | 8527630 | false | [] | **[]** | PASS | proceed, NO spurious line | **PASS** |
| 21.3 2 vague | 8527693 | 8527695 | true (picklist) | [] | [] (inferred, no leak) | PASS | one consolidated picklist | **PASS** |
| 21.4 2 exact | 8527755 | 8527757 | false | [] | **[]** | PASS | proceed both, NO spurious line | **PASS** |
| 21.5 1 found+1 not | 8527820 | 8527822 | false | [] | **["Z9ZZNOTAREALCODE"]** | PASS | itemizes missing token | **PASS** |
| 21.6 FLAGSHIP ★ | 8527884 | 8527886 | false | ["BMOU649395378"] | **[]** (no double-count) | PASS | identifier mode unregressed | **PASS** |
| 21.7 stock 1 found+1 not | 8527956 | 8527958 | false | [] | **["Z9ZZNOTAREALCODE"]** | PASS | **GAP FIXED** — stock + itemized not-found | **PASS** |

**§0 zero-egress: PASS on all 7 re-run cases.** Every clone exec: real-egress nodes
(`send-message-*`, `save-session-vars`, `update-human-intervened`, `Call 'sub-human-intervention'`) ABSENT
from runData; reply via `chat:reply`; `lastNodeExecuted:guard-h-record`; get-results always on TEST fork
`rysSPgUssLDf6xJc` with a READ tool. No real egress anywhere.

### Re-run per-case detail
- **21.1 (8527539):** gate `not_found_product_tokens:[]`, `require_specific:true`, `gate_passed:false`,
  15-candidate consolidated picklist. New field emitted **empty on the picklist path** — the "never when a
  picklist shows" guard holds. §0 clean.
- **21.2 (8527630):** gate `not_found_product_tokens:[]`, `gate_passed:true`, single exact SRTBF11701.
  Reply "• product: SRTBF11701 … no incoming matched these" — **no spurious "couldn't find" line**
  (false-positive guard holds). get-results read (sub-exec 8527638). §0 clean.
- **21.3 (8527695):** consolidated 1..30 picklist unchanged, no not-found line leaking. §0: no
  egress/get-results/sub-human-intervention executed. `not_found_product_tokens` empty inferred (same
  PRODUCT MODE picklist path as 21.1; no leak in reply).
- **21.4 (8527757):** gate `not_found_product_tokens:[]`, both exact resolved, `gate_passed:true`,
  compatible=2. Reply "• product: SRTBF11701 (+1 more) … no incoming" — **no spurious line**. get-results
  batched read (sub-exec 8527766). §0 clean.
- **21.5 (8527822):** gate `not_found_product_tokens:["Z9ZZNOTAREALCODE"]`, `not_found_axis_tokens:[]`,
  `gate_passed:true`, compatible=[SRTBF11701], If3→output[1] (proceed). get-results read (sub-exec 8527833,
  `has_result:false`). Reply still itemizes "Couldn't find: Z9ZZNOTAREALCODE", A not missing. §0 clean.
- **21.6 FLAGSHIP (8527886):** UNREGRESSED. `identifier_axis:true`, `gate_passed:true`,
  `require_specific:false`, compatible = single WHSU `inbound_shipment` `9e038abe-…`,
  `not_found_axis_tokens:["BMOU649395378"]`, **`not_found_product_tokens:[]`** — BMOU is counted once as an
  axis not-found, NOT double-itemized as a product not-found. Sorento noise all dropped. Reply: WHSU ETA
  2026-07-18 + "I couldn't find any incoming shipment matching: BMOU649395378" + xlsx (via `chat-attach-push`,
  no real send-message-files). §0 clean.
- **21.7 (8527958) — GAP FIXED:** gate `domain:inventory`, PRODUCT MODE (`identifier_axis:false`),
  `gate_passed:true`, `require_specific:false`, `not_found_axis_tokens:[]`,
  **`not_found_product_tokens:["Z9ZZNOTAREALCODE"]`** (missing token only; found product SRTBF11701 NOT in
  it). If3→output[1] (proceed). get-results `has_result:true` (stock, sub-exec 8527968, read tool
  `crm_inventory_warehouses_list`). Reply now: stock table for SRTBF11701 **AND** "I couldn't find any
  product matching: • Z9ZZNOTAREALCODE" on the SUCCESS branch. The prior divergence is resolved. §0 clean.

### Re-run roll-up
- **All 7 cases PASS; §0 zero-egress PASS on all 7.**
- The extension works as specified: product-axis SUCCESS-branch not-found itemization now fires (§21.7),
  the false-positive guard holds (§21.1/21.2/21.3/21.4 emit `not_found_product_tokens:[]`, no spurious
  lines), §21.5 populates + itemizes, and the flagship §21.6 identifier mode is unregressed with no
  double-counting of the container token (axis vs product not-found are mutually exclusive per token).
- No new divergences. No new token sink beyond the driver's one-per-turn live reformulator.

---

# Iteration 2 re-run — per-token parser-hint classification + 2 new mixed cases (2026-07-14)

- **Target:** clone `txiPzSxy3Pclsz6v`, active version **`c1ff50f3-1d94-453b-ba96-14e1052f7f28`**.
- **What changed:** gate refactored from a whole-query mode switch to **per-token parser-hint
  classification**. New `gate_debug` fields: `axis_matches`, `product_exacts`, `require_specific`
  (the old `identifier_axis` flag is gone). `not_found_axis_tokens` / `not_found_product_tokens` unchanged
  in meaning.
- **Driver + §0:** unchanged (same `zz-chat` chatTrigger lane; §0 from clone runData).
- **⚠️ Concurrency note:** during this run OTHER executions were hitting the clone concurrently (another
  session — likely the live chat webpage / a parallel driver on contact `437264483`). I stopped using the
  "latest exec" heuristic and **correlated every case by `startedAt` timestamp against my chat exec** (and
  by the echoed `chatInput` in `build-item` where needed). All 9 clone exec IDs below are timestamp-matched
  to my own chat executions. No cross-contamination in the asserted data.

## Iteration-2 verdicts

| Case | Chat exec | Clone exec | require_specific | not_found_axis_tokens | not_found_product_tokens | §0 | Behaviour | Verdict |
|---|---|---|---|---|---|---|---|---|
| 21.1 1 vague | 8531277 | 8531279 | true (picklist) | [] | [] | PASS | picklist unchanged | **PASS** |
| 21.2 1 exact | 8531346 | 8531348 | false | [] | [] | PASS | proceed, no spurious line | **PASS** |
| 21.3 2 vague | 8531467 | 8531469 | true (picklist) | [] | [] | PASS | one consolidated picklist | **PASS** |
| 21.4 2 exact | 8531555 | 8531557 | false | [] | [] | PASS | proceed both, no spurious line | **PASS** |
| 21.5 1 found+1 not | 8531646 | 8531648 | false | [] | ["Z9ZZNOTAREALCODE"] | PASS | itemizes missing | **PASS** |
| 21.6 FLAGSHIP ★ | 8531727 | 8531729 | false | ["BMOU649395378"] | [] | PASS | identifier behaviour unregressed | **PASS** |
| 21.7 stock 1 found+1 not | 8532197 | 8532199 | false | [] | ["Z9ZZNOTAREALCODE"] | PASS | stock + product not-found | **PASS** |
| **21.8 mixed, real product** (repro 8529182) | 8531818 | 8531820 | false | ["BMOU649395378"] | [] | PASS | **DIVERGENCE — WHSU swallowed by suggest-on-miss** | **§0 PASS / functional FAIL** |
| **21.9 mixed, fake product** (repro 8528931) | 8532051 | 8532053 | false | ["BMOU649395378"] | ["CWC604-S-RL"] | PASS | **WHSU renders + BOTH not-founds** | **PASS** |

**§0 zero-egress: PASS on all 9 iter-2 cases.** Every clone exec: real-egress nodes absent from runData;
reply via `chat:reply`; `lastNodeExecuted:guard-h-record`; get-results on TEST fork `rysSPgUssLDf6xJc`
with a READ tool; §21.8's escalation was only OFFERED in text — `Call 'sub-human-intervention'` did NOT
execute (no real assign). No real egress anywhere.

### Iter-2 detail on the changed / new cases
- **21.1–21.5, 21.7 (standard):** all reconfirmed under the per-token gate. New gate_debug per-token counts
  observed and correct: 21.1 `axis_matches:0/product_exacts:0` (picklist), 21.2 `product_exacts:1`,
  21.4 `product_exacts:2`, 21.5 `product_exacts:1` + `not_found_product_tokens:["Z9ZZNOTAREALCODE"]`,
  21.7 (inventory) `not_found_product_tokens:["Z9ZZNOTAREALCODE"]`. False-positive guard still holds
  (21.1/21.2/21.3/21.4 emit `not_found_product_tokens:[]`, no spurious "couldn't find" line). §0 clean.
- **21.6 FLAGSHIP (8531729):** unregressed. gate per-token `axis_matches:1, product_exacts:0,
  require_specific:false`, compatible = single WHSU inbound_shipment, `not_found_axis_tokens:["BMOU649395378"]`,
  `not_found_product_tokens:[]`. **Parser drift this run:** the reformulator extracted only
  `["BMOU649395378","WHSU5485370"]` — it did NOT emit "Sorento" at all. Noise-drop therefore holds
  trivially (nothing to drop); outcome structurally identical to prior runs (no Sorento leak, no picklist,
  WHSU renders + BMOU itemized + xlsx). §0 clean.

- **21.9 (8532053) — PASS, the user's explicitly-wanted case works.** Parser tokens
  `["BMOU649395378","WHSU5485370","CWC604-S-RL"]` (Sorento dropped). CWC604-S-RL is FAKE → **unresolved**
  → stays OUT of `compatible_entities` (WHSU inbound_shipment only). gate `not_found_axis_tokens:["BMOU649395378"]`,
  `not_found_product_tokens:["CWC604-S-RL"]`. get-results queried ONLY WHSU → `has_result:true` (3 contents,
  ETA 2026-07-18) → **WHSU RENDERS**, and compile appends BOTH not-founds: "I couldn't find any incoming
  shipment matching: BMOU649395378" AND "I couldn't find any product matching: CWC604-S-RL", plus xlsx. §0 clean.

- **21.8 (8531820) — §0 PASS, FUNCTIONAL FAIL: WHSU swallowed by suggest-on-miss.** This is exactly the
  swallow the coordinator flagged, and it is STILL PRESENT.
  - **Gate output is CORRECT / as specified:** parser tokens `["BMOU649395378","WHSU5485370","CWCX604-S-RL"]`
    (Sorento dropped as noise). `gate_passed:true`, `require_specific:false`,
    `compatible_entities` = [WHSU inbound_shipment `9e038abe-…` **+** product `CWCX604-S-RL` `b7fedd8f-…`],
    `not_found_axis_tokens:["BMOU649395378"]`, `not_found_product_tokens:[]`, no picklist.
  - **But the reply does NOT render WHSU.** Because `CWCX604-S-RL` **resolves** (exact, though also matches the
    `-NEW` variant), it enters `compatible_entities`; get-results then filters incoming by **shipment WHSU
    AND product CWCX604-S-RL**. The WHSU container actually holds `CWCX604-S-RL-NEW` (not the bare
    `CWCX604-S-RL`), so the conjunction returns **`has_result:false`** with
    `alternatives:[CWCX604-S-RL-NEW, CWCX605-RL, CWC7601-S-RL]`, `relaxed_axis:"entity"`. The `has_result:false`
    path routes to **suggest-on-miss**, whose message ("No incoming stock (ETA) for BMOU649395378. Try:
    CWCX604-S-RL-NEW, CWCX605-RL, CWC7601-S-RL. Reply with a code … or escalate?") **replaces** everything —
    WHSU's contents AND the BMOU not-found itemization are both suppressed.
  - **Root cause (for coder/reviewer):** the divergence is downstream of the gate. A product that RESOLVES but
    is NOT present in the specified container turns get-results into an empty conjunctive query → suggest-on-miss
    overrides the partial render. Contrast §21.9, which works precisely because the product is UNRESOLVED and so
    never filters the container query. The gate correctly emitted the WHSU shipment; the fix needs to keep the
    container's contents rendering (and still itemize the not-found product) even when a co-mentioned resolved
    product doesn't match the container — i.e. don't let the product sub-filter zero-out the shipment result,
    and don't let `has_result:false`+alternatives swallow a partial that has a valid container entity.
  - **§0:** clean — get-results returned alternatives (a read); no send-message-*, no save-session-vars, no
    update-human-intervened, no `sub-human-intervention` (escalation only offered as text). Reply via chat:reply.

### Iteration-2 roll-up
- **§0 zero-egress: PASS on all 9 cases** (7 originals + 21.8 + 21.9). Kill-switch held; no halt.
- **8/9 PASS.** The per-token gate refactor is unregressed across 21.1–21.7; the flagship 21.6 holds (even
  under parser drift that dropped "Sorento"); and **21.9 — the case the user explicitly wanted — PASSES**
  (WHSU renders + both not-founds itemized).
- **1 functional FAIL: §21.8.** The gate is correct (WHSU + CWCX604-S-RL in compatible_entities,
  `not_found_axis_tokens:["BMOU649395378"]`), but a resolved-product-not-in-container causes get-results to
  return empty and the **suggest-on-miss/escalate branch swallows WHSU's contents** (and the BMOU
  itemization). This is not a §0/safety issue. Recommend the coder address the get-results-conjunction /
  suggest-on-miss-override interaction so a valid container entity still renders alongside the not-found
  itemizations (as §21.9 already does).
- No new token sink beyond the driver's one-per-turn live reformulator. Parser non-determinism observed
  (21.6 dropped "Sorento"); noise-drop invariant held structurally regardless.

---

# Iteration 3 re-verify — `build-suggest-offer` D2 container-miss wording (2026-07-14)

- **Target:** clone `txiPzSxy3Pclsz6v`, active version **`957f8d5c-52ba-4982-a1aa-dd3ba1a4fc89`**.
- **What changed:** ONE text-only edit to `build-suggest-offer` (D2 non-uuid branch). For incoming
  empty-AND with container+product, the suggest-on-miss reply now reads "No incoming stock of {product}
  in {containers}. Try: …" instead of the buggy "No incoming stock (ETA) for BMOU…". AND semantics +
  get-results + gate + compile all unchanged.
- **Driver + §0:** unchanged (same `zz-chat` chatTrigger lane; §0 from clone runData).

## Iteration-3 verdicts

| Case | Chat exec | Clone exec | build-suggest-offer | §0 | Behaviour | Verdict |
|---|---|---|---|---|---|---|
| 21.8 container + RESOLVED product (the fix) | 8536761 | 8536764 | executed, new wording | PASS | fixed suggest_response | **PASS** |
| 21.9 container + FAKE product (unaffected) | 8536869 | 8536871 | NOT executed (happy path) | PASS | WHSU renders + both not-founds | **PASS** |
| #3 pure-product miss, NO container (regression guard) | 8536951 | 8536953 | executed, OLD wording | PASS | "Did you mean …?" unchanged | **PASS** |
| 21.6 FLAGSHIP pure containers | 8537064 | 8537066 | NOT executed (happy path) | PASS | WHSU renders + BMOU not-found | **PASS** |
| 21.1 vague product picklist | 8537137 | 8537139 | executed (picklist branch, `suggest_offer:false`) | PASS | 15-item picklist unchanged | **PASS** |

**§0 zero-egress: PASS on all 5 iter-3 cases.** Every clone exec: real-egress nodes absent from runData;
reply via `chat:reply`; `lastNodeExecuted:guard-h-record`; get-results (where it ran) on TEST fork
`rysSPgUssLDf6xJc` read-only; no `sub-human-intervention` (escalation only offered as text). No real egress.

### (a) §21.8 — the fix, EXACT rendered string  · clone exec 8536764
Gate **unchanged** from iter2: tokens `["BMOU649395378","WHSU5485370","CWCX604-S-RL"]` (Sorento dropped),
`compatible_entities`=[WHSU inbound_shipment `9e038abe-…` + product `CWCX604-S-RL` `b7fedd8f-…`],
`not_found_axis_tokens:["BMOU649395378"]`, `not_found_product_tokens:[]`, `gate_passed:true`,
`require_specific:false`. get-results still empty-AND (`has_result:false` + alternatives). **`build-suggest-offer`
executed** and emitted:

> **`suggest_response`** = `No incoming stock of CWCX604-S-RL in BMOU649395378, WHSU5485370. Try: CWCX604-S-RL-NEW, CWCX605-RL, CWC7601-S-RL. Reply with a code to continue, or would you like me to escalate to purchasing team?`

Assertion checklist: names the PRODUCT `CWCX604-S-RL` ✓; names the CONTAINERS `BMOU649395378, WHSU5485370`
(BMOU,WHSU order — "either order" allowed) ✓; NO ETA leaked ✓; NO "for BMOU" phrasing ✓. The rendered
chat reply matches this string verbatim. (`suggest_quick_reply` =
`CWCX604-S-RL-NEW,CWCX605-RL,CWC7601-S-RL,Yes escalate,No it's okay`.) §0 clean.

### §21.9 — unaffected  · clone exec 8536871
`build-suggest-offer` did NOT execute (happy path). get-results `has_result:true` → WHSU renders (3 contents,
ETA 2026-07-18) + "I couldn't find any incoming shipment matching: BMOU649395378" + "I couldn't find any
product matching: CWC604-S-RL" + xlsx. Identical to iter2. §0 clean.

### (b) #3 — suggest-offer regression guard (shared node wording UNCHANGED)  · clone exec 8536953
Input `ETA for CWC604-S-RL` (pure-product near-miss, NO container). Gate: single unresolved token,
`compatible_entities:[]`, `not_found_product_tokens:["CWC604-S-RL"]`, resolver trgm alternatives present.
**`build-suggest-offer` executed** (same shared node that carries the D2 edit) and emitted:

> **`suggest_response`** = `Couldn't find "CWC604-S-RL". Did you mean CWCX604-S-RL, CWC609-RL, or CWCX604-S-RL-NEW? Reply with a code to continue, or would you like me to escalate to purchasing team?`

This is the **pre-existing "Did you mean …?" did-you-mean form — UNCHANGED**. The incoming+container+product
special-case wording did NOT leak into this non-container query (no "No incoming stock of … in …" phrasing).
The container branch is correctly gated to the container case only. §0 clean (get-results didn't run;
compatible_entities empty → not-found → build-suggest-offer).

### §21.6 flagship + §21.1 picklist — quick regressions
- **21.6 (8537066):** unchanged. Gate compatible=[WHSU inbound_shipment], `not_found_axis_tokens:["BMOU649395378"]`,
  `build-suggest-offer` NOT executed → WHSU renders + BMOU itemized + xlsx. (Parser dropped "Sorento" again
  this run; noise-drop holds structurally.) §0 clean.
- **21.1 (8537139):** unchanged. `build-suggest-offer` ran on the incoming-picker clarification branch
  (`suggest_offer:false`, `require_specific:true`) → the 15-item consolidated picklist; container special-case
  did NOT leak. §0 clean.

### Iteration-3 roll-up
- **All 5 cases PASS; §0 zero-egress PASS on all 5.** Kill-switch held; no halt.
- The D2 wording fix lands correctly: §21.8 now reads "No incoming stock of CWCX604-S-RL in BMOU649395378,
  WHSU5485370. Try: …" (product + containers, no ETA, no "for BMOU").
- The shared `build-suggest-offer` node is unregressed across its OTHER branches: the "Did you mean …?"
  did-you-mean form (#3) and the incoming-picker picklist form (§21.1) are both unchanged — the container
  special case is correctly gated and does not leak into non-container queries.
- No new token sink. Parser non-determinism observed again (21.6 dropped "Sorento"); invariant held.
- **Note (carried from iter2, unchanged by iter3):** §21.8 still routes to suggest-on-miss (WHSU contents
  not rendered) — that behaviour is intentional per this iteration (text-only wording fix; AND semantics
  unchanged). If the desired end state is to RENDER WHSU alongside the not-found in the resolved-product case
  (as §21.9 does for the fake-product case), that remains a separate change.

## Notes for reviewer
- Doc-drift reconfirmed: the clone's `Call 'sub-query-reformulator'` and `Call 'sub-get-results'` point at
  `XTODTw-dJcV0uRdC056hG` (live reformulator, driver's parser — expected) and `rysSPgUssLDf6xJc` (TEST
  get-results fork) respectively — matches the coder's diff, NOT the stale CLAUDE.md key-ID table.
- No new token sink observed beyond the driver's live reformulator (one call/turn, the §0-S6 driver cost).
- get-results LLM/agent liveness: the get-results sub returned deterministic structured reads on every case
  (no free-text LLM reformulation observed); nothing indicating an orphaned/hot agent path.

---

# Iteration 4 re-run — `disallowed-entity-gate` product-only-on-incoming fix + full §21 regression (2026-07-14)

- **Target:** clone `txiPzSxy3Pclsz6v`, **active version `0008b89a-0386-4b9d-a15a-28e349c26842`** (iter-4).
- **What changed (iter-4):** `disallowed-entity-gate` `(A1)`-else branch. For domain `incoming`, an AXIS-hinted
  (parser hint `inbound_shipment`) token with NO inbound_shipment resolver match that resolves **exact +
  unambiguous** to a **single product** is now admitted to `compatible_entities` as a product search-key
  (was dropped into `not_found_axis_tokens`). Fixes the product-only-ETA-on-incoming dead-end (repro 8565622).
- **Driver:** `zz-chat` chatTrigger lane driven via `execute_workflow(oyYfVvZHRZpWubTy, {type:'chat',
  chatInput})` in production mode → `build-item` (mode `chat-stateful`, contact `437264483`,
  chat_id=sessionId) → `test:q:437264483` → dispatcher `2D0cw2Y1aPW2LOlU` → clone `txiPzSxy3Pclsz6v` →
  `chat:reply:{chat_id}` → `format-out` returns the rendered reply. **Session reset** to `{"variables":{}}`
  in `n8n_test.respond_contacts_test` (host psql; the `.env` password `your_secure_password` is the real
  password, not a placeholder — host psql WORKS) **before every case** (chat-stateful persists session by
  contact). Clone execs correlated by `startedAt` + parent chain (zz-chat→dispatcher→clone).
- **§0 evidence basis:** `get_execution(includeData:true)` runData on each clone exec. On every case the
  real-egress nodes (`send-message-files/images/video`, `save-session-vars`, `update-human-intervened`,
  `Call 'sub-human-intervention'`, `Call 'sub-respond-save-message-redis'2`) were **ABSENT** from runData;
  sendmsg routed to the TEST fork `ublq9nSlrpz63xan` (guarded, `{success:true}`, reply to `chat:reply`);
  attachments via `chat-attach-push` presigned URL (never the real send-message-files node); get-results
  always on the TEST fork `rysSPgUssLDf6xJc` with a READ tool (`crm_incoming_stock_list` /
  `crm_inventory_warehouses_list`, never `crm_it_support_ticket_create`); `lastNodeExecuted` =
  `log-incoming-chat-history-n8ntest` (writes to `n8n_test`, not prod). Session write path = the
  `n8n_test.respond_contacts_test` gate (prod PUT orphaned). **S1–S5 affirmatively verified on all execs.**

## REPRO — "Srt6632-GM ETA"  · zz-chat 8568448 / clone exec 8568450 ★

**PASS.** Parser (live reformulator `XTODTw`, sub-exec 8568451): `domain incoming`, `intent check_incoming`,
entity `Srt6632-GM` hinted **inbound_shipment** (the mis-hint), `match_mode and`. resolve-entity (OR-mode
fallback, `fallback_applied:true`, requested inbound_shipment, none found): `Srt6632-GM` → `resolved:true`,
`ambiguous:false`, one **exact product** `SRT6632-GM` (uuid `c5aedb06-…`), `unresolved_tokens:[]`.

Gate (the fix): `gate_passed:true`, `require_specific:false`,
**`compatible_entities:[{entity_type:product, code:SRT6632-GM, uuid c5aedb06-…}]`**,
**`not_found_axis_tokens:[]`**, `not_found_product_tokens:[]`, `gate_debug.axis_matches:0,
product_exacts:1`. get-results (TEST fork, sub-exec 8568465): **`has_result:true`** — 2 answers:
**OOCU8630645 (ETA 2026-07-02, Qty 20, BRW)** + **CICU1013499 (ETA 2026-07-14, Qty 90, BRW)** + both xlsx.
validator `has_result:true, is_valid:true`. Rendered reply lists both containers/ETAs + both packing-list
xlsx — **NOT** "Could not find incoming…". Matches prod expectation verbatim. The prior FAIL (8565622,
`compatible_entities:[]` → dead-end) is fixed. §0: all real-egress nodes ABSENT; sendmsg→fork
`ublq9nSlrpz63xan`; attachments via `chat-attach-push`; get-results TEST fork read. **§0 PASS.**

## §21 regression verdicts

| Case | Chat exec | Clone exec | Gate summary | §0 | Verdict |
|---|---|---|---|---|---|
| 21.1 vague product (axis-hint variant) | 8568654 | 8568656 | `require_specific:false`, compatible:[], `not_found_axis:["SRTBF117"]`, product_exacts:0 → **NOT auto-admitted** (did-you-mean; parser drift) | PASS | **PASS** |
| 21.1 vague product (product-hint variant) | 8568803 | 8568805 | `require_specific:true`, 15-cand picklist (unregressed) | PASS | **PASS** |
| 21.2 1 exact product | 8569426 | 8569428 | proceed, compatible:[SRTBF11701], product_exacts:1, no picklist/no spurious line | PASS | **PASS** |
| 21.3 2 vague products | 8569532 | 8569534 | `require_specific:true`, ONE consolidated 1..30 picklist | PASS | **PASS** |
| 21.4 2 exact products | 8569605 | 8569607 | proceed both, product_exacts:2 | PASS | **PASS** |
| 21.5 1 found + 1 not (incoming) | 8569235 | 8569237 | compatible:[SRTBF11701], `not_found_product:["Z9ZZNOTAREALCODE"]`; missing itemized, A not missing | PASS | **PASS** |
| 21.6 FLAGSHIP container-only ★ | 8568905 | 8568907 | compatible:[WHSU inbound_shipment], `not_found_axis:["BMOU"]`; **BMOU (matches:[]) NOT admitted**; WHSU renders + BMOU itemized + xlsx | PASS | **PASS** |
| 21.7 stock inventory 1 found + 1 not | 8569331 | 8569333 | domain inventory (no axis), compatible:[SRTBF11701], `not_found_product:["Z9ZZNOTAREALCODE"]`; stock success + itemized | PASS | **PASS** |
| 21.8 mixed container + RESOLVED product | 8569008 | 8569010 | compatible:[WHSU + CWCX604-S-RL], `not_found_axis:["BMOU"]`, `product_exacts:1`; AND-empty → suggest-on-miss wording **unchanged** | PASS | **PASS** |
| 21.9 mixed container + FAKE product | 8569128 | 8569130 | compatible:[WHSU], `not_found_axis:["BMOU"]`, `not_found_product:["CWC604-S-RL"]`; WHSU renders + both not-founds | PASS | **PASS** |

### Key regression evidence
- **§21.8 wording UNCHANGED (the must-not-change):** `build-suggest-offer.suggest_response` =
  `No incoming stock of CWCX604-S-RL in BMOU649395378, WHSU5485370. Try: CWCX604-S-RL-NEW, CWCX605-RL,
  CWC7601-S-RL. Reply with a code to continue, or would you like me to escalate to purchasing team?`
  Names the product + both containers, no ETA leaked, no "for BMOU". AND-intersect (`has_result:false` +
  `alternatives`, `relaxed_axis:"entity"`) unchanged; WHSU intentionally not rendered (suggest-on-miss).
  iter-4 did not touch §21.8 — CWCX604-S-RL is PRODUCT-hinted → `(A2)`; BMOU is fake (`matches:[]`) →
  `not_found_axis` (not a single exact product, so the iter-4 `(A1)`-else guard does not admit it).
- **§21.1 AMBIGUOUS product NOT auto-admitted (the critical iter-4 property):** in the axis-hint variant
  (8568656) `SRTBF117` was parser-hinted `inbound_shipment`, resolved to **15 ambiguous prefix-tier
  products** (`resolved:false, ambiguous:true`) → the `(A1)`-else guard requires `resolved===true &&
  ambiguous!==true && single exact` → **NOT admitted** → `compatible_entities:[]`,
  `not_found_axis:["SRTBF117"]`, `product_exacts:0`. (This is identical to what iter-2/3 produced for the
  same parser output — iter-4 only changes the single-exact case; the did-you-mean reply is pre-existing
  behaviour, driven by parser hint drift, NOT an iter-4 regression.) The product-hint variant (8568805)
  still builds the `require_specific:true` 15-item picklist — the PRODUCT-MODE picklist path is unregressed.
- **§21.6 container-only unchanged:** `BMOU649395378` resolves to `matches:[]` (no product either) → stays
  `not_found_axis` (iter-4 guard correctly does NOT admit it); compatible = single WHSU `inbound_shipment`;
  WHSU renders 3 incoming products (ETA 2026-07-18) + "I couldn't find any incoming shipment matching:
  BMOU649395378" + WHSU xlsx; "Sorento" never a picklist option.
- **not-found itemization for genuinely unresolved tokens unchanged:** §21.5 (`Z9ZZNOTAREALCODE`), §21.7
  (`Z9ZZNOTAREALCODE`, inventory success branch), §21.9 (`BMOU` axis + `CWC604-S-RL` product) all itemize
  correctly, false-positive guard holds (resolved products never flagged).

## Iteration-4 roll-up
- **REPRO PASS + all §21 PASS (10 case-runs across 12 clone execs); §0 zero-egress PASS on every exec.**
  No real WhatsApp/comment send, no assign/SLA/PIC, no prod CRM/session write; sendmsg + get-results on the
  TEST forks; session/logging to `n8n_test`; prod `save-session-vars` PUT orphaned. Kill-switch held; no halt.
- The iter-4 fix lands exactly: product-code-on-incoming ("Srt6632-GM ETA") now returns the 2 containers
  matching prod, via the gate admitting the single-exact product. All 4 must-not-regress properties hold:
  §21.8 AND-intersect + wording unchanged, §21.1 ambiguous NOT auto-admitted (both parser variants),
  §21.6 container-only unchanged, itemization unchanged.
- **Parser non-determinism observed (expected):** `SRTBF117` hinted `inbound_shipment` in one §21.1 run and
  `product` (with a "product" nudge) in another; `Srt6632-GM` mis-hinted `inbound_shipment` (the repro
  condition the fix targets). Assertions were structural (gate fields + branch), never exact parser text.
- **No new token sink** beyond the driver's live reformulator (one call/turn, §0-S6 cost). get-results
  returned deterministic structured reads on every case (no free-text LLM reformulation; no orphaned/hot
  agent path). Doc-drift reconfirmed: clone `Call 'sub-query-reformulator'` → live `XTODTw-…`,
  `Call 'sub-get-results'` → TEST fork `rysSPgUssLDf6xJc`.

---

# REVERT CONFIRM — axis-gate removed, 3 nodes match LIVE, product-ETA works (2026-07-14)

- **Target:** clone `txiPzSxy3Pclsz6v`, active version **`677efeb3-fb55-46aa-b186-fa0a72757900`** (axis-gate
  REVERTED — `disallowed-entity-gate` / `compile-current-state` / `build-suggest-offer` now byte-identical to
  live spine `9qVyfUxmRQqrpGRMDLRuz`).
- **Purpose:** confirm the reverted (live) gate returns incoming containers for product-code ETA queries that
  the abandoned axis-gate iter-4 dead-ended (SRTWB1543) — matching prod.
- **Driver:** `zz-chat` chatTrigger lane, `execute_workflow(oyYfVvZHRZpWubTy,{type:'chat',chatInput})` prod
  mode → dispatcher `2D0cw2Y1aPW2LOlU` → clone. Contact `437264483`, session reset to `{"variables":{}}` in
  `n8n_test.respond_contacts_test` before each. Clone execs timestamp-matched (one clone exec per window, no
  concurrency).

## Verdicts

| Query | zz-chat exec | Clone exec | Gate | get-results | §0 | Verdict |
|---|---|---|---|---|---|---|
| "SRTWB1543 ETA" | 8587122 | 8587124 | live gate: token ambiguous (exact SRTWB1543 + prefix SRTWB1543-BL) → `gate_passed:true`, `compatible_entities:[{product,SRTWB1543}]`, `gate_reason:"ok"`, **NO axis-gate fields** | TEST fork `rysSPgUssLDf6xJc` sub 8587139, READ, `has_result:true` | PASS | **PASS** |
| "SRT6632-GM ETA" | 8587304 | 8587306 | live gate: AND-mode single product SRT6632-GM → `gate_passed:true`, `compatible_entities:[{product,SRT6632-GM}]`, `gate_reason:"ok"`, **NO axis-gate fields** | TEST fork `rysSPgUssLDf6xJc` sub 8587321, READ, `has_result:true` | PASS | **PASS** |

### SRTWB1543 — rendered reply (clone 8587124)
> Container **TIIU6062534**, ETA **2026-07-04**, Qty **50**, BRW (38), BRW-SMC (12) + `TIIU6062534.xlsx`.

Matches prod verbatim. NOT "Could not find incoming for SRTWB1543" (the axis-gate iter-4 dead-end, exec 8584630,
is fixed by the revert). Gate output has NO `not_found_axis_tokens`/`identifier_axis`/`axis_matches` — axis-gate
gone. This is the case iter-4's `matches.length===1` guard could NOT fix (SRTWB1543 resolves ambiguous, exact +
prefix sibling); the live gate admits it correctly via OR-fallback `compatible_entities`.

### SRT6632-GM — rendered reply (clone 8587306)
> 1. Container **OOCU8630645**, ETA **2026-07-02**, Qty **20**, BRW (20)
> 2. Container **CICU1013499**, ETA **2026-07-14**, Qty **90**, BRW (90) + both xlsx.

Matches prod verbatim. Still works after revert. (Parser this run went AND-mode directly — no inbound_shipment
mis-hint — vs the iter-4 repro's mis-hint; live gate handles both, assertion structural.)

## §0 zero-egress — PASS both

Both clone execs: of the real-egress + write nodes queried (`send-message-files/images/video`,
`save-session-vars`, `update-human-intervened`, `Call 'sub-human-intervention'`,
`Call 'sub-respond-save-message-redis'2`, `Call 'sub-send-message'`) **NONE executed** — all ABSENT from
runData. Only `disallowed-entity-gate`, `validator`, `Call 'sub-get-results'` (+ downstream shape/attach/log)
ran. get-results always on TEST fork `rysSPgUssLDf6xJc` returning a READ (`crm_incoming_stock_list`-class),
never `crm_it_support_ticket_create`. xlsx via `chat-attach-push` presigned URLs (`get-presigned-url`), never
the real `send-message-files` egress. `lastNodeExecuted:log-incoming-chat-history-n8ntest` (writes to
`n8n_test`, prod `save-session-vars` PUT orphaned). Reply returned via `chat:reply` → `format-out`.
S1–S5 affirmatively verified on both. No real egress; kill-switch held.

## Roll-up
- **Both product-ETA queries PASS; §0 PASS both.** The revert restores correct product-ETA-on-incoming
  behaviour (SRTWB1543 no longer dead-ends; SRT6632-GM unchanged), matching prod. Axis-gate fields fully
  absent from gate output — confirms the 3 business nodes are the live versions. No new token sink beyond the
  driver's one-per-turn live reformulator.
