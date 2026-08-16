# Change: `dym-single-use-fix` — a did-you-mean offer must survive a SECOND pick

Status: **PROMOTED LIVE 2026-07-22** — spine `9qVyfUxmRQqrpGRMDLRuz` `b71f56fd`→`c1580e38`, parser
`XTODTw` `06388c41`→`a94e4f6b`. 5 nodes byte-exact + sha-gated (draft+post-publish), independently
re-verified on live. Bundled: dym-single-use-fix + datemiss-summary + state-transition-monitor C5.
Post-promote canary (WhatsApp T1→T2→T3 + state_trace in prod chat_histories) still to run.
Backups: `scratchpad/live-backup/*` (prior actives above). See [[n8n-live-promote-via-mcp]].
(prior status below.)
Bundled with `datemiss-summary` (lead the date-relaxation reply with resolved customer+product bullets):
adds spine node `not-found-error-message` (exports `found_summary`) + a `build-suggest-offer` date-arm hunk.
Promote = **4 nodes**, all built as LIVE+own-hunks (`scratchpad/promote/*.js`): spine `build-suggest-offer`
(dym+datemiss) + `compile-current-state` (dym) + `not-found-error-message` (datemiss); parser `output_exchange`
(dym). Two staleness catches handled by building against live: parser fork's `_parser_raw` EXCLUDED; clone
`not-found-error-message` was STALE (live has `_ORDER_TYPES`/order-status labeling) so datemiss applied to live.
Verified: dym §DSU-1..7 + 51/51 units + datemiss live render (clone T3 `9555729`) all PASS + §0. Reviewer
APPROVE. Diff `tests/diffs/dym-single-use-fix.md`; runs `tests/runs/{dym-single-use-fix-suite-20260722,
chatui-1784709736215}.json`. Publish order: PARSER first, then SPINE. NOT promoted; live untouched.

**(historical, pre-bundle:) BUILT ON CLONE + FORK.**
E1/E2 pushed to clone `txiPzSxy3Pclsz6v` (published `b8fb4c72-10e8-4893-9a07-59cf57e6a12a`), E3 pushed to
parser fork `wI5RkNGW3EOJfBdo` (published `006e75f1-11e7-456c-971a-d5b32c0bacbf`, fork published FIRST per
LESSON 37). Live spine `9qVyfUxmRQqrpGRMDLRuz` + live sub `XTODTw` UNTOUCHED. §DSU-0 offline units:
**51/51 PASS** (evals the exact pushed blocks; negative-control confirmed the slot tests fail without the
fix). §DSU-1..7 live stateful cases + §0 egress gate NOT yet run. Source: `scratchpad/{output_exchange,
build-suggest-offer,compile-current-state}.js` + `scratchpad/dym-units.test.js`.
**Scope tag: `parser`.** (The consume edit lives inside the reformulator's `output_exchange`, which
`mock_reformulator_output` bypasses — LESSON 28 — so the fix is mock-blind and needs the real parser plus a
stateful multi-turn driver. The build/store side on the spine is deterministic Code and is unit-testable
offline at 0 token.)

Extends — does **not** duplicate — [[dym-candidate-map-plan]] (`plans/dym-candidate-map-plan.md`,
diff `tests/diffs/dym-candidate-map.md` rev 2). That change is **shipped and live**. This is a defect in its
lifecycle model, and every edit below is a modification of its own three nodes.

Adjacent, deliberately NOT in scope: the general `scope_exclusive` destructiveness problem (tracked
separately) and [[backlog-post-resolve-entity-reconciliation]] (§4).

---

## 0. Wiring reality — verified this cycle, and it CORRECTS a stale premise

| artifact | id | versionId | activeVersionId | note |
|---|---|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | `76045382-c73d-4a5e-b002-f604925f1fe3` | `8b4615fc-b75e-4385-b7eb-3c51b6ad68c7` | ⚠️ **draft ≠ active** — see §7 |
| clone spine `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `394082d4-…` | `394082d4-…` | published, build target |
| live parser sub `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | `06388c41-…` | `06388c41-…` | published |
| parser FORK the clone calls | `wI5RkNGW3EOJfBdo` | `d2fea43e-…` | `d2fea43e-…` | published, build target |

