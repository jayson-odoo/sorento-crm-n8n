#!/usr/bin/env node
/* quick-reply chunking test — sub-sendmsg `Code in JavaScript`.
 *
 * DEFECT: the buttoned send path did not chunk. WhatsApp caps an interactive message's `body`
 * at 1024 chars; respond.io rejects a longer one with "min body is 1, max body is 1024,
 * parameter value is not valid". The HTTP Request node has no onError/retry, so the 400 killed
 * the execution and the customer received NOTHING — not even the plain text.
 *
 * FIX: route buttoned replies through the same chunker, buttons on the LAST part.
 *
 * Keep after() below byte-identical to the deployed `Code in JavaScript` body
 * (fork sub-sendmsg-QRCHUNK aQUmwMVplmNcyUVc). before() is live @ c712e218, kept so the
 * regression cases can assert AFTER == BEFORE on the untouched plain path.
 *
 * Run: node n8n-workflows-init/tests/unit/sendmsg-quickreply-chunk.test.js
 */

const assert = require('assert');

// ── FIXTURE: the real failing turn (1191 chars, cap is 1024) ──────────
// Reconstructed from the real failing turn (SRTWT6813, purchasing/incoming miss).
const LOCS = [
  ['BUKIT RAJA','BRW',29], ['BUKIT RAJA','BRW-NTC',6], ['BUKIT RAJA','BRW-SMC',1],
  ['BUKIT RAJA','BRW-RSV',0], ['MERU','MWH-IB',0], ['MERU','MWH-IR',0],
  ['BUKIT RAJA','BRW-IR',0], ['BUKIT RAJA','BRW-BB',0], ['MERU','MWH-BB',0],
  ['BUKIT RAJA','BRW-IB',0],
];
const rows = LOCS.map(([wh, loc, qty]) =>
  `- *Product Code:* SRTWT6813\n*Warehouse:* ${wh}\n*System Location:* ${loc}\n*Quantity On Hand:* ${qty}`
);
const message = [
  'No incoming stock (ETA) for SRTWT6813.',
  'But here are the stock details for the requested products:',
  '',
  rows.join('\n\n'),
  '',
  'Try: SRTWT6801. Reply with a code to continue, or would you like me to escalate to purchasing team?',
].join('\n');

const quick_reply = "SRTWT6801,Yes escalate,No it's okay";
const result_set = LOCS.map(([wh, loc, qty], i) => ({
  idx: i + 1, code: 'SRTWT6813', warehouse: wh, location: loc, qty,
}));

const F = { message, quick_reply, result_set };

// ── BEFORE: live c712e218 ──────────────────────────────────
function before(src) {
  const LIMIT = 1800;
  let text = src.message;
  if (text) { text = String(text).trim(); }
  let resultSet = src.result_set;
  if (!text) return [{ json: { message: '' } }];

  const parts = [];
  let rest = text;
  while (rest.length > LIMIT) {
    let at = rest.lastIndexOf('\n', LIMIT);
    if (at < 800) at = rest.lastIndexOf(' ', LIMIT);
    if (at < 800) at = LIMIT;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  parts.push(rest);

  const idxIn = (part) =>
    [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)].map((m) => Number(m[1]));

  return parts.map((p, i) => {
    const ids = new Set(idxIn(p));
    const subset = resultSet?.filter((r) => ids.has(r.idx));
    return {
      json: {
        message: p,
        part: i + 1,
        total_parts: parts.length,
        result: subset?.length ? subset : (i === 0 && parts.length === 1 ? resultSet : []),
      },
    };
  });
}

// ── AFTER: deployed in sub-sendmsg-QRCHUNK @ 89817982 ─────────────
function after(src) {
  let text = src.message;
  if (text) { text = String(text).trim(); }
  const resultSet = src.result_set;
  const quickReply = src.quick_reply || '';
  const contactId = src.contact_identifer;
  if (!text) return [{ json: { message: '' } }];

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
}


const WA_BODY_CAP = 1024;
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
};
const whole = (r) => JSON.stringify(r) === JSON.stringify(F.result_set);

const buttoned = { message: F.message, quick_reply: F.quick_reply, result_set: F.result_set, contact_identifer: '437264483' };
const plain    = { message: F.message, quick_reply: '',            result_set: F.result_set, contact_identifer: '437264483' };

console.log('\n== 0. reproduce the live defect ==');
t('BEFORE: buttoned turn emits 1 part whose body exceeds the WhatsApp 1024 cap', () => {
  const o = before(buttoned);
  assert.strictEqual(o.length, 1, 'expected live to NOT chunk');
  assert.ok(o[0].json.message.length > WA_BODY_CAP,
    `body ${o[0].json.message.length} should exceed ${WA_BODY_CAP}`);
});

