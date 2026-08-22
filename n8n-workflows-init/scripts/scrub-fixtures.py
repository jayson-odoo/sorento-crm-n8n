#!/usr/bin/env python3
"""
scrub-fixtures.py — PII scrub for tests/fixtures/nodes/**/*.json (idempotent).

Redacts, with a STABLE placeholder per distinct original value (so before/after fixtures still
compare equal in tests):
  - phone numbers (Malaysian mobile: +60/60/01 + subscriber digits)   -> "60100000001", "60100000002", ...
  - email addresses                                                    -> "person1@example.com", ...
  - human person names (firstName/lastName/fullName/pic/salesperson,
    plus "name"/"label" ONLY when the enclosing object looks like a
    person record — has an email/phone/respond_user_id/wa_id sibling) -> "Person 1", "Person 2", ...
  - customer/WhatsApp contact ids (contact_id/respond_io_id/contactId,
    plus bare "id"/"contact" ONLY on a contact-shaped object)          -> 900000001, 900000002, ...
  - respond.io/WhatsApp "user_id" account ids embedded in the serialized
    `meta` blob, of the form "MY.<16 digits>" (shares the contact_id
    map/numbering, so it stays stable across the two id shapes)        -> "MY.900000001", ...

Deliberately NOT touched (business data, not personal data — see CLAUDE.md scope decision):
  - product codes, brand/company/branch/customer/debtor names, CRM structural ids (execution ids,
    UUIDs under user_id/created_by/updated_by/company_id/uuid), timestamps, message text about
    products.
  - a value under created_by/updated_by IS redacted if it does NOT look like a UUID (i.e. someone
    put a real name there instead of the usual system UUID).

Handles PII embedded as literal text inside a JSON-serialized STRING field (respond.io's "meta"
webhook blob, save-message-redis's "data" blob) via targeted regexes over string content, not just
real JSON object traversal — this is exactly what the original capture-fixtures.py scrub missed:
it only redacted a `dict`-shaped contact-object's sibling keys, so PII sitting inside a
JSON-encoded STRING value (e.g. `"data": "{\"contact_id\":\"...\",\"first_name\":\"...\"}"`) or in
a non-contact-shaped object (a CRM staff roster row, `"phone_number"` off a `"display"` block that
happens to also be a customer-shaped object) sailed straight through.

Idempotent: a placeholder value (looks like our own output shape) is recognised and left alone, so
running this script twice produces byte-identical output the second time.

Usage:
    scrub-fixtures.py [--fixtures-root DIR] [--map FILE]      # scrub in place
    scrub-fixtures.py --check [--fixtures-root DIR]            # exit 1 if any PII pattern remains

The id/name/email/phone map is a real->fake JSON dict persisted OUTSIDE the repo (scratchpad by
default) — never commit it, it is the de-anonymisation key.
"""
import argparse
import json
import pathlib
import re
import sys
import tempfile

DEFAULT_ROOT = pathlib.Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "nodes"
# S14 (reviewer): this used to be a hardcoded path under one specific agent session's scratchpad —
# dead on any other machine/session. `tempfile.gettempdir()` is the portable equivalent (still
# OUTSIDE the repo, per the docstring above); `--map` still overrides it for a session that wants
# the map to persist somewhere more durable than the OS temp dir.
DEFAULT_MAP = pathlib.Path(tempfile.gettempdir()) / "sorento-crm-n8n-pii-scrub-map.json"

# ── patterns ────────────────────────────────────────────────────────────────────────────────
# Malaysian mobile, with or without "+"/"60" country code, no internal separators (that's how
# every real leak in this corpus is actually stored — a landline like "03-7984 7826" or a
# separator-formatted mobile off a CRM "display" block deliberately does NOT match: those are
# company/debtor contact numbers, business data, out of scope; see CLAUDE.md scope note).
PHONE_RE = re.compile(r'(?<![\d.])(\+?60|0)1\d{7,10}(?!\d)')
PHONE_PLACEHOLDER_BASE = 60100000000  # str(BASE + n) stays 11 digits for n < 1000

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
EMAIL_PLACEHOLDER_RE = re.compile(r'^person\d+@example\.com$')

