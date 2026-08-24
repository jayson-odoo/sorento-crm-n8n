#!/usr/bin/env python3
"""
promotion-safety-check.py - the PAYLOAD gate that deploy.py does not have.

WHY THIS EXISTS
    A five-agent promotion review (2026-08-24) concluded that `deploy.py` has
    excellent PROCESS gates - git-clean (a), `npm test` (b), export freshness
    (c), TOCTOU re-check (c2), target allowlist (d), backup-first (e), diff +
    interactive confirm (h) - and NOT ONE gate that looks at what is inside the
    body it is about to PUT. Every gate asks "is the operator allowed to write
    here, and is the export fresh?"; none asks "is this thing safe to BE live?".

    The reviewers found EIGHT independent mechanisms by which promoting the
    TEST clone's body onto the live spine takes the WhatsApp bot down, and
    `deploy.py` would have waved all eight through behind one
    `--i-know-this-is-live` flag plus one keystroke at gate (h). The diff at
    gate (h) prints node names and jsCode shas; an operator staring at 180
    changed names cannot see that `redis-pop-main-message-list` now pops
    `test:q:` instead of `q:`.

    This script is that missing gate. It reads `export/<slug>/workflow.json`
    (with `nodes/*.js` folded in exactly as `assemble.py`/deploy.py gate (f)
    would fold them, so it inspects the bytes that would actually ship) and
    refuses a payload that still carries test scaffolding.

    It is READ-ONLY and OFFLINE. No n8n API call, no credential use, no write
    of any kind. It can be run on any checkout, any time, by anyone.

THE EIGHT MECHANISMS, AS CHECKS
    (1) `is_test` passed to a shared sub. LESSONS #17: the live subs are
        themselves guarded (`sub-sendmsg` -> `test-guard`,
        `live-sub-human-intervention` -> `test-guard`, `sub-semantic-parser` ->
        `test-reformulator-bypass`). The guard is prod-safe ONLY because no
        live caller passes it truthy. Promote the clone and 11 live callers
        start passing `is_test: true` - every customer send silently
        short-circuits and the bot goes mute while looking perfectly healthy.
    (2) Test-harness strings: redis keys, `n8n_test` tables, replay/capture
        modes, parser mocks. Each one points live traffic at harness storage.
    (3) Fork / TEST workflow ids on `executeWorkflow` nodes - live would call
        the sandbox copies of its own subs.
    (4) The `n8n_test-db` postgres credential bound to a live node.
    (5) The redis queue name. Rated by the reviewers as the most destructive
        SINGLE LINE in the payload: the dispatcher pushes a customer message
        to `q:{contact}` and re-arms the consumer; a consumer popping
        `test:q:{contact}` never drains that queue, so the dispatcher re-arms
        it, forever. Hot loop, zero replies, full queue.
    (6) The five egress nodes' inbound edges. The clone is fail-closed by
        ORPHANING them (LESSONS #16: 0 inbound = physically unreachable, which
        beats trusting a flag). That property is exactly what must NOT travel:
        a live spine whose `send-message-*` nodes have no inbound edge cannot
        send.
    (7) Harness-only nodes by name - the `guard-*-record` redis recorders that
        REPLACE a real send with a `would_send` log line, plus fixtures,
        replay pins, session-copy postgres nodes and mocks.
    (8) `check-access` / `get-session-vars` / `resolve-entity` demoted from
        `httpRequest` to `noOp`. The clone moves the real call to an `-http`
        twin and leaves a stub behind under the original name, so the node
        NAME and the wiring both look right and no downstream `$('check-access')`
        reference breaks - it just returns nothing forever.
    Plus two the reviewers added because no sha or name diff would show them:
    (9) credential count + bindings, and
    (10) node-level `onError` / `retryOnFail` settings, which live outside
        `parameters` and so are invisible to deploy.py's jsCode sha delta.

WHAT IT DOES NOT DO
    It does not decide whether the business logic is correct. It decides
    whether the payload is a PRODUCTION artifact or a TEST artifact. A payload
    can pass every check here and still be wrong; it cannot fail a check here
    and be right.

PROFILES
    --expect-live-spine   the full 10 checks, against the live spine's shape
                          (19 credential-bearing nodes, 5 egress nodes, the 3
                          CRM httpRequest nodes, the prod redis queue).
    --expect-live-parser  the guarded-SUB shape. The live parser LEGITIMATELY
                          contains `is_test`, `mock_reformulator_output` and a
                          node named `mock-reformulator-output`: that trio IS
                          the published guard from LESSONS #17/#28, not
                          scaffolding. Only those named nodes are exempt; the
                          parser FORK still fails on its `n8n_test-db` binding
                          and its different OpenAI credential.
    (no flag)             every target-agnostic check; the shape checks (5, 6,
                          8, 10) apply only to nodes that exist, and check 9
                          reports bindings without asserting a count.

TWO DELIBERATE NON-REFUSALS (both would otherwise refuse the LIVE spine itself)
    a. `test_run_id` is on the live spine TODAY - the `executeWorkflowTrigger`
       declares it as an input name and `detect-media` copies it through. It is
       an inert correlation id, so it is reported as a WARNING naming every
       carrier, never as a refusal. Banning it would mean this gate refuses
       production as it exists.
    b. `rysSPgUssLDf6xJc` ("sub-get-results TEST") is called by three LIVE
       spine nodes today and carries live's main CRM read path - deploy.py's
       own KNOWN_ID_LABELS says so. Under --expect-live-spine it is a WARNING;
       under any other profile it is a refusal.
    Both are stated out loud in the output. A gate that cries wolf on the
    current production body gets disabled within a week (LESSONS #82: "any
    gate that the act of running the tool can trip is a gate that will be
    routinely overridden").

USAGE
    promotion-safety-check.py <slug> [--expect-live-spine | --expect-live-parser]

    exit 0  payload looks like production. A positive summary is printed:
            node count, credential bindings, the five egress inbound counts,
            and every executeWorkflow target resolved to a name.
    exit 1  refuse. EVERY violation is printed, not just the first - an
            operator fixing one at a time, re-running, and finding another is
            how a gate gets bypassed.
"""
import argparse
import collections
import importlib.util
import json
import pathlib
import re
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent                  # n8n-workflows-init/
EXPORT = ROOT / "export"

