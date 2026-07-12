# Plan — reconcile stored entity `hint` to CRM `entity_type` at session-save (stale cross-domain carryover fix)

> **STATUS: PLANNED — docs only. No workflow edited, no execution run.**
> **Scope tag:** `parser` (see §7 — the fix lives in a deterministic spine node, but its *observable* effect is a turn-2 `output_exchange` axis-eviction that the `mock_reformulator_output` bypass hides, so acceptance requires a REAL 2-turn reformulator run — LESSON 28).
> **Target node (fix):** `compile-current-state` (Code) on the clone `txiPzSxy3Pclsz6v` → promotion target = the live spine node of the same name on `9qVyfUxmRQqrpGRMDLRuz`, user-gated.
> **Build/test fork:** clone `txiPzSxy3Pclsz6v`. Zero egress (see §9).

---

## 0. LOUD FLAG — the task premise is WRONG on the live graph (corrected here)

The change request states: *"There is NO hint-reconciliation … nothing writes [CRM entity_type] back onto `entity.hint`."*

**That is not true of the current clone.** `compile-current-state` **already contains** a `reconcileEntities(parserEntities, resolverJson)` function that rewrites `hint = match.entity_type` and stores the result as `variables.entities` (→ next turn's `previous_conversation_state.entities`). The bug is **not** a missing reconcile — it is a **reconcile that silently no-ops for the exact match class this bug lives in.**

**Evidence (live clone exec `7654198`, a real `promotion` AND-mode turn for token `"Srtwc8504"`):**
- `Call 'sub-query-reformulator'` output entity: `{raw:"Srtwc8504", hint:"product", canonical_code:null, current_message:true, confident:true}` — **NO `uuid`, NO `ordinal`, `canonical_code:null`.**
- `resolve-entity` returned 6 product matches in `intersection[]`, each `{entity_type:"product", canonical_code:"SRTWC8504-RL-…", uuid:…, display:{via_token:"Srtwc8504"}}`.
- `compile-current-state.variables.entities` came out **byte-unchanged** — `reconcileEntities` matched nothing, because its AND-mode branch matches only `norm(canonical_code)===raw || norm(product_name)===raw`, and `"srtwc8504" ≠ "srtwc8504-rl-p"`. The authoritative link — `display.via_token === "Srtwc8504"` — is never consulted.

**Consequences that reshape the chosen fix:**
1. **A `uuid`-join is not directly possible.** Parser/stored entities carry **no `uuid`** for typed-code / brand / fuzzy resolutions (only positional picks and member picks get a `uuid` — see `output_exchange` line ~303). So "match by uuid against `compatible_entities`" as literally described **cannot be the join key** for the class this bug is in. The reliable join key is **the parser's own raw token ↔ the resolver match's `via_token` (OR-mode: `resolutions[].token`)**, from which the CRM `entity_type` is read.
2. The fix is therefore **an upgrade to the existing `reconcileEntities`**, not a net-new reconcile: add a `via_token` / `token` match so brand / fuzzy / AND-mode / variant resolutions reconcile the hint. Same node the request already targets (`compile-current-state`), same intent ("persist CRM-truth hint"), corrected mechanism.

---

## 1. Root cause (confirmed read-only via MCP — do not re-investigate)

Two-turn stale-entity drag, e.g. turn 1 an `incoming` query that resolves `SRTWCX7405-S…` as a **product**, turn 2 `"SRTWT165-QT has stock?"` (`inventory`/`master_products`) → get-results queries SRTWT165-QT **plus** the stale SRTWCX7405 → "Could not find inventory for SRTWT165-QT SRTWCX7405-S-289UF-PJ SRTWCX7405-S…".

Causal chain, each link verified:

1. **Store (turn 1):** `compile-current-state.reconcileEntities` fails to rewrite the entity's `hint` (raw ≠ canonical_code; via_token not consulted — §0). The entity is persisted to `session_vars.variables.entities` **with its stale parser hint** (`"incoming"`, or any non-CRM-type token).
2. **Round-trip:** `pg-upsert-session` (regress modes) / prod PUT (uac) writes `JSON.stringify(compile-current-state output)`; next turn `Call 'sub-query-reformulator'` reads `previous_conversation_state = get-session-vars.session_vars.variables`. So `variables.entities` **is** next turn's `previous_conversation_state.entities`. (Chain: `central-exchange → compile-current-state → session-save-gate → pg-upsert-session`; connection verified.)
3. **Merge (turn 2), inside the reformulator fork `CpxE8LroLzCkrAQN` › `output_exchange`:** the `replace_combine` executor keeps prior entities whose **axis** is not among the current turn's axes: `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))`. `axisOf(e)` keys off `e.hint`:
   ```
   axisOf = (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`
   ```
   A stored hint of `"incoming"` is in **neither** `AXIS_BY_DOMAIN[<turn-2 domain>]` **nor** `HINT_AXIS_DEFAULT` → falls to the private fallback **`__incoming`**. The current product entity's axis is `product_scope`. `__incoming ∉ {product_scope}` → **stale entity KEPT** and unioned into the query.
4. **Blocklist does not save it:** `DOMAIN_BLOCKED_HINTS[inventory]` = `[customer, transporter, order, customer_order, order_number, spo, grn, goods_receive, inbound_shipment]` — it does **not** list `incoming` (nor `product`). So the stale entity survives the blocklist too. The ONLY thing that would have evicted it is the axis merge — which its stale hint defeats.

**Why the fix works:** if turn 1 stores the entity with the CRM-truth hint `"product"`, then turn-2 `axisOf` → `HINT_AXIS_DEFAULT["product"] = "product_scope"` (or `AXIS_BY_DOMAIN[<domain>].product` where defined) → **`product_scope ∈ currentAxes` → evicted.** The merge runs inside the reformulator BEFORE resolve-entity, so the correction must be present in the *stored* state from the prior turn — exactly what a session-save-time reconcile delivers.

---

## 2. The fix — upgrade `reconcileEntities` in `compile-current-state`

**Current (broken) body — the AND-mode branch only:**
```js
// AND-mode (or OR-mode that didn't token-match): by the record's own value
if (!match && intersection.length) {
  match = intersection.find(m =>
    norm(m.canonical_code) === raw ||
    norm(m.display?.product_name) === raw
  ) || null;
}
```

**Proposed replacement — one flat match pool, token/via_token-first, then code/name; covers OR-mode `resolutions`, AND-mode `intersection`, and `by_entity_type`:**
```js
function reconcileEntities(parserEntities, resolverJson) {
  if (!Array.isArray(parserEntities)) return parserEntities || [];
  const norm = s => String(s || '').toLowerCase().trim();

  const resolutions  = Array.isArray(resolverJson?.resolutions)  ? resolverJson.resolutions  : [];
  const intersection = Array.isArray(resolverJson?.intersection) ? resolverJson.intersection : [];
  const byType = (resolverJson?.by_entity_type && typeof resolverJson.by_entity_type === 'object')
    ? Object.values(resolverJson.by_entity_type).flat() : [];

  // flat pool: every match carries entity_type; tag OR-mode matches with the token that produced them
  const pool = [
    ...resolutions.flatMap(r => (r.matches || []).map(m => ({ ...m, _token: r.token || r.query }))),
    ...intersection,
    ...byType,
  ];

  return parserEntities.map(pe => {
    const raw = norm(pe.raw);
    if (!raw) return pe;
    // authoritative: the TOKEN that produced the resolution (OR-mode _token, AND-mode via_token),
    // then fall back to the record's own code / product_name for exact-typed codes.
    const match =
      pool.find(m => norm(m._token) === raw) ||
      pool.find(m => norm(m.display?.via_token) === raw) ||
      pool.find(m => norm(m.canonical_code) === raw || norm(m.display?.product_name) === raw) ||
      null;
    if (match && match.entity_type) {
      return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code ?? pe.canonical_code ?? null };
    }
    return pe; // unresolved → keep parser's guess (correct: we have no CRM truth)
  });
}
```
Everything else in `compile-current-state` is unchanged; `reconciledEntities` continues to flow into `output.variables.entities` exactly as today.

### Same-turn response must stay byte-identical (regression invariant)
`compile-current-state` is **terminal** — it runs after get-results and `central-exchange`, so `reconciledEntities` never re-enters the current turn's CRM query or `user_response`. The only in-node consumers of the entity list are the friendly-disclaimer blocks, which key on **`e.raw`** (`/catalog|katalog/i`), never on `hint`/`canonical_code`. The fix touches only `hint` (+ fills a previously-null `canonical_code`). **⇒ current-turn `user_response` is provably unchanged.** This is the regression pass-criterion in §8.

### Optional cleaner variant (open decision D1)
Have `disallowed-entity-gate` additionally emit `token_type_map = { [via_token_lower]: entity_type }` built **only from `compatible_entities`** (domain-filtered, already authoritative), and let `compile-current-state` reconcile via a trivial `hint = token_type_map[norm(pe.raw)] || pe.hint`. Pro: keeps domain-authority in the gate, avoids re-reading raw resolver shape. Con: edits **two** nodes. Recommendation: ship the self-contained §2 version (one node, smaller blast radius); keep this as a follow-up only if the flat-pool `entity_type` ever proves ambiguous (see D2).

---

## 3. `hint` ↔ `entity_type` mapping (no translation table needed)

**Parser `hint` vocabulary** (from `output_exchange` maps/blocklists): `product, brand, category, promotion, flyer, attachment, attachment_type, customer, transporter, order, order_number, customer_order, inbound_shipment, goods_receive, spo, grn, form/forms, warehouse, access_levels` — plus **domain names leaking in as hints** via the positional fallback (`hint = output.output.domain_hint`): `incoming, master_products, inventory, …`.

**CRM `entity_type` values** (from `resolve-entity` matches + the `ALLOWED` matrix in `disallowed-entity-gate`): `product, category, brand, promotion, order, customer_order, transporter, customer, attachment, attachment_type, form, inbound_shipment`.

**Relationship:** the CRM set is a **clean subset** of the hint vocabulary — same tokens (`product`, `promotion`, `order`, `customer`, `transporter`, `category`, `brand`, `attachment_type`, `form`, `customer_order`, `inbound_shipment`). The **divergent, bug-prone hints** are exactly the ones that are **NOT** CRM entity_types: `incoming`, `goods_receive`, `spo`, `grn`, `master_products`, `inventory`, `warehouse` — these are the tokens that land on `__<hint>` private axes and get stuck forever. **⇒ the rewrite is verbatim: `new hint = CRM entity_type` (no mapping dict).** Unresolved entities keep their hint.

**SRTWCX7405 confirmation:** its CRM `entity_type = product` ⇒ new hint `"product"` ⇒ `axisOf` (any turn-2 domain) → `product_scope` ⇒ collides with the current product entity's `product_scope` ⇒ **evicted.** ✅

---

## 4. Where `axisOf` / `AXIS_BY_DOMAIN` lives (routing confirmation)

`CpxE8LroLzCkrAQN › output_exchange`, "ENTITY OPERATION EXECUTOR" block:
- `AXIS_BY_DOMAIN` (per-domain overrides): `promotion.{brand,category,promotion,flyer,product}=promo_scope`; `master_products.{product,category,brand}=product_scope`; `order.{order,order_number,customer_order,customer,transporter,product}=order_scope`; `incoming.{product,inbound_shipment,category,brand}=incoming_scope`; `product_attachment.{product,category,brand}=product_scope, attachment_type=attachment_scope`. **No `inventory` key** ⇒ inventory falls to `HINT_AXIS_DEFAULT`.
- `HINT_AXIS_DEFAULT`: `product=product_scope`, `attachment_type=attachment_scope`, `brand/category/promotion/flyer=promo_scope`, `customer/transporter/order/order_number/customer_order=order_scope`, `warehouse=location`, `goods_receive/spo/form=doc`.
- Fallback: `` `__${hint}` `` — **this is the `__incoming` bucket** that makes a stale `incoming`-hinted entity un-collidable.

Reconciling `incoming → product` moves the stale entity from `__incoming` to `product_scope`, which every product-bearing turn-2 domain (`inventory`, `master_products`, `promotion`, `order`, `incoming`, `product_attachment`) shares → guaranteed collision + eviction whenever the new turn also carries a product. (When the new turn carries no product, the entity is legitimately unrelated and retained — correct.)

---

## 5. What this fix deliberately does NOT do
- **No `output_exchange` change.** The reformulator fork is untouched; only the *input* it receives next turn (the stored hint) improves. Keeps blast radius to one spine node.
- **No new axis aliases** (contrast the shipped `customer_order`-alias fix in `output-exchange-axis-and-memberpick-fix.md`). Those patch specific holes at *merge* time keyed on the LLM hint; this patch fixes the *root* (wrong stored hint) so the existing axis map suffices.
- **No unresolved-entity rewrite.** An entity with no CRM match keeps its parser hint (we have no better truth; forcing a type would be a guess).

---

## 6. Verification tasks (plan §6 contract)
- **V1 (unit / deterministic):** pin `compile-current-state` inputs (`Call 'sub-query-reformulator'` output with a `hint:"incoming"` entity `raw` matching a `via_token`; a `resolve-entity` payload whose `intersection[]` carries that `via_token` + `entity_type:"product"`) via `prepare_test_pin_data` → `test_workflow`, assert output `variables.entities[0].hint === "product"` and `canonical_code` filled. (LESSON 34.) Cheap, no LLM.
- **V2 (fix-proving, parser tier):** the 2-turn SRTWCX7405→SRTWT165-QT scenario (§8 TDD-1) — assert turn-2 get-results `entities`/query contains **only** SRTWT165-QT.
- **V3 (no-store-regression):** for a turn whose entity has **no** CRM match, assert stored `hint` is unchanged (unresolved passthrough).
- **V4 (same-turn invariance):** for each regression contact turn, assert `user_response` byte-identical pre/post fix (§8).
- **V5 (safety):** confirm zero egress on every run via `test:egress:{test_run_id}` + orphaned-node check (§9, §0 S1–S6).

---

## 7. Scope tag = `parser` (justification)
The code change is in a deterministic Code node, but **acceptance cannot be reached deterministically**: the fix's payoff is the turn-2 `output_exchange` axis-eviction, and `mock_reformulator_output` **bypasses `output_exchange` entirely** (LESSON 28) — a mock can never show the eviction. The fix-proving case (V2) and the whole regression (§8) require the **real reformulator (gpt-5.4-mini) every turn**. `regress-replay` is also useless here (it pins reformulator output, so the corrected hint would not change the pinned result). Therefore the tester runs the **parser tier**. (A cheap deterministic V1 unit check exists but is not sufficient for sign-off.)

---

## 8. TDD & regression (test-first)

### §0 SAFETY CHECKLIST — every case below is bound to it
Each case ASSERTS, from `test:egress:{test_run_id}` and node presence:
- **S1** no `send-message*` egress to a real respond.io contact (only `would_send`).
- **S2** no assignment / reassignment (`Call 'sub-human-intervention'` short-circuits on `is_test=true`; fork `vUfFUDjLAuMaeQE6`).
- **S3** no SLA-tracking POST, no PIC comment.
- **S4** no conversation-variable / contact-custom-field **prod** write: `save-session-vars` (prod PUT) has **0 inbound** on the clone (orphaned — verified §9); all session writes go to `pg-upsert-session` → `respond_contacts_test` (n8n_test, isolated).
- **S5** no CRM record create/mutate (reads only: resolve-entity, check-access, get-results).
- **S6** all shared-sub calls carry `is_test=true`.

### TDD-1 (fix-proving, `parser` tier) — the crafted 2-turn case
- **Driver contact:** `437264483` (own WhatsApp; regress-capture keyed session is a `respond_contacts_test` row, NOT prod — §9). **Mode:** `regress-capture`.
- **Pre-seed:** reset `respond_contacts_test` where `respond_io_id='437264483'` to `{"variables":{}}` before turn 1 (in-n8n Postgres cred `Dnnofg8Xb27VQOhI`; host psql unavailable — LESSON 31).
- **Turn 1 (redis item):** an `incoming`/goods-receive query that resolves `SRTWCX7405-S-289UF-PJ` as a **product**, e.g. `"any incoming for SRTWCX7405-S-289UF-PJ"`. Real reformulator + real resolve-entity + real get-results (reads only).
  - **Assert (store):** `compile-current-state.variables.entities` entry for SRTWCX7405 has `hint === "product"` (POST-fix) — PRE-fix it is a non-product token (`incoming`/whatever the LLM emitted). This is the direct fix signal, inspected in `get_execution` runData (LESSON 42).
- **Turn 2 (redis item, same driver, session carried):** `"SRTWT165-QT has stock?"`.
  - **Expected branch/path:** inventory/stock happy path → `resolve-entity → disallowed-entity-gate → get-results`.
  - **PRIMARY ASSERT:** turn-2 `Call 'sub-get-results'` input `entities` (and the reformulator `output.entities`) contain **only `SRTWT165-QT`** — SRTWCX7405 is **absent**. PRE-fix: SRTWCX7405 present (bug reproduced) → PASS-on-fix / FAIL-on-prefix.
  - **Secondary:** turn-2 `user_response` does not name SRTWCX7405.
- **Structural output assertions:** turn-2 reformulator `output.entities.length === 1`; `broaden_dropped`/merge diagnostics show no `__incoming` survivor.

### TDD-2 (no-regression unit, deterministic tier) — unresolved passthrough
- Single turn, a token with **no** CRM match (e.g. gibberish `"zzqq999"`). Assert stored `variables.entities[*].hint` equals the parser's original hint (fix must not clobber unresolved hints).

### Regression = sequential multi-turn replay of the 5 busiest REAL contacts
Pull, from `n8n_test.chat_histories`, each contact's **INCOMING** messages in chronological order (`ORDER BY sent_at, id`), EXCLUDING dev contact `437264483`. Target contacts (given):

| # | respond_io_id | name | incoming count |
|---|---|---|---|
| 1 | 445239386 | Saidatun Najida Binti Husni | 336 |
| 2 | 445239390 | Ili Mahfuzah | 225 |
| 3 | 404285551 | Jayden Loo | 125 |
| 4 | 428126355 | — | 94 |
| 5 | 423729094 | Ms ACT | 55 |

**Replay mechanism (per contact):** feed that contact's incoming messages **one at a time, in order**, through the clone, each as its own redis item — a real conversation. This organically exercises 2-turn+ carryover (no crafted pre-seed).
- **Driver:** all turns under `437264483` (own contact). **Mode:** `regress-capture` → session round-trips through `respond_contacts_test` keyed by `437264483` (writes+reads), giving true multi-turn persistence with **zero prod mutation** (prod PUT orphaned; prod GET bypassed by `session-get-gate` in regress modes).
- **Isolation:** **reset** `respond_contacts_test['437264483'] → {"variables":{}}` **between contacts** (never mid-conversation) so conversations don't bleed. (LESSON 31: reset between independent cases only.)

**⚠️ Recommended cap (planner recommendation):** full 835 turns × 2 (pre+post) ≈ 1,670 real-reformulator turns is impractical (≈3–7 s + parser tokens each ⇒ hours + material LLM cost, and the wedge risk of LESSON 29). **Cap at the first `N = 40` incoming turns per contact ⇒ 5 × 40 = 200 turns per pass, 400 total across pre+post.** Rationale: carryover drag manifests within a handful of turns; 40 turns give deep multi-turn coverage while bounding cost/time to ~30–60 min per pass. Raise N only for a contact whose diffs cluster near the cap. (Full-corpus is reserved for high-risk changes — this is a hint-only rewrite.)

**Procedure:** run each contact's capped sequence on **pre-fix** clone, record per-turn `user_response` (+ get-results `entities`); apply the fix; run the identical sequence on **post-fix** clone; diff per-turn.

**Classify every diff:**
- **(a) fix-improvement** — a turn that previously dragged stale cross-domain entities now clean (fewer/only-correct entities; wording drops a spurious code). ACCEPTABLE.
- **(b) REGRESSION** — a turn whose legitimate **same-domain** carryover or response changed for the worse (a needed prior entity now dropped; a previously-correct answer now wrong/empty). NOT ACCEPTABLE.

**Pass criterion / acceptance:** **zero (b).** Expectation: the vast majority of turns byte-identical (fix only rewrites STORED hints, and same-turn response is provably hint-independent — §2), a small set of (a) improvements, no (b). Flag any non-identical turn for reviewer eyes with its classification.

> Note: single-turn messages alone would NOT exercise the carryover fix — the sequential replay + TDD-1 are what prove it; the per-turn byte-diff is the no-regression guard.

---

## 9. Safety (zero egress, no prod mutation)
- Build/test exclusively on clone `txiPzSxy3Pclsz6v`; the reformulator work (none needed here) would be its fork `CpxE8LroLzCkrAQN`. Live spine `9qVyfUxmRQqrpGRMDLRuz` untouched until a user-gated promotion.
- **Prod session PUT `save-session-vars` is orphaned** on the clone: connection scan shows `compile-current-state → {sendmsg-respond2, guard-d-record, session-save-gate}` only; nothing feeds `save-session-vars`. In `regress-capture` all session writes go to `pg-upsert-session` → `respond_contacts_test` (n8n_test @ `72.62.195.19`, isolated from prod CRM DB). **The user's real prod respond.io conversation-variables are never written**, even under contact `437264483`.
- All shared-sub calls pass `is_test=true`; human-intervention resolves to guarded fork `vUfFUDjLAuMaeQE6`. Egress nodes `send-message-*` orphaned.
- Every case asserts `test:egress:{test_run_id}` shows only `would_send`/`would_write`, never a real action (§0 S1–S6).
- **Promotion is a separate, user-gated step** (backup prior versionId + node body, sha-verify draft pre-publish & active post-publish, auto-revert on mismatch — LESSONS 24/25). Not in scope of this plan.

---

## 10. Open decisions for the user
- **D1 — one-node vs two-node fix.** Recommend the self-contained `compile-current-state` upgrade (§2). Alternative: gate emits `token_type_map` (§2 variant). Approve default?
- **D2 — heterogeneous token.** If one `via_token` resolves to matches of *different* `entity_type`s, the flat pool takes the first. For the axis-eviction purpose this is almost always harmless (product codes resolve homogeneously). Option: prefer the match whose `entity_type ∈ ALLOWED[domain]`. Recommend: ship simple, add the preference only if a regression (b) traces to it. Approve?
- **D3 — regression cap N.** Recommend `N = 40` incoming turns/contact (200/pass). Approve, or set a different N?
- **D4 — driver-session consent.** The regression drives `regress-capture` under `437264483`, which writes to the **n8n_test** `respond_contacts_test` copy, NOT prod respond.io. Confirm the tester may create/upsert/reset that test-DB row. (The user's own confirmation is required before the tester runs — coordinator relay is not sufficient authorization to execute.)
```
```
