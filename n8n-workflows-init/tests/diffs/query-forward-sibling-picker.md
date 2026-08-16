# Node-diff: `query-forward-sibling-picker` — PHASE 1 (single resolved product)

Change target (clone ONLY): `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`.
- New draft/active versionId after publish: **`3246db0c-493f-46f6-8de1-f0e001a01135`** (draft == active, published).
- Prior versionId (backup / revert target): `45699b20-9bc0-480f-8c2f-e8a7649f89f0`.
- Live spine `9qVyfUxmRQqrpGRMDLRuz`, live sub `XTODTw`, reformulator fork `wI5RkNGW3EOJfBdo` = **UNTOUCHED**.
- Plan: `../../plans/query-forward-sibling-picker-plan.md` (§0–§10). UAC: `../UAC.md` §Q1–Q7.
- Scope: `deterministic` (Code + HTTP-read + executeWorkflow-read). No parser/reformulator/compile-current-state edit.

## Phase boundary
PHASE 1 = single exactly-resolved product (`compatible_entities[0]`'s product code) → one family-fetch.
PHASE 2 (NOT built) = multi-product `family-loop` (splitInBatches over every exact product code, union by uuid).
**Seam left clean:** `sibling-transform` emits ONE item carrying a `siblings[]` array (so `sibling-probe`
runs exactly once, batched); phase-2 simply concatenates each base's family into that same `siblings[]`
(the `base_codes[]` field already anticipates multiple bases). D3 reads `siblings[]` unchanged. UAC §Q2
(multi-family) is KNOWN-DEFERRED / BLOCKED-on-loop per plan §3.

---

## Nodes ADDED (4)

### 1. `sibling-gate` — IF (typeVersion 2.3), pos [5900, 2624]
Inserted between `not-found-error-message` and `build-suggest-offer`. Gates the D3 family lane.
Conditions (AND, `typeValidation:loose`):
- `sg-dom` — `$('disallowed-entity-gate').first().json.gate_debug.domain` **equals** `incoming` (same
  domain source the existing `If-incoming-picker` uses).
- `sg-req` — `$('disallowed-entity-gate').first().json.require_specific !== true` is **true** (excludes the
  ambiguous-picker path; robust to undefined).
- `sg-prod` — `compatible_entities` has ≥1 `entity_type==='product'` with a **non-uuid** `code` (there is
  an exactly-resolved product to build a family from; UUID_RE guard avoids promo-uuid codes).
- `sg-empty` — `$('validator').isExecuted && $('validator').first().json.has_result === false` is **true**
  (precision guard: fires ONLY on the genuine get-results-empty path via `Aggregate1`, NOT on the
  `If-incoming-picker[FALSE]` access path where `validator` never ran — `isExecuted` short-circuits).
- TRUE(idx0) → `family-fetch`; FALSE(idx1) → `build-suggest-offer` (unchanged behaviour).

### 2. `family-fetch` — httpRequest GET (typeVersion 4.3), pos [6120, 2820]
THE CRUX — the uncapped family read (plan §2). READ ONLY.
- URL: `=https://fe-sorento.foundryx.my/api/v1/master-data/products?query={{ <baseCode> }}&variant_filter=all&limit=5000`
  where `<baseCode>` = `encodeURIComponent(` the first non-uuid product `code` in
  `disallowed-entity-gate.compatible_entities` `)`.
- Header `x-api-key: ***REMOVED-CRM-API-KEY***` (same hardcoded key as every spine http node —
  resolve-entity-http / get-cs-members / check-access-http; the HARDCODED_CREDENTIALS warning is the
  documented pre-existing class, LESSONS §13, do NOT "fix"). No credential auto-assign needed (header auth).
- NOT the capped resolver `resolutions[].matches` (PREFIX_LIMIT=20) — deliberately uncapped list endpoint.

### 3. `sibling-transform` — Code (typeVersion 2), pos [6340, 2820]
Filters the products-list response to the STRICT family and emits one item.
- Base code = first non-uuid product in `compatible_entities` (PHASE 1 = single base).
- Rows read defensively across container shapes: `resp` array | `.data` | `.items` | `.products` |
  `.results` | `.data.items`. Each row: `code = product_code ?? code`, `uuid = id ?? uuid`.
  (V-Q1 confirms `product_code`+`id`; tester verifies live.)
- Strict-family rule: `norm(code) === norm(base)` OR `startsWith(base)` with the next char a boundary
  delimiter `[- / space]` or EOS. Excludes `CB88SS1` (alnum boundary) and `XCB88SS` (not prefix).
- Dedupe by normalized code. Emits `[{ json: { siblings:[{uuid,entity_type:'product',code}], base_codes, sibling_count } }]`.

### 4. `sibling-probe` — Execute Sub-workflow (typeVersion 1.3), pos [6560, 2820]
Clone of `probe-incoming`, → get-results sub **`rysSPgUssLDf6xJc`** (`sub-get-results TEST`).
- `tool` = `crm_incoming_stock_list` (literal, READ; never a create/write tool — S4).
- `entities` = `={{ $('sibling-transform').first().json.siblings }}` (the WHOLE family incl. the exact
  one) → the sub's `entity-ids-transformer` pools every sibling uuid into `product_ids` → **ONE batched
  read** (V-Q3; reuses the shipped `incoming-picker-availability` machinery — no per-sibling loop).
- `user_prompt` entities line + `semantic_input` else byte-identical to `probe-incoming` (parser output +
  findcontact + `Aggregate.isExecuted?` guard). Single input item ⇒ executes once.
- Note: like its template `probe-incoming`, this call does not pass an explicit `is_test` field; the
  target sub `rysSPgUssLDf6xJc` is the fail-closed TEST get-results and `crm_incoming_stock_list` is a pure
  READ — zero egress structurally regardless (S5 preserved: no send/assign/write reachable).

## Nodes CHANGED (1)

### `build-suggest-offer` — Code `7972abd8-...` — ADD D3 arm (additive)
- Inserted a `{ ... }` block **before** the UUID-leak-guard / D1 / D2 code, after the existing locals
  (`out,q,r,gate,team,YES,NO,cap3,humanList`). D1/D2/escalate code is **byte-identical** below it.
- D3 fires only when `$('sibling-transform').isExecuted && $('sibling-probe').isExecuted` AND domain is
  incoming (`q.domain_hint==='incoming'` OR `gate.gate_debug.domain==='incoming'`). When the node is
  reached via the ambiguous-picker (`annotate-incoming-picker`) or `sibling-gate[FALSE]`, those nodes did
  NOT run → D3 is inert → D1/D2 behave exactly as before (regression-safe; block-scoped `normC/seenC` do
  not leak).
- Builds: `hasInc` set from probe `answers[].title` (same machinery as `annotate-incoming-picker`);
  annotate every sibling (exact INCLUDED) `has`/`no` incoming; **zero-extras guard** (only the exact code,
  no real siblings) → `return false`-equivalent (falls through) → plain escalate unchanged (UAC §Q6).
- On siblings present: **sort has-incoming-first then code ascending, NO cap**; numbered text
  `N. CODE — has/no incoming`; escalate line names `${team}` (= purchasing for incoming); sets
  `suggest_offer=true`, `suggest_selection_context='suggest_offer'`, `suggest_quick_reply=[YES,NO]` only
  (comma-stripped → `Yes escalate,No it's okay`), `suggest_last_result_set` = ALL siblings
  `[{idx,label,value,product,uuid,entity_type:'product'}]`; `return out`.
- **Envelope = the SAME `suggest_offer` shape** D1/D2 emit → `compile-current-state._sug` renders it AND
  persists `variables.last_result_set`+`selection_context` (NO compile edit); continuation reuses the
  reformulator fork's shipped `suggest-follow-up` (number → re-query incoming; "yes" → escalate
  purchasing) with NO reformulator edit (plan §5/§6).

