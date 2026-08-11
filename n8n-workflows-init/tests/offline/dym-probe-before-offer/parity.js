// ── parity.js — the three SILENT-DIVERGENCE invariants ────────────────────────
//
// This change deliberately duplicates code. Each duplication is defensible (see the diff
// §K4/§M3), but the design produces pairs of nodes that LOOK independent, MUST stay
// identical, and had nothing detecting divergence. A divergence would not throw, would not
// change any single node's own behaviour, and would silently make the probe answer about a
// different candidate set than the one rendered.
//
//   P1  tokenCandidates()  in dym-transform  ==  build-suggest-offer   (probe-vs-render)
//   P2  dym-transform.js   ==  dym-transform-partial.js                (byte-identical)
//   P3  dym-annotate.js    ==  dym-annotate-partial.js                 (modulo 2 constants)
//
// 🔴 BODIES ARE SOURCED FROM THE EXPORT, not from the offline working copies, so this suite
// asserts what is PUBLISHED on the clone. If the export is stale the whole suite is
// meaningless, so it fails loudly rather than silently comparing yesterday's bytes.
// Run `python3 n8n-workflows-init/scripts/export-workflows.py --verify` first.
//
// Every invariant carries its own NEGATIVE CONTROL proving the comparison is not blind.
//
// ⚠️ THIS SUITE IS DELIBERATELY *NOT* A `mutate.sh` TARGET — do not "fix" that omission.
// `mutate.sh` works by editing a node body on disk and asserting a suite reacts. This suite
// reads the EXPORT, which is the very artifact it exists to police: driving it through
// mutate.sh would mutate the thing under audit rather than test the audit. Its negative
// controls are INTERNAL instead (each invariant mutates an in-memory copy and asserts the
// comparison goes red), which is why running `mutate.sh` against it proves nothing.
// Ruled and recorded by the reviewer, 2026-08-07 (review §9).
// An assertion never shown to fail is not an instrument (LESSONS §61).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXPORT = path.resolve(__dirname, '../../../export/clone-sorento-consume-main-TEST/nodes');
const read = (f) => {
  const p = path.join(EXPORT, f);
  if (!fs.existsSync(p)) { console.log(`FATAL: ${p} missing — re-run export-workflows.py`); process.exit(2); }
  return fs.readFileSync(p, 'utf8');
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

let fails = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`ok   ${name}`);
  else { fails++; console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
};
// A negative control must FAIL when fed a deliberately corrupted input.
const control = (name, fn) => {
  const passedOnCorrupt = fn();
  if (passedOnCorrupt) { fails++; console.log(`FAIL [control] ${name} — comparison is BLIND: it passed on corrupted input`); }
  else console.log(`ok   [control] ${name} — went red on corrupted input`);
};

// ── extract a named function body, brace-balanced (not regex-guessed) ─────────
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return end < 0 ? null : src.slice(start, end);
}
// Comments and blank lines are NOT semantic; the two copies legitimately carry different
// commentary. Compare code only, whitespace-normalised.
function codeOnly(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
    .split('\n').map(l => l.trim()).filter(l => l.length).join('\n');
}

console.log('\n── P1: tokenCandidates() — probe planner vs renderer ──');
{
  const xf  = read('dym-transform.js');
  const bso = read('build-suggest-offer.js');
  const a = extractFn(xf, 'tokenCandidates');
  const b = extractFn(bso, 'tokenCandidates');
  check('P1 both bodies found in the export', !!a && !!b,
        `dym-transform:${!!a} build-suggest-offer:${!!b}`);
  if (a && b) {
    const na = codeOnly(a), nb = codeOnly(b);
    check('P1 tokenCandidates identical (code, comments ignored)', na === nb,
      na === nb ? '' : `sha ${sha(na)} vs ${sha(nb)}\n--- dym-transform ---\n${na}\n--- build-suggest-offer ---\n${nb}`);
    // the filters are the whole point of the equivalence — assert they are present, so a
    // future rewrite that keeps both copies identical but drops a filter still trips.
    for (const frag of ['isExact(m)', 'allowedTypes', 'canonical_code', 'seen.has(code)'])
      check(`P1 filter present: ${frag}`, na.includes(frag));
    control('P1', () => codeOnly(a.replace('if (isExact(m)) continue;', '')) === nb);
  }
}

