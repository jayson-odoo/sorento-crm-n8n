# Node diff — the customer picker says which company actually has the delivery

**Date:** 2026-08-21 · **Target:** clone `txiPzSxy3Pclsz6v` (`94276249` → `604ed814`). Three NEW nodes + one edited node. Live untouched.
**Captain:** *"can we be like photo attachment, incoming, go and search whether has the delivery based on the filter that we have, like product, date etc, forward pass to see whether got result and attach to say Yoo living - has delivery."*

## Result

```
customer yoo living delivery status for srtwc286
→ Which customer do you mean? Please choose:
  1. YOO LIVING HOUSE — has delivery
  2. YOO LIVING HOUSE [A/C III] - PRICETAG — no delivery
```

Verified against reality: picking 1 returns 8 orders carrying SRTWC286; option 2 has none.

## Shape — a copy of the incoming lane, not a new invention

The `incoming` picker already probes and annotates: `If-incoming-picker → probe-incoming → annotate-incoming-picker → build-suggest-offer`. The customer picker now has the same three nodes on the branch that previously went straight to `not-found-error-message`:

`If-incoming-picker[false] → If-customer-picker → probe-customer-orders → annotate-customer-picker → build-suggest-offer`, with `If-customer-picker[false] → not-found-error-message` (every non-picker miss turn keeps its old path byte-for-byte).

- **`probe-customer-orders`** — a copy of `probe-incoming` pointed at `crm_order_management_orders_list`, fed `customer_probe_entities`. One grouped read per picker turn, never one per candidate.
- **`annotate-customer-picker`** — the `annotate-incoming-picker` body with the order row's `Customer` field and the picker's base-name rule. Display-only: `compatible_entities`, and therefore the roster the next pick resolves against, is untouched.
- **`disallowed-entity-gate`** — emits `customer_probe_entities`: every candidate's **whole account family** (by canonical code) plus the non-customer scope of the turn (the product, and the date filters ride the semantic input). The family matters: a representative uuid alone probed the wrong rows and every line came back `no delivery` (exec 13250405), because YOO LIVING HOUSE's orders sit on a sibling account.

## Honesty rules in the annotation

- The probe returns a capped page (20). If the result set is capped, a candidate that did not appear is **unknown**, not empty — those lines render BARE rather than a confident wrong "no delivery". Same rule the did-you-mean probe uses for unprobed codes.
- When nothing matched at all (uncapped), the reply adds "None of these have a matching delivery." so the customer is not left guessing why every line is negative.

## Disclosure — flagged for the captain

The annotation reveals, for companies the asker did **not** pick, whether they have an order matching the product/date filters. The picker already discloses their names (unavoidable for disambiguation); this is one step further into their data. It is one hunk to remove (`If-customer-picker[true]` → `not-found-error-message`) if that is not wanted.

## Acceptance (console + uac, clone `604ed814`, zero egress)

| case | result |
|---|---|
| `customer yoo living delivery status for srtwc286` | picker annotated `has delivery` / `no delivery` (exec 13250564) |
| then `1` | 8 orders, YOO LIVING HOUSE only — pick path unchanged |
| `any incoming for srtwc286` | incoming picker still annotated `has/no incoming` — its lane untouched |
| misspelled customer + product (uac) | If3 TRUE, did-you-mean, zero rows |
| `Customer Mastile Klang Srtwc286 August delivery` (uac) | exactly order `202608-2349`, MASTILE only |

No forbidden or orphaned egress node ran; the probe is an MCP read.

## Promote (HELD)

Adds three nodes, so this is the largest promotion surface of the set: the live spine needs the same three nodes plus the `If-incoming-picker[false]` rewire, and `disallowed-entity-gate` is drifted on live. Promote after the rest.
