# Change: `parser-domain-continuity-carry` (move domain continuity from the LLM prompt into downstream code)

Status: PLAN (planner deliverable). No workflow edited, no execution run.
**Scope tag: `parser`** (edits live INSIDE the reformulator sub — the AI Agent Human prompt + `systemMessage`
AND `output_exchange` Code, which runs AFTER the LLM; per plan §8 + LESSON 28 a `mock_reformulator_output`
injection bypasses `output_exchange` entirely, so these cases REQUIRE the real reformulator — a
`deterministic`/mock path CANNOT exercise this change). A new LLM output field `domain_signal`
(explicit|inferred|none, this-turn-only) drives the downstream carry (coordinator refinement §C1).
Source of truth: live reformulator sub `XTODTw-dJcV0uRdC056hG`, **draft==active**
(versionId `53ea677a-e078-482e-bea2-17efe5859189`, updatedAt `2026-07-14T03:36`, verified this cycle).
Bug evidence: live sub exec **8655477**. Cascade grounding: `DOMAIN_BLOCKED_HINTS.incoming` verified to
include `'customer'` (live `output_exchange` L372).

---

## C0. The bug (grounded, exec 8655477)

- **Turn 1** "Check eta Srtwt9611 gm" → `domain_hint=incoming` (correct).
- **Turn 2** "Any delivery for charmant hardware" → LLM emitted `domain_hint=incoming` (**WRONG** — the
  decisive term "delivery" + a customer entity should be `order`/customer-delivery).

**Root cause = prompt contamination.** The AI Agent Human prompt anchors the LLM on the previous domain
two ways, and the LLM carries `incoming` over the decisive current-turn "delivery" rule:
1. An explicit `Previous domain: {{ …previous_conversation_state.domain_hint }}` line.
2. A leak inside `Previous response: {{ …previous_conversation_state.response }}` — that response string
   is the synthetic summary `Previous turn (incoming): returned 1 records`, so the domain WORD
   ("incoming") is present even without line (1).

**Confirmed single-root cascade** (all downstream, no second bug):
wrong `domain_hint=incoming` → `output_exchange` blocklist-apply (L395-418) unions
`DOMAIN_BLOCKED_HINTS.incoming` (L372) which contains `'customer'` → the correctly-extracted
`charmant hardware` (hint `customer`) entity is dropped (`broaden_dropped`) → the stale prior product
`SRTWT9611` survives via reuse → get-results returns the same incoming file. ONE root (wrong domain).

---

## C1. Design (DECIDED — do not redesign): domain continuity moves PROMPT → downstream CODE

Domain is currently the ONLY continuity field the LLM is told to carry itself. Every other continuity
field (date, is_active, order_status, access_levels, routing, intent) is "current-message-only in the
LLM, previous re-applied downstream" (see the `case 'reuse'` date/is_active carries at
`output_exchange` L198-210). Make domain consistent with that model: the LLM classifies domain from
**THIS TURN ONLY**; downstream code re-applies the previous domain when — and only when — it is safe.

### Edit 1 — AI Agent Human prompt (`AI Agent.parameters.text`), parser sub `XTODTw`

Current live `.text` (verified verbatim this cycle):
```
=Previous response: {{ $('When Executed by Another Workflow').first().json.previous_conversation_state.response }}
User answered: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
Previous domain: {{ JSON.stringify($('When Executed by Another Workflow').first().json.previous_conversation_state.domain_hint) }}
```

**1a — DELETE the `Previous domain:` line entirely** (the explicit anchor). The LLM then classifies
domain from the current turn only.

**1b — NEUTRALIZE the domain-word leak in the `Previous response:` line.** The leaking string is built
in the **SPINE** `compile-current-state` (live/clone lines 95 & 131:
``response = `Previous turn (${domain}): no results.` `` /
``response = `Previous turn (${domain}): returned ${items.length} ${what}` ``). That node is on the LIVE
SPINE `9qVyfUxmRQqrpGRMDLRuz` — **editing it is OUT OF SCOPE for a parser-only change** (separate spine
promotion, bigger blast radius). Mitigate WITHIN the parser sub by sanitizing the response inline in the
prompt expression (strip the `(domain)` parenthetical, which always appears in the exact regular form
`Previous turn (<domain>):`):

