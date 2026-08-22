// ── run-lane.js — Tier 2 (flow / integration) lane runner ─────────────────────────────────────
//
// Step 3 of plans/test-pyramid-and-git-deploy.md. Walks a workflow.json's `connections` graph
// from `start` to `end`, actually EXECUTING each node in between (Code via the shim's `runNode`,
// If/Switch/Set via a small expression evaluator, everything else from a stub or the base `ctx`),
// and returns the node sequence it took plus the output of `end`. This is what catches routing
// regressions (a flipped If operator) that a per-node unit test can never see, because a unit
// test never asks "which edge did the workflow take".
//
// REUSE, NOT A FORK. Code nodes run through tests/harness/n8n-shim.js's `runNode` — same body
// loader (node-source.js, sha-verified against export/), same sandbox shape. If/Switch conditions
// are evaluated in that SAME sandbox (via the newly-exported `buildSandbox`), not a second one.
//
// CTX LAYERING. `ctx` passed into runLane is the BASE — normally a whole captured execution's
// `ctx` (every node's real output for that run). As the lane executes, each node's own output is
// written into a private overlay that shadows the base for `$('x')` reads and for `ctx[name]`
// stub fallback, so a node re-executed IN this lane sees the lane's own fresh output first, while
// anything upstream of `start` (never re-run) still resolves to what was actually captured.
//
// FAIL LOUD. An If/Switch operator this workflow doesn't use, a stub-needing node with neither a
// `stubs` entry nor a base-ctx entry, or a strict-typeValidation condition reading an ABSENT key
// (docs/LESSONS.md's strict-vs-absent landmine) all THROW — never a silent wrong branch.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runNode, normalizeReturn, buildSandbox, deepCopy } = require('./n8n-shim');

const EXPORT_ROOT = path.resolve(__dirname, '../../export');

// ── expression helpers ─────────────────────────────────────────────────────────────────────
// n8n stores an expression-valued field as `="…{{ EXPR }}…"`. Every leftValue / Set `value` this
// workflow uses is the WHOLE field wrapped once: `={{ EXPR }}`, nothing before/after the braces.
// Strip that envelope down to the bare JS expression body.
function exprBody(raw) {
  const m = /^=\s*\{\{([\s\S]*)\}\}\s*$/.exec(raw);
  if (!m) throw new Error(`run-lane: not a bare "={{ ... }}" expression: ${JSON.stringify(raw)}`);
  return m[1].trim();
}

// n8n's expression sandbox adds a handful of "extension" methods that don't exist on the real JS
// prototypes (only If-node condition strings use these — grepped every exported Code node body,
// none do — so this is scoped to run-lane's own evaluator, not to n8n-shim's Code-node sandbox).
//
// REALM GOTCHA (found empirically, not obvious): `vm.createContext(sandbox)` gives the script its
// OWN separate intrinsics — a string literal evaluated INSIDE the vm context boxes against THAT
// context's native String.prototype, not the host's, even though the sandbox also exposes a
// `String` identifier bound to the host's String constructor (`("").constructor === String` is
// FALSE across that boundary — proven with a throwaway vm.createContext probe). So patching the
// host's `String.prototype` (e.g. via n8n-shim's sandbox object) silently does nothing for actual
// in-vm string values — every real fixture value in this workflow's `custom_fields[].value` is a
// JSON string, so this bit for real. Fix: patch via a script run INSIDE the target vm context,
// reaching the realm-local prototype through `"".constructor.prototype` instead of an identifier.
function ensureExpressionExtensions(vmCtx) {
  // NOTE: reach each realm-local prototype via a primitive's own `.constructor.prototype`
  // (`"".constructor.prototype`, not a bare `String.prototype`) — a bare `String`/`Boolean`/
  // `Number` identifier here would resolve through the sandbox's OWN `String` etc. properties
  // (n8n-shim's buildSandbox puts the HOST constructors there so Code-node bodies can use them),
  // which shadows the vm context's real intrinsic and silently patches the wrong realm.
  vm.runInContext(`(function(){
    if (!"".constructor.prototype.toBoolean) {
      // n8n data-transformation-functions: String.toBoolean() — 'true'/'yes'/'1' (case-insensitive,
      // trimmed) is true, everything else false.
      Object.defineProperty("".constructor.prototype, 'toBoolean', { enumerable: false, value: function () {
        var v = this.toString().trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === '1';
      }});
    }
    if (!true.constructor.prototype.toBoolean) {
      Object.defineProperty(true.constructor.prototype, 'toBoolean', { enumerable: false, value: function () { return this.valueOf(); }});
    }
    if (!(0).constructor.prototype.toBoolean) {
      Object.defineProperty((0).constructor.prototype, 'toBoolean', { enumerable: false, value: function () { return this.valueOf() !== 0; }});
    }
  })();`, vmCtx, { filename: 'n8n-expr-extensions.js' });
}

