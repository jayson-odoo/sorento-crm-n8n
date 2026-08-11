// ── crossdomain-render ────────────────────────────────────────────────────────────────────────
// Turns the cross-probe result into the customer-facing block.
//
// FORMAT PARITY (user decision 2026-08-03): renders each row with the SAME labelled fields the normal
// stock / incoming answer uses, by re-rendering the probe item's own `fields` (same shape output-structurer
// consumes). So a location line here looks like a location line in a real stock answer — including every
// location the real answer shows, zero-qty ones included, in the presenter's own order.
// The ONE deliberate difference: BULLETS, never numbers (plan Q12) — numbers are D3's contract with
// last_result_set, and a stray "2" must still pick a sibling, not a stock row.
//
// POSITIVE FACTS ONLY (decision (d)): if the probe returns NO rows for a product it contributes NO line.
// An empty envelope is not evidence of absence — sub-get-results returns the same empty envelope for
// "genuinely nothing" and "the read did not work".
const zs   = $('crossdomain-zeroset').first().json._xd || {};
const pass = $('validator').first().json;
const out  = { ...pass, _xd: zs };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const fmtValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && ISO_RE.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
  }
  if (Array.isArray(v)) return v.map(fmtValue).join(', ');
  return String(v);
};

// probe envelope (same unwrap discipline as crossdomain-zeroset)
let env = {};
try { env = $input.first().json || {}; } catch (e) { env = {}; }
if (env && env.output && typeof env.output === 'object') env = env.output;

// FAIL-SILENT vs EMPTY (plan F1 + unwired-error-output-masks-failure): the probe runs with
// onError:continueRegularOutput, so a FAILED probe still emits an item. A result only counts when it
// carries a real get-results envelope.
const hasEnvelope = Array.isArray(env.answers) || Array.isArray(env.items) || typeof env.has_result === 'boolean';
if (!hasEnvelope || env.error) {
  out._xdBlock = { block: '', any: false, degraded: true, reason: env.error ? 'probe_error' : 'no_envelope' };
  return [{ json: out }];
}
const items = Array.isArray(env.answers) ? env.answers : (Array.isArray(env.items) ? env.items : []);
const fieldVal = (it, label) => {
  const f = ((it && it.fields) || []).find(x => String((x && x.label) || '').trim().toLowerCase() === label);
  return f ? f.value : null;
};

const byCode = new Map();
for (const it of items) {
  const c = String(fieldVal(it, 'product code') ?? '').trim();
  if (!c || c === '—') continue;
  const k = c.toUpperCase();
  if (!byCode.has(k)) byCode.set(k, []);
  byCode.get(k).push(it);
}

const blocks = [];
for (const m of (zs.missing || [])) {
  const rows = byCode.get(m._n) || [];
  if (!rows.length) continue;                 // positive facts only — say nothing rather than assert absence
  for (const it of rows) {
    const fieldLines = ((it && it.fields) || [])
      .map(f => `*${f.label}:* ${fmtValue(f.value)}`)
      .join('\n');
    if (!fieldLines) continue;
    let line = `- ${fieldLines}`;
    const fl = (it && it.flags) || {};
    if (fl.discontinued)             line += '\n⚠️  *(PRODUCT DISCONTINUED)*';
    if (fl.expired)                  line += '\n⚠️  *(PROMO EXPIRED)*';
    if (fl.unallocated)              line += '\n🚩  *(PENDING ALLOCATION)*';
    else if (fl.partially_allocated) line += '\n🚩  *(PARTIAL ALLOCATION)*';
    blocks.push(line);
  }
}

out._xdBlock = {
  block: blocks.join('\n\n'),
  any: blocks.length > 0,
  team: zs.team || null,
  origin: zs.origin_domain || null,
  probed_rows: items.length,
  rendered_rows: blocks.length,
};
return [{ json: out }];
