# PLAN — `tool-loop-removal`: delete the per-tool loop from the spine

**Status: PLAN (planner deliverable). Docs only — no workflow edited, no execution run.**
Date 2026-08-03. Scope tag: **`deterministic`** (plan §8 names "RAG selection" in this tier explicitly).
Build target: clone **`txiPzSxy3Pclsz6v`**. Live spine `9qVyfUxmRQqrpGRMDLRuz` @ `a40cd16d` — NEVER edited
during build. UAC section: **§TL** in `tests/UAC.md`.

Companion docs: `plans/evidence-rag-tool-fanout-20260803.md` (empirical basis),
`tests/reviews/cross-domain-stock-incoming.md` (F3/F4 — the motivation),
`tests/crossdomain-manual-test-script.md` (R1–R10, extended here).

---

## 0. BLAST RADIUS — read this before anything else

This is a **LIVE SPINE change on the single code path every answered turn and every miss turn takes.**
`If3 out1 → Execute 'sub-get-rag' → tool-filter → …` is the entry to get-results for **all 7 domains**
(`inventory`, `incoming`, `product_attachment`, `order`, `promotion`, `master_products`, `portal_link`).
There is no domain-scoped gate, no feature flag, and no partial rollout. The diff removes two nodes and
rewires the **join that carries every not-found turn into the miss templates**.

Failure modes if it is wrong:
- **`If6 out1` left unwired ⇒ every not-found turn dead-ends.** The customer gets *nothing* (no
  "Could not find…", no escalate offer), and — per memory `unwired-error-output-masks-failure` — **the
  execution still reports `status: success`**. `search_executions status:["error"]` will show zero. This is
  the single highest-risk outcome of the change and §TL's assertions are built around detecting it.
- **`tool-filter` emitting >1 item ⇒ the whole downstream runs once per item**, including
  `sorento-sub-respond-sendmsg-respond2` — i.e. **two WhatsApp messages to one customer**. Today the loop
  serialises the fan-out; with the loop gone nothing does. See §4.

Nothing about this change is urgent. It removes dead machinery. If any gate in §8 is amber, do not promote.

---

## 1. Decision table

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Remove the loop at all? | **YES** | One tool per domain is now the intended design (user, 2026-08-03). The loop is dead on every turn, and it is what makes crossdomain F3 (probe per tool) and F4 (per-tool `returnedCodes` vs per-turn `missing`) *possible*. Removing it makes both impossible by construction, not dormant-by-data. |
| D2 | Where is "exactly one tool" enforced? | **In `tool-filter`, which returns exactly one ITEM.** Not in the embedding index. | See §4. The index is mutable outside n8n; code is not. |
| D3 | Delete `Split Out1`? | **YES** | Its only purpose is fanning `tools[]` into N items. With `tool-filter` emitting one flat item there is nothing to split. |
| D4 | Delete `Loop Over Items`? | **YES** | 5 edges, 2 nodes. Its `out0` role is taken over by wiring `If6 out1 → Aggregate1`. |
| D5 | Delete `Aggregate1` too, and wire `If6 out1 → not-found-error-message`? | **NO — REJECTED.** | `Aggregate1` is not decorative: it **narrows the payload**. See §3.3. Bypassing it pushes the full validator envelope (`answers`, `has_result`, `alternatives`, `relaxed_axis`, `is_valid`, `response`) into a chain whose next two nodes both pass their whole input through (`escalate-catalog`: `const out = $input.first().json; … return out;`; `build-suggest-offer`: `const out = {...$input.first().json}`). Unnecessary risk in a 415-line node for zero gain. |
| D6 | `limit: 5 → 1` on `Execute 'sub-get-rag'` as defence in depth? | **NO — REJECTED.** | It is a *second, competing* enforcement point that can **disagree** with D2 (§3.6: `sub-get-rag` SUMS similarity across `source_id`s, so top-1-by-row and top-1-by-summed-similarity are not the same selection). Two enforcement points that can differ is worse than one that cannot. Keeping `limit:5` also preserves the diagnostic: `tool-filter` can record the rejected candidates, which is how a future registry change becomes *visible* instead of silent. |
| D7 | Add a similarity floor to `tool-filter`? | **NO — REJECTED, evidence-backed.** | Working tools score as low as **0.3443** (live exec `11060071`, `crm_incoming_stock_list` — the *correct* tool for that incoming turn). Any floor above that removes correct tools. There is no separation between "good tool" and "mis-ranked tool" in the similarity range (0.34–0.51 overlaps completely). |
| D8 | Emit a diagnostic of the rejected candidates? | **YES** — one namespaced key `_tool_pick` on `tool-filter`'s single output item. | Makes D2 observable and makes a registry regrowth detectable from runData. **Verified safe:** the key dies at `Call 'sub-get-results'` (an `executeWorkflow` node with explicit `workflowInputs` mapping — it forwards only `tool`/`contact_id`/`user_prompt`/`entities`/`semantic_input`). It cannot reach `save-session-vars`. Contrast crossdomain **F2**, where `_xdApplied` sat on the item feeding live's `JSON.stringify($json)` PUT. |
| D9 | Sort explicitly, or trust `tools[0]`? | **SORT EXPLICITLY** — `similarity` DESC, tiebreak `name` ASC. | `sub-get-rag`'s final Code node builds `Object.values(map)` in SQL `ORDER BY distance ASC` insertion order **but then sums similarity per collapsed name** — so `tools[0]` is *not* guaranteed to be the max-similarity element (§3.6). A naive `tools[0]` would be usually-right and occasionally-wrong with nothing to catch it. The `name` tiebreak is required for golden-master determinism. |
| D10 | Keep the dead `hasProduct` code in `tool-filter`? | **NO** — replace the body. | Its own comment describes logic it never applied. But keep a tolerant `compatible_entities` read (§3.7) — deleting the read silently removes a throw. |
| D11 | Also fix the "0 tools ⇒ silent dead-end" hole? | **NO — out of scope, recorded as backlog.** | New `tool-filter` must return `[]` on empty, preserving today's behaviour byte-for-byte. Turning it into a loud throw is a separate, arguable change on an untestable path. §TL-EMPTY establishes what today does. |
| D12 | Sequencing vs `cross-domain-stock-incoming`? | **Loop removal FIRST, as its own promote** — user's stated intent CONFIRMED, with two amendments. | §9. |
| D13 | Tier | **`deterministic`** | Code / SplitOut / SplitInBatches / connections only. No parser edit, no LLM node added, no new credentialed node. plan §8's `deterministic` row names "RAG selection" verbatim. |