Confirmed by reading the clone: `Call 'sub-query-reformulator'`.`workflowId.value` = **`wI5RkNGW3EOJfBdo`**
(not live `XTODTw`, not `CpxE8LroLzCkrAQN`). CLAUDE.md's fork row is correct; its older inline paragraph
("the clone calls the live published sub") is stale — ignore it.

### 🔴 LOUD CORRECTION — the "stacked unpromoted deltas" hazard is GONE

The task premise says the fork carries unpromoted deltas (domain-continuity-carry, ideation intake) that
complicate promotion ordering. **It does not, any more.** Node-by-node parameter sha comparison of fork
`wI5RkNGW3EOJfBdo` vs live `XTODTw`:

```
output_exchange            fork == live  (byte-identical, 715 lines, full `diff` clean)
AI Agent                   73e4c9fefbfa == 73e4c9fefbfa
suggest-follow-up          bfe94eeddbb2 == bfe94eeddbb2
mock-reformulator-output   e8e471012a86 == e8e471012a86
test-reformulator-bypass   01f58884155d == 01f58884155d
```

The fork is a **byte-identical mirror of live** (consistent with `ideation-voice-promoted-live`: live parser
@ `06388c41`). Likewise clone `build-suggest-offer` and `compile-current-state` differ from live only in
**comment text** (`diff` shows 3 comment-only hunks + one trailing newline; every executable line matches).

Consequence, and it is the reason the bug is reproducible from production executions: **`dym-candidate-map`
is fully promoted live on both the spine and the parser.** This plan therefore starts from a clean base —
one delta on each side, no ordering puzzle. The genuine promotion hazard is elsewhere (§7).

---

## 1. The bug, grounded in three live executions (all confirmed read-only this cycle)

Contact `437264483`. Parent spine execs `9433603 / 9433640 / 9433687`; parser sub execs below.

### T1 — parser exec `9433604`
User: `"Deluxe home\nSrtwc8354 delivery\n20/07/26~21/07/26"`. Parser →
`entities [Deluxe home→customer, Srtwc8354→order]`, `date_filter 2026-07-20..2026-07-21`,
`scope_exclusive=true`. Downstream resolved `Deluxe home` → `DBR-a16583b564`, failed `Srtwc8354` as an
order, re-typed it `product`, produced 3 candidates. `build-suggest-offer` D1 **code mode** (L198-214) built:

> Couldn't find "Srtwc8354". Did you mean SRTWC8354-SH-UF, SRTWC8354-SH, or SRTWC8354-SH-200? …

merged with a CS roster → `selection_context = "member_offer"`.

### T2 — parser exec `9433641` — CORRECT behaviour
`latest_user_message` = `"SRTWC8354-SH-UF"` (candidate 1). `previous_conversation_state` carried the full map:

```json
"dym_candidates": [
 {"code":"SRTWC8354-SH-UF","uuid":"d258a0a4-…","for_raw":"Srtwc8354","for_hint":"product","entity_type":"product","for_canonical":null},
 {"code":"SRTWC8354-SH",   "uuid":"76343ecb-…","for_raw":"Srtwc8354","for_hint":"product","entity_type":"product","for_canonical":null},
 {"code":"SRTWC8354-SH-200","uuid":"00d66237-…","for_raw":"Srtwc8354","for_hint":"product","entity_type":"product","for_canonical":null}]
```

Raw LLM output was `entities:[{SRTWC8354-SH-UF, hint:product}]`, `domain_hint:null`, `intent_hint:null`,
dates null. `tryDymPick` fired → final `output_exchange` output:
`entities [Deluxe home/DBR-a16583b564 RETAINED, SRTWC8354-SH-UF resolved]`, `scope_exclusive:false`,
`date_filter_start:"2026-07-20"`, `date_filter_end:"2026-07-21"`, **`dym_pick_applied:true`**. No matching
order → the bot re-offered escalation, i.e. **the same did-you-mean message is still the live context**.

