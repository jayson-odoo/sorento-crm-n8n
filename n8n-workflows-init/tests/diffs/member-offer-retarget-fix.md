# Node-diff — member_offer entry-gate fix (retarget / reachable decline / new-query abandon)

**Change-id:** `member-offer-retarget-fix`
**Target (edited):** reformulator FORK `CpxE8LroLzCkrAQN` (`sub-query-reformulator TEST rebase`) — the fork the clone `txiPzSxy3Pclsz6v` actually calls. **NOT** live `XTODTw-dJcV0uRdC056hG`, NOT the clone spine.
**Node touched (single):** `output_exchange` (Code, `n8n-nodes-base.code`). No other node changed. No connections/nodes added or removed.
**Versioning:** pre-edit active `b86ad57d-6695-4d97-ab18-0b458891b93c` → pushed draft `5c4f9478-…` → **published**, new `activeVersionId = 5c4f9478-d6f8-4524-92c8-0a412e4f668b`. Draft sha-verified byte-identical to the intended local copy before publish.
**Scope/tier:** `parser` (change is inside the reformulator, downstream of the AI Agent; `mock_reformulator_output` bypasses it — LESSON 28; e2e must run the real fork, OMIT the mock).

---

## Edit 1 — routing preference for `request_for_help` (was lines 442–449)

### BEFORE
```js
const derived = output.output.domain_hint
  ? deriveRouting(output.output)
  : { suggested_team: null, suggested_agent: null };

const suggested_team  = norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';

output.output.routing = { suggested_team, suggested_agent };
```

### AFTER
```js
// §3.4 capture the LLM's FRESH routing BEFORE deriveRouting/prior overwrite output.output.routing.
const _llmTeamRaw  = output.output?.routing?.suggested_team;
const _llmAgentRaw = output.output?.routing?.suggested_agent;

const derived = output.output.domain_hint
  ? deriveRouting(output.output)
  : { suggested_team: null, suggested_agent: null };

// For a request_for_help turn with a valid LLM team, that team WINS over deriveRouting/prior.
// TERNARY (not `_reqHelp && _llmTeamN`): `false ?? y === false` would poison the nullish chain.
const _reqHelp   = output.output.message_type === 'request_for_help';
const _llmTeamN  = norm(_llmTeamRaw);
const _llmAgentN = norm(_llmAgentRaw);
const suggested_team  = (_reqHelp ? _llmTeamN  : null) ?? norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = (_reqHelp ? _llmAgentN : null) ?? norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';

output.output.routing = { suggested_team, suggested_agent };
```

**Intent:**
- Capture the LLM's fresh `routing.suggested_team`/`suggested_agent` into `_llmTeamRaw`/`_llmAgentRaw` **before** `deriveRouting`/prior can clobber `output.output.routing` (§3.4 ordering caveat — captured after the clobber would read the derived/prior team and the retarget arm would never fire).
- On a `request_for_help` turn with a valid LLM team, that team now WINS over deriveRouting/prior. Uses a **ternary** `(_reqHelp ? _llmTeamN : null) ?? …` — deliberately NOT `(_reqHelp && _llmTeamN) ?? …`, because `false ?? y === false` would poison the nullish-coalescing chain on every non-help turn.
- `_reqHelp`, `_llmTeamN`, `_llmAgentRaw` are declared here and reused by the retarget arm in Edit 2.
- **Inert off the help path:** on any non-`request_for_help` turn the ternary yields `null`, so routing = derived → prior → default exactly as before (regression-safe; V4).

---

## Edit 2 — restructure `if (_selCtx === 'member_offer')` into 4-tier precedence (was lines 453–526)

Setup (unchanged, retained byte-for-byte): `_lastSet`, `_maxIdx`, `_ORD`, `_extract`, `_o`, `_normName`, `_rawReply`, `_replyWords`, `_replyIsNumber`, `_replyMatchesMember`, `_forcePick`.

**Removed:** the old single gate `if (!_isNewQuery || _forcePick) { …pick arms…; member_pick_context = true; }` and the old narrow `_isNewQuery` (`domain_hint && entities.some(current_message) && !affirmative`).

**Added** the decision variables + the 4-tier `if/else-if` chain:
```js
const _priorTeam = norm(priorRouting.suggested_team) || 'customer_service';
const _pos = _extract(parent_input.latest_user_message, output.output.reference_positions);
// §1.1 fix: _pm keys ONLY on an actual extracted person name (dropped the `: _rawReply` fallback
//           that made this arm truthy for EVERY worded reply and shadowed the yes/no arms).
const _pm = (typeof _o.person_mention === 'string' && _o.person_mention.trim()) ? _o.person_mention.trim() : '';
// §1.3 broaden: a real question (with OR without a current-message entity) abandons the offer.
const _isNewQuery = (!!_o.domain_hint || _o.message_type === 'business_query' || _o.message_type === 'clarification')
  && _o.is_affirmative !== true;
const _hasPickSignal = _forcePick || _pos.length > 0 || !!_pm
  || _o.is_affirmative === true || _o.is_affirmative === false;
```