## Connections
- REMOVED: `not-found-error-message → build-suggest-offer`.
- ADDED: `not-found-error-message → sibling-gate`; `sibling-gate[0]→family-fetch`;
  `sibling-gate[1]→build-suggest-offer`; `family-fetch→sibling-transform`;
  `sibling-transform→sibling-probe`; `sibling-probe→build-suggest-offer`.
- UNCHANGED: `annotate-incoming-picker → build-suggest-offer` (ambiguous incoming picker path intact).
  `build-suggest-offer → tag-not-found → escalate-catalog` intact.

---

## Zero-egress (S0) confirmation
- `family-fetch` = GET `/master-data/products` — READ. `sibling-probe` = `crm_incoming_stock_list` via the
  TEST get-results sub — READ. No send/assign/SLA/PIC/CRM-write node added or rewired.
- No egress node touched; the 5 orphaned egress nodes remain orphaned (DISCONNECTED warnings unchanged).
- Escalation still only on a user "yes" NEXT turn, via the guarded human-intervention fork
  `vUfFUDjLAuMaeQE6` (records `would_write`).
- Reformulator fork target re-verified live = `wI5RkNGW3EOJfBdo` (NOT live). sibling-probe target =
  `rysSPgUssLDf6xJc` (get-results TEST).

## Validation performed (coder scope)
- `new Function(jsCode)` syntax check (n8n-equivalent, allows top-level return) — PASS on both new code
  nodes AND on the LIVE-extracted copies post-write.
