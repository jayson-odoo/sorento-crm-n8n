#!/usr/bin/env python3
"""Build the three human-intervened-timeout workflows on n8n via REST POST /workflows.

Committed so the build is reproducible and reviewable rather than a one-off in a scratch dir. Node
bodies are read from ./nodes/*.js — the same files the offline harness executes and the same files
assert-built.py C4 byte-compares against what is deployed, so there is one source for every body.

Re-running this CREATES NEW WORKFLOWS; it does not update the existing ones. To verify determinism
without touching the instance, run with --dry-run and diff the emitted payload-*.json.

NEW workflows only. Nothing here touches an existing workflow: no PUT, no PATCH, no publish of
anything that already exists. The live `respond-send-user` is read with a GET and used as a template.
"""
import json, os, sys, uuid, urllib.request, pathlib

BASE = os.environ['N8N_API_BASE']
KEY = os.environ['N8N_API_KEY']
SC = pathlib.Path(os.environ['SC'])
OFFLINE = pathlib.Path(os.environ['OFFLINE'])

REDIS_CRED = {'redis': {'id': 'H5w6o7tptzTPMVdy', 'name': 'sorento-redis'}}
SENDMSG_STANDIN = 'lJ4IZEGwoTh6aay4'      # zz-sub-sendmsg-STANDIN: 3 nodes, no banned types,
                                          # records would_send to test:egress:{test_run_id}
SAVEMSG_TEST_FORK = 'tWm5DYLxfypmVC1T'    # sub-respond-save-message-redis TEST -> unconsumed sink
PREFIX = 'test:ht:'                        # LITERAL, never expression-derived (LESSONS 53)

body = lambda f: (OFFLINE / 'nodes' / f).read_text()


def api(method, path, payload=None):
    # curl via subprocess, not urllib: the host sits behind Cloudflare, which answers urllib's
    # default User-Agent with HTTP 403 "error code: 1010". curl's UA passes. (Measured — the GETs in
    # this session worked via curl and the identical urllib POST 403'd three times.)
    import subprocess, tempfile
    cmd = ['curl', '-s', '-w', '\n%{http_code}', '-X', method,
           '-H', 'X-N8N-API-KEY: ' + KEY, '-H', 'Content-Type: application/json',
           BASE + path]
    tmp = None
    if payload is not None:
        tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        json.dump(payload, tmp)
        tmp.close()
        cmd += ['--data-binary', '@' + tmp.name]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    body, _, status = out.rpartition('\n')
    try:
        return int(status), json.loads(body)
    except Exception:
        return int(status) if status.isdigit() else 0, body


def nid():
    return str(uuid.uuid4())


def code(name, js, pos, mode='runOnceForAllItems'):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': pos,
            'parameters': {'mode': mode, 'language': 'javaScript', 'jsCode': js}}


def redis_get(name, key, prop, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.redis', 'typeVersion': 1,
            'position': pos, 'credentials': dict(REDIS_CRED),
            'parameters': {'operation': 'get', 'key': key, 'propertyName': prop,
                           'keyType': 'string', 'options': {}}}


def redis_set(name, key, value, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.redis', 'typeVersion': 1,
            'position': pos, 'credentials': dict(REDIS_CRED),
            'parameters': {'operation': 'set', 'key': key, 'value': value, 'keyType': 'string'}}


def redis_del(name, key, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.redis', 'typeVersion': 1,
            'position': pos, 'credentials': dict(REDIS_CRED),
            'parameters': {'operation': 'delete', 'key': key}}


def redis_keys(name, pattern, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.redis', 'typeVersion': 1,
            'position': pos, 'credentials': dict(REDIS_CRED),
            'parameters': {'operation': 'keys', 'keyPattern': pattern, 'getValues': True}}


def redis_push(name, lst, data, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.redis', 'typeVersion': 1,
            'position': pos, 'credentials': dict(REDIS_CRED),
            'parameters': {'operation': 'push', 'list': lst, 'messageData': data}}


