// ── build-suggest-offer (D1/D2/D3) ────────
// Sibling downstream of not-found-error-message. ADDITIVE: passes the not-found
// payload through and, when the miss carries CONCRETE candidates, attaches a
// suggestion offer that compile-current-state renders. No candidates → suggest_offer
// stays false and downstream is byte-identical to before this node existed.
// dym-probe-before-offer: on the sibling-gate[1] inbound the payload now arrives via
// dym-transform (gate FALSE) or dym-annotate (gate TRUE). Both PASS THE NOT-FOUND
// PAYLOAD THROUGH and append their own control keys. Strip those keys here so the
// object this node emits is byte-identical to pre-change on every un-annotated path.
// (Deleting appended keys restores the original insertion order too.)
const _DYM_CTRL_KEYS = ['dym_probe_entities', 'dym_candidate_codes', 'dym_excluded_codes',
  'probe_tool', 'probe_noun', 'probe_predicate', 'probe_needed', 'probe_skip_reason',
  'probe_lane', '_dym_probe_input', 'dym_available_codes', 'dym_probe_meta',
  // C3: both emitted UNCONDITIONALLY by dym-transform, which runs on every not-found turn
  // including every non-enabled domain. Omitting them leaked two stray keys into this node's
  // output on most traffic (reviewer F-STRIP). ⚠️ ANY new dym-transform output key must be added
  // here in the same commit that introduces it.
  'dym_capped_codes', 'probe_cap_applied'];
const out  = { ...$input.first().json };
for (const _k of _DYM_CTRL_KEYS) delete out[_k];
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
// dym-single-use-fix: wrap a candidate list in an offer object carrying identity + lifecycle.
//   id     = this spine execution id (turn-unique) → stamped onto the picked entity as dym_slot,
//            giving output_exchange a STABLE handle that survives raw-overwrite across repeated picks.
//   domain = the reformulator domain_hint at build time → drives the domain-switch supersede rule.
//   ttl/picked seed the lifecycle that compile-current-state advances each turn.
// candidates[] shape is UNCHANGED from the shipped map. Returns null for an empty set (no offer).
const _mkOffer = (cands) => (Array.isArray(cands) && cands.length)
  ? { id: String($execution.id), domain: (q && q.domain_hint) || null, ttl: 3, candidates: cands, picked: [] }
  : null;

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

// ── UUID leak guard (promotion did-you-mean) ────────
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

// ── D1: resolution-miss "did you mean" — PER-TOKEN, GENUINE-MISS ONLY ────────
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

// ── honour the gate's document-class narrowing (container-status S1) ────────
// `r` above is bound to the RAW resolver node, so a token the GATE resolved still looks
// unresolved here. Measured: "please send me the container status list" returned the correct
// file AND "Couldn't find 'container status list' — did you mean Packing List, Stock_List,
// container_status" in the same message. The answer was right; the message read as broken.
// Deliberately narrow: only tokens the gate stamped `resolved_by === 'document-class-narrowing'`
// are dropped, so this cannot suppress an ordinary miss.
const _gateResolvedTokens = (() => {
  try {
    const _g = $('disallowed-entity-gate').first().json ?? {};
    return new Set((_g.resolutions ?? [])
      .filter(x => x && x.resolved === true && x.resolved_by === 'document-class-narrowing')
      .map(x => String(x.token ?? '').trim().toLowerCase())
      .filter(Boolean));
  } catch (e) { return new Set(); }
})();

