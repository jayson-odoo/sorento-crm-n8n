// ── company-pick-consumer-inert.test.js ──────────────────────────────────────────────────────
//
// `escalation-context` now carries the CONSUMER half of the miss-company company-pick contract:
// `_CO_ALIASES`, the `cpickRow` IIFE, and one `} else if (cpickRow) {` arm. When the consumer
// landed (2026-08-25, live @ 997e3891) the PRODUCER half did not exist: the live parser
// (XTODTw @ 177c50a9) had ZERO occurrences of `company_pick`, so the arm was unreachable by
// construction. That ordering was deliberate: consumer first, inert; then the parser; then the
// customer-facing copy, so the bot never asks for a reply it cannot parse.
//
// 2026-08-25, later the same day: the producer half landed in the EXPORT (plans/
// company-pick-parser.md, scope deterministic - `_coCompanyPick` in output_exchange.js, prompt
// untouched; promotion is captain-gated as ever). A1 below therefore asserts the producer's
// SHAPE rather than its absence. Everything else this file measures is still live truth: without
// a validated pick the arm must not fire (B, C, C2), and with one it must resolve exactly the
// offered row (D, D2, D3) - those tests were the forward-compatibility proof, and they are now
// simply the contract.
//
// "Inert without a pick" is a claim about behaviour, so this file measures it:
//
//   A. SOURCE. The producer lives ONLY in the parser's output_exchange.js (deterministic tier +
//      the C1 strip of the raw LLM key); the prompt teaches nothing about it. `escalation-context`
//      is the only live-spine node with an EXECUTABLE reference to it (four other nodes name it,
//      all in comments explaining the ordering).
//   B. STRUCTURE. No identifier the hunk introduces is visible outside it, and every declaration
//      in it is `const`, so nothing below the hunk can be reading a name the hunk shadowed.
//   C. BEHAVIOUR - the real proof. Excise the hunk from the shipped body by anchor, and every
//      escalation-context fixture, captured and hand-crafted alike, must produce a byte-identical
//      output from both bodies. If the hunk changed anything on live's parser shape, this goes red.
//   D. FORWARD COMPATIBILITY. One fixture drives the arm with `company_pick` set. It is testing a
//      path that CANNOT BE REACHED ON LIVE TODAY - it exists so the consumer is already proven on
//      the day the parser half lands, and so a later edit to the arm fails loudly rather than
//      silently. Do not read a green D as evidence that the feature works end to end; it does not
//      exist end to end.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes, manifestOf } = require('../offline/node-source');
const { runNode, loadFixtures, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const PARSER_SLUG = 'sub-semantic-parser';
const NODE = 'escalation-context';
const EXPORT_ROOT = path.resolve(__dirname, '../../export');

// Identifiers the hunk introduces. `company_pick` is the parser field it reads; the rest are its
// own locals. None of them may appear anywhere else in the body.
const HUNK_IDENTS = ['_CO_ALIASES', 'cpick', 'cpickRow', 'keysOf', 'company_pick'];

function bodyOf(slug, nodeName) {
  const file = manifestOf(slug).nodes[nodeName].file;
  return loadNodes(slug, [file])[file];
}

// ── the excision ──────────────────────────────────────────────────────────────────────────────
// Cut the two contiguous regions the hunk added, by ANCHOR rather than by line number: line numbers
// rot the first time someone edits a comment above them, whereas a missing anchor fails here with
// the anchor quoted. Each cut runs from the start of its opening anchor line to the start of the
// first line that survives it, so the result is the pre-hunk text exactly, with no seam.
const CUTS = [
  // region 1: the miss-company comment block, _CO_ALIASES, cpick, and the cpickRow IIFE
  ['// miss-company-routing: a company-name reply on the confirmation turn.',
   'let brand_code = null, company_id = null, company_name = null, source = \'none\';'],
  // region 2: the arm itself, which sits between the picked_member arm and the sameTeam arm
  ['} else if (cpickRow) {', '} else if (sameTeam) {'],
];

// Returns { rest, removed } - the body with both regions cut out, and the cut text itself, so the
// structural test can inspect exactly the lines the hunk owns rather than guessing at them.
function exciseHunk(src) {
  let out = src;
  const removed = [];
  for (const [from, to] of CUTS) {
    const a = out.indexOf(from);
    assert.notEqual(a, -1, `excision anchor not found (start): ${JSON.stringify(from)}`);
    const b = out.indexOf(to, a);
    assert.notEqual(b, -1, `excision anchor not found (end): ${JSON.stringify(to)}`);
    // both anchors are at the start of their own line; keep the indentation preceding the end anchor
    const lineStartA = out.lastIndexOf('\n', a) + 1;
    const lineStartB = out.lastIndexOf('\n', b) + 1;
    removed.push(out.slice(lineStartA, lineStartB));
    out = out.slice(0, lineStartA) + out.slice(lineStartB);
  }
  return { rest: out, removed: removed.join('') };
}

function run(body, fixture) {
  return JSON.parse(JSON.stringify(normalizeReturn(
    runNode({ body, fixture, slug: SLUG, nodeName: NODE })
  )));
}

// ── A. the producer half: deterministic-only, exactly where it should be ─────────────────────
// (This test asserted zero occurrences until 2026-08-25; the deterministic port flipped it. It
// now pins the producer's shape so anything BEYOND that shape - a prompt mention, a second node
// touching the field - fails loudly and gets re-argued rather than re-pinned.)
test('A1: the parser export carries company_pick only in output_exchange.js, and the prompt is clean', () => {
  const man = manifestOf(PARSER_SLUG);
  const dir = path.join(EXPORT_ROOT, PARSER_SLUG, 'nodes');
  const hits = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const n = (fs.readFileSync(path.join(dir, f), 'utf8').match(/company_pick/g) || []).length;
    if (n) hits.push(f);
  }
  assert.deepStrictEqual(hits, ['output_exchange.js'],
    'the producer must live in output_exchange.js and nowhere else in the parser export');
  const body = fs.readFileSync(path.join(dir, 'output_exchange.js'), 'utf8');
  assert.ok(body.includes('function _coCompanyPick('), 'the deterministic resolver is missing');
  assert.ok(/'company_pick' in output\.output\.escalation\) delete output\.output\.escalation\.company_pick/.test(body),
    'the C1 strip of the raw LLM key is the SAFETY half of the producer - it must never be dropped');
  // the whole deployed artifact, not just the Code bodies - an If expression or the prompt could
  // carry it too. Blank the folded jsCode bodies out and require zero occurrences anywhere else.
  const wf = JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, PARSER_SLUG, 'workflow.json'), 'utf8'));
  for (const n of wf.nodes) {
    if (n.parameters && typeof n.parameters.jsCode === 'string') n.parameters.jsCode = '';
  }
  assert.equal((JSON.stringify(wf).match(/company_pick/g) || []).length, 0,
    'company_pick appears in the parser workflow.json outside a Code body - if that is the ' +
    'systemMessage, the plan\'s Stage 2 (scope: parser) just shipped and must be reviewed as such');
  assert.equal(man.id, 'XTODTw-dJcV0uRdC056hG', 'the parser slug no longer points at the live parser');
});

