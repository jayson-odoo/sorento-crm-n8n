# Node-diff — `brand-company-routing` (n8n half) · coder pass 2026-08-17

Plan: `plans/brand-company-routing-plan.md` · UAC: `tests/brand-company-routing-UAC.md` · Branch `fm/brand-routing-n8n`.
Targets edited (ONLY these): spine clone `txiPzSxy3Pclsz6v`, HI fork `vUfFUDjLAuMaeQE6`, parser fork `wI5RkNGW3EOJfBdo`,
replay orchestrator `aROEBlQyyoQaB7a1` (norm() rule only). **Live `9qVyfUxmRQqrpGRMDLRuz`, `rrYXzE61…`, `XTODTw…` untouched**
(read-only dumps only; live spine versionId `d6f6b90c-…` / live parser `9df39ff6-…` unchanged).

Byte-exact copies of every published Code body / systemMessage: `tests/diffs/brand-company-routing/*` (sha-verified against a
post-edit `get_workflow_details` re-fetch — see sha table). Pre-edit backups: `tests/backups/brand-company-routing/<workflow>/`
(`VERSION.json` = pre-edit versionId/activeVersionId; `LIVE-*` = the live bodies used as rebase sources).

## 0. Prereq findings

- Clone has **no Schedule Trigger** (only `When Executed by Another Workflow`) — nothing to disable; the shared prod
  `main-message-list` cannot be consumed by editing it.
- All four targets had `versionId == activeVersionId` before editing (no stale-draft landmine, Lesson 24) — except the replay
  orchestrator which is a manual-trigger workflow with `activeVersionId: null` (never published; left unpublished, as before).
- `validate_workflow` on THIS MCP server validates SDK *code*, not a workflow id; the equivalent gate is the validation
  `update_workflow` runs on every atomic save (reported below). All warnings are the pre-existing set from LESSONS #13
  (orphaned egress nodes, `builtInTools`, transcribe expression prefix; parser fork: `Postgres Chat Memory` disconnected).
- Zero-egress wiring untouched: the 5 orphaned egress nodes stay 0-inbound; every shared-sub call still passes `is_test=true`;
  the HI fork `test-guard[0] → test-guard-record` path is intact and the spine still calls the fork (`vUfFUDjLAuMaeQE6`).
  Live spine passes **no** `is_test` to its HI sub (verified) — the guard stays prod-safe.
- Live `disallowed-entity-gate` (rebase source) references `$('tier-gate')` inside try/catch; the clone has no `tier-gate`
  node → the catch fires → legacy `Aggregate` branch runs. Rebase is safe on the clone.

## 1. Spine clone `txiPzSxy3Pclsz6v` (before `35dcfd40-561b-46de-b86b-ecf6fa32a4a8` → published `ac51a12e-1493-4bc8-82a1-8beef6065dd8` → **rev-2 published `e816e2da-f39b-47fb-a486-83c9a470fbf6`**, see §1a)

Two `update_workflow` calls (16 ops + 1 op), then `publish_workflow`. Node-set diff vs pre-edit dump: changed =
`disallowed-entity-gate, get-cs-members, build-cs-member-offer, compile-current-state, Call 'sub-human-intervention'`;
added = `cs-roster-plan, escalation-context`; removed = none; connections changed = `cs-offer-gate, cs-roster-plan,
divert-suggest-yes, escalation-context`. Nothing else moved.

