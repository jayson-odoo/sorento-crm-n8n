// ── offer-hold-clarify-divert.test.js — the three claims the generic driver cannot make ───────
//
// tests/unit/_all-nodes.test.js runs every fixture through its node and deep-equals the output. It
// is the right shape for "this body still computes what it computed", and the wrong shape for three
// claims Stage B sets 1+2 depend on, each of which is about something OUTSIDE a single fixture:
//
//   1. ONE BODY, TWO NODES. `offer-hold-reply` and `clarify-company-reply` are deployed with the
//      same source. Nothing enforced that before this file: the clone carried a comment saying
//      "ONE body deployed to BOTH nodes" and two independently-editable copies underneath it. The
//      two lanes must say the same thing to the customer, so drift here is a real bug, and the
//      mirrored fixtures under both nodes would happily go green on two DIFFERENT bodies.
//   2. NO COMPANY AFFORDANCE (C2/C5). A fixture proves the copy is byte-exact today. It does not
//      say WHY that string is the string, so the next person to "improve" it re-pins the fixture
//      and ships the regression. The reason WAS external: the live parser had no company_pick
//      handler, so a company-name reply came back as Tier-4 junk. 2026-08-25 (company-pick plan,
//      scope deterministic): the parser export now carries the handler (_coCompanyPick in
//      output_exchange.js) - but the copy STILL must not offer a company until part 3 ships the
//      new ask deliberately, in one commit with this assertion's retirement. Until then the
//      property stands: copy and parser move together, never by accident.
//   3. THE CASE B RE-PERSIST (compile-current-state). Its fixtures deep-equal a whole ~20-key
//      `variables` object. That passes just as green if the six offer fields happen to be right for
//      the wrong reason. Assert them AGAINST the fixture's own `get-session-vars`, which is the
//      actual contract: on an unresolved reply the open offer comes back verbatim.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { loadFixtures, FIXTURES_ROOT } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const PAIR = ['offer-hold-reply', 'clarify-company-reply'];

// ── 1. one body, two nodes ────────────────────────────────────────────────────────────────────
test('offer-hold-reply and clarify-company-reply are byte-identical', () => {
  const src = loadNodes(SLUG, PAIR.map((n) => `${n}.js`));
  const [a, b] = PAIR.map((n) => src[`${n}.js`]);
  assert.equal(a, b,
    'these two nodes are ONE body deployed twice: the bare-"yes" divert (clarify-company-reply) and ' +
    'the unresolved-reply hold (offer-hold-reply) must hand the customer the same ask. If they need ' +
    'to differ, that is a design change - do not let them drift into it silently.');
});

test('the two nodes carry the same jsCode in workflow.json, not just the same file', () => {
  const wf = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../export', SLUG, 'workflow.json'), 'utf8'));
  const [a, b] = PAIR.map((n) => wf.nodes.find((x) => x.name === n));
  for (const [name, node] of PAIR.map((n, i) => [n, [a, b][i]])) {
    assert.ok(node, `${name} is not in workflow.json`);
    assert.equal(node.type, 'n8n-nodes-base.code');
    assert.equal(node.typeVersion, 2);
    assert.equal((node.parameters || {}).mode ?? 'runOnceForAllItems', 'runOnceForAllItems');
  }
  assert.equal(a.parameters.jsCode, b.parameters.jsCode);
});

