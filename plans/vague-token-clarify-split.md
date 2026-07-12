# Change Plan — vague-token clarify split (confident-flag-driven not-found)

Change-id: `vague-token-clarify-split`
Status: PLAN (planner deliverable). No workflow edited; no execution run.
Build target: TEST clone `txiPzSxy3Pclsz6v` (Change 2) + reformulator sub `XTODTw-dJcV0uRdC056hG`
(Change 1). NEVER touch the live spine `9qVyfUxmRQqrpGRMDLRuz`.
Scope tag: **`scope: parser`** (the load-bearing new signal — per-entity `confident` — originates in the
reformulator LLM; cases (a)/(b)/(f) cannot be accepted without running the real reformulator). The
Change-2 branch logic is independently testable at the cheaper **`deterministic`** sub-tier by injecting
`mock_parser_output` carrying pinned `confident` flags (0 parser tokens). See §8.
Source of truth for node facts: live n8n via `get_workflow_details` for both workflows; jsCode of every
target/wiring node pulled and quoted/cited verbatim below.

This is the "own plan" deferred at the end of `output-exchange-axis-and-memberpick-fix.md`
("Tier-based low-confidence clarify … handles … the 'one siew' capture via clarify, no prompt nudging").
That plan explicitly declined a parser *rule* for the "one siew" mash and routed the fix to a
**clarify-when-uncertain downstream** mechanism. This plan is that mechanism — but the uncertainty signal
is produced semantically by the parser (a `confident` bool), not by a string heuristic.

---

## 0. What this change is (and is not)

Reproduced symptom (exec `6965779`, reformulator `XTODTw-dJcV0uRdC056hG`): user msg
`"One siew srtkt72ss already delivered?"` → reformulator collapsed the whole phrase into ONE entity
`{raw:"One siew srtkt72ss", hint:"order"}` → `resolve-entity` returned
`unresolved_tokens:["One siew srtkt72ss"]` → spine `If3` TRUE → `not-found-error-message` final `else`
branch emitted `"Could not find order for One siew srtkt72ss. Would you like me to escalate to
customer_service team?"` with `is_clarification=false` → `escalate-catalog` set `is_escalate_offer=true`.
Wrong: a vague mash (qty+name+code crammed together) is NOT a clear-but-missing record; offering
escalation also primes the *next* turn to be read as an escalation confirmation.

**Core insight (LOCKED — do not re-open):** vagueness is SEMANTIC, not string-shape. `water closet`,
`bathtub`, `skind enterprise sdn bhd` are multi-word yet CLEAR (category / category / customer).
`one siew srtkt72ss` is vague (qty + name + code mashed into one untyped referent). No string heuristic
in the not-found node can separate them — only the parser can. So the signal must come from the
reformulator.

Three workflow changes + one docs deliverable:

- **Change 1 (reformulator `XTODTw`, parser):** emit a per-entity `confident` bool.
- **Change 2 (clone `not-found-error-message`, deterministic Code):** when an unresolved token maps back
  to a `confident:false` entity → CLARIFY instead of escalate-offer.
- **Change 3 (loop/timing):** NO new state — the current-turn `confident` flag is the entire control.
- **Change 4 (docs):** ship `docs/flows/sorento-consume-main.md` + `docs/flows/sub-query-reformulator.md`.

**Explicitly NOT in scope:** the resolver / `entity_resolver.py` (its `match_mode:"and"` customer+product
resolution is relied on as-is in §9 verify-check V-C1, not changed); any other reformulator behaviour
(domain/intent/axis/member-pick logic untouched — those were the ABCDE changes already shipped); any other
branch of `not-found-error-message` (`missingAttachmentType`, `needsScope`, `require_specific` stay
byte-identical); the `Fix B` product_attachment phrasing shipped in `fix-gate-render-notfound-msg`
(preserved, the new clarify check sits ABOVE it in the final `else`).

---

## 1. Confirmed wiring (live, read-only — do NOT re-investigate)

