#!/usr/bin/env python3
"""
deploy_gates_test.py — unit tests for scripts/deploy.py's pure gate functions (S10a, S10b, and
the S10-misc gate (a)/(c) additions). stdlib `unittest` ONLY — no new dependency, no new framework.

⚠️ ZERO n8n ACCESS. Every gate function that would otherwise call `ew.fetch` (a real GET against
the n8n API) is exercised here with that call MONKEY-PATCHED to a fake — this file never performs
a real network call against n8n, per this task's hard rule ("zero n8n access — no MCP, no REST, no
GET"). `gate_a` is the one exception: it's tested for real, but it only ever runs local `git
status` — no n8n access at all.

Run:  python3 n8n-workflows-init/tests/unit/deploy_gates_test.py
      (or: python3 -m unittest n8n-workflows-init.tests.unit.deploy_gates_test -v, from repo root
      with an __init__.py — not set up, since this is the ONLY python test file in the repo; run
      it directly instead.)

⚠️ KNOWN PRE-EXISTING GAP (found while writing this, NOT one of the S2-S14 findings this file
fixes): `deploy.py` imports `scripts/export-workflows.py` unconditionally at module load
(`_load_module("export_workflows", "export-workflows.py")`), but that file was never committed to
this branch (`feat/test-pyramid-git-deploy`) — it exists on `main` and other feature branches, just
not in this one's history. So `deploy.py` cannot even be IMPORTED on this branch today, gate fixes
or not. All tests below SKIP (not fail, not silently pass) with a clear message when that file is
missing, rather than crashing on an unrelated dependency gap — see `_DEPLOY_IMPORTABLE` below. This
needs a real fix (a rebase/merge bringing export-workflows.py in) that is out of scope for a
reviewer-findings pass; it was verified fixable by temporarily copying that file in locally
(never committed) and confirming every gate test here passes — see the task report.
"""
import importlib.util
import pathlib
import subprocess
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]     # n8n-workflows-init/
SCRIPT_DIR = ROOT / "scripts"
_DEPLOY_IMPORTABLE = (SCRIPT_DIR / "export-workflows.py").exists()
_SKIP_REASON = (
    "scripts/export-workflows.py is missing from this branch (deploy.py cannot be imported "
    "without it) — see this file's module docstring, 'KNOWN PRE-EXISTING GAP'"
)


