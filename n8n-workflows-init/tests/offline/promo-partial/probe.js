#!/usr/bin/env node
// ── promo-partial ─────────────────────────────────────────────────────────────────────────
// Two reports from the console, 2026-08-10, both about a promotion turn telling the customer
// something that is not true of what actually happened.
//
// ── A. `promo for CBS212-WH & SRTBF11834` (exec 11917322) ────────────────────────────────
// 7 promotions listed, every one of them SRTBF11834's. CBS212-WH has none, and the reply never
// says so — the customer reads a list under a heading naming both products and has no way to tell
// which product it answers for. Stock already decomposes per product; promotions do not.
//   resolve-entity: token CBS212-WH  -> resolved, 1 product match, ZERO promotion matches
//                   token SRTBF11834 -> 10 promotion matches, each display.products ["SRTBF11834"]
// So the linkage needed to itemize is already on the wire: promotion rows carry display.products.
//
// ── B. `promo for SRTWB247` (exec 11917052) ──────────────────────────────────────────────
//   Here's what you want:
//   • promotion: SORENTO PP PROMO COMBINE_29072026.pdf
//   • product: SRTWB247 (+1 more)
//   But no promotion matched these. …
// Self-contradictory: it names the promotion, then says none matched. Cause, measured:
//   - resolver DID resolve that promotion this turn (promotion_membership / via_product),
//     display.is_active TRUE, display.products ["SRTWB247"] — not a stale carry
//   - the contact's entitlement is Aggregate.name = ["End User"]
//   - get-results ran with that access filter and returned 0 rows (the promo is Office-only)
// So it is an ENTITLEMENT miss, not a data miss, and the system holds every fact needed to say so.
//
//   node probe.js before   -> A/B cases RED
//   node probe.js          -> green

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadNodes } = require('../node-source');

const MODE = process.argv[2] === 'before' ? 'before' : 'after';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

function body(file) {
  if (MODE === 'before') return fs.readFileSync(path.join(__dirname, file.replace('.after.', '.before.')), 'utf8');
  const disk = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const exportName = file.replace('.after.js', '.js');
  const pub = loadNodes('fork-promo-picker-spine', [exportName])[exportName];
  if (disk !== pub) {
    if (process.env.PREPUBLISH === '1') {
      console.log(`⚠️  PREPUBLISH=1 — ${file} is NOT deployed; this result proves nothing yet.`);
    } else {
      console.log(`FATAL: ${file} has DRIFTED from the published export. PREPUBLISH=1 to iterate.`);
      process.exit(2);
    }
  }
  return disk;
}

function run(fx, file) {
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
    $, $input: { first: () => ({ json: input }) }, $json: input, $execution: { id: fx.execution_id },
    console, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp, Math,
  });
  return vm.runInContext(`(function(){${body(file)}\n})()`, ctx);
}

const checks = [];
const check = (id, desc, pass, detail) => checks.push({ id, desc, pass, detail });

