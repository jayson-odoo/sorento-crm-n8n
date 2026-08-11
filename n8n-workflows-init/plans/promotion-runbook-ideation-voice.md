# Promotion runbook — ideation intake + multi-modal voice

**Status: PLAN ONLY. Nothing promoted. Every step is user-gated.**
Written 2026-07-20 from the live instance via MCP/REST (not from files).

Sources: `ideation-intake-plan.md` (Rev 4/5), `ideation-multimodal-n8n-plan.md`.

---

## 0. Backup versionIds (record BEFORE touching anything)

| workflow | id | active versionId (rollback target) |
|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | **`e8ade920-d655-423f-96cb-4651d1582814`** |
| live parser `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | **`b7955057-1561-4057-aed8-09672b1a8872`** |
| clone (source of truth for the diff) | `txiPzSxy3Pclsz6v` | `d2b13410-0e6e-4d66-bc77-d287f134d08c` |
| parser fork (source) | `wI5RkNGW3EOJfBdo` | `d2fea43e-6793-41d2-af6b-854dfe17952f` |

Rollback = `publish_workflow` with the recorded versionId. Verify `versionId == activeVersionId`
after every publish.

---

## 1. HARD BLOCKERS — do not promote until all clear

| # | blocker | owner | why it blocks |
|---|---|---|---|
| **B1** | `handle_turn(session_vars=…)` + drop `overwrite_for_contact` | sorento | **Ships a feature that passes every clone test and fails on the first real conversation.** In live, n8n's `save-session-vars` PUT overwrites the whole blob with `compile-current-state`'s rebuild, which has NO top-level `ideation` key — clobbering the endpoint's flat pointer. Turn 2 then reads `session_vars.get("ideation")` → None → **new draft every message**; `missing` never shrinks, "confirm" never confirms. The clone hides this because its write goes to n8n_test, leaving prod's copy intact. |
| **B2** | register access agent `ideation` (+ grant) | CRM | `POST /external/access-agent/check` returns `deny_unknown_agent` → **every** ideate turn denied. Fail-closed, so safe, but the feature is inert. |
| **B3** | respond.io contact field `is_allowed_voice` | respond.io | Gate is fail-closed → nobody can use voice until the field exists and is set true. |
| **B4** | golden-master replay R1/R2 | this repo | **HARNESS REPAIRED (§5). Layer 2 (parser) DONE + diffs user-accepted. ⏳ Layer 1 (spine, 312 turns) still needs ONE clean sequential run — the only run so far was cancelled after concurrency contamination at ~turn 61.** |
| **B5** | Whisper `language=en` decision | user | Conflicts with DC-5's multilingual intent. A genuine Malay/Chinese voice note will transcribe **badly rather than loudly**. Decide: keep `en` / per-contact / two-pass. |

**Known-shipping-incomplete (accepted, not blockers):**
- `is_new_idea` (DC-10) not built → a second, unrelated idea **merges into the open draft**
  (reproduced live: draft `5bc4f24f` holds 3 ideas). Ships as a known defect unless built first.
- `media_selection` built but **never end-to-end tested** (needs sorento media lookback deployed).

---

## 2. Change inventory — PROMOTE vs STRIP

### 2a. Parser: fork `wI5RkNGW3EOJfBdo` → live `XTODTw-dJcV0uRdC056hG`

| change | action |
|---|---|
| `AI Agent.systemMessage`: `submit_idea` intent, `ideate` domain enum, DECISIVE-TERM block, `== IDEATION CONTINUATION ==`, ROUTING line | PROMOTE |
| `output_exchange`: `submit_idea` in `_DECISIVE_INTENTS` | PROMOTE |
| `output_exchange`: `deriveRouting` `case 'ideate' → {team:null, agent:'ideation'}` | PROMOTE |
| ~~domain-continuity-carry (rev4)~~ | **N/A — ALREADY LIVE** |

✅ **B-PARSER RESOLVED (2026-07-20) — it was based on a stale memory. The fork is a CLEAN
single-concern diff.** domain-continuity-carry is **already deployed** on live `XTODTw` (live was
updated 2026-07-16, one day after the "promote HELD" note was written). Verified directly:
- AI Agent `.text` has no `Previous domain:` line (Edit 1a shipped);
- the domain-word leak is neutralised in the prompt —
  `.replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn')` (Edit 1b shipped);
