// Fixtures for the `output_exchange` immortal-hint-class harness (C1 / C2 / M2).
//
// `parent_input` = what `$('When Executed by Another Workflow').first().json` returns.
// `json`         = `$json` (the AI Agent output the node parses).
//
// 🔴 FIXTURE DISCIPLINE (plan §9): C1 and M2 CANNOT be reproduced from a clean session. The poisoned
// entity has to already be in state, because the bug is that it never leaves. Every C1/M2 fixture
// below therefore carries realistic prior session state; the two that do not are deliberate
// negative controls and are labelled as such.
//
// The poisoned entity is verbatim from parser exec 11554793 — a DOMAIN name in the entity `hint`
// field, carrying `ordinal: 1`, `current_message: false`:
//     {"raw":"M2399","hint":"product_attachment","ordinal":1,
//      "uuid":"487dfe36-cdc7-4950-b6dd-11c15879d568","canonical_code":"M2399"}

const M2399_UUID = '487dfe36-cdc7-4950-b6dd-11c15879d568';
const CERT_UUID = 'aa10fd73-96bf-4418-91c3-7780a36305fe';   // PC 000078

// The observed poison. `hint` is a DOMAIN name; nothing anywhere validates that.
const POISON = (over = {}) => ({
  raw: 'M2399', hint: 'product_attachment', ordinal: 1, uuid: M2399_UUID,
  canonical_code: 'M2399', current_message: false, ...over,
});
const CARRIED_CERT = () => ({
  raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', uuid: CERT_UUID,
  current_message: false,
});

const state = (o = {}) => ({
  domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
  entities: [], ...o,
});
const llm = (o = {}) => ({
  message_type: 'business_query', entity_op: 'replace_combine', scope_exclusive: false,
  domain_hint: null, intent_hint: null, user_goal: '',
  entities: [], reference_positions: [], reference_target: null,
  access_levels: [], is_affirmative: null, scope_intent: null, ...o,
});

// A frozen result set whose labels are BARE PRODUCT CODES — no `"<type>: "` prefix. This is what
// `presenters.py::_product_attachments` produces (`b.item(prod["product_code"], …)` → title), and it
// is the exact input that makes the reference-positions block take its `sep === -1` arm.
const BARE_RESULT_SET = () => ([
  { idx: 1, uuid: M2399_UUID, label: 'M2399', entity_type: null, product: 'M2399' },
  { idx: 2, uuid: 'b0000000-0000-0000-0000-0000000000b2', label: 'M2400', entity_type: null, product: 'M2400' },
]);
// Labels WITH a `"<type>: "` prefix — the HINT_MAP arm C2 must not touch.
const LABELLED_RESULT_SET = () => ([
  { idx: 1, uuid: 'c0000000-0000-0000-0000-0000000000c1', label: 'Promotion: Raya Sale',
    entity_type: 'promotion', product: null },
]);
// A promotion result set rendered BARE (uuid rows whose title is the promo name). Pre-C2 this hit
// the `|| 'promotion'` legacy tail; post-C2 it must hit DOMAIN_SUBJECT_HINT.promotion — same value.
const BARE_PROMO_SET = () => ([
  { idx: 1, uuid: 'c0000000-0000-0000-0000-0000000000c9', label: 'Raya Sale 2026',
    entity_type: null, product: null },
]);
// A pick set whose row 2 is a CERTIFICATE already present in prior state. Picking it re-mints the
// same _ceKey the prior entity carries, which is the ONLY shape where M2's `_ceRefPickedKeys` record
// changes the classification of a this-turn pick.
const PICK_MIXED_SET = () => ([
  { idx: 1, uuid: 'e0000000-0000-0000-0000-0000000000e1', label: 'SRTWT2214',
    entity_type: 'product', product: 'SRTWT2214' },
  { idx: 2, uuid: CERT_UUID, label: 'PC 000078', entity_type: 'certificate', product: 'PC 000078' },
]);
// Junk `entity_type` on the frozen row — the narrow guard must REJECT it rather than mint it.
const JUNK_TYPE_SET = () => ([
  { idx: 1, uuid: 'd0000000-0000-0000-0000-0000000000d1', label: 'M2399',
    entity_type: 'widget', product: 'M2399' },
]);

