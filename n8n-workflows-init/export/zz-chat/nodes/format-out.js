const raw = $('read-list').first().json.replies;
let arr = Array.isArray(raw) ? raw : (raw !== undefined && raw !== null && raw !== '' ? [raw] : []);
const parts = arr.map((x) => { if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return { type: 'text', text: x }; } } return x; });
const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i;
function conv(t){ if (t == null) return ''; return String(t).replace(/\*(?=\S)([^*\n]+?)\*/g, '**$1**'); }

// The chat trigger renders ONE response, so N delivered messages would silently
// merge into a single bubble and a multi-part turn would read as "not chunked".
// Label each part instead: this is the console's stand-in for separate WhatsApp
// messages. Console-only affordance — nothing here runs on the WhatsApp path.
// Authoritative proof of real multi-message delivery is one row per part in
// chat_histories sharing a turn_id: tests/verify-multipart-send.sql.
const blocks = parts.map((p) => {
  if (!p) return '';
  if (p.type === 'escalation') return '⚠️ ' + conv(p.text || '[escalated]');
  if (p.type === 'attachment') {
    const url = p.url || '';
    const name = p.filename || 'attachment';
    if (!url) return conv(p.text || '');
    if (IMG.test(name) || IMG.test(url)) return '📎 **' + name + '**  \n![' + name + '](' + url + ')';
    return '📎 [' + name + '](' + url + ')';
  }
  const total = Number(p.total_parts) || 1;
  const body = conv(p.text || '');
  if (!body && !p.quick_reply) return '';
  const bytes = new TextEncoder().encode(String(p.text || '')).length;
  const head = total > 1
    ? '───── WhatsApp message ' + (p.part || '?') + ' of ' + total +
      '  ·  ' + String(p.text || '').length + ' chars / ' + bytes + ' bytes ─────'
    : '';
  // Buttons are a property of ONE message; showing them makes it visible that they
  // ride the last part only, which is what a customer's tap will quote.
  const btns = p.quick_reply
    ? '\n\n🔘 buttons on this message: ' +
      String(p.quick_reply).split(',').map((s) => '[' + s.trim() + ']').join(' ')
    : '';
  return [head, body + btns].filter(Boolean).join('\n');
}).filter(Boolean);

let output = blocks.length ? blocks.join('\n\n') : '(no reply within 12s — try again)';
output = output.replace(/\n(?!\n)/g, '  \n');
return [{ json: { output } }];
