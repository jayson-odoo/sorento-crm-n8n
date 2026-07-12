# Promotion pre-flight — 2026-07-06 (READ-ONLY)

Scope: back up the two live promote targets, resolve the 09:12Z live-spine mystery, capture the live If2 fan-out, and produce an exact guard-stripped promotion patch + go/no-go. **NO workflow was edited/updated/published.** All findings are from `get_workflow_details` (MCP) reads + local backup file diffs.

**Verdict: GO** (no collision; fork has not drifted; promotion patch below is business-logic only).

---

## 1. Backups written

| target | file | activeVersionId | nodes | updatedAt |
|---|---|---|---|---|
| live sub `XTODTw-dJcV0uRdC056hG` (`sub-semantic-parser`) | `n8n-workflows-init/tests/backups/live-sub-XTODTw-0a931adb-20260706.json` | `0a931adb-d5e8-4914-bca7-15e1e6201957` | 8 | 2026-07-05T14:45:26Z |
| live spine `9qVyfUxmRQqrpGRMDLRuz` (`sorento-consume-main`) | `n8n-workflows-init/tests/backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-540c4b66-20260706.json` | `540c4b66-a5f1-4a9f-bace-1e84c7159f4e` | 80 | 2026-07-06T09:12:01Z |

Both live targets have `versionId == activeVersionId` (no stale draft — safe baseline). Sources of truth for this preflight:
- fork `CpxE8LroLzCkrAQN` @ `e10c539e` (8 nodes) — batch-1 source.
- clone spine `txiPzSxy3Pclsz6v` @ `0369e6bd` (105 nodes) — batch-1 + batch-2 source.
- pre-09:12Z live-spine baseline for the mystery diff: `n8n-workflows-init/backups/live-spine-20260705-replyto-save2.json` @ `802bf1d9` (2026-07-05T06:19:57Z, 80 nodes).

---

## 2. The 09:12Z mystery — RESOLVED, NO COLLISION

Live spine `updatedAt = 2026-07-06T09:12:01.747Z`. Diffing live-now (`540c4b66`) against the last saved pre-09:12Z baseline (`802bf1d9`, 07-05): **0 node add/remove, 0 connection changes, 5 nodes changed in params:**

- `Call 'sub-get-results'`
- `Call 'sub-respond-save-message-redis'2`
- **`build-suggest-offer`**  ← one of our batch-2 targets (collision candidate)
- `get-cs-members`
- `not-found-error-message`

**What the 09:12Z change actually is:** a **"UUID-leak guard"** feature in `build-suggest-offer` — adds `isUuid()`/`humanLabel()` helpers and numbered-mode rendering for uuid-coded (promotion) did-you-mean / alternative candidates so a raw promo uuid is never sent to the customer. (The other 4 nodes carry accompanying edits to the same suggest/escalate/not-found rendering family; none are in our promotion set.)

**Collision verdict on `build-suggest-offer` — NONE.** The clone was rebased on a live that **already contained** the UUID-leak guard. Three-way diff:
- base(0705) → live-now  = the UUID-leak guard (the 09:12Z change).
- base(0705) → clone     = the UUID-leak guard **plus** our `isCsOrder` date-trim hunk.
- **live-now `build-suggest-offer` → clone `build-suggest-offer` = ONLY our intended trim hunk** (a single 1-line → 4-line replacement at the D2 non-uuid `out.suggest_quick_reply` assignment). Nothing else differs.

So our batch-2 trim sits cleanly on top of the 09:12Z live baseline. The other 4 nodes changed at 09:12Z (`sub-get-results`, `save-message-redis'2`, `get-cs-members`, `not-found-error-message`) are **outside** our promotion set (we touch If2/build-suggest-offer/escalate-catalog/If9/If10 region + 3 new nodes) and are **not referenced by any of our 3 new nodes' expressions** (verified). No collision anywhere.

`escalate-catalog` (batch-1 target) was **not** among the 5 nodes changed at 09:12Z → live's `escalate-catalog` still equals the 07-05 baseline; the clone adds only the `escalation_declined` case (plus a cosmetic line-1 divider-length difference). Clean.

---

## 3. Live If2 fan-out (current truth)

`If2` (live id `3f7aef05-aa73-4758-9f16-69dab093958f`):
- **`main[0]` TRUE →** exactly **two** targets: `Call 'sub-human-intervention'` (id `726da5dc`) **and** `tag-out-of-scope` (id `46b32e52`).
- `main[1]` FALSE → `If10` (id `6b16d76c`).