// T5 of the plan: the alias STOPGAP is duplicated by design (parser + spine consumer), and the
// contract only holds while the two copies are byte-identical. A drift here is a customer whose
// code resolves on one side and not the other.
test('A1b: _CO_ALIASES is byte-identical between the parser and escalation-context', () => {
  const aliasLine = (src, where) => {
    const m = src.match(/^const _CO_ALIASES = (\{.*?\});/m);
    assert.ok(m, `_CO_ALIASES is no longer a single-line object literal in ${where}`);
    return m[1];
  };
  const parser = fs.readFileSync(path.join(EXPORT_ROOT, PARSER_SLUG, 'nodes', 'output_exchange.js'), 'utf8');
  const spine = fs.readFileSync(path.join(EXPORT_ROOT, SLUG, 'nodes', 'escalation-context.js'), 'utf8');
  assert.equal(aliasLine(parser, 'the parser'), aliasLine(spine, 'escalation-context'),
    'the two _CO_ALIASES copies drifted - a company code now resolves on one side only');
});

test('A2: escalation-context is the only live-spine node with an executable company_pick reference', () => {
  const dir = path.join(EXPORT_ROOT, SLUG, 'nodes');
  const executable = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.includes('company_pick')) continue;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;   // a comment line naming the field
      executable.push(f);
      break;
    }
  }
  assert.deepStrictEqual(executable, ['escalation-context.js'],
    'another node started reading or writing company_pick; the single-consumer claim is stale');
});

