#!/usr/bin/env node
// ── access-tier mapper probe ─────────────────────────────────────────────────────────────
// Offline gate for tests/offline/access-tier/mapper.js (plan §3/§4). Fixtures are REAL:
// ENTITLED_ALL is the verbatim Aggregate.name[] from live execs 12031183 / 12024557 / 12020037.
// Run: node probe.js   (exit 1 on any failure — mutate.sh proves every assertion can go red)
const { parseLevel, mapEntitlement, recompose, statedTiers, statedBrands, needsTierAsk } = require('./mapper.js');

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
  { access_levels: ['Cabana Dealer'], brand_gate_empty: false, brand_unheld: false });
eq('R2 tier, no brand -> all entitled brands', recompose(['dealer'], [], ENTITLED_ALL),
  { access_levels: ['Cabana Dealer', 'Mocha Dealer', 'Sorento Dealer'], brand_gate_empty: false, brand_unheld: false });
eq('R3 multi-tier + brand', recompose(['dealer', 'office'], ['sorento'], ENTITLED_ALL),
  { access_levels: ['Sorento Dealer', 'Sorento Office'], brand_gate_empty: false, brand_unheld: false });
eq('R4 end_user tier -> the brandless name', recompose(['end_user'], [], ENTITLED_ALL),
  { access_levels: ['End User'], brand_gate_empty: false, brand_unheld: false });
eq('R5 brand gate: named brand with zero entitlement', recompose(['dealer'], ['cabana'], ['Sorento Dealer', 'End User']),
  { access_levels: [], brand_gate_empty: true, brand_unheld: true });
eq('R6 tier not entitled -> empty, no invention', recompose(['office'], [], ['Sorento Dealer', 'End User']),
  { access_levels: [], brand_gate_empty: false, brand_unheld: false });
eq('R7 selects from CONTACT names, never string-built', recompose(['dealer'], ['sorento'], ['sorento dealer']),
  { access_levels: ['sorento dealer'], brand_gate_empty: false, brand_unheld: false });
eq('R8 all three tiers ("all" pick) full entitlement', recompose(['dealer', 'office', 'end_user'], [], ENTITLED_ALL),
  { access_levels: ENTITLED_ALL.slice().sort((a, b) => ENTITLED_ALL.indexOf(a) - ENTITLED_ALL.indexOf(b)), brand_gate_empty: false, brand_unheld: false });
// 🔴 R9 REWRITTEN 2026-08-11 — the original pin ENCODED A BUG and shipped it.
// It asserted `{access_levels:['End User'], brand_gate_empty:true}` and I called that correct,
// reasoning only about the access_levels half. At the time `brand_gate_empty` merely selected a
// notice, so a true value beside a non-empty list looked harmless. Then D10 gave that flag teeth —
// it now SUPPRESSES the answer and every attachment — and the pin became a self-contradiction the
// suite was actively defending: "here is what you may see" + "send nothing".
// Live symptom (exec 12045520, entitlement ['End User'], "office promo for SRTBF11710"):
//   "You don't have access to office promotions — here's what you do have:"  …followed by nothing.
// Lesson: a flag's blast radius can change under a pin that only asserted the other half.
//
// INVARIANT now enforced and asserted: brand_gate_empty ⇒ access_levels is empty. The two jobs are
// split — `brand_unheld` drives the NOTICE, `brand_gate_empty` drives SUPPRESSION.
eq('R9 end_user survives a named brand it does not hold: notice, but NOT suppression',
  recompose(['end_user'], ['cabana'], ['Sorento Dealer', 'End User']),
  { access_levels: ['End User'], brand_gate_empty: false, brand_unheld: true });
eq('R10 brandless entitlement has NO brand restriction to enforce (F1)',
  recompose(['end_user'], ['cabana'], ['End User']),
  { access_levels: ['End User'], brand_gate_empty: false, brand_unheld: false });
eq('R11 F1 exact shape: brandless contact, office tier, brand inferred by the LLM',
  recompose(['office'], ['sorento'], ['End User']),
  { access_levels: [], brand_gate_empty: false, brand_unheld: false });