- live `output_exchange` already has `_DECISIVE_INTENTS`, `_explicit`, `domain_signal_source`,
  `domain_reused_entityless`, `domain_inherited_compatible`.

**Actual fork↔live delta (diffed, nothing else):**
- `output_exchange`, 14 lines: `case 'ideate'` in `deriveRouting` + `'submit_idea'` in `_DECISIVE_INTENTS`
- `systemMessage`, 33 lines: `submit_idea` intent, `ideate` in the domain enum, the ideate
  DECISIVE-TERM block, the `== IDEATION CONTINUATION ==` section, the ideate ROUTING line
- `AI Agent .text`: **byte-identical**

So promoting the fork ships ONLY the ideation work. No second change rides along.

⚠️ **This RAISES the stakes on a clean Layer 2**, it doesn't lower them: with continuity already
live, any CRM-domain churn a clean A/B shows would be attributable to the **ideate prompt hunks**
— there is no other candidate left to blame.
The fork's ROUTING line still reads "suggested_agent: null" for ideate (stale wording — the code
in `deriveRouting` is authoritative and returns `'ideation'`); inert, fold in on the next prompt edit.

### 2b. Spine: clone `txiPzSxy3Pclsz6v` → live `9qVyfUxmRQqrpGRMDLRuz`

**PROMOTE (business logic):**
1. `If-ideate` (new IF, `domain_hint == 'ideate'`); repoint `If2` FALSE → `If-ideate`; `If-ideate`
   FALSE → `If10`. Live `If2` currently fans out `divert-suggest-yes || If10` — confirmed insert point.
2. `ideate-turn-http` (POST turn endpoint, `x-api-key` — **NOT** Bearer; the hand-off doc is wrong,
   code is `Header(alias="X-API-Key")`). Body: `respond_io_id`, `message_text`, flat
   `session_vars:{ideation}`, `submitter_name`, conditional `media_selection`.
3. `build-ideate-reply` (both pointer shapes + link de-dup) → `compile-current-state`.
4. `compile-current-state`: `_ideate` override + `ideation` variables key with carry-forward.
5. STT chain: `if-audio-in` → `fetch-audio` → `whisper-transcribe` (`language: en`,
   `binaryPropertyName: data`) → `patch-transcript` → `tf-message`; plus
   `if-transcribed-confirm` → transcript-confirmation send.
6. `if-voice-allowed` + `send-voice-not-allowed` (per-contact voice gate).

**STRIP (harness-only — must NOT reach live):**
- `ideate-egress-gate`, `ideate-turn-mock`, `ideate-turn` NoOp → wire `If-ideate` TRUE **directly**
  to `ideate-turn-http`, and repoint `build-ideate-reply`'s `$('ideate-turn')` reference to
  `$('ideate-turn-http')`.
- `if-audio-mock` (mock_transcript lane), `if-audio-b64` + `decode-audio-b64` (console base64 lane)
  → wire `if-voice-allowed` TRUE **directly** to `fetch-audio`.
- `patch-transcript`: drop the `mock_transcript` fallback; keep the Whisper `$json.text` path.
- All sends must target the **real** sub (`sorento-sub-respond-sendmsg-respond`), NOT
  `sub-sendmsg-CHAT`. Affects `send-transcript-confirm` and `send-voice-not-allowed`.
- `is_test: true` on promoted send nodes → live values.

**DO NOT PROMOTE AT ALL:** `zz-chat`, `zz-voice`, `zz-dispatcher-test`, `tools/voice-console/`,
every `guard-*`/`fixture-*`/`replay-*`/`sim-inject-gate`/`session-*-gate` node, `pg-get-session`,
`pg-upsert-session`.

**OPTIONAL:** add `contact` to live `sorento-sub-respond-sendmsg-respond5`. No-op for the real sub
(it addresses by `contact_identifer`); only the CHAT sub needs it. Harmless consistency fix.

### 2c. Node-name compatibility check (verified)

`compile-current-state`'s ideation carry reads `$('get-session-vars')`. On the **clone** that is a
NoOp converging the http + pg lanes; on **live** it is the httpRequest node itself — same name,
and the CRM response shape (`{session_vars:{variables:{…}}}`) satisfies the same expression.
**Re-verify on the live copy before publishing** — this is a name collision that happens to work,
not a designed contract.

---

## 3. Sequence (subs before parents; verify between每 step)

