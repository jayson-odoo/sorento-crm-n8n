# Flow: `sorento-consume-main` (the chatbot spine)

Grounded against the LIVE spine `9qVyfUxmRQqrpGRMDLRuz` (`get_workflow_details`,
versionId `131cf660-be93-474b-b33a-4e1a5363ea51`, 79 nodes, active) on 2026-06-29.
Branch logic is shared with the fail-closed TEST clone `txiPzSxy3Pclsz6v` (which adds
harness/guard nodes + orphaned egress; business branches are identical by node-name).

> One arm of `not-found-error-message` — **vague-token clarify** — is NEW (change
> `vague-token-clarify-split`). It is currently shipped only on the clone and is pending
> user-gated promotion to this live spine. It is documented here as part of the four-arm
> design; the live spine still has the three-arm version until promotion.

---

## 1. Spine at a glance

```
redis-pop → (audio? transcribe) → construct prompt → Call 'sub-query-reformulator'
  → check-access / get-access-types → If5 (access granted?)
     ├ FALSE → access-denied sendmsg
     └ TRUE  → If2 (escalation gate)
```

The reformulator (`sub-query-reformulator`, test copy `SB8wEXKdpITfhYXA`; live sub
`XTODTw-dJcV0uRdC056hG`) emits the structured `output` object every branch reads as
`$('Call 'sub-query-reformulator'').first().json.output` (alias `qf` below).

## 2. The branch ladder (post-access, in evaluation order)

Each gate is an `If` node; the first one whose condition is TRUE wins and the rest are
not reached. FALSE falls through to the next gate.

| order | node | combinator | TRUE condition (verbatim leftValue → op) | TRUE target |
|------|------|-----------|------------------------------------------|-------------|
| 1 | **If2** (escalation) | OR | `qf.escalation.is_escalation_confirmation` == true · OR · `qf.message_type=="request_for_help" && qf.domain_hint!="portal_link"` == true | `Call 'sub-human-intervention'`, `tag-out-of-scope` |
| 2 | **If10** (correction) | AND | `qf.correction` == true | `tag-escalate-offer` |
| 3 | **If9** (clarify-menu) | OR | `qf.message_type` ∈ {`casual`,`unknown`,`confirmation`} · OR · `qf.message_type=="business_query" && qf.domain_hint==null` | `resolve-entity-clarification` |
| 4 | **If1** (clarification) | AND | `qf.message_type=="clarification"` | `tag-clarify-menu` |
| 5 | **not-supported-domain** | — | domain is goods_receive / spo (unsupported) | `tag-not-supported` |
| 6 | **If** (access-type present) | — | has access types | `get-access-types` … → If4 → `resolve-entity` |

FALSE chain: `If2 → If10 → If9 → If1 → not-supported-domain → If → … → resolve-entity`.

After `resolve-entity` → `disallowed-entity-gate` (TRUE) → **If3**.

### If3 — unresolved-or-gate-fail → not-found
- combinator **OR**:
  - `resolve-entity.unresolved_tokens.length` `>` `0`, OR
  - `disallowed-entity-gate.gate_passed` is `false`.
- **TRUE → `not-found-error-message`** → `tag-not-found` → `escalate-catalog`.
- **FALSE → `Execute 'sub-get-rag'`** → `tool-filter` → `Loop Over Items` →
  `Call 'sub-get-results'` (MCP read) → … → `Aggregate1`.

`Aggregate1` (the 0-result re-entry) also routes **TRUE → `not-found-error-message`**:
a query that resolved + ran but returned no rows re-enters the not-found node. On this
re-entry `resolve-entity.unresolved_tokens` is empty, so the vague-clarify arm cannot
fire (see §3) — a data miss never masquerades as a vague-token clarify.

## 3. `not-found-error-message` (Code) — four arms

Reads `q = qf`, `r = resolve-entity`, `gate = disallowed-entity-gate`. Computes
`allowedTypes = gate.gate_debug.allowed_lookup` and renders it with `humanList()`
(`['a','b','c'] → "a, b, or c"`). `unresolved = r.unresolved_tokens`. Outputs
`escalate_message` + `is_clarification`.

