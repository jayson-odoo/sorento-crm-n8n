// ── ht-sweep-fanout ── S2 sweeper: turn the census into 0..N per-contact action items ───────────
//
// Emits ONE item per ELIGIBLE candidate and nothing else. Zero items is the normal case and ends
// the branch, which is why the census (always exactly one item) is the thing assertions read.
// Deliberately dumb: every decision already happened in `ht-sweep-census`, so a mutation of the
// expiry/allowlist logic shows up in exactly one place.

const c = ($input.all()[0] && $input.all()[0].json) || {};
const cutoff_ms = c.cutoff_ms;
const now_ms = c.now_ms;

return (c.candidates || [])
  .filter((x) => x && x.eligible === true)
  .map((x) => ({
    json: {
      contact_id: x.contact_id,
      key: x.key,
      score_ms: x.score_ms,
      age_ms: x.age_ms,
      cutoff_ms,
      now_ms,
      ht_timeout_sec: c.ht_timeout_sec,
    },
  }));
