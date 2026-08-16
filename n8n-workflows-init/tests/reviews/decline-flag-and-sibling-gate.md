# Review: plain-offer decline flag + sibling-picker all-no-incoming gate tweak

Two small changes, both on the fork/clone; live spine `9qVyfUxmRQqrpGRMDLRuz`, live sub `XTODTw`
UNTOUCHED. Reviewed from the deployed node bodies (MCP `get_workflow_details`), the coder node-diffs, and
tester run `runs/escalation-casual-suite-20260715.json`. Promotion is user-gated; these verdicts authorize
it subject to the consolidated PROMOTE NOTE.

Deployed state at review time:
- Fork `wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`): versionId ==
  activeVersionId == **`732fdeeb-bced-432c-becb-64db0463a888`** (published, draft==active).
- Clone `txiPzSxy3Pclsz6v`: versionId == activeVersionId == **`6af34046-2f4a-4773-8a9d-7e929ea41efd`**
  (published, draft==active).

---

## Review 1 — plain-offer decline flag — **APPROVE**

### Findings (verified byte-for-byte on the current fork `732fdeeb`)
All THREE decline sites carry `escalation_declined: true`, with correct guards and accept-paths untouched:

- **`output_exchange` plain-offer arm** (L519-524): accept `offeredEscalation && isAffirmative` → `{ is_escalation_confirmation: true }` only (no decline flag). Decline `offeredEscalation && isDecline && !_isPositionPick && !_reqHelp` → `{ is_escalation_confirmation: false, escalation_declined: true }`, `message_type='casual'`. The position-pick / request-help guards are intact, so a numbered choice or a help ask never collapses to a decline. ✔
- **`output_exchange` member_offer arm** (L653-662, the ~L610 site in the diff): accept (L654) → `{ is_escalation_confirmation: true }` (round-robin) unchanged; decline (L655-661) → `escalation_declined: true`. Member_offer behaviour unchanged. ✔
- **`suggest-follow-up` decline arm** (L26-31): whole block gated on `prevState.selection_context === 'suggest_offer'` (L9), so it is inert for member_offer (which is served by `output_exchange` L660, no clobber). Accept arm (L22-25) sets `is_escalation_confirmation: true` with NO decline flag; decline arm (L28) → `escalation_declined: true`. ✔

**Terminal-node / no-clobber confirmed from `.connections`:** `output_exchange → suggest-follow-up`, and
`suggest-follow-up` has **no outbound edge** — it is the last node in the sub. Nothing runs after it to strip
the flag. This closes the REVISION-2 clobber root-cause.

**Consumer is LIVE.** The spine node `is-escalation-declined` already exists on the ACTIVE live spine
(draft==active `bcdb5633`) and keys on exactly
`$('Call 'sub-query-reformulator').first().json.output.escalation?.escalation_declined === true`. So the flag
this change sets has a live consumer already — promoting the setter to `XTODTw` will take effect standalone.
It does NOT require any additional spine node to land first, and it is independent of the (pending)
member-offer-retarget-decline promote (its `is-escalation-declined` / `tag-escalation-declined` nodes are
already on live).

### Zero-egress re-confirmation
This change only rewrites an output flag; it adds no node and no egress path. Tester run
`escalation-casual-suite-20260715.json`: after the fix, **7/7 PASS**, §0 zero-egress GREEN across all 16
original + 6 retest turns. S2 (plain-offer decline, both "end" and "no it's okay") now → deterministic
"Escalation declined.", clarification Basic LLM Chain does NOT fire; S5 (member_offer decline) unchanged
(no regression). S-CRED gate GREEN (all pg nodes → `n8n_test-db` `Dnnofg8Xb27VQOhI`, none bind prod);
human-intervention → guarded fork `vUfFUDjLAuMaeQE6` (`is_test=true`); no respond.io send, no assign/SLA/PIC,
no prod PUT; get-results reads only.

### Version-drift note (accepted, not blocking)
The tester retested at fork `f7e6afd0`; the current deployed fork is `732fdeeb` — a later co-resident edit
landed (the domain-continuity-carry pick branch in `suggest-follow-up` L13-21 and the domain-carry in
`output_exchange`). I re-verified all three `escalation_declined` hunks are byte-present and correctly
guarded at `732fdeeb`, and the later edit does not touch any decline arm. Promote from the reviewed
byte-state (the three leaves), not from a re-typed copy.

---

## Review 2 — sibling-picker `anyHasIncoming` gate tweak — **APPROVE**

