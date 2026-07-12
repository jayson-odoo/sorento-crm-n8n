# CRM-003 — Orders MCP tool: add an `order_status` (outstanding / delivered) filter

**Component:** CRM MCP server — the **orders** query tool (serves `order_enquiries`), endpoint `http://72.62.195.20:8765/mcp`
**Type:** Enhancement
**Owner:** CRM backend / MCP agent
**Reported:** 2026-07-05
**Status:** DONE — CRM tool deployed + n8n shipped to live 2026-07-05. Validated: delivered→Picked Up/In Transit ×20, outstanding→New Order ×18 (disjoint), null→unfiltered.

---

## Summary

Users want to ask for their **outstanding orders** — orders that have **not been delivered yet** (e.g. "check my outstanding orders", "orders not delivered yet", "pending deliveries", "belum hantar").

The chatbot parser will emit a new signal `order_status` and the n8n get-results agent will pass it to the **orders MCP tool** as a filter argument. **This ticket = the orders MCP tool must accept that argument and filter the result set accordingly.** No response-shape change; same order records, just filtered.

## New argument

Add an optional argument to the orders query tool:

```
order_status : "outstanding" | "delivered" | null   (default null = no filter, current behaviour)
```

- `"outstanding"` → return only orders **not yet delivered** to the customer.
- `"delivered"` → return only orders **already delivered**.
- `null` / omitted → no status filter (return all, exactly as today).

The argument is combined (AND) with the existing filters already passed (`order_ids`, `customer_ids`, `date_filter_start/end`, etc.).

## What "outstanding" / "delivered" means — **please confirm the predicate**

The CRM owns the definition; we need you to pin it. From the current tool output, an order row carries a `Status` and an `Actual Delivery Date`, and these are **not** always consistent (observed: `Status = "New Order"` with an `Actual Delivery Date` populated). So a naive `actual_delivery_date IS NULL` check is **not** reliable.

Proposed definition (please confirm or correct):
- **delivered** = order `Status` is in the terminal delivered set — e.g. `{Delivered, Completed, Closed}` (whatever your canonical "handed to customer" statuses are).
- **outstanding** = **NOT** delivered — i.e. `Status NOT IN (delivered set)`. This includes `New Order`, `Processing`, `Picked Up / In Transit`, etc. (in-transit counts as outstanding — not yet delivered).

If there is a cleaner canonical flag/column for "delivered" (a boolean, a delivery-confirmation timestamp, a specific status value), use that and tell us — we'll align the definition in the reply to the customer.

## Acceptance criteria

1. Tool accepts `order_status` = `"outstanding"` → returns only not-yet-delivered orders (for the same contact/customer/date scope).
2. `order_status` = `"delivered"` → returns only delivered orders.
3. `order_status` omitted / `null` → identical to current behaviour (no regression).
4. Filter ANDs with existing `order_ids` / `customer_ids` / `date_filter_*` args.
5. Response shape unchanged (same fields incl. `Status`, `Actual Delivery Date`).
6. Document the exact predicate used for "delivered" so the chatbot wording can match.

## Context — how the signal arrives

1. Parser emits `order_status: "outstanding"` in the turn's semantic output (n8n side — separate, not this ticket).
2. n8n get-results agent forwards it to the orders MCP tool as the `order_status` argument (n8n side).
3. Orders MCP tool filters — **this ticket**.

## Example

- User: "check my outstanding orders for NURTECH"
- Tool call: orders tool with `customer_ids=[<NURTECH>]`, `order_status="outstanding"`
- Expected: only NURTECH orders whose status is not in the delivered set.

## Open question for CRM

- Confirm the canonical "delivered" status set / flag, and whether `Picked Up / In Transit` should count as outstanding (our assumption: **yes**, still outstanding until final delivery).