Reformulator `XTODTw-dJcV0uRdC056hG` (7 nodes, `active=true`, `versionId==activeVersionId==292faed2…`,
i.e. published): `AI Agent` (LLM, `lmChatOpenAi`) → `output_exchange` (Code post-processor) is the parse
spine; `test-reformulator-bypass`/`mock-reformulator-output` is the test bypass. The LLM **system message**
(`AI Agent.parameters.options.systemMessage`) defines the entity contract:

```
Each entity: { "raw": "<exact phrase>", "hint": "product|promotion|customer|transporter|inbound_shipment|
warehouse|attachment|form|order|category|brand|attachment_type|goods_receive|spo",
"current_message": true if … current message, false if … previous context }
```

`output_exchange` does NOT rebuild entity objects on the current-message path — `current` is
`all.filter(e => e.current_message === true)` and prior entities are `{...e, current_message:false}`
(spread), so **any extra entity key the LLM emits — including `confident` — is preserved verbatim**
through to `output.output.entities`. (Synthetic entities it injects — the `flyer` push, positional-pick
reconstruction — are confident-by-construction and irrelevant to vagueness.)

Clone `txiPzSxy3Pclsz6v` (101 nodes, `active=false`). Relevant branch tree (verified):

```
resolve-entity ─▶ disallowed-entity-gate ─▶ If3
If3 (combinator OR):  resolve-entity.unresolved_tokens.length > 0   OR   gate.gate_passed === false
   ├─ TRUE  ─▶ not-found-error-message ─▶ tag-not-found ─▶ escalate-catalog ─▶ cs-offer-gate ─▶ … send
   └─ FALSE ─▶ Execute 'sub-get-rag' ─▶ … ─▶ Aggregate1 ─▶ not-found-error-message (0-result re-entry)
If2 (combinator OR):  output.escalation.is_escalation_confirmation === true
                      OR (message_type=="request_for_help" && domain_hint!="portal_link")
   └─ TRUE  ─▶ Call 'sub-human-intervention' (guarded, is_test=true) | tag-out-of-scope | If10
```

The decisive coupling — `escalate-catalog` (Code), `not_found` case (quoted verbatim):

```js
case 'not_found': {
  const nf = $('not-found-error-message').first().json;
  response          = nf.escalate_message;
  manualResponse    = !nf.require_specific;
  is_escalate_offer = !nf.is_clarification;   // offer only when it's not a clarification prompt
  break;
}
```

So **`is_escalate_offer = !is_clarification`**: making `not-found-error-message` set
`is_clarification=true` is, by itself, the entire mechanism that flips the escalate-offer off. No edit to
`escalate-catalog`, `If3`, `tag-not-found`, or any downstream node is needed. (`require_specific` stays
false on the clarify path → `manualResponse=true` → renders as a question, not the escalate template.)

The domain-driven label set already exists: `disallowed-entity-gate` emits
`gate_debug.allowed_lookup = ALLOWED[domain]`, and `not-found-error-message` already reads it as
`allowedTypes` and renders it via `humanList()`. The `ALLOWED` map (verbatim):

```js
const ALLOWED = {
  master_products:    ['product', 'category', 'brand'],
  product_attachment: ['product', 'attachment', 'attachment_type', 'category', 'brand'],
  promotion:          ['product', 'promotion', 'category', 'brand'],
  inventory:          ['product', 'category', 'brand'],
  order:              ['order', 'customer_order', 'transporter', 'customer', 'product'],
  incoming:           ['product', 'inbound_shipment', 'category', 'brand'],
  forms:              ['form'],
  portal_link:        [],
};
```

So `order → "order, customer_order, transporter, customer, or product"`,
`master_products → "product, category, or brand"`. Change 2's clarify message draws its labels from this,
not from a hand-written per-domain string.

The clone's deterministic test bypass: `parser-bypass-gate` IF fires on
`!!redis-pop-main-message-list.first().json.message.mock_parser_output`, so injecting
`mock_parser_output` (with `confident` flags on its entities) makes
`$('Call 'sub-query-reformulator'').first().json.output` return it and spends **0 parser tokens**.