### T3 — parser exec `9433688` — THE BUG
`latest_user_message` = `"SRTWC8354-SH"` — candidate 2 of the *same* offer. The user even quote-replied to
the original offer text (`reply to: Couldn't find "Srtwc8354". Did you mean …`). But:

```json
"previous_conversation_state": { …, "dym_candidates": [], … }
```

The map was **wiped by T2's own turn**. `tryDymPick` returns at
`if (!_cands.length || !output.output) return;` (`output_exchange` L154). The turn falls through to the
generic path; the LLM re-typed the code as `hint:"order"` and emitted `scope_exclusive:true`. Final output:

```json
"entities":[{"raw":"SRTWC8354-SH","hint":"order","canonical_code":null,"current_message":true}],
"scope_exclusive":true, "scope_exclusive_applied":true,
"date_filter_start":null, "date_filter_end":null
```

Customer `Deluxe home` gone. Date window gone. Code mis-typed. No `dym_pick_applied`. No signal to the user.

---

## 2. Mechanism confirmed in code — and the clearing IS deliberate

**Populated:** `build-suggest-offer` (clone `7972abd8-5d6b-40ff-9d38-152782cd8091`; live same node id) at
four sites — D1 numbered L192-196, D1 code L210-214, D2 non-uuid L294-300, D2 uuid L328-334. D3 (incoming
sibling picker) deliberately does not populate it.

**Cleared:** `compile-current-state` (clone `7a130a0c-…`, live `0804657c-…`), inside the `output.variables`
blob that is rebuilt whole every turn and handed to the next turn as `previous_conversation_state`:

```js
// dym-candidate-map: persist the did-you-mean candidate→source-token map when an offer was
// built (survives the _merge/member_offer case since _sug is still set); ALWAYS write [] when no
// offer → clears after exactly one consumption (variables is rebuilt whole each turn).
"dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : [],
```

`_sug` is `build-suggest-offer`'s output only when `suggest_offer === true`. So **any turn that does not
build a fresh offer erases the map** — the pick turn included.

**The clearing is deliberate and must be preserved in spirit.** `dym-candidate-map-plan` §2 Edit B states it
explicitly: *"NEVER rely on absence — write `[]` explicitly so a merge-style session persist can't leave a
stale map."* Its purpose is to stop a stale offer bleeding into an unrelated later turn — a bare code typed
three turns later must not silently re-target a long-dead ambiguity. That risk is real: rev 2 of the diff
(`tests/diffs/dym-candidate-map.md`, FINDING 1, repro exec `8711232`) is exactly a stale/mis-scoped map
hijacking a subsequent reply and dropping customer scope. **A naive "stop clearing" fix re-opens that
class of defect.** The fix must replace unconditional single-turn erasure with an explicit lifecycle, not
delete the erasure.

### 2b. A second, independent breakage the brief did not name

Even if the map survived, T3 would still mis-merge. `tryDymPick` locates the prior entity to replace by
`for_raw` (`output_exchange` L170):

```js
let _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));
```

`for_raw` is `"Srtwc8354"`. But T2's own pick **overwrote that entity's `raw` with the picked code** (L176-179:
`_picked = { raw: _hit.code, … }`). T3's prior state proves it — the entity is now
`{"raw":"SRTWC8354-SH-UF","hint":"product","canonical_code":"SRTWC8354-SH-UF"}`. **No prior entity has
`raw === "Srtwc8354"` any more; the linkage key is destroyed by the first pick.** `for_canonical` is `null`
here, so recovery depends entirely on the third fallback (L172-175, unambiguous single `for_hint` match) —
which happens to work in T1-T3 because there is exactly one `product` entity, and which **fails the moment a
second product is in scope**, taking the `dym_replace_unmatched` prepend branch (L180) and producing a
duplicate product entity. Retaining the offer without repairing the linkage buys a latent bug.

