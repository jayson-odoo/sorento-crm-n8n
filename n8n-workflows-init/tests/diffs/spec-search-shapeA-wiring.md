# Node-diff — `spec-search-shapeA-wiring` (v1, plan §2)

Build target: **TEST clone `txiPzSxy3Pclsz6v`** · `bd0023ac` → **`be62b3a8`** (published, draft == active)
Plan: `plans/spec-search-shapeA-wiring-plan.md` · UAC: `tests/uac/SA.md` · Manifest + rollback:
`tests/manifests/spec-shapeA/README.md`
Live spine `9qVyfUxmRQqrpGRMDLRuz` **not touched**. Nothing promoted.

## Summary

**One node, one leaf, three JSON fields.** `resolve-entity-http.parameters.jsonBody` gains
`spec_fallback`, `free_terms`, `understand_phrase`. No node added, removed, renamed, rewired or
re-credentialed; `connections` byte-identical; 27/27 credential bindings intact; the other 147
nodes' `parameters` unchanged (asserted by full param-hash sweep against the pre-edit snapshot,
LESSONS §71 — a diff that only hashes Code bodies is blind to exactly this kind of node).

---

## 1. The one changed node

| | |
|---|---|
| clone node | **`resolve-entity-http`** · `e663221f-0722-43c0-953d-60bec1f01e07` · `n8n-nodes-base.httpRequest` |
| live promote target | **`resolve-entity`** · `a2bed208-8051-4eb4-8e21-4bee16bd3568` — **different NAME, same body** |
| `jsonBody` sha256 | `51de7f16…` → **`dac04eb0…`** (886 → 1306 bytes, pure ASCII, no trailing whitespace) |
| everything else on the node | untouched: url, method, sendBody/sendHeaders, `specifyBody`, `options`, credential `crm-n8n-auth` |

> ⚠️ **The node named `resolve-entity` on the clone is a `noOp`.** The clone runs the standard
> replay pattern — `replay-resolve-entity` (IF) → `fixture-resolve-entity` | **`resolve-entity-http`**
> → NoOp named `resolve-entity` → `disallowed-entity-gate` — so the eight nodes that read
> `$('resolve-entity')` BY NAME resolve whichever arm ran (LESSONS §5/§11). Editing the NoOp would
> have been a no-op in the literal sense. **On live the same body sits on the node actually named
> `resolve-entity`** — target the live promote by NAME and do not copy the clone's node name across
> (LESSONS §58c).
>
> The clone's body was **byte-identical to live's** before this edit (params sha `2b50c2c2…` on
> both), so there was no clone-only hunk to regress — that was checked first, per the task.

### Before → after

Unchanged, in place, byte-for-byte (`query`, `match_mode`, `tokens`, `allowed_entity_types`,
`access_levels`, `domain`, `fallback_to_all_types`, `limit`). Appended after `"limit": 15`:

```
  "spec_fallback": true,
  "free_terms": {{ JSON.stringify(((_e) => (Array.isArray(_e) ? _e : []).map(x => String((x && x.raw) || '').trim()).filter(v => v.length > 0 && !(/[0-9]/.test(v) && /^[A-Za-z][A-Za-z][A-Za-z0-9._\/\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]*$/.test(v))).filter((v, i, a) => a.indexOf(v) === i))($('Call \'sub-query-reformulator\'').first().json.output.entities)) }},
  "understand_phrase": false
```

**Intent per field**

- **`spec_fallback: true`** — unconditional. The gate lives CRM-side — **CORRECTED at review
  2026-08-12** (the original text predated the CRM gate widening `ae3393810`): the fallback runs
  `if payload.spec_fallback and (_result_has_zero_matches(result) or
  _product_words_unanswered(result))` (references.py:1823). A fully-covered request (code
  queries — SA-P2/C-fixture parity, executed) comes back untouched; a multi-word product phrase
  with PARTIAL code-word coverage gets its result set REPLACED by ranked spec rows (SA-P6,
  executed: 13 code partials → 10 spec rows, 0 mixed). That replacement is the feature's
  intended post-promote behaviour, not collateral — but it is NOT "inert for all resolving
  traffic" as this section originally claimed.
- **`free_terms`** — the parser's entity raws minus anything code-shaped. Feeds the CRM's
  deterministic registry-synonym resolver (`resolve_terms_to_specs`), which joins the terms into one
  haystack and matches registry synonyms longest-first. No LLM, no added latency. Note this field
  is **load-bearing, not decorative**: with `extracted_specs` absent (v1 sends none), `free_terms`
  is the *only* input `search_specs` gets — an empty array means a guaranteed zero-candidate run.
