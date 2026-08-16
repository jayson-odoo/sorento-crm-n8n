# UAC §CD — `carried-certificate-dump` (B1 `attachment-subject-gate`, B2 `certificate-axis-carry`)

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.** Read §0 + this file only.

Change: `carried-certificate-dump`. Design: `plans/carried-certificate-dump-plan.md`.
**Two sub-changes, two scope tags — stated per case, never inherited:**
**B1 = `deterministic`** (spine `disallowed-entity-gate`, ✅ landed on clone `2d1627c8`),
**B2′ = `parser`** (parser sub `output_exchange`, mock-blind, LESSONS §28).

> 🔴 **2026-08-07 — B2 (`certificate-axis-carry`) is NO-GO and is superseded by B2′ (plan §3.6).**
> The §CD-7 B4 gate closed against it: carried entities *are* re-flagged `current_message: true` by
> `applyDymPick`, and that defeats B2's eviction on the modal post-B1 turn. New/changed cases:
> **§CD-BLIND** (measured FP-blindness in §CD-2/3/4), **§CD-3** (fixture corrected — `MWC7602-RL-P` does
> not resolve), **§CD-7** (gate closed, repurposed), **§CD-9** (picker render), **§CD-10**
> (F-CARRY-NARROW), **§CD-11** (the B4 bypass — *the* discriminating case), **§CD-FP-6…9**.
> ⚠️ **Fork `wI5RkNGW3EOJfBdo` is STALE vs live `XTODTw` inside `output_exchange`** (plan §3.4) — build
> LIVE + own hunks, never block-copy.

## §CD-0 — Standing preconditions and the inherited §0 binding

Clone `txiPzSxy3Pclsz6v`, contact `437264483`. **Session state is the independent variable in this whole
family**, so:

- Every case that needs prior state uses the **`sim-inject` seeded-session lane**: put
  `previous_conversation_state` on the redis item →
  `if-message-is-audio[1] → sim-inject-gate[0] → sim-inject-session → get-session-vars`.
  `sim-inject-gate`'s condition is
  `{{ !!($('redis-pop-main-message-list').first().json.message.previous_conversation_state) }}` — mode
  independent, and it bypasses the prod session read entirely.
- Every case that needs a **clean** session omits that key AND resets the `respond_contacts_test` row.
- **Never** reset between the turns of a multi-turn case.

📌 **LESSONS §31 is STALE on this point** — "injecting `previous_conversation_state` in the redis item
does NOT work" predates the `sim-inject` lane. Do not skip the lane on the strength of that lesson.
Update LESSONS when this change lands.

**§0 binding, stated once and inherited:** S1 no send; S2 no assign/SLA/PIC; S3 the 5-orphaned +
1-sinked containment re-asserted **from the clone JSON**; **S4 every tool passed to any get-results call
is a READ tool** — for this family also assert it is `crm_master_product_attachments_list` or nothing,
never a `_create`; S5 `is_test/test_mode === true` on every sub call; **S6 per case's own scope tag**;
S7a/S7b sink-delta + payload attribution with both signals and execution ids recorded (a non-zero prod
delta **halts**; an unretrievable consumer execution is **UNATTRIBUTABLE → FAIL**); S8 no `is_test:false`
run against a fork holding a credentialed node type; S9 every §CD-FP mutation proven applied (occurrence
count > 0 **and** digest changed) or the result is **VOID**.

**Assert per-node `runData`, never execution status** (LESSONS §61a).

🔴 **Every rendered-text assertion is made at the CUSTOMER BOUNDARY** — `save-session-vars` input
`user_response` and/or the sendmsg egress payload — in addition to the producing node (LESSONS §63).

---

---

## §CD-BLIND — 🔴 CONFIRMED FP-BLINDNESS in §CD-2/3/4 (fourth instance of LESSONS §61)

**Measured, not suspected** — tester run `runs/carried-certificate-dump-B1-20260807.json`, via the
coder's `mutate.sh` with occurrence-count + digest gates. Each of B1's three guard terms was mutated and
**every §CD-prescribed case stayed GREEN**; only the coder's own discriminator fixtures reddened:

