# Chat console — Phase 1 validation run (CLONE)

**Date:** 2026-07-13
**Build:** `tests/diffs/chat-console.md`. Plan: `plans/chat-console-plan.md` (Phase 1).
**Lane:** clone spine `txiPzSxy3Pclsz6v` + forks `sub-sendmsg-CHAT ublq9nSlrpz63xan` / HI `vUfFUDjLAuMaeQE6`; console `qJzJqgAXIZfcgUOG`, reader `nVWuDvfdFll7YwGs`. Live spine/subs untouched. Zero egress.

## Recipe
```
POST /webhook/zz-chat-console {"text":"...","chat_id":"..."}   # inject
# ~10s (dispatcher 2D0cw2Y1aPW2LOlU fires clone as blocking sub)
POST /webhook/zz-chat-read {"chat_id":"..."}                    # drain chat:reply:{chat_id}
```

## Results — ALL PASS

### T-CC1 — text round-trip + zero egress ✓
Inject `{"text":"plywood stock please","chat_id":"uac-chat-1"}` → read returned:
```
{count:1, parts:[{type:'text', text:"Could not find inventory for plywood. Would you like me to escalate to warehouse team?", quick_reply:"", part:1}]}
```
sendmsg-fork exec **`8402450`**: input carried `contact.chat_id:"uac-chat-1"` → `chat?` **TRUE** → `chat-build-parts` → `chat-push` (RPUSH chat:reply). `lastNodeExecuted: chat-push`. `test-guard` / `Send a Message` / `HTTP Request` **never executed**. `redaction.production:false`.
→ Carrier works: `chat_id` stashed in the queue item's top-level `contact` reaches the send layer (clone `findcontact` yields it). Reply routed to redis, not respond.io.

### T-CC2 — fail-safe (no chat_id ⇒ unchanged) ✓  [promotion-critical]
Seeded a normal item via `zz-seed-conc` (no chat_id) → fired dispatcher. sendmsg-fork exec **`8402558`**: input contact has **no** `chat_id` → `chat?` **FALSE** → `test-guard` (is_test true) → `test-guard-record` (test:egress). `lastNodeExecuted: test-guard-record`. `chat-push` / `Send a Message` never ran.
→ Gate is `chat_id`-scoped and additive: absence = byte-identical to today. Live traffic unaffected after promote.

### T-CC3 — escalation ⇒ marker, no staff ping ✓
Follow-up `{"text":"yes please escalate to warehouse","chat_id":"uac-chat-1"}` → read returned an `escalation` part:
```
{type:'escalation', text:'[escalated to warehouse team]', team:'warehouse', agent:'general_enquiries'}
```
HI fork `vUfFUDjLAuMaeQE6` `chat?` TRUE → `chat-escalation-push`; real assign / SLA / PIC-comment writes skipped. No staff email/WhatsApp ripple.

## Minor follow-ups (non-blocking)
- Escalation turn also emitted an empty text part (`{type:'text', text:'', part:1}`) — the post-escalation sendmsg had an empty `message`. Cosmetic; reader could drop empty-text parts.
- `zz-chat-read` is drain-on-read (GET keyType=list + DEL); read once per turn. No EXPIRE (n8n redis v1 lacks standalone EXPIRE).

## Status
Phase 1 validated on clone. **Not promoted** (Phase 2 = user-gated live promote per plan). Live spine `9qVyfUxmRQqrpGRMDLRuz` + shared subs `aoydkG1dbItXR5jXFEQsP` / `rrYXzE61…` never touched.
