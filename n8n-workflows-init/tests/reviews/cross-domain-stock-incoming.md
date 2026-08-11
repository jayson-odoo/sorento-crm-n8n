# REVIEW: `cross-domain-stock-incoming` — **REQUEST-CHANGES** (narrow)

Date 2026-08-03. Reviewed clone `txiPzSxy3Pclsz6v` @ `043358ae` against live spine
`9qVyfUxmRQqrpGRMDLRuz` @ `a40cd16d` (pulled via MCP, node bodies + wiring + 2 real executions).
Companion docs: `plans/HANDOFF-cross-domain-stock-incoming.md`, `plans/cross-domain-stock-incoming-plan.md`,
`tests/runs/crossdomain-stock-incoming-20260803.md`.

Safety is clean. The hoist is sound. Two small code fixes + three promote-checklist additions + one
re-run stand between this and APPROVE. Nothing here is a rebuild.

---

## 1. Zero egress — PASS (structurally re-confirmed on the current clone)

Re-derived from the current clone JSON, not from the run log:

| check | result |
|---|---|
| 5 egress nodes orphaned (0 inbound) | ✅ `send-message-files`, `-images`, `-video`, `update-human-intervened`, `save-session-vars` all have **zero** inbound edges |
| save-message-redis sinked | ✅ `Call 'sub-respond-save-message-redis'2` → fork `tWm5DYLxfypmVC1T`, not live `UrETd-…` |
| all 8 sendmsg callers | ✅ → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), never live `aoydkG1dbItXR5jXFEQsP`; all pass `is_test:true` |
| sendmsg guard published | ✅ `sub-sendmsg-CHAT` `versionId == activeVersionId == 5f73b96a` (LESSONS §17) |
| human-intervention | ✅ fork `vUfFUDjLAuMaeQE6` |
| **`crossdomain-probe` target** | ✅ **`rysSPgUssLDf6xJc`** (`sub-get-results TEST`) — *not* live `Fss5aAaXthJSWpZCgKiKR`. All 4 get-results callers agree. |
| new nodes with credentials | ✅ **zero.** The 5 new nodes are 3×Code, 1×If, 1×executeWorkflow — none of those types accept credentials, so this is a sound assertion, not the vacuous "no credentials block" (LESSONS §47). |
| postgres creds | ⚠️ **not verifiable via MCP** — MCP redacts credentials on read (§47). What *is* assertable: the postgres node **set is unchanged** by this diff (`log-incoming-chat-history-n8ntest`, `pg-get-session`, `pg-upsert-session`, all pre-existing), targeting `respond_contacts_test`/`chat_histories` in `n8n_test`. This change adds no DB node. The coder's post-PUT S-CRED re-verification is the only evidence — taken as reported, not independently verified. |
| §S4 read allowlist | ✅ `other_tool` is a **hardcoded ternary** on `domain_hint`: `crm_inventory_stock_balance_list` / `crm_incoming_stock_list`. Not caller-controlled; cannot reach `crm_it_support_ticket_create`. Confirmed empirically in exec `11033897`. |
| empirical, final build | ✅ exec `11034175` (06:09:44Z, after last write 06:03:29Z): send node → sub-exec `11034188` in `ublq9nSlrpz63xan`, payload `is_test:true`, contact stub has no `chat_id` → `chat?` gate FALSE → `test-guard` TRUE → record-only. No `Send a Message` run. |

Payload-pollution check (what a splice usually breaks): `Aggregate1` aggregates **only** `response_intro`,
so `_xd`/`_xdBlock` never enter the not-found chain; `not-found-error-message` reads exclusively by-name
nodes. `If6` reads `$('validator')` **by name**, so the splice cannot alter its branch decision. Clean.

**Verdict: no new egress surface. Reads only. The probe is on the fork.**

## 2. The hoist — PASS, proven by code, not by the deleted gate

The shadow gate is gone, so this was proven by reading. Three findings, all favourable:

**(a) The promotable hunk is exactly two things — verified byte-exact.**
`diff live compile-current-state ↔ clone-pre-change` = **IDENTICAL** (528L both). `diff live ↔ clone-now`
= only (i) the hoist consumption and (ii) the `_noun` line. Nothing else moved in a 528-line node.
Strongest possible answer to LESSONS §57 ("build target = LIVE + own hunks").

**(b) The rollback artifact is byte-exact.** `tests/diffs/zerostock-inline-computation-preserved.js`
== live `compile-current-state` lines 220–321 + `})();`, whitespace-normalised, zero diff.