LIVE_SPINE_SLUG = "live-spine-sorento-consume-main"
LIVE_PARSER_SLUG = "sub-semantic-parser"

# ---------------------------------------------------------------- known ids --
# Live ids, from .env ("Key workflow IDs") and CLAUDE.md's "Key IDs" table. A payload calling one
# of these is calling production, which is what a promoted payload is supposed to do.
LIVE_IDS = {
    "9qVyfUxmRQqrpGRMDLRuz": "LIVE spine sorento-consume-main",
    "XTODTw-dJcV0uRdC056hG": "LIVE sub-semantic-parser (reformulator)",
    "aoydkG1dbItXR5jXFEQsP": "LIVE sub-sendmsg",
    "rrYXzE61gCNUck_zmXe-G": "LIVE sub-human-intervention",
    "UrETd-jm46tFj3Xw7w8vL": "LIVE sub-save-message-redis",
    "Fss5aAaXthJSWpZCgKiKR": "LIVE sub-get-results (MCP read)",
    "tWP33QOFT7SxThfT": "LIVE sub-get-rag (pgvector)",
}

# Fork / TEST-rebase ids observed in the clone. Value = what the live caller would lose by
# calling it. `incumbent_on_live` marks an id the LIVE spine already calls today (see the module
# docstring, non-refusal (b)) - warning under --expect-live-spine, refusal everywhere else.
FORK_IDS = {
    "t4QvrtrPnTwRU6br": ("sub-get-results CS-BUILD", False),
    "wI5RkNGW3EOJfBdo": ("sub-semantic-parser FORK domain-continuity-carry", False),
    "vUfFUDjLAuMaeQE6": ("sub-human-intervention TEST (delta3)", False),
    "tWm5DYLxfypmVC1T": ("sub-respond-save-message-redis TEST", False),
    "aQUmwMVplmNcyUVc": ("sub-sendmsg-QRCHUNK", False),
    "rysSPgUssLDf6xJc": ("sub-get-results TEST", True),
    "CpxE8LroLzCkrAQN": ("sub-semantic-parser fork the clone calls", False),
}
CLONE_ID = "txiPzSxy3Pclsz6v"

