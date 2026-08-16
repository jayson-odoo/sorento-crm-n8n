# Change #3: `dym-zerostock-itemize` — name resolved-but-empty products on an answered stock turn

> ## ⚠️ REVISED 2026-08-01 — requested-set source changed (`compatible_entities` → customer-REFERENCED)
> The user REJECTED naming resolver-expanded sibling variants. The `compatible_entities`-sourced
> requested set (original **Q1 / Q3 / §2**, below) is **SUPERSEDED** — it named codes the customer
> never typed (e.g. bare `SRTWT902` was resolver-expanded into `SRTWT902-GM/-GY/-FRG/-GM-NL` in
> `compatible_entities`, and #3 named the empty siblings `-FRG`/`-GM-NL`; tester OBS-1,
> `runs/dym-v3-zerostock-rollup-20260801.json`). The **authoritative** design is now
> **§Q1′ / §Q3′ / §2′ (REVISED)**. Requested set = **codes the customer TYPED (resolver exact-tier)
> ∪ codes the customer PICKED (dym)** — never silently-expanded siblings. Old Q1/Q3/§2 kept below,
> struck through, for history. Everything else (placement, gating, wording, no-op, disjoint-with-#2,
> §0 binding) is UNCHANGED.

Status: PLAN (planner deliverable). **DOCS ONLY** — no workflow edited, no execution run.
**Bundled with #1 (`dym-multitoken`, build-suggest-offer) and #2 (`dym-partial-disambiguation`, parser +
compile-current-state).** #3 is **compile-current-state-only** and can promote independently of #1/#2.

**Scope tag: `deterministic`.** The only edited node is `compile-current-state`, a spine **Code** node whose
inputs (`central-exchange`/`validator`/`disallowed-entity-gate` result, `Call 'sub-query-reformulator'.output`,
`resolve-entity`) are all pinnable → the primary gate is a **0-token offline unit**
(`prepare_test_pin_data` → `test_workflow`). No parser prompt edit, no `output_exchange` edit, no get-results
sub edit → **not** `parser` / `get-results` tier.

Build/test target = **CLONE `txiPzSxy3Pclsz6v`**. Live spine = `9qVyfUxmRQqrpGRMDLRuz` — **never edited**
during build (active versionId `a505f2e1-74ef-4fb3-9c87-c4818689b21b`, draft==active, verified clean this
cycle). `compile-current-state` = live id **`0804657c`** / clone id **`7a130a0c`** (target by node NAME,
LESSON 58c).

Source of truth: live spine read read-only via MCP `get_workflow_details` this cycle; get-results sub
`rysSPgUssLDf6xJc` (`sub-get-results TEST`); CRM MCP presenters + backend read read-only from
`/Users/tehjayson/Documents/foundryx/sorento_crm`.

---

## 0. The gap (formalized — user-found, confirmed against code)

On a multi-product stock query, a product that **resolves** but returns **zero stock rows** is silently
dropped from the answer. Root cause, traced end-to-end:

- get-results (`rysSPgUssLDf6xJc`) is fed `entities = $('disallowed-entity-gate').first().json.compatible_entities`
  — a flat resolved list `{uuid, entity_type, code}` (`entity-ids-transformer` maps each `uuid` → `product_ids`).
- The CRM `_incoming_by_product` / `_incoming_list` / `_stock` presenters
  (`sorento_crm_mcp/.../presenters.py`) build **one item per shipment/stock-row**, keyed by the product's
  own `product_code`. A product with **no** shipment/stock rows produces **no item** — the backend
  `IncomingStockService.incoming_for_product` `grouped` dict simply has no bucket for it
  (`incoming_stock_service.py` L276-309; the join to `inbound_shipment_lines` yields nothing).
- `output-structurer` renders only the items present → the empty product emits **no line**.
- `compile-current-state` (L114-143) builds `last_result_set = indexed` from those items → the empty product
  is absent there too, with no note.

Real repro: dym multi-pick `1,4,5,6,7`; answer showed 4/6/7 stock; picks 1 (`C2181XUW-P-ENG`) and 5
(`SRTWCY8605`) resolved but had zero inventory and **vanished with no note**.

Fix (user-approved, exact wording LOCKED): on an ANSWERED inventory/incoming turn, append ONE completeness
line to the **customer-facing** text naming the resolved PRODUCTS that returned zero rows:

```
No stock records found for: C2181XUW-P-ENG, SRTWCY8605.
```

---

## 1′. REVISED DESIGN — customer-REFERENCED requested set (AUTHORITATIVE, supersedes Q1/Q3/§2)

Investigated against source this cycle: CRM resolver
`sorento_crm_backend/app/services/entity_resolver.py` (the `references/resolve` endpoint the spine
`resolve-entity` HTTP node calls) and the live spine `disallowed-entity-gate` + `compile-current-state`
node bodies (read read-only via MCP). Findings are concrete, not assumed.