def if_bool(name, expr, pos):
    """An If node whose condition is nothing but a boolean a Code node already computed (LESSONS 71:
    an If condition is a parameter, invisible to code review and to every offline suite here)."""
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.if', 'typeVersion': 2.3,
            'position': pos,
            'parameters': {'conditions': {
                'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict',
                            'version': 3},
                # DETERMINISTIC condition id, derived from the node name. A fresh uuid4 here makes the
                # builder non-idempotent: a rebuild that changes nothing reports every If node as
                # CHANGED, which buries the one node that actually moved (LESSONS 20, one level down —
                # the same reasoning that keeps node ids stable by name).
                'conditions': [{'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'ht-if/' + name)),
                                'leftValue': expr, 'rightValue': '',
                                'operator': {'type': 'boolean', 'operation': 'true',
                                             'singleValue': True}}],
                'combinator': 'and'}, 'options': {}}}


def noop(name, pos):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.noOp', 'typeVersion': 1,
            'position': pos, 'parameters': {}}


SENDMSG_SCHEMA = [{'id': k, 'displayName': k, 'required': False, 'defaultMatch': False,
                   'display': True, 'canBeUsedToMatch': True} for k in
                  ['contact_identifer', 'message', 'quick_reply', 'input_message', 'test_run_id',
                   'started_at', 'contact', 'result_set', 'is_test', 'turn_id']]


def sendmsg_call(name, wf_id, contact_expr, message_expr, trid_expr, pos, mode='once'):
    return {'id': nid(), 'name': name, 'type': 'n8n-nodes-base.executeWorkflow',
            'typeVersion': 1.3, 'position': pos,
            'parameters': {
                'workflowId': {'__rl': True, 'value': wf_id, 'mode': 'list',
                               'cachedResultUrl': '/workflow/' + wf_id},
                'workflowInputs': {'mappingMode': 'defineBelow',
                                   'value': {'contact_identifer': contact_expr,
                                             'message': message_expr,
                                             'is_test': '={{ true }}',
                                             'test_run_id': trid_expr},
                                   'matchingColumns': [], 'schema': SENDMSG_SCHEMA,
                                   'attemptToConvertTypes': False, 'convertFieldsToString': True},
                'mode': mode, 'options': {}}}


# Read from a FILE, not inlined here. assert-built.py C4 reconstructs each deployed stand-in body as
# header + tracked source and byte-compares it; if the header lived in two places they would drift and
# C4 would start failing for a reason that has nothing to do with the code under test.
STANDIN_HEADER = (OFFLINE / 'standin-header.txt').read_text()


def standin(name, js, pos):
    return code(name, STANDIN_HEADER + js, pos)


