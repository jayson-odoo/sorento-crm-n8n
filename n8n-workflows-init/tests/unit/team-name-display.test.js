// ── team-name-display.test.js - the customer never reads an internal team slug ────────────────
//
// Captain 2026-08-24, measured on real traffic. Every renderer of the escalation offer
// interpolated the routing team's INTERNAL SLUG straight into WhatsApp copy:
//
//     Would you like me to escalate to *Sorento* purchasing_certification team?
//
// This was already a live defect, not a new one - live emitted `escalate to
// marketing_promotion_sorento team` on 4 real turns in the 8 days before the fix. Underscores now
// render as spaces at the INTERPOLATION in each renderer.
//
// The three things these tests hold down, in the order they matter:
//
//   A. DISPLAY. Every renderer that names a team spells it with spaces, and no customer-visible
//      string carries an underscore in the team token. Multi-word teams are the only ones that can
//      go wrong (`warehouse` and `purchasing` cover 37 of 42 firings and are unchanged), so every
//      case here uses one.
//   B. PERSISTENCE / ROUTING IS UNTOUCHED. The RAW slug still reaches `variables.routing`, which is
//      what compile-current-state's `_sameTeam` carry compares on and what sub-human-intervention
//      routes on. A prettified value there would assign to a team the CRM cannot resolve - the same
//      class of bug promotion-team-collapse.test.js was written for. This is the assertion that
//      catches the transform being put at the derivation of a persisted value instead of at the
//      interpolation.
//   C. THE FROZEN PREFIX. `/would you like me to escalate/i` is a PREFIX contract, matched by
//      compile-current-state, crossdomain-compose and the parser's output_exchange. Everything this
//      change touches sits AFTER the prefix, so the prefix must be byte-identical in every rendered
//      string here.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadNodes, manifestOf } = require('../offline/node-source');
const { runNode, loadFixtures, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const FROZEN_PREFIX = 'Would you like me to escalate';
const PARSER_CONTRACT = /would you like me to escalate/i;

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

// The prefix has to be checked case-insensitively in one place and byte-exactly in another: the
// parser matches /would you like me to escalate/i, but build-suggest-offer renders the sentence
// mid-paragraph in lower case ("..., or would you like me to escalate to X team?"). Assert the
// contract regex on every string, and the capitalised byte-exact form only where the sentence
// starts one.
function assertPrefixIntact(text, where) {
  assert.match(text, PARSER_CONTRACT, `${where}: the parser's prefix regex no longer matches`);
  const at = text.indexOf(FROZEN_PREFIX);
  if (at !== -1) {
    assert.equal(text.slice(at, at + FROZEN_PREFIX.length), FROZEN_PREFIX,
      `${where}: the frozen prefix is not byte-exact`);
  }
}

// ── A + C. build-suggest-offer ────────────────────────────────────────────────────────────────
test('build-suggest-offer: a multi-word team renders with spaces, and the gate still outranks the parser', () => {
  const out = run('build-suggest-offer', fixtureNamed('build-suggest-offer', 'HC-team-multiword-display'));
  const text = String(out[0].json.suggest_response);

  assert.match(text, /escalate to purchasing certification team\?/,
    'the offer must name the team in words, not as the internal slug');
  assert.doesNotMatch(text, /purchasing_certification/,
    'THE DEFECT: the internal team slug is being read out to the customer');
  assert.doesNotMatch(text, /_/,
    'no underscore of any kind may appear in the offer sentence');
  // the fixture's parser routing says marketing_product; the gate says purchasing_certification.
  // Prettifying must not have collapsed the preference ladder into its fallback.
  assert.doesNotMatch(text, /marketing product/,
    "the gate's company_team must still outrank the parser's suggested_team");
  assertPrefixIntact(text, 'build-suggest-offer.suggest_response');
});

// ── A + C. not-found-error-message ────────────────────────────────────────────────────────────
test('not-found-error-message: a multi-word team renders with spaces', () => {
  const out = run('not-found-error-message', fixtureNamed('not-found-error-message', 'HC-team-multiword-display'));
  const text = String(out[0].json.escalate_message);

  assert.match(text, /escalate to purchasing certification team\?/,
    'the miss sentence must name the team in words, not as the internal slug');
  assert.doesNotMatch(text, /purchasing_certification/,
    'THE DEFECT: the internal team slug is being read out to the customer');
  assertPrefixIntact(text, 'not-found-error-message.escalate_message');
});

// ── A + B + C. compile-current-state, Piece 1's plain arm ─────────────────────────────────────
test("compile-current-state Case A': the appended sentence is prettified in BOTH copies while routing keeps the raw slug", () => {
  const fixture = fixtureNamed('compile-current-state', 'miss-case-a-prime-plain-multiword-team');
  const j = run('compile-current-state', fixture)[0].json;

  const phrase = 'Would you like me to escalate to *Sorento* purchasing certification team?';
  assert.ok(phrase.startsWith(FROZEN_PREFIX), 'the phrase itself no longer starts with the frozen prefix');

  // A: the same prettified sentence in the visible reply AND in the persisted copy the parser reads.
  // Both, not one: the customer text and `variables.response` are the two ends of the same contract,
  // and a fix applied to only one of them would let the next turn's parser see a string the customer
  // never saw.
  for (const [where, text] of [['user_response', j.user_response], ['variables.response', j.variables.response]]) {
    assert.ok(text.endsWith(`\n\n${phrase}`), `${where}: the appended sentence is not the expected copy`);
    assert.doesNotMatch(text.slice(text.indexOf(FROZEN_PREFIX)), /_/,
      `${where}: an underscore survives inside the escalate sentence`);
    assertPrefixIntact(text, where);
  }

  // B: THE ONE THAT CATCHES THE TRANSFORM BEING APPLIED TOO EARLY.
  // `variables.routing` is persisted verbatim from the parser and is what the next turn's
  // `_sameTeam` carry compares on and what the escalation actually routes to. It must still be the
  // raw, CRM-resolvable slug.
  assert.equal(j.variables.routing.suggested_team, 'purchasing_certification',
    'the persisted routing team must stay the RAW slug - a prettified one resolves to no CRM team');
  assert.equal(fixture.ctx['build-miss-member-offer'][0].json.miss_roster_plan[0].team,
    'purchasing_certification', 'the plan the phrase is derived FROM must not have been mutated');

  // ...and the persisted pool identity carries no prettified team either. NOTE, for whoever reads
  // this next: `routing_roster_plan` has never carried `team` at all - compile-current-state's
  // mapping projects only plan_idx / company_id / company_name / brand_code, dropping the plan
  // item's `team`. That is pre-existing behaviour, unchanged here; asserting the key is ABSENT is
  // the honest form of "no prettified team was persisted", and it will go red if a later change
  // starts persisting one.
  const plan = j.variables.routing_roster_plan;
  assert.equal(plan.length, 1);
  assert.ok(!('team' in plan[0]),
    'routing_roster_plan gained a team key - if it is now persisted it must carry the RAW slug');
  assert.doesNotMatch(JSON.stringify(plan), /purchasing certification/,
    'a prettified team reached the persisted roster plan');
});

// ── A, across the whole slug ──────────────────────────────────────────────────────────────────
// The four renderers above are not the only ones: escalate-catalog, promo-picker and
// build-cs-member-offer name a team too, and promo-picker's own default is
// `marketing_promotion_sorento` - the exact slug live was measured emitting. A source-level sweep
// is what keeps a NEW renderer from reintroducing the defect, since a new one would have no
// fixture here to catch it.
test('no renderer interpolates a team into customer copy without prettifying it', () => {
  const NAMES = ['build-suggest-offer', 'not-found-error-message', 'compile-current-state',
    'escalate-catalog', 'promo-picker', 'build-cs-member-offer'];
  for (const nodeName of NAMES) {
    const src = bodyOf(nodeName);
    // strip comments; several of these bodies discuss the slug form in prose
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
      .replace(/([^:'"`\\])\/\/.*$/gm, '$1');
    assert.match(code, /_prettyTeam|escalate to customer service team/,
      `${nodeName}: names a team in customer copy but has no display prettifier`);
    // a hard-coded slug literal inside a customer sentence is the other way this regressed
    assert.doesNotMatch(code, /escalate to [a-z]+_[a-z_]+ team/,
      `${nodeName}: a hard-coded team SLUG is embedded in customer copy`);
  }
});

// ── C, at the source ──────────────────────────────────────────────────────────────────────────
// The prefix is frozen because two nodes and the parser match on it. Nothing in this change may
// reword it, so pin the literal in every body that writes it.
test('the frozen escalate prefix is unchanged in every body that writes it', () => {
  for (const nodeName of ['compile-current-state', 'crossdomain-compose', 'escalate-catalog',
    'promo-picker', 'build-cs-member-offer', 'not-found-error-message', 'build-suggest-offer']) {
    const src = bodyOf(nodeName);
    assert.match(src, PARSER_CONTRACT, `${nodeName}: no longer writes the frozen prefix at all`);
  }
  // compile-current-state's own reader of the contract, and the company-label rewrite that runs on
  // build-suggest-offer's text. The rewrite has to span a MULTI-WORD team now: the old `\S+ team\?`
  // could not cross the space, so it silently matched nothing and dropped the company label.
  const ccs = bodyOf('compile-current-state');
  assert.match(ccs, /\/would you like me to escalate\/i\.test\(userResponse\)/,
    'compile-current-state no longer tests the frozen prefix');
  const rewrite = ccs.match(/\/\(would you like me to escalate to \)\(([^/]+)\)\/i/);
  assert.ok(rewrite, 'the company-label rewrite regex is gone or reshaped');
  const re = new RegExp(`(would you like me to escalate to )(${rewrite[1]})`, 'i');
  assert.match('or would you like me to escalate to purchasing certification team?', re,
    'the company-label rewrite cannot span a multi-word team - the company label would be dropped');
  assert.doesNotMatch('or would you like me to escalate to *Sorento* purchasing certification team?', re,
    'the company-label rewrite is no longer idempotent - it would insert a second company label');
});
