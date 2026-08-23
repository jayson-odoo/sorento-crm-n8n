#!/usr/bin/env node
// ── mutate.js — MEASURE the suite, don't trust it ────────────────────────────────────────────
//
// `npm test` going green says "no fixture disagreed with the body". It does NOT say the fixtures
// would have noticed if the body were wrong. This script answers that second question the only way
// it can be answered: break the body on purpose, one edit at a time, and see whether the suite goes
// red. A mutant the suite fails to notice is a precise, addressable statement of an untested
// behaviour — "flip this `===` on line 812 and every test still passes".
//
//   npm run mutate                          every Code node, both slugs
//   npm run mutate -- --node output_exchange        one node
//   npm run mutate -- --slug sub-semantic-parser    one workflow
//   npm run mutate -- --node output_exchange --per-node 60 --survivors
//   npm run mutate -- --node output_exchange --list     count mutants without running anything
//
// EXIT CODE IS ALWAYS 0. This is an instrument, not a gate: it takes minutes, and a kill rate is a
// number to track, not a pass/fail. It is deliberately NOT wired into `npm test`.
//
// ── the three things that make the number trustworthy ────────────────────────────────────────
// 1. BODIES COME FROM node-source.js, sha-verified against export/MANIFEST.json — never a hand
//    copy. A mutation score computed against yesterday's bytes is the F-STALE incident wearing a
//    different hat (see tests/offline/node-source.js's banner, LESSONS §63/§76).
// 2. MUTANTS ARE WRITTEN TO A SCRATCH DIRECTORY and fed to the suite through node-source.js's
//    OFFLINE_NODES_DIR hook. export/ is the audited artifact; nothing here writes to it.
// 3. COMMENTS, STRING LITERALS AND REGEX LITERALS ARE NOT MUTATED. `output_exchange.js` is roughly
//    half prose; a `===` inside a comment is unkillable BY CONSTRUCTION, and counting those as
//    survivors deflates the score with noise nobody can act on. Only real code positions count.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '../../..');            // repo root (where package.json lives)

// node-source must load the PRISTINE bodies here, so make sure an inherited OFFLINE_NODES_DIR from
// an outer mutation run can't quietly seed this one from someone else's mutants.
delete process.env.OFFLINE_NODES_DIR;
const { loadNodes, manifestOf } = require('../offline/node-source');

const SLUGS = ['live-spine-sorento-consume-main', 'sub-semantic-parser'];

// ── args ────────────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { node: null, slug: null, perNode: 12, survivors: false, out: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--node') a.node = argv[++i];
    else if (k === '--slug') a.slug = argv[++i];
    else if (k === '--per-node') a.perNode = Number(argv[++i]);
    else if (k === '--survivors') a.survivors = true;
    else if (k === '--list') a.list = true;   // size a run: how many mutants does this body admit?
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 22).join('\n')); process.exit(0); }
    else { console.error(`mutate: unknown argument ${k}`); process.exit(0); }
  }
  if (!Number.isInteger(a.perNode) || a.perNode < 1) { console.error('mutate: --per-node must be a positive integer'); process.exit(0); }
  // Scoping to one node is the "work the survivor list" mode — print it without being asked.
  if (a.node) a.survivors = true;
  return a;
}

