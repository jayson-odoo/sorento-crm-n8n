# Node-diff — Chat console (Phase 1, CLONE build)

Change-id: `chat-console` · Coder pass · date 2026-07-13
Plan: `n8n-workflows-init/plans/chat-console-plan.md` (Phase 1 only)

**Scope:** additive, fail-safe `chat_id` gate so the bot can be self-tested without WhatsApp. When `contact.chat_id` is present the reply is RPUSHed to redis `chat:reply:{chat_id}` instead of respond.io / staff; when absent, behaviour is byte-identical to before. Everything is on the CLONE lane + forks. **Live spine `9qVyfUxmRQqrpGRMDLRuz` and live shared subs `aoydkG1dbItXR5jXFEQsP` / `rrYXzE61gCNUck_zmXe-G` were NOT touched.** No promotion. No UAC executions run (tester's job).

## New / changed workflow IDs

| Workflow | ID | State | What |
|---|---|---|---|
| `sub-sendmsg-CHAT` (NEW fork of `aoydkG1dbItXR5jXFEQsP`) | `ublq9nSlrpz63xan` | created + published | sendmsg sub with `chat?` gate |
| `sub-human-intervention TEST (delta3)` (EDITED clone fork) | `vUfFUDjLAuMaeQE6` | edited + published | HI fork with `chat?` escalation-marker gate |
| clone spine `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | edited + published (active `28fb29ad`) | 6 sendmsg calls repointed, audio-echo `contact` fix, attachment chat gate |
| `zz-chat-console` (NEW) | `qJzJqgAXIZfcgUOG` | created + published | inject webhook |
| `zz-chat-read` (NEW) | `nVWuDvfdFll7YwGs` | created + published | drain/read webhook |

## Step 0 — prereq findings (clone inspection, read-only)

- (a) Clone `findcontact` node `sorento-sub-respond-findcontact-respond` **is a pure passthrough**: `return $('redis-pop-main-message-list').first().json.message.contact` → `chat_id` stashed in the queue item's `contact` survives to every send call-site. Good.
- (b) Clone call-sites at build time: the **6 sendmsg calls all pointed at the SHARED LIVE sub `aoydkG1dbItXR5jXFEQsP`** (respond, respond2, respond3, respond4, respond5, `-transcribed-message`) — NOT a fork (doc-drift vs CLAUDE.md which said forks; sendmsg had no fork). Human-intervention pointed at fork **`vUfFUDjLAuMaeQE6`** (matches CLAUDE.md). Reformulator pointed at LIVE `XTODTw-…` (doc-drift; irrelevant here).
- (c) Clone is **dispatcher-driven**: dispatcher `zz-dispatcher-test` `2D0cw2Y1aPW2LOlU` pops `ready-contacts-test` → acquires `test:lock:{c}` → calls the clone as a **blocking** sub with `{contact}` → clone `redis-pop-main-message-list` pops `test:q:{{ $json.contact }}`. The older `zz-canary-run` path is not what the clone uses now. Injection in step 4 matches this.
- Safety pre-req: clone has **no Schedule/webhook trigger** (only `When Executed by Another Workflow` executeWorkflowTrigger) — nothing can consume the shared prod `main-message-list`. Satisfied.
- The clone's 3 real attachment httpRequests (`send-message-images/-video/-files`) are **already orphaned** (0 inbound); the attachment egress is already captured by the existing `guard-e/f/g-record` (Switch → guard record → Loop Over Items1). So the "wrap the httpRequest" instruction was realised on the guard path (see below), not on the dead nodes.

## Guard group A — sendmsg fork (`sub-sendmsg-CHAT` `ublq9nSlrpz63xan`)

Faithful fork of the live sendmsg sub with an additive gate inserted **first** (before `test-guard`), so it fires even though the clone always passes `is_test=true`.

Nodes (14):
- `When Executed by Another Workflow` — executeWorkflowTrigger, same 9-field input schema as the live sub (incl. `contact` object, `is_test`).
- **NEW `chat?`** — IF `notEmpty` on `{{ ($('When Executed by Another Workflow').first().json.contact || {}).chat_id }}`.
  - TRUE → `chat-build-parts` → `chat-push`.
  - FALSE → `test-guard` (original path, byte-behaviour preserved).
- **NEW `chat-build-parts`** — Code. Splits `message` into ≤1800-char parts (same LIMIT logic as the sub's `Code in JavaScript`); if `quick_reply` present emits one `{type:'quick_reply', text, quick_reply}`, else one `{type:'text', text, part}` per part. Adds `chat_id`, `part`, `ts`.
- **NEW `chat-push`** — Redis `push` (tail=true → RPUSH, preserves order for LRANGE), list `chat:reply:{{ $json.chat_id }}`, one push per item. Cred: `sorento-redis` `H5w6o7tptzTPMVdy`.
- `test-guard` — IF `is_test===true` (unchanged from live). TRUE → `test-guard-record`; FALSE → real-send path.
- `test-guard-record` — Redis push to `test:egress:{test_run_id}` (`guard:"sendmsg-sub"`, `would_send`) — **byte-identical to the live sub's guard**, so existing UAC assertions still hold after repoint. Cred `sorento-redis`.
- Real-send path (FALSE + no chat, i.e. `is_test=false` — **never reached on the clone**): `If`(quick_reply empty) → `Code in JavaScript`(split) → `If1`(message notEmpty) → `Loop Over Items`(onEachBatch → `Send a Message` respondio → `Call 'sub-respond-save-message-redis'1`; onDone → `send-done` noOp); quick_reply branch → `HTTP Request`.

**Omitted vs the live sub, with rationale (all are dead on the clone):**
- The 4 disabled dead nodes (`Switch1`, `Find a Message`, `Wait`, `Send Template`) — disabled + unreachable in the live sub; dropped.
- The 2 langchain memory nodes (`Chat Memory Manager` + `Postgres Chat Memory1`) — only run on the real-send (`is_test=false`) path, which the clone never hits (clone always `is_test=true` or `chat_id` present). Dropped to avoid re-creating a prod-`sorento-crm-db` write via lossy SDK reproduction. **Phase-2 promotion targets the LIVE sub (which keeps memory), not this fork**, so no fidelity loss for promotion.
- `Send a Message` (respondio) bound to `sorento-api`; `HTTP Request` (quick_reply real-send) could NOT be credential-bound via MCP (predefined-type httpRequest rejects `setNodeCredential`). Both are on the dead real-send path — **no impact on Phase 1**. If the non-test quick_reply path is ever exercised, bind `sorento-api` on `HTTP Request` in the UI.

Zero-egress rationale: on the clone every call passes `is_test=true`, and every chat test passes `chat_id`. `chat_id` present → `chat-push` (redis only). `chat_id` absent → `test-guard` TRUE → `test-guard-record` (redis only). The respondio `Send a Message` / `HTTP Request` are reachable ONLY when `is_test=false AND chat_id absent`, which the clone never produces.

## Guard group B — human-intervention fork (`vUfFUDjLAuMaeQE6`, EDITED in place)

**Deviation from the task wording** ("fork `rrYXzE61…` → new `sub-human-intervention-CHAT`"): instead of lossily re-creating a 16-node escalation sub via SDK, I added the gate **in place to the fork the clone already calls** (`vUfFUDjLAuMaeQE6`, a faithful TEST fork of `rrYXzE61…`). Lossless, and the gate is additive & fail-safe so existing UAC/regression runs (which never set `chat_id`) are unaffected. No repoint needed (clone already points here).

- **NEW `chat?`** — IF `notEmpty` on `{{ ($('When Executed by Another Workflow').first().json.contact || {}).chat_id }}`, inserted between `When Executed by Another Workflow` and `test-guard`.
  - TRUE → `chat-escalation-push`.
  - FALSE → `test-guard` (original path unchanged).
- **NEW `chat-escalation-push`** — Redis push (tail=true) to `chat:reply:{chat_id}`, payload `{type:'escalation', text:'[escalated to <team> team]', team, agent, ts}`. Cred `sorento-redis` `H5w6o7tptzTPMVdy`. **Skips all real assign / SLA POST / PIC-comment writes.**
- Connection change: `When Executed by Another Workflow → test-guard` **removed**; replaced with `→ chat?`, `chat?`[true]→`chat-escalation-push`, `chat?`[false]→`test-guard`.

Zero-egress rationale: `chat_id` present → escalation marker to redis only. `chat_id` absent → `test-guard` TRUE (clone always `is_test=true`) → `test-guard-record` → stop (existing behaviour); the assign / SLA / comment nodes only run when `is_test=false AND chat_id absent`.

Pre-existing validation warnings on this fork (hardcoded `x-api-key` on the 3 SLA/calendar httpRequests) were left as-is per LESSONS §13.

## Guard group C — clone spine egress (`txiPzSxy3Pclsz6v`)

1. **Repoint 6 sendmsg calls** `sorento-sub-respond-sendmsg-respond{,2,3,4,5}` + `…-transcribed-message`: `workflowId.value` `aoydkG1dbItXR5jXFEQsP` → **`ublq9nSlrpz63xan`** (cachedResultName/Url updated to `sub-sendmsg-CHAT`). (`respond3` is one of the clone's orphaned egress nodes — harmless.)
2. **Audio-echo `contact` fix** on `…-transcribed-message`: added input `contact = {{ $('sorento-sub-respond-findcontact-respond').first().json }}` (it previously passed only `contact_identifer`, dropping `chat_id`). Note: added to `workflowInputs.value` only (not the UI `schema` array); runtime maps by `value` key, so `chat_id` now rides the audio-echo path. If it fails to map it degrades to `chat_id` absent → still zero egress.
3. **Attachment chat gate** (the "wrap the 3 attachment httpRequests" instruction, realised on the already-guarded attachment path since the real send nodes are orphaned):
   - **NEW `chat-attach?`** — IF `notEmpty` on `{{ ($('sorento-sub-respond-findcontact-respond').first().json || {}).chat_id }}`.
   - **NEW `chat-attach-push`** — Redis push (tail=true) to `chat:reply:{chat_id}`, `{type:'attachment', text:'[attachment] '+filename+' '+url, url, filename, ts}` (single generic marker for image/video/file; type label simplified from the plan's `[image|video|file]`). Cred `sorento-redis`.
   - Connection change: `guard-e-record`, `guard-f-record`, `guard-g-record` (Switch → guard record) previously each → `Loop Over Items1`; now each → `chat-attach?`; `chat-attach?`[true]→`chat-attach-push`→`Loop Over Items1`; `chat-attach?`[false]→`Loop Over Items1`. The existing `guard-e/f/g-record` test:egress captures are unchanged (they still fire before the gate).

## Bypass — injection path (`zz-chat-console` `qJzJqgAXIZfcgUOG`)

Webhook `POST /webhook/zz-chat-console` body `{text, chat_id?, mode?, contact_id?}` →
- `build-item` (Code): builds the canonical queue item (same nesting the clone expects: `message.message.message.text`, `contact` with `id`+`chat_id`), `contact.id='437264483'`, `contact.chat_id = body.chat_id || generated`, `mode = body.mode || 'uac'`, `test_run_id='chatcon-<ts>'`, `scope='chat-console'`.
- `push-queue` (Redis RPUSH `test:q:437264483` ← `JSON.stringify(item)`).
- `push-ready` (Redis RPUSH `ready-contacts-test` ← `437264483`).
- `fire-dispatch` (HTTP POST the dispatcher's own webhook `…/webhook/zz-dispatch-test`, immediate-response → async; `onError:continueRegularOutput`, 4s timeout).
- `respond-queued` (Set): returns `{chat_id, test_run_id, status:'queued'}`.

## Bypass — read path (`zz-chat-read` `nVWuDvfdFll7YwGs`)

Webhook `POST /webhook/zz-chat-read` body `{chat_id}` → `read-list` (Redis `get` keyType=`list` → ordered array in `replies`) → `del-list` (Redis `delete`, drains for cleanup; `onError:continueRegularOutput`) → `format-parts` (Code: JSON.parse each element) → returns `{chat_id, count, parts[]}`.

## Known limitations (not blockers)

- **No `EXPIRE` on `chat:reply:{chat_id}`.** The n8n Redis node v1 has no standalone EXPIRE op (only `incr` carries a TTL). The plan's `EXPIRE 600` is therefore **not implemented**; cleanup is handled by `zz-chat-read` draining with `get`+`delete` (drain-on-read). Orphaned keys (a chat that's queued but never read) will linger — acceptable for a test harness.
- `zz-chat-read` **drains (DEL) on every read** — read once after the run completes; it is not a non-destructive poll.
- `mode` defaults to `uac` (real prod reads, egress blocked). Prod session **reads** are allowed (LESSONS §31); the prod `save-session-vars` PUT is orphaned in the clone → no prod write. Pass `mode:'regress-capture'` in the body to source session from `n8n_test.respond_contacts_test` instead.

## Tester recipe (for the tester agent — do not run here)

Injection (async):
```
POST https://automate-sorento.foundryx.my/webhook/zz-chat-console
{ "text": "plywood stock please", "chat_id": "uac-chat-1" }
```
(dispatcher `2D0cw2Y1aPW2LOlU` is fired automatically; the clone runs as a blocking sub, ~5-10s.)

Read replies (after ~10s):
```
POST https://automate-sorento.foundryx.my/webhook/zz-chat-read
{ "chat_id": "uac-chat-1" }
```
Expect `parts[]` with the bot reply (`type:'text'`/`quick_reply`), an `escalation` marker for escalation prompts, and `attachment` markers for media.

## Webpage front-end (added 2026-07-13)

The raw webhooks needed a UI. Two attempts:
- **`zz-chat-page` `BsYe25n1QSk8HbAx` (ABANDONED)** — an n8n webhook serving a static HTML chat page whose JS `fetch`es the two webhooks. **Does not work:** n8n force-injects `Content-Security-Policy: sandbox …` (WITHOUT `allow-same-origin`) on every HTML webhook response, giving the page a `null` origin; the webhooks' ACAO is pinned to the host (ignores `allowedOrigins`), so every fetch is CORS-blocked. Overriding the CSP via `responseHeaders` is ignored. Superseded — safe to archive.
- **`zz-chat` `oyYfVvZHRZpWubTy` (WORKING)** — native n8n **Chat Trigger** (public hostedChat, `responseMode:lastNode`). n8n's first-party chat widget talks to its own backend → no CORS/CSP fight. **Final flow (synchronous, blocking):** `chat` → `build-item` (chat_id = chat `sessionId`, contact 437264483, mode uac) → `clear-q`/`clear-lock`/`clear-ready` (DEL `test:q:{c}` / `test:lock:{c}` / `ready-contacts-test` — self-heals stale backlog so each submit is processed cleanly) → `push-queue` → `push-ready` → **`call-dispatch`** (executeWorkflow dispatcher `2D0cw2Y1aPW2LOlU`, `waitForSubWorkflow:true` — blocks until the clone finishes so ALL reply parts are present, no poll/race) → `read-list` (`chat:reply:{sessionId}`, keyType list = LRANGE) → `del-list` → `format-out`. Type → spinner (~5–18s) → reply inline.
  - **URL:** `https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`
  - **`format-out` rendering:** WhatsApp `*bold*` → markdown `**bold**`; single newlines → hard breaks; **attachments → markdown link `📎 [filename](url)`** (image types → inline `![]()`); escalation → `⚠️` line. So the widget shows a tappable file chip, not a raw presigned-URL blob.
  - **`customCss`** on the chat trigger: readable font/line-height, white bot bubbles with border+shadow on a grey body, blue user bubbles, constrained widths, list spacing.
  - Browser-verified (Playwright): text reply (`chat-console-styled.png`), order list (bold labels + line breaks), and attachment (`chat-attach3.png` — `📎 GXYU5060994.xlsx` clickable). Reuses the gated subs → same zero-egress guarantee.
  - **Design notes:** earlier fire-and-poll (`wait-reply`→poll loop) was replaced by the blocking `call-dispatch` because the poll returned on the first parts and raced ahead of the later-pushed attachment marker. The clear-before-push nodes were added after stale `ready-contacts-test` tokens (qlen 1 / readylen 6) caused the dispatcher to serve an older submit → reply under a stale chat_id.

Zero-egress assertions the tester should confirm:
1. respondio `Send a Message` / `HTTP Request` in `sub-sendmsg-CHAT` did NOT execute (chat branch taken).
2. No real assign/SLA/PIC write in the HI fork (escalation → `chat:reply` marker only).
3. No attachment httpRequest fired (the clone's `send-message-*` remain orphaned; marker via `chat-attach-push`).
4. Regression: a normal queue item WITHOUT `chat_id` (`is_test=true`) through `sub-sendmsg-CHAT` still records to `test:egress:{test_run_id}` (falls through `chat?`→`test-guard`→`test-guard-record`), proving the gate is `chat_id`-scoped and prod-safe.
