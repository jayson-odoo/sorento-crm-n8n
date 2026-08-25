// -- promotion-safety-check.test.js - the payload gate must reject the clone AND accept live ------
//
// Covers scripts/promotion-safety-check.py, the gate written after the 2026-08-24 promotion
// review found that deploy.py inspects the OPERATOR and the EXPORT'S FRESHNESS but never the
// BODY it is about to PUT.
//
// WHY THIS IS A .test.js AND NOT A PYTHON unittest
//   deploy_gates_test.py is the house pattern for testing a python script, and it is also the
//   proof of why that pattern is a dead end here: nothing runs it. `npm test` is
//   `node --test .../tests/unit/*.test.js`, and deploy.py's own gate (b) IS `npm test`. A gate
//   whose test never runs is a gate that rots, which is the exact failure mode this whole script
//   exists to prevent. So the test drives the real script through a subprocess and asserts on its
//   exit code and its output - the same two things an operator and a CI job see.
//
// THE TWO ASSERTIONS THAT MATTER
//   1. The clone export FAILS, and fails checks 1, 2, 3, 5, 6, 7 and 8 specifically - not just
//      "fails somewhere". Each of those is one of the eight independent ways the reviewers found
//      to take the WhatsApp bot down.
//   2. The LIVE spine export PASSES with --expect-live-spine. This is the one that keeps the gate
//      honest: a checker that refuses everything is not a gate, it is an outage. Production as it
//      exists today - is_test in mirrored input SCHEMAS, an inert test_run_id passthrough, a
//      "sub-get-results TEST" sub that carries live's real CRM read path - must go through clean.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/promotion-safety-check.py');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const CLONE = 'clone-sorento-consume-main-TEST';
const LIVE_SPINE = 'live-spine-sorento-consume-main';
const LIVE_PARSER = 'sub-semantic-parser';
const PARSER_FORK = 'sub-semantic-parser-FORK';

function check(...args) {
  const res = spawnSync('python3', [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.error, undefined, `spawn failed: ${res.error}`);
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

// "violations by check: #1=14, #2=29, ..." -> {1: 14, 2: 29, ...}
function violationsByCheck(out) {
  const line = out.split('\n').find((l) => l.startsWith('violations by check:'));
  assert.ok(line, `no "violations by check:" summary line in output:\n${out}`);
  const counts = {};
  for (const m of line.matchAll(/#(\d+)=(\d+)/g)) counts[Number(m[1])] = Number(m[2]);
  return counts;
}

// ---------------------------------------------------------------------------------------------
// 1. the clone must be refused, on every mechanism the review named
// ---------------------------------------------------------------------------------------------
test('the TEST clone is REFUSED for the live spine', () => {
  const { code, out } = check(CLONE, '--expect-live-spine');
  assert.equal(code, 1, `clone must exit 1, exited ${code}:\n${out}`);
  assert.match(out, /REFUSED/);
  assert.match(out, /Do NOT promote/);
});

test('the clone fails checks 1, 2, 3, 5, 6, 7 and 8 specifically', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  for (const n of [1, 2, 3, 5, 6, 7, 8]) {
    assert.ok(counts[n] > 0, `check ${n} reported nothing on the clone: ${JSON.stringify(counts)}`);
  }
});

test('every violation is printed, not just the first', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const printed = (out.match(/\[FAIL check \d+\]/g) || []).length;
  assert.equal(printed, total,
    'an operator fixing one violation at a time and rediscovering the next is how a gate gets bypassed');
  assert.ok(total > 50, `expected the clone to be riddled with these, got ${total}`);
});

test('check 1 names the nodes that would silence every live send', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  // 11 executeWorkflow nodes pass is_test: true; the live subs are guarded on it (LESSONS #17).
  assert.match(out, /\[FAIL check 1\] node: Call 'sub-query-reformulator'/);
  assert.match(out, /\[FAIL check 1\] node: sorento-sub-respond-sendmsg-respond\b/);
  assert.match(out, /workflowInputs\.value\.is_test = True/);
});

test('check 2 names the harness storage a live turn would be redirected into', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  assert.match(out, /\[FAIL check 2\] node: guard-c-record[\s\S]*?'test:egress:'/);
  assert.match(out, /\[FAIL check 2\] node: pg-get-session[\s\S]*?'respond_contacts_test'/);
  assert.match(out, /\[FAIL check 2\] node: log-incoming-chat-history-n8ntest[\s\S]*?'chat_histories'/);
});

