# Review — `miss-company-routing` (n8n half) · reviewer pass 2026-08-18

Verdict: **APPROVE** (with 2 doc corrections applied/recorded and 1 harness follow-up — none blocking).

Inputs reviewed: `plans/miss-company-routing-plan.md` (rev-1 + captain decisions incl. rev-2),
`tests/diffs/miss-company-routing.md` (+ 9 body files in `tests/diffs/miss-company-routing/`),
`tests/miss-company-routing-UAC.md`, `tests/runs/miss-company-routing-{M1,M2,M3,M4a,M4b,M5,M6,R2spot}-20260818.json`,
`…-rollup-20260818.md`, `…-R2verify-20260818.md`, `tests/backups/miss-company-routing/*`.
Every published-state claim below was **re-fetched from MCP by this review**, not taken from the docs.

## 0. Published-state verification (re-fetched 2026-08-18)

| workflow | expected | observed | draft==active |
|---|---|---|---|
| clone `txiPzSxy3Pclsz6v` | `d4ce02eb-e337-447c-bf05-9a13f504dd53` (rev-2) | ✅ same, 156 nodes | ✅ (0 differing node ids) |
| parser fork `wI5RkNGW3EOJfBdo` | `d7be8443-827e-4a85-9638-aa243fea6c2d` | ✅ same | ✅ |
| live spine `9qVyfUxmRQqrpGRMDLRuz` | `efa21057-…` untouched | ✅ `efa21057-a7e0-4be3-b6af-f8ced2c3749c`, 127 nodes | ✅ |
| live parser `XTODTw-dJcV0uRdC056hG` | `89b63c51-…` untouched | ✅ `89b63c51-57f0-45fd-96ce-2df103c2fb9d` | ✅ |
| live HI `rrYXzE61gCNUck_zmXe-G` | `9249e00e-…` untouched | ✅ `9249e00e-3dd9-4766-8c49-2f32f8f66bda` | ✅ |

Every deployed body byte-verified `==` the committed `tests/diffs/miss-company-routing/*` file (python sha256 on the
re-fetched node params): `compile-current-state` `ddacfdfa…`, `escalation-context` **rev-2** `c14da5d7…`,
`miss-roster-plan` `0b7907d6…`, `build-miss-member-offer` `3e3d9709…`, `clarify-company-reply` `2ee509aa…`,
`miss-roster-gate` leftValue, `clarify-company-gate` leftValue, fork `output_exchange` `3810a9b0…`, fork
systemMessage `fa1700e8…`. `get-cs-members-miss` params+credentials deep-equal to `get-cs-members`
(`onError: continueRegularOutput`, type httpRequest, GET). Pre-edit backups match the diff doc's "before" column
(clone base `b5c29d54`/ccs `de896ddd`/esc-ctx `8c12563c`; fork base `7b4baaa8`/`3ee5b658`/`583bcfb0`) — clean rebase base.

## 1. Node-diff correctness vs plan — PASS

- **Wiring (re-derived from the fetched clone `connections`):** `central-exchange[0] → miss-roster-gate`;
  gate TRUE → `miss-roster-plan → get-cs-members-miss → build-miss-member-offer → dym-transform-partial`;
  gate FALSE → `dym-transform-partial` (the original single edge, restored). `escalation-context[0] →
  clarify-company-gate`; TRUE → `clarify-company-reply` (terminal, composes only); FALSE →
  `Call 'sub-human-intervention'` — which now has exactly ONE inbound edge (`clarify-company-gate`). Matches the
  diff doc §1a/§1b exactly; no other connection moved; node-set diff = 6 added + 2 param-changed, 0 removed.
- **Gate fail-closed** (read from deployed leftValue): whole body in try/catch→false; requires `has_result===true`,
  parser `domain_hint==='order'` AND routing `customer_service`/`order_enquiries` (deviation 4 — the plan §0's own
  wording; blocks a carried routing pair opening the lane on a non-order turn), non-empty `lookup_companies` +
  `answers`, EVERY answer labelled with a `company_name` key field, miss set non-empty. Captain decision 2 (qty-0
  stock is an answer) holds by the domain+routing legs — proven by M5.
- **Plan/offer lockstep:** `miss-roster-plan` uses the identical miss-set derivation; the impossible-empty sentinel
  (`_miss_plan_empty`, deviation 6) is dropped by `build-miss-member-offer`'s `isRow`/sentinel filter — worst case is
  one stray roster READ, never a broken happy-path turn. Roster parsing/dedupe/row shape mirror `build-cs-member-offer`
  (rev-6 membership sets, rev-5 shown-pool intersection); numbering base = max(numbers in `response`, `answers.length`)
  — this is what absorbed the CRM data drift (2 order blocks → members 3..8) without any assertion change.
