// ── ht-config-apply ── S3 config form: normalise + validate one submission ──────────────────────
//
// The form is the only sanctioned way to move the three runtime knobs. It writes redis, so the
// validation here is the whole safety story of S3:
//
//   timeout minutes → seconds, CLAMPED to a 60 s floor. UAC HT-15 submits 0; redis must never see
//                     0 (a 0 s timeout would clear every flag on the next tick and blast a notice
//                     to everyone in the pilot). Clamp + report, rather than reject, so the user
//                     always gets a definite state back on the completion screen.
//   kill switch     → the exact strings "1"/"0". `ht-gate` accepts ONLY "1" as on, so any other
//                     spelling written here silently disables the feature — hence normalise once,
//                     here, and echo what was written.
//   pilot ids       → comma-separated string (see the plan's redis deviation note: the native Redis
//                     node cannot maintain a real SET — its `set` writes a single scalar and there
//                     is no SREM). Empty means EVERYONE, which is the announce flip and therefore
//                     the highest-blast-radius value the form can write: it is echoed explicitly as
//                     "everyone" rather than as an empty string.
//
// Non-numeric / negative / absent minutes do NOT fall back to "whatever was there" — they resolve
// to the documented default (300 s), so the state after a submission is always fully determined by
// that submission.

const FLOOR_SEC = 60;
const DEFAULT_SEC = 300;

const f = ($input.all()[0] && $input.all()[0].json) || {};

// The n8n Form Trigger keys its output by FIELD LABEL. Accept the label and a couple of tolerant
// aliases so a label tweak in the UI cannot silently produce a default-everything write.
function pick(obj, names) {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] !== undefined) return obj[n];
  }
  return undefined;
}

const rawMinutes = pick(f, ['Timeout (minutes)', 'timeout_minutes', 'timeout']);
const rawKill = pick(f, ['Feature', 'kill_switch', 'enabled']);
const rawPilot = pick(f, ['Pilot contact IDs', 'pilot_contacts', 'pilot']);

const notes = [];

// WHOLE MINUTES ONLY (finding #3, rev5). The form accepted fractional minutes — 1.5 became 90 s — while
// `ht-gate` renders the notice as `round(sec/60)`. A contact was therefore told "inactive for 2 minutes"
// under a 90-second timeout: the reply the customer reads misstates the actual timeout by up to ~50%.
// Rounding here rather than in the renderer keeps `ht:timeout-sec` a multiple of 60, so every consumer
// (this notice, the sweeper cutoff, the completion echo) agrees by construction instead of by luck.
const rawMinutesNum = Number(String(rawMinutes == null ? '' : rawMinutes).trim());
let minutes = Number.isFinite(rawMinutesNum) ? Math.round(rawMinutesNum) : rawMinutesNum;
let timeout_sec;
if (!Number.isFinite(minutes) || minutes <= 0) {
  timeout_sec = DEFAULT_SEC;
  notes.push(
    `timeout ${JSON.stringify(rawMinutes)} is not a positive number — using the default ` +
    `${DEFAULT_SEC / 60} minutes`
  );
} else {
  if (Number.isFinite(rawMinutesNum) && rawMinutesNum !== minutes) {
    notes.push(`timeout ${rawMinutesNum} min is not a whole number — rounded to ${minutes} minute(s), ` +
               `so the notice text and the actual timeout cannot disagree`);
  }
  timeout_sec = minutes * 60;
  if (timeout_sec < FLOOR_SEC) {
    notes.push(`timeout ${minutes} min is below the ${FLOOR_SEC}s floor — clamped to 1 minute`);
    timeout_sec = FLOOR_SEC;
  }
}

const killStr = String(rawKill == null ? '' : rawKill).trim().toLowerCase();
const KILL_ON = ['on', '1', 'true', 'enabled'];
const KILL_OFF = ['off', '0', 'false', 'disabled'];
const enabled = KILL_ON.indexOf(killStr) !== -1;
// An UNRECOGNISED non-empty value used to write OFF with an EMPTY notes[] (finding #4, rev5) — the note
// only fired on ''. So relabelling the dropdown option (say "on" -> "Enabled ✅") silently disabled the
// whole feature and the completion screen reported success with nothing to look at. Fail-closed is right;
// fail-closed and SILENT is how a feature stays off for a month. Say what was seen and what was written.
if (killStr === '') {
  notes.push('kill switch not supplied — writing OFF (fail-closed)');
} else if (KILL_ON.indexOf(killStr) === -1 && KILL_OFF.indexOf(killStr) === -1) {
  notes.push(`kill switch value ${JSON.stringify(rawKill)} is not recognised — writing OFF ` +
             `(fail-closed). Recognised as ON: ${KILL_ON.join('/')}; as OFF: ${KILL_OFF.join('/')}. ` +
             `If the form's dropdown labels changed, the feature is now DISABLED.`);
}

const pilot_ids = String(rawPilot == null ? '' : rawPilot)
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x.length > 0);
const nonNumeric = pilot_ids.filter((x) => !/^[0-9]+$/.test(x));
if (nonNumeric.length) {
  notes.push(`pilot ids that are not numeric respond.io ids: ${nonNumeric.join(', ')}`);
}

return [{
  json: {
    timeout_sec,
    timeout_min: Math.max(1, Math.round(timeout_sec / 60)),
    enabled,
    enabled_value: enabled ? '1' : '0',
    pilot_ids,
    pilot_csv: pilot_ids.join(','),
    pilot_scope: pilot_ids.length ? `${pilot_ids.length} pilot contact(s)` : 'EVERYONE',
    clamped: timeout_sec === FLOOR_SEC && Number.isFinite(minutes) && minutes * 60 < FLOOR_SEC,
    notes,
    submitted_raw: f,
  },
}];
