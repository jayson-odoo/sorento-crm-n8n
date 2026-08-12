// ── harness.js — offline probe for human-intervened-timeout (S1 gate, S2 sweeper, S3 config) ─────
//
// Runs the REAL node bodies from ./nodes/*.js against fixtures CAPTURED FROM REAL EXECUTIONS
// (./fixtures/*.json — provenance is recorded inside each file; LESSONS §64 forbids hand-built
// prior-state fixtures). Zero network, zero redis, zero n8n.
//
// WHY THE BODIES LIVE HERE AND NOT IN export/. ../node-source.js is the sanctioned loader and it
// reads from export/, which `export-workflows.py --verify` polices against live. These three
// workflows are NEW and not in the export set yet, so there is nothing to verify against. The
// substitute gate is `assert-built.py` check C4, which re-fetches all three workflows and asserts
// every deployed Code body is byte-identical to the file here. RUN IT FIRST — an offline suite is a
// cache and caches decay (LESSONS §72's "resync before trusting", §64's "verify the change is still
// PRESENT by sha at the START of every test pass").
//
// NOTE ON WHAT THIS SUITE CANNOT SEE. It executes Code-node bodies only. If conditions, redis key
// strings, executeWorkflow targets, credentials and the graph shape are workflow PARAMETERS, not
// code — §71's exact blind spot, which shipped two unreviewed hunks to production. `assert-built.py`
// C1–C8 covers all of them (and `--self-test` proves each of those checks can go red).
//
// usage:  node harness.js
// exit 0 = all green. Non-zero = at least one assertion red.

const fs = require('fs');
const path = require('path');

const P = __dirname;
// MUTATION MODE. mutate.sh stages a SCRATCH COPY of ./nodes and points here, so a fail-on-purpose
// run can never edit the tracked bodies (the artifact under audit). The banner is deliberate: a run
// in this mode proves an instrument works, it certifies nothing about what is published.
const NODES = process.env.OFFLINE_NODES_DIR || path.join(P, 'nodes');
if (process.env.OFFLINE_NODES_DIR) {
  console.log(`### MUTATION MODE — bodies read from ${NODES}, NOT from ./nodes. ` +
              'This run certifies nothing about what is deployed.');
}
const src = (f) => fs.readFileSync(path.join(NODES, f), 'utf8');
const mk = (f) => new Function('$', '$input', '$execution', '$now', src(f));

const GATE = mk('ht-gate.js');
const CENSUS = mk('ht-sweep-census.js');
const FANOUT = mk('ht-sweep-fanout.js');
const CLASSIFY = mk('ht-classify.js');
const CONFIG = mk('ht-config-apply.js');
const ARM = mk('ht-arm.js');
const CARRY = mk('ht-carry-contact.js');
const CARRYCLEAR = mk('ht-carry-clear.js');
const CLEARFLAG = mk('standin-ht-clear-flag.js');
const ECHO = mk('ht-config-echo.js');
const ENVELOPE = mk('harness-envelope.js');
const FINDCONTACT = mk('standin-ht-findcontact.js');
const ARMED = mk('ht-sweep-armed.js');

const fx = (f) => JSON.parse(fs.readFileSync(path.join(P, 'fixtures', f), 'utf8'));