### Q1′ — the requested set = TYPED-exact ∪ DYM-PICKED (never expansion siblings)

**Where the siblings come from (root cause, from resolver source).** `resolve_entities` runs Tier-1 exact
first (`_probe_product`, exact case/dash/ws-insensitive match on `product_code`), THEN a **"Product variant
expansion"** step (`entity_resolver.py` L3356-3379): when a token already got a Tier-1 product hit, it ALSO
runs `_prefix_probe_product` (`ilike('SRTWT902%')`) and **appends every prefix sibling into the SAME token's
`matches[]`**, then flags that token `ambiguous`. So a bare typed `SRTWT902` yields ONE token resolution:
```
resolutions[0] = { token:"SRTWT902", resolved:false, ambiguous:true, matches:[
  { canonical_code:"SRTWT902",       entity_type:"product", match_tier:"exact"  },   ← what the customer TYPED
  { canonical_code:"SRTWT902-GM",    entity_type:"product", match_tier:"prefix" },   ← silently expanded sibling
  { canonical_code:"SRTWT902-GY",    entity_type:"product", match_tier:"prefix" },   ← "
  { canonical_code:"SRTWT902-FRG",   entity_type:"product", match_tier:"prefix" },   ← "
  { canonical_code:"SRTWT902-GM-NL", entity_type:"product", match_tier:"prefix" } ]} ← "
```
The `disallowed-entity-gate` then FLATTENS `resolutions[].matches[]` into `compatible_entities`
(`{uuid, entity_type, code:canonical_code}`), **dropping `match_tier`** — which is precisely why the old
`compatible_entities`-sourced #3 could not tell the typed code from its siblings and named the empty siblings.
`resolver.as_dict()` (L603-636) DOES carry `match_tier` on every match — so the discriminator survives to
n8n's `resolve-entity` output; only the gate discards it.

**Domain nuance (verified in the live gate).** `disallowed-entity-gate` already applies an exact-tier filter,
but ONLY for `REQUIRE_SPECIFIC_DOMAINS = {incoming, product_attachment}` (OR-mode:
`products.filter(m => m.match_tier === 'exact')`). So for `incoming`, `compatible_entities` was already
sibling-free and the OLD #3 was accidentally correct there; for **`inventory` (plain stock)** the gate does
NOT exact-filter → `compatible_entities = entities` (the full sibling union) → the OLD #3 leaked. The revised
#3 applies the exact-tier discrimination itself, uniformly, so BOTH domains are correct.

**(1) TYPED-exact codes — source `$('resolve-entity').first().json.resolutions[]`, mirroring the gate's own
OR-mode product logic** (already proven in production inside `disallowed-entity-gate`):
- Per token resolution, take the product matches. If ≥1 has `match_tier === 'exact'` → keep those exact
  `canonical_code`(s) (the customer typed the full code(s)); **drop every `prefix`/`substring` sibling.**
- Else if the token has exactly ONE product match total (a single prefix/substring hit, `resolved===true`,
  no exact) → keep it as the sole unambiguous referent. *(This mirrors the gate's `products.length===1`
  pass-through; flagged as R-ZS2 for the user — see §7.)*
- Else (multiple products, no exact → `ambiguous`) → the customer pinned NO code → **add nothing** (that token
  is a genuine did-you-mean case and belongs to #2, not #3).
- **AND-mode fallback** (`resolver.resolutions` absent; `resolver.intersection`/`by_entity_type` present, no
  per-token tier): a product match is "typed" iff `norm(canonical_code)` equals a `resolver.tokens` value
  (mirrors the gate's AND-mode `typedTokens.has(norm(m.canonical_code))`). No per-token family available in
  AND-mode → strict per-code (family suppression, Q3′, does not apply) — acceptable, flagged R-ZS3.

**(2) DYM-PICKED codes — source the offer lifecycle already in `compile-current-state`:**
- Cumulative prior picks: `$('get-session-vars').first().json` → `…variables.dym_offer.picked` (array of
  codes; same read `_prevOffer` uses).
- This turn's pick: `qf.dym_offer_pick_code` (the code the parser applied this turn; same value
  `compile-current-state` pushes into `_dymOffer.picked`). *(NOTE: #3 sits ABOVE the `_dymOffer` computation
  at spine/clone L~410, so it derives picked codes DIRECTLY from `_prevOffer.picked + qf.dym_offer_pick_code`
  — it must NOT depend on `_dymOffer` being computed first. Placement-independent by construction.)*
- Picks are **strict** (family suppression does NOT apply): the customer chose that exact code, so an empty
  pick is named even if a sibling has stock (matches the KEEP repro: picked `C2181XUW-P-ENG`/`SRTWCY8605`
  empty → named). A picked full code also re-resolves exact on the answering turn, so it typically appears in
  (1) too; the union dedups, and pick-strictness wins over typed-family when a code is both.

Requested set = **union of (1) ∪ (2)**, deduped case-insensitively, rendered in query-then-pick order.

### Q3′ — matching + the typed-but-empty-with-stocked-variant EDGE (family suppression)

Extraction of the returned set (Q2) is **unchanged**: distinct `Product Code` field values across
`getResultObj().answers/items` (case-insensitive label, `norm = trim+UPPER`). Both sides are the DB
`product_code`, so exact equality after `norm` is correct — no dash-stripping needed.

**Satisfaction rule (per requested code C):**
- **PICKED code** → satisfied iff `norm(C) ∈ returnedCodes` (strict, no family).
- **TYPED code** → satisfied iff `returnedCodes ∩ family(C) ≠ ∅`, where **`family(C)` = the set of product
  `canonical_code`s in C's OWN token resolution** (its exact match + that token's expansion siblings). This is
  resolver-authoritative grouping — NOT a string-prefix guess — so it CANNOT create the earlier false-positive
  (a too-loose prefix match). Family suppression can only ever *withhold* a line (false-negative direction),
  never name an un-referenced code; and withholding is exactly the user's approved preview.