# ════════════════════════════════════════════════════════════════════════════════════════════════
# S1 — respond-send-user HT-FORK
# ════════════════════════════════════════════════════════════════════════════════════════════════
def build_s1():
    live = json.loads((SC / 'respond-send-user.json').read_text())
    by_name = {n['name']: n for n in live['nodes']}

    keep_verbatim = ['If', 'compile-current-state']
    nodes = []
    for n in keep_verbatim:
        src = json.loads(json.dumps(by_name[n]))
        src.pop('credentials', None)
        src['id'] = nid()
        nodes.append(src)

    # ── driver: two entry points, both feeding one envelope builder ──────────────────────────────
    nodes.append({'id': nid(), 'name': 'ht-driver-webhook', 'type': 'n8n-nodes-base.webhook',
                  'typeVersion': 2.1, 'position': [-1360, 240],
                  'webhookId': nid(),
                  'parameters': {'httpMethod': 'POST', 'path': str(uuid.uuid4()), 'options': {}}})
    nodes.append({'id': nid(), 'name': 'When Executed by Another Workflow',
                  'type': 'n8n-nodes-base.executeWorkflowTrigger', 'typeVersion': 1.2,
                  'position': [-1360, 460],
                  'parameters': {'inputSource': 'passthrough'}})
    nodes.append(code('harness-envelope', body('harness-envelope.js'), [-1120, 350]))
    nodes.append(standin('Respond.io Trigger', body('standin-respondio-trigger.js'), [-880, 350]))

    # ── the live lane, with every egress surface replaced by a name-preserving stand-in ──────────
    nodes.append(standin('Update a Contact', body('standin-update-a-contact.js'), [-400, 520]))
    nodes.append(standin('Execute a SQL query', body('standin-execute-a-sql-query.js'), [-400, 760]))
    nodes.append(standin('Select rows from a table', body('standin-select-rows.js'), [-160, 760]))
    nodes.append(standin('conversation-sla-tracking-update', body('standin-sla-update.js'), [80, 760]))
    nodes.append(standin('conversation-sla-event-tracking-create', body('standin-sla-create.js'), [320, 760]))
    nodes.append(standin('save-session-vars', body('standin-save-session-vars.js'), [-160, 1000]))
    # the message logger keeps its real node TYPE but points at the harness fork, whose only egress
    # is an RPUSH to `sorento-respond-message-TEST` that no consumer reads (UAC 0 S3 amendment).
    nodes.append({'id': nid(), 'name': "Call 'sub-respond-save-message-redis'",
                  'type': 'n8n-nodes-base.executeWorkflow', 'typeVersion': 1.3,
                  'position': [-400, 60],
                  'parameters': {
                      'workflowId': {'__rl': True, 'value': SAVEMSG_TEST_FORK, 'mode': 'list',
                                     'cachedResultUrl': '/workflow/' + SAVEMSG_TEST_FORK},
                      'workflowInputs': json.loads(json.dumps(
                          by_name["Call 'sub-respond-save-message-redis'"]['parameters']['workflowInputs'])),
                      'options': {}}})

    # ── the S1 feature lane ─────────────────────────────────────────────────────────────────────
    nodes.append(redis_get('ht-cfg-enabled', PREFIX + 'enabled', 'ht_enabled', [-160, 520]))
    nodes.append(redis_get('ht-cfg-timeout', PREFIX + 'timeout-sec', 'ht_timeout_sec', [80, 520]))
    nodes.append(redis_get('ht-cfg-pilot', PREFIX + 'pilot-contacts', 'ht_pilot', [320, 520]))
    nodes.append(code('ht-gate', body('ht-gate.js'), [560, 520]))
    nodes.append(if_bool('ht-act?', '={{ $json.ht_should_act }}', [800, 520]))
    nodes.append(noop('ht-inert', [1040, 680]))
    nodes.append(redis_get('ht-prev-stamp',
                           '=' + PREFIX + 'active:{{ $json.contact_id }}', 'ht_prev_ms',
                           [1040, 400]))
    nodes.append(code('ht-arm', body('ht-arm.js'), [1280, 400]))
    nodes.append(redis_set('ht-stamp',
                           '=' + PREFIX + "active:{{ $('ht-arm').first().json.contact_id }}",
                           "={{ $('ht-arm').first().json.ht_now_ms }}", [1520, 400]))
    nodes.append(if_bool('ht-first?', '={{ $json.ht_is_first }}', [1760, 400]))
    nodes.append(sendmsg_call('ht-intervene-notice', SENDMSG_STANDIN,
                              "={{ $('ht-arm').first().json.contact_id }}",
                              "={{ $('ht-arm').first().json.ht_notice }}",
                              "={{ $('ht-arm').first().json.test_run_id }}", [2000, 300]))
    nodes.append(noop('ht-refresh-only', [2000, 500]))

    conns = {
        'ht-driver-webhook': {'main': [[{'node': 'harness-envelope', 'type': 'main', 'index': 0}]]},
        'When Executed by Another Workflow': {'main': [[{'node': 'harness-envelope', 'type': 'main', 'index': 0}]]},
        'harness-envelope': {'main': [[{'node': 'Respond.io Trigger', 'type': 'main', 'index': 0}]]},
        # the three live fan-out edges, unchanged in shape
        'Respond.io Trigger': {'main': [[
            {'node': 'If', 'type': 'main', 'index': 0},
            {'node': 'compile-current-state', 'type': 'main', 'index': 0},
            {'node': "Call 'sub-respond-save-message-redis'", 'type': 'main', 'index': 0}]]},
        'If': {'main': [[{'node': 'Execute a SQL query', 'type': 'main', 'index': 0},
                         {'node': 'Update a Contact', 'type': 'main', 'index': 0}], []]},
        'Execute a SQL query': {'main': [[{'node': 'Select rows from a table', 'type': 'main', 'index': 0}]]},
        'Select rows from a table': {'main': [[{'node': 'conversation-sla-tracking-update', 'type': 'main', 'index': 0}]]},
        'conversation-sla-tracking-update': {'main': [[{'node': 'conversation-sla-event-tracking-create', 'type': 'main', 'index': 0}]]},
        'compile-current-state': {'main': [[{'node': 'save-session-vars', 'type': 'main', 'index': 0}]]},
        # NEW: the HT lane, additive and downstream of the untouched flag lane
        'Update a Contact': {'main': [[{'node': 'ht-cfg-enabled', 'type': 'main', 'index': 0}]]},
        'ht-cfg-enabled': {'main': [[{'node': 'ht-cfg-timeout', 'type': 'main', 'index': 0}]]},
        'ht-cfg-timeout': {'main': [[{'node': 'ht-cfg-pilot', 'type': 'main', 'index': 0}]]},
        'ht-cfg-pilot': {'main': [[{'node': 'ht-gate', 'type': 'main', 'index': 0}]]},
        'ht-gate': {'main': [[{'node': 'ht-act?', 'type': 'main', 'index': 0}]]},
        'ht-act?': {'main': [[{'node': 'ht-prev-stamp', 'type': 'main', 'index': 0}],
                             [{'node': 'ht-inert', 'type': 'main', 'index': 0}]]},
        'ht-prev-stamp': {'main': [[{'node': 'ht-arm', 'type': 'main', 'index': 0}]]},
        'ht-arm': {'main': [[{'node': 'ht-stamp', 'type': 'main', 'index': 0}]]},
        'ht-stamp': {'main': [[{'node': 'ht-first?', 'type': 'main', 'index': 0}]]},
        'ht-first?': {'main': [[{'node': 'ht-intervene-notice', 'type': 'main', 'index': 0}],
                               [{'node': 'ht-refresh-only', 'type': 'main', 'index': 0}]]},
    }
    return {'name': 'respond-send-user HT-FORK',
            'nodes': nodes, 'connections': conns,
            'settings': {'executionOrder': 'v1', 'availableInMCP': True}}