- Live-extracted `build-suggest-offer` + `sibling-transform` jsCode = **byte-identical** to the validated
  scratch (modulo one EOF newline). (LESSON 25 sha-gate.)
- `update_workflow` applied 11 + 1 ops atomically (no ref errors). Validation warnings = the documented
  pre-existing set (LESSONS §13) + `family-fetch` hardcoded x-api-key (same class) — no NEW structural error.
- Offline unit (`scratchpad/unit-q.js`) 19/20 asserts PASS; the 1 "fail" was a wrong test expectation
  (`quick_reply` correctly = `Yes escalate,No it's okay`, apostrophe retained — matches existing D1/D2):
  (a) family of 5 mixed → combined picker, has-incoming sorted first (DIY,H), exact CB88SS annotated
  "no incoming", all 5 listed no-cap, escalate names purchasing, last_result_set=5 with full shape;
  (b) zero-extras → suggest_offer stays false (plain escalate); (c/c2) sibling nodes not run / domain not
  incoming → D3 inert; (d) D1 did-you-mean unregressed.

## For the tester (handoff)
- Run V-Q1 first: direct read `GET /master-data/products?query=CB88SS&variant_filter=all&limit=5000`
  (x-api-key) to record the LIVE family + which have incoming; substitute a mixed-family base if `cb88ss`
  drifted (plan P-Q1). Then §Q1 (flagship), §Q3 (has-incoming sort), §Q6 (zero-siblings fallback),
  §Q7a/b/c (regression), §Q4/§Q5 (continuation). §Q2 (multi-family) = BLOCKED-on-loop (phase-2).
- Assertions are STRUCTURAL (branch + itemization + sort + annotation-consistency), never exact ETA text.

---

## REVISION (2026-07-15) — D3 `anyHasIncoming` split (list-only variant when NO sibling has incoming)

Change target (clone ONLY): `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`.
- **New draft/active versionId after publish: `af6c94e7-1ee5-451d-bda6-592b95589165`** (draft == active, published).
- Prior versionId (backup / revert target for THIS revision): `3246db0c-493f-46f6-8de1-f0e001a01135`.
- Live spine `9qVyfUxmRQqrpGRMDLRuz`, live sub `XTODTw`, reformulator fork `wI5RkNGW3EOJfBdo` = **UNTOUCHED**
  (clone reformulator target re-verified post-edit = `wI5RkNGW3EOJfBdo`).
- Only trigger on the clone is `When Executed by Another Workflow` (executeWorkflowTrigger); there is **NO
  Schedule Trigger** on this clone, so no path can consume the shared prod `main-message-list`.

