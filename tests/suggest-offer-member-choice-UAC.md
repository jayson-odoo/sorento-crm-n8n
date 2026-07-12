# UAC — `suggest-offer-member-choice` (CS/order suggest_offer "yes" → member choice)

Plan: `../plans/suggest-offer-member-choice.md`. **Change-level scope: `deterministic`** — parser
bypassed via injected `mock_reformulator_output` (post-`suggest-follow-up` shape) at the clone's
`test-reformulator-bypass` (0 parser tokens); `get-cs-members` runs as a real CRM **READ** (allowed).
Build/test target: clone spine `txiPzSxy3Pclsz6v`. Contact `437264483` (FULL access) for every case.
Every case is bound by **§0** — that is the acceptance gate.

> Redis seed shape (per `fix-gate-render-notfound-msg` §3): push `main-message-list-test` →
> `execute_workflow(txiPzSxy3Pclsz6v)` → `get_execution(includeData:true)` + read
> `test:egress:{test_run_id}`. `mock_reformulator_output` present ⇒ reformulator bypassed; it must carry
> the POST-`suggest-follow-up` output shape (the bypass skips `suggest-follow-up`).
> Multi-turn / session-dependent cases (member_offer pick, warehouse retarget) pre-seed
> `respond_contacts_test` for `437264483` in `mode=regress-capture` (LESSON 31) and re-seed between
> independent cases.

---

## §0. MANDATORY safety checklist (applies to EVERY case) — from the base harness

A case PASSES only if all hold (from `get_execution(includeData:true)` + redis `test:egress:{test_run_id}`):
- **S1** — zero real WhatsApp/comment sends; every sendmsg path is a `{guard:"sendmsg-sub",blocked:true}`
  egress record; no `api.respond.io/.../message` POST executed.
- **S2** — zero assignment/escalation writes: inside `sub-human-intervention` NONE of `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the
  assignee-queue `Redis` push executed; if escalation was taken the sub recorded
  `{guard:"human-intervention-sub",blocked:true}` and returned before `get-round-robin-assignee`.
- **S3** — zero CRM/contact writes (`save-session-vars` PUT, `update-human-intervened`) executed; each is a
  `would_write, blocked:true` egress record.
- **S4** — get-results writes never fired; resolved tool in the READ allowlist, never
  `crm_it_support_ticket_create`.
- **S5** — `is_test`/`test_run_id` provably present in every invoked sub's inputs.
- **S6** — token sinks bounded: `deterministic` ⇒ no LLM node executed (mock consumed).

> If S1–S5 cannot be affirmatively verified, treat as **FAIL and halt** — a real egress means the
> kill-switch leaked. **S2 is the focus of this change** (the whole point is to defer/route assignment).

---

## Mock shapes (reused across cases)

`M-suggest-yes` (post-follow-up shape for a CS/order suggest→"yes escalate"):
```jsonc
{ "output": {
    "message_type": "casual", "domain_hint": null, "user_goal": "escalate",
    "entities": [],
    "routing": { "suggested_team": "customer_service", "suggested_agent": "order_enquiries" },
    "escalation": { "is_escalation_confirmation": true },
    "suggest_pick_context": true, "access_levels": []
} }
```
`M-suggest-no` (typed "no thanks" on a suggest_offer):
```jsonc
{ "output": { "message_type": "casual", "entities": [], "is_affirmative": false,
    "routing": { "suggested_team": "customer_service", "suggested_agent": "order_enquiries" },
    "escalation": { "is_escalation_confirmation": false },
    "suggest_pick_context": true, "access_levels": [] } }