# ════════════════════════════════════════════════════════════════════════════════════════════════
# S2 — ht-sweeper (build copy: stand-ins for both egress surfaces)
# ════════════════════════════════════════════════════════════════════════════════════════════════
def build_s2():
    nodes = [
        {'id': nid(), 'name': 'Schedule Trigger', 'type': 'n8n-nodes-base.scheduleTrigger',
         'typeVersion': 1.3, 'position': [-1120, 300],
         'parameters': {'rule': {'interval': [{'field': 'seconds', 'secondsInterval': 30}]}}},
        # a second, manual-ish entry so a UAC case can fire one tick without activating a 30s
        # schedule against the shared redis.
        {'id': nid(), 'name': 'ht-driver-webhook', 'type': 'n8n-nodes-base.webhook',
         'typeVersion': 2.1, 'position': [-1120, 100], 'webhookId': nid(),
         'parameters': {'httpMethod': 'POST', 'path': str(uuid.uuid4()), 'options': {}}},
        code('ht-sweep-driver', body('ht-sweep-driver.js'), [-880, 200]),
        redis_get('ht-sweep-enabled', PREFIX + 'enabled', 'ht_enabled', [-640, 200]),
        # finding #6: gate the KEYS scan on the kill-switch. Dark-shipped, the sweeper was paying an
        # O(keyspace) KEYS + N GETs on the SHARED PROD redis every 30 s to build a census it discarded.
        code('ht-sweep-armed', body('ht-sweep-armed.js'), [-520, 200]),
        if_bool('ht-armed?', '={{ $json.ht_armed }}', [-460, 200]),
        noop('ht-sweep-idle', [-460, 380]),
        redis_get('ht-sweep-timeout', PREFIX + 'timeout-sec', 'ht_timeout_sec', [-400, 200]),
        redis_get('ht-sweep-pilot', PREFIX + 'pilot-contacts', 'ht_pilot', [-160, 200]),
        redis_keys('ht-sweep-keys', PREFIX + 'active:*', [80, 200]),
        code('ht-sweep-census', body('ht-sweep-census.js'), [320, 200]),
        code('ht-sweep-fanout', body('ht-sweep-fanout.js'), [560, 200]),
        standin('ht-findcontact', body('standin-ht-findcontact.js'), [800, 200]),
        # F-RECHECK (tester 2026-08-12): ht-recheck-stamp's key reads $json.contact_id, but a
        # respond.io contact carries `id`, never `contact_id` — so the key resolved to
        # `test:ht:active:` on every tick and the clear/notify/forget path was unreachable. This node
        # re-attaches the CANDIDATE's contact_id (and owns the mis-attribution refusal, now upstream of
        # the first key derivation). Required on live too: the real findcontact sub has the same shape.
        code('ht-carry-contact', body('ht-carry-contact.js'), [920, 200]),
        redis_get('ht-recheck-stamp', '=' + PREFIX + 'active:{{ $json.contact_id }}',
                  'ht_recheck_ms', [1040, 200]),
        code('ht-classify', body('ht-classify.js'), [1280, 200]),
        if_bool('ht-skip?', '={{ $json.is_skip }}', [1520, 200]),
        noop('ht-skip', [1760, 40]),
        if_bool('ht-flag-still-true?', "={{ $json.action === 'clear-and-notify' }}", [1760, 320]),
        standin('ht-clear-flag', body('standin-ht-clear-flag.js'), [2000, 240]),
        # R1 (reviewer): ht-forget and ht-timeout-notice read $json.contact_id / $json.ht_timeout_notice.
        # On the build those come from the ht-clear-flag STAND-IN; at S4 that node becomes the real
        # respondio UPDATE_CONTACT whose measured output is `{"contactId": …}` only, so the stamp delete
        # would miss AND the notice would fire with an empty recipient and an empty body. ht-carry-clear
        # bridges it, matching on the id the egress node itself reports and re-checking authorisation.
        # REQUIRED on live — see fixtures/promote-real-shapes.json.
        code('ht-carry-clear', body('ht-carry-clear.js'), [2360, 240]),
        redis_push('ht-egress-log',
                   "=test:egress:{{ $('ht-sweep-driver').first().json.test_run_id }}",
                   '={{ JSON.stringify($json._standin) }}', [2240, 240]),
        # ORDER: clear -> log -> FORGET -> notify. The plan wrote clear -> notify -> forget; forgetting
        # first is the fail-safe direction (a failed send cannot leave a stamp behind for the next tick
        # to re-notice) and it keeps every node before the send on a passthrough redis op, so per-item
        # attribution needs no paired-item lineage through a sub-workflow call. Recorded as Deviation D3.
        redis_del('ht-forget', '=' + PREFIX + 'active:{{ $json.contact_id }}', [2480, 240]),
        sendmsg_call('ht-timeout-notice', SENDMSG_STANDIN,
                     '={{ $json.contact_id }}',
                     '={{ $json.ht_timeout_notice }}',
                     "={{ $('ht-sweep-driver').first().json.test_run_id }}", [2720, 240], mode='each'),
        redis_del('ht-forget-silent', '=' + PREFIX + 'active:{{ $json.contact_id }}', [2000, 460]),
    ]
    conns = {
        'Schedule Trigger': {'main': [[{'node': 'ht-sweep-driver', 'type': 'main', 'index': 0}]]},
        'ht-driver-webhook': {'main': [[{'node': 'ht-sweep-driver', 'type': 'main', 'index': 0}]]},
        'ht-sweep-driver': {'main': [[{'node': 'ht-sweep-enabled', 'type': 'main', 'index': 0}]]},
        'ht-sweep-enabled': {'main': [[{'node': 'ht-sweep-armed', 'type': 'main', 'index': 0}]]},
        'ht-sweep-armed': {'main': [[{'node': 'ht-armed?', 'type': 'main', 'index': 0}]]},
        'ht-armed?': {'main': [[{'node': 'ht-sweep-timeout', 'type': 'main', 'index': 0}],
                               [{'node': 'ht-sweep-idle', 'type': 'main', 'index': 0}]]},
        'ht-sweep-timeout': {'main': [[{'node': 'ht-sweep-pilot', 'type': 'main', 'index': 0}]]},
        'ht-sweep-pilot': {'main': [[{'node': 'ht-sweep-keys', 'type': 'main', 'index': 0}]]},
        'ht-sweep-keys': {'main': [[{'node': 'ht-sweep-census', 'type': 'main', 'index': 0}]]},
        'ht-sweep-census': {'main': [[{'node': 'ht-sweep-fanout', 'type': 'main', 'index': 0}]]},
        'ht-sweep-fanout': {'main': [[{'node': 'ht-findcontact', 'type': 'main', 'index': 0}]]},
        'ht-findcontact': {'main': [[{'node': 'ht-carry-contact', 'type': 'main', 'index': 0}]]},
        'ht-carry-contact': {'main': [[{'node': 'ht-recheck-stamp', 'type': 'main', 'index': 0}]]},
        'ht-recheck-stamp': {'main': [[{'node': 'ht-classify', 'type': 'main', 'index': 0}]]},
        'ht-classify': {'main': [[{'node': 'ht-skip?', 'type': 'main', 'index': 0}]]},
        'ht-skip?': {'main': [[{'node': 'ht-skip', 'type': 'main', 'index': 0}],
                              [{'node': 'ht-flag-still-true?', 'type': 'main', 'index': 0}]]},
        'ht-flag-still-true?': {'main': [[{'node': 'ht-clear-flag', 'type': 'main', 'index': 0}],
                                         [{'node': 'ht-forget-silent', 'type': 'main', 'index': 0}]]},
        'ht-clear-flag': {'main': [[{'node': 'ht-egress-log', 'type': 'main', 'index': 0}]]},
        'ht-egress-log': {'main': [[{'node': 'ht-carry-clear', 'type': 'main', 'index': 0}]]},
        'ht-carry-clear': {'main': [[{'node': 'ht-forget', 'type': 'main', 'index': 0}]]},
        'ht-forget': {'main': [[{'node': 'ht-timeout-notice', 'type': 'main', 'index': 0}]]},
    }
    return {'name': 'ht-sweeper BUILD', 'nodes': nodes, 'connections': conns,
            'settings': {'executionOrder': 'v1', 'availableInMCP': True}}


