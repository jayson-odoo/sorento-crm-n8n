# Node-diff — `suggest-offer-member-choice` (coder deliverable)

Target: **clone spine `txiPzSxy3Pclsz6v`** (`sorento-consume-main TEST`) ONLY.
Plan: `../../plans/suggest-offer-member-choice.md` · UAC: `../suggest-offer-member-choice-UAC.md`.

- Pre-edit: versionId == activeVersionId == `df13075e-0962-4b61-b4b5-510b614d50e8` (clean draft, 104 nodes).
- Post-edit + publish: **activeVersionId `0369e6bd-e49e-4b20-84f1-e9e56778d1af`**, **105 nodes (+1)**.
- Fork `CpxE8LroLzCkrAQN`, live sub `XTODTw-dJcV0uRdC056hG`, live spine `9qVyfUxmRQqrpGRMDLRuz`: **UNTOUCHED** (no update/publish issued against any of them).
- Validation: `update_workflow` ran validation on both edits; only the pre-existing allowlisted warnings (LESSON 13: HARDCODED_CREDENTIALS on the http nodes, DISCONNECTED_NODE on the orphaned egress nodes, Transcribe MISSING_EXPRESSION_PREFIX, OpenAI builtInTools INVALID_PARAMETER). **No new errors/warnings.**

---

## Change A — divert CS/order suggest_offer "yes" into the member_offer builder