test('check 3 names the fork id AND the node carrying it', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  assert.match(out, /\[FAIL check 3\] node: Call 'sub-get-results'[\s\S]*?t4QvrtrPnTwRU6br/);
  assert.match(out, /\[FAIL check 3\] node: Call 'sub-query-reformulator'[\s\S]*?wI5RkNGW3EOJfBdo/);
});

test('check 5 is called out loudly - the queue line the diff cannot make stand out', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  assert.equal(counts[5], 1, 'there is exactly one intake node, so exactly one way to break it');
  assert.match(out, /\[FAIL check 5\] node: redis-pop-main-message-list/);
  assert.match(out, /list = '=test:q:\{\{ \$json\.contact \}\}'/);
  assert.match(out, /MOST DESTRUCTIVE SINGLE LINE/);
});

test('check 6 catches all five orphaned egress nodes', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  assert.equal(counts[6], 5, 'the clone orphans exactly the five documented egress nodes');
  for (const n of ['send-message-files', 'send-message-images', 'send-message-video',
    'update-human-intervened', 'save-session-vars']) {
    assert.match(out, new RegExp(`\\[FAIL check 6\\] node: ${n}\\n\\s+offending value: inbound edges = 0 \\(ORPHANED\\)`));
  }
});

test('check 7 separates the guard-*-record REPLACERS from the other harness nodes', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  assert.match(out, /\[FAIL check 7\] node: guard-c-record[\s\S]*?REPLACE it/);
  assert.match(out, /\[FAIL check 7\] node: fixture-check-access/);
  assert.match(out, /\[FAIL check 7\] node: replay-get-results/);
  assert.match(out, /\[FAIL check 7\] node: sim-inject-gate/);
  assert.match(out, /\[FAIL check 7\] node: parser-bypass-gate/);
  assert.match(out, /\[FAIL check 7\] node: chat-attach-push/);
});

test('check 8 catches the three CRM reads demoted to NoOp', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  assert.equal(counts[8], 3);
  for (const n of ['check-access', 'get-session-vars', 'resolve-entity']) {
    assert.match(out, new RegExp(`\\[FAIL check 8\\] node: ${n}\\n\\s+offending value: type = n8n-nodes-base.noOp`));
  }
});

test('checks 4, 9 and 10 also fire on the clone (the ones no sha diff would show)', () => {
  const { out } = check(CLONE, '--expect-live-spine');
  const counts = violationsByCheck(out);
  assert.ok(counts[4] > 0, 'the n8n_test-db credential is bound on the clone');
  assert.ok(counts[9] > 0, 'the clone binds credentials live has never heard of');
  assert.ok(counts[10] > 0, 'the clone drops check-access onError/retryOnFail silently');
  assert.match(out, /\[FAIL check 9\][\s\S]*?30 nodes bind a credential \(the measured live-spine figure is 19\)/);
  assert.match(out, /\[FAIL check 10\] node: check-access[\s\S]*?onError = None\s+\(production is 'continueErrorOutput'\)/);
});

test('the clone is refused with no profile flag too', () => {
  const { code, out } = check(CLONE);
  assert.equal(code, 1, `clone must be refused without a flag as well:\n${out}`);
});

