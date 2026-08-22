// ── promo-picker ─────────────────────────────────────────────────────────────
// S5 of plans/promotion-picker-plan.md + D5 of plans/access-tier-ask-plan.md.
//
// S4 (list-then-pick) is REMOVED (D5, user-locked: "send them all"). Every promotion
//   answer now ATTACHES its file(s) immediately — the tier ask upstream (tier-gate/If4)
//   is what bounds the count, replacing the entitlement-union blowup that S4 was built
//   against (15 files, because the union spanned all 7 access types). The roster is still
//   published so follow-up numbers keep addressing the list the customer sees (TA-8).
// S5 (pick): a positional reply ("1", "1 and 2", "1,2", "all") re-runs the same scoped
//   query and sends ONLY the picked promotions' files — kept as the VESTIGIAL lane for
//   sessions that still hold an old list-turn roster.
//
// D2 is preserved by construction: exactly ONE promotion falls through untouched, so the
// single-hit path still attaches its file immediately. Zero promotions also falls through
// to the existing not-found handling.
//
// ⚠️ WHY POSITIONS AND NOT promotion_ids: `answers[]` from get-results carry NO uuid
// (verified exec 11827379 — `last_result_set[].uuid` is null for every promotion row). The
// plan's Q14 said "re-call MCP with promotion_ids"; there are no ids to pass. The pick turn
// therefore re-runs the SAME query (the scope entity is carried in state) and selects from
// the fresh result set. That still satisfies Q14's actual requirement — nothing stale is
// reused, files are presigned at send time — it just keys on position + name, not uuid.
const j      = $input.first().json;
const parser = $("Call 'sub-query-reformulator'").first().json.output ?? {};
// Q23: the customer named an access level they do not hold. disallowed-entity-gate detects it
// and we still show their real entitlement — but the reply must SAY so, or an entitlement
// problem reads as a generic "not found".
const _notice = (() => {
  try { const g = $('disallowed-entity-gate'); return g.isExecuted ? String(g.first().json.access_notice || '') : ''; }
  catch (e) { return ''; }
})();
const withNotice = t => _notice ? `${_notice}\n\n${t}` : t;
// HOISTED (D10): the escalation team was derived further down, but the brand-gate guard below
// has to render an offer BEFORE any exit path, including the unrecognised-shape one. Pure move,
// same expression, same fallbacks — the strict-not-found block still reads this one binding.
const _escTeam = (() => {
  try {
    const g = $('disallowed-entity-gate');
    if (g.isExecuted && g.first().json.company_team) return g.first().json.company_team;
  } catch (e) { /* fall through */ }
  return (parser.routing && parser.routing.suggested_team) || 'marketing_promotion_sorento';
})();

if ((parser.domain_hint ?? null) !== 'promotion') return j;

// N1 — ENVELOPE SHAPE. `crossdomain-zeroset` (our immediate downstream) reads the item flat,
// but `central-exchange` unwraps `input.output`. If a wrapped envelope ever reaches here, reading
// `env.answers` yields undefined, this node no-ops and EVERY attachment flows on untouched — the
// failure is fail-OPEN and looks like success. Tolerate both shapes, and if neither is
// recognisable, suppress rather than dump.
const env     = (j && typeof j.output === 'object' && j.output !== null) ? j.output : j;
const rawAns  = Array.isArray(env.answers) ? env.answers : null;
const atts    = Array.isArray(env.attachments) ? env.attachments : [];
const norm    = s => String(s ?? '').trim().toLowerCase();

