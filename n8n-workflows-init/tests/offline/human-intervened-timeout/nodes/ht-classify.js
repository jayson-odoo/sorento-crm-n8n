// ── ht-classify ── S2 sweeper: decide, per expired contact, what may be done to it ──────────────
//
// This is the only node that authorises the two egress actions (`is_human_intervened: false` write
// and the timeout WhatsApp notice), so it is written to REFUSE rather than guess.
//
// THREE OUTCOMES, and they are not the same shape as "true/false":
//   clear-and-notify  the flag is still true and the stamp has not moved  → write + notify + forget
//   forget-silent     the flag is already false (a human closed manually) → forget the stamp, ZERO
//                     sends. This is the ghost-message gate (HT-9).
//   forget-unknown    the contact lookup returned nothing for this        → forget the stamp, ZERO
//                     candidate (deleted / unknown contact)                sends, ZERO flag write.
//                     Added rev3 for reviewer R3: without it a hard not-found either leaked the stamp
//                     forever or — under the old index-aligned pairing — THREW, wedging the sweeper
//                     permanently. Routes to the existing `ht-forget-silent`, so no new wiring.
//   skip-*            the stamp vanished or moved forward under us        → touch nothing at all
//
// WHY THE RE-READ. Plan §S2.5 lists a stamp re-read as an OPTIONAL tightening. It is implemented
// (and recorded as an addition in the plan) because the failure it prevents is customer-visible:
// a human replying while the tick is in flight would otherwise have their intervention cleared and
// the contact told "our team seems to be away" mid-conversation. One redis GET, one predicate.
//
// ABSENT vs PRESENT-BUT-EMPTY (LESSONS §64). Two different malformed shapes, two different
// answers, neither of them a silent pass:
//   - `custom_fields` not an array          → THROW. The payload is not a respond.io contact; a
//                                             hand-built fixture that omits it must ERROR, not pass
//                                             (UAC HT-FP4 exists to prove this).
//   - `is_human_intervened` absent from the array → the contact genuinely has no such field ⇒
//                                             treat as not-intervened ⇒ forget-silent.
//   - value present but an unrecognised encoding   → THROW. respond.io stores this as the STRING
//                                             "true"/"false" (verified against a real FIND_CONTACT
//                                             payload, execution 12166204); anything else means the
//                                             contract moved and guessing would clear real flags.
//
// WHY THE CANDIDATES ARE READ BY NAME AND NOT FROM `$input`. The node immediately upstream is
// `ht-recheck-stamp`, a Redis `get` — and the Redis node's `get` emits a FRESH item (`{json:{}}` plus
// the one property it was asked for) instead of passing its input through. So `$input.all()[i].json`
// here is `{ht_recheck_ms: …}` with NO contact_id and NO cutoff_ms. Reading the candidates from
// `$input` would be a textbook §63 wrong-object read: sound logic, correct-looking assertions,
// pointed at the wrong payload. (It was written that way first and caught by re-deriving the wiring;
// the offline harness had been stubbing `$input` with the fan-out items, so the suite would have gone
// green against a body that throws in production.) Only `push`/`set`/`delete` are passthrough.
//
// INDEX ALIGNMENT. `ht-carry-contact` and `ht-recheck-stamp` each run once per fan-out item, so both
// are index-aligned with each other. That is asserted, not assumed.
//
// The candidate and its contact arrive already paired from `ht-carry-contact` (added for F-RECHECK),
// which also owns the mis-attribution refusal — deliberately upstream of here, because the redis key
// `ht-recheck-stamp` reads is derived BEFORE this node runs, so a guard sitting here would fire after
// the wrong key had already been read.

const TRUEY = ['true', '1', 'yes'];
const FALSEY = ['false', '0', 'no', ''];

function nodeAll(nodeName) {
  let n;
  try { n = $(nodeName); } catch (e) {
    throw new Error(`ht-classify: required node ${nodeName} is unreachable — refusing to classify`);
  }
  if (!n || n.isExecuted === false) {
    throw new Error(`ht-classify: required node ${nodeName} did not execute — refusing to classify`);
  }
  return n.all();
}