### A.1 NEW node `divert-suggest-yes`
- id `173d3b9f-1e2d-410f-9aa8-b782e95e31ca`, type `n8n-nodes-base.if` v2.3, position `[1456, 1600]` (beside `If2`).
- Single boolean condition (matches `If2`'s pattern: `operator {type:boolean, operation:true, singleValue:true}`, `typeValidation:strict`), self-contained IIFE that never throws on a missing field:
```
={{ (() => {
     const o = $('Call 'sub-query-reformulator'').first().json.output || {};
     const e = o.escalation || {}; const r = o.routing || {};
     return e.is_escalation_confirmation === true
         && o.suggest_pick_context === true
         && r.suggested_team  === 'customer_service'
         && r.suggested_agent === 'order_enquiries'
         && !e.preferred_assignee_id;
   })() }}
```
(stored with n8n's `\'`-escaped node ref, verified byte-exact in the re-fetch). Matches plan §2 exactly. All five clauses load-bearing; `suggest_pick_context===true` is the discriminator vs member_offer picks (which emit `member_pick_context`).

### A.2 Rewire of the `If2` seam (id `ed6f8db9-e2c7-41f5-be77-0decedf2950e`)
`If2` output#0 = TRUE branch (`is_escalation_confirmation===true` OR `request_for_help && domain_hint!=portal_link`).

BEFORE (`If2` connections):
```
main[0] (TRUE)  -> Call 'sub-human-intervention'  AND  tag-out-of-scope
main[1] (FALSE) -> If10
```
AFTER:
```
If2 main[0] (TRUE)  -> divert-suggest-yes            (only target)
If2 main[1] (FALSE) -> If10                          (UNCHANGED)

divert-suggest-yes main[0] (TRUE)  -> tag-escalate-offer
divert-suggest-yes main[1] (FALSE) -> Call 'sub-human-intervention'  AND  tag-out-of-scope  (both restored)
```
Ops applied (one atomic `update_workflow`, 7 ops): addNode divert-suggest-yes; removeConnection If2→human-intervention (idx0); removeConnection If2→tag-out-of-scope (idx0); addConnection If2→divert (0→0); addConnection divert→tag-escalate-offer (0→0); addConnection divert→human-intervention (1→0); addConnection divert→tag-out-of-scope (1→0).

Re-fetch confirms:
- `If2` → `[[divert-suggest-yes],[If10]]`
- `divert-suggest-yes` → `[[tag-escalate-offer],[Call 'sub-human-intervention', tag-out-of-scope]]`
- Only `If2` (removed) and `divert-suggest-yes` (added) feed human-intervention/tag-out-of-scope. `tag-escalate-offer` is now fed by its pre-existing source (`If10`) **and** `divert-suggest-yes` — the pre-existing `If10→tag-escalate-offer` edge was NOT modified.

### A.3 Intent / safety
- TRUE (a CS/order suggest→"yes"): reuse existing `tag-escalate-offer → escalate-catalog(escalate_offer) → cs-offer-gate(CS/order pass) → get-cs-members (CRM READ) → build-cs-member-offer (numbered picker, selection_context='member_offer') → compile-current-state`. **No assignment this turn.**
- FALSE (member pick w/ `preferred_assignee_id`; warehouse retarget; member-bare-yes; non-CS suggest-yes): restored original `Call 'sub-human-intervention'` (+ `tag-out-of-scope`) → round-robin/explicit assign, **guarded** in test by the sub's `is_test` short-circuit — byte-identical to pre-change behavior.
- No NEW unguarded egress node became reachable: the divert only re-parents the two original TRUE targets behind an IF; both branches terminate in the same guarded egress paths as before (human-intervention sub guarded; get-cs-members is a READ; final send guarded).
- LESSON 5 clear: nothing `$()`-references `divert-suggest-yes`, `tag-out-of-scope`, `tag-escalate-offer`, or `Call 'sub-human-intervention'` output, so the skipped branch on any given turn yields no `undefined`.

---

## Change B — NONE
`build-cs-member-offer` unchanged (numbered TEXT picker). Confirmed no edit issued.

---

## Change C — trim CS/order suggest_offer buttons (`build-suggest-offer`, id `7972abd8-5d6b-40ff-9d38-152782cd8091`, code v2)

Applied via `setNodeParameter /jsCode`. Post-write jsCode is **byte-identical** to the intended edit (verified: stored value == authoritative source string; python equality True; only the intended 3-line region differs from the original, confirmed by unified diff).

Single-region change in the D2 non-uuid-alternatives section (the `if (!anyUuidAlt)` block):

BEFORE:
```js
  out.suggest_response = text;
  out.suggest_quick_reply = [...values, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
```
AFTER:
```js
  out.suggest_response = text;
  const isCsOrder = (q?.routing?.suggested_team === 'customer_service'
                  && q?.routing?.suggested_agent === 'order_enquiries');
  out.suggest_quick_reply = (axis === 'date' && isCsOrder ? [...values] : [...values, YES, NO])
    .map(s => String(s).replace(/,/g, '')).join(',');
```

### C.1 Deviation from the plan snippet (flagged for reviewer)
The plan §3 snippet gated only on `isCsOrder` because the planner believed this assignment lived **inside** the `if (axis === 'date') { … }` block. In the actual code, `out.suggest_quick_reply` (orig line 187) is the **shared tail** for BOTH the date and non-date D2 non-uuid branches (the `if (axis==='date') { text=… } else { text=… }` closes before it). Applying the plan's `isCsOrder`-only guard verbatim would ALSO trim a hypothetical D2-**non-date** CS/order offer, violating the plan's explicit "D2 non-date … MUST keep their buttons / byte-identical" requirement (UAC V0-d).

Resolution: added `axis === 'date' &&` so the trim fires **only** for the CS/order **date** offer — exactly the plan's prose intent ("D2 axis==='date' branch only"). This is strictly more conservative and satisfies every UAC control.

### C.2 Effect on `suggest_quick_reply` (button list) — behavior matrix
| branch | routing | axis | button list | vs pre-change |
|---|---|---|---|---|
| D2 non-uuid, date offer | CS/order | date | `dates only` (YES/NO dropped) | **TRIMMED** (target) |
| D2 non-uuid, date offer | non-CS (e.g. warehouse) | date | `dates, Yes, escalate, No, it's okay` | unchanged (V0-b) |
| D2 non-uuid, non-date | any | entity | `codes, Yes, escalate, No, it's okay` | unchanged (V0-d) |
| D1 did-you-mean (code/promotion) | any | n/a | `…, Yes, escalate, No, it's okay` | unchanged (V0-c; separate code paths, not touched) |
| D2 uuid numbered mode | any | n/a | `nums, Yes, escalate, No, it's okay` | unchanged (separate path) |

- `suggest_response` (offer TEXT) UNCHANGED — still says "…would you like me to escalate to {team} team?"; escalate/decline via typed text still work.
- `suggest_last_result_set` (date round-trip payload) UNCHANGED — typed/tapped date pick still resolves.
- `YES = 'Yes, escalate'`, `NO = "No, it's okay"` literals unchanged (only removed from the CS/order date list).

---

## Verification summary
- Clone spine `txiPzSxy3Pclsz6v`: +1 node (105), published, activeVersionId `0369e6bd-e49e-4b20-84f1-e9e56778d1af`.
- `build-suggest-offer` jsCode: sha of intended edit `f1558d5a1397fd0af24698e66fd31b4751f16ca1cbb19ae64ecb80bc611aaac7`; stored value confirmed byte-identical.
- Wiring re-scanned from the post-edit fetch (facts above).
- Fork + live spine + live subs untouched.

## Promote target (user-gated, NOT done here)
Live spine `9qVyfUxmRQqrpGRMDLRuz`: add same `divert-suggest-yes` IF + same `If2` output#0 rewire (re-confirm live `If2`-TRUE also fans to human-intervention + tag-out-of-scope before rewiring), and the same `build-suggest-offer` date-branch jsCode trim (byte-exact/sha-gated, backup-first). No parser/fork change ships. Guards are inside the shared subs (unchanged); the spine deltas are business-logic only.
