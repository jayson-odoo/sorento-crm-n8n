# Change Plan — shape B: `require` predicate emission + honest predicate rendering

Change-id: `spec-search-shapeB-predicate`
Status: PLAN (draft — needs its own grill pass; do NOT dispatch a coder from this rev).
Contract: `plans/crm-ask-spec-backward-search.md` — CRM side BUILT to it (commit `5ded454b8`,
`feat/spec-search-category-signal`), **not merged, not deployed**. ⛔ Build gate: every probe and
clone run here needs the deployed endpoint; until the CRM ships, only this plan + `tests/uac/SB.md`
move.
Depends on: `spec-search-shapeA-wiring-plan.md` landing first (SB-2 extends the same
`resolve-entity` body; sequencing avoids a two-writer diff on one node).
Scope tags: SB-1 `parser`, SB-2/SB-3 `spine`.
Build targets: parser = a FRESH fork rebased on CURRENT live `XTODTw-dJcV0uRdC056hG` (never edit
live; never reuse a stale fork — the existing `wI5RkNGW3EOJfBdo` carries domain-continuity hunks,
decide rebase-vs-layer at build time from a live diff); spine = TEST clone `txiPzSxy3Pclsz6v`.

## 0. The journey (before any node name)

> Customer: "what wall hung basins have SIRIM cert?"
> Parser: descriptive entity (no code-shaped token), domain `product_attachment`,
> attachment_type-ish entity → emits `require: {certificate: true}` + free_terms `["wall hung basin"]`.
> resolve-entity: passes `require` + free_terms → CRM intersects (class filter ∩ cert leg) over the
> FULL catalogue → 15 matches (all certified) + `predicate: {qualifying_total: 40, truncated: true}`.
> get-results: ids in, rows out — unchanged.
> Boundary: "40 wall hung basin models carry certificates — here are the 15 closest: …"
> Next turn: "the black one" — continuity over `last_result_set`, unchanged mechanism.

Failure journeys that must render honestly:
- `qualifying_total: 0`, term recognized → "none of our wall hung basins carries a SIRIM cert" —
  the ONLY case allowed to say an unscoped none (it is genuinely catalogue-wide).
- label in `unrecognized_terms` → clarify ("which document type do you mean…"), NEVER "none".
- require-only, no free_terms ("what products have certs") → deterministic code-ordered shortlist,
  score 0.0 — render as a browse list with the total, not as a ranked recommendation.

## 1. Slices

### SB-1 (`parser`) — emit `require`, deterministically, in `output_exchange`

No prompt change in v1. Derive from outputs the LLM already emits (same pattern as `deriveRouting`):
- domain `product_attachment` + an `attachment_type`-hinted entity + NO code-shaped entity →
  `require.attachment_type = <the entity raw, verbatim label>`; if the label is cert-ish /
  routing is `purchasing_certification` → `require.certificate = true` instead.
- domain promotion + descriptive-only entity set → `require.promotion = true`.
- domain inventory/stock + descriptive-only → `require.stock = true`.
- Any code-shaped entity present → NO require (codes resolve normally; predicate questions about a
  specific code are the forward path).
- Key names hardcoded (4, per contract §3.1); labels pass through verbatim — CRM resolves them.

### SB-2 (`spine`) — pass-through on `resolve-entity`

Body gains `"require": {{ …parser output.require || omitted }}` — field ABSENT when the parser
emitted none (absent = byte-identical response; `require` present supersedes `spec_fallback`, so
the SA fields can stay). Never send a key outside the 4 (CRM 422s on unknown keys — a 422 here is
a build bug, listed in UAC).

### SB-3 (`spine`) — render the `predicate` block

- `compile-current-state`: deterministic suffix from `predicate` — total + truncation
  ("N models qualify — showing the K closest"), and the genuine-none wording when
  `qualifying_total == 0` with no unrecognized terms. Deterministic string, not LLM phrasing —
  assertable at the boundary (friendly-domain-suffix precedent).
- `unrecognized_terms` non-empty → route the turn to the clarify path, naming the term. Verify at
  build time WHERE the clarify decision lives (If-chain around `disallowed-entity-gate`) — enumerate
  the renderers by rendered string, not by graph.

## 2. Promote order (user-gated, after both UAC families green)

1. CRM deploy (peer's side: merge main → PR → deploy).
2. Parser sub (live `XTODTw`, as LIVE+hunks by node name).
3. Spine `resolve-entity` + `compile-current-state` (LIVE+hunks).
Rollback per node = publish prior versionId; record in the manifest before the first write.

## 3. Test contract — `tests/uac/SB.md` (authoritative)

Probes SB-P* run only after CRM deploy; clone cases SB-1..n after SA lands. RED-first and §0
apply throughout.

## 4. Open (grill these before build)

1. Cert-ish label detection in SB-1 (deriveRouting's isCert set?) vs always sending
   `attachment_type` and letting CRM label-resolution decide — leaning the latter (less parser
   logic), but then bare "got cert?" must still map to `certificate: true` somewhere. Decide with
   real phrasings.
2. Does the count suffix belong on EVERY predicate answer or only truncated ones?
3. Continuity: does `last_result_set` get the 15 shown or should it note the 25 unshown exist
   (affects "show me more")? v1 = shown-only + suffix; "more" is backlog.

## 5. Contract note from CRM S4 (2026-08-14) — SUPERSEDED by PR #142 F9 (2026-08-15)

~~The `require` path's matches emit `specifications: {}` and `preferred_specs: []`~~ — **the
"small follow-up" already shipped, early, as F9 on PR #142**: require-path rows now carry REAL
`specifications` values **or `null`** when the product has no spec row
(`product_set_service.py:279-303` on the branch — verified by the conformance review,
`tests/reviews/pr142-contract-conformance.md`). `preferred_specs: []` / `matched_specs: []`
still hold on that path. SB renderer consequences:
- join per-row values directly; **guard for `null`** (not `{}`) as the no-spec-row shape;
- the F2 shown-row footer strip ALSO applies on the require path — same miss-line rules as
  shape A (code-shaped tokens never clear).
Also: any SB deploy that touches `include_specifications` needs the MCP process restart.
