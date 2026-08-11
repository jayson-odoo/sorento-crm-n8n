const j = $input.first().json;
const names = Array.isArray(j.name) ? j.name : [];
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

const out = j;

// ── tier-only access ask (access-tier-ask-plan.md D1/D3) ─────────────────────
// Reached on If4 FALSE: either the contact has NO access levels (names empty — keep the
// original message), or tier-gate decided the tier is unresolvable (multi-tier contact,
// nothing stated) and the customer must pick. The ask is a NUMBERED TYPED LIST — never
// WhatsApp quick-reply buttons (D3) — offering ONLY the tiers this contact actually holds
// (a 2-tier contact sees 2 options, renumbered). The roster is persisted downstream by
// compile-current-state (selection_context 'tier_offer'), and the parser fork resolves a
// numbered/tier-word reply to TIER TOKENS against it — never to entities.
const TIER_DISPLAY = { office: 'Office', dealer: 'Dealer', end_user: 'End user' };
const ASK_ORDER = ['office', 'dealer', 'end_user'];
const held = ASK_ORDER.filter(t => (Array.isArray(j.entitled_tiers) ? j.entitled_tiers : []).includes(t));

if (names.length === 0) {
  escalate_message = `You have no access levels configured to get ${domainLabel}.`;
} else if (held.length === 0) {
  // entitlement holds no mappable tier — cannot render a tier ask; fall back to the legacy
  // compound prompt rather than an empty numbered list. (tier-gate proceeds in this case,
  // so this branch is defensive only.)
  escalate_message =
    `Please specify which access level you'd like to use for ${domainLabel}:`;
  is_clarification = true;
} else {
  const lines = held.map((t, i) => `${i + 1}. ${TIER_DISPLAY[t]}`).join('\n');
  escalate_message =
    `Which access level do you need?\n${lines}\nReply with the number(s) — e.g. "1", "1 and 2", or "all".`;
  is_clarification = true;
  out.tier_offer = true;
  out.tier_last_result_set = held.map((t, i) => ({
    idx: i + 1, label: TIER_DISPLAY[t], value: t, tier: t,
    uuid: null, entity_type: 'access_tier', product: null, filename: null,
  }));
}

out.escalate_message = escalate_message;
out.is_clarification = is_clarification;
// D3: the ask is a numbered TYPED list — never quick-reply buttons.
out.quick_reply = '';
return out;
