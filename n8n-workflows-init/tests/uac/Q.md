# UAC §Q

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §Q. Query-forward sibling picker

### §Q1 — single exact, no incoming → sibling picker + escalate  (the flagship) ★
- **Chat input:** `check eta cb88ss`
- **Expect-branch:** `disallowed-entity-gate` exact-match-wins → `require_specific===false`,
  `compatible_entities=[CB88SS]`, `gate_passed===true` → `If3[FALSE]` → get-rag → `Call 'sub-get-results'`
  (`crm_incoming_stock_list`) → `validator.has_result===false` → `If6[FALSE]` → Loop → Aggregate1 →
  `not-found-error-message` → **`sibling-gate[TRUE]`** (incoming + require_specific false + product in
  compatible) → `family-fetch` (uncapped read) → `sibling-transform` (strict-prefix family) →
  `sibling-probe` (batched `crm_incoming_stock_list` over ALL sibling uuids) → `build-suggest-offer` **D3**.
- **Expect-output:** `build-suggest-offer.suggest_offer===true`. `user_response` lists **every** sibling
  (≥5: CB88SS + the 4 variants), each annotated exactly `— has incoming` or `— no incoming` (the exact
  `CB88SS` appears, annotated — it has none: `CB88SS — no incoming`), **sorted has-incoming-first then code
  order, NO cap**, followed by the escalate line naming **purchasing** team. `selection_context==='suggest_offer'`;
  `variables.last_result_set` (would-be-persisted, read from the guarded `save-session-vars` input) = the
  full sibling list `[{idx,label,value,product,uuid,entity_type:'product'}]`; `quick_reply` = `Yes, escalate` +
  `No, it's okay` ONLY (no per-sibling number buttons). The bare pre-change escalate string
  ("no incoming matched these") must NOT be the whole reply.
- **Assert annotation consistency:** every line marked `— has incoming` corresponds to a sibling whose code
  is in the `sibling-probe` returned items; every `— no incoming` is absent from it (V-Q3).
- **Safety:** §0 all. S2 n/a (no escalation this turn). S4 both tools reads.

### §Q2 — multi-exact, both no incoming → BOTH families gathered  (union)
- **Chat input:** `eta cb88ss and <second exact base with a family, e.g. srt-family base from V-Q1>`
- **Expect-branch:** both tokens resolve single-exact (two products in `compatible_entities`), both empty →
  same not-found path → `sibling-gate[TRUE]` → `family-loop` fetches EACH base's family → union (deduped by
  uuid) → one `sibling-probe` over the union → D3.
- **Expect-output:** ONE combined picker containing siblings of **both** families, numbered `1..N`
  continuous, each annotated + sorted has-incoming-first then code order; single escalate line.
  `suggest_last_result_set` covers both families.
- **Phase-1 note:** if the coder ships the single-fetch variant first (plan §3), this case is
  **KNOWN-DEFERRED** — mark BLOCKED-on-loop, do not fail the change; §Q1 still gates.
- **Safety:** §0 all.

### §Q3 — a sibling HAS incoming → annotation + sort correct
- **Chat input:** `check eta cb88ss` (same as §Q1; this asserts the has-incoming case explicitly)
- **Precondition:** V-Q1 confirmed ≥1 sibling in the family HAS incoming. (If none do, force this via the
  substitute base code from P-Q1 that has a mixed family.)
- **Expect-output:** every has-incoming sibling is annotated `— has incoming` AND appears **before** all
  `— no incoming` siblings (has-incoming-first); within each group, code ascending. The has-incoming
  sibling(s) are exactly the codes present in `sibling-probe` items.
- **Safety:** §0 all.

### §Q4 — reply "2" → re-query incoming for that sibling  (continuation)
- **Setup:** run §Q1 first (chat-stateful persists `selection_context:suggest_offer` +
  `last_result_set` + `domain_hint:incoming`). Then, same session:
- **Chat input (turn 2):** `2`
- **Expect (reformulator fork, structural):** `previous_conversation_state.selection_context==='suggest_offer'`
  → `output_exchange` maps `reference_positions:[2]` → position 2's `product` code as a current_message
  entity → `suggest-follow-up` inherits `domain_hint:'incoming'` (`domain_inherited_for_suggest` true),
  `message_type='business_query'`, `suggest_pick_context:true`.
- **Expect-branch:** the picked sibling code re-resolves exact → get-results `crm_incoming_stock_list` runs
  for **that** sibling. Output = its incoming detail (if it has incoming) OR — if that sibling also has no
  incoming — recursively the sibling picker again / plain escalate (acceptable; assert no crash, domain
  stayed incoming, no CS assign).
