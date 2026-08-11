#!/usr/bin/env node
// ── access-tier mapper probe ─────────────────────────────────────────────────────────────
// Offline gate for tests/offline/access-tier/mapper.js (plan §3/§4). Fixtures are REAL:
// ENTITLED_ALL is the verbatim Aggregate.name[] from live execs 12031183 / 12024557 / 12020037.
// Run: node probe.js   (exit 1 on any failure — mutate.sh proves every assertion can go red)
const { parseLevel, mapEntitlement, recompose, statedTiers, needsTierAsk } = require('./mapper.js');

const ENTITLED_ALL = ['Cabana Dealer', 'Cabana Office', 'End User', 'Mocha Dealer', 'Mocha Office', 'Sorento Dealer', 'Sorento Office'];

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got  ${g}\n      want ${w}`); }
};

console.log('── parseLevel ──');
eq('P1 compound', parseLevel('Sorento Dealer'), { brand: 'sorento', tier: 'dealer' });
eq('P2 case/space tolerant', parseLevel('  cabana   OFFICE '), { brand: 'cabana', tier: 'office' });
eq('P3 end user brandless', parseLevel('End User'), { brand: null, tier: 'end_user' });
eq('P4 unknown -> null', parseLevel('Platinum VIP'), null);
eq('P5 empty -> null', parseLevel(''), null);

console.log('── mapEntitlement ──');
eq('M1 full real entitlement', mapEntitlement(ENTITLED_ALL),
  { brands: ['sorento', 'cabana', 'mocha'], tiers: ['dealer', 'office', 'end_user'], unknown: [] });
eq('M2 end-user only', mapEntitlement(['End User']),
  { brands: [], tiers: ['end_user'], unknown: [] });
eq('M3 single compound', mapEntitlement(['Sorento Dealer']),
  { brands: ['sorento'], tiers: ['dealer'], unknown: [] });
eq('M4 unknown preserved, never guessed', mapEntitlement(['Sorento Dealer', 'Platinum VIP']),
  { brands: ['sorento'], tiers: ['dealer'], unknown: ['Platinum VIP'] });

console.log('── recompose (tier × brand ∩ entitlement -> TODAY\'s compound names) ──');
eq('R1 tier+brand', recompose(['dealer'], ['cabana'], ENTITLED_ALL),
  { access_levels: ['Cabana Dealer'], brand_gate_empty: false });
eq('R2 tier, no brand -> all entitled brands', recompose(['dealer'], [], ENTITLED_ALL),
  { access_levels: ['Cabana Dealer', 'Mocha Dealer', 'Sorento Dealer'], brand_gate_empty: false });
eq('R3 multi-tier + brand', recompose(['dealer', 'office'], ['sorento'], ENTITLED_ALL),
  { access_levels: ['Sorento Dealer', 'Sorento Office'], brand_gate_empty: false });
eq('R4 end_user tier -> the brandless name', recompose(['end_user'], [], ENTITLED_ALL),
  { access_levels: ['End User'], brand_gate_empty: false });
eq('R5 brand gate: named brand with zero entitlement', recompose(['dealer'], ['cabana'], ['Sorento Dealer', 'End User']),
  { access_levels: [], brand_gate_empty: true });
eq('R6 tier not entitled -> empty, no invention', recompose(['office'], [], ['Sorento Dealer', 'End User']),
  { access_levels: [], brand_gate_empty: false });
eq('R7 selects from CONTACT names, never string-built', recompose(['dealer'], ['sorento'], ['sorento dealer']),
  { access_levels: ['sorento dealer'], brand_gate_empty: false });
eq('R8 all three tiers ("all" pick) full entitlement', recompose(['dealer', 'office', 'end_user'], [], ENTITLED_ALL),
  { access_levels: ENTITLED_ALL.slice().sort((a, b) => ENTITLED_ALL.indexOf(a) - ENTITLED_ALL.indexOf(b)), brand_gate_empty: false });
// PINNED DECISION, not an accident: End User is BRANDLESS in today's data, so it survives a failed
// brand gate — "cabana end user promo" from a Sorento-only contact still answers with End User
// files, because that is exactly what today's CRM would serve them. The contract's item 3
// (end_user brand-scoping) may flip this; when it does, this pin is the line that goes red.
eq('R9 end_user survives brand gate (brandless today)', recompose(['end_user'], ['cabana'], ['Sorento Dealer', 'End User']),
  { access_levels: ['End User'], brand_gate_empty: true });

console.log('── statedTiers ──');
eq('S1 "promo for A dealer"', statedTiers('promo for SRTBF11710 dealer', []), ['dealer']);
eq('S2 no tier word', statedTiers('promo for SRTBF11710', []), []);
eq('S3 end user phrasing', statedTiers('any end user promo for 6047', []), ['end_user']);
eq('S4 tier from entity canonical', statedTiers('promo A', [{ raw: 'ofis', canonical_code: 'office', hint: 'access_levels' }]), ['office']);
eq('S5 compound stated ("Sorento Dealer")', statedTiers('Sorento Dealer', []), ['dealer']);
eq('S6 "dealership" must NOT match (word boundary)', statedTiers('promo for dealership programme', []), []);
eq('S7 malay pengedar', statedTiers('promosi pengedar untuk 6047', []), ['dealer']);

console.log('── needsTierAsk (plan D2) ──');
eq('A1 promo + unstated + multi-tier -> ASK', needsTierAsk('promotion', [], ['dealer', 'office', 'end_user']), true);
eq('A2 single tier -> silent', needsTierAsk('promotion', [], ['end_user']), false);
eq('A3 stated -> no ask', needsTierAsk('promotion', ['dealer'], ['dealer', 'office']), false);
eq('A4 non-promo domain -> never', needsTierAsk('inventory', [], ['dealer', 'office']), false);
eq('A5 zero tiers (no entitlement) -> no ask (no-access path owns it)', needsTierAsk('promotion', [], []), false);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