module.exports = [

  // ══════════════════════════════ C1 — immortal-hint-axis ══════════════════════════════

  {
    id: 'IH-3  INSTANCE GATE: pre-poisoned session, product turn evicts M2399',
    tag: 'C1',
    why: 'The reported defect, verbatim. A clean-session run CANNOT reproduce it — the entity has ' +
         'to already be in state. Pre-C1 the poisoned hint gets the private axis __product_attachment, ' +
         'which no current-turn entity can ever collide with, so keptPrior retains it forever.',
    parent_input: {
      latest_user_message: 'SRTWT2214 cert',
      previous_conversation_state: state({ entities: [POISON()] }),
    },
    json: {
      user_message: 'SRTWT2214 cert', latest_user_message: 'SRTWT2214 cert',
      output: llm({
        domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true },
          { raw: 'cert', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ],
      }),
    },
    expect: { noRaw: ['M2399'], noHint: ['product_attachment'], hasRaw: ['SRTWT2214'], noPrivateAxis: true,
              // seen-and-handled: the executor's prior filter classifies it on the way to evicting
              // it, so the diagnostic fires here with or without F3 — which is precisely why
              // IH-3 cannot be the F3 gate and IH-3-CTRL must be.
              unknownHints: ['product_attachment'] },
  },

  {
    id: 'IH-3-CTRL  NEGATIVE CONTROL: nothing contributes product_scope ⇒ M2399 SURVIVES',
    tag: 'C1',
    why: 'Discriminates "C1 evicts by axis collision" from "C1 clears everything unrecognised". ' +
         'A reuse turn contributes no current entity, so currentAxes is empty and the poison must ' +
         'be RETAINED. Without this arm the suite would pass for a clear-everything implementation.',
    parent_input: {
      latest_user_message: 'and the price?',
      previous_conversation_state: state({ entities: [POISON()] }),
    },
    json: {
      user_message: 'and the price?', latest_user_message: 'and the price?',
      output: llm({ entity_op: 'reuse', domain_hint: 'product_attachment',
                    intent_hint: 'check_product_attachment', entities: [] }),
    },
    expect: { hasRaw: ['M2399'], noPrivateAxis: true,
              // 🔴 F3 GATE (tester pass 2, exec 11645628). This turn contributes NOTHING, so the
              // contribution loop short-circuits on _ceIsCarried before classifying and the
              // executor's reuse branch never calls axisOf at all. Pre-F3 the diagnostic was
              // SILENT here — blind to exactly the dormant/immortal population it exists to
              // measure. This is the fixture that catches that, and IH-3 does NOT (there the
              // executor classifies the entity as part of its prior-filter).
              unknownHints: ['product_attachment'] },
  },

  {
    id: 'IH-2  recognised hints are byte-identical (non-interference)',
    tag: 'C1',
    why: "C1's first two lookups are unchanged and tried first. This proves it rather than assuming it.",
    parent_input: {
      latest_user_message: 'stock for SRTWT2214',
      previous_conversation_state: { domain_hint: 'inventory', intent_hint: 'check_stock', entities: [] },
    },
    json: {
      user_message: 'stock for SRTWT2214', latest_user_message: 'stock for SRTWT2214',
      output: llm({ domain_hint: 'inventory', intent_hint: 'check_stock',
        entities: [{ raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true }] }),
    },
    expect: { hasRaw: ['SRTWT2214'], noPrivateAxis: true, byteIdentical: true },
  },

  {
    id: 'IH-5  C1 must not break B2′ certificate eviction (composition)',
    tag: 'C1',
    why: '`certificate`/`attachment` are MAPPED by B2′ part 1, so they must never reach C1′s ' +
         'fallback. Their axis stays attachment_scope, NOT product_scope, and B2′ part 4 still evicts.',
    parent_input: {
      latest_user_message: 'SRTWT2214 cert',
      previous_conversation_state: state({ entities: [CARRIED_CERT()] }),
    },
    json: {
      user_message: 'SRTWT2214 cert', latest_user_message: 'SRTWT2214 cert',
      output: llm({
        domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true },
          { raw: 'cert', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ],
      }),
    },
    expect: { noHint: ['certificate'], hasRaw: ['SRTWT2214'], noPrivateAxis: true,
              axisOf: { certificate: 'attachment_scope' } },
  },

  // ══════════════════════════════ M2 — the ordinal exemption ══════════════════════════════
  //
  // 🔴 The load-bearing consequence of M2 is NOT that the ordinal-bearing entity disappears — an
  // entity is not removed for being "carried". It is CONTRIBUTION ACCOUNTING: pre-M2 a persisted
  // ordinal made the entity permanently "not carried", so it counted as a THIS-TURN contribution,
  // and once C1 gives it `product_scope` that spuriously trips B2′ part 4 and evicts a carried
  // certificate on a turn where nothing changed (plan §2.3c / §3.7). These two fixtures measure
  // exactly that, in both directions.

  {
    id: 'IH-4a  M2 EVICTION ARM: a persisted `ordinal` must NOT count as a this-turn contribution',
    tag: 'M2',
    why: 'Prior state carries an ordinal-bearing product AND a carried certificate; the LLM emits ' +
         'nothing this turn. Post-M2 the ordinal entity is CARRIED ⇒ no contribution ⇒ the ' +
         'certificate is RETAINED. Pre-M2 (with C1) it is "not carried" ⇒ _rcContribProduct ⇒ the ' +
         'certificate is wrongly evicted. This is the regression C1-without-M2 would introduce.',
    parent_input: {
      latest_user_message: 'and the price?',
      previous_conversation_state: state({ entities: [POISON({ hint: 'product' }), CARRIED_CERT()] }),
    },
    json: {
      user_message: 'and the price?', latest_user_message: 'and the price?',
      output: llm({ entity_op: 'reuse', domain_hint: 'product_attachment',
                    intent_hint: 'check_product_attachment', entities: [] }),
    },
    expect: { hasHint: ['certificate'], hasRaw: ['M2399'], noCarriedEvicted: true },
  },

  {
    id: 'IH-4b  M2 PICK ARM: an ordinal minted THIS TURN is still exempt (must stay GREEN)',
    tag: 'M2',
    why: 'The other direction, and it is mandatory: a case that only shows eviction cannot ' +
         'distinguish "exemption made THIS-TURN-ONLY" from "exemption removed ENTIRELY". ' +
         '🔴 The obvious shape for this arm does not work and the first draft of this fixture had ' +
         'it wrong: the reference-positions block does `entities = [...resolved]`, a WHOLESALE ' +
         'overwrite, so a carried certificate can never reach the reconciliation pass on a pick ' +
         'turn and `carried_attachment_evicted` can never fire there. The arm that actually ' +
         'discriminates picks a CERTIFICATE row whose key is ALSO in prior state, alongside a ' +
         'product row: the product contributes product_scope, so if the freshly-picked certificate ' +
         'were misclassified as carried it would be DROPPED. It must be RETAINED.',
    parent_input: {
      latest_user_message: '1 and 2',
      referenced_result_set: PICK_MIXED_SET(),
      previous_conversation_state: state({
        entities: [CARRIED_CERT()], last_result_set: PICK_MIXED_SET(),
      }),
    },
    json: {
      user_message: '1 and 2', latest_user_message: '1 and 2',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
                    entities: [], reference_positions: [1, 2] }),
    },
    expect: { hasHint: ['certificate', 'product'], hasRaw: ['PC 000078', 'SRTWT2214'],
              noCarriedEvicted: true },
  },

  // ══════════════════════════════ C2 — no-domain-name-hints ══════════════════════════════

  {
    id: 'IH-6  the poisoning is CREATED by the code under test: bare-code pick mints `product`',
    tag: 'C2',
    why: 'The writer, directly. A bare product-code title has no ": " so the block takes its ' +
         '`sep === -1` arm, which pre-C2 assigned `domain_hint` — a DOMAIN name — to the entity ' +
         'hint field. Injecting the poisoned entity would test C1, not C2.',
    parent_input: {
      latest_user_message: '1',
      referenced_result_set: BARE_RESULT_SET(),
      previous_conversation_state: state({ last_result_set: BARE_RESULT_SET() }),
    },
    json: {
      user_message: '1', latest_user_message: '1',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
                    entities: [], reference_positions: [1] }),
    },
    expect: { hintOfRaw: { M2399: 'product' }, noHint: ['product_attachment'], noPrivateAxis: true },
  },

  {
    id: 'IH-7  the labelled-prefix arm is unchanged (HINT_MAP hit)',
    tag: 'C2',
    why: 'Guards against C2 changing the `sep !== -1` arm it is not meant to touch.',
    parent_input: {
      latest_user_message: '1',
      referenced_result_set: LABELLED_RESULT_SET(),
      previous_conversation_state: { domain_hint: 'promotion', intent_hint: 'check_promotion',
                                     entities: [], last_result_set: LABELLED_RESULT_SET() },
    },
    json: {
      user_message: '1', latest_user_message: '1',
      output: llm({ domain_hint: 'promotion', intent_hint: 'check_promotion',
                    entities: [], reference_positions: [1] }),
    },
    expect: { hintOfRaw: { 'Raya Sale': 'promotion' }, byteIdentical: true },
  },

  {
    id: 'IH-8a  NO-REGRESSION: the dropped `|| promotion` tail — a promotion pick still mints promotion',
    tag: 'C2',
    why: 'C2 REMOVES the legacy default. Every real promotion turn must keep its hint byte-identical, ' +
         'now via DOMAIN_SUBJECT_HINT.promotion. Asserted, not assumed.',
    parent_input: {
      latest_user_message: '1',
      referenced_result_set: BARE_PROMO_SET(),
      previous_conversation_state: { domain_hint: 'promotion', intent_hint: 'check_promotion',
                                     entities: [], last_result_set: BARE_PROMO_SET() },
    },
    json: {
      user_message: '1', latest_user_message: '1',
      output: llm({ domain_hint: 'promotion', intent_hint: 'check_promotion',
                    entities: [], reference_positions: [1] }),
    },
    expect: { hintOfRaw: { 'Raya Sale 2026': 'promotion' }, byteIdentical: true },
  },

  {
    id: 'IH-8b  DISCRIMINATOR: null domain_hint ⇒ `product`, NOT the old `promotion` tail',
    tag: 'C2',
    why: 'Without this arm the suite cannot tell the new map from the old default — both produce ' +
         '`promotion` on IH-8a. This is the only fixture where the tail actually changed value.',
    parent_input: {
      latest_user_message: '1',
      referenced_result_set: BARE_RESULT_SET(),
      previous_conversation_state: { domain_hint: null, intent_hint: null,
                                     entities: [], last_result_set: BARE_RESULT_SET() },
    },
    json: {
      user_message: '1', latest_user_message: '1',
      output: llm({ domain_hint: null, intent_hint: null, entities: [], reference_positions: [1] }),
    },
    expect: { hintOfRaw: { M2399: 'product' } },
  },

  {
    id: 'IH-9  the narrow guard REJECTS an off-enum row entity_type',
    tag: 'C2',
    why: 'row.entity_type is preferred, but only when it is a KNOWN entity hint. A junk value must ' +
         'fall through to DOMAIN_SUBJECT_HINT rather than being minted as a new unknown.',
    parent_input: {
      latest_user_message: '1',
      referenced_result_set: JUNK_TYPE_SET(),
      previous_conversation_state: state({ last_result_set: JUNK_TYPE_SET() }),
    },
    json: {
      user_message: '1', latest_user_message: '1',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
                    entities: [], reference_positions: [1] }),
    },
    expect: { hintOfRaw: { M2399: 'product' }, noHint: ['widget'], noUnknownHints: true },
  },

  // ══════════════════════════════ non-interference population ══════════════════════════════

  {
    id: 'NI-order   customer + date, carried order scope',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'any orders for Tan last week',
      previous_conversation_state: { domain_hint: 'order', intent_hint: 'check_order',
        entities: [{ raw: 'Tan', hint: 'customer', canonical_code: 'Tan', current_message: false }] },
    },
    json: { user_message: 'any orders for Tan last week', latest_user_message: 'any orders for Tan last week',
      output: llm({ domain_hint: 'order', intent_hint: 'check_order',
        entities: [{ raw: 'Tan', hint: 'customer', canonical_code: 'Tan', current_message: true }] }) },
    expect: { byteIdentical: true },
  },
  {
    id: 'NI-incoming eta for a container',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'eta for SRTWT2214',
      previous_conversation_state: { domain_hint: 'incoming', intent_hint: 'check_incoming',
        entities: [{ raw: 'CONT-99', hint: 'inbound_shipment', canonical_code: 'CONT-99', current_message: false }] },
    },
    json: { user_message: 'eta for SRTWT2214', latest_user_message: 'eta for SRTWT2214',
      output: llm({ domain_hint: 'incoming', intent_hint: 'check_incoming',
        entities: [{ raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: { byteIdentical: true },
  },
  {
    id: 'NI-promotion brand promo',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'mocha promotions',
      previous_conversation_state: { domain_hint: 'promotion', intent_hint: 'check_promotion', entities: [] },
    },
    json: { user_message: 'mocha promotions', latest_user_message: 'mocha promotions',
      output: llm({ domain_hint: 'promotion', intent_hint: 'check_promotion',
        entities: [{ raw: 'mocha', hint: 'brand', canonical_code: 'mocha', current_message: true }] }) },
    expect: { byteIdentical: true },
  },
  {
    id: 'NI-master_products catalogue lookup',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'what is SRTWT2214',
      previous_conversation_state: { domain_hint: 'master_products', intent_hint: 'check_product', entities: [] },
    },
    json: { user_message: 'what is SRTWT2214', latest_user_message: 'what is SRTWT2214',
      output: llm({ domain_hint: 'master_products', intent_hint: 'check_product',
        entities: [{ raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: { byteIdentical: true },
  },
  {
    id: 'NI-attach-clean product_attachment with NO carried entity',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'SRTWT2214 cert',
      previous_conversation_state: state({ entities: [] }),
    },
    json: { user_message: 'SRTWT2214 cert', latest_user_message: 'SRTWT2214 cert',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true },
          { raw: 'cert', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ] }) },
    expect: { byteIdentical: true },
  },
];
