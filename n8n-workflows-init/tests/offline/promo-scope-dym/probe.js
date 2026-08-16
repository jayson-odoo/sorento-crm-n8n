#!/usr/bin/env node
// ── promo-scope-dym ───────────────────────────────────────────────────────────────────────
// Two user-reported defects from the live chat console, 2026-08-10:
//
//   D-A  "6047 promo"  -> the correct 10-promotion list, and then, appended underneath:
//        `Couldn't find these: "6047" — did you mean: 1. UPDATED SORENTO HONEYCOMB KS ...`
//        The three "did you mean" rows are promotions that are ALREADY IN the list above.
//   D-B  "all" (the pick turn on a "bathroom furniture" roster) -> 15 files sent correctly,
//        and then the same block for "bathroom furniture".
//
// ROOT CAUSE (proved from execution 11889275, not inferred): `resolve-entity` returns
//   resolutions[0] = { token: "6047", resolved: false, ambiguous: true, matches: [15 promotions
//   every one of which is match_tier "via_product", never "exact"] }
// `disallowed-entity-gate` then lifts all 15 of those matches into `compatible_entities` — that
// IS the answer the customer received. But nothing writes `resolved: true` back onto the
// resolution, so compile-current-state's partial-miss block (dym-partial-disambiguation v3 §2.1)
// classifies the token as a genuine miss and offers 3 of the answer's own rows back as
// "did you mean".
//
// This is the FIFTH surface of the same class — the container-status fix already special-cased
// `resolved_by === 'document-class-narrowing'` in this exact filter. That fix was per-mechanism.
// The fix here is the general one the class has been asking for: a token whose OWN candidates
// became the answer is not a miss, whatever mechanism promoted them.
//
// Fixtures are the two real executions, captured whole — every one of the 13 $() reads
// compile-current-state performs is stubbed from the same run, so a green here is a statement
// about the bytes that actually ran.
//
//   node probe.js before   -> D-A/D-B RED  (the defects reproduce against the published body)
//   node probe.js          -> all GREEN    (against ./compile-current-state.after.js)
//
// BLIND SPOT, stated: this asserts `output.user_response`, which IS the customer boundary for
// this node (crossdomain-compose -> save-session-vars -> sendmsg carries it verbatim), but it
// does NOT prove the attachments/roster downstream. The end-to-end run does that.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadNodes } = require('../node-source');

const MODE = process.argv[2] === 'before' ? 'before' : 'after';
// `after` is byte-checked against the PUBLISHED export (node-source doctrine, LESSONS §63) —
// a green here is a statement about the bytes that are live on the fork, not about a local copy.
// `before` is a FROZEN snapshot of the pre-fix body: once the fix is published the export IS the
// fix, so reading `before` from the export would silently turn the RED baseline green.
const SRC = MODE === 'before'
  ? fs.readFileSync(path.join(__dirname, 'compile-current-state.before.js'), 'utf8')
  : (() => {
      const disk = fs.readFileSync(path.join(__dirname, 'compile-current-state.after.js'), 'utf8');
      const pub  = loadNodes('fork-promo-picker-spine', ['compile-current-state.js'])['compile-current-state.js'];
      if (disk !== pub) {
        // PREPUBLISH=1 is the ONLY way past this, it is loud, and it stamps the run banner —
        // so a pasted "19/19 passed [after]" can never be mistaken for a deployed result.
        if (process.env.PREPUBLISH === '1') {
          console.log('⚠️  PREPUBLISH=1 — running against a body that is NOT deployed. This result');
          console.log('    proves nothing about the fork until the PUT + byte-gate has run.\n');
        } else {
          console.log('FATAL: compile-current-state.after.js has DRIFTED from the published export.');
          console.log('  A result from a body that is not deployed is void, not weak.');
          console.log('  Iterating pre-publish? re-run with PREPUBLISH=1 (it will say so in the output).');
          process.exit(2);
        }
      }
      return disk;
    })();

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

function run(fx) {
  const stubs = fx.stubs;
  const $ = (name) => ({
    isExecuted: Object.prototype.hasOwnProperty.call(stubs, name) && stubs[name] !== null,
    first: () => {
      if (!Object.prototype.hasOwnProperty.call(stubs, name) || stubs[name] === null) {
        throw new Error(`node "${name}" did not execute`);   // matches n8n's own throw
      }
      return { json: stubs[name] };
    },
  });
  const input = JSON.parse(JSON.stringify(fx.input));
  const $input = { first: () => ({ json: input }) };
  const ctx = vm.createContext({
    $, $input, $json: input, $execution: { id: fx.execution_id },
    console, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp, Math, Date, isNaN, parseInt, parseFloat,
  });
  return vm.runInContext(`(function(){${SRC}\n})()`, ctx);
}

