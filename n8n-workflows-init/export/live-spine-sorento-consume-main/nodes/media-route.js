// MEDIA INTAKE — step 3: turn the CRM media response into ONE of four actions.
//
// Input  ($json): a MediaProcessResponse (POST /api/v1/external/media/process), OR the
//                 GET /media/jobs/{job_id} body re-shaped by media-poll-merge (loop-back), OR an
//                 n8n error object ({error:…}, no `decision`) when the HTTP node failed/timed out
//                 under onError=continueRegularOutput.
// Output (one item):
//   action = 'continue' -> patch-transcript folds `rendered_text` into the queue item; the turn
//                          proceeds through tf-message EXACTLY as if the customer had typed it.
//   action = 'reply'    -> send-media-reply sends `reply_text` (CRM-rendered copy) and the turn
//                          ends (refusal / clarification / failure).
//   action = 'poll'     -> wait `poll_wait_s` then GET /media/jobs/{job_id} (status pending, or
//                          status failed whose worker-side notice lives on the ledger row only).
//   action = 'silent'   -> nothing is sent (denied_burst with the pacing notice already shown this
//                          window — the CRM suppresses it on purpose; one message per window).
//
// The CRM is the wording authority (PLAN §6 / AC S6-01): every customer string here is either a
// CRM `notices[].text` / `result.*_message`, or one of the two CRM-owned fallbacks below copied
// BYTE-EXACT from app/services/media_extract/wording.py (voice_unclear / nothing_read). n8n
// formats nothing and invents nothing. Notices are `append: true` — appended to the confirmation
// (which precedes the answer), never returned instead of it.
const MAX_POLLS = 2;        // 2 × 6 s after the CRM's own 30 s synchronous wait
const POLL_WAIT_S = 6;

const FALLBACK = {
  voice: 'I could not make out that voice note. Please send it again or type your message and I will help straight away.',
  image: 'I could not read anything from that photo. Type the codes and I will look them up straight away.',
};

const resp = ($input.first() && $input.first().json) || {};
const media = (() => { try { return $('detect-media').first().json._media || {}; } catch (e) { return {}; } })();
const modality = media.modality === 'image' ? 'image' : 'voice';
const fallback = FALLBACK[modality];

// Notice kinds that ARE the answer (a refusal) vs. kinds that ride along (append: true).
// wording.py: not_enabled / too_long / burst / quota_exhausted / unreadable are refusals;
// warn_80 / degraded are appendices to whatever else is said.
const REFUSAL_KINDS = ['not_enabled', 'too_long', 'burst', 'quota_exhausted', 'unreadable'];
const notices = (Array.isArray(resp.notices) ? resp.notices : []).filter(n => n && n.text != null && String(n.text).trim());
const noticeKinds = notices.map(n => n.kind).filter(Boolean);
const primaryNotice = notices.find(n => REFUSAL_KINDS.includes(String(n.kind)));
const appendixTexts = notices.filter(n => n !== primaryNotice).map(n => String(n.text).trim());
const primaryText = primaryNotice ? String(primaryNotice.text).trim() : null;
// base + every append-notice (+ an optional extra list), '\n\n'-joined; null when there is
// nothing at all to say.
const appendNotices = (base, extra) => {
  const parts = [];
  if (base && String(base).trim()) parts.push(String(base).trim());
  for (const t of appendixTexts) parts.push(t);
  if (extra) for (const t of extra) if (t) parts.push(t);
  return parts.length ? parts.join('\n\n') : null;
};

// Synthetic degraded-tier notice (captain decision 2026-08-22, plans/crm-image-degraded-tier-
// broken-spec.md + plans/crm-media-quota-notice-wording-spec.md): the CRM sometimes serves an
// accepted, completed turn on a cheaper model (tier:"degraded", a full quota object) WITHOUT
// attaching a notice about it, proven on the image path (voice already attaches one). n8n
// composes a short parity notice from tier + quota ONLY when the CRM stayed silent, and ONLY
// for a served (decision accepted, status completed, rendered_text present) turn: never on a
// refusal, a non-degraded turn, or a non-media turn (this whole file only runs on a media turn).
const DEGRADED_KIND_HINTS = ['degrade', 'quota', 'limit', 'fallback'];
const DEGRADED_TEXT_HINTS = ['simpler model', 'limit'];
const hasCrmDegradedNotice = notices.some(n => {
  const kind = String(n.kind || '').toLowerCase();
  if (DEGRADED_KIND_HINTS.some(h => kind.includes(h))) return true;
  const text = String(n.text || '').toLowerCase();
  return DEGRADED_TEXT_HINTS.some(h => text.includes(h));
});
const composeDegradedNotice = () => {
  if (resp.decision !== 'accepted' || resp.tier !== 'degraded' || hasCrmDegradedNotice) return null;
  const q = resp.quota || {};
  const verb = modality === 'image' ? 'reading' : 'listening';
  const limitClause = (q.limit != null && String(q.limit).trim()) ? `Monthly limit (${q.limit}) reached` : 'Monthly limit reached';
  let text = `${limitClause}, ${verb} with a simpler model.`;
  if (q.resets_on != null && String(q.resets_on).trim()) text += ` Limit resets ${String(q.resets_on).trim()}.`;
  return text;
};

