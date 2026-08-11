// Splits one bot turn into N WhatsApp messages. Buttons ride the LAST part.
// Unit-tested offline: tests/unit/sendmsg-quickreply-chunk.test.js (16 cases, 7 mutants).
const src = $('When Executed by Another Workflow').first().json;
let text = src.message;
if (text) { text = String(text).trim(); }
const resultSet = src.result_set;
const quickReply = src.quick_reply || '';
const contactId = src.contact_identifer;
if (!text) return [{ json: { message: '' } }];

// WhatsApp caps an interactive message's `body` at 1024; respond.io rejects a longer
// one with "parameter value is not valid" and the 400 kills the whole turn.
const LIMIT = quickReply ? 1000 : 1800;
// 800 verbatim on the plain path so its split boundaries stay byte-identical to live;
// only the button path needs a smaller floor, since its LIMIT is 1000.
const FLOOR = quickReply ? 450 : 800;

const parts = [];
let rest = text;
while (rest.length > LIMIT) {
  let at = rest.lastIndexOf('\n', LIMIT);
  if (at < FLOOR) at = rest.lastIndexOf(' ', LIMIT);
  if (at < FLOOR) at = LIMIT;
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
      // At most ONE part ever holds the whole set: the buttoned part if there is one,
      // else part 1 under the no-numbering fallback. No duplication beyond that.
      result: buttoned ? resultSet
            : subset?.length ? subset
            : (!anyNumbered && !quickReply && i === 0 ? resultSet : []),
    },
  };
});
