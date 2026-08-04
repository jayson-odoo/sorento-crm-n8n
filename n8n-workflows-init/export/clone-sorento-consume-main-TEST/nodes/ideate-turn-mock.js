// Fail-closed MOCK of the ideation turn endpoint — clone/test path only (is_test via
// test_run_id). Mirrors the real endpoint response shape so build-ideate-reply +
// compile-current-state behave identically. Inject message.mock_ideate_response to
// exercise review/complete/duplicate statuses; else default a 'collecting' turn.
const inj = (() => { try { return $('redis-pop-main-message-list').first().json.message.mock_ideate_response || null; } catch (e) { return null; } })();
if (inj) return [{ json: inj }];
return [{ json: {
  status: 'collecting',
  reply_text: "Here's what I've got so far:\n- Problem statement: (mock)\n\nStill need: Impact, Department.",
  link: null,
  session_vars: { variables: { ideation: { draft_id: 'mock-draft-0001', status: 'collecting', missing: ['impact','department'], updated_at: '2026-07-20T00:00:00Z' } } }
} }];
