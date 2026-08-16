# Run log — cross-domain-stock-incoming (clone build)

Date 2026-08-03. Target: clone `txiPzSxy3Pclsz6v` ONLY. Live spine `9qVyfUxmRQqrpGRMDLRuz` never written
(verified: live `updatedAt` 2026-08-02T23:34:18Z, predating this session; all live calls read-only).
Drive: `POST /webhook/zz-run-hint` (zz-canary-run), mode `uac`, contact 437264483.

## Zero-egress (§0)
Every run's egress rows were guards only — `would_log` / `would_write` / `would_send`
(+ `human-intervention-sub` guard on the escalation-confirmation run). No real send, no prod write.

## RED baselines (captured from REAL runs before any edit)
- xd-red-1 `Pls check eta SRTWT5800` → reproduced the customer screenshot exactly.
- xd-red-2 `check stock SRTWT5800` → 6 stock rows, **564 pcs total** (BRW 317, BRW-NTC 236, BRW-AM 7, BRW-IR 4,
  BRW-BB 0, BRW-RSV 0) — the goods the ETA query hid.
- xd-red-3 `check stock SRTWC286-SH-NEW-200` → D2 miss; product actually has 200 pcs incoming (ETA 2026-07-22).
- xd-red-4 partial turn → `No stock records found for: SRTWT5800.`, state `Previous turn (incoming): returned 1 records`.

## Results
| case | verdict |
|---|---|
| X1 incoming miss → on-hand above sibling picker | PASS |
| X2 both empty (post-(d)) | PASS — no block, today's message |
| X3 inventory miss → incoming (D2 path) | PASS |
| X4 / X11a partial incoming | PASS — #3 line byte-identical, phrase in BOTH strings |
| X11b partial, 2 missing products | PASS — `…: SRTWT5800, SRTWT5800-FH.` |
| X5 partial inventory | PASS |
| X6 "yes" reconciles | PASS — `is_escalation_confirmation:true` + HI guard |
| FP2 phrase reworded → no escalation | PASS (fails on purpose) |
| FP3 shadow perturbation detected | PASS (gate has teeth) |
| FP1 soft-failed probe → byte-identical | PASS (after decision (d); earlier "pass" was a FALSE PASS) |
| X9 container-only / X10 fully answered | PASS — byte-identical no-ops |
| Shadow equality (pre-hoist, 5 turns) | PASS — all `agree:true`, then gate deleted as tautological |

## Not yet run
X7 (decline after partial), X8 (number-pick still resolves to the sibling).

## Landmines confirmed this run
1. **Post-publish race** — a run fired right after a write can execute the previous version and return the
   pre-change message. Produced a FALSE PASS on FP1. Rule: discard the first run after any write.
2. **Empty envelope ≠ absence** — `sub-get-results` returns the same empty envelope for "nothing there" and
   "read failed". Drove decision (d).
3. **Send node reads `$('compile-current-state')` BY NAME** — rewiring alone was inert. Live needs the same
   repoint at promote or the feature ships invisible.
4. REST: GET does not redact credentials; PUT auto-publishes; PUT `settings` schema is narrower than storage
   (`{executionOrder, callerPolicy}` accepted, server preserves the rest). S-CRED re-verified after each PUT.
