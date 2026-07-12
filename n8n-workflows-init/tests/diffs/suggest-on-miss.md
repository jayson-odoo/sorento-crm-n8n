# Node-diff — suggest-on-miss (D1/D2/D4/D5)

**Change-id:** suggest-on-miss
**Targets (clone only):**
- Spine clone `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v`
- Reformulator fork `sub-query-reformulator TEST rebase` = `CpxE8LroLzCkrAQN`
**Live untouched:** `9qVyfUxmRQqrpGRMDLRuz`, `XTODTw-dJcV0uRdC056hG`, sub `Fss5aAaXthJSWpZCgKiKR`.
**Zero-egress:** unchanged. Send sub call `sorento-sub-respond-sendmsg-respond2` keeps `is_test:true`; the 7 orphaned egress nodes remain disconnected (still flagged DISCONNECTED_NODE in validation = intended).

---

## Architecture recap (verified via get_workflow_details)
Both miss types converge at `not-found-error-message`:
- resolution miss: `If3[0] → not-found-error-message`
- data miss: `validator(has_result=false) → If6[1] → Loop Over Items → Aggregate1 → not-found-error-message`

Downstream: `not-found-error-message → tag-not-found → escalate-catalog → cs-offer-gate → (get-cs-members → build-cs-member-offer) | compile-current-state → sorento-sub-respond-sendmsg-respond2 (+ guard-d-record + session-save-gate)`.

The send sub already threads from `compile-current-state`: `message=user_response`, `quick_reply=quick_reply`, `result_set=variables.last_result_set`. So the whole feature reduces to making `compile-current-state` emit those three for a suggest offer.

---

## Change 1 — NEW node `build-suggest-offer` (spine clone) — D1 + D2

**Type:** `n8n-nodes-base.code` v2, default (all-items) mode. Position `[4880,2624]`.
**Wiring change:**
- REMOVED connection `not-found-error-message[0] → tag-not-found`
- ADDED `not-found-error-message[0] → build-suggest-offer[0]`
- ADDED `build-suggest-offer[0] → tag-not-found[0]`

So it is a pass-through sibling between `not-found-error-message` and `tag-not-found`. It reads the not-found payload plus `resolve-entity`, `disallowed-entity-gate`, `Call 'sub-query-reformulator'`, `Call 'sub-get-results'`, and ADDS `suggest_*` fields. Existing `escalate_message`/`is_clarification` untouched (escalate-catalog still reads `$('not-found-error-message')` by reference). When no candidates → `out.suggest_offer=false` → downstream byte-identical.

**Gating (safety for regression):**
- **D1** fires only when `(unresolved_tokens.length>0 || r.ambiguous===true)` AND `!is_clarification` AND `!gate.require_specific`, AND there is ≥1 non-`exact` candidate. This preserves the vague-token clarify path, the scope/require-specific clarify path, and the happy path.
- **D2** fires only when `Call 'sub-get-results'.isExecuted` AND `alternatives` is a non-empty array. No `alternatives` key ⇒ no suggestion (never invents). ⚠ see Finding F1 — the live get-results sub currently strips `alternatives`, so D2 is DORMANT until that sub is fixed.

