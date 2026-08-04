// STT (DC-5): fold the Whisper transcript back into the QUEUE ITEM, upstream of
// 'tf-message'. Every downstream node resolves the turn text via $('tf-message') BY NODE
// NAME, so a transcript injected further down is invisible to them — patching here makes a
// voice turn indistinguishable from a typed one, with zero downstream edits.
//
// Shape (grounded, exec 9240705):
//   redis-pop .json.message                 = the queue item (A)
//   A.message                               = B  <- tf-message returns THIS
//   B.message.message                       = E  { text, type, attachment }
const src = $('redis-pop-main-message-list').first().json;
const item = JSON.parse(JSON.stringify(src));

const transcript = String(($json && $json.text) || '');

const E = item.message.message.message.message;
E.attachment = E.attachment || {};
// Keep the original url for sorento's media lookback / debugging, then neutralise the local
// type so the EXISTING downstream 'if-message-is-audio' gate takes its normal FALSE branch
// (its TRUE output is dead-empty). Sorento fetches the audio from Respond itself, so nothing
// is lost by flipping the type here.
E.attachment.source_url = E.attachment.url || null;
E.attachment.type = 'text';
E.text = transcript;
E.type = 'text';

item.message._transcribed = true;
item.message._transcript = transcript;

return [{ json: item }];