### What changed — ONLY the D3 `if (extras.length > 0)` block in `build-suggest-offer` (`7972abd8`)
The single ≥1-sibling D3 case is now split on `anyHasIncoming = sibs.some(s => s.has)` (the same has/no-incoming
flag D3 already derives from `sibling-probe` answers). Sort (has-incoming-first then code) and the `exactList`
header are computed once, before the split.

- **`anyHasIncoming === true` → COMBINED PICKER — byte-for-byte the PRE-REVISION behaviour.** Numbered list of
  all siblings (`N. CODE — has/no incoming`, no cap, exact included), invite = "Reply with a number to check its
  incoming, or reply 'yes' to escalate to `${team}` team.", `suggest_last_result_set` = all siblings
  `[{idx,label,value,product,uuid,entity_type:'product'}]` (positional pick armed), `suggest_quick_reply=[YES,NO]`.
- **`anyHasIncoming === false` → NEW LIST-ONLY + ESCALATE-ONLY variant.** Still lists every sibling but WITHOUT
  numbers, each annotated "— no incoming"; the numbered-pick invite is dropped. Message:
  ```
  No incoming stock (ETA) found for <BASE>. Related products:
  <CODE> — no incoming
  ... (all siblings)
  Would you like me to escalate to <team> team?
  ```
  `team` = `purchasing` for domain=incoming, so the last line renders "escalate to purchasing team?". Still emits
  the SAME `suggest_offer` envelope (`suggest_offer=true`, `selection_context='suggest_offer'`) so the fork's
  `suggest-follow-up` reconciles yes→escalate / no→decline unchanged. `suggest_quick_reply=[YES,NO]` only (no
  numbered options). **`suggest_last_result_set = []`** — no positional affordance, so a stray typed number
  resolves nothing (message and behaviour agree).

### Why empty `last_result_set` is safe (confirmed against the fork, read-only)
Verified against `output_exchange` + `suggest-follow-up` in fork `wI5RkNGW3EOJfBdo` (nodes NOT edited):
- `output_exchange` "REFERENCE POSITIONS → ENTITIES" builds `byIdx = new Map(lastSet.map(r=>[r.idx,r]))`. With
  `last_result_set` empty, `byIdx` is empty ⇒ every typed position falls to `outOfRange`, `entities=[]`,
  `positions_resolved=0` — **no phantom sibling entity, no sibling re-query.**
- `suggest-follow-up` still routes a plain "yes"/"no" (reference_positions empty, is_affirmative set) to the
  escalate / decline branches exactly as for D1/D2. So yes→escalate and no→decline continue to work.

### Unchanged arms (re-confirmed by diff of deployed vs new jsCode = ONLY the D3 block)
D1 (did-you-mean, code + uuid modes), D2 (alternatives, date + entity + uuid modes), the UUID-leak guard, the
zero-siblings fall-through (`extras.length===0` → plain escalate, `suggest_offer` stays false), and the D3-inert
paths (ambiguous incoming picker / `sibling-gate` FALSE) are all **byte-identical** to version `3246db0c`.

### Validation performed (coder scope)
- `node --check` + `new Function(jsCode)` (n8n top-level-return equiv) — PASS.
- `diff` of deployed (`3246db0c`) vs new jsCode = ONLY the D3 `if (extras.length>0)` block (D1/D2/guard/zero-sib
  untouched).
- Offline unit `scratchpad/unit-q-split.js` — **23/23 PASS**:
  - (a) mixed family (CB88SS x5, CB88SS-DIY+CB88SS-H have incoming) → combined picker, has-incoming sorted first,
    numbered list, number-pick invite present, `last_result_set` = 5, `quick_reply` = `Yes escalate,No it's okay`.
  - (b) **all-no-incoming family (CB88SS x5, probe empty)** → header + all 5 listed "— no incoming" (NO numbers),
    NO "Reply with a number" line, "Would you like me to escalate to purchasing team?" present, `suggest_offer`
    still true, `quick_reply` = `Yes escalate,No it's okay`, **`last_result_set` EMPTY**.
  - (c) zero-siblings (only exact code, `extras.length===0`) → `suggest_offer` stays false, D3 sets no response
    (plain escalate unchanged).
  - (d) D1 did-you-mean (no sibling path) → code-mode text + quick_reply intact (unregressed).
