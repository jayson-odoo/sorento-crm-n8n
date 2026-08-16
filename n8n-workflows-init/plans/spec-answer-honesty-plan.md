# Change Plan — spec-answer honesty (SR): send the qualifiers, show what matched, stop contradicting the answer

Change-id: `spec-answer-honesty`
Status: PLAN (drafted from live console evidence 2026-08-13; needs the user's §5 answers before build).
Raised by: user hand-testing shape A through the chat console (clone repointed to `txiPzSxy3Pclsz6v`).
Related: `plans/spec-search-shapeA-wiring-plan.md` (shape A — **promote HELD by the user pending SR-1**),
`plans/crm-ask-spec-backward-search.md` (shape B), CRM asks C-1..C-3 sent 2026-08-13.
UAC family: `tests/uac/SR.md`.

---

## 0. What the user typed, and what actually happened (execution evidence, not inference)

| # | input | observed | cause, from runData |
|---|---|---|---|
| A | "double bowl kitchen sink with thickness 1.2mm" | 5 Cabana double-bowl sinks | correct — but see C |
| B | "sorento double bowl kitchen sink with thickness 1.2mm" | **4 junk rows** (SORENTOBAG, SORENTO CATALOGUE, `****NOT USE THIS CODE`) + `Couldn't find these: "double bowl kitchen sink" — not found.` | exec `12303509`: AND matched nothing → **OR-degraded** (`fallback_match_mode`). `Sorento` prefix-matched 4 junk codes; the descriptive token got 0 matches. Response carried **no spec fields at all** — in OR shape the widened gate cannot fire and zero-match is false, so **spec search never ran**. Pre-existing live behaviour; shape A is not implicated. → CRM **C-1**. |
| C | same phrase with **1.0mm** vs **1.2mm** | **identical rows** | exec `12303548`: parser entities = `["double bowl kitchen sink"]` only. We build `free_terms` from **entity raws**, so the words "thickness"/"1.0mm" were **never sent**. `matched_specs: ["bowl_count","free_terms"]`, `spec_unmet: []` — nothing was unmet because nothing was asked. → **N-0 (ours)**. |
| D | every answer | rows show only Code / Description / List Price / Dimensions | the customer cannot see WHICH spec matched, nor the product's specs. `display.matched_specs` **is already on the wire** and dropped. → **N-1**. |

**The mechanism the user asked for already exists.** `Call 'sub-get-results'` returns
`requested_attributes: ["dimension"]`, `keys_served: false`, and `answers[].fields` as structured
`{label, value}` pairs — i.e. attribute-relevance rendering (the container-status pattern) is
already plumbed. SR-2 extends it to spec keys; it does not invent it.

## 1. Slices, split by blast radius (this split is the point)

### SR-1 — spine only, cheap, no shared sub touched

- **N-0 · send the qualifiers.** `resolve-entity`'s `free_terms` gains the customer's own words.
  Per-word code filter (the shipped `CLASSIFIER_SRC` bias holds: never drop a description), then
  **join the survivors into ONE free term** so `thickness 1.0mm` stays adjacent — the CRM's
  quantity extractor binds a number to a key by proximity to that key's own words (`_self`
  synonyms; `thickness` IS a registry key, `product_spec_registry.py:438`, synonyms
  thickness/thick/gauge). Disjoint per-entity terms destroy that adjacency, which is exactly why
  case C silently ignored the number. Source = the **raw customer message**, never `user_goal`
  (an LLM restatement).
- **N-3 · stop contradicting the answer.** `compile-current-state`'s `_tokenWasAnswered` reads the
  token's own `matches`/`alternatives`/`intersection`; spec rows arrive on a **different**
  resolution keyed on `payload.query`, so a descriptive token reads as unanswered and gets
  `"…" — not found.` underneath its own answer. Fix is **outcome-keyed** (LESSONS §67): any
  `match_tier === 'spec_search'` row in the answer ⇒ the raws that fed `free_terms` were answered.
  One predicate, not a per-mechanism patch. (This is the reviewer's §D, reachable in the wild once
  C-1 lands, and reachable today on the OR path.)
- **N-2 · say what was ignored.** When the response reports asked-for-but-unmet keys (`spec_unmet`
  today; `unrecognized_terms` when CRM ships **C-2**), append a deterministic line —
  *"I couldn't filter by 1.2mm thickness"* — same pattern as the existing friendly-domain suffix,
  assertable at the boundary. Silence must never pass as success.

### SR-1b (added 2026-08-13, user go) — N-1a · the "Matched on" line, KEY NAMES ONLY

