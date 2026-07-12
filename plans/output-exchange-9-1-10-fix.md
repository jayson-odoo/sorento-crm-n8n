# Plan — `output_exchange` code-only fix bundle (issues #9, #1, #10)

**Target node:** `output_exchange` (id `847a1173-5e8d-48bf-ae3d-b1be218b0e88`, `n8n-nodes-base.code`)
in the parser sub `sub-semantic-parser` (live `XTODTw-dJcV0uRdC056hG`; the CLONE calls fork
`CpxE8LroLzCkrAQN` — edit/test the fork, promotion targets live).
**Change type:** CODE-ONLY. **No prompt edits** (reserved for the separate #4 clarify work).
**Scope tag:** `parser`.
Rationale: the change lives INSIDE the reformulator sub, AFTER the LLM (`AI Agent -> output_exchange`).
The deterministic mock (`mock-reformulator-output`) is a **sibling branch that bypasses
`output_exchange` entirely** (`test-reformulator-bypass -> mock-reformulator-output` vs
`-> AI Agent -> output_exchange`), so a `mock_reformulator_output` injection is BLIND to this node
(LESSON 28). Acceptance requires the REAL reformulator to run. The tester MAY use
`prepare_test_pin_data` → `test_workflow` with a **pinned raw LLM output** on the `AI Agent`/
`OpenAI Chat Model` node to exercise `output_exchange`'s pure-code transforms near-0-token, but the
gratitude-classification checks (below) need a real LLM emission and cannot be pinned.

**Safety binding (every case below):** run on the CLONE (`txiPzSxy3Pclsz6v`) / fork in `uac` mode,
egress orphaned, `is_test=true`. Each case is bound to **UAC §0 S1–S6**; assert `test:egress:{run_id}`
shows only `would_*` (S1 send blocked, **S2 no assignment/SLA/PIC write** — the load-bearing gate for
#9/#10 since those turns can trip human-intervention, S3 save-session-vars blocked, S4 read-tool only,
S5 `test_mode===true`, S6 parser tier = only the reformulator LLM). S2 is the FOCUS: the whole point
of #9 is that a plain closing currently `would_write` a staff assignment.

---

## 0. ⚠️ LOUD FLAG — draft ≠ active; the SIM tested a version MCP cannot read

`get_workflow_details XTODTw` returns **`versionId=2428b0cd-204f-4706-9b56-222a810675c2` (DRAFT)**,
but **`activeVersionId=303a25ec-8782-460c-b115-483083573051`**. Per LESSON 23 the MCP read is the
DRAFT; the active node body is not readable via MCP. The SIM diagnosis (ROLLUP 2026-07-08) forked the
**active** live spine, so it exercised the ACTIVE `output_exchange`, which **may differ** from the
draft quoted below.

**Consequence for change #4 (domain_hint bleed):** in the DRAFT there is **no un-gated
`domain_hint = prevState.domain_hint` line** — every prior-state → domain carry is gated (see §2).
The coordinator's premise that a bleed "re-sets domain from prior state" on casual turns therefore
does **not** match the draft I can read; it may reflect an active-only line. **The coder MUST diff
DRAFT vs ACTIVE for `output_exchange` first** (n8n UI version history, or REST
`GET /workflows/{id}` against the active version) and hunt specifically for any prior-state→
`domain_hint`/`message_type` assignment that can fire on a `casual`/no-intent/no-position turn
(prime suspect: the reuse-case carry at draft L211–215, currently **commented out** — if it is
UN-commented in active, that is the bleed). Change #4 is specified as a decision-tree accordingly.

---

## 1. Verbatim current code (DRAFT `2428b0cd`) — exact line targets

Full file mirrored at `scratchpad/output_exchange_DRAFT.js` (597 lines). The load-bearing regions:

### 1a. Hoisted raw signals (TOP, pre-mutation) — L71–L76
```js
const _llmMsgTypeRaw = output.output.message_type;
const _reqHelp       = _llmMsgTypeRaw === 'request_for_help';
const _llmTeamRaw    = output.output?.routing?.suggested_team;
const _llmAgentRaw   = output.output?.routing?.suggested_agent;
const _llmTeamN      = norm(_llmTeamRaw);
const _llmAgentN     = norm(_llmAgentRaw);
```
`_reqHelp` is captured from the **raw** message_type BEFORE any mutation → **immune to the clobber**
(this is the §10 hoist, comments L66–L70). It is in scope at the clear/clobber point.

### 1b. Every prior-state → `domain_hint` / `message_type` carry (the "bleed" candidates)
- **L211–L215 — COMMENTED OUT** (inside the `entity_op==='reuse'` case):
```js
/*      if (output.output.message_type != 'casual' && output.output.message_type != 'request_for_help') {
        output.output.message_type = parent_input.previous_conversation_state?.message_type
        output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint
        output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint
      }*/
```
- **L277–L278** — gated on the "ALL/SEMUA" pick block (`_isAll && _pickCtx && _lrsAll.length>0 && _noPos`):
```js
    if (!output.output.domain_hint) output.output.domain_hint = prevState.domain_hint;
    if (!output.output.intent_hint) output.output.intent_hint = prevState.intent_hint;
```
- **L282–L287** — gated on a **positional pick** (`reference_positions.length > 0`):
```js
if (!output.output.domain_hint && prevState?.domain_hint && output.output.reference_positions.length > 0) {
  output.output.domain_hint  = prevState?.domain_hint;
  output.output.intent_hint  = output.output.intent_hint || prevState.intent_hint;
  output.output.message_type = 'business_query';
  output.output.domain_inherited_for_position = true;
}
```
**None of these fire on a bare closing/gratitude turn** (no reference_positions, not "all", reuse-carry
commented). In the draft, the domain on a casual turn can only come from the **LLM's own emission**.

### 1c. `_isPositionPick` / `isAffirmative` / `isDecline` / `offeredEscalation` / `priorRouting` — L413–L433
```js
const priorRouting  = parent_input?.previous_conversation_state?.routing ?? {};
...
const prevResponse = String(parent_input?.previous_conversation_state?.response || '');
const offeredEscalation = /would you like me to escalate/i.test(prevResponse);
const isAffirmative = output.output.is_affirmative === true;
const isDecline     = output.output.is_affirmative === false;

const _isPositionPick = (Number(output.output.positions_resolved) > 0)
  || output.output.select_all_expanded === true
  || (Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0);
if (offeredEscalation && isAffirmative) {
  output.output.escalation = { is_escalation_confirmation: true };
} else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp) {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}
```
All of `_reqHelp, isAffirmative, isDecline, _isPositionPick, offeredEscalation, priorRouting,
prevState (L250), userMsg (L109)` are **in scope** at the clear/clobber lines below. ✔

### 1d. THE CASUAL-CLEAR LINE — **L439–L441** (issue #1)
```js
if (output.output.message_type == 'casual') {
  output.output.entities = []
}
```

### 1e. THE CLOBBER LINE — **L444–L446** (issue #9 primary)
```js
if (output.output.domain_hint) {
  output.output.message_type = "business_query"
}
```
Runs AFTER the casual-clear. This is the line that overrides the LLM's own `casual` verdict whenever a
domain_hint is present — the root of #9 (golden shows the LLM already tags "thank you" as
`message_type=casual, domain_hint=null`; the regression is this clobber flipping it, not the LLM
misreading gratitude).