---

## 3. The fix — DECIDED: an explicit `dym_offer` with a lifecycle, plus slot-stamped linkage

Two designs were on the table.

- **(A) Retain candidates until a new offer or a domain change supersedes them.** Cheapest, one changed
  expression. Rejected: with no consumed-marker and no TTL, a not-found offer that the user simply abandons
  survives every subsequent same-domain turn, which is precisely the FINDING-1 bleed-through class.
- **(B) An explicit offer object with candidates + consumption record + TTL. ← CHOSEN.** The consumed
  marker is what lets us keep the offer alive *and* bound its life, and it is also the natural place to hang
  the slot id that repairs §2b. One extra session key; no new node.

### 3a. Shape (replaces the flat array)

```js
dym_offer: {
  id:         "9433603",                       // parent spine $execution.id at build time — turn-unique
  domain:     "order",                         // qf.domain_hint when the offer was built
  ttl:        3,                               // turns remaining (see 3c)
  candidates: [ {code, uuid, entity_type, for_raw, for_hint, for_canonical} ],  // shape UNCHANGED
  picked:     ["SRTWC8354-SH-UF"]              // codes consumed so far, in order
}
```

`candidates[]` entry shape is unchanged from the shipped map — no churn in `build-suggest-offer`'s four
construction sites beyond wrapping them.

**Back-compat, and it is load-bearing:** the spine and the parser promote as two independent diffs, so during
the window between them a session blob written by the OLD spine will be read by the NEW parser (and vice
versa). Therefore:
- `compile-current-state` writes **both** `dym_offer` (new) and `dym_candidates: dym_offer?.candidates ?? []`
  (legacy mirror, read-only) for this release.
- `output_exchange` reads `_prev.dym_offer?.candidates` and falls back to `_prev.dym_candidates`.
- The legacy mirror is deleted in a follow-up once both sides are live. Note in the promotion runbook.

### 3b. Consume side — `output_exchange` `tryDymPick` (fork `wI5RkNGW3EOJfBdo`, node `847a1173-…`)

1. **Source the candidates** from `dym_offer.candidates` with the legacy fallback above.
2. **Do not skip already-picked codes.** Re-picking the same code is idempotent and harmless; the point of
   the change is that `picked[]` is a record, not a filter.
3. **Repair the linkage — new first tier in the `_idx` search, ahead of the existing three:**
   ```js
   let _idx = _prior.findIndex(e => e.dym_slot && e.dym_slot === _offer.id);   // NEW tier 0
   if (_idx < 0) _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));   // existing L170
   // …for_canonical, then unambiguous single-for_hint, unchanged
   ```
4. **Stamp the slot on the written entity** so tier 0 works on the next pick:
   `_picked.dym_slot = _offer.id;`. Arbitrary entity keys round-trip through
   `compile-current-state.reconciledEntities` — empirically confirmed: T2 wrote `uuid` onto the picked
   entity and T3's prior state still carried it.
5. **Force the type from the candidate record** — see §4.
6. Emit `dym_pick_applied:true` (unchanged) **and** `dym_offer_pick_code:<code>` so the spine can append to
   `picked[]` and reset the TTL without re-deriving anything.

Everything else in the block (ignore `scope_exclusive`, carry domain/intent, carry the date window when this
turn named none, the `_isDateLike` guard from rev 2, the Edit-D `member_offer` bypass at L595) is unchanged.

### 3c. Supersede / expiry — the offer dies when, and only when, one of these holds

Evaluated in `compile-current-state` at the point that today writes the `[]`. Order matters; first match wins.

