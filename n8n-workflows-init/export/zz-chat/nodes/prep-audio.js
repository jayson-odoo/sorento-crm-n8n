// Stage the recorded/attached audio for the CRM worker under a PER-MESSAGE key (fix
// 2026-08-22: was chat:media:{chat_id}, shared across the whole session, so a second
// attachment overwrote the first while a CRM job was still fetching it, and image/audio
// could collide on the same key). The id is minted here and threaded straight into
// media_url, so zz-media-serve (which just does GET chat:media:{query.id}, unchanged)
// and this store always agree on the same per-message key. Mirrors prep-image exactly
// (same stored shape {b64,mime,name}), tagged 'aud' so it can never collide with an image
// even in the same session.
const trig = $('chat').first().json;
const chatId = trig.sessionId || ('chat-' + Date.now());
const src = $input.first();
const bin = Object.values(src.binary || {})[0] || Object.values($('chat').first().binary || {})[0] || {};
const b64 = src.json.audio_b64 || null;
if (!b64) throw new Error('extract-audio-b64 produced no audio_b64');
const mime = bin.mimeType || 'audio/webm';
const name = bin.fileName || ('voice.' + (bin.fileExtension || 'webm'));
const bytes = Math.floor(b64.length * 3 / 4);
const execId = ($execution && $execution.id) ? $execution.id : (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
const mediaId = chatId + ':aud:' + execId;
return [{ json: {
  media_key: 'chat:media:' + mediaId,
  media_value: JSON.stringify({ b64: b64, mime: mime, name: name }),
  audio_mime: mime,
  audio_name: name,
  audio_bytes: bytes,
  media_url: 'https://automate-sorento.foundryx.my/webhook/zz-media-serve?id=' + encodeURIComponent(mediaId)
} }];