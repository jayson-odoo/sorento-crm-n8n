# Chat-console reply-to parity + delete the quoted-text concatenation (plan)

**Status:** PLAN (planner deliverable, 2026-07-31). **DOCS ONLY** — no workflow edited, no execution run.
**Source of truth:** live n8n via MCP, read-only, all IDs/versions re-verified this session (§1.0).
**Deltas:** **A** = zz-chat quote-reply parity (test lane, touches NO live workflow) · **B** = delete the
`reply to:` concatenation from the live spine's reformulator caller (**touches LIVE**, user-gated) ·
**C** = gap assessment only, no build.

| delta | scope tag | build target | touches live? |
|---|---|---|---|
| **A** — zz-chat reply-to parity | **`deterministic`** (driver-priced, §2.9) | `zz-chat oyYfVvZHRZpWubTy`, `sub-sendmsg-CHAT ublq9nSlrpz63xan`, clone spine `txiPzSxy3Pclsz6v` | **NO** |
| **B** — delete text concat | **`parser`** (§3.8 — no mock can see it) | clone spine `txiPzSxy3Pclsz6v` → promote to live `9qVyfUxmRQqrpGRMDLRuz` | **YES**, one leaf, user-gated |
| **C** — pointer payload gap | n/a (assessment) | — | no |
| **DC-1/DC-2** — canaries owed by the live `tryDymPick` deletion | **`parser`** | clone spine + parser fork | no (but see §5.2 **BLOCKER**) |

---

## 1. Grounded facts (re-verified live this session — supersede any earlier note that conflicts)

### 1.0 Version state (all clean: draft == active everywhere, so no rider hazard per LESSON 24/51)

| workflow | id | versionId == activeVersionId | nodes |
|---|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | `a505f2e1-74ef-4fb3-9c87-c4818689b21b` ✅ | 101 |
| clone spine `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `4026f185-e40b-48f2-aab8-a9262a78aa93` ✅ | 135 |
| live parser `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | `8d5f7c2d-1fb7-45e0-9ea2-dfa09957aed5` ✅ | 7 |
| clone's parser FORK | `wI5RkNGW3EOJfBdo` | `006e75f1-11e7-456c-971a-d5b32c0bacbf` ✅ | — |
| live sendmsg sub | `aoydkG1dbItXR5jXFEQsP` | `c712e218-31a7-4fe3-803b-5827af31c54f` ✅ | — |
| console send fork `sub-sendmsg-CHAT` | `ublq9nSlrpz63xan` | `5f73b96a-7a2e-4f4e-828f-e02fc7dfc767` ✅ | — |
| `zz-chat` | `oyYfVvZHRZpWubTy` | `ea8f984a-c6a2-4778-beda-b7ccbba4e036` ✅ | 12 |
| `sorento-main-INJECT` | `sk0zN90Cas4Y6Y2w` | `e273ac0f-8882-4136-b0e8-b88d6b6ec53d` ✅ | — |

Clone `executeWorkflow` targets (re-verified): 8 sendmsg callers → `ublq9nSlrpz63xan`; human-intervention →
fork `vUfFUDjLAuMaeQE6`; reformulator → **fork `wI5RkNGW3EOJfBdo`** (CLAUDE.md's corrected note is right —
the older "clone calls live `XTODTw`" claim is stale); save-message-redis → sink fork `tWm5DYLxfypmVC1T`;
get-results → `rysSPgUssLDf6xJc`; get-rag → `tWP33QOFT7SxThfT`.

### 1.1 The message envelope — the exact depth, measured (this is where a naive fix silently no-ops)

`redis-pop-main-message-list` (`propertyName: message`) → `tf-message` = `return $input.first().json.message?.message`
→ so **tf-message's output json IS the respond.io webhook BODY**, and every downstream consumer reads
`$('tf-message').first().json.message.<…>`.

**Production (measured — live spine exec `10590713`, contact 445239413, text "Yes"):**

```
tf-message.json = {
  event_type:"message.received", event_id, contact:{…}, channel:{…}, sender:{…},
  message: {                          ← body.message  = $('tf-message')…json.message
    messageId: 1785429127000000,
    channelMessageId:"wamid.…", contactId, channelId, traffic:"incoming", timestamp,
    message: { type:"text", text:"Yes" }        ← …json.message.message.text     ✅
    // replyTo, when present, is a SIBLING of `message` here:  …json.message.replyTo
  }
}
```

**Console today (measured — clone exec `10626106`, chat session `a6d75ed6-…`):**

```
tf-message.json = { message: { message: {text,type,attachment} }, replyTo: {} }
                    └── …json.message.message.text            ✅ works
                    └── …json.message.replyTo  →  UNDEFINED   ❌ the `replyTo:{}` is one level TOO SHALLOW
                    └── …json.message.messageId → UNDEFINED   ❌
```

`zz-chat › build-item` emits `item.message = { message: { message: {…} }, replyTo: {} }`. Because
`tf-message` returns `item.message`, the `replyTo` key lands at *body*-level, not at *body.message*-level.
**Every spine consumer reads `json.message.replyTo`, so the console's `replyTo` is invisible today** — and
"just fill in the existing `replyTo: {}`" would be a textbook false green (memory
`stale-case-fixtures-false-green`). The correct target is `item.message.message.replyTo`.

### 1.2 The 7 live-spine nodes that touch `replyTo` — complete enumeration

| # | node | what it does with replyTo | verdict |
|---|---|---|---|
| 1 | **`Call 'sub-query-reformulator'`** | `latest_user_message` line 2 appends `"reply to: " + (replyTo.message.text ?? replyTo.message.title)` | **delta B target** |
| 2 | **`get-session-vars`** | `…/conversation-variables/{id}{{ replyTo.id ? '?message_id='+replyTo.id : '' }}` — the *structured* path | keep; guarding flag §5.1 |
| 3 | **`Call 'sub-respond-save-message-redis'2`** | incoming logger; persists `reply_to_message_id` + `reply_to_message` (`replyTo?.id ?? null`, `replyTo?.message?.text ?? null`) | keep — this is why B loses no observability |
| 4–7 | `sorento-sub-respond-sendmsg-respond`, `…2`, `…4`, `…5` | `input_message` also appends the suffix | **DEAD** — see §3.3 |

### 1.3 The outgoing `message_id → result` persistence (already live, verified)

