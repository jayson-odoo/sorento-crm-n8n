# Promotion hotfix — "no promotion matched" + tier ask skipped (2026-08-18)

Captain repro: contact 487555417 ("Mr Loo") → "Srtwc8066-SH promotion" → live reply
"Here's what you want: product SRTWC8066-SH-MK (+2 more). But no promotion matched these. Would you like me to
escalate to marketing_promotion team?" — live spine exec **12907178**, downstream tool call **12907191**.

## Root cause (proven from execution data + node params)

Turn flow on the live spine `9qVyfUxmRQqrpGRMDLRuz` @ `efa21057` (all from `GET /executions/12907178?includeData=true`):

| step | node | evidence |
|---|---|---|
| parse | `Call 'sub-query-reformulator'` | `check_promotion / promotion`, entities `[Srtwc8066-SH]`, `access_levels []`, no pick flags |
| resolve | `resolve-entity` | AND-mode intersection = SRTWC8066-SH-{MK,MW,MG}, company Sorento, brand SORENTO — **not a product-code problem** |
| tool | `tool-filter` | `name = crm_marketing_promotions_list` (correct) |
| tier | `tier-gate` | `tier_ask:true`, `entitled_tiers [dealer,office,end_user]`, `pending_pick:false` — the ask was **correctly** wanted |
| probe | `tier-probe` ×3 (sub-execs **12907187/88/89**) | tool `crm_marketing_promotions_list` ✓, per-tier levels ✓, 3 product uuids ✓ → CRM `has_result:false, items:[]` for dealer, office AND end_user |
| route | `tier-probe-collect` → `if-tier-has-any` | `tier_any_available:false` → FALSE branch (D14 rule: only ask when some tier has rows) |
| **bug** | `Call 'sub-get-results'` (sub-exec **12907191**) | `tool` param is `={{ $json.name }} `. On the `if-tier-has-any` FALSE edge, `$json` is `tier-probe-collect`'s output = tier-gate passthrough whose `name` is the contact's ACCESS-LEVEL NAME ARRAY → tool sent as `"Sorento Office,Sorento Dealer,Mocha Dealer,Mocha Office,Cabana Office,Cabana Dealer,End User "` → CRM MCP `Unknown tool: …` → `has_result:false` → not-found renderer |

So, the three captain observations:

1. **Wrong tool name** — `Call 'sub-get-results'` `tool = $json.name` is only right on the `if-tier-ask` FALSE edge (item = tool-filter output). On the `if-tier-has-any` FALSE edge it resolves to the access-level array. `tool-filter` executes upstream on both edges, so `$('tool-filter').first().json.name` (what `tier-probe` already uses) is the correct expression. `contact_id` on both `Call 'sub-get-results'` and `tier-probe` carries a literal trailing space (`"487555417 "`) — harmless today only because `entity-ids-transformer` in the sub `.trim()`s it; stripped in the same fix.
2. **"No match despite promotion"** — the three *correctly-formed* probes AND direct re-calls of the CRM (`test_workflow` on `rysSPgUssLDf6xJc`, execs 12914009 [dealer], 12914111 [no access filter], 12914246 [control contact 477071889], 12914286 [no contact scope], 12914505 [`crm_marketing_promotion_products_list`]) all return **0 rows for product uuids ce66dcdc/6c7876e7/89d540da (SRTWC8066-SH-MK/MW/MG)**. Company scope is NOT the blocker (browse for 487555417 returns 100 promotions incl. Sorento + Mocha, exec 12914763). ⚠️ The CRM has no promotion product-line linked to these three uuids. After the tool fix the bot will still (honestly) say no promotion for them unless the CRM links one — captain to confirm which promotion is expected to carry SRTWC8066-SH.
3. **Access-level ask skipped** — by design (access-tier-ask-plan D14 / `tier-probe-collect`): the ask is suppressed when no entitled tier has rows, to avoid "pick a tier → nothing found". Not a mis-detected pick (`pending_pick:false`). It is a *symptom* of (2). Ask fires normally when a probe finds rows (verified post-fix, below).

## Regression check — NOT a regression from today's promote

Param-sha of the tier lane, pre-promote backup (`tests/backups/brand-company-routing/LIVE-PROMOTE-20260818/9qVyfUxmRQqrpGRMDLRuz.json`, `d6f6b90c`) vs live (`efa21057`):
`tool-filter c9132d9a=c9132d9a`, `tier-gate 01221585=01221585`, `if-tier-ask 8cbb47da=8cbb47da`, `tier-probe-plan d03b54b0=d03b54b0`, `tier-probe 66453480=66453480`, `tier-probe-collect f52ea6dc=f52ea6dc`, `if-tier-has-any a1dc6f29=a1dc6f29`, `Call 'sub-get-results' 20c657a4=20c657a4`, `access-level-choice-message`, `If4` identical. Sub targets identical (both already pointed `Call 'sub-get-results'`/`tier-probe`/`probe-incoming` at `rysSPgUssLDf6xJc`). The bug pre-dates today's promote (it shipped with the tier-ask lane, D14 fallback edge).