// ── D10 — THE BRAND GATE FAILS CLOSED HERE, IN n8n ────────────────────────────
// The customer named a brand they hold no entitlement for. tier-gate already sent
// `access_levels: []` to the CRM — but the FIRST build stopped there, on a comment asserting
// "[] makes the CRM return nothing" as fact. It is undocumented, it was never verified, and the
// tester could not verify it (brand_gate_empty is unreachable for any contact holding all three
// brands). Measured under replay (exec 12041565): with a non-empty CRM response the pipeline
// rendered the answer and emitted SIX Sorento PDFs against a Cabana ask, under a notice saying
// the customer has no Cabana access. An access boundary may not be enforced by another system's
// empty-filter semantics.
//
// So: suppress the answer block and EVERY attachment locally, regardless of what came back.
// Notice + escalation offer only. This runs BEFORE the shape check and before every other
// branch, so no exit path — including the unrecognised-envelope one — can leak a file.
// Consequence worth stating: the guard makes the CRM's []-behaviour irrelevant to safety, which
// is why TA-11's true negative (a contact whose brands exclude the queried one) is no longer a
// prerequisite for shipping — n8n now denies without asking the CRM anything.
const _brandGateClosed = (() => {
  try { const g = $('disallowed-entity-gate'); return g.isExecuted && g.first().json.brand_gate_empty === true; }
  catch (e) { return false; }
})();
if (_brandGateClosed) {
  const _deny = `${_notice || 'You do not have access to the brand you asked about.'}\n\n` +
                `Would you like me to escalate to ${_escTeam} team?`;
  env.answers          = [];
  env.attachments      = [];
  env.response         = _deny;
  env.response_intro   = _deny;
  // no roster: a stray "1" must not pick a row the customer was never allowed to see
  env.suggest_last_result_set   = [];
  env.suggest_selection_context = null;
  j._brand_gate_closed = true;
  return j;
}

if (rawAns === null) {
  // Shape not understood. Falling through would send every PDF at once, which is precisely the
  // behaviour this node exists to prevent — so fail CLOSED and say so.
  if (atts.length > 1) {
    env.attachments   = [];
    env.response_intro = 'I found several promotions but could not list them. Please narrow your search.';
    env.response       = env.response_intro;
  }
  j._promo_picker_shape = 'unrecognised';
  return j;
}
const answers = rawAns;

// ── S4b — deterministic order: latest END DATE first ────────────────────────────
// The plan said "no cap, newest at top" and nothing implemented it, so the list arrived in
// whatever order the CRM returned. Measured (exec 11894212, "promotion for SRTBF11834"): a promo
// ending 2026-10-10 sat at position 3, under two flyers ending 2026-09-30.
//
// Sorting here — not downstream — is load-bearing for TWO reasons:
//   1. `attachments[i]` is index-paired with `answers[i]` (verified: 7/7 and 15/15 on real runs),
//      so the permutation MUST be applied to both or every pick sends the wrong file.
//   2. the pick lane re-runs the query and indexes into `answers`, so both lanes have to see the
//      same order or position N means two different rows across two turns. Sorting BEFORE the
//      positional filter makes the roster stable against CRM ordering changes, which is stronger
//      than what we had.
// Both arrays are mutated IN PLACE: `answers`/`atts` alias `env.answers`/`env.attachments`, and
// splice keeps every downstream reference (renderBlocks, labelOf, the roster) pointed at the
// sorted view without renaming anything.
const _fieldOf = (a, label) => {
  const f = (a && Array.isArray(a.fields) ? a.fields : []).find(x => norm(x.label) === label);
  return f ? String(f.value ?? '').trim() : '';
};
// ISO yyyy-mm-dd sorts correctly as a string; anything unparseable sorts LAST rather than
// silently landing at the top as an empty string would under a naive descending compare.
const _dateKey = (a, label) => {
  const v = _fieldOf(a, label);
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null;
};
const _order = answers.map((a, i) => i).sort((x, y) => {
  const ex = _dateKey(answers[x], 'end date'), ey = _dateKey(answers[y], 'end date');
  if (ex !== ey) { if (ex === null) return 1; if (ey === null) return -1; if (ex > ey) return -1; if (ex < ey) return 1; }
  const sx = _dateKey(answers[x], 'start date'), sy = _dateKey(answers[y], 'start date');
  if (sx !== sy) { if (sx === null) return 1; if (sy === null) return -1; if (sx > sy) return -1; if (sx < sy) return 1; }
  return x - y;                      // stable: equal dates keep the CRM's own order
});
const _reordered = _order.some((src, dst) => src !== dst);
const _pairable  = atts.length === answers.length;
if (_reordered) {
  const _a = _order.map(i => answers[i]);
  answers.splice(0, answers.length, ..._a);
  if (_pairable) { const _t = _order.map(i => atts[i]); atts.splice(0, atts.length, ..._t); }
}
j._promo_sort = { reordered: _reordered, pairable: _pairable, order: _order };