# ------------------------------------------------------------------ check 2 --
# Any occurrence of one of these is a refusal. Each redirects live traffic at harness storage or
# pins a live decision to a fixture.
HARNESS_TOKENS = {
    "test:q:": "the TEST redis queue - live pops a list the dispatcher never fills",
    "test:egress:": "the harness egress log - a would_send record instead of a send",
    "respond_contacts_test": "the n8n_test session COPY - live session state stops persisting",
    "n8n_test": "the isolated harness database - not the prod CRM db",
    "chat_histories": "the regression corpus table - live turns logged into the test corpus",
    "mock_parser_output": "a pinned parser result - live stops calling the parser",
    "mock_reformulator_output": "a pinned reformulator result - live stops calling the reformulator",
    "regress-replay": "replay mode - every external pinned from golden, nothing real happens",
    "regress-capture": "capture mode - live turns written into the golden base",
    "chat-stateful": "the chat-console session mode, not the WhatsApp path",
}
# Reported, never refused. See the module docstring, non-refusal (a).
SOFT_TOKENS = {
    "test_run_id": ("an inert correlation id that the LIVE spine already carries today "
                    "(executeWorkflowTrigger input name + detect-media passthrough)"),
}

# ------------------------------------------------------------------ check 4 --
N8N_TEST_DB_CRED_ID = "Dnnofg8Xb27VQOhI"      # .env N8N_TEST_DB_CRED_ID
N8N_TEST_DB_CRED_NAME = "n8n_test-db"

# ------------------------------------------------------------------ check 5 --
REDIS_POP_NODE = "redis-pop-main-message-list"
PROD_REDIS_LIST = "=q:{{ $json.contact }}"

# ------------------------------------------------------------------ check 6 --
EGRESS_NODES = [
    "send-message-files",
    "send-message-images",
    "send-message-video",
    "update-human-intervened",
    "save-session-vars",
]

# ------------------------------------------------------------------ check 7 --
# Harness-only node names. `guard-*-record` is called out separately because it does not merely
# ADD a node, it REPLACES a real send with a redis would_send line.
GUARD_RECORD_RE = re.compile(r"^guard-.+-record$")
BANNED_NAME_PATTERNS = [
    (re.compile(r"^fixture-"), "a pinned CRM read - live answers from a fixture, not the CRM"),
    (re.compile(r"^replay-"), "a replay pin - live answers from golden capture"),
    (re.compile(r"-mock$"), "a mock stand-in for a real call"),
    (re.compile(r"^mock-"), "a mock stand-in for a real call"),
    (re.compile(r"^sim-inject-"), "a simulator injection point"),
    (re.compile(r"^pg-get-session$"), "reads session from the n8n_test copy, not the prod CRM"),
    (re.compile(r"^pg-upsert-session$"), "writes session to the n8n_test copy, not the prod CRM"),
    (re.compile(r"^parser-bypass-gate$"), "skips the parser when a mock is present"),
    (re.compile(r"^console-incoming-gate$"), "the chat-console intake, not the WhatsApp intake"),
    (re.compile(r"^chat-attach"), "the chat-console attachment path"),
    (re.compile(r"^log-incoming-chat-history-n8ntest$"),
     "logs live turns into the n8n_test regression corpus"),
]

# ------------------------------------------------------------------ check 8 --
HTTP_NODES = {
    "check-access": "the access-level read - live cannot tell who may ask what",
    "get-session-vars": "the session read - live loses every conversation's carried state",
    "resolve-entity": "the entity resolve - live cannot turn a customer's words into an id",
}
CRM_CRED_TYPE = "httpHeaderAuth"
CRM_CRED_NAME = "crm-n8n-auth"
HTTP_REQUEST_TYPE = "n8n-nodes-base.httpRequest"