---

## 2. Change 1 — Reformulator `XTODTw`: per-entity `confident` bool (parser)

**Where:** the `AI Agent` system message (`@n8n/n8n-nodes-langchain.agent`,
`.parameters.options.systemMessage`) — the entity-contract section and the `OUTPUT` schema example.
`output_exchange` needs **no functional change** (it already preserves the key). One optional defensive
default may be added there (see §2.3).

### 2.1 Semantics (LOCKED)
- `confident:false` ⟺ the parser had to cram >1 concept/type into one `entity.raw` because the user gave
  NO separation/label (e.g. `one siew srtkt72ss` → a single `order` entity, qty/customer/product cannot be
  separated).
- `confident:true` ⟺ each entity is ONE cleanly-typed referent: a single word, a multi-word phrase that is
  one referent (`water closet`, `skind enterprise sdn bhd`), OR a user-labeled part. When the user labels
  parts (`customer one siew, product srtkt72ss`) the parser SPLITS into TWO entities
  `{raw:"one siew",hint:"customer",confident:true}` + `{raw:"srtkt72ss",hint:"product",confident:true}`.
- **Default when omitted/uncertain → `true`** (keep clarify intentional; avoid over-clarifying). Enforced
  by the consumer (§3) and optionally hardened in `output_exchange` (§2.3).

### 2.2 Prompt edit (coder, on the reformulator)
1. In the per-entity contract line, append `confident` to the object shape:
   `{ "raw", "hint", "current_message", "confident": true|false }`.
2. Add a short contract section (sibling to `== ATTACHMENT TYPE EXTRACTION ==`) defining `confident`
   exactly per §2.1, with the worked examples: `one siew srtkt72ss` (single order entity, `confident:false`)
   vs `water closet` / `skind enterprise sdn bhd` (single entity, `confident:true`) vs the labeled split
   `customer one siew, product srtkt72ss` → two `confident:true` entities.
3. Add `confident` to the `entity` line of the `== OUTPUT ==` schema block.
4. State the default-true rule for the LLM (when unsure, prefer `confident:true`).

### 2.3 `output_exchange` (optional hardening — coder's call, regression-safe)
A one-line defensive default immediately before `output.output.entities = finalEntities`:
`finalEntities = finalEntities.map(e => (e.confident === false ? e : ({ ...e, confident: true })));`
This guarantees every entity carries an explicit `confident` even for legacy/synthetic entities. It is a
strict no-op on entities the LLM already flagged `false`, and sets the documented default elsewhere — so it
cannot change any existing routing. If omitted, the §3 consumer applies the same default (`!== false`)
locally; either placement is acceptable. (Pick ONE to avoid double-doc.)

---

## 3. Change 2 — clone `not-found-error-message`: branch on `confident` (deterministic Code)

**Where:** the final `else` block of `not-found-error-message` (the lookup-miss / escalate branch that
runs when NOT `missingAttachmentType` and NOT `needsScope`). The new clarify check sits at the TOP of that
block, ABOVE the existing `if (require_specific) … else if (q.domain_hint==='product_attachment') … else …`
ladder (which is preserved byte-identical, including the shipped Fix-B phrasing).

### 3.1 Logic
Inside the final `else`, before the existing `require_specific` ladder:

