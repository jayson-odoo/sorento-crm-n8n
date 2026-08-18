# Promote record — miss-company-routing (rounds 2 + 3 + 4) → LIVE — **APPLIED 2026-08-18** (captain-authorized in chat)

> **Round-4 re-stage (captain: "all domain … if no record, then offer to escalate", + the uuid leak, 2026-08-18):**
> the miss-offer LANE now equals the CRM's full 11-function `stamp_lookup_companies` set (orders ×2 keep the member
> picker; promotions ×2, master products, product attachments, certificates join incoming/stock as PLAIN offers naming
> their own team). The multi-company miss line no longer prints uuid placeholders — that fix lives in the **get-results
> sub**, so this promotion now touches **two live subs** as well (`rysSPgUssLDf6xJc` = the customer-visible path,
> `Fss5aAaXthJSWpZCgKiKR` = the probe path), each as its own anchored hunk. Captain also approved **F-R4-3**: the
> promotions team collapses from `marketing_promotion_<brand>` to `marketing_promotion` (`disallowed-entity-gate` +
> `promo-picker`), so one turn can no longer name two teams and a "yes" cannot 404 at `next-assignee`.
> Clone `3e7fa66d` / fork `9ee992e9`; tester round-4 PASS (32 execs, 117 egress records, 0 real). Spine sweep is now
> **6 changed + 10 new + 12 connection keys @ 137 nodes**.
>
> ⚠️ **Live parser moved under us**: `XTODTw-dJcV0uRdC056hG` went `89b63c51` → **`b9ac64a2`** at 07:17:57Z (someone added
> one line, `- "videos","actual video"  → attachment_type "video"`, to the `AI Agent` systemMessage). The staged parser
> payload was REBASED onto that body: systemMessage `138008c2` → **`f0a825a9`** = our hunks **+ their line** (verified:
> payload-vs-fork delta is exactly that one line); `output_exchange` `a68c5992` unchanged. PRE backup refreshed to
> `PRE-XTODTw-dJcV0uRdC056hG-b9ac64a2.json`. Re-check this again at apply time — that workflow has an active editor.

> **⚠️ ROUND 4 SUPERSEDES PARTS OF THIS RECORD (planner, 2026-08-18) — see `plans/miss-company-routing-plan.md`
> §"Round 4".** Captain reversed D2': promotions ×2, master products, product attachments and certificates
> JOIN the LANE (all `members:false` — the member picker stays orders-only, captain-locked). Delta to this
> staged payload: **exactly two of the ten new nodes change again** — `miss-roster-gate` (leftValue `92ca1ccc`
> → round-4 sha; LANE moves to a `{domain, pairs:[[team,agent],…], members}` shape, +5 rows, +2 precedence legs
> for `promo-picker`) and `miss-roster-plan` (mirrored LANE + `team` sourced from the parser routing).
> Everything else here stands: 4 changed + 10 new + 12 connection keys @ 137 nodes, `cs-offer-gate` byte-equal
> to live `ce99a16c`, parser payload `a68c5992`/`138008c2` unchanged. Re-measure R12 promote rows 2 and 3.
>
> **NEW IN THE PROMOTE SET — a get-results sub, and it is TWO ids** (first promotion outside spine+parser):
> live `Call 'sub-get-results'` / `probe-incoming` / `tier-probe` call **`rysSPgUssLDf6xJc`** (named
> `sub-get-results TEST` — verified on the ACTIVE body in `PRE-9qVyfUxmRQqrpGRMDLRuz-7aba1447.json`), while
> `sibling-probe` / `crossdomain-probe` / `dym-probe` / `dym-probe-partial` / `promo-dym-probe` call
> **`Fss5aAaXthJSWpZCgKiKR`**. The clone points all eight callers at the fork **`t4QvrtrPnTwRU6br`**. Both live
> copies carry the mc-label `_codes` block byte-identically and both must receive the round-4 (A) hunk, each
> **anchored on its OWN body** (`Fss` = `11afa233` carries the OLDER timeline block; `rys`/`t4Qv` = `eac4759f`
> carry the 2026-08-18 rewrite — never cross-copy a whole body). Apply order becomes **subs → parser → spine**
> (LESSONS #37). Use `setNodeParameter /jsCode`, not REST PUT (these subs' `settings` shape is rejected by the
> public API). Back up all three sub bodies first.

