# replay-r0704 — coder notes (node-diff + wiring + egress-block map)

Coder handoff for the reviewer. Change ports the CURRENT-LIVE (frozen spine
`9qVyfUxmRQqrpGRMDLRuz` @ activeVersionId **98a061cd**) business deltas onto the
fail-closed TEST clone and repoints the capture/replay orchestrators at the
isolated `v_turns_r0704` dataset. **No live spine edit. 0 real egress. 0 prod CRM write.**

## Targets touched (verify IDs before trusting)
| workflow | id | before | after | published? |
|---|---|---|---|---|
| TEST clone `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | active b3963867 | **active 8dd1eb1c** | **YES — published** (see "Publish decision") |
| capture orchestrator `sorento-regression-orchestrator` | `MGm32814G7XcGSD2` | 114065dc | 2fc7af3a (draft/current) | no — manual-trigger, runs current saved state |
| replay orchestrator `sorento-regression-replay` | `aROEBlQyyoQaB7a1` | 33653878 | updated (draft/current) | no — manual-trigger, runs current saved state |
| LIVE spine (frozen ref, **NOT edited**) | `9qVyfUxmRQqrpGRMDLRuz` | 98a061cd | 98a061cd | untouched |

Clone `activeVersionId == versionId == 8dd1eb1c` (no draft divergence).

## Fidelity gate (byte-exact vs frozen live 98a061cd)
Each ported code body was sha256-verified in the **published active** clone against the
live-98a061cd source string (`jq -j .parameters.jsCode | shasum -a256`):

| node | sha256 (clone == live) |
|---|---|
| `disallowed-entity-gate` | `0001415ba54f6a094e07de9a69a1d8765623fd33ff33e929b82c8470aaf7dda3` |
| `not-found-error-message` | `776aff67200923ab7dbfa4ba27b1a7116d699567f7c9feb0e4af9bf639191212` |
| `escalate-catalog` | `bb9324b3e12dbf56c8428dd2d2d094f1ce40f8f5e5c21ce2d693ef2af3dda77f` |
| `annotate-incoming-picker` | `ab6e963a90a584f8e511f68ca968f503caeff925aef9d190fe6907e476d5402d` |
| `probe-incoming`.user_prompt | `87cca87906b2c169fe31a6d18d1424f0240ce39c546ace52925dd4f7eac8511a` |
| `probe-incoming`.semantic_input | `d99de1e12a3c26dd8348c9ff2c4deb14b3078ab4b2ab6318ba1dbec721820c4b` |

All node refs used by the ported code (`$('resolve-entity')`, `$('disallowed-entity-gate')`,
`$('Call 'sub-query-reformulator'')`, `$('access-level-choice-message')`,
`$('not-found-error-message')`, `$('annotate-incoming-picker')`, `$('Aggregate')`,
`$('sorento-sub-respond-findcontact-respond')`) resolve to identically-named nodes that
already exist on the clone — **no ref adaptation was needed**.

---

## Task 1 — ported code nodes (business logic only; clone rig untouched)

### a. `disallowed-entity-gate` (code) — REPLACED jsCode
- **Removed** the clone-only blanket promo guard:
  ```js
  if (resolver.fallback_match_mode && domain == "promotion") { gate_passed = false; gate_reason = "Ambiguous result" }
  ```
  → dashless promo codes (e.g. `srt79ss`) now resolve instead of failing "Ambiguous result".
- `require_specific` / `specific_options` / `exact_entities` machinery unchanged (kept intact per spec).
- Emits `gate_debug.domain`, `require_specific`, `compatible_entities` (consumed by the new
  `If-incoming-picker` + `probe-incoming`).

### b. `not-found-error-message` (code) — REPLACED jsCode
- Adds the **compatible_entities breakdown** block (`_compat` / `_dispByUuid` / `_resolvedToks`
  / `_byType` / `buildBreakdownMsg`):
  - `_dispByUuid` name priority now `product_name → customer_name → debtor_name → **type_name** →
    description → canonical_code` (attachment_type shows `type_name` before `description`).
  - `_resolvedToks` filter: tokens that resolved via fallback tiers (still in
    `unresolved_tokens`) are excluded from the "Couldn't find:" list.
  - header line `Here's what you want:` + per-type `• {entity_type}: {label}(+N more)`.
  - `_useBreakdown` gates both the `product_attachment` arm and the generic arm to use
    `buildBreakdownMsg(...)` when at least one entity resolved.