// ── per-product itemization ───────────────────────────────────────────────────
// `promo for CBS212-WH & SRTBF11834` returned 7 promotions, every one of them SRTBF11834's, under
// a heading naming both products — so the customer cannot tell the list does not answer for
// CBS212-WH at all. Stock already decomposes per product ("dym-zerostock-itemize"); promotions did
// not. Measured on exec 11917322.
//
// The linkage is already on the wire: every promotion match carries `display.products`. So for
// each product the customer NAMED, ask whether any promotion we are about to show lists it. Join
// on the promotion DESCRIPTION, because that is the only key the answer rows and the resolver
// matches share — answers carry no uuid at this layer (see the header).
//
// Display-only: it appends a sentence and touches neither `answers`, nor the roster, nor the
// positional contract. A wrong join can therefore mislead but can never send the wrong file.
// the promotions we are about to SHOW, by description — populated before the join below, or the
// closure would read an empty set and report every product as unmatched.
const _shownNames = new Set(answers.map((a) => {
  const f = (a.fields || []).find(x => norm(x.label) === 'promotion');
  return norm(a.title || (f && f.value) || '');
}).filter(Boolean));
const _namedProducts = [];
// Unmet scope, generalised beyond products. For EVERY token the customer named, ask whether any
// promotion we are about to show came from THAT token's own resolution. A token that contributed
// nothing was not answered — whether it has no promotions (CBS212-WH) or the resolver silently
// dropped it to keep the query non-empty (bathtub, where AND produced zero and it fell back to OR
// on the Cabana arm alone).
//
// Per-token `resolutions[].matches` is the attribution the earlier product-only join lacked:
// exec 11917835 shows token "Cabana" with 15 promotion matches and token "bathtub" resolving to a
// PRODUCT literally coded BATHTUB with none. `display.products` is kept as a second signal for the
// via_product shape, where a promotion is reached THROUGH a product token.
const _unmatchedProducts = (() => {
  let R = null;
  try { R = $('resolve-entity').isExecuted ? $('resolve-entity').first().json : null; } catch (e) { R = null; }
  if (!R) return [];
  const tokens = (Array.isArray(R.tokens) ? R.tokens : []).map(t => String(t ?? '').trim()).filter(Boolean);
  const perToken = new Map();
  for (const res of (R.resolutions || [])) {
    if (!res || !res.token) continue;
    perToken.set(norm(res.token), (res.matches || []).filter(m => m && m.entity_type === 'promotion'));
  }
  // every promotion match anywhere, for the via_product fallback signal
  const allPromo = [];
  const push = (arr) => { for (const m of (arr || [])) if (m && m.entity_type === 'promotion') allPromo.push(m); };
  push(R.intersection); push(R.by_entity_type && R.by_entity_type.promotion);
  for (const res of (R.resolutions || [])) push(res && res.matches);
  const contributed = (tok) => {
    const k = norm(tok);
    const own = perToken.get(k) || [];
    if (own.some(m => _shownNames.has(norm(m.display && m.display.description)))) return true;
    // reached THROUGH this product token (display.products names it)
    return allPromo.some(m => {
      const ps = (m.display && Array.isArray(m.display.products)) ? m.display.products : [];
      return ps.some(p => norm(p) === k) && _shownNames.has(norm(m.display && m.display.description));
    });
  };
  const unmet = tokens.filter(t => !contributed(t));
  // if NOTHING contributed, this is not a partial miss — the not-found path owns it
  return unmet.length === tokens.length ? [] : unmet;
})();
// ── DISJOINT UNION ───────────────────────────────────────────────────────────
// Every named token contributed rows, yet NO row satisfies all of them — so the list is the union
// of disjoint per-token sets and answers none of them. `cabana kitchen tap promo` (exec 11963256):
// token "Cabana" 15 promotion matches, token "kitchen tap" 6, `intersection` promotion rows **0**.
// Six promotions shown, not one of them a Cabana kitchen tap promo, because none exists.
//
// The per-token miss check above is structurally blind to this — it fires only when a token
// contributed NOTHING, and here both contributed. The CRM's `token_coverage` is blind too: it
// pools blobs within an entity type, so every word counts matched. The signal that does work was
// on the wire the whole time — an EMPTY `intersection` beside non-empty per-token matches is
// exactly "no single row matches all", and needs no CRM change.
const _disjointTokens = (() => {
  let R = null;
  try { R = $('resolve-entity').isExecuted ? $('resolve-entity').first().json : null; } catch (e) { R = null; }
  if (!R) return [];
  const toks = (Array.isArray(R.tokens) ? R.tokens : []).map(t => String(t ?? '').trim()).filter(Boolean);
  if (toks.length < 2) return [];                       // a lone token cannot be disjoint with itself
  const own = new Map();
  for (const res of (R.resolutions || [])) {
    if (!res || !res.token) continue;
    own.set(norm(res.token), (res.matches || []).filter(m => m && m.entity_type === 'promotion').length);
  }
  // EVERY named token must have contributed promotions of its own. If one contributed nothing that
  // is the per-item case above, which says something more specific — let it win.
  if (!toks.every(t => (own.get(norm(t)) || 0) > 0)) return [];
  const inter = (Array.isArray(R.intersection) ? R.intersection : [])
    .filter(m => m && m.entity_type === 'promotion');
  return inter.length === 0 ? toks : [];                 // non-empty ⇒ rows DO satisfy all tokens
})();

