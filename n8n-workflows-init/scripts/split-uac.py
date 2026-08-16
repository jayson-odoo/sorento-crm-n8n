#!/usr/bin/env python3
"""RETIRED 2026-08-08 — DO NOT USE. Kept as a tombstone so nobody rewrites it from memory.

This script regenerated `tests/uac/*.md` FROM the `tests/UAC.md` monolith. That direction is now
backwards: **the split files in `tests/uac/` are the source of truth** and the monolith is
provenance for pre-split sections only. Running this would have destroyed the entire §MC family
plus the §CD / §DP / §IH work — while printing "all content preserved".

A section-COUNT loss gate was added as a stopgap. The reviewer ruled it insufficient and ordered
retirement: counting sections cannot see an equal-count edit, so the gate is green exactly when the
content is silently replaced. That is the same "green that cannot fail" class the gate was meant to
prevent (LESSONS §61).

If you need the monolith reconciled, go the OTHER way — derive `UAC.md` from `tests/uac/*.md` — or
formally retire `UAC.md`. Do not resurrect this direction.
"""
import sys

sys.exit(
    "split-uac.py is RETIRED and refuses to run.\n"
    "  tests/uac/*.md is the SOURCE OF TRUTH; this script regenerated it FROM the stale monolith\n"
    "  and would delete the MC/CD/DP/IH families. Edit tests/uac/*.md directly.\n"
    "  See the module docstring and tests/uac/README.md."
)