- Applied via `updateNodeParameters replace:true` (a first `setNodeParameter` with a `/parameters/jsCode` pointer
  mis-wrote a nested `parameters.parameters` key — corrected; final node param keys = `['jsCode']` only).
- Post-publish: active `build-suggest-offer` jsCode **byte-identical** to `scratchpad/build-suggest-offer.new.js`
  (sha `bd5eb473…`); `versionId==activeVersionId==af6c94e7`.

### For the tester (this revision)
- Re-run V-Q1 to record the LIVE `CB88SS` family + which have incoming. Pick a base whose ENTIRE family has NO
  incoming (the all-no-incoming variant) AND a base with ≥1 incoming (combined picker) to cover both D3 legs.
- New structural asserts for the all-no-incoming leg: no `^\d+\. ` numbered lines, every sibling ends "— no
  incoming", message ends "escalate to purchasing team?", `suggest_quick_reply` = yes/no only,
  `suggest_last_result_set` EMPTY; and a continuation turn typing a bare number does NOT re-query a sibling
  (resolves nothing) while "yes" still escalates. Combined-picker leg assertions unchanged from §Q1/§Q3.

---

## REVISION 2 (2026-07-16) — D3 ALWAYS numbered (REMOVE the `anyHasIncoming` split)

User reversed the REVISION-1 decision. The all-no-incoming family must ALSO show a NUMBERED list + the
number-pick invite, not the list-only/escalate-only variant. This revision **removes the `anyHasIncoming`
split entirely** — whenever `extras.length > 0` (≥1 real sibling) D3 now ALWAYS emits the numbered-picker leg.

Change target (clone ONLY): `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`.
- **New draft/active versionId after publish: `335f0cfa-82ce-431a-8437-73428d93bbd6`** (draft == active, published, `active:true`).
- Prior active versionId at start of THIS revision (backup / revert target): `6af34046-2f4a-4773-8a9d-7e929ea41efd`.
  (Note: the current active was already `6af34046`, NEWER than REVISION-1's `af6c94e7` — other clone edits landed in
  between; this revision was layered on the live `6af34046` build-suggest-offer, not the stale `af6c94e7` scratch.)
- Live spine `9qVyfUxmRQqrpGRMDLRuz`, live sub `XTODTw` = **UNTOUCHED**. Clone reformulator target re-verified
  post-publish = fork **`wI5RkNGW3EOJfBdo`** (NOT live). Only trigger on the clone = `When Executed by Another
  Workflow` (executeWorkflowTrigger); NO Schedule Trigger, so no path can consume the shared prod `main-message-list`.

### What changed — ONLY the D3 `if (extras.length > 0)` block in `build-suggest-offer` (`7972abd8`)
The `const anyHasIncoming = sibs.some(s => s.has)` computation and the entire `if (anyHasIncoming) { … } else-list-only`
branch are DELETED. The block now unconditionally:
- sorts `sibs` has-incoming-first then code ascending (unchanged, NO cap),
- emits the numbered list `N. CODE — has/no incoming` for ALL siblings (exact included),
- invite = "Reply with a number to check its incoming, or reply 'yes' to escalate to `${team}` team.",
- sets `suggest_offer=true`, `suggest_selection_context='suggest_offer'`, `suggest_quick_reply=[YES,NO]` (comma-stripped),
- **`suggest_last_result_set` = ALL siblings** `[{idx,label,value,product,uuid,entity_type:'product'}]` (positional pick armed).

Net effect vs REVISION 1: the **all-no-incoming case** (e.g. `Srtbf11831 ETA` → `[SRTBF11831, SRTBF11831-NEW]`, none
has incoming) now renders a NUMBERED list + number-pick invite with a POPULATED `suggest_last_result_set` (was an
un-numbered list + escalate-only + EMPTY `last_result_set` in REVISION 1). The mixed-family combined-picker leg is
byte-identical to REVISION 1's `anyHasIncoming===true` leg.

