# Node-diff: `incoming-axis-gate-and-partial-message` (plan §B, Option B)

Coder deliverable for the reviewer. Scope tag: **deterministic** (two Code-node edits; parser NOT touched).
Source of truth: live spine `9qVyfUxmRQqrpGRMDLRuz` (published versionId `bcdb5633-f760-451b-b0a8-fc03a0d884c8`).

## STATUS: APPLIED + PUBLISHED on reused clone `txiPzSxy3Pclsz6v` (coordinator decision change + extension)

**Substrate = the EXISTING clone `txiPzSxy3Pclsz6v`** (coordinator reversed the fresh-fork plan: the
egress/guard/driver layer is already applied + verified zero-egress there, and re-applying it onto a
fresh fork is the riskier path). **F1–F6 cancelled.** Applied: F7 (two business edits) + a required
If3 drift-sync + a follow-up **product-axis not-found extension** (§21.7 gap), then published each time.

- **Publish 1** (gate Option B + compile B2 + If3 sync): activeVersionId
  `06b96650-2b19-4ba7-ad8b-9029368104c3`.
- **Publish 2** (product-axis not-found extension — 2 re-edited nodes): activeVersionId
  `4d1c1f4e-1c5a-4178-83b0-e8362bb8ef7b`.
- **Publish 3** (ITERATION 2 — per-token hint classification refactor of `disallowed-entity-gate`):
  activeVersionId `c1ff50f3-1d94-453b-ba96-14e1052f7f28`.
- **Publish 4** (ITERATION 3 — `build-suggest-offer` §21.8 empty-AND wording, text-only):
  activeVersionId `957f8d5c-52ba-4982-a1aa-dd3ba1a4fc89`.
- **Publish 5** (ITERATION 4 — `disallowed-entity-gate` **product-only-on-incoming** fix):
  **activeVersionId `0008b89a-0386-4b9d-a15a-28e349c26842`** (current; prior active
  `9eb9762e-d502-4f02-bf9d-d54a344ba699`). After each publish `versionId == activeVersionId`
  (draft==active). nodeCount 114 at this publish.
- Applied bodies verified byte-identical to the persisted artifacts
  (`…gate.new.js` / `…compile.new.js`), modulo cosmetic comment/whitespace.
- **PRODUCT MODE picklist body re-verified byte-identical to live** after the extension (the new
  product-not-found block sits entirely OUTSIDE the preserved OR/AND disambiguation code).

## Iteration 2 — per-token hint classification (replaces the whole-query mode switch)

**Why:** two mixed-query bugs from live chat testing — the whole-query binary IDENTIFIER/PRODUCT mode
switch is too coarse when a message contains BOTH containers and a product. Grounded on two real clone
executions:

- **exec 8528931** — "2 containers + CWC604-S-RL water closet" (no Sorento extracted). Parser:
  BMOU/WHSU(inbound_shipment), CWC604-S-RL(product). Product hint present → whole-query PRODUCT MODE →
  IDENTIFIER MODE skipped → `not_found_axis_tokens:[]`. **BUG:** BMOU container-not-found dropped.
- **exec 8529182** — "2 containers + CWCX604-S-RL water closet" ("Sorento warehouse" extracted,
  hint=warehouse). Resolver token "Sorento" fell back to 4 products; old code trusted the match
  `entity_type` (product ∈ ALLOWED) over the parser hint (warehouse) → `require_specific:true`, picklist
  "SORENTO CATALOGUE/BAG/SP0100/188". **BUG:** a warehouse-noise token generated a product picklist;
  CWCX604-S-RL exact ignored, BMOU dropped.

**Refactor (`disallowed-entity-gate`):** removed the whole-query IDENTIFIER/PRODUCT switch (and the
iter-1 identifier-mode + product-extension blocks). New logic classifies **each resolver token by its
PARSER hint** (not by what the greedy resolver matched):
- `hintForToken(token)` maps a resolver token → its parser entity's `.hint` via the norm/includes fuzzy
  rule (handles the parser raw "Sorento warehouse" ⊃ resolver token "Sorento" truncation).
- **AXIS** = hint ∈ `AXIS[domain]` (incoming → inbound_shipment); **PRODUCT** = hint ∈ `ALLOWED[domain]`
  but not the axis (product/category/brand — and `attachment_type`/`attachment` for product_attachment,
  so that domain keeps resolving); **NOISE** = hint not compatible with the domain at all (warehouse) →
  dropped entirely.
- **(A) AXIS handling runs ALWAYS** (not gated on the absence of product tokens): resolved axis matches →
  `compatible_axis`; AXIS-hinted parser tokens with no axis-type match → `not_found_axis_tokens`.
  *(fixes 8528931 — BMOU now reported alongside the product.)*