// the resolver says so itself when it dropped a constraint to keep the query non-empty
const _broadened = (() => {
  try { return $('resolve-entity').isExecuted && $('resolve-entity').first().json.fallback_applied === true; }
  catch (e) { return false; }
})();
const labelOf = (a, i) => {
  const f = (a.fields || []).find(x => norm(x.label) === 'promotion');
  return String(a.title || (f && f.value) || `promotion ${i + 1}`).trim();
};

// `response` is the PRE-RENDERED customer string. Filtering answers[]/attachments[] alone is
// invisible to the customer — they read `response`, so this node must own it too. (Measured:
// picking "1 and 2" sent exactly 2 files while the text still listed all 15.)
const renderBlocks = list => list.map((a, i) => {
  const lines = (a.fields || []).map(f => `*${f.label}:* ${f.value}`).join('\n');
  return `${i + 1}. ${lines}`;
}).join('\n\n');
// Swap ONLY the leading intro paragraph, leaving the LLM's own rendering intact. If the head
// is not the intro we expected, rebuild rather than blindly slicing.
const reintro = (resp, oldIntro, newIntro) => {
  const s = String(resp || '');
  const head = s.split('\n\n')[0];
  return (oldIntro && head.trim() === String(oldIntro).trim())
    ? [newIntro, s.slice(head.length).replace(/^\n+/, '')].filter(Boolean).join('\n\n')
    : null;
};

// ── S5 — positional pick ────────────────────────────────────────────────────
// The parser already turns "1 and 2" / "all" into reference_positions (1-based) against
// the previous turn's roster; "all" is expanded upstream by the existing ALL handler,
// which is gated on selection_context === 'suggest_offer' — the value S4 sets below.
// Positions are only meaningful against the roster the parser says they index. On a dym pick
// the LLM emits the candidate's DYM slot (reference_target 'dym', live 12090093: "SRTW2600" ->
// [2]) and output_exchange has already spent it resolving the entity — applying it again here
// indexed slot 2 into a 1-row promotion result and told the customer "reply with a number
// between 1 and 1".
const positions = (parser.reference_target === 'dym' || parser.dym_pick_applied === true)
  ? []
  : Array.isArray(parser.reference_positions)
    ? parser.reference_positions.map(Number).filter(n => Number.isInteger(n) && n >= 1)
    : [];

