# Acceptance Criteria — Per-Node Golden-Master Regression Harness

Target: a dedicated regression clone of `sorento-consume-main` (UI-Duplicate of the FAIL-CLOSED UAC
clone `txiPzSxy3Pclsz6v`), driven by the reusable n8n workflow `sorento-regression-orchestrator` over the
2,216 historical incoming messages. See `../plans/regression-plan.md` for the clone deltas (R1–R5),
schema, record/replay layer, and normalization spec. This file defines acceptance for the **harness
itself** — not for any one business change.

Every criterion is asserted from per-execution node data (the orchestrator harvests it via n8n REST
`GET /executions/{id}?includeData=true`; the tester may also spot-check via `get_execution`) + the
`n8n_test@72.62.195.19` tables (`golden_nodes`, `replay_node_diffs`, `respond_contacts_test`) + the Redis
`test:egress:{test_run_id}` list. The **§0 safety checklist is the gate**: a §0 failure is a hard fail regardless of functional
correctness, and means HALT the run.

---

## §0. MANDATORY safety checklist (applies to EVERY captured AND replayed turn)

Reused from `tests/UAC.md §0` (S1–S6), with two regression-mode additions (S7–S8). A turn PASSES only if
all hold:

- **S1 — Zero real WhatsApp/comment sends.** No execution data shows a respond.io send/comment with a
  2xx. Every sendmsg path appears in the egress log as `{guard:"sendmsg-sub"|"send-message-files"|
  "send-message-images"|"send-message-video", blocked:true}`. The shared send sub `aoydkG1dbItXR5jXFEQsP`
  short-circuited (no `api.respond.io/.../message` POST executed).