- **`understand_phrase: false`** — v1 is the deterministic tier only (plan §3.1). Pinned by an
  assertion + its own mutant so it cannot drift true silently: `true` would add 2–3 s to every
  zero-match reply and would read `query`, which n8n fills with the parser's *restatement*
  ("trying to find…"), not the customer's words.

**The classifier rule** (single source of truth: `tests/offline/spec-shapeA/free-terms.js`, spliced
into the body by `build-body.js` — the tested string and the shipped string are the same object):
a token is a code when it contains a digit AND the whole token is ≥2 leading letters followed only
by letters/digits/code separators. Keyed on leading LETTERS rather than "contains a digit" because
dimensions lead with the number — `600mm`, `1m`, `1200`, `300x600` are kept, `SRTWC286`,
`CBS212-WH`, `SPO-2024-001`, `SRT332−GM` (U+2212) are dropped. Dash-agnostic by construction, so it
does not depend on the parser's unicode-dash fold having run first (SA-P5's explicit requirement).
Stated bias: wrong in the "kept a code" direction is cheap (the fallback only runs on turns where
that code already failed to resolve); wrong in the "dropped a description" direction is not.

**Known bound, pinned by P5-11:** a hyphenated description carrying a digit (`wall-hung-600`) is
read as a code and dropped. Space-separated raws — what the parser actually emits — are unaffected.

---

## 2. Evidence

`tests/offline/spec-shapeA/` — `node probe.js` → **38 passed, 0 failed**; `bash mutate.sh` →
**10/10 mutations caught**.