- **ccs merge arms** (read at lines 1060–1109 of the deployed body): placed immediately before the single final
  `return output;`, AFTER the axes block — the miss arm deliberately overrides the persisted axes with the MISS pool
  identity (single-miss ⇒ pair verbatim, multi ⇒ nulls so the rev-4 arm clarifies). Arm A guards:
  `isExecuted` + `miss_member_offer===true` + rows + `!_ideate && !_sug && !_mem && !_dymLastResultSet` (numbering-
  collision refusal, deviation 3) + non-empty `user_response`; frozen phrase appended to BOTH the sent text and
  persisted `variables.response` (parser regex contract holds); `selection_context='member_offer'` (deviation 2 —
  required by the plan's own locked Δ3 contract; without it no pick could resolve; the stray-"1" consequence degrades
  to round-robin-into-the-miss-pair, the safe direction). Arm B (clarify follow-up) re-persists the prior offer state
  from `get-session-vars` so the next reply still resolves. All outer-scope deps of the block (`_ideate`,`_sug`,
  `_mem`,`_dymLastResultSet`,`qf`) verified declared above it.
- **`escalation-context`:** `cpick`/`cpickRow` resolve case-insensitively (name or id) against persisted
  `routing_roster_plan` then `routing_companies`; the `else if (cpickRow)` arm sits between `picked_member` and
  `sameTeam` (i.e. above `multi_company_unpicked`, per plan); no match ⇒ null ⇒ behaviour identical to before.
  Pair sent VERBATIM from the matched row, `routing_source:'company_pick'`, never a `preferred_assignee_id`.
- **rev-2 one-liner verified in the deployed body:** exactly
  `if (source !== 'multi_company_unpicked') brand_code = prev.routing_brand ?? null;` and it lives ONLY in the
  no-plan `else` sub-branch of `sameTeam` (rp.length===0 — no roster was fetched). The roster-backed arms
  (`picked_member` row pair, single-plan-row pair, `company_pick` row pair) all remain fetch-verbatim — the rev-3/
  rev-4 pool-identity regressions stay closed. The guard correctly keeps both axes null on `multi_company_unpicked`
  (which the clarify divert now intercepts anyway).
- **Parser fork (3+1 anchored insertions on the brand-company-routing published bodies, rebase-clean):**
  `_coPool`/`_coPick` (word-boundary regex, regex-escaped names, `hits.size===1` ambiguity gate, ≤3-word bound on the
  raw reply mirroring `_replyMatchesMember`); `_pm` zero-match fallback → `company_pick`; Tier 2.5 between the
  pick-signal tier and `_isNewQuery`. All inside the Δ3 `member_offer` entry-gated arm — `company_pick` cannot fire
  on an ordinary turn. systemMessage: one extraction-only block (no resolution delegated to the LLM — Lesson 38/39
  discipline). Coder deviations 1–6 all examined: each is either mandated by the plan's own locked contracts or
  fail-closed in the direction the plan prescribes. Accepted.

## 2. Zero-egress re-confirmation — PASS (from tester evidence + this review's independent checks)

- **Structural (re-fetched clone):** the 5 orphaned egress nodes (`send-message-files/images/video`,
  `update-human-intervened`, `save-session-vars`) still have **0 inbound edges**; every sendmsg/HI/parser
  executeWorkflow call still passes `is_test=true` and targets the guarded forks
  (`aQUmwMVplmNcyUVc`/`vUfFUDjLAuMaeQE6`/`wI5RkNGW3EOJfBdo`/`t4QvrtrPnTwRU6br`/`tWm5DYLxfypmVC1T`). No egress node's
  params changed in this round (node-set diff), and the only new external call, `get-cs-members-miss`, is a CRM
  **GET** byte-identical in config to the existing `get-cs-members`. `clarify-company-reply` composes only; the
  clarify text rides the existing guarded `crossdomain-compose → sendmsg-respond2 (is_test=true)` path.
