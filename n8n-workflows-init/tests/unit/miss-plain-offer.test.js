// ── miss-plain-offer.test.js — the invariants the PLAIN miss offer ships on ───────────────────
//
// Stage B set 4, piece 1. The lane is `central-exchange -> miss-roster-gate -> miss-roster-plan ->
// build-miss-member-offer -> dym-transform-partial`, and `compile-current-state`'s Case A' renders
// it. The per-node fixtures under tests/fixtures/nodes/ already deep-equal each node's whole
// output; what they cannot say out loud is WHICH properties of that output are load-bearing and
// why. These tests name them, so a future edit that breaks one fails with the reason attached
// rather than as an anonymous deep-equal diff.
//
// Four claims, in the order they matter:
//   A. The MEMBERS arm cannot fire. `miss_member_offer` is the flag compile-current-state's Case A
//      keys on, and Case A is the only `last_result_set` CONCATENATION on live — it can renumber a
//      picker and send a later numeric reply to the wrong row. No LANE row says members:true, and
//      even if one did, $input on this wiring carries plan items rather than http rosters.
//   B. The multi-company close ("reply with the company name") cannot be emitted. The live parser
//      has no `company_pick` arm, so a customer told to reply with a company name would not be
//      understood.
//   C. compile-current-state's Case A' appends the FROZEN phrase, byte-exact, to BOTH the visible
//      reply and `variables.response` (the parser reads the persisted copy), leaves
//      `selection_context` null, and leaves `last_result_set` exactly as the no-offer turn had it.
//   D. Nothing customer-visible on this lane contains a U+2014 em dash.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes, manifestOf } = require('../offline/node-source');
const { runNode, loadFixtures, normalizeReturn, FIXTURES_ROOT } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const EXPORT_ROOT = path.resolve(__dirname, '../../export');

function bodyOf(nodeName) {
  const man = manifestOf(SLUG);
  const file = man.nodes[nodeName].file;
  return loadNodes(SLUG, [file])[file];
}

function fixtureNamed(nodeName, name) {
  const f = loadFixtures(SLUG, nodeName).find((x) => x.name === name);
  assert.ok(f, `missing fixture ${nodeName}/${name}`);
  return f.fixture;
}

function run(nodeName, fixture) {
  const out = runNode({ body: bodyOf(nodeName), fixture, slug: SLUG, nodeName });
  return JSON.parse(JSON.stringify(normalizeReturn(out)));
}

// ── A. the members arm is unreachable ────────────────────────────────────────────────────────
// A1 is the SOURCE-level statement: the allowlist itself says members:false everywhere, in both
// copies of it (the Code node and the If node's expression), which is what makes A2 hold for every
// tool rather than just the ones a fixture happens to name.
test('A1: every LANE row says members:false, in miss-roster-plan AND in the miss-roster-gate expression', () => {
  const wf = JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, SLUG, 'workflow.json'), 'utf8'));
  const gate = wf.nodes.find((n) => n.name === 'miss-roster-gate');
  assert.ok(gate, 'miss-roster-gate is not in the export');
  const copies = {
    'miss-roster-plan.js': bodyOf('miss-roster-plan'),
    'miss-roster-gate expression': gate.parameters.conditions.conditions[0].leftValue,
  };
  for (const [where, src] of Object.entries(copies)) {
    // the LANE object literal itself, not the prose around it (both bodies discuss members:true in
    // their header comments, which is exactly the sort of false positive that trains people to
    // loosen an assertion until it stops meaning anything)
    const start = src.indexOf('const LANE = {');
    assert.notEqual(start, -1, `${where}: no LANE table found`);
    const end = src.indexOf('\n  };', start);
    assert.notEqual(end, -1, `${where}: LANE table is not closed the way this scan expects`);
    const table = src.slice(start, end);
    const rows = table.match(/^\s*'crm_[a-z_]+':.*$/gm) || [];
    assert.equal(rows.length, 11, `${where}: expected the 11-row stamp_lookup_companies allowlist, got ${rows.length}`);
    for (const row of rows) {
      assert.match(row, /members: false\b/, `${where}: a LANE row still enables the members arm: ${row.trim()}`);
    }
    assert.doesNotMatch(table, /members:\s*true/, `${where}: members:true appears inside the LANE table`);
  }
});

// A2/B: behavioural, on the wiring that actually ships. Both the ordinary plain plan and a plan
// item that (hypothetically) asked for members produce an output with neither flag.
test('A2 + B: build-miss-member-offer never emits miss_member_offer or the company-name close', () => {
  for (const name of ['plain-arm-single', 'zero-plan-passthrough', 'members-true-still-passes-through']) {
    const out = run('build-miss-member-offer', fixtureNamed('build-miss-member-offer', name));
    assert.equal(out.length, 1, `${name}: expected exactly one item`);
    const j = out[0].json;
    assert.equal(j.miss_member_offer, undefined, `${name}: miss_member_offer is set — Case A's last_result_set concatenation becomes reachable`);
    assert.equal(j.miss_member_rows, undefined, `${name}: miss_member_rows is set`);
    assert.equal(j.miss_offer_text, undefined, `${name}: miss_offer_text is set`);
    assert.doesNotMatch(JSON.stringify(j), /reply with the company name/i,
      `${name}: the multi-company close reached the output — the live parser has no company_pick arm to honour it`);
  }
});