- **(A2) PRODUCT disambiguation** runs the existing OR/AND logic **pre-filtered to PRODUCT-classified
  tokens only**, so AXIS + NOISE tokens can never become picklist candidates. *(fixes 8529182 — "Sorento"
  is NOISE, dropped; CWCX604-S-RL resolves exact → no picklist.)*
- **(A3) final** `compatible_entities` = picklist candidates (if `require_specific`) else
  `compatible_axis ∪ product exacts` (deduped by uuid). `require_specific` true ONLY when a genuinely
  ambiguous PRODUCT token remains.
- **(B)** product not-found emission (PRODUCT_FAMILY-hinted tokens with no product match) unchanged in
  spirit; emits `not_found_product_tokens`. Both buckets are emitted; `compile-current-state`'s B2 IIFE
  already itemizes both with cross-bucket dedupe (**unchanged this iteration — verified**).
- Scope guard: (A) axis+disambiguation runs only for `REQUIRE_SPECIFIC_DOMAINS` (incoming,
  product_attachment) → **inventory/master_products/promotion keep pass-through** (compatibility-filtered
  `compatible_entities`, no picklist), preserving §21.7. The old whole-query IDENTIFIER MODE is now a
  special case (pure-container = axis-only, no product tokens).

**Verification (node harness running the actual gate jsCode with mocked `$`/`$input`):**
| case | gate_passed | require_specific | compatible_entities | not_found_axis | not_found_product |
|---|---|---|---|---|---|
| 8528931 (2 containers + fuzzy product) | true | false | [WHSU inbound_shipment] | [BMOU] | [CWC604-S-RL] |
| 8529182 (2 containers + Sorento-noise + CWCX exact) | true | false | [WHSU, CWCX604-S-RL] | [BMOU] | [] |
| 21.6 pure-container | true | false | [WHSU] | [BMOU] | [] |
| 21.1 vague product | false | **true** (consolidated picklist) | [SRTBF117-BL, -150] | [] | [] |
| 21.2 exact product | true | false | [SRTBF117A] | [] | [] |
| 21.7 inventory partial | true | false | [SRTBF117A] (pass-through) | [] | [Z9ZZ] |

Harness also re-run against the **live applied** gate body (post-publish) → identical results. Applied
gate body verified byte-identical to `…gate.new.js`. New activeVersionId
`c1ff50f3-1d94-453b-ba96-14e1052f7f28`.

**Warehouse-leak robustness (coordinator ask):** the fix does NOT rely on the live reformulator's new
`warehouse` block. In 8529182 the parser DID emit `hint:warehouse`; the gate classified it NOISE
(warehouse ∉ ALLOWED.incoming) and dropped it. Any warehouse-hinted token that leaks the parser is
dropped at the gate.

### Downstream routing (coordinator ask) — NO additional fix needed
Requirement: when ≥1 axis token resolved, an unresolved token / fuzzy product must NOT divert to the
did-you-mean/escalate branch and suppress the found (WHSU) results. Traced routing on the clone:
- `If3` out[0] → `If-incoming-picker`; out[1] → `Execute 'sub-get-rag'` (happy). `If3` dead-ends (out[0])
  only when `gate_passed===false || (unresolved>0 && compatible_entities===0)`.
- `If-incoming-picker` fires only when `gate.require_specific===true && domain===incoming`; out[1] →
  `not-found-error-message`.
- `build-suggest-offer` (suggest-on-miss/escalate) is fed **only** by `not-found-error-message` and
  `annotate-incoming-picker` — both strictly downstream of `If3[0]` / the picker branch.

In the mixed-partial case iter-2 produces `gate_passed=true`, `require_specific=false`,
`compatible_entities` **including WHSU** → `If3` takes out[1] (happy) → get-results → `validator.
has_result=true` → `If6[0]` → central-exchange → compile. The suggest/escalate branch is **structurally
unreachable**. The old suppression happened because the OLD gate set `require_specific=true` (product/
noise picklist) → `gate_passed=false` → `If3[0]` → picker/not-found → suggest, with WHSU absent from
`compatible_entities`. iter-2's always-on axis handling keeps WHSU in the set. **No downstream touch.**

> **Residual edge flagged (NOT in the repros, NOT fixed):** if a container resolves AND a co-occurring
> product is *genuinely ambiguous* (real multi-product picklist, no exact), iter-2 sets
> `require_specific=true` → `compatible_entities` = picklist candidates only → WHSU deferred to the
> picklist turn (not rendered this turn). Same "ask to disambiguate" UX as today; outside the stated
> requirement. If resolved containers should always render even alongside an ambiguous product, that's a
> follow-up (e.g. merge `compatible_axis` into the response even when prompting). Coordinator decision.

