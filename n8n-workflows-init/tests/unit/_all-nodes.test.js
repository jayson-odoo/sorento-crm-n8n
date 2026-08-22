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

const SLUGS = ['live-spine-sorento-consume-main', 'sub-semantic-parser'];
const REQUIRE_FULL_COVERAGE = process.env.REQUIRE_FULL_COVERAGE === '1';

const summaryRows = [];      // {slug, node, fixtures, pass, fail}
const noFixtureNodes = [];   // 'slug/node' strings

for (const slug of SLUGS) {
  const man = manifestOf(slug);
  const nodeNames = Object.keys(man.nodes).sort();

  for (const nodeName of nodeNames) {
    const file = man.nodes[nodeName].file;
    const fixtures = loadFixtures(slug, nodeName);
    const row = { slug, node: nodeName, fixtures: fixtures.length, pass: 0, fail: 0 };
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
          const out = runNode({ body, fixture });
          try {
            assertOutputEquals(out, fixture.expected, fixture.volatile || []);
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

test('coverage gate', () => {
  if (!REQUIRE_FULL_COVERAGE) return; // off by default -- plan step 2 turns this on
  assert.deepStrictEqual(
    noFixtureNodes,
    [],
    `REQUIRE_FULL_COVERAGE=1: ${noFixtureNodes.length} node(s) have zero fixtures:\n  ` +
    noFixtureNodes.join('\n  ')
  );
});

test('summary table', () => {
  const nameW = Math.max(4, ...summaryRows.map((r) => `${r.slug}/${r.node}`.length));
  console.log('\nnode fixture summary (' + path.basename(__filename) + ')');
  console.log('node'.padEnd(nameW) + '  fixtures  pass  fail');
  for (const r of summaryRows) {
    console.log(
      `${r.slug}/${r.node}`.padEnd(nameW) + '  ' +
      String(r.fixtures).padEnd(8) + '  ' +
      String(r.pass).padEnd(4) + '  ' +
      String(r.fail)
    );
  }
  const covered = summaryRows.filter((r) => r.fixtures > 0).length;
  console.log(`\n${covered}/${summaryRows.length} nodes have >=1 fixture; ${noFixtureNodes.length} have none (REQUIRE_FULL_COVERAGE=${REQUIRE_FULL_COVERAGE ? '1' : '0'})`);
});
