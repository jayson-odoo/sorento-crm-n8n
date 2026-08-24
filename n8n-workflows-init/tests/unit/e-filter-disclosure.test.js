// ── e-filter-disclosure.test.js — say which three filters produced this answer ────────────────
//
// Plan cases E1/E2/E4. A delivery-order search filters on customer, product and date, and until
// now only the date was ever stated - and only on the happy path. That is what sent the captain
// hunting: "1 order" gave no way to tell whether a filter was narrowing it (exec 13602037, where
// no date filter had been applied at all), and an empty result gave no clue WHICH dimension to
// widen. A dimension with no filter must say "all ..." rather than vanish: a line that appears
// only sometimes is one people stop reading.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadNodes } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const SLUG = 'clone-sorento-consume-main-TEST';
const CASES = path.resolve(__dirname, '../fixtures/cases');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CASES, f), 'utf8'));
const run = (node, file) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: load(file), slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('E1/E4: an answer names all three dimensions, and an unset one reads as "all"', () => {
  const o = run('compile-current-state', 'pick-must-keep-missed-product--compile-current-state.json');
  const msg = String(o.user_response || '');
  assert.match(msg, /^Customer: .+/m, 'the customer filter is stated');
  assert.match(msg, /^Product: .+/m, 'the product filter is stated');
  assert.match(msg, /^Dates: .+/m, 'the date filter is stated');
  assert.match(msg, /Dates: all dates/, 'no window set reads as "all dates", not a missing line');
});

const runMut = (node, file, mutate) => {
  const fx = load(file);
  mutate(fx);
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

// exec 13706881, message "2" (picking one delivery order off a numbered list): the parser
// emitted a single {raw:"202608-3719", hint:"order"} entity and the gate scoped the search to
// that ONE order (compatible_entities = [{entity_type:'customer_order', ...}]) - an axis the
// old block, which only ever read Customer/Product off the parser's hints, could not see at
// all. It printed "Customer: all customers / Product: all products / Dates: all dates" - i.e.
// claimed nothing was filtered while everything was pinned to one order.
test('BUG exec 13706881: a search scoped to one order must say so, not just "all customers / all products"', () => {
  const o = runMut('compile-current-state', 'pick-must-keep-missed-product--compile-current-state.json', (fx) => {
    for (const item of fx.ctx['disallowed-entity-gate'] || []) {
      item.json.compatible_entities = [
        { entity_type: 'customer_order', code: '202608-3719', uuid: 'ord-13706881-0001' },
      ];
    }
    for (const item of fx.ctx['resolve-entity'] || []) item.json.resolutions = [];
    for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) {
      item.json.output.entities = [
        { raw: '202608-3719', hint: 'order', current_message: true },
      ];
    }
  });
  const msg = String(o.user_response || '');
  assert.match(msg, /^Order: 202608-3719$/m, 'the order the search was actually scoped to must be named');
  assert.match(msg, /^Customer: all customers$/m, 'no customer was in scope, and that much of the old line was true');
  assert.match(msg, /^Product: all products$/m, 'no product was in scope, and that much of the old line was true');
});