- Name C iff NOT satisfied. Dedup on `norm`, render original casing, cap 10 (Q7 unchanged).

**Why family suppression is the RECOMMENDED answer to the edge** (customer types exact `X`, `X` returns zero
rows, but a variant `X-GM` has stock): `family(X) = {X, X-GM, …}` (X's own token matches). `X-GM ∈ returned`
⇒ `returnedCodes ∩ family(X) ≠ ∅` ⇒ X satisfied ⇒ **no line** — i.e. "SRTWT902 has stock via SRTWT902-GM →
not named", exactly the approved preview. And if the WHOLE family is empty (nothing stocked) while OTHER
query products answered, `family(X) ∩ returned = ∅` ⇒ X IS named — correct ("the thing you asked about has no
stock"). The rule is not fragile: family is scoped to one customer token by the resolver itself; the only
degradation is AND-mode (no per-token grouping → strict per-code), flagged R-ZS3.

*Simplest correct alternative, if the user prefers to avoid family logic entirely (flag):* name a typed code
only when its token produced a SINGLE product match (no expansion at all); suppress naming for any expanded
token. This is simpler but strictly worse — it stays silent even when the entire expanded family is empty
(the customer asked and gets no note). Recommendation: ship family suppression (Q3′).

### Q-disjoint′ — #2/#3 disjointness is STRUCTURALLY TIGHTER now (re-proven against live #2)

Live/clone #2 (`compile-current-state` "Couldn't find these" block) builds `missResolutions` as
`r.resolutions.filter(res => res.resolved !== true && !res.matches.some(isExact))` and its per-token candidate
list drops exact matches (`if (isExact(m)) continue`). Revised #3's TYPED set is exactly the tokens that are
`resolved===true` OR carry an exact match. These are **mutually exclusive** with #2's set (which requires
`resolved!==true` AND no-exact). So an expanded token like `SRTWT902` (has an exact match) is in #3, excluded
from #2; a multi-prefix-no-exact token is in #2, excluded from #3. PICKS resolve exact → in #3, never #2.
No code can appear in both blocks. (Tighter than the old "resolved vs unresolved" argument.) Test: §ZS-5.

### §2′ — REVISED implementation sketch (compile-current-state; replaces §2)

Same self-contained IIFE, same placement (after disclaimer, before #2), same gates Q4.1-Q4.5, same returned-set
extraction, same wording/cap/no-op. ONLY the requested-set derivation + the satisfaction test change:

```js
// ── requested set (REVISED): customer-REFERENCED codes only ──
const norm   = s => String(s || '').trim().toUpperCase();
const _isProd = m => m && String(m.entity_type).toLowerCase() === 'product';
const _rz    = (() => { try { return $('resolve-entity').first().json || {}; } catch (e) { return {}; } })();

// requested[] rows: { _n:norm(code), code:display, fam:Set<norm>, strict:bool }
const requested = []; const _seen = new Set();
const _add = (code, fam, strict) => {
  const n = norm(code); if (!n) return;
  if (_seen.has(n)) { if (strict) { const ex = requested.find(x => x._n === n); if (ex) { ex.fam = new Set([n]); ex.strict = true; } } return; }
  _seen.add(n);
  requested.push({ _n:n, code, fam: strict ? new Set([n]) : (fam || new Set([n])), strict:!!strict });
};

// (1) TYPED-exact from resolutions[] — mirrors disallowed-entity-gate OR-mode product logic
const _or = Array.isArray(_rz.resolutions) ? _rz.resolutions : null;
if (_or) {
  for (const r of _or) {
    const prods = (r.matches || []).filter(_isProd);
    if (!prods.length) continue;
    const fam = new Set(prods.map(m => norm(m.canonical_code)).filter(Boolean));   // resolver's own family
    const exacts = prods.filter(m => m.match_tier === 'exact');
    if (exacts.length) { for (const m of exacts) if (m.canonical_code) _add(m.canonical_code, fam, false); }
    else if (prods.length === 1 && prods[0].canonical_code) _add(prods[0].canonical_code, fam, false); // sole referent (R-ZS2)
    // else multiple products, no exact -> ambiguous -> #2's job, add nothing
  }
} else {                                                                           // AND-mode fallback (R-ZS3)
  const _tok = new Set((Array.isArray(_rz.tokens) ? _rz.tokens : []).map(norm));
  const _int = Array.isArray(_rz.intersection) ? _rz.intersection
             : (_rz.by_entity_type ? Object.values(_rz.by_entity_type).flat() : []);
  for (const m of _int) if (_isProd(m) && m.canonical_code && _tok.has(norm(m.canonical_code))) _add(m.canonical_code, null, false);
}

// (2) DYM-PICKED (strict) — prior cumulative picks + this turn's pick (independent of _dymOffer)
const _pick = c => { if (c) _add(c, null, true); };
try {
  const s = $('get-session-vars').first().json;
  const v = (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || null;
  const prev = (v && v.dym_offer && Array.isArray(v.dym_offer.picked)) ? v.dym_offer.picked : [];
  for (const c of prev) _pick(c);
} catch (e) {}
_pick(qf.dym_offer_pick_code);

// ── missing: typed -> family suppression; picked -> strict ──
const missing = [];
for (const rq of requested) {
  const fam = (rq.fam && rq.fam.size) ? rq.fam : new Set([rq._n]);
  let ok = false; for (const fc of fam) if (returnedCodes.has(fc)) { ok = true; break; }
  if (!ok) missing.push(rq.code);
}
if (missing.length === 0) return;                                    // Q6 no-op (byte-identical)
const shown = missing.slice(0, 10);                                  // Q7 cap
userResponse += `\n\nNo stock records found for: ${shown.join(', ')}.`;  // LOCKED wording
```
`returnedCodes` (the Q2 returned-set `Set`) and the Q4 gates are built exactly as in the current #3 block —
only the requested/missing computation above replaces the old `compatible_entities` block. Writes ONLY
`userResponse`. No new node, no new upstream dependency (`resolve-entity` + `get-session-vars` are already
read elsewhere in `compile-current-state`).

---

## 1. RESOLVED design answers (the reason we plan)

> **⚠️ Q1 and Q3 below are SUPERSEDED by Q1′ / Q3′ (§1′ above).** They described the
> `compatible_entities`-sourced requested set the user rejected. Retained for history / rationale only.

### Q1 — the "requested product" set (AUTHORITATIVE)
**Use `$('disallowed-entity-gate').first().json.compatible_entities`, filtered to
`String(e.entity_type).toLowerCase() === 'product'` AND a truthy `e.code`.**

Why this one and not `reconciledEntities` or resolver matches: `compatible_entities` is **exactly and only**
what get-results looked up. The spine's `Call 'sub-get-results'` node passes
`entities: {{ $('disallowed-entity-gate').first().json.compatible_entities }}`, and `entity-ids-transformer`
consumes it verbatim, mapping each row's `uuid` → `product_ids` (dedup by uuid). So "what was queried" ==
`compatible_entities`. `reconciledEntities` is parser-entities re-typed by the resolver (a superset that can
include tokens the gate dropped as incompatible / unresolved — those were never queried, so flagging them
"no stock" would be wrong). Resolver `resolutions/intersection` is pre-gate (also a superset).
Each `compatible_entities` row is `{uuid, entity_type, code}` where **`code = m.canonical_code`**
(disallowed-entity-gate L34) — same source column (`Product.product_code`) the presenter renders, so codes
compare byte-for-byte after normalization.

`compile-current-state` can already read the gate (`getResultObj()` references
`$('disallowed-entity-gate')`), so this is an in-reach input — **no new upstream dependency.**

**dym-pick follow-up confirmed:** after a dym pick, the picked codes ARE the resolved entities that flow to
the gate → they appear in `compatible_entities` on the follow-up turn with `entity_type:'product'` + `code`.
So the multi-pick repro's picks are in the requested set on the answering turn. ✅

### Q2 — the "returned" set (exact extraction)
Extract distinct product codes from the returned rows = `getResultObj().answers` (the render-envelope
`items`; `central-exchange` passes the get-results output through unchanged, and `getResultObj()` reads
`resultObj.answers`). Each item carries `fields: [{label, value}]`. The product code lives in the field
**labelled exactly `Product Code`** (confirmed across every per-product inventory presenter:
`_incoming_by_product` L285, `_incoming_list` L265, `_stock` L460 — all `("Product Code", <product_code>)`).

Extraction (case-insensitive label match, case-insensitive value normalization):
```js
const returnedCodes = new Set();
for (const it of items) {
  const f = (it.fields || []).find(x => String(x.label||'').trim().toLowerCase() === 'product code');
  const v = f && f.value;
  if (v != null && String(v).trim() !== '' && String(v).trim() !== '—') returnedCodes.add(norm(v));
}
const norm = s => String(s).trim().toUpperCase();
```
Do **not** reuse `indexed[].product`: that field is `fieldVal(it,'Product')` (exact label `Product`), which
is **null for stock rows** (the label is `Product Code`, not `Product`) — a live latent quirk, not this
change's concern, but it means #3 must read `Product Code` directly.

### Q3 — matching / false-positive guard (CRITICAL) — RESOLVED: exact code match, NO variant/family logic
**Inventory does NOT expand a requested product into variant/child rows.** Proven from source, not assumed:
- Backend `IncomingStockService.incoming_for_product` filters `Product.id.in_(resolved_ids)` and groups by
  the **queried product's own** `product_code` (`incoming_stock_service.py` L276-309). Every returned bucket's
  `product_code` is one of the requested codes verbatim.
- Presenters set `("Product Code", p.get("product_code"))` — the parent/queried product's code, never a
  variant SKU (`presenters.py` L285/L265/L460).
- The ONLY "variant/neighbour" behaviour is `_incoming_entity_alternatives` (L317-353), which populates the
  envelope's **`alternatives[]`** field and fires **only on the total-empty path** (`data == []`). Those are
  NOT items/rows and never appear when there is ≥1 returned row — i.e. never on a #3-eligible turn.

**Therefore: match a requested product's `code` against the set of returned `Product Code` values by
EXACT, case-insensitive, trimmed equality.** No prefix/family/parent-child matching. A parent that resolves
to its own product record and has no incoming genuinely has "no stock records" for that record — naming it is
correct (the variant, if any, is a distinct product the user did not ask about and surfaces via
`alternatives[]` only on the all-empty path). This is the exact repro behaviour the user wants
(`SRTWCY8605` named; `SRTWCY8605-PJ` was never picked).

### Q4 — gating (crisp boundary)
Fire the completeness line ONLY when **all** hold:
1. `qf.message_type === 'business_query'`
2. `!manualResponse` (no suggest/member/escalate/ideate override took the turn)
3. `!isEscalateBranch` (i.e. `central-exchange` answered — the happy path)
4. `qf.domain_hint === 'inventory' || qf.domain_hint === 'incoming'` (the two product-scoped stock domains;
   `inventory` → `crm_inventory_stock_balance_list`/`_stock`; `incoming` → `crm_incoming_stock_*`, from
   `disallowed-entity-gate` `ALLOWED`). Both render `Product Code`.
5. **≥1 returned row that carries a product code:** `last_result_set.length > 0` (equivalently `items.length>0`)
   AND `returnedCodes.size > 0`. This is the structural has_result gate.
6. `missing.length > 0`.

Boundary with the not-found/dead-end path (must NOT be turned into a happy answer): when **all** requested
products return zero, get-results yields `has_result:false`, `items:[]` → `compile-current-state` L105 takes
the `items.length===0` branch (`last_result_set=[]`) or the turn diverts to not-found/clarify upstream
(validator `has_result=false`). Either way gate #5 (`last_result_set.length>0`) is FALSE → **#3 does not
fire.** #3 only annotates a **partial** result. The `returnedCodes.size>0` sub-clause also blocks the odd
case where product entities were requested but the running tool renders no `Product Code` (e.g. a
shipment-level render) — can't attribute → say nothing.

### Q5 — ordering + composition with #2 (no double-listing)
On a turn with BOTH resolved-but-empty products (#3) AND unresolved did-you-mean tokens (#2's
`Couldn't find these:` block), append order on the **customer-facing `userResponse`**:

```
<stock rows>            (already in userResponse)
                        (blank line)
No stock records found for: <codes>.        ← #3
                        (blank line)
Couldn't find these: …  <numbered dym block> ← #2 (when present)
```

**Placement in code:** append #3 immediately AFTER the disclaimer IIFE (L200-218, a no-op for
inventory/incoming) and BEFORE #2's `Couldn't find these:` append. So the code order is: disclaimer IIFE →
#3 → #2.

**No double-listing is structurally guaranteed** (not merely convention):
- #3's set = `compatible_entities` (entity_type product) that **resolved** (they are in the gate's compatible
  set) and returned zero rows.
