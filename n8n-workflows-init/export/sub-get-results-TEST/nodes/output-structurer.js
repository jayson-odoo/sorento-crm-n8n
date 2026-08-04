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
    if (it.flags && it.flags.expired)      line += '\n⚠️  *(PROMO EXPIRED)*';
    if (it.flags && it.flags.unallocated)            line += '\n🚩  *(PENDING ALLOCATION)*';
    else if (it.flags && it.flags.partially_allocated) line += '\n🚩  *(PARTIAL ALLOCATION)*';
    msg += line + '\n\n';
  });

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
  } }];