- Vague-token clarify arm + `require_specific → gate.gate_clarification` arm unchanged.

### c. `escalate-catalog` (code) — REPLACED jsCode
- `case 'not_found'` now falls back to `annotate-incoming-picker` when
  `not-found-error-message` did **not** execute:
  ```js
  const nfNode = $('not-found-error-message');
  const nf = nfNode.isExecuted ? nfNode.first().json : $('annotate-incoming-picker').first().json;
  ```
  Both nodes expose the same `escalate_message` / `require_specific` / `is_clarification`
  contract, so downstream flag derivation is identical regardless of which branch ran.

---

## Task 2 — new fail-branch nodes (mirror live wiring)

Added 3 nodes (live ids reused; verified non-colliding on the clone):

| node | id | type / typeVersion | egress? |
|---|---|---|---|
| `If-incoming-picker` | `4e18b4e7-8bdb-4df7-be71-5eec0d18804a` | `n8n-nodes-base.if` 2.3 | none (pure routing) |
| `probe-incoming` | `1fe8680b-d94a-41c4-af0c-0ebef46ce717` | `n8n-nodes-base.executeWorkflow` 1.3 | **READ only** (see egress map) |
| `annotate-incoming-picker` | `94f20f3e-4c35-4a70-8245-954de531bb3d` | `n8n-nodes-base.code` 2 | none (pure transform) |

- `If-incoming-picker` condition (AND): `$('disallowed-entity-gate').first().json.require_specific === true`
  **AND** `$('disallowed-entity-gate').first().json.gate_debug.domain === 'incoming'`.
- `probe-incoming` calls **`rysSPgUssLDf6xJc` = `sub-get-results TEST`** — this is the **clone's own
  get-results fork** (the clone's existing `Call 'sub-get-results'` targets the same id). `tool`
  = literal `crm_incoming_stock_list`; `entities` = `$('disallowed-entity-gate').first().json.compatible_entities`.
  Its `user_prompt` / `semantic_input` / `schema` are byte-identical to the clone's known-good
  `Call 'sub-get-results'` node (sha above); only `tool` differs (literal vs `$json.name`).
- `annotate-incoming-picker` reads `$('probe-incoming')` (try/catch guarded) + `$('disallowed-entity-gate')`,
  annotates each numbered picker line with ` — has incoming` / ` — no incoming`, sets
  `escalate_message` + `is_clarification=false`. Pure in-memory; no node I/O.

### Rewiring (clone `If3[0]` re-routed exactly as live 98a061cd)
```
REMOVED:  If3[0] -> not-found-error-message
ADDED:    If3[0] -> If-incoming-picker
ADDED:    If-incoming-picker[0 true]  -> probe-incoming -> annotate-incoming-picker -> build-suggest-offer
ADDED:    If-incoming-picker[1 false] -> not-found-error-message
(unchanged) If3[1] -> Execute 'sub-get-rag'
(unchanged) not-found-error-message[0] -> build-suggest-offer
(unchanged) build-suggest-offer[0] -> tag-not-found -> escalate-catalog -> cs-offer-gate
```
`build-suggest-offer` now has two inbound (not-found-error-message OR annotate-incoming-picker) —
matches live.

---

## Task 3 — orchestrator source repointed to `v_turns_r0704`

### capture `MGm32814G7XcGSD2`
- `Init Params`: added `source_view` (default **`v_turns_r0704`**); `conversation_ids` default
  changed to **null** (→ `$4::text IS NULL` → all contacts in the view = the 24 r0704 contacts);
  `run_label` default → **`r0704-capture`**; `min_turns` default already 1; `mode` stays
  `regress-capture`.
- `Select Turns` + `Purge Partial` queries rewritten as `={{ }}` expressions that interpolate
  `${view}` from `Init Params.source_view` for every `v_turns` reference (3 refs each). All
  `$1..$5` pg bind placeholders preserved literally (only `${view}` interpolates in the JS
  template). Both transformed queries were **executed read-only against the DB** — `Select Turns`
  returns **312 rows / 24 contacts**; `Purge Partial` inner-select parses/returns 0.
- Unchanged & already correct: `Insert golden_run` workflow_id `txiPzSxy3Pclsz6v`, `Fire Clone`
  → `txiPzSxy3Pclsz6v`, `Get Exec Id` filter `txiPzSxy3Pclsz6v`, `Reset Session If First`
  (`respond_contacts_test SET session_vars = seed_session_vars WHERE turn_index=1`).
- **Reversible:** set `source_view` back to `v_turns` (or pass it as a run param) to drive the
  2216 corpus again — no other change needed.

### replay `aROEBlQyyoQaB7a1`
- `Init Params`: added `source_view` (default `v_turns_r0704`); `replay_label` default →
  `replay-r0704-<stamp>`; `baseline_golden_run_id` left settable (tester supplies the
  `r0704-capture` golden_run id).
- `Select Turns` rewritten as `${view}`-interpolated expression. **Required**, not optional:
  r0704 turn ids (37825–38534) exist only in `v_turns_r0704`, not the corpus `v_turns`, so the
  golden-run-driven join would return 0 rows against `v_turns`. Parse-verified read-only.
- Pre-existing validation warning on `Get Exec Id` (`executionId … got undefined`) is on a node I
  did **not** touch — unrelated to this change.

## Task 4 — seed 24 r0704 contacts into `respond_contacts_test`
- All **24** r0704 `conversation_id`s already exist in `respond_contacts_test`, each with
  `seed_session_vars = '{}'` (neutral seed). **No insert needed.**
- 23 rows carry a non-empty `session_vars` (leftover compiled state from a prior run). This is
  harmless: `Reset Session If First` sets `session_vars = seed_session_vars` (= `'{}'`) at each
  contact's `turn_index=1` **before** the clone fires, so turn 1 always reads a clean empty
  session and threading is intact. No unrequested DB mutation was performed.
- Seed fidelity caveat still applies (LESSON 19): golden = clone behavior under a neutral-seed
  replay of historical messages, not reproduction of historical outcomes.

---

## §0 SAFETY — where egress is structurally blocked (assert every run)

The clone is **fail-closed**; this change added nothing that can egress:

1. **`If-incoming-picker`** — IF node, no I/O.
2. **`probe-incoming`** — `executeWorkflow` → `rysSPgUssLDf6xJc` (`sub-get-results TEST`), the
   clone's own get-results fork. `tool=crm_incoming_stock_list` is a **CRM READ** (explicitly
   allowed by the safety rule; CRM reads are permitted). It performs **no** send / assign / SLA /
   PIC-comment / session-write / contact-mutation. Same fork the clone's main get-results path
   already uses.