// ── F1 · the CRM's own QUERY-KEYED resolution is NOT a customer token ────────
// Since spec-raw-text-migration `query` IS the customer's whole sentence, the resolution the
// CRM appends for it comes back with `token` == that sentence (MEASURED, exec 12597847). THIS
// node is the one that rendered it back at the customer (MEASURED, exec 12597815):
//     "wall hung basin got SIRIM cert?" — did you mean:
// i.e. their own question, quoted as something we could not find, heading a second overlapping
// candidate list. It is not a customer entity: n8n never sent it as a token.
//
// Identical rule and identical bytes to compile-current-state's — both are spliced from
// tests/offline/spec-answer-honesty/derived-token.js, because two hand-maintained copies of
// this rule is the next LESSONS §63 waiting to happen. Fail-open bounds are documented there.
const _sentTokens = (() => {
  const s = new Set();
  for (const e of (Array.isArray(q.entities) ? q.entities : [])) {
    const k = String((e && e.raw) ?? '').trim().toLowerCase();
    if (k) s.add(k);
  }
  return s;
})();
const _rawTurn = String((() => { try { const _j = $('tf-message').first().json; return String((_j && _j.message && _j.message.message && (_j.message.message.text || (_j.message.message.attachment && _j.message.message.attachment.description))) || ''); } catch (_err) { return ''; } })() ?? '').trim().toLowerCase();
const _isDerivedQueryToken = (tok) => {
  const k = String(tok ?? '').trim().toLowerCase();
  if (!k) return false;
  if (_sentTokens.size) return !_sentTokens.has(k);
  return !!_rawTurn && k === _rawTurn;
};
let missResolutions = [];
if (Array.isArray(r?.resolutions)) {
  missResolutions = r.resolutions.filter(res => res && res.resolved !== true
    && !(Array.isArray(res.matches) && res.matches.some(isExact))
    && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
    && !_isDerivedQueryToken(res.token));
} else if (unresolved.length) {
  missResolutions = [r];   // legacy single-resolution shape
}

// dym-multitoken: accumulate EVERY genuine-miss token that carries candidates (was: break on
// the FIRST such token, silently dropping the other missed tokens from a multi-item miss).
// missResolutions already holds each token's OWN resolution; tokenCandidates(res) already returns
// its OWN matches/alternatives (no cross-token borrowing). Cap the number of missed tokens shown
// at 5 (numbered list stays ≤ 15 with cap3 per token).
let d1s = [];
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) {
      d1s.push({ token: res.token || unresolved[0] || (q?.entities?.[0]?.raw) || 'that item', cands });
    }
  }
  d1s = d1s.slice(0, 5);
}

// ── dym-probe-before-offer: has-it annotation inputs ────────
// dym-annotate (upstream, sibling-gate[1] path only) reports which of the offered
// codes actually HAVE the thing the user asked for. If it did not run, failed, or
// detected an unscoped probe, _dymOk is false and every render below is
// byte-identical to pre-change. This can never dead-end a turn.
// Scope: the single-token D1 CODE mode, the require-specific picker, and — since C3
// (immortal-hint-class) — the MULTI-TOKEN D1 block. Single-token NUMBERED mode and D2
// remain deliberately untouched.
const _dymNorm = (s) => String(s ?? '').trim().toLowerCase();
const _dymAnn = (() => { try {
  const n = $('dym-annotate');
  return n.isExecuted ? (n.first().json || {}) : null;
} catch (e) { return null; } })();
const _dymOk     = !!(_dymAnn && _dymAnn.dym_probe_meta && _dymAnn.dym_probe_meta.ok === true);
const _dymHas    = new Set(_dymOk ? (_dymAnn.dym_available_codes || []).map(_dymNorm) : []);
const _dymProbed = new Set(_dymOk ? (_dymAnn.dym_probe_meta.probed || []).map(_dymNorm) : []);
// The attachment domain's noun comes from the parser's raw word via attachmentNoun()
// ("cert", "certs", "certification" …). Normalise the certificate family for the
// customer-facing suffix ONLY — attachmentNoun() itself is left alone so D2's
// "No {noun} for {code}" text stays byte-identical.
const _dymNounOf = (n) => { const s = String(n ?? '').trim(); return /^cert/i.test(s) ? 'certificate' : (s || 'document'); };
const _dymNoun   = _dymOk ? _dymNounOf(_dymAnn.dym_probe_meta.noun || attachmentNoun()) : null;

