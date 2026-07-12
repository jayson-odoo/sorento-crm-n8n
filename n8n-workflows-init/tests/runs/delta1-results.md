# Δ1 catalog refactor — clone characterization results (2026-06-28)

Clone `txiPzSxy3Pclsz6v`. Applied via GET→mutate→PUT (backup: scratchpad/backup-clone-pre-delta1.json).
Change: 7 escalate Set nodes → `branch_kind` tag-setters; new `escalate-catalog` Code node; rewire
EF→catalog→compile; `compile-current-state` 7-arm ladder → 2-way catalog/central-exchange read.
EF (attachments) + EF2 (not_allowed_check_stock) untouched (verified).

## Per-branch: PRE-Δ1 baseline vs POST-Δ1 (egress would_send.message / save-session-vars)

| branch_kind | PRE run | POST run | result |
|---|---|---|---|
| clarify_menu | canary-clarify-20260628b | canary-clarify-post | ✅ byte-identical (menu) |
| escalate_offer | canary-escoffer-20260628 | canary-escoffer-post | ✅ identical ("…escalate to purchasing team?") |
| demand_qty | canary-demandqty-20260628 | canary-demandqty-post | ✅ identical ("Please specify your demand quantity") |
| out_of_scope | §3 uac3-escalation (20260627) | canary-oos-post | ✅ identical — includeResponse=false preserved: sendmsg message=null, user_response omitted, variables.response=note, human-intervention would_write agent=general_enquiries team=customer_service |
| not_supported | §4 canary-not-supported | canary-nsd-post | ✅ identical (canned reply) |
| not_found | §5 (20260627) | canary-notfound-post | ✅ identical — dynamic ref pulled via catalog ("Could not find master_products for ZZ-0000…") |
| access_choice | §6 (contact TBD) | — | ⏳ not run (no partial-access contact); offline-covered; same Code-fed dynamic-ref pattern as not_found (verified) |

## Safety (every run)
- sendmsg-sub: would_send (blocked) only. human-intervention (oos): would_write (blocked) only.
- save-session-vars: would_write (blocked). No real egress. S1–S5 hold.

## Offline layer
- tests/unit/delta1-catalog.test.js: GREEN (catalog == old ladder, all 7 + require_specific variant).
- Literals cross-checked vs actual Edit Fields node strings.

## Remaining gate
- access_choice live case (needs partial-access contact §6).
- Broad replay over the ~600 golden: expect diffs ONLY on the 7 retagged setters + new catalog node;
  compile-current-state output + egress must be identical. Happy-path (central-exchange) coverage comes from here.
