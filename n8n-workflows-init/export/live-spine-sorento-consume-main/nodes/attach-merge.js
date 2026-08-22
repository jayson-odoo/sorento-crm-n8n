// ── attach-merge ──────────────────────────────────────────────────────────────────────────────
// SINGLE entry point for the attachment fan-out. Replaces `central-exchange` as the root of
// `if-got-attachments`.
//
// WHY: `central-exchange` runs ONLY on the answered branch (If6[0]). The cross-domain feature's
// headline case — `check stock SRTWC286-SH-NEW-200` — is a TOTAL MISS and takes If6[1] → Aggregate1,
// so `central-exchange` never executes and the whole attachment chain was unreachable exactly where
// the file is needed. Proven on clone exec 11083744: `central-exchange` and `if-got-attachments` have
// NO runData while `crossdomain-render` and `Aggregate1` ran.
//
// Rooted at `sorento-sub-respond-sendmsg-respond2` output 0 (the send's SUCCESS branch), which is the
// unique point that runs on BOTH If6 branches AND makes "text before file" a data dependency instead
// of a canvas-position accident. Consequence, recorded not discovered: a FAILED text send (error goes
// to the node's unwired main[1]) now also suppresses the file — never a file with no message.
//
// Emits exactly ONE item carrying only `attachments`. It must NOT write onto crossdomain-compose's
// item: on live that item is the body of the conversation-variables PUT (review finding F2).
const MAIN = (() => {
  try {
    const n = $('central-exchange');
    if (!n.isExecuted) return [];                       // total-miss branch: no main-answer files
    const a = n.first().json.attachments;
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
})();

const XD = (() => {
  try {
    const r = $('crossdomain-render');
    if (!r.isExecuted) return [];
    const xb = r.first().json._xdBlock || {};
    const list = Array.isArray(xb.attachments) ? xb.attachments : [];
    if (!list.length) return [];
    // Decision (d) / fail-silent: no rendered block means the turn asserts nothing about the other
    // axis, so it must not hand over a file either. Also covers the degraded (soft-failed probe) path.
    if (xb.any !== true || !xb.block) return [];
    // DELIVERY TEST: crossdomain-compose emits NO marker key by design (review F2 removed `_xdApplied`
    // and nothing may be re-added — the whole item is PUT into the live customer session). So ask the
    // delivered text whether the block actually made it in. Fails safe: no block in the text, no file.
    const c = $('crossdomain-compose');
    if (!c.isExecuted) return [];
    const txt = c.first().json.user_response;
    if (typeof txt !== 'string' || !txt.includes(xb.block)) return [];
    return list;
  } catch (e) { return []; }
})();

// Order: main-answer files first, cross-domain files after — mirrors the text order.
// NO dedupe here: `Remove Duplicates` (key `url`) owns that, and duplicating it would make the UAC
// assertion on dedupe unfalsifiable.
return [{ json: { attachments: [...MAIN, ...XD] } }];