- #2's set = `missResolutions` = resolver resolutions with `resolved !== true` (tokens that did **not**
  resolve), each with candidates.
- A product cannot be in both: `compatible_entities` requires it resolved; `missResolutions` requires it
  unresolved. Mutually exclusive → **#3 never lists an unresolved token; #2 never lists a resolved-empty
  product.** Explicit test: §ZS-5.

#2 is HELD (awaiting its R2 sign-off) and may not ship in the same window. #3 is self-contained and correct
with or without #2. If both land, sequence + re-diff `compile-current-state` (LESSON 57).

### Q6 — byte-identical no-op guard
When every requested product returned ≥1 row → `missing == []` → gate #6 false → **append nothing**;
`userResponse` byte-identical to today. When domain ∉ {inventory, incoming}, or `manualResponse`, or
`isEscalateBranch`, or `last_result_set.length===0` → the whole #3 block short-circuits with no write → pure
no-op. The block writes to `userResponse` and to **no** other field (does not touch `response`,
`last_result_set`, `dym_offer`, `selection_context`, `quick_reply`). Verified by §ZS-3 (byte-identical) and
by static read of the block's write-set.

### Q7 — dedup + cap
`missing` = requested products (in `compatible_entities` order — stable, matches query order) whose `norm(code)`
∉ `returnedCodes`, **deduped case-insensitively** on `norm(code)`, rendered with the ORIGINAL `code` casing.
**Cap at 10** codes (`missing.slice(0,10)`); if capped, the extra are simply omitted (the line is a
courtesy note, not the answer). 10 is comfortably above any realistic multi-pick.