# ════════════════════════════════════════════════════════════════════════════════════════════════
# S3 — ht-config-form
# ════════════════════════════════════════════════════════════════════════════════════════════════
def build_s3():
    nodes = [
        {'id': nid(), 'name': 'ht-config-form', 'type': 'n8n-nodes-base.formTrigger',
         'typeVersion': 2.6, 'position': [-880, 300], 'webhookId': nid(),
         'parameters': {
             'authentication': 'n8nUserAuth',
             'formTitle': 'Human-intervention timeout (HARNESS)',
             'formDescription': ('Writes the test:ht:* namespace ONLY. When a human agent replies, '
                                 'the AI is muted for this contact until the team goes quiet for the '
                                 'timeout below. Kill switch OFF disables the whole feature. Leave '
                                 'the pilot list EMPTY to apply it to every contact.'),
             'formFields': {'values': [
                 {'fieldLabel': 'Timeout (minutes)', 'fieldType': 'number',
                  'placeholder': '5', 'requiredField': True},
                 {'fieldLabel': 'Feature', 'fieldType': 'dropdown',
                  'fieldOptions': {'values': [{'option': 'on'}, {'option': 'off'}]},
                  'requiredField': True},
                 {'fieldLabel': 'Pilot contact IDs', 'fieldType': 'text',
                  'placeholder': '437264483 (comma separated; empty = everyone)'},
             ]},
             'responseMode': 'lastNode',
             'options': {'appendAttribution': False, 'ignoreBots': True,
                         'buttonLabel': 'Apply'}}},
        code('ht-config-apply', body('ht-config-apply.js'), [-640, 300]),
        redis_push('ht-config-audit', 'test:ht:config-audit',
                   '={{ JSON.stringify($json) }}', [-400, 300]),
        redis_set('ht-write-timeout', PREFIX + 'timeout-sec',
                  "={{ $('ht-config-apply').first().json.timeout_sec }}", [-160, 300]),
        redis_set('ht-write-enabled', PREFIX + 'enabled',
                  "={{ $('ht-config-apply').first().json.enabled_value }}", [80, 300]),
        redis_set('ht-write-pilot', PREFIX + 'pilot-contacts',
                  "={{ $('ht-config-apply').first().json.pilot_csv }}", [320, 300]),
        redis_get('ht-readback-timeout', PREFIX + 'timeout-sec', 'rb_timeout_sec', [560, 300]),
        redis_get('ht-readback-enabled', PREFIX + 'enabled', 'rb_enabled', [800, 300]),
        redis_get('ht-readback-pilot', PREFIX + 'pilot-contacts', 'rb_pilot', [1040, 300]),
        code('ht-config-echo', body('ht-config-echo.js'), [1280, 300]),
        {'id': nid(), 'name': 'Form Ending', 'type': 'n8n-nodes-base.form', 'typeVersion': 2.5,
         'position': [1520, 300], 'webhookId': nid(),
         'parameters': {'operation': 'completion', 'respondWith': 'text',
                        'completionTitle': '={{ $json.echo_title }}',
                        'completionMessage': '={{ $json.echo_message }}',
                        'options': {}}},
    ]
    chain = ['ht-config-form', 'ht-config-apply', 'ht-config-audit', 'ht-write-timeout',
             'ht-write-enabled', 'ht-write-pilot', 'ht-readback-timeout', 'ht-readback-enabled',
             'ht-readback-pilot', 'ht-config-echo', 'Form Ending']
    conns = {a: {'main': [[{'node': b, 'type': 'main', 'index': 0}]]}
             for a, b in zip(chain, chain[1:])}
    return {'name': 'ht-config-form BUILD', 'nodes': nodes, 'connections': conns,
            'settings': {'executionOrder': 'v1', 'availableInMCP': True}}


