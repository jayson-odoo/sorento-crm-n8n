// Read the trigger explicitly: on the attachment lane this node is fed by
// 'extract-audio-b64', whose output json no longer carries chatInput/sessionId.
const trig = $('chat').first().json;
let raw = trig.chatInput || '';
const chatId = trig.sessionId || ('chat-' + Date.now());
const contactId = '437264483';
const runId = 'chatui-' + Date.now();

// ── VOICE INPUT (DC-5 / STT) ──────────────────────────────────────────────
// Three ways to drive a voice turn, because redis is NOT reachable from outside the
// n8n host and the queue item is JSON-only (binary cannot ride it):
//   (1) ATTACH/RECORD audio → 'extract-audio-b64' (Extract from File) turns the binary into
//       a base64 STRING for the queue; the spine decodes it and runs the REAL Whisper node.
//       NB: do NOT read $input.first().binary[k].data here — under n8n's non-memory binary
//       storage mode that field is a marker like "database", not the payload.
//   (2) /voiceurl <url>  → spine downloads the url, real Whisper. (production path)
//   (3) /voice <text>    → mock lane: skips fetch+Whisper entirely. 0 cost, deterministic.
// Anything else is an ordinary text turn (unchanged).
let text = raw;
let attachment = { type: 'text', description: '' };
let mock_transcript = null;
let audio_b64 = null;
let audio_mime = null;
let audio_name = null;

// ── VOICE ACCESS TOGGLE (test harness only) ─────────────────────────────────
// In production `is_allowed_voice` is a REAL respond.io custom field on the contact and the
// spine's if-voice-allowed gate reads it (fail-closed: absent/false => voice refused).
// The console fabricates its contact, so it defaults the field to true and lets you flip it
// with a `/novoice` prefix to exercise the refusal path.
let allowVoice = 'true';
const mNoVoice = raw.match(/^\/novoice\s*([\s\S]*)$/i);
if (mNoVoice) { allowVoice = 'false'; raw = mNoVoice[1].trim(); text = raw; }

const fromExtract = (() => {
  try { return $('extract-audio-b64').isExecuted ? $('extract-audio-b64').first() : null; }
  catch (e) { return null; }
})();
if (fromExtract && fromExtract.json && fromExtract.json.audio_b64) {
  const meta = Object.values(fromExtract.binary || {})[0] || {};
  audio_b64 = fromExtract.json.audio_b64;
  audio_mime = meta.mimeType || 'audio/webm';
  audio_name = meta.fileName || ('voice.' + (meta.fileExtension || 'webm'));
  text = '';
  attachment = { type: 'audio', url: null, description: '' };
}

if (!audio_b64) {
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
  message: { message: { message: { text: text, type: attachment.type === 'audio' ? 'audio' : 'text', attachment: attachment } }, replyTo: {} },
  contact: { id: contactId, chat_id: chatId, phone: '60100000000', firstName: 'Jayson', lastName: 'Chat', custom_fields: [ { name: 'is_human_intervened', value: 'false' }, { name: 'is_allowed_stock', value: 'true' }, { name: 'is_allowed_voice', value: allowVoice } ], assignee: { id: null } },
  messageId: runId, replyTo: null, test_run_id: runId, scope: 'chat-ui', mode: 'chat-stateful'
};
if (mock_transcript !== null) item.mock_transcript = mock_transcript;
if (audio_b64) { item.audio_b64 = audio_b64; item.audio_mime = audio_mime; item.audio_name = audio_name; }

return [{ json: { chat_id: chatId, contact_id: contactId, test_run_id: runId, item } }];