---

## 2. Locked implementation (compile-current-state only)

> **⚠️ SUPERSEDED by §2′ (§1′ above).** The `compatible_entities`-sourced block below named expansion
> siblings. Use §2′'s requested-set/missing derivation. Placement, gates, returned-set extraction, wording,
> cap and no-op are identical between the two; only the requested/missing computation changed.

Insert one self-contained block after the disclaimer IIFE (L218), before any #2 dym-block append:

```js
// ── #3 dym-zerostock-itemize: name resolved products that returned ZERO stock rows ──
// Customer-facing completeness note on an ANSWERED inventory/incoming turn.
(() => {
  const dh = qf.domain_hint;
  if (dh !== 'inventory' && dh !== 'incoming') return;                 // Q4.4 domain gate
  if (qf.message_type !== 'business_query') return;                    // Q4.1
  if (manualResponse || isEscalateBranch) return;                      // Q4.2 / Q4.3
  if (!(Array.isArray(last_result_set) && last_result_set.length > 0)) return;  // Q4.5 has-rows
  if (typeof userResponse !== 'string' || userResponse.trim().length === 0) return;

  const norm = s => String(s).trim().toUpperCase();

  // returned set (Q2): distinct "Product Code" values across the answered items
  const resultObj = getResultObj();
  const items = Array.isArray(resultObj.answers) ? resultObj.answers
              : Array.isArray(resultObj.items)   ? resultObj.items : [];
  const returnedCodes = new Set();
  for (const it of items) {
    const f = ((it && it.fields) || []).find(x => String((x && x.label) || '').trim().toLowerCase() === 'product code');
    const v = f && f.value;
    if (v != null && String(v).trim() !== '' && String(v).trim() !== '—') returnedCodes.add(norm(v));
  }
  if (returnedCodes.size === 0) return;                                // Q4.5 can't attribute → say nothing

  // requested set (Q1): gate compatible_entities, entity_type product, with a code
  let compat = [];
  try { compat = $('disallowed-entity-gate').first().json.compatible_entities || []; } catch (e) { compat = []; }
  const requested = (Array.isArray(compat) ? compat : [])
    .filter(e => e && String(e.entity_type).toLowerCase() === 'product' && e.code);

  // missing (Q3 exact match, Q7 dedup + cap)
  const seen = new Set();
  const missing = [];
  for (const e of requested) {
    const n = norm(e.code);
    if (returnedCodes.has(n) || seen.has(n)) continue;
    seen.add(n);
    missing.push(e.code);
  }
  if (missing.length === 0) return;                                    // Q6 no-op

  const shown = missing.slice(0, 10);                                  // Q7 cap
  userResponse += `\n\nNo stock records found for: ${shown.join(', ')}.`;  // exact locked wording
})();
```

