// ── ht-gate ── S1 trigger-side gate + notice renderer (human-intervened-timeout) ───────────────
//
// WHERE IT RUNS. `respond-send-user`, on the existing `If[0]` branch (source == "User"),
// immediately downstream of `Update a Contact`. It is ADDITIVE: the existing flag/SLA lane is
// untouched and runs whether or not this lane acts.
//
// WHY IT READS BY NAME. `Update a Contact` emits only `{contactId}`, and the n8n Redis node's
// `get` operation emits a FRESH item (`{json:{}}` + the one property) rather than passing the
// upstream item through — so chaining three config reads DROPS the earlier values. The only
// survivable channel is `$('<node>')`. LESSONS §5/§63: `$('x')` reads are not redirected by
// rewiring, which is exactly why the fork keeps a name-preserving `Respond.io Trigger` stand-in.
//
// FAIL-CLOSED DIRECTION. Every parse failure resolves to "do not act":
//   - `enabled` must be the exact string "1". Absent / "0" / "true" / garbage ⇒ OFF.
//     Rationale: mis-parsing toward OFF restores the status quo (the known bug); mis-parsing
//     toward ON sends WhatsApp notices to real contacts who were never in the pilot.
//   - a non-empty pilot list acts as an ALLOWLIST; empty/absent means everyone (the announce flip).
//   - `source` is re-checked here even though the upstream `If` already gated it. Two independent
//     gates, so HT-3 has an instrument that does not depend on reading the If's branch counts.
//
// THE KEY PREFIX IS NOT OWNED HERE — ON PURPOSE. The redis node key strings are LITERALS
// (`test:ht:` in the harness fork, `ht:` on live). Deriving the prefix from the payload would let
// a malformed harness envelope reach the canonical `ht:*` namespace, which is a hard fail
// (LESSONS §53: never share a mutable key namespace between clone and prod). Fail-closed by
// construction beats fail-closed by flag.
//
// OUTPUT: exactly one item. `ht_should_act` is the only field the graph branches on.

const DEFAULT_TIMEOUT_SEC = 300;
const FLOOR_TIMEOUT_SEC = 60;
// Pluralised (reviewer R8). The config form accepts 1 minute and the floor is 60 s, so "1 minutes" was
// reachable and customer-facing. The harness previously PINNED that ungrammatical string as intended —
// LESSONS §73: a pin that blesses half a value becomes a defect when the other half gains teeth.
const notice = (min) =>
  `You're now chatting with our team. If the team is inactive for ${min} ` +
  `minute${min === 1 ? '' : 's'}, our AI assistant will resume automatically.`;

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

// Comma-separated STRING, not a redis SET: the native n8n Redis node's `set` writes a single
// scalar (SADD of one member) and has no SREM, so a set could be read but never maintained.
// See the deviation note in plans/human-intervened-timeout-plan.md.
function parsePilot(v) {
  if (v === null || v === undefined) return [];
  const raw = Array.isArray(v) ? v : String(v).split(',');
  return raw.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

const env = $('Respond.io Trigger').first().json || {};
const contactRaw = env.contact ? env.contact.id : undefined;
const contact_id =
  contactRaw === null || contactRaw === undefined || String(contactRaw).trim() === ''
    ? ''
    : String(contactRaw).trim();
const source = env.source === null || env.source === undefined ? null : String(env.source);

const rEnabled = readNode('ht-cfg-enabled', 'ht_enabled');
const rTimeout = readNode('ht-cfg-timeout', 'ht_timeout_sec');
const rPilot = readNode('ht-cfg-pilot', 'ht_pilot');
const ht_config_read_failures = [rEnabled, rTimeout, rPilot].filter((r) => !r.ok).map((r) => r.why);

const ht_enabled = rEnabled.ok && parseEnabled(rEnabled.value);
const ht_timeout_sec = parseTimeoutSec(rTimeout.ok ? rTimeout.value : undefined);
const ht_pilot = rPilot.ok ? parsePilot(rPilot.value) : [];
const ht_pilot_active = ht_pilot.length > 0;
const ht_allowlisted = !ht_pilot_active || ht_pilot.indexOf(contact_id) !== -1;

let ht_skip_reason = null;
// FIRST, and ahead of the kill-switch: if any config leg could not be READ we do not know the state of
// the allowlist, and "I could not read it" must never resolve to "act on everyone".
if (ht_config_read_failures.length) ht_skip_reason = 'config-read-failure';
else if (!ht_enabled) ht_skip_reason = 'kill-switch-off';
else if (source !== 'User') ht_skip_reason = 'source-not-user';
else if (!contact_id) ht_skip_reason = 'no-contact-id';
else if (!ht_allowlisted) ht_skip_reason = 'not-in-pilot-allowlist';

const ht_should_act = ht_skip_reason === null;
const ht_timeout_min = Math.max(1, Math.round(ht_timeout_sec / 60));
const NOW = typeof $now !== 'undefined' && $now && typeof $now.toMillis === 'function'
  ? $now.toMillis()
  : Date.now();

return [{
  json: {
    contact_id,
    source,
    ht_enabled,
    ht_timeout_sec,
    ht_timeout_min,
    ht_pilot,
    ht_pilot_active,
    ht_allowlisted,
    ht_should_act,
    ht_skip_reason,
    ht_config_read_failures,
    ht_now_ms: NOW,
    ht_notice: notice(ht_timeout_min),
    // carried so the harness sendmsg stand-in can key its egress log; null on live, which the
    // real sendmsg sub ignores.
    test_run_id: env.test_run_id === undefined ? null : env.test_run_id,
  },
}];
