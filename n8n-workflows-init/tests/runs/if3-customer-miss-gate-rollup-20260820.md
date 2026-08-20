# UAC rollup — If3 customer-miss gate (2026-08-20)

Clone `txiPzSxy3Pclsz6v` at version `f753dd1c-8693-42d9-b920-6efab1ff1ced` (the If3 edit; only node changed vs active base `1c09ef40`). All runs: `uac` mode via the `zz-run-hint` webhook driver, dev contact 437264483, fresh `previous_conversation_state: {}`, real parser (no mock), serialized one at a time. Fixture = byte-copy of the diagnosis CF-C redis item with only `test_run_id`/`scope`/message text changed.

## Results

| case | exec | message | If3 branch | `sub-get-results` ran | outcome |
|---|---|---|---|---|---|
| A2-1 leak reproduce (diagnosis CF-C text, byte-same) | 13176404 | `Customer Mastiles Klang\nSrtwc286 August delivery` | **TRUE (miss)** | **NO** | Miss lane. Reply = existing did-you-mean; **zero order rows, zero attachments**. The 102-row/63-customer leak is closed. |
| A2-2 regression guard (one char different) | 13176666 | `Customer Mastile Klang Srtwc286 August delivery` | FALSE | yes | Exactly **one** order `202608-2349`, MASTILE KLANG SDN BHD only — unchanged from the diagnosis CF-B baseline. |
| A2-3 misspelled alone (diagnosis CF-A) | 13176726 | `Customer Mastiles Klang August delivery` | FALSE | yes | Single-token AND coverage resolves the misspelling; customer survives to `compatible_entities` → gate does not fire. 24 orders, **all MASTILE KLANG** (diagnosis measured 26 on its day — live-data drift in the August window, same shape; the only `SDN BHD` string in the entire result set is `MASTILE KLANG SDN BHD`). |
| A2-4 garbage token (class proof, plan case) | 13176788 | `Customer Zzzyx Qqq Srtwc286 August delivery` | **TRUE (miss)** | **NO** | Blocked. Zero order rows. Proves the class is closed, not just the typo. |
| A2-5 normal enquiry, resolvable customer | 13176870 | `Customer Mastile Klang August delivery` | FALSE | yes | 24 orders, all MASTILE KLANG. Unchanged. |

Per-case gate internals (from `get_execution` runData, marker `test_run_id` verified inside each execution):
- A2-1: parser entities `[customer "Customer Mastiles Klang" (confident), order "Srtwc286"]`, `match_mode: and`; resolver `unresolved_tokens: ["Mastiles Klang"]`, `floor_missed: true`, `fallback_match_mode: "or"`, 5 customer alternatives (all MASTILE KLANG SDN BHD); `compatible_entities` = 10 products only → new term fires.
- A2-2/A2-3/A2-5: `unresolved_tokens: []`, `compatible_entities` contains `customer` → term false.
- A2-4: `unresolved_tokens: ["Zzzyx Qqq"]`, products only → term fires.

## Zero-egress proof (from execution data, all 5 runs + all 19 sub-executions)

- **Forbidden/orphaned egress nodes ran in NO execution:** `send-message-files/images/video`, `update-human-intervened`, prod `save-session-vars` PUT — absent from every run's runData.
- **Every send** went through the guarded `sub-sendmsg-QRCHUNK` fork: nodes ran = `chat-build-parts → chat-push` (redis `chat:reply:{chat_id}` test rendezvous) + `log-chat-history-n8ntest` (n8n_test DB). **No HTTP node ran in any sendmsg sub-execution** — no respond.io call anywhere.
- **Only external HTTP across all executions:** CRM **reads** (`fe-sorento.foundryx.my` access-agent / team-members / references/resolve — allowed) and `api.openai.com/v1/embeddings` inside `sub-get-rag` (live-by-design per LESSONS §18).
- **Egress redis log per run** (`test:egress:{id}`, returned by the driver): exactly `would_log` (guard save-message-redis) + `would_write` (guard save-session-vars) — every would-be prod write captured as a guard record, nothing sent.
- `uac` mode gates off pg session writes; no prod CRM write, no respond.io send, no live-workflow execution occurred in any step.

## Known wording imperfection on gated turns (flagged, deliberately NOT fixed here)

On A2-1 and A2-4 the miss-lane reply is built by the existing `build-suggest-offer` D1, which keyed the did-you-mean on the **ambiguous product** token: *"Couldn't find "Srtwc286". Did you mean SRTWC286-SH-200, SRTWC286-SH-P, or SRTWC286-SH-PP? …"*. That is **actively misleading on a gated turn**: SRTWC286 resolved fine (10 variants survived); the customer is what missed, and the resolver's 5 MASTILE KLANG SDN BHD alternatives go unused. The turn is still safe (a question, zero data rows) and the pick round-trips through the existing `suggest_offer` context. Proposed wording (separate copy PR, one hunk in `build-suggest-offer` D1 — prefer tokens present in `unresolved_tokens` over merely-ambiguous ones, and label customer candidates by name per plan D-E):

> Couldn't find "Mastiles Klang". Did you mean:
> 1. MASTILE KLANG SDN BHD (3000/M0132)
> Reply with a number to continue, or would you like me to escalate to customer_service team?

Also carried from the plan: `not-found-error-message`'s "But no order matched these" is a white lie on gated turns (the query never ran) — same follow-up copy PR.