### 1f. Routing/team fallback chain — **L462–L472** (issue #10)
```js
const derived = output.output.domain_hint
  ? deriveRouting(output.output)
  : { suggested_team: null, suggested_agent: null };
const suggested_team  = (_reqHelp ? _llmTeamN  : null) ?? norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = (_reqHelp ? _llmAgentN : null) ?? norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';
output.output.routing = { suggested_team, suggested_agent };
```
**Confirmed it exists.** `_reqHelp` is the **raw** value → **the clobber does NOT flip `_reqHelp`**,
so the clobber does not by itself defeat `priorRouting`. The chain already yields `purchasing` for
#10-R (domain_hint=None → `derived=null` → falls through to `priorRouting.suggested_team=purchasing`).

---

## 2. The five changes (before → after)

### Change #1 — GATE THE CLOBBER (PRIMARY fix for #9) — edit L444–L446
Force `business_query` only on a **complete** business signal (domain AND intent) that the LLM did
**not** itself classify as `casual`/`request_for_help`.

**Before:**
```js
if (output.output.domain_hint) {
  output.output.message_type = "business_query"
}
```
**After:**
```js
// Δ #9: gate the domain->business_query clobber. Respect the LLM's own message_type when it said
// 'casual' (closing/gratitude) or 'request_for_help'; only clobber on a COMPLETE business signal
// (domain AND intent). Also stops flipping an escalation-decline (L432 casual) back to business_query.
if (output.output.domain_hint && output.output.intent_hint
    && output.output.message_type !== 'casual'
    && output.output.message_type !== 'request_for_help') {
  output.output.message_type = "business_query"
}
```
**Risk/interaction:** must stay AFTER the escalation block (L428–L433) and AFTER change #3, and BEFORE
the routing chain (L462+, untouched). Adding the `intent_hint` requirement means a domain-only,
intent-less turn (the shape of a speculative-domain closing) no longer force-converts. A genuine
business query that the LLM already tagged `business_query` is unaffected (the clobber was redundant
there). The one behavioral change to note: a turn the LLM mislabels `casual` while emitting
domain+intent now **stays casual** (previously "rescued" to business_query) — this is the intended
#9 behavior (trust the LLM's casual). Exempting `request_for_help` keeps help-requests as
help-requests so they route via the L469 escalation chain instead of being silently converted to a
data lookup (supports #10).

### Change #3 — GATE THE CASUAL-CLEAR (issue #1 boundary) — edit L439–L441
Clear entities on a casual turn UNLESS the "casual" reply is actually engaging a pending offer/pick.
Requires the **shared engagement block** (below) computed just above it.

**Insert immediately after L437 (after the access_levels carry), before L439:**
```js
// ── OFFER/PICK ENGAGEMENT (shared gate) ──────────────────────────────────────
// True when the prior turn had an OPEN offer/pick AND this reply engages it. Prevents the
// casual-clear from wiping a mislabeled pick before the member_offer block (L476+) consumes it.
const _selCtxNow   = String(prevState.selection_context || '');
const _hasRefSet   = Array.isArray(parent_input.referenced_result_set) && parent_input.referenced_result_set.length > 0;
const _pickContext = offeredEscalation
  || _selCtxNow === 'suggest_offer' || _selCtxNow === 'member_offer' || _selCtxNow === 'disambiguation'
  || _hasRefSet;
const _pmNow       = (typeof output.output.person_mention === 'string' && output.output.person_mention.trim()) ? true : false;
const _engagesOffer = _pickContext && (_isPositionPick || isAffirmative || isDecline || _pmNow);
```
**Var-name safety:** `_selCtxNow / _hasRefSet / _pickContext / _pmNow / _engagesOffer` are all new;
they do NOT collide with the block-scoped `_pickCtx`/`_selCtx` at L267 nor the top-level `const _selCtx`
at L477. All referenced inputs (`prevState`, `offeredEscalation`, `_isPositionPick`, `isAffirmative`,
`isDecline`, `parent_input`) are already in scope at L437.

**Before (L439–L441):**
```js
if (output.output.message_type == 'casual') {
  output.output.entities = []
}
```
**After:**
```js
// Δ #1: on a casual turn, clear carryover entities UNLESS this reply is engaging a pending
// offer/pick (a mislabeled affirmative / decline / position / member-name) — wiping those would
// drop the resolved pick before the member_offer block (L476+) reads it.
if (output.output.message_type == 'casual' && !_engagesOffer) {
  output.output.entities = []
}
```
**Risk/interaction:** the shared block MUST be computed before both #3 and the (contingent) #2 backstop.
`_engagesOffer` deliberately includes `_pmNow` so a member-offer **name-reply** ("tan") is protected
even when the LLM tags it casual with no position (LESSON 38/39). Boundary #1-N (mid-offer bare "hi")
has no pick/affirm/decline/person → `_engagesOffer=false` → still clears (correct).

### Change #4 — STOP THE domain_hint BLEED ONTO CASUAL/NO-INTENT TURNS (PRIMARY fix for #9) — DECISION TREE
**In the DRAFT there is nothing to edit** (§1b: the only prior→domain carries are position-gated;
the reuse-carry is commented). So:

- **(a) Coder first diffs DRAFT vs ACTIVE** for `output_exchange` (§0). Search the ACTIVE body for any
  `output.output.domain_hint = ...previous_conversation_state...` (or `...message_type = ...prev...`)
  that is **not** gated behind `reference_positions.length>0` / `select_all_expanded` / `_isAll`.
- **(b) IF such an un-gated carry exists in active** (e.g. draft L211–L215 un-commented, or a variant),
  gate it so it cannot fire on a casual/help/no-position turn. Exact pattern:
  ```js
  // Δ #9: never re-inject a prior-state domain onto a turn the LLM did not classify as a business
  // continuation. Restrict the carry to a genuine position/pick continuation.
  if (output.output.message_type !== 'casual'
      && output.output.message_type !== 'request_for_help'
      && Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0) {
    // ...existing prior-state domain/intent/message_type carry...
  }
  ```
- **(c) IF no un-gated carry exists (draft == active):** #4 is **already satisfied** — record this in the
  node-diff. Change #1 alone then handles the domain-driven flip, and any residual (LLM emitting a
  domain on a closing) is neutralized by #1's `intent_hint` requirement + casual-exemption.

