// ── ht-sweep-census ── S2 sweeper: the OBSERVABLE decision record for one tick ──────────────────
//
// WHY THIS IS A SEPARATE NODE FROM THE FAN-OUT. A Code node that emits 0 items ends its branch —
// which is the correct runtime behaviour for a quiet tick, and a terrible instrument: "no
// downstream nodes ran" is indistinguishable from "the node never looked at anything"
// (LESSONS §61b — never let empty checker output mean PASS; print the compared population).
// So this node ALWAYS emits exactly ONE item carrying the full census — scanned count, cutoff,
// every candidate with its age and its skip reason — and `ht-sweep-fanout` turns that into 0..N
// action items. HT-10/11/12 assert against THIS item, not against downstream absence alone.
//
// INPUT. One item from `ht-sweep-keys` (Redis `keys`, getValues = true), whose json is a MAP of
// `<prefix>active:<contact id>` -> stamp-in-ms-as-string. Non-matching keys are ignored and
// counted, never guessed at.
//
// NOTE ON `keys`. The native Redis node has no sorted-set support at all (operations are
// delete/get/incr/info/keys/llen/pop/publish/push/set), so the plan's ZSET contract is implemented
// as one string key per contact. `keys` is O(keyspace); see the plan's deviation note.
//
// FAIL-CLOSED: kill-switch off ⇒ zero candidates eligible, with the reason recorded on every row.

const DEFAULT_TIMEOUT_SEC = 300;
const FLOOR_TIMEOUT_SEC = 60;
const KEY_INFIX = 'active:';

// A config read has THREE outcomes, not two. Collapsing them is finding #1 (rev5): `readNode` used to
// return `undefined` both when the READ FAILED (node renamed, never executed, `propertyName` drift) and
// when the VALUE was legitimately absent (redis GET on a missing key returns null). `parsePilot(undefined)`
// is `[]`, and an empty allowlist means EVERYONE — so if only the pilot leg broke while `enabled` still
// read "1", the pilot phase acted on every real contact. Measured: contact 999999 got
// `ht_should_act: true` with the pilot node removed.
//
// The kill-switch already failed closed. The allowlist must too, and it is the one whose failure direction
// is a real customer receiving a message. Note the asymmetry that has to be preserved: an empty-string
// VALUE still means everyone — that is the announce flip, and it is deliberate — while a failed READ
// means "I do not know who is in the allowlist", which is not a permission to act.
//   { ok: true,  value }  the node ran and carried the property (value may legitimately be null)
//   { ok: false, why   }  the read itself failed — never treat this as "no allowlist"
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

function parseEnabled(v) {
  return v !== null && v !== undefined && String(v).trim() === '1';
}

function parseTimeoutSec(v) {
  const n = Number(String(v == null ? '' : v).trim());
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_SEC;
  return Math.max(FLOOR_TIMEOUT_SEC, Math.floor(n));
}

function parsePilot(v) {
  if (v === null || v === undefined) return [];
  const raw = Array.isArray(v) ? v : String(v).split(',');
  return raw.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

const rEnabled = readNode('ht-sweep-enabled', 'ht_enabled');
const rTimeout = readNode('ht-sweep-timeout', 'ht_timeout_sec');
const rPilot = readNode('ht-sweep-pilot', 'ht_pilot');
const ht_config_read_failures = [rEnabled, rTimeout, rPilot].filter((r) => !r.ok).map((r) => r.why);

const ht_enabled = rEnabled.ok && parseEnabled(rEnabled.value);
const ht_timeout_sec = parseTimeoutSec(rTimeout.ok ? rTimeout.value : undefined);
const ht_pilot = rPilot.ok ? parsePilot(rPilot.value) : [];
const ht_pilot_active = ht_pilot.length > 0;

const NOW = typeof $now !== 'undefined' && $now && typeof $now.toMillis === 'function'
  ? $now.toMillis()
  : Date.now();
const cutoff_ms = NOW - ht_timeout_sec * 1000;

const raw = ($input.all()[0] && $input.all()[0].json) || {};
const candidates = [];
let malformed = 0;

for (const key of Object.keys(raw)) {
  const at = key.lastIndexOf(KEY_INFIX);
  if (at === -1) { malformed++; continue; }
  const contact_id = key.slice(at + KEY_INFIX.length).trim();
  if (!contact_id) { malformed++; continue; }
  const scoreRaw = raw[key];
  const score_ms = Number(String(scoreRaw == null ? '' : scoreRaw).trim());
  if (!Number.isFinite(score_ms)) {
    // NOT NEGOTIABLE: a stamp we cannot parse is not quietly treated as "infinitely old" — that would
    // clear a live intervention on a typo. Recorded and skipped, so the tick stays visible and inert.
    // Known residual (rev5): such a stamp is therefore never reaped either, because the recheck reads the
    // same garbage and answers skip-vanished. Recorded in the manifest rather than half-fixed here.
    candidates.push({
      contact_id, key, score_ms: null, age_ms: null,
      expired: false, eligible: false, skip_reason: 'unparseable-stamp',
    });
    continue;
  }
  // A zero / negative stamp IS parseable — epoch 0, i.e. infinitely old. It used to share the
  // unparseable branch, which made it un-reapable forever while `ht-arm` treats 0 as a perfectly valid
  // stamp: the two nodes disagreed about the same value (finding #5). A garbage-but-numeric stamp must
  // not immortalise the flag, so it is expired and reapable. The flag check still gates the notice and
  // the recheck still reads the same value, so this authorises nothing that any other expired stamp
  // would not.
  const expired = score_ms <= cutoff_ms;
  let skip_reason = null;
  if (ht_config_read_failures.length) skip_reason = 'config-read-failure';
  else if (!ht_enabled) skip_reason = 'kill-switch-off';
  else if (ht_pilot_active && ht_pilot.indexOf(contact_id) === -1) skip_reason = 'not-in-pilot-allowlist';
  else if (!expired) skip_reason = 'not-expired';
  candidates.push({
    contact_id, key, score_ms, age_ms: NOW - score_ms,
    expired, eligible: skip_reason === null, skip_reason,
  });
}

return [{
  json: {
    ht_enabled,
    ht_timeout_sec,
    ht_pilot,
    ht_pilot_active,
    ht_config_read_failures,
    now_ms: NOW,
    cutoff_ms,
    scanned: Object.keys(raw).length,
    malformed_keys: malformed,
    candidates,
    eligible_count: candidates.filter((c) => c.eligible).length,
    skipped_count: candidates.filter((c) => !c.eligible).length,
  },
}];