| # | Condition | Result |
|---|---|---|
| 1 | A **new offer** is built this turn (`_sug` truthy and `_sug.dym_candidates` non-empty) | **REPLACE** — new `dym_offer`, `ttl=3`, `picked=[]` |
| 2 | **Domain switch**: `qf.domain_hint` non-null and `!== dym_offer.domain` | **DIE** (`null`) |
| 3 | **Escalation committed**: `qf.escalation.is_escalation_confirmation === true`, or a member was resolved this turn (member-pick / `preferred_assignee_id` set) | **DIE** — a human owns the thread now |
| 4 | **A pick was applied this turn** (`dym_pick_applied === true`) | **RETAIN**, `ttl` reset to 3, `picked` appended. This is the T3 fix. |
| 5 | **The turn produced results** (`validator.has_result === true` / a non-empty data-path `last_result_set`) and no pick was applied | **DIE** — the user moved on and got an answer |
| 6 | **TTL exhausted**: `ttl - 1 <= 0` | **DIE** |
| 7 | otherwise | **RETAIN**, `ttl -= 1` |

Design notes, stated so they are not re-litigated:
- **TTL = 3 turns, decremented only on rule 7** (a turn that neither builds, consumes, nor answers). A
  consuming turn resets it, so a user working through five candidates never times out; an abandoned offer is
  gone within three unrelated-but-same-domain turns.
