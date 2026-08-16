# PP — Promotion picker (require a scope, drop the access-level prompt)

Covers `plans/promotion-picker-plan.md` slices S1–S6.

**Read `00-SAFETY-always-read.md` (§0) first. It applies to every case here, without exception.**

Build/test target: the promotion-picker fork (plan §7), **not** the clone `txiPzSxy3Pclsz6v` — it is
mid-build for container-status in another session.

> Rewritten 2026-08-09 after the grill. The first draft asserted an entitlement-wide promotion list;
> that design is dead (plan §9). Cases asserting a capped/grouped whole-entitlement list are gone.

## Run conditions (all cases)

- `uac` mode, driven per `clone-canary-item-envelope`
- **`previous_conversation_state: {}` unless the case says otherwise.** uac mode otherwise reads
  437264483's stale prod session and the reply silently addresses a different question
  (`uac-mode-reads-prod-session`). A case run without this is UNRELIABLE, not PASS.
- assert **per-node `runData`**, never execution status
- assert at the **customer boundary** — `save-session-vars.user_response` / the sendmsg payload —
  never on `build-promo-picker`'s return object
- enumerate renderers by **rendered string** (`grep -rln`), not by graph inbound
- egress: `test:egress:{test_run_id}` + sink-delta with payload attribution. **Not** the LLEN gate.
- any quote-reply case sets `referenced_result_set` **explicitly** — `sim-inject-session` coerces it
  to `[]` and the `Array.isArray(...)` guard passes `[]`, so a fixture that omits it exercises
  nothing and reports green

---

## §PP-0 — baselines (run BEFORE any edit; recordings, not assertions)

| id | message | record |
|---|---|---|
| PP-0a | "any promotion?" — contact with ≥2 access types | does `If4` go FALSE? exact prompt + quick_reply buttons |
| PP-0b | PP-0a, answer "Sorento Dealer", then a NEW turn "any promotion?" carrying the resulting state | does `access_levels` silently reuse the level? |
| PP-0c | "any promotion?" — contact with exactly 1 access type | confirms the `names.length == 1` shortcut |
| PP-0d | "any promotion?" — contact with 0 access types | confirms "You have no access levels configured to get promotions." |
| PP-0e | "promotion for \<product with ≥2 promotions\>" | attachments fired today; rendered string verbatim; **the real product-scoped promotion count** |

**PP-0b is the RED.** If the stale carry does not reproduce, STOP — the premise is wrong, re-scope
rather than "fix" it. **PP-0e sizes the picker**; if a scoped list is 3 rows the rendering is trivial,
if it is 30 revisit before building.

---

## §PP-1 — bare ask requires a scope (S1)

**PP-1a** — "any promotion?", contact with ≥2 access types
→ reply is the **require-specific** prompt. No promotion list. No access-level prompt.
`access-level-choice-message` did **not** execute.

**PP-1b** — same turn
→ `require_specific === true`, and the rendered string carries the existing leading sentence
**without** the "Multiple matches found — please choose:" clause and **without** a numbered list.

**PP-1c** — "any promotion?", contact with 0 access types
→ **byte-identical to PP-0d**. The 0-access-type branch is untouched by S1/S2.

**PP-1d** (fail-on-purpose, §0 S9) — force a `promo_scope` entity to resolve on the bare ask
→ PP-1a must go RED.

**PP-1e** — the existing ambiguous-candidate path is unaffected: a token that resolves to multiple
candidates still renders "Multiple matches found — please choose:" with its numbered list.

---

## §PP-2 — what counts as a scope (S1, Q25)

Each must go **through** to a promotion answer, not to the require-specific prompt:

| id | message | scope entity |
|---|---|---|
| PP-2a | "promotion for SRTKS4028B" | product |
| PP-2b | "any Mocha promotion" | brand |
| PP-2c | "kitchen sink promotions" | category |
| PP-2d | "\<promotion name\> details" | promotion |
| PP-2e | "promotion flyer" | flyer |

**PP-2f** — a message with no `promo_scope` entity at all → require-specific (the PP-1a path).

---

## §PP-3 — entitlement scoping (S2, D1)

**PP-3a** — scoped query, contact with ≥2 access types
→ `access_levels` reaching `get-results` is the **full** `Aggregate.name` union — not one name, not
absent.

**PP-3b** — the MCP call actually reached the backend
→ `crm_marketing_promotions_list` was called this turn and returned records. **An empty list is not
proof of correct scoping** — a wrong parameter name is dropped silently and short-circuits without
calling the backend. Assert the call, then the contents.