def preserve_ids(payload, existing_id):
    """Keep node ids stable across a re-PUT, matched BY NAME.

    LESSONS 20: a diff keys on node_id, so regenerating ids on an edit makes every node read as
    removed+added and buries the one node that actually changed. LESSONS 52: clone/live ids diverge, so
    NAME is the only stable key across artifacts anyway."""
    st, cur = api('GET', '/workflows/' + existing_id)
    if st != 200 or not isinstance(cur, dict) or 'nodes' not in cur:
        print('  could not fetch', existing_id, '- refusing to PUT with regenerated ids')
        sys.exit(1)
    by_name = {n['name']: n for n in cur['nodes']}
    kept = 0
    for n in payload['nodes']:
        if n['name'] in by_name:
            n['id'] = by_name[n['name']]['id']
            if 'webhookId' in by_name[n['name']] and 'webhookId' in n:
                # regenerating a webhook path would break the tester's recorded driver URL
                n['webhookId'] = by_name[n['name']]['webhookId']
                if 'path' in n['parameters'] and 'path' in by_name[n['name']]['parameters']:
                    n['parameters']['path'] = by_name[n['name']]['parameters']['path']
            kept += 1
    print(f'  preserved {kept}/{len(payload["nodes"])} node ids by name '
          f'(new: {[n["name"] for n in payload["nodes"] if n["name"] not in by_name]})')
    return payload