// A3: the plan can never hand build-miss-member-offer a members:true item in the first place, and
// can never hand it more than one company either (the single-miss cap — a multi-entry
// routing_roster_plan is what escalation-context turns into an ungated round-robin assign).
test('A3: miss-roster-plan emits exactly one item, members:false, on every fixture', () => {
  const fixtures = loadFixtures(SLUG, 'miss-roster-plan');
  assert.ok(fixtures.length >= 5, `expected the plan node's fixture set, got ${fixtures.length}`);
  for (const { name, fixture } of fixtures) {
    const out = run('miss-roster-plan', fixture);
    assert.equal(out.length, 1, `${name}: the lane needs exactly one item (zero starves it, >1 is a multi-company plan)`);
    assert.equal(out[0].json.members, false, `${name}: members must be false`);
  }
});

// ── C. compile-current-state's Case A' ───────────────────────────────────────────────────────
const FROZEN_PREFIX = 'Would you like me to escalate';
const PARSER_CONTRACT = /would you like me to escalate/i;

test("C: Case A' appends the frozen phrase to both copies, leaves selection_context null and last_result_set untouched", () => {
  const fixture = fixtureNamed('compile-current-state', 'miss-case-a-prime-plain');
  const withOffer = run('compile-current-state', fixture)[0].json;

  // The baseline is the SAME turn with build-miss-member-offer never having run — i.e. the reply
  // this customer gets today, before this promote. Everything the miss arm is allowed to change is
  // the difference between the two.
  const baseFixture = JSON.parse(JSON.stringify(fixture));
  delete baseFixture.ctx['build-miss-member-offer'];
  baseFixture.input = [{ json: fixture.ctx['central-exchange'][0].json }];
  const baseline = run('compile-current-state', baseFixture)[0].json;

  const phrase = 'Would you like me to escalate to *Sorento* purchasing team?';
  assert.ok(phrase.startsWith(FROZEN_PREFIX), 'the phrase itself no longer starts with the frozen prefix');

  // appended to the visible reply, and to the persisted copy the parser reads
  assert.equal(withOffer.user_response, `${baseline.user_response}\n\n${phrase}`);
  assert.equal(withOffer.variables.response, `${baseline.variables.response}\n\n${phrase}`);
  for (const [where, text] of [['user_response', withOffer.user_response], ['variables.response', withOffer.variables.response]]) {
    assert.match(text, PARSER_CONTRACT, `${where}: the parser's prefix regex no longer matches`);
    const at = text.indexOf(FROZEN_PREFIX);
    assert.notEqual(at, -1, `${where}: the frozen prefix is not byte-exact`);
    assert.equal(text.slice(at, at + phrase.length), phrase, `${where}: the phrase is not byte-exact`);
  }

  // no picker was shown, so the parser's member-pick arm must stay shut
  assert.equal(withOffer.variables.selection_context, null);
  assert.equal(baseline.variables.selection_context, null);

  // Case A's concatenation is the thing that must not have happened
  assert.deepStrictEqual(withOffer.variables.last_result_set, baseline.variables.last_result_set);

  // ... while the pool identity IS persisted, single-entry, so a bare "yes" routes to one company
  assert.deepStrictEqual(withOffer.variables.routing_roster_plan, [{
    plan_idx: 0,
    company_id: '00000000-0000-0000-0000-000000000001',
    company_name: 'Sorento',
    brand_code: 'sorento',
  }]);
  assert.equal(withOffer.variables.routing_company, '00000000-0000-0000-0000-000000000001');

  // the lane's own control keys ride on the input item; none of them may be persisted
  for (const k of ['miss_plain_offer', 'miss_roster_plan', 'miss_member_offer']) {
    assert.equal(withOffer.variables[k], undefined, `${k} leaked into variables (save-session-vars PUTs the whole item)`);
  }
});

// ── D. copy ──────────────────────────────────────────────────────────────────────────────────
test('D: no U+2014 in any string literal the miss lane can put in front of a customer', () => {
  for (const nodeName of ['miss-roster-plan', 'build-miss-member-offer']) {
    // strip line comments and block comments, then look at what is left
    const code = bodyOf(nodeName)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
      .replace(/([^:'"`\\])\/\/.*$/gm, '$1');
    assert.doesNotMatch(code, /—/, `${nodeName}: em dash in code (not a comment)`);
  }
  for (const nodeName of ['build-miss-member-offer', 'compile-current-state']) {
    for (const { name, fixture } of loadFixtures(SLUG, nodeName)) {
      const rendered = JSON.stringify(fixture.expected);
      if (!PARSER_CONTRACT.test(rendered) && !/Please choose who to route to/.test(rendered)) continue;
      assert.doesNotMatch(rendered, /—/, `${nodeName}/${name}: em dash in customer-visible expected output`);
    }
  }
});

// ── the fixture files this test leans on are the ones the coverage gate sees ──────────────────
test('the miss lane fixtures live where the generic driver will find them', () => {
  for (const nodeName of ['miss-roster-plan', 'build-miss-member-offer']) {
    assert.ok(fs.existsSync(path.join(FIXTURES_ROOT, SLUG, nodeName)), `no fixture dir for ${nodeName}`);
  }
});