Post-APPROVE delta on the already-approved phase-1 picker (`reviews/query-forward-sibling-picker.md`,
clone `3246db0c`). Current clone `6af34046` = phase-1 + the `anyHasIncoming` split + the later
dym-candidate-map feature.

### Findings (verified byte-for-byte on the current clone `6af34046`)
`build-suggest-offer` D3 (`7972abd8`) now splits the ≥1-sibling case on `anyHasIncoming = sibs.some(s=>s.has)`
(L69). Sort (has-first, then code) and `exactList` computed once before the split (L71-72):
- **`anyHasIncoming === true` → combined numbered picker** (L73-89): numbered list of all siblings, "Reply
  with a number… or 'yes' to escalate to `${team}`", `suggest_last_result_set` = all siblings with
  `{idx,label,value,product,uuid,entity_type}` (positional pick armed), `suggest_quick_reply=[YES,NO]`,
  `return out`. This leg is byte-identical to the pre-tweak (phase-1, e2e-proven) picker.
- **`anyHasIncoming === false` → list-only + escalate-only** (L91-109): every sibling listed "— no incoming"
  with NO numbers, no number-pick invite, "Would you like me to escalate to `${team}` team?"; SAME
  `suggest_offer` envelope (`suggest_offer=true`, `selection_context='suggest_offer'`),
  `suggest_quick_reply=[YES,NO]` only, **`suggest_last_result_set = []`**, `return out`.
- **`extras.length === 0`** (only the exact code) → falls through to plain escalate (L111). ✔

**Empty last_result_set is safe — verified against the actual fork nodes (read-only, not edited):**
- A stray typed number: the parser sets `reference_positions=[N]`, but `output_exchange`'s
  "REFERENCE POSITIONS → ENTITIES" builds `byIdx` from `last_result_set` (empty) → the position is
  out-of-range → `entities=[]`, `positions_resolved=0`. No sibling entity is fabricated; **a stray number
  cannot mis-pick.** Worst case is an entity-less business_query re-query (no egress, no wrong data) — matches
  the coder's "resolves nothing" claim.
- A plain "yes"/"no" routes through `suggest-follow-up`'s `is_affirmative` arms: yes → escalate `${team}`
  (=purchasing for incoming), no/"end" → the decline arm (Review 1) → `escalation_declined:true` →
  deterministic "Escalation declined." **Reconciliation intact.** ✔

**Co-residency / no-regression confirmed:** D1 (per-token did-you-mean, code + uuid numbered modes), D2
(alternatives — date/entity/uuid modes), the UUID-leak guard, the zero-siblings fall-through, and the ALL
dym-candidate-map hunks (`isDateLike`/`isCodeShaped`, `dym_candidates` in D1 both modes + D2 both modes, the
FINDING-1 `axis!=='date'` scoping) are all present and intact below/around the D3 block. D3 is block-scoped
(L33-114) and inert unless `sibXfRan && sibProbeRan && domIncoming` — no identifier leakage into D1/D2.
All 4 sibling nodes (`sibling-gate`/`family-fetch`/`sibling-transform`/`sibling-probe`) still present;
connections into `build-suggest-offer` = `annotate-incoming-picker` + `sibling-gate` + `sibling-probe`
(topology matches phase-1).

### Zero-egress
Code-only change inside one Code node; no new node, no rewire, SAME `suggest_offer` envelope. Phase-1 already
re-confirmed §0 S1-S6 across 8 clone execs; this tweak introduces no egress surface. The new all-no-incoming
leg is strictly LESS interactive (drops numbers) — no new CRM touch, no send/assign/write.

