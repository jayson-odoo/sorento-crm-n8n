#!/usr/bin/env python3
"""assert-built.py — the containment + freshness gate for the three human-intervened-timeout builds.

WHAT THIS IS FOR. The offline harness executes Code-node BODIES. It is structurally blind to
everything that is a workflow PARAMETER: If conditions, redis key strings, executeWorkflow targets,
credentials, and the graph shape itself. That blind spot is LESSONS §71 exactly — a promote reviewed
from nodes/*.js shipped two load-bearing hunks unseen and broke production the same day. So this
script asserts the things the suite cannot see, by re-fetching the live workflow JSON.

It is also the answer to "is the offline suite still describing what is deployed?" (LESSONS §72's
resync rule / §64's sha rule): every Code node's bytes are compared to the tracked file they were
built from, so a UI save that silently rewrites a node body is caught at the START of a test pass
rather than inferred from behaviour that two changes both suppress.

CHECKS (each one prints the population it compared, so an empty check can never read as a pass —
LESSONS §61):
  C1  zero nodes of a credentialed-egress TYPE (UAC §0 S8: type, never the credentials block, which
      MCP redacts and REST-created nodes can acquire by auto-binding)
  C2  every redis key / keyPattern / list is in the `test:` namespace
  C3  every executeWorkflow target is on the harness allowlist
  C4  every Code node is byte-identical to its tracked source file
  C5  only redis nodes carry credentials, and only the redis credential
  C6  every connection points at a node that exists, and no node is reachable from itself
      (LESSONS D18: a self-loop is invisible to every content-level check and took the instance down)
  C7  S1 only: `If` and `compile-current-state` are byte-identical to LIVE respond-send-user
  C8  the workflows are INACTIVE, or their activation is reported loudly
  C9  every `$json.<field>` and `$('N')…json.<field>` reference in a node's PARAMETERS resolves to a
      field its source node actually emits, and no parameter or body uses `.first()` on a node inside
      the per-item fan-out region.  ← this is the check F-RECHECK slipped past
  C9b the same resolution against the shapes the S4 PROMOTE actually produces — each stand-in replaced
      by the real node's recorded live output, harness-only nodes dropped. C9 alone passes on a graph
      whose promoted form is broken, because a stand-in that re-forwards a field is correct on the build
      and absent on live (reviewer R1; LESSONS §65)

usage:
  N8N_API_BASE=... N8N_API_KEY=... python3 assert-built.py
  ... --self-test     corrupt each check's input in memory and prove the check goes RED
"""
import json, os, re, subprocess, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
NODES = HERE / 'nodes'
HEADER = (HERE / 'standin-header.txt').read_text()

BASE = os.environ.get('N8N_API_BASE', '')
KEY = os.environ.get('N8N_API_KEY', '')

TARGETS = {
    'itsbBtShEktWQFx6': 'respond-send-user HT-FORK',
    'S0V5TFhPNYJ7d9Ra': 'ht-sweeper BUILD',
    'tpEueReClq5OWUgv': 'ht-config-form BUILD',
}
LIVE_TEMPLATE = 'eG3AA-TWo17-E1-DlHLnH'      # respond-send-user — READ ONLY, never written

