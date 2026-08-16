# Node diff — `dym-probe-before-offer` (clone build)

> **Rev 7 — 2026-08-07.** Reviewer gates on the approved revs 4–6. **No rendered output moves.**
> Adds `parity.js` — one suite covering the three silent-divergence invariants plus F-CCS-STRIP and
> F-XDC, each with its own negative control (§Q) — and one load-bearing comment in
> `compile-current-state`. Plus the disposable runner chain for the F-ONERR promote gate (§P).
>
> *Rev 6: escalate-catalog re-sourcing fix (§O). Rev 5: 4th surface + multi-token lift (§N).
> Rev 4: 2nd renderer + wording (§M). Rev 3 (approved): §I, §K, §L. Rev 2: §H, §J.*

| | |
|---|---|
| target | **clone `txiPzSxy3Pclsz6v`** (`sorento-consume-main TEST`) — clone only |
| baseline versionId | `545210e7-017c-40e1-98cd-e8b2f57a00b0` (draft == active at start) |
| rev-1 versionId (reviewed) | `9aa24cc9-fead-4aaa-94eb-ec63b8b0eeb4` |
| rev-2 versionId (reviewed) | `78a72682-96fd-4720-8c2b-e4d0ff65c03e` |
| rev-3 versionId (**APPROVED**) | `18429d54-5261-45f5-a8ec-242c506b8b77` |
| rev-4 versionId (tested clean) | `1b664006-0b91-4da1-8a19-faacb89912d1` |
| rev-5 versionId (**BLOCKED**) | `a22914d8-1026-4215-b390-aa114db79ac4` |
| rev-6 versionId (approved on correctness) | `b79ef8c4-f274-4b28-8c13-3621edcc0e9c` |
| **current versionId** | **`5d6f9593-845a-43fc-9ac2-c3ad4b9bac6d`** — **published**, `versionId == activeVersionId` |
| live spine | **`f9205b03`** — **untouched by me**. It has drifted twice mid-cycle (`f03086ac` → `533499f4` → `f9205b03`) via other changes. **All three of my promote baselines — `build-suggest-offer`, `compile-current-state`, `escalate-catalog` — are byte-identical to the current live export**, re-verified after the rev-6 write, so every cross-file gate stays valid. Someone is promoting frequently: **re-verify at promote time regardless.** |
| plan | `n8n-workflows-init/plans/dym-probe-before-offer-plan.md` |
| UAC | `n8n-workflows-init/tests/uac/DP.md` (+ `uac/00-SAFETY-always-read.md`) |
| rollback | `publish_workflow(txiPzSxy3Pclsz6v, "545210e7-017c-40e1-98cd-e8b2f57a00b0")` then re-export |
| offline suites | `n8n-workflows-init/tests/offline/dym-probe-before-offer/` — `harness.js` (**142**), `byteid.js` (12), `ccs-harness.js` (30), **`parity.js` (30, new in rev 7 — sources bodies from the EXPORT)**, `./mutate.sh` (fail-on-purpose runner, §L) — **214 assertions total** |

**Cumulative totals — nodes added: 8. Nodes changed: 4. Edges removed: 2. Edges added: 12. Nodes removed: 0.**
(Changed on live: `build-suggest-offer`, `compile-current-state`, **`escalate-catalog`** (rev 6).
`dym-transform`/`-partial` are new in this change and counted as added.)
**Rev 5 added ZERO nodes and ZERO edges** — it is a three-file `jsCode` change (§N).
(Rev 1–3 were 4 added / 1 changed / 1 removed / 6 added, all on the not-found lane; rev 4 adds the
second, results-lane copy plus the `compile-current-state` hunk — see §M.)
Rev 1 used `update_workflow` (2 atomic calls, 13 ops); revs 2–5 used **REST PUT derived from a fresh
REST GET** because the tool-call channel cannot reproduce long `──` runs (§H2). Every write asserted
credential parity: **28 credentialed nodes before, 28 after, identical `(node, key, id)` triples**.
No credential was auto-assigned and no credentialed node type was introduced — `dym-probe` and
`dym-probe-partial` both hold none.

---

## A. New chain (all four nodes)

Repositioned onto a free canvas row `y=3216`, between the sibling row (`y=3024`) and
`build-suggest-offer` (`y=3360`). No generic names.

### A1. `dym-transform` — Code v2, `[8160, 3216]`

**Before:** did not exist.
**After / intent:** pure planner. Mirrors `build-suggest-offer`'s D1 candidate selection
*verbatim* (`missResolutions` filter → `tokenCandidates()` → `humanLabel()` survivors) and
decides whether a has-it probe is worth running. Emits **exactly one** item so `dym-probe`
batches into a single sub-call. Every `$('x')` read is in a try/catch — it cannot throw.

Domain map (the only place a domain is enabled):

| domain | tool | predicate | requires | noun |
|---|---|---|---|---|
| `product_attachment` | `crm_master_product_attachments_list` | `row_present_with_type` | `attachment_type` \| `certificate` | `null` → `attachmentNoun()` |
| `inventory` | `crm_inventory_stock_balance_list` | `qty_gt_zero` | — | `stock` |

`probe_needed` is true only when all hold; each false case names a `probe_skip_reason`,
evaluated **in this order** (order matters for §DP-9 vs §DP-9-mirror):