```
=Previous response: {{ String($('When Executed by Another Workflow').first().json.previous_conversation_state?.response ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn') }}
User answered: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
```

- Keep the (sanitized) `Previous response:` line — it is load-bearing for reference-answer turns
  ("yes" / "1" / "the second one" reference the prior reply); do NOT drop it.
- The strip is targeted: only the `Previous turn (<domain>):` summary form starts that way; the other
  two `response` shapes in `compile-current-state` (L39 escalation-offer string, L59
  `central-exchange.response`) do not match the anchor and pass through unchanged.
- **Flagged for a later, separate spine change (NOT this change):** removing `(${domain})` from
  `compile-current-state` L95/L131 would neutralize the leak at source and let us drop the prompt-side
  regex. Recorded as a follow-up; do not bundle it here.

### Edit 1c — add `domain_signal` to the LLM output (AI Agent `systemMessage`), parser sub `XTODTw`

> **WHY (coordinator refinement — closes a hole in a null-only carry).** A null-gated downstream carry
> fails for a bare code with no purpose word: the LLM often emits a **non-null** `domain_hint` (e.g. a
> bare product code → `master_products`, a strong code→product prior) rather than `null`, so a
> `domain_hint===null` gate never fires and "incoming for A" → bare "B" would REGRESS to `master_products`.
> Fix: the LLM emits a `domain_signal` derived from THIS TURN ONLY (it never sees the previous domain —
> Edit 1a removed it — so `domain_signal` is uncontaminated), and the downstream carry keys on the SIGNAL,
> not on null.

The systemMessage already has a `== DECISIVE DOMAIN TERMS ==` section (live L53-63: decisive term ⟹ set
domain overriding prev; else if genuinely ambiguous ⟹ null). `domain_signal` names which of those three
happened. Two additive touches:

1. **Add the key to the `== OUTPUT ==` block** (live L363-391), immediately after `domain_hint` (L367):
```
  "domain_signal": "explicit|inferred|none",
```
2. **Add a short definition** next to the DECISIVE DOMAIN TERMS section (after L63):
```
domain_signal = classify HOW you set domain_hint, from the CURRENT message ONLY:
  - "explicit" = a DECISIVE DOMAIN TERM (see the section above) is present this turn (eta, list price,
    delivery-for-customer, dimension, selling price, …). The current domain is decisive.
  - "inferred" = NO decisive term, but you guessed a domain from a bare entity (e.g. a bare product code
    with no purpose word → you may set domain_hint = master_products, but domain_signal = "inferred").
  - "none"     = no decisive term and no basis to guess → domain_hint = null, domain_signal = "none".
Set domain_signal on EVERY turn. It describes THIS message only — never consider the previous domain.
```
- `domain_signal` is **additive on every parser output** → golden-handling: register it in the replay
  `norm()` (LESSON 40) — but since it is never null (always one of the three), register it as
  **flagged-on-change** (retain), NOT ignore-when-null. (Moot for this change's targeted-chain testing;
  matters only for a future full-corpus replay.)

### Edit 2 — `output_exchange` Code, parser sub `XTODTw`

> **Line refs are against current live `output_exchange` (605 lines).** The coder forks CURRENT live, so
> lines drift — anchor edits on the code content quoted below, not the numbers.

> **The carry keys on `domain_signal`, NOT on `domain_hint===null`** (coordinator refinement — this is
> the crux). A null-only gate would MISS the common bare-code case where the LLM emits a non-null
> inferred domain. Both carry blocks below compute:
> ```
> const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none'); // fallback if LLM omits key
> ```
> `_sig==='explicit'` ⟹ decisive current term → current domain wins, NO carry. `inferred`/`none` ⟹
> eligible for the compatibility-gated carry (fires even when the LLM guessed a non-null domain).

**2a — enable the reuse-path domain-carry (entity-less continuations, e.g. "and the price?").**
In `case 'reuse'` (L196-217) the domain-carry is currently commented-out dead code (L211-215):
```
/*      if (output.output.message_type != 'casual' && output.output.message_type != 'request_for_help') {
        output.output.message_type = parent_input.previous_conversation_state?.message_type
        output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint
        output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint
      }*/
```
Replace with a signal-gated carry (inherit prev domain UNLESS the current turn carried a decisive term):
```
// domain continuity for entity-less reuse (e.g. "and the price?"): carry prior domain UNLESS a
// decisive current-turn term was present (domain_signal==='explicit' → current wins).
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none');
  if (_sig !== 'explicit') {
    output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint || output.output.domain_hint || null;
    output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
    output.output.domain_reused_entityless = true;   // diagnostic
  }
}
```
- Do NOT unconditionally overwrite `message_type` (the old dead code did — that is unsafe now).
- reuse means `finalEntities = prior` (no current entity) → the continuation is about the SAME prior
  entities, so prev-domain is correct; the only guard is "an explicit current term wins."

