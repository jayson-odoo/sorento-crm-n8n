// MEDIA INTAKE (voice + image) — step 1 of the lane: classify the popped queue item.
//
// Runs on EVERY turn, right after 'redis-pop-main-message-list'. It must be cheap, must never
// throw, and must pass the queue item through UNCHANGED (tf-message downstream reads
// $input.first().json.message.message — so the item keeps its shape and only gains `_media`).
//
// Shape (grounded, exec 9240705 / 12924778):
//   redis-pop .json.message                 = the queue item (A)
//   A.message                               = B  <- tf-message returns THIS
//   B.message                               = D  { messageId, channelMessageId, contactId,
//                                                  channelId, traffic, timestamp, message: E }
//   B.message.message                       = E  { text, type, attachment }
//   E.attachment                            = { type: image|audio|file|video|text, url, fileName,
//                                               mimeType, mime, ext, size, isPending, description? }
//
// `_media.modality` is the ONLY routing signal the lane uses:
//   'voice' | 'image'  -> if-media-in TRUE  -> CRM media endpoint
//   null               -> if-media-in FALSE -> tf-message (text turn, byte-identical to today)
// Documents (file/pdf) and video are NOT media for this feature — they fall through exactly as
// they do today. The CRM contract (`MediaModality = Literal["image", "voice"]`) is the authority.
const src = $input.first().json;
const item = (src && src.message) || {};
const B = item.message || {};
const E = (B.message && B.message.message) || B.message || {};
const att = (E && E.attachment) || {};
// D = the respond.io message envelope that carries the ids (B.message; E is D.message). The ids
// are NOT on A: `item.messageId` is undefined, which is how `message_id` reached the CRM as ""
// and collapsed its idempotency key to (contact, modality, ordinal) — issue #35. This is the
// same value the rest of the spine reads as `$('tf-message').first().json.message.messageId`
// (tf-message returns B), so the media ledger stays joinable to chat_histories.
const D = B.message || {};

const t = String(att.type || '').toLowerCase();
const mime = String(att.mimeType || att.mime || '').toLowerCase();

let modality = null;
if (t === 'audio' || t === 'voice' || t === 'ptt' || mime.startsWith('audio/')) modality = 'voice';
else if (t === 'image' || t === 'photo' || t === 'sticker' || mime.startsWith('image/')) modality = 'image';

// A media attachment with no fetchable URL cannot be extracted; treat as a text turn so the
// existing pipeline answers on whatever caption/text is there (today's behaviour).
const url = att.url || att.link || null;
if (modality && !url) modality = null;

const caption = (() => {
  const c = (E.text != null && String(E.text).trim()) ? String(E.text).trim()
    : (att.description != null && String(att.description).trim()) ? String(att.description).trim()
    : (att.caption != null && String(att.caption).trim()) ? String(att.caption).trim()
    : null;
  return c;
})();

const bytes = Number.isFinite(Number(att.size)) && Number(att.size) >= 0 ? Math.round(Number(att.size)) : null;

// duration_ms MUST always be sent for voice (captain requirement). Respond.io's attachment
// object carries no duration for WhatsApp voice notes (verified on live items), so:
//   1. use any duration the channel DID send (ms, or seconds when small);
//   2. else a size-derived LOWER-BOUND estimate (assume a 32 kbps upper-bound bitrate; WhatsApp
//      voice notes are Opus ~16–24 kbps, so this under-estimates). Under-estimating is the safe
//      direction: the CRM fast path only uses duration_ms as a HINT to refuse EARLY when it is
//      over the clip cap; the worker measures the real audio and is the authority — so an
//      under-estimate can never cause a false refusal, only a slightly later (worker-side) one.
//   3. else 0 (unknown — never refuses at the gate; worker still enforces the cap).
// `duration_source` travels in `context` (echoed back by the CRM) so operators can tell a
// measured hint from an estimate when reading the ledger.
let duration_ms = 0;
let duration_source = 'unknown';
if (modality === 'voice') {
  const raw = att.duration_ms ?? att.durationMs ?? att.duration ?? att.seconds ?? null;
  const n = raw == null ? NaN : Number(raw);
  if (Number.isFinite(n) && n >= 0) {
    // heuristics: durationMs/duration_ms are ms; bare `duration`/`seconds` > 10000 is almost
    // certainly ms, otherwise seconds.
    const isMs = (att.duration_ms != null || att.durationMs != null) || n > 10000;
    duration_ms = Math.round(isMs ? n : n * 1000);
    duration_source = 'attachment';
  } else if (bytes && bytes > 0) {
    duration_ms = Math.round((bytes * 8) / 32000 * 1000);
    duration_source = 'estimated_from_size_32kbps';
  }
}

const out = JSON.parse(JSON.stringify(src));
out._media = {
  modality,
  attachment_type: t || null,
  media_url: url,
  mime_type: mime || null,
  caption,
  bytes,
  duration_ms: modality === 'voice' ? duration_ms : null,
  duration_source: modality === 'voice' ? duration_source : null,
  // respond.io's own `messageId` first — the CRM field is documented as "Respond.io messageId"
  // (app/schemas/external/media.py) and it is the id chat_histories and sub-human-intervention
  // already log, so a ledger row can be joined back to the message. `channelMessageId` (the
  // WhatsApp wamid) is the fallback for a channel that sends no respond.io id: anything is
  // better than the empty string, which silently merges different messages into one key.
  message_id: D.messageId != null ? String(D.messageId)
    : D.channelMessageId != null ? String(D.channelMessageId) : null,
  respond_io_id: item.contact && item.contact.id != null ? String(item.contact.id) : null,
  // harness control (clone-only readers; inert on live)
  test_run_id: item.test_run_id || null,
  scope: item.scope || null,
};
return [{ json: out }];
