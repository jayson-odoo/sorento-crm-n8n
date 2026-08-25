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
  if (v === null || v === undefined || v === '') return '-';
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
// KEY-FIRST lookup (S0). A CRM display LABEL is not a stable join key: `227c13d0f` renamed
// "Estimated Arrival Date" -> "ETA" on crm_incoming_stock_list and silently killed the ETA sort
// below, after which cross-domain incoming rows rendered in raw CRM order. `key` names the
// semantic and does not move when the label is reworded.
// CONTRACT (sorento_crm_mcp PR #109): `key` is OMITTED, never null, when a presenter has no
// source key -> test PRESENCE, not `=== null`. Keyed result types today: incoming_stock (both
// presenters) + stock. Everything else still emits {label, value}, hence the label fallback.
const fieldByKey = (it, k) => {
  const f = ((it && it.fields) || []).find(
    x => x && Object.prototype.hasOwnProperty.call(x, 'key') && x.key === k);
  return f ? f.value : null;
};
// key first, then each label in order. Labels are the CURRENT live vocabulary, so this fixes the
// sort before #109 lands and keeps working after.
const fieldPref = (it, k, ...labels) => {
  const v = fieldByKey(it, k);
  if (v !== null && v !== undefined) return v;
  for (const l of labels) {
    const lv = fieldVal(it, l);
    if (lv !== null && lv !== undefined) return lv;
  }
  return null;
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
  const rows = (byCode.get(m._n) || []).slice();
  if (!rows.length) continue;                 // positive facts only — say nothing rather than assert absence
  // Deterministic order. The CRM does NOT return a stable row order between calls (observed: the same
  // product came back in two different location orders), so sort rather than inherit the jitter:
  // stock -> biggest quantity first; incoming -> soonest ETA first.
  // A PRESENT key is not a present number. `_stock` always renders Warehouse / System Location /
  // Quantity On Hand so every stock row has the same shape, using the "—" placeholder when
  // absent — and the key rides along on the placeholder. Number('—') is NaN, which is exactly
  // what makes the branch test below fall through to ETA instead of pretending to sort. Do NOT
  // "fix" that by coercing to 0 here.
  const _qty = it => Number(fieldPref(it, 'quantity_on_hand', 'quantity on hand') ?? NaN);
  // 'eta' precedes the old label: 'ETA' is what live emits TODAY for crm_incoming_stock_list.
  const _eta = it => String(fieldPref(it, 'estimated_arrival_date', 'eta', 'estimated arrival date') ?? '');
  // `|| 0` is deliberate: in a MIXED set a placeholder row sorts as 0 — last in descending
  // order, indistinguishable from a genuine 0 on hand. That is the intended behaviour.
  if (rows.some(it => !Number.isNaN(_qty(it)))) rows.sort((a, b) => (_qty(b) || 0) - (_qty(a) || 0));
  else if (rows.some(it => _eta(it))) rows.sort((a, b) => _eta(a).localeCompare(_eta(b)));
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

// LEAD-IN (user 2026-08-03): the rows arrived with no explanation of what they were. State the pivot
// explicitly — the customer asked about one axis, we are answering with the other.
// WORDING (user 2026-08-04): must NOT assert that stock exists. We deliberately render zero-qty rows
// (format parity with `check stock`), so "there is stock ON HAND" sat directly above a
// `Quantity On Hand: 0` row and contradicted itself — real case: a product whose only row was DC1: 2,
// and turns where every row is 0. "here are the stock details" states what the rows ARE, asserts
// nothing about availability, and lets the rows speak.
// The earlier objection to "stock details" is dead: live #3's miss line is now domain-aware
// (`No ${dh==='incoming'?'incoming':'stock'} records found for: …` in compile-current-state), so on
// an incoming turn the line above reads "No incoming records found for: X." — no collision.
// The incoming-direction lead-in below is deliberately UNCHANGED.
const LEAD = (zs.origin_domain === 'incoming')
  ? 'But here are the stock details for the requested products:'
  : 'But there is INCOMING stock (ETA) for the requested products:';

// ATTACHMENTS + D-ATTACH-MENTION (user decision 2026-08-04).
// The probe envelope carries the packing list(s) at ENVELOPE level (CRM presenter
// sorento_crm_mcp/presenters.py:697-707 builds one de-duped `attachments` list per envelope, keyed on
// (url, filename)). Today crossdomain-render throws them away; `attach-merge` now delivers them.
const XD_FILES = Array.isArray(env.attachments) ? env.attachments : [];

// Announce the file with the SAME sentence the direct `check eta` path uses, so the cross-domain block
// and a real incoming answer read identically (CRM presenter line 708: `intro` when attachments exist).
// GATED on there actually being a file: the ON-HAND direction probes
// `crm_inventory_stock_balance_list`, whose envelope carries `attachments: []`, so an on-hand block
// (e.g. `pls check eta SRTWT5800`) never gains this sentence. Never append it unconditionally.
//
// It cannot disturb crossdomain-compose's marker placement: that node searches its MARKERS in
// `out.user_response` — the message built UPSTREAM — and this block is INSERTED into that string, never
// part of the haystack. The sentence also contains none of the five markers
// ('Related products:', 'Try:', 'Did you mean', 'Here are the closest matches:',
// 'Would you like me to escalate'). It sits at the end of the block, i.e. still ABOVE the escalate
// question on every arm, so the frozen-phrase contract is untouched.
const ATTACH_NOTE = 'I have attached the file(s) below.';
const mention = (blocks.length && XD_FILES.length) ? ('\n\n' + ATTACH_NOTE) : '';

// mc-label-n8n follow-up (captain 2026-08-17): parity with the direct check-stock path — when the
// probe spanned >1 company (envelope `lookup_companies`, #193) and some company returned no rows,
// name it, same sentence shape as output-structurer's silent-company line.
let silentNote = '';
const _lookupCos = Array.isArray(env.lookup_companies) ? env.lookup_companies : [];
if (blocks.length && _lookupCos.length > 1) {
  const _shown = new Set(items.map(it => String(fieldVal(it, 'company') ?? '').trim()).filter(Boolean));
  const _silent = _lookupCos.map(c => String((c && c.name) ?? '').trim()).filter(n => n && !_shown.has(n));
  if (_shown.size && _silent.length) {
    const _codes = [...new Set(items.map(it => String(fieldVal(it, 'product code') ?? '').trim()).filter(Boolean))];
    const _what = (zs.origin_domain === 'incoming' ? 'stock' : 'incoming') + ' records' + (_codes.length ? ` for ${_codes.join(', ')}` : '');
    silentNote = '\n\n' + _silent.map(n => `*${n}:* no ${_what}.`).join('\n');
  }
}

out._xdBlock = {
  block: blocks.length ? (LEAD + '\n\n' + blocks.join('\n\n') + silentNote + mention) : '',
  any: blocks.length > 0,
  // stashed for `attach-merge`. Namespaced under _xdBlock, which compile-current-state's
  // whitelisted rebuild drops before the live session PUT (review finding F2 stays discharged).
  attachments: XD_FILES,
  team: zs.team || null,
  origin: zs.origin_domain || null,
  probed_rows: items.length,
  rendered_rows: blocks.length,
};
return [{ json: out }];

