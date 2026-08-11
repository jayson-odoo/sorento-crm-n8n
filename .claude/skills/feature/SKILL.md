---
name: feature
description: Run a non-trivial n8n chatbot change through this repo's mandatory pipeline — scope, verify-then-read, grill, plan, UAC, tickets, clone build, offline probe, live-run test, review, user-gated promote — invoking the mattpocock skills and the sorento subagents at the slots where they belong. Use when starting any change that is more than a one-node tweak.
---

# /feature — the sorento_crm_n8n delivery pipeline

The sibling repo `sorento_crm` has a `PRINCIPLES.md` that its `/feature` executes. This repo has no
such file — **the binding contract is `CLAUDE.md` (safety rule, IDs, clone-vs-live) plus
`docs/LESSONS.md` (the numbered lessons)**. This skill executes that contract, calling the
`mattpocock-skills` plugin and the four `sorento-*` subagents as subroutines.

**The order is the point.** If a step genuinely cannot be done, say so explicitly and record why in
the plan — do not silently drop it.

## Four rules that override the plugin skills

The plugin was written for a normal application repo. Where it disagrees, this file wins.

1. **The live spine is never the build target.** `9qVyfUxmRQqrpGRMDLRuz` is edited only at step 9,
   by the user's explicit gate, from a diff built as LIVE + your own hunks. `/implement` and
   `sorento-coder` are barred from live (LESSONS §58a) — hand them the clone `txiPzSxy3Pclsz6v` or a
   named fork, never the feature end-to-end.
2. **Files are the source of truth; tickets are the queue.** `to-spec`/`to-tickets` want to publish
   the spec as a GitHub issue. Here the contract is `n8n-workflows-init/plans/<slug>-plan.md` plus
   the UAC family file in `n8n-workflows-init/tests/uac/<FAMILY>.md`. An issue that contradicts the
   UAC loses.
3. **There is no red-green TDD against a remote workflow, so `/tdd` does not drive step 7.** The
   equivalent is the **offline probe** (step 6) plus the **fail-on-purpose mutation** (§0 S9). Every
   assertion must be shown going red before a green from it is worth anything (LESSONS §61).
4. **Verify before you read.** Any export artifact read without a green
   `export-workflows.py --verify` is untrusted. This is why `normalized-workflows/` was deleted.

## Who executes each step (delegation is part of the order)

Every step has a named executor and a model tier. Running a step in the wrong seat is the same
process violation as skipping it. Deviations get recorded in the plan.

- **Main session** (holds the grill context and every user-in-the-loop moment): steps 0–5
  (verify-then-read, journey, grill, plan, UAC, plan review, tickets), step 9 promote, step 10
  banking, and all orchestration. **Planning is NOT delegated for normal changes** — the grill
  context dies at the subagent boundary, and a plan written without it re-asks questions you
  already answered. For steps 2–4 switch the main model to **Fable** (`/model`), then switch back
  before step 6; the reasoning tiers differently for design than for execution.
- **`sorento-planner`** (`model: fable`): module-sized work ONLY, where independent sub-plans can
  be charted in parallel. Not the default seat for step 3.
- **`sorento-coder`** (`model: opus`): step 6, offline probe + clone build. Never live (LESSONS §58a).
- **`sorento-tester`** (`model: sonnet`): step 7, UAC run against the clone. Asserts against UAC ids.
- **`sorento-reviewer`** (`model: opus`) + `/code-review`: step 8. Then `/codex-review` (OpenAI
  model family, second opinion) on anything headed for live.
- **Codex** (`codex exec --sandbox read-only`): reviewer only, never an executor. It reads the
  exported files; it has no path to the remote instance, the CRM, or `n8n_test`.
- Trivial one-node tweaks may run inline in the main session — say so, instead of silently
  absorbing a real slice.

## The pipeline

### Step 0 — Scope check

Module-sized (more than one agent session can hold — a new domain, a cross-workflow contract)? Run
`/wayfinder` first to chart the unknowns as investigation tickets. Otherwise go to step 1.

### Step 1 — Verify, then read (never skip; it is ~2 minutes)

```bash
python3 n8n-workflows-init/scripts/export-workflows.py --verify   # exits 1 loudly if stale
```

Then read, in this order and no further:

- `CLAUDE.md` + `docs/LESSONS.md`
- `export/<slug>/TOPOLOGY.md` — edges, **read-BY-NAME map**, orphans, sub-calls, code inventory.
  12 KB, 46× smaller than the 444 KB blob. Answers most structural questions.
- `export/<slug>/nodes/*.js` for the bodies you will touch
- `tests/uac/00-SAFETY-always-read.md` (§0) + the one relevant `tests/uac/<FAMILY>.md`

**Never** the 444 KB `workflow.json` wholesale, and **never** the 3,986-line `tests/UAC.md` monolith.
`get_workflow_details` only for something the export genuinely lacks. This step exists because the
measured bottleneck is agent reading, not the remote calls (LESSONS §62).

### Step 2 — Journey, then grill

Write the turn before naming a node: what the customer types, what the parser must emit, which branch
fires, what the renderer puts **on the customer boundary**, and what state carries to the next turn.
A plan whose first section is a node list is rejected.

- Domain surface (new terms, glossary, product-description search) → `/grill-with-docs`; it writes
  ADRs into `docs/adr/`. Note `CONTEXT.md` models **only** spec-search — for anything else the domain
  authority is `CLAUDE.md` + `docs/LESSONS.md`.
- Pure flow/UX question → `/grilling`.

### Step 3 — Plan + UAC (main session; `sorento-planner` only if module-sized)

Write these yourself, in the session that ran the grill. Spawn `sorento-planner` only when the work
is module-sized and splits into independent sub-plans that can be charted in parallel.

- Plan: `n8n-workflows-init/plans/<slug>-plan.md` — measured baselines first (drive the clone in
  `uac` mode with `previous_conversation_state: {}`; uac mode otherwise reads 437264483's stale prod
  session), then the design, then the promote order.
- UAC: cases into `tests/uac/<FAMILY>.md`, each independently verifiable, ids stable. §0 safety
  applies to every case, always.
- `/to-spec` may draft both — redirect its output to these two files, do not let it publish an issue.

Defer-items go to the backlog plan files, not into scope.

### Step 4 — Review the plan

`/lavish` for the user to mark up, then `/grilling` the plan itself. Grill before code, always.

### Step 5 — Tickets

`/to-tickets` → GitHub issues on `jayson-odoo/sorento-crm-n8n`. Each body links its plan + UAC path;
slice ids match the plan's numbering.

### Step 6 — Offline probe FIRST, then build the clone (`sorento-coder`)

This is the step that replaces Phase-1/Phase-2 and where the speed comes from.

**The coder's prompt is paths only:** the plan path, the UAC family path, the slice id, and the
build target id (clone or named fork). The files are the contract — do not paraphrase them into the
prompt. A paraphrase is a second, unversioned spec, and when it drifts from the plan the coder
follows the paraphrase.

1. Pull the **real node body byte-exact** into `tests/offline/<slug>/` and drive it against pinned
   fixtures with a `*-probe.js`. No n8n, no network, seconds per iteration.
2. Reproduce the defect RED before fixing it. Record the before/after versionIds in the fixture
   names.
3. Write a `*-mutate.sh` that breaks each assertion on purpose — §0 **S9**. An assertion never shown
   red is not an instrument (LESSONS §61).
4. Derive fixtures from a **real execution's** state, never hand-synthesised (LESSONS §64) — a
   `sim-inject` fixture that omits `referenced_result_set` passes vacuously.
5. Only then PUT to the clone `txiPzSxy3Pclsz6v` (or the named fork), and snapshot the rev into
   `tests/manifests/<slug>/README.md`: versionId, per-node sha, node/credential counts, and the
   one-rev + all-revs `publish_workflow` rollback commands.

Know what the offline harness is **blind** to: it has no customer boundary, and it cannot see a
contract mismatch with the real CRM. **Offline probes prevent regressions; only real traffic finds
contract mismatches** — a wrong MCP *parameter name* is dropped silently and short-circuits to an
empty page without ever calling the backend, and looks perfect against synthetic envelopes.

**When a rendered string is wrong, `grep -rln "<the string the customer sees>"` beats graph
reasoning outright.** Measured twice: a did-you-mean contradiction had FOUR builder surfaces; three
were found by reasoning about inbound edges and the fourth — the one the customer actually saw — fell
out of one grep on the literal output text. Enumerate renderers by rendered string, always.

### Step 7 — Live-run test on the clone (`sorento-tester`)

Run the UAC family in `uac` mode. A remote turn is ~8 seconds — do not economise here, economise on
reading.

