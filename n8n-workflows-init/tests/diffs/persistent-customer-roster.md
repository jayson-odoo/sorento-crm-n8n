# Node diff — the customer picker list survives the answer, and a pick answers that company

**Date:** 2026-08-20 · **Target:** clone `txiPzSxy3Pclsz6v` (`bcc24f17` → `47490b90`). Two nodes: `compile-current-state`, `disallowed-entity-gate`. Live untouched.
**Captain, from the console:** *"the list doesn't persist like promotion? like i choose 4 5 6 7 8, then i want to choose 4, cannot? i prefer the list to persist just like promotion tier ask though, until the next enquiry or domain change."*

## What actually happened (execs 13212372 / 407 / 465)

The picker itself was fine: the 8-customer roster persisted, and `4 5 6 7 8` multi-selected correctly (five customer entities, each with its `ordinal` and uuid). The failure came next: the **answer overwrote `last_result_set` with its own 20 order rows**, so the following `4` resolved against *that* — order #4, `RMA-PS2608-0029` — instead of customer #4. Nothing was lost by preferring the customer roster: that order-row pick just re-printed a row already in the list.

A second defect surfaced once the roster did persist: picking `4` (`SIGNATURE BUILDING MATERIAL SDN BHD`, uuid pinned) still answered about **KL BUILDING MATERIALS**, because the gate re-resolves the picked NAME as text and "BUILDING MATERIAL" fuzzy-matched nine customers (exec 13212841).

## The hunks

**1 · `compile-current-state` — the roster outlives the answer.** Same shape as the existing `dym_last_result_set`: the roster is kept in its own field (`cust_last_result_set` + `cust_pick_domain`) and, while alive, re-seated as `last_result_set` with `selection_context: 'disambiguation'`, so the **existing** positional machinery keeps resolving picks against customers. No parser change, no new lane.
Lifetime, exactly as asked: born on the picker turn; carried while the domain is unchanged and the turn named no freshly-typed entity; dropped on a new enquiry or a domain change. "Freshly typed" is detected by pick provenance — picked rows carry `ordinal`/`dym_slot`, typed ones do not.

**2 · `disallowed-entity-gate` — a pinned pick beats fuzzy re-resolution, and selects the family.** An entity carrying a uuid came from a roster pick, so the customer already said which row they meant. That entity's TYPE is now restricted to the pinned rows — extended to the pinned row's whole **account family** by base name, since the captain's rule is that a pick answers the company: picking `SIGNATURE BUILDING MATERIAL SDN BHD` keeps `300-S292/S293/S294` (`[A/C I]/[III]/[IV]`) and drops KL BUILDING MATERIALS, KOW HOCK, MKH, TEK WEE and TROPICANA, which merely share words. Other entity types (the product, the date scope) are untouched, and it fails open if any pinned uuid did not survive resolution.
The block sits **before** the `#9 multi-company routing` section on purpose: placed after it, the escalation note was still computed from the pre-pin spray and read *"TEK WEE…, KL BUILDING MATERIALS…, KOW HOCK… are carried by more than one company"* on a turn that had already narrowed to one. `_custName`/`_custBase` are hoisted so the picker and the pin can never disagree about what "the same company" means.

## Acceptance (console, clone `47490b90`, zero egress)

| case | result |
|---|---|
| `delivery for custome signature` | 8-company picker, one numbered list |
| then `5` | orders for SIGNATURE CABINET only |
| then `6` — **the captain's ask** | re-picks from the SAME list: SIGNATURE DISTRIBUTION, correctly scoped |
| then `4` | SIGNATURE BUILDING MATERIAL `[A/C I] (+2 more)` — the whole family, no KL/TEK WEE/MKH; clean single-company escalation note |
| then `Customer Mastile Klang Srtwc286 August delivery` | roster cleared (`cust_last_result_set` absent), answer is exactly order `202608-2349` — blessed case intact |
| misspelled customer + product ×2 (uac) | unchanged: If3 TRUE, customer did-you-mean, zero rows |

No forbidden or orphaned egress node ran in any run.

## Trade-off to know about

While a customer roster is alive, a bare number picks a **customer**, not a row from the answer list — that is the captain's stated preference, and the order-row pick returned no information the list did not already show. A new enquiry or a domain change restores normal behaviour.

## Promote (HELD, captain-gated)

Both nodes are drifted between clone and live, so both hunks re-apply onto a fresh live GET and re-review against that base — never a body copy. Ships after the earlier ambiguous-customer picker, which it depends on.