console.log('\n── P2: dym-transform vs dym-transform-partial — byte-identical ──');
{
  const a = read('dym-transform.js'), b = read('dym-transform-partial.js');
  check('P2 byte-identical', a === b, a === b ? '' : `sha ${sha(a)} vs ${sha(b)}`);
  control('P2', () => a === b + '\n');
}

console.log('\n── P3: dym-annotate vs dym-annotate-partial — modulo 2 lane constants ──');
{
  const a = read('dym-annotate.js'), b = read('dym-annotate-partial.js');
  // The ONLY sanctioned difference. Normalise both constants, then require byte-equality of
  // everything else — the same method used to make the claim in the diff (§M3).
  const LANE = [
    [/const _PAYLOAD_SRC = '[^']*';\s*/, "const _PAYLOAD_SRC = '<LANE>';"],
    [/const _XF_SRC\s*= '[^']*';\s*/,    "const _XF_SRC = '<LANE>';"],
  ];
  const norm = (s) => LANE.reduce((acc, [re, to]) => acc.replace(re, to), s);
  const na = norm(a), nb = norm(b);
  check('P3 identical once the 2 lane constants are normalised', na === nb,
        na === nb ? '' : `sha ${sha(na)} vs ${sha(nb)}`);
  // Guard the normaliser itself: it must actually have matched, and must not be so greedy
  // that it would mask a real difference elsewhere.
  check('P3 normaliser matched _PAYLOAD_SRC in both', na.includes("_PAYLOAD_SRC = '<LANE>'") && nb.includes("_PAYLOAD_SRC = '<LANE>'"));
  check('P3 normaliser matched _XF_SRC in both',      na.includes("_XF_SRC = '<LANE>'") && nb.includes("_XF_SRC = '<LANE>'"));
  check('P3 lanes really are different before normalising', a !== b);
  // and assert the lanes are the EXPECTED ones — identical bodies pointed at the wrong
  // sources would pass a pure-equality check while being completely wrong.
  check('P3 not-found lane sources not-found-error-message', /_PAYLOAD_SRC = 'not-found-error-message'/.test(a));
  check('P3 not-found lane planner is dym-transform',        /_XF_SRC\s*= 'dym-transform'/.test(a));
  check('P3 partial lane sources central-exchange',          /_PAYLOAD_SRC = 'central-exchange'/.test(b));
  check('P3 partial lane planner is dym-transform-partial',  /_XF_SRC\s*= 'dym-transform-partial'/.test(b));
  control('P3', () => { const bad = b.replace('meta.ok = true;', 'meta.ok = false;'); return norm(a) === norm(bad); });
}

