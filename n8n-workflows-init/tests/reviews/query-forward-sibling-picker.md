# Review: `query-forward-sibling-picker` — PHASE 1

**Verdict: APPROVE** (phase-1, single resolved product) — zero-egress re-confirmed on all 8 clone execs.
Promotion to the LIVE spine is user-gated; this authorizes it subject to the PROMOTE CHECKLIST below.

- Change target reviewed: clone `txiPzSxy3Pclsz6v`, versionId `3246db0c-493f-46f6-8de1-f0e001a01135`
  (**draft == active == published** — verified via `get_workflow_details`).
- Live spine `9qVyfUxmRQqrpGRMDLRuz`, live sub `XTODTw`, reformulator fork `wI5RkNGW3EOJfBdo` = UNTOUCHED (confirmed).
- Reviewed from: deployed clone node bodies (MCP), the coder node-diff, and tester run
  `runs/sibling-picker-Q-suite-20260715.json`. The coder's scratch sources were ephemeral/gone, so all
  claims were re-verified against the LIVE-deployed clone, which is authoritative.

---

## 1. Correctness of the D3 arm + gate — CONFIRMED

**Gate (`sibling-gate`, id `c7a42d36`) — 4 AND conditions, verified byte-for-byte on the clone:**
- `sg-dom` — `disallowed-entity-gate.gate_debug.domain === 'incoming'` (same domain source `If-incoming-picker` uses).
- `sg-req` — `require_specific !== true` (excludes the ambiguous-picker path).
- `sg-prod` — `compatible_entities.some(product with non-uuid code)` (UUID_RE guard; an exact product to build a family from).
- `sg-empty` — `$('validator').isExecuted && $('validator').first().json.has_result === false`.

The **4th condition (`sg-empty`) is a correct, additive tightening** of the plan's 3, not a deviation. It is the
precision guard that restricts D3 to the genuine get-results-empty path:
- **Target path** (`If3 FALSE → get-results → validator → If6 FALSE → Loop → Aggregate1 → not-found-error-message`):
  validator ran, `has_result===false` → `sg-empty` TRUE. Fires. ✔ (tester Q1, exec 8696461).
- **`If-incoming-picker[FALSE]` access path** (`If3 TRUE`, so get-results/validator never ran): `$('validator').isExecuted`
  short-circuits FALSE → `sg-empty` FALSE → gate FALSE → build-suggest-offer unchanged. **Not swallowed.** ✔
  Double-protected here because `sg-prod` also fails when the token is unresolved (tester Q7c, exec 8697629).
- **Ambiguous incoming picker** (`If-incoming-picker[TRUE] → annotate-incoming-picker → build-suggest-offer`) bypasses
  `sibling-gate` entirely (its edge into build-suggest-offer is unchanged) → D3 inert. ✔ (tester Q7b, exec 8697207).
- **Happy path** (`If6 TRUE`) never reaches not-found-error-message → never reaches the gate. ✔

**D3 arm in `build-suggest-offer` (id `7972abd8`) — verified:**
- The D3 logic is a single block-scoped `{ … }` inserted **after the node locals** (`out,q,r,gate,team,YES,NO,cap3,humanList`)
  and **before** the UUID-leak guard / D1 / D2 code. All D3 identifiers (`normC,seenC,fam,probe,sibs,exactCodes,extras…`)
  are block-scoped — no leakage into D1/D2.
- Fires only when `$('sibling-transform').isExecuted && $('sibling-probe').isExecuted && domain==incoming`; otherwise
  falls straight through to the original code. When it builds an offer it `return out` immediately (same pattern as D1/D2).
- **D1/D2/escalate/ambiguous-picker arms are additive-safe:** the code below the D3 block (lines 86–283) is the standard
  shipped build-suggest-offer (per-token did-you-mean, promo-uuid numbered mode, comma-strip, D2 alternatives) and is
  structurally untouched by the D3 insertion. Tester Q6/Q7a/Q7b/Q7c confirm D1/D2/plain-escalate behave as before.
  *(Byte-identity of D1/D2 vs the LIVE spine cannot be proven from the clone alone — see PROMOTE step 3.)*