- **Safety:** §0 all. S2 — NO assignment (this is a data re-query, not an escalate). Assert
  `Call 'sub-human-intervention'` did NOT execute.

### §Q5 — reply "yes" → escalate to purchasing  (continuation)
- **Setup:** run §Q1 first. Same session.
- **Chat input (turn 2):** `yes`
- **Expect (reformulator fork):** `is_affirmative===true` under `selection_context:suggest_offer` →
  `suggest-follow-up` sets `escalation.is_escalation_confirmation:true`, `entities:[]`.
- **Expect-branch:** escalation confirmation → guarded human-intervention fork `vUfFUDjLAuMaeQE6`; team =
  purchasing (from `routing.suggested_team`).
- **Safety:** §0 all — **S2 focus**: the human-intervention sub short-circuited on `is_test` BEFORE
  `get-round-robin-assignee`; egress log shows `{guard:"human-intervention-sub", would_write, blocked:true}`;
  NO real `Assign or unassign`, NO SLA POST, NO PIC comment, NO assignee-queue push.

### §Q6 — zero siblings → plain escalate unchanged  (regression / fallback)
- **Chat input:** `check eta <an exact incoming code whose family = only itself, no incoming>` (a code with
  no `-variant` siblings; find one via V-Q1 returning a single-member family).
- **Expect-branch:** `sibling-gate` may enter the fetch path, but `sibling-transform` yields only the exact
  code (no extras) → **D3 returns false** → `build-suggest-offer.suggest_offer===false` → escalate-catalog
  plain escalate.
- **Expect-output:** the bare pre-change escalate message ("…escalate to purchasing team?"), byte-identical
  to today. No picker, no annotation.
- **Safety:** §0 all.

### §Q7 — non-incoming / require_specific / D1 / D2 unregressed  (regression guard)
- **§Q7a — order not-found (domain ≠ incoming):** `sibling-gate[FALSE]` (domain not incoming) →
  `build-suggest-offer` unchanged (D1/D2/plain escalate byte-identical). Chat: an order code with no
  results.
- **§Q7b — ambiguous incoming (require_specific true):** `ETA for SRTBF117` (multi-match prefix, no single
  exact) → `If3[TRUE] → If-incoming-picker[TRUE] → probe-incoming → annotate-incoming-picker →
  build-suggest-offer` — the EXISTING ambiguous availability picker, **unchanged** (sibling-gate not on this
  path). Assert the annotated numbered picklist renders as before.
- **§Q7c — D1 did-you-mean (unresolved incoming token):** an incoming token that does NOT resolve exactly
  (fuzzy candidates) → D1 fires as today; sibling-gate does not (no exact product in compatible). Assert D1
  output unchanged.
- **Safety:** §0 all.

### Coverage / notes (this change)
- **Business diff the reviewer promotes:** 5 new nodes (`sibling-gate` IF, `family-loop` splitInBatches
  [phase-1 optional], `family-fetch` httpRequest-READ, `sibling-transform` Code, `sibling-probe`
  executeWorkflow-READ) + `build-suggest-offer` (`7972abd8`) D3 edit + the not-found-path connection
  surgery. **No** parser/reformulator/`compile-current-state`/`escalate-catalog`/`disallowed-entity-gate`
  edit.
- **Cheapest checks first (plan §9):** V-Q1 (direct family read) + V-Q3 (batched probe) before any e2e chat.
- **CRUX:** the uncapped family is a NEW CRM **read** (`GET /master-data/products?query=<base>&variant_filter=all&limit=5000`,
  x-api-key) filtered strict-prefix in n8n — NOT the capped `resolutions[].matches` (resolver
  `PREFIX_LIMIT=20`), NOT an MCP tool (none exposes prefix/family). Reconciliation reuses the shipped
  `suggest-follow-up` (no reformulator edit).
- **Open items flagged in the plan:** (a) multi-product `family-loop` may be phase-2 (§Q2 deferred then);
  (b) a user typing a DEEP variant exact (`cb88ss-diy`) may under-gather the family (safe degradation —
  plan §2 open limitation); (c) V-Q1 confirms the products-list response shape (`id`+`product_code`).

---

# Change: `dym-candidate-map` (did-you-mean pick RETAINS prior customer + date)

Plan: `../plans/dym-candidate-map-plan.md`. Scope tag **`parser`** (reconciliation in fork `output_exchange`
= mock-blind; build/store hunks are deterministic spine Code, unit-testable offline). Multi-turn ⇒
`chat-stateful` (or `regress-capture`) driver + real reformulator; **replay is blind to the
`output_exchange` edit — do NOT use pinned replay for the CONSUME cases.** Every case bound by §0.
Bug: live `XTODTw` exec 8666864.