1. `domain_not_enabled` — domain absent from `DOMAIN_PROBE`
2. `no_d1_candidates` — `_survivors.length === 0` (also covers `is_clarification` / `require_specific`, and every D2-only turn)
3. `multi_token` — `_survivors.length > 1`
4. `no_candidate_uuid` — **hard gate (F2a)**, zero candidates carrying a UUID-shaped `uuid`
5. `no_scoping_entity` — **fail-closed (F3 layer 1)**, `requires` non-empty and no UUID-shaped `attachment_type`/`certificate` in `gate.compatible_entities`
6. `multi_uuid_code` — **fail-closed (F-DUPE, rev 3, §K)**, every surviving code is behind >1 candidate uuid (i.e. >1 company's product)

**Rev 5 amendments to the above:** rule 3 (`multi_token`) now applies to the **`d1` lane only** —
the `partial` lane allows multi-token (§N4). Rule 5's scoping-entity lookup now falls back to the
resolver flatten when `compatible_entities` yields nothing, which is what makes the picker lane
work (§N2). And the candidate SOURCE is lane-dependent: D1 survivors on `d1`/`partial`, the gate's
option set on `picker`.

Output keys: `dym_probe_entities`, `dym_candidate_codes`, `dym_excluded_codes`, `probe_tool`,
`probe_noun`, `probe_predicate`, `probe_needed`, `probe_skip_reason`, **`probe_lane`** (rev 5),
`_dym_probe_input` — **appended to a spread of the incoming payload** (see §D1). **Every one of
these is in `build-suggest-offer`'s `_DYM_CTRL_KEYS` strip list**; omitting one leaks it into the
emitted object and the byte-identity gates go red (this happened in rev 5 — §N7).

### A2. `dym-gate` — If v2.3, `[8384, 3216]`

**Before:** did not exist.
**After / intent:** single boolean condition `={{ $json.probe_needed === true }}`
(`typeValidation: loose`, matching `sibling-gate`). Output **0** → `dym-probe`; output **1**
→ `build-suggest-offer` (today's behaviour).

### A3. `dym-probe` — Execute Sub-workflow v1.3, `[8608, 3216]`

**Before:** did not exist.
**After / intent:** read-only has-it probe. Built as a copy of **`sibling-probe`** (per plan
F6 — it is the only one of the three `sub-get-results` callers whose `workflowId` is correct
per build target). Four leaves differ from `sibling-probe`; everything else is byte-verbatim.

| field | value | note |
|---|---|---|
| `workflowId.value` | **`rysSPgUssLDf6xJc`** (`sub-get-results TEST`) | clone target **and, as of rev 3, the live-promote target too** — it is the only sub that forwards `contact_id`/`space_id` to these company-scoped tools. **§I is binding; rev 2's `Fss5aAa` answer is withdrawn.** Verified from the workflow JSON, not memory (§DP-0d) |
| `tool` | `={{ $('dym-transform').first().json.probe_tool }}` | read from the map, never hardcoded (S4-assertable) |
| `entities` | `={{ $('dym-transform').first().json.dym_probe_entities }}` | not `compatible_entities` |
| `user_prompt` → `entities:` line | `JSON.stringify($('dym-transform').first().json.dym_probe_entities)` | **plan deviation, see §E2** |
| `contact_id`, `semantic_input` | byte-identical to `sibling-probe` (programmatically asserted) | |
| `onError` | **`continueRegularOutput`** | deliberately **not** `continueErrorOutput`; there is no `main[1]` to leave unwired |
| credentials | **none** | asserted from a REST GET (REST does not redact) |

### A4. `dym-annotate` — Code v2, `[8832, 3216]`

**Before:** did not exist.
**After / intent:** converts the probe render envelope into "which offered codes actually
HAVE the thing", and **re-sources the not-found payload by name**:
`const out = { ...$('not-found-error-message').first().json }` (spread, not aliasing — the
upstream item is not mutated). Attaches `dym_available_codes` + `dym_probe_meta
{ ok, tool, noun, predicate, probed, answer_count, reason }`.

Answer attribution is the **existing shipped parser, verbatim** (`a.title`, else the field
whose label matches `/product\s*code/i`; `norm` = trim+lowercase) — the same code as
`annotate-incoming-picker.js:10-17` and `build-suggest-offer.js` D3. Per predicate:

- `qty_gt_zero` — sums `Quantity On Hand` per code across warehouse rows; `"—"`, absent and
  unparseable all read as **0**; a code enters `available` only when the sum is `> 0` (F2b).
- `row_present_with_type` — a row counts only if it carries a non-empty `Attachment Type`;
  if `answer_count > 0` and **zero** rows carry one → `ok:false, reason:'unscoped_probe'`,
  annotate nothing (F3 layer 2).

`ok:false` (⇒ `dym_available_codes: []` ⇒ today's offer) on: the `_dym_probe_input` sentinel
(probe fell through `onError`), a payload `error`, no `answers`/`items` array, unknown
predicate, or unscoped-probe detection. **Detection is by payload shape only — never node
status.**

---

## B. Changed node — `build-suggest-offer` (Code v2, id `7972abd8`)

`jsCode` only. Three hunks; nothing else in the 476-line body moved. Full before/after
bodies are in `tests/offline/dym-probe-before-offer/` (`live-bso.js` = pre-change,
`build-suggest-offer.js` = published bytes).

### B1. Control-key strip (line 6 area)

```js
const _DYM_CTRL_KEYS = ['dym_probe_entities', 'dym_candidate_codes', 'dym_excluded_codes',
  'probe_tool', 'probe_noun', 'probe_predicate', 'probe_needed', 'probe_skip_reason',
  '_dym_probe_input', 'dym_available_codes', 'dym_probe_meta'];
const out  = { ...$input.first().json };
for (const _k of _DYM_CTRL_KEYS) delete out[_k];
```

**Why:** see §D1. The keys are appended by the upstream nodes, so deleting them restores the
original object *and its insertion order*. On the other three inbounds the deletes are no-ops.

### B2. Annotation inputs (inserted just above `const _survivors`)

Reads `$('dym-annotate')` defensively (`isExecuted` + try/catch) into `_dymOk`, `_dymHas`,
`_dymProbed`, `_dymNoun`. `_dymOk === false` ⇒ every render below is unchanged.
`_dymNounOf()` maps the certificate family (`cert`/`certs`/`certification`) to `certificate`
for the suffix **only** — `attachmentNoun()` itself is untouched so D2's `No {noun} for {code}`
text stays byte-identical (§E3).

### B3. Single-token D1 **code mode** only (the `else` arm of `anyUuid`)

- `_dymAnnotate = _dymOk && picks.some(p => _dymProbed.has(norm(code)))`.
- When true: `picks.sort()` **has-first**, **stable partition, no tiebreak** — `return hb - ha;`
  (see §H). The sort runs **before** `codes`, `suggest_last_result_set` and `dym_candidates` are
  derived, so all four stay index-consistent (§DP-11b).
- When true: `suggest_response` renders a numbered line per code with
  `` — has ${noun} `` / `` — no ${noun} ``. A code that was **not** probed gets no suffix.
- When false: the original single-line `humanList(codes)` prose, unchanged.
- **`suggest_quick_reply` is untouched in both arms** —
  `[...codes,  YES, NO].map(s => String(s).replace(/,/g,'')).join(',')`, bare codes, double
  space preserved.

**Explicitly NOT touched:** numbered mode, multi-token D1, D2 (both arms), D3. Verified by
cross-file diff against live, below.

---

## C. Edges

Removed (1): `sibling-gate[1] -> build-suggest-offer`

Added (6):

```
sibling-gate[1]  -> dym-transform[0]
dym-transform[0] -> dym-gate[0]
dym-gate[0]      -> dym-probe[0]
dym-gate[1]      -> build-suggest-offer[0]
dym-probe[0]     -> dym-annotate[0]
dym-annotate[0]  -> build-suggest-offer[0]
```

`build-suggest-offer` inbound, re-read from the published JSON — **exactly 4**:
`annotate-incoming-picker[0]`, `dym-annotate[0]`, `dym-gate[1]`, `sibling-probe[0]`.
`sibling-gate[1] -> build-suggest-offer` is **gone** (§DP-12 static assertion satisfied).
`sibling-probe[0]` and `annotate-incoming-picker[0]` are untouched — D1 offers arriving on
those two inbounds are un-annotated **by construction** (plan F5, accepted for phase 1).

Nothing reads `sibling-gate` or the new nodes by name except the new chain itself;
`compile-current-state → build-suggest-offer` is unaffected.

---

## D. Deviations from the plan — read these

### D1. 🚩 Plan §3.3's rewire as written would have **dropped the not-found payload** on the gate-FALSE branch

The plan specifies `dym-gate[1] -> build-suggest-offer` while §3.2 has `dym-transform` emit
*only* its control object. `build-suggest-offer` starts from `{...$input.first().json}` and
depends on the not-found payload (`escalate_message`, `is_clarification`, `found_summary` —
`not-found-error-message.js:208-210`). Wiring it as written would have replaced that payload
with the control object on **every** non-probed turn — i.e. on every non-enabled domain,
which is most traffic. That is the same failure mode the plan correctly identifies for
`dym-annotate` in §3.2, but it applies to the FALSE branch too and the plan misses it.

**Fix:** both `dym-transform` and `dym-annotate` pass the payload through and **append**
their keys; `build-suggest-offer` strips them (§B1). This keeps the plan/UAC's literal
top-level key names (`probe_needed`, `dym_probe_meta`, …) that §DP asserts, while leaving the
emitted object byte-identical to today. Proven by cross-file diff, §F.

### D2. 🚩 Plan §3.2's "`user_prompt` verbatim from `sibling-probe`" is wrong and would have thrown

`sibling-probe`'s `user_prompt` embeds
`JSON.stringify($('sibling-transform').first().json.siblings)`. `sibling-transform` runs on
the `sibling-gate[0]` arm only and is **never executed** on the dym path, so a verbatim copy
would raise an expression error on every probe. Repointed to
`$('dym-transform').first().json.dym_probe_entities`. `semantic_input` and `contact_id` *are*
verbatim (asserted programmatically against `sibling-probe`).

### D3. Plan §3.4 vs UAC §DP-1 disagree on the attachment noun

The plan says `attachmentNoun()` "already yields the right word"; it returns the parser's raw
token, which for the §DP-1 fixture (`{raw:'cert', hint:'attachment_type'}`) is `cert` → the
render would read `— has cert`. UAC §DP-1 asserts the literal `IBWC8315-SL — has certificate`.
Resolved in favour of the UAC with a suffix-local normalisation (`/^cert/i → 'certificate'`)
that does **not** modify `attachmentNoun()`, so D2's text is unaffected. **Reviewer: confirm
this is the wanted wording** — the alternative is to relax §DP-1 to the raw token.

### D4. Under-specified: the plan never says what the annotated `suggest_response` looks like

§3.4 says "annotate a rendered line", §DP-11b says "rendered line `i+1`". Code mode was
previously single-line prose (`Did you mean A, B, or C?`). I render a **numbered** list,
matching the shipped D3 precedent, and kept the existing invite sentence
("Reply with a code to continue, …") verbatim. Buttons remain codes. A numeric reply also
resolves correctly because `suggest_last_result_set` is rebuilt from the sorted picks.
**Reviewer: this is a customer-visible wording choice that no document specifies.**

### D5. Candidate filtering is tighter than plan §3.2

Plan: "≥1 candidate carries a UUID-shaped `uuid`". Implemented: ≥1 candidate that is
UUID-shaped **and** whose `entity_type` maps to a narrowing `*_ids` param in
`sub-get-results`' `entity-ids-transformer.js:6-20`. Reason: `allowed_lookup` for both enabled
domains includes `category` and `brand`, which that transformer does **not** map — a
brand-only candidate set would have passed the plan's guard, produced empty `product_ids`, and
triggered exactly the unscoped full-table read F2a exists to prevent. Strictly fail-closed;
no §DP fixture is affected.

Consequently `dym_candidate_codes` (⇒ `dym_probe_meta.probed`) holds the codes **actually
probed**, not all rendered picks. Plan §3.2 called it "cap3, render order, pre-sort". A
rendered-but-unprobed code therefore gets no suffix, which is the plan's own §3.4 rule.

### D6. `probe_skip_reason` vocabulary

The plan names `no_candidate_uuid`, `no_scoping_entity`, `multi_token`, `domain_not_enabled`.
A fifth was needed for `_survivors.length === 0` (D2-only / clarify / require-specific turns):
**`no_d1_candidates`**. §DP-13c expects only `probe_needed === false` there, so this is
additive.

### D7. `_dym_probe_input` sentinel (not in the plan)

⚠️ **CORRECTED 2026-08-07 by the induced-failure run — this section previously asserted the
sentinel is the primary detector. It is not, on this n8n version.**

The design assumed `onError: continueRegularOutput` makes a failed `dym-probe` emit its **input
item**. **Measured behaviour is different**: n8n emits `{error: "..."}` as the output item
(execs `11517840` / `11517863` / `11517876`, all three lanes). So the branch that actually fires
— and is therefore **LOAD-BEARING** — is `dym-annotate`'s **`error`-key branch**. It must NOT be
removed as redundant.

The sentinel is **retained deliberately**, checked first, and is *unit-exercised offline but
covers a hypothetical n8n behaviour rather than the observed one*. Its justification is specific,
not generic hedging: **if** a future n8n version passes the input item through, that item is a
spread of the not-found payload — itself `Aggregate1`'s item — which **can legitimately carry an
`answers` key** from the get-results path. Shape-sniffing alone would then misread a failed probe
as a successful empty one, yielding `ok:true, answer_count:0` and a confident `- no <noun>` on
every candidate. That is the worst failure mode in this change (same class as the rejected
UUID-union), and the sentinel is the only defence against it, for one stripped boolean and one
`if`.

Fail-open is therefore provably complete across all three possible n8n behaviours:
`{error}` (**observed** → `error` branch), input-passthrough (→ sentinel branch),
and halt (→ caught consumer-side by `isExecuted`).

Stripped by §B1.

---

## E. Safety (§0) — what is asserted, and from where

- **S4 (read tool only).** `dym-probe`'s `tool` is an expression reading
  `DOMAIN_PROBE[domain].tool`; the map contains exactly two values, both `_list` read tools.
  No write tool is reachable from this node without a code change.
- **S1/S2/S3.** No egress node added or rewired. The clone's containment is unchanged:
  the same 5 orphaned + 1 sinked set, re-emitted verbatim in the post-change validation
  warnings (`send-message-files/images/video`, `update-human-intervened`, `save-session-vars`,
  plus the pre-existing `Code in JavaScript` and `sorento-sub-respond-sendmsg-respond3`).
- **S8.** `dym-probe` is `n8n-nodes-base.executeWorkflow` with **no credential** — asserted
  from a REST GET (which, unlike MCP, does not redact credentials). No node of a banned type
  was added.
- **S5 caveat — `dym-probe` does NOT pass `is_test`.** `sub-get-results TEST`
  (`rysSPgUssLDf6xJc`) declares **no `is_test`/`test_mode` input at all** (its
  `executeWorkflowTrigger` takes `tool`, `contact_id`, `user_prompt`, `entities`,
  `semantic_input`). Neither `sibling-probe` nor `probe-incoming` passes one either.
  Containment for this call is the **fork target**, not a flag. Parity with the shipped
  callers — flagged so the tester scores S5 on that basis rather than as a miss.
- **Trigger surface.** This clone has exactly one trigger, `When Executed by Another Workflow`
  (`executeWorkflowTrigger`). There is **no `Schedule Trigger` and no `respondioTrigger`** on
  it, so the "disable the Schedule Trigger before editing" prerequisite is not applicable
  here — nothing on this clone can consume the shared prod `main-message-list`.
- **Live spine untouched.** `f03086ac` before and after, re-verified by
  `export-workflows.py --verify`.

---

## F. Build-time evidence (offline, zero executions)

`n8n-workflows-init/tests/offline/dym-probe-before-offer/` runs the **published bytes** of all
three code nodes under a stubbed `$`/`$input`/`$execution`. No UAC executions were run.

**`harness.js` — 106 assertions, all pass** (rev 3; 60 → 85 → 106). Covers §DP-1 (incl. §DP-11a/b), §DP-2
(now the stable-partition ordering contract + a cross-check that the all-negative order equals the
un-annotated order), §DP-3a, §DP-3b, §DP-4, §DP-5, §DP-9 + its attachment mirror + a
hint-only-`attachment_type` variant, §DP-10 (4 domains), §DP-13a, §DP-13c, §DP-14, §DP-FP-1, the
new **F-RANK** two-have / middle-have within-group ordering cases, and the new **F-ATT** real prod
envelope (§J).

**`byteid.js` — 12 fixtures, the real regression gate.** Runs the **live** `build-suggest-offer` body and
the **modified clone** body against the same fixtures and compares the whole output object.
This is a *cross-file* comparison, so it can go red on a regression (a same-file A/B could
not). All byte-identical: `order`/`master_products`/`incoming` D1-code mode,
inventory-no-uuid (gate FALSE), multi-token D1, numbered mode, D2 in `inventory`, D2 in
`product_attachment` (the `attachmentNoun` path), D2 date axis, and the direct
`sibling-probe`/`annotate-incoming-picker` inbound, plus (rev 3) the F-DUPE all-excluded and
mixed gate-FALSE paths.

**Fail-on-purpose, executed — twice.**
(a) A one-character edit to the un-annotated render string (`escalate` → `escalatE`) turned
**7 of the 10** `byteid.js` fixtures RED; reverting returned all 10 green.
(b) The F-RANK fix itself was a fail-on-purpose in reverse: applying it turned **exactly one**
`harness.js` assertion RED — `DP-2 order (alphabetical tiebreak)`, which is precisely the
assertion that encoded the bug — while `byteid.js` stayed 10/10. Predicted by the reviewer,
observed, and the assertion was then rewritten to the correct contract. Neither gate is
decoration.

Rendered output for the record (§DP-1 fixture):

```
Couldn't find "ibwc8315-s10". Did you mean:
1. IBWC8315-SL — has certificate
2. IBWC8315-S — no certificate
3. IBWC8315-S10-P — no certificate
Reply with a code to continue, or would you like me to escalate to customer_service team?
```
`suggest_quick_reply` = `IBWC8315-SL,IBWC8315-S,IBWC8315-S10-P,Yes escalate,No it's okay`

**What this evidence does NOT cover** (tester's job): the real `dym-probe` sub-call end-to-end on
the positive attachment branch (the envelope shape itself is now observed — §J), the
`Quantity On Hand` label (still taken from the plan's read of `presenters.py`, not observed by
me), the `output_exchange` pick round-trip (§DP-11b second turn), §DP-12's dynamic half,
§DP-13b's dynamic half, and every §0 runtime signal (S7a/S7b sink deltas).

---

## H. Rev-2 changes — F-RANK and F-DRIFT

### H1. F-RANK 🔴 — the has-first sort no longer destroys resolver ordering

**Before (rev 1, `9aa24cc9`):**

```js
return (hb - ha) || String(a.m.canonical_code).localeCompare(String(b.m.canonical_code));
```

**After (rev 2, `78a72682`):**

```js
// STABLE PARTITION, no tiebreak. Array.prototype.sort is stable, so (hb - ha)
// alone moves has-first while preserving the resolver's similarity order both
// within each group and, when nobody has the thing, across the whole list.
// A localeCompare tiebreak here would alphabetize and destroy that ranking.
return hb - ha;
```

**Why it was wrong.** With no candidate holding the thing — the *majority* annotated outcome —
`ha === hb === 0` for every pair, the comparator collapses to `localeCompare`, and a list the
resolver ranked by similarity is re-sorted alphabetically. Reproduced on the rev-1 bytes:
resolver order `IBWC8315-S, IBWC8315-SL, IBWC8315-S10-P` rendered as
`IBWC8315-S, IBWC8315-S10-P, IBWC8315-SL`.

**Why a bare `hb - ha` is the right fix rather than "sort only when ≥1 has".** `Array.prototype.sort`
is stable (V8 ≥ 7.0), so equal keys never move. All-negative ⇒ zero movement ⇒ byte-identical to the
un-annotated LIVE order. Some-have ⇒ the has-group moves to the front **and resolver order survives
inside both groups**. The "sort only when ≥1 has" variant would still have alphabetised within
groups; this does not.

Observed on the published bytes:

| fixture (resolver order `S, SL, S10-P`) | rev 1 | rev 2 |
|---|---|---|
| none have | S, S10-P, SL ❌ | **S, SL, S10-P** ✅ |
| `SL` (middle) has | SL, S, S10-P | SL, S, S10-P |
| `S` + `S10-P` have | S, S10-P, SL | S, S10-P, SL |

**Regression cost, as predicted by the reviewer and confirmed:** exactly **one** `harness.js`
assertion went red — `DP-2 order (alphabetical tiebreak)`, the assertion that *encoded* the bug —
and `byteid.js` stayed **10/10**. That assertion is rewritten to
`DP-2 resolver order preserved` (+ a new `DP-2 order matches un-annotated (LIVE) order` cross-check),
and three new stable-partition assertions were added for the two-have and middle-have cases.

**D3's own sort is untouched.** `build-suggest-offer.js:90`
(`sibs.sort(... || String(a.code).localeCompare(...))`, the shipped incoming sibling picker) keeps
its tiebreak — shipped behaviour, out of scope, asserted unchanged in the live-vs-clone diff.

### H2. F-DRIFT 🟢 — clone body is now **live + the three hunks, exactly**

`diff live-bso.js build-suggest-offer.js` now returns **only** the three functional hunks: the two
cosmetic comment-banner edits and the lost EOF newline are gone. The body was rebuilt
programmatically from the live export rather than transcribed, so promote checklist item 8 ("build
the target as LIVE + your own hunks") is already satisfied by the clone body itself — a
name-keyed copy is now safe.

**Transport note for the promoter.** Two `setNodeParameter` attempts in a row failed the byte-gate
on nothing but the `──` box-rule lengths in two comment banners: the tool-call authoring channel
does not reproduce long runs of U+2500 reliably. The rev-2 write was therefore done as a **REST PUT
derived from a fresh REST GET with exactly one leaf replaced** (clone only; PUT auto-publishes,
which was the intent). Guards applied: `settings.binaryMode`/`timeSavedMode` stripped (LESSONS §55),
and credential parity asserted across the write — **28 credentialed nodes before, 28 after,
identical `(node, key, id)` triples**. Expect the same U+2500 problem on the live promote; use the
same GET→one-leaf→PUT shape, or verify-and-retry.

---

## I. 🔴 Promote target — `rysSPgUssLDf6xJc`. **REVERSED in rev 3; do not use rev 2's answer.**

> **Rev 2 of this document said the live target was `Fss5aAaXthJSWpZCgKiKR`, on probe-precedent
> grounds. That is now WRONG and must not be actioned.** Reviewer §6.2 (F-SUB-SCOPE) reversed it on
> new evidence. If you are holding a rev-2 promote checklist, discard item 10.

**Why the precedent argument loses.** The entire delta between the two subs is the two lines the
fork has and the live sub lacks, in `entity-ids-transformer.js`:

```js
out.contact_id = $input.first().json.contact_id.trim().toString()
out.space_id = "364817"
```

Those are not incidental. Both probe tools are in the CRM's `SCOPED_TOOLS`, and company-scoped
tools **must** be forwarded `contact_id` + `space_id` (AC-F7, `test_company_scope_params.py`).
`MCP Client1` passes `jsonInput: "={{ $json }}"`, so the transformer's output **is** the tool
argument set. Therefore:

⇒ **`Fss5aAaXthJSWpZCgKiKR` calls company-scoped tools without company scope.**

Routing this change's new customer-visible assertion through an unscoped read turns F-DUPE's
cross-company over-claim from *possible* into *guaranteed*: `— has certificate` whenever **any**
company holds one. That is the exact failure this build now fails closed against (§K), reintroduced
by the transport.

**Two acceptable options. Pick one; do not improvise a third.**

| | option | what it costs |
|---|---|---|
| **A (default)** | Target **`rysSPgUssLDf6xJc`** — the scope-forwarding sub. It is also *exactly what was tested*, and live's main read path (`Call 'sub-get-results'`) and `probe-incoming` already depend on it, so it is **not a new live dependency**. | Extends the F6 "live calls a fork named TEST" anomaly by one more caller. Cosmetic vs. correctness. |
| **B (better end state)** | Land `out.contact_id`/`out.space_id` on `Fss5aAaXthJSWpZCgKiKR` **first, as its own reviewed hash-gated publish** (LESSONS §51), then target it. | A live change to a shared sub with two existing callers (`sibling-probe`, `crossdomain-probe`). Needs its own cycle, its own review, its own rollback. Do **not** bundle it with this change. |

**Honest bound on what was proved.** The reviewer verified the two params are **absent** from the
`Fss5aAa` call. Nobody verified **what the MCP server does when they are absent** — it may default
to a company, or it may return everything. *That uncertainty is itself the argument for option A:*
do not route a new factual customer-facing assertion through an unverified path when a
verified-scoped one exists. Treating "probably scoped anyway" as sufficient is the same inference
the reviewer rejected in F-DUPE b2.

Still applies whichever option is taken:

- Set the target as **one leaf** (`/workflowId/value`); never block-copy `workflowInputs.value`
  (LESSONS §48). Re-derive `contact_id`/`semantic_input`/`user_prompt` from the **live**
  `sibling-probe`.
- Re-diff the two subs immediately before promoting and confirm the delta is still only those two
  lines. If it has grown, re-test.

**Separate pre-existing finding, not this change's and not to be bundled:** on the **live spine**,
`sibling-probe` and `crossdomain-probe` call company-scoped tools **unscoped** today. File against
the multi-company isolation programme.

---

## J. F-ATT — checked against the real prod attachment envelope

The coordinator supplied a confirmed positive from prod execution `11421896` (`"mwc7625 cert"`,
6 rows). I ran the published `dym-annotate` bytes against that exact row shape — it is now a
permanent fixture in `harness.js` (`F-ATT` block). **Everything lines up; no code change was
needed.** Point by point:

| observed | my implementation | verdict |
|---|---|---|
| `title` = `"MWC7625-SH-S10"` (product code, **not** the filename) | `codeOf` reads `a.title` first | ✅ correct — a filename title was the one shape that would have produced confident false `— no certificate` |
| label is exactly `"Attachment Type"`, value `"Certification"` | `fieldVal(a, /attachment\s*type/i)`; non-empty and not `—` ⇒ counts | ✅ |
| extra labels `File Name`, `Certificate Number`, `Valid Until`, `Validity` | `find` returns the first label matching `/attachment\s*type/i`; none of the others can match | ✅ no collision |
| `Product Code` field also present | unused (title wins) but would give the same answer | ✅ redundant path agrees |

Rendered from the real row (resolver order `MWC7625-SH-S10, MWC7625-RL, MWC7625-SH`):

```
Couldn't find "mwc7625". Did you mean:
1. MWC7625-SH-S10 — has certificate
2. MWC7625-RL — no certificate
3. MWC7625-SH — no certificate
Reply with a code to continue, or would you like me to escalate to customer_service team?
```

`dym_probe_meta.ok === true`, `reason === null` (not `unscoped_probe`), `dym_available_codes ===
['mwc7625-sh-s10']`, `suggest_quick_reply` bare and free of `.pdf`.

**One thing I want on the record, because it is the residual risk and it is not mine to close:**
this is an *offline* replay of a real envelope, not the positive branch running end-to-end through
`dym-probe`. It closes the reviewer's F-ATT concern about the **field contract** completely — the
shape is now observed, not inferred from `presenters.py`. It does **not** by itself demonstrate
that a `— has certificate` was rendered from a live `dym-probe` call. Per the coordinator's ruling
`product_attachment` stays enabled; the tester should still capture one live end-to-end positive
(fixtures offered: `MWC7625`, `IBWC7601`, `SRTWC8317-RL`, `SRTEC8605-RL`, `SRTWT2215`,
`SRTSC07-WEPLS`) before promote, and F-EMPTY's post-promote watch (a near-100% all-negative rate
means the probe broke, not that the catalogue emptied) still applies.

---

## K. Rev-3 change — F-DUPE: a code behind >1 candidate uuid is excluded from the probe

**Node touched: `dym-transform` only** (plus one key added to `build-suggest-offer`'s strip list).
**Zero new render logic** — the "not probed ⇒ no suffix" path already existed.

### K1. What was wrong

`product_code` is unique **per company** (`app/models/product.py:182`,
`uq_products_company_product_code`). One code under two uuids is therefore **two different
companies' products**, by schema invariant — there is no duplicate data and nothing to clean up.
`tokenCandidates()` dedups by code and discards the second uuid, so **arrival order silently
decided which company the rendered line represented**. Both probe tools are company-scoped, so the
twin returns zero rows and the line renders `— no <noun>`: a true statement about *someone else's*
product, printed where the customer reads their own. The change would have converted today's
silence into a confident wrong assertion decided by a coin flip.

### K2. Why the uuid-union was rejected

Recorded because it is the obvious fix and it is a trap:

- **Probe/pick divergence (fatal).** `output_exchange.applyDymPick` builds `_picked` from a
  **single** `dym_candidates` entry carrying one uuid. A union answers over a *set* and the pick
  resolves to *one* — so `— has certificate` → customer picks → query hits the empty twin → "no
  certificate matched these". A dead-end **with an added false promise**, strictly worse than the
  silent dead-end this change exists to remove.
- **Not repairable with a witness uuid.** `presenters.py::_product_attachments` emits title plus
  `Product Code`/`Product Name`/`Description`/`Dimensions`/`Attachment Type`/`File Name`/
  `Certificate Number`/`Valid Until`/`Validity` — **no product id**. n8n cannot tell which uuid
  produced the matching rows.
- **It would test green.** Every unioned entity is `entity_type: 'product'`, which is in both
  `MAPPABLE` and `TYPE_TO_PARAM`, so F2a is unaffected. Mechanically safe, semantically wrong.

### K3. What was built

In `dym-transform`, a new `uuidCensus(res)` pass and one guard in the candidate loop:

```js
const uu = census.get(k);
if (uu && uu.size > 1) {
  dym_excluded_codes.push({ code: String(code), reason: 'multi_uuid_code', uuid_count: uu.size });
  continue;
}
```

- **Pre-dedup detection, as a SEPARATE function.** `tokenCandidates()` is left **byte-for-byte
  unchanged** — see §K4. `uuidCensus()` walks the same accumulator with the same pre-dedup filters
  and returns `code -> Set(uuid)`.
- **`isExact` entries are counted** (unlike in `tokenCandidates`): an exact-tier twin still proves
  cross-company ambiguity. It cannot cause a false exclusion, because the same product resolved at
  two tiers carries the same uuid and the `Set` collapses it — asserted (`F-DUPE same-uuid not
  excluded`).
- **New observable:** `dym_excluded_codes: [{code, reason:'multi_uuid_code', uuid_count}]` on
  `dym-transform`'s output, so the exclusion is visible per code in runData. Added to
  `_DYM_CTRL_KEYS` so it is stripped in `build-suggest-offer` and cannot leak into the emitted
  object.
- **Sixth `probe_skip_reason`: `multi_uuid_code`**, set only when the exclusion is the *sole*
  reason no candidate survived (mixed causes still report `no_candidate_uuid`, which stays true).
  So runData distinguishes "nothing resolvable" from "everything ambiguous".
- **The candidate is still offered.** Exclusion removes the *annotation*, never the candidate:
  it stays in `suggest_quick_reply`, `suggest_last_result_set` and `dym_candidates`, and renders
  with **no suffix at all** — never a misleading "no".

Rendered (resolver order `S, SL(×2 uuids), S10-P`; only `S` has the document):

```
Couldn't find "ibwc8315-s10". Did you mean:
1. IBWC8315-S — has certificate
2. IBWC8315-SL
3. IBWC8315-S10-P — no certificate
```

### K4. Restructuring risk — what I did and did not touch

The reviewer's requirement was pre-dedup detection, and `tokenCandidates()` throws the evidence
away. **I did not restructure it.** `tokenCandidates()` in `dym-transform` must stay equivalent to
`build-suggest-offer`'s copy or `_survivors` diverges from what actually renders — the one thing
this node may never get wrong. So the census is a second pass over the same accumulator, at the
cost of ~6 duplicated lines. I am comfortable with that trade and would push back on any
"de-duplicate the two functions" suggestion: the duplication *is* the safety property.

The only other touch is `d1s.push({…, _res: res })` so the survivor can reach its own resolution.
`_res` is read solely by the census; `build-suggest-offer`'s copy of the block does not have it and
does not need it.

### K5. Test delta

`harness.js` **85 → 106 assertions**, all green. New: the mixed case (ambiguous code excluded,
siblings still labelled, ambiguous code still offered and bare), the all-ambiguous case, and the
same-uuid-two-tiers non-exclusion. `byteid.js` **10 → 12 fixtures**, all byte-identical: the
all-excluded path and a mixed gate-FALSE path (the "probe must not run at all, render exactly as
today" requirement).

Fail-on-purpose, executed: neutralising the guard (`if (uu && uu.size > 1)` → `if (false)`) turns
**11 assertions RED**.

### K6. Not fixed here — filed separately (reviewer §6.1, closing paragraph)

**Today, before this change**, a customer offered an ambiguous code who picks it is routed to an
**arbitrary company's product**. Some share of the measured 67% dead-end rate that motivated this
whole change may be *that*, not missing data. It is a resolver/CRM issue — either the resolver
should not return cross-company twins, or it must label them so n8n can choose — and it is
plausibly worth more than the feature being shipped here. Out of scope; do not bundle.

---

## L. Mutation-procedure hardening (reviewer §6.3)

The fail-on-purpose harness was itself uninstrumented: a mutation targeting `return (hb - ha);`
against a source that reads `return hb - ha;` matched nothing and the suite printed **ALL PASS** —
indistinguishable from "the suite resisted the mutation". Fifth instance of the class.

Added `tests/offline/dym-probe-before-offer/mutate.sh`, which enforces and *refuses to run the
suite* without: (1) search string occurs exactly N>0 times **before**; (2) file digest **changed**
after; (3) loud abort otherwise. It restores the file on exit and reports `GATE IS BLIND` if a
genuinely-applied mutation leaves the suite green.

Proven in all three directions:

| run | result |
|---|---|
| the original no-op string `return (hb - ha);` | **ABORT**, `occurrences before: 0 (expected 1)`, suite not run, exit 1 |
| correct string `return hb - ha;` → `return 0;` | applied (digest moved), **8 assertions RED** |
| F-DUPE guard → `if (false) {` | applied (digest moved), **11 assertions RED** |
| after restore | digests back to originals, 106/106 + 12/12 green |

Recorded as **UAC §0 S9**, **LESSONS §61b**, and a preamble to §DP-FP (plus new §DP-FP-9/-10).

---

## M. Rev-4 changes — the third renderer, the stock wording, the separator

### M1. 🔴 Reachability: `dym-annotate` is NOT reachable from the partial-resolution renderer

This is the design question you asked me to settle before wiring anything. Answered from the graph,
not from assumption:

```
If6[0] -> central-exchange -> compile-current-state          RESULTS lane
If6[1] -> Aggregate1 -> not-found-error-message -> sibling-gate
             -> dym-transform -> dym-gate -> dym-probe -> dym-annotate
             -> build-suggest-offer -> tag-not-found -> escalate-catalog
             -> cs-offer-gate[1] -> compile-current-state   NOT-FOUND lane
```

Transitive reachability, computed over the published `connections`:

| from `dym-annotate` | reachable? |
|---|---|
| `compile-current-state` | ✅ **yes** — but only via `cs-offer-gate[1]`, the not-found lane |
| `central-exchange` | ❌ **no** |
| `build-ideate-reply` | ❌ no |

The partial-resolution block requires `_answered` (results came back, `last_result_set` non-empty),
so it fires on the **`central-exchange` lane** — the one arm `dym-annotate` cannot reach.
`$('dym-annotate').isExecuted` is false there, every time. **New wiring was required.**

Useful corollary: the `cs-offer-gate[1]` inbound *is* already downstream of `dym-annotate`, so
`compile-current-state` reading it costs nothing on that route and is handled by the same block.

### M2. Wiring chosen, and the one I rejected

**Rejected: move the single chain upstream of `If6`** (the common ancestor of both lanes). It looks
like the elegant answer and it is a trap: `dym-transform` **emits exactly one item** so the probe
batches, and `If6[1] -> Aggregate1` exists precisely to collapse N items to 1. Inserting a
1-item-emitting node above `Aggregate1` changes its input cardinality and silently alters the
not-found payload — a regression against approved rev-3 behaviour, on the busiest path.

**Built instead: a second lane on the results arm**, inserted at the single point that needs it:

```
central-exchange[0]      -> dym-transform-partial
dym-transform-partial[0] -> dym-gate-partial
dym-gate-partial[0]      -> dym-probe-partial
dym-gate-partial[1]      -> compile-current-state
dym-probe-partial[0]     -> dym-annotate-partial
dym-annotate-partial[0]  -> compile-current-state
```

`compile-current-state` ends with **5 inbound** (was 4). The not-found lane and
`build-suggest-offer`'s 4 inbound are **completely untouched**.

**Why inserting there is safe:** `compile-current-state` reads `$('central-exchange')` **by name**
(`getResultObj()`), and by-name reads are not redirected by rewiring — so the results envelope still
resolves exactly as before. `central-exchange` returns a single object (1 item), so the cardinality
objection above does not apply here. And `compile-current-state` does **not** spread `$input` into
its output, so no `_DYM_CTRL_KEYS` strip is needed on this lane.

### M3. Shared logic — not a third fork, and provable

You asked me not to fork the annotation rules. n8n Code nodes have no imports, so "shared" has to
mean *provably identical bodies*. That is what was built:

| node | relationship | proof |
|---|---|---|
| `dym-transform-partial` | **byte-identical** to `dym-transform` | direct sha comparison |
| `dym-annotate-partial` | differs in **exactly two top-of-file lane-config literals** (`_PAYLOAD_SRC`, `_XF_SRC`) | sha of both bodies with those two literals normalised: **equal** |
| `dym-probe-partial` | copy of `dym-probe`; only `$('dym-transform')` → `$('dym-transform-partial')` in `tool`/`entities`/`user_prompt` | asserted no `$('dym-transform')` remains |
| `compile-current-state`'s reader block | same `_dymOk`/`_dymHas`/`_dymProbed`/`_dymNoun` contract and the same `_dymNounOf` cert normalisation as `build-suggest-offer` | §M6 |

`dym-annotate` was refactored to hoist its two path-specific node names into named constants, which
is what makes the "one body, two lanes" claim checkable rather than asserted. The census/exclusion
logic (F-DUPE), both predicates, and the fail-open contract exist in exactly one place.

**Contrast with the `tokenCandidates()` duplication I defended in §K4:** that duplication protects
*probe-vs-render equivalence* — two functions that must stay independently faithful to a third.
This is the opposite situation (one rule, two call sites) and correctly shares. Different problems.

### M4. `compile-current-state` hunk — suffix only, **no sort**

Two edits, both inside the existing partial-resolution IIFE:

1. the shared `_dym*` reader block plus `_dymSfx(code)`, resolving `dym-annotate-partial` first then
   `dym-annotate` (whichever lane ran);
2. `_lines.push(\`  ${idx}. ${p.label}\`)` → `_lines.push(\`  ${idx}. ${p.label}${_dymSfx(p.m.canonical_code)}\`)`.

**🔴 No has-first sort here, deliberately.** This block assigns a **global contiguous `idx`** across
tokens that `_numbered` and `_dymCands` are keyed on, and `_numbered` carries the
`for_raw`/`for_hint`/`for_canonical` pick-linkage that D1's rows do not. Sorting would renumber
across token blocks and break the round-trip. The annotation is suffix-only and order-preserving —
asserted by stripping the suffixes and diffing the whole rendered string against LIVE, and by
comparing `variables.dym_last_result_set` to LIVE's object-for-object.

`_dymSfx` keys on `p.m.canonical_code`, never `p.label`, so a uuid-coded candidate rendered by
display name is simply never probed and gets nothing.

Rendered (real user case, attachment):

```
Couldn't find these:
"srtwc8317-rl1" — did you mean:
  1. SRTWC8317-RL - no certificate
  2. SRTWC8317-P-RL - has certificate
  3. SRTWC8317-SH - no certificate

Reply a number to check it, or ask again.
```

Note the `"srtwc8317-rl1" — did you mean:` header keeps its em-dash — that is pre-existing text, not
a suffix this change introduces (§M6).

### M5. Scope limit I want stated, not buried

`probe_needed` still requires `_survivors.length === 1`. The partial renderer surfaces **up to 5**
missed tokens, so a **multi-token partial miss stays un-annotated**. That is the same exclusion as
plan §3.4's multi-token D1 row and it is deliberate — but it means the "bot contradicts itself"
complaint is *narrowed*, not eliminated: a 2-miss partial turn still renders bare.

Lifting it is genuinely low-risk **here** (this renderer does not sort, so the idx-renumbering
hazard that justifies the D1 exclusion does not apply) — but relaxing `probe_needed` is a shared
gate and would change rev-3-approved `dym-transform` behaviour that §DP-13a pins. I did not do it
unilaterally. **Recommend it as a follow-up**, with §DP-13a re-scoped to the render layer.

### M6. Wording: `stock details`, and the separator

- `DOMAIN_PROBE.inventory.noun`: `'stock'` → **`'stock details'`**. One literal, one place; both
  renderers pick it up. `build-suggest-offer`'s separate `NOUN` map (used by D2's
  `No {noun} for {code}`) still says `stock` and is **untouched** — D2 byte-identity holds.
- **🔒 Label vs predicate — SETTLED 2026-08-07 (rev 5), with evidence. Not a defect.** The predicate
  is `qty_gt_zero` (summed `Quantity On Hand > 0`) and that is **verified live**, not assumed —
  §DP-14 is closed on exec `11512474`: `SRTWC8318-RL-BL1` has one stock row at qty 0 and rendered
  `- no stock details`, which a row-presence predicate would have called "has". The label
  nevertheless says "stock details": shown that exact discriminating case, the user chose **not** to
  surface the row-exists / qty-zero / no-row distinction to customers, because the label should
  describe **what the customer can act on** ("is there stock I can have"), not what the database
  contains. **Do not "fix" either side to match the other, and do not raise the mismatch as a
  finding** — the reason now travels with the instruction, in the comment on the `predicate` line in
  `dym-transform`, here, and in §DP-17.
- Separator `—` → `-` in **the suffixes this change introduces only**:
  `` ` - has ${_dymNoun}` `` / `` ` - no ${_dymNoun}` `` in both renderers.
  **D3's `— has incoming` (`build-suggest-offer.js:90`) is a different expression and is untouched**
  — asserted programmatically, so no stop-and-ask was needed.
  `suggest_quick_reply` is unaffected (built from `codes` only); §DP-11a/b re-run green, and a new
  clause asserts no ` - has `/` - no ` leaks into the buttons either.

### M7. Promote impact — the hunk got bigger, and `compile-current-state` is shared

`compile-current-state` is **byte-identical on live and clone today** (verified). So the promote now
carries **two** changed live nodes (`build-suggest-offer`, `compile-current-state`) and **eight** new
nodes, in two lanes. Both changed bodies are currently `live + my hunks only` — re-verify that at
promote time, because live moved once already during this cycle (`f03086ac` → `533499f4`, an
unrelated `disallowed-entity-gate` change; my two baselines were unaffected, and I checked rather
than assumed).

`dym-probe-partial` takes the **same** target ruling as `dym-probe` (§I): the scope-forwarding sub.

### M8. Test delta

New suite **`ccs-harness.js` — 26 assertions**, running the published `compile-current-state`,
`dym-transform-partial` and `dym-annotate-partial` bytes against a stubbed `$`. A node that exists
but did not run reports `isExecuted:false` and **throws on `.first()`** — n8n's real behaviour — so
the node's own guards are actually exercised. Cases: attachment annotated (+ idx/order/linkage
identical to LIVE once suffixes are stripped), inventory "stock details", fail-open when no annotate
node ran, fail-open on `ok:false`, F-DUPE exclusion carrying over to this renderer, and a
non-enabled domain. Four of the six assert the **whole output object byte-identical to LIVE**.

`harness.js` 106 → **107** (added the quick-reply hyphen-leak clause; wording assertions updated).
`byteid.js` unchanged at **12**.

Fail-on-purpose, executed: neutralising `_dymSfx`'s has/no branch turns **2 ccs assertions RED**;
a deliberately wrong search string **ABORTS** per §L instead of printing a green suite.

---

## N. Rev-5 changes — the fourth surface, the multi-token lift, the measured budget

### N1. 🔴 I did NOT generalise the incoming chain, and I did NOT add a lane. Neither was needed.

You asked me to prefer generalising `If-incoming-picker` → `probe-incoming` →
`annotate-incoming-picker`, and to say so if that risked `incoming`. It did — and then a better
answer turned up, so I took neither option.

**Generalising was the wrong shape, for three concrete reasons:**

1. `probe-incoming`'s `tool` is the hardcoded literal `crm_incoming_stock_list`. Serving
   `product_attachment` means turning a shipped literal into an expression **on the incoming path**
   — a change to `incoming`'s own node, which is exactly what "do not regress incoming" forbids.
2. `probe-incoming` passes `entities = gate.compatible_entities`. On a require-specific turn the
   gate **replaces** `compatible_entities` with the option-uuid set
   (`disallowed-entity-gate.js:215-217`), so the `attachment_type` uuid is **not in it**. The
   attachment probe would have gone out unscoped or not at all.
3. It would have inherited the F6 landmine — `probe-incoming` targets `rysSPgUssLDf6xJc` on LIVE —
   and entangled it with this change's own promote ruling.

**What I found instead: this surface is already on the existing dym chain.**
`not-found-error-message.js:175` does `escalate_message = gate.gate_clarification` when
`require_specific`, and that payload flows
`not-found-error-message → sibling-gate[1] → dym-transform → dym-gate → dym-probe → dym-annotate →
build-suggest-offer`. The picker text passes through **every node this change already owns**.

So rev 5 adds **zero nodes and zero edges**. `If-incoming-picker`, `probe-incoming` and
`annotate-incoming-picker` are **byte-untouched** — re-asserted from the published JSON, including
that `If-incoming-picker`'s domain condition is still exactly `incoming`, and that
`annotate-incoming-picker` and `disallowed-entity-gate` remain clone==live. Node count unchanged
at 149.

**The F6 collision is called out and NOT inherited:** `dym-probe` and `dym-probe-partial` carry
this change's own §I ruling (target the scope-forwarding sub) on their own reasoning. The fact that
`probe-incoming` happens to point at the same id on live is a separate pre-existing defect. Two
different reasons, same id today — do not let a future reader collapse them.

### N2. `dym-transform` — a third candidate source, one body

The picker's candidates are **not** D1 survivors: they are the gate's own option set, already
uuid-carrying. A `probe_lane` discriminator was added (`'d1' | 'picker' | 'partial'`, emitted in
runData) and the candidate set is chosen per lane, but **the rules downstream of that choice are
unchanged and shared**: same F-DUPE census, same F2a guard, same `MAPPABLE` filter, same
`DOMAIN_PROBE` map. `dym-transform-partial` remains **byte-identical** to `dym-transform`.

**One genuinely new piece — the scoping-entity fallback (`_scopingFrom`).** On the picker path the
`attachment_type` uuid is absent from `compatible_entities` (§N1 point 2), so F3 layer 1 would have
fired `no_scoping_entity` and the surface would have stayed silently bare — a green build that
fixes nothing. The lookup now falls back to the resolver's own flatten when
`compatible_entities` yields nothing. **Additive and order-preserving:** the other two lanes still
find it in `compatible_entities` first and are byte-unaffected.

### N3. `build-suggest-offer` — annotate `escalate_message`

A `requireSpec && _dymOk` block rewrites the numbered lines of `out.escalate_message` using
**the same line regex as `annotate-incoming-picker`** (`/^\s*\d+\.\s+(.+?)\s*$/`), so the two
renderings of the same picker cannot drift. Header untouched, numbering untouched, **no reordering**
(the numbers are the pick affordance). Unprobed codes — including F-DUPE exclusions — stay bare.

**The 8-candidate render, as asked:**

```
product_attachment search needs to be more specific. Multiple matches found — please choose:
1. SRTWC193 - has certificate
2. SRTWC190 - no certificate
3. SRTWC195 - has certificate
4. SRTWC191 - no certificate
5. SRTWC192 - no certificate
6. SRTWC194 - no certificate
7. SRTWC196 - no certificate
8. SRTWC197 - no certificate
```

**Length / button cap — confirmed not engaged.** 8 annotated lines ≈ 380 chars (asserted < 700,
well under any message limit). `suggest_offer` stays `false` and **no `suggest_quick_reply` is
invented** on this path, so the respond.io button cap is untouched — it is a numbered list, replies
are typed. Both asserted.

### N4. Multi-token lift — lane-specific, gate not restructured

You asked whether the shared gate needed restructuring. **No.** `dym-transform` detects its lane
instead of being configured with it:

```js
const _isPartialLane = (() => { try { return $('central-exchange').isExecuted === true; } catch (e) { return false; } })();
```

`central-exchange` is the direct upstream of `dym-transform-partial` and sits on the results arm of
`If6`; the not-found and picker lanes come off the other arm. Your own runData finding (on a partial
turn neither `Aggregate1` nor `dym-transform` appears) is what makes this sound. The lift is then
one conditional: `_survivors.length > 1` is allowed **only** when `_isPartialLane`. D1's exclusion
is untouched, and `build-suggest-offer` only annotates inside its single-token code mode regardless.

**Fail-safe direction is deliberate:** if the lane probe throws, it returns `false` — the
conservative rev-3 single-token limit, never the looser one. §DP-13a is re-scoped to say it pins the
`d1` lane; §DP-16d is rewritten from "known gap" to the lifted behaviour.

I considered `$prevNode.name` first and rejected it: I could not verify `$prevNode` is exposed to
Code nodes on this n8n build, and a silently-false discriminator would have shipped a lift that
never fires.

### N5. Wording — settled, documentation only

No literal and no predicate changed. What changed is that three places now record **why**:
the comment on the `predicate` line, §M6, and §DP-17. All three previously read as an unresolved
mismatch; they now record that the predicate is `qty_gt_zero` **verified live** (§DP-14 closed, exec
`11512474`, `SRTWC8318-RL-BL1` — one row at qty 0 rendering `- no stock details`, which row-presence
would have called "has"), and that the label is a **deliberate, informed simplification** chosen
after the user was shown that exact case: it describes what the customer can act on, not what the
database contains. The bare "do not fix either side" warning now carries its reason.

§DP-14 is marked **CLOSED — verified**, with the fixtures recorded so nobody re-derives them:
`SRTWC8318-RL-BL1`, plus `MWC7601-RL-S10` / `SRTWC8318-RL-BL` / `SRTWC8318-RL-GY`.
Attachment noun untouched.

### N6. Plan §3.7 — replaced, not annotated

The false claim ("zero new nodes executed on answered turns") is **gone**, replaced by the measured
table: transform 20 ms + gate 1 ms + probe 361 ms + annotate 35 ms ≈ **417 ms** added inline, on
turns of 5.8–18.4 s — **≈0.35 % of the p99-vs-lock-TTL budget, no breach**. Probe range 232–458 ms
with one 1.9 s outlier, flagged as the thing to watch given there is still no per-node
`executeWorkflow` timeout. §3.7 also now enumerates all four surfaces / three lanes and records that
they are mutually exclusive, so at most one extra read per turn — they cannot compound.

### N7. Test delta — and a real regression the gates caught

`harness.js` 107 → **132** (picker incl. the 8-candidate render, scoping-entity fallback, F-DUPE and
fail-open on the picker, and the D1-vs-partial multi-token split). `byteid.js` 12, `ccs-harness.js`
26 — **170 assertions total**, all green against the published bytes.

**Worth recording:** adding `probe_lane` to `dym-transform`'s output leaked it into
`build-suggest-offer`'s emitted object, because I forgot to add it to `_DYM_CTRL_KEYS`. Four
`harness.js` byte-identity assertions and 11 `byteid.js` fixtures went **red on the first run** and
named the stray key. That is the §DP-10/§DP-12 gate doing precisely the job it was built for, on a
mistake I made rather than a hypothetical — the strip list is a maintenance burden that has now paid
for itself once.

---

## O. Rev-6 — the annotation was computed and then discarded. One node changed.

### O1. What was broken

`escalate-catalog.js:20-23` re-sources the picker text **by name from the node upstream of the entire
dym chain**:

```js
const nfNode = $('not-found-error-message');
const nf = nfNode.isExecuted ? nfNode.first().json : $('annotate-incoming-picker').first().json;
response = nf.escalate_message;
```

`build-suggest-offer` annotated correctly and — correctly — **spread rather than mutated**, so its
output was simply never consumed. Exec `11514456`: producer object perfect, customer received the
bare 8-line picker, every offline gate green.

This is the repo's oldest landmine (LESSONS §5 / TOPOLOGY *Read BY NAME*) **on the read side**. My
rev-5 reachability analysis proved the payload *reached* `build-suggest-offer` — true, and
irrelevant. Nothing checked where the **rendered text was sourced from** downstream.

### O2. The fix — prefer the annotated source, three-deep fallback

Exactly the shape the existing `annotate-incoming-picker` fallback already set as precedent (that
comment at `:18-20` describes the same problem solved the same way). Source order:

```
build-suggest-offer (annotated)  →  not-found-error-message  →  annotate-incoming-picker
```

- **`build-suggest-offer` remains the annotation authority** — the suffix is **not** recomputed in
  `escalate-catalog`; it only chooses a source.
- **Flags stay coherent.** `manualResponse = !nf.require_specific` and
  `is_escalate_offer = !nf.is_clarification` are read from **the same object** the text came from.
  `build-suggest-offer` spreads the not-found payload and never touches either field, so both are
  byte-identical to before on every path where the annotation does not apply.
- **The `annotate-incoming-picker` fallback is untouched** — same expression, now third in the chain;
  asserted by a dedicated test (`incoming` still renders its `— has incoming` wording).
- **Fail-open by construction:** the preferred source is taken only when the node executed **and**
  `escalate_message` is a non-empty string; anything else falls through to exactly today's behaviour.
  Three fail-open cases are asserted (absent / empty / null), each returning the gate text verbatim.

Only `escalate-catalog` changed in rev 6. No node added, no edge added — 149 nodes, unchanged.

### O3. 🔴 The new gate: assert what the CUSTOMER receives

The suites could not detect this class **at all**, because every assertion targeted an intermediate
node's output object. Added a gate that runs the **consumer**:

- **picker →** `harness.js` runs `escalate-catalog.js` against `build-suggest-offer`'s real output and
  asserts the emitted `response` carries ` - has certificate` / ` - no certificate`, header intact,
  plus `manualResponse` / `is_escalate_offer` coherence and the three fail-open cases.
- **D1 →** `ccs-harness.js` runs `compile-current-state` and asserts `user_response` carries the
  suffixes.
- **partial →** already asserted on `compile-current-state.user_response` (§M8).

**The gate discriminates, permanently and in-suite** — not as a one-off manual revert. `harness.js`
keeps `live-ec.js` (the pre-fix consumer) alongside `escalate-catalog.js` and runs **both** against
the same annotated producer output, asserting the pre-fix body returns the text **without** the
annotation and byte-equal to `gate_clarification`. So the gate proves it can tell the two apart on
every run, and it will go red again the moment someone reintroduces the by-name read.

### O4. Are the other three surfaces exposed? Verified, not assumed.

Grepped every Code node for `$('…')` reads of `escalate_message` / `suggest_response` /
`user_response`:

| surface | who sources the rendered text | exposed? |
|---|---|---|
| D1 | `compile-current-state:27` → `$('build-suggest-offer')` — **the authority itself** | ❌ no |
| partial | appended in place inside `compile-current-state`; `crossdomain-compose` operates on its own `$input.user_response` (passthrough) | ❌ no |
| picker | `escalate-catalog` → `$('not-found-error-message')` — **upstream of the chain** | ✅ **yes — the defect** |
| incoming | `escalate-catalog` → `$('annotate-incoming-picker')` — the authority for that lane | ❌ no (and unchanged) |

**No other node re-sources any of the three fields by name.** Exactly one surface was exposed, and
it is fixed.

### O5. Test delta and the fail-open concern

`harness.js` 132 → **142**, `ccs-harness.js` 26 → **30**, `byteid.js` 12 — **184 assertions**, green
against the published bytes.

On the Cloudflare 504s: the probe-failure path is exercised in code, not merely configured —
`_dym_probe_input` sentinel, payload `error`, missing `answers`/`items`, `unscoped_probe` and the
three `escalate-catalog` fail-open cases all have assertions, and each degrades to output
byte-identical to LIVE. What offline cannot exercise is n8n's own `onError:continueRegularOutput`
mechanism firing on a real sub failure. **The tester should induce a real probe failure** (§DP-19)
rather than infer it from configuration — that gap is the honest residue here, and given a fragile
origin issuing reads on three lanes, it is the one worth spending a run on.

---

## P. Disposable artifacts for the induced-failure run (F-ONERR promote gate) — DELETE AFTER

Three throwaways, all `zz-`prefixed and named DISPOSABLE. **None is part of the change.**

| id | what | state |
|---|---|---|
| `yHUqYrFuWCF1Plr3` | `zz-THROWAWAY-sub-always-throws` — exec trigger → a Code node whose only statement is `throw` | published |
| `Es4WwjMHOEy9j62V` | `zz-THROWAWAY-dym-probe-fail` — byte copy of the reviewed clone at `b79ef8c4`, with **only** `dym-probe` + `dym-probe-partial` repointed at the throwing sub | published |
| `4AQFVgLB4skVjAzH` | **`zz-run-throwaway`** — the driver. 10-node mirror of `zz-canary-run` with `Run Target` → `Es4WwjMHOEy9j62V` and its own webhook path/id | published + active |

**Driver:** `POST https://automate-sorento.foundryx.my/webhook/zz-run-throwaway-hint`, same body
shape as `zz-canary-run` (`{test_run_id, contact, item}`). It preserves the full instrumentation —
`llen-prod`/`llen-sink` before **and** after, `clear-q`, `clear-egress`, `seed-q`, `read-egress` —
so §0 S7a/S7b and the customer-boundary assertions work exactly as for every other case. All 8
redis credentials carried over. Distinct webhook path **and** regenerated `webhookId`, so it cannot
collide with `zz-canary-run`.

**Why a driver at all:** MCP cannot fire an `executeWorkflowTrigger`-only workflow or pass it custom
JSON (LESSONS §1), and `settings.availableInMCP` does not change that — my earlier "drivable via
MCP" line was wrong. Every existing driver hardcodes `txiPzSxy3Pclsz6v`.

### 🔴 `active: false` on the copy is NOT ACHIEVABLE — I was wrong twice, here is the fact

I reported `active:false`; the tester read `active:true`. Both readings were honest and mine was
**stale by one operation** — I checked containment *before* calling `publish_workflow`, and
publishing sets `active`. Then, told to set it false, I did: `POST /workflows/{id}/deactivate`
returned 200 — **and cleared `activeVersionId`, unpublishing the workflow.** The driver then refused
to publish: *"Cannot publish workflow: Node 'Run Target' references workflow Es4WwjMHOEy9j62V…"*.

Measured on this n8n: **`active` and `published` are the same flag.** Deactivate ⇒
`activeVersionId: null` ⇒ the workflow is **uncallable as a sub-workflow**. Re-activating restored
`activeVersionId` exactly. So for any `executeWorkflowTrigger`-only workflow, `active:true` is a
**precondition of being callable at all** — and every artifact the harness already depends on is in
that state: the reviewed clone `txiPzSxy3Pclsz6v`, `sub-get-results TEST`, the save-msg fork
`tWm5DYLxfypmVC1T`, all `active:true`.

**So the containment claim must be restated, because the old wording was carrying it on a property
the artifact cannot have.** Containment for the copy rests on:
1. **Trigger type** — one trigger, an `executeWorkflowTrigger`. No webhook, no schedule, no
   respondio trigger, so **nothing external can start it**; n8n's own `triggerInfo` says manual-only.
2. The **5 egress orphans** at 0 inbound (`send-message-files/images/video`,
   `update-human-intervened`, `save-session-vars`).
3. The save-message **sink** → `tWm5DYLxfypmVC1T` (unconsumed list).
4. The other four get-results callers still → `rysSPgUssLDf6xJc`.

All four re-asserted **on the copy**, not inherited. That is the identical basis the reviewed clone
runs on. **`active:false` was never a containment property of any of them** — stating it as one was
the error, and it is the same "assumption carried as fact" shape this cycle has produced three times.

**Note on banned node types:** the *throwing sub* has none (no HTTP/redis/respondio, zero
credentials). The *copy* does contain `update-human-intervened` (respond.io) — same as the real
clone, where it is one of the five 0-inbound orphans. That is the containment design working, not a
new hazard; the sub's "none" line is not a statement about the copy.

**Incidental transport finding (refines LESSONS §55):** REST PUT does **not** auto-publish a
*never-published* workflow — 200 with `activeVersionId` still `null`. §55's "PUT always
auto-publishes" holds only where an active version already exists. All three throwaways needed an
explicit `publish_workflow`, which needed `settings.availableInMCP: true` (off by default on
REST-created workflows).

---

## Q. Rev-7 — divergence gates. No behaviour changed.

Only `compile-current-state` changed on the clone, and only by a comment.

### Q1. `parity.js` — the three silent-divergence invariants, finally committed

My rev-3 equivalence run was real and clean but **lived nowhere** — the reviewer grepped all three
suites and found no parity assertion. Rev 4 tripled the exposure. Now committed as one suite that
**sources every body from `export/clone-sorento-consume-main-TEST/nodes/`**, so it asserts what is
*published*, not the offline working copies (and exits 2 if the export is missing).

| invariant | result | negative control |
|---|---|---|
| **P1** `tokenCandidates()` in `dym-transform` == `build-suggest-offer` (probe-vs-render) | ✅ identical (comments ignored; brace-balanced extraction, not regex) | delete `if (isExact(m)) continue;` from one copy → **red** |
| **P2** `dym-transform.js` == `dym-transform-partial.js` | ✅ byte-identical | append one newline → **red** |
| **P3** `dym-annotate.js` == `dym-annotate-partial.js` modulo `_PAYLOAD_SRC`/`_XF_SRC` | ✅ identical after normalising the two constants | flip `meta.ok = true` → `false` in one copy → **red** |

P1 additionally asserts the four filters are *present* (so a rewrite that keeps both copies
identical while dropping a filter still trips), and P3 asserts each lane points at its **expected**
source — identical bodies aimed at the wrong nodes would sail through a pure-equality check.

**No divergence found.** All three invariants hold on the published bytes. That is a clean result,
not a formality — and it is now detectable if it ever stops being true.

### Q2. F-CCS-STRIP — the dependency is now stated and gated

`compile-current-state` receives 10 appended control keys and has no strip list. It is correct
**only** because it returns a fresh `let output = {};` literal. `parity.js` now asserts that literal
is present, that the node never spreads `$input` into `output`, and that no control key is ever
assigned onto `output`. Control: rewrite the literal to `{...$input.first().json}` → **red**.

A comment at the literal states what depends on it and why it is invisible on the clone
(`save-session-vars` is orphaned, and `crossdomain-compose` feeds the conversation-variables PUT as
`JSON.stringify($json)` — the whole item), pointing at the gate by path.

### Q3. F-XDC — annotated text survives `crossdomain-compose`, now measured

Runs the real `crossdomain-compose` body over one fixture per annotated surface plus the
un-annotated prose arm.

**The gate immediately earned itself.** My first assertion was "no original line rewritten", and it
went **red on the D1 arm** — `crossdomain-compose` splits `Couldn't find "x". Did you mean:` at the
sentence boundary and inserts the block between the two halves. Looked at properly: that is
**shipped, intentional behaviour** (the node's own comment describes snapping to the marker's
sentence/line start), and the **pre-existing un-annotated prose arm failed the same assertion** —
which is the tell that the assertion was wrong, not the code. Tightened to the invariant that
actually matters:

- every ` - has X` / ` - no X` suffix survives, in order, on all four fixtures;
- **no annotated candidate line is ever torn** (the splice may only land at a boundary);
- the block is never inserted mid-candidate.

Control: tear an annotated line in half in the output → **red**. So the "safe by analysis" claim is
now a measurement, on the exact shape (correct-by-analysis meeting wrong-in-render) that produced
the rev-6 defect.

### Q4. `mutate.sh` — two corrections earned during this rev

- **`GATE IS BLIND` is relative to the suite you aim at.** Documented with the concrete
  `ccs-harness` / `dym-transform-partial` stub case; the runner now says "**DID NOT REACT**",
  prints the `grep -n "stub(\|nodeStub("` check, and lists ready-to-paste commands for the other
  suites. Demonstrated both ways: the false alarm now redirects, and the same mutation against
  `harness.js` goes 3 red.
- **`parity.js` is NOT a `mutate.sh` target** — it reads the export by design, so mutating a working
  copy can never move it. Its controls are internal; run `node parity.js` and read the `[control]`
  lines. This is exactly the trap the first bullet describes, hit while building this rev.

---

## G. Carried forward, not fixed here

- **F4** — `disallowed-entity-gate` passes non-exact fuzzy matches into the real lookup for
  every non-`REQUIRE_SPECIFIC` domain, including `inventory`. Real defect; own change, own
  publish (LESSONS §51). This change sources candidates from `tokenCandidates()`, not
  `compatible_entities`, so it neither depends on nor worsens it.
- **F6 🚩** — on **LIVE `f03086ac`**, `Call 'sub-get-results'` and `probe-incoming` both point
  at `rysSPgUssLDf6xJc` (`sub-get-results TEST`). Still present; re-confirmed while sourcing
  the `dym-probe` template. Reported, deliberately not corrected in this diff.
