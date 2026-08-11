# Change #6: `domain-switch-word` — a bare/dominant domain word SWITCHES domain instead of the continuity carry reusing the prior one

Status: PLAN (planner deliverable). DOCS ONLY — no workflow edited, no execution run.

**Scope tag: `parser`.** The whole fix lives in the `output_exchange` Code node of the reformulator /
semantic-parser sub. That node runs AFTER the LLM (`AI Agent → output_exchange`) and the deterministic
bypass `mock_reformulator_output` feeds a sibling branch that skips `output_exchange` entirely (LESSON 28,
plan §8 note). So this change is **mock-blind** and REQUIRES the real reformulator — a `deterministic`/mock
path CANNOT exercise it. Offline `output_exchange` unit tests (pin the AI-Agent JSON via
`prepare_test_pin_data`→`test_workflow`) exercise the pure-code carry logic cheaply; LLM-classification
claims (that a real "promo" turn arrives as `intent_hint:null`) need a live emission.

**Source of truth (verified this cycle):** fork the clone actually calls =
`wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`), versionId
`a570efc0-c885-41ea-9345-fa291e678b53`, **draft==active**, updatedAt `2026-08-01T13:10`. Promotion target
is live `XTODTw-dJcV0uRdC056hG` (byte-splice only the #6 hunks, user-gated — §DS-promote). The `output_exchange`
body used for every line anchor below was extracted from this fork this cycle
(`scratchpad/output_exchange.js`, 814 lines). **Line numbers drift as co-resident work lands — anchor on the
quoted code, not the numbers.**

**Bug evidence (do NOT re-diagnose — given):** clone spine `txiPzSxy3Pclsz6v` exec **10826285**, parser sub
`wI5RkNGW3EOJfBdo`. `check stock for SRTW902` → did-you-mean → pick `SRTWT902` (inventory shown) → then bare
`promo` → **STOCK again**. The raw LLM (`_parser_raw`) for "promo" was
`message_type:"clarification", domain_hint:null, intent_hint:null, entities:[]`. The parser's OWN continuity
rule then produced final `output`: `domain_hint:"inventory", entities:[SRTWT902 … entity_op:"reuse"],
domain_signal_source:"intent_none", domain_reused_entityless:true`. **This is PRE-EXISTING rev4 machinery**
(dym #5's `dym_pick_domain_forced` was ABSENT — #5 correctly did not fire on a bare non-code word).

---

## D0. Located continuity logic (the rev4 machinery — quoted verbatim)

Three pieces in `output_exchange` compute the reuse. **Point 1 (the signal) fills a null/uncertain domain
from the previous turn; that is exactly what re-ran stock on bare "promo".**

### (1) The effective-signal computation (fork `output_exchange` ~L246-263) — the gate the carry keys on

```js
// ── REVISION 4: intent-only effective domain signal (de-overfit) ──
// The reliable this-turn signal is the LLM intent_hint. … bare codes reliably get intent_hint null. …
// Carry fires on `!_explicit`.
const _DECISIVE_INTENTS = new Set([
  'check_product','check_incoming','check_promotion','check_order','check_stock',
  'check_goods_receive','check_spo','check_product_attachment',
  'get_forms','get_portal_link','get_resource_attachment',
  'submit_idea',
]);
const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;
output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none';  // diagnostic
```

For bare "promo": `intent_hint:null` → `_explicit = false` → **`!_explicit` true → carry eligible.**

### (2) Reuse-path domain carry (fork ~L337-345) — the block that set `domain_hint:"inventory"` in the repro

```js
      // domain continuity for entity-less reuse (e.g. "and the price?"): carry prior domain UNLESS a
      // decisive current-turn term was present (effective signal 'explicit' → current wins). rev4: shared _explicit.
      if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
        if (!_explicit) {
          output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint || output.output.domain_hint || null;
          output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
          output.output.domain_reused_entityless = true;   // diagnostic
        }
      }
```

This is inside `case 'reuse':` of the entity-op executor. In the repro, "promo" landed `entity_op:'reuse'`
with `entities:[]` (no current entity) → `finalEntities = prior = [SRTWT902]` and this block set
`domain_hint = prev.domain_hint = "inventory"`. **This is the line that re-ran stock.**

### (3) Entity-BEARING carry (fork ~L575-601) — fires only when the current message carries an entity

```js
// ── domain continuity for entity-bearing continuations (bare "Y" code) ──
// Key on the EFFECTIVE domain signal (shared _explicit; rev4 intent-only), NOT domain_hint===null: …
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  if (!_explicit) {
    const prevDom = parent_input.previous_conversation_state?.domain_hint || null;
    const curEnts = (Array.isArray(output.output.entities) ? output.output.entities : [])
                      .filter(e => e && e.current_message === true);
    if (prevDom && curEnts.length > 0) {
      const blockedForPrev = new Set(DOMAIN_BLOCKED_HINTS[prevDom] || []);
      const compatible = curEnts.every(e => !blockedForPrev.has(String(e.hint || '').toLowerCase()));
      if (compatible) {
        output.output.domain_hint  = prevDom;                 // OVERRIDE guessed domain
        output.output.intent_hint  = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
        output.output.domain_inherited_compatible = true;
      } else {
        output.output.domain_inherit_blocked = prevDom;
      }
    }
  }
}
// runs BEFORE the blocklist-apply loop (fork ~L603: `const domain = output.output.domain_hint`)
```

`DOMAIN_BLOCKED_HINTS` is declared at fork ~L545 (BEFORE both carry sites — good, no hoist needed for #6).
`deriveRouting(output.output)` is called at fork ~L679 (AFTER both carries and the blocklist) — so any
change to `domain_hint` made before L603 is honored by routing.

**Summary of the failure:** #6's target is Point (2). A bare topic word ("promo") that carries no decisive
intent falls through `!_explicit`, has no current entity, and the reuse-path unconditionally inherits the
prior domain. The prior-domain-contamination guards (rev4) are working exactly as designed for *continuation*
turns; they simply have no notion that "promo" is a **topic switch**, not a continuation.

---

## D1. The fix — a deterministic domain-SWITCH signal that overrides the carry

Add ONE deterministic signal computed from the CURRENT message only: `_switchDomain` (a domain string or
`null`). When a **bare/dominant** domain-switch word is the message AND the LLM gave no decisive domain
(`!_explicit`) AND the current message carries no entity, `_switchDomain` names the switched-to domain. It
then (a) **suppresses both continuity carries** and (b) **sets `domain_hint` to the switched domain** just
before the blocklist-apply, so routing/get-rag/get-results all see the new domain.

This is additive and gated so tightly that on every existing path (real query, genuine continuation, dym
pick, first turn) `_switchDomain === null` and the code is inert.

### Edit A — the keyword→domain map + `_switchDomain`, inserted right AFTER `_explicit` (fork ~L263)

```js
// ── #6: deterministic domain-SWITCH word signal (this-turn-only) ──
// A bare/dominant domain word in the CURRENT message must SWITCH domain, NOT let the continuity
// carry reuse the prior domain (repro exec 10826285: "promo" after a stock turn → stock again).
// Fires ONLY when the LLM gave no decisive domain (!_explicit) AND the message reduces to switch
// word(s) of exactly ONE domain with NO other content token (no code / customer / number). A real
// query ("check stock for X") has a current entity → never reaches this. Whole-word, case-insensitive.
const _DOMAIN_SWITCH_WORDS = {
  // promotion
  promo:'promotion', promos:'promotion', promotion:'promotion', promotions:'promotion', promosi:'promotion',
  // inventory (stock/balance-on-hand)
  stock:'inventory', stocks:'inventory', inventory:'inventory', stok:'inventory', qty:'inventory', quantity:'inventory',
  // order (customer sales orders)
  order:'order', orders:'order', outstanding:'order', tempahan:'order',
  // incoming (inbound shipments / containers)
  incoming:'incoming', eta:'incoming', shipment:'incoming', shipments:'incoming',
  arriving:'incoming', container:'incoming', containers:'incoming',
  // master_products (catalogue / specification)
  catalogue:'master_products', catalog:'master_products', spec:'master_products', specs:'master_products',
  specification:'master_products', specifications:'master_products', dimension:'master_products', dimensions:'master_products',
};
// filler removed before testing "dominant": greeting/politeness/interrogative/BM connectors + generic verbs.
const _SWITCH_FILLER = new Set([
  'the','a','an','for','to','of','on','in','me','my','i','is','are','be','any','some','pls','plz','please',
  'can','could','would','you','u','got','have','has','had','do','does','did','what','whats','how','much','many',
  'check','get','show','give','tell','about','need','want','wanna','see','list','all',
  'ada','untuk','tolong','boleh','nak','saya','ni','tu','ke','yang','dan','ada?','pun','je','ya','ha',
]);
let _switchDomain = null;
if (!_explicit) {
  const _swMsg = String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0].toLowerCase();
  const _swToks = (_swMsg.match(/[a-z0-9]+/g) || []).filter(t => !_SWITCH_FILLER.has(t));
  // defense-in-depth: a current-message entity means this is a real query / entity-bearing continuation
  const _swHasCurEnt = (Array.isArray(output.output.entities) ? output.output.entities : [])
                         .some(e => e && e.current_message === true);
  if (_swToks.length >= 1 && !_swHasCurEnt) {
    const _swDoms = _swToks.map(t => _DOMAIN_SWITCH_WORDS[t] || null);
    // EVERY remaining content token must be a switch word of the SAME domain (a code / customer name is
    // unmapped → null → no fire; a mix of two domains → no fire). This is what enforces "bare/dominant".
    if (_swDoms.every(d => d !== null) && new Set(_swDoms).size === 1) {
      _switchDomain = _swDoms[0];
    }
  }
}
```

### Edit B — suppress the reuse-path carry when switching (fork ~L340)

```js
        if (!_explicit) {                    // BEFORE
        if (!_explicit && !_switchDomain) {  // AFTER  — a domain switch beats the reuse carry
```

### Edit C — suppress the entity-bearing carry when switching (fork ~L585)

```js
  if (!_explicit) {                    // BEFORE
  if (!_explicit && !_switchDomain) {  // AFTER
```
(Belt-and-suspenders: `_switchDomain` already requires `!_swHasCurEnt`, and the entity-bearing carry
requires `curEnts.length > 0`, so they are mutually exclusive in practice. The guard makes the intent
explicit and cheap.)

### Edit D — apply the switch, AFTER both carries, BEFORE blocklist-apply (fork ~L601, just before L603)

```js
// #6: a bare/dominant domain-switch word overrides the continuity carry. Placed after both carry
// blocks and before the blocklist-apply (next line reads output.output.domain_hint) and before
// deriveRouting (~L679), so routing/get-rag/get-results all honor the switched domain.
if (_switchDomain) {
  output.output.domain_hint = _switchDomain;
  output.output.domain_switched_by_keyword = _switchDomain;   // diagnostic
  output.output.intent_hint = null;   // drop carried/guessed intent; downstream re-derives from the new domain
}
```

**Full edit inventory: ONE node (`output_exchange`), four hunks** — A (insert map + `_switchDomain`),
B (`&& !_switchDomain` on reuse carry), C (`&& !_switchDomain` on entity-bearing carry), D (apply switch).
No prompt/`systemMessage`/`.text` change. No new LLM output field.

---

## D2. The fire-guard (the exact contamination / over-trigger boundary)

`_switchDomain` is non-null **iff ALL** hold:
1. `!_explicit` — the LLM gave NO decisive domain (null or non-decisive intent). If the LLM was decisive we
   do not fight it (documented decision — see D4). The repro is exactly an `!_explicit` (null-intent) turn.
2. `!_swHasCurEnt` — the current message carries NO entity (no `current_message===true` entity). A real
   query ("check stock for **SRTW902**") or entity-bearing continuation ("how about **SRTWT5902**") has one
   → excluded.
3. After stripping `_SWITCH_FILLER`, the message has ≥1 content token AND **every** content token is a
   switch word mapping to the **same** domain. A residual code / customer name / unmapped word → not a clean
   bare switch → no fire. A mix ("promo stock") → two domains → no fire.

This is the "dominant token" rule: the message must *reduce to* the switch word(s) of one domain. Because a
code, number, or customer name is unmapped, guard (3) alone already implies (2); (2) is kept as an explicit,
cheap backstop.

**Why it cannot resurrect rev4's contamination:** rev4 killed *previous-domain* contamination (the LLM
anchoring on the prior domain). #6 never reads the previous domain to DECIDE — it reads only the current
message tokens. It only *overrides* the reuse of the previous domain when the current message is
unambiguously a different topic. On a genuine continuation (no domain word, or a bare code) `_switchDomain`
is null and the rev4 carry runs exactly as today.

---

## D3. Entity handling (#4) — KEEP the carried entity, let the blocklist prune

**Decision: keep the carried entity and switch the domain** → "promo" after stock for SRTWT902 becomes
**promotions for SRTWT902**, not broad promotions.

- It is free: the reuse path already sets `finalEntities = prior = [SRTWT902]`; #6 changes only
  `domain_hint`, never `entities`.
- It matches intent: a bare topic word is a *lens change on the same subject*, not a fresh broad query. The
  customer is still thinking about the product they just saw.
- It is self-correcting via the existing blocklist-apply. The carried entity survives IFF compatible with
  the new domain:
  - product (SRTWT902, hint `product`) is **not** in `DOMAIN_BLOCKED_HINTS` for promotion / inventory /
    order / incoming / master_products → survives → targeted answer ("promotions for SRTWT902").
  - if the carried entity is a **customer** and the switch is to inventory/incoming (`customer` ∈ their
    blocklists) → the blocklist drops it → the query correctly broadens ("stock" broad). No special-casing
    needed; the existing filter does the right thing.
- Consistent with the gate's ALLOWS_EMPTY: promotion (and the other switch domains) allow an empty entity
  set, so even a dropped-entity broad query is valid downstream.

No change to entity handling code is required — this decision is realized entirely by Edit D running before
the blocklist-apply.

---

## D4. Placement, downstream honor, and interactions

- **Placement (D4a):** `_switchDomain` is computed right after `_explicit` (fork ~L263) so it is available
  to BOTH carry gates (reuse at ~L340, entity-bearing at ~L585). The *assignment* (Edit D) is placed after
  both carries and **immediately before the blocklist-apply** (`const domain = output.output.domain_hint`,
  ~L603). `deriveRouting` is called at ~L679 (after L603), so **routing recomputes from the switched
  domain** — e.g. promotion → `marketing_promotion_<brand>`, inventory → `warehouse`. get-rag/get-results
  key on `domain_hint` too → both honor the switch. The `DATE_FILTER_DOMAINS` gate (~L804) also sees the
  final switched domain. No downstream node needs editing.
- **Interaction with rev4 (#2-v3 continuity):** #6 only fires when rev4's carry would otherwise WRONGLY
  reuse the prior domain on a topic-switch word. On real continuations `_switchDomain` is null → rev4 runs
  unchanged. Verified inert by the regression cases (§DS-R*).
- **Interaction with dym pick (#5):** a dym pick is triggered by the typed message matching an OFFERED
  candidate code (`_isBareCode = norm(_hit.code) === norm(message)`, fork ~L212). A bare domain WORD is not
  a code → never matches a candidate → #5 does not fire (confirmed absent in exec 10826285). Conversely a
  bare offered CODE is unmapped in `_DOMAIN_SWITCH_WORDS` → `_switchDomain` null → #6 does not fire. **A
  code is not a domain word; a domain word is not a code — the two triggers cannot collide.** None of the
  switch words are code-shaped.
- **Interaction with #3 / #4 / select-ALL / member-pick / escalation:** untouched. #6 reads only the current
  message tokens and `domain_hint`; it does not touch entities, positional picks, escalation, or
  member-pick. A menu-position reply ("1"/"2") or "all"/"semua" does not reduce to a switch word ("all" is
  in `_SWITCH_FILLER` and is stripped, leaving zero content tokens → no fire).
- **Does NOT address backlog-bare-code-domain-carry.** That separate deferred bug is about a bare *code*
  losing its carried domain because the LLM tags it a decisive `check_product`. #6 is about a bare *domain
  word* switching domain — a code is never a switch word, so #6 is orthogonal. (Recorded so nobody conflates
  them.)
- **Deliberately NOT overriding an `_explicit` LLM classification.** #6 is gated on `!_explicit`. If the LLM
  was decisive we trust it — the repro is an `!_explicit` (null-intent) case, and overriding a confident LLM
  risks clobbering legitimate decisive classifications. (This is the conservative half of the task's "or
  even when it conflicts" — see the RISK for the user below.)

---

## D5. Test driver & mode (same constraints as rev4 — this is multi-turn)

#6 is intrinsically multi-turn (turn N reads turn N-1's `previous_conversation_state.domain_hint`). Per
LESSON 31 + the rev4 plan:

- **`uac` mode CANNOT round-trip session** (sources prior state from PROD; redis-item injection of
  `previous_conversation_state` does not reach the reformulator) → NOT usable for the multi-turn cases.
- **REPLAY IS BLIND** — `regress-replay` pins `mock_reformulator_output`, bypassing `output_exchange`
  entirely → a pinned replay shows ZERO diff for this change → false all-green. Do NOT use replay.
- **Valid drivers (both zero-egress, real reformulator):**
  1. **`chat-stateful` console lane (PRIMARY)** — `zz-chat` → dispatcher → clone `txiPzSxy3Pclsz6v` →
     forked reformulator `wI5RkNGW3EOJfBdo`. Session R/W via `respond_contacts_test`; reply from redis
     `chat:reply:{chat_id}`. Reset the session row ONCE before turn-1 of each chain; NEVER between turns.
  2. **`mode=regress-capture` (ALTERNATIVE)** — drive the clone by redis item; session sources from
     `respond_contacts_test`, each turn's write visible to the next. Do NOT reset the row mid-chain.
- **Offline `output_exchange` unit (CHEAPEST, run FIRST):** `prepare_test_pin_data`→`test_workflow` pinning
  the AI-Agent output; feed synthetic `parent_input.previous_conversation_state` + LLM `output.output`
  pairs and assert the carry/switch logic directly (0 LLM tokens). This is the primary gate for the switch
  logic; e2e proves the LLM really emits null-intent for a bare "promo".

Contact `437264483` (FULL access) for all e2e cases.

---

## D6. Verification tasks (planner-defined)

- **V6-0 (offline `output_exchange` unit — 0-token, PRIMARY GATE).** Feed synthetic pairs, assert:
  - **★ switch-over-reuse (the repro):** prev `{domain_hint:'inventory', entities:[{raw:'SRTWT902',hint:'product'}]}`
    + LLM `{message_type:'clarification', domain_hint:null, intent_hint:null, entity_op:'reuse', entities:[]}`
    + `latest_user_message:'promo'` → **`domain_hint==='promotion'`**, `domain_switched_by_keyword==='promotion'`,
    `domain_reused_entityless` ABSENT (reuse carry suppressed), and the carried `SRTWT902` still present
    (product compatible with promotion). **A gate that does NOT check `domain_hint` would pass the buggy
    output — this case must go red on unpatched code.**
  - order / incoming / master_products switch: same prev, `latest_user_message:'order'` → `order`;
    `'incoming'` → `incoming`; `'catalogue'` → `master_products`. Carried entity present each time.
  - **filler tolerance:** `'any promo?'`, `'show me the catalogue'`, `'stock ada?'` still fire (filler
    stripped to one switch token).
  - **no-fire — real query:** `latest_user_message:'check stock for SRTW902'` with a current entity
    `{raw:'SRTW902',hint:'product',current_message:true}` → `_switchDomain` null → `domain_switched_by_keyword`
    ABSENT; domain resolves via the normal path (NOT via #6). (Also `_explicit` likely true here — assert #6
    inert regardless.)
  - **no-fire — genuine continuation, no domain word:** prev inventory + `'how about SRTWT5902'` (current
    entity present) → `_switchDomain` null, rev4 entity-bearing carry runs → `domain_hint==='inventory'`,
    `domain_inherited_compatible===true`, `domain_switched_by_keyword` ABSENT.
  - **no-fire — bare code (dym-pick shape):** `latest_user_message:'SRTWT902'` (unmapped) → `_switchDomain`
    null; the dym/reuse path is untouched.
  - **no-fire — ambiguous / mixed:** `'promo stock'` (two domains) → null; `'balance'` / `'delivery'` /
    `'price'` (deliberately EXCLUDED words) → null (they are not in the map).
- **V6-1 (LLM precondition, real reformulator).** Confirm a real bare `promo` turn after a stock turn
  arrives at `output_exchange` as `intent_hint:null` / `domain_hint:null` (i.e. `!_explicit`) — the whole
  fix depends on the LLM NOT decisively classifying bare "promo". If the live LLM sometimes emits a decisive
  `check_promotion` for bare "promo", #6 is simply not needed that turn (domain already promotion) — record,
  not a failure. Sample a few of the switch words (promo/order/incoming) to confirm the null-intent
  assumption holds for the common ones.
- **V6-2 (★ repro e2e, `chat-stateful`).** T1 `check stock for SRTW902` → dym → T2 pick `SRTWT902`
  (inventory) → T3 `promo`. Assert T3 `output.output.domain_hint==='promotion'`,
  `domain_switched_by_keyword==='promotion'`, routing recomputed to `marketing_promotion_*` (NOT
  `warehouse`), get-results/get-rag ran on promotion (NOT the stock file), carried SRTWT902 present. §0 holds.
- **V6-3 (other switches e2e).** After a stock turn: `order` → `order`; `incoming` → `incoming`. Routing
  recomputes (`customer_service`/`purchasing`). Carried entity retained or blocklist-pruned as compatible.
- **V6-4 (regression, e2e/offline).** (a) real `check stock for X` → inventory, #6 inert
  (`domain_switched_by_keyword` absent). (b) genuine continuation `how about SRTWT5902` after stock →
  inventory (rev4 carry, #6 inert). (c) dym pick (bare code) → still a pick (#5), #6 inert. Each is a HARD
  regression gate.
- **V6-5 (byte-inert off-path).** Spot 5-8 single-turn corpus turns with no prior state: assert
  `domain_switched_by_keyword` absent and domain unchanged vs a pre-change run (no spurious switch when the
  message legitimately IS a query whose first word happens to be a domain word but carries an entity).

---

## D7. Acceptance criteria

1. **Repro fixed** — bare `promo` after a stock turn yields `domain_hint='promotion'` with
   `domain_switched_by_keyword='promotion'`, routing = `marketing_promotion_*`, NOT stock (V6-2). Carried
   SRTWT902 retained.
2. **Other switches work** — `order`/`incoming`/`catalogue`/etc. after a stock turn switch domain (V6-3).
3. **No continuity regression** — real query, genuine no-domain-word continuation, and dym pick all behave
   exactly as today; `_switchDomain` null on each (V6-4). The offline unit's no-fire cases are green.
4. **Offline unit green FIRST** — V6-0 incl. the ★ switch-over-reuse case that goes red on unpatched code.
5. **Zero egress (§0 S1-S8)** on every e2e case — reply via `chat:reply` (or clone egress log); no
   respond.io send/comment; no assign/SLA/PIC/session-PUT write; every invoked sub received
   `is_test===true`; S6 token-sink bound to `parser`; S7 sink-delta + attribution clean.
6. **Only `output_exchange` changed** in the promotable diff — four hunks (A-D), one node, no prompt change.
   Live `XTODTw` gets the byte-exact splice, user-gated (§DS-promote).

---

## D8. RISK / decisions needing the user before coding

- **R1 — the map's debatable entries (contamination-vs-coverage boundary).** I EXCLUDED `balance` (order
  vs inventory balance), `delivery` (incoming container-delivery vs order delivery-to-customer — the
  decisive-term LLM path already handles "delivery for <customer>"→order), `price` (promo/selling/list/order
  price), and `po` (noisy 2-char token). I INCLUDED promo/stock/order/outstanding/incoming/eta/container/
  catalogue/spec + a few BM (`promosi`,`stok`,`tempahan`). **Confirm the excluded four should stay excluded**;
  each is a genuine ambiguity that would mis-switch. Broader BM coverage is deferrable.
- **R2 — fire only on `!_explicit` (do we ever override a CONFIDENT LLM?).** I gated #6 to act ONLY when the
  LLM gave no decisive domain — the conservative reading of the task's "or even when it conflicts". This
  cannot fix a case where the LLM confidently and WRONGLY classifies bare "promo" as inventory (never
  observed). Overriding an `_explicit` classification would let a keyword beat the LLM's decisive call — a
  bigger blast radius. **Recommend keeping `!_explicit`.** Flag if the user wants the stronger
  keyword-wins-even-when-explicit behavior (I would want a much tighter word list first).
- **R3 — this is a LIVE parser change (no wired fork shields it at promote).** Build/test on fork
  `wI5RkNGW3EOJfBdo`; live `XTODTw` untouched until a user-gated byte-splice of the four #6 hunks (LESSON
  25/57/58 — re-sha at current live, strip trailing whitespace, target by node NAME). The fork is
  co-resident with rev4 + decline-flag + dym; splice ONLY the #6 blocks, never wholesale-replace.
- **R4 — keep-the-entity default (D3).** Confirmed sensible for product entities across all switch domains
  and self-correcting via the blocklist for customer entities. Flag if any real case shows a nonsensical
  cross-domain carried filter; none found in analysis.