// exec 13707523 (reproduced fresh as 13708143), message "mastile klang srtwc286": the parser
// hinted the bare code as {raw:"srtwc286", hint:"order"} - a defensible read when the domain is
// order - but the RESOLVER matched it as 10 products and the gate's compatible_entities held
// product:10 (+ customer:9). The CRM was queried with those product ids, so the search was
// right; the old block, driven off the parser's hint instead of the gate's scope, printed
// "Product: all products" - a straight lie about what the customer just got.
test('BUG exec 13707523/13708143: a code the resolver matched to products must be named as Product, not "all products"', () => {
  const o = runMut('compile-current-state', 'pick-must-keep-missed-product--compile-current-state.json', (fx) => {
    for (const item of fx.ctx['disallowed-entity-gate'] || []) {
      item.json.compatible_entities = [
        { entity_type: 'product', code: 'SRTWC286-SH-200', uuid: 'prod-srtwc286-0001' },
        { entity_type: 'product', code: 'SRTWC286-SH-P', uuid: 'prod-srtwc286-0002' },
        { entity_type: 'customer', code: '300-D059', uuid: 'cust-srtwc286-0001' },
        { entity_type: 'customer', code: '300-D060', uuid: 'cust-srtwc286-0002' },
      ];
    }
    for (const item of fx.ctx['resolve-entity'] || []) {
      item.json.resolutions = [{
        token: 'srtwc286',
        resolved: false,
        ambiguous: true,
        matches: [
          { entity_type: 'product', canonical_code: 'SRTWC286-SH-200', uuid: 'prod-srtwc286-0001' },
          { entity_type: 'product', canonical_code: 'SRTWC286-SH-P', uuid: 'prod-srtwc286-0002' },
        ],
      }];
    }
    for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) {
      item.json.output.entities = [
        { raw: 'srtwc286', hint: 'order', current_message: true },
      ];
    }
  });
  const msg = String(o.user_response || '');
  assert.match(msg, /^Product: srtwc286$/m, 'the product line must name the code the customer typed, not vanish behind "all products"');
  assert.doesNotMatch(msg, /^Product: all products$/m, 'the CRM was queried with 2 real products - the header must not claim none were used');
  assert.doesNotMatch(msg, /^Order: /m, 'no order axis was ever put in scope - the parser\'s hint must not manufacture one');
});

test('E2: an EMPTY result states the date scope too - that is when it matters most', () => {
  const o = run('not-found-error-message', 'obj1-not-found-error-message.json');
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /Dates: /, 'a miss must say what date scope it searched');
});

// Plan case D4. Clearing all three filters one at a time is a reasonable thing for a customer to
// try, and it lands on "show me every delivery order". Refusing is correct - the wording was not:
// "A order enquiry can't be answered with a general search", which has a broken article, names
// internal entity types as the remedy, and never says that one filter is enough to continue.
// captain decision 2026-08-24: the Customer/Product/Dates header is a DELIVERY ORDER search-scope
// disclosure, not a general one - narrowed off `order` to nothing else. Measured on the `incoming`
// domain (exec 13735530, message "1", a pick off a shipment list): "Customer: all customers" is
// meaningless for an inbound supplier shipment (a container has no customer) and "Dates: all dates"
// is noise (customers do not date-filter incoming in practice).
test('captain 2026-08-24 / exec 13735530: an incoming answer prints none of the Customer/Product/Dates lines', () => {
  const o = runMut('compile-current-state', 'pick-must-keep-missed-product--compile-current-state.json', (fx) => {
    for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.domain_hint = 'incoming';
  });
  const msg = String(o.user_response || '');
  assert.doesNotMatch(msg, /^Customer: /m, 'the customer line is a delivery-order concept, not incoming');
  assert.doesNotMatch(msg, /^Product: /m, 'the product line is a delivery-order concept, not incoming');
  assert.doesNotMatch(msg, /^Dates: /m, 'the date line is a delivery-order concept, not incoming');
  assert.match(msg, /Here are the orders I found\./, 'the answer body itself must still be present');
  assert.match(msg, /RMA-M2608-0067/, 'the answer body must be unharmed');
});

// exec 13735476, message "eta": an `incoming` MISS rendered "Dates: all dates" between the
// found-bullets and the escalate offer - same rule, the not-found-error-message twin of the block
// above.
test('captain 2026-08-24 / exec 13735476: an incoming MISS prints no Dates line', () => {
  const body = loadNodes(SLUG, ['not-found-error-message.js'])['not-found-error-message.js'];
  const fx = load('obj1-not-found-error-message.json');
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.domain_hint = 'incoming';
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'not-found-error-message' });
  const o = Array.isArray(out) ? out[0].json : out;
  const msg = String(o.escalate_message || o.response || '');
  assert.doesNotMatch(msg, /Dates: /, 'incoming is not a delivery-order search - no date scope line');
  assert.match(msg, /Couldn't find: /, 'the miss body itself must still be present');
});