### Exact arm precedence (order is load-bearing)
1. **Tier 1 — RETARGET** — `if (_reqHelp && _llmTeamN && _llmTeamN !== _priorTeam)`
   → `routing = { suggested_team:_llmTeamN, suggested_agent:(norm(_llmAgentRaw)||'general_enquiries') }`;
     `escalation = { is_escalation_confirmation:true, retarget_team:true }`;
     `message_type = 'request_for_help'`; `selection_context = null`; `last_result_set = []`;
     `member_pick_context = false`. Abandons the CS roster, direct-assigns the REAL named team (not hardcoded).
2. **Tier 2 — PICK SIGNAL** — `else if (_hasPickSignal)` — the existing pick arms, logic unchanged, keyed on the new `_pm`:
   - `_pos.length===1` in range → `preferred_assignee_id = _lastSet[idx].uuid`, `entities=[]`.
   - `_pos.length>1` → `member_reprompt:'multi'`, `correction:true`.
   - `_pos.length===1` out of range → `member_reprompt:'out_of_range'`, `correction:true`.
   - `_pm` (person name) → tiered exact→token→substring match vs `last_result_set` labels; 1 hit → `preferred_assignee_id`; >1 → `multi` (ambiguity gate, NEVER auto-pick); 0 → `out_of_range`.
   - `is_affirmative===true` → `{ is_escalation_confirmation:true }` (round-robin, no preferred). **Now reachable.**
   - `is_affirmative===false` → `{ is_escalation_confirmation:false }`, `message_type='casual'`. **Now reachable.**
   - then `member_pick_context = true`.
3. **Tier 3 — NEW QUERY** — `else if (_isNewQuery)` — **abandon**: do NOT set `member_pick_context`, do NOT touch `routing`/`escalation`/`entities`; normal downstream processing answers. (Broadened from the old domain-AND-entity gate to `domain_hint || business_query || clarification`, still `&& is_affirmative !== true`.)
4. **Tier 4 — else (junk)** — `escalation = { is_escalation_confirmation:false, member_reprompt:'out_of_range' }`, `correction:true`, `member_pick_context=true`. (This is the old out_of_range reprompt that a junk reply previously reached via the `_pm=_rawReply` name-miss path; now reached explicitly.)

**LESSON 39 preserved:** `_forcePick` (bare number, or ≤3-word reply exactly matching a member label) is a member of `_hasPickSignal`, and Tier 2 is checked BEFORE Tier 3 → a bare number/member-name still outranks a speculative new-query classification.

---

## Behavioral summary (offline sim of all 10 UAC rows + a same-team guard row — all green)

| row | reply | tier | result |
|---|---|---|---|
| 1 | `2` | 2 pos | `preferred_assignee_id:u-sandy`, entities [], member_pick_context true |
| 2 | `Nur` (person_mention=Nur) | 2 name | `preferred_assignee_id:u-nur` (resolve; safe-abandon also PASS) |
| 3 | `yes` | 2 affirmative | `{is_escalation_confirmation:true}` no preferred (round-robin) — **arm now reachable** |
| 4 | `no thanks` | 2 affirmative | `{is_escalation_confirmation:false}`, message_type casual, NO reprompt/correction |
| 5 | `no, I want warehouse` | 1 retarget | routing.suggested_team `warehouse`, `retarget_team:true`, selection_context null, last_result_set [], member_pick_context false |
| 6 | `can i escalate to warehouse team?` | 1 retarget | same as row 5 |
| 7 | `show me all promotions` | 3 abandon | domain promotion, member_pick_context unset, routing = derived (`purchasing…`, NOT `false` — ternary proven) |
| 8 | `check stock SRTKT72SS` | 3 abandon | `72` NOT mined (Bug-2 guard holds), no out_of_range/correction, member_pick_context unset |
| 9 | `what can you do` | 3 abandon | clarification abandons via broadened `_isNewQuery`, member_pick_context unset |
| 10 | `asdkjh` | 4 junk | `member_reprompt:'out_of_range'`, correction true, member_pick_context true |
| guard | `yes route me` (request_for_help + team `customer_service` == prior) | 2 | does NOT retarget (team == prior) → falls to affirmative round-robin |

---

## Zero-egress / safety notes (for the tester/reviewer)
- Change is pure-parse inside the reformulator; a resolved pick / retarget becomes an `escalation` payload consumed ONLY by the human-intervention fork `vUfFUDjLAuMaeQE6`, which short-circuits on `is_test=true` → no real assign/SLA/PIC-comment/queue-push (§0 S2). Downstream honoring of `routing.suggested_team` (retarget) reaches the same guarded sub.
- No egress node touched; no sub-call site changed; `is_test` threading unchanged.
- Pre-existing validation warnings on the fork are unchanged and NOT introduced by this edit: `Postgres Chat Memory` disconnected (subnode) and `OpenAI Chat Model` `builtInTools` (LESSON 13 — present in live too).

---

# §10 FOLLOW-ON — deterministic reachable-decline (survive-decline parser + spine decline branch)

