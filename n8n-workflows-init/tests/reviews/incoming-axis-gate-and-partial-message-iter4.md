# Review: `incoming-axis-gate-and-partial-message` — ITER-4 (product-only-on-incoming fix)

- **Reviewer verdict: ✅ APPROVE** — zero-egress re-confirmed; the iter-4 `disallowed-entity-gate`
  admit guard verified correct and byte-identical (modulo a trailing blank line) to the artifact on the
  published clone; live spine confirmed still on the OLD gate; the 4 must-not-regress properties hold.
- **Date:** 2026-07-14
- **Scope of THIS pass:** only the change landed AFTER the iter-2+3 sign-off — iter-4, a single localized
  edit to `disallowed-entity-gate`'s `(A1)`-else branch (repro exec 8565622, "Srt6632-GM ETA" dead-end).
  `compile-current-state` and `build-suggest-offer` unchanged since iter-3; `If3` unchanged (== live).
- **Substrate:** clone `txiPzSxy3Pclsz6v`, published **`activeVersionId 0008b89a-0386-4b9d-a15a-28e349c26842`**
  (MCP: `versionId == activeVersionId` → draft==active), triggerCount 0, 114 nodes.
- **Promotion target:** live spine `9qVyfUxmRQqrpGRMDLRuz`, active `bcdb5633-f760-451b-b0a8-fc03a0d884c8`
  (MCP: live `versionId == activeVersionId == bcdb5633`, active=true).

## What I verified from MCP (not just claims)

1. **Deployed gate == artifact.** Extracted `disallowed-entity-gate` from the published clone and `diff`'d
   vs `…gate.new.js`: **identical except one trailing blank line** (clone has an extra newline — cosmetic,
   same as noted in the iter-2+3 pass). The deployed body carries the iter-4 block verbatim
   (`PRODUCT-ONLY-ON-INCOMING fix`, `fbRes`/`fbMatches`/`fbExact`).

2. **Live is STILL the OLD gate (axis-gate NOT promoted).** Fetched live gate `5928ae64` (draft==active,
   readable). Scanned for iter markers: **NONE present** — no `not_found_axis_tokens`,
   `not_found_product_tokens`, `classifyHint`, `hintForToken`, `AXIS` map, `fbExact`, `PRODUCT-ONLY-ON-INCOMING`,
   or `identifier_axis`. Live `out.gate_debug = { domain, allowed_lookup, entities_count }` and its `out.*`
   emission has NO `not_found_*` fields — this is the pre-axis-gate gate (the `require_specific`/`exact_entities`/
   `specific_options` hits are the pre-existing product-picklist mechanism, which iter-2 preserved as the (A2)
   body). So the promote diff is a clean OLD(live 232-line)→NEW(330-line `…gate.new.js`) as documented.

