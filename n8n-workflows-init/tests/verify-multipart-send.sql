-- Prove a buttoned reply went out as N separate WhatsApp messages, post-promote.
--
-- WHY THIS WORKS: sub-sendmsg logs every delivered part as its own `chat_histories`
-- outgoing row, each with the `message_id` respond.io returned for that send, and all
-- parts of one turn stamped with the same `turn_id` ($execution.id). So N rows sharing a
-- turn_id IS N messages — the row count is written by the send itself, not inferred.
--
-- Run against the PROD CRM DB (reads only):
--   psql -h <crm-host> -U <user> -d <db> -f n8n-workflows-init/tests/verify-multipart-send.sql
--
-- NOTE: do NOT verify this on the chat console. The console runs
-- zz-chat -> zz-dispatcher-test -> sorento-consume-main PROMO-PICKER -> sub-sendmsg-CHAT,
-- which does NOT carry the chunking fix. Only the real WhatsApp path goes through the
-- promoted live sub-sendmsg (aoydkG1dbItXR5jXFEQsP @ 91171ac3).

\echo '== 1. Multi-part turns (most recent first) =================================='
\echo 'parts > 1 means one bot turn was delivered as several WhatsApp messages.'
SELECT turn_id,
       count(*)                                        AS parts,
       count(DISTINCT message_id)                      AS distinct_message_ids,
       max(length(message))                            AS longest_part_chars,
       max(octet_length(message))                      AS longest_part_bytes,
       min(sent_at)                                    AS first_part_at,
       max(sent_at)                                    AS last_part_at
FROM   chat_histories
WHERE  type = 'outgoing'
  AND  turn_id IS NOT NULL
  AND  sent_at > NOW() - INTERVAL '7 days'
GROUP  BY turn_id
HAVING count(*) > 1
ORDER  BY max(id) DESC
LIMIT  20;

\echo ''
\echo '== 2. Part-by-part detail for the newest multi-part turn ===================='
\echo 'Expect: distinct message_ids; every part within the cap; the LAST part carrying'
\echo 'the whole result set (it is the message a button tap quotes).'
WITH newest AS (
    SELECT turn_id
    FROM   chat_histories
    WHERE  type = 'outgoing' AND turn_id IS NOT NULL
    GROUP  BY turn_id
    HAVING count(*) > 1
    ORDER  BY max(id) DESC
    LIMIT  1
)
SELECT row_number() OVER (ORDER BY ch.id)              AS part,
       ch.message_id,
       length(ch.message)                              AS chars,
       octet_length(ch.message)                        AS bytes,
       octet_length(ch.message) <= 1024                AS within_cap,
       COALESCE(jsonb_array_length(ch.result), 0)      AS result_rows,
       left(regexp_replace(ch.message, '\s+', ' ', 'g'), 70) AS preview
FROM   chat_histories ch
JOIN   newest n ON n.turn_id = ch.turn_id
WHERE  ch.type = 'outgoing'
ORDER  BY ch.id;

\echo ''
\echo '== 3. Regression guard: any buttoned part still over the cap? ==============='
\echo 'MUST return zero rows. A row here means a turn that would 400 and die.'
SELECT id, turn_id, message_id,
       length(message) AS chars, octet_length(message) AS bytes
FROM   chat_histories
WHERE  type = 'outgoing'
  AND  turn_id IS NOT NULL
  AND  octet_length(message) > 1024
  AND  sent_at > NOW() - INTERVAL '7 days'
ORDER  BY id DESC
LIMIT  20;

\echo ''
\echo '== 4. Delivery status per part (did BOTH parts actually reach the handset) =='
\echo 'delivery_status is respond.io-side truth, not our own optimism.'
WITH newest AS (
    SELECT turn_id
    FROM   chat_histories
    WHERE  type = 'outgoing' AND turn_id IS NOT NULL
    GROUP  BY turn_id
    HAVING count(*) > 1
    ORDER  BY max(id) DESC
    LIMIT  1
)
SELECT ch.message_id, ch.delivery_status, ch.respond_ts, ch.delivered_ts, ch.read_ts
FROM   chat_histories ch
JOIN   newest n ON n.turn_id = ch.turn_id
WHERE  ch.type = 'outgoing'
ORDER  BY ch.id;
