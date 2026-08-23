// CLONE-ONLY fail-closed MOCK of POST /api/v1/external/media/process (media-egress-gate TRUE
// arm, i.e. test_run_id present and scope !== 'chat-ui'). Mirrors the real response shape
// (MediaProcessResponse, sorento-crm app/schemas/external/media.py) so media-route behaves
// identically. Inject message.mock_media_response to exercise any decision/status/notice shape;
// else default to an accepted+completed extraction whose rendered_text is message.mock_media_text
// (or the caption, or a canned line) — so a media turn without an explicit mock still reaches
// the intent pipeline deterministically.
//
// Why a mock: the real endpoint WRITES to the prod CRM (usage ledger + job row) and spends
// provider money — the harness's zero-prod-write rule forbids that from the clone. The real
// node (media-extract-http) is byte-identical to what ships and is exercised only off the
// harness (chat-ui scope / live).
const m = (() => { try { return $('redis-pop-main-message-list').first().json.message || {}; } catch (e) { return {}; } })();
const media = (() => { try { return $('detect-media').first().json._media || {}; } catch (e) { return {}; } })();

if (m.mock_media_response && typeof m.mock_media_response === 'object') {
  return [{ json: m.mock_media_response }];
}

const modality = media.modality || 'voice';
const text = (m.mock_media_text && String(m.mock_media_text)) || media.caption || 'any order for MUB6201';
const result = {
  entities: [], attributes: [], conflicts: [],
  image_kind: modality === 'image' ? 'document' : null,
  caption_intent: modality === 'image' ? media.caption : null,
  notes: null, needs_clarification: false, truncated: false,
  rendered_text: text,
  confirmation_message: modality === 'voice'
    ? 'Here is what I heard: "' + text + '"'
    : 'I read ' + text + ' from that photo. Is that right?',
  clarification_message: null,
  transcript: modality === 'voice' ? text : null,
  languages_detected: modality === 'voice' ? ['en'] : null,
};
return [{ json: {
  job_id: 'mock-' + (media.message_id || 'job'),
  decision: 'accepted',
  status: 'completed',
  idempotent_replay: false,
  tier: 'standard',
  quota: { used: 1, limit: 50, remaining: 49, period_key: '2026-08', resets_on: '1 September' },
  notices: [],
  language_strategy: modality === 'voice' ? { mode: 'pinned', language: 'en' } : null,
  result,
  error: null,
  _mock: true,
} }];