Spine-only, `compile-current-state` again (rev 4), NO sub touched — so it does NOT trip the §2
gate. The wire today carries only `display.matched_specs` = registry KEY names
(`["bowl_count","free_terms"]`); values arrive with CRM C-3. v1 therefore renders the union of
keys across the answer's spec rows, humanised (`bowl_count` → `bowl count`), as one deterministic
line after the product list:

- ≥1 real key: `_Matched on: bowl count._` (order: as first seen; dedup; `free_terms` NEVER
  rendered as a key — it is machinery, not a spec)
- ONLY `free_terms` matched: `_Matched on your description._`
- zero spec rows in the answer: NO line, byte-identical — this line exists only on spec answers.

Upgrade path when C-3 ships values: same block swaps key names for `key: value` pairs; the
anchor and the no-spec no-op guarantee stay.

### SR-2 — `answers[].fields` renderer, inside the get-results sub. **DO NOT START without §2.**

- **N-1 · show which spec matched** per row with VALUES ("matched: double bowl") — needs C-3.
- **N-4 · show the spec the customer asked about** — extend `requested_attributes` to spec keys and
  surface `keys_served: false` honestly. Needs CRM **C-3** (spec VALUES on the result rows).

## 2. 🔴 SR-2 blast-radius gate (read before touching any get-results sub)

Verified 2026-08-13 from the exports:

| caller | sub |
|---|---|
| LIVE `Call 'sub-get-results'`, `probe-incoming`, `tier-probe` | **`rysSPgUssLDf6xJc`** (`sub-get-results TEST`) |
| LIVE `sibling-probe` | `Fss5aAaXthJSWpZCgKiKR` (`sub-get-results`) |
| CLONE (all three) | **`t4QvrtrPnTwRU6br`** (`sub-get-results CS-BUILD`) |

So: live's main CRM read path runs a sub NAMED "TEST" (the standing 🚩), and the clone runs a
THIRD fork carrying someone else's in-flight container-status work. Consequences: (a) editing the
clone's sub does not prove anything about live's; (b) promoting a sub edit means writing
`rysSPgUssLDf6xJc`, which is an ungated live change wearing a test name; (c) SR-2's diff would
collide with the CS-BUILD work. **SR-2 needs its own scoping pass and probably its own fork off
whatever live actually runs.** SR-1 avoids all of this.

## 3. Sequencing

1. **SR-1 build + UAC on the clone** (spine only) → review → **shape A + SR-1 promote together**,
   user-gated. Shape A alone ships the contradictory footer the user hit; SR-1 is what makes it
   presentable.
2. CRM **C-1** (OR-path reachability) lands → re-test case B → the junk-brand answer becomes a
   real spec answer; N-3 is already in place to keep the footer off.
3. CRM **C-2** → N-2 switches from `spec_unmet` to the richer `unrecognized_terms`.
4. CRM **C-3** + the §2 scoping pass → **SR-2**.

## 4. Known bound, stated

N-0 makes `free_terms` noisier (whole phrases, including filler). Free terms only match the
rendered spec sentence and class synonyms, never `products.description`, and the classifier's
documented bias already accepts being wrong in the "kept too much" direction. Measure in the
offline probe: SA-P1's match set must not degrade when N-0 is applied.

## 5. Decisions (user, 2026-08-13)

1. ✅ **N-2 wording = the data-truth form.** Say the spec **isn't recorded**, not that the search
   failed: *"Showing double-bowl sinks — thickness isn't recorded for these products, so I
   couldn't narrow by 1.2mm."* Rationale: the value is usually absent from the catalogue, and the
   blame-the-search phrasing invites "then try again properly". One deterministic sentence,
   rendered once, asserted verbatim at the boundary. Where the CRM later distinguishes
   *unrecognized term* from *recorded-but-unmatched* (C-2), the wording splits accordingly —
   until then, this is the honest default.
2. ✅ **Case B: wait for CRM C-1. No n8n junk filter.** The junk rows are pre-existing live
   behaviour, not a shape-A regression, and the root fix (spec search reachable on the OR path)
   deletes the symptom by answering the descriptive token properly. A renderer-side
   "looks-like-a-catalogue-row" heuristic would be a second mechanism guarding the same outcome —
   the class this repo keeps paying for (LESSONS §67). SR-8 stays observational.
3. ✅ **N-4 covers ALL product answers, not just spec-search ones.** The mechanism
   (`requested_attributes` / `keys_served` / `answers[].fields`) is already shared by every
   product answer, so scoping it to the new path would mean two rendering rules. Consequence,
   accepted: N-4 changes replies customers already get today, so it lands in SR-2 with **its own
   UAC family and its own baselines**, gated behind the §2 fork scoping — it does NOT ride SR-1's
   promote.
