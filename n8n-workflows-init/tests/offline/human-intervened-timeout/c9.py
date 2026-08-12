"""C9 — every field reference in a DEPLOYED node's PARAMETERS must resolve to a field its source
actually emits, and no parameter or body may use `.first()` inside the per-item fan-out region.

THIS IS THE CHECK F-RECHECK SLIPPED PAST (tester, 2026-08-12).
`ht-recheck-stamp`'s key was `test:ht:active:{{ $json.contact_id }}` while its real upstream
`ht-findcontact` emits a respond.io contact whose id field is `id` — never `contact_id`. Every recheck
missed, `ht-classify` always answered `skip-vanished`, and the sweeper's clear/notify/forget path was
structurally unreachable. Nothing in this repo compared an expression against the shape its real
upstream produces:

  * the offline harness executes BODIES and hand-builds each node's inputs, so it never evaluates a
    parameter at all;
  * `assert-built.py` C1–C8 checked containment, namespace, sub-targets, body bytes and graph shape —
    every one of which passed, correctly, while the feature was inert.

That is LESSONS §71 (a review built from `nodes/*.js` is blind to non-Code parameters) meeting §63
(a sound assertion pointed at the wrong object). The gap was structural, so the fix is an instrument,
not a corrected expression.

HOW THE FIELD SETS ARE OBTAINED. By EXECUTING each owned Code body (`harness.js --emit-schema`), never
from a hand-written registry. A registry would be a second copy of the truth, free to drift from the
code exactly as the expression drifted from its upstream — and to drift silently, since nothing would
compare the registry either.

Kept in its own module because it is the largest check and because `rec` is injected, so the module has
no dependency on `assert-built.py`.
"""
import json
import re
import subprocess
import sys

# Node types that pass input items through UNCHANGED, so a `$json.x` read downstream resolves against
# THEIR upstream. Verified against the n8n Redis node implementation: only push/set/delete re-push
# `items[itemIndex]`; get/keys/pop/incr/llen/info build a fresh `{json:{}}` and DISCARD the input.
# Getting this table wrong in the permissive direction is precisely what F-RECHECK was.
PASSTHROUGH_TYPES = {
    'n8n-nodes-base.if',
    'n8n-nodes-base.noOp',
    'n8n-nodes-base.filter',
    'n8n-nodes-base.switch',
}
REDIS_PASSTHROUGH_OPS = {'push', 'set', 'delete'}

# Sources whose output shape this repo does not own: a reference through them is UNRESOLVABLE rather
# than wrong. Every entry carries a reason — an opaque source with no entry FAILS C9, so a new node
# type cannot quietly widen the blind spot.
OPAQUE_TYPES = {
    'n8n-nodes-base.webhook': 'driver payload, shape supplied by the caller',
    'n8n-nodes-base.executeWorkflowTrigger': 'driver payload, shape supplied by the caller',
    'n8n-nodes-base.scheduleTrigger': 'no payload',
    'n8n-nodes-base.formTrigger': 'form field labels; ht-config-apply validates them at runtime',
    'n8n-nodes-base.executeWorkflow': 'sub-workflow output, owned by the sub',
    'n8n-nodes-base.form': 'terminal node',
}

# Nodes that turn one input item into many. Everything reachable from one is the PER-ITEM REGION, where
# `$('N').first()` silently means "item 0 for every row" — the multi-contact hazard the tester called
# out explicitly when specifying this fix.
FANOUT_NODES = {'ht-sweep-fanout'}

# `$json.<field>` reads permitted to resolve through an opaque source, each with a reason.
# Deliberately empty: today every such read resolves concretely, and an empty allowlist means a new
# opaque read has to be justified here rather than absorbed silently.
OPAQUE_REF_ALLOWLIST = {}

# `jsCode` is excluded from FIELD RESOLUTION (not from the .first() scan). Two reasons: bodies are
# executed for real by harness.js, which is stronger evidence than a static scan; and bodies
# legitimately probe for possibly-absent fields (`c.score_ms === undefined`), which a resolver would
# false-positive on. Parameters have neither property — nothing executes them offline and nothing
# guards them.
SCAN_SKIP_PARAM_KEYS = {'jsCode'}