function evalExpr(raw, sandboxCtx) {
  const body = exprBody(raw);
  return vm.runInContext('(' + body + ')', sandboxCtx, { filename: 'n8n-if-expr.js' });
}

// ── If/Switch operator semantics (only the operators actually present in this workflow: 'true',
// 'false', 'equals', 'gt', 'empty', 'notEmpty', 'contains'; combinators 'and'/'or';
// typeValidation 'strict'/'loose'). Anything else throws — never silently passes. ────────────────
function isEmptyValue(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function typeOfN8n(v) {
  if (v === null || v === undefined) return 'undefined';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'boolean' | 'number' | 'string' | 'object' | ...
}

function coerce(v, wantType) {
  if (wantType === 'boolean') return Boolean(v);
  if (wantType === 'number') return Number(v);
  if (wantType === 'string') return String(v);
  if (wantType === 'array') return Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v]);
  return v;
}

// Strict-vs-loose per docs/LESSONS.md / memory "n8n strict typeValidation misses ABSENT" (proven
// 2026-08-12 on if-in-working-hours, exec 12210538/12211350): strict guards a value that IS
// PRESENT but the WRONG type — it throws (NodeOperationError) only then. A value that is simply
// ABSENT (undefined/null — a missing key, or an optional-chain short-circuit) is coerced through
// SILENTLY under strict same as loose, with NO error — that is exactly the landmine (the node's
// own design comment claims it errors; it doesn't). So: strict+present+wrong-type -> throw;
// strict+absent, or loose+anything -> coerce and proceed, never throw.
function typedValue(actual, wantType, typeValidation, label) {
  if (wantType === undefined) return actual; // operator with no declared type (n/a here, but safe)
  if (actual === undefined || actual === null) return coerce(actual, wantType);
  const gotType = typeOfN8n(actual);
  const ok = wantType === 'array' ? Array.isArray(actual) : gotType === wantType;
  if (ok) return actual;
  if (typeValidation === 'strict') {
    throw new Error(
      `run-lane: strict typeValidation failure on ${label}: expected ${wantType}, got ${gotType} (value: ${JSON.stringify(actual)}) — ` +
      `PRESENT but wrong type, which is what strict actually rejects (an ABSENT value is coerced silently, not this)`
    );
  }
  return coerce(actual, wantType);
}