**Change-id:** `member-offer-retarget-fix` §10
**Plan:** `plans/member-offer-retarget-fix.md` §10 · **UAC:** `tests/member-offer-retarget-UAC.md`
**Targets edited (build/test only — NO live, NO promotion):**
- reformulator FORK `CpxE8LroLzCkrAQN` — 2 nodes (`AI Agent` systemMessage, `output_exchange` jsCode).
  Pre-edit active `5c4f9478-d6f8-4524-92c8-0a412e4f668b` → pushed draft (both nodes byte-verified vs local) → **published** new `activeVersionId = a5900ed0-551e-41d3-b99c-8cb63e047b9f`.
- clone SPINE `txiPzSxy3Pclsz6v` — decline branch (+2 nodes, +1 switch case, 1 edge rerouted).
  Pre-edit active `491cbbeb-5442-4c37-900b-796091b64d0e` → pushed draft (topology + escalate-catalog byte-verified) → **published** new `activeVersionId = 45f67ec0-dc4c-4d49-9afc-d9f0fc339769`.

**Scope/tier:** `parser` (parts 1 & 2 inside the reformulator fork; part 3 is deterministic spine but only exercised e2e alongside the real parser — OMIT `mock_reformulator_output`).
**NOT touched:** live sub `XTODTw-dJcV0uRdC056hG`, live spine `9qVyfUxmRQqrpGRMDLRuz`. No egress/human-intervention/assign/SLA/PIC/CRM-write node touched on either workflow.

---

## Part 1 — parser prompt clause (fork `CpxE8LroLzCkrAQN` › `AI Agent`, id `cb4f080d-bf4c-41fe-9685-e816d858f198`, `parameters.options.systemMessage`)

Extended the EXISTING `request_for_help` priority rule (systemMessage line 147). ONE clause appended to the end of that paragraph; the rest of the 387-line systemMessage is **byte-identical** (verified by `diff` vs local pre-edit copy — the only delta is this clause).

**Before (line 147 tail):**
> …classify as request_for_help even if they also mention a product or order.

**After (added, same paragraph):**
> …classify as request_for_help even if they also mention a product or order. **request_for_help also takes priority even when the message is a DECLINE. If the user declines the offered option but names a DIFFERENT team/department/human to route to, classify message_type=request_for_help, STILL emit is_affirmative=false, and set routing.suggested_team to the named team. A decline that names NO team ("no thanks") stays is_affirmative=false with message_type NOT request_for_help.**

Intent: a decline that names a different team (row 5 `"no, I want warehouse"`) now survives as `request_for_help` + `is_affirmative=false` + `routing.suggested_team=warehouse` (Gap A). The `== ROUTING ==` section already maps warehouse→`suggested_team='warehouse'`; not duplicated. Faithful-extraction only, no new branching.

## Part 2 — `output_exchange` decline arm (fork `CpxE8LroLzCkrAQN` › `output_exchange`, id `acabbc05-acfa-4500-ad6f-a7068ec9cb38`)

Single arm inside `if (_selCtx === 'member_offer')`, Tier-2 pick block, the `is_affirmative===false` branch. Whole jsCode `diff`-verified vs local (only this arm changed).

**Before:**
```js
} else if (_o.is_affirmative === false) {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}
```
**After:**
```js
} else if (_o.is_affirmative === false) {
  // §10 Part 2 — plain decline … Emit a DETERMINISTIC decline marker the spine's
  // is-escalation-declined IF keys on … Do NOT set correction/member_reprompt.
  output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
  output.output.message_type = 'casual';
}
```
Intent: a plain decline (no position/person_mention pick, no named-team retarget — Tier-1 already consumed retarget) now emits `escalation_declined:true`. This flag is present ONLY on this arm — NOT on retarget (`retarget_team:true`), NOT on out_of_range junk (`correction:true`+`member_reprompt`), NOT on picks. `message_type` stays `casual` as before; the spine keys on the new flag before `If9`.

## Part 3 — spine deterministic decline branch (clone `txiPzSxy3Pclsz6v`)

**Nodes added (+2):**
| node | id | type / v | params |
|---|---|---|---|
| `is-escalation-declined` | `is-escalation-declined` | `n8n-nodes-base.if` / 2.3 | one boolean-true condition, leftValue `={{ $('Call \'sub-query-reformulator\'').first().json.output.escalation?.escalation_declined === true }}` (optional-chaining guards non-offer turns; matches how If10/If9 reference the sub output) |
| `tag-escalation-declined` | `tag-escalation-declined` | `n8n-nodes-base.set` / 3.4 | one assignment `branch_kind = "escalation_declined"` (mirrors `tag-escalate-offer`) |

**Switch case added (+1) — `escalate-catalog` (id `escalate-catalog-node`):** whole jsCode `diff`-verified vs local; only this case added after `out_of_scope`:
```js
case 'escalation_declined':
  response          = 'Escalation declined.';   // FIXED canned reply — no LLM shaping
  manualResponse    = true;
  includeResponse   = true;
  is_escalate_offer = false;                     // → cs-offer-gate FALSE → straight to compile-current-state
  break;
```

