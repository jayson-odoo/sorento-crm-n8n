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
