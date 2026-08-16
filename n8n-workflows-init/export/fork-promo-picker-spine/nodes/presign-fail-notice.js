// ── presign-fail-notice ────────────────────────────────────────────────────
// Fed by `get-presigned-url`[main:1] — its ERROR output, which was UNWIRED (here AND on live).
// Consequence being fixed: `get-presigned-url` has `onError: continueErrorOutput`, so a presign
// failure was swallowed, the execution stayed `success`, and the customer read the file-mention
// sentence with no file attached. The mention is sent FIRST (sendmsg-respond2) and cannot be
// retracted, so the only correction available is a short follow-up. User decision 2026-08-04:
// keep the mention, wire this path.
//
// ONCE PER TURN — three independent reasons, not one:
//   1. `get-presigned-url`'s only inbound is `Remove Duplicates` (no loop back-edge reaches it), so
//      it executes exactly ONE node-run per turn. The attachment loop (`Loop Over Items1`) is
//      DOWNSTREAM of it.
//   2. An httpRequest with `onError: continueErrorOutput` emits ALL failed items on main[1] within
//      that single run, and this Code node is `runOnceForAllItems` — N failures collapse into one
//      execution of this body and exactly ONE output item.
//   3. The `$runIndex` guard below is the backstop if (1) ever stops holding after a rewire.
if ($runIndex > 0) return [];

// MENTION-ONLY GATE. Only apologise for a file the customer was actually promised.
// Two populations claim a file, and BOTH use this identical sentence:
//   (a) cross-domain — `crossdomain-render` appends it when `blocks.length && XD_FILES.length`;
//   (b) main answer — the CRM presenter sets `intro` to it whenever the envelope has attachments
//       (`sorento_crm_mcp/presenters.py:708`).
// So instead of gating on graph position, ask the DELIVERED text whether a claim was made.
// `crossdomain-compose` is the guaranteed source of that text: this whole chain is rooted at
// `sorento-sub-respond-sendmsg-respond2`[0], whose `message` input IS
// `crossdomain-compose.user_response`, on both If6 branches.
// Fails CLOSED: no literal in the delivered text → no item → the sendmsg caller does not execute,
// and the turn behaves exactly as it does today (silent drop). A file dropped on a turn that
// claimed nothing therefore produces no message.
const ATTACH_NOTE = 'I have attached the file(s) below.';

const delivered = (() => {
  try {
    const c = $('crossdomain-compose');
    if (!c.isExecuted) return '';
    const t = c.first().json.user_response;
    return typeof t === 'string' ? t : '';
  } catch (e) { return ''; }
})();

if (!delivered.includes(ATTACH_NOTE)) return [];

// Truthfulness on a PARTIAL failure: `Remove Duplicates` is `get-presigned-url`'s input, so its
// item count is the number attempted; `$input` here is the failed subset.
const failed = $input.all().length;
if (failed < 1) return [];
const total = (() => {
  try {
    const n = $('Remove Duplicates');
    return n.isExecuted ? n.all().length : failed;
  } catch (e) { return failed; }
})();

const notice = (total > failed)
  ? `Sorry — ${failed} of ${total} files didn't attach. Please ask again, or I can escalate this.`
  : `Sorry — I couldn't attach the file(s). Please ask again, or I can escalate this.`;

// Dead-end branch: emits a fresh item and mutates nothing. It never touches
// `crossdomain-compose`'s item (on live that item is the body of the session PUT — review F2),
// and writes no key into `last_result_set` / `selection_context`.
return [{ json: { notice, presign_failed: true, failed, total } }];
