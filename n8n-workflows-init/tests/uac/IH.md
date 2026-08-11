# UAC §IH — the immortal-hint class (C1 `immortal-hint-axis`, C2 `no-domain-name-hints`, C3 `multitoken-d1-annotate`)

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.** Read §0 + this file only.

Change: `immortal-hint-class`. Design: `plans/immortal-hint-class-plan.md`.
**Three sub-changes, two scope tiers — stated PER CASE, never inherited:**
**C1 = `parser`** (parser sub `output_exchange`, mock-blind, LESSONS §28),
**C2 = `parser`** (same node body — C1/C2/M2 are ONE write),
**C3 = `deterministic`** (spine `dym-transform` ×2, `dym-annotate` ×2, `build-suggest-offer`).

> 🚩 **Baseline corrections — bind before running anything.**
> - Clone moved: the request pins `2d1627c8`, live is **`5fdd12df`**. Export refreshed; re-run
>   `--verify` before trusting any line number.
> - Parser fork `wI5RkNGW3EOJfBdo` was **not in the export set**. 🛠 **It is now**, as
>   `export/sub-semantic-parser-FORK/`, so `--verify` covers it. It is still **STALE vs live
>   `XTODTw`** by the two `DOMAIN_BLOCKED_HINTS` `resource_attachment` lines — deliberately left
>   stale, so the C-hunk build carries no undeclared collateral change. **Never block-copy the fork
>   to live** (LESSONS §57); `oe-patch.py` re-applies hunks to a fresh live body
>   (`--c-only` = fork build, `--no-c` = B2′-only provenance). Measured 2026-08-08 against the built
>   fork: `diff fork ↔ oe-patch(live)` is **exactly one hunk**.
> - 🔴 **`tests/UAC.md` is STALE and `scripts/split-uac.py` MUST NOT be re-run** — it regenerates
>   `tests/uac/*` from the monolith, which is missing §MC entirely (48 refs), §CD-11 (15), §DP-19 (6),
>   §CD-BLIND (6). Running it would destroy them. This file is written directly.

> 🛠 **BUILT 2026-08-08. REV 3 after reviewer REQUEST-CHANGES.** Parser fork `wI5RkNGW3EOJfBdo` @
> **`184882c1`** (rev1 `aab47959`, rollback-all `95193323`); clone `txiPzSxy3Pclsz6v` @
> **`879d0f68`** (rev2 `a2422bb9`, rev1 `544138ca`, rollback-all `5fdd12df`).
> Rev 2 = **F1** (`inventory.probe_cap` `5 → 3`) + **F3** (`unknown_entity_hints` blind to dormant
> carried entities). Rev 3 = **F-STRIP** (`dym_capped_codes`/`probe_cap_applied` added to
> `_DYM_CTRL_KEYS`; `compile-current-state` comment-only) + **F-STALE** (all offline suites now load
> node bodies from `export/` via `tests/offline/node-source.js`; the eight stale local copies are
> deleted). Node diff:
> `tests/diffs/immortal-hint-class.md`. Manifests: `tests/manifests/immortal-hint-class/`.
> Offline suites (coder-side, no n8n): `tests/offline/immortal-hint-class/` —
> `ih-probe.js` (16 fixtures, RED 7/16 pre-change → GREEN 16/16),
> `ih-mutate.sh` (9/9), `c3-probe.js` (78 assertions), `c3-mutate.sh` (8/8).
> `oe.rev1-aab47959.js` is retained as the **F3 discriminator baseline**: it reddens `IH-3-CTRL`
> only, which is what proves `IH-3` was never the F3 gate.
> **Neither suite has a customer boundary** — every §IH clause below still has to be asserted on
> `save-session-vars.user_response` / the sendmsg payload in a real run (LESSONS §63i).
> 🔴 **All offline suites now read the PUBLISHED bodies from `export/`** and abort if the export is
> stale or a local `after` copy has drifted (`node-source.js`). When the dym suites were re-aimed at
> the real bodies, `byteid.js` went **11 RED** and `harness.js` **8 RED** — the gates were correct
> all along and were pointed at stale copies. All green again on `879d0f68`.
> The fork is now in the export set as `export/sub-semantic-parser-FORK/`, so §IH-0e is a `git diff`.

