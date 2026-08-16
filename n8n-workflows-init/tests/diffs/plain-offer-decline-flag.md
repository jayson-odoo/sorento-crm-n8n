# Diff: plain-offer decline sets `escalation_declined` (one-line)

**Change-id:** `plain-offer-decline-flag`
**Feature bucket:** member-offer-retarget-**decline** (NOT domain-continuity — keep separate at promote; see note at bottom)
**Target edited:** fork `wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`), node `output_exchange`.
**Live untouched:** published parser `XTODTw-dJcV0uRdC056hG` and spine `9qVyfUxmRQqrpGRMDLRuz` NOT edited.
**Clone wiring:** `txiPzSxy3Pclsz6v` › `Call 'sub-query-reformulator'` → `wI5RkNGW3EOJfBdo` (re-confirmed after edit).
**Fork version:** before `639cf44f-e810-4e8b-afcc-071bba5dbb4a` → after (published, draft==active) `00157a2e-3938-44c4-99f1-782b1bbcd791`.

## Bug (fork exec 8683248 — "end"/"no" declining a PLAIN escalation offer)
Spine node `is-escalation-declined` fires only on `output.escalation.escalation_declined === true`. That
flag was set ONLY inside the `_selCtx === 'member_offer'` block (output_exchange decline arm, ~L610 —
roster-pick path). A **plain** escalation-offer decline ("Would you like me to escalate to `<team>`?" →
user "no"/"end") is handled EARLIER at the `offeredEscalation && isDecline` branch (~L471–473), which set
`{ is_escalation_confirmation: false }` WITHOUT `escalation_declined`. So plain-offer declines never routed
to the deterministic "Escalation declined." reply — they fell through to the clarification LLM and produced
a contradictory reply.

## The one-line change (node `output_exchange`, plain-offer decline branch)
Before:
```js
} else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp) {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}
```
After:
```js
} else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp) {
  output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
  output.output.message_type = 'casual';
}
```
Nothing else changed. `selection_context` untouched. The `member_offer` block (~L520+) is untouched — its
own decline arm (~L610) already sets `escalation_declined: true` and, in member_offer context, runs AFTER
this branch and overwrites the escalation object with the same flag (verified below), so member_offer
behavior is unchanged.

## Verification
- `node --check` on the edited jsCode: **PASS**.
- Draft re-fetched after `update_workflow` and byte-diffed vs the intended file: **IDENTICAL**; then published;
  active versionId flipped to `00157a2e` (≠ prior `639cf44f`), draft==active.
- Offline unit harness (wraps the REAL node body verbatim, stubs `$('When Executed by Another Workflow')`
  + `$json`) — 6/6 assertions PASS:
  - **A. plain-offer decline** (prev response = "Would you like me to escalate to marketing_product team?",
    `selection_context='suggest_offer'`, `is_affirmative=false`, no position pick, not request_for_help) →
    `escalation = { is_escalation_confirmation:false, escalation_declined:true }`, `message_type='casual'`. ✅ (the fix)
  - **B. member_offer decline** (`selection_context='member_offer'`, `is_affirmative=false`) →
    `escalation_declined === true` (unchanged — served by the L610 arm). ✅
  - **C. plain-offer ACCEPT** (`is_affirmative=true`) → `is_escalation_confirmation === true`,
    NO `escalation_declined`. ✅

## Zero-egress / prod-safety
- Fork-only sub edit; no spine, no live sub, no clone-node edits; no execution run by coder.
- This arm only fires when the PREVIOUS bot response literally matched `/would you like me to escalate/i`,
  i.e. a real prior escalation offer — behavior-scoped, no new egress path introduced.

## PROMOTE NOTE — DO NOT BUNDLE BLINDLY
This is a **SEPARATE** bug from the `parser-domain-continuity-carry` change that also lives on this same fork
(`tests/diffs/parser-domain-continuity-carry.md`). This one-liner belongs to the **member-offer-retarget-decline**
feature (cf. `tests/diffs/member-offer-retarget-fix.md`), NOT to domain-continuity. When promoting to the live
published parser `XTODTw-dJcV0uRdC056hG`, promote this `escalation_declined` one-liner on its own merits and
decision, not as a rider on the domain-continuity diff. The two changes touch the same node body but are
independent business changes.

