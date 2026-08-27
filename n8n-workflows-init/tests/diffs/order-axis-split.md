# Node diff — customer, product and transporter are independent filters in the order domain

**Date:** 2026-08-21 · **Targets:** parser fork `wI5RkNGW3EOJfBdo` `output_exchange` (`580ffe5b` → `34ec3f55`) and clone `txiPzSxy3Pclsz6v` `disallowed-entity-gate` (`a93f4d82` → `94276249`).
**Spotted by the captain** in fork exec 13246777: *"why is customer dropped here, that's kind of random"*.

## Cause — deterministic, not random

`AXIS_BY_DOMAIN.order` mapped **every** order hint to one axis:

```js
order: { order, order_number, customer_order, customer, transporter, product } → all 'order_scope'
```

The entity-op executor keeps prior entities only on axes this turn did NOT name:

```js
keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)));
```

So naming a product evicted the carried customer — they occupied one filter slot, although in the query they AND together. Re-typing `customer yoo living delivery status for srtwc286` (the LLM re-emits the customer as carried, the product as current) therefore lost the customer and answered **20 orders across other companies** (spine exec 13246769). Same leak class as the original If3 fault, reached by a third route.

Two other things had to change for the turn to end up correct:

1. **Carried-vs-renamed keys (`output_exchange`).** `_ceKey` collapses to `canonical_code || raw`, so one entity keys differently once resolved: prior state held the picked customer as `customer|dbr-59e57de1b7` while the LLM re-emitted `customer|yoo living house [a/c iii] - pricetag`. The sets never intersected, so the eviction pass saw an un-renamed carry. The carried test now compares on BOTH forms (`_ceKeysOf`); `_ceKey` itself is untouched, since the pick-provenance sets key on it.
2. **Carried picks are still authoritative (`disallowed-entity-gate`).** The re-seat added on 2026-08-21 only covered this-turn pins, so a customer picked two turns ago still had to survive text re-resolution — and its `DBR-…` label does not. Re-seating now covers any entity carrying a uuid. The RESTRICT/family filter stays keyed on this-turn pins, so a carried row can never narrow a freshly named scope.

## Acceptance (console + uac, fork `34ec3f55` / clone `94276249`, zero egress)

| step | before | after |
|---|---|---|
| picker → `1` → retype the same question | customer evicted → **20 orders, other companies** | customer kept; the retyped ambiguous name re-asks the picker, no rows served |
| picker → `2` (`… - PRICETAG`) → retype | same leak | scoped correctly, no leak |
| `Customer Mastiles Klang Srtwc286 August delivery` (uac) | — | unchanged: If3 TRUE, did-you-mean, zero rows |
| `Customer Mastile Klang Srtwc286 August delivery` (uac) | — | unchanged: exactly order `202608-2349`, MASTILE only |

## Trade-off

A customer scope now survives a follow-up that names only a product, instead of being dropped. That is stickier — a later product-only question inside the same enquiry keeps the customer until a new enquiry or a domain change clears it. Given three separate leaks caused by a customer silently disappearing, sticky is the safer direction.