This matches the clone's documented pre-rewire fan-out. The `divert-suggest-yes` FALSE branch must restore **both** of these. Also confirmed on live: `If10` TRUE→`tag-escalate-offer`, `If10` FALSE→`If9`; `If10`'s only inbound is `If2`, `If9`'s only inbound is `If10`. The downstream member-offer reuse path exists on live: `tag-escalate-offer → escalate-catalog → cs-offer-gate → [get-cs-members | compile-current-state]`, and `build-cs-member-offer` exists.

---

## 4. Guard-stripped promotion delta (per target)

### 4a. Live sub `XTODTw-dJcV0uRdC056hG` (batch-1 parser)

**Drift check: fork has NOT drifted from the live sub.** Both are the same 8-node set. The fork↔live-sub diff is a clean, coherent, business-logic-only delta:
- `AI Agent.systemMessage`: exactly **3 net hunks** vs live (L137 kill-skip, L140 broaden request_for_help to team/dept, L267 "always evaluate suggested_team"). The 4th documented edit (remove the L147 decline clause) was added-then-removed within the fork's own history, so it is a no-op vs live — expected, not drift.
- `output_exchange.jsCode`: exactly the batch-1 stack — hoisted single-source `_reqHelp`/`_llmTeamN` capture + string-`"null"` coercion of domain_hint/intent_hint via `norm()`, L411 decline guard `&& !_reqHelp`, Edit-1 routing-preference ternary, and the 4-tier member_offer gate (retarget / pick incl. `escalation_declined` decline arm / new-query-abandon / junk).
- **No test scaffolding** in either promoted node body (`grep -i is_test|mock|test_run|canary|regress` = none). The sub's other 6 nodes (including the test-mock `test-reformulator-bypass`/`mock-reformulator-output`) are **not** promoted; `suggest-follow-up` is byte-identical between live sub and fork (sha `b28dda66…`).

**Exact edit (byte-copy, sha-gated):** overwrite the live sub's two node bodies with the fork's:
| node | write | target sha256 (fork) | live-now sha256 (backup) |
|---|---|---|---|
| `AI Agent` › `parameters.options.systemMessage` | fork value | `d8bfbf4bf74d735ddd4db7ff20b86a068d06693072fdfded7f2e1eb7dcbaec91` | `cb813c675e5db897e13dffdc99be83b3bfecfd952dfaa0ba9df231ac3704e6fa` |
| `output_exchange` › `parameters.jsCode` | fork value | `f092f0e9074152b0f8e36054a41504b767261b68d79d6cecdbc17090846cef8b` | `b9c60033917cff950526910d5e280835e7ede0ba43911ab6b45516d75a02d9b3` |

Ship **both together** (interdependent: prompt makes the LLM emit request_for_help for a team-decline; the output_exchange hoist/guard lets it survive to the retarget arm). No connection/other-node change. Then `publish_workflow`. Post-publish, re-sha the two active leaves against the fork targets above.

### 4b. Live spine `9qVyfUxmRQqrpGRMDLRuz`

All existing referenced nodes share the **same names** on live and clone, and n8n connections are keyed by name, so every rewire maps directly. Live ids for reference: `If2`=`3f7aef05`, `If10`=`6b16d76c`, `If9`=`0e1f41ef`, `tag-escalate-offer`=`4b6d9ab7`, `tag-out-of-scope`=`46b32e52`, `Call 'sub-human-intervention'`=`726da5dc`, `escalate-catalog`=`7a9e9295`, `build-suggest-offer`=`7972abd8`. **None of the 3 new nodes exist on live** (confirmed) — they are pure adds.

**ADD 3 nodes** (reuse clone defs/ids or let n8n assign — ids are cosmetic since edges are by name; none reference `is_test`):
| node | type / v | key param |
|---|---|---|
| `is-escalation-declined` | `n8n-nodes-base.if` 2.3 | boolean-true, leftValue `={{ $('Call \'sub-query-reformulator\'').first().json.output.escalation?.escalation_declined === true }}` |
| `tag-escalation-declined` | `n8n-nodes-base.set` 3.4 | assignment `branch_kind = "escalation_declined"` (string) |
| `divert-suggest-yes` | `n8n-nodes-base.if` 2.3 | boolean-true IIFE: `is_escalation_confirmation===true && suggest_pick_context===true && suggested_team==='customer_service' && suggested_agent==='order_enquiries' && !preferred_assignee_id` (reads `$('Call 'sub-query-reformulator'').first().json.output`) |

