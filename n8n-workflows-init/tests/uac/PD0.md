# UAC §PD0

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §PD0. Offline `compile-current-state` unit (0-token, no seed) — spine-Code gate (plan V-PD-compile)

Pin `compile-current-state` `$()` inputs via `prepare_test_pin_data`→`test_workflow`: `resolve-entity`,
`disallowed-entity-gate`, `central-exchange`, reformulator `q`, `get-session-vars`, per the plan §9
partial-miss fixture (`SRTWT902` resolved + `SRTW808`/`SRTW809` missed w/ alts). No LLM, no egress. Assert the
plan §9 acceptance points 1-6 on the CHANGED clone `compile-current-state` (in particular §9.5: `variables.response`
carries the SINGLE bracket `[M did-you-mean suggestions active]` and NO `[results numbered]`), and run the
current LIVE jsCode on the same input as a negative control (marker/`dym_last_result_set`/survival asserts go
RED on live).

### §PD-compile-R ★ — no-miss happy path BYTE-IDENTICAL — HARD REGRESSION GATE
- Reduce §PD0 fixture to `SRTWT902` alone. Assert changed `compile-current-state` output **byte-identical**
  to current LIVE: no `response` marker, `last_result_set` = stock rows, `selection_context` null, no
  `dym_last_result_set`, `dym_offer` lifecycle unchanged (rule 5 kills a carried offer on the answered turn).
- **Fail-on-purpose:** the byte-diff must be non-empty when run against the §PD0 (miss) fixture — proves the
  comparison is a real instrument, not a tautology.

### §PD-dym ★ — bare number → DYM candidate, ALL domains (real reformulator) — PRIMARY, `parser`
- Driver `chat-stateful` (reset `respond_contacts_test` ONCE before T1). T1 = plan §9 partial-miss **inventory**
  query; marker = `[M did-you-mean suggestions active]` (SINGLE bracket — v3 has NO `[results numbered]`).
  Real reformulator + resolver, egress structurally blocked (full clone, all subs `is_test:true`).
- **T2 = `"2"`** (fresh T2) → **ASSERT** parser `reference_positions=[2]` AND `reference_target="dym"`;
  `output_exchange` numbered-dym handler fires → resolves `dym_last_result_set[2]` → in-place replace via
  `for_raw` (`dym_pick_applied=true`, `dym_offer_pick_code` set); result `last_result_set` untouched; resolved
  `SRTWT902` entity RETAINED; `reference_positions` cleared so the byIdx block no-ops.
- **LESSON-39 scoring:** resolves to DYM candidate #2 = PASS; safe new-query abandon = PASS; resolves to a
  result row = soft FAIL, RECORD. Run ≥3×; a systematic wrong outcome blocks promote (R-v3-3).
- **Safety:** §0 all; S6 parser tier (only the reformulator LLM runs); S8 — fork carries `memoryPostgresChat`,
  isolated `is_test:false` fork runs BARRED, so test via full clone only.

### §PD-dym-multi ★ — MULTI-SELECT bare numbers → BOTH DYM candidates (real reformulator) — PRIMARY, `parser` — **NEW v3**
- Same T1 as §PD-dym (partial-miss with ≥2 missed tokens: `SRTW808`→dym rows 1-3, `SRTW809`→dym row 4).
- **T2 = `"1, 4"`** (and variant **`"1 and 4"`**, fresh T2 each) → **ASSERT** parser
  `reference_positions=[1,4]` AND `reference_target="dym"`; `output_exchange` **LOOPS** both positions →
  resolves `dym_last_result_set[1]` (for_raw `SRTW808`) AND `dym_last_result_set[4]` (for_raw `SRTW809`), so
  **BOTH** source tokens are replaced (replacements ACCUMULATE, not clobber — assert both candidate codes
  present in `entities`); `dym_pick_applied=true`; result `last_result_set` untouched; resolved `SRTWT902`
  entity RETAINED; `reference_positions` cleared. get-results returns stock for both picks (or #3's
  `No stock records found for:` note if a pick is empty).
- **LESSON-39 scoring:** resolves BOTH correct dym picks = PASS; safe new-query abandon = PASS; drops one pick
  OR resolves the wrong set = soft FAIL, RECORD. Run ≥3× each phrasing; a systematic drop/mis-route blocks
  promote (R-v3-3).
