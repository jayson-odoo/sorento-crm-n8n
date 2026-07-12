# Change: `suggest-offer-member-choice` — CS/order suggest_offer "yes" → member choice (not round-robin)

Status: PLAN (planner deliverable). DOCS ONLY — no workflow edited, no execution run.
Build/test target: **clone spine `txiPzSxy3Pclsz6v`**. Promote later (user-gated) to **live spine
`9qVyfUxmRQqrpGRMDLRuz`**. Source of truth for every node fact below: live clone via
`get_workflow_details` (versionId `df13075e-0962-4b61-b4b5-510b614d50e8`, == active) +
reformulator fork `CpxE8LroLzCkrAQN`, read 2026-07-06.

**Scope tag: `deterministic`** (see §7). Both deltas are spine-only branching/string logic; the one
reformulator dependency (`suggest_pick_context`) is an EXISTING signal we verify, not change.

---

## 0. Goal

On the CS/order **delivery-date** suggest_offer ("No delivery on <date>. <cust> has delivery on
<dates>. Reply with a date to continue, or would you like me to escalate to customer_service team?"),
when the user chooses to escalate we currently round-robin-assign via `Call 'sub-human-intervention'`.
Instead, show the **CS member picker** ("pick 1-5") first — the same numbered list the fresh
escalate_offer already produces — so the customer chooses who to route to before any assignment.

Three parts (from the change request):
- **A** — at the `If2` seam, divert the suggest→"yes escalate" case for CS/order into the existing
  member_offer builder instead of round-robin. (SPINE-ONLY.)
- **B** — DROPPED. `build-cs-member-offer` stays numbered TEXT (no buttons). No change.
- **C** — trim the CS/order suggest_offer quick-reply buttons to the date alternatives ONLY (drop the
  "Yes, escalate" / "No, it's okay" buttons); escalate/decline still happen via typed text. (SPINE-ONLY,
  gated to CS/order because `build-suggest-offer` is shared.)

---

## 1. Verified live graph (the seam)

### 1.1 The escalation-confirmation seam (`If2`)
- **`If2`** (id `ed6f8db9-e2c7-41f5-be77-0decedf2950e`, type `if`). Condition (OR):
  `output.escalation.is_escalation_confirmation === true`  OR
  `output.message_type == "request_for_help" && output.domain_hint != "portal_link"`
  (both read from `$('Call 'sub-query-reformulator'').first().json.output`).
- **`If2` output#0 (TRUE)** fans to **TWO** targets today: `Call 'sub-human-intervention'`
  (id `133fcc06-c002-49c4-9d3f-8bef06881e13`) **and** `tag-out-of-scope`
  (id `3a2818e5-cc36-45d5-a0b8-c86d4edc640e`). ⚠️ The change request's premise said "If2 TRUE →
  human-intervention"; it also feeds `tag-out-of-scope` → `escalate-catalog(out_of_scope,
  includeResponse:false)`. The divert MUST preserve BOTH targets on its FALSE branch.
- **`If2` output#1 (FALSE)** → `If10` (id `9e146c74-abf4-4ff8-be00-39eb4487389b`). Untouched.
- Upstream: `If5` (access-granted) output#0 → `If2`.

### 1.2 The member_offer builder chain (reused unchanged)
```
tag-escalate-offer (id 135a1d93-8602-4b71-a018-39e1488b5e70, Set branch_kind='escalate_offer')
  → escalate-catalog (id escalate-catalog-node, Code)
      switch(branch_kind).escalate_offer ⇒ is_escalate_offer=true,
        response="…Would you like me to escalate to {team} team?"
  → cs-offer-gate (id cs-offer-gate-node, IF; AND of):
        g1 escalate-catalog.is_escalate_offer === true
        g2 reformulator output.routing.suggested_team === "customer_service"
        g3 reformulator output.routing.suggested_agent === "order_enquiries"
     ├ TRUE  → get-cs-members (id get-cs-members-node, httpRequest GET team-members — CRM READ)
     │           → build-cs-member-offer (id build-cs-member-offer-node, Code)
     │               numbered "1..N" text, selection_context='member_offer', cs_last_result_set,
     │               member_offer=true; empty roster ⇒ graceful fallback to catalog offer + round-robin
     │           → compile-current-state
     └ FALSE → compile-current-state (plain escalate offer)
