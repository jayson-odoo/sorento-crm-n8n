# Review — state-transition monitor (C1/C2/C3/C4 build sign-off)

- Change-id: `state-transition-monitor`
- Reviewer: sorento-reviewer
- Review date: 2026-07-22
- Scope reviewed: **build only** (clone `txiPzSxy3Pclsz6v` + fork `wI5RkNGW3EOJfBdo` + replay `aROEBlQyyoQaB7a1`). **C5 (live promotion) is explicitly NOT part of this review.**
- Inputs: plan `plans/state-transition-monitor-n8n-plan.md`, coder diff `tests/diffs/state-transition-monitor.md`, tester runs `tests/runs/state-transition-monitor-cases-20260722.json`, and live MCP re-reads of the fork/clone/live-parser/replay/TEST-sink workflows.

## VERDICT: **APPROVE** (build) — with one **HIGH-severity C5 promotion hazard** that must gate C5, and one docs correction.

The four built artifacts (C1 state_trace blob, C2 `_parser_raw` snapshot, C3 no-op pass-through, C4 replay `norm()` strip) are correct, additive, and zero-egress. All 7 UAC cases are green and I independently re-derived the safety posture from workflow JSON. The build is sound. **However, since the coder/tester ran, unrelated `dym-candidate-map` work has landed on the fork's `output_exchange`, so the plan §A3 / coder-diff claim that C5's parser promotion is "a clean single-node diff with no rider" is now FALSE.** This does not affect the build; it changes how C5 step 2 must be performed. Details in Finding H1.

---

## Independently verified against live artifacts (not the diff prose)

### C2 — fork `output_exchange` is genuinely additive for state_trace (item 1)
- Pulled the fork's `output_exchange.jsCode` and diffed it against the live parser sub's `output_exchange`. The two C2 hunks are present and **byte-exact per plan §C2**:
  - Hunk (a) lines 73–79: the `_parser_raw_snapshot` IIFE sits immediately after the parse-block `}` (line 71) and before `// ── §10 follow-up (3)`.
  - Hunk (b) line 739: `output._parser_raw = _parser_raw_snapshot;` immediately before the single `return output` (line 740).
- The snapshot IIFE (line 76) executes **before** all post-processing — both the §10 follow-up block and the dym mutations (lines 186–219). So `parser_raw` captures the true pre-code LLM object. `parser_applied` (= `output.output`) is unaffected by the two C2 hunks.

### C1 — clone logger blob, traps preserved (item 2)
Read the actual `Call 'sub-respond-save-message-redis'2` `/workflowInputs/value/data` expression. Every §B trap holds against the real node body:
- `after` uses `?? null`, **never** `?? {}`. ✓
- `.isExecuted` guard **and** try/catch present on all three layer reads. ✓
- `before` reads `$("get-session-vars").first().json.session_vars.variables` in-memory — not a CRM re-read (§B1). ✓
- `_parser_raw` read as top-level `p._parser_raw`, not `p.output._parser_raw`. ✓
- `trim()` returns non-objects unchanged (`if (typeof o !== 'object') return o;`) — the `idx===-1` raw-string case survives. ✓
- `first` fallback chain is exactly `label ?? code ?? canonical_code ?? raw ?? uuid ?? null`. ✓
- `state_trace` is inside `data` ONLY — `workflowInputs.value` keys are `contact_id, data, message, phone_number, sent_at, turn_id`; no `state_trace` sibling. The TEST sink's trigger declares inputs `contact_id, phone_number, message, sent_at, turn_id, data` and RPUSHes only `data`, so a sibling would have been silently dropped — correctly avoided. ✓
- Node refs double-quoted for the single-quote-bearing names. ✓
- No stray `parameters.parameters.*` nesting (LESSON §32b avoided): node `parameters` keys are exactly `options, workflowId, workflowInputs`. ✓
- Logger target workflowId = `tWm5DYLxfypmVC1T` (TEST sink). ✓

### C3 — `suggest-follow-up` no-op (item, plan §C3)
Fork `suggest-follow-up` param sha `bfe94eeddbb2` == live — byte-identical, unedited. A top-level `_parser_raw` sibling passes through untouched. Confirmed no-op. ✓