if (positions.length > 0 && answers.length > 0) {
  // The parser resolves a pick into ENTITIES as well as reference_positions, so on the
  // stateful lane the re-query already comes back narrowed to exactly what was picked.
  // Applying the positions again would double-filter: picking "3" narrowed answers to 1,
  // then position 3 fell out of range and the customer was told "there is only 1 promotion"
  // (reproduced through the chat console, exec 11871980).
  //
  // Distinguisher is PROVENANCE, not set arithmetic. The earlier size-comparison heuristic
  // (`answers.length <= positions.length`) was wrong in both directions:
  //   • "1, 2 and 7" on a 3-item list -> 3 <= 3 -> passed ALL THREE files through, including
  //     one never picked, and reported no out-of-range.
  //   • a promotion did-you-mean pick also lands here, and re-applying positions to the
  //     candidate's own results silently discards rows.
  // The real signal: when the parser resolved the pick into PROMOTION entities, the query has
  // already come back narrowed to exactly what was picked, so there is nothing left to filter.
  // When our scope-reuse ran instead, entities are the product/category scope and the answers
  // are the full list, which must be filtered positionally.
  // ...but "entities are promotion-hinted" alone is NOT enough: a list scoped BY A PROMOTION
  // NAME (Q25 allows it) also has promotion-hinted entities, and treating that as pre-narrowed
  // passed the WHOLE list through on every pick (measured: positions [2] -> matched 4, files 4).
  // The parser states its own provenance: when it reused the previous scope, this turn's answers
  // are the FULL list and must be filtered positionally. Trust that flag over the shape.
  const _scopeReused = parser._promo_pick_scope_reused === true;
  const _pickedEntities = !_scopeReused && (Array.isArray(parser.entities) ? parser.entities : [])
    .some(e => String((e && e.hint) || '').toLowerCase() === 'promotion');
  if (_pickedEntities) {
    env.response_intro = withNotice(atts.length
      ? 'I have attached the file(s) below.'
      : 'No file is attached to that promotion. Here are its details.');
    if (_notice && env.response) env.response = withNotice(String(env.response));
    // F4: this is the branch "all" takes. Without republishing the roster + context,
    // compile-current-state's promo arm is skipped, selection_context reverts to null and a
    // SECOND "all" no longer expands (the parser's ALL handler gates on suggest_offer).
    env.suggest_last_result_set = answers.map((a, i) => ({
      idx: i + 1, label: labelOf(a, i), value: labelOf(a, i),
      uuid: null, entity_type: 'promotion', filename: (atts[i] || {}).filename ?? null,
    }));
    env.suggest_selection_context = 'suggest_offer';
    j._promo_pick = { positions, matched: answers.length, files: atts.length,
                      out_of_range: [], drift: [], pre_narrowed: true };
    return j;
  }

  const keep      = new Set(positions);
  const pickedIdx = answers.map((_, i) => i + 1).filter(n => keep.has(n));
  const pickedAns = pickedIdx.map(n => answers[n - 1]).filter(Boolean);

  // answers[] and attachments[] are INDEX-ALIGNED — that is the contract, and matching by
  // name instead is actively wrong: the answer title is an LLM-normalised copy of the
  // filename with punctuation dropped ("PROMO_11052026 (2) OFFICE.pdf" arrives as
  // "PROMO_11052026 2 OFFICE.pdf"). Measured on exec 11827379: exact-name matching resolved
  // only 8 of 15 rows and silently sent nothing for the other 7.
  // `loose` compares alphanumerics only, so it is a real cross-check rather than a
  // punctuation test; a mismatch is RECORDED, never silently corrected.
  const loose  = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // N2 — the parser resolves positions against the PERSISTED roster and passes the labels it
  // picked. Prefer those over a raw index into this turn's answers: indexing assumes the re-run
  // returned rows in the same order as the turn that built the roster, which nothing guarantees.
  // A CRM ordering change would otherwise send the wrong file with no signal at all.
  const _pickLabels = (Array.isArray(parser._promo_pick_labels) ? parser._promo_pick_labels : [])
    .map(loose).filter(Boolean);
  const byName = new Map(atts.map(a => [loose(a.filename), a]));
  const drift  = [];
  // roster-label validation: if the parser told us WHICH labels were picked, resolve by those.
  if (_pickLabels.length > 0) {
    const byLabel = new Map(answers.map((a, i) => [loose(labelOf(a, i)), i]));
    const mapped  = _pickLabels.map(l => byLabel.has(l) ? byLabel.get(l) : -1);
    const missing = mapped.filter(i => i < 0).length;
    if (missing === 0) {
      const idxs = mapped.map(i => i + 1);
      pickedIdx.length = 0; pickedIdx.push(...idxs);
      pickedAns.length = 0; pickedAns.push(...idxs.map(n => answers[n - 1]));
    } else {
      // labels no longer present — the set genuinely changed. Say so rather than guess.
      j._promo_pick_label_miss = missing;
    }
  }

  const pickedAtts = pickedIdx.map((n, k) => {
    const at  = atts[n - 1];
    const lbl = loose(labelOf(pickedAns[k], k));
    if (at && loose(at.filename) === lbl) return at;
    if (byName.has(lbl)) { drift.push({ idx: n, resolved_by: 'name' }); return byName.get(lbl); }
    if (at) { drift.push({ idx: n, resolved_by: 'index', label_mismatch: true }); return at; }
    drift.push({ idx: n, resolved_by: 'none' });
    return null;
  }).filter(Boolean);

  // Every picked position is past the end of the list: say so plainly. Falling through would
  // emit "No file is attached to that promotion", which describes a DIFFERENT situation (Q5)
  // and reads as though the promotion exists.
  if (pickedAns.length === 0) {
    const only = `There ${answers.length === 1 ? 'is' : 'are'} only ${answers.length} ` +
                 `promotion${answers.length === 1 ? '' : 's'} in that list, ` +
                 `please reply with a number between 1 and ${answers.length}.`;
    env.answers = []; env.attachments = [];
    env.response = withNotice(only); env.response_intro = withNotice(only);
    j._promo_pick = { positions, matched: 0, files: 0,
                      out_of_range: positions.filter(n => n > answers.length), drift: [] };
    return j;
  }

  // Keep publishing the FULL-list roster on a pick turn. Without this,
  // compile-current-state rebuilds last_result_set from the (filtered) answers, the roster
  // collapses to the one promotion just sent, and EVERY later number returns that same file
  // — reproduced end-to-end: 7 listed, "5" correct, then "3" returned #5 again.
  // The customer's numbers must keep addressing the list they are looking at (plan Q3).
  env.suggest_last_result_set = answers.map((a, i) => ({
    idx: i + 1,
    label: labelOf(a, i),
    value: labelOf(a, i),
    uuid: null,
    entity_type: 'promotion',
    filename: (atts[i] || {}).filename ?? null,
  }));
  env.suggest_selection_context = 'suggest_offer';

  env.answers     = pickedAns;
  env.attachments = pickedAtts;
  // Q5: a picked promotion with no file still answers — with its details as text.
  const _pickIntro = pickedAtts.length
    ? 'I have attached the file(s) below.'
    : 'No file is attached to that promotion. Here are its details.';
  env.response_intro = withNotice(_pickIntro);
  // rebuilt, not sliced: the set itself changed, so the old rendering is wrong line by line
  env.response = withNotice([_pickIntro, renderBlocks(pickedAns)].filter(Boolean).join('\n\n'));
  j._promo_pick = { positions, matched: pickedAns.length, files: pickedAtts.length,
                    out_of_range: positions.filter(n => n > answers.length),
                    drift };
  return j;
}

