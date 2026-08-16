// ── RAW_MESSAGE_SRC — the customer's own turn text, ONE definition ───────────────────────
// spec-raw-text-migration §1.1. Until this slice the identical accessor was hand-written in
// TWO places: build-body.js's `MESSAGE` (feeding N-0's `free_terms`) and ccs-hunks.js's
// `_rawMsg` (feeding N-2's span quoting). N-0 is deleted by this slice and the accessor is
// PROMOTED to the `query` field itself, so keeping two spellings of the one string that now
// decides what the CRM searches on would be exactly LESSONS §63's shape — a sound assertion
// pointed at whichever copy the test happened to load.
//
// WHY tf-message: it is the spine's canonical turn-text node. `Call
// 'sub-query-reformulator'.latest_user_message` reads it, on the CLONE and on LIVE identically,
// and `patch-transcript` folds a Whisper transcript into the queue item UPSTREAM of it, so a
// voice turn carries text here too. It DOMINATES `resolve-entity-http` on the clone graph:
// `redis-pop-main-message-list -> if-audio-in -> {tf-message | ... -> patch-transcript ->
// tf-message} -> sorento-sub-respond-findcontact-respond -> ... -> replay-resolve-entity ->
// resolve-entity-http`, and `tf-message` is the ONLY inbound of
// `sorento-sub-respond-findcontact-respond` (export TOPOLOGY.md, clone c97f2f8f). Verified on
// the CURRENT clone graph, per the plan's instruction, not taken from the previous slice.
//
// Shape: tf-message returns `queueItem.message.message` (call it B), so the turn text is
// `B.message.message.text`. The attachment `description` fallback mirrors the reformulator
// caller's own expression, so an image/file turn with a caption still carries words.
//
// try/catch -> '' : `resolve-entity-http` is on the critical path of EVERY product turn. An
// expression that throws does not "lose the raw text", it fails the node. The catch should
// never fire on today's graph — which is exactly why it is written rather than assumed.
//
// Pure ASCII, no trailing whitespace, single line: the shipped body has to survive byte-gating
// (LESSONS §57) and has to be legal inside a jsonBody `{{ }}` segment as well as inside a Code
// node.
const RAW_MESSAGE_SRC =
  "(() => { try { const _j = $('tf-message').first().json; " +
  "return String((_j && _j.message && _j.message.message && (_j.message.message.text || " +
  "(_j.message.message.attachment && _j.message.message.attachment.description))) || ''); } " +
  "catch (_err) { return ''; } })()";

module.exports = { RAW_MESSAGE_SRC };