BANNED_TYPES = {
    '@respond-io/n8n-nodes-respond-io.respondio',
    '@respond-io/n8n-nodes-respond-io.respondioTrigger',
    'n8n-nodes-base.httpRequest',
    'n8n-nodes-base.postgres',
    '@n8n/n8n-nodes-langchain.memoryPostgresChat',
}
SUBWORKFLOW_ALLOWLIST = {
    'lJ4IZEGwoTh6aay4': 'zz-sub-sendmsg-STANDIN (3 nodes, no banned types, logs to test:egress:*)',
    'tWm5DYLxfypmVC1T': 'sub-respond-save-message-redis TEST (RPUSHes the unconsumed TEST sink)',
}
# node name -> the tracked file it was built from. A stand-in additionally carries standin-header.txt.
BODY_MAP = {
    'harness-envelope': ('harness-envelope.js', False),
    'Respond.io Trigger': ('standin-respondio-trigger.js', True),
    'Update a Contact': ('standin-update-a-contact.js', True),
    'Execute a SQL query': ('standin-execute-a-sql-query.js', True),
    'Select rows from a table': ('standin-select-rows.js', True),
    'conversation-sla-tracking-update': ('standin-sla-update.js', True),
    'conversation-sla-event-tracking-create': ('standin-sla-create.js', True),
    'save-session-vars': ('standin-save-session-vars.js', True),
    'ht-gate': ('ht-gate.js', False),
    'ht-arm': ('ht-arm.js', False),
    'ht-sweep-driver': ('ht-sweep-driver.js', False),
    'ht-sweep-armed': ('ht-sweep-armed.js', False),
    'ht-sweep-census': ('ht-sweep-census.js', False),
    'ht-sweep-fanout': ('ht-sweep-fanout.js', False),
    'ht-findcontact': ('standin-ht-findcontact.js', True),
    'ht-carry-contact': ('ht-carry-contact.js', False),
    'ht-carry-clear': ('ht-carry-clear.js', False),
    'ht-classify': ('ht-classify.js', False),
    'ht-clear-flag': ('standin-ht-clear-flag.js', True),
    'ht-config-apply': ('ht-config-apply.js', False),
    'ht-config-echo': ('ht-config-echo.js', False),
}
# Code nodes deliberately kept BYTE-IDENTICAL TO LIVE, so they have no tracked offline source. They
# are NOT silently skipped — C4 names them and points at C7, which param-hashes them against the live
# workflow. An unexplained absence from BODY_MAP still fails C4.
VERBATIM_FROM_LIVE = {'compile-current-state'}

# C9 lives in its own module (it is the largest check and needs no assert-built state but `rec`).
from c9 import emitted_schema, check_c9, load_promote_shapes

fails = []
pops = []
SCHEMA = {}
PROMOTE = ({}, set())


def rec(ok, label, detail=''):
    if ok:
        print(f'ok   {label}{(" — " + detail) if detail else ""}')
    else:
        fails.append(label)
        print(f'FAIL {label}{(" — " + detail) if detail else ""}')


def get(path):
    out = subprocess.run(
        ['curl', '-s', '-H', 'X-N8N-API-KEY: ' + KEY, BASE + path],
        capture_output=True, text=True).stdout
    return json.loads(out)


def expected_body(name):
    fn, is_standin = BODY_MAP[name]
    txt = (NODES / fn).read_text()
    return (HEADER + txt) if is_standin else txt


