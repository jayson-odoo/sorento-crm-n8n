#!/usr/bin/env python3
"""Rebuild the live PUT bodies from the proven clone/fork bodies.

Re-runnable: fetches live fresh, re-applies each hunk with asserted anchors, writes
PUT-live-spine.json / PUT-live-parser.json + BACKUP-* + EXPECTED-shas.json.
Nothing is written to n8n — this only builds the payloads.

  python3 build-promote.py <src-dir-with-clone-bodies> <out-dir>
"""
import json, os, subprocess, sys, hashlib

SRC, OUT = sys.argv[1], sys.argv[2]
API, KEY = os.environ['N8N_API_BASE'], os.environ['N8N_API_KEY']
SPINE, PARSER = '9qVyfUxmRQqrpGRMDLRuz', 'XTODTw-dJcV0uRdC056hG'
os.makedirs(OUT, exist_ok=True)
S = lambda p: open(os.path.join(SRC, p)).read()


def get(wid, dest):
    subprocess.run(['curl', '-sS', '-H', f'X-N8N-API-KEY: {KEY}', f'{API}/workflows/{wid}', '-o', dest], check=True)
    return json.load(open(dest))


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()[:16]


# ── hunks lifted from the proven clone bodies ──────────────────────────────
gate = S('gate-after13.js')
GA, GB = "let _custProbeEntities = null;", "// ── document-class precision (container-status S1) ────────────────────────────"
GATE_BLOCK = gate[gate.index(GA):gate.index(GB)]
assert "AMBIGUOUS CUSTOMER" in GATE_BLOCK and "A PINNED PICK WINS" in GATE_BLOCK

ccs = S('ccs-after5.js')
CA = "if (_dymLastResultSet) output.variables.dym_last_result_set = _dymLastResultSet;"
CB = "// brand-company-routing: routing axes for the escalation turn"
CCS_BLOCK = ccs[ccs.index(CA) + len(CA):ccs.index(CB)]
assert "A PICKER ROSTER SURVIVES THE ANSWER" in CCS_BLOCK

# ── SPINE ──────────────────────────────────────────────────────────────────
w = get(SPINE, f'{OUT}/BACKUP-live-spine.json')
assert w['versionId'] == w['activeVersionId'], 'live spine has an unpublished draft — STOP'
base_nodes = {n['name']: json.loads(json.dumps(n)) for n in w['nodes']}
N = {n['name']: n for n in w['nodes']}

cond = N['If3']['parameters']['conditions']['conditions'][0]
assert 'allowed_lookup' not in cond['leftValue'], 'If3 already patched?'
cond['leftValue'] = json.load(open(os.path.join(SRC, 'clone-put-body.json')))['nodes'] and next(
    n for n in json.load(open(os.path.join(SRC, 'clone-put-body.json')))['nodes'] if n['name'] == 'If3'
)['parameters']['conditions']['conditions'][0]['leftValue']

g = N['disallowed-entity-gate']['parameters']['jsCode']
assert g.count(GB) == 1
g = g.replace(GB, GATE_BLOCK + GB, 1)
EMIT = "out.compatible_entities = compatible_entities;"
assert g.count(EMIT) == 1
g = g.replace(EMIT, EMIT + "\nif (_custProbeEntities && _custProbeEntities.length) out.customer_probe_entities = _custProbeEntities;"
                          "\nif (_custFamilies && Object.keys(_custFamilies).length) out.picker_families = _custFamilies;", 1)
N['disallowed-entity-gate']['parameters']['jsCode'] = g

cc = N['compile-current-state']['parameters']['jsCode']
OLDF = "items = items.filter(e => String(e.entity_type).toLowerCase() === 'product');"
NEWF = "items = items.filter(e => ['product', 'customer'].includes(String(e.entity_type).toLowerCase()));"
assert cc.count(OLDF) == 1 and cc.count(CA) == 1
cc = cc.replace(OLDF, NEWF, 1).replace(CA, CA + CCS_BLOCK, 1)
N['compile-current-state']['parameters']['jsCode'] = cc

bs = N['build-suggest-offer']['parameters']['jsCode']
assert '_isDerivedQueryToken' not in bs, 'live gained the F1 guard — re-check hunk A'
bs = bs.replace("let missResolutions = [];", S('promote-bso-passed-through.js'), 1)
OLDM = "    && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase()));"
assert bs.count(OLDM) == 1
bs = bs.replace(OLDM, OLDM[:-2] + "\n    && !_passedThrough(res));", 1)
OLDD = "    if (seen.has(code)) continue;\n    seen.add(code); keep.push(m);"
assert bs.count(OLDD) == 1
bs = bs.replace(OLDD, S('promote-bso-dedup.js'), 1)
N['build-suggest-offer']['parameters']['jsCode'] = bs