**(c) `crossdomain-zeroset` computes the same set.** Line-by-line vs the archived inline code:
- `returnedCodes`: same `answers`-then-`items` preference, same `product code` label match, same `''`/`—`
  rejection, same `norm`. Envelope source differs (`validator` + replicated unwrap vs `getResultObj()`),
  and `central-exchange` **is** an identity function for the deterministic get-results envelope
  (`input.output` undefined → `raw=''` → `output = input`), so the unwrap replication is exact on the real path.
- `requested[]`: TYPED-exact and AND-mode-fallback branches are **character-for-character the same logic**.
  The dropped `fam` field was **dead code** in the inline copy (the `missing` loop reads only `rq.strict`
  and `rq._n`) — dropping it is provably inert.
- `missing`: identical prefix-family-for-TYPED / strict-exact-for-PICKED rule.
- The one **deliberate** divergence (`returnedCodes.size === 0` no longer bails) is correctly reinstated in
  #3's own guard at line 247: `if (returnedCodes.length === 0) return;` ✓
- 10-item cap preserved ✓

Three residual divergences, all argued unreachable — record, don't fix:
1. `central-exchange`'s **string-parse** branch (`input.output` a string / `input.text` non-empty) is not
   replicated in the zeroset unwrap. Unreachable on the deterministic get-results envelope.
2. `getResultObj()`'s fallbacks to `disallowed-entity-gate`/`$input`, and `central-exchange` fed by
   `Basic LLM Chain`: on those paths zeroset never ran, so #3 now returns early where the inline copy could
   in principle have spoken. Unreachable because #3 additionally needs `last_result_set` non-empty **with
   product-code-labelled rows**, which only the get-results envelope produces — and `isEscalateBranch` is
   false **only** when `central-exchange` ran without an override, so #3 fires on the answered path alone.
3. `for (const c of prev) _pick(c)` (skips falsy) became `_add(c, …, true)` (accepts `0`). A dym-picked
   code of numeric `0`. Vanishing.

⚠️ **Evidence thinner than the plan required:** §8.1 2b demanded the shadow sample cover *"OR-mode,
AND-mode fallback, dym-picked turns, prefix-family turns, central-exchange-unwrapped envelopes"* from
`v_turns`. §12 records 5 turns covering single-missing / 2-missing / inventory / incoming / 3-product —
i.e. **OR-mode only**. AND-mode fallback and PICKED-strict were never sampled, and the gate is deleted so
they can't be cheaply sampled. The code-level proof above substitutes, but sign-off must say "equivalence
established by inspection with 3 named residuals", NOT "proven by a 5-turn gate".

## 3. Byte-identical claim — PASS, retirement correct and correctly scoped

`const _noun = (dh === 'incoming') ? 'incoming' : 'stock';` → on inventory the emitted string is
`\n\nNo stock records found for: ${shown.join(', ')}.` — **byte-identical to live**. The incoming noun is
the **only** behavioural delta in #3, confirmed by the diff in §2(a). Guards, append order and the 10-cap
are untouched.

## 4. Frozen regex contract — PASS

One `const PHRASE = \`Would you like me to escalate to ${xb.team} team?\`` used for **both** sinks:
- `out.user_response = ... + "\n\n" + PHRASE`
- `v.response = \`${v.response}. ${PHRASE}\`` → reaches `session-save-gate`/`save-session-vars`

Same const, zero wording/case drift; `output_exchange`'s test is case-insensitive anyway. The total-miss
branch correctly leaves state alone (escalate-catalog text already carries the phrase — verified in exec
`11033897`: `variables.response` ends `…or would you like me to escalate to warehouse team?`).

FP2 proves the contract **only as a pair with X6**: FP2 asserts a *negative*
(`is_escalation_confirmation:false`, no HI guard), which any breakage also produces. X6's positive on the
unmodified phrase is what makes the pair informative. Both recorded → pair holds.

## 5. Decision (d) — PASS, verified in code *and* empirically

`crossdomain-render` has exactly one absence-suppressing line — `if (!rows.length) continue;` — and all 4
`lines.push` sites are positive facts. No `none on hand`/`no incoming` string anywhere in the deployed
body. The renderer **cannot** assert an absence.

Empirical on the final build (exec `11034175`, `SRTWT5800-FH`, both axes empty):
`_xdBlock = {block:"", any:false, probed_rows:0}` → `crossdomain-compose` returned `o` unchanged, **no
`_xdApplied` key, no phrase, no extra quick replies** — byte-identical to today. That is §6 rows 3/9 and
FP1 confirmed on the shipped version, not inferred.