| node (clone id) | change | ops |
|---|---|---|
| `disallowed-entity-gate` (`b07ca5db-…`) §3.1 | **Rebase** jsCode → live body (`5928ae64-…`), then append the routing-axes hunk inside the `#9` block right after `out.resolved_companies = _brands;`. Emits `routing_brand`, `routing_brand_source` (`resolved|stated|access_level|null`), `routing_companies[{company_id,company_name,brand_code,codes}]` (sorted by company_name), `routing_company` (id iff exactly one). | `setNodeParameter /jsCode` |
| `cs-roster-plan` (NEW, `9ac0159b-ff73-4b0c-9b63-fc4870bd3d2c`, code v2, pos [11520,2112]) §3.2 | One item per `routing_companies` entry (`plan_idx, company_id, company_name, brand_code, codes, multi_company, companies`); when the gate did not run / no companies → ONE fallback item with null company/brand (today's single call). | `addNode`; `removeConnection cs-offer-gate[0]→get-cs-members`; `addConnection cs-offer-gate[0]→cs-roster-plan`; `addConnection cs-roster-plan→get-cs-members` |
| `get-cs-members` (`get-cs-members-node`) §3.3 | `url` += `{{ $json.brand_code ? '&brand_code=' + encodeURIComponent($json.brand_code) : '' }}{{ $json.company_id ? '&company_id=' + encodeURIComponent($json.company_id) : '' }}` (agent/team/tier/contact_id part byte-identical); `options.response.response.fullResponse=true` (1 output item per input item, roster under `.body`); node setting `onError: continueRegularOutput`. Credentials NOT touched (still `httpHeaderAuth`). | `setNodeParameter /url`; `updateNodeParameters {options:{response:{response:{fullResponse:true}}}}` (deep-merge); `setNodeSettings {onError}` |
| `build-cs-member-offer` (`build-cs-member-offer-node`) §3.4 | Whole body replaced. Reads `plan=$('cs-roster-plan').all()`, `resp=$('get-cs-members').all()`; roster_i = `resp[i].body` (tolerates legacy `json=array` / split-per-member shapes; an `error` item ⇒ `[]`); filters `user_id && respond_user_id`; stamps `company_id/company_name/brand_code` from plan[i]; dedupes by `user_id` across companies (first wins, `companies[]` collects all). `members.length===0` ⇒ unchanged fallback (`member_offer=false`, `cs_last_result_set=[]`). Single company ⇒ text **byte-identical** to today. Multi ⇒ `Note: <codes> is carried by more than one company (<A> and <B>), so I am listing the customer-service team members from both — that is why there are more names than usual. Please choose who to route to (reply with the number):` + `A:` / `n. Name (A)` groups (continuous numbering) + `[ C: no customer-service members are configured — omitted. ]` for an empty company + `If you have no preference, just reply 'yes' and we'll assign automatically.` `cs_last_result_set[]` rows += `company_id, company_name, brand_code` (null on the fallback item). `out.routing_companies = plan` (evidence). | `setNodeParameter /jsCode` |
| `compile-current-state` (`7a130a0c-…`) §3.5 | Additive hunk inserted between `if (_dymLastResultSet) …` and `return output;` (anchor present exactly once on clone AND live): persists `variables.routing_brand / routing_brand_source / routing_company / routing_companies` — fresh from the gate when it resolved ≥1 company, else carried from prior state ONLY when `prev.routing.suggested_team === qf.routing.suggested_team`, else null. Keys always present (null-inert for replay norm). | `setNodeParameter /jsCode` |
| `escalation-context` (NEW, `f014f4d5-074d-474b-a521-b26e27153689`, code v2, pos [12304,4144]) §3.6 | Spreads the incoming item and adds `brand_code, company_id, company_name, routing_source (picked_member|prior_state|multi_company_unpicked|prior_state_no_company|stated_brand|none), team`. Sources: picked member row in `prev.last_result_set` (by `preferred_assignee_id`) → same-team prior state → stated `query_brands[0]`. | `addNode`; `removeConnection divert-suggest-yes[1]→Call 'sub-human-intervention'`; `addConnection divert-suggest-yes[1]→escalation-context`; `addConnection escalation-context→Call 'sub-human-intervention'` (`divert-suggest-yes[1]→tag-out-of-scope` kept) |
| `Call 'sub-human-intervention'` (`133fcc06-…`) §3.7 | `workflowInputs.value.brand_code = ={{ $('escalation-context').first().json.brand_code || '' }}`, `.company_id = ={{ … .company_id || '' }}`; `workflowInputs.schema` += `{id:'brand_code',type:'string',removed:false}`, `{id:'company_id',…}` (12 existing entries unchanged). Still targets the fork `vUfFUDjLAuMaeQE6`, still `is_test: true`. | `setNodeParameter /workflowInputs/value/brand_code`, `…/company_id`, `…/schema` |

Validation (from `update_workflow`): only the pre-existing LESSONS #13 warnings (DISCONNECTED_NODE ×9 orphaned nodes,
`Transcribe a recording` expression prefix, OpenAI `builtInTools`). No errors.


### 1a. rev-2 patch (planner, after UAC B3) — `escalation-context` only

UAC B3 showed the picked-member arm fell back to `prev.routing_brand` when the picked row's `brand_code` was null, so a Mocha
member picked from a roster fetched WITHOUT brand was sent with `brand_code=mocha` — a different pool than the roster call
(plan §3.6 rev-2 pool-identity rule). Fix (one line + comment header), spine clone only, live untouched:

```js
brand_code = ('brand_code' in row) ? (row.brand_code || null) : ((sameTeam ? prev.routing_brand : null) || null);
```
(the fallback now applies only to a legacy row that predates this change and has no `brand_code` key.)

- op: `setNodeParameter escalation-context /jsCode` (byte-exact), then `publish_workflow` → **versionId/activeVersionId
  `e816e2da-f39b-47fb-a486-83c9a470fbf6`** (was `ac51a12e-…`). Re-fetch node-set diff: only `escalation-context` changed;
  connections identical. Validation: same pre-existing LESSONS #13 warnings, no errors.