# respond.io / WhatsApp Cloud API "user_id" — a stable per-person account identifier of the form
# "MY.<16 digits>", found inside the serialized `meta` blob right next to already-scrubbed fields
# (e.g. `"user_id":"MY.896784876146423"` beside `"wa_id":"60100000011"`). Routed through the SAME
# persistent map as customer contact ids (pmap.contact_id) so it stays stable/idempotent and shares
# that map's placeholder numbering; a real id is always 10+ digits, our own placeholders
# (900000000 + n, n < ~1e8) stay at 9 digits, so a placeholder never re-matches this regex.
MY_USER_ID_RE = re.compile(r'MY\.(\d{10,})')

NAME_PLACEHOLDER_RE = re.compile(r'^Person \d+$')
UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

CONTACT_ID_PLACEHOLDER_BASE = 900000000

# embedded-JSON-as-string leaf patterns: respond.io's "meta" webhook blob and
# sub-respond-save-message-redis's "data" blob both carry these as literal escaped-JSON text,
# not real nested dicts, so only a string-content regex can reach them.
EMBEDDED_FIRSTNAME_RE = re.compile(r'("first_?[nN]ame"\s*:\s*")([^"]*)(")')
EMBEDDED_LASTNAME_RE = re.compile(r'("last_?[nN]ame"\s*:\s*")([^"]*)(")')
EMBEDDED_PROFILE_NAME_RE = re.compile(r'("profile"\s*:\s*\{\s*"name"\s*:\s*")([^"]*)("\s*\})')

# keys that ALWAYS carry a customer contact id, on any object
CONTACT_ID_ALWAYS_KEYS = {"contactid", "respondioid"}
# keys that carry a contact id only when the enclosing object "looks like" a contact record
CONTACT_ID_SHAPED_KEYS = {"id", "contact"}

# keys that ALWAYS carry a person's name/identifier, on any object (created_by/updated_by are
# special-cased below: redacted only when the value is NOT a UUID)
PERSON_ALWAYS_KEYS = {"firstname", "lastname", "fullname", "pic", "salesperson"}
PERSON_MAYBE_UUID_KEYS = {"createdby", "updatedby"}
# keys that carry a person's name only when the enclosing object looks like a person record
PERSON_SHAPED_KEYS = {"name", "label"}

CONTACT_SHAPE_SIBLINGS = {"phone", "email", "waid", "countrycode"}
PERSON_SHAPE_SIBLINGS = {"email", "responduserid", "phone", "phonenumber", "waid"}


def norm(k):
    return re.sub(r"[_\-]", "", str(k)).lower()


def has_any_sibling(obj, names):
    keys = {norm(k) for k in obj.keys()}
    return any(n in keys for n in names)


def is_contact_shaped(obj):
    return isinstance(obj, dict) and has_any_sibling(obj, CONTACT_SHAPE_SIBLINGS)


def is_person_shaped(obj):
    return isinstance(obj, dict) and has_any_sibling(obj, PERSON_SHAPE_SIBLINGS)


def looks_like_bare_id(v):
    """A plausible respond.io contact id: all-digit, 6-10 chars, str or int."""
    s = str(v)
    return s.isdigit() and 6 <= len(s) <= 10