```js
// vague-token clarify: among the UNRESOLVED tokens only, map each back to a reformulator
// entity by raw and read its `confident` flag. ANY confident:false → this is a vague mash,
// not a clear-but-missing record → CLARIFY (no escalate offer).
const ents = Array.isArray(q?.entities) ? q.entities : [];
const norm = s => String(s ?? '').trim().toLowerCase();
const byRaw = new Map(ents.map(e => [norm(e.raw), e]));
const vagueUnresolved = unresolved.filter(t => byRaw.get(norm(t))?.confident === false);

if (vagueUnresolved.length > 0) {
  is_clarification = true;                         // → escalate-catalog: is_escalate_offer = false
  const labels = humanList(allowedTypes);          // ALLOWED[domain] = gate_debug.allowed_lookup
  const captured = vagueUnresolved.join(', ');
  escalate_message =
    `I captured "${captured}" but couldn't tell which part is which. ` +
    `For a ${q.domain_hint} enquiry, please give me a labeled specific — e.g. ${labels}.`;
} else {
  // EXISTING ladder, unchanged:
  // if (require_specific) { … } else if (q.domain_hint === 'product_attachment') { … } else { … }
}
```

Notes:
- `unresolved` = `resolve-entity.unresolved_tokens` (raw strings), already computed in the node.
- `humanList(allowedTypes)` already renders `gate_debug.allowed_lookup` as
  `"order, customer_order, transporter, customer, or product"` etc. — the coder may lightly tailor the
  per-domain phrasing (e.g. `order → "the order/DO number, or customer <name> + product <code>"`) but it
  MUST derive from `ALLOWED[domain]`, never a free string. Keep the captured-raw echo + "which part is
  which" clause exactly so the message is plainly a clarification, NOT an escalation offer (no "would you
  like me to escalate" substring — that is what previously primed next-turn escalation-confirm).
- Default-true: the filter uses `=== false`, so an entity missing `confident` (or `true`) never triggers
  clarify → the existing escalate behaviour is preserved for every clear token.

### 3.2 Net effect by token shape
| this turn | before | after |
|---|---|---|
| vague mash unresolved (`one siew srtkt72ss`, `confident:false`) | escalate offer (`is_escalate_offer=true`) | CLARIFY, `is_escalation_offer=false`, domain-labeled ask |
| clear single code unresolved (`SMC202606-9999`, `confident:true`) | escalate offer | UNCHANGED escalate offer |
| clear multi-word unresolved (`water closet`, `confident:true`) | escalate offer | UNCHANGED escalate offer |
| clear + resolved + get-results 0 rows | escalate offer (Aggregate1 re-entry) | UNCHANGED escalate offer |

---

## 4. Change 3 — loop / escalate timing: NO new state (LOCKED)

The `confident` flag on the CURRENT turn is the entire control. There is NO new conversation variable, NO
new session field.
- vague (`confident:false`, unresolved) → clarify; repeats naturally each turn until the user says
  something `confident:true`.
- `confident:true` but unresolved → escalate offer (existing not-found else path).
- `confident:true` + resolved but get-results returns 0 rows → escalate offer (existing `Aggregate1`
  re-entry).
- `request_for_help` / escalation confirmation at any time → `If2` → human-intervention (existing).

The original "next-turn escalation-confirm" worry is structurally dead: the clarify message contains NO
"would you like me to escalate" line, so the reformulator will not read the user's next message as an
escalation confirmation (`If2` won't fire on it).

---

## 5. Change 4 — flow docs (ship with this change)

`docs/flows/` does not yet exist (only `docs/LESSONS.md`). Create two reference docs, grounded against
live MCP `get_workflow_details` (NOT files). These are the coder's deliverable alongside the code; the
reviewer checks they match the shipped graph.

- **`docs/flows/sorento-consume-main.md`** — the branch tree: `If3` (unresolved OR gate-fail → not-found),
  `If9` (casual/unknown/confirmation/business-query-with-null-domain → clarify-menu), `If10` (correction),
  `If2` (escalation), `not-found-error-message` (all four arms: vague-clarify [new], missingAttachmentType,
  needsScope, escalate-ladder), `escalate-catalog` (the `branch_kind`→message/flags map, especially
  `is_escalate_offer = !is_clarification`), and the `tag-*` setters (`tag-not-found`, `tag-clarify-menu`,
  `tag-escalate-offer`, `tag-not-supported`, `tag-out-of-scope`, `tag-access-choice`, `tag-demand-qty`).
- **`docs/flows/sub-query-reformulator.md`** — the `confident` flag (semantics §2.1), the entity ops
  (`clear`/`replace_combine`/`modify`/`reuse`), the full OUTPUT schema, and the `output_exchange` ↔ LLM
  split (LLM extracts; `output_exchange` reconciles axis/reuse/positional + preserves extra entity keys).

---

## 6. Verification tasks (this change)

1. **V1 — repro (pre-change):** on the clone in `uac` mode, `scope: parser`, run
   `"One siew srtkt72ss already delivered?"` (contact `437264483`). Capture `Call 'sub-query-reformulator'`
   output, `resolve-entity` (`unresolved_tokens`), `not-found-error-message`
   (`escalate_message`/`is_clarification`), `escalate-catalog` (`is_escalate_offer`). ASSERT pre-change:
   `is_clarification=false`, `is_escalate_offer=true`, message contains `Would you like me to escalate`.
   If it does not reproduce, STOP and report.
2. **V2 — Change 1 emission (parser):** run UAC §13a (vague mash) + §13b (labeled split) on the clone with
   the REAL reformulator (`scope: parser`). ASSERT (structural, not exact text):
   §13a → exactly one entity, `hint:"order"`, `confident:false`; §13b → ≥2 entities, a `customer` + a
   `product`, BOTH `confident:true`. Save both reformulator outputs to
   `tests/fixtures/parser/vague-mash-one-siew.json` and `…/labeled-split-one-siew.json` for the
   deterministic re-runs.
3. **V3 — Change 2 branch logic (deterministic):** with `mock_parser_output` carrying the pinned
   `confident` flags, run §13a/§13c/§13d/§13e. ASSERT per §7.1.
4. **V4 — no-escalate-offer-leak:** across §13a and every repeated-vague turn, grep the full
   `get_execution` for the substring `escalate to` / `would you like me to escalate` in any node's
   `escalate_message`/`response` → must be ABSENT on a vague-clarify turn.
5. **V5 — §0 safety gate (mandatory, every case):** S1–S6 from UAC §0 — clone, `is_test=true`, egress
   blocked. The escalation case §13f-RFH is the highest-risk (S2): assert NONE of `Assign or unassign a
   Conversation1`, `conversation-sla-tracking-create`, the assignee-queue `Redis` push, or
   `Call 'sub-add-comment-respond'`/`'1` executed.
