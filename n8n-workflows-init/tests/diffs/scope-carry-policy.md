# Node diff — carried scope in the order domain

**Date:** 2026-08-21 · **Target:** parser fork `wI5RkNGW3EOJfBdo` `output_exchange` (`34ec3f55` → `fb71a10d`). Live untouched.
**Captain:** *"if you ask me, i think the product retention is a bit dangerous."*

## Why it was dangerous

Since customer and product stopped sharing one axis (the fix that closed the leak), scope the turn did not name survives. That is right for a follow-up and wrong for a restatement — and it is **invisible**: a successful answer prints "Here are the orders I found" with no statement of what it filtered by. A carried product silently narrows the result, so a short list, or *"No delivery on 2026-07-01 to 2026-07-31"*, reads as ground truth. It also feeds the picker probe, whose `has delivery` / `no delivery` annotations are computed under the same carried filters.

## The rules now in force (order domain)

| turn shape | carried scope |
|---|---|
| names nothing (`and in september?`, `any promotion for it`) | **kept** — this is what `reuse` is for |
| names a new entity (`what about customer yoo living`) | **dropped**, except the customer (below) |
| domain changes AND the turn names entities | **dropped entirely** |
| names a new value on an axis | replaced, as before |

**The exception, and why it exists.** A carried CUSTOMER survives a product-only follow-up (`what about srtwc8318`). Dropping it would turn that turn into a product-only order query, which enumerates every customer who bought the product — the exact exposure `If3` closed this morning. A newly named customer still replaces it through the axis rule.

Scoped to the `order` domain deliberately: `product_attachment`'s "and the technical drawing?" must keep reusing the product, and that carry is untouched.

One implementation note: the LLM frequently returns a null `domain_hint` for a short follow-up (the domain is inherited later), so the rule judges on the **effective** domain — current or prior. Keyed on the LLM's value alone it silently never fired (exec 13258638).

## Acceptance (console, fork `fb71a10d`, zero egress)

| case | result |
|---|---|
| `…delivery for srtwc286 in august` → `what about customer yoo living` | `scope_cleared_on_new_entity: 1`; entities = the new customer only. Was: product carried |
| `…delivery for srtwc286 in august` → `what about srtwc8318` | entities = `srtwc8318` + `mastile klang` (customer kept — the exception) |
| `srtwc286-sh photo` → `technical drawing` | `product_attachment` unchanged: `technical drawing` + carried `SRTWC286-SH` |
| `srtwc286-sh stock` → `any promotion for it` | pure reuse still carries the product |

## Still open

Answers do not state the scope they used, so a legitimate carry remains unannounced. The captain chose not to add a scope line to the answer renderer for now; if a carry ever misleads again, that is the fix.
