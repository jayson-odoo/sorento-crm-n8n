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

---

# Re-review — rev-3 + rev-4 deltas (reviewer pass 2, 2026-08-18)

Verdict: **APPROVE** for the rev-3 + rev-4 code as published (clone `0557b0b4`, parser fork `de9ff09d`, sendmsg fork
`b48e0eaa`), **with promotion gated** on (a) the rev-4 tester evidence (M8a–M8g + M8reg + S3) being green — it LANDED while
this review was closing and is green on all 15 executions (R6) — and (b) the captain's disposition of F5. **Superseded by pass 3: F5 is CLOSED by rev-5 (R8); the final
verdict for the whole round is R9.** Findings F5–F9 below;
none is a code defect that blocks the round on its own.

Inputs: commits 7c73a44 (rev-3 coder), 3e5b75e (rev-3 tester), 98420ec (rev-4 coder), 4370429 (planner R4verify);
`tests/diffs/miss-company-routing.md` §rev-3/§rev-4 + the 12 body files; UAC rows M7a–e, M8a–g, S3; run files
`M7a–M7e`, `M1r3`, `M4r3`, `R4verify`; `tests/unit/miss-company-routing-rev4.{output_exchange,spine}.test.js`;
`tests/backups/miss-company-routing/*/rev-{3,4}/`. Every published-state and live-state claim below was **re-fetched from MCP
by this review** (2026-08-18 ~03:45Z), not taken from the docs.

## R0. Published-state verification (re-fetched)

| workflow | expected | observed | draft==active |
|---|---|---|---|
| clone `txiPzSxy3Pclsz6v` | `0557b0b4-8f2d-457e-8f64-4e1d600c6ca1` | ✅ same, 159 nodes | ✅ (0 differing node ids, connections equal) |
| parser fork `wI5RkNGW3EOJfBdo` | `de9ff09d-a240-46af-98fd-0d5992fdd16d` | ✅ same, 8 nodes | ✅ |
| sendmsg fork `aQUmwMVplmNcyUVc` | `b48e0eaa-6dbd-4f1b-bf81-40cf6804c933` | ✅ same (updatedAt 03:10:03Z) | ✅ |
| live spine `9qVyfUxmRQqrpGRMDLRuz` | `efa21057-…` | ✅ `efa21057-a7e0-4be3-b6af-f8ced2c3749c`, 127 nodes, updatedAt 00:04:44Z | ✅ |
| live parser `XTODTw-dJcV0uRdC056hG` | `89b63c51-…` | ✅ `89b63c51-57f0-45fd-96ce-2df103c2fb9d` | ✅ |
| live HI `rrYXzE61gCNUck_zmXe-G` | `9249e00e-…` | ✅ `9249e00e-3dd9-4766-8c49-2f32f8f66bda` | ✅ |
| live sendmsg `aoydkG1dbItXR5jXFEQsP` | `91171ac3-…` | ✅ `91171ac3-ddad-4452-ace5-98da59480c48`, updatedAt 2026-08-11 (untouched) | ✅ |

Deployed bodies byte-verified `==` repo files (python sha256 on the re-fetched params): `compile-current-state` `5a84dfea…`,
`escalation-context` `cca7a245…`, `clarify-company-reply` **and** `offer-hold-reply` `7ff06aa8…` (one body, two nodes),
`escalate-catalog` `0168df84…`, `build-cs-member-offer` `c7046c45…`, `build-miss-member-offer` `68eef4c7…`,
`miss-roster-plan` `0b7907d6…`; If leftValues `offer-hold-gate` `8f14a430…`, `miss-roster-gate` `024d91e3…`,
`clarify-company-gate` `63e30a3d…` (all no trailing LF, operator boolean/true); `tag-offer-hold` params exactly as the diff
table; fork `output_exchange` `b2ac7783…` (the FINAL rev-4 body, not the first `69f0ab6c…` publish) and `AI Agent`
systemMessage `138008c2…`. Rev-3/rev-4 "before" shas match the backups (`07a31bb3`/`ddacfdfa`, `37a1b023`, `3e3d9709`,
`ea40047b`/`3810a9b0`, `619097f5`/`fa1700e8`, `c14da5d7`, `2ee509aa`, `5e7d8066`, sendmsg `51fed3d1`).

**Wiring re-derived from the fetched clone `connections`:** `If-ideate[1] → offer-hold-gate`; gate TRUE →
`offer-hold-reply → tag-offer-hold → escalate-catalog`; gate FALSE → `If10` (If10's ONLY inbound edge is now
`offer-hold-gate[1]`); `escalate-catalog` has 9 inbound tags (the 8 prior + `tag-offer-hold`) and its single outbound
`cs-offer-gate`. `central-exchange`/miss lane and `escalation-context → clarify-company-gate → [reply | HI]` unchanged from
rev-2 (HI call still exactly ONE inbound edge). The 5 orphaned egress nodes still 0-inbound; every sendmsg/HI/parser
executeWorkflow call still `is_test=true` on the forks `aQUmwMVplmNcyUVc`/`vUfFUDjLAuMaeQE6`/`wI5RkNGW3EOJfBdo`; get-results
`t4QvrtrPnTwRU6br`, save-msg `tWm5DYLxfypmVC1T` (no `is_test` input, pre-existing note).

## R1. Rev-3 review — PASS

- **Three render arms** (`build-cs-member-offer` single/multi, `compile-current-state` Δ4 `_merge` arm, `build-miss-member-offer`
  + ccs miss arm): read in full. Multi ⇒ bold `*Company:*` headers, plain `n. Name` (no per-member suffix; the diff vs the
  brand-company-routing promoted body `37a1b023…` removes exactly the `(${companies})` suffix), bold note names, close
  `If you have no preference, reply with the company name (*A* / *B*) and we'll assign accordingly.`; single ⇒ picker
  lines and the yes-sentence byte-identical to before. **Frozen prefix intact:** the single-company phrase is produced by
  `replace(/(would you like me to escalate to )(\S+ team\?)/i, "$1*Co* $2")` (bcmo `nameCompany`, ccs `_sugText`) or built
  as `Would you like me to escalate to ${'*Co* '|''}${team} team?` (ccs miss arm) — the prefix `Would you like me to
  escalate` is byte-exact in every arm and the SAME string is used for the sent text and persisted `variables.response`
  (bcmo `out.response` feeds both; ccs `_mcPhrase` appended to both). Grepped the fetched clone (all 159 nodes) + the fork:
  every reader of the phrase is prefix-only — fork `offeredEscalation` and the rev-4 `_openO` (`/would you like me to
  escalate/i`), `crossdomain-compose` marker `'Would you like me to escalate'`, `crossdomain-render` marker; **no node
  parses the team out of the phrase.** `cs_multi_close`/`cs_offer_company` are written ONCE in bcmo and consumed by ccs
  (`_close`, `_sugText`) with fallbacks — single-source, verified.
- **Filler strip / Tier 2.5 (rev-3, superseded by the rev-4 `_coCompanyPick` — reviewed in final form).** Fillers are
  compared word-level after `_coTok` (lower-case, non-alphanumerics dropped, so "yes," == yes). Bound raised 3→4 words on
  the short path (see F5).
- **systemMessage n8n expression.** `{{ (() => { const st = $('When Executed by Another Workflow').first().json.
  previous_conversation_state || {}; … })() }}` — every access guarded (`|| {}`, `Array.isArray`, `typeof … === 'string'`,
  `.filter/.map/.join`), IIFE not try/catch-wrapped but there is no throwing path for a missing/null/non-object state
  (`Array.isArray(undefined)` ⇒ `[]` ⇒ `(none)`). Failure mode if n8n's expression sandbox ever rejects it: the AI Agent
  node fails on EVERY real-parser turn on the fork (mock turns unaffected). Accepted because (i) the same reference
  pattern `$('When Executed by Another Workflow').first().json.previous_conversation_state?.response` already lives in the
  AI Agent's `text` parameter on BOTH the fork and the live parser (`89b63c51`), i.e. it is not a new failure class, and
  (ii) the tester's M7a/M7b/M7c/M1r3-t2p parser-tier runs are the live proof it renders (`Mocha / Sorento`, `Sorento /
  Mocha`) — with rev-4 also the R4verify parser turns 12913160/172/185.

## R2. Rev-4 review — PASS with findings

- **Alias map.** `_CO_ALIASES = { sorento:['sorento','srt'], mocha:['mocha','mch'], cabana:['cabana','cbn'] }` is
  byte-identical in the fork `_coCompanyPick` and `escalation-context.cpickRow` (diffed the two literals). Both also honour
  `company_code`/`code` on a pool row. Stopgap documented in both bodies and the diff doc, with the real source named
  (CRM `companies.code` → resolve-entity → `disallowed-entity-gate.routing_companies[].company_code` → plan rows) and the
  Lesson-40 reason no null key was added. Accepted as a stopgap; carry as F7.
- **Fix-B bounds.** Long path (>4 words) requires: filler-stripped remainder ≤6 words AND no product-code-like token
  (`/^[a-z]{2,}[a-z0-9-]*\d/i`) AND no `current_message:true` entity AND `!domainQ` (== the Δ3 arm's `_isNewQuery`, kept in
  lockstep). Negators (`no not nope nah never dont neither nor none without except cancel stop`, punctuation-stripped)
  anywhere refuse BOTH tiers. Product-code tokens refuse both paths. Decline arm: `is_affirmative===false && _coPickAny`
  precedes the plain decline; a bare "no"/"nah"/"no not sorento" carries a negator ⇒ `_coPickAny` null ⇒ decline (unit
  + my probe confirm; "not sorento, mocha" ⇒ hasNeg ⇒ no pick ⇒ offer_hold on a multi pool, correct direction). LLM
  validator: exact key match else word-boundary exactly-one, refused on bare-confirmation / negator / domainQ. **Short path
  (≤4 words) has NO domain/entity guard — see F5.**
- **`offer-hold` lane.** LLM-free and read-free by construction (offer-hold-reply is a Code node reading `get-session-vars`;
  `escalate-catalog` `offer_hold` case pulls `clarify_text` by reference, `is_escalate_offer:false` ⇒ `cs-offer-gate` FALSE
  ⇒ ccs; independently confirmed on clone exec 12913195: `If10`, `Basic LLM Chain`, `cs-roster-plan`, `get-cs-members`,
  `build-cs-member-offer`, `escalation-context`, `clarify-company-reply`, HI and the 5 orphaned egress nodes ALL absent
  from runData). Re-persists the FULL offer: ccs arm B output on 12913195 carried `selection_context:'member_offer'`, the 9
  member rows, 2-row `routing_roster_plan`, `routing_companies`, `routing_brand/company`, and `variables.response` = the
  full offer text incl. the frozen phrase; `user_response` = the rev-4 clarify copy. **Cannot fire on a single-company offer
  or a non-offer turn:** gate requires parser `member_pick_context===true` (only set inside the Δ3 arm / rev-4 no-context
  arm) AND (`offer_hold===true` OR string `member_reprompt`) AND NOT confirmation/declined/retarget AND persisted
  `selection_context==='member_offer'` AND `routing_roster_plan.length>1`; whole IIFE try/catch ⇒ false. Single-pool
  reprompts keep `correction:true`, no `offer_hold` (unit-proved on the deployed body).
- **Pool = plan-first (A)** verified in all four places: fork `_coCompanyPick` (`rp.length ? rp : routing_companies`),
  systemMessage IIFE (same expression), `escalation-context.cpickRow`, `clarify-company-reply` `pools`. Unit: Sorento-only
  offer + "yes mocha" (+ LLM pick Mocha) ⇒ no pick ⇒ plain confirmation ⇒ prior_state Sorento (M8g contract).
- **Parser-fork double publish.** The deployed body (`b2ac7783…`) gates the no-context arm on the FROZEN PHRASE in the
  persisted `response` (`_openO = /would you like me to escalate/i.test(String(_stO.response||''))`), NOT on
  `routing_roster_plan.length` — verified in the byte-exact deployed body (line 1487) and by the unit "after an explicit
  decline (plan carried, no phrase): 'sorento' → untouched". The arm additionally requires `!output.output.domain_hint`, no
  retarget, and only sets `company_pick` (never a `preferred_assignee_id`).
- **S3 credential re-point.** MCP `get_workflow_details` **strips the `credentials` block**, so this review could NOT
  read the binding directly. Verified instead: fork versionId `b48e0eaa` published 03:10:03Z (matches the diff doc); the
  `Postgres Chat Memory1` node's parameters/type/typeVersion/position/id are byte-identical to the pre-edit backup
  (`tests/backups/…/sendmsg-fork-aQUmwMVplmNcyUVc/rev-4/VERSION.json`), no other node/connection differs from the rev-3
  fork; on sub-execution 12913205 (rev-4, clone exec 12913195) `Chat Memory Manager` succeeded and `Send a Message`/`HTTP
  Request` did NOT execute (`guard-text → guard-record-text`). The credential id itself (`Dnnofg8Xb27VQOhI`) rests on the
  coder's REST re-fetch + the tester's pending S3 assertion (see "Evidence not in hand"). Live sendmsg
  `aoydkG1dbItXR5jXFEQsP` re-fetched: `91171ac3`, updatedAt 2026-08-11, its `Postgres Chat Memory1` untouched — the S3
  fix is TEST-fork-only and must NOT be promoted (correct: the live memory insert is prod behaviour, out of scope).
- **Offline units** re-run by this review on the byte-exact deployed bodies: 32/32 (parser) + 33/33 (spine) green.

## R3. Zero-egress re-confirmation — PASS on all evidence in hand

- Rev-3 tester pass (9 clone execs 12910840…12911184): every per-case `S0` block re-read — S1–S6 all true, egress kinds
  only `would_*`, `S2_hi_shortcircuit` true wherever HI was invoked (M7a/M7b/M7e-t2/M1r3-t2p) and HI not invoked at all on
  M7c/M7d/M7e-t1/M1r3-t1, `S3_no_prod_session_write` true, `S4_tools` ⊆ {`crm_order_management_orders_list`}, no
  assertion with `pass!=true`. Exactly 4 real LLM executions, all parser-tier by design.
- Rev-4 planner verification (R4verify, clone execs 12913160/172/185/195 on `0557b0b4`/`de9ff09d`): egress only
  `would_log/would_write/would_send`; independently re-checked 12913195 (offer-hold) and its sendmsg sub 12913205 as
  above — no send/HTTP node, no HI, no orphaned egress node executed.
- The tester's rev-3 S3 caveat (sendmsg-fork `Chat Memory Manager` insert on `sorento-crm-db`) is now closed by the rev-4
  S3 fix (fork-only). It was a chat-memory table insert under the canary contact id — no contact/session/assignment reach —
  and pre-dated this round; recorded here so it stops appearing as open.
- **Captain-accepted exception (F2, carried):** the HI fork's chat-console path (`chat?` TRUE when `contact.chat_id` is
  set) POSTs prod `/external/next-assignee` without `preferred_assignee_id` and advances the CS round-robin cursor. The
  captain has recorded this as an accepted diagnostic cost of the chat console; the UAC rule "never call next-assignee from
  a test" carries that exception. **F2 is CLOSED as accepted** — no clone execution in the rev-3/rev-4 evidence set carried
  a `chat_id` (all HI invocations short-circuited at `test-guard`). Not an open finding.

## R4. Replay-norm impact — CONFIRMED: no new `norm()` rule needed

`offer_hold` and `member_reprompt` are emitted ONLY by `_coReprompt` inside the Δ3 arm (`selection_context==='member_offer'`)
— arm-gated, absent (not null) on every other turn. `company_pick` is now in the LLM's OUTPUT SCHEMA on every turn, but
`output_exchange` deletes the raw key at the top (`delete output.output.escalation.company_pick`) before the object rides
`output.output`; the only writers are the validated arms. The raw copy survives only in `_parser_raw` (top-level sibling),
which the replay `Diff` norm already strips on both sides (`brand-company-routing/replay-Diff.js` line 23). Persisted
`variables.escalation` on a hold turn carries `{member_reprompt, offer_hold}` — arm-gated, surfaces as a by-design diff
only on hold turns. Plan §3 stands.

## R5. Findings (rev-3/rev-4)

- **F5 (design gap, captain disposition required before promote — recommend a one-line rev-5 tightening):** the
  deterministic company-pick SHORT path (reply ≤4 words) has no domain/entity guard, and inside the Δ3 arm Tier 2.5
  precedes Tier 3 (`_isNewQuery`). Probed on the byte-exact deployed body with the both-miss state: `"mocha promotions"`
  (LLM business_query/promotion), `"sorento stock MUB"` (inventory), `"show sorento orders"` (order, current-message
  entity), `"mocha promotions this month"` (4 words — admitted by the rev-3 3→4 widening) ALL emit
  `{is_escalation_confirmation:true, company_pick:…}` — i.e. a genuine short new query naming one offered company, sent
  right after an offer, is turned into a company-scoped **escalation** (on live: a real CS assignment + staff ripple)
  instead of being answered. This class existed at ≤3 words since rev-1 (approved) and mirrors the member-name resolver's
  bound, so it is not new in kind, but rev-3 widened it by one word and rev-4 built the guards (`domainQ`, `curEnt`,
  `prodTok`) that the LONG path uses and the short path does not. The rev-4 no-context arm is narrower (`!domain_hint`
  at the arm gate) but its short path is likewise unguarded against `business_query` without a domain hint. **Suggested
  fix (rev-5, parser fork only, ~2 lines in `_coCompanyPick`):** on the short path require `!domainQ && !curEnt` whenever
  the filler-stripped remainder has ≥2 tokens (`kept.length >= 2`); a bare single company token (`"srt"`, `"mocha"`,
  `"yes mocha team please"` ⇒ kept `["mocha"]`) keeps today's behaviour. Evidence that this cannot regress the evidenced
  pick turns: M7a "yes mocha" (`is_affirmative:true` ⇒ domainQ false), M7b "mocha please" (parser sub 12911002: `casual`,
  `domain_hint:null`, `entities []`), M4b "mocha" (casual, dh null), R4verify "srt"/"yes please escalate to srt team"
  (casual) and "please escalate to sorento team" (request_for_help, no dh). Then re-run M7a/M7b/M8a–c + the offline units.
  If the captain instead accepts the current bound, record it in the plan as an accepted LESSON-39 trade-off.
- **F6 (promote-map correction — live diverges from the clone on TWO nodes this round touches):**
  (i) live `escalate-catalog` (`8b4ae985…`) ≠ the clone's pre-round `5e7d8066…`: live's `escalate_offer` case carries a
  newer `#9` hunk (`_ct` from `disallowed-entity-gate.company_team`) that the clone LACKS. The rev-4 file
  `spine-escalate-catalog.js` must **NOT** be copied to live — promote ONLY the `case 'offer_hold': {…}` block as an anchored
  insertion after live's `case 'escalation_declined'` block (live has it; verified). Also flag the clone as behind live on
  `escalate_offer` (out of this round's scope; the clone should be re-based before its next catalog change).
  (ii) live `compile-current-state` Δ4 merge arm: the region matches the clone's pre-rev-3 backup EXCEPT the sentence
  `To escalate, choose who to route to. Reply the number or name:` (live) vs `… route to — reply the number or name:`
  (clone). The rev-3 merge-arm hunk (`_lines` grouping block, `_close`, `_sugText`, `${_close}` in `response`) must be
  applied as an anchored edit that **preserves live's sentence**; do not carry the clone's em-dash variant across.
- **F7 (carry-forward):** `_CO_ALIASES` stopgap in two bodies (fork `_coCompanyPick`, spine `escalation-context`) — when
  the CRM exposes `companies.code`, thread it per the diff doc and delete both literals in the same round (they must stay
  byte-identical until then).
- **F8 (observation, pre-existing, not blocking):** ccs arm B (clarify/hold re-persist) does not re-persist `entities`
  (the hold turn on 12913195 persisted `entities: []` while the offer state carried the product); the next reply that
  resolves the offer needs no entity, but a follow-up business query after a hold turn loses the entity carry. Same shape
  as the rev-1 clarify arm; note for the planner.
- **F9 (CLOSED):** the rev-4 tester run files (M8a–M8g, M8reg, S3) landed while this review was closing — all PASS, §0
  held on all 15 executions, S3 credential verified from the sub-executions' workflowData. See R6.

## R6. Rev-4 tester evidence — LANDED while this review was closing (F9 CLOSED)

The rev-4 tester run files appeared in the worktree (untracked at the time of this commit — the tester's own commit
with the rollup section will follow): `tests/runs/miss-company-routing-{M8a,M8b,M8c,M8d,M8e,M8f,M8g,M8reg,S3}-20260818.json`.
Read in full by this review: **every case `verdict: PASS`, `S0_all_pass: true`; every per-execution S0 block GATE PASS with
S1–S6 true; 15 clone executions (12913499 … 12913930) all on `0557b0b4`/`de9ff09d`/`b48e0eaa`; live re-checked
unchanged after the pass (spine `efa21057`, parser `89b63c51`, HI `9249e00e`, sendmsg `91171ac3`).** Highlights that close
the gaps listed in the previous draft of this section:
- M8a/M8b/M8c (real parser): pool rendered `Mocha (code MCH) / Sorento (code SRT)`; `company_pick:"Sorento"` (canonical
  name) on all three phrasings incl. the `request_for_help` / `is_affirmative:null` shape; `routing_source company_pick`,
  Sorento/mocha pair verbatim; `clarify-company-gate` FALSE; `offer-hold-gate`/`If10`/`Basic LLM Chain` NOT executed; HI
  short-circuit, no explicit assignee.
- M8d: t2 junk → `offer_hold` + `member_reprompt`, `correction` not true; spine `offer-hold-gate` TRUE → hold lane; If10 /
  LLM / roster / HI NOT executed; rev-4 clarify copy sent; state survived (member_offer, 9 rows, 2-row plan, companies,
  phrase); t3 "sorento" on the survived state → `company_pick Sorento` → HI with the pair. **Single-offer companion:**
  fork emits `{member_reprompt}` with NO `offer_hold`; `offer-hold-gate` executed FALSE → the pre-rev-4 If10 path.
- M8e: "no" and "no it's okay" → `escalation_declined`, `offer-hold-gate` FALSE, `Escalation declined.`, offer cleared;
  a later "sorento" → NO `company_pick`, `member_pick_context` not true (phrase-gated no-context arm confirmed on the clone).
- M8f: "any mocha promotions this month" → Tier 3 abandon (no pick, no hold, `member_pick_context` not true), normal
  promotion processing; companion "stock for MWB7629" (current-message entity) → real READ lookup only
  (`crm_inventory_stock_balance_list`, `crm_incoming_stock_list`), no pick.
- M8g: Sorento-only seed + "yes mocha" → pool `Sorento (code SRT)` only, NO `company_pick`, `prior_state` Sorento/mocha,
  HI `company_id` Sorento (never Mocha); companion "srt" → `company_pick Sorento`.
- M8reg: single-company CS offer + "yes" (mock AND real parser) → `prior_state` Sorento, unchanged behaviour.
- **S3:** the tester read the sub-executions' `workflowData` (which, unlike MCP `get_workflow_details`, carries
  credentials): `Postgres Chat Memory1.credentials.postgres == {id: Dnnofg8Xb27VQOhI, name: n8n_test-db}` on the published
  `b48e0eaa` and on all 15 sendmsg sub-executions; no fork node carries `sorento-crm-db`; `Chat Memory Manager` insert
  `{success:true}` on the 7 text-reply turns; no `Send a Message`/`HTTP Request`/`Send Template` executed. **S3 gate
  PASSED — the credential-id gap noted in R2 is closed.**