Zero-**qty** rows correctly still rendered (format parity with `check stock`) — a different thing from zero
rows, and the distinction is right.

## 6. Display-only — PASS

`crossdomain-compose` writes only `user_response`, `variables.response`, `quick_reply` (partial branch) and
the debug key. `last_result_set` and `selection_context` never touched on either branch — confirmed against
exec `11033897`, where `selection_context:'suggest_offer'` and the 3-sibling `last_result_set` survive
intact alongside the block. Block is bullets (`- `) only; no `\d.` generator in the renderer. D3's number
contract is safe.

`crossdomain-zeroset`/`render` pass the validator payload through with only namespaced `_xd`/`_xdBlock`
keys added. Item count preserved (`return [{json: out}]`, and `compile-current-state` returns a single
object), so `crossdomain-compose`'s `.first()` cannot drop items.

## 7. Marker-anchored placement — 🚩 **FINDING F1** (the one real defect)

```js
const MARKERS = ['Related products:', 'Try:', 'Did you mean', 'Would you like me to escalate'];
...
const i = out.user_response.indexOf(mk);
```

`indexOf` is **case-sensitive**, and several live templates render the marker in **lower case**.
Marker census against live `build-suggest-offer` / `not-found-error-message`:

| template | earliest marker | anchored? |
|---|---|---|
| D3 sibling picker (bso L88) | `Related products:` | ✅ (above the numbers — X1 confirms) |
| D2 `Try:` mode (bso L348) | `Try:` | ✅ (X3 confirms) |
| D1 single-token (bso L272) | `Did you mean` | ✅ |
| not-found plain / breakdown (nf L155/210/225/229/236) | `Would you like me to escalate` (capital W) | ✅ |
| **D1 multi-token (bso L219 `"tok" — did you mean:` + L253 `…or would you like me to escalate…`)** | **none** — both lower-case | ❌ **`idx === -1` → block appended at the very END** |
| D1/D2 numbered "Here are the closest matches" (bso L250, L391) | none (lower-case escalate only) | ❌ same fallback — promotion-candidate arms, likely inventory-unreachable |

The D1 multi-token arm **is** reachable on an inventory/incoming turn: one product resolves-but-returns-empty
(→ `missing` with uuid → block) while ≥2 other tokens are genuine misses (→ D1 blocks). The plan itself
describes #3 and #2 as disjoint-and-co-occurring, so this combination is by design, not exotic. On that turn
the cross-domain block lands **below the numbered picker and below the escalate question** — precisely the
bug X2 was written to catch, resurfacing on an untested arm, violating locked Q16/O1 ordering.

Impact is UX/ordering only — no egress, no state, no picker-contract breach. Fix is one line:

```js
const hay = out.user_response.toLowerCase();
for (const mk of MARKERS) { const i = hay.indexOf(mk.toLowerCase()); ... }
```
(keep slicing the **original** string by that index). Then add a case for the D1 multi-token shape.

## 8. 🚩 FINDING F2 — `_xdApplied` will be PUT into the live customer session

On live, `save-session-vars` (the prod conversation-variables PUT) is fed **directly** by
`compile-current-state` and sends `jsonBody: {{ JSON.stringify($json) }}` — the *whole* item. After promote
it sits behind `crossdomain-compose`, so on every miss turn the PUT body gains a top-level debug key:

```js
out._xdApplied = { mode: 'total_miss', team: 'warehouse', lines: 7 };   // exec 11033897 — real
```

The clone cannot catch this: its session write is `pg-upsert-session` (a jsonb upsert that swallows any
shape), a **different node** from live's HTTP PUT. Given the ideation landmine (n8n is last writer of
`session_vars` and the CRM trusts the caller's shape), this pollutes the stored session and can surface in
the parser's `previous_conversation_state`. Risk is bounded — the endpoint already tolerates
`user_response`/`quick_reply` at top level — but it's a one-line removal. **Delete `_xdApplied` before
returning**, or `delete out._xdApplied` on the way out.

## 9. 🚩 FINDING F3 — the "ONLY by-name consumer" census is incomplete

Four live nodes reference `compile-current-state` by name. Two (`escalate-catalog`, `build-suggest-offer`)
are **comments** — harmless. The claim about `{user_response, quick_reply, variables.last_result_set}` is
**correct**: only the send node reads those. But a third real consumer was missed:

```js
// LIVE Call 'sub-respond-save-message-redis'2 → state_trace.after
try { if ($("compile-current-state").isExecuted) { after = $("compile-current-state").first().json.variables ?? null; } } catch (e) { after = null; }
```