> **Round-3 rev-3 re-stage (captain console corrections, 2026-08-18):** member roster/picker is ORDERS-ONLY; incoming AND
> stock per-company misses get the PLAIN escalation offer (frozen phrase naming the miss company + its routing team —
> purchasing / warehouse), no roster GET, no picker; a qty-0 stock row counts as an answer, only a fully absent company is
> a miss; `cs-offer-gate` REVERTED to its live shape (D3=b undone). Clone `7db593b0` (tester Q1–Q9+S PASS, 23 execs zero
> egress). Spine payload sweep is now **4 changed + 10 new + 12 connection keys, 127 → 137 nodes**; parser payload
> unchanged. Superseded staging deltas (rev-2 `d24dd81b`/`63c1c46e` cs-offer-gate widening) are gone from the payload.

> **Round-3 fold-in (captain HOLD on `promote-round2`, 2026-08-18):** the spine payload was refreshed with the round-3 rev-2 clone
> bodies (clone `txiPzSxy3Pclsz6v` @ `e54e114e`, tester rev-2 PASS 25 execs zero egress). Delta vs the round-2 staging: `miss-roster-gate`
> leftValue `024d91e3` → `d24dd81b` (tool/domain/routing allowlist + crossdomain precedence leg, sandbox-safe), `build-cs-member-offer`
> `c7046c45` → `63c1c46e` (F-R3-5 team-label note; orders/single output byte-identical), and ONE additional live node `cs-offer-gate`
> (conditions: 3 → 2, g2 = allowlist IIFE `cfa8c18e`, live before-shape identical to clone PRE) so incoming not-found turns get the same
> picker (D3=b). Parser payload unchanged. See §"Round-3 domain audit" below and `plans/miss-company-routing-plan.md` §Round 3.

