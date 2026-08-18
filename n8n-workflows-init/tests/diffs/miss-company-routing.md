# Node-diff — `miss-company-routing` (n8n half) · coder pass 2026-08-18

Plan: `plans/miss-company-routing-plan.md` (rev-1) · UAC: `tests/miss-company-routing-UAC.md` · Branch `fm/miss-company-routing`.
Targets edited (ONLY these): spine clone `txiPzSxy3Pclsz6v`, parser fork `wI5RkNGW3EOJfBdo`. **Live untouched** — read-only GETs
recorded after the edits: spine `9qVyfUxmRQqrpGRMDLRuz` @ `efa21057-a7e0-4be3-b6af-f8ced2c3749c`, parser `XTODTw-dJcV0uRdC056hG`
@ `89b63c51-57f0-45fd-96ce-2df103c2fb9d`, HI `rrYXzE61gCNUck_zmXe-G` @ `9249e00e-3dd9-4766-8c49-2f32f8f66bda` (all draft==active).

Byte-exact copies of every published Code body / If expression / systemMessage: `tests/diffs/miss-company-routing/*`
(sha-verified against a post-edit REST re-fetch of BOTH workflows — §5). Pre-edit backups:
`tests/backups/miss-company-routing/<workflow>/` (`VERSION.json` = pre-edit versionId/activeVersionId + the pre-edit bodies of the
two changed spine nodes and the two changed parser params; `connections-before.json` = the two rewired connection entries).

Mechanics: n8n public REST `PUT /workflows/{id}` with `{name, nodes, connections, settings:{executionOrder}}` assembled by script
from the pre-edit dump + the repo body files (byte-exact, never hand-retyped — Lesson 25). PUT auto-activates on this instance;
the clone is safe to auto-activate (this is also why live must NEVER be PUT). Every JS body passed a `new Function` syntax check
before deploy, and the gate/plan/numbering logic was unit-smoked offline against the real partial-miss envelope
(exec 12901422-shape, `exec-A`): gate true on the real miss, false on wrong-domain / all-answered / unlabelled-answer variants;
miss set == `[Sorento]`; numbering base 1 → members start at 2.

## 0. Prereq findings

- Clone wiring re-verified from a fresh dump before editing (per CLAUDE.md/AGENTS.md): the clone calls parser fork
  `wI5RkNGW3EOJfBdo`, HI fork `vUfFUDjLAuMaeQE6`, get-results fork `t4QvrtrPnTwRU6br`, sendmsg `aQUmwMVplmNcyUVc`,
  save-msg `tWm5DYLxfypmVC1T` — plan targets confirmed. No Schedule Trigger on the clone (0 schedule/cron nodes).
- Both targets were `versionId == activeVersionId` before editing (clone `b5c29d54-…` = the plan baseline, parser fork
  `7b4baaa8-…` = the brand-company-routing published body; backup shas equal the predecessor diff doc's published shas —
  clean rebase base, no stale draft, Lesson 24).
