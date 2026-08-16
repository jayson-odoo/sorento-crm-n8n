# SA — spec-search shape A wiring (spec-search-shapeA-wiring-plan.md)

> ✅ **STATUS 2026-08-12: ALL CONTRACT PROBES GREEN against the DEPLOYED CRM. Tester unblocked.**
> Clone rev `be62b3a8`. History: first probe round exposed that the catalog writes descriptive
> words INTO product codes (`SRTWB7104-WALL HUNG`) → partial `max_coverage` matches suppressed
> the old zero-match gate on flagship phrases; CRM gate fix `ae3393810` (fires on unanswered
> product-token words, product rows only, no-coverage never fires) deployed with PR #124.
> Post-deploy evidence (`crm-probe-results.json`, `snapshot-{pre,post}-deploy.json`):
> SA-P1 "wall hung basin" → **5 spec_search matches**, prefix-mirroring semantics ✓; SA-P2
> inertness parity ✓; SA-P4 floor ✓; SA-P3 cabana-class still suppressed (documented gap,
> crm-ask item 4); byte-parity pre-vs-post deploy IDENTICAL on no-require bodies AND the
> counterweight (code query + spec_fallback still suppressed — full coverage).
>
> Two contract facts the fix adds — cases below inherit them:
> 1. **REPLACE, never merge — ⚠️ AND-ARM ONLY (scope qualifier added 2026-08-16, reviewer F6).**
>    On the **AND** arm, when the ranker finds candidates they replace the partial intersection
>    (`by_entity_type`/`empty` rebuilt); on a floor miss the code partials stand. SA-1 asserts no
>    code-partial rows alongside spec_search rows **on that arm**.
>    **On the OR arm the CRM APPENDS** — `_emit_spec_matches` adds one new resolution
>    (conformance report §C-1: *"AND shape: `result["intersection"] = spec_matches` — assignment,
>    not extend"* vs *"OR shape: one new resolution is appended"*), and the wire says so
>    explicitly (`fallback_match_mode:"or"`, `fallback_reason:"AND-mode produced zero
>    intersection; switched to OR-mode…"`). So **the renderer CAN see a mixed set**, measured on
>    exec `12597847` (10 code-prefix rows + 5 spec_search rows in one answer).
>    This is the CRM behaving as its own source documents — **not a contract breach, no CRM
>    ticket**. It was carried here as if it were universal because the AND arm was the only one
>    exercised when the fact was written. SR-9 settled the OR shape as REACHABLE on 2026-08-13.
>    n8n-side consequence: the `_Matched on:` line is suppressed entirely on a mixed answer
>    (reviewer F2, shipped in `spec-raw-text-migration` rev 3 — see SR.md §SR-1c).
> 2. **The phrase must stay ONE token.** The gate reads per-token PRODUCT coverage; a
>    words-split token set changes AND semantics entirely. The n8n body builds tokens from
>    entity raws (one entity = one token) — SA-P5/the offline probe pins this invariant; never
>    "improve" the body by splitting the phrase.

§0 (`00-SAFETY-always-read.md`) applies to every case. Drive the TEST clone `txiPzSxy3Pclsz6v` via
the uac runner with `previous_conversation_state: {}` — REQUIRED on every SA case: uac mode
otherwise reads 437264483's stale prod session and a carried entity/roster contaminates the
descriptive turn (the exact class the uac-mode landmine documents). Assert at the CUSTOMER BOUNDARY
(rendered reply / sendmsg payload), per-node runData never execution status. CRM reads against prod
are allowed; the change consumes the LIVE `/references/resolve` contract (spec_fallback live since
crm#105/#106).

**The RED baseline is the family's S9 for the happy path:** run SA-1/SA-3/SA-4's inputs against the
PRE-change clone rev first and record the executions — SA-1 must dead-end (not-found/dym) before
the change; after the change the same input resolves. An SA-1 that was never seen red proves
nothing. Per-assertion mutations live offline in `tests/offline/spec-shapeA/mutate.sh`.

## Contract probes (offline-first, `sorento-coder`, before any clone edit)

Pinned request bodies POSTed to the live CRM read-only (`tests/offline/spec-shapeA/`), responses
saved as fixtures. These find contract mismatches the clone harness is blind to.

| id | body | expect |
|---|---|---|
| SA-P1 | planned body, query+free_terms `["wall hung basin"]`, spec_fallback true | ≥1 match, every one `match_field: "specifications"`, `match_tier: "spec_search"`, uuid present, `resolved`/`ambiguous` mirror prefix semantics (`len==1` / `len>1`) |
| SA-P2 | same body shape for `"SRTWC286"` (code token) | response **field-identical** to the same request WITHOUT the three new fields — the zero-match gate keeps the feature inert on resolving traffic |
| SA-P3 | `"cabana bathtub"` | fallback does NOT fire (`cabana` resolves as promo description) — records the known v1 gap that CRM-ask item 4 (`spec_mode:"always"`) closes |
| SA-P4 | gibberish (`"purple levitating sink"`) | zero candidates / floor missed; `resolutions`/`unresolved_tokens` shape unchanged vs the no-new-fields request |
| SA-P5 | classifier unit: entity raws → free_terms | code-shaped raws excluded, incl. unicode-dash forms (`SRT332−GM` U+2212 — parser folds at its LAST node, but the classifier must not depend on that ordering); plain nouns pass through |

`mutate.sh` (S9): (m1) strip `spec_fallback` from the body → SA-P1 red; (m2) let code-shaped raws
into free_terms → SA-P5 red; (m3) inject a stray field into the SA-P2 comparison → parity check
red. Every probe assertion shown red once before its green counts.

Review round additions (tests/reviews/spec-search-shapeA-wiring.md, both EXECUTED GREEN
2026-08-12):

| id | body | expect |
|---|---|---|
| SA-P6 | partial-coverage phrase ("wall hung basin") with vs without the fields | widened arm (`_product_words_unanswered`) fires: code-partial intersection (13) REPLACED by spec rows (10), zero mixed; §D preconditions recorded — measured `unresolved_tokens: []`, single query-token resolution, 0 alternatives (the dual-render chain's premises are absent in this shape) |
| SA-P7 | SA-P1's body WITHOUT the three fields | zero spec rows anywhere — the executed RED at the contract boundary |

## ⚠️ Coverage honesty (review finding — six PASSes are NOT six units of coverage)

- **SA-4 and SA-5 never exercised `spec_fallback`** — their turns floor-missed / rode code
  partials. Their documented assertions pass, but the attachment-domain × spec-answer
  interaction is ABSENT COVERAGE, not proven behaviour.
- SA-1 is the family's only end-to-end feature demonstration and covers the **zero-match arm**
  only. The widened arm end-to-end is SA-7 (below).
- Correction to SA-4/SA-5's recorded root cause: "trgm alternatives made zero-match false" is
  pre-`ae3393810` reasoning; the observation (no spec rows) stands, the mechanism doesn't —
  SA-P1 returns 5 spec matches for the same phrase; the difference is request shape, not phrase.

## SA-7 — widened arm at the customer boundary (review §D, required before promote)

Clone, uac mode, `previous_conversation_state: {}`:

| id | act | assert |
|---|---|---|
| SA-7 | "do you have wall hung basin" (bare phrase, product domain — mirrors SA-P6's contract shape through the real parser) | resolve-entity-http runData: widened arm fired (intersection = spec_search rows only, no code partials); **the WHOLE reply** (LESSONS §68): spec-product list present, and NONE of: "Couldn't find", "did you mean", "Multiple matches found", an escalation offer. If any appear → §D reproduced → fix is the outcome-keyed predicate (any `spec_search` row ⇒ contributing raws answered) in compile-current-state, scoped deliberately as a second node |

## Clone cases (uac mode, `sorento-tester`)

| id | arrange | act | assert |
|---|---|---|---|
| SA-1 descriptive resolves | empty state | "wall hung basin 600mm" | resolve-entity runData: ≥1 `match_tier:"spec_search"` match; If3 takes the resolved leg (no dead-end); get-results input uuids ⊆ the spec-match uuids; CUSTOMER BOUNDARY: reply names ≥1 real product code from those matches (grep the rendered string, not the graph); RED first on pre-change rev |
| SA-2 code parity | empty state | "check stock SRTWC286" | resolve-entity output: same match count/tiers as the pre-change baseline execution, zero `spec_search` tier rows; branch path node-for-node = baseline; stock answer unchanged at the boundary |
| SA-3 nonsense unchanged | empty state | "purple levitating sink" | zero spec candidates → not-found/dym path node-for-node = pre-change baseline for the same input; no new wording at the boundary |
| SA-4 descriptive + cert ask | empty state | "wall hung basin got SIRIM cert?" | spec matches flow into the attachment domain; BOUNDARY: the reply must NOT render an unscoped universal negative ("no wall hung basin has…"); record actual wording verbatim — observational until shape B lands, but the unscoped-"no" assertion is hard |
| SA-5 mixed code+descriptive | empty state | "SRTWC286 and wall hung basin" | code token resolves normally; fallback suppressed (CRM zero-match gate) — assert code answer correct, document the descriptive half's fate; known v1 gap, NOT a failure |
| SA-6 clarify path untouched | empty state | a vague turn that historically routes to clarification (e.g. "how much") | `resolve-entity-clarification` request body contains NONE of the three new fields; clarify behaviour = baseline |

Safety per §0 always: zero egress (`test:egress:{run_id}`), sink-delta with payload attribution
(never the LLEN gate), per-node runData. Clone snapshot before the edit into
`tests/manifests/spec-shapeA/README.md` (versionId, node sha, rollback publish command) — the clone
carries other in-flight work (incoming-axis-gate iter-2); the manifest is what keeps this one-node
edit separable.

## What this family deliberately does NOT cover

- `understand_phrase` / semantic tier, holding message, `spec_unmet` rendering — v2, out of scope.
- Shape B (`require{}` predicate, qualifying_total honesty) — blocked on the CRM build
  (`plans/crm-ask-spec-backward-search.md`); its family lands when the contract is deployed.
- Session continuity on a spec-resolved answer ("how about the black one") — backlog; note any
  observed behaviour in the run log, assert nothing.

---

## Post-#142 re-probe (`spec-raw-text-migration`, 2026-08-15) — **UNRUN, blocked**

The migration deleted `free_terms` and put the customer's raw sentence in `query`, so SA's
contract probes have to be re-taken against the DEPLOYED CRM in the NEW request shape. They are
written and committed as `tests/offline/spec-answer-honesty/s1-probe.js`, and they are
**UNRUN - not passing, not failing.**

**Why, and the exact one-toggle fix.** The read-only CRM proxy `zz-crm-probe-spec-shapeA`
(`UYkE8VLZ8DzJa3TT`) has **`availableInMCP: false`**; every MCP operation on it (including
`publish_workflow`, which is what would activate its webhook) returns *"Workflow is not
available in MCP. Enable MCP access from the workflow card in the workflows list, or from the
workflow settings."* That is an access block and the coder seat does not route around one; the
CRM credential lives in n8n, not this repo, so there is no second path by design.
**USER ACTION:** n8n -> Workflows -> `zz-crm-probe-spec-shapeA` -> the card's menu (or the
workflow's Settings panel) -> enable **Available in MCP**. Then: publish it, run
`PROBE_WEBHOOK=... node s1-probe.js`, unpublish it, and confirm the webhook 404s.

| id | body | expect |
|---|---|---|
| S1-1 | the migrated shape: raw `query`, `spec_fallback:true`, **no `free_terms`** | spec rows arrive; every row carries `display.specifications` (values-only, no `{value,unit}` envelopes, `free_terms` never a key) and `preferred_specs`; `matched_specs` INTERSECT `preferred_specs` empty; top-level `spec_asked` present, `[{key,value}]`, **never containing `class`**; `unrecognized_terms` present-and-possibly-empty; **and the slice's own claim - "thickness 1.2mm" is asked-for or reported unmet** |
| S1-2 | SA-P1 re-probe ("wall hung basin") | >=1 `spec_search` row, `match_field:"specifications"`, uuid present |
| S1-3 | SA-P2 inertness parity on a bare code | response field-identical with and without the flags; zero spec rows |
| S1-C | **THE COUNTERWEIGHT** - a fully-covered code PHRASE ("do you have stock for SRTWC286 please") with `spec_fallback:true` | the fallback still does **not** fire, and `spec_asked` is absent/empty. S1-3 alone cannot see this: a bare code cannot trip the widened `_product_words_unanswered` arm, so without S1-C a CRM that had started firing spec search on everything would pass |
| S1-4 | gibberish ("purple levitating sink") | zero spec rows; `floor_missed` recorded |
| DEV-1 | walk phrases until a spec row carries `specifications.brand` | supplies the FIXTURE the three-line render rule needs. Report the brands whose spelling a blind titlecase WOULD rewrite; **if none differ from titlecase, DEV-1 is INCONCLUSIVE and the renderer exemption is untested against real data - say so, do not assume** |
| DEV-2 | one query carrying a code token AND a descriptive phrase | the CODE survives in `unresolved_tokens` (`_is_code_shaped` is never cleared) **while** a spec shortlist comes back and the descriptive token clears - the shape that makes the mixed hit+miss reply reachable in the wild |
| SR-8 | "sorento double bowl kitchen sink ..." | no SORENTOBAG / SORENTO188 / `****NOT USE THIS CODE` in the answer, and the descriptive half produces a real spec answer |
| G1 | `g1-house-brand-probe.js` re-run | does a house-brand-answered phrase put `brand` into `matched_specs` for a customer who named no brand? **No longer a promote blocker** - the `spec_asked` intersection excludes an unstated preference key structurally - but re-run it as the evidence that the exclusion is real rather than reasoned |

**SA-6 is unchanged and still required:** `resolve-entity-clarification` was NOT touched by this
slice (its body carries none of the three fields and still sends `user_goal`). Verify from the
JSON, not from memory.
