// ── promotion-team-collapse.test.js — ONE promotion team, not one per brand (block G5) ────────
//
// F-R4-3 (captain, 2026-08-18: "fix it now, we should do marketing_promotion"). CRM migration 371
// MERGED the brand-suffixed T1 rows. `marketing_promotion_sorento` is no longer a team the CRM can
// resolve - next-assignee(team_code='marketing_promotion_sorento') finds NOTHING - so a promotions
// escalation built on that name has nobody to go to, and the customer is asked to agree to it by
// name first ("would you like me to escalate to marketing_promotion_cabana team?").
//
// This was BROKEN ON LIVE, not a clone-only improvement. The live parser
// (export/sub-semantic-parser/nodes/output_exchange.js) already returns the collapsed
// `marketing_promotion` for the promotion domain AND normalises any LLM-emitted
// marketing_promotion_<brand> straight back down to it. The gate then overrode that with the
// brand-suffixed name, and all three live consumers PREFER the gate:
//   promo-picker._escTeam            (renders "escalate to ${_escTeam} team?")
//   escalate-catalog._ct
//   build-suggest-offer's `team`     (renders "escalate to ${team} team?")
// So one promotions turn could name two different teams for one pool. Collapsed at the source.
//
// The `_brands.length === 1` guard is kept VERBATIM: a mixed / unresolvable company set still
// yields null and the consumers still fall back to the parser's routing. Pinned below.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode, normalizeReturn, FIXTURES_ROOT } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const GATE = 'disallowed-entity-gate';
const src = loadNodes(SLUG, [`${GATE}.js`, 'build-suggest-offer.js']);

const fxDir = (node) => path.join(FIXTURES_ROOT, SLUG, node);
const loadFx = (node, name) => JSON.parse(fs.readFileSync(path.join(fxDir(node), `${name}.json`), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const items = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && x.json ? x : { json: x }));

const runGate = (fx) =>
  items(normalizeReturn(runNode({ body: src[`${GATE}.js`], fixture: fx, slug: SLUG, nodeName: GATE })));

// Every gate fixture on the promotion domain that resolves to exactly ONE brand. These are the
// turns where the field is populated at all; there is no fourth.
const ONE_BRAND_PROMOTION = [
  'hand-promotion-tier-denied',
  'hand-routing-brand-code-beats-company',
  'hand-routing-brand-name-beats-company',
];

for (const name of ONE_BRAND_PROMOTION) {
  test(`gate names the ONE promotion team, not a brand-suffixed one (${name})`, () => {
    const g = plain(runGate(loadFx(GATE, name))[0].json);
    assert.equal(g.company_team, 'marketing_promotion',
      'CRM migration 371 merged the brand-suffixed T1 rows; a marketing_promotion_<brand> team_code resolves to nobody');
    assert.doesNotMatch(String(g.company_team), /^marketing_promotion_/,
      'THE BUG: a team name the CRM cannot look up');
  });
}

test('the brand axis survives the collapse - it moves, it is not lost', () => {
  // The brand is still carried, on the axes built for it. Collapsing the TEAM name must not be a
  // way of quietly dropping which brand the turn was about.
  const g = plain(runGate(loadFx(GATE, 'hand-routing-brand-name-beats-company'))[0].json);
  assert.equal(g.company_team, 'marketing_promotion');
  assert.equal(g.resolved_company, 'cabana', 'the resolved brand is unchanged');
  assert.deepStrictEqual(g.resolved_companies, ['cabana']);
  assert.equal(g.routing_brand, 'cbn', 'the roster/assignment brand axis is unchanged');
  assert.equal(g.routing_brand_source, 'resolved');
});

test('the _brands.length === 1 guard is kept verbatim - a promotion turn with no single brand stays null', () => {
  // hand-allowed-row-promotion: promotion domain, nothing resolves to one brand. company_team must
  // remain null so every consumer falls through to the parser's own routing exactly as before.
  const g = plain(runGate(loadFx(GATE, 'hand-allowed-row-promotion'))[0].json);
  assert.equal(g.company_team, null,
    'the guard must not be widened by the collapse - null is what makes the consumers fall back');
});

test('a non-promotion domain still gets no company_team', () => {
  const g = plain(runGate(loadFx(GATE, 'hand-allowed-row-order'))[0].json);
  assert.equal(g.company_team, null);
});

// ── the customer actually reads this ──────────────────────────────────────────────────────────
// build-suggest-offer renders `escalate to ${team} team?` and prefers gate.company_team over the
// parser's routing, so the brand-suffixed name was not an internal detail: it was in the sentence
// the customer had to say yes to. Real exported live bodies, gate -> build-suggest-offer.
test('the escalate sentence names a team the CRM can resolve', () => {
  const gfx = loadFx(GATE, 'hand-routing-brand-name-beats-company');
  const gate = runGate(gfx);
  const bfx = loadFx('build-suggest-offer', 'HC-D1-code-mode-three-candidates');
  const out = normalizeReturn(runNode({
    body: src['build-suggest-offer.js'],
    fixture: {
      ctx: {
        ...bfx.ctx,
        'disallowed-entity-gate': gate,
        "Call 'sub-query-reformulator'": gfx.ctx["Call 'sub-query-reformulator'"],
      },
      input: bfx.input,
    },
    slug: SLUG,
    nodeName: 'build-suggest-offer',
  }));
  const text = String(plain(out[0].json).suggest_response || '');
  assert.match(text, /escalate to marketing_promotion team\?/,
    'the offer must name the collapsed team');
  assert.doesNotMatch(text, /marketing_promotion_(sorento|cabana|mocha)/,
    'THE BUG: asking the customer to agree to an escalation to a team that does not exist');
});
