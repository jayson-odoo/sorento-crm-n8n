#!/usr/bin/env node
// Offline probe for #11 (access level printed twice) and #12 (exact match not the
// representative). Runs the REAL `not-found-error-message` body against fixtures captured
// verbatim from live executions 11823791 (D1) and 11823769 (D2).
//
//   node probe.js nfem.before.js   -> both RED   (the defects reproduce)
//   node probe.js nfem.after.js    -> both GREEN
//
// Blind spots, stated up front: this asserts the PRODUCER node's `escalate_message`, not the
// customer boundary. escalate-catalog -> compile-current-state -> sendmsg still has to be
// asserted on a real run before any of this is believed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bodyFile = process.argv[2] || 'nfem.after.js';
const src = fs.readFileSync(path.join(__dirname, bodyFile), 'utf8');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

function runNode(fx) {
  const byName = {
    "Call 'sub-query-reformulator'": { output: fx.qf },
    'resolve-entity': fx.r,
    'disallowed-entity-gate': fx.gate,
  };
  const $ = (name) => {
    if (!(name in byName)) throw new Error(`no stub for $('${name}')`);
    return { first: () => ({ json: byName[name] }), isExecuted: true };
  };
  // the node mutates $input.first().json and returns it — give it a fresh copy each run
  const input = JSON.parse(JSON.stringify(fx.input));
  const $input = { first: () => ({ json: input }) };
  const ctx = vm.createContext({ $, $input, console, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp });
  return vm.runInContext(`(function(){${src}\n})()`, ctx);
}

const checks = [];
const check = (id, desc, pass, detail) => checks.push({ id, desc, pass, detail });

// ---- #11 : the access level must appear at most once -----------------------------------
{
  const out = runNode(FX.D1);
  const msg = String(out.escalate_message || '');
  const level = FX.D1.qf.access_levels[0];               // "Mocha Dealer"
  const occurrences = msg.split(level).length - 1;
  check('D1-1', `access level "${level}" appears exactly once`, occurrences === 1,
        `occurrences=${occurrences} | ${msg}`);
  check('D1-2', 'no doubled " for X for X"', !new RegExp(`for ${level}\\s+for ${level}`, 'i').test(msg),
        msg);
  check('D1-3', 'still names the domain and offers escalation',
        /promotion/i.test(msg) && /escalate/i.test(msg), msg);
}

// ---- #12 : the exact token match must be the representative -----------------------------
{
  const out = runNode(FX.D2);
  const msg = String(out.escalate_message || '');
  const token = FX.D2.r.tokens[0];                        // "SRTSH1040"
  const m = msg.match(/•\s*product:\s*([^\s(]+)/);
  const shown = m ? m[1] : null;
  check('D2-1', `representative is the exact match "${token}"`, shown === token,
        `shown=${shown} | ${msg.split('\n')[1]}`);
  check('D2-2', 'the (+N more) count is unchanged at 4', /\(\+4 more\)/.test(msg), msg);
  check('D2-3', 'access level still named once', (msg.split('Sorento Dealer').length - 1) === 1, msg);
}

{ // Q23 on the not-found path
  const fx = JSON.parse(JSON.stringify(FX.D1));
  fx.gate.access_notice = "You don't have access to Sorento Dealer promotions — here's what you do have:";
  const out = runNode(fx);
  const msg = String(out.escalate_message || '');
  check('Q23-NF', 'notice leads the not-found reply', /^You don't have access to Sorento Dealer/.test(msg), msg.slice(0,70));
  check('Q23-NF2','the original miss text still follows', /Could not find promotion/.test(msg), msg.slice(0,140));
}
let bad = 0;
for (const c of checks) {
  if (!c.pass) bad++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.desc}`);
  if (!c.pass) console.log(`        ${c.detail}`);
}
console.log(`\n${checks.length - bad}/${checks.length} passed  [${bodyFile}]`);
process.exit(bad ? 1 : 0);