// ── B. the hunk is sealed ─────────────────────────────────────────────────────────────────────
test('B: no hunk identifier is visible outside the hunk, and every hunk declaration is const', () => {
  const src = bodyOf(SLUG, NODE);
  const { rest, removed } = exciseHunk(src);
  for (const id of HUNK_IDENTS) {
    assert.doesNotMatch(rest, new RegExp(`\\b${id}\\b`),
      `${id} is referenced outside the hunk - the hunk is not self-contained and cutting it changes the rest`);
  }
  // Everything the hunk declares is const, so nothing below it can be re-bound, and nothing it
  // declares can hoist above its own region the way a `var` or a function declaration would.
  for (const line of removed.split('\n')) {
    assert.doesNotMatch(line, /^\s*(var|let|function)\s/,
      `the hunk introduces a non-const binding, which can hoist or be re-bound: ${line.trim()}`);
  }
  // the cut is the 38 lines the clone added and nothing else
  assert.equal(removed.split('\n').length - 1, 38,
    'the excision no longer removes exactly the 38 lines the consumer added');
  assert.equal(src.split('\n').length - rest.split('\n').length, 38, 'the two line counts disagree');
});

// ── C. the behavioural proof ──────────────────────────────────────────────────────────────────
test('C: on every fixture, the shipped body and the hunk-free body produce identical output', () => {
  const shipped = bodyOf(SLUG, NODE);
  const preHunk = exciseHunk(shipped).rest;
  const fixtures = loadFixtures(SLUG, NODE);
  assert.ok(fixtures.length >= 4, `expected the escalation-context fixture set, got ${fixtures.length}`);
  let compared = 0;
  for (const { name, fixture } of fixtures) {
    // the forward-compat fixture is the ONE case where the two bodies must differ - it is the whole
    // point of the hunk. Assert that difference explicitly rather than skipping it, so a hunk that
    // silently stopped doing anything would still fail this test.
    if (name === 'company-pick-resolves-sorento') {
      assert.notDeepStrictEqual(run(shipped, fixture), run(preHunk, fixture),
        'the forward-compat fixture no longer distinguishes the two bodies - the arm has stopped firing');
      continue;
    }
    assert.deepStrictEqual(run(shipped, fixture), run(preHunk, fixture),
      `${name}: the hunk changed this turn's output - it is NOT inert, stop and report`);
    compared += 1;
  }
  assert.ok(compared >= 3, `only ${compared} fixture(s) proved inert; expected at least the three captured turns`);
});

test('C2: with company_pick absent (live\'s parser shape) the multi_company_unpicked arm still decides', () => {
  const f = loadFixtures(SLUG, NODE).find((x) => x.name === 'company-pick-absent-inert');
  assert.ok(f, 'missing fixture escalation-context/company-pick-absent-inert');
  const o = f.fixture.ctx["Call 'sub-query-reformulator'"][0].json.output;
  assert.ok(!('company_pick' in o.escalation),
    'the inertness fixture must carry live\'s escalation shape, with no company_pick key at all');
  const j = run(bodyOf(SLUG, NODE), f.fixture)[0].json;
  assert.equal(j.routing_source, 'multi_company_unpicked');
  assert.equal(j.company_id, null);
  assert.equal(j.company_name, null);
  assert.equal(j.brand_code, null);
});