1. Clear B1–B5. Re-read this runbook against live (IDs drift).
2. Record backup versionIds (§0).
3. **Parser first** (`XTODTw`) — publish + verify `versionId == activeVersionId`.
   Smoke: one CRM turn per domain (stock / order / promotion / attachment / casual) on the LIVE
   bot using the dev contact `437264483` ONLY. Assert routing + domain unchanged.
4. **Spine** (`9qVyfUxmRQqrpGRMDLRuz`) — apply §2b PROMOTE with §2b STRIP applied. Publish + verify.
5. Live smoke on `437264483` only: text ideate → collecting → review → confirm → complete + link;
   voice ideate (needs `is_allowed_voice`); voice denial; CRM regression; access denial when
   `ideation` is revoked.
6. Watch the first real non-dev ideate turn end-to-end before announcing.

**Rollback:** republish §0 versionIds — parser and spine independently. Because `If2` FALSE is the
only rewired existing edge, reverting the spine restores the exact prior ladder.

---

## 5. B4 — the regression harness is STALE AND BROKEN (found 2026-07-20)

**The golden-master replay has been silently producing zero-signal runs since the per-contact
concurrency dispatcher landed (~2026-07-09).** Discovered by running it (exec `9335261`, canceled).

| | key |
|---|---|
| `sorento-regression-replay` `Clear List`/`Push Item` | `main-message-list-test` (OLD arch) |
| clone `redis-pop-main-message-list` | `=test:q:{{ $json.contact }}` (per-contact queue) |
| `Fire Clone` inputs | `{source, mode}` — **no `contact`** |

So the pop key resolves empty, every turn returns `{"message": null}`, the flow dies at
`tf-message`, and the diff reports **everything missing**. The first run showed 1,310 `missing` +
108 `regression` across nodes nobody touched (`tf-message`, `redis-pop`, `If2`,
`is-human-intervened`) — a **false catastrophic-regression report** that could easily have been
mistaken for damage from the ideation/voice work.

**Also fixed on the way in:** `Init Params` defaulted `baseline_golden_run_id: 9` while
`source_view: 'v_turns_r0704'`. Verified pairing — golden 12 matches 312/312 of that view's
triggers; golden 9 matches **0/312**. Default corrected to 12. (Old default = 100% spurious diffs.)

### Repair (3 edits, mirrors how `zz-dispatcher-test` invokes the clone)
`Build Item` already emits `conversation_id`, which IS the contact id used by the corpus.
- `Clear List` key → `=test:q:{{ $json.conversation_id }}`
- `Push Item`  key → `=test:q:{{ $json.conversation_id }}`
- `Fire Clone` inputs → add `contact: "={{ $json.conversation_id }}"`
  (dispatcher precedent: `call-spine` passes `{contact: String(...)}`)

