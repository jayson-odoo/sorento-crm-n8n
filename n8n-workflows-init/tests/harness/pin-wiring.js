#!/usr/bin/env node
// ── pin-wiring.js — pins the NON-jsCode workflow surface, per reviewer finding S2 ──────────────
//
// WHY THIS EXISTS. What ships to n8n is `workflow.json`; only `nodes/*.js` (a Code node's
// `parameters.jsCode`) is exercised by ANY test in this suite (unit fixtures via node-source.js's
// sha check, flow lanes via run-lane.js). Everything else in a node — a Code node's execution
// `mode`, an `executeWorkflow` node's `workflowId.value` (which sub-workflow it actually calls —
// how a node gets pointed at a REAL-EGRESS sub, safety-critical), credentials, typeVersion — can
// change with ZERO test noticing. Proven with three real experiments (see the task report this
// finding came out of): flipping a Code node's mode (`runOnceForEachItem` -> `runOnceForAllItems`),
// repointing an `executeWorkflow` node's `workflowId.value`, and (a related but separate gap, fixed
// by S4) garbage injected into a fixture's ctx entry — all three shipped GREEN before these fixes.
//
// WHAT THIS PINS, per node, per tracked slug:
//   name, type, typeVersion
//   mode              — Code nodes only (parameters.mode)
//   workflowIdValue   — executeWorkflow nodes only (parameters.workflowId.value)
//   credentials       — {credType: {id, name}}, from node.credentials (any node type)
//   nonJsCodeParamsSha256 — sha256 of a canonical (deep-key-sorted) JSON of `parameters` with
//                           `jsCode` deleted (jsCode is ALREADY covered — sha-gated per node —
//                           by node-source.js; re-hashing it here would be redundant and would
//                           make this file churn on every legitimate Code-node edit, defeating the
//                           point of a WIRING pin)
//
// USAGE
//   node tests/harness/pin-wiring.js            check: exit 1 + readable diff if wiring.json is stale
//   node tests/harness/pin-wiring.js --write     regenerate tests/fixtures/wiring.json from export/
//
// tests/unit/_all-nodes.test.js calls `buildWiring()` (exported below) directly and diffs it
// against the committed file — same function this CLI uses, so the test and the generator can
// never disagree about what "the wiring" means.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');           // n8n-workflows-init/
const EXPORT = path.join(ROOT, 'export');
const WIRING_PATH = path.join(ROOT, 'tests', 'fixtures', 'wiring.json');

// Same two slugs tests/unit/_all-nodes.test.js tracks — the wiring pin only matters for slugs this
// suite actually tests the node bodies of; pinning an untested slug's wiring would just be noise.
const SLUGS = ['live-spine-sorento-consume-main', 'sub-semantic-parser'];

// Deterministic JSON: object keys sorted recursively, arrays keep their own order (order IS
// meaningful there — e.g. an If node's condition list). Without this, two byte-identical
// `parameters` objects that merely serialize their keys in a different order (a real thing n8n's
// own export has done historically) would hash differently and manufacture a false diff.
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function nonJsCodeParamsSha(node) {
  const params = { ...(node.parameters || {}) };
  delete params.jsCode; // covered separately, per-node, by node-source.js's own sha gate
  return sha256(canonicalJson(params));
}

function credentialsOf(node) {
  const creds = node.credentials || {};
  const out = {};
  for (const credType of Object.keys(creds).sort()) {
    const c = creds[credType] || {};
    out[credType] = { id: c.id ?? null, name: c.name ?? null };
  }
  return out;
}

function buildWiringForSlug(slug) {
  const wfPath = path.join(EXPORT, slug, 'workflow.json');
  if (!fs.existsSync(wfPath)) {
    throw new Error(`pin-wiring: no export/${slug}/workflow.json — run export-workflows.py first`);
  }
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const nodes = {};
  for (const node of wf.nodes || []) {
    const entry = {
      type: node.type,
      typeVersion: node.typeVersion,
      nonJsCodeParamsSha256: nonJsCodeParamsSha(node),
    };
    if (node.type === 'n8n-nodes-base.code') {
      entry.mode = (node.parameters || {}).mode ?? null;
    }
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
      const wfId = (node.parameters || {}).workflowId || {};
      entry.workflowIdValue = wfId.value ?? null;
    }
    const creds = credentialsOf(node);
    if (Object.keys(creds).length > 0) entry.credentials = creds;
    nodes[node.name] = entry;
  }
  return nodes;
}

function buildWiring() {
  const out = {};
  for (const slug of SLUGS) out[slug] = buildWiringForSlug(slug);
  return out;
}

// ── readable diff: names the changed node + field, not just "objects differ" ───────────────────
function diffWiring(committed, fresh) {
  const lines = [];
  const slugs = new Set([...Object.keys(committed || {}), ...Object.keys(fresh || {})]);
  for (const slug of [...slugs].sort()) {
    const c = (committed && committed[slug]) || {};
    const f = (fresh && fresh[slug]) || {};
    const names = new Set([...Object.keys(c), ...Object.keys(f)]);
    for (const name of [...names].sort()) {
      const cn = c[name], fn = f[name];
      if (cn === undefined) { lines.push(`+ ${slug} / "${name}": new node (not in committed wiring.json)`); continue; }
      if (fn === undefined) { lines.push(`- ${slug} / "${name}": node removed (still in committed wiring.json)`); continue; }
      const fields = new Set([...Object.keys(cn), ...Object.keys(fn)]);
      for (const field of [...fields].sort()) {
        const cv = JSON.stringify(cn[field]);
        const fv = JSON.stringify(fn[field]);
        if (cv !== fv) {
          lines.push(`~ ${slug} / "${name}" . ${field}: ${cv} -> ${fv}`);
        }
      }
    }
  }
  return lines;
}

function loadCommitted() {
  if (!fs.existsSync(WIRING_PATH)) return null;
  return JSON.parse(fs.readFileSync(WIRING_PATH, 'utf8'));
}

function writeWiring(wiring) {
  fs.mkdirSync(path.dirname(WIRING_PATH), { recursive: true });
  fs.writeFileSync(WIRING_PATH, JSON.stringify(wiring, null, 2) + '\n');
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const fresh = buildWiring();
  if (write) {
    writeWiring(fresh);
    console.log(`pin-wiring.js --write: wrote ${WIRING_PATH}`);
    process.exit(0);
  }
  const committed = loadCommitted();
  const diff = diffWiring(committed, fresh);
  if (diff.length === 0) {
    console.log('pin-wiring.js: OK — wiring.json matches export/.');
    process.exit(0);
  }
  console.log(`pin-wiring.js: STALE — wiring.json does not match export/ (${diff.length} field(s) changed):`);
  for (const l of diff) console.log('  ' + l);
  console.log('\nIf this change was deliberate, re-pin it: node n8n-workflows-init/tests/harness/pin-wiring.js --write');
  process.exit(1);
}

module.exports = { buildWiring, buildWiringForSlug, diffWiring, WIRING_PATH, SLUGS };
