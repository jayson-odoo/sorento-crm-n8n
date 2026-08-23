const gate  = $('disallowed-entity-gate').first().json ?? {};
const probe = (() => { try { return $('probe-incoming').first().json ?? {}; } catch (e) { return {}; } })();

// codes WITH incoming from probe answers (crm_incoming_stock_list returns a row per
// product that HAS incoming; title / "Product Code" field = the code). Absent = none.
const norm = s => String(s ?? '').trim().toLowerCase();
const answers = Array.isArray(probe.answers) ? probe.answers
              : (Array.isArray(probe.items) ? probe.items : []);
const hasIncoming = new Set();
for (const a of answers) {
  let code = a && a.title;
  if (!code && a && Array.isArray(a.fields)) {
    const f = a.fields.find(x => /product\s*code/i.test(x && x.label));
    code = f && f.value;
  }
  if (code) hasIncoming.add(norm(code));
}

// annotate the EXISTING numbered picker text — same lines, same order, same numbering.
// display-only: compatible_entities (the roster used for the next-turn pick) is untouched.
const src = String(gate.gate_clarification || '');
const annotated = src.split('\n').map(line => {
  const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
  if (!m) return line;                                   // header / non-item line
  const status = hasIncoming.has(norm(m[1])) ? ' — has incoming' : ' — no incoming';
  return line + status;
}).join('\n');

let msg = annotated;
if (hasIncoming.size === 0) msg += '\n\nNone of these have incoming stock right now.';

const out = gate;                                        // clean roster item, order intact
out.escalate_message = msg;
out.is_clarification = false;                            // parity with not-found require_specific branch
return out;
