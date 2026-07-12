# Regression Harness Review — pre-full-capture audit

Reviewer: sorento-reviewer (read-only audit). Scope: gate the full 2,216-turn golden capture
(~5–7 h, real LLM + prod reads). No workflows, prod CRM, or golden data were edited. Verification =
inspection of the clone `txiPzSxy3Pclsz6v` (97 nodes, saved JSON), capture orchestrator
`MGm32814G7XcGSD2`, replay `aROEBlQyyoQaB7a1` (full Diff code read), plus read-only `psql` against
`n8n_test@72.62.195.19` (golden_run 6 / replay_run 5). No diagnostic clone executions were needed.

## HEADLINE VERDICT: **GO-WITH-FIXES**

The harness is **safe** (zero real egress, writes only to `n8n_test`) and **trustworthy** (deterministic
self-check = 0 false positives, planted change caught, normalization does not hide behavior changes).
The open items are **operational robustness for a 5–7 h run**, not safety or correctness. Fix the two
HIGH items below before committing the full run (or run in conversation-batches as a manual workaround).

---

## 1. SAFETY — verdict: PASS (highest confidence)

Structurally confirmed on the clone (`txiPzSxy3Pclsz6v`, 97 nodes), via `python3` graph analysis of the
saved JSON:

- **Zero `scheduleTrigger`** nodes (re-verified). PASS.
- **All 6 egress/log nodes exist but have ZERO inbound connections (orphaned/unreachable):**
  `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`,
  `save-session-vars` (the **prod CRM PUT** — stays orphaned), `Call 'sub-respond-save-message-redis'2`.
  Egress is structurally impossible, flag-independent (fail-closed), in **all three modes**.
- **All 8 shared-sub call sites pass `is_test: true`** (literal boolean) — the published guards in
  `aoydkG1dbItXR5jXFEQsP` / `rrYXzE61gCNUck_zmXe-G` / `XTODTw-dJcV0uRdC056hG` always block. PASS.
- **No prod-DB credential reference in the clone:** `sorento-crm-db` appears **0×**. Session redirect
  uses `pg-get-session` / `pg-upsert-session` only.
