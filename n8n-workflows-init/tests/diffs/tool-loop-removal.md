# NODE DIFF — `tool-loop-removal` on clone `txiPzSxy3Pclsz6v`

**Coder deliverable for review. Build-on-clone only. Live spine NOT touched, nothing promoted, no UAC
execution run.**

| | |
|---|---|
| target | clone `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) |
| pre-change `activeVersionId` | `6d479172-50e4-4be3-9e88-895a86b2701b` (draft == active, verified before writing) |
| **post-change `activeVersionId`** | **`cb4dffdb-c217-42a7-856f-0d45dca258ac`** (draft == active) |
| intermediate version (PUT #1, superseded) | `37909936-f56e-4e28-87ed-38687ab5b44f` — see §6 |
| backup on disk (fresh REST GET, pre-edit) | `n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-preTL-20260803-before.json` (gitignored via `*-before.json`; carries the `activeVersion` block ⇒ secret at rest, LESSONS §59b) |
| rollback | `publish_workflow txiPzSxy3Pclsz6v 6d479172-50e4-4be3-9e88-895a86b2701b` — a pointer move. **Never re-build the deleted nodes by hand** (new ids break golden-master keying, LESSONS §20) |
| transport | REST PUT ×2 (auto-publishes), body derived from a fresh faithful REST GET, `settings` sent as `{executionOrder, callerPolicy}` only (LESSONS §55) |
| live spine, re-checked read-only AFTER the build | `9qVyfUxmRQqrpGRMDLRuz` `versionId == activeVersionId == a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z`, 101 nodes, `Split Out1` + `Loop Over Items` both **still present** ⇒ untouched |
| authority | `plans/tool-loop-removal-plan.md` §5.1 (ops 1–10) + §9 Amendment A. Acceptance: `tests/UAC.md` §TL |
| node count | 140 → **138** |
| edge count | 179 → **176** (5 cut, 2 added) |

Scope tag `deterministic`: Code bodies + connections only. **Zero nodes added. Zero credentialed nodes
added or altered. Zero `is_test` leaves added.**

---

## 0. The COMPLETE delta — machine-diffed pre-change backup vs deployed graph

Nothing else moved. This is the whole change, enumerated exhaustively rather than asserted:

| | |
|---|---|
| nodes removed | `Split Out1`, `Loop Over Items` (2) |
| nodes added | **none** |
| nodes with changed `parameters` | `tool-filter`, `build-suggest-offer` (2 — and the second is comment-only, proven in §3) |
| nodes with changed non-`parameter` properties | `crossdomain-probe`: `executeOnce: true` → key absent (1) |
| edges | 179 → 176 (5 cut, 2 added — §1.1/§1.2) |
| `pinData` | identical (keys `Schedule Trigger`, `When Executed by Another Workflow` — the former is stale residue; **the clone has no `Schedule Trigger` node**, so editing it cannot consume the shared prod `main-message-list`) |
| `staticData` | identical |
| `settings` | identical after n8n's merge (`availableInMCP` and `binaryMode` survived being omitted from the PUT) |
| credentials | 28/28 identical |
| triggers | one, `When Executed by Another Workflow` (`executeWorkflowTrigger`), not disabled — same as before |

## 1. Edge-level diff — the complete before/after

### 1.1 Edges CUT (5)

| # | edge | why |
|---|---|---|
| 1 | `tool-filter [main 0] → Split Out1 [0]` | nothing left to split — `tool-filter` now emits one flat item |
| 2 | `Split Out1 [main 0] → Loop Over Items [0]` | loop entry removed |
| 3 | `Loop Over Items [main 1] → replay-get-results [0]` | loop body (clone's harness hop) |
| 4 | `Loop Over Items [main 0] → Aggregate1 [0]` | **the loop's done branch = THE MISS PATH.** Its role is taken over by edge A2 below |
| 5 | `If6 [main 1] → Loop Over Items [0]` | the loop back-edge |

### 1.2 Edges ADDED (2)

| # | edge | why |
|---|---|---|
| A1 | `tool-filter [main 0] → replay-get-results [0]` | direct feed into the get-results chain. Clone-only hop; on live this becomes `tool-filter → Call 'sub-get-results'` (plan §5.2 op 7′) |
| A2 | **`If6 [main 1] → Aggregate1 [0]`** | **THE CRITICAL EDGE.** Takes over the loop's `out0` role: carries every not-found turn into `Aggregate1 → not-found-error-message`, where all D1/D2/D3 miss templates and the frozen escalate phrase live. Omit it and every not-found turn dead-ends *while the execution still reports `status: success`* (memory `unwired-error-output-masks-failure`; LESSONS §61a) |

### 1.3 Nodes DELETED (2)

| node | id (clone) | type | inbound before | outbound before |
|---|---|---|---|---|
| `Split Out1` | `8d1ded21-64b7-4e0a-87fc-cc1cf16dce5c` | `n8n-nodes-base.splitOut` v1, `fieldToSplitOut: "tools"` | `tool-filter[0]` | `Loop Over Items[0]` |
| `Loop Over Items` | `86e2c25a-21f4-4f1b-a711-180bc324a7af` | `n8n-nodes-base.splitInBatches` v3, `options: {}` | `Split Out1[0]`, `If6[1]` | `Aggregate1[0]`, `replay-get-results[1]` |

Their `connections` map keys were removed as well (no empty stubs left behind).

### 1.4 Nodes deliberately KEPT

- **`Aggregate1`** — kept per plan D5. Parameters byte-unchanged
  (`fieldsToAggregate: [{fieldToAggregate: "response_intro"}]`, `options: {}`). It still narrows the
  validator envelope to `{response_intro:[…]}` before `not-found-error-message`, whose two downstream
  nodes both pass their whole input through.
- **`Loop Over Items1`** — the *unrelated* media/attachment `splitInBatches` (8 inbound edges,
  `→ Switch → send-message-*`). Untouched, asserted still present.
- `Execute 'sub-get-rag'`'s `limit: 5` — unchanged (plan D6 rejected `limit:1` as a competing enforcement
  point that can disagree with the code's selection rule).
- `Call 'sub-get-results'`'s `tool: "={{ $json.name }} "` — unchanged, including its trailing space.

### 1.5 Resulting topology

```
Execute 'sub-get-rag' → tool-filter → replay-get-results ─0→ fixture-get-results → validator
                                                          └1→ Call 'sub-get-results' → validator
