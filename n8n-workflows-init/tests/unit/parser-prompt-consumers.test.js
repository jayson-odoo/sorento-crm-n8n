// ── parser-prompt-consumers.test.js — every field the prompt teaches has a consumer ───────────
//
// 2026-08-25, captain-ordered: the live parser (sub-semantic-parser, XTODTw) took the fork's
// (wI5RkNGW3EOJfBdo @ 5dc53753) `AI Agent` systemMessage BYTE-EXACT — the 602-line prompt the
// clone tested all day, buckets a/b/c/d1/d2/d3 of plans/company-pick-parser.md §3 included, no
// hand-assembled variant. A prompt is an EMITTER spec: it teaches the LLM to produce fields. A
// taught field with no consumer alters downstream behaviour silently (the C1 lesson), and a
// consumer without its emitter is dead weight that rots. This file pins BOTH directions, bucket
// by bucket, against the deployed artifacts in export/ — the same bytes deploy.py ships.
//
// HONESTY: a prompt cannot be fixture-proven. What IS proven here and in the fixture suites:
// the shipped bytes are the clone-tested artifact (sha pin below), every taught emission has a
// deterministic consumer (this file), and the deterministic arms keep their fixture coverage
// (_all-nodes + company-pick-deterministic + date-widen + llm-broaden-fallback). What only live
// traffic can verify: classification drift on ordinary turns from the +118-line prompt
// (company-pick-parser.md §8.1 — the 96%-control stratum).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPORT_ROOT = path.resolve(__dirname, '../../export');
const PARSER = 'sub-semantic-parser';
const SPINE = 'live-spine-sorento-consume-main';
const RESULTS = 'sub-get-results';

// The shipped prompt: the fork's live systemMessage, re-fetched 2026-08-25 (fork @ 5dc53753,
// versionId unchanged since the 03:23Z bucket-b edit), 602 lines, promoted byte-exact.
const PROMPT_SHA256 = '83f7b8d6cbef04325ef394acf3eaeab7248a51170a8b02d42047787497be491b';
const PROMPT_LINES = 602;

function promptOf() {
  const wf = JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, PARSER, 'workflow.json'), 'utf8'));
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  assert.ok(agent, 'the parser export lost its AI Agent node');
  return { wf, sm: agent.parameters.options.systemMessage };
}
const bodyOf = (slug, file) => fs.readFileSync(path.join(EXPORT_ROOT, slug, 'nodes', file), 'utf8');

// ── the artifact pin ──────────────────────────────────────────────────────────────────────────
test('the shipped systemMessage is the clone-tested fork prompt, byte-exact', () => {
  const { sm } = promptOf();
  assert.equal(crypto.createHash('sha256').update(sm, 'utf8').digest('hex'), PROMPT_SHA256,
    'the systemMessage is not the reviewed 602-line fork artifact — a prompt edit must be ' +
    're-argued (and re-clone-tested), never re-pinned');
  assert.equal(sm.split('\n').length, PROMPT_LINES);
  assert.ok(sm.startsWith('='), 'the prompt is an n8n expression — the leading "=" is load-bearing');
});

// F519 renders on EVERY turn: a bad node reference in the embedded expression is a total parser
// outage, not a misclassification (company-pick-parser.md §4 hunk P1). Pin both halves.
test('the F519 pool expression references a node the parser workflow actually has', () => {
  const { wf, sm } = promptOf();
  assert.ok(sm.includes("$('When Executed by Another Workflow').first().json.previous_conversation_state"),
    'the embedded pool expression changed its node reference — re-verify it renders');
  assert.ok(wf.nodes.some((n) => n.name === 'When Executed by Another Workflow'),
    'the trigger node was renamed — the F519 expression now throws on every turn');
});