# ----------------------------------------------------------------- check 10 --
# Node-level keys, OUTSIDE `parameters`, so deploy.py's jsCode-sha diff cannot see them move.
EXPECTED_NODE_SETTINGS = {
    "check-access": {
        "onError": ("continueErrorOutput",
                    "without it a CRM blip throws and kills the whole turn instead of "
                    "taking the no-access branch"),
        "retryOnFail": (True, "without it a single transient 5xx drops a customer's message"),
    },
    "get-session-vars": {
        "retryOnFail": (True, "without it a transient read failure silently resets the "
                              "conversation's state"),
    },
}

# ------------------------------------------------------------------ check 9 --
EXPECTED_CRED_NODE_COUNT = {
    "live-spine": (19, LIVE_SPINE_SLUG),
    "live-parser": (1, LIVE_PARSER_SLUG),
}

# The published guard the LIVE parser legitimately carries (LESSONS #17/#28). Exempt ONLY under
# --expect-live-parser, and ONLY these node names.
PARSER_GUARD_NODES = {
    "When Executed by Another Workflow",
    "test-reformulator-bypass",
    "mock-reformulator-output",
}
PARSER_GUARD_TOKENS = {"is_test", "mock_reformulator_output"}


class Finding:
    def __init__(self, check, node, value, consequence):
        self.check = check
        self.node = node
        self.value = value
        self.consequence = consequence

    def render(self, kind):
        return (f"  [{kind} check {self.check}] node: {self.node}\n"
                f"      offending value: {self.value}\n"
                f"      consequence:     {self.consequence}")