**PP-3c** — contact entitled to A only, a promotion exists under B
→ the B promotion does **not** appear. Assert on the rendered string.

**PP-3d** — customer names a level they hold: "Mocha Dealer promotions for \<product\>"
→ filtered to Mocha Dealer this turn.

**PP-3e** — customer names a level they do **not** hold
→ *"You don't have access to …"* followed by their real list (Q23). Not a silent full-union fallback,
not a bare no-access dead-end.

**PP-3f** — the turn after PP-3d, no level named
→ back to the full union. The explicit level did **not** persist.

⚠️ PP-3b/3c cannot be proven offline — they need a real CRM read.

---

## §PP-4 — no carried access level (S3)

**PP-4a** — repeat PP-0b exactly → the second turn does **not** inherit the level.
**PP-4b** — `save-session-vars` payload after any promotion turn carries **no** `access_levels` key.
**PP-4c** — a contact whose existing session blob still holds `access_levels` from before the change
→ ignored, not read (the parser fallback must already be gone; plan §3 ordering).

---

## §PP-5 — the list turn (S4)

**PP-5a** — scoped query returning ≥2 promotions
→ numbered list, one per line, **description — period**. **Zero attachments this turn** — assert on
the egress log, not on `if-got-attachments`.

**PP-5b** — scoped query returning exactly 1 (D2)
→ **no** list; the file is sent immediately.

**PP-5c** — scoped query returning 0
→ escalation targets the **named product's company** (S6). Assert the resolved team, not just that
an escalation happened.

**PP-5d** — the roster
→ `suggest_last_result_set[].label` is **bare** — no numbering or decoration baked in — and each row
carries `uuid` + `company_id`/`company_name`.

**PP-5e** — `selection_context` after the list turn is `'suggest_offer'` (Q12). No new context value
appears anywhere in state.

---

## §PP-6 — the pick turn (S5)

**PP-6a** — after PP-5a, "1" → exactly position 1's file(s) sent. Assert the filename at the boundary.
**PP-6b** — "1 and 2" → **both** promotions' files sent. One file is a FAIL, not a partial pass.
**PP-6c** — "1,2" → same as PP-6b; the comma form must not split into extra buttons or drop a pick.
**PP-6d** — "all" → every listed promotion's files sent.
**PP-6e** — a picked promotion with **no attachment** → its details replied as text, not silence (Q5).
**PP-6f** — the pick turn re-called MCP with `promotion_ids` (Q14). No stored file URL was reused.
**PP-6g** — an out-of-range number ("9" on a 3-item list) → a clear reply, not a crash, not a silent
wrong file.
**PP-6h** — an unrelated reply ("thanks") → does **not** re-prompt the roster.
**PP-6j** 🔴 — **REPEAT PICKS.** After PP-5a, reply "5", then "3", then "1". Each must return the
promotion at THAT position of the ORIGINAL list, and the persisted roster must stay at its original
length. A pick must never become the new scope. (Missing from the first draft; the collapse it guards
was found by the user in the live console, not by this suite.)
**PP-6i** — a promotion NAME instead of a number → resolves via normal entity resolution; the picker
does not swallow it.

---

## §PP-7 — quote-reply (S5)

**PP-7a** — two promotion lists in the conversation; quote-reply the **older** one with "2"
→ resolves against the **quoted** list via `referenced_result_set`, not the current roster.
**PP-7b** — quote-reply with "all" → every position of the **quoted** list.
**PP-7c** (fail-on-purpose) — omit `referenced_result_set` from the fixture
→ PP-7a must go RED. If it still passes, the fixture is vacuous and every PP-7 green is worthless.

---

## §PP-8 — no collateral damage on the other pickers 🔴

`last_result_set` and `selection_context = 'suggest_offer'` are shared. A stray "2" must land on the
right roster.

**PP-8a** — CS member roster pending, "2" → resolves to the **member**.
**PP-8b** — did-you-mean offer pending, "2" → resolves to the **dym candidate**.
**PP-8c** — incoming sibling picker pending, "2" → must NOT be hijacked by the promo picker.
⚠️ **CORRECTED 2026-08-10.** The original wording ("resolves to the sibling") rested on a false
premise: that picker is **code-based, not numbered** — its own message says *"Reply with a code to
continue"*. A bare number was never meant to resolve there, and does not (identical on the clone, so
pre-existing and unrelated to PP). The real assertion is isolation: domain stays `incoming`, no
promotion involvement. Replying with the CODE (`SRTBF11838`) resolves correctly.
**PP-8d** — promo roster pending, "2" → resolves to the **promotion**.
**PP-8e** — `cap3` on the did-you-mean miss path is unchanged: an ambiguous promotion token still
offers at most 3 candidates.

