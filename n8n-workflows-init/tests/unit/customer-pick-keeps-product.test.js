// ── customer-pick-keeps-product.test.js — a customer pick narrows WHO, not WHAT ───────────────
//
// Live defect, spine execs 13880902 -> 13880933. Turn 1 "delivery to customer chin chun, product
// WESERP10B" -> customer ambiguous -> picker; the session persisted BOTH entities (product
// WESERP10B, canonical_code WESERP10B) plus a 3-row customer last_result_set under
// selection_context 'disambiguation'. Turn 2 "1": the LLM emitted entity_op 'reuse', entities [],
// reference_positions [1]; the REFERENCE POSITIONS -> ENTITIES block did
// `output.output.entities = [...resolved]`, replacing the whole set with the picked customer —
// the product was stripped and the answer covered ALL products.
//
// The fork's (C) block — "A CUSTOMER PICK NARROWS *WHO*, NOT *WHAT* (captain, 2026-08-20)", built
// for the identical exec 13214595 — re-attaches every prior NON-customer entity after a customer
// positional pick, exactly as (B) re-attaches attachment_type. It was never ported in the
// 2026-08-25 prompt promote. This suite guards the port into the LIVE parser export
// (sub-semantic-parser, NOT the fork): red on the pre-port body, green after.
//
// tests/unit/_all-nodes.test.js deep-equals the fixture's full expected already; this file
// re-asserts the LOAD-BEARING decision fields by name (the same fixture-vs-property split as
// company-pick-deterministic.test.js), so a fixture re-pin cannot silently flip the contract.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parserCase } = require('./_parser-case');

const SLUG = 'sub-semantic-parser';   // the LIVE parser export — the fork already has the block
const FIXTURE = 'customer-pick-keeps-product';

const PICKED_UUID = '060f4eaf-88ca-486a-a203-b0b61eeb9cd8';

test('the picked customer is resolved from the frozen row (uuid + debtor code carried)', () => {
  const o = parserCase(SLUG, FIXTURE);
  const picked = (o.entities || []).find(
    (e) => e && String(e.hint || '').toLowerCase() === 'customer' && e.ordinal !== undefined,
  );
  assert.ok(picked, 'position 1 must resolve to a customer entity');
  assert.equal(picked.uuid, PICKED_UUID, 'the pick carries the frozen row uuid');
  assert.equal(picked.canonical_code, '300-C043', 'the pick carries the frozen row debtor code');
});

test('the product the question was ABOUT survives the customer pick (execs 13880902/13880933)', () => {
  const o = parserCase(SLUG, FIXTURE);
  const product = (o.entities || []).find(
    (e) => e && String(e.hint || '').toLowerCase() === 'product',
  );
  assert.ok(
    product,
    'the prior product entity must be re-attached after a customer positional pick — ' +
    'without it the answer covers EVERY product for the picked customer',
  );
  assert.equal(product.canonical_code, 'WESERP10B');
  assert.equal(product.current_message, true, '(C) re-attaches with current_message true, like (B)');
});

test('the stale raw customer is NOT retained alongside the pick — exactly one customer entity', () => {
  const o = parserCase(SLUG, FIXTURE);
  const customers = (o.entities || []).filter(
    (e) => e && String(e.hint || '').toLowerCase() === 'customer',
  );
  assert.equal(
    customers.length, 1,
    'replacing the ambiguous "customer chin chun" IS the point of the pick — it must not ride along',
  );
  assert.equal(customers[0].uuid, PICKED_UUID);
});

test("match_mode stays 'and' — one position picked, and the re-attached product must AND with it", () => {
  const o = parserCase(SLUG, FIXTURE);
  assert.equal(o.match_mode, 'and');
  assert.equal(o.positions_resolved, 1);
});