SENTINEL = re.compile(r'###HT-SCHEMA-BEGIN###\n(.*)\n###HT-SCHEMA-END###', re.S)

_Q = "['\"]"
_IDENT = r'[A-Za-z_$][\w$]*'
# $json.foo | $json["foo"] | $json['foo']
RE_JSON = re.compile(r'\$json\s*(?:\.\s*(' + _IDENT + r')|\[\s*' + _Q + r'([^\'"]+)' + _Q + r'\s*\])')
# $('N')…json.foo — single-hop, one line. The two-hop form (bind the handle, read it later) is a
# Code-BODY pattern and bodies are covered by execution; see SCAN_SKIP_PARAM_KEYS.
RE_NODE = re.compile(
    r'\$\(\s*' + _Q + r'([^\'"]+)' + _Q + r'\s*\)'
    r'\s*(?:\.\s*(?:first|last|item)\s*\(\s*\)|\.\s*item)?'
    r'\s*\.\s*json\s*(?:\.\s*(' + _IDENT + r')|\[\s*' + _Q + r'([^\'"]+)' + _Q + r'\s*\])')
RE_NODE_FIRST = re.compile(r'\$\(\s*' + _Q + r'([^\'"]+)' + _Q + r'\s*\)\s*\.\s*first\s*\(\s*\)')

# OPAQUE_TYPES is CONSULTED, not decoration (reviewer instrument-gap 3): `fields_of` reports the reason
# for an opaque source, so the dict drives the message rather than merely documenting it. The fail-safe is
# unchanged — an unenumerated type is still opaque, and an opaque reference still FAILS unless allowlisted.
def opaque_reason(node_type):
    return OPAQUE_TYPES.get(node_type, 'unenumerated node type ' + node_type)


OPAQUE = object()


def emitted_schema(here):
    """Field sets derived by RUNNING each owned Code body. Sentinel-delimited on the stdout of the
    invocation made right here, so the schema cannot be older than the check consuming it."""
    out = subprocess.run(['node', str(here / 'harness.js'), '--emit-schema'],
                         capture_output=True, text=True, cwd=str(here)).stdout
    m = SENTINEL.search(out)
    if not m:
        print('FATAL(C9): harness.js --emit-schema produced no schema block. A C9 result without a '
              'schema would be vacuous, so this is fatal rather than skipped.')
        sys.exit(2)
    return json.loads(m.group(1))


def strip_js_comments(src):
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', src)


def param_strings(node, include_jscode=False):
    """Every string leaf in a node's parameters, with its key path."""
    out = []

    def walk(v, path):
        if isinstance(v, str):
            out.append((path, v))
        elif isinstance(v, dict):
            for k, vv in v.items():
                if k in SCAN_SKIP_PARAM_KEYS and not include_jscode:
                    continue
                walk(vv, (path + '.' + k) if path else k)
        elif isinstance(v, list):
            for i, vv in enumerate(v):
                walk(vv, path + '[' + str(i) + ']')

    walk(node.get('parameters') or {}, '')
    return out


def load_promote_shapes(here):
    """The REAL output shapes of the nodes S4 converts from stand-in to real, plus the harness-only nodes
    the promote drops. Captured from live executions (see the fixture's own _provenance)."""
    doc = json.loads((here / 'fixtures' / 'promote-real-shapes.json').read_text())
    real = {k: set(v['fields']) for k, v in doc['shapes'].items()}
    dropped = set(k for k in doc['_dropped_at_s4'] if not k.startswith('_'))
    return real, dropped


