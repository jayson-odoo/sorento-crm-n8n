// ── ht-config-echo ── S3: build the completion screen from a READ-BACK, not from the submission ──
//
// The point of the echo is to be honest about what redis now holds, so it is composed from the three
// `ht-readback-*` GETs rather than from `ht-config-apply`'s intentions. If a write silently failed,
// the screen says so instead of cheerfully repeating what the user typed — the same reason a
// zero-egress gate needs attribution rather than a count (UAC 0 S7).
const w = $('ht-config-apply').first().json;
const rbT = ($('ht-readback-timeout').first().json || {}).rb_timeout_sec;
const rbE = ($('ht-readback-enabled').first().json || {}).rb_enabled;
const rbP = ($('ht-readback-pilot').first().json || {}).rb_pilot;

const readback = {
  timeout_sec: rbT === null || rbT === undefined ? null : Number(String(rbT).trim()),
  enabled_value: rbE === null || rbE === undefined ? null : String(rbE).trim(),
  pilot_csv: rbP === null || rbP === undefined ? '' : String(rbP).trim(),
};
const mismatches = [];
if (readback.timeout_sec !== w.timeout_sec) mismatches.push(`timeout-sec: wrote ${w.timeout_sec}, redis holds ${JSON.stringify(rbT)}`);
if (readback.enabled_value !== w.enabled_value) mismatches.push(`enabled: wrote ${w.enabled_value}, redis holds ${JSON.stringify(rbE)}`);
if (readback.pilot_csv !== w.pilot_csv) mismatches.push(`pilot-contacts: wrote ${JSON.stringify(w.pilot_csv)}, redis holds ${JSON.stringify(rbP)}`);

const minutes = readback.timeout_sec === null ? null : Math.max(1, Math.round(readback.timeout_sec / 60));
const scope = readback.pilot_csv === '' ? 'EVERY contact' : readback.pilot_csv.split(',').join(', ');

const lines = [
  `Feature: ${readback.enabled_value === '1' ? 'ON' : 'OFF'}`,
  `Timeout: ${minutes === null ? '(not set)' : minutes + ' minute(s)'}  [${readback.timeout_sec} s]`,
  `Applies to: ${scope}`,
  '',
  `Namespace written: ht:*  (live — the harness build writes ht:*)`,
];
if (w.notes && w.notes.length) lines.push('', 'Adjustments made to your input:', ...w.notes.map((n) => '  - ' + n));
if (mismatches.length) lines.push('', '!! READ-BACK MISMATCH — redis does NOT hold what was written:', ...mismatches.map((m) => '  - ' + m));

return [{ json: {
  echo_title: mismatches.length ? 'Saved WITH ERRORS — read the mismatch below' : 'Settings applied',
  echo_message: lines.join('\n'),
  written: { timeout_sec: w.timeout_sec, enabled_value: w.enabled_value, pilot_csv: w.pilot_csv },
  readback,
  mismatches,
  ok: mismatches.length === 0,
} }];
