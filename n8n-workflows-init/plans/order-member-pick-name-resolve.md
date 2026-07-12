# Plan — order_enquiries member pick by NAME (LLM extracts, code resolves)

> **STATUS: PLAN.** No workflow edited, no execution run. Source of truth: live `XTODTw-dJcV0uRdC056hG`
> (active `versionId == activeVersionId == 827ad59f-3932-4adc-94f5-08f235a6b8c0`, confirmed via MCP
> `get_workflow_details`, 2026-06-30). Live active `AI Agent.systemMessage` (sha256 `eb382bcd4985c4d7`,
> 23 688 chars) is byte-identical to backup
> `tests/reviews/backups/PROMOTE-cert-routing-20260630/live-XTODTw-draft-AI-Agent-systemMessage.txt`, so the
> prompt delta is specified against the *current* active text.

> **DESIGN REVISION (this version).** The earlier "LLM resolves the position" approach is dropped — LLMs are
> weak at position resolution. New split: **the LLM only EXTRACTS a person-name surface string; CODE does the
> deterministic resolution** against the known member labels. This moves all honorific/normalization/matching
> logic into `output_exchange` (deterministic, testable offline), and keeps the LLM job tiny and reliable.

**Target node(s):** reformulator sub `XTODTw-dJcV0uRdC056hG` ONLY —
- `AI Agent` → `options.systemMessage` (Δ-prompt: emit a new `person_mention` key; two insertions).
- `output_exchange` → `jsCode`, Δ3 block (Δ-code: a new name-resolution arm).

**Change-level scope:** `parser` (the `person_mention` extraction is genuine LLM behaviour; per LESSON 28 a
`mock_reformulator_output` injection bypasses both deltas). The CODE arm is additionally offline-unit-testable
(§8 V0). End-to-end §15 cases MUST run the real, rebased reformulator copy.

**Hard rule:** reformulator is pure-parse, zero egress. A resolved pick becomes
`escalation.preferred_assignee_id`, consumed only by the human-intervention sub `rrYXzE61gCNUck_zmXe-G`, which
short-circuits on `is_test=true` on the clone → **no real assignment ever fires** (§0/S2).

---

## 1. Problem

In an order_enquiries escalation the bot offers a numbered list of CS members
(`selection_context = "member_offer"`). Today **only a number / ordinal / "option N" resolves** (the
`output_exchange` Δ3 `_extract` parses numeric tokens only); a bare **name** reply ("Ms Tan", "miss tan",
"tan", a typo) yields no numeric token and falls to the implicit **else → "new question → abandon offer"**.
We want a name reply to resolve to the right CS member — **without ever auto-picking the wrong person** (a
wrong assignment to a real CS member triggers a staff email/WhatsApp ripple; §0/S2).

## 2. Confirmed mechanics (read-only investigation)

- **State shape.** `previous_conversation_state.last_result_set` rows = `{ idx, label(=name), uuid(=crm
  user_id), respond_user_id }`; `selection_context = "member_offer"`. Built by `build-cs-member-offer`,
  promoted by `compile-current-state` (both in the clone, NOT the reformulator — untouched here).
- **The LLM sees the user reply (and the prior list).** `AI Agent.text` =
  `Previous response: {{…previous_conversation_state.response}}` / `User answered: {{…latest_user_message}}`
  / `Previous domain: {{…previous_conversation_state.domain_hint}}`. So `latest_user_message` (where the name
  is) is in front of the model. (The LLM does NOT see `last_result_set` — that's code-only; the CODE arm does
  the label matching.)
- **Δ3 numeric path (unchanged target for reuse).**
  ```js
  const _selCtx = (parent_input.previous_conversation_state || {}).selection_context;
  if (_selCtx === 'member_offer') {
    const _lastSet = Array.isArray((parent_input.previous_conversation_state||{}).last_result_set) ? …last_result_set : [];
    const _maxIdx = _lastSet.length;
    const _ORD = {first:1,…};
    const _extract = (msg, llm) => { /* LLM array wins; else mine digits/ordinals */ };
    const _o = output.output;
    const _isNewQuery = _o.domain_hint && Array.isArray(_o.entities) && _o.entities.some(e => e.current_message === true) && _o.is_affirmative !== true;
    if (!_isNewQuery) {
      const _pos = _extract(parent_input.latest_user_message, output.output.reference_positions);
      if (_pos.length===1 && in range) { escalation = {is_escalation_confirmation:true, preferred_assignee_id:_row.uuid}; entities=[]; }
      else if (_pos.length>1) { escalation={…member_reprompt:'multi'}; correction=true; }
      else if (_pos.length===1) { escalation={…member_reprompt:'out_of_range'}; correction=true; }
      else if (is_affirmative===true) { escalation={is_escalation_confirmation:true}; }       // round-robin
      else if (is_affirmative===false) { escalation={is_escalation_confirmation:false}; message_type='casual'; }
      // else: new question -> leave normal (abandon)
      member_pick_context = true;
    }
  }
  ```
  The single-pick line `escalation = {is_escalation_confirmation:true, preferred_assignee_id:_row.uuid}` is
  the shape the new arm reuses verbatim. **The numeric/ordinal path is NOT touched.**