// ── D. forward compatibility - UNREACHABLE ON LIVE TODAY ──────────────────────────────────────
test('D: [UNREACHABLE ON LIVE] a company_pick of "sorento" resolves to the Sorento roster row', () => {
  const f = loadFixtures(SLUG, NODE).find((x) => x.name === 'company-pick-resolves-sorento');
  assert.ok(f, 'missing fixture escalation-context/company-pick-resolves-sorento');
  const plan = f.fixture.ctx['get-session-vars'][0].json.session_vars.variables.routing_roster_plan;
  assert.equal(plan.length, 2, 'the pool must have two entries or the pick proves nothing');
  const j = run(bodyOf(SLUG, NODE), f.fixture)[0].json;
  assert.equal(j.routing_source, 'company_pick');
  assert.equal(j.company_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(j.company_name, 'Sorento');
  // the axes are the matched row's own, VERBATIM - never re-derived from routing_brand or query_brands
  assert.equal(j.brand_code, 'sorento');
  assert.deepStrictEqual(
    { company_id: j.company_id, company_name: j.company_name, brand_code: j.brand_code },
    { company_id: plan[0].company_id, company_name: plan[0].company_name, brand_code: plan[0].brand_code }
  );
});

test('D2: [UNREACHABLE ON LIVE] a pick matching no offered company leaves the turn exactly as it was', () => {
  const base = loadFixtures(SLUG, NODE).find((x) => x.name === 'company-pick-absent-inert').fixture;
  const shipped = bodyOf(SLUG, NODE);
  const before = run(shipped, base);
  for (const pick of ['cabana', 'not-a-company', '']) {
    const f = JSON.parse(JSON.stringify(base));
    f.ctx["Call 'sub-query-reformulator'"][0].json.output.escalation.company_pick = pick;
    assert.deepStrictEqual(run(shipped, f), before,
      `company_pick=${JSON.stringify(pick)} is not in the offered pool, so the arm must not fire`);
  }
});

// D3 exists because of a mutation run. Breaking the `if (!cpick) return null;` short-circuit
// (`!cpick` -> `false`) does NOT turn any fixture red, and that is correct rather than a gap: with
// `cpick` null, `keysOf(c).has(null)` is false for every row because every key the map holds is a
// string, so `hits` is empty and the exactly-one-match rule returns null regardless. The null-guard
// is an early exit, not the gate. THE GATE IS `uniq.length === 1`, plus the choice of pool. Three
// further mutants showed those two WERE unguarded - loosening `=== 1` to `>= 1`, widening the pool
// to the plan-plus-companies union rev-4(A) forbids, and dropping the case fold all survived every
// fixture. Each case below kills one of them. Like D, all of it is unreachable on live today.
test('D3: [UNREACHABLE ON LIVE] the pool and the exactly-one rule are what actually gate the arm', () => {
  const shipped = bodyOf(SLUG, NODE);
  const base = loadFixtures(SLUG, NODE).find((x) => x.name === 'company-pick-absent-inert').fixture;
  const varsOf = (f) => f.ctx['get-session-vars'][0].json.session_vars.variables;
  const setPick = (f, v) => { f.ctx["Call 'sub-query-reformulator'"][0].json.output.escalation.company_pick = v; };
  const clone = () => JSON.parse(JSON.stringify(base));

  // (a) AMBIGUOUS: two offered rows answer to the same name. Auto-picking either one assigns a
  //     company the customer did not name, so the arm must decline and let the clarify path run.
  const amb = clone();
  setPick(amb, 'sorento');
  varsOf(amb).routing_roster_plan[1] = {
    plan_idx: 1,
    company_id: 'aaaaaaaa-0000-0000-0000-00000000000b',
    company_name: 'Sorento',
    brand_code: 'sorento',
  };
  assert.equal(run(shipped, amb)[0].json.routing_source, 'multi_company_unpicked',
    'two rows matched one name and the arm picked one anyway - that is an assign the customer never chose');

  // (b) NOT OFFERED: the company is in routing_companies but has no row in the roster plan, so its
  //     roster was never shown. rev-4(A): when a plan exists it IS the pool, never the union.
  const unshown = clone();
  setPick(unshown, 'cabana');
  varsOf(unshown).routing_companies.push({
    company_id: 'cccccccc-0000-0000-0000-000000000003',
    company_name: 'Cabana',
    brand_code: 'cabana',
  });
  const u = run(shipped, unshown)[0].json;
  assert.equal(u.routing_source, 'multi_company_unpicked',
    'the pick landed on a company whose roster the customer was never shown');
  assert.equal(u.company_id, null);

  // (c) CASE: the customer types the company the way it is printed to them, capitalised.
  const cased = clone();
  setPick(cased, '  Sorento  ');
  const c = run(shipped, cased)[0].json;
  assert.equal(c.routing_source, 'company_pick', 'the pick is no longer case-folded and trimmed');
  assert.equal(c.company_name, 'Sorento');

  // (d) the short code, which is the only thing _CO_ALIASES is for
  const short = clone();
  setPick(short, 'srt');
  assert.equal(run(shipped, short)[0].json.company_name, 'Sorento',
    'the _CO_ALIASES short code no longer resolves');
});

// ── the closed alias list, stated so it is not a surprise later ───────────────────────────────
// `_CO_ALIASES` is a hardcoded three-company map (sorento/srt, mocha/mch, cabana/cbn). A fourth
// company added to the CRM will not resolve by its short code until this map or its replacement
// (the companies.code column threaded through the plan rows, per the body's own comment) catches
// up. Pinning the list here means that day shows up as a failing test naming the omission, rather
// than as a customer whose reply is silently not understood.
test('the _CO_ALIASES stopgap is still the closed three-company list it is documented as', () => {
  const src = bodyOf(SLUG, NODE);
  const m = src.match(/^const _CO_ALIASES = (\{.*\});$/m);
  assert.ok(m, '_CO_ALIASES is no longer a single-line object literal - re-read the map before trusting this test');
  assert.equal(m[1],
    "{ sorento: ['sorento', 'srt'], mocha: ['mocha', 'mch'], cabana: ['cabana', 'cbn'] }",
    'the alias map changed; if a company was added, check the DYM/pick copy offers its code too');
});