def check(wf, wid, label):
    nodes = wf['nodes']
    conns = wf.get('connections', {})
    print(f'\n── {label}  ({wid}, versionId {wf.get("versionId")}, active={wf.get("active")}) '
          f'{len(nodes)} nodes ──')

    # C1 ────────────────────────────────────────────────────────────────────────────────────────
    bad = [n['name'] + ':' + n['type'] for n in nodes if n['type'] in BANNED_TYPES]
    rec(not bad, f'C1 [{label}] no credentialed-egress node TYPE',
        f'{len(nodes)} nodes scanned against {len(BANNED_TYPES)} banned types' if not bad
        else 'PRESENT: ' + ', '.join(bad))

    # C2 ────────────────────────────────────────────────────────────────────────────────────────
    redis_nodes = [n for n in nodes if n['type'] == 'n8n-nodes-base.redis']
    keyfields = []
    bad = []
    for n in redis_nodes:
        for k in ('key', 'keyPattern', 'list'):
            v = n['parameters'].get(k)
            if v is None:
                continue
            keyfields.append((n['name'], k, v))
            core = v[1:] if v.startswith('=') else v
            if not core.startswith('test:'):
                bad.append(f'{n["name"]}.{k}={v!r}')
    rec(not bad, f'C2 [{label}] every redis key is in the test: namespace',
        f'{len(keyfields)} key expressions across {len(redis_nodes)} redis nodes' if not bad
        else 'CANONICAL NAMESPACE TOUCHED: ' + ', '.join(bad))
    pops.append(len(keyfields))

    # C3 ────────────────────────────────────────────────────────────────────────────────────────
    calls = [(n['name'], (n['parameters'].get('workflowId') or {}).get('value'))
             for n in nodes if n['type'] == 'n8n-nodes-base.executeWorkflow']
    bad = [f'{nm} -> {wid2}' for nm, wid2 in calls if wid2 not in SUBWORKFLOW_ALLOWLIST]
    rec(not bad, f'C3 [{label}] every sub-workflow target is on the harness allowlist',
        '; '.join(f'{nm} -> {SUBWORKFLOW_ALLOWLIST[w]}' for nm, w in calls) if not bad
        else 'OFF-ALLOWLIST: ' + ', '.join(bad))

    # C4 ────────────────────────────────────────────────────────────────────────────────────────
    code_nodes = [n for n in nodes if n['type'] == 'n8n-nodes-base.code']
    verbatim = [n['name'] for n in code_nodes if n['name'] in VERBATIM_FROM_LIVE]
    unmapped = [n['name'] for n in code_nodes
                if n['name'] not in BODY_MAP and n['name'] not in VERBATIM_FROM_LIVE]
    drifted = []
    compared = 0
    for n in code_nodes:
        if n['name'] not in BODY_MAP:
            continue
        compared += 1
        if n['parameters'].get('jsCode') != expected_body(n['name']):
            drifted.append(n['name'])
    detail = (f'{compared} bodies byte-compared'
              + (f'; {verbatim} deliberately verbatim-from-live, covered by C7' if verbatim else ''))
    rec(not drifted and not unmapped, f'C4 [{label}] every Code body matches its tracked source',
        detail if not (drifted or unmapped)
        else f'DRIFTED: {drifted or "-"}; UNMAPPED (no tracked source, not declared verbatim): {unmapped or "-"}')

    # C5 ────────────────────────────────────────────────────────────────────────────────────────
    credded = [(n['name'], n['type'], sorted((n.get('credentials') or {}).keys()))
               for n in nodes if n.get('credentials')]
    bad = [f'{nm}({ty}):{ks}' for nm, ty, ks in credded
           if ty != 'n8n-nodes-base.redis' or ks != ['redis']]
    rec(not bad, f'C5 [{label}] only redis nodes are credentialed',
        f'{len(credded)} credentialed nodes, all redis' if not bad else 'UNEXPECTED: ' + ', '.join(bad))

    # C6 ────────────────────────────────────────────────────────────────────────────────────────
    names = {n['name'] for n in nodes}
    dangling = []
    edges = {}
    for src, spec in conns.items():
        if src not in names:
            dangling.append(f'source {src!r} does not exist')
        for out in spec.get('main', []) or []:
            for e in out or []:
                if e['node'] not in names:
                    dangling.append(f'{src} -> {e["node"]!r} does not exist')
                edges.setdefault(src, set()).add(e['node'])
    cycles = []
    for start in names:
        seen, stack = set(), [start]
        while stack:
            cur = stack.pop()
            for nxt in edges.get(cur, ()):
                if nxt == start:
                    cycles.append(start)
                    stack = []
                    break
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    rec(not dangling and not cycles, f'C6 [{label}] graph is well-formed and acyclic',
        f'{sum(len(v) for v in edges.values())} edges over {len(names)} nodes'
        if not (dangling or cycles) else f'dangling={dangling}; self-reachable={sorted(set(cycles))}')

    # C8 ────────────────────────────────────────────────────────────────────────────────────────
    rec(True if wf.get('active') is False else False,
        f'C8 [{label}] workflow is INACTIVE',
        'inactive' if wf.get('active') is False else
        'ACTIVE — a harness workflow left active keeps firing; deactivate after the run')

    # C9 — the check F-RECHECK slipped past. See c9.py. Skipped for the generic self-test mutants,
    # which corrupt node types/credentials in ways that would make C9 noise rather than signal; C9 has
    # its own mutants below.
    if label != 'SELFTEST':
        check_c9(wf, label, SCHEMA, rec)
        # C9b — the SAME check against the shapes the promote will actually produce (reviewer R1).
        # C9 alone passed, and would have kept passing, while the promoted graph deleted `ht:active:`
        # and sent an empty notice to an empty recipient: it resolves against the harness stand-in's
        # fields, and a stand-in that re-forwards a field is correct on the build and absent on live.
        check_c9(wf, label, SCHEMA, rec, promote=PROMOTE)


