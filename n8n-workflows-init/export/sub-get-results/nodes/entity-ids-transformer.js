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
  attachment_type:  'attachment_type_ids',
  attachment: 'attachment_ids'
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

const out = {};
for (const [param, set] of Object.entries(params)) out[param] = [...set];

out._diagnostics = {
  entities_in: entities.length,
  total_uuids_passed: Object.values(out).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0),
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

return out;