Then re-run and triage. Expected legitimate diffs: `compile-current-state` gains
`ideation: null` on EVERY turn; plus genuine drift from features shipped since 2026-07-07
(the golden's capture date) — attribute by node before concluding anything.

### Repair APPLIED + Layer 1 interim result (2026-07-20, replay run id 14, exec `9335930`)
The 3 edits above were applied and the `Init Params` default corrected to 12. Sanity check after
the fix: the clone popped a REAL message and ran **36 nodes** (was 4), `missing` fell **1310 → 1**.

Interim triage at 32/312 turns — `compile-current-state.variables` key-level diff:
| key | turns | attribution |
|---|---|---|
| `ideation` | 36 | **THIS WORK** — additive, expected on every turn |
| `dym_candidates` | 36 | post-golden drift (dym-candidate-map) |
| `response` | 8 | post-golden drift — **not-found itemize**: golden has the old suggest-offer wording, replay has the shipped itemized format |
| `selection_context`, `last_result_set` | 1 each | post-golden drift |

`new`-status nodes are all either this work (`If-ideate`, `if-audio-in`, `if-transcribed-confirm`)
or post-golden features (`console-incoming-gate`, `sibling-gate`). `When Executed by Another
Workflow` diffs because the harness fix now passes `contact` — an artifact of the repair, not a
spine change.
**No unexplained regression so far.** ⏳ Run must COMPLETE (312 turns) and the tally be re-checked
before B4 can be signed off.

### Layer 2 RESULT — parser regression, 30 turns, REAL parser (replay_run 15, exec `9337335`)

Run with `turn_limit=30, unpin_parser=true` (knobs added to `Init Params`/`Select Turns`/
`Build Item`; **defaults restored to classic afterwards**). Confirmed genuinely unpinned:
the clone's reformulator call showed `subExec=wI5RkNGW3EOJfBdo` (the fork), not a pin.

```
turns: 29   domain_changed: 12   became_ideate: 0   became_submit_idea: 0
```

✅ **ZERO historical messages reclassified into `ideate`/`submit_idea`.** This is the risk the
classic replay structurally cannot see, and the reason Layer 2 exists. The ideate prompt additions
(new domain enum value, DECISIVE-TERM block, IDEATION CONTINUATION section) did not hijack a
single CRM turn.

⚠️ **But 12/29 CRM-domain reshuffles remain, and they are NOT yet attributed:**
```
inventory -> null              2      master_products -> incoming    1
inventory -> order             2      portal_link -> master_products 1
null -> order                  1      (plus later turns)
```
Two candidate causes, BOTH unrelated to ideation but BOTH shipping if the fork is promoted:
1. the fork's **domain-continuity-carry (rev4)** change — by design it alters exactly this
   carry behaviour (`inventory -> order`, `-> null`);
2. parser features shipped to live `XTODTw` after the golden's 2026-07-07 capture.

**REQUIRED A/B before B-PARSER can be decided:** re-run the same 30 turns with the clone's
`Call 'sub-query-reformulator'` temporarily pointed at **live `XTODTw`**, then compare
domain-change counts. If live-vs-golden also shows ~12/29, the churn is pre-existing drift and the
fork adds ~nothing. If live-vs-golden is materially lower, the delta belongs to
domain-continuity-carry and must be reviewed on its own merits before promoting the fork.
Remember to restore the fork wiring afterwards.

### ✅ Layer 2 CLEAN A/B RESULT + USER ACCEPTANCE (2026-07-20)

Re-run **strictly sequentially** after the concurrent runs were voided. Arm A = clone→FORK
(run 17, exec `9343336`); Arm B = clone→LIVE `XTODTw` (run 18, exec `9343919`). Same 30 turns,
same golden 12. Pre-flight verified: all 5 real-egress nodes orphaned, all 8 send nodes →
`sub-sendmsg-CHAT` with `is_test=true`, no other orchestrator running. Arm B confirmed on the live
sub via `subExec=XTODTw-dJcV0uRdC056hG`.

| arm | turns | domain_chg | intent_chg | became_ideate |
|---|---|---|---|---|
| A: FORK (live+ideate) | 30 | **5** | 5 | **0** |
| B: LIVE (baseline) | 30 | **0** | 0 | 0 |

**Live reproduces golden exactly (0/30)** — so golden is a valid parser baseline, and since the
fork is live+ideate ONLY, all 5 changes belong to the ideate prompt hunks.

| # | conv/turn | message | golden = live | fork |
|---|---|---|---|---|
| 1 | 404279734 t1 | `Srtwc8504` (bare code, no prior turn) | `null/null` | `master_products/check_product` |
| 2 | 423779375 t2 | `Can send me photo, list price and technical dr…` | `product_attachment/check_product_attachment` | `master_products/check_product` |
| 3 | 428334748 t7 | `Product inquiry` (menu label) | `portal_link/get_portal_link` | `master_products/check_product` |
| 4 | 437264483 t4 | `1` (bare pick) | `null/null` | `order/check_order` |
| 5 | 437264483 t10 | `1` (bare pick) | `order/check_order` | `null/null` |

Pattern: 1–3 are a systematic pull toward `master_products` (bare-code inference despite the
"do NOT infer from a bare entity alone" rule; "list price" beating photo/technical-drawing; and
the `Product inquiry` menu label routing to a product answer instead of the portal form).
4–5 are the same literal message `1` flipping in OPPOSITE directions → ambiguity/jitter, not a
behaviour change.

**DECISION (user, 2026-07-20): these diffs are ACCEPTED.** No prompt rework required before
promote. Recorded so the `Product inquiry` → `master_products` destination change is a known,
accepted behaviour delta rather than an undetected regression.

### Layer 2 — replay CANNOT validate the parser change
`Build Item` pins `mock_reformulator_output` (and `fixtures.check_access`) from golden, so the
parser sub and access check are bypassed entirely. Replay proves the SPINE only.
The parser CODE changes are provably inert for historical turns (a new `case 'ideate'` and
`submit_idea` added to a Set are unreachable unless the LLM emits them). The **prompt** changes
are the real risk — a message that used to classify `clarification` could now read `ideate`.
Measuring that needs a real-LLM run (`regress-capture` over a sample, diffing
`Call 'sub-query-reformulator'` output vs golden). Cost it before running.

## 4. Post-promote follow-ups

- Build `is_new_idea` (DC-10) — currently ideas merge.
- Test `media_selection` once sorento's media lookback is deployed.
- Discard polluted draft `5bc4f24f` (3 merged ideas + a Malay problem statement).
- Fold the corrected ideate ROUTING wording into the live prompt.
- Revisit `language=en` per B5.
- Consider a dedicated `suggested_team` for ideate (currently inherits, e.g. `warehouse` — inert,
  user-accepted).

---

## ✅ PROMOTED TO LIVE — 2026-07-21

User-gated ("we need to promote to live already"). Clean Layer 1 replay waived by user.

| artifact | rollback versionId (pre-promote) | new activeVersionId |
|---|---|---|
| parser `XTODTw-dJcV0uRdC056hG` | `b7955057-1561-4057-aed8-09672b1a8872` | `06388c41-5c53-40e0-a68e-0ed441fd2355` |
| spine `9qVyfUxmRQqrpGRMDLRuz` | `e8ade920-d655-423f-96cb-4651d1582814` | `a8aa7b2c-1557-4fef-8d7a-944b397f4c64` |

**Rollback = republish the middle column** (independent per artifact).

### Step 1 — parser
`output_exchange` + `systemMessage` pushed to live and verified **byte-identical to fork
`wI5RkNGW3EOJfBdo`** (`diff` clean both nodes: 44,066 B and 30,482 B). Published.

### Step 2 — spine
Pre-flight found live carrying an **unpublished draft** (`422c2587`) dating to 2026-07-16.
Resolved before touching anything: pulled the workflow snapshot embedded in a live execution
(`workflowVersionId` + `workflowData`) as ground truth and structurally compared it to the draft
— **0 value conflicts, identical node set, identical connections**; the draft differed only by
n8n default-key expansion. Nothing unknown shipped.

**+11 nodes (90 → 101), STRIP list fully applied.** Verified on the staged draft before publish:
- `compile-current-state` differs from the tested clone by **one comment hunk only** (the clone
  comment described the pg/`n8n_test` lane, which does not exist on live).
- All 11 new nodes free of `is_test` / `test_run_id` / `sub-sendmsg-CHAT` / mock lanes. The
  `is_test`/`test_run_id` strings remaining in the workflow are pre-existing **sub-input schema
  declarations** on live callers, not values.
- Both new sends target the real sub `aoydkG1dbItXR5jXFEQsP`.
- `whisper-transcribe` credential set explicitly (`o130We0PEJ77Z1lH` sorento-openai) — GET
  redacts credentials, so absence was never inferred from a read.

**Shape verification (not assumed):** the STT expressions depend on
`redis-pop.json.message` being the queue item (attachment 4 deep). Confirmed offline from live's
own nodes — `redis-pop` uses `propertyName: "message"`, `tf-message` returns
`json.message.message`, and live's pre-existing `if-message-is-audio` reads
`$('tf-message').json.message.message.attachment.type`. All three agree with the clone.

**Bonus finding:** live already had `if-message-is-audio` with a **dead-end TRUE branch** — that
is why voice silently did nothing. `patch-transcript` sets `E.attachment.type = 'text'`, so a
transcribed turn takes that gate's normal FALSE branch. A separate legacy voice lane
(`Code in JavaScript` → `Transcribe a recording` → `…-transcribed-message`) is orphaned and was
left untouched.

**Post-publish:** live executions confirmed running `a8aa7b2c`, `status=success`, path
`redis-pop → if-audio-in → tf-message` (FALSE branch) — text turns unchanged.

### Behaviour until the user-owned blockers land
- **B3 `is_allowed_voice` not yet created** → `if-voice-allowed` is false for everyone, so every
  voice note gets the polite "type your message instead" reply. Strictly better than the previous
  silent drop, but no one can use voice until the field exists and is set true.
- **B2 `ideation` agent not yet registered** → an `ideate` turn fails check-access and returns the
  no-access message. The lane is therefore inert.
- ⚠️ **B2 MUST come after B1** (sorento `handle_turn(session_vars=…)` + drop
  `overwrite_for_contact`). Registering the agent first makes ideation live *and* broken: n8n's
  whole-blob session PUT clobbers the flat pointer, so every turn starts a new draft.
