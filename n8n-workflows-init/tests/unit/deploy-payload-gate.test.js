// -- deploy-payload-gate.test.js - deploy.py's re-export scope and its payload gate --------------
//
// Two faults, both in scripts/deploy.py, both found on 2026-08-24.
//
// 1. THE RE-EXPORT REVERTED OTHER SLUGS. After a successful own-id PUT, do_deploy printed
//    "re-running export-workflows.py + --verify for this slug" and then ran export-workflows.py
//    with NO ARGUMENT - so it iterated the whole TARGETS map (21 slugs) and rewrote workflow.json,
//    nodes/*.js, TOPOLOGY.md and MANIFEST.json for every one of them from the bytes currently on
//    the live instance. Any OTHER slug with staged, undeployed edits lost them, silently. It
//    happened four times in one day; twice it reached a commit. Git scar: dc8d5c7 "restore the
//    axis split the clone re-export reverted". The two-target promotion case is the dangerous one:
//    deploy target A, target B's staged body is reverted underneath you, and gate (a) then reports
//    a clean tree because the working copy now matches live.
//
// 2. NOTHING CALLED THE PAYLOAD GATE. scripts/promotion-safety-check.py (commit 27f8d06) inspects
//    an assembled body for test scaffolding and refuses the TEST clone with 110 violations, but no
//    caller existed. It is now gate (f2), between (f) - where assemble.py folds nodes/*.js in and
//    build_put_body strips settings, so the gate sees the EXACT bytes that ship - and (h), the
//    interactive confirm, so a refusal happens before the operator is asked anything.
//
// WHY THIS IS A .test.js AND NOT A PYTHON unittest
//   Same reason promotion-safety-check.test.js gives: `npm test` is
//   `node --test .../tests/unit/*.test.js`, and deploy.py's own gate (b) IS `npm test`. The
//   sibling deploy_gates_test.py is never executed by anything - a gate whose test never runs is
//   a gate that rots.
//
// ZERO n8n ACCESS. Every test here drives the REAL do_deploy with ew.env, gate_a (git), gate_b
// (npm test), gate_c/(c2) (the GETs) and do_put (the PUT) replaced by fakes. assemble.py is NOT
// faked - the bodies inspected are the real ones folded out of export/, read from local disk.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// A hermetic in-process harness around deploy.py: real module, real assemble.py, real
// promotion-safety-check.py, faked everything that would touch the network, git, npm or a file.
const PREAMBLE = `
import builtins, importlib.util, json, pathlib, subprocess, sys
SCRIPTS = pathlib.Path("n8n-workflows-init/scripts").resolve()
spec = importlib.util.spec_from_file_location("deploy_under_test", SCRIPTS / "deploy.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

CALLS = []
PUTS = []

class FakeSubprocess:
    @staticmethod
    def run(argv, **kw):
        CALLS.append([str(a) for a in argv])
        return subprocess.CompletedProcess(args=argv, returncode=0, stdout="", stderr="")

d.subprocess = FakeSubprocess

TARGET_WF = {"name": "target-name", "nodes": [], "versionId": "v1", "activeVersionId": "v1"}
d.ew.env = lambda: ("http://fake.invalid", "fake-key")
d.gate_a = lambda slug, allow_dirty: (True, "(a) OK - faked")
d.gate_b = lambda: (True, "(b) OK - faked")
d.gate_c = lambda *a, **k: (True, "(c) OK - faked", TARGET_WF)
d.gate_e = lambda target_wf, to_id: pathlib.Path("/dev/null")
d.gate_c2_recheck = lambda *a, **k: (True, "(c2) OK - faked", TARGET_WF)

def fake_put(base, key, to_id, body):
    PUTS.append(to_id)
    return 200, {}

d.do_put = fake_put

def loud_input(prompt=""):
    print("REACHED-GATE-H-CONFIRM")
    return "y"

builtins.input = loud_input

def drive(argv):
    sys.argv = ["deploy.py"] + argv
    rc = 0
    try:
        d.main()
    except SystemExit as e:
        rc = e.code if isinstance(e.code, int) else 1
    print("RC=" + str(rc))
    print("CALLS=" + json.dumps(CALLS))
    print("PUTS=" + json.dumps(PUTS))
`;

function py(src) {
  const res = spawnSync('python3', ['-c', `${PREAMBLE}\n${src}`],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.error, undefined, `spawn failed: ${res.error}`);
  const out = `${res.stdout}${res.stderr}`;
  const pick = (k) => {
    const line = out.split('\n').find((l) => l.startsWith(`${k}=`));
    assert.ok(line !== undefined, `no ${k}= line in output:\n${out}`);
    return line.slice(k.length + 1);
  };
  return { out, rc: Number(pick('RC')), calls: JSON.parse(pick('CALLS')),
    puts: JSON.parse(pick('PUTS')) };
}

