# Node-diff — `parser-domain-continuity-carry` (domain continuity: LLM prompt → downstream code)

Change-id: `parser-domain-continuity-carry` · scope: **parser** · coder deliverable for the reviewer.
Plan: `../../plans/parser-domain-continuity-carry.md` · UAC: `../UAC.md` §V0 / §23.
Date: 2026-07-15. Built by: sorento-coder.

## Targets touched
| role | id | edited? | version |
|---|---|---|---|
| **NEW fork** of live parser sub (clone calls THIS) | `wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`) | **YES** — 2 nodes (`AI Agent`, `output_exchange`) | published, draft==active `453a52fb-beb7-4c84-8749-b4211dd1b9c0` |
| LIVE reformulator (`sub-semantic-parser`) | `XTODTw-dJcV0uRdC056hG` | **NO** — verified versionId==activeVersionId still `53ea677a-e078-482e-bea2-17efe5859189` (untouched) | promotion target only (user-gated later) |
| LIVE spine | `9qVyfUxmRQqrpGRMDLRuz` | **NO** — untouched | — |
| TEST clone (driver) | `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) | **YES** — repointed `Call 'sub-query-reformulator'` → fork; published | draft==active `45699b20-9bc0-480f-8c2f-e8a7649f89f0` |

## Fork creation + rebase verification

- **Method deviation (mechanism only, not design):** the plan cited the established fork = reuse of
  `CpxE8LroLzCkrAQN`. That old fork is **stale** vs current live — live has advanced to `53ea677a`
  (many parser changes since cert-brand/member-pick). Rather than rebase a stale copy node-by-node, I
  created a **fresh, byte-exact lossless fork of CURRENT live** via the n8n public REST API
  (`POST /workflows` with live's exact node+connection JSON incl. credentials — the raw-JSON import
  MCP lacks, LESSON 3). Design is unchanged from the plan: fork current live + apply Edits 1+2, repoint
  the clone.
- **Lossless-fork proof (pre-edit):** all 8 nodes' `.parameters` and all `connections` **byte-identical**
  to live (jq -S diff = empty). Per-node target shas (jq -j, no trailing newline) matched live:
  `AI Agent.text` `169a59174bd45bad`, `AI Agent.systemMessage` `c47d6754906a07cc`,
  `output_exchange.jsCode` `bb8ee0737c8cd40d`. Credentials preserved exactly (OpenAI `o130We0PEJ77Z1lH`,
  Postgres memory `ETJL5KoaA1UpkDip`) — same as live, no wrong-bind.
- **Post-edit fork shas (stored == my intended edited files, byte-exact):**
  `AI Agent.text` `ab753361ab6920e8`, `AI Agent.systemMessage` `721ba52b0cfc5a3b`,
  `output_exchange.jsCode` `2f6be56f2421b3fd`. The **6 untouched nodes remain byte-identical to live**;
  connections identical to live.
- `availableInMCP:true` set on the fork (via REST PUT) so MCP can read/publish it.

## Changed nodes (2) — five hunks, all pure additions/replacements

### 1. `AI Agent` (parser sub) — Edit 1a + 1b (`.parameters.text`)

**Before (live, 3 lines):**
```
=Previous response: {{ $('When Executed by Another Workflow').first().json.previous_conversation_state.response }}
User answered: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
Previous domain: {{ JSON.stringify($('When Executed by Another Workflow').first().json.previous_conversation_state.domain_hint) }}
```
**After (2 lines):**
```
=Previous response: {{ String($('When Executed by Another Workflow').first().json.previous_conversation_state?.response ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn') }}
User answered: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
```
- **1a intent:** DELETE the `Previous domain:` line — remove the explicit anchor so the LLM classifies
  domain from THIS TURN ONLY (domain continuity moves to downstream code).
- **1b intent:** SANITIZE the `Previous response:` line — strip the `Previous turn (<domain>):`
  parenthetical (the domain-word leak from spine `compile-current-state`) with a targeted regex; keep the
  line (load-bearing for reference-answer turns "yes"/"1"/"the second one"). Regex only matches the
  summary form; escalation-offer / `central-exchange` responses pass through unchanged (proven V0-e).

### 1c. `AI Agent` (parser sub) — `.parameters.options.systemMessage` (two additive insertions)

Diff vs live is EXACTLY +9 lines (verified `diff`):
- **OUTPUT block:** inserted `  "domain_signal": "explicit|inferred|none",` immediately after the
  `"domain_hint"` key.
- **End of the `== DECISIVE DOMAIN TERMS ==` section** (placed so "see the section above" resolves to the
  decisive-terms listing, before `== REQUESTED ATTRIBUTES ==`): an 8-line definition of `domain_signal`
  (explicit = decisive term present this turn; inferred = guessed from a bare entity; none = no basis →
  domain_hint null). "Set on EVERY turn; describes THIS message only — never consider the previous domain."
- No other systemMessage bytes changed.

### 2. `output_exchange` (parser sub) — `.parameters.jsCode` (Edit 2a + 2b)

**2a — reuse-path domain-carry (entity-less continuations, e.g. "and the price?").**
Replaced the dead commented-out block in `case 'reuse'` (which unconditionally overwrote `message_type`
+ domain + intent) with a **signal-gated** carry:
```js
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none');
  if (_sig !== 'explicit') {
    output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint || output.output.domain_hint || null;
    output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
    output.output.domain_reused_entityless = true;   // diagnostic
  }
}
```
- Carries prior domain UNLESS a decisive current term was present (`domain_signal==='explicit'`).
- Does **NOT** overwrite `message_type` (the old dead code did — unsafe; removed).

**2b — signal + compatibility gated carry for entity-BEARING continuations (bare "Y" code).**
Inserted a new block **BEFORE the blocklist-apply** (immediately after the
`DOMAIN_BROADEN_BLOCKED_HINTS` declaration, so `DOMAIN_BLOCKED_HINTS` — declared just above — is in scope;
**single source, map NOT duplicated**, satisfying the plan's declaration-order note without a physical
hoist):
```js
if (output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none');
  if (_sig !== 'explicit') {
    const prevDom = parent_input.previous_conversation_state?.domain_hint || null;
    const curEnts = (Array.isArray(output.output.entities) ? output.output.entities : [])
                      .filter(e => e && e.current_message === true);
    if (prevDom && curEnts.length > 0) {
      const blockedForPrev = new Set(DOMAIN_BLOCKED_HINTS[prevDom] || []);
      const compatible = curEnts.every(e => !blockedForPrev.has(String(e.hint || '').toLowerCase()));
      if (compatible) {
        output.output.domain_hint  = prevDom;                 // OVERRIDE inferred guess
        output.output.intent_hint  = parent_input.previous_conversation_state?.intent_hint || output.output.intent_hint || null;
        output.output.domain_inherited_compatible = true;
      } else {
        output.output.domain_inherit_blocked = prevDom;       // topic switch, kept current
      }
    }
  }
}
```
- **Crux (coordinator fix):** keys on `domain_signal`, NOT on `domain_hint===null`. On a compatible
  `inferred`/`none` turn it **OVERRIDES** the LLM's guessed non-null domain with the prev domain — closing
  the hole where "incoming for A" → bare "B" would flip to `master_products`.
- `every()` semantics: inherit only if ALL current entities are compatible with prev domain (one blocked
  entity, e.g. `customer` under prev `incoming` = charmant case → topic switch → no inherit).
- Runs before blocklist-apply so the corrected domain drives the filter.
- Diff vs live = +10 lines (2a) and +29 lines (2b, incl. comments). `node --check` on the full jsCode: **OK**.

## Clone repoint

- `Call 'sub-query-reformulator'.parameters.workflowId` → `wI5RkNGW3EOJfBdo` (was live `XTODTw`).
- `workflowInputs.value.is_test = true` **preserved** (safety: the sub still receives `is_test===true`).
- Clone settings preserved (`callerPolicy`, `binaryMode`, `availableInMCP`). Zero `XTODTw` refs remain.
- **Coder note (self-caught bug):** the first attempt used MCP `setNodeParameter` path
  `/parameters/workflowId`; that pointer is relative to `node.parameters`, so it wrote a stray
  `parameters.parameters.workflowId` while the real `workflowId` stayed on XTODTw. Caught on post-publish
  verification (active still showed XTODTw). Fixed via MCP `updateNodeParameters replace:true` with the
  complete corrected parameters object; re-published; re-verified fork id present exactly once, stray
  removed, settings intact.

## Offline unit results (V-P0 / §V0, 0-token, standalone harness of the forked `output_exchange`)

`node vp0_harness.js` → **21 passed, 0 failed.** (Harness wraps the exact stored jsCode; feeds synthetic
`$json.output` + `previous_conversation_state`.)
- **V0-a** reuse-path carry (2a): `domain_signal:'none'`+`domain_hint:null`+prev `master_products` →
  `domain_hint==='master_products'`, `domain_reused_entityless===true`, `message_type` NOT overwritten,
  prior product entity survives. ✅
- **V0-b ★** inferred-non-null OVERRIDE (2b, the closed hole): `domain_signal:'inferred'`+
  `domain_hint:'master_products'`+current `{product}`+prev `incoming` → OVERRIDES to `incoming`,
  `domain_inherited_compatible===true`, product survives. (A null-only gate would FAIL this.) ✅
- **V0-c** incompatible = NO carry (charmant guard): `domain_signal:'inferred'`+current `{customer}`+prev
  `incoming` → stays `order`, `domain_inherit_blocked==='incoming'`, customer entity STILL present. ✅
- **V0-d** explicit wins: `domain_signal:'explicit'` → stays `master_products`, all `domain_inherited_*`/
  `domain_reused_*` diagnostics ABSENT. ✅
- **V0-e** prompt-sanitize regex: strips `(incoming)`/`(master_products)`, leaves escalation-offer /
  central-exchange strings unchanged, null/empty safe. ✅

## Validation

- `validate_workflow` on this MCP server validates **SDK source code** (for create), NOT an existing
  workflow by id — so it is not applicable to an already-stored fork. Validation performed instead:
  1. **JS syntax:** `node --check` on the full edited `output_exchange.jsCode` → OK.
  2. **Structural integrity:** fork is a byte-exact copy of the active, valid live workflow with only 3
     string params changed; REST create/PUT accepted (HTTP 200); MCP read succeeds; 6 untouched nodes +
     all connections byte-identical to live; publish succeeded (draft==active).
  3. **Behavioral:** V-P0 offline harness 21/21.
  4. Clone `update_workflow` returned `autoAssignedCredentials:[]` (no wrong-cred bind); all validation
     warnings are the documented pre-existing set (LESSON 13: hardcoded x-api-key, DISCONNECTED_NODE on
     the deliberately-orphaned egress nodes, Transcribe prefix, OpenAI builtInTools) — **no new warnings**.

## Zero-egress / safety

- The parser sub is **classification-only** — fork node types: executeWorkflowTrigger, lmChatOpenAi,
  code×3, agent, memoryPostgresChat, if. **No** httpRequest / respond-io / send / assign node
  (grep for httpRequest|respondio|emailSend = []). Structural zero egress, independent of this change.
- Clone's fail-closed structure intact: the 5+ egress nodes remain orphaned (DISCONNECTED_NODE warnings
  unchanged); `is_test=true` still passed to the reformulator sub.
- LIVE `XTODTw` and the LIVE spine untouched (versionIds unchanged). No promotion performed.

## Not done (tester's scope, per plan §C4/§C5)
- E2E chains (§23-A/B/C/D, V-P0b `domain_signal` LLM validation, V-P2 charmant repro) require the REAL
  forked reformulator + persisted session — run via the **`chat-stateful`** lane (zz-chat → dispatcher →
  clone → fork) or **`regress-capture`**. **Do NOT** use pinned `regress-replay` — it is blind to this
  prompt+`output_exchange` change (plan §C4).

## Files
- Edited param sources: `scratchpad/new_ai_agent_text.txt`, `new_ai_agent_systemMessage.txt`,
  `new_output_exchange.js`; harness `scratchpad/vp0_harness.js`.

---

## REVISION 2 — `domain_signal` made BINARY + entity-free (prompt fix); output_exchange dead-`inferred` cleanup

Date: 2026-07-15. Built by: sorento-coder. Scope: **parser** (same fork `wI5RkNGW3EOJfBdo`).
Live `XTODTw` (versionId `53ea677a`) + live spine (`bcdb5633`) untouched — reconfirmed by REST fetch.

### Root cause (coordinator-verified, fork exec 8681042)
"Srtwb9047 got stock" → LLM emitted `domain_hint=inventory`, `intent=check_stock`, but
`domain_signal="inferred"` → the entity-bearing carry (rev-1 §2b) fired because the guard keyed on
"not explicit", and inferred≠explicit → it OVERRODE inventory with prev `incoming` (WRONG). The
`output_exchange` code was already functionally correct (binary non-explicit test). **Root cause was the
PROMPT**: `domain_signal`'s "inferred" definition was tied to entity presence ("you guessed a domain from a
bare entity"), teaching the LLM "entity present ⇒ inferred" even when a decisive term ("got stock") was
present. Fix = redefine `domain_signal` as pure domain-CLARITY, entity-free, and collapse to a binary enum.

### Version transition
| | before rev-2 | after rev-2 |
|---|---|---|
| fork `wI5RkNGW3EOJfBdo` versionId (draft==active) | `453a52fb-beb7-4c84-8749-b4211dd1b9c0` | **`639cf44f-e810-4e8b-afcc-071bba5dbb4a`** |

Applied byte-exact via n8n REST `PUT /workflows/{id}` (2 leaves swapped from disk — no hand-transcription,
LESSON 25), then MCP `publish_workflow` → `activeVersionId=639cf44f`. Post-publish sha-verify of both
leaves matched the intended edited files exactly; the other 6 nodes + all connections + all credentials
byte-identical to pre-edit (per-node `.parameters` sha diff = only `AI Agent` + `output_exchange` changed;
`AI Agent.text` sha `ab753361ab6920e8` unchanged).

### Changed node 1 — `AI Agent.parameters.options.systemMessage`
- **Edit 1a (definition block).** Replaced the 7-line `domain_signal` definition (explicit / inferred /
  none, where "inferred = guessed from a bare entity") with a 13-line definition framed as domain
  **CLARITY, NOT entity presence**: `explicit` = a decisive purpose word/phrase present ("got stock"→
  inventory, "eta"→incoming, "delivery for <cust>"→order, "list price"/"dimension"→master_products,
  "cert"→product_attachment, "GRN"→goods_receive, "selling price"/"promo"→promotion) — **"explicit EVEN
  IF a product code is also present — the code does NOT make it unclear"**; `none` = no clear domain
  indication (bare code/entity or vague mash). "inferred" state removed entirely.
- **Edit 1b (OUTPUT enum).** `"domain_signal": "explicit|inferred|none",` → `"domain_signal":
  "explicit|none",`.
- New systemMessage sha256 `97baa9ee…422e148` (29,586 bytes). Zero `inferred` occurrences remain.

### Changed node 2 — `output_exchange.parameters.jsCode` (cleanup, behavior identical)
At BOTH carry sites (reuse-path ~L214, entity-bearing ~L410) replaced
`const _sig = output.output.domain_signal || (output.output.domain_hint ? 'inferred' : 'none'); if (_sig !== 'explicit') {`
with `const _explicit = output.output.domain_signal === 'explicit'; if (!_explicit) {`. Comments mentioning
"inferred" reworded to "not-explicit"/"guessed domain". **Functionally identical**: any non-explicit
(`none`, undefined, or the now-removed `inferred`) → carry-eligible; only `'explicit'` skips. The
compatibility gate and all other logic unchanged. `node --check` on the full jsCode: **OK**. New jsCode
sha256 `784cfc31…d787c08b` (38,214 bytes). Zero `inferred` occurrences remain.

### Offline V-P0 harness (rev-2) — wraps the EXACT stored post-edit jsCode
`node scratchpad/vp0_harness.mjs` → **17 passed, 0 failed.**
- **C1 ★ got-stock regression:** `domain_signal='explicit'` + `domain_hint='inventory'` + current product
  `Srtwb9047` + prev `incoming` → **domain stays `inventory` (NO carry)**, no inherit/reuse diagnostics,
  product entity survives. (This is the bug fork exec 8681042 hit; now correct at the code level given an
  `explicit` signal — the prompt fix is what makes the LLM emit `explicit` here.)
- **C2** `none` + bare product + prev `incoming` → inherits `incoming`, `domain_inherited_compatible=true`,
  product survives.
- **C3** explicit `list price` + prev `incoming` → stays `master_products`, no inherit.
- **C4 charmant** `none` + current `customer` + prev `incoming` → incompatible → stays `order`,
  `domain_inherit_blocked='incoming'`, customer retained.
- **C5** entity-less reuse ("and the price?") + prev `master_products` → carries `master_products`,
  `domain_reused_entityless=true`, `message_type` not overwritten.
- **C6** explicit `eta` + product + prev `order` → stays `incoming`, no diagnostics (explicit-immune gate).

**Note on offline scope:** the harness proves the CODE gate given a `domain_signal` value. The prompt-side
fix (LLM now emitting `explicit` for "got stock" instead of `inferred`) is NOT exercised offline — it needs
the REAL forked reformulator. That's tester scope: run the got-stock case via the `chat-stateful` lane or
`regress-capture` (NOT pinned `regress-replay` — blind to prompt+output_exchange change) and assert the LLM
emits `domain_signal='explicit'` and the final domain is `inventory`.

### Verification summary (rev-2)
- Fork draft==active `639cf44f`; both changed-param shas match intended files byte-exact; 6 untouched nodes
  + connections + credentials byte-identical to pre-edit.
- `node --check` on edited `output_exchange` jsCode: OK. Offline harness 17/17.
- Clone `txiPzSxy3Pclsz6v` `Call 'sub-query-reformulator'` still → fork `wI5RkNGW3EOJfBdo`, `is_test=true`
  preserved, zero `XTODTw` refs. Clone NOT modified this revision (draft==active `45699b20`).
- Live `XTODTw` `53ea677a` and live spine `bcdb5633` untouched. No promotion performed.

### Files (rev-2)
- Edited param sources (byte-exact, on disk): `scratchpad/systemMessage.orig.txt`,
  `scratchpad/output_exchange.orig.js`; apply script `scratchpad/apply_edit.mjs`; harness
  `scratchpad/vp0_harness.mjs`.

---

## REVISION 3 — deterministic effective-signal backstop (FLAG-2 hardening) + neutral Human framing

Date: 2026-07-15. Built by: sorento-coder. Scope: **parser** (same fork `wI5RkNGW3EOJfBdo`).
Live `XTODTw` (versionId `53ea677a`, updatedAt 2026-07-14) + live spine untouched — reconfirmed by REST fetch.
Addresses FLAG 2 (signal robustness) from the run + review, and the root-cause framing that primes the flake.

### Root cause (grounded, exec 8716394)
"list price of srtwc286-sh" on an EMPTY prev-state turn → LLM emitted `domain_hint=master_products` +
`intent_hint=check_product` + `requested_attributes=[price]` CORRECTLY, but `domain_signal=none` (plus
mis-tagged `current_message:false` + `entity_op:reuse`). The "User answered:" framing + continuation-first
system prompt push the model into continuation-mode even with no prior → it reports domain as *inherited*
(none) rather than *stated-now* (explicit). Because the carry keys on `!explicit`, a decisive term flaked to
`none` beside a COMPATIBLE prior domain would wrongly inherit the prev domain — the same wrong-domain class
the change fixes, via the other door.

### Version transition
| | before rev-3 | after rev-3 |
|---|---|---|
| fork `wI5RkNGW3EOJfBdo` versionId (draft==active) | `732fdeeb-bced-432c-becb-64db0463a888` | **`4267927c-77bb-4586-9c82-ce2a95902cfc`** |

Applied byte-exact via n8n REST `PUT /workflows/{id}` (2 leaves swapped from disk — no hand-transcription,
LESSON 25; urllib PUT is CF-1010-blocked, curl works), then MCP `publish_workflow` → `activeVersionId=4267927c`,
draft==active. Post-publish: both edited leaves live==disk byte-exact (`output_exchange.jsCode` sha
`d5095cbb073a790e`, `AI Agent.text` sha `73bfdc8a3e894f53`); `AI Agent.systemMessage` UNCHANGED (rev-2 binary
`domain_signal` preserved); the other 6 nodes + all connections + all credentials byte-identical to pre-edit.

### Fix 1 — DETERMINISTIC effective-signal backstop (`output_exchange`, single source for both carry sites)
The raw `const _explicit = output.output.domain_signal === 'explicit'` at BOTH carry sites (reuse-path ~L264
and entity-bearing ~L460) now reads a **single shared const `_explicitEff`**, derived once (new top-level
block inserted immediately after `tryDymPick`'s `})();`, before the ENTITY OPERATION EXECUTOR, so it is in
scope at both the nested reuse-case site and the top-level entity-bearing site, and uses post-dym/menu/flyer
state). Verbatim helper:

```js
const _DECISIVE_INTENTS = new Set([
  'check_product', 'check_incoming', 'check_promotion', 'check_order', 'check_stock',
  'check_goods_receive', 'check_spo', 'check_product_attachment',
  'get_forms', 'get_portal_link', 'get_resource_attachment',
]);
const _effectiveDomainSignal = (() => {
  // Rule 1 — BARE MESSAGE → force NONE (carry-eligible). Strip every resolved entity raw from the
  // current user message (case/spacing robust); if no meaningful word remains, the message is ONLY a
  // bare code/entity token. Do NOT trust entity.current_message here — the LLM mis-tags it (root cause).
  const _rawMsg = String(parent_input.latest_user_message ?? parent_input.user_message ?? '')
                    .split(/\s*reply to:/i)[0];                    // drop the "reply to:" tail
  const _ents = Array.isArray(output.output.entities) ? output.output.entities : [];
  let _rem = ' ' + _rawMsg.toLowerCase() + ' ';
  for (const _e of _ents) {
    const _r = String((_e && _e.raw) || '').trim().toLowerCase();
    if (!_r) continue;
    const _pat = _r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    _rem = _rem.replace(new RegExp(_pat, 'gi'), ' ');
  }
  _rem = _rem
    .replace(/\b\d+\s*(pcs?|units?|nos?|pieces?|x)?\b/gi, ' ')   // quantities
    .replace(/[^a-z0-9]+/gi, ' ')                                    // punctuation -> space
    .trim();
  if (_rem === '') return { sig: 'none', src: 'bare_forced_none' };

  // Rule 2 — DECISIVE TERM → force EXPLICIT. A non-null decisive intent_hint + a non-null domain_hint
  // is a real this-turn classification from a purpose word (e.g. "list price" → check_product).
  if (_DECISIVE_INTENTS.has(output.output.intent_hint) && output.output.domain_hint) {
    return { sig: 'explicit', src: 'intent_forced_explicit' };
  }

  // Rule 3 — else trust the LLM's own signal.
  return { sig: (output.output.domain_signal === 'explicit' ? 'explicit' : 'none'), src: 'llm' };
})();
output.output.domain_signal_effective = _effectiveDomainSignal.sig;   // diagnostic
output.output.domain_signal_source    = _effectiveDomainSignal.src;   // diagnostic (llm|bare_forced_none|intent_forced_explicit)
const _explicitEff = _effectiveDomainSignal.sig === 'explicit';
```

Priority order = Rule 1 (bare) → Rule 2 (decisive) → Rule 3 (LLM). `_explicit = _explicitEff`; the carry
fires on `!_explicit` exactly as before (carry BODIES + compatibility gate unchanged). Two carry-site
comments were reworded to reference the effective signal; nothing else in the carry logic changed. New
diagnostics `domain_signal_effective` + `domain_signal_source` added for visibility (register in replay
`norm()` per LESSON 40 — see reviewer checklist step 9).

**Why this closes FLAG 2 both ways:**
- Decisive term flaked to `none` (the reviewed worst case, product-decisive after a product-adjacent prior)
  → Rule 2 forces EXPLICIT → NO wrong carry (fix (a)). Correctness no longer depends on LLM signal flake.
- Bare code mis-flaked to a decisive intent+domain → Rule 1 (higher priority) forces NONE → bare-code
  continuity preserved (fix (b)); the coordinator hole stays closed even if the LLM flakes bare→explicit.

### Fix 2 — root-cause framing (`AI Agent.text`, Human prompt label)
Line 2 label `User answered:` → `Current user message:` (neutral — stops priming continuation-mode). The
(sanitized) `Previous response:` line above it is UNCHANGED; the system prompt is UNTOUCHED (its
"READING THE CURRENT MESSAGE IN CONTEXT" section still handles continuity). New `.text` (2 lines):
```
=Previous response: {{ String($('When Executed by Another Workflow').first().json.previous_conversation_state?.response ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn') }}
Current user message: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
```
⚠️ The former label was load-bearing for reference-answer turns (yes/no, "1"/"second one", member picks,
did-you-mean picks, escalation yes/no). **Flagged for the tester** to regress those paths (Fix 2 touches the
Human framing).

### Offline units (rev-3) — wrap the EXACT stored post-edit `output_exchange.new.js`
`node scratchpad/rev3_harness.mjs` → **30 passed, 0 failed.**
- **(a) ★ THE FIX:** "list price of srtwc286-sh" flake (`intent=check_product`+`domain=master_products`+
  `domain_signal=none`) + prev incoming (compatible) → `domain_signal_effective='explicit'` (source
  `intent_forced_explicit`) → NO carry → stays `master_products`; product retained; `domain_inherited_*` absent.
- **(b) ★ bare code still carries:** bare `SRTWC286-SH` (message == entity raw) + mirror-flake (LLM
  `domain=master_products`/`intent=check_product`, even `domain_signal='explicit'`) + prev incoming → Rule 1
  forces NONE (source `bare_forced_none`, beating Rule 2/3) → carries → `incoming`; product retained.
- **(c)** bare code + LLM `domain=null`/`intent=null` + prev incoming → NONE → carries `incoming` (unchanged).
- **(d)** genuine continuation "and the price?" (entity-less, `entity_op=reuse`, LLM `intent=null`/`ds=none`)
  → reuse-path carry still fires (source `llm`) → `master_products`; `message_type` not overwritten.
- **(e)** decisive term, empty prior → EXPLICIT, no spurious carry (no `domain_inherited_*`/`domain_reused_*`/
  `domain_inherit_blocked`).
- **(f)** rev-2 got-stock regression still holds (explicit `inventory`, prev incoming → stays inventory).
- **(g)** charmant guard: incompatible `customer` entity + prev incoming → `domain_inherit_blocked='incoming'`,
  stays `order`, customer retained.

**Offline scope caveat:** the harness proves the CODE gate given inputs. The prompt-side effect of Fix 2 (LLM
emitting a less continuation-biased classification / more reliable `domain_signal` under the neutral label) is
NOT exercised offline — that is tester scope via the `chat-stateful` real-reformulator lane (NOT pinned
`regress-replay`, blind to prompt+`output_exchange` changes).

### Verification summary (rev-3)
- Fork draft==active `4267927c`; both changed-param shas match intended files byte-exact; systemMessage +
  6 untouched nodes + connections + credentials byte-identical to pre-edit.
- `node --check` on edited `output_exchange.new.js`: OK. Offline harness 30/30.
- **decline-flag (`escalation_declined`, ×2) + dym hunks (`tryDymPick`/`dym_candidates`/`dym_pick_applied`,
  member_pick tiers) co-resident and CONTENT-IDENTICAL to pre-edit** (only line numbers shifted +44 by the
  inserted block; content diff = empty). rev-3 is purely additive + 2 RHS swaps + 2 comment reword.
- Clone `txiPzSxy3Pclsz6v` `Call 'sub-query-reformulator'` still → fork `wI5RkNGW3EOJfBdo`, `is_test=true`
  preserved. Clone NOT modified this revision.
- Live `XTODTw` `53ea677a` and live spine untouched. Zero-egress unchanged (classification-only sub; no
  httpRequest/respond-io/send/assign node). No promotion performed.

### Flag for the tester (rev-3)
Re-run the **18-chain** (`domain-continuity-18chain`) AND the **reference-answer paths** (yes/no, positional
"1"/"second one", member-pick by name, did-you-mean pick, escalation yes/no) — Fix 2 changed the Human prompt
label those turns depend on. Assert: (a) "list price after eta X" now lands `master_products` reliably (was
~25% flaky); (b) bare-code-after-eta still carries `incoming`; (c) got-stock still `inventory`; (d) charmant
still `order`; and that reference-answer resolution is unaffected by the relabel. Watch `domain_signal_source`
in `output_exchange` output to see which rule fired per turn.

### Files (rev-3)
- Edited param sources (byte-exact, on disk): `scratchpad/output_exchange.new.js`,
  `scratchpad/ai_agent_text.new.txt`; apply script `scratchpad/apply_rev3.py`; harness
  `scratchpad/rev3_harness.mjs`; PUT body `scratchpad/put_body.json`.

---

## REVISION 4 — de-overfit: intent-only effective signal; DROP the LLM `domain_signal` field + rev3 string-strip

Date: 2026-07-16. Built by: sorento-coder. Scope: **parser** (same fork `wI5RkNGW3EOJfBdo`).
Live `XTODTw` (versionId `53ea677a`, updatedAt 2026-07-14) + live spine (`bcdb5633`, updatedAt 2026-07-13)
untouched — reconfirmed by REST fetch. Clone NOT modified (still → fork, `is_test=true`, zero `XTODTw` refs).

### Why (design decision)
rev3's Rule 1 (strip every entity raw from the message; if empty → force `none`) is a fragile string
heuristic that **mislabels decisive purpose-WORD entities**: "certificate" is an `attachment_type` entity →
stripped → the message looks bare → wrongly forced `none` (the exact edge the reviewer flagged in the rev3
NOTE adjudication). The reliable signal is `intent_hint`: in the flake (exec 8716394) the LLM got
`intent_hint=check_product` RIGHT while `domain_signal` flaked to `none`; bare codes reliably get
`intent_hint=null`. So **derive the effective signal purely from intent** — drop the string-strip (Rule 1) AND
drop the LLM `domain_signal` field entirely.

### Version transition
| | before rev-4 | after rev-4 |
|---|---|---|
| fork `wI5RkNGW3EOJfBdo` versionId (draft==active) | `4267927c-77bb-4586-9c82-ce2a95902cfc` | **`711b689c-8feb-4951-89ee-3fa6fe7b4d75`** |

Applied byte-exact via n8n REST `PUT /workflows/{id}` (2 leaves swapped from disk — no hand-transcription,
LESSON 25; curl PUT), then MCP `publish_workflow` → `activeVersionId=711b689c`, draft==active. Post-publish:
both edited leaves live==disk byte-exact (`output_exchange.jsCode` sha `216ea6d0ecb861cf`;
`AI Agent.systemMessage` sha `c47d6754906a07cc`); `AI Agent.text` UNCHANGED from rev3 (sha `73bfdc8a3e894f53`,
`Current user message:` relabel + `Previous response:` sanitize both KEPT); the other 6 nodes + all
connections + all credentials byte-identical to pre-edit (per-node param diff = only `output_exchange` +
`AI Agent`).

### Changed node 1 — `output_exchange.parameters.jsCode` (rev3 → rev4, 3 hunks)

**Hunk A — replace the whole rev3 `_effectiveDomainSignal` IIFE + `_explicitEff` block** (the Rule1/Rule2/Rule3
derivation incl. the message-strip loop, the quantity/punct regex, `domain_signal_effective`) with a simple
intent-driven derivation computed ONCE. Verbatim (the shared `_explicit`):
```js
const _DECISIVE_INTENTS = new Set([
  'check_product','check_incoming','check_promotion','check_order','check_stock',
  'check_goods_receive','check_spo','check_product_attachment',
  'get_forms','get_portal_link','get_resource_attachment',
]);
const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;
output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none';  // diagnostic
```
- The `domain_signal_effective` diagnostic is REMOVED; `domain_signal_source` is KEPT (values now
  `intent_explicit|intent_none`, no longer `llm|bare_forced_none|intent_forced_explicit`).

**Hunk B — reuse-path carry site (`case 'reuse'`).** Removed the per-site `const _explicit = _explicitEff;`;
the site now reads the shared top-level `_explicit`. Comment reworded `rev3: _explicitEff.` →
`rev4: shared _explicit.`. Carry body + gate UNCHANGED; carry fires on `!_explicit` exactly as before.

**Hunk C — entity-bearing carry site.** Same: removed `const _explicit = _explicitEff;`, site reads the shared
`_explicit`; header comment reworded to `shared _explicit; rev4 intent-only`. The compatibility `every()` gate
against `DOMAIN_BLOCKED_HINTS` UNCHANGED.

`diff` rev3→rev4 = exactly these 3 hunks (IIFE block swap + 2 comment rewords + 2 deleted local `const`
lines). `node --check` on the full jsCode: **OK** (43,078 bytes, sha `216ea6d0ecb861cf`).

### Changed node 2 — `AI Agent.parameters.options.systemMessage` (drop the LLM `domain_signal` field)
- Removed the `domain_signal` key from the `== OUTPUT ==` block (`"domain_signal": "explicit|none",` line
  deleted; `domain_hint` key retained above it).
- Removed the rev2 binary-CLARITY definition paragraph (11 lines: `domain_signal = how CLEARLY this
  message indicates a domain …` through `never consider the previous domain.`) + its trailing blank.
- No other systemMessage bytes changed. **Net effect: `domain_signal` was purely additive across rev1–rev3,
  so removing it returns the systemMessage byte-identical to the ORIGINAL LIVE** (sha `c47d6754906a07cc` ==
  the live systemMessage sha recorded in this doc's rev1 lossless-fork proof). `grep domain_signal` on the
  final systemMessage = **0**.

### Nothing reads `output.domain_signal` anymore (verified)
- `output_exchange` (rev4): the only `domain_signal` substrings are the assignment
  `output.output.domain_signal_source = …` and one comment ("no LLM domain_signal field") — **no read of the
  LLM `domain_signal` field**.
- `suggest-follow-up`: 0 occurrences.
- Fork's other nodes (bypass/mock/trigger/memory): 0 occurrences.
- Clone `txiPzSxy3Pclsz6v` (downstream consumer of the parser output): **0** `domain_signal` occurrences.
- Only `domain_signal_source` remains on the parser output (a diagnostic).

### Offline units (rev-4) — wrap the EXACT stored post-edit `output_exchange.rev4.js`
`node scratchpad/rev4/rev4_harness.mjs` → **28 passed, 0 failed.**
- **(a) ★ certificate now EXPLICIT:** `intent=check_product_attachment` + `domain=product_attachment`
  (message "certificate for sc07") after a **forms** prev turn → `_explicit=true`
  (`domain_signal_source=intent_explicit`) → NO carry → **stays `product_attachment`, NOT `forms`**; no
  `domain_inherited_*`/`domain_reused_*`. The rev3 attachment-strip edge is GONE — no message stripping.
- **(b) ★ list-price flake:** `intent=check_product` + `domain=master_products` + **no `domain_signal`
  field at all** + prev `incoming` → `_explicit=true` (`intent_explicit`) → NO carry → **`master_products`**;
  product entity retained. (This is the exec-8716394 flake; now deterministic via intent alone.)
- **(c) bare code carries:** `intent=null` + `domain=null` + prev `incoming` → `_explicit=false`
  (`intent_none`) → carry → **`incoming`**, `domain_inherited_compatible=true`, product retained.
- **(d) bare code MIRROR-FLAKE — ACCEPTED RESIDUAL (documented):** bare code but LLM flaked
  `intent=check_product` + `domain=master_products` + prev `incoming` → intent-only ⇒ `_explicit=true` ⇒
  **NO carry ⇒ stays `master_products`**. This is the accepted intent-only residual. **It was never
  observed live** — the LLM emits `intent=null` for bare codes (grounds case (c)); (d) is a synthetic
  worst case. Trade: rev3's string-strip Rule 1 covered (d) but broke (a); rev4 chooses (a)/(b) correctness
  over the unobserved (d).
- **(e) reuse "and the price?":** `intent=check_product`, entity-less, domain `master_products` →
  `_explicit=true` so 2a does not fire, and domain is already `master_products` → **stays `master_products`
  (A4 lands)**; prior product entity survives; `message_type` not overwritten.
- **(f1) got-stock → inventory:** `intent=check_stock`+`domain=inventory`+prev `incoming` → explicit → stays
  `inventory`. **(f2) charmant → order:** decisive `check_order`+`domain=order` → explicit → stays `order`,
  customer retained. **(f2b) charmant compat-gate backstop:** if `intent` flakes `null` on the same customer
  turn, the `every()` compat gate still blocks (`customer` ∈ `DOMAIN_BLOCKED_HINTS.incoming`) →
  `domain_inherit_blocked=incoming`, NOT flipped to incoming, customer retained. **(f3) reuse-vague "and
  that?":** `intent=null`, entity-less → 2a carries prev domain `master_products`, `domain_reused_entityless=true`.

**Offline scope caveat:** the harness proves the CODE gate given inputs. The prompt-side effect of dropping
`domain_signal` (whether removing the field changes how reliably the LLM emits `intent_hint`) is NOT exercised
offline — tester scope via the `chat-stateful` real-reformulator lane (NOT pinned `regress-replay`, blind to
prompt+`output_exchange` changes).

### Co-residence preserved (decline-flag + dym)
`escalation_declined` ×2, `tryDymPick`/`dym_candidates`/`dym_pick_applied` ×2 each — **counts unchanged rev3→rev4**;
the rev3→rev4 `diff` touches none of those lines (only the 3 signal hunks). Content-identical.

### Verification summary (rev-4)
- Fork draft==active `711b689c`; both changed-param shas match intended disk files byte-exact
  (`output_exchange` `216ea6d0ecb861cf`, `systemMessage` `c47d6754906a07cc`); `AI Agent.text` + 6 untouched
  nodes + connections + credentials byte-identical to pre-edit.
- `node --check` on edited `output_exchange.rev4.js`: OK. Offline harness 28/28.
- Clone `txiPzSxy3Pclsz6v` `Call 'sub-query-reformulator'` still → fork `wI5RkNGW3EOJfBdo`, `is_test=true`
  preserved, zero `XTODTw` refs. Clone NOT modified this revision.
- Live `XTODTw` `53ea677a` (2026-07-14) and live spine `bcdb5633` (2026-07-13) untouched. Zero-egress
  unchanged (classification-only sub; no httpRequest/respond-io/send/assign node). No promotion performed.

### Flag for the tester (rev-4)
Re-run via the real-reformulator lane (`chat-stateful` or `regress-capture`, NOT pinned `regress-replay`):
- **flake-both-ways:** "list price of srtwc286-sh" (must land `master_products` reliably now, via
  `domain_signal_source=intent_explicit`) AND a bare code after eta (must carry `incoming`, `intent_none`).
- **★ certificate-after-forms:** the rev4 win — a `certificate`/cert turn after a `forms` turn must stay
  `product_attachment` (was the rev3 residual). Also cert-after-incoming (compat gate) still correct.
- **18-chain** (`domain-continuity-18chain`).
- **got-stock → inventory; charmant → order** (customer retained).
- Reference-answer paths (yes/no, positional "1"/"second one", member-pick by name/number, dym pick,
  escalation yes/no) were already cleared under the rev3 `Current user message:` relabel — UNCHANGED in rev4,
  so no re-clearance needed, but confirm no drift.
- Watch `domain_signal_source` (`intent_explicit|intent_none`) per turn; `domain_signal_effective` is GONE.
- **Replay `norm()` note:** at promote time register `domain_signal_source` as drop-when-absent, and DROP the
  now-removed `domain_signal` / `domain_signal_effective` from any prior norm registration.

### Files (rev-4)
- Edited param sources (byte-exact, on disk): `scratchpad/rev4/output_exchange.rev4.js`,
  `scratchpad/rev4/ai_agent_systemMessage.rev4.txt` (AI Agent.text unchanged =
  `scratchpad/rev4/ai_agent_text.rev3.txt`); harness `scratchpad/rev4/rev4_harness.mjs`; PUT body
  `scratchpad/rev4/put_body.json`.
