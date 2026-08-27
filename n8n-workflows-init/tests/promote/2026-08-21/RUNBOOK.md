# Promotion runbook — 2026-08-21 (PREPARED, NOT EXECUTED)

Everything below is built, syntax-checked and diffed against a fresh live GET. **Nothing has been written to live.** Two PUTs, in order.

## Bases this package was built on

| target | id | base version | nodes |
|---|---|---|---|
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | `57e70ce2-b586-498d-b9d4-cbc9990a06fd` (draft==active) | 127 → **130** |
| live parser | `XTODTw-dJcV0uRdC056hG` | `350942ca…` (draft==active) | 7 → 7 |

If either version has moved when you run this, **stop and rebuild** — the bodies were patched onto those exact texts.

## What ships

**Parser `XTODTw…`** — 2 nodes:
- `output_exchange` — byte copy of the proven fork body. Safe as a copy because live's current body is **byte-identical** to the fork's pre-edit base (verified: both 104,606 chars, equal). Carries: digit-inside-a-question is not a member pick; fragment reply is a pick and merges matches; a pick keeps the rest of the question; carried-vs-renamed compares both key forms; customer/transporter get their own axes.
- `AI Agent` systemMessage — **two additive hunks only**: `"offer"` added to the promotion price list and to the promotion domain line. The `"videos","actual video" → attachment_type "video"` line is explicitly preserved (asserted in the build). The fork's own prompt had dropped that line; this package does not.

**Spine `9qVyfUxmRQqrpGRMDLRuz`** — 5 edited nodes, 3 new nodes, 1 rewire:
- `If3` — customer-miss gate (expression was byte-identical to the clone's base).
- `disallowed-entity-gate` — ambiguous-customer picker, pinned picks are authoritative and expand to the account family, `customer_probe_entities` for the probe.
- `compile-current-state` — picker rosters persist until a new enquiry or domain change; roster admits customer rows; freshness read from `_parser_raw.entities`.
- `build-suggest-offer` — passed-through tokens are not misses; customer candidates dedup by display name. **The F1 prefix-tolerance hunk is deliberately absent**: live has no `_isDerivedQueryToken` guard, so the bug it fixes does not exist there.
- `cs-offer-gate` — one numbered list per turn (`g4`).
- **New:** `If-customer-picker`, `probe-customer-orders`, `annotate-customer-picker`, plus `If-incoming-picker[false] → If-customer-picker` (its false branch keeps `not-found-error-message`, so every non-picker miss turn is unchanged).

Console `zz-chat` was also fixed today (drains `chat:reply:{chat_id}` before dispatch, killing the off-by-one stale reply). That is test-harness only and is already live on the console; backup in this folder.

## Pre-flight (both targets)

1. `GET /workflows/{id}` → assert `versionId === activeVersionId` and it still equals the base above.
2. Assert node count (127 spine / 7 parser) and that `If3` still carries the OLD expression (no `allowed_lookup`).
3. Backups in this folder are the rollback: `BACKUP-live-spine.json`, `BACKUP-live-parser.json` (written by the build script from the same fresh GET the payloads were patched onto).

## Execute

```
# rebuild first — re-fetches live, re-asserts every anchor, refuses on an unpublished draft
python3 ../build-promote.py ../src ./

PUT $N8N_API_BASE/workflows/9qVyfUxmRQqrpGRMDLRuz   --data-binary @PUT-live-spine.json
PUT $N8N_API_BASE/workflows/XTODTw-dJcV0uRdC056hG   --data-binary @PUT-live-parser.json
```

Spine first (the parser hunks are inert without the gate), parser second. PUT auto-activates on this instance.

## Post-flight

1. `GET` each → `versionId === activeVersionId` (moved), spine 130 nodes, parser 7.
2. Per-node parameter sha matches `EXPECTED-shas.json` for every node listed there.
3. Full-JSON diff vs the backup shows only the intended nodes plus the four touched connection entries (`If-incoming-picker`, `If-customer-picker`, `probe-customer-orders`, `annotate-customer-picker`).
4. Passive verification only — watch the next real order-domain executions' `If3` branch read-only. **Never send a live test message.**

## Rollback

One PUT of the matching `BACKUP-*.json` per target (auto-activates, restores the prior graph byte-for-byte).

## Risk notes

- Largest surface is the probe lane (3 new nodes). If you want a smaller first promote, drop it: remove the three nodes and restore `If-incoming-picker[false] → not-found-error-message`. Everything else is independent of it.
- The probe annotation discloses has/no-delivery for companies the asker did not pick. Product decision, flagged in `tests/diffs/customer-picker-probe.md`.
- Prompt changes cannot be diffed behaviourally. The two hunks are additive and were exercised on the fork: `any offer for srtwc286-sh` → promotion tier ask; `any actual video for srtwc286` → the video picker still maps correctly.
- Everything here was proven on the clone/fork with the zero-egress harness; no live execution was involved in any test.

## Late additions (2026-08-21, after the first build)

- `disallowed-entity-gate` + `compile-current-state`: `picker_families` — the picker remembers which accounts each candidate stands for, so a pick covers the same accounts the probe measured (the "has delivery" → "no delivery" contradiction).
- `output_exchange`: a **domain change clears carried scope** when the turn names its own entities. Fixes a promotion query's product leaking into the next order question; a pure `reuse` turn ("any promotion for it") still carries by design.
- Rebuild with `build-promote.py` rather than editing the payloads — it re-fetches live, re-asserts every anchor (including that live's `output_exchange` is still the fork base and that the video mapping survives), and refuses to build against an unpublished draft.

## Known gap, not addressed here

A pronoun-only domain switch ("any offer for **it**") returns a null domain from the LLM, so the fork's domain-continuity carry keeps the previous domain and answers in the old one. Pre-existing; fixing it means either a prompt change or another deterministic text rule, and neither was in scope.
