// MEDIA INTAKE (was: STT/DC-5 Whisper patch): fold the CRM-extracted text back into the QUEUE
// ITEM, upstream of 'tf-message'. Every downstream node resolves the turn text via
// $('tf-message') BY NODE NAME, so text injected further down is invisible to them — patching
// here makes a voice or image turn indistinguishable from a typed one, with zero downstream
// edits. Node NAME is kept ('patch-transcript') because send-transcript-confirm reads it.
//
// Input ($json) = media-route output with action === 'continue':
//   rendered_text      what the CRM says the customer "typed" (transcript / caption + codes)
//   confirmation_text  CRM confirmation (+ appended notices) sent BEFORE the answer, or null
//
// Shape (grounded, exec 9240705):
//   redis-pop .json.message                 = the queue item (A)
//   A.message                               = B  <- tf-message returns THIS
//   B.message.message                       = E  { text, type, attachment }
const route = $input.first().json || {};
const src = $('redis-pop-main-message-list').first().json;
const item = JSON.parse(JSON.stringify(src));

const text = String(route.rendered_text || '');

const E = item.message.message.message.message;
E.attachment = E.attachment || {};
// Keep the original url for sorento's media lookback / debugging, then neutralise the local
// type so the EXISTING downstream 'if-message-is-audio' gate takes its normal FALSE branch
// (its TRUE output is dead-empty). Sorento fetched the media from Respond itself (the CRM
// worker downloaded it), so nothing is lost by flipping the type here.
E.attachment.source_url = E.attachment.url || null;
E.attachment.source_type = E.attachment.type || null;
E.attachment.type = 'text';
E.text = text;
E.type = 'text';

item.message._transcribed = true;          // legacy flag (voice) — kept for any reader
item.message._transcript = text;           // legacy field — send-transcript-confirm reads it
item.message._media = {
  modality: route.modality || null,
  confirmation_text: route.confirmation_text || null,
  rendered_text: text,
  job_id: route.job_id || null,
  trace: route._media_trace || null,
};

return [{ json: item }];