---

## 2. Current topology — VERIFIED, and the plan's premise CORRECTED

Verified 2026-08-03 against **live `9qVyfUxmRQqrpGRMDLRuz`** via MCP `get_workflow_details`:
`versionId == activeVersionId == a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z`,
101 nodes, **draft-vs-active parameter diff = EMPTY** (LESSONS §23/§24 pre-check already clean today).
Clone `txiPzSxy3Pclsz6v` @ `versionId == activeVersionId == 6d479172-50e4-4be3-9e88-895a86b2701b`,
140 nodes, draft==active. Clone−live node-set delta = 40 harness nodes added, `Schedule Trigger` removed.

### 2.1 LIVE (production) — the change request's diagram was clone-shaped

```
Execute 'sub-get-rag'  →  tool-filter  →  Split Out1  →  Loop Over Items
   Loop Over Items [out0]  (done / tools exhausted) → Aggregate1 → not-found-error-message   ← THE MISS PATH
   Loop Over Items [out1]  (loop)                   → Call 'sub-get-results' → validator → If6
   If6 [out0] (has result) → central-exchange → compile-current-state → {save-session-vars, sendmsg2}
   If6 [out1] (no result)  → Loop Over Items                                                ← back-edge
```

🚩 **Premise correction:** the change request's topology shows
`out1 → replay-get-results → … → Call 'sub-get-results'`. **`replay-get-results` and `fixture-get-results`
do not exist on live** — they are clone-only harness nodes. On live the loop wires **straight into
`Call 'sub-get-results'`**. The live edge diff is therefore one edge shorter than the clone's.

### 2.2 CLONE (build target)

Identical except `Loop Over Items [out1] → replay-get-results`, whose `out0` (mode `regress-replay`) goes to
`fixture-get-results → validator` and `out1` to `Call 'sub-get-results' → validator`; and `validator` feeds
`crossdomain-zeroset → crossdomain-gate → {TRUE: probe → render | FALSE: —} → If6`.

### 2.3 `not-found-error-message` already has TWO feeders on live

```
Aggregate1 [out0]           → not-found-error-message [in0]
If-incoming-picker [out1]   → not-found-error-message [in0]
```
This matters: the node already tolerates two different input shapes, which is why its input contract is
loose (§3.3). It is **not** exclusive to the loop.

---

## 3. The interrogation — each question the change request raised, resolved

### 3.1 Q3 — is there any other consumer of `Loop Over Items`? Is `Loop Over Items1` related?

**No, and no.** `Loop Over Items` has exactly **2 inbound** (`Split Out1`, `If6 out1`) and **2 outbound**
(`Aggregate1`, and `Call 'sub-get-results'` on live / `replay-get-results` on the clone). Complete.

`Loop Over Items1` is **unrelated** — it is on the media/attachment egress path:
`get-presigned-url → Loop Over Items1 → Switch → send-message-{images,video,files}`, with
`send-message-* [out0]` and `sorento-sub-respond-sendmsg-respond4 [out0/out1]` looping back into it.
Different node, different subgraph, untouched. Confirmed on both live and clone.

### 3.2 Q2 — does anything read `$('Split Out1')` / `$('Loop Over Items')` / `$('Aggregate1')` BY NAME?

**NO. Zero by-name references on either workflow.** Established by parsing every node's `parameters` and
extracting every `$('…')` / `$("…")` reference:

| referenced node | referenced by (LIVE) | referenced by (CLONE) |
|---|---|---|
| `Split Out1` | — | — |
| `Loop Over Items` | — | — |
| `Aggregate1` | — | — |
| `tool-filter` | — | — |
| `replay-get-results` / `fixture-get-results` | n/a | — |

Also checked: **zero `$runIndex` anywhere** on live or clone; **zero `pairedItem` / `itemMatching` /
`$items(` reads** on live. (Full dangling-reference audit came back clean: every `$('…')` name on live
resolves to an existing node.) This is what cost a cycle on the crossdomain feature; here it is clean.

### 3.3 Q1 — what does `Aggregate1` actually aggregate, and is a single item byte-identical today?

`Aggregate1` = `n8n-nodes-base.aggregate` v1, `fieldsToAggregate: [{ fieldToAggregate: "response_intro" }]`,
no options. The reviewer's note was right.

**`response_intro` has ZERO downstream consumers on live and on the clone.** The only two nodes whose
parameters even contain the string are `Aggregate1` itself and a comment in `validator`. So the aggregated
array is never read — and **the array's length changing from 2 to 1 on inventory turns is inert.** That
removes the largest equivalence risk outright.

`Aggregate1`'s real functions are (a) collapse N items → 1, and (b) **narrow the payload**: the validator
envelope goes in, `{response_intro: [...]}` comes out. `not-found-error-message` then does
`const out = $input.first().json; out.escalate_message = …; out.is_clarification = …;
out.found_summary = …; return out;` — so `out` today is `{response_intro:[…], escalate_message,
is_clarification, found_summary}` and nothing else. That is D5's reason.

**EMPIRICALLY PROVEN, both arities, from real live runData:**