All five in the same build. Any one silently re-pointing is the failure this section exists for.

---

## §PP-9 — egress (§0)

Every case: `test:egress:{test_run_id}` shows `would_send` only, sink-delta attributable to this run,
`sorento-respond-message` untouched. Any real send is an immediate STOP and report — never a
workaround.

---

## §PP-10 — the reply must contain NOTHING ELSE 🔴

Added 2026-08-10 after the user found both of these in a real console transcript. Every existing
PP case asserted the promotion list or the picked file and stopped there — neither was wrong; a
second block was being APPENDED underneath. Assert on the WHOLE reply, not on the part you built.

**PP-10a** — a scoped promotion query whose scope token does not resolve exactly (`"6047 promo"`,
`"promotion for bathroom furniture"`)
→ the reply contains **no** `Couldn't find these:` block. The scope token must not be offered back
as a did-you-mean, least of all with candidates that are rows of the list above it.

**PP-10b** — the `all` pick turn on such a roster → same: files sent, and nothing appended.

**PP-10c** (fail-on-purpose, §0 S9) — a token that genuinely misses ALONGSIDE an answered one
(`"stock for <real code> and srtxx9999"`)
→ the partial-miss block MUST still fire for `srtxx9999`. If PP-10a can be made green by muting the
block wholesale, PP-10a is worthless. This case is what stops that.

**PP-10d** — with `disallowed-entity-gate.compatible_entities` empty, the miss is surfaced again.
The suppression keys on a token's OWN candidates reaching the answer, never on "the turn was
answered".

**PP-10e** — `resolve-entity` returns TWO envelopes and the defect exists in both. The per-token
`resolutions[]` shape is PP-10a; the legacy blob (`{ tokens, intersection, unresolved_tokens, … }`,
no `resolutions` key) is this case: `"6047 promo"` then `"dealer version only"` → 4 correctly
narrowed rows and `"6047" — not found.` with the zero-candidate footer. A case that only exercises
one envelope leaves the other live. Drive both.

Offline instrument: `tests/offline/promo-scope-dym/` (probe 19, mutants 6). `probe.js before` runs
against a FROZEN pre-fix body — the export cannot serve as the RED baseline once the fix ships.

---

## §PP-11 — the list says what it is a list OF (#14)

**PP-11a** — a scoped list intro reads `I found N promotions for <scope>.` where `<scope>` is the
customer's own wording (`entity.raw`).

**PP-11b** — never the canonical code. `"6047"` resolves to TWO products
(`SRTKS6047-NEW`, `SRTKS6047-BL-NEW`); printing either states a search the customer did not ask
for.

**PP-11c** — a promotion-NAME scope is filename-length: the echo is **dropped**, not truncated, past
60 chars. A half-printed promotion name reads as a different promotion.

**PP-11d** — no scope entity → the plain intro, with no dangling `for`.

**PP-11e** — duplicate raws across entities are echoed once; distinct scopes are all named.

---

## §PP-12 — list order (#15)

**PP-12a** — a scoped list of ≥2 → rows are ordered by **end date descending**, tiebreak start date
descending, then the CRM's own order. Assert on the RENDERED string, not on `answers[]`.

**PP-12b** 🔴 — **the file must follow the row.** `attachments[i]` is index-paired with
`answers[i]`; picking a row whose position CHANGED under the sort must return that row's own file.
Drive a case where the sort actually moves things (`promotion for SRTBF11834`: pick `4`, which was
position 1 before sorting). A pick of position 1 alone proves nothing — it is the one position a
broken permutation can still get right.

**PP-12c** — the rendered body is rebuilt in sorted order. The LLM pre-renders `response` in CRM
order, so a reordered list that reuses it shows one order while the roster addresses another.

**PP-12d** — the `Data last updated:` stamp survives the rebuild.

**PP-12e** — a row with no parseable end date sorts LAST, never first (an empty string beats every
date under a naive descending compare).

Offline: `tests/offline/promo-picker/` (probe 72, mutants 26; P1–P7 cover this section).