- **Seam grounding (measured, not assumed):**
  - The answered-order happy path runs `Call 'sub-get-results'` → `validator` → crossdomain block → `If6[0]` →
    `central-exchange` → `dym-transform-partial` → `dym-gate-partial` → `compile-current-state` (exec 12901422/`exec-A`
    runData). `central-exchange[0] → dym-transform-partial` was the single edge between them, and `central-exchange`'s output
    item carries the full get-results envelope (`has_result`, `lookup_companies`, `answers`, `response`) — everything the miss
    gate needs on `$json`.
  - On an escalation turn the `divert-suggest-yes[1] → escalation-context → Call 'sub-human-intervention'` chain COMPLETES
    (execution indices 19–21) before the parallel `tag-out-of-scope → escalate-catalog → cs-offer-gate → compile-current-state
    → crossdomain-compose → sendmsg-respond2 → pg-upsert-session` lane starts (indices 22–29) — measured on the tester's
    B5rev2-t2 execution `12836119`. This makes the ccs clarify override order-safe: `clarify-company-reply` has always executed
    (or not) by the time ccs reads it. If the engine ever reordered, the failure mode is the OLD behaviour (parser confirmation
    text + today's persistence) with the HI call still diverted — fail-safe in the no-wrong-assignment direction.
  - `escalation-context[0] → Call 'sub-human-intervention'` was the HI call's single inbound edge; the rev-8 `isExecuted`
    guards on its params read `escalation-context`, which still executes on every divert — unaffected.
- Zero-egress wiring untouched: the orphaned egress nodes still have 0 inbound (validation still lists the same
  DISCONNECTED_NODE set); every shared-sub call still passes `is_test=true` (no executeWorkflow node's params changed); the
  only new external call is `get-cs-members-miss` — a CRM **read**, byte-identical params/credential to `get-cs-members`.
- `validate_workflow` on this MCP server validates SDK code, not a workflow id; the equivalent gate (the validation
  `update_workflow` runs on every atomic save) was exercised with a byte-identical no-op `setNodeSettings` op after the PUT:
  **only the pre-existing LESSONS #13 warning set** (DISCONNECTED_NODE on the 8 deliberately-orphaned nodes, `Transcribe a
  recording` expression prefix, OpenAI `builtInTools`), no errors, and none of the 6 new nodes appear in any warning.
  A `publish_workflow` after the no-op confirmed activeVersionId stayed `a1969f5c-…` and a final re-fetch confirmed
  nodes+connections byte-identical to the verified PUT.

## 1. Spine clone `txiPzSxy3Pclsz6v` (before `b5c29d54-f83a-4f8d-8497-ccd1ba703ecd` → published **`a1969f5c-884e-4bee-85fb-bd96c18c6d89`**, draft==active, 150→156 nodes)

Node-set diff vs pre-edit dump: added = `miss-roster-gate, miss-roster-plan, get-cs-members-miss, build-miss-member-offer,
clarify-company-gate, clarify-company-reply`; param-changed = `compile-current-state, escalation-context`; removed = none;
connections changed = `central-exchange, escalation-context` (+ the 5 new-node entries). Nothing else moved.

### 1a. Miss lane (plan §1, captain case A) — seam `central-exchange → [miss lane] → dym-transform-partial`

Why this seam: it is the single edge every ANSWERED happy-path turn crosses after the envelope is composed and before the
dym/partial machinery and ccs run — so the gate sees the final envelope on `$json`, non-order and miss-branch turns never
enter (escalate branches ride `escalate-catalog` and confirmations ride `divert-suggest-yes` — and even a turn that does
cross this edge with `has_result` false or a non-order domain fails the gate), and the FALSE branch re-joins the original
edge unchanged. `dym-transform-partial` passes its input
item through (`_pass = $input.first().json`) and appends keys, and ccs builds its output from scratch (the load-bearing
FRESH-OBJECT rule in its header), so the three `miss_*` keys the lane adds to the item cannot leak into persisted session
vars — ccs reads them via `$('build-miss-member-offer')` explicitly.

| node (id) | change |
|---|---|
| `miss-roster-gate` (NEW, if 2.3, `miss-roster-gate-node`, pos [9280,2560]) | Single boolean IIFE condition (house style = `divert-suggest-yes`), **fail-closed**: `false` unless `$json.has_result === true` AND parser `domain_hint === 'order'` AND routing `customer_service`/`order_enquiries` AND `lookup_companies` non-empty AND `answers` non-empty AND **every** answer carries a `company_name` key field AND (lookup_companies − answered names) non-empty; whole body in try/catch returning false. Stock turns fail the domain+routing legs (captain decision 2). TRUE → `miss-roster-plan`; FALSE → `dym-transform-partial` (the original edge). Expression: `spine-miss-roster-gate.expr.txt`. |
| `miss-roster-plan` (NEW, code v2, `miss-roster-plan-node`, pos [9280,2704]) | One item per MISS company `{plan_idx, company_id, company_name, brand_code, codes, multi_company, companies}` — full `cs-roster-plan` item-shape parity (plan asks the mirrored shape; `codes`/`companies` come with it). Miss set derived from `$('central-exchange')`'s envelope with the SAME derivation as the gate (documented lockstep); `brand_code`/`codes` looked up from `disallowed-entity-gate.routing_companies` by company id (fallback ci name), try/catch → null/[] when absent. Impossible-empty case (gate/plan divergence) degrades to ONE `_miss_plan_empty` sentinel item so the lane cannot starve the happy path of its item; `build-miss-member-offer` drops it (turn byte-identical, one stray roster READ). |
| `get-cs-members-miss` (NEW, httpRequest 4.3, `get-cs-members-miss-node`, pos [9280,2848]) | Byte-identical `parameters` + `credentials` (httpHeaderAuth `mNsZWyU82NYV58k2`) to `get-cs-members` (verified `==` post-edit), `onError: continueRegularOutput`. Dedicated node per plan — the miss lane and the escalate lane continue differently. URL reads `$json.brand_code`/`$json.company_id` from the plan items (e.g. MUB6201 miss ⇒ `…&brand_code=mocha&company_id=00000000-…0001`). CRM READ — allowed. |
| `build-miss-member-offer` (NEW, code v2, `build-miss-member-offer-node`, pos [9280,2992]) | Mirrors `build-cs-member-offer`'s roster parsing (fullResponse `.body`, legacy tolerance, `error` ⇒ `[]`), `user_id && respond_user_id` filter, plan-stamping, cross-company dedupe with `company_ids`/`companies` membership (rev-6 semantics). Rows are `cs_last_result_set`-shaped `{idx, label, uuid, respond_user_id, company_id, company_name, brand_code, company_ids, companies}` with **idx continuing after the reply's existing numbered blocks**: base = max(numbers matched by `/^\s*(\d+)\.\s/gm` in the envelope `response`, `answers.length`). `miss_offer_text` = `Please choose who to route to (reply with the number):` + `n. Name (Company)` lines + the `just reply 'yes'` sentence. `miss_roster_plan` = plan items whose company contributed a member (rev-5 intersection). Output = the `central-exchange` envelope item spread + `miss_member_offer/miss_member_rows/miss_offer_text/miss_roster_plan`; zero members from every miss company — or ANY throw — ⇒ envelope passthrough exactly (turn byte-identical). |
| `compile-current-state` (`7a130a0c-…`) | ONE additive block inserted immediately before the final `return output;` (line-anchored, unique), i.e. AFTER every `userResponse` appender and AFTER the brand-company-routing axes block — deliberately, because the miss arm must override those persisted axes and have the final word on the sent text. Two arms, mutually exclusive, both fail-closed (any missing signal ⇒ byte-identical turn): **(A) miss offer** — keyed on `$('build-miss-member-offer').isExecuted` + `miss_member_offer===true` + rows non-empty + `!_ideate && !_sug && !_mem && !_dymLastResultSet` (a dym partial offer numbers its own list; colliding numberings are refused conservatively) + non-empty `user_response`: appends `\n\n` + the FROZEN phrase `` `Would you like me to escalate to ${team} team?` `` (team = `qf.routing.suggested_team`, phrase BEFORE the picker) + `\n\n` + `miss_offer_text` to `output.user_response`; appends the phrase to persisted `variables.response` (parser regex contract holds in BOTH); extends `variables.last_result_set` with the member rows (idx already continuous); sets `variables.selection_context='member_offer'` (the Δ3 pick arm is keyed on it — without this no number/name reply could resolve; see §3 deviation 2); persists `variables.routing_roster_plan` = the trimmed MISS plan and, when it has exactly 1 row, `routing_company`/`routing_brand` = that pair verbatim (multi-miss ⇒ both null, the rev-4 multi arm then clarifies). **(B) clarify follow-up** — keyed on `$('clarify-company-reply').isExecuted` + non-empty `clarify_text`: replaces `output.user_response` with the clarify ask (same send path — `crossdomain-compose → sendmsg-respond2`, still `is_test=true`), and RE-persists the prior offer state from `get-session-vars` (prev `response` incl. the frozen phrase, `last_result_set`, `selection_context`, `routing_roster_plan/_company/_brand/_companies`) so the next reply still resolves. Body: `spine-compile-current-state.js`. |

### 1b. Clarify divert (plan §1, captain case B) — seam `escalation-context → [gate] → Call 'sub-human-intervention'`

| node (id) | change |
|---|---|
| `clarify-company-gate` (NEW, if 2.3, `clarify-company-gate-node`, pos [12416,4336]) | Single condition `={{ $json.routing_source === 'multi_company_unpicked' }}` (boolean-true operator). TRUE → `clarify-company-reply` (HI **not** called); FALSE → `Call 'sub-human-intervention'` — every other `routing_source` (incl. the new `company_pick`) reaches the HI call exactly as before. ⚠️ This diverts an arm that previously always reached the HI call; the HI-call input guards (rev-8 `isExecuted` on `escalation-context`, which still runs) tolerate it, and `Execution Data` simply doesn't run on a diverted turn (its params only read `findcontact`). |
| `clarify-company-reply` (NEW, code v2, `clarify-company-reply-node`, pos [12416,4480]) | Terminal composer — sends nothing itself. Builds `clarify_text` from prev `routing_roster_plan` (fallback `routing_companies`): 2 companies ⇒ the plan's exact wording `Both X and Y teams are listed — reply a number, a name, or just the company (X / Y) and I'll assign automatically.` (>2 generalises the lead, no-names degrades to `More than one team is listed…`). Emits the incoming item spread + `clarify_company:true, clarify_text`. ccs arm (B) picks it up on the existing guarded send path — measured branch ordering in §0. |
| `escalation-context` (`f014f4d5-…`) | Additive: after the `qb` line, compute `cpick` (= `o.escalation.company_pick`, lowercased) and `cpickRow` — the first ci name-or-id match across persisted `prev.routing_roster_plan` then `prev.routing_companies`; new arm `else if (cpickRow)` inserted between the picked-member arm and `else if (sameTeam)` (i.e. ABOVE the multi-company-unpicked arm, per plan): sends the matched row's `(company_id, company_name, brand_code)` VERBATIM, `routing_source:'company_pick'`. No match ⇒ `cpickRow` null ⇒ behaviour identical to before (falls to the sameTeam arms → typically re-clarify). Body: `spine-escalation-context.js`. |

## 2. Parser fork `wI5RkNGW3EOJfBdo` (before `7b4baaa8-5cb5-460e-b2f4-94a562dcc54f` → published **`d7be8443-827e-4a85-9638-aa243fea6c2d`**, draft==active)

Rebase discipline: both params were patched additively on the CURRENT published bodies (backup shas `3ee5b658…` /
`583bcfb0…` == the brand-company-routing published shas — nothing else in the fork touched; `test-reformulator-bypass` /
`mock-reformulator-output` untouched).

- `output_exchange` (3 anchored insertions, all inside the existing Δ3 `member_offer` arm — plan §2 "the same arm that today
  resolves number/name picks"):
  1. After `const _forcePick = …`: `_coPool` (ci company-name map from prev `routing_roster_plan` + `routing_companies`) and
     `_coPick` — non-null only when the texts match exactly ONE company, word-boundary, on either (a) the raw reply when it is
     ≤3 words (mirrors the `_replyMatchesMember` bound — a longer message that merely CONTAINS a company name, e.g. "any mocha
     promotions this month", still abandons the offer as a new query; LESSON 39 discipline) or (b) the LLM's `person_mention`.
     0 or >1 matches ⇒ null (ambiguity gate — never auto-pick).
  2. In the `_pm` name-resolution arm's zero-match fallback: `else if (_coPick)` → `escalation = { is_escalation_confirmation:
     true, company_pick: _coPick }`, `entities = []` — a person-extractor hit that is actually a company name becomes the
     company pick instead of an `out_of_range` reprompt. A member match still wins (this branch is only reached when every
     member tier yielded nothing).
  3. New Tier 2.5 between the pick-signal tier and `_isNewQuery`: same emission + `member_pick_context = true`. Number /
     position / person-name / bare yes-no (Tier 2) all still outrank it; NO `preferred_assignee_id` is ever set.
- `AI Agent` `options.systemMessage`: one block appended after the PERSON-NAME MENTION section — `== COMPANY-NAME REPLY ON AN
  ESCALATION OFFER ==`: a bare company-name reply on a pending escalation offer engages the offer, is not a new business
  query, and the LLM must not invent domain_hint/entities from the company name alone (resolution is downstream code's job).

## 3. Deviations from the plan (with reason)

1. `miss-roster-plan` items carry `codes` + `companies` in addition to the plan's listed 5 keys — the plan mandates
   "mirrors cs-roster-plan's item shape"; these two keys ARE part of that shape (null-safe defaults).
2. The ccs miss arm also sets `variables.selection_context = 'member_offer'` (not listed in plan §1's key list). Required by
   the plan's own locked contract (§0: "a number/name pick resolves against the persisted last_result_set rows (Δ3 retarget
   arm). Both are reused, not modified") — the Δ3 arm is entry-gated on `selection_context === 'member_offer'`; without the
   key, M2's number pick could never resolve. Consequence accepted: a stray "1" (the order block) resolves an order row whose
   `uuid` is null ⇒ confirmation WITHOUT `preferred_assignee_id` ⇒ round-robin into the persisted single miss pair — safe.
3. The miss merge arm refuses to fire when a dym partial offer exists this turn (`_dymLastResultSet` non-null) — both features
   number their own list and the combined reply would carry colliding numbers; conservative no-offer (fail-closed direction the
   plan prescribes for every missing signal). Surface: `dym-annotate-partial` turns never get a miss picker.
4. `miss-roster-gate` additionally requires `domain_hint === 'order'` on top of the routing pair — plan §0's own wording
   ("the domain is orders"); a routing pair carried from prior state can no longer open the lane on a non-order turn.
5. The clarify wording generalises beyond 2 companies (lead swaps off "Both") and degrades when no names are persisted —
   the 2-company case is the plan's sentence verbatim.
6. `miss-roster-plan`'s impossible-empty sentinel (§1a table) — not in the plan; exists because an empty item set at that seam
   would kill the whole happy-lane turn (no reply at all), a worse failure than one stray roster read.

## 4. Validation

From the post-PUT no-op `update_workflow` save (§0): warnings are EXACTLY the pre-existing LESSONS #13 set — DISCONNECTED_NODE
on `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`, `Code in JavaScript`,
`sorento-sub-respond-sendmsg-respond3`, `presign-fail-notice` (each reported twice by the two checkers), the `Transcribe a
recording` MISSING_EXPRESSION_PREFIX, and the OpenAI `builtInTools` INVALID_PARAMETER. No errors; no warning names any node
added or changed by this pass. Parser fork PUT: HTTP 200, 8 nodes, no validation surface change.

## 5. sha256 table (byte-exact; every `after` value re-fetched from the published workflow and compared `==` to the repo file)

| body | before (pre-edit, = backup) | after (published, = `diffs/miss-company-routing/` file) |
|---|---|---|
| spine `compile-current-state.jsCode` | `de896ddd3b0fd3c4a43bbfafc55d15117a61a8706ad6ea145431f18c97287f99` | `ddacfdfab2972b10cb8db9a3d1b186877e80528b96a54c93eefb8e4c33c5500b` |
| spine `escalation-context.jsCode` | `8c12563c4f64916a6b0dc7fd21965ba3a5bed4eb7e43d1442e28a5ebe096ac4f` | `4d7bbe2996cad609198b718f39013cad3c753152d77566ac4e4eb40a60b63de8` |
| spine `miss-roster-gate` leftValue (new) | — | `024d91e31eaa95f484332a9bd41d31f111059d9fcc97ba0774627ebf353efea2` (reviewer-corrected 2026-08-18: the originally recorded `e385a598…` was the file+trailing-LF; deployed leftValue == file bytes == this value) |
| spine `miss-roster-plan.jsCode` (new) | — | `0b7907d6cff7dbd00d197700c6ea9164485d1dd7b1293fea64dc0bacd1f8bbcf` |
| spine `build-miss-member-offer.jsCode` (new) | — | `3e3d97096b1347cea5dcfb9bc34a13ac4526aba0e4491ca1b6eebb10e6124bc2` |
| spine `clarify-company-gate` leftValue (new) | — | `63e30a3db1f6aa693dcadc25e5b0669ed271ccb7aa2f5c17a7311b91d41709fe` (reviewer-corrected 2026-08-18: originally recorded `f423f11f…` = file+trailing-LF) |
| spine `clarify-company-reply.jsCode` (new) | — | `2ee509aa81a4c5602db0c892660986826564c7c2c0791fe9934b5eca2e92100e` |
| spine `get-cs-members-miss` params/credentials | — | verified `==` to `get-cs-members` (deep-equal on the re-fetch), `onError: continueRegularOutput` |
| parser fork `output_exchange.jsCode` | `3ee5b658c1fca330f3845474328561d2d2ad968cac41294613bd59951e327eed` | `3810a9b0b90eb355c0bd64616e5c675d87ff6637bf7f419fb583519b71c83889` |
| parser fork `AI Agent.systemMessage` | `583bcfb0a5aa88fe0db599b8774ef1aa49a7104d13cb6d898bf08576d1645f37` | `fa1700e86553083ebce518789f423ec5457aff48d21d9ba507f0a097f83d627b` |

Full hashes: `shasum -a 256 n8n-workflows-init/tests/backups/miss-company-routing/*/* n8n-workflows-init/tests/diffs/miss-company-routing/*`.
The two `.expr.txt` files have NO trailing newline — file bytes == the deployed `leftValue` exactly.

## 6. Replay-norm note (plan §3)

No `norm()` change made (per plan): `company_pick`/`routing_source` ride existing containers; the new state keys on answered
miss turns (`last_result_set` member rows, `selection_context`, the appended phrase in `variables.response`,
`routing_roster_plan` on an answered turn) surface as diffs against golden BY DESIGN (Lesson 40). Re-check at review.

## 7. Promote mapping (captain-gated; NOT executed)

Parser fork → live `XTODTw-dJcV0uRdC056hG`: `output_exchange` jsCode := `parser-fork-output_exchange.js` and `AI Agent`
systemMessage := `parser-fork-AI-Agent.systemMessage.txt` — both are the live-published body + the §2 hunks (fork was
byte-equal to live's promoted `89b63c51-…` bodies before this pass) so they apply as-is IF live hasn't moved; otherwise
re-apply the 3+1 anchored insertions of §2 on the live body. Spine → live `9qVyfUxmRQqrpGRMDLRuz` (`efa21057-…`): add the 6
nodes with the same params (`get-cs-members-miss` mirrors LIVE `get-cs-members`, id `ff5f651e-…`-adjacent config incl. its
credential), apply the 2 rewires (live `central-exchange`→`dym-transform-partial` edge and live `escalation-context`
(`f0…`? — enumerate live's node id first)→HI edge — **enumerate every inbound edge of the live HI call before rewiring**, per
the predecessor's P3 note), and apply the ccs + escalation-context hunks as ANCHORED insertions on the LIVE bodies (anchors:
final `return output;` line; the `qb` const line + `} else if (sameTeam) {`) — do NOT copy the clone bodies wholesale (clone
and live diverge in both directions). Backup-first, sha-verify draft before publish + active after, auto-revert (Lessons 24/25).
Guards to strip at promote: none — no node in this change is test-only; the clone's pre-existing guards stay clone-only.

## rev-2 (captain decision 2026-08-18, mid-round): carry resolved brand on the no-roster arm

Captain journey `photo for MWCX7608-SH-S10` → `yes` (a `marketing_product` escalation — the CS roster lane
never runs) escalated with `brand: n/a` although the photo turn had persisted `routing_brand: mocha`
(source `resolved`; traced on clone executions 12894240/12894262 and 12906044/12906192). Cause: the rev-4
pool-identity rule zeroed the brand on the `sameTeam` no-plan arm — but with NO roster fetched there is no
shown pool for a brand to disagree with, so the null is pure information loss. Captain: "pass the brand
along regardless".

- `escalation-context` (clone `txiPzSxy3Pclsz6v`): one guarded line at the end of the no-plan branch —
  `if (source !== 'multi_company_unpicked') brand_code = prev.routing_brand ?? null;` (comment block in the
  body). Roster-backed arms (picked row / persisted plan) stay fetch-verbatim: forcing a different brand
  there can 400 a pinned pick or exclude offered members — the exact regressions rev-3/rev-4 closed.
- Published `a1969f5c-…` → **`d4ce02eb-e337-447c-bf05-9a13f504dd53`** (draft==active).
  sha `4d7bbe29…` → **`c14da5d7…`** (repo body updated, re-fetch verified `==`).
- Applied while the tester's M-pass was in flight: the M-cases all exercise roster-backed arms
  (plan rows present), so their assertions are unaffected; the tester/reviewer should note the clone
  versionId moved mid-pass. Re-verification of the photo→yes journey (marker `brand: mocha`) is queued
  behind the tester run (shared canary contact).
- Live carries the SAME null-brand behaviour on this arm (promoted `efa21057-…`); this rev promotes with
  the miss-company batch at the captain's gate.

## rev-3 (captain console decisions 2026-08-18): "yes mocha" resolves + offer copy

Captain console repro (both-miss MUB6201 offer): "yes" → clarify ✓; **"yes mocha" → clarify AGAIN ✗**; "mocha" → routes ✓.
Root cause: the LLM reads "yes mocha" as an affirmative, so the Δ3 arm took the Tier-2 `is_affirmative === true` branch
(bare confirmation, no `company_pick`) BEFORE Tier 2.5 could see the company name; and the deterministic matcher ran on
the raw reply, where the filler "yes" is not a company. Plus copy decisions from the M1 / multi-company console test.
Targets: spine clone `txiPzSxy3Pclsz6v` `d4ce02eb-…` → **`709461ec-632c-4dac-a38a-e98346e6f9a6`** (draft==active, 156
nodes, node-set + connections byte-identical, exactly 3 nodes' `jsCode` changed, all other node fields identical on the
re-fetch) and parser fork `wI5RkNGW3EOJfBdo` `d7be8443-…` → **`3a397f2b-687b-457f-bab3-42c10f77185c`** (draft==active, 8
nodes, exactly `output_exchange.jsCode` + `AI Agent.options.systemMessage` changed). Live re-fetched read-only after: spine
`efa21057-…`, parser `89b63c51-…`, HI `9249e00e-…` — unchanged. Mechanics as pass 1 (REST PUT assembled by script from
the fresh REST GET + the repo body files, byte-exact; PUT auto-activates; post-PUT no-op `setNodeSettings` on
`get-cs-members-miss` re-ran the MCP validation: **same pre-existing warning set only, no errors, versionId unchanged**).
Pre-edit bodies + VERSION.json: `tests/backups/miss-company-routing/<workflow>/rev-3/`.

### Fix 2 — "yes mocha" (parser fork `wI5RkNGW3EOJfBdo`)

- `output_exchange` (Δ3 `member_offer` arm, anchored insertions only):
  - **Filler strip (deterministic Tier 2.5 input).** `_coFillers` = `yes, ya, yeah, yep, yup, ok, okay, sure, please, pls,
    plz, team, the, to, route, assign, escalate, one, lah, la, go, with, it, that, this` — compared word-level,
    case-insensitive, after dropping non-alphanumerics from the token ("yes," == yes). `_coKept` = the reply minus fillers.
    The company match runs on `_coKept.join(' ')` when the ORIGINAL reply is **≤4 words** (was ≤3; admits "yes mocha team
    please"; the bound still makes "any mocha promotions this month" a new query — LESSON 39) and `_coKept` is non-empty.
    A reply that strips to NOTHING ("yes", "ok pls") produces no company pick — bare-yes path unchanged. Existing rules
    kept: word-boundary regex, exactly-ONE company hit (else null), member tiers outrank it.
  - **Affirmative arm attaches the pick.** Tier 2 `is_affirmative === true` now emits
    `{ is_escalation_confirmation: true, company_pick }` when a validated pick exists (no member resolved on that arm by
    construction), else the plain confirmation as before. This is the branch "yes mocha" actually takes.
  - **Semantic fallback.** `_coPickLlm` reads `escalation.company_pick` from the FROZEN `_parser_raw_snapshot` and accepts
    it only if: the persisted pool (`routing_roster_plan` ∪ `routing_companies` names) is non-empty; the reply is not a
    bare confirmation (`_coKept` non-empty — a hallucinated pick on "yes" is refused); and exactly one pool company matches
    (case-insensitive exact name, else word-boundary exactly-one). Otherwise silently null. `_coPickAny = _coPick ||
    _coPickLlm` — deterministic wins. Used in the `_pm` zero-match fallback, the affirmative arm, and Tier 2.5.
  - **Raw key stripped at the top** (right after the snapshot): `delete output.output.escalation.company_pick`, so an
    unvalidated/null LLM value never rides the live escalation object on ANY turn (no golden diff noise, Lesson 40); the
    only writers of `company_pick` are the validated arms above.
  - Offline unit on the deployed body (stub `$`/`$json`, both-miss state Mocha/Sorento + 2 member rows): "yes" → plain
    confirm; "yes mocha" / "mocha please" / "mocha" / "Mocha team pls" / "yes mocha team please" / "ok go with sorento" →
    `company_pick` Mocha/Sorento; "yes" + LLM pick Mocha → REFUSED (plain confirm); "yes" + LLM pick Cabana → refused;
    "route to the mocha team please" (6 words) → deterministic none, LLM pick "mocha" → accepted; "yes mocha and sorento" →
    ambiguous → plain confirm; "any mocha promotions this month" → new query (unchanged); "maryam"/"yes maryam"/"2" →
    member picks unchanged. Pre-edit body on the same cases: "yes mocha", "Mocha team pls", "ok go with sorento" all
    → plain confirm (the bug).
- `AI Agent.systemMessage`: (a) the COMPANY-NAME section now renders the pool from state via an n8n expression —
  `Companies named in the pending offer (from state; "(none)" when no offer is pending): {{ …routing_roster_plan ⊕
  routing_companies → distinct company_name → ' / ' }}` (Array.isArray-guarded, `.concat`, no spread; smoke-evaluated in
  node against a populated and an empty state ⇒ `Mocha / Sorento` / `(none)`) — the LLM otherwise never sees the
  persisted companies (its `text` input is only previous response + current message); (b) instruction: when that list is
  not "(none)" and the message names EXACTLY ONE listed company (bare or with confirmation/filler words) → `escalation:
  { is_escalation_confirmation: true, company_pick: "<name as listed>" }`, keep `is_affirmative` per the AFFIRMATION
  rule, no `person_mention` for a company; otherwise `company_pick: null`; never guess — code validates; (c) OUTPUT
  schema: `"escalation": { "is_escalation_confirmation": false, "company_pick": "string_or_null — …" }`.
  ⚠️ Deployment note: the systemMessage is an `=`-expression; if the new `{{ }}` ever throws, EVERY real-parser turn on
  the fork fails at `AI Agent` (mock turns unaffected). Guarded defensively; the tester's parser-tier M7a/M7b run is the
  live proof.
- No spine change for fix 2: `escalation-context` already resolves `escalation.company_pick` (`company_pick` arm).
- Known gap (unchanged, out of scope): the company-pick tiers live inside the Δ3 arm, i.e. require persisted
  `selection_context === 'member_offer'`. A multi-company offer whose rosters were ALL empty (fallback, no
  selection_context) still re-clarifies on a company-name reply.

### Fix 1 + copy decisions (spine clone; wording, all WhatsApp-bold = single `*asterisks*`)

| node | change |
|---|---|
| `build-cs-member-offer` (`build-cs-member-offer-node`) | **Multi arm**: group headers bold `*Mocha:*` / `*Sorento:*`, member lines plain `n. Name` (per-member `(Company)` suffix DROPPED; a shared rev-6 member keeps ONE number under each group; the `[ X: no customer-service members are configured — omitted. ]` line unchanged); note names bold: `Note: MUB6201 is carried by more than one company (*Mocha* and *Sorento*), so I am listing …`; closing sentence replaced by **`If you have no preference, reply with the company name (*Mocha* / *Sorento*) and we'll assign accordingly.`** (names in plan/offer order, ' / '-joined, N supported) — written ONCE and exported as `cs_multi_close` (single-source, like `cs_multi_note`). Phrase stays plain on multi. **Single arm**: picker lines already plain `n. Name` (verified, byte-identical), yes-sentence byte-identical; the escalate phrase inside `cat.response` is rewritten in place — first `/(would you like me to escalate to )(\S+ team\?)/i` → `…escalate to *Sorento* customer_service team?` — the SAME `out.response` is the visible reply and the persisted `variables.response` (ccs `_mem` arm uses `_mem.response` for both). Company exported as `cs_offer_company` (null on multi/unnamed) so the merge arm applies the identical rewrite. Nuance: `multi` = companies QUERIED (plan length), so a 2-company offer where one roster came back empty still gets the company-name sentence listing both (matches the note); replying with the empty company resolves via `routing_companies` to that company_id (CRM default pool). |
| `build-miss-member-offer` (`build-miss-member-offer-node`) | Lines plain `n. Name` everywhere (was `n. Name (Sorento)`); `multi = used.length > 1` (plan items that contributed a member — the SAME signal ccs's miss arm keys on): single ⇒ flat list + unchanged yes-sentence; multi ⇒ bold `*Company:*` headers grouped by `company_ids` membership (shared member ⇒ one number under each) + `If you have no preference, reply with the company name (*A* / *B*) and we'll assign accordingly.`. Numbering base, rows, `miss_roster_plan`, passthrough/fail-closed behaviour unchanged (offline units: single ⇒ `3. Maryam Ariffin` / `4. Cyndi` + yes-sentence; multi ⇒ headers + company sentence; one roster empty ⇒ degrades to single; all empty ⇒ envelope passthrough). |
| `compile-current-state` (`7a130a0c-…`) | **Δ4 merge arm** (`_merge`): mirrors build-cs-member-offer — multi ⇒ bold `*Company:*` headers grouped from `_mem.routing_companies` × row `company_ids` (shared member under each, one number), plain `n. Name` lines (suffix dropped), the omitted-company line kept, `_close = _mem.cs_multi_close` (fallback to the old `Or just reply 'yes' and we'll assign automatically.` if the key is absent, e.g. a pre-rev-3 body upstream); single ⇒ flat plain lines + the old close unchanged; the date-suggest text's phrase gets the same `*<Company>*` rewrite when `_mem.cs_offer_company` is set (else untouched — e.g. build-suggest-offer's `'yes' to escalate to X.` form has no `would you like…` and is left as is). Header/labels/close therefore cannot drift from the primary renderer. **Miss arm**: `_mcPlan` computed first; `_mcPhrase = Would you like me to escalate to ${_mcPlan.length===1 && name ? '*Name* ' : ''}${team} team?` — same string appended to `user_response` AND `variables.response` (prefix wording byte-exact; parser contract regex is prefix-only; no consumer parses the team out of the phrase — grepped every clone node + the fork). Multi-miss ⇒ plain phrase. Everything else in both arms unchanged. |

Nothing else changed: no node added/removed, no connection changed, `escalation-context` / `clarify-company-reply` /
`miss-roster-gate` / `miss-roster-plan` / `clarify-company-gate` / `get-cs-members-miss` byte-identical to rev-2 (the
`clarify-company-reply` wording stays plain per the captain — it already lists the options).

### rev-3 sha256 table (byte-exact; `after` re-fetched from the published workflow == repo file)

| body | before (= `backups/…/rev-3/`) | after (published, = `diffs/miss-company-routing/` file) |
|---|---|---|
| spine `compile-current-state.jsCode` | `ddacfdfab2972b10cb8db9a3d1b186877e80528b96a54c93eefb8e4c33c5500b` | `07a31bb3db51c09fe528d616c2d200c040670cf763dfbb663505f0baf735859e` |
| spine `build-cs-member-offer.jsCode` (file now lives here; predecessor copy in `diffs/brand-company-routing/`) | `37a1b023734d7723d9537f127f386550ec7e56febcf9f0130395ef1399b062c7` | `c7046c455d1f676bd46868fa1b2752770bfb571737b6dfceafdc6bcd1f21b433` |
| spine `build-miss-member-offer.jsCode` | `3e3d97096b1347cea5dcfb9bc34a13ac4526aba0e4491ca1b6eebb10e6124bc2` | `68eef4c73c43167892cc994de759066e4f3a391c898623d7542eec3a81f5bc43` |
| parser fork `output_exchange.jsCode` | `3810a9b0b90eb355c0bd64616e5c675d87ff6637bf7f419fb583519b71c83889` | `ea40047b68f07b7dfe249b774eddadc2ada2a5152382395257356fb1f1f76b17` |
| parser fork `AI Agent.systemMessage` | `fa1700e86553083ebce518789f423ec5457aff48d21d9ba507f0a097f83d627b` | `619097f5e78c6c520cd402cae5fd706c65126225a5977b90b876f9deb006e6cb` |

### rev-3 UAC / promote notes

- UAC: `tests/miss-company-routing-UAC.md` — target versionIds bumped; M1 + M4a-t1 expectations re-worded (rev-3 copy);
  new M7a ("yes mocha" resolves, parser tier), M7b ("mocha please"), M7c (bare "yes" still clarifies; LLM pick on bare
  yes discarded), M7d (multi wording sentence / bold headers / no suffixes / plain multi phrase), M7e (single-company
  phrase names the company; single picker + yes-sentence byte-identical). The mock-placement line at the top of the
  mechanics paragraph now says item TOP level (template was already fixed by the reviewer).
- Promote mapping (§7) additions: `build-cs-member-offer.jsCode` := `spine-build-cs-member-offer.js` (this body is the
  brand-company-routing promoted body + the rev-3 hunks; live's `build-cs-member-offer` should equal the pre-edit backup
  `37a1b023…` — verify, else re-apply the anchored hunks: header/lines in the multi group loop, `boldNames`/`multiClose`/
  `offerCompany`/`nameCompany` block before `out.response`); ccs merge-arm + miss-arm hunks and the two
  build-miss-member-offer hunks as anchored insertions; parser fork `output_exchange`/systemMessage as before (whole
  bodies apply if live `89b63c51-…` hasn't moved — the fork bodies are live + pass-1 + rev-3 hunks). Guards to strip: none.
- The reviewer's APPROVE (`tests/reviews/miss-company-routing.md`) covered rev-2 `d4ce02eb`/`d7be8443`; rev-3 needs a
  tester pass (M1, M4a-t1 wording, M7a–e, §0) and re-review before promotion.

## rev-4 (captain console defects 2026-08-18 + tester rollup rev-3 items A/B): codes + aliases resolve, picks on any reply shape, clarify never destroys the offer, offered-pool rule, S3 sendmsg-fork DB write

Published (REST `PUT /workflows/{id}` assembled by script from a FRESH GET + the repo body files, byte-exact; PUT
auto-activates; `settings` limited to the public-API schema keys `executionOrder`/`availableInMCP` — the server keeps
`callerPolicy`/`binaryMode`/`timeSavedMode` untouched, verified on the re-fetch):

| workflow | before (= `backups/…/rev-4/VERSION.json`) | after (draft==active) | publish time (UTC) |
|---|---|---|---|
| parser fork `wI5RkNGW3EOJfBdo` | `3a397f2b-687b-457f-bab3-42c10f77185c` | `0cedb928-b61f-4dd5-9b88-1b3f6137d92c` → **`de9ff09d-a240-46af-98fd-0d5992fdd16d`** | 03:09:47Z, then **03:13:06Z** (see "two publishes" below) |
| spine clone `txiPzSxy3Pclsz6v` | `709461ec-632c-4dac-a38a-e98346e6f9a6` | **`0557b0b4-8f2d-457e-8f64-4e1d600c6ca1`** (156 → 159 nodes) | **03:10:02Z** |
| sendmsg fork `aQUmwMVplmNcyUVc` (S3) | `51fed3d1-9a92-469a-9b7a-d77e56f8d302` | **`b48e0eaa-6dbd-4f1b-bf81-40cf6804c933`** | **03:10:03Z** |

Live re-fetched read-only after: spine `efa21057-…`, parser `89b63c51-…`, HI `9249e00e-…`, sendmsg `aoydkG1dbItXR5jXFEQsP`
`91171ac3-…` — unchanged. Only the clone calls `aQUmwMVplmNcyUVc` (checked every workflow's executeWorkflow targets).
Post-PUT no-op `setNodeSettings` on `get-cs-members-miss` re-ran the MCP validation on the spine: **the pre-existing
LESSONS #13 warning set only, no errors, versionId/nodes/connections unchanged**. Offline units on the DEPLOYED bodies
(harness runs the byte-exact repo files with n8n globals stubbed): `tests/unit/miss-company-routing-rev4.output_exchange.test.js`
(32 cases) and `tests/unit/miss-company-routing-rev4.spine.test.js` (33 cases) — all green on the published bodies; the pre-edit
parser body fails 17 of them (the new behaviours + the pre-existing "product code + company word" hole + the pool-union bug).
Tester note: the tester's M7 run was in flight on `709461ec`/`3a397f2b`; edits landed as ONE publish per workflow at the times
above (parser: two — see below); a tester exec that started before 03:10Z ran the rev-3 bodies.

**Two publishes on the parser fork (deviation from "one publish"):** the first rev-4 body (`0cedb928-…`, 03:09:47Z) let the new
no-member-context arm treat a persisted `routing_roster_plan.length > 1` as "offer open". The spine's axes block carries that
plan forward across same-team turns — including a decline ("Escalation declined.") — so a later "sorento" would have re-opened a
closed offer and escalated. Caught by adding the decline→"sorento" unit; fixed 3 minutes later (`de9ff09d-…`, 03:13:06Z): "open"
= the FROZEN phrase in the persisted `response` only. Nothing else differs between the two bodies (sha table = the final body).

### Root causes (captain transcript, both-miss MUB6201 offer; prior state per `get-session-vars` on each exec)

- **12910551 "yes please escalate to srt team" → clarify.** Parser: `request_for_help`, `is_affirmative:true`, LLM
  `company_pick:null` (its pool render listed names only — SRT is the CRM company CODE; the offer state carries names);
  deterministic tier: the reply is 6 words (> the rev-3 ≤4-word bound) ⇒ no match ⇒ Tier-2 affirmative arm ⇒ plain
  confirmation ⇒ `escalation-context` `multi_company_unpicked` ⇒ clarify (state re-persisted correctly by arm B).
- **12910575 "srt" → "Hi there! How can I assist you today?" + state LOST.** Parser Δ3 arm: no member/number/company hit ⇒ Tier 4
  `{member_reprompt:'out_of_range'}` + `correction:true`, LLM `message_type:'casual'`. Spine: `If2` false → `If-ideate` false →
  `If10` (`correction && message_type !== 'casual' && !== 'business_query'`) **false because casual** → `is-escalation-declined`
  false → `If9` (casual) → `resolve-entity-clarification` → `Basic LLM Chain` ("Hi there!") → `central-exchange` → ccs, which
  persisted the casual turn: `selection_context:null`, `last_result_set:[]`, `response:"Hi there!…"` (the axes block still
  carried `routing_roster_plan`/`routing_companies` forward — which is why the LATER turns could still clarify but never resolve).
  Same failure shape for any casual-classified unresolved reply on an offer (pre-existing; single-company offers included).
- **12910616 / 12910642 "please escalate to sorento team" → clarify forever.** Prior state now had no offer context (no
  `selection_context`, no phrase) ⇒ the Δ3 arm never ran ⇒ raw LLM `{is_escalation_confirmation:false, company_pick:null}` (pool
  rendered "(none)") ⇒ `If2` TRUE on `request_for_help` ⇒ `escalation-context` sameTeam + carried 2-row plan ⇒
  `multi_company_unpicked` ⇒ clarify (arm B re-persisted the plan but had no rows/selection_context to restore).

### Fix A — company CODES + aliases (parser fork `output_exchange` + systemMessage; spine `escalation-context`)

- No upstream code source exists on the offer turn: `resolve-entity` matches carry `{company_id, company_name}` only, get-results'
  `lookup_companies` is `{id,name}`, `next-assignee` echoes a code only after the fact. **Stopgap:** static alias map, byte-identical
  in BOTH tiers — `_CO_ALIASES = { sorento: ['sorento','srt'], mocha: ['mocha','mch'], cabana: ['cabana','cbn'] }` (keyed by the
  lower-cased persisted `company_name`). Both resolvers ALSO honour a `company_code`/`code` key on a pool row if a source ever
  carries one — the real fix is the CRM `companies.code` column threaded `resolve-entity` match → `disallowed-entity-gate`
  `routing_companies[].company_code` (its `_byCo` group at the `out.routing_companies = …` line) → `cs-roster-plan` /
  `miss-roster-plan` items → the ccs-persisted plan rows (`plan_idx/company_id/company_name/brand_code` + `company_code`); no
  null `company_code` key was added anywhere now (it would be null on every persisted row and diff every golden turn, Lesson 40).
- Match order per company: name → code → alias, all case-insensitive, word-boundary (`(^|[^a-z0-9])key([^a-z0-9]|$)`), exactly ONE
  company may hit across all its keys (else null). "SRTKT72SS" cannot hit `srt` (word boundary + product-token refuse).
- `output_exchange`: the whole company-pick helper is now ONE function `_coCompanyPick(o)` hoisted ABOVE the Δ3 arm (used by the arm
  and by the new no-context arm); returns `{ pool, pick, pickLlm, any, multi, hasNeg, kept, words }`. Aliases/codes apply to the
  deterministic tier, the LLM validator (`escalation.company_pick` from the frozen snapshot: an LLM "SRT" canonicalises to
  `Sorento`; anything not resolving to exactly one offered company is discarded) and — defensively, the parser already emits the
  canonical name — to `escalation-context`'s `cpickRow` (name → id → code → alias, exactly one row).
- systemMessage: `Company codes: Sorento = SRT, Mocha = MCH, Cabana = CBN`; the pool render now prints `Mocha (code MCH) / Sorento
  (code SRT)` (IIFE expression, evaluated offline against populated / single / empty / null states ⇒ as expected / `(none)`); the
  instruction says `company_pick` = the CANONICAL name as listed, never the code, and applies whatever `message_type` is assigned.

### Fix B — picks on ANY reply shape while an offer is open (parser fork)

- Bound (documented; `_coCompanyPick` (C)): the deterministic tier runs on **(i)** a reply of ≤4 words (rev-3 rule, unchanged), or
  **(ii)** a LONGER reply whose filler-stripped remainder is **≤6 words AND** the reply has **no product-code-like token**
  (`/^[a-z]{2,}[a-z0-9-]*\d/i` per word — MUB6201, SRTKT72SS, MWCX7608-SH-S10), **no `current_message:true` entity**, and the LLM
  did **not** classify it as a domain query (`(domain_hint || business_query || clarification) && is_affirmative !== true`, the
  arm's own `_isNewQuery`, kept in lockstep). Product-code-like tokens refuse the pick on BOTH paths (closes the pre-existing
  "MUB6201 sorento" 2-word hole). Filler set extended (kindly/can/could/you/me/us/pass/send/forward/transfer/connect/pick/choose/
  select/prefer/handle/help/escalation/for/of/on/at/in/a/an/then/want/would/like/need/company/side/instead/guys/ppl/people/staff/
  department/dept/group/thanks/thank/ty/tq/okie/oki/k/pl/leh/lor/ah + rev-3's). Negators (`no not nope nah never dont neither nor
  none without except cancel stop`, punctuation-stripped so "don't"→dont) anywhere in the reply refuse BOTH tiers — never assign
  against a stated negative ("no not sorento" → the decline arm). The LLM validator additionally requires `!domainQ`.
- Tier order unchanged: retarget → member/number/name → affirmative → **decline** → Tier 2.5 company → new query → junk. Rev-4:
  the Tier-2 `is_affirmative === false` arm takes a validated company pick first (`{is_escalation_confirmation:true, company_pick}`)
  and only then the deterministic decline (a bare "no"/"nah" carries a negator, so a plain decline can never carry a pick).
  `request_for_help` "please escalate to sorento team" (LLM team null ⇒ no retarget; `is_affirmative null` ⇒ no Tier-2 signal) now
  lands in Tier 2.5 with the pick — the exact 12910616 shape. A genuine retarget (LLM names a DIFFERENT team) still wins.
- **Unresolved reply on a MULTI-company pool** (`_coCompanyPick(...).multi` = persisted `routing_roster_plan.length > 1`, the same
  criterion `escalation-context` uses for `multi_company_unpicked`): every reprompt site (`_pos` multi / out-of-range, `_pm`
  ambiguous / zero-match, Tier 4 junk) goes through `_coReprompt(kind)`: multi ⇒ `{ is_escalation_confirmation:false,
  member_reprompt:kind, offer_hold:true }` + `correction:false` (explicitly NOT the If10 fallback re-offer); single ⇒ the
  pre-rev-4 `{member_reprompt}` + `correction:true`. `member_pick_context` stays true on both (the offer is NOT abandoned).
- **New arm after Δ3 (no member-pick context):** when `selection_context !== 'member_offer'` but the frozen phrase is in the
  persisted `response` (offer open: e.g. a multi-company offer whose rosters all came back empty — the rev-3 known gap), and the
  reply carries no concrete `domain_hint`, a company pick (same resolver, same bounds) emits `{is_escalation_confirmation:true,
  company_pick}` + `member_pick_context:true`; a retarget still wins; nothing else touched.
- Δ4/dym/suggest tiers untouched; `_pending_pick` (D11) sees `member_pick_context` as before.

### Fix C — clarify never destroys the offer (spine)

| node | change |
|---|---|
| `offer-hold-gate` (NEW, if 2.3, id `offer-hold-gate-node`, pos [3328,3296]) | Inserted on the `If-ideate[false] → If10` edge (the single edge every non-escalation, non-ideate parser turn crosses; sits BEFORE `If10`, so neither the fallback member re-offer nor the clarification LLM can run on a held turn). ONE fail-closed boolean IIFE (`spine-offer-hold-gate.expr.txt`, block comments — the `miss-roster-gate` house style): TRUE only when parser `member_pick_context === true` AND (`escalation.offer_hold === true` OR `member_reprompt` is a string) AND NOT (`is_escalation_confirmation === true` / `escalation_declined === true` / `retarget_team === true`) AND persisted `selection_context === 'member_offer'` AND persisted `routing_roster_plan.length > 1`; any throw ⇒ false. TRUE → `offer-hold-reply`; FALSE → `If10` (the original edge, byte-identical). Single-company offers therefore keep today's paths (If10 re-offer / casual → LLM — the pre-existing state-loss on a casual-classified junk reply on a SINGLE offer is out of scope and noted). |
| `offer-hold-reply` (NEW, code v2, id `offer-hold-reply-node`, pos [3552,3440]) | **Byte-identical body to `clarify-company-reply`** (ONE repo file `spine-clarify-company-reply.js` deployed to BOTH nodes; header comment documents both entry points). Composes `clarify_text` from the OFFERED pool (plan first, else companies) and emits `{...$json, clarify_company:true, clarify_text}`. |
| `tag-offer-hold` (NEW, set 3.4, id `tag-offer-hold-node`, pos [3776,3440]) | `branch_kind = 'offer_hold'` (house style of `tag-escalation-declined`) → `escalate-catalog`. Linear chain, so no branch-ordering assumption is needed (unlike case B, which relies on the measured order). |
| `escalate-catalog` (`escalate-catalog-node`) | New `case 'offer_hold'`: `response` = `$('offer-hold-reply').first().json.clarify_text` (by reference, guarded ⇒ '' if absent), `manualResponse:true`, `includeResponse:true`, `is_escalate_offer:false` ⇒ `cs-offer-gate` FALSE ⇒ ccs directly (no roster refetch, no LLM). Every other case byte-identical. |
| `compile-current-state` (`7a130a0c-…`) | Arm B's `_mcClar` now reads `clarify-company-reply` OR `offer-hold-reply` (first executed node with a non-empty `clarify_text`); the arm body is unchanged: `user_response = clarify_text` and RE-persist prev `response` (frozen phrase), `last_result_set`, `selection_context`, `routing_roster_plan`, `routing_company`, `routing_brand`, `routing_companies`. Every unresolved path out of an open multi-company offer (junk / out-of-range / ambiguous / casual / bare "yes" / request_for_help without a pick) now ends in this arm; only an explicit decline (`escalation_declined` → `is-escalation-declined`) or a brand-new business query (parser Tier 3, no `member_pick_context`) clears the offer. |
| `clarify-company-reply` (`clarify-company-reply-node`) | Copy (captain): `Both *Mocha* and *Sorento* teams are listed — reply a number, a name, or the company (Mocha / Sorento) and I'll assign automatically.` (bold names in the lead; "or the company"; >2 generalises `*A*, *B* and *C* teams are listed`; no names ⇒ `More than one team is listed`). Codes (SRT/MCH/CBN) are ACCEPTED but not advertised in the sentence — the alias map is a stopgap; advertise codes once a real code source lands. |
| `escalation-context` (`f014f4d5-…`) | (A) + Fix A resolver, see below. |

Where the state was nulled on 12910575: NOT in any ccs arm — the turn simply never reached one; the casual/LLM lane's normal
ccs output (`selection_context` from `_merge/_sug/_mem/_isDisambig` ⇒ null, `last_result_set` from the (empty) result object)
overwrote it. The fix is upstream (the offer-hold-gate diverts the turn) plus arm B's re-persist; ccs's default computation is
untouched.

### (A) Offered pool, not the union (tester rollup rev-3) — parser tiers, systemMessage render, `escalation-context`

Pool = `routing_roster_plan` companies when the plan is non-empty (the rosters actually shown); `routing_companies` ONLY when no
plan exists (no roster offered — photo/marketing). Applied identically in `_coCompanyPick` (deterministic + LLM validator), the
systemMessage pool render, and `escalation-context.cpickRow`. Behaviour chosen for "yes mocha" on a Sorento-only partial-miss
offer: NO Mocha pick (Mocha was never offered — the systemMessage lists `Sorento (code SRT)` only and the validator refuses an LLM
Mocha); the "yes" stays the plain confirmation ⇒ `escalation-context` `prior_state` ⇒ routes to the single offered pool
(Sorento) — i.e. exactly what the offer text says 'yes' does; the un-offered company word is ignored. A bare "mocha" on that offer
resolves nothing ⇒ single-pool reprompt (`correction:true`, no `offer_hold`) as before. `clarify-company-reply` already used the
plan-first rule.

### (B) S3 — sendmsg fork `aQUmwMVplmNcyUVc` wrote chat memory into the PROD CRM DB

`Chat Memory Manager` (insert) ← `Postgres Chat Memory1` ran on credential `sorento-crm-db` (`ETJL5KoaA1UpkDip`), session key =
contact id, on the `Loop Over Items` done-branch of every clone text reply. Fix (fork only): `Postgres Chat Memory1.credentials.postgres`
:= `n8n_test-db` (`Dnnofg8Xb27VQOhI`) — mirrors the parser fork's `Postgres Chat Memory` (same node type/version on the same
credential, running on every real-parser turn — the table `n8n_chat_histories` auto-creates on first insert; host psql to
`n8n_test` is unavailable per Lesson 31, so the parser-fork precedent + the tester's S3 assertion on the sub-execution are the
proof). Node otherwise byte-identical (parameters/position/id verified on the re-fetch); no other node/connection changed.
Live sendmsg `aoydkG1dbItXR5jXFEQsP` untouched (its own memory node is prod behaviour, out of scope). Backup:
`tests/backups/miss-company-routing/sendmsg-fork-aQUmwMVplmNcyUVc/rev-4/VERSION.json` (pre-edit node + versionId).

### rev-4 sha256 table (byte-exact; every `after` re-fetched from the published workflow and compared `==` to the repo file)

| body | before (= `backups/…/rev-4/`) | after (published, = `diffs/miss-company-routing/` file) |
|---|---|---|
| spine `compile-current-state.jsCode` | `07a31bb3db51c09fe528d616c2d200c040670cf763dfbb663505f0baf735859e` | `5a84dfead0a928ea08a6f83ff89a45ec56ca7da57ad5eff6520ec912d2b6c827` |
| spine `escalation-context.jsCode` | `c14da5d74a6efdbe763312fc89b8c52a39ee62535b0fe55cfce04186755c4112` | `cca7a2458eb9a92159f9139d4626f44a2912ac8a79024ac0d973d03dee980393` |
| spine `clarify-company-reply.jsCode` | `2ee509aa81a4c5602db0c892660986826564c7c2c0791fe9934b5eca2e92100e` | `7ff06aa81f1572f194a03a1dc5d3987591ae33380df0e761db4f6954f23b5c3f` |
| spine `offer-hold-reply.jsCode` (new; = `spine-clarify-company-reply.js`) | — | `7ff06aa81f1572f194a03a1dc5d3987591ae33380df0e761db4f6954f23b5c3f` |
| spine `escalate-catalog.jsCode` (file now lives here: `spine-escalate-catalog.js`) | `5e7d80666740381b5ab031f054fe859df8b014b7f8ddda0b0364452ee4642289` | `0168df843a2ec58a39a6634b1d478964ecf5a0968ed015d509834d491acaea7f` |
| spine `offer-hold-gate` leftValue (new; `spine-offer-hold-gate.expr.txt`, no trailing LF) | — | `8f14a430cf7fc74eeb36d59e8406de706f2519caff9e75d8c03bae2078f05a4b` |
| spine `tag-offer-hold` params | — | `{"assignments":{"assignments":[{"id":"tag-offer-hold-a1","name":"branch_kind","value":"offer_hold","type":"string"}]},"options":{}}` |
| parser fork `output_exchange.jsCode` | `ea40047b68f07b7dfe249b774eddadc2ada2a5152382395257356fb1f1f76b17` | first publish `69f0ab6c3b2074b3fb39f58d9406dbd9de867da57f54ec9ef9e859158189d9cf` → **`b2ac7783daf6b92da226a4752191900b92d8c1bbdd81beab03d43efc3a013c43`** (final, `de9ff09d-…`) |
| parser fork `AI Agent.systemMessage` | `619097f5e78c6c520cd402cae5fd706c65126225a5977b90b876f9deb006e6cb` | `138008c23eabfead0c780bf281005589156f46e3d8683a7bae26f3f4b8d46aa2` |
| sendmsg fork `Postgres Chat Memory1.credentials.postgres` | `{"id":"ETJL5KoaA1UpkDip","name":"sorento-crm-db"}` | `{"id":"Dnnofg8Xb27VQOhI","name":"n8n_test-db"}` (node otherwise byte-identical) |

Node-set diff on the spine vs `709461ec`: added `offer-hold-gate, offer-hold-reply, tag-offer-hold`; param-changed
`compile-current-state, escalate-catalog, escalation-context, clarify-company-reply`; removed none; connections changed
`If-ideate` (+ the 3 new entries). Zero-egress wiring untouched (same DISCONNECTED_NODE set; no executeWorkflow node changed;
no new external call — the offer-hold path is LLM-free and read-free).

### rev-4 UAC / promote notes

- UAC: `tests/miss-company-routing-UAC.md` — target versionIds bumped (all three), M4a-t2/M7c clarify copy re-worded, "entities []"
  expectations re-worded to "no `current_message:true` entity", new **M8a** ("yes please escalate to srt team" → Sorento), **M8b**
  ("srt"), **M8c** ("please escalate to sorento team", request_for_help shape), **M8d** (junk on a multi offer → clarify AND state
  survives; next "sorento" resolves; single-offer junk still takes the old path), **M8e** ("no" declines + clears; a later "sorento"
  does not pick), **M8f** (new business query clears; product-code companions offline), **M8g** ((A) "yes mocha" on a Sorento-only
  offer → single offered pool, never Mocha), **S3** (sendmsg fork credential + memory insert lands in `n8n_test`).
- Promote mapping additions (captain-gated, NOT executed): parser fork `output_exchange`/systemMessage whole bodies (live
  `89b63c51-…` unchanged ⇒ apply as-is; the fork bodies = live + pass-1 + rev-3 + rev-4 hunks); spine: add the 3 nodes with the
  same params, rewire live `If-ideate[1]` (currently → `If10`) → `offer-hold-gate` (enumerate the live edge first), `escalate-catalog`
  `offer_hold` case (anchored after `escalation_declined`), ccs `_mcClar` loop (anchored on the arm-B `_mcClar` const),
  `escalation-context` `_CO_ALIASES` + `cpickRow` IIFE (replaces the rev-1 `cpickRow` const), `clarify-company-reply` whole body
  (also deployed to the new `offer-hold-reply`). Guards to strip: none. The S3 credential re-point is fork-only — do NOT promote.
- The alias map is a stopgap: when the CRM exposes `companies.code` on resolve-entity matches, thread it through
  `disallowed-entity-gate` → plan rows and drop `_CO_ALIASES` from both tiers (the `company_code`/`code` key path is already live).

## rev-5 (reviewer F5, 2026-08-18): short-path domain/entity guard on the deterministic company pick — parser fork ONLY

Published (same mechanics: REST `PUT /workflows/wI5RkNGW3EOJfBdo` assembled by script from a FRESH GET at 03:31Z + the repo body
file, byte-exact; ONE publish; PUT auto-activates):

| workflow | before (= `backups/…/parser-fork-wI5RkNGW3EOJfBdo/rev-5/VERSION.json`) | after (draft==active) | publish time (UTC) |
|---|---|---|---|
| parser fork `wI5RkNGW3EOJfBdo` | `de9ff09d-a240-46af-98fd-0d5992fdd16d` (body sha `b2ac7783…`, re-verified on the fresh GET) | **`c7d9cfa2-b46e-43b4-a227-8104616401e4`** | **03:32:04Z** |

Spine clone `0557b0b4-…` and sendmsg fork `b48e0eaa-…` untouched. Live parser `XTODTw-dJcV0uRdC056hG` re-fetched read-only after:
`89b63c51-…`, unchanged. Post-PUT no-op `setNodeSettings` (`AI Agent.retryOnFail:true`, already true) re-ran the MCP validation:
the pre-existing fork warning set only (`Postgres Chat Memory` SUBNODE_NOT_CONNECTED/DISCONNECTED_NODE, OpenAI `builtInTools`
INVALID_PARAMETER — LESSONS #13), no errors, versionId still `c7d9cfa2-…`. On the re-fetch: exactly `output_exchange.jsCode`
changed; every other node field, the connections and `settings` are byte-identical to the pre-PUT dump; systemMessage sha
`138008c2…` unchanged (== `parser-fork-AI-Agent.systemMessage.txt`).

### F5 — the finding

`_coCompanyPick` (C) ran the deterministic tier on ANY ≤4-word reply with no domain/entity guard, and Tier 2.5 sits before Tier 3
(`_isNewQuery`) in the Δ3 arm — so a short new query naming one offered company right after an offer ("mocha promotions",
"sorento stock MUB", "show sorento orders", "mocha promotions this month" — LLM `business_query` + `domain_hint`) became a
company-scoped **escalation** (`{is_escalation_confirmation:true, company_pick}`) instead of being answered. Reproduced offline on
the rev-4 body: all four emit a pick (the extended unit fails exactly the 6 new F5 assertions against `de9ff09d`).

### Fix — exact guard shipped (`_coCompanyPick`, ONE expression + comments; nothing else in the body changed)

```js
const shortOk = words.length > 0 && words.length <= 4 && (kept.length < 2 || (!curEnt && !domainQ));
```

- `kept` = the reply minus fillers, `curEnt` = any `current_message:true` entity, `domainQ` = `(!!domain_hint || message_type
  business_query/clarification) && is_affirmative !== true` — the SAME predicates the long path (`longOk`) already uses (== the Δ3
  arm's `_isNewQuery`, kept in lockstep). Single-token remainders (`"srt"`, `"mocha"`, `"Mocha team pls"` ⇒ `["mocha"]`, `"ok go
  with sorento"` ⇒ `["sorento"]`, `"yes please escalate to srt team"` ⇒ `["srt"]`) are exempt — behaviour byte-for-byte as rev-4,
  incl. the LESSON-39 shape where the real parser speculatively domain-classifies a bare company token (unit added).
- Header comment (C) gained a two-line rev-5 note; the `shortOk` line gained a five-line rev-5 comment. Diff vs rev-4 = those
  comment lines + the one expression (`git diff HEAD~1 -- tests/diffs/miss-company-routing/parser-fork-output_exchange.js`).
- The rev-4 no-context arm (`_selCtx !== 'member_offer'`, gate `!domain_hint`) uses the same resolver, so `business_query`
  without a `domain_hint` ("mocha promotions" classified bq/null) is now refused there too (unit added). The LLM-pick validator
  (`pickLlm`) already required `!domainQ` — unchanged.
- **Tier order NOT moved** (Tier 2.5 still precedes Tier 3): moving Tier 2.5 after `_isNewQuery` would drop the single-token
  picks whenever the real parser speculatively assigns a domain to a bare company/code token (the exact "bare Nur ⇒ order search"
  speculation the Δ3 comment records; M8b "srt" happened to come back `casual`, but a bare "sorento" is not guaranteed to) — i.e.
  not behaviour-preserving on the evidenced class. The guard alone yields the reviewer's target set: ≥2-token domain/entity
  replies fall through Tier 2.5 (deterministic refused, LLM pick refused by `domainQ`) to Tier 3.

### Observed classification of the four probes (offline unit on the deployed body, LLM output stubbed as the reviewer's probe
shapes; real-fork confirmation = UAC M8h)

| probe | LLM stub | rev-4 body (`de9ff09d`) | rev-5 body (`c7d9cfa2`) |
|---|---|---|---|
| "mocha promotions" | business_query / promotion | `company_pick Mocha` (escalation) | Tier 3 new query: escalation untouched, `message_type business_query`, `domain_hint promotion`, no `member_pick_context`/`offer_hold`/`correction` |
| "sorento stock MUB" | business_query / inventory, entity MUB current | `company_pick Sorento`, entities cleared | Tier 3 new query; entity preserved (1 row) |
| "show sorento orders" | business_query / order, entity sorento current | `company_pick Sorento` | Tier 3 new query; `domain_hint order` kept |
| "mocha promotions this month" | business_query / promotion | `company_pick Mocha` | Tier 3 new query |

Must-still-pick set (unit, rev-5 body): "yes mocha" (affirmative), "mocha please" (casual), "Mocha team pls" (casual, even with a
current-message brand entity), "srt" (casual), bare "sorento" speculatively bq/order + current entity, "yes please escalate to
srt team", "please escalate to sorento team" (request_for_help), "ok go with sorento" (with and without `is_affirmative`) — all
resolve to the expected company. Unit file: `tests/unit/miss-company-routing-rev4.output_exchange.test.js` — 32 → **48 cases**,
48/48 on the deployed body (re-fetched `after-oe.js`), 42/48 on the rev-4 backup (the 6 F5 must-not-pick assertions fail there,
as expected).

### rev-5 sha256 table (byte-exact; `after` re-fetched from the published workflow == repo file)

| body | before (= `backups/…/rev-5/output_exchange.jsCode.js`) | after (published `c7d9cfa2-…`, = `diffs/miss-company-routing/parser-fork-output_exchange.js`) |
|---|---|---|
| parser fork `output_exchange.jsCode` | `b2ac7783daf6b92da226a4752191900b92d8c1bbdd81beab03d43efc3a013c43` | **`a68c5992acacdd1eb9d190630408f46f3959b9c34fc48577a1feb51023d985d2`** |
| parser fork `AI Agent.systemMessage` | `138008c23eabfead0c780bf281005589156f46e3d8683a7bae26f3f4b8d46aa2` | unchanged |

### rev-5 UAC / promote notes

- UAC: `tests/miss-company-routing-UAC.md` — parser fork target bumped to `c7d9cfa2-…`; new **M8h** (the four F5 probes on an open
  both-miss offer must NOT pick — Tier 3 fall-through, `If2` FALSE, `offer-hold-gate` FALSE, HI not called; plus the must-still-pick
  companions on the same seed). Re-run M7a/M7b/M8a–M8c on the new fork version.
- Promote mapping: unchanged in shape — the parser fork `output_exchange` whole body (now = live + pass-1 + rev-3 + rev-4 + rev-5
  hunks) applies as-is to live `89b63c51-…` (unchanged). Guards to strip: none.

## round-3 (plan §"Round 3", 2026-08-18): incoming-stock miss offer + cs-offer-gate parity — spine clone ONLY

Planner-seat decisions applied: **D1** = the offer names the domain's own routing team (incoming → `purchasing`; no override of
roster URL / `escalation-context.team` / HI); **D2** = no left-out domain flipped in (allowlist = orders ×2 + incoming ×3 exactly as
R3.1); **D3 = option (b)** — `cs-offer-gate` widened to the same routing pairs so an incoming NOT-FOUND turn gets the same member
picker as orders (both-miss parity). Parser fork NOT touched. Guards untouched. No executions, no promotion.

Published (same mechanics as rev-4: REST `PUT /workflows/txiPzSxy3Pclsz6v` assembled by `jq --rawfile` from a FRESH GET + the two
repo expression files, byte-exact; ONE PUT; PUT auto-activates; body = `{name,nodes,connections,settings:{executionOrder}}`):

| workflow | before (= `backups/miss-company-routing/clone-round3-PRE-0557b0b4.json`, full dump; node-level copies in `backups/…/spine-txiPzSxy3Pclsz6v/round-3/`) | after (draft==active) | PUT time (UTC) |
|---|---|---|---|
| spine clone `txiPzSxy3Pclsz6v` | `0557b0b4-8f2d-457e-8f64-4e1d600c6ca1` (159 nodes / 143 connection sources) | **`05a83eef-0f4f-4576-875a-fb1a26ca271c`** (159 / 143) | **04:30:25Z** |

Post-PUT full sweep (PRE dump vs POST re-fetch): per-node `parameters` sha changed on exactly TWO nodes (`miss-roster-gate`,
`cs-offer-gate`); every other node's parameters, every node's `id/position/credentials/onError/disabled`, and `connections` are
byte-identical. Post-PUT no-op `setNodeSettings` (`get-cs-members-miss.onError:continueRegularOutput`, already so) re-ran the MCP
validation: **the pre-existing LESSONS #13 warning set only, no errors**, versionId still `05a83eef-…`, nodes+connections unchanged.
Parser fork `wI5RkNGW3EOJfBdo` re-fetched read-only after: `c7d9cfa2-…` (`output_exchange` `a68c5992`, systemMessage `138008c2`).
Clone `executeWorkflow` targets unchanged (parser `wI5RkNGW3EOJfBdo`, HI `vUfFUDjLAuMaeQE6`, get-results `t4QvrtrPnTwRU6br`,
sendmsg `aQUmwMVplmNcyUVc`, save-msg `tWm5DYLxfypmVC1T`).

### Node changes (2)

| node | before | after |
|---|---|---|
| `miss-roster-gate` (If 2.3, existing round-2 node) › `conditions.conditions[0].leftValue` | round-2 expression: legs `has_result` → `domain_hint==='order'` → routing `customer_service/order_enquiries` → `lookup_companies` → every answer has `company_name` → miss set non-empty; outer try→false. sha **`024d91e3`** (= `backups/…/round-3/miss-roster-gate.leftValue.expr.txt`) | R3.2 expression: legs `has_result` → **allowlist LANE keyed on `$('tool-filter').first().json.name`** (5 tools; `hasOwnProperty` guard, trimmed) → `domain_hint === lane.domain` → routing `=== lane.team/agent` → **`$('crossdomain-render')` executed && `_xdBlock.any===true` ⇒ false** (one offer per turn — crossdomain-compose owns it) → the round-2 lookup/answers/miss legs **byte-identical** → outer try→false. Header comment: "answered order or incoming turn … allowlist R3.1". sha **`031dda83`** (= `diffs/miss-company-routing/spine-miss-roster-gate.expr.txt`). Everything else on the node (options `strict`/v3, id, operator, rightValue) byte-identical. |
| `cs-offer-gate` (If 2.3, **LIVE node**, pre-existing — NOT in the round-2 payload) › `conditions.conditions` | 3 ANDed conditions: `g1` boolean `is_escalate_offer` true (`464ff187`) · `g2` string `routing.suggested_team == 'customer_service'` (`fafa8b77`) · `g3` string `routing.suggested_agent == 'order_enquiries'` (`147d8d50`). `conditions` json sha **`ce99a16c`** — **identical on live active `7aba1447` (PRE backup), the current live draft, and the clone PRE**; sorted-params sha `99ef2db5` (live == clone). Node id differs (live `18e0a370-…`, clone `cs-offer-gate-node`) — promote keys on name. | 2 ANDed conditions: `g1` **byte-identical** · `g2` (same id, now boolean/true like g1) leftValue = ONE IIFE: `P=[[customer_service,order_enquiries],[purchasing,incoming_stock_enquiries]]; return P.some(pair match)`; try→false. sha **`cfa8c18e`** (= `diffs/miss-company-routing/spine-cs-offer-gate.expr.txt`); `conditions` json sha `391a31c8`; sorted-params `9e19a7f2`. `g3` removed (its predicate is folded into g2). options (`loose`, v2), combinator, typeVersion untouched. Orders behaviour: identical truth table (CS/order pair ⇒ true; g1 still ANDed by the node). New: purchasing/incoming pair ⇒ true. Every other pair ⇒ false. |

**One deliberate semantic delta on `cs-offer-gate` (recorded, not silent):** the old `g2`/`g3` read `…output.routing.suggested_team`
un-guarded, so a turn with `is_escalate_offer:true` and `routing:null` would have THROWN in the If node; the new g2 wraps
`routing || {}` in try→false ⇒ fail-closed (plain offer, no picker). Turns with a routing object are byte-for-byte the same decision.

### Team-agnostic audit (task step 3 — grep of the deployed bodies, nothing changed)

- `get-cs-members` / `get-cs-members-miss` URL: `agent_code={{ …routing.suggested_agent }}&team_code={{ …routing.suggested_team }}` — agnostic.
- `escalation-context`: `suggested_team || null`, `suggested_team === team` — agnostic. `Call 'sub-human-intervention'` inputs: `suggested_team`/`suggested_agent` from the parser — agnostic.
- `cs-roster-plan`, `miss-roster-plan`, `build-miss-member-offer`: no team literal at all.
- `build-cs-member-offer`: the ONLY `customer_service` literals are (a) header comments and (b) the **fallback** string
  `cat.response || 'Would you like me to escalate to customer_service team?'` used only when `escalate-catalog.response` is empty
  (`escalate-catalog` always renders `…escalate to ${qf.routing.suggested_team} team?` on the offer arm, so on incoming the visible
  phrase reads `purchasing team?`); `nameCompany` regex `(\S+ team\?)` matches any team word. Reported, NOT changed (F-R3-3 below).

### Offline units (byte-exact repo expressions, n8n `$json`/`$()` stubbed)

`tests/unit/miss-company-routing-round3.gates.test.js` — **38 passed, 0 failed**: R3.3 (i) incoming envelope (exec-12918600 shape)
× 3 incoming tools ⇒ TRUE, (ii) `_xdBlock.any:true` ⇒ FALSE (and: render ran without a block ⇒ TRUE; render never ran ⇒ TRUE),
(iii) stock/warehouse ⇒ FALSE, (iv) promotions + master products/attachments/certificates ⇒ FALSE, (v) incoming tool with CS/order,
purchasing/general, domain-order, and orders-tool-with-incoming-routing ⇒ FALSE, (vi) M1 orders envelope × 2 order tools ⇒ TRUE
(unchanged), (vii) tool-filter unexecuted / throwing / null / empty name / non-allowlisted / case-mismatch / prototype names ⇒ FALSE,
whitespace trimmed ⇒ TRUE, parser unexecuted ⇒ FALSE, (viii) miss set empty (exact + case/space) / no lookup_companies / has_result
false / unlabelled answer / empty answers / empty `$json` ⇒ FALSE. `cs-offer-gate`: orders pass, incoming pass, marketing fail,
warehouse fail, purchasing/general fail, cross-pair fail, routing null fail, parser unexecuted fail, node-level AND with
`is_escalate_offer` false/true. Round-2 harnesses re-run unchanged: `miss-company-routing-rev4.spine.test.js` 33/33.

### Findings

- **F-R3-2 (planner, confirmed):** `miss-roster-plan` / `build-miss-member-offer` header comments still say "answered order turn";
  bodies deliberately untouched (shas `0b7907d6` / `68eef4c7` re-asserted) so the staged payload holds — fix wording at the next body change.
- **F-R3-3 (new, cosmetic):** `build-cs-member-offer` fallback literal `'Would you like me to escalate to customer_service team?'`
  (only reachable if `escalate-catalog.response` is empty). Not changed this round; fold into the same future body edit as F-R3-2.
- **Observation (live, read-only):** live spine `9qVyfUxmRQqrpGRMDLRuz` now shows draft `cfd0e776-…` ≠ active `7aba1447-…`
  (updatedAt 04:28:14Z, before this PUT; not created by this session — the only write here was the clone PUT). Diffed the draft against
  the `PRE-…-7aba1447.json` backup: nodes (params/positions/ids), connections and settings are **identical** — a content-empty draft
  (UI save?). Harmless today, but LESSONS #24 applies: whoever promotes must confirm draft==intended before any live publish.

### round-3 sha256 table (byte-exact; every `after` re-fetched from the published clone and compared `==` to the repo file)

| body | before | after |
|---|---|---|
| `miss-roster-gate.conditions[0].leftValue` | `024d91e31eaa95f484332a9bd41d31f111059d9fcc97ba0774627ebf353efea2` | **`031dda834654b230abb84eba9e3835c475b89025e6c4c6599595964558d137b6`** |
| `cs-offer-gate.conditions[1].leftValue` (g2) | `fafa8b77…` (string-equals leftValue) + `g3` `147d8d50…` | **`cfa8c18ee9c4fb51656e10bea9dfc31cc8f7ea0964ec201e1560128f3c91be83`** (g3 removed) |
| `cs-offer-gate.conditions` (json) | `ce99a16c…` (== live active/draft == clone PRE) | `391a31c8…` |
| every R3.3 "everything else" body | `miss-roster-plan` `0b7907d6`, `build-miss-member-offer` `68eef4c7`, `compile-current-state` `5a84dfea`, `escalation-context` `cca7a245`, `clarify-company-reply`/`offer-hold-reply` `7ff06aa8`, `offer-hold-gate` `8f14a430`, `clarify-company-gate` `63e30a3d`, `tool-filter` `bffb4c3a` | unchanged (all re-asserted on the POST fetch) |
| parser fork `output_exchange` / systemMessage | `a68c5992` / `138008c2` | unchanged (`c7d9cfa2-…`) |

### round-3 UAC / promote notes

- Tester: UAC N1–N10/R/S in `tests/miss-company-routing-UAC.md` on clone `05a83eef-…` + fork `c7d9cfa2-…`; P1 roster probe
  (`zz-roster-probe`) for purchasing/incoming_stock_enquiries × {Sorento, Mocha} BEFORE N1. Re-run M1 (orders miss) as regression.
  Also cover the not-found incoming both-miss (D3): `cs-offer-gate` TRUE ⇒ `cs-roster-plan`/`get-cs-members`/`build-cs-member-offer`
  render the picker with the `purchasing team?` phrase.
- Promote mapping (combined round-2+3, §R3.7): the staged payload changes in TWO nodes now — `miss-roster-gate` (new node, leftValue
  `024d91e3` → `031dda83`) and **`cs-offer-gate` (existing live node `18e0a370-…`, `conditions` `ce99a16c` → `391a31c8`; live active
  == live draft == clone PRE on that node, so the hunk applies cleanly)**. R7 3e / R10 4a+4d rows must be re-measured for both. Guards to
  strip: none (neither expression reads a test flag).

## round-3 rev-2 (coder, 2026-08-18): F-R3-4 sandbox-safe `miss-roster-gate` + F-R3-5 `cs_multi_note` team label

Clone `txiPzSxy3Pclsz6v` `05a83eef-…` → **`e54e114e-86e6-4023-8926-3fec6fc1ef51`** (REST PUT, `activeVersionId == versionId`
immediately — auto-activated as before). PRE backup: `tests/backups/miss-company-routing/clone-round3rev2-PRE-05a83eef.json` +
`…/spine-txiPzSxy3Pclsz6v/round-3-rev2/{VERSION.json, miss-roster-gate.leftValue.expr.txt, build-cs-member-offer.jsCode.js}`.
Post-PUT full sweep (PRE dump vs POST re-fetch): node-name set equal (159), per-node `parameters` changed on exactly TWO nodes
(`miss-roster-gate`, `build-cs-member-offer`), connections byte-identical, settings unchanged. Live `9qVyfUxmRQqrpGRMDLRuz` untouched.

| node › field | before (round-3, `05a83eef`) | after (rev-2, `e54e114e`) |
|---|---|---|
| `miss-roster-gate` (If 2.3) › `conditions.conditions[0].leftValue` | R3.2 expression with `const lane = Object.prototype.hasOwnProperty.call(LANE, tool) ? LANE[tool] : null;` — **throws `ExpressionError: Cannot access "prototype" due to security concerns` in the n8n expression sandbox** on EVERY evaluation (parse/access-time reject, the IIFE's try/catch never runs) ⇒ every `has_result:true` turn died (tester F-R3-4, execs 12921439/12921451/…). sha `031dda83` | Same expression, ONE statement replaced: `const lane = (tool && Object.keys(LANE).includes(tool)) ? LANE[tool] : null;` (+ a 2-line comment pointing at LESSONS #45; the comment itself contains none of the forbidden tokens). Truth table unchanged (units (i)–(viii) re-pass, incl. `toString`/`hasOwnProperty` tool names ⇒ FALSE). sha **`d24dd81b`** (= `diffs/miss-company-routing/spine-miss-roster-gate.expr.txt`). Everything else on the node byte-identical. |
| `cs-offer-gate` | `cfa8c18e` (g2 leftValue) / `391a31c8` (conditions json) | **unchanged** (re-asserted byte-equal on the POST fetch; contains no forbidden token) |
| `build-cs-member-offer` (Code) › `jsCode` — F-R3-5 (tester, cosmetic) | `cs_multi_note` literal `…so I am listing the customer-service team members from each of them…` on EVERY multi-company picker, including the purchasing (incoming) picker cs-offer-gate now opens. sha `c7046c45` | New `teamLabel` = `$('Call 'sub-query-reformulator'').first().json.output.routing.suggested_team` humanised `_`→`-` (try/catch + non-string/blank ⇒ `'customer-service'`); the note interpolates `${teamLabel} team members`. **Orders (customer_service) and every SINGLE-company item are byte-identical to the PRE body** (offline units compare old vs new body output on the same fixtures: orders multi item ==, single orders ==, single incoming ==; incoming multi differs ONLY in the note wording ⇒ `purchasing team members`). Not touched (same F-R3-3 family, left for the next body change): the fallback literal `'Would you like me to escalate to customer_service team?'` (only when `escalate-catalog.response` is empty) and the `[ X: no customer-service members are configured — omitted. ]` line (mirrored literally by compile-current-state's Δ4 merge arm — changing one without the other would drift). sha **`63c1c46e`** (= `diffs/miss-company-routing/spine-build-cs-member-offer.js`). |

### round-3 rev-2 sha256 table (byte-exact; every `after` re-fetched from the published clone and compared `==` to the repo file)

| body | before | after |
|---|---|---|
| `miss-roster-gate.conditions[0].leftValue` | `031dda834654b230abb84eba9e3835c475b89025e6c4c6599595964558d137b6` | **`d24dd81b…`** |
| `cs-offer-gate.conditions[1].leftValue` (g2) | `cfa8c18e…` | unchanged |
| `build-cs-member-offer.jsCode` | `c7046c455d1f676bd46868fa1b2752770bfb571737b6dfceafdc6bcd1f21b433` | **`63c1c46e…`** |

Forbidden-token grep (`prototype|constructor|__proto__`) over `diffs/miss-company-routing/*.expr.txt`: **0 hits** (all four expression
files: miss-roster-gate, cs-offer-gate, clarify-company-gate, offer-hold-gate). Clone-wide: no non-Code node's parameters contain the tokens
after the PUT (before: exactly `miss-roster-gate`). The one Code-node hit (`compile-current-state` `Object.prototype.hasOwnProperty.call(_sp,_k)`)
is jsCode — a different sandbox, pre-existing, runs fine, left alone.

### Units

`tests/unit/miss-company-routing-round3.gates.test.js` — **52 passed, 0 failed** (38 round-3 + 5 sandbox: per-`.expr.txt` forbidden-token
scan + "membership test is `Object.keys(...).includes`" + 9 F-R3-5: orders-multi note/item == PRE body, incoming-multi note = "purchasing team
members" and ONLY the note differs, single orders/incoming == PRE body, parser unexecuted / routing null / blank team ⇒ "customer-service",
`marketing_promotion` ⇒ "marketing-promotion"). Round-2 harnesses unchanged: `miss-company-routing-rev4.spine.test.js` 33/33,
`miss-company-routing-rev4.output_exchange.test.js` 48/48.

### Smoke (coder, ONE clone exec — the tester owns the full N1–N10/R/S set)

`zz-canary-run` 12922392 → clone **12922393** `success` on `e54e114e`, item = the R-M1 shape (`any order for MUB6201`, uac mode, order/CS mock,
real CRM read): `tool-filter` `crm_order_management_orders_list`, **`miss-roster-gate` TRUE (1 item, no error)**, `miss-roster-plan` +
`build-miss-member-offer` ran, sent text = the M1r3 picker (`Would you like me to escalate to *Sorento* customer_service team?` + members 3–8);
egress = `save-message-redis would_log` · `save-session-vars would_write` · `sendmsg-sub would_send` only; no `send-message-*`,
`update-human-intervened`, HI or prod PUT in runData. Evidence: `tests/runs/miss-company-routing-round3rev2-SMOKE-20260818.json`.
LESSONS #45 added (expression sandbox forbids prototype/constructor/__proto__; offline units can't see it — smoke one real exec per new expression).

### Promote implication (rev-2 delta over §R3.7)

The staged payload's `miss-roster-gate` leftValue is now `d24dd81b` (NOT `031dda83` — that one cannot run on ANY n8n instance), and
`build-cs-member-offer` moves to `63c1c46e` (was `c7046c45`; the LIVE-PROMOTE-STAGED payload must carry the new body — orders output proven
byte-identical, so the R7/R10 rows for that node do not need re-measuring beyond a sha update). `cs-offer-gate` `391a31c8` unchanged.
Staged live payload `tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` (found in the
working tree already carrying the round-3 bodies — gate `031dda83`, widened `cs-offer-gate` — uncommitted): patched to the rev-2 bodies
(`miss-roster-gate` `d24dd81b`, `build-cs-member-offer` `63c1c46e`; nothing else changed) so the broken expression can never be promoted.
Still NOT applied — captain-gated; R7 3e / R10 4a+4d re-measure per §R3.7 still owed before any live PUT.

## round-3 rev-3 (coder, 2026-08-18; plan §"Round 3 rev-3" V1–V7): plain offer for incoming+stock, members orders-only, cs-offer-gate revert

Clone `txiPzSxy3Pclsz6v` `e54e114e-…` → **`7db593b0-ef2e-453b-bc98-30ff9267bf41`** (REST PUT of `{name,nodes,connections,settings:{executionOrder}}`,
`activeVersionId == versionId` immediately — auto-activated as before). PRE backups: `tests/backups/miss-company-routing/clone-round3rev3-PRE-e54e114e.json`
(full dump) + `…/spine-txiPzSxy3Pclsz6v/round-3-rev3/{VERSION.json, miss-roster-gate.leftValue.expr.txt, miss-roster-plan.jsCode.js,
build-miss-member-offer.jsCode.js, compile-current-state.jsCode.js, clarify-company-reply.jsCode.js, cs-offer-gate.parameters.json,
connections-before.json}`. Live `9qVyfUxmRQqrpGRMDLRuz` and parser fork `wI5RkNGW3EOJfBdo` (`c7d9cfa2`) untouched.

**Post-PUT full sweep (PRE dump vs POST re-fetch): 159 → 160 nodes (+`miss-members-gate`, 0 dropped); per-node `parameters` changed on exactly
SEVEN nodes** (`miss-roster-gate`, `miss-roster-plan`, `build-miss-member-offer`, `compile-current-state`, `clarify-company-reply`,
`offer-hold-reply`, `cs-offer-gate`); **0 non-param field diffs**; connections 143 → 144 keys (+`miss-members-gate` key; ONE existing key changed:
`miss-roster-plan` now → `miss-members-gate` instead of `get-cs-members-miss`); settings preserved server-side. Every deployed body re-fetched
and compared `==` byte-exact to the repo file.

| node › field | change |
|---|---|
| `miss-roster-gate` (If 2.3) › `conditions[0].leftValue` | §V1: LANE gains the ONE stock row (`crm_inventory_stock_balance_list` → inventory / warehouse / general_enquiries) and a `members` field on every row (orders `true`, incoming+stock `false`; the gate IGNORES the flag — offer/no-offer only). Header comment updated (stock is now in the allowlist; qty-0 rows remain answers). LANE block MIRRORED BYTE-IDENTICAL into `miss-roster-plan` (unit-asserted). Every logic leg from `const tool =` down byte-identical to rev-2 (`d24dd81b`), Object.keys membership form kept (LESSONS #45). |
| `miss-roster-plan` (Code) › `jsCode` | §V3: mirrors the rev-3 LANE (lockstep comment) + tool/lane lookup; stamps `team: lane.team` and `members: lane.members === true` on every real plan item (fail-closed: unknown lane ⇒ `members:false`, `team:null`); the `_miss_plan_empty` sentinel gains `team:null, members:false` (a sentinel must never fetch a roster). Stale "order turn" header fixed (F-R3-2). Derivation otherwise byte-identical. |
| `miss-members-gate` (**NEW** If 2.3, id `miss-members-gate-node`, pos [9472,2704]) | §V2 option (a): single condition `={{ $json.members === true }}` (boolean/true, loose, v2 — no forbidden sandbox token). TRUE → `get-cs-members-miss` (orders chain unchanged); FALSE → `build-miss-member-offer` directly (plain lanes + sentinel — the sentinel's stray roster read is gone). A plan item MISSING the flag routes FALSE (fail-closed). |
| `get-cs-members-miss` | **byte-identical** (now reached only via `miss-members-gate` TRUE = orders). |
| `build-miss-member-offer` (Code) › `jsCode` | §V3: NEW plain arm ABOVE the roster parsing — every non-sentinel plan item `members === false` ⇒ `[{ json: { ...env, miss_plain_offer: true, miss_roster_plan: [{plan_idx, company_id, company_name, brand_code, team}] } }]`, NO `miss_member_offer`/`miss_member_rows`/`miss_offer_text` (pool = ALL miss companies; no intersection — no roster shown). Zero non-sentinel items or a MISSING flag ⇒ existing roster parse yields [] ⇒ envelope passthrough (fail-closed). Members-arm CODE untouched; its only output delta is the stamped `team`/`members` keys riding inside the transient `miss_roster_plan` envelope key (ccs's mapping strips them before persisting — unit-proven identical persisted plan + identical picker text vs the PRE body). Stale header fixed (F-R3-2). |
| `compile-current-state` (Code) › `jsCode` | §V3: `_mcPlainPlan` const + THIRD arm after the rows arm (`else if (_mcPlainPlan.length && !_ideate && !_sug && !_mem && !_dymLastResultSet && non-empty user_response)`): appends the FROZEN phrase ONLY (`Would you like me to escalate to *<Co>* <team> team?` on single-miss; plain phrase on multi; team from the plan/lane with qf fallback — gate-enforced lockstep) to `user_response` AND persisted `variables.response` (parser prefix-regex contract); persists `routing_roster_plan` (mapped w/o team — same shape as the rows arm) + `routing_company`/`routing_brand` (single pair on 1 miss, nulls on >1). **NO `last_result_set` extension, NO `selection_context` change** (Δ3 stays closed). Rows (members) arm byte-identical to rev-2. |
| `clarify-company-reply` + `offer-hold-reply` (ONE body, BOTH nodes) › `jsCode` | §V3 / F-R3-1 option (c): copy branch on `prev.selection_context` — `'member_offer'` ⇒ rev-4 copy byte-identical (`… — reply a number, a name, or the company (X / Y) and I'll assign automatically.`); ELSE (no picker shown: plain-offer both-miss, not-found both-miss) ⇒ `${lead} — reply with the company (${list}) and I'll assign automatically.`. `offer-hold-gate` only fires with `selection_context === 'member_offer'` ⇒ `offer-hold-reply` always takes the member branch (no behaviour change there). |
| `cs-offer-gate` (If 2.3) › `conditions` | **REVERTED to the round-2/live 3-condition shape** — byte-exact copy of `PRE-9qVyfUxmRQqrpGRMDLRuz-7aba1447.json`'s node params (g1 boolean `is_escalate_offer` · g2 `suggested_team == 'customer_service'` · g3 `suggested_agent == 'order_enquiries'`). D3=b undone: incoming/stock NOT-FOUND turns return to the pre-round-3 plain phrase (no picker); CS/order keeps its picker. Conditions json `391a31c8` → **`ce99a16c`** (== live active/draft). |
| everything else | byte-identical: `build-cs-member-offer` `63c1c46e` KEPT (F-R3-5 team note; purchasing note now unreachable, orders output proven identical), `escalation-context` `cca7a245`, `clarify-company-gate` `63e30a3d`, `offer-hold-gate` `8f14a430`, `escalate-catalog` `0168df84`, `tag-offer-hold`, HI, sendmsg, parser fork `c7d9cfa2` (`a68c5992`/`138008c2`). |

### round-3 rev-3 sha256 table (byte-exact; every `after` re-fetched from the published clone `7db593b0` and compared `==` to the repo file)

| body | before (`e54e114e`) | after (rev-3, `7db593b0`) | repo file |
|---|---|---|---|
| `miss-roster-gate.conditions[0].leftValue` | `d24dd81b…` | **`92ca1ccc…`** | `spine-miss-roster-gate.expr.txt` |
| `miss-roster-plan.jsCode` | `0b7907d6…` | **`c4a19b6f…`** | `spine-miss-roster-plan.js` |
| `miss-members-gate.conditions[0].leftValue` | — (node NEW) | **`14576e69…`** | `spine-miss-members-gate.expr.txt` (NEW) |
| `build-miss-member-offer.jsCode` | `68eef4c7…` | **`fab11982…`** | `spine-build-miss-member-offer.js` |
| `compile-current-state.jsCode` | `5a84dfea…` | **`6bff997d…`** | `spine-compile-current-state.js` |
| `clarify-company-reply.jsCode` == `offer-hold-reply.jsCode` | `7ff06aa8…` | **`377c2df4…`** | `spine-clarify-company-reply.js` (ONE file, both nodes byte-equal on the POST fetch) |
| `cs-offer-gate.conditions[1].leftValue` (g2) | `cfa8c18e…` (IIFE) | **`fafa8b77…`** (reverted plain member expr) | `spine-cs-offer-gate.expr.txt` |
| `cs-offer-gate.conditions` (jq -cj json) | `391a31c8…` | **`ce99a16c…`** (== live active `7aba1447` == clone `0557b0b4` PRE) | — |
| parser fork `output_exchange` / systemMessage | `a68c5992…` / `138008c2…` | **unchanged** (fork not edited) | parser-fork-* |

Forbidden-token grep (`prototype|constructor|__proto__`) over `diffs/miss-company-routing/*.expr.txt` (now FIVE files incl.
`spine-miss-members-gate.expr.txt` and the reverted `spine-cs-offer-gate.expr.txt`): **0 hits**. Clone-wide POST sweep: NO non-Code
node's parameters contain the tokens.

### Units

`tests/unit/miss-company-routing-round3.gates.test.js` — **85 passed, 0 failed**: gate (i)–(viii) re-based on the rev-3 LANE ((iii) flipped:
stock ⇒ TRUE, + lockstep/domain negatives (iii-b/c)); cs-offer-gate section REWRITTEN for the revert (repo file == live g2 `fafa8b77`;
3-condition truth table: CS/order TRUE, purchasing/incoming FALSE, warehouse FALSE, cross-pair FALSE, g1 ANDed); NEW: `miss-members-gate`
expr (true/false/missing/'true'-string/sentinel ⇒ fail-closed), LANE lockstep byte-equality + flag census (2×true/4×false),
`miss-roster-plan` runs (orders/incoming/stock/both-miss/sentinel/non-LANE ⇒ members+team stamping, fail-closed), bmmo plain arm
(single/multi/sentinel-passthrough/missing-flag-passthrough) + members-arm regression vs the PRE body (identical modulo stamped plan keys;
ccs-persisted plan identical), ccs plain arm (single bold + lane team, multi plain + nulled pair, warehouse phrase, team fallback,
empty-response silent, passthrough turn byte-identical NEW vs PRE, MEMBERS mode byte-identical NEW vs PRE), clarify copy branches
(member byte-identical / plain company-only / non-member context / routing_companies fallback). Other suites unchanged and green:
`miss-company-routing-rev4.spine.test.js` **33/33**, `miss-company-routing-rev4.output_exchange.test.js` **48/48**, delta1/2/3 GREEN.

### Smoke (coder, ONE clone exec — LESSONS #45; the tester owns the full Q1–Q9/S set)

`zz-canary-run` 12930297 → clone **12930298** `success` on `7db593b0`, item = the R-M1 shape (`any order for MUB6201`, uac mode, order/CS
mock, real CRM read): `tool-filter` `crm_order_management_orders_list`; **`miss-roster-gate` TRUE (1 item, no error — new leftValue evaluates
in the real sandbox)**; **`miss-members-gate` (NEW If) success, TRUE 1/FALSE 0**; `miss-roster-plan` item `{Sorento, brand mocha,
team customer_service, members:true}`; `get-cs-members-miss` + `build-miss-member-offer` ran (members arm, 6 rows, NO `miss_plain_offer`);
sent text == the M1r3 picker byte-shape (phrase `…*Sorento* customer_service team?`, members 3–8, yes-sentence); persisted
`selection_context member_offer`, 1-row plan, Sorento/mocha pair, 8-row `last_result_set`. Egress: sendmsg fork sub-exec 12930309 took the
GUARD path only (`would_send` 437264483); no orphaned egress node executed, HI not called, prod redis lists LLEN 0, prod sink empty.
Evidence: `tests/runs/miss-company-routing-round3rev3-SMOKE-20260818.json`. (NOTE for the tester: `zz-canary-read LLIbMXAixexM9Cwc` has NO
published version — production execute refused; republish it or read `test:egress:{id}` directly.)

### Promote implication (§V7 refresh)

Vs the staged R10/R11 payload: `cs-offer-gate` **DROPS from the payload** (reverted == live `ce99a16c`) ⇒ changed 5 → **4**; new nodes
9 → **10** (+`miss-members-gate`), with NEW shas inside them for `miss-roster-gate` (`92ca1ccc`), `miss-roster-plan` (`c4a19b6f`),
`build-miss-member-offer` (`fab11982`), `clarify-company-reply`/`offer-hold-reply` (`377c2df4`); `compile-current-state`'s payload body must
be re-derived on the R10 F6 live-based body with the rev-3 plain arm. Connection keys 11 → **12** (`miss-roster-plan` retargets;
+`miss-members-gate`). Sweep expectation: **4 changed + 10 new + 12 connection keys, 137 nodes, 0 dropped, 0 non-param diffs.** Parser
payload unchanged. STAGED payload NOT yet refreshed to rev-3 (R11 delta rows 1/3/4 re-measure owed); still captain-gated, with the D2'
captain-confirm line (promotions/master-products/attachments/certificates STAY OUT of the LANE without an explicit order).
