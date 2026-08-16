// Fixtures for the `output_exchange` (parser sub) B2' offline harness.
//
// Every fixture models a REAL turn shape. The seeded prior state is the one observed verbatim in
// parser sub exec 11509876 (plan §5.1a) — including the B4 corruption (`current_message: true` on
// every carried entity), because that corruption is the thing B2' has to be immune to.
//
// `parent_input` = what `$('When Executed by Another Workflow').first().json` returns.
// `json`         = `$json` (the AI Agent output the node parses).

const CERT_UUID = 'aa10fd73-96bf-4418-91c3-7780a36305fe';   // PC 000078, re-confirmed §CD-0a-1
const PROD_UUID = '72aa8105-0000-0000-0000-000000000000';   // MWC7602-RL-P, seed-only (no longer resolves)

// The observed carried state, with the B4 flags ON (exec 11509876). Used wherever a turn must prove
// immunity to the corrupted flag.
const CARRIED_CORRUPT = () => ([
  { raw: 'MWC7602-RL-P', hint: 'product', uuid: PROD_UUID, dym_slot: '11400339', canonical_code: 'MWC7602-RL-P', current_message: true },
  { raw: 'Certification', hint: 'attachment_type', canonical_code: 'Certification', current_message: true },
  { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
]);

// Same state, flags clean (the shape state carries on a NON-pick turn, after W5's :358 re-stamp).
const CARRIED_CLEAN = () => CARRIED_CORRUPT().map(e => ({ ...e, current_message: false }));

// The five-copy accumulation actually observed in state (plan §5.1c).
const CARRIED_FIVE_CERTS = () => ([
  { raw: 'MWC7602-RL-P', hint: 'product', uuid: PROD_UUID, canonical_code: 'MWC7602-RL-P', current_message: true },
  { raw: 'Certification', hint: 'attachment_type', canonical_code: 'Certification', current_message: true },
  { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
  { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
  { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
  { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
  { raw: 'PC 000078', hint: 'certificate', canonical_code: 'PC 000078', uuid: CERT_UUID, current_message: true },
]);

const DYM_OFFER = () => ({
  id: '11400340',
  domain: 'product_attachment',
  candidates: [
    { code: 'SRTWC8317-RL', uuid: 'c0000000-0000-0000-0000-0000000000aa', entity_type: 'product',
      for_raw: 'srtwc8317-rl1', for_hint: 'product', for_canonical: null },
    { code: 'SRTWC8317-P-RL', uuid: 'c0000000-0000-0000-0000-0000000000bb', entity_type: 'product',
      for_raw: 'srtwc8317-rl1', for_hint: 'product', for_canonical: null },
  ],
});

const DYM_LRS = () => ([
  { idx: 1, value: 'SRTWC8317-RL', uuid: 'c0000000-0000-0000-0000-0000000000aa', entity_type: 'product',
    for_raw: 'srtwc8317-rl1', for_hint: 'product', for_canonical: null },
  { idx: 2, value: 'SRTWC8317-P-RL', uuid: 'c0000000-0000-0000-0000-0000000000bb', entity_type: 'product',
    for_raw: 'srtwc8317-rl1', for_hint: 'product', for_canonical: null },
]);

// LLM output skeleton — every key the node reads unguarded must be present.
const llm = (o) => ({
  message_type: 'business_query',
  domain_hint: null, intent_hint: null, user_goal: '',
  entities: [], entity_op: 'replace_combine', scope_exclusive: false,
  reference_positions: [], reference_target: null,
  access_levels: [], is_affirmative: null, scope_intent: null,
  ...o,
});

const state = (o) => ({
  domain_hint: 'product_attachment',
  intent_hint: 'check_product_attachment',
  entities: [],
  ...o,
});

module.exports = [

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-5 — the no-pick path. B2-as-designed also passes this one; it is here as the
  // regression floor, NOT as evidence B2' works (plan §3.0 / CD.md §CD-5 warning).
  {
    id: 'CD-5  carried cert evicted, attachment_type named this turn',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'srtwc8317-rl1 cert',
      previous_conversation_state: state({ entities: CARRIED_CLEAN() }),
    },
    json: { user_message: 'srtwc8317-rl1 cert', latest_user_message: 'srtwc8317-rl1 cert',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'srtwc8317-rl1', hint: 'product', canonical_code: null, current_message: true },
          { raw: 'cert', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ] }) },
    expect: { noHint: ['certificate'], hasRaw: ['srtwc8317-rl1'], hasHint: ['attachment_type'],
      entityOpApplied: 'replace_combine' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-11a — the B4 BYPASS, code reply. applyDymPick runs BEFORE the executor and promotes every
  // carried entity into `current`, where the axis map is never consulted. THE discriminating case.
  // The LLM emits NO entity here on purpose: eviction must not depend on the LLM re-stating the code.
  {
    id: 'CD-11a code-reply dym pick (B4 bypass) — cert still evicted',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'SRTWC8317-RL',
      previous_conversation_state: state({ entities: CARRIED_CORRUPT(), dym_offer: DYM_OFFER() }),
    },
    json: { user_message: 'SRTWC8317-RL', latest_user_message: 'SRTWC8317-RL',
      output: llm({ entities: [] }) },
    expect: { dymPickApplied: true, noHint: ['certificate'], hasRaw: ['SRTWC8317-RL'] },
  },
  {
    id: 'CD-11a2 code-reply dym pick, LLM DOES restate the code',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'SRTWC8317-RL',
      previous_conversation_state: state({ entities: CARRIED_CORRUPT(), dym_offer: DYM_OFFER() }),
    },
    json: { user_message: 'SRTWC8317-RL', latest_user_message: 'SRTWC8317-RL',
      output: llm({ entities: [{ raw: 'SRTWC8317-RL', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: { dymPickApplied: true, noHint: ['certificate'], hasRaw: ['SRTWC8317-RL'] },
  },

  // §CD-11b — numbered reply. dymNumberedMultiSelect runs AFTER the executor and OVERWRITES its
  // output wholesale (`output.output.entities = _base`), so B2-as-designed is UNCONDITIONALLY inert
  // here. This is what pins B2' part 2's placement.
  {
    id: 'CD-11b numbered dym pick (executor output discarded) — cert still evicted',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: '1',
      previous_conversation_state: state({ entities: CARRIED_CORRUPT(), dym_offer: DYM_OFFER(),
        dym_last_result_set: DYM_LRS(), selection_context: 'disambiguation' }),
    },
    json: { user_message: '1', latest_user_message: '1',
      output: llm({ message_type: 'casual', reference_target: 'dym', reference_positions: [1] }) },
    expect: { dymPickApplied: true, noHint: ['certificate'], hasRaw: ['SRTWC8317-RL'] },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-10b — F-CARRY-NARROW, the headline acceptance. A carried non-matching certificate must not
  // turn into a confident "No certificate for SRTWT2214".
  {
    id: 'CD-10b SRTWT2214 cert with a NON-matching carried certificate',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'SRTWT2214 cert',
      previous_conversation_state: state({ entities: CARRIED_CLEAN() }),
    },
    json: { user_message: 'SRTWT2214 cert', latest_user_message: 'SRTWT2214 cert',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true },
          { raw: 'cert', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ] }) },
    expect: { noHint: ['certificate'], hasRaw: ['SRTWT2214'] },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-11 NEGATIVE CONTROL / plan §3.2 row 2 — the bare-product follow-up. THE ONLY fixture that
  // discriminates B2' part 4's product_scope half (see README: §CD-FP-8's stated §CD-10b
  // expectation is blind, because §CD-10b's turn also contributes an attachment_scope entity).
  // Also pins the refinement: the carried attachment_type "Certification" must SURVIVE — it is a
  // type filter, not an instance filter, and re-attaching it is block (B)'s entire purpose.
  {
    id: 'FP8-D bare product follow-up — cert evicted, attachment_type RETAINED',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'and MWC7601?',
      previous_conversation_state: state({ entities: CARRIED_CLEAN() }),
    },
    json: { user_message: 'and MWC7601?', latest_user_message: 'and MWC7601?',
      output: llm({ entities: [{ raw: 'MWC7601', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: { noHint: ['certificate'], hasHint: ['attachment_type'], hasRaw: ['MWC7601'] },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-2 / §CD-11 second negative control — the certificate-FIRST query. Nothing may be dropped:
  // the certificate is llmKeys-present (the user just said it), so it is not carried.
  {
    id: 'CD-2 certificate-first query, clean session — cert RETAINED',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'certification with number PC000078',
      previous_conversation_state: state({ entities: [] }),
    },
    json: { user_message: 'certification with number PC000078', latest_user_message: 'certification with number PC000078',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
          { raw: 'certification', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ] }) },
    expect: { hasHint: ['certificate', 'attachment_type'], hintCount: { certificate: 1 } },
  },
  {
    id: 'CD-2b certificate RE-stated while already in state — still RETAINED',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'certification with number PC000078',
      previous_conversation_state: state({ entities: CARRIED_CLEAN() }),
    },
    json: { user_message: 'certification with number PC000078', latest_user_message: 'certification with number PC000078',
      output: llm({ domain_hint: 'product_attachment', intent_hint: 'check_product_attachment',
        entities: [
          { raw: 'PC000078', hint: 'certificate', canonical_code: 'PC 000078', current_message: true },
          { raw: 'certification', hint: 'attachment_type', canonical_code: 'certificate', current_message: true },
        ] }) },
    expect: { hasHint: ['certificate'], hintCount: { certificate: 1 } },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // §CD-7c — part 5 dedupe, against the five-copy state actually observed (plan §5.1c).
  // A `reuse` continuation contributes nothing, so NOTHING is evicted here — the only thing under
  // test is the dedupe, and the uuid backfill proves it collapses without losing the resolution
  // (only the 5th row carries the uuid).
  {
    id: 'CD-7c dedupe on a reuse turn — five PC 000078 rows collapse to one, uuid kept',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'and the validity?',
      previous_conversation_state: state({ entities: CARRIED_FIVE_CERTS() }),
    },
    json: { user_message: 'and the validity?', latest_user_message: 'and the validity?',
      output: llm({ entity_op: 'reuse', entities: [] }) },
    expect: { hintCount: { certificate: 1 }, noDuplicateKeys: true,
      uuidForKey: { 'certificate|pc 000078': CERT_UUID } },
  },
  // §CD-7c2 — dedupe on the turn shape that GENERATES the accumulation: a dym pick promotes the whole
  // carried set into `current`, which the executor spreads unfiltered. Two identical MWC7601 rows
  // (only the second resolved) must collapse to one that keeps the uuid, while the five certificates
  // are evicted by part 4 (the pick contributes product_scope).
  {
    id: 'CD-7c2 dedupe on a dym-pick turn — dup product collapses + keeps uuid, certs evicted',
    tag: 'B2-prime',
    parent_input: {
      latest_user_message: 'SRTWC8317-RL',
      previous_conversation_state: state({
        dym_offer: DYM_OFFER(),
        entities: [
          { raw: 'MWC7601', hint: 'product', canonical_code: 'MWC7601', current_message: true },
          { raw: 'MWC7601', hint: 'product', canonical_code: 'MWC7601', uuid: 'p0000000-0000-0000-0000-00000000dead', current_message: true },
          { raw: 'Certification', hint: 'attachment_type', canonical_code: 'Certification', current_message: true },
          ...CARRIED_FIVE_CERTS().slice(2),
        ] }),
    },
    json: { user_message: 'SRTWC8317-RL', latest_user_message: 'SRTWC8317-RL',
      output: llm({ entities: [] }) },
    expect: { dymPickApplied: true, noHint: ['certificate'], noDuplicateKeys: true,
      hintCount: { attachment_type: 1 },
      uuidForKey: { 'product|mwc7601': 'p0000000-0000-0000-0000-00000000dead' } },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // NON-INTERFERENCE — other domains. These are the byte-identity population (oe-byte-identity.js).
  {
    id: 'NI-order   customer + date, carried order scope',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'any outstanding for tan?',
      previous_conversation_state: state({ domain_hint: 'order', intent_hint: 'check_order',
        entities: [{ raw: 'NURTECH', hint: 'customer', canonical_code: 'NURTECH', current_message: false }] }),
    },
    json: { user_message: 'any outstanding for tan?', latest_user_message: 'any outstanding for tan?',
      output: llm({ domain_hint: 'order', intent_hint: 'check_order',
        entities: [{ raw: 'tan', hint: 'customer', canonical_code: null, current_message: true }] }) },
    expect: {},
  },
  {
    id: 'NI-inventory bare product after a stock turn',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'SRTWT2214',
      previous_conversation_state: state({ domain_hint: 'inventory', intent_hint: 'check_stock',
        entities: [{ raw: 'SRTWC19', hint: 'product', canonical_code: 'SRTWC19', current_message: false }] }),
    },
    json: { user_message: 'SRTWT2214', latest_user_message: 'SRTWT2214',
      output: llm({ entities: [{ raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: {},
  },
  {
    id: 'NI-promotion brand promo',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'any promo for cabana',
      previous_conversation_state: state({ domain_hint: 'promotion', intent_hint: 'check_promotion',
        entities: [{ raw: 'sorento', hint: 'brand', canonical_code: 'sorento', current_message: false }] }),
    },
    json: { user_message: 'any promo for cabana', latest_user_message: 'any promo for cabana',
      output: llm({ domain_hint: 'promotion', intent_hint: 'check_promotion',
        entities: [{ raw: 'cabana', hint: 'brand', canonical_code: 'cabana', current_message: true }] }) },
    expect: {},
  },
  {
    id: 'NI-incoming eta for a container',
    tag: 'non-interference',
    parent_input: {
      latest_user_message: 'eta for SRTWT2214',
      previous_conversation_state: state({ domain_hint: 'incoming', intent_hint: 'check_incoming', entities: [] }),
    },
    json: { user_message: 'eta for SRTWT2214', latest_user_message: 'eta for SRTWT2214',
      output: llm({ domain_hint: 'incoming', intent_hint: 'check_incoming',
        entities: [{ raw: 'SRTWT2214', hint: 'product', canonical_code: null, current_message: true }] }) },
    expect: {},
  },
  {
    id: 'NI-attach-clean product_attachment with NO carried certificate',
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
    expect: { hasRaw: ['SRTWT2214'] },
  },
];
