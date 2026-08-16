#!/usr/bin/env node
// ── brand-routing ─────────────────────────────────────────────────────────────────────────
// #16. Reported: "promo for CBS212-WH" (a CABANA product) escalates to
// `marketing_promotion_sorento`.
//
// The user's model, which settles it: **Cabana is a BRAND under the Sorento COMPANY.**
//
// That makes the `#9 multi-company routing` block wrong by construction. It names its variable
// `_brands` but reads `m.company_name`, and under this model `company_name` can only ever be
// "Sorento" or "Mocha" — Cabana never appears there. So the `cabana` arm of its `_VALID` list is
// unreachable, and every Cabana enquiry routes to the Sorento team. Measured (exec 11894257):
// CBS212-WH -> company_name "Sorento" -> company_team `marketing_promotion_sorento`.
//
// The parser's own enum was already right: `marketing_promotion_<brand>`, allowed values
// sorento|cabana|mocha. Only the gate was keying on company.
//
// Routing rule (user's words: "if not cabana, then sorento for the brands, so for those other
// brands also fall under sorento marketing promotion team"):
//     brand names a known team      -> that team          (Cabana -> cabana)
//     brand is absent / unknown     -> fall back to COMPANY  (Sorento -> sorento, Mocha -> mocha)
//     result set spans >1           -> null, as today (never collapse a mixed set)
//
// ⚠️ NOT FULLY INERT, and an earlier claim here that it was is WITHDRAWN. A first survey missed
// the `by_entity_type` pool and concluded "no resolution carries brand". Corrected survey over all
// four pools in the 8 captured executions:
//
//     match path                                    rows   carrying display.brand
//     brand_access / brand_access_fallback             8    8      ← brand IS emitted
//     product_code exact|and|prefix|substring         52    0
//     promotion_membership via_product                48    0
//     description substring                           15    0
//
// So brand arrives ONLY when the resolver matched via brand-access, never on a direct product-code
// lookup. Two consequences, both load-bearing:
//
//  1. this change is INERT on 115 of 123 rows but ACTIVE on the brand_access path — fixture
//     11891721 moves company_team null → marketing_promotion_sorento, because its rows carry
//     brand SORENTO while company_name is null. That is the intended behaviour (routing where we
//     previously could not route at all), so it is asserted EXPLICITLY below rather than hidden;
//  2. **it does NOT fix the reported CBS212-WH symptom on its own.** That turn matched
//     product_code/and, which carries no brand, so the gate still has only company_name="Sorento"
//     to go on. The CRM emitting brand on the product_code path is the load-bearing half.
//
//   node probe.js before   -> the brand cases go RED, the inert cases stay green
//   node probe.js          -> all green

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadNodes } = require('../node-source');

const MODE = process.argv[2] === 'before' ? 'before' : 'after';
const SRC = MODE === 'before'
  ? fs.readFileSync(path.join(__dirname, 'gate.before.js'), 'utf8')
  : (() => {
      const disk = fs.readFileSync(path.join(__dirname, 'gate.after.js'), 'utf8');
      const pub = loadNodes('fork-promo-picker-spine', ['disallowed-entity-gate.js'])['disallowed-entity-gate.js'];
      if (disk !== pub) {
        if (process.env.PREPUBLISH === '1') {
          console.log('⚠️  PREPUBLISH=1 — body is NOT deployed; this result proves nothing yet.\n');
        } else {
          console.log('FATAL: gate.after.js has DRIFTED from the published export.');
          console.log('  Iterating pre-publish? re-run with PREPUBLISH=1.');
          process.exit(2);
        }
      }
      return disk;
    })();

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

function run(fx) {
  const stubs = fx.stubs;
  const $ = (n) => ({
    isExecuted: stubs[n] !== null && stubs[n] !== undefined,
    first: () => {
      if (stubs[n] === null || stubs[n] === undefined) throw new Error(`node "${n}" did not execute`);
      return { json: stubs[n] };
    },
  });
  const input = JSON.parse(JSON.stringify(fx.input));
  const ctx = vm.createContext({
    $, $input: { first: () => ({ json: input }) }, console, JSON, Object, Array, Set, Map,
    String, Number, Boolean, RegExp, Math,
  });
  return vm.runInContext(`(function(){${SRC}\n})()`, ctx);
}

