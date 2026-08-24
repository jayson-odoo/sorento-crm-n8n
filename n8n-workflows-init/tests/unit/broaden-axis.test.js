// ── broaden-axis.test.js — widening ONE axis must survive to the end of the node ──────────────
//
// The captain asked for two behaviours during testing: "all time" (drop the date window) and
// "all products" (drop the product filter, keep the customer). broaden_axis implements both, and
// the diagnostics prove the logic itself runs — exec 13636691 came back
//   broaden_axis: 'product', broaden_axis_dropped: 1, broaden_axis_domain_restored: true
// yet the FINAL entities still contained srtwc286 with current_message:true, so the answer stayed
// scoped to that product. Something downstream re-attached it after the drop.
//
// output_exchange has ~47 sites that assign domain_hint/entities/intent_hint (SIMPLIFY-spine-audit).
// The drop was one of them, positioned right after the entity-op executor; a later writer won.
// This test asserts the OBSERVABLE contract - what the node finally emits - rather than the
// diagnostic, which is exactly the gap that let a "working" feature ship broken.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode, loadFixtures } = require('../harness/n8n-shim');

const SLUG = 'sub-semantic-parser-FORK';
const NODE = 'output_exchange';

test('"all products" drops the product axis and keeps the customer', () => {
  const body = loadNodes(SLUG, ['output_exchange.js'])['output_exchange.js'];
  const entry = loadFixtures(SLUG, NODE).find(f => f.name.includes('broaden-axis-all-products'));
  assert.ok(entry, 'fixture broaden-axis-all-products must exist');
  const o = runNode({ body, fixture: entry.fixture, slug: SLUG, nodeName: NODE })[0].json.output;

  assert.equal(o.broaden_axis, 'product');
  assert.equal(o.domain_hint, 'order', 'naming a KIND of thing is not a domain switch');

  const ents = Array.isArray(o.entities) ? o.entities : [];
  const hints = ents.map(e => String(e.hint || '').toLowerCase());
  assert.ok(!hints.includes('product'), `the product filter must be gone, got ${JSON.stringify(ents)}`);
  assert.ok(hints.includes('customer'), 'the customer the user is still asking about must remain');
});

// A bare product code after a customer pick must KEEP that customer (exec 13687305 / fork
// 13687312). The LLM guessed domain 'master_products' for the naked code while the conversation was
// in 'order'; the scope-carry policy correctly cleared the carried scope on what looked like a
// domain change, and the answer came back for a completely different customer - DILOOMA SDN BHD.
// Clearing scope on a domain change is RIGHT (captain, 2026-08-24) - the defect was that the domain
// changed at all. The carry now happens before anything reads domain_hint, so this asserts the
// scope-clear never fires here rather than that it was told to stand down.
test('a bare code after a pick keeps the pinned customer', () => {
  const body = loadNodes(SLUG, ['output_exchange.js'])['output_exchange.js'];
  const entry = loadFixtures(SLUG, NODE).find(f => f.name.includes('bare-code-keeps-pinned-customer'));
  assert.ok(entry, 'fixture bare-code-keeps-pinned-customer must exist');
  const o = runNode({ body, fixture: entry.fixture, slug: SLUG, nodeName: NODE })[0].json.output;

  assert.equal(o.domain_hint, 'order', 'the naked code does not move the conversation');
  const hints = (o.entities || []).map(e => String(e.hint || '').toLowerCase());
  assert.ok(hints.includes('product'), 'the code the user typed must be there');
  assert.ok(hints.includes('customer'), `the picked customer must survive, got ${JSON.stringify(o.entities)}`);
  assert.ok(!o.scope_cleared_on_domain_change, 'a domain change that gets undone is not a domain change');
});