**2b — signal-gated + compatibility-gated carry for entity-BEARING continuations (bare "Y" code).**
The `replace_combine`/`modify`/`default` path (L218-241) has NO domain carry today. After the entity set
is finalized (`output.output.entities = finalEntities`, L244) and the existing positional/menu carries
(L282-294), but **BEFORE the blocklist-apply (L395)**, insert:
```
// ── domain continuity for entity-bearing continuations (bare "Y" code) ──
// Key on domain_signal (uncontaminated, this-turn-only), NOT on domain_hint===null:
//   explicit → current domain is decisive, keep it (no carry).
//   inferred/none → if a current-message entity exists AND its hint is COMPATIBLE with the prev domain
//     (reuse the SAME DOMAIN_BLOCKED_HINTS map used by blocklist-apply) → INHERIT prev domain,
//     OVERRIDING the LLM's inferred guess (this stops "incoming for A" → bare "B" flipping to
//     master_products). If incompatible → topic switch → do NOT inherit; keep the current domain
//     (null 'none' → downstream clarify; 'inferred' → the entity's own guessed domain / re-derive).
// Must run BEFORE blocklist-apply so the correct domain drives the filter.
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none');
  if (_sig !== 'explicit') {
    const prevDom = parent_input.previous_conversation_state?.domain_hint || null;
    const curEnts = (Array.isArray(output.output.entities) ? output.output.entities : [])
                      .filter(e => e && e.current_message === true);
    if (prevDom && curEnts.length > 0) {
      const blockedForPrev = new Set(DOMAIN_BLOCKED_HINTS[prevDom] || []);   // hoist declaration — see note
      const compatible = curEnts.every(e => !blockedForPrev.has(String(e.hint || '').toLowerCase()));
      if (compatible) {
        output.output.domain_hint  = prevDom;                                // OVERRIDE inferred guess
        output.output.intent_hint  = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
        output.output.domain_inherited_compatible = true;   // diagnostic
      } else {
        output.output.domain_inherit_blocked = prevDom;     // diagnostic: topic switch, kept current
      }
    }
  }
}
```
- **Coder note (declaration order):** `DOMAIN_BLOCKED_HINTS` is currently declared at L365, AFTER this
  insertion point. Either (i) hoist the `const DOMAIN_BLOCKED_HINTS = {…}` declaration above the new
  block (preferred — single source, blocklist-apply reads the same const), or (ii) declare a shared
  module-scope const at the top. Do NOT duplicate the map (drift risk).
- **OVERRIDE, not fill-null:** on a compatible inferred/none turn the carry OVERWRITES the LLM's
  `domain_hint` with the prev domain. This is the crux of the coordinator fix — the LLM may have guessed
  `master_products` (inferred) for a bare code; the compatible prev `incoming` wins.
- **`every()` semantics:** inherit only if ALL current entities are compatible with the prev domain. A
  single blocked entity (e.g. `customer` under prev `incoming`) → topic switch → no inherit.

### Why signal + compatibility does double (triple) duty

- **product-after-incoming, bare code** ("any incoming 286" → bare "SRTWC286-SH"): LLM may emit
  `domain_hint:master_products, domain_signal:inferred`. `inferred` → eligible; entity hint `product` ∉
  `DOMAIN_BLOCKED_HINTS.incoming` → compatible → OVERRIDE to `incoming`. **Continuity preserved — the
  null-only-gate hole is closed.**
- **explicit override** ("incoming for A" → "list price of B"): decisive "list price" → LLM emits
  `domain_hint:master_products, domain_signal:explicit`. `explicit` → no carry → stays `master_products`.
  **Decisive current term wins.**