---

## REVISION 2 (2026-07-15) — the flag was CLOBBERED downstream; now set in TWO nodes

**Symptom re-observed (tester, S2 fail):** even after REVISION 1 set `escalation_declined:true` in
`output_exchange`, the plain-offer ("suggest_offer") decline STILL fell through to the clarification LLM.
Root cause: fork wiring is `output_exchange → suggest-follow-up` (suggest-follow-up is the **terminal**
node of the sub — 0 outbound connections, verified in `.workflow.connections`). On the plain-offer path
(`prevState.selection_context === 'suggest_offer'`), `suggest-follow-up`'s own `is_affirmative === false`
decline arm **rebuilt** the escalation object as `{ is_escalation_confirmation: false }`, dropping the
`escalation_declined:true` that `output_exchange` had just set. So the clone's `is-escalation-declined`
(keys on `escalation?.escalation_declined === true`) saw FALSE → clarification LLM fired → wrong reply for
"end". (member_offer path S5 unaffected: `suggest-follow-up` is inert when `selection_context !== 'suggest_offer'`.)

**Fix (node `suggest-follow-up`, the `is_affirmative === false` decline arm only):**
Before:
```js
} else if (_o.is_affirmative === false) {
  _o.escalation = { is_escalation_confirmation: false };   // drops escalation_declined:true
  _o.message_type = 'casual';
  _o.entities = [];
}
```
After:
```js
} else if (_o.is_affirmative === false) {
  _o.escalation = { is_escalation_confirmation: false, escalation_declined: true };
  _o.message_type = 'casual';
  _o.entities = [];
}
```
Nothing else in `suggest-follow-up` changed. The `is_affirmative === true` (escalate) and the
entity/position-pick arms are untouched, and the whole block stays inert when `selection_context !== 'suggest_offer'`.

**Downstream-clobber check:** `suggest-follow-up` is the LAST node in the sub (connections:
`When Executed → test-reformulator-bypass → {mock-reformulator-output | AI Agent} → output_exchange → suggest-follow-up`,
and `suggest-follow-up` has no outbound edge). **No node runs after it** that could strip `escalation_declined`
again. So the flag now survives to the clone. Two nodes total now assert the flag on decline:
`output_exchange` (REVISION 1, plain-offer branch ~L471–473, member_offer arm ~L610) and `suggest-follow-up`
(this revision, plain-offer decline arm).

**Fork version:** before `00157a2e-3938-44c4-99f1-782b1bbcd791` → after (published, draft==active)
`f7e6afd0-83c2-4887-94b0-fef5e1c59c07`.

**Verification (REVISION 2):**
- `node --check` on the new `suggest-follow-up` jsCode: **PASS**.
- Draft re-fetched after `update_workflow`, byte-diffed vs intended: **IDENTICAL** (only a trailing-newline
  cosmetic diff); published; active flipped `00157a2e` → `f7e6afd0`, draft==active.
- Offline unit harness (runs the REAL `suggest-follow-up` body verbatim, stubs
  `$('When Executed by Another Workflow')` + `$input`) — 10/10 assertions PASS:
  - **T1** `selection_context='suggest_offer'`, `is_affirmative=false`, escalation already
    `{is_escalation_confirmation:false, escalation_declined:true}` from output_exchange →
    keeps `escalation_declined===true`, `is_escalation_confirmation===false`, `message_type==='casual'`,
    `suggest_pick_context===true`. ✅ (the fix)
  - **T2** `suggest_offer` + `is_affirmative=true` → `is_escalation_confirmation===true`,
    NO `escalation_declined`. ✅
  - **T3** non-suggest_offer context (`member_offer`) → escalation/message_type/entities untouched,
    no `suggest_pick_context` added. ✅
- Clone `txiPzSxy3Pclsz6v` › `Call 'sub-query-reformulator'` → still `wI5RkNGW3EOJfBdo` (re-confirmed after edit).

**Promote note (unchanged intent):** when promoting to live `XTODTw-dJcV0uRdC056hG`, BOTH decline sites must
carry `escalation_declined:true` — the `output_exchange` plain-offer/member arms AND the `suggest-follow-up`
plain-offer decline arm — or the live spine will re-hit this clobber. Still a member-offer-retarget-decline
change, still independent of domain-continuity.
