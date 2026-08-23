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

// probe cap REMOVED 2026-08-23 (captain). Was a 20-row page assumption: a candidate absent from a
// page that came back full was left BARE, because absence there can mean "the page never reached
// it" rather than "it has none". Every candidate now gets a definite verdict instead.
// KNOWN TRADE-OFF: the probe queries all candidates in ONE flat date-ordered page, so a single
// busy customer can fill it (measured, exec 13590613: all 20 rows were A CRAFT IDEA, so the other
// five candidates were never measured). Those unreached candidates now render "no delivery" on
// evidence that was not gathered. Accepted deliberately: a definite answer on every line beats an
// unexplained asymmetry. The real fix is a grouped count from the CRM, not a bigger page.
const src = String(gate.gate_clarification || '');
const annotated = src.split('\n').map(line => {
  const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
  if (!m) return line;                                  // header / non-item line
  const b = base(m[1]);
  return line + (withDelivery.has(b) ? ' — has delivery' : ' — no delivery');
}).join('\n');

let msg = annotated;
if (withDelivery.size === 0) msg += '\n\nNone of these have a matching delivery.';

const out = gate;                                       // clean roster item, order intact
out.escalate_message   = msg;
out.is_clarification   = false;                         // parity with the not-found require_specific branch
out.customer_probe_hits = withDelivery.size;            // diagnostic
return out;