Note: `divert-suggest-yes` depends on the parser emitting `suggest_pick_context`, which is produced by the sub's `suggest-follow-up` node — byte-identical on live sub and fork, so this is satisfiable on live independent of the 4a promotion.

**EDGE rewires** (express by node name):
1. Batch-1 decline branch:
   - remove `If10`[out1 FALSE] → `If9`
   - add `If10`[out1 FALSE] → `is-escalation-declined`
   - add `is-escalation-declined`[out0 TRUE] → `tag-escalation-declined`
   - add `is-escalation-declined`[out1 FALSE] → `If9`
   - add `tag-escalation-declined`[out0] → `escalate-catalog`
   - (`If10`[out0 TRUE] → `tag-escalate-offer` unchanged)
2. Batch-2 divert (on the If2-TRUE seam):
   - remove `If2`[out0 TRUE] → `Call 'sub-human-intervention'`
   - remove `If2`[out0 TRUE] → `tag-out-of-scope`
   - add `If2`[out0 TRUE] → `divert-suggest-yes`
   - add `divert-suggest-yes`[out0 TRUE] → `tag-escalate-offer`
   - add `divert-suggest-yes`[out1 FALSE] → `Call 'sub-human-intervention'`  **(restore live fan-out)**
   - add `divert-suggest-yes`[out1 FALSE] → `tag-out-of-scope`  **(restore live fan-out)**
   - (`If2`[out1 FALSE] → `If10` unchanged)

**PARAM edits** (business-logic only):
3. `escalate-catalog` › `parameters.jsCode`: insert the new switch case after the `out_of_scope` case:
   ```js
   case 'escalation_declined':
     response          = 'Escalation declined.';   // FIXED canned reply — no LLM shaping
     manualResponse    = true;
     includeResponse   = true;
     is_escalate_offer = false;                     // → cs-offer-gate FALSE → straight to compile-current-state
     break;
   ```
   (Recommend a **surgical case-insert** to preserve live's existing line-1 divider comment; the clone's full jsCode is identical except a cosmetic longer `──` divider on line 1.)
4. `build-suggest-offer` › `parameters.jsCode`: the single D2 non-uuid trim hunk — replace
   ```js
   out.suggest_quick_reply = [...values, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
   ```
   with
   ```js
   const isCsOrder = (q?.routing?.suggested_team === 'customer_service'
                   && q?.routing?.suggested_agent === 'order_enquiries');
   out.suggest_quick_reply = (axis === 'date' && isCsOrder ? [...values] : [...values, YES, NO])
     .map(s => String(s).replace(/,/g, '')).join(',');
   ```
   This is the ONLY delta between live-now and clone `build-suggest-offer` — the 09:12Z UUID-guard surrounding it is already on live. Byte-exact/sha-gate it. (Clone `build-suggest-offer` jsCode sha `f1558d5a…` per the coder diff; alternatively apply just this hunk.)

Then `publish_workflow`. None of the added nodes reference `is_test`/test scaffolding; the guards live inside the shared subs (unchanged). No egress/human-intervention/assign/SLA/PIC/CRM-write node is edited.

---

## 5. Go / No-go

**GO.** Blockers: none.

- Backups written for both live targets (§1); both are clean (versionId==activeVersionId).
- 09:12Z mystery = the `build-suggest-offer` UUID-leak-guard (+4 sibling render nodes), **already present in the clone baseline**; live-now↔clone `build-suggest-offer` differ by **only** our intended trim → **no collision** with any promotion node.
- Fork has **not drifted** from the live sub — the fork↔live-sub delta is exactly the intended batch-1 business logic (3 net prompt hunks + the output_exchange stack), no test scaffolding → the 4a byte-copy is the correct minimal patch (shas in §4a).
- Live If2-TRUE fans to exactly `Call 'sub-human-intervention'` + `tag-out-of-scope`; both restored on the divert-FALSE branch (§3/§4b).
- All existing referenced nodes exist on live by the same names; all 3 new nodes are pure adds; the downstream member-offer reuse path exists on live.

Promotion remains **user-gated**; apply §4 exactly, sha-verify each changed leaf before AND after publish, and keep the §1 backups for one-command revert (`publish_workflow` the prior versionId).
