# Node diff — `order-member-pick-name-resolve` (CS-member pick by NAME)

Plan: `../../plans/order-member-pick-name-resolve.md` · UAC: `../UAC.md` §15 (15a–15k)
Built by: sorento-coder · For: sorento-reviewer

## Target / rebase

- **Built ON (dev clone copy):** `CpxE8LroLzCkrAQN` — "sub-query-reformulator TEST rebase" (the established
  dev fork of the parser sub; the clone `txiPzSxy3Pclsz6v` invokes this copy in test).
- **Rebase base:** live parser sub `XTODTw-dJcV0uRdC056hG`, active `versionId == activeVersionId ==
  827ad59f-3932-4adc-94f5-08f235a6b8c0` (the cert-routing-shipped version). Verified the plan's reference:
  live `AI Agent.systemMessage` = 23 688 chars, sha256 `eb382bcd4985c4d785e85b63065fb26c875e7c454a3772b554a9418e01a5d29f`
  (byte-identical to the plan's stated sha). **Live versionId had NOT moved past 827ad59f** — no re-baseline needed.
- **Staleness check (per "rebase on live then fix"):** before editing, compared `CpxE8LroLzCkrAQN`'s two target
  node bodies against current live 827ad59f using faithful (`jq -j`) extraction:
  - `AI Agent.systemMessage` — **byte-identical** to live.
  - `output_exchange.jsCode` — **byte-identical** to live (the earlier apparent trailing-newline diff was a
    `jq -r` vs `jq -j` extraction artifact, not a stored difference).
  Therefore CpxE8 was already at current-live logic (cert-routing + confident + anti-misuse, all of which are in
  live) — **not stale**. Building the name-resolve delta on it = "fork current live + layer fix". No fresh
  duplicate was created (MCP cannot duplicate losslessly; CpxE8 is a verified current-live fork).
- **Post-edit CpxE8 versionId (DRAFT):** `e3ac3817-5658-4b0f-8548-949a3d94f58c`.

## Changed nodes (2)

Only two nodes changed; both deltas are **pure additions** (verified by `diff` of stored-after vs current live —
see "Exact delta vs live" below). No other node touched. No connection/credential/structural change.

### 1. `AI Agent` → `options.systemMessage` (Δ-prompt, two insertions)

**Intent:** make the LLM ALWAYS extract a surface person-name into a new top-level `person_mention` key
(string | null), never mapped to a position, never gated on context. POSITIONAL REFERENCES (numeric/ordinal)
left untouched.

**Insertion A** — new section placed AFTER the `== POSITIONAL REFERENCES ==` block and BEFORE
`== IS_ACTIVE FILTER ==` (plan §3.1), byte-for-byte the plan text:

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

**Insertion B** — one new line in the `== OUTPUT (exactly these keys, no others, no comments) ==` object,
immediately after `"reference_positions": [],` (plan §3.2). Mandatory: without it the "no others" rule
suppresses emission.

```
  "person_mention": "string_or_null — the surface name the user mentioned, else null",
```

**Before → after intent:** before, the LLM had no `person_mention` key, so a bare-name reply during a
`member_offer` produced no usable signal (numeric-only resolution). After, the LLM surfaces the raw name on every
turn for the code to resolve.

### 2. `output_exchange` → `jsCode` (Δ-code, new resolution arm in the Δ3 block)

**Intent:** CODE deterministically resolves the extracted name against `last_result_set[].label`, inside the
existing `member_offer` Δ3 branch.

**Insertion A** — two declarations after `const _pos = _extract(...)` (so they are in scope for the new
`else if` condition), before the first numeric branch:

```js
  const _pm = (typeof _o.person_mention === 'string') ? _o.person_mention : '';
  const _normName = s => String(s || '').toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^(ms|miss|mrs|mr|encik|en|puan|pn|cik|tuan|dato|datin|dr)\.?\s+/, '');   // strip ONE leading honorific
```

**Insertion B** — a new `else if (_pm.trim()) { … }` arm chained onto the numeric `_pos` branches, placed AFTER
the three numeric branches (single-in-range / multi / out-of-range) and BEFORE
`else if (output.output.is_affirmative === true)` (a named pick outranks a stray affirmative):

```js
  } else if (_pm.trim()) {
    // Δ name-resolution arm: numeric _pos empty + a person_mention present → match vs last_result_set labels
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
      output.output.correction = true;   // ambiguity gate: reprompt, NEVER auto-pick
    } else {
      output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
      output.output.correction = true;   // 0 match -> reprompt the member list
    }
  } else if (output.output.is_affirmative === true) {
```

**Behaviour (offline V0, plan §8, against L-distinct/L-ambig):**
- 1 match → resolve: `{ is_escalation_confirmation:true, preferred_assignee_id:<uuid> }`, `entities:[]` (same shape as the numeric single-pick arm).
- >1 match → `member_reprompt:'multi'`, `correction:true`, NO `preferred_assignee_id` (ambiguity gate, plan §4.2).
- 0 match → `member_reprompt:'out_of_range'`, `correction:true` (reuses existing render; no clone change — plan §4).

**`_isNewQuery` gate (Bug-2 protection) — PRESERVED.** The new arm lives INSIDE the existing `if (!_isNewQuery)`
block. A name-bearing NEW query in an open member_offer ("any orders for Tan") sets `_isNewQuery=true` →
whole Δ3 block skipped → `person_mention` ignored → offer abandoned (safe). Tested by §15k.

## Notes for the reviewer

- **Honorific list includes `en|pn`.** The Δ-code regex strips
  `^(ms|miss|mrs|mr|encik|en|puan|pn|cik|tuan|dato|datin|dr)\.?\s+`. This follows the plan §4 code snippet
  byte-for-byte (the prompt §3.1 lists "Encik/En, Puan/Pn"); it is a superset of the task-summary's list
  (which abbreviated and omitted en/pn). `en`/`pn` are anchored at string start + require trailing whitespace,
  so "Ben Tan" / "Pnina" are NOT mis-stripped.
- **Numeric/ordinal path UNCHANGED** — the `_extract` numeric branches and the round-robin / decline affirmative
  branches are byte-identical to live; the new arm only fires when numeric `_pos` is empty AND `_pm` is non-empty.
- **Zero-egress / safety (S2):** this is a pure-parse change. A resolved pick becomes
  `escalation.preferred_assignee_id`, consumed only by the human-intervention sub `rrYXzE61gCNUck_zmXe-G`, which
  short-circuits on `is_test=true` on the clone → no real assign/SLA/PIC-comment/queue write. Tester asserts §0 S2.
- **`person_mention` is additive on EVERY turn** (plan §7) — regression diff must register it as
  ignored-when-`null`, flagged-when-non-null (NOT a blanket ignore).

## Validation

- `update_workflow` applied atomically (`appliedOperations:1` per op) with **no errors**. Returned warnings are
  the documented pre-existing benign ones (LESSON 13), present on this dev copy by design:
  - `Postgres Chat Memory` SUBNODE_NOT_CONNECTED / DISCONNECTED_NODE (orphaned on n8n_test — CpxE8 design).
  - `OpenAI Chat Model` builtInTools INVALID_PARAMETER (also in live).
- **`validate_workflow` tool note:** on this SDK-based n8n-mcp surface, `validate_workflow` validates **SDK
  code**, not an existing workflow id. It is not applicable to an in-place `setNodeParameter` edit (I did not
  regenerate the whole workflow as SDK code, which would invite the lossy create_workflow_from_code path —
  LESSON 3). The validation gate used instead:
  1. atomic `update_workflow` success with no errors (errors loudly on bad refs/params — LESSON 36);
  2. `node --check` of the stored `output_exchange.jsCode` (wrapped) → **SYNTAX OK**;
  3. byte-exact re-fetch + diff (below).
- **Byte-exact verification (post-edit re-fetch, `jq -j`):** stored `AI Agent.systemMessage` and
  `output_exchange.jsCode` both **BYTE-EXACT** to the intended new bodies. Delta vs current live = **only** the
  two planned additions per node (confirmed by `diff`). (One transient box-drawing `━` count drift in the
  systemMessage separator — cosmetic, LLM-ignored — was caught and corrected to live's 35 before final verify.)

## Publish / promotion (NOT done — user-gated)

- **MCP edits land in the DRAFT.** CpxE8's published version is unchanged; callers see the OLD published sub
  until publish (LESSON 37). **`publish_workflow CpxE8LroLzCkrAQN` is REQUIRED before the tester runs §15
  e2e** (the clone invokes only the published version). I did NOT publish — publish is the user-gated promote step.
- This change was NOT promoted to live `XTODTw-dJcV0uRdC056hG`. Promotion (plan §9 step 4) is user-gated:
  sha-gated byte-exact copy of the two node bodies to live, then publish, backup-first.
- I did NOT run any UAC execution (tester's job).