| evidence | live exec | what it shows |
|---|---|---|
| 2-tool inventory miss | **`11049139`** @ 08:57:59Z (contact 438930735) | `tool-filter` → 1 item `{tools:[stock_balance@0.4733, warehouses@0.4015]}`; `Split Out1` → 2 items; `Loop Over Items` runs 0,1,2 — run 2 emits **out0 = the 2 accumulated validator items**; `Aggregate1` out = `{response_intro:["No matching results found.","No matching results found."]}`, `pairedItem:[{item:0},{item:1}]` |
| **1-tool incoming miss** | **`11060071`** @ 11:02:46Z (contact 477071886) | `tool-filter` → `{tools:[crm_incoming_stock_list@0.3443]}`; `Split Out1` → 1 item; `Loop Over Items` run 0 out1=[tool], **run 1 out0 = exactly ONE validator item**; `contextData["node:Loop Over Items"].processedItems` = that one item, `noItemsLeft:true, done:true` |

The `contextData` block settles n8n's `splitInBatches` v3 "done" semantics without relying on documentation:
**`out0` emits the items fed back around the loop** (`processedItems`), not the original input.

**Therefore:** on the 7 single-tool domains, `Aggregate1` receives **exactly one validator item today**, and
`If6 out1 → Aggregate1` delivers **that same single item**. Its output is byte-identical. The only
difference is `pairedItem`: the loop stamps
`{sourceOverwrite:{previousNode:'If6', previousNodeOutput:1, previousNodeRun:0}, item:0}` where direct
wiring gives `{item:0}`. `Aggregate` normalises `pairedItem` into its own array form, and **nothing
downstream reads `pairedItem`** (§3.2) — inert. §TL-AGG asserts the aggregate output equality directly
rather than assuming this.

### 3.4 Q2 (part 2) — does the loop's batching change the payload `replay-get-results` sees?

No. `Split Out1`'s output item is `{name, similarity}` (proven in both execs above), and `Loop Over Items`
`out1` passes it through unchanged apart from `pairedItem`. `replay-get-results` is an **If on
`$('redis-pop-main-message-list').first().json.message.mode === 'regress-replay'`** — it reads nothing from
`$json` and passes items through. `Call 'sub-get-results'` reads the tool as **`tool: "={{ $json.name }}"`**.

⇒ **The hard interface requirement:** the new `tool-filter` must emit a **flat `{name, similarity, …}`
item**, NOT `{tools:[…]}`. Emitting the old shape produces `tool: undefined` — and `Call 'sub-get-results'`
has `alwaysOutputData:true` + `onError:continueErrorOutput`, so it would emit `{}` on `main[0]`, flow into
`validator`, and produce a **confidently wrong customer reply with the execution green** — exactly LESSONS
§61(a), measured before on clone `get-access-types` exec `9523682`. §TL-1 asserts the resolved `tool`
string, never the execution status.

### 3.5 Q4 — `$runIndex` / `isExecuted` dependencies

- **`$runIndex`: zero uses** on live and clone. Nothing to break.
- **`isExecuted`** appears in 10 live nodes. `isExecuted` is a boolean "did this node run at all" — it does
  not count runs, so reducing N runs to 1 cannot flip any of them. Node-by-node: `compile-current-state`
  (`escalate-catalog`, `build-cs-member-offer`, `build-suggest-offer`, `build-ideate-reply`,
  `central-exchange`, `validator`, `disallowed-entity-gate`, `access-level-choice-message`) — all still run
  exactly as before on their branches; `Call 'sub-respond-save-message-redis'2` (`tf-message`,
  `get-session-vars`, reformulator, `compile-current-state`) — upstream of this subgraph; `Call
  'sub-get-results'` / `probe-incoming` / `sibling-probe` (`$('Aggregate').isExecuted`) — the access-levels
  aggregate, unrelated; `validator` (`Edit Fields2`); `escalate-catalog`
  (`not-found-error-message`.isExecuted); `build-suggest-offer` (`sibling-transform`, `sibling-probe`);
  `sibling-gate`. **None is run-count sensitive.**
- `compile-current-state`'s `getResultObj()` does `$('validator').first().json` — `.first()` pins run 0
  today and run 0 remains the only run. Same value.
- On the clone, `crossdomain-compose` gates on `crossdomain-render.isExecuted` — unchanged semantics.

### 3.6 🚩 NEW FINDING — `sub-get-rag`'s `similarity` is a SUM, so `tools[0]` is not provably the best

`sub-get-rag` (`tWP33QOFT7SxThfT`, `versionId == activeVersionId == ee95b1f3`, updated 2026-06-27), final
node `Code in JavaScript1`:

```js
for (const entry of input) {
  const raw = entry.json.source_id || '';
  const name = raw.split('::')[1] || raw;
  if (!map[name]) map[name] = { name, similarity: 0 };
  map[name].similarity += entry.json.similarity;   // ← SUMS across source_ids
}
const tools = Object.values(map);
```

The SQL is `DISTINCT ON (source_id) … ORDER BY distance ASC LIMIT $3` — one row per `source_id`, best-first.
But the Code node collapses `source_id → name`, so **two `source_id`s that map to the same tool name get
their similarities ADDED**. Consequences:

1. `similarity` is **not comparable across tools** with different chunk counts. A 2-chunk tool can outscore
   a genuinely better 1-chunk tool.
2. `Object.values(map)` preserves SQL (best-first) insertion order, but summation can make a
   later-inserted entry the maximum ⇒ **`tools[0]` is not guaranteed to be the max-similarity element.**

This is why D9 mandates an explicit sort, and why D6 rejects `limit:1` (which selects the best *row*, a
different rule from the best *summed name*). Today every observed tool has one `source_id` so the two rules
coincide — which is precisely the `green-that-cannot-fail` shape: correct by data, untested, silently
divergent the day a tool gains a second chunk. **§TL-SUM records it and asserts the sort is real.**

No similarity floor is defensible either — see D7.

### 3.7 `tool-filter` today, and what removing its dead code changes