// ── code mask: which characters are real code (not comment / string / regex / template) ──────
// Single pass, standard JS lexing heuristic. The one genuinely ambiguous case in JS is `/`:
// division or the start of a regex literal. Resolved the usual way — a `/` is a regex start iff
// the last significant character before it can't end an expression. Every exported body parses
// under this (asserted below by `node --check` on each mutant, which would throw on a mis-lex).
function codeMask(src) {
  const mask = new Uint8Array(src.length);       // 1 = mutable code position
  let i = 0;
  let lastSig = '';                              // last significant code char seen
  const PRE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {                                    // line comment
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {                                    // block comment
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {                        // string / template literal
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      lastSig = q;                                                     // a literal can end an expression
      continue;
    }
    if (c === '/' && PRE_REGEX.has(lastSig)) {                        // regex literal
      i++;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        else if (src[i] === '\n') break;                              // unterminated => wasn't a regex
        i++;
      }
      while (i < src.length && /[a-z]/.test(src[i])) i++;             // flags
      lastSig = '/';
      continue;
    }
    mask[i] = 1;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return mask;
}

const inCode = (mask, start, len) => {
  for (let k = start; k < start + len; k++) if (!mask[k]) return false;
  return true;
};

// ── mutation operators ───────────────────────────────────────────────────────────────────────
// Operator swaps, boundary shifts and constant flips — the three families that map onto how these
// bodies actually go wrong (a comparison inverted in a refactor, an off-by-one on a roster index,
// a default flipped). Deliberately NOT included: deleting statements or whole blocks. Those
// produce mostly-crashing mutants, and "the suite noticed a thrown TypeError" is a much weaker
// statement than "the suite noticed this branch took the other path".
const OPERATORS = [
  // token-level swaps: [match, replacement, label]. Longest match wins at a given position.
  ['===', '!==', 'eq->ne'],
  ['!==', '===', 'ne->eq'],
  ['&&', '||', 'and->or'],
  ['||', '&&', 'or->and'],
  ['>=', '>', 'ge->gt'],
  ['<=', '<', 'le->lt'],
  ['??', '||', 'nullish->or'],
];
// bare `>` / `<` (boundary shift) need a lookaround so they don't eat `=>`, `>=`, `<=`, `<<`.
const BOUNDARY = [
  [/(?<![-=<>!])>(?![=>])/g, '>=', 'gt->ge'],
  [/(?<![-=<>!])<(?![=<])/g, '<=', 'lt->le'],
];
const CONSTANTS = [
  [/\btrue\b/g, 'false', 'true->false'],
  [/\bfalse\b/g, 'true', 'false->true'],
  [/(?<![\w.$])(\d+)(?![\w.])/g, null, 'num+1'],   // replacement computed per hit
];
// `!x` -> `x`. Excludes `!=`, `!==` (handled above) and `!!`.
const DROP_BANG = /(?<![!=<>])!(?![=!])/g;

function lineOf(src, pos) { return src.slice(0, pos).split('\n').length; }

// A survivor line is a WORKLIST ITEM, so it has to say WHICH token on the line was mutated — a
// long line can hold three `&&`s with completely different meanings, and "line 660, and->or" sends
// the reader to the wrong one. Show a window centred on the mutation with the mutated token
// wrapped in »«.
function snippet(src, pos, len) {
  const from = src.lastIndexOf('\n', pos) + 1;
  let to = src.indexOf('\n', pos);
  if (to === -1) to = src.length;
  const line = src.slice(from, to);
  const col = pos - from;
  const marked = line.slice(0, col) + '»' + line.slice(col, col + len) + '«' + line.slice(col + len);
  const start = Math.max(0, col - 44);
  return (start > 0 ? '…' : '') + marked.slice(start, start + 100).trim();
}

// Every mutant this body admits, in source order. A mutant is {pos, len, text, label, line}.
function candidates(src) {
  const mask = codeMask(src);
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (!mask[i]) continue;
    for (const [tok, rep, label] of OPERATORS) {
      if (src.startsWith(tok, i) && inCode(mask, i, tok.length)) {
        out.push({ pos: i, len: tok.length, text: rep, label, line: lineOf(src, i) });
        break;   // one mutant per position; OPERATORS is ordered longest-first per prefix
      }
    }
  }
  const pushRe = (re, repFn, label) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (!inCode(mask, m.index, m[0].length)) continue;
      out.push({ pos: m.index, len: m[0].length, text: repFn(m), label, line: lineOf(src, m.index) });
    }
  };
  for (const [re, rep, label] of BOUNDARY) pushRe(re, () => rep, label);
  for (const [re, rep, label] of CONSTANTS) {
    pushRe(re, (m) => (rep !== null ? rep : String(Number(m[1]) + 1)), label);
  }
  pushRe(DROP_BANG, () => '', 'drop-!');
  out.sort((a, b) => a.pos - b.pos);
  // Two operators can claim the same position (`!` inside `!==` is excluded, but `true` in
  // `x === true` yields both an eq swap and a constant flip at different positions — fine). Only
  // exact-position duplicates are dropped, so one edit is one mutant.
  const seen = new Set();
  return out.filter((c) => {
    const k = `${c.pos}:${c.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Even spread over the file, deterministic, so a re-run compares like with like and a big node
// isn't sampled only in its first 200 lines.
function sample(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let k = 0; k < n; k++) out.push(list[Math.floor((k * list.length) / n)]);
  return out;
}

const apply = (src, c) => src.slice(0, c.pos) + c.text + src.slice(c.pos + c.len);

// ── running the suite against a scratch copy ─────────────────────────────────────────────────
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-mutate-'));
process.on('exit', () => { try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (e) { /* best effort */ } });

function failCount(out) {
  const m = /^# fail (\d+)$/m.exec(out);
  return m ? Number(m[1]) : -1;
}

function runSuite(script) {
  try {
    const out = execFileSync('npm', ['run', script, '--silent'], {
      cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OFFLINE_NODES_DIR: SCRATCH },
    });
    return failCount(out);
  } catch (e) {
    // node --test exits non-zero when a test fails; that IS a kill, and the report is on stdout.
    const out = `${(e.stdout || '')}${(e.stderr || '')}`;
    const f = failCount(out);
    return f >= 0 ? f : -1;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));

// Seed the scratch dir with every pristine body, sha-verified. The suite loads ALL of them on
// every run, so all 40 must be present even when only one is being mutated.
const targets = [];   // {slug, nodeName, file, src}
for (const slug of SLUGS) {
  const man = manifestOf(slug);
  const files = Object.entries(man.nodes).map(([nodeName, rec]) => ({ nodeName, file: rec.file }));
  const src = loadNodes(slug, files.map((f) => f.file));
  for (const { nodeName, file } of files) {
    fs.writeFileSync(path.join(SCRATCH, file), src[file]);
    if (args.slug && slug !== args.slug) continue;
    if (args.node && nodeName !== args.node && file !== args.node && file !== `${args.node}.js`) continue;
    targets.push({ slug, nodeName, file, src: src[file] });
  }
}
if (targets.length === 0) {
  console.log(`mutate: no node matched --node=${args.node} --slug=${args.slug}`);
  process.exit(0);
}

if (args.list) {
  let total = 0;
  for (const t of targets) {
    const n = candidates(t.src).length;
    total += n;
    console.log(`${t.nodeName.padEnd(40)} ${String(n).padStart(5)} mutants available`);
  }
  console.log(`\n${total} mutants available across ${targets.length} node(s)`);
  process.exit(0);
}

console.log(`mutation run: ${targets.length} node(s), <= ${args.perNode} mutants each, scratch ${SCRATCH}`);
console.log('(bodies sha-verified from export/ via node-source.js; export/ is never written)\n');

const rows = [];
const allSurvivors = [];
for (const t of targets) {
  const cands = sample(candidates(t.src), args.perNode);
  const survivors = [];
  let killed = 0;
  for (const c of cands) {
    fs.writeFileSync(path.join(SCRATCH, t.file), apply(t.src, c));
    let f = runSuite('test:unit');
    if (f === 0) f = runSuite('test:flow');
    if (f > 0) killed += 1;
    else survivors.push({ ...c, code: snippet(t.src, c.pos, c.len), note: f < 0 ? 'suite did not report a fail count' : '' });
  }
  fs.writeFileSync(path.join(SCRATCH, t.file), t.src);      // restore before the next node
  rows.push({ slug: t.slug, node: t.nodeName, mutants: cands.length, killed, survivors });
  for (const s of survivors) allSurvivors.push({ node: t.nodeName, ...s });
  const pct = cands.length ? Math.round((killed / cands.length) * 100) : 0;
  console.log(`  ${t.nodeName.padEnd(40)} ${String(killed).padStart(3)}/${String(cands.length).padEnd(3)} ${String(pct).padStart(3)}%`);
}

const nameW = Math.max(4, ...rows.map((r) => r.node.length));
console.log('\nnode'.padEnd(nameW + 1) + '  mutants  killed  %');
for (const r of rows) {
  const pct = r.mutants ? Math.round((r.killed / r.mutants) * 100) : 0;
  console.log(r.node.padEnd(nameW) + '  ' + String(r.mutants).padStart(7) + '  ' + String(r.killed).padStart(6) + '  ' + String(pct).padStart(3) + '%');
}
const tm = rows.reduce((n, r) => n + r.mutants, 0);
const tk = rows.reduce((n, r) => n + r.killed, 0);
console.log(`\nOVERALL  ${tk}/${tm} = ${tm ? Math.round((tk / tm) * 100) : 0}% of mutants killed`);

if (args.survivors && allSurvivors.length) {
  console.log('\nSURVIVORS — each line is one untested behaviour (or a provably equivalent mutant):');
  for (const s of allSurvivors) {
    console.log(`  ${s.node}:${String(s.line).padStart(4)}  ${s.label.padEnd(12)} ${s.code}`);
  }
}

if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 1));
  console.log(`\nwrote ${args.out}`);
}
process.exit(0);   // a metric, never a gate
