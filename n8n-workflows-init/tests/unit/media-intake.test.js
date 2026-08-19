#!/usr/bin/env node
/* MEDIA INTAKE — offline units for the four Code-node bodies that ship to the clone
 * (tests/diffs/media-intake/*.js). Runs each body verbatim inside a stub of the n8n Code-node
 * sandbox ($input / $('name') / $runIndex / $execution) so the routing table can be proven for
 * EVERY CRM decision/status/notice shape at zero cost BEFORE any clone execution. These are the
 * same bodies build-clone.py installs (sha-verified after PUT), so what passes here is what runs.
 *
 * NOT a substitute for §0 / LESSONS #45 — `={{ }}` If expressions are smoke-tested with ONE real
 * clone exec per expression; this file covers the jsCode sandbox only.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const D = path.join(__dirname, '..', 'diffs', 'media-intake');
const body = (f) => fs.readFileSync(path.join(D, f), 'utf8');

// ── sandbox ──────────────────────────────────────────────────────────────────────────────────
function run(file, { input, nodes = {}, runIndex = 0 }) {
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Referenced node is unexecuted: ${name}`);
    return { first: () => ({ json: nodes[name] }), isExecuted: true };
  };
  const fn = new Function('$input', '$', '$runIndex', '$execution', '$json', body(file));
  const out = fn($input, $, runIndex, { id: '999' }, input);
  assert(Array.isArray(out) && out.length === 1, `${file}: must return exactly one item`);
  return out[0].json;
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────
const ITEM = (E, extra = {}) => ({
  message: {
    message: { message: { message: E }, replyTo: {} },
    contact: { id: '437264483', phone: '60100000000', firstName: 'Jayson', custom_fields: [] },
    messageId: '1783918786000000', replyTo: null,
    test_run_id: 'UNIT', scope: 'deterministic', mode: 'uac',
    ...extra,
  },
});
const VOICE_ATT = { type: 'audio', url: 'https://cdn.chatapi.net/x/voice.ogg', mimeType: 'audio/ogg; codecs=opus', mime: 'audio/ogg', size: 40000, fileName: 'voice.ogg', ext: 'ogg' };
const IMAGE_ATT = { type: 'image', url: 'https://cdn.chatapi.net/x/image123', mimeType: 'image/jpeg', mime: 'image/jpeg', size: 153739, fileName: 'image123', ext: 'jpg' };
const TEXT_E = { text: 'any order for MUB6201', type: 'text', attachment: { type: 'text', description: '' } };

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + (e.message || e)); process.exitCode = 1; } };

// ═════════════════════════════ detect-media ═══════════════════════════════════════════════════
t('detect-media: text turn -> modality null, item passthrough intact', () => {
  const out = run('detect-media.js', { input: ITEM(TEXT_E) });
  assert.strictEqual(out._media.modality, null);
  assert.deepStrictEqual(out.message.message, ITEM(TEXT_E).message.message, 'item must be untouched');
});
t('detect-media: voice note -> voice, url/mime/bytes, duration estimated (lower bound), source labelled', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: VOICE_ATT }) });
  const m = out._media;
  assert.strictEqual(m.modality, 'voice');
  assert.strictEqual(m.media_url, VOICE_ATT.url);
  assert.strictEqual(m.mime_type, 'audio/ogg; codecs=opus');
  assert.strictEqual(m.bytes, 40000);
  assert.strictEqual(m.duration_ms, Math.round(40000 * 8 / 32000 * 1000)); // 10000 ms
  assert.strictEqual(m.duration_source, 'estimated_from_size_32kbps');
  assert.strictEqual(m.caption, null);
  assert.strictEqual(m.message_id, '1783918786000000');
  assert.strictEqual(m.respond_io_id, '437264483');
});
t('detect-media: voice note with channel duration (seconds) -> ms, source attachment', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: { ...VOICE_ATT, duration: 18.4 } }) });
  assert.strictEqual(out._media.duration_ms, 18400);
  assert.strictEqual(out._media.duration_source, 'attachment');
});
t('detect-media: voice note with durationMs -> kept as ms', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: { ...VOICE_ATT, durationMs: 18400 } }) });
  assert.strictEqual(out._media.duration_ms, 18400);
});
t('detect-media: voice note, no size, no duration -> duration_ms 0 (unknown), still voice', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: { type: 'audio', url: 'https://x/v.ogg' } }) });
  assert.strictEqual(out._media.modality, 'voice');
  assert.strictEqual(out._media.duration_ms, 0);
  assert.strictEqual(out._media.duration_source, 'unknown');
});
t('detect-media: image with caption in E.text -> image, caption, duration null', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: 'check stock for these', attachment: IMAGE_ATT }) });
  const m = out._media;
  assert.strictEqual(m.modality, 'image');
  assert.strictEqual(m.caption, 'check stock for these');
  assert.strictEqual(m.duration_ms, null);
  assert.strictEqual(m.duration_source, null);
});
t('detect-media: image with caption in attachment.description', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: { ...IMAGE_ATT, description: 'price?' } }) });
  assert.strictEqual(out._media.caption, 'price?');
});
t('detect-media: pdf/file and video are NOT media for this lane', () => {
  for (const att of [{ type: 'file', url: 'https://x/a.pdf', mimeType: 'application/pdf' }, { type: 'video', url: 'https://x/a.mp4', mimeType: 'video/mp4' }]) {
    const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: att }) });
    assert.strictEqual(out._media.modality, null, att.type);
  }
});
t('detect-media: media without a url falls through as text', () => {
  const out = run('detect-media.js', { input: ITEM({ type: 'attachment', text: null, attachment: { type: 'image', mimeType: 'image/jpeg' } }) });
  assert.strictEqual(out._media.modality, null);
});
t('detect-media: never throws on a malformed item', () => {
  const out = run('detect-media.js', { input: { message: {} } });
  assert.strictEqual(out._media.modality, null);
});

// ═════════════════════════════ media-route ════════════════════════════════════════════════════
const VOICE_MEDIA = { _media: { modality: 'voice', media_url: VOICE_ATT.url, message_id: '1', respond_io_id: '437264483' } };
const IMAGE_MEDIA = { _media: { modality: 'image', media_url: IMAGE_ATT.url, message_id: '1', respond_io_id: '437264483' } };
const QUOTA = { used: 41, limit: 50, remaining: 9, period_key: '2026-08', resets_on: '1 September' };
const route = (resp, media = VOICE_MEDIA) => run('media-route.js', { input: resp, nodes: { 'detect-media': media } });
const VOICE_FALLBACK = 'I could not make out that voice note. Please send it again or type your message and I will help straight away.';
const IMAGE_FALLBACK = 'I could not read anything from that photo. Type the codes and I will look them up straight away.';

t('route: accepted/completed voice -> continue with transcript + confirmation', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', tier: 'standard', quota: QUOTA, notices: [],
    result: { rendered_text: 'any order for MUB6201', confirmation_message: 'Here is what I heard: "any order for MUB6201"', transcript: 'any order for MUB6201' } });
  assert.strictEqual(o.action, 'continue');
  assert.strictEqual(o.rendered_text, 'any order for MUB6201');
  assert.strictEqual(o.confirmation_text, 'Here is what I heard: "any order for MUB6201"');
  assert.strictEqual(o._media_trace.source, 'crm');
});
t('route: accepted/completed image + warn_80 notice -> continue, notice APPENDED to confirmation (never instead)', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', tier: 'standard', quota: QUOTA,
    notices: [{ kind: 'warn_80', text: 'You have 9 of 50 photo reads left this month. The allowance resets on 1 September.', append: true }],
    result: { rendered_text: 'check stock for these: SRTKS6647', confirmation_message: 'I read SRTKS6647 from that photo. Is that right?' } }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'continue');
  assert.strictEqual(o.rendered_text, 'check stock for these: SRTKS6647');
  assert.strictEqual(o.confirmation_text, 'I read SRTKS6647 from that photo. Is that right?\n\nYou have 9 of 50 photo reads left this month. The allowance resets on 1 September.');
});
t('route: accepted/completed degraded tier + degraded notice -> continue, notice appended', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', tier: 'degraded', quota: QUOTA,
    notices: [{ kind: 'degraded', text: 'I am reading this one with a simpler model and may get it wrong, so typing the codes is exact. This month\'s full-accuracy photo reads are used up and the allowance resets on 1 September.', append: true }],
    result: { rendered_text: 'stock: SRTKS6647', confirmation_message: 'I read SRTKS6647 from that photo. Is that right?' } }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'continue');
  assert(o.confirmation_text.startsWith('I read SRTKS6647 from that photo. Is that right?\n\nI am reading this one with a simpler model'));
});
t('route: captionless image (needs_clarification, rendered_text null) -> reply with CRM clarification, turn ends', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', quota: QUOTA, notices: [],
    result: { rendered_text: null, needs_clarification: true, clarification_message: 'I read SRTKS6647 and batch number YG2539 from that photo. What would you like me to do with it?' } }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'reply');
  assert.strictEqual(o.reply_text, 'I read SRTKS6647 and batch number YG2539 from that photo. What would you like me to do with it?');
});
t('route: empty transcript (voice needs_clarification) -> reply voice_unclear from CRM', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', quota: QUOTA, notices: [],
    result: { rendered_text: null, transcript: null, needs_clarification: true, clarification_message: VOICE_FALLBACK } });
  assert.strictEqual(o.action, 'reply');
  assert.strictEqual(o.reply_text, VOICE_FALLBACK);
});
t('route: denied_gate -> reply = not_enabled notice verbatim', () => {
  const txt = 'I cannot listen to voice notes on this number yet. Type your message instead and I will help straight away.';
  const o = route({ job_id: null, decision: 'denied_gate', status: null, quota: QUOTA, notices: [{ kind: 'not_enabled', text: txt, append: true }], result: null });
  assert.strictEqual(o.action, 'reply');
  assert.strictEqual(o.reply_text, txt);
  assert.strictEqual(o.reason, 'denied_gate');
});
t('route: denied_duration -> reply = too_long notice', () => {
  const txt = 'That voice note is longer than 120 seconds. Please send a shorter one and I will listen to it.';
  const o = route({ job_id: null, decision: 'denied_duration', quota: QUOTA, notices: [{ kind: 'too_long', text: txt, append: true }] });
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, txt);
});
t('route: denied_quota -> reply = quota_exhausted notice', () => {
  const txt = 'You have used all 50 of this month\'s photo reads, so I have not read this one. The allowance resets on 1 September. Type the codes and I will look them up straight away.';
  const o = route({ job_id: null, decision: 'denied_quota', quota: QUOTA, notices: [{ kind: 'quota_exhausted', text: txt, append: true }] }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, txt);
});
t('route: denied_burst first-in-window -> reply = burst notice', () => {
  const txt = 'That is a lot at once - give me a moment to catch up, then send the rest.';
  const o = route({ job_id: null, decision: 'denied_burst', quota: QUOTA, notices: [{ kind: 'burst', text: txt, append: true }] }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, txt);
});
t('route: denied_burst suppressed (notices []) -> silent, nothing sent', () => {
  const o = route({ job_id: null, decision: 'denied_burst', quota: QUOTA, notices: [] }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'silent'); assert.strictEqual(o.reply_text, null);
});
t('route: transport failure (n8n error object, no decision) -> reply CRM fallback, never a dead turn', () => {
  const o = route({ error: { message: 'The connection timed out', name: 'NodeApiError' } });
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, VOICE_FALLBACK); assert.strictEqual(o.reason, 'transport');
  assert.strictEqual(o._media_trace.transport_error, 'The connection timed out');
  const oi = route({ error: 'timeout' }, IMAGE_MEDIA);
  assert.strictEqual(oi.reply_text, IMAGE_FALLBACK);
});
t('route: empty body (HTML/unknown) -> reply fallback', () => {
  const o = route({});
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, VOICE_FALLBACK);
});
t('route: accepted/pending first time -> poll after 6s', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'pending', quota: QUOTA, notices: [], result: null });
  assert.strictEqual(o.action, 'poll'); assert.strictEqual(o.poll_wait_s, 6); assert.strictEqual(o.job_id, 'j1');
});
t('route: pending after 2 polls -> reply fallback (pending_exhausted)', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'pending', notices: [], _polled: true, _poll_n: 2 });
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reason, 'pending_exhausted'); assert.strictEqual(o.reply_text, VOICE_FALLBACK);
});
t('route: accepted/failed on the sync response -> ONE immediate poll to fetch the ledger notice', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'failed', quota: QUOTA, notices: [], result: null, error: 'The voice note is 151 seconds, over the 120 second limit.' });
  assert.strictEqual(o.action, 'poll'); assert.strictEqual(o.poll_wait_s, 0); assert.strictEqual(o.reason, 'failed');
});
t('route: failed after poll, ledger carries too_long -> reply = too_long notice (not the internal error string)', () => {
  const txt = 'That voice note is longer than 120 seconds. Please send a shorter one and I will listen to it.';
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'failed', notices: [{ kind: 'too_long', text: txt, append: true }], error: 'The voice note is 151 seconds, over the 120 second limit.', _polled: true, _poll_n: 1 });
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, txt);
  assert(!o.reply_text.includes('151 seconds'), 'internal error must not leak');
});
t('route: failed after poll, no refusal notice (provider failure) -> CRM fallback + any appendix notice', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'failed', notices: [{ kind: 'warn_80', text: 'You have 9 of 50 photo reads left this month. The allowance resets on 1 September.', append: true }], error: 'The vision model call failed: 502', _polled: true, _poll_n: 1 }, IMAGE_MEDIA);
  assert.strictEqual(o.action, 'reply');
  assert.strictEqual(o.reply_text, IMAGE_FALLBACK + '\n\nYou have 9 of 50 photo reads left this month. The allowance resets on 1 September.');
  assert(!o.reply_text.includes('502'));
});
t('route: failed with no job_id (not_queued) -> reply fallback immediately', () => {
  const o = route({ job_id: null, decision: 'accepted', status: 'failed', notices: [], error: 'Could not queue the extraction.' });
  assert.strictEqual(o.action, 'reply'); assert.strictEqual(o.reply_text, VOICE_FALLBACK);
});
t('route: idempotent replay of a completed job behaves like completed', () => {
  const o = route({ job_id: 'j1', decision: 'accepted', status: 'completed', idempotent_replay: true, notices: [], result: { rendered_text: 'hello', confirmation_message: 'Here is what I heard: "hello"' } });
  assert.strictEqual(o.action, 'continue'); assert.strictEqual(o._media_trace.idempotent_replay, true);
});

// ═════════════════════════════ media-poll-merge ═══════════════════════════════════════════════
t('poll-merge: completed job body -> accepted/completed with result + notices, _poll_n = runIndex+1', () => {
  const o = run('media-poll-merge.js', { input: { job_id: 'j1', status: 'completed', result: { rendered_text: 'x' }, notices: [], error: null }, nodes: { 'media-route': { job_id: 'j1', reason: 'pending' } }, runIndex: 0 });
  assert.strictEqual(o.decision, 'accepted'); assert.strictEqual(o.status, 'completed'); assert.strictEqual(o._poll_n, 1); assert.strictEqual(o._polled, true);
});
t('poll-merge: poll itself failed (n8n error) -> keeps previous status so route falls to fallback, _poll_n advances', () => {
  const o = run('media-poll-merge.js', { input: { error: { message: '404 - not found' } }, nodes: { 'media-route': { job_id: 'j1', reason: 'failed' } }, runIndex: 1 });
  assert.strictEqual(o.status, 'failed'); assert.strictEqual(o._poll_n, 2); assert.strictEqual(o._poll_ok, false);
  const r = route(o);
  assert.strictEqual(r.action, 'reply'); assert.strictEqual(r.reply_text, VOICE_FALLBACK);
});
t('poll-merge -> route: pending,pending -> exhausted after MAX_POLLS', () => {
  const m1 = run('media-poll-merge.js', { input: { job_id: 'j1', status: 'pending' }, nodes: { 'media-route': { job_id: 'j1', reason: 'pending' } }, runIndex: 0 });
  const r1 = route(m1); assert.strictEqual(r1.action, 'poll');
  const m2 = run('media-poll-merge.js', { input: { job_id: 'j1', status: 'pending' }, nodes: { 'media-route': r1 }, runIndex: 1 });
  const r2 = route(m2); assert.strictEqual(r2.action, 'reply'); assert.strictEqual(r2.reason, 'pending_exhausted');
});

// ═════════════════════════════ patch-transcript ═══════════════════════════════════════════════
t('patch-transcript: folds rendered_text into E.text, flips types, keeps url, sets _media', () => {
  const pop = ITEM({ type: 'attachment', text: null, attachment: VOICE_ATT });
  const o = run('patch-transcript.js', { input: { action: 'continue', modality: 'voice', rendered_text: 'any order for MUB6201', confirmation_text: 'Here is what I heard: "any order for MUB6201"', job_id: 'j1', _media_trace: { source: 'crm' } }, nodes: { 'redis-pop-main-message-list': pop } });
  const E = o.message.message.message.message;
  assert.strictEqual(E.text, 'any order for MUB6201');
  assert.strictEqual(E.type, 'text');
  assert.strictEqual(E.attachment.type, 'text');
  assert.strictEqual(E.attachment.source_type, 'audio');
  assert.strictEqual(E.attachment.source_url, VOICE_ATT.url);
  assert.strictEqual(o.message._transcript, 'any order for MUB6201');
  assert.strictEqual(o.message._media.confirmation_text, 'Here is what I heard: "any order for MUB6201"');
  // tf-message returns item.message — its .message.message.text is what every reader uses
  assert.strictEqual(o.message.message.message.message.text, 'any order for MUB6201');
});

// ═════════════════════════════ console adapter ════════════════════════════════════════════════
t('console-whisper-adapter: whisper {text} -> continue item; empty -> reply voice_unclear', () => {
  const a = run('console-whisper-adapter.js', { input: { text: 'hello there' } });
  assert.strictEqual(a.action, 'continue'); assert.strictEqual(a.rendered_text, 'hello there');
  const b = run('console-whisper-adapter.js', { input: { text: '' } });
  assert.strictEqual(b.action, 'reply'); assert.strictEqual(b.reply_text, VOICE_FALLBACK);
});

// ═════════════════════════════ expressions (lesson 45 token sweep) ════════════════════════════
t('expressions: no prototype/constructor/__proto__ in any shipped body or expr', () => {
  for (const f of fs.readdirSync(D)) {
    const s = body(f);
    assert(!/prototype|constructor|__proto__/.test(s), f + ' carries a sandbox-forbidden token');
  }
});

console.log(`\n${pass} passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
