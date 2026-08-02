# Plan — incoming-stock allocation flags (🚩 PENDING / PARTIAL ALLOCATION)

Status: **Phase C PROMOTED LIVE, dark** — 2026-08-02, live `sub-get-results`
`Fss5aAaXthJSWpZCgKiKR` @ `47053482-aa3f-4ef6-8d62-c1846b78cc6a` (was `e30963a3`). The
renderer is INERT until the CRM side emits the flags: today's envelope carries only
`flags:{discontinued,expired}`, so `it.flags.unallocated` is `undefined` → falsy → no badge.
Verified against the published live code, both directions. Fork `rysSPgUssLDf6xJc` @ `deac5efa`
carries the same hunk. Phases A+B with the CRM agent. · authored 2026-08-02

⚠️ **Dark-launch consequence:** there is now NO further n8n gate. The moment CRM deploys
phases A+B, the badge appears in live customer replies. The exact wording is locked to
`🚩  *(PENDING ALLOCATION)*` / `🚩  *(PARTIAL ALLOCATION)*` — change it here before A+B land,
not after.

⚠️ **Contract is fail-silent.** The renderer keys off the exact item-level booleans
`flags.unallocated` and `flags.partially_allocated`. If the CRM presenter ships different key
names, different nesting, or strings instead of booleans, the badge silently never fires — no
error anywhere. Confirm the key names with the CRM agent before their deploy.

✅ **Contract CONFIRMED from the CRM side, 2026-08-02.** Phases A + B are built on CRM branch
`feat/incoming-allocation-signal` (repo `sorento_crm`), test-first, not yet merged or deployed.
The presenter emits, per item, `flags: {discontinued, expired, unallocated, partially_allocated}`
— four real booleans, mutually exclusive on the last two — and a `Unallocated Quantity` field
carrying the number, present ONLY on the partial case. Matches renderer cases C1-C6 as published.

**One amendment to Phase A, decided before build:** hop 1 emits `unallocated_quantity` (the GAP),
NOT the `quantity_shipped` base. `remaining_incoming_quantity` (= shipped - received) is already
public, so shipping the base as well lets any consumer derive `quantity_received` — the one thing
the incoming-stock rules forbid, stated three times across `incoming_stock_service.py`,
`schemas/incoming_stock.py` and `api/v1/incoming_stock.py`. The backend now does the arithmetic
itself, against the same warehouse-allocation rows it renders, and publishes only the remainder.
Nothing downstream of hop 2 changes: the envelope, the flags and the badge are as published.

Verified against real dev data — RPACC on shipment FJ25476991 (shipped 69, allocated 2) renders
`partially_allocated: true` + `Unallocated Quantity: 67`; a second RPACC line with no allocation
renders `unallocated: true` and no quantity field.

## Goal

Incoming-stock answers must tell the customer when an incoming quantity is **not yet
allocated to a warehouse** (i.e. not yet claimed by a salesperson), and when it is only
**partially** allocated. Rendered with a red-flag badge, in the same shape as the existing
`⚠️ *(PRODUCT DISCONTINUED)*` badge.

## Finding: where does the DISCONTINUED emoji come from?

**Not from CRM/MCP.** Verified 2026-08-02 against both repos:

| layer | what it does | evidence |
|---|---|---|
| CRM backend | emits `is_discontinued: bool` on the row | `schemas/`, `services/` |
| CRM MCP presenter | maps it to a per-item **boolean flag**, no text, no emoji: `"flags": {"discontinued": bool, "expired": bool}` | `sorento_crm_mcp/sorento_crm_mcp/presenters.py:170-180`, set at `:354, :375, :395, :452` |
| n8n `sub-get-results` (`Fss5aAaXthJSWpZCgKiKR`) → node **`output-structurer`** | renders the emoji + label | `if (it.flags && it.flags.discontinued) line += '\n⚠️  *(PRODUCT DISCONTINUED)*';` |

So the house design is: **MCP owns the truth (boolean flag), n8n owns the presentation
(emoji + wording).** The allocation flag follows exactly that split.

