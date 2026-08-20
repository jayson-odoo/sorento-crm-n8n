# Node diff — a pick is authoritative; it must not depend on text re-resolution

**Date:** 2026-08-21 · **Target:** clone `txiPzSxy3Pclsz6v` (`0ffa7fd9` → `a93f4d82`), node `disallowed-entity-gate`, one hunk (plus a label tweak). Live untouched.
**Spotted by the captain** in exec 13245182: *"isn't it a bit sus, it didn't say here is what you want for customer"*.

## Cause

Picking option 2 (`YOO LIVING HOUSE [A/C III] - PRICETAG`) sent that **display label** to the resolver as a token. The CRM matched nothing for it — `by_entity_type` came back with products only, and even `unresolved_tokens` was empty — so the picked customer silently disappeared from `compatible_entities`. `If3` then correctly refused to answer (a customer was named and none survived), and the reply listed only the product, which is what looked wrong.

The flaw is structural: the roster row carries the uuid the customer chose, but the spine still re-resolved its label as free text, and that label's canonical code is a synthetic debtor id (`DBR-59e57de1b7`) the CRM cannot match back.

## The change

Before the pinned-pick filter runs, any pinned entity the resolver dropped is **re-seated** into `compatible_entities` from the pick itself (uuid, hint, code). Type-checked against `ALLOWED[domain]`, and the uuid can only come from a roster this flow rendered, so nothing unvetted enters. The existing family-expansion filter then applies unchanged.

Second, smaller fix: the re-seated row is labelled with the entity's `raw` (the roster label the customer saw) whenever its canonical code is synthetic (`DBR-…` or a bare uuid), because the renderers print `code` verbatim — the first run said `• customer: DBR-59e57de1b7`. Products keep their canonical code.

## Acceptance (console, clone `a93f4d82`, zero egress)

| step | before | after |
|---|---|---|
| picker → `2` (`… - PRICETAG`) | customer vanished; reply named only the product | `• product: SRTWC286-SH-200 (+9 more)` and `• customer: YOO LIVING HOUSE [A/C III] - PRICETAG`; that account genuinely has no matching order, and the reply now says so against the right scope |
| picker → `1` (`YOO LIVING HOUSE`) | already worked | unchanged — resolves by text, family-expanded |

## Note

The gate behaved correctly throughout — it refused rather than answering with the wrong scope. The bug was upstream of it: a pick should never have to survive fuzzy text matching to stay alive.
