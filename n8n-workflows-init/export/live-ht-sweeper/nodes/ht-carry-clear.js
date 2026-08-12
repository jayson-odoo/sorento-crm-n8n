// ── ht-carry-clear ── S2: re-attach the fields the DELETE and the SEND need, across the egress node ──
//
// EXISTS BECAUSE OF REVIEWER R1 — F-RECHECK's class recurring one node DOWNSTREAM, on the promote path,
// invisible to every gate that already exists.
//
// `ht-forget.key` reads `$json.contact_id` and `ht-timeout-notice` reads `$json.contact_id` +
// `$json.ht_timeout_notice`. On the BUILD those resolve, because `ht-clear-flag` is a Code stand-in that
// deliberately re-forwards both and `ht-egress-log` is a redis `push` (a passthrough). At S4
// `ht-clear-flag` becomes the real respondio CONTACTS/UPDATE_CONTACT node, whose real output — measured
// on live `respond-send-user`, execution 12146305 — is exactly:
//
//     {"contactId": 423755030}
//
// `contactId` only. No `contact_id`, no notice text. So on live, unfixed: `ht-forget` would delete
// `ht:active:` (empty suffix) and miss, and `ht-timeout-notice` would fire with an EMPTY RECIPIENT and an
// EMPTY BODY — the customer-facing notice, the entire point of the feature, malformed on a real send path.
//
// This is LESSONS §65 verbatim: before promoting a hunk verified on the clone, diff the clone's INBOUND
// EDGES against live's, because a substituted upstream changes what `$json` means without changing a line
// of the node you tested. `assert-built.py` C9 could not see it — C9 resolved against the STAND-IN's
// fields, which are correct. C9 is now extended (the promote-shape pass) to resolve against each
// converted node's REAL recorded output, and that pass was shown RED on the rev2 graph before this node
// existed.
//
// WHY MATCH BY IDENTITY RATHER THAN INDEX. `ht-classify` emits a row for EVERY candidate — skips,
// forget-silent, forget-unknown and clear-and-notify alike — while only the clear-and-notify subset
// reaches here. So index alignment against `$('ht-classify')` is simply wrong, and the reviewer's
// suggested `.item` paired-item walk is unavailable in a runOnceForAllItems node (and would be a lineage
// walk through the egress node). Matching on the id the egress node itself reports is exact, needs no
// lineage, and works identically on the stand-in and the real node — both emit `contactId`.
//
// It also RE-CHECKS AUTHORISATION. The notice may only fire for a row `ht-classify` decided was
// `clear-and-notify`; anything else here means the graph is not the graph we think it is, and it is
// refused rather than sent. Cheap, and it is the last gate before a real WhatsApp send at S4.

function nodeAll(name) {
  let n;
  try { n = $(name); } catch (e) {
    throw new Error('ht-carry-clear: ' + name + ' is unreachable — refusing to send or delete');
  }
  if (!n || n.isExecuted === false) {
    throw new Error('ht-carry-clear: ' + name + ' did not execute — refusing to send or delete');
  }
  return n.all();
}

const decisions = new Map();
for (const it of nodeAll('ht-classify')) {
  const j = it.json || {};
  const cid = String(j.contact_id == null ? '' : j.contact_id).trim();
  if (!cid) continue;
  if (decisions.has(cid)) {
    throw new Error('ht-carry-clear: two decisions for contact ' + cid + ' — ambiguous, refusing');
  }
  decisions.set(cid, j);
}

return $input.all().map((it, i) => {
  const j = it.json || {};
  // The real respondio node reports `contactId`; the stand-in reports both. Read the real field first so
  // this node is not quietly depending on the stand-in's extra one.
  const raw = j.contactId !== undefined && j.contactId !== null ? j.contactId : j.contact_id;
  const contact_id = String(raw == null ? '' : raw).trim();
  if (!contact_id) {
    throw new Error(
      'ht-carry-clear: the contact update returned no contactId, so the contact whose flag was just ' +
      'cleared cannot be identified. Refusing to derive a redis DELETE key or send a notice.'
    );
  }
  const d = decisions.get(contact_id);
  if (!d) {
    throw new Error(
      'ht-carry-clear: no ht-classify decision for contact ' + contact_id + ' — refusing to send a ' +
      'notice to a contact this tick never authorised.'
    );
  }
  if (d.action !== 'clear-and-notify') {
    throw new Error(
      'ht-carry-clear: contact ' + contact_id + ' reached the notify path with action ' +
      JSON.stringify(d.action) + '. Only clear-and-notify authorises a send. Refusing.'
    );
  }
  return {
    json: {
      contact_id,
      contactId: Number(contact_id),
      ht_timeout_notice: d.ht_timeout_notice,
      action: d.action,
      age_ms: d.age_ms === undefined ? null : d.age_ms,
      flag_raw: d.flag_raw === undefined ? null : d.flag_raw,
    },
    pairedItem: { item: i },
  };
});