3. **No revert-landmine from the iter-4 publish (LESSONS #24).** Since `publish_workflow` ships the whole
   draft, re-diffed the other two promote-set nodes on the clone vs their artifacts: `compile-current-state`
   identical modulo one trailing blank line; `build-suggest-offer` **byte-identical**. The iter-4 publish did
   not drift compile/build-suggest-offer.

## Correctness — iter-4 gate admit guard

The change lives ONLY in the `(A1)` axis-handling `else` branch, reached only for an AXIS-hinted parser
token (`inbound_shipment`) with NO inbound_shipment resolver match:
```
const fbRes = (resolutions ?? []).find(r => (raw.includes(norm(r.token)) || norm(r.token).includes(raw)));
const fbMatches = (fbRes?.matches ?? []).filter(m => m && compatNonAxis.has(String(m.entity_type)));
const fbExact = (fbRes && fbRes.resolved === true && fbRes.ambiguous !== true
                 && fbMatches.length === 1 && fbMatches[0].match_tier === 'exact') ? fbMatches[0] : null;
if (fbExact) exact_entities.push(...); else not_found_axis_tokens.push(e.raw);
```
- **Admit condition = `resolved===true && ambiguous!==true && exactly ONE `compatNonAxis` match at
  `match_tier==='exact'`.** `compatNonAxis` for incoming = `ALLOWED.incoming` − axis = `{product,category,brand}`.
  So only a single exact product/category/brand search-key is admitted — matches the plan.
- **Cannot admit ambiguous** (`ambiguous!==true` required) — protects §21.1: SRTBF117 resolves to 15
  ambiguous prefix-tier candidates → NOT admitted → `not_found_axis:["SRTBF117"]`, `compatible_entities:[]`
  (tester exec 8568656). The product-hint variant still builds the `require_specific:true` picklist (8568805).
- **Cannot admit multi-match** (`fbMatches.length===1` required) — a genuinely ambiguous multi-product
  resolution under an axis hint stays `not_found_axis` (tester harness row, diff line 223).
- **§21.6 container-only unchanged** — BMOU resolves to `matches:[]` → `fbMatches.length===0` → not admitted →
  stays `not_found_axis`; WHSU axis path untouched (exec 8568907).
- **§21.8 unchanged** — CWCX604-S-RL is PRODUCT-hinted → handled by `(A2)`, never enters this axis loop; BMOU
  is fake (`matches:[]`) → `not_found_axis`. AND-intersect + iter-3 suggest-on-miss wording untouched
  (`build-suggest-offer.suggest_response` verbatim same as iter-3, exec 8569010).
- **Localized:** the else fires only for axis-hinted tokens with no axis match; it does not touch the `(A2)`
  product path, the `(B)` `not_found_product` emission, `compile-current-state`, or the AND semantics. For the
  repro, the token now resolves so it takes the pure happy path (no itemization), matching prod.
- **Repro Srt6632-GM (exec 8568450):** resolves exact+unambiguous to single product SRT6632-GM → admitted →
  `compatible_entities:[product]` → get-results by product → 2 containers (OOCU8630645/CICU1013499 + xlsx),
  matching prod verbatim. The prior dead-end (8565622, `compatible_entities:[]`) is fixed.

## Zero-egress re-confirmation (from run-log — iter-4: repro + §21 = 10 case-runs / 12 clone execs)

- Real-egress nodes (`send-message-files/images/video`, `save-session-vars`, `update-human-intervened`,
  `Call 'sub-human-intervention'`, `Call 'sub-respond-save-message-redis'2`) **ABSENT from runData** on every
  exec.
- `sendmsg` routed to TEST fork `ublq9nSlrpz63xan` (`{success:true}` → `chat:reply`); attachments via
  `chat-attach-push` presigned URL, never the real `send-message-files` node.
- `get-results` always on TEST fork `rysSPgUssLDf6xJc`, always a **READ** tool
  (`crm_incoming_stock_list` / `crm_inventory_warehouses_list`) — **never** `crm_it_support_ticket_create`.
- §21.8 escalation offered as text only; `sub-human-intervention` did not execute → no assign/SLA/PIC/CRM write.
- Session write to the `n8n_test.respond_contacts_test` gate; `lastNodeExecuted` = `log-incoming-chat-history-n8ntest`
  (writes `n8n_test`, not prod); prod `save-session-vars` PUT orphaned.
- **§0 S1–S6 PASS on all 12 execs.** iter-4 touched only the one logic Code node — no egress node, sub-call
  target, credential, or connection changed; the fail-closed layer on `txiPzSxy3Pclsz6v` is unchanged.

## Scope/tier

- Scope `deterministic` (a single Code-node edit; parser NOT touched) matches what was tested end-to-end.

## Accepted / out-of-scope (carried, not blockers)

- **§21.8 routes to suggest-on-miss (WHSU contents not rendered)** — user's explicit choice; iter-3 fixed
  only the wording. iter-4 does not change it.
- **Residual gate edge:** resolved container + a *genuinely ambiguous* product → `require_specific=true` →
  container defers to the picklist turn. Accepted/out-of-scope.
- **UAC.md §21.8/§21.9 back-fill** still recommended for traceability (they live only in the run-log).

---

## PROMOTE CHECKLIST (user-gated; do NOT promote without the user's explicit go)

**Business-logic diff to port to live `9qVyfUxmRQqrpGRMDLRuz` = exactly 3 nodes** (unchanged set vs the
iter-2+3 sign-off; only the gate body advanced to include iter-4). All 3 bodies are pure business logic —
**0** `is_test`/`test_mode`/`chat:reply` references → no guard scaffolding to strip. `If3` is NOT ported
(already == live's narrowed condition).

1. **Backup first.** Capture live's current `activeVersionId` `bcdb5633-f760-451b-b0a8-fc03a0d884c8` and the
   current bodies of the 3 target nodes as the revert anchor (LESSONS #25).

2. **Node 1 — `disallowed-entity-gate`** (live id `5928ae64-39d2-4d5d-bd85-f9ea47901f8b`): set `jsCode`
   **byte-exact** from `n8n-workflows-init/tests/diffs/incoming-axis-gate-and-partial-message.gate.new.js`
   (**now includes iter-4**; == published clone body). Source the string from the file, do not retype.

3. **Node 2 — `compile-current-state`** (live id `0804657c-f600-450b-8ae9-17972406f0e9`): set `jsCode`
   **byte-exact** from `…incoming-axis-gate-and-partial-message.compile.new.js`.

4. **Node 3 — `build-suggest-offer`** (live id `7972abd8-5d6b-40ff-9d38-152782cd8091`): set `jsCode`
   **byte-exact** from `…incoming-axis-gate-and-partial-message.build-suggest-offer.new.js`.

5. **Do NOT touch `If3`** — already correct on live.

6. **Sha-gate around publish (LESSONS #24/#25):** sha-verify all 3 node bodies in the **draft** BEFORE publish
   (confirm the draft carries only these 3 hunks, nothing stale); `publish_workflow`; sha-verify all 3 on the
   **active** version AFTER publish; **auto-revert to `bcdb5633` on any mismatch.**

7. **Authorization placement (LESSONS #26):** the live write must be authorized in the promoting agent's
   INITIAL task (or the main loop under direct user consent) — a relayed mid-session `SendMessage` is denied.

**Residual risk:** answer-behaviour only, no new egress surface — the downstream send is the same send that
already fires. Two always-emitted gate fields (`not_found_axis_tokens`, `not_found_product_tokens`) should be
registered lesson-40-style (drop-when-empty-both-sides) in any future full-corpus replay. §21.8's
WHSU-not-rendered behaviour ships as-is (intentional).

**Blockers:** none. Approved for user-gated promotion of the 3 business nodes above.