def check_s1_verbatim(wf, live):
    lb = {n['name']: n for n in live['nodes']}
    fb = {n['name']: n for n in wf['nodes']}
    bad = []
    for nm in ('If', 'compile-current-state'):
        a = json.dumps(lb[nm]['parameters'], sort_keys=True)
        b = json.dumps(fb[nm]['parameters'], sort_keys=True)
        if a != b:
            bad.append(nm)
    rec(not bad, 'C7 [S1] If + compile-current-state are byte-identical to LIVE respond-send-user',
        '2 nodes param-hash-compared against live' if not bad else 'DRIFTED: ' + ', '.join(bad))


def self_test():
    """Prove each check can go RED. LESSONS §61: an assertion never shown to fail is not an
    instrument. Runs entirely on in-memory corruptions of a real fetched workflow."""
    print('\n════ SELF-TEST — every check below MUST report FAIL ════')
    global fails
    base = get('/workflows/itsbBtShEktWQFx6')
    sweeper = get('/workflows/S0V5TFhPNYJ7d9Ra')

    # ── C9's three cases get their own mutants against the SWEEPER, because C9 is the check that was
    # missing when F-RECHECK shipped and a check proven only on a synthetic corruption is weaker than
    # one proven on the real defect. C9-real reconstructs the EXACT pre-fix graph.
    def c9_wrong_field(w):
        next(n for n in w['nodes'] if n['name'] == 'ht-recheck-stamp')['parameters']['key'] = \
            '=test:ht:active:{{ $json.no_such_field }}'

    def c9_real_defect(w):
        # the pre-fix graph, faithfully: bypass ht-carry-contact so ht-recheck-stamp reads
        # $json.contact_id directly off ht-findcontact's respond.io contact (which has only `id`).
        w['connections']['ht-findcontact'] = {'main': [[{'node': 'ht-recheck-stamp',
                                                        'type': 'main', 'index': 0}]]}
        w['nodes'] = [n for n in w['nodes'] if n['name'] != 'ht-carry-contact']
        w['connections'].pop('ht-carry-contact', None)

    def c9_first_in_fanout(w):
        next(n for n in w['nodes'] if n['name'] == 'ht-timeout-notice') \
            ['parameters']['workflowInputs']['value']['contact_identifer'] = \
            "={{ $('ht-clear-flag').first().json.contact_id }}"

    c9_red = []
    def c9b_real_defect(w):
        # The reviewer-R1 graph, faithfully: remove ht-carry-clear and wire ht-egress-log straight to
        # ht-forget, so ht-forget/ht-timeout-notice read $json off the node that becomes the real
        # respondio UPDATE_CONTACT. This is the SHIPPED rev2 graph — C9 (build shapes) passes on it,
        # C9b (promote shapes) must not.
        w['connections']['ht-egress-log'] = {'main': [[{'node': 'ht-forget',
                                                       'type': 'main', 'index': 0}]]}
        w['nodes'] = [n for n in w['nodes'] if n['name'] != 'ht-carry-clear']
        w['connections'].pop('ht-carry-clear', None)

    for cid, mut, promote in [('C9-wrong-field', c9_wrong_field, None),
                              ('C9-real-defect', c9_real_defect, None),
                              ('C9-first-in-fanout', c9_first_in_fanout, None),
                              ('C9b-real-defect(R1)', c9b_real_defect, PROMOTE)]:
        w = json.loads(json.dumps(sweeper))
        mut(w)
        fails = []
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check_c9(w, 'SELFTEST', SCHEMA, rec, promote=promote)
        if fails:
            line = [l for l in buf.getvalue().splitlines() if l.startswith('FAIL')]
            print(f'ok   {cid} makes C9 go RED')
            print('       ' + (line[0][:150] if line else ''))
            c9_red.append(cid)
        else:
            print(f'FAIL {cid} did NOT make C9 go red — C9 is decoration for this case')

    muts = {
        'C1': lambda w: w['nodes'][0].update({'type': 'n8n-nodes-base.httpRequest'}),
        'C2': lambda w: next(n for n in w['nodes'] if n['type'] == 'n8n-nodes-base.redis')
                        ['parameters'].update({'key': 'ht:enabled'}),
        'C3': lambda w: next(n for n in w['nodes'] if n['type'] == 'n8n-nodes-base.executeWorkflow')
                        ['parameters']['workflowId'].update({'value': 'aoydkG1dbItXR5jXFEQsP'}),
        'C4': lambda w: next(n for n in w['nodes'] if n['name'] == 'ht-gate')
                        ['parameters'].update({'jsCode': '// tampered\nreturn [];'}),
        'C5': lambda w: next(n for n in w['nodes'] if n['name'] == 'ht-gate')
                        .update({'credentials': {'respondIoApi': {'id': 'x', 'name': 'sorento-api'}}}),
        'C6': lambda w: w['connections'].update({'ht-gate': {'main': [[{'node': 'ht-cfg-enabled',
                                                                       'type': 'main', 'index': 0}]]}}),
        'C8': lambda w: w.update({'active': True}),
    }
    red = []
    for cid, mut in muts.items():
        w = json.loads(json.dumps(base))
        mut(w)
        fails = []
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check(w, 'SELFTEST', 'SELFTEST')
        got = [f for f in fails if f.startswith(cid + ' ')]
        if got:
            print(f'ok   {cid} goes RED when its input is corrupted')
            red.append(cid)
        else:
            print(f'FAIL {cid} stayed GREEN under a deliberate corruption — the check is decoration')
            print(buf.getvalue())
    # DISCRIMINATION. A second check that fires whenever the first one does is not a second instrument.
    # C9b earns its keep only if plain C9 PASSES the R1 graph — which is the whole reason R1 shipped
    # invisibly — while C9b fails it. Asserted directly on the same reconstructed graph, so the claim
    # "C9 could not have caught this" is measured rather than argued (LESSONS §64 rule iv).
    w = json.loads(json.dumps(sweeper))
    c9b_real_defect(w)
    fails = []
    import io as _io, contextlib as _cl
    _b = _io.StringIO()
    with _cl.redirect_stdout(_b):
        check_c9(w, 'SELFTEST', SCHEMA, rec)          # build shapes, NO promote
    c9_blind = not fails
    print(('ok   ' if c9_blind else 'FAIL ') +
          'C9b earns its keep: plain C9 PASSES the R1 graph that C9b fails' +
          ('' if c9_blind else ' — C9 caught it too, so C9b adds nothing and R1 had another cause'))

    ok = len(red) == len(muts) and len(c9_red) == 4 and c9_blind
    print(f'\nself-test: {len(red)}/{len(muts)} checks + {len(c9_red)}/4 C9/C9b cases proven able to fail'
          f" + C9b shown to discriminate: {'yes' if c9_blind else 'NO'}")
    if len(c9_red) >= 3:
        print('  Two load-bearing cases, both reconstructing a graph that really shipped rather than a\n'
              '  synthetic corruption (LESSONS §64 rule iii):\n'
              '    C9-real-defect      = the pre-F-RECHECK graph (ht-carry-contact removed).\n'
              '    C9b-real-defect(R1) = the rev2 graph (ht-carry-clear removed) — which plain C9 passes,\n'
              '                          because the stand-in re-forwards the fields the real node drops.')
    return 0 if ok else 1


if __name__ == '__main__':
    if not BASE or not KEY:
        print('FATAL: set N8N_API_BASE and N8N_API_KEY (source the repo .env)')
        sys.exit(2)
    SCHEMA = emitted_schema(HERE)
    PROMOTE = load_promote_shapes(HERE)
    if '--self-test' in sys.argv:
        sys.exit(self_test())
    live = get('/workflows/' + LIVE_TEMPLATE)
    for wid, label in TARGETS.items():
        wf = get('/workflows/' + wid)
        if 'nodes' not in wf:
            rec(False, f'fetch {label}', json.dumps(wf)[:200])
            continue
        check(wf, wid, label)
        if wid == 'itsbBtShEktWQFx6':
            check_s1_verbatim(wf, live)
    print(f'\ncompared population: {len(TARGETS)} workflows, {sum(pops)} redis key expressions, '
          f'{len(BODY_MAP)} tracked node bodies')
    if fails:
        print(f'\n{len(fails)} CHECK(S) FAILED: ' + '; '.join(fails))
        sys.exit(1)
    print('\nALL CHECKS PASS')