```js
// pick incoming tool by scope: product present → by_product; else → shipments (date/general)
const entities = $('disallowed-entity-gate').first().json.compatible_entities
const hasProduct = entities.some(e => e.entity_type === 'product');
var raw_tools = $("Execute 'sub-get-rag'").first().json.tools;
return { "tools": raw_tools }
```
Byte-identical on live and clone. `hasProduct` is computed and discarded — the comment describes logic that
was never applied.

⚠️ **`entities.some(...)` can THROW** if `compatible_entities` is undefined. Deleting the read therefore
silently **widens** behaviour (a turn that used to error would now proceed). `disallowed-entity-gate` always
runs before `If3`, so this should be unreachable — but "should be" is how holes are kept. Keep a tolerant
read so the diff is not silently a widening, and let §TL-EMPTY/§TL-FP2 cover the branch.

### 3.8 🚩🚩 THE ONE PLACE THE LOOP *IS* LOAD-BEARING — not identified in the change request

`build-suggest-offer` (live `7972abd8`, 415 lines) **explicitly iterates the loop's runs**, lines ~294–309:

```js
// ── D2: data-miss "alternatives" (domain tool alternatives[] + relaxed_axis) ────
// Multi-tool queries run get-results MORE THAN ONCE; scan EVERY run, take the first
// non-empty alternatives set. Gate on alternatives != null (never invent).
let alts = null, axis = 'entity';
try {
  const node = $('Call \'sub-get-results\'');
  if (node.isExecuted) {
    for (let ri = 0; ri < 25; ri++) {
      let items;
      try { items = node.all(0, ri); } catch (e) { break; }
      if (!items || !items.length) break;
      const hit = items.find(it => it && it.json && Array.isArray(it.json.alternatives) && it.json.alternatives.length);
      if (hit) { alts = hit.json.alternatives; axis = hit.json.relaxed_axis || 'entity'; break; }
    }
  }
} catch (e) { alts = null; }
if (!alts) return out;   // no alternatives on any run → keep existing "escalate?" behaviour
```

