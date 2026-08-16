# Node-diff — `spec-answer-honesty` · slice **SR-1** (N-0, N-2, N-3) + **SR-1b** (N-1a)

Build target: **TEST clone `txiPzSxy3Pclsz6v`** · `6cd67cbf` → `d59c226c` → `8ed4e464` →
`48aaa6fd` → **`c97f2f8f`** (published, draft == active)

> **Rev 4 (2026-08-13, SR-1b, user go):** one node, one leaf —
> `compile-current-state.jsCode` only, and inside it **one new additive block**: the deterministic
> **"Matched on" line** on spec answers (plan §SR-1b · UAC SR-U6 / SR-10..12). N-0, N-2 and N-3 are
> untouched — not re-worded, not re-anchored, not re-ordered; `resolve-entity-http` was **not**
> re-touched (leaf sha re-asserted unchanged from the deployed JSON). **No get-results sub and no
> other node**, so the plan's §2 blast-radius gate is not approached. Detail in **§3b**; three
> findings the reviewer should read are in §3b's own list, one of which is a **CRM-side honesty
> limit I did not paper over**.

> **Rev 3 (2026-08-13, after `/codex-review`):** one node, one leaf —
> `compile-current-state.jsCode` only, and inside it only **which span the N-2 sentence quotes**.
> N-3 is untouched; the N-2 wording, position and guards are untouched; `resolve-entity-http` was
> **not** re-touched (leaf sha re-asserted unchanged from the deployed JSON). Two defects, both
> raised by the second-model review and both **reproduced mechanically against the deployed rev-2
> body before a line was changed** — full detail in §3's rev-3 block. Reviewer's rev-2 APPROVE
> stands for everything else; this narrows N-2's span selection only.