Notes:
- Writes ONLY `userResponse` (Q6). `variables.response` (compressed, parser-facing) is untouched — the
  parser does not need to know about empties, and keeping `response` unchanged preserves follow-up behaviour.
- Uses the SAME `getResultObj()`/`items`/`last_result_set`/`manualResponse`/`isEscalateBranch`/`qf` already
  in scope. No new node, no new input.
- Exact wording: `No stock records found for: <comma-separated codes>.` (single space after colon, `, `
  between codes, trailing period). LOCKED.

---

## 3. Consumption / blast radius
- Single node changed: `compile-current-state`. `output_exchange`, get-results sub, `build-suggest-offer`,
  parser prompt — all **untouched**.
- Downstream reads `output.user_response` and sends it; appending to it needs no other change.
- `dym-single-use` lifecycle (`_dymOffer` ttl/picked, L220-251) is **unchanged** — #3 touches none of it.

---

## 4. Safety / harness binding (§0)
Zero-egress is **structural** on the clone (fail-closed): Code-only edit, emits a longer `user_response`
string, adds **no** egress node. Every §ZS case is bound by UAC.md §0 **S1–S8**. Prod-ingest gate = **S7a/S7b**
(sink-delta + payload attribution; LLEN-equality withdrawn, LESSON 45). The offline unit (V-ZS0) exercises
no egress at all. No CRM write; CRM reads (resolve/gate/get-results) allowed; get-results tool stays in the
READ allowlist (S4). `test_mode`/`is_test:true` present (S5). `deterministic` tier → **0 LLM tokens** (S6):
inject `mock_reformulator_output` to pin the parser and drive the branch; the flagship gate is a pinned
offline unit (no LLM at all).