// Every slug export-workflows.py knows about. The re-export must touch exactly one of these.
const ALL_SLUGS = require('fs')
  .readdirSync(path.join(REPO_ROOT, 'n8n-workflows-init', 'export'))
  .filter((s) => !s.startsWith('.'));

// -----------------------------------------------------------------------------------------------
// 1. the re-export must be scoped to the slug just deployed, and to nothing else
// -----------------------------------------------------------------------------------------------
test('the post-PUT re-export names the deployed slug', () => {
  const r = py(`drive(["sub-get-results", "--to", "Fss5aAaXthJSWpZCgKiKR", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, `deploy should have completed:\n${r.out}`);
  assert.deepEqual(r.puts, ['Fss5aAaXthJSWpZCgKiKR'], 'the (faked) PUT must have been reached');
  assert.equal(r.calls.length, 2,
    `expected exactly the export + the --verify call, got:\n${JSON.stringify(r.calls, null, 2)}`);
  for (const call of r.calls) {
    assert.ok(call.some((a) => a.endsWith('export-workflows.py')), `not the exporter: ${call}`);
    assert.ok(call.includes('sub-get-results'),
      `export-workflows.py was invoked with no slug, so it rewrites ALL ${ALL_SLUGS.length} `
      + `exports from live and reverts any other slug's staged edits: ${JSON.stringify(call)}`);
  }
  assert.ok(r.calls[1].includes('--verify'), 'the second call is the freshness verify');
});

test('the post-PUT re-export names NO other slug', () => {
  const r = py(`drive(["sub-get-results", "--to", "Fss5aAaXthJSWpZCgKiKR", "--i-know-this-is-live"])`);
  const mentioned = new Set(r.calls.flat());
  // Non-vacuous: an exporter invoked with NO slug at all also mentions no OTHER slug, and that is
  // exactly the bug. Assert the deployed one IS named before asserting the rest are not.
  assert.ok(mentioned.has('sub-get-results'),
    `the deployed slug must be named: ${JSON.stringify(r.calls)}`);
  for (const slug of ALL_SLUGS) {
    if (slug === 'sub-get-results') continue;
    assert.ok(!mentioned.has(slug),
      `deploying sub-get-results must not re-export ${slug} - that is how dc8d5c7 happened`);
  }
});

