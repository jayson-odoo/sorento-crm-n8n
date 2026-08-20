const gate  = $('disallowed-entity-gate').first().json ?? {};
const probe = (() => { try { return $('probe-customer-orders').first().json ?? {}; } catch (e) { return {}; } })();

// Which CANDIDATES actually have a matching delivery, under the same product/date filters the
// customer asked with (probe-customer-orders queried customer_probe_entities, not just the names).
// Mirrors annotate-incoming-picker: display-only, the roster the next-turn pick resolves against
// (compatible_entities) is untouched, and line order / numbering are preserved byte-for-byte.
const rows = Array.isArray(probe.answers) ? probe.answers
           : (Array.isArray(probe.items) ? probe.items : []);

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

// The probe returns a capped page. A customer absent from a CAPPED result set is "unknown", not
// "none" — annotate those BARE rather than printing a confident, possibly wrong "no delivery".
// (Same rule the did-you-mean probe uses for unprobed codes.)
const CAP = 20;
const capped = rows.length >= CAP;

const src = String(gate.gate_clarification || '');
const annotated = src.split('\n').map(line => {
  const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
  if (!m) return line;                                  // header / non-item line
  const b = base(m[1]);
  if (withDelivery.has(b)) return line + ' — has delivery';
  return capped ? line : line + ' — no delivery';
}).join('\n');

let msg = annotated;
if (!capped && withDelivery.size === 0) msg += '\n\nNone of these have a matching delivery.';

const out = gate;                                       // clean roster item, order intact
out.escalate_message   = msg;
out.is_clarification   = false;                         // parity with the not-found require_specific branch
out.customer_probe_hits = withDelivery.size;            // diagnostic
return out;