Live sendmsg `aoydkG1dbItXR5jXFEQsP` calls `sub-respond-save-message-redis` (`UrETd-jm46tFj3Xw7w8vL`) on
**both** branches with `message_id` + `turn_id` + `result`:
- plain-text: `Send a Message` → `Call 'sub-respond-save-message-redis'1`, `message_id = $('Send a Message').item.json.messageId`, `result = $('Loop Over Items').item.json.result` (the **per-bubble subset**);
- quick_reply: `HTTP Request` → `Call 'sub-respond-save-message-redis' (quick_reply)`, `message_id = $('HTTP Request').item.json.messageId`, `result = result_set` (whole set — one bubble).

Per-bubble attribution comes from `Code in JavaScript`:
`idxIn(part) = [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)]` → `resultSet.filter(r => ids.has(r.idx))`,
with the fallback "no numbered items anywhere → whole set rides part 1".

**Media bubbles have NO logger at all** — `send-message-images` / `send-message-video` /
`send-message-files` are inline `httpRequest` nodes in the spine, not sendmsg calls. A quoted media bubble
is therefore **unresolvable** by `?message_id=` on live today. This is a named, bounded gap (§3.6 R3).

### 1.4 The CRM `?message_id=` contract — exact, from source

`GET /api/v1/external/conversation-variables/{respond_io_id}?message_id=…`
(`sorento_crm_backend/app/api/v1/external/conversation_variables.py:33-65`,
`app/services/conversation_variables_service.py:81-112`):

- Response = `{respond_io_id, session_vars}`. `session_vars` is the **raw JSONB blob** from
  `respond_contacts.session_vars`, verbatim — no `variables` wrapper is added, nothing is normalized.
  (Measured on live: `session_vars = {variables:{…}, quick_reply, user_response}`.)
- With `message_id`: `{**state, "referenced_result_set": get_referenced_result_set(...)}` — injected as a
  **top-level sibling of `variables`**, which is exactly what the spine reads
  (`$('get-session-vars').first().json.session_vars.referenced_result_set`). ✅
- Lookup: `SELECT result FROM chat_histories WHERE contact_id=:cid AND message_id=:mid ORDER BY sent_at DESC, id DESC LIMIT 1`.
  Scoped by **both** contact and message. `message_id` is indexed but **NOT unique** (partial composite
  `ix_chat_histories_contact_message_id`) — hence the `LIMIT 1` discipline.
- **`result` must be a TOP-LEVEL JSON ARRAY.** `return raw if isinstance(raw, list) else None`. A JSON
  *object* (e.g. `{"result_set":[…]}`) returns **`None`**. ← this is what breaks the console today (§1.5).
