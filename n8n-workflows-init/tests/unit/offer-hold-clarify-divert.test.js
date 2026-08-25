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
//   2. THE COMPANY AFFORDANCE MATCHES THE PARSER (C2/C5, FLIPPED for part 3). A fixture proves
//      the copy is byte-exact today. It does not say WHY that string is the string, so the next
//      person to "improve" it re-pins the fixture and ships the regression. The reason is
//      external: whatever reply the ask INVITES must be a reply the LIVE parser RESOLVES. While
//      the parser had no company_pick handler this test asserted "never say company" (a company
//      reply was Tier-4 junk - the ask re-printed forever). 2026-08-25 the deterministic handler
//      went LIVE (XTODTw @ 8717de6b) and part 3 restored the affordance, so the assertion flips
//      WITH it, deliberately, in the same commit as the copy change: the ask must now offer the
//      company exactly when the persisted pool gives the parser something to resolve, and every
//      invited name is cross-checked against the parser SOURCE (pool keying, filler/negator
//      strip) so copy and parser still move together, never by accident.
//   3. THE CASE B RE-PERSIST (compile-current-state). Its fixtures deep-equal a whole ~20-key
//      `variables` object. That passes just as green if the six offer fields happen to be right for
//      the wrong reason. Assert them AGAINST the fixture's own `get-session-vars`, which is the
//      actual contract: on an unresolved reply the open offer comes back verbatim.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

// ── 2. the company affordance is back, and every invited reply resolves in the live parser ────
// FLIPPED 2026-08-25 (company-pick part 3). This test used to assert the OPPOSITE - that no
// fixture's ask ever names a company - because the live parser had no company_pick handler and an
// invited company reply would have livelocked the customer (Tier-4 junk -> the same ask, forever).
// The deterministic handler is now LIVE (_coCompanyPick, sub-semantic-parser XTODTw @ 8717de6b),
// so part 3 restored the affordance and this assertion flips WITH the copy, in the same commit.
// The invariant is unchanged in spirit and now checked in BOTH directions against the parser
// SOURCE (export/sub-semantic-parser/nodes/output_exchange.js):
//   * pool has names  -> the ask MUST offer the company, the parenthetical MUST be exactly the
//     pool's bold names, and every invited name must resolve: it keys the parser's pool
//     (lowercased company_name, exactly one hit), and no word of it is eaten by the parser's
//     filler strip or refused by its negator rule.
//   * pool is empty   -> the ask MUST NOT offer a company: _coCompanyPick refuses every pick on
//     pool.size === 0, so a company invitation there is un-resolvable by construction.
const PARSER_EXCHANGE = path.resolve(__dirname, '../../export/sub-semantic-parser/nodes/output_exchange.js');

function parserContract() {
  const body = fs.readFileSync(PARSER_EXCHANGE, 'utf8');
  assert.ok(body.includes('function _coCompanyPick('),
    'the deterministic company resolver is gone from the live parser export - the copy may no ' +
    'longer invite a company reply (re-flip this test, strip the affordance)');
  // the parser pools from the SAME persisted state the reply node prints its names from
  assert.ok(body.includes('st.routing_roster_plan') && body.includes('st.routing_companies'),
    'the parser no longer pools from routing_roster_plan/routing_companies - the reply node and ' +
    'the parser have drifted onto different pools');
  assert.ok(/const nk = name\.toLowerCase\(\)\.trim\(\);/.test(body),
    'the parser no longer keys the pool on lowercased company_name - case-insensitive name ' +
    'resolution is what the copy relies on');
  const setOf = (name) => {
    const m = body.match(new RegExp(`const ${name} = new Set\\((\\[[^\\]]*\\])\\);`));
    assert.ok(m, `cannot find the ${name} literal in output_exchange.js`);
    return new Set(vm.runInNewContext(m[1]));
  };
  const am = body.match(/const _CO_ALIASES = (\{[^}]*\});/);
  assert.ok(am, 'cannot find the _CO_ALIASES literal in output_exchange.js');
  return { fillers: setOf('_coFillers'), negators: setOf('_coNegators'),
    aliases: vm.runInNewContext(`(${am[1]})`) };
}

function poolNamesOf(fixture) {
  // the same source, in the same precedence, as the reply node body reads
  const s = fixture.ctx['get-session-vars'][0].json;
  const prev = (s.session_vars && s.session_vars.variables) || s.variables || {};
  const pools = (Array.isArray(prev.routing_roster_plan) && prev.routing_roster_plan.length)
    ? prev.routing_roster_plan
    : (Array.isArray(prev.routing_companies) ? prev.routing_companies : []);
  return [...new Set(pools.map((p) => p && p.company_name).filter(Boolean))];
}

