# Node diff — a pick covers the same accounts the picker measured

**Date:** 2026-08-21 · **Target:** clone `txiPzSxy3Pclsz6v` (`604ed814` → `3264b594`), nodes `disallowed-entity-gate` + `compile-current-state`. Live untouched.
**Captain:** *"why we say got delivery but when we choose, there is no delivery?"* (execs 13256193 → 13256248).

## Cause — my own two pieces disagreeing

| step | scope used | result |
|---|---|---|
| picker probe | the whole account family (`[A/C I]`, `[A/C III]`, `[A/C IV]`…) | 18 July rows → **"— has delivery"** |
| the pick | re-resolves the label `A CRAFT IDEA SDN BHD (SRT)`, which matches exactly ONE account (`300-A056`) | no July row → **"No delivery on 2026-07-01 to 2026-07-31"** |

Family expansion could not help: it expands using the CURRENT turn's resolver rows, and on a pick turn the resolver only sees the one label it was handed. The YOO LIVING case worked by luck — every account there shares one display name, so the family came back anyway.

## The change

The gate now records, on the picker turn, which uuids each rendered candidate stands for (`picker_families`: base → uuids). `compile-current-state` persists it beside `picker_last_result_set` and carries it on the same lifetime. On the pick turn the gate reads it back and re-seats the picked candidate's whole family, so the answer covers exactly the accounts the probe counted.

Subtlety worth keeping: those re-seated uuids are absent from the current turn's resolver output, so the pinned-pick RESTRICT filter (which resolves rows via `flat`) would have dropped them again — they are explicitly exempted (`_famAdded`).

## Acceptance (console, clone `3264b594`, session reset between runs, zero egress)

| step | before | after |
|---|---|---|
| `customer a craft delivery status in july` | picker: `A CRAFT IDEA SDN BHD (SRT) — has delivery` | unchanged |
| then `1` | *"No delivery on 2026-07-01 to 2026-07-31"* — contradicted the picker | **`202607-4500`, A CRAFT IDEA SDN BHD [A/C I], delivered 29/07** and the rest of the July rows |

## Test hygiene

The chat console shares one contact, so a previous pick leaks into the next test — the first re-run never reached the picker because the parser re-emitted the earlier customer as carried. Session was reset between runs with a disposable webhook → `UPDATE respond_contacts_test SET session_vars = seed_session_vars` (n8n_test copy only), **deleted immediately after use** (verified 404). `zz-reset-437` is archived and cannot be PUT.