- Miss, or row-with-NULL-result → `referenced_result_set: null`, HTTP 200, key present. Without
  `message_id` the key is **absent entirely** (asserted in the CRM's own tests).
- Unknown contact → **404 before** the message lookup.
- **The pointer carries `result` and nothing else.** No `dym_offer` (that identifier does not exist in the
  backend), no `entities`, no `domain`, no `turn_id`, no `state_trace`. GET never writes. → grounds §4.

### 1.5 What the console lane persists today — and why it cannot be quoted

`sub-sendmsg-CHAT` › `chat?`-TRUE → `chat-build-parts` → `chat-push` → `console-loggable?` →
`log-chat-history-n8ntest`:

```sql
INSERT INTO chat_histories (… , message_id, result) SELECT …, NULL, $6::jsonb FROM chat_histories;
```
with `$6 = JSON.stringify({ quick_reply:[…], result_set:[…], type, part, source:'chat-console' })`.

Three independent blockers, all in delta A:
1. **`message_id` is the literal `NULL`** → there is no key to quote.
2. **`result` is an OBJECT, not an array** → even with a key, the CRM contract (§1.4) returns `null`.
3. **`chat-build-parts` does no per-bubble attribution** — it splits text but never computes the `idxIn`
   subset, and `log-chat-history-n8ntest` writes the **whole** `result_set` on **every** part. So quoting
   bubble 2 of a 3-bubble reply would return the full set — the harness would be *more permissive than
   WhatsApp* and would hide exactly the bug class we are chasing.

Also: `sub-sendmsg-CHAT` is stale vs live in two further ways — no
`Call 'sub-respond-save-message-redis' (quick_reply)` (the 2026-07-14 promote) and no `turn_id` anywhere
(neither trigger input nor save blob). And the clone's own incoming logger
`log-incoming-chat-history-n8ntest` (Gap-C1 of `console-persistence-plan.md`, now built) *also* writes
`message_id NULL` and `result = {type,source}`.

### 1.6 Session read in the console lane bypasses the CRM entirely

`session-get-gate` = `['regress-capture','regress-replay','chat-stateful'].includes(message.mode)`.
`build-item` emits `mode:'chat-stateful'` → **TRUE → `pg-get-session`** (Postgres) → `get-session-vars`
(NoOp) → reformulator. `get-session-vars-http` (the CRM GET carrying `?message_id=`) is on the FALSE
branch and **never runs for a console turn**.

`pg-get-session`:
```sql
SELECT COALESCE((SELECT session_vars FROM respond_contacts_test WHERE respond_io_id=$1 LIMIT 1),
                '{"variables":{},"referenced_result_set":[]}'::jsonb) AS session_vars
```
The default has `referenced_result_set`, but `pg-upsert-session` writes `JSON.stringify($json)` where
`$json` = `compile-current-state`'s output = `{variables, user_response, quick_reply}` — **no
`referenced_result_set` key**. So the moment the row exists, `session_vars.referenced_result_set` is
`undefined` for every console turn, forever. **The console lane has zero reply-to capability today, at
three independent layers.**

### 1.7 The parser side — what actually consumes the quote

`AI Agent.text` (live parser):
```
=Previous response: {{ …previous_conversation_state?.response … }}
Current user message: {{ $('When Executed by Another Workflow').first().json.latest_user_message }}
```
→ **the quoted bot text is interpolated RAW into the prompt as if the user said it.** The 30,482-char
`systemMessage` contains **zero** occurrences of `reply to`, `quoted`, `replyTo`, or
`referenced_result_set` — the suffix is *uninstructed noise*. There is no prompt contract to break.

`output_exchange` consumes `referenced_result_set` structurally and **prefers it over
`prevState.last_result_set`**:
- L369–371: `_refSet = Array.isArray(parent_input.referenced_result_set) ? … : []`;
  `_lrsAll = _refSet.length ? _refSet : prevState.last_result_set`;
  `_pickCtx = _refSet.length > 0 || _selCtx==='disambiguation' || _selCtx==='suggest_offer'`
  — i.e. **the mere presence of a referenced set is itself treated as a pick-context**, which is what makes
  reply-to-an-older-message work when `selection_context` is null.
- L403–404: `lastSet = Array.isArray(parent_input.referenced_result_set) ? … : prevState.last_result_set`
  drives REFERENCE POSITIONS → ENTITIES.

---

## 2. DELTA A — zz-chat quote-reply parity (test lane, zero live risk) · scope `deterministic`

### 2.1 Objective
A console turn that quotes an earlier bot bubble must make the **clone spine take the byte-identical path
a WhatsApp quote-reply takes**: `tf-message.json.message.replyTo = {id, message:{text}}` present → a
`message_id`-scoped lookup returns that bubble's own result subset → the parser receives
`referenced_result_set` and resolves positional picks against it. So a WhatsApp-only reply-to bug becomes
reproducible with zero egress.

### 2.2 A(a) — how bot bubbles become addressable: **real `n8n_test.chat_histories` rows**, with a test-lane mirror of the CRM lookup

**Decision: real rows + a faithful local mirror. Reject both alternatives.**

*Why not "use the real CRM endpoint"?* Two dead ends, both unsafe or false-green:
- Making the endpoint resolvable requires the bot bubble to exist in the **PROD** `chat_histories`. That is
  a prod write → violates §0 S3. Non-starter.
- Pointing the console at prod CRM reads with a synthetic `message_id` does **not** 404 (contact
  `437264483` exists in prod, so `get_for_contact` succeeds) — it returns HTTP **200** with
  `referenced_result_set: null`. The turn then silently behaves as if no quote was made and the case
  passes. That is the `green-that-cannot-fail` class: an assertion that goes green precisely when the
  mechanism didn't run. Explicitly rejected.

*Why not a stubbed lookup (e.g. read `respond_contacts_test.session_vars.variables.last_result_set`)?*
Because it collapses the two properties that make reply-to interesting — (i) addressing an **older** turn,
(ii) getting a **per-bubble subset** — into "the most recent whole set". A stub would pass while the
production bug persists. Rejected.

*Why real rows work:* both loggers already write to `n8n_test.chat_histories`, which has the **same schema
as prod's** (same columns incl. `message_id`, `result`, `turn_id`, `state_trace`). The mirror is a SQL
change plus one SELECT, not new infrastructure.

**Divergences under the chosen design (state them in the run log, do not paper over):**

| dimension | WhatsApp / live | console after A | faithful? |
|---|---|---|---|
| bubble id | respond.io `messageId` (µs epoch int) | minted `String(Date.now())+part`, numeric, ≤64 chars | shape-faithful, value synthetic |
| lookup | CRM HTTP `?message_id=` against prod `chat_histories` | Postgres SELECT against `n8n_test.chat_histories`, **same WHERE/ORDER BY/LIMIT and same array-or-null semantics** | faithful by construction; must be asserted, §6 V-A2 |
| per-bubble subset | live `Code in JavaScript` `idxIn` splitter | same `idxIn` logic copied into `chat-build-parts` | faithful (A3) |
| quoting a **media** bubble | impossible on live too (§1.3, no logger) | impossible | faithful by accident — record as a shared gap |
| quoting a **quick_reply** bubble | logged since 2026-07-14 (live) | logged (A2) | faithful |
| bubble count shown to the user | N WhatsApp bubbles | `format-out` collapses all parts into ONE widget message → must be re-split/labelled (A4) | needs A4, else not addressable at all |
| `?message_id=` HTTP round-trip itself | exercised | **NOT exercised** (pg lane) | ⚠️ the CRM route stays untested by this harness — call it out; it is covered only by the CRM repo's own tests |

**Change-list (all in the test lane):**

- **A1 — mint a per-bubble id.** `sub-sendmsg-CHAT` › `chat-build-parts`: add
  `message_id = String(Date.now()) + String(part).padStart(2,'0')` to each emitted part (numeric string,
  monotonic, ≤64 chars → fits `VARCHAR(64)`, mirrors respond.io's numeric-id shape).
- **A2 — persist it, and fix the `result` shape.** `log-chat-history-n8ntest`: write `message_id = $7`
  (the minted id) and make **`result` a TOP-LEVEL JSON ARRAY** = the per-bubble subset, per §1.4. The
  console-only metadata (`source:'chat-console'`, `part`, `quick_reply`, `chat_id`) moves to the existing
  **`state_trace`** JSONB column (already outside the CRM's external read contract).
  ⚠️ **Corpus-shape change — coder pre-check required:** anything reading `result.result_set` /
  `result.source` / `result.quick_reply` for console rows breaks. Grep `tests/regression/`,
  `v_replies`, `turn_review`, the capture/replay orchestrators (`MGm32814G7XcGSD2`, `aROEBlQyyoQaB7a1`)
  before changing the shape; if any consumer exists, migrate it in the same delta.
- **A3 — per-bubble attribution parity.** Port the live splitter's exact logic into `chat-build-parts`:
  `idxIn` regex → `resultSet.filter(r => ids.has(r.idx))`, fallback whole-set when `parts.length === 1`
  and no numbered items. Without A3 the harness is more permissive than production (§1.5.3).
- **A4 — make a bubble nameable in the UI.** `chat-push` payload gains `message_id`; `format-out` renders
  each part as its **own labelled block** (`⟦n⟧ …`) instead of one merged blob. Because `del-list` wipes
  `chat:reply:{chat_id}` after every turn, the handle→`message_id` map must **not** live there.
  **Decision: resolve handles from `chat_histories`** — a new Postgres node in `zz-chat` (before
  `build-item`) selecting the session's outgoing rows:
  ```sql
  SELECT message_id, message FROM chat_histories
   WHERE contact_id = $1 AND type='outgoing' AND message_id IS NOT NULL
     AND state_trace->>'chat_id' = $2
   ORDER BY id DESC LIMIT 50
  ```
  Single source of truth, survives restarts, no extra redis key lifetime, and `state_trace->>'chat_id'`
  gives clean per-session isolation (two browser sessions on the same contact don't bleed).
- **A5 — the message_id-aware session read (the mirror).** In the clone spine, split `pg-get-session` into
  an **IF on `replyTo.id` presence** feeding two SELECTs — deliberately *not* one clever query, so
  "a non-reply turn behaves exactly as today" is **structurally** provable rather than argued:
  - **no `replyTo.id`** → today's `pg-get-session` verbatim (zero behavioural change; this is the
    regression guard).
  - **`replyTo.id` present** → `pg-get-session-ref`:
    ```sql
    SELECT jsonb_set(
             COALESCE((SELECT session_vars FROM respond_contacts_test WHERE respond_io_id=$1 LIMIT 1),
                      '{"variables":{}}'::jsonb),
             '{referenced_result_set}',
             COALESCE((SELECT result FROM chat_histories
                        WHERE contact_id=$1 AND message_id=$2
                        ORDER BY sent_at DESC, id DESC LIMIT 1), 'null'::jsonb)
           ) AS session_vars
    ```
    Mirror the CRM's **miss = `null`** (not `[]`) exactly — `output_exchange` gates on `Array.isArray`, so
    `null` falls back to `last_result_set`, which is the production behaviour we want reproduced.
    Both nodes converge on the existing `get-session-vars` NoOp (LESSON 5 — every `$('get-session-vars')`
    reference keeps resolving).
- **A6 — reconcile only what the console path needs in `sub-sendmsg-CHAT`.** Add the `message_id`/`result`
  handling (A1–A3). **Do NOT wholesale-sync the fork to live** (LESSON 57 / memory
  `stale-byte-identical-fork-claim`) — the fork's `chat?`-FALSE branch is stale (no quick_reply logger, no
  `turn_id`) but the console never takes it. Record the staleness as a standing item so a future
  "promote the fork" is never attempted; any promote must be built as LIVE + own hunks.

### 2.3 A(b) — the reply affordance: an honest constraint, and the recommendation

The hosted page is n8n's first-party `@n8n/n8n-nodes-langchain.chatTrigger` (`public:true`,
`mode` implied `hostedChat`, `responseMode:'lastNode'`). Its **only** customization hooks are
`initialMessages`, `title`, `subtitle`, `inputPlaceholder`, `customCss`, `allowFileUploads`,
`allowedFilesMimeTypes`, `allowedOrigins`. **There is no DOM or JS injection hook, so a click-to-quote
chip cannot be added to that page.** And LESSONS 43 / memory `n8n-webhook-html-sandboxed` forecloses
serving our own HTML from an n8n webhook: n8n force-injects `Content-Security-Policy: sandbox` (no
`allow-same-origin`) → the page runs at a `null` origin and every `fetch` to an n8n webhook is
CORS-blocked; `responseHeaders` overrides are ignored.

- **A-b1 — RECOMMENDED, ship this: a `/reply` slash command.** Follows the convention `build-item` already
  implements for `/voice`, `/voiceurl`, `/novoice`:
  - `/reply <n> <text>` — quote the bubble labelled `⟦n⟧` in the transcript (handle resolved via A4);
  - `/replyid <message_id> <text>` — quote by exact id (the escape hatch, and what a UAC case should use
    for determinism);
  - `/reply <text>` — quote the most recent bot bubble.
  Zero UI work; runs on the existing hosted page; **nothing downstream of `tf-message` can tell the
  difference** — the queue item is shape-identical to a WhatsApp quote-reply.
  *Divergence:* the tester names a bubble by a printed handle rather than tapping it, and the widget shows
  no visual quote block. Neither is observable by the spine.
- **A-b2 — OPTIONAL follow-up for a true quote chip: a locally-hosted console page.** `zz-chat`'s
  `allowedOrigins` already whitelists `http://localhost:8000` / `http://127.0.0.1:8000`, and
  `zz-chat-console` (`qJzJqgAXIZfcgUOG`) + `zz-chat-read` (`nVWuDvfdFll7YwGs`) already exist as an async
  inject/drain pair. A page served **from localhost (not from n8n)** escapes the sandbox CSP and can render
  a per-bubble reply button + composer quote chip. Cost: a local static server plus re-implementing the
  transcript UI. **Defer** — it changes only the affordance, not the mechanism A1–A5 delivers.

### 2.4 A(c) — inject `replyTo` at the CORRECT depth

In `build-item`, for a `/reply*` turn:
```
item.message.message.replyTo  = { id: <bubble message_id>, message: { text: <bubble text> } }
item.message.message.messageId = <synthetic incoming id>        // currently undefined
```
and **delete** the misplaced `item.message.replyTo` (§1.1). Non-reply turns must emit **no** `replyTo` key
inside `message.message` — matching production, where a non-reply body has no `replyTo` at all (measured,
exec `10590713`).

Also add `messageId` on the incoming side: today it is `undefined`, so the clone's incoming logger falls
back to `test_run_id` and writes `message_id NULL`. With a real `messageId` the console's incoming rows
become joinable and the corpus stops carrying the `undefined` landmine (memory
`stale-case-fixtures-false-green`). Optional-but-cheap for realism: `traffic:'incoming'`, `timestamp`,
`contactId`, `channelId` — no consumer reads them; add only if free.

### 2.5 Egress posture (A changes nothing here)
The `chat?`-TRUE branch reaches only `chat-push` (redis) and `log-chat-history-n8ntest` (Postgres). It
never reaches `Send a Message` / `HTTP Request` / `test-guard`. A's new nodes are Postgres SELECTs plus
Code/IF — **no new egress class is introduced**.

### 2.6 S-CRED is the ONE way A can be unsafe (inherited from `console-persistence-plan.md` §5, EXTENDED)
`chat_histories` exists in **both** `n8n_test` and the prod CRM DB, so a Postgres node mis-bound to
`sorento-crm-db` (`ETJL5KoaA1UpkDip`) **silently INSERTs/SELECTs prod with no error** (LESSON 10).
MCP `get_workflow_details` **redacts credentials**, so "no credentials block" is vacuous (LESSON 47) —
verify via REST `GET /workflows/{id}`. The gated node set for A is now **five**:
`log-chat-history-n8ntest` (fork `ublq9`), `pg-get-session`, **`pg-get-session-ref` (NEW)**,
`pg-upsert-session`, `log-incoming-chat-history-n8ntest` (clone) — plus the **new `zz-chat` handle-lookup
node**, i.e. six. All must be `Dnnofg8Xb27VQOhI`. Any other id, or missing → **HALT, run nothing.**

### 2.7 Contention (not a gate, but a run-log requirement)
The console reads/writes `respond_contacts_test` for `437264483` and now also SELECTs
`n8n_test.chat_histories` — the same rows the golden capture/replay corpus uses. Never run a
capture/replay on `437264483` concurrently with console use (LESSON 30/41).

### 2.8 Acceptance criteria — delta A
- **AC-A1** A `/replyid` turn produces `tf-message.json.message.replyTo.id === <the quoted bubble's message_id>` (from `get_execution` runData, **not** inferred).
- **AC-A2** `pg-get-session-ref` ran and emitted `session_vars.referenced_result_set` as a **non-empty array** whose `idx` set equals the quoted bubble's numbered items — *not* the whole prior result set.
- **AC-A3** `Call 'sub-query-reformulator'` received `referenced_result_set` non-empty, and the parser's `output_exchange` resolved the positional pick against it (`reference_positions` → entities carrying the quoted row's `uuid`).
- **AC-A4** A quote of the **oldest** bubble in a ≥3-turn session resolves to that bubble's set, while `prevState.last_result_set` holds a *different* set — proving the pointer, not the recency fallback, drove the answer. **This is the case that cannot pass by accident.**
- **AC-A5** Quote of an unknown/synthetic `message_id` → `referenced_result_set: null` → behaviour identical to a non-reply turn (graceful fallback, no error).
- **AC-A6** A **non-reply** turn takes `pg-get-session` (the untouched SELECT) and its `get-session-vars` output is byte-identical in shape to a pre-change run. Zero regression on the 100% of turns that don't quote.
- **AC-A7** `n8n_test.chat_histories`: every outgoing console row has a non-NULL `message_id` and a `result` that is a **JSON array** (`jsonb_typeof(result)='array'`), with per-part subsets differing across parts of a multi-bubble reply.
- **AC-A8** §0 S1–S8 all green, S-CRED (§2.6, six nodes) green **first**.