- **customer-after-incoming** (charmant repro): "delivery for [customer]" — decisive
  "delivery-for-customer" → `domain_signal:explicit`, `domain_hint:order` → no carry, stays `order`. Even
  if the LLM read it as `inferred`, the `customer` entity ∈ `DOMAIN_BLOCKED_HINTS.incoming` (L372) → NOT
  compatible → no carry, and the customer entity is NOT dropped by the incoming blocklist. **Bias killed
  on both paths.**

---

## C2. What this change does NOT touch (invariants)

- `DOMAIN_BLOCKED_HINTS` / `DOMAIN_BROADEN_BLOCKED_HINTS` maps — reused read-only, not edited.
- The blocklist-apply loop (L395-418) — unchanged; it just now sees the correct domain.
- The positional/menu domain-carry (L277, L282-294) and reference-positions→entities (L295+) — unchanged.
- `deriveRouting`, member-pick, suggest-follow-up, escalation, date-filter, `person_mention` — unchanged.
- The SPINE `compile-current-state` — unchanged (leak mitigated prompt-side; source-fix flagged as a
  separate future change).

**Full edit inventory (all on parser sub `XTODTw`):** Edit 1a (delete `Previous domain:` line) + 1b
(sanitize `Previous response:` expression) + 1c (add `domain_signal` to the AI Agent `systemMessage`
OUTPUT + a definition) — all on the `AI Agent` node; Edit 2a + 2b (signal-gated domain carry) on the
`output_exchange` node. Two nodes, five hunks.

---

## C3. Build & safety gating

**Parser edits touch the LIVE published sub `XTODTw` — no wired fork shields it (CLAUDE.md).** Therefore:

- **Build/test on a FORK, never live.** Fork CURRENT live `XTODTw` (UI-Duplicate — MCP has no raw-JSON
  import) → new reformulator copy `RFRMID`, apply Edits 1+2 there. Repoint the clone `txiPzSxy3Pclsz6v`
  node `Call 'sub-query-reformulator'` `workflowId` → `RFRMID`. (Same pattern as `cert-brand-routing-fix`
  §5 / `order-member-pick-name-resolve`.) LIVE `XTODTw` is untouched until user-gated promotion.
- **Zero egress is structural, independent of this change.** The reformulator sub is classification-only
  (no send/assign/write nodes); all real egress lives on the SPINE, and the clone fail-closes it (orphan
  egress nodes + `is_test=true` on every shared-sub call). Running the forked parser on the clone in
  `regress-capture`/`chat-stateful` mode cannot reach a real contact.
- **Promotion (later, user-gated):** apply Edits 1+2 to live `XTODTw` byte-exact + sha-gated
  (LESSON 25), backup-first, publish, verify draft==active before AND after.

---

## C4. Driver — multi-turn continuity needs REAL session carry (uac mode cannot)

The whole change is about turn N reading turn N-1's `previous_conversation_state.domain_hint` +
`.response`. `uac` mode CANNOT round-trip state (it sources prior state from PROD; redis-item
`previous_conversation_state` injection does NOT reach the reformulator — LESSON 31). So every multi-turn
case MUST run with a driver that persists session to `respond_contacts_test` between turns AND runs the
REAL reformulator. Two valid drivers (both zero-egress, real LLM):

1. **`chat-stateful` console lane (PRIMARY)** — chat webpage `zz-chat` (`oyYfVvZHRZpWubTy`) → dispatcher
   `2D0cw2Y1aPW2LOlU` → clone → forked reformulator `RFRMID`. Session R/W via `pg-get-session` /
   `pg-upsert-session` against `respond_contacts_test`; reply read from redis `chat:reply:{chat_id}`.
   This is the natural multi-turn vehicle (already built for `console-persistence`). Reset the session
   row ONCE before turn-1 of each chain; NEVER between turns of a chain.
2. **`mode=regress-capture` (ALTERNATIVE)** — drive the clone by redis item; session sources from
   `respond_contacts_test` and each turn's write is visible to the next (LESSON 31 — do NOT reset the
   contact row within a multi-turn sequence). Real LLMs + reads.

> **REPLAY IS BLIND TO THIS CHANGE — do NOT use it.** Golden `regress-replay` pins the golden LLM output
> (`mock_reformulator_output`), which bypasses `output_exchange` and freezes the prompt's effect. A pinned
> replay would show ZERO diff for a prompt+`output_exchange` change and give a false all-green. The C
> chains (§C7 / UAC §23-C) MUST run `chat-stateful` or `regress-capture` (real reformulator), never
> pinned replay.

