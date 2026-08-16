// ── harness-envelope ── HARNESS-ONLY driver adapter (has no live counterpart) ────────────────────
//
// Turns whatever the driver posted into the exact trigger-shaped envelope `respond-send-user`
// receives, then hands it to the name-preserving `Respond.io Trigger` stand-in. It exists because
// the fork's real `respondioTrigger` is DELETED: a duplicated respondioTrigger subscribes the shared
// credential to the REAL respond.io event stream even while the workflow is inactive (LESSONS 52),
// which would fan live customer traffic into the fork.
//
// Accepts (first match wins):
//   { envelope: {...} }        the fixture files' own shape (fixtures/trigger-*.json)
//   { body: { envelope: {} } } the same, arriving through the webhook node
//   { ...envelope }            a bare envelope
// and threads two harness-only fields through: `test_run_id` (keys the egress log) and
// `ht_case` (a label that shows up in runData so a run can be attributed to a case).
//
// It REFUSES an envelope with no contact.id rather than defaulting one: a fabricated contact id
// would let a harness run stamp a redis key for a contact that was never in the fixture.
const raw = $input.first().json || {};
const src = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const env = src.envelope && typeof src.envelope === 'object' ? src.envelope : src;

if (!env || typeof env !== 'object' || !env.contact || env.contact.id === undefined || env.contact.id === null) {
  throw new Error(
    'harness-envelope: driver payload carries no contact.id. Post either {"envelope": <a fixture ' +
    'from tests/offline/human-intervened-timeout/fixtures>} or a bare trigger envelope. Refusing ' +
    'to fabricate a contact id.'
  );
}

const out = { ...env };
if (src.test_run_id !== undefined) out.test_run_id = src.test_run_id;
if (raw.test_run_id !== undefined) out.test_run_id = raw.test_run_id;
if (out.test_run_id === undefined) out.test_run_id = null;
if (src.ht_case !== undefined) out.ht_case = src.ht_case;
// A driver may override `source` to exercise HT-3 without editing a fixture on disk.
if (src.source !== undefined) out.source = src.source;
return [{ json: out }];