validator → crossdomain-zeroset → crossdomain-gate ─0→ crossdomain-probe → crossdomain-render → If6
                                                    └1→ If6
If6 [out0] → central-exchange → …                                  (unchanged)
If6 [out1] → Aggregate1 → not-found-error-message → sibling-gate → …   (NEW EDGE A2)
If-incoming-picker [out1] → not-found-error-message                (unchanged, pre-existing 2nd feeder)
```

### 1.6 Positions

Deliberately **not** touched. `tool-filter` stays at `[6800, 3328]` and `replay-get-results` at
`[7472, 3312]`, leaving a visual gap where the two deleted nodes sat, and `If6 [8208,3456] → Aggregate1
[7472,2960]` renders as a leftward edge. Repositioning would add byte noise to the promote diff for zero
behavioural gain; flagging it so a reviewer does not read the gap as an accident. (Contra memory
`tidy-workflows-feedback` — deliberate, argue it if you disagree.)

---

## 2. Node `tool-filter` — body replaced (the only logic change)

`n8n-nodes-base.code` v2, id `e1d1d545-5a3f-4c14-ac2c-b757673c1f41`. `parameters` contains **only**
`jsCode` ⇒ mode is the default *Run Once for All Items* (required: the node returns a 0- or 1-element
array).

| | sha256(jsCode) | chars | lines |
|---|---|---|---|
| before | `54ac512b5a5b3e386c18fd7826497f484db7ccf60fd809c4d0b2bed1ab43d3f6` | 336 | 9 |
| after | `bffb4c3a40d4fa053756114e938b37722574acb72e09f0c54f79e83490dfdd0c` | 2453 | 59 |

Verbatim archives (plan §7): `tests/diffs/tool-loop-removal.tool-filter.before.js` /
`…after.js`.

### 2.1 BEFORE (whole body — it was 9 lines)

```js
// pick incoming tool by scope: product present → by_product; else → shipments (date/general)
const entities = $('disallowed-entity-gate').first().json.compatible_entities
const hasProduct = entities.some(e => e.entity_type === 'product');
var raw_tools = $("Execute 'sub-get-rag'").first().json.tools;