```
`M-member-pick` (numeric/name pick in member_offer — UNCHANGED path): `escalation:{is_escalation_confirmation:true,
preferred_assignee_id:"u-lee"}`, `member_pick_context:true`, `entities:[]`, routing CS/order. (No `suggest_pick_context`.)
`M-warehouse-retarget`: `message_type:"request_for_help"`, `routing:{suggested_team:"warehouse", suggested_agent:"general_enquiries"}`,
`escalation:{is_escalation_confirmation:true, retarget_team:true}`, `member_pick_context:true`. (No `suggest_pick_context`.)
`M-nonCS-suggest-yes`: like `M-suggest-yes` but `routing.suggested_team:"purchasing"`, `suggested_agent:"incoming_stock_enquiries"`.

---

## §V0. Offline `build-suggest-offer` unit — PRIMARY GATE for Part C (0-token, no seed)
Feed the node synthetic upstream (`$input.first().json`, `Call 'sub-query-reformulator'`,
`Call 'sub-get-results'`, `resolve-entity`, `disallowed-entity-gate`) and assert its output object.
- **V0-a — CS/order date offer (the trim):** `Call 'sub-get-results'` one run with
  `{alternatives:[{value:"2026-07-08",display:"Tue 08 Jul"},{value:"2026-07-10",display:"Thu 10 Jul"}],
  relaxed_axis:"date"}`; reformulator `routing:{suggested_team:"customer_service",suggested_agent:"order_enquiries"}`,
  `domain_hint:"order"`, a `customer` entity. **Assert:** `suggest_offer===true`;
  `suggest_quick_reply === "2026-07-08,2026-07-10"` (dates ONLY — NO `Yes, escalate`, NO `No, it's okay`);
  `suggest_response` contains "No delivery on" AND "would you like me to escalate"; `suggest_last_result_set`
  length 2 with the date values.
- **V0-b — NON-CS date offer (control, keeps buttons):** same but routing `suggested_team:"warehouse"`.
  **Assert** `suggest_quick_reply === "2026-07-08,2026-07-10,Yes, escalate,No, it's okay"` (buttons retained).
- **V0-c — D1 did-you-mean product (control, byte-identical):** `resolve-entity` one unresolved token with a
  real-code candidate (e.g. `CWCX605-RL`, `match_tier:"prefix"`). **Assert** `suggest_quick_reply` starts
  `"CWCX605-RL,Yes, escalate,No, it's okay"` (unchanged); the trim did NOT touch D1.
- **V0-d — D2 non-date (control, byte-identical):** alternatives with `relaxed_axis:"entity"` (code list),
  routing non-CS. **Assert** `suggest_quick_reply` ends `",Yes, escalate,No, it's okay"` (unchanged).
- **Safety:** offline unit, no egress.

## §V0b. Offline `divert-suggest-yes` condition unit (0-token) — PRIMARY GATE for Change A discriminator
Evaluate the divert boolean against each mock's `output`. **Assert TRUE only for `M-suggest-yes`**;
FALSE for `M-member-pick`, `M-warehouse-retarget`, `M-nonCS-suggest-yes`, and a member-bare-yes shape
(`member_pick_context:true`, `escalation:{is_escalation_confirmation:true}`, routing CS/order, no
`suggest_pick_context`). Pins that `suggest_pick_context` is the load-bearing discriminator.

---

## §A. Divert — CS/order suggest→"yes escalate" → member picker, NO assign  (contact `437264483`) — Change A
- **Trigger:** typed `"yes escalate"` on a live CS/order date suggest_offer · `437264483` ·
  `scope: deterministic` · `mock_reformulator_output = M-suggest-yes`.
- **Expect-branch:** `If5`→`If2` TRUE (is_escalation_confirmation) → `divert-suggest-yes` **TRUE** →
  `tag-escalate-offer` → `escalate-catalog`(escalate_offer, is_escalate_offer=true) → `cs-offer-gate`
  (g1/g2/g3 pass) → `get-cs-members` (real READ) → `build-cs-member-offer` → `compile-current-state`.
