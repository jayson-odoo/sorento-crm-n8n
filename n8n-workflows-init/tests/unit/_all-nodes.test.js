// ── _all-nodes.test.js — generic driver: every Code node x every fixture ──────────────────────
//
// Step 1 (part A) of plans/test-pyramid-and-git-deploy.md. For each tracked slug, lists its Code
// nodes straight from export/<slug>/MANIFEST.json (the same node-name -> file-name map
// export-workflows.py itself writes — see scripts/export-workflows.py's `manifest["nodes"][n["name"]]
// = {file: ...}`), loads each body sha-verified via node-source.js, and runs every fixture under
// tests/fixtures/nodes/<slug>/<node>/*.json through the shim.
//
// A node with ZERO fixtures is not a failure (fixture capture is step 2 of the plan) — it is a
// `todo` test named `NO FIXTURE: <slug>/<node>`, so it shows up in `node --test` output and in the
// summary table below, without turning the suite red. `coverage gate` is the switch the plan turns
// on at step 2 (`REQUIRE_FULL_COVERAGE=1`); off by default here.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes, manifestOf } = require('../offline/node-source');
const { runNode, loadFixtures, assertOutputEquals, FIXTURES_ROOT } = require('../harness/n8n-shim');
const { buildWiring, diffWiring, WIRING_PATH } = require('../harness/pin-wiring');

const SLUGS = ['live-spine-sorento-consume-main', 'sub-semantic-parser'];
const REQUIRE_FULL_COVERAGE = process.env.REQUIRE_FULL_COVERAGE === '1';

const summaryRows = [];      // {slug, node, fixtures, pass, fail, runData, bodyRun}
const noFixtureNodes = [];   // 'slug/node' strings

for (const slug of SLUGS) {
  const man = manifestOf(slug);
  const nodeNames = Object.keys(man.nodes).sort();

  for (const nodeName of nodeNames) {
    const file = man.nodes[nodeName].file;
    const fixtures = loadFixtures(slug, nodeName);
    // S6 (reviewer, legibility): "N fixtures" reads as "N independent assertions" unless it's
    // clear how many actually came from a REAL execution's runData vs. from running the body
    // once and freezing whatever it returned ("body-run" — includes hand-authored ones). Split
    // by each fixture's own `source.expected_from` (added by capture-fixtures.py / backfilled
    // onto pre-existing fixtures) so the summary table says which is which.
    const ef = (f) => (f.fixture.source && f.fixture.source.expected_from) || null;
    const runData = fixtures.filter((f) => ef(f) === 'runData').length;
    // 'reasoned' is a THIRD provenance, added with the mutation harness (tests/harness/mutate.js,
    // tests/MUTATION-BASELINE.md): the fixture's decision fields were worked out from the node's
    // contract BEFORE the body was run, and the run only confirmed them. That is a stronger claim
    // than 'body-run' (body executed once, whatever it returned frozen) and a different one from
    // 'runData' (a real execution said so), so it gets its own column rather than being folded
    // into either — the split is the whole point of this table.
    const reasoned = fixtures.filter((f) => ef(f) === 'reasoned').length;
    const bodyRun = fixtures.length - runData - reasoned;
    const row = { slug, node: nodeName, fixtures: fixtures.length, pass: 0, fail: 0, runData, reasoned, bodyRun };
    summaryRows.push(row);

    if (fixtures.length === 0) {
      const deadMarker = path.join(FIXTURES_ROOT, slug, nodeName, '.dead');
      if (fs.existsSync(deadMarker)) {
        const reason = fs.readFileSync(deadMarker, 'utf8').trim();
        test.skip(`DEAD: ${nodeName} — ${reason}`, () => {});
        continue;
      }
      noFixtureNodes.push(`${slug}/${nodeName}`);
      test(`NO FIXTURE: ${slug}/${nodeName}`, { todo: true }, () => {});
      continue;
    }

    test(`${slug}/${nodeName}`, async (t) => {
      const src = loadNodes(slug, [file]);
      const body = src[file];
      for (const { name, fixture } of fixtures) {
        await t.test(name, () => {
          // C1: slug + nodeName so the shim resolves this node's DEPLOYED execution mode
          // (runOnceForAllItems / runOnceForEachItem) from export/<slug>/workflow.json.
          const out = runNode({ body, fixture, slug, nodeName });
          try {
            assertOutputEquals(out, fixture.expected);
            row.pass += 1;
          } catch (e) {
            row.fail += 1;
            throw e;
          }
        });
      }
    });
  }
}