## `rysSPgUssLDf6xJc` ("sub-get-results TEST") as the live target — not the cause

Node-by-node vs the published `Fss5aAaXthJSWpZCgKiKR`: identical except `entity-ids-transformer` (rys adds `contact_id.trim()` + `space_id="364817"`) and `output-structurer`. Both call the same MCP endpoint/tool. The probes through rys were well-formed and the CRM answered them; the empty result is CRM-side data, not the sub. NOTE: rys currently has an **unpublished draft** (`versionId 6f0a6c7a ≠ activeVersionId 5780d2c8`, updated 2026-08-18T03:06Z — after the repro) — someone is editing the sub the LIVE spine calls; flagged, not touched here. Whether live should be re-pointed to `Fss…` is a separate cleanup, deliberately out of this minimal hotfix.

## Where the fix is built

The default clone `txiPzSxy3Pclsz6v` does **not** contain the tier lane (tier-gate/tier-probe*/if-tier-* absent). The lane's build clone is the fork **`RnpxEnAV3g20MmKj` (sorento-consume-main PROMO-PICKER)**, driver `zz-canary-run PROMO-PICKER` `M5m6EYDLdSc0ofto` (webhook `zz-run-promo-picker`); guarded (sendmsg → `sub-sendmsg-CHAT ublq9nSlrpz63xan` test-guard, HI → `vUfFUDjLAuMaeQE6`, get-results → CS-BUILD `t4QvrtrPnTwRU6br`, egress nodes orphaned). Same 3-leaf bug present there (`tool = $json.name`).

PRE-fix repro on the fork (uac mode, real CRM reads, `previous_conversation_state {}`): exec **12915145** → probes 12915164/66/67 (correct tool, 0 rows) → fallback sub-exec **12915168** `tool = "Sorento Office,…,End User "` → `Unknown tool` → identical reply. Egress log: `would_send`/`would_write`/`would_log` only.

## Fix (3 leaves; live promotion payload = same 3 leaves on `9qVyfUxmRQqrpGRMDLRuz`)

- `Call 'sub-get-results'` › `workflowInputs.value.tool`: `={{ $json.name }} ` → `={{ $('tool-filter').first().json.name }}`
- `Call 'sub-get-results'` › `workflowInputs.value.contact_id`: strip trailing space
- `tier-probe` › `workflowInputs.value.contact_id`: strip trailing space

Diff: `tests/diffs/promotion-hotfix-tier-tool.md`. Backups: `tests/backups/promotion-hotfix-20260818/`.

## POST-fix verification (fork)

(filled below)
Fork published `2063daa8 → 8d13d386` (draft==active, only the 2 nodes' params differ vs PRE, connections identical). Evidence: `tests/runs/promotion-hotfix-20260818.json`.

| case | exec | result |
|---|---|---|
| exact repro "Srtwc8066-SH promotion" | **12915340** | probes 12915356/57/58 correct → 0 rows; fallback sub-exec **12915360** now `tool=crm_marketing_promotions_list`, `contact_id="487555417"` (clean) → CRM `has_result:false` → same honest not-found reply (CRM has no promo lines for these uuids — see root cause §2) |
| ask fires, "SRTBF11710 promotion" | 12915382 | probes dealer/office/end_user all true → `access-level-choice-message` renders the 3-tier ask ("has promotion" annotations), get-results not run, state `selection_context: tier_offer` |
| ask fires, "CWC7606-SH promotion" | 12915402 | dealer/office true, end_user false → ask renders "3. End user - no promotion" |
| pick "2" (Dealer) with carried state | 12915440 | `tier_stated [dealer]`, recomposed `[Sorento Dealer, Mocha Dealer, Cabana Dealer]`, sub call tool/contact clean → **CABANA COMBINE PROMO DEALER_08072026.pdf** returned, 1 attachment (`would_send`) |

Zero egress held on every run: `sub-sendmsg-CHAT` execs ran only `[When Executed by Another Workflow, chat?, test-guard, test-guard-record]`; files/session writes logged as `would_send`/`would_write`; live spine never driven.

## Promotion payload (captain-gated — NOT applied)

On live `9qVyfUxmRQqrpGRMDLRuz`, one `update_workflow` with 3 `setNodeParameter` ops (see `tests/diffs/promotion-hotfix-tier-tool.md`), then publish + sha-verify the two nodes; targets (`rysSPgUssLDf6xJc`) unchanged. Rollback = republish `efa21057` (backup in `tests/backups/promotion-hotfix-20260818/LIVE-9qVyfUxmRQqrpGRMDLRuz-efa21057-PRE.json`).
