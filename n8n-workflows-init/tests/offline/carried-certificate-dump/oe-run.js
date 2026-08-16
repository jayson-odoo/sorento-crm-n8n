// Shared runner: executes a real `output_exchange` body against a pinned fixture, with no n8n and no
// network. The body ends in `return output`, so it drops straight into a Function wrapper.
const fs = require('fs');

function makeRunner(bodyPath) {
  const body = fs.readFileSync(bodyPath, 'utf8');
  const fn = new Function('$', '$json', body);
  return (fixture) => {
    const parent = fixture.parent_input;
    const $ = (name) => {
      if (name === 'When Executed by Another Workflow') {
        return { first: () => ({ json: parent }) };
      }
      throw new Error('unexpected $(' + name + ') — fixture does not model it');
    };
    // deep-clone so a body that mutates its input cannot leak across before/after runs.
    // The node reads `$json.output` and then `output.output` — i.e. the AI Agent's `output` is the
    // LLM's raw text/JSON, and the business object lives one level in. Fixtures carry the plain LLM
    // object, so serialise it here and let the node take its real parse path.
    const $json = JSON.parse(JSON.stringify(fixture.json));
    if ($json.output && typeof $json.output === 'object') $json.output = JSON.stringify($json.output);
    const p = JSON.parse(JSON.stringify(parent));
    const $2 = (name) => {
      if (name === 'When Executed by Another Workflow') return { first: () => ({ json: p }) };
      throw new Error('unexpected $(' + name + ')');
    };
    void $;
    return fn($2, $json);
  };
}

const norm = (v) => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
const keyOf = (e) => norm(e && e.hint) + '|' + norm((e && (e.canonical_code || e.raw)) || '');

module.exports = { makeRunner, norm, keyOf };