**Edges (topology) — before → after (verified via connections dump):**
| edge | before | after |
|---|---|---|
| `If10`[out 0 TRUE] | → `tag-escalate-offer` | → `tag-escalate-offer` (unchanged) |
| `If10`[out 1 FALSE] | **→ `If9`** | **→ `is-escalation-declined`** (rerouted) |
| `is-escalation-declined`[out 0 TRUE] | (new) | → `tag-escalation-declined` |
| `is-escalation-declined`[out 1 FALSE] | (new) | → `If9` (clarify chain intact) |
| `tag-escalation-declined`[out 0] | (new) | → `escalate-catalog` |

Post-edit, the ONLY inbound edge to `If9` is `is-escalation-declined`[out 1] (the old `If10`→`If9` edge is removed) — confirmed by a full connections scan. A genuine casual/clarify turn (no `escalation_declined`) takes the IF FALSE arm → `If9` → `Basic LLM Chain` unchanged (V8 guard). A decline takes TRUE → `tag-escalation-declined` → `escalate-catalog`(`escalation_declined`) → `cs-offer-gate` FALSE arm (`is_escalate_offer=false`) → `compile-current-state` (`response='Escalation declined.'`) → existing guarded send `sorento-sub-respond-sendmsg-respond2`. `Basic LLM Chain` never reached (Gap B).

## Zero-egress / safety notes (§10)
- Decline path = canned text → `escalate-catalog` → `cs-offer-gate`(FALSE) → `compile-current-state` → guarded sendmsg sub (short-circuits on `is_test=true`) + `guard-d-record` + `session-save-gate`. It does NOT touch `Call 'sub-human-intervention'`, `Assign or unassign a Conversation1`, any SLA POST, any PIC comment, or the assignee-queue push. §0 S1–S6 preserved.
- Retarget (row 5/6) still routes via `If2`→human-intervention fork `vUfFUDjLAuMaeQE6` (guarded, `is_test=true`) — unchanged.
- No sub-call site changed; `is_test` threading unchanged. New nodes are pure logic (IF/Set) + a canned switch case — nothing to strip for a later user-gated promotion to live spine `9qVyfUxmRQqrpGRMDLRuz`.
- All validation warnings on both workflows are pre-existing (hardcoded x-api-key, the deliberately-orphaned egress nodes, `Transcribe` prefix, `builtInTools`, `Postgres Chat Memory` disconnected) — LESSON 13, unchanged by this edit.

## Verification pointers (tester)
- Run rows 4 & 5 on the REAL fork (OMIT `mock_reformulator_output`), seeded member_offer state per plan §7, contact `437264483`, `mode=regress-capture`.
- V6/row4: final reply EXACTLY `"Escalation declined."`; `$('Basic LLM Chain').isExecuted===false`; `tag-escalation-declined` + `escalate-catalog`(kind=`escalation_declined`) executed; `cs-offer-gate` FALSE arm; no assign/SLA/PIC egress.
- V7/row5: fork emits `message_type='request_for_help'` + `is_affirmative=false` + `routing.suggested_team='warehouse'`; Tier-1 retarget → same final state as row 6.
- V8: a genuine non-decline casual/unknown turn still reaches `Basic LLM Chain`.
- V9: decline row produces only a `would_send` for the canned reply; zero assign/SLA/PIC/human-intervention/CRM-write.

---

# §10 follow-up — prompt skip-removal (root-cause fix for row 5 `"no, I want warehouse"` misclassification)

**Change-id:** `member-offer-retarget-fix` §10 follow-up
**Target edited (single node, PROMPT-ONLY):** reformulator FORK `CpxE8LroLzCkrAQN` › node `AI Agent` (id `cb4f080d-bf4c-41fe-9685-e816d858f198`), `parameters.options.systemMessage`. NO other node/param/connection touched.
**Versioning:** pre-edit active `a5900ed0-551e-41d3-b99c-8cb63e047b9f` → pushed draft `1bee1ff5-…` (systemMessage sha-verified `d8bfbf4b…` byte-identical to intended) → **published**, new `activeVersionId = 1bee1ff5-0e69-476d-9297-ee9c5ada1601`.
**Untouched (verified by param-sha):** `output_exchange` (id `acabbc05-acfa-4500-ad6f-a7068ec9cb38`) jsCode sha `66424d14…` PRE==POST (as of the a5900ed0 version — escalation_declined arm kept as-is); whole-node param-sha diff PRE→POST shows ONLY `cb4f080d` changed. Clone spine `txiPzSxy3Pclsz6v` (active `45f67ec0`) NOT touched — decline branch kept as-is. Live sub `XTODTw-dJcV0uRdC056hG` and live spine `9qVyfUxmRQqrpGRMDLRuz` NOT touched.