Promotion-gate (a) is therefore satisfied. Remaining gates: (b) captain's disposition of F5, (c) the sha-gated node-hunk
promote map in R7 applied on live-at-promote-time (F6).

## R6-old. Evidence not in hand at review close (superseded — kept for the record)

The concurrent rev-4 tester pass (rollup section + `miss-company-routing-M8*-20260818.json`, S3 file) had NOT landed on
`fm/miss-company-routing` (last commit 4370429). Consequently NOT independently confirmed by a tester run: M8d's
single-offer junk companion (`offer-hold-gate` FALSE → If10 path), M8e decline + later "sorento" no-pick on the CLONE
(unit-proved only), M8f new-query clear on the clone (unit-proved), M8g on the clone (unit-proved), and the S3 credential
assertion via a sub-execution on `b48e0eaa` (this review saw a successful `Chat Memory Manager` on 12913205 but cannot see
the credential id through MCP). **Promotion is gated on that rollup landing with M8a–M8g + S3 PASS and §0 held on every
rev-4 execution.** If any rev-4 case fails, this APPROVE lapses for the failing hunk.

## R7. PROMOTE CHECKLIST — UPDATED (captain-gated; reviewer authorizes, does NOT execute)

⚠️ A separate hotfix worker is editing the live spine's promotion lane concurrently. **Every step below is a node-level
hunk with a sha gate on the LIVE body at promote time; rebase on whatever live is then.** The pre-answers below were
measured on live `efa21057` (03:45Z) — if `versionId != efa21057…` at promote time, re-measure every gate before writing;
any gate miss ⇒ re-derive that hunk on the live body (never body-copy), or STOP.

Order (sub before parent, Lesson 37; backup-first; byte/param-gate draft → publish → gate active; auto-revert on mismatch):

1. **Pre-flight:** fetch fresh; require draft==active on live spine + live parser; back up full JSON + every node body
   below; run the draft-vs-active differing-nodes check (empty). Record live versionIds.
2. **Live parser `XTODTw-dJcV0uRdC056hG`** — gate: `output_exchange.jsCode` sha == `3ee5b658…` AND `AI Agent`
   `options.systemMessage` sha == `583bcfb0…` (measured true on `89b63c51`). Then `setNodeParameter` `/jsCode` :=
   `parser-fork-output_exchange.js` (**`a68c5992acac…`, the rev-5 body — supersedes the rev-4 `b2ac7783…`; fork
   `c7d9cfa2`**) and `/options/systemMessage` := `parser-fork-AI-Agent.systemMessage.txt` (`138008c2…`, unchanged by
   rev-5). Fork bodies = live + pass-1 + rev-3 + rev-4 + rev-5 hunks, so they apply as-is ONLY under that gate. The systemMessage expression references `$('When Executed by Another Workflow')` —
   live's trigger has that name and carries `previous_conversation_state` (verified). Publish; re-gate active.
   (F5 is closed by rev-5 — the `a68c5992…` body IS the F5-tightened body; see R8.)