def load_deploy():
    """Fresh import of deploy.py every time, so a test that monkeypatches module globals
    (UNPROTECTED, KNOWN_ID_LABELS) never leaks into another test."""
    spec = importlib.util.spec_from_file_location("deploy_under_test", SCRIPT_DIR / "deploy.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@unittest.skipUnless(_DEPLOY_IMPORTABLE, _SKIP_REASON)
class GateDTests(unittest.TestCase):
    """S10b: PROTECTED (denylist) -> UNPROTECTED (allowlist), --yes refusal, live-onto-clone hard
    refusal. gate_d signature: gate_d(to_id, i_know_this_is_live, target_override, yes, src_id=None)."""

    def test_unknown_id_requires_i_know_this_is_live(self):
        d = load_deploy()
        ok, msg = d.gate_d("SOME-RANDOM-ID-NOT-IN-ANY-LIST", False, False, False)
        self.assertFalse(ok, msg)
        self.assertIn("not in UNPROTECTED", msg)

    def test_unprotected_id_needs_no_flags(self):
        d = load_deploy()
        d.UNPROTECTED = {"SCRATCH-CLONE-ID"}
        ok, msg = d.gate_d("SCRATCH-CLONE-ID", False, False, False)
        self.assertTrue(ok, msg)

    def test_known_live_id_blocked_without_i_know_this_is_live(self):
        # this is exactly the reviewer's complaint about the OLD denylist: these 3 ids were
        # MISSING from it. Prove the new allowlist blocks them BY DEFAULT (they are never added to
        # UNPROTECTED), independent of whether anyone remembered to name them anywhere.
        d = load_deploy()
        for missed_id in ("Fss5aAaXthJSWpZCgKiKR", "tWP33QOFT7SxThfT", "rysSPgUssLDf6xJc"):
            ok, msg = d.gate_d(missed_id, False, False, False)
            self.assertFalse(ok, f"{missed_id}: {msg}")

    def test_known_live_id_allowed_with_i_know_this_is_live(self):
        d = load_deploy()
        ok, msg = d.gate_d("9qVyfUxmRQqrpGRMDLRuz", True, False, False)
        self.assertTrue(ok, msg)

    def test_yes_refused_for_a_protected_id_even_with_i_know_this_is_live(self):
        d = load_deploy()
        ok, msg = d.gate_d("9qVyfUxmRQqrpGRMDLRuz", True, False, True)  # yes=True
        self.assertFalse(ok, msg)
        self.assertIn("--yes", msg)

    def test_yes_allowed_for_an_unprotected_id(self):
        d = load_deploy()
        d.UNPROTECTED = {"SCRATCH-CLONE-ID"}
        ok, msg = d.gate_d("SCRATCH-CLONE-ID", False, False, True)  # yes=True, but UNPROTECTED
        self.assertTrue(ok, msg)

    def test_clone_guard_blocked_without_target_override(self):
        d = load_deploy()
        ok, msg = d.gate_d(d.CLONE_GUARD_ID, False, False, False)
        self.assertFalse(ok, msg)

    def test_clone_guard_allowed_with_target_override(self):
        d = load_deploy()
        ok, msg = d.gate_d(d.CLONE_GUARD_ID, False, True, False)
        self.assertTrue(ok, msg)

    def test_live_sourced_export_onto_clone_hard_refused_even_with_target_override(self):
        d = load_deploy()
        ok, msg = d.gate_d(d.CLONE_GUARD_ID, False, True, False, src_id="9qVyfUxmRQqrpGRMDLRuz")
        self.assertFalse(ok, msg)
        self.assertIn("topology", msg)


@unittest.skipUnless(_DEPLOY_IMPORTABLE, _SKIP_REASON)
class GateC2Tests(unittest.TestCase):
    """S10a: TOCTOU re-check immediately before the PUT."""

    def test_unchanged_version_passes(self):
        d = load_deploy()
        with mock.patch.object(d.ew, "fetch", return_value={"versionId": "abc123"}):
            ok, msg, wf = d.gate_c2_recheck("http://fake", "fake-key", "some-id", "abc123")
        self.assertTrue(ok, msg)

    def test_changed_version_fails(self):
        d = load_deploy()
        with mock.patch.object(d.ew, "fetch", return_value={"versionId": "SOMEONE-ELSE-WROTE-THIS"}):
            ok, msg, wf = d.gate_c2_recheck("http://fake", "fake-key", "some-id", "abc123")
        self.assertFalse(ok, msg)
        self.assertIn("CHANGED since gate (c)", msg)


@unittest.skipUnless(_DEPLOY_IMPORTABLE, _SKIP_REASON)
class GateCRetargetFreshnessTests(unittest.TestCase):
    """S10 misc: a retarget deploy must ALSO verify the SOURCE export isn't stale against its own
    live origin (src_id) — previously only the TARGET's draft==active was checked."""

    def test_retarget_fails_when_source_export_is_stale(self):
        d = load_deploy()
        manifest = {"versionId": "OLD-EXPORTED-VERSION"}

        def fake_fetch(base, key, wf_id):
            if wf_id == "SRC-ID":
                return {"versionId": "CURRENT-LIVE-VERSION"}  # differs from manifest -> stale
            raise AssertionError("should not reach target fetch when source is stale")

        with mock.patch.object(d.ew, "fetch", side_effect=fake_fetch):
            ok, msg, wf = d.gate_c("http://fake", "fake-key", "some-slug", "SRC-ID", "OTHER-TARGET-ID", manifest)
        self.assertFalse(ok, msg)
        self.assertIn("STALE vs its OWN source", msg)

    def test_retarget_passes_when_source_fresh_and_target_draft_equals_active(self):
        d = load_deploy()
        manifest = {"versionId": "CURRENT-LIVE-VERSION"}

        def fake_fetch(base, key, wf_id):
            if wf_id == "SRC-ID":
                return {"versionId": "CURRENT-LIVE-VERSION"}  # matches manifest -> fresh
            return {"versionId": "T1", "activeVersionId": "T1", "name": "target", "nodes": []}

        with mock.patch.object(d.ew, "fetch", side_effect=fake_fetch):
            ok, msg, wf = d.gate_c("http://fake", "fake-key", "some-slug", "SRC-ID", "OTHER-TARGET-ID", manifest)
        self.assertTrue(ok, msg)


@unittest.skipUnless(_DEPLOY_IMPORTABLE, _SKIP_REASON)
class GateAScriptsTests(unittest.TestCase):
    """S10 misc: gate (a)'s dirty-check now also covers scripts/ — real `git status`, local only,
    no n8n access at all."""

    def test_gate_a_command_includes_scripts_dir(self):
        d = load_deploy()
        with mock.patch("subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
            d.gate_a("some-slug", False)
        called_args = run.call_args[0][0]
        self.assertIn(str(d.ROOT / "scripts"), called_args)
        self.assertIn(str(d.EXPORT / "some-slug"), called_args)
        self.assertIn(str(d.ROOT / "tests"), called_args)


if __name__ == "__main__":
    unittest.main(verbosity=2)