Renderer note: live `sub-get-results` runs the deterministic path only —
`trigger → entity-ids-transformer → MCP Client1 → output-structurer`. The `AI Agent` /
`output_exchange` pair is still present but has **no main input**, i.e. dead. Only
`output-structurer` needs the change. If the AI-Agent path is ever revived, its system
prompt would also need the flag (it hand-rolls `is_discontinued` in the JSON schema).

## The four hops (read this before arguing about "the shape")

Two different payload shapes exist and are easy to conflate. `view=render` is applied
**inside the MCP dispatcher, after** the backend responds
(`sorento_crm_mcp/sorento_crm_mcp/server.py:1499-1503`):

```python
_view = q.pop('view', None)
_resp = await _execute_tool_request_with_body(_spec, client, _pp, q, body)   # raw backend JSON
_resp = await _attach_suggested_escalation(...)
if _view == 'render':
    _resp = _present_response(_spec.name, _resp)                             # envelope built here
return _resp
```

```
hop 1 — backend HTTP (RAW row shape)                     ← phase A changes this
  {"data": [{ "product_code": "SRT-123",
              "remaining_incoming_quantity": 60,
              "unallocated_quantity": 40,          // NEW — the GAP, never the shipped base
              "warehouse_allocations": [{"warehouse_code":"BRW","allocated_quantity":60}] }]}
  // null when there is nothing to flag: no allocations at all, fully allocated, or
  // over-allocated (clamped). AS BUILT — supersedes the "quantity_shipped" draft below.

hop 2 — _present_response() / presenters.py               ← phase B changes this
  consumes hop 1, derives the flags. n8n never sees hop 1.

hop 3 — render envelope (what n8n actually receives)
  {"items": [{ "title": "SRT-123",
               "fields": [ …, {"label":"Unallocated Quantity","value":40} ],
               "flags": {"discontinued":false,"expired":false,
                         "unallocated":false,"partially_allocated":true} }], …}

hop 4 — n8n output-structurer                             ← phase C changes this
  "🚩  *(PARTIAL ALLOCATION — 40 not allocated)*"
```

Two consequences:

- Hop 1 is **still a live output shape**, not an internal detail: `view=render` is OPT-IN and
  the AI assistant still reads raw (`presenters.py` docstring). Adding `unallocated_quantity`
  there is purely additive — no raw consumer breaks — and it is the reason the field is the
  gap rather than the base: the AI assistant reads hop 1 and must never be able to state, or
  compute, how much has already been received.
- Only a flag pair and one label/value cross into hop 3. The envelope stays markdown-free
  and channel-agnostic, exactly as `flags.discontinued` does today.

## Trap — do NOT compare allocated against `remaining_incoming_quantity`

Naive rule `sum(allocated_quantity) < remaining_incoming_quantity` is **wrong**, because the
two numbers have different bases:

- `remaining_incoming_quantity = GREATEST(quantity_shipped - quantity_received, 0)`
  (`incoming_stock_service.py:52-55`, `_remaining_expr()`).
- `allocated_quantity` = `SUM(SPOAllocation.allocated_quantity)` where `> 0`, grouped by
  warehouse (`incoming_stock_service.py:86-131`). Allocation is against **`quantity_shipped`**
  and is not decremented as goods are received.

On a partially-received line, `sum(alloc)` can equal or exceed `remaining` while real
unallocated stock still exists — or vice versa.

→ The correct base is **`InboundShipmentLine.quantity_shipped`** (`models/procurement.py:172`).
Backend ships that base; the comparison is then safe.

## Pre-flight check results (run 2026-08-02)

**Check 1 — does anything downstream key off the `Warehouse Allocations` field?** No.
Live spine `9qVyfUxmRQqrpGRMDLRuz` (101 nodes, `versionId a40cd16d`) has **zero** matches for
`Warehouse Allocations` / `warehouse_alloc`. The only `allocat` hit is node
**`not-supported-domain`**, an IF testing `domain_hint == "spo_allocation"` → routes to
NOT SUPPORTED. Nothing branches on the field's presence or value. Field-set change is safe.