# ── the map (real -> fake), persisted outside the repo ─────────────────────────────────────
class PIIMap:
    def __init__(self, path):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text())
        else:
            self.data = {"phone": {}, "email": {}, "name": {}, "contact_id": {}}
        for cat in ("phone", "email", "name", "contact_id", "roster_name"):
            self.data.setdefault(cat, {})

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True) + "\n")

    def get_or_create(self, category, real_key, make_placeholder):
        m = self.data[category]
        if real_key in m:
            return m[real_key]
        n = len(m) + 1
        placeholder = make_placeholder(n)
        m[real_key] = placeholder
        return placeholder

    # -- placeholder makers, one per category --
    def phone(self, real):
        return self.get_or_create("phone", real, lambda n: str(PHONE_PLACEHOLDER_BASE + n))

    def email(self, real):
        return self.get_or_create("email", real, lambda n: f"person{n}@example.com")

    def name(self, real):
        return self.get_or_create("name", real, lambda n: f"Person {n}")

    def roster_name(self, real):
        """A name found via the PERSON_SHAPED_KEYS dict path (a CRM/CS roster row — 'name' or
        'label' next to email/respond_user_id/phone siblings: a small, fixed set of real staff
        first/full names, e.g. "Cyndi", "Maryam Ariffin"). Shares the same placeholder pool as
        `name()` (so it's the SAME "Person N" if this exact string was also seen elsewhere), but
        is ALSO recorded in its own narrower map — see build_literal_roster_name_re — because a
        node body can format these into free prose (e.g. a numbered "who do you want to route
        to" list) that a fixture's stale `expected` then embeds as plain text, not as a JSON key.
        A general free-text name search is NOT done for the wider `name` map (an embedded WhatsApp
        profile display name can legitimately be "Sorento ...", which must never collide with the
        literal, always-kept company name "Sorento" appearing elsewhere in the same file).
        """
        placeholder = self.name(real)
        self.data["roster_name"][real] = placeholder
        return placeholder

    def contact_id(self, real_digits):
        return self.get_or_create("contact_id", real_digits, lambda n: str(CONTACT_ID_PLACEHOLDER_BASE + n))


# ── already-scrubbed detection (idempotency + --check) ─────────────────────────────────────
def is_placeholder_phone(s):
    body = s[1:] if s.startswith("+") else s
    if not body.isdigit():
        return False
    # BASE + n stays in this numeric range for any n we will plausibly ever assign (< 100000
    # distinct phones); a fixed-length string-prefix check breaks once n reaches double digits
    # and the addition carries into what looked like a fixed prefix.
    return PHONE_PLACEHOLDER_BASE < int(body) < PHONE_PLACEHOLDER_BASE + 100000


def is_placeholder_contact_id(v):
    s = str(v)
    return s.isdigit() and int(s) >= CONTACT_ID_PLACEHOLDER_BASE


def is_placeholder_email(s):
    return bool(EMAIL_PLACEHOLDER_RE.match(s))


OLD_SCRUB_SENTINEL = "<redacted>"  # capture-fixtures.py's old, narrower scrub left this behind


def is_placeholder_name(s):
    return bool(NAME_PLACEHOLDER_RE.match(s)) or s == OLD_SCRUB_SENTINEL


# ── string-level scrub (phone/email/embedded-name/roster-name substitution) ────────────────
def scrub_string(s, pmap, literal_roster_re=None):
    def phone_sub(m):
        whole = m.group(0)
        if is_placeholder_phone(whole):
            return whole
        prefix = "+" if whole.startswith("+") else ""
        return prefix + pmap.phone(whole.lstrip("+"))

    s = PHONE_RE.sub(phone_sub, s)

    def email_sub(m):
        whole = m.group(0)
        if is_placeholder_email(whole):
            return whole
        return pmap.email(whole)

    s = EMAIL_RE.sub(email_sub, s)

    def my_user_id_sub(m):
        digits = m.group(1)
        return "MY." + pmap.contact_id(digits)

    s = MY_USER_ID_RE.sub(my_user_id_sub, s)

    def name_group_sub(m):
        val = m.group(2)
        if not val or is_placeholder_name(val):
            return m.group(0)
        return m.group(1) + pmap.name(val) + m.group(3)

    s = EMBEDDED_FIRSTNAME_RE.sub(name_group_sub, s)
    s = EMBEDDED_LASTNAME_RE.sub(name_group_sub, s)
    s = EMBEDDED_PROFILE_NAME_RE.sub(name_group_sub, s)

    if literal_roster_re is not None:
        def roster_sub(m):
            return pmap.data["roster_name"][m.group(0)]
        s = literal_roster_re.sub(roster_sub, s)

    return s