function readFlag(contact) {
  const cf = contact ? contact.custom_fields : undefined;
  if (!Array.isArray(cf)) {
    throw new Error(
      'ht-classify: contact payload has no custom_fields array — not a respond.io contact. ' +
      'Refusing to classify (a fixture missing custom_fields must fail loudly, not pass).'
    );
  }
  const row = cf.find((x) => x && x.name === 'is_human_intervened');
  if (!row) return { present: false, raw: null, flag: false };
  const raw = row.value;
  if (raw === null || raw === undefined) return { present: true, raw, flag: false };
  if (typeof raw === 'boolean') return { present: true, raw, flag: raw };
  const s = String(raw).trim().toLowerCase();
  if (TRUEY.indexOf(s) !== -1) return { present: true, raw, flag: true };
  if (FALSEY.indexOf(s) !== -1) return { present: true, raw, flag: false };
  throw new Error(
    `ht-classify: is_human_intervened has an unrecognised encoding ${JSON.stringify(raw)} — ` +
    'refusing to guess. respond.io stores this as the string "true"/"false".'
  );
}

const items = nodeAll('ht-carry-contact');
const rechecks = nodeAll('ht-recheck-stamp');

if (rechecks.length !== items.length) {
  throw new Error(
    `ht-classify: index misalignment — ${items.length} paired candidates but ` +
    `${rechecks.length} stamp re-reads. Refusing to classify mis-attributed rows.`
  );
}

return items.map((it, i) => {
  const src = it.json || {};
  const contact = src.contact === undefined ? null : src.contact;
  const contact_id = String(src.contact_id == null ? '' : src.contact_id).trim();

  const rj = (rechecks[i] && rechecks[i].json) || {};
  const rescoreRaw = rj.ht_recheck_ms;
  // `Number('') === 0`, so an ABSENT stamp used to be recorded as a re-read of epoch 0 rather than as no
  // re-read at all (finding #5b) — a skip-vanished row claimed `recheck_ms: 0`, which reads as a real
  // measurement. Track absence separately so the reported value can be null.
  const rescoreAbsent = rescoreRaw === null || rescoreRaw === undefined ||
                        String(rescoreRaw).trim() === '';
  const rescore = rescoreAbsent ? NaN : Number(String(rescoreRaw).trim());
  const cutoff_ms = Number(src.cutoff_ms);

  let action;
  let reason;
  if (rescoreAbsent) {
    action = 'skip-vanished';
    reason = 'stamp disappeared between the census and now — someone else already handled it';
  } else if (!Number.isFinite(rescore)) {
    action = 'skip-vanished';
    reason = 'stamp re-read is unparseable — refusing to act on it';
  } else if (!Number.isFinite(cutoff_ms)) {
    throw new Error('ht-classify: candidate carries no numeric cutoff_ms — refusing to classify');
  } else if (rescore > cutoff_ms) {
    action = 'skip-refreshed';
    reason = 'a human replied after the cutoff while this tick was in flight';
  } else if (src.lookup_missing === true) {
    // No positively-identified contact came back for this candidate. Reap the stamp; authorise nothing.
    // Deliberately NOT a throw: a throw here means one deleted contact errors every future tick, and
    // because the stamp survives the error the condition never clears itself (reviewer R2+R3).
    action = 'forget-unknown';
    reason = src.lookup_missing_reason || 'the contact lookup returned nothing for this candidate';
  } else {
    const f = readFlag(contact);
    if (f.flag) {
      action = 'clear-and-notify';
      reason = 'expired and still flagged as human-intervened';
    } else {
      action = 'forget-silent';
      reason = f.present
        ? 'flag already false — closed manually, nothing to announce'
        : 'contact has no is_human_intervened field — nothing to clear';
    }
  }

  const flagInfo = action === 'clear-and-notify' || action === 'forget-silent'
    ? readFlag(contact)
    : { present: null, raw: null, flag: null };   // forget-unknown has no contact to read

  return {
    json: {
      contact_id,
      action,
      reason,
      is_skip: action.indexOf('skip') === 0,
      lookup_missing: src.lookup_missing === true,
      flag: flagInfo.flag,
      flag_present: flagInfo.present,
      flag_raw: flagInfo.raw,
      score_ms: src.score_ms === undefined ? null : src.score_ms,
      recheck_ms: Number.isFinite(rescore) ? rescore : null,
      cutoff_ms: Number.isFinite(cutoff_ms) ? cutoff_ms : null,
      age_ms: src.age_ms === undefined ? null : src.age_ms,
      key: src.key === undefined ? null : src.key,
      ht_timeout_sec: src.ht_timeout_sec === undefined ? null : src.ht_timeout_sec,
      ht_timeout_notice:
        'Our team seems to be away at the moment. Our AI assistant is back to assist you.',
    },
    pairedItem: { item: i },
  };
});