- **S2 — Zero assignment / escalation writes.** Inside `rrYXzE61gCNUck_zmXe-G`: `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, and the
  assignee-queue `Redis` push did NOT execute. Escalation turns recorded
  `{guard:"human-intervention-sub", blocked:true}` and returned before `get-round-robin-assignee`.
- **S3 — Zero CRM/contact writes to PROD.** `update-human-intervened` (respond.io UPDATE_CONTACT) did not
  execute. The prod `save-session-vars` PUT node (`/external/conversation-variables` PUT) did NOT execute
  — it stays 0-inbound on the clone (the redirected Postgres write to `respond_contacts_test` is the only
  session write; see S8).
- **S4 — get-results writes never fired.** No MCP write tool ran; the resolved `tool` passed to
  `Call 'sub-get-results'` is in the READ allowlist and is **never** `crm_it_support_ticket_create`.
- **S5 — control provably present.** The popped redis item carried `mode ∈ {regress-capture,
  regress-replay}` and `trigger_chat_history_id`; every invoked sub received `is_test=true`.
- **S6 — token sinks bounded by mode.** In `regress-replay`: **NO** LLM node executed (parser +
  reformulator pinned; get-results agent orphaned) — assert from execution data that `Basic LLM Chain`,
  the reformulator `AI Agent`, and any `lmChatOpenAi` did **not** run. In `regress-capture`: only the
  parser `gpt-4.1-mini` and reformulator `gpt-5.4-mini` ran (one-time golden mint).
- **S7 — Zero prod reads during REPLAY.** In `regress-replay`, NO httpRequest to
  `fe-sorento.foundryx.my` and NO MCP call to `72.62.195.20:8765` executed — `resolve-entity`,
  `resolve-entity-clarification`, `get-access-types`, `check-access`, `get-presigned-url`, and the
  get-results MCP path all took the fixture-inject branch. (During `regress-capture` these reads ARE
  live and expected.)
- **S8 — Session writes hit ONLY the copy.** Any `save-session-vars` write targeted
  `respond_contacts_test` on `n8n_test@72.62.195.19` (the redirect), never prod `respond_contacts` /
  `/external/conversation-variables`. Assert the Postgres write node's credential targets
  `n8n_test@72.62.195.19` (a server with no prod CRM data) and the prod PUT node did not run (S3).

> If S1–S8 cannot be affirmatively verified for a turn, treat as **FAIL and HALT** — a leak means the
> kill-switch or the redirect is broken.

---

## §1. Harness acceptance criteria

### A1 — Capture is deterministic-enough to replay (no false positives)
Run capture on a SMALL sample (~2 conversations, incl. a short `437264483` slice) → mint a temp
`golden_run`. Immediately **replay the same sample** against that golden (mode `regress-replay`, all
fixtures from the just-captured `is_external` rows). **PASS iff `replay_node_diffs` has ZERO rows with
`diff_status ∈ {regression, missing, new}`** — only `match` (and any `volatile`) rows. This proves the
normalization (timestamps/ids stripped) removes all inherent variance and the fixtures pin every
non-deterministic input. A single `regression` row here = a false positive = harness defect.

### A2 — Replay is fully hermetic: 0-token + 0-prod-read + 0-prod-write + 0-egress
For every replayed turn, assert (S6/S7/S8/S1–S4): no LLM node executed; no call to
`fe-sorento.foundryx.my` or `72.62.195.20:8765`; no respond.io send/assign; no prod
`conversation-variables` PUT / contact update; the only write is to `respond_contacts_test`. A single
violation fails A2 and halts.

### A3 — A deliberately-injected node change IS caught
Plant a benign change on the clone (e.g. alter a constant in `compile-current-state` or a label in
`output-structurer`) and replay an unchanged golden. **PASS iff `replay_node_diffs` contains ≥1
`regression` row naming the changed node** (and ideally only nodes downstream of it). This proves the
diff has teeth. Revert the plant afterward.

### A4 — Unchanged replay shows ZERO diffs (no timestamp/id false positives)
Replay the full (or a large) sample against an unmodified golden with no code change. **PASS iff ZERO
`regression`/`missing`/`new` rows.** Specifically confirm that nodes containing `new Date()`/`$now`
(`Call 'sub-respond-save-message-redis'2`, redirected `save-session-vars` `updated_at`) and the
presigned-url node do **not** produce `regression` rows — they are `match` after N1/N2 normalization or
sit in the `volatile` allowlist.

### A5 — Session evolves correctly across a multi-turn conversation
For a multi-turn contact (e.g. `437264483`), assert in `regress-capture`:
- the copy is **reset** to `seed_session_vars` at turn 1 (assert `respond_contacts_test.session_vars =
  seed_session_vars` before the conversation);
- after turn N's `save-session-vars` redirect, `respond_contacts_test.session_vars` reflects turn N's
  `compile-current-state` output;
- turn N+1's `get-session-vars` redirect READS that evolved value (assert the value entering
  `Call 'sub-query-reformulator'` as `previous_conversation_state` equals turn N's written session).
This proves multi-turn state threads through the copy, not a stale/prod value.

### A6 — Reset isolates conversations
Assert that starting a different contact's conversation re-reads from THAT contact's
`seed_session_vars`, and that one conversation's evolution never leaks into another's golden (the per-
conversation `UPDATE … SET session_vars = seed_session_vars` ran at each conversation boundary).

### A7 — Prod respond_contacts / session NEVER written
End-to-end invariant across capture AND replay: prod `respond_contacts.session_vars` is unchanged. Verify
by a before/after prod READ of a sample contact's `/external/conversation-variables/{id}` (a safe read)
bracketing a capture run — the value MUST be identical. (Capture issues prod READS only; replay issues
none.) Any change = catastrophic fail.

### A8 — Idempotent resume
Kill the orchestrator mid-capture and restart. Assert it skips turns already in `golden_nodes`
(via the `UNIQUE(golden_run_id, trigger_chat_history_id, node_name, run_index)`), resumes at a
conversation boundary, and the final golden is identical to an uninterrupted run (same row count, same
`output_norm_hash` set).

### A9 — Corpus load integrity
After the CSV load: `SELECT count(*) FROM chat_histories WHERE type='incoming'` = **2,216**;
`type='outgoing'` = **2,422**; **0 rows** with `type NOT IN ('incoming','outgoing')` (the 127 fragments
dropped); 41 distinct incoming `contact_id`; `respond_contacts_test` seeded for all 47 contacts. `id`
values are clean bigints (no thousands separators); `result` parses as jsonb where non-null.

---

## §2. Coverage / gates summary

| # | Criterion | Gate |
|---|-----------|------|
| A1 | capture→replay self-check, 0 false positives | sample, before full capture |
| A2 | replay hermetic (0 token/read/write/egress) | every replayed turn (§0 S6/S7/S8) |
| A3 | planted change caught (≥1 regression row) | before blessing the harness |
| A4 | unchanged replay = 0 diffs | full/large sample |
| A5 | multi-turn session evolves via copy | `437264483` slice |
| A6 | per-conversation reset isolates | cross-contact |
| A7 | prod session never written | before/after prod read bracket |
| A8 | idempotent resume | kill-and-restart |
| A9 | corpus load integrity | post-load SQL asserts |
| §0 | safety S1–S8 | EVERY turn — hard gate |

The harness is ACCEPTED when A1–A9 pass on the small sample, §0 holds for every turn, and the reviewer
re-confirms A2/A7 (hermetic replay + zero prod session writes) from the run logs. Only then run the full
2,216 capture and mint the baseline `golden_run`.