- **Expect-output (structural):**
  - `divert-suggest-yes` output#0 (TRUE) taken; `build-cs-member-offer` executed with
    `member_offer===true`, `selection_context==='member_offer'`, `cs_last_result_set` a non-empty array of
    `{idx,label,uuid,respond_user_id}`; `compile-current-state.variables.selection_context==='member_offer'`.
  - the would-send message (egress `sendmsg-sub` record) is the numbered picker text ("Please choose who to
    route to (reply with the number): 1. … 2. …").
  - **`Call 'sub-human-intervention'` did NOT execute** — NO `{guard:"human-intervention-sub"}` record.
- **Safety:** §0 all. **S2 is the point:** no assignment/SLA/comment/queue write; the member list is shown,
  nothing is assigned this turn.
- **TBD contact needed?** No.

## §B. Member pick after the divert still assigns  (contact `437264483`) — regression (member pick UNCHANGED)
- **Trigger:** reply `"2"` (then a separate case `"Nur"`) while `selection_context==='member_offer'` from §A ·
  `437264483` · `scope: deterministic` · `mock_reformulator_output = M-member-pick` (idx-2 uuid) / a
  name-pick mock. (Session pre-seeded member_offer per LESSON 31; or inject the resolved escalation directly.)
- **Expect-branch:** `If2` TRUE → `divert-suggest-yes` **FALSE** (no `suggest_pick_context`,
  `preferred_assignee_id` present) → `Call 'sub-human-intervention'` + `tag-out-of-scope` (original targets).
- **Expect-output:** egress `{guard:"human-intervention-sub", blocked:true, would_write:{contact_id, agent,
  team, current_assignee, explicit_assignee_id:"u-lee"}}`; the sub short-circuited (returned before
  `get-round-robin-assignee`). The divert did NOT re-show the member list.
- **Safety:** §0 all. **S2 focus** — `preferred_assignee_id` set but NO real assign fired (guarded).
- **TBD contact needed?** No.

## §C. Warehouse retarget mid member_offer → direct-assign round-robin  (contact `437264483`) — regression (must not swallow)
- **Trigger:** `"no, I want warehouse"` mid member_offer · `437264483` · `scope: deterministic` ·
  `mock_reformulator_output = M-warehouse-retarget`.
- **Expect-branch:** `If2` TRUE → `divert-suggest-yes` **FALSE** (`suggested_team!=='customer_service'`, no
  `suggest_pick_context`) → `Call 'sub-human-intervention'` (round-robin direct-assign to warehouse).
- **Expect-output:** egress `{guard:"human-intervention-sub", blocked:true}` with `team:"warehouse"`; the
  divert did not divert to the CS member list. `divert-suggest-yes` TRUE branch NOT taken.
- **Safety:** §0 all. S2 — no real assign (guarded).
- **TBD contact needed?** No.

## §D4. Decline — typed "no thanks" on a suggest_offer → safe casual, NO assign  (contact `437264483`) — ⚠️ premise-corrected
> ⚠️ Plan §5 flag: a suggest_offer decline does NOT reach the `escalation_declined` "Escalation declined."
> branch (that literal is member_offer-only). The correct, safe behavior is a casual acknowledgment.
- **Trigger:** typed `"no thanks"` on the CS/order suggest_offer · `437264483` · `scope: deterministic` ·
  `mock_reformulator_output = M-suggest-no`.
- **Expect-branch:** `If2` FALSE (is_escalation_confirmation false, not request_for_help) → `If10` FALSE →
  `is-escalation-declined` **FALSE** (`escalation.escalation_declined` not set) → `If9` (casual path) →
  guarded send.
- **Expect-output:** `divert-suggest-yes` NOT reached; `Call 'sub-human-intervention'` did NOT execute;
  no `selection_context` re-set to member_offer; the would-send message is a casual acknowledgment
  (non-empty). **Do NOT assert the literal "Escalation declined."** (see flag). No escalate, no assign.
- **Safety:** §0 all. S2 — no assignment write.
- **TBD contact needed?** No.

## §E. Date pick on the suggest_offer → re-query, not member/assign  (contact `437264483`) — regression (suggest date pick UNCHANGED)
- **Trigger:** type a date alternative (e.g. `"2026-07-08"`) on the suggest_offer · `437264483` ·
  `scope: parser` (real reformulator, to exercise `suggest-follow-up`'s pick arm) with the suggest_offer
  session seeded; OR `scope: deterministic` with a mock whose `output` sets an entity/domain-inherited pick
  (`suggest_pick_context:true`, `escalation.is_escalation_confirmation` NOT true, `domain_hint` inherited).
- **Expect-branch:** `If2` FALSE (is_escalation_confirmation not true) → normal business_query re-query in the
  retained domain → get-results (real READ). `divert-suggest-yes` NOT reached; NO member list; NO assign.
- **Expect-output:** the pick re-queries the chosen date; `Call 'sub-human-intervention'` did NOT execute;
  no `preferred_assignee_id`. Proves the button-trim (Part C) did not break the typed date pick.
- **Safety:** §0 all. S4 get-results read tool only.
- **TBD contact needed?** No.

## §F. Non-CS suggest_offer — buttons UNCHANGED, "yes" → prior behavior (NOT member_offer)  (contact `437264483`) — regression
- **Trigger:** a NON-CS suggest_offer (e.g. inventory/incoming did-you-mean or a non-CS D2 date offer) — its
  "yes escalate" · `437264483` · `scope: deterministic` · `mock_reformulator_output = M-nonCS-suggest-yes`.
  (Render-side asserted offline in §V0-b/c/d; this row asserts the runtime routing.)
- **Expect-branch:** `If2` TRUE → `divert-suggest-yes` **FALSE** (`suggested_team!=='customer_service'`) →
  `Call 'sub-human-intervention'` round-robin (unchanged) + `tag-out-of-scope`.
- **Expect-output:** NO member list; egress `{guard:"human-intervention-sub", blocked:true}` with the non-CS
  team; `build-cs-member-offer` did NOT execute. **If no non-CS suggest_offer currently exists in the live
  data, mark the render half N/A and rely on §V0-b/c/d + this mock-driven routing assertion.**
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §G. Fresh escalate_offer member_offer still works  (contact `437264483`) — regression (pre-existing path)
- **Trigger:** a fresh CS/order query that misses and offers escalation, e.g. `"status of order
  SMC202606-9999"` (does not exist) · `437264483` · `scope: deterministic` · `mock_reformulator_output`
  = one `{hint:"order", raw:"SMC202606-9999", confident:true}` entity, `domain_hint:"order"`,
  `routing.suggested_team:"customer_service"`, `suggested_agent:"order_enquiries"`. `resolve-entity` real READ.
- **Expect-branch:** miss → `not-found-error-message` → `build-suggest-offer` (no candidates ⇒ suggest_offer
  false) → `tag-not-found` → `escalate-catalog`(not_found, `is_escalate_offer = !is_clarification = true`) →
  `cs-offer-gate` passes → `get-cs-members` READ → `build-cs-member-offer` → member list. (This path does NOT
  traverse `If2`, so the divert node is irrelevant to it — proving the divert did not regress it.)
- **Expect-output:** member list renders (`member_offer===true`, `selection_context==='member_offer'`);
  no assign; would-send = numbered picker. Byte-identical to pre-change on this turn.
- **Safety:** §0 all.
- **TBD contact needed?** No.

---

## Coverage / blockers summary

| #   | Branch / assertion                                                | Contact   | Scope         | Blocked by |
|-----|-------------------------------------------------------------------|-----------|---------------|------------|
| V0-a| offline: CS/order date offer → dates-only buttons (PRIMARY, Part C)| (offline) | deterministic | — |
| V0-b| offline: non-CS date offer → buttons retained (control)           | (offline) | deterministic | — |
| V0-c| offline: D1 did-you-mean → buttons byte-identical (control)        | (offline) | deterministic | — |
| V0-d| offline: D2 non-date → buttons byte-identical (control)            | (offline) | deterministic | — |
| V0b | offline: divert condition TRUE only for suggest-yes (PRIMARY, A)   | (offline) | deterministic | — |
| A   | divert: CS/order suggest→yes → member picker, NO assign            | 437264483 | deterministic | V-A1 (real reformulator emits `suggest_pick_context`) |
| B   | regression: member pick still assigns (guarded)                   | 437264483 | deterministic | member_offer session seed (LESSON 31) |
| C   | regression: warehouse retarget → direct round-robin (guarded)     | 437264483 | deterministic | — |
| D4  | ⚠ decline "no thanks" → safe casual, NO assign (premise-corrected) | 437264483 | deterministic | — |
| E   | regression: suggest date pick → re-query, not member/assign        | 437264483 | parser/det    | suggest_offer seed (parser variant) |
| F   | regression: non-CS suggest → buttons + "yes" round-robin unchanged | 437264483 | deterministic | non-CS suggest_offer may be N/A (render offline) |
| G   | regression: fresh escalate_offer member_offer still works          | 437264483 | deterministic | — |

Cheapest gates first: **§V0 (Part C render) + §V0b (Change A discriminator)** offline units are the primary
correctness gates; §A–§G are the e2e runtime confirmation. **V-A1** (plan §6) is a one-off parser-scope
dependency check that the real reformulator still emits `suggest_pick_context` on a suggest "yes" — it
underwrites the `M-suggest-yes` mock; if it fails, STOP (Change A condition #2 unmet).

Allowed-to-change golden nodes: NEW `divert-suggest-yes` + the `If2` output#0 rewire, and
`build-suggest-offer`'s D2 date-branch, ONLY. `tag-escalate-offer`, `escalate-catalog`, `cs-offer-gate`,
`get-cs-members`, `build-cs-member-offer`, `build-cs-member-offer` and all unrelated turns must be
byte-identical (the divert only adds a node on the `If2`-TRUE arm; D1/D2-non-date suggest renders unchanged).
