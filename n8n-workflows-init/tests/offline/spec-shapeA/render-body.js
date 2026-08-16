// ── render-body — evaluate an n8n jsonBody template offline ──────────────────────────────
// The change is an EXPRESSION, not a Code node, so nothing in the repo's existing offline
// machinery can see it: `nodes/*.js` only carries Code bodies (LESSONS §71 — a review built
// from nodes/*.js is blind to non-Code-node parameters, and that blindness shipped an outage).
// This renders the template the way n8n does, so a syntax error, a bad escape or a corrupted
// `$('...')` accessor is caught BEFORE the PUT rather than by a customer (LESSONS §D14).
//
// Fidelity, stated honestly: this is a faithful model of the two things that can break here —
// (1) does each `{{ }}` segment parse and evaluate as JS, (2) what string does it produce —
// and nothing else. It does not model n8n's item pairing, its `$json` proxy, or its error
// wrapping. That is enough for a body whose expressions only read `.first()`/`.item` off two
// named nodes, and it is stated so nobody reads a green here as "the node will run".

const VM_KEYS = ['JSON', 'Math', 'Number', 'String', 'Array', 'Object', 'Boolean'];

/**
 * @param {string} template  the raw n8n parameter value, leading '=' included
 * @param {Record<string, object[]>} nodes  node name -> array of item .json objects
 */
function render(template, nodes) {
  if (typeof template !== 'string') throw new TypeError('template must be a string');
  const body = template.startsWith('=') ? template.slice(1) : template;

  const $ = (name) => {
    if (!Object.prototype.hasOwnProperty.call(nodes, name)) {
      // n8n throws too; make the message name the node so a mis-escaped accessor is obvious.
      throw new Error(`no fixture for node ${JSON.stringify(name)}`);
    }
    const items = nodes[name].map((json) => ({ json }));
    return {
      first: () => items[0],
      last: () => items[items.length - 1],
      all: () => items,
      get item() { return items[0]; },
      isExecuted: true,
    };
  };

  const segments = [];
  let out = '';
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{{', i);
    if (open === -1) { out += body.slice(i); break; }
    const close = body.indexOf('}}', open);
    if (close === -1) throw new Error('unterminated {{ in template');
    out += body.slice(i, open);
    const expr = body.slice(open + 2, close);
    let value;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('$', ...VM_KEYS, `"use strict"; return (${expr});`);
      value = fn($, ...VM_KEYS.map((k) => globalThis[k]));
    } catch (err) {
      throw new Error(`expression failed: {{${expr}}}\n  -> ${err.message}`);
    }
    segments.push({ expr, value });
    out += String(value);
    i = close + 2;
  }
  return { text: out, segments };
}

/** Render + parse. Throws with the offending text when the result is not valid JSON. */
function renderJson(template, nodes) {
  const { text, segments } = render(template, nodes);
  try {
    return { json: JSON.parse(text), text, segments };
  } catch (err) {
    throw new Error(`rendered body is not valid JSON: ${err.message}\n----\n${text}\n----`);
  }
}

module.exports = { render, renderJson };
