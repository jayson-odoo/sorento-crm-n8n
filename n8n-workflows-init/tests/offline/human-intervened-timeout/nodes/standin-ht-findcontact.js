// STAND-IN for `Call 'sorento-sub-respond-findcontact-respond'` (D62_NHUOrugeULSFwfjEJ).
//
// TWO reasons it is stubbed rather than called for real, and the second is the load-bearing one:
//   1. that sub contains respondio nodes (a CREATE_OR_UPDATE_CONTACT and a WhatsApp SEND_TEMPLATE,
//      both currently orphaned inside it) — calling it puts a credentialed respondio node in the
//      harness's execution path, which UAC 0 S8 forbids;
//   2. a real read returns whatever `is_human_intervened` happens to be RIGHT NOW, so HT-8 and HT-9
//      — which differ ONLY in that flag — could not both be run deterministically. A case whose
//      expected outcome depends on live state is not a test.
//
// The tag comes from the driver payload (see ht-sweep-driver.js):
//   ABSENT (no entry) -> is_human_intervened "true"   (the HT-8 shape: WOULD produce egress)
//   "flag=false"      -> "false"                      (HT-9, human closed manually)
//   "flag=null"       -> null                         (the shape is_allowed_voice really has)
//   "noflag"          -> row removed, array present    (absent-vs-empty, LESSONS 64)
//   "nocf"            -> custom_fields key removed     (HT-FP4: ht-classify must THROW)
//   "notfound"        -> ZERO ITEMS for this contact   (the real sub's hard-miss shape — see below)
//   anything else     -> THROW
//
// AN ABSENT TAG DEFAULTS TO THE EGRESS-PRODUCING SHAPE, ON PURPOSE: a harness must not be able to pass a
// case by quietly handing it the inert fixture.
//
// AN UNKNOWN TAG THROWS — added rev4 after the tester found the two halves were conflated. A typo'd or
// invented tag was falling through that same default, so a case asking for something the fixture layer
// does not implement silently ran `clear-and-notify`, the one outcome that authorises a flag write and a
// send. Measured by the tester: an invented `"notfound"` tag produced clear-and-notify (exec 12179301).
// That is the green-that-cannot-fail shape (LESSONS §61) one level below the code — in the FIXTURE layer,
// where a wrong answer is indistinguishable from the right one because the case never sees which fixture
// it got. "Absent" is a decision; "unrecognised" is a mistake, and the two must not share a branch.
//
// "notfound" emits ZERO ITEMS for that contact rather than an empty object, because that is what the real
// sub does: `If contact exists` gates on `$json.id` and its not-found branch runs `Find a Contact1`, whose
// error output is unwired — so a hard miss yields no items at all. It is the input to `forget-unknown`
// (reviewer R3), the path that used to WEDGE the sweeper permanently, and without this tag that gate was
// offline-only.
//
// The payload is copied from a REAL FIND_CONTACT response (execution 12166204), not written from a
// field list (LESSONS 64) — which is how the "value is the STRING 'true'/'false'" contract got into
// ht-classify in the first place.
// MAPS EVERY ITEM — one lookup per expired contact. `$input.first()` here would return one contact
// for a multi-contact tick and ht-classify's index-alignment guard would (correctly) refuse the whole
// tick, so this is not merely tidiness.
const KNOWN_TAGS = ['flag=false', 'flag=null', 'noflag', 'nocf', 'notfound'];

const fixtures = ($('ht-sweep-driver').first().json || {}).fixtures || {};
const out = [];
$input.all().forEach((it, idx) => {
const src = it.json || {};
const contact_id = String(src.contact_id);
const tag = String(fixtures[contact_id] === undefined ? '' : fixtures[contact_id]).trim();

if (tag !== '' && KNOWN_TAGS.indexOf(tag) === -1) {
  throw new Error(
    'ht-findcontact: unknown fixture tag ' + JSON.stringify(tag) + ' for contact ' + contact_id +
    '. Known tags: ' + KNOWN_TAGS.join(', ') + ' (or omit the entry for the default flag=true shape). ' +
    'Refusing to fall through to the default, which is the egress-authorising outcome — a typo must not ' +
    'silently select clear-and-notify.'
  );
}

// hard miss: no items at all for this contact, exactly as the real sub behaves
if (tag === 'notfound') return;

const flagValue = tag === 'flag=false' ? 'false' : (tag === 'flag=null' ? null : 'true');
const custom_fields = [
  { name: 'enquiry_type', value: null },
  { name: 'user_type', value: null },
  { name: 'complaint_id', value: null },
  { name: 'is_allowed_stock', value: 'true' },
  { name: 'is_human_intervened', value: flagValue },
  { name: 'is_allowed_ai', value: 'true' },
  { name: 'is_allowed_voice', value: null },
];

const contact = {
  id: Number(contact_id),
  firstName: 'Jayson', lastName: null, phone: '+60100000000',
  email: null, language: null, profilePic: null, locale: null,
  countryCode: 'MY', status: 'open', isBlocked: false,
  custom_fields,
  tags: ['ht-harness'],
  assignee: { id: 1132641, firstName: 'Harness', lastName: 'Standin', email: 'harness@example.invalid' },
  lifecycle: 'New Lead', created_at: 1782546255,
  _standin: { guard: 'ht-findcontact', kind: 'would_read', blocked: true,
              fixture_tag: tag === '' ? 'default(flag=true)' : tag },
};
if (tag === 'nocf') delete contact.custom_fields;
if (tag === 'noflag') contact.custom_fields = custom_fields.filter((x) => x.name !== 'is_human_intervened');
out.push({ json: contact, pairedItem: { item: idx } });
});
return out;
