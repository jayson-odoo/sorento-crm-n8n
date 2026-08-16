// ── ht-sweep-driver ── HARNESS-ONLY: normalise one tick's driver payload ────────────────────────
//
// Has no live counterpart. Two jobs, both of which exist so a UAC case is deterministic:
//   * `test_run_id` — keys the egress log (`test:egress:{id}`) so a case can count its own sends
//     rather than inferring from silence.
//   * `fixtures`    — a per-contact tag map consumed by the `ht-findcontact` stand-in, e.g.
//                     {"437264483": "flag=false"}. This is how HT-8 and HT-9 differ: HT-9 needs the
//                     contact's is_human_intervened to already be false, and a real read would
//                     return whatever it happens to be right now.
//
// Why the tag does NOT ride on the redis stamp value: the census parses that value as a number and
// correctly rejects anything else as `unparseable-stamp`, so a tagged stamp would never reach the
// classifier at all. (Tried it; the census's own guard refused it, which is the guard working.)
//
// The Schedule Trigger path supplies no payload, so both default to "nothing special" — and the
// fixture default is deliberately the flag=true shape, i.e. the one that WOULD produce egress, so a
// case can never pass by silently getting the inert fixture.
const raw = $input.first().json || {};
const src = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const fixtures = src.fixtures && typeof src.fixtures === 'object' ? src.fixtures : {};
return [{ json: {
  test_run_id: src.test_run_id === undefined ? null : src.test_run_id,
  ht_case: src.ht_case === undefined ? null : src.ht_case,
  fixtures,
  driven_by: raw.body && typeof raw.body === 'object' ? 'webhook' : 'schedule-or-direct',
} }];