### 2.9 Scope justification — `deterministic`
A changes Postgres SQL, IF gates, and Code-node payload shaping. No parser prompt is touched. **Driver
caveat** (identical to `console-persistence-plan.md` and UAC §21/§22): the console driver runs the real
reformulator fork once per turn and CRM reads are real, because there is no mock lane through
`zz-chat → zz-dispatcher-test → clone`. That is a *driver* cost, not a scope escalation. Parser output is
asserted **structurally** (pointer present, positions resolved), never exact text.

---

## 3. DELTA B — delete the quoted-text concatenation (touches LIVE) · scope `parser`

### 3.1 The bug
`Call 'sub-query-reformulator'.workflowInputs.value.latest_user_message` is a two-line template. Line 2
appends `reply to: <the bot's own quoted text>`, and `AI Agent.text` interpolates the whole thing RAW as
`Current user message:` (§1.7). The bot's words enter the prompt as if the customer said them.
Live symptom: a customer replying `Complaint` to a *"no certificate matched … escalate to
purchasing_certification?"* bubble kept `product_attachment` / `attachment_type: Certification` and never
got the portal link; bare `Complaint` in zz-chat works.

### 3.2 The change — one node, one leaf, one line

Node **`Call 'sub-query-reformulator'`**, JSON pointer **`/workflowInputs/value/latest_user_message`**
(LESSON 32b — *never* prefix with `/parameters/`).

