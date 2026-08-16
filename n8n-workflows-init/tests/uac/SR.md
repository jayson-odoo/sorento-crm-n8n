# SR — spec-answer honesty (spec-answer-honesty-plan.md)

§0 (`00-SAFETY-always-read.md`) applies to every case. Clone `txiPzSxy3Pclsz6v`, uac mode,
`previous_conversation_state: {}` on every case (uac-mode prod-session landmine). Assert at the
CUSTOMER BOUNDARY by **rendered string** (LESSONS §68: assert the WHOLE reply — every defect in
this family is a footer/suffix that a partial assertion would miss), per-node runData never
execution status.

**Scope: SR-1 only** (spine: `resolve-entity-http` body + `compile-current-state`). SR-2 cases are
NOT in this family — see the plan's §2 blast-radius gate.

⚠️ The clone carries other workstreams (container-status via the `sub-get-results CS-BUILD` fork,
human-intervened-timeout). Snapshot into `tests/manifests/spec-answer-honesty/README.md` before the
edit so this slice stays independently reversible.

## Baselines to freeze BEFORE the build (they are the RED)

Executions already captured on the pre-SR clone — re-fetch and freeze the verbatim replies as
`*.before.txt` fixtures rather than re-running:

| id | input | pre-SR observed |
|---|---|---|
| SR-B1 | "double bowl kitchen sink with thickness 1.2mm" | exec **`12303472`** — 5 rows; `free_terms=["double bowl kitchen sink"]`; `matched_specs=["bowl_count","free_terms"]`; `spec_unmet=[]` |
| SR-B2 | same with **1.0mm** | exec `12303548`, 42 s later — rows **MEASURED identical** to SR-B1 (`diff` empty), not inferred. The RED for N-0 |
| SR-B3 | "sorento double bowl kitchen sink with 1.2mm thickness" | 4 junk rows + `Couldn't find these: "double bowl kitchen sink" — not found.` (exec `12303509`) |

## Offline units (`tests/offline/spec-answer-honesty/`, run before any clone write)

| id | unit | assert |
|---|---|---|
| SR-U1 | N-0 free-terms builder | raw message "please get me double bowl kitchen sink with thickness 1.2mm" → ONE joined free term retaining `thickness 1.2mm` adjacency; code-shaped words (`SRTWC286`, `SRT332−GM` U+2212, `CBS212-WH`) excluded per word; descriptive words never dropped |
| SR-U2 | N-0 degenerate inputs | empty message / missing entities / null raw → no throw, body still renders valid JSON; a quote or backslash in the message does not break the rendered JSON |
| SR-U3 | N-3 predicate, real `compile-current-state` body | given a resolve payload with ≥1 `match_tier:"spec_search"` row + a descriptive token whose own resolution has `matches:[]` → `missResolutions` EXCLUDES that token; **and** a payload with zero spec rows → miss rendering byte-identical to today (no-op guarantee) |
| SR-U4 | N-2 suffix builder | ⚠️ the wire shape is `[{key, value}]` OBJECTS (my `["thickness=1.2"]` was a placeholder — coder corrected it): the block must read objects, tolerate the string form and junk, and can never render `[object Object]`. Line appears exactly once, reads as the data-truth form (decision §5.1, never "I couldn't filter"); `spec_unmet:[]`/absent → no line, byte-identical |
| SR-U4b ⭐ | N-2 quotes the CUSTOMER'S OWN SPAN (rev 2, raised by the SR-2 run) | The wire value is a normalised number with **no unit** (`1.0` arrives as `1`), so rendering it bare produced *"…so I couldn't narrow by 1."* for a customer who typed **1.0mm** — a truncation AND a wrong number. Assert: value `1.0` + raw message `1.0mm` → renders **`1.0mm`**; value `1.2` + raw `1.2 mm` → the **spaced form as typed**; value present but **absent from the raw text** → fallback *"…so I couldn't narrow by it."*; value **missing/empty/boolean/object** → same fallback; **multiple unmet keys → ONE line**, spans deduped, never a partial list. Never a bare normalised number, never an invented unit, never `by .` or `[object Object]`. Source is `tf-message` (the customer's words), guarded so a non-executed node degrades to the fallback, never a node error. ~~Known bound: renders "narrow by 1.2", not "1.2mm"~~ — **withdrawn**: the customer's own sentence was reachable in the spine all along.<br><br>**REV 3 (2026-08-13, /codex-review §H) — WHICH span, not just any span.** Two selection defects, both reproduced mechanically against the deployed rev-2 body before a line changed: (a) the "inside a code" guard rejected `[0-9A-Za-z.]` but **not a code separator**, so `"do you have ABC-1.2MM in stock"` rendered *"couldn't narrow by 1.2MM"* — a part number quoted back as the customer's spec; (b) the scan returned the **first** number that matched, so `"2m hose thickness 2mm"` rendered *"couldn't narrow by 2m"* for a **thickness of 2mm** — a different unit family, stated as the customer's own. Assert additionally: a span across a code separator (`-`, `_`, `/`) is **never** quoted; the span **nearest the unmet key's own word** wins (the CRM's own rule — `_resolve_quantities`, `_QUANTITY_BINDING_WINDOW = 20`, measured in **both** directions); a genuine **tie** (two equally-near, disagreeing spans) and a span with **no key word within the window** both fall back to *"…so I couldn't narrow by it."*; with **no key word in the sentence at all** the rev-2 unit-preference still governs. Rev-2's proven behaviour must not move: `thickness 1.0mm` → `1.0mm`, `1.2 mm` → the spaced form, a value absent from the text → fallback |
| SR-U5 | N-3 must not over-suppress | a genuine miss on a DIFFERENT token (e.g. an unknown code alongside a spec answer) still renders its "not found" line — the predicate answers only the raws that fed `free_terms` |