---

## 5. Verification tasks (planner-defined)

> Fixtures now pin **`resolve-entity` output** (`resolutions[]` with `match_tier`) and, for pick cases,
> `get-session-vars.…variables.dym_offer.picked` / `qf.dym_offer_pick_code` — NOT `compatible_entities`. The
> old `compatible_entities` pin is only needed if a legacy assertion still reads it; #3 no longer sources it.

- **V-ZS-variant (NEW — the flagship revised case, HARD).** Pin a bare-`SRTWT902` turn: `resolve-entity`
  `resolutions = [{ token:'SRTWT902', ambiguous:true, resolved:false, matches:[
  {product,'SRTWT902',match_tier:'exact'}, {product,'SRTWT902-GM','prefix'}, {product,'SRTWT902-GY','prefix'},
  {product,'SRTWT902-FRG','prefix'}, {product,'SRTWT902-GM-NL','prefix'} ]}]`; get-results `answers` return a
  `Product Code` row for `SRTWT902-GM` (and/or `SRTWT902`) but NOT for `-FRG`/`-GM-NL`. **Assert NO
  `No stock records found for:` line** (typed set = `{SRTWT902}`; family `{all 5}` ∩ returned ≠ ∅ →
  satisfied; the empty siblings `-FRG`/`-GM-NL` are `prefix`-tier → never in the requested set → never named).
  This is the user's approved preview and the case the OLD #3 got wrong. **Fail-on-purpose:** point every
  answer row at a NON-family code (e.g. `ABC123`) and confirm `SRTWT902` IS then named — proves the family
  gate can go both ways.
- **V-ZS0 (offline unit — PRIMARY GATE, 0-token).** `prepare_test_pin_data` → `test_workflow` on the clone,
  pinning `compile-current-state`'s `$()` inputs per the §6 fixture (domain `incoming`, 3 TYPED products in
  `resolve-entity.resolutions[]` each as a single `match_tier:'exact'` product match, get-results `answers`
  carrying `Product Code` rows for only 1 of them, ≥1 row). Assert `user_response` == stock body +
  `\n\nNo stock records found for: C2181XUW-P-ENG, SRTWCY8605.` and that
  `variables.response`/`last_result_set`/`dym_offer`/`selection_context`/`quick_reply` are byte-identical to
  the pre-change node on the same input.
- **V-ZS-pick (dym-pick strictness).** Pin the answering turn of a dym multi-pick: `dym_offer.picked` (via
  `get-session-vars`) = `['C2181XUW-P-ENG','SRTWCY8605','<3 stocked>']` (and/or `qf.dym_offer_pick_code`);
  `resolve-entity.resolutions[]` carries those picks as exact matches; get-results returns rows for the 3
  stocked only. Assert `No stock records found for: C2181XUW-P-ENG, SRTWCY8605.` — picks named strictly even
  if a sibling of a pick were stocked (belt-and-suspenders: a picked code is never family-suppressed).