| arm | guard | message intent | `is_clarification` |
|-----|-------|----------------|--------------------|
| **missingAttachmentType** | `domain=product_attachment && !gate_passed && no attachment_type` | "provide the attachment type for product X — photo/drawing/cert" | **true** |
| **needsScope** | `!gate_passed && !missingAttachmentType && !hasUnresolved && /requires a scoping entity/` | "a {domain} enquiry can't be a general search — specify a {allowedTypes}" | **true** |
| **vague-token clarify** *(NEW — change `vague-token-clarify-split`)* | inside the final `else`, ABOVE the require_specific ladder: any UNRESOLVED token maps by normalized `raw` to a reformulator entity with `confident === false` | echoes the captured raw, says it "couldn't tell which part is which", asks for a labeled specific drawn from `ALLOWED[domain]`; contains NO "escalate to … team" | **true** |
| **escalate ladder** (final `else`, when no vague token) | otherwise | `require_specific` → `gate.gate_clarification`; else `product_attachment` → Fix-B natural phrasing; else "Could not find … Would you like me to escalate to {team} team?" | **false** |

`ALLOWED` (in `disallowed-entity-gate`, surfaced as `gate_debug.allowed_lookup`):
`master_products:[product,category,brand]` · `product_attachment:[product,attachment,attachment_type,category,brand]`
· `promotion:[product,promotion,category,brand]` · `inventory:[product,category,brand]`
· `order:[order,customer_order,transporter,customer,product]` · `incoming:[product,inbound_shipment,category,brand]`
· `forms:[form]` · `portal_link:[]`.

**Why vagueness is semantic, not string-shape:** `water closet` / `skind enterprise sdn bhd`
are multi-word but ONE clean referent (`confident:true` → escalate ladder, unchanged);
`one siew srtkt72ss` is a qty+name+code mash (`confident:false` → vague-clarify). Only the
parser can tell them apart, so the signal rides on the per-entity `confident` flag
(see `sub-query-reformulator.md`). Default-true: the filter uses `=== false`, so any
token whose entity is `confident:true` or has no `confident` key falls through to the
existing escalate behavior unchanged.

## 4. `escalate-catalog` (Code) — branch_kind → message + flags

Upstream each branch sets exactly one `branch_kind` via a `tag-*` Set node; this node
maps it to `response` / `manualResponse` / `includeResponse` / `is_escalate_offer`.

| `tag-*` node | `branch_kind` | response | flags |
|--------------|---------------|----------|-------|
| `tag-not-found` | `not_found` | `not-found-error-message.escalate_message` | `manualResponse = !nf.require_specific`; **`is_escalate_offer = !nf.is_clarification`** |
| `tag-access-choice` | `access_choice` | `access-level-choice-message.escalate_message` | `manualResponse=true` |
| `tag-demand-qty` | `demand_qty` | "Please specify your demand quantity" | `manualResponse=true` |
| `tag-not-supported` | `not_supported` | canned GR/SPO unsupported reply | `manualResponse=true` |
| `tag-clarify-menu` | `clarify_menu` | the topic-menu ("Are you asking about any of these?") | `manualResponse=true` |
| `tag-escalate-offer` | `escalate_offer` | "…does not meet your requirements. Would you like me to escalate to {team} team?" | `manualResponse=true`, `is_escalate_offer=true` |
| `tag-out-of-scope` | `out_of_scope` | internal out-of-scope note | `manualResponse=true`, `includeResponse=false` |

**Decisive coupling for the vague-clarify change:** `is_escalate_offer = !nf.is_clarification`.
Setting `not-found-error-message.is_clarification = true` is, by itself, the whole
mechanism that flips the escalate-offer OFF — no edit to `escalate-catalog`, `If3`,
`tag-not-found`, or any downstream node. `require_specific` stays falsy on the clarify
path → `manualResponse = true` → renders as a question, not the escalate template.

After `escalate-catalog` → `cs-offer-gate` (TRUE → `get-cs-members`; FALSE →
`compile-current-state`) → send (guarded on the clone).