// ── multi-promotion answer: ALWAYS-ATTACH (D5) ──────────────────────────────────
// F6: the Q23 fallback can return exactly ONE promotion. Without this the customer who asked
// for a level they do not hold receives a file from a different level with no explanation.
if (answers.length === 1 && _notice) {
  env.response_intro = withNotice(String(env.response_intro || ''));
  if (env.response) env.response = withNotice(String(env.response));
}

if (answers.length > 1) {
  env.suggest_last_result_set = answers.map((a, i) => ({
    idx: i + 1,
    label: labelOf(a, i),          // BARE — no numbering baked in, or the pick breaks
    value: labelOf(a, i),
    uuid: null,                    // promotions carry none at this layer (see header)
    entity_type: 'promotion',
    filename: (atts[i] || {}).filename ?? null,
  }));
  env.suggest_selection_context = 'suggest_offer';
  // D5 (access-tier-ask-plan): the S4 gate that emptied `attachments` and rendered the
  // pick invite is DELETED — files ride the answer. The roster above stays published so a
  // follow-up "1" / "the august one" resolves against exactly what the customer received.
  // ── scope echo ──────────────────────────────────────────────────────────────
  // "I found 10 promotions." does not say 10 promotions for WHAT. Echo the scope the customer
  // actually typed (`entity.raw`) and never a canonical code: "6047" resolved to TWO products
  // (SRTKS6047-NEW and SRTKS6047-BL-NEW), so naming one of them would tell the customer we
  // searched something they did not ask for. A promotion-NAME scope (Q25 allows it) yields a
  // filename-length raw, hence the 60-char bound — past that the echo is noise and is dropped
  // rather than truncated, because a half-printed promotion name reads like a different one.
  const _scopeLabel = (() => {
    // Never echo a scope the list does NOT answer for. "I found 4 promotions for Cabana, bathtub"
    // above a list with no bathtub in it is the headline stating the very thing the note below
    // has to retract. Unmet tokens are dropped here and named in the note instead.
    const _unmet = new Set(_unmatchedProducts.map(t => String(t).trim().toLowerCase()));
    const raws = [];
    for (const e of (Array.isArray(parser.entities) ? parser.entities : [])) {
      const v = String((e && e.raw) || '').trim();
      if (_unmet.has(v.toLowerCase())) continue;
      if (v && !raws.some(x => x.toLowerCase() === v.toLowerCase())) raws.push(v);
    }
    const s = raws.slice(0, 3).join(', ');
    return s.length > 60 ? '' : s;
  })();
  const _listIntro =
    `I found ${answers.length} promotions${_scopeLabel ? ` for ${_scopeLabel}` : ''}. ` +
    `I have attached the file(s) below.`;
  // `reintro` reuses the LLM's own rendering and swaps only the leading paragraph — which is
  // correct ONLY while the rows are still in the order the LLM rendered them. Once S4b permutes
  // `answers`, that body is stale: the customer would read the CRM's order while the roster (and
  // therefore every pick) is keyed to the sorted one. Off-by-N on which PDF gets sent. So a
  // reordered turn REBUILDS the body from the sorted rows.
  //
  // Rebuilding drops whatever trailing matter the LLM appended, of which the freshness stamp is
  // the one the customer actually uses ("Data last updated: …"). Carry it across verbatim.
  const _tail = (String(env.response || '').match(/_Data last updated:[^\n]*_/) || [null])[0];
  const _swapped = _reordered ? null : reintro(env.response, env.response_intro, _listIntro);
  env.response       = withNotice(_swapped !== null
    ? _swapped
    : [_listIntro, renderBlocks(answers), _tail].filter(Boolean).join('\n\n'));
  env.response_intro = withNotice(_listIntro);
  j._promo_picker  = { count: answers.length, intro_swapped: _swapped !== null, rebuilt: _reordered };
}