That is the state-transition monitor's `after` layer (C5, promoted 2026-07-22). `crossdomain-compose`
mutates `variables.response`, so post-promote the **logged** `after` will not equal the **persisted** state
on partial turns. Observability-only, zero customer impact — but it is exactly the silent
logged-vs-persisted divergence C5 exists to detect. Either repoint it to `crossdomain-compose` or record
the divergence deliberately. It is **not** in the handoff checklist.

Also missing: live `compile-current-state` feeds **two** nodes (`save-session-vars`,
`sorento-sub-respond-sendmsg-respond2`), not the clone's three. The rewire must move **both**, and
`save-session-vars` must be included or the E1 state append never persists.

## 10. Open items — severity + promote gate

| # | item | severity | blocks promote? |
|---|---|---|---|
| a | **double probe** — root cause known: `Call 'sub-get-results'`/`validator` run **once per selected tool** (`tool-filter → Split Out1`), so zeroset/gate/probe run N times. Confirmed in exec `11033897` (validator runs 0 and 1 → sub-execs `11033905`+`11033907`). Output uncorrupted — compose runs once, block appears once. | LOW (2× CRM reads on every miss turn, forever, on live) | **No**, but apply `executeOnce: true` — free. Caveat: with `executeOnce` the block derives from run 0 only; on a genuinely multi-tool turn that's the right item here, but assert it once. |
| b | **X7 decline never run** | **downgrade to LOW** — traced: `If10 → is-escalation-declined → tag-escalation-declined` is **upstream of `get-results`**, so `validator`/`crossdomain-zeroset` never execute and `crossdomain-compose` short-circuits at `if (!rNode.isExecuted)`. `Escalation declined.` is structurally immune. | No. Run for completeness. |
| c | 4 divergent miss templates | pre-existing, out of scope | No |
| d | attachment discarded on cross-domain incoming (`FFAU3176932.xlsx`, real in exec `11033897`) | correct call — senders deliberately orphaned; sending is an egress path needing its own review. ✅ **Own review now scoped: `plans/crossdomain-attachment-plan.md` + `tests/UAC.md` §XA (2026-08-04). Ships SEPARATELY, AFTER this change** — it is the only one of the three pending changes that creates a new real-egress path on live | No |
| e | **§6 row 5 (disambiguation) not gated in code and not tested** | LOW — satisfied *structurally*: a `require_specific` turn goes `If3`-TRUE, bypassing `validator`, so zeroset never runs. Record the reasoning; don't add a guard. | No |

## 11. Green-that-cannot-fail audit

**Trustworthy:**
- **X3 (exec `11033897`)** and **the both-empty case (exec `11034175`)** — both started *after* the final
  write (06:03:29Z), runData read directly. The two loads worth staking the review on.
- **FP2 + X6 as a pair.** Alone FP2 is a bare negative; paired with X6's positive it's a real instrument.
- **FP1 + X1/X3 as a pair.** FP1 alone passes identically if the whole feature is inert. Paired with a
  block-present case from the same build it's sound — and exec `11034175` independently re-proves (d)'s
  pass-through.
- **X9/X10 no-ops** — same reasoning: they'd pass on an inert build; meaningful only next to a positive case.

**Needs a re-run or an exec id:**
- **Post-publish race attribution.** Clone's last write `06:03:29.376Z`. Only 11 executions exist after it
  (`11033562` … `11034175`, ending 06:09:44Z), and `11033562` is 13s post-write — inside the discard window.
  **The run log maps no case to an exec id**, so for most GREENs the producing build is unknowable. Fix
  cheaply: re-run the suite recording `case → executionId`. Without that, "X1/X4/X5/X11a/X11b PASS" are
  claims, not evidence.
- **X8 (number-pick → sibling)** recorded as "user-verified manually" with no exec id. It guards the
  Q12/Q15 contract — the thing protecting D3's picker. Needs a run with a runData assertion that the pick
  resolved to `last_result_set[n]`, not a cross-domain row.
- **Shadow gate coverage** — see §2. AND-mode and PICKED-strict never sampled; code proof substituted.

**Documentation drift:**
- `tests/harness/crossdomain-render.reference.js` is **STALE** vs the deployed node — lacks the
  deterministic sort and the entire LEAD-IN block. The handoff points at it as "renderer reference copy".
  Re-sync or delete it; a stale reference is how a future promote ships the wrong body.
- `tests/UAC.md` has **no crossdomain X-section at all** (grep returns nothing). Plan §8.1 step 2 required
  the expectations there. The X-cases exist only in the plan and run log.
  `tests/cases/crossdomain-stock-incoming.json` has no `require_specific` fixture.

