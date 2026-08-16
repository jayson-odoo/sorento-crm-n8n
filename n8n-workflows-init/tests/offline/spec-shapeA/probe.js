#!/usr/bin/env node
// ── SA offline probe — spec-search shape A wiring ────────────────────────────────────────
//   node probe.js
//
// Covers, with NO network and no n8n execution:
//   P5-*  the free_terms classifier (UAC SA-P5)
//   B1    the built body renders and parses as JSON for every real-shaped parser payload
//   B2    every pre-existing field renders BYTE-IDENTICALLY before vs after  <- the n8n-side
//         half of "this change is inert for traffic that works today"
//   B3    the three new fields carry the planned values
//   B4    the key-set delta is EXACTLY {spec_fallback, free_terms, understand_phrase}
//   B5    the bytes on the clone == the bytes this suite tested (resync gate, LESSONS §72)
//
// What it deliberately does NOT cover, so nobody reads more into a green than is there:
//   - SA-P1..P4 need the LIVE CRM. See crm-probe.js: this seat is barred from probing
//     production hosts, so those four are UNRUN, not passing.
//   - Whether the CRM's ranker returns anything useful for a given phrase. That is SA-P1's
//     job and it cannot be answered offline.
'use strict';

const fs = require('fs');
const path = require('path');
const { freeTerms, CLASSIFIER_SRC } = require('./free-terms.js');
const { build } = require('./build-body.js');
const { renderJson } = require('./render-body.js');

const DIR = __dirname;
const FIX = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.json'), 'utf8'));
const BEFORE = fs.readFileSync(path.join(DIR, 'resolve-entity.before.jsonBody.txt'), 'utf8');
const AFTER = build();

const REFORMULATOR = "Call 'sub-query-reformulator'";
const FINDCONTACT = 'sorento-sub-respond-findcontact-respond';

let pass = 0;
let fail = 0;
const ok = (id, msg) => { pass++; console.log(`  ✓ ${id}  ${msg}`); };
const no = (id, msg, extra) => {
  fail++;
  console.log(`  ✗ ${id}  ${msg}`);
  if (extra !== undefined) console.log(`      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`);
};
// `got` is a THUNK, not a value. A mutated classifier can throw, and an uncaught throw kills
// the process mid-suite: every later assertion silently never runs and the mutation gate,
// which scores on the presence of a ✗ line, reads that as "not caught". That is §72's crash-
// vs-signal confusion, and it cost this harness one mis-scored mutant before the thunk went in.
const eq = (id, msg, thunk, want) => {
  let got;
  try {
    got = typeof thunk === 'function' ? thunk() : thunk;
  } catch (err) {
    return no(id, msg, `threw: ${err.message}`);
  }
  const a = JSON.stringify(got); const b = JSON.stringify(want);
  return a === b ? ok(id, msg) : no(id, msg, `got ${a} want ${b}`);
};

// ── P5 — the classifier ──────────────────────────────────────────────────────────────────
console.log('\nSA-P5  free_terms classifier');

const raws = (...vals) => vals.map((raw) => ({ raw, hint: 'product', canonical_code: null, current_message: true, confident: true }));

// Codes. Real ones, taken from the promotion baseline corpus + live executions.
const CODES = ['SRTWC286', 'srtwc286', 'CBS212-WH', 'SRTKS6047-NEW', 'SRTBF11834', 'MBF97582',
  'SRTWC6015-RL-UF', 'TT440', 'SRT332-GM', 'SRTKT72SS', 'SPO-2024-001'];
eq('P5-1', 'ASCII product/order codes are excluded', () => freeTerms(raws(...CODES)), []);

// The paste forms. U+2212 MINUS, U+2013 EN DASH, U+2014 EM DASH, U+FF0D FULLWIDTH.
eq('P5-2', 'unicode-dash code forms are excluded without relying on the parser fold',
  () => freeTerms(raws('SRT332−GM', 'SRT332–GM', 'SRT332—GM', 'SRT332－GM')), []);

// Descriptions. This is the direction that must never lose anything.
const WORDS = ['wall hung basin', 'flexible hose', 'kitchen sink', 'black', 'matte black',
  'angle valve', 'SIRIM', 'single bowl'];
eq('P5-3', 'plain nouns and phrases pass through', () => freeTerms(raws(...WORDS)), WORDS);

