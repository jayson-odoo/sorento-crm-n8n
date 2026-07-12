# Flow: `sub-query-reformulator` (the semantic parser)

Grounded against the LIVE published sub `XTODTw-dJcV0uRdC056hG` (name
`sub-semantic-parser`, versionId/activeVersionId `292faed2…`, active) and the TEST copy
`SB8wEXKdpITfhYXA` (`sub-query-reformulator TEST (delta2)`) which the clone
`txiPzSxy3Pclsz6v` actually calls. Read 2026-06-29.

> The per-entity **`confident`** flag is NEW (change `vague-token-clarify-split`) and is
> currently applied ONLY to the test copy `SB8wEXKdpITfhYXA`. The exact additive prompt
> diff to transcribe onto the live `XTODTw` sub is recorded in
> `n8n-workflows-init/tests/diffs/vague-token-clarify-split.md`.

---

## 1. Node graph (7 nodes)

```
When Executed by Another Workflow ─▶ AI Agent ─▶ output_exchange ─▶ (return)
   (OpenAI Chat Model + Postgres Chat Memory feed AI Agent)
   test-reformulator-bypass (IF) ─▶ mock-reformulator-output   ← deterministic test bypass
```

- **AI Agent** (`@n8n/n8n-nodes-langchain.agent`, gpt-5.4-mini family): the LLM that
  *extracts* semantic signals. Its `options.systemMessage` is the contract (§2–§3).
- **output_exchange** (Code): the deterministic post-processor that *reconciles* what the
  LLM emitted — it owns all policy that should not live in the prompt (§4). It NEVER
  rebuilds current-message entity objects, so any extra key the LLM puts on an entity
  (including `confident`) survives verbatim to `output.output.entities`.

The whole result is returned as `{ output: { …schema… } }`; downstream reads
`$('Call 'sub-query-reformulator'').first().json.output`.

## 2. Entity contract

An entity is a concrete identifiable VALUE usable to look up / filter one record. Each:

```
{ "raw": "<exact phrase>",
  "hint": "product|promotion|customer|transporter|inbound_shipment|warehouse|attachment|
           form|order|category|brand|attachment_type|goods_receive|spo",
  "current_message": true if from the current message, false if carried from prior context,
  "confident": true|false }          ← NEW
```

## 3. The `confident` flag (semantics — LOCKED)

Per-entity certainty that `entity.raw` is ONE cleanly-typed referent, NOT a mash of
several concepts forced together.

- **`confident: true`** — a single clean referent: one word, a multi-word phrase that
  names ONE thing (`water closet`, `skind enterprise sdn bhd`), or a part the USER
  explicitly labeled. This is the **DEFAULT** — when unsure, prefer true.
- **`confident: false`** — the parser had to cram MORE THAN ONE concept/type into a
  single `entity.raw` because the user gave NO separation or label, so it cannot be split
  without guessing. e.g. `one siew srtkt72ss` = quantity + customer-ish name + product
  code mashed together → ONE `order` entity, `confident:false`.
- **Labeled input SPLITS** into separate confident entities:
  `customer one siew, product srtkt72ss` →
  `{raw:"one siew",hint:"customer",confident:true}` + `{raw:"srtkt72ss",hint:"product",confident:true}`.

Vagueness is **semantic, not word-count**. The downstream consumer
(`not-found-error-message`, §3 of `sorento-consume-main.md`) treats `confident === false`
on an UNRESOLVED token as the trigger to CLARIFY instead of offering escalation. Because
the test uses `=== false`, synthetic entities (the `flyer` injection, positional-pick
reconstruction, attachment_type re-attach) that carry no `confident` key default to the
"treat as confident" path — correct, since those are confident-by-construction.

## 4. Entity operations & the LLM ↔ output_exchange split

The LLM tags one **`entity_op`** describing this turn vs the previous entities; the
executor in `output_exchange` applies it (axis-aware):

- **`clear`** → broadened to everything, no narrowing value → `entities = []`.
- **`replace_combine`** → named NEW scoping value(s); they replace the prior scope on the
  same axis (axis depends on domain: in `promotion` product/brand/category/flyer all
  share `promo_scope`; in `order` customer/transporter/product/order share `order_scope`;
  etc.). Non-conflicting prior axes are kept.
- **`modify`** → same subject, only an attribute changes (domain/intent shifts; entities
  unchanged).
- **`reuse`** → no new scoping value; re-apply prior entities. (output_exchange promotes a
  self-contradictory `reuse`-with-current-entities to `replace_combine`.)

`output_exchange` also owns, deterministically (NOT the prompt): routing derivation
(`deriveRouting`, domain→team/agent, cert-vs-photo split, promotion brand clamp);
menu-label override (exact button labels → portal link); flyer injection; the
domain-aware entity-type **blocklist** (always-blocked + broaden-blocked hints); reference
position → entity reconstruction; escalation-confirmation detection (prev response offered
escalation + affirmative); the CS member-pick override; and the **date-filter domain gate**
(only `promotion`/`order` honor a parsed date window). None of these touch `confident`.

## 5. OUTPUT schema (top-level keys)

`message_type` (request_for_help|business_query|clarification|casual|unknown) ·
`intent_hint` · `domain_hint` · `scope_intent` · `is_affirmative` · `user_goal` ·
`access_levels[]` · `date_mode` · `date_filter_start/end` · `match_mode` (and|or) ·
`demand_qty` · **`entities[]`** (each per §2, now carrying `confident`) · `entity_op` ·
`scope_exclusive` · `requested_attributes[]` · `contains_flyer` · `reference_positions[]` ·
`is_active` · `correction` · `routing{suggested_team,suggested_agent}` ·
`escalation{is_escalation_confirmation}`.

## 6. Deterministic test bypass

`test-reformulator-bypass` (IF) → `mock-reformulator-output`: when the caller injects a
`mock_parser_output` (the clone's `parser-bypass-gate` fires on
`redis-pop-main-message-list…message.mock_parser_output`), the LLM is skipped and
`$('Call 'sub-query-reformulator'').first().json.output` returns the injected object
verbatim — 0 parser tokens. Inject `confident` flags on the mocked entities to exercise
the §3 consumer logic without the real LLM (UAC §13a-det / §13c / §13d / §13e).
