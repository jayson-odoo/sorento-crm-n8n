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
 * (fork sub-sendmsg-QRCHUNK aQUmwMVplmNcyUVc @ 51fed3d1). before() is live @ c712e218, kept so the
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

// ── AFTER: deployed in sub-sendmsg-QRCHUNK @ 51fed3d1 ────────────────
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
  // Meta documents the interactive `body` cap as 1024 CHARACTERS, but its validators are
  // inconsistent about chars vs UTF-8 bytes across endpoints. Our replies are full of
  // multi-byte text (— • ⚠️ 🚩 😊), so a 1000-CHAR part can be ~1180 BYTES. Capping bytes as
  // well is strictly dominant: a no-op if the limit really is characters, and the difference
  // between working and a dead turn if it is bytes. Button path only — the plain path keeps
  // live's exact boundaries (review finding R1).
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

console.log('\n== 1b. byte budget + split quality (review R4/R5/R6) ==');
const blen = (x) => new TextEncoder().encode(x).length;
// A picker-shaped reply built from the multi-byte glyphs live actually emits.
const EMOJI = { message: Array.from({length: 40}, (_, i) =>
    `${i + 1}. SRTWT68${String(i).padStart(2, '0')} \u2014 has incoming\n\u26a0\ufe0f  *(PRODUCT DISCONTINUED)* \ud83d\udea9 \ud83d\ude0a`).join('\n'),
  quick_reply: F.quick_reply,
  result_set: Array.from({length: 40}, (_, i) => ({ idx: i + 1, code: `SRTWT68${i}` })),
  contact_identifer: 'x' };

t('AFTER: buttoned parts respect the 1024 cap in BYTES, not just characters', () => {
  const o = after(EMOJI);
  assert.ok(blen(EMOJI.message) > 1024, 'fixture must exceed the cap to be meaningful');
  for (const p of o)
    assert.ok(blen(p.json.message) <= 1024,
      `part ${p.json.part}: ${blen(p.json.message)} bytes > 1024 (chars=${p.json.message.length})`);
});
t('AFTER: a char-only cap would NOT have been enough (the bug R4 fixes is real)', () => {
  // Chars within budget yet bytes over it — the exact condition that still 400s.
  const probe = '\u2014'.repeat(900);
  assert.ok(probe.length <= 1000 && blen(probe) > 1024,
    'em-dash probe should be char-legal but byte-illegal');
  for (const p of after({ ...EMOJI, message: probe }))
    assert.ok(blen(p.json.message) <= 1024, 'byte cap must bind');
});
t('AFTER: no part ends on a lone surrogate half', () => {
  for (const p of after(EMOJI)) {
    const m = p.json.message;
    if (!m.length) continue;
    const last = m.charCodeAt(m.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff), `part ${p.json.part} ends mid-surrogate`);
    assert.ok(!/\ufffd/.test(m), `part ${p.json.part} contains a replacement char`);
  }
});
t('AFTER: parts carry no leading/trailing whitespace (kills the drop-trim mutant)', () => {
  for (const src of [buttoned, EMOJI]) {
    for (const p of after(src)) {
      assert.strictEqual(p.json.message, p.json.message.trim(),
        `part ${p.json.part} is not trimmed`);
    }
  }
});
t('AFTER: splits land on a newline whenever one exists in the window', () => {
  // Replaces a near-vacuous regex check: assert the CHOSEN boundary, not just its shape.
  const o = after(buttoned);
  for (let i = 0; i < o.length - 1; i++) {
    const tail = o[i].json.message.slice(-80);
    assert.ok(/\*Quantity On Hand:\* \d+$/.test(tail),
      `part ${i + 1} did not end on a record boundary: ...${tail}`);
  }
});

t('AFTER: hard-cut branch never splits a surrogate pair (no newline/space to fall back on)', () => {
  // Forces the `at = lim` hard cut: one unbroken run of astral glyphs, no newline, no space.
  // This is the ONLY branch where the surrogate guard is reachable.
  for (let n = 300; n <= 340; n++) {
    const src = { message: '\ud83d\udea9'.repeat(n), quick_reply: F.quick_reply, result_set: [], contact_identifer: 'x' };
    for (const p of after(src)) {
      const m = p.json.message;
      if (!m.length) continue;
      const last = m.charCodeAt(m.length - 1), first = m.charCodeAt(0);
      assert.ok(!(last >= 0xd800 && last <= 0xdbff), `n=${n} part ${p.json.part} ends on a high surrogate`);
      assert.ok(!(first >= 0xdc00 && first <= 0xdfff), `n=${n} part ${p.json.part} starts on a low surrogate`);
      assert.strictEqual(Buffer.from(m, 'utf8').toString('utf8'), m, `n=${n} part ${p.json.part} is not valid UTF-8`);
    }
  }
});
t('AFTER: FLOOR rejects an absurdly early newline on the button path', () => {
  // Only newline sits at index 20. With FLOOR 450 it must be REJECTED and the split fall
  // through to a space; with FLOOR 0 it would be taken, emitting a 20-char part.
  const src = { message: 'x'.repeat(20) + '\n' + 'y '.repeat(900), quick_reply: F.quick_reply,
                result_set: [], contact_identifer: 'x' };
  const o = after(src);
  assert.ok(o[0].json.message.length > 450,
    `part 1 is ${o[0].json.message.length} chars — FLOOR did not reject the early newline`);
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