- **Run evidence (swept every run JSON):** egress lists across all 8 evidence files contain ONLY
  `would_log`/`would_write`/`would_send` guard records (guards: `save-message-redis`, `save-session-vars`,
  `sendmsg-sub`, `human-intervention-sub`) — zero `blocked:false`, zero real-send records. Per-case S1–S6 blocks all
  PASS: sendmsg forks `is_test=true` terminal at guard; HI fork short-circuits at `test-guard-record` with
  `get-round-robin-assignee` NOT executed on every M/R2spot execution; orphaned prod PUT/UPDATE_CONTACT absent from
  every runData; session persisted only via `pg-upsert-session` (`n8n_test-db`); get-results tools observed =
  `crm_order_management_orders_list`, `crm_inventory_stock_balance_list` (read allowlist; never
  `crm_it_support_ticket_create`); prod list `sorento-respond-message` 0→0. **M4a-t2, the new divert:** HI not
  invoked at all, no HI egress record, exact plan clarify wording in the sendmsg `would_send`. Token sinks: exactly
  the 1 by-design parser-tier LLM run (M4b) + the 1 discarded first M1 attempt.
- Known pre-existing note carried forward: get-results fork `t4QvrtrPnTwRU6br` takes no `is_test` input (read-only
  tool re-verified under S4 each case).

## 3. Plan/UAC adherence + tester deviations — PASS, with dispositions

All plan §5 cases covered: M1 (partial miss → Sorento picker, roster URL carries `brand_code=mocha` +
`company_id=<Sorento>`, `get-cs-members` escalate-lane node NOT run), M2 (number pick → `picked_member`, explicit
assignee `0d69dfb7…` + Sorento/mocha pair in the HI egress payload), M3 (bare "yes" → rev-4 `prior_state` verbatim,
no code change — asserted), M4a (both-miss → `multi_company_unpicked` → clarify, state re-persisted → "mocha" →
`company_pick` Mocha pair, brand null per B2 shape, no explicit assignee), M4b (parser tier: real fork emitted
`{is_escalation_confirmation:true, company_pick:"Mocha"}` via Tier 2.5, `entities []`, no assignee id), M5 (qty-0
stock: gate executed FALSE), M6a/b/c (regression guards; c = offline units on the byte-exact deployed bodies).

Tester deviations, dispositions:
1. **Seed-template mock placement** — real defect in the UAC doc (mock inside `item.message` is silently ignored;
   cost one real-LLM M1 attempt). **RESOLVED in this review commit**: template fixed to top-level
   `mock_reformulator_output` + a warning note in `tests/miss-company-routing-UAC.md`.
2. **M2 numbering drift** (2 Mocha orders now; pick "3" not "2") — benign CRM data drift; the plan's structural rule
   (numbering CONTINUES after the reply's blocks) is exactly what held. RESOLVED, no action.
3. **M6a envelope shape** (`lookup_companies:null` on an order-number lookup) — gate failed closed on the
   lookup/label legs rather than the literal miss-set-empty leg; that leg is proven by the offline unit on the
   deployed gate expression. RESOLVED — acceptable evidence split.
4. **M6b promotion never reaches an answered envelope** for this contact (pre-existing access-choice loop; no new
   node ran on either turn). The "answered non-order ⇒ gate FALSE" evidence is M5 (inventory). ACCEPTED — coverage
   adequate; note the promotion-path mechanics are out of this change's scope.
5. **Clone republished mid-pass (rev-2)** — every M-run pre-dates the publish (last M-run 02:12:08Z vs publish
   02:13:03Z); rev-2 delta confined to the no-plan arm no M-case traverses; R2spot re-ran both roster-backed arms on
   `d4ce02eb` green; R2verify ran the rev-2 journey itself (photo→yes: `brand_code:"mocha"`, `prior_state`,
   brand_matched pick Kia Yee vs untagged-pool Tay Zhi Yang pre-rev-2). ACCEPTED — the mid-pass publish was
   procedurally noisy but fully attributed and re-covered.

## 4. Parser-contract integrity — PASS

Frozen phrase byte-identical in ccs (`Would you like me to escalate to ${team} team?`) and appended to both the sent
text and persisted `variables.response`; the recognition regex (`/would you like me to escalate/i`) untouched.
Tier bounds as planned: ≤3-word raw-reply bound (or `person_mention`), word-boundary, exactly-one-match ambiguity
gate, member pick outranks (Tier 2 precedence + `_pm`-fallback ordering), `preferred_assignee_id` never set by any
company-pick path. No new LLM node, no new always-on cost — the systemMessage grows the existing per-turn parser
prompt by one short block; S6 confirms deterministic turns stayed 0-token.

## 5. Replay-norm impact — CONFIRMED: no new `norm()` rule needed

`company_pick` rides the existing `escalation` container and is emitted ONLY inside the Δ3 member-offer arm on a
matching reply — it is not an always-emitted field, so Lesson 40's null-inert registration does not apply (no golden
turn can emit it; when absent the key is absent, not null). `member_pick_context` pre-exists this round. The new
persisted state keys on answered miss turns (`last_result_set` member rows, `selection_context`, appended phrase,
`routing_roster_plan`) will surface as replay diffs against golden BY DESIGN — flag-for-review, not noise-suppress.
Plan §3 stands as written.