test('C2/C5 flipped: the ask offers the company, and every invited name resolves in the live parser', () => {
  const { fillers, negators } = parserContract();
  const tok = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9]/g, '');   // the parser's _coTok
  let withAffordance = 0;
  let withoutAffordance = 0;
  for (const node of PAIR) {
    const fixtures = loadFixtures(SLUG, node);
    assert.ok(fixtures.length >= 5, `${node} needs its contract cases, found ${fixtures.length}`);
    for (const { name, fixture } of fixtures) {
      const text = fixture.expected[0].json.clarify_text;
      assert.equal(typeof text, 'string', `${node}/${name}: no clarify_text`);
      assert.ok(!text.includes('—'), `${node}/${name}: em-dash in customer-facing copy (captain hard rule)`);
      assert.equal(fixture.expected[0].json.clarify_company, true, `${node}/${name}`);
      const names = poolNamesOf(fixture);
      if (names.length === 0) {
        assert.match(text, /reply a number or a name and/,
          `${node}/${name}: with an EMPTY pool the parser can resolve no company reply ` +
          `(_coCompanyPick: pool.size === 0), so the ask must degrade to number/name only`);
        assert.doesNotMatch(text, /company/i,
          `${node}/${name}: the ask invites a company on an empty pool - nothing the customer ` +
          `types can resolve it, they would be re-asked forever`);
        withoutAffordance += 1;
        continue;
      }
      const m = text.match(/reply a number, a name, or the company \(([^)]+)\) and I'll assign automatically\.$/);
      assert.ok(m, `${node}/${name}: the pool has names, so the ask must offer the company - got: ${text}`);
      const invited = m[1].split(' / ');
      assert.deepStrictEqual(invited, names.map((n) => `*${n}*`),
        `${node}/${name}: the parenthetical must be exactly the pool's bold names, in pool order ` +
        `- an invented or reordered name is a reply the parser may not resolve`);
      for (const b of invited) {
        assert.match(b, /^\*[^*]+\*$/, `${node}/${name}: "${b}" is not a single bold name`);
        const nm = b.slice(1, -1);
        // resolve check, against the parser's own pool keying: exactly ONE pool company may match
        const hits = names.filter((n) => n.toLowerCase().trim() === nm.toLowerCase().trim());
        assert.equal(hits.length, 1,
          `${node}/${name}: invited name "${nm}" keys ${hits.length} pool companies - the parser ` +
          `resolves only an exactly-one hit (hits.size === 1)`);
        for (const w of nm.split(/\s+/)) {
          assert.ok(!fillers.has(tok(w)),
            `${node}/${name}: "${w}" (in invited name "${nm}") is in the parser's _coFillers - ` +
            `the filler strip would eat it and the invited reply could not resolve`);
          assert.ok(!negators.has(tok(w)),
            `${node}/${name}: "${w}" (in invited name "${nm}") is in the parser's _coNegators - ` +
            `the negator rule would refuse the pick outright`);
          assert.match(tok(w), /[a-z0-9]/,
            `${node}/${name}: "${w}" has no [a-z0-9] to word-boundary match on`);
        }
      }
      withAffordance += 1;
    }
  }
  assert.equal(withAffordance, 8, 'four affordance cases mirrored onto both nodes');
  assert.equal(withoutAffordance, 2, 'the empty-pool degrade case mirrored onto both nodes');
});

// The claim above is only worth anything while the parser-vs-copy state is what we think it is.
// This test has flipped twice, each time by explicit order, never by re-pin:
//   - originally it asserted the parser exports NO company_pick handler (the copy's "never say
//     company" rule rested on that);
//   - 2026-08-25 (deterministic port) it asserted handler-exists + PROMPT-clean, and its own
//     message said a prompt ship "goes red again and must be re-argued, not re-pinned";
//   - 2026-08-25, later (CAPTAIN-ORDERED prompt promote): the fork's 602-line systemMessage
//     shipped to live BYTE-EXACT, so the LLM is now TAUGHT to emit company_pick (plan Stage 2 /
//     part 3's gate closes by that order). This is the re-argument the message demanded: the
//     semantic fallback is safe because BOTH producers are validated against the persisted pool
//     - the deterministic tier wins, and pickLlm accepts the LLM's name only after exactly-one
//     pool-match with no negator and no domain query, while C1 strips the raw key from every
//     non-arm path. parser-prompt-consumers.test.js pins the shipped prompt sha and the full
//     emitter/consumer table; the invited-reply cross-check above is unchanged.
test('the fact C2/C5 rests on, re-flipped: the prompt now teaches company_pick and both producers validate', () => {
  const dir = path.resolve(__dirname, '../../export/sub-semantic-parser/nodes');
  const hits = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('company_pick'));
  assert.deepStrictEqual(hits, ['output_exchange.js'],
    'company_pick must live in output_exchange.js and NOWHERE else in the parser code');
  const body = fs.readFileSync(path.join(dir, 'output_exchange.js'), 'utf8');
  assert.ok(body.includes('function _coCompanyPick('), 'the deterministic resolver is the handler');
  assert.ok(body.includes('any: pick || pickLlm'),
    'deterministic-wins precedence is gone - the LLM fallback may no longer outrank the deterministic tier');
  const wf = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../export/sub-semantic-parser/workflow.json'), 'utf8'));
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  assert.equal((agent.parameters.options.systemMessage.match(/company_pick/g) || []).length, 6,
    'the systemMessage\'s company_pick teaching moved (6 = the COMPANY-NAME REPLY section + the ' +
    'schema line, fork @ 5dc53753) - a prompt edit here must be re-argued and re-clone-tested, ' +
    'never re-pinned');
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