# ------------------------------------------------------------------- load ---
def _load_assemble():
    spec = importlib.util.spec_from_file_location("assemble_for_check", SCRIPT_DIR / "assemble.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_workflow(slug):
    """The bytes deploy.py would PUT: workflow.json with nodes/*.js folded in, exactly as gate
    (f) does it. Falls back to raw workflow.json (loudly) if the fold-in cannot run, because a
    payload we can only half-inspect must still be inspected."""
    wf_path = EXPORT / slug / "workflow.json"
    if not wf_path.exists():
        sys.exit(f"no such export: {wf_path}")
    note = "workflow.json with nodes/*.js folded in (same body deploy.py gate (f) builds)"
    try:
        asm = _load_assemble()
        wf, _stats = asm.assemble(slug, strip=True)
    except Exception as e:  # missing MANIFEST entry, unreadable body, ...
        wf = json.loads(wf_path.read_text())
        note = (f"raw workflow.json - could NOT fold nodes/*.js ({e}). Code-node bodies are "
                f"checked as exported, which may be STALE vs nodes/*.js.")
    return wf, note


def strip_inert(obj):
    """Drop n8n's mirrored input-SCHEMA descriptors before scanning.

    An `executeWorkflow` node stores the callee's declared inputs under
    `parameters.workflowInputs.schema` as {displayName, id, type, required, ...}. That is a UI
    type descriptor, not a value: the LIVE spine's schema blocks name `is_test` on three nodes
    while passing it on none. Scanning them would refuse production for describing a field it
    does not set. Values live in `workflowInputs.value`, which is kept."""
    if isinstance(obj, dict):
        return {k: strip_inert(v) for k, v in obj.items() if k != "schema"}
    if isinstance(obj, list):
        return [strip_inert(x) for x in obj]
    return obj


def inbound_counts(wf):
    """`connections` is keyed by node NAME (deploy.py's module docstring proves this against this
    repo's own data), so inbound edges are counted by walking every source's branches."""
    counts = collections.Counter()
    for _src, outputs in (wf.get("connections") or {}).items():
        for _conn_type, branches in (outputs or {}).items():
            for branch in branches or []:
                for conn in branch or []:
                    counts[conn.get("node")] += 1
    return counts


def node_by_name(wf, name):
    for n in wf.get("nodes", []):
        if n.get("name") == name:
            return n
    return None


def exec_workflow_target(node):
    wid = (node.get("parameters") or {}).get("workflowId")
    if isinstance(wid, dict):
        return wid.get("value"), wid.get("cachedResultName")
    return wid, None


# ----------------------------------------------------------------- checks ---
def check_1_is_test(wf, profile, V):
    for n in wf.get("nodes", []):
        name = n.get("name")
        if profile == "live-parser" and name in PARSER_GUARD_NODES:
            continue
        blob = json.dumps(strip_inert(n))
        if "is_test" not in blob:
            continue
        value, _cached = exec_workflow_target(n)
        passed = ((n.get("parameters") or {}).get("workflowInputs") or {}).get("value") or {}
        if "is_test" in passed:
            offending = f"workflowInputs.value.is_test = {passed['is_test']!r} -> sub {value}"
        else:
            offending = "the node body references is_test"
        V.append(Finding(
            1, name, offending,
            "the live shared subs are themselves guarded (sub-sendmsg -> test-guard, "
            "live-sub-human-intervention -> test-guard, sub-semantic-parser -> "
            "test-reformulator-bypass). A live caller passing is_test truthy makes the guard "
            "short-circuit, so this send/assign never reaches the customer and the bot goes "
            "mute while every execution still reports success. LESSONS #17."))


def check_2_tokens(wf, profile, V, W):
    for n in wf.get("nodes", []):
        name = n.get("name")
        blob = json.dumps(strip_inert(n))
        for token, why in sorted(HARNESS_TOKENS.items()):
            if token not in blob:
                continue
            if (profile == "live-parser" and name in PARSER_GUARD_NODES
                    and token in PARSER_GUARD_TOKENS):
                continue
            V.append(Finding(
                2, name, f"contains the test-harness string {token!r}",
                f"{why}. On live this is not a test artifact left lying around, it is the "
                f"path live traffic would actually take."))
        for token, why in sorted(SOFT_TOKENS.items()):
            if token in blob:
                W.append(Finding(
                    2, name, f"contains {token!r}",
                    f"NOT a refusal: {why}. Listed so a real regression in how it is used is "
                    f"visible rather than invisible."))


def check_3_fork_ids(wf, profile, V, W):
    for n in wf.get("nodes", []):
        name = n.get("name")
        blob = json.dumps(n)
        for fork_id, (label, incumbent) in sorted(FORK_IDS.items()):
            if fork_id not in blob:
                continue
            value, cached = exec_workflow_target(n)
            where = (f"workflowId.value = {value}" if value == fork_id
                     else f"references {fork_id}")
            desc = f"{where}  ({cached or label})"
            if incumbent and profile == "live-spine":
                W.append(Finding(
                    3, name, desc,
                    f"NOT a refusal: {fork_id} is called by the LIVE spine today and carries "
                    f"live's main CRM read path (deploy.py KNOWN_ID_LABELS says so). Flagged so "
                    f"the day it stops being live's real target, this line reads as the "
                    f"violation it becomes."))
            else:
                V.append(Finding(
                    3, name, desc,
                    f"this is the sandbox FORK {label!r}, not the live sub. Promoting it points "
                    f"production at a workflow nobody publishes, monitors, or keeps in step with "
                    f"the live one - and the forks are is_test-guarded, so it may not act at "
                    f"all."))
        if CLONE_ID in blob:
            V.append(Finding(
                3, name, f"references the TEST clone id {CLONE_ID}",
                "the fail-closed clone is not a production callee; live must never invoke it."))


def check_4_test_db_cred(wf, V):
    for n in wf.get("nodes", []):
        for cred_type, cred in (n.get("credentials") or {}).items():
            if (cred or {}).get("id") == N8N_TEST_DB_CRED_ID:
                V.append(Finding(
                    4, n.get("name"),
                    f"{cred_type} credential {N8N_TEST_DB_CRED_NAME} ({N8N_TEST_DB_CRED_ID})",
                    "n8n_test is the ISOLATED harness database, deliberately not the prod CRM "
                    "db. A live node bound to it reads and writes state no customer-facing "
                    "system ever sees."))


def check_5_redis_queue(wf, profile, V):
    node = node_by_name(wf, REDIS_POP_NODE)
    if node is None:
        if profile in ("live-spine",):
            V.append(Finding(
                5, REDIS_POP_NODE, "node is MISSING from the payload",
                "this is the spine's only intake. Without it live consumes nothing at all."))
        return
    actual = (node.get("parameters") or {}).get("list")
    if actual == PROD_REDIS_LIST:
        return
    V.append(Finding(
        5, REDIS_POP_NODE, f"list = {actual!r}   (production is {PROD_REDIS_LIST!r})",
        "*** THE MOST DESTRUCTIVE SINGLE LINE IN THE PAYLOAD *** The dispatcher pushes each "
        "customer message onto q:{contact} and re-arms the consumer. A consumer popping a "
        "DIFFERENT list never drains q:{contact}, so the dispatcher re-arms it, and re-arms it, "
        "and re-arms it. Result: a hot loop, a queue that only grows, and not one reply sent. "
        "Nothing in deploy.py's diff makes this line stand out from 180 others."))


def check_6_egress_inbound(wf, profile, V, counts):
    for name in EGRESS_NODES:
        node = node_by_name(wf, name)
        if node is None:
            if profile in ("live-spine",):
                V.append(Finding(
                    6, name, "node is MISSING from the payload",
                    "one of live's five egress nodes does not exist in this body."))
            continue
        got = counts.get(name, 0)
        if got == 1:
            continue
        if got == 0:
            V.append(Finding(
                6, name, "inbound edges = 0 (ORPHANED)",
                "this is the clone's fail-closed containment travelling to production. LESSONS "
                "#16: the clone orphans its egress nodes so they are physically unreachable. On "
                "live that same property means the node can never fire - the message/file/state "
                "write simply does not happen, and no error is raised because nothing ran."))
        else:
            V.append(Finding(
                6, name, f"inbound edges = {got} (expected exactly 1)",
                "an egress node reachable from more than one lane sends more than once, or "
                "sends from a lane that was never meant to send."))


def check_7_harness_nodes(wf, profile, V):
    for n in wf.get("nodes", []):
        name = n.get("name") or ""
        if profile == "live-parser" and name in PARSER_GUARD_NODES:
            continue
        if GUARD_RECORD_RE.match(name):
            V.append(Finding(
                7, name, "a guard-*-record harness node",
                "these do not sit alongside a real send, they REPLACE it: the node writes a "
                "would_send line to redis test:egress:{test_run_id} where production writes a "
                "WhatsApp message. Promoted, the bot logs its answers to redis and tells the "
                "customer nothing."))
            continue
        for pattern, why in BANNED_NAME_PATTERNS:
            if pattern.search(name):
                V.append(Finding(
                    7, name, f"node name matches the harness pattern /{pattern.pattern}/",
                    f"{why}. Test scaffolding, never part of a production body."))
                break


def check_8_http_nodes(wf, profile, V):
    for name, why in sorted(HTTP_NODES.items()):
        node = node_by_name(wf, name)
        if node is None:
            if profile in ("live-spine",):
                V.append(Finding(
                    8, name, "node is MISSING from the payload",
                    f"{why} - and it is not in this body at all."))
            continue
        node_type = node.get("type")
        if node_type != HTTP_REQUEST_TYPE:
            V.append(Finding(
                8, name, f"type = {node_type}   (expected {HTTP_REQUEST_TYPE})",
                f"the clone demotes this to a NoOp and moves the real call to a '{name}-http' "
                f"twin. The name and the wiring still look right, every downstream "
                f"$('{name}') reference still resolves, and nothing throws - the node just "
                f"returns nothing, forever. {why.capitalize()}."))
            continue
        cred = (node.get("credentials") or {}).get(CRM_CRED_TYPE) or {}
        if cred.get("name") != CRM_CRED_NAME:
            V.append(Finding(
                8, name, f"{CRM_CRED_TYPE} credential = {cred.get('name')!r} "
                         f"(expected {CRM_CRED_NAME!r})",
                f"an httpRequest to the CRM with no (or the wrong) auth header gets a 401. "
                f"{why.capitalize()}."))


def check_9_credentials(wf, profile, V, bindings):
    expected = EXPECTED_CRED_NODE_COUNT.get(profile)
    if not expected:
        return
    want_count, ref_slug = expected
    got_count = len(bindings)
    if got_count != want_count:
        V.append(Finding(
            9, f"(payload-wide: {got_count} credential-bearing nodes)",
            f"{got_count} nodes bind a credential (the measured {profile} figure is "
            f"{want_count})",
            "a payload with MORE credential-bearing nodes than production has is carrying "
            "connections production does not use (harness db, harness redis); a payload with "
            "FEWER has lost a binding, and a node that lost its credential fails at runtime, "
            "not at deploy time."))
    ref_path = EXPORT / ref_slug / "workflow.json"
    if not ref_path.exists():
        V.append(Finding(
            9, "(reference)", f"reference export {ref_path} is missing",
            "cannot verify credential ids against production without it."))
        return
    ref = json.loads(ref_path.read_text())
    known = set()
    for n in ref.get("nodes", []):
        for _t, c in (n.get("credentials") or {}).items():
            if (c or {}).get("id"):
                known.add(c["id"])
    for node_name, cred_type, cred_id, cred_name in bindings:
        if cred_id not in known:
            V.append(Finding(
                9, node_name,
                f"{cred_type} credential {cred_name!r} ({cred_id}) is NOT bound anywhere in "
                f"export/{ref_slug}/",
                "production does not use this credential. Either it is a harness connection, "
                "or it is a credential nobody has reviewed for production blast radius."))


def check_10_node_settings(wf, profile, V):
    for name, expectations in sorted(EXPECTED_NODE_SETTINGS.items()):
        node = node_by_name(wf, name)
        if node is None:
            continue  # check 8 already reports a missing node under the spine profile
        for key, (want, why) in sorted(expectations.items()):
            got = node.get(key)
            if got == want:
                continue
            V.append(Finding(
                10, name, f"{key} = {got!r}   (production is {want!r})",
                f"{why}. This key lives OUTSIDE `parameters`, so deploy.py's jsCode-sha delta "
                f"and its node-name diff both show nothing - the clone drops it silently and "
                f"the payload looks byte-clean."))


# ---------------------------------------------------------------- summary ---
def positive_summary(wf, slug, profile, body_note, counts, bindings, warnings):
    print(f"=== promotion-safety-check: {slug}  [profile: {profile}]")
    print(f"    body inspected: {body_note}")
    print(f"    workflow: {wf.get('name')!r}  id={wf.get('id')}  "
          f"versionId={str(wf.get('versionId'))[:8]}")
    print(f"    nodes: {len(wf.get('nodes', []))}")

    print(f"\n--- credentials ({len(bindings)} credential-bearing nodes)")
    by_cred = collections.defaultdict(list)
    for node_name, cred_type, cred_id, cred_name in bindings:
        by_cred[(cred_type, cred_name, cred_id)].append(node_name)
    for (cred_type, cred_name, cred_id), nodes in sorted(by_cred.items()):
        print(f"    {cred_type:16s} {cred_name!r} ({cred_id})  x{len(nodes)}")
        for node_name in sorted(nodes):
            print(f"        - {node_name}")

    print("\n--- egress nodes (inbound edges; exactly 1 = reachable from its own lane)")
    for name in EGRESS_NODES:
        exists = node_by_name(wf, name) is not None
        state = f"{counts.get(name, 0)} inbound" if exists else "MISSING"
        print(f"    {name:26s} {state}")

    print("\n--- executeWorkflow targets")
    rows = []
    for n in wf.get("nodes", []):
        if not str(n.get("type", "")).endswith("executeWorkflow"):
            continue
        value, cached = exec_workflow_target(n)
        if value is None:
            continue
        label = LIVE_IDS.get(value)
        if label is None and value in FORK_IDS:
            label = f"FORK: {FORK_IDS[value][0]}"
        rows.append((n.get("name"), value, label or cached or "(unresolved)"))
    for node_name, value, label in sorted(rows):
        print(f"    {node_name:56s} -> {value:24s} {label}")
    if not rows:
        print("    (none)")

    node = node_by_name(wf, REDIS_POP_NODE)
    if node is not None:
        print(f"\n--- intake\n    {REDIS_POP_NODE}.list = "
              f"{(node.get('parameters') or {}).get('list')!r}")

    if warnings:
        print(f"\n--- {len(warnings)} WARNING(S) (reported, not refused)")
        seen = collections.defaultdict(list)
        for w in warnings:
            seen[(w.check, w.value, w.consequence)].append(w.node)
        for (check, value, consequence), nodes in sorted(seen.items()):
            print(f"  [warn check {check}] {value}")
            print(f"      consequence: {consequence}")
            print(f"      nodes ({len(nodes)}): {', '.join(sorted(nodes))}")


# ------------------------------------------------------------------- main ---
def run_against(body, profile):
    """THE IMPORTABLE ENTRY POINT. Runs all 10 checks against an ALREADY-ASSEMBLED workflow body
    and returns (counts, bindings, violations, warnings).

    `body` is any dict with `nodes` + `connections`. In particular it is the exact dict deploy.py
    gate (f) hands to its PUT — {name, nodes, connections, settings} — which is the whole point:
    a payload gate that re-derived the body from export/<slug>/ would be inspecting bytes that
    are merely SIMILAR to the ones that ship. `run(slug, ...)` below is this function plus the
    export/-tree load, so the CLI and deploy.py execute the identical checks.

    Nothing here needs `id`, `versionId` or `pinData`; a PUT body carries none of them."""
    counts = inbound_counts(body)
    bindings = []
    for n in body.get("nodes", []):
        for cred_type, cred in (n.get("credentials") or {}).items():
            bindings.append((n.get("name"), cred_type, (cred or {}).get("id"),
                             (cred or {}).get("name")))

    V, W = [], []
    check_1_is_test(body, profile, V)
    check_2_tokens(body, profile, V, W)
    check_3_fork_ids(body, profile, V, W)
    check_4_test_db_cred(body, V)
    check_5_redis_queue(body, profile, V)
    check_6_egress_inbound(body, profile, V, counts)
    check_7_harness_nodes(body, profile, V)
    check_8_http_nodes(body, profile, V)
    check_9_credentials(body, profile, V, bindings)
    check_10_node_settings(body, profile, V)
    return counts, bindings, V, W


def print_violations(violations, warnings):
    """Every violation, never just the first — an operator fixing one at a time, re-running, and
    finding another is how a gate gets bypassed. Shared by the CLI and deploy.py's gate (f2) so
    the two read identically."""
    for v in sorted(violations, key=lambda f: (f.check, f.node or "")):
        print(v.render("FAIL"))
        print()
    by_check = collections.Counter(v.check for v in violations)
    print("violations by check: " + ", ".join(
        f"#{c}={by_check[c]}" for c in sorted(by_check)))
    if warnings:
        print(f"(plus {len(warnings)} warning(s), not counted above)")


def run(slug, profile):
    wf, body_note = load_workflow(slug)
    counts, bindings, V, W = run_against(wf, profile)
    return wf, body_note, counts, bindings, V, W


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="export/<slug> directory name")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--expect-live-spine", action="store_true",
                   help="payload is destined for the live spine (all 10 checks, live's shape)")
    g.add_argument("--expect-live-parser", action="store_true",
                   help="payload is destined for the live semantic-parser sub "
                        "(guarded-sub shape)")
    args = ap.parse_args()

    profile = ("live-spine" if args.expect_live_spine else
               "live-parser" if args.expect_live_parser else "generic")

    wf, body_note, counts, bindings, violations, warnings = run(args.slug, profile)

    if violations:
        print(f"=== promotion-safety-check: {args.slug}  [profile: {profile}]")
        print(f"    body inspected: {body_note}")
        print(f"\nREFUSED - {len(violations)} violation(s). This payload is a TEST artifact, "
              f"not a production one.\n")
        print_violations(violations, warnings)
        print("\nDo NOT promote. Fix every line above, or promote a different export.")
        return 1

    positive_summary(wf, args.slug, profile, body_note, counts, bindings, warnings)
    print(f"\nPASS - all 10 payload checks clean for profile {profile!r}. "
          f"This body carries no test scaffolding this gate knows about.")
    print("(This gate does not judge business logic. It judges production-vs-test only.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