| group | what it proves |
|---|---|
| **P5-1..P5-11** | the classifier (UAC SA-P5), incl. unicode-dash paste forms and the stated bound |
| **B1** | the built body renders and parses as JSON against six real-shaped parser payloads — this is the gate for the expression-corruption class (LESSONS §D14), which a Code-body-only review cannot see |
| **B2** | all 8 pre-existing fields render **byte-identically** before vs after, per fixture — the n8n-side half of the inertness claim |
| **B3** | the three new fields carry the planned values |
| **B4** | key-set delta is **exactly** the three — catches a stray rider (§71's failure shape) |
| **B5** | resync gate: the clone's deployed bytes == the bytes this suite tested, with three outcomes (matches / NOT-YET-DEPLOYED / DRIFTED), never two. **Run it at the start of every test pass** — LESSONS §64, where a UI save silently reverted a published clone change for a day while every behavioural check kept passing |
| **B6** | a missing/null entity list renders as `[]` rather than throwing |

Two harness notes the reviewer should weigh:

1. **A mutant survived, and the fix was to delete code, not to add an assertion.** Removing `|| []`
   from the entity accessor changed nothing — the classifier's own `Array.isArray` guard already
   covered it. Equivalent mutant ⇒ dead code ⇒ removed from the body, and m8 re-pointed at the
   guard that is actually load-bearing (LESSONS §72).
2. **A crash is not a detection.** A mutated classifier threw, killed the probe mid-suite, and the
   gate scored it "not caught". Assertions now take thunks, and `mutate.sh` aborts if the probe
   never reaches its own summary line.

`bd0023ac` was verified DRAFT == ACTIVE with **0 differing nodes** before the write, so nothing
unowned rode along on the publish (LESSONS §24/§51).

---

## 3. What is NOT proven — read before signing anything

**SA-P1..P4 are UNRUN, not passing.** They require POSTing to the live CRM. This seat may not probe
production hosts and the CRM credential lives in n8n (`crm-n8n-auth`), not in this repo. The probes
are written and ready — `tests/offline/spec-shapeA/crm-probe.js`, gated behind
`CRM_BASE`/`CRM_API_KEY`, refusing to run without them and exiting 3 with an explanation. Someone
with the credential must run them and file `crm-probe-results.json`.

What that leaves open, precisely: I verified the CRM **source** (`sorento_crm_backend/app/api/v1/
system/references.py`, `app/services/product_spec_search.py` on `main`, in sync with `origin/main`)
agrees with the plan on all three field names, the zero-match gate, and the emitted match shape.
That is not proof the **running service** does — a FastAPI/FastMCP process registers its schema at
start-up, so merged is indistinguishable from not-deployed until something calls it (LESSONS §70).
Pydantic ignores unknown fields by default, so a not-yet-deployed endpoint would accept this body
and silently do nothing — a green clone run would look identical. **SA-1 going green on the clone is
what closes that gap; do not close it from this document.**

`mutate.sh`'s m1/m3 are therefore realised against the offline body-composition assertions rather
than SA.md's SA-P1/SA-P2; m2 lands exactly where SA.md puts it. Recorded in the file header.

---

## 4. Predicted downstream behaviour — three findings for the tester and reviewer

Read from the CRM source + the clone's node bodies. None of them is fixed here: v1 is one node by
design (plan §2). All three are *predictions*, and predictions are hypotheses (LESSONS §70) — the
tester's runData settles them.

### F1 (highest confidence, likely SA-1 boundary failure) — the answered token is still reported missing

The CRM attaches the spec matches to a **new resolution whose `token` is `payload.query`** — the
parser's restatement, e.g. `"trying to find a wall hung basin"` (`references.py:1752`). The
customer's own raw, `"wall hung basin"`, keeps its original resolution with `matches: []`.

`compile-current-state`'s partial-miss filter keys `_tokenWasAnswered(res)` on **that token's own**
`matches`/`alternatives`/`intersection` intersecting the answer set. The unresolved raw has none, so
it survives the filter and the reply is likely to render the spec answer **and**, underneath it,
`Couldn't find these: wall hung basin … did you mean`. That is the exact shape LESSONS §67/§68
records twice already — a sixth promotion mechanism arriving by a route the outcome predicate
cannot see — and it is why SA-1 must assert **the whole reply**, not just that a product code
appears (§68: add the negative to the positive; grep the rendered string for `Couldn't find these`,
`Multiple matches found`, and any escalation offer).

If it reproduces, the fix shape is one outcome-keyed predicate, not a per-mechanism patch: spec
search runs *only* when nothing else resolved, so **any** `match_tier === 'spec_search'` match in
the response means every unresolved raw contributed to the answer. One predicate, no seventh patch.
The CRM cannot help here — `display.via_token` carries the query string, not the contributing term.

### F2 — the CRM's "reads like 15 prefix matches" claim does not hold at the gate

`references.py:1742` states spec matches are shaped like a `prefix` match so that 15 of them go
straight to get-results, as `SRTWC286` does. The spine's `disallowed-entity-gate` reaches that
outcome for `SRTWC286` only because one match carries `match_tier: "exact"`. Spec matches never do,
so `>1` product match with no exact lands in `stillAmbiguous` → a choose-list.

It then almost certainly *escapes* that prompt by accident: the following filter keeps only
candidates whose CODE relates to a typed token (`code.includes(t) || t.includes(code)`), and
`SRTWC286` relates to none of `["wall hung basin","600mm"]`, so the option group empties and
`specific_options` is dropped. Net effect: no picker, `compatible_entities` still carries every
spec match, `If3` takes the resolved leg. **Correct outcome via a filter written for a different
purpose** — worth recording explicitly because it means the behaviour is unpinned by anything.
SA-1 should assert on the *mechanism* (which uuids reach `Call 'sub-get-results'`), not on the
absence of a picker.

### F3 — the miss path's payload is not byte-identical, only the resolving path is

The plan's "inert" property is about **resolving** traffic. On a **zero-match** turn the fallback
block runs and adds top-level `spec_candidates`, `floor_missed`, `spec_unmet` and `semantic_used`
even when it finds nothing (`references.py:1673-1806`). So SA-3 ("nonsense unchanged") should be
read as *node-for-node path identical*, not *payload identical*; a strict payload diff will show
those four keys and that is expected, not a regression.

Safe as far as I can check, and the check is worth repeating rather than trusting: they are
top-level keys, and per LESSONS §70c the one key-set iteration over resolver output in the spine is
`not-found-error-message.js:5` over `by_entity_type` — which this code path only rewrites inside
the defensive AND-`intersection` branch, and then only with the legitimate type `product`.

---

## 5. Files

| path | role |
|---|---|
| `tests/offline/spec-shapeA/free-terms.js` | classifier — **single source of truth**, spliced into the shipped body |
| `tests/offline/spec-shapeA/build-body.js` | deterministic body builder (append-only splice, anchor asserted unique) |
| `tests/offline/spec-shapeA/render-body.js` | offline n8n `{{ }}` renderer — how a parameter change gets tested at all |
| `tests/offline/spec-shapeA/probe.js` | P5 + B1–B6 |
| `tests/offline/spec-shapeA/mutate.sh` | S9 mutation gate, 10 mutants |
| `tests/offline/spec-shapeA/fixtures.json` | parser payloads, shape lifted from clone exec `12041903` |
| `tests/offline/spec-shapeA/resolve-entity.{before,after}.jsonBody.txt` | frozen bytes both sides (§69) |
| `tests/offline/spec-shapeA/crm-probe.js` | SA-P1..P4, **unrun**, credential-gated |
| `tests/manifests/spec-shapeA/README.md` | snapshot + one-node rollback |