console.log('\n== 1. the fix ==');
t('AFTER: every buttoned part body is within the 1024 cap', () => {
  for (const p of after(buttoned))
    assert.ok(p.json.message.length <= WA_BODY_CAP,
      `part ${p.json.part} body ${p.json.message.length} > ${WA_BODY_CAP}`);
});
t('AFTER: buttons ride the LAST part only', () => {
  const o = after(buttoned);
  assert.ok(o.length > 1, 'fixture should split');
  o.forEach((p, i) => {
    const want = i === o.length - 1 ? F.quick_reply : '';
    assert.strictEqual(p.json.quick_reply, want, `part ${p.json.part}`);
  });
});
t('AFTER: no text is lost or duplicated across parts', () => {
  const o = after(buttoned);
  const rejoined = o.map(p => p.json.message).join('\n');
  const norm = s => s.replace(/\s+/g, ' ').trim();
  assert.strictEqual(norm(rejoined), norm(F.message));
});
t('AFTER: parts are ordered and totals stamped', () => {
  const o = after(buttoned);
  o.forEach((p, i) => {
    assert.strictEqual(p.json.part, i + 1);
    assert.strictEqual(p.json.total_parts, o.length);
  });
});
t('AFTER: contact_identifer carried on every part (HTTP Request reads $json)', () => {
  for (const p of after(buttoned))
    assert.strictEqual(p.json.contact_identifer, '437264483');
});

console.log('\n== 2. reply-to / result-set integrity ==');
t('AFTER: buttoned part carries the WHOLE result_set (quote-of-tap resolves all rows)', () => {
  const o = after(buttoned);
  assert.ok(whole(o[o.length - 1].json.result), 'last part must hold the whole set');
});
t('AFTER: whole set is held by exactly ONE part (no duplication)', () => {
  const n = after(buttoned).filter(p => whole(p.json.result)).length;
  assert.strictEqual(n, 1, `expected 1 part with whole set, got ${n}`);
});
t('BEFORE: multi-part UNNUMBERED plain reply loses the set entirely (pre-existing bug)', () => {
  const long = { ...plain, message: F.message.repeat(2) };
  const o = before(long);
  assert.ok(o.length > 1, 'should split');
  assert.ok(o.every(p => p.json.result.length === 0), 'live drops the set on every part');
});
t('AFTER: same case keeps the set reachable on part 1', () => {
  const long = { ...plain, message: F.message.repeat(2) };
  const o = after(long);
  assert.ok(o.length > 1, 'should split');
  assert.ok(whole(o[0].json.result), 'part 1 must hold the whole set');
  assert.strictEqual(o.filter(p => whole(p.json.result)).length, 1);
});

console.log('\n== 3. no regression on existing behaviour ==');
t('AFTER == BEFORE for a short plain message (single part, unnumbered)', () => {
  const s = { ...plain, message: 'Stock for SRTWT6813 is 29 at BUKIT RAJA.' };
  const b = before(s)[0].json, a = after(s)[0].json;
  assert.strictEqual(a.message, b.message);
  assert.strictEqual(a.total_parts, b.total_parts);
  assert.deepStrictEqual(a.result, b.result);
});
t('AFTER == BEFORE for numbered per-part subsetting on a long plain message', () => {
  const numbered = Array.from({ length: 40 }, (_, i) =>
    `${i + 1}. SRTWT68${String(i).padStart(2, '0')} — ${'detail '.repeat(12)}`).join('\n');
  const rs = Array.from({ length: 40 }, (_, i) => ({ idx: i + 1, code: `SRTWT68${i}` }));
  const s = { message: numbered, quick_reply: '', result_set: rs, contact_identifer: 'x' };
  const b = before(s), a = after(s);
  assert.ok(b.length > 1, 'should split');
  assert.strictEqual(a.length, b.length);
  a.forEach((p, i) => assert.deepStrictEqual(p.json.result, b[i].json.result, `part ${i + 1}`));
});
t('AFTER: plain-path split boundaries are byte-identical to live (FLOOR regression)', () => {
  // Regression guard: a proportional FLOOR (floor(1800*0.45)=810) silently changed the PLAIN
  // path for any message whose only newline before LIMIT lands in [800,810).
  for (let nl = 780; nl <= 830; nl++) {
    const s = { message: 'a'.repeat(nl) + '\n' + 'b'.repeat(2000), quick_reply: '', result_set: [], contact_identifer: 'x' };
    const b = before(s).map(p => p.json.message);
    const a = after(s).map(p => p.json.message);
    assert.deepStrictEqual(a, b, `newline@${nl}: plain path diverged from live`);
  }
});
t('AFTER: plain path still uses LIMIT 1800 (unchanged chunk count)', () => {
  const s = { ...plain, message: F.message.repeat(3) };
  assert.strictEqual(after(s).length, before(s).length);
});
t('AFTER: empty message short-circuits like live', () => {
  assert.deepStrictEqual(after({ ...buttoned, message: '' }), [{ json: { message: '' } }]);
});
t('AFTER: no part hard-cuts mid-line when buttoned (proportional floor)', () => {
  for (const p of after(buttoned))
    assert.ok(!/\*[A-Za-z ]*$/.test(p.json.message), `part ${p.json.part} ends mid-field`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