function evalCondition(cond, sandboxCtx, typeValidation, label) {
  const op = cond.operator.operation;
  const wantType = cond.operator.type;
  const rawActual = evalExpr(cond.leftValue, sandboxCtx);
  switch (op) {
    case 'true': {
      const v = typedValue(rawActual, 'boolean', typeValidation, `${label} (true)`);
      return v === true;
    }
    case 'false': {
      const v = typedValue(rawActual, 'boolean', typeValidation, `${label} (false)`);
      return v === false;
    }
    case 'equals': {
      const v = typedValue(rawActual, wantType, typeValidation, `${label} (equals)`);
      const rhs = typeValidation === 'strict' ? cond.rightValue : coerce(cond.rightValue, wantType);
      return v === rhs;
    }
    case 'gt': {
      const v = typedValue(rawActual, 'number', typeValidation, `${label} (gt)`);
      return v > Number(cond.rightValue);
    }
    case 'empty': {
      // 'empty'/'notEmpty' ask about absence/emptiness directly — never a type mismatch to
      // report, strict or loose, so no typedValue() gate here.
      return isEmptyValue(rawActual);
    }
    case 'notEmpty':
      return !isEmptyValue(rawActual);
    case 'contains': {
      const v = typedValue(rawActual, 'string', typeValidation, `${label} (contains)`);
      return v.includes(String(cond.rightValue));
    }
    default:
      throw new Error(`run-lane: unsupported If/Switch operator "${op}" on ${label} — not in the inventory this evaluator covers`);
  }
}

function evalConditionGroup(conditionsBlock, sandboxCtx, label) {
  const { combinator, conditions, options } = conditionsBlock;
  const typeValidation = (options && options.typeValidation) || 'loose';
  const results = conditions.map((c, i) => evalCondition(c, sandboxCtx, typeValidation, `${label}[${i}]`));
  if (combinator === 'and') return results.every(Boolean);
  if (combinator === 'or') return results.some(Boolean);
  throw new Error(`run-lane: unsupported combinator "${combinator}" on ${label}`);
}

