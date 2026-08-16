// ── ROUTING DERIVATION (mechanical map; parser emits semantic signals only) ──
function deriveRouting(out) {
  const domain = out.domain_hint;
  const ents = Array.isArray(out.entities) ? out.entities : [];

  // attachment_type discriminator (the cert-vs-photo split within product_attachment)
  const attachTypes = ents
    .filter(e => String(e.hint || '').toLowerCase() === 'attachment_type')
    .map(e => String(e.canonical_code || e.raw || '').toLowerCase());
  // cert-vs-photo discriminator. Fire when EITHER an attachment_type raw names a cert body/word,
  // OR the semantic signal (attachment intent + a cert word in user_goal) says certificate.
  // Brand-named certs (SPAN/SIRIM/BOMBA/MS####/Halal) arrive as attachment_type raw, not "certificate".
  const isCert =
    attachTypes.some(t => /cert|ikram|span|sirim|bomba|ms\s?\d|halal/i.test(t))
    || (out.intent_hint === 'check_product_attachment'
        && /cert|certificate/i.test(String(out.user_goal || '')));

  // brand for promotion routing (entity wins, else access level)
  const brandEnt = ents.find(e => String(e.hint || '').toLowerCase() === 'brand');
  const access = (out.access_levels || []).map(a => String(a).toLowerCase());
  let brand = brandEnt ? String(brandEnt.raw || '').toLowerCase() : null;
  if (!brand) {
    if (access.some(a => a.includes('mocha')))   brand = 'mocha';
    else if (access.some(a => a.includes('cabana'))) brand = 'cabana';
    else if (access.some(a => a.includes('sorento'))) brand = 'sorento';
  }
  // Δ3 fix: clamp to the valid promotion-brand enum; garbled/unknown -> default sorento downstream
  { const _VB = ['sorento','cabana','mocha']; const _b2 = String(brand || '').replace(/[^a-z]/g, ''); brand = _VB.find(v => _b2.includes(v)) || null; }

  switch (domain) {
    case 'master_products':    return { suggested_team: 'purchasing_product', suggested_agent: 'general_enquiries' };
    case 'incoming':           return { suggested_team: 'purchasing',       suggested_agent: 'incoming_stock_enquiries' };
    case 'product_attachment': return isCert
        ? { suggested_team: 'purchasing_certification', suggested_agent: 'general_enquiries' }
        : { suggested_team: 'marketing_product', suggested_agent: 'general_enquiries' };
    case 'forms':              return { suggested_team: 'marketing_form',   suggested_agent: 'marketing_form' };
    case 'inventory':          return { suggested_team: 'warehouse',        suggested_agent: 'general_enquiries' };
    case 'order':              return { suggested_team: 'customer_service',  suggested_agent: 'order_enquiries' };
    case 'promotion':          return { suggested_team: `marketing_promotion_${brand || 'sorento'}`, suggested_agent: 'general_enquiries' };
    default:                   return { suggested_team: null,              suggested_agent: null };
  }
}