> **Rev 2 (2026-08-13, after the tester's run):** one node, one leaf —
> `compile-current-state.jsCode` only. N-2 now quotes **the customer's own span** instead of the
> normalised wire value, because the tester measured `…so I couldn't narrow by 1.` at the customer
> boundary for someone who typed **1.0mm** (`tests/runs/spec-answer-honesty-SR-2-20260813.json`).
> Also in this revision: the §2 REACHABILITY table is **corrected** — the tester found a third CRM
> path, reached live on the clone, so **N-3 no longer ships on offline evidence alone**.
> `resolve-entity-http` was **not** re-touched in rev 2 (its leaf sha is unchanged, re-asserted
> from the deployed JSON).
Plan: `plans/spec-answer-honesty-plan.md` · UAC: `tests/uac/SR.md` · Manifest + rollback:
`tests/manifests/spec-answer-honesty/README.md` · Offline suite: `tests/offline/spec-answer-honesty/`
Live spine `9qVyfUxmRQqrpGRMDLRuz` **not touched**. Nothing promoted. **SR-2 (N-1/N-4) not started**
— plan §2 blast-radius gate.

## Summary

**Two nodes, two leaves.** `resolve-entity-http.parameters.jsonBody` (one field rewritten:
`free_terms`) and `compile-current-state.parameters.jsCode` (two additive blocks). No node added,
removed, renamed, rewired or re-credentialed; `connections` byte-identical; 27/27 credential
bindings intact; the other 146 nodes' `parameters` unchanged — asserted by a **full param-hash
sweep over every node**, not a Code-body diff (LESSONS §71: a promote diff built from `nodes/*.js`
is blind to exactly the httpRequest node changed here, and that blindness shipped an outage).

Egress containment re-asserted from the deployed JSON: `send-message-files`, `send-message-images`,
`send-message-video`, `update-human-intervened`, `save-session-vars` all still **0 inbound**; zero
dangling connection refs across 148 nodes.

**Rev 3 re-ran that whole sweep against the rev-2 export** and it found exactly one node changed
(`compile-current-state`), `connections` byte-identical, 27/27 credentials with identical
`(node, type, id)` triples, and zero `position`/`typeVersion`/`disabled` deltas. Node count, name
set and id set unchanged at 148.

**Rev 4 re-ran it again against the rev-3 export**, in the writer itself and against the
**re-fetched** deployed JSON (never trusted from the request): exactly one node's `parameters`
changed (`compile-current-state`), 148 nodes with identical name **and** id sets, `connections`
byte-identical, 27/27 credential `(node, type, id)` triples identical, and
`resolve-entity-http.jsonBody` re-read at its unchanged sha.

| | before (pre-SR) | after |
|---|---|---|
| `resolve-entity-http.jsonBody` sha256 | `dac04eb02a23bfd7a780fd2f8905c4e4af4a82b41c31b21dcc0a3328ada7f639` (1306 B) | `7ca14cbfd47e273a1c1464e2fb0c85fd52e3a39cf9f0062f83bc537ce7fd4265` (1809 B) — **unchanged in revs 2, 3 and 4** |
| `compile-current-state.jsCode` sha256 | `78a805b312378dd3ec682b0ab6678480b53c16d8b68e2bd91a57c39b58cd9f0c` (32958 B) | **`82707a95a7c63d74b6dbc963774630e21a5bd1c9cb4748671706a4a8a63e67b5`** (52694 B) |

Superseded `compile-current-state` shas, recorded so a report can name **which** body it found
(LESSONS §64 rule ii: three outcomes, never two) — `probe.js`'s D1 now distinguishes
**SUPERSEDED (rev N)** from **DRIFTED**, because "an earlier revision of this change" and "someone
else edited the node" are different facts:

| rev | sha | bytes | what it rendered |
|---|---|---|---|
| rev 1 (`d59c226c`) | `e727631f94d523e37c89dd61736bd8f65850f6fcec663c542a0497aecd0aa335` | 38725 | the bare wire value — *"narrow by 1."* for a customer who typed 1.0mm |
| rev 2 (`8ed4e464`) | `e3b844c6cb674f54b780a817af5d0287607db790aafc207ddf1d11e73f3aa4f0` | 42402 | the customer's span, but the FIRST one that matched — *"narrow by 1.2MM"* out of a part number |
| rev 3 (`48aaa6fd`) | `7959776fa7ce4a0fe5908ca1bcdc5c4ef9c653b02f2cce8db7f3407c86a7566e` | 46933 | the span nearest the key — correct, but **no "Matched on" line at all** (pre-SR-1b) |

Record and re-check those AFTER shas at the start of every test pass (LESSONS §64). `probe.js`
gate **D1** does it automatically, now with **four** outcomes — `DEPLOYED` / `NOT-YET-DEPLOYED` /
`SUPERSEDED (rev N, named)` / `DRIFTED` — never two. Rev 3 added the third: between a build and its
PUT the clone legitimately carries the previous revision, and collapsing that into `DRIFTED` trains
the reader to ignore the one report that means "someone else edited this node".

---

## 0. The baselines — frozen, not re-driven

Re-fetched from recorded executions on the pre-SR clone and frozen under
`tests/offline/spec-answer-honesty/baselines/` (verbatim reply + the resolver envelope facts).

| id | exec | input | pre-SR observed |
|---|---|---|---|
| **SR-B1** | `12303472` | "please get me double bowl kitchen sink with **thickness 1.2mm**" | 5 Cabana double-bowl rows; `free_terms=["double bowl kitchen sink"]`; `matched_specs=["bowl_count","free_terms"]`; `spec_unmet=[]` |
| **SR-B2** | `12303548` | same with **1.0mm** | reply **byte-identical to SR-B1** (`diff` empty) |
| **SR-B3** | `12303509` | "…**sorento** double bowl kitchen sink with thickness 1.2mm" | 4 junk rows + `Couldn't find these: "double bowl kitchen sink" — not found.`; OR-degraded (`fallback_match_mode:"or"`), spec search never ran |
| SR-B4 | `12302269` | "do you have wall hung basin 600mm" | 5 Bravat rows, AND path, `spec_unmet: []` — extra, kept as the SR-7 regression baseline |

> **SR.md's table has SR-B1 without an execution id** and notes `12303548` is "the 1.0mm twin".
> The 1.2mm run does exist — `12303472`, 42 s earlier — and is now frozen. **SR-B1 == SR-B2
> byte-for-byte** is therefore measured, not inferred: that is the RED for N-0.

---

## 1. `resolve-entity-http` — N-0, send the qualifiers

**One field rewritten**, `free_terms`. Everything else byte-identical (`query`, `match_mode`,
`tokens`, `allowed_entity_types`, `access_levels`, `domain`, `fallback_to_all_types`, `limit`,
`spec_fallback`, `understand_phrase`) — re-rendered and diffed field-by-field on 9 fixtures
(probe U2), because the change is an **expression**, which no `nodes/*.js` review can see.

```
before:  "free_terms": {{ JSON.stringify( CLASSIFIER( entities ) ) }},
after :  "free_terms": {{ JSON.stringify( ((_c) => (_e, _m) => {
                            const _t = _c(_e);
                            const _x = MSG_TERM(_c)(_m);
                            if (_x) _t.push(_x);
                            return _t.filter((v,i,a) => a.indexOf(v) === i);
                          })( CLASSIFIER )( entities , RAW_MESSAGE ) ) }},
```

with `MSG_TERM = (_c) => (_m) => String(_m == null ? '' : _m).split(/\s+/).filter(w => _c([{raw:w}]).length > 0).join(' ')`
and `RAW_MESSAGE = (() => { try { const _j = $('tf-message').first().json; return (_j && _j.message && _j.message.message && (_j.message.message.text || (_j.message.message.attachment && _j.message.message.attachment.description))) || ''; } catch (_err) { return ''; } })()`.

### Why, from the measurement

Exec `12303472`/`12303548`: the parser emitted **one** entity, `double bowl kitchen sink`. We built
`free_terms` from entity raws, so the words "thickness" and "1.2mm" were **never sent**. `spec_unmet`
was `[]` because nothing was asked. Two different numbers, one identical reply.

### Six decisions worth reviewing

1. **Source = `tf-message`, never `user_goal`.** `$('tf-message').first().json.message.message.text`
   is the spine's canonical turn text — it is what `Call 'sub-query-reformulator'`'s
   `latest_user_message` reads, **identically on the clone and on live**, and `patch-transcript`
   folds a Whisper transcript into the queue item UPSTREAM of it, so a voice turn carries text too.
   `user_goal` is an LLM restatement and is already what `query` sends. Probe **U1-15** is the
   discriminator: the fixture's `user_goal` deliberately *also* contains "thickness 1.2mm", so a
   body wired to it passes every other N-0 assertion — U1-15 is the only one that can tell them
   apart, and mutant **m9** proves it goes red.
2. **ADDITIVE, not replacing.** The message term is appended to the existing entity-raw terms.
   Two reasons, both about not degrading SA-P1 (plan §4's stated bound):
   `search_specs` derives `implied_classes` **per term** via `resolve_classes_for_term`, which
   matches a whole term against a class label — `double bowl kitchen sink` resolves a class, a
   whole sentence does not, and class is the strongest signal the ranker has; and **carried**
   entities (`current_message:false`) are not in this turn's raw message, so a follow-up
   "how about 1.0mm" would lose its subject. Additive makes the term set a strict superset of
   today's, so the match set cannot shrink **by construction**. Mutant **m10** covers it.
3. **Per-word filter via a ONE-ELEMENT array.** The shipped classifier ends in a dedup
   (`a.indexOf(v) === i`). Fed a word list it would delete a legitimately repeated word
   ("1.2mm thickness and 1.2mm depth") and silently rewrite the customer's sentence. Calling it
   one word at a time makes the dedup a no-op while reusing the shipped bytes verbatim — the
   code-shape rule keeps exactly ONE definition in this repo
   (`tests/offline/spec-shapeA/free-terms.js`, asserted present in the shipped body by U1-13/14).
4. **Joined into one term.** Correcting the plan's stated rationale: the CRM already joins all
   free terms into one haystack (`resolve_terms_to_specs`:
   `" ".join(t.lower() for t in free_terms)`), so separate terms do **not** by themselves destroy
   adjacency — ORDER does, and case C failed because the words were never sent at all. Joining is
   still right: it makes adjacency independent of array order/dedup downstream. `thickness` IS a
   registry key and `_resolve_quantities` binds a number only within
   `_QUANTITY_BINDING_WINDOW` characters of the key's own `_self` synonym.
5. **try/catch → `''`.** `resolve-entity-http` is on the critical path of every product turn. An
   expression that throws does not "lose the qualifiers", it fails the node. `tf-message` is
   upstream on the only route today — which is exactly why the guard is written rather than
   assumed (probe U2 covers a missing `tf-message` and an audio-only turn).
6. **Pure ASCII, no trailing whitespace** — asserted by the probe, so the body survives byte-gating
   (LESSONS §57).

### Stated bound (plan §4), measured against the CRM source

`_tokens()` in the CRM keeps every word longer than 2 chars, so filler ("please", "get", "with")
reaches `wanted_terms` and can earn `free_term_boost` against a rendered spec sentence. That boost
also counts as **`evidence`**, and `evidence <= 0` is both what DROPS a product and what sets
`floor_missed` — so a filler word common to many rendered sentences slightly lowers the effective
relevance floor. **No stop-word list was added**: that would be a second mechanism guarding the
same outcome (LESSONS §67) and the plan does not ask for one. **UAC SR-6 ("purple levitating
sink") is the case that settles whether it matters** — please do not sign that case off as
"unchanged" without looking at whether rows appear where none did before.

---

## 2. `compile-current-state` — N-3, stop contradicting the answer

Inserted immediately above `let missResolutions = [];`, plus **one clause** on the filter:

```js
  const _fedFreeTerms = <CLASSIFIER_SRC>;                       // the SHIPPED code-shape rule
  const _specSearchAnswered = (() => {
    if (!_answerCodes.size) return false;
    const _rows = [];
    if (Array.isArray(r?.resolutions)) for (const _res of r.resolutions)
      if (Array.isArray(_res?.matches)) _rows.push(..._res.matches);
    if (Array.isArray(r?.intersection)) _rows.push(...r.intersection);
    return _rows.some(m => String(m?.match_tier ?? '').toLowerCase() === 'spec_search'
      && [m && m.uuid, m && m.canonical_code]
        .some(v => { const k = String(v ?? '').trim().toLowerCase(); return k && _answerCodes.has(k); }));
  })();
  const _tokenFedSpecSearch = (tok) => _specSearchAnswered && _fedFreeTerms([{ raw: tok }]).length > 0;
```

```diff
   missResolutions = r.resolutions.filter(res => res && res.resolved !== true
     && !(Array.isArray(res.matches) && res.matches.some(isExact))
     && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
+    && !_tokenFedSpecSearch(res.token)
     && !_tokenWasAnswered(res));
```

**Sixth surface of the class §67 names, and the first where the answer arrives on a *different*
resolution than the token.** `references.py:_emit_spec_matches` does
`result.setdefault("resolutions", []).append(spec_resolution)` — it **appends** a NEW resolution
keyed on `payload.query` (the parser's restatement) carrying every `match_tier:"spec_search"` row,
and leaves the customer's own raw on a resolution with `matches: []`. `_tokenWasAnswered` reads the
token's OWN candidates, finds none, and prints `"…" — not found.` under the answer its own words
produced.

**Outcome-keyed, per §67** — the invariant is *a spec_search row in the answer means the descriptive
words were answered*, not "the query-token mechanism". A seventh promotion mechanism needs no
seventh patch. **Scoped by the same classifier the shipped `free_terms` uses**, so only tokens that
could have fed spec search are covered: an unknown code beside a spec answer is excluded from
`free_terms` and still surfaces its own miss (SR-U5). **The spec row must be IN THE ANSWER**, joined
by uuid/code to `disallowed-entity-gate.compatible_entities` — which carries only
`{uuid, entity_type, code}` (measured, exec 12303548), no `match_tier`, hence the join.

### 🔴 A dead-code clause was written, caught, and DELETED

A first draft scoped the legacy single-resolution arm too. **SR-U5-7 showed it can never fire**, so
it was removed rather than shipped with a test that cannot go red (LESSONS §66). Proof: the legacy
arm runs only when `r.resolutions` is not an array, so a spec_search row can only live in
`r.intersection`; `_specSearchAnswered` requires such a row to be in `_answerCodes`, and
`_tokenWasAnswered(r)` reads `r.intersection` against the *same* `_answerCodes` — so
`_specSearchAnswered ⇒ _tokenWasAnswered(r)`, and the existing fifth-patch guard has already
returned. U5-6/U5-7 now pin that reasoning against the **pre-fix body as well**.

### ✅ REACHABILITY — CORRECTED by the tester (rev 2). N-3 is NOT offline-only.

**My rev-1 table was wrong in the direction that matters: it enumerated two CRM paths, found
neither reachable, and wrote that up as "the defect may be unreachable".** The honest reading of
that table was always *"the two shapes I checked are not reachable"* — the tester enumerated a
**third**, and reproduced the defect shape **live on the clone**, exec **`12308336`**, from UAC
**SR-4**'s own input ("wall hung basin and SRTZZ999"). Corrected table:

| path | what the CRM returns | reachable? |
|---|---|---|
| AND, partial code-word coverage (SR-B1/B2/B4) | `intersection` REPLACED by spec rows; `resolutions` contains **only** the appended query-keyed one | **No** — no per-raw resolution to suppress; `_tokenWasAnswered` already covers the one that exists |
| OR-degraded with a partial match (SR-B3) | `Sorento` prefix-matched 4 junk rows, so `_result_has_zero_matches` is false and `_product_words_unanswered` reads `token_coverage`, which only AND mode computes → **spec search never ran** | **No** — zero spec_search rows, so the predicate correctly does nothing and the footer correctly stays |
| **MULTI-token, AND produces zero intersection → the CRM itself falls back to OR** (`fallback_match_mode: "or"`, `fallback_reason: "AND-mode produced zero intersection; switched to OR-mode…"`) | **all three at once**: `wall hung basin` keeps its OWN resolution with `matches: []` (+3 trgm alternatives), `SRTZZ999` keeps its own empty one, AND the query-keyed restatement resolution carrying 5 `match_tier:"spec_search"` rows is appended | **YES — MEASURED**, exec `12308336`. This is the shape N-3 is written against, and it is one ordinary two-token question away |
| OR with **all** tokens matching nothing | per-token `resolutions` survive and the spec resolution is appended | Yes — the shape SR-U3/U5 model |

Why row 3 escaped me: I enumerated by *match_mode as requested*, so I never considered the CRM
**rewriting AND→OR mid-request** and keeping both the per-token misses and the spec resolution.
The trgm `alternatives` on the surviving token are what defeat `_tokenWasAnswered` (they are 3
codes that are **not** in the 5-code answer set) — so without N-3 the reply would have printed
`Couldn't find these: "wall hung basin" — not found.` directly under the five wall-hung basins that
answered it. The tester verified this **both** ways: a clause-by-clause trace of the deployed
predicate, and the rendered reply, where `wall hung basin` is absent from the miss block and
`SRTZZ999` is still present.

**Consequence for the reviewer: N-3 carries live clone evidence (SR-4/SR-9, exec `12308336`) plus
the offline units — not offline evidence alone.** The generalisable half is worth more than the
row: *a reachability table is an enumeration of the paths you thought of, and it should be labelled
that way* (LESSONS §70 — a finding derived from source, without the callers/inputs, is a
hypothesis).

---

## 3. `compile-current-state` — N-2, say what was ignored

Inserted immediately **above** the friendly-domain disclaimer block, so the caveat sits with the
answer it qualifies rather than under a generic tip or a did-you-mean footer. Renders:

> `thickness isn't recorded for these products, so I couldn't narrow by 1.2mm.`

**Data-truth wording, decision §5.1** — the spec *isn't recorded*, never "I couldn't filter"
(mutant **m7** goes red on the blame-the-search form).

### 🔴 REV 2 — the value is the CUSTOMER'S OWN SPAN, or it is not rendered at all

**The defect, measured at the customer boundary** (tester run
`tests/runs/spec-answer-honesty-SR-2-20260813.json`, clone rev `d59c226c`): a customer who typed
**1.0mm** was told

> `thickness isn't recorded for these products, so I couldn't narrow by 1.`

Two faults in one short sentence, and the second is the serious one. `spec_unmet[].value` is the
JSON number `1.0`, and `String(1.0) === '1'` — so the reply **truncates** (reads as a formatting
bug) and, worse, **states a different number from the one the customer asked about**. The unit is
not on the wire at all: the CRM normalises everything to millimetres and sends a bare number.

Rev 1 called this a "known limit" and shipped it, on the reasoning that fabricating `mm` would be
inventing data. That reasoning is still right; the conclusion was wrong. **There is a third
option, and it is the honest one: quote the customer's own words back.**

```js
const _rawMsg = <the same $('tf-message') accessor N-0 uses, try/catch -> ''>;
const _spanFor = (v) => …;   // find v's span in the customer's text, prefer the unit-carrying form
const _spans = _shown.map(x => _spanFor(x.value));
const _quotable = _spans.every(s => typeof s === 'string' && s.length > 0);
const _tail = _quotable
  ? `so I couldn't narrow by ${_and(_spans.filter((s, i, a) => a.indexOf(s) === i))}.`
  : (_shown.length === 1 ? "so I couldn't narrow by it." : "so I couldn't narrow by them.");
```

| the customer typed | wire value | rendered |
|---|---|---|
| `…thickness 1.0mm` | `1` | `…so I couldn't narrow by **1.0mm**.` |
| `…thickness 1.2 mm` | `1.2` | `…so I couldn't narrow by **1.2 mm**.` (spaced, as typed) |
| `…thickness 1.2` | `1.2` | `…so I couldn't narrow by **1.2**.` (no unit invented) |
| value not in their text (e.g. they wrote `1.2 cm`, CRM normalised to `12`) | `12` | `…so I couldn't **narrow by it.**` |
| value missing / empty / boolean / an object | any | `…so I couldn't **narrow by it.**` |

**Nothing is invented and nothing is inferred** — the rendered span is a literal `slice` of the
customer's own message. `mm` only ever appears in the reply because the customer wrote `mm`.

Seven decisions, each with a mutant that turns it red:

1. **Source = `tf-message`, the same accessor N-0 already ships** (`json.message.message.text`,
   attachment `description` fallback) — the spelling every reader in the spine uses, verified
   against the exported `workflow.json`, not re-derived. Wrapped in try/catch → `''`, because a
   throw here would fail a node on the critical path of every product turn (**U4-22** runs the
   fixture where `tf-message` did not execute and `.first()` throws, as n8n really behaves).
2. **Numeric match, not string match.** `1.0` arrives as `1`, so a substring search for `"1"` would
   find the wrong thing. The scan finds number tokens in the raw text and compares them
   **numerically**, then returns the *text* — which is how `1` finds `1.0mm` (**m11** prints the
   wire value instead → U4-1/8/12 red).
3. **Unit-carrying span WINS.** Two passes: require a unit first, allow a bare number second. So
   "i need **1** double bowl sink, thickness **1.0mm**" quotes `1.0mm`, not the shopping quantity
   (**m12** drops the preference → U4-26 red).
4. **The unit is a WHITELIST** (`mm/cm/m/in/inch/ft/l/kg/w/bar/mpa/"/'` …). Accepting "any letters
   after a number" would echo `2 sinks` as if it were a measurement.
5. **All-or-nothing across keys.** If any shown key's value cannot be located, the whole value list
   is dropped and only the keys are named. Half a list would attribute a number to the customer
   that they did not write (**m13** makes it `some()` → U4-21 red). Spans are deduped, so two keys
   that failed on the same value read "thickness and depth … by 1.2mm", not "by 1.2mm and 1.2mm".
6. **Two boundary guards, each with its own discriminating fixture** (LESSONS §66): the character
   *before* the number must not be a digit/letter/dot, so `SRT332-GM` cannot donate `332`
   (**m15** → U4-28 red); and the character *after* must not be alphanumeric, so `srtwc1.2ab`
   cannot donate `1.2` (U4-25). These are two different guards — U4-25 alone does not exercise the
   first one, which is exactly why U4-28 exists.
7. **A boolean is never echoed, even if the word is in the message** — "narrow by true" is worse
   than silence, and the guard must not be defeated by a customer who happens to write "is it true
   that…" (**m14** → U4-23 red, on a fixture that contains the word).

### 🔴 REV 3 — the right VALUE was not enough; it has to be the right SPAN

`/codex-review` (review §H) raised two candidates against the rev-2 hunk. Both were **verified
mechanically against the deployed body before anything was edited**, and both are echo-only —
nothing about which products come back moves — but both make the sentence quote a span the
customer did not mean, in the one sentence whose entire purpose is not misleading them.

| # | input | **rev 2 rendered (measured, deployed body)** | why |
|---|---|---|---|
| 1 | `do you have ABC-1.2MM in stock` | `…so I couldn't narrow by **1.2MM**.` | the "inside a code" guard rejected `[0-9A-Za-z.]` before the digits, and a code separator is none of those — `/[0-9A-Za-z.]/.test('-') === false`. A part number was quoted back as the customer's spec |
| 2 | `2m hose thickness 2mm` | `…so I couldn't narrow by **2m**.` | the scan returned the FIRST span whose number matched (index 0), ignoring unit family and which key the span sits next to. A **thickness of 2mm** was reported as `2m` |
| 3 | `2mm thickness 2cm` | `…so I couldn't narrow by **2mm**.` | same mechanism: a coin-flip between two equally-good candidates, rendered as though it were evidence |
| 4 | `do you have 1.2mm pipe for the upstairs bathroom renovation thickness` | `…so I couldn't narrow by **1.2mm**.` | nothing bound that number to *this* key; distance was not consulted at all |

Rows 3 and 4 are mine, not codex's: once the mechanism is "first match wins", the tie and the
far-away span are the same defect wearing different hats, and each needs its own red.

**The replacement is the CRM's own rule, not a new invention.**
`product_spec_search.py:_resolve_quantities` binds a number to the numeric key whose own synonym
sits nearest it, within `_QUANTITY_BINDING_WINDOW = 20` characters, measured in either direction.
n8n cannot see the registry synonyms — they are not on the wire — so the anchor set is the unmet
key's own words (normalised to `[a-z0-9 ]`, whole-word, optional plural, each word ≥ 3 chars, so
`bowl_count` anchors on `bowl`/`bowls`/`count` as well as `bowl count`).

```js
const _WINDOW = 20;
const _isTokChar  = (_c) => !!_c && /[0-9A-Za-z._\/-]/.test(_c);   // '-' '_' '/' do NOT end a token
const _crossesCode = (_s, _e) => { /* expand to the whole token; reject if anything outside the
                                     number and its absorbed unit carries a letter */ };
const _keyAnchors  = (_k) => [ /* {start,end} of every occurrence of the key's own words */ ];
const _numCands    = (_n) => [ /* every guarded span whose numeric value equals _n */ ];
const _pickSpan    = (_cands, _k) => { /* nearest anchor within _WINDOW wins; no anchors -> the
                                          rev-2 unit preference; disagreeing survivors -> null */ };
const _spans = _shown.map(x => _spanFor(x.value, x.key));          // was _spanFor(x.value)
```

Four decisions, each with a mutant that turns it red:

1. **A code separator does not end a token.** `ABC-1.2MM` is one part number. The span is expanded
   to its whole enclosing token over `[0-9A-Za-z._/-]`, and if anything outside the number (and the
   unit already absorbed into the span) carries a letter, it is not a measurement (**m17** → U4-29).
   The same guard is applied to the non-numeric path, where `ABC-STEEL-X` had the identical hole.
2. **Nearest-to-the-key wins, in both directions, capped at the CRM's own 20-character window**
   (**m18** restores rev-2 selection → U4-30 red *with the measured defect text* `narrow by 2m`,
   not merely degraded to a fallback; U4-34 pins the key-after-number direction).
3. **A genuine tie is AMBIGUOUS → the fallback.** Where the CRM keeps the first of two equal
   distances, this does not: guessing is what produced both defects above, and *"…so I couldn't
   narrow by it."* is already an approved outcome (plan §5.1). Spans that are textually identical
   are not a tie — there is nothing to choose (**m19** → U4-31).
4. **No key word in the sentence at all ⇒ no proximity information ⇒ the rev-2 rule still
   governs** (prefer the unit-carrying span, then require the survivors to agree). This is the
   common real shape — the CRM resolves a key out of `free_terms` that the customer never typed —
   and rev 3 deliberately does **not** make it silent (**m12**, re-anchored, → U4-33).

**Rev 2's proven behaviour is unchanged**, re-asserted rather than assumed: `thickness 1.0mm` →
`1.0mm` (the exec-12311930 string), `1.2 mm` → the spaced form as typed, a bare `1.2` → bare, a
value absent from the text → the fallback, `[object Object]` unreachable, one line only.

#### The harness finding this produced, which is worth more than the fix

**Mutant m15 (drop the preceding-character guard) SURVIVED the first rev-3 run.** Not robustness —
rev 3's `_crossesCode` independently rejects both of that guard's fixtures (`srtwc1.2ab`,
`SRT332-GM`), so two mechanisms now suppress one symptom and U4-25/U4-28 stopped being evidence for
either. That is **LESSONS §64 exactly**, arriving from the direction nobody watches: not a change
being silently reverted, but a *new* guard silently making an *old* guard's test vacuous. The fix
is a fixture only the old guard can pass — a dotted model number (`1.2.3` carries no letters, so
the separator guard cannot see it, and only the preceding `.` stops `3` being quoted back) — added
as **U4-35**, on which m15 goes red. The mutation gate found it; no review would have.

The forward-compat note stands: when the CRM ships **C-2** (`unrecognized_terms`) that is a
different statement and gets its own wording. The **CRM ask** that rev 1 filed alongside C-2 (send
the unit, or the customer's own span) is now **nice-to-have, not load-bearing** — n8n already has
the customer's span locally and no longer needs the CRM to send one.

### Shape, measured not guessed

`spec_unmet` is a list of **objects** `{key, value}` (`product_spec_search.py`'s `unmet`, computed
over `asked` = `extracted_specs` **+** the registry resolution of `free_terms` — which is why N-0
is what makes N-2 ever fire). **UAC SR.md's `spec_unmet: ["thickness=1.2"]` is a placeholder**;
the wire shape is objects. The block reads both, plus junk, and can never render `[object Object]`.

Guards, all with no-op assertions against the pre-fix body: answered happy path only
(`!isEscalateBranch && includeResponse && !manualResponse && message_type==='business_query' &&
last_result_set.length > 0`); `spec_unmet` empty/absent/null/not-an-array → byte-identical;
non-empty but unnameable → byte-identical; capped at 3 keys; a **boolean** value is not quoted back
("couldn't narrow by true" is worse than silence).

### One honest limit (the other one was fixed in rev 2)

- **`unrecognized_terms` (C-2) is not wired.** It is a different statement ("we could not map this
  word to a key at all") from "recorded nowhere", so it gets its own wording when it lands rather
  than being folded into this sentence today.
- ~~**No unit.**~~ Rev 1's "the wire has no unit, so the line says *narrow by 1.2*" is **fixed** —
  see the rev-2 block above. It was never a limit of the *information available*, only of where I
  looked for it: the customer's own sentence was reachable in this workflow the whole time (N-0
  reads it two nodes upstream). Worth keeping as a note to self — *"the wire doesn't carry it" is
  not the same claim as "we don't have it"*.

### Interaction checked, not assumed

`crossdomain-compose` sits directly downstream and, on a total-miss turn, **inserts** its block at
the earliest of five markers (`Related products:`, `Try:`, `Did you mean`, `Here are the closest
matches:`, `Would you like me to escalate`). The N-2 line deliberately contains **none** of them, so
it cannot move where that block lands (probe U4-6). Every N-2/N-3 case also asserts the reply
carries no *other* section's marker at all (LESSONS §68 — a renderer suite that only checks for
presence cannot see an intruder).

---

## 3b. `compile-current-state` — N-1a, the "Matched on" line (SR-1b, rev 4)

**One additive IIFE**, spliced at the same anchor as N-2 and immediately **above** it, so the
emitted order — and therefore the customer's reading order — is:

```
<product rows>            (central-exchange)
_Matched on: bowl count._ (N-1a  ← new)
thickness isn't recorded for these products, so I couldn't narrow by 1.2mm.   (N-2)
P/S: if the spec you're after isn't shown above …                             (friendly-domain)
```

What matched, then what could not be matched, then the generic tip. `build-ccs.js` gets one new
splice, asserted-unique like the others; nothing else in the builder moved.

### The rule, and where each half of it comes from

| rule | source |
|---|---|
| union `display.matched_specs` across the answer's spec rows | plan §SR-1b |
| dedup, **first-seen order** (row order = the ranker's order) | plan §SR-1b |
| humanise `snake_case` → `snake case` | plan §SR-1b |
| **`free_terms` is NEVER rendered as a key**; if it is the ONLY match → *"Matched on your description."* | plan §SR-1b |
| **zero spec keys in the answer → NO line, byte-identical output** | plan §SR-1b (the no-op guarantee) |
| KEY NAMES ONLY — no values, none are on the wire until CRM **C-3** | plan §SR-1b + measured, below |

### The wire, measured — and why v1 cannot print values

`references.py:_emit_spec_matches` builds each spec row as
`display: {product_name, via_token, class, matched_specs, is_discontinued}` where `matched_specs`
is copied from `product_spec_search.py:732`'s `sorted(set(matched))` — **a list of registry KEY
names**. No spec VALUE appears anywhere in that row. Rendering *"double bowl"* from `bowl_count`
would be fabricating the exact class of data this whole change exists to stop fabricating, so v1
prints keys and the upgrade point is marked in the body:

```
// ── C-3 UPGRADE POINT (values) ─────────────────────────────────────────────
```

— one expression changes; the union/dedup/order, the `free_terms` exclusion, the description
fallback and the no-op guarantee all stay.

Frozen evidence, not inference: `baselines/SR-B1.json` → `["bowl_count","free_terms"]` (×5 rows),
`baselines/SR-B4-wallhung.json` → `["free_terms","mounting"]` (×5).

### Scope: the ANSWER's spec rows, joined the same way N-3 joins them

Rows are collected from exactly the two places `_emit_spec_matches` writes — `resolutions[].matches`
(the OR/normal path) and `intersection` (its AND branch) — then filtered to
`match_tier === 'spec_search'` **and** joined by uuid/code to
`disallowed-entity-gate.compatible_entities`, i.e. the list the customer was actually shown. A spec
row that never reached the customer cannot describe their answer (probe **U6-17**, byte-identical).

### Three findings the reviewer should weigh

1. 🔴 **`matched_specs` means "keys that scored", not "keys the customer asked about" — a CRM-side
   honesty limit I did NOT paper over.** `product_spec_search.py:695-702` appends a
   **house-preference** key (any registry row carrying `value_weights`) to `matched_specs`
   *precisely when the customer did not state it* — the `if key in stated: continue` branch. So a
   standing "our own brand first" preference landing on its own products can put **`brand`** in a
   line that reads as *"here is what your words matched"*. Neither frozen baseline shows it (the
   Cabana/Bravat rows do not hold the preferred value), and the wire does not carry which keys are
   house preferences, so a filter cannot be written from the n8n side today. Per the plan's "rules
   exactly as stated" I rendered what SR-1b specifies and made the seam explicit: `_MACHINERY_KEYS`
   is the single place an exclusion goes, named in the hunk comment. **Decision needed:** either
   CRM marks preference-derived keys on the row (a C-3 rider), or SR-1b accepts that a boosted
   brand can be announced as a match.
2. **N-1a invalidated nine passing N-2/N-3 assertions, and they were re-pointed rather than
   deleted** (LESSONS §73 rule 1 — when you widen what something does, re-read the assertions that
   *pass*). U4-7 (×4), U4-15 (×3), U5-5 and U5-7 compared the **whole output** against the pre-SR
   body on fixtures that carry spec rows in the answer — which is exactly where N-1a is now
   supposed to add a line. Their claim was always *"N-2 rendered nothing here"*, and that claim
   survives; the whole-object comparison does not. They now subtract the **exact** string
   `\n\n_Matched on: bowl count._` and **throw unless it appears exactly once**, so a malformed or
   duplicated N-1a line still turns them red instead of being swallowed. N-1a's own no-op legs stay
   byte-exact in SR-U6, where no line may appear at all.
3. **The obvious second guard was deliberately not written, because it could not go red.** The
   first draft carried `_sawSpecRow` ("was there any spec row?") *beside* the real gate
   (`_keys.length`). With no spec row there are no keys, so the flag could never change an outcome
   — an equivalent mutant by construction, and scoring it would have been a lie about the assertion
   set (LESSONS §66, the same call the N-2 block records for `_unmet.length === 0`). One gate:
   `if (!_keys.length) return;`. Mutant **m21** proves it is load-bearing.

### Two smaller mechanical notes

- **`_specRes`, not `_re`.** N-2 already binds `$('resolve-entity')` to `_re` after the identical
  three-line `answered` guard. Reusing the name made mutation anchor **m8** ambiguous — the S9
  counter VOIDed it (the guard working, but a suite that cannot mutate N-2 is not a suite). Renamed;
  m8 is back to exactly one occurrence and CAUGHT.
- **Strings only, never `String(_k)`.** Probe **U6-14** caught an object entry in `matched_specs`
  rendering as the literal `[object Object]` inside a customer-facing sentence — the same failure
  the N-2 block guards against. Non-string entries are now skipped, not coerced.

### No new by-name read

N-1a reads `$('resolve-entity')` and `$('disallowed-entity-gate')`, both already read by this node,
both inside `try/catch` degrading to "no line". It adds **no** new node reference, no new upstream
dependency and no new promote-time graph check beyond those already listed in §5.

---

## 4. Evidence

`tests/offline/spec-answer-honesty/` — **rev 4:** `node probe.js` → **134 passed, 0 failed**
(D1 reports `DEPLOYED (sha 82707a95a7c6)`, i.e. the suite's bytes ARE the clone's bytes);
`bash mutate.sh` → **22 caught, 0 survived, 1 VOID (the intentional stale-anchor selftest)**.
(Rev 3 was 108/0 and 19 caught at `DEPLOYED (sha 7959776fa7ce)`.)

**Rev 4's RED record (§0 S9), taken against the DEPLOYED rev-3 body before a line was written.**
The 23 new SR-U6 assertions were run with `OFFLINE_NODES_DIR` pointed at a scratch copy of the
clone's **exported rev-3 bytes** (sha `7959776fa7ce`, the body the clone was actually running):
**14 FAILED** — U6-1, 2, 5, 6, 9, 10, 11, 12, 13, 14, 19, 20, 21, 23. That is every assertion that
claims the line exists, is unique, is ordered, is deduped or coexists with N-2.

The other **9 passed pre-fix and are labelled `[BOUND]`, not evidence for the change** (LESSONS
§66): U6-3, U6-4, U6-7, U6-8 and U6-22 are negative assertions that pass trivially when no line
exists at all, and U6-15..U6-18 are the byte-identical no-op legs, which must pass on both sides —
that is their entire point. Each of them is nevertheless killed by a named mutant post-fix
(m20 kills U6-3, m21 kills U6-15..U6-18, m22 kills U6-5), so none is a green that cannot fail.

Two of the 14 were red for a reason worth recording: **U6-14** went red again *after* the first
build, against my own code — an object entry in `matched_specs` rendered `[object Object]` — and
**U4-7/U4-15/U5-5/U5-7 (9 assertions)** went red because N-1a legitimately changed their fixtures'
output. Both are in §3b; neither was resolved by weakening an assertion.

**Mutant numbering, so a tester reading SR.md is not left guessing:** SR.md's SR-1b table names the
three new mutants `m19`/`m20`/`m21`, but **`m19` was already taken** by rev 3's ambiguity-guard
mutant. They ship as **m20 (SR.md m19 — free_terms as a key)**, **m21 (SR.md m20 — the zero-key
guard)**, **m22 (SR.md m21 — the dedup)**, in the same order, and `mutate.sh` says so at the
splice. Each was confirmed to kill its *intended* SR-U6 assertion, not merely to turn the suite
red somewhere: m20 → U6-3, m21 → U6-15/16/17/18, m22 → U6-5.

**Rev 3's RED record (§0 S9), taken against the DEPLOYED rev-2 body before a line was changed:**
the four new behavioural assertions **U4-29, U4-30, U4-31, U4-32 all FAILED** (`103 passed,
4 failed`, with D1 confirming `DEPLOYED (sha e3b844c6cb67)` in the same run, so the RED was
measured against the bytes the clone was actually running — not against a local file). The strings
rev 2 produced are recorded verbatim in §3's rev-3 table, so the reviewer can see what a customer
would have read rather than only that an assertion moved. **U4-33 and U4-34 passed pre-fix and are
labelled `[PRESERVE]`** — they pin behaviour rev 3 must not break, and are not counted as evidence
for the fix (LESSONS §66). **U4-35 exists only because mutant m15 survived** — see §3.

Rev 2's own RED record stands unchanged: the 18 new/changed U4 assertions were run against the
**deployed rev-1 body first** and **13 of them failed** (`U4-1, 8, 12, 16, 17, 18, 19-object, 20,
21, 22, 25, 26, 27`, plus `U4-28`), each separately killed by one of mutants **m11–m16**.

> Two of the new assertions (**U4-23** boolean, **U4-24** bare number) already passed against the
> rev-1 body — they pin behaviour rev 2 must **preserve**, not behaviour it adds. Labelled here
> rather than counted as evidence for the fix (LESSONS §66).

| unit | covers |
|---|---|
| U1 (18) | N-0 builder — adjacency, per-word code filter incl. U+2212 paste form, dimensions kept, repeated words kept, additive, **and the customer-vs-`user_goal` discriminator** |
| U2 (24) | degenerate inputs render valid JSON; the other 8 fields byte-identical on every fixture; key-set delta exactly zero; ASCII; no trailing whitespace |
| U3 (9) | N-3 predicate on the real body, incl. two byte-identical **no-op** bounds |
| U4 (46) | N-2 wording, position, grammar, shape tolerance, six no-op bounds — **plus the rev-3 span-SELECTION rule** (code separator, nearest-key proximity in both directions, tie -> fallback, far-span -> fallback, no-anchor unit preference, longer-number fragment) and **the rev-2 customer-span rule**: unit-attached and spaced forms as typed, bare number, absent value, missing/empty/boolean/object values, `tf-message` not executed, code-embedded digits (two distinct boundary guards), unit-span precedence, non-numeric verbatim-vs-normalised, one line only, deduped spans |
| U5 (7) | N-3 does not over-suppress; the legacy-arm dead-code proof |
| U6 (23) ⭐ **rev 4** | N-1a — the line renders exactly once, italic, humanised; `free_terms` never a key; description fallback; dedup across rows; first-seen order; 3-key grammar; junk entries never render `null`/`[object Object]`; **five byte-identical no-op legs** (code turn, absent/empty/non-array/blank `matched_specs`, rows-not-in-answer, nothing-shown); SR-10 coexistence with N-2 + the read order; SR-4 interaction (a genuine code miss still speaks) |
| D (4) | builders are deterministic; body parses; **deployment gate with four outcomes** (rev 3's sha is now a named SUPERSEDED body, so "not yet PUT" never reads as "someone edited the node") |

### Two harness findings the reviewer should weigh

1. **The mutation gate caught a wrong-object bug in the probe itself.** The first cut asserted N-0
   against the `msg-term.js` **module** instead of the **built body**, so five mutants that
   genuinely broke the shipped expression came back SURVIVED. Sound assertions, wrong object
   (LESSONS §63) — inside the instrument built to prove assertions can fail (§72). Built artifacts
   now load through `readBuilt()`, which honours `OFFLINE_NODES_DIR`.
2. **A surviving mutant taught a missing assertion, and the anchor counter was line-based.** m4
   survived because every no-op fixture returned at the first guard, so nothing exercised the
   load-bearing `_named.length === 0` one; **U4-15** was added. Separately, `grep -Fo` cannot count
   a multi-line anchor, so m8 voided for the wrong reason — the S9 counter is now a python
   substring count. Both were found by the gate, not by review.

### What is NOT proven

- **No clone execution was run for rev 4 either** — same seat boundary as revs 2 and 3. **The
  "Matched on" line has never been rendered by the clone**, only by the deployed bytes running
  offline against synthetic resolver envelopes shaped from the frozen baselines. SR-10, SR-11 and
  SR-12 are the cases that close this: SR-11's key set in particular must be **recorded verbatim**
  rather than predicted — I do not know which keys the wall-hung phrase scores today, and finding
  a house-preference key (finding §3b.1) in that reply is a REVIEW trigger, not a pass.
- **No clone execution was run for rev 2 or rev 3** — that is the tester's seat. Both revisions'
  claims are offline plus static verification of the deployed bytes. **Neither the rev-2 nor the
  rev-3 line has ever been rendered by the clone.** SR-2 must be re-run against `48aaa6fd` and the
  N-2 line re-read verbatim at the customer boundary (expected: `…so I couldn't narrow by 1.0mm.`
  for the 1.0mm turn), and SR-4/SR-5 — the cases whose message carries a product CODE with digits —
  read closely, since rev 3's whole job is that no code fragment and no distant number can reach
  that sentence.
- **The two rev-3 defects were reproduced OFFLINE against the deployed body, not on the clone.**
  That is stronger than a code reading (the wrong strings were rendered, end to end, by the bytes
  the clone was running) and weaker than an execution (the CRM never emitted `spec_unmet` for those
  synthetic messages). Read it as: the renderer provably did the wrong thing with that input; that
  *this exact input reaches the renderer in the wild* is not claimed.
- ~~**N-3's reachability**~~ — **settled by the tester**: exec `12308336`, see the corrected §2
  table. Rev-1's hedge here is withdrawn.
- **The CRM half of N-0** is read from source (`product_spec_search.py`, `references.py` on `main`),
  not from a running service. Pydantic ignores unknown fields, so a not-yet-deployed endpoint would
  accept this body and silently do nothing (LESSONS §70). **SR-1/SR-2 going green on the clone is
  what closes that gap** — `matched_specs` naming a thickness key, or `spec_unmet` naming it. Per
  SR.md, silence is a FAIL.

---

## 5. Promote target — build as LIVE + these hunks, never by copying the clone

⚠️ **`compile-current-state` on the clone is STALE vs live.** Live carries work the clone does not:

- the `promo-picker` arm and the `access-level-choice-message` **tier-ask** arm feeding
  `last_result_set` / `selection_context`;
- a **`_pickerReported` clause inside the very `missResolutions` filter N-3 modifies** ("one miss,
  one voice", 2026-08-11);
- a reworded CS-member picker line.

The hunks are additive and anchor on lines present in **both** bodies, so they re-apply cleanly —
but per LESSONS §57 the promote target must be **live's body + these hunks**, proven by
`diff live→target == only these hunks`. Copying the clone body would REGRESS live by deleting the
promo-picker and tier-ask arms.

Also, per LESSONS §65: **diff the clone's inbound edges for these two nodes against live's** before
promoting. And note the node NAME differs — clone `resolve-entity-http`, live `resolve-entity`
(the clone's `resolve-entity` is a NoOp). Target live by NAME (§58c).

**Rev 2 adds one live-specific check to that list.** The N-2 block now reads `$('tf-message')` —
a **new BY-NAME read** from `compile-current-state`, which had none before (its existing reads are
`disallowed-entity-gate`, `central-exchange`, `resolve-entity`, `validator`, `get-session-vars`,
`escalate-catalog`, `build-suggest-offer`, `build-cs-member-offer`, `build-ideate-reply`,
`access-level-choice-message`, `crossdomain-zeroset`, `sorento-sub-respond-findcontact-respond`,
`Call 'sub-query-reformulator'`). Before promoting, confirm `tf-message` **exists on live and runs
upstream on every path that reaches `compile-current-state`** — it does today (live's own
`resolve-entity` body reads the identical accessor as part of N-0, and `Call
'sub-query-reformulator'.latest_user_message` has always read it), but that is a fact to re-assert
against live's graph, not to inherit from the clone (LESSONS §65: a deleted upstream node changes
what a read means without changing the node you tested). The try/catch means the failure mode is
the fallback wording, never a node error.

**Rev 4 adds nothing to that list either, and one thing to re-check.** N-1a introduces no new
by-name read (`resolve-entity` and `disallowed-entity-gate` are both already read here) and no new
upstream dependency. The re-check is the same shape as rev 3's: the **friendly-domain anchor must
occur exactly once in LIVE's body** — the N-1a and N-2 splices now both key on it, and live carries
arms the clone does not. `build-ccs.js` asserts that uniqueness on every build, so building the
promote target the same way (live's body + hunks) inherits the guard instead of re-deriving it.
Note also that on live the N-1a line lands **above** the promo-picker/tier-ask arms' own appends
only if those append after the friendly-domain block — confirm the emitted order on live's body
before promoting, since the clone cannot show it.

**Rev 3 adds nothing to that list.** It introduces no new by-name read, no new node reference and
no new upstream dependency — every rev-3 line lives inside the same self-contained N-2 IIFE and
reads only `_rawMsg` (already there) and the unmet key (already there). The promote target is
therefore unchanged in shape: live's body + the same two hunks, with the N-2 hunk now carrying the
rev-3 span selection. The one thing to re-check at promote time is the same as before — that the
`missResolutions` filter and the friendly-domain anchor still occur exactly once in **live's**
body, since live carries the `_pickerReported` clause the clone does not.

---

## 6. Files

| path | role |
|---|---|
| `tests/offline/spec-shapeA/free-terms.js` | code-shape classifier — **single source of truth, reused not re-typed**, by both N-0 and N-3 |
| `tests/offline/spec-answer-honesty/msg-term.js` | N-0 message-term + composed `free_terms` source |
| `tests/offline/spec-answer-honesty/ccs-hunks.js` | N-2 + N-3 + **N-1a** hunks, single source of truth |
| `tests/offline/spec-answer-honesty/build-body.js` · `build-ccs.js` | deterministic builders (anchors asserted unique, no-op splice refused) |
| `tests/offline/spec-answer-honesty/ccs-harness.js` | runs the real node body with stubbed `$`/`$input`/`$execution`; **rev 2** adds an opt-in `rawMessage` (stubs `tf-message`) — omitted by default so fixtures that do not opt in exercise the reader's try/catch against a node that did not run |
| `tests/offline/spec-answer-honesty/probe.js` | SR-U1..**U6** + D gates; **rev 4** adds `afterLessN1A()` — subtracts the one line N-1a may add from the nine N-2/N-3 whole-object comparisons, and throws unless it appears exactly once |
| `tests/offline/spec-answer-honesty/mutate.sh` | S9 mutation gate, **22** mutants (rev 4 adds m20 free_terms-as-key / m21 zero-key guard / m22 dedup — SR.md calls them m19–m21; `m19` was already rev 3's ambiguity mutant) + stale-anchor selftest |
| `tests/offline/spec-answer-honesty/*.before.*` / `*.after.*` | frozen bytes both sides (§69) |
| `tests/offline/spec-answer-honesty/baselines/` | SR-B1..B4 verbatim replies + resolver envelope facts |
| `tests/manifests/spec-answer-honesty/README.md` | snapshot + two-leaf rollback |