// ── 2. no company affordance, and no em-dash, in anything the customer reads ──────────────────
test('C2/C5: no reply fixture offers a company the live parser cannot parse', () => {
  let checked = 0;
  for (const node of PAIR) {
    const fixtures = loadFixtures(SLUG, node);
    assert.ok(fixtures.length >= 5, `${node} needs its contract cases, found ${fixtures.length}`);
    for (const { name, fixture } of fixtures) {
      const text = fixture.expected[0].json.clarify_text;
      assert.equal(typeof text, 'string', `${node}/${name}: no clarify_text`);
      assert.doesNotMatch(text, /company/i,
        `${node}/${name}: the ask names "company". The parser half (deterministic _coCompanyPick) ` +
        `is in the export now, but offering a company in the ask is part 3's move: it ships the new ` +
        `copy AND retires this assertion in the same commit, after the parser half is PROMOTED. An ` +
        `ask that offers a company before the deployed parser can parse one re-prints itself forever.`);
      assert.match(text, /reply a number or a name/,
        `${node}/${name}: both upstream gates require an OPEN member picker, so a number or a name ` +
        `is what always resolves - the ask has to offer exactly that`);
      assert.ok(!text.includes('—'), `${node}/${name}: em-dash in customer-facing copy (captain hard rule)`);
      assert.equal(fixture.expected[0].json.clarify_company, true, `${node}/${name}`);
      checked += 1;
    }
  }
  assert.equal(checked, 10, 'five contract cases mirrored onto both nodes');
});

// The claim above is only worth anything while the parser-vs-copy state is what we think it is.
// This test used to assert the parser exports NO company_pick handler - the fact the copy's
// "never say company" rule rested on. 2026-08-25 the deterministic handler shipped into the export
// (plans/company-pick-parser.md, scope deterministic), so the test now asserts the NEW true
// contract instead: the handler exists, it is code-only (_coCompanyPick in output_exchange.js),
// and the PROMPT is still clean - the LLM was never taught to emit company_pick, so the only
// producer is the deterministic tier validating against the persisted pool. If the prompt half
// (plan Stage 2) ever ships, this goes red again and must be re-argued, not re-pinned.
test('the fact C2/C5 rests on, updated: the handler is deterministic-only and the prompt is untouched', () => {
  const dir = path.resolve(__dirname, '../../export/sub-semantic-parser/nodes');
  const hits = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('company_pick'));
  assert.deepStrictEqual(hits, ['output_exchange.js'],
    'company_pick must live in output_exchange.js and NOWHERE else in the parser export');
  const body = fs.readFileSync(path.join(dir, 'output_exchange.js'), 'utf8');
  assert.ok(body.includes('function _coCompanyPick('), 'the deterministic resolver is the handler');
  const wf = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../export/sub-semantic-parser/workflow.json'), 'utf8'));
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  assert.equal((agent.parameters.options.systemMessage.match(/company_pick/g) || []).length, 0,
    'the systemMessage now teaches company_pick - that is the plan\'s Stage 2 (scope: parser), ' +
    'a separate measured change, not something to ride in with a code edit');
});

// ── 3. the Case B re-persist, asserted against the session it claims to restore ───────────────
const SIX = ['response', 'last_result_set', 'selection_context',
  'routing_roster_plan', 'routing_company', 'routing_companies'];

for (const fxName of ['case-b-clarify-repersist', 'case-b-offer-hold-repersist']) {
  test(`compile-current-state/${fxName}: the open offer comes back verbatim`, () => {
    const fx = JSON.parse(fs.readFileSync(
      path.join(FIXTURES_ROOT, SLUG, 'compile-current-state', `${fxName}.json`), 'utf8'));
    const prev = fx.ctx['get-session-vars'][0].json.session_vars.variables;
    const out = fx.expected[0].json;

    const replyNode = fxName.includes('clarify') ? 'clarify-company-reply' : 'offer-hold-reply';
    const clarifyText = fx.ctx[replyNode][0].json.clarify_text;
    assert.equal(out.user_response, clarifyText,
      'the customer must SEE the clarify ask. Without this the clarify lane suppresses the ' +
      'assignment and composes nothing, i.e. the customer says "yes" and gets silence.');

    for (const k of SIX) {
      assert.deepStrictEqual(out.variables[k], prev[k],
        `variables.${k} must be re-persisted verbatim from get-session-vars: the reply did not ` +
        `resolve the offer, so the offer has to survive to the next turn intact`);
    }
    assert.match(out.variables.response, /would you like me to escalate/i,
      'the frozen prefix the parser\'s confirmation arm keys on must survive too');
    assert.equal(out.variables.selection_context, 'member_offer',
      'and the picker stays open, so a number or a name still resolves next turn');
  });
}
