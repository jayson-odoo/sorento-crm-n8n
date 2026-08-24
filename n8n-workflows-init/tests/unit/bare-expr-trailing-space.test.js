// ── bare-expr-trailing-space.test.js — a bare n8n expression must not carry a stray trailing space ─
//
// WHY THIS EXISTS. Six call sites in the TEST clone (probe-incoming, sibling-probe, dym-probe,
// dym-probe-partial, promo-dym-probe, probe-customer-orders — the last one undocumented until this
// fix) wrote `contact_id` as:
//
//   "={{ $('sorento-sub-respond-findcontact-respond').first().json.id }} "
//                                                                     ^ trailing space INSIDE the
//                                                                       n8n expression template
//
// n8n evaluates the whole templated string, space included, so the CRM received the literal string
// '487555417 ' instead of '487555417' — measured on the wire in execs 13744232 / 13740186. Commit
// 7d0791f made sub-get-results's entity-ids-transformer defensive (`String(x ?? '').trim()`), but
// that is a belt: the spine should not be emitting a padded id in the first place, and a copy-paste
// of the same broken expression into a future probe node would ship silently without a guard here.
//
// WHAT THIS GUARDS. A "bare expression" parameter is one whose ENTIRE value (after the leading `=`
// n8n uses to mark a field as an expression) is a single `{{ ... }}` block and nothing else — no
// literal text before or after it. `contact_id` is exactly this shape: the field exists only to
// carry one id, so ANY character between the expression's closing `}}` and the end of the value is
// a bug, not formatting.
//
// SCOPING (why this does not false-positive on the rest of the file):
//   - Only parameter values that are STRINGS starting with '=' and containing '{{' are considered
//     at all — this already excludes jsCode bodies (which do not start with '=') and plain literal
//     parameters.
//   - Within those, only values matching ^=\s*\{\{.*\}\}\s*$ — i.e. the expression IS the whole
//     value — are "bare". Multi-line prompt fields like `user_prompt` (Call 'sub-get-results',
//     probe-incoming, ...) and `Basic LLM Chain`.text interleave literal text with MANY `{{ }}`
//     expressions across several lines and are deliberately written with a trailing two-space
//     "markdown hard break" on every line, including their last — that convention is untouched by
//     this test because those values are not bare (they fail the regex: there is literal text
//     around/between the expressions).
//   - Within bare expressions, only a trailing SPACE or TAB is flagged, not a trailing newline.
//     One bare expression (`Call 'sub-query-reformulator'`.latest_user_message) legitimately ends
//     the templated value with '\n' by design; that is a different, deliberate convention from the
//     copy-paste space this test exists to catch, so it is excluded on purpose.
//
// This test FAILED (6 nodes named) before the fix and passes after it — see the fix commit for the
// exact red output.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');   // n8n-workflows-init/
const SLUG = 'clone-sorento-consume-main-TEST';

// The whole value is one expression: optional leading/trailing whitespace around a single
// `{{ ... }}` block, nothing else. `[\s\S]` (not `.`) so a multi-line expression body still matches
// as ONE block rather than accidentally satisfying `.*` per-line.
const BARE_EXPR_RE = /^=\s*\{\{[\s\S]*\}\}\s*$/;

function loadWorkflow(slug) {
  const p = path.join(ROOT, 'export', slug, 'workflow.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Walk a node's `parameters` tree and yield every string value found, with a breadcrumb path for
// readable failure messages (e.g. "workflowInputs.value.contact_id").
function* walkStrings(obj, breadcrumb) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    yield [breadcrumb, obj];
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) yield* walkStrings(obj[i], `${breadcrumb}[${i}]`);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) yield* walkStrings(v, breadcrumb ? `${breadcrumb}.${k}` : k);
  }
}

// Every bare-expression parameter (see header) across every node in the workflow, with any
// character between the expression's closing `}}` and the field's own trailing whitespace
// truncated off, is asserted to carry NO space/tab immediately before the value ends.
test(`${SLUG}: no bare n8n expression parameter ends in a trailing space/tab`, () => {
  const wf = loadWorkflow(SLUG);
  const offenders = [];

  for (const node of wf.nodes || []) {
    for (const [breadcrumb, val] of walkStrings(node.parameters || {}, '')) {
      if (typeof val !== 'string') continue;
      if (!val.startsWith('=') || !val.includes('{{')) continue;   // not an expression at all
      if (!BARE_EXPR_RE.test(val)) continue;                        // not a BARE expression (scoping)

      const trimmed = val.replace(/[ \t\r\n]+$/, '');
      const trailing = val.slice(trimmed.length);
      if (trailing.includes(' ') || trailing.includes('\t')) {
        offenders.push(`${node.name} :: ${breadcrumb} :: ...${JSON.stringify(val.slice(-40))}`);
      }
    }
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `${offenders.length} bare expression parameter(s) end in a stray space/tab INSIDE the ` +
    `n8n expression — n8n evaluates the whitespace as part of the templated string, so the ` +
    `downstream consumer receives a padded value (measured: '487555417 ' reached the CRM in ` +
    `execs 13744232 / 13740186). Remove the trailing space/tab from the expression itself:\n  ` +
    offenders.join('\n  ')
  );
});
