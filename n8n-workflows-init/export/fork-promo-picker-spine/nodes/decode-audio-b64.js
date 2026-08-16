// Console-attached voice note: the queue item is JSON-only (redis), so zz-chat carried the
// audio as base64 in `audio_b64`. Decode it back into a binary property so the SAME
// 'whisper-transcribe' node handles it — the console lane and the production
// fetch-from-Respond lane converge on one transcriber.
// n8n binary wants the base64 payload in `.data`, which is exactly what zz-chat forwarded.
const src = $('redis-pop-main-message-list').first().json.message;
const mime = src.audio_mime || 'audio/webm';
const name = src.audio_name || ('voice.' + (mime.split('/')[1] || 'webm'));
return [{
  json: {},
  binary: { data: { data: src.audio_b64, mimeType: mime, fileName: name } },
}];
