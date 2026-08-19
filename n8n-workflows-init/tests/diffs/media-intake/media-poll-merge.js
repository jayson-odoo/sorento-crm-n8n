// MEDIA INTAKE — poll loop: re-shape GET /api/v1/external/media/jobs/{job_id} (the callback
// body: {job_id,status,respond_io_id,message_id,modality,turn_id,context,tier,result,notices,
// error}) into the MediaProcessResponse shape media-route already understands, then loop back
// into media-route. Also absorbs a failed poll (n8n error object / 404) so the loop can never
// wedge: the item still reaches media-route, which falls to the CRM fallback copy.
//
// `_poll_n` is derived from THIS node's own run index ($runIndex is 0 on the first poll), so the
// MAX_POLLS guard in media-route cannot be defeated by a stale $('…').first() in a loop.
const resp = ($input.first() && $input.first().json) || {};
const prev = (() => { try { return $('media-route').first().json || {}; } catch (e) { return {}; } })();
const pollN = $runIndex + 1;

const polledOk = resp && typeof resp === 'object' && resp.status && !(resp.error && !resp.job_id && !resp.status);
const status = polledOk ? String(resp.status) : (prev.reason === 'failed' ? 'failed' : 'pending');

return [{ json: {
  job_id: (polledOk && resp.job_id) || prev.job_id || null,
  decision: 'accepted',
  status,
  idempotent_replay: false,
  tier: (polledOk && resp.tier) || null,
  quota: null,
  notices: polledOk && Array.isArray(resp.notices) ? resp.notices : [],
  language_strategy: null,
  result: polledOk ? (resp.result || null) : null,
  error: polledOk ? (resp.error || null) : (resp && resp.error ? (typeof resp.error === 'string' ? resp.error : (resp.error.message || 'poll failed')) : null),
  _polled: true,
  _poll_n: pollN,
  _poll_ok: !!polledOk,
  _mock: !!resp._mock,
} }];
