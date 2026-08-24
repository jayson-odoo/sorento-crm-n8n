// ── get-results-entity-ids.test.js — ONE read path, proved identical in all three copies ─────────
//
// WHY THIS FILE EXISTS
// `entity-ids-transformer` is the node that decides WHICH customer a CRM read is scoped to. It
// shipped in three workflows with three different bodies:
//
//   sub-get-results          Fss5aAaXthJSWpZCgKiKR   LIVE - the spine's 5 probes
//   sub-get-results TEST     rysSPgUssLDf6xJc        LIVE - the spine's MAIN ANSWER + 2 probes
//   sub-get-results CS-BUILD t4QvrtrPnTwRU6br        the TEST clone, all 9 call sites
//
// The divergence was not cosmetic. `contact_id` arrives as BOTH an int and a space-padded string
// in production TODAY, measured 2026-08-24 over 24 executions:
//
//   exec 13754689   live ANSWER (rys)   trigger.contact_id = 423729094        int
//   exec 13744232   live PROBES (Fss5)  trigger.contact_id = '487555417 '     str, PADDED
//   exec 13744212   live PROBES (Fss5)  trigger.contact_id = 487555417        int, ADJACENT exec
//
// and each copy coped with a different subset:
//   Fss5   never read the trigger field at all (semantic_input?.contact_id only) - which is the
//          only reason it never broke: it dodged the type problem by reading a different field.
//   rys    `.toString()`         - a hotfix after a deployment changed the type. Coerces, does
//                                  NOT trim, so a padded caller sends '487555417 ' to the CRM.
//   t4Qvr  `.trim().toString()`  - the same guard written the WRONG WAY ROUND. `.trim` is a
//                                  String method; on rys's measured int it is
//                                  `TypeError: contact_id.trim is not a function` - the original
//                                  incident, in the same place, from the fix for it.
//
// The contract asserted below is deliberately type-blind: coerce, THEN trim, for int / clean str /
// padded str / null / undefined, without any copy needing to know which caller sent what. A form
// that only works for the shapes someone happened to sample IS the bug, not the fix.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadNodes, ROOT } = require('../offline/node-source');
const { runNode } = require('../harness/n8n-shim');

const NODE = 'entity-ids-transformer';
const FILE = 'entity-ids-transformer.js';
const SLUGS = [
  ['sub-get-results', 'LIVE probes (Fss5aAaXthJSWpZCgKiKR)'],
  ['sub-get-results-TEST', 'LIVE main answer (rysSPgUssLDf6xJc)'],
  ['sub-get-results-CS-BUILD', 'TEST clone (t4QvrtrPnTwRU6br)'],
];

// The node sits DIRECTLY downstream of the trigger (connections: When Executed by Another
// Workflow -> entity-ids-transformer in all three workflow.json), so `$input.first()` and
// `$('When Executed by Another Workflow').first()` are the same item. The fixture models that.
function fixtureFor(trigger) {
  const item = [{ json: trigger }];
  return { ctx: { 'When Executed by Another Workflow': item }, input: item };
}

// `includeSemanticContactId` is a FLAG rather than `semanticContactId: undefined`, because a
// default parameter fires on an explicitly-passed `undefined` — the omit case would silently get
// the default back and the assertion would be testing the opposite of what it says.
function trigger({ contactId, includeContactId = true, includeSemanticContactId = true }) {
  const semantic_input = { space_id: '364817', access_levels: ['a'], is_active: true };
  if (includeSemanticContactId) semantic_input.contact_id = '487555417';
  const t = { tool: 'crm_master_products_list', entities: [], semantic_input };
  if (includeContactId) t.contact_id = contactId;
  return t;
}

// The returned object is JSON round-tripped for two reasons, both deliberate:
//   1. LESSONS §77(1): the body runs in the vm's OWN realm, so an array it built is not
//      `instanceof` the host's Array and `deepStrictEqual` reports "same structure but not
//      reference-equal" against a plain outer-realm literal.
//   2. It is what n8n itself does to an item in transit - which is exactly why a `contact_id` of
//      `undefined` is not a quiet no-op but a key that DISAPPEARS from the CRM payload. The
//      round-trip is the mechanism the "never absent" assertion below is about.
function run(slug, trig) {
  const body = loadNodes(slug, [FILE])[FILE];
  return JSON.parse(JSON.stringify(runNode({ body, fixture: fixtureFor(trig), slug, nodeName: NODE })));
}