if __name__ == '__main__':
    which = sys.argv[1]
    payload = {'s1': build_s1, 's2': build_s2, 's3': build_s3}[which]()
    put_to = None
    for i, a in enumerate(sys.argv):
        if a == '--put':
            put_to = sys.argv[i + 1]
    if put_to:
        payload = preserve_ids(payload, put_to)
    (SC / f'payload-{which}.json').write_text(json.dumps(payload, indent=1))
    if '--dry-run' in sys.argv:
        print(f'{which}: {len(payload["nodes"])} nodes, dry run only')
        sys.exit(0)
    if put_to:
        st, res = api('PUT', '/workflows/' + put_to, payload)
        print(which, 'PUT', put_to, 'HTTP', st)
        if isinstance(res, dict) and res.get('id'):
            print('  versionId', res.get('versionId'), 'active', res.get('active'))
            (SC / f'created-{which}.json').write_text(json.dumps(res, indent=1))
            sys.exit(0)
        print('  ', str(res)[:1500]); sys.exit(1)
    st, res = api('POST', '/workflows', payload)
    print(which, 'HTTP', st)
    if isinstance(res, dict):
        print('  id', res.get('id'), 'versionId', res.get('versionId'), 'active', res.get('active'))
        (SC / f'created-{which}.json').write_text(json.dumps(res, indent=1))
    else:
        print('  ', res[:1500])
        sys.exit(1)