## 3. Δ-prompt — LLM EXTRACTS a name into `person_mention` (always)

The LLM's only new job: surface a person-name mention. **Two insertions** into
`AI Agent.options.systemMessage`:

### 3.1 Add the extraction instruction
Insert a new section, placed after `== POSITIONAL REFERENCES ==` (so it sits next to the related concept) and
before `== IS_ACTIVE FILTER ==`:

```
== PERSON-NAME MENTION ==
If the user message refers to a person by name — in any honorific form (Ms, Miss, Mrs, Mr, Encik/En,
Puan/Pn, Cik, Tuan, Dato/Datin, Dr), any spelling, partial (given name OR surname only), or reversed order —
output that surface name string in the top-level "person_mention" key. Otherwise output null.
ALWAYS extract this whenever a person is named, regardless of conversation context or what the previous
message was — whether it gets used is the downstream code's decision, not yours.
  - Output the user's SURFACE wording (e.g. "Ms Tan", "miss tan", "tan", "Tan Wei") — do NOT correct,
    normalize, or map it to a number or position.
  - person_mention is INDEPENDENT of reference_positions: never put a name into reference_positions and never
    put a number into person_mention. Both may be present; usually only one is.
  - This is name extraction only. Keep classifying message_type / domain_hint / entities exactly as you
    normally would; person_mention is additive.
```

### 3.2 Add the key to the OUTPUT schema block
In the `== OUTPUT (exactly these keys, no others, no comments) ==` object, add one line (e.g. next to
`"reference_positions": [],`):
```
  "person_mention": "string_or_null — the surface name the user mentioned, else null",
```
This is mandatory — the OUTPUT block says "exactly these keys, no others," so without it the model may omit
`person_mention`.

> The LLM does **NOT** gate on `selection_context`, does **NOT** map names to positions, and does **NOT**
> change `reference_positions` for names. Existing POSITIONAL REFERENCES (numbers/ordinals) behaviour is
> unchanged.

## 4. Δ-code — CODE RESOLVES the name (output_exchange Δ3, new arm)

Add a name-resolution arm to the Δ3 branch chain, **inside the existing `if (!_isNewQuery)` block**, placed
**after** the numeric `_pos` branches and **before** the `is_affirmative` branches (a named pick outranks a
stray affirmative). It fires only when: `_selCtx==='member_offer'` AND numeric `_pos` is empty AND
`person_mention` is a non-empty string. Precise intent:

```js
// after the three numeric `_pos` branches, before `else if (is_affirmative===true)`:
const _pm = (typeof _o.person_mention === 'string') ? _o.person_mention : '';
const _normName = s => String(s || '').toLowerCase().trim()
  .replace(/\s+/g, ' ')
  .replace(/^(ms|miss|mrs|mr|encik|en|puan|pn|cik|tuan|dato|datin|dr)\.?\s+/, '');   // strip ONE leading honorific
...
} else if (_pm.trim()) {
  const _q  = _normName(_pm);
  const _qt = new Set(_q.split(' ').filter(Boolean));
  const _norm = _lastSet.map(r => ({ idx: Number(r.idx), uuid: r.uuid, ln: _normName(r.label) }));
  // tiered: exact -> token overlap -> substring; collect ALL idx at the FIRST tier that yields matches
  let _m = _norm.filter(r => r.ln === _q);
  if (!_m.length) _m = _norm.filter(r => r.ln.split(' ').some(t => _qt.has(t)));
  if (!_m.length) _m = _norm.filter(r => r.ln.includes(_q) || _q.includes(r.ln));
  _m = [...new Map(_m.map(r => [r.idx, r])).values()];   // dedupe by idx
  if (_m.length === 1) {
    output.output.escalation = { is_escalation_confirmation: true, preferred_assignee_id: _m[0].uuid };
    output.output.entities = [];
  } else if (_m.length > 1) {
    output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'multi' };
    output.output.correction = true;       // ambiguity gate: reprompt, NEVER auto-pick
  } else {
    output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
    output.output.correction = true;       // 0 match -> reprompt (recommendation below)
  }
}
```