def check_c9(wf, label, schema, rec, promote=None):
    nodes = {n['name']: n for n in wf['nodes']}
    conns = wf.get('connections', {})

    upstreams = {}
    for src, spec in conns.items():
        for out in spec.get('main', []) or []:
            for e in out or []:
                upstreams.setdefault(e['node'], []).append(src)

    real_shapes, dropped = promote if promote else ({}, set())

    def fields_of(name, seen=None):
        seen = seen or set()
        if name in seen or name not in nodes:
            return OPAQUE
        seen = seen | {name}
        # PROMOTE-SHAPE PASS. This node becomes a REAL node at S4; resolve against what the real node
        # actually emits, not what the harness stand-in re-forwards. Reviewer R1: the stand-in for
        # ht-clear-flag re-forwards contact_id + ht_timeout_notice, so the build's C9 passed while the
        # promoted graph would delete `ht:active:` and send an empty notice to an empty recipient.
        if name in real_shapes:
            return set(real_shapes[name])
        n = nodes[name]
        t = n['type']
        if t == 'n8n-nodes-base.code':
            return set(schema[name]) if name in schema else OPAQUE
        if t == 'n8n-nodes-base.redis':
            op = n['parameters'].get('operation')
            if op == 'get':
                return {n['parameters'].get('propertyName')}
            if op in REDIS_PASSTHROUGH_OPS:
                return union_up(name, seen)
            return OPAQUE
        if t in PASSTHROUGH_TYPES:
            return union_up(name, seen)
        return OPAQUE

    def union_up(name, seen):
        ups = upstreams.get(name, [])
        if not ups:
            return OPAQUE
        acc = set()
        for u in ups:
            f = fields_of(u, seen)
            if f is OPAQUE:
                return OPAQUE
            acc |= f
        return acc

    region = set(f for f in FANOUT_NODES if f in nodes)
    frontier = list(region)
    while frontier:
        cur = frontier.pop()
        for out in (conns.get(cur, {}).get('main', []) or []):
            for e in (out or []):
                if e['node'] not in region:
                    region.add(e['node'])
                    frontier.append(e['node'])

    bad, unresolved, firsts = [], [], []
    scanned = 0
    for name, n in nodes.items():
        if name in dropped:
            continue        # harness-only node, absent from the promoted graph
        up = union_up(name, set())
        for path, val in param_strings(n):
            for m in RE_JSON.finditer(val):
                field = m.group(1) or m.group(2)
                scanned += 1
                if up is OPAQUE:
                    if (name, field) not in OPAQUE_REF_ALLOWLIST:
                        unresolved.append(name + '.' + path + ' reads $json.' + field +
                                          ' through an opaque upstream ' + str(upstreams.get(name)))
                elif field not in up:
                    bad.append(name + '.' + path + ' reads $json.' + field + ', but its upstream ' +
                               str(upstreams.get(name)) + ' emits ' +
                               str(sorted(x for x in up if x)))
            for m in RE_NODE.finditer(val):
                srcname = m.group(1)
                field = m.group(2) or m.group(3)
                scanned += 1
                f = fields_of(srcname)
                if f is OPAQUE:
                    if (name, field) not in OPAQUE_REF_ALLOWLIST:
                        unresolved.append(name + '.' + path + " reads $('" + srcname + "').json." +
                                          field + ', whose shape is opaque')
                elif field not in f:
                    bad.append(name + '.' + path + " reads $('" + srcname + "').json." + field +
                               ', but ' + srcname + ' emits ' + str(sorted(x for x in f if x)))
        for _, val in param_strings(n, include_jscode=True):
            for m in RE_NODE_FIRST.finditer(strip_js_comments(val)):
                if m.group(1) in region and name in region:
                    firsts.append(name + " uses $('" + m.group(1) +
                                  "').first() and both are in the per-item region")

    ok = not bad and not unresolved and not firsts
    tag = 'C9b promote-shape' if promote else 'C9'
    detail = (str(scanned) + ' field references resolved across ' +
              str(len(nodes) - len(dropped & set(nodes))) + ' nodes; per-item region = ' +
              str(sorted(region) or 'none'))
    if promote:
        present = sorted(k for k in real_shapes if k in nodes)
        detail += ('; resolved against the REAL output shape of ' + str(present) +
                   ' and skipping ' + str(sorted(dropped & set(nodes))) + ' as harness-only')
    if not ok:
        parts = []
        if bad:
            parts.append('UNRESOLVABLE FIELD: ' + ' | '.join(bad))
        if unresolved:
            parts.append('OPAQUE (needs an allowlist entry with a reason): ' + ' | '.join(unresolved))
        if firsts:
            parts.append('FIRST-IN-FANOUT: ' + ' | '.join(firsts))
        detail = '; '.join(parts)
    rec(ok, tag + ' [' + label + '] every parameter field reference resolves to its source', detail)
    return ok
