# Change: `dym-probe-before-offer` — annotate did-you-mean candidates with whether they HAVE the thing

**Scope: `deterministic`** (plan §8 — "branching, formatting, gates, egress, state, RAG selection"; the
parser is pinned via `mock_reformulator_output`, get-results runs real/read-only).
**Build target: the clone `txiPzSxy3Pclsz6v` ONLY.** Promotion is user-gated and out of scope.
**UAC family: `§DP`** (`tests/uac/DP.md`).

Export baseline for every line number and claim in this document:
live spine `f03086ac`, clone `545210e7`, `sub-get-results` `61b65e5f`, verified
`python3 n8n-workflows-init/scripts/export-workflows.py --verify` on 2026-08-07.

> 🚩 **The live spine moved while this change was being specified** — the change request was written
> against export `24888eca`; live was at `f03086ac` when this plan was authored, and the export was stale
> and refused to verify. All line references below are re-derived against `f03086ac`. Anyone picking this
> up must re-run `--verify` before trusting the numbers again.

---

## 1. Problem (measured 2026-08-07, do not re-measure)

`build-suggest-offer` D1 "did you mean" suggests candidates on **lexical code similarity only**.
`tokenCandidates()` (`export/live-spine-sorento-consume-main/nodes/build-suggest-offer.js:138-152`)
filters on: has `canonical_code`, `!isExact`, `entity_type ∈ gate_debug.allowed_lookup`, dedup — then
`cap3`. It never checks whether a suggested product actually **has** the thing the user asked for.

From 354 live-spine executions (~16 h real prod traffic, dev contact `437264483` excluded):

| signal | value |
|---|---|
| dym offers | 35 |
| got a code pick | 9 |
| **dead-ended after the pick** | **6 (67 % of picks)** |
| ignored the offer entirely | 22 |
| domain mix | product_attachment 16, inventory 14, master_products 2, incoming 2, order 1 |
| product_attachment picks | 4 dead-end vs 2 answered |

Real dead-ends: `"Cert"` → picked `MWC7601-RL-P`; `"ibwc8315-s10 cert"` → `IBWC8315-S`;
`"Have stock SRTUB2232-1600?"` → `SRTBT2232-1600`.

**Annotate, never drop.** Show all candidates, label which have the thing. A hard filter hides a real
document when the parser's `attachment_type` scoping is wrong; under-offering is invisible, over-offering
is at least visible.

---

## 2. 🚩 FINDINGS THAT CHANGE THE SETTLED DESIGN

Two of these are **blockers**: implementing the design as written would ship a feature that is
confidently wrong rather than merely inert. Read §2 before §3.

### F1 — BLOCKER: `crm_resource_attachments_list` is the WRONG probe tool. Use `crm_master_product_attachments_list`.

The domain map in the change request specifies
`product_attachment: { tool: 'crm_resource_attachments_list' }`. Three independent facts make that tool
unusable here (all read-only from `/Users/tehjayson/Documents/foundryx/sorento_crm`):

1. **It does not accept `product_ids`.** `sorento_crm_mcp/server.py:60-63` —
   `TOOL_REQUIRED_NARROWING_FILTERS["crm_resource_attachments_list"] = ("attachment_ids",
   "directory_id", "attachment_type_id", "uploaded_by")`, and `catalog.py` gives it no `product_ids`
   query param at all. `entity-ids-transformer.js` would emit `product_ids` for the candidates and the
   tool would ignore them, then hit `_missing_narrowing_filters` and return an **empty page**.
2. **It is hard-pinned to a different corpus.** `server.py:120` —
   `TOOL_DEFAULT_QUERY_PARAMS["crm_resource_attachments_list"] = {"direct_access_only": "true"}`. It is
   the *global dealer-downloadable document library*, not per-SKU product↔attachment links.
3. **Its render envelope has no product code.** `presenters.py:564-572` `_resource_attachments` does
   `b.item(name, [("File Name", name)])` where `name = original_filename or stored_filename`. So
   `answers[].title` is a **filename** and `fields` carries only `File Name`. The attribution parser the
   design reuses (`title`, else `fields` where label matches `/product\s*code/i`) can **never** match.

Consequence if shipped as specified: `hasIt` is always empty → **every candidate labelled "no
certificate", including the ones that have it.** That is worse than today.

**Correct tool: `crm_master_product_attachments_list`.**
- `server.py:40` — narrowing filters `("product_ids", "attachment_ids", "certificate_ids")`.
- `catalog.py:137-138` — query params include `product_ids`, `attachment_type_ids`, `certificate_ids`.
- `presenters.py:592-...` `_product_attachments` does
  `b.item(prod.get("product_code"), [("Product Code", prod.get("product_code")), …,
  ("Attachment Type", _att_type(att)), …])` — **title = product code, a `Product Code` field, and an
  `Attachment Type` field.** The shipped attribution parser works verbatim, and the `Attachment Type`
  field enables the F3 cross-check.

### F2 — BLOCKER: `crm_inventory_stock_balance_list` fails OPEN on an empty filter, and returns genuine-zero rows.

`catalog.py:378-398`, tool description, verbatim two clauses:

> "**ALL FILTERS OPTIONAL** — call with none to span every product + active warehouse."
> "Rows whose on-hand is 0 ONLY because the latest stock movement was a SYSTEM_ADJUSTMENT … are always
> hidden; **a genuine 0 is still returned.**"

Two distinct defects follow:

- **F2a — unscoped-probe hazard.** If `dym_probe_entities` yields no product uuid, `product_ids` is
  empty and the probe returns *the entire stock table* (paged). `hasIt` then contains basically every
  product code → **every candidate labelled "has stock"**. This is a large unnecessary prod read AND a
  100 % false-positive annotation. `dym-transform` MUST hard-gate `probe_needed=false` on
  `dym_candidate_uuids.length === 0`. (`crm_master_product_attachments_list` fails *closed* here —
  empty page — so the guard matters most for inventory, but it is unconditional.)
