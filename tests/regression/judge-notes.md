# LLM confidence-judge — `sorento-regression-judge`

A reusable n8n workflow that runs an LLM "human-quality" QA pass over a captured golden baseline and
writes a triage score per turn so the user reviews worst-first. **Reads golden only — 0 prod / 0 clone /
0 CRM impact** (the only external call is the judge LLM via the existing OpenAI credential).

- **Workflow id:** `siQerSCwz9Ejq89X`
- **URL:** https://automate-sorento.foundryx.my/workflow/siQerSCwz9Ejq89X
- Validated via MCP; runs AFTER capture against any `golden_run`.

## How to run / params
`manualTrigger` (can't take MCP inputs — set defaults in the **`Init Params`** Code node, or trigger from
the UI):
| param | default | meaning |
|-------|---------|---------|
| `golden_run_id` | `6` | which baseline to score. If left null, `Select Turns` resolves the latest `baseline-full-v1*` run, else `max(golden_runs.id)`. **For the full run set this to the baseline-full-v1 run id (or null).** |
| `judge_model` | `gpt-5.4-mini` | drives the `reviewed_by` tag + notes. The actual model is set on the **`Judge Model`** (lmChatOpenAi) node — change both to switch models. Uses the existing `sorento-openai` credential. |
| `limit` | `null` | optional cap (testing). |
| `throttle_seconds` | `1` | wait between LLM calls. |

Flow: `Init Params → Select Turns (v_replies + skip already-judged) → Loop → Build Prompt → Judge
(chainLlm + lmChatOpenAi, JSON mode, temp 0) → Parse Judgement → Upsert Review → Throttle → next`.

## Data per turn (from `v_replies`, extended in `Select Turns`)
`incoming` (user message), `clone_reply` (`compile-current-state` user_response — judged as
"no user-facing reply produced" when null, e.g. an escalation short-circuit), `prev_user_goal` +
`result_count_before` (from `state_before` = prior session), `result_count_after` (from `state_after`),
plus `conversation_id`/`turn_index`. The judge sees the FULL prior context so a bare "Yes" is judged against
what it confirms (not rewarded for re-dumping the previous result list).

## Rubric (system prompt, STRICT JSON out)
`confidence` 1–5 (5=clearly correct … 1=broken/hallucination), `makes_sense` (bool), `verdict`
(on-point | partial | off-topic | over-resolved | error | hallucination | reasonable-route | clarify-ok |
no-reply | other), `reason` (1–2 sentences). Forced output:
`{"confidence":<1-5>,"makes_sense":<bool>,"verdict":"<tag>","reason":"<text>"}`.
> Tuning note: added a **ROUTING/ACTION rule** — for non-catalog requests (complaints/orders/escalation/
> portal actions) returning the correct portal/action link IS a valid `reasonable-route` (3–4), NOT
> `1/broken`. This fixed a clear mis-score (a working complaint portal-link judged "broken") without
> overfitting. (`chainLlm` with `responseFormat=json_object` returns the **parsed object directly** as
> `$json`, not under `.text` — `Parse Judgement` reads `$json` directly.)

## Where judge scores live (manual scores kept separate + both visible)
The manual scores live in **`turn_review`** (PK `(golden_run_id, trigger_chat_history_id)`,
`reviewed_by='ai'`) and `v_replies` LEFT JOINs that — so adding a 2nd row per turn there would multiply
`v_replies`. **Decision: a separate table `turn_review_llm`** (PK
`(golden_run_id, trigger_chat_history_id, reviewed_by)`), columns `confidence, makes_sense, verdict, reason,
judge_model, conversation_id, turn_index, reviewed_at`. Judge rows use `reviewed_by='llm-judge:<model>'`.
Manual `turn_review` is never touched; both are visible; multiple judge models can coexist.
- **Worst-first triage:** `SELECT conversation_id, turn_index, trigger_chat_history_id, confidence,
  makes_sense, verdict, reason FROM turn_review_llm WHERE golden_run_id = :id ORDER BY confidence ASC,
  makes_sense ASC, conversation_id, turn_index;`
- **Idempotent:** `Select Turns` skips turns already scored by this `reviewed_by` (NOT EXISTS); the upsert
  is `ON CONFLICT (golden_run_id, trigger_chat_history_id, reviewed_by) DO UPDATE`. Re-running a fully-judged
  run processes 0 turns (verified: 0.16 s, timestamps unchanged, no dupes) → resumable after a crash.

## Calibration vs the manual scores on golden_run 6 (5-turn mini-baseline)
Manual: t1(32069)=2 off-topic, t2(33221)=5 on-point, t3(33223)=2 over-resolved, t4(37402)=4, t5(37405)=4.

| turn | incoming | manual | judge (tuned, run 3) |
|------|----------|--------|----------------------|
| t1 32069 | "What type of screws…" | **2** off-topic | **2** off-topic ✓ |
| t2 33221 | "Do you have wc 8152 in stock?" | **5** on-point | **5** on-point ✓ |
| t3 33223 | "Yes" | **2** over-resolved | **2** off-topic ✓ (score exact; reason nails "a bare Yes is a confirmation, not a request to re-dump the 23-item list") |
| t4 37402 | "What can you do" | **4** | **4** clarify-ok ✓ |
| t5 37405 | "How about complaints" | **4** reasonable-route | **4** reasonable-route ✓ |

**Result: broadly agrees — and critically flags t1 + t3 as low (2) in every run** (the worst-first signal
the triage needs). The tuned rubric reached **5/5 exact** on run 3. Observed **LLM-judge variance on
borderline-subjective turns**: t5 was `1` pre-tune (fixed by the routing rule), and t2 (a correct-but-verbose
23-row stock dump — arguably 5 or 2) scored `2` on one tuned run and `5` on the next at temperature 0. So
treat exact scores on borderline turns as advisory; the reliable signal is the **low-confidence flag** for
worst-first review. Recommend the user spot-checks `confidence=3` (ambiguous) and any judge↔manual
disagreements.

## Cost / throughput for scoring 2,216 turns
- Per turn observed ≈ **1.1k–3k input tokens** (the bot reply — long stock/product dumps dominate) + **~70
  output tokens**; one 7-item turn = 1127 in / 67 out. Average ≈ ~2k in / ~80 out.
- Full corpus ≈ **~4–5M input + ~0.18M output tokens** (one-time). At gpt-5.4-mini-tier pricing this is on
  the order of a **few US dollars** (verify against current OpenAI pricing for the chosen model).
- Throughput ≈ judge call ~2–3 s + 1 s throttle ⇒ **~3 s/turn ⇒ ~2 h** for 2,216 turns. Use `limit` to test,
  `throttle_seconds` to rate-limit. Idempotent, so safe to stop/resume.

## Notes / limitations
- `result_sample` (a `->>'title'` pick from `last_result_set`) returns null for this corpus (items aren't
  keyed `title`) — harmless; the full `clone_reply` text already gives the judge the products/stock to judge.
- Postgres nodes were auto-bound to the PROD `sorento-crm-db` on create (LESSONS #10) — **repointed both to
  `n8n_test-db`**; re-verify on any re-import.
- Smoke artifacts: `turn_review_llm` holds the 5 judge rows for golden_run 6 (kept for reference);
  `turn_review` manual rows untouched.
