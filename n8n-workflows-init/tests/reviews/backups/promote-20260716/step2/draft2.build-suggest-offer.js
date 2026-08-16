// ── build-suggest-offer (D1/D2/D3) ────────────────────────
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
// dym-candidate-map scoping: a did-you-mean candidate must be an ENTITY-CODE correction, never
// a date-relaxation alternative. isDateLike detects an ISO/day-month-year value so we never build
// (or later match) a dym entry keyed on a date the bot itself invited ("reply with a date").
const isDateLike   = (s) => { const v = String(s ?? '').trim(); return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(v); };
const isCodeShaped = (s) => { const v = String(s ?? '').trim(); return v.length > 0 && /[a-z0-9]/i.test(v) && !isDateLike(v); };

// ── D3: incoming sibling-family picker (empty-exact incoming miss) — PHASE 1 ──
// Fires ONLY when sibling-gate routed the not-found through family-fetch →
// sibling-transform → sibling-probe (all isExecuted). Reuses the shipped suggest_offer
// envelope so the pick/escalate round-trip is the already-proven suggest-follow-up path
// (NO reformulator edit). When sibling-probe/-transform did not run (ambiguous incoming
// picker path, or sibling-gate FALSE), D3 is inert and D1/D2 behave byte-identically.
// PHASE-2 SEAM: multi-product family union (family-loop) not built — single base only.
{
  const sibXfRan    = (() => { try { return $('sibling-transform').isExecuted; } catch (e) { return false; } })();
  const sibProbeRan = (() => { try { return $('sibling-probe').isExecuted; } catch (e) { return false; } })();
  const domIncoming = (q && q.domain_hint === 'incoming')
    || (gate && gate.gate_debug && gate.gate_debug.domain === 'incoming');
  if (sibXfRan && sibProbeRan && domIncoming) {
    const normC = s => String(s ?? '').trim().toLowerCase();
    const fam = (() => { try { return $('sibling-transform').first().json.siblings; } catch (e) { return null; } })();
    const probe = (() => { try { return $('sibling-probe').first().json ?? {}; } catch (e) { return {}; } })();
    if (Array.isArray(fam) && fam.length) {
      // codes WITH incoming from probe answers (crm_incoming_stock_list returns a row per
      // product that HAS incoming; title / "Product Code" field = the code). Same machinery
      // as annotate-incoming-picker.
      const answers = Array.isArray(probe.answers) ? probe.answers
                    : (Array.isArray(probe.items) ? probe.items : []);
      const hasInc = new Set();
      for (const a of answers) {
        let c = a && a.title;
        if (!c && a && Array.isArray(a.fields)) {
          const f = a.fields.find(x => /product\s*code/i.test(x && x.label));
          c = f && f.value;
        }
        if (c) hasInc.add(normC(c));
      }
      // dedupe by code; annotate has/no incoming (exact code INCLUDED, annotated too)
      const seenC = new Set();
      const sibs = fam
        .filter(e => e && e.code && !seenC.has(normC(e.code)) && seenC.add(normC(e.code)))
        .map(e => ({ code: String(e.code), uuid: e.uuid || null, has: hasInc.has(normC(e.code)) }));
      // the exactly-resolved product code(s) — family must offer MORE than just these
      const exactCodes = new Set((Array.isArray(gate && gate.compatible_entities) ? gate.compatible_entities : [])
        .filter(e => e && String(e.entity_type).toLowerCase() === 'product' && e.code)
        .map(e => normC(e.code)));
      const extras = sibs.filter(s => !exactCodes.has(normC(s.code)));
      if (extras.length > 0) {
        // ALWAYS a numbered picker whenever ≥1 sibling exists — regardless of has-incoming.
        // (User reversed the earlier anyHasIncoming split: the all-no-incoming family now ALSO
        // shows a numbered list + number-pick invite, not a list-only/escalate-only variant.)
        // SORT: has-incoming first, then code order. NO cap. (Collapses to code-order when none has incoming.)
        sibs.sort((a, b) => (Number(b.has) - Number(a.has)) || String(a.code).localeCompare(String(b.code)));
        const exactList = [...exactCodes].map(c => c.toUpperCase()).join(', ');
        // Numbered list of ALL siblings; number-pick invite active; positional pick armed.
        const numbered = sibs.map((s, i) => `${i + 1}. ${s.code} — ${s.has ? 'has incoming' : 'no incoming'}`).join('\n');
        out.suggest_offer = true;
        out.suggest_selection_context = 'suggest_offer';
        out.suggest_response =
          `No incoming stock (ETA) found for ${exactList}. Related products:\n` +
          `${numbered}\n` +
          `Reply with a number to check its incoming, or reply 'yes' to escalate to ${team} team.`;
        // Uncapped list → NO per-sibling buttons (respond.io button cap); numbers typed.
        // Only Yes/No buttons, comma-stripped so labels don't split.
        out.suggest_quick_reply = [YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
        out.suggest_last_result_set = sibs.map((s, i) => ({
          idx: i + 1, label: s.code, value: s.code, product: s.code, uuid: s.uuid, entity_type: 'product',
        }));
        return out;
      }
      // extras.length === 0 → only the exact code itself; fall through to plain escalate.
    }
  }
}

// ── UUID leak guard (promotion did-you-mean) ───────────────────────
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
    // dym-candidate-map: the source token that produced this did-you-mean, matched to the
    // parser entity whose raw == d1.token (for_hint/for_canonical fallback matchers).
    const _srcEnt = (Array.isArray(q?.entities) ? q.entities : [])
      .find(e => String(e.raw || '').toLowerCase().trim() === String(d1.token || '').toLowerCase().trim());
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
      // dym-candidate-map (numbered mode): key on the pick's CODE (canonical_code), never the label.
      // for_hint = the RESOLVED entity_type (FINDING 2 alignment), falling back to the parser hint.
      out.dym_candidates = picks.map(p => ({
        code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
        for_raw: d1.token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
        for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
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
      // dym-candidate-map (code mode): one entry per offered code → its source token.
      // for_hint = the RESOLVED entity_type (FINDING 2 alignment), falling back to the parser hint.
      out.dym_candidates = picks.map(p => ({
        code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
        for_raw: d1.token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
        for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
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
  // dym-candidate-map (D2 alternatives, non-uuid): per-query linkage askedCode → each alternative code.
  // FINDING-1 FIX: build the map for CODE-corrections ONLY. A date-relaxation offer (axis==='date')
  // invites a DATE reply ("Reply with a date to continue"); mapping those alternatives keyed on the
  // customer (askedCode=customer) let a subsequent date reply hijack tryDymPick and DROP the customer.
  // On the date arm emit nothing (compile-current-state then clears dym_candidates to []); on the code
  // arm defensively drop any date-valued / non-code-shaped candidate.
  if (axis !== 'date') {
    out.dym_candidates = out.suggest_last_result_set
      .map(r => ({
        code: r.product || r.value, uuid: r.uuid || null, entity_type: r.entity_type || null,
        for_raw: askedCode, for_hint: (compat[0] && compat[0].entity_type) || null,
        for_canonical: (compat[0] && (compat[0].code || compat[0].canonical_code)) || null,
      }))
      .filter(c => isCodeShaped(c.code));
  }
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
// dym-candidate-map (D2 alternatives, uuid mode): per-query linkage askedCode → each alternative.
// FINDING-1 FIX (defensive): uuid alternatives are never dates, but mirror the code-only scoping so a
// date-relaxation offer can never produce a dym entry via this arm either.
if (axis !== 'date') {
  out.dym_candidates = out.suggest_last_result_set
    .map(r => ({
      code: r.product || r.value, uuid: r.uuid || null, entity_type: r.entity_type || null,
      for_raw: askedCode, for_hint: (compat[0] && compat[0].entity_type) || null,
      for_canonical: (compat[0] && (compat[0].code || compat[0].canonical_code)) || null,
    }))
    .filter(c => isCodeShaped(c.code));
}
return out;