### On the missing targeted e2e (judgement)
The tweak was not separately e2e'd (data scarcity — no all-has-incoming-sibling family in current data; and
the new leg is the all-NO-incoming path). I judge **offline 23/23 + the prior phase-1 e2e sufficient to
approve**, because: (a) the combined-picker leg is byte-identical to the e2e-proven phase-1 picker; (b) the
new all-no-incoming leg is a pure Code render + empty `last_result_set`, with no egress surface; (c) its two
continuation risks (mis-pick, yes/no reconcile) are verified structurally against the real fork
`output_exchange`/`suggest-follow-up` above. **Recommend a first-live-family sanity watch** (same posture as
phase-1's Q3 gap): eyeball the first live incoming-miss whose family is entirely no-incoming, and one with
≥1 incoming, on the first day post-promote. Not a blocker.

---

## CONSOLIDATED PROMOTE NOTE — how these co-reside on the two live targets

Two independent live targets; strip all guard/TEST scaffolding (clone `is_test` wiring, TEST-fork targets).
Backup-first (capture prior versionId + changed node shas), sha-verify draft before publish and active after
(LESSON 25), beware the stale-draft revert-landmine (LESSON 24), never edit live mid-cycle.

### A. Reformulator sub `XTODTw-dJcV0uRdC056hG` (decline-flag)
- Byte-splice the **three `escalation_declined:true` leaves ONLY**: `output_exchange` plain-offer decline arm
  + `output_exchange` member_offer decline arm + `suggest-follow-up` decline arm. Do NOT hand-retype the
  surrounding bodies.
- These three sites are **co-resident on the fork with domain-continuity-carry** (the `suggest-follow-up`
  pick/domain-inherit block L13-21 and the `output_exchange` domain-carry). If domain-continuity is being
  promoted in the same pass, port both features from the reviewed byte-state; if NOT, splice only the three
  decline leaves and leave the domain-continuity code out. They are independent business changes on the same
  node bodies.
- **No ordering dependency for functionality:** the consumer `is-escalation-declined` is already live and
  keys on `escalation?.escalation_declined === true`. Promoting these three leaves makes deterministic decline
  work for BOTH plain (suggest_offer) and member_offer declines immediately. Independent of the
  member-offer-retarget-decline promote.

### B. Spine `9qVyfUxmRQqrpGRMDLRuz` (sibling D3 picker) — ENTANGLEMENT FLAG
- **The phase-1 checklist step "sha/byte-diff live D1/D2, then splice ONLY the D3 block" is now INVALID.**
  Live `build-suggest-offer` is 218 lines with **NO dym-candidate-map and NO D3**; the clone is 358 lines with
  **BOTH**. Live's D1/D2 no longer byte-matches the clone's D1/D2 (the clone added `isDateLike`/`isCodeShaped`
  + `dym_candidates` in D1/D2 + the FINDING-1 date scoping). So D3 cannot be cleanly spliced onto live's older
  body.
- **Resolve at promote:** either (i) port the WHOLE reviewed clone `build-suggest-offer` body (brings
  dym-candidate-map + D3 together — requires the dym change to be an approved promote too), or (ii) promote the
  dym-candidate-map change first, then splice D3 onto the dym-updated live body. Do NOT drop dym by
  splicing D3 onto the stale live body.
- Still required from phase-1: port the 4 new nodes byte-exact (`sibling-gate` IF, `family-fetch` GET,
  `sibling-transform` Code, `sibling-probe` executeWorkflow) and **remap `sibling-probe.workflowId` from the
  TEST get-results fork `rysSPgUssLDf6xJc` → live `Fss5aAaXthJSWpZCgKiKR`**; verify `family-fetch`'s hardcoded
  `x-api-key` equals the live spine key; rewire connections as on the clone; confirm all `$('…')` node-name
  refs exist on live.

### C. Cross-stack ordering (functional, not egress)
- The D3 **combined-picker (`anyHasIncoming`) leg**'s number→re-query continuation still depends on
  **domain-continuity-carry being live on `XTODTw`** (phase-1 dependency — a positional/entityless pick must
  inherit `domain_hint:incoming`). The **all-no-incoming leg** does NOT (it offers no numbers).
- The D3 **all-no-incoming leg**'s "no"/"end" decline depends on the **decline-flag (A)** being live (its
  consumer `is-escalation-declined` already is). Its "yes"→escalate works regardless.
- **Recommended order:** promote the reformulator changes (domain-continuity + decline-flag) to `XTODTw`
  first (or in the same pass), THEN the spine change (dym-candidate-map + D3). Shipping D3 alone onto a
  reformulator lacking domain-continuity yields a half-working combined picker; shipping the all-no-incoming
  decline without the decline-flag falls through to the clarification LLM.

---

## Bottom line
- **Review 1 (plain-offer decline flag): APPROVE.** Three flag sites correct + guarded, no-clobber confirmed
  (terminal `suggest-follow-up`), live consumer already present, tester 7/7 + §0 GREEN. Zero egress.
- **Review 2 (sibling `anyHasIncoming` tweak): APPROVE.** Split correct, empty `last_result_set` proven safe
  (no mis-pick, yes/no reconciles), D1/D2/dym/zero-siblings co-resident and intact, Code-only / no egress
  surface; offline 23/23 + prior e2e suffice, with a first-live-family sanity watch.
- Both zero-egress re-confirmed. Carry the two promote entanglements into the user-gated promote:
  (A) decline-flag = splice 3 leaves on `XTODTw`, consumer already live; (B) D3 = must reconcile with the
  clone-only dym-candidate-map on `build-suggest-offer` (the phase-1 "splice-only-D3" step is superseded).
