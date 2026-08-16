#!/usr/bin/env python3
"""Mutation harness for sendmsg-quickreply-chunk.test.js.

Mutates the `after()` body INSIDE the test file, runs the suite, and requires each mutant to be
caught. Carries LESSONS §72's two guards, because the instrument that proves your assertions can
fail is itself an assertion:

  1. ANCHOR MISS and ZERO-BYTE MUTATION both hard-fail. A sed anchor that no longer matches can
     never be silently scored as a detection.
  2. A crash is reported as ERROR, never as "caught" and never as "survived" — §72's harness
     scored crash output as a red test and reported 26/26 while catching nothing.

It also refuses to run if the local `after()` has drifted from the deployed node body, so this
suite cannot rot into a cache of code nobody ships (§64 / export --verify, same class).

A survivor is not automatically a bug: it either teaches a missing assertion, or it is justified
and recorded below. A score of exactly 100% on first run is a smell, not a triumph.

Run: python3 n8n-workflows-init/tests/unit/sendmsg-quickreply-chunk.mutate.py
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
TEST = HERE / "sendmsg-quickreply-chunk.test.js"
DEPLOYED = HERE.parent.parent / "export" / "fork-sendmsg-qrchunk" / "nodes" / "Code_in_JavaScript.js"

# (description, anchor, replacement). Anchors must exist in after()'s body.
MUTANTS = [
    ("drop the BYTE cap (R4 regression)",
     "const BYTE_CAP = quickReply ? 1000 : Infinity;", "const BYTE_CAP = Infinity;"),
    ("byte cap loosened to 4096",
     "const BYTE_CAP = quickReply ? 1000 : Infinity;", "const BYTE_CAP = quickReply ? 4096 : Infinity;"),
    ("byte-shrink loop disabled",
     "while (lim > 1 && blen(rest.slice(0, lim)) > BYTE_CAP) lim = Math.floor(lim * 0.9);",
     "while (false) lim = lim;"),
    ("drop the surrogate guard",
     "if (c >= 0xd800 && c <= 0xdbff) at -= 1;", "if (false) at -= 1;"),
    ("drop the trim on each part",
     "parts.push(rest.slice(0, at).trim());", "parts.push(rest.slice(0, at));"),
    ("FLOOR 450 -> 0 on button path",
     "const FLOOR = quickReply ? 450 : 800;", "const FLOOR = quickReply ? 0 : 800;"),
    ("proportional plain-path floor (R1 regression)",
     "const FLOOR = quickReply ? 450 : 800;", "const FLOOR = Math.floor(LIMIT * 0.45);"),
    ("LIMIT always 1800 (no button cap)",
     "const LIMIT = quickReply ? 1000 : 1800;", "const LIMIT = 1800;"),
    ("buttons on FIRST part",
     "const isLast = i === parts.length - 1;", "const isLast = i === 0;"),
    ("buttons on EVERY part",
     "quick_reply: buttoned ? quickReply : '',", "quick_reply: quickReply,"),
    ("total_parts off by one",
     "total_parts: parts.length,", "total_parts: parts.length + 1,"),
    ("part index 0-based",
     "part: i + 1,", "part: i,"),
    ("buttoned part uses the SUBSET not the whole set",
     "result: buttoned ? resultSet", "result: buttoned ? (subset || [])"),
    ("whole set on EVERY part (the rejected option)",
     "result: buttoned ? resultSet", "result: resultSet ? resultSet"),
    ("drop the no-numbering fallback",
     "(!anyNumbered && !quickReply && i === 0 ? resultSet : [])", "[]"),
    ("drop contact_identifer carry",
     "contact_identifer: contactId,", "contact_identifer: undefined,"),
    ("anyNumbered inverted",
     "const anyNumbered = parts.some", "const anyNumbered = !parts.some"),
    ("subset predicate inverted",
     "ids.has(r.idx)", "!ids.has(r.idx)"),
    # Kept deliberately even though it survives — see JUSTIFIED. A harness that reports 100%
    # every run has stopped being informative; this one shows its known blind spot.
    ("idxIn accepts bare digits (no . or ))",
     r"(\d{1,3})[.)]", r"(\d{1,3})[.)]?"),
]

# Survivors that are understood and accepted, with the reason. Anything NOT listed here that
# survives is a finding.
JUSTIFIED = {
    # idxIn's regex is unchanged live code. Loosening it mutates behaviour this change never
    # touched, so the suite is not expected to pin it.
    "idxIn accepts bare digits (no . or ))": "unchanged live code, out of scope",
}


def after_body(src: str) -> str:
    marker = "function after(src) {"
    i = src.index(marker) + len(marker)
    depth, j = 1, i
    while depth:
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
        j += 1
    return src[i:j - 1]


def check_not_stale(original: str) -> None:
    """Refuse to run against an after() that has drifted from the deployed node."""
    if not DEPLOYED.exists():
        print(f"  ! deployed body not exported at {DEPLOYED} — run export-workflows.py first")
        sys.exit(2)
    local = after_body(original)
    deployed = DEPLOYED.read_text()

    def norm(s: str) -> list[str]:
        out = []
        for ln in s.splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("//"):
                continue
            # The one legitimate difference: the deployed node reads the trigger through the n8n
            # accessor, while after() receives the same object as a parameter. Everything else
            # must match byte-for-byte after whitespace/comment normalisation.
            if ln.startswith("const src = $("):
                continue
            out.append(ln)
        return out

    if norm(local) != norm(deployed):
        import difflib
        for line in list(difflib.unified_diff(norm(local), norm(deployed),
                                              "test after()", "deployed", lineterm=""))[:20]:
            print("    " + line)
        print("  ! STALE: after() in the test file differs from the deployed node body.")
        print("    This suite would prove nothing about what is actually shipping (LESSONS §72).")
        sys.exit(2)
    print("  resync check: after() matches the deployed node body ✓\n")


def main() -> int:
    original = TEST.read_text()
    check_not_stale(original)

    survivors, errors, justified = [], [], []
    try:
        for desc, old, new in MUTANTS:
            body = after_body(original)
            if old not in body:
                print(f"  ANCHOR MISS  {desc}  <- fix the harness, do NOT score this")
                errors.append(desc)
                continue
            mutated = original.replace(after_body(original), body.replace(old, new, 1), 1)
            if mutated == original:
                print(f"  ZERO-BYTE    {desc}  <- anchor matched but changed nothing")
                errors.append(desc)
                continue
            TEST.write_text(mutated)
            r = subprocess.run(["node", str(TEST)], capture_output=True, text=True)
            tail = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
            if "passed," not in tail:
                print(f"  ERROR        {desc}  (crashed — not scored either way)")
                errors.append(desc)
            elif "0 failed" in tail:
                note = JUSTIFIED.get(desc)
                print(f"  SURVIVED     {desc}" + (f"  [justified: {note}]" if note else ""))
                (justified if note else survivors).append(desc)
            else:
                print(f"  caught       {desc}  -> {tail}")
    finally:
        TEST.write_text(original)

    total = len(MUTANTS)
    caught = total - len(survivors) - len(justified) - len(errors)
    # Report caught/total honestly: a justified survivor is NOT a detection. Inflating the score
    # is the same failure as scoring a crash as red (LESSONS §72).
    print(f"\n  {caught}/{total} caught"
          + (f", {len(justified)} justified survivor(s)" if justified else "")
          + (f", {len(errors)} harness fault(s)" if errors else ""))
    if errors:
        print(f"  harness faults: {errors}")
    if survivors:
        print(f"  UNJUSTIFIED SURVIVORS: {survivors}")
    return 1 if (survivors or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