This is the **D2 did-you-mean source** — the `Try:` / numbered-alternatives arm. It is a deliberate,
commented multi-run consumer, and it is the only one (`.all(` appears in exactly two live nodes; the other,
`build-cs-member-offer`'s `$('get-cs-members').all()`, reads a single-run HTTP node).

**Assessment — three parts, all needed:**

1. **No code change is required.** After removal, `node.all(0,0)` returns run 0; `node.all(0,1)` either
   throws or returns empty ⇒ `break`. The loop degrades to "read run 0" correctly, unedited. `node.isExecuted`
   is still true.
2. **Behaviour that is LOST:** today, if tool 1 returned no `alternatives` but tool 2 did, D2 fires from
   tool 2. After the change it does not, and the turn falls through to escalate-only.
3. **That lost behaviour was WRONG.** The second tool on the only multi-tool domain was
   `crm_inventory_warehouses_list` — a warehouse lister. Any `alternatives` it produced would be
   **warehouse-shaped strings presented to the customer as product did-you-mean suggestions.** Removing the
   loop *closes* that latent mis-suggestion hole. In live exec `11049139` run 0 supplied
   `[CSS8802, CSS5800, CSS8814]` and run 1 supplied `[]`, so the observed turn is unaffected.

**Actions:** (a) `§TL-D2` must prove a D2 did-you-mean turn still renders after removal — this is the case
most likely to regress and the change request did not list it; (b) the coder must **update that stale
comment** in the same diff (a comment asserting multi-tool fan-out is how a future reader re-derives the
wrong model — cf. the stale `tool-filter` comment that hid dead code for months). Comment-only edit; note it
in the diff so the reviewer does not read it as a logic change.

### 3.9 Q6 — does the replay / regression path depend on the loop?

**No.** `fixture-get-results` is `return [{ json: (m.fixtures || {}).get_results }]` — it reads the fixture
from the redis item and is **tool-agnostic**; it never looks at `$json.name`. So on a 2-tool replay it
returned the *same* fixture twice, and the diff engine saw two runs of every node in the loop body. Removing
the loop makes replay strictly cleaner (one run per node). `replay-get-results` is a mode If, pass-through.

Caveat to record, not to fix: the replay harness is **already broken** (memory `replay-harness-stale-broken`
— it pushes to `main-message-list-test` while the clone pops `test:q:{contact}`, producing false
100%-regression reports). Do **not** accept a green replay report as evidence for this change. §TL's manual
regression set (§TL-R) is the regression pass.

### 3.10 Pre-existing hole recorded, not fixed (D11)

If `sub-get-rag` returns `tools: []`, `Split Out1` emits 0 items ⇒ the loop body never runs, the loop's
`out0` never fires, `Aggregate1` never runs ⇒ **the turn dead-ends silently with no reply and a green
execution.** The new `tool-filter` returning `[]` on empty preserves this exactly. §TL-EMPTY establishes the
current behaviour empirically so the equivalence claim is measured, not assumed. Fixing it (loud throw, or a
route to `not-found-error-message`) is a separate change on a path we cannot currently trigger on demand.

---

## 4. The 1-tool invariant becomes LOAD-BEARING — where it is enforced and why it cannot be bypassed

With the loop gone there is no serialisation. If the node feeding `Call 'sub-get-results'` ever emits 2
items, **the entire downstream — including `sorento-sub-respond-sendmsg-respond2` — runs twice.** On live
that is two WhatsApp messages to one customer.

**Enforcement point: `tool-filter` returns a single-element array, unconditionally.**

```
tools = (rag.tools ?? [])            // never assume presence
sorted = tools.slice().sort(similarity DESC, then name ASC)   // D9 — explicit, deterministic
best = sorted[0]
if (!best) return []                 // D11 — preserve today's empty-tools behaviour exactly
return [{ json: { ...best, _tool_pick: { chosen, rejected[], count } } }]   // D8 — exactly ONE item
```

**Why this cannot be bypassed — the property is structural, not data-dependent:**

- `return [{ json: … }]` is a **one-element literal**. It emits one item for *any* input, including a
  registry with 50 embeddings. n8n cannot fan out a single item.
- It is a Code node in "Run Once for All Items" mode, so it is not invoked per input item.
- It does not depend on the index containing exactly one tool. **That is the whole point of D2**: today the
  invariant is held by *data* — the embedding rows the user just deleted — which lives outside n8n and is
  mutable by a CRM registry re-seed. The `parser-config-registry-plan` explicitly intends to grow the tool
  registry. After this change the index may regrow freely; only the *selection* changes, never the arity.

**Contrast the situation until this ships:** the invariant is currently enforced **only** by the index. That
is why §TL-1 asserts item COUNT at `tool-filter`, not just the tool name, and why §TL-FP3 exists.

### 4.1 🚩 The premise is 20 minutes old and NOT yet confirmed on live

| observation | time | tools |
|---|---|---|
| LIVE exec `11059966`, inventory, real contact 477071886 | **2026-08-03T11:01:39Z** | **2** — `crm_inventory_stock_balance_list@0.5106` + `crm_inventory_warehouses_list@0.4410` |
| CLONE exec `11061831`, inventory, contact 437264483, sub-exec `11061838` in `tWP33QOFT7SxThfT` | **2026-08-03T11:23:22Z** | **1** — `crm_inventory_stock_balance_list@0.4812` |

The deletion landed between 11:01:39Z and 11:23:22Z. `sub-get-rag` is a **shared** sub over one
`embedding_chunks` table, so the clone's 1-tool read is strong evidence for live — but it is **inference,
not observation**. There has been no live inventory turn since the deletion (live's most recent execution at
plan time is `11060071` @ 11:02:46Z).

**Prerequisite P1 (§8): before promote, confirm on a LIVE inventory execution that `tool-filter` emitted
`tools.length === 1`.** This is a read-only `get_execution` on a naturally-occurring turn — no egress. It
matters because the *pre-change* graph's safety depends on the index, so a promote onto a still-2-tool index
would be the one moment where both enforcement mechanisms are absent.

---

## 5. Exact node / edge diff — BY NAME (never by id)

Node ids diverge between clone and live for several nodes; `setNodeParameter` and the connection ops key on
node **name**, which is unique (LESSONS §58c). For reference: `tool-filter` live `5c40413a` / clone
`5c40413a`; `Split Out1` live `c0ad8c5f`; `Loop Over Items` live `d6cfb265`; `Aggregate1` live `4f2068b9`;
`If6` live `91c0e341`. **Do not target these ids.**

### 5.1 CLONE (`txiPzSxy3Pclsz6v`) — the build. ONE `update_workflow` call, 10 ops, atomic (LESSONS §33)

| op | detail |
|---|---|
| 1 | `updateNodeParameters` **`tool-filter`** — replace `jsCode` per §4 (`replace:true` with the full parameters object, or `setNodeParameter` `path:"/jsCode"` — **relative to `parameters`, never `/parameters/jsCode`**, LESSONS §32b) |
| 2 | remove connection `tool-filter [main 0] → Split Out1 [0]` |
| 3 | remove connection `Split Out1 [main 0] → Loop Over Items [0]` |
| 4 | remove connection `Loop Over Items [main 1] → replay-get-results [0]` |
| 5 | remove connection `Loop Over Items [main 0] → Aggregate1 [0]` |
| 6 | remove connection `If6 [main 1] → Loop Over Items [0]` |
| 7 | **add connection `tool-filter [main 0] → replay-get-results [0]`** |
| 8 | **add connection `If6 [main 1] → Aggregate1 [0]`**  ← the miss-path join. Omitting this is the §0 catastrophe |
| 9 | remove node `Split Out1` |
| 10 | remove node `Loop Over Items` |

Plus, in the same call or a second one, the comment fix in **`build-suggest-offer`** (§3.8). Keep it a
separate op so the reviewer can see it is comment-only.

Then `publish_workflow` (MCP edits land on the DRAFT — LESSONS §37/publish-after-update).

### 5.2 LIVE (`9qVyfUxmRQqrpGRMDLRuz`) — the promote. Same, minus the harness hop

Ops 1–3, 5, 6, 8, 9, 10 identical, and instead of ops 4/7:

| op | detail |
|---|---|
| 4' | remove connection `Loop Over Items [main 1] → Call 'sub-get-results' [0]` |
| 7' | add connection **`tool-filter [main 0] → Call 'sub-get-results' [0]`** |

### 5.3 Resulting topology (both)

```
Execute 'sub-get-rag' → tool-filter → [replay-get-results →] Call 'sub-get-results' → validator
                                                                                        ↓
                        (clone: → crossdomain-zeroset → gate → {probe→render|} →)      If6
   If6 [out0] → central-exchange → …                             (unchanged)
   If6 [out1] → Aggregate1 → not-found-error-message → sibling-gate → …               (NEW EDGE)
```

`If-incoming-picker [out1] → not-found-error-message` unchanged. `Aggregate1` parameters unchanged.

### 5.4 What must NOT be touched

- `Aggregate1`'s `fieldsToAggregate` (D5).
- `Execute 'sub-get-rag'`'s `limit: 5` (D6).
- `Call 'sub-get-results'`'s `tool: {{ $json.name }}` — the whole design keeps this expression valid.
- `Call 'sub-get-results'`'s `workflowId` — see §6 P0. **Do not "correct" it in this diff.**
- Any `is_test` leaf, anywhere (LESSONS §48a).
- `Loop Over Items1` (§3.1).

---

## 6. 🚩🚩 P0 — UNRELATED LIVE FINDING, discovered while verifying this change. Report before promoting.

**LIVE production's main CRM read path calls the harness TEST fork of get-results.**

On live `9qVyfUxmRQqrpGRMDLRuz` — in **both** the draft and the published `activeVersion` `a40cd16d`:

| live node | `workflowId.value` | `cachedResultName` |
|---|---|---|
| `Call 'sub-get-results'` | **`rysSPgUssLDf6xJc`** | **`sub-get-results TEST`** |
| `probe-incoming` | **`rysSPgUssLDf6xJc`** | **`sub-get-results TEST`** |
| `sibling-probe` | `Fss5aAaXthJSWpZCgKiKR` | `sub-get-results` |

Corroboration (three independent sources): MCP `get_workflow_details` draft **and** `activeVersion` blocks
today; the REST backup `n8n-workflows-init/backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json`;
and the older `backups/spine-9qVyfUxmRQqrpGRMDLRuz-20260723.json` — so this has been live **since at least
2026-07-23**. The 2026-07-05-era backup (`live-spine-20260705-allmenu.json`) still shows
`Fss5aAaXthJSWpZCgKiKR`, which dates the drift.

`rysSPgUssLDf6xJc` is `active:true`, `versionId == activeVersionId == 356c1651`, **`updatedAt
2026-08-03T03:47:15Z` — today** — and is fully armed: both `MCP Client` and `MCP Client1` point at the real
`http://72.62.195.20:8765/mcp`. Node-parameter shas of the 2026-08-02 snapshots
(`fork-getresults-99703003` vs `live-getresults-e30963a3`) were **identical**, so the fork was a faithful
copy then; it has since been edited independently, and live `Fss5aAaXthJSWpZCgKiKR` moved separately at
2026-08-02T13:18Z (the alloc-badge Phase C promote, memory `alloc-badge-phase-c`).

**Why this matters, concretely:**
1. Every "harness-only" edit to `rysSPgUssLDf6xJc` is a **live production change** to the main read path.
   CLAUDE.md, the crossdomain review, and its promote checklist all treat it as clone-only.
2. The **alloc-badge Phase C promote onto `Fss5aAaXthJSWpZCgKiKR` is inert on production's main path** —
   only `sibling-probe` reaches it. The "PROMOTED LIVE DARK" memory note is, on this evidence, wrong about
   reach.
3. It is textbook LESSONS §48b (a harness fork's `workflowId` copied to live), and it is invisible on happy
   paths because the fork is a faithful copy.

**Handling — deliberately NOT part of this change (LESSONS §51: stage an unowned delta as its own publish):**
- Report to the user and let them decide whether production is *supposed* to call `rysSPgUssLDf6xJc`.
- Add to §8 as **P0**: the reviewer will see `rysSPgUssLDf6xJc` in the loop-removal `diff live ↔ target` and
  must **not** silently "fix" it. Bundling it would make a two-node graph change also a re-pointing of every
  production CRM read.
- Egress note: get-results is read-only (MCP read tools), so this is a correctness/governance defect, not a
  §0 breach. It does not block loop removal technically. It is bigger than loop removal.

---

## 7. Rollback

| artifact | value |
|---|---|
| live rollback target | `publish_workflow` `9qVyfUxmRQqrpGRMDLRuz` **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`** |
| live backup on disk (verify it still matches before promoting) | `n8n-workflows-init/backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json` |
| clone rollback target | `publish_workflow` `txiPzSxy3Pclsz6v` **`6d479172-50e4-4be3-9e88-895a86b2701b`** |
| clone backup on disk | take a fresh REST GET before the build — the newest on disk (`clone-…-043358ae-…-before.json`) predates the F1/F2 fixes |
| `tool-filter` original body (both) | archive verbatim to `tests/diffs/tool-loop-removal.tool-filter.before.js` before editing |

Rollback is a **pointer move**, so it is cheap and total. Note the asymmetry: re-adding `Split Out1` /
`Loop Over Items` by hand would generate new node ids and break golden-master diff keying (LESSONS §20) —
**always roll back by publishing the prior versionId, never by re-building the nodes.**

---

## 8. Promote checklist (user-gated — do NOT promote unprompted)

**Prerequisites (all must be green before any live write):**
- [ ] **P0** — §6 reported to the user and a decision recorded. Do not bundle it. The `diff live ↔ target`
      will show `rysSPgUssLDf6xJc`; that is pre-existing and stays.
- [ ] **P1** — a LIVE inventory execution *after* the embedding deletion shows `tool-filter` emitted
      `tools.length === 1` (§4.1). Read-only `get_execution`.
- [ ] **P2** — clone draft == active and live draft == active (LESSONS §24/§51). Live was clean at plan time
      (zero differing nodes); **re-run immediately before publish**, on the saved output:
      ```
      jq -r '(.workflow.nodes|map({key:.id,value:(.parameters|tojson)})|from_entries) as $d
           | (.workflow.activeVersion.nodes|map({key:.id,value:(.parameters|tojson)})|from_entries) as $a
           | [ ($d|keys)[] | select($a[.] != null and $d[.] != $a[.]) ] | join(",")' FILE
      ```
- [ ] **P3** — §TL fully green on the clone, **every case carrying its executionId**, and all three
      fail-on-purpose cases (§TL-FP1/FP2/FP3) demonstrated RED then reverted.
- [ ] **P4** — permission allow-rules present for `mcp__n8n-mcp__update_workflow` + `publish_workflow`
      (LESSONS §58a). **The assistant cannot self-grant — the USER adds them.** `sorento-coder` is barred
      from live; use the main agent or `general-purpose`.

**The promote:**
- [ ] Backup live: fresh REST GET → `backups/`, and record `activeVersionId a40cd16d`.
- [ ] Build the target as **LIVE + this change's own hunks** — never copy the clone's `tool-filter`
      wholesale (LESSONS §57; the clone's copy is byte-identical to live *today*, which is exactly the claim
      that decays). Re-diff at promote time.
- [ ] Strip trailing whitespace from the new `jsCode` before sending (LESSONS §58b: the authoring channel
      right-trims, so the byte gate fails on inert bytes). Verify `node --check` on the extracted body.
- [ ] Target every node by **NAME**. Apply the §5.2 ops in ONE `update_workflow` call.
- [ ] Per-node byte-SHA gate: `draft == file` → publish **only** on match → re-fetch `active == file`.
      Abort on any mismatch — an abort costs nothing (LESSONS §58).
- [ ] `publish_workflow` after `update_workflow`.
- [ ] **Post-promote verification on the path that changed (LESSONS §56) — the MISS path, per domain, not
      the happy path.** A happy-path smoke cannot see a dead-ended `If6 out1`. Minimum: one inventory miss
      and one incoming miss on a real turn; assert from runData that `Aggregate1` and
      `not-found-error-message` each have `runData[...].length >= 1` and the reply carries the escalate
      question. Read-only; do **not** answer "yes" to any escalate offer on a real contact (real staff
      assignment ripple).
- [ ] Watch the first live inventory + incoming miss turns. `search_executions status:["error"]` is **not**
      sufficient (a dead-end is green) — check `Aggregate1` ran.
- [ ] Rollback trigger: any live miss turn where `Aggregate1` has zero runs, or any turn where
      `sorento-sub-respond-sendmsg-respond2` has ≥2 runs. Roll back by publishing `a40cd16d`.

---

## 9. Sequencing vs `cross-domain-stock-incoming` — CONFIRMED, with two amendments

**The user's ordering is correct: loop removal FIRST, as its own promote, then crossdomain re-tests and
promotes.** Reasons, strongest first:

1. **It deletes two crossdomain open items outright.** F3 (probe fires once per tool → 2 CRM reads on every
   miss turn, forever) and F4 (per-tool `returnedCodes` vs per-turn `missing` → **a turn that successfully
   answered X also claims cross-domain stock for X and arms the escalate offer**) both require ≥2 runs of
   the loop body. With the loop gone they are **impossible by construction**. F4 is currently an unfixed,
   customer-visible correctness hole with no test; the manual script's T4 says "decide before promote: fix,
   or promote with the hole documented." Loop removal is the third and best option: delete the precondition.
2. **The two diffs touch DISJOINT edges** — verified. Crossdomain cuts `validator → If6` and splices the
   zeroset chain; loop removal repoints `If6 out1 → Loop Over Items` to `Aggregate1` and rewires the
   `tool-filter` feed. No shared edge, no merge conflict, either order.
3. **Fine-grained rollback.** Loop removal is 2 node deletions + 1 Code body on a path every turn takes;
   crossdomain is 5 new nodes + a 528→464-line rewrite + a live send-node re-pointing. Landing them
   together makes a production anomaly un-attributable. Separately, each is a pointer-move rollback.
4. **Crossdomain must be re-tested anyway.** The review already demands a full re-run recording
   `case → executionId` (its central evidence complaint). Re-basing onto the loop-free clone costs nothing
   extra.

**Amendment A — drop the crossdomain double-probe scaffolding once the loop is gone.**
- `crossdomain-probe.executeOnce: true` becomes dead. The manual script's T3 already establishes it is
  **inert** (n8n's `executeOnce` truncates input *within* a run, `input.slice(0,1)`; it does not suppress
  additional *runs*). Remove it for hygiene, or record it as knowingly dead — but never record it as the fix.
- **Do NOT add the proposed `{{ $runIndex }} === 0` gate to `crossdomain-gate`.** After loop removal it is
  permanently true: a condition that can never go false, on the node that decides whether the probe runs.
  That is exactly `green-that-cannot-fail` written into production. It also introduces the spine's **only**
  `$runIndex` dependency (§3.5) for no benefit.

**Amendment B — crossdomain tests that MUST be re-run after loop removal.** Every crossdomain path now
flows through a changed upstream feeder, so re-run the whole suite; these are the ones whose *result could
change*, in priority order:

| crossdomain case | why it must be re-run |
|---|---|
| **T3** | Flips from "expect 2 probe runs, finding confirmed unfixed" to **"`runData['crossdomain-probe'].length === 1`"** — now a real assertion. Re-word it. |
| **T4 / F4** | Becomes structurally impossible. Assert `runData['crossdomain-zeroset'].length === 1`. The hole closes without a zeroset redesign. |
| **X1, X3** | Flagship inventory/incoming miss turns — the miss path is the rewired join. |
| **X4, X11a, X11b** | Partial turns: `missing` is now computed from one envelope only. |
| **X2** | Both-empty ⇒ still no block (decision (d)). |
| **T1** | Marker anchoring: `not-found-error-message` / `build-suggest-offer` text is produced by the rewired chain. |
| **R2** | Inventory miss wording must stay **byte-identical to live** — the strongest single regression gate for both changes at once. |
| **R6** | **Now doubly important** — did-you-mean is the D2 multi-run consumer (§3.8). |
| **X9, X10, R1, R3–R5, R7–R10** | Cheap no-op / other-domain guards; re-run for attribution. |
| X6, X7, X8 | Follow-up legs; unaffected in principle, cheap to re-confirm. |

**Amendment B2** — crossdomain's promote checklist line "Live's `validator → If6` is the single edge to cut"
stays TRUE after loop removal. No edit needed. But its **live-node census must be re-taken** after loop
removal lands, since `Split Out1` / `Loop Over Items` will no longer exist on live.

---

## 10. Verification tasks (plan §6 style — planner-defined, required)

### (TL-a) Structural: the loop is gone and the join is present
From a re-fetched clone (and later live) `get_workflow_details`, assert **all five**:
1. no node named `Split Out1`; 2. no node named `Loop Over Items`; 3. `Loop Over Items1` **still exists**
(§3.1); 4. `If6.main[1]` contains **exactly one** target, `Aggregate1`; 5. `Aggregate1`'s inbound edge set
is exactly `{If6[1]}` and `not-found-error-message`'s is exactly `{Aggregate1[0], If-incoming-picker[1]}`.
> Assertion 4 is the one that catches the §0 catastrophe. State the compared population (edge count), so
> "no output" can never read as PASS (LESSONS §61b).

### (TL-b) The 1-tool invariant is enforced by CODE, not by data
1. `tool-filter`'s `jsCode` contains a single-element `return [{ json: … }]` and no `return { tools: … }`.
2. On **every** §TL case, `runData['tool-filter'][0].data.main[0].length === 1` (or `=== 0` for §TL-EMPTY).
3. On every case, `runData["Call 'sub-get-results'"].length === 1` and
   `runData['sorento-sub-respond-sendmsg-respond2'].length <= 1`.
4. **Negative construction (§TL-FP3):** hand a 3-tool array to the node and prove it still emits 1 item.

### (TL-c) The read allowlist still holds — plan §6(b) is unchanged and still mandatory
The resolved `tool` passed to `Call 'sub-get-results'` (`{{ $json.name }}`) must be in the READ allowlist and
**never** `crm_it_support_ticket_create`, on every case (§0 **S4**). This change **narrows** the surface —
one tool per turn instead of up to five — but the enforcement remains an assertion, not a guarantee.
Additionally record `_tool_pick.rejected[]` per case: it is the first artifact that makes plan §6(b)'s
"data-dependent, not structural" open risk *observable* per turn rather than inferred.

### (TL-d) The multi-run D2 consumer degrades correctly
On §TL-D2, assert `build-suggest-offer` produced a `Try:` / numbered-alternatives block sourced from
`Call 'sub-get-results'` run 0, and that its `alts` scan terminated cleanly (no node error). Record that the
stale comment was corrected.

### (TL-e) Token sinks bounded by tier (§0 S6)
`scope: deterministic` ⇒ no LLM node executed on the mocked cases. The parser-tier E2E cases (§TL-D2,
§TL-DYM, §TL-CONT) run the real reformulator — declare them, don't let them leak into the deterministic
count.

### (TL-f) Aggregate output equality — measured, not assumed
§TL-AGG compares `Aggregate1`'s output object on a post-change 1-tool miss against the pre-change baseline
captured from live exec `11060071` (`{response_intro:["No matching results found."]}`). Equality of the
`json` object is the gate; `pairedItem` divergence is expected and recorded (§3.3).

---

## 11. Residual risks (accepted / recorded)

| # | risk | severity | handling |
|---|---|---|---|
| RR1 | Loss of the "try the second tool on a miss" behaviour | LOW | 12/12 sampled turns: the 2nd tool never rescued a miss; and `crm_inventory_warehouses_list` structurally cannot answer a per-product stock query (evidence doc). Permanent, by design (user decision). |
| RR2 | Loss of the D2 cross-run `alternatives` fallback (§3.8) | LOW — **removes a wrong behaviour** | Would have surfaced warehouse-shaped strings as product did-you-mean. §TL-D2 guards the remaining path. |
| RR3 | `sub-get-rag`'s summed `similarity` (§3.6) makes "best tool" ill-defined if any tool gains a 2nd `source_id` | MEDIUM, latent | Explicit sort (D9) + `_tool_pick.rejected[]` (D8) make it visible. A real fix belongs in `sub-get-rag` (max instead of sum) — separate diff, do not bundle. |
| RR4 | 0-tools silent dead-end preserved (§3.10) | pre-existing | §TL-EMPTY documents it; backlog item. |
| RR5 | Removing `tool-filter`'s `compatible_entities` read removes a throw (§3.7) | LOW | Keep a tolerant read so the diff is not a silent widening. |
| RR6 | The 1-tool premise is 20 min old and unconfirmed on live (§4.1) | MEDIUM until P1 | Prerequisite P1. |
| RR7 | **Live calls the get-results TEST fork** (§6) | HIGH, **unrelated** | P0. Report; do not bundle; do not silently correct. |
| RR8 | Replay/golden-master node-run counts change (2 runs → 1) inside the loop body on inventory turns | LOW | Expected and desirable; the replay harness is broken anyway (§3.9). If a baseline is ever re-captured, capture it **after** this change. |

---

## 12. Change-request claims — verdict table

| claim | verdict |
|---|---|
| `tool-filter` is a dead-code passthrough | ✅ confirmed, byte-identical on live + clone |
| `sub-get-rag` has no similarity floor; spine calls `limit:5` | ✅ confirmed from the sub's SQL + node params |
| `Loop Over Items out0` is the miss-path join; deleting the loop dead-ends every not-found turn | ✅ confirmed; §0 |
| `Aggregate1` aggregates only `response_intro` | ✅ confirmed — **and nothing consumes it** (§3.3) |
| Nothing reads `Split Out1` / `Loop Over Items` by name | ✅ confirmed, zero refs on both workflows |
| `Loop Over Items1` is unrelated | ✅ confirmed (media/attachment path) |
| No `$runIndex` / run-count-sensitive `isExecuted` downstream | ✅ confirmed — **but see §3.8**, `build-suggest-offer` iterates runs via `node.all(0, ri)`. Degrades correctly; comment is now false. |
| Replay path does not depend on the loop | ✅ confirmed (`fixture-get-results` is tool-agnostic) |
| Proposed shape: `tool-filter → replay-get-results`, `If6 out1 → Aggregate1`, delete both nodes | ✅ **adopt**, with the flat-item interface requirement (§3.4) and explicit sort (D9) |
| `limit: 5 → 1` as defence in depth | ❌ **reject** (D6) — competing enforcement point that can disagree |
| Topology shows `out1 → replay-get-results` on live | ❌ **corrected** — clone-only nodes; live wires straight to `Call 'sub-get-results'` (§2.1) |
| Every domain now returns exactly 1 tool | ⚠️ true on the clone @ 11:23:22Z; **NOT yet observed on live** (2 tools @ 11:01:39Z) → P1 |
