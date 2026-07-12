# Plan — member_offer entry-gate fix: retarget / reachable decline / new-query abandon

> **STATUS: PLAN. Docs only — no workflow edited, no execution run.**
> **Build/test target = the reformulator FORK the clone calls: `CpxE8LroLzCkrAQN`**
> (`sub-query-reformulator TEST rebase`, active `versionId b86ad57d-6695-4d97-ab18-0b458891b93c`,
> confirmed via REST `GET /workflows/CpxE8LroLzCkrAQN`, 2026-07-06). **NOT** live `XTODTw-dJcV0uRdC056hG`.
> **Promote-to-live target (later, user-gated, guards stripped) = live sub `XTODTw-dJcV0uRdC056hG`.**
> Reformulator is pure-parse, zero egress; a resolved pick / retarget becomes an `escalation` payload
> consumed only by the human-intervention sub, which short-circuits on `is_test=true` on the clone → no
> real assign ever fires (§0 / S2).

**Target node (single):** `output_exchange` (Code, `n8n-nodes-base.code`, jsCode ~31 034 chars) in
fork `CpxE8LroLzCkrAQN`. The **Δ3 CS member-pick override** block (`if (_selCtx === 'member_offer')`,
opens at **line 455**) plus the **routing-derivation** block (**lines 442–449**, "Edit 1").

**Change-level scope:** `parser` (see §6). The new arms depend on genuine LLM classification
(`message_type=request_for_help`, `routing.suggested_team`, `person_mention`, `is_affirmative`), so a
`mock_reformulator_output` injection bypasses the whole reformulator and cannot exercise them (LESSON 28).
The pure code logic is additionally offline-unit-testable (§8 V0).

---

## 1. Problem (verified live on fork `CpxE8LroLzCkrAQN`, zero-egress)

