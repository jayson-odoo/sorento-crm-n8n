const q    = $('Call \'sub-query-reformulator\'').first().json.output;
const r    = $('resolve-entity').first().json ?? {};
const gate = $('disallowed-entity-gate').first().json ?? {};

const resolvedTypes = r?.by_entity_type ? Object.keys(r.by_entity_type) : [];
const parserHints   = Array.isArray(q?.entities) ? q.entities.map(e => e.hint) : [];
const haveAttachmentType =
  resolvedTypes.includes('attachment_type') || parserHints.includes('attachment_type');

const gatePassed = gate.gate_passed !== false;
const gateReason = gate.gate_reason || '';
const allowedTypes = gate?.gate_debug?.allowed_lookup ?? [];


// readable list: ['product','category','brand'] → "product, category, or brand"
const humanList = (arr) => {
  const a = arr.filter(Boolean);
  if (a.length === 0) return 'a valid value';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')}, or ${a[a.length - 1]}`;
};

const missingAttachmentType =
  q.domain_hint === 'product_attachment' && !gatePassed && !haveAttachmentType;
const unresolved = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
const hasUnresolved = unresolved.length > 0;

// needsScope = gate failed for lack of scope AND the user genuinely gave nothing.
// If they gave a token that just didn't resolve, that's a lookup miss, not a scope gap.
const needsScope =
  !gatePassed && !missingAttachmentType && !hasUnresolved &&
  /requires a scoping entity/.test(gateReason);

let escalate_message;
let is_clarification = false;

if (missingAttachmentType) {
  const subject = Array.isArray(q?.entities) ? q.entities.find(e => e.hint === 'product') : null;
  const subjectText = subject ? `${subject.hint} ${subject.raw}` : 'the requested product';
  escalate_message =
    `Please provide the attachment type for ${subjectText} ` +
    `— e.g. product image, technical drawing, or certificate.`;
  is_clarification = true;

} else if (needsScope) {
  escalate_message =
    `A ${q.domain_hint} enquiry can't be answered with a general search — ` +
    `please specify a ${humanList(allowedTypes)} so I can look it up.`;
  is_clarification = true;

} else {
  const tokens     = Array.isArray(r?.tokens) ? r.tokens : [];
  const tokenText  = tokens.join(' ');
  // tokens the user gave that didn't resolve — name them so the miss is concrete
  const unresolvedText = unresolved.join(', ');

  let requested;
  if (resolvedTypes.length && tokenText) {
    requested = `${resolvedTypes.join('/')} ${tokenText}`;
  } else if (tokenText) {
    requested = tokenText;
  } else if (unresolvedText) {
    requested = unresolvedText;                 // ← PS2026-05-20 lands here
  } else {
    const entities = Array.isArray(q?.entities) ? q.entities : [];
    requested = entities.length
      ? entities.map(e => `${e.hint || 'item'} ${e.raw}`).join(', ')
      : 'the requested item';
  }

  const dateRange = (q.date_filter_start && q.date_filter_end)
    ? ` from ${q.date_filter_start} to ${q.date_filter_end}` : '';
  const access = q.intent_hint === 'check_promotion'
    ? ` for ${q.access_levels?.join(', ') || 'End User'}` : '';
  const team = q.routing?.suggested_team || 'customer_service';
  const active_inactive = q.is_active == true ? " active" : (q.is_active == false ? " inactive" : "")
  const require_specific = gate.require_specific
  if (require_specific) {
    escalate_message = gate.gate_clarification
  } else {
    escalate_message =
    `Could not find${active_inactive} ${q.domain_hint} for ${requested}${dateRange}${access}. ` +
    `Would you like me to escalate to ${team} team?`;
  }
}

const out = $input.first().json;
out.escalate_message = escalate_message;
out.is_clarification = is_clarification;
return out;
