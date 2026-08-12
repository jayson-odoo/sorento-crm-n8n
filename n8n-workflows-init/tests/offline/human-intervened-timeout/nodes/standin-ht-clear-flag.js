// STAND-IN for the sweeper's ONLY contact write: respondio CONTACTS/UPDATE_CONTACT setting
// is_human_intervened = false. At S4 this becomes the real credentialed node; here it is a Code node
// so the build copy's JSON contains no credentialed respondio node at all (UAC 0 S8 — assert on node
// TYPE, never on an absent credentials block, which MCP redacts anyway).
//
// MAPS EVERY ITEM. A tick can carry more than one expired contact, and `$input.first()` in a
// runOnceForAllItems node would silently clear one and drop the rest.
//
// It re-forwards contact_id and the notice text because every node between here and the send
// (`ht-egress-log` push, `ht-forget` delete) is a PASSTHROUGH redis operation — so those fields reach
// the log and the message body without depending on n8n paired-item lineage through a sub-workflow
// call. `$('ht-clear-flag').first()` would be item 0 for every row of a multi-contact tick.
//
// The `_standin` block is what `ht-egress-log` pushes to `test:egress:{test_run_id}`, so HT-8's
// "logged {would_write, blocked:true}" assertion reads a real redis record, not runData alone.
return $input.all().map((it, i) => {
  const j = it.json || {};
  return {
    json: {
      contactId: Number(j.contact_id),
      contact_id: j.contact_id,
      ht_timeout_notice: j.ht_timeout_notice,
      _standin: {
        guard: 'ht-clear-flag',
        kind: 'would_write',
        blocked: true,
        target: 'respondio:contact:UPDATE_CONTACT',
        payload: { contactId: Number(j.contact_id), fields: { is_human_intervened: false } },
        action: j.action,
        reason: j.reason,
        flag_raw: j.flag_raw === undefined ? null : j.flag_raw,
        age_ms: j.age_ms === undefined ? null : j.age_ms,
      },
    },
    pairedItem: { item: i },
  };
});