> 🔴 **The root cause is NOT what the change request assumed.** `product_attachment` in the hint
> field does **not** come from the LLM. Parser exec `11554793`'s `_parser_raw` (the frozen raw LLM
> object) shows the LLM emitted **two** correctly-hinted entities and no `M2399` at all. The writer
> is **code**: `output_exchange`'s reference-positions block, `hint = output.output.domain_hint ||
> 'promotion'` (fork `:583`). Cases below assert against that writer, not against prompt behaviour.

---

## §IH-0 — Standing preconditions and the inherited §0 binding

Clone `txiPzSxy3Pclsz6v`, parser fork `wI5RkNGW3EOJfBdo`, contact `437264483` (FULL access).

**§0 line, stated once and inherited by every case below:**
S1 no send (the D1/pick renders never reach a credentialed send node on the clone);
S2 no assign/SLA/PIC-comment;
S3 the **5 orphaned + 1 sinked** containment re-asserted **from the workflow JSON, not memory** —
including `Call 'sub-respond-save-message-redis'2`.`workflowId.value === 'tWm5DYLxfypmVC1T'` and that
fork's `Redis.list === 'sorento-respond-message-TEST'` as a literal;
**S4 every probe/lookup tool is a READ tool** — assert the `tool` string passed to `dym-probe` /
`dym-probe-partial` / `Call 'sub-get-results'` is exactly `crm_master_product_attachments_list` or
`crm_inventory_stock_balance_list`, and **never** a `_create`/write tool;
S5 `is_test/test_mode === true` on every sub call;
**S6 tier-bound token sinks — stated per case, because this family spans two tiers**
(`parser` ⇒ the reformulator LLM runs and nothing else; `deterministic` ⇒ **zero** LLM nodes execute);
S7a TEST-sink delta accounted, S7b prod-sink delta zero via **both** the per-poll `LLEN` series
**and** the per-poll pop payload, covering consumer execution ids recorded;
S8 no `is_test:false` run against any fork containing a credentialed node type;
S9 every mutation in §IH-FP proven to have applied (three-part procedure).

**Assert per-node `runData`, never execution status** (LESSONS §61a) — an unwired error output makes
a failed run report `success`. Every case names the node and the key it asserts.

**Assert at the CUSTOMER BOUNDARY** (`save-session-vars.user_response` / the sendmsg egress payload)
**in addition to** the producing node's object (LESSONS §63i). A case that asserts only the producer
**cannot** see the wrong-object class and is incomplete.

### §IH-0 preconditions (build-time GO/NO-GO, read-only, BEFORE any wiring)

- **§IH-0a (= plan §6-IH-V1) — the unrecognised-hint population, MEASURED.** `scope: n/a (read-only)`
  Over the last ~300 clone + live-spine executions, extract every `output.entities[].hint` from
  `Call 'sub-query-reformulator'` runData and bucket against `AXIS_BY_DOMAIN[domain] ∪
  HINT_AXIS_DEFAULT`. **Print the full distinct unrecognised set AND its count AND the compared
  population size.** An empty printout is **not** a pass.
  **NO-GO condition:** any unrecognised hint that is genuinely *orthogonal* to its domain's subject
  axis ⇒ C1's `DOMAIN_SUBJECT_AXIS` step is unsafe and C1 must ship as shared-axis-only.
- **§IH-0b (= §6-IH-V4) — `ordinal` really persists across turns (the M2 premise).** `scope: n/a`
  From a real multi-turn execution containing a positional pick, read `get-session-vars` on the
  **following** turn. **Assert** an `ordinal`-bearing entity is present in
  `previous_conversation_state.entities`. **FAIL ⇒ M2 is not real; §2.4 of the plan is WITHDRAWN**,
  not shipped on inference. Print the entity.
- **§IH-0c (= §6-IH-V2) — attachment rows per candidate.** `scope: n/a` Read-only
  `crm_master_product_attachments_list` with **15** known `product_ids` + one `attachment_type_ids`.
  **Record `answers.length`.** Calibrates `probe_cap` for `product_attachment` and establishes
  whether 15 candidates breach the backend default `limit=50` (`app/schemas/common.py:37`).
- **§IH-0d (= §6-IH-V3) — inventory rows per candidate + active-warehouse count.** `scope: n/a`
  Same for `crm_inventory_stock_balance_list`. **Record `answers.length` AND the distinct warehouse
  count.** If a 15-candidate probe returns **≥50** rows, **that call is the §IH-14 fixture** — record
  its exact `product_ids`.
- **§IH-0e (= §6-IH-V5) — fork↔live delta unchanged.** `scope: n/a` Re-run the live↔fork
  `output_exchange` diff. **Print the hunk count.** Expected: B2′'s four hunks + the one
  `DOMAIN_BLOCKED_HINTS` hunk. **Any additional hunk halts the promote.**
- **§IH-0f (= §6-IH-V6) — `-partial` twins byte-identical.** `scope: n/a` Normalised diff
  `dym-transform` vs `dym-transform-partial` and `dym-annotate` vs `dym-annotate-partial`,
  **before and after** the C3 edit. Anything beyond the two lane literals
  (`_PAYLOAD_SRC`/`_XF_SRC`) ⇒ **NO-GO**.

---

## C1 — `immortal-hint-axis`

### §IH-1 — the class assertion: no `__` axis survives a turn  `scope: parser`

**Trigger:** contact `437264483`, `mode=regress-capture`, **seeded** session (§IH-9 seed).
Message: `SRTWT2214 cert`.
**Path:** real reformulator → `output_exchange` executor → B2′ reconciliation pass.
**Assert (parser sub runData, `output_exchange` output):** recompute `_ceAxisFor` over
`output.entities` and assert **zero** entities resolve to an axis matching `/^__/`.
**Assert (customer boundary):** `save-session-vars.user_response` names **no** `M2399`.
This is the *class* gate — §IH-3 is the instance gate. Both are required; neither substitutes.

### §IH-2 — recognised hints are byte-identical  `scope: parser`

**Trigger:** clean session, `stock for SRTWT2214`.
**Assert:** every entity's computed axis is identical to the pre-change computation (run the
pre-change `_ceAxisFor` against the post-change output set and diff). C1's first two lookups are
unchanged and tried first — this proves it rather than assuming it.

### §IH-3 — 🔴 THE INSTANCE GATE: a pre-poisoned session is evicted  `scope: parser`

**Fixture carries realistic prior session state — mandatory (plan §9).** Seed via the `sim-inject`
lane:

```json
"previous_conversation_state": {
  "domain_hint": "product_attachment",
  "intent_hint": "check_product_attachment",
  "entities": [
    {"raw":"M2399","hint":"product_attachment","ordinal":1,
     "uuid":"487dfe36-cdc7-4950-b6dd-11c15879d568","canonical_code":"M2399","current_message":false}
  ]
}
```

**Trigger:** `SRTWT2214 cert`.
**Assert (parser runData):** `output_exchange` output entities contain **no** entity with
`hint === 'product_attachment'`, and none with `raw === 'M2399'`.
**Assert (customer boundary):** the reply contains **no** `M2399` and **no** second
`"M2399" — did you mean:` block.
**Why this shape:** clean-session C1 cases **cannot reproduce the bug at all** — the entity must
already be in state. A green clean-session run here is meaningless.

### §IH-4 — M2: the `ordinal` exemption is this-turn-only  `scope: parser`

> 🛠 **CORRECTED AT BUILD TIME — the original assertion below does not follow, and the obvious
> fixture for the second arm is vacuous.** An entity is **not removed for being carried**. What
> `_ceIsCarried` drives is (a) whether an entity counts as a this-turn **contribution** and (b) B2′
> part 4's drop filter. And the reference-positions block does
> `output.output.entities = [...resolved]` — a **wholesale overwrite** — so a carried certificate
> can never reach the reconciliation pass on a pick turn, and `carried_attachment_evicted` can never
> fire there. Use the two arms below; offline equivalents are `IH-4a`/`IH-4b` in
> `tests/offline/immortal-hint-class/ih-cases.js`.

**Arm A — eviction (the C1-without-M2 regression).** Seed prior state with an `ordinal`-bearing
product **and** a carried `certificate`; this turn the LLM emits **nothing** (a reuse/continuation
turn). **Assert** the carried certificate is **RETAINED** and `carried_attachment_evicted` is
**absent** — the ordinal entity is carried, so it contributes nothing and B2′ part 4 must not fire.
Pre-M2 (with C1) the certificate is wrongly evicted on a turn where nothing changed.

**Arm B — the pick (must stay GREEN).** A genuine positional pick this turn over a result set whose
row 2 is a **certificate already present in prior state**, alongside a product row. The product
contributes `product_scope`, so a freshly-picked certificate misclassified as carried would be
**dropped**. **Assert** it is **RETAINED**.

**Both arms are required**: a case that only shows eviction cannot distinguish "exemption made
this-turn-only" from "exemption removed entirely". §IH-FP-3 reddens arm A; §IH-FP-3b (never record
the this-turn pick) reddens arm B.

**Assert (customer boundary):** the reply on arm A still answers about the certificate.

### §IH-5 — C1 must not break B2′'s certificate eviction  `scope: parser`

**Trigger:** the §CD-10 F-CARRY-NARROW shape — seed `PC 000078` as a carried `certificate`, then
`SRTWT2214 cert`.
**Assert:** the carried certificate is still evicted (B2′ Part 4 unchanged), `entity-ids-transformer`
emits **no** `certificate_ids`, and the reply returns `SRTWT2214`'s real certificate rather than a
confident denial. `certificate`/`attachment` are **mapped** by B2′ Part 1 and must never reach C1's
fallback — assert their computed axis is `attachment_scope`, not `product_scope`.

---

## C2 — `no-domain-name-hints`

### §IH-6 — 🔴 the poisoning is CREATED by the code under test, not injected  `scope: parser`

**Two-turn real sequence, clean session, `mode=regress-capture`.**
Turn 1: `certificate for SRTWT2214` → an answered `product_attachment` result set.
Turn 2: `1` (a positional pick over that result set).
**Assert (parser runData, turn 2, `output_exchange` output):** the minted entity's `hint` is
**`product`** — **never** `product_attachment`, and never any value in the `domain_hint` enum.
**Assert:** `_parser_raw.entities` is unchanged in shape (the LLM's own output was never the
problem) — this is what proves the fix landed in the **code path**, not in prompt behaviour.
**Assert (customer boundary):** turn 2 answers about the picked product.
**Why two real turns:** injecting the poisoned entity would test C1, not C2. C2 is only exercised
when the reference-positions block actually runs.

### §IH-7 — the labelled-prefix arm is unchanged  `scope: parser`

**Trigger:** a positional pick over a result set whose labels DO carry a `"<type>: "` prefix
(`HINT_MAP` hit — e.g. a promotion or order set).
**Assert:** `hint` is taken from `HINT_MAP` exactly as today; byte-identical to the pre-change run.
Guards against C2 changing the `sep !== -1` arm it is not meant to touch.

### §IH-8 — 🔴 no-regression: the dropped `'promotion'` tail  `scope: parser`

C2 **removes** the legacy `|| 'promotion'` default. **Assert** a positional pick on a **promotion**
result set still mints `hint: 'promotion'` (now via `DOMAIN_SUBJECT_HINT`), byte-identical.
**Discriminator:** also run a pick with `domain_hint === null` and assert the hint is `'product'`,
not `'promotion'` — proving the tail actually changed where it was supposed to. **Without this arm
the case cannot tell the new map from the old default.**

### §IH-9 — the narrow guard rejects an off-enum hint  `scope: parser`

**Trigger:** seed a result-set row whose `entity_type` is a junk string (`"widget"`).
**Assert:** `KNOWN_ENTITY_HINTS` rejects it and `DOMAIN_SUBJECT_HINT[domain]` is used instead;
`unknown_entity_hints` diagnostic is **absent** (the guard prevented the unknown from being minted).

---

## C3 — `multitoken-d1-annotate`

> **All C3 cases: `scope: deterministic`.** Parser pinned via `mock_reformulator_output`;
> `get-results`/probe runs real read-only. **S6 ⇒ zero LLM nodes executed** — assert it.
> ⚠️ **Fixture must be GENUINELY multi-token** (plan §7.2): two real product codes the user typed in
> one message, both missing — e.g. `srtwc8317-rl1 and srtub2232-1600 cert`. **Not** a stuck-entity
> artefact: once C1/C2 land, the reported transcript collapses to a single token and would pass
> without running any C3 code.

### §IH-10 — pre-change baseline, captured BEFORE the edit  `scope: deterministic`

Run the §IH-11 fixture against the **un-edited** clone and **retain the exact
`suggest_response`, `suggest_quick_reply`, `suggest_last_result_set`, `dym_candidates` strings**.
Every byte-identity claim in §IH-11/§IH-13/§IH-14 diffs against **this captured artifact**, not
against a re-derivation. A byte-identity assertion with no captured baseline is void.

### §IH-11 — 🔴 the headline: multi-token D1 annotates, numbering never moves  `scope: deterministic`

**Trigger:** the genuine multi-token fixture, `product_attachment`, both tokens missing with
candidates, scoping `attachment_type` uuid present.
**Assert (`build-suggest-offer` runData AND customer boundary):**
1. every **probed** code carries `- has <noun>` or `- no <noun>`;
2. every **unprobed** code (multi-uuid / capped / unmappable) is **BARE** — never a misleading `- no`;
3. **numbering identical to §IH-10**: strip all ` - has …`/` - no …` suffixes from
   `suggest_response` and assert the result is **byte-identical** to the captured baseline. This is
   the anti-renumber gate and it is the whole reason C3 is allowed to exist;
4. `probe_lane === 'd1'` and `probe_skip_reason === null` — so the case **cannot pass by failing to
   probe**;
5. `probe_skip_reason` is **never** `'multi_token'` on either lane (the literal is retained
   deliberately; its appearance means the gate did not open).

### §IH-12 — the two scope questions, asserted not assumed  `scope: deterministic`

**(a) Cannot span both enabled domains.** Assert from runData that `dym-transform` resolved exactly
**one** `cfg` (`probe_tool` is a single string) and `dym-probe` made exactly **one** sub-call for the
turn, regardless of token count.
**(b) Mixed entity types are excluded, not mis-probed.** Fixture where one missed token's candidates
are `category`/`brand`. Assert those codes are **absent** from `dym_candidate_codes` (not in
`MAPPABLE`), counted in `droppedOther`, and render **BARE** — while the `product` token's codes are
annotated normally.

### §IH-13 — the probe cap: overflow renders bare  `scope: deterministic`

> ✅ **`probe_cap` IS NOW MEASURED** (tester pass 2, exec `11646010`) — it shipped uncalibrated in
> rev 1 and `inventory` was **wrong**. Current values: `product_attachment: 8` (confirmed safe,
> ~0.8–1.3 rows/candidate ⇒ ~10 of 50) and **`inventory: 3`** (was 5).
> 🔴 **The grain is warehouse × SYSTEM-LOCATION, not warehouse** — a single stocked candidate
> returned **13 rows**. So `5 × 13 = 65 > 50` saturated every time; the failure is fail-closed, but
> the feature then silently vanishes on exactly the multi-token inventory turns it exists for.
> **DO NOT RAISE `inventory` without re-measuring the grain.** New arm **§IH-13b** gates this:
> `3 × 13 = 39 < 50` ⇒ annotation survives, plus the counterfactual that 5 would saturate.
> Plan arithmetic slip, still standing: §4.5's "15 × 3 attachments-of-type also breaches 50" is
> wrong (45 < 50) — `inventory` is the real driver, and by more than §4.5 estimated.

**Trigger:** 5 surviving tokens × 3 candidates = 15, exceeding `DOMAIN_PROBE[domain].probe_cap`.
**Assert:** `probe_cap_applied === true`, `dym_capped_codes[]` non-empty, the capped codes render
**BARE**, the uncapped ones are annotated, numbering still byte-identical to baseline, and the turn
does **not** dead-end.

### §IH-14 — 🔴 page saturation ⇒ zero annotation (the confident-false-negative gate)  `scope: deterministic`

> 🛑 **BLOCKED BY DESIGN — reclassified by the reviewer, 2026-08-08. Same status and reasoning as
> the `_dym_probe_input` sentinel branch.** This case guards a defence against a condition the
> system is now *engineered not to reach*: with `probe_cap` measured (`inventory: 3` at 13
> rows/candidate, `product_attachment: 8` at ~1) a real probe **cannot** return ≥50 rows, so no
> live fixture can exist without first breaking the cap. That is the mitigation working, not a
> coverage gap.
> It stays covered offline: `c3-probe.js` drives the branch with a synthetic 50-row answer set plus
> a **49-row boundary case** proving the gate is an instrument and not a constant, and `§IH-FP-9`
> reddens it on demand. **Do not chase a live fixture** — obtaining one would require shipping a
> cap known to be unsafe.

**Fixture: the §IH-0d call that returned ≥50 rows.** If §IH-0d could not produce one, this case is
**BLOCKED, not passed** — record it as blocked.
**Assert:** `dym_probe_meta.ok === false`, `reason === 'page_saturated'`, `dym_available_codes === []`,
and `suggest_response` is **byte-identical to the §IH-10 baseline** (no suffix anywhere).
**Why this case exists:** truncation is structurally undetectable — the render envelope
(`presenters.py:806-818` + `_PASSTHROUGH_KEYS`) carries **no** `total`/`pagination`, and
`output-structurer.js:84-95` would drop it anyway. Without this gate, a truncated probe labels a
product `- no certificate` when it has one.

### §IH-15 — the `-partial` twins carry the same edit  `scope: deterministic`

Re-run §IH-0f **after** the edit. **Assert** the normalised diff of `dym-transform` vs
`dym-transform-partial` and `dym-annotate` vs `dym-annotate-partial` is empty apart from the two
lane literals. Then run the **partial** lane's own multi-token fixture and assert cap + saturation
behave identically there. The partial lane already shipped multi-token — it inherits both
mitigations or it keeps the pre-existing truncation defect.

### §IH-16 — C3 scope: everything else byte-identical  `scope: deterministic`

Non-enabled domains (`order`, `master_products`, `promotion`), single-token code mode, single-token
numbered mode, and both D2 arms: **byte-identical to the §IH-10 baseline** on a pinned fixture.

---

## §IH-FP — fail-on-purpose. Discriminator SHAPES, not convenient turns

> **This is the FIFTH instance of the class.** §CD-2/3/4 as written **could not** redden their own
> mutation; only `FP1-D`/`FP2-D`/`FP3-D` could. §CD-BLIND records it. **Every mutation below must
> satisfy §0 S9's three-part procedure** — assert the search string occurs **exactly N>0** times
> BEFORE substituting, assert the file digest **CHANGED** after, and **abort without running the
> suite** on either failure. A suite result obtained without both assertions is **VOID**, not weak.
> Reference implementation: `tests/offline/dym-probe-before-offer/mutate.sh`.

| id | mutation | must redden |
|---|---|---|
| **§IH-FP-1** | revert `_ceAxisFor`'s fallback to `` `__${hint}` `` | §IH-1, §IH-3. 🛠 Offline-measured red-set: `IH-3` + the class gate on the reuse-turn control. ⚠️ **The gate must use the body's OWN `_ceAxisFor`, not a re-implementation** — a re-implemented two-step fallback stays green on a body that has the bug back (this happened while building the probe: the wrong-object class, inside the instrument built to detect it) |
| **§IH-FP-2** | drop only the `DOMAIN_SUBJECT_AXIS` step, keep `'unscoped_scope'` | **§IH-3 only.** §IH-1 stays green — this is the discriminator proving the shared-axis-only variant is *inert on the reported transcript* (plan §2.2's rejected option). If §IH-3 also stays green, §IH-3 is not a valid instance gate |
| **§IH-FP-3** | restore `if (e.ordinal !== undefined) return false;` | §IH-4 **arm A (eviction)** — and §IH-4 **arm B (pick)** must stay GREEN |
| **§IH-FP-3b** | 🛠 **ADDED:** never record the this-turn pick (`_ceRefPickedKeys.add(...)` removed) | §IH-4 **arm B** only. Without this step §IH-FP-3 alone cannot tell "exemption made this-turn-only" from "exemption deleted" — both make arm A green |
| **§IH-FP-4** | restore `hint = output.output.domain_hint \|\| 'promotion'` at `:583` | §IH-6 |
| **§IH-FP-5** | change `DOMAIN_SUBJECT_HINT.promotion` to `'product'` | §IH-8 **first arm**; §IH-8's null-domain arm must stay green |
| **§IH-FP-6** | restore `_survivors.length === 1 ? _survivors : null` in **both** `dym-transform` copies | §IH-11 clauses 4+5 (`probe_lane`/`probe_skip_reason`) — **not** merely the suffix clause, which would also redden if the probe simply failed. 🛠 Offline-measured full red-set also includes §IH-11.1/§IH-11.probe, §IH-12a/12b, §IH-13, §IH-14; §IH-15 stays green (both twins mutated alike) |
| **§IH-FP-7** | apply the has-first sort from D3 to the multi-token `picks` | **The suffix clauses (§IH-11.1) MUST stay green** — that is the point of this step. 🛠 Offline-measured red-set: §IH-11.3 (anti-renumber) **plus** §IH-11's `suggest_last_result_set`/`dym_candidates` invariants and §IH-13's numbering assertion, because sorting `picks` reorders those arrays too. "Clause 3 ONLY" as written is too narrow |
| **§IH-FP-8** | annotate `p.label` instead of the rendered line | §IH-11's `suggest_last_result_set[].label` bare assertion. 🛠 **CORRECTED:** it does **not** redden §IH-16 and must not be scored as if it should — §IH-16 exercises the SINGLE-token code-mode arm, which C3 does not touch. Measured offline |
| **§IH-FP-9** | raise `_PAGE_SATURATION` above the fixture's row count | §IH-14 |
| **§IH-FP-10** | remove the cap so all 15 are probed | §IH-13 (+ §IH-15's partial-lane cap assertion) |
| **§IH-FP-11** | apply C3 to `dym-transform` only, not `-partial` | §IH-15 |
| **§IH-FP-F1** | 🛠 **ADDED (pass 2):** restore the unsafe `inventory: probe_cap = 5` | **§IH-13b only.** `product_attachment` is untouched by F1 and its live-proven arm must stay green |
| **§IH-FP-F3** | 🛠 **ADDED (pass 2):** remove the dormant-carried-entity sweep from the diagnostic | **§IH-3-CTRL only.** §IH-3 must stay GREEN — there the executor's prior-filter classifies the entity anyway, which is why §IH-3 could never have been the F3 gate |

**§IH-FP-D — the rendered-text discriminator (LESSONS §63iv).** For §IH-11, run the **pre-change**
`build-suggest-offer` body against the **post-change** `dym-annotate` output and assert
`suggest_response` comes back **WITHOUT** any suffix. This proves the rendered-text gate can
distinguish the two bodies rather than being taken on trust. Required before §IH-11 is signed off.

**§IH-FP-R — renderer enumeration by RENDERED STRING, not graph inbound (LESSONS §63ii).**
Before sign-off, grep every Code node in the clone **and** live spine for the literal
`— did you mean` **and** `Couldn't find some items` and confirm the surface list is complete.
Inbound-enumeration missed **2 of 4** surfaces last time and a user found one by typing.
Then, for `suggest_response` / `escalate_message`, scan for **all three** by-name re-source forms —
`$('X')`, `$("X")`, and the **two-hop** `const v = $('X'); … v.first().json.key` — and record the
true consumer list. A line-based `grep "$('"` is **not sufficient** and has already produced a wrong
answer once.
</content>
