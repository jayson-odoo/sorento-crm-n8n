// output-structurer — generic renderer for the MCP render envelope (view=render)
  // Also handles the raw portal-link shape {token, portal_url} (no view param).
  function safe(s){ try { return JSON.parse(s); } catch (e) { return null; } }
  function asObj(v){ return typeof v === 'string' ? safe(v) : (v && typeof v === 'object' ? v : null); }

  function findPayload(j){
    if (!j) return null;
    if (Array.isArray(j.items) || j.portal_url || j.token) return j;
    for (const k of ['result','response','toolResult','output','json','text']) {
      const o = asObj(j[k]); if (o && (Array.isArray(o.items) || o.portal_url || o.token)) return o;
    }
    if (Array.isArray(j.content)) for (const c of j.content) {
      const o = asObj(c && c.text); if (o && (Array.isArray(o.items) || o.portal_url || o.token)) return o;
    }
    return null;
  }
  function extractEnvelope(j){
    const empty = { items: [], attachments: [], action_links: [], intro: 'No matching results found.',
  has_result: false };
    const p = findPayload(j);
    if (!p) return empty;
    if (Array.isArray(p.items)) return p;                 // render envelope
    if (p.portal_url) {                                   // raw portal-link tool
      return { items: [], attachments: [],
        action_links: [{ label: 'Portal Link', url: p.portal_url, type: 'portal_link' }],
        intro: 'Here is your portal link.', has_result: true };
    }
    return empty;
  }
  function fmtTs(iso){
    if (!iso) return null;
    const d = new Date(iso); if (isNaN(d.getTime())) return null;
    const p = n => String(n).padStart(2,'0');
    const date = `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (h === 0 && m === 0 && s === 0) return date;              // midnight → date only
    return `${date} ${p(h)}:${p(m)}:${p(s)}`;
  }
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  function fmtValue(v){
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string')  return ISO_RE.test(v) ? (fmtTs(v) || v) : v;
    if (typeof v === 'number')  return String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v))       return v.map(fmtValue).join(', ');
    if (typeof v === 'object'){
      const parts = Object.values(v).filter(x => x !== null && x !== undefined && x !== '')
        .map(x => (typeof x === 'object' ? fmtValue(x) : String(x)));
      return parts.length ? parts.join(' — ') : '—';
    }
    return String(v);
  }

  const e = extractEnvelope($('MCP Client1').first().json);

  // ── requested-attribute projection (container-status N1) ────────────────────
  // The CRM dumps every clearance field the caller is entitled to see, by design:
  // "the CRM prevents the leak; n8n prevents the dump" (integration spec §1). The CRM
  // cannot know which of 20 dates answers the question — only the parser knows that.
  //
  // KEY-BASED (rebuilt 2026-08-09). The previous version matched DISPLAY LABELS against a
  // hand-copied 20-row key→label table. That table was drift-by-construction: `227c13d0f`
  // renamed "Estimated Arrival Date" → "ETA" and silently broke a sort in the live spine.
  // sorento_crm_mcp PR #109 now emits `key` on every render field, so the CRM owns the key
  // vocabulary and THERE IS NO COPY HERE TO GO STALE. Do not reintroduce one.
  //
  // CONTRACT: `key` is OMITTED, never null, where a presenter has no source key —
  // test PRESENCE, never `=== null`. Keyed result types today: incoming_stock (both
  // presenters) + stock. Every unkeyed result type passes through WHOLLY untouched, so
  // this cannot regress orders / promotions / products / certificates / attachments.
  //
  // Identity is an allow-list, not a label test: it is short, stable, and shared with the
  // renderers (five nodes look up Product Code, and crossdomain-render sorts on
  // estimated_arrival_date / quantity_on_hand).
  const _IDENTITY_KEYS = new Set([
    'product_code', 'product_name', 'shipment_number', 'shipping_container_number',
    'batch_number', 'remaining_incoming_quantity', 'warehouse_allocations',
    'unallocated_quantity', 'warehouse', 'system_location', 'quantity_on_hand',
    // mc-label (2026-08-17). `company_name` (sorento_crm PR #193) is IDENTITY: it says which
    // company's row this is. The projection above only ever meets it on the incoming_stock
    // envelope, and without this line it would strip the Company field off every row on exactly
    // the answers that exist to show it — a two-company answer would read as a one-company
    // answer. Inert on single-company lookups: the CRM emits no such field there at all.
    'company_name',
  ]);
  let _reqAttrs = [];
  try {
    const _si0 = $('When Executed by Another Workflow').first().json.semantic_input;
    const _si1 = (typeof _si0 === 'string' ? JSON.parse(_si0) : _si0) || {};
    _reqAttrs = Array.isArray(_si1.requested_attributes) ? _si1.requested_attributes : [];
  } catch (err) { _reqAttrs = []; }

  // ETA is kept ALWAYS, asked for or not. It is the public answer to "where is my
  // container" (spec N1.3's no-attribute fallback), and crossdomain-render sorts
  // incoming rows on it — projecting it away would silently reintroduce the
  // jitter-order bug. Every other clearance field is opt-in.
  // FULL TIMELINE (user 2026-08-09). "what's the container status of product A" asks for the whole
  // picture, not one date. The parser emits the sentinel below instead of naming keys.
  // Two suppressions go with it, and they are the point of the feature rather than a detail:
  // a customer who asked for "everything" did not ask for the gatepass, so telling them it is
  // "not recorded yet" is filler, and telling them they may not SEE it is worse — it advertises
  // a restriction in answer to a question they never asked. Timeline shows what exists; it does
  // not itemise what does not. Explicitly naming a field keeps both messages.
  const _isTimeline = _reqAttrs.some(k => String(k ?? '').trim() === '__all__');
  const _keepKeys = new Set(['estimated_arrival_date']);
  for (const k of _reqAttrs) {
    const kk = String(k ?? '').trim();
    if (kk) _keepKeys.add(kk);
  }
  const _hasKey = f => !!f && Object.prototype.hasOwnProperty.call(f, 'key');
  // DEPLOY GUARD. Everything below joins on `key`. If the CRM is not serving keys yet — PR #109
  // unmerged, or merged but the FastMCP process not restarted, since it registers tools at startup —
  // then NO field carries one, `_shownKeys` comes back empty, and every requested attribute would be
  // reported to the customer as "not recorded yet". That is a lie about data that exists, and it
  // would look like a parser bug rather than a deploy gap. So when the envelope is entirely unkeyed,
  // degrade to pre-container-status behaviour: project nothing, say nothing.
  // SCOPE GUARD (added 2026-08-09, pre-emptive against CRM PR #109).
  // Projection must only ever touch the CLEARANCE-gated incoming envelope. #109 keys RESOURCE
  // ATTACHMENTS too (`original_filename`, `uploaded_at`) — keys that are not identity and are never
  // in requested_attributes. Gating on "does anything carry a key" would therefore drop BOTH fields
  // of a document answer and render it with nothing at all. Gate on what the envelope IS, not on
  // whether keys happen to be present.
  // NOTE: `crm_incoming_stock_by_product` ALSO reports result_type 'incoming_stock', so it IS
  // projected. That is a no-op today only because every field it emits (product_code,
  // product_name, shipping_container_number, estimated_arrival_date, batch_number,
  // remaining_incoming_quantity, warehouse_allocations, unallocated_quantity) is either in
  // _IDENTITY_KEYS or is the always-kept ETA. Add a keyed NON-identity field to that presenter
  // and it will be silently dropped on any turn that named no attribute. Load-bearing.
  // `crm_incoming_stock_shipments` reports 'incoming_shipments' and is doubly excluded — it is
  // not matched here AND its presenter emits unkeyed pairs.
  const _isClearanceEnvelope = String(e.result_type || '') === 'incoming_stock' || !!e.field_vocabulary;
  const _anyKeyed = _isClearanceEnvelope
    && (e.items || []).some(it => (it && it.fields || []).some(_hasKey));
  for (const it of (_anyKeyed ? (e.items || []) : [])) {
    if (!it || !Array.isArray(it.fields)) continue;
    it.fields = it.fields.filter(f => {
      if (!_hasKey(f)) return true;                       // unkeyed result type — untouched
      const k = String(f.key);
      if (_IDENTITY_KEYS.has(k)) return true;             // identity always survives
      if (_isTimeline) return true;                       // timeline: every recorded checkpoint
      return _keepKeys.has(k);                            // clearance is opt-in
    });
  }

  // ── chronological order (user 2026-08-09) ────────────────────────────────────
  // Containers arrive on a timeline and the CRM returns them in no stable order, so the same
  // question could list 26/06 after 01/08. Sort ascending on ETA so the answer reads as a
  // schedule. Rows with NO usable ETA sort LAST, never first — a missing date must not
  // masquerade as "arriving soonest". Ties keep their original order (stable).
  if (_anyKeyed) {
    const _etaOf = it => {
      const f = ((it && it.fields) || []).find(x => _hasKey(x) && String(x.key) === 'estimated_arrival_date');
      const v = f ? String(f.value ?? '') : '';
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : '';   // only a real date sorts; "not recorded yet" does not
    };
    if ((e.items || []).some(_etaOf)) {
      e.items = (e.items || [])
        .map((it, i) => [it, i])
        .sort((a, b) => {
          const A = _etaOf(a[0]), B = _etaOf(b[0]);
          if (A && B) return A < B ? -1 : A > B ? 1 : a[1] - b[1];
          if (A) return -1;
          if (B) return 1;
          return a[1] - b[1];
        })
        .map(x => x[0]);
    }
  }

  // ── timeline field order: dates chronological, sorted IN PLACE ───────────────────────
  // (user 2026-08-09; rewritten 2026-08-18). A timeline should READ as a timeline. The CRM's
  // `_CLEARANCE_PAIRS` order is NARRATIVE, not value-ordered — it lists Loading, ETC and ETD
  // last though they happen BEFORE Collection, so 30/05, 31/05 and 02/06 printed after 04/07.
  // Correct data, unreadable as a sequence. That is the bug this block exists to fix and it is
  // still real: sorting the dates against each other stays.
  //
  // What changed: this used to re-emit `[...facts, ...dates]`, moving EVERY date to the bottom
  // of the row. That silently overrode the CRM's own layout. sorento_crm PR #217 made the CRM
  // lead with the container journey (identity -> ETA/CIDB/gatepass/... -> quantity/allocation),
  // and this block dragged ETA back down below Incoming Quantity, so the merged change had no
  // visible effect on any n8n answer. Field LAYOUT belongs to the CRM — it is the single place
  // that knows the journey — and this node's job is only the SEQUENCE within the date block.
  //
  // So: collect the slots the date fields already occupy, order the dates among themselves,
  // write them back into those same slots. Non-date fields never move. A row with fewer than
  // two dates is untouched entirely, which is the common single-ETA case.
  //
  // A field counts as a date by its VALUE, never by its key name — key names would be another
  // vocabulary to maintain, and `loc` / `stacked` / `free_days_available` are not dates despite
  // sitting among them. `Array.prototype.sort` is stable (ES2019), so Collection Informed and
  // Collection on the same day keep the CRM's sequence.
  if (_isTimeline) {
    const _DATE_RE = /^\d{4}-\d{2}-\d{2}/;
    const _dateOf = f => {
      const v = f && f.value;
      return (typeof v === 'string' && _DATE_RE.test(v)) ? v.slice(0, 10) : null;
    };
    for (const it of (e.items || [])) {
      if (!it || !Array.isArray(it.fields)) continue;
      const slots = [];
      it.fields.forEach((f, i) => { if (_dateOf(f)) slots.push(i); });
      if (slots.length < 2) continue;               // nothing to reorder — leave the row alone
      const sorted = slots.map(i => it.fields[i]).sort((a, b) => {
        const A = _dateOf(a), B = _dateOf(b);
        return A === B ? 0 : (A < B ? -1 : 1);      // stable sort keeps CRM order on ties
      });
      slots.forEach((slot, n) => { it.fields[slot] = sorted[n]; });
    }
  }

  // ── denied vs not-yet-reached (spec §2.3) ───────────────────────────────────
  // "There is no gatepass date yet" is a LIE when the truth is "you may not see it".
  // `field_access` is a SIBLING of items and was being dropped here entirely, which
  // collapsed the distinction the CRM went to some trouble to preserve.
  // `reason` is written for an admin — never quote it at the contact.
  //
  // Now a genuine set comparison: requested keys vs shown keys vs denied keys, same token
  // on all three sides. No label round-trip, so nothing to mistranslate.
  const _deniedMap = new Map(
    ((((e.field_access || {}).denied) || [])
      .map(d => [String((d && d.field) ?? '').trim(), d])
      .filter(([k]) => k))
  );
  // Wording comes from the CRM when it supplies one, else the key is humanised. Deliberately
  // NOT a local vocabulary — a table here is exactly what this rebuild removed.
  // ── PER-ROW absence, GLOBAL denial (user 2026-08-09) ─────────────────────────
  // These are different kinds of fact and must not share a rendering.
  //   ABSENCE is per-ROW data: asked for the ETA delay across four containers, one had it and
  //     three did not. A single trailing "ETA delay: not recorded yet." reads as though it applies
  //     to the whole answer, and the three rows that lack it look simply unaddressed. Measured on
  //     SRTWC286-SH-NEW. So each row states it for itself.
  //   DENIAL is per-CONTACT permission — identical for every row — so it stays ONE line. Repeating
  //     "I can't share the gatepass" under four containers says nothing extra and reads as noise.
  //
  // Label source, in order: whatever the CRM called it on a row that DOES carry the key (so the
  // wording matches the rest of the message exactly), then the denial entry's label if the CRM
  // supplies one, then the key humanised. No local vocabulary table — that is what this rebuild
  // removed, and re-adding one here would reintroduce the same drift.
  const _labelByKey = new Map();
  for (const it of (e.items || [])) {
    for (const f of ((it && it.fields) || [])) {
      if (_hasKey(f) && f.label && !_labelByKey.has(String(f.key))) _labelByKey.set(String(f.key), f.label);
    }
  }
  // `field_vocabulary` is the CRM's own key->label map (top level on incoming envelopes, PR #109),
  // derived from the same source as the rendered labels so the two cannot drift. It is what fixes the
  // no-row-carries-it case: `etd_date` -> "ETD" rather than the humanised "Etd".
  const _vocab = (e.field_vocabulary && typeof e.field_vocabulary === 'object') ? e.field_vocabulary : {};
  const _labelFor = (k, d) => _labelByKey.get(k)
    || _vocab[k]
    || (d && (d.label || d.field_label))
    || String(k).replace(/_date$/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

  if (_anyKeyed && !_isTimeline) {
    for (const it of (e.items || [])) {
      if (!it || !Array.isArray(it.fields)) continue;
      const _have = new Set(it.fields.filter(_hasKey).map(f => String(f.key)));
      for (const k of _reqAttrs) {
        const kk = String(k ?? '').trim();
        if (!kk || _have.has(kk)) continue;
        if (_deniedMap.has(kk)) continue;            // stated once, below — not per row
        it.fields.push({ key: kk, label: _labelFor(kk, null), value: 'not recorded yet' });
      }
    }
  }

  const _accessNotes = [];
  // The `!_isTimeline` here IS LOAD-BEARING. An earlier comment called it belt-and-braces on the
  // reasoning that this loop iterates requested KEYS and timeline mode requests only the sentinel,
  // so `_deniedMap.get()` could never hit. That reasoning is WRONG, and the bug was in the mutation
  // test that "proved" it: `_isTimeline` is `.some(k === '__all__')` — CONTAINS the sentinel, not
  // IS the sentinel alone. The prompt instructs the LLM to emit it alone; that is an instruction,
  // not an invariant, and `.some()` is deliberately written to tolerate a mixed array. Under
  // `requested_attributes: ['__all__','eta_delay_date']` with that key denied, removing this guard
  // DOES emit the note. Every T3 fixture used the sentinel alone, so the mutant was pointed at the
  // one shape that cannot discriminate and returned the comfortable answer.
  for (const k of ((_anyKeyed && !_isTimeline) ? _reqAttrs : [])) {
    const kk = String(k ?? '').trim();
    if (!kk) continue;
    const d = _deniedMap.get(kk);
    if (!d) continue;                                 // absence is annotated per row above
    _accessNotes.push(`I can't share the ${_labelFor(kk, d).toLowerCase()} — please check with the office.`);
  }

  try {
  const _si = $('When Executed by Another Workflow').first().json.semantic_input;
  const _sio = (typeof _si === 'string' ? JSON.parse(_si) : _si);
  const _os = _sio && _sio.order_status;
  if (e && e.has_result && Array.isArray(e.items) && e.items.length && (_os === 'outstanding' || _os === 'delivered')) {
    e.intro = _os === 'outstanding' ? 'Here are the outstanding orders I found.' : 'Here are the delivered orders I found.';
  }
} catch (err) {}
let msg = (e.intro || 'Here are the results.').trim() + '\n\n';

  (e.action_links || []).forEach((l, i) => { msg += `${i+1}. *${l.label || 'Link'}:* ${l.url}\n`; });
  if ((e.action_links || []).length) msg += '\n';

  (e.items || []).forEach((it, i) => {
    const fieldLines = (it.fields || []).map(f => `*${f.label}:* ${fmtValue(f.value)}`).join('\n');
    let line = `${i+1}. ${fieldLines}`;
    if (it.flags && it.flags.discontinued) line += '\n⚠️  *(PRODUCT DISCONTINUED)*';
    if (it.flags && it.flags.expired)      line += '\n⚠️  *(EXPIRED)*';
    if (it.flags && it.flags.unallocated)            line += '\n🚩  *(PENDING ALLOCATION)*';
    else if (it.flags && it.flags.partially_allocated) line += '\n🚩  *(PARTIAL ALLOCATION)*';
    msg += line + '\n\n';
  });

  // ── multi-company: name the companies that came back EMPTY (mc-label 2026-08-17) ─────
  // sorento_crm PR #193 stamps `lookup_companies` on a list envelope ONLY when the lookup spans
  // more than one company (companies of the products asked about UNION companies of the rows
  // returned). A single-company reply carries no such key, so everything below is inert there and
  // the message stays byte-identical to what it was.
  //
  // A FOUND row already says which company it belongs to — the CRM prepends a
  // {key:'company_name', label:'Company'} field and the generic field loop above renders it, so
  // nothing is duplicated here. What the customer cannot see is the company that WAS searched and
  // returned nothing: the answer silently reads as though only one company exists. Say it, once
  // per silent company, keyed to the companies actually looked up — never to the caller's access
  // list, which names companies this question never touched.
  const _lookupCos = Array.isArray(e.lookup_companies) ? e.lookup_companies : [];
  if (_lookupCos.length > 1) {
    const _coOfRow = (it) => {
      const f = ((it && it.fields) || []).find(
        x => x && (String(x.key || '') === 'company_name' || x.label === 'Company'));
      return f ? String(f.value ?? '').trim() : '';
    };
    const _shownCos = new Set((e.items || []).map(_coOfRow).filter(Boolean));
    // B1 (reviewer, 2026-08-17). NEVER assert absence from a NEGATIVE. If rows were rendered but
    // not one of them carries a Company field, the CRM did not stamp them — and that is a live
    // shape, not a hypothetical: `lookup_companies` rides the SHARED ListResponse passthrough and
    // already reaches `incoming_stock` (exec 12774475), while the leading `company_name` row field
    // is a per-presenter change. In that case `_shownCos` is empty and EVERY lookup company would
    // be declared silent directly underneath the rows we just printed:
    //   1. *Product Code:* MWC-SC08B / *Qty:* 12
    //   *Mocha:* no stock records for MWC-SC08B.
    // — a worse statement than the one this block exists to fix. So speak only when we CAN tell:
    // either nothing was returned at all (every lookup company genuinely came back empty), or the
    // rows are company-attributed, in which case a company missing from `_shownCos` is genuinely
    // silent. Rows present but unattributed ⇒ say nothing. Same rule `crossdomain-render` states
    // three nodes over: "positive facts only — say nothing rather than assert absence".
    const _canAttribute = !(e.items || []).length || _shownCos.size > 0;
    // Codes come from the entities the gate resolved and the tool was actually asked about — the
    // same set the CRM derived the company span from. `code` is the canonical code the customer
    // recognises (MWC-SC08B), never a uuid. Deduped: one code resolving in two companies arrives
    // twice, and naming it twice would read as two products.
    let _codes = [];
    try {
      const _ents0 = $('When Executed by Another Workflow').first().json.entities;
      const _ents = (typeof _ents0 === 'string' ? safe(_ents0) : _ents0) || [];
      _codes = [...new Set((Array.isArray(_ents) ? _ents : [])
        .map(x => String((x && x.code) ?? '').trim()).filter(Boolean))];
    } catch (err) { _codes = []; }
    // The noun comes from the envelope's own `result_type`, so there is no local vocabulary here
    // to go stale — the same discipline the key-based projection above is built on.
    const _noun = String(e.result_type || '').replace(/_/g, ' ').trim();
    const _what = (_noun ? `${_noun} records` : 'records')
      + (_codes.length ? ` for ${_codes.join(', ')}` : '');
    const _silent = _lookupCos
      .map(c => String((c && c.name) ?? '').trim())
      .filter(n => n && !_shownCos.has(n));
    if (_canAttribute && _silent.length) msg += _silent.map(n => `*${n}:* no ${_what}.`).join('\n') + '\n\n';
  }

  if (_accessNotes.length) msg += _accessNotes.join('\n') + '\n\n';

  const ts = fmtTs(e.last_updated_at);
  if (ts) msg += `_Data last updated: ${ts}_`;

  return [{ json: {
    response: msg.trim(),
    response_intro: e.intro,
    answers: e.items,
    attachments: e.attachments || [],
    action_links: e.action_links || [],
    last_updated_at: e.last_updated_at || null,
    has_result: !!e.has_result,
    alternatives: Array.isArray(e.alternatives) ? e.alternatives : [],
    relaxed_axis: e.relaxed_axis ?? null,
    field_access: e.field_access ?? null,
    requested_attributes: _reqAttrs,
    // false = the CRM served no keyed fields, so projection + access notes were skipped.
    // A sustained false here with a non-empty requested_attributes means the MCP process
    // needs restarting, NOT that the parser stopped emitting keys.
    keys_served: _anyKeyed,
    // mc-label (2026-08-17): carried through so downstream state knows the answer spanned more
    // than one company. Spread-in rather than defaulted to null, so a single-company reply's json
    // keeps EXACTLY the keys it has today.
    // `> 1` matches the MESSAGE gate above. The contract says a 1-element list cannot occur, but
    // asymmetric gates are how a "cannot occur" turns into a stray key on a single-company reply.
    ...(_lookupCos.length > 1 ? { lookup_companies: _lookupCos } : {}),
  } }];