**Risk/interaction:** do **NOT** touch L277/L282 — those carries are correctly position-pick-gated and
are load-bearing for numbered-pick / "all"-pick continuation (regression guard set §5).

### Change #5 — #10 TEAM: CONFIRM inheritance intact, no new edit — verify L462–L472 unchanged
`_reqHelp` is hoisted raw (L72) → **immune to the clobber**, so gating the clobber (#1) does not disturb
the team chain. For #10-R (`domain_hint=None`) `derived` is null → the chain falls through to
`priorRouting.suggested_team` = **purchasing** (inherited from the prior `incoming` turn). This already
produces the correct team in the SIM; **no extra guard is required.** The clobber gate additionally
keeps `request_for_help` turns AS `request_for_help` (change #1 exemption), so a help-request that
carries a domain still routes via the escalation chain rather than being converted to a data query.
**Action:** leave L462–L472 byte-identical; the coder asserts (in the node-diff) that `suggested_team`
for #10-R resolves via `priorRouting`, not `derived`.

### Change #2 — CLOSING/GRATITUDE BACKSTOP — **CONTINGENT, NOT a default edit**
**Do NOT apply by default.** Evidence (golden pre-2026-07-06) shows the LLM already classifies
"thank you" as `message_type=casual, domain_hint=null`; the #9 regression is the **clobber + any
domain bleed**, not the LLM misreading gratitude. Changes #1 + #4 are expected to restore correct
gratitude handling by respecting the LLM's own casual verdict. Hardcoding a thank-you regex is the
wrong default (brittle, duplicates the LLM's job).

**Apply a backstop ONLY IF** the fork-sim shows "okay thankyou" / "thank you" STILL emerging as
`business_query` (or with a would-assign) **after #1 + #4 are in place.** In that case:
- **Preferred (out-of-scope here):** a one-line **reformulator prompt nudge** — "A pure closing or
  thanks (thanks / thank you / ok / noted / bye) is `message_type: casual` with `domain_hint: null`;
  never treat it as a continuation of the prior query." **Any prompt change is reserved for the #4
  clarify work → escalate as a separate, user-gated decision. Do not apply it inside this bundle.**
- **Fallback (code, only if a prompt change is declined):** a deterministic backstop inserted
  **immediately after the shared engagement block, before the casual-clear (#3)**, reading the user
  text from `parent_input.latest_user_message` (fallback `parent_input.user_message` / `userMsg`),
  stripping any `reply to:` suffix, matching a **full** closing-token message (≤4 tokens, every token
  in a closing/gratitude set), gated by `_noCurrentEnt` (no `current_message` entity this turn) and
  `!_engagesOffer`; on match set `message_type='casual'` and `domain_hint=null`. **Recommendation:
  do NOT gate this fallback on `!intent_hint`** — a hallucinated intent on a pure-closing full-match
  would re-open the exact #9 failure; the strict full-token match is the authority. This fallback is
  documented for completeness only; prefer the prompt nudge.

---

## 3. Execution order (these lines are adjacent — order is load-bearing)

Unchanged head → … → L428–L433 escalation block (unchanged) → L435–L437 access_levels (unchanged) →
**[NEW] shared engagement block** → **[CONTINGENT #2 backstop, if triggered]** → **#3 gated
casual-clear (L439–L441)** → **#1 gated clobber (L444–L446)** → L448+ i18n normalize / routing chain
(#5, unchanged) / member_offer block / date gate (all unchanged).

Invariants: (i) shared block before #3 and #2; (ii) #2 (if present) before #3 so a nulled domain is
seen by the clobber and the carried entities are wiped by #3; (iii) #3 before #1; (iv) routing chain
(L462+) untouched and after the clobber; (v) `_reqHelp` stays sourced from the L72 hoist.

---

## 4. Acceptance — mapped to sim cases (`tests/sim-diagnosis-UAC.md`)

**Two-phase acceptance (per coordinator).** Apply **#1 + #4 (+#3 for issue #1) only**, then:

> **GATE CHECK (do first):** on the fork, run `okay thankyou` (order prev-state) and `thank you`
> (forms prev-state) with the REAL reformulator. Inspect the raw LLM emission AND the final
> `output_exchange` output.
> - **If the LLM emits `message_type=casual`** (expected from golden) **and the final output stays
>   `casual` with no human-intervention `would_write`** → #1+#4 are sufficient, **do NOT add #2**;
>   mark #9 done.
> - **If gratitude still resolves to `business_query` / would-assign after #1+#4** → **STOP and
>   escalate** to the coordinator/user for the prompt-nudge decision (§2 change #2). Do not add the
>   code regex unilaterally.

Post-fix expected outcomes:

| case | trigger (contact `437264483`) | expected after #1+#4(+#3) | key assertion |
|---|---|---|---|
| **#9-R** | T1 `may know delivery for cust yoo living for today` → T2 `okay thankyou` (order prev-state) | `message_type=casual`; **no human-intervention `would_write`** (no would-assign to customer_service/order_enquiries) | S2: assignment write absent; `output.output.routing` irrelevant because casual |
| **#9-R2** | T1 `Hi, can send me agreement` → T2 `thank you` (forms prev-state) | `casual`; **forms NOT re-listed** (get-results not reached for a forms list) | final `message_type=casual`, domain not `forms` |
| **#9-G1** | product query (`check stock srt86cr`) → `and its ETA?` | stays **business** (domain=incoming, `srt86cr` carried, incoming picker) — stickiness intact | clobber fires legitimately (domain+intent, not casual) |
| **#9-G2** | ZZZ999XX escalate offer → `yes` | escalation **still fires** to purchasing; `escalation.is_escalation_confirmation=true` | `_engagesOffer=true` (offeredEscalation+affirm) → casual-clear skipped; escalation set at L428 |
| **#9-N** | `thanks, can you also check SRT79-SS-GM stock` | **business** (domain=inventory, `SRT79-SS-GM` current) — gratitude+request boundary | full-token closing match fails (non-closing tokens, len>4); `_noCurrentEnt=false` |
| **#1-N** | offer pending → T2 bare `hi` (mid-offer) | entities **still cleared** (casual, no engagement) | `_engagesOffer=false` (no pick/affirm/decline/person) → clears |
| **#1 pick-protect** | mid-offer reply the LLM mislabels casual but carries a resolved pick / member-name | resolved entities / member-name **NOT wiped** by casual-clear | `_engagesOffer=true` → clear skipped; member_offer block resolves |
| **#10-R** | T1 `check eta SRTWT7448` → T2 `Nobody reply me` (replyTo=incoming) | `message_type=request_for_help`; `suggested_team=purchasing` **via `priorRouting` inheritance** (not `derived`, not replyTo) | S2: human-intervention `would_write` team=purchasing/incoming_stock_enquiries; `_reqHelp` immune to clobber |
| **#10-G1** | order-miss → `Nobody reply me` | team=`customer_service` (inherited) | unchanged |
| **#10-G2/N** | `I want to talk to a human` (no ctx) / reply-to on a delivered non-escalation answer | default CS team / casual, no forced team | unchanged |

> ⚠️ **#1-R clarification (premise correction, flag loudly):** the sim-diagnosis `#1-R`
> ("retain `srt104 GY` after picking customer NEW STYLE LIGHTING") does **NOT** reproduce via the
> casual-clear path. The SIM ROLLUP shows T1 lumped one bad `order` entity (no customer didyoumean
> picker ever fired), and T2 was re-parsed as a **fresh** `business_query` with `entity_op=replace`
> (`current_message=true`) → `srt104 GY` dropped by the **entity-op executor**, not by casual-clear.
> **None of the five changes in this bundle fix that drop** (it needs a separate `entity_op`
> reuse/carry fix + a customer-picker, outside `output_exchange`'s casual-clear/clobber lines). The
> concrete, in-scope #1 outcome this bundle delivers is the **casual-clear boundary**: mid-offer "hi"
> still clears (#1-N) AND a mislabeled-casual pick is no longer wiped (#1 pick-protect). Keep the
> original "retain srt104" as a **known-open** item tracked separately, not an acceptance gate here.

---

## 5. Regression guard set — MUST NOT break

Run these on the fork after the edits; all must be unchanged vs pre-edit behavior (reference the
shipped member-offer / Δ4 / delta4-merge behaviors in memory):
- **Member-offer name-pick** (`member-offer` selection_context; reply "tan"/honorific): still resolves
  via the member_offer block (L476–L581); `_engagesOffer` (with `_pmNow`) protects it from casual-clear;
  ambiguity gate (>1 label) still reprompts, NEVER auto-picks (S2).
- **Numbered pick** (`reference_positions>0`): L282–L287 still inherits domain + sets business_query
  (untouched); clobber then fires legitimately; entities not cleared.
- **Escalation yes/no** (`offeredEscalation`): `yes` → confirm (L428); `no` → decline casual (L432),
  and the clobber gate now **correctly** leaves the decline as casual instead of flipping it back to
  business_query (net improvement, verify no downstream breakage).
- **Suggest-offer flows** (Δ4 merge suggest+member; `suggest_offer` selection_context, date buttons /
  member numbers): `_engagesOffer=true` for the pick → casual-clear skipped; date-filter gate (L583+)
  and member roster unchanged.
- **CS member retarget / decline** (memory: member-offer-retarget-decline, delta4): Tier-1 retarget +
  deterministic "Escalation declined." markers in the member_offer block are downstream of all edits
  and untouched — confirm byte-identical.
- **Access-levels carry** (L435–L437), **date-filter domain gate** (L587), **deriveRouting** brand
  clamp (L28): untouched — confirm identical in the node-diff.

---

## 6. Verification tasks (plan §6)

1. **Draft-vs-active diff** of `output_exchange` (coder, §0/§4a) — mandatory before any edit; record the
   active body's L444/L439 and any prior-state→domain carry in the node-diff.
2. **Node-diff** (coder): exact before/after for L439–L441, L444–L446, the inserted shared block, and
   #4 (edit or "no-op — draft==active, already gated"). Assert L462–L472 byte-identical (#5).
3. **Fork gate-check** (tester, parser tier): `okay thankyou` / `thank you` → capture raw LLM
   `message_type` + final output; decide #2 per §4 gate.
4. **Acceptance run** (tester): all §4 rows + §5 regression set on the fork in `uac` mode;
   `get_execution(includeData)` for each; assert **§0 S1–S6**, focus **S2** (no assignment/SLA/PIC
   write on #9-R/#9-R2/#10-R).
5. **Egress log** `test:egress:{run_id}` = 0 real sends/writes for every case (halt on any 2xx egress).
6. **Reviewer**: confirm zero-egress from run logs, plan/UAC adherence, and that #2 was NOT added
   unless the §4 gate-check justified it (and if a prompt nudge was chosen, that it was escalated as a
   separate user-gated change, not applied in this bundle).
