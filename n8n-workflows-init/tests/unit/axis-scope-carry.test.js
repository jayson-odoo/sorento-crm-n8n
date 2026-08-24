// ── axis-scope-carry.test.js — a turn changes only the axis it names ──────────────────────────
//
// The captain's governing rule (2026-08-24): a delivery-order search filters on independent axes
// (customer, product, date, order number). Naming a value replaces THAT axis and leaves the others
// standing. "only X" restricts the axis X sits on, it does not wipe every axis.
//
// Two real turns on the order domain broke this:
//   exec 13707105 "only wc286" after a customer+date-window turn -> customer AND the date window
//     both vanished; the answer came back for every customer.
//   exec 13707173 "only mastile klang" after a product turn -> the product vanished; the answer
//     came back for every product the customer ever ordered.
// Both are the SAME bug: the `scope_exclusive === true` branch of the entity-op executor wiped
// `keptPrior` to `[]` regardless of which axis the turn named, instead of evicting only the axes
// the turn actually touched (which is exactly what the non-exclusive branch already did).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'sub-semantic-parser-FORK';
const NODE = 'output_exchange';

const BASE_PREV = {
  routing: { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' },
  ideation: null,
  response: 'Previous turn (order): returned 5 records',
  dym_offer: null,
  user_goal: 'trying to view an order',
  escalation: { is_escalation_confirmation: false },
  match_mode: 'and',
  domain_hint: 'order',
  intent_hint: 'check_order',
  message_type: 'business_query',
  query_brands: [],
  access_levels: [],
  picker_domain: 'order',
  routing_brand: 'sorento',
  contains_flyer: false,
  dym_candidates: [],
  last_result_set: [],
  picker_families: {},
  routing_company: '00000000-0000-0000-0000-000000000001',
  routing_companies: [],
  selection_context: null,
  routing_roster_plan: null,
  routing_brand_source: 'resolved',
  picker_last_result_set: [],
};

const BASE_PARSER_OUTPUT = {
  message_type: 'business_query',
  intent_hint: 'check_order',
  domain_hint: 'order',
  scope_intent: null,
  is_affirmative: null,
  user_goal: 'trying to restrict one filter',
  access_levels: [],
  broaden_axis: null,
  date_mode: null,
  date_filter_start: null,
  date_filter_end: null,
  match_mode: 'and',
  demand_qty: null,
  entities: [],
  entity_op: 'replace_combine',
  scope_exclusive: false,
  requested_attributes: [],
  contains_flyer: false,
  reference_positions: [],
  reference_target: null,
  person_mention: null,
  is_active: null,
  order_status: null,
  correction: false,
  routing: { suggested_team: null, suggested_agent: null },
  escalation: { is_escalation_confirmation: false },
};

const CUSTOMER = { raw: 'MASTILE KLANG SDN BHD', hint: 'customer', uuid: '11111111-1111-1111-1111-111111111111', canonical_code: 'DBR-001', current_message: true };
const PRODUCT = { raw: 'WC286', hint: 'product', canonical_code: 'WC286', current_message: true };

function makeFixture({ userMsg, prevEntities, prevDates = {}, curEntities, entityOp = 'replace_combine', scopeExclusive = false, broadenAxis = null, curDates = {} }) {
  return {
    ctx: {
      'When Executed by Another Workflow': [{
        json: {
          latest_user_message: userMsg,
          contact_id: '900000001',
          previous_conversation_state: {
            ...BASE_PREV,
            entities: prevEntities,
            date_filter_start: prevDates.start ?? null,
            date_filter_end: prevDates.end ?? null,
            date_mode: prevDates.mode ?? null,
          },
          is_test: true,
        },
      }],
    },
    input: [{
      json: {
        // A STRING here, not an object: output_exchange.js's object branch expects $json.output
        // to already be shaped {output: {...}} (a pre-shaped bypass payload); the plain parser
        // fields, exactly like every real captured fixture, arrive as the raw LLM JSON string and
        // go through the parse-and-unwrap branch that lands them at output.output.
        output: JSON.stringify({
          ...BASE_PARSER_OUTPUT,
          entities: curEntities,
          entity_op: entityOp,
          scope_exclusive: scopeExclusive,
          broaden_axis: broadenAxis,
          date_filter_start: curDates.start ?? null,
          date_filter_end: curDates.end ?? null,
          date_mode: curDates.mode ?? null,
        }),
      },
    }],
  };
}

function run(fixture) {
  const body = loadNodes(SLUG, ['output_exchange.js'])['output_exchange.js'];
  return runNode({ body, fixture, slug: SLUG, nodeName: NODE })[0].json.output;
}

// exec 13707105, part 1: "only wc286" after "delivery order for mastile klang in august".
test('an exclusive turn naming a product keeps the prior customer (exec 13707105)', () => {
  const fixture = makeFixture({
    userMsg: 'only wc286',
    prevEntities: [CUSTOMER],
    prevDates: { start: '2026-08-01', end: '2026-08-31', mode: 'range' },
    curEntities: [PRODUCT],
    scopeExclusive: true,
  });
  const o = run(fixture);
  const hints = (o.entities || []).map(e => String(e.hint || '').toLowerCase());
  assert.ok(hints.includes('product'), `the product the user named must be there, got ${JSON.stringify(o.entities)}`);
  assert.ok(hints.includes('customer'), `an exclusive turn restricts the axis it names, not every axis, got ${JSON.stringify(o.entities)}`);
});

// exec 13707173: "only mastile klang" after a product-scoped turn.
test('an exclusive turn naming a customer keeps the prior product (exec 13707173)', () => {
  const fixture = makeFixture({
    userMsg: 'only mastile klang',
    prevEntities: [PRODUCT],
    curEntities: [CUSTOMER],
    scopeExclusive: true,
  });
  const o = run(fixture);
  const hints = (o.entities || []).map(e => String(e.hint || '').toLowerCase());
  assert.ok(hints.includes('customer'), `the customer the user named must be there, got ${JSON.stringify(o.entities)}`);
  assert.ok(hints.includes('product'), `an exclusive turn restricts the axis it names, not every axis, got ${JSON.stringify(o.entities)}`);
});

// exec 13707105, part 2: the same turn also dropped the 01/08-31/08 date window it never mentioned.
test('a replace_combine turn naming a product keeps a prior date window (exec 13707105)', () => {
  const fixture = makeFixture({
    userMsg: 'only wc286',
    prevEntities: [CUSTOMER],
    prevDates: { start: '2026-08-01', end: '2026-08-31', mode: 'range' },
    curEntities: [PRODUCT],
    scopeExclusive: true,
  });
  const o = run(fixture);
  assert.equal(o.date_filter_start, '2026-08-01', 'a turn that names no date must not silently drop the window');
  assert.equal(o.date_filter_end, '2026-08-31');
  assert.equal(o.date_mode, 'range');
});

// Must not regress: an explicit "all dates" / broaden_axis:'date' still clears the window, on a
// replace_combine turn same as it always has on reuse.
test('broaden_axis "date" still clears the window on a replace_combine turn', () => {
  const fixture = makeFixture({
    userMsg: 'all dates',
    prevEntities: [PRODUCT],
    prevDates: { start: '2026-08-01', end: '2026-08-31', mode: 'range' },
    curEntities: [],
    broadenAxis: 'date',
  });
  const o = run(fixture);
  assert.equal(o.date_filter_start, null, 'an explicit widen must still clear the window');
  assert.equal(o.date_filter_end, null);
  assert.equal(o.date_mode, null);
});