// ── assertion plumbing ──────────────────────────────────────────────────────────────────────────
let fails = 0;
let checks = 0;
const eq = (name, got, want) => {
  checks++;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`); }
  else console.log(`ok   ${name}`);
};
const isTrue = (name, v) => eq(name, v === true, true);
const isFalse = (name, v) => eq(name, v === false, true);
const contains = (name, hay, needle) => {
  checks++;
  if (typeof hay !== 'string' || hay.indexOf(needle) === -1) {
    fails++; console.log(`FAIL ${name}\n  ${JSON.stringify(hay)} does not contain ${JSON.stringify(needle)}`);
  } else console.log(`ok   ${name}`);
};
const notContains = (name, hay, needle) => {
  checks++;
  if (typeof hay === 'string' && hay.indexOf(needle) !== -1) {
    fails++; console.log(`FAIL ${name}\n  ${JSON.stringify(hay)} MUST NOT contain ${JSON.stringify(needle)}`);
  } else console.log(`ok   ${name}`);
};
// An assertion that a call COMPLETES. Without this, a mutant that makes a body throw kills the
// process, mutate.sh sees a non-zero exit with zero FAIL lines, and a crash gets scored as a
// detection — the §72 defect. Every happy path that a mutation could turn into an exception is
// wrapped in this.
const noThrow = (name, fn) => {
  checks++;
  try { const v = fn(); console.log(`ok   ${name}`); return v; }
  catch (e) { fails++; console.log(`FAIL ${name}\n  threw unexpectedly: ${String(e.message || e)}`); return null; }
};
const throws = (name, fn, needle) => {
  checks++;
  let msg = null;
  try { fn(); } catch (e) { msg = String(e.message || e); }
  if (msg === null) { fails++; console.log(`FAIL ${name}\n  expected a THROW, got a clean return`); }
  else if (needle && msg.indexOf(needle) === -1) {
    fails++; console.log(`FAIL ${name}\n  threw, but not about ${JSON.stringify(needle)}: ${msg}`);
  } else console.log(`ok   ${name}  (threw: ${msg.slice(0, 70)}…)`);
};

// ── n8n shims ───────────────────────────────────────────────────────────────────────────────────
const item = (j, i) => ({ json: j, pairedItem: { item: i || 0 } });
const nodeStub = (jsons, executed = true) => ({
  isExecuted: executed,
  first: () => item(jsons[0]),
  all: () => jsons.map((j, i) => item(j, i)),
});
const missingNode = () => { throw new Error('no such node'); };
const dollar = (map) => (n) => {
  if (!(n in map)) missingNode();
  return map[n];
};
const nowAt = (ms) => ({ toMillis: () => ms });
const T0 = 1786500000000;   // a fixed "now" so every age/cutoff assertion is exact

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S1 — ht-gate
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runGate(o) {
  const env = { ...(o.env || fx('trigger-user-437264483.json').envelope) };
  if (o.test_run_id !== undefined) env.test_run_id = o.test_run_id;
  const map = {
    'Respond.io Trigger': nodeStub([env]),
  };
  // `null` here models an ABSENT REDIS KEY (the node ran, the property is present and null) — which is
  // the announce-flip shape. To model a BROKEN READ, omit the node with `broken: ['ht-cfg-pilot']`.
  const broken = o.broken || [];
  if (broken.indexOf('ht-cfg-enabled') === -1) map['ht-cfg-enabled'] = nodeStub([{ ht_enabled: o.enabled }]);
  if (broken.indexOf('ht-cfg-timeout') === -1) map['ht-cfg-timeout'] = nodeStub([{ ht_timeout_sec: o.timeout }]);
  if (broken.indexOf('ht-cfg-pilot') === -1) map['ht-cfg-pilot'] = nodeStub([{ ht_pilot: o.pilot }]);
  if (o.driftedPilot) map['ht-cfg-pilot'] = nodeStub([{ wrong_property: o.pilot }]);
  return GATE(dollar(map), { all: () => [item(env)], first: () => item(env) }, { id: 'x' }, nowAt(T0))[0].json;
}
const CFG_ON = { enabled: '1', timeout: '300', pilot: '437264483' };

console.log('\n── S1 ht-gate ──────────────────────────────────────────────────────────────────');

// HT-1 first human message: acts, and renders the timeout from redis rather than a constant.
{
  const g = runGate({ ...CFG_ON, test_run_id: 'HT-RUN-1' });
  isTrue('HT-1 should act', g.ht_should_act);
  eq('HT-1 skip reason', g.ht_skip_reason, null);
  eq('HT-1 contact id is a trimmed string', g.contact_id, '437264483');
  eq('HT-1 timeout honoured', g.ht_timeout_sec, 300);
  contains('HT-1 notice states 5 minutes', g.ht_notice, 'inactive for 5 minutes');
  contains('HT-1 notice opens with the locked wording', g.ht_notice, "You're now chatting with our team.");
  eq('HT-1 stamp value is the injected now', g.ht_now_ms, T0);
  eq('HT-1 test_run_id threaded for the egress log', g.test_run_id, 'HT-RUN-1');
}

// HT-3 source=api is ignored — the gate is independently correct, so the assertion does not rely
// on reading the upstream If's branch counts.
{
  const g = runGate({ ...CFG_ON, env: fx('trigger-api-437264483.json').envelope });
  isFalse('HT-3 api source does not act', g.ht_should_act);
  eq('HT-3 reason', g.ht_skip_reason, 'source-not-user');
}

// HT-4 kill-switch off
{
  isFalse('HT-4 enabled="0" is inert', runGate({ ...CFG_ON, enabled: '0' }).ht_should_act);
  eq('HT-4 reason', runGate({ ...CFG_ON, enabled: '0' }).ht_skip_reason, 'kill-switch-off');
  isFalse('HT-4 absent key is inert (fail-closed)', runGate({ ...CFG_ON, enabled: null }).ht_should_act);
  isFalse('HT-4 the whole cfg node missing is inert', runGate({ enabled: null, timeout: null, pilot: null }).ht_should_act);
  isFalse('HT-4 "true" is NOT accepted as on', runGate({ ...CFG_ON, enabled: 'true' }).ht_should_act);
  isFalse('HT-4 empty string is inert', runGate({ ...CFG_ON, enabled: '' }).ht_should_act);
  isTrue('HT-4 " 1 " with whitespace is accepted', runGate({ ...CFG_ON, enabled: ' 1 ' }).ht_should_act);
}

// HT-5 non-pilot contact inert while the allowlist is non-empty
{
  const g = runGate({ ...CFG_ON, env: fx('trigger-user-999999.json').envelope });
  isFalse('HT-5 non-pilot contact does not act', g.ht_should_act);
  eq('HT-5 reason', g.ht_skip_reason, 'not-in-pilot-allowlist');
  isTrue('HT-5 allowlist reported active', g.ht_pilot_active);
}

// HT-6 empty allowlist = everyone
{
  const g = runGate({ ...CFG_ON, pilot: '', env: fx('trigger-user-999999.json').envelope });
  isTrue('HT-6 empty allowlist acts on anyone', g.ht_should_act);
  isFalse('HT-6 allowlist reported inactive', g.ht_pilot_active);
  isTrue('HT-6 absent allowlist key acts on anyone',
    runGate({ ...CFG_ON, pilot: null, env: fx('trigger-user-999999.json').envelope }).ht_should_act);
  isTrue('HT-6 whitespace-only allowlist acts on anyone',
    runGate({ ...CFG_ON, pilot: ' , ', env: fx('trigger-user-999999.json').envelope }).ht_should_act);
}

// multi-id allowlist, and the number-vs-string comparison that would silently break it
{
  isTrue('allowlist matches when the id is one of several',
    runGate({ ...CFG_ON, pilot: '111,437264483, 222' }).ht_should_act);
  isFalse('allowlist does not match on a prefix', runGate({ ...CFG_ON, pilot: '43726448' }).ht_should_act);
}

// HT-13 sibling / HT-FP3 target: the rendered minutes come from redis, not from a constant.
{
  eq('timeout 60 → 1 minute', runGate({ ...CFG_ON, timeout: '60' }).ht_timeout_min, 1);
  // R8: the previous pin asserted the ungrammatical "1 minutes" as intended. Reachable — the form
  // accepts 1 minute and the floor is 60 s — and customer-facing.
  contains('R8 timeout 60 renders "1 minute", singular',
    runGate({ ...CFG_ON, timeout: '60' }).ht_notice, 'inactive for 1 minute,');
  notContains('R8 … and never "1 minutes"',
    runGate({ ...CFG_ON, timeout: '60' }).ht_notice, '1 minutes');
  contains('R8 plural is kept for everything else',
    runGate({ ...CFG_ON, timeout: '120' }).ht_notice, 'inactive for 2 minutes,');
  contains('timeout 120 renders 2 minutes', runGate({ ...CFG_ON, timeout: '120' }).ht_notice, 'inactive for 2 minutes');
  notContains('timeout 120 notice does not say 5', runGate({ ...CFG_ON, timeout: '120' }).ht_notice, '5 minutes');
  eq('timeout floor: 30s is clamped to 60s', runGate({ ...CFG_ON, timeout: '30' }).ht_timeout_sec, 60);
  eq('timeout absent falls back to 300s', runGate({ ...CFG_ON, timeout: null }).ht_timeout_sec, 300);
  eq('timeout garbage falls back to 300s', runGate({ ...CFG_ON, timeout: 'soon' }).ht_timeout_sec, 300);
  eq('timeout 0 falls back to 300s', runGate({ ...CFG_ON, timeout: '0' }).ht_timeout_sec, 300);
}

// a contact-less envelope must not act (and must not stamp a key called "active:")
{
  const env = JSON.parse(JSON.stringify(fx('trigger-user-437264483.json').envelope));
  delete env.contact.id;
  const g = runGate({ ...CFG_ON, env });
  isFalse('missing contact.id does not act', g.ht_should_act);
  eq('missing contact.id reason', g.ht_skip_reason, 'no-contact-id');
}

// ── finding #1 (rev5): a FAILED config read must never resolve to "act on everyone" ──────────────
//
// `readNode` collapsed "the read failed" and "the value is absent" into `undefined`, and
// `parsePilot(undefined)` is `[]`, which means EVERYONE. So if only the pilot leg broke — node renamed,
// `propertyName` drift, node not executed — while `enabled` still read "1", the PILOT phase acted on
// every real contact. Measured before the fix: contact 999999, not in the allowlist, came back
// `ht_should_act: true`.
//
// The kill-switch already failed closed; the allowlist is the one whose failure direction is a real
// customer receiving a message. Note the asymmetry that must survive: an empty-string VALUE still means
// everyone (that is the announce flip, deliberate); a failed READ does not.
console.log('\n── S1 config-read integrity ────────────────────────────────────────────────────');
{
  const nonPilot = fx('trigger-user-999999.json').envelope;
  const g = runGate({ ...CFG_ON, env: nonPilot, broken: ['ht-cfg-pilot'] });
  isFalse('a broken pilot read does NOT act on a non-pilot contact', g.ht_should_act);
  eq('… reason names the read failure, not the allowlist', g.ht_skip_reason, 'config-read-failure');
  eq('… and says which leg failed', g.ht_config_read_failures.length, 1);
  contains('… by name', g.ht_config_read_failures[0], 'ht-cfg-pilot');
  // the same break must not act on a PILOT contact either — we do not know the allowlist at all
  isFalse('… nor on a contact that happens to be in the real allowlist',
    runGate({ ...CFG_ON, broken: ['ht-cfg-pilot'] }).ht_should_act);
}
{
  isFalse('propertyName drift on the pilot node is a read FAILURE, not an empty allowlist',
    runGate({ ...CFG_ON, env: fx('trigger-user-999999.json').envelope, driftedPilot: true }).ht_should_act);
  eq('… reported as such',
    runGate({ ...CFG_ON, driftedPilot: true }).ht_skip_reason, 'config-read-failure');
}
{
  const g = runGate({ ...CFG_ON, broken: ['ht-cfg-timeout'] });
  isFalse('a broken timeout read also stops the lane', g.ht_should_act);
  eq('… reason', g.ht_skip_reason, 'config-read-failure');
}
// THE ASYMMETRY: an absent VALUE is still everyone. This is the announce flip and it must not regress.
{
  const g = runGate({ ...CFG_ON, pilot: null, env: fx('trigger-user-999999.json').envelope });
  isTrue('an ABSENT pilot VALUE still means everyone (the flip)', g.ht_should_act);
  eq('… with no read failure recorded', g.ht_config_read_failures, []);
  isTrue('an EMPTY-STRING pilot value likewise',
    runGate({ ...CFG_ON, pilot: '', env: fx('trigger-user-999999.json').envelope }).ht_should_act);
}
// ── S1 ht-arm: first-notice vs silent refresh ────────────────────────────────────────────────────
console.log('\n── S1 ht-arm ───────────────────────────────────────────────────────────────────');
function runArm(prevRaw, gateOverrides) {
  const g = { ...runGate({ ...CFG_ON, test_run_id: 'HT-RUN-1' }), ...(gateOverrides || {}) };
  const map = { 'ht-gate': nodeStub([g]), 'ht-prev-stamp': nodeStub([{ ht_prev_ms: prevRaw }]) };
  const inJson = { ht_prev_ms: prevRaw };
  return ARM(dollar(map), { all: () => [item(inJson)], first: () => item(inJson) }, { id: 'x' }, nowAt(T0))[0].json;
}
// HT-1 / HT-7: no previous stamp ⇒ FIRST ⇒ the notice fires. HT-7 is the same mechanism after a
// sweep has removed the key, which is what re-arms the notice.
{
  const a = runArm(null);
  isTrue('HT-1 no previous stamp ⇒ first', a.ht_is_first);
  eq('HT-1 reason', a.ht_first_because, 'no-previous-stamp');
  eq('HT-1 notice carried through for the send', a.ht_notice, runGate(CFG_ON).ht_notice);
  eq('HT-1 stamp value threaded to the redis SET', a.ht_now_ms, T0);
  isTrue('HT-7 an empty-string read is also first', runArm('').ht_is_first);
  isTrue('HT-7 an undefined read is also first', runArm(undefined).ht_is_first);
}
// HT-2 second message inside the window ⇒ silent refresh, ZERO notices.
{
  const a = runArm(String(T0 - 120000));
  isFalse('HT-2 an existing stamp ⇒ not first ⇒ no notice', a.ht_is_first);
  eq('HT-2 reason is null, not a string', a.ht_first_because, null);
  eq('HT-2 gap measured', a.ht_gap_ms, 120000);
  eq('HT-2 previous stamp is reported numerically', a.ht_prev_ms, T0 - 120000);
}
// a corrupt stamp re-notices rather than silently suppressing forever
{
  const a = runArm('yesterday');
  isTrue('an unparseable stamp is treated as first', a.ht_is_first);
  eq('… and says why, distinctly from "absent"', a.ht_first_because, 'unparseable-previous-stamp');
  eq('… and does not report a bogus numeric prev', a.ht_prev_ms, null);
  eq('… but keeps the raw value for diagnosis', a.ht_prev_raw, 'yesterday');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S2 — ht-sweep-census / ht-sweep-fanout
// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── S2 ht-sweep-census + fanout ─────────────────────────────────────────────────');

const PREFIX = 'test:ht:';
function runCensus(o) {
  const keysMap = {};
  for (const [cid, score] of Object.entries(o.stamps || {})) keysMap[`${PREFIX}active:${cid}`] = score;
  Object.assign(keysMap, o.rawExtra || {});
  const map = {};
  const broken = o.broken || [];
  if (broken.indexOf('ht-sweep-enabled') === -1) map['ht-sweep-enabled'] = nodeStub([{ ht_enabled: o.enabled }]);
  if (broken.indexOf('ht-sweep-timeout') === -1) map['ht-sweep-timeout'] = nodeStub([{ ht_timeout_sec: o.timeout }]);
  if (broken.indexOf('ht-sweep-pilot') === -1) map['ht-sweep-pilot'] = nodeStub([{ ht_pilot: o.pilot }]);
  if (o.driftedPilot) map['ht-sweep-pilot'] = nodeStub([{ wrong_property: o.pilot }]);
  const input = { all: () => [item(keysMap)], first: () => item(keysMap) };
  return CENSUS(dollar(map), input, { id: 'x' }, nowAt(T0))[0].json;
}
const runFanout = (c) => FANOUT(dollar({}), { all: () => [item(c)], first: () => item(c) }, { id: 'x' }, nowAt(T0));
const SWEEP_ON = { enabled: '1', timeout: '300', pilot: '437264483' };
const EXPIRED = String(T0 - 301000);
const FRESH = String(T0 - 200000);

// HT-8 expired + in pilot → eligible
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 437264483: EXPIRED } });
  eq('HT-8 cutoff = now - 300s', c.cutoff_ms, T0 - 300000);
  eq('HT-8 scanned population is reported', c.scanned, 1);
  eq('HT-8 eligible count', c.eligible_count, 1);
  eq('HT-8 candidate contact id parsed off the key', c.candidates[0].contact_id, '437264483');
  eq('HT-8 age', c.candidates[0].age_ms, 301000);
  eq('HT-8 no skip reason', c.candidates[0].skip_reason, null);
  eq('HT-8 fanout emits one action item', runFanout(c).length, 1);
  eq('HT-8 fanout carries the cutoff forward', runFanout(c)[0].json.cutoff_ms, T0 - 300000);
}

// HT-10 not expired → retained, not acted on
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 437264483: FRESH } });
  eq('HT-10 eligible count is zero', c.eligible_count, 0);
  eq('HT-10 reason', c.candidates[0].skip_reason, 'not-expired');
  isFalse('HT-10 expired flag false', c.candidates[0].expired);
  eq('HT-10 fanout emits nothing', runFanout(c).length, 0);
  eq('HT-10 the population is still reported (not an empty pass)', c.scanned, 1);
}

// exact-boundary behaviour: score == cutoff counts as expired (>= X seconds of silence)
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 437264483: String(T0 - 300000) } });
  isTrue('boundary score == cutoff is expired', c.candidates[0].expired);
  const c2 = runCensus({ ...SWEEP_ON, stamps: { 437264483: String(T0 - 299999) } });
  isFalse('boundary score == cutoff+1ms is not expired', c2.candidates[0].expired);
}

// HT-11 kill-switch off → whole tick inert, but still observable
{
  const c = runCensus({ ...SWEEP_ON, enabled: '0', stamps: { 437264483: String(T0 - 9999999) } });
  eq('HT-11 eligible count zero', c.eligible_count, 0);
  eq('HT-11 reason', c.candidates[0].skip_reason, 'kill-switch-off');
  eq('HT-11 fanout emits nothing', runFanout(c).length, 0);
  eq('HT-11 census still names the candidate', c.candidates.length, 1);
  const c2 = runCensus({ enabled: null, timeout: null, pilot: null, stamps: { 437264483: String(T0 - 9999999) } });
  eq('HT-11 absent kill-switch key is also inert', c2.candidates[0].skip_reason, 'kill-switch-off');
}

// HT-12 non-pilot member expired → skipped AND RETAINED (so the announce flip can process it)
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 999999: EXPIRED } });
  eq('HT-12 reason', c.candidates[0].skip_reason, 'not-in-pilot-allowlist');
  eq('HT-12 fanout emits nothing → nothing deletes the key', runFanout(c).length, 0);
  isTrue('HT-12 the row is still recorded as expired', c.candidates[0].expired);
}

// HT-13 runtime timeout change honoured without redeploy
{
  const c = runCensus({ ...SWEEP_ON, timeout: '60', stamps: { 437264483: String(T0 - 90000) } });
  eq('HT-13 cutoff moved with timeout-sec', c.cutoff_ms, T0 - 60000);
  eq('HT-13 90s-old stamp is expired at a 60s timeout', c.eligible_count, 1);
  const d = runCensus({ ...SWEEP_ON, timeout: '300', stamps: { 437264483: String(T0 - 90000) } });
  eq('HT-13 the same stamp is NOT expired at 300s (discriminating)', d.eligible_count, 0);
}

// mixed tick: only the eligible ones fan out
{
  const c = runCensus({ ...SWEEP_ON, pilot: '437264483,111', stamps: { 437264483: EXPIRED, 111: FRESH, 999999: EXPIRED } });
  eq('mixed tick scanned', c.scanned, 3);
  eq('mixed tick eligible', c.eligible_count, 1);
  eq('mixed tick skipped', c.skipped_count, 2);
  eq('mixed tick fans out only the expired pilot member',
    runFanout(c).map((x) => x.json.contact_id), ['437264483']);
}

// finding #5 (rev5): a ZERO/negative stamp is parseable — epoch 0, infinitely old — and used to share the
// unparseable branch, so it was never reapable, while ht-arm treats 0 as a perfectly valid stamp. Two
// nodes disagreeing about the same value. A garbage-but-numeric stamp must not immortalise the flag.
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 437264483: '0' } });
  isTrue('an epoch-0 stamp is expired, not "unparseable forever"', c.candidates[0].expired);
  eq('… and is eligible, so it gets reaped', c.candidates[0].skip_reason, null);
  eq('… fanout emits it', runFanout(c).length, 1);
  const n = runCensus({ ...SWEEP_ON, stamps: { 437264483: '-5' } });
  isTrue('a negative stamp likewise', n.candidates[0].expired);
  // and the genuinely unparseable case is STILL refused — the split is the point
  const j = runCensus({ ...SWEEP_ON, stamps: { 437264483: 'yesterday' } });
  eq('a non-numeric stamp is still skipped, not guessed at', j.candidates[0].skip_reason, 'unparseable-stamp');
  // ht-arm agrees with the census about 0 now
  isFalse('ht-arm still treats 0 as a real previous stamp (the two now agree)', runArm('0').ht_is_first);
}
// junk in the keyspace must never become an action
{
  const c = runCensus({ ...SWEEP_ON, stamps: { 437264483: 'not-a-number' } });
  eq('unparseable stamp is skipped, not treated as ancient', c.candidates[0].skip_reason, 'unparseable-stamp');
  eq('unparseable stamp fans out nothing', runFanout(c).length, 0);
  const d = runCensus({ ...SWEEP_ON, stamps: {}, rawExtra: { 'test:ht:enabled': '1' } });
  eq('a non-active key in the map is counted as malformed, not acted on', d.malformed_keys, 1);
  eq('… and produces no candidate', d.candidates.length, 0);
  const e = runCensus({ ...SWEEP_ON, stamps: {} });
  eq('an empty keyspace reports scanned=0 rather than silence', e.scanned, 0);
  eq('… and no candidates', e.eligible_count, 0);
}

// same fix in the sweeper — a broken pilot read must not sweep every contact
{
  const c = runCensus({ ...SWEEP_ON, broken: ['ht-sweep-pilot'], stamps: { 999999: EXPIRED } });
  eq('sweeper: a broken pilot read yields zero eligible', c.eligible_count, 0);
  eq('… with the reason on the row', c.candidates[0].skip_reason, 'config-read-failure');
  eq('… and named in the census', c.ht_config_read_failures.length, 1);
  const ok = runCensus({ ...SWEEP_ON, pilot: null, stamps: { 999999: EXPIRED } });
  eq('sweeper: an ABSENT pilot value still means everyone', ok.eligible_count, 1);
}

// ── finding #6 (rev5): the kill-switch must gate the KEYS scan, not just the census ──────────────
//
// Dark-shipped — the intended state between the S4 promote and the flip, potentially weeks — the sweeper
// was paying an O(keyspace) `KEYS` plus a GET per key on the SHARED PROD redis every 30 s to build a
// census it then discarded. `KEYS` is single-threaded and independent of pilot size (reviewer R6).
console.log('\n── S2 ht-sweep-armed (dark-ship cost gate) ─────────────────────────────────────');
function runArmed(o) {
  const map = {};
  if (!(o.broken)) map['ht-sweep-enabled'] = nodeStub([{ ht_enabled: o.enabled }]);
  return ARMED(dollar(map), { all: () => [item({})], first: () => item({}) }, { id: 'x' }, nowAt(T0))[0].json;
}
{
  isTrue('enabled="1" arms the tick', runArmed({ enabled: '1' }).ht_armed);
  isFalse('enabled="0" does NOT arm — the KEYS scan never runs', runArmed({ enabled: '0' }).ht_armed);
  eq('… and says why', runArmed({ enabled: '0' }).ht_not_armed_because, 'kill-switch-off');
  contains('… naming the work skipped, so a quiet tick is legible',
    runArmed({ enabled: '0' }).ht_skipped_work, 'KEYS scan');
  isFalse('an absent kill-switch key does not arm', runArmed({ enabled: null }).ht_armed);
  isFalse('a FAILED kill-switch read does not arm either', runArmed({ broken: true }).ht_armed);
  contains('… reported as a read failure, not as "off"',
    runArmed({ broken: true }).ht_not_armed_because, 'config-read-failure');
  isFalse('"true" is not accepted as on here either', runArmed({ enabled: 'true' }).ht_armed);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S2 — ht-classify (the node that authorises the two egress actions)
// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── S2 ht-classify ──────────────────────────────────────────────────────────────');

// ht-carry-contact runs BETWEEN ht-findcontact and ht-recheck-stamp. It is chained for real here
// rather than stubbed, so the pairing that F-RECHECK broke is exercised by every classify case
// instead of being assumed by a hand-built fixture.
// rows: [{candidate, contact}] — `contact: null` models a lookup that returned NOTHING for that
// candidate (hard not-found), which is the shape reviewer R3 is about.
function runCarry(rows) {
  const contacts = rows.map((r) => r.contact).filter((c) => c !== null && c !== undefined);
  const map = { 'ht-sweep-fanout': nodeStub(rows.map((r) => r.candidate)) };
  const input = {
    all: () => contacts.map((j, i) => item(j, i)),
    first: () => (contacts.length ? item(contacts[0]) : undefined),
  };
  return CARRY(dollar(map), input, { id: 'x' }, nowAt(T0));
}

function runClassify(rows) {
  // rows: [{ candidate, contact, recheck }]
  //
  // NOTE THE SHAPE OF `$input`. In the real graph ht-classify sits downstream of `ht-recheck-stamp`,
  // a Redis `get`, which emits a FRESH item — so $input carries {ht_recheck_ms} and NOT the
  // candidate. The stub reproduces that faithfully; an earlier version of this harness fed the
  // candidates in on $input, which would have let a body that reads $input pass here and throw in
  // production (§63, wrong object).
  const recheckItems = rows.map((r) => ({ ht_recheck_ms: r.recheck }));
  const map = {
    'ht-carry-contact': nodeStub(runCarry(rows).map((x) => x.json)),
    'ht-recheck-stamp': nodeStub(recheckItems),
  };
  const input = { all: () => recheckItems.map((j, i) => item(j, i)), first: () => item(recheckItems[0]) };
  return CLASSIFY(dollar(map), input, { id: 'x' }, nowAt(T0)).map((x) => x.json);
}
const cand = (o) => ({
  contact_id: '437264483', key: `${PREFIX}active:437264483`,
  score_ms: T0 - 301000, age_ms: 301000, cutoff_ms: T0 - 300000,
  now_ms: T0, ht_timeout_sec: 300, ...(o || {}),
});

// HT-8 clear + notify
{
  const rs = noThrow('HT-8 classify completes (guards the wrong-object read on $input)', () => runClassify([{
    candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: String(T0 - 301000),
  }]));
  const r = (rs && rs[0]) || {};
  eq('HT-8 action', r.action, 'clear-and-notify');
  isTrue('HT-8 flag read as true from the STRING "true"', r.flag);
  eq('HT-8 raw value recorded', r.flag_raw, 'true');
  isFalse('HT-8 not a skip', r.is_skip);
  eq('HT-8 timeout notice is the locked wording', r.ht_timeout_notice,
    'Our team seems to be away at the moment. Our AI assistant is back to assist you.');
}

// HT-9 the ghost-message gate: flag already false → forget, ZERO sends
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-false-437264483.json').contact, recheck: String(T0 - 301000),
  }]);
  eq('HT-9 action', r.action, 'forget-silent');
  isFalse('HT-9 flag false', r.flag);
  isTrue('HT-9 field was present', r.flag_present);
}
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-null-437264483.json').contact, recheck: String(T0 - 301000),
  }]);
  eq('HT-9 null value is false, not truthy-unknown', r.action, 'forget-silent');
}
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-absent-437264483.json').contact, recheck: String(T0 - 301000),
  }]);
  eq('HT-9 field absent from a present array → forget-silent', r.action, 'forget-silent');
  isFalse('HT-9 absence is reported as absence', r.flag_present);
}

// HT-FP4 vacuity: a fixture with NO custom_fields must ERROR, never pass
throws('HT-FP4 no custom_fields key ERRORS loudly', () => runClassify([{
  candidate: cand(), contact: fx('contact-no-custom-fields-437264483.json').contact, recheck: String(T0 - 301000),
}]), 'no custom_fields array');

// unknown encoding refuses to guess
{
  const c = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  c.custom_fields.find((x) => x.name === 'is_human_intervened').value = 'MAYBE';
  throws('unrecognised flag encoding refuses to guess', () => runClassify([{
    candidate: cand(), contact: c, recheck: String(T0 - 301000),
  }]), 'unrecognised encoding');
}

// the race guard (plan §S2.5, implemented — see Addition A1)
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: String(T0 - 1000),
  }]);
  eq('a human reply mid-tick is skipped, not cleared', r.action, 'skip-refreshed');
  isTrue('… and reported as a skip', r.is_skip);
}
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: null,
  }]);
  eq('a stamp that vanished mid-tick is skipped', r.action, 'skip-vanished');
}
{
  const [r] = runClassify([{
    candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: String(T0 - 300000),
  }]);
  eq('recheck exactly at the cutoff still clears', r.action, 'clear-and-notify');
}

// finding #5b: Number('') === 0, so an ABSENT re-read used to be recorded as a re-read of epoch 0
{
  const [d] = runClassify([{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                             recheck: null }]);
  eq('a vanished stamp reports recheck_ms null, not 0', d.recheck_ms, null);
  eq('… action unchanged', d.action, 'skip-vanished');
  const [e] = runClassify([{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                             recheck: '' }]);
  eq('an empty-string re-read likewise reports null', e.recheck_ms, null);
  const [f2] = runClassify([{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                              recheck: '0' }]);
  eq('a genuine "0" re-read is still reported as 0', f2.recheck_ms, 0);
}

// ── F-RECHECK regression: ht-carry-contact is what makes the recheck key resolvable at all ───────
//
// The defect was a KEY EXPRESSION reading a field its upstream never emitted. The parameter-level
// half of that is asserted by assert-built.py C9 against the deployed JSON (the offline suite cannot
// see expressions). What IS assertable here is the contract C9 checks against: this node must emit
// `contact_id`, and it must be the CANDIDATE's id.
{
  const rows = [{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                  recheck: String(T0 - 301000) }];
  const out = runCarry(rows).map((x) => x.json);
  eq('F-RECHECK ht-carry-contact emits contact_id (the field the key expression reads)',
    Object.prototype.hasOwnProperty.call(out[0], 'contact_id'), true);
  eq('F-RECHECK … and it is the candidate id, not the looked-up id', out[0].contact_id, '437264483');
  eq('F-RECHECK the respond.io payload is NESTED, so no candidate field can shadow it',
    typeof out[0].contact, 'object');
  eq('F-RECHECK custom_fields still reachable through the nesting',
    Array.isArray(out[0].contact.custom_fields), true);
  eq('F-RECHECK cutoff is carried (ht-classify throws without it)', out[0].cutoff_ms, T0 - 300000);
  // INVARIANT, not a point pin (LESSONS §66/§73). The mis-attribution guard makes
  // `contact_id` and `String(contact.id)` provably equal on every row that returns — which is exactly
  // why `contact_id: fetchedId || contact_id` is an equivalent mutant and is documented as absent from
  // mutate.sh. Pinning the invariant means the reasoning is checked rather than asserted in a comment:
  // if the guard is ever weakened, this goes red even though no single mutant targets the pair.
  eq('F-RECHECK INVARIANT contact_id === String(contact.id) on every returned row',
    out.every((r) => r.contact_id === String(r.contact.id)), true);
}
// multi-contact ticks pair per item — the failure mode the fix must not reintroduce
{
  const c2 = JSON.parse(JSON.stringify(fx('contact-flag-false-437264483.json').contact));
  c2.id = 111;
  const out = noThrow('F-RECHECK a 2-contact tick completes', () => runCarry([
    { candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: '1' },
    { candidate: cand({ contact_id: '111' }), contact: c2, recheck: '1' },
  ]).map((x) => x.json)) || [{ contact: {} }, { contact: {} }];
  eq('F-RECHECK a 2-contact tick pairs per item, in order',
    out.map((r) => [r.contact_id, r.contact.id]), [['437264483', 437264483], ['111', 111]]);
  eq('F-RECHECK INVARIANT holds across a multi-contact tick too',
    out.every((r) => r.contact_id === String(r.contact.id)), true);
}
// mis-attribution is refused BEFORE any redis key is derived from it
{
  const wrong = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  wrong.id = 111111;
  // finding #2 (rev5): DROPPED, not thrown on. Throwing refused the ENTIRE tick and stamps survive an
  // error, so one mis-attributed lookup recurred every 30 s forever and wedged the sweeper instance-wide
  // — the same R3 outage shape on the adjacent branch. Realistic trigger: a respond.io CONTACT MERGE,
  // where looking up a deleted id returns the surviving contact's id.
  const outw = noThrow('a lookup returning another id does NOT wedge the tick',
    () => runCarry([{ candidate: cand(), contact: wrong }]).map((x) => x.json)) || [{}];
  eq('… the stranger is recorded in runData', outw[0].lookup_strangers, ['111111']);
  isTrue('… the candidate pairs with nobody', outw[0].lookup_missing);
  contains('… and the reason names a merge/delete', outw[0].lookup_missing_reason, 'merged or deleted');
  const dw = runClassify([{ candidate: cand(), contact: wrong, recheck: String(T0 - 301000) }])[0];
  eq('… so the existing reaper handles it: forget-unknown, ZERO egress', dw.action, 'forget-unknown');
}
// the load-bearing half: a stranger must not cost the OTHER candidates their tick
{
  const stranger2 = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  stranger2.id = 555;
  const good2 = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  good2.id = 111;
  const ds2b = noThrow('a stranger in the tick does not stop a valid candidate', () => runClassify([
    { candidate: cand(), contact: stranger2, recheck: String(T0 - 301000) },
    { candidate: cand({ contact_id: '111' }), contact: good2, recheck: String(T0 - 301000) },
  ])) || [{}, {}];
  eq('… the merged-away contact is reaped, the valid one still acts',
    ds2b.map((x) => [x.contact_id, x.action]),
    [['437264483', 'forget-unknown'], ['111', 'clear-and-notify']]);
}
// ── R2 — the mis-attribution guard must demand an IDENTIFICATION, not a contradiction ────────────
//
// Pre-rev3 the guard read `if (fetchedId && fetchedId !== contact_id) throw`, so a payload with no `id`
// short-circuited the refusal, paired with the candidate, and flowed to `clear-and-notify` — authorising
// a flag write and a WhatsApp notice off a contact never positively identified. Reviewer measured it;
// reproduced here before fixing. The node's own header claimed it "owns the mis-attribution refusal",
// stricter than the mechanism delivered (LESSONS §70b inverted).
{
  const idless = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  delete idless.id;
  const out = noThrow('R2 an id-less lookup does not throw — the tick survives',
    () => runCarry([{ candidate: cand(), contact: idless }]).map((x) => x.json)) || [{}];
  isTrue('R2 an id-less payload identifies nothing → lookup_missing', out[0].lookup_missing);
  eq('R2 … and the contact is not carried', out[0].contact, null);
  const ds2 = noThrow('R2 classify completes on an id-less lookup',
    () => runClassify([{ candidate: cand(), contact: idless, recheck: String(T0 - 301000) }]));
  const d = (ds2 || [{}])[0];
  eq('R2 … so it can NEVER reach clear-and-notify', d.action, 'forget-unknown');
  isFalse('R2 … no flag is read from an unidentified payload', d.flag === true);
}
// R2's refusal survives rev5 in the form that matters: NO KEY IS EVER DERIVED from a stranger. It is now
// DROPPED rather than thrown on (finding #2) — the safety property is unchanged, the outage is not.
{
  const stranger = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  stranger.id = 111111;
  const out = runCarry([{ candidate: cand(), contact: stranger }]).map((x) => x.json);
  eq('R2 no row ever carries a stranger as its contact', out[0].contact, null);
  eq('R2 the emitted contact_id is always the candidate id', out[0].contact_id, '437264483');
}
{
  const dup = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  throws('R2 two lookups claiming the same contact are refused as ambiguous',
    () => CARRY(dollar({ 'ht-sweep-fanout': nodeStub([cand()]) }),
      { all: () => [item(dup), item(dup, 1)], first: () => item(dup) }, { id: 'x' }, nowAt(T0)),
    'ambiguous');
}

// ── R3 — a hard not-found must REAP the stamp, not leak it and not wedge the tick ─────────────────
//
// The findcontact sub returns ZERO items on a hard not-found. Under the pre-rev3 index-aligned pairing
// that made ht-carry-contact THROW, so one deleted contact errored EVERY subsequent tick and — because
// the stamp survives an error — the condition never cleared itself. Measured. The literal R2 fix (throw
// on an id-less payload) had the same shape, which is why R2 and R3 are one fix.
{
  // noThrow, not a bare call: the whole point of R3 is that this must not throw, and a throw here would
  // kill the process — which mutate.sh would see as a non-zero exit with zero FAIL lines and score as a
  // detection (§72/F6, a crash is not a detection).
  const outs = noThrow('R3 zero lookups does not throw — the tick survives',
    () => runCarry([{ candidate: cand(), contact: null }]).map((x) => x.json));
  const out = outs || [{}];
  eq('R3 exactly one row per candidate is still emitted', out.length, 1);
  isTrue('R3 the candidate is marked lookup_missing', out[0].lookup_missing);
  contains('R3 … with a reason naming the mechanism', out[0].lookup_missing_reason, 'no items at all');
  eq('R3 contact_id is still the candidate id, so the stamp key resolves',
    out[0].contact_id, '437264483');
  const ds3 = noThrow('R3 classify completes when the lookup returned nothing',
    () => runClassify([{ candidate: cand(), contact: null, recheck: String(T0 - 301000) }]));
  const d = (ds3 || [{}])[0];
  eq('R3 → forget-unknown (reaps the stamp)', d.action, 'forget-unknown');
  isFalse('R3 … and it is NOT a skip, so it reaches ht-forget-silent', d.is_skip);
  isFalse('R3 … so it is NOT clear-and-notify: zero sends, zero flag writes',
    d.action === 'clear-and-notify');
  isTrue('R3 lookup_missing is surfaced on the decision row', d.lookup_missing);
}
// a partial tick: one contact found, one gone — the found one still acts, the missing one is reaped
{
  const c2 = JSON.parse(JSON.stringify(fx('contact-flag-true-437264483.json').contact));
  c2.id = 111;
  const ds = noThrow('R3 a partial tick completes', () => runClassify([
    { candidate: cand(), contact: null, recheck: String(T0 - 301000) },
    { candidate: cand({ contact_id: '111' }), contact: c2, recheck: String(T0 - 301000) },
  ])) || [{}, {}];
  eq('R3 a partial tick reaps the missing one and acts on the found one',
    ds.map((d) => [d.contact_id, d.action]),
    [['437264483', 'forget-unknown'], ['111', 'clear-and-notify']]);
}

// ── R1 — the fields the DELETE and the SEND need must survive the egress node ─────────────────────
//
// `ht-forget.key` and `ht-timeout-notice`'s inputs read `$json.contact_id` / `$json.ht_timeout_notice`.
// On the build those come from the `ht-clear-flag` STAND-IN. At S4 that node becomes the real respondio
// UPDATE_CONTACT, whose measured output (live exec 12146305) is exactly `{"contactId": 423755030}` — so
// unfixed, the stamp delete misses AND the notice fires with an empty recipient and an empty body.
// `ht-carry-clear` bridges it, and is asserted against the REAL shape here, not only the stand-in's.
{
  const rows = [{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                  recheck: String(T0 - 301000) }];
  const decisions = runClassify(rows);
  const $cl = dollar({ 'ht-classify': nodeStub(decisions) });
  // the REAL node's output shape, from the recorded live execution — not the stand-in's
  const realOut = fx('promote-real-shapes.json').shapes['ht-clear-flag'].sample;
  eq('R1 the real respondio output really is contactId-only',
    Object.keys(realOut).sort(), ['contactId']);
  const outs = noThrow('R1 ht-carry-clear completes against the REAL contactId-only output',
    () => CARRYCLEAR($cl, { all: () => [item({ ...realOut, contactId: 437264483 })],
      first: () => item({ ...realOut, contactId: 437264483 }) }, { id: 'x' }, nowAt(T0)).map((x) => x.json));
  const out = outs || [{}];
  eq('R1 contact_id is recovered from the REAL contactId-only output', out[0].contact_id, '437264483');
  contains('R1 the notice body is recovered, not empty', out[0].ht_timeout_notice, 'AI assistant is back');
  // and it still works off the stand-in's richer output, so the build behaves like live
  const standin = CLEARFLAG(dollar({}), { all: () => [item(decisions[0])], first: () => item(decisions[0]) },
    { id: 'x' }, nowAt(T0)).map((x) => x.json);
  const out2 = CARRYCLEAR($cl, { all: () => [item(standin[0])], first: () => item(standin[0]) },
    { id: 'x' }, nowAt(T0)).map((x) => x.json);
  eq('R1 identical result through the stand-in — build and live agree',
    [out2[0].contact_id, out2[0].ht_timeout_notice], [out[0].contact_id, out[0].ht_timeout_notice]);
}
// the last gate before a real WhatsApp send: only an authorised row may pass
{
  const rows = [{ candidate: cand(), contact: fx('contact-flag-false-437264483.json').contact,
                  recheck: String(T0 - 301000) }];
  const decisions = runClassify(rows);
  eq('R1 precondition: this row was NOT authorised', decisions[0].action, 'forget-silent');
  throws('R1 an unauthorised row reaching the notify path is refused', () => CARRYCLEAR(
    dollar({ 'ht-classify': nodeStub(decisions) }),
    { all: () => [item({ contactId: 437264483 })], first: () => item({ contactId: 437264483 }) },
    { id: 'x' }, nowAt(T0)), 'Only clear-and-notify authorises a send');
}
{
  const decisions = runClassify([{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                                   recheck: String(T0 - 301000) }]);
  throws('R1 an update returning no contactId is refused (no empty-recipient send)', () => CARRYCLEAR(
    dollar({ 'ht-classify': nodeStub(decisions) }),
    { all: () => [item({})], first: () => item({}) }, { id: 'x' }, nowAt(T0)), 'cannot be identified');
  throws('R1 a contact with no decision this tick is refused', () => CARRYCLEAR(
    dollar({ 'ht-classify': nodeStub(decisions) }),
    { all: () => [item({ contactId: 999 })], first: () => item({ contactId: 999 }) },
    { id: 'x' }, nowAt(T0)), 'no ht-classify decision');
}
{
  throws('ht-carry-contact refuses a candidate with no contact_id', () => CARRY(dollar({
    'ht-sweep-fanout': nodeStub([cand({ contact_id: '' })]),
  }), { all: () => [item(fx('contact-flag-true-437264483.json').contact)],
        first: () => item(fx('contact-flag-true-437264483.json').contact) }, { id: 'x' }, nowAt(T0)),
    'no contact_id');
}

// index misalignment is refused
{
  checks++;
  let threw = null;
  try {
    const rc = [{ ht_recheck_ms: String(T0 - 301000) }];
    CLASSIFY(dollar({
      'ht-carry-contact': nodeStub([cand(), cand({ contact_id: '111' })]),
      'ht-recheck-stamp': nodeStub(rc),
    }), { all: () => rc.map((j, i) => item(j, i)), first: () => item(rc[0]) }, { id: 'x' }, nowAt(T0));
  } catch (e) { threw = String(e.message); }
  if (threw && threw.indexOf('misalignment') !== -1) console.log('ok   index misalignment is refused');
  else { fails++; console.log(`FAIL index misalignment is refused (got ${threw})`); }
}

// an unreachable dependency is refused rather than defaulted
throws('a missing ht-carry-contact node is refused', () => CLASSIFY(dollar({
  'ht-recheck-stamp': nodeStub([{ ht_recheck_ms: String(T0 - 301000) }]),
}), { all: () => [item({ ht_recheck_ms: '1' })], first: () => item({ ht_recheck_ms: '1' }) }, { id: 'x' }, nowAt(T0)), 'unreachable');

// two contacts at once stay attributed to their own rows
{
  const c2 = JSON.parse(JSON.stringify(fx('contact-flag-false-437264483.json').contact));
  c2.id = 111;
  const rs = runClassify([
    { candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact, recheck: String(T0 - 301000) },
    { candidate: cand({ contact_id: '111' }), contact: c2, recheck: String(T0 - 400000) },
  ]);
  eq('multi-row actions stay per-row', rs.map((r) => [r.contact_id, r.action]),
    [['437264483', 'clear-and-notify'], ['111', 'forget-silent']]);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S3 — ht-config-apply
// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── S3 ht-config-apply ──────────────────────────────────────────────────────────');

const runConfig = (form) => CONFIG(dollar({}), { all: () => [item(form)], first: () => item(form) }, { id: 'x' }, nowAt(T0))[0].json;
const form = (o) => ({
  'Timeout (minutes)': o.minutes, Feature: o.kill, 'Pilot contact IDs': o.pilot,
  submittedAt: '2026-08-12T00:00:00.000Z', formMode: 'production',
});

// HT-14 round trip
{
  const r = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));
  eq('HT-14 timeout-sec written', r.timeout_sec, 420);
  eq('HT-14 enabled written as "1"', r.enabled_value, '1');
  eq('HT-14 pilot csv written', r.pilot_csv, '437264483');
  eq('HT-14 pilot membership exact', r.pilot_ids, ['437264483']);
  eq('HT-14 echoed minutes', r.timeout_min, 7);
  eq('HT-14 scope echo', r.pilot_scope, '1 pilot contact(s)');
}

// HT-15 floor: redis must NEVER be written with 0
{
  const r = runConfig(form({ minutes: 0, kill: 'on', pilot: '437264483' }));
  eq('HT-15 zero minutes never reaches redis as 0', r.timeout_sec, 300);
  isTrue('HT-15 the substitution is reported', r.notes.length > 0);
  const s = runConfig(form({ minutes: 0.5, kill: 'on', pilot: '' }));
  // finding #3 (rev5): fractional minutes are rounded to whole minutes BEFORE the floor, so 0.5 → 1
  // minute → 60 s. The floor clamp survives as defence in depth but is unreachable through this path.
  eq('HT-15 half a minute rounds up to a whole minute', s.timeout_sec, 60);
  isTrue('HT-15 the rounding is reported, not silent',
    s.notes.join(' ').indexOf('whole number') !== -1);
  eq('HT-15 negative minutes fall back to the default', runConfig(form({ minutes: -5, kill: 'on', pilot: '' })).timeout_sec, 300);
  eq('HT-15 non-numeric minutes fall back to the default', runConfig(form({ minutes: 'five', kill: 'on', pilot: '' })).timeout_sec, 300);
}

// kill-switch normalisation, and the fail-closed direction on an unsupplied value
{
  eq('kill "off" → "0"', runConfig(form({ minutes: 5, kill: 'off', pilot: '' })).enabled_value, '0');
  eq('kill absent → "0" (fail-closed)', runConfig(form({ minutes: 5, kill: undefined, pilot: '' })).enabled_value, '0');
  eq('kill "On" is case-insensitive', runConfig(form({ minutes: 5, kill: 'On', pilot: '' })).enabled_value, '1');
  eq('kill garbage → "0"', runConfig(form({ minutes: 5, kill: 'perhaps', pilot: '' })).enabled_value, '0');
}

// finding #4 (rev5): an UNRECOGNISED kill value used to write OFF with an EMPTY notes[] — the note only
// fired on ''. Relabelling the dropdown ("on" -> "Enabled ✅") silently disabled the feature and the
// completion screen reported success with nothing to look at. Fail-closed is right; fail-closed and
// SILENT is how a feature stays off for a month.
{
  const r = runConfig(form({ minutes: 5, kill: 'Enabled ✅', pilot: '' }));
  eq('an unrecognised kill value still writes OFF (fail-closed)', r.enabled_value, '0');
  isTrue('… but says so loudly', r.notes.join(' ').indexOf('not recognised') !== -1);
  contains('… echoing the value it actually saw', r.notes.join(' '), 'Enabled');
  contains('… and warning the feature is now disabled', r.notes.join(' '), 'DISABLED');
  // the other side: a RECOGNISED off must stay quiet, or the warning becomes noise nobody reads
  const off = runConfig(form({ minutes: 5, kill: 'off', pilot: '' }));
  eq('a recognised "off" writes OFF', off.enabled_value, '0');
  isFalse('… with no spurious warning', off.notes.join(' ').indexOf('not recognised') !== -1);
  const on = runConfig(form({ minutes: 5, kill: 'on', pilot: '' }));
  isFalse('a recognised "on" is quiet too', on.notes.join(' ').indexOf('not recognised') !== -1);
}
// finding #3: whole minutes only, so the notice text and the real timeout cannot disagree
{
  eq('1.5 minutes is rounded, not truncated to 90s', runConfig(form({ minutes: 1.5, kill: 'on', pilot: '' })).timeout_sec, 120);
  eq('7.4 minutes rounds down', runConfig(form({ minutes: 7.4, kill: 'on', pilot: '' })).timeout_sec, 420);
  eq('0.4 minutes rounds to 0 → the not-positive branch → default',
    runConfig(form({ minutes: 0.4, kill: 'on', pilot: '' })).timeout_sec, 300);
  // the invariant that makes ht-gate's round(sec/60) exact rather than approximately right
  for (const m of [1, 1.5, 2.6, 7, 7.4, 30]) {
    const sec = runConfig(form({ minutes: m, kill: 'on', pilot: '' })).timeout_sec;
    if (sec % 60 !== 0) { fails++; console.log(`FAIL timeout-sec is a whole minute for ${m} (got ${sec})`); }
  }
  checks++; console.log('ok   INVARIANT timeout-sec is always a multiple of 60 (6 inputs)');
  // and the notice therefore states the truth
  const w = runConfig(form({ minutes: 1.5, kill: 'on', pilot: '437264483' }));
  contains('a fractional submission still yields an honest notice',
    runGate({ enabled: w.enabled_value, timeout: String(w.timeout_sec), pilot: w.pilot_csv }).ht_notice,
    'inactive for 2 minutes');
}

// the announce flip is the widest write the form can make — it must be echoed as such
{
  const r = runConfig(form({ minutes: 5, kill: 'on', pilot: '  ' }));
  eq('empty pilot list writes an empty csv', r.pilot_csv, '');
  eq('… and is echoed as EVERYONE, not as blank', r.pilot_scope, 'EVERYONE');
  const s = runConfig(form({ minutes: 5, kill: 'on', pilot: '437264483, 999999 ,' }));
  eq('pilot list is split/trimmed and empties dropped', s.pilot_ids, ['437264483', '999999']);
  const t = runConfig(form({ minutes: 5, kill: 'on', pilot: 'jayson' }));
  isTrue('a non-numeric pilot id is reported', t.notes.join(' ').indexOf('not numeric') !== -1);
}

// ── round-trip: what the form writes is what the gate reads ──────────────────────────────────────
// The two nodes are the two ends of the redis contract. A parse/format mismatch between them is the
// single most likely way this feature silently does nothing, so it is asserted directly rather than
// left to the two suites above agreeing by coincidence.
console.log('\n── S1↔S3 redis contract round-trip ─────────────────────────────────────────────');
{
  const w = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));
  const g = runGate({ enabled: w.enabled_value, timeout: String(w.timeout_sec), pilot: w.pilot_csv });
  isTrue('form-written config makes the gate act', g.ht_should_act);
  contains('form-written timeout renders in the notice', g.ht_notice, 'inactive for 7 minutes');
  const c = runCensus({
    enabled: w.enabled_value, timeout: String(w.timeout_sec), pilot: w.pilot_csv,
    stamps: { 437264483: String(T0 - 421000) },
  });
  eq('form-written timeout drives the sweeper cutoff', c.cutoff_ms, T0 - 420000);
  eq('… and the 421s-old stamp is eligible', c.eligible_count, 1);

  const off = runConfig(form({ minutes: 7, kill: 'off', pilot: '437264483' }));
  isFalse('form-written OFF makes the gate inert',
    runGate({ enabled: off.enabled_value, timeout: String(off.timeout_sec), pilot: off.pilot_csv }).ht_should_act);
  eq('form-written OFF makes the sweeper inert', runCensus({
    enabled: off.enabled_value, timeout: String(off.timeout_sec), pilot: off.pilot_csv,
    stamps: { 437264483: String(T0 - 999999) },
  }).eligible_count, 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ht-findcontact — THE FIXTURE LAYER ITSELF (tester follow-up, rev4)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// The stand-in's tag map decides which contact shape a UAC case gets, and it had no offline coverage at
// all — it ran only under --emit-schema. Two defects followed, both found by the tester driving it live:
//
//   * no tag produced a ZERO-ITEM lookup, so HT-18 (the forget-unknown / permanent-wedge gate, reviewer
//     R3) was not live-drivable — the one path that used to error every future tick forever;
//   * an UNKNOWN tag fell through to the default, which is `flag=true` ⇒ clear-and-notify. The tester
//     invented `"notfound"`, and it silently ran the egress-authorising outcome (exec 12179301).
//
// That second one is §61's green-that-cannot-fail, one level BELOW the code, in the fixture layer: the
// case asks for a shape, gets a different one, and nothing anywhere reports the substitution — so a typo
// in a test is indistinguishable from the test passing. An ABSENT tag defaulting to the egress-producing
// shape is a deliberate decision (a harness must not pass by quietly handing itself the inert fixture);
// an UNRECOGNISED tag is a mistake, and sharing a branch between the two is what made the mistake silent.
console.log('\n── ht-findcontact fixture layer ────────────────────────────────────────────────');
function runFind(tags, contactIds) {
  const ids = (contactIds || ['437264483']).map((c) => ({ contact_id: c }));
  return FINDCONTACT(dollar({ 'ht-sweep-driver': nodeStub([{ fixtures: tags }]) }),
    { all: () => ids.map((j, i) => item(j, i)), first: () => item(ids[0]) },
    { id: 'x' }, nowAt(T0)).map((x) => x.json);
}
const flagOf = (c) => {
  const row = (c.custom_fields || []).find((x) => x.name === 'is_human_intervened');
  return row ? row.value : '<absent>';
};
{
  eq('absent tag → the egress-producing default (deliberate)', flagOf(runFind({})[0]), 'true');
  eq('flag=false', flagOf(runFind({ 437264483: 'flag=false' })[0]), 'false');
  eq('flag=null', flagOf(runFind({ 437264483: 'flag=null' })[0]), null);
  eq('noflag → row absent, array present', flagOf(runFind({ 437264483: 'noflag' })[0]), '<absent>');
  isTrue('noflag keeps custom_fields an array',
    Array.isArray(runFind({ 437264483: 'noflag' })[0].custom_fields));
  eq('nocf → custom_fields key removed entirely',
    'custom_fields' in runFind({ 437264483: 'nocf' })[0], false);
}
// HT-18: the zero-item hard miss, which is what makes forget-unknown reachable live
{
  // noThrow: dropping 'notfound' from KNOWN_TAGS makes these throw, and a throw would kill the process —
  // which mutate.sh sees as a non-zero exit with zero FAIL lines and reports as CRASHED, not a detection
  // (§72/F6). Every mutable call in this block is guarded so the mutant produces comparisons.
  const zero = noThrow("HT-18 the 'notfound' tag is accepted", () => runFind({ 437264483: 'notfound' }));
  eq('notfound emits ZERO items — the real sub\'s hard-miss shape', (zero || [{}]).length, 0);
  const two = noThrow('HT-18 a mixed tick completes',
    () => runFind({ 437264483: 'notfound' }, ['437264483', '111'])) || [];
  eq('… only the tagged contact vanishes; the rest of the tick is unaffected',
    two.map((c) => c.id), [111]);
  // and end-to-end: a notfound lookup must reach forget-unknown, not clear-and-notify
  const lookups = zero || [];
  const carried = CARRY(dollar({ 'ht-sweep-fanout': nodeStub([cand()]) }),
    { all: () => lookups.map((j, i) => item(j, i)), first: () => item(lookups[0]) },
    { id: 'x' }, nowAt(T0)).map((x) => x.json);
  isTrue('HT-18 notfound → lookup_missing', carried[0].lookup_missing);
  const decided = CLASSIFY(dollar({
    'ht-carry-contact': nodeStub(carried),
    'ht-recheck-stamp': nodeStub([{ ht_recheck_ms: String(T0 - 301000) }]),
  }), { all: () => [item({ ht_recheck_ms: String(T0 - 301000) })],
        first: () => item({ ht_recheck_ms: String(T0 - 301000) }) }, { id: 'x' }, nowAt(T0))
    .map((x) => x.json);
  eq('HT-18 … → forget-unknown, so the stamp is reaped', decided[0].action, 'forget-unknown');
  isFalse('HT-18 … and it is NOT clear-and-notify', decided[0].action === 'clear-and-notify');
}
// an unknown tag must ERROR, not silently authorise egress
{
  throws('an unknown fixture tag throws instead of defaulting',
    () => runFind({ 437264483: 'no-such-tag' }), 'unknown fixture tag');
  throws('… the tester\'s exact invented tag would now have errored',
    () => runFind({ 437264483: 'not_found' }), 'unknown fixture tag');
  throws('… a typo on a REAL tag is caught too',
    () => runFind({ 437264483: 'flag=fasle' }), 'unknown fixture tag');
  throws('… and the message names the known tags',
    () => runFind({ 437264483: 'x' }), 'notfound');
  // an untagged contact in the same tick is unaffected — the throw is per-tag, not per-tick paranoia
  eq('an empty-string tag is treated as absent, not unknown',
    flagOf(runFind({ 437264483: '' })[0]), 'true');
  eq('whitespace is trimmed before the known-tag check',
    flagOf(runFind({ 437264483: '  flag=false  ' })[0]), 'false');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ht-config-echo + harness-envelope — reviewer instrument gaps 2 and 4
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// `ht-config-echo` is a node the S4 promote SHIPS and it had zero assertions: it ran only under
// --emit-schema. Its whole job is the READ-BACK MISMATCH banner — the form's own honesty mechanism —
// and the tester's live HT-14 only ever observed the green side (`mismatches:[]`). That is §61's "an
// assertion never shown red is not an instrument" applied to the honesty gate itself.
console.log('\n── S3 ht-config-echo (read-back honesty) ───────────────────────────────────────');
function runEcho(written, rb) {
  return ECHO(dollar({
    'ht-config-apply': nodeStub([written]),
    'ht-readback-timeout': nodeStub([{ rb_timeout_sec: rb.t }]),
    'ht-readback-enabled': nodeStub([{ rb_enabled: rb.e }]),
    'ht-readback-pilot': nodeStub([{ rb_pilot: rb.p }]),
  }), { all: () => [item({})], first: () => item({}) }, { id: 'x' }, nowAt(T0))[0].json;
}
{
  const w = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));
  const green = runEcho(w, { t: '420', e: '1', p: '437264483' });
  eq('echo agrees when redis holds what was written', green.mismatches, []);
  isTrue('… reports ok', green.ok);
  eq('… title says applied', green.echo_title, 'Settings applied');
  contains('… echoes the minutes and the seconds', green.echo_message, 'Timeout: 7 minute(s)  [420 s]');
  contains('… echoes ON', green.echo_message, 'Feature: ON');
  contains('… echoes the pilot scope', green.echo_message, 'Applies to: 437264483');
}
// THE RED SIDE — the state the banner exists for, never observed live
{
  const w = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));
  const red = runEcho(w, { t: '300', e: '0', p: '' });
  eq('a disagreeing read-back yields one mismatch per key', red.mismatches.length, 3);
  isFalse('… ok is false', red.ok);
  contains('… the title warns rather than reassuring', red.echo_title, 'ERRORS');
  contains('… the banner names the mechanism', red.echo_message, 'READ-BACK MISMATCH');
  contains('… and reports what redis actually holds', red.echo_message, 'redis holds "300"');
  // the dangerous shape: an EMPTY pilot list read back means EVERYONE, so it must never be silent
  contains('… an empty read-back pilot list is surfaced, not treated as a match',
    red.echo_message, 'pilot-contacts');
}
{
  const w = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));
  const gone = runEcho(w, { t: null, e: null, p: null });
  isFalse('a key that is absent entirely is a mismatch, not a pass', gone.ok);
  contains('… and the timeout renders as "(not set)" rather than a fabricated number',
    gone.echo_message, '(not set)');
}
// harness-envelope's documented refusal (instrument gap 4): the node that stops a run fabricating a
// contact id. Harness-only, but an undocumented-and-unasserted guard is just a comment.
{
  const env = fx('trigger-user-437264483.json').envelope;
  const ok = ENVELOPE(dollar({}), { all: () => [item({ envelope: env })], first: () => item({ envelope: env }) },
    { id: 'x' }, nowAt(T0))[0].json;
  eq('harness-envelope unwraps {envelope:…}', ok.contact.id, 437264483);
  const viaWebhook = ENVELOPE(dollar({}),
    { all: () => [item({ body: { envelope: env, test_run_id: 'W1' } })],
      first: () => item({ body: { envelope: env, test_run_id: 'W1' } }) }, { id: 'x' }, nowAt(T0))[0].json;
  eq('… and the webhook form, threading test_run_id', viaWebhook.test_run_id, 'W1');
  const noContact = JSON.parse(JSON.stringify(env)); delete noContact.contact;
  throws('harness-envelope refuses a payload with no contact.id', () => ENVELOPE(dollar({}),
    { all: () => [item({ envelope: noContact })], first: () => item({ envelope: noContact }) },
    { id: 'x' }, nowAt(T0)), 'no contact.id');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// --emit-schema — publish each owned Code node's EMITTED TOP-LEVEL FIELDS, derived by executing it
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Consumed by assert-built.py C9, which resolves every `$json.<field>` and `$('N')…json.<field>`
// reference in the DEPLOYED workflow parameters against the field set its source actually produces.
// That check is the instrument F-RECHECK slipped past: the key expression
// `test:ht:active:{{ $json.contact_id }}` was sound-looking, its upstream emitted `id`, and no test in
// this repo compared the two — because the offline suite hand-builds every node's inputs and therefore
// never evaluates an expression against a real upstream shape.
//
// The field sets are DERIVED BY RUNNING THE BODIES, never hand-listed. A hand-maintained registry would
// be a second copy of the truth, free to drift from the code exactly like the expression did — and it
// would drift silently, since nothing would compare it to anything either.
function emitSchema() {
  const keysOf = (out) => (out && out.length ? Object.keys(out[0].json).sort() : []);
  const envelope = fx('trigger-user-437264483.json').envelope;
  const gateOut = runGate({ ...CFG_ON, test_run_id: 'SCHEMA' });
  const censusOut = runCensus({ ...SWEEP_ON, stamps: { 437264483: EXPIRED } });
  const carryRows = [{ candidate: cand(), contact: fx('contact-flag-true-437264483.json').contact,
                       recheck: String(T0 - 301000) }];
  const cfgOut = runConfig(form({ minutes: 7, kill: 'on', pilot: '437264483' }));

  const one = (fn, $map, inputJson, extra) => {
    const inputs = Array.isArray(inputJson) ? inputJson : [inputJson];
    return keysOf(fn(dollar($map || {}),
      { all: () => inputs.map((j, i) => item(j, i)), first: () => item(inputs[0]) },
      { id: 'x' }, nowAt(T0)) || []);
  };

  const schema = {
    // ── S1 ──────────────────────────────────────────────────────────────────────────────────────
    'harness-envelope': one(mk('harness-envelope.js'), {}, { envelope, test_run_id: 'SCHEMA' }),
    'Respond.io Trigger': one(mk('standin-respondio-trigger.js'),
      { 'harness-envelope': nodeStub([{ ...envelope, test_run_id: 'SCHEMA' }]) }, {}),
    'Update a Contact': one(mk('standin-update-a-contact.js'),
      { 'Respond.io Trigger': nodeStub([envelope]) }, {}),
    'Execute a SQL query': one(mk('standin-execute-a-sql-query.js'), {}, {}),
    'Select rows from a table': one(mk('standin-select-rows.js'), {}, {}),
    'conversation-sla-tracking-update': one(mk('standin-sla-update.js'), {}, {}),
    'conversation-sla-event-tracking-create': one(mk('standin-sla-create.js'), {}, {}),
    'save-session-vars': one(mk('standin-save-session-vars.js'),
      { 'Respond.io Trigger': nodeStub([envelope]) }, { variables: {}, user_response: 'x' }),
    'ht-gate': Object.keys(gateOut).sort(),
    'ht-arm': Object.keys(runArm(null)).sort(),
    // ── S2 ──────────────────────────────────────────────────────────────────────────────────────
    'ht-sweep-driver': one(mk('ht-sweep-driver.js'), {}, { body: { test_run_id: 'SCHEMA', fixtures: {} } }),
    'ht-sweep-armed': one(mk('ht-sweep-armed.js'),
      { 'ht-sweep-enabled': nodeStub([{ ht_enabled: '1' }]) }, {}),
    'ht-sweep-census': Object.keys(censusOut).sort(),
    'ht-sweep-fanout': keysOf(runFanout(censusOut)),
    'ht-findcontact': one(mk('standin-ht-findcontact.js'),
      { 'ht-sweep-driver': nodeStub([{ fixtures: {} }]) }, { contact_id: '437264483' }),
    'ht-carry-contact': keysOf(runCarry(carryRows)),
    'ht-classify': Object.keys(runClassify(carryRows)[0]).sort(),
    'ht-clear-flag': one(mk('standin-ht-clear-flag.js'), {}, runClassify(carryRows)[0]),
    // Fed the REAL respondio output shape, not the stand-in's, so C9b resolves through this node
    // against what the promoted graph actually produces.
    'ht-carry-clear': one(mk('ht-carry-clear.js'),
      { 'ht-classify': nodeStub(runClassify(carryRows)) },
      { ...fx('promote-real-shapes.json').shapes['ht-clear-flag'].sample, contactId: 437264483 }),
    // ── S3 ──────────────────────────────────────────────────────────────────────────────────────
    'ht-config-apply': Object.keys(cfgOut).sort(),
    'ht-config-echo': one(mk('ht-config-echo.js'), {
      'ht-config-apply': nodeStub([cfgOut]),
      'ht-readback-timeout': nodeStub([{ rb_timeout_sec: String(cfgOut.timeout_sec) }]),
      'ht-readback-enabled': nodeStub([{ rb_enabled: cfgOut.enabled_value }]),
      'ht-readback-pilot': nodeStub([{ rb_pilot: cfgOut.pilot_csv }]),
    }, {}),
  };
  // Sentinel-delimited rather than written to a file: a generated file is one more artifact that can
  // go stale between the run that produced it and the run that trusts it. assert-built.py extracts
  // between the sentinels of the SAME invocation it just made, so the schema cannot be older than the
  // check that consumes it.
  process.stdout.write('\n###HT-SCHEMA-BEGIN###\n' + JSON.stringify(schema, null, 1) +
                       '\n###HT-SCHEMA-END###\n');
}

if (process.argv.indexOf('--emit-schema') !== -1) { emitSchema(); process.exit(fails ? 1 : 0); }

console.log(`\ncompared population: ${checks} assertions over ` +
  `${fs.readdirSync(path.join(P, 'fixtures')).length} captured fixtures and ` +
  `${fs.readdirSync(NODES).filter((f) => f.endsWith('.js')).length} node bodies`);
if (fails) { console.log(`\n${fails} FAILED of ${checks}`); process.exit(1); }
console.log(`\nALL ${checks} PASS`);