# ── contact-id literal substitution for values embedded in string blobs ────────────────────
def build_literal_contact_id_re(pmap):
    reals = [k for k in pmap.data["contact_id"].keys() if k.isdigit()]
    if not reals:
        return None
    alt = "|".join(re.escape(r) for r in sorted(reals, key=len, reverse=True))
    return re.compile(rf'(?<!\d)(?:{alt})(?!\d)')


def scrub_embedded_contact_ids(s, pmap, literal_re):
    if literal_re is None:
        return s
    return literal_re.sub(lambda m: pmap.data["contact_id"][m.group(0)], s)


# ── roster-name literal substitution for a node's own composed prose (e.g. a numbered
#    "who do you want to route to" list) that a stale `expected` embeds as plain text. Scoped
#    to ONLY the small, fixed set of names collected via the PERSON_SHAPED_KEYS dict path (real
#    CRM/CS roster rows) — see PIIMap.roster_name's docstring for why the wider `name` map
#    (which includes embedded WhatsApp profile display names, occasionally "Sorento ...") must
#    NOT be used for a blanket free-text search. Word-bounded, case-sensitive, longest-first so
#    "Nur" doesn't eat the "Nur" inside the separate real name "Nurain".
def build_literal_roster_name_re(pmap):
    reals = [k for k in pmap.data["roster_name"].keys() if k]
    if not reals:
        return None
    alt = "|".join(re.escape(r) for r in sorted(reals, key=len, reverse=True))
    return re.compile(rf'\b(?:{alt})\b')


# ── pass 1: collect key-based contact-id + name values (read-only) ─────────────────────────
def collect(obj, pmap):
    if isinstance(obj, dict):
        contact_shaped = is_contact_shaped(obj)
        person_shaped = is_person_shaped(obj)
        for k, v in obj.items():
            nk = norm(k)
            if nk in CONTACT_ID_ALWAYS_KEYS and looks_like_bare_id(v) and not is_placeholder_contact_id(v):
                pmap.contact_id(str(v))
            elif nk in CONTACT_ID_SHAPED_KEYS and contact_shaped and looks_like_bare_id(v) and not is_placeholder_contact_id(v):
                pmap.contact_id(str(v))
            if isinstance(v, str):
                if nk in PERSON_ALWAYS_KEYS and v and not is_placeholder_name(v):
                    pmap.name(v)
                elif nk in PERSON_MAYBE_UUID_KEYS and v and not UUID_RE.match(v) and not is_placeholder_name(v):
                    pmap.name(v)
                elif nk in PERSON_SHAPED_KEYS and person_shaped and v and not is_placeholder_name(v):
                    pmap.roster_name(v)
            collect(v, pmap)
    elif isinstance(obj, list):
        for v in obj:
            collect(v, pmap)


