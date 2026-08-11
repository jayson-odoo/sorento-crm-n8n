// Chat-console mirror of the production chunker. Buttoned replies chunk too — the
// console must reproduce what WhatsApp will actually receive, or a post-promote
// console check would show the OLD single-message behaviour and read as "not fixed".
const j = $('When Executed by Another Workflow').first().json;
const chatId = (j.contact || {}).chat_id;
let message = j.message ? String(j.message).trim() : '';
const quickReply = j.quick_reply || '';
const ts = new Date().toISOString();

const LIMIT = quickReply ? 1000 : 1800;
const FLOOR = Math.floor(LIMIT * 0.45);
const parts = [];
let rest = message;
while (rest.length > LIMIT) {
  let at = rest.lastIndexOf('\n', LIMIT);
  if (at < FLOOR) at = rest.lastIndexOf(' ', LIMIT);
  if (at < FLOOR) at = LIMIT;
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