eq('R12 INVARIANT brand_gate_empty ⇒ nothing survived',
  recompose(['dealer'], ['cabana'], ['Sorento Dealer', 'End User']),
  { access_levels: [], brand_gate_empty: true, brand_unheld: true });

console.log('── statedTiers ──');
eq('S1 "promo for A dealer"', statedTiers('promo for SRTBF11710 dealer', []), ['dealer']);
eq('S2 no tier word', statedTiers('promo for SRTBF11710', []), []);
eq('S3 end user phrasing', statedTiers('any end user promo for 6047', []), ['end_user']);
eq('S4 tier from entity canonical', statedTiers('promo A', [{ raw: 'ofis', canonical_code: 'office', hint: 'access_levels' }]), ['office']);
eq('S5 compound stated ("Sorento Dealer")', statedTiers('Sorento Dealer', []), ['dealer']);
eq('S6 "dealership" must NOT match (word boundary)', statedTiers('promo for dealership programme', []), []);
eq('S7 malay pengedar', statedTiers('promosi pengedar untuk 6047', []), ['dealer']);

console.log('── statedBrands (BLOCKER-4: brand recovered from a COMPOUND stated level) ──');
// Measured live (fork execs 12041502 + 12041592, "cabana dealer promo for CBS212-WH"): the LLM
// emits NO brand entity — it puts the brand in `access_levels: ["Cabana Dealer"]`, because that
// is literally how today's levels are named. The first build read brands ONLY from entities, so
// query_brands was [] and the ask answered a Cabana question with Sorento Dealer files and NO
// notice. The signal was on the wire the whole time; normalisation threw the brand half away
// (parseLevel returns {brand, tier}; only .tier was consumed).
// Word order alone flipped it (exec 12041565, "cabana promo for CBS212-WH dealer" → entity
// present, gate fired) — so an entities-only read is phrasing-roulette on a SECURITY boundary.
eq('B1 brand from compound stated level', statedBrands([], ['Cabana Dealer']), ['cabana']);
eq('B2 brand from entity (unchanged)', statedBrands([{ raw: 'Cabana', hint: 'brand' }], []), ['cabana']);
eq('B3 union, deduped', statedBrands([{ raw: 'Mocha', hint: 'brand' }], ['Cabana Dealer']), ['cabana', 'mocha']);
eq('B4 brandless level contributes nothing', statedBrands([], ['End User']), []);
eq('B5 tier-token level contributes nothing', statedBrands([], ['dealer']), []);
eq('B6 none stated', statedBrands([], []), []);
eq('B7 non-brand entity ignored', statedBrands([{ raw: 'CBS212-WH', hint: 'product' }], []), []);

console.log('── needsTierAsk (plan D2) ──');
eq('A1 promo + unstated + multi-tier -> ASK', needsTierAsk('promotion', [], ['dealer', 'office', 'end_user']), true);
eq('A2 single tier -> silent', needsTierAsk('promotion', [], ['end_user']), false);
eq('A3 stated -> no ask', needsTierAsk('promotion', ['dealer'], ['dealer', 'office']), false);
eq('A4 non-promo domain -> never', needsTierAsk('inventory', [], ['dealer', 'office']), false);
eq('A5 zero tiers (no entitlement) -> no ask (no-access path owns it)', needsTierAsk('promotion', [], []), false);
// BLOCKER-3 (fork exec 12041783/12041879): with a suggest_offer roster pending, the parser
// resolved "2" correctly — then the ask fired anyway and DISCARDED the pick. Same for "the
// august one". The trigger had no way to see a pending non-tier roster or a continuation, so
// plan §2 row 5 ("a follow-up is a continuation, not a new ask") was unimplementable as written.
// 4th arg = pendingPick: a positional/continuation turn against a roster that is NOT the tier ask.
eq('A6 pending non-tier roster -> never ask (the pick owns the turn)',
  needsTierAsk('promotion', [], ['dealer', 'office'], { pendingPick: true }), false);
eq('A7 no pending pick -> unchanged', needsTierAsk('promotion', [], ['dealer', 'office'], { pendingPick: false }), true);
eq('A8 opts omitted -> back-compatible', needsTierAsk('promotion', [], ['dealer', 'office']), true);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