const checks = [];
const check = (id, desc, pass, detail) => checks.push({ id, desc, pass, detail });

// ── INERT / EXPECTED-CHANGE, decided PER FIXTURE by whether its rows actually carry a brand ──
// A blanket "nothing changed" would have to be relaxed the moment one fixture legitimately moves,
// and relaxing it by hand is how a suite stops noticing. Instead the classification is DERIVED
// from the fixture: no brand anywhere ⇒ must be byte-identical; brand present ⇒ must equal the
// stated new value, and the old value is printed so any future drift is visible.
const EXPECTED_CHANGE = {
  // rows carry brand SORENTO (+ OTHERS, which is unknown and defers); company_name is null, so
  // before the change there was nothing to route on at all.
  '11891721': { company_team: 'marketing_promotion_sorento', resolved_company: 'sorento', resolved_companies: ['sorento'] },
};
const hasBrand = (fx) => {
  const r = fx.stubs['resolve-entity'] || {};
  const pools = [].concat(r.intersection || [], r.alternatives || [],
    ...(r.resolutions || []).map(x => x.matches || []),
    ...Object.values(r.by_entity_type || {}));
  return pools.some(m => m && m.display && m.display.brand);
};
for (const [eid, fx] of Object.entries(FX)) {
  const out = run(fx);
  // POST-DEPLOY fixtures were recorded from the CRM release that emits brand on every match path
  // (sorento-crm PR #118, deployed 2026-08-10). Their `observed` IS the new contract, so they are
  // asserted as plain equality — no before/after classification applies to them.
  if (fx.post_deploy) {
    for (const k of ['company_team', 'resolved_company', 'resolved_companies', 'gate_passed', 'require_specific', 'access_notice']) {
      check(`LIVE-${eid}-${k}`, `${eid} (post-deploy): ${k} matches the recorded live output`,
            JSON.stringify(out[k]) === JSON.stringify(fx.observed[k]),
            `got ${JSON.stringify(out[k])} want ${JSON.stringify(fx.observed[k])}`);
    }
    continue;
  }
  const exp = EXPECTED_CHANGE[eid];
  check(`CLASS-${eid}`, `${eid}: brand presence matches its classification`,
        !!exp === hasBrand(fx), `hasBrand=${hasBrand(fx)} classified_as_changed=${!!exp}`);
  if (exp) {
    for (const [k, v] of Object.entries(exp)) {
      check(`CHANGED-${eid}-${k}`, `${eid}: ${k} moves to the brand-derived value`,
            JSON.stringify(out[k]) === JSON.stringify(v),
            `got ${JSON.stringify(out[k])} want ${JSON.stringify(v)} (was ${JSON.stringify(fx.observed[k])})`);
    }
    continue;
  }
  for (const k of ['company_team', 'resolved_company', 'gate_passed', 'require_specific', 'access_notice']) {
    check(`INERT-${eid}-${k}`, `${eid}: ${k} unchanged vs the recorded live output`,
          JSON.stringify(out[k]) === JSON.stringify(fx.observed[k]),
          `got ${JSON.stringify(out[k])} want ${JSON.stringify(fx.observed[k])}`);
  }
  check(`INERT-${eid}-companies`, `${eid}: resolved_companies unchanged`,
        JSON.stringify(out.resolved_companies) === JSON.stringify(fx.observed.resolved_companies),
        `got ${JSON.stringify(out.resolved_companies)}`);
}