3. **Live spine `9qVyfUxmRQqrpGRMDLRuz`** — this round touches: `compile-current-state`, `escalation-context`,
   `build-cs-member-offer`, `escalate-catalog`; NEW `miss-roster-gate`, `miss-roster-plan`, `get-cs-members-miss`,
   `build-miss-member-offer`, `clarify-company-gate`, `clarify-company-reply`, `offer-hold-gate`, `offer-hold-reply`,
   `tag-offer-hold`; connections at `central-exchange`, `escalation-context`, `If-ideate`. One atomic `update_workflow`
   batch where possible.
   a. **`escalation-context.jsCode`** := `spine-escalation-context.js` (`cca7a245…`) — gate live sha == `8c12563c…`
      (measured true). Else re-apply the 3 anchored hunks (`_CO_ALIASES` + `cpickRow` IIFE after the `qb` line; the
      `else if (cpickRow)` arm above `sameTeam`; the rev-2 line at the end of the no-plan else).
   b. **`build-cs-member-offer.jsCode`** := `spine-build-cs-member-offer.js` (`c7046c45…`) — gate live sha == `37a1b023…`
      (measured true). Else re-apply the rev-3 hunks (multi group loop header/lines; `boldNames`/`multiClose`/
      `offerCompany`/`nameCompany` block before `out.response`; the two `out.response` arms).
   c. **`escalate-catalog`** — **anchored insertion ONLY** (F6-i): insert the `case 'offer_hold': … break;` block after
      live's `case 'escalation_declined': … break;` block; gate: live body contains exactly one `case 'escalation_declined'`
      and no `offer_hold`; live sha `8b4ae985…` (NOT the clone's base — live carries the `#9 _ct` hunk; keep it).
   d. **`compile-current-state`** — anchored insertions on the LIVE body (`0b0912f1…` measured; diverges from every clone
      base): (1) the miss/clarify block (rev-4 body `spine-compile-current-state.js` lines 1082–1148: from the `// ── miss-company-routing:
      result-aware escalation scoping` comment header through the block's closing `}` at 1148, incl. the `_mcClar`
      two-node loop and the `_mcPlan`/`_mcCo` phrase; the file's `return output;` is line 1149)
      immediately before live's UNIQUE final `return output;` — verify the deps `_ideate`,`_sug`,`_mem`,`_dymLastResultSet`,
      `qf` exist (measured true); (2) the Δ4 merge-arm rev-3 hunk (`_lines` grouping block replacing the old
      `_lines = _rows.map(...)` + `if (_multiCo) {...}`; `_close`; `_sugText`; `response = \`${_sugText}…${_close}\``) —
      anchored on live's `_multiCo` block and **keeping live's sentence "choose who to route to. Reply the number or name:"**
      (F6-ii).
   e. **Add 9 nodes** with the repo bodies/params: `miss-roster-gate` (leftValue `024d91e3…`), `miss-roster-plan`
      (`0b7907d6…`), `get-cs-members-miss` (mirror **LIVE** `get-cs-members` params + credential, GET, `onError:
      continueRegularOutput` — never the clone node), `build-miss-member-offer` (`68eef4c7…`), `clarify-company-gate`
      (`63e30a3d…`), `clarify-company-reply` (`7ff06aa8…`), `offer-hold-gate` (leftValue `8f14a430…`, if 2.3),
      `offer-hold-reply` (`7ff06aa8…`, same body), `tag-offer-hold` (set 3.4, `branch_kind='offer_hold'`).
   f. **Rewire — enumerate live edges FIRST, refuse on an already-spliced shape:** (1) `central-exchange[0] →
      miss-roster-gate`; TRUE → `miss-roster-plan → get-cs-members-miss → build-miss-member-offer → dym-transform-partial`;
      FALSE → `dym-transform-partial` (live today: single edge `central-exchange → dym-transform-partial`, measured);
      (2) `escalation-context[0] → clarify-company-gate`; TRUE → `clarify-company-reply` (terminal); FALSE → `Call
      'sub-human-intervention'` (live HI has exactly ONE inbound edge `escalation-context`, measured — >1 ⇒ STOP);
      (3) `If-ideate[1] → offer-hold-gate`; TRUE → `offer-hold-reply → tag-offer-hold → escalate-catalog`; FALSE → `If10`
      (live today: `If-ideate[1] → If10` is If10's ONLY inbound edge, measured — anything else ⇒ STOP and map).
   g. Publish; param-hash EVERY node both sides and classify each mismatch by hand (If/Set/connection hunks — a Code-only
      diff misses them); re-fetch active; auto-revert on mismatch.
4. **Live HI `rrYXzE61gCNUck_zmXe-G`: nothing to promote** (`9249e00e` already carries `brand_code`/`company_id`; re-assert
   unchanged after).
5. **Live sendmsg `aoydkG1dbItXR5jXFEQsP`: nothing to promote.** The S3 credential re-point is a TEST-fork-only guard change
   (`aQUmwMVplmNcyUVc` › `Postgres Chat Memory1` → `n8n_test-db`); live's memory insert on `sorento-crm-db` is prod
   behaviour and out of scope. Do NOT touch `91171ac3`.
6. **Guards to strip: none.** No node in this round is test-only; do not copy any `is_test` leaf, `workflowInputs.value`
   blob, or fork `workflowId` to live (Lesson 48). The alias-map stopgap ships as-is (F7).
7. **Post-promote watch (specific paths):** (i) partial-miss order turn → found blocks + presenter miss line + `…escalate to
   *Sorento* customer_service team?` + picker with continued numbering + yes-sentence; (ii) both-miss offer → bold headers,
   plain lines, company-name close; "yes" → clarify (rev-4 copy), then "srt"/"sorento"/"yes please escalate to srt team" →
   HI with the Sorento pair, `routing_source company_pick`; junk on the multi offer → clarify again with state intact (no
   "Hi there!", no roster refetch); "no" → `Escalation declined.`; (iii) single-company offer + "yes mocha" → routes to the
   offered company, never Mocha; (iv) watch `next-assignee`/`team-members` 404 "No team found … in company" (admin
   config; revert trigger). Any anomaly ⇒ revert via the backed-up versionId, then diagnose. Never edit live mid-cycle.

## Verdict (pass 2)

**APPROVE** — rev-3 and rev-4 node-diffs verified against the published bodies (byte-exact) and the plan/captain
decisions; frozen-prefix contract intact in all three render arms; offer-hold lane LLM-free, read-free, arm-gated and
re-persisting the full offer; plan-first pool in all four places; alias stopgap mirrored; final parser body is
phrase-gated; S3 fix fork-only; zero egress re-confirmed on every execution in hand (rev-3 tester 9 execs + R4verify 4
execs incl. this review's own re-checks); no replay-norm change. **Promotion gate:** (a) rev-4 tester evidence M8a–M8g + M8reg + S3 —
LANDED and green with §0 held on all 15 executions (R6; F9 closed — the tester's rollup section/commit is still to
follow), (b) captain disposition of F5 (accept the ≤4-word short-path bound, or ship the rev-5
tightening after a tester pass), (c) apply the promote map above as sha-gated node hunks on live-at-promote-time (F6).

---

# Rev-5 (F5 guard) — reviewer pass 3, 2026-08-18

## R8. Rev-5 verification — PASS, F5 CLOSED

- **Published state (re-fetched from MCP):** parser fork `wI5RkNGW3EOJfBdo` `versionId == activeVersionId ==
  c7d9cfa2-b46e-43b4-a227-8104616401e4` (updatedAt 03:32:31Z), 8 nodes, 0 draft/active differing nodes. Diffed the whole
  fetched workflow against my earlier `de9ff09d` fetch: **exactly ONE node's parameters changed (`output_exchange`)**; every
  other node's parameters + meta, all connections and `settings` byte-identical; systemMessage still `138008c2…`. Deployed
  `output_exchange.jsCode` sha `a68c5992acac…` `==` repo `parser-fork-output_exchange.js`. Spine clone `0557b0b4`, sendmsg
  fork `b48e0eaa`, live parser `89b63c51` untouched (diff doc rev-5; consistent with the tester's live re-check).
- **The hunk (git diff 98420ec..9e52afc on the body):** comments + ONE expression:
  `const shortOk = words.length > 0 && words.length <= 4 && (kept.length < 2 || (!curEnt && !domainQ));` — exactly the F5
  suggestion. Tier order unchanged (Tier 2.5 before Tier 3); the coder's reasoning is accepted: moving Tier 2.5 after
  `_isNewQuery` would drop the single-token picks whenever the real parser speculatively domain-classifies a bare company/code
  token (the LESSON-39 shape), which is behaviour-changing on the evidenced class; the guard alone reaches the F5 target set
  (`pickLlm` already required `!domainQ`; the no-context arm shares the resolver so a `business_query`-without-domain
  "mocha promotions" is refused there too).
- **Units re-run by this review on the deployed body:** 48/48 green (the 16 new rev-5/F5 cases incl. the four probes, the
  "single token speculatively domain-classified" case, and the no-context-arm cases).
- **Real-parser proof (planner, `R4verify.md` rev-5 section, fork `c7d9cfa2`/clone `0557b0b4`):** "mocha promotions"
  12914974 → promotion query (no pick/HI/hold; was `company_pick Mocha` on rev-4); "show sorento orders" 12914987 → order
  lookup ran, no HI; "srt" 12915006 → Sorento pick, HI guarded; "yes mocha" 12915016 → Mocha pick, HI guarded; egress =
  guard records only.
- **(3) Could `!domainQ` refuse a legit pick like "sorento team" on a speculative `domain_hint`?** No: `team` is a filler,
  so `kept == ["sorento"]` (`kept.length < 2`) and the short path stays unguarded — probed on the deployed body with
  business_query/order, clarification and casual stubs: all three ⇒ `company_pick Sorento`. Same for "the sorento one",
  "mocha side pls", "Mocha team pls" (+ current-message brand entity), bare "sorento" with a speculative domain + entity.
  The units cover this class explicitly ("rev-5 pick 'Mocha team pls' … single token", "rev-5 pick bare 'sorento'
  speculatively domain-classified"). **Residual (documented, accepted, non-blocking):** a pick phrase with ≥2 NON-filler
  tokens — probed "sorento cs team", "sorento customer service", "sorento branch" — is refused ONLY IF the LLM also
  speculatively marks it business_query/domain (casual/request_for_help ⇒ still a pick); the refusal falls to Tier 3 = safe
  new-query abandon (never a wrong assign — the LESSON-39 direction, UAC "resolve OR safe abandon = PASS"). If this shows up
  in console use, the cheap follow-up is adding `cs`, `customer`, `service`, `branch`, `office` to `_coFillers` (parser
  fork only) — not required for this round.

## R9. FINAL VERDICT — whole round (rev-1 … rev-5)

**APPROVE.** Published targets for promotion: spine clone `txiPzSxy3Pclsz6v` @ `0557b0b4-8f2d-457e-8f64-4e1d600c6ca1`,
parser fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2-b46e-43b4-a227-8104616401e4` (`output_exchange` `a68c5992…`, systemMessage
`138008c2…`), sendmsg fork `aQUmwMVplmNcyUVc` @ `b48e0eaa` (TEST-only S3 guard — NOT promoted). Node-diffs verified
byte-exact against the published bodies for every revision; frozen-prefix parser contract intact in all render arms; the
offer-hold lane is LLM-free/read-free/arm-gated and re-persists the full offer; plan-first pool in all four places; alias
stopgap mirrored (F7 carry-forward); parser body phrase-gated; F5 short-path hijack closed by rev-5 with real-parser proof;
zero egress re-confirmed on every execution of the round (rev-1/2: 20, rev-3: 9, rev-4: 15 + R4verify 4, rev-5: 4 — all
`would_*` guard records only, HI always short-circuited, no orphaned egress node ever ran, get-results tools read-only,
S3 chat-memory insert now on `n8n_test-db`); no replay-norm change needed. Open items are all non-blocking: F6 (promote-map
corrections — live diverges on `escalate-catalog` and the ccs merge-arm sentence; the R7 map already encodes them), F7
(alias stopgap), F8 (arm B `entities` re-persist, planner note), the R8 residual (extra-token pick phrases under a
speculative domain — safe-abandon direction), and F2 (captain-accepted chat-console exception, closed).

**Promotion is captain-gated on the R7 checklist**, applied as sha-gated node hunks against LIVE at promote time (a hotfix
worker is editing the live spine concurrently — re-measure every gate; live was `efa21057` / parser `89b63c51` at this
review's fetches), with step 2's parser body = **`a68c5992…` (rev-5)**. Reviewer authorizes; does not execute.

---

# Staged live payload — reviewer pass 4, 2026-08-18

## R10. Staged live payload verification (2026-08-18)

Independent read-only re-verification of the STAGED (not applied) round-2 promotion payload
(`tests/runs/miss-company-routing-promote-STAGED-20260818.md`, dir `tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/`)
against R7 (+R8/R9 rev-5 parser body). Live/clone/fork re-fetched via public REST GET only; nothing written, nothing executed.
Shas = sha256 of the raw string (`jq -j`), first 8 hex.

| # | check | result | measured |
|---|---|---|---|
| 1a | PRE spine == current live | PASS | live `9qVy…` versionId `7aba1447-61f6-490d-89b4-22d1a196716d` == activeVersionId, updatedAt 03:47:32Z, 127 nodes; `{versionId,activeVersionId,nodes,connections,settings}` sha identical to `PRE-…-7aba1447.json` (`46680cdc…`); `jq -S` full-file diff empty |
| 1b | PRE parser == current live | PASS | `XTODTw…` `89b63c51-57f0-45fd-96ce-2df103c2fb9d` draft==active, 7 nodes, sha `9c7eb3ad…` identical to PRE |
| 1c | PRE HI == current live | PASS | `rrYX…` `9249e00e-3dd9-4766-8c49-2f32f8f66bda` draft==active, identical to PRE (nothing to promote) |
| 2a | R7 sha gates on PRE parser | PASS | `output_exchange.jsCode` `3ee5b658`; `AI Agent.options.systemMessage` `583bcfb0`; trigger `When Executed by Another Workflow` carries `previous_conversation_state` |
| 2b | R7 sha gates on PRE spine | PASS | `escalation-context` `8c12563c`; `build-cs-member-offer` `37a1b023`; `escalate-catalog` `8b4ae985` (1× `case 'escalation_declined'`, 0× `offer_hold`); `compile-current-state` `0b0912f1` (exactly one `^return output;`, deps `_ideate`/`_sug`/`_mem`/`_dymLastResultSet`/`qf` each declared once, live sentence "choose who to route to. Reply the number or name:" present 1×) |
| 2c | R7 edge shapes on PRE | PASS | `central-exchange` → single edge `dym-transform-partial` (its only inbound); HI inbound = exactly `escalation-context`; `If-ideate[1]` → `If10` (If10's only inbound); `If-ideate[0]` → `ideate-turn-http` |
| 2d | 9 new nodes absent on PRE | PASS | 0/9 present; none of the 9 new node ids collide with a live node id |
| 3a | PAYLOAD spine vs PRE — node sweep | PASS | 127 → 136 nodes, 0 duplicate names; params changed on exactly `compile-current-state` (→`492a8591`), `escalate-catalog` (→`5ec7d6a7`), `build-cs-member-offer` (→`c7046c45`), `escalation-context` (→`cca7a245`); exactly 9 added; 0 dropped; 0 non-`parameters` field diffs (type/typeVersion/credentials/onError/position/disabled) on any pre-existing node |
| 3b | PAYLOAD spine vs PRE — connections | PASS | exactly 11 keys changed = R7 3f: `central-exchange`→`miss-roster-gate` {T `miss-roster-plan`→`get-cs-members-miss`→`build-miss-member-offer`→`dym-transform-partial`, F `dym-transform-partial`}; `escalation-context`→`clarify-company-gate` {T `clarify-company-reply` (terminal, no outbound key), F `Call 'sub-human-intervention'`}; `If-ideate[1]`→`offer-hold-gate` {T `offer-hold-reply`→`tag-offer-hold`→`escalate-catalog`, F `If10`}; `If-ideate[0]` stays `ideate-turn-http` |
| 3c | hotfix leaves preserved | PASS | `Call 'sub-get-results'` node byte-identical to PRE (`tool={{ $('tool-filter').first().json.name }}`, `contact_id={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}` no trailing space); `tier-probe` byte-identical; `if-tier-ask` byte-identical (`options.typeValidation=loose`, `version 2`); all `executeWorkflow` workflowId leaves identical to PRE |
| 4a | PAYLOAD spine vs clone `0557b0b4` — 13 nodes | PASS | clone re-fetched at `0557b0b4-8f2d-457e-8f64-4e1d600c6ca1` (159 nodes); 11/13 nodes params byte-equal to clone (`build-cs-member-offer`, `escalation-context` + the 9 new); `escalate-catalog` and `compile-current-state` differ from clone BY DESIGN (F6); type/typeVersion/credentials/onError equal on all 13; new/rewired connection entries byte-equal to clone for 10/11 keys, the 11th (`If-ideate`) differs only in output[0] which correctly keeps LIVE's `ideate-turn-http` (clone has the test-only `ideate-egress-gate`) |
| 4b | `escalate-catalog` live→payload | PASS (F6-i) | `diff` = one insertion `82a83,91`: the `case 'offer_hold': … break;` block (9 lines) immediately after `case 'escalation_declined': … break;`, byte-equal to the clone's block; live's `#9 _ct` hunk kept (2 `_ct` refs live/payload, 0 on clone) — clone body NOT copied |
| 4c | `compile-current-state` live→payload | PASS (F6-ii) | 684 → 773 lines; `diff` = exactly the merge-arm hunks (`75,78c75,80`, `80c82,92`, `82a95,96`, `86c100,108`) + one insertion `682a705,771`. Payload lines 75–108 == clone 75–108 except the ONE sentence line, which keeps LIVE's "choose who to route to. Reply the number or name:" (clone: "— reply the number or name:"); payload 705–771 == clone 1082–1148 IDENTICAL (miss/clarify block, `_mcClar` two-node loop, `_mcPlan`/`_mcCo`) placed before the unique final `return output;`; clone-only lane markers (`N-1a`,`N-2`,`spec-search`,`spec_search`) 0× in payload (clone 1/5/1/9) |
| 4d | repo bodies == payload | PASS | `spine-escalation-context.js` `cca7a245`, `spine-build-cs-member-offer.js` `c7046c45`, `spine-build-miss-member-offer.js` `68eef4c7`, `spine-clarify-company-reply.js` `7ff06aa8` (both `clarify-company-reply` and `offer-hold-reply`), `spine-miss-roster-plan.js` `0b7907d6`, `.expr.txt` leftValues `024d91e3`/`63e30a3d`/`8f14a430` (F1-corrected values), `PAYLOAD-node-escalate-catalog.js` `5ec7d6a7`, `PAYLOAD-node-compile-current-state.js` `492a8591` — all byte-equal to the payload node bodies; `tag-offer-hold` set 3.4 `branch_kind='offer_hold'` |
| 5 | PAYLOAD parser vs PRE | PASS | 7 nodes both sides, 0 added/dropped, connections byte-equal, settings `{executionOrder:v1}`; only two leaves differ: `output_exchange` `/jsCode` `3ee5b658`→**`a68c5992`** (== repo `parser-fork-output_exchange.js` == fork `wI5RkNGW3EOJfBdo` @ `c7d9cfa2`; F5 `shortOk` guard line present) and `AI Agent` `/options/systemMessage` `583bcfb0`→**`138008c2`** (== repo, == fork); NO `Postgres Chat Memory` (fork has one; payload has 0 memory nodes); live `suggest-follow-up` `338ea668` retained (fork's older `5e659811` NOT carried); options keys unchanged (`["systemMessage"]`) |
| 6a | no fork ids / test scaffolding leaked | PASS | 0 occurrences in either payload of `wI5RkNGW3EOJfBdo`, `vUfFUDjLAuMaeQE6`, `t4QvrtrPnTwRU6br`, `aQUmwMVplmNcyUVc`, `tWm5DYLxfypmVC1T`, `txiPzSxy3Pclsz6v`, `Dnnofg8Xb27VQOhI`, `main-message-list-test`, `sorento-respond-message-TEST`, `test_mode`, `test-guard`, `n8n_test`. `is_test` appears only where LIVE already has it (schema-only entries on `Call 'sub-human-intervention'`/`send-transcript-confirm`/`sorento-sub-respond-sendmsg-presign-fail`, value absent — byte-identical to PRE) and in a code COMMENT of `clarify-company-reply`/`offer-hold-reply`; parser `mock_reformulator` refs are live's own `test-reformulator-bypass`/`mock-reformulator-output` nodes (byte-identical to PRE) |
| 6b | `$('X')` refs resolve on live | PASS | every `$('…')` reference in the 13 touched/new bodies names a node present in the payload (0 missing) |
| 6c | `get-cs-members-miss` == live `get-cs-members` | PASS | params byte-equal, credential `httpHeaderAuth mNsZWyU82NYV58k2 crm-n8n-auth` equal, httpRequest 4.3, `onError: continueRegularOutput` |
| 7 | REST PUT shape | PASS | both payloads: keys exactly `{name,nodes,connections,settings}`, `settings == {executionOrder:"v1"}`, `name` equal to live. Live's extra settings (`availableInMCP`, `callerPolicy: workflowsFromSameOwner`, `binaryMode`) are known to survive a stripped PUT server-side (memory note, verified 2026-08-17 on the clone) — **apply-step post-check: re-assert those three keys after PUT** |

Not measured (out of scope of a payload review, unchanged from R9): runtime behaviour — covered by the round's tester evidence and R8 real-parser proof.

### Verdict — **APPROVE-TO-APPLY**

The staged payloads are exactly the R7 promote map rebased on live `7aba1447` / `89b63c51`: every gate re-measured
true on the PRE bodies, the PRE dumps are byte-identical to live right now, the spine PUT touches precisely the 4
mapped nodes + 9 new nodes + 11 connection keys and nothing else (hotfix leaves and all 114 other nodes byte-identical),
`escalate-catalog`/`compile-current-state` are anchored insertions on the LIVE bodies (F6-i/F6-ii honoured, no clone lane
work carried), the parser PUT changes only the two rev-5 leaves (`a68c5992` / `138008c2`) with no fork scaffolding, and
no test guard / fork id / test-DB reference is present in either payload. Reviewer authorizes; captain executes.
Apply order + post-checks as recorded in the STAGED run doc (parser PUT → assert active + shas; spine PUT → assert active,
136 nodes, 4 shas, 9 nodes, 11 connection keys, hotfix leaves, settings extras; HI unchanged; any mismatch ⇒ PUT the PRE
body back). Never edit live mid-cycle.

## R11. Round-3 review + combined round-2+3 payload verification (2026-08-18)

Reviewer pass over plan §Round 3 (R3.0–R3.7, planner decisions D1 = domain's own routing team / D2 = none flipped /
D3 = (b) widen `cs-offer-gate`), the coder's round-3 + round-3 rev-2 diff sections, the tester's rev-2 FULL re-run
(25 execs), and the refreshed combined round-2+3 staged live payload. Read-only: REST GETs (workflows + 3 parent execs
+ 5 sub-execs) and repo reads. Units re-run locally. Nothing edited, nothing executed, nothing promoted.
Shas = sha256 first 8 hex of the raw leaf (`jq -j`) unless noted; object shas = sorted-JSON.

### Per-check table

| # | check | result | measured |
|---|---|---|---|
| 1 | clone `txiPzSxy3Pclsz6v` published state | PASS | versionId == activeVersionId == `e54e114e-86e6-4023-8926-3fec6fc1ef51`, 159 nodes / 143 connection sources, updatedAt 04:48:12Z |
| 2 | the 3 round-3 shas on the published clone == repo files == diff-doc | PASS | `miss-roster-gate.leftValue` **`d24dd81b`**, `cs-offer-gate` g2 **`cfa8c18e`** (conditions json `391a31c8`), `build-cs-member-offer.jsCode` **`63c1c46e`** — each byte-equal to `tests/diffs/miss-company-routing/{spine-miss-roster-gate.expr.txt, spine-cs-offer-gate.expr.txt, spine-build-cs-member-offer.js}` |
| 3 | clone delta vs round-3 PRE `0557b0b4` is EXACTLY the claimed set | PASS | param-changed = {`miss-roster-gate`, `cs-offer-gate`, `build-cs-member-offer`} only; 0 added/dropped nodes; connections byte-identical; 0 non-param field diffs (id/type/typeVersion/credentials/onError/disabled) |
| 4 | round-2 lane bodies unchanged on `e54e114e` | PASS | `miss-roster-plan` `0b7907d6` · `build-miss-member-offer` `68eef4c7` · `compile-current-state` `5a84dfea` · `escalation-context` `cca7a245` · `escalate-catalog` `0168df84` · `clarify-company-reply`/`offer-hold-reply` `7ff06aa8` · `offer-hold-gate` `8f14a430` · `clarify-company-gate` `63e30a3d` · `tool-filter` `bffb4c3a` |
| 5 | parser fork untouched | PASS | `wI5RkNGW3EOJfBdo` draft==active `c7d9cfa2-…`; `output_exchange` `a68c5992`, systemMessage `138008c2` |
| 6 | clone guard wiring intact (fail-closed clone) | PASS | all 19 `executeWorkflow` targets are the TEST forks only (`wI5RkNGW3EOJfBdo`/`vUfFUDjLAuMaeQE6`/`t4QvrtrPnTwRU6br`/`aQUmwMVplmNcyUVc`/`tWm5DYLxfypmVC1T`/`tWP33QOFT7SxThfT`); connections untouched by both PUTs ⇒ the 5 orphaned egress nodes stay orphaned |
| 7 | LESSONS #45 forbidden tokens | PASS | `prototype`/`constructor`/`__proto__`: 0 hits in any non-Code node's parameters on the clone AND in the spine payload's non-Code nodes; sole Code-node hit is the pre-existing `compile-current-state` jsCode (different sandbox, allowed) |
| 8 | offline units re-run by the reviewer | PASS | `tests/unit/miss-company-routing-round3.gates.test.js` **52 passed, 0 failed** on the repo expression files (== deployed shas per check 2); node:test wrapper 1/1 |
| 9 | exec spot-check N1r2 `12922904` | PASS | success on the clone; `tool-filter` = `crm_incoming_stock_list`; `miss-roster-gate` [1,0] TRUE, lane ran (`miss-roster-plan` 1 Sorento row brand `mocha` → `get-cs-members-miss` 200 = Jereen Tee only → `build-miss-member-offer` picker "2. Jereen Tee"); persisted `response` ends `Would you like me to escalate to *Sorento* purchasing team?`; `last_result_set` idx 1 (MUB6201) + idx 2 (Sorento member); `routing_company` Sorento / `routing_brand` mocha; get-results sub-exec `12922914` = fork `t4QvrtrPnTwRU6br`, nodes `MCP Client1`+`output-structurer` only (READ); sendmsg sub `12922916` = fork `aQUmwMVplmNcyUVc`, `HTTP Request` NOT executed; no orphaned egress node ran |
| 10 | exec spot-check N4-picker t3 `12923121` | PASS | `escalation-context` = {company_id Sorento `…0001`, brand_code `mocha`, routing_source `company_pick`, team `purchasing`}; `clarify-company-gate` [0,1] FALSE → HI; HI sub `12923129` = fork `vUfFUDjLAuMaeQE6` short-circuited at `test-guard` (4 nodes, no assign/SLA/PIC); sendmsg sub `12923130` fork, no `HTTP Request` |
| 11 | exec spot-check R-M1r2 `12923242` (orders regression) | PASS | `tool-filter` = `crm_order_management_orders_list`; gate TRUE; picker members 3–8 (Maryam…Nurain, the round-2 M1r3 CS roster); same fork-only sub-exec pattern; no orphaned egress node ran |
| 12 | zero-egress re-confirmation from evidence | PASS | all 15 rev-2 evidence JSONs: verdict PASS + `S0_all_pass:true`; egress actions across the whole set = {`would_log`,`would_send`,`would_write`} ONLY — no non-would action, no respond.io 2xx send, no assignment/SLA/PUT write; resolved get-results tools ∈ {incoming_stock_list, orders_list, inventory_stock_balance_list, marketing_promotions_list} — all READ, never `crm_it_support_ticket_create` |
| 13 | scope/tier | PASS | plan scope `deterministic` matches: 24/25 turns on the fork bypass (0 LLM tokens); the single parser-tier turn (N4b) is a rev-4 regression re-run on the unchanged fork — allowed |
| 14 | live spine current state (R10 1a re-run) | PASS | `9qVy…` activeVersionId **`7aba1447`** (updatedAt 04:28:14Z); draft `cfd0e776` ≠ active but nodes/connections/settings/name shas ALL identical to `PRE-9qVy…-7aba1447.json` — the content-empty UI draft is still content-identical (re-verified this pass) |
| 15 | live parser + HI current state (R10 1b/1c re-run) | PASS | `XTODTw…` draft==active `89b63c51`, nodes/connections/settings identical to PRE; `rrYX…` draft==active `9249e00e` |
| 16 | R7/R10 sha gates on PRE/live | PASS | spine: `escalation-context` `8c12563c` · `build-cs-member-offer` `37a1b023` · `escalate-catalog` `8b4ae985` · `compile-current-state` `0b0912f1`; parser: `output_exchange` `3ee5b658` · systemMessage `583bcfb0` |
| 17 | `cs-offer-gate` live before-shape | PASS | live (draft+PRE) conditions json `ce99a16c`, 3 conditions, node id `18e0a370-…` == clone PRE `0557b0b4` (`ce99a16c`, 3) — the hunk applies cleanly; payload keeps the LIVE node id with clone `e54e114e` params (byte-equal, `391a31c8`) |
| 18 | payload spine sweep vs PRE | PASS | 127 → 136 nodes; params changed on EXACTLY 5 (`compile-current-state` `492a8591`, `escalate-catalog` `5ec7d6a7`, `build-cs-member-offer` **`63c1c46e`**, `escalation-context` `cca7a245`, `cs-offer-gate` `391a31c8`); EXACTLY 9 new, 0 dropped, 0 non-param field diffs; EXACTLY 11 connection keys changed (the R10 3b set); top keys `{name,nodes,connections,settings}`, settings `{executionOrder:v1}` |
| 19 | payload == clone on the touched nodes | PASS | 12/14 touched nodes params byte-equal to clone `e54e114e` (incl. `miss-roster-gate` `d24dd81b`, `cs-offer-gate`, `build-cs-member-offer` `63c1c46e`); `escalate-catalog`+`compile-current-state` differ BY DESIGN (F6 anchored insertions on the LIVE bodies, == `PAYLOAD-node-*.js` files `5ec7d6a7`/`492a8591`); type/typeVersion/onError/credentials equal on all 14 |
| 20 | `get-cs-members-miss` mirrors LIVE `get-cs-members` | PASS | params byte-equal, credential equal, `onError continueRegularOutput` |
| 21 | gate dependencies exist on live | PASS | `tool-filter` on live PRE with params byte-equal to clone (jsCode `bffb4c3a`); `crossdomain-render` on live PRE emits `_xdBlock` with `any: blocks.length > 0` — exactly the shape the new leg reads (and the leg tolerates not-executed / no-block: units i-d, ii-b) |
| 22 | no fork ids / test scaffolding in either payload | PASS | 0 occurrences of any fork id, clone id, test cred/list/DB name, `test_mode`, `test-guard`; `is_test` only as live's own schema-only entries (byte-identical to PRE) + one code comment in `clarify-company-reply`/`offer-hold-reply` |
| 23 | parser payload unchanged since R10 | PASS | vs PRE: 7 nodes both sides, connections byte-equal, only `output_exchange` (`3ee5b658`→`a68c5992`) and systemMessage (`583bcfb0`→`138008c2`) differ; 0 memory nodes; == fork `c7d9cfa2` leaves == repo files |
| 24 | domain audit independently cross-checked | PASS | grep of the CRM repo (worktree `agent-af782288cc8ee12b6`): `stamp_lookup_companies` is called from exactly 6 services — order, incoming_stock, inventory, marketing, certificate_query, product (+ the helper itself) — matching R3.1's stamp column tool-for-tool; presenters expose exactly 14 `crm_*` tools, all present in the audit table; no per-company tool missed. The captain's "DO" has no distinct tool — delivery fields ride the orders builders (`Actual Delivery Date` in `_orders_list`/by-product), i.e. covered by the orders lane |
| 25 | fail-closed on every new leg | PASS | allowlist miss / tool-filter absent / throw / routing mismatch / xd block ⇒ false (units vii-a–d, v-a–d, ii; real execs N7/N8/N9 gate FALSE with the miss line present); `cs-offer-gate` g2 try→false (the recorded semantic delta: routing:null now fails closed instead of throwing — an improvement); roster 404/empty ⇒ byte-identical passthrough (N10 + `onError`) |
| 26 | byte-identical orders/stock/single-company behaviour | PASS | tester R-M1 sent text byte-identical to round-2 M1r3 (spot-checked: same CS roster 3–8), R-M5 qty-0 no offer, R-M8 t1 picker byte-identical to M7d t1, R-B t1 byte-identical to M7e t1; F-R3-5 units prove orders/single outputs of `build-cs-member-offer` == PRE body on the same fixtures |

### Findings

- **F-R11-1 (none blocking).** All rev-1 blockers closed: F-R3-4 (sandbox `prototype` throw) fixed by `d24dd81b` and proven
  in the real sandbox on every answered-turn shape (N1/N5/N7/N8/N9/R-M1 — TRUE and FALSE branches both exercised, no
  ExpressionError); F-R3-5 fixed by `63c1c46e` with orders/single byte-identity proven both offline and on-exec.
- **F-R11-2 (residuals, cosmetic, agreed-deferred):** F-R3-2 stale "order turn" header comments in `miss-roster-plan`/
  `build-miss-member-offer`; F-R3-3 family in `build-cs-member-offer` (the `customer_service` fallback literal — reachable
  only if `escalate-catalog.response` is empty, which the offer arm never produces — and the `no customer-service members
  are configured — omitted` line, mirrored verbatim by `compile-current-state`, so it must move in lockstep). Fold all
  into the next body change; none affects behaviour now.
- **F-R11-3 (replay-norm, clarification on R3.4):** R3.4's "0 expected diffs" is correct for `miss-roster-gate` (golden
  envelopes predate `lookup_companies` stamping ⇒ gate FALSE corpus-wide) and needs no norm rule. The D3=b `cs-offer-gate`
  widening (decided after R3.4 was written) is also inert on the historical corpus: pinned golden parser outputs predate the
  `routing` field (brand-company-routing, 2026-08-17), so g2's `routing || {}` matches no pair ⇒ FALSE, same branch as the
  old gate. Fresh post-2026-08-17 captures of incoming not-found turns will show the picker as diffs BY DESIGN (Lesson 40/41).
  No `norm()` change. Recorded so future replay diffs on such turns aren't misread as regressions.
- **F-R11-4 (observation, out of scope — flag for a later routing round):** tester rev-2 observation 4 — on an incoming
  turn answered in BOTH companies (N5b), `disallowed-entity-gate` persisted a single Mocha `routing_companies` row although
  the envelope covered both. Harmless here (gate FALSE), pre-existing axes logic; worth its own look.

### Judged items (my view; captain owns the decision)

- **Allowlist vs the captain's "bring each one that lacks the offer onto the same mechanism" (D2):** the captain's order
  itself allows "any you deliberately left out and why", and the promote record lists them with reasons. Stock is the
  captain's own decision 2 (qty-0 == honest answer). Promotions ×2 / master products / product attachments / certificates
  are left out on the "definitive answer, nothing for the other team to look up" rule — I find this consistent and correct
  (a per-company absence there is the answer, not a lead), and each is a one-row `LANE` flip if the captain reads
  requirement 2 more broadly. **This stays a captain decision at the promote gate — confirm D2=none when authorizing.**
- **D3=b consequence (no-entity incoming not-found ⇒ picker with plan `company_id null`, probe 12923358):** acceptable.
  It is exactly the shape CS/order not-found turns have had since round 2 (pre-existing for CS); the widening only gives
  purchasing the same behaviour, and a null plan company falls through to the existing escalation-context arms. No change
  requested.
- **One-offer-per-turn precedence (gate yields to `crossdomain-render`'s `_xdBlock.any`):** correct design — two frozen
  phrases on one turn would break the "yes" contract; verified on live shape (check 21) and units (ii)/(ii-b), plus the
  real xd-probe path (N6, exactly ONE offer).

### Verdict — **APPROVE** (round 3 + combined round-2+3 staged payload)

Round 3 rev-2 is verified byte-exact on the published clone, the domain audit is independently confirmed complete, every
new leg is fail-closed, the round-2 orders/stock/single-company behaviour is proven byte-identical, zero egress is
re-confirmed on all 25 executions (evidence + 3 independent exec spot-checks incl. sub-executions), and the refreshed
combined payload is exactly the R10-approved payload plus the three round-3 bodies (`d24dd81b` / `cfa8c18e`+`391a31c8` /
`63c1c46e`) with the sweep still closed (5 changed + 9 new + 11 connection keys, nothing else). **APPROVE-TO-APPLY stands
for the combined round-2+3 payload.** Promotion remains captain-gated (`needs-decision [key=promote-round2-3]`).

### PROMOTE CHECKLIST — delta over R7 (only what changed; everything else in R7 + the STAGED run doc apply-order stands)

1. **R7 3e (add 9 nodes):** `miss-roster-gate` leftValue is **`d24dd81b`** (round-3 rev-2) — NOT `024d91e3` (round 2)
   and NOT `031dda83` (round-3 rev-1, sandbox-fatal: it throws on every answered turn — must never reach live).
2. **R7 3b (`build-cs-member-offer`):** promote sha is **`63c1c46e`** (F-R3-5 team-label note) — supersedes `c7046c45`;
   gate on live `37a1b023` unchanged; orders/single output byte-identity already proven, no re-measure beyond the sha.
3. **NEW 5th changed node — `cs-offer-gate` (LIVE node id `18e0a370-…`, promote keys on name):** gate = live conditions
   json sha `ce99a16c` with EXACTLY 3 conditions (measured true on `7aba1447`); then conditions := clone `e54e114e`
   params (g1 unchanged, g2 = allowlist-pair boolean IIFE `cfa8c18e`, g3 removed; resulting conditions json `391a31c8`).
   Gate miss ⇒ STOP (someone touched the node) — re-derive, never body-copy.
4. **Sweep expectation update (R7 3g / R10 3a-3b):** post-PUT param-hash vs `PRE-9qVy…-7aba1447.json` must show exactly
   **5 changed + 9 new + 11 connection keys** (was 4+9+11), 136 nodes, 0 dropped, 0 non-param field diffs.
5. **Live-draft note (LESSONS #24):** live spine carries a content-empty UI draft `cfd0e776` ≠ active `7aba1447`
   (nodes/connections/settings byte-identical to PRE — re-verified 2026-08-18 in this pass). The promote PUT supersedes
   it. Immediately before applying: re-fetch and re-confirm the draft is STILL content-identical to the PRE backup —
   if it has drifted, STOP and diff before any publish.
6. **Post-PUT expression smoke (LESSONS #45):** after the spine PUT, run ONE answered-turn watch case FIRST (the R7 §7(i)
   partial-miss order turn) and confirm no `ExpressionError` at `miss-roster-gate`/`cs-offer-gate` before walking the rest
   of the watch list; add to the §7 watch: an incoming partial-miss turn (`*<Co>* purchasing team` + picker) and an
   incoming not-found turn (picker now renders — D3=b).
7. Parser payload, apply order (parser before spine), rollback method, and all other R7/R10 rows: **unchanged**.

---

# Round-3 rev-3 + final combined payload — reviewer pass 5, 2026-08-18

## R12. Round-3 rev-3 review + final combined payload verification (2026-08-18)

Reviewer pass over plan §"Round 3 rev-3" (V1–V7, captain console corrections: member picker ORDERS-ONLY; incoming +
stock per-company miss = PLAIN escalation offer, no roster GET; qty-0 row = answered; `cs-offer-gate` reverted to
live), the coder's round-3 rev-3 diff section, the tester's rev-3 Q-series pass (23 execs + P2 probe), and the
re-staged combined round-2+3 payload (`LIVE-PROMOTE-STAGED-20260818/`, re-staged commit `4cc0bcf`). Read-only:
REST GETs (5 workflows, 5 executions incl. 1 HI sub-exec) + repo reads; units re-run locally. Nothing edited,
nothing executed, nothing promoted. Shas = sha256 first 8 hex of the raw leaf (`jq -j`).

### Per-check table

| # | check | result | measured |
|---|---|---|---|
| 1 | clone published state | PASS | `txiPzSxy3Pclsz6v` versionId == activeVersionId == `7db593b0-ef2e-453b-bc98-30ff9267bf41`, 160 nodes, updatedAt 06:13:16Z |
| 2 | the 7 changed bodies on the published clone == repo files == diff-doc | PASS | `miss-roster-gate.leftValue` **`92ca1ccc`** · `miss-roster-plan` **`c4a19b6f`** · NEW `miss-members-gate.leftValue` **`14576e69`** · `build-miss-member-offer` **`fab11982`** · `compile-current-state` **`6bff997d`** · `clarify-company-reply` == `offer-hold-reply` **`377c2df4`** · `cs-offer-gate` conditions json **`ce99a16c`** (3 conditions, g2 `fafa8b77`) — each byte-equal to `tests/diffs/miss-company-routing/*` |
| 3 | clone delta vs rev-2 PRE `e54e114e` is EXACTLY the claimed set | PASS | 159→160 nodes (+`miss-members-gate` only, 0 dropped); param-changed = exactly the 7 nodes of check 2; 0 non-param field diffs; connections 143→144 keys — ONE changed key (`miss-roster-plan` → `miss-members-gate`) + the new `miss-members-gate` key {T→`get-cs-members-miss`, F→`build-miss-member-offer`}; nothing else |
| 4 | parser fork untouched | PASS | `wI5RkNGW3EOJfBdo` draft==active `c7d9cfa2`; `output_exchange` `a68c5992`, systemMessage `138008c2` == repo files |
| 5 | clone guard wiring intact | PASS | all `executeWorkflow` targets are TEST forks/shared-read subs only (`aQUmwMVplmNcyUVc`×9, `t4QvrtrPnTwRU6br`×6, `tWP33QOFT7SxThfT`×1, `tWm5DYLxfypmVC1T`×1, `vUfFUDjLAuMaeQE6`×1, `wI5RkNGW3EOJfBdo`×1); the 5 orphaned egress nodes all 0-inbound; `…save-message-redis'2` → fork `tWm5` (known non-orphan, TEST list only) |
| 6 | LESSONS #45 forbidden tokens | PASS | `prototype`/`constructor`/`__proto__`: 0 hits in any non-Code node's parameters on the clone AND in the spine payload |
| 7 | offline units re-run by the reviewer | PASS | `round3.gates` **85/85** · `rev4.spine` **33/33** · `rev4.output_exchange` **48/48** on the repo files (== deployed shas per check 2/4) |
| 8 | exec spot-check Q1 `12931343` (incoming plain offer) | PASS | `tool-filter` `crm_incoming_stock_list`; `miss-roster-gate` [1,0]; plan `{Sorento, mocha, team purchasing, members:false}`; **`miss-members-gate` [0,1] FALSE, `get-cs-members-miss` ABSENT from runData — zero roster GET**; bmmo `miss_plain_offer:true`, no member keys; reply ends `*Sorento:* no incoming stock records for MUB6201.` + `Would you like me to escalate to *Sorento* purchasing team?` and NOTHING after; persisted `selection_context null`, 1-row team-stripped plan, Sorento/mocha pair |
| 9 | exec spot-check Q3 `12931546`/`12931581` (captain qty-0 shape + "yes") | PASS | t1 evidence: `crm_inventory_stock_balance_list`, Mocha qty-0 HOLD row + qty-3 row = ANSWERED, plan exactly 1 Sorento item team `warehouse`, mmg FALSE, roster_calls {}, phrase `…*Sorento* warehouse team?`; t2 re-fetched: `escalation-context` `{routing_source prior_state, Sorento, mocha, team warehouse, agent_name General Enquiries}`; HI sub `12931588` = fork `vUfFUDjLAuMaeQE6`, 4 nodes (`chat?`→`test-guard`→`test-guard-record`) short-circuit, payload `team warehouse / agent general_enquiries / is_test:true`, no explicit assignee, `get-round-robin-assignee` never ran |
| 10 | exec spot-check Q7 `12932893` vs R-M1 `12923242` (orders byte-identity) | PASS | mmg [1,0] TRUE → `get-cs-members-miss` executed; sent text **byte-identical** to 12923242 except the `_Data last updated:_` stamp line; picker members 3–8 (Maryam…Nurain) + yes-sentence; persisted `selection_context member_offer`, 8-row lrs |
| 11 | zero-egress re-confirmation from evidence | PASS | all 10 Q/QP2 evidence JSONs verdict PASS + `S0_all_pass:true`; **74 egress records across the set — kinds = {`would_log`,`would_send`,`would_write`} ONLY** (guards: sendmsg-sub/save-message-redis/save-session-vars/send-message-files/human-intervention-sub); no non-would action, no respond.io 2xx, no assign/SLA/PUT; S4 tools ∈ {incoming_stock_list, inventory_stock_balance_list, orders_list} — all READ; S3: sendmsg fork `b48e0eaa` `Postgres Chat Memory1` credential = `Dnnofg8Xb27VQOhI n8n_test-db` (re-verified on the fetched fork JSON), fork `HTTP Request` never executed |
| 12 | scope/tier | PASS | plan scope `deterministic`; Q6/Q9-t3 parser-tier turns exercise UNCHANGED fork arms (Q6 = first execution proof of the rev-4 open-offer `company_pick` arm rev-3 makes load-bearing — planned as exactly that; R11 check-13 precedent) |
| 13 | live current state | PASS | spine `9qVy…` activeVersionId **`7aba1447`** (updatedAt 04:28:14Z); draft `cfd0e776` ≠ active but nodes/connections/settings/name each byte-identical to `PRE-9qVy…-7aba1447.json` (re-verified this pass); parser `89b63c51` draft==active == PRE; HI `9249e00e` draft==active |
| 14 | payload spine sweep vs PRE | PASS | 127 → **137** nodes; params changed on EXACTLY **4** (`escalation-context` `cca7a245`, `build-cs-member-offer` `63c1c46e`, `escalate-catalog` `5ec7d6a7`, `compile-current-state` **`c864f204`**); EXACTLY **10** new, 0 dropped, 0 non-param field diffs (id/type/typeVersion/credentials/onError/position); connection delta EXACTLY **12** keys = 9 new (`miss-roster-gate`…`tag-offer-hold` incl. `miss-members-gate`) + 3 changed (`central-exchange`, `escalation-context`, `If-ideate`); top keys `{name,nodes,connections,settings}`, settings `{executionOrder:v1}`, name == live |
| 15 | `cs-offer-gate` payload == live | PASS | whole node (params incl. conditions `ce99a16c`, id, type, position) byte-equal to PRE/live — correctly DROPPED from the payload delta (D3=b undone) |
| 16 | ccs payload body forensics | PASS | payload node == `PAYLOAD-node-compile-current-state.js` `c864f204`; live→payload diff = EXACTLY the merge-arm hunks (`75,78c75,80`,`80c82,92`,`82a95,96`,`86c100,108`) + ONE insertion `682a705,795`; payload 75–108 == clone 75–108 except the ONE sentence line keeping LIVE's "choose who to route to. Reply the number or name:"; payload 705–795 (miss/clarify block incl. the rev-3 PLAIN arm) **byte-identical to clone `7db593b0` lines 1082–1172**; clone lane markers `N-1a`/`N-2`/`spec-search`/`spec_search` = 0 in payload (clone 1/5/1/9); exactly one final `return output;` |
| 17 | `escalate-catalog` payload unchanged since R10 | PASS | `5ec7d6a7` (R10 4b anchored-insert verification stands) |
| 18 | parser payload unchanged | PASS | vs PRE: 7 nodes both sides, connections/settings byte-equal, leaf diffs = ONLY `output_exchange` (`3ee5b658`→`a68c5992`) + systemMessage (`583bcfb0`→`138008c2`); 0 memory nodes |
| 19 | hotfix leaves intact | PASS | `Call 'sub-get-results'`, `tier-probe`, `if-tier-ask` each byte-identical to PRE in the payload |
| 20 | no fork ids / test scaffolding in either payload | PASS | 0 occurrences of any fork/clone id, test cred, test list, `test_mode`, `test-guard`, `n8n_test`; the only flagged token is the intended new-node id `miss-members-gate-node` (×1) |
| 21 | `$('…')` refs resolve on the payload | PASS | every ref in the 14 touched/new bodies names a payload node. NOTE: the rev-3 bodies do NOT reference `miss-members-gate` — `build-miss-member-offer` reads `$('miss-roster-plan')` (upstream of BOTH mmg branches, always executed when bmmo runs) + `$('central-exchange')`; `miss-members-gate` itself uses only `$json` |
| 22 | `miss-members-gate` node id collision | PASS | id `miss-members-gate-node` absent from live's 127 node ids (as are all 10 new ids) |
| 23 | payload connection shapes | PASS | `miss-roster-plan`→`miss-members-gate`; mmg {T→`get-cs-members-miss`→bmmo, F→bmmo}; `central-exchange`→`miss-roster-gate`; `escalation-context`→`clarify-company-gate`; `If-ideate` [0]→live's `ideate-turn-http` (clone's test-only `ideate-egress-gate` NOT carried), [1]→`offer-hold-gate` |
| 24 | captain-correction fidelity | PASS | (i) picker ORDERS-ONLY: LANE `members` = true×2 (orders tools) / false×4 (incoming×3 + stock), LANE byte-identical in `miss-roster-gate` and `miss-roster-plan` (verified programmatically); (ii) plain copy exact incl. team names: `Would you like me to escalate to *Sorento* purchasing team?` (Q1 real exec) / `…*Sorento* warehouse team?` (Q3) / multi = no company (Q5/unit) — frozen prefix `/would you like me to escalate/i` kept in visible + persisted response (parser contract); (iii) qty-0 = answered proven on the captain's exact MUB6201 console shape (check 9); (iv) both-miss plain clarify copy company-only: `${lead} — reply with the company (${list})…`, member branch byte-kept — tester Q5-t2 reply exact, `a number, a name` absent |
| 25 | fail-closed on the new If | PASS | mmg leftValue `={{ $json.members === true }}` (strict ===, no sandbox token): missing/`'true'`-string/sentinel ⇒ FALSE ⇒ plain path ⇒ bmmo roster-parse [] ⇒ envelope passthrough (units + Q1/Q3 FALSE-branch real execs; TRUE branch real on Q7) |
| 26 | replay-norm | PASS — still none needed | golden envelopes predate `lookup_companies` stamping ⇒ `miss-roster-gate` FALSE corpus-wide ⇒ `miss-members-gate`/plain arm unreachable on the corpus; `cs-offer-gate` now == live ⇒ ZERO delta (the F-R11-3 note about its widening is moot); `miss_plain_offer`/`members` ride per-run containers. Fresh captures of rev-3 UAC turns diff BY DESIGN (Lessons 40/41) |

### Findings

- **F-R12-1 (none blocking).** Every task check passed; no new defect found in the rev-3 bodies, the clone state, the
  run evidence, or the re-staged payload.
- **F-R12-2 (accepted residuals, carried):** (a) **Q9 junk-on-a-plain-offer** closes the offer (clarification LLM reply
  overwrites the persisted phrase; a later "yes" correctly does NOT reach HI on the real parser — exec 12933310; the
  t3-mock HI hit is a mock artifact force-feeding the confirm flag, not a clone path). Identical to the pre-existing
  not-found plain-offer semantics; guarding it needs a parser change out of scope. Documented, accepted. (b) **F-R3-3
  fallback literal**: ccs plain arm `_mcTeamP` falls back to `'customer_service'` only when `plan[0].team` is empty AND
  `qf.routing.suggested_team` is absent — unreachable under the gate's domain+routing lockstep leg; cosmetic, fold into
  the next body change. (c) F-R3-2 stale headers FIXED in `miss-roster-plan`/`build-miss-member-offer` this rev.
- **F-R12-3 (evidence notes, accepted):** Q4a (two-company both-stocked control) and Q5-t1 (both-miss answered envelope)
  have NO live fixture (tester probed read-only; the multi-product attempt folds to single-miss) — those two legs are
  carried by offline units on byte-verified deployed bodies, per the UAC's own fixtures note. The single Q5-t2 prod-ingest
  `LLEN 0→1` transient is a real inbound customer message between snapshots (clone/fork redis writes enumerated: only
  `test:egress:*`, `chat:reply:*`, `sorento-respond-message-TEST`) — not egress.
- **F-R12-4 (helper debt, non-blocking):** `zz-canary-read LLIbMXAixexM9Cwc` is unpublished AND its Read-Egress key is
  hardcoded to a stale run id; the tester's direct `test:egress:{id}` read via the `zz-run-hint` webhook is the reliable
  path. Parameterize or retire the helper in a later round.

### Judged items (my view; captain owns the decision)

- **D2' (LANE scope):** promotions ×2 / master products / product attachments / certificates STAY OUT — consistent with
  the "definitive answer, nothing for the other team to look up" rule; each is a one-row LANE flip (+`members:false`)
  if the captain later reads "things like stock" more broadly. **Confirm D2'=none-flipped when authorizing.**
- **Q9 residual** (junk closes a plain offer): accept — byte-identical to how the pre-existing not-found plain offer has
  always behaved; a parser-side `offer_hold` outside the Δ3 arm is the only fix and belongs to a future fork round.
- **Warehouse rosters are 1-member each** (P2: Sorento = Ili Mahfuzah, Mocha = Tasa) — a live stock-lane "yes" has a
  valid `next-assignee` pool; nothing to fix, recorded for ops awareness.

### Verdict — **APPROVE** (round-3 rev-3 + final combined round-2+3 payload)

Rev-3 is verified byte-exact on the published clone `7db593b0` (7 bodies + 1 new node + exactly the mmg connection
split, nothing else vs `e54e114e`), the captain's console corrections are implemented with exact copy fidelity and
proven on his own MUB6201 shapes (plain offers with zero roster GETs on Q1–Q5 — hard-asserted; picker byte-identical
on orders), every new leg fails closed, zero egress is re-confirmed on all 23 executions (74/74 egress records
`would_*` only + independent exec/sub-exec re-reads), and the re-staged payload is exactly live `7aba1447` + the
reviewed business-logic delta: **4 changed + 10 new + 12 connection keys @ 137 nodes**, `cs-offer-gate` byte-equal to
live, ccs = live body + the two anchored hunks with zero clone lane leakage, parser payload unchanged since R10.
**APPROVE-TO-APPLY for the combined round-2+3(rev-3) payload.** Promotion remains captain-gated
(`needs-decision [key=promote-round2-3]`, with the D2' confirm line).

### PROMOTE CHECKLIST — delta over R7/R11 (only what changed; the STAGED run doc apply-order + R7/R10 rows stand)

1. **R11 delta item 3 is VOID:** `cs-offer-gate` is NO LONGER promoted — do not touch the node. Post-PUT gate: its
   conditions json must equal live `ce99a16c` (3 conditions). Any payload showing `391a31c8`/`cfa8c18e` is the
   SUPERSEDED rev-2 staging — STOP.
2. **Final promote shas (supersede R7 3e / R11 items 1–2):** new nodes carry `miss-roster-gate` **`92ca1ccc`**
   (NOT `d24dd81b`/`024d91e3`/`031dda83`), `miss-roster-plan` **`c4a19b6f`**, NEW `miss-members-gate` **`14576e69`**
   (id `miss-members-gate-node`), `build-miss-member-offer` **`fab11982`**, `clarify-company-reply` ==
   `offer-hold-reply` **`377c2df4`**; changed nodes `compile-current-state` **`c864f204`** (NOT `492a8591`),
   `build-cs-member-offer` `63c1c46e`, `escalate-catalog` `5ec7d6a7`, `escalation-context` `cca7a245`; parser
   `a68c5992`/`138008c2` unchanged.
3. **Sweep expectation (supersedes R11 item 4):** post-PUT param-hash vs `PRE-9qVy…-7aba1447.json` = exactly
   **4 changed + 10 new + 12 connection keys, 137 nodes, 0 dropped, 0 non-param field diffs**; wiring must show
   `miss-roster-plan`→`miss-members-gate` {T→`get-cs-members-miss`, F→`build-miss-member-offer`} and `If-ideate[0]`
   still → `ideate-turn-http`.
4. **Live-draft re-check (R11 item 5, re-verified this pass):** draft `cfd0e776` is STILL content-identical to PRE;
   re-confirm immediately before the PUT — drift ⇒ STOP and diff.
5. **Post-PUT smoke (LESSONS #45, supersedes R11 item 6):** run ONE answered-turn case through `miss-roster-gate` AND
   `miss-members-gate` first (partial-miss ORDER turn — exercises the TRUE/roster path); then the watch list:
   incoming plain-miss (`*<Co>* purchasing team` phrase, NO picker, ZERO `team-members` GET on the exec),
   stock plain-miss (MUB6201 shape: qty-0 row answered, `*Sorento* warehouse team` phrase),
   incoming NOT-FOUND (plain phrase again, NO picker — gate reverted), CS/order not-found (picker KEPT),
   both-miss "yes" → plain-copy clarify (no "a number, a name") → company reply → HI pair,
   "yes mocha"/"sorento" on an open plain offer (company_pick arm). `next-assignee` 404 "No team found" on
   warehouse/general_enquiries = revert trigger (P2 says both rosters exist today, 1 member each).
6. **D2' captain-confirm at the gate:** promotions ×2 / master products / product attachments / certificates stay OUT
   of the LANE unless explicitly ordered (each = one LANE row + `members:false` in BOTH mirrored copies).
7. Apply order (parser → spine), rollback method (PUT the PRE body back), settings-extras post-check
   (`availableInMCP`/`callerPolicy`/`binaryMode` survive), HI untouched: **unchanged from R7/R10.**

---

## R13. Round-4 review + final rounds-2+3+4 payload verification (2026-08-18)

Reviewer pass over plan §"Round 4" (W0–W6), the coder's `tests/diffs/miss-company-routing.md` §round-4 +
`diffs/miss-company-routing/spine-company-team-collapse.hunk.md`, the tester's round-4 rollup
(`runs/miss-company-routing-round4-rollup-20260818.md` + 17 evidence JSONs), and the **re-staged combined
rounds-2+3+4 live payload** (`LIVE-PROMOTE-STAGED-20260818/`, commit `7b9d51c`). Read-only: 9 workflow REST
GETs + 4 execution REST GETs (incl. 1 HI sub-exec) + repo reads; all 7 unit suites re-run locally. **Nothing
edited, nothing executed, nothing promoted.** Shas = sha256 first 8 hex of the exact raw param bytes
(`printf '%s'`), the §round-4 convention.

### Per-check table

| # | check | result | measured |
|---|---|---|---|
| 1 | live current state (re-fetched twice, start + end of pass — no drift) | PASS | spine `9qVy…` active **`7aba1447`** / draft `cfd0e776`, 127 nodes, updatedAt 04:28:14Z; parser `XTODTw` draft==active **`b9ac64a2`** (07:17:57Z); `rys` `cacd7c95`; `Fss` `f214cb7e`; sendmsg `aoydkG1…` `91171ac3`; HI `rrYXz…` `9249e00e` — all unmoved between the two fetches |
| 2 | live draft is content-empty vs active | PASS | draft `cfd0e776` **byte-identical to `PRE-9qVy…-7aba1447.json` on all four of `nodes`/`connections`/`settings`/`name`** (whole-object JSON compare, not spot shas) |
| 3 | clone + fork published, at the declared versions | PASS | `txiPzSxy3Pclsz6v` draft==active **`3e7fa66d`**, 171 nodes; `t4QvrtrPnTwRU6br` draft==active **`9ee992e9`**, 8 nodes; parser fork `wI5RkNGW3EOJfBdo` **`c7d9cfa2`** untouched (`output_exchange a68c5992` / systemMessage `138008c2`) |
| 4 | the 5 round-4 POST shas on the published targets == repo artifacts | PASS | fork `output-structurer` **`698f89f1`** (== `diffs/…/getresults-output-structurer.js`); clone `miss-roster-gate.leftValue` **`e4575d3e`**, `miss-roster-plan` **`95d6c814`**, `disallowed-entity-gate` **`069b3691`**, `promo-picker` **`05a96e3a`** |
| 5 | clone PRE→POST sweep is EXACTLY the claimed set | PASS | `061e46c9`→`3e7fa66d`: 171→171 nodes, 0 new / 0 dropped, param-changed = exactly `{miss-roster-gate, miss-roster-plan, disallowed-entity-gate, promo-picker}`, **connections byte-identical (155 keys, 0 delta)**. (The 29 "credentials" field diffs are an artifact of the PRE being an MCP capture, which strips `credentials`; the REST-side values are the expected prod-read/`n8n_test` creds.) Fork `87df404c`→`9ee992e9`: exactly `{output-structurer}` |
| 6 | LANE == the CRM `stamp_lookup_companies` set, byte-mirrored | PASS | 11 rows extracted programmatically from the deployed `miss-roster-gate` leftValue; **LANE literal byte-identical in `miss-roster-gate` and `miss-roster-plan`** (sha `8f03ce05`, 2714 B); rows exactly the plan's W2 table incl. the two-pair `crm_master_product_attachments_list` |
| 7 | captain lock — members ORDERS-ONLY | PASS | `members:true` on exactly `crm_order_management_orders_list` + `crm_order_management_orders_by_product_list`; `false` on the other **9** rows (incl. all 5 new) |
| 8 | captain fidelity — promotions team is `marketing_promotion` | PASS | LANE pair `['marketing_promotion','general_enquiries']`; `disallowed-entity-gate.company_team` → `'marketing_promotion'`; `promo-picker._escTeam` default → `'marketing_promotion'`; **live HI sub-exec `12946155` payload carries `team:"marketing_promotion"`** (no brand suffix). Residual `marketing_promotion_*` strings in the payload: 2, both inside COMMENTS of `disallowed-entity-gate`; the parser payload's 3 are a defensive downgrade regex `/^marketing_promotion_(sorento\|cabana\|mocha)$/` + comments. **Zero producers emit a suffixed team** |
| 9 | captain fidelity — uuid line clean | PASS | R1 exec `12945979` rendered text (evidence + independent REST re-read): `…*Sorento:* no promotions records for MUB6201.` — 0 uuid tokens. `_codes` predicate keeps a code only when `c && c !== u && !uuidShaped`; failure mode is `[]` ⇒ the already-shipped no-clause sentence, so the hunk can only ever **shorten** a rendered sentence |
| 10 | F-R4-3 collapse hunks == documented, nothing else | PASS | live PRE → payload diff: `disallowed-entity-gate` = 11 comment lines + ONE changed expression (13 diff lines); `promo-picker` = 3 comment lines + ONE changed literal (5 diff lines). No other region of either body touched |
| 11 | **coder's reversal claim: `disallowed-entity-gate`/`promo-picker` live == clone PRE** | **PASS — claim CONFIRMED** | live ACTIVE `7aba1447` vs clone PRE `061e46c9`: `disallowed-entity-gate` both `ca13af1c`, **byte-equal, 26753 B both**; `promo-picker` both `5d48c524`, **byte-equal, 35080 B both**. The earlier divergence assumption was wrong; the payload bodies (`069b3691`/`05a96e3a`) are simultaneously the tested clone bodies AND live+hunk. Payload == the deployed clone bodies byte-for-byte |
| 12 | **spine payload sweep vs `PRE-…-7aba1447`** | PASS — exactly as briefed | 127→**137** nodes; **6 param-changed** (`escalation-context` `cca7a245`, `build-cs-member-offer` `63c1c46e`, `escalate-catalog` `5ec7d6a7`, `compile-current-state` **`c864f204`**, `disallowed-entity-gate` **`069b3691`**, `promo-picker` **`05a96e3a`**); **10 new**, 0 dropped, **0 non-param field diffs**; connections 117→126 = **12 delta keys** (9 new + 3 changed: `central-exchange`, `escalation-context`, `If-ideate`); top keys `{name,nodes,connections,settings}`, name == live |
| 13 | 10 new nodes == the deployed clone, byte-for-byte | PASS | `miss-roster-gate` LV `e4575d3e` · `miss-roster-plan` `95d6c814` · `miss-members-gate` LV `14576e69` · `build-miss-member-offer` `fab11982` · `clarify-company-gate` LV `63e30a3d` · `clarify-company-reply` == `offer-hold-reply` `377c2df4` · `get-cs-members-miss` `5efc69f3` · `offer-hold-gate` LV `8f14a430` · `tag-offer-hold` `1bb4789d` — each equal to clone `3e7fa66d`; all 10 node ids collision-free vs live's 127 |
| 14 | **ccs `c864f204` forensics against the CURRENT clone** | PASS | payload node == `PAYLOAD-node-compile-current-state.js` `c864f204`; live→payload diff = **EXACTLY two hunks** (`@@ -72,18 +72,40 @@` merge-arm, `@@ -680,5 +702,96 @@` miss/clarify insert); payload lines 705–797 **byte-identical to clone `8deebd5e` lines 1142–1234** (the tier rebase did NOT move the miss block); lane-marker leakage `N-1a`/`N-2`/`spec-search`/`spec_search` = **0** in the payload (clone 1/5/1/9), `tier` count 12 == live 12 (clone 16 ⇒ the 4 tier-lane occurrences did NOT leak); exactly one final `return output;` |
| 15 | payload wiring shapes | PASS | `central-exchange`→`miss-roster-gate`; mrg {T→`miss-roster-plan`, F→`dym-transform-partial`}; `miss-roster-plan`→`miss-members-gate` {T→`get-cs-members-miss`→bmmo, F→bmmo}; `escalation-context`→`clarify-company-gate` {T→`clarify-company-reply`, F→HI}; **`If-ideate[0]`→`ideate-turn-http`** (clone's test-only `ideate-egress-gate` NOT carried), `[1]`→`offer-hold-gate`→{`offer-hold-reply`→`tag-offer-hold`→`escalate-catalog`, `If10`} |
| 16 | no test scaffolding / fork ids in either payload | PASS | 0 hits for any fork/clone id, `n8n_test`, `Dnnofg8Xb27VQOhI`, `test_mode`, `test-guard`, `main-message-list-test`, `zz-canary`, `sorento-respond-message-TEST`. Payload `executeWorkflow` targets **identical to live PRE** (`aoydkG1…`×9, `Fss`×5, `rys`×3, `rrYXz…`, `XTODTw`, `tWP33…`, `UrETd…`). The 3 flagged tokens are benign: `is_test` ×2 in comments of the two new Code nodes, `prototype` ×2 inside pre-existing live **Code** nodes (LESSONS #45 governs non-Code params — 0 there), `$('x')` ×2 pre-existing in `dym-transform*` |
| 17 | `escalate-catalog` `_ct` arm survives the collapse | PASS | payload `escalate-catalog` `5ec7d6a7` == `PAYLOAD-node-escalate-catalog.js`; `_ct` arm (live-only, lines 66–67) byte-identical to live PRE. After the collapse `_ct === 'marketing_promotion' === parser.routing.suggested_team`, so both sides of the `\|\|` agree — unit-asserted (round4 suite) |
| 18 | **parser payload rebase onto live `b9ac64a2`** | PASS | `PRE-XTODTw…-b9ac64a2.json` **== live now** (whole `nodes` compare). Payload-vs-live delta = **exactly 2 nodes**: `AI Agent.options.systemMessage` `a4aa5ec0`→**`f0a825a9`**, `output_exchange` `3ee5b658`→**`a68c5992`**. 7 nodes both sides, 0 new/dropped, connections + settings byte-equal, 0 non-param field diffs |
| 19 | **parser 3-way rebase identity** | PASS | fork `138008c2` → payload `f0a825a9` = **exactly ONE added line** (`- "videos","actual video"  → attachment_type "video"`). Independently: old-live `583bcfb0` → live-now `a4aa5ec0` = that **same single line**; old-live → fork = 27 changed lines in 2 hunks; live-now → payload = **the identical 27 lines in the same 2 hunks with identical context anchors** (diff-of-diffs empty after stripping `@@` offsets). ⇒ nothing of theirs lost, nothing of ours dropped, same semantic anchor. `output_exchange` payload **byte-identical to the fork** (`a68c5992`, 104606 B) |
| 20 | parser payload carries no fork-only drift | PASS | `suggest-follow-up` payload == live `338ea668`; the fork's older `5e659811` correctly NOT carried. `mock-reformulator-output` identical on all three (pre-existing live node) |
| 21 | **sub payloads == own live PRE + exactly the two `_codes` hunks** | PASS | `rys` PRE **`3b1995d4`** → PAYLOAD **`698f89f1`**; `Fss` PRE **`25a2eed9`** → PAYLOAD **`d6d3f1fd`**. Each diff = ONLY the 9-line comment block + the 4-line predicate swap, at each body's own anchor (rys @343, Fss @330). Both PRE files re-verified **== live now** (whole `nodes` compare) |
| 22 | `rys` payload == the tested fork POST | PASS | `698f89f1` == fork `t4QvrtrPnTwRU6br` @ `9ee992e9` `output-structurer` == `diffs/…/getresults-output-structurer.js`, byte-for-byte (24835 B) |
| 23 | **`Fss` keeps its OWN older timeline block** | PASS | `rys`↔`Fss` delta is **IDENTICAL pre and post** — same 2 hunk headers (`@@ -167,28 +167,16 @@`, `@@ -197,14 +185,13 @@`), same 41 changed lines. `Fss` is provably not a copy of `rys`; the unrelated "sort dates in place" rewrite was NOT smuggled in |
| 24 | `_codes` predicate semantically identical in all 3 copies | PASS | the block from `// ROUND 4 (A).` through `} catch (err) { _codes = []; }` is **byte-identical** in fork `t4Qv`, `rys` payload and `Fss` payload (1449 B, sha `69ea709f`) — string compare, not eyeball |
| 25 | no other node of `rys`/`Fss` is touched | PASS | both promote artifacts are single-node `.js` bodies applied via `setNodeParameter /jsCode`; `entity-ids-transformer` (`a791e867`/`6c46837e`) and `output_exchange` (`b0ceda30` both) stay as-is by construction |
| 26 | offline units re-run by the reviewer on the repo bodies | PASS | round4 **101/101** · round3 **85/85** · rev4.spine **33/33** · rev4.output_exchange **48/48** · delta1/delta2/delta3 GREEN |
| 27 | LESSONS #45 sandbox scan | PASS | 0 hits of `prototype\|constructor\|__proto__` in any **non-Code** node's parameters on the clone AND in the spine payload; the gate uses `Object.keys(LANE).includes(tool)`, not `hasOwnProperty` |
| 28 | fail-closed on every new leg | PASS | gate: outer `try → return false`; `if (!lane) return false`; strict `domain_hint === lane.domain`; `lane.pairs.some(...)` exact pair match; `_xdBlock.any` yield; `!lc.length`/`!ans.length` ⇒ false; `miss-members-gate` `={{ $json.members === true }}` (strict `===`); `miss-roster-plan` unreadable routing ⇒ `team:null, members:false` ⇒ plain path. Both new precedence legs are inside the same `try` ⇒ a throwing `promo-picker` ⇒ no offer |
| 29 | **one-offer-per-turn precedence completeness** | PASS with one gap → **F-R13-1** | Leg (a) generic frozen-phrase test covers `_promo_notfound` (line 553/558/559) and `_promo_unmatched` (571–573) **structurally**, because both write the phrase into `env.response`. Leg (b) suppresses all 5 named markers. I audited **every** `env.response` write in the deployed `promo-picker`: L84 `_brand_gate_closed`, L99 `_promo_picker_shape`, L307/L374/L403 `_promo_pick`, L415 notice-rewrap (preserves the miss line), L559 `_promo_notfound`, L573 `_promo_unmatched` — all covered. `_promo_broadened`/`_promo_disjoint` are only ever set **inside** the `_promo_unmatched`/`_promo_notfound` branches, so they can never appear alone. **The single uncovered rebuild is L465–469 with `rebuilt:true`** — see F-R13-1. Offline-only markers (`_promo_notfound`, `_brand_gate_closed`, `_promo_picker_shape`) are each individually unit-asserted on the deployed gate body, plus two negative controls (`_brand_gate_closed:false` and `_promo_unmatched:undefined` ⇒ leg inert) |
| 30 | byte-identical behaviour for untouched domains | PASS | round-2/3 LANE rows unchanged in the new `pairs` shape (same tools, teams, agents, members flags); tester R12 a–e replays orders/attachments/stock/crossdomain/tier byte-identical modulo the freshness stamp; `compile-current-state`, `escalate-catalog`, `build-miss-member-offer`, `cs-offer-gate`, `miss-members-gate`, `offer-hold-gate`, `clarify-company-gate` all re-asserted unchanged on the clone; `not-found-error-message` untouched (W4 total-not-found path already offers on every domain) |
| 31 | **zero-egress re-confirmation (independent of the tester)** | PASS | 17 round-4 evidence JSONs: **124 egress records, kind set == exactly {`would_send` 51, `would_write` 39, `would_log` 34}** — no other kind exists anywhere. Every `crm_*` token across the set is a `_list` READ; **`crm_it_support_ticket_create` absent** (S4). My own REST re-reads of execs `12945979`/`12946147`/`12948208`: **0 orphaned egress nodes executed**, `api.respond.io` appears **only in `workflowData` node definitions, 0 in `runData`**, sub-exec targets are forks only (`wI5RkNGW3EOJfBdo`, `vUfFUDjLAuMaeQE6`, `aQUmwMVplmNcyUVc`, `tWm5DYLxfypmVC1T`). HI sub-exec `12946155` executed exactly `['When Executed by Another Workflow','chat?','test-guard','test-guard-record']` — **0 `next-assignee`, 0 `team-members`, 0 SLA, 0 comment, `is_test:true`**. Clone guards re-verified on `3e7fa66d`: the 5 egress nodes all **0 inbound**, `executeWorkflow` targets all forks (`t4Qv`×8, `aQUm`×9, `wI5R`, `vUfF`, `tWm5`, `tWP33`), 14 nodes carry `is_test` |
| 32 | D2 helper restored (read-only claim) | PASS | `zz-roster-probe ZS0KErse7GDh9mJK`: `probe-params` **`ad5b8b07`** (== the tester's claim), workflow `active:false`, `activeVersionId:null` (unpublished), sole HTTP node is `team-members-GET`; **no `next-assignee` node exists in it** |
| 33 | scope/tier | PASS | plan scope `deterministic`; parser fork untouched; the 2 parser-tier turns (CAP-t2/t3) exercise UNCHANGED fork arms as regression proofs, matching the plan's own declaration |
| 34 | replay-norm impact | **CONFIRMED — no norm rule; ONE new true-positive diff source** | See §R13 replay note below |

### Replay-norm note (the one place round 4 differs from R4/R12's conclusion)

- **`output-structurer` (`_codes`) has ZERO replay impact.** `Call 'sub-get-results'` is fixture-replaced in
  replay (`regression/orchestrator-notes.md` L214: it "ran in capture but **NOT** replay"), so the sub's
  internals never execute against the golden base. No norm rule, no base invalidation.
- **`miss-roster-gate`/`-plan`/`miss-members-gate` stay inert corpus-wide** — golden envelopes predate
  `lookup_companies` stamping, so the gate's shape legs are FALSE on every corpus turn regardless of the
  widened LANE. Unchanged from R4/R12.
- **NEW: `disallowed-entity-gate` DOES run in replay**, and `company_team` now emits `marketing_promotion`
  instead of `marketing_promotion_<brand>` on every single-brand promotion turn in the corpus. **That is a
  deliberate behaviour change and its replay diff is a TRUE POSITIVE — do NOT add a `norm()` rule for it**
  (LESSONS #21: normalization over-stripping is the silent killer). Expect `disallowed-entity-gate.company_team`
  and any downstream `escalate-catalog` `_ct` text to diff on those turns; re-baseline rather than normalize.
  `promo-picker._escTeam`'s default is reachable only when `company_team` is null AND the parser emitted no
  team, so it will rarely surface.

### §0 safety verdict

S1 zero real sends · S2 zero assignment/SLA/PIC writes · S3 zero CRM/contact writes · S4 read-tool allowlist
only · S5 prod redis list never grew · S6 `n8n_test` isolation — **all PASS**, re-confirmed independently
(check 31) rather than taken from the tester's rollup. **The change cannot cause real egress:** every egress
node on the clone is 0-inbound, every shared-sub call goes to a guarded fork, and the promoted delta adds no
new HTTP/egress node — the only new outbound node in the payload, `get-cs-members-miss`, is a CRM
`team-members` **GET** (read) that round 4 makes *less* reachable, not more (9 of 11 LANE rows are
`members:false` ⇒ no roster call at all).

### Findings

- **F-R13-1 (NEW, non-blocking, follow-up round).** `promo-picker`'s reorder arm (deployed body L463–469) sets
  the marker `_promo_picker` — which is **not** in `miss-roster-gate`'s suppression set — and when
  `rebuilt === true` it REBUILDS `env.response` from `[_listIntro, renderBlocks(answers), _tail]`, where
  `_tail` carries only the `_Data last updated:…_` line. The mc-label miss line lives in the **response string**
  (`output-structurer` L373 appends `*Co:* no <noun> records…` into `msg` → `response`; `response_intro` never
  carries it), so a reordered promotions turn **drops the miss line while the gate still fires TRUE** and
  appends the offer ⇒ *"I found 2 promotions … Would you like me to escalate to \*Sorento\* marketing_promotion
  team?"* with no stated reason. Reachable when ≥2 promotions + CRM order ≠ end-date-desc order + a per-company
  miss. **Not a safety or routing defect** (the company/team named are correct and the "yes" flow works) — it is
  the exact copy-coherence failure W3 anticipated for `_promo_pick`, one arm short. R1 exec `12945979` shows
  `rebuilt:false`, so it did not surface live this pass. **Preferred fix (next round, one line):** carry the
  miss line across the rebuild the way `_tail` is carried (keeps offer *and* reason). **Cheaper fix:** add
  `(p._promo_picker && p._promo_picker.rebuilt === true)` to leg (b) — suppresses the offer instead.
- **F-R13-2 (BLOCKED-BY-CONFIG — captain action, NOT code, pre-existing but WIDENED by round 4).** P3 measured
  `next-assignee`/`team-members` 404 for company **Mocha `38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2` × team
  `purchasing_certification`** (11/12 pairs OK). I traced the live HI sub `rrYXzE61gCNUck_zmXe-G` @ `9249e00e`:
  `…respond-routed-to-pic2` → **`get-round-robin-assignee`** (`…/external/next-assignee`) →
  `if-conversation-unassigned`. That HTTP node has **no `onError`/`continueOnFail`/error output** — a 404 throws
  and fails the sub-execution **after** the customer has already been told they were routed ⇒ *"you've been
  routed"* + no assignment = silent drop. Round 4 does not create the gap (a Mocha certificates **total**
  not-found already offers and already routes there), but it adds the per-company-miss path as a second route.
  **Configure Mocha's `purchasing_certification` team set before promoting, or accept the drop knowingly.**
- **F-R13-3 (D8 — repo artifact drift; non-blocking, fix-forward).** `diffs/miss-company-routing/spine-compile-current-state.js`
  is `6bff997d` while the clone runs `8deebd5e` and the payload ships `c864f204`; two suites
  (`rev4.spine`, `round3.gates`) execute the stale body. **Materiality bounded by measurement:** the miss/clarify
  block is **byte-identical across all three** (8436 B), and the repo↔clone delta is 64 lines in 4 hunks whose
  tokens are exclusively `tier`(15) / `picker`(12) / `last_result_set`(8) / `_promo`(8) / `access_level`(1) —
  i.e. the tier/promo precedence arms, none of which the promoted delta touches and none of which those suites
  assert. Refresh the artifact next round so units run the deployed bytes.
- **F-R13-4 (deviations D3/D5/D6 — offline-only coverage, accepted with a watch-list entry).** Three LANE rows
  have no live fixture and are structurally hard to induce: `crm_master_products_list` (R6 — every company
  answered on 5 probes), `crm_marketing_promotion_products_list` (R9 — not reachable through the RAG registry),
  and the two-company DO-number `_codes` case (R13). Each is covered by units on the **byte-verified deployed
  bodies**, which is the same standard R12 accepted for Q4a/Q5-t1. Carried to the post-PUT watch list.
- **F-R13-5 (deviation D4 — copy nuance, captain-confirm).** Certificate asks resolve to
  `crm_master_product_attachments_list`, never `crm_certificates_list` (`sub-get-rag` returned exactly one tool
  candidate on all 32 execs — the tool cannot be steered from message text). The **two-pair design worked as
  intended**: the gate fired TRUE on the attachments row's second pair and the offer correctly named
  `purchasing_certification`. Consequence: the miss noun reads *"product attachments"*, not *"certificates"*.
  The `crm_certificates_list` row is harmless dead weight today (and correct if the RAG registry ever exposes it).
- **F-R13-6 (deviation D7 — pre-existing, non-blocking).** On a MULTI-VARIANT product, a certificates total
  not-found (exec `12947013`) sets `is_escalate_offer:true` but renders the DYM variant chooser
  (`manualResponse:false`), so the visible reply carries no offer. Re-run with a single unresolvable code
  (`12947150`) gives the expected offer. Predates round 4; the DYM chooser is a question, not a dead end.
- **F-R13-7 (residuals carried forward, unchanged):** F-R12-2(a) junk-on-a-plain-offer closes the offer;
  F-R3-3 `_mcTeamP` `'customer_service'` fallback literal is unreachable under the gate's lockstep; F-R12-4
  `zz-canary-read` is unpublished with a hardcoded stale run id.
- **D1 (live parser drift) — CLOSED.** Verified as a clean 3-way rebase, check 19. Not caused by this round.
- **D2 (helper edit/restore) — CLOSED.** Verified, check 32.

### Promote-blocking assessment

| item | promote-blocking? |
|---|---|
| F-R13-1 `_promo_picker` rebuilt drops the miss line | **NO** — copy coherence on a narrow promotions sub-case; correct company/team; no safety, no mis-routing |
| F-R13-2 Mocha × `purchasing_certification` 404 | **NO for the code — YES as a captain pre-condition.** Fix the CRM team set or accept a silent-drop escalation on that one pair |
| F-R13-3 / D8 stale ccs artifact | **NO** — measured non-material; repo hygiene |
| D3 / D5 / D6 offline-only rows | **NO** — deployed-body units + R12 precedent |
| D4 certificates→attachments tool | **NO** — design worked; copy nuance only |
| D7 multi-variant DYM chooser | **NO** — pre-existing |
| settings extras (`availableInMCP`/`callerPolicy`/`binaryMode`) absent from the payload's `settings` | **NO** — the public API rejects those keys (400 "must NOT have additional properties") and they survive server-side; keep the post-PUT check |

### Judged items (my view; captain owns the decision)

- **D2' is now REVERSED by captain order** — promotions ×2 / master products / product attachments /
  certificates are IN the LANE, all `members:false`. LANE == the 11-function `stamp_lookup_companies` set
  exactly, so the allowlist is closed by construction; a new CRM stamping function is the only thing that can
  make it incomplete. **Confirm at the gate that the 11-row LANE is what you ordered.**
- **W4 captain-confirm C1 stands: LEAVE all four `is_clarification` arms** (`missingAttachmentType`,
  `needsScope`, `vagueUnresolved`, `require_specific`) suppressing the offer — each asks a question rather than
  dead-ending. Flipping any would ask and offer in the same breath.
- **F-R4-3 scope:** the `promo-picker._escTeam` default collapse is the one item beyond the literal instruction.
  I judge it correct (same defect, same migration, same pool) and it is called out in the hunk doc so it can be
  reverted cleanly if unwanted.

### Verdict — **APPROVE** (round 4 + the final combined rounds-2+3+4 payload)

Round 4 is verified byte-exact on the published clone `3e7fa66d` and fork `9ee992e9` (5 bodies, exactly 4+1
changed nodes, connections untouched on both), the captain's three orders are implemented with measured
fidelity (all 11 stamping domains offer; members true on the two orders tools only; promotions team is the
collapsed `marketing_promotion` end-to-end into the HI payload; the uuid line is clean on his own MUB6201
turn), every new leg fails closed, one-offer-per-turn is complete except the documented F-R13-1 arm, untouched
domains are byte-identical, and zero egress is re-confirmed independently on 124 egress records + 4 direct
execution re-reads.

The re-staged payload is exactly live + the reviewed business-logic delta, and the three things I was asked to
audit rather than assume all hold: the coder's reversal claim is **true** (`disallowed-entity-gate`/`promo-picker`
live bodies are byte-identical to the clone PRE, so `069b3691`/`05a96e3a` are legitimately both the tested and
the live-anchored bodies); ccs `c864f204` is still live-body + exactly the two anchored hunks with the clone's
**current** miss block and **zero** tier/promo/spec leakage; and the parser rebase onto `b9ac64a2` is a clean
3-way — their one `video` line kept, our 27 lines re-applied at the identical anchors, `output_exchange`
byte-identical to the fork. Both sub payloads are their **own** live PRE plus the identical `_codes` hunk, and
`Fss` provably keeps its older timeline block.

**APPROVE-TO-APPLY.** Promotion remains captain-gated. **One captain pre-condition (F-R13-2) and one
confirm line (LANE = 11 rows) before the PUT.**

### FINAL PROMOTE CHECKLIST (supersedes R7/R10/R11/R12 where they conflict; captain-gated — the reviewer authorizes, does NOT execute)

**Order: subs → parser → spine** (LESSONS #37: a parent resolves only a sub's *published* version).
Method: MCP `setNodeParameter /jsCode` (or `/options/systemMessage`) from a file, **never re-typed**
(LESSONS #25); the spine may go by REST PUT with `{name,nodes,connections,settings}` and `settings` stripped
to `{executionOrder:"v1"}`. **PUT auto-activates on this instance** — verify `activeVersionId`, do not assume a
draft. Back up each PRE body before its write.

**Pre-flight (all must hold at the moment of the PUT — any mismatch ⇒ STOP and re-diff):**

1. `9qVyfUxmRQqrpGRMDLRuz` active **`7aba1447`**, draft `cfd0e776` still content-identical to
   `PRE-9qVy…-7aba1447.json`; `XTODTw-dJcV0uRdC056hG` **`b9ac64a2`**; `rysSPgUssLDf6xJc` **`cacd7c95`**;
   `Fss5aAaXthJSWpZCgKiKR` **`f214cb7e`**; `rrYXzE61gCNUck_zmXe-G` `9249e00e` and `aoydkG1dbItXR5jXFEQsP`
   `91171ac3` **untouched** (neither is promoted this round).
2. **F-R13-2 captain decision recorded:** Mocha × `purchasing_certification` team configured in the CRM, **or**
   an explicit accept-the-risk. `get-round-robin-assignee` has no error branch — a 404 fails the escalation
   after the "routed to PIC" message has already gone out.
3. **LANE confirm:** the promoted `miss-roster-gate`/`miss-roster-plan` carry **11 rows**, `members:true` on the
   two orders tools ONLY. Any other flag distribution ⇒ STOP.

**Step 1 — subs (`setNodeParameter /jsCode` on `output-structurer` only; no other node of either sub):**

| target | id | sha-gate BEFORE | body to write | expected AFTER |
|---|---|---|---|---|
| get-results (LIVE answer path: `Call 'sub-get-results'`, `probe-incoming`, `tier-probe`) | `rysSPgUssLDf6xJc` | **`3b1995d4`** | `subs/PAYLOAD-rysSPgUssLDf6xJc-output-structurer.js` | **`698f89f1`** (== the tested fork body) |
| get-results (LIVE probe path: `sibling-probe`, `crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe`) | `Fss5aAaXthJSWpZCgKiKR` | **`25a2eed9`** | `subs/PAYLOAD-Fss5aAaXthJSWpZCgKiKR-output-structurer.js` | **`d6d3f1fd`** |

⚠️ **Never copy the `rys` body into `Fss`** — `Fss` carries the older timeline block; the two legitimately
differ by 41 lines in 2 hunks, pre and post. Post-write, re-assert that delta is still exactly 41 lines.
**Publish each sub** and verify `versionId == activeVersionId` before touching the spine.

**Step 2 — parser `XTODTw-dJcV0uRdC056hG`** (sha-gate `a4aa5ec0` / `3ee5b658`):
- `AI Agent` `/options/systemMessage` := `PAYLOAD-node-parser-systemMessage.txt` ⇒ **`f0a825a9`**
- `output_exchange` `/jsCode` := the fork body ⇒ **`a68c5992`**
- Do NOT touch `suggest-follow-up` (stays live `338ea668`) or `mock-reformulator-output`. Publish; verify
  `activeVersionId`.

**Step 3 — spine `9qVyfUxmRQqrpGRMDLRuz`** from `PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json`.
Per-node sha gates (BEFORE → AFTER):

| node | before | after |
|---|---|---|
| `escalation-context` | `8c12563c` | **`cca7a245`** |
| `build-cs-member-offer` | `37a1b023` | **`63c1c46e`** |
| `escalate-catalog` | `8b4ae985` | **`5ec7d6a7`** |
| `compile-current-state` | `0b0912f1` | **`c864f204`** |
| `disallowed-entity-gate` | **`ca13af1c`** | **`069b3691`** |
| `promo-picker` | **`5d48c524`** | **`05a96e3a`** |
| NEW `miss-roster-gate` (leftValue) | – | **`e4575d3e`** |
| NEW `miss-roster-plan` | – | **`95d6c814`** |
| NEW `miss-members-gate` (leftValue) | – | `14576e69` |
| NEW `build-miss-member-offer` | – | `fab11982` |
| NEW `clarify-company-gate` (leftValue) | – | `63e30a3d` |
| NEW `clarify-company-reply` / `offer-hold-reply` | – | `377c2df4` (both) |
| NEW `offer-hold-gate` (leftValue) | – | `8f14a430` |
| NEW `get-cs-members-miss` / `tag-offer-hold` | – | `5efc69f3` / `1bb4789d` |

**`cs-offer-gate` is NOT promoted** (R12 item 1 stands) — its conditions must still read live `ce99a16c`.
Any payload showing `391a31c8`/`cfa8c18e` is the superseded rev-2 staging ⇒ STOP.

**Post-PUT sweep (must match exactly):** vs `PRE-9qVy…-7aba1447.json` — **6 changed + 10 new + 12 connection
keys @ 137 nodes**, 0 dropped, 0 non-param field diffs. Wiring: `central-exchange`→`miss-roster-gate`;
`miss-roster-plan`→`miss-members-gate` {T→`get-cs-members-miss`, F→`build-miss-member-offer`};
`escalation-context`→`clarify-company-gate`; **`If-ideate[0]` still → `ideate-turn-http`**. Settings extras
(`availableInMCP`, `callerPolicy`, `binaryMode`) survive server-side — re-read and confirm.
`executeWorkflow` targets unchanged (`aoydkG1…`×9, `Fss`×5, `rys`×3, `rrYXz…`, `XTODTw`, `tWP33…`, `UrETd…`).

**Post-PUT smoke set (in this order; live traffic, so keep it small and watch each):**

1. **Promotions per-company miss** — the captain's `promotion for MUB6201`: line reads
   `*Sorento:* no promotions records for MUB6201.` (**0 uuids**), offer reads
   `Would you like me to escalate to *Sorento* marketing_promotion team?`, **exactly one offer**,
   **zero `team-members` GET** on the execution.
2. **"yes"** on that offer → HI with `team: marketing_promotion`, `company_id` Sorento, a resolved assignee
   (P3: Kia Yee / Am / Aqi).
3. **Orders partial-miss** (the only `members:true` lane) — picker still rendered, `get-cs-members-miss`
   executes, text byte-identical to pre-promote modulo the freshness stamp.
4. **Attachments / certificates miss** — offer names `marketing_product` (photo ask) or
   `purchasing_certification` (cert ask); confirm the offer is the **last line of the TEXT message and precedes
   the file sends**.
5. **`_promo_unmatched` two-product promotions turn** — exactly ONE offer (leg (a) proof on live).
6. **Tier-ask turn** — no offer of any kind (`miss-roster-gate` not in the run).
7. **Incoming / stock plain-miss + a CS not-found** — round-2/3 regression, unchanged copy.

**Watch list (first 48 h):**
- `next-assignee` **404 "No team found"** on any of `marketing_promotion` / `purchasing_product` /
  `marketing_product` / `purchasing_certification` / `warehouse` / `general_enquiries` ⇒ **revert trigger**.
  Mocha × `purchasing_certification` is the known gap (F-R13-2).
- **Two offers on one turn** on any promotions turn ⇒ leg (a)/(b) escape ⇒ revert.
- A promotions reply carrying an offer with **no miss line** ⇒ F-R13-1 surfacing (not a revert; log it and
  ship the follow-up hunk).
- The three offline-only LANE rows (`crm_master_products_list`, `crm_marketing_promotion_products_list`,
  the two-company DO-number `_codes` case) — first live occurrences deserve a manual read.
- Any `no <noun> records.` sentence that reads oddly with the ` for …` clause dropped (the `_codes = []` path).

**Rollback:** PUT/`setNodeParameter` the PRE body back per node, sub-first order reversed (spine → parser →
subs), from `LIVE-PROMOTE-STAGED-20260818/PRE-*` and `ROUND4/PRE-*`. Live must **never** be edited mid-cycle.

**Captain items outside code:**
1. **Configure Mocha `38db4f20-ab6b-4bd0-a6fc-3a6728f0dee2` × `purchasing_certification`** (or accept a silent
   escalation drop on that pair) — F-R13-2.
2. **Confirm the 11-row LANE** and the orders-only `members` lock.
3. **Confirm C1**: the four `is_clarification` arms keep suppressing the offer.
4. **Confirm F-R4-3 scope** includes the `promo-picker._escTeam` default collapse.
5. Decide F-R13-1's fix shape for the next round (carry the miss line across the rebuild ← preferred, vs
   suppress the offer).

---

## R14. Pre-promote hardening audit (type-safety / outage class)

**Trigger.** Captain-cited real outage: a `contact_id` passed as a NUMBER made `.trim()` inside the
get-results sub's `entity-ids-transformer` throw — that node is on the main answer path, so every turn
died for ~5 min. This section audits **exactly the bodies staged for the live write**
(`tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/`) for that failure class and for
anything else that can take the spine down. Read-only: no workflow was touched.

**Audited artefacts (sha256/8 of the exact bytes to be written):**

| target | body | sha |
|---|---|---|
| get-results LIVE answer path `rysSPgUssLDf6xJc` | `output-structurer` | `698f89f1` |
| get-results LIVE probe path `Fss5aAaXthJSWpZCgKiKR` | `output-structurer` | `d6d3f1fd` |
| parser `XTODTw-dJcV0uRdC056hG` | `AI Agent.options.systemMessage` | `f0a825a9` |
| parser `XTODTw-dJcV0uRdC056hG` | `output_exchange.jsCode` | `a68c5992` |
| spine `9qVyfUxmRQqrpGRMDLRuz` | 6 changed + 10 new (see R13 promote map) | as R13 |

Payload re-swept independently for this audit: **137 nodes, 6 param-changed, 10 new, 0 dropped,
0 non-`parameters` field diffs, 12 connection delta keys** — matches R13 item 12 exactly. Every
`$('…')` node reference in all 16 spine nodes and in both parser nodes **resolves to a node that
exists in the same payload** (a typo'd reference is itself an outage vector; there are none).

### R14.1 Findings (ranked by BLAST RADIUS, not by likelihood)

| id | file · line | expression | trigger input | blast radius | guarded? / patch |
|---|---|---|---|---|---|
| **F14-A** | `miss-roster-gate` `leftValue` (`e4575d3e`) — **new node on the unconditional main answer path** (`central-exchange` → `miss-roster-gate` → {T `miss-roster-plan`, F `dym-transform-partial`}) | whole gate IIFE | any expression-sandbox reject (LESSONS #45: an expression throw **ERRORS the If node**, it does **not** return false, and the inner `try/catch` cannot catch a parse-time reject) | **MAXIMUM — every answered turn dies** (identical to the cited outage) | **GUARDED.** 0 occurrences of `.prototype` / `.constructor` / `__proto__`; membership deliberately via `Object.keys(LANE).includes(tool)`; all 4 node refs (`tool-filter`, `Call 'sub-query-reformulator'`, `crossdomain-render`, `promo-picker`) exist, the latter two behind `.isExecuted`; every return path is a boolean literal or `.some()` ⇒ `typeValidation:strict` safe. Real-sandbox evidence: `runs/miss-company-routing-round3rev3-SMOKE-20260818.json` + R1/R5/R8/R10/Q1–Q8. No patch. |
| **F14-B** | `offer-hold-gate` `leftValue` (`8f14a430`) — **new node on the main path** (`If-ideate`[false] → `offer-hold-gate` → {T `offer-hold-reply`, F `If10`}) | whole gate IIFE | same class as F14-A | **HIGH — every turn reaching `If-ideate` false dies** | **GUARDED.** Same three-token grep clean; refs `Call 'sub-query-reformulator'` + `get-session-vars` exist; `typeof e.member_reprompt !== 'string'` before any string use; session read `(s && s.session_vars && s.session_vars.variables) \|\| (s && s.variables) \|\| {}` survives a first-ever contact; boolean-only returns. Real exec 12913601 (M8d). No patch. |
| **F14-C** | `subs/PAYLOAD-*-output-structurer.js` `_codes` block (rys @355–364, Fss @342–351) | `.map(x => ({ c: String((x && x.code) ?? '').trim(), u: String((x && x.uuid) ?? '').trim() }))` | `entities` as **array**, as **JSON string**, as garbage, elements as strings/numbers/null; `code` as number/array/object | **MAXIMUM — this sub is on every answered turn** (same blast radius as the outage node) | **GUARDED, and guarded correctly for both `entities` shapes.** `typeof _ents0 === 'string' ? safe(_ents0) : _ents0` (`safe` = try/JSON.parse/`null`) `\|\| []` → `Array.isArray(_ents) ? _ents : []`; every method call sits on a `String(… ?? '')` result; `_isUuid` receives only that string; the whole block is inside `try { } catch (err) { _codes = []; }` (Code-node sandbox — a real catch, unlike an expression). `_isUuid` is declared once per file (no `const` redeclaration ⇒ no SyntaxError), block-scoped inside `if (_lookupCos.length > 1)`. Regex is anchored + fixed-length (no ReDoS). No patch. |
| **F14-D** | parser `AI Agent.options.systemMessage` line 436 — the inline `={{ }}` "Companies OFFERED" IIFE | `st.routing_roster_plan` / `st.routing_companies` / `c.company_name` | `previous_conversation_state` **absent / null / a JSON string / a number / an array**; pool rows non-objects; `company_name` non-string | **MAXIMUM — the parser runs on every turn; a systemMessage expression throw errors the AI Agent node** (`retryOnFail:true`, `onError` unset) ⇒ the parser sub fails ⇒ the spine's `Call 'sub-query-reformulator'` error branch | **GUARDED — no throwable operation exists in it.** `… \|\| {}` absorbs null; a string/number `st` yields `undefined` members ⇒ `Array.isArray` false ⇒ `src = []` ⇒ `''` ⇒ `'(none)'`. The only string method (`n.toLowerCase()`) is reached **only** through `(c && typeof c.company_name === 'string') ? c.company_name : ''` + `.filter(n => …)`. 0 forbidden sandbox tokens. Trigger node ref exists. No patch. |
| **F14-E** | `escalation-context` L43 `for (const a of (_CO_ALIASES[nk] \|\| [])) ks.add(a);` | prototype-key lookup on an object literal | persisted `company_name` whose lowercase is `constructor` or `__proto__` → `_CO_ALIASES[nk]` returns the Object constructor / `Object.prototype` (truthy, **not iterable**) → `TypeError` | MEDIUM — Code node, `onError` unset ⇒ **the escalation turn dies** | **UNGUARDED (theoretical).** Not customer-controllable — `company_name` originates from CRM `resolve-entity` → `disallowed-entity-gate.routing_companies` → session vars. **Patch P1 below** (1 line, behaviour-identical). |
| **F14-F** | parser `output_exchange` L1286 `for (const a of (_CO_ALIASES[nk] \|\| [])) ent.keys.add(a);` | same | same | MEDIUM — parser Code node, `onError` unset ⇒ the parser sub fails on a member-offer reply turn | **UNGUARDED (theoretical).** **Patch P2 below** (1 line, behaviour-identical). |
| **F14-G** | `build-miss-member-offer` L72 `label: m.name` → persisted into `last_result_set` → read by the **untouched** parser arm `output_exchange` L846–855 `row.label.indexOf(': ')` / `.slice()` / `.trim()` (guarded only by `!row.label`) | a roster member whose `name` is a **non-string truthy** (number/object) from CRM `team-members` | HIGH — parser Code node throws on the NEXT turn of that conversation | **INHERITED, NOT INTRODUCED.** Live `build-cs-member-offer` L100 already writes `label: m.name` into `cs_last_result_set` on every ordinary CS offer, so the exposure predates this round; our change only adds more occasions. `null`/`undefined` names fall through the existing `!row.label` guard safely. **Do NOT patch in this promotion** (a one-sided coercion in the miss lane leaves the live exposure standing and adds an untested delta); schedule a standalone hardening round that fixes the READER at `output_exchange` L846. |
| **F14-H** | `disallowed-entity-gate` `out.company_team` and `promo-picker` `_escTeam` default (F-R4-3 collapse) | `'marketing_promotion_' + brand` → `'marketing_promotion'` | — | LOW | **SAFE — type unchanged** (`string \| null` before and after). Sole untouched consumer `build-suggest-offer` L29 `(gate && gate.company_team) \|\| q?.routing?.suggested_team \|\| 'customer_service'` calls no method on it. No patch. |

### R14.2 The specific outage vector — `contact_id` and every other id

- **`contact_id` appears in ZERO of the promoted Code bodies.** Its only occurrence in the whole
  payload delta is the URL expression of the new `get-cs-members-miss`, and that URL is
  **byte-identical to live `get-cs-members`** (verified string-equal), including `authentication`,
  `genericAuthType`, `sendHeaders`, `options.response.fullResponse`, the credential
  (`mNsZWyU82NYV58k2`) and `onError: continueRegularOutput`. It is **template-interpolated**
  (`contact_id={{ …json.id }}`) with no string method applied, so a numeric id renders `123` and a
  missing id renders `undefined` — exactly today's live behaviour, no better and no worse.
- Other ids we handle (`company_id`, `user_id`, `respond_user_id`, `uuid`, `brand_code`): every
  place our code applies a method it first coerces or type-checks —
  `String(c.company_id).toLowerCase()` behind `if (c.company_id)`,
  `String(c.company_name).toLowerCase().trim()` behind a truthiness ternary,
  `typeof ck === 'string' && ck.trim()` for `company_code`/`code`,
  `encodeURIComponent($json.brand_code)` behind `$json.brand_code ?`. Ids that are only compared
  (`===`), stored, or template-interpolated are type-agnostic.
  **Our changes neither introduce nor depend on the string assumption that caused the outage.**

### R14.3 `onError` posture

- Census of the payload: **all 41 spine Code nodes have `onError` unset** — a throw in any of them
  hard-fails the execution. That is the house posture; our 8 new/changed Code nodes match their
  neighbours exactly and none is weaker than what sits beside it.
- `get-cs-members-miss` (`continueRegularOutput`) == live `get-cs-members` (`continueRegularOutput`).
  A 404 / empty body / HTML error page becomes an `{error:…}` or non-array `body` item, and
  `build-miss-member-offer.rosterAt()` maps both to `[]` → `if (!members.length) return pass;` →
  envelope passthrough, turn byte-identical. Same three-line parse as live `build-cs-member-offer`.
- **`build-miss-member-offer` is the best-defended new node**: its entire body is inside
  `try { … } catch (e) { return pass; }` with `pass` computed first — any surprise leaves the turn
  untouched rather than killing it.
- **No new node on the main answer path is error-tolerant** — F14-A and F14-B are If nodes and
  cannot be. Their safety is structural (fail-closed IIFE) plus the LESSONS #45 grep plus real
  clone executions, not `onError`.

### R14.4 Empty / degenerate inputs

| input | handling | verdict |
|---|---|---|
| zero entities / `entities` as JSON string / unparseable | `_codes` both-path guard (F14-C) | `_codes = []` ⇒ the ` for …` clause drops, sentence stays truthful |
| zero answers | `miss-roster-gate` `if (!ans.length) return false` | no offer |
| `lookup_companies` present but **empty** | `if (!lc.length) return false` | no offer |
| `fields` missing on an answer | `Array.isArray(a.fields)` → `f === null` → `if (!f) return false` | conservative no-offer |
| `company_name` null / falsy `value` | field predicate requires `x.value` truthy before `String(f.value)` | no crash, no offer |
| roster 404 / empty body / HTML error page | `continueRegularOutput` + `r.error` / `Array.isArray(r.body)` | `[]` → envelope passthrough |
| gate/plan divergence (plan would be empty) | `_miss_plan_empty` sentinel item, `members:false` | no roster fetch, passthrough |
| session vars absent (first-ever contact) | `(s && s.session_vars && s.session_vars.variables) \|\| (s && s.variables) \|\| {}` in `offer-hold-gate`, `clarify/offer-hold-reply`, `compile-current-state` | `{}` ⇒ all arms fail closed |
| `output.variables` at the ccs insert point | assigned unconditionally at ccs L619, insert is at L705 | no undefined deref |
| `_sug` in the ccs merge arm | arm entry is `else if (_merge)`, `_merge = !!(_sug && _mem)` | `_sug` non-null |

### R14.5 Values we write that untouched live nodes read

Swept the whole payload for consumers of `miss_roster_plan`, `routing_roster_plan`, `routing_company`,
`routing_brand`, `team`, `members`, `miss_member_rows`, `clarify_text`, `miss_plain_offer`,
`company_team` outside the 16 audited nodes. **Exactly two untouched consumers exist:**

- `cs-roster-plan` — reads `routing_companies` / `routing_brand` behind `Array.isArray(...) && .length`
  with a null-filled fallback row. No method call on our values. **Safe.**
- `build-suggest-offer` — `company_team` via `||` chain, no method call. **Safe.** (F14-H)

`clarify_text`, `miss_roster_plan`, `miss_member_rows`, `miss_plain_offer` have **no consumer outside
the changed set** — they are read only by `compile-current-state`, and there behind
`typeof … === 'string'` / `Array.isArray(…)`. The one cross-boundary write is `last_result_set`
(`_mcBase.concat(_mcRows)`), whose rows are shape-identical to live `build-cs-member-offer` rows —
covered by F14-G.

### R14.6 Per-body verdict

| body | verdict |
|---|---|
| `subs/PAYLOAD-rysSPgUssLDf6xJc-output-structurer.js` (`698f89f1`) | **SAFE TO PROMOTE AS IS** |
| `subs/PAYLOAD-Fss5aAaXthJSWpZCgKiKR-output-structurer.js` (`d6d3f1fd`) | **SAFE TO PROMOTE AS IS** |
| `PAYLOAD-node-parser-systemMessage.txt` (`f0a825a9`) | **SAFE TO PROMOTE AS IS** |
| parser `output_exchange` (`a68c5992`) | **SAFE TO PROMOTE AS IS** — optional Patch P2 (F14-F, theoretical) |
| `escalation-context` (`cca7a245`) | **SAFE TO PROMOTE AS IS** — optional Patch P1 (F14-E, theoretical) |
| `miss-roster-gate` / `offer-hold-gate` / `miss-members-gate` / `clarify-company-gate` | **SAFE TO PROMOTE AS IS** (highest blast radius; verified clean per F14-A/B) |
| `miss-roster-plan`, `build-miss-member-offer`, `clarify-company-reply`, `offer-hold-reply`, `tag-offer-hold`, `get-cs-members-miss` | **SAFE TO PROMOTE AS IS** |
| `compile-current-state` (`c864f204`), `escalate-catalog` (`5ec7d6a7`), `build-cs-member-offer` (`63c1c46e`), `disallowed-entity-gate` (`069b3691`), `promo-picker` (`05a96e3a`) | **SAFE TO PROMOTE AS IS** |

### R14.7 Optional hardening patches (NOT applied — reviewer does not edit)

**P1 — `escalation-context` (spine `9qVyfUxmRQqrpGRMDLRuz`), line 43.** Replace exactly:

```
    for (const a of (_CO_ALIASES[nk] || [])) ks.add(a);
```
with
```
    for (const a of (Array.isArray(_CO_ALIASES[nk]) ? _CO_ALIASES[nk] : [])) ks.add(a);
```

**P2 — parser `output_exchange` (`XTODTw-dJcV0uRdC056hG`), line 1286.** Replace exactly:

```
    for (const a of (_CO_ALIASES[nk] || [])) ent.keys.add(a);                                                              // (B) alias stopgap
```
with
```
    for (const a of (Array.isArray(_CO_ALIASES[nk]) ? _CO_ALIASES[nk] : [])) ent.keys.add(a);                              // (B) alias stopgap
```

Both are behaviour-identical for every non-prototype key. **If either is applied, the affected body's
sha changes and R13's sha-gated promote map must be regenerated and re-verified before the PUT** — so
applying them is only worth it if the captain wants them, and both must be re-sha'd, not hand-typed.

### R14.8 Recommendation — **GO**

No must-fix. The staged payload is **materially better** on the audited failure class than the code it
replaces: the `_codes` change (F14-C) *adds* type guards to a body on every answered turn, and every
new string operation in this round sits behind `String(… ?? '')`, `typeof … === 'string'`,
`Array.isArray(…)`, or a Code-node `try/catch` that genuinely catches.

Residual risks the captain should accept **knowingly**:

1. **Two new If gates now sit mid-main-path** (`miss-roster-gate` on every answered turn;
   `offer-hold-gate` on every non-ideate turn). Their expressions cannot be made error-tolerant by
   `onError`; a sandbox reject would be a full outage. Verified clean three ways (token grep, node-ref
   resolution, real clone executions) — but they are the **#1 revert trigger** in the first minutes
   after the PUT. Watch the first live answered turn end-to-end before walking away.
2. **F14-G** — `label: m.name` flowing into the parser's unguarded `row.label.indexOf(': ')`. Inherited
   from live, widened by this round. Fix the reader in a follow-up round, not in this PUT.
3. **F14-E / F14-F** — the `_CO_ALIASES` prototype-key throw. Requires a CRM company literally named
   `constructor` or `__proto__`. Accept, or take P1+P2 with a re-sha.
4. **`_codes = []` copy** — when nothing survives the uuid filter the sentence drops its ` for …`
   clause (`*Sorento:* no promotions records.`). Intended, already on R13's watch list.

**Verdict: GO for the rounds-2+3+4 promotion, unchanged, under R13's PROMOTE CHECKLIST and smoke set.**
