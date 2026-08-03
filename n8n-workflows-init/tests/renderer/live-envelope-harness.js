// Runs the DEPLOYED output-structurer against REAL render envelopes captured from the live
// CRM MCP server — the end-to-end counterpart to alloc-badge-harness.js, which uses
// hand-built envelopes. Together: that one proves the renderer's logic, this one proves the
// CRM presenter actually produces the shape that logic expects.
//
//   node live-envelope-harness.js
//
// deployed-structurer.js is the live node code pulled via REST (verified byte-identical to
// workflow Fss5aAaXthJSWpZCgKiKR @ versionId 47053482 on 2026-08-02).
// live-envelopes-20260802.json is captured from localhost:8765 against the live backend + DB.
const fs = require('fs');

const body = fs.readFileSync(`${__dirname}/deployed-structurer.js`, 'utf8');
const fixture = JSON.parse(fs.readFileSync(`${__dirname}/live-envelopes-20260802.json`, 'utf8'));

// Two feed shapes, because the real MCP Client node's output nesting is not pinned anywhere:
// the envelope bare, and wrapped in the MCP content array the structurer's findPayload unwraps.
const FEEDS = {
  bare: (env) => env,
  mcpContent: (env) => ({ content: [{ type: 'text', text: JSON.stringify(env) }] }),
};

function render(envelope, code = body, feed = FEEDS.bare) {
  const $ = (name) => ({
    first: () => ({ json: name === 'MCP Client1' ? feed(envelope) : { semantic_input: {} } }),
  });
  return new Function('$', code)($)[0].json.response;
}

// One rendered item block per envelope item: "1. *Field:* value\n🚩 *(...)*"
const blocks = (resp) => resp.split(/\n(?=\d+\. )/).slice(1);
const badges = (s) => (s.match(/ALLOCATION\)\*/g) || []).length;
const byName = (n) => fixture.envelopes.find((e) => e.name.startsWith(n)).envelope;

const CASES = [
  ['L1 list — partial item: PARTIAL badge + the number, no PENDING', 'L1', (resp) => {
    const b = blocks(resp).find((x) => /Unallocated Quantity:\* 67/.test(x));
    return b && /🚩  \*\(PARTIAL ALLOCATION\)\*/.test(b) && !/PENDING/.test(b);
  }],
  ['L1 list — pending item: PENDING badge, no quantity line, no PARTIAL', 'L1', (resp) => {
    const b = blocks(resp).find((x) => /🚩  \*\(PENDING ALLOCATION\)\*/.test(x));
    return b && !/Unallocated Quantity/.test(b) && !/PARTIAL/.test(b);
  }],
  ['L1 list — exactly two items, exactly two badges (no bleed between items)', 'L1',
    (resp) => blocks(resp).length === 2 && badges(resp) === 2],
  ['L1 list — the allocated warehouse still renders alongside the badge', 'L1',
    (resp) => /Warehouse Allocations:\* BRW \(2\)/.test(resp)],
  ['L2 by-product — same two badges on the product-rooted shape', 'L2', (resp) =>
    /🚩  \*\(PARTIAL ALLOCATION\)\*/.test(resp) && /🚩  \*\(PENDING ALLOCATION\)\*/.test(resp)
    && badges(resp) === 2],
  ['L3 shipments — shipment-level rows never badge', 'L3',
    (resp) => badges(resp) === 0 && /Total Incoming Quantity/.test(resp)],
  ['L4 fully allocated — no badge, no Unallocated Quantity line', 'L4',
    (resp) => badges(resp) === 0 && !/Unallocated Quantity/.test(resp)],
  ['L1 renders identically when the envelope arrives MCP-content-wrapped', 'L1', (resp, env) =>
    render(env, body, FEEDS.mcpContent) === resp],
];

let fail = 0;
for (const [name, key, assertFn] of CASES) {
  const env = byName(key);
  const resp = render(env);
  const ok = !!assertFn(resp, env);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log('----\n' + resp + '\n----');
}

// Negative control: with the badge lines stripped from the DEPLOYED code, the L1 assertions
// that look for a badge must fail. A green run without this proves nothing.
const stripped = body.split('\n').filter((l) => !l.includes('ALLOCATION)*')).join('\n');
const negResp = render(byName('L1'), stripped);
const negOk = badges(negResp) === 0 && /Unallocated Quantity:\* 67/.test(negResp);
console.log(`${negOk ? 'PASS' : 'FAIL'}  NEG-CONTROL: badges vanish when the badge code is removed, fields survive`);
if (!negOk) fail++;

console.log('\n--- rendered L1, verbatim ---\n' + render(byName('L1')));
console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