From (live, verbatim):
```
={{ $('tf-message').first().json.message.message.text || $('tf-message').item.json.message.message.attachment.description || $json.message }}
{{ $('tf-message').first().json.message.replyTo?.message ? "reply to: " + ($('tf-message').first().json.message.replyTo.message.text ? $('tf-message').first().json.message.replyTo.message.text : $('tf-message').first().json.message.replyTo.message.title) : "" }}
```
To:
```
={{ $('tf-message').first().json.message.message.text || $('tf-message').item.json.message.message.attachment.description || $json.message }}
```
Note the live value ends with a trailing `\n` after line 2; the target is a **single line with no trailing
newline**. LESSON 58b: the tool-authoring channel right-trims trailing whitespace, so the byte-SHA gate
must be computed against the exact intended string — sha the target file, not a retyped literal.

### 3.3 Consumer enumeration — who reads the `reply to:` suffix (complete, from live JSON)

**Producers of the suffix — 5 nodes, only 1 with a live consumer:**

| node | field | is the value read anywhere? |
|---|---|---|
| `Call 'sub-query-reformulator'` | `latest_user_message` | **YES** — the AI Agent prompt + `output_exchange` (the target) |
| `sorento-sub-respond-sendmsg-respond` / `…2` / `…4` / `…5` | `input_message` | **NO — DEAD.** `input_message` is declared on `aoydkG1dbItXR5jXFEQsP`'s `executeWorkflowTrigger` and referenced by **zero** nodes inside it (also zero in the CHAT fork). Four inert copies of the suffix. |

**Consumers inside the parser — 3, and all three are STRIPPERS, not readers:**

| loc | code | effect of the deletion |
|---|---|---|
| `output_exchange:172` — `tryDymPick` picked-code match | `norm(String(latest_user_message ?? '').split(/\s*reply to:/i)[0])` | no-op (nothing left to strip) |
| `output_exchange:373` — ALL/SEMUA menu expansion | `String(latest_user_message ?? user_message ?? userMsg ?? '').split(/\s*reply to:/i)[0]…` | no-op |
| `output_exchange:638` — member-pick `_rawReply` | `String(latest_user_message \|\| '').split(/\s*reply to:/i)[0].trim()` | no-op |

**Two UNSTRIPPED readers of `latest_user_message` — these DO change behaviour, both in the FIX direction.
They are the reason B needs UAC cases, not just an argument:**

| loc | code | today, on a quote-reply | after deletion |
|---|---|---|---|
| `output_exchange:123→131` | `userMsg = String($json.user_message ?? $json.latest_user_message ?? '').trim().toLowerCase()` → `menuHit = MENU_LABELS[userMsg]` | the suffix means `userMsg` can **never** equal a menu label → the menu-label shortcut is silently dead on every quote-reply | works |
| `output_exchange:649` | `_pos = _extract(parent_input.latest_user_message, output.output.reference_positions)` | `_extract`'s ordinal scan (`\bsecond\b`, `\b(option\|number\|no\.?\|choice)\s*#?\d+`) runs over the **whole string incl. the quoted bot text** → a quoted bubble containing "2." or "second" can inject a **spurious position** into a `member_offer` pick | `_pos` sees only the user's words |