`mutate.sh` (§0 S9) breaks each: (m1) drop the join → SR-U1 red; (m2) remove the code filter → SR-U1
red; (m3) key N-3 on token equality instead of outcome → SR-U3 red; (m4) always-on suffix → SR-U4
red; (m5) suppress all misses → SR-U5 red. Rev 2 adds six for SR-U4b: (m11) print the normalised
wire value → the `1.0mm` case red; (m12) stop preferring the unit-carrying span → the
precedence case red; (m13) quote a partial value list → the mixed-span case red; (m14) drop the
boolean guard → red on a fixture whose message contains the word "true"; (m15) drop the
preceding-character guard → red; (m16) fabricate `mm` when no
span is found → the absent-value case red. Rev 3 adds three, one per guard (a "proximity/ambiguity"
mutant would have proved only one of them): (m17) drop the code-separator guard → the `ABC-1.2MM`
case red; (m18) restore rev-2 selection (first match, unit-preferring) → the `2m hose thickness 2mm`
case red **with the measured defect text**, not merely degraded to the fallback; (m19) drop the
ambiguity guard → the tie case red. No green counts before its red.

> **m15 SURVIVED on the first rev-3 run, and that was the harness talking, not the code.** Rev 3's
> code-separator guard independently rejects `SRT332-GM` and `srtwc1.2ab`, so the preceding-character
> guard's own fixtures stopped discriminating it — two mechanisms suppressing one symptom, the exact
> shape LESSONS §64 says makes a test stop being evidence for either. The guard's own shape is a
> dotted model number (`1.2.3` carries no letters, so the separator guard cannot see it); that is
> **U4-35**, and m15 goes red on it. A surviving mutant is a claim about the fixtures first.

## Clone cases

