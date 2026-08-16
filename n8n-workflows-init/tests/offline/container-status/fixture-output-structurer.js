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
  const _anyKeyed = (e.items || []).some(it => (it && it.fields || []).some(_hasKey));
  for (const it of (_anyKeyed ? (e.items || []) : [])) {
    if (!it || !Array.isArray(it.fields)) continue;
    it.fields = it.fields.filter(f => {
      if (!_hasKey(f)) return true;                       // unkeyed result type — untouched
      const k = String(f.key);
      if (_IDENTITY_KEYS.has(k)) return true;             // identity always survives
      return _keepKeys.has(k);                            // clearance is opt-in
    });
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
  const _shownKeys = new Set();
  for (const it of (e.items || [])) {
    for (const f of (it.fields || [])) if (_hasKey(f)) _shownKeys.add(String(f.key));
  }
  // Wording comes from the CRM when it supplies one, else the key is humanised. Deliberately
  // NOT a local vocabulary — a table here is exactly what this rebuild removed.
  const _human = (k, d) => String((d && (d.label || d.field_label)) || k)
    .replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const _accessNotes = [];
  for (const k of (_anyKeyed ? _reqAttrs : [])) {
    const kk = String(k ?? '').trim();
    if (!kk || _shownKeys.has(kk)) continue;
    const d = _deniedMap.get(kk);
    _accessNotes.push(d
      ? `I can't share the ${_human(kk, d)} — please check with the office.`
      : `${_human(kk, null).replace(/^./, c => c.toUpperCase())}: not recorded yet.`);
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
  } }];