## Root cause
`"no, I want warehouse"` was 3× deterministically classified `casual` (never `request_for_help`; warehouse never surfaced; Tier-1 retarget could not fire). The MESSAGE TYPE section opened with a **skip clause** (systemMessage L137): a reply to a closed answer / option-choice / escalation reply → "use that and skip this test." A member_offer is a closed answer, so the whole message_type test (incl. request_for_help at step 1) was skipped for offer replies. Since the escalation decision now lives in CODE (`output_exchange` reads `selection_context=member_offer` + `is_affirmative`), the LLM must stop forcing message_type from context and emit honest, orthogonal signals. 4 surgical prompt edits (systemMessage only) — the full 390-line message differs from the prior version on EXACTLY these 4 hunks (diff-verified; no box-char/cosmetic drift).

### Edit A — kill the skip (L137)
**Before:**
> If the CONTEXT OF THE PREVIOUS TURN rules already determined message_type (a bare reply to a closed answer, an option-choice, or an escalation reply), use that and skip this test.

**After:**
> Your previous response (an offer/question vs a delivered answer) is CONTEXT ONLY. ALWAYS classify message_type from the current message's own content using the test below — never skip it. Whether a reply accepts or declines a prior offer is reconciled DOWNSTREAM by code from is_affirmative + selection_context; your job is only honest classification. message_type and is_affirmative are INDEPENDENT axes — a leading "no" sets is_affirmative=false but does NOT by itself force casual.

**Intent:** removes the short-circuit that skipped the message_type test (incl. step-1 request_for_help) for closed-answer replies; makes message_type content-driven and orthogonal to is_affirmative so a leading "no" no longer forces `casual`.

### Edit B — broaden step 1 / request_for_help (L140)
**Before:**
> 1. If the user explicitly asks for a human/agent/staff to help → message_type = "request_for_help". still populate intent_hint, domain_hint, and entities from any topic the user mentions, so the human agent has context. If the user only asks for help with no topic, leave them null/[].

**After:**
> 1. If the user asks for a human/agent/staff OR a specific team/department to help/handle it → message_type = request_for_help. This is content-driven and fires even if the message also declines a prior offer (still emit is_affirmative=false in that case). Still populate intent_hint/domain_hint/entities from any topic; if only asking for help with no topic, leave them null/[].

**Intent:** step 1 now also fires when the user names a team/department (not only "human/agent/staff"), and fires orthogonally to a decline (still emits `is_affirmative=false`). So `"no, I want warehouse"` → `request_for_help` while remaining a decline.

### Edit C — remove the redundant decline clause (L147)
**Before (tail added in §10 Part 1):**
> …even if they also mention a product or order. request_for_help also takes priority even when the message is a DECLINE. If the user declines the offered option but names a DIFFERENT team/department/human to route to, classify message_type=request_for_help, STILL emit is_affirmative=false, and set routing.suggested_team to the named team. A decline that names NO team ("no thanks") stays is_affirmative=false with message_type NOT request_for_help.

**After (tail deleted; original sentence retained):**
> …even if they also mention a product or order.

**Intent:** the decline-specific special-casing is superseded by the content-driven step-1 (Edit B) + the skip removal (Edit A); the paragraph reverts to its original priority sentence. No behavior lost — the new step-1 already covers the "declines but names a team" case generically.

### Edit D — routing always maps (ROUTING section, after the derivation rule ~L267)
**Added (one sentence appended to the routing-derivation paragraph):**
> …downstream re-applies the previous routing when these are null. ALWAYS evaluate suggested_team. Whenever the user names a team/department — even while declining a prior offer — map it to the routing enum and set suggested_team. This is not gated on message_type or on the previous turn.

**Intent:** guarantees `suggested_team` is always derived when a team is named, independent of message_type / the previous turn — so a mid-offer decline that names `warehouse` still emits `routing.suggested_team='warehouse'` for the code retarget arm. Existing team→enum mappings unchanged.

## Guardrail confirmations
- Access-level rule (systemMessage L181 "office version" → access_levels, NEVER request_for_help) preserved verbatim — with the skip gone it still holds (grep-confirmed present post-edit).
- Cosmetic dividers (`━` box chars) preserved exactly; full-systemMessage diff shows ONLY the 4 intended hunks (L137, L140, L147, L267→267-270), no box-char/whitespace drift.
- Only the fork `AI Agent` node changed. `output_exchange` escalation_declined arm untouched (sha-identical). Clone spine decline branch untouched. Live sub/spine untouched.
- No promotion, no UAC runs performed. update_workflow returned only pre-existing validation warnings (Postgres Chat Memory disconnected, OpenAI builtInTools — LESSON 13).

---

# §10 follow-up (2) — `output_exchange` decline-clobber ordering fix (defer to request_for_help retarget)

