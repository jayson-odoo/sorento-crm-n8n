// Splits one bot turn into N WhatsApp messages. Buttons ride the LAST part.
// Unit-tested offline: tests/unit/sendmsg-quickreply-chunk.test.js (23 cases, 11 mutants).
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
// Meta documents the cap as 1024 CHARACTERS, but its validators are inconsistent about
// chars vs UTF-8 bytes across endpoints. Our replies are full of multi-byte text
// (— • ⚠️ 🚩 😊), so a 1000-CHAR part can be ~1180 BYTES. Capping bytes too is strictly
// dominant: a no-op if the limit really is characters, and the difference between working
// and a dead turn if it is bytes. Button path only — the plain path keeps live's boundaries.
const BYTE_CAP = quickReply ? 1000 : Infinity;
const blen = (s) => new TextEncoder().encode(s).length;

const parts = [];
let rest = text;
while (rest.length > LIMIT || blen(rest) > BYTE_CAP) {
  // Shrink the char window until its prefix also fits the byte budget.
  let lim = Math.min(LIMIT, rest.length);
  while (lim > 1 && blen(rest.slice(0, lim)) > BYTE_CAP) lim = Math.floor(lim * 0.9);
  let at = rest.lastIndexOf('\n', lim);
  if (at < FLOOR) at = rest.lastIndexOf(' ', lim);
  if (at < FLOOR) at = lim;
  // Never slice between the halves of a surrogate pair — that emits a lone surrogate and
  // renders as a replacement char. Only reachable on the hard-cut branch.
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
      // At most ONE part ever holds the whole set: the buttoned part if there is one,
      // else part 1 under the no-numbering fallback. No duplication beyond that.
      result: buttoned ? resultSet
            : subset?.length ? subset
            : (!anyNumbered && !quickReply && i === 0 ? resultSet : []),
    },
  };
});