- **F2b — row presence ≠ has stock.** `presenters.py:_stock` emits one item **per product × per active
  warehouse**, including rows whose `Quantity On Hand` is a genuine `0`. Presence-based attribution
  therefore labels a zero-stock product "has stock".

  > **This is exactly why the sibling-picker attribution cannot be block-copied.** It works for
  > `crm_incoming_stock_list` because that tool returns a row *only where incoming exists*
  > (`annotate-incoming-picker.js:4-5` states the assumption). That property does **not** generalize.

  So for `inventory` the annotation predicate is **`sum(Quantity On Hand) > 0` across that product's
  rows**, not row presence. Field label is exactly `Quantity On Hand`; `_qty()` renders it as a plain
  numeric string, and the absent case renders the literal `"—"` (treat as 0).

### F3 — the `attachment_type` uuid landmine is concrete, and it produces a FALSE POSITIVE, not a no-op

The change request asks to verify the resolver returns a uuid for the attachment_type/certificate
entity. It is structurally reachable that it does **not**, and the failure mode is worse than assumed.

`disallowed-entity-gate.js:59-64` satisfies the `product_attachment` required-type check from a **union
of resolver entity types AND raw parser hints**:

```js
const haveTypes = new Set([
  ...entities.map(e => e.entity_type),
  ...(parser.entities ?? []).map(e => e.hint),      // ← parser HINT, no uuid
]);
```

So the gate can pass with `attachment_type` present only as a parser hint and **zero attachment_type
uuid in `compatible_entities`**. When the resolver *does* match it, `disallowed-entity-gate.js:114-118`
pushes it into `exact_entities` **with** a uuid, and lines 215-221 make `compatible_entities =
exact_entities` — so the good path exists. The bad path is silent.

With the corrected tool (F1), a probe scoped by `product_ids` only — no `attachment_type_ids` — returns
**every attachment of every type** for those products. A candidate that has a brochure and no
certificate is then labelled **"has certificate"**. Not a silent no-op that looks green: a silent
**wrong answer that looks green**.

Mandatory handling, both layers:
- **Layer 1 (fail-closed gate).** `dym-transform` sets `probe_needed=false` for `product_attachment`
  unless at least one entity of `entity_type ∈ {attachment_type, certificate}` with a UUID-shaped
  `uuid` is present in `gate.compatible_entities`. False → today's un-annotated offer.
- **Layer 2 (defence in depth).** `dym-annotate` counts an answer row toward `hasIt` **only if** its
  `Attachment Type` field is present. If the probe returns rows with no `Attachment Type`, treat the
  probe as unscoped and set `ok:false` (no annotation) rather than annotating.

Verification task **§6-DP-V1** turns this from an assumption into a GO/NO-GO gate.

### F4 — `disallowed-entity-gate` fuzzy-match leak: REAL, domain-dependent, and NOT fixed here

Investigated read-only as instructed. The change request cites `disallowed-entity-gate.js:26-33`; on live
`f03086ac` the flatten is at **lines 28-35** (offsets moved).

```js
const flat = [
  ...(resolver.resolutions ?? []).flatMap(r => r.matches ?? []),
  ...(resolver.intersection ?? []),
  ...Object.values(resolver.by_entity_type ?? {}).flat(),
];
```

Confirmed: **no `match_tier` filter.** But the impact is domain-dependent, and the change request's
framing is broader than the code:

- For the two `REQUIRE_SPECIFIC_DOMAINS` (`incoming`, `product_attachment`, line 81), lines **215-221**
  later **overwrite** `compatible_entities` with either the option-uuid set (when prompting) or
  `exact_entities` (when not). Fuzzy non-exact matches are therefore **not** passed to the real lookup
  in those two domains.
- For **every other domain — including `inventory`, one of the two domains this change enables** —
  `compatible_entities` stays the unfiltered flatten, so **non-exact fuzzy matches DO enter the real
  lookup.**

**This is a real defect.** It is *not* folded into this change (LESSONS §51 — stage an unowned delta as
its own publish). Recorded here and to be filed separately. It matters to this change only as context:
the inventory probe deliberately sources candidate uuids from `tokenCandidates()` (the resolver's own
per-token `matches`/`alternatives`), **not** from `compatible_entities`, so this change neither depends
on nor worsens the leak.

### F5 — coverage boundary: `build-suggest-offer` has 3 inbound; only ONE gets annotated

Live and clone are structurally identical here. Current inbound to `build-suggest-offer`:
`sibling-gate[1]`, `sibling-probe[0]`, `annotate-incoming-picker[0]`.

D1 can fire on **all three** — `build-suggest-offer.js:42-102` (D3) returns early only when
`extras.length > 0`; otherwise it falls through to D1, and on the `annotate-incoming-picker[0]` inbound
D3 is skipped entirely (`sibXfRan` false).

Rewiring only `sibling-gate[1]` therefore means: **D1 offers arriving via `annotate-incoming-picker[0]`
or `sibling-probe[0]` are un-annotated by construction.** Accepted for phase 1 (both are `incoming`-domain
paths, and `incoming` is not an enabled domain). It must be **asserted**, not assumed — §DP-12 — so it
never gets silently mistaken for coverage.

### F6 — `sibling-probe`'s `workflowId` is already correct per-target; the OTHER two are not

Re-confirmed on `f03086ac` / clone `545210e7`:

| node | LIVE `workflowId` | CLONE `workflowId` |
|---|---|---|
| `sibling-probe` | `Fss5aAaXthJSWpZCgKiKR` (live sub-get-results) ✅ | `rysSPgUssLDf6xJc` (`sub-get-results TEST`) ✅ |
| `crossdomain-probe` | `Fss5aAaXthJSWpZCgKiKR` ✅ | `rysSPgUssLDf6xJc` ✅ |
| `probe-incoming` | **`rysSPgUssLDf6xJc`** 🚩 | `rysSPgUssLDf6xJc` |
| `Call 'sub-get-results'` | **`rysSPgUssLDf6xJc`** 🚩 | `rysSPgUssLDf6xJc` |