**Change-id:** `member-offer-retarget-fix` §10 follow-up (2)
**Target edited (single node, ONE line):** reformulator FORK `CpxE8LroLzCkrAQN` › node `output_exchange` (id `acabbc05-acfa-4500-ad6f-a7068ec9cb38`), `parameters.jsCode`. NO other node/param/connection touched.
**Versioning:** pre-edit active `1bee1ff5-0e69-476d-9297-ee9c5ada1601` → **published**, new `activeVersionId = e84d14aa-754a-4082-9bb6-318278dd4b7d`.
**Leaf sha gate:** `output_exchange.jsCode` PRE `7f42b44b…` → POST `7baf153c1d2a34b1fe176b516f0b0d902fa89d431911fb493fca483fbc530a17` — byte-diff PRE→POST is EXACTLY the one condition line below (whole-node `diff` vs the live original shows no other/cosmetic drift; the added trailing-newline slip from an interim draft was corrected — final leaf has no trailing newline, matching the original). Node params keys remain `["jsCode","mode"]`.
**Untouched (verified by sha):** `AI Agent` (id `cb4f080d-bf4c-41fe-9685-e816d858f198`) `systemMessage` sha `d8bfbf4b…` PRE==POST (the "1bee1ff5 is correct" prompt, byte-identical). Clone spine `txiPzSxy3Pclsz6v` NOT touched. Live sub `XTODTw-dJcV0uRdC056hG` and live spine `9qVyfUxmRQqrpGRMDLRuz` NOT touched.

## Root cause (tester-located, exact)
The §10-follow-up prompt refactor made the LLM emit, for row 5 `"no, I want warehouse"`: `message_type=request_for_help` + `is_affirmative=false` + `routing.suggested_team=warehouse` (correct, orthogonal axes). But the OLDER general-decline block near L411 runs **before** `_reqHelp` is captured (L452) and stamps `message_type='casual'`, so by L452 `_reqHelp=false` and the Tier-1 retarget guard (`_reqHelp && _llmTeamN && _llmTeamN !== _priorTeam`, L507) was dead. Row 6 (`"can i escalate to warehouse team?"`, `is_affirmative=null`) skipped this block (`isDecline` false) and retargeted fine — isolating the bug to this clobber.

### Edit — L411 condition (the ONLY changed line)
**Before:**
```js
} else if (offeredEscalation && isDecline && !_isPositionPick) {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}
```
**After:**
```js
} else if (offeredEscalation && isDecline && !_isPositionPick && output.output.message_type !== 'request_for_help') {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}
```
**Why:** a decline that is actually a team-retarget (LLM emits `message_type=request_for_help`) must skip this early `casual` clobber so `message_type` survives to L452, where `_reqHelp` captures the un-clobbered value and the Tier-1 retarget arm fires. Ordering: the general decline-clobber must **defer** to a `request_for_help` retarget. A plain decline (`message_type` NOT `request_for_help`) still enters the block exactly as before.

## Must-not-regress (verified by tracing the post-edit code paths)
- **Row 4** `"no thanks"` (casual, `is_affirmative=false`, no team): L411 condition still true (`'casual' !== 'request_for_help'`) → enters block → then member_offer Tier-2 `is_affirmative===false` arm emits `escalation_declined:true` → spine "Escalation declined." **UNCHANGED**.
- **Row 5** `"no, I want warehouse"` (now `message_type=request_for_help`): L411 condition false → block skipped → `message_type` stays `request_for_help` → L452 `_reqHelp=true`, `_llmTeamN='warehouse'` → L507 Tier-1 RETARGET (`warehouse !== customer_service`) → `routing.suggested_team='warehouse'`, `retarget_team:true`. **FIXED**.
- **Rows 1/2/3** (position pick / person_mention / `yes`): `isDecline` is false (or affirmative branch), so L411 was never entered — the added `&&` clause only tightens the already-false decline branch. **Unaffected.**
- `_reqHelp` capture (L452) still executes and the Tier-1 guard (L507) reads the un-clobbered `message_type` on the retarget path — confirmed by trace (no intervening node clobbers `request_for_help`→other when `domain_hint` is null, which it is for these help turns).