test('a retarget deploy does not re-export at all (unchanged behaviour)', () => {
  const r = py(`drive(["sub-get-results", "--to", "rysSPgUssLDf6xJc", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, r.out);
  assert.deepEqual(r.calls, [], 'only an own-id deploy re-exports');
});

// -----------------------------------------------------------------------------------------------
// 2. gate (f2): the profile is chosen by TARGET id, and the TEST/scratch targets skip it entirely
// -----------------------------------------------------------------------------------------------
test('profile selection is by target id, with the clone and the sandbox skipped', () => {
  const r = py(`
for wid in ["9qVyfUxmRQqrpGRMDLRuz", "XTODTw-dJcV0uRdC056hG", "Fss5aAaXthJSWpZCgKiKR",
            "rysSPgUssLDf6xJc", "txiPzSxy3Pclsz6v", "SEqUDO7tpmtNdeDb"]:
    print("PROFILE " + wid + " -> " + repr(d.payload_gate_profile(wid)))
print("RC=0")
print("CALLS=[]")
print("PUTS=[]")
`);
  assert.match(r.out, /PROFILE 9qVyfUxmRQqrpGRMDLRuz -> 'live-spine'/);
  assert.match(r.out, /PROFILE XTODTw-dJcV0uRdC056hG -> 'live-parser'/);
  assert.match(r.out, /PROFILE Fss5aAaXthJSWpZCgKiKR -> 'generic'/);
  assert.match(r.out, /PROFILE rysSPgUssLDf6xJc -> 'generic'/);
  // The inversion that matters: the clone is LEGITIMATELY full of scaffolding. Gating it would
  // refuse its own routine redeploy and make the tool unusable for daily work.
  assert.match(r.out, /PROFILE txiPzSxy3Pclsz6v -> None/);
  assert.match(r.out, /PROFILE SEqUDO7tpmtNdeDb -> None/);
});

test('a live-spine-targeted deploy runs the gate under the live-spine profile', () => {
  const r = py(`drive(["live-spine-sorento-consume-main", "--to", "9qVyfUxmRQqrpGRMDLRuz",
                       "--dry-run", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, `the live spine's own body must pass its own gate:\n${r.out}`);
  assert.match(r.out, /gate \(f2\) payload safety/);
  assert.match(r.out, /\(f2\) OK[\s\S]*?live-spine/);
  assert.doesNotMatch(r.out, /\(f2\) FAIL/);
  assert.doesNotMatch(r.out, /\(f2\) SKIPPED/);
});

test('a clone-targeted deploy SKIPS the gate and still redeploys cleanly', () => {
  const r = py(`drive(["clone-sorento-consume-main-TEST", "--to", "txiPzSxy3Pclsz6v",
                       "--target-override"])`);
  assert.equal(r.rc, 0, `the clone's routine redeploy must not be refused:\n${r.out}`);
  assert.match(r.out, /\(f2\) SKIPPED/);
  assert.doesNotMatch(r.out, /\(f2\) FAIL/);
  assert.deepEqual(r.puts, ['txiPzSxy3Pclsz6v']);
  // and its own re-export is scoped to itself
  assert.equal(r.calls.length, 2, JSON.stringify(r.calls));
  for (const call of r.calls) assert.ok(call.includes('clone-sorento-consume-main-TEST'));
});

test('the gate sits AFTER (f) and BEFORE (g)/(h) in the printed order', () => {
  const r = py(`drive(["sub-get-results", "--to", "Fss5aAaXthJSWpZCgKiKR",
                       "--dry-run", "--i-know-this-is-live"])`);
  const at = (s) => {
    const i = r.out.indexOf(s);
    assert.notEqual(i, -1, `"${s}" missing from:\n${r.out}`);
    return i;
  };
  assert.ok(at('gate (f) assemble') < at('gate (f2) payload safety'),
    'the gate must inspect the bytes gate (f) built, not a re-derived body');
  assert.ok(at('gate (f2) payload safety') < at('gate (g) credentials'));
  assert.ok(at('gate (f2) payload safety') < at('gate (h) diff'),
    'a refusal must happen before the operator is asked anything');
});

// -----------------------------------------------------------------------------------------------
// 3. a body carrying test scaffolding is refused, and refused before the confirm prompt
// -----------------------------------------------------------------------------------------------
const POISON = `
real_assemble = d.asm.assemble
def poisoned(slug, strip=True):
    wf, stats = real_assemble(slug, strip=strip)
    wf["nodes"].append({
        "id": "poison-node",
        "name": "Call 'sub-sendmsg'",
        "type": "n8n-nodes-base.executeWorkflow",
        "parameters": {"workflowId": {"value": "aoydkG1dbItXR5jXFEQsP"},
                       "workflowInputs": {"value": {"is_test": True}}},
    })
    return wf, stats
d.asm.assemble = poisoned
`;

test('a body passing is_test: true to a live sub is REFUSED', () => {
  const r = py(`${POISON}
drive(["sub-get-results", "--to", "Fss5aAaXthJSWpZCgKiKR", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 1, `the deploy must exit non-zero:\n${r.out}`);
  assert.match(r.out, /\(f2\) FAIL/);
  assert.match(r.out, /\[FAIL check 1\] node: Call 'sub-sendmsg'/);
  assert.match(r.out, /workflowInputs\.value\.is_test = True/);
  assert.match(r.out, /violations by check: #1=1/);
  assert.match(r.out, /Do NOT promote/);
});

test('the refusal happens BEFORE the interactive confirm and before any PUT', () => {
  const r = py(`${POISON}
drive(["sub-get-results", "--to", "Fss5aAaXthJSWpZCgKiKR", "--i-know-this-is-live"])`);
  assert.doesNotMatch(r.out, /REACHED-GATE-H-CONFIRM/,
    'gate (h) asked the operator to confirm a payload the gate had already refused');
  assert.deepEqual(r.puts, [], 'nothing may be PUT after a payload refusal');
  assert.deepEqual(r.calls, [], 'and nothing may be re-exported either');
});

test('the same poisoned body is waved through when the target is the clone', () => {
  const r = py(`${POISON}
drive(["clone-sorento-consume-main-TEST", "--to", "txiPzSxy3Pclsz6v", "--target-override"])`);
  assert.equal(r.rc, 0, `the clone is exempt by design:\n${r.out}`);
  assert.match(r.out, /\(f2\) SKIPPED/);
  assert.deepEqual(r.puts, ['txiPzSxy3Pclsz6v']);
});

// -----------------------------------------------------------------------------------------------
// 5. PAYLOAD_GATE_SKIP: a test-artifact FORK skips (f2) but NOT (d) — separate from UNPROTECTED,
//    which governs both. 2026-08-24: gate (f2) refused the parser FORK wI5RkNGW3EOJfBdo with 8
//    violations for scaffolding that IS its containment, exactly like the clone's. The fix is a
//    skip set used ONLY by (f2); UNPROTECTED (and the clone's --target-override) must not widen.
// -----------------------------------------------------------------------------------------------
test('a deploy targeting the parser FORK SKIPS gate (f2) and names it a test artifact', () => {
  const r = py(`drive(["sub-semantic-parser-FORK", "--to", "wI5RkNGW3EOJfBdo",
                       "--dry-run", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, `the fork's own body must not be refused:\n${r.out}`);
  assert.match(r.out, /\(f2\) SKIPPED/);
  assert.match(r.out, /wI5RkNGW3EOJfBdo is a[\s\S]{0,80}test artifact/,
    'the skip message must name the fork as a test artifact, not just say SKIPPED');
  assert.doesNotMatch(r.out, /\(f2\) FAIL/);
});

test('the LIVE parser (not the fork) still RUNS gate (f2) — the skip is narrow', () => {
  const r = py(`drive(["sub-semantic-parser", "--to", "XTODTw-dJcV0uRdC056hG",
                       "--dry-run", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, `the live parser's own body must pass its own gate:\n${r.out}`);
  assert.match(r.out, /gate \(f2\) payload safety/);
  assert.match(r.out, /\(f2\) OK[\s\S]*?live-parser/);
  assert.doesNotMatch(r.out, /\(f2\) SKIPPED/,
    'only the fork id is in PAYLOAD_GATE_SKIP, not the live sub it forks from');
});

test('the LIVE spine still RUNS gate (f2) — the skip does not leak to other live ids', () => {
  const r = py(`drive(["live-spine-sorento-consume-main", "--to", "9qVyfUxmRQqrpGRMDLRuz",
                       "--dry-run", "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, r.out);
  assert.match(r.out, /\(f2\) OK[\s\S]*?live-spine/);
  assert.doesNotMatch(r.out, /\(f2\) SKIPPED/);
});

test('the fork is NOT in UNPROTECTED: --yes is still refused for it', () => {
  const r = py(`drive(["sub-semantic-parser-FORK", "--to", "wI5RkNGW3EOJfBdo",
                       "--i-know-this-is-live", "--yes"])`);
  assert.equal(r.rc, 1, `--yes must still be refused for a non-UNPROTECTED target:\n${r.out}`);
  assert.match(r.out, /\(d\) FAIL[\s\S]*not in UNPROTECTED[\s\S]*--yes[\s\S]*refused/);
  assert.deepEqual(r.puts, [], 'nothing may be PUT when gate (d) refuses --yes');
});

test('the fork still demands gate (d)\'s interactive confirm at (h)', () => {
  const r = py(`drive(["sub-semantic-parser-FORK", "--to", "wI5RkNGW3EOJfBdo",
                       "--i-know-this-is-live"])`);
  assert.equal(r.rc, 0, r.out);
  assert.match(r.out, /REACHED-GATE-H-CONFIRM/,
    'PAYLOAD_GATE_SKIP must not also skip the interactive confirm gate (h) demands via (d)');
  assert.deepEqual(r.puts, ['wI5RkNGW3EOJfBdo']);
});

test('PAYLOAD_GATE_SKIP is disjoint from UNPROTECTED (the whole point of a separate set)', () => {
  const r = py(`
print("DISJOINT=" + str(d.PAYLOAD_GATE_SKIP.keys().isdisjoint(d.UNPROTECTED)))
print("FORK_NOT_UNPROTECTED=" + str("wI5RkNGW3EOJfBdo" not in d.UNPROTECTED))
print("RC=0")
print("CALLS=[]")
print("PUTS=[]")
`);
  assert.match(r.out, /DISJOINT=True/);
  assert.match(r.out, /FORK_NOT_UNPROTECTED=True/);
});

// -----------------------------------------------------------------------------------------------
// 4. --rollback keeps its reduced gate set (d, e, h). A gate that blocks a rollback is a hazard.
// -----------------------------------------------------------------------------------------------
test('--rollback does not run the payload gate', () => {
  const r = py(`
import json, pathlib, tempfile
backup = pathlib.Path(tempfile.mkdtemp()) / "backup.json"
backup.write_text(json.dumps({"name": "x", "nodes": [{
    "id": "n1", "name": "Call 'sub-sendmsg'", "type": "n8n-nodes-base.executeWorkflow",
    "parameters": {"workflowId": {"value": "aoydkG1dbItXR5jXFEQsP"},
                   "workflowInputs": {"value": {"is_test": True}}}}], "connections": {}}))
d.ew.fetch = lambda base, key, wid: TARGET_WF
drive(["--rollback", str(backup), "--to", "Fss5aAaXthJSWpZCgKiKR", "--dry-run",
       "--i-know-this-is-live"])
`);
  assert.equal(r.rc, 0,
    `restoring a known-previous body during an outage must never be blocked:\n${r.out}`);
  assert.doesNotMatch(r.out, /\(f2\)/,
    'the rollback path is the remediation FOR a bad deploy; gating it on the same check that let '
    + 'the bad deploy through is circular, and an outage is the worst time to discover it');
});