**Verdict: no consumer genuinely needs the text.** If one ever does, the correct shape is a **separate
declared parser input** — `quoted_message` (string\|null) on `XTODTw`'s `executeWorkflowTrigger`,
interpolated into the prompt under its own labelled line (`Quoted bot message: …`) so the LLM cannot
confuse it with the user's words. **Never re-append it to `latest_user_message`.** Do not build it now —
there is no consumer, and adding an always-present field would also require a replay-diff `norm()` rule
(LESSON 40).

### 3.4 Why the reference survives the deletion
The structured path already exists end-to-end on live and is *preferred*: `get-session-vars` sends
`?message_id=` → CRM injects `session_vars.referenced_result_set` (§1.4) → the caller passes it as a
declared parser input → `output_exchange:369/403` prefers it over `last_result_set` and treats its presence
as a pick-context (§1.7). Observability also survives: the spine's own incoming logger
`Call 'sub-respond-save-message-redis'2` persists `reply_to_message_id` + `reply_to_message` on every
non-audio incoming turn, and INJECT's `save-ratelimit-incoming` does the same on the rate-limited branch.

### 3.5 What could regress — enumerated
- **B-R1 — the quoted bubble has no resolvable row.** After deletion, quoting an **unlogged** bubble
  degrades from "the LLM at least saw the text" to "no reference at all". Concretely unlogged:
  **media bubbles** (`send-message-images/video/files` are inline httpRequests with no logger, §1.3), and
  buttoned bubbles sent **before** the 2026-07-14 quick_reply-logger promote. **This is the only real
  regression class.** Accept it as bounded and named; do not pretend it away.
- **B-R2 — `_extract` positional change** on `member_offer` (§3.3). A behaviour change on the CS-member
  path, where a wrong resolution is safety-relevant (staff ripple) → mandatory regression case, and per
  LESSON 39 the pass criterion must be "resolve OR safe new-query abandon; resolve to the WRONG member =
  hard fail", never a single expected value.
- **B-R3 — `MENU_LABELS` change** (§3.3): a quote-reply whose text is exactly a menu label now hits the
  shortcut. Improvement, but a change — assert it.
- **B-R4 — prompt-token reduction shifts borderline LLM classifications.** Unavoidable; it *is* the fix.
  Assert structurally, never on exact text.
- **B-R5 — `referenced_result_set: []` (a part with no numbered items) falls back to `last_result_set`.**
  Unchanged by B — same as today. Note it so a tester doesn't score it as a new fault.

### 3.6 Test scope — `parser` (NOT `deterministic`)
The edited leaf is a *spine parameter*, which reads as `deterministic`. It is not. The change alters the
**LLM prompt**, and the deterministic bypass `mock_reformulator_output` feeds a sibling branch that
**skips `output_exchange` entirely** (LESSON 28), so no mock can exercise either the prompt or the two
unstripped readers. Per plan §8's own note, anything whose only observation channel is a live reformulator
emission is `parser` tier. → **`scope: parser`**, real reformulator required, structural assertions.

