const gate  = $('disallowed-entity-gate').first().json ?? {};
const probe = (() => { try { return $('probe-customer-orders').first().json ?? {}; } catch (e) { return {}; } })();

// WHICH WINDOW WAS PROBED (2026-08-25). probe-customer-orders now always sends a delivery-date
// window: the parser's own bounds when the customer named one, else an injected default of the
// last 90 days ($now - 90d, computed in the probe's semantic_input expression). This mirror of
// that exact rule - "defaulted iff the parser supplied NEITHER bound" - is what keeps the suffix
// wording honest: on a defaulted probe the miss claim says "no recent delivery" - "recent" bounds
// the claim to the window that was actually measured (captain copy decision 2026-08-25: naming
// "the last 90 days" read like a search limit, but a bare "- no delivery" would be a false
// universal, so the bounded word stays) - while on a customer-dated turn the ask itself named the
// window, so the plain "- no delivery" reads against it. The two rules are two halves of one
// sentence; change the probe's default without revisiting this and the miss claim loses its bound.
const parserOut = (() => { try { return $("Call 'sub-query-reformulator'").first().json.output ?? {}; } catch (e) { return {}; } })();
const probeWindowed = (parserOut.date_filter_start ?? null) === null
                   && (parserOut.date_filter_end   ?? null) === null;

// Which CANDIDATES actually have a matching delivery, under the same product/date filters the
// customer asked with (probe-customer-orders queried customer_probe_entities, not just the names).
// Mirrors annotate-incoming-picker: display-only, the roster the next-turn pick resolves against
// (compatible_entities) is untouched, and line order / numbering are preserved byte-for-byte.
const out = gate;                                       // clean roster item, order intact
out.is_clarification = false;                           // parity with the not-found require_specific branch
out.customer_probe_window_days = probeWindowed ? 90 : null;  // diagnostic: which window the claim is scoped to

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

// F - PAGE SATURATION, retuned to the WINDOWED page (2026-08-25). The defence itself is unchanged
// from dym-annotate's `_PAGE_SATURATION` (dym-annotate.js:36) and exists for the same reason:
// nothing in the envelope reports truncation, so a page that comes back AT the server's hard limit
// is the only available signal that rows were cut, and an attribution built on a truncated page is
// wrong in the one direction that matters - a candidate whose rows fell off the page reads as "no".
// What changed is the limit the page can hit. The probe now ALWAYS sends a delivery-date window
// (see above), and ANY date filter lifts the CRM's external top-20 cap
// (_EXTERNAL_ORDERS_LIST_LIMIT_CAP, orders.py:22) to the full window, hard-limited at
// _EXTERNAL_ORDERS_DATE_SCOPED_LIMIT = 1000 (orders.py:41,60-61) - the same 1000 the route itself
// enforces (`limit: int = Query(50, ge=1, le=1000)`, orders.py:291; the MCP layer slims fields but
// cuts no rows, server.py _slim_orders_list_response). SOURCED, not guessed, like the 20 was.
// At 20 this guard fired on exactly the busy customers the feature exists for - MEASURED, exec
// 13863242: one customer family filled all 20 unwindowed rows, every suffix was suppressed, and the
// picker shipped bare. At 1000 it fires only when one window really returns 1000+ rows, and the
// deliberate direction to be wrong in is preserved: a saturated page withholds the annotation and
// renders the bare picker, and it can NEVER invent one.
const _PAGE_SATURATION = 1000;
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
// On a defaulted probe the miss suffix says "no recent delivery": the probe only looked back 90
// days, so an unqualified "no delivery" could be false about an older delivery - "recent" claims
// exactly what was measured, without naming a window that reads like a search limit (captain copy
// decision 2026-08-25; the probe window itself is unchanged at 90 days).
const SUFFIX_HIT  = ' - has delivery';
const SUFFIX_MISS = probeWindowed ? ' - no recent delivery' : ' - no delivery';
const annotated = bare.split('\n').map(line => {
  const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
  if (!m) return line;                                  // header / non-item line
  const b = base(m[1]);
  return line + (withDelivery.has(b) ? SUFFIX_HIT : SUFFIX_MISS);
}).join('\n');

let msg = annotated;
if (withDelivery.size === 0) {
  msg += probeWindowed
    ? '\n\nNone of these have a recent delivery.'
    : '\n\nNone of these have a matching delivery.';
}

out.escalate_message   = msg;
out.customer_probe_hits = withDelivery.size;            // diagnostic
out.customer_probe_skip_reason = null;
return out;