// must-not-regress: the existing E2 case (a miss on the ORDER domain still states its date
// scope) - re-asserted here by name so a future edit that breaks it fails loudly in this block too.
test('must-not-regress E2: a miss on the ORDER domain still states its date scope', () => {
  const o = run('not-found-error-message', 'obj1-not-found-error-message.json');
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /Dates: /, 'order is a delivery-order search - the date scope line must remain');
});

// ── exec 13746945, "any delivery for SRTWB2805-BL" ────────────────────────────────────────────
// The gate scoped the search to {product: 1} and NOTHING else, so the search really was: any
// delivery order, ANY customer, ANY date. The reply named the one thing that resolved
// ("• product: SRTWB2805-BL"), said "no order matched these", and the customer had to ask "did it
// search all customers?" - because nothing said so. The found-bullets cannot answer that: they
// name what RESOLVED, and an axis nobody filled resolves to nothing, so an open axis is invisible
// exactly on the turn where it decides the result. Captain E2, verbatim: "an EMPTY result states
// them too - that is the entire point."
const missOn13746945 = () => {
  const fx = load('obj1-not-found-error-message.json');
  for (const item of fx.ctx['disallowed-entity-gate'] || []) {
    item.json.compatible_entities = [
      { entity_type: 'product', code: 'SRTWB2805-BL', uuid: 'prod-13746945-0001' },
    ];
  }
  for (const item of fx.ctx['resolve-entity'] || []) {
    item.json.resolutions = [];
    item.json.unresolved_tokens = [];
    item.json.tokens = ['srtwb2805bl'];
  }
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) {
    // the parser hinted the bare code as an ORDER (a defensible read on the order domain); the
    // resolver matched it as a PRODUCT and that is what the gate put in scope. Rendering from the
    // hint is the bug commit 70bb1e3 fixed on the happy path - the miss lane must not reopen it.
    item.json.output.entities = [
      { raw: 'SRTWB2805-BL', hint: 'order', canonical_code: null, current_message: true, confident: true },
    ];
  }
  return fx;
};

const runFx = (node, fx) => {
  const body = loadNodes(SLUG, [`${node}.js`])[`${node}.js`];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: node });
  return Array.isArray(out) ? out[0].json : out;
};

test('exec 13746945: an order MISS states every filter it searched with, not only the one that resolved', () => {
  const o = runFx('not-found-error-message', missOn13746945());
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /^Customer: all customers$/m,
    'no customer was in scope and the search covered all of them - that was the customer\'s question');
  assert.match(msg, /^Product: SRTWB2805-BL$/m, 'the one axis that WAS in scope must be named');
  assert.match(msg, /^Dates: all dates$/m, 'no window was set - say so rather than let the line vanish');
  assert.doesNotMatch(msg, /^Order: /m,
    'the parser hinted the bare code as an order, the resolver matched a product - render the gate scope, never the hint');
  // the same shape an answer uses: header, then the found-bullets, then the escalate offer
  const iHead = msg.indexOf('Customer: all customers');
  const iBullets = msg.indexOf("Here's what you want:");
  const iOffer = msg.search(/But no .*matched these/);
  assert.ok(iHead === 0, `the header must OPEN the miss: ${JSON.stringify(msg)}`);
  assert.ok(iBullets > iHead, `the found-bullets come after the header: ${JSON.stringify(msg)}`);
  assert.ok(iOffer > iBullets, `the escalate offer stays last: ${JSON.stringify(msg)}`);
  assert.match(msg, /• product: SRTWB2805-BL/, 'the existing found-bullets must survive');
});

