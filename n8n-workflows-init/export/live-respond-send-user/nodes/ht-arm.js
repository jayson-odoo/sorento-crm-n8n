// ── ht-arm ── S1: was this the FIRST message of a new intervention? ─────────────────────────
//
// Runs between `ht-prev-stamp` (the redis GET, deliberately BEFORE the stamp is overwritten) and
// `ht-stamp` (the write). Its single job is to turn "was there a previous stamp" into one boolean
// the graph can branch on.
//
// WHY THIS IS A CODE NODE AND NOT AN `If` EXPRESSION. LESSONS §71: a review (and every offline
// suite in this repo) reads Code bodies; an If node's condition is a workflow PARAMETER and is
// invisible to both. Two load-bearing hunks shipped unreviewed that way and broke every
// multi-entitlement contact in production. So all of this feature's logic lives in Code, and the
// two `If` nodes downstream test nothing but a boolean this node already computed.
//
// ABSENT vs UNPARSEABLE. A missing stamp means a new intervention (notice fires — HT-1, and HT-7
// after a sweep has removed the key). An unparseable stamp is ALSO treated as new: the worst case
// is one duplicate notice, whereas treating it as a refresh would silently suppress the notice for
// that contact forever. Both are reported separately so the two are never confused in runData.

const g = $('ht-gate').first().json || {};
const prevRaw = ($('ht-prev-stamp').first().json || {}).ht_prev_ms;

const missing = prevRaw === null || prevRaw === undefined || String(prevRaw).trim() === '';
const prev_ms = missing ? null : Number(String(prevRaw).trim());
const unparseable = !missing && !Number.isFinite(prev_ms);

return [{
  json: {
    contact_id: g.contact_id,
    ht_now_ms: g.ht_now_ms,
    ht_prev_ms: unparseable ? null : prev_ms,
    ht_prev_raw: prevRaw === undefined ? null : prevRaw,
    ht_is_first: missing || unparseable,
    ht_first_because: missing ? 'no-previous-stamp' : (unparseable ? 'unparseable-previous-stamp' : null),
    ht_gap_ms: !missing && !unparseable ? g.ht_now_ms - prev_ms : null,
    ht_timeout_sec: g.ht_timeout_sec,
    ht_timeout_min: g.ht_timeout_min,
    ht_notice: g.ht_notice,
    test_run_id: g.test_run_id === undefined ? null : g.test_run_id,
  },
}];