| mutation | expected RED per this file | actually RED | why the prescribed case is blind |
|---|---|---|---|
| **FP-1** `domain === 'product_attachment'` → `true` | §CD-4 | **only `FP1-D`** | §CD-4's turns already have `gate_passed === false` at B1, so the `gate_passed &&` short-circuit means the domain guard is never evaluated |
| **FP-2** drop `&& !_haveProduct` | §CD-3 | **only `FP2-D`** | §CD-3's turn has `unresolved_tokens: []` ⇒ `_missedSubject` false ⇒ the predicate is false either way |
| **FP-3** product-hint filter → accept all hints | §CD-2 | **only `FP3-D`** | §CD-2's turn has `unresolved_tokens: []` **and** `product_raws: []` ⇒ false either way |

**So §CD-2, §CD-3 and §CD-4 as originally written would have certified B1 while proving nothing about
any of its three guard terms.** They are still valuable — they are the over-block regression guards — but
they are **not** the fail-positive instruments and must never again be cited as such.

🔴 **BINDING AMENDMENT.** §CD-FP-1/2/3 are satisfied **only** by a fixture with the discriminator
*shape*, never by the §CD-2/3/4 turns. Each shape is stated inline in the case below. A run that reddens
a discriminator is a pass; a run that reddens only a prescribed case, or nothing, is **VOID** (§0 S9).
Required discriminator shapes:

- **FP1-D** (proves the domain guard) — `gate_passed === true` at B1, a **missed product raw**, **no**
  product in `compatible_entities`, and domain **≠** `product_attachment` (use `inventory`). Only such a
  turn can distinguish `domain === 'product_attachment'` from `true`.
- **FP2-D** (proves `!_haveProduct`) — `_missedSubject === true` **AND** a product present in
  `compatible_entities` (a missed raw alongside a *second, resolving* product token). Only such a turn
  can distinguish `_missedSubject && !_haveProduct` from `_missedSubject`.
- **FP3-D** (proves the `hint === 'product'` filter) — a **non-product** parser entity whose raw appears
  in `unresolved_tokens`, with no product in `compatible_entities`. Only such a turn can distinguish the
  filtered set from the unfiltered one.

**Generalisation for every future §CD case:** state, per assertion, *which mutation it is supposed to
catch*, and require that mutation to redden **that** case. An assertion with no named mutation is
documentation, not a gate.

---

## §CD-0b — 🔴 STANDING: B1 PRESENCE GATE — run before every pass that mentions B1

> **This exists because B1 was silently reverted and nobody noticed for a day.**
> On 2026-08-07 a UI save from a stale editor tab (the same window that removed
> `get-presigned-url`) reset `disallowed-entity-gate` to its pre-B1 body. Every clone version
> from `b94eea53` (08-07 07:46) through `879d0f68` (08-08 04:41) carried the **pre-B1** sha
> `7626c83e`. **A coder, two testers and a reviewer all passed over it.**

**Why nothing caught it — read this before writing any B1 assertion.** B2′ (parser-side
certificate eviction) shipped in between. With the carried certificate evicted, the 26-row dump
**cannot occur whether or not B1 is present**. So `srtwc8317-rl1 cert → did-you-mean, no dump`
kept passing, correctly, in both states. The assertion was real and it could go red — it simply
had **no power against this particular difference**. That is LESSONS §61's class arriving by a new
route: not "green that cannot fail", but *green that cannot **discriminate***. **A downstream fix
can mask an upstream fix's absence, and behaviour looking right is not evidence the change is
still there.**

**Two binding rules:**

1. **Verify PRESENCE by node sha at the start of every pass**, not merely that behaviour looks
   right:
   ```bash
   tests/offline/carried-certificate-dump/assert-b1-present.sh   # exit 0 == B1 present
   ```
   Expected `disallowed-entity-gate` sha256 **`a8938abe…`**. The pre-B1 body is **`7626c83e…`** —
   if you see that, **B1 has been reverted; record no B1 result from that pass.** Any other value
   means a third party edited the node: diff before doing anything.
2. **The B1 assertion must be STRUCTURAL, never text.** The discriminator is
   **`Call 'sub-get-results'` absent from runData** (§CD-1). B1 dead-ends *before* the sub is
   called; with B1 absent but B2′ active the sub still runs and returns a correctly-scoped result
   with **the same customer-visible text**. Same text, different execution shape — so only
   execution shape can tell them apart.

   Graph-sound in the direction we assert: `If3[0]` (the B1 branch) **provably cannot reach**
   `Call 'sub-get-results'` — verified by reachability over the clone's `connections`, and
   re-checkable offline:
   ```bash
   node tests/offline/carried-certificate-dump/discriminator.js gate.after.js   # exit 0 = B1-present
   node tests/offline/carried-certificate-dump/discriminator.js gate.before.js  # exit 1 = B1-ABSENT
   ```
   Proven red against the real B1-absent clone body before B1 was restored.