```
`build-cs-member-offer` produces the **numbered TEXT** picker ("pick the number"). No buttons — Part B
correctly requires no change here (confirmed: it sets `out.response` text only, no `quick_reply`).

Reference-safety (verified): only the member-builder chain `$()`-references its own nodes
(`build-cs-member-offer`→`escalate-catalog`,`get-cs-members`; `cs-offer-gate`→`escalate-catalog`;
`compile-current-state`→`escalate-catalog`,`build-cs-member-offer`). **Nothing** `$()`-references
`tag-out-of-scope`, `tag-escalate-offer`, or `Call 'sub-human-intervention'` output — so skipping the
human-intervention path on the divert branch breaks no downstream expression (LESSON 5 clear).

### 1.3 The suggest_offer render (`build-suggest-offer`, id `7972abd8-5d6b-40ff-9d38-152782cd8091`)
`build-suggest-offer` is downstream of `not-found-error-message` → (out) `tag-not-found` →
`escalate-catalog(not_found)`. It is **SHARED** across domains:
- **D1** = per-token resolution-miss "did you mean" (product code mode / promotion numbered mode).
- **D2 `axis === 'date'`** = the CS/order **delivery-date** offer ("No delivery on {asked}. {cust} has
  delivery on {near}. Reply with a date to continue, or would you like me to escalate to {team} team?").
  `values = picks.map(a => a.value)` (the alt dates); `out.suggest_quick_reply = [...values, YES, NO]…`.
- **D2 non-date** = "No {noun} for {code}. Try: {values}…" (inventory/incoming/etc.).
- Button literals (exact): `YES = 'Yes, escalate'`, `NO = "No, it's okay"` (the change request quoted
  "Yes escalate"/"No it's okay" — minor wording note).

The CS/order delivery offer the change targets is precisely the **D2 `axis === 'date'`** branch. D1 and
D2-non-date route to non-CS teams (purchasing/marketing) — they must keep their buttons (Part C gate).

### 1.4 The reformulator signals (read-only; NOT edited)
Reformulator fork `CpxE8LroLzCkrAQN`, node `suggest-follow-up` (runs after `output_exchange`):
```
if (prevState.selection_context === 'suggest_offer') {
  … if (_o.is_affirmative === true) { _o.escalation = { is_escalation_confirmation:true }; _o.entities=[]; }
    else if (_o.is_affirmative === false) { _o.escalation = { is_escalation_confirmation:false }; _o.message_type='casual'; _o.entities=[]; }
    else (date/code/position pick) → keep prior domain, re-query …
  _o.suggest_pick_context = true;      // ← emitted on EVERY suggest_offer follow-up
}
```
**Key:** `output.suggest_pick_context === true` is the spine-readable "previous turn was a suggest_offer"
signal — already emitted, no fork change needed. On the "yes escalate" case it co-occurs with
`escalation.is_escalation_confirmation === true`, `entities:[]`, and **no** `preferred_assignee_id`.
Routing is carried forward from the prior turn (`output_exchange`: `suggested_team = … ?? priorRouting.suggested_team ?? 'customer_service'`), so a CS/order date-offer "yes" arrives at `If2` with
`routing = {suggested_team:'customer_service', suggested_agent:'order_enquiries'}`.

The member_offer context emits `member_pick_context` (NOT `suggest_pick_context`), and picks set
`escalation.preferred_assignee_id`; the warehouse retarget (Tier 1) sets `escalation.retarget_team=true`
with `routing.suggested_team` = the named non-CS team. These are the cases the divert must NOT catch.

---

## 2. Change A — the `If2` divert (SPINE-ONLY)

Insert one IF node between `If2`-TRUE and its current targets.

**New node `divert-suggest-yes`** (type `n8n-nodes-base.if`, IF v2). Single boolean condition
(operation `true`), self-contained so it never throws on a missing field:
```
={{ (() => {
     const o = $('Call \'sub-query-reformulator\'').first().json.output || {};
     const e = o.escalation || {}; const r = o.routing || {};
     return e.is_escalation_confirmation === true
         && o.suggest_pick_context === true
         && r.suggested_team  === 'customer_service'
         && r.suggested_agent === 'order_enquiries'
         && !e.preferred_assignee_id;
   })() }}