So **copying `sibling-probe` wholesale gives the right target on each build**, which is the reason it is
the template. **Never copy `probe-incoming`** — the two 🚩 rows are the known live-calls-the-TEST-fork
landmine (memory `live-calls-getresults-test-fork`; `tool-loop-removal-plan.md` §6 P0), still present on
`f03086ac`. Report; do not correct it in this diff.

---

## 3. Design

Template: the shipped `incoming` sibling picker
`sibling-gate → family-fetch → sibling-transform → sibling-probe → build-suggest-offer`.

### 3.1 Domain map (map-driven; a third domain is one entry, not four nodes)

```js
// dym-transform — the ONLY place a domain is enabled.
const DOMAIN_PROBE = {
  product_attachment: {
    tool:      'crm_master_product_attachments_list',   // F1: NOT crm_resource_attachments_list
    noun:      null,                                     // from attachmentNoun() at render time
    predicate: 'row_present_with_type',                  // F3 layer 2
    requires:  ['attachment_type', 'certificate'],       // F3 layer 1: ≥1 uuid of these types
  },
  inventory: {
    tool:      'crm_inventory_stock_balance_list',
    noun:      'stock',
    predicate: 'qty_gt_zero',                            // F2b: NOT row presence
    requires:  [],
  },
};
```

`predicate` and `requires` are part of the map on purpose: a future domain declares its
has-it semantics rather than inheriting `incoming`'s presence rule, which F2b proves does not generalize.

> ### 🔴 MANDATORY CHECK BEFORE ADDING ANY `DOMAIN_PROBE` ENTRY — `cs-offer-gate`
>
> *(Added 2026-08-07, reviewer F-MERGE. This is a safety gate, not a style note.)*
>
> `cs-offer-gate` merges the suggest-offer message with the **customer-service member roster**
> when **all three** hold: `escalate-catalog.is_escalate_offer === true` **and**
> `routing.suggested_team === 'customer_service'` **and**
> `routing.suggested_agent === 'order_enquiries'`.
>
> On a merged message a **digit reply is consumed as a roster pick**, which sets
> `is_escalation_confirmation:true` + `preferred_assignee_id` and **assigns a real staff member**
> — on live, an email/WhatsApp ripple. The annotated D1 render is a **numbered** list, so on a
> merged message a customer picking a product by number would silently escalate and assign.
>
> The two domains enabled today (`product_attachment` → `purchasing_certification`,
> `inventory` → `warehouse`) never satisfy clause 2, so an annotated offer and the CS roster are
> disjoint **today**. **That disjointness is a routing coincidence, not a guard** — nothing in
> `DOMAIN_PROBE`, `dym-transform` or `dym-gate` ties membership to a non-`customer_service` team.
>
> **So: before enabling any new domain (`order` and `master_products` are the obvious candidates,
> and `order` routes straight to `customer_service`/`order_enquiries`), verify its routing against
> those three clauses. If it can satisfy them, the digit-hijack must be fixed first** — the
> annotated render needs suppressing on merged messages, or the numbering removed. Do not enable
> the domain and rely on the coincidence holding.
>
> The underlying digit-hijack is pre-existing (`compile-current-state.js:76` vs `:191`) and is
> filed separately; this change neither introduces nor widens it (numbering is gated on
> `_dymAnnotate`, which requires an enabled domain).

### 3.2 New nodes

**1. `dym-transform` (Code, pure).** Mirror of `sibling-transform.js`. Lifts the `tokenCandidates()`
logic out of `build-suggest-offer` (same filters: has `canonical_code`, `!isExact`,
`entity_type ∈ gate_debug.allowed_lookup`, dedup, `cap3`) and applies the same
`missResolutions` selection. Every `$('x')` read wrapped in try/catch — it must never throw.
Emits **exactly ONE item** so the probe batches:

```
{
  dym_probe_entities:  [ {uuid, entity_type, code} … ],  // candidates + the scoping entities
  dym_candidate_codes: [ "<code>" … ],                    // cap3, render order, pre-sort
  probe_tool:          "<tool>" | null,
  probe_noun:          "stock" | null,
  probe_predicate:     "qty_gt_zero" | "row_present_with_type",
  probe_needed:        true | false,
  probe_skip_reason:   "<why>" | null,
}
```

`dym_probe_entities` = the candidate products `{uuid, entity_type:'product', code}` **plus** every
`attachment_type` / `certificate` entity from `gate.compatible_entities`, because
`sub-get-results`'s `entity-ids-transformer.js:6-20` maps `attachment_type → attachment_type_ids` and
`certificate → certificate_ids` and needs those uuids to scope the probe.

`probe_needed` is TRUE only when **all** hold — each is a named `probe_skip_reason` when false:
- `DOMAIN_PROBE[domain]` exists (domain read from `gate.gate_debug.domain`, falling back to
  `q.domain_hint`);
- exactly one surviving D1 token (`_survivors.length === 1`) — see §3.4 scope;
- ≥1 candidate carries a UUID-shaped `uuid` → **F2a guard, unconditional**;
- for a domain with non-empty `requires`: ≥1 `gate.compatible_entities` entity whose `entity_type` is in
  `requires` and whose `uuid` is UUID-shaped → **F3 layer 1**.

**2. `dym-gate` (If).** Single condition, `{{ $json.probe_needed }} === true`.
**False branch = today's behaviour, byte-identical.**

**3. `dym-probe` (Execute Workflow).** Copy `sibling-probe` wholesale (F6 makes this the safe copy).
- `workflowId`: **`rysSPgUssLDf6xJc` on the clone** (what the copy already yields);
  `Fss5aAaXthJSWpZCgKiKR` on any live target. Set as ONE leaf via `setNodeParameter`
  `/workflowId/value` — **never block-copy `workflowInputs.value`** (LESSONS §48).