return {
  "tools": raw_tools
}
```

Dead-code passthrough: `hasProduct` computed and discarded; the comment describes scope logic that was
never applied. Byte-identical to live at build time.

### 2.2 AFTER (whole body)

```js
// ── ONE tool per turn (tool-loop-removal, 2026-08-03) ───────────────────────────
// Emits EXACTLY ONE item, always. The per-tool splitOut + splitInBatches fan-out
// that used to sit between this node and get-results is deleted, so nothing
// downstream serialises multiple items any more: two items here would run the whole
// get-results → compile → send chain twice, i.e. two WhatsApp messages to one
// customer. `return [{ json: … }]` is a one-element literal, so the arity is
// structural — it does not depend on how many embeddings the tool registry holds.
//
// Selection = highest `similarity`, tiebreak `name` ASC (deterministic for
// golden-master). Explicitly NOT the first array element: sub-get-rag's final Code
// node collapses source_id → name and does `map[name].similarity += …`, so the SQL
// best-first insertion order is not provably the maximum once any tool has two
// source_ids.
const rag = $("Execute 'sub-get-rag'").first().json || {};
const raw_tools = Array.isArray(rag.tools) ? rag.tools : [];

// Tolerant read of the entity gate. The previous body did
// `entities.some(e => e.entity_type === 'product')` and THREW when
// compatible_entities was undefined; that throw is deliberately removed here and
// the value is recorded rather than dropped (the old `hasProduct` was dead code).
let has_product = null;
try {
  const entities = $('disallowed-entity-gate').first().json.compatible_entities;
  has_product = Array.isArray(entities)
    ? entities.some(e => e && e.entity_type === 'product')
    : null;
} catch (e) {
  has_product = null;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const score = (t) => {
  const n = Number(t && t.similarity);
  return Number.isFinite(n) ? n : -Infinity;
};
const label = (t) => String((t && t.name) ?? '');
const sorted = raw_tools
  .slice()
  .sort((a, b) => cmp(score(b), score(a)) || cmp(label(a), label(b)));

const best = sorted[0];
// 0 tools in → 0 items out. Preserves today's behaviour exactly (the old splitOut
// emitted 0 items on an empty tools[] and the loop body never ran). Pre-existing
// dead-end, backlog in UAC §TL-EMPTY — deliberately NOT turned into a throw here.
if (!best) return [];

return [
  {
    json: {
      ...best,
      _tool_pick: {
        chosen: label(best),
        rejected: sorted.slice(1).map(t => ({ name: label(t), similarity: score(t) })),
        count: raw_tools.length,
        has_product,
      },
    },
  },
];
```

### 2.3 Intent, decision by decision

| plan ref | requirement | how it is met |
|---|---|---|
| §3.4 | output must be a **flat** `{name, similarity, …}` item, never `{tools:[…]}` | `{...best, _tool_pick}`. `.name` is top level, so `Call 'sub-get-results'`'s `={{ $json.name }}` resolves |
| §4 / D2 | arity enforced by CODE, not by the embedding index | `return [ { json: … } ]` is a one-element literal, in Run-Once-For-All-Items mode. Emits 1 item for any input size |
| **D9** | explicit sort, `similarity` DESC then `name` ASC — **not** the first element | `.sort((a,b) => cmp(score(b),score(a)) \|\| cmp(label(a),label(b)))`. Uses a `cmp` helper rather than subtraction so `-Infinity − -Infinity = NaN` can never make the comparator non-deterministic; `localeCompare` avoided for the same reason (locale-dependent) |
| §3.6 / RR3 | summed `similarity` makes "best" ill-defined | non-numeric / missing `similarity` scores as `-Infinity` ⇒ a malformed entry can never win; equal scores fall to the `name` tiebreak ⇒ deterministic for golden-master |
| **D8** | one namespaced diagnostic `_tool_pick` | `{chosen, rejected[], count, has_product}` — see §2.4 for the 4th key. Dies at `Call 'sub-get-results'` (explicit `workflowInputs` mapping forwards only `tool`/`contact_id`/`user_prompt`/`entities`/`semantic_input`) ⇒ cannot reach any session write. Contrast crossdomain F2 |
| **D11 / §3.10** | preserve today's 0-tools behaviour byte-for-byte | `if (!best) return [];` — 0 items out, exactly as `Split Out1` emitted 0 items. The pre-existing silent dead-end is **preserved, not fixed** |
| **D10 / §3.7 / RR5** | replace the dead code but keep a tolerant `compatible_entities` read | read kept, wrapped in `try` + `Array.isArray`. **The old body's implicit throw on `undefined` is removed** — that is a deliberate widening, called out here rather than left silent |
| **D7** | no similarity floor | none added. Working tools score as low as 0.3443 (live exec `11060071`) |

### 2.4 ⚠️ Deviation to review: `_tool_pick` carries a 4th key

Plan D8 and UAC §TL-1 name `_tool_pick` as `{chosen, rejected[], count}`. The deployed object adds
**`has_product`**. Reason: D10 requires the `compatible_entities` read to stay, and a read whose value is
discarded is exactly the dead code D10 exists to remove — so the value is recorded. All three named keys
are present and unchanged in meaning, so §TL-1's assertion still holds as written. **Say the word and I
will drop the key** — it is a one-leaf edit.

### 2.5 Pre-deploy verification of this body (offline, no execution)

`node --check` on the body wrapped as n8n wraps it: OK. No trailing whitespace on any line (LESSONS §58b).
A 10-case offline harness stubbing `$('…')` — all PASS:

| case | result |
|---|---|
| 1 tool (`crm_incoming_stock_list@0.3443`, mirrors live exec `11060071`) | 1 item, `_tool_pick.rejected == []`, `count 1` |
| **3 tools A@0.9 / B@0.8 / C@0.95 (= §TL-FP3)** | **exactly 1 item, and it is `C`** — first-element would have been `A`, so the sort is real |
| 2-tool inventory pair `stock_balance@0.5106` + `warehouses@0.4410` (the real pre-deletion pair) | 1 item, `crm_inventory_stock_balance_list`, `warehouses` in `rejected[]` |
| `tools: []` and `tools: undefined` | `[]` (0 items) — §TL-EMPTY equivalence |
| `compatible_entities` undefined / the read throws | no throw, `has_product: null` |
| equal similarity `zzz` vs `aaa` | `aaa` — name tiebreak deterministic |
| non-numeric similarity vs 0.1 | the numeric one wins |
| both similarities missing | `name` ASC, deterministic |

This is offline logic only. It does **not** substitute for §TL executions — that is the tester's job.

---

## 3. Node `build-suggest-offer` — COMMENT-ONLY

`n8n-nodes-base.code` v2, id `7972abd8-…` (shared with live). 415 → 417 lines.

| | sha256(jsCode) | chars |
|---|---|---|
| before | `b6047c37407d675b91a41bb816cfb40e1f86bdbe009969ecfb5b29cc72e9750e` | 23873 |
| after | `40df90a313bb273505882c051178a6d4cd509837fe4202020e0a2435f8635310` | 24051 |

Lines ~295–296 **before**:

```js
// Multi-tool queries run get-results MORE THAN ONCE; scan EVERY run, take the first
// non-empty alternatives set. Gate on alternatives != null (never invent).
```

**after**:

```js
// get-results now runs EXACTLY ONCE per turn (tool-loop-removal, 2026-08-03: one tool
// per turn; the per-tool splitOut + splitInBatches fan-out is deleted). The run scan
// below is retained UNCHANGED and self-terminates at run 0 via its own catch -> break,
// so this edit is comment-only. Gate on alternatives != null (never invent).
```

**No logic change** (plan §3.8 part 1): `node.all(0,0)` returns run 0; `node.all(0,1)` throws or returns
empty ⇒ the existing `catch → break` / `if (!items || !items.length) break` degrades the scan to "read run
0" unedited, and `node.isExecuted` is still true.

Proven mechanically, not by eye: stripping every `//`-only line from the before and after bodies yields
**identical** text. The `for (let ri = 0; ri < 25; ri++) {`, `try { items = node.all(0, ri); } catch (e) {
break; }` and `if (!alts) return out;` lines are byte-identical.

Behaviour deliberately **lost** (plan RR2, recorded not fixed): the cross-run fallback where tool 1
returned no `alternatives` but tool 2 did. On the only multi-tool domain, tool 2 was
`crm_inventory_warehouses_list`, so its `alternatives` would have been warehouse-shaped strings shown to
the customer as product did-you-mean suggestions. Removing the loop closes that latent mis-suggestion
hole.

---

## 4. Node `crossdomain-probe` — `executeOnce` removed (plan §9 Amendment A)

Node-level property, not a parameter:

```
before:  "executeOnce": true
after:   (key absent)
```

`parameters` byte-unchanged, including `workflowId.value = rysSPgUssLDf6xJc` (out of scope — see §5).
With the loop gone the flag is dead: n8n's `executeOnce` truncates input *within* a run
(`input.slice(0,1)`), it never suppressed the additional *runs* that the loop produced. Removed for
hygiene, and explicitly **not** recorded as the fix for the double probe — the fix is the loop's absence.

**`crossdomain-gate` was NOT given a `$runIndex` gate**, per the plan's explicit prohibition: post-removal
it could never go false, i.e. a condition that cannot fail on the node deciding whether the probe runs, and
it would introduce the spine's only `$runIndex` dependency. Asserted: **zero `$runIndex` anywhere in the
workflow.**

Crossdomain chain otherwise intact and byte-unchanged:
`validator → crossdomain-zeroset → crossdomain-gate → {0: crossdomain-probe → crossdomain-render | 1: —}
→ If6`. Its locked behaviours are untouched by this diff (no edit to `crossdomain-render` /
`crossdomain-compose`): bullets-not-numbers, uncapped, positive-facts-only, `last_result_set` /
`selection_context` untouched, single frozen `PHRASE` const to both sinks.

---

## 5. Explicitly NOT touched

- **Every `workflowId` left exactly as found.** `Call 'sub-get-results'`, `probe-incoming`,
  `sibling-probe`, `crossdomain-probe` all still `rysSPgUssLDf6xJc` (`sub-get-results TEST`).
  Plan §6/**P0**/UAC §TL-S4: live has the same repointing on `Call 'sub-get-results'` and
  `probe-incoming`. **Record, do not fix, do not bundle.** The reviewer will see it in the promote diff;
  it is pre-existing and stays.
- No live edit. No promote. No UAC execution.
- No `is_test` leaf added or copied. Census unchanged at the same 11 nodes.
- `Aggregate1` parameters, `Execute 'sub-get-rag'` `limit`, `Call 'sub-get-results'` `tool` expression,
  `Loop Over Items1`, all send/HTTP/postgres/redis nodes: unchanged.

---

## 6. Why there were two PUTs

PUT #1 (`37909936`) carried the whole diff and passed every structural gate but one: my own new comments
contained the literal strings `Split Out1`, `Loop Over Items` and `tools[0]`. Those are the exact strings
§TL-S1/§TL-S2 grep for, so the deployed artifact would have produced a hit in a comment and cost the tester
a cycle. PUT #2 (`cb4dffdb`) reworded the comments to `splitOut + splitInBatches` / "the first array
element". Verified before sending that the round-2 body differed from the already-verified artifact in
**`tool-filter`'s `jsCode` only**, with connections byte-identical and 138 nodes. Deployed bytes ==
sent bytes for both PUTs.

---

## 7. Post-deploy verification, read back from the deployed graph

Fresh REST GET of `cb4dffdb`. Compared population stated so empty output can never read as PASS
(LESSONS §61b): **138 nodes, 176 edges.** All PASS.

**§TL-S1 (structural, blocking)** — 1 no `Split Out1`; 2 no `Loop Over Items`; 3 `Loop Over Items1` still
exists; 4 **`If6.main[1]` has exactly one target and it is `Aggregate1[0]`**; 5a `Aggregate1` inbound ==
`{If6[1]}` exactly; 5b `not-found-error-message` inbound == `{Aggregate1[0], If-incoming-picker[1]}`
exactly. Plus: `tool-filter[0]` has exactly one target (`replay-get-results`); `If6[0] →
central-exchange` and `Aggregate1[0] → not-found-error-message` unchanged; no `connections` key for either
deleted node; **zero occurrences of either deleted node's name anywhere in any node's parameters,
including prose comments**; zero dangling edge endpoints; **the set of zero-inbound nodes is IDENTICAL to
pre-change** (no node newly starved, no node newly fed).

**§TL-S2 (code, blocking)** — single-element `return [{ json: … }]` present; no `{ tools: … }` envelope;
explicit sort present; literal `tools[0]` absent; `if (!best) return [];` present; no `mode` param (⇒ Run
Once for All Items); `sub-get-rag` `limit` still 5; `Aggregate1.fieldsToAggregate` unchanged;
`Call 'sub-get-results'` `tool` expression unchanged; `is_test` census unchanged.

**§TL-S3 (egress containment, from deployed JSON not memory)** — `send-message-files`, `-images`,
`-video`, `update-human-intervened`, `save-session-vars` all exist with **0 inbound**;
`Call 'sub-respond-save-message-redis'2 → tWm5DYLxfypmVC1T`; exactly **8** sendmsg callers →
`ublq9nSlrpz63xan`, all passing `is_test: true`; human-intervention → fork `vUfFUDjLAuMaeQE6`.

**Credentials re-verified after both PUTs (LESSONS §55)** — **28/28 preserved verbatim**, byte-identical
to the pre-change census. The 3 postgres nodes (`log-incoming-chat-history-n8ntest`, `pg-get-session`,
`pg-upsert-session`) are all on `n8n_test-db` / `Dnnofg8Xb27VQOhI`; **no node references any prod DB
credential.** `settings` merged as documented (`availableInMCP` + `binaryMode` survived omission).

**Publish state** — `versionId == activeVersionId == cb4dffdb-…`, draft-vs-active parameter diff empty,
connections draft == active. Nothing stale is waiting to ship (LESSONS §24).

### 7.1 The gate was shown to go RED (LESSONS §61 / memory `green-that-cannot-fail`)

The structural checker was run against two synthetic mutations of the deployed JSON — no workflow write,
no publish:

| mutation | S1.4 | S1.5a | S1.5b |
|---|---|---|---|
| deployed (control) | PASS | PASS | PASS |
| **`If6.main[1] = []`** (the §TL-FP1 catastrophe) | **FAIL** | **FAIL** | PASS |
| `If6.main[1] → not-found-error-message` (D5 bypass) | **FAIL** | **FAIL** | **FAIL** |

So the assertion that catches the dead-end can fail. This is a *static* negative control; it does **not**
discharge §TL-FP1, which requires the mutation to be published and §TL-M1/M2 re-run to prove the
**runData** assertions catch it while the execution reports `status: success`. Tester's job.

---

## 8. What the tester still has to establish (I ran no executions)

Believed satisfied by construction, each needing an execution to become evidence: §TL-S1, §TL-S2, §TL-S3
(all three re-derivable statically from the deployed JSON — done above); §TL-1…§TL-7 arity + flat-item +
`_tool_pick`; §TL-M1…§TL-M7 via edge A2; §TL-AGG (1-element `response_intro`, `pairedItem` divergence
expected); §TL-M-BYTE; §TL-D2 / §TL-R6 (the D2 multi-run consumer — highest regression value);
§TL-EMPTY (`[]` on empty preserved); §TL-SUM (sort is explicit); §TL-FP3 (offline-proven above, needs the
pin run); §TL-R12 (sendmsg arity); §TL-X-T3 (`crossdomain-probe` exactly 1 run) and §TL-X-T4
(`crossdomain-zeroset` exactly 1 run).

Cannot be self-checked at all without executions: everything asserting a rendered `user_response`, any
`pairedItem` claim, §TL-D2's "no node error", §TL-CLR/§TL-RS/§TL-ATT/§TL-CONT/§TL-DYM,
§TL-ACC-noaccess, and §TL-FP1/§TL-FP2 (both need a published mutation). §TL-ACC-partial stays **BLOCKED**
on P-CONTACT.

---

## 9. Two corrections for whoever builds the promote target

### 9.1 🚩 The plan's clone node-id for `tool-filter` is wrong (harmless here, would abort a promote)

Plan §5 states "`tool-filter` live `5c40413a` / clone `5c40413a`". Measured:

| node | live id | clone id |
|---|---|---|
| `tool-filter` | `5c40413a-6053-4b30-9f63-39357b20aec4` | **`e1d1d545-5a3f-4c14-ac2c-b757673c1f41`** |
| `build-suggest-offer` | `7972abd8-5d6b-40ff-9d38-152782cd8091` | `7972abd8-…` (same — LESSONS §58c is right) |
| `Split Out1` | `c0ad8c5f-…` | `8d1ded21-…` |
| `Loop Over Items` | `d6cfb265-…` | `86e2c25a-…` |
| `Aggregate1` | `4f2068b9-…` | `a4448717-…` |
| `If6` | `91c0e341-…` | `e2a60cb8-…` |
| `not-found-error-message` | `b5f79139-…` | `5fabfbe3-…` |

No impact on this build — everything was targeted **by name**, as the plan itself instructs. Flagged
because a promote that trusted the table would abort on a clone-id mismatch (exactly the LESSONS §58c
abort).

### 9.2 🚩 `build-suggest-offer` was already NOT byte-identical live ↔ clone, before my edit

`diff live ↔ clone-pre-change` = **5 lines, all cosmetic**: two `── … ──` comment rules are padded to
different lengths, and live carries one extra trailing blank line (live 416 lines, clone 415). With all
`//` lines stripped and the body trimmed, **live code == clone-pre code == clone-post code** — so the
executable content is identical and my edit is comment-only against either baseline.

Consequence for the promote (LESSONS §57): build live's new `build-suggest-offer` as
**LIVE's 416-line body + the 2-line comment replacement**, NOT by copying the clone's body — copying it
would silently also ship the two comment-rule reflows and drop live's trailing blank line, i.e. rider
bytes in a node nobody intended to reformat. `tool-filter`, by contrast, **is** byte-identical live ↔
clone-pre (verified today), so its promote hunk is a clean whole-body replacement — but re-verify at
promote time rather than trusting this line (memory `stale-byte-identical-fork-claim`).

---

**P-BASE warning:** UAC §TL marks the pre-change baseline capture (a 1-tool miss turn's `Aggregate1`
output and full `user_response` on the clone) as **blocking and to be taken BEFORE the edit**. It was not
taken — the clone is already on the post-change build. The live reference values in §TL stand in
(exec `11060071` → `{response_intro:["No matching results found."]}`; exec `11049139` → the 2-element
version), and the pre-change clone artifact is recoverable by publishing `6d479172` on the clone, running
the baseline turns, and re-publishing `cb4dffdb`. Flagging rather than papering over: §TL-AGG and
§TL-M-BYTE are weaker until that is done. Also note P-CLONE — discard the first turn after any publish.
