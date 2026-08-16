// ── ccs-harness — run the real compile-current-state body offline ───────────────────────
// Same pattern as ../dym-probe-before-offer/ccs-harness.js: the node body executes with a
// stubbed $ / $input / $execution, and a node that exists but did not run on this path
// reports isExecuted:false and THROWS on .first() — n8n's actual behaviour. The node's own
// try/catch guards must absorb that; if they don't, that is a real defect, not a harness bug.
//
// BEFORE/AFTER, per LESSONS §69: `before` is the FROZEN pre-fix body committed in this
// directory (the export stops being a red baseline the moment the fix ships), `after` is the
// builder's output — and once deployed, probe.js's D1 gate proves that same file IS the
// published body via node-source's assertMatchesExport.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// OFFLINE_NODES_DIR is mutate.sh's redirect (see ../node-source.js): a mutant AFTER body.
const afterPath = () => {
  const o = process.env.OFFLINE_NODES_DIR;
  return o ? path.join(o, 'compile-current-state.after.js') : path.join(DIR, 'compile-current-state.after.js');
};

const mk = (src) => new Function('$', '$input', '$execution', src);
const BEFORE = () => mk(read('compile-current-state.before.js'));
const AFTER = () => mk(fs.readFileSync(afterPath(), 'utf8'));

const item = (j) => ({ json: j });
const stub = (j) => ({ isExecuted: true, first: () => item(j), all: () => [item(j)] });
const NOTRUN = { isExecuted: false, first: () => { throw new Error('no data'); }, all: () => [] };

/**
 * Build a world for an ANSWERED product turn.
 *
 * @param {object} o
 * @param {object[]} o.entities      parser entities
 * @param {object} o.resolver        the resolve-entity payload (also fed to the gate)
 * @param {object[]} o.answerRows    what the customer was shown: [{uuid, code}]
 * @param {string} [o.reply]         central-exchange's rendered rows
 * @param {string} [o.rawMessage]    the CUSTOMER'S OWN TEXT, as `tf-message` emits it. Shape is
 *   `json.message.message.text` — NOT invented: that is the spelling every reader in the spine
 *   uses (`Call 'sub-query-reformulator'.latest_user_message`, `sorento-sub-respond-sendmsg-*`,
 *   `resolve-entity-http`), verified against export/clone-.../workflow.json.
 *   OMITTED ON PURPOSE by default: `tf-message` is then ABSENT from the world and `.first()`
 *   THROWS, which is what n8n does for a node that did not run — so every fixture that does not
 *   opt in exercises the reader's try/catch guard rather than a convenient stub.
 */
function world({ entities, resolver, answerRows, reply, userGoal, rawMessage }) {
  const parser = {
    message_type: 'business_query',
    domain_hint: 'master_products',
    user_goal: userGoal || 'trying to get a double bowl kitchen sink',
    entities,
    routing: { suggested_team: 'sales' },
    access_levels: [],
    escalation: {},
  };
  const gate = {
    ...resolver,
    gate_debug: { domain: 'master_products', allowed_lookup: ['product', 'category', 'brand'] },
    compatible_entities: answerRows.map(r => ({ uuid: r.uuid, entity_type: 'product', code: r.code })),
  };
  const ce = {
    response: reply || 'Here are the matching products.\n\n1. *Product Code:* CKS315',
    has_result: true,
    items: answerRows.map(r => ({ title: r.code, fields: [{ label: 'Product Code', value: r.code }] })),
  };
  const nodes = {
    "Call 'sub-query-reformulator'": stub({ output: parser }),
    'sorento-sub-respond-findcontact-respond': stub({ id: 437264483 }),
    'resolve-entity': stub(resolver),
    'disallowed-entity-gate': stub(gate),
    'central-exchange': stub(ce),
  };
  if (rawMessage !== undefined) {
    nodes['tf-message'] = stub({ message: { message: { text: rawMessage } } });
  }
  const $ = (n) => (n in nodes ? nodes[n] : NOTRUN);
  return { $, nodes, ce };
}

const run = (fn, w, input) => fn(w.$, { first: () => item(input || w.ce) }, { id: '999' });

module.exports = { BEFORE, AFTER, world, run, stub, item, NOTRUN, afterPath };
