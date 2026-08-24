// =============================================================================
// n8n Code node: build_mcp_ids
// Input is the gate's compatible_entities: a flat, already-resolved list of
// { uuid, entity_type, code }. No resolver-shape handling needed.
// =============================================================================
const TYPE_TO_PARAM = {
  product:          'product_ids',
  promotion:        'promotion_ids',
  order:            'order_ids',
  customer_order:   'order_ids',
  order_number:     'order_ids',
  customer:         'customer_ids',
  transporter:      'transporter_ids',
  form:             'form_ids',
  shipment:         'shipment_ids',
  inbound_shipment: 'shipment_ids',
  // PLURAL (corrected 2026-08-11 — the comment that used to sit here said "SINGULAR, and it is
  // not a typo" and was TRUE when written, then went stale: sorento-crm PR #120 added
  // `attachment_type_ids` everywhere, and `crm_master_product_attachments_list` — the tool the
  // dym/sibling/incoming PROBES hit — accepts ONLY the plural. The singular was dropped silently
  // there, the probes got ALL attachments, and a Technical-Specifications row was reported as
  // "has certificate" (live exec 11984900 / fork exec 12007728, MWC7601-RL-S12). The plural is
  // accepted by BOTH tools on the deployed CRM, so it is the universally safe name.
  attachment_type:  'attachment_type_ids',
  attachment: 'attachment_ids',
  certificate: 'certificate_ids'
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const trig = $('When Executed by Another Workflow').first().json || {};
const semantic_input = trig.semantic_input;

// entities come straight from the gate — already resolved & deduped
const entities = trig.entities

const params = {};
const seenUuids = new Set();
const unmappedTypes = [];
const skipped = [];
const add = (param, uuid) => (params[param] || (params[param] = new Set())).add(uuid);

for (const e of entities) {
  const type = e && e.entity_type;
  const uuid = e && e.uuid;
  if (!uuid || !UUID_RE.test(String(uuid))) { skipped.push({ code: e && e.code, reason: 'missing_or_bad_uuid' }); continue; }
  if (seenUuids.has(uuid)) continue;
  const param = TYPE_TO_PARAM[type];
  if (!param) { unmappedTypes.push({ entity_type: type, uuid }); continue; }
  seenUuids.add(uuid);
  add(param, uuid);
}

// Params the tool takes as a SCALAR string rather than a list. Sending an array here is the
// same silent-drop failure as sending the wrong name, so the shape matters as much as the spelling.
const SCALAR_PARAMS = new Set([]);   // was ['attachment_type_id'] — plural takes a list
const out = {};
const truncated = [];
for (const [param, set] of Object.entries(params)) {
  const vals = [...set];
  if (!SCALAR_PARAMS.has(param)) { out[param] = vals; continue; }
  out[param] = vals[0];
  // The gate normally narrows document-class to exactly one. If more than one ever arrives we
  // must not pretend we filtered by all of them — record it rather than truncate in silence.
  if (vals.length > 1) truncated.push({ param, kept: vals[0], dropped: vals.slice(1) });
}

out._diagnostics = {
  entities_in: entities.length,
  total_uuids_passed: Object.values(out).reduce((n, a) => n + (Array.isArray(a) ? a.length : (a ? 1 : 0)), 0),
  scalar_truncated: truncated,
  skipped,
  unmapped_types: unmappedTypes,
};

// ---- trailing fields (unchanged) ----
out.view = 'render';
out.date_mode = semantic_input?.date_mode;

const DATE_PARAMS = {
  crm_order_management_orders_list:            ['actual_delivery_date_from', 'actual_delivery_date_to'],
  crm_order_management_orders_by_product_list: ['actual_delivery_date_from', 'actual_delivery_date_to'],
  crm_incoming_stock_list:                     ['eta_from', 'eta_to'],
  crm_incoming_stock_by_product:               ['eta_from', 'eta_to'],
  crm_incoming_stock_shipments:                ['eta_from', 'eta_to'],
  crm_marketing_promotions_list:               ['period_from', 'period_to'],
  crm_resource_attachments_list:               ['uploaded_at_from', 'uploaded_at_to'],
  crm_resource_attachments_catalogue:          ['uploaded_at_from', 'uploaded_at_to'],
  crm_sla_conversation_event_logs_list:        ['date_from', 'date_to'],
};
const toolName = trig.tool ? String(trig.tool).trim() : '';
const start = (semantic_input && semantic_input.date_filter_start) || trig.date_filter_start;
const end   = (semantic_input && semantic_input.date_filter_end)   || trig.date_filter_end;
const dp = DATE_PARAMS[toolName];
if (dp) {
  if (start) out[dp[0]] = start;
  if (end)   out[dp[1]] = end;
}

out.contact_id = semantic_input?.contact_id;
out.space_id = semantic_input?.space_id;
out.access_levels = semantic_input?.access_levels;
out.is_active = semantic_input?.is_active;

// order_status filter (order tools only): "outstanding" | "delivered"; omit when null (all).
const ORDER_TOOLS = new Set(['crm_order_management_orders_list', 'crm_order_management_orders_by_product_list']);
if (ORDER_TOOLS.has(toolName) && (semantic_input?.order_status === 'outstanding' || semantic_input?.order_status === 'delivered')) {
  out.order_status = semantic_input.order_status;
}
// ---- customer scope: coerce, THEN trim -------------------------------------------------------
// ONE body, three workflows (sub-get-results / -TEST / -CS-BUILD). This node decides WHICH
// customer a CRM read is scoped to, so it is the last place that should exist in three versions;
// it did, and they disagreed. Unified 2026-08-24.
//
// `contact_id` arrives as BOTH types in production simultaneously - measured over 24 executions
// on 2026-08-24: the live ANSWER got an int on 8 of 8 samples (exec 13754689), the live PROBES
// alternated between a SPACE-PADDED string and an int in adjacent executions (exec 13744232
// '487555417 ' / exec 13744212 487555417). The padding is not noise: five spine call sites write
// the expression `{{ ... .json.id }} ` with a trailing space inside the template.
//
// So both the coercion and the trim are load-bearing, and the ORDER is the whole point: a number
// has no `.trim`, so `String()` must come first. `.trim().toString()` - which one copy carried -
// is `TypeError: contact_id.trim is not a function` on the int the answer path actually receives:
// the same failure, in the same place, as the incident whose hotfix it was meant to be.
//
// `String(x ?? '')` handles int, string, padded string, null and undefined without knowing which
// caller sent what. Deliberately NOT a typeof branch - a form that only works for the shapes
// someone happened to sample is the bug, not the fix.
//
// The semantic_input fallback keeps the value the probes used before this line existed, for a
// caller that passes no trigger field. With nothing available anywhere this lands on '' - a scope
// that matches nothing - and never on `undefined`, which would drop the key from the MCP payload
// and WIDEN the read to every customer.
out.contact_id = String(($input.first()?.json?.contact_id ?? semantic_input?.contact_id) ?? '').trim();

// Sorento is a single tenant and this hardcode is deliberate (confirmed 2026-08-24). It overrides
// the semantic_input value assigned above, which carried the identical '364817' in all 24 samples.
out.space_id = "364817";
return out;