> Side finding, out of scope: a **direct** allocation question (parser tags
> `domain_hint = spo_allocation`) currently dead-ends as "not supported". This badge only
> answers allocation *passively*, riding on an incoming-stock query. Worth a separate ticket.

**Check 2 — what is the allocation base, and is it already exposed?** Base confirmed as
`quantity_shipped`. Better: the line **already carries the allocated total**:

- `InboundShipmentLine.spo_allocated_quantity` (`models/procurement.py:182`, Integer, default 0)
  — "Total SPO allocated qty for this product on this shipment (all warehouses)"
  (`schemas/procurement.py:144`).
- Maintained by `InboundShipmentService.refresh_shipment_line_statuses()`
  (`procurement_service.py:714-749`), which re-sums `SPOAllocation` per product and rewrites
  `spo_allocated_quantity`, `quantity_received`, `line_status`. Called from **14 sites** —
  every SPO allocation create/update/delete/move (`:1385, :1433, :1451, :1453, :1462, :1480,
  :2248, :2271`), shipment create/update (`:841, :872, :909`), packing-list GET
  (`api/v1/procurement/packing_lists.py:105`), external SPO API
  (`api/v1/external/spo_allocations.py:262`).
- `line_status` already encodes the semantics
  (`compute_inbound_shipment_line_status`, `procurement_service.py:222-243`):
  `alloc == 0 → "in_transit"`, `qty > alloc → "partially_allocated"`, else
  `allocated` / `partially_received` / `received`.

Consequences for the build:

1. **Phase A shrinks to adding columns to a SELECT.** All three incoming queries already have
   `InboundShipmentLine` in the FROM (`incoming_stock_service.py:225-245`, `:574`, `:658`).
   No new join, no new aggregate query.
2. **Do not key the flags off `line_status`.** `"in_transit"` is overloaded — it is both the
   `alloc == 0` case and the function's fallback return (`:243`). Ship the numbers.
3. **Do not trust `spo_allocated_quantity` for the badge arithmetic either.** It is a
   denormalised column; anything writing `spo_allocations` outside the service (Excel sync,
   direct SQL) can drift it. Instead the presenter sums the **same `warehouse_allocations`
   rows it is rendering** — the badge then can never contradict the visible list. The only
   thing backend must add is the **base**, `quantity_shipped`.

## Design

Two new per-item boolean flags on the MCP render envelope, mutually exclusive:

```jsonc
"flags": { "discontinued": false, "expired": false,
           "unallocated": true,          // zero allocation
           "partially_allocated": false } // some, but not all
```

Rendered by n8n as, appended after the item's fields (same position/format as the
discontinued badge):

```
🚩  *(PENDING ALLOCATION)*
🚩  *(PARTIAL ALLOCATION — 40 of 100 unallocated)*
```

The partial badge's numbers come from the envelope, not from n8n arithmetic — see the
`unallocated_quantity` field below.

**Field behaviour unchanged**: when `warehouse_allocations` is empty, `_wh_alloc()` returns
`""` and `_Builder.item` drops the `Warehouse Allocations` field entirely
(`presenters.py:171`, `_filled`). Keep that. The badge carries the signal; adding a `"—"`
row as well is noise. (Open choice — flip if the user wants uniform row shape, precedent
exists at `presenters.py:454-462` where stock rows force `"—"`.)

## Work, in dependency order

Each phase is independently deployable. n8n ignores unknown flags, and MCP flags default
false, so there is no broken intermediate state whichever ships first.

### Phase A — CRM backend: publish the allocation gap (repo `sorento_crm`) ✅ BUILT

`sorento_crm_backend/app/services/incoming_stock_service.py`

As built (amended from "expose the base" — see the amendment note at the top):

1. `InboundShipmentLine.quantity_shipped` added to the SELECT of all three incoming queries.
   No new join — the table was already in the FROM. The column is read INTERNALLY only; it is
   never placed on a payload.
2. New module-level `_unallocated_quantity(quantity_shipped, allocations)` derives the gap
   against the SAME allocation rows the payload renders, so the number can never contradict the
   visible list. Returns `None` — nothing to flag — for: no allocations (the empty list is the
   signal), fully allocated, and over-allocated (clamped, never a negative gap).