## Zero-egress / promotion notes (reviewer)
- Pure-parse change inside the reformulator fork. A resolved retarget/decline becomes an `escalation`/`routing` payload consumed only by the guarded human-intervention fork `vUfFUDjLAuMaeQE6` (`is_test=true` short-circuit) / the spine's canned "Escalation declined." decline branch → guarded sendmsg sub. No egress node, sub-call site, or `is_test` threading touched. §0 S1–S6 preserved.
- **Live promotion of this member_offer fix must ship BOTH** the `AI Agent` systemMessage (the "1bee1ff5" prompt refactor) **AND** this `output_exchange` L411 guard — they are interdependent (the prompt makes the LLM emit `request_for_help` for a team-decline; this guard lets that survive to the retarget arm). Shipping only one regresses row 5.
- No promotion, no UAC runs performed (tester's job). update_workflow returned only pre-existing validation warnings (Postgres Chat Memory disconnected, OpenAI builtInTools — LESSON 13).

---

# §10 follow-up (3) — string-"null" domain_hint coercion + hoisted raw-signal capture (deterministic row-5 fix)

**Change-id:** `member-offer-retarget-fix` §10 follow-up (3)
**Target edited (single node, `output_exchange` jsCode only):** reformulator FORK `CpxE8LroLzCkrAQN` › node `output_exchange` (id `acabbc05-acfa-4500-ad6f-a7068ec9cb38`), `parameters.jsCode`. NO other node/param/connection touched.
**Versioning:** pre-edit active `e84d14aa-754a-4082-9bb6-318278dd4b7d` → pushed draft (leaf sha-verified `f092f0e9…` byte-identical to intended local copy) → **published**, new `activeVersionId = e10c539e-d346-4074-b3ba-56db98b5cf86` (versionId==activeVersionId, no stale draft).
**Leaf sha gate:** `output_exchange.jsCode` PRE `7baf153c1d2a34b1fe176b516f0b0d902fa89d431911fb493fca483fbc530a17` (== §10 follow-up (2) POST, confirming baseline) → POST `f092f0e9074152b0f8e36054a41504b767261b68d79d6cecdbc17090846cef8b`. No trailing newline (matches original leaf). Params keys remain `["jsCode","mode"]`.
**Untouched (verified by sha):** `AI Agent` (id `cb4f080d-bf4c-41fe-9685-e816d858f198`) `systemMessage` sha `d8bfbf4bf74d735ddd4db7ff20b86a068d06693072fdfded7f2e1eb7dcbaec91` PRE==POST (the "1bee1ff5 correct" prompt, byte-identical). Clone spine `txiPzSxy3Pclsz6v` NOT touched. Live sub `XTODTw-dJcV0uRdC056hG` and live spine `9qVyfUxmRQqrpGRMDLRuz` NOT touched.

## Root cause (tester-located, non-deterministic 2/3 pass)
For row 5 `"no, I want warehouse"` the LLM correctly emits `message_type:request_for_help` + `is_affirmative:false` + `routing.suggested_team:warehouse`. But ~1/3 of samples it emits `domain_hint` as the LITERAL STRING `"null"` (not JSON null). At the domain block (`if (output.output.domain_hint)`) the string `"null"` is TRUTHY → it clobbered `message_type='business_query'`. That clobber runs AFTER the §10 follow-up (2) L411 decline guard but BEFORE the `_reqHelp` capture (old ~L452) → `_reqHelp` read the clobbered `business_query` → `false` → the Tier-1 retarget guard (`_reqHelp && _llmTeamN && …`) was dead → fell through Tier-2 `is_affirmative===false` → decline → "Escalation declined." Same **ordering class** as the L411 bug: multiple `message_type` mutations happen before `_reqHelp` is read. Row 6 (`is_affirmative=null`, `domain_hint` typically real-null) escaped this and retargeted, isolating the bug to the string-"null" clobber + late capture.

## Fix 1 — coerce string-"null"/"" hints to real null immediately after parse
Added, right after the `output.output` parse block (uses the existing `norm(v)` = null for `null`/`undefined`/`'null'`/`''`):
```js
output.output.domain_hint = norm(output.output.domain_hint);
output.output.intent_hint = norm(output.output.intent_hint);
```
**Why / effect:** makes the literal string `"null"` read as real `null` everywhere downstream — the domain→business_query clobber no longer mis-fires, and no other code (`deriveRouting`, the blocklist, `_isNewQuery`) mis-treats the string. `norm()` passes REAL domains through untouched (only `"null"`/`""`/`undefined` become null), so Tier-3 new-query-abandon for rows with a genuine domain (rows 7/8) is unaffected. `intent_hint` coerced for the same hygiene (intent gates elsewhere).

## Fix 2 — hoist the raw-signal capture ABOVE all message_type mutations
Moved the capture of the LLM's raw classification + routing to the TOP of processing (right after parse, before the decline block and the domain block), and DELETED the two later duplicate captures (was ~L442-444 `_llmTeamRaw`/`_llmAgentRaw`, and ~L452-454 `_reqHelp`/`_llmTeamN`/`_llmAgentN`) so there is a single source of truth:
```js
const _llmMsgTypeRaw = output.output.message_type;          // raw LLM classification, pre-mutation
const _reqHelp       = _llmMsgTypeRaw === 'request_for_help';
const _llmTeamRaw    = output.output?.routing?.suggested_team;
const _llmAgentRaw   = output.output?.routing?.suggested_agent;
const _llmTeamN      = norm(_llmTeamRaw);
const _llmAgentN     = norm(_llmAgentRaw);
```
The existing Edit-1 routing-preference (`const suggested_team = (_reqHelp ? _llmTeamN : null) ?? …`) and the Tier-1 retarget guard (`if (_reqHelp && _llmTeamN && _llmTeamN !== _priorTeam)`) now consume THESE hoisted vars. The retarget intent is therefore immune to ALL downstream `message_type` clobbers (the decline block, the domain→business_query block, position-pick reclassifies).

**Also — L411 decline guard simplified** (equivalent, cleaner): `… && output.output.message_type !== 'request_for_help'` → `… && !_reqHelp`. Row 4 casual: `_reqHelp=false` → `!_reqHelp=true` → still enters the decline block (unchanged). Row 5 request_for_help: `_reqHelp=true` → skips (unchanged from §10 follow-up (2)).

**Retarget arm unchanged (already correct):** it still sets `escalation = { is_escalation_confirmation:true, retarget_team:true }` (If2 fires on `is_escalation_confirmation` regardless of message_type) and `output.output.message_type='request_for_help'`.

## Exact diff (only these 3 hunks; whole-node `diff` vs the live e84d14aa original shows no other/cosmetic drift)
1. **Insert after the parse block** (`}` closing the `$json.output` if/else): a comment header + the 6-line hoisted capture (Fix 2) + the 2-line hint coercion (Fix 1).
2. **Decline guard condition:** `!_isPositionPick && output.output.message_type !== 'request_for_help'` → `!_isPositionPick && !_reqHelp`.
3. **Remove the two later duplicate captures** (`_llmTeamRaw`/`_llmAgentRaw`; and `_reqHelp`/`_llmTeamN`/`_llmAgentN`), replaced by single-line comments noting the hoist. The ternary-explanation comment above `suggested_team` is retained.

Each of `_reqHelp`, `_llmTeamRaw`, `_llmAgentRaw`, `_llmTeamN`, `_llmAgentN`, `_llmMsgTypeRaw` is declared EXACTLY once (grep-confirmed — no `const` redeclaration). `node --check` passes.

## Must-not-regress (traced against the post-edit code)
- **Row 4 `"no thanks"`** (raw message_type casual, is_affirmative=false, no team, domain null): Fix1 leaves domain null; `_reqHelp=false`; L411 `!_reqHelp=true` → enters decline block → `message_type='casual'` → member_offer Tier-2 `is_affirmative===false` arm emits `escalation_declined:true` → spine "Escalation declined." **UNCHANGED**.
- **Row 5 `"no, I want warehouse"` — BOTH samples** (string-"null" AND real-null domain): Fix1 coerces domain to null; domain block does NOT clobber; `message_type` stays `request_for_help`; `_reqHelp=true` (hoisted raw); `_llmTeamN='warehouse'`; Tier-1 RETARGET (`warehouse !== customer_service`) → `routing.suggested_team='warehouse'`, `retarget_team:true`, selection_context null, last_result_set []. **DETERMINISTIC across samples now (FIXED)**.
- **Rows 1/2/3** (position pick / person_mention / `yes`): `_reqHelp=false` (LLM not request_for_help); picks resolve via `_pos`/`_pm`/affirmative in Tier 2 as before. **Unaffected.**
- **Rows 7/8** (new-query abandon, REAL domain e.g. `promotion`/`order`): `norm` passes the real domain through → domain block sets `business_query` as before → `_isNewQuery=true`, `_reqHelp=false` → Tier-3 abandon; routing = derived (ternary yields null on non-help path). **Unaffected** — coercing to null does NOT break Tier-3 for a real domain (norm only nulls `"null"`/`""`/`undefined`).

## Scope-broadening note (for tester/reviewer awareness)
Because `_reqHelp` is now captured from the RAW pre-mutation `message_type`, the Edit-1 routing-preference (`(_reqHelp ? _llmTeamN : null) ?? …`) now ALSO fires for a `request_for_help` turn that carries a REAL `domain_hint` (previously the domain→business_query clobber made `_reqHelp=false`, leaving that preference inert for those turns). This is the ORIGINALLY-INTENDED Edit-1 behavior ("the LLM's team wins on a request_for_help turn"), and downstream `message_type` for such turns is still `business_query` (the domain clobber still runs). Net effect: on an explicit-help-with-topic turn, `routing.suggested_team` now prefers the LLM's emitted team over `deriveRouting`; the two are normally identical for a given domain. The regression harness will surface any unexpected diff. No new egress; routing is consumed only by the guarded human-intervention fork `vUfFUDjLAuMaeQE6` (`is_test=true` short-circuit).

## Zero-egress / promotion notes (reviewer)
- Pure-parse change inside the reformulator fork. A resolved retarget/decline becomes an `escalation`/`routing` payload consumed only by the guarded human-intervention fork `vUfFUDjLAuMaeQE6` (`is_test=true` short-circuit) / the spine's canned "Escalation declined." decline branch → guarded sendmsg sub. No egress node, sub-call site, or `is_test` threading touched. §0 S1–S6 preserved.
- **Live promotion of the member_offer fix must ship the `AI Agent` systemMessage (the "1bee1ff5" prompt refactor) AND the FULL `output_exchange` fix stack** — the §10 follow-up (2) L411 guard + this §10 follow-up (3) string-"null" coercion + hoisted capture — as one interdependent unit. Shipping a subset regresses row 5.
- No promotion, no UAC runs performed (tester's job). update_workflow returned only pre-existing validation warnings (Postgres Chat Memory disconnected, OpenAI builtInTools — LESSON 13).

## Verification pointers (tester)
- Run row 5 `"no, I want warehouse"` on the REAL fork (OMIT `mock_reformulator_output`), seeded member_offer state, `mode=regress-capture`, MULTIPLE samples to catch the string-"null" emission. Assert: fork emits `routing.suggested_team='warehouse'`, `escalation.retarget_team===true`, `selection_context===null` — deterministically across samples. Row 6 unchanged.
- Row 4 `"no thanks"`: final reply EXACTLY "Escalation declined." (Basic LLM Chain not executed) — unchanged.
- Rows 7/8 real-domain new-query: still classify `business_query`, Tier-3 abandon, no wrong assign.
