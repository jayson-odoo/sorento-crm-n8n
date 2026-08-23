// Chat-console mirror of the production chunker (live sub-sendmsg @ 91171ac3).
// The console must reproduce what WhatsApp will actually receive: buttoned replies
// chunk too, buttons on the LAST part. Before this, a console check of a long
// buttoned reply showed ONE bubble and read as "the fix did not work".
// Covered by tests/unit/sendmsg-quickreply-chunk.test.js.
const j = $('When Executed by Another Workflow').first().json;
const chatId = (j.contact || {}).chat_id;
let message = j.message ? String(j.message).trim() : '';
const quickReply = j.quick_reply || '';
const ts = new Date().toISOString();

const LIMIT = quickReply ? 1000 : 1800;
const FLOOR = quickReply ? 450 : 800;
// Meta documents the interactive body cap as 1024 CHARACTERS, but its validators are
// inconsistent about chars vs UTF-8 bytes and our replies are full of multi-byte text
// (— • ⚠️ 🚩 😊). Cap bytes too — a no-op if the limit really is characters.
const BYTE_CAP = quickReply ? 1000 : Infinity;
const blen = (s) => new TextEncoder().encode(s).length;

const parts = [];
let rest = message;
while (rest.length > LIMIT || blen(rest) > BYTE_CAP) {
  let lim = Math.min(LIMIT, rest.length);
  while (lim > 1 && blen(rest.slice(0, lim)) > BYTE_CAP) lim = Math.floor(lim * 0.9);
  let at = rest.lastIndexOf('\n', lim);
  if (at < FLOOR) at = rest.lastIndexOf(' ', lim);
  if (at < FLOOR) at = lim;
  // never slice between the halves of a surrogate pair
  if (at > 0 && at < rest.length) {
    const c = rest.charCodeAt(at - 1);
    if (c >= 0xd800 && c <= 0xdbff) at -= 1;
  }
  parts.push(rest.slice(0, at).trim());
  rest = rest.slice(at).trim();
}
parts.push(rest);

const out = parts.map((p, i) => {
  const isLast = i === parts.length - 1;
  const buttoned = isLast && !!quickReply;
  return { json: {
    chat_id: chatId,
    type: buttoned ? 'quick_reply' : 'text',
    text: p,
    quick_reply: buttoned ? quickReply : '',
    part: i + 1,
    total_parts: parts.length,
    ts,
  } };
});
if (out.length === 0) out.push({ json: { chat_id: chatId, type: 'text', text: '', quick_reply: '', part: 1, total_parts: 1, ts } });
return out;
