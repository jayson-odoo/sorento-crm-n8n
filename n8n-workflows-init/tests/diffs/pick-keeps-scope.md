# Node diff — a customer pick narrows WHO, not WHAT

**Date:** 2026-08-20 · **Target:** parser fork `wI5RkNGW3EOJfBdo`, node `output_exchange`, ONE hunk (`8c35dad3` → `580ffe5b`). Live parser untouched.
**Reported by the captain:** *"i was asking yoo living delivery status for srtwc286, it shown me all without the product"* (exec 13214595).

## Cause

The positional-pick path builds entities from the picked roster rows and assigns `output.output.entities = [...resolved]` — replacing the whole set. Answering the "Which customer do you mean?" picker therefore discarded the rest of the question. Proven from the parser sub-execution: the session carried `[yoo living (customer), srtwc286 (product)]` into the pick turn, and the parser emitted only `[YOO LIVING HOUSE (ordinal 1)]`, so the query ran customer-only and returned every order for that customer.

## The hunk

A block (C) beside the existing block (B) — which already re-attaches `attachment_type` from the prior turn for the `product_attachment` domain. When the picked rows include a **customer** (`hint === 'customer'` with an `ordinal`), every prior entity of a DIFFERENT type is re-attached as `current_message`. The customer itself is deliberately not carried: replacing it is the point of the pick. Deduped on `hint|canonical_code||raw`, so a scope the pick already names is never doubled.

Non-customer picks (product disambiguation, attachment classes, promo picker) are untouched — the block requires a picked customer row.

## Acceptance (console, fork `580ffe5b`, zero egress)

| step | result |
|---|---|
| `customer yoo living delivery status for srtwc286` | picker: YOO LIVING HOUSE / YOO LIVING HOUSE [A/C III] - PRICETAG |
| then `1` | entities = **picked customer + srtwc286** (was: customer only). 8 orders, YOO LIVING HOUSE accounts only, every one carrying an SRTWC286 variant |

## Related but NOT this fault — the captain's second report

`yoo living delivery status for srtwc286` (exec 13214527, reproduced as 13215004) answered with ONE STOP HOME DESIGN and other companies. Different cause, upstream of every gate: the parser LLM emitted only `[srtwc286]` and never extracted "yoo living" at all (`_parser_raw` confirms it), so the turn was a product-only order query — which by current design enumerates across customers (the plan's deferred D-G policy). No gate can catch it: `If3`'s customer term needs a customer entity, and the ambiguity picker needs customer matches. Adding the explicit word "customer" made the same sentence parse correctly. Fixing it means deciding D-G: an order query naming no customer should ask for one rather than list everybody's orders.