- **Session writes provably hit `n8n_test` only.** The clone's pg-node credential bindings are
  **redacted by the n8n REST API** (`credentials: {}` in the read), so they cannot be confirmed
  statically — but **empirically**: golden_run 6 read seed at turn 1 and read turn-1's *evolved*
  session at turn 2 (orchestrator-notes #3), against `respond_contacts_test`, a table that exists
  **only on `n8n_test`**. A misconfigured cred pointing at prod would fail (no such table) or evolve
  the wrong store; it evolved correctly. Combined with the orphaned prod PUT, the redirect target is
  `n8n_test.respond_contacts_test`, never the prod CRM DB.
- **Replay is hermetic** (replay_run 5, from `replay_node_diffs`): the only nodes that ran in capture
  but NOT replay are the read sources (`resolve-entity-http`, `check-access-http`,
  `Call 'sub-get-results'`) — all fixture-injected in replay. No `send-message-*`,
  `update-human-intervened`, or `save-session-vars` ever ran. Sole live call in replay is
  `Execute 'sub-get-rag'` (1 embedding + 1 pgvector read/turn). 0 LLM completions, 0 prod CRM reads,
  0 egress, 0 prod writes.
- **uac mode:** the clone retains the cycle-1 fail-closed layer unchanged; the re-canary passed
  (cycle-1-final). Spot-check: every regress-mode addition is gated (`mode ∈ regress-*`), default
  FALSE → uac path takes real `-http`/NoOp/real-node branches. No regress edit touches the egress
  branch. (Full byte-identity relied on the documented re-canary, not re-run here.)

> Note for future reviewers: n8n's REST API redacts per-node `credentials`, so cred BINDINGS cannot be
> audited statically from `get_workflow_details`. Confirm bindings empirically (successful `n8n_test`
> writes) or in the UI.

## 2. DETERMINISM / replay correctness — verdict: PASS

From `psql` on golden_run 6 → replay_run 5:
- `replay_runs.summary = {turns:5, nodes:211, match:172, volatile:39, regression:0, missing:0, new:0}`.
  Capture↔replay on the same golden = **0 regressions**. PASS (UAC A1/A4).
- **Diff keys on `node_id` + `run_index`** (read in the Diff code): rename-safe; only a truly
  removed/added node (different id) yields `missing`/`new`. **0 null `node_id`** in both
  `golden_nodes` (run 6) and `replay_node_diffs` (run 5) — keying is sound, not silently falling back
  to name.
- Replay = 0 LLM tokens / 0 prod reads / 0 egress confirmed (see §1). The 4 reads + 2 LLMs are injected
  from the golden `is_external` pins (`Fetch Externals` → `Build Item`).
- The full canonical-string compare (`gc === rc`) is the actual oracle; `output_norm_hash` is a stored
  32-bit rolling hash used only for forensics/dedup, so hash collisions cannot cause a false `match`.
  (Minor doc bug: schema/notes call it "sha256"; it is a 32-bit `Math.imul` rolling hash. Harmless.)
- A3 (planted-change catch) was satisfied via the **symmetric equivalent** — mutating the *golden*
  baseline produced exactly 1 `regression` at the changed node, then reverted. A literal clone-node
  plant was not run (clone-edit auth withheld); the detection path is identical (golden vs replay
  compare). Acceptable.

## 3. NORMALIZATION — verdict: NOT over-stripping (with documented blind spots)

I read the full `Diff` code node. Everything treated as volatile/stripped, with verdict:

**(a) STRIP_KEYS — removed recursively from every node output before compare:**
`pairedItem`, `mode`, `mock_parser_output`, `mock_reformulator_output`, `fixtures`, `test_run_id`,
`scope`. **Justified** — these are harness-control fields threaded on the message object through many
nodes; capture has none, replay injects them, so stripping prevents a false diff on every node carrying
the item. *Blind spot:* generic names — a future business field literally named `mode`/`scope` would be
masked. Low risk.

**(b) Timestamp KEY mask → `<V>`** for keys matching
`/_at$|^ts$|^timestamp$|last_updated|elapsed_ms|^elapsed$|startTime|executionTime|captured_at|started_at|finished_at/i`.
**Justified** for wall-clock fields. *Blind spot:* any business field ending `_at` is masked; a change
that ONLY alters such a field would be missed — but accompanying business fields (uuid/code/label/text)
would still diff, so a real behavior change is caught elsewhere. Low risk.

**(c) Timestamp VALUE mask → `<TS>`** for string values matching
`/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/` or a 13-digit epoch. *Blind spot (the most material):* a
**business full-datetime value** (e.g. a date inside a get-results payload) is masked. Mitigations: it
must be a full datetime *with seconds* — pure `YYYY-MM-DD` business dates survive and diff; and a
get-results value change normally moves other fields too. Spot-checked `validator` golden output (the
get-results envelope) — business data is product codes, labels, portal links, response text; **no
full-ISO-datetime business values observed** in the sample. Low–medium risk; document it.

**(d) `similarity` → rounded to 3 dp** (named field only). **Justified, narrow** — absorbs RAG cosine
float jitter (~1e-4) while keeping tool selection/order fully diffable. Not over-stripping.

**(e) HARNESS allowlist → unconditionally `volatile`** (the key audit):
`parser-bypass-gate`, `mock-parser-output`, `Basic LLM Chain`, `OpenAI Chat Model`,
`replay-resolve-entity`, `fixture-resolve-entity`, `resolve-entity-http`,
`replay-check-access`, `fixture-check-access`, `check-access-http`,
`replay-get-results`, `fixture-get-results`, `Call 'sub-get-results'`,
`replay-get-access-types`, `fixture-get-access-types`, `get-access-types`.

**Verdict: NOT over-stripping behavior.** Every allowlisted node is either (i) pure record/replay
machinery (IF gates, fixture/mock emitters) or (ii) an LLM/live-read SOURCE node whose business data
**re-enters the diffable graph at a non-allowlisted downstream consumer**:
- resolve-entity / check-access → the NoOp passthroughs `resolve-entity` / `check-access` (NOT
  allowlisted) forward the resolved data into `disallowed-entity-gate` / `If5` → diffed.
- `Call 'sub-get-results'` → `validator` (NOT allowlisted) → diffed.
- `get-access-types` → `Aggregate` (NOT allowlisted) → diffed.
- parser LLM → `central-exchange`/`construct-user-prompt` (NOT allowlisted) → diffed; the LLM itself is
  *intentionally* pinned (non-deterministic), so not diffing it at the source is correct by design.
- reformulator (`Call 'sub-query-reformulator'`) is **NOT** allowlisted — it is diffed and matches by
  construction (the bypass emits the golden `.output`). Better than allowlisting.

**Empirical confirmation:** in replay_run 5 the only `volatile` rows are the 9 harness node names
(`fixture-*`, `replay-*`, `*-http`, `Call 'sub-get-results'`) — **zero business-logic nodes landed in
`volatile`**. The 172 `match` rows are real behavioral nodes diffed and equal.

**One untested path:** `get-access-types` / `fixture-get-access-types` was **never exercised** by
golden_run 6 (0 `read-access-types` externals). Its replay/fixture branch is wired but **unvalidated**.
The full corpus WILL hit it for some contacts → it would run for the first time in a future replay
without prior self-check. See TUNING #3.

## 4. SESSION FIDELITY — verdict: acceptable for the regression goal (state it clearly)

The seed is a neutral `{"variables":{},"last_result_set":[]}` (41 rows, confirmed). The historical
initial session at each conversation's real start is **unrecoverable** from the corpus. Concrete
consequence (your turn-33223 "Yes" example): under the carried/empty seed the reformulator re-ran stock
results rather than the production clarification path — the production clarification (Basic LLM Chain) is
correctly **gated** behind `validator.has_result=false`, not bypassed, so this is a *path-selection
artifact of the seed*, not a clone defect.

**Does this undermine the goal? No.** The goal is **detect CHANGE vs golden**, not reproduce history.
Both capture and replay use the identical seed and per-conversation reset, so every diff is apples-to-
apples. **What the golden represents:** the clone's per-node behavior under a synthetic neutral-seed
replay of the historical *messages* — NOT a faithful reproduction of the historical conversation
*outcomes*. **What it does NOT represent / cannot catch:** a regression that only manifests under a
specific real session state absent from the seed. This is an inherent, acceptable limitation; it is
documented in db-setup-notes.md and should stay loudly stated next to the baseline.

## 5. COMPLETENESS / CORRECTNESS of capture — verdict: PASS, with one scope boundary

- `golden_nodes` captures per node-run: `node_name`, `node_id`, `node_type`, `run_index`, `input_json`
  (resolved from runData `source`), `output_json` (= `data.main`), `is_external`/`external_kind`.
  Idempotent (`UNIQUE(golden_run_id, trigger_chat_history_id, node_name, run_index)` + ON CONFLICT DO
  NOTHING — re-insert of run 6's 186 rows = 0 inserted, proven).
- Loops captured at `run_index` 0/1 (e.g. `Loop Over Items`) — verified.
- Multi-turn session evolution + per-conversation reset both proven (orchestrator-notes #3).
- **Scope boundary (state it):** the golden masters the **clone's** node graph only. Sub-workflow
  INTERNALS are not walked — only the boundary node output is captured. Because reformulator and
  get-results are **pinned** in replay, a regression *inside* those subs is invisible to the harness
  (they are treated as external inputs, not system-under-test). `sub-get-rag` runs live and its
  boundary (`Execute 'sub-get-rag'`) is diffed, but its internals aren't captured either. This is by
  design; just be explicit that those three subs are out of regression scope.
- The coarse `expected_reply`/`expected_result_set` oracle (consecutive-incoming→same-outgoing LATERAL)
  is **not** the diff oracle (the per-node golden is) — its known imperfection (turns 6/7/8 → one reply)
  affects nothing in the diff. Fine.

## 6. GET-RAG residual — verdict: no false diffs; pinning optional, NOT required for capture

`Execute 'sub-get-rag'` runs live in replay (~1 embedding + 1 pgvector read/turn). Validated
deterministic: the first replay surfaced float-jitter diffs on `Execute 'sub-get-rag'` + consumers
(`tool-filter`, `Split Out1`, `Loop Over Items`); rounding `similarity` to 3 dp resolved them with no
over-strip (tool names/order still diffable). **For the CAPTURE we are gating, get-rag is just a normal
live node — zero issue.** Residual concern is REPLAY-only and minor: a tool-selection flip at a 3-dp
rounding boundary could yield a rare false `regression` on a future replay. Acceptable; pin get-rag (add
a replay gate) only if that is ever observed. Do **not** block the capture on it.

## 7. SCHEMA / FULL-RUN readiness — verdict: schema OK; orchestrator needs robustness fixes

- **Sizing (revised down from the plan):** actual = ~40 node-rows/turn (run 6: 198 rows / 5 turns), not
  the plan's ~75. Full run ≈ **~90,000 `golden_nodes` rows** (not 170–250k). Each holds input+output
  JSONB; big payloads = `sub-get-rag` and the get-results `validator`/`output` envelopes. Expect
  **low single-digit GB**. No truncation is implemented — decide retention (TUNING #4).
- **Idempotent/resumable — GAP (HIGH).** As-built the capture is **NOT resumable**: it always mints a
  NEW `golden_run` and `Select Turns` reads ALL turns (no "skip already-captured" filter). The UNIQUE
  constraint only dedups *within* a run. A crash/disconnect at turn ~1500 of a 6 h run ⇒ restart from
  turn 1, re-spending all tokens/reads. The plan's resume design (§4.1 step 1) is unimplemented.
- **Execution-id retrieval — RACE (HIGH/MED).** `Get Exec Id` = n8n `execution:getAll` limit 1,
  newest-first, filtered by clone id. Correct only under strict sequential execution AND if every turn
  produces a fresh clone execution. If a turn fails to create a sub-execution, "latest" returns the
  PRIOR turn's execution → its data is mis-attributed to THIS turn's golden rows (keyed by this turn's
  `trigger_chat_history_id`) → **silent golden corruption**. Low probability, high impact. `Fire Clone`
  already exposes `metadata.subExecution.executionId` — use it directly to make capture race-free.
- **Throttle / read-load:** 2 s capture throttle + ~8 s clone wall-time + ~2–4 capture REST calls ≈
  10–12 s/turn ⇒ full run ≈ **6.5–7 h** (the ~5 h estimate is optimistic). `Fire Clone`
  `onError: continueRegularOutput` means one bad turn won't abort — good for completeness, but combine
  with the exec-id race above (an errored turn still creates an execution, so usually fine).

### Cost estimate (full 2,216-turn capture, one-time)
| Resource | Estimate |
|---|---|
| LLM completions | ~2,216 reformulator (gpt-5.4-mini) + ~600–900 parser (gpt-4.1-mini; fired 1/5 in sample) ≈ **2,800–3,100 completions**, ~1.5–2.5k tok each ≈ **5–8M tokens** |
| RAG embeddings | ~2,216 (1/turn) |
| Prod CRM/MCP reads | ~3/turn avg (check-access all, resolve-entity ~80%, get-results ~80%, get-access-types some) ≈ **7,000–10,000 reads** |
| Prod side effects | ~**2,216 `mcp_access_log` rows** (1/check-access) — benign log writes; get CRM-owner sign-off |
| Runtime | **~6.5–7 h** sequential at ~10–12 s/turn |
| Storage | ~**90k `golden_nodes` rows**, **~1–3 GB** JSONB |
| Egress / prod writes | **0** (capture issues prod READS only; session writes hit `n8n_test`) |

Replay (future, per run): **0 tokens, 0 prod reads, 0 egress, 0 prod writes**; only ~2,216 get-rag
embeddings + pgvector reads + writes to `respond_contacts_test`/`replay_node_diffs`.

---

## PRIORITIZED TUNING LIST (fix before/with the full run)

1. **[HIGH] Make capture resumable, or batch it.** Implement the plan's resume (pass `golden_run_id`;
   `Select Turns` skips turns already in `golden_nodes` for that run), OR run the full corpus in
   conversation-batches (e.g. 5–10 contacts each) into the same baseline. Without this a single mid-run
   failure wastes ~hours and re-spends tokens/reads.
2. **[HIGH/MED] Remove the exec-id race.** Switch `Get Exec Id` to consume
   `Fire Clone → metadata.subExecution.executionId` instead of `execution:getAll` "latest". One-node
   change; eliminates silent golden mis-attribution risk over a long sequential run. (Applies to both
   capture orchestrator and replay.) Also: do not manually run the clone while the capture is in flight.
3. **[MED] Broaden the capture→replay self-check before trusting the baseline for diffs.** The 5-turn /
   2-conversation sample never exercised `get-access-types` (its fixture/replay path is UNVALIDATED),
   the parser bypass on most turns, or a long conversation. Run a self-check on a sample that hits
   `get-access-types` + a ≥10-turn slice and confirm 0 false positives. (Not required for the capture
   itself, but required before relying on the resulting baseline as a regression oracle.)
4. **[MED] Decide golden retention before capture.** ~90k rows, low-GB JSONB with large RAG/get-results
   payloads. Either accept it, or omit/truncate `input_json` for large nodes and cap RAG payloads.
   Monitor `golden_nodes` size mid-run.
5. **[LOW] Document the normalization blind spots** next to the baseline: global `<TS>` masking of
   full-datetime string VALUES and `*_at` KEYS can hide a change confined to such a field (mitigated by
   co-varying business fields; pure `YYYY-MM-DD` dates survive). Fix the "sha256" doc label (it's a
   32-bit rolling hash; the real compare is full canonical string, so it's harmless).
6. **[LOW] CRM read-load sign-off + off-peak scheduling.** ~7–10k prod reads + ~2,216 `mcp_access_log`
   rows. Notify the CRM owner and run off-peak (plan §8.1).
7. **[LOW] get-rag replay determinism** — only if future replays show intermittent get-rag diffs at a
   rounding boundary, add a get-rag replay gate. No action needed for the capture.

**Bottom line:** the harness is safe and the diff has teeth and doesn't over-strip. **GO-WITH-FIXES** —
land TUNING #1 and #2 (or run in batches) before the unattended 5–7 h capture; #3–#7 tune alongside.