// ── A — per-product itemization on an ANSWERED promotion turn ─────────────────
{
  const out = run(FX.TWO, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  const msg = String(env.response || '');
  check('A1', 'the reply says CBS212-WH has no promotion',
        /CBS212-WH/.test(msg) && /no promotion/i.test(msg), msg.slice(0, 320));
  check('A2', 'and does NOT claim the same for the product that DID have promotions',
        !/no promotion[^\n]*SRTBF11834/i.test(msg), msg.slice(0, 320));
  check('A3', 'the 7 promotions are still listed', (msg.match(/^\d+\. \*Promotion:\*/gm) || []).length === 7,
        `rows=${(msg.match(/^\d+\. \*Promotion:\*/gm) || []).length}`);
  check('A4', 'the roster is still 7 long (the note is display-only)',
        (env.suggest_last_result_set || []).length === 7, `len=${(env.suggest_last_result_set || []).length}`);
  check('A5', 'the itemization is recorded for inspection',
        Array.isArray(out._promo_unmatched) && out._promo_unmatched.includes('CBS212-WH'),
        JSON.stringify(out._promo_unmatched));
}

{
  // A single-product query must NOT be decomposed — there is nothing to disambiguate, and a
  // "No promotion found for X" under X's own list would contradict the list above it.
  const fx = JSON.parse(JSON.stringify(FX.TWO));
  const r = fx.stubs['resolve-entity'];
  r.tokens = ['SRTBF11834'];
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('A6', 'a single-product query gets no per-product note',
        !/No promotion found for/i.test(String(env.response || '')), String(env.response || '').slice(-140));
}

{
  // The `< 2` guard, tested where it actually bites: ONE named product that matches none of the
  // shown promotions. Without the guard this reports "No promotion found for CBS212-WH" directly
  // under a list of promotions the customer asked for — which is the single-product case the
  // not-found path already owns, so the note would be both redundant and contradictory.
  const fx = JSON.parse(JSON.stringify(FX.TWO));
  fx.stubs['resolve-entity'].tokens = ['CBS212-WH'];
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('A7', 'one named product, unmatched, still gets no note (the <2 guard)',
        !/No promotion found for/i.test(String(env.response || '')), String(env.response || '').slice(-160));
}

// ── C — STRICT NOT-FOUND on a brand-only-met broadened search ────────────────
// `any promo for cabana bathtub` (exec 11917835): brand Cabana matched, category `bathtub`
// contributed nothing, resolver broadened to the brand arm alone. USER DECISION (2026-08-11,
// affirmed twice): do not show the brand-only list — it reads as unrelated noise. Plain miss +
// escalation, nothing else.
{
  const out = run(FX.RELAX, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  const msg = String(env.response || '');
  check('C1', 'plain not-found naming the customer\'s whole ask',
        /^No promotion found for Cabana bathtub\./.test(msg.trim()), msg.slice(0, 160));
  check('C2', 'NO list of any kind — no numbered rows, no closest matches',
        !/\*Promotion:\*/.test(msg) && !/Closest matches/i.test(msg) && !/^I found/m.test(msg), msg.slice(0, 200));
  check('C3', 'escalation offered, in the wording the parser arms on',
        /would you like me to escalate to \S+ team\?/i.test(msg), msg.slice(-140));
  check('C4', 'attachments suppressed', (env.attachments || []).length === 0, `len=${(env.attachments || []).length}`);
  check('C5', 'no roster armed — a stray "1" must not pick an invisible row',
        (env.suggest_last_result_set || []).length === 0 && !env.suggest_selection_context,
        JSON.stringify({r: (env.suggest_last_result_set || []).length, c: env.suggest_selection_context}));
  check('C6', 'response_intro carries the same miss (consumers read it separately)',
        /^No promotion found for/.test(String(env.response_intro || '').trim()), String(env.response_intro || ''));
  check('C7', 'recorded with the reason', out._promo_notfound && out._promo_notfound.reason === 'unmet_brand_only',
        JSON.stringify(out._promo_notfound));
}
{
  // no unmet scope ⇒ untouched — the strict miss must never fire on an answered turn
  const fx = JSON.parse(JSON.stringify(FX.TWO));
  fx.stubs['resolve-entity'].tokens = ['SRTBF11834'];
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('C8', 'a fully-answered turn is untouched by the strict miss',
        !/No promotion found/i.test(String(env.response || '')) && !out._promo_notfound,
        String(env.response || '').slice(-160));
}
{
  // NOTHING contributed ⇒ the not-found path owns it; this node stays silent
  const fx = JSON.parse(JSON.stringify(FX.RELAX));
  fx.stubs['resolve-entity'].resolutions = (fx.stubs['resolve-entity'].resolutions || [])
    .map(r => Object.assign({}, r, { matches: [] }));
  fx.stubs['resolve-entity'].intersection = [];
  if (fx.stubs['resolve-entity'].by_entity_type) fx.stubs['resolve-entity'].by_entity_type = {};
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('C9', 'when NO token contributed, this node adds nothing (not-found path owns it)',
        !out._promo_notfound && !/No promotion found/i.test(String(env.response || '')),
        String(env.response || '').slice(-160));
}

{
  // exactly ONE row came back (the single-hit path leaves attachments untouched upstream) and it
  // still does not answer the ask — the strict miss must strip that file, or the customer gets a
  // "not found" WITH an attached PDF. This is the case mutant W3 exists for.
  const fx = JSON.parse(JSON.stringify(FX.RELAX));
  const env0 = (fx.input && typeof fx.input.output === 'object' && fx.input.output !== null) ? fx.input.output : fx.input;
  // keep an answer whose title matches a resolver description EXACTLY — the LLM strips parens on
  // some titles (known drift), and a parens-mismatched lone answer makes Cabana look unmet too,
  // which routes to the all-unmet deferral instead of the strict miss this case is about.
  const _descs = new Set((fx.stubs['resolve-entity'].resolutions[0].matches || [])
    .map(m => String((m.display || {}).description || '').trim().toLowerCase()));
  const _keep = (env0.answers || []).find(a => _descs.has(String(a.title || '').trim().toLowerCase()));
  env0.answers = [_keep].filter(Boolean);
  env0.attachments = [{ filename: 'CABANA SOMETHING.pdf', url: 'x' }];
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('C10', 'a single-hit not-found strips the attachment',
        out._promo_notfound && (env.attachments || []).length === 0,
        JSON.stringify({nf: !!out._promo_notfound, att: (env.attachments || []).length}));
}

// ── D — DISJOINT UNION collapses to the same strict not-found ────────────────
// `cabana kitchen tap promo` (exec 11963256): Cabana 15 promo matches, `kitchen tap` 6,
// intersection 0. Both tokens matched SOMETHING; no row satisfies the combination. USER DECISION:
// plain not-found, no cross-brand suggestions ("don't need to say about sorento").
{
  const out = run(FX.UNION, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  const msg = String(env.response || '');
  check('D1', 'plain not-found naming the whole ask',
        /^No promotion found for Cabana kitchen tap\./.test(msg.trim()), msg.slice(0, 160));
  check('D2', 'no list, no closest matches, no covers-both explainer',
        !/\*Promotion:\*/.test(msg) && !/Closest matches|covers both/i.test(msg), msg.slice(0, 200));
  check('D3', 'escalation offered in the armed wording',
        /would you like me to escalate to \S+ team\?/i.test(msg), msg.slice(-140));
  check('D4', 'attachments and roster fully suppressed',
        (env.attachments || []).length === 0 && (env.suggest_last_result_set || []).length === 0,
        JSON.stringify({a: (env.attachments || []).length, r: (env.suggest_last_result_set || []).length}));
  check('D5', 'recorded as disjoint', out._promo_notfound && out._promo_notfound.reason === 'disjoint',
        JSON.stringify(out._promo_notfound));
}
{
  // A NON-empty intersection means rows DO satisfy every token — the answer stands, no miss.
  const fx = JSON.parse(JSON.stringify(FX.UNION));
  const r = fx.stubs['resolve-entity'];
  r.intersection = (r.resolutions[0].matches || []).slice(0, 2);
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('D6', 'a non-empty intersection keeps the answer (no strict miss)',
        !out._promo_notfound && !/^No promotion found/.test(String(env.response || '').trim()),
        String(env.response || '').slice(0, 140));
}
{
  // one token contributes nothing + met token is the brand ⇒ SAME customer outcome via the
  // unmet_brand_only reason — the two internal paths must converge on one reply shape.
  const fx = JSON.parse(JSON.stringify(FX.UNION));
  fx.stubs['resolve-entity'].resolutions[1].matches = [];
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('D7', 'unmet category under a met brand converges on the same plain not-found',
        out._promo_notfound && out._promo_notfound.reason === 'unmet_brand_only'
        && /^No promotion found for Cabana kitchen tap\./.test(String(env.response || '').trim()),
        JSON.stringify(out._promo_notfound) + ' | ' + String(env.response || '').slice(0, 120));
}
{
  // single token cannot be disjoint with itself
  const fx = JSON.parse(JSON.stringify(FX.UNION));
  fx.stubs['resolve-entity'].tokens = ['Cabana'];
  const out = run(fx, 'promo-picker.after.js');
  check('D8', 'a single-token query never strict-misses',
        !out._promo_notfound, JSON.stringify(out._promo_notfound));
}

// ── E — WORD-LEVEL unmet via token_coverage (exec 12005497, "cabana shower set") ────────
// `set` substring-hit WATER CLO*SET*, intersection non-empty, customer got a water-closet PDF.
// The CRM's own coverage field says token "shower set" left "shower" unmatched — consumed now.
{
  const out = run(FX.COVER, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  const msg = String(env.response || '');
  check('E1', 'strict miss fires on the word-level unmet token',
        /^No promotion found for cabana shower set/.test(msg.trim()), msg.slice(0, 160));
  check('E2', 'the failing WORD is named, as the customer typed it',
        /could not find "shower"/.test(msg), msg.slice(0, 200));
  check('E3', 'escalation offered', /would you like me to escalate to \S+ team\?/i.test(msg), msg.slice(-140));
  check('E4', 'the water-closet PDF is NOT sent (real single-hit fixture, real attachment)',
        (env.attachments || []).length === 0, `att=${(env.attachments || []).length}`);
  check('E5', 'recorded with reason coverage_unmet and the words',
        out._promo_notfound && out._promo_notfound.reason === 'coverage_unmet'
        && JSON.stringify(out._promo_notfound.words) === '["shower"]',
        JSON.stringify(out._promo_notfound));
}
{
  // truncated:true ⇒ the claim is not supported ⇒ fail-open to the old behaviour
  const fx = JSON.parse(JSON.stringify(FX.COVER));
  for (const tc of fx.stubs['resolve-entity'].token_coverage)
    for (const c of (tc.coverage || [])) c.truncated = true;
  const out = run(fx, 'promo-picker.after.js');
  check('E6', 'truncated coverage is never consumed for a strict miss',
        !out._promo_notfound, JSON.stringify(out._promo_notfound));
}
{
  // promotion entry ABSENT ⇒ no claim ⇒ untouched
  const fx = JSON.parse(JSON.stringify(FX.COVER));
  for (const tc of fx.stubs['resolve-entity'].token_coverage)
    tc.coverage = (tc.coverage || []).filter(c => c.entity_type !== 'promotion');
  const out = run(fx, 'promo-picker.after.js');
  check('E7', 'an absent promotion entry makes no claim (membership rows rule)',
        !out._promo_notfound, JSON.stringify(out._promo_notfound));
}
{
  // all words matched ⇒ answered ⇒ untouched
  const fx = JSON.parse(JSON.stringify(FX.COVER));
  for (const tc of fx.stubs['resolve-entity'].token_coverage)
    for (const c of (tc.coverage || [])) { c.matched_words = (c.matched_words || []).concat(c.unmatched_words || []); c.unmatched_words = []; }
  const out = run(fx, 'promo-picker.after.js');
  const env = (out && typeof out.output === 'object' && out.output !== null) ? out.output : out;
  check('E8', 'fully-matched coverage leaves the answer untouched',
        !out._promo_notfound && (env.attachments || []).length === 1,
        JSON.stringify({nf: !!out._promo_notfound, att: (env.attachments || []).length}));
}
{
  // field absent entirely (OR path / pre-#121) ⇒ Map empty ⇒ old behaviour — proven by every
  // pre-#121 fixture in this suite, but assert it directly on this one too
  const fx = JSON.parse(JSON.stringify(FX.COVER));
  delete fx.stubs['resolve-entity'].token_coverage;
  const out = run(fx, 'promo-picker.after.js');
  check('E9', 'no coverage field ⇒ fail-open to pre-wiring behaviour',
        !out._promo_notfound, JSON.stringify(out._promo_notfound));
}

// ── B — an entitlement miss must not be reported as "nothing matched" ─────────
{
  const out = run(FX.ENT, 'not-found-error-message.after.js');
  const msg = String(out.escalate_message || '');
  check('B1', 'does NOT claim no promotion matched', !/no promotion[^\n]*matched these/i.test(msg), msg);
  check('B2', 'names the promotion it actually found',
        /SORENTO PP PROMO COMBINE_29072026\.pdf/.test(msg), msg);
  check('B3', 'says it is an ACCESS-LEVEL problem', /access level/i.test(msg), msg);
  check('B4', "names the contact's actual entitlement", /End User/.test(msg), msg);
  check('B5', 'still offers escalation to the right team',
        /escalate to marketing_promotion_sorento team/.test(msg), msg);
  check('B6', 'it is not a clarification (the escalate offer must survive)',
        out.is_clarification !== true, String(out.is_clarification));
}

// ── B bounds — the entitlement wording must not fire when it would be a lie ───
{
  // no promotion resolved at all ⇒ a genuine data miss ⇒ the original wording stands
  const fx = JSON.parse(JSON.stringify(FX.ENT));
  const r = fx.stubs['resolve-entity'];
  r.by_entity_type.promotion = [];
  r.intersection = (r.intersection || []).filter(m => m.entity_type !== 'promotion');
  fx.stubs['disallowed-entity-gate'].compatible_entities =
    (fx.stubs['disallowed-entity-gate'].compatible_entities || []).filter(e => e.entity_type !== 'promotion');
  const out = run(fx, 'not-found-error-message.after.js');
  check('B7', 'a genuine data miss still says nothing matched',
        /matched these/i.test(String(out.escalate_message || '')), String(out.escalate_message || '').slice(-160));
}
{
  // the resolved promotion is INACTIVE ⇒ it has ended; blaming access would be wrong
  const fx = JSON.parse(JSON.stringify(FX.ENT));
  fx.stubs['resolve-entity'].by_entity_type.promotion.forEach(m => { m.display.is_active = false; });
  (fx.stubs['resolve-entity'].intersection || []).forEach(m => { if (m.entity_type === 'promotion') m.display.is_active = false; });
  const out = run(fx, 'not-found-error-message.after.js');
  const msg = String(out.escalate_message || '');
  check('B8', 'an inactive promotion is reported as ended, not as an access problem',
        /ended|no longer/i.test(msg) && !/access level/i.test(msg), msg);
}
{
  // entitlement unknown (Aggregate did not run) ⇒ do not invent a level
  const fx = JSON.parse(JSON.stringify(FX.ENT));
  fx.stubs['Aggregate'] = null;
  const out = run(fx, 'not-found-error-message.after.js');
  const msg = String(out.escalate_message || '');
  check('B9', 'with no entitlement read, no access level is named',
        !/\(\s*\)/.test(msg) && !/access level \(/i.test(msg), msg);
  check('B10', 'and it still produces a usable reply', msg.length > 20 && /escalate/i.test(msg), msg);
}

{
  // the entitlement wording is promotion-only — these facts (Aggregate access levels, promotion
  // rows) mean nothing on a stock or order miss, and claiming them there would be nonsense.
  const fx = JSON.parse(JSON.stringify(FX.ENT));
  fx.stubs["Call 'sub-query-reformulator'"].output.domain_hint = 'inventory';
  const out = run(fx, 'not-found-error-message.after.js');
  check('B11', 'the entitlement wording does not fire outside the promotion domain',
        !/access level/i.test(String(out.escalate_message || '')), String(out.escalate_message || '').slice(-160));
}

let bad = 0;
for (const c of checks) {
  if (!c.pass) bad++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.desc}`);
  if (!c.pass) console.log(`        ${String(c.detail).replace(/\n/g, '\n        ')}`);
}
console.log(`\n${checks.length - bad}/${checks.length} passed  [${MODE}]`);
process.exit(bad ? 1 : 0);
