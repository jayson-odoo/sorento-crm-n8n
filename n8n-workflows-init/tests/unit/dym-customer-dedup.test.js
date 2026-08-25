// ── dym-customer-dedup.test.js - one customer, one line, keyed by NAME not by coding ───────────
//
// MEASURED (exec 13186947, clone): a customer account arrives from the resolver MULTIPLY-CODED -
// the same account as its debtor NAME row, its debtor CODE row (300-D059) and a DBR-hash
// canonical_code row. build-suggest-offer's D1 dedup was keyed on canonical_code, so ONE customer
// rendered as three numbered "matches", and - because cap3 slices per token - the three copies of
// the first account could push a genuinely DIFFERENT second account clean out of the offer.
//
// The port (clone-ahead, 2026-08-25): tokenCandidates keys CUSTOMER rows on their display name
// (`display.debtor_name || display.customer_name || canonical_code`), every other entity type
// stays keyed on canonical_code exactly as before. Resolver similarity order keeps the name-coded
// row first, so the kept candidate LABELS as the name - which also keeps the internal debtor code
// out of the rendered list on this shape.
//
// WHAT (b) OF THE CLONE DELTA IS NOT HERE: the clone pairs this dedup with a `_sentTokens` /
// `_isDerivedQueryToken` miss filter built from `q.entities[].raw`. That filter suppresses miss
// reporting by token-in-set membership, and `resolutions[].token != entities[].raw` (canonical
// echo, product dash-strip, CRM rewrites - the measured 4.2% silencer, Stage A finding 4), so it
// was deliberately NOT ported. This file pins the dedup alone.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadNodes, manifestOf } = require('../offline/node-source');
const { runNode, normalizeReturn } = require('../harness/n8n-shim');

const SLUG = 'live-spine-sorento-consume-main';
const NODE = 'build-suggest-offer';

function run(fixture) {
  const man = manifestOf(SLUG);
  const file = man.nodes[NODE].file;
  const body = loadNodes(SLUG, [file])[file];
  const out = normalizeReturn(runNode({ body, fixture, slug: SLUG, nodeName: NODE }));
  return JSON.parse(JSON.stringify(out))[0].json;
}

const CU1 = 'cu-00000000-0000-0000-0000-000000000001';
const CU2 = 'cu-00000000-0000-0000-0000-000000000002';
const custRow = (code, uuid, name) => ({
  canonical_code: code, uuid, entity_type: 'customer', match_tier: 'trgm',
  display: { debtor_name: name },
});

function fixture() {
  return {
    ctx: {
      "Call 'sub-query-reformulator'": [{ json: { output: {
        domain_hint: 'order',
        entities: [{ raw: 'mastile', hint: 'customer' }],
      } } }],
      'resolve-entity': [{ json: { resolutions: [{
        token: 'mastile', resolved: false,
        matches: [
          // the SAME account, three codings, in resolver similarity order (name row first)
          custRow('MASTILES KLANG SDN BHD', CU1, 'MASTILES KLANG SDN BHD'),
          custRow('300-D059', CU1, 'MASTILES KLANG SDN BHD'),
          custRow('DBR-8F3A2C11', CU1, 'MASTILES KLANG SDN BHD'),
          // a genuinely different account - without the dedup, cap3 slices it off the list
          custRow('MASTILE SETIA SDN BHD', CU2, 'MASTILE SETIA SDN BHD'),
        ],
      }] } }],
      'disallowed-entity-gate': [{ json: {} }],
    },
    input: [{ json: { escalate_message: "Sorry, I couldn't find that. Would you like me to escalate?" } }],
    execution: { id: 'hc-cust-dedup' },
  };
}

test('one multiply-coded customer renders ONCE, labelled by its name', () => {
  const out = run(fixture());
  assert.equal(out.suggest_offer, true, 'a genuine miss with candidates must build an offer');
  const labels = out.suggest_last_result_set.map((r) => r.label);
  assert.deepStrictEqual(labels, ['MASTILES KLANG SDN BHD', 'MASTILE SETIA SDN BHD'],
    'three codings of one account collapse to the name row; the second account survives cap3');
  // two candidates render in humanList prose mode: "Did you mean X, or Y?"
  assert.match(out.suggest_response, /Did you mean MASTILES KLANG SDN BHD, or MASTILE SETIA SDN BHD\?/,
    'the customer reads the two ACCOUNTS, once each, name first');
  assert.doesNotMatch(out.suggest_response, /300-D059/,
    'the internal debtor code must not be one of the "matches" a customer reads');
  assert.doesNotMatch(out.suggest_response, /DBR-8F3A2C11/,
    'the DBR hash coding must not be one of the "matches" a customer reads');
});

test('non-customer candidates still dedupe by canonical_code, not by display name', () => {
  const fx = fixture();
  // two DIFFERENT products that share a display name (a family) must BOTH render
  fx.ctx["Call 'sub-query-reformulator'"] = [{ json: { output: {
    domain_hint: 'order',
    entities: [{ raw: 'srtks', hint: 'product' }],
  } } }];
  fx.ctx['resolve-entity'] = [{ json: { resolutions: [{
    token: 'srtks', resolved: false,
    matches: [
      { canonical_code: 'SRTKS7646', uuid: 'p-1', entity_type: 'product', match_tier: 'trgm', display: { product_name: 'KITCHEN SINK' } },
      { canonical_code: 'SRTKS7646-NEW', uuid: 'p-2', entity_type: 'product', match_tier: 'trgm', display: { product_name: 'KITCHEN SINK' } },
      { canonical_code: 'SRTKS7646', uuid: 'p-1', entity_type: 'product', match_tier: 'trgm', display: { product_name: 'KITCHEN SINK' } },
    ],
  }] } }];
  const out = run(fx);
  const labels = out.suggest_last_result_set.map((r) => r.label);
  assert.deepStrictEqual(labels, ['SRTKS7646', 'SRTKS7646-NEW'],
    'same code twice collapses; two family variants sharing a name both stay - the name key is customers only');
});