- **Rule 2 reads `qf.domain_hint`, the post-carry domain**, not the raw LLM field. A bare code pick emits
  `domain_hint:null` from the LLM (proven: T2's raw agent output) and only gets `order` after the carry — so
  reading the raw field would kill every offer on the very turn it is used. `null` is explicitly excluded.
- **An unrelated business query does NOT by itself kill the offer** — rule 5 requires it to have *succeeded*.
  A same-domain failed lookup keeps the offer alive, which is correct: that is the T2 situation.
- **The clearing guarantee survives.** Every non-retaining branch writes `dym_offer: null` explicitly; there
  is still no reliance on key absence.

### 3d. Edit inventory

| # | node | workflow | change |
|---|---|---|---|
| E1 | `build-suggest-offer` (`7972abd8-…`) | clone spine | wrap the 4 construction sites into `out.dym_offer = {id, domain, ttl:3, candidates:[…], picked:[]}`; keep `out.dym_candidates` as the same array for the mirror |
| E2 | `compile-current-state` (`7a130a0c-…`) | clone spine | replace the one-line write with the §3c lifecycle; emit `dym_offer` + the legacy `dym_candidates` mirror |
| E3 | `output_exchange` (`847a1173-…`) `tryDymPick` | parser fork | offer-aware read + legacy fallback; `dym_slot` tier-0 lookup; stamp `dym_slot`; type forcing (§4); emit `dym_offer_pick_code` |

Three nodes, three hunks. `suggest-follow-up`, `disallowed-entity-gate`, `resolve-entity`, get-results,
get-rag, D3, the member-pick tiers, `deriveRouting`, the date gate and the blocklist are all untouched.

---

## 4. The second-order defect — entity typing

**Yes: force the picked entity's type from the candidate record, never from the LLM hint. In
`output_exchange` `tryDymPick`, at the `_picked` construction (L176-177).**

The current line is:

```js
const _picked = { raw: _hit.code, hint: _hit.for_hint || _hit.entity_type || (_idx>=0 ? _prior[_idx].hint : null),
                  canonical_code: _hit.code, uuid: _hit.uuid || null, current_message: true };
```

Two points, and the first is the good news:

1. **The LLM hint is already never consulted on the dym path.** T3 emitted `hint:"order"` only because
   `tryDymPick` never ran. Restoring the merge-back therefore fixes the mis-typing on its own — T2 proves it
   (`hint:"product"` on a turn where the LLM had produced no domain at all). No extra mechanism is required
   for the reported symptom.
2. **Harden the precedence anyway — one-line swap, in scope:**
   `hint: _hit.entity_type || _hit.for_hint || (_idx>=0 ? _prior[_idx].hint : null)`.
   `entity_type` is the *picked candidate's* resolved type (`p.m.entity_type`, `build-suggest-offer` L193/L211);
   `for_hint` describes the *source token* and only coincidentally equals it since rev 2 aligned it
   (`for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint)`, L194/L212). They diverge on a fuzzy correction
   that crosses type, and there the candidate's own type is the right answer. Making the authoritative field
   first also stops a future edit to `for_hint` from silently changing pick typing.

### In scope here vs. staying backlog

| | |
|---|---|
| **IN SCOPE** | typing of the **picked** entity, forced from `dym_offer.candidates[].entity_type` inside `output_exchange`, pre-`resolve-entity`. |
| **BACKLOG** ([[backlog-post-resolve-entity-reconciliation]]) | re-typing **carried, non-picked** entities from resolver output and re-running the axis dedup on the resolved type. That fires *after* `resolve-entity`, in `disallowed-entity-gate`, on a different trigger (parser hint ≠ resolved type), and fixes a different symptom (a mis-hinted promo entity polluting a later inventory answer, exec `8690328`). **Do not touch it in this change.** Note the interaction for the reviewer: the retained `Deluxe home` entity keeps whatever hint it had; this change does not re-type it, and does not need to. |

---

## 5. Scope boundary

This change fixes the **dym path only**. `scope_exclusive`'s general destructiveness — an LLM-emitted
`scope_exclusive:true` wiping legitimately carried entities on ordinary turns — is a separate, broader
defect and is tracked separately; `tryDymPick` neutralises it only for the turns it owns. Do not widen.

---

## 6. §UAC cases — `§DSU-*`

Format per `tests/UAC.md`. **Every case is bound by the `tests/UAC.md` §0 safety checklist S1-S7; a §0
failure is a hard fail regardless of functional result.** Driver: `chat-stateful` console lane (PRIMARY) or
`mode=regress-capture` — `uac` mode cannot round-trip session state (LESSON 31), and pinned replay is BLIND
to `output_exchange` (LESSON 28). Reset `respond_contacts_test` ONCE before T1 of each chain, **never**
between turns of a chain. Contact `437264483` throughout (FULL access, happy path).

**§DSU-0 — offline units, 0 token. Run FIRST, gate the rest on it.**
Extend `scratchpad/dym-units.test.js`. Build side: assert `build-suggest-offer` emits a well-formed
`dym_offer` (id, domain, `ttl:3`, `picked:[]`, candidates unchanged) on D1 code/numbered and D2, and nothing
on D3 / the date-relaxation arm (rev-2 FINDING 1 must stay fixed). Lifecycle: table-drive all 7 rules of
§3c. Consume side: `dym_slot` tier-0 wins over `for_raw`; a second pick with the `for_raw` entity already
overwritten resolves via the slot; `hint` comes from `entity_type`. Include the two-products-in-scope variant
that today would hit `dym_replace_unmatched`.

**§DSU-1 — PRIMARY REGRESSION: the T1→T2→T3 replay (execs 9433604 / 9433641 / 9433688).**
- *Trigger:* T1 `"Deluxe home\nSrtwc8354 delivery\n20/07/26~21/07/26"` → T2 `"SRTWC8354-SH-UF"` →
  T3 `"SRTWC8354-SH"`. Contact `437264483`. Real parser, stateful driver.
- *Expect-path:* T1 → not-found → D1 code-mode did-you-mean merged with the CS roster
  (`selection_context:"member_offer"`). T2 → `tryDymPick` (`dym_pick_applied:true`), member block skipped.
  **T3 → `tryDymPick` AGAIN.**
- *Expect-output (T3 `output_exchange`), all mandatory:*
  - `dym_pick_applied === true`
  - `entities` contains `{canonical_code:"DBR-a16583b564"}` (customer `Deluxe home` **STILL PRESENT**)
  - `entities` contains the picked code `SRTWC8354-SH` with **`hint === "product"`, NOT `"order"`**
  - `entities.length === 2` — no duplicate product entity, no `dym_replace_unmatched`
  - `scope_exclusive === false` and `scope_exclusive_applied === false`
  - `date_filter_start === "2026-07-20"` and `date_filter_end === "2026-07-21"`
  - state after T3 still carries `dym_offer` with `picked` = `["SRTWC8354-SH-UF","SRTWC8354-SH"]`, `ttl` 3
- *Fail conditions:* customer absent; either date null; `hint:"order"`; `dym_pick_applied` absent.

**§DSU-2 — third pick from the same offer.**
Continue §DSU-1 with T4 `"SRTWC8354-SH-200"`. Same assertions as T3, `picked` length 3. Proves the offer is
genuinely multi-use and that repeated slot-stamping is stable (the entity's `raw` has now been rewritten
twice — tier 0 must still resolve it).

**§DSU-3 — supersede actually fires (offer correctly dies).** Three independent sub-cases, each from the
§DSU-1 T1 state:
- **3a domain switch (rule 2):** T2 `"check stock srtbf11831"` (`domain_hint:inventory`) → next state
  `dym_offer === null`; a following `"SRTWC8354-SH"` gets **no** `dym_pick_applied`.
- **3b escalation committed (rule 3):** T2 `"yes"` → round-robin escalate (existing path, unchanged) →
  `dym_offer === null`.
- **3c TTL (rule 6):** three same-domain turns that neither pick nor answer (e.g. `"ok"`, `"hmm"`, `"and?"`)
  → `ttl` observed 3→2→1→null; a fourth-turn `"SRTWC8354-SH"` gets no `dym_pick_applied`. Assert the TTL
  value at each turn, not just the endpoint.

**§DSU-4 — stale-offer bleed-through NEGATIVE case (proves rev-2 FINDING 1 did not reopen).**
- *Trigger:* the rev-2 date-relaxation shape — a turn whose offer is *"No delivery on <range> — reply with a
  date to continue"* (repro exec `8711232`) — then a date reply.
- *Expect-path:* no `dym_offer` built on the date arm (`build-suggest-offer` `axis === 'date'`), so
  `compile-current-state` writes `null`; the date reply takes normal date handling.
- *Expect-output:* `dym_pick_applied` **absent**; the customer entity **retained**; no date-valued entity;
  `date_filter` applied normally. Plus: a bare code typed 4+ unrelated turns after a real code offer gets no
  `dym_pick_applied` (the TTL/supersede backstop).

**§DSU-5 — precedence on the merged `member_offer` turn, unregressed.** From §DSU-1 T1: bare `"2"` →
member pick (`preferred_assignee_id` = roster idx 2, no `dym_pick_applied`); a roster **name** → member pick;
bare `"yes"` → round-robin escalate; a dym **code** → dym pick with the member block skipped
(`output_exchange` L595 guard). Four distinct outcomes. This is `dym-candidate-map` §24c re-run against the
new lifecycle.

**§DSU-6 — inertness / back-compat.** (a) A session blob with the legacy flat `dym_candidates` and **no**
`dym_offer` still produces a working pick via the fallback (proves the spine↔parser promotion window is
safe in that direction). (b) A session with neither → `output_exchange` behaviour byte-identical to today,
`dym_pick_applied` absent. (c) A code NOT in the offer → today's fallback, fresh query.

**§DSU-7 — §0 zero egress on every case above.** Reply observed via `chat:reply:{chat_id}` or the clone
egress log; no `api.respond.io/.../message` POST; no assign / SLA / PIC-comment / session-PUT write; every
invoked sub received `is_test === true`; S7 sink-delta + payload attribution per UAC.md §0 (an
unattributable prod-list movement is a **FAIL**, never an inconclusive pass — LESSON 45).

---

## 7. Build, safety, and the REAL promotion hazard

- **Build target:** clone `txiPzSxy3Pclsz6v` (E1, E2) + fork `wI5RkNGW3EOJfBdo` (E3). **Publish the fork
  before testing the clone** — the clone resolves only the *published* fork (LESSON 37). Live spine
  `9qVyfUxmRQqrpGRMDLRuz` and live sub `XTODTw` untouched until a user-gated promotion.
- **Zero egress is structural.** All three nodes are Code-only — no send, assign, or write. The clone stays
  fail-closed (5 orphaned + 1 sinked; `is_test=true` on every shared-sub call).
- **Promotion = two diffs** (spine E1+E2 → `9qVyfUxmRQqrpGRMDLRuz`; parser E3 → `XTODTw`), byte-exact and
  sha-gated per LESSON 25, backup-first, draft==active verified before and after each publish.

### ✅ Spine-draft hazard RESOLVED (re-verified 2026-07-22 promotion-prep)

The §7 draft-vs-active hazard the plan flagged (`versionId 76045382 ≠ activeVersionId 8b4615fc`, a
credential migration on 10 HTTP nodes) is **GONE**. Live spine `9qVyfUxmRQqrpGRMDLRuz` is now
`versionId === activeVersionId === b71f56fd-fe8d-442a-a546-d31a1a9534d6` (the draft was landed/resolved since
the plan was written) and live parser `XTODTw` is `06388c41…` draft==active. So a `publish_workflow` of
either now ships **only** this change's diff — no credential rider. Re-verify draft==active immediately
before pressing publish anyway (LESSON 23/24).

### 🔴 NEW hazard the plan's §0 got WRONG — the tested fork is NOT a byte-identical live mirror

§0's "byte-identical mirror of live" claim for fork `wI5RkNGW3EOJfBdo` is **stale**. Promotion-prep diff vs
live `XTODTw` found the fork carries an unpromoted **state-transition-monitor** delta absent on live:
a `_parser_raw_snapshot` block + a trailing `output._parser_raw = _parser_raw_snapshot;`. Copying the fork
wholesale to live would ride that diagnostic in (LESSON 24). **The promotion target was therefore built as
LIVE + only the dym hunks** (`scratchpad/promote/*.js`), NOT the fork/clone verbatim. Verified: promote
target vs live = only the dym lines; promote target vs tested artifact = executably identical for the two
spine nodes and identical-except-the-excluded-`_parser_raw` for `output_exchange` (tryDymPick does not read
`_parser_raw`, so behaviour is equivalent to what the tester exercised). Reviewable diff:
`tests/diffs/dym-single-use-fix.md`. Backups: `scratchpad/live-backup/*.LIVE.js`.

### Promotion order (safe both directions per §3a back-compat)

Promote **parser E3 first**, then spine E1+E2. Rationale: the new parser reads `dym_offer` with a legacy
`dym_candidates` fallback, so it works against BOTH the current spine (writes only `dym_candidates`,
wiped-on-pick → fix inert but no regression, §DSU-6 proven) and the new spine. This avoids any window where
an OLD parser reads a NEW `dym_offer` blob. Spine publish activates the fix. Each publish: backup-first,
draft==active re-verified before+after, one node-diff confirmed byte-exact against `tests/diffs/`.

---

## 8. Acceptance criteria

1. **§DSU-1 passes:** after T3, `Deluxe home` / `DBR-a16583b564` and the `2026-07-20..2026-07-21` window are
   both still present, the picked code is typed `product`, `scope_exclusive` not applied, exactly 2 entities.
2. **§DSU-2 passes:** a third pick from the same offer behaves identically to the second.
3. **§DSU-3 passes:** every supersede rule fires — domain switch, escalation, and TTL each kill the offer,
   with the TTL value asserted per turn.
4. **§DSU-4 passes:** no stale-offer bleed-through; rev-2 FINDING 1 stays fixed.
5. **§DSU-5 passes:** number / name / `yes` / code remain four distinct outcomes on the merged turn.
6. **§DSU-6 passes:** legacy-blob fallback works, and a session with no offer is byte-behaviour-identical.
7. **§0 S1-S7 hold on every case.**
8. **Promotable diff = 3 nodes / 3 hunks** across two workflows, with the live-spine draft hazard (§7)
   explicitly acknowledged and unresolved by this change.