// Append the per-product miss note LAST, so it survives whichever branch above wrote `response`
// (list, pick, pre-narrowed) and reads at the end of the reply rather than under one product's
// rows. Display-only — `answers`, `attachments` and the roster are untouched.
// ── STRICT NOT-FOUND (user decision 2026-08-11, twice affirmed) ──────────────────
// When the customer's actual COMBINATION has no satisfying rows, say so and stop. No "closest
// matches", no cross-brand suggestions — measured live, those lists read as unrelated noise
// ("cabana kitchen tap" was offering SORENTO rows and CABANA WASH BASIN). An earlier build kept
// the union as "closest matches"; the user overruled it: a plain miss is less confusing than a
// helpful-looking list that does not answer.
//
// Which misses collapse to the plain not-found:
//   • DISJOINT: every token matched something, no row satisfies all (empty AND intersection).
//   • UNMET-WITH-BRAND-ONLY-MET: a token contributed nothing and everything that DID contribute
//     is just the brand arm (met tokens all hint 'brand'). A brand-only list is not an answer to
//     "<brand> <category>".
// Which do NOT collapse:
//   • per-item decomposition between PRODUCT tokens (CBS212-WH & SRTBF11834): the found product's
//     promos ARE an answer to half the ask, and the user explicitly designed that shape (#17).
//
// Typo/multilingual safety (the user's stated worry): a typo'd or foreign word never reaches this
// code as a resolved token — it fails resolution and rides the trgm/alternatives path with
// similarity evidence, or the parser canonicalizes it upstream. Only cleanly-resolved tokens can
// trigger the strict miss, so the false-not-found direction stays closed.
const _tokenHint = (() => {
  const m = new Map();
  for (const e of (Array.isArray(parser.entities) ? parser.entities : [])) {
    if (e && e.raw) m.set(norm(e.raw), String(e.hint || '').toLowerCase());
  }
  return m;
})();
// ── word-level unmet, from the CRM's own honesty field (wired 2026-08-11) ─────
// `token_coverage` landed with sorento-crm PR #121. For each token it names which of the
// customer's WORDS matched no shown promotion. Measured (exec 12005497, "cabana shower set"):
// token "shower set" -> matched ["set"], unmatched ["shower"] — `set` was a SUBSTRING hit on
// WATER CLO*SET*, and the customer got a water-closet PDF as if it answered. A token with
// unmatched words is unmet at word level, whatever the intersection says.
//
// Contract traps, all honoured (plans/crm-ask-promotion-description-match.md):
//   • promotion entry ABSENT = no claim (membership-derived rows) -> not consulted
//   • truncated:true = rows trimmed/unscored -> cannot claim, skipped (fail-open)
//   • field absent entirely (OR path, pre-#121) -> Map empty -> behaviour unchanged
// Typo trade, user-approved: a typo'd word in a multi-word token ("kitchin tap") strict-misses
// WITH the word named — "could not find \"kitchin\"" — so the customer can self-correct, and the
// escalation offer hands the rest to a human. Single-word typos never reach here (they fail
// resolution and ride the trgm/alternatives path).
const _coverageUnmet = (() => {
  let R = null;
  try { R = $('resolve-entity').isExecuted ? $('resolve-entity').first().json : null; } catch (e) { R = null; }
  const m = new Map();
  for (const tc of ((R && R.token_coverage) || [])) {
    if (!tc || !tc.token) continue;
    const cov = (Array.isArray(tc.coverage) ? tc.coverage : []).find(c => c && c.entity_type === 'promotion');
    if (!cov) continue;                       // absence = NO CLAIM, never "no match"
    if (cov.truncated === true) continue;     // trimmed/unscored rows -> cannot claim
    const uw = (cov.unmatched_words || []).map(w => String(w ?? '').trim()).filter(Boolean);
    if (uw.length) m.set(norm(tc.token), uw);
  }
  return m;
})();
const _strictMiss = (() => {
  if (_disjointTokens.length) return { tokens: _disjointTokens, words: [], reason: 'disjoint' };
  if (!_unmatchedProducts.length && !_coverageUnmet.size) return null;
  let R = null;
  try { R = $('resolve-entity').isExecuted ? $('resolve-entity').first().json : null; } catch (e) { R = null; }
  const toks = ((R && R.tokens) || []).map(t => String(t ?? '').trim()).filter(Boolean);
  const unmet = new Set(_unmatchedProducts.map(norm));
  for (const k of _coverageUnmet.keys()) unmet.add(k);   // word-level unmet counts as unmet
  const met = toks.filter(t => !unmet.has(norm(t)));
  // all-unmet with NO coverage evidence stays the not-found path's job (C9); with coverage
  // evidence we know exactly which words failed, so this node states it.
  if (!met.length && !_coverageUnmet.size) return null;
  // every met token is the brand arm ⇒ nothing shown answers the ask ⇒ strict miss
  if (met.every(t => _tokenHint.get(norm(t)) === 'brand')) {
    const words = [...new Set([].concat(...[..._coverageUnmet.values()]))];
    return { tokens: toks, words, reason: _coverageUnmet.size ? 'coverage_unmet' : 'unmet_brand_only' };
  }
  return null;
})();