## 6. Findings

- **F1 (doc, corrected here): the diff doc §5 sha table is wrong for the two `.expr.txt` rows.** The recorded values
  `e385a598…` (miss-roster-gate) and `f423f11f…` (clarify-company-gate) are the file-content **plus a trailing LF**;
  the actual file bytes == deployed leftValue shas are **`024d91e31eaa95f484332a9bd41d31f111059d9fcc97ba0774627ebf353efea2`**
  and **`63e30a3db1f6aa693dcadc25e5b0669ed271ccb7aa2f5c17a7311b91d41709fe`** (verified against the re-fetched
  published nodes; the doc's own "no trailing newline" note is correct — the table values are not). Matters because a
  LESSONS §64 revert-check keyed on the table would false-alarm "reverted". **These corrected values are the ones to
  gate on.** All 7 other rows verified correct as recorded.
- **F2 (harness safety, pre-existing — follow-up required, not blocking this change):** the rev-2 verification
  (R2verify exec 12908069) and the coder's pre-rev-2 traces (12906044/12906192) exercised the HI fork's
  **chat-console path** (`chat?` TRUE when `contact.chat_id` set), which POSTs prod
  `/external/next-assignee` with no `preferred_assignee_id` — per the CRM contract
  (`plans/edit-fields-unify-and-cs-routing-plan.md` §9: preferred ⇒ no cursor advance; absent ⇒ "round-robin as
  today") this **advances the prod CS round-robin cursor**, and the UAC's own rule says "Never call `next-assignee`
  from a test." This path pre-dates this round (chat-console harness, Lesson 44) and is NOT part of this change's
  diff; all 20 UAC executions kept the gate (`get-round-robin-assignee` never executed — the fork short-circuits at
  `test-guard-record` when `chat_id` is absent). It does not send, assign, SLA or comment. Disposition: the evidence
  it produced is valid and the change is approvable, but the contradiction between the chat harness and the UAC rule
  must be settled — either the captain records chat-console `next-assignee` calls as an accepted diagnostic cost
  (and the UAC rule gains that exception), or the fork's chat path gets a synthetic-assignee stand-in so no test can
  advance the cursor. Recommend the latter.
- **F3 (doc, corrected here):** UAC seed-template mock placement — fixed (see §3 item 1).
- **F4 (observation):** in `uac` mode the canary contact 437264483's session READS come from his real prod CRM state
  (R2verify's harness note) — multi-turn journeys must inject state via `sim-inject-session` as the tester did.
  Worth folding into the next UAC template revision; no action this round.

## 7. PROMOTE CHECKLIST (captain-gated; reviewer authorizes, does NOT execute)

This review **pre-answered the promote map's open questions against the current live spine** (`efa21057`):
live `escalation-context` jsCode sha == the clone's pre-round base `8c12563c…` (so the full reviewed body
`spine-escalation-context.js` `c14da5d7…`, **including the rev-2 hunk**, applies to live AS-IS if live is still at
`efa21057` at promote time); live `compile-current-state` (`0b0912f1…`) **diverges** from the clone's pre-round base
(`de896ddd…`) — the ccs hunk MUST be an anchored insertion, never a body copy; all five ccs anchor dependencies
(`_ideate`, `_sug`, `_mem`, `_dymLastResultSet`, `qf`) and a UNIQUE final `return output;` are present in live's
body; live `central-exchange → dym-transform-partial` is a single edge; live's HI call has exactly ONE inbound edge
(`escalation-context`); live `get-cs-members` exists (GET).

Order + steps (backup-first; sha-gate every write per Lessons 24/25/57/58/71; abort ⇒ zero mutations):

1. **Pre-flight (both targets):** fetch fresh; require `versionId == activeVersionId` AND live spine still
   `efa21057-…`, live parser still `89b63c51-…` (any drift ⇒ STOP, re-derive hunks per diff doc §7). Back up full
   JSON + the per-node bodies being changed. Run the draft-vs-active differing-nodes one-liner; require empty.
2. **Live parser `XTODTw-dJcV0uRdC056hG` FIRST** (sub before parent, Lesson 37):
   `output_exchange.jsCode` := `tests/diffs/miss-company-routing/parser-fork-output_exchange.js` (`3810a9b0…`);
   `AI Agent` `options.systemMessage` := `parser-fork-AI-Agent.systemMessage.txt` (`fa1700e8…`). Both are
   live-base + hunks (live's current bodies must sha `3ee5b658…`/`583bcfb0…` — the gate for as-is application).
   `setNodeParameter` paths `/jsCode` and `/options/systemMessage` (path is relative to `parameters` — Lesson 32b).
   Byte-gate draft == file → publish → byte-gate active == file; auto-revert on mismatch.
3. **Live spine `9qVyfUxmRQqrpGRMDLRuz`:**
   a. Add the 6 nodes. `get-cs-members-miss` must mirror **LIVE** `get-cs-members` params + credential (never the
      clone node — Lesson 48/57). If leftValues from the `.expr.txt` files (**gate on the F1-corrected shas
      `024d91e3…`/`63e30a3d…`, no trailing LF**); Code bodies from the repo files (`0b7907d6…`, `3e3d9709…`,
      `2ee509aa…`).
   b. Rewire splice 1: `central-exchange[0] → miss-roster-gate`; gate TRUE → `miss-roster-plan →
      get-cs-members-miss → build-miss-member-offer → dym-transform-partial`; gate FALSE → `dym-transform-partial`.
      Derive the FALSE target from the pre-splice live graph read ONCE and refuse on an already-spliced shape
      (self-loop landmine, LESSONS D18); re-verify live's `central-exchange` inbound/outbound edges against the
      pre-flight dump (P3a-style inbound-edge check, Lesson 65) immediately before writing.
   c. Rewire splice 2: `escalation-context[0] → clarify-company-gate`; TRUE → `clarify-company-reply` (terminal);
      FALSE → `Call 'sub-human-intervention'`. **Enumerate every inbound edge of live's HI call first** (this review
      measured exactly one, `escalation-context`, on `efa21057` — re-verify at promote time; >1 ⇒ STOP and map each).
   d. `escalation-context.jsCode` := `spine-escalation-context.js` (`c14da5d7…`) — valid as-is ONLY under the
      `8c12563c…` pre-gate from step 1; otherwise re-apply the two anchored hunks (cpick block after the `qb` line +
      arm above `sameTeam`; rev-2 line at the end of the no-plan else branch) on the live body.
   e. `compile-current-state`: insert the miss/clarify block (diff body lines 1060–1109, the block between the axes
      block and `return output;`) immediately before live's final `return output;` — ANCHORED insertion on the LIVE
      body; never copy the clone body (bases diverge, measured). Re-verify the five outer-scope deps still exist in
      the live body being patched.
   f. One atomic `update_workflow` batch where possible; byte/param-gate each changed node (draft) → publish →
      re-fetch active; auto-revert (`publish_workflow` prior versionId) on any mismatch.
4. **Live HI sub `rrYXzE61gCNUck_zmXe-G`: NOTHING to promote** — re-confirmed this round: live HI `9249e00e-…`
   already carries the `brand_code`/`company_id` trigger inputs and forwards them to `next-assignee`/SLA;
   `company_pick` rides those existing inputs. Just re-assert its versionId unchanged after the promote.
5. **Guards to strip: none.** No node in this change is test-only; the clone's pre-existing guards stay clone-only.
   Do NOT copy any `workflowInputs.value` blob, `is_test` leaf, or fork `workflowId` to live (Lesson 48).
6. **Post-promote sweep + watch:** param-hash EVERY node both sides and classify each mismatch by hand (Lesson 71 —
   this change includes If-node and connection hunks that a Code-only diff misses); then verify on the SPECIFIC
   paths changed (Lesson 56): (i) a real partial-miss order turn → found blocks + presenter miss line + frozen
   phrase + picker with CONTINUED numbering, roster GET carries the miss pair; (ii) a company-name reply → HI
   receives that pair (`routing_source company_pick`); (iii) a both-miss bare-"yes" → clarify sent, NO assignment;
   (iv) a no-roster escalation (photo→yes shape) → brand carried (rev-2); (v) watch for `next-assignee`/
   `team-members` 404 "No team found … in company" (admin config, revert trigger per predecessor P5). Never edit
   live mid-cycle; any anomaly ⇒ revert via the backed-up versionId, then diagnose.

## Verdict

**APPROVE.** Node-diff faithful to the plan (deviations examined and accepted), rev-2 confined and verified,
zero-egress structurally re-derived and re-confirmed across all 20 executions, parser contract intact, no replay-norm
change needed. Promotion is captain-gated on the checklist above; F2's harness follow-up (chat-path
`next-assignee`) should be settled before the next test round that uses the chat console.
