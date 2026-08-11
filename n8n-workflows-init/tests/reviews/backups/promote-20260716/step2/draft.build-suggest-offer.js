// ── build-suggest-offer (D1/D2) ────────────────────────────────────────
// Sibling downstream of not-found-error-message. ADDITIVE: passes the not-found
// payload through and, when the miss carries CONCRETE candidates, attaches a
// suggestion offer that compile-current-state renders. No candidates → suggest_offer
// stays false and downstream is byte-identical to before this node existed.
const out  = { ...$input.first().json };
const q    = (() => { try { return $('Call \'sub-query-reformulator\'').first().json.output; } catch (e) { return {}; } })();
const r    = (() => { try { return $('resolve-entity').first().json ?? {}; } catch (e) { return {}; } })();
const gate = (() => { try { return $('disallowed-entity-gate').first().json ?? {}; } catch (e) { return {}; } })();

out.suggest_offer = false;

const team = q?.routing?.suggested_team || 'customer_service';
const YES  = 'Yes, escalate';
const NO   = "No, it's okay";
const cap3 = (a) => (Array.isArray(a) ? a.slice(0, 3) : []);
const humanList = (codes) => codes.length === 1
  ? codes[0]
  : `${codes.slice(0, -1).join(', ')}, or ${codes[codes.length - 1]}`;

// ── UUID leak guard (promotion did-you-mean) ───────────────────────────
// Promotions have no product code: their canonical_code IS the promo uuid, and the
// human name lives in display.description. Rendering canonical_code as the label leaks
// a raw uuid to the customer. isUuid() detects that; humanLabel() prefers a REAL code,
// else the display name; null ⇒ the candidate has no human label and must be dropped.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => UUID_RE.test(String(s || ''));
const humanLabel = (m) => {
  const c = m && m.canonical_code;
  if (c && !isUuid(c)) return String(c);
  const d = (m && m.display) || {};
  return d.description || d.product_name || d.name || null;
};

const unresolved  = Array.isArray(r?.unresolved_tokens) ? r.unresolved_tokens : [];
const isClar      = out.is_clarification === true;   // preserve vague/scope clarify prompts
const requireSpec = gate?.require_specific === true;  // preserve require-specific prompts
const allowedTypes = Array.isArray(gate?.gate_debug?.allowed_lookup) ? gate.gate_debug.allowed_lookup : null;
const isExact = (m) => String(m?.match_tier || '').toLowerCase() === 'exact';

// Attachment domain → name the actual doc type the user asked for (photo/certificate/
// drawing) instead of a generic word. Falls back to 'document'.
const attachmentNoun = () => {
  if (q?.domain_hint !== 'product_attachment') return null;
  const at = Array.isArray(q?.entities)
    ? q.entities.find(e => String(e.hint || '').toLowerCase() === 'attachment_type') : null;
  return (at && at.raw) ? at.raw : 'document';
};

// ── D1: resolution-miss "did you mean" — PER-TOKEN, GENUINE-MISS ONLY ──────────
// Only a token the resolver could not resolve AND that had no exact match drives a
// did-you-mean, using ITS OWN matches/alternatives. Never aggregate candidates across
// tokens (bug: in a multi-item order, a dead SRTUB6503-BL borrowed SRTMFV207-NL from a
// sibling token). An ambiguous token that still had an exact match returned data → not a miss.
function tokenCandidates(res) {
  const acc = [];
  if (Array.isArray(res?.matches)) acc.push(...res.matches);
  if (Array.isArray(res?.alternatives)) acc.push(...res.alternatives);
  const seen = new Set(); const keep = [];
  for (const m of acc) {
    const code = m && m.canonical_code;
    if (!code) continue;
    if (isExact(m)) continue;                                                  // exact would have resolved
    if (allowedTypes && m.entity_type && !allowedTypes.includes(m.entity_type)) continue;
    if (seen.has(code)) continue;
    seen.add(code); keep.push(m);   // API ranks variants-first / by similarity → keep order
  }
  return keep;
}

// Build the list of genuine miss tokens (their own resolution, no exact match).
let missResolutions = [];
if (Array.isArray(r?.resolutions)) {
  missResolutions = r.resolutions.filter(res => res && res.resolved !== true
    && !(Array.isArray(res.matches) && res.matches.some(isExact)));
} else if (unresolved.length) {
  missResolutions = [r];   // legacy single-resolution shape
}

let d1 = null;
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) { d1 = { token: res.token || unresolved[0] || (q?.entities?.[0]?.raw) || 'that item', cands }; break; }
  }
}