- Zero-extras guard: `extras = sibs.filter(!exactCodes.has(code))`; `extras.length===0` → falls through → plain escalate.
  Verified live: Q6 (SRT7926, self-only → fell to pre-existing D2) exec 8697410.
- Sort `(Number(b.has)-Number(a.has)) || code.localeCompare` — has-incoming first, then code asc, **no cap**. Correct.

## 2. Family-fetch + sibling-transform — CONFIRMED READ-only, boundary correct

- `family-fetch` (httpRequest GET, id `dfeef116`): `GET /master-data/products?query=<encodeURIComponent(baseCode)>&variant_filter=all&limit=5000`,
  header `x-api-key` (the documented pre-existing hardcoded-key class, LESSONS §13). Base = first non-uuid product code in
  `compatible_entities` — same predicate the gate's `sg-prod` uses. **READ. No write, no send.**
- `sibling-transform` (Code, id `12b20143`): strict-family filter — `norm(code)===base` OR `startsWith(base)` with the next
  char in `{'-','/',' '}` or EOS. Correctly excludes `CB88SS1` (alnum boundary) and `XCB88SS` (non-prefix). Emits ONE item
  `{siblings[], base_codes[], sibling_count}` → sibling-probe runs once. Phase-2 union seam (`base_codes[]`) present + clean.
- **No over/under-gather** confirmed on live data: cb88ss → exactly 5 (V-Q1), SRT7926 → exactly 1 (Q6 boundary held).
- **Deep-variant degradation is safe:** typing `cb88ss-diy` yields a self-only family → `extras=0` → plain escalate.
  Proven by tester Q4 (CB88SS-BL-DIY pick → self-only → fell to D2 correctly). Worst case = fewer siblings, never wrong
  data, never egress. Matches plan §2 open-limitation.

## 3. Envelope fidelity — CONFIRMED

D3 emits exactly `{suggest_offer:true, suggest_selection_context:'suggest_offer', suggest_response, suggest_quick_reply,
suggest_last_result_set:[{idx,label,value,product,uuid,entity_type:'product'}]}` — the SAME shape D1/D2 emit and that
`compile-current-state._sug` renders + persists (no compile edit). Verified against tester evidence:
- **Q1** (exec 8696461): reply rendered all 5 siblings, exact CB88SS included/annotated, `suggest_quick_reply='Yes escalate,No it's okay'`
  (2 buttons, comma-stripped), `suggest_last_result_set` = 5 full-shape rows; compile persisted `variables.last_result_set` +
  `selection_context:suggest_offer` + `domain_hint:incoming`.
- **Q4** (exec 8696633): reply "2" round-tripped via the fork's `suggest-follow-up` → `reference_positions:[2]` → CB88SS-BL-DIY
  (picker idx2 uuid `def532de` matched), `domain_hint:incoming` inherited, re-queried `crm_incoming_stock_list` for that
  sibling. No mis-resolution.
- **Q5** (exec 8696838): reply "yes" → `is_escalation_confirmation:true` → guarded human-intervention fork.
The round-trip reuses the already-shipped suggest_offer path (no reformulator/compile edit), as designed.

## 4. Zero-egress — RE-CONFIRMED (§0 S1–S6 on all 8 execs)

Per `runs/sibling-picker-Q-suite-20260715.json` (evidence = `get_execution(includeData)` runData per exec + sub-exec):
- **S1** no respond.io send — reply always via redis `chat:reply`/format-out; `send-message-*` / real sendmsg POST never executed.
- **S2** no real assign/SLA/PIC/queue — Q5 human-intervention fork `vUfFUDjLAuMaeQE6` short-circuited (3 nodes: trigger→chat?→
  chat-escalation-push); the real Assign/SLA-POST/add-comment/round-robin/queue nodes did NOT run (exec 8696843).