// Dimensions lead with the number, which is exactly why the rule keys on leading LETTERS and
// not on "contains a digit". Losing these would silently delete the spec the customer gave.
const DIMS = ['600mm', '1m', '1200', '300x600', '2 hole'];
eq('P5-4', 'dimensions and measurements are kept', () => freeTerms(raws(...DIMS)), DIMS);

eq('P5-5', 'mixed turn keeps only the description',
  () => freeTerms(raws('SRTWC286', 'wall hung basin')), ['wall hung basin']);
eq('P5-6', 'blank/whitespace raws are dropped', () => freeTerms(raws('', '   ', 'basin')), ['basin']);
eq('P5-7', 'raws are trimmed', () => freeTerms(raws('  wall hung basin  ')), ['wall hung basin']);
eq('P5-8', 'duplicates collapse', () => freeTerms(raws('basin', 'basin', 'tap')), ['basin', 'tap']);
eq('P5-9', 'a missing/!array entity list yields []', () => [freeTerms(undefined), freeTerms(null), freeTerms({}), freeTerms([null, undefined])], [[], [], [], []]);
eq('P5-10', 'an entity with no raw is dropped, not stringified',
  () => freeTerms([{ hint: 'product' }, { raw: 'basin' }]), ['basin']);

// BOUND, not a win: a hyphenated description carrying a digit is indistinguishable from a
// code by this rule and is dropped. Pinned so the limitation is visible in the run output
// instead of being discovered later (LESSONS §66 — name the bound rather than let a green
// imply proof). Space-separated descriptive raws, which is what the parser actually emits,
// are unaffected — P5-3/P5-4 are the cases that matter.
eq('P5-11', '[bound] a hyphenated description with a digit is read as a code and dropped',
  () => freeTerms(raws('wall-hung-600', 'wall hung 600')), ['wall hung 600']);

// ── B — the body ─────────────────────────────────────────────────────────────────────────
console.log('\nSA-B   built jsonBody (offline render of the n8n expression)');

const LEGACY_KEYS = ['query', 'match_mode', 'tokens', 'allowed_entity_types', 'access_levels', 'domain', 'fallback_to_all_types', 'limit'];
const NEW_KEYS = ['spec_fallback', 'free_terms', 'understand_phrase'];

for (const c of FIX.cases) {
  const ctx = { [REFORMULATOR]: [{ output: c.output }], [FINDCONTACT]: [FIX.contact] };

  let before; let after;
  try {
    before = renderJson(BEFORE, ctx);
  } catch (err) {
    no('B1', `[${c.id}] BEFORE body failed to render — the fixture is wrong, not the change`, err.message);
    continue;
  }
  try {
    after = renderJson(AFTER, ctx);
  } catch (err) {
    no('B1', `[${c.id}] built body did not render to valid JSON`, err.message);
    continue;
  }
  ok('B1', `[${c.id}] built body renders and parses`);

  // B2 — the eight fields the spine has always sent must be untouched. Compared by VALUE per
  // key (not by whole-object equality) so the failure names the field that moved.
  const moved = LEGACY_KEYS.filter((k) => JSON.stringify(before.json[k]) !== JSON.stringify(after.json[k]));
  if (moved.length === 0) ok('B2', `[${c.id}] all 8 pre-existing fields byte-identical`);
  else no('B2', `[${c.id}] pre-existing field(s) changed: ${moved.join(', ')}`,
    moved.map((k) => `${k}: ${JSON.stringify(before.json[k])} -> ${JSON.stringify(after.json[k])}`).join(' | '));

  // B3 — the three new fields.
  const got = { spec_fallback: after.json.spec_fallback, free_terms: after.json.free_terms, understand_phrase: after.json.understand_phrase };
  eq('B3', `[${c.id}] new fields`, got,
    { spec_fallback: true, free_terms: c.expect_free_terms, understand_phrase: false });

  // B4 — nothing else appeared or vanished. This is the assertion that catches a builder that
  // fails "in the direction of a valid-looking document".
  const added = Object.keys(after.json).filter((k) => !(k in before.json)).sort();
  const removed = Object.keys(before.json).filter((k) => !(k in after.json)).sort();
  if (removed.length) no('B4', `[${c.id}] fields REMOVED from the body: ${removed.join(', ')}`);
  else eq('B4', `[${c.id}] key-set delta is exactly the three new fields`, added, NEW_KEYS.slice().sort());
}