```

**Rewire (one atomic `update_workflow`, LESSON 33):**
- `If2` output#0 (TRUE): **remove** the two edges to `Call 'sub-human-intervention'` + `tag-out-of-scope`;
  **add** one edge → `divert-suggest-yes`.
- `divert-suggest-yes` output#0 (TRUE)  → `tag-escalate-offer` (REUSE; already Set branch_kind='escalate_offer').
- `divert-suggest-yes` output#1 (FALSE) → `Call 'sub-human-intervention'` **and** `tag-out-of-scope`
  (restore the original two targets byte-for-byte).

**Why each condition clause (all five are load-bearing):**
- `is_escalation_confirmation===true` — it's an escalate confirmation, not a date pick.
- `suggest_pick_context===true` — **the discriminator**: prev turn was a suggest_offer, NOT a member_offer.
  Without it, a member_offer bare "yes" (round-robin, UAC-equivalent §15i) — which also has
  is_escalation_confirmation + no preferred + CS/order — would be wrongly re-diverted into a member list.
- `suggested_team==='customer_service' && suggested_agent==='order_enquiries'` — gate to CS/order only
  (mirrors `cs-offer-gate`); a non-CS suggest "yes" keeps round-robin.
- `!preferred_assignee_id` — a suggest "yes" carries no member pick; belt-and-braces (suggest_pick_context
  already excludes member picks).

**What the divert does NOT catch (confirmed against §1.4):**
- (i) member pick — `member_pick_context` (not `suggest_pick_context`) + `preferred_assignee_id` set →
  FALSE → `Call 'sub-human-intervention'` assigns. ✓
- (ii) warehouse retarget (`request_for_help`, `retarget_team`) — `routing.suggested_team` ≠
  `customer_service` and no `suggest_pick_context` → FALSE → direct-assign round-robin. ✓
- (iii) member_offer bare "yes" round-robin — `member_pick_context`, no `suggest_pick_context` → FALSE. ✓

On TRUE the chain is byte-identical to the existing fresh-member path from `tag-escalate-offer` onward
(`escalate-catalog` escalate_offer branch → `cs-offer-gate` passes CS/order → `get-cs-members` READ →
`build-cs-member-offer` renders member list, sets selection_context='member_offer' → `compile-current-state`).
**No assignment happens on this turn**; the subsequent numeric/name pick resolves via the existing
`output_exchange` member_offer arm → `preferred_assignee_id` → `Call 'sub-human-intervention'` (guarded in test).

---

## 3. Change C — trim CS/order suggest buttons (SPINE-ONLY, gated)

In `build-suggest-offer`, in the **D2 `axis === 'date'`** branch ONLY, drop `YES`/`NO` from
`suggest_quick_reply`, guarded by a CS/order routing check so a hypothetical non-CS date offer keeps them.

Replace, inside `if (axis === 'date') { … }`:
```
out.suggest_quick_reply = [...values, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
```
with:
```
const isCsOrder = (q?.routing?.suggested_team === 'customer_service'
                && q?.routing?.suggested_agent === 'order_enquiries');
out.suggest_quick_reply = (isCsOrder ? [...values] : [...values, YES, NO])
  .map(s => String(s).replace(/,/g, '')).join(',');
```
- `suggest_response` (the offer TEXT) is UNCHANGED — it still says "…or would you like me to escalate to
  {team} team?", so the escalate/decline paths via typed text keep working.
- D1 (product/promotion did-you-mean) and D2-non-date branches are UNTOUCHED → non-CS suggest_offers keep
  their existing buttons. This satisfies "if shared, guard the button-trim."
- `suggest_last_result_set` (the date round-trip payload) is UNCHANGED — tapping/typing a date still resolves.

---

## 4. Part B — DROPPED (no change)

`build-cs-member-offer` (id `build-cs-member-offer-node`) stays numbered TEXT — verified it emits only
`out.response` text, no `quick_reply`. No edit. (User decision: avoid button fatigue.)

---

## 5. ⚠️ Premise conflicts flagged (change request vs live graph)

1. **The "no thanks" decline does NOT reach the `escalation_declined` "Escalation declined." branch on a
   suggest_offer.** Verified in the reformulator: `escalation_declined:true` is set **only** in the
   `member_offer` context (`output_exchange` plain-decline arm). On a **suggest_offer**, `is_affirmative===
   false` maps to `escalation = {is_escalation_confirmation:false}` + `message_type='casual'` (in BOTH
   `suggest-follow-up` and `output_exchange`'s generic offeredEscalation arm) — so `is-escalation-declined`
   (which keys on `escalation.escalation_declined===true`) is FALSE → the turn goes `If2`-FALSE → `If10`-FALSE
   → `is-escalation-declined`-FALSE → `If9` (a casual acknowledgment), NOT the deterministic canned reply.
   Removing the "No, it's okay" button (Part C) does not change this — a typed "no thanks" parses the same way.
   - **RESOLUTION (spine-only, recommended):** accept the current behavior — a suggest decline is a safe
     casual acknowledgment (no escalation, no assign). UAC §D4 asserts THAT (see UAC), not the
     "Escalation declined." literal. This keeps the change spine-only and parser-untouched.
   - **OPTIONAL follow-up (NOT in this change):** to get the literal "Escalation declined." on a suggest
     decline requires a 1-line edit in the reformulator fork `suggest-follow-up` (`is_affirmative===false`
     arm → add `escalation_declined:true`). That is a FORK change → re-tests the parser (scope `parser`) →
     deliberately deferred. Raise separately if the exact literal is required.

2. **`If2`-TRUE fans to TWO targets** (`Call 'sub-human-intervention'` AND `tag-out-of-scope`), not one —
   the divert rewire restores both on its FALSE branch (§2).

3. **Button literals** are `'Yes, escalate'` / `"No, it's okay"` (change request quoted "Yes escalate" /
   "No it's okay"). Cosmetic; the trim removes both regardless.

---

## 6. Verification tasks (must pass during build)

- **V-A1 (parser, one-off dependency check — NOT a code change):** confirm the REAL rebased reformulator
  fork still emits `output.suggest_pick_context === true` + `escalation.is_escalation_confirmation === true`
  + no `preferred_assignee_id` on a genuine suggest_offer "yes" turn (session pre-seeded
  `selection_context='suggest_offer'`, routing CS/order). This underwrites the deterministic mock used in
  UAC §A. If the signal is absent, Change A's condition #2 is unmet — STOP and re-scope.
- **V-A2 (offline unit, 0-token):** feed `divert-suggest-yes`'s condition the four discriminator shapes
  (suggest-yes / member-pick / warehouse-retarget / member-bare-yes) and assert TRUE only for suggest-yes.
- **V-C0 (offline `build-suggest-offer` unit, 0-token) — PRIMARY GATE for Part C:** feed synthetic
  `Call 'sub-get-results'` alternatives with `relaxed_axis:'date'` + routing CS/order and assert
  `suggest_quick_reply` = dates only (no `Yes, escalate`/`No, it's okay`), `suggest_response` still
  contains "would you like me to escalate". Control 1: same but routing NON-CS → buttons retained.
  Control 2: D1 (did-you-mean) + D2-non-date shapes → `suggest_quick_reply` byte-identical to pre-change.
- **V-ref (safety):** re-confirm no node `$()`-references `tag-out-of-scope` / `Call 'sub-human-intervention'`
  output (done in §1.2; re-run after coder's rewire so a skipped node never yields `undefined`).
- **V-empty-roster:** with `get-cs-members` returning an empty array on the divert path, assert
  `build-cs-member-offer` falls back (member_offer=false, plain escalate offer) — no crash, still 0-egress.

---

## 7. Scope + cost tier

**`deterministic`** for the whole change:
- Change A routing + member render + Change C trim are all deterministic spine logic. Inject a
  `mock_reformulator_output` (clone `test-reformulator-bypass` → `mock-reformulator-output`, which returns
  the mock as the sub output, bypassing `suggest-follow-up`) carrying the POST-follow-up shape
  (`suggest_pick_context:true`, `escalation.is_escalation_confirmation:true`, `entities:[]`, routing
  CS/order, no `preferred_assignee_id`) to exercise the divert with **0 parser tokens** (LESSON 28).
- `get-cs-members` is a real CRM **READ** (allowed); no LLM on the path.
- The single `parser`-scope touchpoint is **V-A1** (verify the existing reformulator signal) — a build
  dependency, not a per-case cost tier. The change's tester tier stays `deterministic`.

---

## 8. Promote-to-live mapping (user-gated, per plan.md §5 STEP 5)

All deltas are spine-only; promote the reviewed business-logic diff (guards stripped) to live spine
`9qVyfUxmRQqrpGRMDLRuz` (same node names/ids as the clone):
| clone node (build/test) | live target |
|---|---|
| NEW `divert-suggest-yes` IF + `If2` output#0 rewire (id `ed6f8db9-…`) | add same node + same rewire on live `If2` |
| `build-suggest-offer` (id `7972abd8-5d6b-40ff-9d38-152782cd8091`) date-branch trim | same node on live |
| `tag-escalate-offer` (id `135a1d93-…`), `escalate-catalog`, `cs-offer-gate`, `get-cs-members`, `build-cs-member-offer` | UNCHANGED — reused, no promote |
Do NOT touch the reformulator (fork `CpxE8LroLzCkrAQN` / live `XTODTw-dJcV0uRdC056hG`) — no parser change
ships. Byte-exact/sha-gated promote for the `build-suggest-offer` jsCode (LESSON 25). Backup-first; the
divert node + rewire are net-new on live and must be re-verified against live `If2`'s current targets
(confirm live `If2`-TRUE also fans to `human-intervention` + `tag-out-of-scope` before rewiring).

---

## 9. Acceptance criteria

The change is accepted when ALL hold (evidence: `get_execution(includeData:true)` + redis
`test:egress:{test_run_id}`), every case bound by UAC §0 (S1–S6, zero egress):
1. **Divert fires** — on a CS/order suggest→"yes", `divert-suggest-yes`=TRUE, the member-builder chain
   ran (`build-cs-member-offer` executed, `selection_context==='member_offer'`), and
   `Call 'sub-human-intervention'` did **NOT** execute (no `human-intervention-sub` egress record). No assign.
2. **Member pick still assigns** — a numbered/name pick (prev ctx=member_offer, `preferred_assignee_id` set)
   → `divert-suggest-yes`=FALSE → `Call 'sub-human-intervention'` called (guarded, blocked). No re-divert.
3. **Warehouse retarget preserved** — `retarget_team` mid member_offer → `divert-suggest-yes`=FALSE →
   direct-assign round-robin (guarded). The divert did not swallow it.
4. **Non-CS suggest unchanged** — a non-CS suggest_offer keeps its `Yes, escalate`/`No, it's okay` buttons,
   and its "yes" → `divert-suggest-yes`=FALSE → round-robin (NOT member_offer).
5. **CS/order buttons trimmed** — the CS/order date suggest_offer `suggest_quick_reply` = dates only;
   `suggest_response` still offers escalation in text.
6. **Fresh escalate_offer member_offer unaffected** — a fresh CS/order not-found → member list renders as
   before (divert only adds a node on the `If2`-TRUE arm; the not-found→escalate-catalog path is untouched).
7. **Decline is safe** — a typed "no thanks" on a suggest_offer → casual acknowledgment, no escalation,
   no assign (per §5 flag; NOT the "Escalation declined." literal).
8. **Zero egress** on every case (UAC §0). Any real send/assign = hard fail, halt.
