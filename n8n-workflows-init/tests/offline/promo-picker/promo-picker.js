// ── promo-picker ─────────────────────────────────────────────────────────────
// S4 + S5 of plans/promotion-picker-plan.md.
//
// S4 (list): a promotion query returning MORE THAN ONE promotion is answered with the
//   numbered list only — attachments are suppressed. Without this the customer receives
//   every matching PDF at once (measured: "promotion for bathroom furniture" -> 15 files
//   in one WhatsApp message, because the entitlement union spans all 7 access types).
// S5 (pick): a positional reply ("1", "1 and 2", "1,2", "all") re-runs the same scoped
//   query and sends ONLY the picked promotions' files.
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

if (rawAns === null) {
  // Shape not understood. Falling through would send every PDF at once, which is precisely the
  // behaviour this node exists to prevent — so fail CLOSED and say so.
  if (atts.length > 1) {
    env.attachments   = [];
    env.response_intro = 'I found several promotions but could not list them — please narrow your search.';
    env.response       = env.response_intro;
  }
  j._promo_picker_shape = 'unrecognised';
  return j;
}
const answers = rawAns;

// ── S4b — deterministic order: latest END DATE first ──────────────────────────
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

// ── S5 — positional pick ──────────────────────────────────────────────────────
// The parser already turns "1 and 2" / "all" into reference_positions (1-based) against
// the previous turn's roster; "all" is expanded upstream by the existing ALL handler,
// which is gated on selection_context === 'suggest_offer' — the value S4 sets below.
const positions = Array.isArray(parser.reference_positions)
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
      : 'No file is attached to that promotion — here are its details.');
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
                 `promotion${answers.length === 1 ? '' : 's'} in that list — ` +
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
    : 'No file is attached to that promotion — here are its details.';
  env.response_intro = withNotice(_pickIntro);
  // rebuilt, not sliced: the set itself changed, so the old rendering is wrong line by line
  env.response = withNotice([_pickIntro, renderBlocks(pickedAns)].filter(Boolean).join('\n\n'));
  j._promo_pick = { positions, matched: pickedAns.length, files: pickedAtts.length,
                    out_of_range: positions.filter(n => n > answers.length),
                    drift };
  return j;
}

// ── S4 — more than one promotion: list, do not send ───────────────────────────
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
  env.attachments   = [];            // the whole point: list first, files only on pick
  // ── scope echo ──────────────────────────────────────────────────────────────
  // "I found 10 promotions." does not say 10 promotions for WHAT. Echo the scope the customer
  // actually typed (`entity.raw`) and never a canonical code: "6047" resolved to TWO products
  // (SRTKS6047-NEW and SRTKS6047-BL-NEW), so naming one of them would tell the customer we
  // searched something they did not ask for. A promotion-NAME scope (Q25 allows it) yields a
  // filename-length raw, hence the 60-char bound — past that the echo is noise and is dropped
  // rather than truncated, because a half-printed promotion name reads like a different one.
  const _scopeLabel = (() => {
    const raws = [];
    for (const e of (Array.isArray(parser.entities) ? parser.entities : [])) {
      const v = String((e && e.raw) || '').trim();
      if (v && !raws.some(x => x.toLowerCase() === v.toLowerCase())) raws.push(v);
    }
    const s = raws.slice(0, 3).join(', ');
    return s.length > 60 ? '' : s;
  })();
  const _listIntro =
    `I found ${answers.length} promotions${_scopeLabel ? ` for ${_scopeLabel}` : ''}. ` +
    `Reply with the number you want — for example "1", "1 and 2", or "all".`;
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

return j;