// ── B6 — the `|| []` guard on the entity list ────────────────────────────────────────────
// Added because a mutant SURVIVED: removing `|| []` from the accessor changed nothing, since
// every fixture carries an `entities` array. A surviving mutant is a claim about the FIXTURES
// first (LESSONS §66), and the shape it could not see is "the key is absent". It cannot be
// tested through the whole body — the three PRE-EXISTING lines call `.entities.map(...)`
// unguarded, so a missing `entities` already throws the node today, and a whole-body fixture
// would only re-prove that. So the free_terms segment is evaluated on its own.
//
// Worth recording for the reviewer: this means the new field is strictly MORE defensive than
// the lines beside it. That is deliberate — a new field must not be the reason a turn fails —
// but it is not a fix for the pre-existing hazard, and it is not pretending to be.
console.log('\nSA-B6  free_terms segment tolerates a missing entity list');
{
  const line = AFTER.split('\n').find((l) => l.trimStart().startsWith('"free_terms"'));
  const m = line && line.match(/\{\{[\s\S]*\}\}/);
  if (!m) {
    no('B6', 'could not locate the free_terms expression in the built body');
  } else {
    for (const [label, output] of [
      ['entities key absent', { user_goal: 'x', match_mode: 'or', access_levels: [], domain_hint: 'master_products' }],
      ['entities null', { user_goal: 'x', match_mode: 'or', access_levels: [], domain_hint: 'master_products', entities: null }],
    ]) {
      try {
        const { render } = require('./render-body.js');
        const { text } = render('=' + m[0], { [REFORMULATOR]: [{ output }], [FINDCONTACT]: [FIX.contact] });
        eq('B6', `[${label}] renders as []`, JSON.parse(text), []);
      } catch (err) {
        no('B6', `[${label}] threw instead of rendering []`, err.message);
      }
    }
  }
}

// ── B5 — resync gate ─────────────────────────────────────────────────────────────────────
// LESSONS §72: an offline suite is a cache and decays. This compares the bytes tested above
// against the bytes actually on the clone (via the verified export). THREE outcomes, never
// two: matches / NOT-YET-DEPLOYED / DRIFTED. "Not yet deployed" must not read as a pass.
console.log('\nSA-B5  deployed-bytes resync gate');
const EXPORT = path.join(DIR, '..', '..', '..', 'export', 'clone-sorento-consume-main-TEST', 'workflow.json');
try {
  const wf = JSON.parse(fs.readFileSync(EXPORT, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'resolve-entity-http');
  if (!node) no('B5', 'resolve-entity-http not found in the clone export');
  else if (node.parameters.jsonBody === AFTER) ok('B5', `clone bytes == suite bytes (export versionId ${wf.versionId})`);
  else if (node.parameters.jsonBody === BEFORE) console.log(`  … B5  NOT-YET-DEPLOYED — clone still carries the BEFORE body (export versionId ${wf.versionId}). Not a pass and not a failure; re-run after the PUT + re-export.`);
  // ── SUPERSEDED, a FOURTH outcome (added 2026-08-15, spec-raw-text-migration) ────────────
  // `spec-answer-honesty` then `spec-raw-text-migration` both rewrote this same leaf. This
  // suite's `AFTER` is shape-A's body — two revisions behind by design. Collapsing that into
  // "someone else edited the node" is LESSONS §64 rule ii: it trains the reader to ignore the
  // one report that means a real drift. The successor suite owns the deployment gate now
  // (`tests/offline/spec-answer-honesty/probe.js` D1b), so this arm names the successor
  // instead of guessing. Detected by SHAPE, not by a frozen sha, so it survives the next rev.
  else if (!/"free_terms"/.test(node.parameters.jsonBody)
           && /"spec_fallback":\s*true/.test(node.parameters.jsonBody)) {
    console.log(`  … B5  SUPERSEDED — the clone carries the spec-raw-text-migration body `
      + `(raw \`query\`, no \`free_terms\`; export versionId ${wf.versionId}). Shape-A's own `
      + `bytes are no longer deployed anywhere. The deployment gate for this leaf is `
      + `tests/offline/spec-answer-honesty/probe.js D1b. Not a pass and not a failure.`);
  }
  else no('B5', 'clone bytes match NEITHER the before, the built, nor the known successor body — someone else edited the node, or the export is stale. Re-run export --verify and re-freeze before trusting anything above.');
} catch (err) {
  no('B5', 'could not read the clone export', err.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (process.env.SA_SHOW_BODY === '1') console.log(`\n--- built jsonBody ---\n${AFTER}\n--- classifier ---\n${CLASSIFIER_SRC}`);
process.exit(fail > 0 ? 1 : 0);
