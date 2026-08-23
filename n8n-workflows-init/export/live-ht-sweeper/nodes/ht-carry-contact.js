// ── ht-carry-contact ── S2: pair each expired candidate with its contact lookup ─────────────────
//
// EXISTS BECAUSE OF F-RECHECK (tester, 2026-08-12). `ht-recheck-stamp`'s key expression reads
// `$json.contact_id`, but its former upstream `ht-findcontact` emits a respond.io CONTACT — whose id
// field is `id`, never `contact_id`. Every recheck missed, `ht-classify` always answered
// `skip-vanished`, and the clear/notify/forget path was structurally unreachable: flags never cleared.
// Failed safe, but inert. `assert-built.py` C9 is the gate that now closes that class.
//
// REWRITTEN rev3 for reviewer R2 + R3, which turned out to be one defect wearing two hats:
//
//   R2 (fail-open guard). `if (fetchedId && fetchedId !== contact_id) throw` demanded a CONTRADICTION,
//   not an identification: a payload with no `id` short-circuited the refusal and flowed on to
//   `clear-and-notify`, authorising a flag write and a WhatsApp notice off a contact never positively
//   identified. Measured. The header claimed the node "owns the mis-attribution refusal", which was
//   stricter than the mechanism delivered — LESSONS §70b, inverted.
//
//   R3 (stamp leak on not-found). On a hard not-found the findcontact sub returns ZERO items. Under the
//   old INDEX-ALIGNED pairing that made this node THROW — so a single deleted or unknown contact did not
//   merely leak its stamp, it **wedged the sweeper permanently**: every subsequent tick errored, and
//   because the stamp is never removed the condition never cleared itself. Measured. The literal R2 fix
//   (throw on an id-less payload) has the identical shape, so fixing R2 alone would have hardened a
//   permanent-outage path.
//
// So pairing is now BY IDENTITY, not by index, with three outcomes and no unreachable arm:
//
//   paired            the lookup returned exactly this contact          → carry on to the recheck
//   lookup_missing    no lookup came back for this candidate            → `forget-unknown`: the stamp is
//                     (deleted contact, hard not-found, zero items)       REAPED, with ZERO flag write
//                                                                         and ZERO notice
//   THROW             a lookup came back for a contact NOBODY asked for → refuse the whole tick
//
// R2 is satisfied more strongly than by throwing: an unidentified payload cannot reach
// `clear-and-notify` at all, and the tick survives. R3's reaper falls out for free — `forget-unknown`
// routes to the existing `ht-forget-silent`, so no new wiring and no new egress surface. That also stops
// feeding D1's `KEYS ht:active:*` cost, which R6 raises to a pre-ACTIVATION measurement.
//
// PROMOTE-SAFE. At S4 `ht-findcontact` becomes the real `executeWorkflow` call to
// `sorento-sub-respond-findcontact-respond`, which returns the same raw shape (`id`, no `contact_id`) and
// zero items on a miss. Identity pairing needs no `alwaysOutputData` and tolerates missing, extra or
// reordered items, so it behaves the same on both. **S4 must promote this node** — without it the
// promoted sweeper is the dead feature F-RECHECK described.
//
// NO `.first()`: a tick can carry several contacts and `.first()` is silently item 0 for every row
// (assert-built.py C9 forbids it inside the per-item region).

function nodeAll(name) {
  let n;
  try { n = $(name); } catch (e) {
    throw new Error('ht-carry-contact: ' + name + ' is unreachable — refusing to pair');
  }
  if (!n || n.isExecuted === false) {
    throw new Error('ht-carry-contact: ' + name + ' did not execute — refusing to pair');
  }
  return n.all();
}

const candidates = nodeAll('ht-sweep-fanout');
const lookups = $input.all();

// Index the lookups by the id they positively identify. An item with no usable id identifies nothing,
// so it is counted and never matched — it can only ever produce a `lookup_missing` row.
const byId = new Map();
let unidentifiable = 0;
for (const it of lookups) {
  const j = it.json || {};
  const id = j.id === null || j.id === undefined ? '' : String(j.id).trim();
  if (!id) { unidentifiable++; continue; }
  if (byId.has(id)) {
    throw new Error(
      'ht-carry-contact: two lookups both claim contact ' + id + ' — ambiguous, refusing to pair. ' +
      'A redis stamp key is unique per contact, so this should be unreachable.'
    );
  }
  byId.set(id, j);
}

const wanted = new Set();
for (const c of candidates) {
  const cid = String((c.json || {}).contact_id == null ? '' : (c.json || {}).contact_id).trim();
  if (!cid) throw new Error('ht-carry-contact: candidate carries no contact_id — refusing to pair');
  wanted.add(cid);
}
// A contact nobody asked for is DROPPED, not thrown on (finding #2, rev5).
//
// Throwing here refused the ENTIRE tick, and the stamps survive an error — so a single mis-attributed
// lookup recurred every 30 s forever and wedged the sweeper instance-wide. That is the exact R3 outage
// shape this file's own header documents, reintroduced on the adjacent branch: the realistic trigger is a
// respond.io CONTACT MERGE, where looking up a deleted id returns the surviving contact's id, and it is
// permanent by construction because nothing ever removes the stamp that keeps re-triggering it.
//
// Dropping is also the semantically correct answer, not merely the safe one: if a lookup for candidate X
// comes back as some other contact, then X is gone (merged or deleted). Its candidate now pairs with
// nobody, so the existing `forget-unknown` path reaps X's stamp with ZERO egress — which is precisely
// what should happen to a merged-away contact. No key is ever derived from the stranger.
const strangers = [];
for (const id of Array.from(byId.keys())) {
  if (!wanted.has(id)) {
    strangers.push(id);
    byId.delete(id);
  }
}

return candidates.map((c, i) => {
  const src = c.json || {};
  const contact_id = String(src.contact_id).trim();
  const contact = byId.has(contact_id) ? byId.get(contact_id) : null;
  return {
    json: {
      // `contact_id` is what `ht-recheck-stamp`'s key expression reads. It is always the CANDIDATE's
      // id — the contact we decided to expire — never whatever a lookup happened to return.
      contact_id,
      contact,
      lookup_missing: contact === null,
      lookup_missing_reason: contact === null
        ? (lookups.length === 0
            ? 'the contact lookup returned no items at all (hard not-found)'
            : (strangers.length
                ? 'no lookup item identified this contact; the tick returned contact(s) nobody asked ' +
                  'for (' + strangers.join(',') + ') — consistent with a merged or deleted contact'
                : 'no lookup item positively identified this contact (' + unidentifiable +
                  ' unidentifiable item(s) in this tick)'))
        : null,
      // surfaced per row so a merge shows up in runData instead of being inferred from a reap
      lookup_strangers: strangers,
      key: src.key === undefined ? null : src.key,
      score_ms: src.score_ms === undefined ? null : src.score_ms,
      age_ms: src.age_ms === undefined ? null : src.age_ms,
      cutoff_ms: src.cutoff_ms === undefined ? null : src.cutoff_ms,
      now_ms: src.now_ms === undefined ? null : src.now_ms,
      ht_timeout_sec: src.ht_timeout_sec === undefined ? null : src.ht_timeout_sec,
    },
    pairedItem: { item: i },
  };
});
