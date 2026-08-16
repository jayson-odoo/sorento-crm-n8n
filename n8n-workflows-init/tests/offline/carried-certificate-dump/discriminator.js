// ── B1 presence discriminator ──────────────────────────────────────────────
// WHY THIS EXISTS (read before trusting any B1 result)
//
// B1 was silently reverted on the clone by a UI save and nobody noticed for a day.
// Every B1 regression check kept PASSING, because B2' (the parser-side certificate
// eviction) had shipped in the meantime: with the carried certificate evicted, the
// 26-row dump cannot occur whether or not B1 is present. The customer-visible TEXT is
// identical in both states, so a text assertion CANNOT distinguish them. It is a
// textbook LESSONS §61 "green that cannot fail" — the assertion was real, it just had
// no power against this particular difference.
//
// THE DISCRIMINATOR IS EXECUTION SHAPE, NOT TEXT:
//   B1 PRESENT  -> disallowed-entity-gate fails -> If3 output 0 -> not-found path.
//                  `Call 'sub-get-results'` is on the OTHER branch and CANNOT run.
//   B1 ABSENT   -> gate passes -> If3 output 1 -> sub-get-rag -> ... -> the sub RUNS
//                  (and, with B2' active, returns a correctly scoped result and the
//                  same friendly text).
//
// So: `Call 'sub-get-results'` ABSENT from runData is the signal. Assert absence of the
// NODE in runData — never a status, never the reply text (LESSONS §61a, §63 rule i/iv).
//
// This script is the OFFLINE half: it runs the real gate body and evaluates If3's REAL
// condition expression (sourced from the clone JSON, never retyped) to predict the
// branch. The live half is the §CD-1 runData assertion in tests/uac/CD.md.
//
//   node discriminator.js gate.before.js   # B1 absent  -> expect WILL RUN   (exit 1)
//   node discriminator.js gate.after.js    # B1 present -> expect WILL NOT   (exit 0)

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const bodyFile = process.argv[2] || path.join(dir, 'gate.after.js');
const body = fs.readFileSync(bodyFile, 'utf8');
const cases = require('./cases.json');

// The If3 condition, verbatim from the clone's workflow.json (node "If3", leftValue).
// Kept as data so a drift in the real node is visible as a diff here.
const IF3_CONDITION = `$('disallowed-entity-gate').first().json.gate_passed === false || (($('resolve-entity').first().json.unresolved_tokens || []).length > 0 && ($('disallowed-entity-gate').first().json.compatible_entities || []).length === 0)`;

function runGate(parserOut, resolverOut) {
  const $ = (n) => ({
    first: () => ({
      json: n === "Call 'sub-query-reformulator'" ? { output: parserOut }
          : n === 'resolve-entity' ? resolverOut : {},
    }),
  });
  const $input = { first: () => ({ json: {} }) };
  return new Function('$', '$input', body + '\n')($, $input);
}

function evalIf3(gateOut, resolverOut) {
  const $ = (n) => ({
    first: () => ({
      json: n === 'disallowed-entity-gate' ? gateOut
          : n === 'resolve-entity' ? resolverOut : {},
    }),
  });
  // TRUE  -> If3 output 0 -> If-incoming-picker -> not-found  (sub NOT called)
  // FALSE -> If3 output 1 -> Execute 'sub-get-rag' -> ... -> Call 'sub-get-results'
  return !!new Function('$', `return (${IF3_CONDITION});`)($);
}

// §CD-1 is the reported turn. It is the only fixture where B1 changes the branch.
const c = cases.find(x => x.name.startsWith('CD-1'));
if (!c) { console.error('FATAL: CD-1 fixture missing from cases.json'); process.exit(2); }

const gateOut = runGate(c.parser, c.resolver);
const if3 = evalIf3(gateOut, c.resolver);
const subWillRun = !if3;

console.log(`body            : ${path.basename(bodyFile)}`);
console.log(`B1 block present: ${/B1 attachment-subject-gate/.test(body)}`);
console.log(`fixture         : ${c.name}`);
console.log(`gate_passed     : ${gateOut.gate_passed}`);
console.log(`gate_reason     : ${JSON.stringify(gateOut.gate_reason)}`);
console.log(`If3 condition   : ${if3}  -> output ${if3 ? 0 : 1}`);
console.log(`=> Call 'sub-get-results' ${subWillRun ? 'WILL RUN        (B1-ABSENT signature)' : 'WILL NOT RUN    (B1-PRESENT signature)'}`);
console.log(`compared population: 1 fixture (§CD-1, the reported turn)`);

// Epistemics, stated rather than assumed:
//   If3 TRUE  is a HARD guarantee the sub cannot run — it is on the opposite branch.
//   If3 FALSE means the sub is REACHED; it is necessary, not sufficient, for it to run
//   (downstream gates exist). That asymmetry is fine: the assertion we ship is ABSENCE.
process.exit(subWillRun ? 1 : 0);