- **Exactly 1 match → resolve** with the same shape as the numeric single-pick arm (`is_escalation_confirmation:true, preferred_assignee_id:_row.uuid`, `entities:[]`).
- **>1 match → `member_reprompt:'multi'`** (existing reprompt; the ambiguity gate, §4.2).
- **0 match → recommendation: reuse `member_reprompt:'out_of_range'`** (NOT a new literal). Reason: this change
  is reformulator-scoped; a new `member_reprompt:'no_match'` literal would require a matching clone-side render
  branch (out of scope, scope-creep). `'out_of_range'` already has a tested re-offer render in the clone, so a
  name miss reprompts the list with zero clone change — the helpful outcome. (Falling to the existing `else`
  → silent abandon is the less-helpful but also-safe alternative; choose `out_of_range`.)
- `person_mention` is read by NO other downstream branch.

### 4.1 The `_isNewQuery` gate is the wrong-resolve protection — KEEP IT (mandatory)
The new arm MUST live inside `if (!_isNewQuery)`. A message that names a listed member but is actually a NEW
business query ("any orders for Tan?" while a member_offer is open) will have `person_mention="Tan"` +
`reference_positions:[]`, so the arm's preconditions are met — and would wrongly resolve to member "Tan" if
not gated. `_isNewQuery` (`domain_hint && a current_message entity && !is_affirmative`) is true for such a
query → the whole block is skipped → `person_mention` ignored → offer abandoned (safe). This gate, not the
LLM, is what prevents the wrong resolve. Tested by §15k.

### 4.2 Ambiguity gate (non-negotiable)
`>1` label match → `member_reprompt:'multi'`, never a single `preferred_assignee_id`. Tiering note: matches
are collected at the FIRST tier that yields any (exact, else token-overlap, else substring), so a query that
exactly equals one label (e.g. surname "tan" vs labels "Ms Tan"/"Mr Lee") resolves uniquely, while a query
that token/substring-hits several compound names (e.g. "tan" vs "Ms Tan Mei"/"Mr Tan Wei") collects all →
reprompt. (Validated offline; see §6a seed lists.)

## 5. Bug-2 over-extraction risk — RE-EVALUATED under this design

The earlier rejection (a code matcher scanning the RAW sentence → "does Tan have any orders" auto-resolves)
**does NOT apply to this design, but the mitigation differs from the coordinator's stated reason** — flag:

- **Bug-2-style risk (digit/substring mining from the raw message): GONE.** Matching now runs against the
  clean LLM-extracted `person_mention`, never the raw sentence, and never mines digits. No CKS315→315 class.
- **Residual narrow risk: a person-naming NEW query inside an open member_offer.** Contrary to "the LLM only
  emits a name when the user refers to a person, so it's safe," the LLM WOULD emit `person_mention="Tan"` for
  "any orders for Tan" (the user does name a person). The arm's preconditions (member_offer + no positions +
  non-null `person_mention`) are then met. **The actual protection is the `_isNewQuery` gate (§4.1)**, which
  abandons clear new queries, PLUS the narrow firing window (member_offer only). **Net: acceptable**, provided
  the `_isNewQuery` gate is kept (mandatory) and §15k passes. Lowest-residual edge: a member-naming query that
  `_isNewQuery` fails to flag (e.g. LLM emits no `domain_hint`) could mis-resolve in member_offer; blast radius
  is one CS assign, fully blocked in test (is_test) and surfaced at the promotion gate. Reviewer must confirm.

## 6. Scope, tier, zero-egress

- **`scope: parser`** (change-level): `person_mention` is LLM-emitted; the §15 e2e cases run the real rebased
  reformulator copy (fresh duplicate of live `XTODTw` + Δ-prompt + Δ-code, re-pointed from the clone per the
  cert-routing plan §5). Two acceptance layers:
  - **LLM layer (parser):** assert `person_mention` is correctly extracted (a string for name turns, `null`
    otherwise) — real reformulator only.
  - **Code layer (offline unit V0 + parser e2e):** assert the tiered resolution + ambiguity gate.
- **Zero egress.** §0 gate; a real assign/SLA/PIC-comment/send is a hard fail + halt.

### 6a. Seeding the `member_offer` state (prerequisite)
A pick turn needs `previous_conversation_state.{selection_context:"member_offer", last_result_set:[…],
domain_hint:"order"}`. Per LESSON 31, injecting it in the redis item does NOT work — the reformulator reads it
from `get-session-vars`. **Pre-seed `respond_contacts_test` (cred `Dnnofg8Xb27VQOhI`) for `437264483`** and run
each case as a single turn in **`mode=regress-capture`**, re-seeding between independent cases. Synthetic uuids
are safe (human-intervention sub guarded). Two seed lists (validated against the §4 matcher):
- **L-distinct** = `[{idx:1,label:"Ms Tan",uuid:"u-tan"},{idx:2,label:"Mr Lee",uuid:"u-lee"},{idx:3,label:"Ms Wong",uuid:"u-wong"}]`
  (distinct single surnames → unique matches; "tan"→[1], "wong"→[3]).
