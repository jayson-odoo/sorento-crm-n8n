# Node diff — every picker roster survives, not just the customer one

**Date:** 2026-08-20 · **Target:** clone `txiPzSxy3Pclsz6v` (`a2c71918` → `0ffa7fd9`), node `compile-current-state`, ONE hunk. Live untouched.
**Captain:** *"I need the roster survives, same goes for product attachment, incoming, all needs to survive unless there is new enquiry or change domain which is also new enquiry."*

## The change

The persistence block was gated on the roster being all-customer rows. That gate is dropped: **any** `require_specific` picker now persists — the customer picker plus the `incoming` and `product_attachment` choose-lists ("*incoming search needs to be more specific. Multiple matches found. Please choose:*"), which were previously wiped by their own answer exactly like the customer one was.

Fields renamed to match the wider scope: `cust_last_result_set` → `picker_last_result_set`, `cust_pick_domain` → `picker_domain`. Nothing outside this block reads them (both were introduced today and are not promoted).

Lifetime is unchanged and is the captain's rule verbatim: born on the picker turn, carried while the domain is unchanged and the customer typed no new entity, dropped on a new enquiry or a domain change.

## Acceptance (console, clone `0ffa7fd9`, zero egress)

| step | result |
|---|---|
| `any incoming for srtwc286` | 10-line incoming picker with the has/no-incoming annotations |
| then `1` | stock detail for SRTWC286-SH-200 |
| then `5` — **re-pick after an answer** | SRTWC286-SH-UF with container WHSU6225891 / ETA 2026-08-06. Previously impossible: the answer had overwritten the roster |
| then `all` | `reference_positions: [1…10]`, `select_all_expanded: true`, all ten product entities; roster still held (10 rows, `disambiguation`) |
| then `any promotion for srtwc8318` (domain change) | roster cleared, hands over cleanly to the tier ask (`selection_context: tier_offer`) |
| customer picker flows | unchanged from the previous rev — pick, re-pick, `all`, clear-on-new-enquiry all still pass |

## Promote (HELD)

One behaviour with the persistent-roster, pick-keeps-scope and freshness hunks; promote them together. `compile-current-state` is drifted on live, so the hunk re-applies onto a fresh live GET.