// ── bucket (a): escalation.company_pick ───────────────────────────────────────────────────────
test('(a) company_pick: taught by the prompt, consumed by C1 + pickLlm + escalation-context', () => {
  const { sm } = promptOf();
  assert.equal((sm.match(/company_pick/g) || []).length, 6, 'the COMPANY-NAME REPLY section moved');
  assert.ok(sm.includes('== COMPANY-NAME REPLY ON AN ESCALATION OFFER =='));
  const oe = bodyOf(PARSER, 'output_exchange.js');
  // the SAFETY consumer: the raw LLM key never survives a non-arm path
  assert.ok(/'company_pick' in output\.output\.escalation\) delete output\.output\.escalation\.company_pick/.test(oe),
    'the C1 strip is gone — an unvalidated LLM pick would ride every non-arm path');
  // the VALIDATED consumer: pickLlm reads the frozen snapshot, deterministic wins
  assert.ok(oe.includes('_parser_raw_snapshot.escalation.company_pick'),
    'pickLlm no longer reads the frozen snapshot — the taught emission has lost its validated consumer');
  assert.ok(oe.includes('any: pick || pickLlm'), 'deterministic-wins precedence changed');
  // the spine consumer (part 1): cpickRow in escalation-context
  assert.ok(bodyOf(SPINE, 'escalation-context.js').includes('company_pick'),
    'escalation-context lost its cpick consumer — the prompt now teaches an emission nothing routes');
});

// ── bucket (b): requested_attributes ["quantity"] ─────────────────────────────────────────────
test('(b) requested_attributes: threaded generically — no parser consumer, by design', () => {
  const { sm } = promptOf();
  assert.ok(sm.includes('requested_attributes ["quantity"]'), 'the take/buy rule moved');
  assert.ok(!bodyOf(PARSER, 'output_exchange.js').includes('requested_attributes'),
    'output_exchange grew a requested_attributes consumer — that is a new behaviour to review, ' +
    'the contract today is verbatim passthrough');
  const call = JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, SPINE, 'workflow.json'), 'utf8'))
    .nodes.find((n) => n.name === "Call 'sub-get-results'");
  assert.ok(JSON.stringify(call.parameters).includes('requested_attributes: parser.requested_attributes ?? []'),
    'the spine no longer threads requested_attributes into semantic_input');
  assert.ok(bodyOf(RESULTS, 'output-structurer.js').includes('_si1.requested_attributes'),
    'output-structurer lost its generic requested_attributes read');
});

// ── bucket (c): bare-entity continuation — existing fields, existing executor ────────────────
test('(c) BARE ENTITY CONTINUATION: emits only existing fields; the entity-op executor consumes them', () => {
  const { sm } = promptOf();
  assert.ok(sm.includes('== BARE ENTITY CONTINUATION =='));
  const oe = bodyOf(PARSER, 'output_exchange.js');
  for (const arm of ["case 'reuse':", "case 'replace_combine':", "case 'clear':"]) {
    assert.ok(oe.includes(arm), `the executor lost its ${arm} arm — bucket (c) emissions land there`);
  }
});

// ── bucket (d1): the escalate word → request_for_help → the spine's If2 ───────────────────────
test('(d1) ESCALATE-WORD: taught whole (the F541 cross-reference is valid), consumed by If2', () => {
  const { sm } = promptOf();
  assert.ok(sm.includes('ESCALATE-WORD:'), 'the AFFIRMATION/ESCALATE-WORD section is gone');
  assert.ok(sm.includes('AFFIRMATION/ESCALATE-WORD'),
    'the COMPANY-NAME REPLY bullet cross-references AFFIRMATION/ESCALATE-WORD — with d1 shipped ' +
    'whole this pointer is valid; if d1 is ever pulled, the bullet dangles (plan §3.1)');
  assert.ok(sm.includes('whether or not an escalation was offered before'),
    'the rule that makes a bare "escalate" open the lane with NO offer pending — the new assign ' +
    'path — is gone; the escalate-word-bare-no-offer fixture pins its parser half');
  const if2 = JSON.parse(fs.readFileSync(path.join(EXPORT_ROOT, SPINE, 'workflow.json'), 'utf8'))
    .nodes.find((n) => n.name === 'If2');
  const conds = JSON.stringify(if2.parameters);
  assert.ok(conds.includes('message_type == \\"request_for_help\\"') || conds.includes('message_type == "request_for_help"'),
    'If2 no longer keys on request_for_help — the taught escalate word has no lane');
});