---

## C5. Test matrix (scope = TARGETED CHAINS; NO full-corpus re-capture)

Contact `437264483` (FULL access) for all. Every case bound by UAC §0 (S1-S6). Because the driver runs
the real reformulator, S6 = "no consume-main `Basic LLM Chain` gpt-4.1-mini ran unless the turn
legitimately hits clarification; the reformulator gpt-5.4-mini is the driver's parser".

**A — Continuity must NOT regress** (bare-entity + entity-less follow-ups; domain MUST carry):
- A1 incoming bare-code (★ the coordinator hole): "eta X" (incoming) → bare "Y" code → **both `incoming`;
  Y MUST NOT become `master_products`** even though the LLM likely emits `domain_hint:master_products,
  domain_signal:inferred` (signal `inferred` + product compatible → OVERRIDE to incoming, Edit 2b).
- A2 order: "delivery X" → bare "Y" → both `order`.
- A3 promotion + master_products bare follow-ups carry their domain.
- A4 reuse no-entity: "…product X" → "and the price?" → domain carries (reuse-path carry, Edit 2a).
- A5 explicit override closes the loop: "eta X" (incoming) → "list price of Y" → `master_products`
  (`domain_signal:explicit` → NO carry; decisive term wins). Pairs with A1 to pin signal both ways.

**B — Contamination fixed** (decisive current term / compatibility gate wins; entity RETAINED):
- B1 charmant repro: "Check eta Srtwt9611 gm" (`incoming`) → "Any delivery for charmant hardware" →
  `order` (customer entity `charmant hardware` RETAINED, NOT `broaden_dropped`; NOT `incoming`).
- B2 promotion→override: promotion turn → "list price of X" → `master_products` (decisive override survives).

**C — Scale: 18 REAL mined chains** from `n8n_test.v_turns` (§C7). Each lists expected per-turn domain;
domain-flips triaged (correct switch vs regression).

---

## C6. Verification tasks (planner-defined)