let output = {};
let parent_input = $('When Executed by Another Workflow').first().json
const norm = (v) => (v === null || v === undefined || v === 'null' || v === '') ? null : v;
if ($json.output && typeof $json.output === 'object') {
  output = $json.output;
} else {
  let raw = String($json.output || '');
  raw = raw.replace(/```[\s\S]*?```/g, match =>
    match.replace(/```json?|\```/g, '')
  );
  const idx = raw.indexOf('{');
  if (idx === -1) {
    output = { output: raw };
    output.quick_reply = $json.quick_reply;
  } else {
    const startSlice = raw.slice(idx);
    const last = startSlice.lastIndexOf('}');
    const cleanSlice = last !== -1 ? startSlice.slice(0, last + 1) : startSlice;
    output.output = JSON.parse(cleanSlice);
  }
}

// ── §10 follow-up (3) — hoist raw LLM signals + coerce string-"null" hints ──
// (a) Capture the LLM's RAW message_type + routing at the TOP, BEFORE any downstream
//     message_type mutation (the ~L420 decline clobber, the ~L435 domain->business_query
//     clobber, and the position-pick reclassifies). The retarget intent must be immune to
//     ALL of them — reading _reqHelp AFTER a mid-mutation was the row-5 non-determinism bug.
const _llmMsgTypeRaw = output.output.message_type;
const _reqHelp       = _llmMsgTypeRaw === 'request_for_help';
const _llmTeamRaw    = output.output?.routing?.suggested_team;
const _llmAgentRaw   = output.output?.routing?.suggested_agent;
const _llmTeamN      = norm(_llmTeamRaw);
const _llmAgentN     = norm(_llmAgentRaw);
// (b) The LLM occasionally emits the LITERAL STRING "null" for a hint. That is truthy, so it
//     mis-fires the ~L435 domain->business_query clobber (and deriveRouting/blocklist/_isNewQuery).
//     Coerce to real null here so every downstream check reads it correctly. norm() passes real
//     domains through untouched — only "null"/""/undefined become null.
output.output.domain_hint = norm(output.output.domain_hint);
output.output.intent_hint = norm(output.output.intent_hint);

// reuse means "no new value this turn" — but if the parser emitted current entities,
// it contradicts itself. Promote to additive replace_combine so the new value survives.
const _priorEnts0 = Array.isArray(parent_input.previous_conversation_state?.entities) ? parent_input.previous_conversation_state.entities : [];
if (output.output.entity_op === 'reuse' && Array.isArray(output.output.entities) && output.output.entities.length > 0 && (output.output.entities.some(e => e.current_message === true) || _priorEnts0.length === 0)) {
  if (_priorEnts0.length === 0) {
    output.output.entities = output.output.entities.map(e => ({ ...e, current_message: true }));
  }
  output.output.entity_op = 'replace_combine';
  output.output.entity_op_corrected = 'reuse->replace_combine';  // visibility
}

if (output.output.domain_hint === 'resource_attachment') {
  const ents = Array.isArray(output.output.entities) ? output.output.entities : [];
  const hasProduct = ents.some(e => String(e.hint || '').toLowerCase() === 'product');

  if (hasProduct) {
    output.output.domain_hint = 'product_attachment';
    output.output.intent_hint = 'check_product_attachment';
    output.output.domain_corrected = 'resource_attachment->product_attachment (product present)';
  }
}
// ── MENU-LABEL OVERRIDE ──────────────────────────────────────
// Exact menu/button labels are SELECTIONS (→ portal link), not free-text queries.
// Override whatever the LLM guessed when the user message is a known label.
// IMPORTANT: match against the original user message, not the LLM output.
const userMsg = String($json.user_message ?? $json.latest_user_message ?? '').trim().toLowerCase();
const MENU_LABELS = {
  "stock enquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "stock_enquiry" },
  "stock inquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "stock_enquiry" },
  "complaint":       { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "complaint" },
  "price enquiry":   { intent_hint: "get_portal_link", domain_hint: "portal_link", portal: "price_enquiry" },
  // add the rest of your menu options here
};
const menuHit = MENU_LABELS[userMsg];
if (menuHit && output.output) {
  output.output.message_type = "business_query";
  output.output.intent_hint  = menuHit.intent_hint;
  output.output.domain_hint  = menuHit.domain_hint;
  output.output.portal       = menuHit.portal;
  output.output.entities     = [];          // a label has no filter entities
  output.output.is_menu_label = true;        // flag so downstream routes to portal handler
}

// ── FLYER INJECTION (deterministic; parser only flags contains_flyer) ──
// Flyer is a resource-type filter that COEXISTS with brand/category — not a scope
// competitor. Inject it with its own hint so the axis/replace logic never drops it,
// and so it survives the broaden-blocklist.
if (output.output && !output.output.is_menu_label && output.output.contains_flyer === true) {
  const ents = Array.isArray(output.output.entities) ? output.output.entities : [];
  const alreadyHas = ents.some(e => String(e.raw || '').toLowerCase() === 'flyer');
  if (!alreadyHas) {
    ents.push({ raw: 'flyer', hint: 'flyer', current_message: true });  // own hint → own axis
  }
  output.output.entities = ents;
}

// ── ENTITY OPERATION EXECUTOR (op + axis-aware replace/combine) ──
if (output.output && !output.output.is_menu_label) {
    // axis depends on DOMAIN: in promotion, product/brand/category/flyer all scope "which promotion"
    const AXIS_BY_DOMAIN = {
      promotion: {
        brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope',
        flyer: 'promo_scope', product: 'promo_scope',   // ← product joins promo_scope HERE
      },
      master_products: {
        product: 'product_scope', category: 'product_scope', brand: 'product_scope',
      },
      order: {
        order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
        customer: 'order_scope', transporter: 'order_scope', product: 'order_scope',
      },
      incoming: {
        product: 'incoming_scope', inbound_shipment: 'incoming_scope',
        category: 'incoming_scope', brand: 'incoming_scope',
      },
      product_attachment: {
        product: 'product_scope', category: 'product_scope', brand: 'product_scope',
        attachment_type: 'attachment_scope',   // type is its own axis (coexists with product)
      },
      // …
    };
    
    // fallback flat map for hints/domains not covered
    const HINT_AXIS_DEFAULT = {
      brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope', flyer: 'promo_scope',
      product: 'product_scope', attachment_type: 'attachment_scope',
      customer: 'order_scope', transporter: 'order_scope', order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
      warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
    };
    
    const domain = output.output.domain_hint;
    const axisOf = (e) => {
      const hint = String(e.hint || '').toLowerCase();
      const domainMap = AXIS_BY_DOMAIN[domain];
      return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;
    };

  const op = output.output.entity_op || 'replace_combine';
  const all = Array.isArray(output.output.entities) ? output.output.entities : [];

  // split on the flag the PARSER set — do NOT override it
  const current = all.filter(e => e.current_message === true);
  // PRIOR entities = from previous conversation state (always false)
  const prior = Array.isArray(parent_input.previous_conversation_state?.entities)
    ? parent_input.previous_conversation_state?.entities.map(e => ({ ...e, current_message: false }))
    : [];

  let finalEntities;
  switch (op) {
    case 'clear':
      finalEntities = [];
      break;
    case 'reuse': {
      finalEntities = prior;
      // date: only carry if THIS turn named no date
      const hasCurrentDate = output.output.date_filter_start || output.output.date_filter_end;
      if (!hasCurrentDate) {
        if (parent_input.previous_conversation_state?.date_filter_start) output.output.date_filter_start = parent_input.previous_conversation_state?.date_filter_start;
        if (parent_input.previous_conversation_state?.date_filter_end)   output.output.date_filter_end   = parent_input.previous_conversation_state?.date_filter_end;
        if (parent_input.previous_conversation_state?.date_mode)         output.output.date_mode         = parent_input.previous_conversation_state?.date_mode;
      }
    
      // is_active: only carry if THIS turn left it null (no status word)
      const curActive = norm(output.output.is_active);
      if (curActive === null && parent_input.previous_conversation_state?.is_active !== undefined && norm(parent_input.previous_conversation_state?.is_active) !== null) {
        output.output.is_active = parent_input.previous_conversation_state?.is_active;
      } 
/*      if (output.output.message_type != 'casual' && output.output.message_type != 'request_for_help') {
        output.output.message_type = parent_input.previous_conversation_state?.message_type
        output.output.domain_hint = parent_input.previous_conversation_state?.domain_hint
        output.output.intent_hint = parent_input.previous_conversation_state?.intent_hint
      }*/
      break;
    }
    case 'modify':
    case 'replace_combine':
    default: {
      const currentAxes = new Set(current.map(axisOf));
      const exclusive = output.output.scope_exclusive === true;
    
      let keptPrior;
      if (exclusive) {
        if (current.length === 0) {
          // "restrict to only [nothing]" is meaningless — the user named no new value.
          // This is almost always a tier/attribute change, not an entity narrow. Keep prior.
          keptPrior = prior;
          output.output.exclusive_ignored_no_current = true;
        } else {
          keptPrior = [];   // genuine exclusive: current IS the full scope
        }
      } else {
        keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)));
      }
    
      finalEntities = [...current, ...keptPrior];
      output.output.scope_exclusive_applied = exclusive;
      break;
    }
  }

  output.output.entities = finalEntities;
  output.output.entity_op_applied = op;
}
// (A) A positional pick continues the PRIOR business query — the parser may have
// mislabeled the bare "1" as casual with null domain. Inherit prior context FIRST,
// so the attachment_type carry below (gated on domain) can fire.
const prevState = parent_input.previous_conversation_state || {};

// order_status: order delivery-status filter (outstanding|delivered|null). Default null.
if (output.output.order_status === undefined) output.output.order_status = null;
if (output.output.order_status !== 'outstanding' && output.output.order_status !== 'delivered') output.output.order_status = output.output.order_status || null;

// ── "ALL / SEMUA" on a numbered menu → expand to EVERY offered position ──
// Gated on a pick-context (disambiguation menu or suggest-offer) so a legitimate
// "all warehouses"-style broaden in other domains is left untouched. Cancels the
// LLM's default "broaden" reading and turns "all" into a multi-position pick.
{
  const _selCtx  = String(prevState.selection_context || '');
  // A quote-reply (respond.io replyTo) delivers the replied-to menu in referenced_result_set —
  // prefer it over the immediate last_result_set, and treat its presence as a pick-context
  // (selection_context reflects the immediate prev turn, which is null on a reply-to-older-msg).
  const _refSet  = Array.isArray(parent_input.referenced_result_set) ? parent_input.referenced_result_set : [];
  const _lrsAll  = _refSet.length > 0 ? _refSet : (Array.isArray(prevState.last_result_set) ? prevState.last_result_set : []);
  const _pickCtx = _refSet.length > 0 || _selCtx === 'disambiguation' || _selCtx === 'suggest_offer';
  // strip the appended "reply to: <quoted text>" so the bare user word is matched
  const _msgAll  = String(parent_input.latest_user_message ?? parent_input.user_message ?? userMsg ?? '').split(/\s*reply to:/i)[0].trim().toLowerCase().replace(/[.!\s]+$/,'');
  const _isAll   = /^(all|all of them|all of it|everything|every one|semua|semuanya|semua sekali|both|kedua|kedua-duanya)$/i.test(_msgAll);
  const _noPos   = !Array.isArray(output.output.reference_positions) || output.output.reference_positions.length === 0;
  if (_isAll && _pickCtx && _lrsAll.length > 0 && _noPos) {
    output.output.reference_positions = _lrsAll.map(r => Number(r.idx)).filter(x => Number.isInteger(x));
    output.output.scope_intent  = null;          // NOT a broaden
    output.output.entity_op     = 'reuse';
    output.output.message_type  = 'business_query';
    if (!output.output.domain_hint) output.output.domain_hint = prevState.domain_hint;
    if (!output.output.intent_hint) output.output.intent_hint = prevState.intent_hint;
    output.output.select_all_expanded = true;    // diagnostic
  }
}
if (!output.output.domain_hint && prevState?.domain_hint && output.output.reference_positions.length > 0) {
  output.output.domain_hint  = prevState?.domain_hint;
  output.output.intent_hint  = output.output.intent_hint || prevState.intent_hint;
  output.output.message_type = 'business_query';
  output.output.domain_inherited_for_position = true;
}
// pick under a menu business_query, even if LLM carried a domain_hint
if (prevState?.selection_context === 'disambiguation'
    && Array.isArray(output.output.reference_positions)
    && output.output.reference_positions.length > 0
    && output.output.message_type === 'casual') {
  output.output.message_type = 'business_query';
}
// ── REFERENCE POSITIONS → ENTITIES ──
if (output.output && !output.output.is_menu_label &&
    Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0) {

  const lastSet = Array.isArray(parent_input.referenced_result_set)
    ? parent_input.referenced_result_set
    : (Array.isArray(prevState.last_result_set) ? prevState.last_result_set : []);

  const byIdx = new Map(lastSet.map(r => [r.idx, r]));

  const HINT_MAP = {
    promotion: 'promotion', product: 'product', order: 'order',
    order_number: 'order', customer: 'customer', form: 'form',
  };

  const resolved = [];
  const outOfRange = [];

  for (const posRaw of output.output.reference_positions) {
    const pos = Number(posRaw);
    const row = byIdx.get(pos);
    if (!row || !row.label) { outOfRange.push(pos); continue; }

    const sep = row.label.indexOf(': ');
    let hint, raw;
    if (sep !== -1) {
      const before = row.label.slice(0, sep).trim().toLowerCase();
      raw  = row.label.slice(sep + 2).trim();
      hint = HINT_MAP[before] || before || output.output.domain_hint || 'promotion';
    } else {
      raw  = row.label.trim();
      hint = output.output.domain_hint || 'promotion';
    }
    // carry uuid/code straight from the frozen row so it needn't re-resolve
    resolved.push({ raw, hint, ordinal: pos, current_message: true,
                    uuid: row.uuid || null, canonical_code: row.product || raw });
  }

  output.output.entities = [...resolved];

  // match_mode: 'or' only when MULTIPLE positions were picked — not because we
  // appended an attachment_type (product + type must AND together).
  const positionalPicks = resolved.filter(r => r.ordinal !== undefined).length;
  if (positionalPicks > 1) output.output.match_mode = 'or';

  output.output.positions_resolved = positionalPicks;
  output.output.positions_out_of_range = outOfRange;
}

// (B) product_attachment: re-attach attachment_type if the current turn lacks one.
  if (output.output.domain_hint === 'product_attachment') {
    const currentHasAttachType =
      output.output.entities.some(r => String(r.hint || '').toLowerCase() === 'attachment_type') ||
      (Array.isArray(output.output.entities) && output.output.entities.some(e =>
        String(e.hint || '').toLowerCase() === 'attachment_type' && e.current_message === true));

    if (!currentHasAttachType) {
      const priorEnts = Array.isArray(prevState.entities) ? prevState.entities : [];
      const priorAttachTypes = priorEnts.filter(e =>
        String(e.hint || '').toLowerCase() === 'attachment_type');
      for (const at of priorAttachTypes) {
        output.output.entities.push({ raw: at.raw, hint: at.hint,
                        canonical_code: at.canonical_code, current_message: true });
      }
    }
  }

// ── domain-aware entity-type BLOCKLIST ──
// ── domain-aware entity-type BLOCKLIST ──
// Always-blocked: hints that never make sense for the domain.
const DOMAIN_BLOCKED_HINTS = {
  master_products: ['forms', 'form', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type', 'flyer'],
  product_attachment: ['forms', 'form', 'promotion', 'customer', 'transporter', 'order', 'spo', 'grn', 'goods_receive', 'attachment', 'inbound_shipment', 'access_levels', 'customer_order', 'order_number', 'flyer'],
  promotion: ['forms', 'form', 'attachment', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type'],
  forms: ['product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels'],
  inventory: ['customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'attachment_type'],
  order: ['forms', 'form', 'promotion', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'attachment', 'flyer'],  // 'spo' removed: PS-codes resolve as customer_order; bare code hinted spo must survive reuse under order domain
  incoming: ['forms', 'form', 'attachment', 'promotion', 'customer', 'transporter', 'warehouse', 'spo', 'grn', 'goods_receive', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  portal_link: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  resource_attachment: ['forms', 'form', 'product', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'attachment_type', 'flyer'],
  goods_receive: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
  spo_allocation: ['forms', 'form', 'product', 'attachment', 'promotion', 'customer', 'transporter', 'order', 'customer_order', 'order_number', 'spo', 'grn', 'goods_receive', 'inbound_shipment', 'access_levels', 'category', 'brand', 'attachment_type', 'flyer'],
};

// Broaden-only blocked: hints that NARROW the result and therefore contradict an
// "all / everything" request. Applied ONLY when scope_intent === 'broaden'.
// (Brand/access stay — they are context, not a subset filter.)
const DOMAIN_BROADEN_BLOCKED_HINTS = {
  promotion:          ['promotion', 'attachment'],            // a named promotion / flyer narrows "all promos"
  master_products:    ['product'],                            // a specific code narrows "all products"
  product_attachment: ['product', 'attachment_type'],
  inventory:          ['product'],
  order:              ['order', 'customer'],
  incoming:           ['inbound_shipment', 'product'],
  forms:              ['form'],
  resource_attachment:['attachment'],
  goods_receive:      ['goods_receive'],
  spo_allocation:     ['spo'],
};

if (output.output?.entities && Array.isArray(output.output.entities)) {
  const domain = output.output.domain_hint;
  const isBroaden = output.output.scope_intent === 'broaden';

  // union of always-blocked + (broaden-blocked if broadening)
  const blocked = new Set([
    ...(DOMAIN_BLOCKED_HINTS[domain] || []),
    ...(isBroaden ? (DOMAIN_BROADEN_BLOCKED_HINTS[domain] || []) : []),
  ]);

  if (blocked.size > 0) {
    const before = output.output.entities.length;
    const dropped = [];
    output.output.entities = output.output.entities.filter(e => {
      const hit = blocked.has(String(e.hint || '').toLowerCase());
      if (hit) dropped.push(`${e.hint}:${e.raw}`);
      return !hit;
    });
    const after = output.output.entities.length;
    output.output.entities_filtered = (after !== before);
    output.output.entities_emptied_by_filter = (before > 0 && after === 0);
    if (dropped.length) output.output.broaden_dropped = dropped;   // visibility into what scope-blocking removed
  }
}

const priorRouting  = parent_input?.previous_conversation_state?.routing ?? {};

// escalation confirmation = previous response OFFERED escalation (fixed wording)
//                           AND current message is affirmative
const prevResponse = String(parent_input?.previous_conversation_state?.response || '');
const offeredEscalation = /would you like me to escalate/i.test(prevResponse);
const isAffirmative = output.output.is_affirmative === true;
const isDecline     = output.output.is_affirmative === false;

// A position pick (a numbered choice, or "all" resolved against a menu / referenced set) is NOT
// a decline of the escalation offer — don't let is_affirmative=false collapse it to casual (which
// would then wipe the resolved entities below).
const _isPositionPick = (Number(output.output.positions_resolved) > 0)
  || output.output.select_all_expanded === true
  || (Array.isArray(output.output.reference_positions) && output.output.reference_positions.length > 0);
if (offeredEscalation && isAffirmative) {
  output.output.escalation = { is_escalation_confirmation: true };
} else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp) {
  output.output.escalation = { is_escalation_confirmation: false };
  output.output.message_type = 'casual';
}

if (output.output.access_levels.length == 0) {
  output.output.access_levels = $('When Executed by Another Workflow').first().json.previous_conversation_state?.access_levels || []
}

const _engagesOffer = (isAffirmative || isDecline || _isPositionPick);
if (output.output.message_type == 'casual' && !_engagesOffer) {
  output.output.entities = []
}


if (output.output.domain_hint && output.output.message_type !== 'casual' && output.output.message_type !== 'request_for_help') {
  output.output.message_type = "business_query"
}

// ── attachment_type i18n normalize ─────────────────────────────────────────────
// The resolver + get-results read entity.raw. The LLM sets canonical_code to the
// English kind (photo/certificate/…) for attachment_type; mirror it into raw so a
// foreign word (gambar→photo) resolves. Authority/brand certs keep canonical_code
// null (per prompt) → raw untouched → cert routing preserved.
if (Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) {
    if (String(e.hint || '').toLowerCase() === 'attachment_type' && e.canonical_code) {
      e.raw = e.canonical_code;
    }
  }
}

// _llmTeamRaw/_llmAgentRaw captured at the TOP (§10 follow-up (3) hoist) — pre-mutation, single source.
const derived = output.output.domain_hint
  ? deriveRouting(output.output)
  : { suggested_team: null, suggested_agent: null };

// For a request_for_help turn with a valid LLM team, that team WINS over deriveRouting/prior.
// TERNARY (not `_reqHelp && _llmTeamN`): `false ?? y === false` would poison the nullish chain.
// _reqHelp / _llmTeamN / _llmAgentN are the hoisted single-source vars (§10 follow-up (3)).
const suggested_team  = (_reqHelp ? _llmTeamN  : null) ?? norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = (_reqHelp ? _llmAgentN : null) ?? norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';

output.output.routing = { suggested_team, suggested_agent };



// ── Δ3: CS member-pick override (final say; v2 robust extractor) ──
const _selCtx = (parent_input.previous_conversation_state || {}).selection_context;
if (_selCtx === 'member_offer') {
  const _lastSet = Array.isArray((parent_input.previous_conversation_state || {}).last_result_set) ? parent_input.previous_conversation_state.last_result_set : [];
  const _maxIdx = _lastSet.length;
  const _ORD = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, '1st':1, '2nd':2, '3rd':3, '4th':4, '5th':5, '6th':6 };
  const _extract = (msg, llm) => {
    if (Array.isArray(llm) && llm.length) return [...new Set(llm.map(Number).filter(n => !isNaN(n)))];
    const t = String(msg || '').trim().toLowerCase(); const c = [];
    if (/^#?\s*\d+$/.test(t)) c.push(parseInt(t.replace(/\D/g, ''), 10));
    for (const w in _ORD) if (new RegExp('\\b' + w + '\\b').test(t)) c.push(_ORD[w]);
    const opt = t.match(/\b(?:option|number|no\.?|choice)\s*#?\s*(\d+)/g); if (opt) opt.forEach(m => c.push(parseInt(m.replace(/\D/g, ''), 10)));
    if (c.length === 0 && t.split(/\s+/).filter(Boolean).length <= 4) { t.split(/\s+/).forEach(w => { if (/^#?\d+$/.test(w)) c.push(parseInt(w.replace(/\D/g, ''), 10)); }); }
    return [...new Set(c)].filter(n => !isNaN(n));
  };
  const _o = output.output;
  const _normName = s => String(s || '').toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^(ms|miss|mrs|mr|encik|en|puan|pn|cik|tuan|dato|datin|dr)\.?\s+/, '');   // strip ONE leading honorific
  // In member_offer context a bare number, or a short reply matching a member label, is ALWAYS a
  // pick — never a new query — even if the LLM speculatively assigned a domain (e.g. bare "Nur",
  // which also looks like customer NURTECH, gets parsed as a new order search). Force the pick.
  const _rawReply = String(parent_input.latest_user_message || '').split(/\s*reply to:/i)[0].trim();
  const _replyWords = _rawReply.split(/\s+/).filter(Boolean);
  const _replyIsNumber = /^#?\s*\d+$/.test(_rawReply);
  const _replyMatchesMember = _replyWords.length > 0 && _replyWords.length <= 3 && _lastSet.some(r => {
    const a = _normName(r.label), b = _normName(_rawReply);
    return a && b && (a === b || a.split(' ').some(t => t && t === b) || b.split(' ').some(t => t && t === a) || a.includes(b) || b.includes(a));
  });
  const _forcePick = _replyIsNumber || _replyMatchesMember;

  // ── entry-gate precedence: 1 retarget → 2 pick → 3 new-query abandon → 4 junk reprompt ──
  const _priorTeam = norm(priorRouting.suggested_team) || 'customer_service';
  const _pos = _extract(parent_input.latest_user_message, output.output.reference_positions);
  // §1.1 fix: key ONLY on an actual extracted person name. The old `: _rawReply` fallback made this
  // arm truthy for EVERY worded reply → it shadowed the affirmative (yes/no) arms below.
  const _pm = (typeof _o.person_mention === 'string' && _o.person_mention.trim()) ? _o.person_mention.trim() : '';
  // §1.3 broaden: a real question (with OR without a current-message entity) abandons the offer.
  const _isNewQuery = (!!_o.domain_hint || _o.message_type === 'business_query' || _o.message_type === 'clarification')
    && _o.is_affirmative !== true;
  // pick signal = a bare number/member-name (_forcePick), a resolved position, an extracted person
  // name, or a bare yes/no. _forcePick is INCLUDED here so it still outranks new-query (LESSON 39).
  const _hasPickSignal = _forcePick || _pos.length > 0 || !!_pm
    || _o.is_affirmative === true || _o.is_affirmative === false;

  if (_reqHelp && _llmTeamN && _llmTeamN !== _priorTeam) {
    // Tier 1 — RETARGET: LLM named a DIFFERENT team mid-offer → abandon CS roster, direct-assign it.
    output.output.routing = { suggested_team: _llmTeamN, suggested_agent: (norm(_llmAgentRaw) || 'general_enquiries') };
    output.output.escalation = { is_escalation_confirmation: true, retarget_team: true };
    output.output.message_type = 'request_for_help';
    output.output.selection_context = null;
    output.output.last_result_set = [];
    output.output.member_pick_context = false;
  } else if (_hasPickSignal) {
    // Tier 2 — PICK SIGNAL: number / position / person-name / bare yes|no.
    if (_pos.length === 1 && _pos[0] >= 1 && _pos[0] <= _maxIdx) {
      const _row = _lastSet.find(r => Number(r.idx) === _pos[0]);
      output.output.escalation = { is_escalation_confirmation: true, preferred_assignee_id: _row.uuid };
      output.output.entities = [];
    } else if (_pos.length > 1) {
      output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'multi' };
      output.output.correction = true;   // re-offer the member list (only one allowed)
    } else if (_pos.length === 1) {
      output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
      output.output.correction = true;   // re-offer the member list
    } else if (_pm) {
      // Δ name-resolution arm: numeric _pos empty + a person_mention present → match vs last_result_set labels
      const _q  = _normName(_pm);
      const _qt = new Set(_q.split(' ').filter(Boolean));
      const _norm = _lastSet.map(r => ({ idx: Number(r.idx), uuid: r.uuid, ln: _normName(r.label) }));
      // tiered: exact -> token overlap -> substring; collect ALL idx at the FIRST tier that yields matches
      let _m = _norm.filter(r => r.ln === _q);
      if (!_m.length) _m = _norm.filter(r => r.ln.split(' ').some(t => _qt.has(t)));
      if (!_m.length) _m = _norm.filter(r => r.ln.includes(_q) || _q.includes(r.ln));
      _m = [...new Map(_m.map(r => [r.idx, r])).values()];   // dedupe by idx
      if (_m.length === 1) {
        output.output.escalation = { is_escalation_confirmation: true, preferred_assignee_id: _m[0].uuid };
        output.output.entities = [];
      } else if (_m.length > 1) {
        output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'multi' };
        output.output.correction = true;   // ambiguity gate: reprompt, NEVER auto-pick
      } else {
        output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
        output.output.correction = true;   // 0 match -> reprompt the member list
      }
    } else if (_o.is_affirmative === true) {
      output.output.escalation = { is_escalation_confirmation: true };   // no preferred -> round-robin
    } else if (_o.is_affirmative === false) {
      // §10 Part 2 — plain decline (no position/person_mention pick, no named-team retarget;
      // Tier 1 already consumed request_for_help + team != prior). Emit a DETERMINISTIC decline
      // marker the spine's is-escalation-declined IF keys on, so the reply is a FIXED
      // "Escalation declined." and NEVER the clarification LLM. Do NOT set correction/member_reprompt.
      output.output.escalation = { is_escalation_confirmation: false, escalation_declined: true };
      output.output.message_type = 'casual';
    }
    output.output.member_pick_context = true;
  } else if (_isNewQuery) {
    // Tier 3 — NEW QUERY: abandon the offer. Do NOT set member_pick_context and do NOT touch
    // routing/escalation/entities — normal downstream processing answers it.
  } else {
    // Tier 4 — junk / no signal: reprompt the member list once.
    output.output.escalation = { is_escalation_confirmation: false, member_reprompt: 'out_of_range' };
    output.output.correction = true;
    output.output.member_pick_context = true;
  }
}

// ── DATE-FILTER DOMAIN GATE (policy lives here, not in the LLM) ──
// The parser extracts a date window whenever the message names one, for ANY domain.
// This whitelist is the deterministic policy for which domains actually honor it.
// Add a domain here to open the date filter to it — no prompt change needed.
const DATE_FILTER_DOMAINS = new Set(['promotion', 'order']);
if (!DATE_FILTER_DOMAINS.has(output.output.domain_hint)) {
  if (output.output.date_filter_start || output.output.date_filter_end || output.output.date_mode) {
    output.output.date_filter_gated = output.output.domain_hint || null;  // visibility: what we stripped for
  }
  output.output.date_filter_start = null;
  output.output.date_filter_end   = null;
  output.output.date_mode         = null;
}

return output