6. **V6 — regression replay (post-change, before promote):** replay the corpus; confirm the §7.2 diff
   attribution + byte-identical requirement.

---

## 7. Acceptance criteria + regression scope

### 7.1 Functional acceptance
- **A1 (vague → clarify):** vague mash (`confident:false`) unresolved →
  `not-found-error-message.is_clarification === true`, `escalate-catalog.is_escalate_offer === false`;
  `escalate_message` echoes the captured raw, says it couldn't tell which part is which, and asks for a
  labeled specific drawn from `ALLOWED[domain]`; contains NO `escalate to … team` substring.
- **A2 (labeled split → resolves):** turn-2 `customer one siew, product srtkt72ss` → reformulator emits
  ≥2 `confident:true` entities (customer + product); `resolve-entity` resolves the order via
  `match_mode:"and"` (customer ∧ product) → `If3` FALSE → get-rag/get-results (real read). NO clarify, NO
  escalate-offer.
- **A3 (clear-but-unresolved → escalate UNCHANGED):** a clear single code (`SMC202606-9999`,
  `confident:true`) that does not resolve → existing escalate offer
  (`is_clarification=false`, `is_escalate_offer=true`, "Would you like me to escalate to … team?").
- **A4 (clear-but-no-data → escalate, NEVER clarify):** a real product (`SRTKT72SS`) with 0 result rows →
  `If3` FALSE → get-rag/get-results → `Aggregate1` re-entry into `not-found-error-message` → escalate
  offer. The vague-clarify check MUST NOT fire (there is no `confident:false` unresolved token on this
  turn — the token resolved).
- **A5 (multi-word-clear → escalate, NOT clarify):** `water closet` (single `confident:true` entity)
  unresolved → escalate offer, NOT clarify. This is the discriminator proving vagueness is semantic, not
  word-count.
- **A6 (loop):** repeated vague stays clarify across N turns (no state accretion, no escalation-confirm
  mis-read); a `request_for_help` at any point → `If2` → human-intervention (guarded).

