// Read the trigger explicitly: on the attachment lane this node is fed by
// 'store-audio' or 'store-image' (via prep-audio/prep-image), whose output json no longer
// carries chatInput/sessionId.
const trig = $('chat').first().json;
let raw = trig.chatInput || '';
const chatId = trig.sessionId || ('chat-' + Date.now());
const contactId = '437264483';
const runId = 'chatui-' + Date.now();

// -- VOICE INPUT --------------------------------------------------------------
// Three ways to drive a voice turn, because redis is NOT reachable from outside the
// n8n host and the queue item is JSON-only (binary cannot ride it):
//   (1) ATTACH/RECORD audio -> 'extract-audio-b64' -> 'prep-audio' -> 'store-audio' stage the
//       bytes to redis chat:media:{chat_id} and hand the CRM worker a fetchable zz-media-serve
//       url, exactly like the image lane -> REAL CRM /media/process call (production path).
//   (2) /voiceurl <url>  -> spine downloads the url, REAL CRM call. (production path)
//   (3) /voice <text>    -> mock lane: skips fetch+CRM entirely. 0 cost, deterministic.
// Anything else is an ordinary text turn (unchanged).
let text = raw;
let attachment = { type: 'text', description: '' };
let mock_transcript = null;

// -- VOICE ACCESS TOGGLE (test harness only) ----------------------------------
// In production `is_allowed_voice` is a REAL respond.io custom field on the contact and the
// spine's if-voice-allowed gate reads it (fail-closed: absent/false => voice refused).
// The console fabricates its contact, so it defaults the field to true and lets you flip it
// with a `/novoice` prefix to exercise the refusal path.
let allowVoice = 'true';
const mNoVoice = raw.match(/^\/novoice\s*([\s\S]*)$/i);
if (mNoVoice) { allowVoice = 'false'; raw = mNoVoice[1].trim(); text = raw; }

// -- AUDIO INPUT (record/attach; mirrors the image lane) -----------------------
// prep-audio ran => the audio was stored to redis chat:media:{chat_id} and zz-media-serve
// (D8pyepOH1vJSJzjG) exposes it as a public URL. scope stays 'chat-ui' so media-egress-gate
// takes FALSE => REAL CRM /media/process call (prod contact_media_usage ledger write +
// provider spend, dev contact 437264483) -- mirrors the image lane, captain decision 2026-08-22.
const fromAudio = (() => {
  try { return $('prep-audio').isExecuted ? $('prep-audio').first() : null; }
  catch (e) { return null; }
})();
if (fromAudio && fromAudio.json && fromAudio.json.media_url) {
  const j = fromAudio.json;
  // text stays = raw -> rides as the caption (detect-media reads E.text)
  attachment = { type: 'audio', url: j.media_url, mimeType: j.audio_mime, fileName: j.audio_name, size: j.audio_bytes, description: '' };
}

// -- IMAGE INPUT (paste/attach; local console page or widget attach) ----------
// prep-image ran => the image was stored to redis chat:media:{chat_id} and zz-media-serve
// (D8pyepOH1vJSJzjG) exposes it as a public URL the CRM worker fetches. scope stays 'chat-ui'
// so media-egress-gate takes FALSE => REAL CRM /media/process call (prod contact_media_usage
// ledger write + provider spend, dev contact 437264483) -- user-approved 2026-08-22.
const fromImage = (() => {
  try { return $('prep-image').isExecuted ? $('prep-image').first() : null; }
  catch (e) { return null; }
})();
if (fromImage && fromImage.json && fromImage.json.media_url) {
  const j = fromImage.json;
  // text stays = raw -> rides as the caption (detect-media reads E.text)
  attachment = { type: 'image', url: j.media_url, mimeType: j.image_mime, fileName: j.image_name, size: j.image_bytes, description: '' };
}

// /voiceurl and /voice only apply on a plain text turn (no attachment already staged).
if (attachment.type === 'text') {
  const mVoice = raw.match(/^\/voice\s+([\s\S]+)$/i);
  const mUrl = raw.match(/^\/voiceurl\s+(\S+)$/i);
  if (mUrl) {
    text = '';
    attachment = { type: 'audio', url: mUrl[1], description: '' };
  } else if (mVoice) {
    text = '';
    attachment = { type: 'audio', url: null, description: '' };
    mock_transcript = mVoice[1].trim();
  }
}

const item = {
  message: { message: { message: { text: text, type: attachment.type === 'audio' ? 'audio' : attachment.type === 'image' ? 'image' : 'text', attachment: attachment } }, replyTo: {} },
  contact: { id: contactId, chat_id: chatId, phone: '60100000000', firstName: 'Jayson', lastName: 'Chat', custom_fields: [ { name: 'is_human_intervened', value: 'false' }, { name: 'is_allowed_stock', value: 'true' }, { name: 'is_allowed_voice', value: allowVoice } ], assignee: { id: null } },
  messageId: runId, replyTo: null, test_run_id: runId, scope: 'chat-ui', mode: 'chat-stateful'
};
if (mock_transcript !== null) item.mock_transcript = mock_transcript;

return [{ json: { chat_id: chatId, contact_id: contactId, test_run_id: runId, item } }];