cs = N['cs-offer-gate']['parameters']['conditions']['conditions']
assert [c['id'] for c in cs] == ['g1', 'g2', 'g3']
cs.append({"id": "g4-no-double-picker",
           "leftValue": "={{ $('disallowed-entity-gate').first().json.require_specific !== true }}",
           "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}})

clone = json.load(open(os.path.join(SRC, 'cp-put.json')))
CN = {n['name']: n for n in clone['nodes']}
for nm, ref in (('If-customer-picker', 'If-incoming-picker'),
                ('probe-customer-orders', 'probe-incoming'),
                ('annotate-customer-picker', 'annotate-incoming-picker')):
    node = json.loads(json.dumps(CN[nm]))
    node['position'] = [N[ref]['position'][0], N[ref]['position'][1] + 260]
    w['nodes'].append(node)
C = w['connections']
assert [x['node'] for x in C['If-incoming-picker']['main'][1]] == ['not-found-error-message']
C['If-incoming-picker']['main'][1] = [{"node": "If-customer-picker", "type": "main", "index": 0}]
C['If-customer-picker'] = {"main": [[{"node": "probe-customer-orders", "type": "main", "index": 0}],
                                    [{"node": "not-found-error-message", "type": "main", "index": 0}]]}
C['probe-customer-orders'] = {"main": [[{"node": "annotate-customer-picker", "type": "main", "index": 0}]]}
C['annotate-customer-picker'] = {"main": [[{"node": "build-suggest-offer", "type": "main", "index": 0}]]}

spine_body = {'name': w['name'], 'nodes': w['nodes'], 'connections': C,
              'settings': {'executionOrder': w['settings'].get('executionOrder', 'v1')}}
json.dump(spine_body, open(f'{OUT}/PUT-live-spine.json', 'w'))

# ── PARSER ─────────────────────────────────────────────────────────────────
p = get(PARSER, f'{OUT}/BACKUP-live-parser.json')
assert p['versionId'] == p['activeVersionId'], 'live parser has an unpublished draft — STOP'
PN = {n['name']: n for n in p['nodes']}
assert PN['output_exchange']['parameters']['jsCode'] == S('ox-before.js'), \
    'live output_exchange is no longer the fork base — cherry-pick instead of copying'
PN['output_exchange']['parameters']['jsCode'] = S('ox-after10.js')
sysmsg = PN['AI Agent']['parameters']['options']['systemMessage']
for old, new in (
    ('- "selling price", "promo price", "promotion price", "discount price" → domain_hint = promotion',
     '- "selling price", "promo price", "promotion price", "discount price", "offer" → domain_hint = promotion'),
    ('    → promotion, promotions, flyer, brochure; and SELLING / promo / discount price ("selling',
     '    → promotion, promotions, flyer, brochure, offer; and SELLING / promo / discount price ("selling')):
    assert sysmsg.count(old) == 1, old[:60]
    sysmsg = sysmsg.replace(old, new, 1)
assert sysmsg.count('  - "videos","actual video"  → attachment_type "video"') == 1, 'video mapping must survive'
PN['AI Agent']['parameters']['options']['systemMessage'] = sysmsg
parser_body = {'name': p['name'], 'nodes': p['nodes'], 'connections': p['connections'],
               'settings': {'executionOrder': p['settings'].get('executionOrder', 'v1')}}
json.dump(parser_body, open(f'{OUT}/PUT-live-parser.json', 'w'))

# ── report + expected shas ────────────────────────────────────────────────
shas = {'spine': {n['name']: sha(json.dumps(n['parameters'], sort_keys=True)) for n in spine_body['nodes']},
        'parser': {n['name']: sha(json.dumps(n['parameters'], sort_keys=True)) for n in parser_body['nodes']}}
json.dump(shas, open(f'{OUT}/EXPECTED-shas.json', 'w'), indent=1)
now = {n['name']: n for n in spine_body['nodes']}
print("spine base   :", json.load(open(f'{OUT}/BACKUP-live-spine.json'))['versionId'])
print("parser base  :", json.load(open(f'{OUT}/BACKUP-live-parser.json'))['versionId'])
print("spine changed:", sorted(k for k in base_nodes if json.dumps(base_nodes[k], sort_keys=True) != json.dumps(now[k], sort_keys=True)))
print("spine added  :", sorted(set(now) - set(base_nodes)), "| nodes", len(base_nodes), "->", len(now))
print("parser changed: ['AI Agent', 'output_exchange']")