- **S3** no prod CRM/session write — `save-session-vars`/`update-human-intervened` orphaned/absent; session+logging to `n8n_test`.
- **S4** get-results tool ∈ READ allowlist — every case used `crm_incoming_stock_list` (read); never `crm_it_support_ticket_create`.
- **S5** subs are TEST/guarded forks — reformulator=`wI5RkNGW3EOJfBdo`, get-results/sibling-probe=`rysSPgUssLDf6xJc` (TEST,
  read-only), human-intervention=`vUfFUDjLAuMaeQE6` (`is_test:true`).
- **S6** no new hot LLM sink — sibling-probe is an MCP read (no LLM); get-results returned deterministic structured reads.

Both new CRM touches are reads (`family-fetch` GET; `sibling-probe` = `crm_incoming_stock_list`). No egress node added or rewired;
the 5 orphaned egress nodes stay orphaned. **The `sibling-gate` topology insertion verified on the clone connections:**
`not-found-error-message → sibling-gate`; `[0]→family-fetch→sibling-transform→sibling-probe→build-suggest-offer`;
`[1]→build-suggest-offer`; `annotate-incoming-picker→build-suggest-offer` intact. The old direct
`not-found-error-message→build-suggest-offer` edge is removed. Matches diff exactly.

**S5 nuance (acceptable):** `sibling-probe` (and its template `probe-incoming`) do NOT pass an explicit `is_test` flag; safety
is *structural* — the target is the fail-closed TEST get-results fork and the tool is a pure READ. Acceptable on the clone.
This becomes a **promote remap item** (step 2 below), not a defect.

## 5. Plan / UAC adherence

- Scope `deterministic` (Code + HTTP-read + executeWorkflow-read) matches what was tested; no parser/reformulator/compile edit. ✔
- AC1/AC4/AC5/AC6/AC7/AC8/AC9 exercised & PASS. AC2 (multi-family) is the declared **PHASE-2 deferred** (no `family-loop`
  node; `sibling-transform` emits a single-base family with a clean union seam). Acceptable to ship phase-1.
- **Known gaps (non-blocking, must be carried into the promote caveat):**
  - **Q3 has-incoming annotation + has-first sort NOT live-exercised** — no reachable single-exact-no-incoming base with an
    incoming strict-prefix sibling exists in current data (the has-incoming SKUs cluster in the all-has-incoming SRT79-SS
    sub-family → any exact query lands HAPPY; the no-incoming bases have all-no-incoming families). The annotation *machinery*
    D3 reuses is live-proven by the SRT79 ambiguous picker (exec 8697207 correctly flagged SRT79-SS/-GM/-BL "has incoming");
    the D3-specific has-first sort is covered by the coder's offline unit only. **Ship phase-1; watch the first live
    has-incoming family.**
  - **Q2 multi-product union** — phase-2, deferred. Not a regression.

---

## PROMOTE CHECKLIST — LIVE spine `9qVyfUxmRQqrpGRMDLRuz` (user-gated)

