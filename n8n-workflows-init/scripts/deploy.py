#!/usr/bin/env python3
"""
deploy.py — the ONLY sanctioned write path from export/<slug>/ into a live n8n
workflow. Step 5 of plans/test-pyramid-and-git-deploy.md ("git-first deploy").

Supersedes deploy.sh (docker/localhost, deleted normalized-workflows/ target —
kept only for its backup-first idea). This talks straight to the same n8n
instance the export/ tree was pulled from (no cross-instance credential
remap — see gate (g) below), and is a git-status + test + freshness gate in
front of a single `PUT /workflows/<id>`.

GATES (fail-closed, in order — first failure stops the run and exits 1):
  (a) git clean under export/<slug>/ and tests/           [--allow-dirty overrides, loudly]
  (b) `npm test` (REQUIRE_FULL_COVERAGE=1) exits 0
  (c) freshness: own-id deploy -> export/<slug>'s versionId must match live's
      versionId (export-workflows.py --verify semantics, for this one id);
      retarget (--to != the export's own id) -> the TARGET must have no
      unpublished draft (versionId == activeVersionId), so we never clobber
      one. Either way this is a single GET against n8n — read-only.
  (d) target safety: refuse a hardcoded PROTECTED live id without
      --i-know-this-is-live, and refuse the TEST clone
      (txiPzSxy3Pclsz6v — someone else's active build) without
      --target-override.
  (e) backup: GET the target's full current body -> tests/backups/, before
      anything else touches it.
  (f) assemble (via assemble.py) + build the PUT body: ONLY
      {name, nodes, connections, settings} — see NODE IDS / NAME / SETTINGS
      below for what is kept, dropped, or renamed and why.
  (f2) payload safety: promotion-safety-check.py's 10 checks against the
      body built in (f) — the exact bytes that ship. Refuses a payload still
      carrying test scaffolding (is_test to a guarded live sub, test:q:/
      test:egress:, the n8n_test db cred, fork ids, orphaned egress nodes,
      NoOp-ed CRM reads, credential drift, lost node settings). Profile by
      TARGET id; SKIPPED for the TEST clone, for UNPROTECTED scratch ids, and
      for PAYLOAD_GATE_SKIP verified test-artifact forks — all three
      legitimately carry that scaffolding. PAYLOAD_GATE_SKIP is deliberately
      NOT part of UNPROTECTED: it skips (f2) only, never gate (d)'s
      --i-know-this-is-live requirement or its interactive confirm, and
      --yes stays refused for it. See payload_gate_profile().
  (g) credentials: passed through UNCHANGED. See CREDENTIALS below.
  (h) diff summary (added/removed/changed node names, jsCode sha deltas) vs
      the target's current body, then `--yes` or an interactive `y`.
  (i) PUT /api/v1/workflows/<id>. Only reached if NOT --dry-run and gate (h)
      was confirmed. Own-id deploys re-run export-workflows.py + --verify
      FOR THAT ONE SLUG afterwards; a rollback command is always printed.

--rollback runs a REDUCED gate set (d, e, h) by design, and deliberately does
NOT run (f2). A rollback body is bytes n8n itself served from this target, saved
by gate (e) — it restores a known-previous state, it cannot introduce anything
new. It is also the remediation FOR a bad deploy, so gating it on the same check
that let the bad deploy through is circular, and an outage is the worst possible
time to discover a gate standing between you and the last good body.

--dry-run performs (a)-(h) — including the real npm test run and the real
backup GET+write (both read-only / local, never a workflow write) — prints
the exact PUT body size + sha256 + the diff summary, and STOPS before (i).
This is the ONLY mode this script has ever been exercised in; see the task
report for why.

NODE IDS: passed through from the export UNCHANGED, never remapped to the
target's ids, even when retargeting (e.g. spine export -> clone id). Reasons,
checked against this repo's own data, not assumed:
  1. `connections` in workflow.json is keyed entirely by node NAME
     (verified: `wf["connections"]["Aggregate"] == {"main": [[{"node":
     "tier-gate", ...}]]}`) — node id plays no role in wiring.
  2. LESSONS #58(c) confirms `$('x')` / `setNodeParameter` resolve by node
     NAME too ("clone<->live node ids diverge for some nodes... targets by
     nodeName (unique)").
  3. Neither export-workflows.py nor the prior deploy.sh ever remap node
     ids — both pass the `nodes` array through untouched.
  4. n8n node ids only need to be unique WITHIN one workflow row, not
     globally, so a source id colliding with a target id across two
     different workflows is not a hazard.
  So: no id remap step exists in this script. (The one thing this does NOT
  cover: if a target has its own `pinData` keyed by node id rather than
  name, an id swap could orphan it — we never send pinData in the PUT body
  and n8n preserves what's already stored when a key is omitted, so this is
  believed inert, but it is unverified against a real PUT.)

NAME: the PUT body's `name` is always the TARGET's current live name (fetched
fresh in gate (c)/(e)), never the source export's own `name`. This is a
single rule that covers both cases asked for: retargeting never renames
someone else's clone, and an own-id deploy can't silently drift the name via
a stale export either.

SETTINGS: `binaryMode` and `timeSavedMode` are stripped before PUT — LESSONS
#55: the public `workflowSettings` schema is narrower than storage and 400s
on those two keys; omitting is lossless because settings is merged, not
replaced.

CREDENTIALS: passed through UNCHANGED (no cred-aliases.json / remap-creds.py
step). Those scripts exist for deploy.sh's use case — copying a workflow from
a LOCAL dev n8n instance into PROD, i.e. two different `credentials_entity`
tables where the ids genuinely don't match. This script never crosses an
instance boundary: `export/` was pulled from, and `--to` always targets, the
same `.env` N8N_API_BASE (automate-sorento.foundryx.my). A credential id
valid on the source workflow is already valid on the target, so remapping
would be solving a problem that doesn't exist here.

🚫 THIS SCRIPT NEVER EXECUTES A PUT DURING DEVELOPMENT/TESTING OF ITSELF.
Every invocation used to build and verify it was `--dry-run`.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent                  # n8n-workflows-init/
REPO_ROOT = ROOT.parent
EXPORT = ROOT / "export"
BACKUP_DIR = ROOT / "tests" / "backups"

# --- reuse export-workflows.py's auth + fetch, and assemble.py's fold-in ---
def _load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

ew = _load_module("export_workflows", "export-workflows.py")
asm = _load_module("assemble", "assemble.py")
psc = _load_module("promotion_safety_check", "promotion-safety-check.py")

# S10b (reviewer): this used to be a DENYLIST (`PROTECTED = {known-live-id: label, ...}`) — and it
# already omitted real live ids named in this repo's own CLAUDE.md "Key IDs" table
# (`Fss5aAaXthJSWpZCgKiKR` live sub-get-results, `tWP33QOFT7SxThfT` live sub-get-rag,
# `rysSPgUssLDf6xJc` which carries live's main CRM read path). A denylist of live ids DRIFTS — every
# id this repo learns about later needs someone to remember to add it here, and a forgotten one is
# an ungated PUT to production with no warning at all. An ALLOWLIST doesn't drift the same way: an
# id NOT in it is unprotected by omission only in the safe direction (over-cautious, not
# under-cautious) — a brand-new scratch/throwaway id deploy.py has never heard of requires
# --i-know-this-is-live too, until someone deliberately adds it here.
#
# Start EMPTY. Add an id here ONLY for a scratch/throwaway clone you know is safe to PUT to without
# the --i-know-this-is-live acknowledgment (e.g. a disposable dev-only workflow you just created for
# a one-off experiment). Every real id in CLAUDE.md's "Key IDs" table — live or clone alike — stays
# OFF this list; the clone still gets its own explicit guard below.
UNPROTECTED = {
    # Scratch/throwaway targets ONLY. A workflow listed here can be PUT to with no
    # --i-know-this-is-live and with --yes (non-interactive). Never add anything a
    # customer message can reach: the entry must be INACTIVE and have no live caller.
    "SEqUDO7tpmtNdeDb",  # zz-DEPLOY-SANDBOX sorento-consume-main (inactive, 0 callers, created 2026-08-23)
}

# Purely cosmetic — labels a few well-known ids in gate (d)'s message so an operator recognizes
# what they're about to touch. Never used to decide allow/deny; that's UNPROTECTED (above) and
# CLONE_GUARD_ID (below) only.
KNOWN_ID_LABELS = {
    "9qVyfUxmRQqrpGRMDLRuz": "LIVE spine sorento-consume-main",
    "XTODTw-dJcV0uRdC056hG": "LIVE parser sub-semantic-parser",
    "aoydkG1dbItXR5jXFEQsP": "LIVE sub-sendmsg",
    "rrYXzE61gCNUck_zmXe-G": "LIVE sub-human-intervention",
    "UrETd-jm46tFj3Xw7w8vL": "LIVE sub-save-message-redis",
    "Fss5aAaXthJSWpZCgKiKR": "LIVE sub-get-results (MCP read)",
    "tWP33QOFT7SxThfT": "LIVE sub-get-rag (pgvector)",
    "rysSPgUssLDf6xJc": "sub-get-results TEST (carries LIVE's main CRM read path — see CLAUDE.md)",
}

# Never PUT here without --target-override (another person's active build).
CLONE_GUARD_ID = "txiPzSxy3Pclsz6v"
CLONE_GUARD_NAME = "clone-sorento-consume-main-TEST (someone else's active build)"

# --- PAYLOAD_GATE_SKIP (captain's decision, 2026-08-24) -----------------------------------------
# Gate (f2) started refusing the parser FORK wI5RkNGW3EOJfBdo with 8 violations (is_test on 2
# nodes, mock_reformulator_output on 3, n8n_test plus the n8n_test-db credential on Postgres Chat
# Memory, and the mock-reformulator-output node name) — every one of them correct and intended,
# because the fork's scaffolding IS its containment, exactly like the clone's. But it isn't the
# clone, and it isn't a scratch/throwaway either, so neither existing skip fit it.
#
# This is a SEPARATE set from UNPROTECTED, not an addition to it, because UNPROTECTED also governs
# gate (d): an id there gets BOTH no --i-know-this-is-live requirement AND a working --yes
# (non-interactive PUT). Putting a fork here would have quietly handed it unattended writes too.
# PAYLOAD_GATE_SKIP affects gate (f2) ONLY (see payload_gate_profile() below) — every id in it
# still needs --i-know-this-is-live at gate (d) and still gets gate (d)'s interactive "y" at (h);
# --yes is still refused for it. It stops being asked, at (f2) only, to prove it carries no test
# scaffolding — because carrying it is the entire reason it exists.
#
# ADMISSION CRITERIA — all three, checked against export/<slug>/workflow.json (never the live API,
# so the answer can't drift from the bytes actually being deployed):
#   1. it is a FORK / TEST-rebase of a shared sub (its own export legitimately fails the generic
#      profile on is_test / mock_* / n8n_test-db scaffolding that IS its containment — the same
#      reasoning as the CLONE_GUARD_ID skip above, LESSONS #16/#17), not a slug anyone publishes,
#      monitors, or treats as production;
#   2. EVERY caller of it — found by grepping every export/*/workflow.json for its id — is itself a
#      test artifact (the TEST clone, another fork, a disposable throwaway), never the live spine
#      and never an id PAYLOAD_GATE_PROFILES treats as live;
#   3. it currently FAILS the generic gate (f2) profile. If it already passes clean there is
#      nothing here to skip, and adding it anyway would only widen the blind spot for no benefit.
PAYLOAD_GATE_SKIP = {
    # sub-semantic-parser FORK domain-continuity-carry. Callers (export/*/workflow.json, grepped
    # for this id): the TEST clone (txiPzSxy3Pclsz6v) and zz-THROWAWAY-dym-probe-fail (DISPOSABLE,
    # Es4WwjMHOEy9j62V — not exported, no live workflow calls it). Fails generic today with 8
    # violations (is_test x2, mock_reformulator_output x3, n8n_test + n8n_test-db credential on
    # Postgres Chat Memory, mock-reformulator-output node name) — see the fix commit for the run.
    "wI5RkNGW3EOJfBdo": "sub-semantic-parser FORK domain-continuity-carry",
    # sub-human-intervention TEST (delta3). Callers (export/*/workflow.json, grepped for this id):
    # the TEST clone, fork-promo-picker-spine (RnpxEnAV3g20MmKj — itself a fork, not live), and the
    # disposable throwaway. Fails generic today with 3 violations: is_test on 2 nodes (When
    # Executed by Another Workflow, test-guard) and the test:egress: token on test-guard-record.
    "vUfFUDjLAuMaeQE6": "sub-human-intervention FORK (delta3)",
}
# NOT added: t4QvrtrPnTwRU6br (sub-get-results CS-BUILD). Callers verified the same way — the TEST
# clone and fork-promo-picker-spine, same test-only shape as the two above — but it currently
# PASSES the generic profile with 0 violations (confirmed by running promotion-safety-check.py
# against export/sub-get-results-CS-BUILD/: 1 credential-bearing node, its own openAiApi cred,
# no is_test/mock/n8n_test hits). Criterion 3 fails: there is nothing failing to skip today, so
# admitting it would only remove a check that currently costs it nothing and might catch something
# real later. If a future edit gives it genuine test scaffolding, let gate (f2) name the specific
# violations when that happens, and reconsider adding it then — same as the two above were added.

SETTINGS_STRIP_KEYS = {"binaryMode", "timeSavedMode"}  # LESSONS #55


def utc_stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def hr(title):
    print(f"\n--- {title} " + "-" * max(1, 60 - len(title)))


# ------------------------------------------------------------------ gate a --
def gate_a(slug, allow_dirty):
    export_path = str(EXPORT / slug)
    tests_path = str(ROOT / "tests")
    # S10 misc (reviewer): this used to check only export/<slug>/ + tests/ — an uncommitted edit
    # to deploy.py or assemble.py THEMSELVES (scripts/) could change what actually gets assembled
    # and PUT without ever being reviewed or committed, and this gate would say "clean" the whole
    # time. scripts/ covers deploy.py, assemble.py, and everything else that runs during a deploy.
    scripts_path = str(ROOT / "scripts")
    res = subprocess.run(
        ["git", "status", "--porcelain", "--", export_path, tests_path, scripts_path],
        cwd=REPO_ROOT, capture_output=True, text=True)
    dirty = res.stdout.strip()
    if not dirty:
        return True, f"(a) OK — git clean under export/{slug}/, tests/, and scripts/"
    if allow_dirty:
        lines = "\n".join(f"        {l}" for l in dirty.splitlines())
        return True, (f"(a) ⚠️  DIRTY under export/{slug}/, tests/, or scripts/ — proceeding anyway "
                       f"(--allow-dirty). UNCOMMITTED CHANGES ARE ABOUT TO BE DEPLOYED:\n{lines}")
    lines = "\n".join(f"        {l}" for l in dirty.splitlines())
    return False, (f"(a) FAIL — uncommitted changes under export/{slug}/, tests/, or scripts/ "
                    f"(commit first, or pass --allow-dirty):\n{lines}")


# ------------------------------------------------------------------ gate b --
def gate_b():
    env = os.environ.copy()
    env["REQUIRE_FULL_COVERAGE"] = "1"
    res = subprocess.run(["npm", "test"], cwd=REPO_ROOT, capture_output=True,
                          text=True, env=env)
    out = res.stdout + res.stderr
    import re
    tests = sum(int(n) for n in re.findall(r"# tests (\d+)", out))
    passed = sum(int(n) for n in re.findall(r"# pass (\d+)", out))
    failed = sum(int(n) for n in re.findall(r"# fail (\d+)", out))
    tally = f"{passed}/{tests} passed, {failed} failed"
    if res.returncode != 0:
        tail = "\n".join(out.splitlines()[-40:])
        return False, f"(b) FAIL — `npm test` exit {res.returncode} ({tally}):\n{tail}"
    return True, f"(b) OK — `npm test` REQUIRE_FULL_COVERAGE=1: {tally}"


# ------------------------------------------------------------------ gate c --
def gate_c(base, key, slug, src_id, to_id, manifest):
    if to_id == src_id:
        try:
            live = ew.fetch(base, key, to_id)
        except urllib.error.HTTPError as e:
            return False, f"(c) FAIL — GET {to_id} failed: HTTP {e.code}", None
        exp_v, live_v = manifest.get("versionId"), live.get("versionId")
        if exp_v != live_v:
            return False, (f"(c) FAIL — export/{slug} is STALE: export versionId "
                            f"{exp_v} vs live {live_v}. Re-run export-workflows.py."), None
        return True, (f"(c) OK — export/{slug} matches live versionId "
                       f"{str(live_v)[:8]} (own-id deploy)"), live
    # S10 misc (reviewer): this used to only check the TARGET on a retarget — nothing verified the
    # SOURCE export/<slug>/ itself wasn't stale against the workflow it was pulled FROM (src_id).
    # A stale export deployed onto a *different* target still silently propagates stale bytes; the
    # own-id branch above already runs exactly this check, a retarget needs the same one.
    try:
        src_live = ew.fetch(base, key, src_id)
    except urllib.error.HTTPError as e:
        return False, f"(c) FAIL — GET source {src_id} failed: HTTP {e.code}", None
    exp_v, src_live_v = manifest.get("versionId"), src_live.get("versionId")
    if exp_v != src_live_v:
        return False, (f"(c) FAIL — export/{slug} is STALE vs its OWN source {src_id}: export "
                        f"versionId {exp_v} vs live {src_live_v}. Re-run export-workflows.py "
                        f"before retargeting it onto {to_id}."), None
    try:
        target = ew.fetch(base, key, to_id)
    except urllib.error.HTTPError as e:
        return False, f"(c) FAIL — GET {to_id} failed: HTTP {e.code}", None
    v, av = target.get("versionId"), target.get("activeVersionId")
    # A workflow that has NEVER been published reports activeVersionId None while still
    # carrying a versionId. That is not an unpublished draft — there is no published
    # version to overwrite, so there is nothing to clobber. Only treat it as a draft
    # when something HAS been published and the draft has since moved past it.
    # (Found 2026-08-23 on the first real deploy, against a freshly POSTed scratch clone.)
    if av is None and not target.get("active"):
        print(f"  (c) NOTE — target {to_id} has never been published "
              f"(activeVersionId None, active False); no published version to overwrite.")
    elif v != av:
        return False, (f"(c) FAIL — target {to_id} ('{target.get('name')}') has an "
                        f"UNPUBLISHED DRAFT: versionId {v} != activeVersionId {av}. "
                        f"A deploy now would overwrite work not yet published. "
                        f"Publish or resolve it first."), None
    return True, (f"(c) OK — export/{slug} matches its own source {src_id} "
                   f"({str(src_live_v)[:8]}); target {to_id} '{target.get('name')}' "
                   f"({len(target.get('nodes', []))} nodes) draft==active "
                   f"({str(v)[:8]}) — retargeting export/{slug} onto it"), target


# ------------------------------------------------------------------ gate c2 (S10a, reviewer) --
# TOCTOU: gate (c) reads the target's versionId ONCE, early — then gate (b)'s `npm test` run, the
# gate (h) diff, and (unless --yes) an interactive `input()` prompt all elapse before the PUT.
# n8n's PUT is a BLIND OVERWRITE (no If-Match / version precondition on the API), so anyone else's
# write to this SAME target workflow in that window is silently clobbered with no error and no
# trace beyond "well, gate (c) passed". Re-fetch the target immediately before the PUT and abort if
# its versionId moved since gate (c) — this is the same read-only GET gate (c) already does, just
# repeated at the moment that actually matters.
def gate_c2_recheck(base, key, to_id, expected_version_id):
    try:
        target = ew.fetch(base, key, to_id)
    except urllib.error.HTTPError as e:
        return False, f"(c2) FAIL — re-GET {to_id} failed: HTTP {e.code}", None
    now_v = target.get("versionId")
    if now_v != expected_version_id:
        return False, (f"(c2) FAIL — target {to_id} CHANGED since gate (c): versionId was "
                        f"{expected_version_id}, is now {now_v}. Someone else wrote to this "
                        f"workflow while this deploy was running. Re-run deploy.py from scratch "
                        f"(re-review the new state before overwriting it)."), target
    return True, f"(c2) OK — target {to_id} unchanged since gate (c) ({str(now_v)[:8]})", target


# ------------------------------------------------------------------ gate d --
# ids known (via KNOWN_ID_LABELS, purely a display aid elsewhere) to be a LIVE workflow — used
# ONLY for the src-is-live-onto-clone hard refusal below, never for the allow/deny decision itself
# (that's UNPROTECTED).
_LIVE_LABELED_IDS = {i for i, label in KNOWN_ID_LABELS.items() if label.startswith("LIVE")}


def gate_d(to_id, i_know_this_is_live, target_override, yes, src_id=None):
    # S10 misc (reviewer): never let a slug whose own export was pulled from a LIVE workflow get
    # PUT onto the TEST clone — that would replace the fail-closed clone's topology with live's,
    # defeating every containment property CLAUDE.md documents for it (is_test guards, forked
    # subs, orphaned sends, ...). Hard refusal: no flag overrides this, unlike the other clone
    # guard below (which is about someone else's WORK, not about smuggling live topology in).
    if to_id == CLONE_GUARD_ID and src_id in _LIVE_LABELED_IDS:
        return False, (f"(d) FAIL — refusing to PUT a LIVE-sourced export ({src_id}, "
                        f"{KNOWN_ID_LABELS.get(src_id)}) onto the TEST clone {to_id}. This would "
                        f"replace the fail-closed clone's own topology with live's. No flag "
                        f"overrides this — deploy a genuine clone-slug export instead.")
    if to_id == CLONE_GUARD_ID:
        # The clone gets its OWN override (--target-override), not --i-know-this-is-live — it
        # isn't "live" (the whole reason UNPROTECTED/i_know_this_is_live exist), it's someone
        # else's in-progress build. Handled here, standalone, so it does NOT also fall into the
        # generic "not in UNPROTECTED -> needs --i-know-this-is-live" branch below.
        if not target_override:
            return False, (f"(d) FAIL — {to_id} is {CLONE_GUARD_NAME}. "
                            f"Pass --target-override to override.")
    elif to_id not in UNPROTECTED and not i_know_this_is_live:
        label = KNOWN_ID_LABELS.get(to_id, "not on the UNPROTECTED allowlist")
        return False, (f"(d) FAIL — {to_id} ({label}) is not in UNPROTECTED. "
                        f"Pass --i-know-this-is-live to override.")
    # S10b (reviewer): promotion stays USER-GATED per CLAUDE.md's HARD SAFETY RULE — --yes (skip
    # the interactive confirm at gate (h)) is only for a target this script already considers safe
    # by default (UNPROTECTED). Anything else — meaning anything requiring --i-know-this-is-live or
    # --target-override to even reach here — still needs the interactive "y" at gate (h); no
    # combination of flags makes an unattended write to it possible.
    if to_id not in UNPROTECTED and yes:
        return False, (f"(d) FAIL — {to_id} is not in UNPROTECTED; --yes (non-interactive) is "
                        f"refused for it. Promotion to anything but a known-safe scratch id stays "
                        f"user-gated — drop --yes and confirm interactively at gate (h).")
    note = ""
    if to_id in UNPROTECTED:
        note = "  (UNPROTECTED — no live/clone acknowledgment needed)"
    elif to_id == CLONE_GUARD_ID:
        note = "  ⚠️  DEPLOYING TO SOMEONE ELSE'S CLONE — --target-override acknowledged."
    else:
        note = f"  ⚠️  DEPLOYING TO {KNOWN_ID_LABELS.get(to_id, to_id)} — --i-know-this-is-live acknowledged."
    return True, f"(d) OK — {to_id} not blocked.{note}"


# ------------------------------------------------------------------ gate e --
def gate_e(target_wf, to_id):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    vid = target_wf.get("versionId") or "unknown"
    path = BACKUP_DIR / f"{to_id}-{vid}-{utc_stamp()}.json"
    path.write_text(json.dumps(target_wf, indent=2, sort_keys=True) + "\n")
    return path


# ------------------------------------------------------------------ gate f --
def build_put_body(assembled_wf, target_wf):
    settings = dict(assembled_wf.get("settings") or {})
    stripped = [k for k in SETTINGS_STRIP_KEYS if k in settings]
    for k in stripped:
        settings.pop(k, None)
    body = {
        "name": target_wf.get("name"),          # target's CURRENT name — never source's
        "nodes": assembled_wf.get("nodes"),      # node ids pass through UNCHANGED (see module docstring)
        "connections": assembled_wf.get("connections"),
        "settings": settings,
    }
    return body, stripped


# ----------------------------------------------------------------- gate f2 --
# The PAYLOAD gate (scripts/promotion-safety-check.py, commit 27f8d06). Every other gate here asks
# "is the operator allowed to write there, and is the export fresh?" — not one asks "is this thing
# safe to BE live?". It is placed AFTER (f) because (f) is where assemble.py folds nodes/*.js in
# and build_put_body strips settings, so this inspects the exact bytes that ship; and BEFORE (h)
# because (h) is the interactive confirm, and a refusal must land before the operator is asked
# anything.
#
# The profile is chosen by TARGET id, not by source slug: the question is "is this body safe to be
# live AS <target>", and only the target knows what shape production has there.
PAYLOAD_GATE_PROFILES = {
    "9qVyfUxmRQqrpGRMDLRuz": "live-spine",
    "XTODTw-dJcV0uRdC056hG": "live-parser",
}


def payload_gate_profile(to_id):
    """The promotion-safety-check profile for this target, or None to SKIP the gate entirely.

    THE INVERSION: a deploy ONTO the TEST clone must skip. The clone is legitimately full of test
    scaffolding — that scaffolding IS its containment (LESSONS #16/#17: orphaned egress nodes,
    is_test on every shared-sub call, the n8n_test session copy). Gating it would refuse the
    clone's own routine redeploy with ~110 violations and make this tool unusable for daily work,
    and a tool that must be bypassed daily teaches the operator to bypass it (LESSONS #82).

    The skip set is the clone plus UNPROTECTED — read, never modified, so it cannot drift out of
    step: UNPROTECTED is by definition "scratch/throwaway targets, inactive, no live caller", and
    a scratch target added there later inherits the skip without anyone remembering to.

    A THIRD, separate skip applies here too: PAYLOAD_GATE_SKIP (above). Unlike UNPROTECTED it does
    NOT touch gate (d) — an id there still needs --i-know-this-is-live and still gets gate (d)'s
    interactive confirm; --yes is still refused for it. It is a verified test-artifact FORK (see
    PAYLOAD_GATE_SKIP's admission criteria) that is legitimately full of the same kind of
    scaffolding as the clone, just not the clone itself and not a throwaway scratch id.

    Everything else gets `generic`, which refuses only unambiguous scaffolding."""
    if to_id == CLONE_GUARD_ID or to_id in UNPROTECTED or to_id in PAYLOAD_GATE_SKIP:
        return None
    return PAYLOAD_GATE_PROFILES.get(to_id, "generic")


def gate_f2(put_body, to_id):
    """Returns (ok, message, violations, warnings). violations is empty unless ok is False."""
    profile = payload_gate_profile(to_id)
    if profile is None:
        if to_id == CLONE_GUARD_ID:
            why = "the TEST clone — its test scaffolding IS its containment"
        elif to_id in PAYLOAD_GATE_SKIP:
            why = (f"a verified test artifact ({PAYLOAD_GATE_SKIP[to_id]}) — its test scaffolding "
                   f"IS its containment, same as the TEST clone (see PAYLOAD_GATE_SKIP); gate (d) "
                   f"still applies in full, this only skips (f2)")
        else:
            why = "on the UNPROTECTED scratch allowlist"
        return True, (f"(f2) SKIPPED — {to_id} is {why}; a payload gate here would refuse "
                      f"its own routine redeploy."), [], []
    _counts, bindings, violations, warnings = psc.run_against(put_body, profile)
    if violations:
        return False, (f"(f2) FAIL — {len(violations)} payload violation(s) under profile "
                       f"'{profile}'. This body is a TEST artifact, not a production one."), \
            violations, warnings
    warn_note = f", {len(warnings)} warning(s)" if warnings else ""
    return True, (f"(f2) OK — payload clean under profile '{profile}': all 10 checks pass "
                  f"({len(put_body.get('nodes', []))} nodes, {len(bindings)} credential-bearing"
                  f"{warn_note})."), [], warnings


# ------------------------------------------------------------------ gate h --
def compute_diff(assembled_nodes, target_nodes):
    a_by_name = {n["name"]: n for n in assembled_nodes}
    t_by_name = {n["name"]: n for n in target_nodes}
    added = sorted(set(a_by_name) - set(t_by_name))
    removed = sorted(set(t_by_name) - set(a_by_name))
    common = sorted(set(a_by_name) & set(t_by_name))

    def norm(n):
        d = {k: v for k, v in n.items() if k not in ("id", "position")}
        return json.dumps(d, sort_keys=True, default=str)

    changed, jscode_changed = [], []
    for name in common:
        a, t = a_by_name[name], t_by_name[name]
        a_js = (a.get("parameters") or {}).get("jsCode")
        t_js = (t.get("parameters") or {}).get("jsCode")
        if (a_js is not None or t_js is not None) and a_js != t_js:
            a_sha = hashlib.sha256((a_js or "").encode()).hexdigest()[:12]
            t_sha = hashlib.sha256((t_js or "").encode()).hexdigest()[:12]
            jscode_changed.append((name, t_sha, a_sha))
        if norm(a) != norm(t):
            changed.append(name)
    return {"added": added, "removed": removed, "changed": sorted(changed),
            "jscode_changed": jscode_changed, "common_count": len(common)}


def print_diff(diff):
    print(f"  common nodes: {diff['common_count']}   "
          f"added: {len(diff['added'])}   removed: {len(diff['removed'])}   "
          f"changed: {len(diff['changed'])}")
    for n in diff["added"]:
        print(f"    + {n}")
    for n in diff["removed"]:
        print(f"    - {n}")
    for n in diff["changed"]:
        print(f"    ~ {n}")
    if diff["jscode_changed"]:
        print("  jsCode sha changes:")
        for name, before, after in diff["jscode_changed"]:
            print(f"    ~ {name}: {before} -> {after}")


# ------------------------------------------------------------------ gate i --
def do_put(base, key, to_id, put_body):
    data = json.dumps(put_body).encode()
    req = urllib.request.Request(
        f"{base}/workflows/{to_id}", data=data, method="PUT",
        headers={"X-N8N-API-KEY": key, "Content-Type": "application/json",
                 "User-Agent": "curl/8.4.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, json.loads(r.read())


def rollback_command(backup_path, to_id):
    return f"python3 n8n-workflows-init/scripts/deploy.py --rollback {backup_path} --to {to_id}"


# ---------------------------------------------------------------- runners --
def do_deploy(args):
    slug = args.slug
    to_id = args.to
    export_dir = EXPORT / slug
    manifest_path = export_dir / "MANIFEST.json"
    if not manifest_path.exists():
        sys.exit(f"no such export: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    src_id = manifest["id"]

    print(f"=== deploy.py: {slug} -> {to_id} ==={' [DRY RUN]' if args.dry_run else ''}")

    base, key = ew.env()

    hr("gate (a) git clean")
    ok, msg = gate_a(slug, args.allow_dirty)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (b) npm test")
    ok, msg = gate_b()
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (c) freshness")
    ok, msg, target_wf = gate_c(base, key, slug, src_id, to_id, manifest)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (d) target safety")
    ok, msg = gate_d(to_id, args.i_know_this_is_live, args.target_override, args.yes, src_id=src_id)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (e) backup")
    backup_path = gate_e(target_wf, to_id)
    print(f"  (e) OK — backup written -> {backup_path}")

    hr("gate (f) assemble + PUT body")
    try:
        assembled_wf, _stats = asm.assemble(slug, strip=True)
    except asm.AssembleError as e:
        sys.exit(f"  (f) FAIL — {e}")
    put_body, stripped_settings = build_put_body(assembled_wf, target_wf)
    print(f"  (f) OK — name='{put_body['name']}' (target's current name), "
          f"{len(put_body['nodes'])} nodes (ids pass through unchanged), "
          f"settings stripped: {stripped_settings or '(none)'}")

    hr("gate (f2) payload safety")
    ok, msg, violations, warnings = gate_f2(put_body, to_id)
    print(f"  {msg}")
    if not ok:
        print()
        psc.print_violations(violations, warnings)
        print("\n  Do NOT promote. Fix every line above, or deploy a different export.")
        sys.exit(1)

    hr("gate (g) credentials")
    print("  (g) OK — credentials passed through UNCHANGED "
          "(source and target are the same n8n instance; no remap needed)")

    hr("gate (h) diff vs target + confirm")
    diff = compute_diff(put_body["nodes"], target_wf.get("nodes", []))
    print_diff(diff)

    body_bytes = json.dumps(put_body).encode()
    sha = hashlib.sha256(body_bytes).hexdigest()
    print(f"\n  PUT body: {len(body_bytes)} bytes, sha256={sha}")

    if args.dry_run:
        print("\n=== DRY RUN: gates (a)-(h) complete. Stopping before gate (i) PUT. "
              "No write performed. ===")
        return

    if not args.yes:
        ans = input(f"\nProceed with PUT to {to_id}? [y/N] ").strip().lower()
        if ans != "y":
            print("aborted.")
            sys.exit(1)

    hr("gate (c2) freshness re-check (TOCTOU)")
    ok, msg, _recheck_wf = gate_c2_recheck(base, key, to_id, target_wf.get("versionId"))
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    # S10a (reviewer): print the rollback command BEFORE the PUT, not after — `do_put` raising
    # (an HTTPError, a network blip) previously skipped this line entirely, leaving no rollback
    # command printed for a PUT that may or may not have partially landed. The backup file it
    # points at was already written in gate (e), long before this point.
    print(f"\nRollback command (save this BEFORE the PUT, in case it fails partway):\n  {rollback_command(backup_path, to_id)}")

    hr("gate (i) PUT")
    status, resp = do_put(base, key, to_id, put_body)
    print(f"  PUT {to_id}: HTTP {status}")
    if to_id == src_id:
        # The message always said "for this slug"; the invocation never passed one, so
        # export-workflows.py iterated its whole TARGETS map and rewrote workflow.json,
        # nodes/*.js, TOPOLOGY.md and MANIFEST.json for all 21 slugs from the bytes on live —
        # overwriting any OTHER slug's staged, undeployed edits. It silently reverted work four
        # times on 2026-08-24, twice into a commit (git scar dc8d5c7 "restore the axis split the
        # clone re-export reverted"). Worst on a two-target promotion: deploy A, B's staged body
        # is reverted before B is deployed, and gate (a) then reports a clean tree because the
        # working copy matches live again. Name the slug — and only the slug.
        print(f"  re-running export-workflows.py + --verify for {slug} ONLY ...")
        subprocess.run([sys.executable, str(SCRIPT_DIR / "export-workflows.py"), slug],
                        cwd=REPO_ROOT)
        subprocess.run([sys.executable, str(SCRIPT_DIR / "export-workflows.py"), "--verify", slug],
                        cwd=REPO_ROOT)
    print(f"\nRollback command:\n  {rollback_command(backup_path, to_id)}")


def do_rollback(args):
    to_id = args.to
    backup_path = pathlib.Path(args.rollback)
    if not backup_path.exists():
        sys.exit(f"no such backup file: {backup_path}")
    backup_wf = json.loads(backup_path.read_text())

    print(f"=== deploy.py --rollback {backup_path} -> {to_id} ==="
          f"{' [DRY RUN]' if args.dry_run else ''}")

    base, key = ew.env()

    hr("gate (d) target safety")
    ok, msg = gate_d(to_id, args.i_know_this_is_live, args.target_override, args.yes)
    print(f"  {msg}")
    if not ok:
        sys.exit(1)

    hr("gate (e) backup (of CURRENT target state, before rollback overwrites it)")
    try:
        target_wf = ew.fetch(base, key, to_id)
    except urllib.error.HTTPError as e:
        sys.exit(f"  (e) FAIL — GET {to_id} failed: HTTP {e.code}")
    backup_path2 = gate_e(target_wf, to_id)
    print(f"  (e) OK — pre-rollback backup written -> {backup_path2}")

    settings = dict(backup_wf.get("settings") or {})
    stripped = [k for k in SETTINGS_STRIP_KEYS if k in settings]
    for k in stripped:
        settings.pop(k, None)
    put_body = {
        "name": target_wf.get("name"),
        "nodes": backup_wf.get("nodes"),
        "connections": backup_wf.get("connections"),
        "settings": settings,
    }
    print(f"  settings stripped: {stripped or '(none)'}")

    hr("gate (h) diff vs current target + confirm")
    diff = compute_diff(put_body["nodes"], target_wf.get("nodes", []))
    print_diff(diff)

    body_bytes = json.dumps(put_body).encode()
    sha = hashlib.sha256(body_bytes).hexdigest()
    print(f"\n  PUT body: {len(body_bytes)} bytes, sha256={sha}")

    if args.dry_run:
        print("\n=== DRY RUN: rollback gates (d)/(e)/(h) complete. Stopping before "
              "gate (i) PUT. No write performed. ===")
        return

    if not args.yes:
        ans = input(f"\nProceed with ROLLBACK PUT to {to_id}? [y/N] ").strip().lower()
        if ans != "y":
            print("aborted.")
            sys.exit(1)

    hr("gate (i) PUT")
    status, resp = do_put(base, key, to_id, put_body)
    print(f"  PUT {to_id}: HTTP {status}")
    print(f"\nIf this target has its own export/ slug, re-run export-workflows.py for it.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", nargs="?", help="export/<slug> directory name "
                                             "(omit with --rollback)")
    ap.add_argument("--to", required=True, help="target n8n workflow id")
    ap.add_argument("--dry-run", action="store_true",
                     help="run gates (a)-(h), print the PUT body summary, stop before (i)")
    ap.add_argument("--yes", action="store_true", help="skip the interactive confirm at gate (h)")
    ap.add_argument("--allow-dirty", action="store_true",
                     help="proceed past gate (a) despite uncommitted changes (loud warning)")
    ap.add_argument("--i-know-this-is-live", action="store_true",
                     help="required to target a PROTECTED live id")
    ap.add_argument("--target-override", action="store_true",
                     help="required to target the TEST clone txiPzSxy3Pclsz6v")
    ap.add_argument("--rollback", metavar="BACKUP_FILE",
                     help="PUT a previously-saved tests/backups/*.json back onto --to "
                          "(gates d/e/h only)")
    args = ap.parse_args()

    if args.rollback:
        do_rollback(args)
        return

    if not args.slug:
        ap.error("slug is required unless --rollback is given")
    do_deploy(args)


if __name__ == "__main__":
    main()
