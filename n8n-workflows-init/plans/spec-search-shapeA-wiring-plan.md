# Change Plan — wire spec-search fallback (shape A) into `resolve-entity`

Change-id: `spec-search-shapeA-wiring`
Status: BUILD AUTHORIZED (user, 2026-08-11) — design grilled in-session + cross-session
(sorento-crm-3a). UAC family: `tests/uac/SA.md`. Promotion stays user-gated as always.
Promotion target: LIVE spine `9qVyfUxmRQqrpGRMDLRuz`, node **`resolve-entity`** (single HTTP body edit).
Build/test target: TEST clone `txiPzSxy3Pclsz6v`, same-named node. NEVER edit the live spine directly.
Scope tag: **`scope: spine`** (v1 needs NO parser change — see §3.2; a parser-gated `understand_phrase`
is v2 and would widen scope to `parser`).
Sibling doc: `plans/crm-ask-spec-backward-search.md` — shape B (predicate/`require`) lives there and
does NOT block this plan. This plan is shippable against the CRM as deployed today.

## 0. What this is

Shape A of backward search: a customer **describes** a product ("wall hung basin 600mm black",
"flexible hose 1m") instead of coding it, and today the code-only probes return zero matches →
the turn dead-ends into not-found/did-you-mean with nothing to offer. The CRM already has the fix
built and live: `/references/resolve` accepts `spec_fallback` + `free_terms` + `understand_phrase`
and returns spec-ranked products as **ordinary product matches** (`match_field: "specifications"`,
`match_tier: "spec_search"`, uuid + similarity, mirroring `prefix` exactly). Zero n8n callers today
(verified: export grep for the field names = no hits). The gap is one request body.

Safety property, CORRECTED at review (2026-08-12, the original claim predated the mid-cycle CRM
gate widening `ae3393810`): the fallback fires when `spec_fallback` is sent AND
(**zero matches** `_result_has_zero_matches` OR **a product token has unmatched words**
`_product_words_unanswered`, references.py:1823). Existing callers never send the flag, so
deployed-CRM behaviour for them is unchanged — but **post-promote, every live resolve call
carries the flag**, so the true blast radius is: multi-word product phrases with partial
code-word coverage have their result set **REPLACED** by ranked spec rows (never mixed —
SA-P6 measured 13 code partials → 10 spec rows, 0 remaining). Full-coverage code queries are
untouched (SA-P2 parity + the C-fixture byte-parity across the deploy).

## 1. Current state (export @ live `89f26e9c`, verified current 2026-08-11)

`resolve-entity` posts:

```json
{
  "query": "{{ …user_goal }}",
  "match_mode": "{{ …match_mode }}",
  "tokens": [entity raws],
  "allowed_entity_types": [entity hints],
  "access_levels": [...],
  "domain": "{{ …domain_hint }}",
  "fallback_to_all_types": true,
  "limit": 15
}
```

Downstream readers BY NAME (from TOPOLOGY.md): `If3`, `disallowed-entity-gate`,
`build-suggest-offer`, `compile-current-state`, `crossdomain-zeroset`, `dym-transform`,
`dym-transform-partial`, `not-found-error-message`, `promo-picker`. All of them read
`resolutions[].matches` / `unresolved_tokens` / `alternatives` — the shapes spec matches
deliberately mirror (crm#106), so **no downstream node edit is planned**. The If3 unresolved
guard already only dead-ends when NO compatible entity resolved.

## 2. The change (v1 — one node, three fields)

`resolve-entity` body gains:

```json
  "spec_fallback": true,
  "free_terms": {{ JSON.stringify(<non-code-shaped entity raws>) }},
  "understand_phrase": false
```

- `spec_fallback: true` unconditionally — CRM-side zero-match gate makes it inert otherwise.
- `free_terms`: the parser's entity raws that are NOT code-shaped (filter with the same
  code-regex idea as the unicode-dash fold — an expression in the body, no new node). These feed
  the deterministic registry-synonym resolver (`resolve_terms_to_specs`) inside `search_specs`;
  no LLM, no added latency.
- `understand_phrase: false` in v1. The semantic read costs 2–3 s on the reply path and reads
  `payload.query` — which n8n fills with `user_goal`, an **LLM restatement** ("trying to get…"),
  not the customer's words. Two unknowns at once; measure the deterministic tier first.

`resolve-entity-clarification` is NOT changed in v1 (it runs on the clarify path where a
spec-shortlist answer is the wrong move).

## 3. Decisions taken (grill me on these)

1. **v1 = deterministic only.** Registry synonyms already cover the vocabulary the derivation
   ships ("angle valve", "wall hung", classes, colours…). `understand_phrase` is v2, gated on a
   parser descriptive-intent signal + probably a raw-message `query` — both parser-scoped.
2. **No parser change in v1.** The parser already emits entity raws for descriptive phrases
   (hint `category` etc.); we only re-use them as `free_terms`.
3. **No holding message in v1.** Deterministic tier adds no meaningful latency. The
   `semantic_ms`-driven "checking properly, one moment" line ships with v2.
4. **Negatives stay scoped.** Shape-B questions ("what faucets have certs") will now shortlist
   K products and forward-join; until shape B lands, any "none of them" downstream answer is a
   top-K claim. Renderer assertion in UAC: the reply must never say an unscoped "no" from a
   spec-search-tier shortlist. (Mitigation is wording; the structural fix is shape B.)

## 4. Test contract — `tests/uac/SA.md` (authoritative; this section is a pointer)

The family file holds it all: **SA-P1..P5** offline contract probes against the LIVE CRM (saved
under `tests/offline/spec-shapeA/`, with `mutate.sh` S9 mutations m1–m3), and **SA-1..SA-6** clone
cases in `uac` mode with `previous_conversation_state: {}` mandatory (uac-mode prod-session
landmine). Non-negotiables restated:

- **RED first:** SA-1/SA-3/SA-4 inputs run against the PRE-change clone rev and the executions
  recorded — SA-1 must dead-end before the change or its later green is worthless.
- **SA-2 parity** is the regression gate: a code query's resolve-entity output must match the
  pre-change baseline (the CRM zero-match gate keeps the feature inert on resolving traffic —
  prove it, don't trust it).
- **SA-6** proves `resolve-entity-clarification` was NOT touched.
- Clone snapshot into `tests/manifests/spec-shapeA/README.md` BEFORE the edit (versionId, node
  sha, rollback publish command) — the clone carries other in-flight work (incoming-axis-gate
  iter-2); the manifest keeps this one-node edit separable and reversible on its own.

## 5. Open items / v2

- `spec_mode: "always"` (CRM ask item 4) unlocks SA-5/cabana-class turns; revisit `spec_fallback`
  gating then.
- `understand_phrase` v2: parser descriptive-intent signal, raw customer text as the semantic
  input, holding line via `semantic_ms`, latency budget vs the per-contact dispatcher.
- `spec_unmet` rendering ("no CABANA among these") — the field already arrives; a
  compile-current-state suffix could surface it. Not in v1 to keep the diff one node.