const checks = [];
const check = (id, desc, pass, detail) => checks.push({ id, desc, pass, detail });

// ── D-A : "6047 promo" — a scope token whose matches became the answer -----------------------
{
  const out = run(FX.T6047);
  const msg = String(out.user_response || '');
  check('A1', 'no "Couldn\'t find these" block on the answered promotion turn',
        !/Couldn't find these/.test(msg), msg.slice(-300));
  check('A2', 'the token "6047" is not offered back as a did-you-mean',
        !/"6047" — did you mean/.test(msg), msg.slice(-300));
  check('A3', 'the promotion list itself is intact (all 10 rows still rendered)',
        (msg.match(/^\d+\. \*Promotion:\*/gm) || []).length === 10,
        `rows=${(msg.match(/^\d+\. \*Promotion:\*/gm) || []).length}`);
  check('A4', 'no dym roster is armed for a turn with no genuine miss',
        !out.variables.dym_last_result_set, JSON.stringify(out.variables.dym_last_result_set));
  check('A5', 'dym_offer is not armed either (it outlives the turn — dym-single-use-fix)',
        !out.variables.dym_offer, JSON.stringify(out.variables.dym_offer));
}

// ── D-B : the "all" pick turn on a "bathroom furniture" roster --------------------------------
{
  const out = run(FX.TALL);
  const msg = String(out.user_response || '');
  check('B1', 'no "Couldn\'t find these" block on the pick turn',
        !/Couldn't find these/.test(msg), msg.slice(-300));
  check('B2', '"bathroom furniture" is not offered back as a did-you-mean',
        !/bathroom furniture" — did you mean/.test(msg), msg.slice(-300));
  check('B3', 'the 15 picked promotions are still all listed',
        (msg.match(/^\d+\. \*Promotion:\*/gm) || []).length === 15,
        `rows=${(msg.match(/^\d+\. \*Promotion:\*/gm) || []).length}`);
  check('B4', 'no dym roster armed', !out.variables.dym_last_result_set,
        JSON.stringify(out.variables.dym_last_result_set));
}

// ── E : the LEGACY resolver shape. Same defect, second envelope --------------------------------
// Reported 2026-08-10, turn 2 of the same conversation: "6047 promo" (10 rows, clean) then
// "dealer version only" -> the correctly narrowed 4 DEALER rows AND `"6047" — not found.`
//
// resolve-entity did not return `resolutions[]` at all this turn. It returned the legacy blob
// { tokens, intersection, alternatives, unresolved_tokens, by_entity_type, empty, match_mode }
// with `unresolved_tokens: ["6047"]` and `intersection: [8 products, match_tier
// "brand_access_fallback", display.via_token: "6047"]` — the 8 that became compatible_entities and
// answered the turn. The block's legacy arm (`missResolutions = [r]`) fires, `tokenCandidates(r)`
// finds nothing renderable (no `matches`, empty `alternatives`), so it prints the bare
// `— not found.` line with the "Ask again with the correct code." footer.
//
// The A/B fix looked only at `matches`/`alternatives`, so it had nothing to overlap on here. The
// answer set in this shape lives in `intersection`. (exec 11891721)
{
  const out = run(FX.TDEALER);
  const msg = String(out.user_response || '');
  check('E1', 'legacy intersection shape: no "Couldn\'t find these" on the answered turn',
        !/Couldn't find these/.test(msg), msg.slice(-260));
  check('E2', 'the answered token is not declared not-found',
        !/"6047" — not found\./.test(msg), msg.slice(-260));
  check('E3', 'the 4 narrowed DEALER rows survive',
        (msg.match(/^\d+\. \*Promotion:\*/gm) || []).length === 4,
        `rows=${(msg.match(/^\d+\. \*Promotion:\*/gm) || []).length}`);
  check('E4', 'no dym roster armed', !out.variables.dym_last_result_set,
        JSON.stringify(out.variables.dym_last_result_set));
}
{
  // the legacy arm must still surface a token that really WAS missed: strip the answer set and
  // the same fixture has to go back to reporting the miss.
  const fx = JSON.parse(JSON.stringify(FX.TDEALER));
  fx.stubs['disallowed-entity-gate'].compatible_entities = [];
  fx.stubs['resolve-entity'].intersection = [];
  const out = run(fx);
  check('E5', 'legacy arm still reports a genuine miss when nothing was answered',
        /"6047" — not found\./.test(String(out.user_response || '')),
        String(out.user_response || '').slice(-200));
}

// ── F : one miss, one voice — a token the PICKER already reported is not repeated here ─────
{
  const fx = JSON.parse(JSON.stringify(FX.T6047));
  fx.stubs['resolve-entity'].tokens.push('showerx');
  fx.stubs['resolve-entity'].resolutions.push({
    token: 'showerx', resolved: false, ambiguous: false, matches: [], alternatives: [] });
  fx.stubs['disallowed-entity-gate'].resolutions = fx.stubs['resolve-entity'].resolutions;
  fx.stubs['promo-picker'] = Object.assign({}, fx.stubs['promo-picker'] || {},
    { _promo_notfound: { tokens: ['showerx'], reason: 'unmet_brand_only' } });
  const out = run(fx);
  const msg = String(out.user_response || '');
  check('F1', 'a picker-reported token is NOT repeated by the partial-miss block',
        !/"showerx"/.test(msg) && !/Couldn't find these/.test(msg), msg.slice(-220));
}
{
  // and WITHOUT the picker flag the block still fires — the dedup must not become a blanket mute
  const fx = JSON.parse(JSON.stringify(FX.T6047));
  fx.stubs['resolve-entity'].tokens.push('showerx');
  fx.stubs['resolve-entity'].resolutions.push({
    token: 'showerx', resolved: false, ambiguous: false, matches: [], alternatives: [] });
  fx.stubs['disallowed-entity-gate'].resolutions = fx.stubs['resolve-entity'].resolutions;
  const out = run(fx);
  check('F2', 'an UNreported genuine miss is still surfaced',
        /"showerx" — not found\./.test(String(out.user_response || '')),
        String(out.user_response || '').slice(-220));
}

// ── C : the partial-miss feature must SURVIVE. A token whose candidates did NOT become the
// answer is still a genuine miss and must still be surfaced. Built by mutating the real
// fixture: keep the answered token, add a second token that resolved to nothing the gate used.
{
  const fx = JSON.parse(JSON.stringify(FX.T6047));
  fx.stubs['resolve-entity'].tokens.push('srtxx9999');
  fx.stubs['resolve-entity'].resolutions.push({
    token: 'srtxx9999', resolved: false, ambiguous: true,
    matches: [{ entity_type: 'product', canonical_code: 'SRTXX9998', uuid: null,
                match_field: 'code', match_tier: 'fuzzy', similarity: 0.8,
                display: { description: 'A DIFFERENT PRODUCT' } }],
    alternatives: [],
  });
  fx.stubs['disallowed-entity-gate'].resolutions = fx.stubs['resolve-entity'].resolutions;
  const out = run(fx);
  const msg = String(out.user_response || '');
  check('C1', 'a GENUINE miss alongside the answered token is still surfaced',
        /Couldn't find these/.test(msg), msg.slice(-300));
  check('C2', 'the genuine miss names the right token, and ONLY it',
        /"srtxx9999" — did you mean/.test(msg) && !/"6047" — did you mean/.test(msg),
        msg.slice(-300));
  check('C3', 'its candidate is offered', /SRTXX9998/.test(msg), msg.slice(-300));
  check('C4', 'and the dym roster IS armed for it',
        Array.isArray(out.variables.dym_last_result_set) && out.variables.dym_last_result_set.length === 1,
        JSON.stringify(out.variables.dym_last_result_set));
}

// ── D : suppression must key on THIS token's own candidates, not on "some token was answered".
// A miss token whose candidates are absent from compatible_entities stays surfaced even when
// another token's candidates fill compatible_entities entirely (that is case C), and a miss
// token is NOT rescued by a code that merely appears in a DIFFERENT token's match list.
{
  const fx = JSON.parse(JSON.stringify(FX.T6047));
  // strip the gate's compatible_entities: nothing was consumed -> the answered token becomes a
  // genuine miss again, which is the pre-fix behaviour and the correct behaviour here.
  fx.stubs['disallowed-entity-gate'].compatible_entities = [];
  const out = run(fx);
  const msg = String(out.user_response || '');
  check('D1', 'with an EMPTY compatible_entities the token is surfaced again (no blanket mute)',
        /"6047" — did you mean/.test(msg), msg.slice(-300));
}

let bad = 0;
for (const c of checks) {
  if (!c.pass) bad++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.desc}`);
  if (!c.pass) console.log(`        ${String(c.detail).replace(/\n/g, '\n        ')}`);
}
console.log(`\n${checks.length - bad}/${checks.length} passed  [${MODE}]`);
process.exit(bad ? 1 : 0);