**jsCode (build-suggest-offer):**
```js
// ── build-suggest-offer (D1/D2) ──
// Sibling downstream of not-found-error-message. ADDITIVE: passes the not-found
// payload through and, when the miss carries CONCRETE candidates, attaches a
// suggestion offer that compile-current-state renders. No candidates → suggest_offer
// stays false → downstream byte-identical.
const out  = { ...$input.first().json };
const q    = (() => { try { return $('Call \'sub-query-reformulator\'').first().json.output; } catch (e) { return {}; } })();
const r    = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
const gate = (() => { try { return $('disallowed-entity-gate').first().json ?? {}; } catch (e) { return {}; } })();

out.suggest_offer = false;

const team = q?.routing?.suggested_team || 'customer_service';
const YES  = 'Yes, escalate';
const NO   = "No, it's okay";
const cap3 = (a) => (Array.isArray(a) ? a.slice(0, 3) : []);
const humanList = (codes) => codes.length === 1
  ? codes[0]
  : `${codes.slice(0, -1).join(', ')}, or ${codes[codes.length - 1]}`;

const unresolved    = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
const hasUnresolved = unresolved.length > 0;
const isClar        = out.is_clarification === true;   // preserve vague/scope clarify prompts
const requireSpec   = gate?.require_specific === true;  // preserve require-specific prompts

// D1: resolution-miss "did you mean" (resolver matches)
function collectMatches(rr) {
  const acc = [];
  if (Array.isArray(rr?.matches)) acc.push(...rr.matches);
  if (Array.isArray(rr?.resolutions)) rr.resolutions.forEach(res => {
    if (Array.isArray(res?.matches)) acc.push(...res.matches);
  });
  if (Array.isArray(rr?.intersection)) acc.push(...rr.intersection);
  const seen = new Set(); const keep = [];
  for (const m of acc) {
    const code = m && m.canonical_code;
    if (!code) continue;
    if (String(m.match_tier || '').toLowerCase() === 'exact') continue;
    if (seen.has(code)) continue;
    seen.add(code); keep.push(m);   // API ranks variants-first → keep array order
  }
  return keep;
}

const d1Eligible = (hasUnresolved || r?.ambiguous === true) && !isClar && !requireSpec;
const candidates = d1Eligible ? collectMatches(r) : [];

if (candidates.length > 0) {
  const picks = cap3(candidates);
  const codes = picks.map(m => m.canonical_code);
  const tokenText = unresolved.length
    ? unresolved.join(', ')
    : (Array.isArray(q?.entities) ? q.entities.map(e => e.raw).filter(Boolean).join(', ') : '');
  out.suggest_offer = true;
  out.suggest_selection_context = 'suggest_offer';
  out.suggest_response =
    `Couldn't find "${tokenText}". Did you mean ${humanList(codes)}? ` +
    `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
  out.suggest_quick_reply = [...codes, YES, NO].join(',');
  out.suggest_last_result_set = picks.map((m, i) => ({
    idx: i + 1, label: m.canonical_code, value: m.canonical_code,
    product: m.canonical_code, uuid: m.uuid || null, entity_type: m.entity_type || null,
  }));
  return out;
}

// D2: data-miss "alternatives" (domain tool alternatives[] + relaxed_axis)
let gr = null;
try { if ($('Call \'sub-get-results\'').isExecuted) gr = $('Call \'sub-get-results\'').first().json; }
catch (e) { gr = null; }
const alts = (gr && Array.isArray(gr.alternatives) && gr.alternatives.length) ? gr.alternatives : null;
if (!alts) return out;   // no alternatives → keep existing "escalate?" behaviour (never invent)

const picks  = cap3(alts);
const values = picks.map(a => a.value).filter(Boolean);
if (values.length === 0) return out;

const axis   = gr.relaxed_axis || 'entity';
const compat = Array.isArray(gate?.compatible_entities) ? gate.compatible_entities : [];
const askedCode = (compat[0] && (compat[0].code || compat[0].canonical_code))
  || (Array.isArray(q?.entities) && q.entities[0] ? q.entities[0].raw : 'that item');

const NOUN = {
  inventory: 'stock', incoming: 'incoming stock (ETA)', product_attachment: 'that document',
  promotion: 'a promotion', master_products: 'product info',
};
const noun = NOUN[q?.domain_hint] || 'that';

let text;
if (axis === 'date') {
  const asked = q?.date_filter_start
    ? ((q.date_filter_end && q.date_filter_end !== q.date_filter_start)
        ? `${q.date_filter_start} to ${q.date_filter_end}` : q.date_filter_start)
    : 'that date';
  const custEnt = Array.isArray(q?.entities)
    ? q.entities.find(e => String(e.hint || '').toLowerCase() === 'customer') : null;
  const cust = custEnt ? custEnt.raw : 'This customer';
  const near = picks.map(a => a.display || a.value).join('; ');
  text =
    `No delivery on ${asked}. ${cust} has delivery on ${near}. ` +
    `Reply with a date to continue, or would you like me to escalate to ${team} team?`;
} else {
  text =
    `No ${noun} for ${askedCode}. Try: ${values.join(', ')}. ` +
    `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
}

