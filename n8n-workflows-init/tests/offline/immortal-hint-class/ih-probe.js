#!/usr/bin/env node
// §IH assertions against a real `output_exchange` body, offline (no n8n, no network).
//   node ih-probe.js [bodyPath]      (default: oe.after.js)
// Exit 0 = all green, 1 = at least one RED. Prints the compared-population count (LESSONS §61b:
// an empty checker output is NEVER a pass).
//
// ⚠️ SCOPE LIMIT — state it before reading a green run. There is NO CUSTOMER BOUNDARY in here.
// Per LESSONS §63i every rendered-text claim still has to be made in the real run against
// `save-session-vars.user_response` / the sendmsg payload. This proves the node's OBJECT, which is
// exactly the half that was green for 170 assertions while the customer got bare text.
const path = require('path');
const fs = require('fs');
const { makeRunner, norm } = require('../carried-certificate-dump/oe-run');

const bodyPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'oe.after.js');
const basePath = path.join(__dirname, 'oe.before.js');
// 🔴 F-STALE (reviewer, 2026-08-08): prove the AFTER body is the PUBLISHED fork body.
const { assertMatchesExport } = require('../node-source');
if (path.basename(bodyPath) === 'oe.after.js') {
  const _v = assertMatchesExport('sub-semantic-parser-FORK', { [bodyPath]: 'output_exchange.js' });
  console.log(`oe.after.js verified == published fork ${String(_v).slice(0, 8)}`);
}
const cases = require('./ih-cases');
const run = makeRunner(bodyPath);
const runBase = makeRunner(basePath);

// ── the axis classification, taken from the BODY UNDER TEST — never re-implemented here ────────
// 🔴 The first draft of this probe RE-IMPLEMENTED the two-step fallback. That is the wrong-object
// class (LESSONS §63): under §IH-FP-1, which reverts `_ceAxisFor` but leaves DOMAIN_SUBJECT_AXIS
// declared, the re-implementation kept computing the FIXED answer and the class gate stayed green
// on a body that had the bug back. The probe now lifts the real function: `AXIS_BY_DOMAIN`,
// `HINT_AXIS_DEFAULT`, `_ceUnknownHints`, `DOMAIN_SUBJECT_AXIS` and `_ceAxisFor` are contiguous
// module-scope declarations, so the slice between them evaluates standalone.
function axisFnOf(p) {
  const body = fs.readFileSync(p, 'utf8');
  const a = body.indexOf('const AXIS_BY_DOMAIN');
  const b = body.indexOf('// ── ENTITY OPERATION EXECUTOR');
  if (a === -1 || b === -1 || b < a) throw new Error('cannot locate the axis slice in ' + p);
  return new Function(body.slice(a, b) + '\nreturn _ceAxisFor;')();
}
const axisFor = axisFnOf(bodyPath);

const stable = (v) => JSON.stringify(v, Object.keys(v || {}).sort ? undefined : undefined);
const deep = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let fails = 0, compared = 0;
const red = [];