// ── the CBS212-WH turn, once the CRM emits brand ──────────────────────────────
// Same fixture, one field added exactly where the CRM would put it.
const withBrand = (eid, brand) => {
  const fx = JSON.parse(JSON.stringify(FX[eid]));
  const r = fx.stubs['resolve-entity'];
  const stamp = (m) => { if (m && m.entity_type === 'product') { m.display = m.display || {}; m.display.brand = brand; } };
  (r.intersection || []).forEach(stamp);
  (r.alternatives || []).forEach(stamp);
  (r.resolutions || []).forEach(x => (x.matches || []).forEach(stamp));
  Object.values(r.by_entity_type || {}).forEach(a => (a || []).forEach(stamp));
  return fx;
};

{
  // THE REPORTED BUG, on a REAL post-deploy envelope rather than a stamped-in brand.
  // exec 11909651: CBS212-WH, match_field product_code / tier "and", now carrying
  // display.brand = { brand_code: "CABANA" } alongside company_name "Sorento".
  const out = run(FX['11909651']);
  check('R1', 'the real CBS212-WH envelope routes to the CABANA team',
        out.company_team === 'marketing_promotion_cabana', String(out.company_team));
  check('R2', 'brand beat company on a real envelope (company_name is still "Sorento")',
        out.resolved_company === 'cabana', String(out.resolved_company));
}
{
  // and the regression side: a Sorento-scoped list must NOT be dragged off-team. Promotion rows
  // still carry no brand post-deploy, so this falls back to company — asserted so that the day
  // promotions DO carry brand, a mixed set shows up here instead of in production.
  const out = run(FX['11909719']);
  check('R3', 'a Sorento bathroom-furniture list still routes sorento',
        out.company_team === 'marketing_promotion_sorento', String(out.company_team));
}
{
  const out = run(withBrand('11894257', { brand_id: 'x', brand_code: 'CABANA', brand_name: 'Cabana' }));
  check('B1', 'a Cabana-branded product routes to the CABANA team',
        out.company_team === 'marketing_promotion_cabana', String(out.company_team));
  check('B2', 'and resolved_company reports cabana, not the parent company',
        out.resolved_company === 'cabana', String(out.resolved_company));
}
{
  // "if not cabana, then sorento" — an unknown brand must NOT invent a team, it falls back to the
  // company, which is the parent. OTHERS is a real value in this data.
  const out = run(withBrand('11894257', { brand_id: 'y', brand_code: 'OTHERS', brand_name: 'OTHERS' }));
  check('B3', 'an unknown brand falls back to the COMPANY team (sorento)',
        out.company_team === 'marketing_promotion_sorento', String(out.company_team));
}
{
  const out = run(withBrand('11894257', null));
  check('B4', 'brand present but null behaves exactly like brand absent',
        out.company_team === 'marketing_promotion_sorento', String(out.company_team));
}
{
  // brand as a bare string, not an object — the CRM may ship either shape
  const out = run(withBrand('11894257', 'Cabana'));
  check('B5', 'a bare-string brand is understood too', out.company_team === 'marketing_promotion_cabana', String(out.company_team));
}
{
  // MIXED result set: a category search spanning Sorento and Cabana promos must NOT be collapsed
  // to whichever matched first. That is the dedup-by-code failure shape, and it is why the
  // existing block requires exactly one.
  const fx = JSON.parse(JSON.stringify(FX['11894257']));
  const prods = (fx.stubs['resolve-entity'].intersection || []).filter(m => m.entity_type === 'product');
  const extra = JSON.parse(JSON.stringify(prods[0]));
  extra.uuid = 'other-uuid'; extra.canonical_code = 'SRTBF0001';
  extra.display = Object.assign({}, extra.display, { brand: { brand_name: 'Sorento' } });
  prods[0].display = Object.assign({}, prods[0].display, { brand: { brand_name: 'Cabana' } });
  fx.stubs['resolve-entity'].intersection.push(extra);
  const out = run(fx);
  check('B6', 'a mixed Cabana+Sorento set resolves to NO team rather than an arbitrary one',
        out.company_team === null && out.resolved_companies.length === 2,
        `${out.company_team} / ${JSON.stringify(out.resolved_companies)}`);
  // company_team is not the only consumer — `resolved_company` is read downstream too, so the
  // "never collapse a mixed set" rule has to hold on BOTH fields or a mutant that drops the
  // length check on one of them survives. (It did: mutant Q5.)
  check('B6b','and resolved_company is null too, not the first match',
        out.resolved_company === null, String(out.resolved_company));
}
{
  // An unknown brand must DEFER to the company, not default to sorento. On a Sorento-company
  // product both answers coincide, so that case cannot tell the two apart — use a Mocha-company
  // product, where defaulting would misroute. (Mutant Q2 survived until this existed.)
  const fx = withBrand('11894257', { brand_name: 'OTHERS', brand_code: 'OTHERS' });
  const r = fx.stubs['resolve-entity'];
  const touch = (m) => { if (m && m.entity_type === 'product') m.company_name = 'Mocha'; };
  (r.intersection || []).forEach(touch);
  (r.alternatives || []).forEach(touch);
  (r.resolutions || []).forEach(x => (x.matches || []).forEach(touch));
  Object.values(r.by_entity_type || {}).forEach(a => (a || []).forEach(touch));
  const out = run(fx);
  check('B8', 'unknown brand on a MOCHA-company product routes to mocha, not sorento',
        out.company_team === 'marketing_promotion_mocha', String(out.company_team));
}
{
  // brand must not leak outside the promotion domain — these team names are promotion-only
  const fx = withBrand('11893115', { brand_name: 'Cabana' });   // domain: inventory
  const out = run(fx);
  check('B7', 'brand routing stays off on a non-promotion domain',
        out.company_team === null, String(out.company_team));
}