// ---------------------------------------------------------------------------------------------
// 2. THE ONE THAT MATTERS: the live spine must go through clean
// ---------------------------------------------------------------------------------------------
test('the LIVE spine PASSES with --expect-live-spine', () => {
  const { code, out } = check(LIVE_SPINE, '--expect-live-spine');
  assert.equal(code, 0,
    `the checker must not just reject everything - live must pass:\n${out}`);
  assert.match(out, /PASS - all 10 payload checks clean/);
  assert.doesNotMatch(out, /\[FAIL check/);
});

test('the pass prints what was actually checked, not just "ok"', () => {
  const { out } = check(LIVE_SPINE, '--expect-live-spine');
  assert.match(out, /nodes: 137/);   // 134 + the Stage B set 4 plain-miss lane (gate, plan, offer)
  assert.match(out, /credentials \(19 credential-bearing nodes\)/);
  for (const n of ['send-message-files', 'send-message-images', 'send-message-video',
    'update-human-intervened', 'save-session-vars']) {
    assert.match(out, new RegExp(`${n}\\s+1 inbound`));
  }
  assert.match(out, /redis-pop-main-message-list\.list = '=q:\{\{ \$json\.contact \}\}'/);
  // every executeWorkflow target resolved to a name
  assert.match(out, /Call 'sub-query-reformulator'\s+-> XTODTw-dJcV0uRdC056hG\s+LIVE sub-semantic-parser/);
  assert.match(out, /Execute 'sub-get-rag'\s+-> tWP33QOFT7SxThfT\s+LIVE sub-get-rag/);
});

test("live's two known-inert carriers are WARNED about, never refused", () => {
  const { out } = check(LIVE_SPINE, '--expect-live-spine');
  // (a) test_run_id: the trigger declares it, detect-media copies it through.
  assert.match(out, /\[warn check 2\] contains 'test_run_id'/);
  assert.match(out, /nodes \(2\): When Executed by Another Workflow, detect-media/);
  // (b) rysSPgUssLDf6xJc carries live's main CRM read path today (deploy.py KNOWN_ID_LABELS).
  assert.match(out, /\[warn check 3\][\s\S]*?rysSPgUssLDf6xJc/);
  assert.match(out, /nodes \(3\): Call 'sub-get-results', probe-incoming, tier-probe/);
});

// ---------------------------------------------------------------------------------------------
// 3. the parser profile: the published guard is not scaffolding, but the fork still is
// ---------------------------------------------------------------------------------------------
test('the LIVE parser PASSES with --expect-live-parser despite carrying its own guard', () => {
  const { code, out } = check(LIVE_PARSER, '--expect-live-parser');
  assert.equal(code, 0,
    `test-reformulator-bypass + mock-reformulator-output ARE the published guard (LESSONS #17/#28):\n${out}`);
  assert.match(out, /PASS - all 10 payload checks clean/);
  assert.match(out, /credentials \(1 credential-bearing nodes\)/);
});

test('the parser FORK is still refused under the same profile', () => {
  const { code, out } = check(PARSER_FORK, '--expect-live-parser');
  assert.equal(code, 1, `the fork must not ride in on the guard exemption:\n${out}`);
  const counts = violationsByCheck(out);
  assert.ok(counts[4] > 0, 'the fork binds n8n_test-db');
  assert.ok(counts[9] > 0, 'the fork binds an OpenAI credential live does not use');
  assert.match(out, /\[FAIL check 2\] node: Postgres Chat Memory[\s\S]*?'n8n_test'/);
});

// ---------------------------------------------------------------------------------------------
// 4. the gate is offline and read-only - it may never be the thing that touches n8n
// ---------------------------------------------------------------------------------------------
test('the script makes no network call and no write', () => {
  const fs = require('fs');
  const src = fs.readFileSync(SCRIPT, 'utf8');
  for (const forbidden of ['urllib', 'requests', 'http.client', 'socket',
    'write_text', 'open(', 'subprocess']) {
    assert.ok(!src.includes(forbidden),
      `promotion-safety-check.py must stay offline and read-only, found ${forbidden}`);
  }
});
