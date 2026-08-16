// ── crossdomain-compose ───────────────────────────────────────────────
// Folds the cross-domain block into the finished turn. Sits BETWEEN compile-current-state and its
// three consumers (send / guard-d-record / session-save-gate) so the escalate phrase reaches the
// customer text AND the persisted state in one place — the whole E1 reconciliation contract.
//
// FAIL-SILENT (plan F1): render not executed, or nothing found, -> pass the turn through byte-identical.
const o = $input.first().json;
const rNode = $('crossdomain-render');
if (!rNode.isExecuted) return [{ json: o }];

const rJson = rNode.first().json || {};
const xb = rJson._xdBlock || {};
const zs = rJson._xd || {};
if (xb.any !== true || !xb.block) return [{ json: o }];

const out = JSON.parse(JSON.stringify(o));
const v = out.variables || {};
if (typeof out.user_response !== 'string' || out.user_response.trim() === '') return [{ json: o }];

// Locked wording — this exact phrase is the regex contract read by the parser's output_exchange
// (/would you like me to escalate/i against previous_conversation_state.response). Do not reword.
const PHRASE = `Would you like me to escalate to ${xb.team} team?`;

// Structural discriminator: on an ANSWERED turn compile-current-state compresses state.response to
// `Previous turn (<domain>): …`. Every escalate/miss branch carries the message text instead.
const isAnswered = typeof v.response === 'string' && /^Previous turn \(/.test(v.response);

if (isAnswered) {
  // PARTIAL turn: some asked products came back empty. Mirror live #3's guard — only speak when the
  // turn actually answered something.
  if (!Array.isArray(v.last_result_set) || v.last_result_set.length === 0) return [{ json: o }];
  out.user_response = `${out.user_response}\n${xb.block}\n\n${PHRASE}`;
  // BOTH strings: visible text so the customer can act, state so the parser can reconcile the 'yes'.
  v.response = `${v.response}. ${PHRASE}`;
  out.quick_reply = out.quick_reply
    ? `${out.quick_reply},Yes escalate,No it's okay`
    : "Yes escalate,No it's okay";
} else {
  // TOTAL MISS: the block goes directly under the miss sentence and ABOVE whatever continues the
  // message (plan Q16/O1 — the direct fact outranks a consolation list, and must never sit below
  // the escalate question). State already carries the phrase on this branch, so state is left
  // alone (plan Q15).
  //
  // Markers, earliest wins, matched CASE-INSENSITIVELY (review F1). Several live arms render the
  // marker in lower case — build-suggest-offer's D1 multi-token arm emits `"tok" — did you mean:`
  // and `…or would you like me to escalate…`, and the two numbered arms emit
  // `Here are the closest matches:` followed by a lower-case escalate invite. Under a case-SENSITIVE
  // indexOf all of those returned -1 and the block fell through to the append-at-END fallback, i.e.
  // BELOW the numbered picker and BELOW the escalate question — the exact ordering defect X2 exists
  // to catch. Only a lower-cased COPY is searched; the original string is what gets sliced, so no
  // casing in the customer-visible text is altered.
  const MARKERS = [
    'Related products:',             // bso D3 sibling picker
    'Try:',                          // bso D2 alternatives, list mode
    'Did you mean',                  // bso D1 single-token code mode + D1 multi-token (`did you mean:`)
    'Here are the closest matches:', // bso D1 numbered mode + D2 numbered mode (uuid alternatives)
    'Would you like me to escalate', // catch-all: the frozen phrase, on every offer branch
  ];
  const hay = out.user_response.toLowerCase();
  let idx = -1;
  for (const mk of MARKERS) {
    const i = hay.indexOf(mk.toLowerCase());
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) {
    out.user_response = `${out.user_response}\n${xb.block}`;
  } else {
    // Insert at the start of the winning marker's own SENTENCE/LINE — never mid-line. On every arm
    // whose marker follows a sentence end (`No incoming stock (ETA) found for X. Related products:`)
    // this resolves to the marker index itself, so the previously tested arms are byte-identical.
    // On the D1 multi-token arm the marker sits mid-line (`"tok" — did you mean:`), where the raw
    // index would tear the picker's own header off its token; snapping to the line start puts the
    // block between the `Couldn't find some items:` lead-in and the candidate blocks instead.
    const nl  = out.user_response.lastIndexOf('\n', idx);
    const dot = out.user_response.lastIndexOf('. ', idx);
    const at  = Math.max(nl === -1 ? 0 : nl + 1, dot === -1 ? 0 : dot + 2);
    const head = out.user_response.slice(0, at).replace(/\s+$/, '');
    out.user_response = (head ? `${head}\n` : '') + `${xb.block}\n\n` + out.user_response.slice(at);
  }
}

out.variables = v;
// NOTE (review F2): no debug key is attached to the returned item. On live this node feeds
// `save-session-vars`, the conversation-variables PUT, which sends `JSON.stringify($json)` — the
// WHOLE item — so any stray top-level key here is persisted into the real customer session.
return [{ json: out }];