- `tool`: `={{ $('dym-transform').first().json.probe_tool }}` — read, **not hardcoded**.
- `entities`: `={{ $('dym-transform').first().json.dym_probe_entities }}`.
- `user_prompt` and `semantic_input`: **verbatim from `sibling-probe`.**
- `onError`: **`continueRegularOutput`.** Explicitly **NOT** `continueErrorOutput` — an unwired `main[1]`
  makes a failed run report success (LESSONS §61a, memory `unwired-error-output-masks-failure`).
  Failure is detected downstream by **payload shape**, never by node status.

**4. `dym-annotate` (Code) — load-bearing.** `build-suggest-offer.js:6` does
`{...$input.first().json}` and expects the **not-found payload**. Wiring `dym-probe` straight in would
replace it and lose `escalate_message` / `is_clarification` / `found_summary`
(`not-found-error-message.js:243-246`) on the D1 fall-through. So, same move as
`annotate-incoming-picker.js`:

```js
const out = { ...$('not-found-error-message').first().json };
```

(spread, not `annotate-incoming-picker`'s aliasing `const out = gate;` — do not mutate the upstream item)

then attach:

```js
out.dym_available_codes = [ "<lowercased code that HAS the thing>" … ];
out.dym_probe_meta = {
  ok: true|false, tool, noun, predicate,
  probed:       [ "<lowercased candidate code>" … ],
  answer_count: <n>,
  reason:       "<why not ok>" | null,
};
```

Answer parsing is the **existing verbatim** logic — `annotate-incoming-picker.js:6-17` /
`build-suggest-offer.js:55-65`: `answers = probe.answers ?? probe.items ?? []`; per answer,
`code = a.title`, else `a.fields.find(x => /product\s*code/i.test(x.label)).value`; `norm()` =
trim+lowercase. **Do not invent a third variant.** On top of that, per `predicate`:
- `qty_gt_zero` — accumulate `Number(fields.find(label === 'Quantity On Hand').value)` per code
  (`"—"`/absent/NaN → 0); a code enters `available` only when the sum is `> 0` (F2b).
- `row_present_with_type` — the row counts only if it has an `Attachment Type` field with a non-empty
  value; if **zero** answer rows carry `Attachment Type` while `answer_count > 0`, set
  `ok:false, reason:'unscoped_probe'` and annotate nothing (F3 layer 2).

`ok:false` whenever the probe payload carries `error`, or has no `answers`/`items` array, or the
unscoped-probe check trips. **`ok:false` ⇒ zero annotation ⇒ today's offer** (fail-open, §3.6).

### 3.3 Rewire

Today: `sibling-gate[1] -> build-suggest-offer`. After:

```
sibling-gate[1]  -> dym-transform
dym-transform[0] -> dym-gate
dym-gate[0]      -> dym-probe
dym-gate[1]      -> build-suggest-offer
dym-probe[0]     -> dym-annotate
dym-annotate[0]  -> build-suggest-offer
```

`build-suggest-offer` ends with **4 inbound** (was 3). `sibling-probe[0]` and
`annotate-incoming-picker[0]` are untouched (F5). Nothing else in the graph reads `sibling-gate` or
`build-suggest-offer` by name except `compile-current-state → build-suggest-offer`, which is unaffected.

### 3.4 Edit to `build-suggest-offer.js`

At the `_survivors` build (`build-suggest-offer.js:181-183`) and the single-token D1 render
(lines 232-292):

```js
const _dymAnn = (() => { try {
  const n = $('dym-annotate');
  return n.isExecuted ? (n.first().json || {}) : null;
} catch (e) { return null; } })();
const _dymOk    = !!(_dymAnn && _dymAnn.dym_probe_meta && _dymAnn.dym_probe_meta.ok === true);
const _dymHas   = new Set(_dymOk ? (_dymAnn.dym_available_codes || []) : []);
const _dymProbed= new Set(_dymOk ? (_dymAnn.dym_probe_meta.probed || []) : []);
const _dymNoun  = _dymOk ? _dymAnn.dym_probe_meta.noun : null;
```

- Annotate a rendered line **only** when `_dymOk && _dymProbed.has(norm(code))`; suffix
  `` — has ${noun} `` / `` — no ${noun} ``. A code that was not probed gets **no suffix** (never a
  misleading "no").
- `noun` for `product_attachment` comes from the existing `attachmentNoun()`
  (`build-suggest-offer.js:126-131`), which already yields the right word; `inventory` uses the map's
  `'stock'`.
- **Sort has-first**, same comparator as D3 (`build-suggest-offer.js:81`):
  `(Number(b.has) - Number(a.has)) || String(a.code).localeCompare(String(b.code))`. Apply the sort to
  `picks` **before** `codes`, `suggest_last_result_set` and `dym_candidates` are derived, so all four stay
  index-consistent. When `!_dymOk`, no sort — order is byte-identical to today.

**Scope of the edit — explicit decisions the change request asked for:**

| D1 arm | annotated? | why |
|---|---|---|
| single-token **code mode** (`build-suggest-offer.js:268-287`) | ✅ **YES** | the measured dead-end path; all 6 real cases |
| single-token **numbered mode** (`:246-267`) | ❌ **NO** — and asserted **unreachable** for the enabled domains | numbered mode requires a uuid `canonical_code`, i.e. a promotion. `allowed_lookup` is `['product','category','brand']` for `inventory` and `['product','attachment','attachment_type','category','brand','certificate']` for `product_attachment` — **neither includes `promotion`**, so `tokenCandidates()` cannot yield one. No annotation code is added; if it somehow fires, the code-keyed lookup simply misses → today's behaviour (fail-open by construction). §DP-13b asserts unreachability. |
| **multi-token** D1 (`:189-230`) | ❌ **NO — explicitly out of scope**, must be byte-identical | it assigns a **global contiguous `idx`** that both `suggest_last_result_set` and `dym_candidates` are keyed on; has-first sorting would renumber across token blocks and is a round-trip regression risk out of proportion to the benefit (all 6 measured dead-ends were single-token). `probe_needed` is false when `_survivors.length !== 1`. §DP-13a is the byte-identity gate. |
| **D2** alternatives (`:294-416`) | ❌ **NO — out of scope** | D2 is a *data*-miss: its `alternatives[]` came back **from the domain tool itself**, so they are already known to have the thing. Probing them is redundant. |

### 3.5 🔴 `suggest_quick_reply` MUST stay bare codes

Code mode (`build-suggest-offer.js:274`) uses the candidate codes as **button labels**, and the pick
round-trips on that exact string through `output_exchange`'s `tryDymPick`. **Annotation goes into
`suggest_response` text ONLY.** `suggest_quick_reply` stays
`[...codes, YES, NO].map(s => String(s).replace(/,/g,'')).join(',')` — bare codes, comma-stripped.

This is the single easiest way to break the change. §DP-11 asserts it on every annotated case, and
§DP-FP-3 proves that assertion can go red.

Reordering `codes` (has-first) does change **button order** and therefore `suggest_last_result_set[idx]`.
Buttons are fine (code mode round-trips on the string, not the index), but the derived arrays must be
rebuilt from the **sorted** `picks` so a typed `"1"` and the rendered line 1 agree. §DP-11b.

### 3.6 Fail-open contract (binding)

A probe error, timeout, empty answer set, or unscoped-probe detection **degrades to today's
un-annotated offer**. It must never dead-end the turn or suppress the offer.

- `dym-probe` `onError: continueRegularOutput` — one output, no unwired error branch.
- `dym-annotate` detects failure by **payload shape**, never by node status (LESSONS §61).
- ⚠️ **VERIFIED 2026-08-07 by induced failure (execs `11517840`/`11517863`/`11517876`, all three
  lanes).** On this n8n, `continueRegularOutput` emits **`{error: "..."}`**, NOT the input item as
  originally designed. The **`error`-key branch is LOAD-BEARING — do not delete it as redundant.**
  The `_dym_probe_input` sentinel is retained, checked first, and covers the *hypothetical*
  input-passthrough behaviour (offline-exercised only); it guards the worst failure mode in this
  change, since a passed-through input can carry a legitimate `answers` key and would be misread as
  a successful empty probe → confident `- no <noun>` on every candidate. Full reasoning: diff §D7.
  Fail-open is provably complete across all three n8n behaviours: `{error}` (observed),
  input-passthrough (sentinel), halt (consumer-side `isExecuted`).
- `dym-transform` is pure and cannot throw (all `$('x')` in try/catch).
- `dym-gate` false and `_dymOk === false` both land on the identical un-annotated render path.
- No per-node timeout exists for `executeWorkflow` in n8n; `sibling-probe` ships without one and this
  keeps parity. **Accepted risk, recorded:** a hung probe adds latency to a not-found turn in two
  domains. Watch it against the obs-latency-contract budget after the first real run.

### 3.7 Cost / blast radius — MEASURED, rev 5 (supersedes the original estimate)

> The original text claimed *"All other domains and all answered turns: **zero new nodes
> executed**"*. **That was false from rev 4 onward** and is replaced here with measured numbers
> rather than a correction note.

**Where a probe can now fire — four surfaces, three lanes:**

| lane | trigger | renderer |
|---|---|---|
| `d1` | not-found turn, single genuine-miss token | `build-suggest-offer` D1 code mode |
| `d1` (picker) | **require-specific** turn in an enabled domain | `build-suggest-offer` annotating `escalate_message` (the gate's numbered picker) |
| `partial` | **answered** turn carrying ≥1 genuine-miss token | `compile-current-state` partial-resolution block |

`inventory` is not a `REQUIRE_SPECIFIC_DOMAIN`, so the picker surface is `product_attachment`-only.

**Measured inline cost on an answered turn** (tester, rev 4):

| node | cost |
|---|---|
| `dym-transform` | 20 ms |
| `dym-gate` | 1 ms |
| **`dym-probe`** | **361 ms** (typical range 232–458 ms; one 1.9 s outlier observed) |
| `dym-annotate` | 35 ms |
| **total added** | **≈ 417 ms** |

Against turns totalling **5.8–18.4 s**, that is **≈ 0.35 % of the p99-vs-lock-TTL budget**.
**No budget breach.** The 1.9 s outlier is the number to watch: there is still no per-node timeout
for `executeWorkflow` in n8n (§3.6), so a hung probe adds latency to a turn that would otherwise
have answered. Watch it against the obs-latency-contract budget.

**Still zero added cost** on: every non-enabled domain, every turn with no genuine-miss token, and
every turn where the F2a / F3 / F-DUPE guards fire — `dym-transform` and `dym-gate` run (pure,
~21 ms combined) and the gate goes false.

**Read volume:** at most **one** extra read-only CRM call per turn. The three lanes are mutually
exclusive (`If6` branches, and the tester confirmed disjointness from runData: on a partial turn
neither `Aggregate1` nor `dym-transform` appears), so they cannot compound.

---

## 4. Node/edge diff (by NAME, for the coder)

**Add 4 nodes:** `dym-transform` (Code), `dym-gate` (If), `dym-probe` (Execute Workflow, copy of
`sibling-probe`), `dym-annotate` (Code).
**Edit 1 node:** `build-suggest-offer` `jsCode` (§3.4).
**Remove 1 edge:** `sibling-gate[1] -> build-suggest-offer`.
**Add 6 edges:** as listed in §3.3.

Coder rules that apply here specifically:
- One `update_workflow` call, ≤100 ops, atomic (LESSONS §33).
- `setNodeParameter` paths are **relative to `parameters`** — `/jsCode`, `/workflowId/value`,
  **never** `/parameters/jsCode` (LESSONS §32b).
- Target by node **NAME**, not id (LESSONS §58c).
- Publish the clone after `update_workflow` (MCP edits land on a DRAFT — LESSONS §37).
- Re-run `export-workflows.py` after the build.

---

## 5. Prerequisites

| id | prerequisite | blocking? |
|---|---|---|
| **P1** | §6-DP-V1 passes: a real `product_attachment` cert turn shows an `attachment_type` **or** `certificate` entity with a UUID-shaped `uuid` in `disallowed-entity-gate.compatible_entities`. If it fails, `product_attachment` ships **disabled** in `DOMAIN_PROBE` and only `inventory` goes in. | **YES for the attachment half** |
| **P2** | §6-DP-V2 passes: `crm_master_product_attachments_list` render answers carry `Product Code` and `Attachment Type`. | **YES for the attachment half** |
| **P3** | §6-DP-V3 passes: `crm_inventory_stock_balance_list` render answers carry a parseable `Quantity On Hand`, and a genuine-zero row is observable. | **YES for the inventory half** |
| **P4** | Session hygiene: cases run in `mode=regress-capture` with the `respond_contacts_test` row reset between independent cases (LESSONS §31; memory `uac-mode-reads-prod-session` — `437264483`'s prod session is stale-contaminated and `uac` mode reads it). | YES |
| **P5** | Partial/ask-for-access contact still **TBD** — not needed by any §DP case, but carried forward as an open harness prerequisite. | no |

---

## 6. Verification tasks (planner-defined) — `§6-DP`

Each is a build-time GO/NO-GO, run read-only **before** the coder wires anything. Each must state the
compared-population count — an empty checker output is **never** a pass (LESSONS §61b).

- **§6-DP-V1 — attachment scoping uuid actually exists.** From a real live execution of a
  `product_attachment` certificate turn, read `disallowed-entity-gate.compatible_entities` and assert
  ≥1 entity with `entity_type ∈ {attachment_type, certificate}` **and** a UUID-shaped `uuid`. Print the
  full array and the count. **Fail ⇒ `product_attachment` is disabled in `DOMAIN_PROBE` for phase 1**
  (F3). Explicitly not an assumption.
- **§6-DP-V2 — attachment probe envelope.** Call `crm_master_product_attachments_list` (read-only) with
  a known `product_ids` + `attachment_type_ids` pair and assert `answers[].title` is a product code and
  `fields` contains both `Product Code` and `Attachment Type`. Assert the same call with
  `attachment_type_ids` **omitted** returns rows of mixed `Attachment Type` — this is the observation
  that proves F3's false-positive mode is real, and it is what layer 2 keys on.
- **§6-DP-V3 — inventory probe envelope + genuine zero.** Assert `Product Code` and
  `Quantity On Hand` fields present; find at least one product whose rows sum to `0` and record its
  code. That code is the fixture for §DP-14.
- **§6-DP-V4 — unscoped-probe guard.** Statically assert `dym-transform` cannot emit
  `probe_needed:true` with zero UUID-shaped candidate uuids (F2a). Run the node offline against a
  candidate set with all `uuid:null` and confirm `probe_needed:false` +
  `probe_skip_reason:'no_candidate_uuid'`.
- **§6-DP-V5 — probe target ids.** Assert from the workflow JSON (not memory) that `dym-probe`'s
  `workflowId.value` is `rysSPgUssLDf6xJc` on the clone, and that no `probe-incoming` parameter was
  copied into it (F6).
- **§6-DP-V6 — non-enabled-domain byte-identity.** Diff the changed `build-suggest-offer` jsCode against
  live on a pinned `order` / `master_products` / `promotion` fixture: output must be byte-identical
  (§DP-10).

---

## 7. Acceptance criteria

1. On a `product_attachment` D1 offer where the parser scoping uuid is present, the rendered
   `suggest_response` labels every offered code `— has <noun>` / `— no <noun>`, has-first, and
   `suggest_quick_reply` is still **bare codes**.
2. Same for `inventory` with `— has stock` / `— no stock`, where "has" means summed
   `Quantity On Hand > 0`.
3. Probe empty / probe error / probe unscoped / gate false ⇒ **byte-identical to today's offer**, turn
   never dead-ends.
4. Non-enabled domains, multi-token D1, numbered mode and D2 are **byte-identical to today**.
5. Every §DP assertion has been **shown to fail on purpose** (§DP-FP) before it is trusted.
6. §0 S1–S8 hold on every case.

## 8. Rollback

Clone-only build. Rollback = `publish_workflow` the prior clone versionId (`545210e7` at plan time) and
re-run `export-workflows.py`.

## 8b. 🚩 F-DUPE — cross-company code collisions (added 2026-08-07, reviewer §6.1)

**Correction to a root cause this plan did not anticipate.** `product_code` is unique **per
company** (`app/models/product.py:182`, `uq_products_company_product_code`). A code appearing under
two uuids is therefore **two different companies' products**, not a duplicate row — there is
nothing to clean up in the CRM. `tokenCandidates()` dedups by code and discards the second uuid,
so **arrival order decides which company the rendered line represents**. Both probe tools are
company-scoped, so the twin returns zero rows and the annotation would read `— no <noun>`: true of
the other company's product, printed where the customer reads their own.

**Shipped remedy (in `dym-transform`): exclude any code behind >1 candidate uuid from
`dym_candidate_codes` and `dym_probe_entities`.** It renders bare; its unambiguous siblings are
still labelled. Recorded as `dym_excluded_codes[]` and, when it is the sole cause of an empty
candidate set, as `probe_skip_reason: 'multi_uuid_code'`.

**Do NOT "fix" this by unioning the twin uuids into one probe.** The pick path
(`output_exchange.applyDymPick`) resolves a **single** `dym_candidates` uuid, and the probe's
render envelope carries **no product id**, so a union answers over a set while the follow-through
queries one — `— has` then a dead-end on the empty twin, a false promise on top of the dead-end
this change exists to remove. And because every unioned entity is `entity_type: 'product'` and
mappable, the F2a guard does not catch it: **mechanically safe, semantically wrong, tests green.**

**Consequence for §3.1:** a new `DOMAIN_PROBE` entry inherits this guard automatically (it is
domain-independent), but if a future domain's tool is **not** company-scoped, re-derive whether
exclusion is still the right posture before enabling it.

## 8c. 🚩 THIRD renderer — `compile-current-state` partial-resolution (added 2026-08-07, rev 4)

This plan assumed `build-suggest-offer` D1 was the only did-you-mean renderer. **It is not.**
`compile-current-state.js` renders its own did-you-mean on **partially-resolved** turns (some
entities answered, others missed), with its own `_numbered`/`_dymCands` and its own global
contiguous `idx`. §5/§F5's coverage analysis missed it entirely because it enumerated inbounds to
`build-suggest-offer` rather than searching for the *rendered text*.

`dym-annotate` is **not reachable** from it: the partial block fires on the `central-exchange`
(results) lane, and the dym chain lives on the not-found lane. A second lane was added
(`dym-transform-partial` → `dym-gate-partial` → `dym-probe-partial` → `dym-annotate-partial`), with
the bodies provably shared rather than forked.

**Two consequences for this plan's own claims:**
- **§3.7 is now wrong.** "All other domains and all answered turns: zero new nodes executed" no
  longer holds — an *answered* turn carrying a genuine miss in an enabled domain now runs the
  partial lane and issues one CRM read.
- **§3.4's multi-token exclusion is inherited by a renderer that shows up to 5 tokens**, so the
  un-annotated multi-token case is more visible here than in D1. Lifting it is low-risk on this
  renderer (it does not sort), but `probe_needed` is a shared gate — treat as a follow-up.

**Lesson for the next renderer:** enumerate by *rendered string* ("did you mean"), not by graph
inbound. There may be a fourth.

## 8d. 🔴 THE RECURRING DEFECT CLASS IN THIS CHANGE — wrong-object assertions

Three times in one change, in the same shape: **computed correctly, rendered bare, every gate green.**

| # | surface | why it was missed |
|---|---|---|
| 1 | `compile-current-state` partial-resolution (rev 4) | coverage enumerated by **graph inbound** to `build-suggest-offer` |
| 2 | `disallowed-entity-gate` require-specific picker (rev 5) | same |
| 3 | picker annotation **discarded** by `escalate-catalog` (rev 6) | `escalate-catalog` re-sources `escalate_message` **by name** from the node upstream of the whole chain; `build-suggest-offer` correctly spreads rather than mutates, so its annotated output was never consumed |

**This is NOT §61's "green that cannot fail".** Those assertions were broken. These are sound,
can go red, and are pointed at **the wrong object** — an intermediate node's output rather than the
text the customer receives. #3 is also just the repo's oldest landmine (LESSONS §5 / TOPOLOGY's
*Read BY NAME* section) on the read side: reachability proved the payload *reached* the renderer,
and nothing checked where the rendered text was *sourced from*.

**Binding for any future renderer work on this spine:**
1. **Enumerate renderers by RENDERED STRING**, never by graph inbound. Inbound-enumeration missed
   two of four surfaces here. Grep the user-facing phrase across every Code node.
2. **Find who re-sources the annotated field by name — in all three search forms.** That set, not
   the edge list, is the true consumer list. A line-based `grep "$('"` is **not enough**: scan for
   `$('X')`, the `$("X")` quote variant, **and the two-hop form**
   (`const v = $('X'); const j = v.first().json; … j.key`) which is what hid the rev-6 defect and
   what a line grep cannot see. Bind the handle to a variable and follow it, or grep the FIELD name
   and walk back to its source.
3. **Every surface needs a rendered-text assertion** on the terminal consumer, and that gate must be
   shown to **discriminate** (run the pre-fix consumer against the post-fix producer and confirm the
   annotation is absent).

Recorded as LESSONS §63.

## 8e. Renderer sweep — what was found, and what was CONSIDERED AND EXCLUDED

The rendered-string sweep (§8d rule 1) found **five** numbered/candidate renderers on this spine.
Recording all five, including the excluded one, so the next person running the sweep does not
re-discover it and wonder whether it was missed.

| # | renderer | annotated? |
|---|---|---|
| 1 | `build-suggest-offer` D1 **single-token CODE mode** | ✅ yes |
| 2 | `compile-current-state` partial-resolution | ✅ yes |
| 3 | `disallowed-entity-gate` require-specific picker (via `build-suggest-offer`) | ✅ yes |
| 4 | `annotate-incoming-picker` (`incoming` require-specific picker) | ✅ pre-existing (`— has incoming`) |
| 5 | **`build-cs-member-offer:22`** — the CS **member** roster | ❌ **CONSIDERED AND EXCLUDED** |

**Why #5 is excluded, on principle rather than by omission:** its candidates are **people**, not
products. There is no has/no attribute to probe — no CRM tool answers "does this CS member have a
certificate/stock" because the question is meaningless. No `DOMAIN_PROBE` entry could ever apply.
It is also a *different* pick semantic (assigning a human, with the staff-ripple hazard in F-MERGE),
so annotating it would be a new feature, not an extension of this one. **Do not add it.**

### ⚠️ "Surface 1" is one ARM of `build-suggest-offer`, not the whole node

The four-surface framing above understates what is left bare, and invites the reading that "all dym
output is annotated". It is not. Within `build-suggest-offer` there are **four arms**, and only one
is annotated:

| arm | annotated? | why |
|---|---|---|
| D1 single-token **code mode** | ✅ **yes** | the measured dead-end path; all 6 real cases |
| D1 single-token **numbered mode** (uuid/promotion candidates) | ❌ no | asserted unreachable for the enabled domains (§3.4, §DP-13b) |
| D1 **multi-token** | ❌ no | global contiguous `idx` + has-first sort = round-trip regression risk (§3.4). *Note the PARTIAL renderer's multi-token IS annotated — it does not sort (§8c).* |
| **D2** alternatives (both arms) | ❌ no | alternatives came back **from the domain tool itself**, so they are already known to have the thing — probing is redundant |

All three unannotated arms are held byte-identical by `byteid.js`. So the accurate summary is:
**one of four `build-suggest-offer` arms, plus the partial renderer, plus the two require-specific
pickers.**

## 8f. 🔴 SHIPPED DEFECT — silent page truncation on the multi-token PARTIAL lane

*(Found 2026-08-08 while planning `plans/immortal-hint-class-plan.md` C3, which extends multi-token
probing to the D1 lane. **This defect is already promoted**, on the partial lane, since rev 4.
Mitigations are specified in that plan §4.5 and apply to both lanes because the node bodies are
shared. Recorded here because this is the plan that shipped it.)*

`dym-transform:235` already passes **all** `_survivors` when `_isPartialLane`, and
`compile-current-state:340` surfaces `missResolutions.slice(0, 5)` with `cap3` — so a partial-lane
probe can carry **5 × 3 = 15 candidates** in one call. Three facts, each verified read-only:

1. **No limit is ever set.** `TOOL_DEFAULT_QUERY_PARAMS` (`sorento_crm_mcp/server.py:110-131`) has
   **no entry** for either probe tool, and `entity-ids-transformer.js` never emits a `limit`/`page`
   param. The backend default applies: `app/schemas/common.py:37` `limit: int = 50`.
2. **Truncation is structurally UNDETECTABLE.** The render envelope (`presenters.py:806-818`) is
   `{result_type, intro, items, attachments, action_links, last_updated_at, has_result}` plus
   `_PASSTHROUGH_KEYS` (`:91-103`). **No `total`, no `pagination`, no `page`/`limit`.** Even if the
   CRM added one, `output-structurer.js:84-95` forwards only nine keys and would drop it.
3. **The failure mode is a confident false negative.** A candidate whose rows fell off page 1
   returns zero rows ⇒ `- no stock details` / `- no certificate` about a product that **has** the
   thing — the exact class this change exists to remove.

`inventory` is the worst case: one row **per product × per active warehouse**, genuine zeros
included (§2 F2b), so 15 candidates × ≥4 warehouses breaches 50. `product_attachment` is additionally
scoped by `attachment_type_ids` and is tighter, but 15 × 3 attachments-of-type also breaches it.

**Mitigation (both fail-open, both in the Change C build):** (i) a per-domain `probe_cap` in
`DOMAIN_PROBE` with the overflow rendered **bare**; (ii) saturation detection in `dym-annotate` —
`answers.length >= 50` ⇒ `ok:false, reason:'page_saturated'` ⇒ zero annotation. (i) bounds the
common case, (ii) catches a wrong assumption in (i). UAC: `§IH-13`, `§IH-14`, `§IH-15`.

**Better long-term end state (CRM-side, spec only):** set an explicit `limit` in
`TOOL_DEFAULT_QUERY_PARAMS` for both tools, and add `total`/`has_more` to the render envelope so
truncation becomes **detectable** rather than merely avoidable.

## 8g. 🚩 §3.4's multi-token exclusion is LIFTED for D1 by Change C — and the stated reason was narrower than it read

§3.4 excludes multi-token D1 because the block assigns a **global contiguous `idx`** and has-first
sorting would renumber across token blocks. **The objection was to the SORT, never to the SUFFIX.**
`plans/immortal-hint-class-plan.md` C3 annotates **without re-sorting**, which dissolves it.

Two corrections to §3.4's framing, both verified against the shipped code:

- **`suggest_quick_reply[i] === suggest_last_result_set[i].value` does not apply to multi-token.**
  That block sets `out.suggest_quick_reply = [YES, NO]…` (`build-suggest-offer.js:278`) — **no codes
  at all**; numbers are typed, not buttoned. There is no index correspondence to preserve there.
- **The exclusion stopped being a rare edge case.** With one stuck entity in session state, every
  turn carries ≥2 missed tokens, so every turn takes the multi-token path and the annotation becomes
  **permanently unreachable**. Six consecutive live turns did exactly this. §8e's "one of four
  `build-suggest-offer` arms" framing understated the customer-visible cost of the exclusion.

## 9. Out of scope / filed separately

- **F4** — `disallowed-entity-gate` non-exact fuzzy matches entering the real lookup for every
  non-`REQUIRE_SPECIFIC` domain (incl. `inventory`). Real defect; own change, own publish.
- **F6 🚩** — live `Call 'sub-get-results'` and `probe-incoming` pointing at `rysSPgUssLDf6xJc`
  (`sub-get-results TEST`). Pre-existing on `f03086ac`. Report; do not bundle. **Note the rev-3
  reversal (§I of the diff): `rysSPgUssLDf6xJc` is the only sub that forwards
  `contact_id`/`space_id`, so it is now also the correct live target for `dym-probe`. The anomaly
  is the fork's NAME, not its behaviour.**
- **Cross-company pick (F-DUPE's root, added 2026-08-07)** — *today, before this change*, a
  customer offered a code that collides across companies and who picks it is routed to an
  **arbitrary company's product**. Some share of the measured 67% dead-end rate in §1 may be that,
  not missing data. Resolver/CRM fix (don't return cross-company twins, or label them so n8n can
  choose). Plausibly worth more than this feature. **File separately; do not bundle.**
- **Live `sibling-probe` / `crossdomain-probe` call company-scoped tools UNSCOPED** (they target
  `Fss5aAaXthJSWpZCgKiKR`, which does not set `contact_id`/`space_id`). Pre-existing; file against
  the multi-company isolation programme.
- **Scope parity on `Fss5aAaXthJSWpZCgKiKR`** — adding the two forwarding lines so the live sub can
  serve scoped probes. Better end state than depending on the fork, but it is a live change to a
  shared sub with two existing callers: its own reviewed, hash-gated publish (LESSONS §51).
- Multi-token D1, numbered mode, D2 annotation (§3.4 table).
- Any third domain — one `DOMAIN_PROBE` entry when wanted.