Assert:

- **per-node `runData`, never execution status** — an unwired `main[1]` on a `continueErrorOutput`
  node reports success while the customer gets a confidently wrong reply (LESSONS §61a).
- **at the customer boundary** — `save-session-vars.user_response` / the sendmsg payload. Enumerate
  renderers by **rendered string**, not by graph inbound.
- **zero egress** — the `test:egress:{test_run_id}` log, plus sink-delta with payload attribution.
  Do **not** use the LLEN gate on a shared prod list; it proves nothing.

### Step 8 — Review (`sorento-reviewer`)

Node-diff correctness + zero-egress re-confirmation + plan/UAC adherence → APPROVE or
REQUEST-CHANGES with a promote checklist. Run `/code-review` over the exported `nodes/*.js` as real
files for the code-quality axis.

Then, on **anything headed for live**, run `/codex-review` — a read-only `codex exec` pass over the
same exported files for a second opinion from a different model family. Its output is candidate
findings, verified against the real node body before they count; it cannot clear §0 (egress is
proven from the run log, not from static files) and it never bypasses `CLAUDE.md` or the UAC.

### Step 9 — Promote gate (user-gated, never assistant-initiated)

Preconditions, all of them:

1. Reviewer APPROVE, and the user has said go.
2. `versionId == activeVersionId` on every target — after **any** agent death, re-check and diff
   `.activeVersion.connections`; a killed agent can leave ACTIVE mutated while the draft looks clean.
3. Build the target as **LIVE + your own hunks, by node NAME** (clone↔live node ids diverge). Never
   block-copy the tested fork — drift bites in both directions (LESSONS §57).
4. Strip trailing whitespace (`sed -i '' -E 's/[[:space:]]+$//'`; verify `diff -w` empty +
   `node --check`) — the authoring channel right-trims and the byte gate will fail on inert bytes.
5. Per node: update draft → re-fetch → **byte-gate draft == file** → publish only on match → re-fetch
   active == file. Subs and the parser before the spine.
6. On a webhook-trigger workflow a REST PUT may return 409 while the write persists — judge by
   resulting state, not the HTTP code.

Record the rollback versionId in the manifests README before the first write. Then re-run
`export-workflows.py` and commit the exports.

### Step 10 — Bank the result

- Update `docs/LESSONS.md` with anything that cost time twice.
- Write/update a memory entry: what shipped, what the rollback is, what landmine bit.
- Record the agent wall-clocks against the baseline (planner ~27m, coder ~15m, tester ~48m, reviewer
  ~18m, 2026-08-04). If a change does not move them, stop building tooling.

## Skill map (quick reference)

| step | skill / agent | executor (model) |
| ---- | ------------- | ---------------- |
| 0 scope unknown | `/wayfinder` | main session |
| 1 verify-then-read | `export-workflows.py --verify` — manual, no skill | main session |
| 2 journey | manual — no skill | main session (Fable) |
| 2 grill | `/grill-with-docs` (spec-search domain) or `/grilling` | main session (Fable, user in loop) |
| 2b terms shifting | `/domain-modeling` | main session |
| 3 plan + UAC | `/to-spec` redirected to files | main session (Fable); `sorento-planner` (fable) only if module-sized |
| 4 plan review | `/lavish` then `/grilling` | main session (user in loop) |
| 5 tickets | `/to-tickets` | main session |
| 6 offline probe + clone build | — | `sorento-coder` (opus), paths-only prompt |
| 7 UAC run | — | `sorento-tester` (sonnet) |
| 8 review | `/code-review`, then `/codex-review` if promoting | `sorento-reviewer` (opus) + codex (OpenAI) |
| 9 promote | — | main session only, user-gated |
| bugs | `/triage` then `/diagnosing-bugs` | main session |
| research | `/research` | main session |

## Related

- `CLAUDE.md` — the safety rule, the IDs, clone-vs-live, the export contract
- `docs/LESSONS.md` — numbered lessons; §57 promote-as-hunks, §58 transport, §61 green-that-cannot-fail, §62 where the time actually goes
- `.claude/skills/codex-review/SKILL.md` — the cross-model second opinion used at step 8
- `n8n-workflows-init/tests/uac/00-SAFETY-always-read.md` — §0, mandatory for every case
- `docs/agents/` — issue tracker, triage labels, domain doc rules