| id | act | assert (whole reply) |
|---|---|---|
| SR-1 thickness reaches the ranker | "double bowl kitchen sink with thickness 1.2mm" | `resolve-entity-http` INPUT free_terms contains `thickness` and `1.2mm`; response `matched_specs` includes a thickness key **or** `spec_unmet`/`unrecognized_terms` names it — silence is a FAIL |
| SR-2 the number changes the answer | run SR-1, then the same phrase with **1.0mm** | either the row sets differ, or both replies carry the N-2 line saying thickness could not be filtered. Identical rows with NO explanation = FAIL (this is SR-B2's RED) |
| SR-3 no contradiction | "do you have wall hung basin" | spec rows present AND the reply contains none of `Couldn't find`, `did you mean`, `Multiple matches found`, escalation offer |
| SR-4 genuine miss survives | "wall hung basin and SRTZZ999" (real descriptive + nonexistent code) | spec answer renders AND the nonexistent code still gets its miss line — N-3 suppressed only the answered raws |
| SR-9 N-3 reachability ⚠️ | attempt to produce the shape N-3 guards: spec rows present AND a per-raw miss surviving on the same turn | **May be UNREACHABLE today** (coder finding): on the AND path the CRM replaces `intersection` and leaves only the query-keyed resolution — no per-raw miss to suppress; on the OR path spec search does not run at all. It becomes reachable when CRM **C-1** lands. If you cannot construct it, say so plainly: **N-3 then ships on OFFLINE evidence only (SR-U3/U5)** — do NOT infer reachability from a green elsewhere, and do not weaken SR-U3 to make this go away |
| SR-5 code parity | "check stock SRTWC286" | resolve-entity-http body free_terms excludes the code; reply node-for-node vs the pre-SR baseline |
| SR-6 nonsense unchanged 🔴 **LOAD-BEARING** | "purple levitating sink" | N-0 adds filler words that count as `evidence`, which is what sets `floor_missed` — so this case can genuinely flip from "no rows" to "rows". Do NOT sign it off as unchanged without comparing row COUNT and CODES against the baseline. Rows appearing where none did = FAIL (the change would be answering nonsense) |
| SR-7 SA regression | re-run SA-1's input ("wall hung basin 600mm") | still answers with spec rows; SA family's assertions still hold |
| SR-8 brand junk (observational, C-1 pending) | "sorento double bowl kitchen sink with 1.2mm thickness" | record verbatim. Expected UNCHANGED from SR-B3 (spec search cannot run on the OR path). Documents the gap; does NOT gate this slice |

> **SR-9 is SETTLED, 2026-08-13: REACHABLE.** The tester found the third CRM path the coder's
> reachability table did not enumerate — a multi-token query where AND yields zero intersection and
> the CRM itself falls back to OR (`fallback_match_mode:"or"`), keeping the per-token misses AND
> appending the query-keyed `spec_search` resolution. Reproduced live on the clone by **SR-4's own
> input** ("wall hung basin and SRTZZ999"), exec `12308336`. N-3 does **not** ship on offline
> evidence alone; the "may be unreachable" hedge in the row above is withdrawn.

> **Re-run required after clone rev `48aaa6fd` (rev 3).** The N-2 line's *value* selection changed
> again — only the value, not the wording, the position or N-3. SR-2's 1.0mm turn must still render
> `…so I couldn't narrow by 1.0mm.` verbatim (rev 3 must not regress rev 2), and any turn whose
> message carries a product CODE with digits — SR-4 ("wall hung basin and SRTZZ999"), SR-5
> ("check stock SRTWC286") — is the one to read closely: rev 3's job is that no code fragment and
> no distant number can appear in that sentence. Read it at the customer boundary, verbatim.

> **Re-run required after clone rev `8ed4e464` (rev 2).** SR-2's N-2 line changed: the 1.0mm turn
> must now render `…so I couldn't narrow by 1.0mm.`, not `…by 1.` Read it **verbatim** at the
> customer boundary — that exact string is the whole point of the revision. SR-1/SR-3..SR-8 are
> expected unchanged (the rev-2 hunk touches only the value inside the N-2 line), but SR-4's reply
> should be re-read too, since it is the one case that also carries a genuine miss line.

Egress: zero per §0 — `test:egress:{run_id}` all `would_*`, sink-delta with payload attribution
(never LLEN-equality).

## SR-1b — the "Matched on" line (rev 4, plan §SR-1b; user go 2026-08-13)

Offline unit + clone cases. Wire carries KEY NAMES only until CRM C-3; never render values v1.

| id | unit/case | assert |
|---|---|---|
| SR-U6 | line builder, real body | spec rows with `matched_specs:["bowl_count","free_terms"]` → exactly `_Matched on: bowl count._` once, after the product list, before the P/S footer; `free_terms` never rendered as a key; only-`free_terms` → `_Matched on your description._`; zero spec rows → NO line, byte-identical (the no-op guarantee); keys deduped across rows, first-seen order; unknown/snake keys humanised, never raw `bowl_count` |
| SR-10 | clone: "double bowl kitchen sink with thickness 1.2mm" | reply carries the product list + `Matched on: bowl count` + the N-2 thickness line — all three coexist, each exactly once |
| SR-11 | clone: "do you have wall hung basin" | spec answer + a Matched-on line (key set as observed — record verbatim); still none of the SR-3 banned strings |
| SR-12 | clone: "check stock SRTWC286" (code turn) | NO Matched-on line — the no-op guarantee at the boundary |

`mutate.sh`: (m20) render `free_terms` as a key → SR-U6 red; (m21) drop the zero-spec guard → SR-U6
no-op leg red; (m22) render per-row duplicates → dedup assertion red. (Renumbered 2026-08-13:
m19 was already rev 3's ambiguity-guard mutant; shipped as m20/m21/m22 in the same order.)

## Not covered here

- SR-2 (`matched_specs` per row, spec values, attribute-relevance selection) — blocked on CRM C-3
  and the get-results fork scoping (plan §2).
- CRM C-1 (OR-path spec reachability) — until it lands, SR-8 stays observational and case B in the
  plan is unfixed.

---

# SR-1c — the raw-text migration (`spec-raw-text-migration`, clone `daa88349`)

Plan: `plans/spec-raw-text-migration-slice-plan.md` · contract authority:
`tests/reviews/pr142-contract-conformance.md` (+ its 2026-08-15 addendum) ·
node-diff: `tests/diffs/spec-raw-text-migration.md`.

**What changed under this family, in one line:** `free_terms` is GONE from the resolve request,
`query` now carries the customer's raw sentence, and the "Matched on" line renders VALUES
filtered by `spec_asked`. So several SR rows below now assert a *different string* than they did
at rev 4 — read the amendments, not the memory of the old expectation.

## ⚠️ Three amendments to rows above — read before re-running them

1. **SR-1** — the assertion moves from *"`resolve-entity-http` INPUT `free_terms` contains
   `thickness` and `1.2mm`"* to *"INPUT **`query`** is the customer's message verbatim, and
   there is **no `free_terms` key at all**"*. A body that still sends `free_terms` is a FAIL,
   not a cosmetic leftover: the CRM UNIONs derived free terms on top of the caller's
   (`product_spec_understanding.py:413-415`), so the half-migrated body ranks on an input
   production has never produced (DEV-3).
2. **SR-5 / SR-12 (code turns)** — the code is **no longer stripped** from what we send; it now
   rides inside `query` and the CRM owns it (`_is_code_shaped` deliberately keeps it in
   `unresolved_tokens`). The reply must still be node-for-node the baseline; only the request
   changed.
3. **SR-11's "unaccountable keys" review trigger is RETIRED.** It existed because
   `matched_specs` can name a HOUSE-PREFERENCE key the customer never stated
   (`product_spec_search.py:1006-1013`). The `spec_asked` intersection now excludes that class
   structurally — a preference only ever applies to an *unstated* key, so it can never be in
   `spec_asked`. Record the key set for interest; it is no longer a hand-review gate.

## Offline units (`tests/offline/spec-answer-honesty/`, run before any clone write)

| id | unit | assert |
|---|---|---|
| SR-U1 ⚠️ **REPURPOSED** | N-0 RETIREMENT proof | the shipped body has no `free_terms` field, the rendered request has no `free_terms` KEY (not merely empty), and the N-0 builder/message-term/classifier sources are ABSENT from the request body — while the classifier is STILL present in `compile-current-state` (N-3 scoping survives). The old U1-1..U1-16 builder assertions are deleted: they described code that no longer ships |
| SR-U7 ⭐ NEW | what `query` sends | verbatim customer message; **NOT** `user_goal` (the discriminator — the fixture's `user_goal` deliberately also contains "thickness 1.2mm"); qualifier words present; `thickness 1.2mm` still contiguous (the CRM binds a number within 20 chars of the key word); a CODE is **not** stripped (inverted vs N-0); **empty raw text sends an EMPTY query** — the STRICT reading: the restatement dies entirely, and on the only turns where a fallback could fire `user_goal` is LLM-invented text feeding the code-token extractor and the spec deriver, so `''` (which derives nothing) is the correct answer for a wordless turn; `user_goal` is absent from the body altogether (U7-11) and `build()` throws rather than emit it; attachment `description` used when text is absent; `tf-message` not executed → the guard absorbs it; the accessor is `raw-message.js`'s single definition and `compile-current-state`'s N-2 span reader carries the SAME bytes |
| SR-U2 ⚠️ **now load-bearing** | degenerate inputs | the pre-migration `query` was a BARE `"{{ … }}"` interpolation — safe for LLM prose, fatal for a customer sentence carrying a quote, a backslash or a newline. Assert nine fixtures render valid JSON, the customer's quotes/backslashes/newlines survive INTACT into `query`, **and a RED-CONTROL that the pre-migration body genuinely breaks on a quoted message** (so the `JSON.stringify` is shown to be doing work). Key-set delta vs pre-SR must be **exactly minus `free_terms`** |
| SR-U8 ⭐ NEW | the `spec_asked` filter, the class VALUE, the three-line humanise | `class` renders as its VALUE never the key name, and **leads** the sentence (`matched_specs` arrives `sorted()`, so first-seen order alone buries it); `class` survives although it is not in `spec_asked` (the UNION) **and** is accepted when it IS (the `understand_phrase` path — never assert class is absent); a house-preference `brand` the customer never stated is NOT announced; **[DEV-1]** a stated `brand` renders VERBATIM — `NO LOGO` never `No Logo`, `SORENTO` never `Sorento`, `American Standard` unchanged — while a non-exempt enum IS humanised (`wall_hung` → `Wall Hung`) and humanising is idempotent on an already-spaced value; numbers stay numbers; lists join; **boolean / object / missing / `specifications: null` (shape-B, CRM F9) drop the key rather than guess**; the VALUE comes from the FIRST in-answer row (ranker order); `spec_asked` absent/empty/bare-string/junk/not-an-array all tolerated |
| SR-U8-21 🔴 **the DEPLOYMENT TELL** | `spec_asked` ABSENT | the line degrades to `_Matched on your description._` (only `class` can survive the filter). Deliberately **not** papered over with a fallback to rev-4's unfiltered sentence — a fallback would make the deployed and undeployed CRM indistinguishable at the customer boundary. **If the tester sees the description form where a qualifier was clearly asked for, the endpoint is not deployed — that is the finding, not a renderer bug.** |
| SR-U6 ⚠️ **rewritten** | the "Matched on" line | now asserts `_Matched on: bowl count: 2._` (VALUE), not `_Matched on: bowl count._`. Dedup, first-seen order, humanised keys, junk-never-rendered, the five byte-identical no-op legs and the SR-10 coexistence/read-order all carry over unchanged |
| SR-U6-23/24/25 ⭐ **[DEV-2]** | the mixed hit+miss turn | a genuine CODE miss speaks **and** the Matched-on line renders on the same reply; the DESCRIPTIVE token stays suppressed; exactly ONE miss is surfaced. Note honestly: U6-24/25 **passed pre-fix** — N-3 already handled this, so they are `[PRESERVE]` assertions that pin DEV-2's requirement, not evidence of a new fix |

`mutate.sh` (§0 S9), **29 mutants, 0 survived, 1 VOID (the intentional stale-anchor selftest)**.
Repointed because their old anchors were deleted with N-0 — a stale anchor would have gone VOID,
which is the guard working but is not coverage: **m1** re-adds `free_terms` beside the raw query
(the half-migration DEV-3 forbids) → SR-U1 red; **m2** drops the JSON escaping → SR-U2 red;
**m9** sources `user_goal` → SR-U7's discriminator red; **m10** (INVERTED, main-session
decision) RE-INTRODUCES a `user_goal` fallback → U7-6/U7-8 red. New for SR-U8: **m20** drops the `spec_asked` filter (one mutant, three defects:
`free_terms` announced, an unstated brand announced, any scored key announced); **m23** reverts to
rev-4 KEY NAMES; **m24** removes the class/brand VERBATIM exemption; **m25** renders the class key
name; **m26** stops the class leading; **m27** coerces an unrenderable value; **m28** drops the
class UNION; **m29** takes the value from the last row instead of the ranker's first.

## Clone cases (uac mode, `previous_conversation_state: {}` on every case)

| id | act | assert (WHOLE reply) |
|---|---|---|
| SR-13 ⭐ | "double bowl kitchen sink with thickness 1.2mm" | `resolve-entity-http` INPUT: `query` == the customer's sentence verbatim, **no `free_terms` key**. Response carries `spec_asked`. Reply carries the product list + `_Matched on: …_` **with a VALUE after each non-class key** + the N-2 thickness line, each exactly once, in that order |
| SR-14 ⭐ [DEV-1] | "do you have wall hung basin" (or whatever phrase the S1/G1 probe shows returns SORENTO rows) | record the Matched-on line VERBATIM. If it names a brand, the spelling must be the catalogue's own (`SORENTO`, `NO LOGO`) — a titlecased `Sorento` is a FAIL. If no brand appears, say so: the exemption is then untested against real data, not proven |
| SR-15 ⭐ [DEV-2] | "wall hung basin and SRTZZ999" (= SR-4's input) | the spec shortlist AND `"SRTZZ999" — not found.` in ONE reply; `wall hung basin` absent from the miss block; exactly one `— not found.` |
| SR-16 ⭐ | "check stock SRTWC286" | `query` carries the code (no longer stripped); **no Matched-on line**; reply node-for-node vs the SR-5 baseline |
| SR-8 (retest) | "sorento double bowl kitchen sink with 1.2mm thickness" | **no longer observational.** D7's `_suppress_brand_prefix_junk` shipped: SORENTOBAG / SORENTO188 / `****NOT USE THIS CODE` must be ABSENT, and the descriptive half must produce a real spec answer. If the junk is still there, the CRM half did not deploy — report, do not adjust the renderer |
| SR-6 (re-run) 🔴 **LOAD-BEARING** | "purple levitating sink" | the whole sentence now reaches the ranker instead of a filtered term list, so the filler-word floor argument changes shape. Compare row COUNT and CODES against the baseline. Rows where none appeared = FAIL |
| SR-2 (re-run) | the 1.0mm / 1.2mm pair | the N-2 line must still read `…so I couldn't narrow by 1.0mm.` verbatim (rev 3 behaviour must not regress), and the two turns must now differ or explain themselves |

## Regression sweep — DEV-3 widened it to the FULL resolve surface

`query` feeds BOTH machines (`_resolve_input` and `derive_search_inputs`), so a raw sentence now
reaches the code-token extractor and `_synthesize_alpha_tokens`, which whitespace-splits the whole
query — a sentence produces many more probe tokens than a restatement did. Re-run, with envelopes
taken from REAL executions (never `tests/cases/*.json` unverified — the stale-fixture rule):
code parity (bare and pasted codes inside a sentence, incl. the U+2212 dash fold), order /
customer / date spot-checks, attachment + `domain_hint`, and an AND-mode multi-token filter.