// S2 (reviewer, highest value): what SHIPS is workflow.json; only a Code node's jsCode body is
// exercised by anything above this test. A Code node's execution `mode`
// (runOnceForEachItem/runOnceForAllItems), an executeWorkflow node's `workflowId.value` (which
// sub-workflow it actually calls — how a node gets repointed at a REAL-EGRESS sub, safety-
// critical), credentials, typeVersion, and every other non-jsCode parameter can change with zero
// test noticing — proven with real experiments (flip a Code node's mode; repoint an
// executeWorkflow node's workflowId.value) both shipping GREEN before this test existed. Rebuilds
// the wiring fresh from export/<slug>/workflow.json (tests/harness/pin-wiring.js — the SAME
// function the `pin-wiring.js --write` generator uses, so the test and the generator can never
// define "the wiring" differently) and deep-equals it against the committed
// tests/fixtures/wiring.json, failing with a readable per-node/per-field diff.
test('S2: non-jsCode workflow wiring matches the committed pin (tests/fixtures/wiring.json)', () => {
  const fresh = buildWiring();
  const committedRaw = fs.readFileSync(WIRING_PATH, 'utf8');
  const committed = JSON.parse(committedRaw);
  const diff = diffWiring(committed, fresh);
  assert.deepStrictEqual(
    diff,
    [],
    `wiring.json is STALE vs export/ (${diff.length} field(s) changed) — if this change was ` +
    `deliberate, re-pin it: node n8n-workflows-init/tests/harness/pin-wiring.js --write\n  ` +
    diff.join('\n  ')
  );
});

test('coverage gate', () => {
  if (!REQUIRE_FULL_COVERAGE) return; // off by default -- plan step 2 turns this on
  assert.deepStrictEqual(
    noFixtureNodes,
    [],
    `REQUIRE_FULL_COVERAGE=1: ${noFixtureNodes.length} node(s) have zero fixtures:\n  ` +
    noFixtureNodes.join('\n  ')
  );
});

// S6: every fixture must carry a real `source.expected_from` — an unrecognised value would be
// counted in NO column of the summary split (`bodyRun` is computed by subtraction), so it would
// vanish from the very table that tells a reader how much each number is worth. Assert the
// classification directly rather than relying on that subtraction.
test('S6: every fixture has a valid source.expected_from ("runData", "reasoned" or "body-run")', () => {
  for (const slug of SLUGS) {
    const man = manifestOf(slug);
    for (const nodeName of Object.keys(man.nodes)) {
      for (const { name, fixture } of loadFixtures(slug, nodeName)) {
        const ef = fixture.source && fixture.source.expected_from;
        assert.ok(
          ef === 'runData' || ef === 'reasoned' || ef === 'body-run',
          `${slug}/${nodeName}/${name}: source.expected_from must be "runData", "reasoned" or "body-run", got ${JSON.stringify(ef)}`
        );
      }
    }
  }
});

test('summary table', () => {
  const nameW = Math.max(4, ...summaryRows.map((r) => `${r.slug}/${r.node}`.length));
  console.log('\nnode fixture summary (' + path.basename(__filename) + ')');
  console.log('node'.padEnd(nameW) + '  fixtures  runData  reasoned  body-run  pass  fail');
  for (const r of summaryRows) {
    console.log(
      `${r.slug}/${r.node}`.padEnd(nameW) + '  ' +
      String(r.fixtures).padEnd(8) + '  ' +
      String(r.runData).padEnd(7) + '  ' +
      String(r.reasoned).padEnd(8) + '  ' +
      String(r.bodyRun).padEnd(8) + '  ' +
      String(r.pass).padEnd(4) + '  ' +
      String(r.fail)
    );
  }
  const covered = summaryRows.filter((r) => r.fixtures > 0).length;
  const totalRunData = summaryRows.reduce((n, r) => n + r.runData, 0);
  const totalReasoned = summaryRows.reduce((n, r) => n + r.reasoned, 0);
  const totalBodyRun = summaryRows.reduce((n, r) => n + r.bodyRun, 0);
  console.log(`\n${covered}/${summaryRows.length} nodes have >=1 fixture; ${noFixtureNodes.length} have none (REQUIRE_FULL_COVERAGE=${REQUIRE_FULL_COVERAGE ? '1' : '0'})`);
  console.log(`${summaryRows.reduce((n, r) => n + r.fixtures, 0)} fixtures total: ${totalRunData} from real runData, ` +
    `${totalReasoned} reasoned (expected derived from the node's contract first, then confirmed against the body), ` +
    `${totalBodyRun} body-run (body executed once and frozen) — ` +
    `"N fixtures" is NOT "N independent assertions" until you know this split.`);
});