### Unchanged arms (confirmed by `diff` of deployed `6af34046` vs new jsCode = ONLY the D3 `if(extras)` block)
D1 (did-you-mean, code + uuid modes), D2 (alternatives, date + entity + uuid modes), the UUID-leak guard, the dym
hunks, and the **zero-siblings fall-through** (`extras.length===0` → plain escalate, `suggest_offer` stays false — the
Q6 case, DISTINCT from all-no-incoming and left intact) are all byte-identical to version `6af34046`. The D3-inert
paths (ambiguous incoming picker / `sibling-gate` FALSE) are unaffected.

### Validation performed (coder scope)
- `node --check` + `new Function(jsCode)` (n8n top-level-return equiv) — PASS.
- `diff` of deployed (`6af34046`) vs new jsCode = ONLY the D3 `if (extras.length>0)` block. Post-publish grep of the
  ACTIVE node confirms **no `const anyHasIncoming`, no `if (anyHasIncoming)`, no list-only "Would you like me to
  escalate to ${team} team?"** wording in D3 (the sole remaining `anyHasIncoming` occurrence is the explanatory comment).
- Offline unit `scratchpad/unit-q-alwaysnumber.js` — **23/23 PASS**:
  - (a) **all-no-incoming family** (`SRTBF11831` + `SRTBF11831-NEW`, probe empty) → NUMBERED list (`1. … — no
    incoming`, `2. … — no incoming`), number-pick invite present, escalate line names purchasing, NO list-only
    "Would you like me to escalate" wording, **`suggest_last_result_set` populated len 2 (was [] in REV1)**, full item
    shape, `quick_reply` = `Yes escalate,No it's okay`.
  - (b) mixed family (4 sibs, 2 have incoming) → numbered, has-incoming ranked first, all 4 listed no-cap,
    `last_result_set` len 4 (combined-picker unchanged).
  - (c) zero-siblings (`extras.length===0`) → `suggest_offer` stays false, D3 sets no response (plain escalate unchanged).
  - (d) D1 did-you-mean (no sibling path) → code-mode text + humanList codes + `last_result_set` + `dym_candidates`
    intact (unregressed).
- Applied via `updateNodeParameters replace:true`; post-write node param keys = `['jsCode']` only (no nested
  `parameters.parameters` quirk). Draft jsCode byte-identical to `scratchpad/build-suggest-offer.new.js`
  (sha `3835dede…`) BEFORE publish; active jsCode byte-identical AFTER publish; `versionId==activeVersionId==335f0cfa`.
- Validation warnings = the documented pre-existing set (LESSONS §13: hardcoded x-api-key incl. `family-fetch`,
  DISCONNECTED orphaned egress nodes, OpenAI builtInTools, transcribe prefix) — no NEW structural error.

### Zero-egress (S0) — UNCHANGED
Only `build-suggest-offer` jsCode changed (a pure text/shape builder). No egress node added, touched, or rewired; the
5 orphaned egress nodes remain orphaned (nodeCount 118, DISCONNECTED warnings unchanged). Escalation still only on a
user "yes" NEXT turn via the guarded human-intervention fork `vUfFUDjLAuMaeQE6`.

### For the tester (this revision)
- Re-run V-Q1 to record the LIVE `CB88SS` family + which have incoming. Pick a base whose ENTIRE family has NO
  incoming AND a base with ≥1 incoming to cover the two probe conditions (both now render the SAME numbered-picker leg).
- All-no-incoming leg asserts are now the SAME as the combined-picker: `^\d+\. ` numbered lines present for every
  sibling, invite = "Reply with a number to check its incoming, or reply 'yes' to escalate to purchasing team.",
  `suggest_last_result_set` POPULATED (len == sibling count, full item shape), `suggest_quick_reply` = yes/no only.
  A continuation turn typing a bare number SHOULD now re-query the picked sibling's incoming (positional pick armed) —
  the REV1 "bare number resolves nothing" assert is RETIRED. Zero-siblings (Q6) still → plain escalate, unchanged.