out.suggest_offer = true;
out.suggest_selection_context = 'suggest_offer';
out.suggest_response = text;
out.suggest_quick_reply = [...values, YES, NO].join(',');
out.suggest_last_result_set = picks.map((a, i) => ({
  idx: i + 1, label: a.value, value: a.value, product: a.value,
  display: a.display || a.value, order_number: a.order_number || null,
}));
return out;
```

---

## Change 2 — `compile-current-state` (spine clone) — consume suggest offer

Four localized edits; everything else byte-identical (verified by re-fetch diff = trailing-newline only).

1. **New reader `_sug`** (after the `_mem` reader):
```js
const _sug = (() => {
  try {
    const nf = $('build-suggest-offer').isExecuted ? $('build-suggest-offer').first().json : null;
    return (nf && nf.suggest_offer === true) ? nf : null;
  } catch (e) { return null; }
})();
```
2. **Priority branch — `_sug` wins over `_mem` and `_cat`:**
```js
if (_sug) {
  response        = _sug.suggest_response;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_mem) { … } else if (_cat) { … }
```
   This is what resolves the order-domain conflict: on an order date-miss, `cs-offer-gate` still fires (team=customer_service/order_enquiries) and `build-cs-member-offer` still runs, but `_sug` overrides `_mem` so the suggestion (dates) is shown, not the member picker. (`get-cs-members` is a read; harmless.)
3. **quick_reply:** after the access-level block: `if (_sug) { quickReply = _sug.suggest_quick_reply; }`
4. **last_result_set + selection_context:**
```js
if (_sug) { last_result_set = Array.isArray(_sug.suggest_last_result_set) ? _sug.suggest_last_result_set : []; }
else if (_mem) { last_result_set = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : []; }
const selection_context = _sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : null);
```

Because `manualResponse=true`, the `business_query` summary block is skipped (no clobber). Because `isEscalateBranch=true`, the friendly-domain disclaimer block is skipped. `variables.response` is set to the full suggest message (parity with member-offer), which the reformulator reads next turn as `previous_conversation_state.response` (contains "would you like me to escalate" → plain-yes catch works).

### End-to-end thread of the three fields → send sub
`build-suggest-offer.suggest_*` → `compile-current-state`:
- `user_response` ← `_sug.suggest_response`
- `quick_reply` ← `_sug.suggest_quick_reply` (comma-joined: ≤3 codes/dates, then `Yes, escalate`, then `No, it's okay`)
- `variables.last_result_set` ← `_sug.suggest_last_result_set` (`{idx,label,value,…}`)
- `variables.selection_context` ← `'suggest_offer'`
→ `sorento-sub-respond-sendmsg-respond2` reads `message`, `quick_reply`, `result_set` from `compile-current-state` (unchanged mapping), `is_test:true`.

---

## Change 3 — reformulator fork `CpxE8LroLzCkrAQN` — D4/D5 catch

**NEW terminal node `suggest-follow-up`** (`n8n-nodes-base.code` v2, `runOnceForEachItem`, pos `[240,64]`), wired `output_exchange[0] → suggest-follow-up[0]`. `output_exchange` was terminal & unreferenced, so the sub now returns `suggest-follow-up`'s output (same shape). Inert on every turn where `previous_conversation_state.selection_context !== 'suggest_offer'`.

