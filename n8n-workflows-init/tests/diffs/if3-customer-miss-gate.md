# Node diff — If3 customer-predicate miss gate (cross-customer order leak fix)

**Date:** 2026-08-20 · **Change:** exactly ONE node, ONE parameter (`If3` → `conditions.conditions[0].leftValue`). No node added/removed, connections byte-identical.
**Diagnosis:** `firstmate/data/clone-exec-tier-prompt-missing/report.md` (Fault 2). **Plan:** `firstmate/data/tier-and-customer-miss-fix-plan/report.md` §2 (item #1 only).

## Targets

| target | base version (backed up) | state |
|---|---|---|
| clone `txiPzSxy3Pclsz6v` | active `1c09ef40-2815-4746-9c75-221af6cc5ed9` (183 nodes) | **APPLIED** → new active `f753dd1c-8693-42d9-b920-6efab1ff1ced` |
| live spine `9qVyfUxmRQqrpGRMDLRuz` | `57e70ce2-b586-498d-b9d4-cbc9990a06fd` (draft==active, 127 nodes) | **HELD — captain-gated**, promote body ready |

Backups + promote-ready PUT bodies: `n8n-workflows-init/tests/backups/if3-customer-miss-gate-2026-08-20/`.

## Clone draft-vs-active reconcile (pre-flight, required by task)

Clone had draft `1ad1f91e` ≠ active `1c09ef40`. Full machine diff of the two versions: **the only delta is `media-poll-http` losing the explicit `"method": "GET"` key in the draft** (GET is the httpRequest default → semantic no-op; author Teh Jayson; `1c09ef40` activated 2026-08-19T11:56Z; connections identical; both 183 nodes). No foreign work. **Build was based on the ACTIVE version (`1c09ef40`) content**, so the published state is preserved and the inert draft delta is discarded.

## The expression

Old (byte-identical on clone and live before this change):

```
={{ $('disallowed-entity-gate').first().json.gate_passed === false || (($('resolve-entity').first().json.unresolved_tokens || []).length > 0 && ($('disallowed-entity-gate').first().json.compatible_entities || []).length === 0) }}
```

New (one OR-term appended; nothing removed; single line as installed; sha256 `5277d872fc12175cb6fce6fd8d17fc302206cfc59178483be2d4f4353be6a626`):

```
={{ $('disallowed-entity-gate').first().json.gate_passed === false || (($('resolve-entity').first().json.unresolved_tokens || []).length > 0 && ($('disallowed-entity-gate').first().json.compatible_entities || []).length === 0) || (((($('disallowed-entity-gate').first().json.gate_debug || {}).allowed_lookup) || []).includes('customer') && (($('Call \'sub-query-reformulator\'').first().json.output.entities) || []).some(e => e && String(e.hint || '').toLowerCase() === 'customer') && !(($('disallowed-entity-gate').first().json.compatible_entities || []).some(c => c && String(c.entity_type || '').toLowerCase() === 'customer'))) }}
```

In words: **when the domain allows customer lookups and the parser saw a customer entity, but no customer-type entity survived resolution, the turn is a miss** — route to the existing miss lane instead of answering. A customer-scoped question is never answered without its customer predicate.

## Option picks (captain's "as simple as possible" applied)

- **Blocking predicate:** any customer-hint entity with no surviving customer match — no confidence-tier logic (the simpler predicate is also the safer one; a vague customer blob leaks identically).
- **Domain scope — derived, not hardcoded:** `gate_debug.allowed_lookup.includes('customer')` reuses the gate's own already-emitted data (verified present on every If3-reaching turn), reads as plainly as a hardcode, needs no second source of truth for "which domains have customers", and is inert for every domain whose lookup list lacks `customer` (today: everything except `order`).
- No new nodes, no configuration, no flags. One expression on one existing node.
- All three referenced shapes verified against real execution data (exec 13169211): `gate_debug.allowed_lookup`, parser `output.entities[].hint`, `compatible_entities[].entity_type`. The `$('Call \'sub-query-reformulator\'')` escape form is the same one used in ~20 existing IF-node expressions on both graphs.

## What cannot change

- No-customer turns (incl. product-only order queries, plan D-G): new term false at the entities `.some()`.
- Resolved-customer turns (any tier, incl. single-token coverage resolution of a misspelling): `compatible_entities` contains a `customer` entry → term false.
- Non-order domains: `allowed_lookup` lacks `customer` → term inert.
- The If3 TRUE branch routes into the pre-existing miss lane (`If-incoming-picker` → `not-found-error-message` → dym → `build-suggest-offer`); the incoming-picker arm needs `domain === 'incoming'` and is unreachable from this term.

## Rollback

One command per target: `PUT` the saved full-GET backup body (auto-activates on this instance). Backups captured before any write.

## Promote checklist (live — CAPTAIN-GATED, do not run without explicit go)

1. Fresh `GET /workflows/9qVyfUxmRQqrpGRMDLRuz`; assert draft==active, still 127 nodes, If3 leftValue still the old expression (else STOP and re-derive).
2. PUT `live-put-body-HELD.json` (regenerate from the fresh GET if anything moved).
3. Post-flight: GET again, assert activeVersionId moved, If3 leftValue sha256 == `5277d872…`, node count 127, connections unchanged vs backup.
4. Passive verification only: watch subsequent real order-domain executions' If3 branch read-only. Never send a live test message.