// ── the contract, asserted against every copy ────────────────────────────────────────────────
for (const [slug, label] of SLUGS) {
  test(`${slug}: a NUMERIC contact_id is coerced, never thrown on  [${label}]`, () => {
    // THE REGRESSION THAT MATTERS. This is the incident's data type and it is what the live
    // ANSWER receives on 8 of 8 sampled executions (exec 13754689). `.trim().toString()` throws
    // here; `.toString().trim()` does not.
    const out = run(slug, trigger({ contactId: 487555417 }));
    assert.strictEqual(out.contact_id, '487555417');
    assert.strictEqual(typeof out.contact_id, 'string', 'the CRM is sent a string, always');
  });

  test(`${slug}: a SPACE-PADDED contact_id is trimmed  [${label}]`, () => {
    // The padding is real, not superstition: five spine call sites write the expression
    // `{{ $('sorento-sub-respond-findcontact-respond').first().json.id }} ` with a trailing space
    // INSIDE the template (probe-incoming, sibling-probe, dym-probe, dym-probe-partial,
    // promo-dym-probe). Measured on the wire as '487555417 ' in exec 13744232.
    const out = run(slug, trigger({ contactId: '487555417 ' }));
    assert.strictEqual(out.contact_id, '487555417');
  });

  test(`${slug}: a clean string contact_id passes through unchanged  [${label}]`, () => {
    const out = run(slug, trigger({ contactId: '487555417' }));
    assert.strictEqual(out.contact_id, '487555417');
  });

  test(`${slug}: a NULL contact_id does not throw  [${label}]`, () => {
    const out = run(slug, trigger({ contactId: null }));
    assert.strictEqual(out.contact_id, '487555417', 'falls back to semantic_input.contact_id');
  });

  test(`${slug}: an UNDEFINED / absent contact_id does not throw  [${label}]`, () => {
    const absent = run(slug, trigger({ includeContactId: false }));
    assert.strictEqual(absent.contact_id, '487555417', 'falls back to semantic_input.contact_id');
    const explicit = run(slug, trigger({ contactId: undefined }));
    assert.strictEqual(explicit.contact_id, '487555417');
  });

  test(`${slug}: with NO contact_id anywhere the scope is empty, never absent  [${label}]`, () => {
    // FAIL CLOSED. An empty string is a scope filter that matches nothing. Dropping the key
    // instead (which is what `undefined` does to a JSON payload) would WIDEN the read to every
    // customer - a cross-customer leak dressed as a missing value.
    const out = run(slug, trigger({ contactId: null, includeSemanticContactId: false }));
    assert.ok(Object.prototype.hasOwnProperty.call(out, 'contact_id'),
      'contact_id must be present on the payload even when it is unknown');
    assert.strictEqual(out.contact_id, '');
  });

  test(`${slug}: space_id is the hardcoded single tenant '364817'  [${label}]`, () => {
    // Sorento is one tenant; the captain confirmed the hardcode is deliberate (2026-08-24), and
    // semantic_input.space_id carried the same '364817' in all 24 measured samples. Asserted
    // even when the caller sends a different one, because the hardcode is the point.
    const out = run(slug, trigger({ contactId: '487555417' }));
    assert.strictEqual(out.space_id, '364817');
    const other = trigger({ contactId: '487555417' });
    other.semantic_input.space_id = '999999';
    assert.strictEqual(run(slug, other).space_id, '364817');
  });

  test(`${slug}: an attachment_type entity still maps to a LIST, not a scalar  [${label}]`, () => {
    // Characterisation, and the reason unifying the SCALAR_PARAMS line is inert. Fss5 and rys
    // carry `SCALAR_PARAMS = new Set(['attachment_type_id'])` (singular) while TYPE_TO_PARAM has
    // emitted the PLURAL `attachment_type_ids` in all three since 2026-08-11 - so the set has
    // matched nothing in any copy for months. Both spellings of that line produce this same
    // array. Green before the unification and after it: that is what makes it a safe merge.
    const t = trigger({ contactId: '487555417' });
    t.entities = [
      { entity_type: 'attachment_type', uuid: '11111111-1111-4111-8111-111111111111', code: 'COA' },
      { entity_type: 'attachment_type', uuid: '22222222-2222-4222-8222-222222222222', code: 'MSDS' },
    ];
    const out = run(slug, t);
    assert.deepStrictEqual(out.attachment_type_ids, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    assert.deepStrictEqual(out._diagnostics.scalar_truncated, [], 'nothing may be silently dropped');
  });
}

// ── the unification itself ───────────────────────────────────────────────────────────────────
// Three copies of one read path is what produced the divergence above. The bodies being EQUAL is
// therefore a property worth asserting directly: the next person to hotfix one copy under
// pressure gets a red test naming the other two, instead of a live incident six weeks later.
const shaOf = (slug, file) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'export', slug, 'nodes', file)))
  .digest('hex');

for (const file of ['entity-ids-transformer.js', 'output-structurer.js']) {
  test(`${file} is byte-identical in all three sub-get-results copies`, () => {
    const shas = SLUGS.map(([slug]) => [slug, shaOf(slug, file)]);
    const distinct = new Set(shas.map(([, s]) => s));
    assert.strictEqual(distinct.size, 1,
      `${file} has ${distinct.size} distinct bodies across the three copies:\n  ` +
      shas.map(([slug, s]) => `${slug}: ${s.slice(0, 16)}`).join('\n  '));
  });
}
