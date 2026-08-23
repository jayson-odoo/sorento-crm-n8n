// ── objective2-bare-code-carry.test.js — RED TEST, defines "done" for the bare-code objective ──
//
// OBJECTIVE (captain): after a business turn, a message that is ONLY a product code continues the
// SAME question about a new value. "check stock for A" then "B" must answer STOCK for B.
//
// STATUS: currently FAILING on purpose. This test is the specification; the fix comes after.
//
// Measured, three real turns:
//   exec 13629756 / fork 13629764 — bare code -> domain_hint null       -> clarify lane
//   exec 13631366 / fork 13631374 — bare code -> domain_hint 'incoming' -> ETA answer, not stock
//   exec 13626771                 — bare code -> domain_hint 'order'    -> correct, by luck
//
// MECHANISM (fork 13631374, captured below): the LLM typed the naked code as
// hint 'inbound_shipment' and emitted intent_hint 'check_incoming'. `_DECISIVE_INTENTS` contains
// check_incoming, so `_explicit` was TRUE, and by design an explicit intent means "current domain
// is decisive, no carry" — the entity-bearing continuity block never engaged
// (domain_inherited_compatible and domain_inherit_blocked are both null in the captured output).
//
// WHY PROMPT TUNING CANNOT FIX IT: for a bare token there is no linguistic evidence for ANY hint
// or intent — the model is guessing from the code's shape. Asking it to be reliably uncertain is
// not a thing one can prompt for. The fix must be deterministic: when the current message reduces
// to entity value(s) with no purpose word, a "decisive" intent inferred from that token alone is
// not decisive, so `_explicit` must be false and the prior domain must carry.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode, loadFixtures } = require('../harness/n8n-shim');

const SLUG = 'sub-semantic-parser-FORK';
const NODE = 'output_exchange';

test('bare product code after a stock turn stays in the stock domain', () => {
  const src = loadNodes(SLUG, ['output_exchange.js']);
  const body = src['output_exchange.js'];
  const entry = loadFixtures(SLUG, NODE).find(f => f.name.includes('obj2-bare-code-loses-domain'));
  assert.ok(entry, 'fixture obj2-bare-code-loses-domain must exist');
  const fixture = entry.fixture;

  const out = runNode({ body, fixture, slug: SLUG, nodeName: NODE });
  const o = out[0].json.output;

  const prev = (fixture.ctx['When Executed by Another Workflow'] || [{}])[0].json || {};
  const prevDomain = (prev.previous_conversation_state || {}).domain_hint;

  assert.equal(
    o.domain_hint, prevDomain,
    `a bare entity value must continue the previous domain (${prevDomain}), got '${o.domain_hint}'`,
  );
  assert.notEqual(o.domain_hint, 'incoming', 'a bare product code must not be read as a shipment enquiry');
});
