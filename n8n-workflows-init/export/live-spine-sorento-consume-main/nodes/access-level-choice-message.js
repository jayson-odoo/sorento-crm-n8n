const names = Array.isArray($input.first().json.name) ? $input.first().json.name : [];
const q = $('Call \'sub-query-reformulator\'').first().json.output ?? {};
const domain = q.domain_hint || 'this enquiry';

// optional: friendlier labels than the raw domain_hint
const LABELS = {
  promotion: 'promotions',
  master_products: 'product information',
  product_attachment: 'product attachments',
  inventory: 'stock',
  order: 'orders',
  incoming: 'incoming stock',
  forms: 'forms',
  portal_link: 'this request',
};
const domainLabel = LABELS[q.domain_hint] || domain;

let escalate_message;
let is_clarification = false;

if (names.length === 0) {
  escalate_message = `You have no access levels configured to get ${domainLabel}.`;
} else {
  // bullet each option on its own line — easier to read on WhatsApp than comma-joined
  const options = names.map(n => `- ${n}`).join('\n');
  escalate_message =
    `Please specify which access level you'd like to use for ${domainLabel}:`;
  is_clarification = true;
}

const out = $input.first().json;
out.escalate_message = escalate_message;
out.is_clarification = is_clarification;
out.quick_reply = names.join(",")
return out;