// The double-prepend is the whole risk in this change: compile-current-state renders its own copy
// of this header. It early-returns on `isEscalateBranch`, and EVERY path out of
// not-found-error-message reaches compile-current-state through escalate-catalog (_cat) or
// build-suggest-offer (_sug), both of which set isEscalateBranch = true. Prove it, don't assume it.
test('a miss carries exactly ONE header - compile-current-state must not prepend a second', () => {
  const missMsg = String(runFx('not-found-error-message', missOn13746945()).escalate_message || '');
  const fx = load('product-miss-plus-customer-ambiguity--compile-current-state.json');
  for (const item of fx.ctx['escalate-catalog'] || []) item.json.response = missMsg;
  const o = runFx('compile-current-state', fx);
  const msg = String(o.user_response || '');
  assert.strictEqual((msg.match(/^Customer: /gm) || []).length, 1,
    `exactly one Customer line reaches the customer: ${JSON.stringify(msg)}`);
  assert.strictEqual((msg.match(/^Product: /gm) || []).length, 1,
    `exactly one Product line reaches the customer: ${JSON.stringify(msg)}`);
  assert.strictEqual((msg.match(/^Dates: /gm) || []).length, 1,
    `exactly one Dates line reaches the customer: ${JSON.stringify(msg)}`);
});

// The refusal arm is the case where NOTHING was in scope - it is why we refused. A
// "Customer: all customers / Product: all products" preamble on it would be absurd: it would
// disclose the very search we just told the customer we would not run.
test('the unscoped-search refusal gains no header - nothing was in scope, which is the point of refusing', () => {
  const fx = load('obj1-not-found-error-message.json');
  for (const item of fx.ctx['disallowed-entity-gate'] || []) {
    item.json.gate_passed = false;
    item.json.gate_reason = 'order requires a scoping entity';
    item.json.unresolved_tokens = [];
    item.json.compatible_entities = [];
    item.json.require_specific = false;
  }
  for (const item of fx.ctx['resolve-entity'] || []) item.json.unresolved_tokens = [];
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.entities = [];
  const o = runFx('not-found-error-message', fx);
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /would search every/i, 'the unscoped-search arm must be the one that answered');
  assert.doesNotMatch(msg, /^Customer: /m, 'no header on the arm that refused to search at all');
  assert.doesNotMatch(msg, /^Product: /m, 'no header on the arm that refused to search at all');
  assert.doesNotMatch(msg, /^Dates: /m, 'no header on the arm that refused to search at all');
});

test('D4: clearing every filter refuses in words the customer can act on', () => {
  const body = loadNodes(SLUG, ['not-found-error-message.js'])['not-found-error-message.js'];
  const fx = load('obj1-not-found-error-message.json');
  // Reproduce the state the last "all customers" turn arrives in: the gate refused for lack of
  // scope (not for a token that missed), so nothing is unresolved and no entity survives. Every
  // one of these is a needsScope precondition in the body - set them all, or a different arm
  // answers and the assertions below silently test nothing.
  for (const item of fx.ctx['disallowed-entity-gate'] || []) {
    item.json.gate_passed = false;
    item.json.gate_reason = 'order requires a scoping entity';
    item.json.unresolved_tokens = [];
    item.json.compatible_entities = [];
    item.json.require_specific = false;
  }
  for (const item of fx.ctx['resolve-entity'] || []) item.json.unresolved_tokens = [];
  for (const item of fx.ctx["Call 'sub-query-reformulator'"] || []) item.json.output.entities = [];
  const out = runNode({ body, fixture: fx, slug: SLUG, nodeName: 'not-found-error-message' });
  const o = Array.isArray(out) ? out[0].json : out;
  const msg = String(o.escalate_message || o.response || '');
  assert.match(msg, /would search every/i, 'the unscoped-search arm must be the one that answered');
  assert.doesNotMatch(msg, /\bA order\b/, 'the broken article must be gone');
  assert.match(msg, /at least one filter/i, 'it must say that one filter is enough to continue');
  assert.doesNotMatch(msg, /customer_order|order_number|inbound_shipment|goods_receive/,
    'internal entity type names must not be offered to the customer as the remedy');
  // The same defect one line over: the remedy sentence read "Give me a order number, transporter,
  // or customer, or a date range" - broken article again, and two lists welded together.
  assert.doesNotMatch(msg, /\ba\s+[aeiou]/i, 'the article must agree with the word that follows it');
  assert.doesNotMatch(msg, /,\s*or\b[\s\S]*,\s*or\b/,
    'one list with one "or" - the date range is another option, not an afterthought');
});
