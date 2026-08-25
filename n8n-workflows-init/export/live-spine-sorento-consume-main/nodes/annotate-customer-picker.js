const gate  = $('disallowed-entity-gate').first().json ?? {};
const probe = (() => { try { return $('probe-customer-orders').first().json ?? {}; } catch (e) { return {}; } })();

// Which CANDIDATES actually have a matching delivery, under the same product/date filters the
// customer asked with (probe-customer-orders queried customer_probe_entities, not just the names).
// Mirrors annotate-incoming-picker: display-only, the roster the next-turn pick resolves against
// (compatible_entities) is untouched, and line order / numbering are preserved byte-for-byte.
const out = gate;                                       // clean roster item, order intact
out.is_clarification = false;                           // parity with the not-found require_specific branch

// THE BARE PICKER. `not-found-error-message` renders a require_specific turn as
// `escalate_message = gate.gate_clarification`, verbatim (not-found-error-message.js:548) - so this
// string IS today's live output for this turn. Every arm below that cannot honestly annotate returns
// exactly it, which makes "we could not measure" indistinguishable from "this feature is not
// deployed" rather than indistinguishable from "we measured and found nothing".
const bare = String(gate.gate_clarification || '');

// D2 - PROBE FAILED vs PROBE FOUND NOTHING. `probe-customer-orders` carries
// onError: continueRegularOutput, so a transient MCP/LLM failure now arrives here as an ordinary
// item instead of ending the turn. Without this arm the failure is silently indistinguishable from
// an empty answer set and every line renders a confident "- no delivery" on evidence that was never
// gathered. Neither `answers` nor `items` being an array is the signal: the sub emits one of the two
// on every successful read. This is build-suggest-offer's own documented "unprobed => BARE" rule.
const rows = Array.isArray(probe.answers) ? probe.answers
           : (Array.isArray(probe.items) ? probe.items : null);
if (rows === null) {
  out.escalate_message = bare;
  out.customer_probe_hits = null;                       // diagnostic: null = not measured
  out.customer_probe_skip_reason = 'probe_unavailable';
  return out;
}

// F - PAGE SATURATION, the same defence dym-annotate applies (`_PAGE_SATURATION`, dym-annotate.js:36)
// and for the same reason: nothing in the envelope reports truncation, so a full page is the only
// signal available that rows were cut, and an attribution built on a truncated page is wrong in the
// one direction that matters - a candidate whose rows fell off the page reads as "no".
// The cap is 20, and it is SOURCED, not guessed: the CRM route caps an external/agent order list at
// `_EXTERNAL_ORDERS_LIST_LIMIT_CAP = 20` when no date filter is given
// (sorento_crm_backend/app/api/v1/order_management/orders.py:22, and the MCP server says the same at
// server.py:123 - "no date filter -> top-20 by latest delivery; date filter -> the full window").
// MEASURED, exec 13590613: all 20 rows came back for ONE busy customer (A CRAFT IDEA), so the other
// five candidates were never reached and would have rendered "- no delivery" on no evidence at all.
// A date-scoped question lifts the backend cap to 1000, so a date-scoped answer of exactly 20 rows
// loses its annotation here for nothing. That is the deliberate direction to be wrong in: a
// saturated page withholds the annotation and renders the bare picker, and it can NEVER invent one.
const _PAGE_SATURATION = 20;
if (rows.length >= _PAGE_SATURATION) {
  out.escalate_message = bare;
  out.customer_probe_hits = null;                       // diagnostic: null = not measured
  out.customer_probe_skip_reason = 'page_saturated';
  return out;
}

// Same base-name rule the picker groups by, so "MASTILE KLANG SDN BHD [A/C I]" on an order row
// matches the "MASTILE KLANG SDN BHD" line it was rendered from.
const base = (s) => String(s ?? '')
  .toUpperCase()
  .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
  .replace(/\bSDN\.?\s*BHD\.?\b|\bSDN\b|\bBHD\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

const custOfRow = (a) => {
  if (!a) return null;
  if (Array.isArray(a.fields)) {
    const f = a.fields.find(x => /^\s*customer\s*$/i.test(String((x && x.label) || '')));
    if (f && f.value) return String(f.value);
  }
  return a.customer_name || a.customer || null;
};

const withDelivery = new Set();
for (const r of rows) {
  const b = base(custOfRow(r));
  if (b) withDelivery.add(b);
}

// NO reordering, no renumbering - the numbers are the pick affordance. Suffixes only, and the plain
// hyphen, never an em-dash (captain hard rule 2026-08-22; the sibling annotate-incoming-picker
// already uses "- has incoming"). A hardcoded literal must not rely on a downstream sanitizer.
const annotated = bare.split('\n').map(line => {
  const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
  if (!m) return line;                                  // header / non-item line
  const b = base(m[1]);
  return line + (withDelivery.has(b) ? ' - has delivery' : ' - no delivery');
}).join('\n');

let msg = annotated;
if (withDelivery.size === 0) msg += '\n\nNone of these have a matching delivery.';

out.escalate_message   = msg;
out.customer_probe_hits = withDelivery.size;            // diagnostic
out.customer_probe_skip_reason = null;
return out;