// ── workflow.json loading + connection graph ───────────────────────────────────────────────
function loadWorkflowJson(slug, workflowJson) {
  if (workflowJson && typeof workflowJson === 'object') return workflowJson;
  const p = workflowJson && typeof workflowJson === 'string'
    ? workflowJson
    : (process.env.RUN_LANE_WORKFLOW_JSON || path.join(EXPORT_ROOT, slug, 'workflow.json'));
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── overlay ctx: lane's own outputs shadow the base captured ctx ──────────────────────────────
// A plain merge (overlay wins) recomputed on demand — simpler and invariant-free next to a Proxy,
// and these are small per-node output arrays, not large objects, so re-merging per node is cheap.
function mergeCtx(baseCtx, overlay) {
  return { ...(baseCtx || {}), ...overlay };
}

// ── node execution ─────────────────────────────────────────────────────────────────────────
function loadCodeBody(slug, nodeName) {
  const { loadNodes } = require('../offline/node-source');
  const file = nodeName + '.js';
  const src = loadNodes(slug, [file]);
  return src[file];
}

function runCodeNode(slug, node, items, ctxView, execution) {
  const body = loadCodeBody(slug, node.name);
  const raw = runNode({ body, fixture: { ctx: ctxView, input: items, execution } });
  return { items: normalizeReturn(raw), outputIndex: 0 };
}

function runIfNode(node, items, ctxView) {
  const sandbox = buildSandbox({ ctx: ctxView, input: items });
  const vmCtx = vm.createContext(sandbox);
  ensureExpressionExtensions(vmCtx);
  const pass = evalConditionGroup(node.parameters.conditions, vmCtx, node.name);
  return { items, outputIndex: pass ? 0 : 1 };
}

function runSwitchNode(node, items, ctxView) {
  const sandbox = buildSandbox({ ctx: ctxView, input: items });
  const vmCtx = vm.createContext(sandbox);
  ensureExpressionExtensions(vmCtx);
  const rules = node.parameters.rules.values;
  for (let i = 0; i < rules.length; i++) {
    if (evalConditionGroup(rules[i].conditions, vmCtx, `${node.name}[rule ${i}]`)) {
      return { items, outputIndex: i };
    }
  }
  const fallback = node.parameters.options && node.parameters.options.fallbackOutput;
  if (fallback === 'extra') return { items, outputIndex: rules.length };
  return { items, outputIndex: -1 }; // 'none' (or unset): no rule matched, no edge taken
}

function runSetNode(node, items, ctxView) {
  const assignments = node.parameters.assignments.assignments;
  const outItems = items.map((item) => {
    const json = { ...item.json };
    for (const a of assignments) {
      if (typeof a.value === 'string' && a.value.startsWith('=')) {
        const sandbox = buildSandbox({ ctx: ctxView, input: [item] });
        const vmCtx = vm.createContext(sandbox);
        ensureExpressionExtensions(vmCtx);
        json[a.name] = evalExpr(a.value, vmCtx);
      } else {
        json[a.name] = a.value;
      }
    }
    return { json };
  });
  return { items: outItems, outputIndex: 0 };
}

const STUB_TYPES = new Set([
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.executeWorkflow',
  'n8n-nodes-base.aggregate',
  'n8n-nodes-base.splitOut',
  'n8n-nodes-base.removeDuplicates',
  '@respond-io/n8n-nodes-respond-io.respondio',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainLlm',
  'n8n-nodes-base.redis',
  'n8n-nodes-base.splitInBatches',
]);

function runStubNode(node, stubs, baseCtx) {
  const stub = (stubs && stubs[node.name]) || (baseCtx && baseCtx[node.name]);
  if (stub === undefined) throw new Error(`UNSTUBBED: ${node.name}`);
  return { items: deepCopy(stub), outputIndex: 0 };
}

function executeNode(slug, node, items, ctxView, stubs, baseCtx, execution) {
  switch (node.type) {
    case 'n8n-nodes-base.code':
      return runCodeNode(slug, node, items, ctxView, execution);
    case 'n8n-nodes-base.if':
      return runIfNode(node, items, ctxView);
    case 'n8n-nodes-base.switch':
      return runSwitchNode(node, items, ctxView);
    case 'n8n-nodes-base.set':
      return runSetNode(node, items, ctxView);
    case 'n8n-nodes-base.executionData':
      return { items, outputIndex: 0 }; // pass-through
    default:
      if (STUB_TYPES.has(node.type)) return runStubNode(node, stubs, baseCtx);
      throw new Error(`run-lane: no execution strategy for node type "${node.type}" (node "${node.name}")`);
  }
}

// ── the lane walk ───────────────────────────────────────────────────────────────────────────
function runLane({ slug, start, end, ctx, input, stubs, workflowJson, execution }) {
  const wf = loadWorkflowJson(slug, workflowJson);
  const nodesByName = new Map(wf.nodes.map((n) => [n.name, n]));
  const connections = wf.connections || {};

  const baseCtx = ctx || {};
  const overlay = {}; // lane's own fresh outputs — shadows baseCtx for $('x') / stub fallback

  const path_ = [];
  const outputs = {};
  let currentName = start;
  let currentItems = deepCopy(input || []);
  const MAX_HOPS = 200;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const node = nodesByName.get(currentName);
    if (!node) throw new Error(`run-lane: node "${currentName}" not found in ${slug}/workflow.json`);
    path_.push(currentName);

    const ctxView = mergeCtx(baseCtx, overlay);
    const { items: outItems, outputIndex } = executeNode(slug, node, currentItems, ctxView, stubs, baseCtx, execution);
    outputs[currentName] = outItems;
    overlay[currentName] = outItems;

    if (currentName === end) {
      return { path: path_, outputs, end: outItems };
    }

    if (outputIndex < 0) break; // node declined to take any edge (e.g. Switch 'none' fallback)
    const nodeConns = connections[currentName];
    const targets = nodeConns && nodeConns.main && nodeConns.main[outputIndex];
    if (!targets || targets.length === 0) break; // dead end: no outgoing edge on the taken output

    currentItems = outItems;
    currentName = targets[0].node; // lanes are single-path; first target on the taken output wins
  }

  return { path: path_, outputs, end: outputs[end] };
}

module.exports = { runLane, exprBody, evalConditionGroup };
