// Stage the pasted/attached image for the CRM worker under a PER-MESSAGE key (fix
// 2026-08-22: was chat:media:{chat_id}, shared across the whole session, so a second
// attachment overwrote the first while a CRM job was still fetching it, and image/audio
// could collide on the same key). The id is minted here and threaded straight into
// media_url, so zz-media-serve (which just does GET chat:media:{query.id}, unchanged)
// and this store always agree on the same per-message key.
const trig = $('chat').first().json;
const chatId = trig.sessionId || ('chat-' + Date.now());
const src = $input.first();
const bin = Object.values(src.binary || {})[0] || Object.values($('chat').first().binary || {})[0] || {};
const b64 = src.json.image_b64 || null;
if (!b64) throw new Error('extract-image-b64 produced no image_b64');
const mime = bin.mimeType || 'image/png';
const name = bin.fileName || 'pasted.png';
const bytes = Math.floor(b64.length * 3 / 4);
const execId = ($execution && $execution.id) ? $execution.id : (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
const mediaId = chatId + ':img:' + execId;
return [{ json: {
  media_key: 'chat:media:' + mediaId,
  media_value: JSON.stringify({ b64: b64, mime: mime, name: name }),
  image_mime: mime,
  image_name: name,
  image_bytes: bytes,
  media_url: 'https://automate-sorento.foundryx.my/webhook/zz-media-serve?id=' + encodeURIComponent(mediaId)
} }];