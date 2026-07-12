# CRM-002 — Persist `reply_to_message_id` on incoming chat-history messages

**Component:** respond-message queue consumer (redis `sorento-respond-message` → mongo → CRM `chat_histories`)
**Type:** Enhancement (unblocks WhatsApp quote-reply context in the chatbot)
**Owner:** CRM backend
**Reported:** 2026-07-05
**Status:** Open
**Related:** the n8n side is already deployed (see "n8n side — already done").

---

## Summary

When a WhatsApp user **quote-replies** to an older bot message, respond.io includes a `replyTo` on the inbound message. The chatbot needs to know *which* message was replied to, so it can resolve the user's pick (`"5"`, `"All"`, a code…) against **that** message's result set.

The n8n spine now **includes the reply-to reference in the message it pushes to the save queue**. The CRM consumer must **accept and persist** these fields into `chat_histories`. Today the consumer drops them (unknown fields), and `chat_histories` has no column for them — so the reference is lost at write time.

Once stored, the existing lookup endpoint (`GET /external/conversation-variables/{id}?message_id=`) already returns the correct `referenced_result_set`, and the chatbot already consumes it — both verified working. This ticket is the one missing link: **write the reply-to reference on incoming messages**.

## What n8n now sends (already deployed)

The producer (`sub-respond-save-message-redis`) pushes a JSON object onto redis list `sorento-respond-message`. For **incoming** messages it now contains two new fields:

```json
{
  "contact_id": "477071887",
  "phone_number": "+60162291679",
  "message": "All",
  "sent_at": 1783241283006,
  "first_name": "William",
  "last_name": "Tee",
  "type": "incoming",
  "reply_to_message_id": "1782966714759277",   // NEW — respond.io id of the replied-to message (null if not a reply)
  "reply_to_message": "incoming search needs to be more specific. Multiple matches found — please choose:\n1. SRTWCX7405-S-UOA\n..."  // NEW — text of the replied-to message (null if not a reply)
}
```

- `reply_to_message_id` — the respond.io `message_id` of the message the user quote-replied to. **This is the key field.** It matches the `message_id` already stored on the earlier outgoing `chat_histories` row.
- `reply_to_message` — the quoted message's text (for readability / debugging). Optional to store.
- Both are `null` for normal (non-reply) messages.

## What the CRM must do

1. **Schema:** add a nullable column to `chat_histories`, e.g. `reply_to_message_id VARCHAR(50) NULL` (+ optionally `reply_to_message TEXT NULL`). Index `reply_to_message_id` if you plan to query by it.
2. **Consumer:** when reading a queue item of `type = "incoming"`, map `reply_to_message_id` (and `reply_to_message`) onto the `chat_histories` insert. Ignore/store-null when absent.
3. No change for `outgoing` messages.

## Why it matters (the chain, for context)

1. User quote-replies "5" / "All" to an older menu → inbound has `replyTo.id`.
2. Spine saves the incoming row **with `reply_to_message_id`** ← *this ticket*.
3. Next turn, spine calls `GET /external/conversation-variables/{id}?message_id={reply_to_message_id}` → CRM returns `referenced_result_set` = the replied-to message's result set. ✅ already works.
4. Parser resolves the pick against `referenced_result_set`. ✅ already works.

Step 3 already returns the right data **when given a valid `message_id`** (confirmed: `?message_id=1782966714759277` → the 10-row `SRTWCX7405-*` set). The only gap is that we don't currently persist the reference from step 2, so a historical/replayed message can't be linked back. Storing it closes the loop and also gives analytics/debugging a record of what each reply pointed at.

## Acceptance criteria

1. An incoming quote-reply message is stored in `chat_histories` with `reply_to_message_id` = the replied-to message's `message_id` (non-null).
2. A normal (non-reply) incoming message stores `reply_to_message_id = NULL` — no error, no regression to existing inserts.
3. `reply_to_message_id` value equals the `message_id` of an existing outgoing row for the same contact (referential sanity).
4. Existing columns/behaviour unchanged for both incoming and outgoing.

## n8n side — already done (no CRM action needed here)

- Spine `sorento-consume-main` (`9qVyfUxmRQqrpGRMDLRuz`), node `Call 'sub-respond-save-message-redis'2`, incoming payload now emits `reply_to_message_id` + `reply_to_message` (deployed + active, 2026-07-05).
- Path used: `tf-message.message.replyTo.id` / `.replyTo.message.text` — the same reference the live `get-session-vars` already reads successfully.
- Null-guarded: non-reply messages emit `null`.

## Reference — real example

Contact `477071887` (William), 2026-07-02:
- Outgoing menu row: `message_id = 1782966714759277`, `result` = 10 `SRTWCX7405-*` rows.
- User later quote-replied "All" to it → the incoming row for "All" should now carry `reply_to_message_id = "1782966714759277"`.