3. **`annotate-incoming-picker`** — code node, pure in-memory transform, no I/O.
4. **Downstream of the new branch** is the ordinary not-found/suggest path
   (`build-suggest-offer → tag-not-found → escalate-catalog → cs-offer-gate → …`). Its terminal
   send/write nodes remain **orphaned** — verified inbound-connection count = 0 for:
   `send-message-images`, `send-message-video`, `send-message-files`, `update-human-intervened`,
   `save-session-vars` (prod PUT), `Call 'sub-respond-save-message-redis'2`.
5. `Switch` media path still routes out0/1/2 → `guard-e-record` / `guard-f-record` /
   `guard-g-record` (redis egress-log no-ops), **not** the real `send-message-*` nodes.
6. All shared-sub `sendmsg` calls on the clone continue to pass `is_test=true` (unchanged by this
   change); capture runs in `mode=regress-capture` (real LLMs + real reads, session sourced from
   `n8n_test.respond_contacts_test`, egress blocked).

**Net egress surface added by this change: 0** (one CRM read via the clone's guarded fork).

## Validation
- Clone `update_workflow` applied 12/12 ops; all validation warnings are the **pre-existing
  known set** (LESSON 13): hardcoded `x-api-key` on http nodes, `DISCONNECTED_NODE` on the
  deliberately-orphaned egress nodes, OpenAI `builtInTools`, transcribe expression-prefix. **No
  new errors**; the 3 new nodes are NOT in the disconnected list (they are wired in).
- Orchestrator SQL transforms proven by direct read-only DB execution (312/24 for capture;
  parse-clean for replay + purge).

## For the tester
- Drive **capture** `MGm32814G7XcGSD2` (Start Capture, `mode=regress-capture`) → creates
  golden_run `r0704-capture` over the 24 contacts / 312 turns, per-contact / turn-ordered /
  session-threaded. Record each turn's new reply + branch; diff vs `v_turns_r0704.expected_reply`.
- Assert `test:egress:{run}` == 0 (only guard no-op records) every turn; STOP on any real send/write.
- Clone runs the **published** active version 8dd1eb1c. Orchestrators run their **current saved**
  state (manual-trigger; no publish pointer) — no extra publish step needed for them.
