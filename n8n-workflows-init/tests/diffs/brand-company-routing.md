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
| `disallowed-entity-gate` (`b07ca5db-…`) §3.1 | **Rebase** jsCode → live body (`5928ae64-…`), then append the routing-axes hunk inside the `#9` block right after `out.resolved_companies = _brands;`. Emits `routing_brand`, `routing_brand_source` (`resolved|stated|null` — the `access_level` guess was removed in rev-3, §1b), `routing_companies[{company_id,company_name,brand_code,codes}]` (sorted by company_name), `routing_company` (id iff exactly one). | `setNodeParameter /jsCode` |
| `cs-roster-plan` (NEW, `9ac0159b-ff73-4b0c-9b63-fc4870bd3d2c`, code v2, pos [11520,2112]) §3.2 | One item per `routing_companies` entry (`plan_idx, company_id, company_name, brand_code, codes, multi_company, companies`); when the gate did not run / no companies → ONE fallback item with null company/brand (today's single call). | `addNode`; `removeConnection cs-offer-gate[0]→get-cs-members`; `addConnection cs-offer-gate[0]→cs-roster-plan`; `addConnection cs-roster-plan→get-cs-members` |
| `get-cs-members` (`get-cs-members-node`) §3.3 | `url` += `{{ $json.brand_code ? '&brand_code=' + encodeURIComponent($json.brand_code) : '' }}{{ $json.company_id ? '&company_id=' + encodeURIComponent($json.company_id) : '' }}` (agent/team/tier/contact_id part byte-identical); `options.response.response.fullResponse=true` (1 output item per input item, roster under `.body`); node setting `onError: continueRegularOutput`. Credentials NOT touched (still `httpHeaderAuth`). | `setNodeParameter /url`; `updateNodeParameters {options:{response:{response:{fullResponse:true}}}}` (deep-merge); `setNodeSettings {onError}` |
| `build-cs-member-offer` (`build-cs-member-offer-node`) §3.4 | Whole body replaced. Reads `plan=$('cs-roster-plan').all()`, `resp=$('get-cs-members').all()`; roster_i = `resp[i].body` (tolerates legacy `json=array` / split-per-member shapes; an `error` item ⇒ `[]`); filters `user_id && respond_user_id`; stamps `company_id/company_name/brand_code` from plan[i]; dedupes by `user_id` across companies (first wins, `companies[]` collects all). `members.length===0` ⇒ unchanged fallback (`member_offer=false`, `cs_last_result_set=[]`). Single company ⇒ text **byte-identical** to today. Multi ⇒ `Note: <codes> is/are carried by more than one company (<A> and <B> / <A>, <B> and <C>), so I am listing the customer-service team members from each of them — that is why there are more names than usual. Please choose who to route to (reply with the number):` + `A:` / `n. Name (A)` groups (continuous numbering) + `[ C: no customer-service members are configured — omitted. ]` for an empty company + `If you have no preference, just reply 'yes' and we'll assign automatically.` `cs_last_result_set[]` rows += `company_id, company_name, brand_code` (null on the fallback item). `out.routing_companies = plan` (evidence). | `setNodeParameter /jsCode` |
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

### 1b. rev-3 patch (review round, captain-decided) — repo bodies only, **clone republish PENDING**

Review of the rev-2 branch surfaced three defects and one copy issue. The captain's decisions are applied to the **committed
bodies under `tests/diffs/brand-company-routing/`**, which are from here on the **reviewed source of truth** for the promote.
The spine clone `txiPzSxy3Pclsz6v` still runs the rev-2 bodies (`e816e2da-…`): **the clone republish of rev-3 and the
re-run of UAC B2/B3/B3rev2 against it are PENDING**, tracked in the promote/verify checklist (review §4 P3/P6). Until then the
§5 sha table and the tester rollup describe rev-2, not the files. No n8n instance was touched by this round; `tests/backups/`
untouched.

| # | body | change | why |
|---|---|---|---|
| 1 | `spine-escalation-context.js` | picked-member arm condition `if (row && row.company_id)` → `if (row)`, `company_id = row.company_id \|\| null` | The rev-2 pool-identity rule only fired when the picked row carried a company. A row from the `cs-roster-plan` fallback item (company null, brand stamped from `routing_brand`) fell into the `sameTeam` arm, where `qb \|\| prev.routing_brand` could send a *different* brand than the roster call used — the exact pool disagreement rev-2 was written to close. The row's own `brand_code` is now authoritative whenever the row matched. |
| 2 | `spine-disallowed-entity-gate.js` | `_acc` / `_accBrand` removed; `_qb` requires `query_brands.length === 1`; `routing_brand_source` loses `access_level` | Brand unknown stays unknown. The access-level list of a multi-brand contact was resolved by a fixed mocha>cabana>sorento order, so an unbranded product from a FULL-access contact was routed to an arbitrary brand pool — while the resolved-brand path deliberately returns null on ambiguity (D3). Same reasoning applied to a multi-entry `query_brands`. Company stays authoritative from resolve; a null brand makes the CRM use the company-bounded base pool. |
| 3 | `spine-build-cs-member-offer.js` | multi-company sentence: `from both` → `from each of them`; subject verb `${codes.length > 1 ? 'are' : 'is'}` | Customer-facing copy assumed exactly two companies / one code while `joinNames` and `codes.join` already render N. |
| — | `brand-company-routing-R1-20260817.json`, rollup, review F5 | R1 sample-replay assertion re-recorded `pass:false` / `status:deferred`; R1 verdict DEFERRED | The assertion was `pass:true` with `observed:"NOT RUN"`; AC8 is deferred to promote-time, not met. |

Docs updated with the same decisions: plan §3.1 (snippet + precedence note) / §3.4 (template) / §3.6 (snippet + widened
pool-identity rule) / A1, UAC B3 expectation, review §1/§3 F5 + promote checklist.

### 1c. rev-4 patch (second review round, captain-decided) — repo bodies only, **clone republish PENDING**

Rev-3 fixed pool identity for a PICKED member; the bare-"yes" arm still re-derived the brand, so the roster shown and the
pool `next-assignee` assigns from could still disagree. Rev-4 makes both arms share ONE definition of pool identity: the
roster plan that `get-cs-members` actually ran with is persisted and read back.

| # | body | change | why |
|---|---|---|---|
| 1 | `spine-compile-current-state.js` | new `variables.routing_roster_plan` — the `cs-roster-plan` items of this turn, trimmed to `{plan_idx, company_id, company_name, brand_code}`; carried under the same-team guard when the plan node did not run; null otherwise. Keyed on the plan node running, NOT on `_fresh` | the `(company_id, brand_code)` pairs the offered members were fetched with are now recorded state, not something each consumer re-derives |
| 2 | `spine-escalation-context.js` | unpicked (`sameTeam`) arm: exactly one persisted plan row ⇒ its pair VERBATIM (null stays null); >1 row ⇒ both axes null (`multi_company_unpicked`); no persisted plan ⇒ company from prior state, brand null. `qb \|\| prev.routing_brand` dropped from this arm. `qb` now requires `query_brands.length === 1` (plan A1) and is used only on the no-roster `stated_brand` arm. Picked arm unchanged from rev-3 | (a) after a multi-company offer the global `routing_brand` ('mocha', derived from the Sorento rows only) was sent while the Mocha roster was fetched unbranded — `next-assignee` could round-robin a pool that excludes offered members; (b) a brand stated on the confirmation turn re-narrowed a pool the roster call never used; (c) a stated-brand-but-zero-company gate turn persisted `routing_brand:null` while the roster HAD been fetched with `&brand_code=`, the mirror-image drift — all three close because both fetch and assign now read the same persisted plan |
| 3 | `spine-cs-roster-plan.js` | comment only: the plan items are the pool identity (persisted verbatim by ccs) | the fallback item's brand is now recorded rather than re-derived downstream — path (c) above |
| 4 | `replay-Diff.js` | `norm()` split in two: `routing_brand/_source/_company/_companies/_roster_plan` stay unscoped (new, unique names); `company_id/company_name/brand_code` are dropped-when-null ONLY inside a `variables` container (sibling `routing_*` key), a `cs_last_result_set` row (`idx`+`respond_user_id`) or a `routing_roster_plan` row (`plan_idx`) | tree-wide the rule masked a real null-vs-absent regression on resolve-entity / order / MCP payloads, which use those same generic names (Lesson 21) |

Same containment as §1b: **the clone still runs rev-2** — rev-3 and rev-4 exist only as committed bodies, the §5 sha table's
`after (published)` column is rev-2, and UAC B4/B5 expectations CHANGED in rev-4 (B5 brand is now null; the committed
`B5rev2` run JSON records the old rev-2 behaviour). Republish + re-test is P6 in the review checklist, a hard prerequisite
to the promote. No n8n instance touched; `tests/backups/` untouched.

### 1d. rev-5 patch (third review round, captain-decided) — `compile-current-state` only, **clone republish PENDING**

Rev-4 made `routing_roster_plan` the single definition of pool identity but recorded it too eagerly, in two ways. Both are
fixed in the one expression that produces the key; `escalation-context`, `cs-roster-plan` and `replay-Diff.js` are unchanged.

| # | change | why |
|---|---|---|
| 1 | carry-forward now requires `!_fresh` as well as `_sameTeam` | a turn that resolved a FRESH company set without re-fetching a roster (resolving order enquiry that never reaches `cs-offer-gate`) kept the previous plan while `routing_company`/`routing_companies`/`last_result_set` all moved on. Because the unpicked arm reads the plan BEFORE `routing_company`, the stale plan outranked the freshly resolved company — a Mocha enquiry would escalate to the Sorento CS team, the exact failure this change exists to prevent. Fresh resolve wins on every axis; the plan drops to null and the arm falls back to `routing_company` with brand unknown |
| 2 | the plan is intersected with the distinct `company_id`s in the roster actually shown (`build-cs-member-offer.cs_last_result_set`, ignored when `_ideate` overrode the reply) before being persisted | the plan recorded the calls MADE, not the companies that contributed members. With `onError: continueRegularOutput`, a two-company plan whose second roster returns empty renders an offer with one company's members plus the `[ B: … omitted. ]` line, yet persisted length 2 ⇒ the bare-"yes" turn took the multi-company arm and sent both axes null ⇒ `next-assignee` could assign from company B, whom the customer was never shown. Now it persists length 1 and replays that pair verbatim; a plan that yielded no members at all persists nothing |

New UAC cases for P6: **B5b** (degraded multi-company roster ⇒ single persisted pair) and **B5c** (fresh resolve
invalidates the carried plan). Same containment as §1b/§1c: repo bodies are the reviewed source, the clone still runs
rev-2, republish + re-test is P6. No n8n instance touched; `tests/backups/` untouched.

### 1e. rev-6 patch (fourth review round, captain-decided) — `build-cs-member-offer` + `compile-current-state`

Cross-company dedupe kept a shared member under the FIRST company only, but two consumers still asked "which company is
this member's" instead of "which companies returned this member".

| # | body | change | why |
|---|---|---|---|
| 1 | `spine-build-cs-member-offer.js` | deduped rows carry `company_ids:[…]` (every company whose roster returned them); the multi-company renderer groups by that membership and numbers each line with the member's own `cs_last_result_set` index; `cs_last_result_set` rows expose `company_ids` too | when company B's CS roster is entirely staff already listed under company A, grouping by the dedupe-winning `company_id` left B's group empty and printed `[ B: no customer-service members are configured — omitted. ]` two lines under `1. A (Mocha / Sorento)` — a false statement contradicted by the label above it. Now a shared member is listed under every company it belongs to, with ONE number (a reply of that number resolves the same uuid), and the omitted-line is reserved for companies that genuinely put nobody in the offer. With no shared staff the rendering is byte-identical to rev-5 |
| 2 | `spine-compile-current-state.js` | `_shownCos` is built from the rows' `company_ids` membership set (falling back to `company_id` on a legacy row) | the rev-5 intersection inherited the same blind spot: company B would be dropped from `routing_roster_plan`, so a shared-staff two-company offer persisted ONE pair and the bare "yes" sent it verbatim instead of taking the multi-company both-axes-null arm. Now both contributing companies are recorded |

Note for the replay diff: `cs_last_result_set` rows gain a non-null `company_ids` array, so member-offer turns surface as
diffs against golden — as they already do for every other new key on those turns (intended, Lesson 40). Same containment
as §1b–§1d: repo bodies are the reviewed source, the clone still runs rev-2, republish + re-test is P6.

### 1f. rev-7 patch (fifth review round, captain-decided) — `build-cs-member-offer` + `compile-current-state`

| # | body | change | why |
|---|---|---|---|
| 1 | `spine-compile-current-state.js` (Δ4 merge arm) | when the shown rows span >1 company (membership set), each picker line is rendered `${idx}. ${label} (${companies.join(' / ')})` and `build-cs-member-offer.cs_multi_note` is prepended | the merge arm (date-suggest AND member roster in the same reply) rebuilt the picker as bare `idx. label`, so on a two-company offer the customer saw 9 unlabelled names with no explanation — intent criterion (3) violated on that path while the non-merged path satisfied it. `idx`→`uuid` mapping untouched; single-company output byte-identical |
| 2 | `spine-build-cs-member-offer.js` | the multi-company sentence is built once into `multiNote`, exported as `out.cs_multi_note`, and `cs_last_result_set` rows gain `companies` (the label names) | one wording, one source: the merge arm reuses this string instead of inventing a second copy that could drift |
| 3 | `spine-compile-current-state.js` (roster plan) | carry-forward now also requires `_planItems === null` | the stated invariant is "a plan never outlives the roster it describes", but a same-team turn that DID fetch a roster and got nothing back (`onError` 404 degrade / no default CS members) left `_fresh` false and carried the previous plan, so the next bare "yes" replayed a `brand_code` from a superseded fetch. Whenever a fetch happened, the fetch-derived intersection is the answer — empty included |

Evidence bookkeeping in the same round: rollup marks B2/B3 `PASS — re-run pending P6` (their recorded reply literal is the
rev-2 copy and their row observations predate `company_ids`/`routing_roster_plan`), and R1 assertion 2 is re-recorded as an
observation rather than a pass — R1 now has no passing assertion, matching its DEFERRED verdict. Same containment as
§1b–§1e: repo bodies are the reviewed source, the clone still runs rev-2, republish + re-test is P6.

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
if ((k === 'routing_brand' || k === 'routing_brand_source' || k === 'routing_company' || k === 'routing_companies' || k === 'routing_roster_plan') && (v[k] === null || v[k] === undefined)) continue;
if ((k === 'company_id' || k === 'company_name' || k === 'brand_code') && (v[k] === null || v[k] === undefined) && (ROUTING_VARS.some(rk => rk in v) || ('idx' in v && 'respond_user_id' in v) || ('plan_idx' in v))) continue;
```
(rev-4 §1c item 4: the second line is container-scoped — `ROUTING_VARS` is the new module-level list of the five
`routing_*` names, so the predicate fires on the `variables` object, a `cs_last_result_set` member row or a
`routing_roster_plan` row and nowhere else.)
(Pre-existing warning `Get Exec Id … executionId undefined` unrelated.)

## 5. sha256 table (byte-exact, `jq -j`; verified by re-fetching each workflow after the edit) — **rev-2 state**

⚠️ The `after (published)` column describes what is published on the clone at rev-2. The rev-3 edits of §1b changed the repo
bodies of `spine-escalation-context.js`, `spine-disallowed-entity-gate.js` and `spine-build-cs-member-offer.js`, and the
rev-4 edits of §1c changed `spine-escalation-context.js`, `spine-compile-current-state.js`, `spine-cs-roster-plan.js` and
`replay-Diff.js`, the rev-5 edit of §1d changed `spine-compile-current-state.js` again, and the rev-6 edits of §1e changed
`spine-build-cs-member-offer.js` + `spine-compile-current-state.js`, and the rev-7 edits of §1f changed those same two
bodies again; their shas must be recomputed from the files (`sha256sum tests/diffs/brand-company-routing/*.js`) and
re-verified after the clone republish of rev-7.

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