---

# PROMOTE CHECKLIST (user-gated — do not promote unprompted)

**Blocking fixes on the clone first (then one re-run + re-review of the two hunks):**
- [ ] **F1** — make the `MARKERS` search case-insensitive in `crossdomain-compose`; add the D1 multi-token
      shape. Re-test with an inventory turn combining a resolved-empty product + ≥2 unresolved tokens;
      assert the block sits **above** the escalate question.
- [ ] **F2** — stop emitting `_xdApplied` (or `delete out._xdApplied` before return). It would otherwise
      enter the live conversation-variables PUT body.
- [ ] `executeOnce: true` on `crossdomain-probe`.
- [ ] Re-run the suite on the final build recording **case → executionId** in `tests/runs/`. Include X7 and
      X8-with-an-exec-id. Discard the first run after any write.
- [ ] Re-sync or delete `tests/harness/crossdomain-render.reference.js`; add the X-cases to `tests/UAC.md`.

**Then the promote itself (strip all guard scaffolding):**
- [ ] Backup live `activeVersionId` `a40cd16d-c404-4d82-bc46-8a2e756e9dc1` (already at
      `backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json` — re-verify it still matches).
- [ ] Pre-check live **draft == active** (verified clean today: zero differing nodes) — LESSONS §24/§51.
- [ ] **Remap `crossdomain-probe.workflowId`: `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR`.**
- [ ] **Do NOT copy `is_test` anywhere.** The clone's send node and 8 sendmsg callers carry `is_test:true`;
      copying that to live logs replies instead of sending them (LESSONS §48a). The promote touches **only**
      the 3 by-name expressions on live's send node.
- [ ] **🚩 Repoint live `sorento-sub-respond-sendmsg-respond2`'s three expressions**
      `$('compile-current-state').first().json.{user_response, quick_reply, variables.last_result_set}` →
      `$('crossdomain-compose')`. Rewiring alone is inert.
- [ ] **Rewire BOTH live consumers.** Live `compile-current-state` feeds `save-session-vars` **and**
      `sorento-sub-respond-sendmsg-respond2` (two, not the clone's three). `save-session-vars` uses
      `JSON.stringify($json)` — reading from its input, so the rewire *does* carry the E1 state append.
      Omit it and the partial-turn "yes" never reconciles on live. **This half of the E1 contract was never
      exercised on the clone** (clone writes via `pg-upsert-session`, a different node) — verify post-promote
      on a real partial turn.
- [ ] **Decide `Call 'sub-respond-save-message-redis'2`** (F3): repoint `state_trace.after` to
      `crossdomain-compose`, or record the logged-vs-persisted divergence deliberately.
- [ ] Port `compile-current-state` as **LIVE 528L + the two verified hunks only** → 464L.
      `diff live ↔ target` must show *only* the hoist consumption and the `_noun` line.
- [ ] Add the 5 new nodes; splice `validator → zeroset → gate → {TRUE: probe → render | FALSE: —} → If6`.
      Live's `validator → If6` is the single edge to cut. All by-name dependencies of the new nodes exist on
      live with identical names: `validator`, `If6`, `resolve-entity`, `get-session-vars`,
      `Call 'sub-query-reformulator'`, `sorento-sub-respond-findcontact-respond`, `Aggregate`,
      `central-exchange`, `compile-current-state` ✅.
- [ ] Target by **NAME**, never clone IDs; strip trailing whitespace; per-node byte-SHA gate draft==file →
      publish only on match → re-fetch active==file (LESSONS §58).
- [ ] `publish_workflow` after `update_workflow`.
- [ ] Post-promote smoke `Pls check eta SRTWT5800` (read-only). **Do NOT smoke the "yes" leg on a real
      contact** — RISK-3 means the phrase now arms on turns that *did* return data, and a bare "yes" is a
      real staff assignment ripple. This is the only new path to a real write created by this change; it is
      user-accepted (Q8b) but should be watched for a few days.
- [ ] Rollback: `publish_workflow` `a40cd16d`; #3 alone restorable from
      `tests/diffs/zerostock-inline-computation-preserved.js` (verified byte-exact against live 220–321).

**Scope/tier:** `deterministic` is correct — Code/If/executeWorkflow(read) only, no parser edit, no LLM node
added. Matches what was tested.

**Live spine confirmed untouched:** `9qVyfUxmRQqrpGRMDLRuz` versionId == activeVersionId ==
`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z` (predates this session), zero
`crossdomain*` nodes, zero draft-vs-active param deltas.
