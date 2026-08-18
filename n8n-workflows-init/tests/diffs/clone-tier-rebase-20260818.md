# Clone rebase: tier-ask + promotion-picker lanes onto the TEST clone (2026-08-18)

Captain-ordered CLONE REBASE so console tests match live. Backport of the live tier-ask lane,
the promotion-picker lane, the tier-collapsing `access-level-choice-message` body, and the
PR #24 hotfix leaves from LIVE `9qVyfUxmRQqrpGRMDLRuz` **active `7aba1447`** onto the TEST clone
`txiPzSxy3Pclsz6v`.

- Source of live bytes: REST `GET /workflows/9qVy…` → `.activeVersion` (versionId `7aba1447-61f6-490d-89b4-22d1a196716d`).
  The live DRAFT is `cfd0e776` (someone's unpromoted edits) — deliberately NOT used.
- Clone PRE: `7db593b0-ef2e-453b-bc98-30ff9267bf41` (versionId==activeVersionId, 160 nodes).
  Backup: `tests/backups/miss-company-routing/clone-tier-rebase-PRE-7db593b0.json`.
- Clone POST: `061e46c9-c22e-43da-a62c-537612f3a80d` (REST PUT byte-exact; PUT auto-activated —
  versionId==activeVersionId verified; 171 nodes).
- Method: one REST `PUT /workflows/txiPz…` with `{name, nodes, connections, settings:{executionOrder}}`,
  bodies byte-copied from live's activeVersion JSON (no hand-retyping).

## Nodes ADDED (11 — all byte-exact from live `7aba1447`, live node ids kept, no id collisions)

| node | type | lane | adaptation |
|---|---|---|---|
| `tier-gate` | code | (a) tier-ask | none (byte-exact) |
| `if-tier-ask` | if v2 | (a) | none (incl. hotfix-restored `loose`/`2` options) |
| `tier-probe-plan` | code | (a) | none |
| `tier-probe` | executeWorkflow | (a) | **workflowId `rysSPgUssLDf6xJc` → `t4QvrtrPnTwRU6br`** (sub-get-results CS-BUILD — the fork the clone's `Call 'sub-get-results'` already targets; same convention as the PROMO-PICKER fork `RnpxEnAV3g20MmKj`). No `is_test` input — matches the clone's existing get-results convention (fork safety = read-tool allowlist). Carries the PR #24 hotfix leaves (`tool` from `$('tool-filter')`, trimmed `contact_id`). |
| `tier-probe-collect` | code | (a) | none |
| `if-tier-has-any` | if v2 | (a) | none |
| `promo-picker` | code (35.8 KB) | (b) promo-picker | none |
| `if-promo-dym` | if v2 | (b) promo-dym | none |
| `promo-dym-plan` | code | (b) | none |
| `promo-dym-probe` | executeWorkflow | (b) | **workflowId `Fss5aAaXthJSWpZCgKiKR` → `t4QvrtrPnTwRU6br`** (same adaptation; mirrors clone's `dym-probe`/`dym-probe-partial` which already target `t4Qv`) |
| `get-presigned-url` | httpRequest | (b) attachment delivery | none — cred `crm-n8n-auth` (`mNsZWyU82NYV58k2`) already in use on 10 clone nodes. Included because the clone ALREADY carried the rest of the presign design (orphaned `send-message-files` reads `$('Switch').item.json.presigned_url`; `presign-fail-notice`/`sorento-sub-respond-sendmsg-presign-fail` present) — only this node + its 2 edges were missing. Presign POST is a stateless CRM utility read; downstream sends remain orphaned/guarded. |

## Nodes CHANGED (6)

| node | before → after | why |
|---|---|---|
| `If4` | 2-condition OR (Aggregate∩parser levels notEmpty ∥ name.length==1) → live's single `={{ $json.name.length }} > 0` (strict/v3) | (a) — If4 now reads tier-gate's passthrough; tier-resolvability moved into `tier-gate` (`tier_proceed` semantics baked into the recomposed output). Byte-exact live params. |
| `access-level-choice-message` | legacy raw access-level listing (`eb7e4799`) → live tier-collapsing body (TIER_DISPLAY/ASK_ORDER, 3-tier quick replies, "has promotion" annotations, reads `tier-probe-collect` guardedly) | (c). Byte-exact live jsCode. |
| `Call 'sub-get-results'` | `workflowInputs.value.{tool, contact_id, semantic_input, user_prompt}` → live's | (d) hotfix leaves (`tool` = `$('tool-filter').first().json.name`, trimmed contact_id) + (a) tier-lane reads (`semantic_input`/`user_prompt` read `tier-gate.access_levels_recomposed`). Target stays fork `t4QvrtrPnTwRU6br`; `entities` untouched. |
| `dym-transform` | live body (adds the `promotion:` domain-map entry — tool `crm_marketing_promotions_list`, predicate `row_present`, probe_cap 3). Only delta vs clone = that 7-line insert. | (b) promo-dym |
| `dym-annotate` | live body (adds the D18 `row_present` per-candidate branch). Only delta vs clone = that 25-line insert. | (b) promo-dym |
| `compile-current-state` | `6bff997d` → `8deebd5e` — clone rev-3 body + 3 anchored hunks from live (see below). All rev-3 miss/clarify/plain blocks untouched. | (a)+(b) persistence |

### ccs hunks (anchored insertions into the rev-3 `6bff997d` body; byte-copied from live)

1. **`_promo` + `_tier` + extended `selection_context`** — inserted between the (byte-identical)
   `_isDisambig` line and the friendly-domain-disclaimers marker; replaces the old
   `selection_context` chain with live's `_merge/_sug/_mem/_promo/_tier/_isDisambig` chain.
   NOTE: the captain's brief assumed the clone ccs already carried the `_tier`/`tier_offer`
   block — it did NOT (grep: zero `tier_offer`/`tier_last_result_set` in `6bff997d`). Without it
   the ask turn persists no roster and the pick turn dies, so `_tier` was ported together with
   `_promo` (both live-byte-exact).
2. **`_pickerReported` ("one miss, one voice")** — const block inserted before
   `let missResolutions`; `&& !_pickerReported.has(…)` added to the resolutions filter (kept
   clone-only `_isDerivedQueryToken`/`_tokenReachedSpecSearch` conditions intact); legacy
   single-resolution else-if extended with live's `!unresolved.every(…)` clause.
3. **`query_brands` persistence** — live's `"query_brands": qf.query_brands,` + S3/F4(b)/F7
   comment block inserted between `query_scope` and `access_levels` in `output.variables`.
   Ported because the parser fork's scope-reuse carry reads `prevState.query_brands`
   (verified in fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2`); without it a tier-pick turn loses the
   brand constraint and recomposes wider than live.

## Edges (19 added, 5 replaced; enumerated clone-first, all anchors matched expectations)

| lane | change |
|---|---|
| (a) | `Aggregate[0]→If4` ⇒ `Aggregate[0]→tier-gate[0]→If4[0]` |
| (a) | `replay-get-results[1]→Call 'sub-get-results'` ⇒ `replay-get-results[1]→if-tier-ask[0]`; `if-tier-ask[0]→tier-probe-plan→tier-probe→tier-probe-collect→if-tier-has-any`; `if-tier-ask[1]→Call 'sub-get-results'[0]`; `if-tier-has-any[0]→access-level-choice-message[0]`; `if-tier-has-any[1]→Call 'sub-get-results'[0]` — the lane sits on the REAL branch of the clone's replay gate (live: `tool-filter[0]→if-tier-ask`), so `regress-replay` still bypasses it (everything pinned, 0 probes) while `uac`/`regress-capture` match live. |
| (b) | `validator[0]→crossdomain-zeroset` ⇒ `validator[0]→promo-picker[0]→crossdomain-zeroset[0]` |
| (b) | `dym-gate[0]→dym-probe` ⇒ `dym-gate[0]→if-promo-dym[0]`; `if-promo-dym[0]→promo-dym-plan→promo-dym-probe→dym-annotate[0]`; `if-promo-dym[1]→dym-probe[0]` |
| (b) | `Loop Over Items1[1]→Switch` ⇒ `Loop Over Items1[1]→get-presigned-url[0]→Switch[0]` (error output `[1]` empty — mirrors live, where `presign-fail-notice` is likewise orphaned) |

`If4[1]→access-level-choice-message` and `access-level-choice-message[0]→tag-access-choice` unchanged (already live-shaped).

## PRE→POST sweep (exact)

- ADDED = exactly the 11 nodes above (param-sha == live after the 2 fork-target swaps; ids == live ids).
- CHANGED = exactly the 6 nodes above (`If4`/`alcm`/`dym-transform`/`dym-annotate` byte-== live; `Call 'sub-get-results'` value == live's, target t4Qv; ccs `8deebd5e`).
- REMOVED = none. No node-level attr drift (disabled/onError/retry checked on all 160 carried nodes).
- Protected round-3 rev-3 bodies byte-unchanged: `miss-roster-gate`, `miss-roster-plan c4a19b6f`, `miss-members-gate`, `build-miss-member-offer fab11982`, `clarify-company-reply 377c2df4`, `offer-hold-reply 377c2df4`, `cs-offer-gate`, `build-suggest-offer`, `escalate-catalog` — all PRE==POST.
- Guards/orphans intact: `send-message-files/images/video`, `update-human-intervened`, `save-session-vars` all still 0-inbound; `Switch`→guard-e/f/g-record untouched; all executeWorkflow targets still the TEST forks (no `rys`/`Fss`/live-sub target anywhere on the clone).
- Forbidden-token scan of all added/changed params: no `api.respond.io`, no `conversation-variables` PUT, no assignment write; flagged strings (`assignee`/`session_vars`/`prototype` in ccs, `comment` in promo nodes) are pre-existing comments with identical counts PRE vs POST. LESSONS #45 scan: no `prototype`/`constructor`/`__proto__` in any new If expression (the one ccs `Object.prototype` use is jsCode, pre-existing).

## Skipped (out of scope, noted for the captain)

- **live draft `cfd0e776`** — not grafted (unpromoted, unreviewed).
- **`Schedule Trigger`** — live-only; the clone is driven by `When Executed by Another Workflow` + `test:q:{contact}` pop (no schedule consumer on the clone; nothing to disable).
- **`build-suggest-offer` #9 hunk** (`gate.company_team` preference, brand-company promote) — two-way divergence with clone rev-3 F1 work; not tier/promo scope. Flagged as a live↔clone ccs-adjacent divergence for a future rebase.
- Clone-lane work (round-2+3 nodes, guards, forks, replay/fixture scaffolding) — untouched by construction (sweep proves it).

## Smoke (LESSONS #45 — one real uac exec through every new If expression)

See `tests/runs/clone-tier-rebase-SMOKE-20260818.json`. Summary: PASS — clone exec 12938676 (canary 12938675): tier-gate tier_ask=true, If4/if-tier-ask/if-tier-has-any all evaluate clean in the real sandbox, 3 probes via fork t4Qv, 3-tier ask rendered with 'has promotion' annotations, ccs persists selection_context=tier_offer + 3-row tier roster + query_brands, get-results correctly suppressed (D14), zero egress (would_log/would_write/would_send only, prod list 0->0). First attempt 12938451 errored in the save-msg fork on a seed-shape mistake (LESSONS #12 deep nesting), not a graft defect.