3. All three payload builders emit `"unallocated_quantity": _unallocated_quantity(...)` next to
   `remaining_incoming_quantity` / `warehouse_allocations`: `incoming_for_product` (shipments[]),
   `incoming_list` (lines[]), `shipment_incoming_products` (products[]).
4. Key mirrored on `app/schemas/incoming_stock.py` — `IncomingShipmentForProduct` and
   `IncomingProductInShipment`, `Optional[int] = None`.
5. Tool descriptions updated so the docs stay truthful and the router can reach the signal:
   `services/mcp_tool_capability_service.py` (both incoming intents, plus two allocation-shaped
   `typical_user_questions` and the `unallocated incoming stock` / `pending allocation` aliases)
   and `sorento_crm_mcp/sorento_crm_mcp/catalog.py` (both incoming ToolSpecs, including how the
   signal appears under `view=render`).

Not needed, as predicted by pre-flight check 2: no change to `_warehouse_allocations_for()`, no
new aggregate query, no use of `spo_allocated_quantity` or `line_status`.

Tests — `sorento_crm_backend/tests/test_incoming_allocation_gap.py`, written RED before the
implementation, 11 cases across all three methods: zero allocation, partial, fully allocated,
over-allocated clamp, multi-warehouse sum, the partially-received regression guard (shipped 100 /
received 60 / allocated 40 → gap 60, NOT "fully allocated" as a remaining-based rule would say),
and an explicit assert that `quantity_shipped` / `quantity_received` never appear on a payload.
Existing `test_incoming_list.py` + `test_incoming_by_product_eta_filter.py` still pass (22 total).

### Phase B — CRM MCP presenter: set the flags (repo `sorento_crm`) ✅ BUILT

`sorento_crm_mcp/sorento_crm_mcp/presenters.py`

1. `_Builder.item(...)` — add `unallocated=False, partially_allocated=False` kwargs, emit
   them into `flags` alongside `discontinued`/`expired` (`:170-180`). Also update the
   envelope docstring at `:12`.
2. Helper — reads the backend's gap, decides nothing numeric itself (AS BUILT):

```python
def _alloc_state(row: Any) -> tuple[bool, bool, Any]:
    """(unallocated, partially_allocated, gap)."""
    if not isinstance(row, dict):
        return False, False, None
    if not (row.get("warehouse_allocations") or []):
        return True, False, None          # empty list IS the signal; no number to show
    gap = row.get("unallocated_quantity")
    try:
        gap = int(gap)
    except (TypeError, ValueError):       # missing / null -> nothing to claim
        return False, False, None
    return False, gap > 0, (gap if gap > 0 else None)
```

3. Wired into both incoming builders: `_incoming_list` (item built from `l`) and
   `_incoming_by_product` (item built from `s`). `_incoming_shipments` is shipment-level,
   carries no allocations — out of scope, and its items now simply carry both flags false.
4. `("Unallocated Quantity", gap)` appended to the field list of both builders — `None` on the
   pending / fully-allocated cases so `_filled` drops the row (a literal `0` would render).

The `except (TypeError, ValueError)` branch makes Phase B safe to deploy before Phase A: without
the gap only the zero-allocation flag fires, and no partial is ever guessed from
`remaining_incoming_quantity` (the wrong base).

Tests — `sorento_crm_mcp/tests/test_presenters.py`, written RED first, 4 new cases: the
three-line list (fully allocated / pending / partial, asserting the field is present ONLY on the
partial and that `discontinued` survives), the missing-gap-key forward-compat case, the
by-product equivalent, and shipment-level rows carrying both flags false. Full MCP suite: 186 pass.

### Phase C — n8n: render the badge ✅ BUILT

Build target: the clone's fork **`rysSPgUssLDf6xJc` (`sub-get-results TEST`)** — verified as
the workflow all three clone callers (`Call 'sub-get-results'`, `probe-incoming`,
`sibling-probe`) point at, so live `Fss5aAaXthJSWpZCgKiKR` is never touched during build.
Fork was confirmed **param-identical to live** (8/8 nodes, connections equal) before layering,
so the promote diff is exactly this hunk and nothing else.

