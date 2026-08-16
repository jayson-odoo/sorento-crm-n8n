// ── ht-sweep-armed ── S2: decide whether this tick may scan the keyspace AT ALL ──────────────────
//
// FINDING #6 (rev5): the kill-switch was only consulted inside `ht-sweep-census`, which runs AFTER
// `ht-sweep-keys`. So a dark-shipped feature — the intended state between the S4 promote and the flip,
// potentially weeks — still paid the full cost every 30 seconds: a `KEYS ht:active:*` scan plus a GET per
// matching key, on the SHARED PRODUCTION redis, to produce a census that was then discarded.
//
// That cost is not incidental. `KEYS` is O(total keyspace) on a single-threaded server (reviewer R6), so
// it is a function of the whole prod keyspace — message lists, per-contact concurrency locks, the ttl:1
// rate-limit counters — and is independent of how many contacts are in the pilot. Paying it for a feature
// that is switched OFF is the worst version of the trade.
//
// This node gates the scan on the kill-switch. `ht-sweep-census` keeps its OWN check as defence in depth
// (it also covers the per-candidate reasons), so removing this node degrades cost, never safety.
//
// FAIL-CLOSED IN THE COST DIRECTION TOO: a config read that FAILS does not scan. Same reasoning as the
// allowlist fix — "I could not read the kill-switch" is not permission to hit prod redis every 30 s.
//
// ⚠️ UAC IMPACT — HT-11's assertions change. With the kill-switch off, `ht-sweep-keys` and
// `ht-sweep-census` no longer appear in runData at all, so HT-11 can no longer assert
// "census shows skip_reason: kill-switch-off". Assert instead: `ht-armed?` took output 1, `ht-sweep-idle`
// ran, and `ht-sweep-keys` / `ht-sweep-census` / `ht-findcontact` are ABSENT from runData — which is a
// strictly stronger statement (nothing was even read) and is asserted on node presence, not a status.

function readNode(nodeName, prop) {
  let n;
  try { n = $(nodeName); } catch (e) { return { ok: false, why: nodeName + ' is unreachable' }; }
  if (!n) return { ok: false, why: nodeName + ' resolved to nothing' };
  if (n.isExecuted === false) return { ok: false, why: nodeName + ' did not execute' };
  let f;
  try { f = n.first(); } catch (e) { return { ok: false, why: nodeName + ' produced no item' }; }
  if (!f || !f.json) return { ok: false, why: nodeName + ' produced no json' };
  if (!Object.prototype.hasOwnProperty.call(f.json, prop)) {
    return { ok: false, why: nodeName + " carried no '" + prop + "' property (propertyName drift?)" };
  }
  return { ok: true, value: f.json[prop] };
}

const r = readNode('ht-sweep-enabled', 'ht_enabled');
const ht_enabled = r.ok && r.value !== null && r.value !== undefined && String(r.value).trim() === '1';
const ht_armed = ht_enabled;

return [{
  json: {
    ht_enabled,
    ht_armed,
    ht_not_armed_because: ht_armed ? null : (r.ok ? 'kill-switch-off' : 'config-read-failure: ' + r.why),
    // what this tick declined to do, so a quiet tick is legible in runData rather than just absent
    ht_skipped_work: ht_armed ? null : 'KEYS scan + per-key GETs on the shared redis',
  },
}];