### 7.2 Regression scope (golden-master replay)
- **Allowed-to-change nodes:** the reformulator parse output (new `confident` key on entities — additive)
  and the clone `not-found-error-message` ONLY — and the downstream cascade ONLY on turns where the new
  clarify check flips `is_clarification` (which flips `escalate-catalog.is_escalate_offer` +
  `response`/`manualResponse`, and may change the would-send message).
- **Byte-identical requirement:** every turn whose unresolved tokens are all `confident:true` (or have no
  unresolved token) must be byte-identical across ALL nodes vs golden EXCEPT for the additive `confident`
  key on entities (which is allowlisted as an additive field, value `true`, on those turns). Any other
  diff on such a turn = HARD FAIL.
- **Reviewer obligation:** every replay diff must be attributable to (i) the additive `confident` key, or
  (ii) a vague-mash turn flipping escalate-offer→clarify. An unattributable diff = REQUEST-CHANGES.

---

## 8. Scope / cost tier

Change-level tag: **`scope: parser`**. Rationale: the feature's correctness depends on the reformulator
actually emitting `confident:false` for a mash and SPLITTING a labeled message into confident entities —
that can only be validated with the real reformulator (UAC §13a-parser, §13b, §13f). Injecting
`confident` flags would prove nothing about the parser.

Per-case sub-tiering (the tester runs the cheapest tier that still validates the case):
- §13a-parser, §13b, §13f → **parser** (real reformulator; tokens spent on `gpt-5.4-mini` reformulator).
- §13a-det, §13c, §13d, §13e → **deterministic** (inject `mock_parser_output` with pinned `confident`
  flags from V2; 0 parser tokens). The clone's `parser-bypass-gate` fires on `message.mock_parser_output`.

S6 (token-sink bound): on a `deterministic` case NO LLM node runs; on a `parser` case ONLY the
reformulator `gpt-5.4-mini` runs (the consume-main clarification `gpt-4.1-mini` `Basic LLM Chain` is gated
behind `validator.has_result=false` and is not reached on these branches). The get-results agent is
orphaned (0 tokens) even when §13d reaches get-results.

---

## 9. Open items / verify-during-build (checks, NOT decisions)
- **V-C1 (resolver AND-resolve):** confirm `resolve-entity` resolves an ORDER by `customer ∧ product`
  with `match_mode:"and"` (the §13b turn-2 success path) against the CRM resolve-endpoint contract
  (`/Users/tehjayson/Documents/foundryx/sorento_crm`). If the resolver cannot AND customer+product into an
  order, §13b's "resolves" assertion downgrades to "does not clarify and routes to get-rag/get-results".
- **V-C2 (reformulator split reliability):** confirm the real reformulator reliably SPLITS
  `customer X, product Y` into two `confident:true` entities (likely already true given the existing
  customer/product extraction; confirm in V2). If it does not split, Change 1's split rule (§2.2) needs
  prompt reinforcement — flag to planner, do not silently patch.
- **V-C3 (raw-match key):** confirm `not-found-error-message` can map `unresolved_tokens` (raw strings)
  back to `q.entities` by `raw`. §3.1 normalizes with `trim().toLowerCase()`. Verify the resolver returns
  `unresolved_tokens` as the same raw phrase the parser put in `entity.raw` (exec `6965779` shows both =
  `"One siew srtkt72ss"`). If the resolver lower-cases or re-tokenizes, the normalize step covers it;
  if it splits the phrase, the map misses — flag.

## 10. Promotion
Per CLAUDE.md: only the reviewed business-logic diff (the `not-found-error-message` clarify block + the
reformulator prompt additions), guards stripped, user-gated, backup-first. The reformulator change is
pure-parse / zero-egress (per `output-exchange-axis-and-memberpick-fix.md`, safe to edit live but MUST
`publish_workflow` after — drafts don't auto-run). The clone `not-found-error-message` block promotes onto
live spine `9qVyfUxmRQqrpGRMDLRuz`.