// ── bucket (d2): customer-vs-supplier delivery — existing fields, existing maps ───────────────
test('(d2) GOODS GOING OUT / COMING IN: emits order|incoming, both domains have axis maps', () => {
  const { sm } = promptOf();
  assert.ok(sm.includes('GOODS GOING OUT') && sm.includes('GOODS COMING IN'));
  const oe = bodyOf(PARSER, 'output_exchange.js');
  assert.ok(/order: \{\n?\s*order: 'order_scope'/.test(oe) && oe.includes('incoming_scope'),
    'the AXIS_BY_DOMAIN order/incoming maps moved — the d2 classifications land on them');
});

// ── bucket (d3): broaden_axis — the four ported consumers ─────────────────────────────────────
test('(d3) broaden_axis: taught by BROADEN AXIS, consumed by restore + date arm + isBroaden + final drop', () => {
  const { sm } = promptOf();
  assert.ok(sm.includes('== BROADEN AXIS ==') && sm.includes('"broaden_axis"'));
  const oe = bodyOf(PARSER, 'output_exchange.js');
  assert.ok(oe.includes('broaden_axis_domain_restored'), 'consumer 1 (AXIS BROADEN restore) is gone');
  assert.ok(oe.includes("=== 'date'"), 'consumer 2 (the date force-open) is gone');
  assert.ok(oe.includes("output.output.scope_intent === 'broaden' && (!_baRaw || _baRaw === 'all')"),
    'consumer 3 (the isBroaden single-axis narrowing) is gone — "all time" becomes "all orders"');
  assert.ok(oe.includes('broaden_axis_dropped'), 'consumer 4 (the final-pass drop) is gone');
  // the rebase seam, pinned: live drops by HINT, not by the fork's axis lookup — see the block's
  // comment and llm-broaden-fallback.test.js. If someone restores _ceAxisFor there without first
  // shipping the customer_scope axis split, "all products" wipes the customer again.
  const drop = oe.slice(oe.indexOf('AXIS BROADEN, FINAL PASS'));
  assert.ok(drop.includes(".toLowerCase() !== _ba"), 'the final drop is no longer hint-equality');
  assert.ok(!drop.includes('_ceAxisFor(e, _dom)'),
    'the final drop went back to axis-equality — on live\'s lumped order_scope that drops the ' +
    'customer with the product (exec 13728314); only valid after the axis split ships');
});

// ── what must NOT have moved with the prompt ──────────────────────────────────────────────────
test('suggest-follow-up kept live\'s unicode-dash normalizer (the fork is BEHIND here)', () => {
  const sha = crypto.createHash('sha256').update(bodyOf(PARSER, 'suggest-follow-up.js'), 'utf8').digest('hex');
  assert.equal(sha, '338ea668d463815a1afbaddadfffcb2779f184d6e4e398b40d6f02485659cbcb',
    'suggest-follow-up changed in the prompt promote — the plan (company-pick-parser.md §6) says ' +
    'any sync from the fork DELETES the tested dash normalizer; this was scoped systemMessage-only');
});

test('the AI Agent carries only promptType/text/options.systemMessage — nothing else rode along', () => {
  const { wf } = promptOf();
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  assert.deepStrictEqual(Object.keys(agent.parameters).sort(), ['options', 'promptType', 'text']);
  assert.deepStrictEqual(Object.keys(agent.parameters.options), ['systemMessage'],
    'a second option appeared on the AI Agent — the promote was scoped to systemMessage only');
});