- **Same-token multi-pick edge (R-v3-1, flagged for user decision):** if run with `"1, 2"` (two candidates for
  the SAME missed token) the expected behavior depends on the R-v3-1 decision (accumulate-both vs last-wins per
  `for_raw`). Record the observed behavior; do NOT hard-fail until R-v3-1 is decided.
- **Safety:** §0 all; S6 parser tier; S8 full clone only.

### §PD-result ★ — result-qualified phrase → STOCK row (real reformulator) — PRIMARY, `parser`
- Same T1. **T2 = `"the 2nd one"`** (and variants **`"product 2"`**, **`"price of the first stock"`**, fresh
  T2 each) → **ASSERT** `reference_target="result"`; numbered-dym handler SKIPPED; the STOCK row resolves via
  the UNCHANGED byIdx over `last_result_set`; no dym pick applied.
- LESSON-39 scoring: resolves the correct STOCK row = PASS; safe abandon = PASS; resolves a DYM candidate
  (wrong set) = soft FAIL, RECORD. Run ≥3×.
- **Safety:** §0 all.

### §PD-classifier-ratio — bare-number↔result-phrase, both directions (real reformulator) — `parser`
- Sweep the §PD-dym / §PD-dym-multi / §PD-result phrasings and **report a pass RATIO** per direction:
  bare-number→dym (incl. multi `"1, 4"`/`"1 and 4"`) and result-phrase→result. A systematic wrong-default
  (e.g. bare number routing to result, or a multi drop) is a promote blocker (R-v3-3/R-v3-5).

### §PD-fullmiss ★ — full-miss dead-end (change #1) numbered pick STILL resolves (real reformulator) — REGRESSION
- T1 = a pure full-miss query (all tokens miss → change-#1 dead-end offer: `last_result_set` = dym suggest
  set, `selection_context='suggest_offer'`, NO `dym_last_result_set`). **T2 = `"1"`** → **ASSERT** the pick
  resolves against `last_result_set` (dym) via the UNCHANGED byIdx path (numbered-dym handler skipped
  because `dym_last_result_set` is absent) — byte-identical to change-#1 behavior today.
- **Safety:** §0 all.