Port the reviewed **business-logic diff only** (guard scaffolding is the clone's `is_test`/TEST-fork wiring — strip it).
Never edit live mid-cycle.

1. **Backup-first.** Capture the live spine's current `versionId` + the `build-suggest-offer` `jsCode` (sha) BEFORE any edit
   (LESSON 25 revert target). Clone-side revert reference is `45699b20`; the live revert target is live's own prior versionId.
2. **Port the 4 new nodes byte-exact** (from the clone `3246db0c`): `sibling-gate` (IF, the 4 conditions verbatim),
   `family-fetch` (httpRequest GET), `sibling-transform` (Code), `sibling-probe` (executeWorkflow). During the port:
   - **REMAP `sibling-probe.workflowId`** from the TEST fork `rysSPgUssLDf6xJc` → the **LIVE get-results sub
     `Fss5aAaXthJSWpZCgKiKR`** (i.e. match what live's `probe-incoming` targets). Still a READ (`crm_incoming_stock_list`)
     — no egress — but it MUST point at the live sub, not the TEST fork.
   - **`family-fetch` credential/key:** it uses a hardcoded `x-api-key` header (no credential node). Confirm the key equals the
     one live's other spine http nodes use (`resolve-entity-http`/`get-cs-members`/`check-access-http`) so the read authenticates
     on live. Header-based → no credential auto-assign, but verify the value is the live-valid key.
   - **Node-ref sanity:** `sibling-probe` references `$('Call \'sub-query-reformulator\'')`, `$('Aggregate')`,
     `$('sorento-sub-respond-findcontact-respond')`; `sibling-gate`/`family-fetch`/D3 reference `$('disallowed-entity-gate')`
     and `$('validator')`. Confirm all these node NAMES exist identically on the live spine (live's `probe-incoming` uses the
     same refs, so they should) before publish.
3. **Splice the D3 block into LIVE `build-suggest-offer` — do NOT wholesale-replace.** First **sha/byte-diff live's
   build-suggest-offer D1/D2 body against the clone's** (lines 86–283). If they match, insert ONLY the D3 `{ … }` block after
   the locals and before the UUID-leak guard — nothing else changes. If live's body differs, reconcile first; the D3 insertion
   must remain purely additive on live too.
4. **Rewire connections on live** exactly as on the clone: remove `not-found-error-message → build-suggest-offer`; add
   `not-found-error-message → sibling-gate`; `sibling-gate[0] → family-fetch → sibling-transform → sibling-probe →
   build-suggest-offer`; `sibling-gate[1] → build-suggest-offer`. Leave `annotate-incoming-picker → build-suggest-offer` and
   `build-suggest-offer → tag-not-found → escalate-catalog` intact.
5. **Publish + verify.** `publish_workflow`, then confirm `versionId == activeVersionId` (draft==active) and sha-verify the
   ACTIVE `build-suggest-offer` body + the 4 new nodes post-publish (LESSON 25). Auto-revert to the backed-up versionId on any
   mismatch. Beware the stale-draft revert-landmine (LESSON 24): confirm the draft == intended state before publishing.
6. **Live-data caveat.** The has-incoming annotation + has-first sort are NOT exercised on live data (Q3 scarcity). Do a
   sanity check on the first live incoming-miss whose family has a member with incoming.

### Bundle-vs-separate with the fork changes (domain-continuity, decline-flag)

The D3 change lives on the **spine**; domain-continuity and decline-flag live on the **reformulator** (`XTODTw` live /
`wI5RkNGW3EOJfBdo` fork) — different workflows, so they are technically separable MCP promotes. **But functionally the D3
picker's NUMBER-pick continuation depends on domain-continuity-carry:**
- Reply **"yes" → escalate** and reply **"no" → decline** use the existing `suggest_offer` round-trip and work on live
  regardless (D1/D2 already emit suggest_offer envelopes that live handles today).
- Reply **"<number>" → re-query the picked sibling's incoming** was proven only against the fork `wI5RkNGW3EOJfBdo`
  ("sub-semantic-parser FORK **domain-continuity-carry**"), which inherits `domain_hint:incoming` on an entityless/positional
  pick (tester Q4: `domain_reused_entityless:true`). If the **live reformulator `XTODTw` does not yet carry
  domain-continuity**, a numbered pick may not re-query as incoming (degraded UX — the picker offers "reply with a number"
  but the number may re-resolve under a default domain or clarify). **This is a functional gap, NOT an egress risk.**

**Recommendation:** promote the D3 spine change **together with (or after) the domain-continuity fork promotion to `XTODTw`**,
OR verify on live that a positional/entityless pick already inherits the prior domain before shipping D3 standalone. Shipping
D3 alone onto a live reformulator lacking domain-continuity yields a half-working picker. `decline-flag` (the "no" branch) is
orthogonal and lower-stakes; it may follow independently.

---

## Bottom line
APPROVE phase-1. Correctness, plan/UAC adherence, and envelope fidelity confirmed against the deployed clone; zero-egress
re-confirmed (§0 S1–S6, 8/8 execs). Carry the Q3 has-incoming live-verification gap and the **domain-continuity bundling
dependency** into the user-gated promote. No change-requests.
