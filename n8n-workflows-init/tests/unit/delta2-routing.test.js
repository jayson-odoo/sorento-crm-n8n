#!/usr/bin/env node
/* Δ2 routing derivation test. deriveRouting already lives in the parser sub output_exchange;
 * Δ2 only remaps 3 teams. This pins the NEW mapping + the unchanged ones + carry-forward + default.
 * Keep deriveRouting() below byte-identical to the deployed output_exchange version.
 */

// ── NEW deriveRouting (Δ2) — paste into output_exchange ──
function deriveRouting(out) {
  const domain = out.domain_hint;
  const ents = Array.isArray(out.entities) ? out.entities : [];
  const attachTypes = ents.filter(e => String(e.hint || '').toLowerCase() === 'attachment_type')
    .map(e => String(e.canonical_code || e.raw || '').toLowerCase());
  const isCert = attachTypes.some(t => /cert|ikram/.test(t));
  const brandEnt = ents.find(e => String(e.hint || '').toLowerCase() === 'brand');
  const access = (out.access_levels || []).map(a => String(a).toLowerCase());
  let brand = brandEnt ? String(brandEnt.raw || '').toLowerCase() : null;
  if (!brand) {
    if (access.some(a => a.includes('mocha'))) brand = 'mocha';
    else if (access.some(a => a.includes('cabana'))) brand = 'cabana';
    else if (access.some(a => a.includes('sorento'))) brand = 'sorento';
  }
  switch (domain) {
    case 'master_products':    return { suggested_team: 'purchasing_product',       suggested_agent: 'general_enquiries' };       // Δ2: was purchasing
    case 'incoming':           return { suggested_team: 'purchasing',               suggested_agent: 'incoming_stock_enquiries' }; // unchanged
    case 'product_attachment': return isCert
        ? { suggested_team: 'purchasing_certification', suggested_agent: 'general_enquiries' }                                     // Δ2: was purchasing
        : { suggested_team: 'marketing_product',        suggested_agent: 'general_enquiries' };
    case 'forms':              return { suggested_team: 'marketing_form',   suggested_agent: 'marketing_form' };
    case 'inventory':          return { suggested_team: 'warehouse',        suggested_agent: 'general_enquiries' };
    case 'order':              return { suggested_team: 'customer_service',  suggested_agent: 'order_enquiries' };                  // Δ2: was warehouse
    case 'promotion':          return { suggested_team: `marketing_promotion_${brand || 'sorento'}`, suggested_agent: 'general_enquiries' };
    default:                   return { suggested_team: null,              suggested_agent: null };
  }
}

// ── final resolution (mirrors output_exchange tail) ──
const norm = (v) => (v === null || v === undefined || v === 'null' || v === '') ? null : v;
function resolve(out, priorRouting = {}) {
  const derived = out.domain_hint ? deriveRouting(out) : { suggested_team: null, suggested_agent: null };
  return {
    suggested_team:  norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service',
    suggested_agent: norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries',
  };
}

const CASES = [
  ['master_products', { domain_hint: 'master_products' }, {}, { suggested_team: 'purchasing_product', suggested_agent: 'general_enquiries' }],
  ['incoming', { domain_hint: 'incoming' }, {}, { suggested_team: 'purchasing', suggested_agent: 'incoming_stock_enquiries' }],
  ['product_attachment cert', { domain_hint: 'product_attachment', entities: [{ hint: 'attachment_type', raw: 'certificate' }] }, {}, { suggested_team: 'purchasing_certification', suggested_agent: 'general_enquiries' }],
  ['product_attachment photo', { domain_hint: 'product_attachment', entities: [{ hint: 'attachment_type', raw: 'photo' }] }, {}, { suggested_team: 'marketing_product', suggested_agent: 'general_enquiries' }],
  ['forms', { domain_hint: 'forms' }, {}, { suggested_team: 'marketing_form', suggested_agent: 'marketing_form' }],
  ['inventory', { domain_hint: 'inventory' }, {}, { suggested_team: 'warehouse', suggested_agent: 'general_enquiries' }],
  ['order', { domain_hint: 'order' }, {}, { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }],
  ['promotion mocha', { domain_hint: 'promotion', entities: [{ hint: 'brand', raw: 'Mocha' }] }, {}, { suggested_team: 'marketing_promotion_mocha', suggested_agent: 'general_enquiries' }],
  ['promotion default brand', { domain_hint: 'promotion' }, {}, { suggested_team: 'marketing_promotion_sorento', suggested_agent: 'general_enquiries' }],
  ['carry-forward (null domain, prior order)', {}, { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }, { suggested_team: 'customer_service', suggested_agent: 'order_enquiries' }],
  ['default (null domain, no prior)', {}, {}, { suggested_team: 'customer_service', suggested_agent: 'general_enquiries' }],
];

let fails = 0;
for (const [name, out, prior, exp] of CASES) {
  const got = resolve(out, prior);
  if (JSON.stringify(got) !== JSON.stringify(exp)) { fails++; console.error(`✗ ${name}\n   got ${JSON.stringify(got)}\n   exp ${JSON.stringify(exp)}`); }
  else console.log(`✓ ${name} -> ${got.suggested_team}/${got.suggested_agent}`);
}
console.log(fails === 0 ? '\nGREEN — Δ2 routing map correct' : `\nRED — ${fails} fail(s)`);
process.exit(fails === 0 ? 0 : 1);