if (_strictMiss && (env.response || env.response_intro)) {
  const _ask = _strictMiss.tokens.join(' ');
  const _offer = `Would you like me to escalate to ${_escTeam} team?`;
  // name the failing WORDS when the coverage field told us (user: «we will say like cannot find
  // kitchin for clarity») — the customer can self-correct a typo instead of guessing why we missed
  const _detail = _strictMiss.words.length
    ? `: could not find "${_strictMiss.words.join('", "')}"` : '';
  const _msg = `No promotion found for ${_ask}${_detail}. ${_offer}`;
  env.response       = withNotice(_msg);
  env.response_intro = withNotice(_msg);
  env.attachments    = [];               // nothing is being answered; nothing may be sent
  env.answers        = [];
  // no roster: a stray "1" after a not-found must not pick an invisible row
  env.suggest_last_result_set  = [];
  env.suggest_selection_context = null;
  j._promo_notfound = { tokens: _strictMiss.tokens, words: _strictMiss.words, reason: _strictMiss.reason };
  j._promo_disjoint = _disjointTokens.length ? _disjointTokens : undefined;
  j._promo_unmatched = _unmatchedProducts.length ? _unmatchedProducts : undefined;
} else if (_unmatchedProducts.length && (env.response || env.response_intro)) {
  // per-item decomposition (#17) — product tokens, at least one answered with its own promos
  const _note = `No promotion found for ${_unmatchedProducts.join(', ')}.`;
  const _offer = `Would you like me to escalate to ${_escTeam} team?`;
  if (env.response) env.response = `${env.response}\n\n${_note} ${_offer}`;
  j._promo_unmatched = _unmatchedProducts;
  j._promo_broadened = _broadened;
}

return j;