for (const c of cases) {
  compared++;
  const problems = [];
  let out;
  try { out = run(c); } catch (e) { problems.push('THREW: ' + e.message); }

  if (out) {
    const o = out.output || {};
    const ents = Array.isArray(o.entities) ? o.entities : [];
    const hints = ents.map(e => norm(e.hint));
    const raws = ents.map(e => norm(e.raw));
    const ex = c.expect || {};

    for (const h of ex.noHint || []) {
      if (hints.includes(norm(h))) {
        problems.push(`hint '${h}' PRESENT but must be gone -> ` +
          JSON.stringify(ents.filter(e => norm(e.hint) === norm(h))));
      }
    }
    for (const h of ex.hasHint || []) {
      if (!hints.includes(norm(h))) problems.push(`hint '${h}' MISSING (over-eviction) -> ${JSON.stringify(hints)}`);
    }
    for (const r of ex.hasRaw || []) {
      if (!raws.includes(norm(r))) problems.push(`raw '${r}' MISSING -> ${JSON.stringify(raws)}`);
    }
    for (const r of ex.noRaw || []) {
      if (raws.includes(norm(r))) problems.push(`raw '${r}' PRESENT but must be evicted -> ${JSON.stringify(raws)}`);
    }
    // C2: the hint the writer actually minted for a given raw
    for (const [raw, want] of Object.entries(ex.hintOfRaw || {})) {
      const hit = ents.find(e => norm(e.raw) === norm(raw));
      if (!hit) problems.push(`hintOfRaw: raw '${raw}' absent -> ${JSON.stringify(raws)}`);
      else if (norm(hit.hint) !== norm(want)) {
        problems.push(`hintOfRaw['${raw}'] === '${hit.hint}', want '${want}'`);
      }
    }
    // C1 class gate — recomputed with the body's OWN maps, not with a re-typed copy
    if (ex.noPrivateAxis) {
      const bad = ents.map(e => ({ e, ax: axisFor(e, o.domain_hint) })).filter(x => /^__/.test(x.ax));
      if (bad.length) {
        problems.push('PRIVATE AXIS survived: ' +
          JSON.stringify(bad.map(x => `${x.e.hint}:${x.e.raw} -> ${x.ax}`)));
      }
    }
    for (const [hint, wantAxis] of Object.entries(ex.axisOf || {})) {
      const got = axisFor({ hint }, o.domain_hint);
      if (got !== wantAxis) problems.push(`axisOf('${hint}') === '${got}', want '${wantAxis}'`);
    }
    // M2 contribution accounting, observed through B2′'s own diagnostic
    if (ex.noCarriedEvicted && o.carried_attachment_evicted) {
      problems.push('carried_attachment_evicted fired on a turn that contributed NOTHING -> ' +
        JSON.stringify(o.carried_attachment_evicted) +
        '  (this is the C1-without-M2 regression)');
    }
    if (ex.carriedEvicted && !o.carried_attachment_evicted) {
      problems.push('carried_attachment_evicted did NOT fire on a genuine this-turn pick ' +
        '(the exemption was removed entirely instead of made this-turn-only)');
    }
    if (ex.unknownHints) {
      const got = o.unknown_entity_hints || [];
      for (const h of ex.unknownHints) {
        if (!got.includes(h)) {
          problems.push(`unknown_entity_hints missing '${h}' -> ${JSON.stringify(got)}` +
            '  (F3: the diagnostic is blind to dormant carried entities)');
        }
      }
    }
    if (ex.noUnknownHints && o.unknown_entity_hints) {
      problems.push('unknown_entity_hints emitted -> ' + JSON.stringify(o.unknown_entity_hints) +
        '  (the narrow guard should have prevented the unknown from being minted)');
    }
    // non-interference: whole returned object identical to the pre-change body
    if (ex.byteIdentical) {
      let base;
      try { base = runBase(c); } catch (e) { base = { __threw: e.message }; }
      if (!deep(base, out)) {
        problems.push('NOT byte-identical to the pre-change body\n     before: ' +
          JSON.stringify((base.output || {}).entities) + '\n     after:  ' +
          JSON.stringify(ents));
      }
    }
  }

  if (problems.length) { fails++; red.push(c.id); console.log('RED  ' + c.id); for (const p of problems) console.log('     ' + p); }
  else console.log('ok   ' + c.id);
}

// machine-readable red-set for ih-mutate.sh: the leading token of each RED fixture's id
console.log('REDKEYS:' + red.map(id => ' ' + id.split(/\s+/)[0]).join(''));
console.log(`compared population: ${compared} fixtures against ${path.basename(bodyPath)}`);
console.log(fails ? `RED ${fails}/${compared}  [${red.join(' ')}]` : `GREEN ${compared}/${compared}`);
process.exit(fails ? 1 : 0);
void stable;