{
  // The customer named a brand; the rows carry none (promotion rows still do not) and their
  // company is the PARENT. Without this the Cabana enquiry routes to the Sorento team.
  const fx = JSON.parse(JSON.stringify(FX['11909719']));
  fx.stubs["Call 'sub-query-reformulator'"].output.entities =
    [{ raw: 'Cabana', hint: 'brand', current_message: true, confident: true }];
  const out = run(fx);
  check('P1', 'a parser-named brand beats the company', out.company_team === 'marketing_promotion_cabana', String(out.company_team));
}
{
  // but it must NOT beat the row's OWN brand — the data wins over what was typed
  const fx = JSON.parse(JSON.stringify(FX['11909651']));   // rows carry brand CABANA
  fx.stubs["Call 'sub-query-reformulator'"].output.entities =
    [{ raw: 'Mocha', hint: 'brand', current_message: true, confident: true }];
  const out = run(fx);
  check('P2', "the row's own brand still outranks the typed one",
        out.company_team === 'marketing_promotion_cabana', String(out.company_team));
}
{
  // a non-brand entity must not be read as a brand
  const fx = JSON.parse(JSON.stringify(FX['11909719']));
  fx.stubs["Call 'sub-query-reformulator'"].output.entities =
    [{ raw: 'Cabana', hint: 'category', current_message: true, confident: true }];
  const out = run(fx);
  check('P3', 'only a brand-HINTED entity is used', out.company_team === 'marketing_promotion_sorento', String(out.company_team));
}
{
  // an unknown brand name is not a team
  const fx = JSON.parse(JSON.stringify(FX['11909719']));
  fx.stubs["Call 'sub-query-reformulator'"].output.entities =
    [{ raw: 'Acme', hint: 'brand', current_message: true, confident: true }];
  const out = run(fx);
  check('P4', 'an unrecognised brand falls through to company', out.company_team === 'marketing_promotion_sorento', String(out.company_team));
}

let bad = 0;
for (const c of checks) {
  if (!c.pass) bad++;
  if (!c.pass || !c.id.startsWith('INERT')) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.desc}`);
  if (!c.pass) console.log(`        ${c.detail}`);
}
const inert = checks.filter(c => c.id.startsWith('INERT'));
console.log(`(${inert.filter(c => c.pass).length}/${inert.length} INERT checks passed, not listed individually)`);
console.log(`\n${checks.length - bad}/${checks.length} passed  [${MODE}]`);
process.exit(bad ? 1 : 0);