---

## §CD-0a — build-time GO/NO-GO (read-only, BEFORE any wiring)

- **§CD-0a-1 — the fixtures still resolve.** ✅ **Re-confirmed live 2026-08-07** (clone execs `11524951`,
  `11525030`): `PC000078` → certificate `aa10fd73-96bf-4418-91c3-7780a36305fe`, `match_tier: exact`,
  `validity_state: "expired"`, `valid_until 2025-09-13`; `certificate` → attachment_type `Certification`
  `1439736c-20ca-4bba-b387-b242ff4a4599`, `match_tier: substring`. **Still print both** each run —
  different uuids ⇒ update §CD-1's seed, do not proceed on the old ones.
  🔧 **NEW, blocking §CD-3b:** also resolve **`PC000373`** (SRTWT2214's real certificate) and **print its
  uuid**. It is not established anywhere. Do **not** guess it and do **not** reuse `aa10fd73-…`.
  ⚠️ **`MWC7602-RL-P` does NOT resolve** (`matches: []`) — it is unusable as a "resolving product"
  fixture; see §CD-3. The `uuid: 72aa8105-…` carried for it in the §4.2 seed no longer resolves either;
  that is harmless for a *seeded state* but must not be reused where a real lookup is expected.
- **§CD-0a-2 — the dump is still reproducible pre-fix.** Run §CD-1's seed **against the unmodified
  clone** and confirm ≥20 rows, the file `WCM PC 000078 - EXP 13 SEP 2025.pdf`, and an attachment.
  **A fix whose defect cannot be reproduced first is not a verified fix.** Print the row count.
- **§CD-0a-3 — the control still passes.** Same text, clean session, unmodified clone → correct
  did-you-mean (reproducing exec `11509954`). Print the reply.
- **§CD-0a-4 — the residual from plan §2.2.** Pull runData for `chat_histories` turn `9151545`
  (`mwc7601-rl-p cert`) or re-drive it seeded, and establish whether `product_ids` was absent because
  the token failed to resolve or because `compatible_entities` was replaced upstream. **This decides
  whether B1 covers that turn.** Report an honest unknown if the execution has aged out — do **not**
  assume B1 covers it.

---

## §CD-1 — 🔴 the reported dump, seeded  ·  B1  ·  `scope: deterministic`

- **Trigger:** message `srtwc8317-rl1 cert`, contact `437264483`, redis item carrying:
  ```json
  "previous_conversation_state": {
    "domain_hint": "product_attachment",
    "intent_hint": "check_product_attachment",
    "entities": [
      {"raw":"MWC7602-RL-P","hint":"product","uuid":"72aa8105-…","canonical_code":"MWC7602-RL-P"},
      {"raw":"Certification","hint":"attachment_type"},
      {"raw":"PC000078","hint":"certificate","canonical_code":"PC 000078"}
    ]
  }
  ```
  Pin `mock_reformulator_output` to the LLM's real output for that turn:
  `message_type:business_query`, `domain_hint:'product_attachment'`,
  entities `[{raw:'srtwc8317-rl1',hint:'product',canonical_code:null,current_message:true},
  {raw:'cert',hint:'attachment_type',canonical_code:'certificate',current_message:true}]`.
  > ⚠️ The mock feeds a branch that **skips `output_exchange`**, so the carried entities must be merged
  > into the mock's `entities` by hand to model the post-merge state. State this in the run log — the
  > mock reproduces the *state*, not the merge that produced it. B2 (§CD-5) is where the merge itself is
  > exercised.
- **Expected branch/path (post-B1):** `resolve-entity → disallowed-entity-gate` **fails**
  → `not-found-error-message → sibling-gate[1] → dym-transform → … → build-suggest-offer` D1.
  `Call 'sub-get-results'` **must not execute**.
- **Structural assertions:**
  - `resolve-entity`: `unresolved_tokens` contains `srtwc8317-rl1`.
  - `disallowed-entity-gate`: `gate_passed === false`; `gate_reason` matches
    `/subject product did not resolve/`; `compatible_entities` contains **no** entity with
    `entity_type === 'product'`.
  - 🔴 **`Call 'sub-get-results'` absent from runData — THIS IS THE B1 DISCRIMINATOR (§CD-0b),
    not an optional extra.** Assert absence of the **node in runData**; never a status, never the
    reply text. With B2′ active the reply text is identical whether or not B1 is present, so this
    is the **only** assertion in §CD that can distinguish B1-present from B1-absent. A §CD-1 run
    that does not record this line **cannot be signed off**, and a pass without it may not be
    cited as evidence B1 works.
  - If it *did* run (B1 mis-fired open, or B1 is missing), then `entity-ids-transformer` must
    carry **no** `certificate_ids` key. Assert both, so the case cannot pass for the wrong reason.
- **🔴 Customer-boundary assertions** on `user_response` / the sendmsg payload:
  - contains `Did you mean` and `SRTWC8317-RL`;
  - contains **none** of `PC 000078`, `PC000078`, `WCM PC 000078`, `Validity`, `Expired`;
  - the egress payload carries **no attachment / no presigned URL**;
  - fewer than 5 numbered lines (the pre-fix reply had 26).
- **Safety:** §0 all; **S6 `deterministic` ⇒ zero LLM nodes executed.**

## §CD-2 — the legitimate certificate listing is PRESERVED  ·  B1  ·  `scope: deterministic`

The single most likely way to break B1 is to over-block.

- **Trigger:** `certification with number PC000078`, **clean** session. Pin
  `mock_reformulator_output` with entities `[{raw:'PC000078',hint:'certificate'},
  {raw:'certification',hint:'attachment_type'}]` — **no `product` hint at all**.
- **Expected:** B1 does **not** fire; `gate_passed === true`; `Call 'sub-get-results'` runs;
  `entity-ids-transformer` emits `certificate_ids`; the customer receives the list of products that
  certificate covers.
- **Assert:** `gate_reason === 'ok'`; the reply contains `PC 000078`.
- **This case must PASS both before and after B1.** A pre/post diff of `user_response` must be empty.
- **FP binding:** **NOT** the instrument for §CD-FP-3 (§CD-BLIND). Use **FP3-D**.
- **Safety:** §0 all; S6 zero LLM nodes.

## §CD-3 — a RESOLVING product + `cert` still intersects  ·  B1  ·  `scope: deterministic`

🚩 **FIXTURE CORRECTED 2026-08-07 — this case never ran.** The prescribed `MWC7602-RL-P`
**does not resolve** (clone exec `11524951`: `resolved:false`, `matches:[]`,
`unresolved_tokens:["MWC7602-RL-P"]`; trgm alternatives only). Also the old wording said *"clean session,
with a `certificate` entity seeded"*, which is self-contradictory. Both fixed below.
⚠️ **Never substitute `MWC7602-P`** — two uuids (`eba62893-…`, `1c9460bb-…`), the
code-unique-per-**company** shape (LESSONS §61c); an ambiguous fixture cannot test an exact resolve.

- **Fixture:** **`SRTWT2214`** — `match_tier: exact` (clone exec `11525013`); real certificate
  **`PC 000373`**, file `WCM - Cold Tap - EXP 13 SEP 2026.pdf`, `Validity: Valid`.
- **§CD-3a — clean session.** `SRTWT2214 cert`, no `previous_conversation_state`. Expect the product's
  own certificate returned. (Reproduces the tester's `CD4-CONTROL-clean`. Green today.)
- **§CD-3b — the real AND-intersection.** `SRTWT2214 cert` with a **matching** certificate seeded
  (`PC 000373`). Expect B1 not to fire (`_haveProduct === true`), `entity-ids-transformer` to emit
  **both** `product_ids` and `certificate_ids`, and the reply to name `SRTWT2214` and no other product.
  🔧 **Prerequisite — resolve `PC000373` and PRINT its uuid at §CD-0a-1.** It is not established. Do not
  guess, and do not reuse `aa10fd73-…` (that is `PC 000078`).
- **§CD-3c — the non-matching carry.** Covered as its own case, **§CD-10** — it is RED today.
- **Assert:** row count ≤ that product's attachment count; reply names that product code and no other.
- **FP binding:** §CD-3 is **NOT** the instrument for §CD-FP-2 (§CD-BLIND — it has
  `unresolved_tokens: []`, so it is blind to that mutation). Use **FP2-D**.
- **Safety:** §0 all; S6 zero LLM nodes.

## §CD-4 — non-`product_attachment` domains byte-identical  ·  B1  ·  `scope: deterministic`

- **Trigger:** one `inventory` miss turn, one `order` turn, one `incoming` require-specific turn — each
  with a `certificate` entity seeded into prior state (so the seeded state is present but B1's domain
  guard excludes it).
- **Assert:** `disallowed-entity-gate` output **byte-identical** to the current live body's output on the
  same pinned input. Run the live body from `export/live-spine-sorento-consume-main/nodes/` as the
  comparator, offline. **Print the compared-population count.**
- **FP binding:** **NOT** the instrument for §CD-FP-1 (§CD-BLIND — its turns already have
  `gate_passed === false` at B1, so the `gate_passed &&` short-circuit hides the domain guard). Use
  **FP1-D**, which requires `gate_passed === true` at B1 in a non-`product_attachment` domain.
- **Safety:** §0 all; S6 zero LLM nodes.

## §CD-5 — B2′: a carried certificate is EVICTED  ·  B2′  ·  `scope: parser`

> ⚠️ **NOT SUFFICIENT ON ITS OWN — §CD-11 is the discriminating case.** §CD-5 exercises the
> no-pick path, where the executor's `:358` re-stamp sanitizes the corrupted flags and the axis filter
> works. A B2 that passes §CD-5 can still be **inert in production**, because the modal post-B1 turn is a
> did-you-mean *pick*, on which `applyDymPick` promotes the carried certificate into `current` where the
> axis map is never consulted. **Never sign off B2′ on §CD-5 alone.** (Plan §3.0, §5.1.)

> `output_exchange` runs after the LLM and the deterministic bypass skips it entirely (LESSONS §28), so
> **no mock can exercise this.** Real reformulator, multi-turn, on fork `wI5RkNGW3EOJfBdo`.

- **Turn 1:** `certification with number PC000078`. Assert `output_exchange` output `entities` contains a
  `certificate`-hinted entity.
- **Turn 2 (do NOT reset the contact row):** `srtwc8317-rl1 cert`.
- **Assert on the PARSER SUB's runData** (`output_exchange` node, sub execution):
  - the output `entities` contain **no** `certificate`-hinted entity;
  - they **do** contain the current-turn `product` (`srtwc8317-rl1`) and `attachment_type` (`cert`);
  - `entity_op_applied === 'replace_combine'`.
- **Assert the axis map is the mechanism, not a coincidence:** `certificate` resolves to
  `attachment_scope` (not `` `__certificate` ``). Verify statically against the published fork body **and**
  dynamically from the eviction above — one alone is not enough.
- **Negative control (same case, must also hold):** turn 2 = `and MWC7601?` (bare product, no
  attachment_type) ⇒ the certificate **IS still carried**. Without this, §CD-5 would pass for a
  clear-everything implementation.
- **Safety:** §0 all except **S6, relaxed for `parser` tier**: only the reformulator LLM may execute
  (`Basic LLM Chain` must not). Record token spend per turn.

## §CD-6 — B1 and B2′ together, and the ordering claim  ·  `scope: parser`

> ⚠️ Amended: the plan's claim that "B1 alone fixes the customer-visible symptom" is now known to be
> **only half true** — B1 fixes the *dump* but leaves (and, by routing customers into a did-you-mean,
> increases exposure to) the **F-CARRY-NARROW false negative**, §CD-10. Assert that explicitly here
> rather than restating the original claim.

- **Trigger:** the §CD-5 two-turn sequence with **both** B1 and B2′ published.
- **Assert:** the certificate is evicted (B2) **and** the turn dead-ends to did-you-mean (B1), i.e. the
  two fixes are independently sufficient and do not interfere. Then disable B1 (`setNodeDisabled` is
  not available for a Code-node clause — instead run against a clone snapshot with only B2) and confirm
  B2 alone also produces the correct answer.
- **Rationale:** the plan claims B1 alone fixes the customer-visible symptom and B2 alone removes the
  cause. Prove both halves rather than shipping a pair whose individual contribution is unmeasured.
- **Safety:** §0 all; S6 per `parser`.

## §CD-7 — B4 gate  ·  ✅ **ANSWERED 2026-08-07 — gate CLOSED, verdict NO-GO**  ·  `scope: parser`

**Do not re-run this as an open question.** Findings in plan §5.1; ruling in plan §3.0. Summary:

- Carried entities **are** re-flagged `current_message: true`. Direct observation: parser sub exec
  `11509876`, `previous_conversation_state.entities` — **all seven** carried entities `true`, including
  the same certificate five times.
- The writer is **`applyDymPick`** (`output_exchange.js:189/:190`), pinned by the `dym_slot:"11400339"`
  stamp whose sole writer is `:187` in the same function. Plan §5's candidate was correct. A **second**
  writer not in plan §5: block (B), `:581`.
- It **does** defeat B2 as designed, on the modal post-B1 turn (the customer replying to B1's
  did-you-mean). **B2 is superseded by B2′ (plan §3.6).**

§CD-7 is **retained as a regression pin** against B2′, in this form:

- **§CD-7a — the flag is still corrupted** (expected RED until B4-fix, which is out of scope): on a
  dym-pick turn, carried entities in `output_exchange`'s output carry `current_message: true`.
  **Record as a known-open finding; it must NOT block B2′** — B2′ Part 3 is specified on provenance
  precisely so it is immune. If this ever goes green, B4-fix has landed and B2′'s Part-3 immunity
  becomes untested — re-open §CD-11 as the instrument.
- **§CD-7b — B2′ is immune anyway.** §CD-11 is the discriminating case. §CD-7 alone is not.
- **§CD-7c — no duplicate accumulation** (B2′ Part 5): no entity key
  (`hint|canonical_code||raw`, and separately `uuid`) appears more than once in `output_exchange`'s
  output. The bad turn had the same certificate **five** times.
- **Safety:** §0 all; S6 per `parser`.

---

## §CD-9 — the require-specific PICKER render is pinned  ·  B1  ·  `scope: deterministic`

Assertion-coverage gap found by the tester (exec `11525030`), **not** a defect: on the
`missed product raw + a second AMBIGUOUS product token` shape, B1 does **not** fire (the ambiguous token
puts products into `compatible_entities`, so `_haveProduct` is TRUE) and the require-specific block below
renders the picker instead. The outcome is **safe and better than a dead-end** — no dump, no PDF, no
`PC 000078`. But §CD-1's regex would not match this render, so a regression on this shape is currently
invisible. **Add the case; do not add a guard.**

- **Trigger:** `srtwc8317-rl1 and SRTWC19 cert`, contact `437264483`, §4.2 seed.
- **Expected branch:** `disallowed-entity-gate` → `gate_passed === false`, `require_specific === true`,
  `gate_reason === "'product_attachment' ambiguous (no single exact match); user must pick"`
  — i.e. the **ambiguity** reason, **not** B1's. Assert B1's string
  (`/subject product did not resolve/`) is **ABSENT**, so the case cannot pass for the wrong reason.
- **Structural (verbatim from exec `11525030`):** `unresolved_tokens === ["srtwc8317-rl1"]`;
  `SRTWC19` `resolved:false, ambiguous:true` with 8 `prefix`-tier matches; `compatible_entities` holds
  those 8, all `entity_type: "product"`.
- **🔴 Customer boundary** (`user_response` / sendmsg payload) — pin the render:
  - starts `product_attachment search needs to be more specific. Multiple matches found — please choose:`
    (note: **em-dash** `—`, not a hyphen);
  - contains all 8 of `SRTWC193 SRTWC190 SRTWC195 SRTWC191-G2 SRTWC191-250MM SRTWC191 SRTWC192-300
    SRTWC192`, numbered `1.`–`8.`;
  - each candidate annotated `- no certificate` (the dym-annotate change — this is the LESSONS §63
    rendered-text surface, so assert it **at the boundary**, not on `build-suggest-offer`);
  - contains **none** of `PC 000078`, `PC000078`, `WCM PC 000078`, `Validity`, `Expired`;
  - **no attachment / no presigned URL** in the egress payload.
- **Mutation this case must catch:** remove the require-specific block's `gate_clarification` render, or
  make B1's clause fire on `_missedSubject` alone (§CD-FP-2 / FP2-D) — either flips this to the B1
  dead-end. Assert the picker, so it goes RED.
- **Also record (B3 evidence, no action here):** `gate_debug.entities_count === 10` while
  `compatible_entities.length === 8`. A diagnostic that disagrees with what it describes.
- **Safety:** §0 all; S6 zero LLM nodes.

## §CD-10 — 🔴 F-CARRY-NARROW: a carried certificate must not confidently DENY  ·  B2′  ·  two tiers

**RED today. This is B2′'s headline acceptance and the reason B2 alone is insufficient.** The carried
certificate breaks the **resolved-product** path in the opposite direction from the dump: the lookup runs
`product_ids ∧ certificate_ids`, the intersection is empty because the product's real certificate is a
different one, and the customer is told the product has no certificate. B1 is **provably inert** here
(`match_tier: exact`, `unresolved_tokens: []`, `gate_passed: true` — exec `11525013`), so this is
pre-existing and not B1's doing.

- **§CD-10a — symptom pin  ·  `scope: deterministic`.** Seed the §4.2 state (certificate `PC 000078`),
  message `SRTWT2214 cert`, `mock_reformulator_output` pinned. Assert **today's** behaviour so the
  defect is instrumented before it is fixed:
  - `entity-ids-transformer` emits **both** `product_ids` and `certificate_ids`;
  - the get-results sub returns `answers: []`, `has_result: false`;
  - `user_response` matches `/No certificate for SRTWT2214/`.
  - **Control, same run:** identical message, **clean** session → the real certificate
    (`PC 000373`, `Validity: Valid`, file `WCM - Cold Tap - EXP 13 SEP 2026.pdf`). Both halves are
    required — the pair is what proves *the seed causes it, not the utterance*.
- **§CD-10b — the fix  ·  `scope: parser`.** Same seed, **after B2′**. Assert:
  - `output_exchange` output entities contain **no** `certificate`-hinted entity (B2′ Part 4's
    `product_scope` trigger fired — the current turn contributes a product);
  - `entity-ids-transformer` emits `product_ids` and **no** `certificate_ids`;
  - the reply carries `SRTWT2214`'s real certificate `PC 000373` and `Validity: Valid`;
  - `/No certificate for/` is **ABSENT**.
- **Mutation this case must catch:** remove B2′ Part 4's `product_scope` half (leaving only the
  `attachment_scope` trigger, i.e. B2-as-designed). §CD-10b must go **RED**. If it stays green, Part 4 is
  not being exercised and the case is re-aimed before any promote.
- **Safety:** §0 all; S6 per each tier's own tag.

## §CD-11 — 🔴 the B4 BYPASS: eviction must survive a dym pick  ·  B2′  ·  `scope: parser`

**This is the discriminating case for the whole B4 gate.** Without it, B2/B2′ can pass §CD-5 and be inert
in production, because `applyDymPick` promotes every carried entity into `current`, where the axis map is
never consulted (`:412` spreads `current` unfiltered). It is also the **modal** post-B1 turn: B1's reply
is *"Reply with a code to continue"*, and a code reply is exactly the `tryDymPick` trigger.

Run **both** pick paths — they bypass by different mechanisms and a fix can plausibly cover one only:

- **§CD-11a — code reply (`tryDymPick`, `:243`, runs BEFORE the executor).**
  - **Turn 1:** §4.2 seed + `srtwc8317-rl1 cert` → B1 dead-ends to the did-you-mean (§CD-1).
  - **Turn 2 (do NOT reset):** reply with the offered code `SRTWC8317-RL`.
  - **Assert `dym_pick_applied === true` on turn 2** — *first*, before anything else. **If it is not
    true the pick path did not run and the case is VOID, not green.** This single assertion is what
    stops §CD-11 from degenerating into §CD-5.
  - Then: `output_exchange` output entities contain **no** `certificate`-hinted entity; the reply carries
    `SRTWC8317-RL`'s real certificate (or an honest not-found for *that product*), and **never**
    `PC 000078`.
- **§CD-11b — numbered reply (`dymNumberedMultiSelect`, `:493-517`, runs AFTER the executor and does
  `output.output.entities = _base` at `:514`, discarding the executor's output wholesale).**
  - Same turn 1; **turn 2 = `1`**.
  - Assert `reference_target === 'dym'` and `dym_pick_applied === true` — else VOID.
  - Same eviction assertions. **This path is where B2-as-designed is *unconditionally* inert**, so it is
    the strictest of the two: a fix that only reorders the axis logic will still fail here unless the
    reconciliation pass sits after `:517` (B2′ Part 2).
- **Negative control (required, same case):** turn 2 = `and MWC7601?` — a bare product with **no** pick
  and **no** attachment_type. Under B2′ Part 4 the certificate **IS** evicted (product_scope changed).
  ⚠️ This deliberately **inverts** plan §3.2's original row 2, which called retention "correct"; §3.0
  rules that row a design error. Assert eviction, and assert the customer gets `MWC7601`'s own
  attachments rather than *"No certificate for MWC7601"*.
- **Second negative control:** `certification with number PC000078` alone (no product contributed, no
  pick) ⇒ the certificate **is retained** and the covered-products listing still renders. Without this,
  §CD-11 passes for a clear-everything implementation.
- **Mutation this case must catch:** move B2′'s reconciliation pass back above `:517`. §CD-11b must go
  **RED** while §CD-11a stays green — that asymmetry is the proof the pass is correctly placed.
- **Safety:** §0 all; **S6 relaxed for `parser`**: only the reformulator LLM may execute (`Basic LLM
  Chain` must not). Record token spend per turn.

## §CD-8 — B3 observability (optional, run if B3 is bundled)  `scope: deterministic`

- **Assert:** `disallowed-entity-gate.gate_debug.entities_count === compatible_entities.length` on every
  §CD case. On the pre-fix bad turn these were `2` and `6`. A diagnostic that disagrees with the thing
  it describes is worse than no diagnostic.
- **Safety:** §0 all; S6 zero LLM nodes.

---

## §CD-FP — fail-on-purpose (§0 S9 binding; every mutation via `mutate.sh`)

Each step must print `occurrences before : N (expected N)` with **N > 0** and a **changed digest**, or
the run is **VOID** — not weak, void (LESSONS §61b).

- **§CD-FP-1 — B1's domain guard.** Mutate `domain === 'product_attachment'` to `true`. Expect §CD-4 RED.
  If §CD-4 stays green it is not asserting byte-identity on a real comparator.
- **§CD-FP-2 — B1's missed-subject predicate.** Mutate `_missedSubject && !_haveProduct` to
  `_missedSubject`. Expect §CD-3 RED (a resolving product would now be blocked).
- **§CD-FP-3 — B1's product-hint filter.** Mutate the `hint === 'product'` filter to accept every hint.
  Expect §CD-2 RED (the legitimate certificate listing would be blocked).
- **§CD-FP-1/2/3 are re-aimed** — see **§CD-BLIND**. They are satisfied **only** by `FP1-D`/`FP2-D`/
  `FP3-D` (discriminator shapes stated there), never by the §CD-4/§CD-3/§CD-2 turns, which were
  **measured blind** to all three mutations.
- **§CD-FP-4 — B2′ Part 1, the axis entry.** Remove `certificate: 'attachment_scope'` from
  `AXIS_BY_DOMAIN` (leaving `HINT_AXIS_DEFAULT`) and then from both. Expect §CD-5 RED in the second case.
  If it stays green after removing **both**, §CD-5 is not exercising the map — likely a stubbed lane;
  re-aim before filing blindness (`mutate.sh` header warning).
- **§CD-FP-6 — B2′ Part 2, the pass POSITION.** Move the reconciliation pass from after block (B)
  (`:584`) to above `dymNumberedMultiSelect` (`:493`). Expect **§CD-11b RED while §CD-11a stays green**.
  That asymmetry is the only proof the pass sits downstream of every entity-set writer; a single green
  §CD-11 does not distinguish placement.
- **§CD-FP-7 — B2′ Part 3, provenance vs the flag.** Replace `isCarried()`'s provenance test with
  `e.current_message !== true`. Expect **§CD-11a and §CD-11b RED** (the flag is `true` on carried
  entities after `applyDymPick`, so nothing is evicted) while §CD-5 stays green. This is the mutation
  that proves B2′ is immune to B4 rather than merely untested against it — **the single most important
  mutation in this family.**
- **§CD-FP-8 — B2′ Part 4, the widened trigger.** Remove the `product_scope` half, leaving only
  `attachment_scope` (i.e. B2-as-designed). Expect **§CD-10b RED** and the §CD-11 negative control
  (`and MWC7601?`) RED.
- **§CD-FP-9 — B2′ Part 5, dedupe.** Remove the dedupe. Expect **§CD-7c RED** against a seed carrying
  the certificate more than once.
- **§CD-FP-5 — 🔴 the customer-boundary gate discriminates.** Feed §CD-1's **post-fix** producer output
  through the **pre-fix** consumer chain and assert the 26-row text comes back. This proves the boundary
  assertion can tell the two apart rather than being taken on trust (LESSONS §63 rule iv), and it is the
  gate that catches a fix computed correctly and then discarded downstream.