## Iteration 3 — `build-suggest-offer` wording (§21.8 empty-AND)

**Scope:** ONE targeted, text-only edit to `build-suggest-offer` (the suggest-on-miss message node). NOT
changing AND semantics, get-results, the gate, or compile — only the human `text`/`suggest_response`
string for one branch. Artifact: `…build-suggest-offer.new.js`. activeVersionId
**`957f8d5c-52ba-4982-a1aa-dd3ba1a4fc89`**.

**Problem (grounded, exec 8531422):** incoming empty-AND — a container + a *resolved* product that is
NOT in that container → get-results (AND) returns empty → suggest-on-miss fires. The D2 non-uuid branch
built `No ${noun} for ${askedCode}…` where `askedCode` fell through to `q.entities[0].raw` =
"BMOU649395378" (the resolved container WHSU's `compatible_entity` has `code:null`, so
`compat[0].code||canonical_code` was undefined → first-entity-raw fallback). Result: "No incoming stock
(ETA) for BMOU649395378. Try: …" — named the wrong thing, omitted the product + WHSU.

**Fix:** in the `axis !== 'date'` non-uuid sub-branch ONLY, before the existing template, a narrow special
case:
```
} else {
  const containerRaws = (…q.entities…).filter(e => e.hint === 'inbound_shipment').map(e=>e.raw).filter(Boolean);
  const productRaws   = (…q.entities…).filter(e => e.hint === 'product').map(e=>e.raw).filter(Boolean);
  if (q?.domain_hint === 'incoming' && containerRaws.length && productRaws.length) {
    text = `No incoming stock of ${productRaws.join(', ')} in ${containerRaws.join(', ')}. Try: ${values.join(', ')}. `
         + `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
  } else {
    text = `No ${noun} for ${askedCode}. Try: ${values.join(', ')}. `   // ← unchanged fallback
         + `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
  }
}
```

**Guard is narrow** — fires only when `domain_hint==='incoming'` AND ≥1 `inbound_shipment` entity AND ≥1
`product` entity. Verified (isolated branch harness):
| input | text |
|---|---|
| §21.8 incoming container+product | `No incoming stock of CWCX604-S-RL in WHSU5485370, BMOU649395378. Try: … escalate to purchasing team?` |
| incoming pure-product (no container) | fallback `No incoming stock (ETA) for SRTBF117. Try: …` (unchanged) |
| inventory | fallback `No stock for SRTBF117. Try: …` (unchanged) |
| pure-container incoming (no product) | fallback `No incoming stock (ETA) for WHSU5485370. Try: …` (unchanged) |

**Other suggest-offer paths byte-unchanged (verified via `diff` applied-vs-original):** the ONLY change is
the D2 non-uuid `else` block. The D1 numbered (uuid/promotion) branch, the D1 code-mode branch, the D2
`axis==='date'` branch, and the D2 uuid-coded numbered branch are byte-identical; `values`,
`suggest_quick_reply`, and `suggest_last_result_set` are untouched everywhere. Applied node verified
byte-identical to the artifact.

**§21.9 (fake/unresolved product) confirmed unaffected:** that case takes the happy path (a resolved
container → get-results returns data → `validator.has_result=true` → central-exchange), so
`build-suggest-offer` is not executed. Even if it were reached, the change is text-only and correctly
scoped. Do NOT re-run UAC (tester re-verifies §21.8).

## Iteration 4 — `disallowed-entity-gate` product-only-on-incoming fix (repro exec 8565622)

**Scope:** ONE localized edit to `disallowed-entity-gate` (clone id `b07ca5db`, live id `5928ae64`) — the
`(A1)` AXIS-handling `else` branch. NOTHING else in the gate, `compile-current-state`, `build-suggest-offer`,
`If3`, get-results, or the AND semantics changed. activeVersionId **`0008b89a-0386-4b9d-a15a-28e349c26842`**.

**Bug (grounded, clone exec 8565622, query "Srt6632-GM ETA"):** a product code typed for an ETA on the
`incoming` domain. Parser: `domain incoming`, `intent check_incoming`, one entity `Srt6632-GM` hinted
**inbound_shipment**, `match_mode and`. resolve-entity (OR-mode fallback, `fallback_applied:true`,
requested `inbound_shipment`, none found) resolved it **exact + unambiguous** as `entity_type product`
`SRT6632-GM` (uuid `c5aedb06-…`), `resolved:true`, `ambiguous:false`, `match_tier:exact`,
`unresolved_tokens:[]`. The iter-2 gate then:
- `(A1)` looked for an **inbound_shipment**-typed match for the token → none → dropped the token into
  `not_found_axis_tokens:["Srt6632-GM"]`.
- `(A2)` product disambiguation is pre-filtered to **PRODUCT-classified** tokens; the token's parser hint is
  `inbound_shipment` → classified **AXIS** → excluded → the resolved product never entered `exact_entities`.
- Net: `compatible_entities:[]` → get-results ran `crm_incoming_stock_list` with **no product filter** →
  `has_result:false` → "Could not find incoming for Srt6632-GM…". **Live/prod (old gate) returns the 2
  containers** (OOCU8630645 / CICU1013499) because the old gate admits any `ALLOWED[domain]`-typed entity,
  and `ALLOWED.incoming` includes `product` — incoming is legitimately searchable BY product.

**Root cause:** the gate bucketed the token by its PARSER HINT (`inbound_shipment`), so a token that
*resolved* to a `product` matched neither the axis bucket nor the product-disambiguation bucket and fell
through to `not_found_axis_tokens`.

**Fix (classification now keys off the RESOLVED entity_type, not solely the parser hint):** in the `(A1)`
`else` branch — reached only for an AXIS-hinted token with no axis-type match — before pushing to
`not_found_axis_tokens`, check the token's OR-mode resolution: if it `resolved===true`, `ambiguous!==true`,
and carries **exactly one** match whose `entity_type ∈ compatNonAxis` (`{product,category,brand}` for
incoming) at `match_tier==='exact'`, admit that single exact into `exact_entities` (a product search-key)
instead of `not_found_axis_tokens`. `(A3)` then merges it into `compatible_entities` → get-results queries
incoming by product → containers (matches prod). Diff (unified) iter-2 → iter-4:
```
       } else {
-        not_found_axis_tokens.push(e.raw);
+        // PRODUCT-ONLY-ON-INCOMING fix: axis-hinted token, no inbound_shipment match, but resolves
+        // exact+unambiguous to a product → admit as product search-key (incoming searchable BY product).
+        const fbRes = (resolutions ?? []).find(r =>
+          (raw.includes(norm(r.token)) || norm(r.token).includes(raw)));
+        const fbMatches = (fbRes?.matches ?? []).filter(m => m && compatNonAxis.has(String(m.entity_type)));
+        const fbExact = (fbRes && fbRes.resolved === true && fbRes.ambiguous !== true
+                         && fbMatches.length === 1 && fbMatches[0].match_tier === 'exact')
+                        ? fbMatches[0] : null;
+        if (fbExact) {
+          exact_entities.push({ uuid: fbExact.uuid, entity_type: fbExact.entity_type, code: fbExact.canonical_code });
+        } else {
+          not_found_axis_tokens.push(e.raw);
+        }
       }
```
Full new body: `…gate.new.js` (applied body re-fetched **byte-identical** to the artifact post-publish).

**Must-not-regress — verified in an isolated node harness running the actual applied gate `jsCode`:**
| case | gate_passed | require_specific | compatible_entities | not_found_axis | not_found_product |
|---|---|---|---|---|---|
| **8565622** Srt6632-GM ETA (the fix) | true | false | **[product SRT6632-GM]** | **[]** | [] |
| §21.6 BMOU + WHSU + "Sorento warehouse" | true | false | [WHSU inbound_shipment] | [BMOU] | [] |
| §21.8 WHSU + CWCX604-S-RL(product) + BMOU | true | false | [WHSU, CWCX604-S-RL] | [BMOU] | [] |
| §21.1 vague product SRTBF117 | false | **true** (picklist, 2 cand.) | [SRTBF117-BL, -150] | [] | [] |
| axis-hinted → **ambiguous** multi-product | true | false | [] | [SRTX] | [] |

- **§21.8 MIXED container+resolved-product stays as agreed** — BMOU (fake container, `resolved:false`) is
  NOT a single exact product → remains `not_found_axis`; CWCX resolves via the PRODUCT-hinted `(A2)` path
  unchanged; the AND-intersect + iter-3 suggest-on-miss wording are untouched. The fix only fires for an
  AXIS-hinted token whose resolution is a single exact non-axis match.
- **Genuine AMBIGUOUS-product picklist preserved** — the last harness row proves a multi-product resolution
  under an axis hint is NOT auto-admitted (stays `not_found_axis`); §21.1's product-hinted picklist is
  byte-unchanged (`require_specific=true`).
- **Container/inbound_shipment axis (WHSU-style) unchanged** — §21.6 identical to iter-2.
- **not_found itemization for genuinely unresolved tokens unchanged** — `compile-current-state` B2 and
  `not_found_product_tokens` emission untouched; in 8565622 the token is now resolved so no itemization
  fires (pure happy path, as prod).
- **`compile-current-state` / `build-suggest-offer` consistent** — since the product now resolves, 8565622
  takes the happy path (get-results → `has_result:true` → central-exchange → compile), NOT suggest-offer.

**Zero-egress:** only the one logic Code node changed; no egress node, sub-call target, credential, or
connection touched. The fail-closed layer on `txiPzSxy3Pclsz6v` is unchanged. §0 S1–S6 remain the
tester's gate.

### Risk #1 — DRAFT STATE reconcile (coordinator ask)
Before this change the clone carried an unpublished draft (`versionId 7d37e22e` ≠ `activeVersionId
28fb29ad`). **A true byte-diff draft-vs-active is NOT possible via the sanctioned MCP channel**
(LESSONS #23: `get_workflow_details` returns only the draft; active node bodies need REST/version-history
+ API-key, which SECURITY forbids). Closed it by **characterizing the draft** instead:
- **No junk-named nodes** (scan for tmp/copy/wip/debug/untitled/etc. → none).
- **Orphan set = live's orphans − `Schedule Trigger` (correctly removed) + the 6 intentional
  blocked-egress nodes** (`save-session-vars`, `send-message-files/images/video`,
  `update-human-intervened`, `Call 'sub-respond-save-message-redis'2`). The live spine itself carries
  the SAME structural orphans (`Code in JavaScript` audio-url helper, `OpenAI Chat Model` AI-submodel,
  `respond3`) — so those are not clone junk.
- All shared-sub targets correct; `guard-c/d/e/f/g/h-record` all present; the two edit-target nodes +
  `resolve-entity-http` + `Call 'sub-get-results'` + `validator` byte-identical to live.
- **Conclusion:** the draft is the plan-§B3-verified guard-layer state, structurally clean, no stray
  half-work. Publishing it (→ `06b96650`) promoted only the verified layer + our 3 ops. Residual: I
  could not prove byte-for-byte that active `28fb29ad` had nothing the draft lacked; if the reviewer
  wants that assurance, it requires a version-history read outside MCP.

### Risk #2 — STALENESS spot-check vs live `9qVyfUxmRQqrpGRMDLRuz` (coordinator ask)
Diffed the UAC-critical path nodes (clone-draft vs live-published):

| node | result | action |
|---|---|---|
| `resolve-entity` | harness **NoOp passthrough** (`[fixture-resolve-entity | resolve-entity-http] → resolve-entity(NoOp) → gate`); real logic in `resolve-entity-http` = **byte-identical to live** | none (intentional harness arch, not drift) |
| `Call 'sub-get-results'` | **identical** to live (both call `rysSPgUssLDf6xJc`) | none |
| `validator` | **identical** to live | none |
| `compile-current-state` | **identical** to live (pre-edit) | edit target (F7b) |
| **`If3`** | **DRIFT — stale pre-`if3-unresolved-guard-narrowed` form** | **SYNCED from live** |

**`If3` sync was essential to this change.** Stale clone If3 (`unresolved_tokens.length>0` **OR**
`gate_passed===false`, combinator or) dead-ends on ANY unresolved token even when a compatible entity
resolved — it would route §21.6/§21.5/§21.7 (one container/product resolved, one not) to the
**not-found path**, so get-results never runs and the B2 partial-message hook never fires. Live's
narrowed If3 (`gate_passed===false || (unresolved>0 && compatible_entities===0)`) proceeds to the happy
path when ≥1 entity resolved. Replaced the clone's If3 conditions with live's exact form (single boolean
condition, id `49e4b4f4-…`). Verified applied.

### What was NOT done (cancelled by the decision change)
F1 fresh fork, F2–F6 guard/driver re-application — all cancelled; the existing verified layer on
`txiPzSxy3Pclsz6v` is reused as-is.

---

## Guard-layer status on the reused clone (verified present — NOT re-applied, reused as-is)

All targets read directly off `txiPzSxy3Pclsz6v`; match plan §B3 tables G1–G5 / F4 / F5.

| Item | Status on reused clone |
|---|---|
| Schedule Trigger | **absent** (triggerCount 0); `redis-pop-main-message-list` reads `=test:q:{{ $json.contact }}` (per-contact dispatcher queue — **never** prod `main-message-list`). |
| 6 sendmsg `executeWorkflow` | → fork **`ublq9nSlrpz63xan`** (`is_test:true`). |
| `Call 'sub-human-intervention'` | → fork **`vUfFUDjLAuMaeQE6`**. |
| egress-record layer (F4) | `guard-c/d/e/f/g/h-record` all present; real-egress nodes (`save-session-vars`, `update-human-intervened`, `send-message-files/images/video`, `Call 'sub-respond-save-message-redis'2`) orphaned/blocked. |
| shared-sub targets (F5) | reformulator → **`XTODTw-dJcV0uRdC056hG`** (live); `Call 'sub-get-results'` + `probe-incoming` → **`rysSPgUssLDf6xJc`**; `Execute 'sub-get-rag'` → **`tWP33QOFT7SxThfT`**. |

### ✅ Doc-drift CONFIRMED (flag for CLAUDE.md)
The current clone `Call 'sub-query-reformulator'` → **`XTODTw-dJcV0uRdC056hG`** (the **live published**
reformulator), **NOT** the fork `CpxE8LroLzCkrAQN` that CLAUDE.md's key-IDs table claims. Matches plan
§B3-F5. This change needs no parser edit, so keeping the live sub is correct. CLAUDE.md should be
corrected.

---

## F7 — business-logic edits (the ONLY two nodes the reviewer promotes)

Both nodes are **byte-identical between live and the current clone** (verified via `diff`; only their
node-IDs differ — live `5928ae64` / `0804657c`, clone `b07ca5db` / `7a130a0c`). So the old→new diff
below is promotion-correct against live regardless of substrate.

### F7a — `disallowed-entity-gate` (live id `5928ae64-39d2-4d5d-bd85-f9ea47901f8b`)

> ⚠️ **SUPERSEDED by "Iteration 2 — per-token hint classification" above.** The whole-query AXIS-map /
> IDENTIFIER-MODE design described in this F7a subsection was the iter-1 approach; it has been **replaced**
> by the per-token classification refactor (current applied gate = `…gate.new.js`, activeVersionId
> `c1ff50f3`). This subsection is retained for history. The `not_found_axis_tokens` /
> `not_found_product_tokens` emission and the byte-preserved OR/AND product picklist bodies still hold.

**Intent (iter-1, superseded):** add an AXIS matrix + whole-query mode selector. PRODUCT MODE stays byte-identical to today;
a new IDENTIFIER MODE handles identifier-axis domains (incoming/order) with no product-family hint —
it filters `compatible_entities` to the axis type only (shedding greedy resolver noise like the
4 "Sorento" products / transporter / customers), never builds a product picklist, and emits
`not_found_axis_tokens`.

Diff (unified) live → new:
```
84a85
> let not_found_axis_tokens = [];   // Option B: identifier-axis tokens the resolver could not match
86c87,135     // insert AXIS map + mode selector + IDENTIFIER MODE block; the existing
              // `if (REQUIRE_SPECIFIC_DOMAINS.has(domain)) {` becomes `} else if (...) {`
> const AXIS = { incoming:['inbound_shipment'],      // ← `order` OMITTED (coordinator, see flag below)
>                master_products:['product'], inventory:['product'],
>                promotion:['product'], product_attachment:['product'] };
> const PRODUCT_FAMILY = new Set(['product','category','brand']);
> const isIdentifierAxis     = _axisTypes.size > 0 && !_axisTypes.has('product');
> const hasProductFamilyHint = _parserHints.some(h => PRODUCT_FAMILY.has(h));
> if (isIdentifierAxis && !hasProductFamilyHint) {
>   compatible_entities = entities.filter(e => _axisTypes.has(e.entity_type));   // axis type ONLY
>   // partition axis-hinted parser tokens into found/not-found via includes() fuzzy match
>   not_found_axis_tokens = <axis tokens with no axis-typed resolution>;
>   require_specific = false; specific_options = [];
>   gate_passed = compatible_entities.length>0 ? true
>                : (ALLOWS_EMPTY[domain]===true ? gate_passed : false);
> } else if (REQUIRE_SPECIFIC_DOMAINS.has(domain)) {   // ← existing PRODUCT MODE body, UNCHANGED
230c279,280
> out.not_found_axis_tokens = not_found_axis_tokens;
> out.gate_debug = { ...existing, identifier_axis: isIdentifierAxis && !hasProductFamilyHint };
```
Full new body: `…gate.new.js`. **PRODUCT MODE body (OR/AND branches, FIX A/D, consolidated picklist)
is byte-for-byte unchanged** — only its opening `if (` became `} else if (`.

**Extension (product-axis not-found on the PROCEED path — §21.7 gap).** A separate guarded block,
placed AFTER the whole mode-selection if/else-if chain (OUTSIDE the preserved OR/AND picklist code), emits
`out.not_found_product_tokens`:
```
> let not_found_product_tokens = [];
> // runs only when proceeding with a product-family query and NOT showing a picklist
> if (gate_passed === true && require_specific === false && hasProductFamilyHint) {
>   // for each PRODUCT_FAMILY-hinted parser entity: skip if the resolver returned ANY match
>   // for its raw (false-positive guard — an exactly/any-resolved product is NEVER flagged);
>   // else flag it (in unresolved_tokens fuzzy, or OR-mode with no matching resolution).
>   // dedupes via a seen-set; AND-mode relies on unresolved_tokens only (no over-flag).
>   not_found_product_tokens.push(e.raw);
> }
> out.not_found_product_tokens = not_found_product_tokens;
```
- Covers **all product-axis domains** incl. `inventory`/`master_products`/`promotion` (which never enter
  REQUIRE_SPECIFIC) because it's its own block, not inside that branch.
- Does NOT run when a picklist is shown (`require_specific===true`) and NEVER touches the OR/AND code —
  re-verified the picklist body is byte-identical to live post-extension.
- Separate field from `not_found_axis_tokens` (identifier mode leaves that as-is); the two are mutually
  exclusive per turn (identifier mode requires `!hasProductFamilyHint`; this block requires it).

**Mode routing check (per domain):**
- incoming + product hint → `isIdentifierAxis` true but `hasProductFamilyHint` true → **PRODUCT MODE**
  (existing incoming picklist/annotation path). ✓ §21.1–21.5
- incoming + NO product hint (repro §21.6) → **IDENTIFIER MODE**. ✓
- inventory / master_products / promotion (axis `product`) → `isIdentifierAxis` false → unchanged. ✓
- product_attachment (axis `product`) → `isIdentifierAxis` false → existing require-specific path. ✓

**✅ RESOLVED — `order` narrowed out of AXIS (coordinator).** I originally flagged that including `order`
in AXIS would route order-without-product-hint into IDENTIFIER MODE and drop `customer`/`transporter`
scoping (regressing "orders for customer X", since `ALLOWS_EMPTY.order=false`). The coordinator edited
`gate.new.js` to **omit `order`** — AXIS is now **incoming-only**. So `order` keeps today's exact
behaviour (it's not in `REQUIRE_SPECIFIC_DOMAINS` and not an identifier axis → neither block runs). No
order behaviour change ships. The identifier-mode inline comment still reads "incoming/order" in a couple
places (cosmetic; harmless — AXIS controls behaviour, not the comment).

### F7b — `compile-current-state` (live id `0804657c-f600-450b-8ae9-17972406f0e9`)

**Intent:** on the found-with-partial happy path (identifier-axis incoming/order), itemize the gate's
`not_found_axis_tokens` onto `userResponse` — mirroring the existing friendly-disclaimer IIFE (same
happy-path guards, same append pattern). Primary source only (`gate.not_found_axis_tokens`);
resolved-but-empty refinement skipped per coordinator (answer shape unconfirmed).

Diff (unified) live → new — a single new IIFE inserted between the friendly-disclaimer IIFE and the
`output = {` assignment (after live line 207):
```
208a209,229
> // ── Option B: partial not-found itemization (identifier-axis happy path) ──
> (() => {
>   const answered = !isEscalateBranch && includeResponse
>     && typeof userResponse === 'string' && userResponse.trim().length > 0
>     && Array.isArray(last_result_set) && last_result_set.length > 0;
>   if (!answered) return;
>   const NOUN = { incoming:'incoming shipment', order:'order' };
>   const noun = NOUN[qf.domain_hint]; if (!noun) return;
>   const gate = (()=>{ try { return $('disallowed-entity-gate').first().json; } catch(e){ return {}; }})();
>   const notFound = Array.isArray(gate.not_found_axis_tokens) ? [...gate.not_found_axis_tokens] : [];
>   if (notFound.length === 0) return;
>   userResponse += `\n\nI couldn't find any ${noun} matching:\n` + notFound.map(t=>`• ${t}`).join('\n');
> })();
```
**Extension (§21.7 gap):** the B2 IIFE was restructured so it no longer early-returns on a non-identifier
domain. It now itemizes **two buckets** on the same success-branch guard (`answered` /
`last_result_set` non-empty):
```
>   const NOUN = { incoming: 'incoming shipment', order: 'order' };
>   const noun = NOUN[qf.domain_hint];   // undefined for product-axis domains
>   const axisTokens    = (noun && gate.not_found_axis_tokens) ? [...] : [];      // identifier-axis line
>   const productTokens = (gate.not_found_product_tokens || []).filter(not in axisSet);  // product line
>   if (axisTokens.length)    userResponse += "…I couldn't find any " + noun + " matching:\n• …";
>   if (productTokens.length) userResponse += "…I couldn't find any product matching:\n• …";
```
- Product line noun is always **"product"**, independent of the domain NOUN map → fires for
  `inventory`/`master_products`/`promotion` too (§21.7).
- Product tokens are **deduped against axis tokens** (case-insensitive) so nothing is listed twice.
- Both buckets can render (defensive), but per turn only one is populated (gate mutual exclusion above).

Full new body: `…compile.new.js`. The all-miss path (`not-found-error-message`) remains untouched; this
hook is the success-branch itemization the change adds.

---

## Validation

- `node --check` on both new bodies (function-wrapped so top-level `return` is legal): **PASS**.
- **`update_workflow(txiPzSxy3Pclsz6v, 3 ops)` succeeded** (`appliedOperations: 3`,
  `autoAssignedCredentials: []` — no wrong-cred auto-bind). All returned `validationWarnings` are
  **pre-existing/expected** per LESSONS #13 and do **not** touch the three edited nodes: hardcoded
  `x-api-key` on httpRequest nodes; `DISCONNECTED_NODE` on the intentionally-orphaned egress nodes +
  `Code in JavaScript` + `respond3`; OpenAI `builtInTools`; the `Transcribe a recording`
  expression-prefix. No NEW warnings introduced by this change.
- **Applied-body verification (both publishes):** re-fetched the edited nodes each time.
  `disallowed-entity-gate` and `compile-current-state` are byte-identical to the persisted artifacts
  (modulo cosmetic comment/whitespace); `If3` matches live's narrowed condition exactly; the PRODUCT
  MODE picklist body inside the applied gate is byte-identical to live after the extension.
- Note on tooling: this server's `validate_workflow` takes **SDK `code`**, not a `workflowId`, so a
  by-ID workflow validation was not available; the `update_workflow` atomic apply + returned
  validationWarnings + explicit re-fetch stand in for it. A `prepare_test_pin_data`→`test_workflow`
  V-B1 gate-unit (plan §B5) is left for the tester.

## Publish
- Publish 1 → `success:true`, activeVersionId `06b96650-2b19-4ba7-ad8b-9029368104c3`.
- Publish 2 (product-axis extension) → **`success:true`, activeVersionId
  `4d1c1f4e-1c5a-4178-83b0-e8362bb8ef7b`** (current). Post-publish `versionId == activeVersionId`
  (draft==active). The clone is chat-driven via executeWorkflow, so it runs the published version — the
  tester exercises these edits.

## Handoff to tester
- Drive §21.1–21.7 via the chat webpage (`zz-chat` → dispatcher `2D0cw2Y1aPW2LOlU` →
  `txiPzSxy3Pclsz6v`). §21.6 is the flagship repro; expect IDENTIFIER MODE (`require_specific=false`,
  `compatible_entities` = the one WHSU `inbound_shipment`, `not_found_axis_tokens:["BMOU649395378"]`),
  get-results runs, and `userResponse` carries WHSU's ETA **plus** the itemized BMOU not-found; "Sorento"
  never a picklist option. Cheap pre-check: V-B1 pin exec-8519391 parser+resolver → assert gate output.
- **§21.5 / §21.7 (product-axis partial, now covered):** "ETA/stock for `<exact A>` and
  `Z9ZZNOTAREALCODE`" → PRODUCT MODE proceeds on A, `gate.not_found_product_tokens=["Z9ZZNOTAREALCODE"]`,
  and `userResponse` appends "I couldn't find any product matching:\n• Z9ZZNOTAREALCODE" alongside A's
  result. Assert A is NOT listed as missing (false-positive guard) and the picklist cases §21.1–21.4 are
  unchanged (PRODUCT MODE picklist body byte-identical to live).

## Zero-egress note
Only three logic Code/IF nodes changed (`disallowed-entity-gate`, `compile-current-state`, `If3`) — no
egress node, sub-call target, credential, or connection was touched. The verified fail-closed layer on
`txiPzSxy3Pclsz6v` (6 sendmsg→`ublq9nSlrpz63xan`, HI→`vUfFUDjLAuMaeQE6`, all `is_test:true`, 6
guard-*-record nodes, orphaned real-send nodes) is unchanged. §0 S1–S6 remain the tester's gate.