console.log('\n── F-CCS-STRIP: compile-current-state must not emit any dym control key ──');
{
  // dym-transform-partial appends 10 control keys to the item compile-current-state receives.
  // compile-current-state has NO strip list; it is correct only because it returns a FRESH
  // `let output = {}` literal. Nothing stated that dependency, and crossdomain-compose's own
  // comment records that this output feeds the conversation-variables PUT as
  // JSON.stringify($json) — so a refactor to spread the input instead would persist harness
  // keys into every customer session, INVISIBLY on the clone (save-session-vars is orphaned).
  const ccs = read('compile-current-state.js');
  check('CCS builds a fresh object literal (the property everything else depends on)',
        /let\s+output\s*=\s*\{\s*\}\s*;/.test(ccs),
        'compile-current-state no longer starts from `let output = {};` — it may now be spreading its input');
  check('CCS never spreads its input into output', !/output\s*=\s*\{\s*\.\.\.\$input/.test(ccs) && !/\bOBJECT\.assign\(output,\s*\$input/i.test(ccs));
  const CTRL = ['dym_probe_entities','dym_candidate_codes','dym_excluded_codes','probe_tool','probe_noun',
                'probe_predicate','probe_needed','probe_skip_reason','probe_lane','_dym_probe_input'];
  const assigned = CTRL.filter(k => new RegExp(`output(\\.${k}\\b|\\[['"]${k}['"]\\])`).test(ccs));
  check('CCS assigns no control key onto output', assigned.length === 0, `assigned: ${assigned.join(', ')}`);
  control('CCS-literal', () => /let\s+output\s*=\s*\{\s*\}\s*;/.test(ccs.replace(/let\s+output\s*=\s*\{\s*\}\s*;/, 'let output = {...$input.first().json};')));
}

console.log('\n── F-XDC: an annotated string survives crossdomain-compose intact ──');
{
  // crossdomain-compose marker-splices the rendered text (lastIndexOf on 'Did you mean', insert
  // before idx). It is safe today by analysis — the phrase holds the same offset in prose and in
  // numbered form. But "safe by analysis" is exactly the rev-6 shape, where correct-by-analysis
  // met wrong-in-render. This runs the real body and asserts every annotated suffix survives.
  // F-STALE: was reading a LOCAL copy while the rest of this suite read the export — the one
  // inconsistency in the only suite that was otherwise sourcing correctly.
  const XDC = new Function('$', '$input', '$execution', read('crossdomain-compose.js'));
  const item = (j) => ({ json: j });
  const stub = (j, e = true) => ({ isExecuted: e, first: () => item(j), all: () => [item(j)] });
  const render = stub({ _xdBlock: { any: true, block: 'Incoming for SRTWC193: ETA 2026-09-01.' }, _xd: {} });
  const run = (userResponse) => {
    const $ = (n) => (n === 'crossdomain-render' ? render : { isExecuted: false, first: () => { throw new Error('no data'); }, all: () => [] });
    const r = XDC($, { first: () => item({ user_response: userResponse, variables: { response: 'x' } }) }, { id: '1' });
    return (Array.isArray(r) ? r[0].json : r).user_response;
  };
  // one fixture per ANNOTATED surface, in the exact shape each renderer emits
  const SURFACES = {
    'D1 code mode': 'Couldn\'t find "ibwc8315-s10". Did you mean:\n1. IBWC8315-SL - has certificate\n2. IBWC8315-S - no certificate\nReply with a code to continue, or would you like me to escalate to warehouse team?',
    'partial (compile-current-state)': 'Here are the results.\n\nCouldn\'t find these:\n"srtwc8317-rl1" — did you mean:\n  1. SRTWC8317-RL - no certificate\n  2. SRTWC8317-P-RL - has certificate\n\nReply a number to check it, or ask again.',
    'picker (escalate-catalog)': 'product_attachment search needs to be more specific. Multiple matches found — please choose:\n1. SRTWC193 - has certificate\n2. SRTWC190 - no certificate',
    'D1 un-annotated (prose form)': 'Couldn\'t find "x". Did you mean A-1, or B-1? Reply with a code to continue, or would you like me to escalate to warehouse team?',
  };
  for (const [label, text] of Object.entries(SURFACES)) {
    const out = run(text);
    const wantSuffixes = (text.match(/ - (has|no) [a-z ]+/g) || []);
    const gotSuffixes  = (String(out).match(/ - (has|no) [a-z ]+/g) || []);
    check(`XDC ${label}: every suffix survives`, JSON.stringify(gotSuffixes) === JSON.stringify(wantSuffixes),
          `want ${JSON.stringify(wantSuffixes)}\n     got  ${JSON.stringify(gotSuffixes)}`);
    // The node DELIBERATELY splits at the marker's own sentence/line boundary (its comment says
    // so, and the pre-existing un-annotated prose arm is split the same way) — so "every line
    // verbatim" is the WRONG invariant and would flag shipped behaviour. The real invariant is:
    // the splice may only land at a boundary, never INSIDE an annotated candidate line.
    const annotatedLines = text.split('\n').filter(l => / - (has|no) /.test(l));
    const torn = annotatedLines.filter(l => !String(out).includes(l));
    check(`XDC ${label}: no ANNOTATED line torn (${annotatedLines.length} checked)`, torn.length === 0,
          `torn: ${JSON.stringify(torn)}`);
    check(`XDC ${label}: block inserted at a boundary, not mid-candidate`,
          !/\d+\. [A-Z0-9-]*Incoming for/.test(String(out)));
  }
  // Control: corrupt the OUTPUT the way a mid-line splice would (tear an annotated line in
  // half) and confirm both tightened assertions go red.
  control('XDC', () => {
    const text = SURFACES['D1 code mode'];
    const torn = String(run(text)).replace('1. IBWC8315-SL - has certificate', '1. IBWC8315-SL Incoming for X\n - has certificate');
    const annotated = text.split('\n').filter(l => / - (has|no) /.test(l));
    const stillIntact = annotated.every(l => torn.includes(l));
    const noMidLine = !/\d+\. [A-Z0-9-]*Incoming for/.test(torn);
    return stillIntact && noMidLine;
  });
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