### §PD-noref-R ★ — no-dym normal turn byte-identical + replay `norm()` rule — REGRESSION
- Normal stock turn, NO miss. **T2 bare number** → parser `reference_target=null` → byIdx over stock
  `last_result_set` resolves the stock row (today's affordance intact). Assert `output_exchange` output for
  a no-dym turn is byte-identical to today apart from the new `reference_target:null` key.
- Register the LESSON-40 replay `norm()` rule: drop `reference_target` when null on both sides; retain when
  non-null. Show a sample of golden turns does NOT diff on it.
- **Safety:** §0 all.

### §PD-promote — LIVE promote gate (not a case — the protocol)
- **Order (LESSON 51, separate publishes):** parser sub `XTODTw` FIRST (prompt + `output_exchange`, one
  publish), THEN spine `9qVyfUxmRQqrpGRMDLRuz` (`compile-current-state`). Parser-first keeps every
  intermediate state safe (spine writing an unread field = inert; parser reading an unwritten field →
  `reference_target=null` → today's behavior).
- Built as **live + own hunks** (LESSON 57 — the fork carries an extra orphaned `Postgres Chat Memory`
  node; never block-copy it), target by node **NAME** (LESSON 58c), byte-SHA gate both sides of each
  publish, backup-first, user-gated, live-write permission is USER-added (LESSON 58a — not self-grantable).
- Post-promote verify on a REAL partial-miss turn (LESSON 56 — the SPECIFIC paths, BOTH directions): `"2"` and
  `"1, 4"` route to dym (both picks resolve), `"the 2nd one"`/`"product 2"` route to stock.

### Coverage / notes (this change)
| aspect | case |
|---|---|
| result `last_result_set` KEPT; dym in a separate slot (idx 1..M local, R3); SINGLE-bracket marker in `response` | §PD0 (+ live negative control) |
| no-miss happy path byte-identical | §PD-compile-R (HARD, spine Code) |
| bare number → DYM, all domains | §PD-dym (PRIMARY, real reformulator) |
| MULTI-SELECT "1, 4"/"1 and 4" → BOTH dym picks | §PD-dym-multi (PRIMARY, real reformulator) — **NEW v3** |
| result-qualified phrase ("product 2"/"the 2nd one") → RESULT | §PD-result (PRIMARY, real reformulator) |
| classifier reliability ratio, both directions | §PD-classifier-ratio (real reformulator) |
| full-miss dead-end pick still works | §PD-fullmiss (regression) |
| no-dym turn byte-identical + replay rule | §PD-noref-R (regression, LESSON 40) |
| live promote protocol | §PD-promote (parser sub first, then spine) |
| ~~NUMBERED result + bare number → CLARIFY~~ | **REMOVED v3 (§PD-ambiguous / §PD-followup deleted — user rejected clarify)** |

- **Three business-diff nodes across two workflows** (plan §5): spine `compile-current-state` (`0804657c`,
  Code); parser sub `XTODTw` AI-Agent `systemMessage` (PROMPT) + `output_exchange` (`847a1173`, Code).
- **Decisions status (plan §7, v3):** **R1 clarify — REMOVED** (`reference_target` enum simplified to
  `result|dym|null`; no `ambiguous`). **R2 — CLOSED** (marker back to the single bracket
  `[M did-you-mean suggestions active]`; `[results numbered]` deleted; no wording sign-off outstanding).
  **R3 LOCKED** — dym idx LOCAL `1..M`, no offset, ALL domains. **R-v3-1 (NEW, OPEN)** — same-token multi-pick
  (`"1, 2"` both alts of one token): accumulate-both (recommended) vs last-wins per `for_raw` — **the one open
  pre-coding decision**. R-v3-2 bare-number-loses-stock-pick trade-off ACCEPTED. R-v3-3/-4/-5 (classifier
  reliability, replay `norm()`, live-parser blast radius) are process acknowledgements.

---

# Change: `turn-id-threading-completion` (escalation-path turn_id — cycle 2 of obs-latency-contract)

**scope: `deterministic`** — no parser, no get-results change. Every clone case injects
`mock_reformulator_output`; zero parser tokens.

Full spec: `plans/turn-id-threading-completion.md` (**REV 2**, user decisions folded in). Cases are
enumerated there as **§OBS-8 … §OBS-17** with triggers, expected paths, structural output assertions
and per-case §0 bindings; that document is the executable source and is not duplicated here.

**Why:** C1–C4 shipped, but post-promote verification found `turn_id: null` on outgoing escalation rows.
Cycle 1 enumerated the *spine's* sendmsg callers only. The true census is **15 sendmsg callers** (not 9)
and **4 save-sub callers**; `sub-human-intervention` (`rrYXzE61gCNUck_zmXe-G`) calls sendmsg three times
and passes no `turn_id`. Escalations are the slow turns, so excluding them biases p99 **optimistic**.

**Census: CLOSED and EXHAUSTIVE, 66/66 workflows** (rev 2). The nine previously-unreadable workflows
were re-scanned after `availableInMCP` was enabled; none contains any `executeWorkflow` node, so none
can be a caller. The "57 of 66" caveat is retired. Counts are final at 15 / 4.

**Acceptance (two co-equal criteria):**
1. an **escalation** turn produces one incoming row and one outgoing row sharing a single non-null
   `turn_id` equal to the **spine** execution id;
2. a **rate-limited** turn produces one incoming row and one outgoing row sharing a single non-null
   `turn_id` equal to the **ingress workflow's** execution id — on `sorento-main` **and** on
   `sorento-main-INJECT`.

**Rev-2 reclassification (user decisions).** `sorento-main` (#14) and `sorento-main-INJECT` (#15) are
**TURN-BOUND**, not proactive. Today a rate-limited turn produces **zero rows in either direction**:
the incoming is dropped before `Redis2` so no spine execution and no incoming row exists, and the
outgoing save crashes on the unguarded `contact.phone` deref. The customer receives the notice; neither
message is in the log. Hop 3 mints `turn_id` locally as the ingress workflow's own `$execution.id` and
logs both rows. **`sorento-main-INJECT` is currently carrying 100 % of production ingress** (55/55
sampled `sorento-main` executions drop at `in-failover?`), so it is promoted **first**.

**Binding:** every case is bound by §0 S1–S6 + S7 (**as replaced by the H1 sink-delta + payload
attribution gate — S7 as written must not be used**) + S8 (**as amended above: structural absence of
credentialed send nodes, not pinning**), plus the S3 extension.

**Case index**
| case | proves | mode |
|---|---|---|
| §OBS-8 | turn_id reaches `sub-human-intervention` | clone, guard-closed, zero-egress |
| §OBS-9 | HI forwards it to sendmsg (≠ HI's own exec id, ≠ sendmsg's) — PRIMARY | sub-level, guard-open, H2 stand-ins |
| §OBS-10 | out-of-hours caller `c5dd9961` threads | sub-level |
| §OBS-11 | working-hours caller `0ca5413f` threads | sub-level |
| §OBS-12 | **ACCEPTANCE** — incoming/outgoing pair on one turn_id | clone, end-to-end |
| §OBS-13 | proactive callers (#12, #13 only) still emit JSON `null` (negative) | sub-level |
| §OBS-14 | H4 — contactless caller yields a complete row, not a crash | sub-level, conditional on H4 bundling |
| **§OBS-15** | **ACCEPTANCE 2** — rate-limit turn logs both rows on one turn_id | `sorento-main TEST`, `Redis1` pinned to 31 |
| **§OBS-16** | INJECT twin identical — failover traffic gets the same semantics | `sorento-main-INJECT TEST`, injected-shape fixture |
| **§OBS-17** | H6 — #12 writes no row; multi-part loop-back control | sub-level, **conditional on H6, not recommended** |

**Deliberately turn_id-free (proactive, excluded from the SLA denominator by design):**
`respond-close-convo` (#13) and `schedule-working-day-detection` (#12) **only**. Null `turn_id` means
*deliberately outside the denominator*, never *unknown* — a contract point the CRM side must confirm.
`sorento-main` / `sorento-main-INJECT` were removed from this set in rev 2.

**Hunks, separately rejectable:**
- **H4** (guard `contact?.` in both sendmsg save blobs) — recommended, and **no longer a prerequisite
  for anything**: Hop 3 passes a real `contact` from `$('If1')`, so #14/#15 leave the contactless set.
  Rejecting H4 breaks neither hop; it leaves #5/#6 producing no outgoing row.
- **H6** (#12 not logged at all, user decision 2) — **specified but NOT recommended.** It needs a new
  `skip_log` input plus two IF nodes on the live shared sendmsg sub, including a rewire of the
  **loop-back edge** whose failure mode is silent truncation of multi-part messages. It buys nothing
  that `turn_id: null` does not already buy, and it creates the mirror image of the transcript hole
  decision 3 exists to close. See plan §2.2.

**Prerequisites (blocking):** H1 must land in §0 before the first run; H2 stand-ins must exist before
any `is_test:false` run; **ingress clones of `sorento-main` and `sorento-main-INJECT` must be built and
contained (plan §7.7) before §OBS-15/16** — in particular `Redis2` must be structurally unable to push
to the prod queue `main-message-list`; the **`sorento-main` draft divergence** (`in-failover?`
`typeValidation` draft `strict` vs active `loose`) must be reverted to `loose` in a separate
zero-functional-change publish before the feature publish (plan §7.6).

---

# Change: `chat-console-replyto-parity` — plan `../plans/chat-console-replyto-parity-plan.md`

Two deltas, two scope tags. **§25 = delta A** (zz-chat quote-reply parity, scope **`deterministic`**,
touches NO live workflow). **§26 = delta B** (delete the `reply to:` concatenation, scope **`parser`**,
**touches LIVE** — clone first, promote user-gated). **§DC = the two canaries owed by the live
`tryDymPick` prior-domain deletion**, scope **`parser`**, currently **VOID** pending §DC-0.

Notation for §25: **Chat input** = text typed into `zz-chat oyYfVvZHRZpWubTy` (contact fixed `437264483`,
`mode:'chat-stateful'`, `contact.chat_id = sessionId`). Quote turns use `/replyid <message_id> <text>`
(deterministic) or `/reply <n> <text>` (handle from the transcript). Every case is bound by **§0 S1–S8**;
a §0 failure is a hard fail regardless of functional correctness.

> **Grounded premise corrections (measured live 2026-07-31 — do not re-derive):**
> (a) `tf-message` output = the respond.io **body**, so consumers read `json.message.replyTo`; the console's
> `build-item` puts `replyTo` at `item.message.replyTo`, one level too shallow → **undefined today**
> (clone exec `10626106` vs live exec `10590713`). A patch that merely fills the existing `replyTo:{}` is a
> silent no-op. (b) `log-chat-history-n8ntest` writes `message_id` as the literal `NULL` and `result` as an
> **object**; the CRM's `get_referenced_result_set` returns `None` for anything that is not a **top-level
> array**. (c) the console lane reads session via `pg-get-session` (Postgres), so the CRM `?message_id=`
> node `get-session-vars-http` **never runs** for a console turn — the harness must mirror the lookup, and
> the CRM HTTP route itself stays **untested by this harness**.
