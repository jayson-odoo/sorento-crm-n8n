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
`b48e0eaa`), **with promotion gated** on (a) the rev-4 tester rollup landing green (M8a–M8g + S3 — see "Evidence not in
hand" below; it was still running when this review closed) and (b) the captain's disposition of F5. Findings F5–F9 below;
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
- **F9 (evidence gap, closes when the tester lands):** rev-4 UAC rows M8a–M8g and S3 had no tester run files on the
  branch when this review closed (only the planner's R4verify + offline units + this review's own execution checks). See
  below.

## R6. Evidence not in hand at review close

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
   `parser-fork-output_exchange.js` (`b2ac7783…`, the FINAL rev-4 body) and `/options/systemMessage` :=
   `parser-fork-AI-Agent.systemMessage.txt` (`138008c2…`). Fork bodies = live + pass-1 + rev-3 + rev-4 hunks, so they
   apply as-is ONLY under that gate. The systemMessage expression references `$('When Executed by Another Workflow')` —
   live's trigger has that name and carries `previous_conversation_state` (verified). Publish; re-gate active.
   (Whether F5's tightening ships in this body is the captain's call — if yes, promote the rev-5 body instead, after its
   own tester pass.)
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
execs incl. this review's own re-checks); no replay-norm change. **Promotion gate:** (a) rev-4 tester rollup M8a–M8g + S3
green with §0 held (F9), (b) captain disposition of F5 (accept the ≤4-word short-path bound, or ship the rev-5
tightening after a tester pass), (c) apply the promote map above as sha-gated node hunks on live-at-promote-time (F6).