- **V-P0 (offline `output_exchange` unit, 0-token, cheapest gate FIRST).** Feed the forked
  `output_exchange` synthetic `parent_input.previous_conversation_state` + LLM `output.output` pairs and
  assert the carry logic directly (no LLM, via `prepare_test_pin_data`→`test_workflow` pinning the AI
  Agent output, or a standalone harness). **The `domain_signal` cases are the coordinator-fix gate:**
  - reuse + `domain_signal:'none'` + `domain_hint:null` + prev `master_products` →
    `domain_hint==='master_products'`, `domain_reused_entityless===true`, `message_type` NOT overwritten (Edit 2a).
  - **★ inferred-non-null carry (the hole the fix closes):** replace_combine +
    `domain_signal:'inferred'` + `domain_hint:'master_products'` (LLM's bare-code guess) + current entity
    `{hint:'product',current_message:true}` + prev `incoming` → carry OVERRIDES to `domain_hint==='incoming'`,
    `domain_inherited_compatible===true`. **A null-only gate would FAIL this** (domain_hint was non-null).
  - inferred + incompatible: replace_combine + `domain_signal:'inferred'` +
    `domain_hint:'order'`/null + current entity `{hint:'customer',current_message:true}` + prev `incoming`
    → NO carry, `domain_inherit_blocked==='incoming'`, and the customer entity is **still present** after
    blocklist-apply (charmant guard, code layer).
  - explicit-wins: replace_combine + `domain_signal:'explicit'` + `domain_hint:'master_products'` + prev
    `incoming` → stays `'master_products'` (no carry; `domain_inherited_*` absent).
- **V-P0b (`domain_signal` LLM validation, real reformulator).** Across a sample of the mined chains,
  assert the LLM sets `domain_signal` correctly per turn: `explicit` on decisive-term turns (eta / list
  price / delivery-for-customer / stock / GRN), `inferred` on bare-code-no-purpose-word turns,
  `none` when domain_hint is null. A systematically wrong `domain_signal` (e.g. bare code marked
  `explicit`) would defeat the carry — FLAG it (the fix depends on this signal being right). This is the
  new signal's own acceptance.
- **V-P1 (prompt-sanitize unit).** Confirm the Edit-1b expression strips `Previous turn (incoming):` →
  `Previous turn:` and leaves an escalation-offer / `central-exchange` response string unchanged (string
  test; the AI Agent input can be inspected in a pinned run).
- **V-P2 (B1 charmant repro e2e).** Reproduce exec 8655477 via `chat-stateful`: T1 "Check eta Srtwt9611
  gm" → T2 "Any delivery for charmant hardware". Assert T2 `output.output.domain_hint==='order'`, the
  `charmant hardware` customer entity present in `output.output.entities` (NOT in `broaden_dropped`), and
  get-results does NOT return the stale SRTWT9611 incoming file. §0 holds.
- **V-P3 (A-set continuity e2e).** A1-A5 via `chat-stateful`; assert per-turn domain carries as expected
  (A1: bare code stays incoming, not master_products; A5: explicit "list price" overrides to master_products).
- **V-P4 (C-chains e2e + triage).** Run the 18 mined chains; record actual per-turn `domain_hint`;
  every FLIP from the expected-domain column is triaged as correct-switch or regression (LESSON 39 — bare
  tokens are run/seed-sensitive; expected domains for pure bare-code carries are firm, decisive-term
  turns are the LLM's call and only wrong-direction flips fail).
- **V-P5 (sampled off-continuity regression).** Confirm the prompt/`output_exchange` change is inert on
  turns with NO prior state and on first-turn queries (no spurious carry when prevState empty) — spot 5-8
  single-turn corpus turns, assert `domain_inherited_compatible`/`domain_inherit_blocked` absent and
  domain unchanged vs a pre-change run.

---

## C7. Mined continuation chains (real, from `n8n_test.v_turns`)

18 real multi-turn sessions where turn N depends on turn N-1's domain. `→` = consecutive turns. Expected
per-turn domain is the planner's inference from decisive terms; **FLIP = domain differs from the prior
turn** (mark ✅ if a correct switch, ⚠️ if it should have carried). "carry" = bare/entity-less follow-up
that MUST inherit; "switch" = decisive current term must win + entity retained.

| # | convo | turn pair(s) (verbatim) | expected domain per turn | tests |
|---|---|---|---|---|
| C1 | 480184379 | T4 "any incoming 286" → T5 "SRTWC286-SH" | incoming → **incoming (carry)** | bare-code incoming carry ★ |
| C2 | 480184379 | T5 "SRTWC286-SH" → T6 "Certificate sc07" | incoming → **product_attachment (switch ✅)** | decisive "certificate" wins |
| C3 | 480184379 | T6 "Certificate sc07" → T7 "3" | product_attachment → **product_attachment (positional carry)** | positional-pick carry (existing path) |
| C4 | 445239407 | T7 "check container ecmu5054141 done loading" → T8 "Ymmu6308003 how about this container done loading at DC1" | incoming → **incoming (carry)** | container follow-up continuity |
| C5 | 445239383 | T3 "What is the list price of srtwc286-sh" → T4 "How much wc286-sh?" | master_products → **master_products (carry)** | price continuity, bare-ish code |
| C6 | 445239383 | T5 "can u provide cert of wc286" → T6 "can u provide certificate of wc286" | product_attachment → **product_attachment (carry)** | cert continuity |
| C7 | 445239383 | T4 "How much wc286-sh?" → T5 "cert of wc286" | master_products → **product_attachment (switch ✅)** | decisive "cert" wins |
| C8 | 445239388 | T3 "stock untuk srtscbd331-uf?" → T4 "Kalau untuk acc-ks7001-yg ada stock?" | inventory → **inventory (carry)** | stock continuity (BM) |
| C9 | 445239388 | T4 "…ada stock?" → T6 "Container BEAU5970247 dah GRN?" | inventory → **goods_receive/incoming (switch ✅)** | decisive "GRN" wins (T5 "Hai" casual between) |
| C10 | 477071885 | T1 "Enyxion got delivery?" → T2 "Srtwc8517-250mm got stock?" | order → **inventory (switch ✅)** | delivery→stock switch (charmant-analog, reversed) |
| C11 | 477071885 | T3 "Srtwc8517-SH-UF got stock" → T4 "Srtwc8517-SH-UF -250 got eta?" | inventory → **incoming (switch ✅)** | decisive "eta" wins |
| C12 | 477071885 | T4 "…got eta?" → T5 "cks6647 got eta?" | incoming → **incoming (carry)** | eta continuity, new code |
| C13 | 445239385 | T3 "check order for customer one siew, item SRTKT72SS" → T4 "Can check stock balance srtkt71-ss" | order → **inventory (switch ✅)** | order→stock, decisive "stock balance" |
| C14 | 445239394 | T2 "info for SRTBF11834" → T3 "can i get the technical drawing? i wanna see the measurement" | master_products → **product_attachment (switch ✅, entity-less)** | reuse-path carry + decisive term ★ (Edit 2a) |
| C15 | 445239394 | T4 "technical photo for SRTWT2634-RG" → T5 "product photo for SRTWT2634" | product_attachment → **product_attachment (carry)** | photo continuity |
| C16 | 404280950 | T2 "Do you have wc 8152 in stock?" → T3 "Yes" | inventory → **inventory (affirmative, no domain change)** | bare "Yes" must not drop/rewrite domain |
| C17 | 445659708 | T1 "Srtwc286" (first turn, NO prior) → T4 "Pls help check stock srtwc286-250 mm" | (no-prior best-guess) → **inventory** | first-turn bare code: NO spurious carry when prevState empty |
| C18 | 447351879 | T1 "check (syntalun customer) order item cks319 delivery status" → T2 "Please check for customer: syntalun" | order → **order (carry, customer compatible)** | customer-after-order carries (customer ∉ order-block? verify†) |

† **C18 verify-during-build:** `DOMAIN_BLOCKED_HINTS.order` (L371) does NOT list `customer` → a customer
entity IS compatible with `order` → carry `order`. Confirm the resolver/parser treats "syntalun" as
`customer` (not a stray). If the parser reads T2 as a fresh customer query with its own `domain_hint`,
carry is moot (LLM already correct). Flag, don't silently pass.

**Triage rule (V-P4):** "carry" rows (C1, C4, C5, C6, C8, C12, C15, C16, C18) are firm — a domain that
does NOT match the prior turn is a **regression** (the fix failed to carry). "switch" rows (C2, C7, C9,
C10, C11, C13, C14) depend on the LLM's this-turn-only classification — a switch to the expected domain
is correct; a switch to a THIRD unrelated domain, or a wrong-carry of the prior domain, is triaged. C3
(positional) and C17 (no-prior) are structural.

**Charmant-family reminder:** the only HARD contamination assertion is B1 (§C6 V-P2) + C10/C13 (a
switch turn must retain its current entity). A carry-row failing to carry, or a switch-row dropping its
current entity, are the two regression classes to watch.

---

## C8. Acceptance criteria

1. **All A pass** — no continuity regression: A1-A5 carry the prior domain on bare/entity-less
   follow-ups (V-P3). Specifically A1: bare "Y" after "eta X" stays `incoming`, does **NOT** become
   `master_products` (the coordinator hole is closed); A5: "list price of Y" after "eta X" IS
   `master_products` (explicit override).
2. **All B flip to correct** — B1 charmant repro yields `domain_hint=order` with the `charmant hardware`
   customer entity RETAINED (not `broaden_dropped`) and no stale SRTWT9611 result (V-P2); B2 override
   survives.
3. **C chains reviewed** — all 18 run with the real reformulator; every domain-flip triaged
   (correct-switch vs regression) per the §C7 rule; the 9 "carry" rows carry (regression if not).
4. **Offline units green** — V-P0 (five `output_exchange` carry cases incl. the ★ inferred-non-null
   override) + V-P0b (`domain_signal` set correctly by the LLM) + V-P1 (prompt sanitize) pass before any
   e2e run.
5. **Zero egress (§0 S1-S6)** on every e2e case — reply via `chat:reply` (or clone egress log); no
   `api.respond.io/.../message` POST; no assign/SLA/PIC/session-PUT write; every invoked sub received
   `is_test===true`.
6. **Only the parser sub changed** in the promotable diff — two nodes on `XTODTw`: `AI Agent`
   (Edit 1a/1b `.text` + Edit 1c `systemMessage` `domain_signal`) + `output_exchange.jsCode` (Edit 2a/2b).
   The SPINE `compile-current-state` leak-at-source is a flagged, separate future change — NOT promoted
   with this one.