Status: payload built and gate-verified against live **spine `7aba1447`** (post promotion-hotfix, PR #24) and live
**parser `89b63c51`**. Nothing has been PUT/published. Awaiting captain word (`needs-decision [key=promote-round2]`).
Map: `tests/reviews/miss-company-routing.md` R7 (rev-5 body per R8/R9). Method when authorized: n8n public REST
`PUT /workflows/{id}` with the staged payloads (byte-exact; PUT auto-activates on this instance — verify
`activeVersionId == versionId` after each), sub before parent (parser first, then spine).

## Live at staging time (draft == active on all three; re-fetch and re-assert before applying)

| workflow | versionId (draft == active) | updatedAt |
|---|---|---|
| spine `9qVyfUxmRQqrpGRMDLRuz` | `7aba1447-61f6-490d-89b4-22d1a196716d` | 2026-08-18T03:47:32Z |
| parser `XTODTw-dJcV0uRdC056hG` | `89b63c51-57f0-45fd-96ce-2df103c2fb9d` | 2026-08-18T00:03:06Z |
| HI sub `rrYXzE61gCNUck_zmXe-G` | `9249e00e-3dd9-4766-8c49-2f32f8f66bda` | 2026-08-18T00:04:13Z |

Backups (rollback sources): `tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PRE-*.json`.
Rollback = PUT the PRE body back (or `publish_workflow` the versionId above).

## R7 gates re-measured on `7aba1447` / `89b63c51` — ALL PASS (hotfix touched only `Call 'sub-get-results'` + `tier-probe`)

| gate | expected (R7) | measured |
|---|---|---|
| parser `output_exchange.jsCode` sha | `3ee5b658` | `3ee5b658` ✓ |
| parser `AI Agent.options.systemMessage` sha | `583bcfb0` | `583bcfb0` ✓ |
| parser trigger name / inputs | `When Executed by Another Workflow` carries `previous_conversation_state` | ✓ |
| spine `escalation-context.jsCode` | `8c12563c` | `8c12563c` ✓ (== rev-8 base ⇒ repo body applies whole) |
| spine `build-cs-member-offer.jsCode` | `37a1b023` | `37a1b023` ✓ (== rev-8 base ⇒ repo body applies whole) |
| spine `escalate-catalog.jsCode` | `8b4ae985`, exactly one `case 'escalation_declined'`, no `offer_hold` | ✓ (1 / 0) |
| spine `compile-current-state.jsCode` | `0b0912f1`, unique final `return output;`, deps `_ideate,_sug,_mem,_dymLastResultSet,qf` | ✓ |
| spine `cs-offer-gate` conditions (round 3) | 3 conditions, == clone PRE shape (`ce99a16c` jq -c) | ✓ |
| `tool-filter` / `crossdomain-render` exist on live (new gate legs) | — | ✓ (`tool-filter` `bffb4c3a` == clone) |
| no `prototype`/`constructor`/`__proto__` in any non-Code node expression (LESSONS #45) | — | ✓ 0 hits |
| new nodes absent on live | 9 names | ✓ (0 present; new node ids do not collide) |
| edge `central-exchange` | single edge → `dym-transform-partial` (its only inbound) | ✓ |
| edge HI inbound | exactly one: `escalation-context` | ✓ |
| edge `If-ideate[1]` | → `If10`, If10's only inbound | ✓ |
| `get-cs-members-miss` source | mirror LIVE `get-cs-members` (params + credential) | ✓ clone node params/credential == live `get-cs-members` byte-equal |
| every `$('…')` reference in touched/new bodies exists on live | — | ✓ (none missing) |
| hotfix leaves preserved | `Call 'sub-get-results'` `tool={{ $('tool-filter').first().json.name }}`, `contact_id` no trailing space; `tier-probe` same; `if-tier-ask` `loose`/v2 | ✓ untouched in payload |
| no fork ids / `is_test` leaves leaked | `wI5RkNGW3EOJfBdo`, `vUfFUDjLAuMaeQE6`, `t4QvrtrPnTwRU6br`, `aQUmwMVplmNcyUVc`, `tWm5DYLxfypmVC1T` | ✓ zero occurrences; `is_test` appears only in a comment inside `clarify-company-reply`/`offer-hold-reply` |

## Payloads (exact live change)

### 0. Live get-results subs — `subs/PAYLOAD-{rysSPgUssLDf6xJc,Fss5aAaXthJSWpZCgKiKR}-output-structurer.js` (NEW in round 4)

The mc-label `_codes` hunk (uuid-placeholder filter) applied **per copy, anchored** — never body-copied between them,
because `Fss` is older than `rys` in an unrelated timeline block and a body copy would smuggle that rewrite in.

| sub | called by (live) | PRE versionId / `output-structurer` sha | POST sha |
|---|---|---|---|
| `rysSPgUssLDf6xJc` | `Call 'sub-get-results'`, `probe-incoming`, `tier-probe` — the customer-visible miss line | `cacd7c95` / `3b1995d4` | **`698f89f1`** (byte-identical to the tested fork `t4Qv` POST — its PRE was byte-equal to the fork's) |
| `Fss5aAaXthJSWpZCgKiKR` | `sibling-probe`, `crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe` | `f214cb7e` / `25a2eed9` | **`d6d3f1fd`** (own body + the same two hunks) |

Apply with MCP `update_workflow` `setNodeParameter /jsCode` (these subs' `settings` shape is rejected by the public REST
API), gate on the PRE sha, then re-fetch + sha. Backups: `subs/PRE-*.json` + `subs/PRE-*-output-structurer.js`.
⚠️ `CLAUDE.md`'s "sub: get-results = `Fss5aAaXthJSWpZCgKiKR`" row is **stale** — live's customer-visible path is `rys`.

### 1. Parser `XTODTw-dJcV0uRdC056hG` — `PAYLOAD-XTODTw-dJcV0uRdC056hG.json`
`output_exchange.jsCode` := `tests/diffs/miss-company-routing/parser-fork-output_exchange.js` (**`a68c5992`**, rev-5),
`AI Agent.options.systemMessage` := `parser-fork-AI-Agent.systemMessage.txt` (`138008c2`). All other nodes/connections =
live as-is (the fork's `Postgres Chat Memory` and its OLDER `suggest-follow-up` are NOT carried — live's
`suggest-follow-up` keeps its dash-normalise hunk).

### 2. Spine `9qVyfUxmRQqrpGRMDLRuz` — `PAYLOAD-9qVyfUxmRQqrpGRMDLRuz.json` (one PUT, 127 → 137 nodes; 6 changed + 10 new + 12 connection keys)

| node | change | resulting sha |
|---|---|---|
| `escalation-context` | jsCode := repo `spine-escalation-context.js` (== clone) | `cca7a245` |
| `build-cs-member-offer` | jsCode := repo `spine-build-cs-member-offer.js` (== clone, round-3 rev-2 F-R3-5 team-label note) | `63c1c46e` |
| `escalate-catalog` | LIVE body + anchored insert of the `case 'offer_hold': … break;` block after `case 'escalation_declined'` (F6-i — live's `#9 _ct` hunk KEPT; NOT the clone body `0168df84`) — `PAYLOAD-node-escalate-catalog.js` | `5ec7d6a7` |
| `compile-current-state` | LIVE body `0b0912f1` + (1) the Δ4 merge-arm hunk **keeping live's sentence "choose who to route to. Reply the number or name:"** (F6-ii) + (2) the rev-3 miss/clarify block (plain-offer arm incl.) re-extracted from clone `7db593b0` (`6bff997d`) by its comment anchors, inserted before the unique final `return output;`. Live→payload diff = exactly those two hunks (5 hunk ranges incl. the merge-arm split); clone's unpromoted lane blocks NOT carried — `PAYLOAD-node-compile-current-state.js` | `c864f204` |
| `disallowed-entity-gate` (F-R4-3, captain-approved) | jsCode := clone body — promotions team collapses `'marketing_promotion_' + brand` → `marketing_promotion`, matching the parser's `deriveRouting` and CRM migration 371. Live body was byte-equal to the clone PRE (`ca13af1c`), so the hunk applies as measured | `069b3691` |
| `promo-picker` (F-R4-3) | jsCode := clone body — same collapse, incl. the hardcoded last-resort default `'marketing_promotion_sorento'` | `05a96e3a` |
| + 10 nodes copied from clone `3e7fa66d` byte-equal (round-4 bodies where changed): `miss-roster-gate` (if 2.3, leftValue **`e4575d3e`** — round-4 full 11-tool LANE + the already-offered/promo-picker precedence legs — rev-3 LANE: orders×2 members:true, incoming×3 members:false, stock `crm_inventory_stock_balance_list` inventory/warehouse/general_enquiries members:false; xd precedence; sandbox-safe), `miss-roster-plan` (**`95d6c814`**, LANE lockstep + team stamped from the parser's actual `suggested_team`), **`miss-members-gate` (NEW if 2.3, `14576e69` — TRUE→roster, FALSE→plain)**, `get-cs-members-miss` (== live `get-cs-members` params/cred), `build-miss-member-offer` (`fab11982`, plain arm), `clarify-company-gate` (`63e30a3d`), `clarify-company-reply` (`377c2df4`, plain-clarify copy branch), `offer-hold-gate` (if 2.3, `8f14a430`), `offer-hold-reply` (`377c2df4`), `tag-offer-hold` (set 3.4 `branch_kind=offer_hold`) | — |
| connections | `central-exchange[0]→miss-roster-gate` {T→`miss-roster-plan→miss-members-gate` {T→`get-cs-members-miss→build-miss-member-offer`, F→`build-miss-member-offer`} →`dym-transform-partial`, F→`dym-transform-partial`}; `escalation-context[0]→clarify-company-gate` {T→`clarify-company-reply` (terminal), F→`Call 'sub-human-intervention'`}; `If-ideate[1]→offer-hold-gate` {T→`offer-hold-reply→tag-offer-hold→escalate-catalog`, F→`If10`}. `If-ideate[0]` stays live's `ideate-turn-http`. | — |

Sweep of the payload: vs LIVE — param mismatches on exactly the 6 nodes above (`cs-offer-gate` reverted to live byte-equal, dropped from the payload delta), 10 new, 0 dropped, connection keys changed = exactly 12; vs CLONE `7db593b0` — all touched/new nodes byte-equal except `escalate-catalog` and `compile-current-state` (by design, F6 anchored transplants); the new/rewired connection entries byte-equal to the clone.

### 3. HI sub `rrYXzE61gCNUck_zmXe-G` / sendmsg `aoydkG1dbItXR5jXFEQsP` / replay `aROEBlQyyoQaB7a1` — nothing (R7 §4/§5, R4/R5 no norm rule).

## Apply order (when authorized) + post-checks

1. Re-fetch all three; assert versionIds/updatedAt above unchanged and draft==active — else STOP and re-measure.
2. PUT parser payload → assert `activeVersionId==versionId`, `output_exchange` `a68c5992`, systemMessage `138008c2`.
3. PUT spine payload → assert active, 137 nodes, the shas above (incl. `miss-roster-gate` `e4575d3e`, `miss-members-gate` `14576e69`, ccs `c864f204`; `cs-offer-gate` must equal live), 10 new nodes present, the 3 rewires + miss-members-gate split, hotfix leaves intact;
   full param-hash sweep vs `PRE-9qVy…` shows exactly the 6 changed + 10 new + 12 connection keys. Post-PUT: smoke ONE answered turn (LESSONS #45).
   ⚠️ Live currently carries a content-empty UI draft `cfd0e776` ≠ active `7aba1447` (nodes/connections/settings identical to the
   PRE backup — verified twice); the PUT supersedes it. Re-check before applying that the draft is still content-identical.
4. Re-assert HI `9249e00e` unchanged. Record POST versionIds here. Any mismatch ⇒ PUT PRE bodies back.
5. Watch (R7 §7): partial-miss order turn; both-miss offer → clarify → "srt"/"sorento" → HI Sorento pair; "yes mocha" on a
   single-company offer stays that company; `next-assignee`/`team-members` 404 "No team found" = revert trigger.

## Round-3 domain audit (captain requirement 2) — which per-company lookups offer the miss escalation

Ground truth (planner R3.0): the `*<Co>:* no <X> records for <code>.` line is rendered by the get-results sub's `output-structurer` for ANY
tool whose CRM envelope stamps `lookup_companies` (>1) — so the offer scope is decided solely by `miss-roster-gate`'s allowlist.

| status | tools (allowlist key = `tool-filter` name) | why |
|---|---|---|
| covered (round 2) | `crm_order_management_orders_list`, `crm_order_management_orders_by_product_list` (domain `order`, CS/order_enquiries) | original captain journey |
| **added (round 3, PLAIN — no roster, no picker; captain console corrections)** | `crm_incoming_stock_list`, `crm_incoming_stock_by_product`, `crm_incoming_stock_shipments` (incoming → purchasing/incoming_stock_enquiries); `crm_inventory_stock_balance_list` (inventory → warehouse/general_enquiries; qty-0 row = answered, only an absent company is a miss) | captain repros "incoming/stock for MUB6201"; plain frozen phrase `…escalate to *<Co>* <team> team?`, "yes" → that company's team round-robin, both-miss → company-only clarify; member picker stays ORDERS-ONLY (`cs-offer-gate` back to live shape) |
| left out | `crm_marketing_promotions_list`, `crm_marketing_promotion_products_list` | absence of a promotion is a definitive marketing fact; nothing for the other company's team to look up |
| left out | `crm_master_products_list`, `crm_master_product_attachments_list`, `crm_certificates_list` | that company simply lacks the record/file — honest answer; help still reachable via request_for_help |
| N/A by construction | resource attachments, forms, portal link, GRN/SPO, ideate | back end never stamps `lookup_companies` → gate shape legs can never pass |

New precedence leg: when `crossdomain-render` produced a block (`_xdBlock.any === true`) the gate yields (one offer per turn). Every leg is
fail-closed (missing tool-filter / non-allowlisted tool / routing mismatch / throw ⇒ false ⇒ turn byte-identical). Round-3 rev-2 evidence:
`tests/runs/miss-company-routing-round3-rollup-20260818.md` (N1–N10, R-M1/M5/M8/B, S — PASS, 25 execs zero egress); rev-1 blocker F-R3-4
(`Object.prototype` banned by the n8n expression sandbox → LESSONS #45) fixed in rev-2. Prerequisite P1: purchasing/incoming rosters exist for
both companies (Sorento: Jereen Tee; Mocha: Lucas) — an empty roster would fail closed (byte-identical turn), not mis-route.

## Round-4 additions to the audit (captain: every domain offers on a miss)

| status | tools | note |
|---|---|---|
| members picker (orders only, captain-locked) | `crm_order_management_orders_list`, `…orders_by_product_list` | unchanged |
| plain offer | `crm_incoming_stock_list`, `…_by_product`, `…_shipments` (purchasing) · `crm_inventory_stock_balance_list` (warehouse) | rounds 3/3rev3 |
| **plain offer (round 4)** | `crm_marketing_promotions_list`, `crm_marketing_promotion_products_list` (marketing_promotion) · `crm_master_products_list` (purchasing_product) · `crm_master_product_attachments_list` (marketing_product **or** purchasing_certification) · `crm_certificates_list` (purchasing_certification) | LANE now **equals** the CRM's 11-function `stamp_lookup_companies` set — completeness is structural, not enumerated |

Total-not-found already offered in every domain before round 4 (`not-found-error-message` is domain-agnostic); the only
non-offering arms are its four clarification questions, whose answers land on a path that does offer (captain-confirm C1:
leave). Precedence: one offer per turn — the lane yields to an already-rendered escalate phrase, to promo-picker's own
offer markers, and to a crossdomain block; a tier-ask turn never reaches the lane at all.

### ⚠️ BLOCKED-BY-CONFIG (admin, not code — surfaced by the round-4 roster probe)

`team-members` for **company Mocha × team `purchasing_certification`** returns **404** — *"No team found for agent and
team_code='purchasing_certification' in company '38db4f20-…'. Configure that company's team set before routing to it."*
All other new pairs resolve for both companies. The offer still renders (plain lanes make no roster call), but a live
"yes" on a **Mocha certificates** miss would hit `next-assignee` with an unconfigured team. Fix is a CRM admin team-set
entry; until then that one path can fail at assignment. (Observed side effect D4: certificate asks currently resolve to
the *attachments* tool, so the certificates row is rarely the one that fires.)


---

# ✅ PROMOTED — 2026-08-18 (captain-authorized in chat: "okay all good, i think can promote but i need you to be extra careful")

Applied in the mandated order **subs → parser → spine**, each write gated on the target's own before-sha and verified by
re-fetch immediately after. Method: n8n public REST `PUT /workflows/{id}` with `jq --rawfile` (byte-exact; PUT
auto-activates on this instance — `activeVersionId == versionId` asserted every time). Sub PUTs succeeded with
`settings` stripped to `{executionOrder}` (the plan's "REST rejects these subs" note did not hold once stripped).

| # | workflow | PRE versionId | POST versionId (active) | change | verified |
|---|---|---|---|---|---|
| 1 | `Fss5aAaXthJSWpZCgKiKR` (probe path) | `f214cb7e` | **`59df7a96`** | `output-structurer` `25a2eed9` → `d6d3f1fd` | only that node changed, connections identical |
| 2 | `rysSPgUssLDf6xJc` (customer-visible) | `cacd7c95` | **`415cbec2`** | `output-structurer` `3b1995d4` → `698f89f1` (== the clone-tested fork body) | only that node changed |
| 3 | `XTODTw-dJcV0uRdC056hG` (parser) | `b9ac64a2` | **`0260bb91`** | `output_exchange` → `a68c5992`; `AI Agent.systemMessage` → `f0a825a9` | both hunks + the other worker's `video` line present |
| 4 | `9qVyfUxmRQqrpGRMDLRuz` (spine) | `067db10d` | **`c673efaa`** | 6 changed + 10 new + 12 connection keys, 127 → 137 nodes | **payload-vs-live byte-exact, zero mismatches**; all 14 node shas OK |

**Rollback** (each auto-activates): PUT the corresponding PRE body back —
`PRE-9qVyfUxmRQqrpGRMDLRuz-067db10d-FULL.json` (spine, `.activeVersion` holds the exact pre-promote graph),
`PRE-XTODTw-dJcV0uRdC056hG-b9ac64a2.json`, `subs/PRE-{rys,Fss}*.json`. POST snapshots are alongside.

## Concurrent-editor incidents handled during this promote (both caught by the pre-flight gate, neither reverted)

1. **Parser drift** — live moved `89b63c51` → `b9ac64a2` at 07:17Z when another worker added
   `- "videos","actual video" → attachment_type "video"` to the systemMessage. Our body was **rebased** onto theirs
   (3-way verified: payload-vs-fork delta is exactly that one line; live-now→payload is our same 27 lines at identical
   anchors). Nothing of theirs lost.
2. **Spine drift + a live bug** — live moved to `2825a7cf` at 10:13Z with video-attachment support, in which
   `send-message-images` (fed by `Switch` out[0] = `mimeType == image`) was posting `attachment.type: "video"`.
   Flagged to the captain rather than silently reverted or unilaterally fixed; the captain fixed it (`067db10d`,
   `image`/`video`/`file` all correct) and our payload was re-based onto that, carrying their nodes **verbatim**.
   Post-promote check confirms all three send nodes still read `image`/`video`/`file`.

## Post-promote verification (immediately after the spine PUT)

- Payload vs live: **NONE (byte-exact)**; connections identical; 137 nodes; draft == active.
- All 14 promoted bodies sha-verified (6 changed + the 10 new lane nodes' Code/expression leaves).
- Preserved untouched: PR #24 hotfix leaves (`tool = $('tool-filter').first().json.name`), `cs-offer-gate` == live base,
  the three send-message nodes, and **zero drift on every other pre-existing node**.
- Pre-promote roster re-check (read-only, helper restored byte-exact `ad5b8b07`): `purchasing_certification` now
  resolves for **both** companies (Mocha → Lucas, Sorento → Josephine Ng) after the captain's data fix — the
  BLOCKED-BY-CONFIG item from round 4 is **closed**.
- Hardening audit R14 (the captain's "extra careful" ask, prompted by a recent 5-minute outage where a numeric
  `contact_id` hit `.trim()`): **GO, no must-fix**. `contact_id` appears in zero promoted Code bodies; the `_codes`
  change *adds* `String(… ?? '')` coercion and handles `entities` as array **or** JSON string inside a catching
  `try/catch`.

## First live turn after the promote — PASS (exec `12956511`, 10:58:35Z, real contact `477071885`)

Real stock enquiry ("check stock for Srtwb8004", inventory / warehouse routing, 3 rows incl. two qty-0):

- **`miss-roster-gate` executed with NO ExpressionError** and took the FALSE branch — the outage-class risk (a
  sandbox throw on a new mid-path If, LESSONS #45) is now disproven on live traffic, not just on the clone.
- **`offer-hold-gate` executed clean**, FALSE branch → `If10`, as before the promote.
- `compile-current-state` ran normally: no phrase appended, `selection_context` null, `last_result_set` unchanged in
  shape, axes persisted (`routing_company` Sorento, `routing_brand` sorento, one `routing_companies` row).
- Reply byte-normal for a single-company answer, and **correctly no escalation offer** — one company was queried and it
  answered, and the two qty-0 rows are answers (captain decision 2 holds on live).

## Watch list (live now)

1. First answered turns through the two new mid-path If gates (`miss-roster-gate`, `offer-hold-gate`) — an expression
   throw errors the node (LESSONS #45), so this is the primary revert trigger. Watch running.
2. Miss offers: orders → picker; incoming/stock/promotions/attachments/certificates → plain offer naming their own team.
3. `next-assignee` / `team-members` 404 "No team found … in company" → revert trigger (admin config).
4. Replay: **re-baseline** — `disallowed-entity-gate` now emits `marketing_promotion` (not `marketing_promotion_<brand>`)
   on single-brand promotion turns. Do NOT add a `norm()` rule (LESSONS #21).

## Known follow-ups (not blocking, carried out of this promote)

- **F-R13-1** — a *reordered* promotions turn rebuilds `env.response` in `promo-picker` and drops the mc-label miss line
  while the gate still appends the offer (offer with no stated reason). Fix: carry the miss line across the rebuild.
- **F14-G** — `last_result_set.label` is read by the parser as `row.label.indexOf(': ')` guarded only by `!row.label`;
  a non-string truthy `name` throws. Pre-existing (live `build-cs-member-offer` already does this); fix the *reader*.
- **F14-E/F** — `_CO_ALIASES[nk]` prototype-key edge case (a company literally named `constructor`); patches drafted in R14.7.
- **D4** — certificate asks resolve to the *attachments* tool, so the miss noun reads "product attachments".
- `CLAUDE.md`'s "sub: get-results = `Fss5aAaXthJSWpZCgKiKR`" row is stale: live's customer-visible path is `rys`.
