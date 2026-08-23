// Splits one bot turn into N WhatsApp messages. Buttons ride the LAST part.
// Mirrors live sub-sendmsg @ 91171ac3.
// Unit-tested offline: tests/unit/sendmsg-quickreply-chunk.test.js (23 cases, 19 mutants).
const src = $('When Executed by Another Workflow').first().json;
let text = src.message;
if (text) { text = String(text).trim(); }
const resultSet = src.result_set;
const quickReply = src.quick_reply || '';
const contactId = src.contact_identifer;
if (!text) return [{ json: { message: '' } }];

const LIMIT = quickReply ? 1000 : 1800;
const FLOOR = quickReply ? 450 : 800;
const BYTE_CAP = quickReply ? 1000 : Infinity;
const blen = (s) => new TextEncoder().encode(s).length;

const parts = [];
let rest = text;
while (rest.length > LIMIT || blen(rest) > BYTE_CAP) {
  let lim = Math.min(LIMIT, rest.length);
  while (lim > 1 && blen(rest.slice(0, lim)) > BYTE_CAP) lim = Math.floor(lim * 0.9);
  let at = rest.lastIndexOf('\n', lim);
  if (at < FLOOR) at = rest.lastIndexOf(' ', lim);
  if (at < FLOOR) at = lim;
  if (at > 0 && at < rest.length) {
    const c = rest.charCodeAt(at - 1);
    if (c >= 0xd800 && c <= 0xdbff) at -= 1;
  }
  parts.push(rest.slice(0, at).trim());
  rest = rest.slice(at).trim();
}
parts.push(rest);

const idxIn = (part) =>
  [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)].map((m) => Number(m[1]));

const anyNumbered = parts.some((p) => idxIn(p).length > 0);

return parts.map((p, i) => {
  const ids = new Set(idxIn(p));
  const subset = resultSet?.filter((r) => ids.has(r.idx));
  const isLast = i === parts.length - 1;
  const buttoned = isLast && !!quickReply;
  return {
    json: {
      message: p,
      part: i + 1,
      total_parts: parts.length,
      quick_reply: buttoned ? quickReply : '',
      contact_identifer: contactId,
      result: buttoned ? resultSet
            : subset?.length ? subset
            : (!anyNumbered && !quickReply && i === 0 ? resultSet : []),
    },
  };
});