const pollN = Number(resp._poll_n || 0);
const trace = {
  source: resp._mock ? 'mock' : (resp._polled ? 'crm-poll' : 'crm'),
  decision: resp.decision || null,
  status: resp.status || null,
  job_id: resp.job_id || null,
  tier: resp.tier || null,
  idempotent_replay: !!resp.idempotent_replay,
  quota: resp.quota || null,
  notice_kinds: noticeKinds,
  poll_n: pollN,
  transport_error: (!resp.decision && resp.error) ? (typeof resp.error === 'string' ? resp.error : (resp.error.message || JSON.stringify(resp.error))) : null,
  crm_error: (resp.decision && resp.error) ? String(resp.error) : null,
};

const out = (action, extra) => [{ json: Object.assign({
  action, modality,
  rendered_text: null, confirmation_text: null, reply_text: null,
  poll_wait_s: 0, poll_n: pollN, job_id: resp.job_id || null,
  media_url: media.media_url || null, message_id: media.message_id || null,
  _media_trace: trace,
}, extra || {}) }];

// 1. Transport / node failure (timeout, 5xx, connection error, or an unparseable body): the
//    HTTP node ran with onError=continueRegularOutput, so we get here instead of a dead turn.
if (!resp.decision) {
  return out('reply', { reply_text: fallback, reason: 'transport' });
}

// 2. Refusals: the decision is in the body, not the status code. The notice IS the reply.
if (resp.decision !== 'accepted') {
  if (primaryText) return out('reply', { reply_text: appendNotices(primaryText), reason: resp.decision });
  // denied_burst with the pacing message already shown this window -> by contract, nothing.
  if (resp.decision === 'denied_burst') return out('silent', { reason: 'denied_burst_suppressed' });
  return out('reply', { reply_text: appendNotices(fallback), reason: resp.decision + '_no_notice' });
}

// 3. Accepted.
const status = resp.status || null;

if (status === 'completed') {
  const r = resp.result || {};
  const rendered = (r.rendered_text != null && String(r.rendered_text).trim()) ? String(r.rendered_text).trim() : null;
  if (!rendered) {
    // needs_clarification (captionless image / empty transcript): the CRM wrote the question.
    const q = (r.clarification_message && String(r.clarification_message).trim()) || null;
    return out('reply', { reply_text: appendNotices(q) || appendNotices(fallback), reason: 'needs_clarification' });
  }
  const conf = (r.confirmation_message && String(r.confirmation_message).trim()) || null;
  const syntheticNotice = composeDegradedNotice();
  if (syntheticNotice) trace.synthetic_degraded_notice = syntheticNotice;
  return out('continue', {
    rendered_text: rendered,
    confirmation_text: appendNotices(conf, syntheticNotice ? [syntheticNotice] : null),
    reason: 'completed',
  });
}

if (status === 'pending') {
  if (pollN < MAX_POLLS && resp.job_id) return out('poll', { poll_wait_s: POLL_WAIT_S, reason: 'pending' });
  return out('reply', { reply_text: appendNotices(fallback), reason: 'pending_exhausted' });
}

if (status === 'failed') {
  // The worker's own refusal notice (clip measured over the cap, unreadable audio) is stamped on
  // the ledger row and carried by GET /media/jobs/{job_id} — the synchronous response's
  // `notices` were computed BEFORE the wait and do not include it. One immediate poll fetches it.
  if (!resp._polled && resp.job_id && pollN < MAX_POLLS) return out('poll', { poll_wait_s: 0, reason: 'failed' });
  return out('reply', { reply_text: appendNotices(primaryText || fallback), reason: 'failed' });
}

return out('reply', { reply_text: appendNotices(fallback), reason: 'unknown_status' });