Node **`output-structurer`**, item loop. Two lines added after the existing two badges:

```js
if (it.flags && it.flags.discontinued) line += '\n⚠️  *(PRODUCT DISCONTINUED)*';
if (it.flags && it.flags.expired)      line += '\n⚠️  *(PROMO EXPIRED)*';
if (it.flags && it.flags.unallocated)            line += '\n🚩  *(PENDING ALLOCATION)*';   // NEW
else if (it.flags && it.flags.partially_allocated) line += '\n🚩  *(PARTIAL ALLOCATION)*'; // NEW
```

**Deviation from the original design — the badge carries no number.** An earlier draft
interpolated `— N not allocated` into the partial badge. Dropped, because `Unallocated
Quantity` also renders as a normal field line, so the number would appear twice; suppressing
the field would have coupled the generic renderer to a specific field label. Now the field
carries the number and the badge carries the signal — exactly the discontinued pattern, where
the badge is a bare marker. It also sidesteps the "N of M" reconciliation trap: the visible
`Incoming Quantity` is `remaining_incoming_quantity` while the gap is measured against
`quantity_shipped`, so no total is ever quoted.

`else if` because the two flags are mutually exclusive — belt-and-braces if the presenter ever
sets both (covered by test C6).

Applied via MCP `setNodeParameter` on `/jsCode`, NOT REST PUT: the public API rejects the
stored `settings` shape (`availableInMCP`, `binaryMode`, `callerPolicy` → *"settings must NOT
have additional properties"*), and a PUT with a trimmed settings block would have silently
dropped them. Draft was diffed against intent before publishing — exactly 2 lines added,
0 removed, no collateral node changes, connections and settings intact.

Published: `rysSPgUssLDf6xJc` @ `deac5efa-dbdb-488a-89c4-7cd5bfc3feda`.

Backups (REST GET, so credential *references* survive a restore — no secrets are in workflow
JSON, only `{id, name}`):
- `n8n-workflows-init/backups/live-getresults-e30963a3-20260802.json`
- `n8n-workflows-init/backups/fork-getresults-99703003-20260802.json` ← pre-change fork

## Verification / UAC

Pre-flight: **both checks run 2026-08-02, both clear** — see "Pre-flight check results" above.
No downstream consumer of the field; base confirmed as `quantity_shipped`.

#### Renderer tier — DONE, all green (2026-08-02)

Harness `n8n-workflows-init/tests/renderer/alloc-badge-harness.js` runs the **deployed**
`output-structurer` code (pulled from n8n via REST into `deployed-structurer.js`, not a local
copy) against pinned envelopes. Zero egress, zero tokens, instant. `node alloc-badge-harness.js`.

| case | assertion | result |
|---|---|---|
| C1 | fully allocated → no badge | PASS |
| C2 | `unallocated:true` → PENDING, no PARTIAL | PASS |
| C3 | `partially_allocated:true` → PARTIAL + `Unallocated Quantity` field, no PENDING | PASS |
| C4 | `discontinued` + `unallocated` → both badges | PASS |
| C5 | no `flags` key at all (pre-Phase-B MCP) → no badge, no crash | PASS |
| C6 | both alloc flags true → exactly one badge (PENDING) | PASS |
| C7 | mixed list → badge lands on the right item only | PASS |
| NEG | strip the badge lines → C2 assertion **fails** | PASS |

C5 is the deploy-order guard: it proves the fork is safe to run today, before the CRM side
emits any flag. NEG is the `green-that-cannot-fail` discipline — the suite was proven able to
fail before its green was trusted.

#### Live-envelope tier — DONE, all green (2026-08-02)

The tier above proves the renderer's LOGIC against hand-built envelopes. This one proves the CRM
presenter actually emits that shape: same deployed `output-structurer`, fed **real envelopes
captured from the live CRM MCP server** (`localhost:8765` → live backend → dev database, branch
`feat/incoming-allocation-signal`). No fixtures anywhere in the chain.

- `tests/renderer/capture-live-envelopes.py` — calls the MCP tools over Streamable HTTP with
  `view=render` and writes `live-envelopes-20260802.json`. Re-run after any presenter change.
- `tests/renderer/live-envelope-harness.js` — `node live-envelope-harness.js`.
- `deployed-structurer.js` re-pulled and confirmed **byte-identical** to live
  `Fss5aAaXthJSWpZCgKiKR` @ `versionId 47053482` (4339 chars both sides) before the run.

| case | live data | assertion | result |
|---|---|---|---|
| L1a | RPACC @ FJ25476991, shipped 69 / allocated 2 | PARTIAL badge + `Unallocated Quantity: 67`, no PENDING | PASS |
| L1b | RPACC @ TGBU9807730, no allocation | PENDING badge, no quantity line, no PARTIAL | PASS |
| L1c | same envelope, 2 items | exactly 2 items, exactly 2 badges — no bleed between items | PASS |
| L1d | same | `Warehouse Allocations: BRW (2)` still renders beside the badge | PASS |
| L2 | `crm_incoming_stock_by_product`, same product | both badges on the product-rooted shape | PASS |
| L3 | `crm_incoming_stock_shipments`, July ETA window | shipment-level rows never badge | PASS |
| L4 | SRTKT1831SS, shipped 267 / allocated 267 | no badge, no `Unallocated Quantity` line | PASS |
| L5 | L1 wrapped in the MCP `content[]` array | renders identically — `findPayload` unwraps it | PASS |
| NEG | badge lines stripped from the deployed code | badges vanish, fields survive | PASS |

Rendered L1, verbatim from the deployed node:

```
1. *Product Code:* RPACC
*Shipment:* FJ25476991
*Container:* TIIU4090481
*Estimated Arrival Date:* 2025-11-11
*Incoming Quantity:* 69
*Warehouse Allocations:* BRW (2)
*Unallocated Quantity:* 67
🚩  *(PARTIAL ALLOCATION)*

2. *Product Code:* RPACC
*Container:* TGBU9807730
*Estimated Arrival Date:* 2026-07-19
*Incoming Quantity:* 1
🚩  *(PENDING ALLOCATION)*
```

Not covered here, no live source: an item carrying BOTH `discontinued` and an allocation flag —
the incoming builders never set `discontinued`. Case C4 above covers it synthetically.

The partially-received regression case (gap vs `quantity_shipped`, not `remaining`) is pinned on
the CRM side instead, in `tests/test_incoming_allocation_gap.py` — it needs a constructed row.

#### Clone tier — still open

The above exercises MCP → envelope → deployed renderer. It does NOT exercise the clone's own
`sub-get-results` wiring end to end. Run that on the clone in `uac` mode (zero egress per
`tests/UAC.md` §0) once phases A+B deploy, with a real incoming question through the spine.

## Rollback

- Phase C **fork** (`rysSPgUssLDf6xJc`): restore `output-structurer.jsCode` from
  `n8n-workflows-init/backups/fork-getresults-99703003-20260802.json`, republish. Or simply
  delete the two badge lines — nothing else changed.
- Phase C **live** (`Fss5aAaXthJSWpZCgKiKR`): not yet promoted, nothing to roll back. Once
  promoted, restore from `n8n-workflows-init/backups/live-getresults-e30963a3-20260802.json`.
  Restore via MCP `setNodeParameter`, not REST PUT — see the Phase C note on the settings schema.
- Phase A/B: additive keys + flags defaulting false — reverting the MCP deploy alone
  removes the badge; no data migration.

## Promote checklist (user-gated, blocked on A+B)

1. CRM phases A+B deployed; confirm a real `view=render` call returns `flags.unallocated`.
2. Run the end-to-end tier above on the clone in `uac` mode.
3. Re-diff fork vs live at promote time (per `stale-byte-identical-fork-claim`) — build the
   live target as **live + this hunk**, never by copying the fork wholesale.
4. Apply to live `Fss5aAaXthJSWpZCgKiKR` by node NAME via MCP `setNodeParameter`, then
   `publish_workflow`.