When a contact is mid **member_offer** (bot offered CS members to escalate an order enquiry: "pick 1-5:
Ms Tan / Sandy Lim / Lin / Nur / Emily"), the `if (_selCtx === 'member_offer')` block mishandles any reply
that is not a clean number/name pick. Three defects, all in this one block:

### 1.1 Greedy raw-text name arm shadows the affirmative arms (root cause — verified line 486)
```js
486   const _pm = (typeof _o.person_mention === 'string' && _o.person_mention.trim()) ? _o.person_mention : _rawReply;
...
497   } else if (_pm.trim()) {            // name-resolution arm — fires for ANY worded reply
...
517   } else if (output.output.is_affirmative === true)  { ... }   // UNREACHABLE for worded replies
519   } else if (output.output.is_affirmative === false) { ... }   // UNREACHABLE for worded replies
```
Because `_pm` falls back to `_rawReply` (the whole user message), the `_pm.trim()` arm is truthy for every
non-empty worded reply. It runs the member-label match, gets 0 hits, and drops to `member_reprompt:'out_of_range'`
(line 514). This **shadows** the `is_affirmative===true` (yes → round-robin) and `is_affirmative===false`
(no → cancel) arms below it — they are effectively dead code for any reply that is not a bare number.

### 1.2 No retarget arm; LLM's named team is discarded (verified lines 442–449)
```js
442   const derived = output.output.domain_hint ? deriveRouting(output.output) : { suggested_team: null, suggested_agent: null };
446   const suggested_team  = norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
449   output.output.routing = { suggested_team, suggested_agent };   // ← overwrites the LLM's fresh routing
```
`priorRouting = parent_input.previous_conversation_state.routing` (line 394). For a `request_for_help` reply
with **no** `domain_hint`, `derived = {null,null}` → `suggested_team` falls to `priorRouting.suggested_team`
(the offer's `customer_service`). **The LLM's fresh `output.output.routing.suggested_team` (e.g. `warehouse`)
is never consulted, and line 449 then clobbers it.** So a mid-offer "route me to warehouse instead" loses the
warehouse target and re-uses `customer_service`.

### 1.3 `_isNewQuery` escape is too narrow (verified line 469)
```js
469   const _isNewQuery = _o.domain_hint && Array.isArray(_o.entities) && _o.entities.some(e => e.current_message === true) && _o.is_affirmative !== true;
```
It requires a `domain_hint` **AND** a current-message entity. A real question with a domain but no extracted
entity (e.g. "show me all promotions", "what can you do" → `clarification`, no entity) fails the gate, so the
offer is not abandoned and the reply is force-processed as a (failed) member pick → `out_of_range` re-offer loop.

### Confirmed net effects (from the problem, reproduced on the clone, zero egress)
- `"can i escalate to warehouse team?"` and `"don't want, i want warehouse team to assist"` → LLM correctly
  emits `message_type=request_for_help` + `routing.suggested_team=warehouse`, but §1.1 clobbers to the
  `out_of_range` name-miss arm and §1.2 discards `warehouse` and re-uses `customer_service` → **infinite CS
  re-offer**, warehouse never honored.
- Bare `"no thanks"` / bare `"yes"` → shadowed by §1.1 → never reach the cancel / round-robin arms.

## 2. Confirmed downstream facts (NO downstream change needed — from the change request, spot-checked)

- **`Call 'sub-human-intervention'` passes `team = reformulator.output.routing.suggested_team` verbatim** →
  sub's `get-round-robin-assignee` → `/api/v1/external/next-assignee` with that `team_code` → direct
  round-robin assign. So honoring `suggested_team` in `output_exchange` is **sufficient**; `warehouse` is a
  valid team. No member roster is built for a retargeted team — same terminal state as a fresh
  `request_for_help` to that team.
- **Clone `If2` escalate gate** fires on `is_escalation_confirmation==true` **OR**
  (`message_type=='request_for_help' && domain_hint!='portal_link'`). So a retarget that keeps
  `message_type=request_for_help` (and no `portal_link`) routes to escalation regardless.
- The human-intervention sub the clone actually calls is the **guarded fork `vUfFUDjLAuMaeQE6`**
  (short-circuits on `is_test=true`) — no real assign in test (§0 / S2).

## 3. Desired behavior — member_offer entry-gate precedence (formalized)

All four tiers live inside `if (_selCtx === 'member_offer')`, checked in this order:

| # | tier | trigger | action |
|---|---|---|---|
| 1 | **retarget** | `message_type==='request_for_help'` AND LLM team present AND LLM team ≠ prior team | abandon CS offer, DIRECT-assign new team (no roster) |
| 2 | **pick signal** | number/position (`_pos`) OR `person_mention` present OR `is_affirmative===true\|false` | pick idx / round-robin CS / cancel |
| 3 | **new query** | `domain_hint` set OR `message_type==='business_query'` OR `message_type==='clarification'` (and not affirmative) | abandon offer → normal processing answers |
| 4 | **else (junk)** | no signal | `out_of_range` reprompt |

Precedence note: `_forcePick` (bare number, or a ≤3-word reply that exactly matches a member label — lines
478–483) still **outranks** tier 3, preserving the shipped protection where a bare number/name in an open
offer is always a pick even if the LLM speculatively assigned a domain (LESSON 39).

### 3.1 Tier 1 — retarget (new arm, top of the block)
- Fires when: `_o.message_type === 'request_for_help'` AND `_llmTeam` truthy AND `_llmTeam !== _priorTeam`,
  where `_priorTeam = norm(priorRouting.suggested_team) || 'customer_service'` (the team the offer belongs to)
  and `_llmTeam = norm(_llmTeamRaw)` — see the **ordering caveat §3.4**.
- Set: `message_type = 'request_for_help'`; `routing.suggested_team = _llmTeam` (the REAL named team, **NOT**
  hardcoded warehouse); `routing.suggested_agent` = keep LLM's if present else `'general_enquiries'`;
  `escalation = { is_escalation_confirmation: true, retarget_team: true }`; **clear** `selection_context`
  (set null/undefined) and `last_result_set` (`[]`); `member_pick_context = false`. Then **skip the rest of
  the member block** (do not fall into the pick arms).

### 3.2 Tier 2 — pick signals (make the affirmative arms reachable)
- **Fix §1.1:** change line 486 to key on `person_mention` presence only — drop the `: _rawReply` fallback:
  ```js
  const _pm = (typeof _o.person_mention === 'string' && _o.person_mention.trim()) ? _o.person_mention.trim() : '';
  ```
  Now the `_pm.trim()` name arm fires **only** when the LLM extracted an actual person name, so the
  `is_affirmative===true` (round-robin, no `preferred_assignee_id`) and `is_affirmative===false`
  (cancel, `message_type='casual'`) arms below become reachable for bare "yes" / "no thanks".
- Number/position (`_pos`) arms and the name-resolution arm (lines 487–516) are **unchanged** in logic.

### 3.3 Tier 3 — new-query abandon (broaden `_isNewQuery`)
- **Fix §1.3:** broaden line 469 to fire on a real question WITH OR WITHOUT an entity:
  ```js
  const _isNewQuery = (!!_o.domain_hint || _o.message_type === 'business_query' || _o.message_type === 'clarification')
                      && _o.is_affirmative !== true;
  ```
  (Line 426 already sets `message_type='business_query'` whenever `domain_hint` is set, so `domain_hint` and
  `business_query` are near-equivalent; both are listed for belt-and-suspenders, plus `clarification` for the
  "what can you do" class that has no domain.) Keep `is_affirmative !== true` so a bare "yes" is NOT eaten as
  a new query. On new-query, **abandon**: do not run the pick arms, leave `escalation`/`entities`/`routing`
  as the LLM/deriveRouting produced them, `member_pick_context` stays false → normal processing answers.

### 3.4 ORDERING CAVEAT (must-do, or the fix silently no-ops)
Capture the LLM's raw team **before** line 442, because line 449 overwrites `output.output.routing`:
```js
const _llmTeamRaw = output.output?.routing?.suggested_team;   // capture at the TOP, before deriveRouting
```
Read `_llmTeamRaw` in both Edit 1 (§3.5) and the retarget arm (§3.1). If captured after line 449 it is the
derived/prior team, not the LLM's named team → the retarget never triggers.

### 3.5 Edit 1 — routing preference for request_for_help (lines 442–449)
For a `request_for_help` turn with a valid LLM team, that team wins over `deriveRouting`/prior; null falls
back to prior. This makes even a **fresh** (non-offer) `request_for_help` honor the named team, and it is the
routing value the retarget arm relies on:
```js
const _reqHelp   = output.output.message_type === 'request_for_help';
const _llmTeamN  = norm(_llmTeamRaw);
const suggested_team = (_reqHelp ? _llmTeamN : null)   // ← TERNARY, not `_reqHelp && _llmTeamN` (see caveat)
  ?? norm(derived.suggested_team)
  ?? norm(priorRouting.suggested_team)
  ?? 'customer_service';
```
> **`&&` vs `??` bug (must avoid):** `(_reqHelp && _llmTeamN) ?? …` is wrong — when `_reqHelp` is `false`,
> `false && x === false`, and `false ?? y === false` (false is neither null nor undefined) → poisons the
> chain. Use the **ternary** `(_reqHelp ? _llmTeamN : null)` so a non-help turn yields `null` and the
> nullish-coalescing chain proceeds to `derived`/`prior`/default.

## 4. Regression / golden handling
- `retarget_team` and the cleared `selection_context` are **only** emitted on member_offer + request_for_help
  + team-change turns — a vanishingly small slice; no historical golden exists (new behavior). Capture the §5
  UAC turns fresh as the new golden for this change (per LESSON 41; use a dedicated `regress-capture` driver;
  synthetic `chat_histories` FK rows tagged distinctly and excluded from full-corpus capture).
- Off member_offer, Edit 1 (§3.5) is **inert unless** `message_type==='request_for_help'` AND the LLM emitted
  a team — assert no `routing`/`escalation` deltas vs golden on non-help, non-offer turns (V4).

## 5. Verification tasks (plan §6 equivalent)
- **V0 (offline, cheapest, 0-token):** `output_exchange` Δ-code unit. Feed synthetic `output.output` +
  member_offer `previous_conversation_state` (routing `customer_service`, 5-member `last_result_set`) and
  assert the tier outcome for each of the 10 UAC rows' *code* behavior (with `person_mention`/`domain_hint`/
  `message_type`/`is_affirmative`/`routing.suggested_team` set as the real LLM would emit). Covers: retarget
  fires only when team ≠ prior; `_pm` no longer swallows worded replies; affirmative arms reachable; broadened
  `_isNewQuery` abandons; `_llmTeamRaw` captured pre-442; the ternary-not-`&&` in Edit 1.
- **V1 (parser, e2e on fork):** rows 1–10 via the real rebased fork `CpxE8LroLzCkrAQN` (OMIT
  `mock_reformulator_output`), seeded member_offer state. Assert final `message_type`,
  `routing.suggested_team`, `escalation`, `member_pick_context`, and abandon/answer/reprompt per §UAC.
- **V2 (retarget team fidelity):** row 5/6 → `routing.suggested_team === 'warehouse'` (the REAL LLM team),
  `escalation.is_escalation_confirmation===true`, `escalation.retarget_team===true`,
  `selection_context` cleared, `last_result_set` empty.
- **V3 (shipped-behavior regressions must NOT break):** number pick (row 1 → idx2 `preferred_assignee_id`),
  name pick (row 2 → Nur), Bug-2 digit-mining guard (row 8 `SRTKT72SS` must abandon, NOT mine `72` as a
  position → no `out_of_range` from digit-mining).
- **V4 (sampled regression):** Edit 1 inert on non-help/non-offer turns; no `routing`/`escalation` deltas.
- **V5 (zero-egress, EVERY case):** §0 S1–S6, **S2 focus** — human-intervention fork short-circuited; NONE of
  `Assign or unassign a Conversation1` / SLA POST / PIC comment / assignee-queue push executed for the
  retarget, pick, or round-robin rows.

## 6. Scope / tier / zero-egress
- **`scope: parser`.** The change is INSIDE the reformulator (`output_exchange`), downstream of the AI Agent
  LLM. `mock_reformulator_output` (`test-reformulator-bypass`) replaces the entire reformulator output → it
  bypasses `output_exchange`, so the mock cannot exercise this change (LESSON 28). e2e cases MUST run the real
  rebased fork `CpxE8LroLzCkrAQN` and OMIT `mock_reformulator_output`. Tester tier = `parser` (only the fork's
  own LLM runs; assert `escalation`/`routing` structurally + the branch).
- **Zero egress.** §0 gate; a real assign/SLA/PIC-comment/send is a hard fail + halt.

## 7. Seeding the member_offer state (prerequisite)
Per LESSON 31, injecting `previous_conversation_state` in the redis item does NOT reach the reformulator (it
reads state from `get-session-vars`). **Pre-seed `respond_contacts_test` (in-n8n cred `Dnnofg8Xb27VQOhI`)**
for contact **`437264483`** (Jayson, FULL access — needed so the access gate passes and the turn reaches the
reformulator/escalation), run each case as a single turn in **`mode=regress-capture`**, and **reset the
contact row between independent cases** (never within a sequence). Seed state (matches the offer roster
"Ms Tan / Sandy Lim / Lin / Nur / Emily"):
```json
{ "variables": {
  "selection_context": "member_offer",
  "domain_hint": "order",
  "routing": { "suggested_team": "customer_service", "suggested_agent": "order_enquiries" },
  "last_result_set": [
    { "idx": 1, "label": "Ms Tan",    "uuid": "u-tan",   "respond_user_id": 9001 },
    { "idx": 2, "label": "Sandy Lim", "uuid": "u-sandy", "respond_user_id": 9002 },
    { "idx": 3, "label": "Lin",       "uuid": "u-lin",   "respond_user_id": 9003 },
    { "idx": 4, "label": "Nur",       "uuid": "u-nur",   "respond_user_id": 9004 },
    { "idx": 5, "label": "Emily",     "uuid": "u-emily", "respond_user_id": 9005 }
  ],
  "response": "Which member should I route you to? 1. Ms Tan 2. Sandy Lim 3. Lin 4. Nur 5. Emily"
} }
```
The `routing.suggested_team = customer_service` line is **load-bearing** — it is the `_priorTeam` the retarget
arm compares against; without it, `_priorTeam` defaults to `customer_service` anyway (same value), but seed it
explicitly for fidelity. Synthetic uuids are safe (human-intervention fork guarded).

## 8. Acceptance criteria
1. All 10 UAC rows (§ tests file) pass their functional expectation AND §0 S1–S6.
2. **Shipped-behavior regressions unbroken:** number pick (row 1), name pick (row 2 — resolve to Nur OR safe
   new-query abandon both PASS; resolve to a WRONG member = hard fail, LESSON 39), Bug-2 digit-mining guard
   (row 8 abandons, no `out_of_range` from mining `SRTKT72SS`).
3. Retarget honors the REAL LLM team (row 5/6 → `warehouse`), not a hardcoded value.
4. Bare "yes" reaches round-robin (no `preferred_assignee_id`); bare "no thanks" reaches cancel
   (`message_type='casual'`, no reprompt) — proving §1.1 shadow removed.
5. New questions (rows 7/8/9) abandon the offer and are answered by normal processing.
6. Junk (row 10) still reprompts `out_of_range`.

## 9. Rollout (when approved — user-gated, NOT in this plan)
1. On fork `CpxE8LroLzCkrAQN`: `setNodeParameter output_exchange /jsCode` (byte-exact) with the §3 deltas
   (capture `_llmTeamRaw` pre-442; Edit 1 ternary; retarget arm; `_pm` fix; `_isNewQuery` broaden);
   `publish_workflow CpxE8LroLzCkrAQN` (LESSON 37 — clone references only the published sub).
2. V0 → V1–V5; reviewer confirms zero egress + shipped-regression guards.
3. **Promote (user-gated, guards stripped):** sha-gated byte-exact promotion of the `output_exchange` jsCode
   to **live `XTODTw-dJcV0uRdC056hG`**, then `publish_workflow` (LESSON 24/25); backup prior versionId +
   node body first.

---

# 10. FOLLOW-ON — deterministic reachable-decline (survive-decline parser + spine decline branch)

> **STATUS: PLAN. Docs only — no workflow edited, no execution run.** Extends the §1–§9 change (Edit 1 +
> member_offer 4-tier gate) already SHIPPED to fork `CpxE8LroLzCkrAQN` `output_exchange`.
> **Change-level scope: `parser`** (parts 1 & 2 are inside the reformulator fork; part 3 is a deterministic
> spine edit but is only exercised e2e alongside the real parser — no `mock_reformulator_output`).
> Spine investigation READ-ONLY confirmed against `txiPzSxy3Pclsz6v` (draft==active `versionId`
> 2026-07-06); fork against `CpxE8LroLzCkrAQN` (draft==active `5c4f9478-d6f8-4524-92c8-0a412e4f668b`).

## 10.0 Two gaps this closes (from the 10-row tester run: 9 PASS, zero egress)
- **Gap A (row 5 `"no, I want warehouse"` FAILED):** the parser LLM classified it `message_type=casual`
  (`is_affirmative=false`), never `request_for_help`, so the warehouse team was never surfaced and Tier-1
  retarget could not fire. (Row 6 `"can i escalate to warehouse team?"` already retargets end-to-end because
  it reads as `request_for_help`.)
- **Gap B (declines render via the clarification LLM):** a plain decline (`is_affirmative=false`) is emitted
  as `message_type='casual'`; on the spine `casual` routes to `If9`→`resolve-entity-clarification`→
  `construct-user-prompt`→`parser-bypass-gate`→**`Basic LLM Chain`** (gpt-4.1-mini), i.e. non-deterministic
  placating text (tester saw it run on rows 4/5). Declines must be a FIXED reply, not an LLM improvisation.

## 10.1 Confirmed spine topology (READ-ONLY, `txiPzSxy3Pclsz6v`)
Reformulator-output branch split (each `If` reads `$('Call 'sub-query-reformulator').first().json.output`):

```
check-access → If5(allowed?) ─true→ If2 ─true→ Call 'sub-human-intervention' + tag-out-of-scope   (ESCALATE)
              │                     │
              │                     └false→ If10(output.correction===true) ─true→ tag-escalate-offer (out_of_range REPROMPT / re-offer)
              │                                        │
              │                                        └false→ ▶▶ [INSERT: is-escalation-declined] ▶▶ If9
              └false→ sendmsg-respond5 (NO-ACCESS send)

If9(message_type ∈ {casual, unknown, confirmation} OR (business_query && domain_hint==null)) ─true→
        resolve-entity-clarification → construct-user-prompt → parser-bypass-gate ─false→ Basic LLM Chain ─→ central-exchange
                                                                                  └true (mock)→ mock-parser-output ─→ central-exchange
   └false→ If1(message_type=='clarification') ─true→ tag-clarify-menu   └false→ not-supported-domain
```

**Deterministic-response mechanism (the thing part 3 mirrors):** every escalate/error branch sets ONE
`branch_kind` string on a `tag-*` Set node, all of which fan into **`escalate-catalog`** (Code,
id `escalate-catalog-node`) — a single `switch(kind)` mapping `branch_kind` → canned `response` +
flags (`manualResponse`, `includeResponse`, `is_escalate_offer`). Then `escalate-catalog` →
**`cs-offer-gate`** (id `cs-offer-gate-node`; fires get-cs-members ONLY when
`is_escalate_offer===true && suggested_team=='customer_service' && suggested_agent=='order_enquiries'`) →
**`compile-current-state`** (id `7a130a0c-530f-4bfb-a8f2-059ec71c2ea2`; reads `escalate-catalog`'s
`response`/`manualResponse` when it `isExecuted`) → guarded send `sorento-sub-respond-sendmsg-respond2`
(id `9ce28e9a-ecb8-467a-99a6-5ab76a648212`) + `guard-d-record` + `session-save-gate`. **This whole pipeline
is LLM-free** — the existing `out_of_range` re-offer uses it (`correction:true`→`If10`→`tag-escalate-offer`
→`escalate_offer` catalog case→`cs-offer-gate` TRUE→`build-cs-member-offer`→`compile-current-state`).

**Key node IDs (spine `txiPzSxy3Pclsz6v`):** `If2`=`ed6f8db9-e2c7-41f5-be77-0decedf2950e`,
`If10`=`9e146c74-abf4-4ff8-be00-39eb4487389b`, `If9`=`f6a453f9-7a87-4ab8-8e9e-018de4d7ce84`,
`Basic LLM Chain`=`ae097169-5620-48e3-b1be-901352cc02fe`, `tag-escalate-offer`=`135a1d93-8602-4b71-a018-39e1488b5e70`,
`escalate-catalog`=`escalate-catalog-node`, `cs-offer-gate`=`cs-offer-gate-node`,
`compile-current-state`=`7a130a0c-530f-4bfb-a8f2-059ec71c2ea2`.

## 10.2 Part 1 — parser prompt clause (fork `CpxE8LroLzCkrAQN`, node **`AI Agent`** id `cb4f080d-bf4c-41fe-9685-e816d858f198`, `parameters.options.systemMessage` — NOT `output_exchange`)
Extend the EXISTING `request_for_help` priority rule (systemMessage **line 147**, verbatim today:
*"…It takes priority over business_query, clarification, and casual — if the user asks for human help,
classify as request_for_help even if they also mention a product or order."*). Add ONE clause:

> "…and even if the message is ALSO a decline. If the user declines the offered option but names a
> DIFFERENT team/department/human to route to (e.g. "no, I want warehouse"), classify
> `message_type=request_for_help` AND still emit `is_affirmative=false` AND set `routing.suggested_team`
> to the named team. A decline with NO team named ("no thanks", "no it's okay") stays `is_affirmative=false`
> with `message_type` NOT request_for_help (casual)."

- **ONE clause only** — minimal, faithful-extraction, no new branching. Both signals (`request_for_help`
  and `is_affirmative=false`) coexist; deterministic code reconciles (part 2 / the existing 4-tier gate).
- The `== ROUTING ==` section (systemMessage lines 262–279) ALREADY maps "user explicitly naming a
  team/department" and "domain inventory/warehouse/stock → team warehouse" → `suggested_team='warehouse'`,
  so once `message_type=request_for_help` survives, the named team is already emitted; the clause need not
  re-teach routing, only survival + the is_affirmative coexistence.
- Because this is inside the AI Agent (real LLM), it is invisible to `mock_reformulator_output` → the
  e2e case (UAC row 5) MUST run the real fork.

## 10.3 Part 2 — `output_exchange` decline arm (fork `CpxE8LroLzCkrAQN`, node `acabbc05-acfa-4500-ad6f-a7068ec9cb38`)
In the `if (_selCtx === 'member_offer')` block, the **plain-decline** case — `is_affirmative===false` AND
NOT `request_for_help` AND no position/`person_mention` pick AND no named-team retarget — must set a
DETERMINISTIC decline marker and must NOT set anything that routes to the clarification LLM path other than
the marker the spine now intercepts:
```js
output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
// message_type may remain 'casual' (part-3 spine IF intercepts on escalation_declined BEFORE If9),
// but do NOT set correction:true (that is the out_of_range reprompt) and do NOT set member_reprompt.
```
- `escalation_declined:true` is the flag the spine decline branch (part 3) keys on. It must be present ONLY
  on this plain-decline arm — NOT on retarget (Tier-1, which sets `retarget_team:true`), NOT on the
  `out_of_range` junk reprompt (which sets `correction:true` + `member_reprompt:'out_of_range'`), NOT on picks.
- Retarget (request_for_help + named team ≠ prior) is already handled by Tier-1 (§3.1) and is untouched here.

## 10.4 Part 3 — spine deterministic decline branch (`txiPzSxy3Pclsz6v`; promote later to LIVE spine `9qVyfUxmRQqrpGRMDLRuz`, user-gated)
Mirror the `out_of_range`/`escalate-catalog` mechanism. **Three edits, all deterministic, LLM-free:**

**(a) New IF `is-escalation-declined`** inserted between `If10`(false) and `If9` — the cleanest point: it
sits AFTER escalation (`If2`) and the correction/out_of_range reprompt (`If10`) have had their say, and
BEFORE `If9` can route a `casual` decline into `Basic LLM Chain`.
- Condition (single, boolean-true): `={{ $('Call 'sub-query-reformulator').first().json.output.escalation?.escalation_declined === true }}`
  (use optional chaining — `output.escalation` is present on offer turns but guard for non-offer turns).
- Rewire: `If10` FALSE output → `is-escalation-declined` (replaces the current `If10`false→`If9` edge).
  - `is-escalation-declined` TRUE → **new Set `tag-escalation-declined`**.
  - `is-escalation-declined` FALSE → `If9` (existing clarify chain, unchanged).

**(b) New Set `tag-escalation-declined`** — one assignment `branch_kind = "escalation_declined"` (string),
mirroring `tag-escalate-offer`/`tag-out-of-scope`. Wire `tag-escalation-declined` → `escalate-catalog`
(the same fan-in every other `tag-*` uses).

**(c) `escalate-catalog` (id `escalate-catalog-node`) — add one `switch` case:**
```js
case 'escalation_declined':
  response          = 'Escalation declined.';   // FIXED canned reply
  manualResponse    = true;                       // send verbatim, no LLM shaping
  includeResponse   = true;
  is_escalate_offer = false;                       // → cs-offer-gate FALSE → straight to compile-current-state (no CS rebuild)
  break;
```
Downstream is automatic: `is_escalate_offer=false` sends the decline to `cs-offer-gate`'s FALSE arm →
`compile-current-state` (renders `_cat.response='Escalation declined.'`) → guarded `…sendmsg-respond2`.
**`Basic LLM Chain` is never reached** (we branched off before `If9`).

**Why this is the cleanest insertion (vs alternatives):** (i) it reuses the existing `branch_kind` →
`escalate-catalog` → `compile-current-state` → send spine — no new send node, no new session write path;
(ii) it touches zero egress-capable nodes; (iii) it leaves the `If9`/`Basic LLM Chain` clarify path fully
intact for genuine `casual`/`unknown` turns that are NOT declines.

## 10.5 Zero-egress confirmation (part 3, on the clone)
The decline path is: `is-escalation-declined`→`tag-escalation-declined`→`escalate-catalog`→`cs-offer-gate`
(FALSE)→`compile-current-state`→[`sorento-sub-respond-sendmsg-respond2` (guarded sendmsg sub, `is_test=true`
short-circuit), `guard-d-record`, `session-save-gate`→`pg-upsert-session` on `n8n_test`]. It does NOT touch
`Call 'sub-human-intervention'`, `Assign or unassign a Conversation1`, any SLA POST, any PIC comment, or the
assignee-queue push. **Canned text → guarded send → no assign/SLA/PIC/CRM write. §0 S1–S6 preserved.**

## 10.6 Promote-to-live mapping (user-gated, guards stripped, backup-first, sha-gated per LESSON 24/25)
| part | build/test target (fork/clone) | promote-to-LIVE target |
|---|---|---|
| 1 parser clause | fork `CpxE8LroLzCkrAQN` › `AI Agent` systemMessage | live sub `XTODTw-dJcV0uRdC056hG` › AI Agent systemMessage |
| 2 output_exchange decline arm | fork `CpxE8LroLzCkrAQN` › `output_exchange` | live sub `XTODTw-dJcV0uRdC056hG` › output_exchange |
| 3 spine decline branch | clone `txiPzSxy3Pclsz6v` (new `is-escalation-declined` + `tag-escalation-declined` + `escalate-catalog` case) | live spine `9qVyfUxmRQqrpGRMDLRuz` (same 3 edits, NO test guards to strip — these nodes are pure logic) |

Order: publish the fork sub FIRST (LESSON 37 — the clone references only the published sub), then the spine
edits, then run V0→V6. Promotion is a separate user-gated step (guards on parts 1/2 are the `is_test`
short-circuits in the subs, already handled by the shared-sub guard model; part 3 has none to strip).

## 10.7 Verification tasks (follow-on additions to §5)
- **V6 (decline determinism — Gap B):** UAC row 4 `"no thanks"` → final bot reply is EXACTLY
  `"Escalation declined."` AND **`Basic LLM Chain` did NOT execute** (assert `$('Basic LLM Chain').isExecuted`
  is false in `get_execution` runData; `tag-escalation-declined`/`escalate-catalog`(kind=`escalation_declined`)
  DID execute). No `member_reprompt`, no `correction`.
- **V7 (survive-decline retarget — Gap A):** UAC row 5 `"no, I want warehouse"` → the REAL fork emits
  `message_type='request_for_help'`, `is_affirmative=false`, `routing.suggested_team='warehouse'`; Tier-1
  retarget fires end-to-end → same final state as row 6 (`escalation.retarget_team===true`,
  `suggested_team==='warehouse'`, `selection_context` cleared). Must run the real fork (OMIT the mock).
- **V8 (clarify path intact):** a genuine non-decline `casual`/`unknown` turn (e.g. "haha ok thanks") still
  reaches `Basic LLM Chain` (regression guard that the new IF did not swallow real clarify turns).
- **V9 (zero-egress on decline):** §10.5 — decline row produces only a `would_send` for "Escalation
  declined."; NO assign/SLA/PIC/human-intervention/CRM-write egress record.

---

# 10.8 — PROMPT-ONLY REFACTOR: orthogonal signals + code reconciliation (SUPERSEDES the §10.2 L147 clause)

> **STATUS: PLAN. Docs only — no workflow edited, no execution run.** **Scope: `parser`** — the change is
> inside the reformulator fork's `AI Agent` systemMessage (a real LLM), so it is invisible to
> `mock_reformulator_output` (LESSON 28); e2e MUST run the real fork with the mock OMITTED.
> **Build/test target = fork `CpxE8LroLzCkrAQN` › `AI Agent`** (id `cb4f080d-bf4c-41fe-9685-e816d858f198`)
> `parameters.options.systemMessage`. **Coder is implementing edits A–D on the fork in parallel — planner
> touches docs only.** `output_exchange` (the `escalation_declined` plain-decline arm §10.3 and the Tier-1
> retarget arm §3.1) and the clone-spine deterministic decline branch (§10.1 / §10.4) are **UNCHANGED**.
>
> Premise (L137 short-circuit makes the §10.2 L147 clause dead, row 5 mis-classified `casual` 3× runs) is
> stated authoritatively by the change request / the coder's read of the fork systemMessage. Line numbers
> below are as reported by the change request; the tester confirms them against the fork at V-time.

## 10.8.0 Why the §10.2 L147 decline clause was DEAD CODE (root of the approach change)
- The reformulator systemMessage's message_type-classification test has a short-circuit at **L137** that
  **SKIPS** message_type classification for any reply that is a "reply to a closed answer" — a set that
  **includes the member_offer**. Every member_offer reply trips that short-circuit, so the message_type test
  (and therefore the §10.2 decline clause added at **L147, INSIDE that test**) never executes on the exact
  turns it was written for. The clause was inert.
- Symptom (from the 10-row tester run, Gap A): row 5 `"no, I want warehouse"` classified
  `message_type=casual` (`is_affirmative=false`) three runs in a row — deterministic miss — so
  `request_for_help` never surfaced, `routing.suggested_team=warehouse` was never emitted, and Tier-1
  retarget could not fire.

## 10.8.1 New design — LLM emits ORTHOGONAL signals; CODE reconciles (it already does)
Stop forcing message_type from closed-question context in the prompt. Instead:
- The LLM classifies `message_type` purely from the **current message content** (faithful extraction),
  **independent of** `is_affirmative`. A prior member_offer / closed question is **context only**.
- `output_exchange` already reconciles: inside `if (_selCtx === 'member_offer')` it reads `selection_context`
  + `is_affirmative` (+ position / `person_mention` / named team) to choose pick / round-robin / decline /
  retarget. **That code is UNCHANGED** — it does not need the LLM to pre-force message_type.

## 10.8.2 The four prompt edits (coder — fork `CpxE8LroLzCkrAQN` › `AI Agent` systemMessage)
- **A (L137):** kill the "skip this test" short-circuit. **Always** classify `message_type` from the current
  message content; a previous-turn offer/closed-question is **context only**, never a reason to skip
  classification. `message_type` is **⊥ (orthogonal) to `is_affirmative`** — both may be emitted together.
- **B (step 1):** `request_for_help` fires when the user asks for a human/staff **OR** names a specific
  team/department — **content-driven, orthogonal to whether the message is also a decline**.
- **C (L147):** **REMOVE** the redundant decline clause added in §10.2 (superseded by A+B+D; dead anyway).
- **D (ROUTING):** **always** evaluate `suggested_team`; a named team maps to the routing enum **even while
  the user is declining** — NOT gated on message_type/context.

## 10.8.3 What stays UNCHANGED (do not touch)
- `output_exchange` — the `escalation_declined` plain-decline arm (§10.3) and the Tier-1 retarget arm
  (§3.1) stay AS-IS. Reconciliation already keys on `selection_context` + `is_affirmative` + named team.
- The clone-spine deterministic decline branch (§10.1/§10.4: `is-escalation-declined` IF →
  `tag-escalation-declined` → `escalate-catalog` `escalation_declined` case → `compile-current-state` →
  guarded send) stays AS-IS.

## 10.8.4 Regression surface — why the UAC grows (LOUD FLAG)
Edit A removes a short-circuit that fired for **EVERY "reply to a closed question," not just escalation.**
So `message_type` now changes for **access-level replies, suggest_offer picks, and any yes/no confirm** —
all of which previously rode the short-circuit and were never message_type-classified from content. This is
a **wide regression surface**: a mis-classified message_type on those turns can misroute the spine (e.g.
into `If9` → `Basic LLM Chain`, or into escalation). The UAC therefore adds explicit non-escalation
regression rows (access-level, suggest_offer, non-escalation confirm) to prove **no collateral spine
misrouting**. See UAC rows 11–13 + the new acceptance line.

## 10.8.5 Promote-to-live (SUPERSEDES the §10.6 "part 1 parser clause" row)
Prompt edits **A–D promote to LIVE sub `XTODTw-dJcV0uRdC056hG` › `AI Agent` systemMessage** (user-gated;
guards N/A — systemMessage is pure prompt; sha-gated byte-exact per LESSON 24/25; backup prior versionId +
node body first; publish the fork sub before testing the parent, LESSON 37). This **replaces** the §10.6
part-1 clause promote row — that clause is REMOVED, not promoted. The output_exchange (§10.6 part 2) and
spine decline-branch (§10.6 part 3) promote rows are **unchanged**.

| edit | build/test target | promote-to-LIVE target |
|---|---|---|
| A–D prompt refactor | fork `CpxE8LroLzCkrAQN` › `AI Agent` systemMessage | live sub `XTODTw-dJcV0uRdC056hG` › `AI Agent` systemMessage |
| (superseded) §10.2 L147 clause | — | REMOVED — do not promote |

## 10.8.6 Verification additions (extend §5 / §10.7)
- **V10 (orthogonality proof):** on the real fork — a member_offer decline that NAMES a team (row 5) emits
  `message_type='request_for_help'` **AND** `is_affirmative=false` **simultaneously**; a plain decline
  (row 4) emits `is_affirmative=false` with `message_type` **NOT** request_for_help. Proves A+B+D +
  message_type ⊥ is_affirmative, and that removing the short-circuit lets row 5 reach `request_for_help`.
- **V11 (NO non-escalation regression — headline acceptance):** access-level reply (UAC row 11),
  suggest_offer pick (row 12), and non-escalation confirm (row 13, if one exists) show **no
  message_type/routing regression vs pre-refactor behavior** — correct branch, not misrouted, `Basic LLM
  Chain` invoked only where it was pre-refactor. Any change in branch/`Basic LLM Chain`/routing on these
  turns vs the pre-refactor baseline = FAIL.
- **V12 (member_offer picks/decline still intact under content-derived message_type):** rows 1/2/3/4 behave
  as in §UAC even though `message_type` is now content-derived (picks set `is_escalation_confirmation=true`
  → `If2` fires regardless of message_type; decline sets `escalation_declined` → spine decline branch).
