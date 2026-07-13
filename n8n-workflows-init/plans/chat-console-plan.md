# Chat console — live-safe self-test harness (plan)

## Goal
A chat-input harness to test the bot without WhatsApp (we're live, can't easily self-message). Type text → it's injected into the queue as a respond.io-shaped `message.received` event → the **real spine** runs (real reformulator/RAG/MCP/LLM) → the reply is routed to a **redis rendezvous** instead of respond.io/WhatsApp, and read back via a viewer. No real customer/staff egress.

## Decisions (2026-07-13, user-gated)
- **Clone first → promote.** Build + validate on the CLONE spine `txiPzSxy3Pclsz6v` calling forked subs (session sandboxed to `n8n_test`, zero prod mutation). Then promote the gated subs to live + repoint the console at the live producer. User-gated.
- **Async viewer.** Console injects and returns immediately (chat_id + "queued"); replies are drained from `chat:reply:{chat_id}` by a separate read endpoint. No in-chat wait loop.
- **Full egress gating.** Gate every egress path incl. the 3 inline attachment httpRequests + the audio-echo call-site, not just text/quick_reply.

## The carrier (why this is cheap) — verified against live spine 2026-07-13
`sorento-sub-respond-findcontact-respond` in the spine is a **pure passthrough** Code node:
```js
return $('redis-pop-main-message-list').first().json.message.contact
```
Every reply call-site reads the whole object via `$('sorento-sub-respond-findcontact-respond').first().json`. So a field stashed in the queue item's **`message.contact`** rides untouched to the send layer. → carrier = **`message.contact.chat_id`**. No spine edits needed to *thread* the flag (only to gate egress + the audio-echo call-site which drops the contact object).

Producer `sorento-main` (`NwMOBEQ1NW7LVky5`) already accepts an arbitrary respond.io body and sets `queueItem.message = <body>`. So a body with `contact.chat_id` set flows through with **zero producer edits**.

## Egress surface (live spine `9qVyfUxmRQqrpGRMDLRuz`) — all must be gated on `chat_id`
| Egress | Node(s) | Type | Passes `contact` obj? |
|---|---|---|---|
| text/quick_reply reply ×6 | `sorento-sub-respond-sendmsg-respond`, `…-respond2` (primary), `…3`, `…4`, `…5` | executeWorkflow → sub `aoydkG1dbItXR5jXFEQsP` | yes (5/6) |
| audio echo "You said:…" | `…-respond-transcribed-message` | executeWorkflow → same sub | **NO** (only `contact_identifer` = `tf-message…contact.id`) |
| attachment media send ×3 | `send-message-images`, `send-message-video`, `send-message-files` | **inline httpRequest** (not a sub) | n/a (uses presigned url) |
| escalation / assign | `Call 'sub-human-intervention'` (`rrYXzE61gCNUck_zmXe-G`) | executeWorkflow | yes — **fires real staff email/WhatsApp; MUST gate** |
| msg logger | `Call 'sub-respond-save-message-redis'2` (`UrETd-jm46tFj3Xw7w8vL`) | executeWorkflow | leave (writes redis log only, no customer egress) |

Reply text/quick_reply assembled in **`compile-current-state`** (`user_response`,`quick_reply`,`variables.last_result_set`); error path `set-ran-query-formulator.response`; attachment text = `Switch.presigned_url`.

## Rendezvous protocol
- Key: `chat:reply:{chat_id}` (redis LIST). Each outgoing part / quick_reply / escalation-marker = one `RPUSH` of `{type, text, quick_reply?, part?, ts}`.
- Console reads with `LPOP`/`LRANGE` (drain) until idle/timeout.
- TTL on the key (e.g. `EXPIRE 600`) so orphans self-clean.

## Gating logic (added to each egress site)
`chat_id = contact.chat_id` (or top-level input where no contact obj).
- **present** → `RPUSH chat:reply:{chat_id}` the payload; SKIP the real send. (attachment: push `{type:'attachment', text:'[image/video/file] '+url}` instead of the httpRequest.)
- **absent** → unchanged real path. Real traffic has no `chat_id` → zero behavior change.

## Build — Phase 1 (CLONE, zero egress, no promote)
Targets: clone spine `txiPzSxy3Pclsz6v`, forked subs, new console workflows. Never edit live spine/subs in this phase.