### 3.7 Build + promote path (user-gated)
1. Build/test on the **clone spine** `txiPzSxy3Pclsz6v` › same node name, same leaf. (Same expression text
   modulo the clone's own staleness, §5.3.)
2. Promote to live `9qVyfUxmRQqrpGRMDLRuz` **by node NAME** (clone/live node ids diverge — LESSON 58c),
   one `setNodeParameter` on `/workflowInputs/value/latest_user_message`, then the LESSON-58 protocol:
   pre-check draft==active → update draft → re-fetch → **byte-gate draft == intended file** → publish only
   on match → re-fetch and assert active == file. Abort at any mismatch; each abort is free.
3. Permission note (LESSON 58a): live `update_workflow` + `publish_workflow` are classifier-denied until
   the **user** adds the allow-rules; the assistant cannot self-grant. `sorento-coder` is contractually
   barred from live — the live write must be authored in the main agent's own authorized turn (LESSON 26).
4. Backup the prior `versionId` + node body first (LESSON 25).
5. **Post-promote verification must be on the CHANGED PATH** (LESSON 56): verify a real **quote-reply**
   turn, not a happy-path turn.

### 3.8 Acceptance criteria — delta B
- **AC-B1 (the repro)** Cert-miss → escalate-offer bubble; quote it and send `Complaint`. Parser must emit
  `intent_hint`/domain consistent with a **complaint** (no `product_attachment`, no
  `attachment_type: Certification` carried from the quoted text), and the reply must deliver the complaint
  portal link. **Pre-change this same case must FAIL** — run it before the edit and record the red
  (LESSON 61: an assertion never shown to fail is not an instrument).
- **AC-B2 (positional pick by quote)** Quote a numbered bubble, reply `2`. `reference_positions=[2]`
  resolves against `referenced_result_set` and yields the row with that `idx`'s `uuid`. Must still pass —
  proves the structured path carries the reference alone.
- **AC-B3 (member-pick regression, B-R2)** `member_offer` context, quote-reply whose quoted text contains
  a numeral/ordinal. PASS = correct member resolved **or** safe new-query abandon; **resolve to the WRONG
  member = hard fail**.
- **AC-B4 (no-quote regression)** A plain non-reply turn is behaviourally unchanged (`latest_user_message`
  is now a single line with no trailing blank line; assert the parser output shape is unchanged on a
  representative sample).
- **AC-B5 (media-bubble degradation, B-R1)** Quote a media bubble → `referenced_result_set: null` →
  the turn behaves as a non-reply turn, no error. Recorded as **accepted degradation**, not a pass-by-luck.
- **AC-B6** Prompt no longer contains the bot's text: assert from the sub-execution's AI-Agent input that
  `Current user message:` is exactly the user's typed text.
- **AC-B7** §0 S1–S8 green on every clone case; live promote gated on the §3.7 byte-SHA protocol.

---

## 4. DELTA C — gap assessment only (NO BUILD)

### 4.1 The gap
The `?message_id=` pointer carries **`chat_histories.result` and nothing else** (§1.4, verified in CRM
source). It does **not** carry the quoted turn's `dym_offer`, `entities`, `domain_hint`, `intent_hint`, or
`selection_context`. So a quote-reply can address *which list*, but not *which offer/domain* the list
belonged to — which is precisely what `dym_offer`'s TTL machinery exists to guess.

### 4.2 Where the machinery lives
- **Spine `compile-current-state`** (lines ~220–250) owns the whole lifecycle — 7 rules, first match wins:
  1 fresh offer → replace (`ttl:3`, `picked:[]`); 2 domain switch → `null`; 3 escalation committed →
  `null`; 4 pick applied → retain (`ttl:3`, append `picked`); 5 answered with no pick → `null`;
  6 `ttl <= 1` → `null`; 7 else retain with `ttl-1`.
- **Parser `output_exchange` `tryDymPick`** reads `_prev.dym_offer` (legacy fallback `_prev.dym_candidates`),
  matches the typed code, and uses `_offer.id` → `dym_slot` stamping as the tier-0 handle back to the
  source entity (because pick #1 overwrites `raw` and destroys `for_raw`).
- There is **no `ttl` in the parser** — the lifecycle is entirely spine-side.

### 4.3 Could `ttl` be retired if the pointer carried more? — **Partly. Be precise.**
`ttl` exists because the session carries only the *latest* offer and the pick may arrive N turns later with
no indication of which offer it belongs to. A quote-reply would address the offer **explicitly** → for
*quoted* picks, rules 2/5/6/7 and the `dym_slot` tier-0 handle become unnecessary; the pick is
deterministic.

**But the majority of picks are not quote-replies** (a bare typed code with no quote is the common case),
and those still need the carried offer. **Retiring `ttl` outright would require making quote-reply
mandatory for picks — a product decision, not an engineering one.** So the honest framing:
- **Achievable:** *quoted picks become exact*; `ttl`'s blast radius shrinks to unquoted picks only; the
  `dym_slot` machinery stays for those. Rules 2/5/6 stop firing on quoted turns.
- **Not achievable:** deleting `ttl` / the single-use machinery.

### 4.4 Does it need a CRM-side change? — **YES.** Two options.
- **C-opt1 (thin, RECOMMENDED): extend the existing route** to also return a whitelisted
  `referenced_state` for a `message_id`, joining the outgoing row's **`turn_id`** to the *same turn's
  INCOMING* row's **`state_trace->'after'`**. Both columns already exist and are already populated — the
  spine's `Call 'sub-respond-save-message-redis'2` writes `state_trace` v1
  `{v, before, parser_raw, parser_applied, after}` plus `turn_id`. Whitelist: `dym_offer`, `entities`,
  `domain_hint`, `intent_hint`, `selection_context`.
  **Key finding — the data is already there and already usable:** `state_trace`'s `trim()` collapses only
  `last_result_set`, `referenced_result_set`, and `dym_candidates` into `{n, first}` summaries. It does
  **not** touch `dym_offer`, so `dym_offer.candidates` survives **intact**, as do `entities` /
  `domain_hint` / `intent_hint`. **No n8n-side write change is needed for C-opt1** — it is purely a CRM
  read-contract widening. Note `state_trace` is documented in the CRM as "deliberately absent from the
  external read contract", so exposing a subset is a deliberate contract change needing its own review.
- **C-opt2 (fat): dedicated columns** (`referenced_dym_offer`, …) on the OUTGOING row → new Alembic
  migration **plus** writer changes on *both* sendmsg loggers, i.e. more promote surface on the live shared
  sub. Reject unless C-opt1's `state_trace` proves unreliable.

### 4.5 Blockers to name before anyone schedules C
1. **`turn_id` is still NULL on outgoing rows for the escalation path** (memory `obs-latency-contract`:
   sub-callers were never enumerated transitively — LESSON 49 says the true sendmsg caller count is 15, not
   8, because `sub-human-intervention` calls sendmsg 3× itself). The C-opt1 join therefore fails **exactly
   on escalation turns** — the ones that matter most for a dym/escalate offer.
2. **`state_trace` only exists for turns after the 2026-07-22 C5 promote** → a hard coverage cliff for
   historical rows; a replay over the corpus would see NULLs.
3. **`message_id` is non-unique** (partial, non-unique index) → the join must reuse
   `ORDER BY sent_at DESC, id DESC LIMIT 1`.
4. **Media bubbles have no row at all** (§1.3) → unquotable, hence un-joinable.
5. Cross-ref: `plans/dym-single-use-fix.md` (the offer lifecycle + `dym_slot` linkage) and
   `plans/dym-candidate-map-plan.md` (labelled candidates, `for_raw`/`for_canonical`). Both exist
   *because* the offer is carried implicitly; an explicit quoted offer makes tier-0 `dym_slot` resolution
   unnecessary **for quoted picks only** — it must stay for unquoted ones.

**C is assessment only. No scope tag, no cases, no build. If scheduled it is a CRM slice + a small n8n
read change (`deterministic` on the n8n side) and needs its own plan.**

---

## 5. Flags (report, do not fix in A or B)

### 5.1 Inconsistent `replyTo` guarding across the 7 nodes — latent, currently benign
- `get-session-vars`: **bare** `…json.message.replyTo.id`
- INJECT `save-ratelimit-incoming`: `replyTo?.id ?? null`
- spine `Call 'sub-respond-save-message-redis'2`: `replyTo?.id ?? null`, `replyTo?.message?.text ?? null`
- reformulator caller: `replyTo?.message`

**Measured**: live exec `10590713` is a non-reply turn whose `body.message` has **no `replyTo` key at
all**; `get-session-vars` still returned HTTP 200 and the run succeeded (it has `retryOnFail:true`, no
`onError`). So n8n's expression evaluator tolerates member access on `undefined` inside `{{ }}` and the
bare form does not throw today. It is a latent inconsistency, not a live fault.
**Do NOT fix inside A or B** — an unrelated hunk riding a live publish is exactly LESSON 51's rider
hazard. If wanted, it is its own one-leaf semantic-no-op publish.

### 5.2 ⛔ LOUD — the clone's parser fork is STALE vs live, which BLOCKS the two owed canaries
`diff` of `output_exchange` between live `XTODTw` and the clone's fork `wI5RkNGW3EOJfBdo` is **whitespace
only, plus exactly one real line** — and the fork is the side that still has it:

```
> // carry prior domain (do NOT trust the LLM's mis-hint-derived domain on a bare code pick)
> if (_prev.domain_hint) { output.output.domain_hint = _prev.domain_hint; output.output.intent_hint = output.output.intent_hint || _prev.intent_hint; }
```
(fork line 210; **absent from live** — this is the `tryDymPick` prior-domain overwrite the user just
deleted on live.)

**Consequence: any canary for that deletion run on the clone as wired today exercises the OLD code and
reports the OLD behaviour** — a false green or a false red, the `green-that-cannot-fail` class again. The
fork must be re-synced (delete that one line; leave the whitespace) **before** DC-1/DC-2 mean anything.
This also retires memory `ideation-intake-parser`'s "fork is byte-identical to live" claim — decayed, as
`stale-byte-identical-fork-claim` predicted.

### 5.3 The clone's reformulator caller is itself stale vs live (moot after B, but explains a mystery)
Clone line 2 lacks live's `.title` fallback:
- live: `"reply to: " + (replyTo.message.text ? replyTo.message.text : replyTo.message.title)`
- clone: `"reply to: " + replyTo.message.text`

So on a quoted **quick_reply** bubble (whose `replyTo.message` carries `title`, not `text`) live appends
the title while the clone appends `"reply to: undefined"`. **The clone was never a faithful repro of this
bug** — worth stating in the run log so an "it doesn't reproduce on the clone" observation isn't
mis-read. Deleted wholesale by B.

### 5.4 `format-out` collapses N bubbles into ONE widget message
`read-list` → `format-out` joins every `chat:reply` part with `\n\n` into a single `{output}`. WhatsApp
shows N separate bubbles, each with its own `message_id` and its own `result` subset. Until A4, the console
has **no notion of multiple bubbles** and nothing to quote.

### 5.5 Other standing items (not introduced here)
- Corpus-shape change from A2 (`result` object → array) — see the A2 pre-check.
- `chat:reply:{chat_id}` still has no `EXPIRE` (`console-persistence-plan.md` housekeeping).
- `sub-sendmsg-CHAT`'s non-console branch remains stale vs live (no quick_reply logger, no `turn_id`) — do
  not "sync the fork"; build any promote as LIVE + own hunks.

---

## 6. Verification tasks (planner-defined)

Order matters: **V-A0 gates everything in A; V-B0 gates everything in B.**

- **V-A0 (S-CRED, run FIRST, static REST check, blocks all of §25).** `GET /workflows/ublq9nSlrpz63xan`,
  `…/txiPzSxy3Pclsz6v`, `…/oyYfVvZHRZpWubTy` → assert all **six** Postgres nodes (§2.6) bind
  `Dnnofg8Xb27VQOhI`. Any `ETJL5KoaA1UpkDip` or missing → **HALT**. MCP output is vacuous here (redacts
  credentials) — REST only.
- **V-A1 (envelope depth).** From `get_execution` runData on a `/replyid` turn: `tf-message` output has
  `json.message.replyTo.id` populated **and** `json.replyTo` absent. Prove the depth fix landed rather
  than the old shallow key persisting.
- **V-A2 (mirror fidelity).** Diff the `pg-get-session-ref` SQL against the CRM's
  `get_referenced_result_set` clause-by-clause: same `WHERE contact_id AND message_id`, same
  `ORDER BY sent_at DESC, id DESC LIMIT 1`, same **array-or-null** coercion, same "key absent unless
  message_id supplied". Record the comparison in the run log — a mirror that silently diverges is a
  harness that lies.
- **V-A3 (subset, not the whole set).** For a ≥2-bubble reply, assert the two `chat_histories` rows carry
  **different** `result` arrays and that quoting bubble 2 yields bubble 2's `idx` set only.
- **V-A4 (the anti-recency proof).** 3-turn session; quote turn-1's bubble while `last_result_set` holds
  turn-3's set; assert the answer came from turn-1's set. **Then invert it** (quote a bogus id) and confirm
  the case goes RED — an assertion never shown to fail is not an instrument (LESSON 61).
- **V-A5 (non-reply regression).** A non-reply turn routes to the untouched `pg-get-session`; its
  `get-session-vars` output shape matches a pre-change baseline.
- **V-B0 (pre-change RED).** Run AC-B1's repro on the clone **before** the edit and record the failure
  (quoted `Certification` context leaking). Without this red, AC-B1's green proves nothing.
- **V-B1 (prompt hygiene).** From the reformulator sub-execution, assert the AI-Agent input's
  `Current user message:` line equals the user's typed text exactly — no `reply to:` substring anywhere in
  the rendered prompt.
- **V-B2 (stripper inertness).** Confirm the three `output_exchange` strippers still behave identically
  (they become no-ops). Cheap: `prepare_test_pin_data` → `test_workflow` on the pure-code path.
- **V-B3 (unstripped-reader changes are intended).** Assert the `_extract` and `MENU_LABELS` behaviour
  changes (§3.3) explicitly, as *expected new* behaviour — do not let them appear as unexplained diffs.
- **V-B4 (live promote gate).** LESSON-58 protocol: draft==active pre-check → `setNodeParameter` by node
  NAME → byte-SHA draft == intended → publish → byte-SHA active == intended. Abort on any mismatch.
- **V-B5 (post-promote, on the changed path).** Verify a real **quote-reply** live turn (LESSON 56) — not a
  happy-path turn. If the path cannot be exercised, record it **unverified**, never inferred.
- **V-DC0 (BLOCKER for DC-1/DC-2).** Re-sync fork `wI5RkNGW3EOJfBdo`'s `output_exchange` to live by
  deleting the §5.2 line; re-diff and require whitespace-only difference. Until then DC-1/DC-2 are
  **void**, not merely pending.

---

## 7. Open decisions for the user / coder

1. **A-b1 vs A-b2** — ship the `/reply` command now (recommended), or invest in the locally-hosted page for
   a real quote chip? A1–A5 are identical either way.
2. **A2 corpus-shape change** — confirm no consumer reads `result.result_set` / `result.source` /
   `result.quick_reply` on console rows before flipping `result` to an array; if one exists, migrate it in
   the same delta.
3. **B promote timing** — B is a one-leaf live change; confirm it goes on its own publish (not bundled), so
   any production movement is attributable (LESSON 51).
4. **§5.1 guarding cleanup** — separate semantic-no-op publish, or leave? (Recommend leave; it is benign.)
5. **V-DC0** — authorize the fork re-sync so the two owed canaries can run.
6. **C** — schedule or shelve. If scheduled, it needs a CRM-side plan (C-opt1) and blocker #1
   (`turn_id` null on the escalation path) closed first.