### C4 — replay `Diff` `norm()` strip (item 4 build side)
Read the full `aROEBlQyyoQaB7a1 › Diff` node body. The added rule is a single line:
`if (k === '_parser_raw') continue;` — placed after the `person_mention` rule and before the `similarity` rule, with the §C4 justification recorded in-node. The rest of `norm()` (STRIP_KEYS, TS_KEY/ISO handling, `person_mention` ignore-when-null, `similarity` rounding), plus `resolveInput`, the HARNESS volatile-set, and the golden/replay diff loop, are all **intact and coherent** — no other logic altered despite the whole-node rewrite the coder flagged. Legitimate strip (pure mirror of `output.output`), not a blanket ignore. ✓

### `connections` untouched, both sides (item 3, V-ST-i)
- Fork connections sha `c472a7d24f40` == coder-recorded before==after. ✓ (The fork↔live connections differ — `b762…` vs `c472…` — but that is the pre-existing dangling `Postgres Chat Memory` node, not a C2 change; C2 did not touch connections.)
- Clone connections sha `57effd9ce266` == coder-recorded before==after. ✓
- Replay `Diff` connections structurally intact (`Diff → Insert Diffs`). ✓

### Zero egress, re-derived (item 7, §E, §0 S1–S9)
Confirmed structurally from JSON (not on tester's word):
- Clone logger → TEST sink `tWm5DYLxfypmVC1T`, whose ONLY egress is `Redis push list:"sorento-respond-message-TEST"` (literal, no expression), messageData=`$json.data`. That list has no consumer (`redis-consume-queue-mongo` pops `sorento-respond-message`). So **no `state_trace`-bearing blob can reach the prod list.** ✓ (S3)
- `save-session-vars` inbound edges = **0** (orphaned) → no CRM conversation-variables write. ✓ (S9)
- `send-message-files/images/video` and `update-human-intervened` inbound = 0 (orphaned). ✓
- **S7 rests on sink-delta + attribution, NOT bare LLEN** (LESSON §45): TEST sink +6 across 6 runs (one save per turn, reconciles V-ST-j); the only prod movement was ST-1 `sorento-respond-message` 2→1, a **decrease** — which cannot be a harness RPUSH (writes increase LLEN), attributed to the live consumer draining pre-existing customer traffic. HALT clause correctly not triggered. Payload-shape attribution: the real-send RPUSH path (only path touching the prod list) was never reached because `contact.chat_id='stm'` routes the CHAT sub to its chat lane. Sound. ✓

### `after: null` is real and on an enumerated branch (item 5, V-ST-c)
ST-2 (contact `457216562`, NO access): `check-access` deny → `If5[1/FALSE]` → `sorento-sub-respond-sendmsg-respond5`; `compile-current-state` did not execute. This is §D branch **#3 (no access)** — a genuinely enumerated null-producing branch. `after === null` (JSON null, not `{}`/`"null"`/absent), execution status success, logger still produced a row. ✓

### `parser_raw ≠ parser_applied` is non-degenerate (item 6, V-ST-e)
ST-4 (`"check stock for srt8408 last week"`, inventory domain, outside `DATE_FILTER_DOMAINS`): `parser_raw.date_filter_start='2026-07-13'`/`date_filter_end='2026-07-19'` (LLM extracted the window) vs `parser_applied.date_filter_start=null AND date_filter_end=null AND date_mode=null`; `parser_applied.date_filter_gated='inventory'` while `parser_raw` has **no** `date_filter_gated` key and **none** of the `*_applied` flags. This is exactly the required divergence — raw missing the applied-flags AND showing a pre-gate value the post-code nulled (the dym-bug-relevant class), not a trivial diff. ✓

### Trim contract (item 4, V-ST-d)
ST-1/ST-3: every `last_result_set`/`dym_candidates` across all four layers renders `{n, first}` — `before.last_result_set {n:17,first:'SRTKS2400'}`, `after {n:2,first:'SRT8408'/'SRTUFV101'}`, dym `{n:3,first:'SRT-0'}` / `{n:0,first:null}`; a real 6-member roster (live exec 9543709) trimmed `{n:6,first:'Maryam Ariffin'}` proving the `label` fallback on real data. `entities` stays a full array (not collapsed). Serialized `state_trace` = 2872 bytes < 8 KB. ✓

### Order gate (V-ST-a) and fork≡live (item 9)
- ST-6 ran first: logger executionIndex 46 > compile 39 > get-session-vars 10 (strictly greater); no clone remediation needed. ✓
- Fork vs live per-node sha, re-run now: `When Executed`, `OpenAI Chat Model`, `AI Agent`, `test-reformulator-bypass`, `mock-reformulator-output`, `suggest-follow-up` are all **byte-identical** to live. Only `output_exchange` differs. **The other 5 are clean.** ✓ — but see H1 for what `output_exchange` now contains.

---

## Findings

### H1 (HIGH — gates C5, does NOT block build): the fork's `output_exchange` now carries an unrelated `dym-candidate-map` rider on top of C2.
At coder/tester recon the fork's `output_exchange` was byte-identical to live (`e1736aa21a`) and C2 added exactly two hunks. **As of this review the fork's `output_exchange` (sha `d5398711f649`) differs from live by C2 PLUS the `dym-single-use-fix` / dym-candidate-map changes** (lines ~153–219: `_offer`/`dym_offer.candidates` sourcing, the `dym_slot` stable-handle tier-0 resolver, `_picked` type-forcing from `entity_type`, and `output.output.dym_offer_pick_code`). The fork was re-published since the coder run (fork versionId is now `006e75f1`, coder recorded `9dc769e3`).

Consequences:
- The plan §A3 and coder-diff STEP-0 assertion — "C2 can be built on the fork and promoted to live as a clean single-node diff, with **no unpromoted rider**" — is now **false**. Block-copying the fork's `output_exchange` into the live parser sub at C5 step 2 would ship the dym-candidate-map work (a *different, still-in-flight* plan) as a rider to the live parser — precisely the LESSON §51 hazard.
- Impact on THIS build: **none.** The C2 snapshot is taken at line 76, before the dym mutations (lines 186–219); the dym rider does not touch `_parser_raw` or the top-level `output._parser_raw`. `parser_raw` is still genuinely pre-code, and the C1 logger is unaffected. State_trace correctness holds. The tester's ST cases do not exercise a dym re-pick, so their verdicts stand.

Disposition: C2 must be promoted at C5 as **targeted-hunk insertion only** (the two hunks), never a node block-copy, with a **hunk-level** diff confirming exactly those two hunks land on live `output_exchange` and no dym text rides along. This supersedes the "clean single-node diff" language in the plan/diff. Recorded as a hard gate in the C5 checklist below.

### M1 (item 8 / V-ST-f — turn_id join gap): ACCEPTABLE as a known harness gap for build sign-off.
ST-5 proved the incoming side: `state_trace.turn_id` == `String(clone exec id)`, on the `type==="incoming"` row, on all 7 runs. The outgoing join is unverifiable on the clone because its sendmsg target is the stale CHAT fork (`ublq9nSlrpz63xan`), whose outgoing log omits `turn_id` and whose `test-guard-record` is bypassed by `chat_id`. This is the known F3 harness limitation, not a state_trace defect. Live sendmsg (`aoydkG1dbItXR5jXFEQsP`) already threads `turn_id` (obs-latency C3, promoted), so the join closes in production. **The C5 tester MUST verify post-promote (LESSON §56 — verify the specific path):** on a real prod turn, `state_trace` lands on the incoming `chat_histories` row with `turn_id=X`, AND the paired outgoing rows for that same turn carry `turn_id=X` (string equality) — verified on **both a happy-path turn AND an escalation turn** (escalation fans 3× via `sub-human-intervention` — the exact denominator gap that survived obs-latency cycle 1).

### L1 (docs, V-ST-l): update the fork≡live claim.
CLAUDE.md's clone-wiring note and `plans/state-transition-monitor-n8n-plan.md` §A3 both assert the fork's `output_exchange` ≡ live. That is now stale — the fork's `output_exchange` carries C2 **and** dym-candidate-map deltas. Docs should record that the fork is a shared build surface for two in-flight changes so the next agent does not read "fork≡live" as an invariant. Non-blocking for build.

### Notes (info)
- Clone activeVersionId drifted to `b8fb4c72` (coder recorded `4182ce3b`) from a chat-console re-publish; the C1 state_trace hunk is intact and byte-identical. Not a code change.
- Live corroboration N1: real chat exec `9543709` (a genuine user turn) independently shows the full four-layer state_trace built + trimmed, `before≠after`, `parser_raw≠parser_applied`. Strong end-to-end confirmation.

---

## C5 PROMOTE CHECKLIST (user-gated — do NOT execute from this review)

Strictly ordered. HALT on any mismatch.

0. **P1 CRM prerequisite live first.** Confirm `chat_histories.state_trace jsonb NULL` exists **and** the ingest consumer (`redis-consume-queue-mongo` → CRM `insert-message`) **tolerates the unknown key** — verify behaviour on an unknown key explicitly, do not infer from the column existing. If the endpoint rejects unknown keys, adding `state_trace` breaks every production incoming-message insert (total chat-history outage). User reports the column + tolerant insert are live — re-confirm before proceeding.
1. **Spine auth change (§A2) published ALONE, first.** Immediately before the state_trace publish, re-run the spine draft-vs-active diff (LESSON §24): `get-session-vars` must be **draft==active** (auth change already landed). If `get-session-vars` still differs, the auth change has NOT landed — HALT (V-ST-g). Do not merge the two publishes.
2. **Live parser sub `XTODTw-dJcV0uRdC056hG` — C2, targeted-hunk insertion ONLY.**
   - Re-run the per-node sha diff fork vs live across the 5 non-`output_exchange` shared nodes (`When Executed`, `OpenAI Chat Model`, `AI Agent`, `test-reformulator-bypass`, `mock-reformulator-output`, `suggest-follow-up`) — all must be byte-identical or HALT.
   - **DO NOT block-copy the fork's `output_exchange`** — it carries the dym-candidate-map rider (Finding H1). Source the live `output_exchange.jsCode`, insert exactly the two C2 hunks (the `_parser_raw_snapshot` IIFE after the parse-block brace; `output._parser_raw = _parser_raw_snapshot;` before `return output`), write via `setNodeParameter /jsCode`.
   - **Hunk-level verify:** diff the resulting live `output_exchange` against the pre-edit live `output_exchange` — the ONLY difference must be the two C2 hunks (no `dym_slot`/`dym_offer_pick_code`/`_offer` text). sha-verify the draft pre-publish and active post-publish; auto-revert on mismatch (LESSON §25). Do NOT carry the fork's dangling `Postgres Chat Memory` node.
   - Publish the sub **before** the spine (LESSON §37).
3. **Live spine `9qVyfUxmRQqrpGRMDLRuz` — C1, single leaf.** Add exactly the one `state_trace` key to `Call 'sub-respond-save-message-redis'2` `/workflowInputs/value/data` via `setNodeParameter` (path `/workflowInputs/value/data`, never `/parameters/…` — LESSON §32b). **Never block-copy `workflowInputs.value`** from the clone (LESSON §48 — clone carries `is_test`/harness-fork ids). Re-run the draft-vs-active diff immediately before publishing — only the logger node may differ (step 1 auth already landed). Do NOT touch `connections` (live `if-message-is-audio` out-1 order must not change — V-ST-i corollary).
4. **Backup + sha-gate.** Capture prior versionIds and the changed node bodies before each publish; sha-verify draft pre-publish, active post-publish; auto-revert (`publish_workflow` prior versionId) on any mismatch.
5. **Post-promote live verification (LESSON §56 — the specific path, not a clean diff):**
   - A real incoming prod turn lands `state_trace` on the `type='incoming'` `chat_histories` row (four layers, trimmed, `before≠after`).
   - `turn_id` join closes: incoming `state_trace.turn_id` == the paired outgoing rows' `turn_id` (string equality), verified on **both a happy-path AND an escalation turn**.
   - Prod incoming-message inserts still succeed for turns whose blob carries `state_trace` (P1 tolerance holds under real traffic).

Build APPROVED. C5 remains user-gated and blocked on the checklist above; H1 is a mandatory C5 gate.