- **V-ZS-R (byte-identical no-op — HARD GATE).** Same fixture with EVERY requested product carrying ≥1
  returned row → assert `user_response` byte-identical to the current LIVE `compile-current-state` on that
  input (no #3 line). Run the changed clone jsCode and the live jsCode against the same pinned input.
- **V-ZS-deadend (total-zero → NOT #3).** Fixture where all 3 products return zero rows (`answers:[]`,
  `has_result:false`) → assert `last_result_set===[]` and NO `No stock records found for:` line (the existing
  not-found/dead-end path is untouched). Make the assertion fail-on-purpose: temporarily point the fixture at
  a 1-row answer and confirm the line appears — proves the gate can go both ways (MEMORY: green-that-cannot-fail).
- **V-ZS-nonstock (domain gate).** A non-inventory answered turn (e.g. `order`) with resolved entities missing
  from results → assert NO #3 line (domain ∉ {inventory, incoming}).
- **V-ZS-compose (#2 + #3 order, only if #2 is in the target).** Fixture with 1 resolved-empty product AND 1
  unresolved dym token → assert order is stock rows → `No stock records found for: <resolved-empty>.` →
  `Couldn't find these: <dym>`; assert the resolved-empty code is NOT in the dym block and the dym token is
  NOT in the #3 line (disjointness). If #2 is not yet in the clone, record as **N/A pending #2**.
- **V-ZS-e2e (best-effort, real reformulator — regression guard, `deterministic` change unaffected).** Via
  `chat-stateful`: T1 `check stock for SRTWT902, C2181XUW-P-ENG` → assert answer shows `SRTWT902` rows +
  `No stock records found for: C2181XUW-P-ENG.`; and the dym multi-pick repro (`1,4,5,6,7`) →
  `No stock records found for: C2181XUW-P-ENG, SRTWCY8605.`. If the live data no longer matches (stock
  changes over time), record as **unverified** — V-ZS0 remains the gate.

---

## 6. Acceptance fixture (§ZS) — REVISED (pin `resolve-entity.resolutions`, not `compatible_entities`)
`domain_hint:'incoming'`, `message_type:'business_query'`, `manualResponse:false`, `isEscalateBranch:false`.
**`resolve-entity` output** `resolutions` = 3 single-exact product tokens (order = query order):
`[{token:'SRTWT902', resolved:true, matches:[{entity_type:'product', canonical_code:'SRTWT902', match_tier:'exact'}]},`
` {token:'C2181XUW-P-ENG', resolved:true, matches:[{'product','C2181XUW-P-ENG','exact'}]},`
` {token:'SRTWCY8605', resolved:true, matches:[{'product','SRTWCY8605','exact'}]}]`; `tokens:[...]`.
No dym pick (`qf.dym_offer_pick_code` unset; `get-session-vars` has no `dym_offer.picked`). get-results
`answers` (via `central-exchange`/`getResultObj`) = ≥1 row whose `fields` include
`{label:'Product Code', value:'SRTWT902'}` (and no row for the other two). `last_result_set.length >= 1`.
*(For the variant-suppression flagship, see V-ZS-variant §5: a single ambiguous token with one exact + four
prefix siblings.)*

**Acceptance (all hold):**
1. `user_response` ends with `\n\nNo stock records found for: C2181XUW-P-ENG, SRTWCY8605.` (order = query
   order; exact wording).
2. The two named codes are exactly the resolved products absent from `returnedCodes`; `SRTWT902` (present)
   is NOT named.
3. `variables.response`, `variables.last_result_set`, `variables.dym_offer`, `variables.selection_context`,
   `quick_reply` byte-identical to pre-change on the same input (Q6).
4. Reduce the fixture so all 3 products have a returned row → `user_response` byte-identical to live (V-ZS-R).
5. All-zero fixture → no #3 line, `last_result_set===[]` (V-ZS-deadend).
6. **§0 S1–S8**: offline unit — no egress at all; S7a/S7b sink-delta zero/attributed; S4 read tool only; S5
   `is_test:true`; S6 deterministic → 0 LLM tokens.

**Promotion:** 1-node business diff (`compile-current-state`, target by NAME), user-gated, backup-first,
byte-SHA gated both sides (LESSON 57/58). Publishes independently of #1 (`build-suggest-offer`) and #2
(parser + its `compile-current-state` hunks). If #2 promotes in the same window, build the target as **live +
both hunks** and re-diff (LESSON 57).

---

## 7. Risks needing USER decision before coding

- **R-ZS1 — RESOLVED by this revision (was: name the exact requested code even when a variant has stock).**
  The user's decision reverses the original recommendation: #3 must key on customer-REFERENCED codes only and
  MUST NOT name silently-expanded siblings; a typed code with a stocked variant is now SUPPRESSED (family
  rule, Q3′). No open question.
- **R-ZS2 (design toggle — flag, recommend INCLUDE).** The "sole unambiguous referent" branch (§Q1′ (1) case
  2): a customer types a PARTIAL code that prefix-matches exactly ONE product (no exact-tier hit,
  `resolved===true`) — e.g. types `C2181` → resolves uniquely to `C2181XUW-P-ENG`. Strictly, that full code
  was not "typed literally." Options: **(a) INCLUDE** it in the requested set (recommended — it is the
  unambiguous referent, `resolved===true`, and mirrors the gate's own `products.length===1` pass-through), or
  **(b) EXCLUDE** — restrict the typed set to `match_tier==='exact'` + picks only (drop the `else if
  (prods.length===1)` branch; a one-line change). This only affects partial-code typing; it never names a
  sibling either way. **Decision needed** before the coder locks §2′.
- **R-ZS3 (degradation, low-likelihood — record, no decision needed).** In resolver **AND-mode**
  (`resolver.intersection`, no per-token `resolutions[]`) there is no per-token family, so family suppression
  (Q3′) cannot apply → typed codes are matched strictly per-code. A typed-exact code that is empty while its
  sibling is stocked would then be NAMED in AND-mode (the variant-suppression preview would not fire).
  AND-mode is rare for product stock queries (it is the multi-token intersection path); the common OR-mode
  path is fully covered. Recorded, not a blocker.
- **No parser/get-results/output_exchange edit is needed** — `compile-current-state` already reads both
  `resolve-entity` (as `resolverJson`) and `get-session-vars` (as `_prevOffer`), so the revised requested-set
  derivation is in-reach with no new upstream dependency; the get-results sub is NOT touched
  (blast-radius-minimal, per the out-of-scope instruction).