// ── dym-probe-before-offer, 4th surface: the REQUIRE-SPECIFIC PICKER ────────
// disallowed-entity-gate renders a numbered "needs to be more specific / please choose"
// list into gate_clarification, which not-found-error-message copies verbatim into
// escalate_message (not-found-error-message.js:175). D1 never fires on these turns
// (requireSpec suppresses it), which is why this surface stayed bare while D1 annotated
// the very same codes — the contradiction the user reported.
// The `incoming` domain already annotates its copy of this picker via
// annotate-incoming-picker; this is the same treatment for the other enabled domains,
// reusing the SAME line regex so the two renderings cannot drift.
// NO reordering — the numbers are the pick affordance; suffixes only.
if (requireSpec && _dymOk && typeof out.escalate_message === 'string' && out.escalate_message) {
  out.escalate_message = out.escalate_message.split('\n').map((line) => {
    const m = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
    if (!m) return line;                                   // header / non-item line
    const k = _dymNorm(m[1]);
    if (!_dymProbed.has(k)) return line;                   // unprobed (e.g. multi-uuid) → BARE
    return line + (_dymHas.has(k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`);
  }).join('\n');
}

// Renderable survivors: a token whose candidates ALL drop via humanLabel (bare uuid, no display
// name) is skipped entirely — not shown, and its idx range is never consumed.
const _survivors = d1s
  .map(block => ({ block, picks: cap3(block.cands).map(m => ({ m, label: humanLabel(m) })).filter(p => p.label) }))
  .filter(s => s.picks.length);

// Route on the SURVIVING-token count: 0 → fall through to D2; 1 → existing single-token block
// (BYTE-IDENTICAL to today, code/uuid split preserved); >1 → new numbered multi-block below.
let d1 = _survivors.length === 1 ? _survivors[0].block : null;

if (_survivors.length > 1) {
  // ── D1 (multi-token): one labelled sub-list per surviving token, global CONTIGUOUS idx. ──
  // Numbered mode subsumes the code/uuid split — humanLabel is rendered for EVERY candidate
  // (promotion/uuid → name, product → code, never a bare uuid), so there is no anyUuid branching
  // on the multi-token path. Numbers are typed → Yes/No are the only buttons.
  let idx = 0;
  const blocks = [];
  out.suggest_last_result_set = [];
  out.dym_candidates = [];
  for (const s of _survivors) {
    const token = s.block.token;
    // dym-candidate-map: each candidate keeps its OWN source token so a code pick replaces the
    // right entity. _srcEnt looked up PER token (parser entity whose raw === this token).
    const _srcEnt = (Array.isArray(q?.entities) ? q.entities : [])
      .find(e => String(e.raw || '').toLowerCase().trim() === String(token || '').toLowerCase().trim());
    const candLines = [];
    for (const p of s.picks) {
      idx += 1;
      const isU = isUuid(p.m.canonical_code);
      // ── C3 (immortal-hint-class): annotate the RENDERED LINE ONLY. ────────
      // No sort is introduced: `idx` still increments once per pick in exactly the same order, so
      // the numbering is preserved BY CONSTRUCTION and §IH-11 clause 3 (strip the suffixes, diff
      // against the pre-change render) holds byte-for-byte.
      // The suffix lands on `candLines`, a local array feeding ONLY suggest_response. It is never
      // applied to `p.label`, so suggest_last_result_set[].label stays BARE and the numbered pick
      // still round-trips on idx/value. dym_candidates (for_raw/for_hint/for_canonical) is a
      // separate statement and is untouched.
      // Unprobed ⇒ BARE, never a misleading `- no`: capped codes, multi-uuid exclusions and
      // unmappable types are all absent from _dymProbed and all render with no suffix.
      const _k = _dymNorm(p.m.canonical_code);
      const _sfx = (_dymOk && _dymProbed.has(_k))
        ? (_dymHas.has(_k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`)
        : '';
      candLines.push(`  ${idx}. ${p.label}${_sfx}`);
      out.suggest_last_result_set.push({
        idx, label: p.label, value: isU ? p.label : p.m.canonical_code,
        product: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
      });
      out.dym_candidates.push({
        code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
        for_raw: token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
        for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
      });
    }
    blocks.push(`"${token}" — did you mean:\n` + candLines.join('\n'));
  }
  out.suggest_offer = true;
  out.suggest_selection_context = 'suggest_offer';
  out.suggest_response =
    `Couldn't find some items:\n\n` + blocks.join('\n') +
    `\n\nReply a number to pick, or 'yes' to escalate to ${team}.`;
  // numbers typed → Yes/No only, comma-stripped so labels don't split into extra buttons.
  out.suggest_quick_reply = [YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
  out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
  return out;
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
      out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
    } else {
      // Code mode: all candidates have real product codes.
      // dym-probe-before-offer: when the has-it probe succeeded AND at least one offered
      // code was actually probed, SORT has-first (same comparator as D3) and render one
      // labelled line per code. The sort runs BEFORE codes / suggest_last_result_set /
      // dym_candidates are derived, so buttons, rendered lines and the pick round-trip
      // stay index-consistent. A code that was NOT probed gets no suffix — never a
      // misleading "no". When the probe is unavailable this whole block is inert and the
      // render below is BYTE-IDENTICAL to pre-change.
      // 🔴 suggest_quick_reply stays BARE CODES — the pick round-trips on that exact
      // button string through output_exchange's tryDymPick. Annotation is text-only.
      const _dymAnnotate = _dymOk && picks.some(p => _dymProbed.has(_dymNorm(p.m.canonical_code)));
      if (_dymAnnotate) {
        picks.sort((a, b) => {
          const ha = _dymHas.has(_dymNorm(a.m.canonical_code)) ? 1 : 0;
          const hb = _dymHas.has(_dymNorm(b.m.canonical_code)) ? 1 : 0;
          // STABLE PARTITION, no tiebreak. Array.prototype.sort is stable, so (hb - ha)
          // alone moves has-first while preserving the resolver's similarity order both
          // within each group and, when nobody has the thing, across the whole list.
          // A localeCompare tiebreak here would alphabetize and destroy that ranking.
          return hb - ha;
        });
      }
      const codes = picks.map(p => p.m.canonical_code);
      if (_dymAnnotate) {
        const _dymLines = picks.map((p, i) => {
          const c = String(p.m.canonical_code);
          const k = _dymNorm(c);
          const sfx = _dymProbed.has(k) ? (_dymHas.has(k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`) : '';
          return `${i + 1}. ${c}${sfx}`;
        }).join('\n');
        out.suggest_response =
          `Couldn't find "${d1.token}". Did you mean:\n${_dymLines}\n` +
          `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
      } else {
        out.suggest_response =
          `Couldn't find "${d1.token}". Did you mean ${humanList(codes)}? ` +
          `Reply with a code to continue, or would you like me to escalate to ${team} team?`;
      }
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
      out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
    }
    return out;
  }
  // All candidates dropped (bare uuid, no display name) → suggest_offer stays false and we
  // fall through to D2 / escalate-only. Never emit an invented or uuid label.
}

// ── D2: data-miss "alternatives" (domain tool alternatives[] + relaxed_axis) ────
// get-results now runs EXACTLY ONCE per turn (tool-loop-removal, 2026-08-03: one tool
// per turn; the per-tool splitOut + splitInBatches fan-out is deleted). The run scan
// below is retained UNCHANGED and self-terminates at run 0 via its own catch -> break,
// so this edit is comment-only. Gate on alternatives != null (never invent).
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
// UUID LEAK (display only): promotions have no product code, so askedCode above IS a uuid and
// the "No {noun} for {askedCode}" templates printed it straight to the customer
// (observed: "No promotion for 3b9d6b74-5d4a-4b9f-b2b6-110599485332. Try: ..."). The existing
// guard covered the CANDIDATES, never the subject.
// askedCode itself is left untouched — it is the dym-candidate-map linkage key (for_raw); only
// the rendered label changes.
const askedLabel = (() => {
  const c0 = compat[0] && (compat[0].code || compat[0].canonical_code);
  if (c0 && !isUuid(c0)) return String(c0);
  const d0 = (compat[0] && compat[0].display) || {};
  const human = d0.description || d0.product_name || d0.name;
  if (human) return String(human);
  const raw = Array.isArray(q?.entities) && q.entities[0] ? q.entities[0].raw : null;
  return raw ? String(raw) : 'that item';
})();

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
    // datemiss-summary: lead with WHAT we resolved (customer + product bullets from
    // not-found-error-message) so a date-relaxation offer still confirms the entities it matched on.
    const _summary = (out.found_summary && String(out.found_summary).trim())
      ? `Here's what you want:\n${String(out.found_summary).trim()}\n\n` : '';
    text =
      `${_summary}No delivery on ${asked}. ${cust} has delivery on ${near}. ` +
      `Reply with a date to continue, or would you like me to escalate to ${team} team?`;
  } else {
    text =
      `No ${noun} for ${askedLabel}. Try: ${values.join(', ')}. ` +
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
    out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
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
  `No ${noun} for ${askedLabel}. Here are the closest matches:\n${numbered}\n` +
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
  out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
}
return out;