- **L-ambig** = `[{idx:1,label:"Ms Tan Mei",uuid:"u-tan1"},{idx:2,label:"Mr Lee",uuid:"u-lee"},{idx:3,label:"Mr Tan Wei",uuid:"u-tan3"}]`
  (two compound "Tan" names → "Tan" misses the exact tier, token-tier collects [1,3] → multi).
Each row also carries `respond_user_id`. Capture both into `tests/fixtures/contacts/member-offer-distinct.json`
/ `tests/fixtures/contacts/member-offer-ambig.json`. (The clone renders `response` from `last_result_set`; the
CODE matcher uses `latest_user_message` + `last_result_set` only, so `response` text is not load-bearing — seed
a realistic `response` anyway for fidelity.) For these `parser` cases OMIT `mock_reformulator_output`.

## 7. Regression / golden handling — `person_mention` is now on EVERY parser output

`person_mention` is emitted on every turn (always-extract) → an ADDITIVE key on all ~2,216 golden turns.
Replay-diffing pre-change golden would flag the new key everywhere. Handling (avoid a full re-baseline):

- **Additive-when-null allowlist.** Register `person_mention` so the diff IGNORES it **only when its value is
  `null`** (the no-behaviour-change case). Do NOT blanket-ignore the key (LESSON 21 — over-stripping hides real
  regressions).
- **Flag-when-non-null.** Any turn where replay emits a non-null `person_mention` is surfaced for review. Most
  will be benign name mentions in historical traffic (the field is new but harmless there); the load-bearing
  ones are member_offer turns. This catches both real behavioural change and unexpected over-extraction.
- **No full re-baseline required** for the additive key; but the NEW behaviour turns (member_offer name picks,
  §15) have NO historical golden — **capture §15a–§15k fresh as the new golden** for this change.
- **Sampled-regression pass (V4):** assert that, off member_offer turns, NO `escalation`/`correction`/
  `entities` deltas appear vs golden (i.e. the always-extract is inert outside the resolution arm), and that
  member_offer turns are the ONLY place `person_mention` drives a resolution.

## 8. Verification tasks
- **V0 (offline, cheapest):** `output_exchange` Δ-code unit — feed synthetic `output.output`
  (`{person_mention:"Ms Tan", reference_positions:[], domain_hint:null, entities:[]}`) + a member_offer
  `previous_conversation_state` (L-distinct) → assert `escalation.preferred_assignee_id==="u-tan"`. Repeat for
  ambiguity (L-ambig, `"Tan"` → `member_reprompt:'multi'`, no `preferred_assignee_id`), no-match
  (`"Bob"` → `out_of_range`), and `_isNewQuery` gate (`person_mention:"Tan"` + `domain_hint:"order"` +
  current_message entity → arm does NOT fire). 0-token, no LLM.
- **V1 (parser, §15a–e):** real reformulator extracts `person_mention`; code resolves single match →
  `preferred_assignee_id === last_result_set[idx].uuid`, `is_escalation_confirmation:true`, `entities:[]`.
- **V2 (parser, §15f):** ambiguity → `member_reprompt:'multi'`, `correction:true`, NO `preferred_assignee_id`.
- **V3 (parser/regression, §15h–k):** numeric "2" resolves row2; "yes" → round-robin; unrelated new query
  (no person) abandons; person-naming new query (§15k) abandons via `_isNewQuery` (no resolve).
- **V4 (sampled regression, §7):** additive `person_mention` inert off member_offer; no other deltas.
- **V5 (zero-egress, every case):** §0 S1–S6, S2 focus — human-intervention sub short-circuited; NO
  `Assign or unassign a Conversation1` / SLA POST / PIC comment / assignee-queue push executed.

## 9. Rollout (when approved — user-gated, NOT in this plan)
1. Duplicate live `XTODTw` → rebased copy; apply Δ-prompt (two `setNodeParameter` `/options/systemMessage`
   edits, byte-exact) + Δ-code (`setNodeParameter` `/jsCode`). 2. `publish_workflow` the copy (LESSON 37);
   re-point the clone. 3. V0 → §15 (parser) → V4 → V5; reviewer confirms zero egress + §5 residual-risk
   judgement + §7 golden handling. 4. Promote (user-gated): sha-gated byte-exact promotion of systemMessage +
   jsCode to live `XTODTw`, then `publish_workflow` (LESSON 24/25); backup prior versionId + node bodies first.