# ── pass 2: produce the scrubbed tree ───────────────────────────────────────────────────────
def scrub(obj, pmap, literal_contact_re, literal_roster_re=None):
    if isinstance(obj, dict):
        contact_shaped = is_contact_shaped(obj)
        person_shaped = is_person_shaped(obj)
        out = {}
        for k, v in obj.items():
            nk = norm(k)
            is_id_key = (nk in CONTACT_ID_ALWAYS_KEYS) or (nk in CONTACT_ID_SHAPED_KEYS and contact_shaped)
            if is_id_key and looks_like_bare_id(v):
                mapped_str = str(v) if is_placeholder_contact_id(v) else pmap.contact_id(str(v))
                out[k] = int(mapped_str) if isinstance(v, int) else mapped_str
                continue
            if isinstance(v, str):
                if nk in PERSON_ALWAYS_KEYS and v:
                    out[k] = v if is_placeholder_name(v) else pmap.name(v)
                    continue
                if nk in PERSON_MAYBE_UUID_KEYS and v:
                    out[k] = v if (UUID_RE.match(v) or is_placeholder_name(v)) else pmap.name(v)
                    continue
                if nk in PERSON_SHAPED_KEYS and person_shaped and v:
                    out[k] = v if is_placeholder_name(v) else pmap.roster_name(v)
                    continue
                s = scrub_string(v, pmap, literal_roster_re)
                s = scrub_embedded_contact_ids(s, pmap, literal_contact_re)
                out[k] = s
                continue
            out[k] = scrub(v, pmap, literal_contact_re, literal_roster_re)
        return out
    if isinstance(obj, list):
        return [scrub(v, pmap, literal_contact_re, literal_roster_re) for v in obj]
    if isinstance(obj, str):
        s = scrub_string(obj, pmap, literal_roster_re)
        s = scrub_embedded_contact_ids(s, pmap, literal_contact_re)
        return s
    return obj


# ── --check: any un-scrubbed PII pattern left? ──────────────────────────────────────────────
def find_leaks(obj, path=(), literal_contact_re=None, literal_roster_re=None):
    leaks = []
    if isinstance(obj, dict):
        contact_shaped = is_contact_shaped(obj)
        person_shaped = is_person_shaped(obj)
        for k, v in obj.items():
            nk = norm(k)
            p = path + (k,)
            if nk in CONTACT_ID_ALWAYS_KEYS and looks_like_bare_id(v) and not is_placeholder_contact_id(v):
                leaks.append((p, "contact_id", v))
            if nk in CONTACT_ID_SHAPED_KEYS and contact_shaped and looks_like_bare_id(v) and not is_placeholder_contact_id(v):
                leaks.append((p, "contact_id", v))
            if isinstance(v, str):
                if nk in PERSON_ALWAYS_KEYS and v and not is_placeholder_name(v):
                    leaks.append((p, "name", v))
                if nk in PERSON_MAYBE_UUID_KEYS and v and not UUID_RE.match(v) and not is_placeholder_name(v):
                    leaks.append((p, "name(created/updated_by)", v))
                if nk in PERSON_SHAPED_KEYS and person_shaped and v and not is_placeholder_name(v):
                    leaks.append((p, "name", v))
                for m in PHONE_RE.finditer(v):
                    if not is_placeholder_phone(m.group(0)):
                        leaks.append((p, "phone", m.group(0)))
                for m in EMAIL_RE.finditer(v):
                    if not is_placeholder_email(m.group(0)):
                        leaks.append((p, "email", m.group(0)))
                for m in MY_USER_ID_RE.finditer(v):
                    leaks.append((p, "respondio_user_id", m.group(0)))
                for rex, label in (
                    (EMBEDDED_FIRSTNAME_RE, "embedded-firstName"),
                    (EMBEDDED_LASTNAME_RE, "embedded-lastName"),
                    (EMBEDDED_PROFILE_NAME_RE, "embedded-profile.name"),
                ):
                    for m in rex.finditer(v):
                        val = m.group(2)
                        if val and not is_placeholder_name(val):
                            leaks.append((p, label, val))
                if literal_contact_re is not None:
                    for m in literal_contact_re.finditer(v):
                        leaks.append((p, "embedded-contact_id", m.group(0)))
                if literal_roster_re is not None:
                    for m in literal_roster_re.finditer(v):
                        leaks.append((p, "embedded-roster_name", m.group(0)))
            leaks.extend(find_leaks(v, p, literal_contact_re, literal_roster_re))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            leaks.extend(find_leaks(v, path + (i,), literal_contact_re, literal_roster_re))
    return leaks