if (d1) {
  // Resolve a human label per candidate; DROP any that would still render a bare uuid
  // (uuid canonical_code with no display name) — never leak a uuid to the customer.
  const picks = cap3(d1.cands)
    .map(m => ({ m, label: humanLabel(m) }))
    .filter(p => p.label);
  if (picks.length) {
    const anyUuid = picks.some(p => isUuid(p.m.canonical_code));
    out.suggest_offer = true;
    out.suggest_selection_context = 'suggest_offer';
    if (anyUuid) {
      // Numbered mode: any uuid-coded (promotion) candidate → number buttons + human
      // names listed in the message text. Numbers are 1 char (safe under every respond.io
      // button/list interpretation) and the pick round-trips by last_result_set[idx].uuid.
      const numbered = picks.map((p, i) => `${i + 1}. ${p.label}`).join('\n');
      out.suggest_response =
        `Couldn't pin down "${d1.token}". Here are the closest matches:\n${numbered}\n` +
        `Reply with a number to continue, or would you like me to escalate to ${team} team?`;
      const nums = picks.map((_, i) => String(i + 1));
      out.suggest_quick_reply = [...nums, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
      out.suggest_last_result_set = picks.map((p, i) => ({
        idx: i + 1, label: p.label, value: p.label,
        product: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
      }));
    } else {
      // Code mode: all candidates have real product codes — BYTE-IDENTICAL to pre-fix.
      const codes = picks.map(p => p.m.canonical_code);
      out.suggest_response =
        `Couldn't find "${d1.token}". Did you mean ${humanList(codes)}? ` +
        `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
      out.suggest_quick_reply = [...codes,  YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
      out.suggest_last_result_set = picks.map((p, i) => ({
        idx: i + 1, label: p.m.canonical_code, value: p.m.canonical_code,
        product: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
      }));
    }
    return out;
  }
  // All candidates dropped (bare uuid, no display name) → suggest_offer stays false and we
  // fall through to D2 / escalate-only. Never emit an invented or uuid label.
}

// ── D2: data-miss "alternatives" (domain tool alternatives[] + relaxed_axis) ────
// Multi-tool queries run get-results MORE THAN ONCE; scan EVERY run, take the first
// non-empty alternatives set. Gate on alternatives != null (never invent).
let alts = null, axis = 'entity';
try {
  const node = $('Call \'sub-get-results\'');
  if (node.isExecuted) {
    for (let ri = 0; ri < 25; ri++) {
      let items;
      try { items = node.all(0, ri); } catch (e) { break; }
      if (!items || !items.length) break;
      const hit = items.find(it => it && it.json && Array.isArray(it.json.alternatives) && it.json.alternatives.length);
      if (hit) { alts = hit.json.alternatives; axis = hit.json.relaxed_axis || 'entity'; break; }
    }
  }
} catch (e) { alts = null; }
if (!alts) return out;   // no alternatives on any run → keep existing "escalate?" behaviour

const rawPicks = cap3(alts);
const anyUuidAlt = rawPicks.some(a => isUuid(a.value));

const compat = Array.isArray(gate?.compatible_entities) ? gate.compatible_entities : [];
const askedCode = (compat[0] && (compat[0].code || compat[0].canonical_code))
  || (Array.isArray(q?.entities) && q.entities[0] ? q.entities[0].raw : 'that item');

// Grammatical mass-noun for the "No {noun} for {code}" template (no article).
const NOUN = { inventory: 'stock', incoming: 'incoming stock (ETA)', master_products: 'product info', promotion: 'promotion' };
const noun = attachmentNoun() || NOUN[q?.domain_hint] || 'result';

if (!anyUuidAlt) {
  // ── non-uuid alternatives: BYTE-IDENTICAL to pre-fix ──
  const picks  = rawPicks;
  const values = picks.map(a => a.value).filter(Boolean);
  if (values.length === 0) return out;

  let text;
  if (axis === 'date') {
    const asked = q?.date_filter_start
      ? ((q.date_filter_end && q.date_filter_end !== q.date_filter_start)
          ? `${q.date_filter_start} to ${q.date_filter_end}` : q.date_filter_start)
      : 'that date';
    const custEnt = Array.isArray(q?.entities)
      ? q.entities.find(e => String(e.hint || '').toLowerCase() === 'customer') : null;
    const cust = custEnt ? custEnt.raw : 'This customer';
    const near = picks.map(a => a.display || a.value).join('; ');
    text =
      `No delivery on ${asked}. ${cust} has delivery on ${near}. ` +
      `Reply with a date to continue, or would you like me to escalate to ${team} team?`;
  } else {
    text =
      `No ${noun} for ${askedCode}. Try: ${values.join(', ')}. ` +
      `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
  }

  out.suggest_offer = true;
  out.suggest_selection_context = 'suggest_offer';
  out.suggest_response = text;
  const isCsOrder = (q?.routing?.suggested_team === 'customer_service'
                  && q?.routing?.suggested_agent === 'order_enquiries');
  out.suggest_quick_reply = (axis === 'date' && isCsOrder ? [...values] : [...values, YES, NO])
    .map(s => String(s).replace(/,/g, '')).join(',');
  out.suggest_last_result_set = picks.map((a, i) => ({
    idx: i + 1, label: a.value, value: a.value, product: a.value,
    display: a.display || a.value, order_number: a.order_number || null,
  }));
  return out;
}

// ── uuid-coded alternatives → numbered mode (defensive; never leak a uuid) ──
// Prefer display name; drop alternatives whose value is a uuid with no display.
const altPicks = rawPicks
  .map(a => ({ a, label: isUuid(a.value) ? (a.display || null) : a.value }))
  .filter(p => p.label);
if (altPicks.length === 0) return out;   // nothing renderable → escalate-only

const numbered = altPicks.map((p, i) => `${i + 1}. ${p.label}`).join('\n');
out.suggest_offer = true;
out.suggest_selection_context = 'suggest_offer';
out.suggest_response =
  `No ${noun} for ${askedCode}. Here are the closest matches:\n${numbered}\n` +
  `Reply with a number to continue, or would you like me to escalate to ${team} team?`;
const altNums = altPicks.map((_, i) => String(i + 1));
out.suggest_quick_reply = [...altNums, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
out.suggest_last_result_set = altPicks.map((p, i) => ({
  idx: i + 1, label: p.label, value: p.label, product: p.a.value,
  uuid: p.a.uuid || null, display: p.a.display || p.label, order_number: p.a.order_number || null,
}));
return out;