1. **Fork sendmsg sub** `aoydkG1dbItXR5jXFEQsP` → `sub-sendmsg-CHAT` (new id). Insert a `chat?` IF on `contact.chat_id` before the respond.io `Send a Message` / `HTTP Request`: true → `RPUSH chat:reply:{chat_id}` (loop parts) + skip; false → existing path. Keep the existing `test-guard` too.
2. **Fork human-intervention** `rrYXzE61gCNUck_zmXe-G` → `sub-human-intervention-CHAT`. Gate on `contact.chat_id`: present → `RPUSH chat:reply` a `{type:'escalation', text:'[escalated to <team>]'}` marker + skip real assign/SLA/PIC writes.
3. **Clone spine edits** (`txiPzSxy3Pclsz6v`):
   - Repoint the 6 sendmsg calls → `sub-sendmsg-CHAT`; the human-intervention call → `sub-human-intervention-CHAT`.
   - Audio-echo call-site `…-respond-transcribed-message`: add `contact` = `$('…findcontact…').first().json` to its inputs so `chat_id` carries (currently drops it).
   - 3 inline attachment httpRequests: wrap each in a `chat?` IF → true branch `RPUSH chat:reply` an `[attachment] url` marker instead of the httpRequest.
   - Confirm clone `findcontact` fork is also passthrough (chat_id survives). If clone uses is_test hardcoded on sub calls, the forks ignore is_test and branch on chat_id.
4. **`zz-chat-console`** (new): Chat/Form/Webhook trigger `text` → build respond.io body (contact `437264483`, `contact.chat_id = sessionId|uuid`, `message.message.text = text`) → inject into the clone intake (RPUSH `test:q:{contact}` the `{message, contact}` item + RPUSH `ready-contacts-test` token, then fire dispatcher `2D0cw2Y1aPW2LOlU`) → set `EXPIRE chat:reply:{chat_id} 600` → return `{chat_id, status:'queued'}`.
5. **`zz-chat-read`** (new): body `{chat_id}` → `LRANGE/LPOP chat:reply:{chat_id}` → return drained parts.

### Phase-1 acceptance (all must hold)
- Type "plywood stock please" → within ~10s `chat:reply:{chat_id}` has the bot's reply part(s); `zz-chat-read` returns them.
- Zero real egress: no respond.io `Send a Message`/httpRequest fired (assert via execution data), no human-intervention assign, no attachment httpRequest.
- Escalation prompt → `[escalated]` marker in chat:reply, NOT a real staff ping.
- Real-traffic regression: a normal item **without** chat_id through the same forked sub still takes the real path (branch is chat_id-gated).

## Build — Phase 2 (PROMOTE to live, user-gated, backup-first)
1. Backup live sub `aoydkG1dbItXR5jXFEQsP`, `rrYXzE61…`, live spine `9qVyfUxmRQqrpGRMDLRuz` versions → `backups/`.
2. Port the `chat?` branch into the **shared live** sendmsg + human-intervention subs (guards additive; `chat_id` absent = unchanged).
3. Port the inline-attachment gates + audio-echo `contact` fix into the **live spine** (reviewed spine edit).
4. Repoint `zz-chat-console` to inject via the **live producer** `sorento-main` webhook (`/webhook/0b2cc5ea-…`) with `contact.chat_id` in the body — drives the real live spine. ⚠️ this means real `session_vars`/CRM/LLM for contact `437264483` (own number) — accepted realism.
5. Verify one live chat round-trip; confirm no WhatsApp send, no staff ripple.

## Safety
- Phase 1 = clone + forks only, session in `n8n_test`, zero prod touch.
- `chat_id`-gating is **additive & fail-safe**: absence = today's behavior, so live traffic is untouched even after promote.
- Human-intervention gating is mandatory (staff-ripple). Attachment + audio gating included (full-gating decision).
- Never edit the live spine directly; Phase-2 spine edit is a reviewed, backed-up, user-gated promote.

## Open
- `chat_id` source: chat trigger `sessionId` (stable per session) vs per-message uuid. Session-stable lets one `chat:reply:{sessionId}` accumulate a conversation; uuid isolates each turn. Leaning session-stable + read drains.
- Multi-part replies + quick_reply ordering: RPUSH preserves order; reader LRANGE in order.