```js
const output = $input.first().json;
const parent_input = $('When Executed by Another Workflow').first().json;
const prevState = parent_input.previous_conversation_state || {};
if (output && output.output && prevState.selection_context === 'suggest_offer') {
  const _o = output.output;
  const _hasEntityPick = Array.isArray(_o.entities) && _o.entities.some(e => e.current_message === true);
  const _hasPosPick    = Array.isArray(_o.reference_positions) && _o.reference_positions.length > 0;
  if (_hasEntityPick || _hasPosPick) {
    if (!_o.domain_hint && prevState.domain_hint) {
      _o.domain_hint  = prevState.domain_hint;
      _o.intent_hint  = _o.intent_hint || prevState.intent_hint;
      _o.domain_inherited_for_suggest = true;
    }
    if (_o.domain_hint) _o.message_type = 'business_query';
  } else if (_o.is_affirmative === true) {
    _o.escalation = { is_escalation_confirmation: true };   // plain "yes" = escalate, never a pick
    _o.entities = [];
  } else if (_o.is_affirmative === false) {
    _o.escalation = { is_escalation_confirmation: false };  // "No, it's okay" = decline + stop
    _o.message_type = 'casual';
    _o.entities = [];
  }
  _o.suggest_pick_context = true;
}
return output;
```

- Tapped code / typed position → re-query in retained domain (never a CS assign — this is the key difference from the member-pick block).
- Position picks also already resolve via the pre-existing `reference_positions → entities` block in `output_exchange`; this node hardens domain retention + yes/no.
- Plain-yes → escalate is ALSO covered by the pre-existing `offeredEscalation && isAffirmative` block (the suggest message contains "would you like me to escalate"); this node makes it explicit and clears entities.

---

## Validation
No workflow-id validator exists on this SDK-based n8n-mcp (`validate_workflow` only takes SDK code). The `update_workflow` apply is the validation gate: all ops applied; the only warnings are PRE-EXISTING and identical to live (hardcoded `x-api-key` on http nodes, 7 DISCONNECTED_NODE = the intended orphaned egress nodes, `builtInTools` on OpenAI Chat Model, Transcribe expression-prefix, Postgres Chat Memory subnode). **Zero NEW errors/warnings** attributable to the three new/edited nodes. All three jsCodes pass `node --check`. Spine round-trip diff = trailing-newline only (byte-identical logic).

## Publish state (tester must note)
- Spine clone `txiPzSxy3Pclsz6v`: DRAFT (draft ≠ active). Directly executed → `execute_workflow(executionMode:"manual")` runs the draft, so D1/D2 render is testable NOW without publishing.
- Fork `CpxE8LroLzCkrAQN`: DRAFT (versionId `af101d4d…` ≠ active `e3ac3817…`). ⚠ The clone calls the fork as a SUB; per LESSONS #37 a parent sees only the PUBLISHED sub version. **The D4/D5 catch will NOT take effect until the fork is published.** D1/D2 render does not depend on the fork.

## Open findings / judgment calls (see final message F1–F5)
- **F1 (blocker for D2 live behaviour):** live `sub-get-results` (`Fss5aAaXthJSWpZCgKiKR`) node `output-structurer` does NOT pass `alternatives`/`relaxed_axis` through — it reconstructs a fixed envelope. So `alternatives` never reaches the spine today; D2 is built but DORMANT until that sub (out of my edit scope) is extended. Plan D3 assumption ("rides back automatically") is INCORRECT for this sub.
- **F2:** D1 gated to exclude `is_clarification` and `require_specific` (conservative — preserves those clarify prompts byte-identical). Judgment call.
- **F3:** order date-miss conflict resolved by `_sug` priority over `_mem` in compile (member fetch still runs but is discarded).
- **F4:** D2 render is UNtestable via UAC fixtures unless the fixture get-results payload includes `alternatives`/`relaxed_axis` (the fixture node bypasses the sub, so it CAN carry them for a UAC).
- **F5:** did-you-mean uses `unresolved_tokens` for the token text; if empty, falls back to parser entity raws.
