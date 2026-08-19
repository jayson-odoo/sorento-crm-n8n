// CLONE-ONLY fail-closed MOCK of GET /api/v1/external/media/jobs/{job_id} (media-poll-gate TRUE
// arm). Returns message.mock_media_poll[$runIndex] when the redis item carries a list of poll
// bodies (so pending→pending→completed / pending→failed sequences are scriptable), else a
// completed job whose rendered_text is message.mock_media_text (or a canned line). Shape = the
// callback body (sorento-crm app/tasks/media_tasks.py build_callback_body).
const m = (() => { try { return $('redis-pop-main-message-list').first().json.message || {}; } catch (e) { return {}; } })();
const prev = (() => { try { return $('media-route').first().json || {}; } catch (e) { return {}; } })();
const seq = Array.isArray(m.mock_media_poll) ? m.mock_media_poll : null;
if (seq && seq.length) {
  const body = seq[Math.min($runIndex, seq.length - 1)];
  return [{ json: Object.assign({ _mock: true }, body) }];
}
const text = (m.mock_media_text && String(m.mock_media_text)) || 'any order for MUB6201';
return [{ json: {
  job_id: prev.job_id || 'mock-job', status: 'completed', respond_io_id: null, message_id: prev.message_id || null,
  modality: prev.modality || 'voice', turn_id: null, context: null, tier: 'standard',
  result: { rendered_text: text, confirmation_message: 'Here is what I heard: "' + text + '"', clarification_message: null, transcript: text, needs_clarification: false },
  notices: [], error: null, _mock: true,
} }];
