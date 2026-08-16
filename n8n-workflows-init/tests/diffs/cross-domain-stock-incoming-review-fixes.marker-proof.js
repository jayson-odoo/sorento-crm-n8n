// Local proof for review F1. Reproduces ONLY the marker/insert logic of crossdomain-compose,
// OLD (case-sensitive, raw index) vs NEW (case-insensitive, sentence/line-start snap), against the
// verbatim message shapes emitted by LIVE build-suggest-offer (a40cd16d) and not-found-error-message.
const BLOCK = 'But there is INCOMING stock (ETA) for the requested products:\n\n- *Product Code:* B\n*Container:* FFAU3176932\n*Estimated Arrival Date:* 22/07/2026\n*Incoming Quantity:* 200';

function oldInsert(ur) {
  const MARKERS = ['Related products:', 'Try:', 'Did you mean', 'Would you like me to escalate'];
  let idx = -1;
  for (const mk of MARKERS) {
    const i = ur.indexOf(mk);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return { how: 'END-fallback', text: `${ur}\n${BLOCK}` };
  return { how: 'anchored@' + idx, text: ur.slice(0, idx).replace(/\s+$/, '') + `\n${BLOCK}\n\n` + ur.slice(idx) };
}

function newInsert(ur) {
  const MARKERS = [
    'Related products:',
    'Try:',
    'Did you mean',
    'Here are the closest matches:',
    'Would you like me to escalate',
  ];
  const hay = ur.toLowerCase();
  let idx = -1, won = null;
  for (const mk of MARKERS) {
    const i = hay.indexOf(mk.toLowerCase());
    if (i !== -1 && (idx === -1 || i < idx)) { idx = i; won = mk; }
  }
  if (idx === -1) return { how: 'END-fallback', marker: null, text: `${ur}\n${BLOCK}` };
  const nl  = ur.lastIndexOf('\n', idx);
  const dot = ur.lastIndexOf('. ', idx);
  const at  = Math.max(nl === -1 ? 0 : nl + 1, dot === -1 ? 0 : dot + 2);
  const head = ur.slice(0, at).replace(/\s+$/, '');
  return { how: `anchored@${idx}${at === idx ? '' : ' snap->' + at}`, marker: won,
           text: (head ? `${head}\n` : '') + `${BLOCK}\n\n` + ur.slice(at) };
}

const team = 'warehouse';
const CASES = [
  ['D3 sibling picker (bso L88)',
   `No incoming stock (ETA) found for SRTWT5800. Related products:\n1. SRTWT5800 — no incoming\n2. SRTWT5800-FH — no incoming\nReply with a number to check its incoming, or reply 'yes' to escalate to ${team} team.`],
  ['D1 multi-token (bso L219+L225)',
   `Couldn't find some items:\n\n"srt99xx" — did you mean:\n  1. SRTWT5800\n  2. SRTWT5800-FH\n"abc12" — did you mean:\n  3. ABC120\n\nReply a number to pick, or 'yes' to escalate to ${team}.`],
  ['D1 numbered / closest matches (bso L252)',
   `Couldn't pin down "promo x". Here are the closest matches:\n1. Mid-year rebate\n2. Q3 bundle\nReply with a number to continue, or would you like me to escalate to ${team} team?`],
  ['D1 single-token code mode (bso L272)',
   `Couldn't find "srtwt58". Did you mean SRTWT5800 or SRTWT5800-FH? Reply with a code to continue, or would you like me to escalate to ${team} team?`],
  ['D2 Try: mode (bso L348)',
   `No stock for SRTWT5800. Try: SRTWT5801, SRTWT5802. Reply with a code to continue, or would you like me to escalate to ${team} team?`],
  ['D2 date arm (bso L345)',
   `Here's what you want:\n• customer: ACME\n\nNo delivery on 2026-07-01. ACME has delivery on 2026-07-04; 2026-07-11. Reply with a date to continue, or would you like me to escalate to ${team} team?`],
  ['D2 numbered / closest matches (bso L393)',
   `No incoming stock (ETA) for SRTWT5800. Here are the closest matches:\n1. SRTWT5801\n2. SRTWT5802\nReply with a number to continue, or would you like me to escalate to ${team} team?`],
  ['not-found plain (nf L234)',
   `Could not find active inventory for srtwt5800 (2026-07-01 to 2026-07-31). Would you like me to escalate to ${team} team?`],
  ['not-found breakdown (nf L155)',
   `Here's what you want:\n• product: SRTWT5800\n\nCouldn't find: "zzz".\n\nBut no active inventory matched these. Would you like me to escalate to ${team} team?`],
  ['_merge suggest+member (ccs L50)',
   `No incoming stock (ETA) found for SRTWT5800. Related products:\n1. SRTWT5800 — no incoming\nReply with a number to check its incoming, or reply 'yes' to escalate to ${team} team.\n\nTo escalate, choose who to route to — reply the number or name:\n1. Aisyah\n2. Tan\n\nOr just reply 'yes' and we'll assign automatically.`],
  ['clarify arm, no marker (nf L176/187)',
   `I captured "blue thing" but couldn't tell which part is which. For a inventory enquiry, please give me a labeled specific — e.g. product code.`],
];

let changed = 0, same = 0;
for (const [name, ur] of CASES) {
  const a = oldInsert(ur), b = newInsert(ur);
  const eq = a.text === b.text;
  if (eq) same++; else changed++;
  console.log('='.repeat(100));
  console.log(`CASE: ${name}`);
  console.log(`  OLD: ${a.how}`);
  console.log(`  NEW: ${b.how}  marker=${JSON.stringify(b.marker)}`);
  console.log(`  IDENTICAL TO OLD: ${eq}`);
  // ordering assertions
  const t = b.text;
  const iBlock = t.indexOf('But there is INCOMING');
  const iEsc = t.toLowerCase().indexOf('would you like me to escalate');
  const iEscAlt = t.toLowerCase().indexOf("to escalate to");
  const numMatch = t.match(/^\s*\d+\. /m);
  const iNum = numMatch ? t.indexOf(numMatch[0]) : -1;
  console.log(`  block@${iBlock}  firstNumberedLine@${iNum}  escalatePhrase@${iEsc >= 0 ? iEsc : iEscAlt}`);
  console.log(`  ASSERT block above numbered list: ${iNum === -1 ? 'n/a' : iBlock < iNum}`);
  console.log(`  ASSERT block above escalate invite: ${iBlock < (iEsc >= 0 ? iEsc : iEscAlt)}`);
  if (!eq) {
    console.log('  ---- NEW TEXT ----');
    console.log(t.split('\n').map(l => '  | ' + l).join('\n'));
    console.log('  ---- OLD TEXT ----');
    console.log(a.text.split('\n').map(l => '  ! ' + l).join('\n'));
  }
}
console.log('='.repeat(100));
console.log(`unchanged arms: ${same}   changed arms: ${changed}`);
