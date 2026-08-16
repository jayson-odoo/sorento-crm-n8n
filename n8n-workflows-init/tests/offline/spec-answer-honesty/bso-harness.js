// ── bso-harness — run the real build-suggest-offer body offline ─────────────────────────
// Same doctrine as ccs-harness.js: the node body executes with a stubbed $ / $input /
// $execution, and a node that exists but did not run on this path reports isExecuted:false and
// THROWS on .first() — n8n's actual behaviour. The node's own try/catch guards must absorb it.
//
// This harness exists because reviewer F1's cited defect (exec 12597815) was rendered by THIS
// node, not by compile-current-state, and a fix asserted only on the producing node would be
// LESSONS §63 all over again. The assertions that matter here are on `suggest_response` — the
// string the customer actually reads, which compile-current-state passes through verbatim.
//
// BEFORE = the frozen pre-fix clone body (the RED baseline); AFTER = the builder's output,
// which probe.js's D2 gate proves IS the published body.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const afterPath = () => {
  const o = process.env.OFFLINE_NODES_DIR;
  return o ? path.join(o, 'build-suggest-offer.after.js') : path.join(DIR, 'build-suggest-offer.after.js');
};

const mk = (src) => new Function('$', '$input', '$execution', src);
const BEFORE = () => mk(read('build-suggest-offer.before.js'));
const AFTER = () => mk(fs.readFileSync(afterPath(), 'utf8'));

const item = (j) => ({ json: j });
const stub = (j) => ({ isExecuted: true, first: () => item(j), all: () => [item(j)] });
const NOTRUN = { isExecuted: false, first: () => { throw new Error('no data'); }, all: () => [] };

/**
 * A NOT-FOUND-lane world (the lane build-suggest-offer sits on).
 *
 * @param {object}   o
 * @param {object[]} o.entities    parser entities — this is ALSO the `tokens` array n8n sent
 * @param {object}   o.resolver    the resolve-entity payload
 * @param {object}   [o.gate]      disallowed-entity-gate payload
 * @param {string}   [o.rawMessage] the customer's own text as tf-message emits it. OMITTED by
 *   default, so the reader's try/catch is exercised against a node that did not run.
 * @param {object}   [o.dymAnnotate] dym-annotate payload (the has/no suffix source)
 */
function world({ entities, resolver, gate, rawMessage, dymAnnotate, domain, team }) {
  const parser = {
    message_type: 'business_query',
    domain_hint: domain || 'product_attachment',
    user_goal: 'trying to check whether the wall hung basin has a SIRIM certificate',
    entities,
    routing: { suggested_team: team || 'purchasing_certification' },
    escalation: { is_escalation_confirmation: false },
  };
  const gateJson = {
    compatible_entities: [],
    gate_debug: { domain: parser.domain_hint, allowed_lookup: ['product', 'category', 'brand'] },
    ...(gate || {}),
  };
  const nodes = {
    "Call 'sub-query-reformulator'": stub({ output: parser }),
    'resolve-entity': stub(resolver),
    'disallowed-entity-gate': stub(gateJson),
  };
  if (dymAnnotate !== undefined) nodes['dym-annotate'] = stub(dymAnnotate);
  if (rawMessage !== undefined) nodes['tf-message'] = stub({ message: { message: { text: rawMessage } } });
  const $ = (n) => (n in nodes ? nodes[n] : NOTRUN);
  return { $, nodes, input: { ...resolver } };
}

const run = (fn, w, input) => fn(w.$, { first: () => item(input || w.input) }, { id: '12597815' });

module.exports = { BEFORE, AFTER, world, run, mk, read, afterPath };
