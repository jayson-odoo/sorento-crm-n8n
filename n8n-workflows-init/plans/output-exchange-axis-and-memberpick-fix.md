# Plan — `output_exchange` deterministic fixes: order-axis alias + member-pick digit-mining

> **STATUS: SHIPPED** — ABCDE applied to live `XTODTw` output_exchange, verified byte-identical to offline-tested patch, published (active `292faed2`). Offline replay (real captured inputs) all-pass: 3 bugs fixed, 3 no-regression. Change E (below) added during review.

## Change E — reuse + current_message:false + no prior strips valid entities (exec 6947964)
Fresh turn, LLM extracted `syntalun`(customer)+`cks319`(order) but flagged both `current_message:false` and `entity_op:"reuse"`. The reuse branch returned empty prior → entities dropped. Fix: broaden the reuse-correction to also fire when entities are present but prior is empty (mark them current, promote to replace_combine). Regression-safe: superset of the existing `current_message===true` guard; does not fire on genuine continuation reuse (prior non-empty).


**Target node:** `output_exchange` (Code) in reformulator **`XTODTw-dJcV0uRdC056hG`**.
**Scope:** two independent deterministic bugs, same node → one `update_workflow` + one `publish_workflow`.
**Hard rule:** reformulator is pure-parse, zero egress. Safe to edit live (still publish after — drafts don't auto-run).

---

## Bug 1 — stale `customer_order` carries into a new order query (exec 6947729)

### Symptom
Prev turn: order `SMC202606-0115` (reconciled hint `customer_order`). This turn: `"One siew srtkt72-ss already delivered?"`. Output entities ended up = `[srtkt72-ss(order), SMC202606-0115(customer_order)]` → search ANDs the new value **with** the old DO → wrong.

### Root cause
`AXIS_BY_DOMAIN.order` and `HINT_AXIS_DEFAULT` define `order`/`order_number` but **not** `customer_order`. So a carried `customer_order` entity lands on a private axis `__customer_order`, never collides with a current entity → never replaced → **sticky forever**.

### Fix (Changes A + B)
**A.** `AXIS_BY_DOMAIN.order` — add `customer_order: 'order_scope'`:
```js
order: {
  order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',  // ← added
  customer: 'order_scope', transporter: 'order_scope', product: 'order_scope',
},
```
**B.** `HINT_AXIS_DEFAULT` — add `customer_order: 'order_scope'` (belt-and-suspenders):
```js
customer: 'order_scope', transporter: 'order_scope', order: 'order_scope',
order_number: 'order_scope', customer_order: 'order_scope',  // ← added
```

### Regression analysis
- Blast radius = **order-domain entity merge only**. `customer/product/transporter/order` already share `order_scope` and already replace each other across turns; `customer_order` simply joins them — consistent, not a new behavior class.
- Non-order domains unaffected: their `DOMAIN_BLOCKED_HINTS` already drop `customer_order`/`order`, so the entity never reaches axis logic there → `HINT_AXIS_DEFAULT` addition is inert outside order.
- Runs at hint-time (before `resolve-entity` reconcile), so it keys off the LLM hint — correct for this case.
- **Known trade-off:** same-domain order continuations now *replace* instead of *stack* (turn1 "order SMC…", turn2 "…with product X" → product replaces DO). This already happens for customer↔product in order domain today; `customer_order` now behaves the same. No corpus case relies on stacking DO + filter across turns.

### Explicitly NOT doing
- No prompt change. "one siew" capture is unfixable generically: a name-vs-quantity rule (`"One Siew"` vs `"one water basin"`) regresses quantity parsing, and naming it a customer is Sorento overfit. Accepted limitation; future = clarify-when-uncertain downstream, not a parser rule.
- `demand_qty:1` mis-parse is cosmetic (`demand_qty` unused downstream).

---

## Bug 2 — member-pick override mines digits from entity codes (exec 6942378)

### Symptom
Prev turn: member_offer (escalation list, `selection_context="member_offer"`). This turn: `"any incoming for CKS315"` (a fresh incoming query). LLM parsed it correctly (`domain=incoming`, entity `CKS315`, `correction=false`). The Δ3 member-pick block then forced `correction=true`, `escalation.member_reprompt="out_of_range"` → routed to re-offer instead of get-results.

### Root cause
The `_extract` fallback:
```js
if (c.length === 0 && t.split(/\s+/).filter(Boolean).length <= 4) (t.match(/\d+/g) || []).forEach(n => c.push(Number(n)));
```
For `"any incoming for cks315"` (4 words ≤ 4), `t.match(/\d+/g)` over the whole string grabs **`315` out of `CKS315`** → `_pos=[315]` → out of member range (maxIdx=5) → `member_reprompt:'out_of_range'` + `correction=true`. The intended "new question → leave normal" branch never fires.

### Fix (Change C primary, Change D hardening)
**C (primary).** Tighten the fallback to **standalone numeric tokens only** — never mine digits embedded in alphanumeric codes:
```js
if (c.length === 0 && t.split(/\s+/).filter(Boolean).length <= 4) {
  t.split(/\s+/).forEach(w => { if (/^#?\d+$/.test(w)) c.push(parseInt(w.replace(/\D/g, ''), 10)); });
}
```
`"cks315"` fails `^#?\d+$` → not extracted → `_pos` empty → falls to "new question → leave normal" → LLM's correct parse (`correction=false`) survives → routes to get-results.

**D (hardening, optional).** Abandon the member offer up-front when the turn is clearly a new business query, before extraction:
```js
const _o = output.output;
const _isNewQuery = _o.domain_hint
  && Array.isArray(_o.entities) && _o.entities.some(e => e.current_message === true)
  && _o.is_affirmative !== true;
if (!_isNewQuery) {
  // ... existing _extract + member-pick branches ...
  _o.member_pick_context = true;
}
// _isNewQuery → user pivoted; leave the LLM parse untouched
```
Protects against a future standalone-number collision (e.g. `"any incoming for 12"`).

### Regression analysis
- **C:** legit picks unaffected — bare `"2"` caught by the first `^#?\s*\d+$` branch; `"#2"`, `"option 3"`, ordinals all caught by earlier branches. Only loses digits embedded in words, which is the intended behavior. Low risk.
- **D:** a genuine member pick (bare number / affirmative) has no `domain_hint` + no current entity → `_isNewQuery=false` → pick logic still runs. Guard only fires on a clear new query. Low risk. `member_pick_context` left unset on abandon (visibility flag only; normal processing wanted).

---

## Rollout
1. Edit `output_exchange` jsCode via `update_workflow` — Changes A, B, C (+ D if approved).
2. **`publish_workflow XTODTw-dJcV0uRdC056hG`** (drafts don't auto-run — see [[publish-after-update-workflow]]).
3. Verify each via a controlled run on own contact (445239384 / 437264483), read the reformulator's `output_exchange` output:
   - **Bug 1:** order→order continuation that leaves a `customer_order` DO, then names a new order-scope value → assert stale DO **absent** from `entities`.
   - **Bug 2:** member_offer context, then a fresh query whose entity code contains digits (e.g. `"any incoming for CKS315"`) → assert `correction=false`, no `member_reprompt`, routes to get-results.
4. Regression spot-checks: (a) bare `"2"` member pick still resolves to a member; (b) single order query still resolves; (c) order→incoming switch still drops the order entity via blocklist.

## Deferred (separate)
- Tier-based low-confidence clarify (use resolver `match_tier`/`similarity`) — handles over-broad fuzzy matches + the "one siew" capture via clarify, no prompt nudging. Own plan.