- sha256 `escalation-context.jsCode`: rev-1 `d8196aa2dc47d4f5ccd31f57bf0fd33de9df3d3dbc8a4b377d4f17db55daf63f` →
  rev-2 `ce8c6417bd5bda0d1652af32d44fb2b70dd7572b11da6f5847d41f58cb5c947d` (re-fetched body == intended).
  `diffs/brand-company-routing/spine-escalation-context.js` updated to the rev-2 body.

## 2. HI fork `vUfFUDjLAuMaeQE6` (before `3186d960-2c39-4bfd-a3b1-9e8d4d5e0295` → published **`d2b82e80-8f22-437d-bf33-3781c505cd5f`**) §3.8

One `update_workflow` (5 `setNodeParameter` ops), 0 warnings, then `publish_workflow`. Full before/after param bodies:
`backups/…/hi-fork-vUfFUDjLAuMaeQE6/nodes-before.json` · `diffs/brand-company-routing/hi-fork-nodes-after.json`.

| node (id) | path | change |
|---|---|---|
| `When Executed by Another Workflow` (`9c94bf98-…`) | `/workflowInputs/values` | += `{name:'brand_code'}`, `{name:'company_id'}` (13 existing kept) |
| `get-round-robin-assignee` (`89103c96-…`) | `/jsonBody` | += `"brand_code": {{ JSON.stringify(…json.brand_code || null) }}, "company_id": {{ JSON.stringify(…json.company_id || null) }}` (`"tier": 1` now followed by a comma) |
| `conversation-sla-tracking-create` (`06ae4997-…`) | `/jsonBody` | `team_set_code` → `{{ JSON.stringify($('get-round-robin-assignee').item.json.team_set_code ?? (…json.team ?? '')) }}`; += `brand_code` / `company_id` (`get-round-robin-assignee` echo `??` trigger input `|| null`). URL kept (`…/integration`) |
| `test-guard-record` (`afe432e5-…`) | `/messageData` | payload += `"brand_code": …, "company_id": …` (egress log proves the inputs) |
| `chat-escalation-push` (`3450bc46-…`) | `/messageData` | JSON += `brand_code, company_id` |

Guard topology unchanged: `chat? → test-guard[0] → test-guard-record` (is_test=true) / `test-guard[1] → real path`.

## 3. Parser fork `wI5RkNGW3EOJfBdo` (before `013a16be-8e76-4b0e-9de1-38dc2f5aa02f` → published **`7b4baaa8-5cb5-460e-b2f4-94a562dcc54f`**) §3.9

Two `update_workflow` calls (1 op each), then `publish_workflow`. Node-set diff: only `output_exchange` + `AI Agent` changed.
`test-reformulator-bypass` / `mock-reformulator-output` untouched.

- `output_exchange` (`847a1173-…`): **rebased** to the live `XTODTw` body (sha `67a73561…`) then 3 edits: (1) `deriveRouting`
  `case 'promotion'` → `suggested_team: 'marketing_promotion'` (the `brand` computation above it is left in place, now unused
  by the switch); (2) immediately after `output.output.routing = { suggested_team, suggested_agent };` a normaliser
  `/^marketing_promotion_(sorento|cabana|mocha)$/ → 'marketing_promotion'` (covers LLM legacy memory AND a prior-state carry);
  (3) the same one-line normaliser on the Δ3 member-pick **retarget arm** (`output.output.routing = { suggested_team: _llmTeamN … }`)
  — a request_for_help naming a legacy suffixed team would otherwise bypass (2).
- `AI Agent` `options.systemMessage`: fork body was already byte-identical to live (sha `0555a9e8…`); lines 364–365 → `team
  "marketing_promotion"` + `(ONE promotion team for every brand. Do NOT suffix the team with a brand; the brand in context
  (access_levels or the message) is carried separately as a brand entity / query_brands.)`; enum line 478 →
  `…|warehouse|marketing_promotion`. No other occurrence of `marketing_promotion_` remains in the prompt.
- Noted, NOT changed (out of scope): fork `suggest-follow-up` differs from live (live has a unicode-dash normaliser block);
  live spine `disallowed-entity-gate` #9 still builds `company_team = marketing_promotion_<brand>` for offer text (cosmetic).

## 4. Replay orchestrator `aROEBlQyyoQaB7a1` › `Diff` (draft `6d89d532-…` → `d52af206-8d1d-435a-b6a6-e515140416a4`, unpublished as before) §3.10

One `setNodeParameter /jsCode`. Exact rule inserted in `norm()` right after the `_parser_raw` line:

```js
if ((k === 'routing_brand' || k === 'routing_brand_source' || k === 'routing_company' || k === 'routing_companies' || k === 'company_id' || k === 'company_name' || k === 'brand_code') && (v[k] === null || v[k] === undefined)) continue; // brand-company-routing (LESSON 40): additive routing-axis keys on compile-current-state (routing_*) and cs_last_result_set rows (company_id/company_name/brand_code) — ignore-when-null on BOTH sides, retain (surface) when non-null. Not a blanket ignore (LESSON 21).
```
(Pre-existing warning `Get Exec Id … executionId undefined` unrelated.)

## 5. sha256 table (byte-exact, `jq -j`; verified by re-fetching each workflow after the edit)

| body | before (pre-edit) | live source (rebase) | after (published) |
|---|---|---|---|
| spine `disallowed-entity-gate.jsCode` | `5f92319f…abfb3f` | `8e1b5470…9b76b` (live `5928ae64-…`) | `f56756bf…0421f` |
| spine `build-cs-member-offer.jsCode` | `bd3a2b24…f1cb4` (== live) | — | `4069afe5…66061` |
| spine `compile-current-state.jsCode` | `97d2f6a2…00925` (live is `3fa9d170…98249`; hunk anchor present once in both) | — | `60dc1540…6400a` |
| spine `cs-roster-plan.jsCode` (new) | — | — | `ad6ff798…286c1` |
| spine `escalation-context.jsCode` (new) | — | — | rev-1 `d8196aa2…af63f` → **rev-2 `ce8c6417…c947d`** |
| parser fork `output_exchange.jsCode` | `41996074…9453f` | `67a73561…e2017` (live `XTODTw`) | `3ee5b658…7eed` |
| parser fork `AI Agent.systemMessage` | `0555a9e8…19246` | `0555a9e8…19246` (identical) | `583bcfb0…45f37` |
| replay `Diff.jsCode` | `4e9b8c45…efc8b` | — | `893fddd8…855d` |

Full hashes: `sha256sum tests/backups/brand-company-routing/*/* tests/diffs/brand-company-routing/*`.

## 6. Deviations from the plan (with reason)

1. §3.1 `routing_companies[].brand_code`: plan text inherits the global `routing_brand` for any company whose own rows carry no
   brand; the UAC (B2) requires the Mocha entry `brand_code:null` while Sorento carries `mocha`. Implemented: a company's own
   unambiguous row brand, else the global `routing_brand` **only when there is a single company**; multi-company entries never
   borrow another company's brand. Single-company behaviour is identical to the plan text.
2. §3.4 member label on a member present in >1 company (deduped): `(A / B)` (all companies, A3) instead of only the first company.
   Ordinary members render `(<company_name>)` exactly as specified.
3. §3.9 normaliser applied at two sites (post-derive AND the retarget arm) — the second is additive safety, same regex.
4. Legacy-shape tolerance kept in bcmo (`json=array` and split-per-member) so a rollback of `fullResponse` cannot crash it.

## 7. Promote mapping (captain-gated; NOT executed) — see plan §6

Order: parser fork → live `XTODTw-dJcV0uRdC056hG` (`output_exchange` jsCode := `diffs/…/parser-fork-output_exchange.js` sha
`3ee5b658…`; `AI Agent` systemMessage := `parser-fork-AI-Agent.systemMessage.txt` sha `583bcfb0…`; both are live-body + the
3/2 hunks above, so no rebase needed) → HI fork → live `rrYXzE61gCNUck_zmXe-G` (the 5 param edits of §2, keep live's tracking URL;
the live sub has no `chat?`/`test-guard` nodes — apply only the trigger values, `get-round-robin-assignee`,
`conversation-sla-tracking-create`) → spine `9qVyfUxmRQqrpGRMDLRuz`: `disallowed-entity-gate` (`5928ae64-…`) := the same appended
hunk on the live body (= `spine-disallowed-entity-gate.js`, already live-based); `cs-roster-plan` + `escalation-context` net-new
Code nodes with the 2 rewires (`cs-offer-gate`(`18e0a370-…`)[0] → cs-roster-plan → `get-cs-members`(`ff5f651e-…`);
`divert-suggest-yes`(`173d3b9f-…`)[1] → escalation-context → `Call 'sub-human-intervention'`(`726da5dc-…`), keep
`divert-suggest-yes[1] → tag-out-of-scope`(`46b32e52-…`)); `get-cs-members` url + fullResponse + onError; `build-cs-member-offer`
(`af5ae5d4-…`) whole body := `spine-build-cs-member-offer.js`; `compile-current-state` (`0804657c-…`) := live body + the §3.5
hunk before `return output;` (anchor verified once in live); `Call 'sub-human-intervention'` (`726da5dc-…`) += the 2 inputs +
schema (live has no `is_test`/`test_run_id`/`input_message` inputs — add only `brand_code`/`company_id`); replay norm already
applied (shared orchestrator). Backup-first, sha-verify draft before publish + active after, auto-revert (Lessons 24/25).
