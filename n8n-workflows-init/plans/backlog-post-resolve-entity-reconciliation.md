# BACKLOG — post-resolve entity reconciliation (carried wrong-hint entity pollutes results)

Status: **BACKLOG — not scheduled, do not build yet.** Logged 2026-07-15. Evidence from fork
`wI5RkNGW3EOJfBdo` chat-stateful runs. NOT caused by the domain-continuity change (entity-merge +
resolver gate are untouched by it).

## Symptom

A carried prior entity that the parser mis-hinted leaks into a later, different-domain answer.

**Case 1 (pollutes) — exec 8690328.** T1 "show me promo 7081" (domain=promotion) → parser stores
`{raw:"7081", hint:"promotion"}`. T2 "Pls check stock srtbf11831" (domain=inventory) → the stock answer
ALSO returns SRTKS7081 / SRTBT1708-17 rows (the "7081" promo product), polluting the SRTBF11831 result.

**Case 2 (clean, desired) — same T2.** When the prior turn was "check ETA srtkt72ss" (incoming), prior
entity `{raw:"SRTKT72SS", hint:"product"}`; T2 "check stock srtbf11831" returns ONLY SRTBF11831. No carry.

User wants Case-2 behavior everywhere.

## Root cause (two layers let the carried promo entity through)

1. **Front-end axis merge keeps it (output_exchange).** `replace_combine` replaces a prior entity only on
   the SAME axis as a current-message entity. Axis comes from the parser HINT
   (HINT_AXIS_DEFAULT): `promotion→promo_scope`, `product→product_scope`.
   - Case 1: prior `7081` hint=promotion → `promo_scope`; new `srtbf11831` hint=product → `product_scope`.
     Different axes → prior **kept** (carried, `current_message:false`).
   - Case 2: prior `SRTKT72SS` hint=product → `product_scope` = same axis as new product → **replaced/dropped**.
   So the bug is entirely driven by the prior entity's (wrong) hint landing on a different axis.
2. **Post-resolve gate passes it (disallowed-entity-gate).** After `resolve-entity`, `7081` resolves to
   `entity_type=product` (SRTKS7081 / SRTBT1708-17). The gate's `ALLOWED.inventory =
   ['product','category','brand']` includes `product` → the re-typed entity is compatible → passes →
   get-results returns stock for it.

Net: parser said promotion (kept, cross-axis) → resolver said product (compatible with inventory) →
answer polluted. Both filters individually "correct"; neither reconciles the hint→resolved-type mismatch.

## The "halfway" reconciliation that already exists

`disallowed-entity-gate` (clone node, runs AFTER `resolve-entity`) IS a post-resolve reconciliation of a
sort — it flattens resolver matches, re-reads their true `entity_type`, and filters by a per-domain
`ALLOWED` type matrix (+ `REQUIRED_TYPES`, `ALLOWS_EMPTY`, ambiguity→disambiguation). What it does NOT do:
- It never feeds the resolved `entity_type` back to fix the parser's wrong `hint`/axis.
- It never re-runs the current-vs-carried axis dedup using the RESOLVED type. So a carried entity that
  collapses onto the current entity's axis *after* resolution (promotion→product, same as the current
  product) is not dropped — it only gets domain-compat-checked, which it passes.

## Proposed fix (for when scheduled) — reconcile hint→axis AFTER resolve, then re-dedup

After `resolve-entity`, for each entity whose resolved `entity_type` differs from the parser `hint`,
overwrite the effective type/axis with the RESOLVED type, then re-apply the replace_combine/axis dedup:
a current-message entity displaces a carried prior on the same RESOLVED axis. In Case 1, `7081` resolves
to product = same axis as current `srtbf11831` (product) → carried `7081` dropped → clean, matches Case 2.

Design notes / open questions:
- Where: extend `disallowed-entity-gate` (already has resolver types in hand) OR a small step between
  resolve-entity and get-results. Prefer reusing the resolver output already flattened there.
- Only reconcile when resolved type is confident/unambiguous; an ambiguous token already routes to
  disambiguation (don't fight that path).
- Keep same-domain multi-axis combine intact (product + warehouse, brand + category) — only collapse a
  carried entity that lands on a current-message entity's axis after re-typing.
- Interaction with `current_message` flag: a carried (`false`) entity that re-types onto a current
  (`true`) entity's axis loses; two current-message entities on one axis is a real multi-select (keep).

## Alternative (front-end, cheaper, less precise) — explicit-domain-switch scope reset

Using the `domain_signal` already added (see [[parser-domain-continuity-carry]]): on an EXPLICIT domain
switch (`domain_signal==='explicit'` AND new domain ≠ prev domain) with ≥1 current-message entity, keep
ONLY current-message entities (drop all carried prior). Fixes Case 1 without needing resolver types, but
is blunter — it also drops a legitimately-carried cross-domain entity (rare; user's stated preference is
"no carry" anyway). Post-resolve reconciliation is the more correct fix; this is the fallback.

## Evidence / pointers
- Pollute: exec 8690328 (parser out: entities=[srtbf11831 product current, 7081 promotion carried];
  entity_op=replace_combine; domain=inventory, domain_signal=explicit).
- Re-typed proof: exec 8690203 get-session shows `7081` stored as `hint:product, canonical:SRTBT1708-17`
  after the polluted turn.
- Gate: clone node `disallowed-entity-gate` (`ALLOWED`/`ALLOWS_EMPTY`/`REQUIRED_TYPES`).
- Merge: `output_exchange` HINT_AXIS_DEFAULT + replace_combine axis logic.
