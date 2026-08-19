// CLONE-ONLY adapter for the zz-chat console voice lane (audio_b64 → decode → whisper). The
// console queue item is JSON-only, so it cannot give the CRM media endpoint a fetchable URL;
// the legacy Whisper transcriber stays for the console and its output is re-shaped into the
// media-route item contract so ONE 'patch-transcript' serves both. Not promoted to live.
const text = String(($json && $json.text) || '').trim();
return [{ json: {
  action: text ? 'continue' : 'reply',
  modality: 'voice',
  rendered_text: text || null,
  confirmation_text: text ? ('Here is what I heard: "' + text + '"') : null,
  reply_text: text ? null : 'I could not make out that voice note. Please send it again or type your message and I will help straight away.',
  poll_wait_s: 0, poll_n: 0, job_id: null,
  _media_trace: { source: 'console-whisper', decision: 'accepted', status: 'completed' },
} }];