# ── single-object API (for capture-fixtures.py to import — one freshly-captured fixture at a
#    time, not a whole tree) ─────────────────────────────────────────────────────────────────
def scrub_fixture_object(obj, pmap):
    """Scrub one fixture object (ctx/input/expected dict or list) in place semantics: returns a
    new, scrubbed copy. `pmap` is a PIIMap the caller should load once and save once per run (see
    PIIMap.save) so ids/names/emails/phones stay stable across multiple fixtures in one capture
    run, and across capture runs over time."""
    collect(obj, pmap)
    literal_contact_re = build_literal_contact_id_re(pmap)
    literal_roster_re = build_literal_roster_name_re(pmap)
    return scrub(obj, pmap, literal_contact_re, literal_roster_re)


# ── driver ───────────────────────────────────────────────────────────────────────────────
def iter_fixture_files(root):
    return sorted(root.rglob("*.json"))


def run_scrub(root, map_path):
    files = iter_fixture_files(root)
    pmap = PIIMap(map_path)

    # pass 1: collect key-based contact-id / name values across every file, so pass 2's
    # embedded-string literal-contact-id substitution has the complete map before it starts.
    docs = {}
    for f in files:
        try:
            docs[f] = json.loads(f.read_text())
        except Exception as e:
            print(f"  ! SKIP (invalid JSON): {f}: {e}", file=sys.stderr)
    for f, doc in docs.items():
        collect(doc, pmap)

    literal_contact_re = build_literal_contact_id_re(pmap)
    literal_roster_re = build_literal_roster_name_re(pmap)

    changed = 0
    for f, doc in docs.items():
        scrubbed = scrub(doc, pmap, literal_contact_re, literal_roster_re)
        text = json.dumps(scrubbed, indent=2, sort_keys=False) + "\n"
        if f.read_text() != text:
            f.write_text(text)
            changed += 1

    pmap.save()
    print(f"scrubbed {len(docs)} files ({changed} changed), map: {map_path}")
    print(f"  phone: {len(pmap.data['phone'])} distinct, email: {len(pmap.data['email'])} distinct, "
          f"name: {len(pmap.data['name'])} distinct, contact_id: {len(pmap.data['contact_id'])} distinct")


def run_check(root):
    files = iter_fixture_files(root)
    docs = {}
    for f in files:
        try:
            docs[f] = json.loads(f.read_text())
        except Exception as e:
            print(f"! SKIP (invalid JSON): {f}: {e}", file=sys.stderr)

    # Build an in-memory-only map (never written to disk, never even read from an existing one —
    # a nonexistent path so PIIMap starts empty) purely to derive the embedded-text regexes —
    # mirrors run_scrub's two-pass shape so --check exercises the same detection surface a real
    # scrub would, without mutating anything. .save() is never called on this instance.
    pmap = PIIMap(pathlib.Path("/nonexistent/pii-scrub-map-check-only.json"))
    for doc in docs.values():
        collect(doc, pmap)
    literal_contact_re = build_literal_contact_id_re(pmap)
    literal_roster_re = build_literal_roster_name_re(pmap)

    total = 0
    for f, doc in docs.items():
        leaks = find_leaks(doc, (), literal_contact_re, literal_roster_re)
        for path, kind, val in leaks:
            total += 1
            print(f"LEAK  {f}: {'/'.join(str(p) for p in path)}  [{kind}]  {val!r}")
    if total:
        print(f"\n{total} un-scrubbed PII pattern(s) found across {len(files)} files.", file=sys.stderr)
        return 1
    print(f"clean: 0 PII patterns found across {len(files)} files.")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fixtures-root", type=pathlib.Path, default=DEFAULT_ROOT)
    ap.add_argument("--map", type=pathlib.Path, default=DEFAULT_MAP)
    ap.add_argument("--check", action="store_true", help="exit 1 if any PII pattern remains; scrub nothing")
    args = ap.parse_args()

    if not args.fixtures_root.exists():
        sys.exit(f"FAIL: {args.fixtures_root} does not exist")

    if args.check:
        sys.exit(run_check(args.fixtures_root))
    run_scrub(args.fixtures_root, args.map)


if __name__ == "__main__":
    main()
